# Live BC Ferries Demo - 1 Week, 1 Vessel Cost Analysis

## 🎯 Demo Scope Definition

**Duration**: 1 week (7 days)  
**Scale**: 1 Island Class vessel simulation  
**Sensors**: 200-300 key sensors (not 10,000)  
**Objective**: Live dashboard demonstration for BC Ferries interview  

## 📊 Minimal Viable Demo Architecture

### **Core Components**
```
Fly.io Simulator → HiveMQ Cloud → AWS IoT Core → TimeStream → Grafana
                                              → CloudWatch (basic monitoring)
```

### **Sensor Selection (Maritime Focus)**
- **Engine Systems**: 50 sensors (RPM, temp, pressure, fuel flow)
- **Power Systems**: 40 sensors (battery, generator, distribution)  
- **Navigation**: 30 sensors (GPS, compass, AIS, depth)
- **Environmental**: 25 sensors (weather, water temp, marine life)
- **Safety Systems**: 35 sensors (fire, bilge, CO detection)
- **HVAC/Comfort**: 20 sensors (cabin temp, ventilation)
- **Total**: ~200 sensors (manageable demonstration scale)

## 💰 1-Week Demo Cost Breakdown

### **AWS Services (7 days)**

#### **AWS IoT Core**
```
Configuration:
- Messages: 200 sensors × 60 sec/min × 1440 min/day × 7 days = 120,960,000 messages
- Connection Time: 1 device × 168 hours (7 days × 24 hours)
- Device Shadow: 500 operations total
- Rules Engine: 120,960,000 executions

Cost Calculation:
- Connectivity: 168 hours × $0.08/million connection-minutes ÷ 60 = $0.000224
- Messaging: 120.96M messages × $1.00/million = $120.96
- Device Shadow: 500 operations × $1.25/million = $0.000625  
- Rules Engine: 120.96M × $0.15/million = $18.14

7-Day Total: $139.10
```

#### **Amazon TimeStream**
```
Configuration:
- Data Ingestion: ~0.5 GB over 7 days
- Memory Store: 0.1 GB average (7-day retention)
- Query Processing: 5 TCU-hours for dashboard queries

Cost Calculation (Free Tier Benefits):
- Ingestion: FREE (50 GB free tier covers $25 value)
- Memory Store: FREE (750 GB-hour free tier covers $27 value)  
- Query Processing: FREE (24 TCU-hours free tier covers $0.24 value)

7-Day Total: $0.00 (covered by free tier)
```

#### **AWS Lambda**
```
Configuration:
- Data Processing: 5,000 invocations over 7 days
- Memory: 256 MB, Duration: 200ms average
- Total Compute: 1,000 GB-seconds

Cost Calculation:
- Requests: FREE (1M requests/month free tier)
- Compute: FREE (400K GB-seconds/month free tier)

7-Day Total: $0.00 (within free tier)
```

#### **AWS Secrets Manager**
```
Configuration:
- Secrets: 3 (HiveMQ cert, Grafana key, device cert)
- API Calls: 200 over 7 days

Cost Calculation:
- Secret Storage: 3 × $0.40/month ÷ 4.33 weeks = $0.28
- API Calls: 200 × $0.05/10,000 = $0.001

7-Day Total: $0.28
```

#### **Amazon S3**
```
Configuration:
- Storage: 0.2 GB (certificates, configs, small backups)
- Requests: 100 PUT, 500 GET

Cost Calculation:
- Storage: FREE (5 GB free tier)
- Requests: FREE (2K PUT, 20K GET free tier)

7-Day Total: $0.00 (within free tier)
```

#### **Amazon CloudWatch (Basic)**
```
Configuration:
- Custom Metrics: 10 metrics  
- Log Ingestion: 0.1 GB
- Alarms: 3 basic alarms

Cost Calculation:
- Custom Metrics: FREE (10 metrics free tier)
- Log Ingestion: FREE (5 GB free tier)
- Alarms: FREE (10 alarms free tier)

7-Day Total: $0.00 (within free tier)
```

**AWS Services 7-Day Total: $139.38**

### **External Services (7 days)**

#### **HiveMQ Cloud Starter**
```
Configuration:
- Plan: Starter ($49/month, billed monthly)
- Sessions: 1 device connection
- Data Transfer: <1 GB total
- Duration: 7 days = 23% of month

Monthly Commitment Required: $49.00
Effective Demo Cost: $49.00 (minimum billing cycle)
```

#### **Fly.io MQTT Simulator**
```
Configuration:
- App: shared-cpu-1x (256MB RAM)
- Runtime: 7 days × 24 hours = 168 hours
- Monthly Pricing: $1.94

Cost Calculation:
7 days × ($1.94/month ÷ 30 days) = $0.45

7-Day Total: $0.45
```

#### **Grafana Cloud**
```
Configuration:
- Free Tier: 10,000 active series, 50GB logs
- Demo Usage: ~500 series, <1GB logs
- Users: 1

7-Day Total: $0.00 (free tier sufficient)
```

**External Services 7-Day Total: $49.45**

## 💸 Complete Demo Cost Summary

| **Service** | **7-Day Cost** | **Notes** |
|-------------|----------------|-----------|
| AWS IoT Core | $139.10 | Primary cost driver (messages) |
| TimeStream | $0.00 | Free tier covers demo |
| Lambda | $0.00 | Free tier covers demo |
| Secrets Manager | $0.28 | Pro-rated monthly cost |
| S3 | $0.00 | Free tier covers demo |
| CloudWatch | $0.00 | Free tier covers demo |
| HiveMQ Cloud | $49.00 | Minimum monthly billing |
| Fly.io | $0.45 | Pro-rated usage |
| Grafana Cloud | $0.00 | Free tier sufficient |
| **TOTAL** | **$188.83** | **1-week live demo** |

## 🔧 Cost Optimization Options

### **Option 1: Budget Minimal ($15-25)**
```
Replace HiveMQ Cloud with local Docker:
- Run HiveMQ CE locally during demo
- Use ngrok/CloudFlare tunnel for access
- AWS costs remain the same: $139.38
- No external service costs
- Total: ~$139.38

Risk: Local setup complexity, potential connectivity issues
```

### **Option 2: Development Scale ($50-75)**
```
Reduce message frequency:
- 200 sensors at 1 message/minute instead of 1/second
- Messages: 200 × 60 min/day × 7 days = 84,000 total
- IoT Core cost drops to ~$0.10
- Keep HiveMQ Cloud for reliability: $49
- Total: ~$50
```

### **Option 3: Pre-recorded Data ($25-35)**
```
Use batch data upload instead of real-time:
- Upload historical data to TimeStream
- Build dashboards on static data
- No continuous MQTT messaging
- Only pay for TimeStream storage/queries
- Total: ~$25-35
```

## 📈 Recommended Demo Configuration

### **Sweet Spot: $75 Budget**
```
Components:
- AWS IoT Core: Reduced to 1 msg/minute per sensor
- TimeStream: Free tier (sufficient for demo)
- HiveMQ Cloud: Starter plan (professional appearance)
- Fly.io: Minimal simulator
- Grafana: Free tier

Cost Breakdown:
- AWS Services: ~$25 (reduced messaging)
- HiveMQ Cloud: $49 (minimum billing)
- Fly.io: $0.45
- Total: ~$75

Benefits:
- Professional managed services
- Live real-time data flow
- Production-like architecture
- Interview-ready appearance
```

## 🎯 Demo Value vs Cost Analysis

### **Cost per Interview Impact**
- **$75 investment** for potential **$100K+ contract**
- **ROI**: 1,300x if successful
- **Risk Mitigation**: Demonstrates actual capability vs promises
- **Differentiation**: Live demo vs PowerPoint presentations

### **What $75 Buys You**
✅ **Live MQTT data stream** from realistic vessel simulator  
✅ **Real-time Grafana dashboards** with maritime telemetry  
✅ **Professional HiveMQ Cloud** broker (not localhost)  
✅ **AWS production services** (IoT Core, TimeStream, etc.)  
✅ **Interview confidence** with working demonstration  
✅ **Technical credibility** with BC Ferries evaluators  

## 🚀 Setup Timeline

### **Day 1-2: Infrastructure**
- [ ] AWS account setup and service provisioning
- [ ] HiveMQ Cloud instance configuration  
- [ ] Certificate generation and security setup

### **Day 3-4: Simulation**
- [ ] Fly.io MQTT simulator deployment
- [ ] 200-sensor data model implementation
- [ ] Island Class vessel operational patterns

### **Day 5-6: Dashboards**
- [ ] Grafana workspace setup and data source config
- [ ] Maritime dashboard templates creation
- [ ] Alert rules and monitoring setup

### **Day 7: Demo Prep**
- [ ] End-to-end testing and validation
- [ ] Demo script preparation
- [ ] Backup plans and troubleshooting

## 💡 Demo Script Outline

### **5-Minute Live Demo**
1. **Fleet Overview** (30 sec): Show vessel on fleet map
2. **Engine Systems** (60 sec): Real-time RPM, temperature, fuel flow
3. **Power Systems** (60 sec): Battery SOC, hybrid mode switching
4. **Navigation** (45 sec): GPS track, AIS status, environmental sensors
5. **Safety Monitoring** (45 sec): Fire detection, bilge levels, alerts
6. **Historical Analysis** (60 sec): Trend analysis, predictive insights

### **Key Talking Points**
- "This is live telemetry from our Island Class simulator"
- "HiveMQ broker handling 200 sensors with mTLS security"  
- "AWS TimeStream storing 10,000 data points per hour"
- "Grafana dashboards updating every 5 seconds"
- "Ready to scale to full 10,000 sensor deployment"

## ✅ Recommendation: Invest $75

For the BC Ferries interview opportunity, **$75 is a minimal investment** that provides:
- **Maximum Impact**: Live demonstration capability
- **Professional Credibility**: Production-grade architecture  
- **Risk Mitigation**: Proves technical capability beyond promises
- **Competitive Advantage**: Most candidates won't have live demos
- **ROI Potential**: 1,300x return if contract is secured

**Bottom Line**: The cost of a nice dinner out could secure a $100K+ maritime telemetry contract.