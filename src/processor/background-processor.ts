import { config } from 'dotenv';
import { TSP100Printer } from './tsp100-printer';

// Load environment variables
config();

interface PrintQueueItem {
  id: string;
  printerName: string;
  textContent: string;
  ipAddress: string;
  port: number;
  createdAt: string;
}

interface PrintQueueResponse {
  printQueue: PrintQueueItem[];
}

/**
 * Background Processor Service
 * Polls the CQRS API for pending print jobs and executes them
 */
class BackgroundProcessor {
  private apiUrl: string;
  private apiKey: string;
  private pollInterval: number;
  private printer: TSP100Printer;
  private isRunning: boolean = false;

  constructor() {
    this.apiUrl = process.env.CQRS_API_URL || 'http://localhost:3000';
    this.apiKey = process.env.API_KEY || '';
    this.pollInterval = parseInt(process.env.POLL_INTERVAL_MS || '1000');
    this.printer = new TSP100Printer();

    if (!this.apiKey) {
      throw new Error('API_KEY environment variable is required');
    }
  }

  /**
   * Start the background processor loop
   */
  async start(): Promise<void> {
    console.log('\n' + '='.repeat(60));
    console.log('POS Printer Background Processor');
    console.log('='.repeat(60));
    console.log(`API URL: ${this.apiUrl}`);
    console.log(`Poll Interval: ${this.pollInterval}ms`);
    console.log('='.repeat(60) + '\n');

    this.isRunning = true;

    while (this.isRunning) {
      try {
        await this.processNextJob();
      } catch (error) {
        console.error('Error in processor loop:', error);
      }

      // Wait for next poll interval
      await this.sleep(this.pollInterval);
    }
  }

  /**
   * Stop the processor
   */
  stop(): void {
    console.log('\nStopping background processor...');
    this.isRunning = false;
  }

  /**
   * Process the next job in the queue
   */
  private async processNextJob(): Promise<void> {
    // 1. Query print queue
    const queue = await this.queryPrintQueue();

    if (queue.length === 0) {
      // No jobs to process
      return;
    }

    const job = queue[0];
    console.log(`\n[${new Date().toISOString()}] Processing job ${job.id}...`);
    console.log(`  Printer: ${job.printerName}`);
    console.log(`  Address: ${job.ipAddress}:${job.port}`);
    console.log(`  Text: ${job.textContent.substring(0, 50)}${job.textContent.length > 50 ? '...' : ''}`);

    // 2. Print to TSP100
    const success = await this.printer.printText(
      job.ipAddress,
      job.port,
      job.textContent
    );

    // 3. Mark complete if successful
    if (success) {
      await this.markPrintComplete(job.id);
      console.log(`✓ Job ${job.id} completed successfully`);
    } else {
      console.error(`✗ Job ${job.id} failed - will retry on next poll`);
    }
  }

  /**
   * Query the print queue from the CQRS API
   */
  private async queryPrintQueue(): Promise<PrintQueueItem[]> {
    try {
      const response = await fetch(`${this.apiUrl}/queries/print-queue`, {
        method: 'GET',
        headers: {
          'X-API-Key': this.apiKey
        }
      });

      if (!response.ok) {
        throw new Error(`API returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as PrintQueueResponse;
      return data.printQueue;
    } catch (error) {
      console.error('Failed to query print queue:', error);
      return [];
    }
  }

  /**
   * Mark a print job as complete
   */
  private async markPrintComplete(printRequestId: string): Promise<void> {
    try {
      const response = await fetch(`${this.apiUrl}/commands/mark-print-complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey
        },
        body: JSON.stringify({ printRequestId })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`API returned ${response.status}: ${error}`);
      }

      const result = await response.json() as { success: boolean; eventId: string };
      console.log(`Marked complete (event: ${result.eventId})`);
    } catch (error) {
      console.error('Failed to mark print complete:', error);
      throw error;
    }
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Start the processor
const processor = new BackgroundProcessor();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  processor.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\nSIGINT received, shutting down gracefully...');
  processor.stop();
  process.exit(0);
});

// Start processing
processor.start().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
