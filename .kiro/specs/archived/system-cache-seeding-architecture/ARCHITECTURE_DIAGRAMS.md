# System Cache Seeding Architecture - Diagrams

This document contains visual diagrams of the system cache seeding architecture.

## Current State (Broken)

### Bootstrap Sequence

```
┌─────────────────────────────────────────────────────────────────┐
│ SEED NODE BOOTSTRAP                                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Create system table partitions                             │
│  2. Create message groups                                      │
│  3. Build bootstrap response with ONLY partitionLeaders        │
│                                                                 │
│  Bootstrap Response:                                           │
│  {                                                             │
│    partitionLeaders: {                                         │
│      nodes: {address: 'node1/partition/r1'},                  │
│      partitions: {address: 'node1/partition/r2'},             │
│      ...                                                       │
│    },                                                          │
│    messageGroupAssignment: {...}                              │
│  }                                                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ JOINING NODE                                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Receive bootstrap response (INCOMPLETE!)                   │
│  2. Try to write to replica_operations table                   │
│  3. FAIL: No partition leader address in cache                 │
│  4. Workaround: Use bootstrap directories                      │
│                                                                 │
│  Problem: Bootstrap directories are:                           │
│  - Temporary (cleared after hydration)                         │
│  - Incomplete (missing many system tables)                     │
│  - Inconsistent (different on each node)                       │
│  - Not updated by CDC                                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Query Routing (Current - Broken)

```
SQL Query: INSERT INTO replica_operations (...)
  ↓
SQLQueryEngine.executeQuery()
  ↓
Get table partitions:
  1. Try system cache → EMPTY (no replica_operations partition info)
  2. Try bootstrap directories → INCOMPLETE (missing partition info)
  3. FAIL: Cannot find partition leader
  ↓
ERROR: "No leader available for write operation"
```

## Target State (Fixed)

### Bootstrap Sequence

```
┌─────────────────────────────────────────────────────────────────┐
│ SEED NODE BOOTSTRAP                                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Create system table partitions                             │
│  2. Populate system cache with initial data:                   │
│     - nodes table: seed node                                   │
│     - partitions table: all system table partitions            │
│     - services table: all partition replicas                   │
│     - tables table: all system tables                          │
│     - message_groups table: all message groups                 │
│     - replica_operations table: (empty)                        │
│  3. Build bootstrap response with COMPLETE snapshots           │
│                                                                 │
│  Bootstrap Response:                                           │
│  {                                                             │
│    systemTableSnapshots: {                                     │
│      nodes: [{node_id: 'seed', address: '...'}],              │
│      partitions: [{partition_id: 'p1', ...}, ...],            │
│      services: [{service_id: 'r1', ...}, ...],                │
│      tables: [{table_id: 'nodes', ...}, ...],                 │
│      message_groups: [{group_id: 'mg1', ...}, ...],           │
│      replica_operations: []                                    │
│    },                                                          │
│    messageGroupAssignment: {...}                              │
│  }                                                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ JOINING NODE - PHASE 1: HYDRATE CACHE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Receive bootstrap response (COMPLETE!)                     │
│  2. Hydrate system cache from snapshots:                       │
│     for each system table snapshot:                            │
│       for each record in snapshot:                             │
│         cache.insert(tableName, record)                        │
│  3. Clear bootstrap directories                                │
│                                                                 │
│  Result: System cache now has COMPLETE cluster state           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ JOINING NODE - PHASE 2: REGISTER & SUBSCRIBE                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Register this node in nodes table:                         │
│     INSERT INTO nodes (node_id, node_address, status, ...)    │
│     Query routes through message router to partition leader    │
│  2. Subscribe to CDC events for all system tables              │
│  3. Cache will be updated as cluster state changes             │
│                                                                 │
│  Result: Joining node is now part of cluster                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Query Routing (Target - Fixed)

```
SQL Query: INSERT INTO replica_operations (...)
  ↓
SQLQueryEngine.executeQuery()
  ↓
Get table partitions from system cache:
  1. Query cache for partitions where table_name = 'replica_operations'
  2. Found: [{partition_id: 'p1', ...}]
  ↓
For each partition:
  1. Find partition leader from services table in cache:
     - Query cache for services where:
       - partition_id = 'p1'
       - service_type = 'PARTITION'
       - raft_role = 'LEADER'
       - status = 'ACTIVE'
     - Found: [{address: 'node1/partition/r1', ...}]
  2. Route query through message router to leader:
     messageRouter.deliver('node1/partition/r1', {
       type: 'QUERY',
       operation: 'INSERT',
       sql: ast,
       params: [...]
     })
  ↓
SUCCESS: Query executed on partition leader
```

## System Cache Hydration Flow

```
┌──────────────────────────────────────────────────────────────────┐
│ Bootstrap Response Received                                      │
│ {systemTableSnapshots: {nodes: [...], partitions: [...], ...}}  │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│ For each system table snapshot:                                  │
│                                                                  │
│  nodes: [{node_id: 'seed', ...}, {node_id: 'join1', ...}]      │
│    ↓ cache.insert('nodes', record) for each                     │
│    ↓ System cache now has all nodes                             │
│                                                                  │
│  partitions: [{partition_id: 'p1', ...}, ...]                  │
│    ↓ cache.insert('partitions', record) for each                │
│    ↓ System cache now has all partitions                        │
│                                                                  │
│  services: [{service_id: 'r1', ...}, ...]                      │
│    ↓ cache.insert('services', record) for each                  │
│    ↓ System cache now has all services (with leader info)       │
│                                                                  │
│  tables: [{table_id: 'nodes', ...}, ...]                        │
│    ↓ cache.insert('tables', record) for each                    │
│    ↓ System cache now has all tables                            │
│                                                                  │
│  message_groups: [{group_id: 'mg1', ...}, ...]                 │
│    ↓ cache.insert('message_groups', record) for each            │
│    ↓ System cache now has all message groups                    │
│                                                                  │
│  replica_operations: []                                         │
│    ↓ cache.insert('replica_operations', record) for each        │
│    ↓ System cache now has all replica operations                │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│ System Cache Hydration Complete                                  │
│                                                                  │
│ System Cache now contains:                                       │
│ - All nodes in cluster                                           │
│ - All partitions for all tables                                  │
│ - All services (partition and message group replicas)            │
│ - All table definitions                                          │
│ - All message group definitions                                  │
│ - All pending replica operations                                 │
│                                                                  │
│ Joining node can now:                                            │
│ - Query any system table                                         │
│ - Write to any system table                                      │
│ - Route queries to correct partition leaders                     │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

## CDC Subscription and Cache Update Flow

```
┌──────────────────────────────────────────────────────────────────┐
│ Joining Node Subscribes to CDC Events                            │
│                                                                  │
│ for each system table:                                           │
│   cdcIntegrationService.subscribe(tableName, (event) => {        │
│     // Cache will be updated automatically                       │
│   })                                                             │
│                                                                  │
│ Subscribed tables:                                               │
│ - nodes                                                          │
│ - partitions                                                     │
│ - services                                                       │
│ - tables                                                         │
│ - message_groups                                                 │
│ - replica_operations                                             │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│ Cluster State Changes (e.g., new node joins)                     │
│                                                                  │
│ Seed Node:                                                       │
│   INSERT INTO nodes (node_id, node_address, ...)                │
│   ↓ Partition leader writes to nodes table                       │
│   ↓ CDC event generated: {table: 'nodes', op: 'INSERT', ...}    │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│ CDC Event Propagates to All Nodes                                │
│                                                                  │
│ All Nodes (including joining node):                              │
│   Receive CDC event: {table: 'nodes', op: 'INSERT', ...}        │
│   ↓ System cache updated automatically                           │
│   ↓ New node now visible to all nodes                            │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│ All Nodes Have Consistent Cache                                  │
│                                                                  │
│ Seed Node Cache:                                                 │
│   nodes: [seed, join1, join2, join3]                            │
│                                                                  │
│ Join1 Cache:                                                     │
│   nodes: [seed, join1, join2, join3]  ← Updated by CDC          │
│                                                                  │
│ Join2 Cache:                                                     │
│   nodes: [seed, join1, join2, join3]  ← Updated by CDC          │
│                                                                  │
│ Join3 Cache:                                                     │
│   nodes: [seed, join1, join2, join3]  ← Updated by CDC          │
│                                                                  │
│ Result: All nodes have same view of cluster state               │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

## Query Routing Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ SQL Query Execution                                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  SQLQueryEngine.executeQuery(sql, params)                       │
│    ↓                                                            │
│    1. Parse SQL → AST                                           │
│    2. Get table name from AST                                   │
│    3. Get partitions from system cache:                         │
│       systemCache.filter(TABLES.PARTITIONS, (p) =>              │
│         p.table_name === tableName                              │
│       )                                                         │
│    4. Resolve which partitions to query (based on WHERE clause) │
│    5. For each partition:                                       │
│       ↓                                                         │
│       QueryExecutor.executeSelect(ast, partitionIds, params)    │
│         ↓                                                       │
│         For each partitionId:                                   │
│           1. Find partition leader from system cache:           │
│              systemCache.filter(TABLES.SERVICES, (s) =>         │
│                s.partition_id === partitionId &&                │
│                s.service_type === SERVICE_TYPE.PARTITION &&     │
│                s.raft_role === RAFT_ROLE.LEADER &&              │
│                s.status === STATE.ACTIVE                        │
│              )                                                  │
│           2. Get leader address from service record             │
│           3. Route query through message router:                │
│              messageRouter.deliver(leaderAddress, {             │
│                type: 'QUERY',                                   │
│                operation: 'SELECT',                             │
│                sql: ast,                                        │
│                params: params                                   │
│              })                                                 │
│           4. Collect results                                    │
│       ↓                                                         │
│    6. Aggregate results from all partitions                     │
│    7. Return results to client                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Component Interaction Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ SQLQueryEngine                                          │    │
│  │ - executeQuery()                                        │    │
│  │ - getTablePartitions() ← Uses system cache              │    │
│  └─────────────────────────────────────────────────────────┘    │
│                    ↓                                             │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ QueryExecutor                                           │    │
│  │ - executeSelect/Insert/Update/Delete()                 │    │
│  │ - findPartitionLeaderAddress() ← Uses system cache      │    │
│  └─────────────────────────────────────────────────────────┘    │
│                    ↓                                             │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ MessageRouter                                           │    │
│  │ - deliver(address, message)                             │    │
│  │ - Routes to partition leader                            │    │
│  └─────────────────────────────────────────────────────────┘    │
│                    ↓                                             │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Partition Service (on leader node)                      │    │
│  │ - Executes query                                        │    │
│  │ - Returns results                                       │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ System Cache (on all nodes)                             │    │
│  │ - getAll(tableName)                                     │    │
│  │ - filter(tableName, predicate)                          │    │
│  │ - insert(tableName, record)                             │    │
│  │ - Updated by CDC events                                 │    │
│  └─────────────────────────────────────────────────────────┘    │
│                    ↑                                             │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ CDC Integration Service                                 │    │
│  │ - subscribe(tableName, callback)                        │    │
│  │ - Receives CDC events from partition leaders            │    │
│  │ - Updates system cache                                  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

## Bootstrap Phases Timeline

```
Time →

Phase 1: Contact Seed Node
├─ HTTP POST /bootstrap
├─ Receive bootstrap response with system table snapshots
└─ Duration: ~100ms

Phase 2: Connect WebSocket
├─ Establish WebSocket connection to seed node
├─ Register message handlers
└─ Duration: ~50ms

Phase 3: Create/Join Message Group
├─ Create self-hosted message group (3 replicas)
├─ OR join existing message group
├─ Wait for leadership establishment
└─ Duration: ~200ms

Phase 4: Hydrate System Cache
├─ Extract system table snapshots from bootstrap response
├─ Insert all records into system cache
├─ Clear bootstrap directories
└─ Duration: ~50ms

Phase 5: Register Node
├─ INSERT INTO nodes table
├─ Query routes through message router to partition leader
├─ CDC event generated and propagates to all nodes
└─ Duration: ~100ms

Phase 6: Subscribe to CDC
├─ Subscribe to CDC events for all system tables
├─ Cache will be updated as cluster state changes
└─ Duration: ~100ms

Phase 7: Ready for Replicas
├─ Signal readiness to control plane
├─ Start heartbeat to control plane
└─ Duration: ~50ms

Total Bootstrap Time: ~650ms (but most is waiting for leadership)
Critical Path: ~300ms (hydration + registration + CDC setup)
```

## Key Differences: Current vs Target

| Aspect | Current (Broken) | Target (Fixed) |
|--------|------------------|----------------|
| **Bootstrap Response** | Only `partitionLeaders` | Complete system table snapshots |
| **Cache Hydration** | Manual, incomplete | Automatic from bootstrap response |
| **Query Routing** | Bootstrap directories + cache | System cache only |
| **Consistency** | Inconsistent (different dirs per node) | Consistent (same CDC events) |
| **Completeness** | Incomplete (missing partition info) | Complete (all system tables) |
| **Reliability** | Unreliable (missing data) | Reliable (complete data) |
| **Error Handling** | Unclear (fallback to dirs) | Clear (cache-only, explicit errors) |
| **CDC Updates** | Not used for bootstrap dirs | Used to keep cache updated |
| **Multi-node** | Inconsistent state | Consistent state (eventually) |
| **Code Paths** | Multiple (dirs + cache) | Single (cache only) |

