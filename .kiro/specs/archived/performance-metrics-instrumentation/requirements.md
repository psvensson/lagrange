# Requirements Document

## Introduction

The system currently has limited observability into throughput and latency
across its critical data paths. While some components track internal metrics
(e.g., `PrimitiveTelemetry` for distributed primitives,
`ParallelQueryCoordinator` for fan-out latency), these metrics are either
returned in result objects without being logged, or are scoped too narrowly
to reveal end-to-end bottlenecks.

For large dataset workloads — multi-partition SELECTs, bulk INSERTs, CDC
propagation storms, callback batch processing — operators have no structured
way to identify where time is spent. This spec defines a metrics logging
layer that instruments the hot paths with structured, grep-friendly log
entries covering latency, throughput, and resource utilization.

All instrumentation uses the existing `LoggingService` infrastructure. No
new metrics collection framework, no new caches, no new dependencies.

## Glossary

- **Metrics Log**: A structured `logger.info()` call with a `metrics.*`
  namespaced tag, emitting latency, throughput, or resource data.
- **Hot Path**: A code path exercised on every query, write, CDC event, or
  transport delivery — the paths that dominate wall time under load.
- **Fan-Out Latency**: Time from scatter-gather dispatch to last partition
  response in a multi-partition query.
- **Merge Duration**: Time spent aggregating results from multiple partitions
  into a single result set.
- **Propagation Latency**: Time from CDC event creation at a partition leader
  to cache application on a receiving node.
- **Raft Propose Latency**: Time from write proposal to Raft commit
  acknowledgment on a partition leader.

## Requirements

### Requirement 1: SQL Query Engine Lifecycle Metrics

**User Story:** As an operator, I want to see end-to-end query latency broken
down by parse and execution phases, so I can identify whether bottlenecks are
in SQL parsing or distributed execution.

#### Acceptance Criteria

1. `SQLQueryEngine.executeQuery()` SHALL log total wall time, parse duration,
   and execution duration for every query.
2. `SQLQueryEngine.executeRequest()` SHALL log execution mode, total duration,
   and success/failure status.
3. Metrics SHALL include statement type, partition count, and row count.
4. Metrics SHALL use the `metrics.query.lifecycle` log tag.
5. Logging SHALL use `logger.info()` level to ensure capture under normal
   log configuration.

### Requirement 2: Distributed SELECT Fan-Out and Merge Metrics

**User Story:** As an operator, I want to see per-query fan-out latency
distribution and merge duration, so I can identify straggler partitions and
aggregation bottlenecks on large datasets.

#### Acceptance Criteria

1. `QueryExecutor.executeSelect()` SHALL log fan-out total latency, median
   latency, merge duration, total rows, and straggler count.
2. `ParallelQueryCoordinator.executeParallel()` SHALL log the latency
   distribution summary including p95, max partition latency, total bytes,
   and speculative execution count.
3. Metrics SHALL use `metrics.select.distributed` and
   `metrics.fanout.complete` log tags respectively.
4. Per-partition latency data SHALL be summarized (not per-row) to avoid
   log volume explosion.

### Requirement 3: Partition SQLite Execution Metrics

**User Story:** As an operator, I want to see per-partition SQLite execution
latency and row counts, so I can identify slow partitions and estimate
storage-layer throughput.

#### Acceptance Criteria

1. `PartitionService.executeQuery()` SHALL log SQLite statement execution
   duration, operation type (select/write), and row count.
2. `PartitionService.proposeWrite()` SHALL log Raft propose duration,
   whether the write was leader-local or forwarded, and partition ID.
3. Metrics SHALL use `metrics.partition.sqlite` and
   `metrics.partition.raft_propose` log tags.
4. Metrics SHALL NOT log SQL statement content beyond what existing debug
   logs already capture.

### Requirement 4: Message Router Transport Metrics

**User Story:** As an operator, I want to see message delivery latency and
queue depth per node, so I can identify transport bottlenecks and
backpressure under high fan-out.

#### Acceptance Criteria

1. `MessageRouter.deliver()` SHALL log delivery duration, target node,
   and outbound queue depth.
2. `MessageRouter.deliverViaEndpoint()` SHALL log per-endpoint delivery
   duration and transport type used.
3. Metrics SHALL use `metrics.transport.deliver` and
   `metrics.transport.endpoint` log tags.
4. Metrics SHALL include cumulative message count for throughput derivation.

### Requirement 5: CDC Write Path Metrics

**User Story:** As an operator, I want to see system table write latency
broken down by SQL routing time and cache confirmation wait time, so I can
identify CDC write bottlenecks during bulk operations.

#### Acceptance Criteria

1. `CDCIntegrationService.insertSystemTableRow()` SHALL log SQL execution
   duration, cache wait duration, and total write duration.
2. `CDCIntegrationService.updateSystemTableRow()` SHALL log the same
   breakdown.
3. `CDCIntegrationService.executeSQL()` SHALL log per-attempt duration and
   retry count for transient failures.
4. Metrics SHALL use `metrics.cdc.write` and `metrics.cdc.sql_route` log
   tags.
5. Metrics SHALL include table name and operation type.

### Requirement 6: CDC Event Propagation Metrics

**User Story:** As an operator, I want to see CDC event propagation latency
from origin to handler execution, so I can identify replication lag under
load.

#### Acceptance Criteria

1. CDC event handlers SHALL log handler execution duration and event age
   (delta between event timestamp and handler start).
2. `MessageGroupService.applyCDCEvent()` SHALL log per-event application
   duration and table name.
3. Metrics SHALL use `metrics.cdc.propagation` log tag.
4. Event age SHALL be computed only when the event carries a timestamp;
   omitted otherwise.

### Requirement 7: Cache Hydration Metrics

**User Story:** As an operator, I want to see per-table hydration duration
and throughput during bootstrap and join, so I can identify slow tables and
estimate startup time for large clusters.

#### Acceptance Criteria

1. `CacheHydrationService.hydrateTable()` SHALL log per-table duration,
   row count, and rows-per-second throughput.
2. `CacheHydrationService.hydrateCache()` SHALL log total hydration
   duration and table count.
3. Metrics SHALL use `metrics.hydration.table` and
   `metrics.hydration.complete` log tags.

### Requirement 8: Callback Execution Throughput Metrics

**User Story:** As an operator, I want to see batch processing throughput
for partition callbacks, so I can identify slow callback paths and estimate
distributed compute capacity.

#### Acceptance Criteria

1. `CallbackExecutionHost.execute()` SHALL log total rows, total bytes,
   total duration, rows-per-second throughput, average batch duration,
   and failed partition count.
2. Metrics SHALL use `metrics.callback.throughput` log tag.
3. Metrics SHALL be emitted once per `execute()` call (aggregate), not
   per batch.

### Requirement 9: Rebalance Operation Lifecycle Metrics

**User Story:** As an operator, I want to see per-operation rebalance
duration and state transition counts, so I can identify slow operations
and estimate cluster convergence time under churn.

#### Acceptance Criteria

1. `RebalanceCoordinator` SHALL log total operation duration, final state,
   entity type, and state transition count when an operation reaches a
   terminal state.
2. Metrics SHALL use `metrics.rebalance.operation` log tag.
3. Metrics SHALL include operation ID and entity type for correlation.

### Requirement 10: Metrics Logging Standards

**User Story:** As a maintainer, I want all metrics logs to follow a
consistent format, so they can be parsed, filtered, and piped to monitoring
systems uniformly.

#### Acceptance Criteria

1. All metrics logs SHALL use `logger.info()` level.
2. All metrics log tags SHALL use the `metrics.` prefix namespace.
3. All metrics logs SHALL use structured objects (not string interpolation).
4. Duration fields SHALL use the `Ms` suffix and integer milliseconds.
5. Throughput fields SHALL use explicit units (e.g., `rowsPerSecond`).
6. No metrics log SHALL introduce new dependencies, caches, or state
   outside the instrumented method's existing scope.
7. Metrics constants (log tags, field names) SHALL be defined in
   dedicated constants files following existing project conventions.

### Requirement 11: Verification Coverage

**User Story:** As a maintainer, I want tests confirming metrics logs are
emitted at the right points with the right structure, so instrumentation
regressions are caught.

#### Acceptance Criteria

1. Unit tests SHALL verify that metrics logs are emitted with expected
   tags and fields for each instrumented method.
2. Tests SHALL use logger spies/mocks to capture log calls without
   requiring real infrastructure.
3. Tests SHALL verify that timing fields are non-negative numbers.
4. Tests SHALL verify that no metrics log is emitted at debug level.
5. Tests SHALL complete within the 2-second unit test time limit.
