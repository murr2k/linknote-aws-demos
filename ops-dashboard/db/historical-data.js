const db = require('./database');

class HistoricalDataService {
  constructor() {
    this.aggregationIntervals = {
      '5min': 5 * 60 * 1000,
      'hour': 60 * 60 * 1000
    };
    this.metrics = [
      'engine_rpm', 'engine_temp', 'fuel_flow',
      'battery_soc', 'voltage', 'generator_load',
      'speed', 'bilge_level', 'co2_level'
    ];
  }

  // Save telemetry data point
  saveTelemetry(vesselData) {
    const sql = `
      INSERT INTO telemetry (
        vessel_id, timestamp, engine_rpm, engine_temp, fuel_flow,
        battery_soc, voltage, generator_load, speed, heading,
        latitude, longitude, bilge_level, co2_level, operational_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      vesselData.vesselId || vesselData.id,
      new Date().toISOString(),
      vesselData.engine?.rpm || null,
      vesselData.engine?.temperature || null,
      vesselData.engine?.fuelFlow || null,
      vesselData.power?.batterySOC || null,
      vesselData.power?.voltage || null,
      vesselData.power?.generatorLoad || null,
      vesselData.navigation?.speed || vesselData.location?.speed || null,
      vesselData.navigation?.heading || vesselData.location?.heading || null,
      vesselData.navigation?.latitude || vesselData.location?.latitude || null,
      vesselData.navigation?.longitude || vesselData.location?.longitude || null,
      vesselData.safety?.bilgeLevel || null,
      vesselData.safety?.co2Level || null,
      vesselData.operationalState || vesselData.operational || null
    ];

    db.run(sql, params, (err) => {
      if (err) {
        console.error('Error saving telemetry:', err);
      }
    });
  }

  // Save vessel event (alerts, state changes, etc.)
  saveEvent(vesselId, eventType, severity, message, data = null) {
    const sql = `
      INSERT INTO vessel_events (
        vessel_id, timestamp, event_type, severity, message, data
      ) VALUES (?, ?, ?, ?, ?, ?)
    `;

    db.run(sql, [
      vesselId,
      new Date().toISOString(),
      eventType,
      severity,
      message,
      data ? JSON.stringify(data) : null
    ], (err) => {
      if (err) {
        console.error('Error saving event:', err);
      }
    });
  }

  // Get historical data for charting (returns a Promise)
  getHistoricalData(vesselId, metric, timeRange) {
    return new Promise((resolve, reject) => {
      let sql;
      let params;

      // Determine time filter
      const hoursAgo = {
        '1h': 1,
        '6h': 6,
        '12h': 12,
        '24h': 24
      }[timeRange] || 24;

      const since = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();

      // For short time ranges (1h, 6h), use raw data
      if (timeRange === '1h' || timeRange === '6h') {
        sql = `
          SELECT timestamp, ${metric} as value
          FROM telemetry
          WHERE vessel_id = ?
          AND timestamp > ?
          AND ${metric} IS NOT NULL
          ORDER BY timestamp ASC
        `;
        params = [vesselId, since];
      } else {
        // For longer ranges, use 5-minute aggregates
        sql = `
          SELECT timestamp, avg_value as value
          FROM telemetry_aggregates
          WHERE vessel_id = ?
          AND metric_name = ?
          AND interval_type = '5min'
          AND timestamp > ?
          ORDER BY timestamp ASC
        `;
        params = [vesselId, metric, since];
      }

      db.all(sql, params, (err, rows) => {
        if (err) {
          console.error('Error getting historical data:', err);
          resolve([]);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  // Get multiple metrics for comparison
  async getMultipleMetrics(vesselId, metrics, timeRange) {
    const results = {};

    for (const metric of metrics) {
      try {
        results[metric] = await this.getHistoricalData(vesselId, metric, timeRange);
      } catch (error) {
        console.error(`Error getting metric ${metric}:`, error);
        results[metric] = [];
      }
    }

    return results;
  }

  // Aggregate data for 5-minute and hourly intervals
  aggregateData(intervalType = '5min') {
    const now = new Date();
    const intervalMs = this.aggregationIntervals[intervalType];
    const startTime = new Date(Math.floor(now.getTime() / intervalMs) * intervalMs - intervalMs);
    const endTime = new Date(startTime.getTime() + intervalMs);

    // Get all vessels
    db.all(
      `SELECT DISTINCT vessel_id FROM telemetry WHERE timestamp >= ? AND timestamp < ?`,
      [startTime.toISOString(), endTime.toISOString()],
      (err, vessels) => {
        if (err) {
          console.error('Error getting vessels for aggregation:', err);
          return;
        }

        vessels.forEach(({ vessel_id }) => {
          this.metrics.forEach(metric => {
            const sql = `
              SELECT
                MIN(${metric}) as min_value,
                MAX(${metric}) as max_value,
                AVG(${metric}) as avg_value,
                COUNT(${metric}) as count
              FROM telemetry
              WHERE vessel_id = ?
              AND timestamp >= ?
              AND timestamp < ?
              AND ${metric} IS NOT NULL
            `;

            db.get(sql, [vessel_id, startTime.toISOString(), endTime.toISOString()], (err, stats) => {
              if (!err && stats && stats.count > 0) {
                const insertSql = `
                  INSERT INTO telemetry_aggregates (
                    vessel_id, timestamp, interval_type, metric_name,
                    min_value, max_value, avg_value, count
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `;

                db.run(insertSql, [
                  vessel_id,
                  startTime.toISOString(),
                  intervalType,
                  metric,
                  stats.min_value,
                  stats.max_value,
                  stats.avg_value,
                  stats.count
                ]);
              }
            });
          });
        });

        console.log(` Aggregated ${intervalType} data for ${vessels.length} vessels`);
      }
    );
  }

  // Clean up old data (older than 1 day)
  cleanupOldData() {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    db.run(`DELETE FROM telemetry WHERE timestamp < ?`, [oneDayAgo], (err) => {
      if (err) console.error('Error cleaning telemetry:', err);
    });

    db.run(`DELETE FROM telemetry_aggregates WHERE timestamp < ?`, [oneDayAgo], (err) => {
      if (err) console.error('Error cleaning aggregates:', err);
    });

    db.run(`DELETE FROM vessel_events WHERE timestamp < ?`, [oneWeekAgo], (err) => {
      if (err) console.error('Error cleaning events:', err);
      else console.log('>ù Cleaned up old data');
    });
  }

  // Export data to CSV format
  exportToCSV(vesselId, timeRange) {
    return new Promise((resolve, reject) => {
      const hoursAgo = {
        '1h': 1,
        '12h': 12,
        '24h': 24
      }[timeRange] || 24;

      const since = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();

      const sql = `
        SELECT * FROM telemetry
        WHERE vessel_id = ?
        AND timestamp > ?
        ORDER BY timestamp DESC
      `;

      db.all(sql, [vesselId, since], (err, rows) => {
        if (err) {
          console.error('Error exporting to CSV:', err);
          resolve('');
        } else if (!rows || rows.length === 0) {
          resolve('');
        } else {
          // Create CSV header
          const headers = Object.keys(rows[0]).join(',');

          // Create CSV rows
          const csvRows = rows.map(row =>
            Object.values(row).map(val =>
              val !== null ? val : ''
            ).join(',')
          );

          resolve(headers + '\n' + csvRows.join('\n'));
        }
      });
    });
  }

  // Get statistics for dashboard
  getStatistics(vesselId, metric, timeRange = '24h') {
    return new Promise((resolve, reject) => {
      const hoursAgo = timeRange === '24h' ? 24 : 1;
      const since = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();

      const sql = `
        SELECT
          MIN(${metric}) as min,
          MAX(${metric}) as max,
          AVG(${metric}) as avg,
          COUNT(${metric}) as count
        FROM telemetry
        WHERE vessel_id = ?
        AND timestamp > ?
        AND ${metric} IS NOT NULL
      `;

      db.get(sql, [vesselId, since], (err, stats) => {
        if (err) {
          console.error('Error getting statistics:', err);
          resolve({ min: 0, max: 0, avg: 0, count: 0 });
        } else {
          resolve(stats || { min: 0, max: 0, avg: 0, count: 0 });
        }
      });
    });
  }
}

module.exports = new HistoricalDataService();
