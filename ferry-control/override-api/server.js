const express = require('express');
const mqtt = require('mqtt');
const cors = require('cors');
const helmet = require('helmet');
const { v4: uuidv4 } = require('uuid');

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", "ferry.linknote.com", "ops.linknote.com"]
    }
  }
}));

app.use(express.json());
app.use(cors({
  origin: ['https://ferry.linknote.com', 'http://localhost:3000'],
  credentials: true
}));

// MQTT Client Configuration
const mqttOptions = {
  clientId: `bc-ferries-control-${uuidv4()}`,
  username: process.env.HIVEMQ_USERNAME,
  password: process.env.HIVEMQ_PASSWORD,
  keepalive: 60,
  clean: true
};

const mqttClient = mqtt.connect(process.env.HIVEMQ_BROKER_URL || 'mqtt://localhost:1883', mqttOptions);

// Vessel state tracking for Island Class 001
let vesselState = {
  vesselId: 'island-class-001',
  timestamp: Date.now(),
  engineRPM: 1200,
  engineTemp: 85.5,
  batterySOC: 85,
  powerMode: 'hybrid',
  fireAlarmActive: false,
  bilgeLevel: 15, // cm
  coDetector: 'NORMAL',
  location: {
    latitude: 48.8566,  // Vancouver Harbor
    longitude: -123.3934
  },
  weather: {
    windSpeed: 12, // knots
    waveHeight: 1.2, // meters
    visibility: 8 // nautical miles
  }
};

// MQTT Connection Handlers
mqttClient.on('connect', () => {
  console.log('✅ Connected to HiveMQ broker');
  
  // Subscribe to acknowledgment topics
  mqttClient.subscribe('fleet/bcferries/island-class-001/+/+/ack');
  mqttClient.subscribe('fleet/bcferries/island-class-001/emergency/+/response');
});

mqttClient.on('error', (error) => {
  console.error('❌ MQTT connection error:', error);
});

// Utility function to publish telemetry
function publishTelemetry(overrideData = null) {
  const telemetryPayload = {
    ...vesselState,
    timestamp: Date.now(),
    sensors: {
      main_engine_rpm: { value: vesselState.engineRPM, unit: 'rpm', override: !!overrideData?.engineRPM },
      engine_temperature: { value: vesselState.engineTemp, unit: 'celsius' },
      battery_state_of_charge: { value: vesselState.batterySOC, unit: 'percentage', override: !!overrideData?.batterySOC },
      power_mode: { value: vesselState.powerMode, override: !!overrideData?.powerMode },
      fire_detector_engine_room: { value: vesselState.fireAlarmActive ? 'FIRE_DETECTED' : 'NORMAL' },
      bilge_water_level: { value: vesselState.bilgeLevel, unit: 'cm' },
      co_detector_cabin: { value: vesselState.coDetector }
    },
    ...(overrideData && { override: overrideData })
  };
  
  const topic = `fleet/bcferries/island-class-001/telemetry`;
  mqttClient.publish(topic, JSON.stringify(telemetryPayload), { qos: 1 });
  
  console.log(`📡 Published telemetry: RPM=${vesselState.engineRPM}, Battery=${vesselState.batterySOC}%`);
}

// ====== ENGINE CONTROL ENDPOINTS ======

app.post('/api/override/engine/rpm', (req, res) => {
  const { value } = req.body;
  
  if (value < 0 || value > 2000) {
    return res.status(400).json({ error: 'RPM must be between 0-2000' });
  }
  
  vesselState.engineRPM = value;
  vesselState.engineTemp = 65 + (value * 0.02); // Realistic temperature correlation
  
  publishTelemetry({ engineRPM: value });
  
  res.json({ 
    success: true, 
    message: `Engine RPM set to ${value}`,
    vesselState: vesselState 
  });
});

app.post('/api/emergency/engine/stop', (req, res) => {
  vesselState.engineRPM = 0;
  vesselState.engineTemp = 65; // Cooling down
  
  const emergencyMsg = {
    timestamp: Date.now(),
    vesselId: 'island-class-001',
    emergency: true,
    type: 'ENGINE_EMERGENCY_STOP',
    triggeredBy: 'control-dashboard',
    severity: 'HIGH',
    actions: ['ENGINE_SHUTDOWN', 'ALERT_BRIDGE', 'LOG_INCIDENT']
  };
  
  mqttClient.publish('fleet/bcferries/island-class-001/emergency/engine/stop', JSON.stringify(emergencyMsg));
  publishTelemetry({ engineRPM: 0 });
  
  res.json({ 
    success: true, 
    message: 'Emergency engine stop activated',
    vesselState: vesselState 
  });
});

// ====== SAFETY SYSTEM ENDPOINTS ======

app.post('/api/emergency/fire/trigger', (req, res) => {
  vesselState.fireAlarmActive = true;
  vesselState.engineRPM = 0; // Auto-shutdown on fire detection
  
  const fireEmergency = {
    timestamp: Date.now(),
    vesselId: 'island-class-001',
    emergency: true,
    type: 'FIRE_ALARM',
    location: 'engine_room',
    severity: 'CRITICAL',
    autoActions: ['ENGINE_SHUTDOWN', 'FIRE_SUPPRESSION_READY', 'NOTIFY_COAST_GUARD'],
    manualActions: ['EVACUATION_PROTOCOL', 'EMERGENCY_BROADCAST']
  };
  
  mqttClient.publish('fleet/bcferries/island-class-001/emergency/fire', JSON.stringify(fireEmergency));
  publishTelemetry({ fireAlarm: true });
  
  res.json({ 
    success: true, 
    message: 'Fire alarm triggered - Emergency protocols activated',
    vesselState: vesselState 
  });
});

app.post('/api/safety/bilge/level', (req, res) => {
  const { level } = req.body;
  
  if (level < 0 || level > 100) {
    return res.status(400).json({ error: 'Bilge level must be between 0-100 cm' });
  }
  
  vesselState.bilgeLevel = level;
  
  // Trigger alerts for high bilge levels
  if (level > 50) {
    const bilgeAlert = {
      timestamp: Date.now(),
      vesselId: 'island-class-001',
      alert: true,
      type: 'HIGH_BILGE_WATER',
      level: level,
      severity: level > 75 ? 'HIGH' : 'MEDIUM',
      recommendedAction: level > 75 ? 'ACTIVATE_PUMPS' : 'MONITOR_CLOSELY'
    };
    
    mqttClient.publish('fleet/bcferries/island-class-001/alerts/bilge', JSON.stringify(bilgeAlert));
  }
  
  publishTelemetry({ bilgeLevel: level });
  
  res.json({ 
    success: true, 
    message: `Bilge water level set to ${level}cm`,
    vesselState: vesselState 
  });
});

// ====== POWER MANAGEMENT ENDPOINTS ======

app.post('/api/override/power/battery', (req, res) => {
  const { soc } = req.body;
  
  if (soc < 0 || soc > 100) {
    return res.status(400).json({ error: 'Battery SOC must be between 0-100%' });
  }
  
  vesselState.batterySOC = soc;
  
  // Auto-switch to diesel mode if battery critically low
  if (soc < 20 && vesselState.powerMode === 'electric') {
    vesselState.powerMode = 'hybrid';
    
    const powerAlert = {
      timestamp: Date.now(),
      vesselId: 'island-class-001',
      alert: true,
      type: 'LOW_BATTERY_AUTO_SWITCH',
      batterySOC: soc,
      newMode: 'hybrid',
      reason: 'Battery critically low - automatic mode switch'
    };
    
    mqttClient.publish('fleet/bcferries/island-class-001/alerts/power', JSON.stringify(powerAlert));
  }
  
  publishTelemetry({ batterySOC: soc });
  
  res.json({ 
    success: true, 
    message: `Battery SOC set to ${soc}%`,
    autoSwitch: soc < 20 ? 'Switched to hybrid mode' : null,
    vesselState: vesselState 
  });
});

app.post('/api/override/power/mode/:mode', (req, res) => {
  const { mode } = req.params;
  
  if (!['electric', 'hybrid', 'diesel'].includes(mode)) {
    return res.status(400).json({ error: 'Invalid power mode' });
  }
  
  // Validate mode switch feasibility
  if (mode === 'electric' && vesselState.batterySOC < 30) {
    return res.status(400).json({ 
      error: 'Cannot switch to electric mode - battery too low',
      currentSOC: vesselState.batterySOC 
    });
  }
  
  const previousMode = vesselState.powerMode;
  vesselState.powerMode = mode;
  
  const modeChangeMsg = {
    timestamp: Date.now(),
    vesselId: 'island-class-001',
    system: 'power_management',
    transition: {
      from: previousMode,
      to: mode,
      triggeredBy: 'control-dashboard',
      batterySOC: vesselState.batterySOC
    },
    estimatedEfficiency: {
      electric: 95,
      hybrid: 78, 
      diesel: 65
    }[mode]
  };
  
  mqttClient.publish('fleet/bcferries/island-class-001/power/mode', JSON.stringify(modeChangeMsg));
  publishTelemetry({ powerMode: mode });
  
  res.json({ 
    success: true, 
    message: `Switched from ${previousMode} to ${mode} mode`,
    vesselState: vesselState 
  });
});

// ====== STATUS AND HEALTH ENDPOINTS ======

app.get('/api/state', (req, res) => {
  res.json({
    ...vesselState,
    mqtt: {
      connected: mqttClient.connected,
      lastHeartbeat: Date.now()
    },
    demo: {
      readyForPresentation: true,
      controlsActive: true
    }
  });
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    services: {
      api: 'running',
      mqtt: mqttClient.connected ? 'connected' : 'disconnected',
      grafana: 'running'
    },
    timestamp: Date.now()
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ====== DEMO SEQUENCE ENDPOINTS ======

app.post('/api/demo/reset', (req, res) => {
  // Reset to normal operating conditions
  vesselState = {
    vesselId: 'island-class-001',
    timestamp: Date.now(),
    engineRPM: 1200,
    engineTemp: 85.5,
    batterySOC: 85,
    powerMode: 'hybrid',
    fireAlarmActive: false,
    bilgeLevel: 15,
    coDetector: 'NORMAL',
    location: {
      latitude: 48.8566,
      longitude: -123.3934
    },
    weather: {
      windSpeed: 12,
      waveHeight: 1.2,
      visibility: 8
    }
  };
  
  publishTelemetry();
  
  res.json({ 
    success: true, 
    message: 'Vessel reset to normal operating conditions',
    vesselState: vesselState 
  });
});

app.post('/api/demo/scenario/:scenario', (req, res) => {
  const { scenario } = req.params;
  
  switch(scenario) {
    case 'heavy-weather':
      vesselState.engineRPM = 1800;
      vesselState.weather.windSpeed = 35;
      vesselState.weather.waveHeight = 3.5;
      break;
      
    case 'docking':
      vesselState.engineRPM = 400;
      vesselState.powerMode = 'electric';
      break;
      
    case 'emergency-evacuation':
      vesselState.fireAlarmActive = true;
      vesselState.engineRPM = 0;
      vesselState.powerMode = 'diesel'; // Backup power
      break;
      
    default:
      return res.status(400).json({ error: 'Unknown scenario' });
  }
  
  publishTelemetry();
  
  res.json({ 
    success: true, 
    message: `Activated ${scenario} scenario`,
    vesselState: vesselState 
  });
});

// Error handling
app.use((error, req, res, next) => {
  console.error('API Error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    message: 'Please check vessel control systems'
  });
});

// Start server
const PORT = process.env.API_PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚢 BC Ferries Control API running on port ${PORT}`);
  console.log(`📡 MQTT Status: ${mqttClient.connected ? 'Connected' : 'Connecting...'}`);
  console.log(`🎯 Ready for ferry.linknote.com demo`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Shutting down BC Ferries Control API...');
  mqttClient.end();
  process.exit(0);
});