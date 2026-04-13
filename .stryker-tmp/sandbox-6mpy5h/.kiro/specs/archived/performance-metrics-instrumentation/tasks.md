# Implementation Plan: Performance Metrics Instrumentation

## Overview

Add structured `metrics.*` logging to the system's hot paths for throughput
and latency observability on large datasets.

Execution order:
1. Constants and infrastructure
2. Query execution path (highest impact for large datasets)
3. Storage and transport layer
4. CDC and cache hydration
5. Callback and rebalance paths
6. Tests and documentation

## Tasks

- [x] 1. Define metrics constants
  - Create `src/constants/metrics-constants.js` with `METRICS_LOG_TAG` enum
    containing all 15 log tags.
  - Export from `src/constants/index.js`.
  - _Requirements: 10.2, 10.7_

- [x] 2. Instrument `SQLQueryEngine.executeQuery()` with lifecycle metrics
  - Add `Date.now()` checkpoints before parse, after parse, and after
    execution.
  - Log `metrics.query.lifecycle` with `sessionId`, `statementType`,
    `parseDurationMs`, `executionDurationMs`, `totalDurationMs`,
    `partitionCount`, `rowCount`, `success`.
  - _Requirements: 1.1, 1.3, 1.4, 1.5_

- [x] 3. Instrument `SQLQueryEngine.executeRequest()` with dispatch metrics
  - Wrap the execution-mode switch with timing.
  - Log `metrics.query.dispatch` with `executionMode`, `totalDurationMs`,
    `success`, `sessionId`.
  - _Requirements: 1.2, 1.4, 1.5_

- [x] 4. Instrument `QueryExecutor.executeSelect()` with distributed metrics
  - Log `metrics.select.distributed` after merge completes with
    `partitionCount`, `fanoutTotalLatencyMs`, `fanoutMedianLatencyMs`,
    `mergeDurationMs`, `totalRows`, `stragglerCount`,
    `speculativeExecutions`.
  - _Requirements: 2.1, 2.3, 2.4_

- [x] 5. Instrument `ParallelQueryCoordinator.executeParallel()` with fan-out metrics
  - Log `metrics.fanout.complete` after `metrics.finalize()` with
    `queryId`, `partitionCount`, `totalLatencyMs`, `medianLatencyMs`,
    `maxPartitionLatencyMs`, `totalRows`, `totalBytes`, `stragglerCount`,
    `speculativeExecutions`.
  - _Requirements: 2.2, 2.3, 2.4_

- [x] 6. Instrument `PartitionService.executeQuery()` with SQLite metrics
  - Wrap `stmt.all()` and `stmt.run()` with `Date.now()` timing.
  - Log `metrics.partition.sqlite` with `partitionId`, `operation`,
    `durationMs`, `rowCount`.
  - _Requirements: 3.1, 3.3, 3.4_

- [x] 7. Instrument `PartitionService.proposeWrite()` with Raft propose metrics
  - Wrap the entire propose path with timing.
  - Log `metrics.partition.raft_propose` with `partitionId`, `durationMs`,
    `isLeader`, `forwarded`.
  - _Requirements: 3.2, 3.3_

- [x] 8. Instrument `MessageRouter.deliver()` with transport metrics
  - Wrap the method with `Date.now()` timing.
  - Log `metrics.transport.deliver` with `targetNodeId`, `durationMs`,
    `messageCount`, `queueDepth`.
  - _Requirements: 4.1, 4.3, 4.4_

- [x] 9. Instrument `MessageRouter.deliverViaEndpoint()` with endpoint metrics
  - Wrap the endpoint delivery with timing.
  - Log `metrics.transport.endpoint` with `targetNodeId`, `transportType`,
    `endpointId`, `durationMs`, `acknowledged`.
  - _Requirements: 4.2, 4.3_

- [x] 10. Instrument `CDCIntegrationService` write methods with CDC write metrics
  - In `insertSystemTableRow()` and `updateSystemTableRow()`, separate SQL
    execution time from cache wait time.
  - Log `metrics.cdc.write` with `tableName`, `operation`, `sqlDurationMs`,
    `cacheWaitDurationMs`, `totalDurationMs`.
  - _Requirements: 5.1, 5.2, 5.4, 5.5_

- [x] 11. Instrument `CDCIntegrationService.executeSQL()` with routing metrics
  - Log `metrics.cdc.sql_route` per successful attempt with `durationMs`,
    `attempt`, `maxAttempts`, `bootstrapMode`, `tableName`.
  - _Requirements: 5.3, 5.4_

- [x] 12. Instrument CDC event handlers with propagation metrics
  - In `CDCEventHandler.handleEpochChangeCDC()` and
    `handleNodeStateCDC()`, log `metrics.cdc.propagation` with
    `tableName`, `operation`, `handlerDurationMs`, `eventAgeMs`.
  - In `MessageGroupService.applyCDCEvent()`, log the same tag with
    per-event application duration.
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 13. Instrument `CacheHydrationService` with hydration metrics
  - In `hydrateTable()`, log `metrics.hydration.table` with `tableName`,
    `rowCount`, `durationMs`, `rowsPerSecond`.
  - In `hydrateCache()`, log `metrics.hydration.complete` with
    `tableCount`, `totalDurationMs`, `totalRows`.
  - _Requirements: 7.1, 7.2, 7.3_

- [x] 14. Instrument `CallbackExecutionHost.execute()` with throughput metrics
  - Log `metrics.callback.throughput` with `batchCount`, `totalRows`,
    `totalBytes`, `totalDurationMs`, `rowsPerSecond`,
    `avgBatchDurationMs`, `failedPartitions`.
  - _Requirements: 8.1, 8.2, 8.3_

- [x] 15. Instrument `RebalanceCoordinator` with operation lifecycle metrics
  - On terminal state transitions, log `metrics.rebalance.operation` with
    `operationId`, `entityType`, `finalState`, `totalDurationMs`.
  - _Requirements: 9.1, 9.2, 9.3_

- [x] 16. Add unit tests for metrics log emission
  - For each instrumented method, add a test that spies on `logger.info`,
    executes the method, and asserts the correct metrics tag and field
    structure.
  - Verify duration fields are non-negative integers.
  - Verify no metrics log uses debug level.
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

- [x] 17. Update architecture documentation
  - Add "Performance Metrics Instrumentation" section to
    `.kiro/steering/architecture.md` documenting the `metrics.*` log tag
    namespace and instrumented paths.
  - _Requirements: 10.2_

- [x] 18. Final verification checkpoint
  - Run targeted tests for all instrumented files.
  - Verify no ESLint violations in modified files.
  - Verify no existing tests are broken by the added logging.
  - _Requirements: 10.1, 10.3, 10.4, 10.5, 10.6_

## Notes

- All instrumentation is additive `logger.info()` calls. No behavioral
  changes to existing code paths.
- Metrics logging failures must not propagate to callers.
- Use `Date.now()` for timing (sub-microsecond on V8, sufficient for
  millisecond-resolution metrics).
- Do not log per-row data — only per-operation aggregates.
- Constants must be defined before any instrumentation task begins.
