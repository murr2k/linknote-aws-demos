# BC Ferries Operations Monitoring Dashboard

Professional maritime operations center dashboard for real-time vessel monitoring and fleet management.

## Features

### Real-time Monitoring
- **Fleet Status Overview**: Live vessel tracking with operational status
- **Engine Performance**: Real-time RPM, temperature, and fuel flow gauges
- **Power Systems**: Battery SOC, generator load, and power mode monitoring
- **Safety Systems**: Fire alarm, bilge level, and CO2 monitoring
- **Navigation Display**: Speed, heading, GPS position with compass visualization

### Professional Interface
- **Operations Center Design**: Maritime control room aesthetic
- **Large Display Optimized**: Designed for control room monitors and tablets
- **Alert System**: Real-time emergency notifications with severity levels
- **Historical Analytics**: Trend analysis with interactive charts
- **Weather Integration**: Environmental conditions display

### Technical Capabilities
- **WebSocket Communication**: Real-time data streaming from vessel control systems
- **Responsive Design**: Works on large displays, tablets, and mobile devices
- **Professional Gauges**: Canvas-based maritime-style instrumentation
- **Emergency Protocols**: Critical alert handling with acknowledgment system

## Architecture

```
┌─────────────────────┐    WebSocket     ┌─────────────────────┐
│                     │ ◄─────────────── │                     │
│  Operations         │                  │  Ferry Control      │
│  Dashboard          │ ◄─────────────── │  System             │
│  (ops.linknote.com) │    REST API      │  (ferry.linknote.com)│
└─────────────────────┘                  └─────────────────────┘
```

## Quick Start

### Development
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Access dashboard
open http://localhost:8081
```

### Production Deployment
```bash
# Deploy to Fly.io
fly deploy

# Check deployment status
fly status

# View logs
fly logs
```

## Configuration

### Environment Variables
```env
NODE_ENV=production
FERRY_CONTROL_API=https://ferry.linknote.com
FERRY_CONTROL_WS=wss://ferry.linknote.com
PORT=8081
```

### Ferry Control Integration
The dashboard connects to the ferry control system via:
- **REST API**: Initial data and control commands
- **WebSocket**: Real-time telemetry updates
- **MQTT**: Emergency alert notifications

## Dashboard Panels

### Fleet Overview
- Real-time vessel status summary
- Operational/maintenance/emergency counts
- Individual vessel selection and details

### Engine Performance
- RPM gauge with redline indication
- Temperature monitoring with warning zones
- Fuel flow rate with efficiency tracking

### Power Systems
- Battery state of charge with color coding
- Generator load percentage
- Power mode display (electric/hybrid/diesel)

### Safety Systems
- Fire alarm status with visual/audio alerts
- Bilge water level monitoring
- CO2 concentration tracking

### Navigation
- Current vessel speed and heading
- GPS position display
- Route information and next waypoint
- Compass visualization

### Historical Data
- Configurable time ranges (24h, 7d, 30d)
- Multiple metrics (fuel efficiency, temperature, battery SOC)
- Trend analysis with threshold indicators

### Weather & Environment
- Wind speed and direction
- Wave height conditions
- Visibility range
- Air temperature

### Alert Management
- Real-time alert notifications
- Severity-based filtering (critical, warning, info)
- Alert acknowledgment system
- Emergency alert modal dialogs

## API Endpoints

### Health Check
```
GET /health
```

### Fleet Data
```
GET /api/fleet
```

### Alert Management
```
GET /api/alerts?limit=50&severity=critical
```

### System Status
```
GET /api/status
```

### Historical Data
```
GET /api/historical/:vessel/:metric?range=24h
```

### Vessel Control
```
POST /api/control/:vesselId/:system/:action
```

## WebSocket Events

### Client → Server
- `acknowledge_alert`: Acknowledge an alert
- `request_historical`: Request historical data

### Server → Client
- `initial_data`: Initial dashboard state
- `vessel_update`: Real-time vessel telemetry
- `new_alert`: New alert notification
- `emergency_alert`: Critical emergency notification
- `weather_update`: Weather data update

## Browser Support

- **Chrome/Edge**: Full support
- **Firefox**: Full support  
- **Safari**: Full support
- **Mobile**: Responsive design optimized for tablets

## Performance

- **Initial Load**: < 2 seconds
- **Real-time Updates**: < 100ms latency
- **Memory Usage**: < 50MB client-side
- **CPU Usage**: Optimized gauge rendering

## Security

- **HTTPS**: Force HTTPS in production
- **CORS**: Configured for secure cross-origin requests
- **CSP**: Content Security Policy headers
- **Input Validation**: All API inputs validated

## Monitoring

### Health Checks
- Application health endpoint
- WebSocket connection monitoring
- Ferry control system connectivity

### Logging
- Structured JSON logging
- Error tracking and alerts
- Performance metrics

### Metrics
- Real-time connection counts
- Alert notification rates
- System performance indicators

## Development

### Project Structure
```
ferry-ops-dashboard/
├── server.js              # Express server
├── package.json           # Dependencies
├── fly.toml              # Fly.io configuration
├── Dockerfile            # Container configuration
└── public/               # Static assets
    ├── index.html        # Main dashboard
    ├── css/
    │   └── dashboard.css # Maritime UI styling
    └── js/
        ├── dashboard.js  # Main controller
        ├── websocket.js  # Real-time communication
        ├── gauges.js     # Canvas-based gauges
        └── charts.js     # Historical data charts
```

### Code Style
- ES2020+ JavaScript features
- Async/await for asynchronous operations
- Modular class-based architecture
- Professional maritime color palette

### Testing
```bash
# Run tests
npm test

# Run linting
npm run lint

# Check types
npm run typecheck
```

## Deployment

### Fly.io Configuration
- **Region**: Seattle (sea) for low latency to BC
- **Resources**: 512MB RAM, 1 CPU
- **Scaling**: Auto-start/stop with minimum 1 instance
- **Health Checks**: 30-second intervals

### Environment Setup
1. Install Fly.io CLI
2. Login: `fly auth login`
3. Deploy: `fly deploy`
4. Set secrets: `fly secrets set KEY=value`

### Domain Configuration
The dashboard will be available at `ops.linknote.com` after DNS configuration.

## Cost Analysis

### Fly.io Pricing (Monthly)
- **Compute**: ~$5-10 (512MB, shared CPU)
- **Network**: ~$2 (moderate bandwidth)
- **Total**: ~$7-12/month

### Features Included
- Professional operations dashboard
- Real-time telemetry monitoring
- Emergency alert system
- Historical data analysis
- Weather integration
- Mobile responsive design

## Support

For technical support or feature requests:
- Review the code documentation
- Check WebSocket connection status
- Verify ferry control system connectivity
- Monitor application logs via `fly logs`

## License

MIT License - Built for BC Ferries demonstration purposes.