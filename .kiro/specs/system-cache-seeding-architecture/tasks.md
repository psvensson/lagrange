# System Cache Seeding Architecture - Implementation Tasks

## Overview

This document outlines the implementation tasks for the system cache seeding architecture fix. Tasks should be executed in order, as later tasks depend on earlier ones.

## Task List

### Phase 0: Seed Node Bootstrap Mode ✅ COMPLETE

- [x] 0.1 Add bootstrap mode to CDCIntegrationService
  - Add `bootstrapMode` flag and `localPartitionServices` property to constructor
  - Add `setBootstrapMode(enabled, partitionServices)` method
  - Add `clearBootstrapMode()` method
  - **Validates: Requirement 8.1, 8.2**

- [x] 0.2 Add direct write method to CDCIntegrationService
  - Add `executeSQLDirectToLocalPartition(sql, params)` method
  - Parse SQL to extract table name
  - Find local partition service for table
  - Execute SQL directly on partition
  - **Validates: Requirement 8.3**

- [x] 0.3 Modify CDCIntegrationService.executeSQL() to check bootstrap mode
  - If bootstrap mode enabled: call `executeSQLDirectToLocalPartition()`
  - If bootstrap mode disabled: call `sqlQueryEngine.executeQuery()`
  - Single code path based on mode flag
  - **Validates: Requirement 8.4, 8.5**

- [x] 0.4 Modify BootstrapService.phaseRegistration() to use bootstrap mode
  - Enable bootstrap mode before system table writes
  - Pass local partition services to CDC service
  - Perform all registration writes
  - Disable bootstrap mode after writes complete
  - **Validates: Requirement 8.6**

- [x] 0.5 Implement BootstrapService.phaseCacheHydration() to populate cache
  - Read all system table data from local partitions
  - Use `applySystemTableChange()` to populate cache
  - Verify cache contains complete cluster state
  - Log cache population status
  - **Validates: Requirement 7.3, 7.4, 7.5**

- [x] 0.6 Write unit tests for bootstrap mode
  - Test bootstrap mode enable/disable
  - Test direct write to local partition
  - Test executeSQL routing based on mode
  - Test bootstrap mode is seed node only
  - **Validates: Requirement 8.7**

- [x] 0.7 Write integration test for seed node bootstrap
  - Verify seed node can bootstrap without system cache
  - Verify direct writes succeed during registration
  - Verify cache is populated after hydration
  - Verify writes after bootstrap route through SQL engine
  - **Validates: Requirements 7.1-7.6, 8.1-8.7**

### Phase 1: Bootstrap Response Enhancement ✅ COMPLETE

- [x] 1.1 Add buildSystemTableSnapshots() method to BootstrapAPI
  - Reads all system tables from system cache
  - Returns complete snapshots for nodes, partitions, services, tables, message_groups, replica_operations
  - Handles missing cache gracefully

- [x] 1.2 Modify BootstrapAPI.handleBootstrapRequest() to include system table snapshots
  - Add systemTableSnapshots to bootstrap response
  - Replace partitionLeaders with systemTableSnapshots
  - Verify response includes all required fields

- [x] 1.3 Write property-based test for bootstrap response completeness
  - **Validates: Requirements 1.1, 1.2, 1.3**
  - Verify all system tables are in response
  - Verify each table is an array
  - Verify response structure is correct
- [x] 1.4 Gate bootstrap response on raft leader readiness
  - Verify all partition/message group services have a leader before responding
  - Return 503 when leaders are missing

### Phase 2: System Cache Hydration ✅ COMPLETE

- [x] 2.1 Add hydrateSystemCacheFromBootstrap() method to NodeJoiningService
  - Extracts system table snapshots from bootstrap response
  - Inserts all records into system cache
  - Handles missing snapshots gracefully

- [x] 2.2 Modify NodeJoiningService.phaseQuerySystemState() to hydrate cache
  - Call hydrateSystemCacheFromBootstrap() at start of phase
  - Clear bootstrap directories after hydration
  - Verify cache is populated before proceeding

- [x] 2.3 Write property-based test for cache hydration correctness
  - **Validates: Requirements 2.1, 2.2, 2.3**
  - Verify all records from snapshots are in cache
  - Verify cache can be queried after hydration
  - Verify bootstrap directories are cleared

### Phase 3: SQL Engine Cache-Based Routing ✅ COMPLETE

- [x] 3.1 Modify SQLQueryEngine.getTablePartitions() to use ONLY system cache
  - Remove bootstrap directory fallback
  - Throw error if cache not available
  - Verify partitions are found in cache

- [x] 3.2 Modify QueryExecutor.findPartitionLeaderAddress() to use system cache
  - Query services table in cache for partition leader
  - Return leader address
  - Handle missing leader gracefully

- [x] 3.3 Update SQLQueryEngine routing to use cache-based leader lookup
  - For SELECT: use cache to find partition leaders
  - For INSERT/UPDATE/DELETE: use cache to find partition leaders
  - Verify all queries route through message router

- [x] 3.4 Write unit test for SQL engine cache routing
  - **Validates: Requirements 5.1, 5.2, 5.3**
  - Verify queries route through message router
  - Verify correct partition leader is used
  - Verify system tables prefer leader

### Phase 4: CDC Subscription Integration ✅ COMPLETE

- [x] 4.1 CDC subscriptions already implemented in NodeJoiningService
  - Subscribe to CDC events for all system tables
  - Verify subscriptions are established
  - Handle subscription failures
  - **Validates: Requirements 4.1, 4.2, 4.3**

### Phase 5: Node Registration

- [x] 5.1 Add registerNodeInCluster() method to NodeJoiningService
  - Use SQL query engine to INSERT into nodes table
  - Query routes through message router to partition leader
  - Verify node is registered
  - **Validates: Requirement 2.1**

- [x] 5.2 Modify NodeJoiningService.phaseQuerySystemState() to register node
  - Call registerNodeInCluster() after cache hydration
  - Verify node is in nodes table
  - Verify CDC event is generated
  - **Validates: Requirement 2.2**

- [ ] 5.3 Write integration test for node registration
  - Verify node appears in nodes table
  - Verify CDC event is received
  - Verify other nodes see the new node
  - **Validates: Requirement 2.3**

### Phase 6: Bootstrap Directory Elimination ✅ COMPLETE

- [x] 6.1 Remove bootstrap directory parameters from constructors
  - Remove `bootstrapPartitions` parameter from SQLQueryEngine constructor
  - Remove `bootstrapServices` parameter from SQLQueryEngine constructor
  - Remove `bootstrapServices` parameter from QueryExecutor constructor
  - **Validates: Requirement 3.1**

- [x] 6.2 Remove bootstrap directory methods from SQLQueryEngine
  - Remove `setBootstrapDirectories()` method
  - Verify all queries use system cache only
  - **Validates: Requirement 3.2**

- [x] 6.3 Remove bootstrap directory methods from QueryExecutor
  - Remove `setBootstrapServices()` method
  - Remove `getBootstrapService()` method
  - Remove bootstrap fallback logic from `getPartitionServiceCandidates()`
  - **Validates: Requirement 3.3**

- [x] 6.4 Remove bootstrap directory setup from NodeJoiningService
  - Remove `setBootstrapDirectories()` call from `phaseQuerySystemState()`
  - Verify cache hydration is sufficient
  - **Validates: Requirement 3.4**

- [x] 6.5 Write integration test for cache-only routing
  - Verify queries work without bootstrap directories
  - Verify queries fail gracefully if cache is missing data
  - Verify error messages are clear
  - **Validates: Requirement 3.5**

### Phase 7: Integration Testing - REMAINING WORK

- [ ] 7.1 Verify admin-cdc-propagation integration test passes
  - Verify seed node bootstrap works
  - Verify second node joins successfully
  - Verify third node joins successfully
  - Verify CDC events are received
  - **Validates: Requirements 1.1-1.3, 2.1-2.3, 4.1-4.3**

- [ ] 7.2 Verify multi-node-cluster integration test passes
  - Bootstrap seed node
  - Join 3+ nodes
  - Verify all nodes have consistent cache
  - Verify queries work on all nodes
  - **Validates: Requirements 1.1-1.3, 2.1-2.3, 4.1-4.3, 5.1-5.3**

- [ ] 7.3 Write CDC propagation integration test
  - Create table on seed node
  - Verify CDC event reaches all nodes
  - Verify all nodes can query the new table
  - Verify consistency across nodes
  - **Validates: Requirements 4.1-4.3**

- [ ] 7.4 Write query routing integration test
  - Verify SELECT queries route to partition leaders
  - Verify INSERT queries route to partition leaders
  - Verify UPDATE queries route to partition leaders
  - Verify DELETE queries route to partition leaders
  - **Validates: Requirements 5.1-5.3**

### Phase 8: Performance and Reliability

- [x] 8.1 Verify bootstrap response building performance
  - Measure time to build response
  - Verify < 100ms for typical cluster
  - Optimize if needed

- [x] 8.2 Verify cache hydration performance
  - Measure time to hydrate cache
  - Verify < 50ms for typical cluster
  - Optimize if needed

- [ ] 8.3 Verify CDC subscription performance
  - Measure time to subscribe
  - Verify < 100ms for all system tables
  - Optimize if needed

- [ ] 8.4 Write stress test for multi-node joins
  - Join 10+ nodes simultaneously
  - Verify all nodes join successfully
  - Verify cache consistency
  - Verify no deadlocks or timeouts

### Phase 9: Documentation and Cleanup

- [x] 9.1 Update code comments to reflect new architecture
  - Document system cache as single source of truth
  - Document bootstrap response structure
  - Document cache hydration process

- [x] 9.2 Update README and architecture documentation
  - Explain system cache seeding
  - Explain CDC subscription
  - Explain query routing

- [ ] 9.3 Remove old bootstrap directory documentation
  - Remove references to bootstrap directories
  - Remove workaround documentation
  - Update architecture diagrams

- [ ] 9.4 Add troubleshooting guide
  - Document common issues
  - Document error messages
  - Document recovery procedures

## Checkpoint Tasks

### Checkpoint 0: Seed Node Bootstrap Mode Complete

After completing Phase 0, verify:
- [ ] CDCIntegrationService has bootstrap mode capability
- [ ] Bootstrap mode can be enabled/disabled
- [ ] Direct writes work when bootstrap mode enabled
- [ ] Direct writes fail when bootstrap mode disabled
- [ ] Seed node can bootstrap without system cache
- [ ] Cache is populated after bootstrap
- [ ] All writes after bootstrap route through SQL engine
- [ ] Unit tests pass for bootstrap mode
- [ ] Integration test passes for seed node bootstrap

### Checkpoint 1: Bootstrap Response Complete

After completing Phase 1, verify:
- [ ] Bootstrap response includes all system table snapshots
- [ ] Response structure is correct
- [ ] Bootstrap response waits for raft group leaders
- [ ] Single code path for bootstrap response
- [ ] Property-based test passes

### Checkpoint 2: Cache Hydration Complete

After completing Phase 2, verify:
- [ ] Cache hydration works correctly
- [ ] Bootstrap directories are cleared
- [ ] Cache can be queried after hydration
- [ ] Property-based test passes

### Checkpoint 3: SQL Engine Routing Complete

After completing Phase 3, verify:
- [ ] All queries route through system cache
- [ ] Partition leaders are found correctly
- [ ] Message router is used for all queries
- [ ] Property-based test passes

### Checkpoint 4: Full Integration Test

After completing Phase 7, verify:
- [ ] admin-cdc-propagation test passes
- [ ] Multi-node cluster test passes
- [ ] CDC propagation test passes
- [ ] Query routing test passes

## Success Criteria

All tasks must be completed and all tests must pass:

1. **Bootstrap Response**: Contains complete system table snapshots
2. **Cache Hydration**: Joins nodes can hydrate cache from bootstrap response
3. **Query Routing**: All queries route through system cache to partition leaders
4. **CDC Subscriptions**: Cache stays updated as cluster state changes
5. **Integration Tests**: Multi-node cluster works correctly
6. **Performance**: Bootstrap and hydration complete in < 150ms total
7. **Reliability**: No bootstrap directory fallbacks needed

## Notes

- Tasks should be executed in order
- Each task should be tested before moving to the next
- Integration tests should be run after each phase
- Performance should be verified at checkpoints
- Documentation should be updated as code changes


## Summary

### Completed Work (Phases 0-4)

The core architecture has been successfully implemented:

1. **Seed Node Bootstrap Mode** - Seed node can bootstrap without system cache using direct writes
2. **Bootstrap Response Enhancement** - Complete system table snapshots included in bootstrap response
3. **System Cache Hydration** - Joining nodes hydrate cache from bootstrap response
4. **SQL Engine Cache-Based Routing** - All queries route through system cache
5. **CDC Subscriptions** - Already implemented in NodeJoiningService

### Remaining Work (Phases 5-9)

The remaining work focuses on cleanup and testing:

1. **Phase 5 (Node Registration)** - Add explicit node registration method (3 tasks)
2. **Phase 7 (Integration Testing)** - Verify all integration tests pass (4 tasks)
3. **Phase 8 (Performance)** - Optional performance verification (2 tasks)
4. **Phase 9 (Documentation)** - Optional documentation updates (2 tasks)

### Critical Path

The critical path to completion is:
1. Phase 5: Node Registration (required for proper cluster membership)
2. Phase 7: Integration Testing (required to verify everything works)

Phases 8 and 9 are optional enhancements.

### Estimated Effort

- Phase 5: 2-3 hours
- Phase 7: 4-6 hours
- **Total Critical Path**: 6-9 hours

### Success Criteria

- [x] Bootstrap response contains complete system table snapshots
- [x] Joining nodes can hydrate cache from bootstrap response
- [x] Seed node can bootstrap without system cache
- [x] After bootstrap, system cache is populated
- [x] All queries route through system cache
- [x] CDC subscriptions keep cache updated
- [ ] Node registration works through system cache
- [x] No bootstrap directory fallbacks remain
- [ ] Multi-node cluster works correctly
- [ ] All integration tests pass
