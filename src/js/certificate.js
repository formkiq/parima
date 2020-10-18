// CloudFormation Custom Resource for generating SSL Certificate in the us-east-1 region
const AWS = require('aws-sdk');
var acm = new AWS.ACM();
var route53 = new AWS.Route53();
var cloudformation = new AWS.CloudFormation();

const wait = interval => new Promise(resolve => setTimeout(resolve, interval));

module.exports.handler = async(event, context) => {
    console.log(JSON.stringify(event));
    if (event.RequestType != null) {

        let region = event.ResourceProperties.Region;
        if (region != null) {
            acm = new AWS.ACM({region:region});
            console.log("using region: " + region);
        }

        if (event.RequestType === 'Create') {
            let domainName = event.ResourceProperties.DomainName;
            let domainParts = domainName.split(".");
            let hostedZone = findHostedZoneFromString(domainName);

            return createCertificate(hostedZone, domainName).then((data) => {
                console.log("adding certificate verification DNS entries");
                return updateRoute53Retry(hostedZone, data.CertificateArn);
            }).then((certificate) => {
                console.log("waiting DNS to be updated so certificate can be validated");
                return waitForValidation(certificate);
            }).then((certificate)=>{
                console.log("certificate has been validated");
                return sendResponse(event, context, 'SUCCESS', { 'HostedZone': hostedZone, 'CertificateArn': certificate.Certificate.CertificateArn})
            }).catch(error => { 
                console.log(error);
                return sendResponse(event, context, 'FAILED');
            });
            
        } else if (event.RequestType === 'Delete') {
            
            let stackName = event.ResourceProperties.StackName;
            let outputParameter = event.ResourceProperties.OutputParameter;

            return findCertificateArn(stackName, outputParameter).then((certificateArn)=>{
                return deleteCertificateRetry(certificateArn);
            }).then((certificate)=>{
                return sendResponse(event, context, 'SUCCESS', { })
            }).catch(error => { 
                console.log(error);
                return sendResponse(event, context, 'FAILED');
            });
            
        } else if (event.RequestType === 'Update') {
            let stackName = event.ResourceProperties.StackName;
            let outputParameter = event.ResourceProperties.OutputParameter;

            let domainName = event.ResourceProperties.DomainName;
            let hostedZone = findHostedZoneFromString(domainName);

            return findCertificateArn(stackName, outputParameter).then((certificateArn)=>{
                return sendResponse(event, context, 'SUCCESS', { 'HostedZone': hostedZone, 'CertificateArn':certificateArn });
            });
        } else {
            return sendResponse(event, context, 'FAILED');
        }
    }
};

function findHostedZoneFromString(str) {
    var arr = str.split(".");
    var v0 = arr.pop();
    var v1 = arr.pop();
    return v0 && v1 ? v1 + "." + v0 : str;
}
async function findHostedZoneId(hostedZone) {
    return new Promise((resolve, reject) => {
        var params = {
            DNSName: hostedZone
        };
        route53.listHostedZonesByName(params, function(err, data) {
          if (err) {
              reject(err);
          } else {
              resolve(data.HostedZones[0].Id);
          }
        });
    });
}

async function updateRoute53Retry(hostedZone, certificateArn, retriesLeft = 10, interval = 10000) {

  let hostedZoneId = await findHostedZoneId(hostedZone);
  console.log("using hosted zone " + hostedZoneId);

  try {
      
    let certificate = await describeCertificate(certificateArn);
    await updateRoute53(hostedZoneId, certificate);
    return certificateArn;

  } catch (error) {
    await wait(interval);
    if (retriesLeft === 0) {
      return Promise.reject('Maximum retries exceeded!');
    }
    return updateRoute53Retry(hostedZone, certificateArn, --retriesLeft, interval);
  }
}

async function updateRoute53(hostedZoneId, certificate) {

    var promises = [];
    
    for (let val of certificate.Certificate.DomainValidationOptions) {
    
        if (val.ResourceRecord && val.ResourceRecord.Name) {
            
            var params = {
                ChangeBatch: {
                    Changes: [{
                        Action: "UPSERT", 
                        ResourceRecordSet: {
                            Name: val.ResourceRecord.Name, 
                            ResourceRecords: [{
                                Value: val.ResourceRecord.Value
                            }], 
                            TTL: 60, 
                            Type: val.ResourceRecord.Type
                        }
                    }]
                }, 
                HostedZoneId: hostedZoneId
            };
            
            promises.push(route53.changeResourceRecordSets(params).promise());
        } 
    }
    
    return Promise.all(promises);
}

async function waitForValidation(certificateArn) {
    return acm.waitFor('certificateValidated', {CertificateArn: certificateArn}).promise();
}

async function findCertificateArn(stackName, outputParameter) {
    var params = {
      StackName: stackName
    };
    return new Promise((resolve, reject) => {
        cloudformation.describeStacks(params, function(err, data) {
          if (err) reject(err);
          else {
              var value = "";
              for (let output of data.Stacks[0].Outputs) {
                  if (output.OutputKey == outputParameter) {
                      value = output.OutputValue;
                  }
              }

              if (value != "") {
                resolve(value);
              } else {
                reject(value);
              }
          }
        });
    });
}

async function deleteCertificateRetry(certificateArn, retriesLeft = 30, interval = 10000) {

  try {
      
    return await deleteCertificate(certificateArn);

  } catch (error) {
    await wait(interval);
    if (retriesLeft === 0) {
      return Promise.reject('Maximum retries exceeded!');
    }
    return deleteCertificateRetry(certificateArn, --retriesLeft, interval);
  }
}

async function deleteCertificate(certificateArn) {
    console.log("deleting certificate " + certificateArn);
    return acm.deleteCertificate({ CertificateArn: certificateArn }).promise();
}

async function describeCertificate(certArn) {
    return acm.describeCertificate({CertificateArn: certArn}).promise();
}

async function createCertificate(hostedZone, domainname) {    
    var params = {
        DomainName: domainname,
        DomainValidationOptions: [{
            DomainName: domainname,
            ValidationDomain: hostedZone
        }],
        SubjectAlternativeNames: ["*." + domainname],
        Tags: [{
          Key: 'Application',
          Value: 'Parima'
        }],
        ValidationMethod: 'DNS'
    };

    return acm.requestCertificate(params).promise();
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