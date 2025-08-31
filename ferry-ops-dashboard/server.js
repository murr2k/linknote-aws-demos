const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const WebSocket = require('ws');
const axios = require('axios');
const cron = require('node-cron');
const compression = require('compression');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8081;

// Ferry control system connection
const FERRY_CONTROL_API = process.env.FERRY_CONTROL_API || 'https://ferry.linknote.com';
const FERRY_CONTROL_WS = process.env.FERRY_CONTROL_WS || 'wss://ferry.linknote.com';

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"],
      scriptSrcAttr: ["'unsafe-inline'"], // Allow onclick attributes
      connectSrc: ["'self'", "ws:", "wss:", FERRY_CONTROL_API.replace('http', 'ws')],
      imgSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"]
    }
  }
}));
app.use(cors());
app.use(compression());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.static('public'));

// Operations center state
let opsState = {
  fleet: new Map(),
  alerts: [],
  systemStatus: {
    monitoring: true,
    lastUpdate: new Date().toISOString(),
    connectedVessels: 0,
    totalAlerts: 0,
    criticalAlerts: 0
  },
  weatherData: {
    windSpeed: 15,
    windDirection: 'NW',
    visibility: 10,
    waveHeight: 1.2,
    temperature: 18,
    conditions: 'Partly Cloudy'
  },
  routeStatus: new Map([
    ['SWB-TSA', { status: 'active', vessels: 1, delays: 0 }],
    ['TSA-SWB', { status: 'active', vessels: 1, delays: 0 }],
    ['HOR-NAV', { status: 'active', vessels: 1, delays: 0 }],
    ['NAV-HOR', { status: 'scheduled', vessels: 0, delays: 0 }]
  ]),
  historicalData: {
    fuelEfficiency: [],
    punctuality: [],
    passengerCounts: [],
    maintenanceSchedule: []
  }
};

// WebSocket server for dashboard clients
const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });
const dashboardClients = new Set();

// WebSocket connection to ferry control system
let ferryControlWs = null;

function connectToFerryControl() {
  try {
    ferryControlWs = new WebSocket(FERRY_CONTROL_WS);
    
    ferryControlWs.on('open', () => {
      console.log('🔗 Connected to ferry control system');
      opsState.systemStatus.monitoring = true;
      broadcastToClients({
        type: 'system_status',
        data: opsState.systemStatus
      });
    });

    ferryControlWs.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        handleFerryControlMessage(message);
      } catch (error) {
        console.error('Error parsing ferry control message:', error);
      }
    });

    ferryControlWs.on('close', () => {
      console.log('📡 Ferry control connection closed, reconnecting...');
      opsState.systemStatus.monitoring = false;
      setTimeout(connectToFerryControl, 5000);
    });

    ferryControlWs.on('error', (error) => {
      console.error('Ferry control WebSocket error:', error);
      opsState.systemStatus.monitoring = false;
      setTimeout(connectToFerryControl, 10000);
    });
  } catch (error) {
    console.error('Failed to connect to ferry control:', error);
    setTimeout(connectToFerryControl, 10000);
  }
}

function handleFerryControlMessage(message) {
  const now = new Date().toISOString();
  
  switch (message.type) {
    case 'vessel_state':
    case 'telemetry_update':
      updateVesselData(message.data);
      break;
      
    case 'emergency_alert':
      handleEmergencyAlert(message.data);
      break;
      
    case 'pong':
      // Handle heartbeat response - no action needed
      break;
      
    default:
      console.log('Unknown ferry control message type:', message.type);
  }
  
  opsState.systemStatus.lastUpdate = now;
}

function updateVesselData(vesselData) {
  const vesselId = vesselData.vesselId;
  opsState.fleet.set(vesselId, {
    ...vesselData,
    lastSeen: new Date().toISOString(),
    status: determineVesselStatus(vesselData),
    operationalState: getOperationalState(vesselData)
  });

  opsState.systemStatus.connectedVessels = opsState.fleet.size;
  
  // Check for automatic alerts
  checkForAlerts(vesselData);
  
  // Broadcast to all dashboard clients
  broadcastToClients({
    type: 'vessel_update',
    data: {
      vesselId,
      vessel: opsState.fleet.get(vesselId)
    }
  });
}

function determineVesselStatus(vesselData) {
  if (vesselData.safety?.fireAlarm) return 'emergency';
  if (vesselData.engine?.temperature > 100) return 'warning';
  if (vesselData.power?.batterySOC < 20) return 'caution';
  if (vesselData.safety?.bilgeLevel > 50) return 'caution';
  return 'normal';
}

function getOperationalState(vesselData) {
  if (vesselData.engine?.rpm > 0) return 'underway';
  if (vesselData.location) return 'docked';
  return 'offline';
}

function checkForAlerts(vesselData) {
  const alerts = [];
  const vesselId = vesselData.vesselId;
  
  // Engine alerts
  if (vesselData.engine?.temperature > 95) {
    alerts.push({
      id: `${vesselId}-engine-temp-${Date.now()}`,
      vesselId,
      type: 'engine',
      severity: vesselData.engine.temperature > 105 ? 'critical' : 'warning',
      message: `Engine temperature high: ${vesselData.engine.temperature}°C`,
      timestamp: new Date().toISOString()
    });
  }
  
  if (vesselData.engine?.rpm > 1800) {
    alerts.push({
      id: `${vesselId}-engine-rpm-${Date.now()}`,
      vesselId,
      type: 'engine',
      severity: 'warning',
      message: `Engine RPM high: ${vesselData.engine.rpm}`,
      timestamp: new Date().toISOString()
    });
  }
  
  // Power system alerts
  if (vesselData.power?.batterySOC < 25) {
    alerts.push({
      id: `${vesselId}-battery-low-${Date.now()}`,
      vesselId,
      type: 'power',
      severity: vesselData.power.batterySOC < 15 ? 'critical' : 'warning',
      message: `Battery SOC low: ${vesselData.power.batterySOC}%`,
      timestamp: new Date().toISOString()
    });
  }
  
  // Safety alerts
  if (vesselData.safety?.bilgeLevel > 40) {
    alerts.push({
      id: `${vesselId}-bilge-high-${Date.now()}`,
      vesselId,
      type: 'safety',
      severity: vesselData.safety.bilgeLevel > 60 ? 'critical' : 'warning',
      message: `Bilge level high: ${vesselData.safety.bilgeLevel}cm`,
      timestamp: new Date().toISOString()
    });
  }
  
  // Add new alerts
  alerts.forEach(alert => {
    opsState.alerts.unshift(alert);
    broadcastToClients({
      type: 'new_alert',
      data: alert
    });
  });
  
  // Trim alerts to last 100
  if (opsState.alerts.length > 100) {
    opsState.alerts = opsState.alerts.slice(0, 100);
  }
  
  updateAlertCounts();
}

function handleEmergencyAlert(alertData) {
  const alert = {
    id: `emergency-${Date.now()}`,
    vesselId: alertData.vesselId,
    type: 'emergency',
    severity: 'critical',
    message: alertData.message || 'Emergency situation detected',
    timestamp: alertData.timestamp || new Date().toISOString(),
    location: alertData.location,
    emergencyType: alertData.type
  };
  
  opsState.alerts.unshift(alert);
  updateAlertCounts();
  
  broadcastToClients({
    type: 'emergency_alert',
    data: alert
  });
}

function updateAlertCounts() {
  opsState.systemStatus.totalAlerts = opsState.alerts.length;
  opsState.systemStatus.criticalAlerts = opsState.alerts.filter(a => a.severity === 'critical').length;
}

// Dashboard WebSocket handling
wss.on('connection', (ws) => {
  dashboardClients.add(ws);
  console.log(`📊 Dashboard client connected. Total: ${dashboardClients.size}`);
  
  // Send initial data to new client
  ws.send(JSON.stringify({
    type: 'initial_data',
    data: {
      fleet: Array.from(opsState.fleet.entries()).map(([id, data]) => ({ id, ...data })),
      alerts: opsState.alerts.slice(0, 20),
      systemStatus: opsState.systemStatus,
      weatherData: opsState.weatherData,
      routeStatus: Array.from(opsState.routeStatus.entries()).map(([route, status]) => ({ route, ...status }))
    }
  }));

  ws.on('close', () => {
    dashboardClients.delete(ws);
    console.log(`📊 Dashboard client disconnected. Total: ${dashboardClients.size}`);
  });

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      handleDashboardMessage(ws, message);
    } catch (error) {
      console.error('Error parsing dashboard message:', error);
    }
  });
});

function handleDashboardMessage(ws, message) {
  switch (message.type) {
    case 'acknowledge_alert':
      acknowledgeAlert(message.alertId);
      break;
    case 'acknowledge_emergency':
      acknowledgeEmergency(message);
      break;
    case 'request_historical':
      sendHistoricalData(ws, message.vessel, message.metric, message.timeRange);
      break;
    case 'ping':
      // Respond to heartbeat ping from dashboard client
      ws.send(JSON.stringify({ type: 'pong' }));
      break;
    default:
      console.log('Unknown dashboard message type:', message.type);
  }
}

function acknowledgeAlert(alertId) {
  const alertIndex = opsState.alerts.findIndex(a => a.id === alertId);
  if (alertIndex !== -1) {
    opsState.alerts[alertIndex].acknowledged = true;
    opsState.alerts[alertIndex].acknowledgedAt = new Date().toISOString();
    
    broadcastToClients({
      type: 'alert_acknowledged',
      data: { alertId, acknowledgedAt: opsState.alerts[alertIndex].acknowledgedAt }
    });
  }
}

function sendHistoricalData(ws, vessel, metric, timeRange) {
  // Generate mock historical data for demo
  const data = generateHistoricalData(metric, timeRange);
  ws.send(JSON.stringify({
    type: 'historical_data',
    data: {
      vessel,
      metric,
      timeRange,
      data
    }
  }));
}

function generateHistoricalData(metric, timeRange) {
  const points = timeRange === '24h' ? 24 : timeRange === '7d' ? 7 : 30;
  const data = [];
  
  for (let i = points; i >= 0; i--) {
    const timestamp = new Date();
    timestamp.setHours(timestamp.getHours() - i);
    
    let value;
    switch (metric) {
      case 'fuel_efficiency':
        value = 12 + Math.random() * 4; // L/nm
        break;
      case 'engine_temperature':
        value = 80 + Math.random() * 15; // °C
        break;
      case 'battery_soc':
        value = 70 + Math.random() * 25; // %
        break;
      case 'passenger_count':
        value = Math.floor(50 + Math.random() * 150); // passengers
        break;
      default:
        value = Math.random() * 100;
    }
    
    data.push({
      timestamp: timestamp.toISOString(),
      value: Math.round(value * 100) / 100
    });
  }
  
  return data;
}

function broadcastToClients(message) {
  const messageStr = JSON.stringify(message);
  dashboardClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(messageStr);
    }
  });
}

// REST API Routes

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    connectedVessels: opsState.fleet.size,
    dashboardClients: dashboardClients.size,
    ferryControlConnected: ferryControlWs?.readyState === WebSocket.OPEN
  });
});

// Fleet overview
app.get('/api/fleet', (req, res) => {
  res.json({
    vessels: Array.from(opsState.fleet.entries()).map(([id, data]) => ({
      id,
      ...data
    })),
    count: opsState.fleet.size,
    timestamp: new Date().toISOString()
  });
});

// Alerts
app.get('/api/alerts', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const severity = req.query.severity;
  
  let alerts = opsState.alerts.slice(0, limit);
  if (severity) {
    alerts = alerts.filter(a => a.severity === severity);
  }
  
  res.json({
    alerts,
    totalCount: opsState.alerts.length,
    criticalCount: opsState.systemStatus.criticalAlerts,
    timestamp: new Date().toISOString()
  });
});

// System status
app.get('/api/status', (req, res) => {
  res.json({
    system: opsState.systemStatus,
    weather: opsState.weatherData,
    routes: Array.from(opsState.routeStatus.entries()).map(([route, status]) => ({
      route,
      ...status
    })),
    timestamp: new Date().toISOString()
  });
});

// Historical data endpoint
app.get('/api/historical/:vessel/:metric', (req, res) => {
  const { vessel, metric } = req.params;
  const timeRange = req.query.range || '24h';
  
  const data = generateHistoricalData(metric, timeRange);
  
  res.json({
    vessel,
    metric,
    timeRange,
    data,
    timestamp: new Date().toISOString()
  });
});

// Control commands (proxy to ferry control system)
app.post('/api/control/:vesselId/:system/:action', async (req, res) => {
  const { vesselId, system, action } = req.params;
  const { value } = req.body;
  
  try {
    // Forward command to ferry control system
    const response = await axios.post(`${FERRY_CONTROL_API}/api/override/${system}/${action}`, {
      value
    });
    
    res.json({
      success: true,
      message: `Command sent to ${vesselId}`,
      response: response.data
    });
  } catch (error) {
    console.error('Error forwarding control command:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to send command to vessel',
      error: error.message
    });
  }
});

// Serve dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Periodic tasks
cron.schedule('*/30 * * * *', () => {
  // Update weather data every 30 minutes
  updateWeatherData();
});

cron.schedule('0 * * * *', () => {
  // Clean old alerts every hour
  const oneHourAgo = new Date();
  oneHourAgo.setHours(oneHourAgo.getHours() - 24);
  
  opsState.alerts = opsState.alerts.filter(alert => 
    new Date(alert.timestamp) > oneHourAgo || alert.severity === 'critical'
  );
  
  updateAlertCounts();
});

function updateWeatherData() {
  // Simulate weather data updates
  opsState.weatherData = {
    windSpeed: Math.round((10 + Math.random() * 20) * 10) / 10,
    windDirection: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.floor(Math.random() * 8)],
    visibility: Math.round((5 + Math.random() * 10) * 10) / 10,
    waveHeight: Math.round((0.5 + Math.random() * 2) * 10) / 10,
    temperature: Math.round((15 + Math.random() * 8) * 10) / 10,
    conditions: ['Clear', 'Partly Cloudy', 'Cloudy', 'Light Rain', 'Foggy'][Math.floor(Math.random() * 5)]
  };
  
  broadcastToClients({
    type: 'weather_update',
    data: opsState.weatherData
  });
}

// Initialize ferry control connection
connectToFerryControl();

// Start server
server.listen(PORT, () => {
  console.log(`⚓ BC Ferries Operations Dashboard running on port ${PORT}`);
  console.log(`📊 Dashboard available at http://localhost:${PORT}`);
  console.log(`🔗 Connecting to ferry control system at ${FERRY_CONTROL_API}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down operations dashboard...');
  if (ferryControlWs) {
    ferryControlWs.close();
  }
  server.close(() => {
    console.log('Operations dashboard closed');
    process.exit(0);
  });
});
function acknowledgeEmergency(message) {
  console.log(`🚨 Emergency acknowledged at ${message.timestamp}`);
  
  // Send acknowledgment to ferry control server to reset fire alarm
  if (ferryControlWs && ferryControlWs.readyState === WebSocket.OPEN) {
    ferryControlWs.send(JSON.stringify({
      type: 'acknowledge_fire_alarm',
      timestamp: message.timestamp
    }));
    console.log('🔥 Fire alarm acknowledgment sent to ferry control');
  }
  
  // Broadcast emergency acknowledgment to all ops dashboard clients
  broadcastToClients({
    type: 'emergency_acknowledged',
    data: { timestamp: message.timestamp }
  });
}
