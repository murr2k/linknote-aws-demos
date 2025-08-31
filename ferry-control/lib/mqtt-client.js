const mqtt = require('mqtt');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

class MQTTClient {
  constructor(config = {}) {
    this.config = this.loadConfig(config);
    this.client = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.messageBuffer = new Map();
    this.heartbeatInterval = null;
    this.lastHeartbeat = null;
    
    this.setupClient();
  }

  loadConfig(overrides = {}) {
    try {
      const configPath = path.join(__dirname, '../config/mqtt-config.json');
      const defaultConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      
      // Override with environment variables
      if (process.env.HIVEMQ_CLUSTER_URL) {
        defaultConfig.hivemq.broker.url = process.env.HIVEMQ_CLUSTER_URL;
      }
      if (process.env.HIVEMQ_USERNAME) {
        defaultConfig.hivemq.authentication.username = process.env.HIVEMQ_USERNAME;
      }
      if (process.env.HIVEMQ_PASSWORD) {
        defaultConfig.hivemq.authentication.password = process.env.HIVEMQ_PASSWORD;
      }
      
      return { ...defaultConfig, ...overrides };
    } catch (error) {
      console.error('Failed to load MQTT configuration:', error.message);
      return this.getDefaultConfig();
    }
  }

  getDefaultConfig() {
    return {
      hivemq: {
        broker: {
          url: 'cluster-url.hivemq.cloud',
          port: 8883,
          protocol: 'mqtts',
          secure: true
        },
        authentication: {
          username: 'demo-user',
          password: 'demo-password',
          clientIdPrefix: 'bc-ferries'
        },
        options: {
          keepalive: 60,
          clean: true,
          reconnectPeriod: 5000,
          connectTimeout: 30000,
          rejectUnauthorized: true,
          protocolVersion: 5
        }
      },
      topics: {
        telemetry: {
          pattern: 'fleet/bcferries/{vesselId}/telemetry',
          qos: 1
        },
        emergency: {
          pattern: 'fleet/bcferries/{vesselId}/emergency/{type}',
          qos: 2
        }
      },
      quality: {
        maxRetries: 3,
        messageExpiry: 300
      }
    };
  }

  setupClient() {
    const { broker, authentication, options } = this.config.hivemq;
    
    const clientId = `${authentication.clientIdPrefix}-${uuidv4()}`;
    const brokerUrl = `${broker.protocol}://${broker.url}:${broker.port}`;
    
    const connectOptions = {
      clientId,
      username: authentication.username,
      password: authentication.password,
      ...options
    };

    console.log(`🔗 Connecting to HiveMQ Cloud: ${brokerUrl}`);
    console.log(`🆔 Client ID: ${clientId}`);
    
    this.client = mqtt.connect(brokerUrl, connectOptions);
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.client.on('connect', () => {
      console.log('✅ Successfully connected to HiveMQ Cloud MQTT broker');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.startHeartbeat();
      this.flushMessageBuffer();
    });

    this.client.on('reconnect', () => {
      this.reconnectAttempts++;
      console.log(`🔄 Reconnecting to MQTT broker (attempt ${this.reconnectAttempts})`);
      
      if (this.reconnectAttempts > this.maxReconnectAttempts) {
        console.error('❌ Max reconnection attempts reached. Stopping reconnection.');
        this.client.end(true);
      }
    });

    this.client.on('close', () => {
      console.log('📡 MQTT connection closed');
      this.isConnected = false;
      this.stopHeartbeat();
    });

    this.client.on('error', (error) => {
      console.error('🚨 MQTT connection error:', {
        message: error.message,
        code: error.code,
        timestamp: new Date().toISOString()
      });
      
      // Handle specific error types
      if (error.code === 'ENOTFOUND') {
        console.error('❌ DNS resolution failed. Check HiveMQ cluster URL.');
      } else if (error.code === 'ECONNREFUSED') {
        console.error('❌ Connection refused. Check port and firewall settings.');
      } else if (error.message.includes('Not authorized')) {
        console.error('❌ Authentication failed. Check username and password.');
      }
      
      this.isConnected = false;
    });

    this.client.on('offline', () => {
      console.log('📴 MQTT client is offline');
      this.isConnected = false;
    });

    this.client.on('message', (topic, message) => {
      this.handleIncomingMessage(topic, message);
    });
  }

  handleIncomingMessage(topic, message) {
    try {
      const payload = JSON.parse(message.toString());
      console.log(`📨 Received message on ${topic}:`, payload);
      
      // Handle different message types
      if (topic.includes('/control/')) {
        this.handleControlMessage(topic, payload);
      } else if (topic.includes('/status/')) {
        this.handleStatusMessage(topic, payload);
      }
    } catch (error) {
      console.error('Failed to parse incoming message:', error.message);
    }
  }

  handleControlMessage(topic, payload) {
    // Extract vessel ID and control command from topic
    const parts = topic.split('/');
    const vesselId = parts[2];
    const system = parts[4];
    const action = parts[5];
    
    console.log(`🎛️ Control command for ${vesselId}: ${system}/${action}`, payload);
    // Emit event for the application to handle
    this.emit('control', { vesselId, system, action, payload });
  }

  handleStatusMessage(topic, payload) {
    console.log(`📊 Status update:`, { topic, payload });
    this.emit('status', { topic, payload });
  }

  publishTelemetry(vesselId, telemetryData) {
    const topic = this.config.topics.telemetry.pattern.replace('{vesselId}', vesselId);
    const qos = this.config.topics.telemetry.qos;
    
    const message = {
      ...telemetryData,
      vesselId,
      timestamp: new Date().toISOString(),
      messageId: uuidv4()
    };

    return this.publish(topic, message, { qos });
  }

  publishEmergency(vesselId, emergencyType, emergencyData) {
    const topic = this.config.topics.emergency.pattern
      .replace('{vesselId}', vesselId)
      .replace('{type}', emergencyType);
    const qos = this.config.topics.emergency.qos;
    
    const message = {
      ...emergencyData,
      vesselId,
      emergency: true,
      type: emergencyType,
      timestamp: new Date().toISOString(),
      messageId: uuidv4()
    };

    return this.publish(topic, message, { qos });
  }

  publishStatus(vesselId, component, statusData) {
    const topic = this.config.topics.status.pattern
      .replace('{vesselId}', vesselId)
      .replace('{component}', component);
    const qos = this.config.topics.status.qos;
    const retain = this.config.topics.status.retain;
    
    const message = {
      ...statusData,
      vesselId,
      component,
      timestamp: new Date().toISOString()
    };

    return this.publish(topic, message, { qos, retain });
  }

  publish(topic, message, options = {}) {
    return new Promise((resolve, reject) => {
      const messageStr = JSON.stringify(message);
      const publishOptions = {
        qos: options.qos || 0,
        retain: options.retain || false,
        ...options
      };

      if (!this.isConnected) {
        // Buffer message for later delivery
        const bufferedMessage = {
          topic,
          message: messageStr,
          options: publishOptions,
          timestamp: Date.now()
        };
        
        this.messageBuffer.set(uuidv4(), bufferedMessage);
        console.log(`📦 Message buffered (not connected): ${topic}`);
        resolve({ buffered: true });
        return;
      }

      this.client.publish(topic, messageStr, publishOptions, (error) => {
        if (error) {
          console.error(`❌ Failed to publish to ${topic}:`, error.message);
          reject(error);
        } else {
          console.log(`✅ Published to ${topic}`, {
            qos: publishOptions.qos,
            retain: publishOptions.retain,
            messageSize: messageStr.length
          });
          resolve({ published: true });
        }
      });
    });
  }

  subscribe(topic, qos = 0) {
    return new Promise((resolve, reject) => {
      if (!this.isConnected) {
        reject(new Error('MQTT client not connected'));
        return;
      }

      this.client.subscribe(topic, { qos }, (error) => {
        if (error) {
          console.error(`❌ Failed to subscribe to ${topic}:`, error.message);
          reject(error);
        } else {
          console.log(`✅ Subscribed to ${topic} (QoS ${qos})`);
          resolve({ subscribed: true });
        }
      });
    });
  }

  flushMessageBuffer() {
    if (this.messageBuffer.size === 0) return;
    
    console.log(`📤 Flushing ${this.messageBuffer.size} buffered messages`);
    
    for (const [id, bufferedMessage] of this.messageBuffer) {
      const { topic, message, options } = bufferedMessage;
      
      this.client.publish(topic, message, options, (error) => {
        if (error) {
          console.error(`❌ Failed to flush message ${id}:`, error.message);
        } else {
          console.log(`✅ Flushed buffered message to ${topic}`);
        }
      });
    }
    
    this.messageBuffer.clear();
  }

  startHeartbeat() {
    const heartbeatConfig = this.config.topics.heartbeat;
    if (!heartbeatConfig || !heartbeatConfig.interval) return;
    
    this.heartbeatInterval = setInterval(() => {
      const vesselId = 'control-system'; // Could be dynamic
      const topic = heartbeatConfig.pattern.replace('{vesselId}', vesselId);
      
      const heartbeat = {
        timestamp: new Date().toISOString(),
        status: 'online',
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage()
      };
      
      this.publish(topic, heartbeat, { qos: heartbeatConfig.qos });
      this.lastHeartbeat = Date.now();
    }, heartbeatConfig.interval);
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  getConnectionInfo() {
    return {
      connected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      bufferedMessages: this.messageBuffer.size,
      lastHeartbeat: this.lastHeartbeat,
      clientId: this.client?.options?.clientId,
      broker: `${this.config.hivemq.broker.protocol}://${this.config.hivemq.broker.url}:${this.config.hivemq.broker.port}`
    };
  }

  disconnect() {
    console.log('🔌 Disconnecting from MQTT broker...');
    this.stopHeartbeat();
    
    if (this.client) {
      this.client.end(true);
    }
    
    this.isConnected = false;
  }

  // Event emitter functionality
  emit(event, data) {
    if (this.listeners && this.listeners[event]) {
      this.listeners[event].forEach(callback => callback(data));
    }
  }

  on(event, callback) {
    if (!this.listeners) this.listeners = {};
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  off(event, callback) {
    if (this.listeners && this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }
  }
}

module.exports = MQTTClient;