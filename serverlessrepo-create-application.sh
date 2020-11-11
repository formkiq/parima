#!/bin/bash

s3bucket=

#declare -a StringArray=("us-east-1" "us-east-2" "us-west-1" "us-west-2" "ap-south-1" "ap-northeast-2" "ap-southeast-1" "ap-southeast-2" "ap-northeast-1" "ca-central-1" "eu-central-1" "eu-west-1" "eu-west-2" "eu-west-3" "eu-north-1" "sa-east-1")
declare -a StringArray=("us-east-1" )

# Iterate the string array using for loop
for region in ${StringArray[@]}; do

   sed "s/{{awsregion}}/$region/g" build/parima.yml > build/parima-${region}.yml
   aws cloudformation package --template-file build/parima-${region}.yml --s3-bucket ${s3bucket} > build/template.tmp

   aws serverlessrepo create-application \
     --author "FormKiQ Inc" \
     --description "Launch Your Website using AWS in Minutes" \
     --home-page-url https://github.com/formkiq/parima \
     --name FormKiQ-Parima \
     --labels "website" "hosting" "serverless" \
     --region "$region" \
     --license-body file://LICENSE \
     --readme-body file://README.md \
     --semantic-version "1.3.0" \
     --spdx-license-id "Apache-2.0" \
     --source-code-url https://github.com/formkiq/parima \
     --template-body file://build/template.tmp
done
