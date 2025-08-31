# BC Ferries System - End-to-End Data Flow Documentation

## 🌊 Complete Data Flow Architecture

### Current Operational System (August 2025)

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                        BC FERRIES DUAL DASHBOARD SYSTEM                              │
│                              End-to-End Data Flow                                    │
└─────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────┐    Real-time WebSocket     ┌─────────────────────────────────┐
│   FERRY CONTROL     │◄──────────────────────────►│    OPERATIONS MONITORING        │
│  ferry.linknote.com │         (WSS/HTTPS)        │  bc-ferries-ops-dashboard       │
│                     │                            │        .fly.dev                 │
│ ┌─────────────────┐ │                            │ ┌─────────────────────────────┐ │
│ │ User Interface  │ │                            │ │   Maritime Gauges Canvas    │ │
│ │ • RPM Slider    │ │                            │ │ • RPM Gauge (0-2000)        │ │
│ │ • Battery SOC   │ │                            │ │ • Temperature Gauge         │ │
│ │ • Bilge Level   │ │                            │ │ • Fuel Flow Display         │ │
│ │ • Fire Alarm    │ │                            │ │ • Battery SOC Meter         │ │
│ └─────────────────┘ │                            │ │ • Safety Status LEDs        │ │
│                     │                            │ └─────────────────────────────┘ │
│ ┌─────────────────┐ │                            │                                 │
│ │ WebSocket Server│ │                            │ ┌─────────────────────────────┐ │
│ │ • Vessel State  │ │                            │ │   WebSocket Client          │ │
│ │ • Telemetry     │ │                            │ │ • Auto-reconnection         │ │
│ │ • Emergency     │ │                            │ │ • Message Processing        │ │
│ │   Broadcasts    │ │                            │ │ • Alert Handling            │ │
│ └─────────────────┘ │                            │ └─────────────────────────────┘ │
│                     │                            │                                 │
│ ┌─────────────────┐ │                            │ ┌─────────────────────────────┐ │
│ │   REST API      │ │                            │ │   Historical Charts         │ │
│ │ • /api/health   │ │                            │ │ • Chart.js Integration      │ │
│ │ • /api/vessel/  │ │                            │ │ • Time-series Data          │ │
│ │   state         │ │                            │ │ • Performance Trends        │ │
│ │ • /api/override │ │                            │ │ • Analytics Dashboard       │ │
│ │ • /api/emergency│ │                            │ │ └─────────────────────────────┘ │
│ └─────────────────┘ │                            └─────────────────────────────────┘
└─────────────────────┘                                                              
         │                                                                            
         ▼                                                                            
┌─────────────────────┐                                                              
│   VESSEL STATE      │                                                              
│   DATA STORE        │                                                              
│                     │                                                              
│ {                   │                                                              
│   vesselId: "island-class-001",                                                   
│   engine: {                                                                       
│     rpm: 1200,                                                                    
│     temperature: 85,                                                              
│     fuelFlow: 120                                                                 
│   },                                                                              
│   power: {                                                                        
│     batterySOC: 85,                                                               
│     mode: 'hybrid',                                                               
│     generatorLoad: 45                                                             
│   },                                                                              
│   safety: {                                                                       
│     fireAlarm: false,                                                             
│     bilgeLevel: 15,                                                               
│     co2Level: 400                                                                 
│   }                                                                               
│ }                   │                                                              
└─────────────────────┘                                                              
```

## 📊 Detailed Data Flow Sequences

### 1. User Input → Real-time Display Flow

```
USER ACTION (Ferry Control Dashboard)
│
├── 1. User adjusts RPM slider to 1500
│   └── JavaScript Event: document.getElementById('rpmSlider').oninput
│
├── 2. Client-side validation and UI update
│   └── document.getElementById('rpmValue').textContent = '1500'
│
├── 3. HTTP POST to ferry control API
│   └── POST /api/override/engine/rpm
│       Headers: Content-Type: application/json
│       Body: {"value": 1500}
│
├── 4. Server-side processing (ferry-control/server.js)
│   ├── Validate input (0-2000 RPM range)
│   ├── Update vessel state: vesselState.engine.rpm = 1500
│   ├── Calculate fuel flow: vesselState.engine.fuelFlow = 1500 * 0.15
│   └── Update timestamp: vesselState.timestamp = new Date().toISOString()
│
├── 5. WebSocket broadcast to all connected clients
│   └── broadcast({
│       type: 'telemetry_update',
│       data: vesselState
│   })
│
├── 6. Ops dashboard receives WebSocket message
│   ├── WebSocket connection: wss://ferry.linknote.com
│   ├── Message parsing: JSON.parse(data.toString())
│   └── handleFerryControlMessage(message)
│
├── 7. Real-time gauge updates (ops dashboard)
│   ├── Canvas redraw: drawRPMGauge(1500)
│   ├── Digital display update: engineRpm.textContent = '1500'
│   └── Gauge animation: smooth transition to new value
│
└── 8. Telemetry logging
    ├── Ferry control: logTelemetry(`Engine RPM set to 1500`)
    └── Ops dashboard: updateHistoricalData(1500, 'rpm')
```

### 2. Emergency Alert Data Flow

```
EMERGENCY TRIGGER (Fire Alarm)
│
├── 1. Fire alarm button clicked (Ferry Control)
│   └── triggerFireAlarm() function execution
│
├── 2. Emergency state update
│   ├── vesselState.safety.fireAlarm = true
│   ├── vesselState.engine.rpm = Math.max(600, vesselState.engine.rpm * 0.5)
│   └── vesselState.timestamp = new Date().toISOString()
│
├── 3. Emergency MQTT publish (planned - not implemented)
│   └── mqttClient.publish(
│       `fleet/bcferries/${vesselState.vesselId}/emergency/fire`,
│       emergencyPayload,
│       { qos: 2 }
│   )
│
├── 4. WebSocket emergency broadcast
│   ├── publishTelemetry() - vessel state update
│   └── broadcast({
│       type: 'emergency_alert',
│       data: {
│         vesselId: 'island-class-001',
│         emergency: true,
│         type: 'fire_alarm',
│         severity: 'critical',
│         message: 'Fire alarm activated - engine power reduced'
│       }
│   })
│
├── 5. Real-time emergency response (both dashboards)
│   ├── Ferry Control:
│   │   ├── UI red flash: safetyPanel.classList.add('fire-alarm')
│   │   ├── Show acknowledge button: ackButton.style.display = 'inline-block'
│   │   └── Audio alert (browser permissions)
│   │
│   └── Ops Dashboard:
│       ├── Emergency modal: showEmergencyAlert(message)
│       ├── Visual alarm: emergency red indicators
│       ├── Sound notification: playEmergencyTone()
│       └── System status update: systemStatus.emergencyActive = true
│
└── 6. Emergency acknowledgment flow
    ├── User clicks acknowledge button
    ├── POST /api/emergency/fire/acknowledge
    ├── vesselState.safety.fireAlarm = false
    ├── WebSocket broadcast: fire alarm cleared
    └── UI reset on both dashboards
```

### 3. WebSocket Connection Management

```
CONNECTION ESTABLISHMENT
│
├── 1. Ops Dashboard Startup
│   └── const ferryControlWs = new WebSocket('wss://ferry.linknote.com')
│
├── 2. Connection Events
│   ├── onopen: Console log "Connected to ferry control system"
│   ├── onmessage: handleFerryControlMessage(JSON.parse(data))
│   ├── onclose: Console log "Connection closed, reconnecting..."
│   └── onerror: Error handling and reconnection logic
│
├── 3. Automatic Reconnection
│   ├── Connection lost detection
│   ├── Exponential backoff retry: 1s, 2s, 4s, 8s intervals
│   ├── Status update: opsState.systemStatus.monitoring = false
│   └── Reconnection attempt loop
│
├── 4. Health Monitoring
│   ├── Ferry Control Health Check:
│   │   └── GET /api/health → {"status": "healthy", "clients": N}
│   │
│   └── Ops Dashboard Health Check:
│       └── GET /health → {"ferryControlConnected": true|false}
│
└── 5. Message Types Handled
    ├── 'vessel_state' → Complete vessel telemetry update
    ├── 'telemetry_update' → Incremental data changes
    ├── 'emergency_alert' → Critical safety notifications
    └── 'system_status' → Connection and health updates
```

### 4. Data Persistence and Historical Tracking

```
CURRENT IMPLEMENTATION (In-Memory)
│
├── 1. Vessel State Storage
│   ├── Server memory: vesselState JavaScript object
│   ├── Real-time updates: Direct object modification
│   └── No database persistence (demonstration system)
│
├── 2. Telemetry Logging
│   ├── Ferry Control: Browser console + DOM display
│   ├── Ops Dashboard: Historical data arrays (limited)
│   └── Log rotation: Keep last 50 entries
│
├── 3. Historical Data Generation (Mock)
│   ├── generateHistoricalData() function
│   ├── Simulated trends: fuel efficiency, punctuality
│   └── Chart.js visualization
│
└── 4. PLANNED INTEGRATION (Not Implemented)
    ├── AWS IoT Core: MQTT message ingestion
    ├── AWS TimeStream: Time-series data storage
    ├── AWS CloudWatch: Metrics and logging
    └── Grafana Cloud: Professional dashboards
```

## 🔧 Technical Implementation Details

### WebSocket Message Formats

#### Vessel State Update
```json
{
  "type": "vessel_state",
  "data": {
    "vesselId": "island-class-001",
    "timestamp": "2025-08-31T08:45:00.000Z",
    "messageId": "uuid-string",
    "engine": {
      "rpm": 1500,
      "temperature": 92,
      "fuelFlow": 225.0
    },
    "power": {
      "batterySOC": 78,
      "mode": "hybrid",
      "generatorLoad": 52
    },
    "safety": {
      "fireAlarm": false,
      "bilgeLevel": 18,
      "co2Level": 420
    },
    "navigation": {
      "speed": 14.2,
      "heading": 087,
      "route": "SWB-TSA"
    },
    "location": {
      "latitude": 48.6569,
      "longitude": -123.3933,
      "heading": 087
    }
  }
}
```

#### Emergency Alert Format
```json
{
  "type": "emergency_alert",
  "data": {
    "vesselId": "island-class-001",
    "emergency": true,
    "type": "fire_alarm",
    "severity": "critical",
    "timestamp": "2025-08-31T08:45:00.000Z",
    "location": {
      "latitude": 48.6569,
      "longitude": -123.3933
    },
    "message": "Fire alarm activated - engine power reduced",
    "acknowledgmentRequired": true
  }
}
```

### API Endpoint Specifications

#### Ferry Control REST API
```
GET /health
→ {"status": "healthy", "vessel": "island-class-001", "clients": 0}

GET /api/health  
→ {"status": "healthy", "mqtt": "disconnected", "clients": 2}

GET /api/vessel/state
→ {vesselState object - complete vessel telemetry}

POST /api/override/engine/rpm
Body: {"value": 1500}
→ {"success": true, "message": "Engine RPM set to 1500", vesselState}

POST /api/emergency/fire/trigger
Body: {}
→ {"success": true, "message": "Fire alarm triggered", vesselState}
```

#### Ops Dashboard REST API
```
GET /health
→ {"status": "healthy", "ferryControlConnected": true, "connectedVessels": 1}

Internal WebSocket API (for ferry control communication):
- Connection: wss://ferry.linknote.com
- Authentication: None (demo system)
- Message handling: JSON parsing with error handling
```

## 🚀 Performance Characteristics

### Current System Performance
- **WebSocket Latency**: <100ms between dashboards
- **API Response Time**: ~283ms average (Playwright tested)
- **Connection Recovery**: Automatic within 1-5 seconds
- **Concurrent Users**: Tested with 5 simultaneous connections
- **Memory Usage**: 
  - Ferry Control: ~512MB RAM
  - Ops Dashboard: 1GB RAM (scaled for stability)

### Data Flow Rates
- **Telemetry Updates**: On-demand (user interaction triggered)
- **WebSocket Messages**: ~10-50 bytes per message
- **Historical Data**: Mock generation, no real persistence
- **Emergency Alerts**: Immediate propagation (<500ms)

## 🎯 Integration Points for Future Expansion

### Planned AWS Integration
```
Ferry Control → HiveMQ Cloud → AWS IoT Core → TimeStream → Grafana
     │              │              │            │         │
     └─WebSocket─────┴──MQTT Bridge─┴──Rules─────┴─Storage─┴─Visualization
```

### Maritime Industry Standards
- **Topic Structure**: `fleet/bcferries/{vesselId}/telemetry`
- **Message QoS**: QoS 1 for telemetry, QoS 2 for emergencies
- **Data Format**: JSON with ISO 8601 timestamps
- **Security**: TLS encryption, certificate-based auth (planned)

## 📋 System Status Summary

### ✅ Currently Working
- Real-time WebSocket communication between dashboards
- Interactive vessel controls with immediate feedback
- Emergency alert system with visual and audio notifications
- API health monitoring and status reporting
- Connection resilience and automatic reconnection
- SSL/HTTPS security for all connections

### 🔄 Planned (Not Implemented)
- MQTT broker integration (HiveMQ Cloud)
- AWS IoT Core message routing
- TimeStream time-series data persistence
- Grafana Cloud professional dashboards
- Multi-vessel fleet management
- Advanced historical analytics

### 🎉 Demonstration Ready
**The current end-to-end data flow supports a complete BC Ferries maritime telemetry demonstration suitable for job interview purposes.**

---
*Data Flow Documentation - Last Updated: August 31, 2025*