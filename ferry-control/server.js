const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const MQTTClient = require('./lib/mqtt-client');

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // Allow inline scripts for dashboard
      scriptSrcAttr: ["'unsafe-inline'"], // Allow onclick attributes
      styleSrc: ["'self'", "'unsafe-inline'", "https:"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'", "wss:", "https:"], // Allow WebSocket connections
      fontSrc: ["'self'", "https:", "data:"]
    }
  }
}));
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.static('public'));

// Active alerts tracking for idempotency
const activeAlerts = new Map(); // alertType -> alertData

// Vessel simulation state
const vesselState = {
  vesselId: 'island-class-001',
  timestamp: new Date().toISOString(),
  location: {
    latitude: 48.6569,
    longitude: -123.3933,
    heading: 045
  },
  engine: {
    rpm: 1200,
    temperature: 85,
    fuelFlow: 120
  },
  power: {
    batterySOC: 85,
    mode: 'hybrid',
    generatorLoad: 45
  },
  safety: {
    fireAlarm: false,
    bilgeLevel: 15,
    co2Level: 400
  },
  navigation: {
    speed: 12.5,
    route: 'SWB-TSA',
    nextWaypoint: 'Active Pass'
  }
};

// Initialize MQTT client with proper configuration
const mqttClient = new MQTTClient();

// Set up MQTT event handlers
mqttClient.on('control', (controlData) => {
  console.log('🎛️ Received control command:', controlData);
  handleMQTTControlCommand(controlData);
});

mqttClient.on('status', (statusData) => {
  console.log('📊 Received status update:', statusData);
});

// WebSocket server for real-time updates
const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });

const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`📡 Client connected. Total clients: ${clients.size}`);
  
  // Send current state to new client
  ws.send(JSON.stringify({
    type: 'vessel_state',
    data: vesselState
  }));

  // Handle incoming messages
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'ping':
          // Respond to heartbeat ping
          ws.send(JSON.stringify({ type: 'pong' }));
          break;
        case 'acknowledge_fire_alarm':
          // Handle fire alarm acknowledgment from ops dashboard
          console.log('🔥 Fire alarm acknowledgment received from ops dashboard');
          
          // Clear from active alerts
          const alertKey = 'fire_alarm';
          if (activeAlerts.has(alertKey)) {
            activeAlerts.delete(alertKey);
          }
          
          vesselState.safety.fireAlarm = false;
          vesselState.timestamp = new Date().toISOString();
          publishTelemetry();
          updateVesselStatusMQTT();
          break;
        default:
          console.log('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`📡 Client disconnected. Total clients: ${clients.size}`);
  });
});

// Broadcast to all connected clients
function broadcast(data) {
  const message = JSON.stringify(data);
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Publish telemetry to MQTT with error handling
function publishTelemetry() {
  const telemetryPayload = {
    ...vesselState,
    timestamp: new Date().toISOString(),
    messageId: uuidv4()
  };

  // Publish to HiveMQ Cloud using enhanced client
  mqttClient.publishTelemetry(vesselState.vesselId, telemetryPayload)
    .then((result) => {
      if (result.buffered) {
        console.log('📦 Telemetry buffered (MQTT disconnected)');
      } else {
        console.log('📡 Telemetry published successfully');
      }
    })
    .catch((error) => {
      console.error('❌ Failed to publish telemetry:', error.message);
    });

  // Broadcast to WebSocket clients
  broadcast({
    type: 'telemetry_update',
    data: telemetryPayload
  });

  // Update vessel status
  mqttClient.publishStatus(vesselState.vesselId, 'operational', {
    status: determineVesselOperationalStatus(),
    lastTelemetry: telemetryPayload.timestamp,
    systems: {
      engine: vesselState.engine.rpm > 0 ? 'running' : 'idle',
      power: vesselState.power.mode,
      safety: vesselState.safety.fireAlarm ? 'alarm' : 'normal'
    }
  });
}

// API Routes

// Health check with MQTT status
app.get('/health', (req, res) => {
  const mqttInfo = mqttClient.getConnectionInfo();
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    vesselId: vesselState.vesselId,
    mqtt: {
      connected: mqttInfo.connected,
      broker: mqttInfo.broker,
      clientId: mqttInfo.clientId,
      reconnectAttempts: mqttInfo.reconnectAttempts,
      bufferedMessages: mqttInfo.bufferedMessages,
      lastHeartbeat: mqttInfo.lastHeartbeat
    },
    systems: {
      engine: vesselState.engine.rpm > 0 ? 'operational' : 'idle',
      power: vesselState.power.mode,
      safety: vesselState.safety.fireAlarm ? 'emergency' : 'normal'
    }
  });
});

app.get('/api/health', (req, res) => {
  const mqttInfo = mqttClient.getConnectionInfo();
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    vessel: vesselState.vesselId,
    mqtt: {
      status: mqttInfo.connected ? 'connected' : 'disconnected',
      broker: mqttInfo.broker,
      bufferedMessages: mqttInfo.bufferedMessages
    },
    clients: clients.size,
    uptime: Math.floor(process.uptime()),
    version: '1.2.0'
  });
});

// Get current vessel state
app.get('/api/vessel/state', (req, res) => {
  res.json(vesselState);
});

// Engine Controls
app.post('/api/override/engine/rpm', (req, res) => {
  const { value } = req.body;
  if (value >= 0 && value <= 2000) {
    vesselState.engine.rpm = value;
    vesselState.engine.fuelFlow = Math.max(50, value * 0.15); // Fuel flow correlation
    vesselState.timestamp = new Date().toISOString();
    
    publishTelemetry();
    updateVesselStatusMQTT();
    
    res.json({
      success: true,
      message: `Engine RPM set to ${value}`,
      vesselState
    });
  } else {
    res.status(400).json({
      success: false,
      message: 'RPM must be between 0 and 2000'
    });
  }
});

app.post('/api/override/engine/temperature', (req, res) => {
  const { value } = req.body;
  if (value >= 20 && value <= 120) {
    vesselState.engine.temperature = value;
    vesselState.timestamp = new Date().toISOString();
    
    publishTelemetry();
    updateVesselStatusMQTT();
    
    res.json({
      success: true,
      message: `Engine temperature set to ${value}°C`,
      vesselState
    });
  } else {
    res.status(400).json({
      success: false,
      message: 'Temperature must be between 20°C and 120°C'
    });
  }
});

// Power System Controls
app.post('/api/override/power/battery', (req, res) => {
  const { value } = req.body;
  if (value >= 0 && value <= 100) {
    vesselState.power.batterySOC = value;
    
    // Auto-switch mode based on battery level
    if (value < 25) {
      vesselState.power.mode = 'diesel';
      vesselState.power.generatorLoad = 75;
    } else if (value > 80) {
      vesselState.power.mode = 'electric';
      vesselState.power.generatorLoad = 0;
    } else {
      vesselState.power.mode = 'hybrid';
      vesselState.power.generatorLoad = 45;
    }
    
    vesselState.timestamp = new Date().toISOString();
    publishTelemetry();
    updateVesselStatusMQTT();
    
    res.json({
      success: true,
      message: `Battery SOC set to ${value}%. Mode: ${vesselState.power.mode}`,
      vesselState
    });
  } else {
    res.status(400).json({
      success: false,
      message: 'Battery SOC must be between 0% and 100%'
    });
  }
});

// Safety System Controls
app.post('/api/emergency/fire/trigger', (req, res) => {
  // Check if fire alarm is already active (idempotent)
  const alertKey = 'fire_alarm';
  if (activeAlerts.has(alertKey)) {
    console.log('🔥 Fire alarm already active - ignoring duplicate trigger');
    return res.json({
      success: true,
      message: 'Fire alarm already active',
      vesselState,
      duplicate: true
    });
  }
  
  vesselState.safety.fireAlarm = true;
  vesselState.engine.rpm = Math.max(600, vesselState.engine.rpm * 0.5); // Reduce power
  vesselState.timestamp = new Date().toISOString();
  
  // Create emergency payload with unique ID
  const emergencyPayload = {
    id: `${vesselState.vesselId}_fire_${Date.now()}`,
    vesselId: vesselState.vesselId,
    alertType: 'fire',
    severity: 'critical',
    location: vesselState.location,
    message: 'Fire alarm activated - engine power reduced',
    timestamp: vesselState.timestamp,
    response: {
      required: true,
      estimated_eta: 900 // 15 minutes
    }
  };
  
  // Track this alert as active
  activeAlerts.set(alertKey, emergencyPayload);
  
  mqttClient.publishEmergency(vesselState.vesselId, 'fire', emergencyPayload)
    .then(() => console.log('🆘 Emergency alert published successfully'))
    .catch(error => console.error('❌ Failed to publish emergency:', error.message));
  
  publishTelemetry();
  
  broadcast({
    type: 'emergency_alert',
    data: emergencyPayload
  });
  
  res.json({
    success: true,
    message: 'Fire alarm triggered - emergency procedures activated',
    vesselState
  });
});

app.post('/api/emergency/fire/acknowledge', (req, res) => {
  const alertKey = 'fire_alarm';
  
  // Remove from active alerts
  if (activeAlerts.has(alertKey)) {
    activeAlerts.delete(alertKey);
    console.log('🔥 Fire alarm alert cleared from active alerts');
  }
  
  vesselState.safety.fireAlarm = false;
  vesselState.timestamp = new Date().toISOString();
  
  publishTelemetry();
  
  // Broadcast acknowledgment
  broadcast({
    type: 'alert_acknowledged',
    data: {
      alertType: 'fire',
      vesselId: vesselState.vesselId,
      timestamp: vesselState.timestamp
    }
  });
  
  res.json({
    success: true,
    message: 'Fire alarm acknowledged and reset',
    vesselState
  });
});

app.post('/api/override/safety/bilge', (req, res) => {
  const { value } = req.body;
  if (value >= 0 && value <= 100) {
    vesselState.safety.bilgeLevel = value;
    vesselState.timestamp = new Date().toISOString();
    
    publishTelemetry();
    updateVesselStatusMQTT();
    
    res.json({
      success: true,
      message: `Bilge level set to ${value}cm`,
      vesselState
    });
  } else {
    res.status(400).json({
      success: false,
      message: 'Bilge level must be between 0cm and 100cm'
    });
  }
});

// Serve control dashboard HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start telemetry publishing (every 60 seconds for demo)
setInterval(publishTelemetry, 60000);

// Start server
server.listen(PORT, () => {
  console.log(`🚢 BC Ferries Control Dashboard running on port ${PORT}`);
  console.log(`📊 WebSocket server ready for real-time updates`);
  console.log(`🔧 Control API available at http://localhost:${PORT}/api/`);
});

// Add helper functions
function determineVesselOperationalStatus() {
  if (vesselState.safety.fireAlarm) return 'emergency';
  if (vesselState.engine.temperature > 100) return 'critical';
  if (vesselState.power.batterySOC < 20) return 'warning';
  if (vesselState.engine.rpm > 0) return 'underway';
  return 'docked';
}

function updateVesselStatusMQTT() {
  const status = {
    operational: determineVesselOperationalStatus(),
    systems: {
      engine: {
        status: vesselState.engine.rpm > 0 ? 'running' : 'idle',
        temperature: vesselState.engine.temperature,
        health: vesselState.engine.temperature > 95 ? 'warning' : 'good'
      },
      power: {
        mode: vesselState.power.mode,
        batteryLevel: vesselState.power.batterySOC,
        health: vesselState.power.batterySOC < 25 ? 'low' : 'good'
      },
      safety: {
        status: vesselState.safety.fireAlarm ? 'alarm' : 'normal',
        bilgeLevel: vesselState.safety.bilgeLevel
      }
    },
    location: vesselState.location,
    route: vesselState.navigation.route
  };
  
  mqttClient.publishStatus(vesselState.vesselId, 'systems', status)
    .catch(error => console.error('Failed to publish status:', error.message));
}

function handleMQTTControlCommand(controlData) {
  const { vesselId, system, action, payload } = controlData;
  
  console.log(`🎛️ Processing control command: ${system}/${action} for ${vesselId}`);
  
  // Route to appropriate handler based on system
  switch (system) {
    case 'engine':
      handleEngineCommand(action, payload);
      break;
    case 'power':
      handlePowerCommand(action, payload);
      break;
    case 'safety':
      handleSafetyCommand(action, payload);
      break;
    default:
      console.log(`⚠️ Unknown system: ${system}`);
  }
}

function handleEngineCommand(action, payload) {
  switch (action) {
    case 'set_rpm':
      if (payload.value >= 0 && payload.value <= 2000) {
        vesselState.engine.rpm = payload.value;
        vesselState.engine.fuelFlow = Math.max(50, payload.value * 0.15);
        publishTelemetry();
      }
      break;
    case 'emergency_stop':
      vesselState.engine.rpm = 0;
      vesselState.engine.fuelFlow = 0;
      publishTelemetry();
      break;
  }
}

function handlePowerCommand(action, payload) {
  switch (action) {
    case 'set_mode':
      if (['electric', 'hybrid', 'diesel'].includes(payload.mode)) {
        vesselState.power.mode = payload.mode;
        publishTelemetry();
      }
      break;
  }
}

function handleSafetyCommand(action, payload) {
  switch (action) {
    case 'acknowledge_alarm':
      vesselState.safety.fireAlarm = false;
      publishTelemetry();
      break;
  }
}

// Subscribe to control topics
function subscribeToControlTopics() {
  const vesselId = vesselState.vesselId;
  const topics = [
    `fleet/bcferries/${vesselId}/control/+/+`,
    `fleet/bcferries/${vesselId}/command/+`
  ];
  
  topics.forEach(topic => {
    mqttClient.subscribe(topic, 1)
      .then(() => console.log(`✅ Subscribed to control topic: ${topic}`))
      .catch(error => console.error(`❌ Failed to subscribe to ${topic}:`, error.message));
  });
}

// Initialize control topic subscriptions
setTimeout(subscribeToControlTopics, 2000); // Wait for MQTT connection

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down gracefully...');
  mqttClient.disconnect();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\nReceived SIGINT. Shutting down gracefully...');
  mqttClient.disconnect();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});