/**
 * SQL Query Engine module exports.
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 20.1, 20.2, 20.3, 20.10, 26.1, 26.2, 26.3, 26.9, 26.10,
 *               26.11
 */
// @ts-nocheck


export { SQLParser, AST_TYPE, EXPR_TYPE } from './sql-parser.js';
export { SQLQueryEngine } from './sql-query-engine.js';
export { PartitionResolver } from './partition-resolver.js';
export { QueryExecutor } from './query-executor.js';
export { TableCreationService } from './table-creation-service.js';
export { DistributedQueryPlanner } from './distributed/distributed-query-planner.js';
export { DISTRIBUTED_EXECUTION_POLICY, DISTRIBUTED_JOIN_STRATEGY, DISTRIBUTED_PLAN_FIELD, DISTRIBUTED_PLANNER_DEFAULT, DISTRIBUTED_PREDICATE_SHAPE, DISTRIBUTED_QUERY_ERROR_CODE, DISTRIBUTED_QUERY_ERROR_MSG, DISTRIBUTED_ROLE_HINT, DISTRIBUTED_STATEMENT_TYPE } from './distributed/distributed-query-plan-constants.js';
export { ParallelQueryCoordinator, PartitionQueryMetrics, QueryExecutionMetrics } from './distributed/parallel-query-coordinator.js';
export { StragglerDetector, SpeculativeExecutor } from './distributed/straggler-detector.js';
export { StreamingAggregator } from './streaming-aggregator.js';
export { DistributedMergeEngine } from './distributed/distributed-merge-engine.js';
export { DistributedWriteCoordinator } from './distributed/distributed-write-coordinator.js';
export { DistributedTransactionCoordinator, TRANSACTION_STATUS } from './distributed/distributed-transaction-coordinator.js';
export { createSqlRequest, isSqlRequest } from './sql-request.js';
export { InternalSqlAdapter } from './internal-sql-adapter.js';
export { PostgresWireAdapter, PG_SESSION_STATE, PG_WIRE_ERROR_MSG } from './pg/postgres-wire-adapter.js';
export { WasmCallAdapter } from './wasm-call-adapter.js';
export { registerSqlCore, isSqlCoreRegistered, resetSqlCoreGuard, rejectFallbackExecution } from './sql-execution-guard.js';
export { BudgetEnforcer } from './budget-enforcer.js';
export { BudgetLimitError, BUDGET_CATEGORY } from './budget-limit-error.js';
export { LineageTracker } from './lineage-tracker.js';
export { DedupeRegistry, buildDedupeKey } from './dedupe-registry.js';
export { CancellationToken } from './cancellation-token.js';
export { GUARDRAIL_FIELD, GUARDRAIL_ERROR_MSG, GUARDRAIL_LOG_MSG, LINEAGE_SEPARATOR, DEDUPE_RESULT_FIELD, DEDUPE_KEY_SEPARATOR } from './guardrail-constants.js';
/**
 * v0 Runtime API surface.
 *
 * - `runtime.run(userFn, opts?)` — top-level execution
 *   entrypoint that injects an ExecutionContext.
 * - `run` — standalone alias for `runtime.run`.
 * - `ExecutionContext` — distributed context with `call`,
 *   `emit`, `out`, `lookup`, `broadcast`, `useBroadcast`.
 * - Constants: snapshot modes, default session, error
 *   messages, and subsystem identifier.
 *
 * Requirements: 4.1, 13.5
 * @see module:query/runtime-runner
 * @see module:query/execution-context
 * @see module:query/runtime-constants
 */
export { runtime, run } from './runtime-runner.js';
export { ExecutionContext } from './execution-context.js';
export { SNAPSHOT_MODE, DEFAULT_SNAPSHOT_MODE, DEFAULT_RUNTIME_SESSION, RUNTIME_ERROR_MSG, RUNTIME_SUBSYSTEM } from './runtime-constants.js';