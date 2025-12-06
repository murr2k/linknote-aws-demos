const mqtt = require('mqtt');
const EventEmitter = require('events');

class MQTTClient extends EventEmitter {
  constructor() {
    super();
    this.client = null;
    this.connected = false;
    this.brokerUrl = process.env.MQTT_BROKER_URL || 'wss://bc-ferries-mqtt-broker.fly.dev:443';
    this.options = {
      reconnectPeriod: 5000,
      connectTimeout: 30000,
      clean: true,
      clientId: `ops-dashboard-${Date.now()}`
    };

    // Add auth if configured
    if (process.env.MQTT_USERNAME) {
      this.options.username = process.env.MQTT_USERNAME;
      this.options.password = process.env.MQTT_PASSWORD;
    }
  }

  connect() {
    console.log(`[MQTT] Connecting to broker at ${this.brokerUrl}`);

    this.client = mqtt.connect(this.brokerUrl, this.options);

    this.client.on('connect', () => {
      console.log('[MQTT] Connected to broker');
      this.connected = true;
      this.emit('connected');

      // Subscribe to all ferry-related topics
      const topics = [
        'ferry/+/+/status/#',
        'ferry/+/+/telemetry/#',
        'operations/#',
        'alerts/#',
        'weather/#'
      ];

      topics.forEach(topic => {
        this.client.subscribe(topic, (err) => {
          if (!err) {
            console.log(`[MQTT] Subscribed to ${topic}`);
          } else {
            console.error(`[MQTT] Failed to subscribe to ${topic}:`, err);
          }
        });
      });
    });

    this.client.on('message', (topic, message) => {
      try {
        const payload = JSON.parse(message.toString());
        this.emit('message', { topic, payload, timestamp: new Date() });

        // Parse vessel updates
        if (topic.startsWith('ferry/vessel/')) {
          const parts = topic.split('/');
          const vesselId = parts[2];
          const category = parts[3];
          const component = parts[4];

          // Handle systems status which contains full telemetry
          if (category === 'status' && component === 'systems' && payload.systems) {
            // Extract full telemetry from systems message
            const telemetryData = {
              vesselId,
              ...payload,
              // Flatten systems data for easier access
              engine: payload.systems.engine,
              power: payload.systems.power,
              safety: payload.systems.safety,
              navigation: payload.navigation || {},
              location: payload.location || {}
            };

            this.emit('vessel-update', {
              vesselId,
              category: 'telemetry',
              data: telemetryData,
              timestamp: new Date()
            });
          } else {
            // Regular vessel update
            this.emit('vessel-update', {
              vesselId,
              category,
              data: payload,
              timestamp: new Date()
            });
          }
        }

        // Parse alerts
        if (topic.startsWith('alerts/')) {
          this.emit('alert', {
            ...payload,
            topic,
            timestamp: new Date()
          });
        }

        // Parse operations updates
        if (topic.startsWith('operations/')) {
          this.emit('operations-update', {
            topic,
            data: payload,
            timestamp: new Date()
          });
        }

        // Parse weather updates
        if (topic.startsWith('weather/')) {
          this.emit('weather-update', {
            data: payload,
            timestamp: new Date()
          });
        }

      } catch (error) {
        console.error(`[MQTT] Error parsing message from ${topic}:`, error);
      }
    });

    this.client.on('error', (err) => {
      console.error('[MQTT] Connection error:', err);
      this.connected = false;
      this.emit('error', err);
    });

    this.client.on('close', () => {
      console.log('[MQTT] Connection closed');
      this.connected = false;
      this.emit('disconnected');
    });

    this.client.on('reconnect', () => {
      console.log('[MQTT] Attempting to reconnect...');
      this.emit('reconnecting');
    });
  }

  publish(topic, data) {
    if (!this.connected) {
      console.error('[MQTT] Cannot publish - not connected');
      return false;
    }

    try {
      const message = typeof data === 'string' ? data : JSON.stringify(data);
      this.client.publish(topic, message, { qos: 1 });
      return true;
    } catch (error) {
      console.error('[MQTT] Publish error:', error);
      return false;
    }
  }

  disconnect() {
    if (this.client) {
      this.client.end();
      this.connected = false;
    }
  }

  isConnected() {
    return this.connected;
  }
}

module.exports = MQTTClient;