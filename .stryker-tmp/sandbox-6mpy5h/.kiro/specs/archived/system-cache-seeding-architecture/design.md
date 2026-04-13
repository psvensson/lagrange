# System Cache Seeding Architecture - Design

## Overview

This design document specifies how to implement complete system table seeding during bootstrap. The key insight is that the bootstrap response should contain complete snapshots of all system tables, allowing joining nodes to hydrate their cache and immediately perform reads and writes without relying on bootstrap directories.

This document includes:
1. **Architecture Overview** - Current vs target state
2. **Refactoring Overview** - High-level changes needed
3. **Detailed Component Changes** - Specific code modifications
4. **Data Flow** - Bootstrap and query routing sequences
5. **Correctness Properties** - Validation approach
6. **Testing Strategy** - Unit, integration, and property-based tests
7. **Migration Path** - Phased rollout plan
8. **Risk Mitigation** - Addressing potential issues

## Architecture

### Current State (Broken)

```
Seed Node Bootstrap:
  1. Create system table partitions
  2. Create message groups
  3. Build bootstrap response with ONLY partitionLeaders
  
Joining Node:
  1. Receive bootstrap response (missing system table data)
  2. Try to write to replica_operations table
  3. FAIL: No partition leader address in cache
  4. Workaround: Use bootstrap directories (temporary, inconsistent)
```

### Target State (Fixed)

```
Seed Node Bootstrap:
  1. Create system table partitions
  2. Write initial data DIRECTLY to local partitions (bootstrap mode)
  3. Populate system cache from local partition data
  4. Build bootstrap response with COMPLETE system table snapshots
  
Joining Node:
  1. Receive bootstrap response with system table snapshots
  2. Hydrate system cache from snapshots
  3. Clear bootstrap directories
  4. Subscribe to CDC events
  5. All queries route through system cache
  6. SUCCESS: Can read and write to any system table
```

## Critical Architectural Requirement: Seed Node Bootstrap Mode

### The Chicken-and-Egg Problem

During seed node bootstrap, there is a fundamental ordering problem:

1. **System cache is empty** - No data exists yet
2. **Need to write to system tables** - To register partitions, services, nodes, etc.
3. **SQL routing requires cache** - `SQLQueryEngine.getTablePartitions()` needs cache to find partitions
4. **DEADLOCK**: Can't write without cache, can't populate cache without writing

### Solution: Bootstrap Mode Direct Write Path

The seed node MUST have a temporary direct write path that bypasses SQL routing:

**Bootstrap Mode (Seed Node Only)**:
```javascript
// During BootstrapService.phaseRegistration()
cdcIntegrationService.setBootstrapMode(true, localPartitionServices);

// Writes go DIRECTLY to local partition services
await cdcIntegrationService.upsertSystemTableRow('services', serviceData);
// → executeSQLDirectToLocalPartition() → partition.executeSQL()

cdcIntegrationService.setBootstrapMode(false);
```

**Normal Mode (After Bootstrap)**:
```javascript
// All writes route through SQL engine
await cdcIntegrationService.upsertSystemTableRow('services', serviceData);
// → sqlQueryEngine.executeQuery() → system cache lookup → message router → partition leader
```

### Implementation Requirements

1. **CDCIntegrationService.setBootstrapMode(enabled, partitionServices)**
   - When enabled: Store reference to local partition services
   - When disabled: Clear reference, force SQL routing

2. **CDCIntegrationService.executeSQL(sql, params)**
   - If bootstrap mode: Call `executeSQLDirectToLocalPartition()`
   - If normal mode: Call `sqlQueryEngine.executeQuery()`

3. **CDCIntegrationService.executeSQLDirectToLocalPartition(sql, params)**
   - Parse SQL to extract table name
   - Find local partition service for that table
   - Execute SQL directly on partition
   - Return result

4. **BootstrapService.phaseRegistration()**
   - Enable bootstrap mode before writes
   - Perform all system table writes
   - Disable bootstrap mode after writes

5. **BootstrapService.phaseCacheHydration()**
   - Read all system table data from local partitions
   - Populate system cache with the data
   - Cache is now ready for normal SQL routing

### Key Constraints

1. **Bootstrap mode is TEMPORARY** - Only active during `phaseRegistration()`
2. **Bootstrap mode is SEED NODE ONLY** - Joining nodes never use it
3. **Single code path after bootstrap** - No fallback mechanisms remain
4. **Cache populated from direct writes** - After writes, read data back to populate cache
5. **No legacy code** - Bootstrap mode is cleanly removed after use

### Data Flow: Seed Node Bootstrap

```
1. phaseInfrastructure()
   - Create node service
   - Initialize message router
   
2. phaseMessageGroups()
   - Create message group replicas
   
3. phasePartitions()
   - Create partition services for system tables
   - Partitions are LOCAL but cache is EMPTY
   
4. phaseRegistration()
   - ENABLE bootstrap mode with local partition services
   - Write to system tables (goes directly to local partitions)
     * Register message groups
     * Register services
     * Register system tables metadata
     * Register partitions
   - DISABLE bootstrap mode
   
5. phaseCacheHydration()
   - Read all system table data from local partitions
   - Populate system cache
   - Cache now contains complete cluster state
   
6. Post-Bootstrap
   - All writes route through SQL engine
   - SQL engine uses system cache to find partition leaders
   - Message router delivers to partition leaders
   - Single code path, no fallbacks
```

## Refactoring Overview

This section provides a high-level overview of the refactoring needed to implement the system cache seeding architecture.

### Key Principles

1. **System Cache is Single Source of Truth** - After bootstrap, all queries use the system cache to find partition locations and leaders
2. **Bootstrap Response Contains Complete State** - Joining nodes receive full snapshots of all system tables
3. **Bootstrap Directories Are Temporary** - Used only during the transition phase, then eliminated
4. **CDC Keeps Cache Updated** - All nodes subscribe to CDC events for system tables
5. **All Communication Through Message Router** - No direct partition access, all queries route through message router

### Refactoring Scope

The refactoring affects 4 main components:

| Component | Current Behavior | Target Behavior | Impact |
|-----------|------------------|-----------------|--------|
| **BootstrapAPI** | Returns only `partitionLeaders` | Returns complete system table snapshots | Medium - Add new method, modify response |
| **NodeJoiningService** | Uses bootstrap directories as workaround | Hydrates cache from bootstrap response | High - Add hydration, CDC subscription, node registration |
| **SQLQueryEngine** | Uses bootstrap directories for routing | Routes all queries through system cache | High - Remove bootstrap directory fallback, enforce cache usage |
| **QueryExecutor** | Uses bootstrap services for routing | Finds partition leaders from system cache | High - Replace bootstrap service lookup with cache lookup |

### Refactoring Phases

#### Phase 1: Bootstrap Response Enhancement (Low Risk)
- Add `buildSystemTableSnapshots()` method to BootstrapAPI
- Modify `handleBootstrapRequest()` to include snapshots in response
- Replace `partitionLeaders` with `systemTableSnapshots`
- **Risk**: Low - clean replacement
- **Effort**: 1-2 hours

#### Phase 2: System Cache Hydration (Medium Risk)
- Add `hydrateSystemCacheFromBootstrap()` method to NodeJoiningService
- Modify `phaseQuerySystemState()` to hydrate cache
- Clear bootstrap directories immediately after hydration
- **Risk**: Medium - new code path
- **Effort**: 2-3 hours

#### Phase 3: SQL Engine Cache-Based Routing (High Risk)
- Modify `SQLQueryEngine.getTablePartitions()` to use ONLY system cache
- Modify `QueryExecutor.findPartitionLeaderAddress()` to use system cache
- Remove bootstrap directory fallback
- **Risk**: High - affects all queries, no fallback
- **Effort**: 3-4 hours

#### Phase 4: Bootstrap Directory Elimination (High Risk)
- Remove bootstrap directory setup from NodeJoiningService
- Remove bootstrap directory usage from SQLQueryEngine
- Remove bootstrap directory parameters from constructors
- **Risk**: High - removes fallback mechanism
- **Effort**: 2-3 hours

#### Phase 5: Integration Testing (Medium Risk)
- Fix admin-cdc-propagation integration test
- Write multi-node cluster integration test
- Write CDC propagation integration test
- Write query routing integration test
- **Risk**: Medium - validates all changes work together
- **Effort**: 4-5 hours

### Refactoring Dependencies

```
Phase 1: Bootstrap Response Enhancement
  ↓ (depends on)
Phase 2: System Cache Hydration
  ↓ (depends on)
Phase 3: SQL Engine Cache-Based Routing
  ↓ (depends on)
Phase 4: Bootstrap Directory Elimination
  ↓ (depends on)
Phase 5: Integration Testing
```

Each phase must be completed and tested before moving to the next.

### File Changes Summary

| File | Changes | Lines | Complexity |
|------|---------|-------|------------|
| `src/bootstrap/bootstrap-api.js` | Add `buildSystemTableSnapshots()`, modify `handleBootstrapRequest()` | +50 | Low |
| `src/bootstrap/node-joining-service.js` | Add `hydrateSystemCacheFromBootstrap()`, `registerNodeInCluster()`, `subscribeToCDCEvents()`, modify `phaseQuerySystemState()` | +150 | High |
| `src/query/sql-query-engine.js` | Modify `getTablePartitions()`, remove bootstrap directory fallback | +30 | Medium |
| `src/query/query-executor.js` | Add `findPartitionLeaderAddress()`, modify query execution methods | +80 | High |
| `test/integration/admin-cdc-propagation.integration.test.js` | Fix failing tests | +50 | Medium |

### Breaking Changes

**Bootstrap Response Format** - The bootstrap response format changes:
- Bootstrap response now contains `systemTableSnapshots` instead of `partitionLeaders`
- All nodes must use the new format
- Bootstrap directories are eliminated immediately after cache hydration
- Single code path for all bootstrap operations

### New Dependencies

- **None** - Uses existing components (system cache, message router, CDC integration)

### Removed Dependencies

- **Bootstrap directories** - Eliminated in Phase 4
- **Direct partition service lookups** - Replaced with system cache lookups

### Performance Impact

| Operation | Before | After | Change |
|-----------|--------|-------|--------|
| Bootstrap response building | ~50ms | ~100ms | +50ms (acceptable) |
| Cache hydration | N/A | ~50ms | New (fast) |
| Query routing | ~10ms | ~10ms | No change (same lookup, different source) |
| CDC subscription setup | ~100ms | ~100ms | No change |

### Correctness Impact

| Property | Before | After | Improvement |
|----------|--------|-------|-------------|
| Cache consistency | Partial (bootstrap dirs out of sync) | Complete (single source of truth) | ✓ Major |
| Query routing reliability | Unreliable (missing partition info) | Reliable (complete cache) | ✓ Major |
| Multi-node consistency | Inconsistent (different bootstrap dirs) | Consistent (same CDC events) | ✓ Major |
| Error handling | Unclear (bootstrap dir fallback) | Clear (cache-only, explicit errors) | ✓ Improvement |

### Correctness Impact

| Property | Before | After | Improvement |
|----------|--------|-------|-------------|
| Cache consistency | Partial (bootstrap dirs out of sync) | Complete (single source of truth) | ✓ Major |
| Query routing reliability | Unreliable (missing partition info) | Reliable (complete cache) | ✓ Major |
| Multi-node consistency | Inconsistent (different bootstrap dirs) | Consistent (same CDC events) | ✓ Major |
| Error handling | Unclear (bootstrap dir fallback) | Clear (cache-only, explicit errors) | ✓ Improvement |

## Detailed Implementation Guide

### Step 1: Understand Current Code

Before making changes, understand these key files:

1. **`src/bootstrap/bootstrap-api.js`** (1083 lines)
   - `handleBootstrapRequest()` - Builds bootstrap response
   - `getSystemPartitionLeaders()` - Gets partition leaders from cache
   - `getMessageGroups()` - Gets message groups from cache
   - **Key insight**: Already reads from system cache, just needs to include more tables

2. **`src/bootstrap/node-joining-service.js`** (2004 lines)
   - `phaseQuerySystemState()` - Currently uses bootstrap directories
   - `phaseConnectWebSocket()` - Establishes WebSocket connection
   - `phaseWaitForLeadership()` - Waits for message group leadership
   - **Key insight**: Already has structure for phases, just needs new hydration phase

3. **`src/query/sql-query-engine.js`** (400+ lines)
   - `executeQuery()` - Main entry point for SQL queries
   - `getTablePartitions()` - Gets partitions for a table
   - `setBootstrapDirectories()` - Sets bootstrap directories (to be removed)
   - **Key insight**: Already uses system cache, just needs to remove bootstrap fallback

4. **`src/query/query-executor.js`** (500+ lines)
   - `executeSelect()`, `executeInsert()`, `executeUpdate()`, `executeDelete()` - Execute queries
   - Uses `bootstrapServices` for routing (to be replaced)
   - **Key insight**: Needs to find partition leaders from system cache instead

### Step 2: Implement Phase 1 - Bootstrap Response Enhancement

**Goal**: Add system table snapshots to bootstrap response

**Changes**:
1. Add `buildSystemTableSnapshots()` method to BootstrapAPI
2. Modify `handleBootstrapRequest()` to include snapshots
3. Replace `partitionLeaders` with `systemTableSnapshots`

**Code Pattern**:
```javascript
// In BootstrapAPI
buildSystemTableSnapshots() {
  const cache = this.systemTableCache;
  return {
    nodes: cache.getAll(TABLES.NODES) || [],
    partitions: cache.getAll(TABLES.PARTITIONS) || [],
    services: cache.getAll(TABLES.SERVICES) || [],
    tables: cache.getAll(TABLES.TABLES) || [],
    message_groups: cache.getAll(TABLES.MESSAGE_GROUPS) || [],
    replica_operations: cache.getAll(TABLES.REPLICA_OPERATIONS) || [],
  };
}

// In handleBootstrapRequest()
const systemTableSnapshots = this.buildSystemTableSnapshots();
const response = {
  success: true,
  // ... existing fields ...
  systemTableSnapshots,  // NEW
  // ... existing fields ...
};
```

**Testing**:
- Unit test: Verify all system tables are in snapshots
- Property test: Verify snapshots are arrays
- Integration test: Verify bootstrap response includes snapshots

### Step 3: Implement Phase 2 - System Cache Hydration

**Goal**: Hydrate cache from bootstrap response

**Changes**:
1. Add `hydrateSystemCacheFromBootstrap()` method to NodeJoiningService
2. Add `registerNodeInCluster()` method to register joining node
3. Add `subscribeToCDCEvents()` method to subscribe to CDC
4. Modify `phaseQuerySystemState()` to call these methods

**Code Pattern**:
```javascript
// In NodeJoiningService
async hydrateSystemCacheFromBootstrap() {
  const snapshots = this.bootstrapResponse.systemTableSnapshots;
  if (!snapshots) {
    throw new Error('Bootstrap response missing system table snapshots');
  }
  
  const cache = this.systemTableCache;
  for (const [tableName, records] of Object.entries(snapshots)) {
    if (!Array.isArray(records)) continue;
    for (const record of records) {
      cache.insert(tableName, record);
    }
  }
}

async registerNodeInCluster() {
  const sql = `INSERT INTO nodes (node_id, node_address, status, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?)`;
  const now = Date.now();
  const result = await this.sqlQueryEngine.executeQuery(sql, [
    this.nodeId,
    this.nodeAddress,
    STATE.ACTIVE,
    now,
    now,
  ]);
  if (!result.success) throw new Error(`Failed to register node: ${result.error}`);
}

async subscribeToCDCEvents() {
  const systemTables = [
    TABLES.NODES, TABLES.PARTITIONS, TABLES.SERVICES,
    TABLES.TABLES, TABLES.MESSAGE_GROUPS, TABLES.REPLICA_OPERATIONS,
  ];
  for (const tableName of systemTables) {
    await this.cdcIntegrationService.subscribe(tableName, (event) => {
      this.logger.debug(`CDC event for ${tableName}`, event);
    });
  }
}

// In phaseQuerySystemState()
async phaseQuerySystemState() {
  await this.hydrateSystemCacheFromBootstrap();
  if (this.sqlQueryEngine) {
    this.sqlQueryEngine.setBootstrapDirectories(null, null);
  }
  await this.registerNodeInCluster();
  await this.subscribeToCDCEvents();
}
```

**Testing**:
- Unit test: Verify cache is populated from snapshots
- Unit test: Verify node is registered
- Unit test: Verify CDC subscriptions are created
- Integration test: Verify joining node can query system tables

### Step 4: Implement Phase 3 - SQL Engine Cache-Based Routing

**Goal**: Route all queries through system cache

**Changes**:
1. Modify `SQLQueryEngine.getTablePartitions()` to use ONLY system cache
2. Add `QueryExecutor.findPartitionLeaderAddress()` method
3. Modify query execution methods to use cache-based leader lookup

**Code Pattern**:
```javascript
// In SQLQueryEngine
getTablePartitions(tableName) {
  if (!this.systemCache) {
    throw new Error('System cache not available');
  }
  
  const partitions = this.systemCache.filter(TABLES.PARTITIONS, (p) =>
    p.table_name === tableName || p.table_id === tableName,
  ) || [];
  
  if (partitions.length === 0) {
    throw new Error(`No partitions found for table: ${tableName}`);
  }
  
  return partitions;
}

// In QueryExecutor
findPartitionLeaderAddress(partitionId) {
  if (!this.systemCache) {
    throw new Error('System cache not available');
  }
  
  const services = this.systemCache.filter(TABLES.SERVICES, (s) =>
    s.partition_id === partitionId &&
    s.service_type === SERVICE_TYPE.PARTITION &&
    s.raft_role === RAFT_ROLE.LEADER &&
    s.status === STATE.ACTIVE,
  ) || [];
  
  if (services.length === 0) {
    return null;
  }
  
  return services[0].address;
}

// In executeSelect()
async executeSelect(ast, partitionIds, params, options = {}) {
  const results = [];
  for (const partitionId of partitionIds) {
    const leaderAddress = this.findPartitionLeaderAddress(partitionId);
    if (!leaderAddress) {
      throw new Error(`No leader found for partition: ${partitionId}`);
    }
    const result = await this.messageRouter.deliver(leaderAddress, {
      type: 'QUERY',
      operation: 'SELECT',
      sql: ast,
      params,
    });
    if (!result.success) throw new Error(result.error);
    results.push(...(result.rows || []));
  }
  return {success: true, rows: results};
}
```

**Testing**:
- Unit test: Verify partitions are retrieved from cache
- Unit test: Verify leader address is found from cache
- Unit test: Verify queries route through message router
- Property test: Verify all queries use cache

### Step 5: Implement Phase 4 - Bootstrap Directory Elimination

**Goal**: Remove bootstrap directories completely

**Changes**:
1. Remove `setBootstrapDirectories()` calls from NodeJoiningService
2. Remove bootstrap directory usage from SQLQueryEngine
3. Remove bootstrap directory parameters from constructors
4. Remove `getBootstrapPartitions()` method from SQLQueryEngine

**Code Pattern**:
```javascript
// REMOVE from NodeJoiningService.phaseQuerySystemState()
// if (this.sqlQueryEngine) {
//   this.sqlQueryEngine.setBootstrapDirectories(null, null);
// }

// REMOVE from SQLQueryEngine
// getBootstrapPartitions(tableName) { ... }

// REMOVE from SQLQueryEngine.getTablePartitions()
// return this.getBootstrapPartitions(tableName);

// REMOVE from SQLQueryEngine constructor
// this.bootstrapPartitions = options.bootstrapPartitions || null;
// this.bootstrapServices = options.bootstrapServices || null;

// REMOVE from SQLQueryEngine
// setBootstrapDirectories(bootstrapPartitions, bootstrapServices) { ... }
```

**Testing**:
- Unit test: Verify bootstrap directories are not used
- Integration test: Verify queries work without bootstrap directories
- Integration test: Verify clear error if cache is missing data

### Step 6: Implement Phase 5 - Integration Testing

**Goal**: Verify all changes work together

**Changes**:
1. Fix admin-cdc-propagation integration test
2. Write multi-node cluster integration test
3. Write CDC propagation integration test
4. Write query routing integration test

**Testing Pattern**:
```javascript
// Multi-node cluster test
test('Multi-node cluster with system cache seeding', async (t) => {
  // 1. Bootstrap seed node
  const seedResult = await bootstrapService.bootstrap();
  t.ok(seedResult.success);
  
  // 2. Join second node
  const join2Result = await joiningService2.join();
  t.ok(join2Result.success);
  
  // 3. Join third node
  const join3Result = await joiningService3.join();
  t.ok(join3Result.success);
  
  // 4. Verify all nodes have consistent cache
  const nodes1 = await sqlEngine1.executeQuery('SELECT * FROM nodes');
  const nodes2 = await sqlEngine2.executeQuery('SELECT * FROM nodes');
  const nodes3 = await sqlEngine3.executeQuery('SELECT * FROM nodes');
  
  t.equal(nodes1.rows.length, nodes2.rows.length);
  t.equal(nodes2.rows.length, nodes3.rows.length);
  
  // 5. Verify queries work on all nodes
  const result = await sqlEngine2.executeQuery('SELECT * FROM partitions');
  t.ok(result.success);
});
```

## Component Changes

### 1. BootstrapAPI.handleBootstrapRequest()

**Current**: Returns only `partitionLeaders`

**Target**: Returns complete system table snapshots

```javascript
async handleBootstrapRequest(request, reply) {
  // ... validation ...
  
  // Get complete system table snapshots from cache
  const systemTableSnapshots = this.buildSystemTableSnapshots();
  
  const response = {
    success: true,
    seedNodeId: this.seedNodeId,
    seedNodeAddress: this.seedNodeAddress,
    seedNodeWsAddress,
    messageGroupAssignment: assignment,
    
    // Complete system table snapshots
    systemTableSnapshots: {
      nodes: systemTableSnapshots.nodes,
      partitions: systemTableSnapshots.partitions,
      services: systemTableSnapshots.services,
      tables: systemTableSnapshots.tables,
      message_groups: systemTableSnapshots.message_groups,
      replica_operations: systemTableSnapshots.replica_operations,
    },
    
    readyNodes,
    tablePolicies,
    currentEpoch,
    clusterConfig,
    timestamp: Date.now(),
  };
  
  return response;
}

buildSystemTableSnapshots() {
  const cache = this.systemTableCache;
  
  return {
    nodes: cache.getAll(TABLES.NODES) || [],
    partitions: cache.getAll(TABLES.PARTITIONS) || [],
    services: cache.getAll(TABLES.SERVICES) || [],
    tables: cache.getAll(TABLES.TABLES) || [],
    message_groups: cache.getAll(TABLES.MESSAGE_GROUPS) || [],
    replica_operations: cache.getAll(TABLES.REPLICA_OPERATIONS) || [],
  };
}
```

### 2. NodeJoiningService.phaseQuerySystemState()

**Current**: Uses bootstrap directories as workaround

**Target**: Hydrates cache from bootstrap response, then clears bootstrap directories

```javascript
async phaseQuerySystemState() {
  // Hydrate system cache from bootstrap response
  await this.hydrateSystemCacheFromBootstrap();
  
  // Clear bootstrap directories - no longer needed
  if (this.sqlQueryEngine) {
    this.sqlQueryEngine.setBootstrapDirectories(null, null);
  }
  
  // Register this node in the nodes table
  await this.registerNodeInCluster();
  
  // Subscribe to CDC events to keep cache updated
  await this.subscribeToCDCEvents();
}

async hydrateSystemCacheFromBootstrap() {
  const snapshots = this.bootstrapResponse.systemTableSnapshots;
  if (!snapshots) {
    throw new Error('Bootstrap response missing system table snapshots');
  }
  
  const cache = this.systemTableCache;
  
  // Hydrate each system table
  for (const [tableName, records] of Object.entries(snapshots)) {
    if (!Array.isArray(records)) {
      continue;
    }
    
    for (const record of records) {
      // Insert each record into the cache
      cache.insert(tableName, record);
    }
  }
  
  this.logger.info('System cache hydrated from bootstrap response', {
    nodeId: this.nodeId,
    tables: Object.keys(snapshots),
  });
}

async registerNodeInCluster() {
  // Use SQL query engine to insert this node into nodes table
  const sql = `INSERT INTO nodes (node_id, node_address, status, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?)`;
  
  const now = Date.now();
  const result = await this.sqlQueryEngine.executeQuery(sql, [
    this.nodeId,
    this.nodeAddress,
    STATE.ACTIVE,
    now,
    now,
  ]);
  
  if (!result.success) {
    throw new Error(`Failed to register node: ${result.error}`);
  }
}

async subscribeToCDCEvents() {
  // Subscribe to CDC events for all system tables
  const systemTables = [
    TABLES.NODES,
    TABLES.PARTITIONS,
    TABLES.SERVICES,
    TABLES.TABLES,
    TABLES.MESSAGE_GROUPS,
    TABLES.REPLICA_OPERATIONS,
  ];
  
  for (const tableName of systemTables) {
    await this.cdcIntegrationService.subscribe(tableName, (event) => {
      // CDC events automatically update the system cache
      this.logger.debug(`CDC event for ${tableName}`, event);
    });
  }
}
```

### 3. SQLQueryEngine

**Current**: Uses bootstrap directories for routing

**Target**: Routes all queries through system cache

```javascript
async executeSelect(ast, params, sessionId) {
  const tableName = ast.from.name;
  
  // Get partitions from system cache (ONLY source of truth)
  const partitions = this.getTablePartitions(tableName);
  
  if (partitions.length === 0) {
    return {
      success: false,
      error: `Table not found: ${tableName}`,
    };
  }
  
  // Resolve which partitions to query
  const partitionIds = this.partitionResolver.resolvePartitions(
    tableName,
    ast.where,
    partitions,
  );
  
  // For each partition, find the leader address from system cache
  const preferLeader = this.isSystemTable(tableName);
  
  // Execute on resolved partitions
  const result = await this.queryExecutor.executeSelect(
    ast,
    partitionIds,
    params,
    {preferLeader},
  );
  
  return result;
}

getTablePartitions(tableName) {
  if (!this.systemCache) {
    throw new Error('System cache not available');
  }
  
  // Get partitions from system cache - the ONLY source of truth
  const partitions = this.systemCache.filter(TABLES.PARTITIONS, (p) =>
    p.table_name === tableName || p.table_id === tableName,
  ) || [];
  
  if (partitions.length === 0) {
    throw new Error(`No partitions found for table: ${tableName}`);
  }
  
  return partitions;
}
```

### 4. QueryExecutor

**Current**: Uses bootstrap services for routing

**Target**: Finds partition leader from system cache

```javascript
async executeSelect(ast, partitionIds, params, options = {}) {
  const results = [];
  
  for (const partitionId of partitionIds) {
    // Find partition leader from system cache
    const leaderAddress = this.findPartitionLeaderAddress(partitionId);
    
    if (!leaderAddress) {
      throw new Error(`No leader found for partition: ${partitionId}`);
    }
    
    // Route query through message router to leader
    const result = await this.messageRouter.deliver(leaderAddress, {
      type: 'QUERY',
      operation: 'SELECT',
      sql: ast,
      params,
    });
    
    if (!result.success) {
      throw new Error(result.error);
    }
    
    results.push(...(result.rows || []));
  }
  
  return {success: true, rows: results};
}

findPartitionLeaderAddress(partitionId) {
  if (!this.systemCache) {
    throw new Error('System cache not available');
  }
  
  // Find the leader service for this partition
  const services = this.systemCache.filter(TABLES.SERVICES, (s) =>
    s.partition_id === partitionId &&
    s.service_type === SERVICE_TYPE.PARTITION &&
    s.raft_role === RAFT_ROLE.LEADER &&
    s.status === STATE.ACTIVE,
  ) || [];
  
  if (services.length === 0) {
    return null;
  }
  
  return services[0].address;
}
```

## Data Flow

### Bootstrap Sequence

```
1. Seed Node Bootstrap
   ├─ Create system table partitions
   ├─ Populate system cache with initial data
   │  ├─ Insert seed node into nodes table
   │  ├─ Insert partitions into partitions table
   │  ├─ Insert partition replicas into services table
   │  ├─ Insert system tables into tables table
   │  └─ Insert message groups into message_groups table
   └─ Ready to serve bootstrap requests

2. Joining Node Contacts Seed
   ├─ HTTP POST to /bootstrap
   └─ Receive bootstrap response with system table snapshots

3. Joining Node Hydrates Cache
   ├─ For each system table snapshot
   │  └─ Insert all records into local system cache
   ├─ Clear bootstrap directories
   └─ System cache now has complete cluster state

4. Joining Node Subscribes to CDC
   ├─ Subscribe to CDC events for all system tables
   └─ Cache will be updated as cluster state changes

5. Joining Node Registers Itself
   ├─ Use SQL query engine to INSERT into nodes table
   ├─ Query routes through message router to partition leader
   ├─ Partition leader writes to nodes table
   └─ CDC event propagates to all nodes

6. All Nodes Have Updated Cache
   ├─ CDC event received by all nodes
   ├─ System cache updated on all nodes
   └─ All nodes now know about the new node
```

### Query Routing After Bootstrap

```
SQL Query (SELECT/INSERT/UPDATE/DELETE)
  ├─ Parse SQL
  ├─ Get table partitions from system cache
  ├─ Resolve which partitions to query
  ├─ For each partition:
  │  ├─ Find partition leader from services table in cache
  │  ├─ Get leader address from services table in cache
  │  └─ Route query through message router to leader
  └─ Return results
```

## Correctness Properties

### Property 1: Bootstrap Response Contains All System Tables

**Validates: Requirement 1.1, 1.2, 1.3**

For any bootstrap response, the response SHALL contain complete snapshots of all system tables.

```javascript
fc.assert(
  fc.property(
    fc.record({
      nodeId: fc.uuid(),
      nodeAddress: fc.string(),
    }),
    async (input) => {
      const response = await bootstrapApi.handleBootstrapRequest({
        body: input,
      }, {});
      
      // Response must have system table snapshots
      assert(response.systemTableSnapshots);
      assert(Array.isArray(response.systemTableSnapshots.nodes));
      assert(Array.isArray(response.systemTableSnapshots.partitions));
      assert(Array.isArray(response.systemTableSnapshots.services));
      assert(Array.isArray(response.systemTableSnapshots.tables));
      assert(Array.isArray(response.systemTableSnapshots.message_groups));
      assert(Array.isArray(response.systemTableSnapshots.replica_operations));
    }
  ),
  {numRuns: 10}
);
```

### Property 2: System Cache Hydration Is Complete

**Validates: Requirement 2.1, 2.2, 2.3**

After hydrating from bootstrap response, the system cache SHALL contain all records from the snapshots.

```javascript
fc.assert(
  fc.property(
    fc.array(fc.record({
      node_id: fc.uuid(),
      node_address: fc.string(),
    })),
    async (nodes) => {
      const snapshots = {nodes, partitions: [], services: [], tables: [], message_groups: [], replica_operations: []};
      
      await joiningNode.hydrateSystemCacheFromBootstrap({systemTableSnapshots: snapshots});
      
      const cachedNodes = joiningNode.systemTableCache.getAll(TABLES.NODES);
      assert.equal(cachedNodes.length, nodes.length);
      
      for (const node of nodes) {
        const cached = cachedNodes.find(n => n.node_id === node.node_id);
        assert(cached);
      }
    }
  ),
  {numRuns: 10}
);
```

### Property 3: SQL Engine Routes Through System Cache

**Validates: Requirement 5.1, 5.2, 5.3**

All SQL queries SHALL route through the system cache to find partition leaders.

```javascript
fc.assert(
  fc.property(
    fc.string(),
    async (tableName) => {
      const query = `SELECT * FROM ${tableName}`;
      
      // Mock system cache with partition data
      const partitions = [{partition_id: 'p1', table_name: tableName}];
      const services = [{
        partition_id: 'p1',
        service_type: SERVICE_TYPE.PARTITION,
        raft_role: RAFT_ROLE.LEADER,
        status: STATE.ACTIVE,
        address: 'node1/partition/r1',
      }];
      
      sqlEngine.systemCache.getAll = (table) => {
        if (table === TABLES.PARTITIONS) return partitions;
        if (table === TABLES.SERVICES) return services;
        return [];
      };
      
      // Execute query
      const result = await sqlEngine.executeQuery(query);
      
      // Should have routed through message router
      assert(messageRouter.deliver.called);
      assert.equal(messageRouter.deliver.firstCall.args[0], 'node1/partition/r1');
    }
  ),
  {numRuns: 10}
);
```

### Property 4: Bootstrap Directories Are Cleared After Hydration

**Validates: Requirement 3.1, 3.2, 3.3**

After cache hydration, bootstrap directories SHALL be empty or null.

```javascript
fc.assert(
  fc.property(
    fc.anything(),
    async (bootstrapServices) => {
      // Set bootstrap directories
      sqlEngine.setBootstrapDirectories(null, bootstrapServices);
      assert(sqlEngine.bootstrapServices);
      
      // Hydrate cache
      await joiningNode.hydrateSystemCacheFromBootstrap(bootstrapResponse);
      
      // Bootstrap directories should be cleared
      assert(!sqlEngine.bootstrapServices || sqlEngine.bootstrapServices.size === 0);
    }
  ),
  {numRuns: 10}
);
```

## Testing Strategy

### Unit Tests

1. **BootstrapAPI.buildSystemTableSnapshots()** - Verify snapshots contain all system tables
2. **NodeJoiningService.hydrateSystemCacheFromBootstrap()** - Verify cache is populated correctly
3. **SQLQueryEngine.getTablePartitions()** - Verify partitions are retrieved from cache
4. **QueryExecutor.findPartitionLeaderAddress()** - Verify leader address is found from cache

### Integration Tests

1. **Full Bootstrap Sequence** - Seed node bootstrap → joining node joins → queries work
2. **CDC Propagation** - Changes to system tables propagate to all nodes
3. **Multi-Node Cluster** - Multiple nodes join and all have consistent cache
4. **Query Routing** - Queries route through message router to correct leaders

### Property-Based Tests

1. **Bootstrap Response Completeness** - All system tables in response
2. **Cache Hydration Correctness** - All records from snapshots in cache
3. **Query Routing Consistency** - All queries route through cache
4. **CDC Update Consistency** - Cache updates match CDC events

## Migration Path

### Phase 1: Add System Table Snapshots to Bootstrap Response

- Modify `BootstrapAPI.handleBootstrapRequest()` to include system table snapshots
- Replace `partitionLeaders` with `systemTableSnapshots`
- Single code path for bootstrap response

### Phase 2: Hydrate Cache from Bootstrap Response

- Modify `NodeJoiningService.phaseQuerySystemState()` to hydrate from snapshots
- Clear bootstrap directories immediately after hydration
- Verify cache hydration works

### Phase 3: Eliminate Bootstrap Directories

- Remove bootstrap directory setup from `phaseQuerySystemState()`
- Remove bootstrap directory usage from `SQLQueryEngine`
- Verify all queries route through system cache

### Phase 4: Verify CDC Subscriptions

- Ensure CDC subscriptions are established before node is READY
- Verify cache updates from CDC events
- Test multi-node cluster consistency

## Risk Mitigation

### Risk: Bootstrap Response Too Large

**Mitigation**: System tables are small (typically < 1MB even for large clusters). If needed, implement pagination or compression.

### Risk: Cache Hydration Fails

**Mitigation**: If hydration fails, node fails to join. This is correct behavior - node cannot operate without system cache.

### Risk: CDC Subscription Fails

**Mitigation**: If CDC subscription fails, node fails to join. This ensures cache stays updated.

### Risk: Queries Fail If Cache Missing Data

**Mitigation**: Queries will fail with clear error messages. This is correct - node should not operate without complete cache.

## Performance Considerations

- Bootstrap response building: < 100ms (reading from cache)
- Cache hydration: < 50ms (inserting records into cache)
- CDC subscription setup: < 100ms (subscribing to events)
- Query routing: No additional overhead (same as before, just using cache instead of bootstrap directories)

## Single Code Path

- Bootstrap response contains only `systemTableSnapshots`
- All nodes use the system cache as the single source of truth
- No fallback mechanisms or legacy code paths
