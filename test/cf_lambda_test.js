var http = require('http');
var mockserver = require('mockserver');

const AWS = require('aws-sdk');
const fs = require('fs').promises;
var assert = require('assert');
var lambda = require('../src/js/cf_lambda');

AWS.config.update({
  accessKeyId: 'asdjsadkskdskskdk',
  secretAccessKey: 'sdsadsissdiidicdsi',
  region: 'us-east-1',
  endpoint: 'http://localhost:4566'
});

var server;

describe('Lambda', async()  => {

	before(async() => {
		process.env.TEST = true;
		server = http.createServer(mockserver('./test/mocks')).listen(9001);
	});

	after(async() => {
		server.close(); 
	});

	beforeEach(async() => {
		process.env.STACK_NAME = "parima";
	});

	it('Create S3 Bucket/Delete Function', async() => {
	 	var text = await readFile('./test/json/cf_lambda/create-s3bucket.json');
	 	var response = await lambda.handler(JSON.parse(text), {logStreamName:"test"});
	 	assert.equal(200, response[1]);
	 	var body = JSON.parse(JSON.parse(response[0]).body);
	 	assert.equal("SUCCESS", body.Status);
	 	assert.equal("parima-CloudFrontRedirectLambda-1XK848KMX6I3Z", body.Data.FunctionName);
	 	assert.equal("1", body.Data.Version);
	 	assert.equal("arn:aws:lambda:us-east-1:000000000000:function:parima-CloudFrontRedirectLambda-1XK848KMX6I3Z:1", body.Data.FunctionArnVersion);

		text = await readFile('./test/json/cf_lambda/delete.json');
	 	response = await lambda.handler(JSON.parse(text), {logStreamName:"test"});
	 	assert.equal(200, response[1]);
	 	body = JSON.parse(JSON.parse(response[0]).body);
	 	assert.equal("SUCCESS", body.Status);
	});

	it('Create ZipFile/Delete Function', async() => {
	 	var text = await readFile('./test/json/cf_lambda/create-zipfile.json');
	 	var response = await lambda.handler(JSON.parse(text), {logStreamName:"test"});
	 	assert.equal(200, response[1]);
	 	var body = JSON.parse(JSON.parse(response[0]).body);
	 	assert.equal("SUCCESS", body.Status);
	 	assert.equal("parima-CloudFrontRedirectLambda-1XK848KMX6I3Z", body.Data.FunctionName);
	 	assert.equal("1", body.Data.Version);
	 	assert.equal("arn:aws:lambda:us-east-1:000000000000:function:parima-CloudFrontRedirectLambda-1XK848KMX6I3Z:1", body.Data.FunctionArnVersion);

		text = await readFile('./test/json/cf_lambda/delete.json');
	 	response = await lambda.handler(JSON.parse(text), {logStreamName:"test"});
	 	assert.equal(200, response[1]);
	 	body = JSON.parse(JSON.parse(response[0]).body);
	 	assert.equal("SUCCESS", body.Status);
	});

	it('Update Function', async() => {
	 	var text = await readFile('./test/json/cf_lambda/update.json');
	 	var response = await lambda.handler(JSON.parse(text), {logStreamName:"test"});
	 	assert.equal(200, response[1]);
	 	var body = JSON.parse(JSON.parse(response[0]).body);
	 	// localstack throws error, this should be success.
	 	assert.equal("FAILED", body.Status);
	 	// assert.equal("parima-CloudFrontRedirectLambda-1XK848KMX6I3Z", body.Data.FunctionName);
	 	// assert.equal("1", body.Data.Version);
	 	// assert.equal("arn:aws:lambda:us-east-1:000000000000:function:parima-CloudFrontRedirectLambda-1XK848KMX6I3Z:1", body.Data.FunctionArnVersion);
	});
});

async function readFile(filePath) {
    return fs.readFile(filePath).then((data) => {
		return data.toString();
    });
}