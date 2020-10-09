const gulp = require('gulp');
const uglify = require('gulp-uglify-es').default;
const replace = require('gulp-token-replace');
const fs = require('fs');

function buildUglify(cb) {
	return gulp.src('src/js/*.js')
	  .pipe(uglify({toplevel:true}))
	  .pipe(gulp.dest('build'));
  	cb();
}

function buildCloudFormation(cb) {

	var certificate = fs.readFileSync("build/certificate.js", "utf8");
	var deployment = fs.readFileSync("build/deployment.js", "utf8");
	var verifyEmailIdentity = fs.readFileSync("build/verifyEmailIdentity.js", "utf8");

  	var config = {
	  	"version":"v1.2",
	  	"certificate":certificate,
	  	"deployment":deployment,
	  	"verifyEmailIdentity":verifyEmailIdentity
	}
	
  	return gulp.src(['src/yml/*.yml'])
    	.pipe(replace({global:config}))
    	.pipe(gulp.dest('.'))

  	cb();
}

exports.default = gulp.series(buildUglify, buildCloudFormation)