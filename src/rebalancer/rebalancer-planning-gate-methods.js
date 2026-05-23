import {UNIFIED_REBALANCER_SHARED} from './unified-rebalancer-shared.js';
import {
  LOCAL_MUTATION_READINESS_OPERATION_CREATION_FIELD,
  LOCAL_MUTATION_READINESS_PLANNING_ACTION,
  LOCAL_MUTATION_READINESS_PLANNING_ACTION_BY_STATE,
  LOCAL_MUTATION_READINESS_PLANNING_STATE,
  LOCAL_MUTATION_READINESS_PLANNING_STATE_TABLE,
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
  REBALANCE_PLANNING_GATE_ACTION,
  REBALANCE_PLANNING_GATE_DECISION,
  REBALANCE_PLANNING_GATE_DELAY_MULTIPLIER,
  REBALANCE_PLANNING_GATE_LOG_LEVEL,
  REBALANCE_PLANNING_GATE_SCHEDULE_MODE,
  TOPOLOGY_SETTLING_PLANNING_ACTION,
  TOPOLOGY_SETTLING_PLANNING_ACTION_BY_STATE,
  TOPOLOGY_SETTLING_PLANNING_STATE,
  TOPOLOGY_SETTLING_PLANNING_STATE_TABLE,
} from './rebalancer-planning-gate-constants.js';

const {
  CONTROL_PLANE_PUBLICATION_STATUS,
  NUM,
  TriggerType,
  RECONCILE_REASON,
  REBALANCER_LOG_MSG,
  SYSTEM_TABLE_NAME,
  TYPEOF,
  UNIFIED_REBALANCER_LITERAL,
  getControlPlaneRetryAfterMs,
  isRetryableControlPlaneError,
} = UNIFIED_REBALANCER_SHARED;

const REBALANCER_PLANNING_GATE_METHODS = {
  scheduleNextCheck(overrideDelayMs = null) {
    if (!this.isLeader || this.isShuttingDown) {
      return;
    }

    this.cancelScheduledCheck();

    let delay = null;
    if (
      typeof overrideDelayMs === UNIFIED_REBALANCER_LITERAL.NUMBER &&
      Number.isFinite(overrideDelayMs) &&
      overrideDelayMs > UNIFIED_REBALANCER_LITERAL.ZERO
    ) {
      delay = Math.max(
        UNIFIED_REBALANCER_LITERAL.THOUSAND,
        Math.floor(overrideDelayMs),
      );
    } else {
      // Add jitter: ±25% of interval to spread load
      const jitter = this.periodicCheckJitterMs * (Math.random() - 0.5) * 2;
      delay = Math.max(
        UNIFIED_REBALANCER_LITERAL.THOUSAND,
        this.currentInterval + jitter,
      );
    }

    this.scheduledCheck = setTimeout(() => {
      this.scheduledCheck = null;
      this.enqueueRebalanceCheck(RECONCILE_REASON.PERIODIC_CHECK);
    }, delay);

    this.logger.debug(REBALANCER_LOG_MSG.SCHEDULE_NEXT, {
      entityId: this.entityId,
      delayMs: Math.round(delay),
    });
  },

  /**
   * Cancel any scheduled check.
   */
  cancelScheduledCheck() {
    if (this.scheduledCheck) {
      clearTimeout(this.scheduledCheck);
      this.scheduledCheck = null;
    }
  },

  /**
   * Cancel any pending stabilization check.
   * Cancel any pending stabilization check.
   */
  cancelStabilizationTimer() {
    if (this.stabilizationTimer) {
      clearTimeout(this.stabilizationTimer);
      this.stabilizationTimer = null;
    }
  },

  /**
   * Enqueue one typed rebalance reconcile through the owner queue.
   * Timers and live events must share this ingress so progression remains
   * single-flight per entity.
   *
   * @param {string} reason
   * @private
   */
  enqueueRebalanceCheck(reason = RECONCILE_REASON.PERIODIC_CHECK) {
    if (!this.isLeader || this.isShuttingDown) {
      return false;
    }
    return this.rebalanceCheckQueue.enqueue(this.entityId, reason);
  },

  /**
   * Increase the periodic check interval without exceeding the configured cap.
   * @param {number} multiplier
   * @return {number}
   * @private
   */
  increaseCurrentInterval(multiplier) {
    this.currentInterval = Math.min(
      this.currentInterval * multiplier,
      this.maxInterval,
    );
    return this.currentInterval;
  },

  /**
   * Resolve the logged follow-up delay for gates that use the priority-aware
   * scheduler.
   * @param {number} scheduleDelayMs
   * @return {number}
   * @private
   */
  getPriorityAwareDelayMs(scheduleDelayMs) {
    if (this.isControlPlanePriorityPartition()) {
      return this.getPriorityRetryDelayMs();
    }
    return scheduleDelayMs;
  },

  /**
   * Retryable control-plane failures must preserve this entity's reconcile
   * cadence. Priority recovery stays on the short loop, while ordinary
   * entities back off only as far as the transient failure requests.
   * @param {*} error
   * @return {number}
   * @private
   */
  getRetryableFailureRetryDelayMs(error) {
    const retryAfterMs = getControlPlaneRetryAfterMs(error);
    if (this.isControlPlanePriorityPartition()) {
      return Math.max(
        this.getPriorityRetryDelayMs(),
        Number.isFinite(retryAfterMs) &&
          retryAfterMs > UNIFIED_REBALANCER_LITERAL.ZERO ?
          Math.floor(retryAfterMs) :
          UNIFIED_REBALANCER_LITERAL.ZERO,
      );
    }
    if (
      Number.isFinite(retryAfterMs) &&
      retryAfterMs > UNIFIED_REBALANCER_LITERAL.ZERO
    ) {
      return Math.max(
        UNIFIED_REBALANCER_LITERAL.THOUSAND,
        Math.floor(retryAfterMs),
      );
    }
    return this.increaseCurrentInterval(
      UNIFIED_REBALANCER_LITERAL.ONE_POINT_FIVE,
    );
  },

  /**
   * Keep periodic reconciliation alive after retryable control-plane failures
   * so one transient scheduling/persist error cannot strand recovery until an
   * unrelated CDC event arrives.
   * @param {*} error
   * @return {boolean}
   * @private
   */
  handleRetryableCheckRebalanceFailure(error) {
    if (!isRetryableControlPlaneError(error)) {
      return false;
    }
    if (this.isShuttingDown) {
      return true;
    }
    this.scheduleNextCheck(this.getRetryableFailureRetryDelayMs(error));
    return true;
  },

  buildRebalancePlanningGateDecision({
    gate,
    blocker = null,
    logLevel = REBALANCE_PLANNING_GATE_LOG_LEVEL.INFO,
    logMessage,
    logContext = {},
    scheduleMode = REBALANCE_PLANNING_GATE_SCHEDULE_MODE.NEXT,
    scheduleDelayMs = null,
  } = {}) {
    const normalizedScheduleDelayMs =
      Number.isFinite(scheduleDelayMs) &&
      scheduleDelayMs > UNIFIED_REBALANCER_LITERAL.ZERO ?
        Math.floor(scheduleDelayMs) :
        null;
    return Object.freeze({
      decision: REBALANCE_PLANNING_GATE_DECISION.DEFER_PLANNING,
      nextAction: REBALANCE_PLANNING_GATE_ACTION.SCHEDULE_RETRY,
      gate,
      blocker,
      logLevel,
      logMessage,
      logContext: Object.freeze({...logContext}),
      scheduleMode,
      scheduleDelayMs: normalizedScheduleDelayMs,
    });
  },

  applyRebalancePlanningGateDecision(decision) {
    if (!decision) {
      return;
    }
    const logMethod =
      decision.logLevel === REBALANCE_PLANNING_GATE_LOG_LEVEL.DEBUG ?
        this.logger.debug :
        this.logger.info;
    logMethod.call(this.logger, decision.logMessage, {
      entityId: this.entityId,
      ...decision.logContext,
    });
    if (
      decision.scheduleMode ===
      REBALANCE_PLANNING_GATE_SCHEDULE_MODE.PRIORITY_AWARE
    ) {
      this.schedulePriorityAwareCheck(decision.scheduleDelayMs);
      return;
    }
    this.scheduleNextCheck(decision.scheduleDelayMs);
  },

  /**
   * Evaluate cluster readiness gating before the first planning pass.
   * Returns one explicit planning-gate decision when rebalance planning must
   * wait.
   * @return {Object|null}
   * @private
   */
  evaluateClusterReadinessGateDecision() {
    if (this.clusterReadinessConfirmed) {
      return null;
    }

    const now = Date.now();
    if (this.clusterReadinessStartMs === null) {
      this.clusterReadinessStartMs = now;
    }

    const result = this.clusterReadinessSignal.evaluate({
      partitionServices: this.partitionServices || new Map(),
      messageGroupServices: this.messageGroupServices || new Map(),
      cdcSubscriptionsActive: true,
      requirePropagationLeader: this.requirePropagationLeader !== false,
    });

    if (result.ready) {
      this.clusterReadinessConfirmed = true;
      this.clusterReadinessState = 'evidence_confirmed';
      this.logger.info(REBALANCER_LOG_MSG.CLUSTER_READINESS_CONFIRMED, {
        entityId: this.entityId,
      });
      return null;
    }

    const elapsed = now - this.clusterReadinessStartMs;
    if (elapsed >= this.clusterReadinessTimeoutMs) {
      this.clusterReadinessConfirmed = true;
      this.clusterReadinessState = 'degraded_timeout';
      this.logger.warn(REBALANCER_LOG_MSG.CLUSTER_READINESS_TIMEOUT, {
        entityId: this.entityId,
        elapsedMs: elapsed,
        unmetConditions: result.unmetConditions,
      });
      return null;
    }

    const priorityRecoveryGateBypass =
      this.buildPriorityRecoveryPlanningGateBypassSnapshot();
    if (priorityRecoveryGateBypass.shouldBypass === true) {
      return null;
    }

    return this.buildRebalancePlanningGateDecision({
      gate: REBALANCE_PLANNING_GATE.CLUSTER_READINESS,
      blocker: result,
      logMessage: REBALANCER_LOG_MSG.CLUSTER_NOT_READY,
      logContext: {
        unmetConditions: result.unmetConditions,
      },
      scheduleMode: REBALANCE_PLANNING_GATE_SCHEDULE_MODE.PRIORITY_AWARE,
    });
  },

  /**
   * Evaluate startup and readiness gates before running one rebalance pass.
   * Returns one explicit planning-gate decision when planning must wait.
   * @return {Promise<Object|null>}
   * @private
   */
  resolveStartDelayPlanningGateDecision() {
    const timeUntilRebalanceEligibleMs =
      this.getTimeUntilRebalanceStartEligible();
    if (timeUntilRebalanceEligibleMs <= UNIFIED_REBALANCER_LITERAL.ZERO) {
      return null;
    }
    const priorityRecoveryGateBypass =
      this.buildPriorityRecoveryPlanningGateBypassSnapshot();
    if (priorityRecoveryGateBypass.shouldBypass === true) {
      return null;
    }
    return this.buildRebalancePlanningGateDecision({
      gate: REBALANCE_PLANNING_GATE.START_DELAY,
      blocker: {
        remainingMs: timeUntilRebalanceEligibleMs,
      },
      logLevel: REBALANCE_PLANNING_GATE_LOG_LEVEL.DEBUG,
      logMessage: REBALANCER_LOG_MSG.WAIT_START_DELAY,
      logContext: {
        entityType: this.entityType,
        remainingMs: timeUntilRebalanceEligibleMs,
        isSystemPartition: this.isSystemPartitionEntity(),
      },
      scheduleDelayMs: timeUntilRebalanceEligibleMs,
    });
  },

  resolveStabilizationPlanningGateDecision() {
    if (this.isStabilized()) {
      return null;
    }
    const priorityRecoveryGateBypass =
      this.buildPriorityRecoveryPlanningGateBypassSnapshot();
    if (priorityRecoveryGateBypass.shouldBypass === true) {
      return null;
    }
    const timeUntilStabilized = this.getTimeUntilStabilized();
    return this.buildRebalancePlanningGateDecision({
      gate: REBALANCE_PLANNING_GATE.STABILIZATION,
      blocker: {
        timeUntilStabilized,
      },
      logLevel: REBALANCE_PLANNING_GATE_LOG_LEVEL.DEBUG,
      logMessage: REBALANCER_LOG_MSG.WAIT_STABILIZATION,
      logContext: {
        timeUntilStabilized,
      },
      scheduleMode: REBALANCE_PLANNING_GATE_SCHEDULE_MODE.PRIORITY_AWARE,
    });
  },

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
    if (operationCreationPartitionId.length === NUM.ZERO) {
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
   * Normalize topology-settling evidence before deciding whether priority
   * recovery operation creation may continue planning.
   * @param {Object|null} topologySettlingBlocker
   * @return {Object}
   * @private
   */
  buildTopologySettlingPlanningGateSnapshot(topologySettlingBlocker) {
    const priorityRecoveryGateBypass =
      this.buildPriorityRecoveryPlanningGateBypassSnapshot();
    const priorityRecoveryOperationCreationRequired =
      priorityRecoveryGateBypass.operationCreationGate
        ?.operationCreationRequired === true;
    const topologySettlingBlockedByOperationCreationTarget =
      this.hasTopologySettlingBlockerForOperationCreationTarget(
        topologySettlingBlocker,
        priorityRecoveryGateBypass.operationCreationGate,
      );
    const evidence = Object.freeze({
      blocked: !!topologySettlingBlocker,
      priorityRecoveryOperationCreationRequired,
      topologySettlingBlockedByOperationCreationTarget,
    });
    const planningState =
      TOPOLOGY_SETTLING_PLANNING_STATE_TABLE.find((entry) =>
        entry.matches(evidence),
      )?.state ||
      TOPOLOGY_SETTLING_PLANNING_STATE.TOPOLOGY_SETTLING_BLOCKED;
    const planningAction =
      TOPOLOGY_SETTLING_PLANNING_ACTION_BY_STATE[planningState] ||
      TOPOLOGY_SETTLING_PLANNING_ACTION.DEFER_PLANNING;
    return Object.freeze({
      topologySettlingBlocker,
      priorityRecoveryOperationCreationRequired,
      evidence,
      planningState,
      planningAction,
      shouldDefer:
        planningAction === TOPOLOGY_SETTLING_PLANNING_ACTION.DEFER_PLANNING,
    });
  },

  async resolveTopologySettlingPlanningGateDecision() {
    const topologySettlingBlocker =
      await this.revalidateCriticalSystemTopologySettlingBlocker(
        this.getCriticalSystemTopologySettlingBlocker(),
      );
    if (!topologySettlingBlocker) {
      return null;
    }
    const gateSnapshot =
      this.buildTopologySettlingPlanningGateSnapshot(
        topologySettlingBlocker,
      );
    if (gateSnapshot.shouldDefer !== true) {
      return null;
    }
    const scheduleDelayMs = this.increaseCurrentInterval(
      REBALANCE_PLANNING_GATE_DELAY_MULTIPLIER.WAIT,
    );
    const delayMs = this.getPriorityAwareDelayMs(scheduleDelayMs);
    return this.buildRebalancePlanningGateDecision({
      gate: REBALANCE_PLANNING_GATE.TOPOLOGY_SETTLING,
      blocker: topologySettlingBlocker,
      logMessage: REBALANCER_LOG_MSG.WAIT_TOPOLOGY_SETTLING,
      logContext: {
        entityType: this.entityType,
        delayMs,
        planningState: gateSnapshot.planningState,
        priorityRecoveryOperationCreationRequired:
          gateSnapshot.priorityRecoveryOperationCreationRequired,
        topologySettlingBlockedByOperationCreationTarget:
          gateSnapshot.evidence.topologySettlingBlockedByOperationCreationTarget,
        blockerReason: topologySettlingBlocker.reason || null,
        connectedNodeId:
          typeof topologySettlingBlocker.connectedNodeId === TYPEOF.STRING &&
          topologySettlingBlocker.connectedNodeId.length > NUM.ZERO ?
            topologySettlingBlocker.connectedNodeId :
            null,
        unreadyNodeIds: Array.isArray(topologySettlingBlocker.unreadyNodeIds) ?
          [...topologySettlingBlocker.unreadyNodeIds] :
          [],
        missingNodeEndpointNodeIds: Array.isArray(
          topologySettlingBlocker.missingNodeEndpointNodeIds,
        ) ?
          [...topologySettlingBlocker.missingNodeEndpointNodeIds] :
          [],
        missingPostgresWireNodeIds: Array.isArray(
          topologySettlingBlocker.missingPostgresWireNodeIds,
        ) ?
          [...topologySettlingBlocker.missingPostgresWireNodeIds] :
          [],
        endpointReadyNodeCount: Number.isFinite(
          topologySettlingBlocker.endpointReadyNodeCount,
        ) ?
          topologySettlingBlocker.endpointReadyNodeCount :
          null,
        requiredReadyNodeCount: Number.isFinite(
          topologySettlingBlocker.requiredReadyNodeCount,
        ) ?
          topologySettlingBlocker.requiredReadyNodeCount :
          null,
        inFlightReplicaOperations: Number.isFinite(
          topologySettlingBlocker.inFlightReplicaOperations,
        ) ?
          topologySettlingBlocker.inFlightReplicaOperations :
          null,
        inFlightReplicaOperationsSource:
          topologySettlingBlocker.inFlightReplicaOperationsSource || null,
      },
      scheduleMode: REBALANCE_PLANNING_GATE_SCHEDULE_MODE.PRIORITY_AWARE,
      scheduleDelayMs,
    });
  },

  resolveTrafficReadinessPlanningGateDecision() {
    const trafficReadinessBlocker =
      this.getCriticalSystemTrafficReadinessBlocker();
    if (!trafficReadinessBlocker) {
      return null;
    }
    const priorityRecoveryGateBypass =
      this.buildPriorityRecoveryPlanningGateBypassSnapshot();
    if (priorityRecoveryGateBypass.shouldBypass === true) {
      return null;
    }
    const scheduleDelayMs = this.increaseCurrentInterval(
      REBALANCE_PLANNING_GATE_DELAY_MULTIPLIER.WAIT,
    );
    const delayMs = this.getPriorityAwareDelayMs(scheduleDelayMs);
    return this.buildRebalancePlanningGateDecision({
      gate: REBALANCE_PLANNING_GATE.TRAFFIC_READINESS,
      blocker: trafficReadinessBlocker,
      logMessage: REBALANCER_LOG_MSG.WAIT_TRAFFIC_READY,
      logContext: {
        entityType: this.entityType,
        nodeId: this.nodeId,
        delayMs,
        readinessPhase: trafficReadinessBlocker.phase || null,
        readinessReady: trafficReadinessBlocker.ready === true,
        reasonCodes: Array.isArray(trafficReadinessBlocker.reasons) ?
          [...trafficReadinessBlocker.reasons] :
          [],
        stableElapsedMs: Number.isFinite(trafficReadinessBlocker.stableElapsedMs) ?
          trafficReadinessBlocker.stableElapsedMs :
          null,
        stableWindowMs: Number.isFinite(trafficReadinessBlocker.stableWindowMs) ?
          trafficReadinessBlocker.stableWindowMs :
          null,
      },
      scheduleMode: REBALANCE_PLANNING_GATE_SCHEDULE_MODE.PRIORITY_AWARE,
      scheduleDelayMs,
    });
  },

  resolveLocalServePlanningGateDecision() {
    const localServeReadinessBlocker =
      this.getCriticalSystemLocalServeReadinessBlocker();
    if (!localServeReadinessBlocker) {
      return null;
    }
    const priorityRecoveryGateBypass =
      this.buildPriorityRecoveryPlanningGateBypassSnapshot();
    if (priorityRecoveryGateBypass.shouldBypass === true) {
      return null;
    }
    const scheduleDelayMs = this.increaseCurrentInterval(
      REBALANCE_PLANNING_GATE_DELAY_MULTIPLIER.WAIT,
    );
    const delayMs = this.getPriorityAwareDelayMs(scheduleDelayMs);
    return this.buildRebalancePlanningGateDecision({
      gate: REBALANCE_PLANNING_GATE.LOCAL_SERVE_READINESS,
      blocker: localServeReadinessBlocker,
      logMessage: REBALANCER_LOG_MSG.WAIT_LOCAL_SERVE_READINESS,
      logContext: {
        entityType: this.entityType,
        nodeId: this.nodeId,
        delayMs,
        reasonCodes: Array.isArray(localServeReadinessBlocker.reasons) ?
          localServeReadinessBlocker.reasons
            .map((reason) =>
              String(
                reason?.code || UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
              ),
            )
            .filter(Boolean) :
          [],
      },
      scheduleMode: REBALANCE_PLANNING_GATE_SCHEDULE_MODE.PRIORITY_AWARE,
      scheduleDelayMs,
    });
  },

  /**
   * @return {Object}
   * @private
   */
  buildLocalMutationReadinessPlanningGateSnapshot() {
    const localMutationReadinessBlocker =
      this.getLocalControlPlaneMutationReadinessBlocker();
    const isPriorityPartition = this.isControlPlanePriorityPartition();
    const operationCreationGate = isPriorityPartition ?
      this.buildPriorityRecoveryOperationCreationPlanningGateSnapshot(
        this.entityId,
      ) :
      null;
    const priorityRecoveryOperationCreationRequired =
      operationCreationGate?.operationCreationRequired === true;
    const evidence = Object.freeze({
      blocked: !!localMutationReadinessBlocker,
      priorityRecoveryOperationCreationRequired,
    });
    const planningState =
      LOCAL_MUTATION_READINESS_PLANNING_STATE_TABLE.find((entry) =>
        entry.matches(evidence),
      )?.state ||
      LOCAL_MUTATION_READINESS_PLANNING_STATE.LOCAL_MUTATION_BLOCKED;
    const planningAction =
      LOCAL_MUTATION_READINESS_PLANNING_ACTION_BY_STATE[planningState] ||
      LOCAL_MUTATION_READINESS_PLANNING_ACTION.DEFER_PLANNING;
    return Object.freeze({
      localMutationReadinessBlocker,
      isPriorityPartition,
      priorityRecoveryOperationCreationRequired,
      priorityRecoveryOperationCreationPartitionId:
        operationCreationGate?.operationCreationPartitionId ||
        LOCAL_MUTATION_READINESS_OPERATION_CREATION_FIELD.PARTITION_ID_NOT_APPLICABLE,
      priorityRecoveryOperationCreationScope:
        operationCreationGate?.operationCreationScope ||
        LOCAL_MUTATION_READINESS_OPERATION_CREATION_FIELD.SCOPE_NOT_APPLICABLE,
      evidence,
      planningState,
      planningAction,
      shouldDefer:
        planningAction ===
        LOCAL_MUTATION_READINESS_PLANNING_ACTION.DEFER_PLANNING,
    });
  },

  resolveLocalMutationPlanningGateDecision() {
    const gateSnapshot =
      this.buildLocalMutationReadinessPlanningGateSnapshot();
    const localMutationReadinessBlocker =
      gateSnapshot.localMutationReadinessBlocker;
    if (gateSnapshot.shouldDefer !== true) {
      return null;
    }
    const scheduleDelayMs = this.increaseCurrentInterval(
      REBALANCE_PLANNING_GATE_DELAY_MULTIPLIER.WAIT,
    );
    const delayMs = this.getPriorityAwareDelayMs(scheduleDelayMs);
    return this.buildRebalancePlanningGateDecision({
      gate: REBALANCE_PLANNING_GATE.LOCAL_MUTATION_READINESS,
      blocker: localMutationReadinessBlocker,
      logMessage: REBALANCER_LOG_MSG.WAIT_LOCAL_MUTATION_READINESS,
      logContext: {
        entityType: this.entityType,
        nodeId: this.nodeId,
        delayMs,
        failedDimensions: Array.isArray(
          localMutationReadinessBlocker.failedDimensions,
        ) ?
          [...localMutationReadinessBlocker.failedDimensions] :
          [],
        reasonCodes: Array.isArray(localMutationReadinessBlocker.reasonCodes) ?
          [...localMutationReadinessBlocker.reasonCodes] :
          [],
        planningState: gateSnapshot.planningState,
        priorityRecoveryOperationCreationRequired:
          gateSnapshot.priorityRecoveryOperationCreationRequired,
        priorityRecoveryOperationCreationPartitionId:
          gateSnapshot.priorityRecoveryOperationCreationPartitionId,
        priorityRecoveryOperationCreationScope:
          gateSnapshot.priorityRecoveryOperationCreationScope,
      },
      scheduleMode: REBALANCE_PLANNING_GATE_SCHEDULE_MODE.PRIORITY_AWARE,
      scheduleDelayMs,
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
        Math.max(largestGap, Number(partition?.spreadGap) || NUM.ZERO),
      NUM.ZERO,
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
        })),
      },
      scheduleDelayMs,
    });
  },

  isPriorityRecoveryOperationCreationRequiredForPlanningGate(partitionId) {
    const normalizedPartitionId = String(
      partitionId || UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    ).trim();
    if (normalizedPartitionId.length === NUM.ZERO) {
      return false;
    }
    const planningSnapshot = this.getPriorityRecoveryPlanningSnapshotSync(
      {partitionId: normalizedPartitionId},
    );
    if (!planningSnapshot || typeof planningSnapshot !== TYPEOF.OBJECT) {
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
      event?.data && typeof event.data === TYPEOF.OBJECT ? event.data : {};
    const publicationStatus = String(
      publicationRow[PRIORITY_RECOVERY_PUBLICATION_EVENT_FIELD.STATUS] ||
        UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    ).toUpperCase();
    const priorityPartition = this.isControlPlanePriorityPartition() === true;
    const operationCreationGate = priorityPartition ?
      this.buildPriorityRecoveryOperationCreationPlanningGateSnapshot(
        this.entityId,
      ) :
      null;
    const evidence = Object.freeze({
      priorityPartition,
      publicationEvent:
        event?.tableName === SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS,
      leaderSatisfied:
        options?.requireLeader === false || this.isLeader === true,
      publicationClosed:
        publicationStatus === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
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
      normalizedPartitionId.length === NUM.ZERO ||
      !this.isControlPlanePriorityPartition()
    ) {
      return null;
    }
    const planningSnapshot = this.getPriorityRecoveryPlanningSnapshotSync(
      {partitionId: normalizedPartitionId},
    );
    if (!planningSnapshot || typeof planningSnapshot !== TYPEOF.OBJECT) {
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

  async collectRebalancePlanningGateDecisions() {
    return [
      this.evaluateClusterReadinessGateDecision(),
      this.resolveStartDelayPlanningGateDecision(),
      this.resolveStabilizationPlanningGateDecision(),
      await this.resolveTopologySettlingPlanningGateDecision(),
      this.resolveTrafficReadinessPlanningGateDecision(),
      this.resolveLocalServePlanningGateDecision(),
      this.resolveLocalMutationPlanningGateDecision(),
      this.resolvePrioritySpreadPlanningGateDecision(),
      this.resolveTransportBackpressurePlanningGateDecision(),
    ].filter(Boolean);
  },

  async resolveCheckRebalanceGateDecision() {
    const planningGateDecisions =
      await this.collectRebalancePlanningGateDecisions();
    return planningGateDecisions.length > NUM.ZERO ?
      planningGateDecisions[NUM.ZERO] :
      null;
  },

  /**
   * Preserve the blocker facade while exposing one explicit
   * planning-gate decision for the touched rebalancer seam.
   * @return {Promise<{apply: Function, decision: Object}|null>}
   * @private
   */
  async getCheckRebalanceBlocker() {
    const decision = await this.resolveCheckRebalanceGateDecision();
    if (!decision) {
      return null;
    }
    return {
      decision,
      apply: () => {
        this.applyRebalancePlanningGateDecision(decision);
      },
    };
  },

  /**
   * Update rebalance cadence after one evaluation/execution pass.
   * @param {boolean} needsRebalance
   * @return {Promise<boolean>} Whether to force a priority retry cadence.
   * @private
   */
  async advanceCheckCadence(needsRebalance) {
    let forcePriorityRetry = false;

    if (needsRebalance) {
      const rebalanceResult = await this.rebalance(TriggerType.PERIODIC);
      const executedMoveCount = this.countExecutedMoves(rebalanceResult);

      if (executedMoveCount > UNIFIED_REBALANCER_LITERAL.ZERO) {
        this.currentInterval = this.isControlPlanePriorityPartition() ?
          this.getPriorityRetryDelayMs() :
          this.periodicCheckIntervalMs;
      } else if (this.isControlPlanePriorityPartition()) {
        this.currentInterval = this.getPriorityRetryDelayMs();
        forcePriorityRetry = true;
      } else {
        this.increaseCurrentInterval(UNIFIED_REBALANCER_LITERAL.ONE_POINT_FIVE);
      }

      return forcePriorityRetry;
    }

    if (this.isControlPlanePriorityPartition()) {
      this.currentInterval = this.getPriorityRetryDelayMs();
    } else {
      this.increaseCurrentInterval(UNIFIED_REBALANCER_LITERAL.ONE_POINT_FIVE);
    }
    return forcePriorityRetry;
  },

  /**
   * Perform a rebalance check.
   * Requirements: 2.2, 2.3, 2.4
   * @return {Promise<void>}
   * @return {Promise<void>}
   */
  async checkRebalance() {
    if (!this.isLeader || this.isShuttingDown) {
      return;
    }

    let forcePriorityRetry = false;
    try {
      const blocker = await this.getCheckRebalanceBlocker();
      if (blocker) {
        blocker.apply();
        return;
      }

      // Re-evaluate state after stabilization (Requirement 2.4)
      const needsRebalance = await this.evaluateState();
      forcePriorityRetry = await this.advanceCheckCadence(needsRebalance);
    } catch (error) {
      this.logger.error(REBALANCER_LOG_MSG.REBALANCE_ERROR, {
        entityId: this.entityId,
        error: error.message,
      });
      if (this.handleRetryableCheckRebalanceFailure(error)) {
        return;
      }
      throw error;
    }

    // Schedule next check
    if (!this.isShuttingDown) {
      if (forcePriorityRetry) {
        this.scheduleNextCheck(this.getPriorityRetryDelayMs());
      } else {
        this.scheduleNextCheck();
      }
    }
  },
};

export {REBALANCER_PLANNING_GATE_METHODS};
