#!/bin/bash

declare -a StringArray=("us-east-1" "us-east-2" "us-west-1" "us-west-2" "ap-south-1" "ap-northeast-2" "ap-southeast-1" "ap-southeast-2" "ap-northeast-1" "ca-central-1" "eu-central-1" "eu-west-1" "eu-west-2" "eu-west-3" "eu-north-1" "sa-east-1")
 
# Iterate the string array using for loop
for region in ${StringArray[@]}; do
   aws serverlessrepo delete-application --application-id arn:aws:serverlessrepo:$region:622653865277:applications/FormKiQ-Parima --region $region
done
