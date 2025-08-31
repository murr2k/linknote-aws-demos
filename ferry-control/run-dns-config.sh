#!/bin/bash

# CloudFlare DNS Configuration Runner
# This script attempts to get credentials and configure DNS immediately

set -e

echo "🌐 Ferry Control DNS Configuration"
echo "=================================="

FLY_IP="66.241.125.19"

# Function to configure DNS with given credentials
configure_dns() {
    local email="$1"
    local api_key="$2"
    local zone_id="$3"
    
    echo "🔧 Configuring DNS with provided credentials..."
    
    # Create or update A record
    RESPONSE=$(curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$zone_id/dns_records" \
        -H "X-Auth-Email: $email" \
        -H "X-Auth-Key: $api_key" \
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
        echo "✅ DNS A record created successfully!"
        RECORD_ID=$(echo "$RESPONSE" | jq -r '.result.id')
        echo "   Record ID: $RECORD_ID"
        return 0
    else
        # Try updating existing record
        echo "🔄 Checking for existing record..."
        
        EXISTING=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$zone_id/dns_records?name=ferry.linknote.com" \
            -H "X-Auth-Email: $email" \
            -H "X-Auth-Key: $api_key")
        
        RECORD_ID=$(echo "$EXISTING" | jq -r '.result[]? | select(.name == "ferry.linknote.com") | .id' | head -1)
        
        if [ "$RECORD_ID" != "" ] && [ "$RECORD_ID" != "null" ]; then
            echo "📝 Updating existing record: $RECORD_ID"
            
            UPDATE_RESPONSE=$(curl -s -X PUT "https://api.cloudflare.com/client/v4/zones/$zone_id/dns_records/$RECORD_ID" \
                -H "X-Auth-Email: $email" \
                -H "X-Auth-Key: $api_key" \
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
                return 0
            else
                echo "❌ Failed to update: $UPDATE_RESPONSE"
                return 1
            fi
        else
            echo "❌ Failed to create or find record"
            echo "Response: $RESPONSE"
            return 1
        fi
    fi
}

# Method 1: Try MCP secrets manager
echo "🔐 Method 1: Checking MCP secrets manager..."
if curl -s http://localhost:3457/health > /dev/null 2>&1; then
    echo "✅ MCP secrets manager is running"
    
    # Try to get secrets via curl
    CF_EMAIL=$(curl -s "http://localhost:3457/api/secrets/cloudflare/email" 2>/dev/null | jq -r '.value // empty')
    CF_API_KEY=$(curl -s "http://localhost:3457/api/secrets/cloudflare/api_key" 2>/dev/null | jq -r '.value // empty')
    CF_ZONE_ID=$(curl -s "http://localhost:3457/api/secrets/cloudflare/zone_id" 2>/dev/null | jq -r '.value // empty')
    
    if [ -n "$CF_EMAIL" ] && [ -n "$CF_API_KEY" ] && [ -n "$CF_ZONE_ID" ]; then
        echo "✅ Retrieved CloudFlare credentials from MCP"
        configure_dns "$CF_EMAIL" "$CF_API_KEY" "$CF_ZONE_ID"
        if [ $? -eq 0 ]; then
            echo "🎉 DNS configured successfully via MCP!"
            exit 0
        fi
    else
        echo "⚠️  Could not retrieve complete credentials from MCP"
    fi
else
    echo "❌ MCP secrets manager not available"
fi

# Method 2: Try environment variables
echo ""
echo "🔐 Method 2: Checking environment variables..."
if [ -n "$CLOUDFLARE_EMAIL" ] && [ -n "$CLOUDFLARE_API_KEY" ] && [ -n "$CLOUDFLARE_ZONE_ID" ]; then
    echo "✅ Found CloudFlare credentials in environment"
    configure_dns "$CLOUDFLARE_EMAIL" "$CLOUDFLARE_API_KEY" "$CLOUDFLARE_ZONE_ID"
    if [ $? -eq 0 ]; then
        echo "🎉 DNS configured successfully via environment variables!"
        exit 0
    fi
else
    echo "❌ CloudFlare credentials not found in environment"
fi

# Method 3: Interactive input
echo ""
echo "🔐 Method 3: Manual credential input"
echo "Please provide your CloudFlare credentials:"
echo ""

read -p "CloudFlare Email: " CF_EMAIL_INPUT
read -p "CloudFlare API Key: " CF_API_KEY_INPUT
read -p "CloudFlare Zone ID: " CF_ZONE_ID_INPUT

if [ -n "$CF_EMAIL_INPUT" ] && [ -n "$CF_API_KEY_INPUT" ] && [ -n "$CF_ZONE_ID_INPUT" ]; then
    echo "✅ Manual credentials provided"
    configure_dns "$CF_EMAIL_INPUT" "$CF_API_KEY_INPUT" "$CF_ZONE_ID_INPUT"
    if [ $? -eq 0 ]; then
        echo "🎉 DNS configured successfully via manual input!"
        
        # Test the configuration
        echo ""
        echo "🔍 Testing configuration..."
        sleep 10
        
        HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -L "https://ferry.linknote.com/health" --connect-timeout 15 --max-time 30 2>/dev/null || echo "000")
        
        if [ "$HTTP_STATUS" = "200" ]; then
            echo "✅ ferry.linknote.com is working correctly!"
            echo "🎯 Dashboard URL: https://ferry.linknote.com"
        else
            echo "⏳ HTTP status: $HTTP_STATUS (DNS may still be propagating)"
            echo "💡 Try again in a few minutes"
        fi
        
        echo ""
        echo "📊 Configuration Summary:"
        echo "  Domain: ferry.linknote.com"
        echo "  Target: bc-ferries-control-new.fly.dev ($FLY_IP)"
        echo "  Record Type: A (Proxied via CloudFlare)"
        echo "  Status: Configured"
        
        exit 0
    fi
else
    echo "❌ Incomplete credentials provided"
fi

echo ""
echo "❌ All methods failed. DNS not configured."
echo ""
echo "💡 Manual configuration options:"
echo "   1. Run the GitHub Actions workflow (when available)"
echo "   2. Configure DNS manually in CloudFlare dashboard"
echo "   3. Use the script at /tmp/cloudflare-dns-config.sh"
echo ""
echo "🔗 CloudFlare Dashboard: https://dash.cloudflare.com"
echo "📋 Manual DNS Record Settings:"
echo "   Type: A"
echo "   Name: ferry"
echo "   Content: $FLY_IP"
echo "   Proxy: On"
echo "   TTL: Auto"
exit 1