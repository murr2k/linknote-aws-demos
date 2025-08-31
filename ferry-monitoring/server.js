const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const mqtt = require('mqtt');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 8080;

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "fonts.googleapis.com", "cdn.jsdelivr.net"],
      fontSrc: ["'self'", "fonts.gstatic.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net", "unpkg.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:", "*.grafana.net", "*.amazonaws.com", "ferry.linknote.com"]
    }
  }
}));
app.use(compression());
app.use(limiter);
app.use(cors({
  origin: ['https://ferry.linknote.com', 'https://ops.linknote.com', 'http://localhost:3000'],
  credentials: true
}));
app.use(morgan('combined'));
app.use(express.json());
app.use(express.static('public'));

// Monitoring state and metrics storage
const monitoringState = {
  lastUpdated: new Date().toISOString(),
  systemStatus: 'operational',
  connectedVessels: new Map(),
  alertSummary: {
    critical: 0,
    warning: 0,
    info: 0
  },
  systemHealth: {
    ferryControlConnection: false,
    grafanaConnection: false,
    mqttConnection: false,
    dataSourcesActive: 0
  }
};

// Ferry control system configuration
const FERRY_CONTROL_URL = process.env.FERRY_CONTROL_URL || 'https://ferry.linknote.com';
const GRAFANA_URL = process.env.GRAFANA_URL || 'https://bcferriesdemo.grafana.net';

// MQTT Configuration for telemetry ingestion
const mqttClient = mqtt.connect(process.env.MQTT_BROKER || 'mqtts://cluster-url.hivemq.cloud:8883', {
  clientId: `bc-ferries-ops-monitor-${uuidv4()}`,
  username: process.env.HIVEMQ_USERNAME || 'ops-monitor',
  password: process.env.HIVEMQ_PASSWORD || 'monitor-password',
  rejectUnauthorized: true
});

mqttClient.on('connect', () => {
  console.log('📡 Connected to MQTT broker for telemetry monitoring');
  monitoringState.systemHealth.mqttConnection = true;
  
  // Subscribe to all vessel telemetry topics
  const topics = [
    'fleet/bcferries/+/telemetry',
    'fleet/bcferries/+/emergency/+',
    'fleet/bcferries/+/alerts/+',
    'fleet/bcferries/system/status'
  ];
  
  topics.forEach(topic => {
    mqttClient.subscribe(topic, (err) => {
      if (err) {
        console.error(`Failed to subscribe to ${topic}:`, err);
      } else {
        console.log(`📊 Subscribed to monitoring topic: ${topic}`);
      }
    });
  });
});

mqttClient.on('message', (topic, message) => {
  try {
    const data = JSON.parse(message.toString());
    const topicParts = topic.split('/');
    
    if (topicParts[3] === 'telemetry') {
      const vesselId = topicParts[2];
      monitoringState.connectedVessels.set(vesselId, {
        ...data,
        lastSeen: new Date().toISOString(),
        status: 'active'
      });
      
      // Check for alert conditions
      checkAlertConditions(vesselId, data);
      
    } else if (topicParts[3] === 'emergency' || topicParts[3] === 'alerts') {
      handleAlertMessage(data);
    }
    
    // Broadcast to WebSocket clients
    broadcastToClients({
      type: 'telemetry_update',
      vessel: topicParts[2],
      data: data,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error processing MQTT message:', error);
  }
});

// WebSocket server for real-time monitoring updates
const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });
const connectedClients = new Set();

wss.on('connection', (ws, req) => {
  connectedClients.add(ws);
  const clientId = uuidv4();
  ws.clientId = clientId;
  
  console.log(`📊 Monitoring client connected: ${clientId}. Total: ${connectedClients.size}`);
  
  // Send current monitoring state to new client
  ws.send(JSON.stringify({
    type: 'initial_state',
    data: {
      ...monitoringState,
      connectedVessels: Array.from(monitoringState.connectedVessels.entries())
    }
  }));

  ws.on('close', () => {
    connectedClients.delete(ws);
    console.log(`📊 Monitoring client disconnected: ${clientId}. Total: ${connectedClients.size}`);
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    connectedClients.delete(ws);
  });
});

// Broadcast to all connected WebSocket clients
function broadcastToClients(data) {
  const message = JSON.stringify(data);
  connectedClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Alert condition monitoring
function checkAlertConditions(vesselId, telemetryData) {
  const alerts = [];
  
  // Engine temperature critical
  if (telemetryData.engine && telemetryData.engine.temperature > 105) {
    alerts.push({
      type: 'critical',
      system: 'engine',
      message: `Engine temperature critical: ${telemetryData.engine.temperature}°C`,
      vesselId,
      timestamp: new Date().toISOString()
    });
  }
  
  // Low battery warning
  if (telemetryData.power && telemetryData.power.batterySOC < 15) {
    alerts.push({
      type: 'critical',
      system: 'power',
      message: `Battery critically low: ${telemetryData.power.batterySOC}%`,
      vesselId,
      timestamp: new Date().toISOString()
    });
  }
  
  // High bilge level
  if (telemetryData.safety && telemetryData.safety.bilgeLevel > 70) {
    alerts.push({
      type: 'warning',
      system: 'safety',
      message: `High bilge level: ${telemetryData.safety.bilgeLevel}cm`,
      vesselId,
      timestamp: new Date().toISOString()
    });
  }
  
  // Fire alarm
  if (telemetryData.safety && telemetryData.safety.fireAlarm) {
    alerts.push({
      type: 'critical',
      system: 'safety',
      message: 'Fire alarm activated',
      vesselId,
      timestamp: new Date().toISOString()
    });
  }
  
  // Process alerts
  alerts.forEach(alert => {
    if (alert.type === 'critical') {
      monitoringState.alertSummary.critical++;
    } else if (alert.type === 'warning') {
      monitoringState.alertSummary.warning++;
    }
    
    // Broadcast alert
    broadcastToClients({
      type: 'alert',
      alert: alert
    });
  });
}

function handleAlertMessage(alertData) {
  console.log('🚨 Emergency alert received:', alertData);
  
  broadcastToClients({
    type: 'emergency_alert',
    data: alertData
  });
}

// Health check ferry control system connection
async function checkFerryControlHealth() {
  try {
    const response = await fetch(`${FERRY_CONTROL_URL}/api/health`, {
      timeout: 5000
    });
    
    if (response.ok) {
      monitoringState.systemHealth.ferryControlConnection = true;
      return true;
    }
  } catch (error) {
    console.warn('Ferry control system not reachable:', error.message);
  }
  
  monitoringState.systemHealth.ferryControlConnection = false;
  return false;
}

// API Routes

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'bc-ferries-ops-monitoring',
    version: '1.0.0',
    systemHealth: monitoringState.systemHealth,
    connectedClients: connectedClients.size,
    connectedVessels: monitoringState.connectedVessels.size
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'operational',
    timestamp: new Date().toISOString(),
    monitoring: {
      connectedVessels: monitoringState.connectedVessels.size,
      connectedClients: connectedClients.size,
      alertSummary: monitoringState.alertSummary,
      systemHealth: monitoringState.systemHealth
    }
  });
});

// Get monitoring dashboard state
app.get('/api/monitoring/state', (req, res) => {
  res.json({
    ...monitoringState,
    connectedVessels: Array.from(monitoringState.connectedVessels.entries()),
    timestamp: new Date().toISOString()
  });
});

// Get vessel list for monitoring
app.get('/api/vessels', (req, res) => {
  const vessels = Array.from(monitoringState.connectedVessels.entries()).map(([id, data]) => ({
    vesselId: id,
    status: data.status || 'unknown',
    lastSeen: data.lastSeen,
    location: data.location,
    route: data.navigation?.route || 'Unknown'
  }));
  
  res.json({
    vessels,
    totalCount: vessels.length,
    activeCount: vessels.filter(v => v.status === 'active').length,
    timestamp: new Date().toISOString()
  });
});

// Get specific vessel telemetry
app.get('/api/vessels/:vesselId/telemetry', (req, res) => {
  const { vesselId } = req.params;
  const vesselData = monitoringState.connectedVessels.get(vesselId);
  
  if (!vesselData) {
    return res.status(404).json({
      error: 'Vessel not found',
      vesselId
    });
  }
  
  res.json(vesselData);
});

// Get alert summary
app.get('/api/alerts/summary', (req, res) => {
  res.json({
    ...monitoringState.alertSummary,
    timestamp: new Date().toISOString()
  });
});

// Proxy to ferry control system (for integration)
app.get('/api/ferry-control/*', async (req, res) => {
  try {
    const controlPath = req.path.replace('/api/ferry-control', '');
    const response = await fetch(`${FERRY_CONTROL_URL}/api${controlPath}`);
    
    if (response.ok) {
      const data = await response.json();
      res.json(data);
    } else {
      res.status(response.status).json({ error: 'Ferry control system unavailable' });
    }
  } catch (error) {
    res.status(503).json({ error: 'Cannot connect to ferry control system' });
  }
});

// Serve monitoring dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Grafana proxy endpoint (for embedding)
app.get('/grafana/*', (req, res) => {
  const grafanaPath = req.path.replace('/grafana', '');
  res.redirect(`${GRAFANA_URL}${grafanaPath}`);
});

// System health monitoring
setInterval(async () => {
  monitoringState.lastUpdated = new Date().toISOString();
  
  // Check ferry control connection
  await checkFerryControlHealth();
  
  // Update system health metrics
  monitoringState.systemHealth.dataSourcesActive = 
    (monitoringState.systemHealth.ferryControlConnection ? 1 : 0) +
    (monitoringState.systemHealth.mqttConnection ? 1 : 0) +
    (monitoringState.systemHealth.grafanaConnection ? 1 : 0);
  
  // Broadcast health update
  broadcastToClients({
    type: 'system_health',
    data: monitoringState.systemHealth
  });
  
}, 30000); // Every 30 seconds

// Cleanup old vessel data
setInterval(() => {
  const now = new Date();
  const cutoff = 5 * 60 * 1000; // 5 minutes
  
  for (const [vesselId, data] of monitoringState.connectedVessels.entries()) {
    const lastSeen = new Date(data.lastSeen);
    if (now - lastSeen > cutoff) {
      console.log(`🚢 Vessel ${vesselId} connection timeout - removing from active list`);
      monitoringState.connectedVessels.delete(vesselId);
    }
  }
}, 60000); // Every minute

// Start server
server.listen(PORT, () => {
  console.log(`🚢 BC Ferries Operations Monitoring Dashboard running on port ${PORT}`);
  console.log(`📊 Monitoring WebSocket server ready`);
  console.log(`🔧 Monitoring API available at http://localhost:${PORT}/api/`);
  console.log(`🎛️ Ferry Control Integration: ${FERRY_CONTROL_URL}`);
  console.log(`📈 Grafana Dashboard Integration: ${GRAFANA_URL}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down BC Ferries Operations Monitoring...');
  mqttClient.end();
  server.close(() => {
    console.log('Monitoring server closed');
    process.exit(0);
  });
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});