# Distributed Database System

A scalable distributed database system with self-contained metadata storage, built on Raft consensus.

## Overview

This system implements a distributed database where ALL persistent information is stored in tables, ALL tables are implemented as partitions, and ALL partitions are Raft consensus groups with odd-numbered replicas (minimum 3) using SQLite for storage.

It aims to have similar(ish) functionality to that of Spanner and CockroachDB, a sclalble and distributed Db where the system itself partitions and replicas according to user policy - no manual placement.

It also aims, as a future feature to allow code to be executed near teh data it should operate on or with. Like rpc calls with SELECT routing, or accomodating stored procedures, perhaps.

Everything in the system is stoed as tables.
All tables are imnplemented as partitions.
All partitions are raft groups using sqlite for storage..

The system stores infromation abohut itself in itself.

There are other raft abstractions - one is the message group, where every node in the system must be a part of one. So nodes organizes in one way themselves in three-ring raft group replicas which uses in-memory sqlite to ensure message deliveries to other nodes.

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

### Core Principles

1. **All Information in Tables**: System metadata and user data are stored in tables
2. **Tables as Partitions**: Each table is implemented as one or more partitions
3. **Partitions as Raft Groups**: Each partition is a Raft consensus group using liferaft
4. **System Cache**: In-memory cache of system tables, updated by CDC events
5. **Message Router**: All communication (even local) goes through message groups

### System Cache Seeding Architecture

The system cache is the single source of truth for cluster metadata. All nodes maintain an in-memory cache of system tables that is kept up-to-date through Change Data Capture (CDC) events.

#### System Tables

The following system tables store cluster metadata:

- **nodes**: All registered nodes with addresses and status
- **partitions**: All partitions with key ranges and replica counts
- **services**: All partition and message group replicas with addresses and Raft roles
- **tables**: All user tables with schemas and policies
- **message_groups**: All message groups with replica counts
- **replica_operations**: Pending replica operations (splits, merges, rebalancing)

#### Bootstrap Process

**Seed Node Bootstrap:**

1. **Infrastructure Phase**: Create node service and message router
2. **Message Groups Phase**: Create message group replicas
3. **Partitions Phase**: Create partition services for system tables
4. **Registration Phase** (Bootstrap Mode):
   - Enable bootstrap mode with direct write capability
   - Write initial data DIRECTLY to local partition services
   - Register message groups, services, tables, and partitions
   - Disable bootstrap mode
5. **Cache Hydration Phase**:
   - Read all system table data from local partitions
   - Populate system cache with complete cluster state
6. **Post-Bootstrap**: All writes route through SQL engine and system cache

**Joining Node Bootstrap:**

1. **HTTP Bootstrap Request**: Contact seed node via `/bootstrap` endpoint
2. **Receive Complete Snapshots**: Bootstrap response includes complete snapshots of all system tables
3. **Cache Hydration**: Populate local system cache from snapshots
4. **CDC Subscription**: Subscribe to CDC events for all system tables
5. **Node Registration**: Register self in nodes table (routes through system cache)
6. **Ready**: Node is ready to serve queries

#### Query Routing

All SQL queries route through the system cache:

1. **Parse SQL**: Determine target table and operation
2. **Find Partitions**: Query system cache for table partitions
3. **Resolve Partition**: Determine which partition(s) to query based on key
4. **Find Leader**: Query services table in cache for partition leader address
5. **Route Query**: Send query through message router to leader address
6. **Return Results**: Aggregate results from all queried partitions

**Example Query Flow:**

```
SELECT * FROM users WHERE user_id = 123
  ↓
System Cache: Find partitions for 'users' table
  ↓
Partition Resolver: Determine partition for key 123
  ↓
System Cache: Find leader address for partition
  ↓
Message Router: Deliver query to leader
  ↓
Return results
```

#### CDC Subscription

Change Data Capture keeps the system cache synchronized across all nodes:

1. **Subscription**: Each node subscribes to CDC events for all system tables
2. **Event Generation**: When system tables change, CDC events are generated
3. **Event Propagation**: CDC events are streamed to all nodes via message groups
4. **Cache Update**: Each node updates its local system cache from CDC events
5. **Eventual Consistency**: All nodes eventually have the same view of system tables

**CDC Event Flow:**

```
Node A: INSERT INTO nodes (...)
  ↓
Partition Leader: Write to SQLite
  ↓
CDC Service: Generate change event
  ↓
Message Group: Broadcast to all nodes
  ↓
All Nodes: Update system cache
  ↓
All Nodes: Can now route queries to new node
```

#### Bootstrap Mode (Seed Node Only)

The seed node faces a chicken-and-egg problem during bootstrap:
- System cache is empty (no data exists yet)
- Need to write to system tables (to register partitions, services, etc.)
- SQL routing requires cache to find partition leaders
- **Solution**: Temporary bootstrap mode with direct write path

**Bootstrap Mode Characteristics:**

- **Temporary**: Only active during seed node registration phase
- **Direct Writes**: Bypass SQL routing, write directly to local partitions
- **Single Use**: Disabled immediately after registration completes
- **Seed Node Only**: Joining nodes never use bootstrap mode

After bootstrap mode is disabled, the seed node populates its system cache by reading from local partitions, then all subsequent writes route through the SQL engine like any other node.

### Core Components

1. **Configuration Manager**: Centralized configuration with validation
2. **Logger Factory**: Structured logging with pino
3. **Worker Thread Pool Manager**: Service execution in worker threads
4. **System Table Cache**: In-memory cache of cluster metadata
5. **CDC Integration Service**: Change data capture for cache synchronization
6. **Message Router**: Reliable message delivery through message groups
7. **SQL Query Engine**: Query parsing, routing, and execution
8. **Bootstrap Service**: Seed node initialization
9. **Node Joining Service**: Joining node bootstrap

### Key Features

- **Configuration Centralization**: All constants accessible via symbolic names
- **Structured Logging**: Consistent metadata (node_id, service_id, timestamp)
- **Worker Thread Pool**: Efficient service execution with piscina
- **Validation**: JSON schema validation for all configuration
- **System Cache**: Single source of truth for cluster metadata
- **CDC Synchronization**: Automatic cache updates across all nodes
- **Cache-Based Routing**: All queries route through system cache
- **Bootstrap Mode**: Seed node can bootstrap without existing cache

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
