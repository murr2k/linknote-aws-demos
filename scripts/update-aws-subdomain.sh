#!/bin/bash
# Update CloudFormation stack to add aws.linknode.com to certificate and CloudFront

set -e

echo "🚀 AWS Subdomain Migration: aws.linknote.com → aws.linknode.com"
echo ""

# Configuration
STACK_NAME="${1:-linknote-production}"
AWS_REGION="${2:-us-east-1}"
NEW_SUBDOMAIN="aws.linknode.com"

echo "📋 Configuration:"
echo "   Stack Name: $STACK_NAME"
echo "   Region: $AWS_REGION"
echo "   New Subdomain: $NEW_SUBDOMAIN"
echo ""

# Check if stack exists
echo "🔍 Checking if stack exists..."
if ! aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$AWS_REGION" &>/dev/null; then
    echo "❌ Error: Stack '$STACK_NAME' not found in region '$AWS_REGION'"
    exit 1
fi
echo "✅ Stack found"
echo ""

# Get current CloudFront distribution ID
echo "📊 Getting current CloudFront distribution..."
DIST_ID=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$AWS_REGION" \
  --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDistributionId`].OutputValue' \
  --output text)

if [ -z "$DIST_ID" ]; then
    echo "❌ Error: Could not find CloudFront distribution ID"
    exit 1
fi
echo "   Distribution ID: $DIST_ID"
echo ""

# Show current aliases
echo "📋 Current CloudFront aliases:"
aws cloudfront get-distribution \
  --id "$DIST_ID" \
  --query 'Distribution.DistributionConfig.Aliases.Items' \
  --output table
echo ""

# Confirm update
echo "⚠️  This will update the CloudFormation stack to add $NEW_SUBDOMAIN"
read -p "Continue? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Update cancelled"
    exit 1
fi
echo ""

# Update stack
echo "🔄 Updating CloudFormation stack..."
UPDATE_ID=$(aws cloudformation update-stack \
  --stack-name "$STACK_NAME" \
  --region "$AWS_REGION" \
  --template-body file://config/linknote-infrastructure.yaml \
  --parameters ParameterKey=AWSSubdomainName,ParameterValue="$NEW_SUBDOMAIN" \
  --capabilities CAPABILITY_NAMED_IAM \
  --query 'StackId' \
  --output text)

if [ -z "$UPDATE_ID" ]; then
    echo "❌ Error: Stack update failed to start"
    exit 1
fi

echo "✅ Stack update initiated"
echo "   Update ID: $UPDATE_ID"
echo ""

# Wait for stack update to complete
echo "⏳ Waiting for stack update to complete (this may take 5-10 minutes)..."
if aws cloudformation wait stack-update-complete \
  --stack-name "$STACK_NAME" \
  --region "$AWS_REGION"; then
    echo "✅ Stack update completed successfully"
else
    echo "❌ Stack update failed"
    echo ""
    echo "Check CloudFormation console for details:"
    echo "https://console.aws.amazon.com/cloudformation/home?region=$AWS_REGION#/stacks"
    exit 1
fi
echo ""

# Get certificate ARN
echo "🔐 Getting SSL certificate information..."
CERT_ARN=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$AWS_REGION" \
  --query 'Stacks[0].Outputs[?OutputKey==`SSLCertificateArn`].OutputValue' \
  --output text)

echo "   Certificate ARN: $CERT_ARN"
echo ""

# Get validation records
echo "📝 Certificate validation records for $NEW_SUBDOMAIN:"
aws acm describe-certificate \
  --certificate-arn "$CERT_ARN" \
  --region "$AWS_REGION" \
  --query "Certificate.DomainValidationOptions[?DomainName=='$NEW_SUBDOMAIN'].ResourceRecord" \
  --output table
echo ""

# Show updated aliases
echo "📋 Updated CloudFront aliases:"
aws cloudfront get-distribution \
  --id "$DIST_ID" \
  --query 'Distribution.DistributionConfig.Aliases.Items' \
  --output table
echo ""

# Instructions
echo "🎯 Next Steps:"
echo ""
echo "1. Add DNS Validation Record in CloudFlare (linknode.com zone):"
echo "   - Copy the CNAME record shown above"
echo "   - Add it to your DNS provider"
echo "   - IMPORTANT: Set Proxy to OFF for validation records"
echo ""
echo "2. Add Domain CNAME Record:"
echo "   Type: CNAME"
echo "   Name: aws.linknode.com"
echo "   Content: $DIST_ID.cloudfront.net"
echo "   TTL: 300"
echo "   Proxy: On"
echo ""
echo "3. Monitor certificate validation:"
echo "   aws acm describe-certificate \\"
echo "     --certificate-arn $CERT_ARN \\"
echo "     --region $AWS_REGION \\"
echo "     --query \"Certificate.DomainValidationOptions[?DomainName=='$NEW_SUBDOMAIN'].ValidationStatus\" \\"
echo "     --output text"
echo ""
echo "4. Test the new domain (after validation completes):"
echo "   curl -I https://$NEW_SUBDOMAIN"
echo ""
echo "📖 Full documentation: docs/aws-subdomain-migration.md"
echo ""
echo "✅ CloudFormation update complete!"
