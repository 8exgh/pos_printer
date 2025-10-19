// Event Types for Event Sourcing

export interface Event {
  eventId: string;        // UUID
  eventType: string;
  aggregateId: string;
  payload: Record<string, any>;
  createdAt: Date;
}

export interface PrinterRegisteredEvent extends Event {
  eventType: 'PrinterRegistered';
  payload: {
    name: string;
    ipAddress: string;
    port: number;
  };
}

export interface PrintRequestedEvent extends Event {
  eventType: 'PrintRequested';
  payload: {
    printRequestId: string;  // UUID
    printerName: string;
    textContent: string;
  };
}

export interface PrintCompletedEvent extends Event {
  eventType: 'PrintCompleted';
  payload: {
    printRequestId: string;
  };
}

export type DomainEvent = PrinterRegisteredEvent | PrintRequestedEvent | PrintCompletedEvent;

// Persisted event structure (with sequence number)
export interface PersistedEvent {
  sequence_number: number;
  event_id: string;
  event_type: string;
  aggregate_id: string;
  payload: string;  // JSON string
  created_at: string;
}

// Write Model State (in-memory aggregate state)
export interface WriteModelState {
  printers: Map<string, {
    name: string;
    ipAddress: string;
    port: number;
    createdAt: Date;
  }>;
  printRequests: Map<string, {
    id: string;
    printerName: string;
    textContent: string;
    status: 'pending' | 'completed';
    createdAt: Date;
    completedAt?: Date;
  }>;
}

// Read Model structures
export interface PrinterReadModel {
  name: string;
  ip_address: string;
  port: number;
  created_at: string;
}

export interface PrintQueueReadModel {
  id: string;
  printer_name: string;
  text_content: string;
  status: 'pending' | 'completed';
  created_at: string;
  completed_at: string | null;
}

export interface ReadModelCheckpoint {
  id: number;
  last_sequence_number: number;
  last_event_timestamp: string;
}
