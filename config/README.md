# CloudFormation Configuration

This directory contains Infrastructure as Code (IaC) templates and deployment scripts for the Linknote.com AWS architecture.

## Files

- **`linknote-infrastructure.yaml`** - Main CloudFormation template
- **`deploy-stack.sh`** - Automated deployment script  
- **`parameters.json`** - Template parameters configuration
- **`README.md`** - This documentation

## Quick Deployment

```bash
# Deploy with defaults
./config/deploy-stack.sh

# Deploy with custom stack name and region  
./config/deploy-stack.sh my-linknote-stack us-west-2

# Deploy with parameters file
aws cloudformation deploy \
  --template-file config/linknote-infrastructure.yaml \
  --stack-name linknote-production \
  --parameter-overrides file://config/parameters.json \
  --capabilities CAPABILITY_NAMED_IAM
```

## Resources Created

### Infrastructure
- **S3 Buckets**: Main site and WWW redirect
- **CloudFront Distribution**: Global CDN with custom SSL
- **Certificate Manager**: Free SSL/TLS certificates
- **Origin Access Identity**: Secure S3 access

### Security & Compliance  
- **Secrets Manager**: Application secret storage
- **CloudTrail**: Complete audit logging
- **IAM Role**: GitHub Actions deployment permissions
- **KMS**: Encryption key management

### Cost Optimization
- **S3 Lifecycle Rules**: Automatic archiving
- **CloudFront Price Class**: Regional optimization
- **Free Tier Alignment**: All services within limits

## Post-Deployment Steps

1. **SSL Certificate Validation**
   ```bash
   # Get validation records from Certificate Manager
   aws acm describe-certificate \
     --certificate-arn $(aws cloudformation describe-stacks \
       --stack-name linknote-production \
       --query 'Stacks[0].Outputs[?OutputKey==`SSLCertificateArn`].OutputValue' \
       --output text)
   ```

2. **DNS Configuration**
   - Add CNAME records for SSL validation
   - Point domain to CloudFront distribution

3. **Website Upload**
   ```bash
   # Upload files to S3
   aws s3 sync website/ s3://linknote.com/ --delete
   
   # Invalidate CloudFront cache
   aws cloudfront create-invalidation \
     --distribution-id $(aws cloudformation describe-stacks \
       --stack-name linknote-production \
       --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDistributionId`].OutputValue' \
       --output text) \
     --paths "/*"
   ```

## Cost Estimate

| Service | Monthly Cost | Notes |
|---------|--------------|--------|
| S3 | $0.00 | Within free tier (5GB) |
| CloudFront | $0.00 | Within free tier (1TB) |
| Certificate Manager | $0.00 | Free for CloudFront |
| Secrets Manager | ~$0.80 | $0.40 per secret per month |
| CloudTrail | $0.00 | Within free tier |
| **Total** | **< $1.00** | Optimized for free tier |

## Security Features

- **Zero Hardcoded Secrets**: All credentials in Secrets Manager
- **Encryption Everywhere**: S3, Secrets Manager, CloudTrail
- **Least Privilege IAM**: Minimal required permissions
- **Complete Audit Trail**: CloudTrail logs all actions
- **Origin Access Identity**: Direct S3 access blocked

## Monitoring & Alerts

Stack includes CloudWatch integration for:
- CloudFront request metrics
- S3 access patterns  
- Certificate expiration alerts
- Cost anomaly detection

## Rollback Procedure

```bash
# Delete stack (preserves S3 data)
aws cloudformation delete-stack --stack-name linknote-production

# Force delete with data loss prevention
aws s3 sync s3://linknote.com/ backup/ --delete
aws cloudformation delete-stack --stack-name linknote-production
```

## Troubleshooting

### Certificate Validation Fails
- Verify DNS validation records in domain provider
- Check Certificate Manager console for status
- Ensure domains match exactly (no typos)

### CloudFront 403 Errors
- Verify S3 bucket policy allows CloudFront access
- Check Origin Access Identity configuration
- Ensure default root object is set

### GitHub Actions Deployment Fails  
- Verify IAM role trust policy includes correct repository
- Check GitHub OIDC provider is configured
- Validate IAM permissions for S3 and CloudFront

## Advanced Configuration

### Custom Domain Validation
For programmatic certificate validation, add hosted zone:

```yaml
Parameters:
  HostedZoneId:
    Type: String
    Description: Route 53 Hosted Zone ID for automatic validation
    
Resources:
  LinknoteSSLCertificate:
    Type: AWS::CertificateManager::Certificate
    Properties:
      DomainValidationOptions:
        - DomainName: !Ref DomainName
          HostedZoneId: !Ref HostedZoneId
```

### Multi-Environment Support
Use nested stacks for dev/staging/prod environments:

```bash
# Deploy to staging
./config/deploy-stack.sh linknote-staging us-east-1 staging

# Deploy to production  
./config/deploy-stack.sh linknote-production us-east-1 production
```