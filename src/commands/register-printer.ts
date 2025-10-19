import { v4 as uuidv4 } from 'uuid';
import { EventStore } from '../event-store/event-store';
import { WriteModelStateBuilder } from '../write-model/state-builder';
import { ReadModelSynchronizer } from '../read-model/synchronizer';
import { PrinterRegisteredEvent } from '../types/events';

export interface RegisterPrinterCommand {
  name: string;
  ipAddress: string;
  port: number;
}

export interface RegisterPrinterResult {
  success: boolean;
  eventId?: string;
  error?: string;
}

export class RegisterPrinterHandler {
  constructor(
    private eventStore: EventStore,
    private stateBuilder: WriteModelStateBuilder,
    private readModelSync: ReadModelSynchronizer
  ) {}

  handle(command: RegisterPrinterCommand): RegisterPrinterResult {
    console.log(`\n=== Processing RegisterPrinter command: ${command.name} ===`);

    // 1. Validate against allowed IP and port
    const allowedIp = process.env.ALLOWED_PRINTER_IP;
    const allowedPort = parseInt(process.env.ALLOWED_PRINTER_PORT || '9100');

    if (command.ipAddress !== allowedIp) {
      return {
        success: false,
        error: `Invalid IP address. Only ${allowedIp} is allowed`
      };
    }

    if (command.port !== allowedPort) {
      return {
        success: false,
        error: `Invalid port. Only ${allowedPort} is allowed`
      };
    }

    // 2. Build current state from events
    const state = this.stateBuilder.buildCurrentState();

    // 3. Validate printer name uniqueness
    if (state.printers.has(command.name)) {
      return {
        success: false,
        error: 'Printer name already exists'
      };
    }

    // 4. Create and persist event
    const event: PrinterRegisteredEvent = {
      eventId: uuidv4(),
      eventType: 'PrinterRegistered',
      aggregateId: command.name,
      payload: {
        name: command.name,
        ipAddress: command.ipAddress,
        port: command.port
      },
      createdAt: new Date()
    };

    this.eventStore.appendEvent(event);

    // 5. Synchronize read model
    this.readModelSync.synchronize();

    console.log(`✓ Printer registered successfully: ${command.name}`);

    return {
      success: true,
      eventId: event.eventId
    };
  }
}
