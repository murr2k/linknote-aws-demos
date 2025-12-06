# AWS Subdomain Migration: aws.linknote.com → aws.linknode.com

## Overview
This document describes the migration of the AWS portfolio demo from `aws.linknote.com` to `aws.linknode.com`, including certificate updates and DNS configuration.

## CloudFront Distribution
- **Distribution ID**: d288vhnilf4g47.cloudfront.net
- **Old Domain**: aws.linknote.com
- **New Domain**: aws.linknode.com

## Changes Made

### 1. CloudFormation Template Updates
Updated `/home/murr2k/projects/linknote-aws-demos/config/linknote-infrastructure.yaml`:

#### Added New Parameter (line 15-18)
```yaml
AWSSubdomainName:
  Type: String
  Default: 'aws.linknode.com'
  Description: 'AWS subdomain for portfolio demo'
```

#### Updated SSL Certificate (line 119-121)
Added `aws.linknode.com` to SubjectAlternativeNames:
```yaml
SubjectAlternativeNames:
  - !Ref WWWDomainName
  - !Ref AWSSubdomainName
```

#### Updated CloudFront Aliases (line 141-144)
Added `aws.linknode.com` to distribution aliases:
```yaml
Aliases:
  - !Ref DomainName
  - !Ref WWWDomainName
  - !Ref AWSSubdomainName
```

#### Added Output (line 355-359)
```yaml
AWSSubdomainURL:
  Description: 'AWS subdomain URL'
  Value: !Sub 'https://${AWSSubdomainName}'
  Export:
    Name: !Sub '${AWS::StackName}-AWSSubdomainURL'
```

## Deployment Steps

### Step 1: Update CloudFormation Stack

```bash
# Deploy the updated stack
aws cloudformation update-stack \
  --stack-name linknote-production \
  --template-body file://config/linknote-infrastructure.yaml \
  --parameters ParameterKey=AWSSubdomainName,ParameterValue=aws.linknode.com \
  --capabilities CAPABILITY_NAMED_IAM

# Monitor deployment
aws cloudformation wait stack-update-complete \
  --stack-name linknote-production
```

### Step 2: Validate SSL Certificate

After the stack update, AWS Certificate Manager will require DNS validation for the new domain:

```bash
# Get certificate ARN
CERT_ARN=$(aws cloudformation describe-stacks \
  --stack-name linknote-production \
  --query 'Stacks[0].Outputs[?OutputKey==`SSLCertificateArn`].OutputValue' \
  --output text)

# Get validation records
aws acm describe-certificate \
  --certificate-arn $CERT_ARN \
  --query 'Certificate.DomainValidationOptions[?DomainName==`aws.linknode.com`].ResourceRecord' \
  --output table
```

The output will show a CNAME record that needs to be added to your DNS:
```
Name: _xxxxxxxxxxxxx.aws.linknode.com
Value: _xxxxxxxxxxxxx.acm-validations.aws.
```

### Step 3: Configure DNS in CloudFlare

Add the following DNS records to the `linknode.com` zone in CloudFlare:

#### A. Certificate Validation Record
```bash
# Add the CNAME record from Step 2 output
# Example:
Type: CNAME
Name: _xxxxxxxxxxxxx.aws.linknode.com
Content: _xxxxxxxxxxxxx.acm-validations.aws.
TTL: Auto
Proxy: Off (important for validation)
```

#### B. Domain Alias Record
```bash
Type: CNAME
Name: aws.linknode.com
Content: d288vhnilf4g47.cloudfront.net
TTL: Auto
Proxy: On (optional, for CloudFlare CDN)
```

**Using CloudFlare API:**
```bash
# Set your CloudFlare credentials
export CLOUDFLARE_API_TOKEN="your-token-here"
export CLOUDFLARE_ZONE_ID="zone-id-for-linknode.com"

# Create DNS record for aws.linknode.com
curl -X POST "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/dns_records" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{
    "type": "CNAME",
    "name": "aws",
    "content": "d288vhnilf4g47.cloudfront.net",
    "ttl": 300,
    "proxied": true,
    "comment": "AWS Portfolio Demo - CloudFront Distribution"
  }'
```

### Step 4: Wait for Certificate Validation

Certificate validation typically takes 5-30 minutes:

```bash
# Monitor certificate validation status
aws acm describe-certificate \
  --certificate-arn $CERT_ARN \
  --query 'Certificate.DomainValidationOptions[?DomainName==`aws.linknode.com`].ValidationStatus' \
  --output text

# Wait for SUCCESS status
watch -n 30 'aws acm describe-certificate \
  --certificate-arn $CERT_ARN \
  --query "Certificate.DomainValidationOptions[?DomainName==\`aws.linknode.com\`].ValidationStatus" \
  --output text'
```

### Step 5: Verify CloudFront Configuration

```bash
# Get distribution ID
DIST_ID=$(aws cloudformation describe-stacks \
  --stack-name linknote-production \
  --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDistributionId`].OutputValue' \
  --output text)

# Check distribution aliases
aws cloudfront get-distribution \
  --id $DIST_ID \
  --query 'Distribution.DistributionConfig.Aliases' \
  --output table
```

Expected output should include:
- linknote.com
- www.linknote.com
- aws.linknode.com

### Step 6: Test the New Domain

```bash
# Test DNS resolution
dig aws.linknode.com +short

# Test HTTPS connection
curl -I https://aws.linknode.com

# Test with full validation
curl -v https://aws.linknode.com
```

## Rollback Procedure

If you need to rollback to the old configuration:

```bash
# Update stack to remove aws.linknode.com
aws cloudformation update-stack \
  --stack-name linknote-production \
  --template-body file://config/linknote-infrastructure.yaml \
  --parameters ParameterKey=AWSSubdomainName,ParameterValue=aws.linknote.com \
  --capabilities CAPABILITY_NAMED_IAM

# Remove DNS record from CloudFlare
curl -X DELETE "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/dns_records/{record_id}" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"
```

## Troubleshooting

### Certificate Validation Stuck
- **Problem**: Certificate validation remains in "Pending Validation" status
- **Solution**:
  1. Verify the CNAME record is added correctly in DNS
  2. Ensure proxy mode is OFF for validation records
  3. Wait up to 30 minutes for propagation
  4. Check DNS propagation: `dig _xxxxxx.aws.linknode.com CNAME +short`

### CloudFront Returns 403/504 Errors
- **Problem**: Domain points to CloudFront but returns errors
- **Solution**:
  1. Verify certificate validation is complete
  2. Check CloudFront distribution status is "Deployed"
  3. Wait 15-20 minutes for CloudFront propagation
  4. Verify alternate domain names in CloudFront console

### DNS Not Resolving
- **Problem**: `dig aws.linknode.com` returns no results
- **Solution**:
  1. Verify DNS record is created in correct zone (linknode.com)
  2. Check CloudFlare DNS settings
  3. Wait 5 minutes for DNS propagation
  4. Test with different DNS servers: `dig @8.8.8.8 aws.linknode.com`

## Cost Impact

No additional costs for this migration:
- **Certificate Manager**: Free for CloudFront certificates
- **CloudFront**: No charge for additional aliases
- **DNS**: Included in CloudFlare plan

## Timeline

| Phase | Duration | Description |
|-------|----------|-------------|
| Stack Update | 5-10 min | CloudFormation updates resources |
| Certificate Validation | 5-30 min | ACM validates domain ownership |
| CloudFront Propagation | 15-20 min | Distribution updates to edge locations |
| DNS Propagation | 5-60 min | DNS changes propagate globally |
| **Total** | **30-120 min** | Complete migration time |

## Post-Migration

### Update Documentation
Update any references to aws.linknote.com:
- README files
- Documentation
- Links in presentations
- External references

### Monitor Access
Check CloudFront access logs for:
- Traffic to new domain
- SSL/TLS errors
- Geographic distribution

### Deprecate Old Domain
After confirming the new domain works:
1. Keep aws.linknote.com active for 30 days
2. Set up redirect if needed
3. Update all external references
4. Remove old domain from certificate (optional)

## Additional Notes

- The CloudFront distribution ID (d288vhnilf4g47.cloudfront.net) remains unchanged
- Both aws.linknote.com and aws.linknode.com can coexist during transition
- No downtime expected during migration
- DNS TTL is set to 300 seconds (5 minutes) for quick updates
