#!/bin/bash

# DNS Verification Script for ferry.linknote.com

echo "🔍 DNS Verification for ferry.linknote.com"
echo "=========================================="

TARGET_IP="66.241.125.19"
DOMAIN="ferry.linknote.com"

echo "Target IP: $TARGET_IP"
echo "Domain: $DOMAIN"
echo ""

# Check DNS resolution via multiple methods
echo "📡 DNS Resolution Check:"
echo "----------------------"

# Method 1: dig command
echo "🔸 Using dig:"
DIG_RESULT=$(dig +short A $DOMAIN 2>/dev/null | head -1)
if [ -n "$DIG_RESULT" ]; then
    echo "   Result: $DIG_RESULT"
    if [ "$DIG_RESULT" = "$TARGET_IP" ]; then
        echo "   Status: ✅ Correct"
    else
        echo "   Status: ⚠️  Points to different IP"
    fi
else
    echo "   Result: No A record found"
    echo "   Status: ❌ Not configured"
fi

# Method 2: nslookup
echo ""
echo "🔸 Using nslookup:"
NSLOOKUP_RESULT=$(nslookup $DOMAIN 2>/dev/null | grep "Address:" | tail -1 | awk '{print $2}' 2>/dev/null)
if [ -n "$NSLOOKUP_RESULT" ]; then
    echo "   Result: $NSLOOKUP_RESULT"
    if [ "$NSLOOKUP_RESULT" = "$TARGET_IP" ]; then
        echo "   Status: ✅ Correct"
    else
        echo "   Status: ⚠️  Points to different IP"
    fi
else
    echo "   Result: No resolution"
    echo "   Status: ❌ Not configured"
fi

# Method 3: Multiple DNS servers
echo ""
echo "🔸 Testing multiple DNS servers:"
for DNS_SERVER in "1.1.1.1" "8.8.8.8" "9.9.9.9" "208.67.222.222"; do
    SERVER_RESULT=$(dig @$DNS_SERVER +short A $DOMAIN 2>/dev/null | head -1)
    if [ -n "$SERVER_RESULT" ]; then
        echo "   $DNS_SERVER: $SERVER_RESULT"
    else
        echo "   $DNS_SERVER: No response"
    fi
done

echo ""
echo "🌐 HTTP Connectivity Test:"
echo "-------------------------"

# Test HTTP connectivity
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -L "https://$DOMAIN/health" --connect-timeout 15 --max-time 30 2>/dev/null || echo "000")

echo "🔸 HTTPS Health Check:"
echo "   URL: https://$DOMAIN/health"
echo "   Status Code: $HTTP_STATUS"

if [ "$HTTP_STATUS" = "200" ]; then
    echo "   Status: ✅ Working correctly"
    
    # Get response headers
    echo "   Response Headers:"
    curl -s -I "https://$DOMAIN/health" 2>/dev/null | head -5 | sed 's/^/     /'
    
elif [ "$HTTP_STATUS" = "000" ]; then
    echo "   Status: ❌ Connection failed"
elif [ "$HTTP_STATUS" = "404" ]; then
    echo "   Status: ⚠️  Connected but /health not found"
else
    echo "   Status: ⚠️  Unexpected response"
fi

# Test the main dashboard
echo ""
echo "🔸 Dashboard Accessibility:"
DASHBOARD_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -L "https://$DOMAIN/" --connect-timeout 15 --max-time 30 2>/dev/null || echo "000")
echo "   URL: https://$DOMAIN/"
echo "   Status Code: $DASHBOARD_STATUS"

if [ "$DASHBOARD_STATUS" = "200" ]; then
    echo "   Status: ✅ Dashboard accessible"
elif [ "$DASHBOARD_STATUS" = "000" ]; then
    echo "   Status: ❌ Connection failed"
else
    echo "   Status: ⚠️  Response: $DASHBOARD_STATUS"
fi

echo ""
echo "🎯 Target Server Verification:"
echo "-----------------------------"

# Verify the target Fly.io app is working
TARGET_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -L "https://bc-ferries-control-new.fly.dev/health" --connect-timeout 15 --max-time 30 2>/dev/null || echo "000")
echo "🔸 Target Server Health:"
echo "   URL: https://bc-ferries-control-new.fly.dev/health"
echo "   Status Code: $TARGET_STATUS"

if [ "$TARGET_STATUS" = "200" ]; then
    echo "   Status: ✅ Target server healthy"
else
    echo "   Status: ❌ Target server issue (Status: $TARGET_STATUS)"
fi

echo ""
echo "📊 Summary:"
echo "----------"

# Overall status determination
DNS_OK=false
HTTP_OK=false
TARGET_OK=false

if [ "$DIG_RESULT" = "$TARGET_IP" ] || [ "$NSLOOKUP_RESULT" = "$TARGET_IP" ]; then
    DNS_OK=true
    echo "✅ DNS Configuration: Working"
else
    echo "❌ DNS Configuration: Not working or incorrect"
fi

if [ "$HTTP_STATUS" = "200" ]; then
    HTTP_OK=true
    echo "✅ HTTPS Connectivity: Working"
else
    echo "❌ HTTPS Connectivity: Not working"
fi

if [ "$TARGET_STATUS" = "200" ]; then
    TARGET_OK=true
    echo "✅ Target Server: Healthy"
else
    echo "❌ Target Server: Issues detected"
fi

echo ""
if $DNS_OK && $HTTP_OK && $TARGET_OK; then
    echo "🎉 All systems working correctly!"
    echo "🔗 Ferry Control Dashboard: https://$DOMAIN"
elif $TARGET_OK && ! $DNS_OK; then
    echo "⚠️  Target server is healthy but DNS not configured"
    echo "💡 Run the DNS configuration script to fix this"
elif $DNS_OK && ! $HTTP_OK; then
    echo "⚠️  DNS configured but HTTPS not working"
    echo "💡 DNS may still be propagating (wait 5-10 minutes)"
else
    echo "❌ Multiple issues detected"
    echo "💡 Check target server and DNS configuration"
fi

echo ""
echo "🛠️  Troubleshooting Commands:"
echo "   DNS Propagation: https://www.whatsmydns.net/#A/$DOMAIN"
echo "   Manual Test: curl -I https://$DOMAIN/health"
echo "   DNS Lookup: dig $DOMAIN"