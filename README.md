# POS Printer API - CQRS + Event Sourcing

A TypeScript/Node.js system for managing and printing to Star Micronics TSP100 POS printers using CQRS (Command Query Responsibility Segregation) and Event Sourcing patterns.

## Architecture

The system consists of two services:

1. **CQRS+ES Backend API** - Handles commands, emits events, maintains read/write models, serves queries
2. **Background Processor** - Polls for print jobs and executes raster printing to TSP100 printers

### Event Sourcing Pattern

- **Write Model**: Append-only event log in `writemodel.db`
- **Read Model**: Optimized query tables in `readmodel.db`
- **State Reconstruction**: Current state is always rebuilt from events for each command
- **Synchronization**: Read model updates synchronously after each command

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Edit `.env` file with your configuration:

```env
# API Authentication
API_KEY=your-secure-api-key

# Allowed Printer (hardcoded for MVP)
ALLOWED_PRINTER_IP=192.168.1.100
ALLOWED_PRINTER_PORT=9100

# Database Paths
WRITE_MODEL_DB_PATH=./writemodel.db
READ_MODEL_DB_PATH=./readmodel.db

# API Server
PORT=3000

# Background Processor
CQRS_API_URL=http://localhost:3000
POLL_INTERVAL_MS=1000
```

### 3. Initialize Databases

```bash
npm run init-db
```

This creates both `writemodel.db` and `readmodel.db` with the required schemas.

## Running the System

### Start the API Server

```bash
npm run dev:api
```

The API will be available at `http://localhost:3000`

### Start the Background Processor

In a separate terminal:

```bash
npm run dev:processor
```

The processor will poll for print jobs every second.

## API Endpoints

All endpoints require the `X-API-Key` header.

### Commands

**Register Printer**
```bash
curl -X POST http://localhost:3000/commands/register-printer \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "main-printer",
    "ipAddress": "192.168.1.100",
    "port": 9100
  }'
```

**Print Text**
```bash
curl -X POST http://localhost:3000/commands/print-text \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "printerName": "main-printer",
    "text": "Hello from POS Printer!\nOrder #12345"
  }'
```

**Mark Print Complete** (called by background processor)
```bash
curl -X POST http://localhost:3000/commands/mark-print-complete \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "printRequestId": "uuid-here"
  }'
```

### Queries

**Get Print Queue**
```bash
curl -X GET http://localhost:3000/queries/print-queue \
  -H "X-API-Key: your-api-key"
```

## Event Types

The system uses three core events:

1. **PrinterRegistered** - New printer added to system
2. **PrintRequested** - New print job created
3. **PrintCompleted** - Print job successfully executed

All state changes flow through events - the event log is the source of truth.

## Development Scripts

```bash
# Build TypeScript
npm run build

# Initialize databases
npm run init-db

# Start API server (production)
npm run start:api

# Start background processor (production)
npm run start:processor

# Start API server (development with auto-reload)
npm run dev:api

# Start background processor (development with auto-reload)
npm run dev:processor

# Clean build artifacts and databases
npm run clean
```

## Project Structure

```
src/
├── types/          # Event and domain type definitions
├── database/       # Database initialization and connections
├── event-store/    # Event persistence layer
├── write-model/    # State reconstruction from events
├── read-model/     # Read model synchronization
├── commands/       # Command handlers (business logic)
├── queries/        # Query handlers
├── api/            # Express API server
└── processor/      # Background processor service
    ├── background-processor.ts  # Main polling loop
    └── tsp100-printer.ts       # TSP100 communication
```

## How It Works

### Command Processing Flow

1. API receives command (e.g., register printer, print text)
2. Validates API key
3. Rebuilds current state from ALL events in write model
4. Validates command against current state
5. Creates and appends new event to write model
6. Synchronously updates read model
7. Returns success response

### Background Processor Flow

1. Polls `/queries/print-queue` every second
2. Takes first pending job
3. Converts text to raster bitmap
4. Sends to TSP100 via TCP/IP
5. If successful, calls `/commands/mark-print-complete`

## TSP100 Printer Details

- **Communication**: TCP/IP sockets
- **Protocol**: ESC/POS commands
- **Paper Width**: 72mm (576 dots at 203dpi)
- **Format**: Raster bit image

The system automatically converts text to monochrome bitmaps suitable for the TSP100.

## Testing the System

1. Start both services (API + processor)
2. Register a printer (use your printer's IP from `.env`)
3. Send a print request
4. Watch the background processor pick up and execute the job
5. Check the print queue to see status changes

## Read Model Recovery

If the read model becomes corrupted, you can rebuild it from events:

```typescript
// In your code
const synchronizer = new ReadModelSynchronizer(eventStore);
synchronizer.rebuildFromScratch();
```

This demonstrates the power of Event Sourcing - the event log is always the source of truth.

## Notes

- Events are NEVER deleted or modified
- State is always derived from events
- Read model is a projection for fast queries
- Printer IP/port are hardcoded in `.env` for MVP security
- Background processor handles printer disconnections gracefully
