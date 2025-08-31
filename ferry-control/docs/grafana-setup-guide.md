# BC Ferries Grafana Cloud Setup Guide

## Overview

This guide walks through setting up a Grafana Cloud workspace for BC Ferries maritime telemetry monitoring at **ops.linknote.com**.

## Architecture Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Vessel 001    │───▶│   AWS IoT Core   │───▶│  Grafana Cloud  │
│ ┌─────────────┐ │    │ ┌──────────────┐ │    │ ┌─────────────┐ │
│ │  Sensors    │ │    │ │ Device Data  │ │    │ │ Monitoring  │ │
│ │  • Engine   │ │    │ │ • MQTT       │ │    │ │ Dashboard   │ │
│ │  • Power    │ │    │ │ • Rules      │ │    │ │ • Metrics   │ │
│ │  • Safety   │ │    │ │ • Analytics  │ │    │ │ • Alerts    │ │
│ │  • Nav      │ │    │ └──────────────┘ │    │ └─────────────┘ │
│ └─────────────┘ │    └──────────────────┘    └─────────────────┘
└─────────────────┘           │                         ▲
                              │                         │
                    ┌─────────▼─────────┐    ┌─────────┴──────┐
                    │   HiveMQ Cloud    │    │ AWS CloudWatch │
                    │ ┌───────────────┐ │    │ ┌────────────┐ │
                    │ │ MQTT Broker   │ │    │ │ Logs       │ │
                    │ │ • Pub/Sub     │ │    │ │ • Metrics  │ │
                    │ │ • Routing     │ │    │ │ • Events   │ │
                    │ └───────────────┘ │    │ └────────────┘ │
                    └───────────────────┘    └────────────────┘
                              │                         │
                    ┌─────────▼─────────┐    ┌─────────▼──────┐
                    │  AWS TimeStream   │    │   Control UI   │
                    │ ┌───────────────┐ │    │ ┌────────────┐ │
                    │ │ Time Series   │ │    │ │ ferry.     │ │
                    │ │ • Historical  │ │    │ │ linknote.  │ │
                    │ │ • Analytics   │ │    │ │ com        │ │
                    │ └───────────────┘ │    │ └────────────┘ │
                    └───────────────────┘    └────────────────┘
```

## Prerequisites

1. **Grafana Cloud Account**
   - Sign up at [grafana.com](https://grafana.com)
   - Get API token from Account Settings

2. **AWS Credentials**
   - AWS Access Key ID and Secret Access Key
   - Permissions for IoT Core, CloudWatch, TimeStream

3. **HiveMQ Cloud Account** (optional)
   - MQTT broker for real-time messaging
   - Username and password

4. **Domain Configuration**
   - Point ops.linknote.com to Grafana Cloud URL

## Quick Setup

### 1. Run Setup Script

```bash
cd scripts/
export GRAFANA_API_TOKEN="your-grafana-cloud-token"
export AWS_ACCESS_KEY_ID="your-aws-key"
export AWS_SECRET_ACCESS_KEY="your-aws-secret"
chmod +x setup-grafana-cloud.sh
./setup-grafana-cloud.sh
```

### 2. Configure Data Sources

The script automatically configures:
- ✅ AWS CloudWatch
- ✅ AWS TimeStream  
- ✅ AWS IoT Core MQTT
- ✅ HiveMQ Cloud (if configured)

### 3. Import Dashboard

The monitoring dashboard is automatically imported with:
- 🔧 Engine performance metrics
- ⚡ Power system status
- 🚨 Safety system monitoring
- 🧭 Navigation and location
- 📊 System health overview

## Manual Setup (Alternative)

### Step 1: Create Grafana Cloud Stack

1. Go to [Grafana Cloud Console](https://grafana.com/orgs)
2. Click **"Create Stack"**
3. Configure:
   - **Stack Name**: `bcferriesdemo`
   - **Region**: `us-east-1`
   - **Plan**: Pro ($50/month for demo)
4. Note your Grafana URL: `https://bcferriesdemo.grafana.net`

### Step 2: Configure Data Sources

#### AWS CloudWatch
```yaml
name: AWS CloudWatch
type: cloudwatch
url: https://monitoring.us-west-2.amazonaws.com
region: us-west-2
access_key: YOUR_AWS_ACCESS_KEY
secret_key: YOUR_AWS_SECRET_KEY
namespaces:
  - Custom/FerryTelemetry
  - AWS/IoT
```

#### AWS TimeStream
```yaml
name: AWS TimeStream
type: grafana-timestream-datasource
region: us-west-2
database: FerryTelemetryDB
access_key: YOUR_AWS_ACCESS_KEY
secret_key: YOUR_AWS_SECRET_KEY
```

#### HiveMQ MQTT
```yaml
name: HiveMQ Cloud MQTT
type: mqtt
broker: YOUR_CLUSTER.s2.eu.hivemq.cloud:8883
username: ferry-monitoring
password: YOUR_HIVEMQ_PASSWORD
topics:
  - ferry/vessel/001/telemetry/+
  - ferry/vessel/001/alerts/+
```

### Step 3: Import Dashboard

1. Go to **Dashboards** → **Import**
2. Upload `config/monitoring-dashboard.json`
3. Configure data source mappings
4. Save dashboard

### Step 4: Configure Alerts

#### Critical Alerts
- **Engine Overheat**: Temperature > 105°C
- **Fire Alarm**: Status = alarm
- **Low Battery**: SOC < 15%
- **High Bilge**: Level > 70%

#### Alert Channels
- **Email**: ops@bcferries.com
- **SMS**: Emergency numbers
- **Slack**: #ferry-ops channel
- **Webhook**: Custom integrations

## Data Source Configuration Details

### 1. AWS IoT Core Integration

**Topics to Subscribe:**
```
ferry/vessel/001/telemetry/engine    # RPM, temp, fuel flow
ferry/vessel/001/telemetry/power     # Battery SOC, mode, generator
ferry/vessel/001/telemetry/safety    # Fire, bilge, CO2 levels
ferry/vessel/001/telemetry/navigation # Speed, heading, location
ferry/vessel/001/alerts/+            # Emergency alerts
```

**Message Format:**
```json
{
  "timestamp": "2025-08-31T07:30:00Z",
  "vessel_id": "001",
  "system": "engine",
  "metrics": {
    "rpm": 1200,
    "temperature": 85.5,
    "fuel_flow": 45.2,
    "oil_pressure": 2.8
  }
}
```

### 2. AWS CloudWatch Metrics

**Custom Namespace:** `Custom/FerryTelemetry`

**Key Metrics:**
- `EngineRPM` (Count)
- `EngineTemperature` (Average)  
- `FuelFlowRate` (Sum)
- `BatterySOC` (Average)
- `VesselSpeed` (Average)
- `CO2Levels` (Maximum)

**Dimensions:**
- `VesselID`: 001
- `System`: engine|power|safety|navigation
- `Location`: engine_room|bridge|deck

### 3. AWS TimeStream Schema

**Database:** `FerryTelemetryDB`

**Tables:**
```sql
-- VesselTelemetry (main table)
CREATE TABLE VesselTelemetry (
  time TIMESTAMP NOT NULL,
  vessel_id VARCHAR(10),
  system VARCHAR(20),
  metric_name VARCHAR(50), 
  metric_value DOUBLE,
  unit VARCHAR(20),
  location VARCHAR(30)
);

-- EngineMetrics (specialized)
CREATE TABLE EngineMetrics (
  time TIMESTAMP NOT NULL,
  vessel_id VARCHAR(10),
  rpm DOUBLE,
  temperature DOUBLE,
  fuel_flow DOUBLE,
  oil_pressure DOUBLE
);

-- SafetySystems (specialized)
CREATE TABLE SafetySystems (
  time TIMESTAMP NOT NULL,
  vessel_id VARCHAR(10),
  fire_alarm_status VARCHAR(10),
  bilge_level DOUBLE,
  co2_level DOUBLE,
  emergency_stop BOOLEAN
);
```

## Dashboard Panels Configuration

### Engine Performance
- **RPM Timeseries**: Real-time engine RPM with thresholds
- **Temperature Gauge**: Current engine temperature
- **Fuel Flow**: Fuel consumption rate

### Power Systems  
- **Battery SOC**: State of charge percentage
- **Power Mode**: Current operating mode (electric/hybrid/diesel)
- **Generator Load**: Generator utilization percentage

### Safety Systems
- **Fire Alarm**: Status indicator with alerts
- **Bilge Level**: Water level gauge
- **CO₂ Monitoring**: Air quality levels

### Navigation
- **Speed Graph**: Vessel speed over time
- **Heading Gauge**: Current compass heading
- **Route Map**: GPS position on map

### System Health
- **Alert List**: Current active alerts
- **Data Source Status**: Connection health

## Alert Rules Configuration

### Critical Alerts (Immediate Response)

```yaml
# Engine Overheat
alert: EngineOverheat
expr: ferry_engine_temperature > 105
for: 30s
labels:
  severity: critical
  system: engine
annotations:
  summary: "Engine temperature critical: {{ $value }}°C"
  description: "Vessel {{ $labels.vessel_id }} engine temperature exceeded safe operating limits"

# Fire Alarm
alert: FireAlarmActive  
expr: ferry_fire_alarm_status == 1
for: 5s
labels:
  severity: critical
  system: safety
annotations:
  summary: "FIRE ALARM ACTIVATED"
  description: "Fire alarm triggered on vessel {{ $labels.vessel_id }}"
```

### Warning Alerts (Monitor Closely)

```yaml
# Low Battery
alert: LowBattery
expr: ferry_battery_soc < 25
for: 2m
labels:
  severity: warning
  system: power
annotations:
  summary: "Low battery: {{ $value }}%"

# High RPM
alert: HighRPM
expr: ferry_engine_rpm > 1700
for: 1m  
labels:
  severity: warning
  system: engine
annotations:
  summary: "High engine RPM: {{ $value }}"
```

## Cost Optimization

### Estimated Costs (1-week demo)

| Service | Cost | Usage |
|---------|------|-------|
| Grafana Cloud Pro | $50/month | ~$12/week |
| AWS IoT Core | $5/month | 1M messages |
| AWS CloudWatch | $10/month | Custom metrics |
| AWS TimeStream | $5/month | 1M writes |
| HiveMQ Cloud | $15/month | Starter plan |
| **Total** | **~$85/month** | **~$20/week** |

### Cost Reduction Tips

1. **Use Free Tiers**
   - Grafana Cloud: 14-day free trial
   - AWS: Free tier limits
   - HiveMQ: 100 connections free

2. **Optimize Data Retention**
   - CloudWatch: 1 day retention
   - TimeStream: 7 days memory, 30 days magnetic
   - Grafana: Basic retention

3. **Reduce Update Frequency**
   - Use 30-second intervals instead of 5-second
   - Aggregate data before sending

## Testing and Validation

### 1. Data Source Testing

```bash
# Test CloudWatch connection
curl -X GET "https://bcferriesdemo.grafana.net/api/datasources/proxy/1/api/v1/query" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d "query=up"

# Test MQTT connection  
mosquitto_pub -h YOUR_HIVEMQ_CLUSTER.s2.eu.hivemq.cloud \
  -p 8883 -u ferry-monitoring -P YOUR_PASSWORD \
  -t "ferry/vessel/001/test" -m '{"test": true}'
```

### 2. Dashboard Testing

1. Open dashboard: `https://bcferriesdemo.grafana.net/d/DASHBOARD_UID`
2. Verify all panels load data
3. Test time range selection
4. Check variable dropdowns work

### 3. Alert Testing

```bash
# Trigger test alert via control interface
curl -X POST "http://ferry.linknote.com:8080/api/override/engine/temp" \
  -H "Content-Type: application/json" \
  -d '{"value": 110}'

# Check alert status
curl -X GET "https://bcferriesdemo.grafana.net/api/alerts" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Troubleshooting

### Common Issues

1. **Data Sources Not Connecting**
   - Check AWS credentials and permissions
   - Verify region settings match
   - Test network connectivity

2. **No Data in Panels**  
   - Verify data source queries
   - Check time range settings
   - Confirm metric names and dimensions

3. **Alerts Not Firing**
   - Test alert conditions manually
   - Check notification channel config
   - Verify alert rule syntax

### Debug Commands

```bash
# Check Grafana API health
curl -X GET "https://bcferriesdemo.grafana.net/api/health"

# List data sources
curl -X GET "https://bcferriesdemo.grafana.net/api/datasources" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test data source
curl -X GET "https://bcferriesdemo.grafana.net/api/datasources/proxy/1/api/v1/label/__name__/values" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## DNS Configuration

### Point ops.linknote.com to Grafana

**Option 1: CNAME (Recommended)**
```
ops.linknote.com. 300 IN CNAME bcferriesdemo.grafana.net.
```

**Option 2: Reverse Proxy**
```nginx
server {
    listen 80;
    server_name ops.linknote.com;
    
    location / {
        proxy_pass https://bcferriesdemo.grafana.net;
        proxy_set_header Host bcferriesdemo.grafana.net;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Production Considerations

### Security
- Use service account tokens, not admin tokens
- Enable IP restrictions if possible
- Set up proper user roles and permissions
- Use HTTPS/TLS for all connections

### Scalability  
- Plan for multiple vessels
- Consider data partitioning strategies
- Use template variables for vessel selection
- Implement proper data lifecycle policies

### Monitoring
- Set up Grafana monitoring itself
- Monitor data source health
- Track alert delivery success
- Monitor resource usage and costs

## Support and Documentation

- **Grafana Docs**: https://grafana.com/docs/grafana-cloud/
- **AWS IoT Docs**: https://docs.aws.amazon.com/iot/
- **TimeStream Docs**: https://docs.aws.amazon.com/timestream/
- **Project Issues**: Submit via GitHub issues

---

**Next Steps:**
1. Run the setup script
2. Configure data source endpoints  
3. Test dashboard functionality
4. Set up DNS pointing
5. Verify alert notifications
6. Start demo telemetry data flow