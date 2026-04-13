# System Cache Seeding Architecture - Implementation Summary

## Quick Reference

This document provides a quick reference for implementing the system cache seeding architecture fix.

## Problem Statement

**Current Issue**: Joining nodes cannot write to system tables because they don't have the complete system state in their cache. The bootstrap response only contains `partitionLeaders`, which is insufficient.

**Root Cause**: Bootstrap directories are used as a temporary workaround, but they're inconsistent and don't contain all necessary information.

**Impact**: Integration tests fail when nodes try to write to `replica_operations` table with error "No leader available for write operation".

## Solution Overview

**Key Insight**: The bootstrap response should contain complete snapshots of ALL system tables, allowing joining nodes to hydrate their cache immediately.

**Architecture Principle**: System cache is the ONLY source of truth for partition locations and leaders after bootstrap.

## Implementation Roadmap

### Phase 1: Bootstrap Response Enhancement (1-2 hours)
**File**: `src/bootstrap/bootstrap-api.js`

Add method to build system table snapshots:
```javascript
buildSystemTableSnapshots() {
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

Modify `handleBootstrapRequest()` to include snapshots in response and replace `partitionLeaders`.

**Risk**: Low - clean replacement

### Phase 2: System Cache Hydration (2-3 hours)
**File**: `src/bootstrap/node-joining-service.js`

Add three new methods:
1. `hydrateSystemCacheFromBootstrap()` - Populate cache from bootstrap response
2. `registerNodeInCluster()` - Insert joining node into nodes table
3. `subscribeToCDCEvents()` - Subscribe to CDC events for all system tables

Modify `phaseQuerySystemState()` to call these methods in order.

**Risk**: Medium - new code path

### Phase 3: SQL Engine Cache-Based Routing (3-4 hours)
**Files**: `src/query/sql-query-engine.js`, `src/query/query-executor.js`

1. Modify `SQLQueryEngine.getTablePartitions()` to use ONLY system cache
2. Add `QueryExecutor.findPartitionLeaderAddress()` method
3. Modify query execution methods to use cache-based leader lookup

**Risk**: High - affects all queries, no fallback

### Phase 4: Bootstrap Directory Elimination (2-3 hours)
**Files**: `src/bootstrap/node-joining-service.js`, `src/query/sql-query-engine.js`

Remove all bootstrap directory usage:
- Remove `setBootstrapDirectories()` calls
- Remove `getBootstrapPartitions()` method
- Remove bootstrap directory parameters from constructors

**Risk**: High - removes fallback mechanism

### Phase 5: Integration Testing (4-5 hours)
**File**: `test/integration/admin-cdc-propagation.integration.test.js`

Fix failing tests and add new tests:
1. Fix admin-cdc-propagation test
2. Add multi-node cluster test
3. Add CDC propagation test
4. Add query routing test

**Risk**: Medium - validates all changes work together

## Key Files to Modify

| File | Current Lines | Changes | New Lines | Complexity |
|------|---------------|---------|-----------|------------|
| `src/bootstrap/bootstrap-api.js` | 1083 | Add `buildSystemTableSnapshots()`, modify `handleBootstrapRequest()` | +50 | Low |
| `src/bootstrap/node-joining-service.js` | 2004 | Add 3 methods, modify `phaseQuerySystemState()` | +150 | High |
| `src/query/sql-query-engine.js` | 400+ | Modify `getTablePartitions()`, remove bootstrap fallback | +30 | Medium |
| `src/query/query-executor.js` | 500+ | Add `findPartitionLeaderAddress()`, modify query methods | +80 | High |
| `test/integration/admin-cdc-propagation.integration.test.js` | 300+ | Fix tests | +50 | Medium |

## Code Patterns

### Pattern 1: Reading from System Cache

```javascript
// Get all records from a system table
const records = this.systemCache.getAll(TABLES.NODES) || [];

// Filter records by condition
const filtered = this.systemCache.filter(TABLES.SERVICES, (s) =>
  s.partition_id === partitionId &&
  s.service_type === SERVICE_TYPE.PARTITION &&
  s.raft_role === RAFT_ROLE.LEADER &&
  s.status === STATE.ACTIVE,
) || [];
```

### Pattern 2: Inserting into System Cache

```javascript
// Insert a single record
const cache = this.systemTableCache;
for (const record of records) {
  cache.insert(tableName, record);
}
```

### Pattern 3: Routing Queries Through Message Router

```javascript
// Find partition leader address
const leaderAddress = this.findPartitionLeaderAddress(partitionId);

// Route query through message router
const result = await this.messageRouter.deliver(leaderAddress, {
  type: 'QUERY',
  operation: 'SELECT',
  sql: ast,
  params,
});
```

## Testing Strategy

### Unit Tests
- Verify `buildSystemTableSnapshots()` returns all system tables
- Verify `hydrateSystemCacheFromBootstrap()` populates cache correctly
- Verify `findPartitionLeaderAddress()` finds leader from cache
- Verify queries route through message router

### Integration Tests
- Verify seed node bootstrap works
- Verify joining node can hydrate cache
- Verify joining node can register itself
- Verify multi-node cluster has consistent cache
- Verify CDC events update cache on all nodes

### Property-Based Tests
- Verify bootstrap response contains all system tables
- Verify cache hydration is complete
- Verify all queries route through cache
- Verify bootstrap directories are cleared

## Success Criteria

All of the following must be true:

1. ✓ Bootstrap response includes complete system table snapshots
2. ✓ Joining nodes can hydrate cache from bootstrap response
3. ✓ All queries route through system cache to partition leaders
4. ✓ Cache stays updated via CDC subscriptions
5. ✓ Integration tests pass (admin-cdc-propagation, multi-node cluster)
6. ✓ Bootstrap and hydration complete in < 150ms total
7. ✓ No bootstrap directory fallbacks needed
8. ✓ Clear error messages if cache is missing data

## Checkpoints

### Checkpoint 1: After Phase 1
- [ ] Bootstrap response includes system table snapshots
- [ ] Single code path for bootstrap response
- [ ] Unit tests pass

### Checkpoint 2: After Phase 2
- [ ] Cache hydration works correctly
- [ ] Node registration works
- [ ] CDC subscriptions are created
- [ ] Integration tests pass

### Checkpoint 3: After Phase 3
- [ ] All queries route through system cache
- [ ] Partition leaders are found correctly
- [ ] Message router is used for all queries
- [ ] Property tests pass

### Checkpoint 4: After Phase 4
- [ ] Bootstrap directories are removed
- [ ] Queries work without bootstrap directories
- [ ] Clear errors if cache is missing data

### Checkpoint 5: After Phase 5
- [ ] All integration tests pass
- [ ] Multi-node cluster works correctly
- [ ] CDC propagation works correctly
- [ ] Query routing works correctly

## Common Pitfalls to Avoid

1. **Don't forget to clear bootstrap directories** - After hydration, they must be cleared
2. **Don't use bootstrap directories as fallback** - System cache must be the only source
3. **Don't forget CDC subscriptions** - Cache must stay updated as cluster changes
4. **Don't forget to register the joining node** - It must appear in the nodes table
5. **Don't forget error handling** - Clear errors if cache is missing data

## Performance Targets

| Operation | Target | Notes |
|-----------|--------|-------|
| Bootstrap response building | < 100ms | Reading from cache |
| Cache hydration | < 50ms | Inserting records into cache |
| CDC subscription setup | < 100ms | Subscribing to events |
| Query routing | ~10ms | Same as before, just different source |
| Total bootstrap time | < 150ms | Sum of above |

## Single Code Path

- Bootstrap response contains only `systemTableSnapshots`
- All nodes use the system cache as the single source of truth
- No fallback mechanisms or legacy code paths

## Related Documentation

- **Requirements**: `.kiro/specs/system-cache-seeding-architecture/requirements.md`
- **Design**: `.kiro/specs/system-cache-seeding-architecture/design.md`
- **Tasks**: `.kiro/specs/system-cache-seeding-architecture/tasks.md`
- **Steering**: `.kiro/steering/system guidelines.md`

## Questions?

Refer to the detailed design document for:
- Architecture diagrams
- Data flow sequences
- Correctness properties
- Risk mitigation strategies
- Migration path details
