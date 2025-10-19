import express, { Request, Response, NextFunction } from 'express';
import { config } from 'dotenv';
import { EventStore } from '../event-store/event-store';
import { WriteModelStateBuilder } from '../write-model/state-builder';
import { ReadModelSynchronizer } from '../read-model/synchronizer';
import { RegisterPrinterHandler } from '../commands/register-printer';
import { PrintTextHandler } from '../commands/print-text';
import { MarkPrintCompleteHandler } from '../commands/mark-print-complete';
import { GetPrintQueueHandler } from '../queries/get-print-queue';

// Load environment variables
config();

const app = express();
app.use(express.json());

// Initialize dependencies
const eventStore = new EventStore();
const stateBuilder = new WriteModelStateBuilder(eventStore);
const readModelSync = new ReadModelSynchronizer(eventStore);

// Command handlers
const registerPrinterHandler = new RegisterPrinterHandler(eventStore, stateBuilder, readModelSync);
const printTextHandler = new PrintTextHandler(eventStore, stateBuilder, readModelSync);
const markPrintCompleteHandler = new MarkPrintCompleteHandler(eventStore, stateBuilder, readModelSync);

// Query handlers
const getPrintQueueHandler = new GetPrintQueueHandler();

// Authentication middleware
function authenticateApiKey(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'];
  const expectedApiKey = process.env.API_KEY;

  if (!expectedApiKey) {
    return res.status(500).json({ error: 'API_KEY not configured' });
  }

  if (apiKey !== expectedApiKey) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}

// Apply authentication to all routes
app.use(authenticateApiKey);

// === COMMAND ENDPOINTS ===

app.post('/commands/register-printer', (req: Request, res: Response) => {
  try {
    const { name, ipAddress, port } = req.body;

    if (!name || !ipAddress || !port) {
      return res.status(400).json({ error: 'Missing required fields: name, ipAddress, port' });
    }

    const result = registerPrinterHandler.handle({
      name,
      ipAddress,
      port: parseInt(port)
    });

    if (!result.success) {
      if (result.error?.includes('already exists')) {
        return res.status(409).json({ error: result.error });
      }
      if (result.error?.includes('Invalid')) {
        return res.status(422).json({ error: result.error });
      }
      return res.status(400).json({ error: result.error });
    }

    res.status(200).json({
      success: true,
      eventId: result.eventId
    });
  } catch (error) {
    console.error('Error in register-printer:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/commands/print-text', (req: Request, res: Response) => {
  try {
    const { printerName, text } = req.body;

    if (!printerName || !text) {
      return res.status(400).json({ error: 'Missing required fields: printerName, text' });
    }

    const result = printTextHandler.handle({
      printerName,
      text
    });

    if (!result.success) {
      if (result.error?.includes('not found')) {
        return res.status(404).json({ error: result.error });
      }
      return res.status(400).json({ error: result.error });
    }

    res.status(200).json({
      success: true,
      printRequestId: result.printRequestId,
      eventId: result.eventId
    });
  } catch (error) {
    console.error('Error in print-text:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/commands/mark-print-complete', (req: Request, res: Response) => {
  try {
    const { printRequestId } = req.body;

    if (!printRequestId) {
      return res.status(400).json({ error: 'Missing required field: printRequestId' });
    }

    const result = markPrintCompleteHandler.handle({ printRequestId });

    if (!result.success) {
      if (result.error?.includes('not found')) {
        return res.status(404).json({ error: result.error });
      }
      if (result.error?.includes('already completed')) {
        return res.status(400).json({ error: result.error });
      }
      return res.status(400).json({ error: result.error });
    }

    res.status(200).json({
      success: true,
      eventId: result.eventId
    });
  } catch (error) {
    console.error('Error in mark-print-complete:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// === QUERY ENDPOINTS ===

app.get('/queries/print-queue', (req: Request, res: Response) => {
  try {
    const result = getPrintQueueHandler.handle();
    res.status(200).json(result);
  } catch (error) {
    console.error('Error in get-print-queue:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'healthy' });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log('POS Printer CQRS+ES API Server');
  console.log('='.repeat(60));
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log('='.repeat(60) + '\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\nSIGINT received, shutting down gracefully...');
  process.exit(0);
});
