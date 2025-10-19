import { DatabaseConnection } from '../database/connection';
import { EventStore } from '../event-store/event-store';
import { DomainEvent, PrinterRegisteredEvent, PrintRequestedEvent, PrintCompletedEvent, ReadModelCheckpoint } from '../types/events';

/**
 * Synchronizes the read model with new events from the write model.
 * Must be called after each successful command.
 */
export class ReadModelSynchronizer {
  private eventStore: EventStore;
  private readDb = DatabaseConnection.getReadModelDb();

  constructor(eventStore: EventStore) {
    this.eventStore = eventStore;
  }

  /**
   * Synchronize read model with any new events since last checkpoint
   */
  synchronize(): void {
    // Get current checkpoint
    const checkpoint = this.getCheckpoint();

    console.log(`Synchronizing read model from sequence ${checkpoint.last_sequence_number}...`);

    // Get all events since checkpoint
    const newEvents = this.eventStore.getEventsSinceSequence(checkpoint.last_sequence_number);

    if (newEvents.length === 0) {
      console.log('Read model is already up to date');
      return;
    }

    console.log(`Processing ${newEvents.length} new events...`);

    // Apply all new events in a transaction
    const applyEvents = this.readDb.transaction(() => {
      for (const event of newEvents) {
        this.applyEventToReadModel(event);
      }

      // Update checkpoint to latest sequence number
      const latestSequence = this.eventStore.getLatestSequenceNumber();
      this.updateCheckpoint(latestSequence);
    });

    applyEvents();

    console.log(`Read model synchronized to sequence ${this.eventStore.getLatestSequenceNumber()}`);
  }

  /**
   * Get current checkpoint
   */
  private getCheckpoint(): ReadModelCheckpoint {
    const stmt = this.readDb.prepare('SELECT * FROM read_model_checkpoint WHERE id = 1');
    const row = stmt.get() as ReadModelCheckpoint;

    if (!row) {
      throw new Error('Read model checkpoint not initialized');
    }

    return row;
  }

  /**
   * Update checkpoint
   */
  private updateCheckpoint(sequenceNumber: number): void {
    const stmt = this.readDb.prepare(`
      UPDATE read_model_checkpoint
      SET last_sequence_number = ?, last_event_timestamp = datetime('now')
      WHERE id = 1
    `);

    stmt.run(sequenceNumber);
  }

  /**
   * Apply a single event to the read model
   */
  private applyEventToReadModel(event: DomainEvent): void {
    switch (event.eventType) {
      case 'PrinterRegistered':
        this.applyPrinterRegistered(event as PrinterRegisteredEvent);
        break;

      case 'PrintRequested':
        this.applyPrintRequested(event as PrintRequestedEvent);
        break;

      case 'PrintCompleted':
        this.applyPrintCompleted(event as PrintCompletedEvent);
        break;

      default:
        console.warn(`Unknown event type for read model: ${event.eventType}`);
    }
  }

  private applyPrinterRegistered(event: PrinterRegisteredEvent): void {
    const stmt = this.readDb.prepare(`
      INSERT INTO printers (name, ip_address, port, created_at)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(
      event.payload.name,
      event.payload.ipAddress,
      event.payload.port,
      event.createdAt.toISOString()
    );

    console.log(`Read model: Added printer ${event.payload.name}`);
  }

  private applyPrintRequested(event: PrintRequestedEvent): void {
    const stmt = this.readDb.prepare(`
      INSERT INTO print_queue (id, printer_name, text_content, status, created_at)
      VALUES (?, ?, ?, 'pending', ?)
    `);

    stmt.run(
      event.payload.printRequestId,
      event.payload.printerName,
      event.payload.textContent,
      event.createdAt.toISOString()
    );

    console.log(`Read model: Added print request ${event.payload.printRequestId}`);
  }

  private applyPrintCompleted(event: PrintCompletedEvent): void {
    const stmt = this.readDb.prepare(`
      UPDATE print_queue
      SET status = 'completed', completed_at = ?
      WHERE id = ?
    `);

    stmt.run(
      event.createdAt.toISOString(),
      event.payload.printRequestId
    );

    console.log(`Read model: Marked print request ${event.payload.printRequestId} as completed`);
  }

  /**
   * Rebuild entire read model from scratch (for recovery scenarios)
   */
  rebuildFromScratch(): void {
    console.log('Rebuilding read model from scratch...');

    const rebuild = this.readDb.transaction(() => {
      // Clear all read model tables
      this.readDb.exec('DELETE FROM print_queue');
      this.readDb.exec('DELETE FROM printers');

      // Reset checkpoint
      this.readDb.prepare(`
        UPDATE read_model_checkpoint
        SET last_sequence_number = 0
        WHERE id = 1
      `).run();

      // Synchronize from beginning
      this.synchronize();
    });

    rebuild();

    console.log('Read model rebuild complete');
  }
}
