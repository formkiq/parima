var http = require('http');
var mockserver = require('mockserver');

const AWS = require('aws-sdk');
const fs = require('fs').promises;
var assert = require('assert');
var lambda = require('../src/js/certificate');

AWS.config.update({
  accessKeyId: 'asdjsadkskdskskdk',
  secretAccessKey: 'sdsadsissdiidicdsi',
  region: 'us-east-1',
  endpoint: 'http://localhost:4566'
});

var server;

describe('Certificate', async()  => {

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

	it('No Hosted Zone Found', async() => {
		let text = await readFile('./test/json/certificate/create_invalid_hostedzone.json');
		let response = await lambda.handler(JSON.parse(text), {logStreamName:"test"});
		assert.equal(200, response[1]);
		var body = JSON.parse(JSON.parse(response[0]).body);
		assert.equal("FAILED", body.Status);
	});

	it('Create Certificate', async() => {
		var text = await readFile('./test/json/certificate/create.json');
		var response = await lambda.handler(JSON.parse(text), {logStreamName:"test"});
		assert.equal(200, response[1]);

		var body = JSON.parse(JSON.parse(response[0]).body);
		assert.equal("SUCCESS", body.Status);
		assert.equal("tryformkiq.com", body.Data.HostedZone);
		assert.ok(body.Data.CertificateArn.startsWith("arn:aws:acm:us-east-1"));

		// delete certificate
		process.env.CertificateArn = body.Data.CertificateArn;
		text = await readFile('./test/json/certificate/delete.json');
		response = await lambda.handler(JSON.parse(text), {logStreamName:"test"});
		console.log("RESPONSE: " + response);
		assert.equal(200, response[1]);
		body = JSON.parse(JSON.parse(response[0]).body);
		assert.equal("SUCCESS", body.Status);
	});

	it('Delete Certificate failed', async() => {
		var text = await readFile('./test/json/certificate/delete.json');
		var response = await lambda.handler(JSON.parse(text), {logStreamName:"test"});
		assert.equal(200, response[1]);

		var body = JSON.parse(JSON.parse(response[0]).body);
		assert.equal("FAILED", body.Status);
	});

	it('Update Change Domains', async() => {
		var text = await readFile('./test/json/certificate/update_certificate_change.json');
		var response = await lambda.handler(JSON.parse(text), {logStreamName:"test"});
		assert.equal(200, response[1]);

		var body = JSON.parse(JSON.parse(response[0]).body);
		assert.equal("SUCCESS", body.Status);
		assert.equal("tryformkiq.com", body.Data.HostedZone);
		assert.ok(body.Data.CertificateArn.startsWith("arn:aws:acm:us-east-1"));
	});

	it('Update Certificate', async() => {
		var text = await readFile('./test/json/certificate/update.json');
		var response = await lambda.handler(JSON.parse(text), {logStreamName:"test"});
		assert.equal(200, response[1]);

		var body = JSON.parse(JSON.parse(response[0]).body);
		assert.equal("SUCCESS", body.Status);
		assert.equal("tryformkiq.com", body.Data.HostedZone);
	});

	it('Invalid RequestType', async() => {
		var text = await readFile('./test/json/certificate/invalid.json');
		var response = await lambda.handler(JSON.parse(text), {logStreamName:"test"});
		assert.equal(200, response[1]);

		var body = JSON.parse(JSON.parse(response[0]).body);
		assert.equal("FAILED", body.Status);
	});

	it('Missing RequestType', async() => {
		var text = await readFile('./test/json/certificate/missing_requesttype.json');
		var response = await lambda.handler(JSON.parse(text), {logStreamName:"test"});
		assert.equal(400, response.statusCode);
		assert.equal("Missing 'RequestType'", response.body);
	});
});

async function readFile(filePath) {
    return fs.readFile(filePath).then((data) => {
		return data.toString();
    });
}