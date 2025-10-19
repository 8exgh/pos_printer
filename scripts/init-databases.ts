import { config } from 'dotenv';
import { DatabaseConnection } from '../src/database/connection';
import { initializeWriteModel } from '../src/database/init-writemodel';
import { initializeReadModel } from '../src/database/init-readmodel';

// Load environment variables
config();

async function main() {
  try {
    console.log('Starting database initialization...\n');

    // Initialize Write Model
    const writeDb = DatabaseConnection.getWriteModelDb();
    initializeWriteModel(writeDb);

    // Initialize Read Model
    const readDb = DatabaseConnection.getReadModelDb();
    initializeReadModel(readDb);

    console.log('\n✓ All databases initialized successfully!');

    DatabaseConnection.closeAll();
    process.exit(0);
  } catch (error) {
    console.error('Failed to initialize databases:', error);
    DatabaseConnection.closeAll();
    process.exit(1);
  }
}

main();
