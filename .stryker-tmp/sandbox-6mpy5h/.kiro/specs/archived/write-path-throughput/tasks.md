# Implementation Plan: Write Path Throughput Optimizations

## Overview

Four independent optimizations to the distributed write path, each modifying a single owning component. Tasks are ordered so each optimization is self-contained with its own tests, followed by integration wiring and a final checkpoint.

## Tasks

- [x] 1. Parallelize partition writes in DistributedWriteCoordinator
  - [x] 1.1 Refactor `executePlan()` in `src/query/distributed-write-coordinator.js` to use `Promise.allSettled()` for multi-partition plans
    - Replace the sequential `for...of` loop with concurrent execution
    - Add single-partition fast path that skips `Promise.allSettled()`
    - Sort `participantResults` by `partitionId` after collection for deterministic ordering
    - Preserve existing failure aggregation logic (failedPartitions, partitionErrors, retryCount)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
  - [x] 1.2 Write property tests for parallel partition execution
    - **Property 1: Parallel execution reports all failures**
    - **Validates: Requirements 1.2**
    - **Property 2: Parallel execution aggregates success results**
    - **Validates: Requirements 1.3**
    - **Property 3: Partition result ordering is deterministic**
    - **Validates: Requirements 1.5**
  - [x] 1.3 Write unit tests for parallel partition execution
    - Test single-partition fast path
    - Test all-fail, all-succeed, and mixed cases
    - Test that rejected promises are captured as failures
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 2. Implement SQL parse result caching
  - [x] 2.1 Create `SqlParseCache` class in `src/query/sql-parse-cache.js`
    - Implement LRU cache using `Map` insertion-order semantics
    - `get(sql, dialect)` returns deep clone via `structuredClone()` or null
    - `set(sql, dialect, ast)` stores entry, evicts LRU when at capacity
    - `buildKey(sql, dialect)` creates composite key
    - Add `SQL_PARSE_CACHE` constants to `src/query/query-constants.js`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.6_
  - [x] 2.2 Integrate `SqlParseCache` into `SQLQueryEngine`
    - Create cache instance in `SQLQueryEngine` constructor
    - In `executeQuery()`, check cache before creating `SQLParser`
    - On cache miss, parse and store result, return clone
    - On cache hit, return clone directly
    - _Requirements: 2.1, 2.5_
  - [x] 2.3 Write property tests for SQL parse cache
    - **Property 4: Parse cache round-trip equivalence**
    - **Validates: Requirements 2.1, 2.2, 2.5**
    - **Property 5: LRU eviction maintains bounded cache size**
    - **Validates: Requirements 2.3, 2.6**
  - [x] 2.4 Write unit tests for SQL parse cache
    - Test cache hit returns equivalent AST
    - Test PG dialect `_paramMapping` preservation
    - Test different dialects produce separate cache entries
    - Test LRU eviction order
    - Test max size boundary
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.6_

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Defer payload hash for non-transactional writes
  - [x] 4.1 Refactor `executeInsert()`, `executeUpdate()`, `executeDelete()` in `src/query/sql-query-engine.js`
    - Move `createWriteOperationPayloadHash()` call out of the synchronous path for non-transactional writes
    - Keep synchronous hash computation for transactional writes (before `recordWriteOperation`)
    - `fireNonTransactionalWriteStart()` already calls `createWriteOperationPayloadHash()` internally, so remove the redundant call from the caller
    - _Requirements: 3.1, 3.2_
  - [x] 4.2 Write property test for payload hash determinism
    - **Property 6: Payload hash is deterministic**
    - **Validates: Requirements 3.3**
  - [x] 4.3 Write unit tests for deferred hash
    - Verify non-transactional insert path does not compute hash before `executePlan`
    - Verify transactional insert path still computes hash before `recordWriteOperation`
    - _Requirements: 3.1, 3.2_

- [x] 5. Implement local message delivery fast path
  - [x] 5.1 Add `deliverLocal()` method to `MessageRouter` in `src/transport/message-router.js`
    - Construct envelope matching `handleServiceMessage()` shape
    - Invoke handler directly, await result
    - Return ACK result matching remote delivery shape
    - Catch handler errors and return `{acknowledged: false, error}`
    - Fall back to `deliverRemote()` when no handler registered (for special handlers)
    - _Requirements: 4.1, 4.3, 4.4_
  - [x] 5.2 Update `deliver()` to route local messages through `deliverLocal()`
    - Replace the self-connection check with `deliverLocal()` call when `targetNodeId === this.nodeId`
    - Preserve metrics logging after delivery (already happens in `deliver()`)
    - _Requirements: 4.1, 4.2, 4.5_
  - [x] 5.3 Write property test for local delivery equivalence
    - **Property 7: Local delivery produces equivalent results to handler invocation**
    - **Validates: Requirements 4.3**
  - [x] 5.4 Write unit tests for local delivery
    - Test handler success returns acknowledged result
    - Test handler error returns error result
    - Test no-handler fallback to remote path
    - Test metrics logging still fires for local delivery
    - _Requirements: 4.1, 4.3, 4.4, 4.5_

- [x] 6. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each optimization (tasks 1, 2, 4, 5) is independent and can be implemented in any order
- All changes modify existing owning components only — no new architectural components
- Property tests use `fast-check` with `{numRuns: 10}` per workspace guidelines
- Checkpoints at tasks 3 and 6 verify incremental correctness
