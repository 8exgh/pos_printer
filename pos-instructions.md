# POS Printer API Specification
## CQRS + Event Sourcing Architecture with Star Micronics TSP100

### System Overview

This specification defines a TypeScript/Node.js API system for managing and printing to Star Micronics TSP100 POS printers using CQRS (Command Query Responsibility Segregation) and Event Sourcing patterns. The system consists of two main components: a CQRS+ES backend API and a background processor service.

### Architecture Components

#### 1. CQRS+ES Backend API
- **Technology Stack:** TypeScript, Node.js
- **Databases:**
    - Write Model: SQLite database with single `events` table (append-only)
    - Read Model: SQLite database with derived state tables
- **Authentication:** Environment variable API key
- **Responsibilities:** Handle commands, emit events, maintain read model, serve queries

#### 2. Background Processor Service
- **Technology Stack:** TypeScript, Node.js
- **Execution:** Runs in 1-second interval loop
- **Responsibilities:** Poll for print jobs, execute raster printing to TSP100, mark jobs complete

### Database Schemas

#### Write Model Database (`writemodel.db`)

```sql
CREATE TABLE events (
    sequence_number INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL UNIQUE,
    event_type TEXT NOT NULL,
    aggregate_id TEXT NOT NULL,
    payload TEXT NOT NULL, -- JSON string
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_aggregate_id ON events(aggregate_id);
CREATE INDEX idx_event_type ON events(event_type);
```

#### Read Model Database (`readmodel.db`)

```sql
-- Printers table
CREATE TABLE printers (
    name TEXT PRIMARY KEY,
    ip_address TEXT NOT NULL,
    port INTEGER NOT NULL,
    created_at TIMESTAMP NOT NULL
);

-- Print queue table
CREATE TABLE print_queue (
    id TEXT PRIMARY KEY,
    printer_name TEXT NOT NULL,
    text_content TEXT NOT NULL,
    status TEXT DEFAULT 'pending', -- 'pending' or 'completed'
    created_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP,
    FOREIGN KEY (printer_name) REFERENCES printers(name)
);

-- Read model tracking
CREATE TABLE read_model_checkpoint (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    last_sequence_number INTEGER NOT NULL,
    last_event_timestamp TIMESTAMP NOT NULL
);

CREATE INDEX idx_print_queue_status ON print_queue(status, created_at);
```

### Event Types

```typescript
interface Event {
    eventId: string;        // UUID
    eventType: string;
    aggregateId: string;
    payload: object;
    createdAt: Date;
}

// Event Types
interface PrinterRegisteredEvent extends Event {
    eventType: 'PrinterRegistered';
    payload: {
        name: string;
        ipAddress: string;
        port: number;
    };
}

interface PrintRequestedEvent extends Event {
    eventType: 'PrintRequested';
    payload: {
        printRequestId: string;  // UUID
        printerName: string;
        textContent: string;
    };
}

interface PrintCompletedEvent extends Event {
    eventType: 'PrintCompleted';
    payload: {
        printRequestId: string;
    };
}
```

### API Endpoints

#### Commands

**1. Register Printer**
```
POST /commands/register-printer
Headers:
  X-API-Key: {api-key}
Body:
{
  "name": "string",
  "ipAddress": "string",
  "port": number
}

Response:
  200: { "success": true, "eventId": "uuid" }
  422: { "error": "Invalid IP address or port" }
  409: { "error": "Printer name already exists" }
  401: { "error": "Unauthorized" }
```

Validation:
- Hard-coded allowed IP and port (environment variables: `ALLOWED_PRINTER_IP`, `ALLOWED_PRINTER_PORT`)
- Unique printer name check against current state

**2. Print Text**
```
POST /commands/print-text
Headers:
  X-API-Key: {api-key}
Body:
{
  "printerName": "string",
  "text": "string"
}

Response:
  200: { "success": true, "printRequestId": "uuid", "eventId": "uuid" }
  404: { "error": "Printer not found" }
  401: { "error": "Unauthorized" }
```

**3. Mark Print Complete**
```
POST /commands/mark-print-complete
Headers:
  X-API-Key: {api-key}
Body:
{
  "printRequestId": "uuid"
}

Response:
  200: { "success": true, "eventId": "uuid" }
  404: { "error": "Print request not found" }
  400: { "error": "Print request already completed" }
  401: { "error": "Unauthorized" }
```

#### Queries

**Get Print Queue**
```
GET /queries/print-queue
Headers:
  X-API-Key: {api-key}

Response:
  200: {
    "printQueue": [
      {
        "id": "uuid",
        "printerName": "string",
        "textContent": "string",
        "ipAddress": "string",
        "port": number,
        "createdAt": "ISO-8601"
      }
    ]
  }
  401: { "error": "Unauthorized" }
```

### Command Processing Flow

1. **Receive Command Request**
2. **Validate API Key**
3. **Build Current Write Model State**
    - Load ALL events from write model database
    - Apply events sequentially to build in-memory state
4. **Validate Command** (using current state)
5. **Create and Persist Event(s)** to write model
6. **Synchronously Update Read Model**
    - Check last applied sequence number from checkpoint
    - Apply all new events since checkpoint
    - Update checkpoint with latest sequence number
7. **Return Success Response**

### Read Model Synchronization

The read model must be kept synchronized after every successful command:

```typescript
interface ReadModelUpdater {
    async updateReadModel(): Promise<void> {
        // 1. Get last checkpoint
        // 2. Load all events after checkpoint
        // 3. Apply each event to read model tables
        // 4. Update checkpoint
    }
}
```

### Background Processor Implementation

**Main Loop (every 1 second):**
```typescript
while (true) {
    try {
        // 1. Query print queue from CQRS backend
        const queue = await queryPrintQueue();
        
        if (queue.length > 0) {
            const job = queue[0]; // Take first item
            
            // 2. Convert text to raster format
            const rasterData = await convertToRaster(job.textContent);
            
            // 3. Send to TSP100 printer
            const success = await printToTSP100(
                job.ipAddress, 
                job.port, 
                rasterData
            );
            
            // 4. If successful, mark complete
            if (success) {
                await markPrintComplete(job.id);
            }
        }
    } catch (error) {
        console.error('Background processor error:', error);
    }
    
    await sleep(1000);
}
```

### TSP100 Raster Printing

The background processor must:
1. Convert text to bitmap/raster format
2. Format data according to TSP100 protocol
3. Send via TCP/IP to printer's IP:port
4. Handle connection errors gracefully

Recommended libraries:
- `canvas` or `jimp` for raster conversion
- `net` module for TCP communication
- TSP100 command reference for ESC/POS commands

### Environment Variables

**CQRS+ES Backend:**
```env
API_KEY=your-secure-api-key
ALLOWED_PRINTER_IP=192.168.1.100
ALLOWED_PRINTER_PORT=9100
WRITE_MODEL_DB_PATH=./writemodel.db
READ_MODEL_DB_PATH=./readmodel.db
PORT=3000
```

**Background Processor:**
```env
API_KEY=your-secure-api-key
CQRS_API_URL=http://localhost:3000
POLL_INTERVAL_MS=1000
```

### Error Handling

1. **Write Model Integrity:** Never delete or modify events
2. **Read Model Recovery:** If read model is corrupted/deleted, rebuild from events
3. **Printer Communication:** Log failures, don't mark job complete if print fails
4. **Idempotency:** Commands should be idempotent where possible

### Security Notes

- MVP uses hardcoded allowed IP/port for printer registration
- API key authentication via environment variable
- Both services must share the same API key
- No external network access assumed (controlled environment)

### Implementation Priorities

1. **Phase 1:** Core CQRS+ES infrastructure
    - Event store implementation
    - Command handlers
    - Read model synchronization

2. **Phase 2:** API endpoints
    - Command endpoints with validation
    - Query endpoint for print queue

3. **Phase 3:** Background processor
    - Polling mechanism
    - Raster conversion
    - TSP100 communication

4. **Phase 4:** Testing & hardening
    - Unit tests for command handlers
    - Integration tests for event sourcing
    - Read model rebuild capability

### Key Implementation Considerations

- **Always rebuild write model state from events** for each command
- **Synchronously update read model** after each successful command
- **Track checkpoint** in read model for recovery scenarios
- **Use transactions** where appropriate for consistency
- **Log extensively** for debugging and audit trail
- **Handle TSP100 disconnections** gracefully in background processor

This specification provides a complete blueprint for implementing the POS printer management system using CQRS+ES patterns with proper separation of concerns between command handling and print job execution.