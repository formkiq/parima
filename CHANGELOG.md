# Parima Releases #

### Version 1.3 (Nov 1, 2020)
- [Pull 9](https://github.com/formkiq/parima/pull/9)
 * Added LambdaEdge Lambda for CloudFront for handling URLs that do not end in index.html
 * Added Support for installing Parima through [AWS Serverless Application Repository](https://aws.amazon.com/serverless/serverlessrepo/) 
 
### Version 1.2 (Oct 23, 2020)
- [Pull 8](https://github.com/formkiq/parima/pull/8)
 * Added Support for GitHub as website source
 * Added GitHub Webhook Urls to trigger automatic deployment
 * Added Different Types of CloudFront Caching Support: Managed-CachingDisabled, Managed-CachingOptimized, Managed-CachingOptimizedForUncompressedObjects
 * Added Support for deploying website built using Hugo

### Version 1.1.1 (Oct 8, 2020)
- [Pull 7](https://github.com/formkiq/parima/pull/7) 
 * Fixed being unable to change WebsiteVersion with a Custom Domain.
 * Added Parima Version to Template Description

### Version 1.1 (Oct 8, 2020)
- [Pull 5](https://github.com/formkiq/parima/pull/5) 
 * Added the ability to create a certificate in any region, not just us-east-1
 * Added better retry when creating/deleting certificates as they can fail due to waiting for DNS, or resources using the certificate to release the certificate from use.

### Version 1.0 (Oct 2, 2020)
- Initial Release
