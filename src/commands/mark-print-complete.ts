import { v4 as uuidv4 } from 'uuid';
import { EventStore } from '../event-store/event-store';
import { WriteModelStateBuilder } from '../write-model/state-builder';
import { ReadModelSynchronizer } from '../read-model/synchronizer';
import { PrintCompletedEvent } from '../types/events';

export interface MarkPrintCompleteCommand {
  printRequestId: string;
}

export interface MarkPrintCompleteResult {
  success: boolean;
  eventId?: string;
  error?: string;
}

export class MarkPrintCompleteHandler {
  constructor(
    private eventStore: EventStore,
    private stateBuilder: WriteModelStateBuilder,
    private readModelSync: ReadModelSynchronizer
  ) {}

  handle(command: MarkPrintCompleteCommand): MarkPrintCompleteResult {
    console.log(`\n=== Processing MarkPrintComplete command: ${command.printRequestId} ===`);

    // 1. Build current state from events
    const state = this.stateBuilder.buildCurrentState();

    // 2. Validate print request exists
    const printRequest = state.printRequests.get(command.printRequestId);
    if (!printRequest) {
      return {
        success: false,
        error: 'Print request not found'
      };
    }

    // 3. Validate not already completed
    if (printRequest.status === 'completed') {
      return {
        success: false,
        error: 'Print request already completed'
      };
    }

    // 4. Create and persist event
    const event: PrintCompletedEvent = {
      eventId: uuidv4(),
      eventType: 'PrintCompleted',
      aggregateId: command.printRequestId,
      payload: {
        printRequestId: command.printRequestId
      },
      createdAt: new Date()
    };

    this.eventStore.appendEvent(event);

    // 5. Synchronize read model
    this.readModelSync.synchronize();

    console.log(`✓ Print request marked complete: ${command.printRequestId}`);

    return {
      success: true,
      eventId: event.eventId
    };
  }
}
