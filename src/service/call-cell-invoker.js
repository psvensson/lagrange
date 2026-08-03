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
  CALL_CELL_ROUTE_CLASSIFICATION,
  CALL_CELL_ROUTE_ERROR_CODE,
  createCallInvocationIdentity,
  createCallReduceInvocationId,
  createCallRoutingFailure,
  createCallSlotInvocationId,
  normalizeCallComponentResult,
  normalizeEmittedPartialEntries,
} from './call-cell-routing-contract.js';

const CALL_INVOKER_MESSAGE = Object.freeze({
  EMPTY_BATCH_SET:
    'Call Cell declared statement resolved to zero shard batches',
  REDUCE_LEASE_HOLDER_MOVED:
    'Call Cell reduce executed on a replica that does not hold the ' +
    'reduce lease',
});

const CALL_INVOKER_ARGUMENT_MESSAGE = Object.freeze({
  ROUTE_RESOLVER_REQUIRED:
    'CallCellInvoker requires a routeResolver with resolve(request)',
  BATCH_EXECUTOR_REQUIRED:
    'CallCellInvoker requires a batchExecutor with executeBatches(req)',
  STATEMENT_ADAPTER_REQUIRED:
    'CallCellInvoker requires a statementAdapter with invoke(req)',
  PARTITION_TOPOLOGY_REQUIRED:
    'CallCellInvoker requires a partitionTopology with ' +
    'resolveShardHost(tableName, partitionId)',
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
// Bounded wait for a lease-driven activation to produce a ready Cell on
// the shard host node: retry the host-restricted dispatch until the
// planner's replica turns ready or the window lapses (then the typed
// HOST_CELL_UNAVAILABLE refusal propagates, retryable by the caller).
const CALL_INVOKER_ACTIVATION_DEFAULT = Object.freeze({
  RETRY_INTERVAL_MS: 250,
  WAIT_MS: 15000,
});

function sleep(delayMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

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
    if (typeof options.partitionTopology?.resolveShardHost !== 'function') {
      throw new TypeError(
        CALL_INVOKER_ARGUMENT_MESSAGE.PARTITION_TOPOLOGY_REQUIRED);
    }
    this._routeResolver = options.routeResolver;
    this._batchExecutor = options.batchExecutor;
    this._statementAdapter = options.statementAdapter;
    this._reduceCoordinator = options.reduceCoordinator;
    this._partitionTopology = options.partitionTopology;
    // Optional: without an activation lease owner a shard host with no
    // ready Cell stays the typed HOST_CELL_UNAVAILABLE refusal.
    this._activationLeases =
      typeof options.activationLeases?.publishActivationLease === 'function' ?
        options.activationLeases :
        null;
    this._activationRetryIntervalMs = Number.isSafeInteger(
      options.activationRetryIntervalMs) &&
      options.activationRetryIntervalMs > 0 ?
      options.activationRetryIntervalMs :
      CALL_INVOKER_ACTIVATION_DEFAULT.RETRY_INTERVAL_MS;
    this._activationWaitMs = Number.isSafeInteger(options.activationWaitMs) &&
      options.activationWaitMs > 0 ?
      options.activationWaitMs :
      CALL_INVOKER_ACTIVATION_DEFAULT.WAIT_MS;
    this._batchRowBound = options.batchRowBound;
    this._partialLimit = options.partialLimit;
    // batchRowBound rides with the bounded-emit budgets so the shard's
    // host node applies the same row bound when it builds the batch
    // locally.
    this._callCellBudgets = Object.freeze({
      batchRowBound: this._batchRowBound,
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

  // One shard run dispatch under host-restricted selection. When the
  // host has no ready Cell and an activation lease owner is composed,
  // publish the bounded demand lease and retry until the planner's
  // activated replica turns ready or the activation window lapses — the
  // invoker never places anything itself; it only signals and waits.
  async _dispatchShardRun(request) {
    const dispatch = () => this._statementAdapter.invoke({
      name: request.name,
      argumentsJson: request.argumentsJson,
      securityContext: request.securityContext,
      deadlineMs: request.deadlineMs,
      callCell: this._callCellBudgets,
      hostNodeId: request.shard.hostTopology?.hostNodeId,
      partitionFence: request.shard.hostTopology,
      partitionId: request.shard.partitionId,
      exportName: RUN_EXPORT,
      slotId: request.slotId,
      invocationId: createCallSlotInvocationId(
        request.invocationId, request.slotId),
    });
    const hostNodeId = request.shard.hostTopology?.hostNodeId;
    // The activation window never outlives the caller's own deadline: a
    // short-deadline call must fail typed with budget left to report,
    // not burn its whole budget waiting for capacity.
    const activationDeadline = Math.min(
      Date.now() + this._activationWaitMs,
      Number.isFinite(request.deadlineMs) ?
        request.deadlineMs :
        Number.POSITIVE_INFINITY,
    );
    for (;;) {
      try {
        return await dispatch();
      } catch (error) {
        if (error?.code !== CALL_CELL_ROUTE_ERROR_CODE.HOST_CELL_UNAVAILABLE ||
            !this._activationLeases || !hostNodeId) {
          throw error;
        }
        await this._activationLeases.publishActivationLease(
          request.resolution.serviceId,
          hostNodeId,
        );
        if (Date.now() + this._activationRetryIntervalMs >
            activationDeadline) {
          throw error;
        }
        await sleep(this._activationRetryIntervalMs);
      }
    }
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
    // Plan-only fan-out: the declared statement is parsed and the shard
    // partitions resolved here, but no rows are fetched — each shard's
    // host node builds its own typed batch so raw shard rows never leave
    // that node before the run export executes.
    const plan = this._batchExecutor.planShards({
      statement: resolution.statement,
    });
    const batches = plan.shards.map((shard) => ({
      hostTopology: this._partitionTopology ?
        this._partitionTopology.resolveShardHost(
          plan.tableName, shard.partitionId) :
        null,
      partitionId: shard.partitionId,
    }));
    if (batches.length === 0) {
      throw createCallRoutingFailure(
        CALL_CELL_ROUTE_ERROR_CODE.ROUTE_UNAVAILABLE,
        CALL_INVOKER_MESSAGE.EMPTY_BATCH_SET,
      );
    }

    // Content-fresh identity: concurrent invocations of the same Binding
    // must never share coordination rows, so the id is a routing-contract
    // UUID identity, not a timestamp. Each shard run and the reduce get
    // their own slot-scoped WIRE identity: the runtime durable fence
    // journals per wire identity, and the route resolver spreads shard
    // runs across ready replicas by the identity's slot ordinal.
    const {invocationId} = createCallInvocationIdentity();
    const slotIds = batches.map((_, index) => index + 1);
    // The reduce lease occupies its own coordination slot above the shard
    // slots; the completeness gate reads only the shard slots.
    const reduceLeaseSlotId = slotIds.length + 1;
    await this._reduceCoordinator.seedInvocation(
      invocationId,
      [...slotIds, reduceLeaseSlotId],
    );

    for (const [slotIndex, shard] of batches.entries()) {
      const slotId = slotIds[slotIndex];
      const delivery = await this._dispatchShardRun({
        argumentsJson,
        deadlineMs,
        invocationId,
        name,
        resolution,
        securityContext,
        shard,
        slotId,
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

    // Reduce runs on a replica that HOLDS the reduce lease: resolve the
    // reduce route first, acquire the dedicated reduce lease slot under
    // that replica, dispatch, and refuse the snapshot if the executing
    // replica is not the lease holder (route moved between acquire and
    // dispatch — retryable, nothing became visible).
    const reduceInvocationId = createCallReduceInvocationId(invocationId);
    const reduceRoute = this._routeResolver.resolve({
      invocationId: reduceInvocationId,
      name,
      securityContext,
    });
    await this._reduceCoordinator.acquireReduceLease(
      invocationId,
      reduceRoute.replicaId,
      reduceLeaseSlotId,
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
      invocationId: reduceInvocationId,
    });
    const reducedBy = reduceDelivery.replicaId ?? reduceRoute.replicaId;
    if (reducedBy !== reduceRoute.replicaId) {
      throw createCallRoutingFailure(
        CALL_CELL_ROUTE_ERROR_CODE.TARGET_STALE,
        CALL_INVOKER_MESSAGE.REDUCE_LEASE_HOLDER_MOVED,
        {classification: CALL_CELL_ROUTE_CLASSIFICATION.RETRYABLE},
      );
    }
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
