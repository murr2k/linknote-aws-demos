const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const WebSocket = require('ws');
const axios = require('axios');
const cron = require('node-cron');
const compression = require('compression');
const path = require('path');
const MQTTClient = require('./mqtt-client');
const DataCollector = require('./workers/data-collector');
const historicalData = require('./db/historical-data');

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
      connectSrc: ["'self'", "ws:", "wss:", FERRY_CONTROL_API.replace('http', 'ws'), "ws://149.248.193.180:9001", "wss://149.248.193.180:9001"],
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

// Initialize a default vessel with full telemetry structure
function initializeDefaultVessel() {
  const defaultVessel = {
    id: 'island-class-001',
    vesselId: 'island-class-001',
    status: 'normal',
    lastTelemetry: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
    operational: 'docked',  // Add explicit operational field
    operationalState: 'docked',  // This will be recalculated
    systems: {
      engine: 'idle',
      power: 'hybrid',
      safety: 'normal'
    },
    // Full telemetry structure with default values
    engine: {
      rpm: 0,  // Engine off when docked
      temperature: 75,
      fuelFlow: 0,  // No fuel flow when engine off
      status: 'idle',
      health: 'good'
    },
    power: {
      mode: 'hybrid',
      batteryLevel: 85,
      shoreConnection: false,
      health: 'good'
    },
    navigation: {
      route: 'SWB-TSA',
      speed: 0,
      eta: 'At Dock',
      nextPort: 'Tsawwassen'
    },
    location: {
      latitude: 48.6569,
      longitude: -123.3933,
      heading: 37
    },
    safety: {
      status: 'normal',
      bilgeLevel: 15,
      fireSystem: 'armed',
      lifeboats: 'ready'
    },
    component: 'operational',
    timestamp: new Date().toISOString()
  };

  opsState.fleet.set('island-class-001', defaultVessel);
  opsState.systemStatus.connectedVessels = 1;
  console.log('✅ Initialized default vessel with full telemetry');
}

// Initialize default vessel on startup
initializeDefaultVessel();

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

  // Get existing vessel data or create new
  const existingVessel = opsState.fleet.get(vesselId) || {};

  // Deep merge vessel data to preserve all telemetry
  const mergedVessel = {
    ...existingVessel,
    ...vesselData,
    lastSeen: new Date().toISOString(),
    status: determineVesselStatus(vesselData)
  };

  // Calculate operational state using merged data to ensure we have all fields
  mergedVessel.operationalState = getOperationalState(mergedVessel);

  // Preserve nested objects by merging them too
  if (vesselData.engine || existingVessel.engine) {
    mergedVessel.engine = { ...existingVessel.engine, ...vesselData.engine };
  }
  if (vesselData.power || existingVessel.power) {
    mergedVessel.power = { ...existingVessel.power, ...vesselData.power };
  }
  if (vesselData.navigation || existingVessel.navigation) {
    mergedVessel.navigation = { ...existingVessel.navigation, ...vesselData.navigation };
  }
  if (vesselData.location || existingVessel.location) {
    mergedVessel.location = { ...existingVessel.location, ...vesselData.location };
  }
  if (vesselData.safety || existingVessel.safety) {
    mergedVessel.safety = { ...existingVessel.safety, ...vesselData.safety };
  }
  if (vesselData.systems || existingVessel.systems) {
    mergedVessel.systems = { ...existingVessel.systems, ...vesselData.systems };
  }

  opsState.fleet.set(vesselId, mergedVessel);

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
  // First check if operational field is explicitly set
  if (vesselData.operational) {
    return vesselData.operational; // Can be 'underway', 'docked', etc.
  }

  // Fall back to inferring from other data
  if (vesselData.engine?.rpm > 0) {
    return 'underway';
  }

  // If we have location data, vessel is at least connected/docked
  if (vesselData.location) {
    return 'docked';
  }

  // Check if we have any recent telemetry
  if (vesselData.lastTelemetry) {
    const lastUpdate = new Date(vesselData.lastTelemetry);
    const now = new Date();
    const minutesSinceUpdate = (now - lastUpdate) / 60000;

    // If telemetry is less than 5 minutes old, consider it docked
    if (minutesSinceUpdate < 5) {
      return 'docked';
    }
  }

  // Only return offline if we have no data to determine state
  console.log(`⚠️ Vessel ${vesselData.vesselId} marked offline - no operational data`);
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

  // Fire alarm alert
  if (vesselData.safety?.fireAlarm === true) {
    alerts.push({
      id: `${vesselId}-fire-alarm-${Date.now()}`,
      vesselId,
      type: 'emergency',
      severity: 'critical',
      message: `🔥 FIRE ALARM ACTIVATED on ${vesselId}`,
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
    // Track alert in historical data
    dataCollector.trackAlert(alert);
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
  const fleetArray = Array.from(opsState.fleet.entries()).map(([id, data]) => ({ id, ...data }));
  const initialData = {
    type: 'initial_data',
    data: {
      fleet: fleetArray,
      alerts: opsState.alerts.slice(0, 20),
      systemStatus: {
        ...opsState.systemStatus,
        monitoring: mqttClient.isConnected(),
        mqttConnected: mqttClient.isConnected()
      },
      weatherData: opsState.weatherData,
      routeStatus: Array.from(opsState.routeStatus.entries()).map(([route, status]) => ({ route, ...status }))
    }
  };

  ws.send(JSON.stringify(initialData));
  console.log(`📤 Sent initial data to dashboard client (${fleetArray.length} vessels)`);

  // Send current MQTT connection status
  ws.send(JSON.stringify({
    type: 'mqtt_status',
    data: { connected: mqttClient.isConnected() }
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

async function sendHistoricalData(ws, vessel, metric, timeRange) {
  // Get real historical data from database
  const metricMap = {
    'fuel_efficiency': 'fuel_flow',
    'engine_temperature': 'engine_temp',
    'battery_soc': 'battery_soc',
    'engine_rpm': 'engine_rpm',
    'speed': 'speed',
    'generator_load': 'generator_load'
  };

  const dbMetric = metricMap[metric] || metric;
  const data = await historicalData.getHistoricalData(vessel, dbMetric, timeRange);

  // If no data available, generate some sample data
  if (data.length === 0) {
    console.log(`No historical data for ${vessel}/${metric}, using sample data`);
    const sampleData = generateHistoricalData(metric, timeRange);
    ws.send(JSON.stringify({
      type: 'historical_data',
      data: {
        vessel,
        metric,
        timeRange,
        data: sampleData
      }
    }));
  } else {
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

// Historical data endpoints
app.get('/api/historical/:vessel/:metric', async (req, res) => {
  const { vessel, metric } = req.params;
  const timeRange = req.query.range || '24h';

  const metricMap = {
    'fuel_efficiency': 'fuel_flow',
    'engine_temperature': 'engine_temp',
    'battery_soc': 'battery_soc',
    'engine_rpm': 'engine_rpm',
    'speed': 'speed',
    'generator_load': 'generator_load'
  };

  const dbMetric = metricMap[metric] || metric;
  const data = await historicalData.getHistoricalData(vessel, dbMetric, timeRange);

  res.json({
    vessel,
    metric,
    timeRange,
    data: data.length > 0 ? data : generateHistoricalData(metric, timeRange),
    timestamp: new Date().toISOString()
  });
});

// Get multiple metrics
app.get('/api/historical/:vessel/multi', (req, res) => {
  const { vessel } = req.params;
  const metrics = req.query.metrics ? req.query.metrics.split(',') : ['engine_rpm', 'engine_temp', 'battery_soc'];
  const timeRange = req.query.range || '24h';

  const results = historicalData.getMultipleMetrics(vessel, metrics, timeRange);

  res.json({
    vessel,
    metrics,
    timeRange,
    data: results,
    timestamp: new Date().toISOString()
  });
});

// Export historical data as CSV
app.get('/api/historical/:vessel/export', (req, res) => {
  const { vessel } = req.params;
  const timeRange = req.query.range || '24h';

  const csv = historicalData.exportToCSV(vessel, timeRange);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${vessel}_${timeRange}_${Date.now()}.csv"`);
  res.send(csv);
});

// Get statistics for a metric
app.get('/api/historical/:vessel/:metric/stats', (req, res) => {
  const { vessel, metric } = req.params;
  const timeRange = req.query.range || '24h';

  const stats = historicalData.getStatistics(vessel, metric, timeRange);

  res.json({
    vessel,
    metric,
    timeRange,
    stats,
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

// Initialize MQTT client
const mqttClient = new MQTTClient();

// Handle MQTT events
mqttClient.on('connected', () => {
  console.log('✅ MQTT client connected to broker');
  opsState.systemStatus.monitoring = true;

  // Broadcast connection status to all clients
  broadcastToClients({
    type: 'mqtt_status',
    data: { connected: true }
  });

  // Send system status update
  broadcastToClients({
    type: 'system_status',
    data: opsState.systemStatus
  });
});

mqttClient.on('disconnected', () => {
  console.log('❌ MQTT client disconnected');
  opsState.systemStatus.monitoring = false;

  broadcastToClients({
    type: 'mqtt_status',
    data: { connected: false }
  });
});

mqttClient.on('error', (err) => {
  console.error('⚠️  MQTT client error (non-fatal):', err.message);
  opsState.systemStatus.monitoring = false;

  broadcastToClients({
    type: 'mqtt_status',
    data: { connected: false, error: err.message }
  });
});

mqttClient.on('vessel-update', (update) => {
  console.log(`📡 Vessel update for ${update.vesselId} - category: ${update.category}`);

  // Log operational field if present
  if (update.data.operational) {
    console.log(`  └─ Operational state from MQTT: ${update.data.operational}`);
  }

  updateVesselData({
    vesselId: update.vesselId,
    ...update.data
  });
});

mqttClient.on('alert', (alert) => {
  console.log('🚨 Alert received:', alert);
  handleEmergencyAlert(alert);
});

mqttClient.on('weather-update', (update) => {
  console.log('🌤️ Weather update received');
  opsState.weatherData = update.data;
  broadcastToClients({
    type: 'weather_update',
    data: opsState.weatherData
  });
});

mqttClient.on('operations-update', (update) => {
  console.log('📊 Operations update received');
  broadcastToClients({
    type: 'operations_update',
    data: update.data
  });
});

// Connect to MQTT broker
mqttClient.connect();

// Keep the old ferry control connection as fallback for now
// connectToFerryControl();

// Initialize data collector
const dataCollector = new DataCollector(opsState);
dataCollector.start();

// Start server
server.listen(PORT, () => {
  console.log(`⚓ BC Ferries Operations Dashboard running on port ${PORT}`);
  console.log(`📊 Dashboard available at http://localhost:${PORT}`);
  console.log(`🔗 Connecting to MQTT broker at ${mqttClient.brokerUrl}`);
  console.log(`💾 Historical data collection started (5-second intervals)`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  dataCollector.stop();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down operations dashboard...');
  if (ferryControlWs) {
    ferryControlWs.close();
  }
  if (mqttClient) {
    mqttClient.disconnect();
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
