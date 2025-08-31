const AWS = require('aws-sdk');

class IoTMessageProcessor {
  constructor() {
    this.cloudwatchLogs = new AWS.CloudWatchLogs({ 
      region: process.env.AWS_REGION || 'us-west-2' 
    });
    this.sns = new AWS.SNS({ 
      region: process.env.AWS_REGION || 'us-west-2' 
    });
    this.dynamodb = new AWS.DynamoDB.DocumentClient({ 
      region: process.env.AWS_REGION || 'us-west-2' 
    });
    
    this.logGroupName = process.env.LOG_GROUP_NAME || '/bc-ferries/maritime-telemetry';
    this.snsTopicArn = process.env.SNS_TOPIC_ARN;
    this.telemetryTable = process.env.DYNAMODB_TABLE || 'bc-ferries-telemetry';
    
    this.alertThresholds = {
      engine: {
        temperature: { warning: 95, critical: 105 },
        rpm: { warning: 1800, critical: 2000 }
      },
      power: {
        batterySOC: { warning: 25, critical: 15 },
        voltage: { warning: 11.5, critical: 11.0 }
      },
      safety: {
        bilgeLevel: { warning: 40, critical: 60 },
        fireAlarm: { critical: true }
      }
    };
  }

  /**
   * Process incoming IoT message based on topic pattern
   */
  async processMessage(topic, message) {
    try {
      console.log(`🔄 Processing message from topic: ${topic}`);
      
      const messageData = typeof message === 'string' ? JSON.parse(message) : message;
      const topicParts = topic.split('/');
      
      // Extract vessel ID from topic
      const vesselId = topicParts[2] || 'unknown';
      const messageType = topicParts[3] || 'unknown';
      
      // Add processing metadata
      const processedMessage = {
        ...messageData,
        vesselId,
        messageType,
        topic,
        processedAt: new Date().toISOString(),
        processingId: this.generateProcessingId()
      };
      
      // Route message based on type
      switch (messageType) {
        case 'telemetry':
          return await this.processTelemetryMessage(processedMessage);
        case 'emergency':
          return await this.processEmergencyMessage(processedMessage);
        case 'status':
          return await this.processStatusMessage(processedMessage);
        default:
          return await this.processGenericMessage(processedMessage);
      }
      
    } catch (error) {
      console.error('❌ Error processing IoT message:', error);
      await this.logError(topic, message, error);
      throw error;
    }
  }

  /**
   * Process telemetry messages
   */
  async processTelemetryMessage(message) {
    console.log(`📊 Processing telemetry for vessel: ${message.vesselId}`);
    
    try {
      // 1. Log to CloudWatch
      await this.logToCloudWatch(message, 'TELEMETRY');
      
      // 2. Store in DynamoDB
      await this.storeTelemetryData(message);
      
      // 3. Check for alerts
      const alerts = this.checkTelemetryAlerts(message);
      
      // 4. Send alerts if any
      if (alerts.length > 0) {
        await this.sendAlerts(alerts);
      }
      
      // 5. Calculate metrics
      const metrics = this.calculateMetrics(message);
      
      return {
        processed: true,
        vesselId: message.vesselId,
        alertsGenerated: alerts.length,
        metrics,
        processingId: message.processingId
      };
      
    } catch (error) {
      console.error('❌ Error processing telemetry message:', error);
      throw error;
    }
  }

  /**
   * Process emergency messages with high priority
   */
  async processEmergencyMessage(message) {
    console.log(`🚨 Processing EMERGENCY message for vessel: ${message.vesselId}`);
    
    try {
      // 1. Immediate CloudWatch logging with high priority
      await this.logToCloudWatch(message, 'EMERGENCY');
      
      // 2. Store emergency event
      await this.storeEmergencyEvent(message);
      
      // 3. Send immediate SNS alert
      await this.sendEmergencyAlert(message);
      
      // 4. Trigger additional emergency protocols
      await this.triggerEmergencyProtocols(message);
      
      return {
        processed: true,
        emergency: true,
        vesselId: message.vesselId,
        alertSent: true,
        processingId: message.processingId
      };
      
    } catch (error) {
      console.error('❌ Error processing emergency message:', error);
      throw error;
    }
  }

  /**
   * Process status update messages
   */
  async processStatusMessage(message) {
    console.log(`📡 Processing status update for vessel: ${message.vesselId}`);
    
    try {
      // 1. Log to CloudWatch
      await this.logToCloudWatch(message, 'STATUS');
      
      // 2. Update vessel status in DynamoDB
      await this.updateVesselStatus(message);
      
      return {
        processed: true,
        vesselId: message.vesselId,
        statusUpdated: true,
        processingId: message.processingId
      };
      
    } catch (error) {
      console.error('❌ Error processing status message:', error);
      throw error;
    }
  }

  /**
   * Process generic messages
   */
  async processGenericMessage(message) {
    console.log(`📝 Processing generic message for vessel: ${message.vesselId}`);
    
    try {
      // Basic logging for unknown message types
      await this.logToCloudWatch(message, 'GENERIC');
      
      return {
        processed: true,
        vesselId: message.vesselId,
        messageType: 'generic',
        processingId: message.processingId
      };
      
    } catch (error) {
      console.error('❌ Error processing generic message:', error);
      throw error;
    }
  }

  /**
   * Log message to CloudWatch Logs
   */
  async logToCloudWatch(message, messageType) {
    try {
      const logEvent = {
        timestamp: Date.now(),
        message: JSON.stringify({
          messageType,
          vesselId: message.vesselId,
          data: message,
          loggedAt: new Date().toISOString()
        })
      };

      const params = {
        logGroupName: this.logGroupName,
        logStreamName: `vessel-${message.vesselId}-${new Date().toISOString().split('T')[0]}`,
        logEvents: [logEvent]
      };

      try {
        await this.cloudwatchLogs.putLogEvents(params).promise();
      } catch (error) {
        if (error.code === 'ResourceNotFoundException') {
          // Create log stream if it doesn't exist
          await this.cloudwatchLogs.createLogStream({
            logGroupName: this.logGroupName,
            logStreamName: params.logStreamName
          }).promise();
          
          // Retry putting log events
          await this.cloudwatchLogs.putLogEvents(params).promise();
        } else {
          throw error;
        }
      }

      console.log(`📝 Logged to CloudWatch: ${messageType} for vessel ${message.vesselId}`);
    } catch (error) {
      console.error('❌ Failed to log to CloudWatch:', error);
      throw error;
    }
  }

  /**
   * Store telemetry data in DynamoDB
   */
  async storeTelemetryData(message) {
    try {
      const item = {
        vesselId: message.vesselId,
        timestamp: message.timestamp || new Date().toISOString(),
        ttl: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60), // 30 days TTL
        telemetryData: message,
        processedAt: new Date().toISOString()
      };

      const params = {
        TableName: this.telemetryTable,
        Item: item
      };

      await this.dynamodb.put(params).promise();
      console.log(`💾 Stored telemetry data for vessel: ${message.vesselId}`);
    } catch (error) {
      console.error('❌ Failed to store telemetry data:', error);
      throw error;
    }
  }

  /**
   * Store emergency event with special handling
   */
  async storeEmergencyEvent(message) {
    try {
      const item = {
        vesselId: message.vesselId,
        timestamp: message.timestamp || new Date().toISOString(),
        eventType: 'EMERGENCY',
        severity: 'CRITICAL',
        emergencyData: message,
        processedAt: new Date().toISOString(),
        ttl: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60) // 1 year TTL for emergencies
      };

      const params = {
        TableName: `${this.telemetryTable}-emergencies`,
        Item: item
      };

      await this.dynamodb.put(params).promise();
      console.log(`🚨 Stored emergency event for vessel: ${message.vesselId}`);
    } catch (error) {
      console.error('❌ Failed to store emergency event:', error);
      // Don't throw error for emergency events to ensure other processing continues
    }
  }

  /**
   * Update vessel status
   */
  async updateVesselStatus(message) {
    try {
      const params = {
        TableName: `${this.telemetryTable}-status`,
        Key: {
          vesselId: message.vesselId
        },
        UpdateExpression: 'SET #status = :status, #lastUpdate = :lastUpdate, #statusData = :statusData',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#lastUpdate': 'lastUpdate',
          '#statusData': 'statusData'
        },
        ExpressionAttributeValues: {
          ':status': message.status || 'unknown',
          ':lastUpdate': new Date().toISOString(),
          ':statusData': message
        }
      };

      await this.dynamodb.update(params).promise();
      console.log(`📊 Updated status for vessel: ${message.vesselId}`);
    } catch (error) {
      console.error('❌ Failed to update vessel status:', error);
      throw error;
    }
  }

  /**
   * Check telemetry data for alert conditions
   */
  checkTelemetryAlerts(message) {
    const alerts = [];
    const { vesselId, sensors = {} } = message;

    // Engine temperature alerts
    if (sensors.engine?.temperature) {
      const temp = sensors.engine.temperature;
      const thresholds = this.alertThresholds.engine.temperature;
      
      if (temp >= thresholds.critical) {
        alerts.push(this.createAlert(vesselId, 'ENGINE_TEMPERATURE_CRITICAL', 
          `Engine temperature critically high: ${temp}°C`, 'CRITICAL'));
      } else if (temp >= thresholds.warning) {
        alerts.push(this.createAlert(vesselId, 'ENGINE_TEMPERATURE_WARNING', 
          `Engine temperature high: ${temp}°C`, 'WARNING'));
      }
    }

    // Engine RPM alerts
    if (sensors.engine?.rpm) {
      const rpm = sensors.engine.rpm;
      const thresholds = this.alertThresholds.engine.rpm;
      
      if (rpm >= thresholds.critical) {
        alerts.push(this.createAlert(vesselId, 'ENGINE_RPM_CRITICAL', 
          `Engine RPM critically high: ${rpm}`, 'CRITICAL'));
      } else if (rpm >= thresholds.warning) {
        alerts.push(this.createAlert(vesselId, 'ENGINE_RPM_WARNING', 
          `Engine RPM high: ${rpm}`, 'WARNING'));
      }
    }

    // Battery SOC alerts
    if (sensors.power?.batterySOC !== undefined) {
      const soc = sensors.power.batterySOC;
      const thresholds = this.alertThresholds.power.batterySOC;
      
      if (soc <= thresholds.critical) {
        alerts.push(this.createAlert(vesselId, 'BATTERY_SOC_CRITICAL', 
          `Battery SOC critically low: ${soc}%`, 'CRITICAL'));
      } else if (soc <= thresholds.warning) {
        alerts.push(this.createAlert(vesselId, 'BATTERY_SOC_WARNING', 
          `Battery SOC low: ${soc}%`, 'WARNING'));
      }
    }

    // Safety alerts
    if (sensors.safety?.fireAlarm === true) {
      alerts.push(this.createAlert(vesselId, 'FIRE_ALARM', 
        'Fire alarm activated', 'CRITICAL'));
    }

    if (sensors.safety?.bilgeLevel) {
      const level = sensors.safety.bilgeLevel;
      const thresholds = this.alertThresholds.safety.bilgeLevel;
      
      if (level >= thresholds.critical) {
        alerts.push(this.createAlert(vesselId, 'BILGE_LEVEL_CRITICAL', 
          `Bilge level critically high: ${level}cm`, 'CRITICAL'));
      } else if (level >= thresholds.warning) {
        alerts.push(this.createAlert(vesselId, 'BILGE_LEVEL_WARNING', 
          `Bilge level high: ${level}cm`, 'WARNING'));
      }
    }

    return alerts;
  }

  /**
   * Create alert object
   */
  createAlert(vesselId, alertType, message, severity) {
    return {
      vesselId,
      alertType,
      message,
      severity,
      timestamp: new Date().toISOString(),
      alertId: this.generateAlertId(vesselId, alertType)
    };
  }

  /**
   * Send alerts via SNS
   */
  async sendAlerts(alerts) {
    if (!this.snsTopicArn) {
      console.log('⚠️ SNS Topic ARN not configured, skipping alerts');
      return;
    }

    for (const alert of alerts) {
      try {
        const message = {
          default: JSON.stringify(alert),
          sms: `BC Ferries Alert: ${alert.message}`,
          email: `BC Ferries Maritime Alert\n\nVessel: ${alert.vesselId}\nSeverity: ${alert.severity}\nMessage: ${alert.message}\nTime: ${alert.timestamp}`
        };

        const params = {
          TopicArn: this.snsTopicArn,
          Subject: `BC Ferries ${alert.severity} Alert - ${alert.vesselId}`,
          Message: JSON.stringify(message),
          MessageStructure: 'json'
        };

        await this.sns.publish(params).promise();
        console.log(`📨 Alert sent: ${alert.alertType} for vessel ${alert.vesselId}`);
      } catch (error) {
        console.error(`❌ Failed to send alert ${alert.alertId}:`, error);
      }
    }
  }

  /**
   * Send immediate emergency alert
   */
  async sendEmergencyAlert(message) {
    if (!this.snsTopicArn) {
      console.log('⚠️ SNS Topic ARN not configured, skipping emergency alert');
      return;
    }

    try {
      const alertMessage = {
        default: JSON.stringify(message),
        sms: `🚨 EMERGENCY: BC Ferries vessel ${message.vesselId} - ${message.emergencyType || 'Emergency situation'}`,
        email: `🚨 BC FERRIES EMERGENCY ALERT 🚨\n\nVessel: ${message.vesselId}\nEmergency Type: ${message.emergencyType || 'Unknown'}\nMessage: ${message.message || 'Emergency situation detected'}\nTime: ${message.timestamp}\nLocation: ${JSON.stringify(message.location || 'Unknown')}`
      };

      const params = {
        TopicArn: this.snsTopicArn,
        Subject: `🚨 BC FERRIES EMERGENCY - ${message.vesselId}`,
        Message: JSON.stringify(alertMessage),
        MessageStructure: 'json'
      };

      await this.sns.publish(params).promise();
      console.log(`🚨 Emergency alert sent for vessel: ${message.vesselId}`);
    } catch (error) {
      console.error('❌ Failed to send emergency alert:', error);
      throw error;
    }
  }

  /**
   * Trigger emergency protocols
   */
  async triggerEmergencyProtocols(message) {
    console.log(`🚨 Triggering emergency protocols for vessel: ${message.vesselId}`);
    
    // Add emergency-specific processing here
    // This could include:
    // - Notifying Coast Guard systems
    // - Activating search and rescue protocols
    // - Alerting nearby vessels
    // - Updating vessel tracking systems
    
    // For now, just log the emergency
    await this.logToCloudWatch({
      ...message,
      protocolsTriggered: true,
      emergencyProtocols: ['SNS_ALERT', 'LOG_EMERGENCY', 'STORE_EVENT']
    }, 'EMERGENCY_PROTOCOLS');
  }

  /**
   * Calculate metrics from telemetry data
   */
  calculateMetrics(message) {
    const metrics = {
      dataPoints: 0,
      alertsGenerated: 0,
      systemsReporting: []
    };

    if (message.sensors) {
      // Count data points
      const flattenData = (obj, prefix = '') => {
        let count = 0;
        for (const key in obj) {
          if (typeof obj[key] === 'object' && obj[key] !== null) {
            count += flattenData(obj[key], `${prefix}${key}.`);
          } else {
            count++;
          }
        }
        return count;
      };

      metrics.dataPoints = flattenData(message.sensors);
      metrics.systemsReporting = Object.keys(message.sensors);
    }

    return metrics;
  }

  /**
   * Log processing errors
   */
  async logError(topic, message, error) {
    try {
      const errorLog = {
        topic,
        message: typeof message === 'string' ? message : JSON.stringify(message),
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      };

      await this.logToCloudWatch(errorLog, 'ERROR');
    } catch (logError) {
      console.error('❌ Failed to log error:', logError);
    }
  }

  /**
   * Generate unique processing ID
   */
  generateProcessingId() {
    return `proc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique alert ID
   */
  generateAlertId(vesselId, alertType) {
    return `alert_${vesselId}_${alertType}_${Date.now()}`;
  }
}

module.exports = IoTMessageProcessor;