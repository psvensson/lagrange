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
import {
  isBackgroundPrioritySpreadReleaseActive,
  observeActiveBackgroundPrioritySpreadReleaseBlocked,
  observeActiveBackgroundPrioritySpreadOperationDrain,
  observeBackgroundPrioritySpreadBlocked,
  registerBackgroundPrioritySpreadReleaseWake,
  resolveBackgroundPrioritySpreadStableRelease,
} from './background-priority-spread-release-tracker.js';
import {
  readExpectedReplicaCount,
} from '../control-plane/membership-publication-priority-partition-canonical-data.js';

const {
  CONTROL_PLANE_PUBLICATION_STATUS,
  REBALANCER_LOG_MSG,
  RECONCILE_REASON,
  SYSTEM_TABLE_NAME,
  UNIFIED_REBALANCER_LITERAL,
} = UNIFIED_REBALANCER_SHARED;

const REBALANCE_PLANNING_GATE_DIAGNOSTIC_NO_GATE = 'none';
const REBALANCE_PLANNING_GATE_NOT_APPLICABLE = null;
const PRIORITY_RECOVERY_OPERATION_CREATION_KIND = Object.freeze({
  LEDGER_SURPLUS_DRAIN: 'ledger_surplus_drain',
});

function normalizeLedgerSurplusDrainPlanningEvidence(concentration) {
  const targetReplicaCount = Number(concentration?.targetReplicaCount);
  const totalVoters = Number(concentration?.totalVoters);
  const targetNodeIds = Array.isArray(concentration?.distinctVoterNodeIds) ?
    concentration.distinctVoterNodeIds.filter(Boolean) :
    [];
  return {concentration, targetReplicaCount, targetNodeIds, totalVoters};
}

function isExecutableLedgerSurplusDrainPlanningEvidence(evidence) {
  return (
    evidence.concentration?.overTarget === true &&
    Number.isInteger(evidence.targetReplicaCount) &&
    evidence.targetReplicaCount > 0 &&
    Number.isInteger(evidence.totalVoters) &&
    evidence.totalVoters > evidence.targetReplicaCount &&
    evidence.targetNodeIds.length === evidence.targetReplicaCount
  );
}

function buildLedgerSurplusDrainPlanningCapability(concentration) {
  const evidence = normalizeLedgerSurplusDrainPlanningEvidence(concentration);
  if (!isExecutableLedgerSurplusDrainPlanningEvidence(evidence)) {
    return null;
  }
  const {
    targetReplicaCount,
    targetNodeIds,
  } = evidence;
  return Object.freeze({
    kind: PRIORITY_RECOVERY_OPERATION_CREATION_KIND.LEDGER_SURPLUS_DRAIN,
    targetReplicaCount,
    targetNodeIds: Object.freeze([...targetNodeIds]),
  });
}

function buildBlockedPartitionLogContext(partition) {
  const expectedReplicaCount = readExpectedReplicaCount(partition);
  return {
    partitionId: partition.partitionId,
    ...(expectedReplicaCount !== null ? {expectedReplicaCount} : {}),
    readyReplicaCount: partition.readyReplicaCount,
    readyDistinctNodeCount: partition.readyDistinctNodeCount,
    spreadGap: partition.spreadGap,
    missingActiveLeader: partition.missingActiveLeader === true,
    // CL-021 witness: WHY rows were excluded from the ready count
    // (e.g. raft_role_missing) — the planner-blindness attribution.
    exclusionReasonCounts: partition.exclusionReasonCounts || null,
  };
}

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

  /**
   * Register this parked entity's event-driven wake with the shared
   * release tracker before deferring on the ordinary-work spread fence.
   * The wake fires once, when the tracker declares the stable release,
   * and re-enqueues this entity through the owner reconcile queue; the
   * deferred decision's scheduled timer stays armed as the fallback.
   * @return {boolean} whether the wake was registered
   * @private
   */
  registerBackgroundPrioritySpreadStableReleaseWake() {
    return registerBackgroundPrioritySpreadReleaseWake({
      readinessOwner: this.controlPlaneReadinessService,
      wakeKey: this.entityId,
      onStableRelease: () =>
        this.enqueueRebalanceCheck(
          RECONCILE_REASON.PRIORITY_SPREAD_RELEASE_WAKE,
        ),
    });
  },

  /**
   * Advance the shared ordinary-work release fence for one evaluation
   * that observed no priority spread blocker, then resolve the
   * stabilizing defer decision for non-priority entities. Priority
   * partitions never defer on the shared fence, but they DO advance it
   * here: their evaluations are already event-driven (the
   * priority-recovery visibility cache and node-edge listeners
   * re-enqueue them on placement-eligibility and operation-terminal
   * edges), so they observe the clear that starts the stability window
   * and resolve the stable release that wakes parked ordinary entities.
   * The window law itself is unchanged — release still requires the full
   * continuous-clear interval, and any blocked or in-flight observation
   * still rearms it.
   * @param {boolean} priorityPartition
   * @return {Object|null}
   * @private
   */
  resolveClearedPrioritySpreadFenceDecision(priorityPartition) {
    const observedAt = this.nowFn();
    let globalTopologyBlockingOperationCount = 0;
    let latestTopologyDrain = null;
    if (isBackgroundPrioritySpreadReleaseActive({
      readinessOwner: this.controlPlaneReadinessService,
    })) {
      const globalTopologyBlockingOperations =
        this.getGlobalTopologyBlockingInFlightOperations().filter(
          (operation) => this.isTopologySettlingInFlightOperation(
            operation,
            {nowMs: observedAt},
          ),
        );
      globalTopologyBlockingOperationCount =
        globalTopologyBlockingOperations.length;
      if (globalTopologyBlockingOperationCount > 0) {
        observeActiveBackgroundPrioritySpreadReleaseBlocked({
          readinessOwner: this.controlPlaneReadinessService,
          observedAt,
        });
      } else {
        latestTopologyDrain =
          this.getLatestGlobalTopologyShapingOperationDrain({observedAt});
        observeActiveBackgroundPrioritySpreadOperationDrain({
          readinessOwner: this.controlPlaneReadinessService,
          drainedAt: latestTopologyDrain?.drainedAtMs,
        });
      }
    }
    const stableReleaseBlocker =
      resolveBackgroundPrioritySpreadStableRelease({
        readinessOwner: this.controlPlaneReadinessService,
        observedAt,
        requiredStableMs:
          this.getBackgroundPrioritySpreadStableWindowMs(),
      });
    if (priorityPartition || !stableReleaseBlocker) {
      return REBALANCE_PLANNING_GATE_NOT_APPLICABLE;
    }
    this.registerBackgroundPrioritySpreadStableReleaseWake();
    const scheduleDelayMs =
      this.getBackgroundPrioritySpreadStableReleaseDelayMs(
        stableReleaseBlocker.stableRemainingMs,
      );
    return this.buildRebalancePlanningGateDecision({
      gate: REBALANCE_PLANNING_GATE.CONTROL_PLANE_PRIORITY_SPREAD,
      blocker: stableReleaseBlocker,
      logMessage:
        REBALANCER_LOG_MSG.WAIT_CONTROL_PLANE_PRIORITY_STABILITY,
      logContext: {
        entityType: this.entityType,
        delayMs: scheduleDelayMs,
        releaseState: stableReleaseBlocker.state,
        requiredStableMs: stableReleaseBlocker.requiredStableMs,
        stableElapsedMs: stableReleaseBlocker.stableElapsedMs,
        stableRemainingMs: stableReleaseBlocker.stableRemainingMs,
        clearObservedAtMs: stableReleaseBlocker.clearObservedAtMs,
        lastBlockedObservedAtMs:
          stableReleaseBlocker.lastBlockedObservedAtMs,
        globalTopologyBlockingOperationCount,
        latestTopologyDrainAtMs:
          latestTopologyDrain?.drainedAtMs || null,
        latestTopologyDrainOperationId:
          latestTopologyDrain?.operationId || null,
      },
      scheduleDelayMs,
    });
  },

  resolvePrioritySpreadPlanningGateDecision(evaluationContext = null) {
    const priorityPartition = this.isControlPlanePriorityPartition();
    const controlPlanePriorityBlocker =
      this.getControlPlanePrioritySpreadBlocker();
    if (!controlPlanePriorityBlocker) {
      return this.resolveClearedPrioritySpreadFenceDecision(
        priorityPartition,
      );
    }
    observeBackgroundPrioritySpreadBlocked({
      readinessOwner: this.controlPlaneReadinessService,
      observedAt: this.nowFn(),
    });
    if (priorityPartition) {
      return REBALANCE_PLANNING_GATE_NOT_APPLICABLE;
    }
    const blockedPartitions =
      controlPlanePriorityBlocker.blockedPartitions || [];
    const currentPriorityPartitionStillBlocked =
      this.isControlPlanePriorityPartition() &&
      blockedPartitions.some(
        (partition) => partition?.partitionId === this.entityId,
      );
    const operationCreationGate =
      this.resolvePriorityRecoveryOperationCreationPlanningGateForEvaluation(
        evaluationContext,
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
    this.registerBackgroundPrioritySpreadStableReleaseWake();
    const scheduleDelayMs =
      this.getBackgroundPrioritySpreadReleaseDelayMs();
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
        blockedPartitions: blockedPartitions.map(
          buildBlockedPartitionLogContext,
        ),
      },
      scheduleDelayMs,
    });
  },

  isPriorityRecoveryOperationCreationRequiredForPlanningGate(
    partitionId,
    options = {},
  ) {
    const normalizedPartitionId = String(
      partitionId || UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    ).trim();
    if (normalizedPartitionId.length === 0) {
      return false;
    }
    // A concentrated operation-ledger quorum requires its cure move to be
    // planned NOW: the admission-side quorum-spread hold defers every
    // dependent move while concentration persists, which can itself sustain
    // the readiness states this planning gate defers on — without this
    // evidence the cure is never planned and the hold never releases
    // (quest formation-ledger-quorum-spread-first, verifier-traced wedge).
    // The coordinator owns the placement actuals; the planner only asks.
    if (
      this.rebalanceCoordinator
        ?.getOperationLedgerQuorumConcentrationForPartition?.(
          normalizedPartitionId,
        ) !== null
    ) {
      return true;
    }
    const publishedPlanningSnapshot =
      options?.planningSnapshot ||
      this.getPriorityRecoveryPlanningSnapshotSync(
        {partitionId: normalizedPartitionId},
      );
    const planningSnapshot =
      typeof this.buildCurrentPriorityRecoveryPlanningSnapshot ===
        'function' ?
        this.buildCurrentPriorityRecoveryPlanningSnapshot(
          publishedPlanningSnapshot,
        ) :
        publishedPlanningSnapshot;
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

  buildLedgerConcentrationOperationCreationPlanningGate(partitionId) {
    const readConcentration = this.rebalanceCoordinator
      ?.getOperationLedgerQuorumConcentrationForPartition;
    if (typeof readConcentration !== 'function') {
      return null;
    }
    const ledgerConcentration = readConcentration.call(
      this.rebalanceCoordinator,
      partitionId,
    );
    if (!ledgerConcentration) {
      return null;
    }
    const noReadyNodePlanningCapability =
      buildLedgerSurplusDrainPlanningCapability(ledgerConcentration);
    if (!noReadyNodePlanningCapability) {
      return null;
    }
    return Object.freeze({
      operationCreationRequired: true,
      operationCreationPartitionId: partitionId,
      operationCreationScope:
        PRIORITY_RECOVERY_PLANNING_GATE_SCOPE.CURRENT_PARTITION,
      noReadyNodePlanningCapability,
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
    const ledgerConcentrationGate =
      this.buildLedgerConcentrationOperationCreationPlanningGate(
        normalizedPartitionId,
      );
    if (ledgerConcentrationGate) {
      return ledgerConcentrationGate;
    }
    const publishedPlanningSnapshot =
      this.getPriorityRecoveryPlanningSnapshotSync(
        {partitionId: normalizedPartitionId},
      );
    const planningSnapshot =
      this.buildCurrentPriorityRecoveryPlanningSnapshot(
        publishedPlanningSnapshot,
      );
    if (!planningSnapshot || typeof planningSnapshot !== 'object') {
      return null;
    }

    const currentOperationCreationRequired =
      this.isPriorityRecoveryOperationCreationRequiredForPlanningGate(
        normalizedPartitionId,
        {planningSnapshot},
      );
    if (currentOperationCreationRequired) {
      return Object.freeze({
        operationCreationRequired: true,
        operationCreationPartitionId: normalizedPartitionId,
        operationCreationScope:
          PRIORITY_RECOVERY_PLANNING_GATE_SCOPE.CURRENT_PARTITION,
        noReadyNodePlanningCapability: null,
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
        noReadyNodePlanningCapability: null,
      });
    }

    return Object.freeze({
      operationCreationRequired: true,
      operationCreationPartitionId:
        this.resolvePriorityRecoveryFollowUpPartitionId(surrogateDecision),
      operationCreationScope:
        PRIORITY_RECOVERY_PLANNING_GATE_SCOPE.SURROGATE_PARTITION,
      noReadyNodePlanningCapability: null,
    });
  },

  /**
   * Return one normalized bypass snapshot for planning gates that would
   * otherwise strand the startup priority recovery operation-creation lane.
   *
   * @return {Object}
   * @private
   */
  createRebalancePlanningGateEvaluationContext() {
    let operationCreationGateResolved = false;
    let operationCreationGate = null;
    return Object.freeze({
      resolvePriorityRecoveryOperationCreationGate: () => {
        if (!operationCreationGateResolved) {
          operationCreationGate =
            this.buildPriorityRecoveryOperationCreationPlanningGateSnapshot(
              this.entityId,
            );
          operationCreationGateResolved = true;
        }
        return operationCreationGate;
      },
    });
  },

  resolvePriorityRecoveryOperationCreationPlanningGateForEvaluation(
    evaluationContext = null,
  ) {
    if (
      evaluationContext &&
      typeof evaluationContext
        .resolvePriorityRecoveryOperationCreationGate === 'function'
    ) {
      return evaluationContext.resolvePriorityRecoveryOperationCreationGate();
    }
    return this.buildPriorityRecoveryOperationCreationPlanningGateSnapshot(
      this.entityId,
    );
  },

  buildPriorityRecoveryPlanningGateBypassSnapshot(
    evaluationContext = null,
  ) {
    const isPriorityPartition = this.isControlPlanePriorityPartition();
    const operationCreationGate = isPriorityPartition ?
      this.resolvePriorityRecoveryOperationCreationPlanningGateForEvaluation(
        evaluationContext,
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
  recordPriorityRecoveryPlanningGateDecisionDiagnostic(
    decision,
    evaluationContext = null,
  ) {
    if (!this.isControlPlanePriorityPartition()) {
      return null;
    }
    let bypass = null;
    let syncPlanningSnapshotAvailable = false;
    try {
      bypass = this.buildPriorityRecoveryPlanningGateBypassSnapshot(
        evaluationContext,
      );
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
