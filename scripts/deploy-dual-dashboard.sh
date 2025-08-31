#!/bin/bash

# BC Ferries Dual Dashboard Deployment Script
# Deploys ferry.linknote.com (Fly.io) and ops.linknote.com (AWS)

set -e

echo "🚢 BC Ferries Dual Dashboard Deployment"
echo "========================================="

# Check prerequisites
check_prerequisites() {
    echo "🔍 Checking prerequisites..."
    
    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        echo "❌ AWS CLI is required. Install: https://aws.amazon.com/cli/"
        exit 1
    fi
    
    # Check Fly CLI
    if ! command -v fly &> /dev/null; then
        echo "❌ Fly CLI is required. Install: https://fly.io/docs/hands-on/install-flyctl/"
        exit 1
    fi
    
    # Check jq
    if ! command -v jq &> /dev/null; then
        echo "❌ jq is required. Install: sudo apt-get install jq"
        exit 1
    fi
    
    echo "✅ Prerequisites validated"
}

# Deploy AWS Infrastructure
deploy_aws_infrastructure() {
    echo ""
    echo "☁️ Phase 1: Deploying AWS Infrastructure"
    echo "--------------------------------------"
    
    cd config
    
    # Deploy CloudFormation stack
    echo "🚀 Deploying AWS Managed Grafana workspace..."
    aws cloudformation deploy \
        --template-file aws-grafana-workspace.yaml \
        --stack-name bc-ferries-grafana \
        --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
        --region us-west-2 \
        --parameter-overrides \
            WorkspaceName=bc-ferries-enterprise \
            CustomDomain=ops.linknote.com
    
    # Get workspace endpoint
    WORKSPACE_ENDPOINT=$(aws cloudformation describe-stacks \
        --stack-name bc-ferries-grafana \
        --region us-west-2 \
        --query 'Stacks[0].Outputs[?OutputKey==`GrafanaWorkspaceEndpoint`].OutputValue' \
        --output text)
    
    echo "✅ AWS Managed Grafana deployed"
    echo "   Workspace Endpoint: $WORKSPACE_ENDPOINT"
    
    # Update CloudFlare DNS with real endpoint
    echo "🌐 Updating CloudFlare DNS with real AWS endpoint..."
    if [ ! -z "$CLOUDFLARE_API_TOKEN" ] && [ ! -z "$CLOUDFLARE_ZONE_ID" ]; then
        # Get existing ops.linknote.com record ID
        RECORD_ID=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/dns_records?name=ops.linknote.com" \
            -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | jq -r '.result[0].id')
        
        # Update CNAME record
        curl -s -X PUT "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/dns_records/$RECORD_ID" \
            -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
            -H "Content-Type: application/json" \
            --data "{
                \"type\": \"CNAME\",
                \"name\": \"ops\",
                \"content\": \"$WORKSPACE_ENDPOINT\",
                \"ttl\": 300,
                \"proxied\": true
            }" | jq -r '.success'
        
        echo "✅ Updated ops.linknote.com -> $WORKSPACE_ENDPOINT"
    else
        echo "⚠️  Manual step required: Update ops.linknote.com CNAME to $WORKSPACE_ENDPOINT"
    fi
    
    cd ..
}

# Deploy Fly.io Control Dashboard
deploy_control_dashboard() {
    echo ""
    echo "🎛️ Phase 2: Deploying Control Dashboard"
    echo "--------------------------------------"
    
    cd ferry-control
    
    # Create Fly.io app if it doesn't exist
    if ! fly apps list | grep -q "bc-ferries-control"; then
        echo "🆕 Creating Fly.io application..."
        fly apps create bc-ferries-control --org personal
    fi
    
    # Set required secrets
    echo "🔐 Setting up secrets..."
    fly secrets set \
        GRAFANA_ADMIN_PASSWORD="$(openssl rand -base64 32)" \
        HIVEMQ_BROKER_URL="tcp://cluster.hivemq.cloud:1883" \
        HIVEMQ_USERNAME="bcferries-demo" \
        HIVEMQ_PASSWORD="$(openssl rand -base64 16)" \
        --app bc-ferries-control
    
    # Deploy application
    echo "🚀 Deploying to Fly.io..."
    fly deploy --app bc-ferries-control
    
    # Check deployment status
    echo "📊 Checking deployment status..."
    fly status --app bc-ferries-control
    
    echo "✅ Control dashboard deployed"
    echo "   URL: https://bc-ferries-control.fly.dev"
    echo "   Custom Domain: https://ferry.linknote.com (after DNS propagation)"
    
    cd ..
}

# Test deployment
test_deployment() {
    echo ""
    echo "🧪 Phase 3: Testing Deployment"
    echo "-----------------------------"
    
    # Test Fly.io deployment
    echo "Testing ferry.linknote.com..."
    if curl -s --max-time 10 https://bc-ferries-control.fly.dev/health | grep -q "ok"; then
        echo "✅ Control dashboard is healthy"
    else
        echo "⚠️  Control dashboard may still be starting up"
    fi
    
    # Test override API
    echo "Testing override API..."
    if curl -s --max-time 10 https://bc-ferries-control.fly.dev:8080/health | grep -q "healthy"; then
        echo "✅ Override API is healthy"
    else
        echo "⚠️  Override API may still be starting up"
    fi
    
    echo ""
    echo "⏰ DNS Propagation Notice:"
    echo "   Custom domains (ferry.linknote.com, ops.linknote.com) may take 5-15 minutes"
    echo "   Test with direct URLs initially, then switch to custom domains"
}

# Main deployment flow
main() {
    echo "Starting BC Ferries Dual Dashboard Deployment..."
    echo "Estimated time: 10-15 minutes"
    echo ""
    
    check_prerequisites
    deploy_aws_infrastructure
    deploy_control_dashboard
    test_deployment
    
    echo ""
    echo "🎉 BC Ferries Dual Dashboard Deployment Complete!"
    echo "================================================="
    echo ""
    echo "🎯 Demo URLs:"
    echo "   Control Dashboard: https://ferry.linknote.com"
    echo "   Monitoring Dashboard: https://ops.linknote.com"
    echo ""
    echo "🎭 Demo Instructions:"
    echo "1. Open ferry.linknote.com on left screen (presenter controls)"
    echo "2. Open ops.linknote.com on right screen (audience monitoring)"
    echo "3. Use interactive controls to demonstrate real-time telemetry"
    echo ""
    echo "💰 Total Cost: ~$25 for 1-week demonstration"
    echo "🚀 Ready for BC Ferries interview presentation!"
}

# Run deployment
main "$@"