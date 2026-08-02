/**
 * Call-cell invocation owner (sole orchestrator).
 *
 * Drives one authenticated `CALL BINDING` invocation end to end across the
 * existing owners, per the sealed contract
 * (architecture/minimal-deployment-surface.md):
 *   1. resolve the durable call Binding to a ready route (statement required),
 *   2. execute the Binding-declared partition-local statement into typed
 *      per-partition batches (engine narrows/groups before the boundary),
 *   3. invoke the artifact's `run` export per shard through the
 *      ServiceDispatcher → MessageRouter → runtime invocation owner path,
 *   4. publish each shard's EMITTED partials under that shard's reduce
 *      lease slot (seeded rows + acquired lease, then the guarded UPDATE),
 *   5. invoke `reduce` over a complete fresh disjoint partial set on a
 *      leased replica and publish exactly one atomically visible final
 *      snapshot.
 *
 * Legacy `{kind, name}` call bindings (no declared statement) fail closed
 * not-invocable at the resolver. No new invocation mechanism is introduced
 * outside the existing owners.
 */

import {
  CALL_CELL_ROUTE_ERROR_CODE,
  createCallInvocationIdentity,
  createCallRoutingFailure,
  normalizeCallComponentResult,
  normalizeEmittedPartialEntries,
} from './call-cell-routing-contract.js';

const CALL_INVOKER_MESSAGE = Object.freeze({
  EMPTY_BATCH_SET:
    'Call Cell declared statement resolved to zero shard batches',
});

const CALL_INVOKER_ARGUMENT_MESSAGE = Object.freeze({
  ROUTE_RESOLVER_REQUIRED:
    'CallCellInvoker requires a routeResolver with resolve(request)',
  BATCH_EXECUTOR_REQUIRED:
    'CallCellInvoker requires a batchExecutor with executeBatches(req)',
  STATEMENT_ADAPTER_REQUIRED:
    'CallCellInvoker requires a statementAdapter with invoke(req)',
  REDUCE_COORDINATOR_REQUIRED:
    'CallCellInvoker requires a reduceCoordinator with seedInvocation, ' +
    'acquireReduceLease, publishPartial, resolveCompletePartialSet, and ' +
    'publishFinalSnapshot',
});

// Bounded-emit defaults for the call-context host imports. The Binding
// schema does not yet declare emit budgets, so the invocation owner owns
// the deployment-configured bound and threads it over the wire
// (envelope invocation.callCell → receiver → worker call-context host).
const CALL_INVOKER_BUDGET_DEFAULT = Object.freeze({
  EMIT_BUDGET: 64,
  NESTED_CALL_BUDGET: 1,
});

const RESOLVE_PROBE_PREFIX = 'resolve-';
const RUN_EXPORT = 'run';
const REDUCE_EXPORT = 'reduce';
const REDUCE_COORDINATOR_REQUIRED_METHODS = Object.freeze([
  'seedInvocation',
  'acquireReduceLease',
  'publishPartial',
  'resolveCompletePartialSet',
  'publishFinalSnapshot',
]);

function requiredCoordinatorMethods(reduceCoordinator) {
  return REDUCE_COORDINATOR_REQUIRED_METHODS.every(
    (method) => typeof reduceCoordinator?.[method] === 'function');
}

class CallCellInvoker {
  constructor(options = {}) {
    if (typeof options.routeResolver?.resolve !== 'function') {
      throw new TypeError(CALL_INVOKER_ARGUMENT_MESSAGE.ROUTE_RESOLVER_REQUIRED);
    }
    if (typeof options.batchExecutor?.executeBatches !== 'function') {
      throw new TypeError(
        CALL_INVOKER_ARGUMENT_MESSAGE.BATCH_EXECUTOR_REQUIRED);
    }
    if (typeof options.statementAdapter?.invoke !== 'function') {
      throw new TypeError(
        CALL_INVOKER_ARGUMENT_MESSAGE.STATEMENT_ADAPTER_REQUIRED);
    }
    if (!requiredCoordinatorMethods(options.reduceCoordinator)) {
      throw new TypeError(
        CALL_INVOKER_ARGUMENT_MESSAGE.REDUCE_COORDINATOR_REQUIRED);
    }
    this._routeResolver = options.routeResolver;
    this._batchExecutor = options.batchExecutor;
    this._statementAdapter = options.statementAdapter;
    this._reduceCoordinator = options.reduceCoordinator;
    this._batchRowBound = options.batchRowBound;
    this._partialLimit = options.partialLimit;
    this._callCellBudgets = Object.freeze({
      emitBudget: Number.isSafeInteger(options.emitBudget) &&
        options.emitBudget >= 0 ?
        options.emitBudget :
        CALL_INVOKER_BUDGET_DEFAULT.EMIT_BUDGET,
      nestedCallBudget: Number.isSafeInteger(options.nestedCallBudget) &&
        options.nestedCallBudget >= 0 ?
        options.nestedCallBudget :
        CALL_INVOKER_BUDGET_DEFAULT.NESTED_CALL_BUDGET,
    });
  }

  /**
   * @param {object} request
   * @param {string} request.name call Binding registration name
   * @param {string} [request.argumentsJson] transient arguments JSON object
   * @param {object} request.securityContext frozen {tenantId,principal,roles}
   * @param {number} [request.deadlineMs] absolute epoch-ms deadline
   * @return {Promise<string>} the final reduced result JSON string
   */
  async invoke({name, argumentsJson, securityContext, deadlineMs}) {
    const resolution = this._routeResolver.resolve({
      invocationId: `${RESOLVE_PROBE_PREFIX}${name}`,
      name,
      securityContext,
    });
    const batches = await this._batchExecutor.executeBatches({
      statement: resolution.statement,
      batchRowBound: this._batchRowBound,
    });
    if (batches.length === 0) {
      throw createCallRoutingFailure(
        CALL_CELL_ROUTE_ERROR_CODE.ROUTE_UNAVAILABLE,
        CALL_INVOKER_MESSAGE.EMPTY_BATCH_SET,
      );
    }

    // Content-fresh identity: concurrent invocations of the same Binding
    // must never share coordination rows, so the id is a routing-contract
    // UUID identity, not a timestamp.
    const {invocationId} = createCallInvocationIdentity();
    const slotIds = batches.map((_, index) => index + 1);
    await this._reduceCoordinator.seedInvocation(invocationId, slotIds);

    for (const [slotIndex, shard] of batches.entries()) {
      const slotId = slotIds[slotIndex];
      const delivery = await this._statementAdapter.invoke({
        name,
        argumentsJson,
        securityContext,
        deadlineMs,
        batch: shard.batch,
        callCell: this._callCellBudgets,
        partitionId: shard.partitionId,
        exportName: RUN_EXPORT,
        slotId,
        invocationId,
      });
      // The published slot partial is the shard's EMITTED partial set (the
      // bounded call-context emit log), normalized fail-closed into the
      // coordinator's {groupKey, aggValue} entries. The run export's own
      // return value is component bookkeeping and is not coordinated.
      const entries = normalizeEmittedPartialEntries(delivery.partials);
      const replicaId = delivery.replicaId ?? resolution.replicaId;
      await this._reduceCoordinator.acquireReduceLease(
        invocationId,
        replicaId,
        slotId,
      );
      await this._reduceCoordinator.publishPartial(
        invocationId,
        slotId,
        replicaId,
        JSON.stringify(entries),
        Date.now(),
      );
    }

    // resolveCompletePartialSet fails closed (typed REDUCE_INCOMPLETE) unless
    // the partial set is complete, fresh, bounded, and disjoint.
    const {partials, witness} =
      await this._reduceCoordinator.resolveCompletePartialSet(
        invocationId,
        slotIds,
        this._partialLimit,
      );

    const reduceDelivery = await this._statementAdapter.invoke({
      name,
      argumentsJson,
      securityContext,
      deadlineMs,
      callCell: this._callCellBudgets,
      partials: partials.map(([groupKey, aggValue]) =>
        [String(groupKey), JSON.stringify(aggValue)]),
      exportName: REDUCE_EXPORT,
      invocationId,
    });
    const resultJson = normalizeCallComponentResult(
      reduceDelivery.componentResult);
    await this._reduceCoordinator.publishFinalSnapshot(
      invocationId,
      resultJson,
      witness,
    );
    return resultJson;
  }
}

export {CallCellInvoker};
