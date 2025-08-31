#!/bin/bash

# CloudFlare DNS Configuration Script for ferry.linknote.com
# Manual execution with environment variables

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}🌐 CloudFlare DNS Configuration for ferry.linknote.com${NC}"
echo "============================================================"

# Check required environment variables
if [ -z "$CLOUDFLARE_API_KEY" ] || [ -z "$CLOUDFLARE_EMAIL" ] || [ -z "$CLOUDFLARE_ZONE_ID" ]; then
    echo -e "${RED}❌ Missing required environment variables:${NC}"
    echo "  CLOUDFLARE_API_KEY, CLOUDFLARE_EMAIL, CLOUDFLARE_ZONE_ID"
    echo ""
    echo "Please run with:"
    echo "  export CLOUDFLARE_EMAIL=your-email"
    echo "  export CLOUDFLARE_API_KEY=your-api-key"
    echo "  export CLOUDFLARE_ZONE_ID=your-zone-id"
    echo "  ./scripts/configure-dns-manual.sh"
    exit 1
fi

# Function to make CloudFlare API calls
cf_api() {
    local method="$1"
    local endpoint="$2"
    local data="$3"
    
    local url="https://api.cloudflare.com/client/v4${endpoint}"
    
    if [ "$method" = "GET" ]; then
        curl -s -X GET "$url" \
            -H "X-Auth-Email: $CLOUDFLARE_EMAIL" \
            -H "X-Auth-Key: $CLOUDFLARE_API_KEY" \
            -H "Content-Type: application/json"
    elif [ "$method" = "POST" ]; then
        curl -s -X POST "$url" \
            -H "X-Auth-Email: $CLOUDFLARE_EMAIL" \
            -H "X-Auth-Key: $CLOUDFLARE_API_KEY" \
            -H "Content-Type: application/json" \
            -d "$data"
    elif [ "$method" = "PUT" ]; then
        curl -s -X PUT "$url" \
            -H "X-Auth-Email: $CLOUDFLARE_EMAIL" \
            -H "X-Auth-Key: $CLOUDFLARE_API_KEY" \
            -H "Content-Type: application/json" \
            -d "$data"
    elif [ "$method" = "DELETE" ]; then
        curl -s -X DELETE "$url" \
            -H "X-Auth-Email: $CLOUDFLARE_EMAIL" \
            -H "X-Auth-Key: $CLOUDFLARE_API_KEY" \
            -H "Content-Type: application/json"
    fi
}

# Get IPv4 address from Fly.io deployment
echo -e "${YELLOW}🔍 Resolving Fly.io deployment IPv4 address...${NC}"
FLY_IP=$(dig +short A bc-ferries-control-new.fly.dev | head -1)

if [ -z "$FLY_IP" ]; then
    echo -e "${RED}❌ Could not resolve IPv4 address for bc-ferries-control-new.fly.dev${NC}"
    exit 1
fi

echo -e "Fly.io IPv4: ${GREEN}$FLY_IP${NC}"

# Verify zone access
echo -e "${YELLOW}🔍 Verifying CloudFlare zone access...${NC}"
ZONE_INFO=$(cf_api "GET" "/zones/$CLOUDFLARE_ZONE_ID")
ZONE_SUCCESS=$(echo "$ZONE_INFO" | jq -r '.success')

if [ "$ZONE_SUCCESS" != "true" ]; then
    echo -e "${RED}❌ Failed to access CloudFlare zone${NC}"
    echo "$ZONE_INFO" | jq -r '.errors[]?.message'
    exit 1
fi

ZONE_NAME=$(echo "$ZONE_INFO" | jq -r '.result.name')
echo -e "Zone verified: ${GREEN}$ZONE_NAME${NC}"

# Check if DNS record already exists
echo -e "${YELLOW}🔍 Checking existing DNS records...${NC}"
EXISTING_RECORDS=$(cf_api "GET" "/zones/$CLOUDFLARE_ZONE_ID/dns_records?name=ferry.linknote.com")

# Extract record ID if it exists
RECORD_ID=$(echo "$EXISTING_RECORDS" | jq -r '.result[]? | select(.name == "ferry.linknote.com" and .type == "A") | .id' | head -1)

if [ "$RECORD_ID" != "" ] && [ "$RECORD_ID" != "null" ]; then
    echo -e "${YELLOW}📝 Existing A record found (ID: $RECORD_ID), updating...${NC}"
    
    # Update existing A record
    UPDATE_RESPONSE=$(cf_api "PUT" "/zones/$CLOUDFLARE_ZONE_ID/dns_records/$RECORD_ID" \
        '{
            "type": "A",
            "name": "ferry",
            "content": "'$FLY_IP'",
            "ttl": 300,
            "proxied": true
        }')
    
    SUCCESS=$(echo "$UPDATE_RESPONSE" | jq -r '.success')
    if [ "$SUCCESS" = "true" ]; then
        echo -e "${GREEN}✅ DNS A record updated successfully!${NC}"
    else
        echo -e "${RED}❌ Failed to update DNS record${NC}"
        echo "$UPDATE_RESPONSE" | jq -r '.errors[]?.message'
        exit 1
    fi
else
    echo -e "${YELLOW}➕ Creating new DNS A record...${NC}"
    
    # Create new A record
    CREATE_RESPONSE=$(cf_api "POST" "/zones/$CLOUDFLARE_ZONE_ID/dns_records" \
        '{
            "type": "A",
            "name": "ferry",
            "content": "'$FLY_IP'",
            "ttl": 300,
            "proxied": true
        }')
    
    SUCCESS=$(echo "$CREATE_RESPONSE" | jq -r '.success')
    if [ "$SUCCESS" = "true" ]; then
        RECORD_ID=$(echo "$CREATE_RESPONSE" | jq -r '.result.id')
        echo -e "${GREEN}✅ DNS A record created successfully! (ID: $RECORD_ID)${NC}"
    else
        echo -e "${RED}❌ Failed to create DNS record${NC}"
        echo "$CREATE_RESPONSE" | jq -r '.errors[]?.message'
        exit 1
    fi
fi

# Wait for initial propagation
echo -e "${YELLOW}⏳ Waiting for initial DNS propagation (30 seconds)...${NC}"
sleep 30

# Verify DNS propagation
echo -e "${YELLOW}🔍 Verifying DNS propagation...${NC}"

# Check via multiple DNS servers
for DNS_SERVER in "1.1.1.1" "8.8.8.8" "9.9.9.9"; do
    DNS_CHECK=$(dig @$DNS_SERVER +short A ferry.linknote.com 2>/dev/null | head -1)
    echo "  DNS Server $DNS_SERVER: ${DNS_CHECK:-"No response"}"
done

# Test HTTP connectivity
echo -e "${YELLOW}🌐 Testing HTTP connectivity...${NC}"
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -L "https://ferry.linknote.com/health" --connect-timeout 10 --max-time 30 2>/dev/null || echo "000")

if [ "$HTTP_STATUS" = "200" ]; then
    echo -e "${GREEN}✅ HTTP connectivity test passed!${NC}"
    echo -e "${GREEN}🎉 ferry.linknote.com is now configured and accessible!${NC}"
elif [ "$HTTP_STATUS" = "000" ]; then
    echo -e "${YELLOW}⏳ HTTP test failed - DNS may still be propagating${NC}"
    echo -e "${YELLOW}💡 Try again in a few minutes or check manually${NC}"
else
    echo -e "${YELLOW}⚠️  HTTP returned status: $HTTP_STATUS${NC}"
fi

echo ""
echo -e "${BLUE}📊 Configuration Summary:${NC}"
echo "  Domain: ferry.linknote.com"
echo "  Target: bc-ferries-control-new.fly.dev ($FLY_IP)"
echo "  Record Type: A (Proxied through CloudFlare)"
echo "  TTL: 300 seconds"
echo "  Status: Configured"
echo ""
echo -e "${GREEN}✨ DNS configuration complete!${NC}"

# Display final verification URLs
echo -e "${BLUE}🔗 Verification URLs:${NC}"
echo "  Health Check: https://ferry.linknote.com/health"
echo "  Dashboard: https://ferry.linknote.com"
echo "  DNS Propagation: https://www.whatsmydns.net/#A/ferry.linknote.com"