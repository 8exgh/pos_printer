import { DatabaseConnection } from '../database/connection';
import { DomainEvent, PersistedEvent } from '../types/events';

export class EventStore {
  private db = DatabaseConnection.getWriteModelDb();

  /**
   * Append a new event to the event store (append-only)
   */
  appendEvent(event: DomainEvent): number {
    const stmt = this.db.prepare(`
      INSERT INTO events (event_id, event_type, aggregate_id, payload, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      event.eventId,
      event.eventType,
      event.aggregateId,
      JSON.stringify(event.payload),
      event.createdAt.toISOString()
    );

    console.log(`Event appended: ${event.eventType} [${event.eventId}] seq=${result.lastInsertRowid}`);
    return result.lastInsertRowid as number;
  }

  /**
   * Get all events (used to rebuild write model state)
   */
  getAllEvents(): DomainEvent[] {
    const stmt = this.db.prepare(`
      SELECT * FROM events ORDER BY sequence_number ASC
    `);

    const rows = stmt.all() as PersistedEvent[];
    return rows.map(this.deserializeEvent);
  }

  /**
   * Get events after a specific sequence number (for read model sync)
   */
  getEventsSinceSequence(sequenceNumber: number): DomainEvent[] {
    const stmt = this.db.prepare(`
      SELECT * FROM events
      WHERE sequence_number > ?
      ORDER BY sequence_number ASC
    `);

    const rows = stmt.all(sequenceNumber) as PersistedEvent[];
    return rows.map(this.deserializeEvent);
  }

  /**
   * Get events for a specific aggregate
   */
  getEventsForAggregate(aggregateId: string): DomainEvent[] {
    const stmt = this.db.prepare(`
      SELECT * FROM events
      WHERE aggregate_id = ?
      ORDER BY sequence_number ASC
    `);

    const rows = stmt.all(aggregateId) as PersistedEvent[];
    return rows.map(this.deserializeEvent);
  }

  /**
   * Get the latest sequence number
   */
  getLatestSequenceNumber(): number {
    const result = this.db.prepare(`
      SELECT MAX(sequence_number) as max_seq FROM events
    `).get() as { max_seq: number | null };

    return result.max_seq || 0;
  }

  /**
   * Deserialize a persisted event into a domain event
   */
  private deserializeEvent(persisted: PersistedEvent): DomainEvent {
    return {
      eventId: persisted.event_id,
      eventType: persisted.event_type,
      aggregateId: persisted.aggregate_id,
      payload: JSON.parse(persisted.payload),
      createdAt: new Date(persisted.created_at)
    } as DomainEvent;
  }
}
