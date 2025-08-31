#!/usr/bin/env node

const IoTBridge = require('./aws-iot-connection');
const IoTMessageProcessor = require('./iot-message-processor');
const express = require('express');
const WebSocket = require('ws');

/**
 * IoT Bridge Service - Standalone service for bridging HiveMQ to AWS IoT Core
 */
class IoTBridgeService {
  constructor() {
    this.bridge = new IoTBridge();
    this.processor = new IoTMessageProcessor();
    this.app = express();
    this.server = null;
    this.wss = null;
    this.port = process.env.IOT_BRIDGE_PORT || 8082;
    this.status = {
      started: false,
      awsConnected: false,
      hivemqConnected: false,
      messagesProcessed: 0,
      alertsGenerated: 0,
      errors: 0,
      lastActivity: null
    };
  }

  /**
   * Initialize the IoT Bridge Service
   */
  async initialize() {
    try {
      console.log('🚀 Initializing BC Ferries IoT Bridge Service...');
      
      // Setup Express app
      this.setupExpressApp();
      
      // Setup WebSocket server for monitoring
      this.setupWebSocketServer();
      
      // Initialize IoT connections
      await this.initializeConnections();
      
      // Setup message handling
      this.setupMessageHandling();
      
      // Start HTTP server
      this.startServer();
      
      // Setup graceful shutdown
      this.setupGracefulShutdown();
      
      this.status.started = true;
      console.log('✅ IoT Bridge Service initialized successfully');
      
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize IoT Bridge Service:', error);
      throw error;
    }
  }

  /**
   * Setup Express application
   */
  setupExpressApp() {
    this.app.use(express.json());
    
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      const bridgeStatus = this.bridge.getStatus();
      const health = {
        service: 'bc-ferries-iot-bridge',
        status: this.status.started ? 'running' : 'stopped',
        timestamp: new Date().toISOString(),
        connections: {
          awsIoT: bridgeStatus.awsIoTConnected,
          hivemq: bridgeStatus.hiveMQConnected
        },
        metrics: {
          messagesProcessed: this.status.messagesProcessed,
          alertsGenerated: this.status.alertsGenerated,
          errors: this.status.errors,
          queuedMessages: bridgeStatus.queuedMessages
        },
        lastActivity: this.status.lastActivity
      };
      
      const statusCode = health.connections.awsIoT && health.connections.hivemq ? 200 : 503;
      res.status(statusCode).json(health);
    });
    
    // Status endpoint
    this.app.get('/status', (req, res) => {
      res.json({
        bridge: this.bridge.getStatus(),
        service: this.status
      });
    });
    
    // Metrics endpoint
    this.app.get('/metrics', (req, res) => {
      res.json({
        timestamp: new Date().toISOString(),
        messagesProcessed: this.status.messagesProcessed,
        alertsGenerated: this.status.alertsGenerated,
        errors: this.status.errors,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        connections: this.bridge.getStatus()
      });
    });
    
    // Test message endpoint
    this.app.post('/test/message', async (req, res) => {
      try {
        const { topic, message } = req.body;
        
        if (!topic || !message) {
          return res.status(400).json({
            error: 'Missing topic or message in request body'
          });
        }
        
        // Process test message
        const result = await this.processor.processMessage(topic, message);
        
        res.json({
          success: true,
          topic,
          processed: result,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });
  }

  /**
   * Setup WebSocket server for real-time monitoring
   */
  setupWebSocketServer() {
    this.server = require('http').createServer(this.app);
    this.wss = new WebSocket.Server({ server: this.server });
    
    this.wss.on('connection', (ws) => {
      console.log('📊 Monitoring client connected');
      
      // Send initial status
      ws.send(JSON.stringify({
        type: 'status',
        data: {
          bridge: this.bridge.getStatus(),
          service: this.status
        }
      }));
      
      // Setup heartbeat
      const heartbeat = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'heartbeat',
            timestamp: new Date().toISOString()
          }));
        }
      }, 30000);
      
      ws.on('close', () => {
        console.log('📊 Monitoring client disconnected');
        clearInterval(heartbeat);
      });
      
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMonitoringMessage(ws, message);
        } catch (error) {
          console.error('Error parsing monitoring message:', error);
        }
      });
    });
  }

  /**
   * Handle monitoring WebSocket messages
   */
  handleMonitoringMessage(ws, message) {
    switch (message.type) {
      case 'get_status':
        ws.send(JSON.stringify({
          type: 'status',
          data: {
            bridge: this.bridge.getStatus(),
            service: this.status
          }
        }));
        break;
      case 'get_metrics':
        ws.send(JSON.stringify({
          type: 'metrics',
          data: {
            messagesProcessed: this.status.messagesProcessed,
            alertsGenerated: this.status.alertsGenerated,
            errors: this.status.errors,
            uptime: process.uptime()
          }
        }));
        break;
    }
  }

  /**
   * Initialize IoT connections
   */
  async initializeConnections() {
    console.log('🔌 Initializing IoT connections...');
    
    try {
      await this.bridge.initialize();
      this.status.awsConnected = this.bridge.getStatus().awsIoTConnected;
      this.status.hivemqConnected = this.bridge.getStatus().hiveMQConnected;
    } catch (error) {
      console.error('❌ Failed to initialize connections:', error);
      throw error;
    }
  }

  /**
   * Setup message handling between bridge and processor
   */
  setupMessageHandling() {
    // Override the bridge's message handling to include processing
    const originalHandler = this.bridge.handleHiveMQMessage.bind(this.bridge);
    
    this.bridge.handleHiveMQMessage = async (topic, message) => {
      try {
        // Call original bridge handler
        originalHandler(topic, message);
        
        // Process message
        const messageData = JSON.parse(message.toString());
        const result = await this.processor.processMessage(topic, messageData);
        
        // Update metrics
        this.status.messagesProcessed++;
        this.status.lastActivity = new Date().toISOString();
        
        if (result.alertsGenerated > 0) {
          this.status.alertsGenerated += result.alertsGenerated;
        }
        
        // Broadcast to monitoring clients
        this.broadcastToMonitoringClients({
          type: 'message_processed',
          data: {
            topic,
            vesselId: messageData.vesselId,
            timestamp: new Date().toISOString(),
            alertsGenerated: result.alertsGenerated || 0
          }
        });
        
      } catch (error) {
        console.error('❌ Error in message handling:', error);
        this.status.errors++;
        
        this.broadcastToMonitoringClients({
          type: 'error',
          data: {
            topic,
            error: error.message,
            timestamp: new Date().toISOString()
          }
        });
      }
    };
  }

  /**
   * Broadcast message to all monitoring clients
   */
  broadcastToMonitoringClients(message) {
    const messageStr = JSON.stringify(message);
    this.wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageStr);
      }
    });
  }

  /**
   * Start HTTP server
   */
  startServer() {
    this.server.listen(this.port, () => {
      console.log(`🌐 IoT Bridge Service running on port ${this.port}`);
      console.log(`📊 Health check: http://localhost:${this.port}/health`);
      console.log(`📈 Metrics: http://localhost:${this.port}/metrics`);
      console.log(`🔍 Status: http://localhost:${this.port}/status`);
    });
  }

  /**
   * Setup graceful shutdown
   */
  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
      
      // Close WebSocket server
      if (this.wss) {
        this.wss.close();
      }
      
      // Close HTTP server
      if (this.server) {
        this.server.close();
      }
      
      // Shutdown bridge connections
      await this.bridge.shutdown();
      
      console.log('✅ IoT Bridge Service shutdown complete');
      process.exit(0);
    };
    
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }

  /**
   * Get service status
   */
  getServiceStatus() {
    return {
      service: this.status,
      bridge: this.bridge.getStatus(),
      uptime: process.uptime(),
      memory: process.memoryUsage()
    };
  }
}

// Start service if run directly
async function main() {
  try {
    const service = new IoTBridgeService();
    await service.initialize();
    
    console.log('\n🎉 BC Ferries IoT Bridge Service is ready!');
    console.log('==========================================');
    console.log('📡 Bridging HiveMQ Cloud ↔ AWS IoT Core');
    console.log('🔄 Processing telemetry and emergency messages');
    console.log('📊 Real-time monitoring available via WebSocket');
    console.log('🚨 Automated alert generation and routing');
    
  } catch (error) {
    console.error('❌ Failed to start IoT Bridge Service:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  // Load environment variables
  require('dotenv').config({ path: '.env.iot' });
  main();
}

module.exports = IoTBridgeService;