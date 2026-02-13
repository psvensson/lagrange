# Implementation Plan: Admin CLI Cache Hydration Fix

## Overview

This implementation plan fixes the Admin CLI empty views issue by adding cache hydration on startup and ensuring CDC events are properly forwarded to connected clients. The implementation follows a layered approach: first add notification capability to the cache, then implement hydration, then wire up the AdminWebSocketAPI.

## Tasks

- [x] 1. Add notification capability to SystemTableCache
  - [x] 1.1 Add listener registration to SystemTableCache
    - Add `listeners` Set to store change listeners
    - Implement `onCacheChange(listener)` method to register listeners
    - Listeners receive (tableName, operation, record) on each change
    - _Requirements: 2.1_

  - [x] 1.2 Emit notifications on cache changes
    - Modify `applySystemTableChange()` to notify listeners after applying change
    - Use `setImmediate()` to make notifications non-blocking
    - Wrap listener calls in try/catch to isolate errors
    - _Requirements: 2.1, 2.6_

  - [x] 1.3 Add getAllData() method for cache dumps
    - Implement method to return all cache data as { tableName: [...rows] }
    - Used by AdminWebSocketAPI for cache dumps
    - _Requirements: 3.1_

  - [x] 1.4 Write property test for CDC Event Broadcast Completeness
    - **Property 4: CDC Event Broadcast Completeness**
    - **Validates: Requirements 2.1, 2.3, 2.4**

- [x] 2. Implement CacheHydrationService
  - [x] 2.1 Create CacheHydrationService class
    - Create new file `src/cache/cache-hydration-service.js`
    - Constructor takes queryEngine, systemTableCache, logger
    - Define list of system tables to hydrate
    - _Requirements: 1.1, 1.7_

  - [x] 2.2 Implement hydrateCache() method
    - Query each system table partition with `SELECT * FROM {table}`
    - Call `applySystemTableChange('INSERT', row)` for each row
    - Log row count for each table after hydration
    - _Requirements: 1.2_

  - [x] 2.3 Implement partial failure handling
    - Wrap each table hydration in try/catch
    - Log error and continue with other tables on failure
    - _Requirements: 1.5_

  - [x] 2.4 Write property test for Cache Hydration Completeness
    - **Property 1: Cache Hydration Completeness**
    - **Validates: Requirements 1.1, 1.2, 1.7**

  - [x] 2.5 Write property test for Partial Hydration Resilience
    - **Property 2: Partial Hydration Resilience**
    - **Validates: Requirements 1.5**

  - [x] 2.6 Write property test for Hydration Does Not Generate CDC
    - **Property 3: Hydration Does Not Generate CDC**
    - **Validates: Requirements 1.6**

- [x] 3. Checkpoint - Verify cache hydration
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Update AdminWebSocketAPI for CDC forwarding
  - [x] 4.1 Subscribe to cache notifications
    - Call `systemTableCache.onCacheChange()` in constructor
    - Store reference to broadcast method
    - _Requirements: 2.2_

  - [x] 4.2 Implement broadcastCDCEvent() method
    - Format CDC event message with type, table, operation, record, timestamp
    - Send to all connected clients
    - Handle send errors gracefully (log and continue)
    - _Requirements: 2.3, 2.4_

  - [x] 4.3 Update sendCacheDump() for empty cache fallback
    - Check if cache is empty (all tables have 0 rows)
    - If empty, call queryPartitionsForDump() to get data directly
    - Send cache_dump message with data
    - _Requirements: 3.3_

  - [x] 4.4 Implement queryPartitionsForDump() method
    - Query each system table partition directly
    - Return data in same format as cache dump
    - Handle query errors gracefully
    - _Requirements: 3.3_

  - [x] 4.5 Write property test for Cache Dump Completeness
    - **Property 5: Cache Dump Completeness**
    - **Validates: Requirements 3.1, 3.3, 3.4**

- [x] 5. Integrate hydration into bootstrap
  - [x] 5.1 Add hydration phase to bootstrap sequence
    - Create CacheHydrationService after partition leadership established
    - Call hydrateCache() before starting Admin API
    - Log phase start and completion
    - _Requirements: 1.3, 1.4_

  - [x] 5.2 Ensure Admin API starts after hydration
    - Move Admin API start to after hydration completes
    - This ensures clients always get populated cache dump
    - _Requirements: 1.4_

- [x] 6. Checkpoint - Verify end-to-end flow
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Integration testing (Manual verification required)
  - [x] 7.1 Test restart scenario manually
    - **Instructions:**
      1. Terminal 1: `./scripts/start-seed-node.sh`
      2. Terminal 2: `./scripts/start-admin-cli.sh`
      3. Verify Admin CLI shows: nodes, services, tables, partitions, message_groups
      4. Stop seed node (Ctrl+C in Terminal 1)
      5. Restart: `./scripts/start-seed-node.sh`
      6. Verify Admin CLI reconnects and shows all data after restart
    - _Requirements: 1.1, 3.1_

  - [x] 7.2 Test node join scenario manually
    - **Instructions:**
      1. Terminal 1: `./scripts/start-seed-node.sh`
      2. Terminal 2: `./scripts/start-admin-cli.sh`
      3. Terminal 3: `./scripts/start-second-node.sh`
      4. Verify new node appears in Admin CLI nodes view in real-time
      5. Verify new services appear for the second node
    - _Requirements: 4.3, 4.5_

- [x] 8. Final Checkpoint - Full verification
  - Run complete test suite
  - Verify Admin CLI works correctly after restart
  - Verify real-time CDC updates flow to Admin CLI

## Notes

- All property-based tests are required
- The implementation modifies existing files rather than creating many new ones
- Key files to modify:
  - `src/cache/system-table-cache.js` - Add notifications
  - `src/admin/admin-websocket-api.js` - Subscribe to notifications, broadcast CDC
  - `src/bootstrap/bootstrap-service.js` - Add hydration phase
- New file to create:
  - `src/cache/cache-hydration-service.js` - Hydration logic
