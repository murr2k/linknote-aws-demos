#!/bin/bash

# BC Ferries Dual Dashboard - CloudFlare DNS Configuration
# Sets up ferry.linknote.com and ops.linknote.com subdomains

set -e

echo "🌐 Setting up CloudFlare DNS for BC Ferries Dual Dashboard Demo"

# Check required environment variables
if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
    echo "❌ Error: CLOUDFLARE_API_TOKEN environment variable is required"
    echo "   Get your token from: https://dash.cloudflare.com/profile/api-tokens"
    exit 1
fi

if [ -z "$CLOUDFLARE_ZONE_ID" ]; then
    echo "❌ Error: CLOUDFLARE_ZONE_ID environment variable is required"
    echo "   Find your Zone ID in CloudFlare dashboard for linknote.com"
    exit 1
fi

# CloudFlare API endpoints
CF_API="https://api.cloudflare.com/client/v4"
ZONE_ID="$CLOUDFLARE_ZONE_ID"

echo "📋 Zone ID: $ZONE_ID"

# Function to create DNS record
create_dns_record() {
    local name=$1
    local content=$2
    local description=$3
    
    echo "Creating DNS record: $name.linknote.com -> $content"
    
    response=$(curl -s -X POST "$CF_API/zones/$ZONE_ID/dns_records" \
        -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
        -H "Content-Type: application/json" \
        --data "{
            \"type\": \"CNAME\",
            \"name\": \"$name\",
            \"content\": \"$content\",
            \"ttl\": 300,
            \"proxied\": true,
            \"comment\": \"$description\"
        }")
    
    success=$(echo "$response" | jq -r '.success')
    if [ "$success" = "true" ]; then
        echo "✅ Successfully created $name.linknote.com"
        record_id=$(echo "$response" | jq -r '.result.id')
        echo "   Record ID: $record_id"
    else
        echo "❌ Failed to create $name.linknote.com"
        echo "$response" | jq -r '.errors[]'
    fi
}

# Function to configure SSL settings
configure_ssl() {
    echo "🔒 Configuring SSL/TLS settings for linknote.com zone"
    
    # Set SSL mode to Full (strict)
    curl -s -X PATCH "$CF_API/zones/$ZONE_ID/settings/ssl" \
        -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
        -H "Content-Type: application/json" \
        --data '{"value": "full"}' | jq -r '.success'
    
    # Enable Always Use HTTPS
    curl -s -X PATCH "$CF_API/zones/$ZONE_ID/settings/always_use_https" \
        -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
        -H "Content-Type: application/json" \
        --data '{"value": "on"}' | jq -r '.success'
    
    # Enable Automatic HTTPS Rewrites
    curl -s -X PATCH "$CF_API/zones/$ZONE_ID/settings/automatic_https_rewrites" \
        -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
        -H "Content-Type: application/json" \
        --data '{"value": "on"}' | jq -r '.success'
        
    echo "✅ SSL settings configured"
}

# Create DNS records for dual dashboard setup
echo "🚢 Creating ferry.linknote.com (Vessel Control Dashboard)"
create_dns_record "ferry" "bc-ferries-control.fly.dev" "BC Ferries Vessel Control Dashboard - Interactive Grafana on Fly.io"

echo "📊 Creating ops.linknote.com (Enterprise Monitoring Dashboard)"  
echo "⚠️  Note: AWS Grafana endpoint will be updated after workspace deployment"
# Placeholder - will be updated with actual AWS endpoint after CloudFormation deployment
create_dns_record "ops" "placeholder.grafana-workspace.us-west-2.amazonaws.com" "BC Ferries Enterprise Monitoring - AWS Managed Grafana"

# Configure SSL settings
configure_ssl

echo ""
echo "🎯 CloudFlare DNS Configuration Complete!"
echo ""
echo "📋 Next Steps:"
echo "1. Deploy AWS CloudFormation stack to get actual Grafana endpoint"
echo "2. Update ops.linknote.com CNAME record with real AWS endpoint"
echo "3. Deploy Fly.io application for ferry.linknote.com"
echo "4. Test both subdomains with SSL"
echo ""
echo "🌐 Planned URLs:"
echo "   Control Dashboard: https://ferry.linknote.com"
echo "   Monitoring Dashboard: https://ops.linknote.com"
echo ""
echo "💰 Additional Cost: ~$25/week for dual dashboard setup"