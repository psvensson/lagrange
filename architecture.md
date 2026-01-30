# Distributed Database System Architecture

This document describes the architecture of the distributed database system. It should be updated as features are added or changed.

## Overview

A scalable distributed database where:
- ALL persistent information is stored in tables
- ALL tables are implemented as partitions
- ALL partitions are Raft consensus groups with odd-numbered replicas (minimum 3)
- ALL partitions use SQLite for storage

## Core Principles

1. **Tables as the Universal Storage Model** - System metadata and user data are stored in tables
2. **Partitions as Raft Groups** - Each partition is a Raft consensus group using liferaft
3. **System Cache as Single Source of Truth** - In-memory cache of system tables, updated by CDC events
4. **Message Router for All Communication** - All messages (local and remote) route through WebSocket-based MessageRouter
5. **No Fallback Code Paths** - Single code path for any given logic; no legacy or alternative mechanisms

## System Tables

The following system tables store cluster metadata:

| Table | Purpose | Primary Key |
|-------|---------|-------------|
| `nodes` | All registered nodes with addresses and status | `node_id` |
| `partitions` | All partitions with key ranges and replica counts | `partition_id` |
| `services` | All partition and message group replicas with addresses and Raft roles | `service_id` |
| `tables` | All user tables with schemas and policies | `table_id` |
| `message_groups` | All message groups with replica counts | `group_id` |
| `replica_operations` | Pending replica operations (splits, merges, rebalancing) | `operation_id` |
| `indices` | Secondary indices for tables | `index_id` |
| `logs` | System logs | `log_id` |
| `config` | Dynamic configuration | `config_key` |
| `live_queries` | Active live query subscriptions | `query_id` |
| `contexts` | Function execution contexts | `context_id` |
| `code` | Stored functions/procedures | `code_id` |

## Component Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Node                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐  │
│  │   Admin API     │  │  Bootstrap API  │  │      SQL Query Engine       │  │
│  │  (WebSocket)    │  │    (HTTP)       │  │                             │  │
│  └────────┬────────┘  └────────┬────────┘  └──────────────┬──────────────┘  │
│           │                    │                          │                  │
│           ▼                    ▼                          ▼                  │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                        System Table Cache                             │   │
│  │              (In-memory, updated by CDC events only)                  │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│           │                    │                          │                  │
│           ▼                    ▼                          ▼                  │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                         Message Router                                │   │
│  │           (WebSocket-based, handles local and remote)                 │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│           │                    │                          │                  │
│           ▼                    ▼                          ▼                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐  │
│  │ Message Group   │  │ Message Group   │  │    Partition Services       │  │
│  │ Replica 1       │  │ Replica 2       │  │    (SQLite + Raft)          │  │
│  │ (Raft)          │  │ (Raft)          │  │                             │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Key Components

### NodeService (Singleton)
- Administrative component present on every node
- Manages service lifecycle and health monitoring
- Owns the system table cache (singleton per node)
- Tracks partition leadership locally

### MessageRouter
- Unified message routing for local and remote communication
- WebSocket-based transport (mandatory)
- Self-connection for uniform routing (all messages go through WebSocket)
- Address format: `{nodeId}/{entityType}/{entityId}`

### SystemTableCache
- In-memory cache of all system tables
- Updated ONLY by CDC events (single source of truth)
- Provides read-only wrapper for safe access
- Supports cache change listeners for reactive updates

### CDCIntegrationService
- Routes all system table writes through SQL
- Bootstrap mode for seed node direct writes (temporary)
- Normal mode routes through SQL engine to partition leaders
- Generates CDC events that update all node caches

### PartitionService
- SQLite-backed Raft group for data storage
- Uses liferaft library for Raft consensus
- Generates CDC events on writes
- Supports transactions (single-partition only)

### MessageGroupService
- Reliable inter-service communication
- 3-replica Raft groups using liferaft
- Ensures message delivery with retry logic
- Every node has at least one message group replica

### SQLQueryEngine
- Main entry point for SQL query processing
- Routes queries through system cache to find partition leaders
- Supports SELECT, INSERT, UPDATE, DELETE, CREATE TABLE
- Transaction support (BEGIN, COMMIT, ROLLBACK)

### UnifiedRebalancer
- Manages replica placement for partitions and message groups
- Operates autonomously (no manual placement)
- Uses policies to determine target replica count and placement
- Stabilization period prevents thrashing

## Bootstrap Process

### Seed Node Bootstrap

```
Phase 1: Infrastructure
├── Initialize ConfigurationManager
├── Initialize NodeService (creates SystemTableCache)
├── Create MessageRouter with WebSocket server
└── Establish self-connection for uniform routing

Phase 2: Message Groups
├── Create 3 message group replicas (deferred election)
├── Register handlers with MessageRouter
└── Elections deferred until Phase 3 complete

Phase 3: Partitions
├── Create partition services for all system tables
├── Each partition is a 3-replica Raft group
├── Start elections for message groups and partitions
└── Wait for leadership establishment

Phase 4: Registration (Bootstrap Mode)
├── Enable bootstrap mode (direct writes)
├── Write initial system table data directly to partitions
├── Register nodes, services, partitions, tables
└── Disable bootstrap mode

Phase 5: Cache Hydration
├── Read all system table data from local partitions
├── Populate system cache with complete cluster state
└── All subsequent writes route through SQL engine
```

### Joining Node Bootstrap

```
1. HTTP Bootstrap Request → Contact seed node via /bootstrap endpoint
2. Receive Complete Snapshots → Bootstrap response includes all system tables
3. Cache Hydration → Populate local system cache from snapshots
4. CDC Subscription → Subscribe to CDC events for all system tables
5. Node Registration → Register self in nodes table (routes through SQL)
6. Ready → Node is ready to serve queries
```

## Data Flow

### Query Routing Flow

```
Client SQL Query
       │
       ▼
┌──────────────────┐
│ SQL Query Engine │
│   (Parse SQL)    │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  System Cache    │
│ (Find partitions)│
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│Partition Resolver│
│(Determine target)│
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  System Cache    │
│(Find leader addr)│
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Message Router   │
│(Deliver to leader)│
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│Partition Service │
│ (Execute query)  │
└────────┬─────────┘
         │
         ▼
    Return Results
```

### CDC Event Flow

```
Write Operation (INSERT/UPDATE/DELETE)
              │
              ▼
┌─────────────────────────┐
│   Partition Leader      │
│   (Write to SQLite)     │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│   CDC Event Generated   │
│   (table, op, data)     │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│   Message Group         │
│   (Broadcast to nodes)  │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│   All Nodes             │
│   (Update local cache)  │
└─────────────────────────┘
```

## Address Format

All services use a unified address format:
```
{nodeId}/{entityType}/{entityId}
```

Examples:
- `node-1/partition/partition-nodes-p1-r1`
- `node-2/message-group/mg-1-r2`
- `seed-node/lifecycle`

Entity types:
- `partition` - Partition service replicas
- `message-group` - Message group replicas
- `lifecycle` - Node lifecycle handler

## Raft Consensus

### Configuration
- Heartbeat interval: 150ms (configurable)
- Election timeout: 1000-3000ms (configurable)
- Replica-index-based jitter prevents election storms

### Leadership
- Single-replica groups become leader immediately
- Multi-replica groups use standard Raft election
- Deferred election start during bootstrap prevents storms
- Learner phase for new replicas joining existing groups

### Log Storage
- Message groups: In-memory log adapter
- Partitions: SQLite log adapter (persistent)

## Rebalancing

### Triggers
- Node join/leave
- Replica failure
- Policy changes
- Periodic checks

### Stabilization
- Minimum 1000ms, maximum 10000ms
- Prevents thrashing during cluster changes
- Timer resets on state changes

### Policies
- Target replica count (odd numbers: 3, 5, 7)
- Placement constraints (spread across nodes)
- Resource thresholds (CPU, memory, disk)

## Configuration

Configuration is centralized in ConfigurationManager with sections:
- `node` - Node identity and addresses
- `raft` - Raft consensus parameters
- `messageGroup` - Message group settings
- `partition` - Partition management
- `logging` - Logging configuration
- `transport` - WebSocket transport settings
- `query` - Query execution settings
- `bootstrap` - Bootstrap process settings

## Error Handling

- Try/catch errors MUST NOT be swallowed
- Errors must be re-thrown or clearly logged
- No try/catch for conditionals or communication flow
- Transient errors (no leader, cache unavailable) trigger retries

## Testing

- Node.js built-in test runner with tap
- Property-based testing with fast-check (max 10 iterations)
- Tests must complete in under 2 seconds
- No skipped tests allowed
