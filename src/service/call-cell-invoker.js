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
  assertCallBaseInvocationId,
  callFailureProvesNoExecution,
  createCallInvocationIdentity,
  createCallReduceInvocationId,
  createCallRoutingFailure,
  createCallSlotInvocationId,
  createScopedDirectCallInvocationId,
  normalizeCallComponentResult,
  normalizeEmittedPartialEntries,
  recordInvocationExecutionStarted,
} from './call-cell-routing-contract.js';
import {
  DirectCallReplayCoordinator,
  executeWithDirectCallReplay,
} from './call-direct-invocation-replay.js';
import {
  SHARD_TASK_STATUS,
  runBoundedShardDispatch,
} from './call-shard-dispatch-pool.js';
import {
  normalizeCallSelectorInvocationParameters,
} from './call-selector-parameter-contract.js';
import {
  encodeCanonicalGroupKey,
  encodeCanonicalPartialValue,
} from './call-canonical-partial-codec.js';
import {
  createPagedShardProgressTracker,
  executePagedShardSlot,
} from './call-shard-paged-execution.js';
import {reportWaitBoundSpent} from '../logging/wait-bound-spent.js';

const CALL_INVOKER_MESSAGE = Object.freeze({
  EMPTY_BATCH_SET:
    'Call Cell declared statement resolved to zero shard batches',
  INVOCATION_GENERATION_CONFLICT:
    'Call Cell explicit generation does not match resolved binding generation',
  INVOCATION_PARAMETER_CONFLICT:
    'Call Cell retry or duplicate invocation changed selector parameter values under an existing invocation identity',
  REDUCE_LEASE_HOLDER_MOVED:
    'Call Cell reduce executed on a replica that does not hold the ' +
    'reduce lease',
  SHARD_ADMISSION_DEADLINE:
    'Call Cell invocation deadline passed before every shard run was ' +
    'admitted',
});
const _DIRECT_CALL_ERROR_CODES = Object.freeze([
  CALL_CELL_ROUTE_ERROR_CODE.INVOCATION_AMBIGUOUS,
  CALL_CELL_ROUTE_ERROR_CODE.INVOCATION_CONFLICT,
  CALL_CELL_ROUTE_ERROR_CODE.INVOCATION_EXPIRED,
]);

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
const DEFAULT_ATTEMPT_ID = 'attempt-1';
const DEFAULT_SHARD_FAIL_REASON = 'shard_failed';
// Bounded wait for a lease-driven activation to produce a ready Cell on
// the shard host node: retry the host-restricted dispatch until the
// planner's replica turns ready or the window lapses (then the typed
// HOST_CELL_UNAVAILABLE refusal propagates, retryable by the caller).
const CALL_INVOKER_ACTIVATION_DEFAULT = Object.freeze({
  RETRY_INTERVAL_MS: 250,
  WAIT_MS: 15000,
});
const ACTIVATION_WAIT = Object.freeze({
  wait: 'CALL_INVOKER_ACTIVATION_DEFAULT.WAIT_MS',
  awaited: 'ready Call Cell on the shard host after an activation lease',
});
const SHARD_ADMISSION_WAIT = Object.freeze({
  wait: 'call_invocation_deadline',
  awaited: 'admission of every shard run before the invocation deadline',
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

// Base-identity resolution owner: a system-owned supplied base (the
// request-call bridge's '#call-' child identity) is used verbatim after
// the wire-grammar gate; otherwise a fresh routing-contract UUID.
function resolveBaseInvocationId(suppliedInvocationId, request) {
  if (typeof suppliedInvocationId === 'string' &&
      suppliedInvocationId.length > 0) {
    return assertCallBaseInvocationId(suppliedInvocationId);
  }
  const directKey = request?.invocationKey ?? request?.idempotencyKey;
  if (typeof directKey === 'string' && directKey.length > 0) {
    return createScopedDirectCallInvocationId({
      invocationKey: directKey,
      principal: request?.securityContext?.principal,
      tenantId: request?.securityContext?.tenantId,
    });
  }
  return createCallInvocationIdentity().invocationId;
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
    this._batchByteBound = options.batchByteBound;
    this._pagedExecution = Boolean(options.pagedExecution);
    this._pageRowBound = options.pageRowBound;
    this._maxPagesPerShard = options.maxPagesPerShard;
    this._maxShardRows = options.maxShardRows;
    this._maxShardBytes = options.maxShardBytes;
    this._maxStateBytes = options.maxStateBytes;
    this._progressTracker = options.progressTracker ||
      createPagedShardProgressTracker();
    this._partialLimit = options.partialLimit;
    this._partialByteLimit = options.partialByteLimit;
    this._maxConcurrentShardRuns = positiveIntegerOption(
      options.maxConcurrentShardRuns,
      CALL_INVOKER_MAX_CONCURRENT_SHARD_RUNS_DEFAULT);
    // Optional invocation-level telemetry sink; the record is also logged
    // at debug so locality and concurrency stay observable by default.
    this._onInvocationTelemetry =
      typeof options.onInvocationTelemetry === 'function' ?
        options.onInvocationTelemetry :
        null;
    // batchRowBound (and optional batchByteBound) ride with the
    // bounded-emit budgets so the shard's host node applies the same
    // row/byte bounds when it builds the batch locally.
    this._callCellBudgets = Object.freeze({
      ...(this._batchByteBound === undefined ?
        {} :
        {batchByteBound: this._batchByteBound}),
      batchRowBound: this._batchRowBound,
      emitBudget: nonNegativeIntegerOption(
        options.emitBudget, CALL_INVOKER_BUDGET_DEFAULT.EMIT_BUDGET),
      nestedCallBudget: nonNegativeIntegerOption(
        options.nestedCallBudget,
        CALL_INVOKER_BUDGET_DEFAULT.NESTED_CALL_BUDGET),
    });
    this._invocationParameterFence = new Map();
    this._directCallReplay = options.directCallReplay ||
      new DirectCallReplayCoordinator({
        nowProvider: options.nowProvider,
        reduceCoordinator: this._reduceCoordinator,
        retentionWindowMs: options.retentionWindowMs,
      });
  }

  _assertInvocationParameterFence(
    invocationId,
    securityContext,
    resolution,
    normalizedParams,
    argumentsJson,
  ) {
    const key = `${securityContext?.tenantId ?? ''}:${invocationId}`;
    const current = {
      argumentsJson: argumentsJson ?? '{}',
      bindingVersionId: resolution.bindingVersionId,
      name: resolution.name,
      parametersDigest: normalizedParams.parametersDigest,
    };
    const existing = this._invocationParameterFence.get(key);
    if (!existing) {
      this._invocationParameterFence.set(key, Object.freeze(current));
      return;
    }
    if (existing.bindingVersionId !== current.bindingVersionId ||
        existing.name !== current.name ||
        existing.parametersDigest !== current.parametersDigest ||
        existing.argumentsJson !== current.argumentsJson) {
      throw createCallRoutingFailure(
        CALL_CELL_ROUTE_ERROR_CODE.INVALID_ARGUMENTS,
        CALL_INVOKER_MESSAGE.INVOCATION_PARAMETER_CONFLICT,
      );
    }
  }

  // One shard run dispatch under host-restricted selection. When the
  // host has no ready Cell and an activation lease owner is composed,
  // publish the bounded demand lease and retry until the planner's
  // activated replica turns ready or the activation window lapses — the
  // invoker never places anything itself; it only signals and waits.
  async _dispatchShardRun(request, telemetry) {
    const dispatch = () => this._statementAdapter.invoke({
      argumentsJson: request.argumentsJson,
      bindingVersionId: request.resolution.bindingVersionId,
      callCell: this._callCellBudgets,
      callerServiceId: request.callerServiceId,
      deadlineMs: request.deadlineMs,
      exportName: RUN_EXPORT,
      hostNodeId: request.shard.hostTopology?.hostNodeId,
      invocationId: createCallSlotInvocationId(
        request.invocationId, request.slotId),
      name: request.name,
      ...(request.pageRequest !== undefined ?
        {pageRequest: request.pageRequest} :
        {}),
      ...(request.parametersDigest !== null &&
          request.parametersDigest !== undefined ?
        {
          parameters: request.parameters,
          parametersDigest: request.parametersDigest,
        } :
        {}),
      partitionFence: request.shard.hostTopology,
      partitionId: request.shard.partitionId,
      securityContext: request.securityContext,
      slotId: request.slotId,
    });
    const hostNodeId = request.shard.hostTopology?.hostNodeId;
    // The activation window never outlives the caller's own deadline: a
    // short-deadline call must fail typed with budget left to report,
    // not burn its whole budget waiting for capacity.
    const activationStartedAtMs = Date.now();
    const activationDeadline = Math.min(
      activationStartedAtMs + this._activationWaitMs,
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
          reportWaitBoundSpent(this._logger, {
            ...ACTIVATION_WAIT,
            boundMs: activationDeadline - activationStartedAtMs,
            startedAtMs: activationStartedAtMs,
            lastObserved: {lastErrorCode: error.code, publishedActivationLease},
            scope: () => ({
              hostNodeId,
              partitionId: request.shard.partitionId,
              invocationId: request.invocationId,
            }),
          });
          throw error;
        }
        await sleep(this._activationRetryIntervalMs);
      }
    }
  }

  _isPagedOperation(request) {
    const res = request.resolution;
    return Boolean(
      this._pagedExecution ||
      request.pagedExecution ||
      res?.paged ||
      res?.pageKey !== undefined ||
      res?.stateSchema !== undefined ||
      res?.pageRowBound !== undefined,
    );
  }

  _resolvePagedExecutionLimits(res) {
    const r = res || {};
    return {
      maxPages: r.maxPages ?? this._maxPagesPerShard,
      maxShardBytes: r.maxShardBytes ?? this._maxShardBytes,
      maxShardRows: r.maxShardRows ?? this._maxShardRows,
      maxStateBytes: r.maxStateBytes ?? this._maxStateBytes,
      pageByteBound: r.pageByteBound ?? this._batchByteBound,
      pageRowBound:
        r.pageRowBound ?? this._pageRowBound ?? this._batchRowBound,
    };
  }

  async _runPagedShardSlot(request, telemetry, executionEvidence) {
    const res = request.resolution;
    const outcome = await executePagedShardSlot({
      dispatchPage: (pageTurn) => {
        const pagedArgsJson = JSON.stringify({
          __lagrangePagedStep: {
            isFinalPage: false,
            pageIndex: pageTurn.pageIndex,
            requireAccumulator: Boolean(res?.requireAccumulator),
            stateJson: pageTurn.stateJson,
          },
          arguments: pageTurn.userArguments,
        });
        return this._dispatchShardRun({
          ...request,
          argumentsJson: pagedArgsJson,
          pageRequest: {
            attemptId: pageTurn.attemptId,
            pageByteBound: pageTurn.pageByteBound,
            pageCursor: pageTurn.pageCursor,
            pageIndex: pageTurn.pageIndex,
            pageKey: res?.pageKey,
            pageRowBound: pageTurn.pageRowBound,
            readViewId: pageTurn.readViewId,
          },
        }, telemetry);
      },
      executionEvidence,
      limits: this._resolvePagedExecutionLimits(res),
      progressTracker: this._progressTracker,
      reduceCoordinator: this._reduceCoordinator,
      request,
      telemetry,
    });
    return outcome.slotId;
  }

  // One complete per-slot pipeline: host-restricted dispatch (with
  // bounded activation), fail-closed partial normalization, slot lease
  // acquisition, and partial publication. Independent per slot and safe
  // to run concurrently: every step is keyed by the slot's own wire
  // identity and coordination row, and publication order never affects
  // the complete-set gate.
  async _runShardSlot(request, telemetry, executionEvidence) {
    if (this._isPagedOperation(request)) {
      return this._runPagedShardSlot(request, telemetry, executionEvidence);
    }
    const delivery = await this._dispatchShardRun(request, telemetry);
    // A processed delivery means this shard's run export executed.
    executionEvidence.started = true;
    // The published slot partial is the shard's EMITTED partial set (the
    // bounded call-context emit log), normalized fail-closed into the
    // coordinator's {groupKey, aggValue} entries. The run export's own
    // return value is component bookkeeping and is not coordinated.
    const entries = normalizeEmittedPartialEntries(delivery.partials, {
      invocationId: request.invocationId,
      shardId: request.shard?.partitionId,
      slotId: request.slotId,
    });
    const replicaId = delivery.replicaId ?? request.resolution.replicaId;
    const partialJson = encodeCanonicalPartialValue(entries);
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
    const executionEvidence = {started: false};
    try {
      return await executeWithDirectCallReplay({
        executionEvidence,
        replayCoordinator: this._directCallReplay,
        request,
        resolveProbePrefix: RESOLVE_PROBE_PREFIX,
        routeResolver: this._routeResolver,
        runCore: (effectiveReq) =>
          this._invokeWithTelemetry(effectiveReq, telemetry, executionEvidence),
      });
    } catch (error) {
      if (executionEvidence.started) recordInvocationExecutionStarted(error);
      telemetry.failureCode = typeof error?.code === 'string' ?
        error.code :
        CALL_INVOKER_TELEMETRY_UNTYPED_FAILURE;
      throw error;
    } finally {
      this._logger?.debug?.(CALL_INVOKER_TELEMETRY_LOG, telemetry);
      this._onInvocationTelemetry?.(Object.freeze(telemetry));
    }
  }

  async _resolveCompletePartials(invocationId, slotIds) {
    if (this._partialByteLimit === undefined) {
      return this._reduceCoordinator.resolveCompletePartialSet(
        invocationId,
        slotIds,
        this._partialLimit,
      );
    }
    return this._reduceCoordinator.resolveCompletePartialSet(
      invocationId,
      slotIds,
      this._partialLimit,
      this._partialByteLimit,
    );
  }

  _planInvocationShards(
    invocationId,
    securityContext,
    resolution,
    argumentsJson,
  ) {
    const plan = this._batchExecutor.planShards({
      argumentsJson,
      parameterSchema: resolution.parameters,
      statement: resolution.statement,
    });
    const normalizedParams = plan.boundParameters !== undefined ?
      plan :
      normalizeCallSelectorInvocationParameters({
        argumentsJson,
        parameterSchema: resolution.parameters,
        statement: resolution.statement,
      });
    this._assertInvocationParameterFence(
      invocationId,
      securityContext,
      resolution,
      normalizedParams,
      argumentsJson,
    );
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
    return {batches, normalizedParams};
  }

  async _reclaimExpiredCoordinationIfSupported() {
    if (typeof this._reduceCoordinator.reclaimExpiredCoordination !==
        'function') {
      return;
    }
    try {
      await this._reduceCoordinator.reclaimExpiredCoordination(
        this._reclaimRetentionMs);
    } catch (reclaimError) {
      this._logger?.debug?.(CALL_INVOKER_RECLAIM_SWEEP_FAILED_LOG, {
        message: reclaimError?.message,
      });
    }
  }

  async _assertShardDispatchSettled(
    dispatchOutcome,
    invocationId,
    attemptId,
    executionEvidence,
  ) {
    const rejected = dispatchOutcome.settled.find(
      (entry) => entry.status === SHARD_TASK_STATUS.REJECTED);
    if (!rejected) {
      return;
    }
    await this._progressTracker.discardAttempt(
      invocationId,
      attemptId,
      rejected.reason?.pagedCode || rejected.reason?.code ||
        DEFAULT_SHARD_FAIL_REASON,
    );
    if (dispatchOutcome.settled.some((entry) =>
      entry.status === SHARD_TASK_STATUS.REJECTED &&
      !callFailureProvesNoExecution(entry.reason))) {
      executionEvidence.started = true;
    }
    throw rejected.reason;
  }

  async _invokeWithTelemetry(request, telemetry, executionEvidence) {
    const {
      name,
      argumentsJson,
      callerServiceId,
      securityContext,
      deadlineMs,
      invocationId: suppliedInvocationId,
    } = request;
    const attemptId = request.attemptId || DEFAULT_ATTEMPT_ID;
    const pagedExecution = Boolean(request.pagedExecution);
    const resolution = request._preResolvedRoute ||
      this._routeResolver.resolve({
        callerServiceId,
        invocationId: `${RESOLVE_PROBE_PREFIX}${name}`,
        name,
        securityContext,
      });
    const invocationId = resolveBaseInvocationId(suppliedInvocationId, request);
    const {batches, normalizedParams} = this._planInvocationShards(
      invocationId,
      securityContext,
      resolution,
      argumentsJson,
    );

    const slotIds = batches.map((_, index) => index + 1);
    await this._reclaimExpiredCoordinationIfSupported();
    const reduceLeaseSlotId = slotIds.length + 1;
    if (!request._skipSeedIfRetry) {
      await this._reduceCoordinator.seedInvocation(
        invocationId,
        [...slotIds, reduceLeaseSlotId],
        request._admissionMeta,
      );
    }

    telemetry.selectedPartitionCount = batches.length;
    const shardPhaseStartedAt = Date.now();
    const dispatchOutcome = await runBoundedShardDispatch({
      admissionKeyOf: (slotRequest) =>
        slotRequest.shard.hostTopology?.hostNodeId,
      deadlineMs,
      limit: this._maxConcurrentShardRuns,
      runSlot: (slotRequest) =>
        this._runShardSlot(slotRequest, telemetry, executionEvidence),
      slots: batches.map((shard, slotIndex) => ({
        argumentsJson,
        attemptId,
        callerServiceId,
        deadlineMs,
        invocationId,
        name,
        pagedExecution,
        parameters: normalizedParams.boundParameters,
        parametersDigest: normalizedParams.parametersDigest,
        resolution,
        securityContext,
        shard,
        slotId: slotIds[slotIndex],
      })),
    });
    telemetry.peakConcurrentShardRuns = dispatchOutcome.peakConcurrent;
    telemetry.shardDispatchMs = Date.now() - shardPhaseStartedAt;
    await this._assertShardDispatchSettled(
      dispatchOutcome,
      invocationId,
      attemptId,
      executionEvidence,
    );
    if (dispatchOutcome.unadmitted.length > 0) {
      reportWaitBoundSpent(this._logger, {
        ...SHARD_ADMISSION_WAIT,
        boundMs: deadlineMs - shardPhaseStartedAt,
        startedAtMs: shardPhaseStartedAt,
        lastObserved: {
          admissionStop: dispatchOutcome.admissionStop,
          settled: dispatchOutcome.settled.length,
          unadmitted: dispatchOutcome.unadmitted.length,
        },
        scope: {invocationId},
      });
      throw createCallRoutingFailure(
        CALL_CELL_ROUTE_ERROR_CODE.DEADLINE_EXHAUSTED,
        CALL_INVOKER_MESSAGE.SHARD_ADMISSION_DEADLINE,
      );
    }

    // resolveCompletePartialSet fails closed (typed REDUCE_INCOMPLETE) unless
    // the partial set is complete, fresh, bounded, and disjoint.
    const {partials, witness} = await this._resolveCompletePartials(
      invocationId,
      slotIds,
    );

    // Reduce runs on a replica that HOLDS the reduce lease: resolve the
    // reduce route first, acquire the dedicated reduce lease slot under
    // that replica, dispatch, and refuse the snapshot if the executing
    // replica is not the lease holder (route moved between acquire and
    // dispatch — retryable, nothing became visible).
    const reduceStartedAt = Date.now();
    const reduceInvocationId = createCallReduceInvocationId(invocationId);
    const reduceRoute = this._routeResolver.resolve({
      bindingVersionId: resolution.bindingVersionId,
      callerServiceId,
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
      argumentsJson,
      bindingVersionId: resolution.bindingVersionId,
      callCell: this._callCellBudgets,
      callerServiceId,
      deadlineMs,
      exportName: REDUCE_EXPORT,
      invocationId: reduceInvocationId,
      name,
      ...(normalizedParams.parametersDigest !== null &&
          normalizedParams.parametersDigest !== undefined ?
        {
          parameters: normalizedParams.boundParameters,
          parametersDigest: normalizedParams.parametersDigest,
        } :
        {}),
      partials: partials.map(([groupKey, aggValue]) => [
        encodeCanonicalGroupKey(groupKey),
        encodeCanonicalPartialValue(aggValue),
      ]),
      securityContext,
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
    const finalWitness = request._admissionMeta ?
      await this._directCallReplay.recordCompleted(
        invocationId,
        request._admissionMeta,
        resultJson,
        witness,
      ) :
      witness;
    await this._reduceCoordinator.publishFinalSnapshot(
      invocationId,
      resultJson,
      finalWitness,
    );
    telemetry.reduceMs = Date.now() - reduceStartedAt;
    return resultJson;
  }
}

export {CallCellInvoker};
