// Redirects CloudFront requests that end in '/' and redirect to '/index.html'

'use strict';

module.exports.handler = async(event, context) => {	
    const request = event.Records[0].cf.request;
    // url ends with '/'
    if (request.uri.match('.+/$')) {
        request.uri += 'index.html';
    // no '.' in last part of url, assume folder
    } else if (request.uri.match('/[^\.]+$')) {
        request.uri += '/index.html';
    }

    return request;
};