#!/bin/bash
# CloudFlare DNS Configuration for BC Ferries Dual Dashboard

echo "🌐 Configuring CloudFlare DNS for BC Ferries Dual Dashboard"

# Get CloudFlare credentials from environment
CLOUDFLARE_API_TOKEN=${CLOUDFLARE_API_TOKEN}
ZONE_ID="your-zone-id-here"

if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
    echo "❌ CLOUDFLARE_API_TOKEN not set"
    echo "Please export your CloudFlare API token:"
    echo "export CLOUDFLARE_API_TOKEN='your-token-here'"
    exit 1
fi

# Function to create DNS record
create_dns_record() {
    local name=$1
    local target=$2
    local type=${3:-CNAME}
    
    echo "Creating $type record: $name -> $target"
    
    curl -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
        -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
        -H "Content-Type: application/json" \
        --data "{
            \"type\": \"$type\",
            \"name\": \"$name\",
            \"content\": \"$target\",
            \"ttl\": 300,
            \"proxied\": true
        }" | jq '.'
}

echo "📊 Creating ops.linknote.com subdomain..."
# Point ops subdomain to Grafana Cloud workspace (will be configured)
create_dns_record "ops.linknote.com" "linknote.com"

echo "⛴️ Creating ferry.linknote.com subdomain..."  
# Point ferry subdomain to Fly.io app (will be deployed)
create_dns_record "ferry.linknote.com" "linknote.com"

echo "✅ DNS configuration completed"
echo ""
echo "Next steps:"
echo "1. Deploy Fly.io app for ferry.linknote.com"
echo "2. Configure Grafana Cloud for ops.linknote.com"
echo "3. Update DNS records with actual targets"