# Distributed Database System - Technical Design

## Overview

This document provides the technical design for a distributed database system built in Node.js. The system uses Raft consensus for replication, SQLite for storage, and WebSocket for inter-node communication.

**Design Document Structure:**
This design is organized into multiple files for maintainability. Each major section has a dedicated file with detailed specifications, linked via file references below.

## Architecture

The system follows a peer-to-peer architecture where every node is equal. There are no dedicated coordinator nodes - any node can handle any request.

**Key Architectural Principles:**
- **Peer-to-Peer**: All nodes are equal, no single point of failure
- **Raft Consensus**: Strong consistency through leader election and log replication
- **SQLite Storage**: Each partition replica uses an embedded SQLite database
- **WebSocket Transport**: Efficient bidirectional communication between nodes
- **Message Groups**: Reliable message routing with cached system metadata

For detailed architecture diagrams and component interactions, see:
#[[file:.kiro/specs/distributed-database-system/design-architecture.md]]

## Core Components

The system consists of three main service types:

1. **Node Service**: Manages node lifecycle, health monitoring, and service coordination
2. **Message Group Service**: Routes messages, caches system metadata, handles CDC events
3. **Partition Service**: Stores user data, executes queries, manages Raft replication

For library dependencies, threading architecture, and implementation guidelines, see:
#[[file:.kiro/specs/distributed-database-system/design-components.md]]

## Node Service

The Node Service is the entry point for each node in the cluster. It manages:
- Bootstrap process (seed node vs joining node)
- Health monitoring and heartbeat updates
- Service lifecycle (starting/stopping partition and message group services)
- Node statistics collection (CPU, memory, disk)

For detailed Node Service specifications, see:
#[[file:.kiro/specs/distributed-database-system/design-node-service.md]]

## Message Group Service

Message Groups provide reliable message routing with local caching of system metadata. Each message group:
- Maintains a Raft-replicated cache of system tables
- Routes messages to appropriate partition replicas
- Processes CDC events to keep cache synchronized
- Handles message retry with exponential backoff

For detailed Message Group specifications including transport rules and cache management, see:
#[[file:.kiro/specs/distributed-database-system/design-message-group.md]]

## Partition Service

Partitions store user data and handle query execution. Each partition:
- Uses SQLite for persistent storage
- Replicates data via Raft consensus
- Handles split/merge operations based on size and traffic
- Supports transactions within partition boundaries

For detailed Partition Service specifications including storage and Raft integration, see:
#[[file:.kiro/specs/distributed-database-system/design-partition-service.md]]

## Data Models

The system uses several system tables to track cluster state:
- `nodes`: Node membership and health status
- `partitions`: Partition metadata and key ranges
- `replicas`: Replica placement and status
- `message_groups`: Message group membership
- `config`: Dynamic configuration values
- `logs`: System-wide logging

For complete system table schemas, address formats, and CDC event specifications, see:
#[[file:.kiro/specs/distributed-database-system/design-data-models.md]]

## Error Handling and Recovery

The system handles various failure scenarios:
- Node failures (detected via heartbeat timeout)
- Network partitions (Raft leader election)
- Replica failures (automatic rebalancing)
- Query failures (retry with exponential backoff)

For detailed failure scenarios and recovery strategies, see:
#[[file:.kiro/specs/distributed-database-system/design-error-handling.md]]

## Testing Strategy

The system uses comprehensive testing:
- Unit tests for individual components
- Property-based tests for invariants
- Integration tests for multi-node scenarios
- Chaos tests for failure injection

For detailed testing strategy and property-based testing framework, see:
#[[file:.kiro/specs/distributed-database-system/design-testing-strategy.md]]

## Correctness Properties

The system maintains 83 correctness properties across all components, ensuring:
- Data consistency (Raft linearizability)
- Availability (replica placement, failover)
- Partition tolerance (network partition handling)

For the complete list of correctness properties, see:
#[[file:.kiro/specs/distributed-database-system/design-correctness-properties.md]]

## Configuration

The system provides dynamic configuration through a system table, enabling runtime updates and hot reload without restarts.

**Design Philosophy:**
- **Configuration as Data**: All config stored in `config` system table
- **Environment Variable Seeding**: Initial values from env vars at startup
- **Hot Reload**: Most config changes apply immediately via watchers
- **Audit Trail**: Track who changed what and when
- **Type Safety**: Validate config values before applying
- **Default Values**: Every config key has a sensible default

For the complete configuration catalog with all configuration keys, see:
#[[file:.kiro/specs/distributed-database-system/design-configuration.md]]

## Retry Protocol and Cache Handling

For simplified retry protocol with exponential backoff and graceful cache staleness handling, see:
#[[file:.kiro/specs/distributed-database-system/design-retry-protocol.md]]

## State Machines for Critical Operations

For detailed state machines covering bootstrap, partition split/merge, and replica rebalancing, see:
#[[file:.kiro/specs/distributed-database-system/design-state-machines.md]]

## Single Executable Packaging

For building the system and CLI tool as free-standing single executables, see:
#[[file:.kiro/specs/distributed-database-system/design-packaging.md]]

## Future Enhancements

Planned enhancements for future versions:
- Cross-partition transactions (2PC)
- Read replicas for scaling reads
- Geo-distributed deployments
- Advanced query optimization
- Backup and restore functionality
