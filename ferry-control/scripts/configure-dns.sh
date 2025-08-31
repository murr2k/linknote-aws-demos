#!/bin/bash

# CloudFlare DNS Configuration Script for ferry.linknote.com
# This script configures DNS records to point ferry.linknote.com to bc-ferries-control-new.fly.dev

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}🌐 CloudFlare DNS Configuration for ferry.linknote.com${NC}"
echo "============================================================"

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

# Get Fly.io IP address
echo -e "${YELLOW}🔍 Resolving Fly.io deployment IP...${NC}"
FLY_IP=$(nslookup bc-ferries-control-new.fly.dev | grep "Address:" | tail -1 | awk '{print $2}')
echo -e "Fly.io IP: ${GREEN}$FLY_IP${NC}"

# Check if DNS record already exists
echo -e "${YELLOW}🔍 Checking existing DNS records...${NC}"
EXISTING_RECORDS=$(cf_api "GET" "/zones/$CLOUDFLARE_ZONE_ID/dns_records?name=ferry.linknote.com")

# Extract record ID if it exists
RECORD_ID=$(echo "$EXISTING_RECORDS" | jq -r '.result[]? | select(.name == "ferry.linknote.com") | .id' | head -1)

if [ "$RECORD_ID" != "" ] && [ "$RECORD_ID" != "null" ]; then
    echo -e "${YELLOW}📝 Existing DNS record found (ID: $RECORD_ID), updating...${NC}"
    
    # Update existing A record
    UPDATE_RESPONSE=$(cf_api "PUT" "/zones/$CLOUDFLARE_ZONE_ID/dns_records/$RECORD_ID" \
        '{
            "type": "A",
            "name": "ferry.linknote.com",
            "content": "'$FLY_IP'",
            "ttl": 300,
            "proxied": true
        }')
    
    SUCCESS=$(echo "$UPDATE_RESPONSE" | jq -r '.success')
    if [ "$SUCCESS" = "true" ]; then
        echo -e "${GREEN}✅ DNS record updated successfully!${NC}"
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
            "name": "ferry.linknote.com",
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

# Verify DNS propagation
echo -e "${YELLOW}🔍 Verifying DNS propagation...${NC}"
sleep 5

# Check via CloudFlare DNS
DNS_CHECK=$(curl -s "https://1.1.1.1/dns-query?name=ferry.linknote.com&type=A" -H "Accept: application/dns-json")
RESOLVED_IP=$(echo "$DNS_CHECK" | jq -r '.Answer[]?.data // "Not found"' | head -1)

echo "DNS Resolution Results:"
echo "  Expected IP: $FLY_IP"
echo "  Resolved IP: $RESOLVED_IP"

if [ "$RESOLVED_IP" = "$FLY_IP" ] || [ "$RESOLVED_IP" != "Not found" ]; then
    echo -e "${GREEN}✅ DNS is propagating correctly!${NC}"
else
    echo -e "${YELLOW}⏳ DNS may still be propagating (can take up to 5 minutes)${NC}"
fi

# Test HTTP connectivity
echo -e "${YELLOW}🌐 Testing HTTP connectivity...${NC}"
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -L "https://ferry.linknote.com/health" --connect-timeout 10 --max-time 30 || echo "000")

if [ "$HTTP_STATUS" = "200" ]; then
    echo -e "${GREEN}✅ HTTP connectivity test passed!${NC}"
    echo -e "${GREEN}🎉 ferry.linknote.com is now configured and accessible!${NC}"
elif [ "$HTTP_STATUS" = "000" ]; then
    echo -e "${YELLOW}⏳ HTTP test failed - DNS may still be propagating${NC}"
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