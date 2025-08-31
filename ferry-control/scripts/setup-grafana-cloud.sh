#!/bin/bash
set -e

# BC Ferries Grafana Cloud Setup Script
# Sets up maritime telemetry monitoring at ops.linknote.com

echo "🚢 Setting up BC Ferries Grafana Cloud Workspace"
echo "================================================="

# Configuration
GRAFANA_CLOUD_API="https://grafana.com/api"
STACK_NAME="bcferriesdemo"
STACK_REGION="us-east-1"
ORG_NAME="bc-ferries-maritime-ops"

# Check for required environment variables
if [ -z "$GRAFANA_API_TOKEN" ]; then
    echo "❌ Error: GRAFANA_API_TOKEN environment variable not set"
    echo "   Please set your Grafana Cloud API token:"
    echo "   export GRAFANA_API_TOKEN='your-token-here'"
    exit 1
fi

echo "✅ Grafana API Token configured"

# Create Grafana Cloud Stack
echo ""
echo "🏗️  Creating Grafana Cloud Stack: $STACK_NAME"
echo "   Region: $STACK_REGION"
echo "   Organization: $ORG_NAME"

STACK_PAYLOAD=$(cat <<EOF
{
  "name": "$STACK_NAME",
  "slug": "$STACK_NAME",
  "url": "https://$STACK_NAME.grafana.net",
  "region": "$STACK_REGION",
  "description": "BC Ferries Maritime Operations Monitoring Dashboard",
  "labels": {
    "purpose": "maritime-telemetry",
    "demo": "bc-ferries",
    "duration": "1-week"
  }
}
EOF
)

echo "📡 Creating stack via Grafana Cloud API..."
STACK_RESPONSE=$(curl -s -X POST \
  "$GRAFANA_CLOUD_API/stacks" \
  -H "Authorization: Bearer $GRAFANA_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$STACK_PAYLOAD")

echo "$STACK_RESPONSE"

# Extract stack information
STACK_ID=$(echo "$STACK_RESPONSE" | jq -r '.id // empty')
GRAFANA_URL=$(echo "$STACK_RESPONSE" | jq -r '.url // empty')

if [ -z "$STACK_ID" ]; then
    echo "❌ Failed to create stack. Response:"
    echo "$STACK_RESPONSE"
    exit 1
fi

echo "✅ Stack created successfully!"
echo "   Stack ID: $STACK_ID"
echo "   Grafana URL: $GRAFANA_URL"
echo "   Admin URL: $GRAFANA_URL/admin"

# Create service account for API access
echo ""
echo "🔑 Creating service account for ferry monitoring..."

SA_PAYLOAD=$(cat <<EOF
{
  "name": "ferry-monitoring-service",
  "role": "Admin",
  "isDisabled": false
}
EOF
)

SA_RESPONSE=$(curl -s -X POST \
  "$GRAFANA_URL/api/serviceaccounts" \
  -H "Authorization: Bearer $GRAFANA_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$SA_PAYLOAD")

SA_ID=$(echo "$SA_RESPONSE" | jq -r '.id // empty')

if [ -n "$SA_ID" ]; then
    echo "✅ Service account created: ID $SA_ID"
    
    # Create service account token
    TOKEN_PAYLOAD=$(cat <<EOF
{
  "name": "ferry-ops-token",
  "role": "Admin"
}
EOF
)
    
    TOKEN_RESPONSE=$(curl -s -X POST \
      "$GRAFANA_URL/api/serviceaccounts/$SA_ID/tokens" \
      -H "Authorization: Bearer $GRAFANA_API_TOKEN" \
      -H "Content-Type: application/json" \
      -d "$TOKEN_PAYLOAD")
    
    SERVICE_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.key // empty')
    echo "✅ Service account token created"
else
    echo "⚠️  Service account creation failed, using main token"
    SERVICE_TOKEN="$GRAFANA_API_TOKEN"
fi

# Configure data sources
echo ""
echo "📊 Configuring data sources..."

# AWS CloudWatch Data Source
echo "   Setting up AWS CloudWatch..."
CLOUDWATCH_DS=$(cat <<EOF
{
  "name": "AWS CloudWatch",
  "type": "cloudwatch",
  "access": "proxy",
  "isDefault": false,
  "jsonData": {
    "authType": "default",
    "defaultRegion": "us-west-2",
    "customMetricsNamespaces": "Custom/FerryTelemetry"
  },
  "secureJsonData": {
    "accessKey": "$AWS_ACCESS_KEY_ID",
    "secretKey": "$AWS_SECRET_ACCESS_KEY"
  }
}
EOF
)

curl -s -X POST \
  "$GRAFANA_URL/api/datasources" \
  -H "Authorization: Bearer $SERVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$CLOUDWATCH_DS" > /dev/null

echo "✅ AWS CloudWatch data source configured"

# TimeStream Data Source
echo "   Setting up AWS TimeStream..."
TIMESTREAM_DS=$(cat <<EOF
{
  "name": "AWS TimeStream",
  "type": "grafana-timestream-datasource",
  "access": "proxy",
  "isDefault": false,
  "jsonData": {
    "authType": "default",
    "defaultRegion": "us-west-2",
    "database": "FerryTelemetryDB"
  },
  "secureJsonData": {
    "accessKey": "$AWS_ACCESS_KEY_ID",
    "secretKey": "$AWS_SECRET_ACCESS_KEY"
  }
}
EOF
)

curl -s -X POST \
  "$GRAFANA_URL/api/datasources" \
  -H "Authorization: Bearer $SERVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$TIMESTREAM_DS" > /dev/null

echo "✅ AWS TimeStream data source configured"

# Import monitoring dashboard
echo ""
echo "📋 Importing BC Ferries monitoring dashboard..."

if [ -f "../config/monitoring-dashboard.json" ]; then
    DASHBOARD_JSON=$(cat "../config/monitoring-dashboard.json")
    
    IMPORT_PAYLOAD=$(cat <<EOF
{
  "dashboard": $DASHBOARD_JSON,
  "overwrite": true,
  "inputs": [],
  "folderId": 0
}
EOF
)
    
    DASHBOARD_RESPONSE=$(curl -s -X POST \
      "$GRAFANA_URL/api/dashboards/db" \
      -H "Authorization: Bearer $SERVICE_TOKEN" \
      -H "Content-Type: application/json" \
      -d "$IMPORT_PAYLOAD")
    
    DASHBOARD_UID=$(echo "$DASHBOARD_RESPONSE" | jq -r '.uid // empty')
    
    if [ -n "$DASHBOARD_UID" ]; then
        echo "✅ Dashboard imported successfully"
        echo "   Dashboard UID: $DASHBOARD_UID"
        echo "   Dashboard URL: $GRAFANA_URL/d/$DASHBOARD_UID"
    else
        echo "⚠️  Dashboard import failed:"
        echo "$DASHBOARD_RESPONSE"
    fi
else
    echo "⚠️  Dashboard JSON file not found"
fi

# Configure alerts
echo ""
echo "🚨 Setting up alert rules..."

# Engine overheat alert
ALERT_RULE=$(cat <<EOF
{
  "uid": "engine-overheat-alert",
  "title": "Engine Overheat Emergency",
  "condition": "A",
  "data": [
    {
      "refId": "A",
      "queryType": "",
      "relativeTimeRange": {
        "from": 300,
        "to": 0
      },
      "model": {
        "datasource": {
          "type": "cloudwatch",
          "uid": "aws-cloudwatch"
        },
        "metricName": "EngineTemperature",
        "namespace": "Custom/FerryTelemetry",
        "refId": "A",
        "region": "us-west-2",
        "dimensions": {
          "VesselID": "001"
        }
      }
    }
  ],
  "intervalSeconds": 60,
  "maxDataPoints": 43200,
  "noDataState": "NoData",
  "execErrState": "Alerting",
  "for": "1m",
  "annotations": {
    "description": "Engine temperature exceeded critical threshold of 105°C",
    "runbook_url": "https://docs.bcferries.com/emergency/engine-overheat",
    "summary": "CRITICAL: Vessel {{ \$labels.VesselID }} engine temperature is {{ \$value }}°C"
  },
  "labels": {
    "severity": "critical",
    "system": "engine",
    "vessel": "001"
  }
}
EOF
)

# Create alert rule
curl -s -X POST \
  "$GRAFANA_URL/api/ruler/grafana/api/v1/rules/ferry-alerts" \
  -H "Authorization: Bearer $SERVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"interval\": \"1m\", \"rules\": [$ALERT_RULE]}" > /dev/null

echo "✅ Alert rules configured"

# Save configuration
echo ""
echo "💾 Saving configuration..."

CONFIG_FILE="../config/grafana-deployment.env"
cat > "$CONFIG_FILE" <<EOF
# BC Ferries Grafana Cloud Configuration
# Generated: $(date)

GRAFANA_STACK_ID=$STACK_ID
GRAFANA_URL=$GRAFANA_URL
GRAFANA_SERVICE_TOKEN=$SERVICE_TOKEN
DASHBOARD_UID=$DASHBOARD_UID

# URLs
MONITORING_DASHBOARD_URL=ops.linknote.com
CONTROL_DASHBOARD_URL=ferry.linknote.com

# AWS Configuration
AWS_REGION=us-west-2
IOT_ENDPOINT=\${IOT_ENDPOINT}
TIMESTREAM_DATABASE=FerryTelemetryDB

# MQTT Configuration  
HIVEMQ_BROKER=\${HIVEMQ_BROKER}
HIVEMQ_PORT=8883

# Demo Configuration
DEMO_DURATION=1week
ESTIMATED_COST=75USD
EOF

echo "✅ Configuration saved to $CONFIG_FILE"

# Setup summary
echo ""
echo "🎉 BC Ferries Grafana Cloud Setup Complete!"
echo "==========================================="
echo ""
echo "📊 Monitoring Dashboard:"
echo "   URL: $GRAFANA_URL"
echo "   Dashboard: $GRAFANA_URL/d/$DASHBOARD_UID"
echo ""
echo "🔧 Next Steps:"
echo "   1. Configure AWS IoT Core endpoints"
echo "   2. Set up HiveMQ Cloud broker"
echo "   3. Deploy TimeStream database"
echo "   4. Point ops.linknote.com to Grafana URL"
echo "   5. Test data source connections"
echo ""
echo "💰 Estimated Cost: ~$75 for 1-week demo"
echo "⏱️  Setup Time: 5-10 minutes"
echo ""
echo "🔑 Admin Access:"
echo "   URL: $GRAFANA_URL/admin"
echo "   Service Token: (saved in $CONFIG_FILE)"
echo ""
echo "📚 Documentation:"
echo "   Setup Guide: ../docs/grafana-setup.md"
echo "   API Reference: ../docs/api-integration.md"

# Test connection
echo ""
echo "🧪 Testing connection..."
HEALTH_CHECK=$(curl -s "$GRAFANA_URL/api/health" || echo "failed")

if [[ "$HEALTH_CHECK" == *"ok"* ]]; then
    echo "✅ Grafana Cloud stack is healthy and ready"
else
    echo "⚠️  Health check failed - please verify manually"
fi

echo ""
echo "Setup complete! 🚢"