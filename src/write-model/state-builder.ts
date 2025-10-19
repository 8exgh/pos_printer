import { EventStore } from '../event-store/event-store';
import { WriteModelState, DomainEvent, PrinterRegisteredEvent, PrintRequestedEvent, PrintCompletedEvent } from '../types/events';

/**
 * Builds the current write model state by replaying ALL events from the event store.
 * This is the core of Event Sourcing - state is derived from events.
 */
export class WriteModelStateBuilder {
  private eventStore: EventStore;

  constructor(eventStore: EventStore) {
    this.eventStore = eventStore;
  }

  /**
   * Build the current state by replaying all events.
   * This MUST be called for every command to ensure state consistency.
   */
  buildCurrentState(): WriteModelState {
    const state: WriteModelState = {
      printers: new Map(),
      printRequests: new Map()
    };

    // Load ALL events and replay them
    const events = this.eventStore.getAllEvents();

    console.log(`Rebuilding state from ${events.length} events...`);

    for (const event of events) {
      this.applyEvent(state, event);
    }

    console.log(`State rebuilt: ${state.printers.size} printers, ${state.printRequests.size} print requests`);

    return state;
  }

  /**
   * Apply a single event to the state (event handler)
   */
  private applyEvent(state: WriteModelState, event: DomainEvent): void {
    switch (event.eventType) {
      case 'PrinterRegistered':
        this.applyPrinterRegistered(state, event);
        break;

      case 'PrintRequested':
        this.applyPrintRequested(state, event);
        break;

      case 'PrintCompleted':
        this.applyPrintCompleted(state, event);
        break;

      default:
        // TypeScript knows this should never happen
        const exhaustiveCheck: never = event;
        console.warn(`Unknown event type: ${(exhaustiveCheck as any).eventType}`);
    }
  }

  private applyPrinterRegistered(state: WriteModelState, event: PrinterRegisteredEvent): void {
    state.printers.set(event.payload.name, {
      name: event.payload.name,
      ipAddress: event.payload.ipAddress,
      port: event.payload.port,
      createdAt: event.createdAt
    });
  }

  private applyPrintRequested(state: WriteModelState, event: PrintRequestedEvent): void {
    state.printRequests.set(event.payload.printRequestId, {
      id: event.payload.printRequestId,
      printerName: event.payload.printerName,
      textContent: event.payload.textContent,
      status: 'pending',
      createdAt: event.createdAt
    });
  }

  private applyPrintCompleted(state: WriteModelState, event: PrintCompletedEvent): void {
    const printRequest = state.printRequests.get(event.payload.printRequestId);
    if (printRequest) {
      printRequest.status = 'completed';
      printRequest.completedAt = event.createdAt;
    }
  }
}
