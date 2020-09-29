<img src="https://parima.s3.amazonaws.com/placeholder/parima.png" alt="Parima">

# Parima: Launch Your Front-End Site in the Cloud 
## …and leave any server and infrastructure complications behind



# What is Parima?

Parima is a free, open source project that has been created to allow easy publishing of static web sites and JavaScript web applications (like Angular or React apps) using Amazon Web Services. It's ideal for designers and front-end developers who want to launch a new web site without having to worry about hosting outside of creating an AWS Account.

Using AWS CloudFormation, Parima creates a simple, serverless architecture for your web site, using Amazon S3 to store the markup, code, and asset files, and AWS CloudFront to distribute the site using HTTPS. It can be installed with or without a custom domain.

# How It Works

Parima installs into your AWS Account using CloudFormation. Once installed, you will have access to your first website as well as the Parima Site Launch Console, which allows you to manage your new website and add new ones.

Updating a Parima-launched website can be done with the Amazon Web Services Command Line Interface (CLI), using one command from the root folder of your site (or for most frameworks, your ./dist folder):

```shell
aws s3 sync . s3://SITE-NAME-s3bucket-123456abcd/v1
```

Parima also includes an optional product for handling web forms without needing a server: **FormKiQ Core**. FormKiQ Core is free to include (there is an optional license for support), and like Parima, FormKiQ Core uses AWS Free Tier services in your AWS Cloud.


## Requirements

* **An Amazon Web Services (AWS) Account:** Parima requires you to have your own Amazon Web Services Virtual Private Cloud. AWS provides a generous [Free Tier](https://aws.amazon.com/free) that includes all of the products used by Parima (aside from adding an optional custom domain in Route 53).

    It is a good idea to have an [AWS Budget](https://console.aws.amazon.com/billing/home?#/budgets) with an alert set up before using AWS, to prevent any unexpected costs. (For personal and/or low-traffic sites, you should be able to keep costs well below $5 a month, so you could use that for the budget amount unless you expect an unusually large amount of traffic.)

    **[Sign Up for an AWS Account](https://portal.aws.amazon.com/billing/signup)**

* **A Domain Name (optional):** Parima builds both your first website and the Parima Site Launch Console. By default, both can be accessed using randomly-generated CloudFront URLs, such as https://*abcdefg99*.cloudfront.net

    You can specify a domain during the installation of Parima, and that domain will be used for the website (www.DOMAIN.COM and DOMAIN.COM), as well as for the Parima Site Launcher console (console.parima.DOMAIN.COM).

    A domain registered outside of AWS can be used (by setting up an Amazon Route 53 [Hosted Zone](https://console.aws.amazon.com/route53/v2/hostedzones#)), or a new domain can be registered within the AWS Management Console, beginning at $9/year.

    **[Register a Domain using Amazon Route 53](https://console.aws.amazon.com/route53/home#DomainRegistration:)** | **[Transfer a Domain to Amazon Route 53](https://console.aws.amazon.com/route53/home#DomainTransfer:)**

    
# Installation

## Step 1: Access CloudFormation within the AWS Management Console

Parima is installed using AWS CloudFormation within your AWS Account. Open AWS CloudFormation to begin:

**[Open AWS CloudFormation](https://console.aws.amazon.com/cloudformation)**


## Step 2: Run CloudFormation to Create the Parima Site Launcher Console and Your First Parima-Launched Website

Parima is installed by Creating a Stack. Click the "Create Stack" button; if you already have other CloudFormation Stacks, you will see a dropdown instea of a button; choose "With new resources (standard)".

CloudFormation has many options in its Create Stack process, but Parima does not require much customization. On the first screen, paste the following URL into **Amazon S3 URL**:
```
https://SOMETHING
```

Click "Next".

The next page is titled "Specify Stack Details". This is where all of the customization is done.

First, provide a Stack Name. This should be your site name, and should include your environment (such as "staging" or "production"). It's a good idea to have at least two different environments for your website, so you have one to test with and one that your visitors will see.

Example:
MyCompany.com will have a development, a staging, and a production environment. The Parima Stack could then be named "mycompany-dev", "mycompany-staging", and "mycompany-prod".

Once you have provided your stack name, you will need to choose your Parameters.

If you are planning on using a Custom Domain that you have registered or transferred to Amazon Route 53 (or a domain registered elsewhere that has been added to a Hosted Zone), you need to specify values for **DomainName** and **HostedZone**. If you are not requiring a Custom Domain (such as for dev environments or a proof of concept), you should leave these two parameters blank. You will be provided with a cloudfront.net URL to access the website instead.

**WebsiteVersion** can be left as v1.

Once you have chosen and entered your parameters, click "Next".

You can ignore the settings on the next page, "Configure Stack Options". Click "Next" again.

On the "Review" page, you need to scoll down to the bottom of the page in order to click the Acknowledgement Checkbox; this indicates to AWS that you are agreeing to create Identity and Access Management (IAM) resources. These IAM resources are what will allow you to publish your website to AWS.

Once you have clicked the Acknowledgement Checkbox, you can click "Create Stack" and the installation will begin.

**The installation could take up to fifteen minutes to complete.**

If the installation fails, it's likely due to an issue with your Custom Domain. Please verify that HostedZone matches an existing Hosted Zone Domain Name value in Route 53, and that DomainName is either a subdomain of that Hosted Zone Domain Name, or that Domain Name itself. If the values all match, confirm that your DomainName value does not already have a CNAME or A entry under your Route 53 Hosted Zone. As Parima needs to set up an SSL Certificate for your domain, you will need to delete your existing CNAME entry so Parima can create its own entry for certificate validation.

If you are still unable to complete the installation, please [Review the Current Issues](https://github.com/formkiq/parima/issues), and submit a new issue if you are unable to find a similar one.

## Step 3: Retrieve Your Parima URLs and Access Key

One the installation has completed, you will be able to retrieve the URLs and Access Key information that you will need to view and update your new Parima-Launched Website. 

***To be added***

## Step 4: Download and Install AWS CLI

***To be added***

## Step 5: Sync Your Local Machine's Website to your Parima-Launched Website in AWS

***To be added***
