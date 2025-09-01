# BC Ferries Maritime Telemetry - Interactive Demo & Enterprise Architecture

**Enterprise AWS telemetry system with interactive demonstration capabilities for BC Ferries Island Class vessel project**

[![AWS](https://img.shields.io/badge/AWS-IoT_Core_+_TimeStream-orange)](https://aws.amazon.com/iot-core/)
[![HiveMQ](https://img.shields.io/badge/HiveMQ-MQTT_Broker-blue)](https://www.hivemq.com/)
[![Interactive](https://img.shields.io/badge/Demo-Interactive_Controls-green)](#interactive-demo-features)
[![Live Demo](https://img.shields.io/badge/Status-Interview_Ready-success)](docs/complete-implementation-plan.md)
[![Cost](https://img.shields.io/badge/Budget-$75_for_1_week-brightgreen)](docs/live-demo-cost-breakdown.md)

## 🎯 Project Overview

This repository contains the complete technical architecture and implementation plan for BC Ferries' Island Class vessel telemetry system, featuring **interactive demonstration capabilities** designed specifically for the November 2025 deployment timeline.

**Key Innovation**: Dual-screen interactive demo where you can control vessel systems in real-time and immediately see the response on AWS monitoring dashboards.

## 📋 Repository Purpose & Coverage

### **This Repository (`linknote-aws-demos`) - Enterprise Architecture**

**Primary Focus**: Enterprise AWS integration with business case and interactive stakeholder demonstrations

**Coverage:**
- 🏢 **AWS Enterprise Integration** - CloudFormation templates, IoT Core, TimeStream, Managed Grafana
- 💰 **Business Case & ROI** - Detailed cost analysis (`~$70/vessel/month`), production scaling projections
- 🎭 **Interactive Demo System** - Dual-screen presentation setup for live stakeholder demonstrations
- 📊 **Fleet Scalability** - Production architecture documentation for 50+ vessel deployment
- 🏛️ **Public Sector Compliance** - Enterprise mTLS security, governance frameworks, audit trails
- 📈 **Cost Optimization** - AWS resource optimization and budget management for public sector

**Use Cases:**
- Enterprise sales and business case presentations
- AWS production infrastructure deployment
- Stakeholder demonstrations with interactive controls
- Fleet-wide scaling architecture and planning
- Public sector compliance and security requirements

### **Related Repository: `murr2k/aws-test` - Working Implementation**

**Primary Focus**: Live MQTT/WebSocket maritime monitoring system with deployed services

**Coverage:**
- ✅ **Working Services** - Ferry control, ops dashboard, MQTT broker deployed on Fly.io
- ✅ **MQTT WebSocket with TLS** - Browser-compatible secure connections
- ✅ **Development Infrastructure** - Claude Flow AI workflows, rapid prototyping
- ✅ **Live Deployments** - Operational services for testing and development

**Repository Relationship:**
- **`linknote-aws-demos`** → Enterprise architecture and business case (this repository)
- **`aws-test`** → Working implementation platform

Both repositories serve **complementary purposes** in the comprehensive BC Ferries maritime telemetry ecosystem.

## 🚢 BC Ferries Context

- **Vessels**: Island Class hybrid-electric ferries (80.8m, 47 vehicles, 392 passengers)
- **Timeline**: First vessel telemetry begins November 2025
- **Integration**: Damen Triton gateway compatibility
- **Scale**: 10,000+ sensors per vessel, expandable to 50+ vessel fleet
- **Security**: Zero trust architecture with mTLS and continuous monitoring

## 🏗️ Interactive Demo Architecture

### **Dual Dashboard Setup**
```
┌─────────────────────┐    ┌─────────────────────┐
│   Left Screen       │    │   Right Screen      │
│ Vessel Controls     │    │ AWS Monitoring      │  
│ (Fly.io Grafana)    │    │ (Grafana Cloud)     │
│                     │    │                     │
│ • Engine RPM Slider │ -> │ • Real-time RPM     │
│ • Fire Alarm Button │ -> │ • Emergency Alerts  │
│ • Battery Override  │ -> │ • Power System      │
└─────────────────────┘    └─────────────────────┘
```

### **Live Demo Flow**
1. **Presenter clicks control** (e.g., "Increase Engine RPM")
2. **API call triggers** simulator override
3. **MQTT message publishes** to HiveMQ broker
4. **AWS IoT Core receives** and processes message  
5. **TimeStream stores** time-series data
6. **Grafana updates** monitoring dashboard (2-3 seconds)
7. **Visual feedback** proves real-time capability

## 📊 Technical Features

### **Maritime Telemetry (200 Sensors)**
- **Engine Systems**: RPM, temperature, pressure, fuel flow, vibration
- **Power Systems**: Battery SOC, generator, hybrid mode switching
- **Navigation**: GPS, compass, AIS, depth sounder, radar
- **Environmental**: Weather, water temperature, marine life detection
- **Safety Systems**: Fire detection, bilge monitoring, CO levels
- **HVAC/Comfort**: Cabin temperature, ventilation systems

### **Interactive Controls**
- **Engine Controls**: RPM override slider, emergency stop button
- **Safety Simulation**: Fire alarm trigger, bilge level adjustment
- **Power Management**: Battery SOC override, mode switching
- **Emergency Scenarios**: Pre-configured cascade sequences

### **Enterprise Architecture**
- **Zero Trust Security**: mTLS certificates, continuous authorization
- **Scalable Design**: Template-driven dashboards for 10,000+ topics
- **Multi-Tier Storage**: Hot path (real-time) + cold path (analytics)
- **Compliance Ready**: Audit trails, data governance, regulatory reporting

## 💰 Cost Analysis

### **1-Week Live Demo: $75 Total**

| Service | Cost | Purpose |
|---------|------|---------|
| AWS IoT Core | $25 | MQTT broker (optimized message rate) |
| TimeStream | $0 | Time-series storage (free tier) |
| Lambda | $0 | Data processing (free tier) |
| Other AWS | $0.32 | Secrets, CloudWatch, S3 (free tier) |
| HiveMQ Cloud | $49 | Professional MQTT broker |
| Fly.io | $0.52 | Simulator + control dashboard |
| **TOTAL** | **$74.84** | **8-day implementation** |

### **Production Scale (6 Vessels): $422/month**
- Scales linearly: ~$70/vessel/month
- ROI through fuel optimization and predictive maintenance
- Enterprise security and compliance included

## 🛠️ Implementation Timeline

### **8-Day Development Plan**
- **Days 1-2**: AWS infrastructure + external services setup
- **Days 3-4**: MQTT simulator with override capabilities
- **Days 5-6**: AWS integration and monitoring dashboards  
- **Day 7**: Interactive control dashboard development
- **Day 8**: End-to-end testing and demo preparation

### **Ready for November 2025 Deployment**
- Production-ready architecture
- Damen Triton gateway integration
- Enterprise security and compliance
- Scalable to full 50+ vessel fleet

## 📋 Documentation

### **Complete Implementation Guides**
- [**Complete Implementation Plan**](docs/complete-implementation-plan.md) - Full 8-day development timeline
- [**Interactive Demo Architecture**](docs/interactive-demo-architecture.md) - Dual dashboard technical design
- [**Live Demo Cost Breakdown**](docs/live-demo-cost-breakdown.md) - Detailed cost analysis and optimization
- [**Enhanced Enterprise Architecture**](docs/enhanced-bc-ferries-architecture.md) - Zero trust and scalability patterns

### **Original Planning Documents**
- [**BC Ferries Resources & Cost Analysis**](config/bc-ferries-resources-cost-analysis.md) - Resource requirements
- [**AWS Cost Calculator Estimate**](config/aws-cost-calculator-estimate.md) - Official AWS pricing calculations
- [**CloudFormation Infrastructure**](config/linknote-infrastructure.yaml) - Infrastructure as Code

## 🎭 Demo Script

### **5-Minute Interview Demonstration**
1. **Setup** (30s): Show dual screens, explain live control concept
2. **Baseline** (60s): Normal ferry operations, steady telemetry
3. **Engine Demo** (90s): RPM override with immediate AWS response
4. **Emergency** (90s): Fire alarm trigger with cascading alerts
5. **Power Systems** (60s): Battery management and hybrid switching
6. **Scalability** (30s): Path to 10,000 sensors across 50 vessels

## 🎯 BC Ferries Interview Value

### **Immediate Capabilities**
✅ **HiveMQ Expertise**: Production broker configuration and administration  
✅ **Maritime Domain**: Island Class vessel operational understanding  
✅ **Security Implementation**: Zero trust with mTLS and continuous monitoring  
✅ **Interactive Proof**: Live demonstration of working telemetry system  
✅ **November Ready**: Deployment-ready architecture and timeline  

### **Strategic Value**
✅ **Fleet Scalability**: Template-driven approach for 50+ vessels  
✅ **Cost Optimization**: Public sector budget-conscious design  
✅ **Vendor Integration**: Seamless Damen Triton gateway compatibility  
✅ **Innovation Platform**: Foundation for predictive maintenance and optimization  
✅ **Knowledge Transfer**: Complete documentation and operational procedures  

## 🚀 Getting Started

### **Quick Demo Setup**
```bash
# Clone repository
git clone https://github.com/murr2k/linknote-aws-demos.git
cd linknote-aws-demos

# Review implementation plan
cat docs/complete-implementation-plan.md

# Check cost analysis
cat docs/live-demo-cost-breakdown.md

# Review interactive demo design
cat docs/interactive-demo-architecture.md
```

### **Production Deployment**
```bash
# Deploy AWS infrastructure
cd config
./deploy-stack.sh bc-ferries-production

# Configure HiveMQ broker
# Follow docs/complete-implementation-plan.md Phase 1

# Deploy Fly.io simulator
# Follow docs/complete-implementation-plan.md Phase 2
```

## 📞 Contact

**Murray Kopit**  
📧 murr2k@gmail.com  
🔗 [GitHub Profile](https://github.com/murr2k)  
🌐 [AWS Portfolio](https://linknote.com)  

**Interview Demonstration**: Ready for BC Ferries technical evaluation

---

## 🌟 Why This Approach Works

### **Beyond Basic Requirements**
While BC Ferries needs HiveMQ configuration and signal validation, this solution provides:
- **Enterprise architecture** ready for fleet-wide deployment
- **Interactive demonstration** proving technical capability
- **Cost-effective approach** suitable for public sector budgets
- **Scalable foundation** for long-term digital transformation

### **Interview Differentiation** 
Most candidates will present PowerPoint slides or static demos. This provides:
- **Live working system** with real-time interaction
- **Technical depth** beyond theoretical knowledge  
- **Maritime expertise** specific to Island Class vessels
- **Production readiness** for immediate November deployment

**Result**: Demonstrates not just knowledge, but proven capability to deliver enterprise maritime telemetry solutions.

---

*This project showcases the exact technical expertise BC Ferries needs for their Island Class vessel project, enhanced with interactive demonstration capabilities that prove real-world system building experience.*