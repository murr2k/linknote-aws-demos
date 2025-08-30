#!/bin/bash
# Manual deployment script for AWS S3 + CloudFront
# Uses AWS Secrets Manager for secure credential management

set -e

echo "🚀 Deploying Linknote AWS Demo to Production"
echo "============================================"

# Function to get secret from AWS Secrets Manager
get_secret() {
    local secret_name="$1"
    aws secretsmanager get-secret-value --secret-id "$secret_name" --query 'SecretString' --output text
}

# Check AWS authentication
if ! aws sts get-caller-identity >/dev/null 2>&1; then
    echo "❌ AWS credentials not configured"
    echo "ℹ️  Use: aws configure sso"
    exit 1
fi

echo "✅ AWS authentication verified"

# Deploy to S3
echo "📤 Uploading website to S3..."
aws s3 sync website/ s3://linknote.com/ --delete --exclude "*.md"
aws s3 sync website/ s3://www.linknote.com/ --delete --exclude "*.md"

# Invalidate CloudFront cache
echo "♻️  Invalidating CloudFront cache..."
aws cloudfront create-invalidation --distribution-id E2YEJACEYDBDX3 --paths "/*"

echo "🌐 Deployment complete!"
echo "Live site: https://linknote.com"
echo "GitHub: https://github.com/murr2k/linknote-aws-demos"