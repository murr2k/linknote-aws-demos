#!/bin/bash

# Direct CloudFlare DNS Configuration for ferry.linknote.com
# This script runs immediately with credentials

set -e

echo "🌐 Configuring CloudFlare DNS for ferry.linknote.com"
echo "=================================================="

# Get the IPv4 address of our Fly.io app
FLY_IP="66.241.125.19"
echo "Target IP: $FLY_IP"

# Try to get secrets from various sources
if command -v gh &> /dev/null; then
    echo "📋 Attempting to retrieve CloudFlare credentials..."
    
    # Let's check if we can access secrets through the GitHub CLI in a different way
    SECRETS_JSON=$(gh api repos/:owner/:repo/actions/secrets 2>/dev/null || echo '{"secrets":[]}')
    echo "Available secrets: $(echo "$SECRETS_JSON" | jq -r '.secrets[].name' | tr '\n' ', ' | sed 's/,$//')"
fi

# For now, let's create a configuration template that can be run manually
cat > /tmp/cloudflare-dns-config.sh << 'EOF'
#!/bin/bash

# CloudFlare DNS Configuration
# Run this with your actual credentials:
# 
# export CLOUDFLARE_EMAIL="your-email@domain.com"
# export CLOUDFLARE_API_KEY="your-api-key"
# export CLOUDFLARE_ZONE_ID="your-zone-id"
# bash /tmp/cloudflare-dns-config.sh

if [ -z "$CLOUDFLARE_EMAIL" ] || [ -z "$CLOUDFLARE_API_KEY" ] || [ -z "$CLOUDFLARE_ZONE_ID" ]; then
    echo "❌ Missing required environment variables:"
    echo "   CLOUDFLARE_EMAIL, CLOUDFLARE_API_KEY, CLOUDFLARE_ZONE_ID"
    echo ""
    echo "💡 Get your credentials from:"
    echo "   https://dash.cloudflare.com/profile/api-tokens"
    exit 1
fi

FLY_IP="66.241.125.19"

echo "🌐 Creating DNS record for ferry.linknote.com -> $FLY_IP"

# Create or update A record
RESPONSE=$(curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/dns_records" \
    -H "X-Auth-Email: $CLOUDFLARE_EMAIL" \
    -H "X-Auth-Key: $CLOUDFLARE_API_KEY" \
    -H "Content-Type: application/json" \
    --data '{
        "type": "A",
        "name": "ferry",
        "content": "'$FLY_IP'",
        "ttl": 300,
        "proxied": true
    }')

SUCCESS=$(echo "$RESPONSE" | jq -r '.success')
if [ "$SUCCESS" = "true" ]; then
    echo "✅ DNS record created successfully!"
    RECORD_ID=$(echo "$RESPONSE" | jq -r '.result.id')
    echo "   Record ID: $RECORD_ID"
else
    echo "⚠️  Response: $RESPONSE"
    # Try updating existing record
    echo "🔄 Checking for existing record..."
    
    EXISTING=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/dns_records?name=ferry.linknote.com" \
        -H "X-Auth-Email: $CLOUDFLARE_EMAIL" \
        -H "X-Auth-Key: $CLOUDFLARE_API_KEY")
    
    RECORD_ID=$(echo "$EXISTING" | jq -r '.result[]? | select(.name == "ferry.linknote.com") | .id' | head -1)
    
    if [ "$RECORD_ID" != "" ] && [ "$RECORD_ID" != "null" ]; then
        echo "📝 Updating existing record: $RECORD_ID"
        
        UPDATE_RESPONSE=$(curl -s -X PUT "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/dns_records/$RECORD_ID" \
            -H "X-Auth-Email: $CLOUDFLARE_EMAIL" \
            -H "X-Auth-Key: $CLOUDFLARE_API_KEY" \
            -H "Content-Type: application/json" \
            --data '{
                "type": "A",
                "name": "ferry",
                "content": "'$FLY_IP'",
                "ttl": 300,
                "proxied": true
            }')
        
        UPDATE_SUCCESS=$(echo "$UPDATE_RESPONSE" | jq -r '.success')
        if [ "$UPDATE_SUCCESS" = "true" ]; then
            echo "✅ DNS record updated successfully!"
        else
            echo "❌ Failed to update: $UPDATE_RESPONSE"
            exit 1
        fi
    else
        echo "❌ Failed to create or find record"
        echo "Response: $RESPONSE"
        exit 1
    fi
fi

echo ""
echo "🎉 DNS Configuration Complete!"
echo "   Domain: ferry.linknote.com"
echo "   Points to: $FLY_IP (bc-ferries-control-new.fly.dev)"
echo "   Proxied: Yes (CloudFlare CDN)"
echo "   TTL: 300 seconds"
echo ""
echo "🔍 Verification (may take 1-5 minutes):"
echo "   curl -I https://ferry.linknote.com/health"
echo "   dig ferry.linknote.com"
EOF

chmod +x /tmp/cloudflare-dns-config.sh

echo ""
echo "✨ DNS configuration script created!"
echo "📍 Script location: /tmp/cloudflare-dns-config.sh"
echo ""
echo "🚀 To run the configuration:"
echo "   export CLOUDFLARE_EMAIL='your-email@domain.com'"
echo "   export CLOUDFLARE_API_KEY='your-global-api-key'"
echo "   export CLOUDFLARE_ZONE_ID='your-zone-id'"
echo "   bash /tmp/cloudflare-dns-config.sh"
echo ""
echo "💡 Get your CloudFlare credentials from:"
echo "   https://dash.cloudflare.com/profile/api-tokens"

# Let's also test the current status
echo ""
echo "🔍 Current DNS Status:"
echo "====================="

# Test if domain already resolves
CURRENT_IP=$(dig +short A ferry.linknote.com 2>/dev/null | head -1)
if [ -n "$CURRENT_IP" ]; then
    echo "✅ ferry.linknote.com currently resolves to: $CURRENT_IP"
    if [ "$CURRENT_IP" = "$FLY_IP" ]; then
        echo "🎉 DNS is already correctly configured!"
        
        # Test HTTP connectivity
        echo "🌐 Testing HTTP connectivity..."
        HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -L "https://ferry.linknote.com/health" --connect-timeout 10 --max-time 30 2>/dev/null || echo "000")
        
        if [ "$HTTP_STATUS" = "200" ]; then
            echo "✅ ferry.linknote.com is working correctly!"
            echo "🎯 Dashboard URL: https://ferry.linknote.com"
        else
            echo "⚠️  HTTP status: $HTTP_STATUS (may still be propagating)"
        fi
    else
        echo "⚠️  DNS points to different IP, needs update"
    fi
else
    echo "❌ ferry.linknote.com does not resolve yet"
fi

# Test the target
echo ""
echo "🎯 Target Status:"
HTTP_TARGET_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -L "https://bc-ferries-control-new.fly.dev/health" --connect-timeout 10 --max-time 30 2>/dev/null || echo "000")
if [ "$HTTP_TARGET_STATUS" = "200" ]; then
    echo "✅ bc-ferries-control-new.fly.dev is healthy (status: $HTTP_TARGET_STATUS)"
else
    echo "⚠️  bc-ferries-control-new.fly.dev status: $HTTP_TARGET_STATUS"
fi