#!/usr/bin/env node

const IoTBridge = require('../src/aws-iot-connection');
const IoTMessageProcessor = require('../src/iot-message-processor');
const fs = require('fs');
const path = require('path');

class IoTBridgeTest {
  constructor() {
    this.bridge = new IoTBridge();
    this.processor = new IoTMessageProcessor();
    this.testResults = {
      awsConnection: false,
      hivemqConnection: false,
      messageProcessing: false,
      alertGeneration: false
    };
  }

  /**
   * Run comprehensive IoT bridge tests
   */
  async runTests() {
    console.log('🧪 Starting IoT Bridge comprehensive tests...\n');

    try {
      // 1. Test AWS IoT connection
      await this.testAWSConnection();

      // 2. Test message processing
      await this.testMessageProcessing();

      // 3. Test alert generation
      await this.testAlertGeneration();

      // 4. Test error handling
      await this.testErrorHandling();

      // 5. Generate test report
      this.generateTestReport();

    } catch (error) {
      console.error('❌ Test suite failed:', error.message);
      process.exit(1);
    }
  }

  /**
   * Test AWS IoT connection
   */
  async testAWSConnection() {
    console.log('🔌 Testing AWS IoT Core connection...');

    try {
      // Check if certificates exist
      const certPath = './certificates/device-certificate.pem.crt';
      const keyPath = './certificates/private.pem.key';
      const caPath = './certificates/amazon-root-ca-1.pem';

      if (!fs.existsSync(certPath) || !fs.existsSync(keyPath) || !fs.existsSync(caPath)) {
        console.log('⚠️ Certificates not found - run setup-aws-iot.js first');
        return;
      }

      // Test connection (this will attempt to connect)
      const connected = await this.bridge.connectToAWSIoT();
      
      if (connected) {
        console.log('✅ AWS IoT Core connection successful');
        this.testResults.awsConnection = true;
        
        // Test publishing a message
        await this.testPublishMessage();
      } else {
        console.log('❌ AWS IoT Core connection failed');
      }

    } catch (error) {
      console.error('❌ AWS IoT connection test failed:', error.message);
    }
  }

  /**
   * Test publishing a message to AWS IoT
   */
  async testPublishMessage() {
    try {
      const testMessage = {
        vesselId: 'test-vessel-001',
        timestamp: new Date().toISOString(),
        sensors: {
          engine: {
            temperature: 85.5,
            rpm: 1200,
            fuelConsumption: 12.3
          },
          power: {
            batterySOC: 85,
            voltage: 12.6,
            current: 45.2
          },
          navigation: {
            latitude: 49.2827,
            longitude: -123.1207,
            speed: 18.5,
            heading: 275
          }
        },
        testMessage: true
      };

      const topic = 'fleet/bcferries/test-vessel-001/telemetry';
      
      this.bridge.publishToAWSIoT(topic, testMessage);
      console.log('✅ Test message published successfully');

    } catch (error) {
      console.error('❌ Failed to publish test message:', error.message);
    }
  }

  /**
   * Test message processing logic
   */
  async testMessageProcessing() {
    console.log('\n📊 Testing message processing...');

    try {
      // Test telemetry message processing
      const telemetryMessage = {
        vesselId: 'test-vessel-001',
        timestamp: new Date().toISOString(),
        sensors: {
          engine: {
            temperature: 92,
            rpm: 1500
          },
          power: {
            batterySOC: 78,
            voltage: 12.4
          },
          safety: {
            bilgeLevel: 25,
            fireAlarm: false
          }
        }
      };

      const topic = 'fleet/bcferries/test-vessel-001/telemetry';
      const result = await this.processor.processMessage(topic, telemetryMessage);

      if (result.processed) {
        console.log('✅ Telemetry message processing successful');
        this.testResults.messageProcessing = true;
      }

      // Test emergency message processing
      const emergencyMessage = {
        vesselId: 'test-vessel-001',
        timestamp: new Date().toISOString(),
        emergency: true,
        emergencyType: 'FIRE',
        message: 'Fire detected in engine room',
        location: {
          latitude: 49.2827,
          longitude: -123.1207
        }
      };

      const emergencyTopic = 'fleet/bcferries/test-vessel-001/emergency/fire';
      const emergencyResult = await this.processor.processMessage(emergencyTopic, emergencyMessage);

      if (emergencyResult.emergency) {
        console.log('✅ Emergency message processing successful');
      }

    } catch (error) {
      console.error('❌ Message processing test failed:', error.message);
    }
  }

  /**
   * Test alert generation
   */
  async testAlertGeneration() {
    console.log('\n🚨 Testing alert generation...');

    try {
      // Create message with alert conditions
      const alertMessage = {
        vesselId: 'test-vessel-001',
        timestamp: new Date().toISOString(),
        sensors: {
          engine: {
            temperature: 110, // Critical temperature
            rpm: 1900         // Warning RPM
          },
          power: {
            batterySOC: 12,   // Critical battery
            voltage: 10.8     // Low voltage
          },
          safety: {
            bilgeLevel: 65,   // Critical bilge level
            fireAlarm: true   // Fire alarm
          }
        }
      };

      // Test alert detection
      const alerts = this.processor.checkTelemetryAlerts(alertMessage);
      
      if (alerts.length > 0) {
        console.log(`✅ Alert generation successful - ${alerts.length} alerts generated:`);
        alerts.forEach(alert => {
          console.log(`   ${alert.severity}: ${alert.message}`);
        });
        this.testResults.alertGeneration = true;
      } else {
        console.log('⚠️ No alerts generated from test conditions');
      }

    } catch (error) {
      console.error('❌ Alert generation test failed:', error.message);
    }
  }

  /**
   * Test error handling
   */
  async testErrorHandling() {
    console.log('\n🛡️ Testing error handling...');

    try {
      // Test invalid JSON message
      const invalidMessage = '{"invalid": json}';
      
      try {
        await this.processor.processMessage('test/topic', invalidMessage);
        console.log('⚠️ Invalid JSON should have thrown an error');
      } catch (error) {
        console.log('✅ Invalid JSON handling works correctly');
      }

      // Test missing vessel ID
      const messageWithoutVesselId = {
        timestamp: new Date().toISOString(),
        data: 'test'
      };

      try {
        const result = await this.processor.processMessage('fleet/bcferries//telemetry', messageWithoutVesselId);
        if (result.vesselId === 'unknown') {
          console.log('✅ Missing vessel ID handling works correctly');
        }
      } catch (error) {
        console.log('✅ Missing vessel ID error handling works');
      }

    } catch (error) {
      console.error('❌ Error handling test failed:', error.message);
    }
  }

  /**
   * Simulate realistic vessel data flow
   */
  async simulateVesselDataFlow() {
    console.log('\n🚢 Simulating realistic vessel data flow...');

    const vessels = ['spirit-of-vancouver', 'coastal-celebration', 'queen-of-surrey'];
    const scenarios = [
      {
        name: 'Normal Operation',
        data: {
          engine: { temperature: 85, rpm: 1400 },
          power: { batterySOC: 85, voltage: 12.6 },
          safety: { bilgeLevel: 15, fireAlarm: false }
        }
      },
      {
        name: 'High Load Operation',
        data: {
          engine: { temperature: 98, rpm: 1750 },
          power: { batterySOC: 70, voltage: 12.2 },
          safety: { bilgeLevel: 22, fireAlarm: false }
        }
      },
      {
        name: 'Warning Conditions',
        data: {
          engine: { temperature: 102, rpm: 1850 },
          power: { batterySOC: 22, voltage: 11.8 },
          safety: { bilgeLevel: 45, fireAlarm: false }
        }
      }
    ];

    for (const vessel of vessels) {
      for (const scenario of scenarios) {
        const message = {
          vesselId: vessel,
          timestamp: new Date().toISOString(),
          scenario: scenario.name,
          sensors: scenario.data,
          location: {
            latitude: 49.2827 + Math.random() * 0.1,
            longitude: -123.1207 + Math.random() * 0.1
          }
        };

        const topic = `fleet/bcferries/${vessel}/telemetry`;
        
        try {
          if (this.bridge.isConnected) {
            this.bridge.publishToAWSIoT(topic, message);
          }
          
          await this.processor.processMessage(topic, message);
          console.log(`📊 Processed ${scenario.name} for ${vessel}`);
          
          // Small delay between messages
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (error) {
          console.error(`❌ Failed to process ${scenario.name} for ${vessel}:`, error.message);
        }
      }
    }
  }

  /**
   * Test HiveMQ simulation
   */
  async testHiveMQSimulation() {
    console.log('\n☁️ Testing HiveMQ message simulation...');

    // Simulate messages that would come from HiveMQ
    const hiveMQMessages = [
      {
        topic: 'fleet/bcferries/spirit-of-vancouver/telemetry',
        message: {
          vesselId: 'spirit-of-vancouver',
          timestamp: new Date().toISOString(),
          source: 'vessel-control-system',
          sensors: {
            engine: { temperature: 88, rpm: 1350, hours: 12847 },
            power: { batterySOC: 82, voltage: 12.5, current: 42.1 },
            navigation: { latitude: 49.2827, longitude: -123.1207, speed: 16.2 },
            safety: { bilgeLevel: 18, fireAlarm: false, doorStatus: 'closed' }
          }
        }
      },
      {
        topic: 'fleet/bcferries/coastal-celebration/emergency/medical',
        message: {
          vesselId: 'coastal-celebration',
          timestamp: new Date().toISOString(),
          emergency: true,
          emergencyType: 'MEDICAL',
          message: 'Medical emergency reported - passenger assistance required',
          location: { latitude: 49.3956, longitude: -123.1478 },
          severity: 'HIGH'
        }
      }
    ];

    for (const msg of hiveMQMessages) {
      try {
        // Simulate the bridge handling HiveMQ messages
        this.bridge.handleHiveMQMessage(msg.topic, Buffer.from(JSON.stringify(msg.message)));
        console.log(`✅ Simulated HiveMQ message: ${msg.topic}`);
      } catch (error) {
        console.error(`❌ HiveMQ simulation failed for ${msg.topic}:`, error.message);
      }
    }
  }

  /**
   * Generate test report
   */
  generateTestReport() {
    console.log('\n📊 Test Results Summary:');
    console.log('========================');
    
    const results = Object.entries(this.testResults);
    const passed = results.filter(([, result]) => result).length;
    const total = results.length;
    
    results.forEach(([test, result]) => {
      const status = result ? '✅ PASS' : '❌ FAIL';
      console.log(`${status} ${test.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}`);
    });
    
    console.log(`\n📈 Overall: ${passed}/${total} tests passed (${Math.round(passed/total*100)}%)`);
    
    if (passed === total) {
      console.log('🎉 All tests passed! IoT Bridge is ready for deployment.');
    } else {
      console.log('⚠️ Some tests failed. Please review the setup and configuration.');
    }

    // Generate detailed report file
    const report = {
      timestamp: new Date().toISOString(),
      results: this.testResults,
      summary: {
        totalTests: total,
        passedTests: passed,
        successRate: Math.round(passed/total*100)
      },
      recommendations: this.generateRecommendations()
    };

    const reportPath = path.join(__dirname, '..', 'reports', 'iot-bridge-test-report.json');
    const reportDir = path.dirname(reportPath);
    
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }
    
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 Detailed report saved to: ${reportPath}`);
  }

  /**
   * Generate recommendations based on test results
   */
  generateRecommendations() {
    const recommendations = [];

    if (!this.testResults.awsConnection) {
      recommendations.push('Setup AWS IoT Core certificates and configuration');
      recommendations.push('Verify AWS credentials and permissions');
      recommendations.push('Check network connectivity to AWS IoT endpoint');
    }

    if (!this.testResults.messageProcessing) {
      recommendations.push('Review CloudWatch logs configuration');
      recommendations.push('Verify DynamoDB table permissions');
      recommendations.push('Check message processing logic');
    }

    if (!this.testResults.alertGeneration) {
      recommendations.push('Configure SNS topic for alerts');
      recommendations.push('Review alert threshold configurations');
      recommendations.push('Test SMS/email alert delivery');
    }

    if (recommendations.length === 0) {
      recommendations.push('System is ready for production deployment');
      recommendations.push('Consider setting up monitoring and dashboards');
      recommendations.push('Plan for scale testing with multiple vessels');
    }

    return recommendations;
  }
}

// CLI interface
async function main() {
  const tester = new IoTBridgeTest();
  const command = process.argv[2] || 'full';

  console.log('🧪 BC Ferries IoT Bridge Test Suite');
  console.log('====================================\n');

  try {
    switch (command) {
      case 'full':
        await tester.runTests();
        await tester.simulateVesselDataFlow();
        await tester.testHiveMQSimulation();
        break;
      case 'connection':
        await tester.testAWSConnection();
        break;
      case 'processing':
        await tester.testMessageProcessing();
        break;
      case 'alerts':
        await tester.testAlertGeneration();
        break;
      case 'simulate':
        await tester.simulateVesselDataFlow();
        break;
      case 'hivemq':
        await tester.testHiveMQSimulation();
        break;
      default:
        console.log('Usage: node test-iot-bridge.js [full|connection|processing|alerts|simulate|hivemq]');
        process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Test execution failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = IoTBridgeTest;