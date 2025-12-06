# BC Ferries System Architecture

This document describes the data flow and architecture of the BC Ferries monitoring system deployed on Fly.io.

## System Components

| Component | Fly.io App | Public URL | Purpose |
|-----------|------------|------------|---------|
| Ferry Control | `bc-ferries-control-new` | ferry.linknode.com | Vessel simulator & control dashboard |
| Ops Dashboard | `bc-ferries-ops-dashboard` | ops.linknode.com | Operations center monitoring |
| MQTT Broker | `bc-ferries-mqtt-broker` | (internal only) | Message broker for pub/sub |

## High-Level Architecture

```mermaid
flowchart TB
    subgraph Browsers["User Browsers"]
        B1["Ferry Dashboard<br/>ferry.linknode.com"]
        B2["Ops Dashboard<br/>ops.linknode.com"]
    end

    subgraph Fly["Fly.io Infrastructure"]
        subgraph FC["bc-ferries-control-new"]
            FC_WS["WebSocket Server"]
            FC_API["REST API"]
            FC_MQTT["MQTT Publisher"]
            FC_STATE["Vessel State"]
        end

        subgraph OPS["bc-ferries-ops-dashboard"]
            OPS_WS["WebSocket Server"]
            OPS_MQTT["MQTT Subscriber"]
            OPS_STATE["Ops State"]
            OPS_RELAY["WS Relay Client<br/>(backup path)"]
        end

        subgraph BROKER["bc-ferries-mqtt-broker"]
            MOSQ["Mosquitto<br/>:1883"]
        end
    end

    B1 <-->|"wss://"| FC_WS
    B1 -.->|"REST polling<br/>(fallback)"| FC_API
    B2 <-->|"wss://"| OPS_WS

    FC_STATE -->|"publish"| FC_MQTT
    FC_MQTT ==>|"PRIMARY PATH<br/>mqtt://.internal:1883"| MOSQ
    MOSQ ==>|"subscribe"| OPS_MQTT
    OPS_MQTT --> OPS_STATE
    OPS_STATE --> OPS_WS

    OPS_RELAY -.->|"BACKUP PATH<br/>wss://ferry.linknode.com<br/>(currently disconnected)"| FC_WS

    style MOSQ fill:#4CAF50,color:#fff
    style FC_MQTT fill:#2196F3,color:#fff
    style OPS_MQTT fill:#2196F3,color:#fff
```

## Actual Data Flow (How It Really Works)

### Primary Path: MQTT Broker (Currently Active)

This is the **primary and currently functioning** data path. The ops-dashboard receives all vessel telemetry through MQTT subscriptions.

```mermaid
sequenceDiagram
    participant FC as Ferry Control
    participant MQTT as MQTT Broker<br/>(Mosquitto)
    participant OPS as Ops Dashboard Server
    participant Browser as Ops Browser

    Note over FC,Browser: Every 60 seconds (or on control changes)

    FC->>FC: publishTelemetry()

    par Publish to MQTT Topics
        FC->>MQTT: fleet/bcferries/{vesselId}/telemetry
        FC->>MQTT: fleet/bcferries/{vesselId}/status/{component}
    end

    Note over MQTT: Broker routes to subscribers

    MQTT-->>OPS: Message delivery
    OPS->>OPS: handleMQTTMessage()
    OPS->>OPS: opsState.fleet.set(vesselId, data)
    OPS->>Browser: broadcastToClients()<br/>via WebSocket
    Browser->>Browser: updateUI()
```

### Backup Path: WebSocket Relay (Currently Disconnected)

This path exists as a fallback but is **currently not connected**. The system functions entirely through MQTT.

```mermaid
sequenceDiagram
    participant FC as Ferry Control
    participant WS as WebSocket Connection
    participant OPS as Ops Dashboard

    Note over FC,OPS: BACKUP PATH - Currently showing<br/>ferryControlConnected: false

    FC->>FC: publishTelemetry()
    FC->>WS: broadcast({type: 'telemetry_update'})

    alt WebSocket Connected
        WS->>OPS: Message received
        OPS->>OPS: handleFerryControlMessage()
    else WebSocket Disconnected (Current State)
        WS--xOPS: Connection failed
        Note over OPS: Retries every 5 seconds<br/>but MQTT path still works
    end
```

### Ferry Dashboard: Browser to Server

```mermaid
sequenceDiagram
    participant Browser as Ferry Dashboard Browser
    participant WS as WebSocket Server
    participant API as REST API
    participant State as Vessel State

    alt WebSocket Mode (Default)
        Browser->>WS: Connect wss://ferry.linknode.com
        WS-->>Browser: Initial vessel_state
        loop On telemetry updates
            State->>WS: broadcast()
            WS-->>Browser: Push update
            Browser->>Browser: updateUI()
        end
    else "MQTT" Mode (Actually REST Polling)
        loop Every 2 seconds
            Browser->>API: GET /api/vessel/state
            API->>State: Read current state
            State-->>API: vesselState
            API-->>Browser: JSON response
            Browser->>Browser: updateUI()
        end
    end
```

## Current System State

```mermaid
flowchart LR
    subgraph Status["Connection Status"]
        direction TB
        S1["MQTT: Ferry Control → Broker"]
        S2["MQTT: Broker → Ops Dashboard"]
        S3["WebSocket: Ops → Ferry"]
        S4["WebSocket: Browsers → Servers"]
    end

    S1 -->|"✅ CONNECTED"| OK1["Publishing telemetry"]
    S2 -->|"✅ CONNECTED"| OK2["Receiving updates"]
    S3 -->|"❌ DISCONNECTED"| WARN["Backup path offline<br/>System still functional"]
    S4 -->|"✅ CONNECTED"| OK3["Users receiving data"]

    style S1 fill:#4CAF50,color:#fff
    style S2 fill:#4CAF50,color:#fff
    style S3 fill:#FF9800,color:#fff
    style S4 fill:#4CAF50,color:#fff
```

## Connection Configuration

### Environment Variables

```mermaid
flowchart TB
    subgraph FC["Ferry Control Environment"]
        FC_ENV["MQTT_BROKER_URL=<br/>mqtt://bc-ferries-mqtt-broker.internal:1883"]
    end

    subgraph OPS["Ops Dashboard Environment"]
        OPS_ENV1["FERRY_CONTROL_WS=<br/>wss://ferry.linknode.com"]
        OPS_ENV2["FERRY_CONTROL_API=<br/>https://ferry.linknode.com"]
        OPS_ENV3["MQTT_BROKER_URL=<br/>mqtt://bc-ferries-mqtt-broker.internal:1883"]
    end

    subgraph BROKER["MQTT Broker"]
        BROKER_INT["Internal: :1883<br/>(Used by both apps)"]
    end

    FC_ENV ==>|"Primary"| BROKER_INT
    OPS_ENV3 ==>|"Primary"| BROKER_INT
    OPS_ENV1 -.->|"Backup<br/>(disconnected)"| FC
```

### MQTT Topics

| Topic Pattern | Publisher | Subscriber | QoS | Purpose |
|--------------|-----------|------------|-----|---------|
| `fleet/bcferries/{vesselId}/telemetry` | Ferry Control | Ops Dashboard | 1 | Regular telemetry updates |
| `fleet/bcferries/{vesselId}/emergency/{type}` | Ferry Control | Ops Dashboard | 2 | Emergency alerts (guaranteed) |
| `fleet/bcferries/{vesselId}/status/{component}` | Ferry Control | Ops Dashboard | 1 | System status (retained) |
| `fleet/bcferries/{vesselId}/heartbeat` | Ferry Control | Broker | 0 | Connection health |
| `fleet/bcferries/status/disconnect` | Ferry Control | Broker | 1 | LWT (Last Will & Testament) |

## Network Topology

```mermaid
flowchart TB
    subgraph Internet["Public Internet"]
        USER["Users"]
    end

    subgraph CF["Cloudflare DNS"]
        DNS1["ferry.linknode.com"]
        DNS2["ops.linknode.com"]
    end

    subgraph FLY["Fly.io Private Network (.internal)"]
        subgraph APPS["Application Machines"]
            FC["bc-ferries-control-new<br/>:8080"]
            OPS["bc-ferries-ops-dashboard<br/>:8081"]
        end

        subgraph INTERNAL["Internal Services"]
            MQTT["bc-ferries-mqtt-broker<br/>mqtt://.internal:1883"]
        end

        FC ==>|"publish"| MQTT
        MQTT ==>|"subscribe"| OPS
        OPS -.->|"backup relay<br/>(disconnected)"| CF
    end

    USER --> CF
    CF --> FC
    CF --> OPS

    style MQTT fill:#4CAF50,color:#fff
```

## Frontend Protocol Toggle Explained

The ferry dashboard (ferry.linknode.com) has a WebSocket/MQTT toggle switch. Here's what it **actually** does:

```mermaid
flowchart TB
    subgraph FerryDashboard["Ferry Dashboard (ferry.linknode.com)"]
        TOGGLE["⚡ Protocol Toggle Switch"]
        WS_OPTION["🌐 WebSocket"]
        MQTT_OPTION["📤 MQTT"]
        TOGGLE --- WS_OPTION
        TOGGLE --- MQTT_OPTION
    end

    subgraph Browser["Browser Data Reception"]
        subgraph WS_PATH["When WebSocket Selected"]
            WS1["initWebSocket()"]
            WS2["Opens WSS connection"]
            WS3["Receives push updates"]
            WS4["~0ms latency"]
        end

        subgraph POLL_PATH["When 'MQTT' Selected"]
            POLL1["initMQTT() - misleading name!"]
            POLL2["Closes WebSocket"]
            POLL3["Polls GET /api/vessel/state"]
            POLL4["Every 2 seconds"]
            POLL5["Up to 2s latency"]
        end
    end

    subgraph Server["Ferry Control Server"]
        STATE["vesselState<br/>(in-memory)"]
        WS_SERVER["WebSocket Server"]
        REST_API["REST API<br/>/api/vessel/state"]
    end

    WS_OPTION -->|"toggleProtocol()"| WS1
    MQTT_OPTION -->|"toggleProtocol()"| POLL1

    WS1 --> WS2
    WS2 <-->|"wss://ferry.linknode.com"| WS_SERVER
    WS_SERVER --> STATE

    POLL1 --> POLL2
    POLL2 --> POLL3
    POLL3 -->|"fetch() every 2s"| REST_API
    REST_API --> STATE

    style TOGGLE fill:#9C27B0,color:#fff
    style WS_PATH fill:#E3F2FD
    style POLL_PATH fill:#FFF3E0
    style STATE fill:#4CAF50,color:#fff
```

### Toggle Effect on Data Flow

```mermaid
flowchart LR
    subgraph Toggle["Toggle Position"]
        T1["🌐 WebSocket"]
        T2["📤 MQTT"]
    end

    subgraph Effect["What Actually Happens"]
        subgraph WS_EFFECT["WebSocket Mode Effect"]
            WE1["Browser ← Push ← Server"]
            WE2["Real-time updates"]
            WE3["Bidirectional channel"]
        end

        subgraph MQTT_EFFECT["'MQTT' Mode Effect"]
            ME1["Browser → Poll → Server"]
            ME2["2-second intervals"]
            ME3["REST API only"]
            ME4["NO actual MQTT used!"]
        end
    end

    subgraph Backend["Backend (Unchanged by Toggle)"]
        BE1["Server always publishes<br/>to MQTT broker"]
        BE2["Ops Dashboard always<br/>receives via MQTT"]
    end

    T1 --> WS_EFFECT
    T2 --> MQTT_EFFECT

    WS_EFFECT -.->|"Toggle does NOT<br/>affect backend"| Backend
    MQTT_EFFECT -.->|"Toggle does NOT<br/>affect backend"| Backend

    style ME4 fill:#FF5722,color:#fff
    style Backend fill:#E8F5E9
```

### Complete System View with Toggle

```mermaid
flowchart TB
    subgraph FerryBrowser["Ferry Dashboard Browser"]
        TOGGLE["⚡ Toggle Switch"]
        WS_MODE["WebSocket Mode"]
        POLL_MODE["Polling Mode"]
    end

    subgraph FerryServer["Ferry Control Server"]
        VESSEL_STATE["vesselState"]
        WS_SRV["WebSocket<br/>Server"]
        REST["REST API"]
        MQTT_PUB["MQTT<br/>Publisher"]
    end

    subgraph Infrastructure["Backend Infrastructure"]
        BROKER["MQTT Broker"]
        OPS_SUB["Ops Dashboard<br/>MQTT Subscriber"]
    end

    subgraph OpsBrowser["Ops Dashboard Browser"]
        OPS_WS["WebSocket<br/>Client"]
    end

    %% Toggle controls browser connection method only
    TOGGLE -->|"Position 1"| WS_MODE
    TOGGLE -->|"Position 2"| POLL_MODE

    WS_MODE <-->|"wss://"| WS_SRV
    POLL_MODE -->|"GET every 2s"| REST

    WS_SRV --> VESSEL_STATE
    REST --> VESSEL_STATE

    %% Backend always uses MQTT regardless of toggle
    VESSEL_STATE --> MQTT_PUB
    MQTT_PUB ==>|"Always publishes<br/>(toggle irrelevant)"| BROKER
    BROKER ==> OPS_SUB
    OPS_SUB --> OPS_WS

    %% Styling
    style TOGGLE fill:#9C27B0,color:#fff
    style BROKER fill:#4CAF50,color:#fff
    style MQTT_PUB fill:#2196F3,color:#fff
    style OPS_SUB fill:#2196F3,color:#fff

    linkStyle 6,7,8 stroke:#4CAF50,stroke-width:3px
```

### Why the Misleading Name?

The toggle is labeled "MQTT" because:
- The **backend** publishes to MQTT (always, regardless of toggle)
- The **browser** never uses MQTT directly
- When you select "MQTT mode", you're really selecting "poll the REST API that reads MQTT-updated state"

| Toggle Position | Browser Behavior | Backend Behavior | Latency |
|----------------|------------------|------------------|---------|
| WebSocket | Opens WSS, receives pushes | Unchanged - publishes to MQTT | ~0ms |
| "MQTT" | Polls REST API every 2s | Unchanged - publishes to MQTT | Up to 2s |

> **Key Insight:** The toggle only affects how the **ferry dashboard browser** receives data. It has **zero effect** on the MQTT broker, ops dashboard, or any backend data routing.

## Message Flow: Complete Picture

### Control Input Round-Trip (Bidirectional Flow)

When a user adjusts a slider on the ferry dashboard, the text display doesn't update directly. Instead, it follows a **round-trip verification pattern**:

```mermaid
sequenceDiagram
    participant Slider as Slider Control
    participant Browser as Ferry Browser
    participant API as REST API
    participant State as vesselState
    participant WS as WebSocket Server
    participant MQTT as MQTT Broker
    participant OPS as Ops Dashboard

    Note over Slider,OPS: User drags RPM slider to 1500

    Slider->>Browser: oninput event fires
    Browser->>API: POST /api/override/engine/rpm<br/>{value: 1500}
    API->>State: vesselState.engine.rpm = 1500

    Note over State: publishTelemetry() called

    par Broadcast to all destinations
        State->>WS: broadcast({type: 'telemetry_update'})
        State->>MQTT: mqttClient.publishTelemetry()
    end

    WS-->>Browser: WebSocket push<br/>{type: 'telemetry_update', data: {...}}
    Browser->>Browser: updateUI()<br/>- Updates text: "1500"<br/>- Updates slider position

    MQTT-->>OPS: Message delivery
    OPS->>OPS: Update ops display
```

### Why Round-Trip Instead of Direct Update?

```mermaid
flowchart TB
    subgraph DirectUpdate["❌ Direct Update (NOT how it works)"]
        D1["User moves slider"]
        D2["JS updates text directly"]
        D3["Problem: Out of sync<br/>if server rejects value"]
        D1 --> D2 --> D3
    end

    subgraph RoundTrip["✅ Round-Trip (Actual Implementation)"]
        R1["User moves slider"]
        R2["POST to server"]
        R3["Server validates & updates state"]
        R4["Server broadcasts to ALL clients"]
        R5["Browser receives & updates UI"]
        R6["Guaranteed consistency"]
        R1 --> R2 --> R3 --> R4 --> R5 --> R6
    end

    style DirectUpdate fill:#FFEBEE
    style RoundTrip fill:#E8F5E9
```

### Complete Bidirectional Flow

```mermaid
flowchart TB
    subgraph FerryBrowser["Ferry Dashboard Browser"]
        SLIDER["Slider/Button"]
        WS_CLIENT["WebSocket Client"]
        UI["UI Display"]
    end

    subgraph FerryServer["Ferry Control Server"]
        REST_API["REST API<br/>POST /api/override/*"]
        STATE["vesselState"]
        PUBLISH["publishTelemetry()"]
        WS_SERVER["WebSocket Server"]
    end

    subgraph Backend["Backend Infrastructure"]
        MQTT_PUB["MQTT Publisher"]
        BROKER["MQTT Broker"]
        OPS_SUB["Ops Dashboard<br/>Subscriber"]
    end

    subgraph OpsDashboard["Ops Dashboard"]
        OPS_STATE["opsState"]
        OPS_WS["WebSocket to Browser"]
        OPS_BROWSER["Ops Browser"]
    end

    %% Control flow (user input)
    SLIDER -->|"1. POST request"| REST_API
    REST_API -->|"2. Update"| STATE
    STATE -->|"3. Trigger"| PUBLISH

    %% Broadcast paths
    PUBLISH -->|"4a. broadcast()"| WS_SERVER
    WS_SERVER -->|"5a. Push"| WS_CLIENT
    WS_CLIENT -->|"6a. updateUI()"| UI

    PUBLISH -->|"4b. publish()"| MQTT_PUB
    MQTT_PUB ==>|"5b. MQTT"| BROKER
    BROKER ==>|"6b. Subscribe"| OPS_SUB
    OPS_SUB -->|"7b. Update"| OPS_STATE
    OPS_STATE --> OPS_WS
    OPS_WS --> OPS_BROWSER

    %% Styling
    style STATE fill:#4CAF50,color:#fff
    style BROKER fill:#2196F3,color:#fff

    linkStyle 0,1,2 stroke:#FF9800,stroke-width:2px
    linkStyle 3,4,5 stroke:#4CAF50,stroke-width:2px
    linkStyle 6,7,8,9,10,11 stroke:#2196F3,stroke-width:2px
```

### Data Flow Summary

| Step | Component | Action | Protocol |
|------|-----------|--------|----------|
| 1 | Browser | User moves slider | - |
| 2 | Browser → Server | Send control command | HTTP POST |
| 3 | Server | Update vesselState | Internal |
| 4 | Server | Call publishTelemetry() | Internal |
| 5a | Server → Ferry Browser | Broadcast update | WebSocket |
| 5b | Server → MQTT Broker | Publish telemetry | MQTT |
| 6a | Ferry Browser | updateUI() - text + slider | JavaScript |
| 6b | MQTT Broker → Ops | Deliver message | MQTT |
| 7 | Ops Dashboard | Update display | WebSocket |

> **Key Insight:** The ferry dashboard text boxes update via **WebSocket round-trip**, not MQTT. The ferry browser does NOT subscribe to MQTT - only the ops-dashboard does. Both dashboards receive updates, but through different channels.

## Failure Modes & Recovery

### MQTT Client Recovery (ferry-control)

```mermaid
stateDiagram-v2
    [*] --> Connected: Initial connection

    Connected --> Reconnecting: Connection lost

    Reconnecting --> Connected: Reconnect success
    Reconnecting --> Reconnecting: Attempt < 10
    Reconnecting --> WaitingRecovery: Attempt >= 10

    WaitingRecovery --> Connected: Fresh connection after 60s

    note right of Connected
        ✅ Publishing telemetry
        ✅ Buffer empty
    end note

    note right of Reconnecting
        ⚠️ Messages buffered
        Max 1000 messages
        Oldest dropped when full
    end note

    note right of WaitingRecovery
        ⏸️ client.end(true) called
        ⏳ Waiting 60 seconds
        🔄 Will call setupClient()
    end note
```

### Ops Dashboard WebSocket Relay Recovery

```mermaid
stateDiagram-v2
    [*] --> Connecting: connectToFerryControl()

    Connecting --> Connected: WebSocket open
    Connecting --> Retrying: Connection failed

    Connected --> Retrying: Connection closed

    Retrying --> Connecting: After 5s delay

    note right of Connected
        ferryControlConnected: true
        Receives WS broadcasts
    end note

    note right of Retrying
        ferryControlConnected: false
        MQTT path still active!
        System continues working
    end note
```

## Health Check Endpoints

### Ferry Control: `/health`

```json
{
  "status": "healthy",
  "timestamp": "2025-12-06T05:09:33.915Z",
  "vesselId": "island-class-001",
  "mqtt": {
    "connected": true,
    "broker": "mqtt://bc-ferries-mqtt-broker.internal:1883",
    "clientId": "bc-ferries-mqtt-...",
    "reconnectAttempts": 0,
    "bufferedMessages": 0,
    "lastHeartbeat": 1764997753448
  },
  "systems": {
    "engine": "operational",
    "power": "electric",
    "safety": "normal"
  }
}
```

### Ops Dashboard: `/health`

```json
{
  "status": "healthy",
  "timestamp": "2025-12-06T05:09:44.063Z",
  "connectedVessels": 1,
  "dashboardClients": 2,
  "ferryControlConnected": false
}
```

> **Note:** `ferryControlConnected: false` refers to the WebSocket relay path only. The MQTT path is working and delivering data.

## Message Formats

### Telemetry Message

```json
{
  "vesselId": "island-class-001",
  "timestamp": "2025-12-06T10:30:00.000Z",
  "messageId": "uuid-v4",
  "location": {
    "latitude": 48.6569,
    "longitude": -123.3933,
    "heading": 45
  },
  "engine": {
    "rpm": 1200,
    "temperature": 85,
    "fuelFlow": 120
  },
  "power": {
    "batterySOC": 85,
    "mode": "hybrid",
    "generatorLoad": 45
  },
  "safety": {
    "fireAlarm": false,
    "bilgeLevel": 15,
    "co2Level": 400
  },
  "navigation": {
    "speed": 12.5,
    "route": "SWB-TSA",
    "nextWaypoint": "Active Pass"
  }
}
```

### Emergency Message

```json
{
  "id": "island-class-001_fire_1701773400000",
  "vesselId": "island-class-001",
  "alertType": "fire",
  "severity": "critical",
  "emergency": true,
  "type": "fire",
  "timestamp": "2025-12-06T10:30:00.000Z",
  "message": "Fire alarm activated - engine power reduced",
  "location": {
    "latitude": 48.6569,
    "longitude": -123.3933
  },
  "response": {
    "required": true,
    "estimated_eta": 900
  }
}
```

## Summary

```mermaid
flowchart LR
    subgraph Reality["How the System Actually Works"]
        A["Ferry Control"] ==>|"MQTT<br/>(PRIMARY)"| B["Broker"]
        B ==>|"MQTT"| C["Ops Dashboard"]
        A -.->|"WebSocket<br/>(BACKUP - offline)"| C
    end

    subgraph Browsers["Browser Connections"]
        D["Users"] -->|"WebSocket"| A
        D -->|"WebSocket"| C
    end
```

**Key Points:**

1. **MQTT is the primary path** - Both ferry-control and ops-dashboard connect to the internal Mosquitto broker
2. **WebSocket relay is backup** - The direct WebSocket connection from ops to ferry is currently disconnected, but the system works fine without it
3. **Frontend toggle is misleading** - The "MQTT" mode on the ferry dashboard is actually REST polling, not real MQTT
4. **Data flows correctly** - Ops dashboard logs show "Operational state from MQTT: ..." confirming MQTT delivery works
