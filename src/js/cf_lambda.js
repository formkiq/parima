// CloudFormation Custom Resource for generating SSL Certificate in the us-east-1 region
var AWS = require('aws-sdk');
var lambda;
var s3;

module.exports.handler = async(event, context) => {
    
    console.log(JSON.stringify(event));
    var promises = [];
    var functionName;

    if (event.RequestType != null) {

        let region = event.ResourceProperties.Region;
        s3 = new AWS.S3();
        
        if (region != null) {
            lambda = new AWS.Lambda({region:region});
            console.log("using region: " + region);
        } else {
            lambda = new AWS.Lambda();
        }

        functionName = event.ResourceProperties.Role;
        var index = functionName.indexOf("/") + 1;
        functionName = functionName.substring(index).replace("Role-", "-");
        
        if (event.RequestType === 'Create') {
            var buffer = await getS3Object(event);
            var params = {
                Code: {
                    ZipFile: buffer
                },
                FunctionName: functionName, 
                Handler: event.ResourceProperties.Handler,
                MemorySize: event.ResourceProperties.MemorySize, 
                Publish: true, 
                Role: event.ResourceProperties.Role,
                Runtime: event.ResourceProperties.Runtime,
                Tags: {"Application":"Parima"}, 
                Timeout: event.ResourceProperties.Timeout
            };
        
            console.log("creating function " + functionName);
            promises.push(lambda.createFunction(params).promise());

        } else if (event.RequestType === 'Update') {
            console.log("updating function " + functionName);
            var buffer = await getS3Object(event);
            var params = {FunctionName: functionName, ZipFile: buffer};
            promises.push(lambda.updateFunctionCode(params).promise());

        } else if (event.RequestType === 'Delete') {
            console.log("deleting function " + functionName);
            promises.push(lambda.deleteFunction({FunctionName: functionName}).promise());
        }
    }

    return Promise.all(promises).then((data)=>{
        return event.RequestType != 'Delete' ? lambda.listVersionsByFunction({FunctionName: data[0].FunctionArn}).promise() : Promise.resolve({});
    }).then((data) => {
        let findlatest = event.RequestType != 'Delete' ? findLatest(data) : {};
        return sendResponse(event, context, 'SUCCESS', { 'FunctionName': findlatest.FunctionName, 'FunctionArnVersion': findlatest.FunctionArn, 'Version': findlatest.Version });
    }).catch(error => {
        console.log(error);
        return sendResponse(event, context, 'FAILED');
    });
};

function findLatest(data) {
    var picked = data.Versions.find(o => o.Version === '$LATEST');
    var versions = data.Versions.map(o => parseInt(o.Version) || 0);
    picked.Version = Math.max(...versions);
    picked.FunctionArn = picked.FunctionArn.replace("$LATEST", picked.Version);
    return picked;
}

async function getS3Object(event) {
    return new Promise((resolve, reject) => {
        if (event.ResourceProperties.Code.S3Bucket != null) {
            s3.getObject({Bucket: event.ResourceProperties.Code.S3Bucket, Key: event.ResourceProperties.Code.S3Key}, function(err, data) {
                // Handle any error and exit
                if (err) {
                    reject(err);
                } else {
                    resolve(data.Body);
                }
            });
        } else {
            var buf = Buffer.from(event.ResourceProperties.Code.ZipFile, 'base64');
            resolve(buf);
        }
    });
}
async function sendResponse (event, context, responseStatus, responseData) {
    var url = require('url');
    
    var responseBody = JSON.stringify({
        Status: responseStatus,
        Reason: 'See the details in CloudWatch Log Stream: ' + context.logStreamName,
        PhysicalResourceId: event.StackId + "-" + event.LogicalResourceId,
        StackId: event.StackId,
        RequestId: event.RequestId,
        LogicalResourceId: event.LogicalResourceId,
        Data: responseData
    });

    var parsedUrl = url.parse(event.ResponseURL);
    var options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port != null ? parsedUrl.port : 443,
        path: parsedUrl.path,
        method: 'PUT',
        headers: {
            'content-type': '',
            'content-length': responseBody.length
        }
    };

    var https = parsedUrl.protocol.includes("https") ? require('https') : require('http');

    const promise = new Promise(function(resolve, reject) {

        var req = https.request(options, (res) => {
            res.setEncoding("utf8");

            let body = "";
            res.on('data', (data) => {
                body += data;
            });

            res.on("end", () => {
                resolve([body, res.statusCode, res.headers]);
            });

        }).on('error', (e) => {
            resolve([{
                message: "Unable to send message"
            }, 502, null]);
        }).on('timeout', () => {
            resolve([{
                message: "Request has timed out"
            }, 502, null]);
        });

        req.write(responseBody);
        req.end();
    });
       
    return promise;
}