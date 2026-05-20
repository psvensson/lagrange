import {OperationWorkflowOwnerSegment7Stage3} from './operation-workflow-owner-segment-7-stage-3.js';
import {OPERATION_WORKFLOW_OWNER_SEGMENT_7_STAGE_SHARED as SHARED} from './operation-workflow-recovery-reconcile-shared.js';

const {
  EXACT_TARGET_REPLICA_OBSERVATION_OPTIONS,
  FAILURE_LOG_LEVEL,
  NUM,
  OPERATION_LIFECYCLE_ACTION,
  OPERATION_WORKFLOW_OWNER_LITERAL,
  OperationType,
  PRIORITY_RECOVERY_BLOCKER_REASON,
  PRIORITY_RECOVERY_COMPLETION_STATE,
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
  TYPEOF,
  isPriorityControlPlanePartition,
  normalizeNodeIdList,
  resolvePriorityRecoveryPreSyncReplaceTargetStateFromEvidence,
} = SHARED;

class OperationWorkflowOwnerSegment7Stage4 extends OperationWorkflowOwnerSegment7Stage3 {
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

  resolvePriorityRecoveryOperationDrainSourceState(observation) {
    const observationKey =
      this.resolvePriorityRecoveryOperationDrainSourceObservationKey(
        observation,
      );
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
      isPriorityControlPlanePartition({partitionId: operation.partitionId}) &&
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
      typeof priorityRecoveryContext !== TYPEOF.OBJECT
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
      targetNodeId.length === NUM.ZERO ||
      eligibleNodeIds.length === NUM.ZERO ||
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

  isPriorityRecoveryAddOperationDrainTargetSatisfied(
    operation,
    priorityRecoveryContext,
  ) {
    if (operation?.type !== OperationType.ADD) {
      return false;
    }
    const operationId = String(
      operation.operationId || OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING,
    ).trim();
    const satisfyingOperationIds = Array.isArray(
      priorityRecoveryContext?.decisionSnapshot?.spreadCompletion
        ?.satisfyingOperationIds,
    ) ?
      priorityRecoveryContext.decisionSnapshot.spreadCompletion
        .satisfyingOperationIds :
      [];
    if (
      operationId.length > NUM.ZERO &&
      satisfyingOperationIds.includes(operationId)
    ) {
      return true;
    }
    if (
      !this.repository ||
      typeof this.repository.getObservedReplicaStatusFromCache !==
        TYPEOF.FUNCTION
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
    priorityRecoveryContext,
  ) {
    const targetSatisfied =
      completionState === PRIORITY_RECOVERY_COMPLETION_STATE.CONVERGED &&
      this.isPriorityRecoveryAddOperationDrainTargetSatisfied(
        operation,
        priorityRecoveryContext,
      );
    return Object.freeze({
      state: targetSatisfied ?
        PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_STATE.NOT_REQUIRED :
        PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_STATE.EVIDENCE_UNAVAILABLE,
      sourceReplicaId: null,
      observationState: null,
      lifecycleStatus: null,
    });
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
        TYPEOF.FUNCTION
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
    priorityRecoveryContext = null,
  ) {
    if (operation?.type === OperationType.ADD) {
      return this.buildPriorityRecoveryAddOperationDrainSourceSnapshot(
        operation,
        completionState,
        priorityRecoveryContext,
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
      ),
      sourceReplicaId,
      observationState: observation?.state || null,
      lifecycleStatus: observation?.lifecycleStatus || null,
    });
  }

  resolvePriorityRecoveryOperationDrainOwnerState(operation, drainAction) {
    if (this.repository.isOperationLocallyOwned(operation)) {
      return PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_STATE.LOCAL_OWNER;
    }
    if (
      this.shouldRetryCoordinatorCreatedRemoteHandoff(operation) &&
      this.isDispatchRetryableWorkflowStep(operation)
    ) {
      return PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_STATE
        .REMOTE_REARM_REQUIRED;
    }
    if (
      drainAction ===
        OPERATION_LIFECYCLE_ACTION.COMPLETE_PRIORITY_RECOVERY_DRAIN ||
      drainAction ===
        OPERATION_LIFECYCLE_ACTION.FAIL_PRIORITY_RECOVERY_SUPERSEDED_TARGET
    ) {
      return (
        PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_STATE.REMOTE_SETTLE_ALLOWED
      );
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
      operationId.length > NUM.ZERO &&
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
      operationId.length > NUM.ZERO &&
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
      await this.getPriorityRecoveryPlanningSnapshot(operation);
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
          priorityRecoveryContext,
        );
    const releaseEvidence =
      this.buildPriorityRecoveryOperationDrainReleaseEvidence(
        operation,
        completion,
        sourceSnapshot,
      );
    const state =
      supersededTargetState ||
      this.resolvePriorityRecoveryOperationDrainState(
        completion,
        sourceSnapshot,
        releaseEvidence,
      );
    const action =
      PRIORITY_RECOVERY_OPERATION_DRAIN_ACTION_BY_STATE.get(state) ||
      OPERATION_LIFECYCLE_ACTION.NOOP;
    const ownerState =
      this.resolvePriorityRecoveryOperationDrainOwnerState(
        operation,
        action,
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
      await this.failOperation(
        operation,
        resolvedDrainSnapshot.supersededTargetError,
        {logLevel: FAILURE_LOG_LEVEL.WARN},
      );
      return true;
    }
    if (
      resolvedDrainSnapshot.action !==
      OPERATION_LIFECYCLE_ACTION.COMPLETE_PRIORITY_RECOVERY_DRAIN
    ) {
      return false;
    }
    await this.completeOperation(operation);
    return true;
  }

  async reconcileRecoveryOperation(op) {
    await this.reconcileOperationLifecycle(op, {
      cause: OPERATION_WORKFLOW_OWNER_LITERAL.RECOVERY,
    });
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

export {OperationWorkflowOwnerSegment7Stage4};
