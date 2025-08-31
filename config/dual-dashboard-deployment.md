# Dual Dashboard Deployment Configuration

## 🎯 Architecture Overview

**True Dual Dashboard Setup for BC Ferries Demo:**
- **ferry.linknote.com** → Fly.io Grafana (Vessel Control Dashboard)
- **ops.linknote.com** → AWS Managed Grafana (Enterprise Monitoring Dashboard)

```
┌─────────────────────────────┐    ┌──────────────────────────────┐
│     ferry.linknote.com      │    │      ops.linknote.com        │
│   (Fly.io Grafana 3000)    │    │   (AWS Managed Grafana)      │
│                             │    │                              │
│ 🎛️ Vessel Controls          │ -> │ 📊 Enterprise Monitoring     │
│ • Engine RPM Slider         │    │ • Real-time Telemetry        │
│ • Fire Alarm Button         │    │ • Alert Management           │
│ • Battery Override          │    │ • Fleet Dashboards           │
│ • Emergency Scenarios       │    │ • Historical Analytics       │
└─────────────────────────────┘    └──────────────────────────────┘
           |                                      ^
           |                                      |
           v                                      |
    ┌─────────────────┐                         |
    │ MQTT Simulator  │ ────────────────────────┘
    │ + Override APIs │   AWS IoT Core + TimeStream
    └─────────────────┘
```

## 📋 DNS Configuration

### **CloudFlare DNS Records**
```dns
# Vessel Control Dashboard (Fly.io)
ferry.linknote.com    CNAME   bc-ferries-control.fly.dev
ferry.linknote.com    AAAA    [Fly.io IPv6]

# Enterprise Monitoring (AWS Managed Grafana)  
ops.linknote.com      CNAME   g-abc123def456.grafana-workspace.us-west-2.amazonaws.com
```

### **CloudFlare SSL/TLS Settings**
```yaml
# Both subdomains
SSL/TLS Mode: Full (strict)
Edge Certificates: Universal SSL enabled
Always Use HTTPS: On
Automatic HTTPS Rewrites: On
```

## 🚀 Fly.io Configuration

### **ferry.linknote.com (Control Dashboard)**

#### **fly.toml**
```toml
app = "bc-ferries-control"
primary_region = "sea"  # Seattle - close to BC Ferries

[build]
  image = "grafana/grafana:latest"

[[services]]
  internal_port = 3000
  protocol = "tcp"

  [[services.ports]]
    port = 80
    handlers = ["http"]
    force_https = true

  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]

[env]
  GF_SERVER_DOMAIN = "ferry.linknote.com"
  GF_SERVER_ROOT_URL = "https://ferry.linknote.com"
  GF_SECURITY_ADMIN_PASSWORD = "{{ secrets.GRAFANA_ADMIN_PASSWORD }}"
  GF_INSTALL_PLUGINS = "grafana-button-panel,natel-discrete-panel,vonage-status-panel"
  GF_FEATURE_TOGGLES_ENABLE = "publicDashboards"

[[services]]
  internal_port = 8080
  protocol = "tcp"

  [[services.ports]]
    port = 8080
    handlers = ["http"]

[env.override_api]
  API_PORT = "8080"
  MQTT_BROKER = "{{ secrets.HIVEMQ_BROKER_URL }}"
  MQTT_USERNAME = "{{ secrets.HIVEMQ_USERNAME }}"
  MQTT_PASSWORD = "{{ secrets.HIVEMQ_PASSWORD }}"
```

#### **Dockerfile**
```dockerfile
FROM grafana/grafana:latest

USER root

# Install plugins
RUN grafana-cli plugins install grafana-button-panel
RUN grafana-cli plugins install natel-discrete-panel  
RUN grafana-cli plugins install vonage-status-panel

# Install Node.js for override API
RUN apt-get update && apt-get install -y nodejs npm

# Copy override API
COPY override-api/ /app/override-api/
WORKDIR /app/override-api
RUN npm install

# Copy Grafana configuration
COPY grafana-config/ /etc/grafana/provisioning/

USER grafana

# Start both Grafana and Override API
COPY start-services.sh /start-services.sh
CMD ["/start-services.sh"]
```

#### **start-services.sh**
```bash
#!/bin/bash

# Start Override API in background
cd /app/override-api
node server.js &

# Start Grafana
exec /run.sh
```

## ☁️ AWS Configuration

### **AWS Managed Grafana Workspace**

#### **CloudFormation Template (grafana-workspace.yaml)**
```yaml
AWSTemplateFormatVersion: '2010-09-09'
Description: 'BC Ferries Enterprise Monitoring - AWS Managed Grafana'

Resources:
  BCFerriesGrafanaWorkspace:
    Type: AWS::Grafana::Workspace
    Properties:
      Name: bc-ferries-enterprise
      Description: 'BC Ferries Fleet Monitoring Dashboard'
      AuthenticationProviders:
        - AWS_SSO
        - SAML
      DataSources:
        - TIMESTREAM
        - CLOUDWATCH
        - PROMETHEUS
      OrganizationRoleName: BC-Ferries-Grafana-Role
      PermissionType: SERVICE_MANAGED
      WorkspaceRoleArn: !GetAtt GrafanaServiceRole.Arn
      
  GrafanaServiceRole:
    Type: AWS::IAM::Role
    Properties:
      RoleName: BC-Ferries-Grafana-Service-Role
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Principal:
              Service: grafana.amazonaws.com
            Action: sts:AssumeRole
      ManagedPolicyArns:
        - arn:aws:iam::aws:policy/service-role/AmazonGrafanaServiceRole
      Policies:
        - PolicyName: TimestreamReadAccess
          PolicyDocument:
            Version: '2012-10-17'
            Statement:
              - Effect: Allow
                Action:
                  - timestream:DescribeDatabase
                  - timestream:DescribeTable
                  - timestream:ListDatabases
                  - timestream:ListTables
                  - timestream:Select
                Resource: 
                  - !Sub 'arn:aws:timestream:${AWS::Region}:${AWS::AccountId}:database/BCFerries'
                  - !Sub 'arn:aws:timestream:${AWS::Region}:${AWS::AccountId}:database/BCFerries/table/*'

  BCFerriesCustomDomain:
    Type: AWS::Grafana::WorkspaceSamlConfiguration
    Properties:
      WorkspaceId: !Ref BCFerriesGrafanaWorkspace
      RoleValues:
        Editor: 
          - bc-ferries-operators
        Admin:
          - bc-ferries-admins

Outputs:
  WorkspaceEndpoint:
    Description: 'Grafana Workspace Endpoint'
    Value: !GetAtt BCFerriesGrafanaWorkspace.Endpoint
    Export:
      Name: BC-Ferries-Grafana-Endpoint
      
  WorkspaceId:
    Description: 'Grafana Workspace ID'
    Value: !Ref BCFerriesGrafanaWorkspace
    Export:
      Name: BC-Ferries-Grafana-ID
```

### **Custom Domain Configuration**
```bash
# AWS CLI commands for custom domain
aws grafana create-workspace-api-key \
  --key-name "ops-linknote-com" \
  --key-role ADMIN \
  --seconds-to-live 31536000 \
  --workspace-id g-abc123def456

# Configure custom domain (requires Grafana Enterprise)
aws grafana put-workspace-configuration \
  --workspace-id g-abc123def456 \
  --configuration '{
    "server": {
      "domain": "ops.linknote.com",
      "root_url": "https://ops.linknote.com"
    }
  }'
```

## 🔧 Override API Implementation

### **override-api/server.js**
```javascript
const express = require('express');
const mqtt = require('mqtt');
const cors = require('cors');
const app = express();

app.use(express.json());
app.use(cors());

// MQTT Client
const mqttClient = mqtt.connect(process.env.MQTT_BROKER, {
  username: process.env.MQTT_USERNAME,
  password: process.env.MQTT_PASSWORD,
  clientId: `bc-ferries-control-${Math.random().toString(16).substr(2, 8)}`
});

// Vessel state tracking
let vesselState = {
  engineRPM: 1200,
  batterySOC: 85,
  fireAlarmActive: false,
  powerMode: 'hybrid'
};

// Engine Controls
app.post('/api/override/engine/rpm', (req, res) => {
  const { value } = req.body;
  vesselState.engineRPM = value;
  
  const message = {
    timestamp: Date.now(),
    vesselId: 'island-class-001',
    sensor: 'main_engine_rpm',
    value: value,
    override: true,
    source: 'control-dashboard'
  };
  
  mqttClient.publish('fleet/bcferries/island-class-001/engine/rpm', JSON.stringify(message));
  
  res.json({ 
    success: true, 
    message: `Engine RPM set to ${value}`,
    currentState: vesselState 
  });
});

// Safety Systems
app.post('/api/emergency/fire/trigger', (req, res) => {
  vesselState.fireAlarmActive = true;
  vesselState.engineRPM = 0; // Emergency shutdown
  
  const fireMessage = {
    timestamp: Date.now(),
    vesselId: 'island-class-001',
    emergency: true,
    type: 'FIRE_ALARM',
    location: 'engine_room',
    severity: 'HIGH',
    actions: ['ENGINE_SHUTDOWN', 'FIRE_SUPPRESSION_READY']
  };
  
  mqttClient.publish('fleet/bcferries/island-class-001/emergency/fire', JSON.stringify(fireMessage));
  
  res.json({ 
    success: true, 
    message: 'Fire alarm triggered - Emergency protocols activated',
    currentState: vesselState 
  });
});

// Power Management
app.post('/api/override/power/battery', (req, res) => {
  const { soc } = req.body;
  vesselState.batterySOC = soc;
  
  const message = {
    timestamp: Date.now(),
    vesselId: 'island-class-001',
    sensor: 'battery_state_of_charge',
    value: soc,
    unit: 'percentage',
    override: true
  };
  
  mqttClient.publish('fleet/bcferries/island-class-001/power/battery', JSON.stringify(message));
  
  res.json({ 
    success: true, 
    message: `Battery SOC set to ${soc}%`,
    currentState: vesselState 
  });
});

// Power Mode Switch
app.post('/api/override/power/mode/:mode', (req, res) => {
  const { mode } = req.params; // electric, hybrid, diesel
  vesselState.powerMode = mode;
  
  const message = {
    timestamp: Date.now(),
    vesselId: 'island-class-001',
    system: 'power_management',
    mode: mode,
    transition: true,
    source: 'control-dashboard'
  };
  
  mqttClient.publish('fleet/bcferries/island-class-001/power/mode', JSON.stringify(message));
  
  res.json({ 
    success: true, 
    message: `Switched to ${mode} mode`,
    currentState: vesselState 
  });
});

// Current state endpoint
app.get('/api/state', (req, res) => {
  res.json(vesselState);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', mqtt: mqttClient.connected });
});

const PORT = process.env.API_PORT || 8080;
app.listen(PORT, () => {
  console.log(`BC Ferries Control API running on port ${PORT}`);
  console.log(`MQTT connected: ${mqttClient.connected}`);
});
```

### **package.json**
```json
{
  "name": "bc-ferries-control-api",
  "version": "1.0.0",
  "description": "Interactive control API for BC Ferries vessel simulation",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "mqtt": "^4.3.7",
    "cors": "^2.8.5"
  }
}
```

## 📊 Grafana Dashboard Configurations

### **Control Dashboard (ferry.linknote.com)**
```json
{
  "dashboard": {
    "title": "BC Ferries - Island Class Vessel 001 - Control Interface",
    "tags": ["bc-ferries", "vessel-control", "interactive"],
    "panels": [
      {
        "title": "Engine Controls",
        "type": "row",
        "gridPos": {"h": 1, "w": 24, "x": 0, "y": 0},
        "panels": [
          {
            "title": "Current Engine RPM",
            "type": "stat",
            "gridPos": {"h": 4, "w": 6, "x": 0, "y": 1},
            "targets": [{
              "queryType": "http",
              "url": "http://localhost:8080/api/state",
              "jsonPath": "$.engineRPM"
            }],
            "fieldConfig": {
              "defaults": {
                "color": {"mode": "thresholds"},
                "thresholds": {
                  "steps": [
                    {"color": "green", "value": null},
                    {"color": "yellow", "value": 1500},
                    {"color": "red", "value": 1800}
                  ]
                },
                "unit": "rpm"
              }
            }
          },
          {
            "title": "RPM Override Control",
            "type": "button-panel",
            "gridPos": {"h": 4, "w": 6, "x": 6, "y": 1},
            "options": {
              "buttons": [
                {
                  "text": "Idle (800 RPM)",
                  "variant": "secondary",
                  "url": "http://localhost:8080/api/override/engine/rpm",
                  "method": "POST",
                  "payload": "{\"value\": 800}"
                },
                {
                  "text": "Cruise (1200 RPM)",
                  "variant": "primary", 
                  "url": "http://localhost:8080/api/override/engine/rpm",
                  "method": "POST",
                  "payload": "{\"value\": 1200}"
                },
                {
                  "text": "Full Power (1800 RPM)",
                  "variant": "destructive",
                  "url": "http://localhost:8080/api/override/engine/rpm",
                  "method": "POST",
                  "payload": "{\"value\": 1800}"
                }
              ]
            }
          }
        ]
      },
      {
        "title": "Emergency Controls",
        "type": "row",
        "gridPos": {"h": 1, "w": 24, "x": 0, "y": 5},
        "panels": [
          {
            "title": "Fire Emergency",
            "type": "button-panel",
            "gridPos": {"h": 4, "w": 8, "x": 0, "y": 6},
            "options": {
              "buttons": [
                {
                  "text": "🚨 TRIGGER FIRE ALARM 🚨",
                  "variant": "destructive",
                  "url": "http://localhost:8080/api/emergency/fire/trigger",
                  "method": "POST",
                  "confirmation": "This will trigger emergency protocols. Proceed?"
                }
              ]
            }
          }
        ]
      },
      {
        "title": "Power Management",
        "type": "row",
        "gridPos": {"h": 1, "w": 24, "x": 0, "y": 10},
        "panels": [
          {
            "title": "Battery State of Charge",
            "type": "stat",
            "gridPos": {"h": 4, "w": 4, "x": 0, "y": 11},
            "targets": [{
              "queryType": "http",
              "url": "http://localhost:8080/api/state",
              "jsonPath": "$.batterySOC"
            }],
            "fieldConfig": {
              "defaults": {
                "color": {"mode": "thresholds"},
                "thresholds": {
                  "steps": [
                    {"color": "red", "value": null},
                    {"color": "yellow", "value": 30},
                    {"color": "green", "value": 60}
                  ]
                },
                "unit": "percent",
                "max": 100,
                "min": 0
              }
            }
          },
          {
            "title": "Power Mode Controls",
            "type": "button-panel",
            "gridPos": {"h": 4, "w": 8, "x": 4, "y": 11},
            "options": {
              "buttons": [
                {
                  "text": "⚡ Electric Mode",
                  "variant": "primary",
                  "url": "http://localhost:8080/api/override/power/mode/electric",
                  "method": "POST"
                },
                {
                  "text": "🔋 Hybrid Mode",
                  "variant": "secondary",
                  "url": "http://localhost:8080/api/override/power/mode/hybrid",
                  "method": "POST"
                },
                {
                  "text": "⛽ Diesel Mode",
                  "variant": "tertiary",
                  "url": "http://localhost:8080/api/override/power/mode/diesel",
                  "method": "POST"
                }
              ]
            }
          }
        ]
      }
    ]
  }
}
```

## 🌐 CloudFlare Configuration

### **CloudFlare API Script**
```bash
#!/bin/bash

# CloudFlare API Configuration
CLOUDFLARE_API_TOKEN="your-cloudflare-api-token"
ZONE_ID="your-zone-id"

# Create ferry.linknote.com (Fly.io)
curl -X POST "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{
    "type": "CNAME",
    "name": "ferry",
    "content": "bc-ferries-control.fly.dev",
    "ttl": 300,
    "proxied": true
  }'

# Create ops.linknote.com (AWS Managed Grafana)  
curl -X POST "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{
    "type": "CNAME",
    "name": "ops",
    "content": "g-abc123def456.grafana-workspace.us-west-2.amazonaws.com",
    "ttl": 300,
    "proxied": true
  }'

# Configure SSL settings for both subdomains
curl -X PATCH "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/settings/ssl" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{"value": "full"}'
```

## 📜 Deployment Scripts

### **deploy-control-dashboard.sh**
```bash
#!/bin/bash

echo "🚀 Deploying BC Ferries Control Dashboard to Fly.io..."

# Navigate to project directory
cd /home/murr2k/projects/aws-test/linknote-aws-demos/live-site

# Create Fly.io app
fly apps create bc-ferries-control --org personal

# Set secrets
fly secrets set GRAFANA_ADMIN_PASSWORD="$(openssl rand -base64 32)" --app bc-ferries-control
fly secrets set HIVEMQ_BROKER_URL="your-hivemq-broker-url" --app bc-ferries-control
fly secrets set HIVEMQ_USERNAME="your-hivemq-username" --app bc-ferries-control  
fly secrets set HIVEMQ_PASSWORD="your-hivemq-password" --app bc-ferries-control

# Deploy application
fly deploy --app bc-ferries-control

# Check deployment
fly status --app bc-ferries-control

echo "✅ Control dashboard deployed at https://bc-ferries-control.fly.dev"
echo "🌐 Custom domain will be available at https://ferry.linknote.com"
```

### **deploy-aws-grafana.sh**
```bash
#!/bin/bash

echo "☁️ Deploying AWS Managed Grafana workspace..."

# Deploy CloudFormation stack
aws cloudformation deploy \
  --template-file config/grafana-workspace.yaml \
  --stack-name bc-ferries-grafana \
  --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
  --region us-west-2

# Get workspace endpoint
WORKSPACE_ENDPOINT=$(aws cloudformation describe-stacks \
  --stack-name bc-ferries-grafana \
  --query 'Stacks[0].Outputs[?OutputKey==`WorkspaceEndpoint`].OutputValue' \
  --output text)

echo "✅ AWS Managed Grafana deployed at: ${WORKSPACE_ENDPOINT}"
echo "🌐 Custom domain will be available at https://ops.linknote.com"

# Configure custom domain (manual step required)
echo "⚠️  Manual step required: Configure custom domain in AWS Console"
echo "   - Go to Amazon Managed Grafana console"
echo "   - Select your workspace"  
echo "   - Configure authentication and custom domain"
```

## 🧪 Testing Configuration

### **test-dual-dashboard.sh**
```bash
#!/bin/bash

echo "🧪 Testing Dual Dashboard Configuration..."

# Test ferry.linknote.com (Control Dashboard)
echo "Testing Control Dashboard..."
CONTROL_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://ferry.linknote.com)
if [ $CONTROL_STATUS -eq 200 ]; then
  echo "✅ ferry.linknote.com is responding"
else
  echo "❌ ferry.linknote.com returned status: $CONTROL_STATUS"
fi

# Test ops.linknote.com (Monitoring Dashboard)  
echo "Testing Monitoring Dashboard..."
OPS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://ops.linknote.com)
if [ $OPS_STATUS -eq 200 ]; then
  echo "✅ ops.linknote.com is responding"
else
  echo "❌ ops.linknote.com returned status: $OPS_STATUS"
fi

# Test override API
echo "Testing Override API..."
API_RESPONSE=$(curl -s -X POST https://ferry.linknote.com:8080/api/override/engine/rpm \
  -H "Content-Type: application/json" \
  -d '{"value": 1500}')

if echo "$API_RESPONSE" | grep -q "success"; then
  echo "✅ Override API is working"
else
  echo "❌ Override API failed: $API_RESPONSE"
fi

echo "🎯 Dual Dashboard Test Complete"
```

## 💰 Total Cost Breakdown

### **Dual Dashboard Infrastructure**
| **Service** | **Monthly Cost** | **Demo Week** | **Purpose** |
|-------------|------------------|---------------|-------------|
| **Fly.io (Control)** | $5.00 | $1.15 | ferry.linknote.com Grafana |
| **AWS Managed Grafana** | $9.00 | $2.08 | ops.linknote.com Enterprise |
| **CloudFlare Pro** | $20.00 | $4.62 | SSL + Custom domains |
| **AWS IoT Core** | $25.00 | $5.77 | MQTT broker + device mgmt |
| **TimeStream** | $0.00 | $0.00 | Time-series DB (free tier) |
| **HiveMQ Cloud** | $49.00 | $11.31 | Production MQTT broker |
| **Domain + DNS** | $2.00 | $0.46 | linknote.com subdomains |
| **TOTAL** | **$110.00** | **$25.39** | **Professional dual setup** |

## ✅ Implementation Checklist

### **Phase 1: Infrastructure (Day 1-2)**
- [ ] Deploy AWS CloudFormation stack for Managed Grafana
- [ ] Create Fly.io application for control dashboard  
- [ ] Configure CloudFlare DNS records for both subdomains
- [ ] Set up SSL certificates and proxy settings

### **Phase 2: Applications (Day 3-5)**  
- [ ] Deploy Grafana with interactive plugins to Fly.io
- [ ] Configure AWS Managed Grafana workspace and data sources
- [ ] Implement override API with MQTT integration
- [ ] Create control dashboard with buttons and sliders

### **Phase 3: Integration (Day 6-7)**
- [ ] Connect control API to AWS IoT Core via MQTT
- [ ] Set up TimeStream database and Grafana data sources
- [ ] Configure monitoring dashboards in AWS Grafana
- [ ] Test end-to-end control → MQTT → AWS → visualization

### **Phase 4: Demo Prep (Day 8)**
- [ ] Create demo script with specific control sequences
- [ ] Test dual-screen presentation setup
- [ ] Verify SSL certificates and custom domains
- [ ] Run full end-to-end demonstration test

This configuration provides a **professional, enterprise-grade dual dashboard setup** that demonstrates real technical capability beyond typical interview presentations.