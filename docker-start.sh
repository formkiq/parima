#!/bin/bash

docker-compose up -d

until aws --region us-east-1 --no-sign-request --endpoint-url=http://localhost:4566 s3 ls; do
  >&2 echo "S3 is unavailable - sleeping"
  sleep 1
done

echo "S3 is available"


export AWS_ACCESS_KEY_ID=AAAA
export AWS_SECRET_ACCESS_KEY=BBBBBB
export AWS_DEFAULT_REGION=us-east-1

aws s3api create-bucket --bucket formkiq-distribution-us-east-1-core --endpoint http://localhost:4566
aws s3api create-bucket --bucket formkiq-distribution-us-east-2-core --endpoint http://localhost:4566
aws s3api create-bucket --bucket parima --endpoint http://localhost:4566

aws s3 cp /Users/slycer/Documents/workspace/java/parima/parima.yml s3://formkiq-distribution-us-east-1-core/parima/v1.3/parima.yml --acl public-read --endpoint http://localhost:4566
aws s3 cp /Users/slycer/Documents/workspace/java/parima/build/deployment.zip s3://formkiq-distribution-us-east-1-core/parima/v1.3/deployment.zip --acl public-read --endpoint http://localhost:4566
aws s3 cp /Users/slycer/Documents/workspace/java/parima/build/cf_certificate.zip s3://formkiq-distribution-us-east-1-core/parima/v1.3/cf_certificate.zip --acl public-read --endpoint http://localhost:4566
aws s3 cp /Users/slycer/Documents/workspace/java/parima/build/cf_lambda.zip s3://formkiq-distribution-us-east-1-core/parima/v1.3/cf_lambda.zip --acl public-read --endpoint http://localhost:4566
aws s3 cp /Users/slycer/Documents/workspace/java/parima/build/redirects.zip s3://formkiq-distribution-us-east-1-core/parima/v1.3/redirects.zip --acl public-read --endpoint http://localhost:4566

aws s3 cp /Users/slycer/Documents/workspace/java/parima/parima.yml s3://formkiq-distribution-us-east-2-core/parima/v1.3/parima.yml --acl public-read --endpoint http://localhost:4566
aws s3 cp /Users/slycer/Documents/workspace/java/parima/build/deployment.zip s3://formkiq-distribution-us-east-2-core/parima/v1.3/deployment.zip --acl public-read --endpoint http://localhost:4566
aws s3 cp /Users/slycer/Documents/workspace/java/parima/build/cf_certificate.zip s3://formkiq-distribution-us-east-2-core/parima/v1.3/cf_certificate.zip --acl public-read --endpoint http://localhost:4566
aws s3 cp /Users/slycer/Documents/workspace/java/parima/build/cf_lambda.zip s3://formkiq-distribution-us-east-2-core/parima/v1.3/cf_lambda.zip --acl public-read --endpoint http://localhost:4566
aws s3 cp /Users/slycer/Documents/workspace/java/parima/build/redirects.zip s3://formkiq-distribution-us-east-2-core/parima/v1.3/redirects.zip --acl public-read --endpoint http://localhost:4566

aws s3 cp /Users/slycer/Documents/workspace/java/parima/src/lambda/layer_git/layer-git-2.28.0.zip s3://formkiq-distribution-us-east-1-core/parima/v1.3/parima/layers/layer-git-2.28.0.zip --acl public-read --endpoint http://localhost:4566
aws s3 cp /Users/slycer/Documents/workspace/java/parima/src/lambda/layer_git/layer-git-2.28.0.zip s3://formkiq-distribution-us-east-2-core/parima/v1.3/parima/layers/layer-git-2.28.0.zip --acl public-read --endpoint http://localhost:4566

aws route53 create-hosted-zone --caller-reference ABCDEF --name tryformkiq.com --endpoint-url http://localhost:4566 --region us-east-1

aws cloudformation deploy --template-file parima.yml --stack-name parima --endpoint-url http://localhost:4566 --region us-east-1
aws cloudformation deploy --template-file parima.yml --stack-name parima-cache --endpoint-url http://localhost:4566 --region us-east-1 --parameter-overrides Caching=Managed-CachingOptimized
aws cloudformation deploy --template-file parima.yml --stack-name parima-git --endpoint-url http://localhost:4566 --region us-east-1 --parameter-overrides GitRepositoryUrl=https://github.com/formkiq/parima-test-private-repo.git
aws cloudformation deploy --template-file parima.yml --stack-name parima-cache-git --endpoint-url http://localhost:4566 --region us-east-1 --parameter-overrides GitRepositoryUrl=https://github.com/formkiq/parima-test-private-repo.git Caching=Managed-CachingOptimized
aws cloudformation deploy --template-file parima.yml --stack-name parima-certificate --endpoint-url http://localhost:4566 --region us-east-1 --parameter-overrides DomainName=test.tryformkiq.com

