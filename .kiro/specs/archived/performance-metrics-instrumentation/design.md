# Design Document: Performance Metrics Instrumentation

## Overview

This design adds structured metrics logging to the system's hot paths for
throughput and latency observability on large datasets.

Current state:
- `ParallelQueryCoordinator` tracks per-partition latency but only returns
  it in result objects — never logged.
- `PrimitiveTelemetry` tracks distributed primitive usage per query but is
  scoped to the callback/stage runtime, not the broader query lifecycle.
- `BudgetEnforcer` tracks resource consumption but for enforcement, not
  observability.
- `StragglerDetector` computes median latency for speculative execution
  decisions but does not emit metrics.
- CDC, transport, partition SQLite, cache hydration, and rebalance paths
  have no latency instrumentation.

Target state:
- Every hot path emits a single `metrics.*` structured log per operation
  with latency breakdown, throughput indicators, and resource context.
- Metrics are grep-friendly, parseable, and ready for external monitoring
  pipeline ingestion.
- Zero new dependencies, caches, or state stores.

## Goals

- Instrument 10 critical code paths with structured metrics logs.
- Provide latency breakdown (parse, execute, merge, transport, Raft, CDC).
- Provide throughput indicators (rows/sec, bytes, message counts).
- Follow existing logging patterns and constants conventions.
- Keep instrumentation minimal — one log per operation, not per row.

## Non-Goals

- Building a metrics collection/aggregation framework.
- Adding Prometheus/StatsD/OpenTelemetry exporters.
- Creating dashboards or alerting rules.
- Modifying existing debug-level logging.
- Adding metrics to non-hot paths (admin CLI, test infrastructure).

## Ownership

All metrics logging is injected into existing owner components. No new
owner components are created. Each instrumented method owns its own
metrics log emission.

| Instrumentation Point | Owner Component | Log Tag |
| --- | --- | --- |
| Query lifecycle | `SQLQueryEngine` | `metrics.query.lifecycle` |
| Execution mode dispatch | `SQLQueryEngine` | `metrics.query.dispatch` |
| Distributed SELECT | `QueryExecutor` | `metrics.select.distributed` |
| Fan-out coordination | `ParallelQueryCoordinator` | `metrics.fanout.complete` |
| Partition SQLite | `PartitionService` | `metrics.partition.sqlite` |
| Raft propose | `PartitionService` | `metrics.partition.raft_propose` |
| Transport delivery | `MessageRouter` | `metrics.transport.deliver` |
| Transport endpoint | `MessageRouter` | `metrics.transport.endpoint` |
| CDC write | `CDCIntegrationService` | `metrics.cdc.write` |
| CDC SQL routing | `CDCIntegrationService` | `metrics.cdc.sql_route` |
| CDC propagation | `CDCEventHandler` / `MessageGroupService` | `metrics.cdc.propagation` |
| Cache hydration (table) | `CacheHydrationService` | `metrics.hydration.table` |
| Cache hydration (total) | `CacheHydrationService` | `metrics.hydration.complete` |
| Callback throughput | `CallbackExecutionHost` | `metrics.callback.throughput` |
| Rebalance operation | `RebalanceCoordinator` | `metrics.rebalance.operation` |

## Architecture

No new components. Metrics logging is injected inline at method boundaries.

```
┌─────────────────────────────────────────────────────────────────┐
│                     Existing Hot Path                            │
│                                                                  │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐  │
│  │ SQLQuery │───►│ Query    │───►│ Parallel │───►│ Partition│  │
│  │ Engine   │    │ Executor │    │ Query    │    │ Service  │  │
│  │          │    │          │    │ Coord    │    │ (SQLite) │  │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘  │
│       │               │               │               │         │
│       ▼               ▼               ▼               ▼         │
│  metrics.query   metrics.select  metrics.fanout  metrics.       │
│  .lifecycle      .distributed    .complete       partition.     │
│  metrics.query                                   sqlite         │
│  .dispatch                                       metrics.       │
│                                                  partition.     │
│                                                  raft_propose   │
│                                                                  │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐  │
│  │ Message  │    │ CDC      │    │ CDC Event│    │ Cache    │  │
│  │ Router   │    │ Integr.  │    │ Handler  │    │ Hydration│  │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘  │
│       │               │               │               │         │
│       ▼               ▼               ▼               ▼         │
│  metrics.        metrics.cdc     metrics.cdc     metrics.       │
│  transport.      .write          .propagation    hydration.     │
│  deliver         metrics.cdc                     table          │
│  metrics.        .sql_route                      metrics.       │
│  transport.                                      hydration.     │
│  endpoint                                        complete       │
│                                                                  │
│  ┌──────────┐    ┌──────────┐                                   │
│  │ Callback │    │ Rebalance│                                   │
│  │ Exec Host│    │ Coord    │                                   │
│  └──────────┘    └──────────┘                                   │
│       │               │                                          │
│       ▼               ▼                                          │
│  metrics.        metrics.                                        │
│  callback.       rebalance.                                      │
│  throughput      operation                                       │
└─────────────────────────────────────────────────────────────────┘
                         │
                         ▼
                  LoggingService
                  (existing infra)
```

## Instrumentation Details

### 1. SQL Query Engine Lifecycle (`metrics.query.lifecycle`)

File: `src/query/sql-query-engine.js`
Method: `executeQuery()`

Capture `Date.now()` before parse, after parse, and after execution.
Log once before the final return.

```javascript
this.logger.info(METRICS_LOG_TAG.QUERY_LIFECYCLE, {
  sessionId,
  statementType: ast.type,
  parseDurationMs: parseEndMs - queryStartMs,
  executionDurationMs: queryEndMs - parseEndMs,
  totalDurationMs: queryEndMs - queryStartMs,
  partitionCount: result?.partitions?.length ?? 0,
  rowCount: result?.count ?? result?.changes ?? 0,
  success: result?.success ?? false,
});
```

### 2. Execution Mode Dispatch (`metrics.query.dispatch`)

File: `src/query/sql-query-engine.js`
Method: `executeRequest()`

Wrap the execution mode switch with timing.

```javascript
this.logger.info(METRICS_LOG_TAG.QUERY_DISPATCH, {
  executionMode,
  totalDurationMs,
  success: result?.success ?? false,
  sessionId,
});
```

### 3. Distributed SELECT (`metrics.select.distributed`)

File: `src/query/query-executor.js`
Method: `executeSelect()`

Log after merge completes. Fan-out metrics are already captured via
`getLastCoordinatorMetrics()` — just need to log them.

```javascript
this.logger.info(METRICS_LOG_TAG.SELECT_DISTRIBUTED, {
  partitionCount: partitionIds.length,
  fanoutTotalLatencyMs: fanoutMetrics?.totalLatencyMs,
  fanoutMedianLatencyMs: fanoutMetrics?.medianLatencyMs,
  mergeDurationMs,
  totalRows: aggregated.rows.length,
  stragglerCount: fanoutMetrics?.stragglers ?? 0,
  speculativeExecutions: fanoutMetrics?.speculativeExecutions ?? 0,
});
```

### 4. Fan-Out Coordination (`metrics.fanout.complete`)

File: `src/query/parallel-query-coordinator.js`
Method: `executeParallel()`

Log the formatted metrics that are already computed but never logged.

```javascript
this.logger.info(METRICS_LOG_TAG.FANOUT_COMPLETE, {
  queryId: formatted.queryId,
  partitionCount: formatted.partitionCount,
  totalLatencyMs: formatted.totalLatencyMs,
  medianLatencyMs: formatted.medianLatencyMs,
  maxPartitionLatencyMs,
  totalRows: formatted.totalRows,
  totalBytes: formatted.totalBytes,
  stragglerCount: formatted.stragglers,
  speculativeExecutions: formatted.speculativeExecutions,
});
```

### 5. Partition SQLite (`metrics.partition.sqlite`)

File: `src/partition/partition-service.js`
Method: `executeQuery()`

Wrap `stmt.all()` / `stmt.run()` with `Date.now()` timing.

```javascript
this.logger.info(METRICS_LOG_TAG.PARTITION_SQLITE, {
  partitionId: this.partitionId,
  operation: isSelect ? 'select' : 'write',
  durationMs,
  rowCount: isSelect ? rows.length : info?.changes,
});
```

### 6. Raft Propose (`metrics.partition.raft_propose`)

File: `src/partition/partition-service.js`
Method: `proposeWrite()`

Wrap the entire propose path (leader apply or follower forward).

```javascript
this.logger.info(METRICS_LOG_TAG.PARTITION_RAFT_PROPOSE, {
  partitionId: this.partitionId,
  durationMs,
  isLeader: this.role === RaftRole.LEADER,
  forwarded: this.role !== RaftRole.LEADER,
});
```

### 7. Transport Delivery (`metrics.transport.deliver`)

File: `src/transport/message-router.js`
Method: `deliver()`

Wrap the entire method with timing. Include queue depth.

```javascript
this.logger.info(METRICS_LOG_TAG.TRANSPORT_DELIVER, {
  targetNodeId,
  durationMs,
  messageCount: this.messageCount,
  queueDepth: this.outboundQueues.get(targetNodeId)?.pending ?? 0,
});
```

### 8. Transport Endpoint (`metrics.transport.endpoint`)

File: `src/transport/message-router.js`
Method: `deliverViaEndpoint()`

Log per-endpoint delivery latency and transport type.

```javascript
this.logger.info(METRICS_LOG_TAG.TRANSPORT_ENDPOINT, {
  targetNodeId,
  transportType,
  endpointId: endpoint[COLUMN.ENDPOINT_ID],
  durationMs,
  acknowledged: result.acknowledged,
});
```

### 9. CDC Write (`metrics.cdc.write`)

File: `src/cdc/cdc-integration-service.js`
Methods: `insertSystemTableRow()`, `updateSystemTableRow()`

Separate SQL execution time from cache wait time.

```javascript
this.logger.info(METRICS_LOG_TAG.CDC_WRITE, {
  tableName,
  operation: 'insert',
  sqlDurationMs,
  cacheWaitDurationMs,
  totalDurationMs,
});
```

### 10. CDC SQL Routing (`metrics.cdc.sql_route`)

File: `src/cdc/cdc-integration-service.js`
Method: `executeSQL()`

Log per-attempt timing and retry context.

```javascript
this.logger.info(METRICS_LOG_TAG.CDC_SQL_ROUTE, {
  durationMs,
  attempt,
  maxAttempts,
  bootstrapMode: this.bootstrapMode,
  tableName,
});
```

### 11. CDC Propagation (`metrics.cdc.propagation`)

File: `src/cdc/cdc-event-handler.js`
Methods: `handleEpochChangeCDC()`, `handleNodeStateCDC()`

File: `src/message-group/message-group-service.js`
Method: `applyCDCEvent()`

Log handler duration and event age when timestamp is available.

```javascript
this.logger.info(METRICS_LOG_TAG.CDC_PROPAGATION, {
  tableName: cdcEvent.tableName,
  operation: cdcEvent.operation,
  handlerDurationMs,
  eventAgeMs: cdcEvent.timestamp ?
    Date.now() - cdcEvent.timestamp : undefined,
});
```

### 12. Cache Hydration (`metrics.hydration.table`, `metrics.hydration.complete`)

File: `src/cache/cache-hydration-service.js`
Methods: `hydrateTable()`, `hydrateCache()`

```javascript
// Per table
this.logger.info(METRICS_LOG_TAG.HYDRATION_TABLE, {
  tableName,
  rowCount,
  durationMs,
  rowsPerSecond: durationMs > 0 ?
    Math.round(rowCount / (durationMs / 1000)) : 0,
});

// Total
this.logger.info(METRICS_LOG_TAG.HYDRATION_COMPLETE, {
  tableCount: SYSTEM_TABLES_TO_HYDRATE.length,
  totalDurationMs,
  totalRows,
});
```

### 13. Callback Throughput (`metrics.callback.throughput`)

File: `src/query/callback-execution-host.js`
Method: `execute()`

Already tracks `totalRows`, `totalBytes`, `totalDurationMs`. Add
throughput derivation and log.

```javascript
this.logger.info(METRICS_LOG_TAG.CALLBACK_THROUGHPUT, {
  batchCount: batches.length,
  totalRows,
  totalBytes,
  totalDurationMs,
  rowsPerSecond: totalDurationMs > 0 ?
    Math.round(totalRows / (totalDurationMs / 1000)) : 0,
  avgBatchDurationMs: batches.length > 0 ?
    Math.round(totalDurationMs / batches.length) : 0,
  failedPartitions: stageResult.failedPartitions,
});
```

### 14. Rebalance Operation (`metrics.rebalance.operation`)

File: `src/rebalancer/rebalance-coordinator.js`
Terminal state transitions.

```javascript
this.logger.info(METRICS_LOG_TAG.REBALANCE_OPERATION, {
  operationId,
  entityType: operation.entityType,
  finalState: operation.status,
  totalDurationMs: Date.now() - operation.createdAt,
});
```

## Constants

All log tags and field names are defined in a new constants file:
`src/constants/metrics-constants.js`

```javascript
export const METRICS_LOG_TAG = Object.freeze({
  QUERY_LIFECYCLE: 'metrics.query.lifecycle',
  QUERY_DISPATCH: 'metrics.query.dispatch',
  SELECT_DISTRIBUTED: 'metrics.select.distributed',
  FANOUT_COMPLETE: 'metrics.fanout.complete',
  PARTITION_SQLITE: 'metrics.partition.sqlite',
  PARTITION_RAFT_PROPOSE: 'metrics.partition.raft_propose',
  TRANSPORT_DELIVER: 'metrics.transport.deliver',
  TRANSPORT_ENDPOINT: 'metrics.transport.endpoint',
  CDC_WRITE: 'metrics.cdc.write',
  CDC_SQL_ROUTE: 'metrics.cdc.sql_route',
  CDC_PROPAGATION: 'metrics.cdc.propagation',
  HYDRATION_TABLE: 'metrics.hydration.table',
  HYDRATION_COMPLETE: 'metrics.hydration.complete',
  CALLBACK_THROUGHPUT: 'metrics.callback.throughput',
  REBALANCE_OPERATION: 'metrics.rebalance.operation',
});
```

Exported from `src/constants/index.js` alongside existing constant modules.

## Performance Impact

- Each instrumentation point adds one `Date.now()` call at method entry
  and one at method exit. `Date.now()` is sub-microsecond on modern V8.
- One `logger.info()` call per operation. The logging service already
  handles buffering and async I/O.
- No additional allocations beyond the structured log object.
- No new timers, intervals, or background work.

Estimated overhead: < 0.1ms per instrumented operation.

## Failure Handling

- If `LoggingService` is not initialized, the fallback `console` logger
  is used (existing pattern in all instrumented components).
- Metrics logging failures SHALL NOT propagate to the caller. If a
  metrics log throws (e.g., logger unavailable), the error is caught
  and swallowed at the instrumentation site.
- No metrics log SHALL alter control flow or return values.

## Testing Strategy

### Unit Tests

For each instrumented method:
1. Spy on `logger.info` calls.
2. Execute the method with minimal setup.
3. Assert the metrics log was emitted with the correct tag.
4. Assert required fields are present and have correct types.
5. Assert duration fields are non-negative integers.

### Integration Tests

No dedicated integration tests. Metrics logs are verified as side effects
in existing integration test runs by checking log output.

## Rollout

Single-phase rollout. All instrumentation points are additive `logger.info()`
calls with no behavioral changes. No feature flags needed.

## Documentation Impact

Update `.kiro/steering/architecture.md` to add a "Performance Metrics" section
documenting the `metrics.*` log tag namespace and the instrumented paths.
