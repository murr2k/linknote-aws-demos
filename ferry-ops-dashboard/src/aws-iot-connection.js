const AWS = require('aws-sdk');
const mqtt = require('mqtt');
const fs = require('fs');
const path = require('path');

// AWS IoT Configuration
const AWS_IOT_ENDPOINT = process.env.AWS_IOT_ENDPOINT;
const AWS_REGION = process.env.AWS_REGION || 'us-west-2';
const DEVICE_ID = process.env.DEVICE_ID || 'bc-ferries-bridge';
const CERTIFICATE_PATH = process.env.CERTIFICATE_PATH || './certificates';

// HiveMQ Cloud Configuration  
const HIVEMQ_HOST = process.env.HIVEMQ_HOST;
const HIVEMQ_PORT = process.env.HIVEMQ_PORT || 8883;
const HIVEMQ_USERNAME = process.env.HIVEMQ_USERNAME;
const HIVEMQ_PASSWORD = process.env.HIVEMQ_PASSWORD;

class IoTBridge {
  constructor() {
    this.awsIoTClient = null;
    this.hiveMQClient = null;
    this.isConnected = false;
    this.messageQueue = [];
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
  }

  /**
   * Initialize AWS IoT Core connection
   */
  async connectToAWSIoT() {
    try {
      const clientCert = fs.readFileSync(path.join(CERTIFICATE_PATH, 'device-certificate.pem.crt'));
      const privateKey = fs.readFileSync(path.join(CERTIFICATE_PATH, 'private.pem.key'));
      const caCert = fs.readFileSync(path.join(CERTIFICATE_PATH, 'amazon-root-ca-1.pem'));

      const connectionOptions = {
        host: AWS_IOT_ENDPOINT,
        port: 8883,
        protocol: 'mqtts',
        clientId: DEVICE_ID,
        cert: clientCert,
        key: privateKey,
        ca: caCert,
        keepalive: 60,
        clean: true,
        reconnectPeriod: 5000,
        connectTimeout: 30000,
        rejectUnauthorized: true
      };

      this.awsIoTClient = mqtt.connect(connectionOptions);
      
      this.awsIoTClient.on('connect', () => {
        console.log('✅ Connected to AWS IoT Core');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.flushMessageQueue();
      });

      this.awsIoTClient.on('error', (error) => {
        console.error('❌ AWS IoT connection error:', error);
        this.handleReconnection();
      });

      this.awsIoTClient.on('close', () => {
        console.log('⚠️ AWS IoT connection closed');
        this.isConnected = false;
        this.handleReconnection();
      });

      this.awsIoTClient.on('offline', () => {
        console.log('📡 AWS IoT client offline');
        this.isConnected = false;
      });

      return this.awsIoTClient;
    } catch (error) {
      console.error('Failed to connect to AWS IoT:', error);
      throw error;
    }
  }

  /**
   * Initialize HiveMQ Cloud connection
   */
  async connectToHiveMQ() {
    try {
      const connectionOptions = {
        host: HIVEMQ_HOST,
        port: HIVEMQ_PORT,
        protocol: 'mqtts',
        username: HIVEMQ_USERNAME,
        password: HIVEMQ_PASSWORD,
        keepalive: 60,
        clean: true,
        reconnectPeriod: 5000,
        connectTimeout: 30000,
        rejectUnauthorized: true
      };

      this.hiveMQClient = mqtt.connect(connectionOptions);

      this.hiveMQClient.on('connect', () => {
        console.log('✅ Connected to HiveMQ Cloud');
        
        // Subscribe to BC Ferries topics
        const topics = [
          'fleet/bcferries/+/telemetry',
          'fleet/bcferries/+/emergency/+',
          'fleet/bcferries/+/status'
        ];
        
        topics.forEach(topic => {
          this.hiveMQClient.subscribe(topic, { qos: 1 }, (err) => {
            if (err) {
              console.error(`Failed to subscribe to ${topic}:`, err);
            } else {
              console.log(`📡 Subscribed to ${topic}`);
            }
          });
        });
      });

      this.hiveMQClient.on('message', (topic, message) => {
        this.handleHiveMQMessage(topic, message);
      });

      this.hiveMQClient.on('error', (error) => {
        console.error('❌ HiveMQ connection error:', error);
      });

      this.hiveMQClient.on('close', () => {
        console.log('⚠️ HiveMQ connection closed');
      });

      return this.hiveMQClient;
    } catch (error) {
      console.error('Failed to connect to HiveMQ:', error);
      throw error;
    }
  }

  /**
   * Handle incoming messages from HiveMQ and bridge to AWS IoT
   */
  handleHiveMQMessage(topic, message) {
    try {
      const messageStr = message.toString();
      console.log(`📨 Received from HiveMQ - Topic: ${topic}, Message: ${messageStr}`);
      
      // Parse message
      let messageData;
      try {
        messageData = JSON.parse(messageStr);
      } catch (parseError) {
        console.error('Invalid JSON message from HiveMQ:', parseError);
        return;
      }

      // Add metadata
      const enrichedMessage = {
        ...messageData,
        originalTopic: topic,
        bridgeTimestamp: new Date().toISOString(),
        source: 'hivemq-bridge'
      };

      // Forward to AWS IoT Core
      this.publishToAWSIoT(topic, enrichedMessage);
      
      // Handle specific message types
      this.processMessageByType(topic, enrichedMessage);
      
    } catch (error) {
      console.error('Error handling HiveMQ message:', error);
    }
  }

  /**
   * Publish message to AWS IoT Core
   */
  publishToAWSIoT(topic, message) {
    if (!this.isConnected || !this.awsIoTClient) {
      console.log('⏳ Queueing message for AWS IoT (not connected)');
      this.messageQueue.push({ topic, message });
      return;
    }

    const messageStr = JSON.stringify(message);
    
    this.awsIoTClient.publish(topic, messageStr, { qos: 1 }, (error) => {
      if (error) {
        console.error(`❌ Failed to publish to AWS IoT topic ${topic}:`, error);
        // Re-queue message for retry
        this.messageQueue.push({ topic, message });
      } else {
        console.log(`✅ Published to AWS IoT - Topic: ${topic}`);
      }
    });
  }

  /**
   * Process messages by type for specific handling
   */
  processMessageByType(topic, message) {
    if (topic.includes('emergency')) {
      this.handleEmergencyMessage(topic, message);
    } else if (topic.includes('telemetry')) {
      this.handleTelemetryMessage(topic, message);
    } else if (topic.includes('status')) {
      this.handleStatusMessage(topic, message);
    }
  }

  /**
   * Handle emergency messages with high priority
   */
  handleEmergencyMessage(topic, message) {
    console.log('🚨 EMERGENCY MESSAGE:', { topic, message });
    
    // Publish to priority emergency topic in AWS IoT
    const emergencyTopic = topic.replace('fleet/bcferries/', 'emergency/bcferries/');
    this.publishToAWSIoT(emergencyTopic, {
      ...message,
      priority: 'CRITICAL',
      alertType: 'EMERGENCY'
    });
  }

  /**
   * Handle telemetry messages
   */
  handleTelemetryMessage(topic, message) {
    console.log('📊 Telemetry data received:', { 
      vesselId: message.vesselId, 
      timestamp: message.timestamp 
    });
    
    // Add telemetry processing metadata
    const processedMessage = {
      ...message,
      processed: true,
      processingTimestamp: new Date().toISOString()
    };
    
    this.publishToAWSIoT(topic, processedMessage);
  }

  /**
   * Handle status messages
   */
  handleStatusMessage(topic, message) {
    console.log('📡 Status update:', { 
      vesselId: message.vesselId, 
      status: message.status 
    });
    
    this.publishToAWSIoT(topic, message);
  }

  /**
   * Flush queued messages when connection is restored
   */
  flushMessageQueue() {
    console.log(`📤 Flushing ${this.messageQueue.length} queued messages`);
    
    while (this.messageQueue.length > 0) {
      const { topic, message } = this.messageQueue.shift();
      this.publishToAWSIoT(topic, message);
    }
  }

  /**
   * Handle reconnection attempts
   */
  handleReconnection() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      
      console.log(`🔄 Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
      
      setTimeout(() => {
        this.connectToAWSIoT().catch(console.error);
      }, delay);
    } else {
      console.error('❌ Max reconnection attempts reached');
    }
  }

  /**
   * Initialize both connections
   */
  async initialize() {
    try {
      console.log('🚀 Initializing IoT Bridge...');
      
      // Connect to both MQTT brokers in parallel
      await Promise.all([
        this.connectToAWSIoT(),
        this.connectToHiveMQ()
      ]);
      
      console.log('✅ IoT Bridge initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize IoT Bridge:', error);
      return false;
    }
  }

  /**
   * Get connection status
   */
  getStatus() {
    return {
      awsIoTConnected: this.isConnected && this.awsIoTClient?.connected,
      hiveMQConnected: this.hiveMQClient?.connected,
      queuedMessages: this.messageQueue.length,
      reconnectAttempts: this.reconnectAttempts
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log('🔌 Shutting down IoT Bridge...');
    
    if (this.awsIoTClient) {
      this.awsIoTClient.end();
    }
    
    if (this.hiveMQClient) {
      this.hiveMQClient.end();
    }
    
    console.log('✅ IoT Bridge shutdown complete');
  }
}

module.exports = IoTBridge;