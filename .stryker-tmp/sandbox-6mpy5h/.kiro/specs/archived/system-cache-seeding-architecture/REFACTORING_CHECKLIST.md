# System Cache Seeding Architecture - Refactoring Checklist

This checklist provides a detailed step-by-step guide for implementing the system cache seeding architecture.

## Phase 1: Bootstrap Response Enhancement

### 1.1 Add buildSystemTableSnapshots() to BootstrapAPI

- [ ] Open `src/bootstrap/bootstrap-api.js`
- [ ] Locate the `getSystemPartitionLeaders()` method (around line 700)
- [ ] Add new method after it:

```javascript
/**
 * Build complete system table snapshots for bootstrap response.
 * @return {Object} System table snapshots.
 * @private
 */
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

- [ ] Verify method is properly indented and formatted
- [ ] Run linter: `npm run lint -- src/bootstrap/bootstrap-api.js`

### 1.2 Modify handleBootstrapRequest() to include snapshots

- [ ] Locate `handleBootstrapRequest()` method (around line 250)
- [ ] Find where `partitionLeaders` is assigned
- [ ] Add snapshot building before response construction:

```javascript
// Get complete system table snapshots from cache
const systemTableSnapshots = this.buildSystemTableSnapshots();
```

- [ ] Add `systemTableSnapshots` to response object:

```javascript
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
```

- [ ] Verify response structure is correct
- [ ] Run linter: `npm run lint -- src/bootstrap/bootstrap-api.js`

### 1.3 Write unit test for buildSystemTableSnapshots()

- [ ] Create test file: `test/bootstrap/bootstrap-api-snapshots.test.js`
- [ ] Write test:

```javascript
test('BootstrapAPI.buildSystemTableSnapshots()', async (t) => {
  await t.test('should return all system tables', async (t) => {
    const api = new BootstrapAPI({
      systemTableCache: mockCache,
      seedNodeId: 'seed-1',
    });
    
    const snapshots = api.buildSystemTableSnapshots();
    
    t.ok(Array.isArray(snapshots.nodes));
    t.ok(Array.isArray(snapshots.partitions));
    t.ok(Array.isArray(snapshots.services));
    t.ok(Array.isArray(snapshots.tables));
    t.ok(Array.isArray(snapshots.message_groups));
    t.ok(Array.isArray(snapshots.replica_operations));
  });
});
```

- [ ] Run test: `npm test -- test/bootstrap/bootstrap-api-snapshots.test.js`
- [ ] Verify test passes

### 1.4 Checkpoint 1: Verify Phase 1 Complete

- [ ] `buildSystemTableSnapshots()` method added
- [ ] `handleBootstrapRequest()` includes snapshots
- [ ] Unit test passes
- [ ] Linter passes
- [ ] Single code path for bootstrap response

## Phase 2: System Cache Hydration

### 2.1 Add hydrateSystemCacheFromBootstrap() to NodeJoiningService

- [ ] Open `src/bootstrap/node-joining-service.js`
- [ ] Locate the `phaseWaitForLeadership()` method (around line 600)
- [ ] Add new method after it:

```javascript
/**
 * Hydrate system cache from bootstrap response.
 * @return {Promise<void>}
 * @private
 */
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
  
  this.logger.info(JOINING_LOG_MSG.CACHE_HYDRATED, {
    nodeId: this.nodeId,
    tables: Object.keys(snapshots),
  });
}
```

- [ ] Add log message constant to `src/bootstrap/node-joining-constants.js`:

```javascript
CACHE_HYDRATED: 'System cache hydrated from bootstrap response',
```

- [ ] Verify method is properly indented and formatted
- [ ] Run linter: `npm run lint -- src/bootstrap/node-joining-service.js`

### 2.2 Add registerNodeInCluster() to NodeJoiningService

- [ ] Add new method after `hydrateSystemCacheFromBootstrap()`:

```javascript
/**
 * Register this node in the cluster's nodes table.
 * @return {Promise<void>}
 * @private
 */
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
  
  if (!result.success) {
    throw new Error(`Failed to register node: ${result.error}`);
  }
  
  this.logger.info(JOINING_LOG_MSG.NODE_REGISTERED, {
    nodeId: this.nodeId,
    nodeAddress: this.nodeAddress,
  });
}
```

- [ ] Add log message constant:

```javascript
NODE_REGISTERED: 'Node registered in cluster',
```

- [ ] Run linter

### 2.3 Add subscribeToCDCEvents() to NodeJoiningService

- [ ] Add new method after `registerNodeInCluster()`:

```javascript
/**
 * Subscribe to CDC events for all system tables.
 * @return {Promise<void>}
 * @private
 */
async subscribeToCDCEvents() {
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
      this.logger.debug(JOINING_LOG_MSG.CDC_EVENT_RECEIVED, {
        tableName,
        operation: event.operation,
      });
    });
  }
  
  this.logger.info(JOINING_LOG_MSG.CDC_SUBSCRIBED, {
    nodeId: this.nodeId,
    tableCount: systemTables.length,
  });
}
```

- [ ] Add log message constants:

```javascript
CDC_EVENT_RECEIVED: 'CDC event received for system table',
CDC_SUBSCRIBED: 'Subscribed to CDC events for system tables',
```

- [ ] Run linter

### 2.4 Modify phaseQuerySystemState() to use new methods

- [ ] Locate `phaseQuerySystemState()` method (around line 1200)
- [ ] Replace current implementation with:

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
```

- [ ] Verify method is properly formatted
- [ ] Run linter

### 2.5 Write unit tests for hydration methods

- [ ] Create test file: `test/bootstrap/node-joining-hydration.test.js`
- [ ] Write tests for each method:

```javascript
test('NodeJoiningService hydration', async (t) => {
  await t.test('hydrateSystemCacheFromBootstrap should populate cache', async (t) => {
    const service = new NodeJoiningService({...options});
    service.bootstrapResponse = {
      systemTableSnapshots: {
        nodes: [{node_id: 'n1', node_address: 'addr1'}],
        partitions: [],
        services: [],
        tables: [],
        message_groups: [],
        replica_operations: [],
      },
    };
    
    await service.hydrateSystemCacheFromBootstrap();
    
    const nodes = service.systemTableCache.getAll(TABLES.NODES);
    t.equal(nodes.length, 1);
    t.equal(nodes[0].node_id, 'n1');
  });
});
```

- [ ] Run tests: `npm test -- test/bootstrap/node-joining-hydration.test.js`
- [ ] Verify tests pass

### 2.6 Checkpoint 2: Verify Phase 2 Complete

- [ ] `hydrateSystemCacheFromBootstrap()` method added
- [ ] `registerNodeInCluster()` method added
- [ ] `subscribeToCDCEvents()` method added
- [ ] `phaseQuerySystemState()` modified
- [ ] Unit tests pass
- [ ] Linter passes
- [ ] Bootstrap directories cleared after hydration

## Phase 3: SQL Engine Cache-Based Routing

### 3.1 Modify SQLQueryEngine.getTablePartitions()

- [ ] Open `src/query/sql-query-engine.js`
- [ ] Locate `getTablePartitions()` method (around line 300)
- [ ] Replace implementation:

```javascript
getTablePartitions(tableName) {
  if (!this.systemCache) {
    throw new Error('System cache not available');
  }
  
  // Get partitions from system cache - the ONLY source of truth
  if (typeof this.systemCache.filter === 'function') {
    const partitions = this.systemCache.filter(TABLES.PARTITIONS, (p) =>
      p.table_name === tableName ||
      p.tableName === tableName ||
      p.table_id === tableName ||
      p.tableId === tableName,
    ) || [];
    if (partitions.length > 0) {
      return partitions;
    }
  }
  
  if (typeof this.systemCache.getAll === 'function') {
    const all = this.systemCache.getAll(TABLES.PARTITIONS) || [];
    const partitions = all.filter((p) =>
      p.table_name === tableName ||
      p.tableName === tableName ||
      p.table_id === tableName ||
      p.tableId === tableName,
    );
    if (partitions.length > 0) {
      return partitions;
    }
  }
  
  throw new Error(`No partitions found for table: ${tableName}`);
}
```

- [ ] Remove bootstrap directory fallback code
- [ ] Run linter

### 3.2 Add findPartitionLeaderAddress() to QueryExecutor

- [ ] Open `src/query/query-executor.js`
- [ ] Add new method:

```javascript
/**
 * Find partition leader address from system cache.
 * @param {string} partitionId - Partition ID.
 * @return {string|null} Leader address or null.
 * @private
 */
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

- [ ] Run linter

### 3.3 Modify query execution methods to use cache-based routing

- [ ] Locate `executeSelect()` method
- [ ] Find where it uses `bootstrapServices`
- [ ] Replace with:

```javascript
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
```

- [ ] Repeat for `executeInsert()`, `executeUpdate()`, `executeDelete()`
- [ ] Run linter

### 3.4 Write unit tests for cache-based routing

- [ ] Create test file: `test/query/query-executor-cache-routing.test.js`
- [ ] Write tests:

```javascript
test('QueryExecutor cache-based routing', async (t) => {
  await t.test('findPartitionLeaderAddress should find leader from cache', async (t) => {
    const executor = new QueryExecutor({systemCache: mockCache});
    
    const address = executor.findPartitionLeaderAddress('p1');
    
    t.ok(address);
    t.match(address, /node1\/partition\/r1/);
  });
});
```

- [ ] Run tests
- [ ] Verify tests pass

### 3.5 Checkpoint 3: Verify Phase 3 Complete

- [ ] `getTablePartitions()` uses ONLY system cache
- [ ] `findPartitionLeaderAddress()` method added
- [ ] Query execution methods use cache-based routing
- [ ] Unit tests pass
- [ ] Linter passes
- [ ] All queries route through message router

## Phase 4: Bootstrap Directory Elimination

### 4.1 Remove bootstrap directory setup from NodeJoiningService

- [ ] Open `src/bootstrap/node-joining-service.js`
- [ ] Locate `phaseQuerySystemState()` method
- [ ] Remove these lines:

```javascript
// REMOVE:
// if (this.sqlQueryEngine) {
//   this.sqlQueryEngine.setBootstrapDirectories(null, null);
// }
```

- [ ] Run linter

### 4.2 Remove bootstrap directory usage from SQLQueryEngine

- [ ] Open `src/query/sql-query-engine.js`
- [ ] Remove `getBootstrapPartitions()` method
- [ ] Remove `setBootstrapDirectories()` method
- [ ] Remove bootstrap directory parameters from constructor:

```javascript
// REMOVE:
// this.bootstrapPartitions = options.bootstrapPartitions || null;
// this.bootstrapServices = options.bootstrapServices || null;
```

- [ ] Remove bootstrap directory initialization from `setBootstrapDirectories()`
- [ ] Run linter

### 4.3 Remove bootstrap directory parameters from constructors

- [ ] Search for `bootstrapPartitions` and `bootstrapServices` in codebase
- [ ] Remove from all constructors and method signatures
- [ ] Update all call sites to not pass these parameters
- [ ] Run linter

### 4.4 Write integration test for cache-only routing

- [ ] Create test file: `test/integration/cache-only-routing.integration.test.js`
- [ ] Write test:

```javascript
test('Query routing without bootstrap directories', async (t) => {
  // Bootstrap seed node
  const seedResult = await bootstrapService.bootstrap();
  t.ok(seedResult.success);
  
  // Join second node
  const joinResult = await joiningService.join();
  t.ok(joinResult.success);
  
  // Verify queries work without bootstrap directories
  const result = await sqlEngine.executeQuery('SELECT * FROM nodes');
  t.ok(result.success);
  t.ok(Array.isArray(result.rows));
});
```

- [ ] Run test
- [ ] Verify test passes

### 4.5 Checkpoint 4: Verify Phase 4 Complete

- [ ] Bootstrap directory setup removed from NodeJoiningService
- [ ] Bootstrap directory usage removed from SQLQueryEngine
- [ ] Bootstrap directory parameters removed from constructors
- [ ] Integration test passes
- [ ] Linter passes
- [ ] No bootstrap directory fallbacks remain

## Phase 5: Integration Testing

### 5.1 Fix admin-cdc-propagation integration test

- [ ] Open `test/integration/admin-cdc-propagation.integration.test.js`
- [ ] Verify test passes with new architecture
- [ ] If test fails, debug and fix
- [ ] Run test: `npm test -- test/integration/admin-cdc-propagation.integration.test.js`

### 5.2 Write multi-node cluster integration test

- [ ] Create test file: `test/integration/multi-node-cluster-cache-seeding.integration.test.js`
- [ ] Write test that:
  - Bootstraps seed node
  - Joins 3+ nodes
  - Verifies all nodes have consistent cache
  - Verifies queries work on all nodes
- [ ] Run test
- [ ] Verify test passes

### 5.3 Write CDC propagation integration test

- [ ] Create test file: `test/integration/cdc-propagation-cache-update.integration.test.js`
- [ ] Write test that:
  - Creates table on seed node
  - Verifies CDC event reaches all nodes
  - Verifies all nodes can query the new table
  - Verifies consistency across nodes
- [ ] Run test
- [ ] Verify test passes

### 5.4 Write query routing integration test

- [ ] Create test file: `test/integration/query-routing-cache-based.integration.test.js`
- [ ] Write test that:
  - Verifies SELECT queries route to partition leaders
  - Verifies INSERT queries route to partition leaders
  - Verifies UPDATE queries route to partition leaders
  - Verifies DELETE queries route to partition leaders
- [ ] Run test
- [ ] Verify test passes

### 5.5 Run full test suite

- [ ] Run all tests: `npm test`
- [ ] Verify all tests pass
- [ ] Check for any regressions

### 5.6 Checkpoint 5: Verify Phase 5 Complete

- [ ] admin-cdc-propagation test passes
- [ ] Multi-node cluster test passes
- [ ] CDC propagation test passes
- [ ] Query routing test passes
- [ ] Full test suite passes
- [ ] No regressions

## Final Verification

### Code Quality

- [ ] All files pass linter: `npm run lint`
- [ ] No console.log statements left
- [ ] All error messages are clear
- [ ] All log messages are appropriate

### Documentation

- [ ] Code comments are updated
- [ ] README is updated
- [ ] Architecture documentation is updated
- [ ] Troubleshooting guide is created

### Performance

- [ ] Bootstrap response building: < 100ms
- [ ] Cache hydration: < 50ms
- [ ] CDC subscription setup: < 100ms
- [ ] Total bootstrap time: < 150ms

### Correctness

- [ ] All integration tests pass
- [ ] All property-based tests pass
- [ ] No bootstrap directory fallbacks
- [ ] Clear error messages if cache is missing

## Sign-Off

- [ ] All phases complete
- [ ] All checkpoints verified
- [ ] All tests passing
- [ ] Code review approved
- [ ] Ready for production
