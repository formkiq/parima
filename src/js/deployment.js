/**
 * Deployment
 */
const AWS = require('aws-sdk');

const s3 = new AWS.S3();
const ssm = new AWS.SSM();
const cf = new AWS.CloudFormation();
const fs = require('fs');
const cp = require('child_process');
const execSync = cp.execSync;

const { resolve } = require('path');
const { readdir } = fs.promises;
const SSM_ACCESS_TOKEN_PATH = "/formkiq/parima/accessTokens/";
const GIT_PARIMA_STATIC = "https://github.com/formkiq/parima-static-tutorial.git";

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
      
      if (event.ResourceProperties != null) {
        obj.RequestType = event.RequestType;
        obj.GitRepositoryUrl = event.ResourceProperties.GitRepositoryUrl;
        obj.DeploymentType = event.ResourceProperties.DeploymentType;
        obj.GitBranch = event.ResourceProperties.GitBranch;
        obj.S3Bucket = event.ResourceProperties.S3Bucket;
        obj.GithubOAuthUrl = event.ResourceProperties.GithubOAuthUrl;
        obj.SyncCommand = event.ResourceProperties.SyncCommand;
        obj.WebHookUrl = event.ResourceProperties.WebHookUrl;
      }
      
      if (event.RequestType === 'Create' && (obj.GitRepositoryUrl == null || obj.GitRepositoryUrl == "")) {
        obj.GitRepositoryUrl = GIT_PARIMA_STATIC;
      }
      
      obj.GitParimaStaticDeployed = GIT_PARIMA_STATIC == obj.GitRepositoryUrl;
      obj.RequestType = event.RequestType;
      obj.ResourceProperties = event.ResourceProperties;
      
      console.log(JSON.stringify(obj));
      return Promise.resolve(obj);
    });
}

module.exports.handler = async(event, context) => {
  
  log(JSON.stringify(event));

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
    return event.RequestType != null ? sendResponse(event, context, 'SUCCESS',{'WebsiteVersion': config.WebsiteVersion}) : response(config);
  }).catch(error => { 
    log(error);
    return event.RequestType != null ? sendResponse(event, context, 'FAILED') : { statusCode: 400, body: JSON.stringify('invalid access token') };
  });
};

async function updateWebsiteVariables(config) {
  if (config.GitParimaStaticDeployed && config.GitCloneSuccess && fs.existsSync('/tmp/git/index.html')) {
    var text = fs.readFileSync('/tmp/git/index.html', 'utf8');

    text = text.replace(/{{STYLE_GIT_AUTH}}/g, config.GithubOAuthUrl == null ? 'display:none;' : '');
    text = text.replace(/{{GIT_AUTH_URL}}/g, config.GithubOAuthUrl);
    text = text.replace(/{{STYLE_GIT_WEBHOOK}}/g, config.WebHookUrl == null ? 'display:none;' : '');
    text = text.replace(/{{ WebHookUrl }}/g, config.WebHookUrl);
    text = text.replace(/{{ GithubRepoUrl }}/g, config.GitRepositoryUrl);
    text = text.replace(/{{ SyncCommand }}/g, config.SyncCommand);
    text = text.replace(/{{ InvalidateCache }}/g, config.InvalidateCache);

    log(text);
    fs.writeFileSync('/tmp/git/index.html', text, 'utf8');
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

  var newWebsiteVersion = "";
  for (let param of config.CloudFormationParameters) {
    if (param.ParameterKey == "WebsiteVersion") {
      newWebsiteVersion = param.ParameterValue;
      params.Parameters.push({ParameterKey: param.ParameterKey, ParameterValue: param.ParameterValue});
    } else {
      params.Parameters.push({ParameterKey: param.ParameterKey, UsePreviousValue:true});
    }
  }

  if (newWebsiteVersion != config.WebsiteVersion) {
    return cloudformation.updateStack(params).promise().then(()=>{
      return Promise.resolve(config);
    });
  } else {
    return Promise.resolve(config);
  }
}

async function response(config) {

  if (config.queryParameters.access_token != null) {
    return  { statusCode: 301, headers:{Location: config.WebsiteUrl}, body: "" };
  }

  return  { statusCode: 200, body: "" };
}

async function updateGitWebsiteVersion(config) {

  // skip updating website version on create.
  if ((config.RequestType == null || config.RequestType != 'Create') && config.GitCloneSuccess) {
    let dir = "/tmp/git/";
    var command = "git --git-dir " + dir + ".git log --format=\"%H\" -n 1";
    try {
      var version = execSync(command).toString();
      log("found website version " + version);
      config.WebsiteVersion = version.length > 9 ? version.substring(0,9) : version;
    } catch(err) {
      log("updateGitWebsiteVersion: " + err);
    }
  }
  
  return Promise.resolve(config);
}

async function clone(config) {

  if (config.GitRepositoryUrl != null) {
    
    let dir = "/tmp/git/";
    fs.rmdirSync(dir, { recursive: true });
    
    var url = config.GitRepositoryUrl;
    if (config.access_token != null) {
        url = url.replace("https://", "https://" + config.access_token + "@");
    }
    
    let deployMaster = config.GitBranch == "";
    
    if (deployMaster) {
      config.GitBranch = "master";
    }
    
    runClone(config, url, dir);

    if (!config.GitCloneSuccess) {
      config.GitBranch = "main";
      runClone(config, url, dir);
    }

    if (!config.GitCloneSuccess) {
      config.GitBranch = "main";
      runClone(config, url, dir);
    }

    if (!config.GitCloneSuccess) {
      url = GIT_PARIMA_STATIC;
      log("defaulting to " + url);
      config.GitBranch = "main";
      config.GitParimaStaticDeployed = true;
      runClone(config, url, dir);
    }

  } else {
    config.GitCloneSuccess = false;
  }
  
  return Promise.resolve(config);
}

function runClone(config, url, dir) {

  console.log("git clone --single-branch --branch " + config.GitBranch);
  var command = "git clone --single-branch --branch " + config.GitBranch + " " + url + " " + dir + "/";

  try {
    var executionResult = execSync(command);
    console.log(executionResult.toString());
    config.GitCloneSuccess = true;
  } catch(err) {
    config.GitCloneSuccess = false;
  }
}

async function buildHugo(config) {
    
    if (config.GitCloneSuccess && config.HugoVersion != null && config.HugoVersion.length > 0) {
        var command = "hugo --source /tmp/git --debug";
        
        try {
          execSync(command);
          config.HugoBuildSuccess = true;
        } catch(err) {
           config.HugoBuildSuccess = false;
        }
    }
    
    return Promise.resolve(config);
}

async function syncFiles(config) {
  
  if (config.GitCloneSuccess) {
    let nakedDir = getDirToSync(null);
    let dir = getDirToSync(config.HugoVersion);
    
    return getFiles(dir).then(files => {
        
      let promises = [];
      let directory = dir.replace(nakedDir, "");
      log("syncing website to " + config.S3Bucket + " as version " + config.WebsiteVersion);
      
      for (let file of files) {
          
        let key = file.substring(9);
        if (!key.startsWith(".git/")) {
          let contentType = exports.ext.getContentType(exports.ext.getExt(key));
          var s3key = config.WebsiteVersion + "/" + key.substring(directory.length);
          
          var params = { Body: fs.createReadStream(file), Bucket: config.S3Bucket, Key: s3key, ContentType: contentType };
          promises.push(s3.putObject(params).promise());
          
          if (key.endsWith("index.html")) {
              s3key = s3key.replace("/index.html", "");

              if (s3key != config.WebsiteVersion) {
                var bparams = { Body: fs.createReadStream(file), Bucket: config.S3Bucket, Key: s3key, ContentType: contentType };
                promises.push(s3.putObject(bparams).promise());
              }
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

function getDirToSync(hugoVersion) {
    return hugoVersion != null && hugoVersion.length > 0 ? "/tmp/git/public" : "/tmp/git";
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
    };

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