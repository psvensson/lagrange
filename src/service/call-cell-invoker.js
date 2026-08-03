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
import {
  SHARD_TASK_STATUS,
  runBoundedShardDispatch,
} from './call-shard-dispatch-pool.js';

const CALL_INVOKER_MESSAGE = Object.freeze({
  EMPTY_BATCH_SET:
    'Call Cell declared statement resolved to zero shard batches',
  REDUCE_LEASE_HOLDER_MOVED:
    'Call Cell reduce executed on a replica that does not hold the ' +
    'reduce lease',
  SHARD_ADMISSION_DEADLINE:
    'Call Cell invocation deadline passed before every shard run was ' +
    'admitted',
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
// Coordination-garbage retention: lapsed slot rows and abandoned result
// rows older than this window are swept opportunistically, one bounded
// sweep per new invocation (no background reaper).
const CALL_INVOKER_RECLAIM_RETENTION_DEFAULT_MS = 600000;
const CALL_INVOKER_RECLAIM_SWEEP_FAILED_LOG =
  'call-cell coordination reclaim sweep failed (hygiene only; the live ' +
  'invocation proceeds)';
// Bounded shard-run parallelism: policy-owned, never caller-selected.
// Independent partition-local runs proceed concurrently up to this
// limit through the call-shard dispatch pool; admission is slot-ordered
// and stops on the first failure or when the shared invocation deadline
// passes (started work always settles, and the complete-set gate keeps
// anything partial invisible).
const CALL_INVOKER_MAX_CONCURRENT_SHARD_RUNS_DEFAULT = 8;
const CALL_INVOKER_TELEMETRY_LOG = 'call-cell invocation telemetry';
const CALL_INVOKER_TELEMETRY_NO_FAILURE = 'none';
const CALL_INVOKER_TELEMETRY_UNTYPED_FAILURE = 'untyped';

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

function positiveIntegerOption(value, fallback) {
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

// Telemetry accumulation helpers: the guards live here so the dispatch
// loop's own decision count stays about routing, not observability.
function countReadyCellHit(telemetry, publishedActivationLease) {
  if (telemetry && !publishedActivationLease) {
    telemetry.readyCellHits += 1;
  }
}

function countActivationLeasePublished(telemetry) {
  if (telemetry) {
    telemetry.activationLeasesPublished += 1;
  }
}

function nonNegativeIntegerOption(value, fallback) {
  return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

function assertInvokerCollaborators(options) {
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
}

class CallCellInvoker {
  constructor(options = {}) {
    assertInvokerCollaborators(options);
    this._logger = options.logger || null;
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
    this._activationRetryIntervalMs = positiveIntegerOption(
      options.activationRetryIntervalMs,
      CALL_INVOKER_ACTIVATION_DEFAULT.RETRY_INTERVAL_MS);
    this._activationWaitMs = positiveIntegerOption(
      options.activationWaitMs, CALL_INVOKER_ACTIVATION_DEFAULT.WAIT_MS);
    this._reclaimRetentionMs = positiveIntegerOption(
      options.reclaimRetentionMs, CALL_INVOKER_RECLAIM_RETENTION_DEFAULT_MS);
    this._batchRowBound = options.batchRowBound;
    this._partialLimit = options.partialLimit;
    this._maxConcurrentShardRuns = positiveIntegerOption(
      options.maxConcurrentShardRuns,
      CALL_INVOKER_MAX_CONCURRENT_SHARD_RUNS_DEFAULT);
    // Optional invocation-level telemetry sink; the record is also logged
    // at debug so locality and concurrency stay observable by default.
    this._onInvocationTelemetry =
      typeof options.onInvocationTelemetry === 'function' ?
        options.onInvocationTelemetry :
        null;
    // batchRowBound rides with the bounded-emit budgets so the shard's
    // host node applies the same row bound when it builds the batch
    // locally.
    this._callCellBudgets = Object.freeze({
      batchRowBound: this._batchRowBound,
      emitBudget: nonNegativeIntegerOption(
        options.emitBudget, CALL_INVOKER_BUDGET_DEFAULT.EMIT_BUDGET),
      nestedCallBudget: nonNegativeIntegerOption(
        options.nestedCallBudget,
        CALL_INVOKER_BUDGET_DEFAULT.NESTED_CALL_BUDGET),
    });
  }

  // One shard run dispatch under host-restricted selection. When the
  // host has no ready Cell and an activation lease owner is composed,
  // publish the bounded demand lease and retry until the planner's
  // activated replica turns ready or the activation window lapses — the
  // invoker never places anything itself; it only signals and waits.
  async _dispatchShardRun(request, telemetry) {
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
    let publishedActivationLease = false;
    for (;;) {
      try {
        const delivery = await dispatch();
        countReadyCellHit(telemetry, publishedActivationLease);
        return delivery;
      } catch (error) {
        if (error?.code !== CALL_CELL_ROUTE_ERROR_CODE.HOST_CELL_UNAVAILABLE ||
            !this._activationLeases || !hostNodeId) {
          throw error;
        }
        await this._activationLeases.publishActivationLease(
          request.resolution.serviceId,
          hostNodeId,
        );
        publishedActivationLease = true;
        countActivationLeasePublished(telemetry);
        if (Date.now() + this._activationRetryIntervalMs >
            activationDeadline) {
          throw error;
        }
        await sleep(this._activationRetryIntervalMs);
      }
    }
  }

  // One complete per-slot pipeline: host-restricted dispatch (with
  // bounded activation), fail-closed partial normalization, slot lease
  // acquisition, and partial publication. Independent per slot and safe
  // to run concurrently: every step is keyed by the slot's own wire
  // identity and coordination row, and publication order never affects
  // the complete-set gate.
  async _runShardSlot(request, telemetry) {
    const delivery = await this._dispatchShardRun(request, telemetry);
    // The published slot partial is the shard's EMITTED partial set (the
    // bounded call-context emit log), normalized fail-closed into the
    // coordinator's {groupKey, aggValue} entries. The run export's own
    // return value is component bookkeeping and is not coordinated.
    const entries = normalizeEmittedPartialEntries(delivery.partials);
    const replicaId = delivery.replicaId ?? request.resolution.replicaId;
    const partialJson = JSON.stringify(entries);
    if (telemetry) {
      telemetry.bytesEmittedAsPartials += Buffer.byteLength(partialJson);
    }
    await this._reduceCoordinator.acquireReduceLease(
      request.invocationId,
      replicaId,
      request.slotId,
    );
    await this._reduceCoordinator.publishPartial(
      request.invocationId,
      request.slotId,
      replicaId,
      partialJson,
      Date.now(),
    );
    return request.slotId;
  }

  /**
   * @param {object} request
   * @param {string} request.name call Binding registration name
   * @param {string} [request.argumentsJson] transient arguments JSON object
   * @param {object} request.securityContext frozen {tenantId,principal,roles}
   * @param {number} [request.deadlineMs] absolute epoch-ms deadline
   * @return {Promise<string>} the final reduced result JSON string
   */
  async invoke(request) {
    const telemetry = {
      activationLeasesPublished: 0,
      bytesEmittedAsPartials: 0,
      configuredConcurrency: this._maxConcurrentShardRuns,
      failureCode: CALL_INVOKER_TELEMETRY_NO_FAILURE,
      peakConcurrentShardRuns: 0,
      readyCellHits: 0,
      reduceMs: 0,
      selectedPartitionCount: 0,
      shardDispatchMs: 0,
    };
    try {
      return await this._invokeWithTelemetry(request, telemetry);
    } catch (error) {
      telemetry.failureCode = typeof error?.code === 'string' ?
        error.code :
        CALL_INVOKER_TELEMETRY_UNTYPED_FAILURE;
      throw error;
    } finally {
      this._logger?.debug?.(CALL_INVOKER_TELEMETRY_LOG, telemetry);
      this._onInvocationTelemetry?.(Object.freeze(telemetry));
    }
  }

  async _invokeWithTelemetry(
    {name, argumentsJson, securityContext, deadlineMs}, telemetry) {
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
    // Amortized coordination hygiene: one bounded sweep of lapsed rows
    // per new invocation. Best-effort — reclaim trouble must never fail
    // a live invocation.
    if (typeof this._reduceCoordinator.reclaimExpiredCoordination ===
        'function') {
      try {
        await this._reduceCoordinator.reclaimExpiredCoordination(
          this._reclaimRetentionMs);
      } catch (reclaimError) {
        // Hygiene only; the seeded rows below are what correctness
        // needs — but repeated sweep failures must stay observable.
        this._logger?.debug?.(CALL_INVOKER_RECLAIM_SWEEP_FAILED_LOG, {
          message: reclaimError?.message,
        });
      }
    }
    // The reduce lease occupies its own coordination slot above the shard
    // slots; the completeness gate reads only the shard slots.
    const reduceLeaseSlotId = slotIds.length + 1;
    await this._reduceCoordinator.seedInvocation(
      invocationId,
      [...slotIds, reduceLeaseSlotId],
    );

    // Bounded parallel shard dispatch: independent per-slot pipelines
    // proceed concurrently up to the policy-owned limit, preferring
    // slot order. Slot identity, wire identity, and lease identity were
    // all fixed above, before any dispatch — completion order never
    // affects them. Shards resolved to the same host node serialize
    // there (the WASI cell runtime allows one active invocation per
    // component instance); shards on distinct hosts overlap. The
    // transport cannot cancel already-dispatched work, so on failure or
    // deadline the pool only stops admitting new shards; started work
    // settles, and nothing partial ever becomes visible because
    // reduction requires the complete slot set.
    telemetry.selectedPartitionCount = batches.length;
    const shardPhaseStartedAt = Date.now();
    const dispatchOutcome = await runBoundedShardDispatch({
      admissionKeyOf: (slotRequest) =>
        slotRequest.shard.hostTopology?.hostNodeId,
      deadlineMs,
      limit: this._maxConcurrentShardRuns,
      runSlot: (slotRequest) => this._runShardSlot(slotRequest, telemetry),
      slots: batches.map((shard, slotIndex) => ({
        argumentsJson,
        deadlineMs,
        invocationId,
        name,
        resolution,
        securityContext,
        shard,
        slotId: slotIds[slotIndex],
      })),
    });
    telemetry.peakConcurrentShardRuns = dispatchOutcome.peakConcurrent;
    telemetry.shardDispatchMs = Date.now() - shardPhaseStartedAt;
    // Deterministic failure selection: settled entries are slot-ordered,
    // so the surfaced failure is the lowest-slot cause after every
    // started task settled — never network completion order.
    const rejected = dispatchOutcome.settled.find(
      (entry) => entry.status === SHARD_TASK_STATUS.REJECTED);
    if (rejected) {
      throw rejected.reason;
    }
    if (dispatchOutcome.unadmitted.length > 0) {
      throw createCallRoutingFailure(
        CALL_CELL_ROUTE_ERROR_CODE.DEADLINE_EXHAUSTED,
        CALL_INVOKER_MESSAGE.SHARD_ADMISSION_DEADLINE,
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
    const reduceStartedAt = Date.now();
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
    telemetry.reduceMs = Date.now() - reduceStartedAt;
    return resultJson;
  }
}

export {CallCellInvoker};
