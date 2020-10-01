/**
 * CloudFormation Custom Resource for generating SSL Certificate in the us-east-1 region
 */
const AWS = require('aws-sdk');
var acm = new AWS.ACM({region:'us-east-1'});
var route53 = new AWS.Route53();
var cloudformation = new AWS.CloudFormation();

const sleep = (milliseconds) => {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

module.exports.handler = async(event, context) => {
    console.log(JSON.stringify(event));
    if (event.RequestType != null) {

        if (event.RequestType === 'Create') {
            let domainName = event.ResourceProperties.DomainName;
            let hostedZone = event.ResourceProperties.HostedZoneName;

            return createCertificate(hostedZone, domainName).then((certificate) => {
                console.log("created certificate " + certificate.CertificateArn);
                return describeCertificate(certificate.CertificateArn);
            }).then((data) => {
                console.log("adding certificate verification DNS entries");
                updateRoute53(hostedZone, data);
                return data.Certificate;
            }).then((certificate) => {
                console.log("waiting DNS to be updated so certificate can be validated");
                return waitForValidation(certificate.CertificateArn);
            }).then((certificate)=>{
                return sendResponse(event, context, 'SUCCESS', { 'CertificateArn': certificate.Certificate.CertificateArn})
            }).catch(error => { 
                console.log("error " + error);
                return sendResponse(event, context, 'FAILED');
            });
            
        } else if (event.RequestType === 'Delete') {
            
            let stackName = event.ResourceProperties.StackName;
            return findCertificateArn(stackName).then((certificateArn)=>{
                return deleteCertificate(certificateArn);
            }).then((certificate)=>{
                return sendResponse(event, context, 'SUCCESS', { })
            }).catch(error => { 
                return sendResponse(event, context, 'SUCCESS');
            });
            
        } else if (event.RequestType === 'Update') {
            return sendResponse(event, context, 'SUCCESS', { })
        } else {
            return sendResponse(event, context, 'FAILED');
        }
    }
};

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

async function updateRoute53(hostedZone, certificate) {

    let hostedZoneId = await findHostedZoneId(hostedZone);
    
    let promises = [];
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

        } else {
            console.log("Missing DNS Record, going to sleep and will try again");

           promises.push(sleep(10000).then(()=> {
               return updateRoute53(hostedZone, certificate);
           }));
        }
    }
    
    return Promise.all(promises);
}

async function waitForValidation(certificateArn) {
    return acm.waitFor('certificateValidated', {CertificateArn: certificateArn}).promise();
}
async function findCertificateArn(stackName) {
    var params = {
      StackName: stackName
    };
    return new Promise((resolve, reject) => {
        cloudformation.describeStacks(params, function(err, data) {
          if (err) reject(err);
          else {
              var value = "";
              for (let output of data.Stacks[0].Outputs) {
                  if (output.OutputKey == "Certificate") {
                      value = output.OutputValue;
                  }
              }
              resolve(value);
          }
        });
    });
}

async function deleteCertificate(certArn) {
    console.log("deleting certificate " + certArn);
    return acm.deleteCertificate({ CertificateArn: certArn }).promise();
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