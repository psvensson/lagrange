import {UNIFIED_REBALANCER_SHARED} from './unified-rebalancer-shared.js';
import {
  PRIORITY_RECOVERY_PLANNING_GATE_BYPASS_ACTION,
  PRIORITY_RECOVERY_PLANNING_GATE_BYPASS_ACTION_BY_STATE,
  PRIORITY_RECOVERY_PLANNING_GATE_BYPASS_STATE,
  PRIORITY_RECOVERY_PLANNING_GATE_BYPASS_STATE_TABLE,
  PRIORITY_RECOVERY_PLANNING_GATE_FIELD,
  PRIORITY_RECOVERY_PLANNING_GATE_SCOPE,
  PRIORITY_RECOVERY_PUBLICATION_EVENT_FIELD,
  PRIORITY_RECOVERY_PUBLICATION_EVENT_SCHEDULING_ACTION,
  PRIORITY_RECOVERY_PUBLICATION_EVENT_SCHEDULING_ACTION_BY_STATE,
  PRIORITY_RECOVERY_PUBLICATION_EVENT_SCHEDULING_STATE,
  PRIORITY_RECOVERY_PUBLICATION_EVENT_SCHEDULING_STATE_TABLE,
  REBALANCE_PLANNING_GATE,
} from './rebalancer-planning-gate-constants.js';

const {
  CONTROL_PLANE_PUBLICATION_STATUS,
  REBALANCER_LOG_MSG,
  SYSTEM_TABLE_NAME,
  UNIFIED_REBALANCER_LITERAL,
} = UNIFIED_REBALANCER_SHARED;

const REBALANCE_PLANNING_GATE_DIAGNOSTIC_NO_GATE = 'none';

const REBALANCER_PRIORITY_RECOVERY_PLANNING_GATE_METHODS = {
  /**
   * Return true when topology settling is already tracking in-flight work for
   * the same partition that priority recovery would create work for.
   * @param {Object|null} topologySettlingBlocker
   * @param {Object|null} operationCreationGate
   * @return {boolean}
   * @private
   */
  hasTopologySettlingBlockerForOperationCreationTarget(
    topologySettlingBlocker,
    operationCreationGate,
  ) {
    const operationCreationPartitionId = String(
      operationCreationGate?.operationCreationPartitionId ||
        UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    ).trim();
    if (operationCreationPartitionId.length === 0) {
      return false;
    }
    const inFlightDetails = Array.isArray(
      topologySettlingBlocker?.inFlightReplicaOperationDetails,
    ) ?
      topologySettlingBlocker.inFlightReplicaOperationDetails :
      [];
    return inFlightDetails.some((detail) => {
      const detailPartitionId = String(
        detail?.[PRIORITY_RECOVERY_PLANNING_GATE_FIELD.PARTITION_ID] ||
          detail?.[
            PRIORITY_RECOVERY_PLANNING_GATE_FIELD.PARTITION_ID_SNAKE
          ] ||
          UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
      ).trim();
      return detailPartitionId === operationCreationPartitionId;
    });
  },

  resolvePrioritySpreadPlanningGateDecision() {
    const controlPlanePriorityBlocker =
      this.getControlPlanePrioritySpreadBlocker();
    if (!controlPlanePriorityBlocker) {
      return null;
    }
    const blockedPartitions =
      controlPlanePriorityBlocker.blockedPartitions || [];
    const currentPriorityPartitionStillBlocked =
      this.isControlPlanePriorityPartition() &&
      blockedPartitions.some(
        (partition) => partition?.partitionId === this.entityId,
      );
    const operationCreationGate =
      this.buildPriorityRecoveryOperationCreationPlanningGateSnapshot(
        this.entityId,
      );
    if (
      currentPriorityPartitionStillBlocked ||
      operationCreationGate?.operationCreationRequired === true
    ) {
      return null;
    }
    const largestSpreadGap = blockedPartitions.reduce(
      (largestGap, partition) =>
        Math.max(largestGap, Number(partition?.spreadGap) || 0),
      0,
    );
    const scheduleDelayMs = this.getPriorityRetryDelayMs();
    return this.buildRebalancePlanningGateDecision({
      gate: REBALANCE_PLANNING_GATE.CONTROL_PLANE_PRIORITY_SPREAD,
      blocker: controlPlanePriorityBlocker,
      logMessage: REBALANCER_LOG_MSG.WAIT_CONTROL_PLANE_PRIORITY,
      logContext: {
        entityType: this.entityType,
        delayMs: scheduleDelayMs,
        requiredDistinctNodeCount:
          controlPlanePriorityBlocker.requiredDistinctNodeCount,
        blockedPartitionCount: blockedPartitions.length,
        largestSpreadGap,
        blockedPartitions: blockedPartitions.map((partition) => ({
          partitionId: partition.partitionId,
          readyReplicaCount: partition.readyReplicaCount,
          readyDistinctNodeCount: partition.readyDistinctNodeCount,
          spreadGap: partition.spreadGap,
          // CL-021 witness: WHY rows were excluded from the ready count
          // (e.g. raft_role_missing) — the planner-blindness attribution.
          exclusionReasonCounts: partition.exclusionReasonCounts || null,
        })),
      },
      scheduleDelayMs,
    });
  },

  isPriorityRecoveryOperationCreationRequiredForPlanningGate(partitionId) {
    const normalizedPartitionId = String(
      partitionId || UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    ).trim();
    if (normalizedPartitionId.length === 0) {
      return false;
    }
    const planningSnapshot = this.getPriorityRecoveryPlanningSnapshotSync(
      {partitionId: normalizedPartitionId},
    );
    if (!planningSnapshot || typeof planningSnapshot !== 'object') {
      return false;
    }
    const snapshots = Array.isArray(
      planningSnapshot[
        PRIORITY_RECOVERY_PLANNING_GATE_FIELD
          .PRIORITY_RECOVERY_DECISION_SNAPSHOTS
      ]?.[PRIORITY_RECOVERY_PLANNING_GATE_FIELD.SNAPSHOTS],
    ) ?
      planningSnapshot[
        PRIORITY_RECOVERY_PLANNING_GATE_FIELD
          .PRIORITY_RECOVERY_DECISION_SNAPSHOTS
      ][PRIORITY_RECOVERY_PLANNING_GATE_FIELD.SNAPSHOTS] :
      [];
    const decisionSnapshot =
      this.resolvePriorityRecoveryFollowUpDecisionSnapshotFromPlanning(
        planningSnapshot,
        {partitionId: normalizedPartitionId},
      ) || snapshots.find((snapshot) => {
        const snapshotPartitionId = String(
          snapshot?.[PRIORITY_RECOVERY_PLANNING_GATE_FIELD.PARTITION_ID] ||
            snapshot?.[
              PRIORITY_RECOVERY_PLANNING_GATE_FIELD.PARTITION_ID_SNAKE
            ] ||
            UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
        ).trim();
        return snapshotPartitionId === normalizedPartitionId;
      }) ||
      null;
    return this.isPriorityRecoveryFollowUpOperationRequired(decisionSnapshot);
  },

  buildPriorityRecoveryPublicationEventSchedulingSnapshot(
    event = {},
    options = {},
  ) {
    const publicationRow =
      event?.data && typeof event.data === 'object' ? event.data : {};
    const publicationStatus = String(
      publicationRow[PRIORITY_RECOVERY_PUBLICATION_EVENT_FIELD.STATUS] ||
        UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    ).toUpperCase();
    const priorityPartition = this.isControlPlanePriorityPartition() === true;
    const publicationEvent =
      event?.tableName === SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS;
    const leaderSatisfied =
      options?.requireLeader === false || this.isLeader === true;
    const publicationClosed =
      publicationStatus === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED;
    // CL-020: the operation-creation gate walks the full planning snapshot +
    // surrogate follow-up decisions (parseStepsHistory over every operation
    // row). Per the scheduling state table its result can only influence the
    // outcome when ALL the cheap evidence bits above hold — the first four
    // table rows match on those bits alone. This runs per cache-change event
    // of every table (visibility listener + isCriticalCDCEvent), so any
    // other event must never pay the planning re-derive.
    const operationCreationGate =
      priorityPartition &&
      publicationEvent &&
      leaderSatisfied &&
      publicationClosed ?
        this.buildPriorityRecoveryOperationCreationPlanningGateSnapshot(
          this.entityId,
        ) :
        null;
    const evidence = Object.freeze({
      priorityPartition,
      publicationEvent,
      leaderSatisfied,
      publicationClosed,
      operationCreationRequired:
        operationCreationGate?.operationCreationRequired === true,
    });
    const schedulingState =
      PRIORITY_RECOVERY_PUBLICATION_EVENT_SCHEDULING_STATE_TABLE.find(
        (entry) => entry.matches(evidence),
      )?.state ||
      PRIORITY_RECOVERY_PUBLICATION_EVENT_SCHEDULING_STATE
        .OPERATION_CREATION_NOT_REQUIRED;
    const schedulingAction =
      PRIORITY_RECOVERY_PUBLICATION_EVENT_SCHEDULING_ACTION_BY_STATE[
        schedulingState
      ] ||
      PRIORITY_RECOVERY_PUBLICATION_EVENT_SCHEDULING_ACTION.IGNORE_EVENT;
    const visibilityProgress =
      evidence.priorityPartition === true &&
      evidence.publicationEvent === true &&
      evidence.publicationClosed === true &&
      evidence.operationCreationRequired === true;
    return Object.freeze({
      evidence,
      operationCreationGate,
      schedulingState,
      schedulingAction,
      visibilityProgress,
      shouldEnqueue:
        schedulingAction ===
        PRIORITY_RECOVERY_PUBLICATION_EVENT_SCHEDULING_ACTION
          .ENQUEUE_RECOVERY_SCHEDULING,
    });
  },

  buildPriorityRecoveryOperationCreationPlanningGateSnapshot(partitionId) {
    const normalizedPartitionId = String(
      partitionId || UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    ).trim();
    if (
      normalizedPartitionId.length === 0 ||
      !this.isControlPlanePriorityPartition()
    ) {
      return null;
    }
    const planningSnapshot = this.getPriorityRecoveryPlanningSnapshotSync(
      {partitionId: normalizedPartitionId},
    );
    if (!planningSnapshot || typeof planningSnapshot !== 'object') {
      return null;
    }

    const currentOperationCreationRequired =
      this.isPriorityRecoveryOperationCreationRequiredForPlanningGate(
        normalizedPartitionId,
      );
    if (currentOperationCreationRequired) {
      return Object.freeze({
        operationCreationRequired: true,
        operationCreationPartitionId: normalizedPartitionId,
        operationCreationScope:
          PRIORITY_RECOVERY_PLANNING_GATE_SCOPE.CURRENT_PARTITION,
      });
    }

    const surrogateDecision =
      this.buildPriorityRecoverySurrogateFollowUpDecision(planningSnapshot);
    if (
      !this.isPriorityRecoveryFollowUpOperationRequired(
        surrogateDecision?.decisionSnapshot || null,
      )
    ) {
      return Object.freeze({
        operationCreationRequired: false,
        operationCreationPartitionId: null,
        operationCreationScope: null,
      });
    }

    return Object.freeze({
      operationCreationRequired: true,
      operationCreationPartitionId:
        this.resolvePriorityRecoveryFollowUpPartitionId(surrogateDecision),
      operationCreationScope:
        PRIORITY_RECOVERY_PLANNING_GATE_SCOPE.SURROGATE_PARTITION,
    });
  },

  /**
   * Return one normalized bypass snapshot for planning gates that would
   * otherwise strand the startup priority recovery operation-creation lane.
   *
   * @return {Object}
   * @private
   */
  buildPriorityRecoveryPlanningGateBypassSnapshot() {
    const isPriorityPartition = this.isControlPlanePriorityPartition();
    const operationCreationGate = isPriorityPartition ?
      this.buildPriorityRecoveryOperationCreationPlanningGateSnapshot(
        this.entityId,
      ) :
      null;
    const evidence = Object.freeze({
      isPriorityPartition,
      operationCreationRequired:
        operationCreationGate?.operationCreationRequired === true,
    });
    const bypassState =
      PRIORITY_RECOVERY_PLANNING_GATE_BYPASS_STATE_TABLE.find((entry) =>
        entry.matches(evidence),
      )?.state ||
      PRIORITY_RECOVERY_PLANNING_GATE_BYPASS_STATE
        .OPERATION_CREATION_NOT_REQUIRED;
    const bypassAction =
      PRIORITY_RECOVERY_PLANNING_GATE_BYPASS_ACTION_BY_STATE[bypassState] ||
      PRIORITY_RECOVERY_PLANNING_GATE_BYPASS_ACTION.APPLY_GATE;
    return Object.freeze({
      evidence,
      bypassState,
      bypassAction,
      operationCreationGate,
      shouldBypass:
        bypassAction ===
        PRIORITY_RECOVERY_PLANNING_GATE_BYPASS_ACTION.ALLOW_PLANNING,
    });
  },

  /**
   * Capture one node-log diagnostic explaining, for control-plane priority
   * partitions, why a checkRebalance pass did or did not build the
   * priority-recovery operation. This surfaces the planning-gate bypass state
   * (`shouldBypass`, `operationCreationRequired`) and the sync planning-snapshot
   * availability so the recovery-op lost-wakeup can be confirmed from run
   * evidence instead of inferred. No-op for non-priority entities so ordinary
   * partition logs are not polluted.
   *
   * @param {Object|null} decision - The winning planning-gate decision, if any.
   * @return {Object|null} The recorded diagnostic, or null when not applicable.
   */
  recordPriorityRecoveryPlanningGateDecisionDiagnostic(decision) {
    if (!this.isControlPlanePriorityPartition()) {
      return null;
    }
    let bypass = null;
    let syncPlanningSnapshotAvailable = false;
    try {
      bypass = this.buildPriorityRecoveryPlanningGateBypassSnapshot();
    } catch (_bypassError) {
      bypass = null;
    }
    try {
      syncPlanningSnapshotAvailable = !!this.getPriorityRecoveryPlanningSnapshotSync(
        {partitionId: this.entityId},
      );
    } catch (_snapshotError) {
      syncPlanningSnapshotAvailable = false;
    }
    const operationCreationGate = bypass?.operationCreationGate || null;
    const diagnostic = Object.freeze({
      entityId: this.entityId,
      nodeId: this.nodeId || null,
      isLeader: this.isLeader === true,
      winningGate:
        decision?.gate || REBALANCE_PLANNING_GATE_DIAGNOSTIC_NO_GATE,
      planningState: decision?.logContext?.planningState || null,
      shouldBypass: bypass?.shouldBypass === true,
      bypassState: bypass?.bypassState || null,
      operationCreationRequired:
        bypass?.evidence?.operationCreationRequired === true,
      operationCreationScope:
        operationCreationGate?.operationCreationScope || null,
      operationCreationPartitionId:
        operationCreationGate?.operationCreationPartitionId || null,
      syncPlanningSnapshotAvailable,
      observedAtMs: Date.now(),
    });
    this.lastPriorityRecoveryPlanningGateDiagnostic = diagnostic;
    this.logger.info(
      REBALANCER_LOG_MSG.PRIORITY_RECOVERY_PLANNING_GATE_DIAGNOSTIC,
      diagnostic,
    );
    return diagnostic;
  },
};

export {REBALANCER_PRIORITY_RECOVERY_PLANNING_GATE_METHODS};
