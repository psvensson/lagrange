import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
import {OperationWorkflowTransitionRetryGrace} from './operation-workflow-transition-retry-grace.js';
import * as DISPATCH_REARM_EVIDENCE
  from './operation-workflow-dispatch-rearm-evidence.js';

const {
  OBSERVED_PROGRESS_RETRY_DELAY_MS,
  OPERATION_WORKFLOW_OWNER_LITERAL,
  REPLICA_OPERATION_DISPATCH_TIMEOUT_MS,
  DISPATCH_RETRY_DELAY_MS,
  DISPATCH_RETRY_MAX_DELAY_MS,
  DISPATCH_RETRY_BACKOFF_MULTIPLIER,
  DISPATCH_RETRY_JITTER_RATIO,
  classifySystemPartition,
} = OPERATION_WORKFLOW_OWNER_SHARED;

class OperationWorkflowOwnerRetryRegistry {
  /**
   * @param {Function} options.allocateCanonicalReplicaId -
   *   Replica ID allocation callback.
   * @param {Function} options.getActualReplicaStatus -
   *   Authoritative replica status read callback.
   * @param {Function} [options.setTimeoutFn] - Deferred retry timer factory.
   * @param {Function} [options.clearTimeoutFn] - Deferred retry timer cleanup.
   */
  constructor(options) {
    this.repository = options.repository;
    this.operationLane = options.operationLane;
    this.operationWorkflowCoordinator = options.operationWorkflowCoordinator;
    this.operationWorkflowRunExclusive = this.operationLane.run.bind(
      this.operationLane,
    );
    this.controlPlaneReadinessService = options.controlPlaneReadinessService;
    this.messageRouter = options.messageRouter;
    this.tablePolicyService = options.tablePolicyService;
    this.logger = options.logger;
    this.emitter = options.emitter;
    this.config = options.config;
    this.nodeId = options.nodeId;
    this.stats = options.stats;
    this._isShuttingDown = options.isShuttingDown;
    this._isInitialized = options.isInitialized;
    this.releaseReservationForOperation =
      options.releaseReservationForOperation;
    this.reconcileReservations = options.reconcileReservations;
    this.allocateCanonicalReplicaId = options.allocateCanonicalReplicaId;
    this.getActualReplicaStatus = options.getActualReplicaStatus;
    this.setTimeoutFn =
      typeof options.setTimeoutFn === 'function' ?
        options.setTimeoutFn :
        setTimeout;
    this.clearTimeoutFn =
      typeof options.clearTimeoutFn === 'function' ?
        options.clearTimeoutFn :
        clearTimeout;
    this.randomFn =
      typeof options.randomFn === 'function' ?
        options.randomFn :
        Math.random;
    this.lastEmptyIncompleteOperationQueryAtMs = 0;
    this.incompleteOperationQueryEmptyBackoffMs =
      options.incompleteOperationQueryEmptyBackoffMs || 0;
    this.replicaOperationDispatchTimeoutMs =
      Number.isFinite(options.replicaOperationDispatchTimeoutMs) &&
      options.replicaOperationDispatchTimeoutMs > 0 ?
        Math.floor(options.replicaOperationDispatchTimeoutMs) :
        REPLICA_OPERATION_DISPATCH_TIMEOUT_MS;
    this.safetyDeferredLogStateByOperationId = new Map();
    this.safetyDeferredRetryTimerByOperationId = new Map();
    this.observedProgressRetryTimerByOperationId = new Map();
    this.dispatchRetryTimerByOperationId = new Map();
    this.priorityActiveReplaceRetryTimerByOperationId = new Map();
    this.createdOperationHandoffRetryTimerByOperationId = new Map();
    this.createdOperationHandoffRetryDeadlineMsByOperationId = new Map();
    this.createdOperationHandoffRetryAttemptByOperationId = new Map();
    this.createdOperationHandoffRetryTargetNodeByOperationId = new Map();
    this.operationDispatchDeferredRetryDeadlineMsByOperationId = new Map();
    this.operationDispatchDeferredRetrySnapshotByOperationId = new Map();
    this.transitionRetryTimerByOperationId = new Map();
    this.transitionRetryGraceDeadlineByOperationId = new Map();
    this.transitionRetryOperationSnapshotByOperationId = new Map();
    this.transitionRetryGrace = new OperationWorkflowTransitionRetryGrace({
      deadlineByOperationId: this.transitionRetryGraceDeadlineByOperationId,
      getTimeoutForStep: (workflowStep, operation) =>
        this.getTimeoutForStep(workflowStep, operation),
      classifySystemPartition,
    });
    this.executorOutcomeRetryTimerByOperationId = new Map();
    this.executorOutcomeRetryPayloadByOperationId = new Map();
    // CL-029: per-operation re-drive guard + retry backoff for executor
    // outcome evidence (retained payloads must keep a driver until applied).
    this.executorOutcomeRedriveInFlightByOperationId = new Set();
    this.executorOutcomeRetryDelayMsByOperationId = new Map();
    // Terminal-transition repair: retained terminal projections whose
    // post-commit visibility confirmation failed or deferred, re-asserted
    // with backoff until authoritatively visible (run-21 ghost-row class).
    this.terminalTransitionRepairTimerByOperationId = new Map();
    this.terminalTransitionRepairStateByOperationId = new Map();

    if (
      typeof this.getActualReplicaStatus !==
      OPERATION_WORKFLOW_OWNER_LITERAL.FUNCTION
    ) {
      throw new Error(
        OPERATION_WORKFLOW_OWNER_LITERAL.OPERATIONWORKFLOWOWNER_REQUIRES_GETACTUALREPLICASTATUS_OPEN_PAREN_CLOSE_PAREN,
      );
    }
  }

  /** @return {boolean} */
  get isShuttingDown() {
    return this._isShuttingDown();
  }

  /** @return {boolean} */
  get isInitialized() {
    return this._isInitialized();
  }

  /**
   * Release owner-local deferred retry state.
   */
  shutdown() {
    for (const timerHandle of this.safetyDeferredRetryTimerByOperationId.values()) {
      this.clearTimeoutFn(timerHandle);
    }
    this.safetyDeferredRetryTimerByOperationId.clear();
    for (const timerHandle of this.observedProgressRetryTimerByOperationId.values()) {
      this.clearTimeoutFn(timerHandle);
    }
    this.observedProgressRetryTimerByOperationId.clear();
    for (const timerHandle of this.dispatchRetryTimerByOperationId.values()) {
      this.clearTimeoutFn(timerHandle);
    }
    this.dispatchRetryTimerByOperationId.clear();
    for (const timerHandle of this.priorityActiveReplaceRetryTimerByOperationId.values()) {
      this.clearTimeoutFn(timerHandle);
    }
    this.priorityActiveReplaceRetryTimerByOperationId.clear();
    for (const timerHandle of this.createdOperationHandoffRetryTimerByOperationId.values()) {
      this.clearTimeoutFn(timerHandle);
    }
    this.createdOperationHandoffRetryTimerByOperationId.clear();
    this.createdOperationHandoffRetryDeadlineMsByOperationId.clear();
    this.createdOperationHandoffRetryAttemptByOperationId.clear();
    this.createdOperationHandoffRetryTargetNodeByOperationId.clear();
    this.operationDispatchDeferredRetryDeadlineMsByOperationId.clear();
    this.operationDispatchDeferredRetrySnapshotByOperationId.clear();
    for (const timerHandle of this.transitionRetryTimerByOperationId.values()) {
      this.clearTimeoutFn(timerHandle);
    }
    this.transitionRetryTimerByOperationId.clear();
    this.transitionRetryGrace.clearAll();
    this.transitionRetryOperationSnapshotByOperationId.clear();
    for (const timerHandle of this.executorOutcomeRetryTimerByOperationId.values()) {
      this.clearTimeoutFn(timerHandle);
    }
    this.executorOutcomeRetryTimerByOperationId.clear();
    this.executorOutcomeRetryPayloadByOperationId.clear();
    this.executorOutcomeRedriveInFlightByOperationId.clear();
    this.executorOutcomeRetryDelayMsByOperationId.clear();
    for (const timerHandle of this.terminalTransitionRepairTimerByOperationId.values()) {
      this.clearTimeoutFn(timerHandle);
    }
    this.terminalTransitionRepairTimerByOperationId.clear();
    this.terminalTransitionRepairStateByOperationId.clear();
  }

  /**
   * @param {string} operationId
   */
  clearObservedProgressRetry(operationId) {
    const timerHandle =
      this.observedProgressRetryTimerByOperationId.get(operationId);
    if (!timerHandle) {
      return;
    }
    this.clearTimeoutFn(timerHandle);
    this.observedProgressRetryTimerByOperationId.delete(operationId);
  }

  /**
   * @param {string} operationId
   * @param {string} tableName
   * @param {string} cacheOperation
   * @param {number} [delayMs=OBSERVED_PROGRESS_RETRY_DELAY_MS]
   * @return {boolean}
   */
  scheduleObservedProgressRetry(
    operationId,
    tableName,
    cacheOperation,
    delayMs = OBSERVED_PROGRESS_RETRY_DELAY_MS,
  ) {
    if (!operationId) {
      return false;
    }
    if (this.observedProgressRetryTimerByOperationId.has(operationId)) {
      return true;
    }

    const retryDelayMs =
      Number.isFinite(delayMs) && delayMs > 0 ?
        delayMs :
        OBSERVED_PROGRESS_RETRY_DELAY_MS;
    const timerHandle = this.setTimeoutFn(() => {
      this.observedProgressRetryTimerByOperationId.delete(operationId);
      if (this.isShuttingDown || !this.isInitialized) {
        return;
      }
      if (this.isOperationOwnerLaneHeld(operationId)) {
        this.scheduleObservedProgressRetry(
          operationId,
          tableName,
          cacheOperation,
          retryDelayMs,
        );
        return;
      }
      return this.operationWorkflowRunExclusive(
        this.getOperationOwnerSingleFlightKey(operationId),
        () => this.reconcileObservedProgressOperation(operationId),
      ).catch((error) => {
        this.handleObservedProgressFailure(
          operationId,
          tableName,
          cacheOperation,
          error,
        );
      });
    }, retryDelayMs);
    this.observedProgressRetryTimerByOperationId.set(
      operationId,
      timerHandle,
    );
    return true;
  }

  /**
   * @param {string} operationId
   */
  clearSafetyDeferredRetry(operationId) {
    const timerHandle =
      this.safetyDeferredRetryTimerByOperationId.get(operationId);
    if (!timerHandle) {
      return;
    }
    this.clearTimeoutFn(timerHandle);
    this.safetyDeferredRetryTimerByOperationId.delete(operationId);
  }

  /**
   * @param {string} operationId
   */
  clearDispatchRetry(operationId) {
    const timerHandle = this.dispatchRetryTimerByOperationId.get(operationId);
    if (!timerHandle) {
      return;
    }
    this.clearTimeoutFn(timerHandle);
    this.dispatchRetryTimerByOperationId.delete(operationId);
  }

  /**
   * @param {string} operationId
   */
  clearPriorityActiveReplaceRetry(operationId) {
    const timerHandle =
      this.priorityActiveReplaceRetryTimerByOperationId.get(operationId);
    if (!timerHandle) {
      return;
    }
    this.clearTimeoutFn(timerHandle);
    this.priorityActiveReplaceRetryTimerByOperationId.delete(operationId);
  }

  /**
   * @param {string} operationId
   */
  clearCreatedOperationHandoffRetry(operationId) {
    const timerHandle =
      this.createdOperationHandoffRetryTimerByOperationId.get(operationId);
    if (!timerHandle) {
      this.createdOperationHandoffRetryTargetNodeByOperationId.delete(
        operationId,
      );
      return;
    }
    this.clearTimeoutFn(timerHandle);
    this.createdOperationHandoffRetryTimerByOperationId.delete(operationId);
    this.createdOperationHandoffRetryDeadlineMsByOperationId.delete(operationId);
    this.createdOperationHandoffRetryTargetNodeByOperationId.delete(operationId);
  }

  /**
   * Reset the retry backoff attempt counter for an operation. Called once a
   * handoff is acknowledged so a future retry storm starts from the base delay.
   * @param {string|null} operationId
   * @private
   */
  resetCreatedOperationHandoffRetryAttempts(operationId) {
    if (!operationId) {
      return;
    }
    this.createdOperationHandoffRetryAttemptByOperationId.delete(operationId);
    this.createdOperationHandoffRetryTargetNodeByOperationId.delete(operationId);
  }

  /**
   * Compute the next handoff retry delay. Explicit governor/transport
   * retry-after hints are authoritative; otherwise use capped exponential
   * backoff with jitter. The attempt counter is advanced as a side effect so
   * successive retries grow geometrically instead of hammering at the base
   * cadence.
   * @param {string|null} operationId
   * @param {number} [retryAfterFloorMs=0]
   * @return {number}
   * @private
   */
  resolveCreatedOperationHandoffRetryDelayMs(
    operationId,
    retryAfterFloorMs = 0,
  ) {
    const previousAttempts = operationId ?
      Number(
        this.createdOperationHandoffRetryAttemptByOperationId.get(operationId),
      ) || 0 :
      0;
    const attempt = previousAttempts + 1;
    if (operationId) {
      this.createdOperationHandoffRetryAttemptByOperationId.set(
        operationId,
        attempt,
      );
    }
    if (Number.isFinite(retryAfterFloorMs) && retryAfterFloorMs > 0) {
      return Math.min(
        DISPATCH_RETRY_MAX_DELAY_MS,
        Math.max(1, Math.floor(retryAfterFloorMs)),
      );
    }
    const exponential =
      DISPATCH_RETRY_DELAY_MS *
      Math.pow(DISPATCH_RETRY_BACKOFF_MULTIPLIER, previousAttempts);
    const cappedExponential = Math.min(exponential, DISPATCH_RETRY_MAX_DELAY_MS);
    const flooredDelay = cappedExponential;
    const jitterSpan = flooredDelay * DISPATCH_RETRY_JITTER_RATIO;
    const jitter = jitterSpan > 0 ?
      Math.floor(this.randomFn() * jitterSpan) :
      0;
    return Math.min(
      DISPATCH_RETRY_MAX_DELAY_MS,
      Math.max(1, Math.floor(flooredDelay) + jitter),
    );
  }

  /**
   * Count the handoff retries currently armed against a target node so a single
   * unreachable/backpressured node cannot accumulate an unbounded retry fan-out.
   * @param {string|null} targetNodeId
   * @return {number}
   * @private
   */
  countActiveCreatedOperationHandoffRetriesByTargetNode(targetNodeId) {
    if (!targetNodeId) {
      return 0;
    }
    let count = 0;
    for (const [
      operationId,
      retryTargetNodeId,
    ] of this.createdOperationHandoffRetryTargetNodeByOperationId) {
      if (
        retryTargetNodeId === targetNodeId &&
        this.createdOperationHandoffRetryTimerByOperationId.has(operationId)
      ) {
        count += 1;
      }
    }
    return count;
  }

  /**
   * @param {string|null} operationId
   * @param {number} [now=Date.now()]
   * @return {boolean}
   * @private
   */
  hasActiveCreatedOperationHandoffRetry(operationId, now = Date.now()) {
    if (!operationId) {
      return false;
    }
    if (!this.createdOperationHandoffRetryTimerByOperationId.has(operationId)) {
      this.createdOperationHandoffRetryDeadlineMsByOperationId.delete(
        operationId,
      );
      return false;
    }
    const deadlineMs = Number(
      this.createdOperationHandoffRetryDeadlineMsByOperationId.get(
        operationId,
      ),
    );
    if (!Number.isFinite(deadlineMs) || deadlineMs <= now) {
      this.clearCreatedOperationHandoffRetry(operationId);
      return false;
    }
    return true;
  }

  /**
   * @param {Object} retry
   * @param {number} now
   * @return {number}
   */
  resolveOperationDispatchDeferredRetryDeadlineMs(retry = {}, now) {
    const nextAttemptAt = Number(retry?.nextAttemptAt);
    if (Number.isFinite(nextAttemptAt) && nextAttemptAt > now) {
      return Math.floor(nextAttemptAt);
    }
    const retryAfterMs = Number(retry?.retryAfterMs);
    return Number.isFinite(retryAfterMs) && retryAfterMs > 0 ?
      now + Math.floor(retryAfterMs) :
      0;
  }

  /**
   * Record a dispatch-service deferred retry so priority recovery can surface
   * it as a bounded rebalancer handoff wait.
   * @param {string|null} operationId
   * @param {Object} [retry={}]
   * @param {number} [now=Date.now()]
   * @return {boolean}
   */
  recordOperationDispatchDeferredRetry(
    operationId,
    retry = {},
    now = Date.now(),
  ) {
    if (!operationId) {
      return false;
    }
    const deadlineMs =
      this.resolveOperationDispatchDeferredRetryDeadlineMs(retry, now);
    if (deadlineMs <= now) {
      this.clearOperationDispatchDeferredRetry(operationId);
      return false;
    }
    this.operationDispatchDeferredRetryDeadlineMsByOperationId.set(
      operationId,
      deadlineMs,
    );
    this.operationDispatchDeferredRetrySnapshotByOperationId.set(
      operationId,
      Object.freeze({
        nextAttemptAt: deadlineMs,
        retryAfterMs: Math.max(1, deadlineMs - now),
        errorMessage: retry?.errorMessage || null,
      }),
    );
    return true;
  }

  /**
   * @param {string|null} operationId
   */
  clearOperationDispatchDeferredRetry(operationId) {
    if (!operationId) {
      return;
    }
    this.operationDispatchDeferredRetryDeadlineMsByOperationId.delete(
      operationId,
    );
    this.operationDispatchDeferredRetrySnapshotByOperationId.delete(
      operationId,
    );
  }

  /**
   * @param {string|null} operationId
   * @param {number} [now=Date.now()]
   * @return {boolean}
   */
  hasActiveOperationDispatchDeferredRetry(operationId, now = Date.now()) {
    if (!operationId) {
      return false;
    }
    const deadlineMs = Number(
      this.operationDispatchDeferredRetryDeadlineMsByOperationId.get(
        operationId,
      ),
    );
    if (!Number.isFinite(deadlineMs) || deadlineMs <= now) {
      this.clearOperationDispatchDeferredRetry(operationId);
      return false;
    }
    return true;
  }

  /**
   * @param {string} operationId
   */
  clearTransitionRetry(operationId) {
    const timerHandle = this.transitionRetryTimerByOperationId.get(operationId);
    this.transitionRetryOperationSnapshotByOperationId.delete(operationId);
    if (!timerHandle) {
      this.transitionRetryGrace.clear(operationId);
      return;
    }
    this.clearTimeoutFn(timerHandle);
    this.transitionRetryTimerByOperationId.delete(operationId);
    this.transitionRetryGrace.clear(operationId);
  }

  /**
   * @param {Object|null} operation
   * @return {void}
   * @private
   */
  recordTransitionRetryOperationSnapshot(operation) {
    const operationSnapshot = this.cloneOperationSnapshot(operation);
    const operationId = operationSnapshot?.operationId || null;
    if (!operationId) {
      return;
    }
    this.transitionRetryOperationSnapshotByOperationId.set(
      operationId,
      operationSnapshot,
    );
  }

  /**
   * @param {string|null} operationId
   * @return {Object|null}
   * @private
   */
  getTransitionRetryOperationSnapshot(operationId) {
    if (!operationId) {
      return null;
    }
    return this.cloneOperationSnapshot(
      this.transitionRetryOperationSnapshotByOperationId.get(operationId) ||
        null,
    );
  }

  /**
   * @param {string|null} operationId
   * @param {Object} [context={}]
   * @param {number} [delayMs=0]
   * @return {void}
   * @private
   */
  recordTransitionRetryGrace(operationId, context = {}, delayMs = 0) {
    this.transitionRetryGrace.record(operationId, context, delayMs);
  }

  resolveTransitionRetryGraceTimeoutCeilingMs(
    context,
    workflowStep,
    durableProgressAtMs,
    stepTimeout,
  ) {
    return DISPATCH_REARM_EVIDENCE.resolveTransitionRetryGraceTimeoutCeilingMs(
      this,
      context,
      workflowStep,
      durableProgressAtMs,
      stepTimeout,
    );
  }

  shouldUseOperationBudgetTransitionRetryGrace(context, workflowStep) {
    return DISPATCH_REARM_EVIDENCE
      .shouldUseOperationBudgetTransitionRetryGrace(
        this,
        context,
        workflowStep,
      );
  }

  hasActiveTransitionRetryGrace(operationId, now = Date.now()) {
    return DISPATCH_REARM_EVIDENCE.hasActiveTransitionRetryGrace(
      this,
      operationId,
      now,
    );
  }

  isOperationDeferredRetryActive(operationId) {
    return DISPATCH_REARM_EVIDENCE.isOperationDeferredRetryActive(
      this,
      operationId,
    );
  }

  shouldDeferRetryableDispatchFailure(operation, errorLike) {
    return DISPATCH_REARM_EVIDENCE.shouldDeferRetryableDispatchFailure(
      this,
      operation,
      errorLike,
    );
  }

  isDispatchRetryableWorkflowStep(operation) {
    return DISPATCH_REARM_EVIDENCE.isDispatchRetryableWorkflowStep(
      this,
      operation,
    );
  }

  isCreateRearmDispatchPhase(operation) {
    return DISPATCH_REARM_EVIDENCE.isCreateRearmDispatchPhase(
      this,
      operation,
    );
  }

  isRemoveInitialDispatchPhase(operation) {
    return DISPATCH_REARM_EVIDENCE.isRemoveInitialDispatchPhase(operation);
  }

  isSafetyDeferredRetryableOperation(operation) {
    return DISPATCH_REARM_EVIDENCE.isSafetyDeferredRetryableOperation(
      this,
      operation,
    );
  }

  buildDispatchRearmFromProgressReconcileEvidence(
    operation,
    actualStatus,
    options = {},
  ) {
    return DISPATCH_REARM_EVIDENCE
      .buildDispatchRearmFromProgressReconcileEvidence(
        this,
        operation,
        actualStatus,
        options,
      );
  }

  resolveDispatchRearmFromProgressReconcileState(evidence) {
    return DISPATCH_REARM_EVIDENCE
      .resolveDispatchRearmFromProgressReconcileState(evidence);
  }

  shouldRearmDispatchFromProgressReconcile(
    operation,
    actualStatus,
    options = {},
  ) {
    return DISPATCH_REARM_EVIDENCE.shouldRearmDispatchFromProgressReconcile(
      this,
      operation,
      actualStatus,
      options,
    );
  }

  deferDispatchRetry(operation, errorLike) {
    return DISPATCH_REARM_EVIDENCE.deferDispatchRetry(
      this,
      operation,
      errorLike,
    );
  }

  async getDeferredDispatchRetryOperation(
    operationId,
    fallbackOperation = null,
  ) {
    return DISPATCH_REARM_EVIDENCE.getDeferredDispatchRetryOperation(
      this,
      operationId,
      fallbackOperation,
    );
  }

  resolveDeferredRetryVisibleOperation(
    visibilityObservation,
    fallbackOperation,
  ) {
    return DISPATCH_REARM_EVIDENCE.resolveDeferredRetryVisibleOperation(
      this,
      visibilityObservation,
      fallbackOperation,
    );
  }

  handleDeferredDispatchRetryFailure(operation, error) {
    return DISPATCH_REARM_EVIDENCE.handleDeferredDispatchRetryFailure(
      this,
      operation,
      error,
    );
  }

  scheduleDeferredSafetyRetry(operation, deferReason, errorMessage) {
    return DISPATCH_REARM_EVIDENCE.scheduleDeferredSafetyRetry(
      this,
      operation,
      deferReason,
      errorMessage,
    );
  }

  isOperationStepTimedOut(operation, now = Date.now()) {
    return DISPATCH_REARM_EVIDENCE.isOperationStepTimedOut(
      this,
      operation,
      now,
    );
  }

  isProtectedCreateDispatchRetryBudgetActive(operation, now = Date.now()) {
    return DISPATCH_REARM_EVIDENCE.isProtectedCreateDispatchRetryBudgetActive(
      this,
      operation,
      now,
    );
  }

  async resumeDeferredTransitionOperation(operationId) {
    return DISPATCH_REARM_EVIDENCE.resumeDeferredTransitionOperation(
      this,
      operationId,
    );
  }

  deferTransitionRetry(operationId, errorLike, context = {}) {
    return DISPATCH_REARM_EVIDENCE.deferTransitionRetry(
      this,
      operationId,
      errorLike,
      context,
    );
  }

  handleDeferredTransitionRetryFailure(operationId, error, context = {}) {
    return DISPATCH_REARM_EVIDENCE.handleDeferredTransitionRetryFailure(
      this,
      operationId,
      error,
      context,
    );
  }

  cloneOperationSnapshot(operation) {
    return DISPATCH_REARM_EVIDENCE.cloneOperationSnapshot(operation);
  }

  resolveCoordinatorCreatedOperationOwnerNodeId(operation) {
    return DISPATCH_REARM_EVIDENCE
      .resolveCoordinatorCreatedOperationOwnerNodeId(this, operation);
  }

  isCoordinatorCreatedOperationLocallyOwned(operation) {
    return DISPATCH_REARM_EVIDENCE.isCoordinatorCreatedOperationLocallyOwned(
      this,
      operation,
    );
  }

  buildCoordinatorCreatedDispatchIngress(nodeId) {
    return DISPATCH_REARM_EVIDENCE.buildCoordinatorCreatedDispatchIngress(
      nodeId,
    );
  }

  buildCoordinatorCreatedDispatchRow(operation) {
    return DISPATCH_REARM_EVIDENCE.buildCoordinatorCreatedDispatchRow(
      operation,
    );
  }

  shouldRetryCoordinatorCreatedRemoteHandoff(operation) {
    return DISPATCH_REARM_EVIDENCE
      .shouldRetryCoordinatorCreatedRemoteHandoff(this, operation);
  }

  buildCoordinatorCreatedRemoteHandoffTimeoutDecision(
    operation,
    now = Date.now(),
  ) {
    return DISPATCH_REARM_EVIDENCE
      .buildCoordinatorCreatedRemoteHandoffTimeoutDecision(
        this,
        operation,
        now,
      );
  }

  canContinueCoordinatorCreatedRemoteHandoff(operation, delayMs) {
    return DISPATCH_REARM_EVIDENCE
      .canContinueCoordinatorCreatedRemoteHandoff(
        this,
        operation,
        delayMs,
      );
  }

  scheduleCoordinatorCreatedRemoteHandoffFollowUp(
    operation,
    delayMs,
    options = {},
  ) {
    return DISPATCH_REARM_EVIDENCE
      .scheduleCoordinatorCreatedRemoteHandoffFollowUp(
        this,
        operation,
        delayMs,
        options,
      );
  }
}

export {OperationWorkflowOwnerRetryRegistry};
