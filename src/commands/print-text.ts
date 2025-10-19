import { v4 as uuidv4 } from 'uuid';
import { EventStore } from '../event-store/event-store';
import { WriteModelStateBuilder } from '../write-model/state-builder';
import { ReadModelSynchronizer } from '../read-model/synchronizer';
import { PrintRequestedEvent } from '../types/events';

export interface PrintTextCommand {
  printerName: string;
  text: string;
}

export interface PrintTextResult {
  success: boolean;
  printRequestId?: string;
  eventId?: string;
  error?: string;
}

export class PrintTextHandler {
  constructor(
    private eventStore: EventStore,
    private stateBuilder: WriteModelStateBuilder,
    private readModelSync: ReadModelSynchronizer
  ) {}

  handle(command: PrintTextCommand): PrintTextResult {
    console.log(`\n=== Processing PrintText command for: ${command.printerName} ===`);

    // 1. Build current state from events
    const state = this.stateBuilder.buildCurrentState();

    // 2. Validate printer exists
    if (!state.printers.has(command.printerName)) {
      return {
        success: false,
        error: 'Printer not found'
      };
    }

    // 3. Create and persist event
    const printRequestId = uuidv4();
    const event: PrintRequestedEvent = {
      eventId: uuidv4(),
      eventType: 'PrintRequested',
      aggregateId: printRequestId,
      payload: {
        printRequestId,
        printerName: command.printerName,
        textContent: command.text
      },
      createdAt: new Date()
    };

    this.eventStore.appendEvent(event);

    // 4. Synchronize read model
    this.readModelSync.synchronize();

    console.log(`✓ Print request created: ${printRequestId}`);

    return {
      success: true,
      printRequestId,
      eventId: event.eventId
    };
  }
}
