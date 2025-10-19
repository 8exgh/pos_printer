import { DatabaseConnection } from '../database/connection';
import { PrintQueueReadModel, PrinterReadModel } from '../types/events';

export interface PrintQueueItem {
  id: string;
  printerName: string;
  textContent: string;
  ipAddress: string;
  port: number;
  createdAt: string;
}

export interface GetPrintQueueResult {
  printQueue: PrintQueueItem[];
}

export class GetPrintQueueHandler {
  private readDb = DatabaseConnection.getReadModelDb();

  handle(): GetPrintQueueResult {
    console.log('\n=== Processing GetPrintQueue query ===');

    // Query pending print jobs with printer connection details
    const stmt = this.readDb.prepare(`
      SELECT
        pq.id,
        pq.printer_name,
        pq.text_content,
        pq.created_at,
        p.ip_address,
        p.port
      FROM print_queue pq
      JOIN printers p ON pq.printer_name = p.name
      WHERE pq.status = 'pending'
      ORDER BY pq.created_at ASC
    `);

    const rows = stmt.all() as Array<{
      id: string;
      printer_name: string;
      text_content: string;
      created_at: string;
      ip_address: string;
      port: number;
    }>;

    const printQueue: PrintQueueItem[] = rows.map(row => ({
      id: row.id,
      printerName: row.printer_name,
      textContent: row.text_content,
      ipAddress: row.ip_address,
      port: row.port,
      createdAt: row.created_at
    }));

    console.log(`✓ Found ${printQueue.length} pending print jobs`);

    return { printQueue };
  }
}
