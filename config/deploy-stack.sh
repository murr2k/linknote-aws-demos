#!/bin/bash
# CloudFormation deployment script for Linknote infrastructure
# Usage: ./deploy-stack.sh [stack-name] [region]

set -e

# Configuration
STACK_NAME="${1:-linknote-production}"
AWS_REGION="${2:-us-east-1}"
TEMPLATE_FILE="$(dirname "$0")/linknote-infrastructure.yaml"

echo "🚀 Deploying Linknote CloudFormation Stack"
echo "==========================================="
echo "Stack Name: $STACK_NAME"
echo "Region: $AWS_REGION"
echo "Template: $TEMPLATE_FILE"
echo ""

# Validate template
echo "📋 Validating CloudFormation template..."
aws cloudformation validate-template \
    --template-body "file://$TEMPLATE_FILE" \
    --region "$AWS_REGION"

echo "✅ Template validation successful"
echo ""

# Check if stack exists
if aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    >/dev/null 2>&1; then
    
    echo "🔄 Updating existing stack..."
    OPERATION="update-stack"
    WAIT_CONDITION="stack-update-complete"
else
    echo "🆕 Creating new stack..."
    OPERATION="create-stack"
    WAIT_CONDITION="stack-create-complete"
fi

# Deploy/Update stack
aws cloudformation "$OPERATION" \
    --stack-name "$STACK_NAME" \
    --template-body "file://$TEMPLATE_FILE" \
    --capabilities CAPABILITY_NAMED_IAM \
    --region "$AWS_REGION" \
    --tags \
        Key=Environment,Value=Production \
        Key=Project,Value=LinknotePortfolio \
        Key=Owner,Value=MurrayKopit \
        Key=ManagedBy,Value=CloudFormation

echo "⏳ Waiting for stack operation to complete..."

# Wait for completion
aws cloudformation wait "$WAIT_CONDITION" \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION"

echo ""
echo "✅ Stack operation completed successfully!"
echo ""

# Display outputs
echo "📊 Stack Outputs:"
aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --query 'Stacks[0].Outputs[*].[OutputKey,OutputValue,Description]' \
    --output table

echo ""
echo "🌐 Next Steps:"
echo "1. Configure DNS validation for SSL certificate"
echo "2. Update DNS records to point to CloudFront distribution"
echo "3. Upload website files to S3 bucket"
echo "4. Configure GitHub Actions with stack outputs"
echo ""
echo "🔗 AWS Console:"
echo "https://console.aws.amazon.com/cloudformation/home?region=$AWS_REGION#/stacks/stackinfo?stackId=$STACK_NAME"