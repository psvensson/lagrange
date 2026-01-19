# Requirements Document: Admin CLI Cache Hydration Fix

## Introduction

This spec addresses the issue where the Admin CLI terminal UI shows empty views after server restart. The root cause is that CDC events are only generated for NEW writes to system tables, not for existing data that was persisted in SQLite before the restart. This means the SystemTableCache in message groups starts empty on restart, and the Admin CLI receives an empty cache dump.

Additionally, when new nodes join the cluster, the Admin CLI doesn't receive real-time updates because CDC events aren't being properly forwarded to connected WebSocket clients.

## Problem Statement

**Current Behavior:**
1. Server starts fresh (empty data directory) → CDC events flow → Admin CLI shows all data ✓
2. Server restarts with existing SQLite data → No CDC events → Admin CLI shows empty views ✗
3. Second node joins cluster → CDC events generated → Admin CLI doesn't update ✗

**Root Causes:**
1. SystemTableCache is only populated via CDC events from partition writes
2. On restart, existing SQLite data doesn't trigger CDC events
3. CDC event forwarding to AdminWebSocketAPI clients is not working

**Key Insight:** Since all message group replicas receive the same CDC events and maintain identical caches, it doesn't matter which replica's cache is used. In larger clusters, there's typically only one message group replica per node anyway.

## Glossary

- **Cache_Hydration**: The process of populating the SystemTableCache with existing data from system table partitions on startup
- **CDC_Forwarding**: Broadcasting CDC events to connected Admin CLI WebSocket clients in real-time
- **System_Table_Partition**: A partition that stores system metadata (nodes, services, tables, partitions, message_groups, indices)
- **Bootstrap_Phase**: The initialization sequence when a node starts up

## Requirements

### Requirement 1: Cache Hydration on Startup

**User Story:** As a system administrator, I want the Admin CLI to show all system data after server restart, so that I can monitor the cluster state regardless of when the server was started.

#### Acceptance Criteria

1. WHEN the bootstrap process completes, THE System SHALL hydrate the SystemTableCache with existing data from all system table partitions
2. THE cache hydration SHALL query each system table partition (via SQL SELECT *) and populate the cache
3. THE cache hydration SHALL occur AFTER partition Raft leadership is established
4. THE cache hydration SHALL complete BEFORE the Admin WebSocket API accepts connections
5. WHEN cache hydration fails for any system table, THE System SHALL log an error and continue with partial data
6. THE cache hydration SHALL NOT generate CDC events (direct cache population, not via partition writes)
7. THE System SHALL hydrate data for: nodes, services, tables, partitions, message_groups, indices

### Requirement 2: CDC Event Forwarding to Admin CLI

**User Story:** As a system administrator, I want to see real-time updates in the Admin CLI when cluster state changes, so that I can monitor the system without manual refresh.

#### Acceptance Criteria

1. WHEN a CDC event is applied to the SystemTableCache, THE cache SHALL emit a notification event
2. THE AdminWebSocketAPI SHALL subscribe to cache notification events during initialization
3. WHEN a cache notification is received, THE AdminWebSocketAPI SHALL broadcast the CDC event to all connected clients
4. THE CDC event broadcast SHALL include: table name, operation (INSERT/UPDATE/DELETE), record data, timestamp
5. WHEN a client disconnects, THE AdminWebSocketAPI SHALL clean up resources but no explicit unsubscription is needed
6. THE CDC forwarding SHALL be non-blocking (use setImmediate or similar to avoid blocking the CDC pipeline)

### Requirement 3: Cache Dump Completeness

**User Story:** As a system administrator, I want the initial cache dump to contain all system data, so that the Admin CLI displays complete information immediately on connection.

#### Acceptance Criteria

1. WHEN an Admin CLI connects, THE cache dump SHALL include all data from: nodes, services, tables, partitions, message_groups, indices
2. THE cache dump SHALL be sent within 5 seconds of connection establishment
3. IF the cache is empty at connection time, THE AdminWebSocketAPI SHALL query system table partitions directly to build the dump
4. THE cache dump format SHALL match the existing protocol: `{ type: 'cache_dump', data: { nodes: [...], services: [...], ... } }`

### Requirement 4: Node Join CDC Propagation

**User Story:** As a system administrator, I want to see new nodes appear in the Admin CLI immediately when they join, so that I can verify cluster expansion.

#### Acceptance Criteria

1. WHEN a new node joins the cluster, THE seed node SHALL write the node entry to the nodes system table
2. THE nodes table write SHALL generate a CDC event that flows through the normal CDC pipeline
3. THE CDC event SHALL be forwarded to all connected Admin CLI clients via the cache notification mechanism
4. THE Admin CLI SHALL display the new node within 1 second of receiving the CDC event
5. WHEN services are created on the new node, THE services table CDC events SHALL also be forwarded

