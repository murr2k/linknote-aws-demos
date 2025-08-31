const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class IoTProvisioning {
  constructor() {
    this.iot = new AWS.Iot({ region: process.env.AWS_REGION || 'us-west-2' });
    this.iotData = new AWS.IotData({ 
      endpoint: process.env.AWS_IOT_ENDPOINT,
      region: process.env.AWS_REGION || 'us-west-2'
    });
    this.certificatesDir = './certificates';
    this.ensureCertificatesDirectory();
  }

  /**
   * Ensure certificates directory exists
   */
  ensureCertificatesDirectory() {
    if (!fs.existsSync(this.certificatesDir)) {
      fs.mkdirSync(this.certificatesDir, { recursive: true });
      console.log(`📁 Created certificates directory: ${this.certificatesDir}`);
    }
  }

  /**
   * Create IoT Thing for BC Ferries vessel
   */
  async createIoTThing(vesselId, vesselType = 'ferry') {
    try {
      const thingName = `bc-ferries-${vesselId}`;
      
      const thingParams = {
        thingName,
        thingTypeName: 'BCFerriesVessel',
        attributePayload: {
          attributes: {
            vesselId,
            vesselType,
            fleet: 'bc-ferries',
            registeredAt: new Date().toISOString()
          }
        }
      };

      console.log(`🚢 Creating IoT Thing: ${thingName}`);
      const thing = await this.iot.createThing(thingParams).promise();
      console.log(`✅ IoT Thing created: ${thing.thingArn}`);
      
      return thing;
    } catch (error) {
      if (error.code === 'ResourceAlreadyExistsException') {
        console.log(`⚠️ IoT Thing already exists: bc-ferries-${vesselId}`);
        return await this.iot.describeThing({ thingName: `bc-ferries-${vesselId}` }).promise();
      }
      throw error;
    }
  }

  /**
   * Create IoT Thing Type for BC Ferries vessels
   */
  async createIoTThingType() {
    try {
      const thingTypeParams = {
        thingTypeName: 'BCFerriesVessel',
        thingTypeProperties: {
          thingTypeDescription: 'BC Ferries Maritime Vessel',
          searchableAttributes: ['vesselId', 'vesselType', 'fleet']
        }
      };

      console.log('🏭 Creating IoT Thing Type: BCFerriesVessel');
      const thingType = await this.iot.createThingType(thingTypeParams).promise();
      console.log(`✅ IoT Thing Type created: ${thingType.thingTypeArn}`);
      
      return thingType;
    } catch (error) {
      if (error.code === 'ResourceAlreadyExistsException') {
        console.log('⚠️ IoT Thing Type already exists: BCFerriesVessel');
        return await this.iot.describeThingType({ thingTypeName: 'BCFerriesVessel' }).promise();
      }
      throw error;
    }
  }

  /**
   * Generate device certificates
   */
  async generateDeviceCertificates(thingName) {
    try {
      console.log(`🔐 Generating certificates for ${thingName}`);
      
      const certParams = {
        setAsActive: true
      };

      const certificate = await this.iot.createKeysAndCertificate(certParams).promise();
      
      // Save certificate files
      const certPath = path.join(this.certificatesDir, 'device-certificate.pem.crt');
      const keyPath = path.join(this.certificatesDir, 'private.pem.key');
      const publicKeyPath = path.join(this.certificatesDir, 'public.pem.key');
      
      fs.writeFileSync(certPath, certificate.certificatePem);
      fs.writeFileSync(keyPath, certificate.keyPair.PrivateKey);
      fs.writeFileSync(publicKeyPath, certificate.keyPair.PublicKey);
      
      console.log(`✅ Device certificates saved to ${this.certificatesDir}`);
      
      return {
        certificateArn: certificate.certificateArn,
        certificateId: certificate.certificateId,
        certificatePem: certificate.certificatePem,
        keyPair: certificate.keyPair
      };
    } catch (error) {
      console.error('❌ Failed to generate certificates:', error);
      throw error;
    }
  }

  /**
   * Download Amazon Root CA certificate
   */
  async downloadRootCA() {
    try {
      const https = require('https');
      const rootCAUrl = 'https://www.amazontrust.com/repository/AmazonRootCA1.pem';
      const rootCAPath = path.join(this.certificatesDir, 'amazon-root-ca-1.pem');
      
      if (fs.existsSync(rootCAPath)) {
        console.log('✅ Root CA certificate already exists');
        return rootCAPath;
      }
      
      console.log('📥 Downloading Amazon Root CA certificate...');
      
      return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(rootCAPath);
        
        https.get(rootCAUrl, (response) => {
          response.pipe(file);
          
          file.on('finish', () => {
            file.close();
            console.log('✅ Amazon Root CA certificate downloaded');
            resolve(rootCAPath);
          });
          
          file.on('error', (error) => {
            fs.unlink(rootCAPath, () => {}); // Clean up on error
            reject(error);
          });
        }).on('error', reject);
      });
    } catch (error) {
      console.error('❌ Failed to download Root CA:', error);
      throw error;
    }
  }

  /**
   * Attach policy to certificate
   */
  async attachPolicyToCertificate(certificateArn, policyName) {
    try {
      const params = {
        policyName,
        target: certificateArn
      };

      await this.iot.attachPolicy(params).promise();
      console.log(`✅ Policy ${policyName} attached to certificate`);
    } catch (error) {
      if (error.code === 'ResourceAlreadyExistsException') {
        console.log(`⚠️ Policy already attached to certificate`);
      } else {
        throw error;
      }
    }
  }

  /**
   * Attach certificate to IoT Thing
   */
  async attachCertificateToThing(thingName, certificateArn) {
    try {
      const params = {
        thingName,
        principal: certificateArn
      };

      await this.iot.attachThingPrincipal(params).promise();
      console.log(`✅ Certificate attached to IoT Thing: ${thingName}`);
    } catch (error) {
      if (error.code === 'ResourceAlreadyExistsException') {
        console.log(`⚠️ Certificate already attached to thing`);
      } else {
        throw error;
      }
    }
  }

  /**
   * Get IoT endpoint
   */
  async getIoTEndpoint() {
    try {
      const params = {
        endpointType: 'iot:Data-ATS'
      };

      const endpoint = await this.iot.describeEndpoint(params).promise();
      console.log(`🌐 IoT Endpoint: ${endpoint.endpointAddress}`);
      
      return endpoint.endpointAddress;
    } catch (error) {
      console.error('❌ Failed to get IoT endpoint:', error);
      throw error;
    }
  }

  /**
   * Test IoT connection by publishing a test message
   */
  async testConnection(vesselId = 'test-vessel') {
    try {
      const topic = `fleet/bcferries/${vesselId}/test`;
      const message = {
        vesselId,
        message: 'IoT connection test',
        timestamp: new Date().toISOString(),
        testId: crypto.randomUUID()
      };

      const params = {
        topic,
        payload: JSON.stringify(message),
        qos: 1
      };

      await this.iotData.publish(params).promise();
      console.log(`✅ Test message published to topic: ${topic}`);
      
      return true;
    } catch (error) {
      console.error('❌ Failed to publish test message:', error);
      return false;
    }
  }

  /**
   * Complete provisioning workflow for a vessel
   */
  async provisionVessel(vesselId, policyName = 'BCFerriesFleetPolicy') {
    try {
      console.log(`🚀 Starting provisioning for vessel: ${vesselId}`);
      
      // 1. Create IoT Thing Type
      await this.createIoTThingType();
      
      // 2. Create IoT Thing
      const thing = await this.createIoTThing(vesselId);
      
      // 3. Generate certificates
      const certificates = await this.generateDeviceCertificates(thing.thingName);
      
      // 4. Download Root CA
      await this.downloadRootCA();
      
      // 5. Attach policy to certificate
      await this.attachPolicyToCertificate(certificates.certificateArn, policyName);
      
      // 6. Attach certificate to thing
      await this.attachCertificateToThing(thing.thingName, certificates.certificateArn);
      
      // 7. Get IoT endpoint
      const endpoint = await this.getIoTEndpoint();
      
      console.log(`✅ Provisioning complete for vessel: ${vesselId}`);
      
      return {
        thingName: thing.thingName,
        thingArn: thing.thingArn,
        certificateArn: certificates.certificateArn,
        certificateId: certificates.certificateId,
        endpoint,
        topic: `fleet/bcferries/${vesselId}/telemetry`
      };
      
    } catch (error) {
      console.error(`❌ Provisioning failed for vessel ${vesselId}:`, error);
      throw error;
    }
  }

  /**
   * List all BC Ferries IoT Things
   */
  async listBCFerriesThings() {
    try {
      const params = {
        thingTypeName: 'BCFerriesVessel',
        maxResults: 100
      };

      const result = await this.iot.listThings(params).promise();
      console.log(`📋 Found ${result.things.length} BC Ferries vessels`);
      
      return result.things.map(thing => ({
        thingName: thing.thingName,
        thingArn: thing.thingArn,
        attributes: thing.attributes,
        version: thing.version
      }));
    } catch (error) {
      console.error('❌ Failed to list BC Ferries things:', error);
      throw error;
    }
  }

  /**
   * Clean up resources for testing
   */
  async cleanupTestResources(vesselId) {
    try {
      const thingName = `bc-ferries-${vesselId}`;
      console.log(`🧹 Cleaning up test resources for: ${thingName}`);
      
      // List thing principals (certificates)
      const principals = await this.iot.listThingPrincipals({ thingName }).promise();
      
      // Detach and delete certificates
      for (const principal of principals.principals) {
        await this.iot.detachThingPrincipal({ thingName, principal }).promise();
        
        // Extract certificate ID from ARN
        const certId = principal.split('/')[1];
        
        // Update certificate to INACTIVE before deletion
        await this.iot.updateCertificate({
          certificateId: certId,
          newStatus: 'INACTIVE'
        }).promise();
        
        // Delete certificate
        await this.iot.deleteCertificate({ certificateId: certId }).promise();
        console.log(`🗑️ Deleted certificate: ${certId}`);
      }
      
      // Delete thing
      await this.iot.deleteThing({ thingName }).promise();
      console.log(`🗑️ Deleted thing: ${thingName}`);
      
      console.log(`✅ Cleanup complete for: ${thingName}`);
    } catch (error) {
      console.error('❌ Cleanup failed:', error);
      throw error;
    }
  }
}

module.exports = IoTProvisioning;