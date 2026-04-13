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
  ControlPlaneField,
  ControlPlaneMessageType,
} from '../control-plane/control-plane-constants.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../control-plane/control-plane-readiness-constants.js';
import {
  getControlPlaneRetryAfterMs,
  isRetryableControlPlaneError,
} from '../control-plane/control-plane-error-classification.js';
import {
  resolvePriorityRecoveryActiveNodeCohort,
} from '../control-plane/active-node-projection.js';
import {
  buildPriorityRecoveryBlockedPartitionIds,
  hasPriorityRecoverySpreadGap,
} from '../control-plane/priority-recovery-snapshot.js';
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
  buildControlPlaneQueryOptions,
  buildTimeoutClassification,
  createChildTimeoutBudget,
  createTopLevelOperationBudget,
} from '../control-plane/timeout-budget.js';
import {
  readAuthoritativeControlPlaneRows,
} from '../control-plane/control-plane-system-table-gateway.js';
import {
  OPERATION_METADATA_KEY,
  ReplicaStatus,
  WORKFLOW_STEP_TO_STATUS,
  OperationType,
  getWorkflowSteps,
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
  TRANSACTION_STATUS,
} from '../query/distributed/distributed-transaction-coordinator.js';
import {
  QUERY_ERROR_MSG,
} from '../query/query-constants.js';
import {
  PARTITION_SERVICE_ERROR_MSG,
} from '../partition/partition-service-constants.js';
import {
  SQL_RECONCILIATION_REASON,
} from '../control-plane/read-model-contract.js';
const OPERATION_WORKFLOW_OWNER_LITERAL = Object.freeze({
  CLOSE_PAREN: ")",
  COMMA_SPACE: ", ",
  COMMITTED_REPLICA_OPERATION_TRANSITION_NOT_YET_AUTHORITATIVELY_VISIBLE: "Committed replica operation transition not yet authoritatively visible",
  CONTROL_PLANE_PRESSURE_DEGRADED: "CONTROL_PLANE_PRESSURE_DEGRADED",
  CONTROL_PLANE_PRESSURE_DEGRADED_WHILE_CLAIMING_PRIORITY: "control_plane_pressure_degraded while claiming priority ",
  COORDINATOR_CREATED_OPERATION: "coordinator_created_operation",
  COORDINATOR_CREATED_REMOTE_HANDOFF: "coordinator_created_remote_handoff",
  CRITICAL: "critical",
  CRITICAL_PARTITION: "Critical partition ",
  DELETE: "DELETE",
  DISPATCH: "dispatch",
  DISPATCH_RETRY: "dispatch_retry",
  DISPATCH_TRANSITION: "dispatch transition",
  EMPTY_JSON_ARRAY: "[]",
  EMPTY_STRING: "",
  EXECUTE: "execute",
  EXECUTE_RECONCILE: "execute_reconcile",
  EXECUTOR_OUTCOME: "executor_outcome",
  FAILED_TO_READ_AUTHORITATIVE_TRANSITION_PARTICIPANT_STATE: "Failed to read authoritative transition participant state",
  FAILED_TO_READ_AUTHORITATIVE_TRANSITION_TRANSACTION_STATE: "Failed to read authoritative transition transaction state",
  FAILED_TO_RECOVER_TRANSITION_TRANSACTION: "Failed to recover transition transaction",
  FAILED_TO_RESOLVE_MINREPLICACOUNT_FOR_CRITICAL: "Failed to resolve minReplicaCount for critical",
  FAILED_TO_ROLL_BACK_TRANSITION_TRANSACTION: "Failed to roll back transition transaction",
  FUNCTION: "function",
  IN_PROGRESS: "in_progress",
  IS_NO_LONGER_IN_THE_CURRENT_ELIGIBLE_COHORT_FOR: " is no longer in the current eligible cohort for ",
  IS_NOT_VOTER_DASH_READY: " is not voter-ready",
  IS_UNAVAILABLE: " is unavailable",
  NODE_RECOVERY_DASH_INCOMPLETE_OPERATION: "Node recovery - incomplete operation",
  NODE_RECOVERY_DASH_INCOMPLETE_REMOVAL_OPERATION: "Node recovery - incomplete removal operation",
  OBJECT: "object",
  OBSERVED: "observed",
  OBSERVED_PROGRESS: "observed_progress",
  OPEN_PAREN: " (",
  OPERATIONWORKFLOWOWNER_REQUIRES_GETACTUALREPLICASTATUS_OPEN_PAREN_CLOSE_PAREN: "OperationWorkflowOwner requires getActualReplicaStatus()",
  PARTITION_SAFETY_CHECK: " partition safety check",
  PRIORITY_CLAIM_CAS: "priority_claim_cas",
  PRIORITY_CONTROL_DASH_PLANE_PARTITION: "Priority control-plane partition ",
  PRIORITY_RECOVERY_TARGET_NODE: "Priority recovery target node ",
  PRIORITY_SPREAD: "priority spread",
  PRIORITY_SPREAD_HAS_NOT_CONVERGED: " priority spread has not converged",
  PROGRESS: "progress",
  PROJECTED_VOTER_DASH_READY_SPREAD: "projected voter-ready spread",
  PROJECTED_VOTER_DASH_READY_SPREAD_WOULD_FALL_BELOW_THE_PUBLISHED: " projected voter-ready spread would fall below the published ",
  PUBLISHED_MEMBERSHIP: "published membership",
  PUBLISHED_MEMBERSHIP_SAFETY_IS_UNAVAILABLE: " published membership safety is unavailable",
  QUESTION_MARK: "?",
  RECOVERY: "recovery",
  REPLACE_SOURCE_REMOVAL: "replace_source_removal",
  REPLACEMENT_REPLICA: " replacement replica",
  REPLACEMENT_REPLICA_2: " replacement replica ",
  REPLACEMENT_REPLICA_3: "replacement replica",
  REPLICA_FAILED_DURING_OPERATION_RECONCILIATION: "Replica failed during operation reconciliation",
  REPLICA_FAILED_DURING_REMOVE_RECONCILIATION: "Replica failed during remove reconciliation",
  REPLICA_FAILED_DURING_SYNC: "Replica failed during sync",
  REPLICA_MISSING_DURING_STOPPING_RECONCILIATION: "Replica missing during STOPPING reconciliation",
  REPLICA_NOT_FOUND_DURING_RECOVERY_RECONCILIATION: "Replica not found during recovery reconciliation",
  REQUIREMENT: "requirement",
  RETRYABLE_CONTROL_DASH_PLANE_TRANSITION_FAILURE: "Retryable control-plane transition failure",
  ROTATING_TRANSITION_EXECUTION_SESSION_AFTER_STALE_SESSION_COLLISION: "Rotating transition execution session after stale session collision",
  SAFETY_CHECK_UNAVAILABLE: " safety check unavailable",
  SAFETY_CHECK_UNAVAILABLE_2: "safety check unavailable",
  STRING: "string",
  TRANSACTION: "transaction",
  TRANSITION_RETRY_RESUME: "transition_retry_resume",
  TRANSITION_SESSION_RECOVERY_PROBE_FAILED: "Transition session recovery probe failed",
  WOULD_DROP_VOTER_DASH_READY_REPLICAS_BELOW_MINIMUM: " would drop voter-ready replicas below minimum",
  WOULD_DROP_VOTER_DASH_READY_REPLICAS_BELOW_MINIMUM_2: "would drop voter-ready replicas below minimum",
});


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

const OPERATION_OWNER_ACTION = Object.freeze({
  DISPATCH: 'dispatch',
  EXECUTE: 'execute',
});

const OPERATION_LIFECYCLE_ACTION = Object.freeze({
  FAIL_PRE_SYNC_RECOVERY: 'fail_pre_sync_recovery',
  FAIL_STOPPING_RECOVERY: 'fail_stopping_recovery',
  EXECUTE_ACTIVE_REPLACE: 'execute_active_replace',
  EXECUTE_REMOVE_DISPATCH: 'execute_remove_dispatch',
  RECONCILE_STOPPING: 'reconcile_stopping',
  RECONCILE_REPLICA_STATUS: 'reconcile_replica_status',
  NOOP: 'noop',
});

const OPERATION_SINGLE_FLIGHT_KEY_SEPARATOR = ':';

const OPERATION_WORKFLOW_OWNER_REASON = Object.freeze({
  OPERATION_ID_REQUIRED: 'operation_id_required',
  OPERATION_NOT_DISPATCHABLE: 'operation_not_dispatchable',
  OPERATION_NOT_FOUND: 'operation_not_found',
  SHUTDOWN_IN_PROGRESS: 'shutdown_in_progress',
});

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
const SAFETY_DEFERRED_RETRY_DELAY_MS = TIME_MS.SECOND;
const OBSERVED_PROGRESS_RETRY_DELAY_MS = TIME_MS.SECOND / 4;
const DISPATCH_RETRY_DELAY_MS = TIME_MS.SECOND / 4;
const COORDINATOR_CREATED_REMOTE_HANDOFF_VERIFICATION_DELAY_MS =
  TIME_MS.SECOND;
const TRANSITION_RETRY_DELAY_MS = TIME_MS.SECOND / 4;

const TRANSITION_STEP_OPTIONS = Object.freeze({
  DEFER_COMMITTED_MARK: Object.freeze({
    markCommitted: false,
  }),
});

const OPERATION_TRANSITION_SESSION_ATTEMPT_PREFIX = 'attempt';
const PRIORITY_CONTROL_PLANE_SYNCING_TIMEOUT_CAP_MS =
  TIME_MS.MINUTE * NUM.TWO;
const RECOVERABLE_TRANSITION_COMMIT_STATUS = Object.freeze(
  new Set([
    TRANSACTION_STATUS.PREPARED,
    TRANSACTION_STATUS.COMMITTING,
  ]),
);
const RECOVERABLE_TRANSITION_ROLLBACK_STATUS = Object.freeze(
  new Set([
    TRANSACTION_STATUS.ACTIVE,
    TRANSACTION_STATUS.PREPARING,
    TRANSACTION_STATUS.ROLLING_BACK,
  ]),
);
const AUTHORITATIVE_TRANSITION_RECOVERY_STATUS = Object.freeze(
  new Set([
    ...RECOVERABLE_TRANSITION_COMMIT_STATUS,
    ...RECOVERABLE_TRANSITION_ROLLBACK_STATUS,
  ]),
);
const TRANSITION_RECOVERY_READ_OPTIONS = Object.freeze({
  ...buildControlPlaneQueryOptions(),
  routingReadinessDimension:
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
  preferOwnerRpcRead: true,
  requireOwnerRpcRead: true,
  allowOwnerRpcFallback: true,
  allowSqlFallback: false,
});
const TRANSITION_RECOVERY_SQL = Object.freeze({
  SELECT_TRANSACTIONS_BY_SESSION:
    'SELECT * FROM sql_transactions WHERE session_id = ?',
});
const REMOVE_SAFETY_READ_QUERY_OPTIONS = Object.freeze({
  ...buildControlPlaneQueryOptions(),
  routingReadinessDimension:
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
  preferOwnerRpcRead: true,
  requireOwnerRpcRead: false,
  allowOwnerRpcFallback: true,
  allowSqlFallback: true,
});
const REMOVE_SAFETY_SQL = Object.freeze({
  SELECT_PARTITION_REPLICA_ROWS:
    'SELECT * FROM services WHERE service_type = ? AND partition_id = ?',
});

function normalizeNodeIdList(nodeIds) {
  return [...new Set(
    (Array.isArray(nodeIds) ? nodeIds : [])
      .map((nodeId) =>
        typeof nodeId === TYPEOF.STRING ?
          nodeId.trim() :
          OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING)
      .filter((nodeId) => nodeId.length > NUM.ZERO),
  )];
}

function buildSelectRowsByTransactionIdsSql(tableName, transactionIds) {
  return `SELECT * FROM ${tableName} WHERE transaction_id IN (${transactionIds
    .map(() => OPERATION_WORKFLOW_OWNER_LITERAL.QUESTION_MARK)
    .join(OPERATION_WORKFLOW_OWNER_LITERAL.COMMA_SPACE)})`;
}


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
  * @param {Function} [options.setTimeoutFn] - Deferred retry timer factory.
  * @param {Function} [options.clearTimeoutFn] - Deferred retry timer cleanup.
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
    this.setTimeoutFn = typeof options.setTimeoutFn === TYPEOF.FUNCTION ?
      options.setTimeoutFn :
      setTimeout;
    this.clearTimeoutFn = typeof options.clearTimeoutFn === TYPEOF.FUNCTION ?
      options.clearTimeoutFn :
      clearTimeout;
    this.lastEmptyIncompleteOperationQueryAtMs = NUM.ZERO;
    this.incompleteOperationQueryEmptyBackoffMs =
      options.incompleteOperationQueryEmptyBackoffMs || NUM.ZERO;
    this.safetyDeferredLogStateByOperationId =
      new Map();
    this.safetyDeferredRetryTimerByOperationId =
      new Map();
    this.observedProgressRetryTimerByOperationId =
      new Map();
    this.dispatchRetryTimerByOperationId =
      new Map();
    this.createdOperationHandoffRetryTimerByOperationId =
      new Map();
    this.transitionRetryTimerByOperationId =
      new Map();
    this.transitionRetryGraceDeadlineByOperationId =
      new Map();
    this.transitionExecutionAttemptByStepOwnerKey =
      new Map();

    if (typeof this.getActualReplicaStatus !== OPERATION_WORKFLOW_OWNER_LITERAL.FUNCTION) {
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
    for (const timerHandle of this.safetyDeferredRetryTimerByOperationId
      .values()) {
      this.clearTimeoutFn(timerHandle);
    }
    this.safetyDeferredRetryTimerByOperationId.clear();
    for (const timerHandle of this.observedProgressRetryTimerByOperationId
      .values()) {
      this.clearTimeoutFn(timerHandle);
    }
    this.observedProgressRetryTimerByOperationId.clear();
    for (const timerHandle of this.dispatchRetryTimerByOperationId
      .values()) {
      this.clearTimeoutFn(timerHandle);
    }
    this.dispatchRetryTimerByOperationId.clear();
    for (const timerHandle of this.createdOperationHandoffRetryTimerByOperationId
      .values()) {
      this.clearTimeoutFn(timerHandle);
    }
    this.createdOperationHandoffRetryTimerByOperationId.clear();
    for (const timerHandle of this.transitionRetryTimerByOperationId
      .values()) {
      this.clearTimeoutFn(timerHandle);
    }
    this.transitionRetryTimerByOperationId.clear();
    this.transitionRetryGraceDeadlineByOperationId.clear();
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
    const timerHandle =
      this.dispatchRetryTimerByOperationId.get(operationId);
    if (!timerHandle) {
      return;
    }
    this.clearTimeoutFn(timerHandle);
    this.dispatchRetryTimerByOperationId.delete(operationId);
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
    const timerHandle =
      this.transitionRetryTimerByOperationId.get(operationId);
    if (!timerHandle) {
      this.transitionRetryGraceDeadlineByOperationId.delete(operationId);
      return;
    }
    this.clearTimeoutFn(timerHandle);
    this.transitionRetryTimerByOperationId.delete(operationId);
    this.transitionRetryGraceDeadlineByOperationId.delete(operationId);
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
    const graceDeadlineMs = Date.now() + Math.max(
      stepTimeout,
      Number.isFinite(delayMs) ? delayMs : NUM.ZERO,
    );
    const existingDeadlineMs = Number(
      this.transitionRetryGraceDeadlineByOperationId.get(operationId),
    );
    this.transitionRetryGraceDeadlineByOperationId.set(
      operationId,
      Number.isFinite(existingDeadlineMs) ?
        Math.max(existingDeadlineMs, graceDeadlineMs) :
        graceDeadlineMs,
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
      return workflowStep === WORKFLOW_STEP.ACTIVE ||
        workflowStep === WORKFLOW_STEP.STOPPING;
    }
    if (operation.type === OperationType.REMOVE &&
        workflowStep === WORKFLOW_STEP.STOPPING) {
      return true;
    }
    return workflowStep === WORKFLOW_STEP.PENDING ||
      workflowStep === WORKFLOW_STEP.SENDING;
  }

  /**
   * @param {Object} operation
   * @return {boolean}
   * @private
   */
  isRemoveInitialDispatchPhase(operation) {
    return operation?.type === OperationType.REMOVE &&
      (operation?.workflowStep === WORKFLOW_STEP.PENDING ||
        operation?.workflowStep === WORKFLOW_STEP.SENDING);
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
    return this.isRemoveInitialDispatchPhase(operation) ||
      this.repository.isReplaceRemoveDispatchPhase(operation);
  }

  /**
   * Critical control-plane operations must not rely only on timeout expiry to
   * retry first-hop dispatch progression. When observed replica status is
   * still absent in PENDING/SENDING, proactively re-arm dispatch through the
   * canonical owner path.
   *
   * @param {Object} operation
   * @param {string|null} actualStatus
   * @return {boolean}
   * @private
   */
  shouldRearmDispatchFromProgressReconcile(operation, actualStatus) {
    if (!operation) {
      return false;
    }
    const normalizedActualStatus =
      typeof actualStatus === TYPEOF.STRING ?
        actualStatus.toLowerCase() :
        actualStatus;
    if (normalizedActualStatus === ReplicaStatus.CREATING ||
        normalizedActualStatus === ReplicaStatus.SYNCING ||
        normalizedActualStatus === ReplicaStatus.ACTIVE ||
        normalizedActualStatus === ReplicaStatus.FAILED) {
      return false;
    }
    if (!this.isDispatchRetryableWorkflowStep(operation)) {
      return false;
    }
    if (this.isOperationStepTimedOut(operation)) {
      return false;
    }
    return this.isCriticalSystemPartition(operation.partitionId);
  }

  /**
   * @param {Object} operation
   * @param {Error|Object} errorLike
   * @return {boolean}
   * @private
   */
  deferDispatchRetry(operation, errorLike) {
    const operationId = operation?.operationId || null;
    if (!operationId ||
        !this.shouldDeferRetryableDispatchFailure(
          operation,
          errorLike,
        )) {
      return false;
    }
    if (this.dispatchRetryTimerByOperationId.has(operationId)) {
      return true;
    }
    const retryAfterMs = getControlPlaneRetryAfterMs(errorLike);
    const delayMs = Number.isFinite(retryAfterMs) && retryAfterMs > NUM.ZERO ?
      retryAfterMs :
      DISPATCH_RETRY_DELAY_MS;
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
            );
          if (!currentOperation ||
              this.repository.isOperationTerminal(currentOperation) ||
              !this.repository.isOperationLocallyOwned(currentOperation) ||
              !this.isDispatchRetryableWorkflowStep(currentOperation)) {
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
        this.handleDeferredDispatchRetryFailure(
          operation,
          retryError,
        );
      });
    }, delayMs);
    this.dispatchRetryTimerByOperationId.set(
      operationId,
      timerHandle,
    );
    return true;
  }

  /**
   * Deferred dispatch retries must tolerate cache-lagged reads after durable
   * replica_operations writes. Prefer the authoritative owner row before
   * falling back to the lighter query path so retry timers cannot silently
   * abandon freshly persisted PENDING operations.
   *
   * @param {string} operationId
   * @return {Promise<Object|null>}
   * @private
   */
  async getDeferredDispatchRetryOperation(operationId) {
    const authoritativeOperation =
      await this.repository.queryAuthoritativeOperationById(
        operationId,
        {
          requireOwnerRpcRead: false,
        },
      );
    if (authoritativeOperation) {
      return authoritativeOperation;
    }
    return this.repository.queryOperationById(operationId);
  }

  /**
   * @param {Object} operation
   * @param {Error|Object} error
   */
  handleDeferredDispatchRetryFailure(operation, error) {
    if (this.deferDispatchRetry(operation, error)) {
      return;
    }
    if (this.deferTransitionRetry(
      operation?.operationId || null,
      error,
      {
        boundary: OPERATION_WORKFLOW_OWNER_LITERAL.DISPATCH_RETRY,
        partitionId: operation?.partitionId || null,
        workflowStep: operation?.workflowStep || null,
      },
    )) {
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
    if (!operationId ||
        !this.isSafetyDeferredRetryableOperation(operation)) {
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
          const authoritativeOperation =
            await this.repository.queryAuthoritativeOperationById(
              operationId,
              {
                requireOwnerRpcRead: false,
              },
            );
          const currentOperation = authoritativeOperation ||
            await this.repository.queryOperationById(operationId);
          if (!currentOperation ||
              this.repository.isOperationTerminal(currentOperation) ||
              !this.repository.isOperationLocallyOwned(currentOperation) ||
              !this.isSafetyDeferredRetryableOperation(currentOperation)) {
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
        if (this.deferTransitionRetry(
          operationId,
          retryError,
          {
            boundary: 'safety_retry',
            partitionId: operation?.partitionId || null,
            workflowStep: operation?.workflowStep || null,
          },
        )) {
          return;
        }
        this.logger.error(
          REBALANCE_COORDINATOR_LOG_MSG.OPERATION_DISPATCH_RETRY_FAILED,
          {
            operationId,
            partitionId: operation?.partitionId || null,
            workflowStep: operation?.workflowStep || null,
            deferReason,
            error: retryError?.message ||
              retryError?.error ||
              String(retryError),
          },
        );
      });
    }, SAFETY_DEFERRED_RETRY_DELAY_MS);
    this.safetyDeferredRetryTimerByOperationId.set(
      operationId,
      timerHandle,
    );
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
    if (this.hasActiveTransitionRetryGrace(
      operation.operationId,
      now,
    )) {
      return false;
    }
    const updatedAt = Number(operation.updatedAt);
    if (!Number.isFinite(updatedAt)) {
      return false;
    }
    return now - updatedAt >=
      this.getTimeoutForStep(
        operation.workflowStep,
        operation,
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
    const authoritativeOperation =
      await this.repository.queryAuthoritativeOperationById(
        operationId,
        {
          requireOwnerRpcRead: false,
        },
      );
    const operation = authoritativeOperation ||
      await this.repository.queryOperationById(operationId);
    if (!operation ||
        this.repository.isOperationTerminal(operation) ||
        !this.repository.isOperationLocallyOwned(operation)) {
      return;
    }

    const now = Date.now();
    if (this.isDispatchRetryableWorkflowStep(operation) &&
        (this.hasActiveTransitionRetryGrace(operationId, now) ||
          !this.isOperationStepTimedOut(operation, now))) {
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
    if (!operationId || !isRetryableControlPlaneError(errorLike)) {
      return false;
    }
    const retryAfterMs = getControlPlaneRetryAfterMs(errorLike);
    const delayMs = Number.isFinite(retryAfterMs) && retryAfterMs > NUM.ZERO ?
      retryAfterMs :
      TRANSITION_RETRY_DELAY_MS;
    this.recordTransitionRetryGrace(
      operationId,
      context,
      delayMs,
    );
    if (this.transitionRetryTimerByOperationId.has(operationId)) {
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
        () => this.resumeDeferredTransitionOperation(
          operationId,
        ),
      ).catch((retryError) => {
        this.handleDeferredTransitionRetryFailure(
          operationId,
          retryError,
          context,
        );
      });
    }, delayMs);
    this.transitionRetryTimerByOperationId.set(
      operationId,
      timerHandle,
    );
    return true;
  }

  /**
   * @param {string|null} operationId
   * @param {Error|Object} error
   * @param {Object} [context]
   */
  handleDeferredTransitionRetryFailure(
    operationId,
    error,
    context = {},
  ) {
    if (this.deferTransitionRetry(
      operationId,
      error,
      context,
    )) {
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
    if (!operation ||
        typeof this.repository?.resolveOperationOwnerNodeId !==
          TYPEOF.FUNCTION) {
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
    return typeof ownerNodeId === TYPEOF.STRING &&
      ownerNodeId.length > NUM.ZERO &&
      ownerNodeId === this.nodeId;
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
    return this.isCriticalSystemPartition(operation?.partitionId || null);
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
    if (!operationId ||
        !this.shouldRetryCoordinatorCreatedRemoteHandoff(operation)) {
      return false;
    }

    const replaceExisting = options.replaceExisting === true;
    if (this.createdOperationHandoffRetryTimerByOperationId.has(operationId)) {
      if (!replaceExisting) {
        return true;
      }
      this.clearCreatedOperationHandoffRetry(operationId);
    }

    const operationSnapshot =
      this.cloneOperationSnapshot(operation) || {operationId};
    const timerHandle = this.setTimeoutFn(() => {
      this.createdOperationHandoffRetryTimerByOperationId.delete(operationId);
      if (this.isShuttingDown || !this.isInitialized) {
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

  /**
   * @param {Object|null} operation
   * @param {Error|Object|null} errorLike
   * @return {boolean}
   * @private
   */
  deferCoordinatorCreatedRemoteHandoffRetry(operation, errorLike) {
    const operationId = operation?.operationId || null;
    if (!operationId ||
        !this.shouldRetryCoordinatorCreatedRemoteHandoff(operation) ||
        !isRetryableControlPlaneError(errorLike)) {
      return false;
    }
    if (this.createdOperationHandoffRetryTimerByOperationId.has(operationId)) {
      return true;
    }

    const retryAfterMs = getControlPlaneRetryAfterMs(errorLike);
    const delayMs = Number.isFinite(retryAfterMs) && retryAfterMs > NUM.ZERO ?
      retryAfterMs :
      DISPATCH_RETRY_DELAY_MS;
    const errorMessage = this.normalizeErrorMessage(
      errorLike,
      REBALANCE_COORDINATOR_ERROR_MSG.MESSAGE_NOT_ACKED,
    );

    this.logger.warn(
      REBALANCE_COORDINATOR_LOG_MSG.OPERATION_DISPATCH_RETRY_DEFERRED,
      {
        operationId,
        partitionId: operation?.partitionId || null,
        targetNodeId: operation?.targetNodeId || null,
        workflowStep: operation?.workflowStep || null,
        delayMs,
        errorMessage,
        boundary: OPERATION_WORKFLOW_OWNER_LITERAL.COORDINATOR_CREATED_REMOTE_HANDOFF,
      },
    );

    return this.scheduleCoordinatorCreatedRemoteHandoffFollowUp(
      operation,
      delayMs,
    );
  }

  /**
   * @param {Object|null} operation
   * @param {Error|Object} error
   * @private
   */
  handleDeferredCoordinatorCreatedRemoteHandoffRetryFailure(
    operation,
    error,
  ) {
    if (this.deferCoordinatorCreatedRemoteHandoffRetry(operation, error)) {
      return;
    }
    this.logger.error(
      REBALANCE_COORDINATOR_LOG_MSG.OPERATION_DISPATCH_RETRY_FAILED,
      {
        operationId: operation?.operationId || null,
        partitionId: operation?.partitionId || null,
        workflowStep: operation?.workflowStep || null,
        error: error?.message || error?.error || String(error),
        boundary: OPERATION_WORKFLOW_OWNER_LITERAL.COORDINATOR_CREATED_REMOTE_HANDOFF,
      },
    );
  }

  /**
   * @param {Object|null} operation
   * @return {Promise<boolean>}
   * @private
   */
  async wakeCoordinatorCreatedRemoteOwner(operation) {
    if (!operation?.operationId ||
        !this.messageRouter ||
        typeof this.messageRouter.deliver !== TYPEOF.FUNCTION) {
      return false;
    }

    const ownerNodeId =
      this.resolveCoordinatorCreatedOperationOwnerNodeId(operation);
    const target =
      this.buildCoordinatorCreatedDispatchIngress(ownerNodeId);
    if (!target) {
      return false;
    }

    const deliveryOptions = {
      targetNodeId: ownerNodeId,
    };
    if (isPriorityControlPlanePartition({
      partitionId: operation.partitionId || null,
    })) {
      deliveryOptions.deliveryPriority = OPERATION_WORKFLOW_OWNER_LITERAL.CRITICAL;
    }

    try {
      const response = await this.messageRouter.deliver(
        target,
        {
          type: ControlPlaneMessageType.REPLICA_OPERATION_DISPATCH,
          [ControlPlaneField.OPERATION_ID]: operation.operationId,
          [ControlPlaneField.OPERATION_ROW]:
            this.buildCoordinatorCreatedDispatchRow(operation),
        },
        deliveryOptions,
      );

      if (response?.acknowledged === false) {
        const handoffError = response?.error || response;
        if (this.deferCoordinatorCreatedRemoteHandoffRetry(
          operation,
          handoffError,
        )) {
          return false;
        }
        throw new Error(
          this.normalizeErrorMessage(
            handoffError,
            REBALANCE_COORDINATOR_ERROR_MSG.MESSAGE_NOT_ACKED,
          ),
        );
      }

      this.scheduleCoordinatorCreatedRemoteHandoffFollowUp(
        operation,
        COORDINATOR_CREATED_REMOTE_HANDOFF_VERIFICATION_DELAY_MS,
        {
          replaceExisting: true,
        },
      );
      return true;
    } catch (error) {
      if (this.deferCoordinatorCreatedRemoteHandoffRetry(operation, error)) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Prime a newly created locally owned operation onto the canonical owner
   * transition lane so it does not wait for cache visibility or external
   * dispatch observation before leaving PENDING.
   *
   * The coordinator-created event remains the actual dispatch trigger. This
   * hook only claims the durable workflow step through the owner path.
   *
   * @param {Object|null} operationInput
   * @return {Promise<boolean>}
   */
  async armCoordinatorCreatedOperation(operationInput) {
    const operationId = operationInput?.operationId || null;
    if (!operationId || this.isShuttingDown || !this.isInitialized) {
      return false;
    }

    const partitionId = operationInput?.partitionId || null;
    const singleFlightKey =
      this.getOperationOwnerSingleFlightKey(operationId);

    try {
      return await this.operationWorkflowRunExclusive(
        singleFlightKey,
        async () => {
          let operation =
            await this.repository.queryAuthoritativeOperationById(
              operationId,
              {
                requireOwnerRpcRead: false,
              },
            );
          if (!operation) {
            operation = this.cloneOperationSnapshot(operationInput);
          }
          if (!operation ||
              this.repository.isOperationTerminal(operation) ||
              operation.workflowStep !== WORKFLOW_STEP.PENDING) {
            return false;
          }

          if (this.isCoordinatorCreatedOperationLocallyOwned(operation)) {
            this.clearCreatedOperationHandoffRetry(operationId);
            try {
              const claimedOperation =
                await this.claimPendingDispatchOperation(operation);
              return Boolean(claimedOperation);
            } catch (error) {
              if (this.deferTransitionRetry(
                operationId,
                error,
                {
                  boundary: OPERATION_WORKFLOW_OWNER_LITERAL.COORDINATOR_CREATED_OPERATION,
                  workflowStep: operationInput?.workflowStep || null,
                  partitionId,
                },
              )) {
                return false;
              }
              throw error;
            }
          }

          return this.wakeCoordinatorCreatedRemoteOwner(operation);
        },
      );
    } catch (error) {
      if (this.deferCoordinatorCreatedRemoteHandoffRetry(
        operationInput,
        error,
      )) {
        return false;
      }
      throw error;
    }
  }

  /**
   * @param {string} operationId
   * @param {string} tableName
   * @param {string} cacheOperation
   * @param {Error|Object} error
   */
  handleObservedProgressFailure(
    operationId,
    tableName,
    cacheOperation,
    error,
  ) {
    if (this.deferObservedProgressRetry(
      operationId,
      tableName,
      cacheOperation,
      error,
    )) {
      return;
    }
    if (this.deferTransitionRetry(
      operationId,
      error,
      {
        boundary: OPERATION_WORKFLOW_OWNER_LITERAL.OBSERVED_PROGRESS,
        workflowStep: null,
        partitionId: null,
      },
    )) {
      return;
    }
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
  }

  /**
   * @param {string} operationId
   * @param {string} tableName
   * @param {string} cacheOperation
   * @param {Error|Object} errorLike
   * @return {boolean}
   */
  deferObservedProgressRetry(
    operationId,
    tableName,
    cacheOperation,
    errorLike,
  ) {
    if (!operationId || !isRetryableControlPlaneError(errorLike)) {
      return false;
    }
    if (this.observedProgressRetryTimerByOperationId.has(operationId)) {
      return true;
    }
    const retryAfterMs = getControlPlaneRetryAfterMs(errorLike);
    const delayMs = Number.isFinite(retryAfterMs) && retryAfterMs > NUM.ZERO ?
      retryAfterMs :
      OBSERVED_PROGRESS_RETRY_DELAY_MS;
    const timerHandle = this.setTimeoutFn(() => {
      this.observedProgressRetryTimerByOperationId.delete(operationId);
      if (this.isShuttingDown || !this.isInitialized) {
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
    }, delayMs);
    this.observedProgressRetryTimerByOperationId.set(
      operationId,
      timerHandle,
    );
    return true;
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
    if (this.repository &&
        typeof this.repository.getActualReplicaObservation === TYPEOF.FUNCTION) {
      const observation = await this.repository.getActualReplicaObservation(
        replicaId,
        partitionId,
        targetNodeId,
      );
      if (observation?.state === OPERATION_WORKFLOW_OWNER_LITERAL.OBSERVED) {
        return observation.lifecycleStatus;
      }
    }
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
   * @param {string|null} operationId
   * @return {boolean}
   * @private
   */
  isOperationOwnerLaneHeld(operationId) {
    const singleFlightKey = operationId ?
      this.getOperationOwnerSingleFlightKey(operationId) :
      null;
    const inFlightOwnerKeys =
      this.operationWorkflowCoordinator?.inFlightExecutionsByOwnerKey;
    return Boolean(
      singleFlightKey &&
      inFlightOwnerKeys instanceof Map &&
      inFlightOwnerKeys.has(singleFlightKey),
    );
  }

  /**
   * @param {string} action
   * @param {string|Object} operationInput
   * @return {Promise<Object>}
   * @private
   */
  invokeOperationOwnerActionInternal(action, operationInput) {
    if (action === OPERATION_OWNER_ACTION.DISPATCH) {
      return this.dispatchOperationInternal(operationInput);
    }
    if (action === OPERATION_OWNER_ACTION.EXECUTE) {
      return this.executeOperationInternal(operationInput);
    }
    throw new Error(`Unknown operation owner action: ${action}`);
  }

  /**
   * Route one dispatch/execute request through the canonical owner lane.
   * Reconcile callers may execute inline when they already hold the owner key.
   *
   * @param {string} action
   * @param {string|Object} operationInput
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   * @private
   */
  async runOperationOwnerAction(action, operationInput, options = {}) {
    const operationId =
      this.getOperationIdFromInput(operationInput);
    const ownerLaneHeld = this.isOperationOwnerLaneHeld(
      operationId,
    );

    if (ownerLaneHeld && options.skipWhenOwnerLaneHeld === true) {
      return this.buildSkippedOperationResult(
        REBALANCER_SKIP_REASON.OPERATION_ALREADY_EXECUTING,
        operationId,
      );
    }

    const invokeAction = () =>
      this.invokeOperationOwnerActionInternal(
        action,
        operationInput,
      );

    try {
      if (!operationId ||
          (ownerLaneHeld && options.runInlineWhenOwnerLaneHeld === true)) {
        return await invokeAction();
      }
      return await this.operationWorkflowRunExclusive(
        this.getOperationOwnerSingleFlightKey(operationId),
        invokeAction,
      );
    } catch (error) {
      if (this.deferTransitionRetry(
        operationId,
        error,
        {
          boundary: options.boundary || action,
          workflowStep: options.workflowStep || null,
          partitionId: options.partitionId || null,
        },
      )) {
        return this.buildSkippedOperationResult(
          REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING,
          operationId,
          {
            error: this.normalizeErrorMessage(
              error,
              OPERATION_WORKFLOW_OWNER_LITERAL.RETRYABLE_CONTROL_DASH_PLANE_TRANSITION_FAILURE,
            ),
          },
        );
      }
      throw error;
    }
  }

  /**
   * Build one skipped-operation result.
   * @param {string} reason
   * @param {string|null} operationId
   * @param {Object} [extra={}]
   * @return {Object}
   * @private
   */
  buildSkippedOperationResult(reason, operationId, extra = {}) {
    return {
      success: false,
      skipped: true,
      reason,
      operationId,
      ...extra,
    };
  }

  /**
   * Build one successful operation result.
   * @param {string|null} operationId
   * @param {Object} [extra={}]
   * @return {Object}
   * @private
   */
  buildSuccessfulOperationResult(operationId, extra = {}) {
    return {
      success: true,
      operationId,
      ...extra,
    };
  }

  /**
   * Build one failed operation result.
   * @param {string|null} operationId
   * @param {string|Error|Object} error
   * @param {Object} [extra={}]
   * @return {Object}
   * @private
   */
  buildFailedOperationResult(operationId, error, extra = {}) {
    return {
      success: false,
      operationId,
      error,
      ...extra,
    };
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
      return String(left?.operationId || OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING).localeCompare(
        String(right?.operationId || OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING),
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
      String(operationId || OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING),
      String(step || OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING),
    ].join(OPERATION_SINGLE_FLIGHT_KEY_SEPARATOR);
  }

  /**
   * Get or allocate the current execution attempt number for one
   * operation/step key.
   * @param {string} operationId
   * @param {string} step
   * @return {number}
   */
  reserveTransitionExecutionAttempt(operationId, step) {
    const ownerKey = this.buildTransitionExecutionStepOwnerKey(
      operationId,
      step,
    );
    const currentAttempt =
      this.transitionExecutionAttemptByStepOwnerKey.get(ownerKey);
    if (Number.isInteger(currentAttempt) &&
        currentAttempt >= NUM.ONE) {
      return currentAttempt;
    }
    this.transitionExecutionAttemptByStepOwnerKey.set(ownerKey, NUM.ONE);
    return NUM.ONE;
  }

  /**
   * Rotate the execution attempt number after a direct session collision.
   * @param {string} operationId
   * @param {string} step
   * @return {number}
   */
  rotateTransitionExecutionAttempt(operationId, step) {
    const ownerKey = this.buildTransitionExecutionStepOwnerKey(
      operationId,
      step,
    );
    const nextAttempt =
      this.reserveTransitionExecutionAttempt(operationId, step) + NUM.ONE;
    this.transitionExecutionAttemptByStepOwnerKey.set(ownerKey, nextAttempt);
    return nextAttempt;
  }

  /**
   * Rotate the transition execution attempt after a stale-session collision and
   * emit one canonical diagnostic with the next attempt number.
   * @param {string} operationId
   * @param {string} step
   * @param {string} sessionId
   * @param {*} errorLike
   * @return {number}
   */
  rotateTransitionExecutionAttemptAfterStaleSessionConflict(
    operationId,
    step,
    sessionId,
    errorLike,
  ) {
    const nextAttempt = this.rotateTransitionExecutionAttempt(
      operationId,
      step,
    );
    this.logger?.warn?.(
      OPERATION_WORKFLOW_OWNER_LITERAL.ROTATING_TRANSITION_EXECUTION_SESSION_AFTER_STALE_SESSION_COLLISION,
      {
        operationId,
        workflowStep: step,
        sessionId,
        nextAttempt,
        error: this.normalizeErrorMessage(errorLike, OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING),
      },
    );
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
      String(operationId || OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING),
      String(step || OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING),
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
      operationName: OPERATION_WORKFLOW_OWNER_LITERAL.TRANSACTION,
    });
  }

  /**
   * Build canonical persistence options for transition-owned
   * replica_operations mutations so every transition path shares the same
   * enclosing transaction budget clamp.
   * @param {string} sessionId
   * @return {Object}
   */
  buildTransitionPersistOptions(sessionId) {
    return {
      sessionId,
      confirmPersistence: false,
      timeoutBudget: this.buildTransitionMutationTimeoutBudget(sessionId),
    };
  }

  /**
   * Confirm one committed transition best-effort so post-commit visibility
   * lag cannot unwind a transition that already durably committed.
   * @param {Object} operation
   * @return {Promise<void>}
   */
  async confirmCommittedTransitionPersistence(operation) {
    try {
      await this.repository.confirmReplicaOperationPersistence(operation);
    } catch (error) {
      this.logger.warn(
        OPERATION_WORKFLOW_OWNER_LITERAL.COMMITTED_REPLICA_OPERATION_TRANSITION_NOT_YET_AUTHORITATIVELY_VISIBLE,
        {
          operationId: operation?.operationId || null,
          workflowStep: operation?.workflowStep || null,
          status: operation?.status || null,
          error: error?.message || String(error),
        },
      );
    }
  }

  /**
   * Check whether a transition failure indicates a stale session id that
   * should rotate on the next retry.
   * @param {*} errorLike
   * @return {boolean}
   */
  isStaleTransitionSessionConflict(errorLike) {
    const message = this.normalizeErrorMessage(errorLike, '');
    return message === QUERY_ERROR_MSG.TRANSACTION_ACTIVE;
  }

  /**
   * Partition transaction contention can be caused either by a stale same-
   * session transaction or by unrelated control-plane pressure. Treat it as
   * retryable, but do not assume it warrants a new canonical session id.
   * @param {*} errorLike
   * @return {boolean}
   */
  isTransitionPartitionContention(errorLike) {
    return this.normalizeErrorMessage(errorLike, OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING) ===
      PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE;
  }

  /**
   * Attempt same-session recovery without masking the original transition
   * failure when the recovery probe itself is unavailable.
   * @param {string} sessionId
   * @param {*} errorLike
   * @param {Object} [options]
   * @param {boolean} [options.allowAuthoritativeLookup=false]
   * @return {Promise<boolean>}
   * @private
   */
  async tryRecoverTransitionExecutionSession(
    sessionId,
    errorLike,
    options = {},
  ) {
    try {
      return await this.recoverTransitionExecutionSession(
        sessionId,
        options,
      );
    } catch (recoveryError) {
      this.logger.warn(
        OPERATION_WORKFLOW_OWNER_LITERAL.TRANSITION_SESSION_RECOVERY_PROBE_FAILED,
        {
          sessionId,
          error: recoveryError?.message || String(recoveryError),
          originalError: this.normalizeErrorMessage(errorLike, OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING),
        },
      );
      return false;
    }
  }

  /**
   * Load authoritative in-flight transaction state for one transition session
   * when the local coordinator cache has already dropped that session.
   * @param {string} sessionId
   * @return {Promise<Object|null>}
   */
  async loadAuthoritativeTransitionExecutionSession(sessionId) {
    const txCoordinator = this.transactionCoordinator;
    const gateway = this.repository?.controlPlaneSystemTableGateway;
    if (!gateway ||
        typeof txCoordinator?.recoverFromSystemTables !== TYPEOF.FUNCTION ||
        typeof txCoordinator.getTransaction !== TYPEOF.FUNCTION) {
      return null;
    }

    const transactionResult = await readAuthoritativeControlPlaneRows(
      gateway,
      SYSTEM_TABLE_NAME.SQL_TRANSACTIONS,
      TRANSITION_RECOVERY_SQL.SELECT_TRANSACTIONS_BY_SESSION,
      [sessionId],
      {
        ...TRANSITION_RECOVERY_READ_OPTIONS,
        controlPlaneTableName: SYSTEM_TABLE_NAME.SQL_TRANSACTIONS,
        controlPlaneOperationKind: 'read',
      },
    );
    if (transactionResult?.success === false) {
      throw new Error(
        this.normalizeErrorMessage(
          transactionResult.error,
          OPERATION_WORKFLOW_OWNER_LITERAL.FAILED_TO_READ_AUTHORITATIVE_TRANSITION_TRANSACTION_STATE,
        ),
      );
    }
    const transactionRows = (transactionResult?.rows || []).filter((row) =>
      AUTHORITATIVE_TRANSITION_RECOVERY_STATUS.has(row?.status),
    );
    if (transactionRows.length === NUM.ZERO) {
      return null;
    }

    const transactionIds = Array.from(new Set(transactionRows
      .map((row) => row?.transaction_id || row?.transactionId)
      .filter((value) => typeof value === TYPEOF.STRING &&
        value.length > NUM.ZERO)));
    let participantRows = [];
    if (transactionIds.length > NUM.ZERO) {
      const participantResult = await readAuthoritativeControlPlaneRows(
        gateway,
        SYSTEM_TABLE_NAME.SQL_TRANSACTION_PARTICIPANTS,
        buildSelectRowsByTransactionIdsSql(
          SYSTEM_TABLE_NAME.SQL_TRANSACTION_PARTICIPANTS,
          transactionIds,
        ),
        transactionIds,
        {
          ...TRANSITION_RECOVERY_READ_OPTIONS,
          controlPlaneTableName:
            SYSTEM_TABLE_NAME.SQL_TRANSACTION_PARTICIPANTS,
          controlPlaneOperationKind: 'read',
        },
      );
      if (participantResult?.success === false) {
        throw new Error(
          this.normalizeErrorMessage(
            participantResult.error,
            OPERATION_WORKFLOW_OWNER_LITERAL.FAILED_TO_READ_AUTHORITATIVE_TRANSITION_PARTICIPANT_STATE,
          ),
        );
      }
      participantRows = participantResult?.rows || [];
    }

    txCoordinator.recoverFromSystemTables({
      transactions: transactionRows,
      participants: participantRows,
      writeOperations: [],
    });
    return txCoordinator.getTransaction(sessionId);
  }

  /**
   * Resolve any lingering transaction state for a transition session before
   * starting a fresh transition attempt on the same session id.
   * @param {string} sessionId
   * @param {Object} [options]
   * @param {boolean} [options.allowAuthoritativeLookup=false]
   * @return {Promise<boolean>}
   */
  async recoverTransitionExecutionSession(sessionId, options = {}) {
    const txCoordinator = this.transactionCoordinator;
    if (!txCoordinator ||
        typeof txCoordinator.getTransaction !== TYPEOF.FUNCTION) {
      return false;
    }
    let existingTransaction = txCoordinator.getTransaction(sessionId);
    if (!existingTransaction?.status &&
        options.allowAuthoritativeLookup === true) {
      existingTransaction =
        await this.loadAuthoritativeTransitionExecutionSession(sessionId);
    }
    if (!existingTransaction?.status) {
      return false;
    }
    let result = null;
    if (RECOVERABLE_TRANSITION_COMMIT_STATUS.has(
      existingTransaction.status,
    )) {
      if (typeof txCoordinator.commit !== TYPEOF.FUNCTION) {
        return false;
      }
      result = await txCoordinator.commit(sessionId);
    } else if (RECOVERABLE_TRANSITION_ROLLBACK_STATUS.has(
      existingTransaction.status,
    )) {
      if (typeof txCoordinator.rollback !== TYPEOF.FUNCTION) {
        return false;
      }
      result = await txCoordinator.rollback(sessionId);
    } else {
      return false;
    }
    if (result?.success === true) {
      return true;
    }
    throw new Error(
      this.normalizeErrorMessage(
        result?.error,
        OPERATION_WORKFLOW_OWNER_LITERAL.FAILED_TO_RECOVER_TRANSITION_TRANSACTION,
      ),
    );
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
              typeof txCoordinator.begin !== OPERATION_WORKFLOW_OWNER_LITERAL.FUNCTION ||
              typeof txCoordinator.commit !== OPERATION_WORKFLOW_OWNER_LITERAL.FUNCTION ||
              typeof txCoordinator.rollback !== OPERATION_WORKFLOW_OWNER_LITERAL.FUNCTION) {
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
          await this.recoverTransitionExecutionSession(sessionId);
          const beginResult =
            await txCoordinator.begin(sessionId);
          if (!beginResult.success) {
            if (this.isStaleTransitionSessionConflict(beginResult.error) ||
                this.isTransitionPartitionContention(beginResult.error)) {
              const recovered =
                await this.tryRecoverTransitionExecutionSession(
                  sessionId,
                  beginResult.error,
                  {
                    allowAuthoritativeLookup: true,
                  },
                );
              if (!recovered) {
                this.rotateTransitionExecutionAttemptAfterStaleSessionConflict(
                  operation.operationId,
                  step,
                  sessionId,
                  beginResult.error,
                );
              }
            }
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
            const staleTransitionSessionConflict =
              this.isStaleTransitionSessionConflict(error);
            const transitionPartitionContention =
              this.isTransitionPartitionContention(error);
            if (!committed) {
              const activeTransaction = typeof txCoordinator.getTransaction ===
                TYPEOF.FUNCTION ?
                txCoordinator.getTransaction(sessionId) :
                null;
              if (!activeTransaction) {
                if (staleTransitionSessionConflict ||
                    transitionPartitionContention) {
                  const recovered =
                    await this.tryRecoverTransitionExecutionSession(
                      sessionId,
                      error,
                      {
                        allowAuthoritativeLookup: true,
                      },
                    );
                  if (!recovered &&
                      staleTransitionSessionConflict) {
                    this.rotateTransitionExecutionAttemptAfterStaleSessionConflict(
                      operation.operationId,
                      step,
                      sessionId,
                      error,
                    );
                  }
                }
                throw error;
              }
              try {
                const rollbackResult =
                  await txCoordinator.rollback(sessionId);
                if (rollbackResult?.success !== true) {
                  throw new Error(
                    this.normalizeErrorMessage(
                      rollbackResult?.error,
                      OPERATION_WORKFLOW_OWNER_LITERAL.FAILED_TO_ROLL_BACK_TRANSITION_TRANSACTION,
                    ),
                  );
                }
              } catch (rollbackError) {
                rollbackError.cause = error;
                throw rollbackError;
              }
            }
            if (staleTransitionSessionConflict ||
                transitionPartitionContention) {
              const recovered =
                await this.tryRecoverTransitionExecutionSession(
                  sessionId,
                  error,
                  {
                    allowAuthoritativeLookup: true,
                  },
                );
              if (!recovered &&
                  staleTransitionSessionConflict) {
                this.rotateTransitionExecutionAttemptAfterStaleSessionConflict(
                  operation.operationId,
                  step,
                  sessionId,
                  error,
                );
              }
            }
            throw error;
          }
        },
        {operation},
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
      await this.repository.persistOperationUpdate(
        projectedOperation,
        this.buildTransitionPersistOptions(sessionId),
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
          await this.confirmCommittedTransitionPersistence(
            projectedOperation,
          );
        },
      },
    );

    if (!transitionCommitted) {
      return false;
    }

    this.clearTransitionRetry(operation.operationId);
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
   * Priority control-plane dispatch claims should not depend on the same
   * transaction-participant machinery they are trying to repair. Narrow only
   * the initial PENDING -> SENDING claim for these partitions.
   *
   * @param {Object|null} operation
   * @return {boolean}
   * @private
   */
  shouldUsePriorityDispatchClaimNarrowPath(operation) {
    const partitionId = String(operation?.partitionId || '').trim();
    return partitionId.length > NUM.ZERO &&
      operation?.workflowStep === WORKFLOW_STEP.PENDING &&
      isPriorityControlPlanePartition({partitionId});
  }

  /**
   * Build one retryable synthetic error for priority-claim misses.
   *
   * A compare-and-set miss with an unchanged authoritative PENDING row is a
   * pressure/liveness ambiguity, not a hard "not dispatchable" terminal state.
   * Re-arm dispatch through the existing deferred retry lane.
   *
   * @param {Object} operation
   * @return {Error}
   * @private
   */
  buildPriorityDispatchClaimRetryableError(operation) {
    const error = new Error(
      'control_plane_pressure_degraded while claiming priority ' +
        'dispatch transition',
    );
    error.code = OPERATION_WORKFLOW_OWNER_LITERAL.CONTROL_PLANE_PRESSURE_DEGRADED;
    error.errorCode = OPERATION_WORKFLOW_OWNER_LITERAL.CONTROL_PLANE_PRESSURE_DEGRADED;
    error.retryAfterMs = DISPATCH_RETRY_DELAY_MS;
    error.deferRetry = true;
    error.partitionId = operation?.partitionId || null;
    return error;
  }

  /**
   * Claim one priority control-plane operation for dispatch without relying on
   * a transition-scoped distributed transaction. The claim remains single-
   * flight and compare-and-set guarded on the durable PENDING row.
   *
   * @param {Object} operation
   * @return {Promise<Object|null>}
   * @private
   */
  async claimPriorityDispatchTransition(operation) {
    if (!operation ||
        operation.workflowStep !== WORKFLOW_STEP.PENDING ||
        !this.repository.isOperationLocallyOwned(operation) ||
        !isCoordinatorOwnedOperationType(operation.type)) {
      return null;
    }

    return this.repository.runReplicaOperationTransitionExclusive(
      async () => {
        const step = WORKFLOW_STEP.SENDING;
        const previousStep = operation.workflowStep;
        const transitionReason =
          OPERATION_TRANSITION_REASON.DISPATCH_SENDING;
        const now = Date.now();
        const readinessDecisionDimension =
          this.resolveOperationReadinessDecisionDimension(operation);
        const targetNodeId = operation.targetNodeId;
        const targetReadiness = targetNodeId ?
          this.controlPlaneReadinessService
            .getNodeReadinessSync(targetNodeId, {
              decisionDimension: readinessDecisionDimension,
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
        const commitProjectedState = (nextOperation) => {
          nextOperation.workflowStep = step;
          nextOperation.updatedAt = now;
          nextOperation.status = persistedStatus;
          nextOperation.stepsHistory = projectedOperation.stepsHistory;
        };

        this.ensureOperationWorkflow(operation);
        if (this.operationWorkflowCoordinator
          .isTransitionIdempotent(operation.operationId, step)) {
          commitProjectedState(operation);
          return operation;
        }

        await this.operationWorkflowCoordinator
          .transitionStep(
            operation.operationId,
            {nextStep: step, reason: transitionReason},
            {},
            TRANSITION_STEP_OPTIONS.DEFER_COMMITTED_MARK,
          );

        const transitionCommitted =
          await this.repository.persistOperationUpdate(
            projectedOperation,
            {
              confirmPersistence: true,
              expectedWorkflowStep: WORKFLOW_STEP.PENDING,
            },
          );

        if (!transitionCommitted) {
          const authoritativeOperation =
            await this.repository.queryAuthoritativeOperationById(
              operation.operationId,
              {
                requireOwnerRpcRead: false,
              },
            );
          if (!authoritativeOperation ||
              !this.repository.isOperationLocallyOwned(authoritativeOperation) ||
              authoritativeOperation.workflowStep === WORKFLOW_STEP.PENDING) {
            return null;
          }
          this.operationWorkflowCoordinator
            .markTransitionCommitted(operation.operationId, step);
          Object.assign(operation, authoritativeOperation);
          return operation;
        }

        this.clearTransitionRetry(operation.operationId);
        this.operationWorkflowCoordinator
          .markTransitionCommitted(operation.operationId, step);
        commitProjectedState(operation);

        this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.STEP_CHANGED, {
          operationId: operation.operationId,
          previousStep,
          newStep: step,
          reason: transitionReason,
          status: operation.status,
          partitionId: operation.partitionId,
          ingress: OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_CLAIM_CAS,
        });

        this.emitter.emit(
          REBALANCE_COORDINATOR_EVENT.STEP_CHANGED,
          {operation, previousStep, newStep: step, reason: transitionReason},
        );

        return operation;
      },
      {operation},
    );
  }

  /**
   * Complete an operation successfully.
   * @param {Object} operation
   * @return {Promise<void>}
   */
  async completeOperation(operation) {
    this.clearDispatchRetry(operation?.operationId);
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
        this.buildTransitionPersistOptions(sessionId),
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
          await this.confirmCommittedTransitionPersistence(
            projectedOperation,
          );
        },
      },
    );

    if (!transitionCommitted) {
      this.clearTransitionRetry(operation.operationId);
      await this.releaseReservationForOperation(operation);
      this.clearDeferredSafetyBlockState(
        operation.operationId,
      );
      return;
    }

    this.clearTransitionRetry(operation.operationId);
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
    this.clearDispatchRetry(operation?.operationId);
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
        typeof options.stepMetadata === OPERATION_WORKFLOW_OWNER_LITERAL.OBJECT) {
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
        this.buildTransitionPersistOptions(sessionId),
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
          await this.confirmCommittedTransitionPersistence(
            projectedOperation,
          );
        },
      },
    );

    if (!transitionCommitted) {
      this.clearTransitionRetry(operation.operationId);
      await this.releaseReservationForOperation(operation);
      this.clearDeferredSafetyBlockState(
        operation.operationId,
      );
      return;
    }

    this.clearTransitionRetry(operation.operationId);
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
   * Claim one pending operation for dispatch progression.
   * Uses the narrow priority CAS path only when needed and otherwise
   * reuses the canonical transition owner update path.
   *
   * @param {Object} operation
   * @return {Promise<Object|null>}
   * @private
   */
  async claimPendingDispatchOperation(operation) {
    if (!operation ||
        operation.workflowStep !== WORKFLOW_STEP.PENDING ||
        !isCoordinatorOwnedOperationType(operation.type) ||
        !this.repository.isOperationLocallyOwned(operation)) {
      return null;
    }

    if (this.shouldUsePriorityDispatchClaimNarrowPath(operation)) {
      const claimedOperation =
        await this.claimPriorityDispatchTransition(operation);
      if (claimedOperation) {
        return claimedOperation;
      }
      const retryableClaimError =
        this.buildPriorityDispatchClaimRetryableError(operation);
      this.deferDispatchRetry(operation, retryableClaimError);
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

    return this.claimPendingDispatchOperation(operation);
  }

  /**
   * Dispatch one operation through the single-flight lane.
   * @param {string|Object} operationInput
   * @return {Promise<Object>}
   */
  async dispatchOperation(operationInput) {
    if (this.isShuttingDown || !this.isInitialized) {
      return this.buildSkippedOperationResult(
        OPERATION_WORKFLOW_OWNER_REASON.SHUTDOWN_IN_PROGRESS,
        this.getOperationIdFromInput(operationInput),
      );
    }

    const operationId =
      this.getOperationIdFromInput(operationInput);
    if (!operationId) {
      return this.buildSkippedOperationResult(
        OPERATION_WORKFLOW_OWNER_REASON.OPERATION_ID_REQUIRED,
        null,
      );
    }
    return this.runOperationOwnerAction(
      OPERATION_OWNER_ACTION.DISPATCH,
      operationInput,
      {
        boundary: OPERATION_WORKFLOW_OWNER_LITERAL.DISPATCH,
      },
    );
  }

  /**
   * Resolve an operation id from one supported caller payload.
   * @param {string|Object} operationInput
   * @return {string|null}
   */
  getOperationIdFromInput(operationInput) {
    if (typeof operationInput === OPERATION_WORKFLOW_OWNER_LITERAL.STRING &&
        operationInput.length > NUM.ZERO) {
      return operationInput;
    }
    if (!operationInput ||
        typeof operationInput !== OPERATION_WORKFLOW_OWNER_LITERAL.OBJECT) {
      return null;
    }
    if (typeof operationInput.operationId === OPERATION_WORKFLOW_OWNER_LITERAL.STRING &&
        operationInput.operationId.length > NUM.ZERO) {
      return operationInput.operationId;
    }
    if (typeof operationInput.operation_id === OPERATION_WORKFLOW_OWNER_LITERAL.STRING &&
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
    if (typeof operationInput === OPERATION_WORKFLOW_OWNER_LITERAL.STRING &&
        operationInput.length > NUM.ZERO) {
      return this.repository.queryOperationById(operationInput);
    }
    if (!operationInput ||
        typeof operationInput !== OPERATION_WORKFLOW_OWNER_LITERAL.OBJECT) {
      return null;
    }
    if (typeof operationInput.operationId === OPERATION_WORKFLOW_OWNER_LITERAL.STRING &&
        operationInput.operationId.length > NUM.ZERO) {
      return isCoordinatorOwnedOperationType(
        operationInput.type,
      ) ?
        operationInput :
        null;
    }
    if (typeof operationInput.operation_id === OPERATION_WORKFLOW_OWNER_LITERAL.STRING &&
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
      return this.buildSkippedOperationResult(
        OPERATION_WORKFLOW_OWNER_REASON.OPERATION_NOT_FOUND,
        operationId,
      );
    }

    if (!this.repository.isOperationLocallyOwned(operation)) {
      return this.buildSkippedOperationResult(
        REBALANCER_SKIP_REASON.OPERATION_OWNED_BY_ANOTHER_NODE,
        operation.operationId,
      );
    }

    const replaceRemoveDispatchPhase =
      this.repository.isReplaceRemoveDispatchPhase(operation);
    const dispatchableWorkflowStep = operation.workflowStep;
    if (replaceRemoveDispatchPhase) {
      if (dispatchableWorkflowStep !== WORKFLOW_STEP.ACTIVE &&
          dispatchableWorkflowStep !== WORKFLOW_STEP.STOPPING) {
        return this.buildSkippedOperationResult(
          OPERATION_WORKFLOW_OWNER_REASON.OPERATION_NOT_DISPATCHABLE,
          operation.operationId,
        );
      }
    } else if (
      dispatchableWorkflowStep === WORKFLOW_STEP.PENDING
    ) {
      const claimedOperation =
        await this.claimPendingDispatchOperation(operation);
      if (!claimedOperation) {
        const dispatchRetryScheduled =
          this.dispatchRetryTimerByOperationId.has(
            operation.operationId,
          );
        if (dispatchRetryScheduled) {
          return this.buildSkippedOperationResult(
            REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING,
            operation.operationId,
            {
              error:
                OPERATION_WORKFLOW_OWNER_LITERAL.CONTROL_PLANE_PRESSURE_DEGRADED_WHILE_CLAIMING_PRIORITY +
                OPERATION_WORKFLOW_OWNER_LITERAL.DISPATCH_TRANSITION,
            },
          );
        }
        return this.buildSkippedOperationResult(
          OPERATION_WORKFLOW_OWNER_REASON.OPERATION_NOT_DISPATCHABLE,
          operation.operationId,
        );
      }
    } else if (
      dispatchableWorkflowStep !== WORKFLOW_STEP.SENDING
    ) {
      return {
        success: false,
        skipped: true,
        reason: OPERATION_WORKFLOW_OWNER_REASON.OPERATION_NOT_DISPATCHABLE,
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
        reason: OPERATION_WORKFLOW_OWNER_REASON.SHUTDOWN_IN_PROGRESS,
        operationId: operation?.operationId,
      };
    }

    return this.runOperationOwnerAction(
      OPERATION_OWNER_ACTION.EXECUTE,
      operation,
      {
        boundary: OPERATION_WORKFLOW_OWNER_LITERAL.EXECUTE,
        workflowStep: operation?.workflowStep || null,
        partitionId: operation?.partitionId || null,
        skipWhenOwnerLaneHeld: true,
      },
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
    return this.runOperationOwnerAction(
      OPERATION_OWNER_ACTION.EXECUTE,
      operation,
      {
        boundary: OPERATION_WORKFLOW_OWNER_LITERAL.EXECUTE_RECONCILE,
        workflowStep: operation?.workflowStep || null,
        partitionId: operation?.partitionId || null,
        runInlineWhenOwnerLaneHeld: true,
      },
    );
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
      return this.buildSkippedOperationResult(
        REBALANCER_SKIP_REASON.OPERATION_OWNED_BY_ANOTHER_NODE,
        operation?.operationId,
      );
    }

    const supersededPriorityRecoveryError =
      await this.getPriorityRecoverySupersededTargetError(
        operation,
      );
    if (supersededPriorityRecoveryError) {
      await this.failOperation(
        operation,
        supersededPriorityRecoveryError,
        {
          logLevel: FAILURE_LOG_LEVEL.WARN,
        },
      );
      return this.buildFailedOperationResult(
        operation.operationId,
        supersededPriorityRecoveryError,
      );
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
        this.scheduleDeferredSafetyRetry(
          operation,
          removeSafetyDeferReason,
          removeSafetyError,
        );
        return this.buildSkippedOperationResult(
          REBALANCER_SKIP_REASON.SAFETY_BLOCKED,
          operation.operationId,
          {
            deferReason: removeSafetyDeferReason,
            error: removeSafetyError,
          },
        );
      }
      await this.failOperation(operation, removeSafetyError, {
        logLevel: FAILURE_LOG_LEVEL.WARN,
        logMessage: REBALANCE_COORDINATOR_LOG_MSG
          .OPERATION_BLOCKED_BY_SAFETY_POLICY,
      });
      return this.buildFailedOperationResult(
        operation.operationId,
        removeSafetyError,
      );
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
        requestReason = OPERATION_WORKFLOW_OWNER_LITERAL.REPLACE_SOURCE_REMOVAL;
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
      return this.buildFailedOperationResult(
        operation.operationId,
        replaceSourceMissing,
      );
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
        ] === OPERATION_WORKFLOW_OWNER_LITERAL.OBJECT) {
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
        ] === OPERATION_WORKFLOW_OWNER_LITERAL.OBJECT) {
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
    ).catch(async (error) => {
      const errorMsg = this.normalizeErrorMessage(
        error,
        REBALANCE_COORDINATOR_ERROR_MSG.MESSAGE_NOT_ACKED,
      );
      if (this.deferDispatchRetry(operation, error)) {
        return {
          success: false,
          skipped: true,
          reason: REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING,
          operationId: operation.operationId,
          error: errorMsg,
        };
      }
      await this.failOperation(operation, errorMsg);
      return {
        success: false,
        operationId: operation.operationId,
        error: errorMsg,
      };
    });

    if (response?.success === false &&
        response?.reason ===
          REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING) {
      return response;
    }

    if (!response.acknowledged) {
      const errorLike = response.error || response;
      const errorMsg = this.normalizeErrorMessage(
        errorLike,
        REBALANCE_COORDINATOR_ERROR_MSG.MESSAGE_NOT_ACKED,
      );
      if (this.deferDispatchRetry(operation, errorLike)) {
        return {
          success: false,
          skipped: true,
          reason: REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING,
          operationId: operation.operationId,
          error: errorMsg,
        };
      }
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
    this.clearDispatchRetry(operation?.operationId);
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
      return this.buildSuccessfulOperationResult(
        operation.operationId,
        {
          status: OPERATION_WORKFLOW_OWNER_LITERAL.IN_PROGRESS,
        },
      );
    }

    if (response.status ===
        ReplicaOperationResponseStatus.ALREADY_EXISTS) {
      if (operation.type === OperationType.REPLACE &&
          !replaceRemovePhase) {
        await this.updateStep(
          operation, WORKFLOW_STEP.ACTIVE,
        );
        return this.buildSuccessfulOperationResult(
          operation.operationId,
          {
            status:
              ReplicaOperationResponseStatus.ALREADY_EXISTS,
          },
        );
      }
      await this.completeOperation(operation);
      return this.buildSuccessfulOperationResult(
        operation.operationId,
        {
          status:
            ReplicaOperationResponseStatus.ALREADY_EXISTS,
        },
      );
    }

    if (response.status ===
        ReplicaOperationResponseStatus.COMPLETED) {
      if (operation.type === OperationType.REPLACE &&
          !replaceRemovePhase) {
        await this.updateStep(
          operation, WORKFLOW_STEP.ACTIVE,
        );
        return this.buildSuccessfulOperationResult(
          operation.operationId,
          {
            status: ReplicaOperationResponseStatus.COMPLETED,
          },
        );
      }
      await this.completeOperation(operation);
      return this.buildSuccessfulOperationResult(
        operation.operationId,
        {
          status: ReplicaOperationResponseStatus.COMPLETED,
        },
      );
    }

    if (response.status ===
        ReplicaOperationResponseStatus.NOT_FOUND &&
        operation.type === OperationType.REPLACE &&
        replaceRemovePhase) {
      await this.completeOperation(operation);
      return this.buildSuccessfulOperationResult(
        operation.operationId,
        {
          status: ReplicaOperationResponseStatus.NOT_FOUND,
        },
      );
    }

    const errorLike = response?.error || response;
    const errorMsg = this.normalizeErrorMessage(
      errorLike, 'Unknown error',
    );
    if (this.deferDispatchRetry(operation, errorLike)) {
      return this.buildSkippedOperationResult(
        REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING,
        operation.operationId,
        {
          error: errorMsg,
        },
      );
    }
    await this.failOperation(operation, errorMsg);
    return this.buildFailedOperationResult(
      operation.operationId,
      errorMsg,
    );
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
   * @param {Object} replicaRow
   * @return {string|null}
   * @private
   */
  getReplicaRowIdentity(replicaRow) {
    const serviceId = typeof replicaRow?.service_id === TYPEOF.STRING ?
      replicaRow.service_id.trim() :
      typeof replicaRow?.serviceId === TYPEOF.STRING ?
        replicaRow.serviceId.trim() :
        '';
    if (serviceId.length > NUM.ZERO) {
      return serviceId;
    }
    const replicaId = typeof replicaRow?.replica_id === TYPEOF.STRING ?
      replicaRow.replica_id.trim() :
      typeof replicaRow?.replicaId === TYPEOF.STRING ?
        replicaRow.replicaId.trim() :
        '';
    return replicaId.length > NUM.ZERO ? replicaId : null;
  }

  /**
   * @param {string} partitionId
   * @return {Object[]}
   * @private
   */
  getCachedCriticalReplicaRows(partitionId) {
    const systemTableCache =
      this.repository.systemTableCache;
    if (!systemTableCache ||
        typeof systemTableCache.filter !== TYPEOF.FUNCTION) {
      return [];
    }
    return systemTableCache.filter(
      SYSTEM_TABLE_NAME.SERVICES,
      (row) =>
        row.partition_id === partitionId &&
        row.service_type === SERVICE_TYPE.PARTITION,
    ) || [];
  }

  /**
   * @param {Object[]} authoritativeRows
   * @param {Object[]} cachedRows
   * @return {Object[]}
   * @private
   */
  mergeReplicaRowsForSafety(authoritativeRows, cachedRows) {
    const mergedRowsById = new Map();
    const appendRow = (row, preferIncoming = false) => {
      if (!row || typeof row !== TYPEOF.OBJECT) {
        return;
      }
      const rowId = this.getReplicaRowIdentity(row);
      if (!rowId) {
        mergedRowsById.set(
          Symbol('service_row'),
          {...row},
        );
        return;
      }
      if (!preferIncoming || !mergedRowsById.has(rowId)) {
        mergedRowsById.set(rowId, {...row});
        return;
      }
      mergedRowsById.set(rowId, {
        ...mergedRowsById.get(rowId),
        ...row,
      });
    };
    for (const cachedRow of cachedRows) {
      appendRow(cachedRow, false);
    }
    for (const authoritativeRow of authoritativeRows) {
      appendRow(authoritativeRow, true);
    }
    return [...mergedRowsById.values()];
  }

  /**
   * Resolve the best currently-available services rows for one critical
   * partition safety decision. Cache remains the fallback when authoritative
   * visibility lags or the read path is transiently unavailable.
   *
   * @param {string} partitionId
   * @return {Promise<Object[]>}
   * @private
   */
  async getCriticalReplicaRowsForSafety(partitionId) {
    const cachedRows =
      this.getCachedCriticalReplicaRows(partitionId);
    const gateway =
      this.repository?.controlPlaneSystemTableGateway;
    if (!gateway) {
      return cachedRows;
    }
    try {
      const result =
        await readAuthoritativeControlPlaneRows(
          gateway,
          SYSTEM_TABLE_NAME.SERVICES,
          REMOVE_SAFETY_SQL.SELECT_PARTITION_REPLICA_ROWS,
          [SERVICE_TYPE.PARTITION, partitionId],
          REMOVE_SAFETY_READ_QUERY_OPTIONS,
        );
      if (!result?.success ||
          !Array.isArray(result.rows) ||
          result.rows.length === NUM.ZERO) {
        return cachedRows;
      }
      return this.mergeReplicaRowsForSafety(
        result.rows,
        cachedRows,
      );
    } catch {
      return cachedRows;
    }
  }

  /**
   * @param {string} partitionId
   * @return {Promise<number>}
   */
  async getCriticalMinReplicaCount(partitionId) {
    if (!this.tablePolicyService ||
        typeof this.tablePolicyService.getPolicyForPartition !==
        OPERATION_WORKFLOW_OWNER_LITERAL.FUNCTION) {
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
        OPERATION_WORKFLOW_OWNER_LITERAL.FAILED_TO_RESOLVE_MINREPLICACOUNT_FOR_CRITICAL +
        OPERATION_WORKFLOW_OWNER_LITERAL.PARTITION_SAFETY_CHECK, {
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
   * @param {Object} operation
   * @return {Promise<Object|null>}
   * @private
   */
  async getPriorityRecoveryPlanningSnapshot(operation) {
    if (!operation ||
        !isPriorityControlPlanePartition({
          partitionId: operation.partitionId,
        })) {
      return null;
    }

    const readinessService = this.controlPlaneReadinessService;
    if (!readinessService ||
        typeof readinessService
          .getPriorityRecoveryPlanningAnswerBestEffort !== TYPEOF.FUNCTION &&
        typeof readinessService
          .getPriorityRecoveryPlanningSnapshotBestEffort !== TYPEOF.FUNCTION &&
        typeof readinessService
          .getMembershipPublicationPlanningAnswerBestEffort !==
            TYPEOF.FUNCTION &&
        typeof readinessService
          .getMembershipPublicationPlanningSnapshotBestEffort !==
            TYPEOF.FUNCTION) {
      return null;
    }

    const publicationNodeId = String(
      operation.targetNodeId ||
      operation.sourceNodeId ||
      this.nodeId ||
      '',
    ).trim();
    const observedAt = Date.now();
    if (typeof readinessService
      .getPriorityRecoveryPlanningAnswerBestEffort ===
        TYPEOF.FUNCTION) {
      return readinessService
        .getPriorityRecoveryPlanningAnswerBestEffort(
          publicationNodeId,
          observedAt,
        );
    }
    if (typeof readinessService
      .getPriorityRecoveryPlanningSnapshotBestEffort ===
        TYPEOF.FUNCTION) {
      return readinessService
        .getPriorityRecoveryPlanningSnapshotBestEffort(
          publicationNodeId,
          observedAt,
        );
    }
    if (typeof readinessService
      .getMembershipPublicationPlanningAnswerBestEffort ===
        TYPEOF.FUNCTION) {
      return readinessService
        .getMembershipPublicationPlanningAnswerBestEffort(
          publicationNodeId,
          observedAt,
        );
    }
    if (typeof readinessService
      .getMembershipPublicationPlanningSnapshotBestEffort ===
        TYPEOF.FUNCTION) {
      return readinessService
        .getMembershipPublicationPlanningSnapshotBestEffort(
          publicationNodeId,
          observedAt,
        );
    }
    return null;
  }

  /**
   * Expose the canonical planning snapshot owner for coordinator-level gates
   * that need to decide whether one in-flight priority recovery row still
   * blocks the next add-like action.
   *
   * @param {Object} operation
   * @return {Promise<Object|null>}
   */
  async getPriorityRecoveryPlanningSnapshotForOperation(operation) {
    return this.getPriorityRecoveryPlanningSnapshot(operation);
  }

  /**
   * @param {Object} operation
   * @return {Promise<string|null>}
   * @private
   */
  async getPriorityRecoverySupersededTargetError(operation) {
    if (!operation ||
        (operation.type !== OperationType.ADD &&
          operation.type !== OperationType.REPLACE)) {
      return null;
    }

    const targetNodeId = String(operation.targetNodeId || '').trim();
    if (targetNodeId.length === NUM.ZERO) {
      return null;
    }

    const planningSnapshot =
      await this.getPriorityRecoveryPlanningSnapshot(operation);
    if (!planningSnapshot ||
        typeof planningSnapshot !== TYPEOF.OBJECT) {
      return null;
    }

    const priorityPartitionSummary =
      planningSnapshot.priorityPartitionSummary &&
      typeof planningSnapshot.priorityPartitionSummary === TYPEOF.OBJECT ?
        planningSnapshot.priorityPartitionSummary :
        null;
    if (!hasPriorityRecoverySpreadGap(priorityPartitionSummary)) {
      return null;
    }

    const blockedPartitionIds =
      priorityPartitionSummary ?
        buildPriorityRecoveryBlockedPartitionIds(
          priorityPartitionSummary,
        ) :
        [];
    if (blockedPartitionIds.length > NUM.ZERO &&
        !blockedPartitionIds.includes(operation.partitionId)) {
      return null;
    }

    const eligibleNodeIds = normalizeNodeIdList(
      resolvePriorityRecoveryActiveNodeCohort(planningSnapshot).activeNodeIds,
    );
    if (eligibleNodeIds.length === NUM.ZERO ||
        eligibleNodeIds.includes(targetNodeId)) {
      return null;
    }

    return OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_RECOVERY_TARGET_NODE +
      targetNodeId +
      OPERATION_WORKFLOW_OWNER_LITERAL.IS_NO_LONGER_IN_THE_CURRENT_ELIGIBLE_COHORT_FOR +
      operation.partitionId +
      OPERATION_WORKFLOW_OWNER_LITERAL.OPEN_PAREN + eligibleNodeIds.join(OPERATION_WORKFLOW_OWNER_LITERAL.COMMA_SPACE) + OPERATION_WORKFLOW_OWNER_LITERAL.CLOSE_PAREN;
  }

  /**
   * @param {Object} operation
   * @param {Object[]} projectedVoterReadyRows
   * @return {Promise<string|null>}
   */
  async getPriorityPublishedMembershipRemoveError(
    operation,
    projectedVoterReadyRows,
  ) {
    if (!operation ||
        !isPriorityControlPlanePartition({
          partitionId: operation.partitionId,
        })) {
      return null;
    }

    const planningSnapshot =
      await this.getPriorityRecoveryPlanningSnapshot(operation);
    if (!planningSnapshot ||
        typeof planningSnapshot !== TYPEOF.OBJECT) {
      return OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_CONTROL_DASH_PLANE_PARTITION +
        operation.partitionId +
        OPERATION_WORKFLOW_OWNER_LITERAL.PUBLISHED_MEMBERSHIP_SAFETY_IS_UNAVAILABLE;
    }
    const publishedActiveNodeIds =
      normalizeNodeIdList(planningSnapshot.publishedActiveNodeIds);
    const priorityPartitionSummary =
      planningSnapshot.priorityPartitionSummary &&
      typeof planningSnapshot.priorityPartitionSummary === TYPEOF.OBJECT ?
        planningSnapshot.priorityPartitionSummary :
        null;
    const spreadGapPending = hasPriorityRecoverySpreadGap(
      priorityPartitionSummary,
    );
    const recoveryProjectionNodeIds = spreadGapPending ?
      normalizeNodeIdList([
        ...normalizeNodeIdList(planningSnapshot.recoveryActiveNodeIds),
        ...normalizeNodeIdList(planningSnapshot.projectedServingNodeIds),
        ...normalizeNodeIdList(planningSnapshot.locallyEligibleNodeIds),
      ]) :
      [];
    const safetyMembershipNodeIds = recoveryProjectionNodeIds.length > NUM.ZERO ?
      recoveryProjectionNodeIds :
      publishedActiveNodeIds;
    const safetyMembershipSource = recoveryProjectionNodeIds.length > NUM.ZERO ?
      'recovery projection membership' :
      'published membership';
    const publishedActiveNodeIdsPresent =
      planningSnapshot.publishedActiveNodeIdsPresent === true ||
      publishedActiveNodeIds.length > NUM.ZERO;
    if (!publishedActiveNodeIdsPresent &&
        recoveryProjectionNodeIds.length === NUM.ZERO &&
        projectedVoterReadyRows.length > NUM.ZERO) {
      return OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_CONTROL_DASH_PLANE_PARTITION +
        operation.partitionId +
        ` ${safetyMembershipSource} is unavailable for safe removal`;
    }

    const safetyMembershipNodeIdSet = new Set(
      safetyMembershipNodeIds,
    );
    const missingPublishedNodeIds = [...new Set(
      projectedVoterReadyRows
        .map((row) => {
          return typeof row?.node_id === TYPEOF.STRING ?
            row.node_id.trim() :
            '';
        })
        .filter((nodeId) =>
          nodeId.length > NUM.ZERO &&
          !safetyMembershipNodeIdSet.has(nodeId),
        ),
    )];
    if (missingPublishedNodeIds.length > NUM.ZERO) {
      return OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_CONTROL_DASH_PLANE_PARTITION +
        operation.partitionId +
        ` ${safetyMembershipSource} does not include projected voter-ready nodes ` +
        missingPublishedNodeIds.join(OPERATION_WORKFLOW_OWNER_LITERAL.COMMA_SPACE);
    }

    if (!priorityPartitionSummary) {
      return null;
    }

    const blockedPartitionIds = new Set(
      buildPriorityRecoveryBlockedPartitionIds(priorityPartitionSummary),
    );
    if (blockedPartitionIds.has(operation.partitionId) &&
        recoveryProjectionNodeIds.length === NUM.ZERO) {
      return OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_CONTROL_DASH_PLANE_PARTITION +
        operation.partitionId +
        OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_SPREAD_HAS_NOT_CONVERGED;
    }

    const requiredDistinctNodeCount = Number(
      priorityPartitionSummary.requiredDistinctNodeCount,
    );
    if (!Number.isFinite(requiredDistinctNodeCount) ||
        requiredDistinctNodeCount <= NUM.ONE) {
      return null;
    }
    const projectedDistinctNodeCount = new Set(
      projectedVoterReadyRows
        .map((row) => {
          return typeof row?.node_id === TYPEOF.STRING ?
            row.node_id.trim() :
            '';
        })
        .filter((nodeId) => nodeId.length > NUM.ZERO),
    ).size;
    if (projectedDistinctNodeCount < requiredDistinctNodeCount) {
      return OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_CONTROL_DASH_PLANE_PARTITION +
        operation.partitionId +
        OPERATION_WORKFLOW_OWNER_LITERAL.PROJECTED_VOTER_DASH_READY_SPREAD_WOULD_FALL_BELOW_THE_PUBLISHED +
        OPERATION_WORKFLOW_OWNER_LITERAL.REQUIREMENT +
        ` (${projectedDistinctNodeCount}/${requiredDistinctNodeCount})`;
    }

    return null;
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
      this.isRemoveInitialDispatchPhase(operation);
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

    const criticalReplicaRows =
      await this.getCriticalReplicaRowsForSafety(
        operation.partitionId,
      );
    if (!Array.isArray(criticalReplicaRows) ||
        criticalReplicaRows.length === NUM.ZERO) {
      return `Critical partition ${operation.partitionId}` +
        OPERATION_WORKFLOW_OWNER_LITERAL.SAFETY_CHECK_UNAVAILABLE;
    }

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
        OPERATION_WORKFLOW_OWNER_LITERAL.SAFETY_CHECK_UNAVAILABLE;
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
        return OPERATION_WORKFLOW_OWNER_LITERAL.CRITICAL_PARTITION +
          operation.partitionId +
          OPERATION_WORKFLOW_OWNER_LITERAL.REPLACEMENT_REPLICA +
          OPERATION_WORKFLOW_OWNER_LITERAL.IS_UNAVAILABLE;
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
        return OPERATION_WORKFLOW_OWNER_LITERAL.CRITICAL_PARTITION +
          operation.partitionId +
          OPERATION_WORKFLOW_OWNER_LITERAL.REPLACEMENT_REPLICA_2 +
          replacementReplicaId +
          OPERATION_WORKFLOW_OWNER_LITERAL.IS_NOT_VOTER_DASH_READY;
      }
    }

    const minReplicaCount =
      await this.getCriticalMinReplicaCount(
        operation.partitionId,
      );
    const projectedVoterReadyRows = currentVoterReadyRows.filter(
      (row) => !this.isOperationReplicaRow(row, {
        ...operation,
        replicaId: operationReplicaId,
      }),
    );
    const projectedVoterReadyCount =
      projectedVoterReadyRows.length;
    if (projectedVoterReadyCount < minReplicaCount) {
      return `Critical partition ${operation.partitionId}` +
        OPERATION_WORKFLOW_OWNER_LITERAL.WOULD_DROP_VOTER_DASH_READY_REPLICAS_BELOW_MINIMUM +
        ` (${projectedVoterReadyCount}/${minReplicaCount})`;
    }

    return this.getPriorityPublishedMembershipRemoveError(
      operation,
      projectedVoterReadyRows,
    );
  }

  /**
   * Replay REPLACE source-removal from the authoritative row when the local
   * reconcile input is stale at SYNCING but the durable workflow already
   * advanced to ACTIVE on the canonical active-phase owner.
   *
   * This closes the gap where cache-lagged timeout reconciliation observes the
   * target as ACTIVE, replays the ACTIVE transition idempotently, but never
   * re-dispatches source removal because the local row has not caught up.
   *
   * @param {Object} operation
   * @return {Promise<boolean>}
   * @private
   */
  async replayReplaceActiveSourceRemovalFromAuthoritative(operation) {
    if (!operation ||
        operation.type !== OperationType.REPLACE ||
        typeof operation.operationId !== OPERATION_WORKFLOW_OWNER_LITERAL.STRING ||
        operation.operationId.length === NUM.ZERO) {
      return false;
    }
    const authoritativeOperation =
      await this.repository.queryAuthoritativeOperationById(
        operation.operationId,
        {requireOwnerRpcRead: true},
      );
    if (!authoritativeOperation ||
        authoritativeOperation.workflowStep !== WORKFLOW_STEP.ACTIVE ||
        !this.repository.isOperationLocallyOwned(authoritativeOperation)) {
      return false;
    }
    await this.executeOperationFromReconcilePath(authoritativeOperation);
    return true;
  }

  /**
   * @param {Object} operation
   * @return {number}
   * @private
   */
  getOperationWorkflowStepRank(operation) {
    const steps = getWorkflowSteps(operation?.type);
    const workflowStep =
      operation?.workflowStep ?? operation?.workflow_step ?? null;
    if (!Array.isArray(steps) ||
        steps.length === NUM.ZERO ||
        typeof workflowStep !== OPERATION_WORKFLOW_OWNER_LITERAL.STRING) {
      return NUM.NEGATIVE_ONE;
    }
    return steps.indexOf(workflowStep);
  }

  /**
   * @param {Object} targetOperation
   * @param {Object} sourceOperation
   * @return {void}
   * @private
   */
  applyObservedOperationState(targetOperation, sourceOperation) {
    if (!targetOperation || !sourceOperation) {
      return;
    }
    targetOperation.replicaId = sourceOperation.replicaId;
    targetOperation.sourceReplicaId = sourceOperation.sourceReplicaId;
    targetOperation.workflowStep = sourceOperation.workflowStep;
    targetOperation.status = sourceOperation.status;
    targetOperation.updatedAt = sourceOperation.updatedAt;
    targetOperation.completedAt = sourceOperation.completedAt;
    targetOperation.errorMessage = sourceOperation.errorMessage;
    targetOperation.stepsHistory = Array.isArray(sourceOperation.stepsHistory) ?
      [...sourceOperation.stepsHistory] :
      [];
  }

  /**
   * Prefer the most advanced observed state for a REPLACE operation before
   * replaying active-phase reconciliation, so stale SYNCING rows cannot
   * overwrite a newer STOPPING/REMOVED state.
   *
   * @param {Object} operation
   * @return {Promise<Object|null>}
   * @private
   */
  async adoptMostAdvancedObservedReplaceState(operation) {
    if (!operation ||
        operation.type !== OperationType.REPLACE ||
        typeof operation.operationId !== OPERATION_WORKFLOW_OWNER_LITERAL.STRING ||
        operation.operationId.length === NUM.ZERO) {
      return null;
    }

    const localRank = this.getOperationWorkflowStepRank(operation);
    let selectedOperation = null;
    let selectedRank = localRank;
    const maybeSelectOperation = (candidate) => {
      if (!candidate ||
          !this.repository.isOperationLocallyOwned(candidate)) {
        return;
      }
      const candidateRank =
        this.getOperationWorkflowStepRank(candidate);
      if (candidateRank > selectedRank) {
        selectedOperation = candidate;
        selectedRank = candidateRank;
      }
    };

    const cachedRow =
      this.repository.getReplicaOperationRowFromCache(
        operation.operationId,
      );
    if (cachedRow) {
      maybeSelectOperation(
        this.repository.rowToOperation(cachedRow),
      );
    }

    const authoritativeOperation =
      await this.repository.queryAuthoritativeOperationById(
        operation.operationId,
        {requireOwnerRpcRead: true},
      );
    maybeSelectOperation(authoritativeOperation);

    if (!selectedOperation) {
      return null;
    }
    this.applyObservedOperationState(operation, selectedOperation);
    return selectedOperation;
  }

  /**
   * Reconcile a REPLACE operation after the target replica has become ACTIVE.
   * Prefer already-observed STOPPING/REMOVED state before committing another
   * ACTIVE transition from a stale local SYNCING row.
   *
   * @param {Object} operation
   * @return {Promise<void>}
   * @private
   */
  async reconcileReplaceActualActive(operation) {
    const observedOperation =
      await this.adoptMostAdvancedObservedReplaceState(operation);
    if (observedOperation) {
      if (this.repository.isOperationTerminal(operation)) {
        return;
      }
      if (operation.workflowStep === WORKFLOW_STEP.STOPPING) {
        await this.reconcileOperationProgress(operation);
        return;
      }
      if (operation.workflowStep === WORKFLOW_STEP.ACTIVE) {
        await this.executeOperationFromReconcilePath(operation);
        return;
      }
    }

    const activeTransitionCommitted = await this.updateStep(
      operation, WORKFLOW_STEP.ACTIVE,
    );
    if (activeTransitionCommitted) {
      await this.executeOperationFromReconcilePath(operation);
      return;
    }
    await this.replayReplaceActiveSourceRemovalFromAuthoritative(
      operation,
    );
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
    if (!serviceRow || typeof serviceRow !== OPERATION_WORKFLOW_OWNER_LITERAL.OBJECT) {
      return [];
    }

    if (cacheOperation !== OPERATION_WORKFLOW_OWNER_LITERAL.DELETE) {
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
        typeof opId === OPERATION_WORKFLOW_OWNER_LITERAL.STRING && opId.length > NUM.ZERO,
      ))];
  }

  /**
   * @param {string} operationId
   * @return {Promise<boolean>}
   */
  async reconcileObservedProgressOperation(operationId) {
    if (typeof operationId !== OPERATION_WORKFLOW_OWNER_LITERAL.STRING ||
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
    if (!this.isObservedProgressOperationCandidate(operation)) {
      this.clearObservedProgressRetry(operationId);
      return false;
    }
    const progressed = await this.reconcileOperationProgress(operation, {
      cause: 'observed_progress',
    });
    this.clearObservedProgressRetry(operationId);
    return progressed;
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
        this.handleObservedProgressFailure(
          operationId,
          tableName,
          cacheOperation,
          error,
        );
      });
    }
  }


  // --- Reconciliation and timeout ---

  /**
   * Reconcile STOPPING remove/replace progression against source replica
   * removal state.
   * @param {Object} operation
   * @return {Promise<boolean>}
   * @private
   */
  async reconcileStoppingOperationProgress(operation) {
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
        OPERATION_WORKFLOW_OWNER_LITERAL.REPLICA_MISSING_DURING_STOPPING_RECONCILIATION,
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
        OPERATION_WORKFLOW_OWNER_LITERAL.REPLICA_FAILED_DURING_REMOVE_RECONCILIATION,
      );
      return true;
    }

    const replayResult =
      await this.executeOperationFromReconcilePath(operation);
    if (replayResult?.success === true &&
        replayResult.status !==
          ReplicaOperationResponseStatus.IN_PROGRESS) {
      return true;
    }

    return false;
  }

  /**
   * Apply one reconciled target-replica status to the canonical operation
   * owner path.
   * @param {Object} operation
   * @param {string|null} actualStatus
   * @param {Object} [options={}]
   * @return {Promise<boolean>}
   * @private
   */
  async applyReconciledReplicaStatus(
    operation,
    actualStatus,
    options = {},
  ) {
    const cause = options.cause || 'progress';

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
        await this.reconcileReplaceActualActive(operation);
      } else {
        await this.completeOperation(operation);
      }
      return true;
    }

    if (actualStatus === ReplicaStatus.FAILED) {
      await this.failOperation(
        operation,
        cause === OPERATION_WORKFLOW_OWNER_LITERAL.RECOVERY &&
          operation.workflowStep === WORKFLOW_STEP.SYNCING ?
          OPERATION_WORKFLOW_OWNER_LITERAL.REPLICA_FAILED_DURING_SYNC :
          OPERATION_WORKFLOW_OWNER_LITERAL.REPLICA_FAILED_DURING_OPERATION_RECONCILIATION,
      );
      return true;
    }

    if (actualStatus === null &&
        cause === OPERATION_WORKFLOW_OWNER_LITERAL.RECOVERY &&
        operation.workflowStep === WORKFLOW_STEP.SYNCING) {
      await this.failOperation(
        operation,
        OPERATION_WORKFLOW_OWNER_LITERAL.REPLICA_NOT_FOUND_DURING_RECOVERY_RECONCILIATION,
      );
      return true;
    }

    if (this.shouldRearmDispatchFromProgressReconcile(
      operation,
      actualStatus,
    )) {
      await this.executeOperationFromReconcilePath(operation);
      return true;
    }

    return false;
  }

  /**
   * Reconcile one in-flight operation through the canonical owner path.
   * Different wakeup causes share one progression implementation after the
   * owner queue is entered.
   * @param {Object} operation
   * @param {Object} [options={}]
   * @return {Promise<boolean>}
   * @private
   */
  async reconcileOperationLifecycle(operation, options = {}) {
    if (!operation) {
      return false;
    }
    if (!this.repository.isOperationLocallyOwned(operation)) {
      return false;
    }

    const cause = options.cause || 'progress';
    const lifecycleAction =
      this.resolveOperationLifecycleAction(operation, cause);
    switch (lifecycleAction) {
    case OPERATION_LIFECYCLE_ACTION.FAIL_PRE_SYNC_RECOVERY:
      await this.failOperation(
        operation,
        OPERATION_WORKFLOW_OWNER_LITERAL.NODE_RECOVERY_DASH_INCOMPLETE_OPERATION,
      );
      this.logger.info(
        REBALANCE_COORDINATOR_LOG_MSG.RECOVERY_MARK_FAILED,
        {
          operationId: operation.operationId,
          workflowStep: operation.workflowStep,
          partitionId: operation.partitionId,
        },
      );
      return true;
    case OPERATION_LIFECYCLE_ACTION.FAIL_STOPPING_RECOVERY:
      await this.failOperation(
        operation,
        OPERATION_WORKFLOW_OWNER_LITERAL.NODE_RECOVERY_DASH_INCOMPLETE_REMOVAL_OPERATION,
      );
      this.logger.info(
        REBALANCE_COORDINATOR_LOG_MSG.RECOVERY_MARK_REMOVE_FAILED,
        {
          operationId: operation.operationId,
          workflowStep: operation.workflowStep,
          partitionId: operation.partitionId,
        },
      );
      return true;
    case OPERATION_LIFECYCLE_ACTION.EXECUTE_ACTIVE_REPLACE:
    case OPERATION_LIFECYCLE_ACTION.EXECUTE_REMOVE_DISPATCH:
      await this.executeOperationFromReconcilePath(operation);
      return true;
    case OPERATION_LIFECYCLE_ACTION.RECONCILE_STOPPING:
      return this.reconcileStoppingOperationProgress(operation);
    case OPERATION_LIFECYCLE_ACTION.NOOP:
      return false;
    case OPERATION_LIFECYCLE_ACTION.RECONCILE_REPLICA_STATUS:
    default:
      break;
    }

    const actualStatus =
      await this.getReconciledReplicaStatus(
        operation.replicaId,
        operation.partitionId,
        operation.targetNodeId,
      );
    if (cause === OPERATION_WORKFLOW_OWNER_LITERAL.RECOVERY) {
      this.repository.emitReplicaStatusDivergence(
        operation.replicaId,
        actualStatus,
        SQL_RECONCILIATION_REASON.RECOVERY_REPLICA_STATUS,
      );
    }
    return this.applyReconciledReplicaStatus(
      operation,
      actualStatus,
      {cause},
    );
  }

  /**
   * Reconcile one in-flight operation against observed replica state.
   * @param {Object} operation
   * @param {Object} [options={}]
   * @return {Promise<boolean>}
   */
  async reconcileOperationProgress(operation, options = {}) {
    return this.reconcileOperationLifecycle(operation, options);
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
    if (this.hasActiveTransitionRetryGrace(
      operation?.operationId || null,
      now,
    )) {
      return;
    }
    const progressed =
      await this.reconcileOperationProgress(operation, {
        cause: 'timeout',
      });
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
      await this.repository.queryCachedIncompleteOperations() :
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

    const timeoutReconcileTasks = [];

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

      const reconcileTask = this.operationWorkflowRunExclusive(
        singleFlightKey,
        async () => {
          const authoritativeOperation =
            await this.repository.queryAuthoritativeOperationById(
              operation.operationId,
              {
                requireOwnerRpcRead: false,
              },
            );
          const timeoutOperation =
            authoritativeOperation || operation;
          if (!this.repository.isOperationLocallyOwned(
            timeoutOperation,
          )) {
            return;
          }
          if (this.repository.isOperationTerminal(
            timeoutOperation,
          )) {
            return;
          }

          await this.reconcileTimeoutOperation(
            timeoutOperation, Date.now(),
          );
        },
      ).catch((error) => {
        if (this.deferTransitionRetry(
          operation.operationId,
          error,
          {
            boundary: 'timeout_reconcile',
            workflowStep: operation?.workflowStep || null,
            partitionId: operation?.partitionId || null,
          },
        )) {
          return;
        }
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
      timeoutReconcileTasks.push(reconcileTask);
    }

    if (timeoutReconcileTasks.length > NUM.ZERO) {
      await Promise.all(timeoutReconcileTasks);
    }

    // Periodic reservation reconciliation (Req 4.4)
    await this.reconcileReservations().catch((error) => {
      this.logger.warn(
        REBALANCE_COORDINATOR_LOG_MSG
          .RESERVATION_RELEASE_FAILED,
        {error: error.message},
      );
    });
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
      if (this.deferTransitionRetry(
        operationId,
        error,
        {
          boundary: OPERATION_WORKFLOW_OWNER_LITERAL.EXECUTOR_OUTCOME,
          workflowStep:
            outcome?.[EXECUTOR_OUTCOME_FIELD.WORKFLOW_STEP] || null,
          partitionId: null,
        },
      )) {
        return;
      }
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
   * Resolve the next legal lifecycle action for one locally owned operation.
   * Multiple wake causes can feed the owner, but they should all reduce to one
   * explicit action model.
   *
   * @param {Object} operation
   * @param {string} [cause='progress']
   * @return {string}
   * @private
   */
  resolveOperationLifecycleAction(operation, cause = OPERATION_WORKFLOW_OWNER_LITERAL.PROGRESS) {
    if (cause === OPERATION_WORKFLOW_OWNER_LITERAL.RECOVERY) {
      if (this.isPreSyncStep(operation.workflowStep)) {
        return OPERATION_LIFECYCLE_ACTION.FAIL_PRE_SYNC_RECOVERY;
      }
      if (operation.workflowStep === WORKFLOW_STEP.STOPPING) {
        return OPERATION_LIFECYCLE_ACTION.FAIL_STOPPING_RECOVERY;
      }
    }

    if (operation.type === OperationType.REPLACE &&
        operation.workflowStep === WORKFLOW_STEP.ACTIVE) {
      return OPERATION_LIFECYCLE_ACTION.EXECUTE_ACTIVE_REPLACE;
    }

    if (this.isRemoveInitialDispatchPhase(operation)) {
      return OPERATION_LIFECYCLE_ACTION.EXECUTE_REMOVE_DISPATCH;
    }

    if (operation.workflowStep === WORKFLOW_STEP.STOPPING &&
        (operation.type === OperationType.REMOVE ||
          operation.type === OperationType.REPLACE)) {
      return OPERATION_LIFECYCLE_ACTION.RECONCILE_STOPPING;
    }

    if (operation.workflowStep === WORKFLOW_STEP.PENDING ||
        operation.workflowStep === WORKFLOW_STEP.SENDING ||
        operation.workflowStep === WORKFLOW_STEP.CREATING ||
        operation.workflowStep === WORKFLOW_STEP.SYNCING) {
      return OPERATION_LIFECYCLE_ACTION.RECONCILE_REPLICA_STATUS;
    }

    return OPERATION_LIFECYCLE_ACTION.NOOP;
  }

  /**
   * Per-operation recovery logic.
   * @param {Object} op
   * @return {Promise<void>}
   */
  async reconcileRecoveryOperation(op) {
    await this.reconcileOperationLifecycle(op, {cause: OPERATION_WORKFLOW_OWNER_LITERAL.RECOVERY});
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

    const progressed = await this.reconcileOperationLifecycle(
      operation,
      {cause: 'recovery'},
    );
    if (!progressed) {
      this.logger.info(
        REBALANCE_COORDINATOR_LOG_MSG
          .RECONCILE_IN_PROGRESS,
        {
          operationId: operation.operationId,
          partitionId: operation.partitionId,
          workflowStep: operation.workflowStep,
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
        if (this.deferTransitionRetry(
          op.operationId,
          error,
          {
            boundary: OPERATION_WORKFLOW_OWNER_LITERAL.RECOVERY,
            workflowStep: op?.workflowStep || null,
            partitionId: op?.partitionId || null,
          },
        )) {
          continue;
        }
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
    if (typeof errorMessage !== OPERATION_WORKFLOW_OWNER_LITERAL.STRING || !errorMessage) {
      return false;
    }
    const normalized = errorMessage.toLowerCase();
    return normalized.includes(
      OPERATION_WORKFLOW_OWNER_LITERAL.WOULD_DROP_VOTER_DASH_READY_REPLICAS_BELOW_MINIMUM_2,
    ) ||
      normalized.includes(OPERATION_WORKFLOW_OWNER_LITERAL.SAFETY_CHECK_UNAVAILABLE_2) ||
      normalized.includes(OPERATION_WORKFLOW_OWNER_LITERAL.REPLACEMENT_REPLICA_3) ||
      normalized.includes(OPERATION_WORKFLOW_OWNER_LITERAL.PUBLISHED_MEMBERSHIP) ||
      normalized.includes(OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_SPREAD) ||
      normalized.includes(OPERATION_WORKFLOW_OWNER_LITERAL.PROJECTED_VOTER_DASH_READY_SPREAD);
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
    const criticalReplicaRows =
      await this.getCriticalReplicaRowsForSafety(
        operation.partitionId,
      );
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
    if (typeof operationId !== OPERATION_WORKFLOW_OWNER_LITERAL.STRING ||
        operationId.length === NUM.ZERO) {
      return;
    }
    this.clearSafetyDeferredRetry(operationId);
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
    if (typeof operationId !== OPERATION_WORKFLOW_OWNER_LITERAL.STRING ||
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
    if (typeof errorLike === OPERATION_WORKFLOW_OWNER_LITERAL.STRING && errorLike.trim()) {
      return errorLike;
    }

    if (!errorLike || typeof errorLike !== OPERATION_WORKFLOW_OWNER_LITERAL.OBJECT) {
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
      if (typeof candidate === OPERATION_WORKFLOW_OWNER_LITERAL.STRING &&
          candidate.trim()) {
        return candidate;
      }
    }

    return fallbackMessage;
  }
}

export {OperationWorkflowOwner};
