#!/bin/bash

# Get CloudFlare secrets from GitHub repository for deployment
# Since gh CLI doesn't directly expose secret values (for security),
# we need to use them through GitHub Actions or alternative methods

set -e

echo "🔐 CloudFlare Secrets Configuration"
echo "=================================="

# Check if secrets are available in environment (from GitHub Actions)
if [ ! -z "$CLOUDFLARE_API_KEY" ] && [ ! -z "$CLOUDFLARE_ZONE_ID" ]; then
    echo "✅ CloudFlare secrets found in environment"
    export CLOUDFLARE_API_TOKEN="$CLOUDFLARE_API_KEY"
    echo "   API Token: ${CLOUDFLARE_API_TOKEN:0:8}...${CLOUDFLARE_API_TOKEN: -8}"
    echo "   Zone ID: $CLOUDFLARE_ZONE_ID"
    echo "   Email: $CLOUDFLARE_EMAIL"
else
    echo "⚠️  CloudFlare secrets not found in environment"
    echo ""
    echo "📋 Manual Setup Required:"
    echo "   1. Get API Token from: https://dash.cloudflare.com/profile/api-tokens"
    echo "   2. Find Zone ID in CloudFlare dashboard for linknote.com"
    echo "   3. Run:"
    echo "      export CLOUDFLARE_API_TOKEN='your-api-token'"
    echo "      export CLOUDFLARE_ZONE_ID='your-zone-id'"
    echo ""
    
    # Try to get from GitHub repository (requires additional tools)
    echo "🔍 Available GitHub secrets for murr2k/linknote-aws-demos:"
    gh secret list --repo murr2k/linknote-aws-demos
    
    echo ""
    echo "💡 Note: GitHub CLI doesn't expose secret values directly for security."
    echo "   Use GitHub Actions workflow or manual environment variables."
fi

# Export for use by other scripts
if [ ! -z "$CLOUDFLARE_API_KEY" ]; then
    echo "export CLOUDFLARE_API_TOKEN='$CLOUDFLARE_API_KEY'" >> /tmp/cloudflare-env.sh
    echo "export CLOUDFLARE_ZONE_ID='$CLOUDFLARE_ZONE_ID'" >> /tmp/cloudflare-env.sh
    echo "export CLOUDFLARE_EMAIL='$CLOUDFLARE_EMAIL'" >> /tmp/cloudflare-env.sh
    echo ""
    echo "🎯 To use in other scripts:"
    echo "   source /tmp/cloudflare-env.sh"
fi