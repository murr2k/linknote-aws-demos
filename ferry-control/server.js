const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const mqtt = require('mqtt');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.static('public'));

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

// MQTT Configuration for HiveMQ Cloud
const mqttClient = mqtt.connect('mqtts://cluster-url.hivemq.cloud:8883', {
  clientId: `bc-ferries-simulator-${uuidv4()}`,
  username: process.env.HIVEMQ_USERNAME || 'demo-user',
  password: process.env.HIVEMQ_PASSWORD || 'demo-password',
  rejectUnauthorized: true
});

mqttClient.on('connect', () => {
  console.log('🚢 Connected to HiveMQ Cloud MQTT broker');
});

mqttClient.on('error', (error) => {
  console.error('MQTT connection error:', error);
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

// Publish telemetry to MQTT
function publishTelemetry() {
  const telemetryPayload = {
    ...vesselState,
    timestamp: new Date().toISOString(),
    messageId: uuidv4()
  };

  // Publish to HiveMQ Cloud
  const topic = `fleet/bcferries/${vesselState.vesselId}/telemetry`;
  mqttClient.publish(topic, JSON.stringify(telemetryPayload), {
    qos: 1,
    retain: false
  });

  // Broadcast to WebSocket clients
  broadcast({
    type: 'telemetry_update',
    data: telemetryPayload
  });
}

// API Routes

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    vesselId: vesselState.vesselId,
    mqttConnected: mqttClient.connected
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    vessel: vesselState.vesselId,
    mqtt: mqttClient.connected ? 'connected' : 'disconnected',
    clients: clients.size
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
  vesselState.safety.fireAlarm = true;
  vesselState.engine.rpm = Math.max(600, vesselState.engine.rpm * 0.5); // Reduce power
  vesselState.timestamp = new Date().toISOString();
  
  // Publish emergency message
  const emergencyPayload = {
    vesselId: vesselState.vesselId,
    emergency: true,
    type: 'fire_alarm',
    severity: 'critical',
    timestamp: new Date().toISOString(),
    location: vesselState.location,
    message: 'Fire alarm activated - engine power reduced'
  };
  
  mqttClient.publish(
    `fleet/bcferries/${vesselState.vesselId}/emergency/fire`,
    JSON.stringify(emergencyPayload),
    { qos: 2 }
  );
  
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
  vesselState.safety.fireAlarm = false;
  vesselState.timestamp = new Date().toISOString();
  
  publishTelemetry();
  
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

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down gracefully...');
  mqttClient.end();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});