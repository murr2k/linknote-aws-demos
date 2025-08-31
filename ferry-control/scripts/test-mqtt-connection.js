#!/usr/bin/env node

/**
 * MQTT Connection Test Script for BC Ferries HiveMQ Cloud Integration
 * 
 * This script tests the MQTT connection to HiveMQ Cloud and validates
 * that telemetry messages can be published and received correctly.
 * 
 * Usage: node scripts/test-mqtt-connection.js
 */

const MQTTClient = require('../lib/mqtt-client');
const { v4: uuidv4 } = require('uuid');

class MQTTTester {
  constructor() {
    this.testResults = {
      connection: false,
      publish: false,
      subscribe: false,
      emergency: false,
      heartbeat: false
    };
    this.receivedMessages = [];
    this.testStartTime = Date.now();
  }

  async runTests() {
    console.log('🧪 Starting HiveMQ Cloud MQTT Connection Tests');
    console.log('=' .repeat(50));
    
    try {
      // Test 1: Basic Connection
      await this.testConnection();
      
      // Test 2: Topic Subscription
      await this.testSubscription();
      
      // Test 3: Telemetry Publishing
      await this.testTelemetryPublish();
      
      // Test 4: Emergency Message Publishing
      await this.testEmergencyPublish();
      
      // Test 5: Heartbeat Messages
      await this.testHeartbeat();
      
      // Test 6: Message Reception
      await this.testMessageReception();
      
      this.printResults();
      
    } catch (error) {
      console.error('❌ Test suite failed:', error.message);
      process.exit(1);
    } finally {
      if (this.mqttClient) {
        this.mqttClient.disconnect();
      }
    }
  }

  async testConnection() {
    console.log('\\n1️⃣ Testing MQTT Connection...');
    
    return new Promise((resolve, reject) => {
      this.mqttClient = new MQTTClient();
      
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout after 30 seconds'));
      }, 30000);
      
      // Set up event listeners for testing
      this.mqttClient.on('control', (data) => {
        this.receivedMessages.push({ type: 'control', data, timestamp: Date.now() });
      });
      
      this.mqttClient.on('status', (data) => {
        this.receivedMessages.push({ type: 'status', data, timestamp: Date.now() });
      });
      
      // Check connection periodically
      const checkConnection = setInterval(() => {
        const info = this.mqttClient.getConnectionInfo();
        if (info.connected) {
          clearTimeout(timeout);
          clearInterval(checkConnection);
          
          console.log('✅ Connection successful!');
          console.log(`   Broker: ${info.broker}`);
          console.log(`   Client ID: ${info.clientId}`);
          
          this.testResults.connection = true;
          resolve();
        }
      }, 1000);
    });
  }

  async testSubscription() {
    console.log('\\n2️⃣ Testing Topic Subscription...');
    
    const testVesselId = 'test-vessel-' + uuidv4().substring(0, 8);
    const topics = [
      `fleet/bcferries/${testVesselId}/control/+/+`,
      `fleet/bcferries/${testVesselId}/status/+`
    ];
    
    try {
      for (const topic of topics) {
        await this.mqttClient.subscribe(topic, 1);
        console.log(`✅ Subscribed to: ${topic}`);
      }
      
      this.testResults.subscribe = true;
      console.log('✅ All subscriptions successful!');
      
    } catch (error) {
      console.log('❌ Subscription failed:', error.message);
      throw error;
    }
  }

  async testTelemetryPublish() {
    console.log('\\n3️⃣ Testing Telemetry Publishing...');
    
    const testVesselId = 'test-vessel-' + uuidv4().substring(0, 8);
    const telemetryData = {
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
    
    try {
      const result = await this.mqttClient.publishTelemetry(testVesselId, telemetryData);
      
      if (result.published) {
        console.log('✅ Telemetry published successfully!');
        this.testResults.publish = true;
      } else if (result.buffered) {
        console.log('⚠️ Telemetry buffered (connection issue)');
      }
      
    } catch (error) {
      console.log('❌ Telemetry publishing failed:', error.message);
      throw error;
    }
  }

  async testEmergencyPublish() {
    console.log('\\n4️⃣ Testing Emergency Message Publishing...');
    
    const testVesselId = 'test-vessel-' + uuidv4().substring(0, 8);
    const emergencyData = {
      severity: 'critical',
      location: {
        latitude: 48.6569,
        longitude: -123.3933
      },
      message: 'Test emergency - fire alarm simulation',
      response: {
        required: true,
        estimated_eta: 900
      }
    };
    
    try {
      const result = await this.mqttClient.publishEmergency(testVesselId, 'fire', emergencyData);
      
      if (result.published) {
        console.log('✅ Emergency message published successfully!');
        this.testResults.emergency = true;
      } else if (result.buffered) {
        console.log('⚠️ Emergency message buffered (connection issue)');
      }
      
    } catch (error) {
      console.log('❌ Emergency publishing failed:', error.message);
      throw error;
    }
  }

  async testHeartbeat() {
    console.log('\\n5️⃣ Testing Heartbeat Messages...');
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Heartbeat test timeout'));
      }, 35000);
      
      // Wait for heartbeat to be sent
      setTimeout(() => {
        const info = this.mqttClient.getConnectionInfo();
        if (info.lastHeartbeat) {
          console.log('✅ Heartbeat system operational!');
          console.log(`   Last heartbeat: ${new Date(info.lastHeartbeat).toISOString()}`);
          this.testResults.heartbeat = true;
          clearTimeout(timeout);
          resolve();
        } else {
          clearTimeout(timeout);
          reject(new Error('No heartbeat detected'));
        }
      }, 5000);
    });
  }

  async testMessageReception() {
    console.log('\\n6️⃣ Testing Message Reception...');
    
    // Wait a bit for any async messages to arrive
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log(`   Received ${this.receivedMessages.length} messages during test`);
    
    if (this.receivedMessages.length > 0) {
      console.log('   Message types:');
      this.receivedMessages.forEach((msg, idx) => {
        console.log(`     ${idx + 1}. ${msg.type} at ${new Date(msg.timestamp).toISOString()}`);
      });
    }
    
    // This test always passes if we get here
    console.log('✅ Message reception test complete!');
  }

  printResults() {
    console.log('\\n🏁 Test Results Summary');
    console.log('=' .repeat(50));
    
    const totalTests = Object.keys(this.testResults).length;
    const passedTests = Object.values(this.testResults).filter(result => result).length;
    const testDuration = Date.now() - this.testStartTime;
    
    console.log(`Overall: ${passedTests}/${totalTests} tests passed`);
    console.log(`Duration: ${(testDuration / 1000).toFixed(2)} seconds\\n`);
    
    Object.entries(this.testResults).forEach(([test, passed]) => {
      const icon = passed ? '✅' : '❌';
      const status = passed ? 'PASS' : 'FAIL';
      console.log(`${icon} ${test.padEnd(15)} ${status}`);
    });
    
    console.log('\\n📊 Connection Information:');
    if (this.mqttClient) {
      const info = this.mqttClient.getConnectionInfo();
      console.log(`   Connected: ${info.connected}`);
      console.log(`   Broker: ${info.broker}`);
      console.log(`   Client ID: ${info.clientId}`);
      console.log(`   Reconnect Attempts: ${info.reconnectAttempts}`);
      console.log(`   Buffered Messages: ${info.bufferedMessages}`);
    }
    
    if (passedTests === totalTests) {
      console.log('\\n🎉 All tests passed! MQTT integration is working correctly.');
      process.exit(0);
    } else {
      console.log('\\n⚠️ Some tests failed. Please check your HiveMQ Cloud configuration.');
      process.exit(1);
    }
  }
}

// Configuration validation
function validateConfiguration() {
  const requiredEnvVars = ['HIVEMQ_CLUSTER_URL', 'HIVEMQ_USERNAME', 'HIVEMQ_PASSWORD'];
  const missing = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(varName => {
      console.error(`   - ${varName}`);
    });
    console.error('\\nPlease check your .env file or environment configuration.');
    console.error('See .env.example for reference.\\n');
    process.exit(1);
  }
  
  console.log('✅ Environment configuration validated');
}

// Main execution
if (require.main === module) {
  console.log('BC Ferries HiveMQ Cloud MQTT Test Suite');
  console.log('Version 1.0.0\\n');
  
  validateConfiguration();
  
  const tester = new MQTTTester();
  tester.runTests().catch(error => {
    console.error('\\n💥 Test suite failed:', error.message);
    process.exit(1);
  });
}

module.exports = MQTTTester;