/**
 * Deployment
 */
const AWS = require('aws-sdk');
var s3;
var ssm;
var cf;
var cloudfront;
const fs = require('fs');
const cp = require('child_process');
const execSync = cp.execSync;
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const fsp = require('fs').promises;

const { resolve } = require('path');
const { readdir } = fs.promises;
const SSM_ACCESS_TOKEN_PATH = "/formkiq/parima/accessTokens/";
const GIT_PARIMA_STATIC = "https://github.com/formkiq/parima-static-tutorial.git";

AWS.config.update({
    httpOptions: {
        connectTimeout: 900000
    }
});

async function getFiles(dir) {
  const dirents = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(dirents.map((dirent) => {
    const res = resolve(dir, dirent.name);
    return dirent.isDirectory() ? getFiles(res) : res;
  }));
  return Array.prototype.concat(...files);
}

function buildConfig(event) {
  
    let stackName = process.env.STACK_NAME;
    
    return cf.describeStacks({ StackName: stackName}).promise().then((data) => {
      let obj = {};
      obj.GitRepositoryUrl = "";

      let q = event.queryStringParameters;
      obj.queryParameters = q != null ? q : {};
      
      if (q != null && q.access_token != null) {
        obj.access_token = q.access_token;
      }
      
      for (let stack of data.Stacks) {
        obj.CloudFormationParameters = stack.Parameters;
        
        for (let param of stack.Parameters) {
          obj[param.ParameterKey] = param.ParameterValue;
        }
        
        for (let o of stack.Outputs) {
          obj[o.OutputKey] = o.OutputValue;
        }
      }
      
      obj.HasWebsiteVersionChanged = false;
      obj.CreateInvalidation = false;

      if (event.ResourceProperties != null) {
        obj.RequestType = event.RequestType;
        obj.GitRepositoryUrl = event.ResourceProperties.GitRepositoryUrl;
        obj.DeploymentType = event.ResourceProperties.DeploymentType;
        obj.GitBranch = event.ResourceProperties.GitBranch;
        obj.S3Bucket = event.ResourceProperties.S3Bucket;
        obj.GithubOAuthUrl = event.ResourceProperties.GithubOAuthUrl;
        obj.SyncCommand = event.ResourceProperties.SyncCommand;
        obj.WebHookUrl = event.ResourceProperties.WebHookUrl;
        obj.WebsiteVersion = event.ResourceProperties.WebsiteVersion;
        obj.GitDeploymentPath = event.ResourceProperties.GitDeploymentPath;

        if (event.OldResourceProperties != null && event.OldResourceProperties.WebsiteVersion != null) {
          obj.HasWebsiteVersionChanged = event.OldResourceProperties.WebsiteVersion != event.ResourceProperties.WebsiteVersion;
        }
      }
      
      obj.GitParimaStaticDeployed = GIT_PARIMA_STATIC == obj.GitRepositoryUrl;
      obj.RequestType = event.RequestType;
      obj.ResourceProperties = event.ResourceProperties;
      obj.SyncDirectory = "/tmp/git";
      obj.TempDirectory = "/tmp/git";
      
      var body = event.body;
      if (event.isBase64Encoded) {
        let buff = new Buffer(data, 'base64');
        body = buff.toString('utf-8');
      }

      try {
        obj.body = JSON.parse(body);
      } catch(err) {
        obj.body = null;
      }

      log(JSON.stringify(obj));
      return Promise.resolve(obj);
    });
}

module.exports.handler = async(event, context) => {
  
  log(JSON.stringify(event));

  s3 = new AWS.S3();
  ssm = new AWS.SSM();
  cf = new AWS.CloudFormation();
  cloudfront = new AWS.CloudFront();

  if (event.queryStringParameters != null && event.queryStringParameters.hasaccess != null) {
    return buildConfig(event)
      .then((config) => {
      return getAccessToken(config);
    }).then((config) => {
      return { statusCode: config.access_token != null ? 200 : 404, headers:{'Access-Control-Allow-Origin':'*'}, body: "" };
    });
  }

  return buildConfig(event)
    .then((config) => {
    return saveAccessToken(config);
  }).then((config) => {
    return getAccessToken(config);
  }).then((config) => {
    return clone(config);
   }).then((config) => {
     return updateWebsiteVariables(config);
  }).then((config) => {
    return updateGitWebsiteVersion(config);
  }).then((config) => {
    return buildHugo(config);
  }).then((config) => {
    return syncFiles(config);
  }).then((config) => {
    return updateCloudFormation(config);
  }).then((config) => {
    return createInvalidation(config);
  }).then((config) => {
    return event.RequestType != null ? sendResponse(event, context, 'SUCCESS',{'WebsiteVersion': config.WebsiteVersion, 'CreateInvalidation': config.CreateInvalidation}) : response(config);
  }).catch(error => { 
    log(error);
    return event.RequestType != null ? sendResponse(event, context, 'FAILED') : { statusCode: 400, body: JSON.stringify('bad request') };
  });
};

async function updateWebsiteVariables(config) {

  if (config.GitParimaStaticDeployed && config.GitCloneSuccess && fs.existsSync(config.TempDirectory + '/index.html')) {

    var filename = config.GitRepositoryUrl != null && config.GitRepositoryUrl != "" ? "index-git-private.html" : "index.html";
    return fsp.readFile(config.TempDirectory + '/' + filename).then((txt) => {
      var text = txt.toString();
      text = text.replace(/{{GIT_AUTH_URL}}/g, config.GithubOAuthUrl);
      text = text.replace(/{{WebHookUrl}}/g, config.WebHookUrl);
      text = text.replace(/{{GithubRepoUrl}}/g, config.GitRepositoryUrl);
      text = text.replace(/{{SyncCommand}}/g, config.SyncCommand);

      return fsp.writeFile(config.TempDirectory + '/index.html', text, 'utf8').then(()=>{
        return Promise.resolve(config);      
      });
    });
  }

  return Promise.resolve(config);
}

async function saveAccessToken(config) {
  if (config.queryParameters != null && config.queryParameters.access_token != null) {
    var params = {
      Name: SSM_ACCESS_TOKEN_PATH + config.S3Bucket,
      Value: config.access_token,
      Overwrite: true,
      Type: "SecureString"
    };

    return ssm.putParameter(params).promise().then((data) => {
      return Promise.resolve(config);
    });
  } else {
    return Promise.resolve(config);
  }
}

async function getAccessToken(config) {
  if (config.access_token == null) {
    var params = {
      Name: SSM_ACCESS_TOKEN_PATH + config.S3Bucket,
      WithDecryption: true
    };
    return new Promise((resolve, reject) => {
      ssm.getParameter(params, function(err, data) {
        if (err) {
          resolve(config);
        } else {
          config.access_token = data.Parameter.Value;
          resolve(config);
        }
      });
    });
  } else {
    // ignore test access token
    if (config.access_token == "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
      config.access_token = null;
    }
    return Promise.resolve(config);
  }
}

async function updateCloudFormation(config) {

  let stackName = process.env.STACK_NAME;
  var params = {
    StackName: stackName,
    Capabilities: [
      "CAPABILITY_IAM", "CAPABILITY_NAMED_IAM", "CAPABILITY_AUTO_EXPAND"
    ],
    Parameters: [],
    UsePreviousTemplate: true
  };

  // ignore CloudFormation custom resource
  if (config.HasWebsiteVersionChanged && config.RequestType == null) {
    var oldWebsiteVersion = "";
    for (let param of config.CloudFormationParameters) {
      if (param.ParameterKey == "WebsiteVersion") {
        oldWebsiteVersion = param.ParameterValue;
        params.Parameters.push({ParameterKey: param.ParameterKey, ParameterValue: config.WebsiteVersion});
      } else {
        params.Parameters.push({ParameterKey: param.ParameterKey, UsePreviousValue:true});
      }
    }

    log("updating website from " + oldWebsiteVersion + " to " + config.WebsiteVersion);
    return cf.updateStack(params).promise().then(()=>{
      return Promise.resolve(config);
    }).catch(error => { 
      log(error);
      return Promise.resolve(config);
    });
    
  } else {
    return Promise.resolve(config);
  }
}

async function createInvalidation(config) {
  if (config.RequestType == "Update" && config.HasWebsiteVersionChanged && config.Caching != "Managed-CachingDisabled") {
    var params = {
      DistributionId: config.CloudFrontDistributionId,
      InvalidationBatch: {
        CallerReference: config.WebsiteVersion,
        Paths: {Quantity: 1,Items: ['/*']}
      }
    };

    config.CreateInvalidation = true;

    log("invalidating cloudfront cache");
    return cloudfront.createInvalidation(params).promise().then(()=> {
      return Promise.resolve(config);
    }).catch(error => { 
      log(error);
      return Promise.resolve(config);
    });

  } else {
    return Promise.resolve(config);
  }
}

async function response(config) {
  if (config.queryParameters != null && config.queryParameters.access_token != null) {
    return  Promise.resolve({ statusCode: 301, headers:{Location: config.WebsiteUrl}, body: "" });
  }

  let body = {WebsiteVersion: config.WebsiteVersion, 'CreateInvalidation': config.CreateInvalidation};
  return Promise.resolve({ statusCode: 200, body: JSON.stringify(body) });
}

async function updateGitWebsiteVersion(config) {

  if (!config.HasWebsiteVersionChanged && config.GitCloneSuccess && !config.GitParimaStaticDeployed) {
    var command = "git --git-dir " + config.TempDirectory + "/.git log --format=\"%H\" -n 1";

    try {

      var version = execSync(command).toString();
      version = version.length > 9 ? version.substring(0,9) : version;
      log("found website version " + version);
      config.HasWebsiteVersionChanged = version != config.WebsiteVersion;
      config.WebsiteVersion = version.length > 9 ? version.substring(0,9) : version;

    } catch(err) {
      log("updateGitWebsiteVersion: " + err);
    }
  }
  
  return Promise.resolve(config);
}

function hasValue(obj) {
  return obj != null && obj != "";
}

function isCommitMatchBranch(config) {
  let ref = hasValue(config.body) && hasValue(config.body.ref) ? config.body.ref.toString() : "";
  let isRefMaster = ref.endsWith("master") || ref.endsWith("main");
  let isGitBranchMaster = config.GitBranch == "" || config.GitBranch == "master" || config.GitBranch == "main";

  if (!hasValue(ref) || (isRefMaster && isGitBranchMaster) || (config.GitBranch != "" && ref.endsWith(config.GitBranch))) {
    return true;
  }

  return false;
}

async function clone(config) {

  if (isCommitMatchBranch(config)) {

    if (hasValue(config.GitRepositoryUrl)) {
      
      var url = config.GitRepositoryUrl;
      if (config.access_token != null) {
          url = url.replace("https://", "https://" + config.access_token + "@");
      }
      
      let deployMaster = !hasValue(config.GitBranch);
      
      if (deployMaster) {
        config.GitBranch = "master";
      }
      
      return fsp.rmdir(config.TempDirectory, { recursive: true }).then(() => {
        return runClone(config, url);
      }).then((config) => {

        if (!config.GitCloneSuccess && deployMaster) {
          config.GitBranch = "main";
          return runClone(config, url);
        } else {
          return Promise.resolve(config);
        }

      }).then((config) => {

        if (!config.GitCloneSuccess) {
          url = GIT_PARIMA_STATIC;
          config.GitBranch = "main";
          config.GitParimaStaticDeployed = true;
          return runClone(config, url);

        } else {
          return Promise.resolve(config);
        }
      });

    } else {

      if (config.RequestType != null && config.RequestType == "Create") {
        config.GitBranch = "main";
        config.GitParimaStaticDeployed = true;
        return fsp.rmdir(config.TempDirectory, { recursive: true }).then(() => {
          return runClone(config, GIT_PARIMA_STATIC);
        });
      } else {
        return Promise.resolve(config);
      }
    }

  } else {
    return Promise.resolve(config);
  }
}

async function runClone(config, url) {

  log("git clone --single-branch --branch " + config.GitBranch);
  var command = "git clone --single-branch --branch " + config.GitBranch + " " + url + " " + config.TempDirectory + "/";

  if (!config.GitCloneSuccess) {
    return exec(command).then(() => {
      config.GitCloneSuccess = true;
      return Promise.resolve(config);
    }).catch(error => { 
      config.GitCloneSuccess = false;
      return Promise.resolve(config);
    });
  } else {
    return Promise.resolve(config);
  }
}

async function buildHugo(config) {
    
    if (!config.GitParimaStaticDeployed && config.RequestType != null && config.GitCloneSuccess && config.DeploymentType != null && config.DeploymentType.length > 0 && config.DeploymentType.startsWith("Hugo")) {
        log("building Hugo site");
        var command = "hugo --source " + config.TempDirectory + " --debug";
        
        try {
          execSync(command);
          config.HugoBuildSuccess = true;
          config.GitDeploymentPath = "public";
        } catch(err) {
          log(err);
          config.HugoBuildSuccess = false;
        }
    }
    
    return Promise.resolve(config);
}

async function syncFiles(config) {
  
  if (config.RequestType != null && config.GitCloneSuccess) {
    
    config.SyncDirectory = config.TempDirectory + "/" + config.GitDeploymentPath;
    let diff = config.SyncDirectory.replace(config.TempDirectory, "");
    return getFiles(config.SyncDirectory).then(files => {
        
      let promises = [];
      log("syncing " + config.SyncDirectory + " to " + config.S3Bucket + " as version " + config.WebsiteVersion);
      
      for (let file of files) {
        
        if (fs.lstatSync(file).isFile()) {

          let key = file.substring(9);
          if (!key.startsWith(".git/")) {
            let contentType = exports.ext.getContentType(exports.ext.getExt(key));
            var s3key = config.WebsiteVersion + "/" + key;
            if (diff.length > 1) {
                s3key = s3key.replace(diff, "");
            }

            promises.push(putS3Object(config, file, s3key, contentType));
          }
        }
      }
      
      return Promise.all(promises);
    }).then((data) => {
      return Promise.resolve(config);
    });
  } else {
    return Promise.resolve(config);
  }
}

function putS3Object(config, file, s3key, contentType) {

  var content = fs.readFileSync(file);
  var params = { Body: content, Bucket: config.S3Bucket, Key: s3key, ContentType: contentType };
  return s3.putObject(params).promise().catch(error => { 
    return Promise.resolve(config);
  });
}

function log(msg) {
  console.log(msg);
}

exports.ext = function () {
  var app = "application/";
  var t = "text/";
  var v = "video/";
  var a = "audio/";
  var i = "image/";
  var od = "vnd.oasis.opendocument.";
  var extTypes = { 
    "avi"   : v + "x-msvideo"
    , "bmp"   : i + "bmp"
    , "bz2"   : app + "x-bzip2"
    , "conf"  : t + "plain"
    , "css"   : t + "css"
    , "csv"   : t + "csv"
    , "doc"   : app + "msword"
    , "dot"   : app + "msword"
    , "dtd"   : app + "xml-dtd"
    , "exe"   : app + "x-msdownload"
    , "gif"   : i + "gif"
    , "gz"    : app + "x-gzip"
    , "htm"   : t + "html"
    , "html"  : t + "html"
    , "ico"   : i + "vnd.microsoft.icon"
    , "jpeg"  : i + "jpeg"
    , "jpg"   : i + "jpeg"
    , "js"    : app + "javascript"
    , "json"  : app + "json"
    , "log"   : t + "plain"
    , "m4v"   : v + "mp4"
    , "mov"   : v + "quicktime"
    , "mp3"   : a + "mpeg"
    , "mp4"   : v + "mp4"
    , "mp4v"  : v + "mp4"
    , "mpeg"  : v + "mpeg"
    , "mpg"   : v + "mpeg"
    , "odp"   : app + od + "presentation"
    , "ods"   : app + od + "spreadsheet"
    , "odt"   : app + od + "text"
    , "ogg"   : app + "ogg"
    , "pdf"   : app + "pdf"
    , "png"   : i + "png"
    , "pps"   : app + "vnd.ms-powerpoint"
    , "ppt"   : app + "vnd.ms-powerpoint"
    , "psd"   : i + "vnd.adobe.photoshop"
    , "qt"    : v + "quicktime"
    , "rar"   : app + "x-rar-compressed"
    , "rdf"   : app + "rdf+xml"
    , "rss"   : app + "rss+xml"
    , "rtf"   : app + "rtf"
    , "svg"   : i + "svg+xml"
    , "svgz"  : i + "svg+xml"
    , "tar"   : app + "x-tar"
    , "tbz"   : app + "x-bzip-compressed-tar"
    , "text"  : t + "plain"
    , "tif"   : i + "tiff"
    , "tiff"  : i + "tiff"
    , "torrent" : app + "x-bittorrent"
    , "txt"   : t + "plain"
    , "vcf"   : t + "x-vcard"
    , "vcs"   : t + "x-vcalendar"
    , "wav"   : a + "x-wav"
    , "wma"   : a + "x-ms-wma"
    , "wmv"   : v + "x-ms-wmv"
    , "wmx"   : v + "x-ms-wmx"
    , "xls"   : app + "vnd.ms-excel"
    , "xml"   : app + "xml"
    , "xsl"   : app + "xml"
    , "xslt"  : app + "xslt+xml"
    , "yaml"  : t + "yaml"
    , "yml"   : t + "yaml"
    , "zip"   : app + "zip"
  };
  return {
    getExt: function (path) {
      var i = path.lastIndexOf('.');
      return (i < 0) ? '' : path.substr(i+1);
    },
    getContentType: function (ext) {
      return extTypes[ext.toLowerCase()] || 'application/octet-stream';
    }
  };
}();

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