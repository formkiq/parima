const gulp = require('gulp');
const hashFiles = require('hash-files');
const zip = require('gulp-zip');
const rename = require("gulp-rename");
const uglify = require('gulp-uglify-es').default;
const replace = require('gulp-token-replace');
const fs = require('fs');

function buildUglify(cb) {
	return gulp.src('src/js/*.js')
	  .pipe(uglify({toplevel:true}))
	  .pipe(gulp.dest('build'));
  	cb();
}

function buildDeploymentZip(cb) {
    return gulp.src('./build/deployment.js')
     	.pipe(rename("index.js"))
        .pipe(zip('deployment.zip'))
        .pipe(gulp.dest('build'));
    cb();
}

function buildCertificateZip(cb) {
    return gulp.src('./build/certificate.js')
     	.pipe(rename("index.js"))
        .pipe(zip('certificate.zip'))
        .pipe(gulp.dest('build'));
    cb();
}

function buildCloudFormation(cb) {

  var deployment = fs.readFileSync("src/js/deployment.js", "utf8");
	var verifyEmailIdentity = fs.readFileSync("build/verifyEmailIdentity.js", "utf8");

  	var config = {
	  	"version":"v1.2",
      "deployment_hash":hashFiles.sync({files:['./src/js/deployment.js']}),
      "certificate_hash":hashFiles.sync({files:['./src/js/deployment.js']}),
	  	"verifyEmailIdentity":verifyEmailIdentity
	}
	
  	return gulp.src(['src/yml/*.yml'])
    	.pipe(replace({global:config}))
    	.pipe(gulp.dest('.'))

  	cb();
}

exports.default = gulp.series(buildUglify, buildCloudFormation, buildDeploymentZip, buildCertificateZip)