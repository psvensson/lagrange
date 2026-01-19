# Distributed Database System

A scalable distributed database system with self-contained metadata storage, built on Raft consensus.

## Overview

This system implements a distributed database where ALL persistent information is stored in tables, ALL tables are implemented as partitions, and ALL partitions are Raft consensus groups with odd-numbered replicas (minimum 3) using SQLite for storage.

## Requirements

- Node.js >= 22.0.0
- npm

## Installation

```bash
npm install
```

## Configuration

Configuration can be provided via environment variables or the central configuration system.

### Environment Variables

Create a `.env` file based on `.env.example`:

```bash
# Node Configuration
NODE_ID=node-1
SEED_NODE_ADDRESS=http://seed-node:8080
REST_API_PORT=8080

# Logging Configuration
LOG_LEVEL=info
LOG_PRETTY_PRINT=false
```

### Configuration Sections

The system uses a centralized configuration system with the following sections:

- **node**: Node-specific settings (ID, seed address, REST API port)
- **raft**: Raft consensus parameters (election timeouts, heartbeat interval)
- **messageGroup**: Message group configuration (replica count, retry settings)
- **partition**: Partition management (split/merge thresholds, replication)
- **logging**: Logging configuration (level, pretty print)
- **workerThreads**: Thread pool settings (min/max threads, idle timeout)
- **bootstrap**: Bootstrap process settings (leadership timeouts)
- **query**: Query execution settings (timeouts, buffer limits)

## Running

```bash
# Start the system
npm start

# Run tests
npm test

# Run linter
npm run lint
```

## Architecture

### Core Components

1. **Configuration Manager**: Centralized configuration with validation
2. **Logger Factory**: Structured logging with pino
3. **Worker Thread Pool Manager**: Service execution in worker threads

### Key Features

- **Configuration Centralization**: All constants accessible via symbolic names
- **Structured Logging**: Consistent metadata (node_id, service_id, timestamp)
- **Worker Thread Pool**: Efficient service execution with piscina
- **Validation**: JSON schema validation for all configuration

## Testing

The system uses Node.js built-in test runner with property-based testing via fast-check.

```bash
# Run all tests
npm test

# Run specific test file
node --test test/config/configuration.test.js
```

### Test Coverage

- **Property Tests**: Configuration validation and centralization
- **Unit Tests**: Logging metadata consistency

## Development

### Code Style

The project follows Google JavaScript style guide with ESLint:

- 2-space indentation
- Single quotes for strings
- Semicolons required
- Max line length: 100 characters

```bash
# Check linting
npm run lint

# Fix linting issues
npm run lint:fix
```

## Project Structure

```
.
├── src/
│   ├── config/          # Configuration management
│   ├── logging/         # Logging infrastructure
│   ├── threading/       # Worker thread pool
│   └── index.js         # Main entry point
├── test/
│   ├── config/          # Configuration tests
│   └── logging/         # Logging tests
├── package.json
├── .eslintrc.json
└── README.md
```

## License

MIT
