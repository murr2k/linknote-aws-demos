#!/bin/bash
# Complete the aws.linknode.com migration after certificate validation

set -e

echo "🚀 Completing AWS Subdomain Migration to aws.linknode.com"
echo ""

# Configuration
DIST_ID="E2YEJACEYDBDX3"
NEW_CERT_ARN="arn:aws:acm:us-east-1:553386187835:certificate/482923dd-1c60-4e48-8a62-f0a150f57447"
OLD_CERT_ARN="arn:aws:acm:us-east-1:553386187835:certificate/0d54d5ea-4c84-47bf-9b17-8785f58593ea"

echo "📋 Configuration:"
echo "   CloudFront Distribution: $DIST_ID"
echo "   New Certificate ARN: $NEW_CERT_ARN"
echo ""

# Step 1: Check certificate validation status
echo "🔍 Step 1: Checking certificate validation status..."
CERT_STATUS=$(aws acm describe-certificate \
  --certificate-arn "$NEW_CERT_ARN" \
  --region us-east-1 \
  --query 'Certificate.Status' \
  --output text)

if [ "$CERT_STATUS" != "ISSUED" ]; then
    echo "❌ Certificate is not yet validated (Status: $CERT_STATUS)"
    echo ""
    echo "Please complete certificate validation first:"
    echo "1. Add DNS validation records (see CERTIFICATE_VALIDATION_RECORDS.md)"
    echo "2. Wait for validation to complete (5-30 minutes)"
    echo "3. Run this script again"
    echo ""
    echo "Monitor validation status:"
    echo "aws acm describe-certificate --certificate-arn $NEW_CERT_ARN --region us-east-1 \\"
    echo "  --query 'Certificate.DomainValidationOptions[*].[DomainName, ValidationStatus]' --output table"
    exit 1
fi

echo "✅ Certificate is validated and issued"
echo ""

# Step 2: Get current CloudFront configuration
echo "🔍 Step 2: Getting current CloudFront distribution configuration..."
ETAG=$(aws cloudfront get-distribution --id "$DIST_ID" --query 'ETag' --output text)
aws cloudfront get-distribution --id "$DIST_ID" --query 'Distribution.DistributionConfig' > /tmp/cf-config.json

echo "✅ Retrieved distribution configuration (ETag: $ETAG)"
echo ""

# Step 3: Update configuration with new domain and certificate
echo "📝 Step 3: Updating configuration..."

# Add aws.linknode.com to aliases
jq '.Aliases.Items += ["aws.linknode.com"] | .Aliases.Quantity = (.Aliases.Items | length)' /tmp/cf-config.json > /tmp/cf-config-updated.json

# Update certificate ARN
jq --arg cert "$NEW_CERT_ARN" '.ViewerCertificate.ACMCertificateArn = $cert' /tmp/cf-config-updated.json > /tmp/cf-config-final.json

echo "✅ Configuration updated"
echo ""

# Step 4: Show what will change
echo "📊 Step 4: Summary of changes:"
echo ""
echo "  Current Aliases:"
jq -r '.Aliases.Items[]' /tmp/cf-config.json | sed 's/^/    - /'
echo ""
echo "  New Aliases:"
jq -r '.Aliases.Items[]' /tmp/cf-config-final.json | sed 's/^/    - /'
echo ""
echo "  Current Certificate: $OLD_CERT_ARN"
echo "  New Certificate: $NEW_CERT_ARN"
echo ""

# Confirm update
read -p "⚠️  Apply these changes to CloudFront distribution? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Update cancelled"
    rm -f /tmp/cf-config*.json
    exit 1
fi
echo ""

# Step 5: Update CloudFront distribution
echo "🔄 Step 5: Updating CloudFront distribution..."
echo "   This will take 15-20 minutes to propagate globally..."
echo ""

UPDATE_RESULT=$(aws cloudfront update-distribution \
  --id "$DIST_ID" \
  --distribution-config file:///tmp/cf-config-final.json \
  --if-match "$ETAG" \
  --query 'Distribution.[Id,Status]' \
  --output text)

echo "✅ CloudFront distribution update initiated"
echo "   Status: $UPDATE_RESULT"
echo ""

# Clean up temp files
rm -f /tmp/cf-config*.json

# Step 6: Monitor deployment status
echo "⏳ Step 6: Monitoring deployment status..."
echo "   Checking every 30 seconds (this may take 15-20 minutes)..."
echo ""

for i in {1..40}; do
    STATUS=$(aws cloudfront get-distribution --id "$DIST_ID" --query 'Distribution.Status' --output text)
    if [ "$STATUS" = "Deployed" ]; then
        echo "✅ Distribution deployed successfully!"
        break
    fi
    echo "   Status: $STATUS (Check $i/40)"
    if [ $i -lt 40 ]; then
        sleep 30
    fi
done

if [ "$STATUS" != "Deployed" ]; then
    echo "⚠️  Distribution is still deploying after 20 minutes"
    echo "   Monitor manually: aws cloudfront get-distribution --id $DIST_ID"
else
    echo ""
    echo "🎯 Migration Complete!"
    echo ""
    echo "📋 Next Steps:"
    echo ""
    echo "1. Add DNS CNAME for aws.linknode.com in CloudFlare (linknode.com zone):"
    echo "   Type: CNAME"
    echo "   Name: aws.linknode.com"
    echo "   Target: d288vhnilf4g47.cloudfront.net"
    echo "   TTL: 300"
    echo "   Proxy: ON"
    echo ""
    echo "2. Test the new domain (after DNS propagates):"
    echo "   curl -I https://aws.linknode.com"
    echo ""
    echo "3. Verify SSL certificate:"
    echo "   curl -vI https://aws.linknode.com 2>&1 | grep -A 5 'subject:'"
    echo ""
fi

echo ""
echo "✅ Script complete!"
