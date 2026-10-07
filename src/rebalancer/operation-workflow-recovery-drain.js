import {
  admitReplaceOwnerHandBack,
} from './operation-workflow-replace-owner-state.js';
import {OperationWorkflowRecoveryTimeout} from './operation-workflow-recovery-timeout.js';
import {OPERATION_WORKFLOW_OWNER_SEGMENT_7_STAGE_SHARED as SHARED} from './operation-workflow-recovery-reconcile-shared.js';
import {
  isTerminalTransitionOutcomeSettled,
} from './operation-workflow-terminal-reservation-release.js';
import {OPERATION_RESERVATION_RECOVERY_OUTCOME} from
  './operation-reservation-attempt-outcome.js';
import {reconcileReservationBackedPendingOperation} from
  './operation-workflow-reservation-recovery.js';

import {
  REPLACE_OWNER_UNAVAILABLE_SOURCE_RETAINED,
  isPartitionReplace,
  isTargetFailureDetectorDead,
} from './operation-workflow-replace-owner.js';
const {
  EXACT_TARGET_REPLICA_OBSERVATION_OPTIONS,
  FAILURE_LOG_LEVEL,
  OPERATION_LIFECYCLE_ACTION,
  OPERATION_WORKFLOW_OWNER_LITERAL,
  OperationType,
  PRIORITY_RECOVERY_BLOCKER_REASON,
  PRIORITY_RECOVERY_OPERATION_DRAIN_ABSENT_SOURCE_STATE_BY_WORKFLOW_STEP,
  PRIORITY_RECOVERY_OPERATION_DRAIN_ACTION_BY_STATE,
  PRIORITY_RECOVERY_OPERATION_DRAIN_ADD_TARGET_STATUSES,
  PRIORITY_RECOVERY_OPERATION_DRAIN_COMPLETION_STATES,
  PRIORITY_RECOVERY_OPERATION_DRAIN_COMPLETION_STATE_UNAVAILABLE,
  PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_ACTION,
  PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_ACTION_BY_STATE,
  PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_STATE,
  PRIORITY_RECOVERY_OPERATION_DRAIN_REPLICA_TARGET_BY_TYPE,
  PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_OBSERVATION_KEY,
  PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_OBSERVATION_KEY_BY_STATUS,
  PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_REMOVAL_TYPES,
  PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_STATE,
  PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_STATE_BY_OBSERVATION_KEY,
  PRIORITY_RECOVERY_OPERATION_DRAIN_STATE,
  PRIORITY_RECOVERY_PRE_SYNC_REPLACE_DRAIN_DECISION,
  PRIORITY_RECOVERY_PRE_SYNC_REPLACE_DRAIN_DECISION_TABLE,
  PRIORITY_RECOVERY_PRE_SYNC_REPLACE_DRAIN_SOURCE_STATE_BY_DECISION,
  PRIORITY_RECOVERY_PRE_SYNC_REPLACE_TARGET_STATE,
  REBALANCE_COORDINATOR_LOG_MSG,
  STOPPING_REPLICA_OBSERVATION_STATE,
  classifySystemPartition,
  normalizeNodeIdList,
  resolvePriorityRecoveryPreSyncReplaceTargetStateFromEvidence,
} = SHARED;

const HAND_BACK_VERDICT_SEPARATOR = '|';

// The drain actions a non-owner may settle: a superseded target, and a
// completion - except a partition REPLACE's, which its owner completes from
// committed membership (R-1b hands it back).
function isRemoteSettleDrainAction(operation, drainAction) {
  if (drainAction ===
      OPERATION_LIFECYCLE_ACTION.FAIL_PRIORITY_RECOVERY_SUPERSEDED_TARGET) {
    return true;
  }
  return drainAction ===
      OPERATION_LIFECYCLE_ACTION.COMPLETE_PRIORITY_RECOVERY_DRAIN &&
    !isPartitionReplace(operation);
}

class OperationWorkflowRecoveryDrain extends OperationWorkflowRecoveryTimeout {
  resolvePriorityRecoveryOperationDrainSourceObservationKey(observation) {
    const observationState = observation?.state || null;
    if (observationState === STOPPING_REPLICA_OBSERVATION_STATE.ABSENT) {
      return PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_OBSERVATION_KEY.ABSENT;
    }
    if (
      observationState === STOPPING_REPLICA_OBSERVATION_STATE.UNAVAILABLE
    ) {
      return (
        PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_OBSERVATION_KEY.UNAVAILABLE
      );
    }
    const lifecycleStatus = observation?.lifecycleStatus || null;
    return (
      PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_OBSERVATION_KEY_BY_STATUS.get(
        lifecycleStatus,
      ) ||
      PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_OBSERVATION_KEY.PRESENT
    );
  }

  resolvePriorityRecoveryOperationDrainSourceState(observation, operation) {
    const observationKey =
      this.resolvePriorityRecoveryOperationDrainSourceObservationKey(
        observation,
      );
    if (
      observationKey ===
      PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_OBSERVATION_KEY.ABSENT
    ) {
      return (
        PRIORITY_RECOVERY_OPERATION_DRAIN_ABSENT_SOURCE_STATE_BY_WORKFLOW_STEP
          .get(operation?.workflowStep) ||
        PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_STATE.EVIDENCE_UNAVAILABLE
      );
    }
    return (
      PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_STATE_BY_OBSERVATION_KEY.get(
        observationKey,
      ) ||
      PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_STATE.EVIDENCE_UNAVAILABLE
    );
  }

  isPriorityRecoveryRemoteSupersededTargetDrainCandidate(operation) {
    return (
      operation?.type === OperationType.REPLACE &&
      classifySystemPartition({partitionId: operation.partitionId})
        .priorityControlPlane &&
      this.isPreSyncStep(operation.workflowStep) &&
      !this.repository.isOperationLocallyOwned(operation)
    );
  }

  resolvePriorityRecoveryRemoteSupersededTargetDrainError(
    operation,
    priorityRecoveryContext,
  ) {
    if (
      !this.isPriorityRecoveryRemoteSupersededTargetDrainCandidate(operation) ||
      !priorityRecoveryContext ||
      typeof priorityRecoveryContext !== 'object'
    ) {
      return null;
    }
    const decisionSnapshot = priorityRecoveryContext.decisionSnapshot;
    const blockerReasons = Array.isArray(decisionSnapshot?.blockerReasons) ?
      decisionSnapshot.blockerReasons :
      [];
    if (
      !blockerReasons.includes(
        PRIORITY_RECOVERY_BLOCKER_REASON.RECOVERY_ELIGIBLE_EXCLUDED,
      )
    ) {
      return null;
    }
    const targetNodeId = String(
      operation.targetNodeId || OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING,
    ).trim();
    const eligibleNodeIds = normalizeNodeIdList(
      priorityRecoveryContext.effectiveEligibleNodeIds,
    );
    if (
      targetNodeId.length === 0 ||
      eligibleNodeIds.length === 0 ||
      eligibleNodeIds.includes(targetNodeId)
    ) {
      return null;
    }
    const targetState =
      this.resolvePriorityRecoveryPreSyncReplaceTargetState(operation);
    if (
      targetState ===
      PRIORITY_RECOVERY_PRE_SYNC_REPLACE_TARGET_STATE.MATERIALIZED
    ) {
      return null;
    }
    return this.buildPriorityRecoverySupersededTargetError(
      operation,
      targetNodeId,
      eligibleNodeIds,
    );
  }

  isPriorityRecoveryAddOperationDrainTargetSatisfied(operation) {
    if (operation?.type !== OperationType.ADD) {
      return false;
    }
    if (
      !this.repository ||
      typeof this.repository.getObservedReplicaStatusFromCache !==
        'function'
    ) {
      return false;
    }
    const observedTargetStatus =
      this.repository.getObservedReplicaStatusFromCache(
        operation.replicaId,
        operation.partitionId,
        operation.targetNodeId,
        EXACT_TARGET_REPLICA_OBSERVATION_OPTIONS,
      );
    return PRIORITY_RECOVERY_OPERATION_DRAIN_ADD_TARGET_STATUSES.has(
      observedTargetStatus,
    );
  }

  buildPriorityRecoveryAddOperationDrainSourceSnapshot(
    operation,
    completionState,
  ) {
    const completionAccepted =
      PRIORITY_RECOVERY_OPERATION_DRAIN_COMPLETION_STATES.has(
        completionState,
      );
    const targetSatisfied =
      completionAccepted &&
      this.isPriorityRecoveryAddOperationDrainTargetSatisfied(operation);
    return Object.freeze({
      state: targetSatisfied ?
        PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_STATE.NOT_REQUIRED :
        PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_STATE.EVIDENCE_UNAVAILABLE,
      sourceReplicaId: null,
      observationState: null,
      lifecycleStatus: null,
    });
  }

  /**
   * A remote non-owner settles an intermediate priority ADD whose owner is
   * unavailable when the operation's OWN target replica is read ACTIVE from
   * the authoritative status (the orphan reconciler's evidence): an operation
   * fact, decided without reading spread. Spread-accepted completions keep
   * the cache-observed arm above; an available owner completes its own ADD.
   * @param {Object} operation
   * @param {string} completionState
   * @return {Promise<boolean>}
   */
  async isPriorityRecoveryAddSettledByOperationFact(
    operation,
    completionState,
  ) {
    if (
      operation?.type !== OperationType.ADD ||
      PRIORITY_RECOVERY_OPERATION_DRAIN_COMPLETION_STATES.has(
        completionState,
      ) ||
      this.repository.isOperationLocallyOwned(operation) ||
      !this.isPriorityRecoveryDrainOwnerUnavailable(
        this.repository.resolveOperationOwnerNodeId(operation) || null,
        operation,
      )
    ) {
      return false;
    }
    try {
      return PRIORITY_RECOVERY_OPERATION_DRAIN_ADD_TARGET_STATUSES.has(
        await this.getReconciledReplicaStatus(
          operation.replicaId,
          operation.partitionId,
          operation.targetNodeId,
        ),
      );
    } catch {
      return false;
    }
  }

  // The drain state, in precedence order: a superseded target, then the
  // ADD operation fact, then the completion/source decision.
  async resolvePriorityRecoveryOperationDrainSnapshotState(evidence) {
    if (evidence.supersededTargetState) {
      return evidence.supersededTargetState;
    }
    if (
      await this.isPriorityRecoveryAddSettledByOperationFact(
        evidence.operation,
        evidence.completionState,
      )
    ) {
      return PRIORITY_RECOVERY_OPERATION_DRAIN_STATE
        .ADD_TARGET_ACTIVE_OWNER_UNAVAILABLE;
    }
    return this.resolvePriorityRecoveryOperationDrainState(
      evidence.completion,
      evidence.sourceSnapshot,
      evidence.releaseEvidence,
      evidence.operation,
    );
  }

  resolvePriorityRecoveryPreSyncReplaceTargetState(operation) {
    if (
      operation?.type !== OperationType.REPLACE ||
      !this.isPreSyncStep(operation.workflowStep)
    ) {
      return PRIORITY_RECOVERY_PRE_SYNC_REPLACE_TARGET_STATE.NOT_APPLICABLE;
    }
    if (
      !this.repository ||
      typeof this.repository.getObservedReplicaStatusFromCache !==
        'function'
    ) {
      return PRIORITY_RECOVERY_PRE_SYNC_REPLACE_TARGET_STATE
        .EVIDENCE_UNAVAILABLE;
    }
    const observedTargetStatus =
      this.repository.getObservedReplicaStatusFromCache(
        operation.replicaId,
        operation.partitionId,
        operation.targetNodeId,
        EXACT_TARGET_REPLICA_OBSERVATION_OPTIONS,
      );
    return resolvePriorityRecoveryPreSyncReplaceTargetStateFromEvidence({
      operation,
      targetLifecycleStatus: observedTargetStatus,
    });
  }

  buildPriorityRecoveryPreSyncReplaceDrainEvidence(
    operation,
    completionState,
  ) {
    return Object.freeze({
      completionAccepted:
        PRIORITY_RECOVERY_OPERATION_DRAIN_COMPLETION_STATES.has(
          completionState,
        ),
      targetState:
        this.resolvePriorityRecoveryPreSyncReplaceTargetState(operation),
      stepStale: this.isPriorityRecoveryOperationDrainStepStale(operation),
    });
  }

  resolvePriorityRecoveryPreSyncReplaceDrainDecision(evidence) {
    return (
      PRIORITY_RECOVERY_PRE_SYNC_REPLACE_DRAIN_DECISION_TABLE.find((entry) =>
        entry.matches(evidence),
      )?.state ||
      PRIORITY_RECOVERY_PRE_SYNC_REPLACE_DRAIN_DECISION.NO_OVERRIDE
    );
  }

  resolvePriorityRecoveryPreSyncReplaceDrainSourceState(
    operation,
    completionState,
  ) {
    const evidence = this.buildPriorityRecoveryPreSyncReplaceDrainEvidence(
      operation,
      completionState,
    );
    return (
      PRIORITY_RECOVERY_PRE_SYNC_REPLACE_DRAIN_SOURCE_STATE_BY_DECISION.get(
        this.resolvePriorityRecoveryPreSyncReplaceDrainDecision(evidence),
      ) ||
      PRIORITY_RECOVERY_PRE_SYNC_REPLACE_DRAIN_DECISION.NO_OVERRIDE
    );
  }

  buildPriorityRecoveryOperationDrainSourceSnapshotForState(state) {
    return Object.freeze({
      state,
      sourceReplicaId: null,
      observationState: null,
      lifecycleStatus: null,
    });
  }

  async buildPriorityRecoveryOperationDrainSourceSnapshot(
    operation,
    completionState,
  ) {
    if (operation?.type === OperationType.ADD) {
      return this.buildPriorityRecoveryAddOperationDrainSourceSnapshot(
        operation,
        completionState,
      );
    }
    if (
      !PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_REMOVAL_TYPES.has(
        operation?.type,
      ) ||
      !PRIORITY_RECOVERY_OPERATION_DRAIN_COMPLETION_STATES.has(
        completionState,
      )
    ) {
      return Object.freeze({
        state: PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_STATE.NOT_REQUIRED,
        sourceReplicaId: null,
        observationState: null,
        lifecycleStatus: null,
      });
    }
    const preSyncReplaceDrainSourceState =
      this.resolvePriorityRecoveryPreSyncReplaceDrainSourceState(
        operation,
        completionState,
      );
    if (
      preSyncReplaceDrainSourceState !==
      PRIORITY_RECOVERY_PRE_SYNC_REPLACE_DRAIN_DECISION.NO_OVERRIDE
    ) {
      return this
        .buildPriorityRecoveryOperationDrainSourceSnapshotForState(
          preSyncReplaceDrainSourceState,
        );
    }
    const targetResolver =
      PRIORITY_RECOVERY_OPERATION_DRAIN_REPLICA_TARGET_BY_TYPE.get(
        operation.type,
      );
    const sourceReplicaId = targetResolver?.getReplicaId(
      operation,
      this.repository,
    );
    if (!sourceReplicaId) {
      return Object.freeze({
        state:
          PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_STATE.EVIDENCE_UNAVAILABLE,
        sourceReplicaId: null,
        observationState: null,
        lifecycleStatus: null,
      });
    }
    const observation = await this.observeStoppingReplicaProgress(
      sourceReplicaId,
      operation.partitionId,
      targetResolver.getNodeId(operation),
    );
    return Object.freeze({
      state: this.resolvePriorityRecoveryOperationDrainSourceState(
        observation,
        operation,
      ),
      sourceReplicaId,
      observationState: observation?.state || null,
      lifecycleStatus: observation?.lifecycleStatus || null,
    });
  }

  resolvePriorityRecoveryOperationDrainOwnerState(
    operation,
    drainAction,
    drainState,
  ) {
    if (this.repository.isOperationLocallyOwned(operation)) {
      return drainState ===
        PRIORITY_RECOVERY_OPERATION_DRAIN_STATE.RECOVERING_DISPATCH_PARKED ?
        PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_STATE.LOCAL_LANE_PARKED :
        PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_STATE.LOCAL_OWNER;
    }
    if (isRemoteSettleDrainAction(operation, drainAction)) {
      return (
        PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_STATE.REMOTE_SETTLE_ALLOWED
      );
    }
    if (
      drainAction ===
      OPERATION_LIFECYCLE_ACTION.FAIL_PRIORITY_RECOVERY_DRAIN_STALE
    ) {
      // Stale-FAIL settles remotely only against an unavailable owner: an
      // available owner may merely have deferred visibility (its progress not
      // yet readable here) and must be woken, not have its work killed.
      const ownerNodeId =
        this.repository.resolveOperationOwnerNodeId(operation) || null;
      if (this.isPriorityRecoveryDrainOwnerUnavailable(ownerNodeId, operation)) {
        return (
          PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_STATE.REMOTE_SETTLE_ALLOWED
        );
      }
      if (
        this.shouldRetryCoordinatorCreatedRemoteHandoff(operation) &&
        this.isDispatchRetryableWorkflowStep(operation)
      ) {
        return PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_STATE
          .REMOTE_REARM_REQUIRED;
      }
      return PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_STATE
        .REMOTE_OWNER_REQUIRED;
    }
    if (
      this.shouldRetryCoordinatorCreatedRemoteHandoff(operation) &&
      this.isDispatchRetryableWorkflowStep(operation)
    ) {
      return PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_STATE
        .REMOTE_REARM_REQUIRED;
    }
    return PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_STATE.REMOTE_OWNER_REQUIRED;
  }

  /**
   * BR14: a remote owner is woken for a hand-back only when the drain's
   * verdict changed since its last hand-back; otherwise it is left to its
   * own lane.
   * @param {Object} operation
   * @param {string} action
   * @param {string} ownerState
   * @param {string} verdictKey
   * @return {string} The owner state.
   */
  boundReplaceOwnerHandBack(operation, action, ownerState, verdictKey) {
    if (action !== OPERATION_LIFECYCLE_ACTION.HAND_BACK_REPLACE_OWNER ||
        ownerState !==
          PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_STATE.REMOTE_REARM_REQUIRED ||
        admitReplaceOwnerHandBack(this, operation.operationId, verdictKey)) {
      return ownerState;
    }
    return PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_STATE.REMOTE_OWNER_REQUIRED;
  }

  resolvePriorityRecoveryOperationDrainOwnerAction(ownerState) {
    return (
      PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_ACTION_BY_STATE.get(
        ownerState,
      ) ||
      PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_ACTION.SKIP_REMOTE_OWNER
    );
  }

  shouldEnterOperationLifecycleFromDrainSnapshot(drainSnapshot) {
    return (
      drainSnapshot?.ownerAction ===
      PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_ACTION.ALLOW_RECONCILE
    );
  }

  hasActivePriorityRecoveryRemoteOwnerWakeRetry(operationId, now = Date.now()) {
    return (
      operationId.length > 0 &&
      this.hasActiveCreatedOperationHandoffRetry(operationId, now) &&
      this.hasActiveTransitionRetryGrace(operationId, now)
    );
  }

  async wakePriorityRecoveryRemoteOwnerFromDrainSnapshot(
    operation,
    drainSnapshot,
  ) {
    const resolvedDrainSnapshot =
      drainSnapshot ||
      await this.buildPriorityRecoveryOperationDrainSnapshot(operation);
    if (
      resolvedDrainSnapshot?.ownerAction !==
      PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_ACTION.WAKE_REMOTE_OWNER
    ) {
      return false;
    }
    const operationId = String(
      operation?.operationId || OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING,
    ).trim();
    if (
      this.hasActivePriorityRecoveryRemoteOwnerWakeRetry(operationId)
    ) {
      return true;
    }
    if (
      operationId.length > 0 &&
      this.createdOperationHandoffRetryTimerByOperationId.has(operationId)
    ) {
      this.clearCreatedOperationHandoffRetry(operationId);
    }
    const woken = await this.wakeCoordinatorCreatedRemoteOwner(operation);
    return (
      Boolean(woken) ||
      this.hasActivePriorityRecoveryRemoteOwnerWakeRetry(operationId)
    );
  }

  async buildPriorityRecoveryOperationDrainSnapshot(operation) {
    if (!this.isPriorityRecoveryOperationDrainCandidate(operation)) {
      const action =
        PRIORITY_RECOVERY_OPERATION_DRAIN_ACTION_BY_STATE.get(
          PRIORITY_RECOVERY_OPERATION_DRAIN_STATE.NOT_APPLICABLE,
        ) || OPERATION_LIFECYCLE_ACTION.NOOP;
      const ownerState =
        this.resolvePriorityRecoveryOperationDrainOwnerState(
          operation,
          action,
          PRIORITY_RECOVERY_OPERATION_DRAIN_STATE.NOT_APPLICABLE,
        );
      return Object.freeze({
        state: PRIORITY_RECOVERY_OPERATION_DRAIN_STATE.NOT_APPLICABLE,
        action,
        ownerState,
        ownerAction:
          this.resolvePriorityRecoveryOperationDrainOwnerAction(ownerState),
        completionState:
          PRIORITY_RECOVERY_OPERATION_DRAIN_COMPLETION_STATE_UNAVAILABLE,
      });
    }

    const planningSnapshot =
      await this.readAvailablePriorityRecoveryPlanningSnapshot(operation);
    const priorityRecoveryContext =
      this.buildPriorityRecoveryAssessmentContextForOperation(
        operation,
        planningSnapshot,
      );
    const completion =
      this.buildPriorityRecoveryCompletionForOperation(
        operation,
        planningSnapshot,
      ) ||
      priorityRecoveryContext?.completion ||
      null;
    const supersededTargetError =
      this.resolvePriorityRecoveryRemoteSupersededTargetDrainError(
        operation,
        priorityRecoveryContext,
      );
    const supersededTargetState =
      supersededTargetError ?
        PRIORITY_RECOVERY_OPERATION_DRAIN_STATE.SUPERSEDED_TARGET :
        null;
    const completionState =
      completion?.state ||
      PRIORITY_RECOVERY_OPERATION_DRAIN_COMPLETION_STATE_UNAVAILABLE;
    const sourceSnapshot =
      supersededTargetState ?
        Object.freeze({
          state: PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_STATE.NOT_REQUIRED,
          sourceReplicaId: null,
          observationState: null,
          lifecycleStatus: null,
        }) :
        await this.buildPriorityRecoveryOperationDrainSourceSnapshot(
          operation,
          completionState,
        );
    const releaseEvidence =
      this.buildPriorityRecoveryOperationDrainReleaseEvidence(
        operation,
        completion,
        sourceSnapshot,
      );
    const state = await this.resolvePriorityRecoveryOperationDrainSnapshotState({
      operation,
      completion,
      completionState,
      sourceSnapshot,
      releaseEvidence,
      supersededTargetState,
    });
    const action =
      PRIORITY_RECOVERY_OPERATION_DRAIN_ACTION_BY_STATE.get(state) ||
      OPERATION_LIFECYCLE_ACTION.NOOP;
    const ownerState = this.boundReplaceOwnerHandBack(
      operation,
      action,
      this.resolvePriorityRecoveryOperationDrainOwnerState(
        operation,
        action,
        state,
      ),
      [state, completionState, sourceSnapshot.state]
        .join(HAND_BACK_VERDICT_SEPARATOR),
    );
    return Object.freeze({
      state,
      action,
      ownerState,
      ownerAction:
        this.resolvePriorityRecoveryOperationDrainOwnerAction(ownerState),
      completionState,
      sourceState: sourceSnapshot.state,
      sourceReplicaId: sourceSnapshot.sourceReplicaId,
      sourceObservationState: sourceSnapshot.observationState,
      sourceLifecycleStatus: sourceSnapshot.lifecycleStatus,
      supersededTargetError,
    });
  }

  logPriorityRecoveryOperationDrainSettle(operation, drainSnapshot) {
    this.logger.info(
      REBALANCE_COORDINATOR_LOG_MSG.PRIORITY_RECOVERY_DRAIN_SETTLED,
      {
        operationId: operation?.operationId || null,
        partitionId: operation?.partitionId || null,
        operationType: operation?.type || null,
        workflowStep: operation?.workflowStep || null,
        action: drainSnapshot?.action || null,
        drainState: drainSnapshot?.state || null,
        completionState: drainSnapshot?.completionState || null,
        sourceState: drainSnapshot?.sourceState || null,
        sourceObservationState:
          drainSnapshot?.sourceObservationState || null,
        ownerState: drainSnapshot?.ownerState || null,
      },
    );
  }

  async reconcilePriorityRecoveryOperationDrain(
    operation,
    drainSnapshot = null,
  ) {
    const resolvedDrainSnapshot =
      drainSnapshot ||
      await this.buildPriorityRecoveryOperationDrainSnapshot(operation);
    if (
      resolvedDrainSnapshot.action ===
      OPERATION_LIFECYCLE_ACTION.FAIL_PRIORITY_RECOVERY_SUPERSEDED_TARGET
    ) {
      this.logPriorityRecoveryOperationDrainSettle(
        operation,
        resolvedDrainSnapshot,
      );
      // Truthful progress (quest terminal-write-refusal-retry-ownership):
      // a termination whose durable write was refused did NOT drain —
      // reporting it progressed would let level-triggered machinery
      // believe a settle that never landed.
      return isTerminalTransitionOutcomeSettled(
        await this.failOperation(
          operation,
          resolvedDrainSnapshot.supersededTargetError,
          {logLevel: FAILURE_LOG_LEVEL.WARN},
        ),
      );
    }
    if (
      resolvedDrainSnapshot.action ===
      OPERATION_LIFECYCLE_ACTION.FAIL_PRIORITY_RECOVERY_DRAIN_STALE
    ) {
      if (
        resolvedDrainSnapshot.ownerAction !==
        PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_ACTION.ALLOW_RECONCILE
      ) {
        return false;
      }
      this.logPriorityRecoveryOperationDrainSettle(
        operation,
        resolvedDrainSnapshot,
      );
      return isTerminalTransitionOutcomeSettled(
        await this.failOperation(
          operation,
          // R-1c names its own settlement; step-age staleness before the
          // intent keeps the drain's message.
          isPartitionReplace(operation) &&
            isTargetFailureDetectorDead(this, operation) ?
            REPLACE_OWNER_UNAVAILABLE_SOURCE_RETAINED :
            OPERATION_WORKFLOW_OWNER_LITERAL
              .PRIORITY_RECOVERY_DRAIN_STALE_WITHOUT_RETIREMENT_EVIDENCE,
          {logLevel: FAILURE_LOG_LEVEL.WARN},
        ),
      );
    }
    if (
      resolvedDrainSnapshot.action !==
      OPERATION_LIFECYCLE_ACTION.COMPLETE_PRIORITY_RECOVERY_DRAIN
    ) {
      return false;
    }
    this.logPriorityRecoveryOperationDrainSettle(
      operation,
      resolvedDrainSnapshot,
    );
    return isTerminalTransitionOutcomeSettled(
      await this.completeOperation(operation),
    );
  }

  async reconcileRecoveryOperation(op) {
    const reservationRecoveryOutcome =
      await reconcileReservationBackedPendingOperation(this, op);
    if (
      reservationRecoveryOutcome !==
      OPERATION_RESERVATION_RECOVERY_OUTCOME.NOT_APPLICABLE
    ) {
      return reservationRecoveryOutcome;
    }
    await this.reconcileOperationLifecycle(op, {
      cause: OPERATION_WORKFLOW_OWNER_LITERAL.RECOVERY,
    });
    return OPERATION_RESERVATION_RECOVERY_OUTCOME.LIFECYCLE_RECONCILED;
  }

  async reconcileSyncingOperation(operation) {
    this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.RECONCILE_SYNCING, {
      operationId: operation.operationId,
      partitionId: operation.partitionId,
      targetNodeId: operation.targetNodeId,
    });

    const progressed = await this.reconcileOperationLifecycle(operation, {
      cause: 'recovery',
    });
    if (!progressed) {
      this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.RECONCILE_IN_PROGRESS, {
        operationId: operation.operationId,
        partitionId: operation.partitionId,
        workflowStep: operation.workflowStep,
      });
    }
  }
}

export {OperationWorkflowRecoveryDrain};
