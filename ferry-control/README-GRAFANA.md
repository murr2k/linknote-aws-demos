# BC Ferries Grafana Cloud Monitoring Dashboard

## 🚢 Overview

This project sets up a comprehensive Grafana Cloud workspace for BC Ferries maritime telemetry monitoring at **ops.linknote.com**. The monitoring dashboard provides real-time visibility into vessel operations, safety systems, and performance metrics for the Island Class ferry demonstration.

## 🎯 Dashboard Features

### Real-time Monitoring
- **Engine Performance**: RPM, temperature, fuel flow
- **Power Systems**: Battery SOC, power mode, generator load  
- **Safety Systems**: Fire alarm, bilge level, CO₂ monitoring
- **Navigation**: Speed, heading, GPS location, route tracking
- **System Health**: Alert summary, data source status

### Alert Management
- **Critical Alerts**: Engine overheat, fire alarm, low battery
- **Warning Alerts**: High RPM, route deviation, system faults
- **Notification Channels**: Email, SMS, Slack, PagerDuty

### Data Integration
- **AWS IoT Core**: Real-time MQTT telemetry
- **AWS CloudWatch**: Infrastructure metrics and logs
- **AWS TimeStream**: Historical time-series data
- **HiveMQ Cloud**: MQTT message broker

## 🚀 Quick Start

### 1. Prerequisites
- Grafana Cloud account with API token
- AWS account with IoT Core, CloudWatch, TimeStream access
- Domain configured for ops.linknote.com

### 2. Setup
```bash
# Clone and navigate to project
cd ferry-control/

# Copy environment template
cp config/.env.template config/.env

# Edit .env with your credentials
nano config/.env

# Run setup script  
chmod +x scripts/setup-grafana-cloud.sh
./scripts/setup-grafana-cloud.sh
```

### 3. Test Integration
```bash
# Run comprehensive tests
./scripts/test-grafana-integration.sh

# Check test results
cat docs/integration-test-report.md
```

### 4. Access Dashboard
- **Monitoring**: https://bcferriesdemo.grafana.net
- **Control**: ferry.linknote.com  
- **Production**: ops.linknote.com (after DNS setup)

## 📁 Project Structure

```
ferry-control/
├── config/
│   ├── grafana-cloud-setup.json    # Cloud workspace configuration
│   ├── monitoring-dashboard.json   # Main dashboard definition
│   ├── datasources.yaml           # Data source configurations
│   └── .env.template              # Environment variables template
├── scripts/
│   ├── setup-grafana-cloud.sh     # Automated setup script
│   └── test-grafana-integration.sh # Integration testing
├── docs/
│   ├── grafana-setup-guide.md     # Comprehensive setup guide
│   └── api-integration.md         # API integration documentation
└── README-GRAFANA.md             # This file
```

## 🔧 Configuration Files

### Environment Configuration
- **`.env.template`**: Template for environment variables
- **Fill in**: Grafana tokens, AWS credentials, MQTT settings

### Dashboard Configuration
- **`monitoring-dashboard.json`**: Complete dashboard definition
- **Features**: Real-time panels, alerts, navigation
- **Customizable**: Vessel selection, time ranges, thresholds

### Data Sources
- **`datasources.yaml`**: All data source configurations
- **Includes**: AWS CloudWatch, TimeStream, IoT Core, HiveMQ
- **Authentication**: AWS keys, MQTT credentials

## 🚨 Alert Configuration

### Critical Alerts (Immediate Response)
- **Engine Overheat**: > 105°C → SMS + Email + PagerDuty
- **Fire Alarm**: Active → All channels + Emergency protocols
- **Low Battery**: < 15% → Email + Webhook
- **High Bilge**: > 70% → SMS + Email

### Warning Alerts (Monitor)
- **High RPM**: > 1700 → Email
- **Route Deviation**: > 500m → Email + Webhook  
- **System Faults**: Various → Email

## 📊 Data Sources Integration

### AWS IoT Core MQTT
```bash
Topics:
- ferry/vessel/001/telemetry/engine
- ferry/vessel/001/telemetry/power
- ferry/vessel/001/telemetry/safety
- ferry/vessel/001/telemetry/navigation
- ferry/vessel/001/alerts/+
```

### AWS CloudWatch Metrics
```bash
Namespace: Custom/FerryTelemetry
Metrics: EngineRPM, EngineTemp, FuelFlow, BatterySOC
Dimensions: VesselID, System, Location
```

### AWS TimeStream Database
```sql
Database: FerryTelemetryDB
Tables: VesselTelemetry, EngineMetrics, SafetySystems
Query: Historical analysis and trending
```

## 💰 Cost Breakdown (1-week demo)

| Service | Monthly Cost | Weekly Cost | Notes |
|---------|-------------|-------------|-------|
| Grafana Cloud Pro | $50 | $12 | 14-day free trial |
| AWS IoT Core | $5 | $1 | 1M messages |
| AWS CloudWatch | $10 | $2 | Custom metrics |
| AWS TimeStream | $5 | $1 | 1M writes |
| HiveMQ Cloud | $15 | $4 | Starter plan |
| **Total** | **$85** | **$20** | **Estimated** |

### Cost Optimization
- Use free tiers where possible
- Reduce data retention periods
- Optimize update frequencies
- Clean up resources after demo

## 🧪 Testing & Validation

### Automated Tests
```bash
# Run all integration tests
./scripts/test-grafana-integration.sh

# Tests include:
# - Grafana Cloud connectivity
# - Authentication verification  
# - Data source health checks
# - Dashboard functionality
# - Alert rule validation
# - Sample data transmission
```

### Manual Testing
1. **Dashboard Load**: Verify all panels display data
2. **Real-time Updates**: Check 5-second refresh works
3. **Time Range**: Test different time periods
4. **Alerts**: Trigger test conditions
5. **Variables**: Test vessel/system selection

## 🔒 Security & Access

### Authentication
- **Service Account**: Dedicated token for API access
- **Role-based**: Admin access for setup, Viewer for monitoring
- **Token Rotation**: Regular token updates recommended

### Network Security
- **HTTPS/TLS**: All connections encrypted
- **VPC**: AWS resources in private subnets where possible
- **Firewall**: Restrict access to necessary ports only

### Data Privacy
- **No PII**: Only technical telemetry data
- **Retention**: Short-term storage for demo
- **Access Logs**: Track dashboard usage

## 🛠️ Troubleshooting

### Common Issues

1. **Dashboard Not Loading**
   - Check Grafana service status
   - Verify dashboard UID exists
   - Test browser compatibility

2. **No Data in Panels**
   - Verify data source connections
   - Check query syntax and time ranges
   - Confirm metric names and dimensions

3. **Alerts Not Firing**
   - Test alert conditions manually
   - Verify notification channel setup
   - Check alert rule syntax

4. **Authentication Errors**
   - Regenerate service account token
   - Check token permissions
   - Verify API endpoint URLs

### Debug Commands
```bash
# Check Grafana health
curl -s "$GRAFANA_URL/api/health"

# Test authentication
curl -s "$GRAFANA_URL/api/user" \
  -H "Authorization: Bearer $TOKEN"

# List data sources
curl -s "$GRAFANA_URL/api/datasources" \
  -H "Authorization: Bearer $TOKEN"

# Test AWS connectivity
aws sts get-caller-identity
aws cloudwatch list-metrics --namespace Custom/FerryTelemetry
```

## 📈 Performance Optimization

### Dashboard Performance
- **Panel Queries**: Optimize for fast loading
- **Time Ranges**: Use appropriate intervals
- **Data Aggregation**: Pre-aggregate where possible
- **Caching**: Enable query result caching

### Data Source Performance
- **Connection Pooling**: Reuse connections
- **Query Batching**: Combine related queries
- **Indexing**: Proper database indexes
- **Retention**: Automatic data cleanup

## 🔄 Continuous Monitoring

### Health Checks
- **Data Source**: Monitor connection health
- **Query Performance**: Track response times
- **Alert Delivery**: Verify notification success
- **Resource Usage**: Monitor costs and limits

### Maintenance Tasks
- **Token Rotation**: Update API tokens regularly
- **Data Cleanup**: Remove old metrics
- **Performance Review**: Optimize slow queries
- **Security Updates**: Keep dependencies current

## 📚 Documentation Links

- **Setup Guide**: [docs/grafana-setup-guide.md](docs/grafana-setup-guide.md)
- **API Integration**: [docs/api-integration.md](docs/api-integration.md)
- **Configuration**: [config/](config/)
- **Scripts**: [scripts/](scripts/)

## 🤝 Support & Contribution

### Getting Help
1. Check troubleshooting guide above
2. Review test report: `docs/integration-test-report.md`
3. Submit GitHub issues with logs
4. Contact project maintainers

### Contributing
1. Fork the repository
2. Create feature branch
3. Add tests for new functionality  
4. Submit pull request with documentation

## 🎯 Production Deployment

### Pre-deployment Checklist
- [ ] All integration tests pass
- [ ] Environment variables configured
- [ ] DNS pointing configured (ops.linknote.com)
- [ ] Alert notifications tested
- [ ] Backup/recovery plan in place
- [ ] Monitoring dashboard accessible
- [ ] Performance baselines established

### Go-Live Steps
1. **Run Final Tests**: `./scripts/test-grafana-integration.sh`
2. **Configure DNS**: Point ops.linknote.com to Grafana URL
3. **Start Data Flow**: Begin sending real telemetry
4. **Verify Alerts**: Test critical alert paths
5. **Train Users**: Dashboard navigation and response procedures
6. **Monitor Performance**: Watch for issues in first 24 hours

### Post-deployment
- Monitor system health and performance
- Track costs and optimize where needed
- Collect user feedback for improvements
- Plan for scaling beyond demo period

---

## 🚢 Ready to Set Sail!

Your BC Ferries Grafana Cloud monitoring dashboard is ready to provide comprehensive maritime telemetry visibility. The system is designed to scale from demo to production, ensuring reliable monitoring of vessel operations.

**Next Steps:**
1. Complete the setup using the provided scripts
2. Test the integration end-to-end
3. Configure DNS for ops.linknote.com  
4. Start streaming telemetry data
5. Monitor the dashboard performance

For any questions or issues, refer to the comprehensive documentation in the `/docs` directory or submit a GitHub issue.

**Fair winds and following seas!** ⚓