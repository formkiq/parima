const fs = require('fs').promises;
var assert = require('assert');
var lambda = require('../src/js/redirects');

describe('Redirects', async()  => {

	it('ends in no slash', async() => {
	 	var text = await readFile('./test/json/redirects/ends_in_no_slash.json');
	 	var response = await lambda.handler(JSON.parse(text), {});
	 	assert.equal("/my-fifth-post/index.html", response.uri);
	});

	it('ends in slash', async() => {
	 	var text = await readFile('./test/json/redirects/ends_in_slash.json');
	 	var response = await lambda.handler(JSON.parse(text), {});
	 	assert.equal("/my-fifth-post/index.html", response.uri);
	});

	it('root', async() => {
	 	var text = await readFile('./test/json/redirects/root.json');
	 	var response = await lambda.handler(JSON.parse(text), {});
	 	assert.equal("/", response.uri);
	});

	it('index', async() => {
	 	var text = await readFile('./test/json/redirects/index.json');
	 	var response = await lambda.handler(JSON.parse(text), {});
	 	assert.equal("/index.html", response.uri);
	});
});

async function readFile(filePath) {
    return fs.readFile(filePath).then((data) => {
		return data.toString();
    });
}