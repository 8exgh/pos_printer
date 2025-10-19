import Database from 'better-sqlite3';

export function initializeReadModel(db: Database.Database): void {
  console.log('Initializing read model database...');

  // Printers table
  db.exec(`
    CREATE TABLE IF NOT EXISTS printers (
      name TEXT PRIMARY KEY,
      ip_address TEXT NOT NULL,
      port INTEGER NOT NULL,
      created_at TIMESTAMP NOT NULL
    );
  `);

  // Print queue table
  db.exec(`
    CREATE TABLE IF NOT EXISTS print_queue (
      id TEXT PRIMARY KEY,
      printer_name TEXT NOT NULL,
      text_content TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMP NOT NULL,
      completed_at TIMESTAMP,
      FOREIGN KEY (printer_name) REFERENCES printers(name)
    );
  `);

  // Read model checkpoint
  db.exec(`
    CREATE TABLE IF NOT EXISTS read_model_checkpoint (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_sequence_number INTEGER NOT NULL,
      last_event_timestamp TIMESTAMP NOT NULL
    );
  `);

  // Create index on print queue status
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_print_queue_status
    ON print_queue(status, created_at);
  `);

  // Initialize checkpoint if not exists
  const checkpoint = db.prepare('SELECT * FROM read_model_checkpoint WHERE id = 1').get();
  if (!checkpoint) {
    db.prepare(`
      INSERT INTO read_model_checkpoint (id, last_sequence_number, last_event_timestamp)
      VALUES (1, 0, datetime('now'))
    `).run();
    console.log('Initialized read model checkpoint at sequence 0');
  }

  console.log('Read model database initialized successfully');
}
