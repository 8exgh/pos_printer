# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a POS printer management system for Star Micronics TSP100 printers built using **CQRS (Command Query Responsibility Segregation)** and **Event Sourcing** patterns in TypeScript/Node.js.

The system consists of two separate services:
1. **CQRS+ES Backend API** - Handles commands, emits events, maintains read/write models, serves queries
2. **Background Processor Service** - Polls for print jobs and executes raster printing to TSP100 printers

## Architecture

### Event Sourcing Pattern
- **Write Model**: Single append-only `events` table in SQLite (`writemodel.db`)
- **Read Model**: Derived state tables in separate SQLite database (`readmodel.db`)
- **Critical Rule**: For every command, rebuild the write model state from ALL events (never cache aggregate state)
- Read model must be synchronously updated after each successful command
- Events are NEVER deleted or modified - they are the source of truth

### Command Processing Flow
1. Validate API key
2. Load ALL events from write model and build in-memory state
3. Validate command against current state
4. Persist new event(s) to write model
5. Synchronously update read model (check checkpoint, apply new events, update checkpoint)
6. Return response

### Database Separation
- `writemodel.db` contains only the `events` table (append-only event log)
- `readmodel.db` contains `printers`, `print_queue`, and `read_model_checkpoint` tables
- Read model can be completely rebuilt from events if corrupted

## Event Types

Three core event types drive the system:
1. **PrinterRegistered** - New printer added to system
2. **PrintRequested** - New print job created
3. **PrintCompleted** - Print job successfully executed

Event structure includes: `eventId` (UUID), `eventType`, `aggregateId`, `payload`, `createdAt`

## API Structure

### Commands (POST endpoints)
- `/commands/register-printer` - Add new printer (validates against hardcoded allowed IP/port from env vars)
- `/commands/print-text` - Queue new print job
- `/commands/mark-print-complete` - Mark job as completed (called by background processor)

### Queries (GET endpoints)
- `/queries/print-queue` - Get pending print jobs with printer connection details

All endpoints require `X-API-Key` header matching `API_KEY` environment variable.

## Background Processor

Runs in 1-second polling loop:
1. Query `/queries/print-queue` endpoint
2. Take first pending job
3. Convert text to raster bitmap format
4. Send to TSP100 via TCP/IP using printer's IP and port
5. If successful, call `/commands/mark-print-complete`

Must handle printer disconnections gracefully and only mark jobs complete on successful print.

## Environment Variables

### CQRS+ES Backend
- `API_KEY` - Shared authentication key
- `ALLOWED_PRINTER_IP` - Hardcoded allowed printer IP for registration
- `ALLOWED_PRINTER_PORT` - Hardcoded allowed printer port for registration
- `WRITE_MODEL_DB_PATH` - Path to write model database (default: `./writemodel.db`)
- `READ_MODEL_DB_PATH` - Path to read model database (default: `./readmodel.db`)
- `PORT` - API server port (default: 3000)

### Background Processor
- `API_KEY` - Same as backend API key
- `CQRS_API_URL` - Backend API URL (default: `http://localhost:3000`)
- `POLL_INTERVAL_MS` - Polling interval (default: 1000)

## Key Implementation Considerations

1. **Never cache aggregate state** - Always rebuild from events on each command
2. **Synchronous read model updates** - Must happen immediately after event persistence
3. **Checkpoint tracking** - Read model tracks last processed sequence number for recovery
4. **Event immutability** - Events are never modified or deleted
5. **Idempotency** - Commands should be designed to be idempotent where possible
6. **Transaction usage** - Use database transactions for consistency
7. **Extensive logging** - For debugging and audit trail purposes

## TSP100 Printer Integration

- Communication via TCP/IP sockets
- Uses ESC/POS command protocol
- Text must be converted to raster/bitmap format before printing
- Recommended libraries: `canvas` or `jimp` for raster conversion, `net` module for TCP

## Testing Strategy

- Unit tests for command handlers
- Integration tests for event sourcing flow
- Test read model rebuild capability from events
- Validate event immutability
- Test printer communication error handling
