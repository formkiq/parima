const AWS = require('aws-sdk');
const https = require('https');
const fs = require('fs');
var s3 = new AWS.S3({apiVersion: '2006-03-01'});

module.exports.handler = async(event, context) => {

    var downloads = [];
    const urls = ["https://raw.githubusercontent.com/formkiq/parima/master/placeholder/index.html","https://raw.githubusercontent.com/formkiq/parima/master/placeholder/parima.png","https://raw.githubusercontent.com/formkiq/parima/master/placeholder/favicon.ico"];

    if (event.RequestType != null) {
    
        if (event.RequestType === 'Create') {
            for (let url of urls) {
                downloads.push(download(url));
            }
            
            return Promise.all(downloads).then(()=>{
                var uploads = [];
                for (let url of urls) {
                    uploads.push(upload(url));
                }
                
                return Promise.all(uploads);
            }).then(()=>{
                return sendResponse(event, context, 'SUCCESS', {});
            }).catch(error => { 
                console.log("error " + error);
                return sendResponse(event, context, 'FAILED');
            });
        } else {
            return sendResponse(event, context, 'SUCCESS', {});
        }
    }
};

async function upload(url) {
    const filename = url.split('/').pop();
    return new Promise((resolve, reject) => {
        console.log("Uploading " + filename + " to " + process.env.S3_BUCKET);
        let metaData = getContentTypeByFile(filename);
        let options = {
            Bucket: process.env.S3_BUCKET,
            Key   : process.env.WEBSITE_VERSION + "/" + filename,
            Body  : fs.createReadStream("/tmp/" + filename),
            ContentType: metaData
        };

        s3.putObject(options, function (err, data) {
            if (err) {
                console.log(err);
                resolve(err);
            } else {
                resolve(filename);
            }
        });
    });
}

async function download(url) {
    const filename = url.split('/').pop();
    const file = fs.createWriteStream("/tmp/" + filename);
    
    return new Promise((resolve, reject) => {
        const request = https.get(url, response => {
            if (response.statusCode === 200) {
                response.pipe(file);
            } else {
                file.close();
                resolve(`Server responded with ${response.statusCode}: ${response.statusMessage}`);
            }
        });
        
        request.on("error", err => {
            file.close();
            resolve(err.message);
        });

        file.on("finish", () => {
            console.log("downloaded " + url);
            resolve("downloaded " + url);
        });
    });
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

function getContentTypeByFile(fileName) {
var rc = 'application/octet-stream';
var fn = fileName.toLowerCase();

if (fn.indexOf('.html') >= 0) rc = 'text/html';
else if (fn.indexOf('.css') >= 0) rc = 'text/css';
else if (fn.indexOf('.json') >= 0) rc = 'application/json';
else if (fn.indexOf('.js') >= 0) rc = 'application/x-javascript';
else if (fn.indexOf('.png') >= 0) rc = 'image/png';
else if (fn.indexOf('.jpg') >= 0) rc = 'image/jpg';

return rc;
}