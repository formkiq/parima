var http = require('http');
var mockserver = require('mockserver');
const cp = require('child_process');
const execSync = cp.execSync;

const AWS = require('aws-sdk');
const fs = require('fs').promises;
var assert = require('assert');
var lambda = require('../src/js/deployment');

AWS.config.update({
  accessKeyId: 'asdjsadkskdskskdk',
  secretAccessKey: 'sdsadsissdiidicdsi',
  region: 'us-east-1',
  endpoint: 'http://localhost:4566',
  s3ForcePathStyle: true
});

var server;

describe('Deployment', async()  => {

	before(async() => {
		server = http.createServer(mockserver('./test/mocks')).listen(9001);
	});

	after(async() => {
		server.close(); 
	});

	beforeEach(async() => {
		let buckets = await new AWS.S3().listBuckets({}).promise();
		var picked = buckets.Buckets.find(o => o.Name.startsWith("parima-git"));
		var params = {
	    	Name: "/formkiq/parima/accessTokens/" + picked.Name,
	    };
		await new AWS.SSM().deleteParameter(params).promise().catch(err=>{});
	});

	it('static site no git create', async() => {
		process.env.STACK_NAME = "parima";

		let text = await readFile('./test/json/deployment/static_no_git_create.json');
		let response = await lambda.handler(JSON.parse(text), {logStreamName:"test"});
		let body = JSON.parse(JSON.parse(response[0]).body);

		assert.equal(200, response[1]);
		assert.equal("SUCCESS", body.Status);
		assert.equal("v1", body.Data.WebsiteVersion);
		assert.ok(!body.Data.CreateInvalidation);

		let obj = await new AWS.S3().getObject({Bucket: 'parima', Key: 'v1/index.html'}).promise();
		assert.ok(obj.Body.toString().includes("Parima Placeholder Website"));
		assert.ok(obj.Body.toString().includes("aws s3 sync . s3://parima/v1"));
	});

	it('static site no git update Managed-CachingDisabled', async() => {
		process.env.STACK_NAME = "parima";

		let text = await readFile('./test/json/deployment/static_no_git_update.json');
		let response = await lambda.handler(JSON.parse(text), {logStreamName:"test"});
		let body = JSON.parse(JSON.parse(response[0]).body);

		assert.equal(200, response[1]);
		assert.equal("SUCCESS", body.Status);
		assert.equal("v2", body.Data.WebsiteVersion);
		assert.ok(!body.Data.CreateInvalidation);

		try {
 			await new AWS.S3().headObject({Bucket: 'parima', Key: 'v2/index.html'}).promise();
 			assert.ok(false);
 		} catch(err) {
 			assert.equal("NotFound: null", err);
 		}
	});

	it('static site no git update Managed-CachingOptimized', async() => {
		process.env.STACK_NAME = "parima-cache";

		let text = await readFile('./test/json/deployment/static_no_git_update.json');
		let response = await lambda.handler(JSON.parse(text), {logStreamName:"test"});
		let body = JSON.parse(JSON.parse(response[0]).body);

		assert.equal(200, response[1]);
		assert.equal("SUCCESS", body.Status);
		assert.equal("v2", body.Data.WebsiteVersion);
		assert.ok(body.Data.CreateInvalidation);

		try {
 			await new AWS.S3().headObject({Bucket: 'parima', Key: 'v2/index.html'}).promise();
 			assert.ok(false);
 		} catch(err) {
 			assert.equal("NotFound: null", err);
 		}
	});

	it('static site no git delete', async() => {
		process.env.STACK_NAME = "parima";

		let text = await readFile('./test/json/deployment/static_no_git_delete.json');
		let response = await lambda.handler(JSON.parse(text), {logStreamName:"test"});
		assert.equal(200, response[1]);
		let body = JSON.parse(JSON.parse(response[0]).body);
		assert.equal("SUCCESS", body.Status);
		assert.ok(!body.Data.CreateInvalidation);
	});

	it('static site public git create', async() => {
		process.env.STACK_NAME = "parima";

		let text = await readFile('./test/json/deployment/static_public_git_create.json');
		let response = await lambda.handler(JSON.parse(text), {logStreamName:"test"});
		assert.equal(200, response[1]);

		let body = JSON.parse(JSON.parse(response[0]).body);
		assert.equal("SUCCESS", body.Status);
		assert.ok(!body.Data.CreateInvalidation);

		var command = "git --git-dir /tmp/git/.git log --format=\"%H\" -n 1";
		var version = execSync(command).toString().substring(0,9);

		let obj = await new AWS.S3().getObject({Bucket: 'parima', Key: version + '/parima.yml'}).promise();
		assert.ok(obj.Body.toString().includes("Launch Your Website using AWS in Minutes"));
	});

	it('static site public git delete', async() => {
		process.env.STACK_NAME = "parima";

		let text = await readFile('./test/json/deployment/static_public_git_delete.json');
		let response = await lambda.handler(JSON.parse(text), {logStreamName:"test"});
		assert.equal(200, response[1]);
		let body = JSON.parse(JSON.parse(response[0]).body);
		assert.equal("SUCCESS", body.Status);
		assert.ok(!body.Data.CreateInvalidation);
	});

	it('static site private git create', async() => {
		process.env.STACK_NAME = "parima";

		let text = await readFile('./test/json/deployment/static_private_git_create.json');
		let response = await lambda.handler(JSON.parse(text), {logStreamName:"test"});
		assert.equal(200, response[1]);

		let body = JSON.parse(JSON.parse(response[0]).body);
		assert.equal("SUCCESS", body.Status);
		assert.ok(!body.Data.CreateInvalidation);

		let obj = await new AWS.S3().getObject({Bucket: 'parima', Key: 'v1/index.html'}).promise();
		assert.ok(obj.Body.toString().includes("Parima Placeholder Website"));
		assert.ok(obj.Body.toString().includes("Git Repository is Private"));
		assert.ok(!obj.Body.toString().includes("aws s3 sync"));
	});

	it('hugo site private git create', async() => {
		process.env.STACK_NAME = "parima";

		let text = await readFile('./test/json/deployment/hugo_public_git_create.json');
		let response = await lambda.handler(JSON.parse(text), {logStreamName:"test"});
		assert.equal(200, response[1]);

		let body = JSON.parse(JSON.parse(response[0]).body);
		assert.equal("SUCCESS", body.Status);
		assert.ok(!body.Data.CreateInvalidation);

		var command = "git --git-dir /tmp/git/.git log --format=\"%H\" -n 1";
		var version = execSync(command).toString().substring(0,9);
		let obj = await new AWS.S3().getObject({Bucket: 'parima', Key: version + '/index.html'}).promise();
		assert.ok(obj.Body.toString().includes("FormKiQ Blog"));
	});

	it('static site private git delete', async() => {
		process.env.STACK_NAME = "parima";

		let text = await readFile('./test/json/deployment/static_private_git_delete.json');
		let response = await lambda.handler(JSON.parse(text), {logStreamName:"test"});
		assert.equal(200, response[1]);

		let body = JSON.parse(JSON.parse(response[0]).body);
		assert.equal("SUCCESS", body.Status);
		assert.ok(!body.Data.CreateInvalidation);
	});

	it('access token to private git repo', async() => {
		process.env.STACK_NAME = "parima-git";
		let text = await readFile('./test/json/deployment/oauth_access_token.json');
		let response = await lambda.handler(JSON.parse(text), {logStreamName:"test"});

		assert.equal(301, response.statusCode);
		assert.equal("https://", response.headers.Location);

		let buckets = await new AWS.S3().listBuckets({}).promise();
		var picked = buckets.Buckets.find(o => o.Name.startsWith("parima-git"));
		let param = await new AWS.SSM().getParameter({Name: "/formkiq/parima/accessTokens/" + picked.Name,WithDecryption: true}).promise();
		assert.equal("ABCDEFGHIJKLMNOPQRSTUVWXYZ", param.Parameter.Value);
	});

	it('hasaccess without access token', async() => {
		process.env.STACK_NAME = "parima-git";

		let text = await readFile('./test/json/deployment/query_parameter_hasaccess.json');
		let response = await lambda.handler(JSON.parse(text), {logStreamName:"test"});
		assert.equal(404, response.statusCode);
		assert.equal("*", response.headers['Access-Control-Allow-Origin']);
	});

	it('hasaccess with access token', async() => {
		process.env.STACK_NAME = "parima-git";

		let buckets = await new AWS.S3().listBuckets({}).promise();
		var picked = buckets.Buckets.find(o => o.Name.startsWith("parima-git"));
		var params = {
	    	Name: "/formkiq/parima/accessTokens/" + picked.Name,
	    	Value: "123456789",
	    	Overwrite: true,
	    	Type: "SecureString"
	    };
		await new AWS.SSM().putParameter(params).promise();

		let text = await readFile('./test/json/deployment/query_parameter_hasaccess.json');
		let response = await lambda.handler(JSON.parse(text), {logStreamName:"test"});
		assert.equal(200, response.statusCode);
		assert.equal("*", response.headers['Access-Control-Allow-Origin']);
	});

	it('github main branch update event Managed-CachingDisabled', async() => {
		process.env.STACK_NAME = "parima-git";

		let text = await readFile('./test/json/deployment/github_main_branch_event.json');
		let response = await lambda.handler(JSON.parse(text), {logStreamName:"test"});
		assert.equal(200, response.statusCode);

		let body = JSON.parse(response.body);
		assert.equal("d2ee71e3f", body.WebsiteVersion);
		assert.ok(!body.CreateInvalidation);
	});

	it('github main branch update event Managed-CachingOptimized', async() => {
		process.env.STACK_NAME = "parima-cache-git";

		let text = await readFile('./test/json/deployment/github_main_branch_event.json');
		let response = await lambda.handler(JSON.parse(text), {logStreamName:"test"});
		assert.equal(200, response.statusCode);

		let body = JSON.parse(response.body);
		assert.equal("d2ee71e3f", body.WebsiteVersion);
		assert.ok(!body.CreateInvalidation);
	});

	it('github dev branch update event', async() => {
		process.env.STACK_NAME = "parima-git";

		let text = await readFile('./test/json/deployment/github_dev_branch_event.json');
		let response = await lambda.handler(JSON.parse(text), {logStreamName:"test"});
		assert.equal(200, response.statusCode);
		assert.equal("{\"WebsiteVersion\":\"v1\",\"CreateInvalidation\":false}", response.body);
	});
});

async function readFile(filePath) {
    return fs.readFile(filePath).then((data) => {
		return data.toString();
    });
}