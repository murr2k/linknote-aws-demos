const historicalData = require('../db/historical-data');
const cron = require('node-cron');

class DataCollector {
  constructor(opsState) {
    this.opsState = opsState;
    this.collectionInterval = null;
    this.aggregationTasks = new Map();
  }

  start() {
    console.log('=Ê Starting historical data collection...');

    // Collect telemetry every 5 seconds
    this.collectionInterval = setInterval(() => {
      this.collectTelemetry();
    }, 5000);

    // Aggregate data every 5 minutes
    this.aggregationTasks.set('5min', cron.schedule('*/5 * * * *', () => {
      console.log('ð Running 5-minute aggregation...');
      historicalData.aggregateData('5min');
    }));

    // Aggregate hourly data
    this.aggregationTasks.set('hour', cron.schedule('0 * * * *', () => {
      console.log('ð Running hourly aggregation...');
      historicalData.aggregateData('hour');
    }));

    // Clean up old data every hour (keep only 1 day as per requirements)
    this.aggregationTasks.set('cleanup', cron.schedule('30 * * * *', () => {
      console.log('>ù Cleaning up old data...');
      historicalData.cleanupOldData();
    }));

    // Run initial aggregation after 1 minute to have some data
    setTimeout(() => {
      historicalData.aggregateData('5min');
      historicalData.aggregateData('hour');
    }, 60000);
  }

  collectTelemetry() {
    try {
      // Collect data for all vessels in the fleet
      for (const [vesselId, vesselData] of this.opsState.fleet) {
        if (vesselData && vesselData.lastSeen) {
          // Only save if data is fresh (less than 30 seconds old)
          const lastSeenTime = new Date(vesselData.lastSeen);
          const now = new Date();
          const secondsSinceUpdate = (now - lastSeenTime) / 1000;

          if (secondsSinceUpdate < 30) {
            historicalData.saveTelemetry(vesselData);
          }
        }
      }
    } catch (error) {
      console.error('Error collecting telemetry:', error);
    }
  }

  // Track significant events
  trackEvent(vesselId, eventType, severity, message, data) {
    historicalData.saveEvent(vesselId, eventType, severity, message, data);
  }

  // Track alert creation
  trackAlert(alert) {
    this.trackEvent(
      alert.vesselId,
      'alert',
      alert.severity,
      alert.message,
      { alertId: alert.id, type: alert.type }
    );
  }

  stop() {
    console.log('=Ê Stopping data collection...');

    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = null;
    }

    for (const [name, task] of this.aggregationTasks) {
      task.stop();
    }
    this.aggregationTasks.clear();
  }
}

module.exports = DataCollector;
