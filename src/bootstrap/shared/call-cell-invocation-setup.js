/**
 * Production assembly of the call-cell invocation path (sole owner).
 *
 * Composes the landed pieces against the real runtime at the SQL-runtime
 * handoff boundary — the one place both seed and join own the startup
 * owner, the final SQL engine, the system table cache, and the message
 * router together:
 *
 *   CallBindingRouteResolver (live system table cache)
 *     → createCallCellRoutingSurface (real ServiceDispatcher +
 *       CallCellStatementAdapter over the node's MessageRouter)
 *     → createCallCellBatchExecutor (engine parser, partition resolver,
 *       query executor — the PartitionCallbackDispatcher shapes)
 *     → createCallCellReduceCoordinator (guarded UPDATE grammar over the
 *       call_cell_reduce_slots / call_cell_reduce_results system tables
 *       through the engine's internal SQL path)
 *     → CallCellInvoker, assigned to the ServiceLifecycleCommandOwner so
 *       an authenticated pgwire CALL BINDING stops failing closed
 *       DEPENDENCY_REQUIRED and executes for real.
 *
 * The coordination session id deliberately routes through executeQuery
 * WITHOUT issuingServiceId attribution, mirroring the service-scoped
 * executeInternal (runtime-internal coordination must not distort the
 * data-affinity matrix). No feature flag: when the dependencies exist the
 * path is live, and every absent dependency stays the existing typed
 * fail-closed refusal.
 */

import {TABLES} from '../../constants/index.js';
import {CallBindingRouteResolver} from
  '../../service/call-binding-route-resolver.js';
import {createCallCellBatchExecutor} from
  '../../service/call-cell-batch-executor.js';
import {CallCellInvoker} from '../../service/call-cell-invoker.js';
import {createCallCellRoutingSurface} from
  '../../service/call-cell-routing-surface.js';
import {createCallActivationLeaseOwner} from
  '../../service/call-activation-lease-owner.js';
import {createCallPartitionTopology} from
  '../../service/call-partition-topology.js';
import {
  createCallCellReduceCoordinator,
} from '../../runtime/call-cell-reduce-coordinator.js';

const CALL_CELL_COORDINATION_SESSION = 'call-cell-reduce-coordination';
const CALL_CELL_INVOCATION_DEFAULT = Object.freeze({
  ACTIVATION_LEASE_MS: 60000,
  BATCH_ROW_BOUND: 4096,
  DEADLINE_MS: 30000,
  EMIT_BUDGET: 64,
  NESTED_CALL_BUDGET: 1,
  PARTIAL_LIMIT: 1024,
  RECLAIM_RETENTION_MS: 600000,
  REDUCE_LEASE_MS: 30000,
  SLOT_COUNT: 64,
});

function positiveIntegerOr(value, fallback) {
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

/**
 * Assemble the call-cell invocation path and bind it to the lifecycle
 * command owner. Idempotent per owner: an already-attached invoker (or a
 * test-injected one) is never overwritten.
 *
 * @param {object} options
 * @param {object} options.serviceLifecycleCommandOwner the owner whose
 *   `callCellInvoker` dependency this attachment satisfies
 * @param {object} options.sqlQueryEngine the final runtime SQL engine
 * @param {Function} options.systemTableCacheProvider live cache accessor
 * @param {Function} options.messageRouterProvider live router accessor
 * @param {object} [options.logger]
 * @param {object} [options.tunables] deployment-configured bounds
 *   (deadlineMs, maxAttempts, maxInFlight, maxInFlightPerTarget,
 *   batchRowBound, partialLimit, emitBudget, nestedCallBudget,
 *   reduceLeaseMs, slotCount)
 * @return {object|null} the attached invoker, or null when a dependency
 *   is absent (the owner keeps its typed fail-closed refusal)
 */
function attachCallCellInvoker(options = {}) {
  const owner = options.serviceLifecycleCommandOwner || null;
  const sqlQueryEngine = options.sqlQueryEngine || null;
  const systemTableCacheProvider =
    typeof options.systemTableCacheProvider === 'function' ?
      options.systemTableCacheProvider :
      null;
  const messageRouterProvider =
    typeof options.messageRouterProvider === 'function' ?
      options.messageRouterProvider :
      null;
  if (!owner || !sqlQueryEngine || !systemTableCacheProvider ||
      !messageRouterProvider ||
      typeof sqlQueryEngine.queryExecutor?.resolvePartitionServiceCandidates !==
        'function') {
    return null;
  }
  if (typeof owner.callCellInvoker?.invoke === 'function') {
    return owner.callCellInvoker;
  }
  const tunables = options.tunables || {};

  const routeResolver = new CallBindingRouteResolver({
    systemTableCacheProvider,
  });
  const routingSurface = createCallCellRoutingSurface({
    deadlineMs: positiveIntegerOr(
      tunables.deadlineMs, CALL_CELL_INVOCATION_DEFAULT.DEADLINE_MS),
    logger: options.logger,
    maxAttempts: tunables.maxAttempts,
    maxInFlight: tunables.maxInFlight,
    maxInFlightPerTarget: tunables.maxInFlightPerTarget,
    messageRouterProvider,
    routeResolver,
  });
  const batchExecutor = createCallCellBatchExecutor({
    partitionResolver: sqlQueryEngine.partitionResolver,
    partitionsProvider: (tableName) =>
      sqlQueryEngine.getTablePartitions(tableName),
    queryExecutor: sqlQueryEngine.queryExecutor,
    sqlParser: {parse: (sql) => sqlQueryEngine.parse(sql)},
  });
  const reduceCoordinator = createCallCellReduceCoordinator({
    coordinationTable: TABLES.CALL_CELL_REDUCE_SLOTS,
    executeInternal: (sql, params) => sqlQueryEngine.executeQuery(
      sql,
      params,
      {sessionId: CALL_CELL_COORDINATION_SESSION},
    ),
    leaseMs: positiveIntegerOr(
      tunables.reduceLeaseMs,
      CALL_CELL_INVOCATION_DEFAULT.REDUCE_LEASE_MS),
    nowProvider: () => Date.now(),
    resultTable: TABLES.CALL_CELL_REDUCE_RESULTS,
    slotCount: positiveIntegerOr(
      tunables.slotCount, CALL_CELL_INVOCATION_DEFAULT.SLOT_COUNT),
  });
  const activationLeases = createCallActivationLeaseOwner({
    executeInternal: (sql, params) => sqlQueryEngine.executeQuery(
      sql,
      params,
      {sessionId: CALL_CELL_COORDINATION_SESSION},
    ),
    leaseMs: positiveIntegerOr(
      tunables.activationLeaseMs,
      CALL_CELL_INVOCATION_DEFAULT.ACTIVATION_LEASE_MS),
    nowProvider: () => Date.now(),
  });
  const invoker = new CallCellInvoker({
    activationLeases,
    activationRetryIntervalMs: tunables.activationRetryIntervalMs,
    activationWaitMs: tunables.activationWaitMs,
    batchExecutor,
    batchRowBound: positiveIntegerOr(
      tunables.batchRowBound,
      CALL_CELL_INVOCATION_DEFAULT.BATCH_ROW_BOUND),
    partitionTopology: createCallPartitionTopology({sqlQueryEngine}),
    emitBudget: positiveIntegerOr(
      tunables.emitBudget, CALL_CELL_INVOCATION_DEFAULT.EMIT_BUDGET),
    nestedCallBudget: positiveIntegerOr(
      tunables.nestedCallBudget,
      CALL_CELL_INVOCATION_DEFAULT.NESTED_CALL_BUDGET),
    partialLimit: positiveIntegerOr(
      tunables.partialLimit, CALL_CELL_INVOCATION_DEFAULT.PARTIAL_LIMIT),
    reclaimRetentionMs: positiveIntegerOr(
      tunables.reclaimRetentionMs,
      CALL_CELL_INVOCATION_DEFAULT.RECLAIM_RETENTION_MS),
    reduceCoordinator,
    routeResolver,
    statementAdapter: routingSurface.statementAdapter,
  });
  owner.callCellInvoker = invoker;
  return invoker;
}

export {
  CALL_CELL_COORDINATION_SESSION,
  CALL_CELL_INVOCATION_DEFAULT,
  attachCallCellInvoker,
};
