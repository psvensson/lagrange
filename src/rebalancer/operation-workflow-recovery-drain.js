import {OperationWorkflowRecoveryTimeout} from './operation-workflow-recovery-timeout.js';
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
  TIME_MS,
  TYPEOF,
  isPriorityControlPlanePartition,
  normalizeNodeIdList,
  resolvePriorityRecoveryPreSyncReplaceTargetStateFromEvidence,
} = SHARED;

// Default-off flag for the redundant-REPLACE retirement lever (epic
// control-plane-write-wedge-leader-local-establishment.md, lever (c)). A priority
// control-plane REPLACE whose owner==target is an unreachable remote node perpetually
// re-tries WAKE_REMOTE_OWNER and never dispatches; when an independent sibling has
// already driven the partition to CONVERGED spread, the un-dispatched op is a pure
// no-op zombie that holds quiesce open. Opt-in until gate-validated, like the other
// convergence levers. The retirement writes only the op's own replica_operations row
// (failOperation) — never the B4-fenced control_plane_publications table — so it is
// B4-safe.
const PRIORITY_RECOVERY_REDUNDANT_REPLACE_RETIRE_FLAG =
  'LAGRANGE_PR_REDUNDANT_REPLACE_RETIRE';
function isPriorityRecoveryRedundantReplaceRetireEnabled() {
  return (
    process.env[PRIORITY_RECOVERY_REDUNDANT_REPLACE_RETIRE_FLAG] === 'true'
  );
}

// Wall-clock stall floor before a redundant un-dispatched REPLACE is retired.
// Priority-recovery ops routinely run with no per-step deadline (stepTimeoutMs=0), so
// we cannot rely on the step timeout; anchor on a fixed floor (45s — the same floor
// the census-#4 spread-stall guard and zombie-redrive no-deadline path use: below the
// 120s over-target oracle, above normal in-flight latency) so the remote owner had a
// real chance to wake before we retire its work.
const PRIORITY_RECOVERY_REDUNDANT_REPLACE_RETIRE_MIN_STALL_MS =
  TIME_MS.SECOND * 45;

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
        operation,
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
      drainAction ===
        OPERATION_LIFECYCLE_ACTION.COMPLETE_PRIORITY_RECOVERY_DRAIN ||
      drainAction ===
        OPERATION_LIFECYCLE_ACTION.FAIL_PRIORITY_RECOVERY_SUPERSEDED_TARGET
    ) {
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
        operation,
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
      await this.failOperation(
        operation,
        resolvedDrainSnapshot.supersededTargetError,
        {logLevel: FAILURE_LOG_LEVEL.WARN},
      );
      return true;
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
      await this.failOperation(
        operation,
        OPERATION_WORKFLOW_OWNER_LITERAL
          .PRIORITY_RECOVERY_DRAIN_STALE_WITHOUT_RETIREMENT_EVIDENCE,
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
    this.logPriorityRecoveryOperationDrainSettle(
      operation,
      resolvedDrainSnapshot,
    );
    await this.completeOperation(operation);
    return true;
  }

  // Lever (c): retire a REDUNDANT un-dispatched priority-control-plane REPLACE.
  //
  // The residual rolling-restart binder is a REPLACE on a priority control-plane
  // partition whose owner IS its (un-materialized) targetNodeId — a remote node that
  // is `connecting`/`reconnecting`, so the drain perpetually picks ownerAction =
  // WAKE_REMOTE_OWNER and the op never dispatches. Meanwhile an INDEPENDENT sibling
  // already drove the partition to CONVERGED spread (spreadGap=0 from materialized
  // replicas). The un-dispatched op is therefore a pure no-op that keeps the
  // closure's quiesce open. Neither SUPERSEDED_TARGET (target is eligible, not
  // excluded) nor the stale-FAIL path (stepTimeoutMs=0) retires it.
  //
  // This retires that record IFF it is provably redundant and safe to drop. The
  // load-bearing safety gate is `completion.state === CONVERGED`: CONVERGED ⇒
  // planner.ready ⇒ planner.spreadGap===0 computed from already-materialized
  // distinct-node replicas, which do NOT include this op's un-materialized target.
  // So retiring it cannot reduce spread. Belt gates: the op must be pre-sync (never
  // dispatched), its target must NOT be MATERIALIZED, it must NOT itself be a counted
  // in-flight spread satisfier, and it must be wedged past a wall-clock stall floor.
  // Called from checkTimeouts BEFORE the WAKE_REMOTE_OWNER branch so the perpetual
  // wake never short-circuits the retirement. Flag-off → returns false on the first
  // line (byte-identical). Mirrors the existing SUPERSEDED_TARGET retirement: it
  // settles a remote-owned op by failing only its own replica_operations row
  // (B4-safe), driven by this node's recovery sweep.
  //
  // @param {Object} operation
  // @param {Object|null} drainSnapshot — the drain snapshot already built by the
  //   caller (reused to avoid a second planning fetch on the hot path).
  // @return {Promise<boolean>} true when the op was retired (caller should skip wake).
  async retireRedundantPriorityReplaceFromDrainSnapshot(
    operation,
    drainSnapshot,
  ) {
    if (!isPriorityRecoveryRedundantReplaceRetireEnabled()) {
      return false;
    }
    if (
      !operation ||
      operation.type !== OperationType.REPLACE ||
      this.repository.isOperationTerminal(operation) ||
      !isPriorityControlPlanePartition({partitionId: operation.partitionId}) ||
      !this.isPreSyncStep(operation.workflowStep)
    ) {
      return false;
    }
    // Only act on the perpetual-wake-of-an-unreachable-remote-owner shape: the
    // drain wants to wake a remote owner that never answers. A locally-driveable
    // op (ALLOW_RECONCILE) is left to the normal reconcile path.
    if (
      drainSnapshot?.ownerAction !==
      PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_ACTION.WAKE_REMOTE_OWNER
    ) {
      return false;
    }
    // A target that has actually been built should COMPLETE, not retire.
    if (
      this.resolvePriorityRecoveryPreSyncReplaceTargetState(operation) ===
      PRIORITY_RECOVERY_PRE_SYNC_REPLACE_TARGET_STATE.MATERIALIZED
    ) {
      return false;
    }
    if (!this.isRedundantPriorityReplaceRetireStale(operation)) {
      return false;
    }
    // SAFETY (load-bearing): re-derive completion authoritatively and require
    // CONVERGED + this op is not a counted satisfier.
    if (
      !(await this.isRedundantPriorityReplaceSpreadConvergedIndependently(
        operation,
      ))
    ) {
      return false;
    }
    return await this.executeRedundantPriorityReplaceRetire(operation);
  }

  // True only when the op has been wedged in its current step past the wall-clock
  // stall floor (or its per-step deadline elapsed). Unparseable timestamps → never
  // retire (conservative).
  isRedundantPriorityReplaceRetireStale(operation) {
    if (this.isPriorityRecoveryOperationDrainStepStale(operation)) {
      return true;
    }
    const ageMs = this.resolvePriorityRecoveryOperationDrainStepAgeMs(
      operation,
      this.resolveTimeoutCheckNowMs(),
    );
    return (
      ageMs !== null &&
      ageMs >= PRIORITY_RECOVERY_REDUNDANT_REPLACE_RETIRE_MIN_STALL_MS
    );
  }

  // Authoritative spread-safety check: build a fresh planning context and require
  // completion.state === CONVERGED (independent materialized-replica spread, not the
  // in-flight-counted SPREAD_SATISFIED_IN_FLIGHT), AND that this op is not itself a
  // counted in-flight spread satisfier (belt over the MATERIALIZED-target gate).
  async isRedundantPriorityReplaceSpreadConvergedIndependently(operation) {
    const planningSnapshot =
      await this.getPriorityRecoveryPlanningSnapshot(operation);
    const context = this.buildPriorityRecoveryAssessmentContextForOperation(
      operation,
      planningSnapshot,
    );
    if (
      context?.completion?.state !==
      PRIORITY_RECOVERY_COMPLETION_STATE.CONVERGED
    ) {
      return false;
    }
    const operationId = String(
      operation.operationId || OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING,
    ).trim();
    const satisfyingOperationIds = Array.isArray(
      context?.decisionSnapshot?.spreadCompletion?.satisfyingOperationIds,
    ) ?
      context.decisionSnapshot.spreadCompletion.satisfyingOperationIds :
      [];
    return !satisfyingOperationIds.includes(operationId);
  }

  // Retire under the op single-flight lock with an AUTHORITATIVE re-read + full
  // re-confirmation, so a row that has since advanced/terminated is never failed
  // (idempotent, no double-retire). Writes only the op's replica_operations row.
  async executeRedundantPriorityReplaceRetire(operation) {
    const operationId = String(
      operation?.operationId || OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING,
    ).trim();
    if (operationId.length === NUM.ZERO) {
      return false;
    }
    let retired = false;
    await this.operationWorkflowRunExclusive(
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
        const current = this.selectTimeoutReconcileOperation(
          visibilityObservation,
          operation,
        );
        if (
          !current ||
          this.repository.isOperationTerminal(current) ||
          current.type !== OperationType.REPLACE ||
          !isPriorityControlPlanePartition({
            partitionId: current.partitionId,
          }) ||
          !this.isPreSyncStep(current.workflowStep) ||
          this.resolvePriorityRecoveryPreSyncReplaceTargetState(current) ===
            PRIORITY_RECOVERY_PRE_SYNC_REPLACE_TARGET_STATE.MATERIALIZED
        ) {
          return;
        }
        if (
          !(await this.isRedundantPriorityReplaceSpreadConvergedIndependently(
            current,
          ))
        ) {
          return;
        }
        this.logger.info(
          REBALANCE_COORDINATOR_LOG_MSG.PRIORITY_RECOVERY_DRAIN_SETTLED,
          {
            operationId,
            partitionId: current.partitionId || null,
            operationType: current.type || null,
            workflowStep: current.workflowStep || null,
            action: 'retire_redundant_replace',
            drainState: 'redundant_replace_retire',
          },
        );
        await this.failOperation(
          current,
          OPERATION_WORKFLOW_OWNER_LITERAL
            .PRIORITY_RECOVERY_REDUNDANT_REPLACE_RETIRED,
          {logLevel: FAILURE_LOG_LEVEL.WARN},
        );
        retired = true;
      },
    ).catch((error) =>
      this.handleReplicaOperationReconcileError(
        operation,
        error,
        'redundant_replace_retire',
      ),
    );
    return retired;
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

export {OperationWorkflowRecoveryDrain};
