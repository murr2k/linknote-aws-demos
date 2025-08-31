#!/usr/bin/env node

const IoTProvisioning = require('../src/aws-iot-provisioning');
const IoTBridge = require('../src/aws-iot-connection');
const fs = require('fs');
const path = require('path');

class AWSIoTSetup {
  constructor() {
    this.provisioning = new IoTProvisioning();
    this.configFile = path.join(__dirname, '..', 'config', 'aws-iot-config.json');
    this.envFile = path.join(__dirname, '..', '.env.iot');
  }

  /**
   * Main setup workflow
   */
  async setup() {
    try {
      console.log('🚀 Starting AWS IoT Core setup for BC Ferries...\n');

      // Check AWS credentials
      await this.checkAWSCredentials();

      // Setup basic configuration
      const config = await this.setupIoTCore();

      // Create test vessel
      const testVessel = await this.setupTestVessel('spirit-of-vancouver');

      // Generate environment configuration
      await this.generateEnvironmentConfig(config, testVessel);

      // Test connection
      await this.testConnection();

      console.log('\n✅ AWS IoT Core setup complete!');
      console.log('\n📋 Next steps:');
      console.log('1. Start the IoT bridge: npm run start:iot');
      console.log('2. Configure HiveMQ Cloud credentials in .env.iot');
      console.log('3. Test message flow with vessel simulator');
      
    } catch (error) {
      console.error('\n❌ Setup failed:', error.message);
      process.exit(1);
    }
  }

  /**
   * Check AWS credentials
   */
  async checkAWSCredentials() {
    try {
      const AWS = require('aws-sdk');
      const sts = new AWS.STS();
      
      const identity = await sts.getCallerIdentity().promise();
      console.log(`✅ AWS credentials valid for account: ${identity.Account}`);
      console.log(`   Using region: ${process.env.AWS_REGION || 'us-west-2'}`);
    } catch (error) {
      console.error('❌ AWS credentials not configured properly');
      console.error('   Please run: aws configure');
      throw error;
    }
  }

  /**
   * Setup IoT Core resources
   */
  async setupIoTCore() {
    console.log('\n📡 Setting up AWS IoT Core resources...');

    try {
      // Get IoT endpoint
      const endpoint = await this.provisioning.getIoTEndpoint();
      
      // Create thing type
      await this.provisioning.createIoTThingType();
      
      console.log('✅ IoT Core basic setup complete');
      
      return {
        endpoint,
        region: process.env.AWS_REGION || 'us-west-2',
        thingTypeName: 'BCFerriesVessel'
      };
    } catch (error) {
      console.error('❌ Failed to setup IoT Core:', error.message);
      throw error;
    }
  }

  /**
   * Setup test vessel
   */
  async setupTestVessel(vesselId) {
    console.log(`\n🚢 Setting up test vessel: ${vesselId}...`);

    try {
      const vesselConfig = await this.provisioning.provisionVessel(vesselId);
      
      console.log(`✅ Test vessel ${vesselId} provisioned successfully`);
      console.log(`   Thing Name: ${vesselConfig.thingName}`);
      console.log(`   Certificate ID: ${vesselConfig.certificateId}`);
      console.log(`   Topic: ${vesselConfig.topic}`);
      
      return vesselConfig;
    } catch (error) {
      console.error(`❌ Failed to setup test vessel ${vesselId}:`, error.message);
      throw error;
    }
  }

  /**
   * Generate environment configuration
   */
  async generateEnvironmentConfig(config, testVessel) {
    console.log('\n⚙️ Generating configuration files...');

    try {
      // Create config directory
      const configDir = path.dirname(this.configFile);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      // AWS IoT configuration
      const iotConfig = {
        aws: {
          region: config.region,
          iotEndpoint: config.endpoint,
          thingTypeName: config.thingTypeName
        },
        testVessel: {
          vesselId: testVessel.thingName.replace('bc-ferries-', ''),
          thingName: testVessel.thingName,
          thingArn: testVessel.thingArn,
          certificateId: testVessel.certificateId,
          topic: testVessel.topic
        },
        topics: {
          telemetry: 'fleet/bcferries/+/telemetry',
          emergency: 'fleet/bcferries/+/emergency/+',
          status: 'fleet/bcferries/+/status'
        },
        createdAt: new Date().toISOString()
      };

      fs.writeFileSync(this.configFile, JSON.stringify(iotConfig, null, 2));
      console.log(`✅ Configuration saved to: ${this.configFile}`);

      // Environment file for IoT Bridge
      const envConfig = [
        '# AWS IoT Core Configuration',
        `AWS_REGION=${config.region}`,
        `AWS_IOT_ENDPOINT=${config.endpoint}`,
        `DEVICE_ID=${testVessel.thingName}`,
        'CERTIFICATE_PATH=./certificates',
        '',
        '# HiveMQ Cloud Configuration (Update these values)',
        'HIVEMQ_HOST=your-cluster.hivemq.cloud',
        'HIVEMQ_PORT=8883',
        'HIVEMQ_USERNAME=your-username',
        'HIVEMQ_PASSWORD=your-password',
        '',
        '# CloudWatch and SNS',
        'LOG_GROUP_NAME=/bc-ferries/maritime-telemetry',
        'SNS_TOPIC_ARN=arn:aws:sns:region:account:bc-ferries-alerts',
        'DYNAMODB_TABLE=bc-ferries-telemetry',
        ''
      ].join('\n');

      fs.writeFileSync(this.envFile, envConfig);
      console.log(`✅ Environment template saved to: ${this.envFile}`);
      
    } catch (error) {
      console.error('❌ Failed to generate configuration:', error.message);
      throw error;
    }
  }

  /**
   * Test connection
   */
  async testConnection() {
    console.log('\n🔍 Testing IoT connection...');

    try {
      // Test basic AWS IoT connection
      const testResult = await this.provisioning.testConnection('spirit-of-vancouver');
      
      if (testResult) {
        console.log('✅ AWS IoT Core connection test successful');
      } else {
        console.log('⚠️ AWS IoT Core connection test failed');
      }
      
      // Check CloudFormation resources
      await this.checkCloudFormationResources();
      
    } catch (error) {
      console.error('❌ Connection test failed:', error.message);
      // Don't throw error here as basic setup is complete
    }
  }

  /**
   * Check CloudFormation resources
   */
  async checkCloudFormationResources() {
    try {
      const AWS = require('aws-sdk');
      const cloudformation = new AWS.CloudFormation({ 
        region: process.env.AWS_REGION || 'us-west-2' 
      });
      
      // List stacks to find BC Ferries stack
      const stacks = await cloudformation.listStacks({
        StackStatusFilter: ['CREATE_COMPLETE', 'UPDATE_COMPLETE']
      }).promise();
      
      const bcFerriesStack = stacks.StackSummaries.find(stack => 
        stack.StackName.includes('bc-ferries') || 
        stack.StackName.includes('BCFerries')
      );
      
      if (bcFerriesStack) {
        console.log(`✅ Found CloudFormation stack: ${bcFerriesStack.StackName}`);
        
        // Get stack outputs
        const stackDetails = await cloudformation.describeStacks({
          StackName: bcFerriesStack.StackName
        }).promise();
        
        if (stackDetails.Stacks[0].Outputs) {
          console.log('📋 Stack outputs:');
          stackDetails.Stacks[0].Outputs.forEach(output => {
            console.log(`   ${output.OutputKey}: ${output.OutputValue}`);
          });
        }
      } else {
        console.log('⚠️ No BC Ferries CloudFormation stack found');
        console.log('   Deploy the stack using: aws cloudformation create-stack ...');
      }
      
    } catch (error) {
      console.log('⚠️ Could not check CloudFormation resources:', error.message);
    }
  }

  /**
   * Cleanup test resources
   */
  async cleanup() {
    console.log('\n🧹 Cleaning up test resources...');

    try {
      await this.provisioning.cleanupTestResources('spirit-of-vancouver');
      console.log('✅ Cleanup complete');
    } catch (error) {
      console.error('❌ Cleanup failed:', error.message);
      throw error;
    }
  }

  /**
   * List all BC Ferries IoT resources
   */
  async listResources() {
    console.log('\n📋 Listing BC Ferries IoT resources...');

    try {
      const things = await this.provisioning.listBCFerriesThings();
      
      console.log(`\nFound ${things.length} BC Ferries vessels:`);
      things.forEach(thing => {
        console.log(`  🚢 ${thing.thingName}`);
        console.log(`     ARN: ${thing.thingArn}`);
        console.log(`     Attributes: ${JSON.stringify(thing.attributes)}`);
        console.log('');
      });
    } catch (error) {
      console.error('❌ Failed to list resources:', error.message);
      throw error;
    }
  }
}

// CLI interface
async function main() {
  const setup = new AWSIoTSetup();
  const command = process.argv[2] || 'setup';

  switch (command) {
    case 'setup':
      await setup.setup();
      break;
    case 'cleanup':
      await setup.cleanup();
      break;
    case 'list':
      await setup.listResources();
      break;
    case 'test':
      await setup.testConnection();
      break;
    default:
      console.log('Usage: node setup-aws-iot.js [setup|cleanup|list|test]');
      process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = AWSIoTSetup;