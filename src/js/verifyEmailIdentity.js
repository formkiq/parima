// CloudFormation Custom Resource for verifyEmailIdentity
const AWS = require('aws-sdk');
var ses = new AWS.SES();

module.exports.handler = async(event, context) => {
    console.log(JSON.stringify(event));

    var email = null;
    var oldemail = null;
    var requestType = event.RequestType;

    if (event.ResourceProperties != null) {
        email = event.ResourceProperties.Email;
    }

    if (event.OldResourceProperties != null) {
        oldemail = event.OldResourceProperties.Email;
    }

    if (requestType === 'Delete') {
        oldemail = event.ResourceProperties.Email;
        email = null;
    }

    return deleteIdentity(oldemail).then((data) => {
        return verifyEmailIdentity(email);
    }).then(() => {
        return sendResponse(event, context, 'SUCCESS', {});
    }).catch(error => {
        console.log(error);
        return sendResponse(event, context, 'FAILED');
    });
};

async function verifyEmailIdentity(email) {
    if (email != null) {
        return ses.verifyEmailIdentity({EmailAddress:email}).promise();
    } else {
        return Promise.resolve("");
    }        
}
async function deleteIdentity(email) {
    if (email != null) {
        return ses.deleteIdentity({Identity: email}).promise();
    } else {
        return Promise.resolve("");
    }
}

async function sendResponse (event, context, responseStatus, responseData) {
    var https = require('https');
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
        port: 443,
        path: parsedUrl.path,
        method: 'PUT',
        headers: {
            'content-type': '',
            'content-length': responseBody.length
        }
    }

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
            let text = JSON.stringify(e);
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