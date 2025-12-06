const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize database
const dbPath = path.join(dataDir, 'ferry_telemetry.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('✅ Database connected at:', dbPath);
  }
});

// Enable WAL mode for better concurrent access
db.exec('PRAGMA journal_mode = WAL');

// Initialize schema
function initializeDatabase() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Raw telemetry data table
      db.run(`
        CREATE TABLE IF NOT EXISTS telemetry (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          vessel_id TEXT NOT NULL,
          timestamp DATETIME NOT NULL,
          engine_rpm INTEGER,
          engine_temp REAL,
          fuel_flow REAL,
          battery_soc REAL,
          voltage REAL,
          generator_load REAL,
          speed REAL,
          heading INTEGER,
          latitude REAL,
          longitude REAL,
          bilge_level REAL,
          co2_level REAL,
          operational_state TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) console.error('Error creating telemetry table:', err);
      });

      // Create indexes
      db.run(`
        CREATE INDEX IF NOT EXISTS idx_telemetry_vessel_time
        ON telemetry(vessel_id, timestamp DESC)
      `);

      db.run(`
        CREATE INDEX IF NOT EXISTS idx_telemetry_timestamp
        ON telemetry(timestamp DESC)
      `);

      // Aggregated data table
      db.run(`
        CREATE TABLE IF NOT EXISTS telemetry_aggregates (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          vessel_id TEXT NOT NULL,
          timestamp DATETIME NOT NULL,
          interval_type TEXT NOT NULL,
          metric_name TEXT NOT NULL,
          min_value REAL,
          max_value REAL,
          avg_value REAL,
          count INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) console.error('Error creating aggregates table:', err);
      });

      // Create indexes for aggregates
      db.run(`
        CREATE INDEX IF NOT EXISTS idx_aggregates_lookup
        ON telemetry_aggregates(vessel_id, interval_type, metric_name, timestamp DESC)
      `);

      db.run(`
        CREATE INDEX IF NOT EXISTS idx_aggregates_time
        ON telemetry_aggregates(timestamp DESC)
      `);

      // Events table for tracking alerts and state changes
      db.run(`
        CREATE TABLE IF NOT EXISTS vessel_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          vessel_id TEXT NOT NULL,
          timestamp DATETIME NOT NULL,
          event_type TEXT NOT NULL,
          severity TEXT,
          message TEXT,
          data TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) console.error('Error creating events table:', err);
        else resolve();
      });

      db.run(`
        CREATE INDEX IF NOT EXISTS idx_events_vessel_time
        ON vessel_events(vessel_id, timestamp DESC)
      `);

      console.log('✅ Database schema initialized');
    });
  });
}

// Initialize database on module load
initializeDatabase().catch(console.error);

module.exports = db;
