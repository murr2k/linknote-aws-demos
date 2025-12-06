#!/bin/bash
# Configure CloudFlare DNS for aws.linknode.com

set -e

echo "🌐 CloudFlare DNS Configuration for aws.linknode.com"
echo ""

# Check required environment variables
if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
    echo "❌ Error: CLOUDFLARE_API_TOKEN environment variable is required"
    echo "   Get your token from: https://dash.cloudflare.com/profile/api-tokens"
    echo ""
    echo "   export CLOUDFLARE_API_TOKEN='your-token-here'"
    exit 1
fi

if [ -z "$CLOUDFLARE_ZONE_ID" ]; then
    echo "❌ Error: CLOUDFLARE_ZONE_ID environment variable is required"
    echo "   Find your Zone ID in CloudFlare dashboard for linknode.com"
    echo ""
    echo "   export CLOUDFLARE_ZONE_ID='your-zone-id-here'"
    exit 1
fi

# Configuration
CF_API="https://api.cloudflare.com/client/v4"
ZONE_ID="$CLOUDFLARE_ZONE_ID"
CLOUDFRONT_DOMAIN="${1:-d288vhnilf4g47.cloudfront.net}"
SUBDOMAIN="aws.linknode.com"
VALIDATION_NAME="${2}"
VALIDATION_VALUE="${3}"

echo "📋 Configuration:"
echo "   Zone ID: $ZONE_ID"
echo "   Subdomain: $SUBDOMAIN"
echo "   CloudFront: $CLOUDFRONT_DOMAIN"
echo ""

# Function to create DNS record
create_dns_record() {
    local name=$1
    local content=$2
    local type=$3
    local proxied=$4
    local description=$5

    echo "Creating $type record: $name -> $content"

    response=$(curl -s -X POST "$CF_API/zones/$ZONE_ID/dns_records" \
        -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
        -H "Content-Type: application/json" \
        --data "{
            \"type\": \"$type\",
            \"name\": \"$name\",
            \"content\": \"$content\",
            \"ttl\": 300,
            \"proxied\": $proxied,
            \"comment\": \"$description\"
        }")

    success=$(echo "$response" | jq -r '.success')
    if [ "$success" = "true" ]; then
        echo "✅ Successfully created $name"
        record_id=$(echo "$response" | jq -r '.result.id')
        echo "   Record ID: $record_id"
    else
        # Check if record already exists
        error_code=$(echo "$response" | jq -r '.errors[0].code')
        if [ "$error_code" = "81057" ]; then
            echo "⚠️  Record $name already exists"
        else
            echo "❌ Failed to create $name"
            echo "$response" | jq -r '.errors[]'
            return 1
        fi
    fi
    echo ""
}

# Create main CNAME record for aws.linknode.com
echo "1️⃣  Creating main CNAME record..."
create_dns_record "$SUBDOMAIN" "$CLOUDFRONT_DOMAIN" "CNAME" "true" "AWS Portfolio Demo - CloudFront Distribution"

# Create validation record if provided
if [ -n "$VALIDATION_NAME" ] && [ -n "$VALIDATION_VALUE" ]; then
    echo "2️⃣  Creating certificate validation record..."
    create_dns_record "$VALIDATION_NAME" "$VALIDATION_VALUE" "CNAME" "false" "ACM Certificate Validation for aws.linknode.com"
else
    echo "2️⃣  No validation record provided - you'll need to add it manually"
    echo ""
    echo "   To get validation records, run:"
    echo "   aws acm describe-certificate \\"
    echo "     --certificate-arn YOUR_CERT_ARN \\"
    echo "     --query \"Certificate.DomainValidationOptions[?DomainName=='aws.linknode.com'].ResourceRecord\""
    echo ""
fi

# Configure SSL settings
echo "🔒 Configuring SSL/TLS settings for linknode.com zone..."
curl -s -X PATCH "$CF_API/zones/$ZONE_ID/settings/ssl" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    -H "Content-Type: application/json" \
    --data '{"value": "full"}' | jq -r '.success' > /dev/null

curl -s -X PATCH "$CF_API/zones/$ZONE_ID/settings/always_use_https" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    -H "Content-Type: application/json" \
    --data '{"value": "on"}' | jq -r '.success' > /dev/null

echo "✅ SSL settings configured"
echo ""

# Test DNS resolution
echo "🧪 Testing DNS resolution..."
sleep 5  # Wait a bit for DNS to propagate

if dig +short "$SUBDOMAIN" | grep -q "$CLOUDFRONT_DOMAIN"; then
    echo "✅ DNS is resolving correctly"
else
    echo "⚠️  DNS not yet propagated (this can take a few minutes)"
fi
echo ""

# Summary
echo "🎯 DNS Configuration Complete!"
echo ""
echo "📋 Created Records:"
echo "   1. $SUBDOMAIN -> $CLOUDFRONT_DOMAIN (CNAME, Proxied)"
if [ -n "$VALIDATION_NAME" ]; then
    echo "   2. $VALIDATION_NAME -> $VALIDATION_VALUE (CNAME, Not Proxied)"
fi
echo ""
echo "⏳ Next Steps:"
echo "   1. Wait 5-30 minutes for certificate validation"
echo "   2. Monitor validation status in ACM console"
echo "   3. Test the domain: curl -I https://$SUBDOMAIN"
echo ""
echo "🔍 Verify DNS propagation:"
echo "   dig $SUBDOMAIN +short"
echo "   curl -I https://$SUBDOMAIN"
echo ""
