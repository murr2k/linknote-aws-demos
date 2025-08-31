#!/bin/bash

# Setup AWS CLI access using GitHub repository secrets
# This script helps configure AWS CLI locally for debugging purposes

set -e

echo "🔧 AWS CLI Configuration Setup"
echo "============================="

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI not found. Installing..."
    curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
    unzip awscliv2.zip
    sudo ./aws/install
    rm -rf aws awscliv2.zip
    echo "✅ AWS CLI installed"
fi

echo ""
echo "📋 AWS Credentials Setup Required"
echo "================================"
echo ""
echo "The GitHub repository has these AWS secrets:"
gh secret list --repo murr2k/linknote-aws-demos | grep AWS

echo ""
echo "⚙️  To configure AWS CLI locally, you'll need to:"
echo "   1. Get the actual credential values (not exposed by GitHub for security)"
echo "   2. Run: aws configure"
echo "   3. Or set environment variables:"
echo ""
echo "      export AWS_ACCESS_KEY_ID='your-access-key'"
echo "      export AWS_SECRET_ACCESS_KEY='your-secret-key'" 
echo "      export AWS_DEFAULT_REGION='us-west-2'"
echo ""
echo "💡 Alternative: Use AWS SSO or temporary credentials if available"

# Check if we have any AWS credentials available
if aws sts get-caller-identity &>/dev/null; then
    echo ""
    echo "✅ AWS credentials are already configured!"
    echo "   Account: $(aws sts get-caller-identity --query Account --output text)"
    echo "   User: $(aws sts get-caller-identity --query Arn --output text)"
    echo "   Region: $(aws configure get region)"
else
    echo ""
    echo "⚠️  No AWS credentials found in local environment"
    echo "   Need to configure credentials to investigate CloudFormation errors"
fi

echo ""
echo "🌍 AWS Managed Grafana Regional Availability"
echo "==========================================="
echo ""
echo "AWS Managed Grafana is available in these regions:"
echo "• us-east-1 (N. Virginia) - Primary"
echo "• us-east-2 (Ohio)"
echo "• us-west-2 (Oregon) - Current"
echo "• eu-west-1 (Ireland)"
echo "• eu-central-1 (Frankfurt)"
echo "• ap-southeast-2 (Sydney)"
echo ""
echo "📊 Recommended region optimization for BC Ferries:"
echo "   us-west-1 (N. California) - Closest to Vancouver"
echo "   us-west-2 (Oregon) - Current, good latency"
echo "   us-east-1 (N. Virginia) - Most services, lowest cost"