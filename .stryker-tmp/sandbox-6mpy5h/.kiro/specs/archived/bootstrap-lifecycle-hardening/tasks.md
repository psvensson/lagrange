# Implementation Plan: Bootstrap Lifecycle Hardening

## Overview

Incremental implementation of six coordinated improvements to the bootstrap/join/CDC/rebalance lifecycle. Each task builds on previous tasks, with property and unit tests placed close to the implementation they validate. All code is JavaScript following the existing codebase conventions, Google style guide, and zero-duplication contract.

## Tasks

- [x] 1. Create constants and metrics foundation
  - [x] 1.1 Create `src/constants/cdc-lifecycle-constants.js` with all new constants
    - `CDC_CONFIRMATION_DEFAULT_TIMEOUT_MS`, `CDC_EVENT_BUFFER_CAPACITY`, `CDC_PIPELINE_READINESS_POLL_INTERVAL_MS`, `CDC_PIPELINE_READINESS_TIMEOUT_MS`, `CLUSTER_READINESS_TIMEOUT_MS`
    - CDC confirmation error type names, log message constants, metrics counter names
    - _Requirements: 1.5, 3.5_

  - [x] 1.2 Create `src/cdc/cdc-pipeline-metrics.js` — simple counter object
    - Implement `CDCPipelineMetrics` with `increment(counter)`, `getSnapshot()`, `reset()`
    - Counter fields: `eventsGenerated`, `eventsDelivered`, `eventsBuffered`, `eventsDropped`, `deliveryFailures`
    - _Requirements: 6.4_

  - [x] 1.3 Write property test for CDCPipelineMetrics
    - **Property 13: CDC metrics accuracy**
    - **Validates: Requirements 6.4**

- [x] 2. Implement CDC event buffer
  - [x] 2.1 Create `src/partition/cdc-event-buffer.js`
    - Implement `CDCEventBuffer` with `buffer()`, `replay()`, `size()`, `hasEvents()`, `clear()`
    - Bounded capacity from `CDC_EVENT_BUFFER_CAPACITY` constant
    - Drop oldest events on overflow with warning-level log including dropped count
    - Deduplicate on replay using event identity (tableName + operation + primary key + timestamp)
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 2.2 Write property tests for CDCEventBuffer
    - **Property 5: Buffer captures events with no subscribers**
    - **Property 6: Buffer replay preserves generation order**
    - **Property 7: Buffer overflow drops oldest events**
    - **Property 8: Buffer replay deduplicates**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4**

  - [x] 2.3 Integrate CDCEventBuffer into PartitionService
    - In `generateCDCEvent()`: when `cdcSubscribers.size === 0`, buffer the event instead of returning early
    - In `subscribeToCDC()`: after registering subscriber, call `cdcEventBuffer.replay(subscriber)`
    - Increment `CDCPipelineMetrics.eventsBuffered` on buffer, `eventsDropped` on overflow
    - _Requirements: 3.1, 3.2, 6.1_

  - [x] 2.4 Write unit tests for CDCEventBuffer integration
    - Test: empty buffer replay returns 0
    - Test: single event buffer and replay
    - Test: buffer at exact capacity boundary
    - _Requirements: 3.1, 3.2, 3.3_

- [x] 3. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement CDC confirmation tracker
  - [x] 4.1 Create `src/cdc/cdc-confirmation-tracker.js`
    - Implement `CDCConfirmationTracker` with `awaitConfirmation(tableName, primaryKey, timeoutMs)`, `onEventApplied(tableName, operation, data)`, `shutdown()`
    - Uses SystemTableCache `addListener()` to detect cache changes
    - Pending confirmations stored in `Map<string, {resolve, reject, timer}>` keyed by `${tableName}:${primaryKey}`
    - Timeout rejects with descriptive `CDCConfirmationTimeoutError`
    - Shutdown rejects all pending with `CDCConfirmationShutdownError`
    - _Requirements: 1.1, 1.3, 1.4_

  - [x] 4.2 Write property tests for CDCConfirmationTracker
    - **Property 1: CDC confirmation round-trip**
    - **Property 2: CDC confirmation timeout rejection**
    - **Validates: Requirements 1.1, 1.3**

  - [x] 4.3 Wire CDCConfirmationTracker into PartitionService write path
    - Add optional `awaitCDCConfirmation` flag to write options
    - When flag is set, create confirmation promise via tracker before generating CDC event
    - When flag is not set, maintain existing fire-and-forget behavior with zero overhead
    - Increment `CDCPipelineMetrics.eventsGenerated` on every CDC generation
    - Increment `CDCPipelineMetrics.eventsDelivered` when CDCHandler applies event to cache
    - _Requirements: 1.1, 1.2, 6.4_

  - [x] 4.4 Write unit tests for CDC confirmation wiring
    - Test: confirmation for INSERT, UPDATE, UPSERT, DELETE operations
    - Test: shutdown rejects pending confirmations
    - Test: duplicate confirmation requests for same key
    - _Requirements: 1.1, 1.3, 1.4_

- [x] 5. Implement CDC pipeline readiness gate
  - [x] 5.1 Create `src/cdc/cdc-pipeline-readiness-gate.js`
    - Implement `CDCPipelineReadinessGate` with `evaluate(context)` and `waitForReady(context, timeoutMs, pollIntervalMs)`
    - Three conditions: subscriptions active on all CDC-propagated tables, propagation message group has leader, pipeline has delivered at least one event
    - Returns `{ ready: boolean, unmetConditions: string[] }`
    - `waitForReady` polls with configurable interval, rejects on timeout with unmet conditions in error
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 5.2 Write property test for CDCPipelineReadinessGate
    - **Property 3: Pipeline readiness gate evaluation**
    - **Validates: Requirements 2.1, 2.2, 2.3**

  - [x] 5.3 Integrate readiness gate into BootstrapService
    - After `subscribeToInitialSystemTableCDC()` and before transitioning node to READY, call `CDCPipelineReadinessGate.waitForReady()`
    - On timeout, fail bootstrap with descriptive error listing unmet conditions
    - _Requirements: 2.4, 2.5_

  - [x] 5.4 Integrate readiness gate into NodeJoiningService
    - After `subscribeToCDCEvents()` and before transitioning node to READY, call `CDCPipelineReadinessGate.waitForReady()`
    - On timeout, fail join with descriptive error listing unmet conditions
    - _Requirements: 2.4, 2.6_

  - [x] 5.5 Write property test for node state gating
    - **Property 4: Node state gated by pipeline readiness**
    - **Validates: Requirements 2.5, 2.6**

- [x] 6. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement cluster readiness signal and rebalancer gating
  - [x] 7.1 Create `src/rebalancer/cluster-readiness-signal.js`
    - Implement `ClusterReadinessSignal` with `evaluate(context)`
    - Three conditions: CDC pipeline ready (delegates to CDCPipelineReadinessGate), expected nodes registered with ACTIVE status, cache hydrated for all CDC-propagated tables
    - Returns `{ ready: boolean, unmetConditions: string[] }`
    - _Requirements: 4.2_

  - [x] 7.2 Write property test for ClusterReadinessSignal
    - **Property 9: Cluster readiness signal evaluation**
    - **Validates: Requirements 4.2**

  - [x] 7.3 Integrate cluster readiness gate into UnifiedRebalancer
    - Add `clusterReadinessSignal` option to constructor
    - In `checkRebalance()`, before the first planning cycle, evaluate the signal
    - While signal reports not ready, defer planning and re-evaluate at next periodic check
    - After configurable timeout, log warning with unmet conditions and proceed
    - Once signal is satisfied (or timeout reached), set a `clusterReadinessConfirmed` flag and skip future checks
    - _Requirements: 4.1, 4.3, 4.4, 4.5_

  - [x] 7.4 Write property test for rebalancer gating
    - **Property 10: No rebalancer planning while cluster not ready**
    - **Validates: Requirements 4.3, 4.4**

- [x] 8. Implement CDC pipeline observability improvements (was Task 9)
  - [x] 8.1 Add warning logs for silent CDC event drops
    - In `PartitionService.generateCDCEvent()`: when event is generated but buffer is full and no subscribers, emit warning log with `{ tableName, operation, partitionId }`
    - In `BootstrapService.resolveCdcPropagationMessageGroup()`: when returning null, emit warning log with `{ tableName, operation, reason }`
    - In `NodeJoiningService`: same pattern for its `resolveCdcPropagationMessageGroup` equivalent
    - In `CDCGroupPropagationService`: when message group resolution fails, emit warning log instead of silent fallback
    - _Requirements: 6.1, 6.2, 6.3, 6.5_

  - [x] 8.2 Write unit tests for CDC observability
    - Test: warning log emitted when no subscribers and buffer full
    - Test: warning log emitted when message group resolution returns null
    - Test: metrics snapshot contains correct counter values
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ] 9. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Update failing integration tests
  - [x] 10.1 Update `cdc-propagation.integration.test.js`
    - Replace polling/timeout patterns with `CDCConfirmationTracker.awaitConfirmation()`
    - Verify cache visibility using confirmation promise instead of hardcoded delays
    - _Requirements: 7.1_

  - [x] 10.2 Update `control-plane-rebalance.integration.test.js`
    - Use `ClusterReadinessSignal` to wait for cluster readiness before asserting rebalancer outcomes
    - Remove `stopAllRebalancers()` workarounds where readiness gating makes them unnecessary
    - _Requirements: 7.2_

  - [x] 10.3 Update `leader-metadata-validation.integration.test.js`
    - Use `CDCPipelineReadinessGate.waitForReady()` to confirm pipeline readiness before leader metadata assertions
    - _Requirements: 7.3_

  - [x] 10.4 Update `multi-node-raft-replication.integration.test.js`
    - Use `CDCConfirmationTracker.awaitConfirmation()` for cross-node write visibility verification
    - _Requirements: 7.4_

- [ ] 11. Final checkpoint — Ensure all tests pass
  - Run full test suite. Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties using fast-check with `{ numRuns: 10 }`
- Unit tests validate specific examples and edge cases
- All new files follow the existing codebase conventions: 2-space indent, single quotes, semicolons, named constants, no eslint-disable comments
