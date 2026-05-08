import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
import {
  OPERATION_OWNER_RESUME_ACTION,
  OPERATION_OWNER_RETRY_ACTION,
  OPERATION_OWNER_RETRY_KIND,
  buildOperationOwnerResumeOutcome,
  buildOperationOwnerRetryOutcome,
} from './topology-owner-constants.js';

const {
  DISPATCH_RETRY_DELAY_MS,
  NUM,
  OPERATION_OWNER_ACTION,
  OPERATION_WORKFLOW_OWNER_LITERAL,
  OperationType,
  REBALANCE_COORDINATOR_ERROR_MSG,
  REBALANCE_COORDINATOR_LOG_MSG,
  REPLICA_OPERATION_DISPATCH_TIMEOUT_MS,
  ReplicaStatus,
  SAFETY_DEFERRED_RETRY_DELAY_MS,
  TIMEOUT_BUDGET_DEFAULT,
  TRANSITION_RETRY_DELAY_MS,
  TYPEOF,
  WORKFLOW_STEP,
  getControlPlaneRetryAfterMs,
  isPriorityControlPlanePartition,
  isRetryableControlPlaneError,
} = OPERATION_WORKFLOW_OWNER_SHARED;

const DISPATCH_REARM_RECONCILE_BLOCKING_STATUSES = Object.freeze(
  new Set([
    ReplicaStatus.PENDING,
    ReplicaStatus.CREATING,
    ReplicaStatus.SYNCING,
    ReplicaStatus.ACTIVE,
    ReplicaStatus.FAILED,
  ]),
);

const DISPATCH_REARM_RECONCILE_STATE = Object.freeze({
  OPERATION_UNAVAILABLE: 'operation_unavailable',
  CREATING_WITHOUT_CREATE_REARM: 'creating_without_create_rearm',
  OBSERVED_BLOCKING_STATUS: 'observed_blocking_status',
  NON_DISPATCH_RETRYABLE_STEP: 'non_dispatch_retryable_step',
  NON_CRITICAL_PARTITION: 'non_critical_partition',
  DISPATCH_REARM_BUDGET_EXHAUSTED: 'dispatch_rearm_budget_exhausted',
  REARM_DISPATCH: 'rearm_dispatch',
});

const DISPATCH_REARM_RECONCILE_STATE_TABLE = Object.freeze([
  Object.freeze({
    state: DISPATCH_REARM_RECONCILE_STATE.OPERATION_UNAVAILABLE,
    matches: (evidence) => evidence.operationAvailable !== true,
  }),
  Object.freeze({
    state: DISPATCH_REARM_RECONCILE_STATE.CREATING_WITHOUT_CREATE_REARM,
    matches: (evidence) =>
      evidence.observedCreatingWithoutCreateRearm === true,
  }),
  Object.freeze({
    state: DISPATCH_REARM_RECONCILE_STATE.OBSERVED_BLOCKING_STATUS,
    matches: (evidence) => evidence.observedBlockingStatus === true,
  }),
  Object.freeze({
    state: DISPATCH_REARM_RECONCILE_STATE.NON_DISPATCH_RETRYABLE_STEP,
    matches: (evidence) =>
      evidence.dispatchRetryableWorkflowStep !== true,
  }),
  Object.freeze({
    state: DISPATCH_REARM_RECONCILE_STATE.NON_CRITICAL_PARTITION,
    matches: (evidence) => evidence.criticalSystemPartition !== true,
  }),
  Object.freeze({
    state: DISPATCH_REARM_RECONCILE_STATE.DISPATCH_REARM_BUDGET_EXHAUSTED,
    matches: (evidence) => evidence.dispatchRearmBudgetAvailable !== true,
  }),
  Object.freeze({
    state: DISPATCH_REARM_RECONCILE_STATE.REARM_DISPATCH,
    matches: () => true,
  }),
]);

const DISPATCH_REARM_RECONCILE_ALLOWED_STATES = Object.freeze(
  new Set([DISPATCH_REARM_RECONCILE_STATE.REARM_DISPATCH]),
);

class OperationWorkflowOwnerSegment1 {
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
    this.transactionCoordinator = options.transactionCoordinator || null;
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
      typeof options.setTimeoutFn === TYPEOF.FUNCTION ?
        options.setTimeoutFn :
        setTimeout;
    this.clearTimeoutFn =
      typeof options.clearTimeoutFn === TYPEOF.FUNCTION ?
        options.clearTimeoutFn :
        clearTimeout;
    this.lastEmptyIncompleteOperationQueryAtMs = NUM.ZERO;
    this.incompleteOperationQueryEmptyBackoffMs =
      options.incompleteOperationQueryEmptyBackoffMs || NUM.ZERO;
    this.replicaOperationDispatchTimeoutMs =
      Number.isFinite(options.replicaOperationDispatchTimeoutMs) &&
      options.replicaOperationDispatchTimeoutMs > NUM.ZERO ?
        Math.floor(options.replicaOperationDispatchTimeoutMs) :
        REPLICA_OPERATION_DISPATCH_TIMEOUT_MS;
    this.safetyDeferredLogStateByOperationId = new Map();
    this.safetyDeferredRetryTimerByOperationId = new Map();
    this.observedProgressRetryTimerByOperationId = new Map();
    this.dispatchRetryTimerByOperationId = new Map();
    this.priorityActiveReplaceRetryTimerByOperationId = new Map();
    this.createdOperationHandoffRetryTimerByOperationId = new Map();
    this.transitionRetryTimerByOperationId = new Map();
    this.transitionRetryGraceDeadlineByOperationId = new Map();
    this.transitionRetryOperationSnapshotByOperationId = new Map();
    this.transitionExecutionAttemptByStepOwnerKey = new Map();

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
    for (const timerHandle of this.transitionRetryTimerByOperationId.values()) {
      this.clearTimeoutFn(timerHandle);
    }
    this.transitionRetryTimerByOperationId.clear();
    this.transitionRetryGraceDeadlineByOperationId.clear();
    this.transitionRetryOperationSnapshotByOperationId.clear();
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
      return;
    }
    this.clearTimeoutFn(timerHandle);
    this.createdOperationHandoffRetryTimerByOperationId.delete(operationId);
  }

  /**
   * @param {string} operationId
   */
  clearTransitionRetry(operationId) {
    const timerHandle = this.transitionRetryTimerByOperationId.get(operationId);
    this.transitionRetryOperationSnapshotByOperationId.delete(operationId);
    if (!timerHandle) {
      this.transitionRetryGraceDeadlineByOperationId.delete(operationId);
      return;
    }
    this.clearTimeoutFn(timerHandle);
    this.transitionRetryTimerByOperationId.delete(operationId);
    this.transitionRetryGraceDeadlineByOperationId.delete(operationId);
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
  recordTransitionRetryGrace(operationId, context = {}, delayMs = NUM.ZERO) {
    if (!operationId) {
      return;
    }
    const workflowStep =
      typeof context.workflowStep === TYPEOF.STRING &&
      context.workflowStep.length > NUM.ZERO ?
        context.workflowStep :
        WORKFLOW_STEP.PENDING;
    const partitionId = context.partitionId || null;
    const stepTimeout = this.getTimeoutForStep(
      workflowStep,
      partitionId ? {partitionId} : null,
    );
    const retryDelayMs =
      Number.isFinite(delayMs) && delayMs > NUM.ZERO ? delayMs : NUM.ZERO;
    const requestedGraceDeadlineMs = Date.now() + retryDelayMs;
    const durableProgressAtMs = Number.isFinite(context.updatedAt) ?
      context.updatedAt :
      Number.isFinite(context.createdAt) ?
        context.createdAt :
        null;
    const timeoutCeilingMs = this.resolveTransitionRetryGraceTimeoutCeilingMs(
      context,
      workflowStep,
      durableProgressAtMs,
      stepTimeout,
    );
    const graceDeadlineMs = Number.isFinite(timeoutCeilingMs) ?
      Math.min(timeoutCeilingMs, requestedGraceDeadlineMs) :
      requestedGraceDeadlineMs;
    const existingDeadlineMs = Number(
      this.transitionRetryGraceDeadlineByOperationId.get(operationId),
    );
    this.transitionRetryGraceDeadlineByOperationId.set(
      operationId,
      Number.isFinite(timeoutCeilingMs) && Number.isFinite(existingDeadlineMs) ?
        Math.min(
          timeoutCeilingMs,
          Math.max(existingDeadlineMs, graceDeadlineMs),
        ) :
        Number.isFinite(existingDeadlineMs) ?
          Math.max(existingDeadlineMs, graceDeadlineMs) :
          graceDeadlineMs,
    );
  }

  /**
   * Critical dispatch/remove-dispatch retries may stay explicitly deferred
   * under control-plane pressure until the enclosing rebalance budget is
   * exhausted. Create-rearm retries still use the stricter step timeout
   * ceiling because they model stalled target provisioning, not dispatch
   * pressure.
   *
   * @param {Object} context
   * @param {string} workflowStep
   * @param {number|null} durableProgressAtMs
   * @param {number} stepTimeout
   * @return {number|null}
   * @private
   */
  resolveTransitionRetryGraceTimeoutCeilingMs(
    context,
    workflowStep,
    durableProgressAtMs,
    stepTimeout,
  ) {
    if (!Number.isFinite(durableProgressAtMs)) {
      return null;
    }
    if (
      !this.shouldUseOperationBudgetTransitionRetryGrace(context, workflowStep)
    ) {
      return durableProgressAtMs + stepTimeout;
    }

    const operationStartedAtMs = Number.isFinite(context.createdAt) ?
      context.createdAt :
      durableProgressAtMs;
    return (
      operationStartedAtMs +
      TIMEOUT_BUDGET_DEFAULT.REBALANCE_OPERATION_BUDGET_MS
    );
  }

  /**
   * Retryable control-plane pressure on critical dispatch/remove-dispatch
   * workflow steps should spend the overall rebalance budget instead of
   * expiring at the stale step timestamp.
   *
   * @param {Object} context
   * @param {string} workflowStep
   * @return {boolean}
   * @private
   */
  shouldUseOperationBudgetTransitionRetryGrace(context, workflowStep) {
    const partitionId =
      typeof context?.partitionId === TYPEOF.STRING &&
      context.partitionId.length > NUM.ZERO ?
        context.partitionId :
        null;
    if (!this.isCriticalSystemPartition(partitionId)) {
      return false;
    }
    if (workflowStep === WORKFLOW_STEP.CREATING) {
      return false;
    }
    return (
      workflowStep === WORKFLOW_STEP.PENDING ||
      workflowStep === WORKFLOW_STEP.SENDING ||
      workflowStep === WORKFLOW_STEP.ACTIVE ||
      workflowStep === WORKFLOW_STEP.STOPPING
    );
  }

  /**
   * @param {string|null} operationId
   * @param {number} [now=Date.now()]
   * @return {boolean}
   * @private
   */
  hasActiveTransitionRetryGrace(operationId, now = Date.now()) {
    if (!operationId) {
      return false;
    }
    const deadlineMs = Number(
      this.transitionRetryGraceDeadlineByOperationId.get(operationId),
    );
    if (!Number.isFinite(deadlineMs)) {
      return false;
    }
    if (deadlineMs <= now) {
      this.transitionRetryGraceDeadlineByOperationId.delete(operationId);
      return false;
    }
    return true;
  }

  /**
   * Critical system-partition recovery must not fail terminally on transient
   * control-plane dispatch pressure. Keep the same operation alive and retry
   * through the owner lane instead of churning new failed rows.
   *
   * @param {Object} operation
   * @param {Error|Object} errorLike
   * @return {boolean}
   * @private
   */
  shouldDeferRetryableDispatchFailure(operation, errorLike) {
    if (!operation || !isRetryableControlPlaneError(errorLike)) {
      return false;
    }
    return this.isCriticalSystemPartition(operation.partitionId);
  }

  /**
   * @param {Object} operation
   * @return {boolean}
   * @private
   */
  isDispatchRetryableWorkflowStep(operation) {
    if (!operation) {
      return false;
    }
    const workflowStep = operation.workflowStep;
    if (this.repository.isReplaceRemoveDispatchPhase(operation)) {
      return (
        workflowStep === WORKFLOW_STEP.ACTIVE ||
        workflowStep === WORKFLOW_STEP.STOPPING
      );
    }
    if (
      operation.type === OperationType.REMOVE &&
      workflowStep === WORKFLOW_STEP.STOPPING
    ) {
      return true;
    }
    if (this.isCreateRearmDispatchPhase(operation)) {
      return true;
    }
    return (
      workflowStep === WORKFLOW_STEP.PENDING ||
      workflowStep === WORKFLOW_STEP.SENDING
    );
  }

  /**
   * Critical add-side create dispatch must be replayable from CREATING when
   * durable state still lacks any observed target visibility.
   *
   * @param {Object} operation
   * @return {boolean}
   * @private
   */
  isCreateRearmDispatchPhase(operation) {
    if (!operation || !this.isCriticalSystemPartition(operation.partitionId)) {
      return false;
    }
    if (operation.workflowStep !== WORKFLOW_STEP.CREATING) {
      return false;
    }
    if (this.repository.isReplaceRemoveDispatchPhase(operation)) {
      return false;
    }
    return (
      operation.type === OperationType.ADD ||
      operation.type === OperationType.REPLACE
    );
  }

  /**
   * @param {Object} operation
   * @return {boolean}
   * @private
   */
  isRemoveInitialDispatchPhase(operation) {
    return (
      operation?.type === OperationType.REMOVE &&
      (operation?.workflowStep === WORKFLOW_STEP.PENDING ||
        operation?.workflowStep === WORKFLOW_STEP.SENDING)
    );
  }

  /**
   * @param {Object} operation
   * @return {boolean}
   * @private
   */
  isSafetyDeferredRetryableOperation(operation) {
    if (!operation) {
      return false;
    }
    return (
      this.isRemoveInitialDispatchPhase(operation) ||
      this.repository.isReplaceRemoveDispatchPhase(operation)
    );
  }

  /**
   * Critical control-plane operations must not rely only on timeout expiry to
   * retry first-hop dispatch progression. When observed replica status is
   * still absent in the initial dispatch or critical create-rearm phases,
   * proactively re-arm dispatch through the canonical owner path.
   *
   * @param {Object} operation
   * @param {string|null} actualStatus
   * @param {Object} [options={}]
   * @return {Object}
   * @private
   */
  buildDispatchRearmFromProgressReconcileEvidence(
    operation,
    actualStatus,
    options = {},
  ) {
    const now = Number.isFinite(options.now) ? options.now : Date.now();
    const normalizedActualStatus =
      typeof actualStatus === TYPEOF.STRING ?
        actualStatus.toLowerCase() :
        actualStatus;
    const createRearmPhase = this.isCreateRearmDispatchPhase(operation);
    const timeoutDecision =
      this.buildCoordinatorCreatedRemoteHandoffTimeoutDecision(operation, now);

    return Object.freeze({
      operationAvailable: Boolean(operation),
      observedCreatingWithoutCreateRearm:
        normalizedActualStatus === ReplicaStatus.CREATING &&
        !createRearmPhase,
      observedBlockingStatus:
        !(
          normalizedActualStatus === ReplicaStatus.PENDING &&
          operation?.workflowStep === WORKFLOW_STEP.PENDING
        ) &&
        DISPATCH_REARM_RECONCILE_BLOCKING_STATUSES.has(
          normalizedActualStatus,
        ),
      dispatchRetryableWorkflowStep:
        this.isDispatchRetryableWorkflowStep(operation),
      criticalSystemPartition:
        this.isCriticalSystemPartition(operation?.partitionId || null),
      dispatchRearmBudgetAvailable:
        timeoutDecision.stepTimedOut !== true ||
        timeoutDecision.operationBudgetActive === true,
    });
  }

  /**
   * @param {Object} evidence
   * @return {string}
   * @private
   */
  resolveDispatchRearmFromProgressReconcileState(evidence) {
    return (
      DISPATCH_REARM_RECONCILE_STATE_TABLE.find((entry) =>
        entry.matches(evidence),
      )?.state ||
      DISPATCH_REARM_RECONCILE_STATE.DISPATCH_REARM_BUDGET_EXHAUSTED
    );
  }

  /**
   * @param {Object} operation
   * @param {string|null} actualStatus
   * @param {Object} [options={}]
   * @return {boolean}
   * @private
   */
  shouldRearmDispatchFromProgressReconcile(
    operation,
    actualStatus,
    options = {},
  ) {
    const evidence = this.buildDispatchRearmFromProgressReconcileEvidence(
      operation,
      actualStatus,
      options,
    );
    const state =
      this.resolveDispatchRearmFromProgressReconcileState(evidence);
    return DISPATCH_REARM_RECONCILE_ALLOWED_STATES.has(state);
  }

  /**
   * @param {Object} operation
   * @param {Error|Object} errorLike
   * @return {boolean}
   * @private
   */
  deferDispatchRetry(operation, errorLike) {
    const operationId = operation?.operationId || null;
    const retryAfterMs = getControlPlaneRetryAfterMs(errorLike);
    const retryOutcome = buildOperationOwnerRetryOutcome({
      operationId,
      retryable: this.shouldDeferRetryableDispatchFailure(
        operation,
        errorLike,
      ),
      timerActive: this.dispatchRetryTimerByOperationId.has(operationId),
      retryAfterMs,
      fallbackDelayMs: DISPATCH_RETRY_DELAY_MS,
      retryKind: OPERATION_OWNER_RETRY_KIND.DISPATCH,
    });
    if (retryOutcome.action === OPERATION_OWNER_RETRY_ACTION.REJECT) {
      return false;
    }
    if (retryOutcome.action === OPERATION_OWNER_RETRY_ACTION.REUSE_TIMER) {
      return true;
    }
    const delayMs = retryOutcome.delayMs;
    const errorMessage = this.normalizeErrorMessage(
      errorLike,
      REBALANCE_COORDINATOR_ERROR_MSG.MESSAGE_NOT_ACKED,
    );

    this.logger.warn(
      REBALANCE_COORDINATOR_LOG_MSG.OPERATION_DISPATCH_RETRY_DEFERRED,
      {
        operationId,
        partitionId: operation.partitionId,
        targetNodeId: operation.targetNodeId,
        workflowStep: operation.workflowStep,
        delayMs,
        errorMessage,
      },
    );

    const timerHandle = this.setTimeoutFn(() => {
      this.dispatchRetryTimerByOperationId.delete(operationId);
      if (this.isShuttingDown || !this.isInitialized) {
        return;
      }
      return this.operationWorkflowRunExclusive(
        this.getOperationOwnerSingleFlightKey(operationId),
        async () => {
          const currentOperation =
            await this.getDeferredDispatchRetryOperation(
              operationId,
              operation,
            );
          if (
            !currentOperation ||
            this.repository.isOperationTerminal(currentOperation) ||
            !this.repository.isOperationLocallyOwned(currentOperation) ||
            !this.isDispatchRetryableWorkflowStep(currentOperation)
          ) {
            return;
          }
          await this.runOperationOwnerAction(
            OPERATION_OWNER_ACTION.DISPATCH,
            currentOperation,
            {
              boundary: 'dispatch_retry',
              workflowStep: currentOperation.workflowStep || null,
              partitionId: currentOperation.partitionId || null,
              runInlineWhenOwnerLaneHeld: true,
            },
          );
        },
      ).catch((retryError) => {
        this.handleDeferredDispatchRetryFailure(operation, retryError);
      });
    }, delayMs);
    this.dispatchRetryTimerByOperationId.set(operationId, timerHandle);
    return true;
  }

  /**
   * Deferred dispatch retries must tolerate cache-lagged reads after durable
   * replica_operations writes. Prefer the authoritative owner row before
   * falling back to the lighter query path so retry timers cannot silently
   * abandon freshly persisted PENDING operations.
   *
   * @param {string} operationId
   * @param {Object|null} [fallbackOperation=null]
   * @return {Promise<Object|null>}
   * @private
   */
  async getDeferredDispatchRetryOperation(
    operationId,
    fallbackOperation = null,
  ) {
    const visibilityObservation =
      await this.repository.getOperationByIdVisibilityObservation(operationId, {
        requireOwnerRpcRead: false,
        allowPriorityRecoveryDeferredVisibility: true,
      });
    return this.resolveDeferredRetryVisibleOperation(
      visibilityObservation,
      fallbackOperation,
    );
  }

  /**
   * @param {Object|null} visibilityObservation
   * @param {Object|null} fallbackOperation
   * @return {Object|null}
   * @private
   */
  resolveDeferredRetryVisibleOperation(
    visibilityObservation,
    fallbackOperation,
  ) {
    if (visibilityObservation?.operation) {
      return visibilityObservation.operation;
    }
    if (visibilityObservation?.deferredOutcome && fallbackOperation) {
      return this.cloneOperationSnapshot(fallbackOperation);
    }
    return null;
  }

  /**
   * @param {Object} operation
   * @param {Error|Object} error
   */
  handleDeferredDispatchRetryFailure(operation, error) {
    if (this.deferDispatchRetry(operation, error)) {
      return;
    }
    if (
      this.deferTransitionRetry(operation?.operationId || null, error, {
        boundary: OPERATION_WORKFLOW_OWNER_LITERAL.DISPATCH_RETRY,
        partitionId: operation?.partitionId || null,
        workflowStep: operation?.workflowStep || null,
        updatedAt: operation?.updatedAt,
        createdAt: operation?.createdAt,
      })
    ) {
      return;
    }
    this.logger.error(
      REBALANCE_COORDINATOR_LOG_MSG.OPERATION_DISPATCH_RETRY_FAILED,
      {
        operationId: operation?.operationId || null,
        partitionId: operation?.partitionId || null,
        workflowStep: operation?.workflowStep || null,
        error: error?.message || error?.error || String(error),
      },
    );
  }

  /**
   * Re-enter remove-like operations that were deferred by safety policy.
   * Safety blockers are transient cluster state, not terminal workflow faults.
   *
   * @param {Object} operation
   * @param {string} deferReason
   * @param {string} errorMessage
   * @return {boolean}
   * @private
   */
  scheduleDeferredSafetyRetry(operation, deferReason, errorMessage) {
    const operationId = operation?.operationId || null;
    if (!operationId || !this.isSafetyDeferredRetryableOperation(operation)) {
      return false;
    }
    if (this.safetyDeferredRetryTimerByOperationId.has(operationId)) {
      return true;
    }

    this.logger.info(
      REBALANCE_COORDINATOR_LOG_MSG.OPERATION_DISPATCH_RETRY_DEFERRED,
      {
        operationId,
        partitionId: operation.partitionId,
        targetNodeId: operation.targetNodeId,
        workflowStep: operation.workflowStep,
        delayMs: SAFETY_DEFERRED_RETRY_DELAY_MS,
        deferReason,
        errorMessage,
      },
    );

    const timerHandle = this.setTimeoutFn(() => {
      this.safetyDeferredRetryTimerByOperationId.delete(operationId);
      if (this.isShuttingDown || !this.isInitialized) {
        return;
      }
      return this.operationWorkflowRunExclusive(
        this.getOperationOwnerSingleFlightKey(operationId),
        async () => {
          const visibilityObservation =
            await this.repository.getOperationByIdVisibilityObservation(
              operationId,
              {
                requireOwnerRpcRead: false,
                allowPriorityRecoveryDeferredVisibility: true,
              },
            );
          const currentOperation = this.resolveDeferredRetryVisibleOperation(
            visibilityObservation,
            operation,
          );
          if (
            !currentOperation ||
            this.repository.isOperationTerminal(currentOperation) ||
            !this.repository.isOperationLocallyOwned(currentOperation) ||
            !this.isSafetyDeferredRetryableOperation(currentOperation)
          ) {
            return;
          }
          await this.runOperationOwnerAction(
            OPERATION_OWNER_ACTION.EXECUTE,
            currentOperation,
            {
              boundary: 'safety_retry',
              workflowStep: currentOperation.workflowStep || null,
              partitionId: currentOperation.partitionId || null,
              runInlineWhenOwnerLaneHeld: true,
            },
          );
        },
      ).catch((retryError) => {
        if (
          this.deferTransitionRetry(operationId, retryError, {
            boundary: 'safety_retry',
            partitionId: operation?.partitionId || null,
            workflowStep: operation?.workflowStep || null,
            updatedAt: operation?.updatedAt,
            createdAt: operation?.createdAt,
            operationSnapshot: operation,
          })
        ) {
          return;
        }
        this.logger.error(
          REBALANCE_COORDINATOR_LOG_MSG.OPERATION_DISPATCH_RETRY_FAILED,
          {
            operationId,
            partitionId: operation?.partitionId || null,
            workflowStep: operation?.workflowStep || null,
            deferReason,
            error:
              retryError?.message || retryError?.error || String(retryError),
          },
        );
      });
    }, SAFETY_DEFERRED_RETRY_DELAY_MS);
    this.safetyDeferredRetryTimerByOperationId.set(operationId, timerHandle);
    return true;
  }

  /**
   * @param {Object} operation
   * @param {number} [now=Date.now()]
   * @return {boolean}
   * @private
   */
  isOperationStepTimedOut(operation, now = Date.now()) {
    if (!operation) {
      return false;
    }
    if (this.hasActiveTransitionRetryGrace(operation.operationId, now)) {
      return false;
    }
    const updatedAt = Number(operation.updatedAt);
    if (!Number.isFinite(updatedAt)) {
      return false;
    }
    return (
      now - updatedAt >=
      this.getTimeoutForStep(operation.workflowStep, operation)
    );
  }

  /**
   * Resume one operation through the canonical owner path after a deferred
   * retryable transition failure.
   * @param {string} operationId
   * @return {Promise<void>}
   * @private
   */
  async resumeDeferredTransitionOperation(operationId) {
    const visibilityObservation =
      await this.repository.getOperationByIdVisibilityObservation(operationId, {
        requireOwnerRpcRead: false,
        allowPriorityRecoveryDeferredVisibility: true,
      });
    const operation =
      visibilityObservation?.operation ||
      this.getTransitionRetryOperationSnapshot(operationId);
    const now = Date.now();
    const resumeOutcome = buildOperationOwnerResumeOutcome({
      operationAvailable: Boolean(operation),
      terminalOperation: operation ?
        this.repository.isOperationTerminal(operation) :
        false,
      locallyOwned: operation ?
        this.repository.isOperationLocallyOwned(operation) :
        false,
      dispatchRetryable: operation ?
        this.isDispatchRetryableWorkflowStep(operation) :
        false,
      retryGraceActive: this.hasActiveTransitionRetryGrace(operationId, now),
      stepTimedOut: operation ?
        this.isOperationStepTimedOut(operation, now) :
        false,
    });
    if (resumeOutcome.action === OPERATION_OWNER_RESUME_ACTION.CLEAR_RETRY) {
      this.clearTransitionRetry(operationId);
      return;
    }

    if (resumeOutcome.action === OPERATION_OWNER_RESUME_ACTION.DISPATCH) {
      await this.runOperationOwnerAction(
        OPERATION_OWNER_ACTION.DISPATCH,
        operation,
        {
          boundary: OPERATION_WORKFLOW_OWNER_LITERAL.TRANSITION_RETRY_RESUME,
          workflowStep: operation.workflowStep || null,
          partitionId: operation.partitionId || null,
          runInlineWhenOwnerLaneHeld: true,
        },
      );
      return;
    }
    await this.reconcileTimeoutOperation(operation, now);
  }

  /**
   * @param {string|null} operationId
   * @param {Error|Object} errorLike
   * @param {Object} [context]
   * @return {boolean}
   * @private
   */
  deferTransitionRetry(operationId, errorLike, context = {}) {
    const retryAfterMs = getControlPlaneRetryAfterMs(errorLike);
    const retryOutcome = buildOperationOwnerRetryOutcome({
      operationId,
      retryable: isRetryableControlPlaneError(errorLike),
      timerActive: this.transitionRetryTimerByOperationId.has(operationId),
      retryAfterMs,
      fallbackDelayMs: TRANSITION_RETRY_DELAY_MS,
      retryKind: OPERATION_OWNER_RETRY_KIND.TRANSITION,
    });
    if (retryOutcome.action === OPERATION_OWNER_RETRY_ACTION.REJECT) {
      return false;
    }
    this.recordTransitionRetryOperationSnapshot(
      context.operationSnapshot || context.operation || null,
    );
    const delayMs = retryOutcome.delayMs;
    this.recordTransitionRetryGrace(operationId, context, delayMs);
    if (retryOutcome.action === OPERATION_OWNER_RETRY_ACTION.REUSE_TIMER) {
      return true;
    }
    const errorMessage = this.normalizeErrorMessage(
      errorLike,
      'Retryable control-plane transition failure',
    );

    this.logger.warn(
      REBALANCE_COORDINATOR_LOG_MSG.OPERATION_TRANSITION_RETRY_DEFERRED,
      {
        operationId,
        boundary: context.boundary || null,
        partitionId: context.partitionId || null,
        workflowStep: context.workflowStep || null,
        delayMs,
        errorMessage,
      },
    );

    const timerHandle = this.setTimeoutFn(() => {
      this.transitionRetryTimerByOperationId.delete(operationId);
      if (this.isShuttingDown || !this.isInitialized) {
        return;
      }
      return this.operationWorkflowRunExclusive(
        this.getOperationOwnerSingleFlightKey(operationId),
        () => this.resumeDeferredTransitionOperation(operationId),
      ).catch((retryError) => {
        this.handleDeferredTransitionRetryFailure(
          operationId,
          retryError,
          context,
        );
      });
    }, delayMs);
    this.transitionRetryTimerByOperationId.set(operationId, timerHandle);
    return true;
  }

  /**
   * @param {string|null} operationId
   * @param {Error|Object} error
   * @param {Object} [context]
   */
  handleDeferredTransitionRetryFailure(operationId, error, context = {}) {
    if (this.deferTransitionRetry(operationId, error, context)) {
      return;
    }
    this.logger.error(
      REBALANCE_COORDINATOR_LOG_MSG.OPERATION_TRANSITION_RETRY_FAILED,
      {
        operationId,
        boundary: context.boundary || null,
        partitionId: context.partitionId || null,
        workflowStep: context.workflowStep || null,
        error: error?.message || error?.error || String(error),
      },
    );
  }

  /**
   * Clone one operation snapshot so owner-side priming can reconcile against
   * the created record without mutating the caller's inserted snapshot.
   * @param {Object|null} operation
   * @return {Object|null}
   * @private
   */
  cloneOperationSnapshot(operation) {
    if (!operation || typeof operation !== TYPEOF.OBJECT) {
      return null;
    }
    return {
      ...operation,
      stepsHistory: Array.isArray(operation.stepsHistory) ?
        [...operation.stepsHistory] :
        [],
    };
  }

  /**
   * @param {Object|null} operation
   * @return {string|null}
   * @private
   */
  resolveCoordinatorCreatedOperationOwnerNodeId(operation) {
    if (
      !operation ||
      typeof this.repository?.resolveOperationOwnerNodeId !== TYPEOF.FUNCTION
    ) {
      return null;
    }
    return this.repository.resolveOperationOwnerNodeId(operation);
  }

  /**
   * @param {Object|null} operation
   * @return {boolean}
   * @private
   */
  isCoordinatorCreatedOperationLocallyOwned(operation) {
    const ownerNodeId =
      this.resolveCoordinatorCreatedOperationOwnerNodeId(operation);
    return (
      typeof ownerNodeId === TYPEOF.STRING &&
      ownerNodeId.length > NUM.ZERO &&
      ownerNodeId === this.nodeId
    );
  }

  /**
   * @param {string|null} nodeId
   * @return {string|null}
   * @private
   */
  buildCoordinatorCreatedDispatchIngress(nodeId) {
    const normalizedNodeId = String(nodeId || '').trim();
    if (normalizedNodeId.length === NUM.ZERO) {
      return null;
    }
    return `${normalizedNodeId}/service/replica-dispatch`;
  }

  /**
   * @param {Object|null} operation
   * @return {Object}
   * @private
   */
  buildCoordinatorCreatedDispatchRow(operation) {
    let stepsHistory = operation?.stepsHistory;
    if (typeof stepsHistory !== TYPEOF.STRING) {
      stepsHistory = Array.isArray(stepsHistory) ?
        JSON.stringify(stepsHistory) :
        OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_JSON_ARRAY;
    }

    return {
      operation_id: operation?.operationId || null,
      type: operation?.type || null,
      partition_id: operation?.partitionId || null,
      replica_id: operation?.replicaId,
      source_node_id: operation?.sourceNodeId,
      target_node_id: operation?.targetNodeId,
      status: operation?.status,
      workflow_step: operation?.workflowStep || null,
      created_at: operation?.createdAt,
      updated_at: operation?.updatedAt,
      completed_at: operation?.completedAt,
      error_message: operation?.errorMessage,
      steps_history: stepsHistory,
      entity_type: operation?.entityType,
      entity_id: operation?.entityId,
    };
  }

  /**
   * @param {Object|null} operation
   * @return {boolean}
   * @private
   */
  shouldRetryCoordinatorCreatedRemoteHandoff(operation) {
    const partitionId = operation?.partitionId || null;
    return (
      this.isCriticalSystemPartition(partitionId) ||
      isPriorityControlPlanePartition({partitionId})
    );
  }

  /**
   * @param {Object|null} operation
   * @param {number} [now=Date.now()]
   * @return {Object}
   * @private
   */
  buildCoordinatorCreatedRemoteHandoffTimeoutDecision(
    operation,
    now = Date.now(),
  ) {
    const workflowStep = operation?.workflowStep || WORKFLOW_STEP.PENDING;
    const stepTimedOut =
      this.isDispatchRetryableWorkflowStep(operation) &&
      this.isOperationStepTimedOut(operation, now);
    const operationStartedAtMs = Number.isFinite(operation?.createdAt) ?
      operation.createdAt :
      Number.isFinite(operation?.updatedAt) ?
        operation.updatedAt :
        null;
    const usesOperationBudget =
      this.shouldUseOperationBudgetTransitionRetryGrace(
        {
          partitionId: operation?.partitionId || null,
          workflowStep,
          updatedAt: operation?.updatedAt,
          createdAt: operation?.createdAt,
        },
        workflowStep,
      );
    const operationBudgetDeadlineMs =
      Number.isFinite(operationStartedAtMs) ?
        operationStartedAtMs +
          TIMEOUT_BUDGET_DEFAULT.REBALANCE_OPERATION_BUDGET_MS :
        null;
    const operationBudgetActive =
      usesOperationBudget &&
      Number.isFinite(operationBudgetDeadlineMs) &&
      now < operationBudgetDeadlineMs;

    return Object.freeze({
      shouldStop: stepTimedOut && !operationBudgetActive,
      stepTimedOut,
      operationBudgetActive,
      operationBudgetDeadlineMs,
      workflowStep,
    });
  }

  /**
   * @param {Object|null} operation
   * @param {number} delayMs
   * @return {boolean}
   * @private
   */
  canContinueCoordinatorCreatedRemoteHandoff(operation, delayMs) {
    const operationId = operation?.operationId || null;
    if (!operationId) {
      return false;
    }
    this.recordTransitionRetryGrace(
      operationId,
      {
        boundary:
          OPERATION_WORKFLOW_OWNER_LITERAL.COORDINATOR_CREATED_REMOTE_HANDOFF,
        partitionId: operation?.partitionId,
        workflowStep: operation?.workflowStep,
        updatedAt: operation?.updatedAt,
        createdAt: operation?.createdAt,
      },
      delayMs,
    );
    return this.hasActiveTransitionRetryGrace(operationId);
  }

  /**
   * @param {Object|null} operation
   * @param {number} delayMs
   * @param {Object} [options={}]
   * @param {boolean} [options.replaceExisting]
   * @return {boolean}
   * @private
   */
  scheduleCoordinatorCreatedRemoteHandoffFollowUp(
    operation,
    delayMs,
    options = {},
  ) {
    const operationId = operation?.operationId || null;
    if (
      !operationId ||
      !this.shouldRetryCoordinatorCreatedRemoteHandoff(operation) ||
      !this.canContinueCoordinatorCreatedRemoteHandoff(operation, delayMs)
    ) {
      return false;
    }

    const replaceExisting = options.replaceExisting === true;
    if (this.createdOperationHandoffRetryTimerByOperationId.has(operationId)) {
      if (!replaceExisting) {
        return true;
      }
      this.clearCreatedOperationHandoffRetry(operationId);
    }

    const operationSnapshot = this.cloneOperationSnapshot(operation) || {
      operationId,
    };
    const timerHandle = this.setTimeoutFn(() => {
      this.createdOperationHandoffRetryTimerByOperationId.delete(operationId);
      if (this.isShuttingDown) {
        return;
      }
      return this.operationWorkflowRunExclusive(
        this.getOperationOwnerSingleFlightKey(operationId),
        () => this.armCoordinatorCreatedOperation(operationSnapshot),
      ).catch((retryError) => {
        this.handleDeferredCoordinatorCreatedRemoteHandoffRetryFailure(
          operationSnapshot,
          retryError,
        );
      });
    }, delayMs);
    this.createdOperationHandoffRetryTimerByOperationId.set(
      operationId,
      timerHandle,
    );
    return true;
  }
}

export {OperationWorkflowOwnerSegment1};
