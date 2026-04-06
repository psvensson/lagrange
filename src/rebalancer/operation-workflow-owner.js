/**
 * OperationWorkflowOwner — single-flight owner keys, transition/claim
 * progression, and observed-progress reconciliation entry.
 *
 * Extracted from RebalanceCoordinator per D7.1 / Requirement 6.2.
 * The coordinator facade delegates workflow progression to this owner.
 */

import {
  ControlPlaneReadinessService,
} from '../control-plane/control-plane-readiness-service.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../control-plane/control-plane-readiness-constants.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {
  isPriorityControlPlanePartition,
  isSystemTablePartition,
} from '../bootstrap/system-partition-classification.js';
import {
  WORKFLOW_STEP, NUM, TIME_MS, METRICS_LOG_TAG,
  TYPEOF, UNIFIED_SERVICE_TYPE,
} from '../constants/index.js';
import {SERVICE_TYPE} from '../constants/service.js';
import {
  TIMEOUT_BUDGET_CLASSIFICATION,
  TIMEOUT_BUDGET_DEFAULT,
  buildTimeoutClassification,
  createChildTimeoutBudget,
  createTopLevelOperationBudget,
} from '../control-plane/timeout-budget.js';
import {
  OPERATION_METADATA_KEY,
  ReplicaStatus,
  WORKFLOW_STEP_TO_STATUS,
  OperationType,
  isCoordinatorOwnedOperationType,
} from './replica-status.js';
import {
  ReplicaOperationMessageType,
  ReplicaOperationField,
  ReplicaOperationResponseStatus,
} from './replica-operation-constants.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {
  REBALANCE_COORDINATOR_ERROR_MSG,
  REBALANCE_COORDINATOR_EVENT,
  REBALANCE_COORDINATOR_LOG_MSG,
  REBALANCE_COORDINATOR_DEFER_REASON,
  REBALANCER_SKIP_REASON,
  OPERATION_TRANSITION_REASON,
} from './rebalancer-constants.js';
import {
  EXECUTOR_OUTCOME_FIELD,
  EXECUTOR_OUTCOME_ACTION,
  EXECUTOR_OUTCOME_ACTION_MAP,
} from './executor-outcome-constants.js';
import {
  SQL_RECONCILIATION_REASON,
} from '../control-plane/read-model-contract.js';

const DEFAULT_MIN_REPLICA_COUNT = NUM.THREE;

const FAILURE_LOG_LEVEL = Object.freeze({
  ERROR: 'error',
  WARN: 'warn',
});

const OPERATION_SINGLE_FLIGHT_SCOPE = Object.freeze({
  CREATE: 'create',
  CREATE_BUDGET: 'create-budget',
  OPERATION: 'operation',
});

const OPERATION_SINGLE_FLIGHT_KEY_SEPARATOR = ':';

const OPERATION_HANDLER = Object.freeze({
  [SERVICE_TYPE.PARTITION]: 'replica-handler',
  [SERVICE_TYPE.MESSAGE_GROUP]: 'message-group-handler',
  [UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE]: 'runtime-service-handler',
});

const OBSERVED_PROGRESS_RELEVANT_SERVICE_STATUSES = Object.freeze(
  new Set([
    ReplicaStatus.SYNCING,
    ReplicaStatus.ACTIVE,
    ReplicaStatus.FAILED,
  ]),
);

const OBSERVED_PROGRESS_RELEVANT_WORKFLOW_STEPS = Object.freeze(
  new Set([
    WORKFLOW_STEP.PENDING,
    WORKFLOW_STEP.SENDING,
    WORKFLOW_STEP.CREATING,
    WORKFLOW_STEP.SYNCING,
    WORKFLOW_STEP.STOPPING,
  ]),
);

const SAFETY_DEFERRED_LOG_THROTTLE_MS =
  TIME_MS.SECOND * NUM.FIVE;

const TRANSITION_STEP_OPTIONS = Object.freeze({
  DEFER_COMMITTED_MARK: Object.freeze({
    markCommitted: false,
  }),
});

const OPERATION_TRANSITION_SESSION_ATTEMPT_PREFIX = 'attempt';
const PRIORITY_CONTROL_PLANE_SYNCING_TIMEOUT_CAP_MS =
  TIME_MS.MINUTE * NUM.TWO;


/**
 * Owns single-flight owner-key execution, workflow step advancement,
 * claim/dispatch progression, and observed-progress reconciliation.
 *
 * Dependencies are injected by the coordinator facade at construction.
 */
class OperationWorkflowOwner {
  /**
   * @param {Object} options
   * @param {Object} options.repository - ReplicaOperationRepository.
   * @param {Object} options.operationLane - OperationLane instance.
   * @param {Object} options.operationWorkflowCoordinator -
   *   DurableWorkflowCoordinator.
   * @param {Object} options.controlPlaneReadinessService -
   *   ControlPlaneReadinessService.
   * @param {Object} options.messageRouter - MessageRouter.
   * @param {Object} options.tablePolicyService - TablePolicyService.
   * @param {Object} options.transactionCoordinator -
   *   DistributedTransactionCoordinator.
   * @param {Object} options.logger - Logger instance.
   * @param {Object} options.emitter - EventEmitter (coordinator facade).
   * @param {Object} options.config - Timeout/budget configuration.
   * @param {string} options.nodeId - Local node ID.
   * @param {Object} options.stats - Shared stats counters.
   * @param {Function} options.isShuttingDown - Shutdown predicate.
   * @param {Function} options.isInitialized - Initialization predicate.
   * @param {Function} options.releaseReservationForOperation -
   *   Reservation release callback.
 * @param {Function} options.reconcileReservations -
 *   Reservation reconciliation callback.
 * @param {Function} options.allocateCanonicalReplicaId -
 *   Replica ID allocation callback.
 * @param {Function} options.getActualReplicaStatus -
 *   Authoritative replica status read callback.
  */
  constructor(options) {
    this.repository = options.repository;
    this.operationLane = options.operationLane;
    this.operationWorkflowCoordinator =
      options.operationWorkflowCoordinator;
    this.operationWorkflowRunExclusive =
      this.operationLane.run.bind(this.operationLane);
    this.controlPlaneReadinessService =
      options.controlPlaneReadinessService;
    this.messageRouter = options.messageRouter;
    this.tablePolicyService = options.tablePolicyService;
    this.transactionCoordinator =
      options.transactionCoordinator || null;
    this.logger = options.logger;
    this.emitter = options.emitter;
    this.config = options.config;
    this.nodeId = options.nodeId;
    this.stats = options.stats;
    this._isShuttingDown = options.isShuttingDown;
    this._isInitialized = options.isInitialized;
    this.releaseReservationForOperation =
      options.releaseReservationForOperation;
    this.reconcileReservations =
      options.reconcileReservations;
    this.allocateCanonicalReplicaId =
      options.allocateCanonicalReplicaId;
    this.getActualReplicaStatus =
      options.getActualReplicaStatus;
    this.lastEmptyIncompleteOperationQueryAtMs = NUM.ZERO;
    this.incompleteOperationQueryEmptyBackoffMs =
      options.incompleteOperationQueryEmptyBackoffMs || NUM.ZERO;
    this.safetyDeferredLogStateByOperationId =
      new Map();
    this.transitionExecutionAttemptByStepOwnerKey =
      new Map();

    if (typeof this.getActualReplicaStatus !== 'function') {
      throw new Error(
        'OperationWorkflowOwner requires getActualReplicaStatus()',
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
   * Resolve the best available replica status for workflow reconciliation.
   * Prefer authoritative reads, but fall back to the observed services cache
   * when the exact target row becomes visible there first.
   *
   * @param {string} replicaId
   * @param {string} partitionId
   * @param {string} targetNodeId
   * @return {Promise<string|null>}
   */
  async getReconciledReplicaStatus(
    replicaId, partitionId, targetNodeId,
  ) {
    const actualStatus =
      await this.getActualReplicaStatus(
        replicaId, partitionId, targetNodeId,
      );
    if (actualStatus !== null) {
      return actualStatus;
    }
    return this.repository.getObservedReplicaStatusFromCache(
      replicaId, partitionId, targetNodeId,
    );
  }

  // --- Single-flight key construction ---

  /**
   * Build one operation single-flight key.
   * @param {string} scope - Lock scope prefix.
   * @param {string} key - Scope-specific key.
   * @return {string}
   */
  buildOperationSingleFlightKey(scope, key) {
    return [scope, key].join(
      OPERATION_SINGLE_FLIGHT_KEY_SEPARATOR,
    );
  }

  /**
   * @param {string} dedupeKey
   * @return {string}
   */
  getCreateOperationSingleFlightKey(dedupeKey) {
    return this.buildOperationSingleFlightKey(
      OPERATION_SINGLE_FLIGHT_SCOPE.CREATE,
      dedupeKey,
    );
  }

  /**
   * @param {string} scope
   * @return {string}
   */
  getCreateBudgetSingleFlightKey(scope) {
    return this.buildOperationSingleFlightKey(
      OPERATION_SINGLE_FLIGHT_SCOPE.CREATE_BUDGET,
      scope,
    );
  }

  /**
   * @param {string} operationId
   * @return {string}
   */
  getExecuteOperationSingleFlightKey(operationId) {
    return this.buildOperationSingleFlightKey(
      OPERATION_SINGLE_FLIGHT_SCOPE.OPERATION,
      operationId,
    );
  }

  /**
   * @param {string} operationId
   * @return {string}
   */
  getOperationOwnerSingleFlightKey(operationId) {
    return this.buildOperationSingleFlightKey(
      OPERATION_SINGLE_FLIGHT_SCOPE.OPERATION,
      operationId,
    );
  }

  /**
   * Delay authoritative empty-owner scans until the cache has had one bounded
   * chance to observe local replica_operations rows. An empty cache is not
   * proof of zero operations; it is only a reason to wait briefly.
   * @param {number} [now=Date.now()]
   * @return {boolean}
   */
  shouldDelayEmptyIncompleteOperationQuery(now = Date.now()) {
    if (this.incompleteOperationQueryEmptyBackoffMs <= NUM.ZERO) {
      return false;
    }
    if (this.lastEmptyIncompleteOperationQueryAtMs <= NUM.ZERO) {
      this.lastEmptyIncompleteOperationQueryAtMs = now;
      return true;
    }
    if (now - this.lastEmptyIncompleteOperationQueryAtMs <
        this.incompleteOperationQueryEmptyBackoffMs) {
      return true;
    }
    this.lastEmptyIncompleteOperationQueryAtMs = NUM.ZERO;
    return false;
  }

  /**
   * Clear bounded empty-owner scan deferral once local work is observed.
   * @return {void}
   */
  clearEmptyIncompleteOperationQueryDelay() {
    this.lastEmptyIncompleteOperationQueryAtMs = NUM.ZERO;
  }

  /**
   * Merge cache-visible and authoritative incomplete operation sets.
   * Authoritative rows win when both sources contain the same operation ID.
   *
   * Timeout and recovery reconciliation must not assume a non-empty local
   * cache is complete. Cache observation boundaries can lag individual
   * replica_operations rows even while some in-flight work is already visible.
   *
   * @param {Array<Object>} cachedIncompleteOps
   * @param {Array<Object>} authoritativeIncompleteOps
   * @return {Array<Object>}
   */
  mergeIncompleteOperations(
    cachedIncompleteOps = [],
    authoritativeIncompleteOps = [],
  ) {
    const mergedByOperationId = new Map();
    for (const operation of cachedIncompleteOps) {
      if (!operation?.operationId) {
        continue;
      }
      mergedByOperationId.set(operation.operationId, operation);
    }
    for (const operation of authoritativeIncompleteOps) {
      if (!operation?.operationId) {
        continue;
      }
      mergedByOperationId.set(operation.operationId, operation);
    }
    return [...mergedByOperationId.values()].sort((left, right) => {
      const leftUpdatedAt = Number(left?.updatedAt) || NUM.ZERO;
      const rightUpdatedAt = Number(right?.updatedAt) || NUM.ZERO;
      if (leftUpdatedAt !== rightUpdatedAt) {
        return leftUpdatedAt - rightUpdatedAt;
      }
      return String(left?.operationId || '').localeCompare(
        String(right?.operationId || ''),
      );
    });
  }


  // --- Workflow step advancement ---

  /**
   * Register an operation as a workflow if not already tracked.
   * @param {Object} operation - Operation record.
   */
  ensureOperationWorkflow(operation) {
    const workflowId = operation.operationId;
    if (this.operationWorkflowCoordinator
      .getWorkflowById(workflowId)) {
      return;
    }
    const record = {
      workflowId,
      ownerKey: workflowId,
      step: operation.workflowStep || null,
      transitionHistory: [],
    };
    const workflow = this.operationWorkflowCoordinator
      .createWorkflowRecord(record);
    this.operationWorkflowCoordinator.setWorkflowState(workflow);
  }

  /**
   * Resolve a canonical transition reason from step progression.
   * @param {string} previousStep
   * @param {string} nextStep
   * @return {string}
   */
  resolveTransitionReason(previousStep, nextStep) {
    if (nextStep === WORKFLOW_STEP.SENDING) {
      return OPERATION_TRANSITION_REASON.DISPATCH_SENDING;
    }
    if (nextStep === WORKFLOW_STEP.CREATING) {
      return OPERATION_TRANSITION_REASON.DISPATCH_CREATING;
    }
    if (nextStep === WORKFLOW_STEP.STOPPING) {
      return OPERATION_TRANSITION_REASON.DISPATCH_STOPPING;
    }
    if (nextStep === WORKFLOW_STEP.ACTIVE &&
        previousStep === WORKFLOW_STEP.SYNCING) {
      return OPERATION_TRANSITION_REASON.RECONCILE_ACTIVE;
    }
    if (nextStep === WORKFLOW_STEP.ACTIVE) {
      return OPERATION_TRANSITION_REASON.DISPATCH_ALREADY_EXISTS;
    }
    if (nextStep === WORKFLOW_STEP.REMOVED) {
      return OPERATION_TRANSITION_REASON.OPERATION_COMPLETED;
    }
    if (nextStep === WORKFLOW_STEP.FAILED) {
      return OPERATION_TRANSITION_REASON.OPERATION_FAILED;
    }
    return OPERATION_TRANSITION_REASON.DISPATCH_SENDING;
  }

  /**
   * Build one stable owner key for transition-attempt tracking.
   * @param {string} operationId
   * @param {string} step
   * @return {string}
   */
  buildTransitionExecutionStepOwnerKey(operationId, step) {
    return [
      String(operationId || ''),
      String(step || ''),
    ].join(OPERATION_SINGLE_FLIGHT_KEY_SEPARATOR);
  }

  /**
   * Allocate the next execution attempt number for one operation/step key.
   * @param {string} operationId
   * @param {string} step
   * @return {number}
   */
  reserveTransitionExecutionAttempt(operationId, step) {
    const ownerKey = this.buildTransitionExecutionStepOwnerKey(
      operationId,
      step,
    );
    const nextAttempt =
      (this.transitionExecutionAttemptByStepOwnerKey.get(ownerKey) || NUM.ZERO) +
      NUM.ONE;
    this.transitionExecutionAttemptByStepOwnerKey.set(ownerKey, nextAttempt);
    return nextAttempt;
  }

  /**
   * Clear tracked attempt state after a committed transition.
   * @param {string} operationId
   * @param {string} step
   * @return {void}
   */
  clearTransitionExecutionAttempt(operationId, step) {
    const ownerKey = this.buildTransitionExecutionStepOwnerKey(
      operationId,
      step,
    );
    this.transitionExecutionAttemptByStepOwnerKey.delete(ownerKey);
  }

  /**
   * Build one attempt-scoped transition session id.
   * @param {string} operationId
   * @param {string} step
   * @param {number} executionAttempt
   * @return {string}
   */
  buildTransitionExecutionSessionId(operationId, step, executionAttempt) {
    return [
      String(operationId || ''),
      String(step || ''),
      OPERATION_TRANSITION_SESSION_ATTEMPT_PREFIX +
      String(executionAttempt),
    ].join(OPERATION_SINGLE_FLIGHT_KEY_SEPARATOR);
  }

  /**
   * Clamp transition-owned replica_operations writes to the enclosing
   * distributed transaction deadline so inner retry loops do not outlive
   * the parent transaction and mask the original contention boundary.
   * @param {string} sessionId
   * @return {Object|null}
   */
  buildTransitionMutationTimeoutBudget(sessionId) {
    if (typeof this.transactionCoordinator?.getTransaction !== TYPEOF.FUNCTION) {
      return null;
    }
    const transactionState =
      this.transactionCoordinator.getTransaction(sessionId);
    const deadlineMs = Number.isFinite(transactionState?.timeoutDeadline) ?
      Math.floor(transactionState.timeoutDeadline) :
      null;
    if (!Number.isFinite(deadlineMs)) {
      return null;
    }
    const startedAtMs = Date.now();
    return Object.freeze({
      configuredBudgetMs: Math.max(
        TIMEOUT_BUDGET_DEFAULT.MINIMUM_OPERATION_BUDGET_MS,
        deadlineMs - startedAtMs,
      ),
      startedAtMs,
      deadlineMs,
      operationName: 'transaction',
    });
  }

  /**
   * Execute a step transition atomically using the distributed
   * transaction coordinator.
   * @param {Object} operation
   * @param {string} step
   * @param {string} reason
   * @param {Function} persistFn
   * @param {Object} [options]
   * @param {Function} [options.onIdempotentTransition]
   * @param {Function} [options.afterCommit]
   * @return {Promise<boolean>} True when this call committed the transition.
   */
  async executeAtomicTransition(
    operation,
    step,
    reason,
    persistFn,
    options = {},
  ) {
    return this.repository
      .runReplicaOperationTransitionExclusive(
        async () => {
          this.ensureOperationWorkflow(operation);

          if (this.operationWorkflowCoordinator
            .isTransitionIdempotent(
              operation.operationId, step,
            )) {
            if (typeof options.onIdempotentTransition === TYPEOF.FUNCTION) {
              options.onIdempotentTransition();
            }
            return false;
          }

          const txCoordinator = this.transactionCoordinator;
          if (!txCoordinator ||
              typeof txCoordinator.begin !== 'function' ||
              typeof txCoordinator.commit !== 'function' ||
              typeof txCoordinator.rollback !== 'function') {
            throw new Error(
              REBALANCE_COORDINATOR_ERROR_MSG
                .TRANSACTION_COORDINATOR_REQUIRED,
            );
          }

          const afterCommit = typeof options.afterCommit === TYPEOF.FUNCTION ?
            options.afterCommit :
            null;
          const executionAttempt = this.reserveTransitionExecutionAttempt(
            operation.operationId,
            step,
          );
          const sessionId = this.buildTransitionExecutionSessionId(
            operation.operationId,
            step,
            executionAttempt,
          );
          const beginResult =
            await txCoordinator.begin(sessionId);
          if (!beginResult.success) {
            throw new Error(beginResult.error);
          }
          let committed = false;
          try {
            await this.operationWorkflowCoordinator
              .transitionStep(
                operation.operationId,
                {nextStep: step, reason},
                {},
                TRANSITION_STEP_OPTIONS.DEFER_COMMITTED_MARK,
              );
            await persistFn(sessionId);
            const commitResult =
              await txCoordinator.commit(sessionId);
            if (!commitResult.success) {
              throw new Error(commitResult.error);
            }
            committed = true;
            this.operationWorkflowCoordinator
              .markTransitionCommitted(
                operation.operationId,
                step,
              );
            this.clearTransitionExecutionAttempt(
              operation.operationId,
              step,
            );
            if (afterCommit) {
              await afterCommit();
            }
            return true;
          } catch (error) {
            if (!committed) {
              await txCoordinator.rollback(sessionId);
            }
            throw error;
          }
        },
      );
  }

  /**
   * Update operation workflow step.
   * @param {Object} operation
   * @param {string} step
   * @param {string} [reason]
   * @return {Promise<void>}
   */
  async updateStep(operation, step, reason) {
    const previousStep = operation.workflowStep;
    if (previousStep === step) {
      return false;
    }
    const transitionReason = reason ||
      this.resolveTransitionReason(previousStep, step);
    const now = Date.now();
    const readinessDecisionDimension =
      this.resolveOperationReadinessDecisionDimension(operation);

    const targetNodeId = operation.targetNodeId;
    const targetReadiness = targetNodeId ?
      this.controlPlaneReadinessService
        .getNodeReadinessSync(targetNodeId, {
          decisionDimension:
            readinessDecisionDimension,
        }) :
      null;
    const readinessSnapshot =
      ControlPlaneReadinessService.compactSnapshotSummary(
        targetReadiness,
        readinessDecisionDimension,
      );
    const persistedStatus =
      WORKFLOW_STEP_TO_STATUS[step] || operation.status;
    const stepEntry = {
      step,
      timestamp: now,
      previousStep,
      reason: transitionReason,
      ownerKey: operation.operationId,
    };
    if (readinessSnapshot) {
      stepEntry[OPERATION_METADATA_KEY.READINESS_SNAPSHOT] =
        readinessSnapshot;
    }
    const projectedOperation = {
      ...operation,
      workflowStep: step,
      updatedAt: now,
      status: persistedStatus,
      stepsHistory: [
        ...(Array.isArray(operation.stepsHistory) ?
          operation.stepsHistory : []),
        stepEntry,
      ],
    };
    const projectIdempotentTransition = () => {
      operation.workflowStep = step;
      operation.status = persistedStatus;
      const previousUpdatedAt = Number(operation.updatedAt);
      operation.updatedAt = Number.isFinite(previousUpdatedAt) ?
        Math.max(previousUpdatedAt, now) :
        now;
    };

    const persistFn = async (sessionId) => {
      const timeoutBudget =
        this.buildTransitionMutationTimeoutBudget(sessionId);
      await this.repository.persistOperationUpdate(
        projectedOperation,
        {
          sessionId,
          confirmPersistence: false,
          timeoutBudget,
        },
      );
    };

    const transitionCommitted = await this.executeAtomicTransition(
      operation,
      step,
      transitionReason,
      persistFn,
      {
        onIdempotentTransition: projectIdempotentTransition,
        afterCommit: async () => {
          await this.repository.confirmReplicaOperationPersistence(
            projectedOperation,
          );
        },
      },
    );

    if (!transitionCommitted) {
      return false;
    }

    operation.workflowStep = step;
    operation.updatedAt = now;
    operation.status = persistedStatus;
    operation.stepsHistory.push(stepEntry);

    this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.STEP_CHANGED, {
      operationId: operation.operationId,
      previousStep,
      newStep: step,
      reason: transitionReason,
      status: operation.status,
      partitionId: operation.partitionId,
    });

    this.emitter.emit(
      REBALANCE_COORDINATOR_EVENT.STEP_CHANGED,
      {operation, previousStep, newStep: step, reason: transitionReason},
    );

    return true;
  }

  /**
   * Complete an operation successfully.
   * @param {Object} operation
   * @return {Promise<void>}
   */
  async completeOperation(operation) {
    const now = Date.now();
    const finalStep = operation.type === OperationType.ADD ?
      WORKFLOW_STEP.ACTIVE :
      WORKFLOW_STEP.REMOVED;
    if (operation.workflowStep === finalStep &&
        operation.completedAt !== null &&
        operation.completedAt !== undefined) {
      return;
    }
    const previousStep = operation.workflowStep;
    const readinessDecisionDimension =
      this.resolveOperationReadinessDecisionDimension(operation);

    const targetNodeId = operation.targetNodeId;
    const targetReadiness = targetNodeId ?
      this.controlPlaneReadinessService
        .getNodeReadinessSync(targetNodeId, {
          decisionDimension:
            readinessDecisionDimension,
        }) :
      null;
    const readinessSnapshot =
      ControlPlaneReadinessService.compactSnapshotSummary(
        targetReadiness,
        readinessDecisionDimension,
      );
    const stepEntry = {
      step: finalStep,
      timestamp: now,
      previousStep,
      reason: OPERATION_TRANSITION_REASON.OPERATION_COMPLETED,
      ownerKey: operation.operationId,
    };
    if (readinessSnapshot) {
      stepEntry[OPERATION_METADATA_KEY.READINESS_SNAPSHOT] =
        readinessSnapshot;
    }
    const projectedOperation = {
      ...operation,
      workflowStep: finalStep,
      status: WORKFLOW_STEP_TO_STATUS[finalStep],
      updatedAt: now,
      completedAt: now,
      stepsHistory: [
        ...(Array.isArray(operation.stepsHistory) ?
          operation.stepsHistory : []),
        stepEntry,
      ],
    };
    const projectIdempotentTransition = () => {
      operation.workflowStep = finalStep;
      operation.status = WORKFLOW_STEP_TO_STATUS[finalStep];
      const previousUpdatedAt = Number(operation.updatedAt);
      operation.updatedAt = Number.isFinite(previousUpdatedAt) ?
        Math.max(previousUpdatedAt, now) :
        now;
      const previousCompletedAt = Number(operation.completedAt);
      operation.completedAt = Number.isFinite(previousCompletedAt) ?
        Math.max(previousCompletedAt, now) :
        now;
    };

    const persistFn = async (sessionId) => {
      await this.repository.persistOperationUpdate(
        projectedOperation,
        {
          sessionId,
          confirmPersistence: false,
        },
      );
    };

    const transitionCommitted = await this.executeAtomicTransition(
      operation,
      finalStep,
      OPERATION_TRANSITION_REASON.OPERATION_COMPLETED,
      persistFn,
      {
        onIdempotentTransition: projectIdempotentTransition,
        afterCommit: async () => {
          await this.repository.confirmReplicaOperationPersistence(
            projectedOperation,
          );
        },
      },
    );

    if (!transitionCommitted) {
      await this.releaseReservationForOperation(operation);
      this.clearDeferredSafetyBlockState(
        operation.operationId,
      );
      return;
    }

    operation.workflowStep = finalStep;
    operation.status = WORKFLOW_STEP_TO_STATUS[finalStep];
    operation.updatedAt = now;
    operation.completedAt = now;
    operation.stepsHistory.push(stepEntry);

    await this.releaseReservationForOperation(operation);
    this.clearDeferredSafetyBlockState(
      operation.operationId,
    );

    this.stats.operationsCompleted++;

    this.logger.info(
      REBALANCE_COORDINATOR_LOG_MSG.OPERATION_COMPLETED,
      {
        operationId: operation.operationId,
        type: operation.type,
        partitionId: operation.partitionId,
        targetNodeId: operation.targetNodeId,
      },
    );

    this.emitter.emit(
      REBALANCE_COORDINATOR_EVENT.OPERATION_COMPLETED,
      {operation},
    );

    try {
      this.logger.info(METRICS_LOG_TAG.REBALANCE_OPERATION, {
        operationId: operation.operationId,
        entityType: operation.entityType,
        finalState: operation.status,
        totalDurationMs: now - operation.createdAt,
      });
    } catch (_metricsErr) {
      // Metrics logging failures must not propagate to callers
    }
  }

  /**
   * Fail an operation.
   * @param {Object} operation
   * @param {string} errorMessage
   * @param {Object} [options]
   * @return {Promise<void>}
   */
  async failOperation(operation, errorMessage, options = {}) {
    const now = Date.now();
    if (operation.workflowStep === WORKFLOW_STEP.FAILED &&
        operation.completedAt !== null &&
        operation.completedAt !== undefined) {
      return;
    }
    const normalizedError = this.normalizeErrorMessage(
      errorMessage, 'Unknown error',
    );
    const isSafetyBlocked =
      this.isSafetyPolicyFailure(normalizedError);
    const logLevel = options.logLevel ||
      (isSafetyBlocked ?
        FAILURE_LOG_LEVEL.WARN : FAILURE_LOG_LEVEL.ERROR);
    const logMessage = options.logMessage ||
      (isSafetyBlocked ?
        REBALANCE_COORDINATOR_LOG_MSG
          .OPERATION_BLOCKED_BY_SAFETY_POLICY :
        REBALANCE_COORDINATOR_LOG_MSG.OPERATION_FAILED);
    const previousStep = operation.workflowStep;
    const transitionReason = isSafetyBlocked ?
      OPERATION_TRANSITION_REASON.SAFETY_POLICY_BLOCKED :
      OPERATION_TRANSITION_REASON.OPERATION_FAILED;
    const readinessDecisionDimension =
      this.resolveOperationReadinessDecisionDimension(operation);

    const targetNodeId = operation.targetNodeId;
    const targetReadiness = targetNodeId ?
      this.controlPlaneReadinessService
        .getNodeReadinessSync(targetNodeId, {
          decisionDimension:
            readinessDecisionDimension,
        }) :
      null;
    const readinessSnapshot =
      ControlPlaneReadinessService.compactSnapshotSummary(
        targetReadiness,
        readinessDecisionDimension,
      );
    const failedStepEntry = {
      step: WORKFLOW_STEP.FAILED,
      timestamp: now,
      previousStep,
      reason: transitionReason,
      ownerKey: operation.operationId,
    };
    if (options.stepMetadata &&
        typeof options.stepMetadata === 'object') {
      Object.assign(failedStepEntry, options.stepMetadata);
    }
    if (readinessSnapshot) {
      failedStepEntry[
        OPERATION_METADATA_KEY.READINESS_SNAPSHOT
      ] = readinessSnapshot;
    }
    const projectedOperation = {
      ...operation,
      workflowStep: WORKFLOW_STEP.FAILED,
      status: ReplicaStatus.FAILED,
      updatedAt: now,
      completedAt: now,
      errorMessage: normalizedError,
      stepsHistory: [
        ...(Array.isArray(operation.stepsHistory) ?
          operation.stepsHistory : []),
        failedStepEntry,
      ],
    };
    const projectIdempotentTransition = () => {
      operation.workflowStep = WORKFLOW_STEP.FAILED;
      operation.status = ReplicaStatus.FAILED;
      const previousUpdatedAt = Number(operation.updatedAt);
      operation.updatedAt = Number.isFinite(previousUpdatedAt) ?
        Math.max(previousUpdatedAt, now) :
        now;
      const previousCompletedAt = Number(operation.completedAt);
      operation.completedAt = Number.isFinite(previousCompletedAt) ?
        Math.max(previousCompletedAt, now) :
        now;
      operation.errorMessage = normalizedError;
    };

    const persistFn = async (sessionId) => {
      await this.repository.persistOperationUpdate(
        projectedOperation,
        {
          sessionId,
          confirmPersistence: false,
        },
      );
    };

    const transitionCommitted = await this.executeAtomicTransition(
      operation,
      WORKFLOW_STEP.FAILED,
      transitionReason,
      persistFn,
      {
        onIdempotentTransition: projectIdempotentTransition,
        afterCommit: async () => {
          await this.repository.confirmReplicaOperationPersistence(
            projectedOperation,
          );
        },
      },
    );

    if (!transitionCommitted) {
      await this.releaseReservationForOperation(operation);
      this.clearDeferredSafetyBlockState(
        operation.operationId,
      );
      return;
    }

    operation.workflowStep = WORKFLOW_STEP.FAILED;
    operation.status = ReplicaStatus.FAILED;
    operation.updatedAt = now;
    operation.completedAt = now;
    operation.errorMessage = normalizedError;
    operation.stepsHistory.push(failedStepEntry);

    await this.releaseReservationForOperation(operation);
    this.clearDeferredSafetyBlockState(
      operation.operationId,
    );

    this.stats.operationsFailed++;

    const logPayload = {
      operationId: operation.operationId,
      type: operation.type,
      partitionId: operation.partitionId,
      targetNodeId: operation.targetNodeId,
      errorMessage: normalizedError,
    };

    const logMethod =
      logLevel === FAILURE_LOG_LEVEL.WARN &&
      typeof this.logger.warn === 'function' ?
        this.logger.warn.bind(this.logger) :
        this.logger.error.bind(this.logger);

    logMethod(logMessage, logPayload);

    this.emitter.emit(
      REBALANCE_COORDINATOR_EVENT.OPERATION_FAILED,
      {operation, errorMessage: normalizedError},
    );

    try {
      this.logger.info(METRICS_LOG_TAG.REBALANCE_OPERATION, {
        operationId: operation.operationId,
        entityType: operation.entityType,
        finalState: operation.status,
        totalDurationMs: now - operation.createdAt,
      });
    } catch (_metricsErr) {
      // Metrics logging failures must not propagate to callers
    }
  }


  // --- Claim / dispatch / execution ---

  /**
   * Claim a PENDING operation for dispatch.
   * @param {string} operationId
   * @return {Promise<Object|null>}
   */
  async claimDispatchTransition(operationId) {
    if (this.isShuttingDown || !this.isInitialized) {
      return null;
    }

    const operation =
      await this.repository.queryOperationById(operationId);
    if (!operation) {
      return null;
    }

    if (operation.workflowStep !== WORKFLOW_STEP.PENDING) {
      return null;
    }
    if (!isCoordinatorOwnedOperationType(operation.type)) {
      return null;
    }

    if (!this.repository.isOperationLocallyOwned(operation)) {
      return null;
    }

    await this.updateStep(
      operation,
      WORKFLOW_STEP.SENDING,
      OPERATION_TRANSITION_REASON.DISPATCH_SENDING,
    );

    return operation;
  }

  /**
   * Dispatch one operation through the single-flight lane.
   * @param {string|Object} operationInput
   * @return {Promise<Object>}
   */
  async dispatchOperation(operationInput) {
    if (this.isShuttingDown || !this.isInitialized) {
      return {
        success: false,
        skipped: true,
        reason: 'shutdown_in_progress',
        operationId: this.getOperationIdFromInput(operationInput),
      };
    }

    const operationId =
      this.getOperationIdFromInput(operationInput);
    const singleFlightKey = operationId ?
      this.getExecuteOperationSingleFlightKey(operationId) :
      null;
    if (!singleFlightKey) {
      return {
        success: false,
        skipped: true,
        reason: 'operation_id_required',
        operationId: null,
      };
    }

    return this.operationWorkflowRunExclusive(
      singleFlightKey,
      () => this.dispatchOperationInternal(operationInput),
    );
  }

  /**
   * Resolve an operation id from one supported caller payload.
   * @param {string|Object} operationInput
   * @return {string|null}
   */
  getOperationIdFromInput(operationInput) {
    if (typeof operationInput === 'string' &&
        operationInput.length > NUM.ZERO) {
      return operationInput;
    }
    if (!operationInput ||
        typeof operationInput !== 'object') {
      return null;
    }
    if (typeof operationInput.operationId === 'string' &&
        operationInput.operationId.length > NUM.ZERO) {
      return operationInput.operationId;
    }
    if (typeof operationInput.operation_id === 'string' &&
        operationInput.operation_id.length > NUM.ZERO) {
      return operationInput.operation_id;
    }
    return null;
  }

  /**
   * Normalize one dispatch input to a canonical operation object.
   * @param {string|Object} operationInput
   * @return {Promise<Object|null>}
   */
  async resolveDispatchOperation(operationInput) {
    if (typeof operationInput === 'string' &&
        operationInput.length > NUM.ZERO) {
      return this.repository.queryOperationById(operationInput);
    }
    if (!operationInput ||
        typeof operationInput !== 'object') {
      return null;
    }
    if (typeof operationInput.operationId === 'string' &&
        operationInput.operationId.length > NUM.ZERO) {
      return isCoordinatorOwnedOperationType(
        operationInput.type,
      ) ?
        operationInput :
        null;
    }
    if (typeof operationInput.operation_id === 'string' &&
        operationInput.operation_id.length > NUM.ZERO) {
      const operation =
        this.repository.rowToOperation(operationInput);
      return isCoordinatorOwnedOperationType(operation?.type) ?
        operation :
        null;
    }
    return null;
  }

  /**
   * Execute one dispatch attempt after ownership serialization.
   * @param {string|Object} operationInput
   * @return {Promise<Object>}
   */
  async dispatchOperationInternal(operationInput) {
    const operation =
      await this.resolveDispatchOperation(operationInput);
    const operationId =
      this.getOperationIdFromInput(operationInput);

    if (!operation) {
      return {
        success: false,
        skipped: true,
        reason: 'operation_not_found',
        operationId,
      };
    }

    if (!this.repository.isOperationLocallyOwned(operation)) {
      return {
        success: false,
        skipped: true,
        reason:
          REBALANCER_SKIP_REASON.OPERATION_OWNED_BY_ANOTHER_NODE,
        operationId: operation.operationId,
      };
    }

    const replaceRemoveDispatchPhase =
      this.repository.isReplaceRemoveDispatchPhase(operation);
    const dispatchableWorkflowStep = operation.workflowStep;
    if (replaceRemoveDispatchPhase) {
      if (dispatchableWorkflowStep !== WORKFLOW_STEP.ACTIVE &&
          dispatchableWorkflowStep !== WORKFLOW_STEP.STOPPING) {
        return {
          success: false,
          skipped: true,
          reason: 'operation_not_dispatchable',
          operationId: operation.operationId,
        };
      }
    } else if (
      dispatchableWorkflowStep === WORKFLOW_STEP.PENDING
    ) {
      await this.updateStep(
        operation,
        WORKFLOW_STEP.SENDING,
        OPERATION_TRANSITION_REASON.DISPATCH_SENDING,
      );
    } else if (
      dispatchableWorkflowStep !== WORKFLOW_STEP.SENDING
    ) {
      return {
        success: false,
        skipped: true,
        reason: 'operation_not_dispatchable',
        operationId: operation.operationId,
      };
    }

    return this.executeOperationInternal(operation);
  }

  /**
   * Execute operation through the single-flight lane.
   * @param {Object} operation
   * @return {Promise<Object>}
   */
  async executeOperation(operation) {
    if (this.isShuttingDown || !this.isInitialized) {
      return {
        success: false,
        skipped: true,
        reason: 'shutdown_in_progress',
        operationId: operation?.operationId,
      };
    }

    const operationId = operation?.operationId;
    const singleFlightKey = operationId ?
      this.getExecuteOperationSingleFlightKey(operationId) :
      null;
    if (singleFlightKey &&
        this.operationWorkflowCoordinator
          .inFlightExecutionsByOwnerKey.has(singleFlightKey)) {
      return {
        success: false,
        skipped: true,
        reason:
          REBALANCER_SKIP_REASON.OPERATION_ALREADY_EXECUTING,
        operationId,
      };
    }

    if (!singleFlightKey) {
      return this.executeOperationInternal(operation);
    }

    return this.operationWorkflowRunExclusive(
      singleFlightKey,
      () => this.executeOperationInternal(operation),
    );
  }

  /**
   * Execute one operation from reconciliation paths that may already hold
   * the per-operation owner key.
   *
   * Calling executeOperation() while runExclusive already owns the same key
   * returns OPERATION_ALREADY_EXECUTING and can stall REPLACE source-removal
   * progression. Reconciliation paths must dispatch directly when they
   * already hold ownership.
   *
   * @param {Object} operation
   * @return {Promise<Object>}
   */
  async executeOperationFromReconcilePath(operation) {
    const operationId = operation?.operationId;
    const singleFlightKey = operationId ?
      this.getExecuteOperationSingleFlightKey(operationId) :
      null;
    const inFlightOwnerKeys =
      this.operationWorkflowCoordinator?.inFlightExecutionsByOwnerKey;
    const ownerKeyAlreadyHeld = Boolean(
      singleFlightKey &&
      inFlightOwnerKeys instanceof Map &&
      inFlightOwnerKeys.has(singleFlightKey),
    );

    if (ownerKeyAlreadyHeld) {
      return this.executeOperationInternal(operation);
    }
    return this.executeOperation(operation);
  }


  /**
   * Execute operation body once per operation ID.
   * @param {Object} operation
   * @return {Promise<Object>}
   */
  async executeOperationInternal(operation) {
    if (!this.messageRouter) {
      throw new Error(
        REBALANCE_COORDINATOR_ERROR_MSG.ROUTER_MISSING,
      );
    }

    if (!this.repository.isOperationLocallyOwned(operation)) {
      return {
        success: false,
        skipped: true,
        reason:
          REBALANCER_SKIP_REASON.OPERATION_OWNED_BY_ANOTHER_NODE,
        operationId: operation?.operationId,
      };
    }

    const replaceRemoveDispatchPhase =
      this.repository.isReplaceRemoveDispatchPhase(operation);
    const removeStoppingReplayPhase =
      operation.type === OperationType.REMOVE &&
      operation.workflowStep === WORKFLOW_STEP.STOPPING;
    const replaceSourceReplicaId =
      this.repository.getReplaceSourceReplicaId(operation);

    if (!replaceRemoveDispatchPhase &&
        !removeStoppingReplayPhase) {
      await this.updateStep(operation, WORKFLOW_STEP.SENDING);
    }

    const removeSafetyError =
      await this.getRemoveSafetyError(operation);
    if (removeSafetyError) {
      const removeSafetyDeferReason =
        await this.getRemoveSafetyDeferReason(
          operation,
          replaceRemoveDispatchPhase,
          removeSafetyError,
        );
      if (removeSafetyDeferReason) {
        this.logDeferredSafetyBlockedRemove(
          operation,
          removeSafetyError,
          removeSafetyDeferReason,
        );
        return {
          success: false,
          skipped: true,
          reason: REBALANCER_SKIP_REASON.SAFETY_BLOCKED,
          deferReason: removeSafetyDeferReason,
          operationId: operation.operationId,
          error: removeSafetyError,
        };
      }
      await this.failOperation(operation, removeSafetyError, {
        logLevel: FAILURE_LOG_LEVEL.WARN,
        logMessage: REBALANCE_COORDINATOR_LOG_MSG
          .OPERATION_BLOCKED_BY_SAFETY_POLICY,
      });
      return {
        success: false,
        operationId: operation.operationId,
        error: removeSafetyError,
      };
    }
    this.clearDeferredSafetyBlockState(
      operation.operationId,
    );

    const entityType =
      operation.entityType || SERVICE_TYPE.PARTITION;
    const entityId =
      operation.entityId || operation.partitionId;
    const handlerType = OPERATION_HANDLER[entityType] ||
      OPERATION_HANDLER[SERVICE_TYPE.PARTITION];
    let dispatchNodeId = operation.targetNodeId;
    let messageType =
      ReplicaOperationMessageType.CREATE_REPLICA;
    let requestReplicaId = operation.replicaId;
    let requestReason = null;

    if (operation.type === OperationType.REMOVE) {
      messageType =
        ReplicaOperationMessageType.REMOVE_REPLICA;
    } else if (operation.type === OperationType.REPLACE) {
      if (replaceRemoveDispatchPhase) {
        dispatchNodeId = operation.sourceNodeId;
        messageType =
          ReplicaOperationMessageType.REMOVE_REPLICA;
        requestReplicaId = replaceSourceReplicaId;
        requestReason = 'replace_source_removal';
      } else {
        messageType =
          ReplicaOperationMessageType.CREATE_REPLICA;
        if (!operation.replicaId ||
            operation.replicaId === replaceSourceReplicaId) {
          operation.replicaId =
            await this.allocateCanonicalReplicaId({
              partitionId: operation.partitionId,
              entityType,
              entityId,
              excludeReplicaIds: replaceSourceReplicaId ?
                [replaceSourceReplicaId] :
                [],
            });
        }
        requestReplicaId = operation.replicaId;
      }
    }

    if (operation.type === OperationType.REPLACE &&
        replaceRemoveDispatchPhase &&
        !requestReplicaId) {
      const replaceSourceMissing =
        'Missing source replica for REPLACE operation ' +
        operation.operationId;
      await this.failOperation(
        operation, replaceSourceMissing,
      );
      return {
        success: false,
        operationId: operation.operationId,
        error: replaceSourceMissing,
      };
    }

    const target =
      `${dispatchNodeId}/service/${handlerType}`;
    const request = {
      [ReplicaOperationField.TYPE]: messageType,
      [ReplicaOperationField.OPERATION_ID]:
        operation.operationId,
      [ReplicaOperationField.PARTITION_ID]:
        operation.partitionId,
      [ReplicaOperationField.REPLICA_ID]: requestReplicaId,
      [ReplicaOperationField.SOURCE_NODE_ID]:
        operation.sourceNodeId,
      [ReplicaOperationField.ENTITY_TYPE]: entityType,
      [ReplicaOperationField.ENTITY_ID]: entityId,
    };
    if (requestReason) {
      request[ReplicaOperationField.REASON] = requestReason;
    }
    if (Array.isArray(
      operation[ReplicaOperationField.REPLICA_IDS],
    ) &&
        operation[ReplicaOperationField.REPLICA_IDS].length >
          NUM.ZERO) {
      request[ReplicaOperationField.REPLICA_IDS] =
        operation[ReplicaOperationField.REPLICA_IDS];
    }
    if (Array.isArray(
      operation[ReplicaOperationField.PEER_ADDRESSES],
    ) &&
        operation[ReplicaOperationField.PEER_ADDRESSES].length >
          NUM.ZERO) {
      request[ReplicaOperationField.PEER_ADDRESSES] =
        operation[ReplicaOperationField.PEER_ADDRESSES];
    }
    if (operation[
      ReplicaOperationField.BOOTSTRAP_TABLE_METADATA
    ] &&
        typeof operation[
          ReplicaOperationField.BOOTSTRAP_TABLE_METADATA
        ] === 'object') {
      request[ReplicaOperationField.BOOTSTRAP_TABLE_METADATA] =
        operation[
          ReplicaOperationField.BOOTSTRAP_TABLE_METADATA
        ];
    }
    if (operation[
      ReplicaOperationField.BOOTSTRAP_PARTITION_METADATA
    ] &&
        typeof operation[
          ReplicaOperationField.BOOTSTRAP_PARTITION_METADATA
        ] === 'object') {
      request[
        ReplicaOperationField.BOOTSTRAP_PARTITION_METADATA
      ] = operation[
        ReplicaOperationField.BOOTSTRAP_PARTITION_METADATA
      ];
    }

    this.logger.debug(
      REBALANCE_COORDINATOR_LOG_MSG.SEND_OPERATION,
      {
        operationId: operation.operationId,
        target,
        type: messageType,
        entityType,
        entityId,
        replaceRemovePhase: replaceRemoveDispatchPhase,
      },
    );

    const response = await this.messageRouter.deliver(
      target,
      request,
      {
        targetNodeId: dispatchNodeId,
        // Replica operation dispatch is the control-plane progress signal that
        // advances split/rebalance workflows. It must preempt bulk metadata
        // replication from transaction bookkeeping.
        deliveryPriority: 'critical',
      },
    );

    if (!response.acknowledged) {
      const errorMsg = this.normalizeErrorMessage(
        response.error,
        REBALANCE_COORDINATOR_ERROR_MSG.MESSAGE_NOT_ACKED,
      );
      await this.failOperation(operation, errorMsg);
      return {
        success: false,
        operationId: operation.operationId,
        error: errorMsg,
      };
    }

    return this._handleDispatchResponse(
      operation, response, replaceRemoveDispatchPhase,
    );
  }

  /**
   * Process executor dispatch response and advance workflow.
   * @param {Object} operation
   * @param {Object} response
   * @param {boolean} replaceRemovePhase
   * @return {Promise<Object>}
   * @private
   */
  async _handleDispatchResponse(
    operation, response, replaceRemovePhase,
  ) {
    if (response.status ===
        ReplicaOperationResponseStatus.INITIATED ||
        response.status ===
        ReplicaOperationResponseStatus.IN_PROGRESS) {
      let nextStep = WORKFLOW_STEP.CREATING;
      if (operation.type === OperationType.REMOVE ||
          (operation.type === OperationType.REPLACE &&
            replaceRemovePhase)) {
        nextStep = WORKFLOW_STEP.STOPPING;
      }
      await this.updateStep(operation, nextStep);
      return {
        success: true,
        operationId: operation.operationId,
        status: 'in_progress',
      };
    }

    if (response.status ===
        ReplicaOperationResponseStatus.ALREADY_EXISTS) {
      if (operation.type === OperationType.REPLACE &&
          !replaceRemovePhase) {
        await this.updateStep(
          operation, WORKFLOW_STEP.ACTIVE,
        );
        return {
          success: true,
          operationId: operation.operationId,
          status:
            ReplicaOperationResponseStatus.ALREADY_EXISTS,
        };
      }
      await this.completeOperation(operation);
      return {
        success: true,
        operationId: operation.operationId,
        status:
          ReplicaOperationResponseStatus.ALREADY_EXISTS,
      };
    }

    if (response.status ===
        ReplicaOperationResponseStatus.COMPLETED) {
      if (operation.type === OperationType.REPLACE &&
          !replaceRemovePhase) {
        await this.updateStep(
          operation, WORKFLOW_STEP.ACTIVE,
        );
        return {
          success: true,
          operationId: operation.operationId,
          status: ReplicaOperationResponseStatus.COMPLETED,
        };
      }
      await this.completeOperation(operation);
      return {
        success: true,
        operationId: operation.operationId,
        status: ReplicaOperationResponseStatus.COMPLETED,
      };
    }

    if (response.status ===
        ReplicaOperationResponseStatus.NOT_FOUND &&
        operation.type === OperationType.REPLACE &&
        replaceRemovePhase) {
      await this.completeOperation(operation);
      return {
        success: true,
        operationId: operation.operationId,
        status: ReplicaOperationResponseStatus.NOT_FOUND,
      };
    }

    const errorMsg = this.normalizeErrorMessage(
      response.error, 'Unknown error',
    );
    await this.failOperation(operation, errorMsg);
    return {
      success: false,
      operationId: operation.operationId,
      error: errorMsg,
    };
  }


  // --- Safety checks ---

  /**
   * @param {string} partitionId
   * @return {boolean}
   */
  isCriticalSystemPartition(partitionId) {
    return isSystemTablePartition({partitionId});
  }

  /**
   * Resolve the readiness decision dimension for one operation context.
   * Critical system partitions should continue owner progression while
   * publication convergence is pending; ordinary entities remain strict.
   *
   * @param {Object|string|null} operationOrPartitionId
   * @return {string}
   */
  resolveOperationReadinessDecisionDimension(operationOrPartitionId = null) {
    const partitionId =
      typeof operationOrPartitionId === 'string' ?
        operationOrPartitionId :
        operationOrPartitionId?.partitionId || null;
    if (this.isCriticalSystemPartition(partitionId)) {
      return CONTROL_PLANE_READINESS_DIMENSION
        .CONTROL_PLANE_RECOVERY_ELIGIBLE;
    }
    return CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE;
  }

  /**
   * Check decision dimension readiness with compatibility fallback.
   * Fallback applies only when older snapshots omit
   * controlPlaneRecoveryEligible explicitly.
   *
   * @param {Object|null} readiness
   * @param {string} decisionDimension
   * @return {boolean}
   */
  isReadinessDimensionSatisfied(readiness, decisionDimension) {
    const dimensions = readiness?.dimensions &&
      typeof readiness.dimensions === 'object' ?
      readiness.dimensions :
      null;
    if (!dimensions) {
      return false;
    }
    if (dimensions[decisionDimension] === true) {
      return true;
    }
    if (decisionDimension !==
        CONTROL_PLANE_READINESS_DIMENSION
          .CONTROL_PLANE_RECOVERY_ELIGIBLE) {
      return false;
    }
    if (Object.hasOwn(dimensions, decisionDimension)) {
      return false;
    }
    return dimensions[CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE] ===
      true;
  }

  /**
   * @param {Object} replicaRow
   * @return {boolean}
   */
  isVoterReadyRoutableReplica(replicaRow) {
    if (!replicaRow) {
      return false;
    }
    if (replicaRow.status !== ReplicaStatus.ACTIVE) {
      return false;
    }
    if (!replicaRow.address) {
      return false;
    }
    const raftRole = typeof replicaRow.raft_role === 'string' ?
      replicaRow.raft_role.toLowerCase() :
      null;
    if (!raftRole || raftRole === RAFT_ROLE.LEARNER) {
      return false;
    }
    return this.isNodeReadyForRouting(replicaRow.node_id, {
      partitionId: replicaRow.partition_id || replicaRow.partitionId || null,
    });
  }

  /**
   * @param {Object} replicaRow
   * @param {Object} operation
   * @return {boolean}
   */
  isOperationReplicaRow(replicaRow, operation) {
    if (!replicaRow || !operation) {
      return false;
    }
    if (!operation.replicaId) {
      return false;
    }
    return replicaRow.service_id === operation.replicaId ||
      replicaRow.replica_id === operation.replicaId;
  }

  /**
   * @param {string} partitionId
   * @return {Promise<number>}
   */
  async getCriticalMinReplicaCount(partitionId) {
    if (!this.tablePolicyService ||
        typeof this.tablePolicyService.getPolicyForPartition !==
        'function') {
      return DEFAULT_MIN_REPLICA_COUNT;
    }

    try {
      const policy =
        await this.tablePolicyService.getPolicyForPartition(
          partitionId,
        );
      const minReplicaCount = Number(policy?.minReplicaCount);
      if (Number.isFinite(minReplicaCount) &&
          minReplicaCount > NUM.ZERO) {
        return Math.floor(minReplicaCount);
      }
    } catch (error) {
      this.logger.warn(
        'Failed to resolve minReplicaCount for critical' +
        ' partition safety check', {
          partitionId,
          error: error.message,
        });
    }

    return DEFAULT_MIN_REPLICA_COUNT;
  }

  /**
   * @param {string} nodeId
   * @return {boolean}
   */
  isNodeReadyForRouting(nodeId, options = {}) {
    if (!nodeId) {
      return false;
    }
    const decisionDimension =
      this.resolveOperationReadinessDecisionDimension(
        options?.partitionId || null,
      );
    const readiness = this.controlPlaneReadinessService
      .getNodeReadinessSync(nodeId, {
        decisionDimension:
          decisionDimension,
      });
    return this.isReadinessDimensionSatisfied(
      readiness,
      decisionDimension,
    );
  }

  /**
   * Get safety validation error for REMOVE operations.
   * @param {Object} operation
   * @return {Promise<string|null>}
   */
  async getRemoveSafetyError(operation) {
    if (!operation) {
      return null;
    }

    const isRemoveInitialDispatch =
      operation.type === OperationType.REMOVE &&
      (operation.workflowStep === WORKFLOW_STEP.PENDING ||
        operation.workflowStep === WORKFLOW_STEP.SENDING);
    const isReplaceRemoveInitialDispatch =
      this.repository.isReplaceRemovePhase(operation);
    if (!isRemoveInitialDispatch &&
        !isReplaceRemoveInitialDispatch) {
      return null;
    }

    if (!this.isCriticalSystemPartition(
      operation.partitionId,
    )) {
      return null;
    }

    const systemTableCache =
      this.repository.systemTableCache;
    if (!systemTableCache ||
        typeof systemTableCache.filter !== 'function') {
      return `Critical partition ${operation.partitionId}` +
        ' safety check unavailable';
    }

    const criticalReplicaRows = systemTableCache.filter(
      SYSTEM_TABLE_NAME.SERVICES,
      (row) =>
        row.partition_id === operation.partitionId &&
        row.service_type === SERVICE_TYPE.PARTITION,
    ) || [];

    const currentVoterReadyRows = criticalReplicaRows.filter(
      (row) => this.isVoterReadyRoutableReplica(row),
    );

    const operationReplicaId =
      operation.type === OperationType.REPLACE ?
        this.repository.getReplaceSourceReplicaId(
          operation,
        ) :
        operation.replicaId;

    if (!operationReplicaId) {
      return `Critical partition ${operation.partitionId}` +
        ' safety check unavailable';
    }

    const removingVoterReady = currentVoterReadyRows.some(
      (row) => this.isOperationReplicaRow(row, {
        ...operation,
        replicaId: operationReplicaId,
      }),
    );

    if (!removingVoterReady) {
      return null;
    }

    if (isReplaceRemoveInitialDispatch) {
      const replacementReplicaId =
        this.repository.getReplaceTargetReplicaId(operation);
      if (!replacementReplicaId) {
        return 'Critical partition ' +
          operation.partitionId +
          ' replacement replica' +
          ' is unavailable';
      }
      const replacementReplica = criticalReplicaRows.find(
        (row) => {
          return row?.service_id === replacementReplicaId ||
            row?.replica_id === replacementReplicaId;
        },
      );
      if (!this.isVoterReadyRoutableReplica(
        replacementReplica,
      )) {
        return 'Critical partition ' +
          operation.partitionId +
          ' replacement replica ' +
          replacementReplicaId +
          ' is not voter-ready';
      }
    }

    const minReplicaCount =
      await this.getCriticalMinReplicaCount(
        operation.partitionId,
      );
    const projectedVoterReadyCount = Math.max(
      NUM.ZERO,
      currentVoterReadyRows.length - NUM.ONE,
    );
    if (projectedVoterReadyCount >= minReplicaCount) {
      return null;
    }

    return `Critical partition ${operation.partitionId}` +
      ' would drop voter-ready replicas below minimum' +
      ` (${projectedVoterReadyCount}/${minReplicaCount})`;
  }

  /**
   * Evaluate safety error for a move intent.
   * @param {Object} move
   * @return {Promise<string|null>}
   */
  async getMoveSafetyError(move) {
    if (!move) {
      return null;
    }
    const normalizedType = typeof move.type === 'string' ?
      move.type.toUpperCase() :
      move.type;
    const operation = {
      type: normalizedType,
      partitionId: move.partitionId || move.entityId,
      replicaId: move.replicaId,
      targetNodeId: move.nodeId,
      workflowStep: WORKFLOW_STEP.PENDING,
    };
    return this.getRemoveSafetyError(operation);
  }


  // --- Observed-progress reconciliation ---

  /**
   * @param {Object} operation
   * @return {boolean}
   */
  isObservedProgressOperationCandidate(operation) {
    if (!operation ||
        this.repository.isOperationTerminal(operation) ||
        !this.repository.isOperationLocallyOwned(operation)) {
      return false;
    }

    if (OBSERVED_PROGRESS_RELEVANT_WORKFLOW_STEPS.has(
      operation.workflowStep,
    )) {
      return true;
    }

    return operation.type === OperationType.REPLACE &&
      operation.workflowStep === WORKFLOW_STEP.ACTIVE;
  }

  /**
   * @param {Object} serviceRow
   * @param {string} cacheOperation
   * @return {string[]}
   */
  findObservedProgressOperationIds(serviceRow, cacheOperation) {
    if (!serviceRow || typeof serviceRow !== 'object') {
      return [];
    }

    if (cacheOperation !== 'DELETE') {
      const status =
        String(serviceRow.status || '').toLowerCase();
      if (!OBSERVED_PROGRESS_RELEVANT_SERVICE_STATUSES
        .has(status)) {
        return [];
      }
    }

    const targetNodeId = String(
      serviceRow.node_id || serviceRow.nodeId || '',
    );
    const replicaId = String(
      serviceRow.service_id ||
        serviceRow.serviceId ||
        serviceRow.replica_id ||
        serviceRow.replicaId ||
        '',
    );
    const partitionId = String(
      serviceRow.partition_id ||
        serviceRow.partitionId ||
        '',
    );
    if (targetNodeId.length === NUM.ZERO ||
        (replicaId.length === NUM.ZERO &&
          partitionId.length === NUM.ZERO)) {
      return [];
    }

    const matchingRows =
      this.repository.filterReplicaOperationRowsFromCache(
        (row) => {
          const operation =
            this.repository.rowToOperation(row);
          if (!this.isObservedProgressOperationCandidate(
            operation,
          )) {
            return false;
          }
          if (operation.targetNodeId !== targetNodeId) {
            return false;
          }
          if (replicaId.length > NUM.ZERO &&
              operation.replicaId === replicaId) {
            return true;
          }
          return partitionId.length > NUM.ZERO &&
            operation.partitionId === partitionId;
        },
      ) || [];

    return [...new Set(matchingRows
      .map((row) =>
        row?.operation_id || row?.operationId || null,
      )
      .filter((opId) =>
        typeof opId === 'string' && opId.length > NUM.ZERO,
      ))];
  }

  /**
   * @param {string} operationId
   * @return {Promise<boolean>}
   */
  async reconcileObservedProgressOperation(operationId) {
    if (typeof operationId !== 'string' ||
        operationId.length === NUM.ZERO) {
      return false;
    }
    let operation =
      await this.repository.queryAuthoritativeOperationById(
        operationId,
        {
          requireOwnerRpcRead: true,
        },
      );
    if (!operation) {
      operation =
        await this.repository.queryAuthoritativeOperationById(
          operationId,
          {
            requireOwnerRpcRead: false,
          },
        );
    }
    if (!operation) {
      operation =
        await this.repository.queryOperationById(
          operationId,
        );
    }
    if (!this.isObservedProgressOperationCandidate(operation)) {
      return false;
    }
    return this.reconcileOperationProgress(operation);
  }

  /**
   * Observe services cache progress and re-enter the owner lane.
   * @param {string} tableName
   * @param {string} cacheOperation
   * @param {Object} record
   */
  handleObservedReplicaStateChange(
    tableName, cacheOperation, record,
  ) {
    if (this.isShuttingDown || !this.isInitialized ||
        tableName !== SYSTEM_TABLE_NAME.SERVICES) {
      return;
    }

    const operationIds =
      this.findObservedProgressOperationIds(
        record, cacheOperation,
      );
    for (const operationId of operationIds) {
      this.operationWorkflowRunExclusive(
        this.getOperationOwnerSingleFlightKey(operationId),
        () => this.reconcileObservedProgressOperation(
          operationId,
        ),
      ).catch((error) => {
        this.logger.error(
          REBALANCE_COORDINATOR_LOG_MSG
            .OBSERVED_PROGRESS_TRANSITION_FAILED,
          {
            operationId,
            tableName,
            cacheOperation,
            error: error.message,
          },
        );
      });
    }
  }


  // --- Reconciliation and timeout ---

  /**
   * Reconcile one in-flight operation against observed replica state.
   * @param {Object} operation
   * @return {Promise<boolean>}
   */
  async reconcileOperationProgress(operation) {
    if (!operation) {
      return false;
    }
    if (!this.repository.isOperationLocallyOwned(operation)) {
      return false;
    }

    if (operation.type === OperationType.REPLACE &&
        operation.workflowStep === WORKFLOW_STEP.ACTIVE) {
      await this.executeOperationInternal(operation);
      return true;
    }

    if (operation.workflowStep === WORKFLOW_STEP.STOPPING &&
        (operation.type === OperationType.REMOVE ||
          operation.type === OperationType.REPLACE)) {
      const removingReplicaId =
        operation.type === OperationType.REPLACE ?
          this.repository.getReplaceSourceReplicaId(
            operation,
          ) :
          operation.replicaId;
      const removingNodeId =
        operation.type === OperationType.REPLACE ?
          operation.sourceNodeId :
          operation.targetNodeId;
      if (!removingReplicaId) {
        await this.failOperation(
          operation,
          'Replica missing during STOPPING reconciliation',
        );
        return true;
      }

      const actualStatus =
        await this.getActualReplicaStatus(
          removingReplicaId,
          operation.partitionId,
          removingNodeId,
        );

      if (actualStatus === null ||
          (operation.type === OperationType.REPLACE &&
            actualStatus === ReplicaStatus.FAILED)) {
        await this.completeOperation(operation);
        return true;
      }

      if (actualStatus === ReplicaStatus.FAILED) {
        await this.failOperation(
          operation,
          'Replica failed during remove reconciliation',
        );
        return true;
      }

      const replayResult = await this.executeOperationInternal(operation);
      if (replayResult?.success === true &&
          replayResult.status !==
            ReplicaOperationResponseStatus.IN_PROGRESS) {
        return true;
      }

      return false;
    }

    if (operation.workflowStep !== WORKFLOW_STEP.PENDING &&
        operation.workflowStep !== WORKFLOW_STEP.SENDING &&
        operation.workflowStep !== WORKFLOW_STEP.CREATING &&
        operation.workflowStep !== WORKFLOW_STEP.SYNCING) {
      return false;
    }

    const actualStatus =
      await this.getReconciledReplicaStatus(
        operation.replicaId,
        operation.partitionId,
        operation.targetNodeId,
      );

    if (actualStatus === ReplicaStatus.CREATING &&
        (operation.workflowStep === WORKFLOW_STEP.PENDING ||
          operation.workflowStep === WORKFLOW_STEP.SENDING)) {
      await this.updateStep(
        operation, WORKFLOW_STEP.CREATING,
      );
      return true;
    }

    if (actualStatus === ReplicaStatus.SYNCING &&
        (operation.workflowStep === WORKFLOW_STEP.PENDING ||
          operation.workflowStep === WORKFLOW_STEP.SENDING ||
          operation.workflowStep === WORKFLOW_STEP.CREATING)) {
      await this.updateStep(
        operation, WORKFLOW_STEP.SYNCING,
      );
      return true;
    }

    if (actualStatus === ReplicaStatus.ACTIVE) {
      if (operation.type === OperationType.REPLACE) {
        const activeTransitionCommitted = await this.updateStep(
          operation, WORKFLOW_STEP.ACTIVE,
        );
        if (activeTransitionCommitted) {
          await this.executeOperationFromReconcilePath(operation);
        }
      } else {
        await this.completeOperation(operation);
      }
      return true;
    }

    if (actualStatus === ReplicaStatus.FAILED) {
      await this.failOperation(
        operation,
        'Replica failed during operation reconciliation',
      );
      return true;
    }

    return false;
  }

  /**
   * @param {string} step
   * @return {number}
   */
  getTimeoutForStep(step, operation = null) {
    switch (step) {
    case WORKFLOW_STEP.PENDING:
    case WORKFLOW_STEP.SENDING:
      return this.config.pendingTimeoutMs;
    case WORKFLOW_STEP.CREATING:
      return this.config.creatingTimeoutMs;
    case WORKFLOW_STEP.SYNCING: {
      const configuredTimeout = this.config.syncingTimeoutMs;
      const partitionId = operation?.partitionId || null;
      if (!isPriorityControlPlanePartition({partitionId})) {
        return configuredTimeout;
      }
      return Math.max(
        TIMEOUT_BUDGET_DEFAULT.MINIMUM_OPERATION_BUDGET_MS,
        Math.min(
          configuredTimeout,
          PRIORITY_CONTROL_PLANE_SYNCING_TIMEOUT_CAP_MS,
        ),
      );
    }
    case WORKFLOW_STEP.STOPPING:
      return this.config.removingTimeoutMs;
    default:
      return this.config.pendingTimeoutMs;
    }
  }

  /**
   * Per-operation timeout/progress reconciliation.
   * Called after reconcileOperationProgress returns false.
   * @param {Object} operation
   * @param {number} now
   * @return {Promise<void>}
   */
  async reconcileTimeoutOperation(operation, now) {
    const progressed =
      await this.reconcileOperationProgress(operation);
    if (progressed) {
      return;
    }

    const operationBudget = createTopLevelOperationBudget({
      configuredBudgetMs:
        TIMEOUT_BUDGET_DEFAULT
          .REBALANCE_OPERATION_BUDGET_MS,
      operationName: 'rebalance',
      startedAtMs:
        operation.createdAt || operation.updatedAt,
      now: () => now,
    });

    const stepTimeout = this.getTimeoutForStep(
      operation.workflowStep,
      operation,
    );
    const stepAllocation = createChildTimeoutBudget(
      operationBudget,
      {
        requestedBudgetMs: stepTimeout,
        minimumBudgetMs:
          TIMEOUT_BUDGET_DEFAULT
            .MINIMUM_OPERATION_BUDGET_MS,
        classification:
          TIMEOUT_BUDGET_CLASSIFICATION
            .REBALANCE_OPERATION_TIMEOUT,
        nestedOperation:
          `rebalance:${String(
            operation.workflowStep || 'unknown',
          ).toLowerCase()}`,
        now: () => now,
      },
    );

    const elapsed = now - operation.updatedAt;
    const stepExceeded = elapsed >= stepTimeout;
    const budgetExhausted = !stepAllocation.allowed;

    if (stepExceeded || budgetExhausted) {
      const timeoutClassification = budgetExhausted ?
        stepAllocation.timeoutClassification :
        buildTimeoutClassification({
          budget: operationBudget,
          classification:
            TIMEOUT_BUDGET_CLASSIFICATION
              .REBALANCE_OPERATION_TIMEOUT,
          nestedOperation:
            `rebalance:${String(
              operation.workflowStep || 'unknown',
            ).toLowerCase()}`,
          now: () => now,
        });

      this.logger.warn(
        REBALANCE_COORDINATOR_LOG_MSG.OPERATION_TIMED_OUT,
        {
          operationId: operation.operationId,
          workflowStep: operation.workflowStep,
          elapsed,
          timeout: stepTimeout,
          budgetExhausted,
          timeoutClassification,
        },
      );

      await this.failOperation(
        operation,
        `Timeout in ${operation.workflowStep} step ` +
          `after ${elapsed}ms`,
        {
          stepMetadata: {
            timeoutClassification,
            timeoutMs: stepTimeout,
            elapsedMs: elapsed,
            timedOutAtMs: now,
            budgetExhausted,
          },
        },
      );

      this.stats.operationsTimedOut++;
    }
  }

  /**
   * Check for timed out operations.
   * @return {Promise<void>}
   */
  async checkTimeouts() {
    if (this.isShuttingDown || !this.isInitialized) {
      return;
    }

    const now = Date.now();
    if (
      this.lastEmptyIncompleteOperationQueryAtMs > NUM.ZERO &&
      now - this.lastEmptyIncompleteOperationQueryAtMs <
        this.incompleteOperationQueryEmptyBackoffMs
    ) {
      return;
    }

    const canUseCacheObservationBoundary =
      this.repository.hasReplicaOperationCacheObservationBoundary();
    const cachedIncompleteOps = canUseCacheObservationBoundary ?
      await this.repository.queryIncompleteOperations({
        skipSqlFallbackWhenCacheEmpty: true,
      }) :
      [];
    if (cachedIncompleteOps.length > NUM.ZERO) {
      this.clearEmptyIncompleteOperationQueryDelay();
    } else if (canUseCacheObservationBoundary &&
        this.shouldDelayEmptyIncompleteOperationQuery(now)) {
      return;
    }

    const incompleteOps = cachedIncompleteOps.length > NUM.ZERO ?
      this.mergeIncompleteOperations(
        cachedIncompleteOps,
        await this.repository.queryIncompleteOperations({
          preferAuthoritativeRead: true,
        }),
      ) :
      await this.repository.queryIncompleteOperations();
    if (incompleteOps.length === NUM.ZERO) {
      this.lastEmptyIncompleteOperationQueryAtMs = now;
      return;
    }
    this.clearEmptyIncompleteOperationQueryDelay();

    for (const operation of incompleteOps) {
      if (!this.repository.isOperationLocallyOwned(
        operation,
      )) {
        continue;
      }
      if (this.repository.isOperationTerminal(operation)) {
        continue;
      }

      const singleFlightKey =
        this.getOperationOwnerSingleFlightKey(
          operation.operationId,
        );

      this.operationWorkflowRunExclusive(
        singleFlightKey,
        async () => {
          const authoritativeOperation =
            await this.repository.queryAuthoritativeOperationById(
              operation.operationId,
              {
                requireOwnerRpcRead: false,
              },
            );
          if (!authoritativeOperation) {
            return;
          }
          if (!this.repository.isOperationLocallyOwned(
            authoritativeOperation,
          )) {
            return;
          }
          if (this.repository.isOperationTerminal(
            authoritativeOperation,
          )) {
            return;
          }

          await this.reconcileTimeoutOperation(
            authoritativeOperation, Date.now(),
          );
        },
      ).catch((error) => {
        this.logger.error(
          REBALANCE_COORDINATOR_LOG_MSG
            .QUERY_OPERATIONS_FAILED,
          {
            operationId: operation.operationId,
            error: error.message,
            nodeId: this.nodeId,
          },
        );
      });
    }
  }


  // --- Executor outcome routing ---

  /**
   * Handle an executor outcome event.
   * @param {Object} outcome
   */
  handleExecutorOutcome(outcome) {
    if (this.isShuttingDown || !this.isInitialized) {
      return;
    }

    const operationId =
      outcome?.[EXECUTOR_OUTCOME_FIELD.OPERATION_ID];
    if (!operationId) {
      return;
    }

    const singleFlightKey =
      this.getOperationOwnerSingleFlightKey(operationId);

    this.operationWorkflowRunExclusive(
      singleFlightKey,
      () => this.reconcileExecutorOutcome(outcome),
    ).catch((error) => {
      this.logger.error(
        REBALANCE_COORDINATOR_LOG_MSG
          .OUTCOME_TRANSITION_FAILED,
        {
          operationId,
          outcomeType:
            outcome?.[EXECUTOR_OUTCOME_FIELD.OUTCOME_TYPE],
          error: error.message,
        },
      );
    });
  }

  /**
   * Reconcile a single executor outcome.
   * @param {Object} outcome
   * @return {Promise<boolean>}
   */
  async reconcileExecutorOutcome(outcome) {
    const operationId =
      outcome[EXECUTOR_OUTCOME_FIELD.OPERATION_ID];
    const outcomeType =
      outcome[EXECUTOR_OUTCOME_FIELD.OUTCOME_TYPE];
    const workflowStep =
      outcome[EXECUTOR_OUTCOME_FIELD.WORKFLOW_STEP];
    const errorMessage =
      outcome[EXECUTOR_OUTCOME_FIELD.ERROR_MESSAGE];

    this.logger.debug(
      REBALANCE_COORDINATOR_LOG_MSG.OUTCOME_RECEIVED,
      {operationId, outcomeType, workflowStep},
    );

    const operation =
      await this.repository.queryOperationById(operationId);
    if (!operation) {
      this.logger.debug(
        REBALANCE_COORDINATOR_LOG_MSG
          .OUTCOME_OPERATION_NOT_FOUND,
        {operationId, outcomeType},
      );
      return false;
    }

    if (this.repository.isOperationTerminal(operation)) {
      this.logger.debug(
        REBALANCE_COORDINATOR_LOG_MSG
          .OUTCOME_OPERATION_TERMINAL,
        {
          operationId,
          outcomeType,
          step: operation.workflowStep,
        },
      );
      return false;
    }

    if (!this.repository.isOperationLocallyOwned(operation)) {
      this.logger.debug(
        REBALANCE_COORDINATOR_LOG_MSG
          .OUTCOME_OPERATION_NOT_LOCAL,
        {operationId, outcomeType},
      );
      return false;
    }

    const mapping = EXECUTOR_OUTCOME_ACTION_MAP[outcomeType];
    if (!mapping) {
      this.logger.warn(
        REBALANCE_COORDINATOR_LOG_MSG
          .OUTCOME_UNKNOWN_ACTION,
        {operationId, outcomeType},
      );
      return false;
    }

    if (mapping.action ===
        EXECUTOR_OUTCOME_ACTION.UPDATE_STEP) {
      await this.updateStep(
        operation,
        workflowStep,
        OPERATION_TRANSITION_REASON.EXECUTOR_OUTCOME,
      );
    } else if (mapping.action ===
        EXECUTOR_OUTCOME_ACTION.COMPLETE) {
      await this.completeOperation(operation);
    } else if (mapping.action ===
        EXECUTOR_OUTCOME_ACTION.FAIL) {
      await this.failOperation(
        operation,
        errorMessage || outcomeType,
      );
    } else {
      this.logger.warn(
        REBALANCE_COORDINATOR_LOG_MSG
          .OUTCOME_UNKNOWN_ACTION,
        {
          operationId,
          outcomeType,
          action: mapping.action,
        },
      );
      return false;
    }

    this.emitter.emit(
      REBALANCE_COORDINATOR_EVENT.OUTCOME_ROUTED,
      {operationId, outcomeType, action: mapping.action},
    );

    return true;
  }

  // --- Recovery ---

  /**
   * @param {string} step
   * @return {boolean}
   */
  isPreSyncStep(step) {
    return [
      WORKFLOW_STEP.PENDING,
      WORKFLOW_STEP.SENDING,
      WORKFLOW_STEP.CREATING,
    ].includes(step);
  }

  /**
   * Per-operation recovery logic.
   * @param {Object} op
   * @return {Promise<void>}
   */
  async reconcileRecoveryOperation(op) {
    if (this.isPreSyncStep(op.workflowStep)) {
      await this.failOperation(
        op, 'Node recovery - incomplete operation',
      );
      this.logger.info(
        REBALANCE_COORDINATOR_LOG_MSG.RECOVERY_MARK_FAILED,
        {
          operationId: op.operationId,
          workflowStep: op.workflowStep,
          partitionId: op.partitionId,
        },
      );
    } else if (op.workflowStep === WORKFLOW_STEP.SYNCING) {
      await this.reconcileSyncingOperation(op);
    } else if (op.workflowStep === WORKFLOW_STEP.STOPPING) {
      await this.failOperation(
        op,
        'Node recovery - incomplete removal operation',
      );
      this.logger.info(
        REBALANCE_COORDINATOR_LOG_MSG
          .RECOVERY_MARK_REMOVE_FAILED,
        {
          operationId: op.operationId,
          workflowStep: op.workflowStep,
          partitionId: op.partitionId,
        },
      );
    }
  }

  /**
   * Reconcile a SYNCING operation by checking actual replica status.
   * @param {Object} operation
   * @return {Promise<void>}
   */
  async reconcileSyncingOperation(operation) {
    this.logger.info(
      REBALANCE_COORDINATOR_LOG_MSG.RECONCILE_SYNCING,
      {
        operationId: operation.operationId,
        partitionId: operation.partitionId,
        targetNodeId: operation.targetNodeId,
      },
    );

    const actualStatus =
      await this.getReconciledReplicaStatus(
        operation.replicaId,
        operation.partitionId,
        operation.targetNodeId,
      );

    this.repository.emitReplicaStatusDivergence(
      operation.replicaId,
      actualStatus,
      SQL_RECONCILIATION_REASON.RECOVERY_REPLICA_STATUS,
    );

    if (actualStatus === ReplicaStatus.ACTIVE) {
      if (operation.type === OperationType.REPLACE) {
        const activeTransitionCommitted = await this.updateStep(
          operation,
          WORKFLOW_STEP.ACTIVE,
        );
        if (activeTransitionCommitted) {
          await this.executeOperationFromReconcilePath(operation);
        }
      } else {
        await this.completeOperation(operation);
      }
      this.logger.info(
        REBALANCE_COORDINATOR_LOG_MSG.RECONCILE_ACTIVE,
        {
          operationId: operation.operationId,
          partitionId: operation.partitionId,
        },
      );
    } else if (actualStatus === ReplicaStatus.FAILED) {
      await this.failOperation(
        operation, 'Replica failed during sync',
      );
      this.logger.info(
        REBALANCE_COORDINATOR_LOG_MSG.RECONCILE_FAILED,
        {
          operationId: operation.operationId,
          partitionId: operation.partitionId,
        },
      );
    } else if (actualStatus === null) {
      await this.failOperation(
        operation,
        'Replica not found during recovery reconciliation',
      );
      this.logger.warn(
        REBALANCE_COORDINATOR_LOG_MSG
          .RECONCILE_FAILED_NOT_FOUND,
        {
          operationId: operation.operationId,
          partitionId: operation.partitionId,
        },
      );
    } else {
      this.logger.info(
        REBALANCE_COORDINATOR_LOG_MSG
          .RECONCILE_IN_PROGRESS,
        {
          operationId: operation.operationId,
          partitionId: operation.partitionId,
          actualStatus,
        },
      );
    }
  }

  /**
   * Handle node recovery.
   * @return {Promise<Object>}
   */
  async handleRecovery() {
    this.logger.info(
      REBALANCE_COORDINATOR_LOG_MSG.RECOVERY_START,
      {nodeId: this.nodeId},
    );

    const result = {
      totalIncomplete: NUM.ZERO,
      markedFailed: NUM.ZERO,
      reconciled: NUM.ZERO,
      errors: [],
    };

    const incompleteOps =
      await this.repository.queryIncompleteOperations({
        preferAuthoritativeRead: true,
      });
    result.totalIncomplete = incompleteOps.length;

    this.logger.info(
      REBALANCE_COORDINATOR_LOG_MSG.RECOVERY_FOUND,
      {count: incompleteOps.length, nodeId: this.nodeId},
    );

    for (const op of incompleteOps) {
      if (!this.repository.isOperationLocallyOwned(op)) {
        continue;
      }

      const originalStep = op.workflowStep;

      const singleFlightKey =
        this.getOperationOwnerSingleFlightKey(
          op.operationId,
        );

      try {
        await this.operationWorkflowRunExclusive(
          singleFlightKey,
          () => this.reconcileRecoveryOperation(op),
        );
      } catch (error) {
        result.errors.push({
          operationId: op.operationId,
          error: error.message,
        });
        this.logger.error(
          REBALANCE_COORDINATOR_LOG_MSG
            .RECOVERY_MARK_FAILED,
          {
            operationId: op.operationId,
            workflowStep: originalStep,
            partitionId: op.partitionId,
            error: error.message,
          },
        );
        continue;
      }

      if (this.isPreSyncStep(originalStep) ||
          originalStep === WORKFLOW_STEP.STOPPING) {
        result.markedFailed++;
      } else if (originalStep === WORKFLOW_STEP.SYNCING) {
        result.reconciled++;
      }
    }

    this.logger.info(
      REBALANCE_COORDINATOR_LOG_MSG.RECOVERY_COMPLETED,
      {nodeId: this.nodeId, ...result},
    );

    const reservationResult =
      await this.reconcileReservations();
    result.reservationsExpired = reservationResult.expired;
    result.reservationsOrphansReleased =
      reservationResult.orphansReleased;

    this.emitter.emit(
      REBALANCE_COORDINATOR_EVENT.RECOVERY_COMPLETED,
      result,
    );

    return result;
  }

  // --- Helpers ---

  /**
   * @param {string} errorMessage
   * @return {boolean}
   */
  isSafetyPolicyFailure(errorMessage) {
    if (typeof errorMessage !== 'string' || !errorMessage) {
      return false;
    }
    const normalized = errorMessage.toLowerCase();
    return normalized.includes(
      'would drop voter-ready replicas below minimum',
    ) ||
      normalized.includes('safety check unavailable') ||
      normalized.includes('replacement replica');
  }

  /**
   * @param {Object} operation
   * @param {boolean} replaceRemovePhase
   * @param {string} removeSafetyError
   * @return {boolean}
   */
  async getRemoveSafetyDeferReason(
    operation,
    replaceRemovePhase,
    removeSafetyError,
  ) {
    if (!operation || !this.isSafetyPolicyFailure(removeSafetyError)) {
      return null;
    }
    if (operation.type === OperationType.REPLACE && replaceRemovePhase) {
      return REBALANCE_COORDINATOR_DEFER_REASON
        .REPLACE_REMOVE_SAFETY_BLOCKED;
    }
    if (operation.type !== OperationType.REMOVE ||
        !await this.isCriticalRemoveOverReplicated(operation)) {
      return null;
    }
    return REBALANCE_COORDINATOR_DEFER_REASON
      .REMOVE_SAFETY_BLOCKED;
  }

  /**
   * @param {Object} operation
   * @return {Promise<boolean>}
   */
  async isCriticalRemoveOverReplicated(operation) {
    if (!operation ||
        operation.type !== OperationType.REMOVE ||
        !this.isCriticalSystemPartition(operation.partitionId)) {
      return false;
    }
    const systemTableCache = this.repository.systemTableCache;
    if (!systemTableCache ||
        typeof systemTableCache.filter !== 'function') {
      return false;
    }
    const criticalReplicaRows = systemTableCache.filter(
      SYSTEM_TABLE_NAME.SERVICES,
      (row) =>
        row.partition_id === operation.partitionId &&
        row.service_type === SERVICE_TYPE.PARTITION,
    ) || [];
    const minReplicaCount = await this.getCriticalMinReplicaCount(
      operation.partitionId,
    );
    return criticalReplicaRows.length > minReplicaCount;
  }

  /**
   * @param {string|null|undefined} operationId
   * @return {void}
   */
  clearDeferredSafetyBlockState(operationId) {
    if (typeof operationId !== 'string' ||
        operationId.length === NUM.ZERO) {
      return;
    }
    this.safetyDeferredLogStateByOperationId
      .delete(operationId);
  }

  /**
   * @param {Object} operation
   * @param {string} errorMessage
   * @return {void}
   */
  logDeferredSafetyBlockedRemove(
    operation,
    errorMessage,
    deferReason,
  ) {
    const operationId = operation?.operationId;
    if (typeof operationId !== 'string' ||
        operationId.length === NUM.ZERO) {
      return;
    }
    const now = Date.now();
    const previousState =
      this.safetyDeferredLogStateByOperationId
        .get(operationId) || null;
    const errorChanged = previousState?.errorMessage !==
      errorMessage;
    const throttleElapsed = !previousState ||
      now - previousState.loggedAtMs >=
        SAFETY_DEFERRED_LOG_THROTTLE_MS;

    this.safetyDeferredLogStateByOperationId.set(
      operationId,
      {
        errorMessage,
        loggedAtMs: now,
      },
    );

    if (!errorChanged && !throttleElapsed) {
      return;
    }

    this.logger.warn(
      REBALANCE_COORDINATOR_LOG_MSG
        .OPERATION_DEFERRED_BY_SAFETY_POLICY,
      {
        operationId,
        partitionId: operation.partitionId,
        sourceNodeId: operation.sourceNodeId,
        targetNodeId: operation.targetNodeId,
        workflowStep: operation.workflowStep,
        reason: deferReason,
        errorMessage,
      },
    );
  }

  /**
   * @param {*} errorLike
   * @param {string} fallbackMessage
   * @return {string}
   */
  normalizeErrorMessage(errorLike, fallbackMessage) {
    if (typeof errorLike === 'string' && errorLike.trim()) {
      return errorLike;
    }

    if (!errorLike || typeof errorLike !== 'object') {
      return fallbackMessage;
    }

    const candidateValues = [
      errorLike.message,
      errorLike.errorMessage,
      errorLike.error?.message,
      errorLike.error?.errorMessage,
      errorLike.details?.message,
      errorLike.details?.errorMessage,
    ];

    for (const candidate of candidateValues) {
      if (typeof candidate === 'string' &&
          candidate.trim()) {
        return candidate;
      }
    }

    return fallbackMessage;
  }
}

export {OperationWorkflowOwner};
