import Database from 'better-sqlite3';
import path from 'path';

export class DatabaseConnection {
  private static writeModelDb: Database.Database | null = null;
  private static readModelDb: Database.Database | null = null;

  static getWriteModelDb(): Database.Database {
    if (!this.writeModelDb) {
      const dbPath = process.env.WRITE_MODEL_DB_PATH || './writemodel.db';
      this.writeModelDb = new Database(path.resolve(dbPath));
      this.writeModelDb.pragma('journal_mode = WAL');
      console.log(`Connected to write model database: ${dbPath}`);
    }
    return this.writeModelDb;
  }

  static getReadModelDb(): Database.Database {
    if (!this.readModelDb) {
      const dbPath = process.env.READ_MODEL_DB_PATH || './readmodel.db';
      this.readModelDb = new Database(path.resolve(dbPath));
      this.readModelDb.pragma('journal_mode = WAL');
      console.log(`Connected to read model database: ${dbPath}`);
    }
    return this.readModelDb;
  }

  static closeAll(): void {
    if (this.writeModelDb) {
      this.writeModelDb.close();
      this.writeModelDb = null;
    }
    if (this.readModelDb) {
      this.readModelDb.close();
      this.readModelDb = null;
    }
  }
}
