import Database from 'better-sqlite3';

export function initializeWriteModel(db: Database.Database): void {
  console.log('Initializing write model database...');

  // Create events table (append-only)
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      sequence_number INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL UNIQUE,
      event_type TEXT NOT NULL,
      aggregate_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_aggregate_id ON events(aggregate_id);
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_event_type ON events(event_type);
  `);

  console.log('Write model database initialized successfully');
}
