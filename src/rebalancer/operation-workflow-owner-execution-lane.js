import {assertOperationTransitionOutcome} from './operation-workflow-transition-outcome.js';
import {OPERATION_RECONCILE_OUTCOME} from './operation-workflow-reconcile-outcome.js';
import {STATE_ABSENT, readStateField} from '../utils/state-field-read.js';
import {resolveOperationTransitionReason} from './replica-operation-step-policy.js';
import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
import {OperationWorkflowOwnerRetryRegistry} from './operation-workflow-owner-retry-registry.js';
import {withOwnerHandoffState} from './operation-workflow-owner-handoff-state.js';
import {
  OPERATION_OWNER_TURN_POLICY,
} from './operation-owner-turn-policy.js';
import {
  recoverOperationWorkflowsFromDurableRows,
} from './operation-workflow-persistence.js';

const {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  EXACT_TARGET_REPLICA_OBSERVATION_OPTIONS,
  OBSERVED_PROGRESS_RETRY_DELAY_MS,
  OPERATION_OWNER_ACTION,
  OPERATION_SINGLE_FLIGHT_KEY_SEPARATOR,
  OPERATION_SINGLE_FLIGHT_SCOPE,
  OPERATION_WORKFLOW_OWNER_LITERAL,
  OPERATION_WORKFLOW_OWNER_REASON,
  REBALANCE_COORDINATOR_LOG_MSG,
  REBALANCER_SKIP_REASON,
  buildTopologyOperatorWitnessFromWorkflowProgress,
  classifySystemPartition,
  getControlPlaneRetryAfterMs,
  isRetryableControlPlaneError,
} = OPERATION_WORKFLOW_OWNER_SHARED;

const LOCAL_PRIORITY_EXACT_TARGET_REPLICA_OBSERVATION_OPTIONS =
  Object.freeze({
    ...EXACT_TARGET_REPLICA_OBSERVATION_OPTIONS,
    authoritativeReadMode:
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY,
  });

// The step a deferred transition retry records: the caller's explicit step,
// else the operation snapshot's (replica_operations.workflow_step NOT NULL);
// null names a deferral with no operation to read a step from.
function resolveDeferredWorkflowStep(options, operationSnapshot) {
  const explicitStep = readStateField(options.workflowStep);
  if (explicitStep !== STATE_ABSENT) {
    return explicitStep;
  }
  return operationSnapshot ? operationSnapshot.workflowStep : null;
}

class OperationWorkflowOwnerExecutionLane
  extends withOwnerHandoffState(OperationWorkflowOwnerRetryRegistry) {
  buildTopologyOperatorWitnessFromWorkflowProgress(
    snapshot = {},
    options = {},
  ) {
    return buildTopologyOperatorWitnessFromWorkflowProgress(snapshot, options);
  }

  /**
   * @param {string} operationId
   * @param {string} tableName
   * @param {string} cacheOperation
   * @param {Error|Object} error
   */
  handleObservedProgressFailure(operationId, tableName, cacheOperation, error) {
    if (
      this.deferObservedProgressRetry(
        operationId,
        tableName,
        cacheOperation,
        error,
      )
    ) {
      return;
    }
    if (
      this.deferTransitionRetry(operationId, error, {
        boundary: OPERATION_WORKFLOW_OWNER_LITERAL.OBSERVED_PROGRESS,
        workflowStep: null,
        partitionId: null,
      })
    ) {
      return;
    }
    this.logger.error(
      REBALANCE_COORDINATOR_LOG_MSG.OBSERVED_PROGRESS_TRANSITION_FAILED,
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
    const delayMs =
      Number.isFinite(retryAfterMs) && retryAfterMs > 0 ?
        retryAfterMs :
        OBSERVED_PROGRESS_RETRY_DELAY_MS;
    return this.scheduleObservedProgressRetry(
      operationId,
      tableName,
      cacheOperation,
      delayMs,
    );
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
  buildReconciledReplicaObservationOptions(baseOptions, options = {}) {
    const ignoreUnclaimed =
      options?.ignoreUnclaimedPreRuntimeFailedCreate === true;
    const allowActiveLearner = options?.allowActiveLearner === true;
    if (!ignoreUnclaimed && !allowActiveLearner) {
      return baseOptions;
    }
    return {
      ...baseOptions,
      ...(ignoreUnclaimed ?
        {ignoreUnclaimedPreRuntimeFailedCreate: true} :
        {}),
      ...(allowActiveLearner ? {allowActiveLearner: true} : {}),
    };
  }

  async getReconciledReplicaStatus(
    replicaId,
    partitionId,
    targetNodeId,
    options = {},
  ) {
    const exactTargetObservationOptions =
      this.buildReconciledReplicaObservationOptions(
        EXACT_TARGET_REPLICA_OBSERVATION_OPTIONS,
        options,
      );
    const shouldPreferLocalPriorityReplicaObservation =
      targetNodeId === this.nodeId &&
      classifySystemPartition({partitionId}).priorityControlPlane;
    if (
      shouldPreferLocalPriorityReplicaObservation &&
      this.repository &&
      typeof this.repository.getActualReplicaObservation === 'function'
    ) {
      const localObservation =
        await this.repository.getActualReplicaObservation(
          replicaId,
          partitionId,
          targetNodeId,
          this.buildReconciledReplicaObservationOptions(
            LOCAL_PRIORITY_EXACT_TARGET_REPLICA_OBSERVATION_OPTIONS,
            options,
          ),
        );
      if (
        localObservation?.state === OPERATION_WORKFLOW_OWNER_LITERAL.OBSERVED
      ) {
        return localObservation.lifecycleStatus;
      }
    }
    if (
      this.repository &&
      typeof this.repository.getActualReplicaObservation === 'function'
    ) {
      const observation = await this.repository.getActualReplicaObservation(
        replicaId,
        partitionId,
        targetNodeId,
        exactTargetObservationOptions,
      );
      if (observation?.state === OPERATION_WORKFLOW_OWNER_LITERAL.OBSERVED) {
        return observation.lifecycleStatus;
      }
    }
    return this.repository.getObservedReplicaStatusFromCache(
      replicaId,
      partitionId,
      targetNodeId,
      exactTargetObservationOptions,
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
    return [scope, key].join(OPERATION_SINGLE_FLIGHT_KEY_SEPARATOR);
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
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   * @private
   */
  invokeOperationOwnerActionInternal(action, operationInput, options = {}) {
    if (action === OPERATION_OWNER_ACTION.DISPATCH) {
      return this.dispatchOperationInternal(operationInput, options);
    }
    if (action === OPERATION_OWNER_ACTION.EXECUTE) {
      return this.executeOperationInternal(operationInput);
    }
    if (action === OPERATION_OWNER_ACTION.FAIL) {
      return this.failOperation(
        operationInput,
        options.errorMessage,
        options.failureOptions,
      );
    }
    throw new Error(`Unknown operation owner action: ${action}`);
  }

  /**
   * Run a command that must not inherit another operation-lane holder's
   * result. Awaiting the shared promise waits for that holder; resubmission
   * then gives this command its own serialized turn. A holder rejection also
   * belongs to the holder and cannot fail this command.
   * @param {string} operationId
   * @param {Function} invokeAction
   * @return {Promise<Object>}
   * @private
   */
  async runRetainedOperationOwnerAction(operationId, invokeAction) {
    const ownerKey = this.getOperationOwnerSingleFlightKey(operationId);
    // Capture the ownership fence epoch BEFORE the first lane turn (audit
    // finding 14): a continuation that wakes past an await after shutdown
    // bumped the fence must refuse to start a new turn instead of proceeding
    // unguarded against the released registries.
    const fenceEpochAtEntry =
      typeof this.getOperationOwnershipFenceEpoch === 'function' ?
        this.getOperationOwnershipFenceEpoch() :
        null;
    while (!this.isShuttingDown) {
      if (
        fenceEpochAtEntry !== null &&
        typeof this.getOperationOwnershipFenceEpoch === 'function' &&
        this.getOperationOwnershipFenceEpoch() !== fenceEpochAtEntry
      ) {
        break;
      }
      let actionFactoryRan = false;
      try {
        const result = await this.operationWorkflowRunExclusive(
          ownerKey,
          () => {
            actionFactoryRan = true;
            return invokeAction();
          },
        );
        if (actionFactoryRan) {
          return result;
        }
      } catch (error) {
        if (actionFactoryRan) {
          throw error;
        }
      }
    }
    return this.buildSkippedOperationResult(
      OPERATION_WORKFLOW_OWNER_REASON.SHUTDOWN_IN_PROGRESS,
      operationId,
    );
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
    const operationId = this.getOperationIdFromInput(operationInput);
    const ownerLaneHeld = this.isOperationOwnerLaneHeld(operationId);
    const retainOwnerTurn =
      options.ownerTurnPolicy === OPERATION_OWNER_TURN_POLICY.RETAIN;
    const operationSnapshot =
      operationInput &&
      typeof operationInput === OPERATION_WORKFLOW_OWNER_LITERAL.OBJECT ?
        operationInput :
        null;

    if (
      ownerLaneHeld &&
      options.skipWhenOwnerLaneHeld === true &&
      !retainOwnerTurn
    ) {
      return this.buildSkippedOperationResult(
        REBALANCER_SKIP_REASON.OPERATION_ALREADY_EXECUTING,
        operationId,
      );
    }

    const invokeAction = () =>
      this.invokeOperationOwnerActionInternal(
        action,
        operationInput,
        options,
      );

    try {
      if (operationId && retainOwnerTurn) {
        return await this.runRetainedOperationOwnerAction(
          operationId,
          invokeAction,
        );
      }
      if (
        !operationId ||
        (ownerLaneHeld && options.runInlineWhenOwnerLaneHeld === true)
      ) {
        return await invokeAction();
      }
      return await this.operationWorkflowRunExclusive(
        this.getOperationOwnerSingleFlightKey(operationId),
        invokeAction,
      );
    } catch (error) {
      if (
        this.deferTransitionRetry(operationId, error, {
          boundary: options.boundary || action,
          workflowStep: resolveDeferredWorkflowStep(
            options,
            operationSnapshot,
          ),
          partitionId:
            options.partitionId || operationSnapshot?.partitionId || null,
          updatedAt: options.updatedAt || operationSnapshot?.updatedAt,
          createdAt: options.createdAt || operationSnapshot?.createdAt,
          operationSnapshot,
        })
      ) {
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

  buildTerminalOperationDispatchResult(transitionOutcome, extra = {}) {
    const outcome = assertOperationTransitionOutcome(transitionOutcome);
    const operationId = outcome.operation?.operationId || extra.operationId;
    if (outcome.reconcileOutcome === OPERATION_RECONCILE_OUTCOME.FAILED) {
      return this.buildFailedOperationResult(operationId, outcome.operation.errorMessage,
        {reconcileOutcome: outcome.reconcileOutcome});
    }
    if (outcome.reconcileOutcome === OPERATION_RECONCILE_OUTCOME.COMPLETED) {
      return this.buildSuccessfulOperationResult(operationId,
        {...extra, reconcileOutcome: outcome.reconcileOutcome});
    }
    return this.buildSkippedOperationResult(outcome.reconcileOutcome, operationId, {
      reconcileOutcome: outcome.reconcileOutcome,
      ...(outcome.reconcileOutcome === OPERATION_RECONCILE_OUTCOME.SUPERSEDED ?
        {terminal: true} : {}),
    });
  }

  /**
   * Delay authoritative empty-owner scans until the cache has had one bounded
   * chance to observe local replica_operations rows. An empty cache is not
   * proof of zero operations; it is only a reason to wait briefly.
   * @param {number} [now=Date.now()]
   * @return {boolean}
   */
  shouldDelayEmptyIncompleteOperationQuery(now = Date.now()) {
    if (this.incompleteOperationQueryEmptyBackoffMs <= 0) {
      return false;
    }
    if (this.lastEmptyIncompleteOperationQueryAtMs <= 0) {
      this.lastEmptyIncompleteOperationQueryAtMs = now;
      return true;
    }
    if (
      now - this.lastEmptyIncompleteOperationQueryAtMs <
      this.incompleteOperationQueryEmptyBackoffMs
    ) {
      return true;
    }
    this.lastEmptyIncompleteOperationQueryAtMs = 0;
    return false;
  }

  /**
   * Clear bounded empty-owner scan deferral once local work is observed.
   * @return {void}
   */
  clearEmptyIncompleteOperationQueryDelay() {
    this.lastEmptyIncompleteOperationQueryAtMs = 0;
  }

  // --- Workflow step advancement ---

  /**
   * Register an operation as a workflow if not already tracked, hydrating
   * the transition witness from the operation's durable row mirror first
   * (audit findings 15+18): after a restart the in-memory store is empty,
   * so the registry is recovered from the replica_operations row (its
   * steps_history is the durable transition history) instead of being
   * silently restarted from zero.
   * @param {Object} operation - Operation record.
   */
  ensureOperationWorkflow(operation) {
    const workflowId = operation.operationId;
    if (this.operationWorkflowCoordinator.getWorkflowById(workflowId)) {
      return;
    }
    const {restoredWorkflowIds} = recoverOperationWorkflowsFromDurableRows(
      this.operationWorkflowCoordinator,
      [operation],
    );
    if (restoredWorkflowIds.has(workflowId)) {
      return;
    }
    const record = {
      workflowId,
      ownerKey: workflowId,
      step: operation.workflowStep,
      transitionHistory: [],
      // Never recovered from a durable row: the persist callback treats
      // the first in-memory transition as the basis and still rejects
      // empty/rewound candidates.
      durableBasisStepCount: 0,
      durableOperation: operation,
    };
    const workflow =
      this.operationWorkflowCoordinator.createWorkflowRecord(record);
    this.operationWorkflowCoordinator.setWorkflowState(workflow);
  }

  /**
   * Resolve a canonical transition reason from step progression.
   * @param {string} previousStep
   * @param {string} nextStep
   * @return {string}
   */
  resolveTransitionReason(previousStep, nextStep) {
    return resolveOperationTransitionReason(previousStep, nextStep);
  }

  /**
   * Build the independent autocommit persistence intent for a transition.
   * SQL still promotes a post-mirror multi-participant plan to a statement-
   * owned distributed transaction after it knows the final participant set.
   * @return {Object}
   * @private
   */
  buildOperationTransitionPersistOptions() {
    return {
      disableSystemWriteSession: true,
    };
  }

  /**
   * Renew the durable owner lease after one committed non-terminal
   * transition (audit findings 5+14): the lease heartbeat rides a separate
   * post-commit touch — never the transition write itself — so transition
   * write shapes stay byte-identical for every caller. Fail-soft.
   * @param {Object} operation
   * @return {Promise<boolean>}
   * @private
   */
  async renewOperationOwnerLeaseAfterCommittedTransition(operation) {
    if (
      this.isShuttingDown ||
      typeof this.repository?.touchOperationOwnerLease !== 'function'
    ) {
      return false;
    }
    return this.repository.touchOperationOwnerLease(operation);
  }
}

export {OperationWorkflowOwnerExecutionLane};
