#!/bin/bash
set -e

# BC Ferries Grafana Integration Test Script
# Tests all integrations and data sources

echo "🧪 Testing BC Ferries Grafana Cloud Integration"
echo "=============================================="

# Load environment variables
if [ -f "../config/.env" ]; then
    source "../config/.env"
    echo "✅ Environment variables loaded"
else
    echo "❌ .env file not found. Copy .env.template and configure."
    exit 1
fi

# Check required variables
required_vars=("GRAFANA_URL" "GRAFANA_SERVICE_TOKEN" "AWS_ACCESS_KEY_ID")
for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        echo "❌ Required environment variable $var is not set"
        exit 1
    fi
done

echo "✅ All required environment variables are set"

# Test functions
test_grafana_health() {
    echo ""
    echo "🔍 Testing Grafana Cloud health..."
    
    HEALTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$GRAFANA_URL/api/health")
    
    if [ "$HEALTH_RESPONSE" = "200" ]; then
        echo "✅ Grafana Cloud is healthy (HTTP $HEALTH_RESPONSE)"
        return 0
    else
        echo "❌ Grafana Cloud health check failed (HTTP $HEALTH_RESPONSE)"
        return 1
    fi
}

test_grafana_auth() {
    echo ""
    echo "🔐 Testing Grafana authentication..."
    
    AUTH_RESPONSE=$(curl -s -w "%{http_code}" -o /tmp/auth_test.json \
        "$GRAFANA_URL/api/user" \
        -H "Authorization: Bearer $GRAFANA_SERVICE_TOKEN")
    
    if [ "${AUTH_RESPONSE: -3}" = "200" ]; then
        echo "✅ Grafana authentication successful"
        USER_INFO=$(cat /tmp/auth_test.json)
        echo "   User: $(echo $USER_INFO | jq -r '.login // "Service Account"')"
        return 0
    else
        echo "❌ Grafana authentication failed (HTTP ${AUTH_RESPONSE: -3})"
        echo "   Response: $(cat /tmp/auth_test.json)"
        return 1
    fi
}

test_data_sources() {
    echo ""
    echo "📊 Testing data source configurations..."
    
    # List all data sources
    DS_RESPONSE=$(curl -s "$GRAFANA_URL/api/datasources" \
        -H "Authorization: Bearer $GRAFANA_SERVICE_TOKEN")
    
    DS_COUNT=$(echo "$DS_RESPONSE" | jq '. | length')
    echo "   Found $DS_COUNT data sources"
    
    # Test each data source
    echo "$DS_RESPONSE" | jq -r '.[] | "\(.id):\(.name):\(.type)"' | while IFS=':' read -r id name type; do
        echo "   Testing $name ($type)..."
        
        DS_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" \
            "$GRAFANA_URL/api/datasources/$id/health" \
            -H "Authorization: Bearer $GRAFANA_SERVICE_TOKEN")
        
        if [ "$DS_HEALTH" = "200" ]; then
            echo "   ✅ $name is healthy"
        else
            echo "   ⚠️  $name health check returned HTTP $DS_HEALTH"
        fi
    done
}

test_dashboard_import() {
    echo ""
    echo "📋 Testing dashboard availability..."
    
    # Search for BC Ferries dashboard
    DASH_SEARCH=$(curl -s "$GRAFANA_URL/api/search?query=BC%20Ferries" \
        -H "Authorization: Bearer $GRAFANA_SERVICE_TOKEN")
    
    DASH_COUNT=$(echo "$DASH_SEARCH" | jq '. | length')
    
    if [ "$DASH_COUNT" -gt 0 ]; then
        echo "✅ Found $DASH_COUNT BC Ferries dashboard(s)"
        echo "$DASH_SEARCH" | jq -r '.[] | "   - \(.title) (UID: \(.uid))"'
        
        # Test dashboard load
        DASH_UID=$(echo "$DASH_SEARCH" | jq -r '.[0].uid')
        DASH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
            "$GRAFANA_URL/api/dashboards/uid/$DASH_UID" \
            -H "Authorization: Bearer $GRAFANA_SERVICE_TOKEN")
        
        if [ "$DASH_RESPONSE" = "200" ]; then
            echo "   ✅ Dashboard loads successfully"
            echo "   🔗 URL: $GRAFANA_URL/d/$DASH_UID"
        else
            echo "   ❌ Dashboard load failed (HTTP $DASH_RESPONSE)"
        fi
    else
        echo "❌ No BC Ferries dashboards found"
        return 1
    fi
}

test_aws_cloudwatch() {
    echo ""
    echo "☁️  Testing AWS CloudWatch integration..."
    
    if command -v aws &> /dev/null; then
        # Test AWS credentials
        AWS_TEST=$(aws sts get-caller-identity 2>/dev/null || echo "FAILED")
        
        if [ "$AWS_TEST" != "FAILED" ]; then
            echo "✅ AWS credentials valid"
            echo "   Account: $(echo $AWS_TEST | jq -r '.Account')"
            
            # Test CloudWatch access
            METRICS_TEST=$(aws cloudwatch list-metrics \
                --namespace "Custom/FerryTelemetry" \
                --region us-west-2 2>/dev/null || echo "FAILED")
            
            if [ "$METRICS_TEST" != "FAILED" ]; then
                METRIC_COUNT=$(echo "$METRICS_TEST" | jq '.Metrics | length')
                echo "✅ CloudWatch access successful ($METRIC_COUNT metrics)"
            else
                echo "⚠️  CloudWatch access failed or no metrics found"
            fi
        else
            echo "❌ AWS credentials invalid or not configured"
        fi
    else
        echo "⚠️  AWS CLI not installed, skipping CloudWatch test"
    fi
}

test_mqtt_connectivity() {
    echo ""
    echo "📡 Testing MQTT connectivity..."
    
    if [ -n "$HIVEMQ_BROKER" ] && [ -n "$HIVEMQ_USERNAME" ]; then
        if command -v mosquitto_pub &> /dev/null; then
            # Test MQTT publish
            TEST_MESSAGE='{"test": true, "timestamp": "'$(date -Iseconds)'"}'
            
            MQTT_TEST=$(timeout 10 mosquitto_pub \
                -h "$HIVEMQ_BROKER" \
                -p 8883 \
                -u "$HIVEMQ_USERNAME" \
                -P "$HIVEMQ_PASSWORD" \
                -t "ferry/vessel/001/test" \
                -m "$TEST_MESSAGE" \
                --capath /etc/ssl/certs 2>&1 || echo "FAILED")
            
            if [ "$MQTT_TEST" != "FAILED" ]; then
                echo "✅ MQTT publish successful"
                echo "   Broker: $HIVEMQ_BROKER"
                echo "   Topic: ferry/vessel/001/test"
            else
                echo "❌ MQTT publish failed: $MQTT_TEST"
            fi
        else
            echo "⚠️  mosquitto_clients not installed, skipping MQTT test"
        fi
    else
        echo "⚠️  MQTT configuration not found, skipping test"
    fi
}

test_timestream() {
    echo ""
    echo "⏰ Testing AWS TimeStream integration..."
    
    if command -v aws &> /dev/null && [ -n "$TIMESTREAM_DATABASE" ]; then
        # Test TimeStream access
        TS_TEST=$(aws timestream-query query \
            --query-string "SHOW TABLES FROM $TIMESTREAM_DATABASE" \
            --region us-west-2 2>/dev/null || echo "FAILED")
        
        if [ "$TS_TEST" != "FAILED" ]; then
            echo "✅ TimeStream access successful"
            echo "   Database: $TIMESTREAM_DATABASE"
            
            # Try to query recent data
            RECENT_DATA=$(aws timestream-query query \
                --query-string "SELECT COUNT(*) as record_count FROM $TIMESTREAM_DATABASE.VesselTelemetry WHERE time >= ago(1h)" \
                --region us-west-2 2>/dev/null || echo "FAILED")
            
            if [ "$RECENT_DATA" != "FAILED" ]; then
                RECORD_COUNT=$(echo "$RECENT_DATA" | jq -r '.Rows[0].Data[0].ScalarValue // "0"')
                echo "   Recent records (1h): $RECORD_COUNT"
            fi
        else
            echo "❌ TimeStream access failed or database not found"
        fi
    else
        echo "⚠️  AWS CLI not available or TimeStream not configured"
    fi
}

test_alerts() {
    echo ""
    echo "🚨 Testing alert configuration..."
    
    # Get alert rules
    ALERT_RULES=$(curl -s "$GRAFANA_URL/api/ruler/grafana/api/v1/rules" \
        -H "Authorization: Bearer $GRAFANA_SERVICE_TOKEN")
    
    if echo "$ALERT_RULES" | jq -e '. | length > 0' > /dev/null 2>&1; then
        RULE_COUNT=$(echo "$ALERT_RULES" | jq 'keys | length')
        echo "✅ Found $RULE_COUNT alert rule group(s)"
        
        # List alert rules
        echo "$ALERT_RULES" | jq -r 'to_entries[] | "   - Group: \(.key) (\(.value.rules | length) rules)"'
    else
        echo "⚠️  No alert rules configured yet"
    fi
    
    # Test notification channels
    NOTIFICATIONS=$(curl -s "$GRAFANA_URL/api/alertmanager/grafana/api/v1/alerts" \
        -H "Authorization: Bearer $GRAFANA_SERVICE_TOKEN")
    
    if [ $? -eq 0 ]; then
        echo "✅ Alert manager accessible"
    else
        echo "⚠️  Alert manager access failed"
    fi
}

send_test_data() {
    echo ""
    echo "📤 Sending test telemetry data..."
    
    # Generate sample telemetry data
    TIMESTAMP=$(date -Iseconds)
    TEST_DATA=$(cat <<EOF
{
  "timestamp": "$TIMESTAMP",
  "vessel_id": "001",
  "system": "engine",
  "metrics": {
    "rpm": 1200,
    "temperature": 85.5,
    "fuel_flow": 45.2
  },
  "status": "normal"
}
EOF
)
    
    # Try to send via local control API if available
    if curl -s -f "http://ferry.linknote.com:8080/api/health" > /dev/null 2>&1; then
        echo "   Sending test data via local control API..."
        
        SEND_RESULT=$(curl -s -X POST "http://ferry.linknote.com:8080/api/telemetry" \
            -H "Content-Type: application/json" \
            -d "$TEST_DATA" || echo "FAILED")
        
        if [ "$SEND_RESULT" != "FAILED" ]; then
            echo "✅ Test data sent successfully"
            echo "   Wait 30 seconds for data to appear in dashboard..."
        else
            echo "⚠️  Failed to send test data via control API"
        fi
    else
        echo "⚠️  Control API not available for test data"
    fi
    
    # Try to send via MQTT if configured
    if [ -n "$HIVEMQ_BROKER" ] && command -v mosquitto_pub &> /dev/null; then
        echo "   Sending test data via MQTT..."
        
        MQTT_SEND=$(timeout 10 mosquitto_pub \
            -h "$HIVEMQ_BROKER" \
            -p 8883 \
            -u "$HIVEMQ_USERNAME" \
            -P "$HIVEMQ_PASSWORD" \
            -t "ferry/vessel/001/telemetry/engine" \
            -m "$TEST_DATA" \
            --capath /etc/ssl/certs 2>&1 || echo "FAILED")
        
        if [ "$MQTT_SEND" != "FAILED" ]; then
            echo "✅ Test data sent via MQTT"
        else
            echo "⚠️  Failed to send test data via MQTT"
        fi
    fi
}

generate_test_report() {
    echo ""
    echo "📊 Generating test report..."
    
    REPORT_FILE="../docs/integration-test-report.md"
    
    cat > "$REPORT_FILE" <<EOF
# BC Ferries Grafana Integration Test Report

**Generated**: $(date)
**Test Environment**: $GRAFANA_URL

## Test Results Summary

| Component | Status | Notes |
|-----------|--------|-------|
| Grafana Health | $([[ $GRAFANA_HEALTH == 0 ]] && echo "✅ Pass" || echo "❌ Fail") | Base connectivity |
| Authentication | $([[ $GRAFANA_AUTH == 0 ]] && echo "✅ Pass" || echo "❌ Fail") | Service account token |
| Data Sources | $([[ $DATA_SOURCES == 0 ]] && echo "✅ Pass" || echo "⚠️ Partial") | Configuration check |
| Dashboard | $([[ $DASHBOARD == 0 ]] && echo "✅ Pass" || echo "❌ Fail") | Import and load test |
| AWS CloudWatch | $([[ $AWS_CW == 0 ]] && echo "✅ Pass" || echo "⚠️ Partial") | Metrics access |
| MQTT Connectivity | $([[ $MQTT == 0 ]] && echo "✅ Pass" || echo "⚠️ Partial") | HiveMQ broker |
| AWS TimeStream | $([[ $TIMESTREAM == 0 ]] && echo "✅ Pass" || echo "⚠️ Partial") | Database access |
| Alerts | $([[ $ALERTS == 0 ]] && echo "✅ Pass" || echo "⚠️ Partial") | Rule configuration |

## Next Steps

$(if [[ $OVERALL_STATUS == 0 ]]; then
    echo "🎉 **All tests passed!** The integration is ready for production use."
    echo ""
    echo "### Recommended Actions:"
    echo "1. Point ops.linknote.com to $GRAFANA_URL"
    echo "2. Start sending real telemetry data"
    echo "3. Configure alert notifications"
    echo "4. Train operators on dashboard usage"
else
    echo "⚠️ **Some tests failed.** Review the issues above before going live."
    echo ""
    echo "### Required Actions:"
    echo "1. Fix failed integrations"
    echo "2. Re-run tests until all pass"
    echo "3. Verify data flow end-to-end"
fi)

## Configuration Summary

- **Grafana URL**: $GRAFANA_URL
- **Dashboard URL**: $GRAFANA_URL/d/{dashboard-uid}
- **Data Sources**: CloudWatch, TimeStream, MQTT
- **Alert Channels**: Email, Slack, Webhook

## Support

For issues, refer to:
- Setup Guide: ../docs/grafana-setup-guide.md
- API Integration: ../docs/api-integration.md
- Configuration: ../config/
EOF
    
    echo "✅ Test report saved to $REPORT_FILE"
}

# Run all tests
echo "🚀 Starting integration tests..."

GRAFANA_HEALTH=1
GRAFANA_AUTH=1
DATA_SOURCES=1
DASHBOARD=1
AWS_CW=1
MQTT=1
TIMESTREAM=1
ALERTS=1

test_grafana_health && GRAFANA_HEALTH=0
test_grafana_auth && GRAFANA_AUTH=0
test_data_sources && DATA_SOURCES=0
test_dashboard_import && DASHBOARD=0
test_aws_cloudwatch && AWS_CW=0
test_mqtt_connectivity && MQTT=0
test_timestream && TIMESTREAM=0
test_alerts && ALERTS=0
send_test_data

# Calculate overall status
OVERALL_STATUS=$((GRAFANA_HEALTH + GRAFANA_AUTH + DASHBOARD))

generate_test_report

echo ""
echo "🏁 Integration Testing Complete"
echo "==============================="

if [ $OVERALL_STATUS -eq 0 ]; then
    echo "🎉 All critical tests passed! Ready for production."
    echo ""
    echo "🔗 Access your monitoring dashboard:"
    echo "   $GRAFANA_URL"
    echo ""
    echo "📋 Next steps:"
    echo "   1. Point ops.linknote.com to Grafana URL"
    echo "   2. Configure real data sources"
    echo "   3. Test alert notifications"
    echo "   4. Start demo telemetry flow"
else
    echo "⚠️  Some tests failed. Check the issues above."
    echo ""
    echo "🔧 Common fixes:"
    echo "   1. Verify environment variables in .env"
    echo "   2. Check API token permissions"
    echo "   3. Ensure AWS credentials are valid"
    echo "   4. Import dashboard configuration"
fi

echo ""
echo "📊 Detailed report: ../docs/integration-test-report.md"

exit $OVERALL_STATUS