# System Cache Seeding Architecture - Requirements

## Introduction

This document specifies the requirements for fixing the system cache seeding architecture. Currently, joining nodes receive only partition leader addresses from the bootstrap response, which is insufficient for them to write to system tables. The fix ensures that joining nodes receive complete snapshots of all system tables during bootstrap, allowing them to immediately perform reads and writes through the system cache.

## Glossary

- **Seed_Node**: The first node in a cluster that bootstraps system tables and partitions
- **Joining_Node**: A node that joins an existing cluster by contacting the seed node
- **System_Cache**: In-memory cache of all system table data, updated by CDC events
- **System_Tables**: Tables that store cluster metadata (nodes, partitions, services, tables, message_groups, replica_operations)
- **Bootstrap_Response**: HTTP response from seed node containing cluster state for joining node
- **CDC_Subscription**: Real-time subscription to changes in system tables
- **Partition_Leader**: The Raft leader replica of a partition, responsible for writes

## Architecture Principles

From the steering documents and user clarification:

1. **All system information is stored in tables** - No other caches of system information exist
2. **System cache is the single source of truth** - After bootstrap, all queries use the system cache
3. **CDC keeps cache updated** - As tables change, CDC events update the cache on all nodes
4. **All communication goes through message router** - No direct partition access
5. **Most nodes won't have partition replicas** - But their system cache will have all partition leader addresses
6. **Bootstrap directories are temporary** - They should be eliminated after cache hydration

## Requirements

### Requirement 1: Complete System Table Snapshots in Bootstrap Response

**User Story:** As a joining node, I want to receive complete snapshots of all system tables during bootstrap, so that I can immediately perform reads and writes without bootstrap directories.

#### Acceptance Criteria

1. WHEN a joining node contacts the seed node via HTTP bootstrap endpoint THEN the bootstrap response SHALL include complete snapshots of all system tables
2. THE system table snapshots SHALL include:
   - `nodes` table - All registered nodes with their addresses and status
   - `partitions` table - All partitions with their key ranges and replica counts
   - `services` table - All services (partition and message group replicas) with their addresses and Raft roles
   - `tables` table - All user tables with their schemas and policies
   - `message_groups` table - All message groups with their replica counts
   - `replica_operations` table - Any pending replica operations
3. EACH system table snapshot SHALL be a complete array of all current records
4. THE bootstrap response SHALL include the current assignment epoch for rebalancing coordination
5. THE bootstrap response SHALL include cluster configuration (Raft, MessageGroup, Partition settings)
6. THE bootstrap response SHALL be returned only when all service raft groups have a leader

### Requirement 2: System Cache Hydration from Bootstrap Response

**User Story:** As a joining node, I want to hydrate my system cache from the bootstrap response, so that I have the complete cluster state immediately after joining.

#### Acceptance Criteria

1. WHEN a joining node receives the bootstrap response THEN it SHALL hydrate its system cache with all system table snapshots
2. THE system cache hydration SHALL populate all system tables with the snapshot data
3. AFTER hydration completes THEN the system cache SHALL contain the complete current state of all system tables
4. THE hydration process SHALL NOT require any additional queries to the seed node
5. AFTER hydration completes THEN the joining node SHALL be able to perform both reads and writes to system tables using the cache

### Requirement 3: Eliminate Bootstrap Directories After Hydration

**User Story:** As a developer, I want to eliminate bootstrap directories after cache hydration, so that the architecture is simpler and more consistent.

#### Acceptance Criteria

1. WHEN a joining node completes system cache hydration THEN bootstrap directories SHALL be cleared
2. AFTER bootstrap directories are cleared THEN all queries SHALL route through the system cache
3. THE SQL query engine SHALL NOT use bootstrap directories for routing after hydration
4. IF bootstrap directories are accessed after hydration THEN they SHALL be empty or null
5. THE system cache SHALL be the ONLY source of partition location information after hydration

### Requirement 4: CDC Subscriptions Keep Cache Updated

**User Story:** As a joining node, I want CDC subscriptions to keep my system cache updated, so that I always have current cluster state.

#### Acceptance Criteria

1. WHEN a joining node completes bootstrap THEN it SHALL subscribe to CDC events for all system tables
2. WHEN a CDC event is received for a system table THEN the system cache SHALL be updated with the new data
3. THE CDC subscription SHALL include events for:
   - Node registration/removal
   - Partition creation/modification
   - Service registration/removal
   - Table creation/modification
   - Message group creation/removal
   - Replica operation updates
4. WHEN the system cache is updated by CDC THEN all subsequent queries SHALL use the updated data
5. THE CDC subscription SHALL be maintained for the lifetime of the node

### Requirement 5: SQL Engine Routes All Queries Through System Cache

**User Story:** As a SQL query engine, I want to route all queries through the system cache, so that I always use current cluster state.

#### Acceptance Criteria

1. WHEN a SELECT query is executed THEN the SQL engine SHALL use the system cache to find partition locations
2. WHEN an INSERT/UPDATE/DELETE query is executed THEN the SQL engine SHALL:
   - Use the system cache to find the partition for the key
   - Use the system cache to find the partition leader address
   - Route the query through the message router to the leader
3. WHEN a system table query is executed THEN the SQL engine SHALL prefer the partition leader (for consistency)
4. THE SQL engine SHALL NOT use bootstrap directories for routing
5. IF the system cache does not have partition information THEN the query SHALL fail with a clear error

### Requirement 6: Bootstrap Response Building Uses System Cache

**User Story:** As the bootstrap API, I want to build the bootstrap response from the system cache, so that joining nodes receive accurate cluster state.

#### Acceptance Criteria

1. WHEN the bootstrap API builds the bootstrap response THEN it SHALL read all system table data from the system cache
2. THE bootstrap API SHALL use the system cache as the single source of truth for cluster state
3. IF the system cache is not available THEN the bootstrap API SHALL fail with a clear error
4. THE bootstrap response SHALL include complete snapshots of all system tables from the cache
5. THE bootstrap response SHALL be consistent with the current state of the seed node's system cache

### Requirement 7: Seed Node Bootstrap Populates System Cache

**User Story:** As the seed node, I want to populate my system cache during bootstrap, so that the bootstrap response can include complete system table snapshots.

#### Acceptance Criteria

1. WHEN the seed node bootstraps THEN it SHALL create all system tables as partitions
2. WHEN system tables are created THEN the seed node SHALL write initial data DIRECTLY to local partition services (bootstrap mode)
3. AFTER direct writes complete THEN the seed node SHALL populate its system cache by reading from local partitions
4. THE system cache population SHALL include:
   - The seed node itself in the `nodes` table
   - All system table partitions in the `partitions` table
   - All partition replicas in the `services` table
   - All system tables in the `tables` table
   - All message groups in the `message_groups` table
5. AFTER bootstrap completes THEN the system cache SHALL contain the complete initial state
6. THE bootstrap response SHALL be built from this populated system cache

### Requirement 8: Seed Node Bootstrap Mode (Direct Write Path)

**User Story:** As the seed node, I need a temporary direct write path during bootstrap, so that I can write to system tables before the system cache is populated.

#### The Chicken-and-Egg Problem

During seed node bootstrap:
- System cache is empty (no data exists yet)
- Need to write to system tables (to register partitions, services, etc.)
- SQL routing requires cache (`SQLQueryEngine.getTablePartitions()` needs cache)
- **DEADLOCK**: Can't write without cache, can't populate cache without writing

#### Acceptance Criteria

1. WHEN the seed node enters registration phase THEN it SHALL enable bootstrap mode with direct write capability
2. WHILE bootstrap mode is enabled THEN writes to system tables SHALL bypass SQL routing and write DIRECTLY to local partition services
3. THE direct write path SHALL:
   - Parse SQL to determine target table
   - Find local partition service for that table
   - Execute SQL directly on the partition
   - Return result without routing through message router
4. AFTER registration phase completes THEN bootstrap mode SHALL be disabled
5. AFTER bootstrap mode is disabled THEN all writes SHALL route through SQL engine and system cache
6. THE bootstrap mode SHALL be TEMPORARY and SEED NODE ONLY - joining nodes SHALL NOT use bootstrap mode
7. AFTER bootstrap completes THEN there SHALL be NO fallback mechanisms - single code path only

#### Implementation Requirements

1. **CDCIntegrationService** SHALL have methods:
   - `setBootstrapMode(enabled, localPartitionServices)` - Enable/disable bootstrap mode
   - `executeSQLDirectToLocalPartition(sql, params)` - Direct write to local partition
   - `executeSQL(sql, params)` - Route based on bootstrap mode flag

2. **BootstrapService.phaseRegistration()** SHALL:
   - Enable bootstrap mode before system table writes
   - Perform all registration writes (message groups, services, tables, partitions)
   - Disable bootstrap mode after writes complete

3. **BootstrapService.phaseCacheHydration()** SHALL:
   - Read all system table data from local partitions
   - Populate system cache with the data
   - Verify cache contains complete cluster state

#### Bootstrap Mode Data Flow

```
1. phasePartitions() - Create local partition services (cache is EMPTY)
2. phaseRegistration():
   - ENABLE bootstrap mode
   - Write to system tables → DIRECT to local partitions
   - DISABLE bootstrap mode
3. phaseCacheHydration():
   - Read from local partitions
   - Populate system cache
4. Post-bootstrap:
   - All writes → SQL engine → cache lookup → message router → partition leader
```

## Non-Functional Requirements

### Performance

1. Bootstrap response building SHALL complete in < 100ms
2. System cache hydration SHALL complete in < 50ms
3. CDC subscription setup SHALL complete in < 100ms

### Reliability

1. System cache hydration SHALL be atomic - either all tables are hydrated or none
2. CDC subscriptions SHALL be established before the node is marked as READY
3. If CDC subscription fails, the node SHALL fail to join

### Consistency

1. The system cache SHALL always reflect the current state of system tables
2. All nodes SHALL have the same view of system table data (eventually consistent via CDC)
3. Writes to system tables SHALL go through the partition leader (via message router)

## Implementation Notes

### Bootstrap Response Structure

The bootstrap response should include:

```javascript
{
  success: true,
  seedNodeId: string,
  seedNodeAddress: string,
  seedNodeWsAddress: string,
  messageGroupAssignment: Object,
  
  // Complete system table snapshots
  systemTableSnapshots: {
    nodes: Array<NodeRecord>,
    partitions: Array<PartitionRecord>,
    services: Array<ServiceRecord>,
    tables: Array<TableRecord>,
    message_groups: Array<MessageGroupRecord>,
    replica_operations: Array<ReplicaOperationRecord>,
  },
  
  readyNodes: Array<string>,
  tablePolicies: Object,
  currentEpoch: Object,
  clusterConfig: Object,
  
  timestamp: number,
}
```

### System Cache Hydration Process

1. Receive bootstrap response
2. For each system table snapshot:
   - Clear existing cache entries for that table
   - Insert all snapshot records into the cache
3. Verify all tables are populated
4. Mark cache as hydrated
5. Clear bootstrap directories
6. Subscribe to CDC events

### SQL Engine Routing

After hydration:

```javascript
// For any query (SELECT, INSERT, UPDATE, DELETE):
1. Get table partitions from system cache
2. For each partition:
   - Get partition leader from services table in cache
   - Get leader address from services table in cache
3. Route query through message router to leader address
```

## Related Requirements

- System Guidelines: "All information in the system must be stored as tables"
- System Guidelines: "There must be no other caches of system information beside the system cache"
- System Guidelines: "All nodes will have a system cache updated by CDC messages"
