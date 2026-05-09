import {UNIFIED_REBALANCER_SHARED} from './unified-rebalancer-shared.js';
import {UnifiedRebalancerSegment4} from './unified-rebalancer-segment-4.js';

const {
  CONTROL_PLANE_WORKLOAD_CLASS,
  EntityType,
  NUM,
  NodeStatus,
  PRESSURE_WORK_CLASS,
  PressureGovernor,
  REBALANCER_EVENT,
  REBALANCER_LOG_MSG,
  REBALANCER_RUNTIME_REASON,
  RECONCILE_REASON,
  ReplicaStatus,
  STABILIZATION_RESET_TRIGGER,
  TYPEOF,
  TriggerType,
  UNIFIED_REBALANCER_LITERAL,
  buildControlPlaneWorkloadProfile,
  getControlPlaneRetryAfterMs,
  isRetryableControlPlaneError,
} = UNIFIED_REBALANCER_SHARED;

const REBALANCE_PLANNING_GATE = Object.freeze({
  CLUSTER_READINESS: 'cluster_readiness',
  START_DELAY: 'start_delay',
  STABILIZATION: 'stabilization',
  TOPOLOGY_SETTLING: 'topology_settling',
  TRAFFIC_READINESS: 'traffic_readiness',
  LOCAL_SERVE_READINESS: 'local_serve_readiness',
  LOCAL_MUTATION_READINESS: 'local_mutation_readiness',
  CONTROL_PLANE_PRIORITY_SPREAD: 'control_plane_priority_spread',
  TRANSPORT_BACKPRESSURE: 'transport_backpressure',
});

const REBALANCE_PLANNING_GATE_DECISION = Object.freeze({
  DEFER_PLANNING: 'defer_planning',
});

const REBALANCE_PLANNING_GATE_ACTION = Object.freeze({
  SCHEDULE_RETRY: 'schedule_retry',
});

const REBALANCE_PLANNING_GATE_LOG_LEVEL = Object.freeze({
  DEBUG: 'debug',
  INFO: 'info',
});

const REBALANCE_PLANNING_GATE_SCHEDULE_MODE = Object.freeze({
  NEXT: 'next',
  PRIORITY_AWARE: 'priority_aware',
});

const REBALANCE_PLANNING_GATE_DELAY_MULTIPLIER = Object.freeze({
  WAIT: 1.25,
  BACKPRESSURE: 1.5,
});

const TOPOLOGY_SETTLING_PLANNING_STATE = Object.freeze({
  CLEAR: 'clear',
  PRIORITY_RECOVERY_OPERATION_CREATION_REQUIRED:
    'priority_recovery_operation_creation_required',
  TOPOLOGY_OPERATION_TARGET_IN_FLIGHT:
    'topology_operation_target_in_flight',
  TOPOLOGY_SETTLING_BLOCKED: 'topology_settling_blocked',
});

const TOPOLOGY_SETTLING_PLANNING_ACTION = Object.freeze({
  ALLOW_PLANNING: 'allow_planning',
  DEFER_PLANNING: 'defer_planning',
});

const TOPOLOGY_SETTLING_PLANNING_STATE_TABLE = Object.freeze([
  Object.freeze({
    state: TOPOLOGY_SETTLING_PLANNING_STATE.CLEAR,
    matches: (evidence) => evidence.blocked !== true,
  }),
  Object.freeze({
    state:
      TOPOLOGY_SETTLING_PLANNING_STATE
        .TOPOLOGY_OPERATION_TARGET_IN_FLIGHT,
    matches: (evidence) =>
      evidence.topologySettlingBlockedByOperationCreationTarget === true,
  }),
  Object.freeze({
    state:
      TOPOLOGY_SETTLING_PLANNING_STATE
        .PRIORITY_RECOVERY_OPERATION_CREATION_REQUIRED,
    matches: (evidence) =>
      evidence.priorityRecoveryOperationCreationRequired === true,
  }),
  Object.freeze({
    state: TOPOLOGY_SETTLING_PLANNING_STATE.TOPOLOGY_SETTLING_BLOCKED,
    matches: () => true,
  }),
]);

const TOPOLOGY_SETTLING_PLANNING_ACTION_BY_STATE = Object.freeze({
  [TOPOLOGY_SETTLING_PLANNING_STATE.CLEAR]:
    TOPOLOGY_SETTLING_PLANNING_ACTION.ALLOW_PLANNING,
  [
  TOPOLOGY_SETTLING_PLANNING_STATE
    .PRIORITY_RECOVERY_OPERATION_CREATION_REQUIRED
  ]: TOPOLOGY_SETTLING_PLANNING_ACTION.ALLOW_PLANNING,
  [
  TOPOLOGY_SETTLING_PLANNING_STATE.TOPOLOGY_OPERATION_TARGET_IN_FLIGHT
  ]: TOPOLOGY_SETTLING_PLANNING_ACTION.DEFER_PLANNING,
  [TOPOLOGY_SETTLING_PLANNING_STATE.TOPOLOGY_SETTLING_BLOCKED]:
    TOPOLOGY_SETTLING_PLANNING_ACTION.DEFER_PLANNING,
});

const LOCAL_MUTATION_READINESS_PLANNING_STATE = Object.freeze({
  CLEAR: 'clear',
  PRIORITY_RECOVERY_OPERATION_CREATION_REQUIRED:
    'priority_recovery_operation_creation_required',
  LOCAL_MUTATION_BLOCKED: 'local_mutation_blocked',
});

const LOCAL_MUTATION_READINESS_PLANNING_ACTION = Object.freeze({
  ALLOW_PLANNING: 'allow_planning',
  DEFER_PLANNING: 'defer_planning',
});

const LOCAL_MUTATION_READINESS_OPERATION_CREATION_FIELD = Object.freeze({
  PARTITION_NOT_APPLICABLE: 'operation_creation_partition_not_applicable',
  SCOPE_NOT_APPLICABLE: 'operation_creation_scope_not_applicable',
});

const LOCAL_MUTATION_READINESS_PLANNING_STATE_TABLE = Object.freeze([
  Object.freeze({
    state: LOCAL_MUTATION_READINESS_PLANNING_STATE.CLEAR,
    matches: (evidence) => evidence.blocked !== true,
  }),
  Object.freeze({
    state:
      LOCAL_MUTATION_READINESS_PLANNING_STATE
        .PRIORITY_RECOVERY_OPERATION_CREATION_REQUIRED,
    matches: (evidence) =>
      evidence.priorityRecoveryOperationCreationRequired === true,
  }),
  Object.freeze({
    state: LOCAL_MUTATION_READINESS_PLANNING_STATE.LOCAL_MUTATION_BLOCKED,
    matches: () => true,
  }),
]);

const LOCAL_MUTATION_READINESS_PLANNING_ACTION_BY_STATE = Object.freeze({
  [LOCAL_MUTATION_READINESS_PLANNING_STATE.CLEAR]:
    LOCAL_MUTATION_READINESS_PLANNING_ACTION.ALLOW_PLANNING,
  [
  LOCAL_MUTATION_READINESS_PLANNING_STATE
    .PRIORITY_RECOVERY_OPERATION_CREATION_REQUIRED
  ]: LOCAL_MUTATION_READINESS_PLANNING_ACTION.ALLOW_PLANNING,
  [LOCAL_MUTATION_READINESS_PLANNING_STATE.LOCAL_MUTATION_BLOCKED]:
    LOCAL_MUTATION_READINESS_PLANNING_ACTION.DEFER_PLANNING,
});

const REBALANCER_SCHEDULE_PRESSURE_RESOURCE_KEYS = Object.freeze([
  UNIFIED_REBALANCER_LITERAL.REBALANCER_COLON_SCHEDULE,
]);

const PRIORITY_RECOVERY_PLANNING_GATE_FIELD = Object.freeze({
  PARTITION_ID: 'partitionId',
  PARTITION_ID_SNAKE: 'partition_id',
  PRIORITY_RECOVERY_DECISION_SNAPSHOTS:
    'priorityRecoveryDecisionSnapshots',
  SNAPSHOTS: 'snapshots',
});

const PRIORITY_RECOVERY_PLANNING_GATE_SCOPE = Object.freeze({
  CURRENT_PARTITION: 'current_partition',
  SURROGATE_PARTITION: 'surrogate_partition',
});

const PRIORITY_RECOVERY_PLANNING_GATE_BYPASS_STATE = Object.freeze({
  NOT_PRIORITY_PARTITION: 'not_priority_partition',
  OPERATION_CREATION_REQUIRED: 'operation_creation_required',
  OPERATION_CREATION_NOT_REQUIRED: 'operation_creation_not_required',
});

const PRIORITY_RECOVERY_PLANNING_GATE_BYPASS_ACTION = Object.freeze({
  APPLY_GATE: 'apply_gate',
  ALLOW_PLANNING: 'allow_planning',
});

const PRIORITY_RECOVERY_PLANNING_GATE_BYPASS_STATE_TABLE = Object.freeze([
  Object.freeze({
    state:
      PRIORITY_RECOVERY_PLANNING_GATE_BYPASS_STATE.NOT_PRIORITY_PARTITION,
    matches: (evidence) => evidence.isPriorityPartition !== true,
  }),
  Object.freeze({
    state:
      PRIORITY_RECOVERY_PLANNING_GATE_BYPASS_STATE
        .OPERATION_CREATION_REQUIRED,
    matches: (evidence) =>
      evidence.operationCreationRequired === true,
  }),
  Object.freeze({
    state:
      PRIORITY_RECOVERY_PLANNING_GATE_BYPASS_STATE
        .OPERATION_CREATION_NOT_REQUIRED,
    matches: () => true,
  }),
]);

const PRIORITY_RECOVERY_PLANNING_GATE_BYPASS_ACTION_BY_STATE = Object.freeze({
  [
  PRIORITY_RECOVERY_PLANNING_GATE_BYPASS_STATE.NOT_PRIORITY_PARTITION
  ]: PRIORITY_RECOVERY_PLANNING_GATE_BYPASS_ACTION.APPLY_GATE,
  [
  PRIORITY_RECOVERY_PLANNING_GATE_BYPASS_STATE.OPERATION_CREATION_REQUIRED
  ]: PRIORITY_RECOVERY_PLANNING_GATE_BYPASS_ACTION.ALLOW_PLANNING,
  [
  PRIORITY_RECOVERY_PLANNING_GATE_BYPASS_STATE.OPERATION_CREATION_NOT_REQUIRED
  ]: PRIORITY_RECOVERY_PLANNING_GATE_BYPASS_ACTION.APPLY_GATE,
});

const TRANSPORT_BACKPRESSURE_PLANNING_STATE = Object.freeze({
  CLEAR: 'clear',
  PRIORITY_RECOVERY_OPERATION_CREATION_REQUIRED:
    'priority_recovery_operation_creation_required',
  PRIORITY_RECOVERY_CONTAINED: 'priority_recovery_contained',
  PRIORITY_RECOVERY_CRITICAL_RESERVE_EXHAUSTED:
    'priority_recovery_critical_reserve_exhausted',
  GENERAL_BACKPRESSURE: 'general_backpressure',
});

const TRANSPORT_BACKPRESSURE_PLANNING_ACTION = Object.freeze({
  ALLOW_PLANNING: 'allow_planning',
  DEFER_PLANNING: 'defer_planning',
});

const TRANSPORT_BACKPRESSURE_PLANNING_STATE_TABLE = Object.freeze([
  Object.freeze({
    state: TRANSPORT_BACKPRESSURE_PLANNING_STATE.CLEAR,
    matches: (evidence) => evidence.backpressured !== true,
  }),
  Object.freeze({
    state:
      TRANSPORT_BACKPRESSURE_PLANNING_STATE
        .PRIORITY_RECOVERY_OPERATION_CREATION_REQUIRED,
    matches: (evidence) =>
      evidence.priorityRecoveryOperationCreationRequired === true,
  }),
  Object.freeze({
    state: TRANSPORT_BACKPRESSURE_PLANNING_STATE.PRIORITY_RECOVERY_CONTAINED,
    matches: (evidence) =>
      evidence.currentPriorityRecoveryPartitionBlocked === true &&
      evidence.criticalReserveExhausted !== true,
  }),
  Object.freeze({
    state:
      TRANSPORT_BACKPRESSURE_PLANNING_STATE
        .PRIORITY_RECOVERY_CRITICAL_RESERVE_EXHAUSTED,
    matches: (evidence) =>
      evidence.currentPriorityRecoveryPartitionBlocked === true &&
      evidence.criticalReserveExhausted === true,
  }),
  Object.freeze({
    state: TRANSPORT_BACKPRESSURE_PLANNING_STATE.GENERAL_BACKPRESSURE,
    matches: () => true,
  }),
]);

const TRANSPORT_BACKPRESSURE_PLANNING_ACTION_BY_STATE = Object.freeze({
  [TRANSPORT_BACKPRESSURE_PLANNING_STATE.CLEAR]:
    TRANSPORT_BACKPRESSURE_PLANNING_ACTION.ALLOW_PLANNING,
  [
  TRANSPORT_BACKPRESSURE_PLANNING_STATE
    .PRIORITY_RECOVERY_OPERATION_CREATION_REQUIRED
  ]: TRANSPORT_BACKPRESSURE_PLANNING_ACTION.ALLOW_PLANNING,
  [TRANSPORT_BACKPRESSURE_PLANNING_STATE.PRIORITY_RECOVERY_CONTAINED]:
    TRANSPORT_BACKPRESSURE_PLANNING_ACTION.ALLOW_PLANNING,
  [
  TRANSPORT_BACKPRESSURE_PLANNING_STATE
    .PRIORITY_RECOVERY_CRITICAL_RESERVE_EXHAUSTED
  ]: TRANSPORT_BACKPRESSURE_PLANNING_ACTION.DEFER_PLANNING,
  [TRANSPORT_BACKPRESSURE_PLANNING_STATE.GENERAL_BACKPRESSURE]:
    TRANSPORT_BACKPRESSURE_PLANNING_ACTION.DEFER_PLANNING,
});

class UnifiedRebalancerSegment5 extends UnifiedRebalancerSegment4 {
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
  }

  /**
   * Cancel any scheduled check.
   */
  cancelScheduledCheck() {
    if (this.scheduledCheck) {
      clearTimeout(this.scheduledCheck);
      this.scheduledCheck = null;
    }
  }

  /**
   * Cancel any pending stabilization check.
   */
  cancelStabilizationTimer() {
    if (this.stabilizationTimer) {
      clearTimeout(this.stabilizationTimer);
      this.stabilizationTimer = null;
    }
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
      partitionServices: new Map(),
      messageGroupServices: new Map(),
      cdcSubscriptionsActive: true,
    });

    if (result.ready) {
      this.clusterReadinessConfirmed = true;
      this.logger.info(REBALANCER_LOG_MSG.CLUSTER_READINESS_CONFIRMED, {
        entityId: this.entityId,
      });
      return null;
    }

    const elapsed = now - this.clusterReadinessStartMs;
    if (elapsed >= this.clusterReadinessTimeoutMs) {
      this.clusterReadinessConfirmed = true;
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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
        LOCAL_MUTATION_READINESS_OPERATION_CREATION_FIELD
          .PARTITION_NOT_APPLICABLE,
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
  }

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
  }

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
  }

  buildTransportBackpressurePlanningGateSnapshot() {
    const transportPressure = this.getTransportPressureSummary();
    const isPriorityPartition = this.isControlPlanePriorityPartition();
    const priorityRecoveryAdmissionPlan = isPriorityPartition ?
      this.getPriorityRecoveryAdmissionPlan() :
      null;
    const currentPriorityRecoveryPartitionBlocked =
      typeof priorityRecoveryAdmissionPlan?.hasBlockedPartition ===
        TYPEOF.FUNCTION &&
      priorityRecoveryAdmissionPlan.hasBlockedPartition(this.entityId) === true;
    const operationCreationGate = isPriorityPartition ?
      this.buildPriorityRecoveryOperationCreationPlanningGateSnapshot(
        this.entityId,
      ) :
      null;
    const priorityRecoveryOperationCreationRequired =
      operationCreationGate?.operationCreationRequired === true;
    const evidence = this.buildTransportBackpressurePlanningEvidence({
      transportPressure,
      currentPriorityRecoveryPartitionBlocked,
      priorityRecoveryOperationCreationRequired,
    });
    const pressureState = this.resolveTransportBackpressurePlanningState(
      evidence,
    );
    const planningAction =
      TRANSPORT_BACKPRESSURE_PLANNING_ACTION_BY_STATE[pressureState] ||
      TRANSPORT_BACKPRESSURE_PLANNING_ACTION.DEFER_PLANNING;
    return Object.freeze({
      transportPressure,
      isPriorityPartition,
      currentPriorityRecoveryPartitionBlocked,
      priorityRecoveryOperationCreationRequired,
      priorityRecoveryOperationCreationPartitionId:
        operationCreationGate?.operationCreationPartitionId || null,
      priorityRecoveryOperationCreationScope:
        operationCreationGate?.operationCreationScope || null,
      evidence,
      pressureState,
      planningAction,
      shouldDefer:
        planningAction ===
        TRANSPORT_BACKPRESSURE_PLANNING_ACTION.DEFER_PLANNING,
    });
  }

  /**
   * Normalize local transport pressure evidence before the planning decision.
   * @param {Object} options
   * @param {Object|null} options.transportPressure
   * @param {boolean} options.currentPriorityRecoveryPartitionBlocked
   * @param {boolean} options.priorityRecoveryOperationCreationRequired
   * @return {Object}
   * @private
   */
  buildTransportBackpressurePlanningEvidence({
    transportPressure,
    currentPriorityRecoveryPartitionBlocked,
    priorityRecoveryOperationCreationRequired,
  }) {
    return Object.freeze({
      backpressured: transportPressure?.backpressured === true,
      criticalReserveExhausted:
        transportPressure?.criticalReserveExhausted === true,
      currentPriorityRecoveryPartitionBlocked:
        currentPriorityRecoveryPartitionBlocked === true,
      priorityRecoveryOperationCreationRequired:
        priorityRecoveryOperationCreationRequired === true,
    });
  }

  /**
   * Return true when cached publication-planning evidence says the blocked
   * priority partition has reached the canonical no-operation follow-up lane.
   *
   * @param {string} partitionId
   * @return {boolean}
   * @private
   */
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
  }

  /**
   * Return one synchronous planning-gate snapshot for priority recovery work
   * that must create an operation before priority spread can close.
   *
   * @param {string} partitionId
   * @return {Object|null}
   * @private
   */
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
  }

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
  }

  /**
   * Resolve transport pressure into one state before deciding whether a
   * priority recovery partition may continue planning.
   * @param {Object} evidence
   * @return {string}
   * @private
   */
  resolveTransportBackpressurePlanningState(evidence) {
    const tableEntry = TRANSPORT_BACKPRESSURE_PLANNING_STATE_TABLE.find(
      (entry) => entry.matches(evidence),
    );
    return tableEntry ?
      tableEntry.state :
      TRANSPORT_BACKPRESSURE_PLANNING_STATE.GENERAL_BACKPRESSURE;
  }

  resolveTransportBackpressurePlanningGateDecision() {
    const gateSnapshot = this.buildTransportBackpressurePlanningGateSnapshot();
    if (gateSnapshot.shouldDefer !== true) {
      return null;
    }
    const transportPressure = gateSnapshot.transportPressure;
    const isPriorityPartition = gateSnapshot.isPriorityPartition;
    const scheduleDelayMs = isPriorityPartition ?
      this.currentInterval :
      this.increaseCurrentInterval(
        REBALANCE_PLANNING_GATE_DELAY_MULTIPLIER.BACKPRESSURE,
      );
    const delayMs = isPriorityPartition ?
      this.getPriorityRetryDelayMs() :
      scheduleDelayMs;
    return this.buildRebalancePlanningGateDecision({
      gate: REBALANCE_PLANNING_GATE.TRANSPORT_BACKPRESSURE,
      blocker: transportPressure,
      logMessage: REBALANCER_LOG_MSG.WAIT_TRANSPORT_BACKPRESSURE,
      logContext: {
        entityType: this.entityType,
        saturatedNodeCount: transportPressure.saturatedNodeCount,
        totalPending: transportPressure.totalPending,
        maxPendingUtilization: transportPressure.maxPendingUtilization,
        criticalReserveExhausted:
          transportPressure.criticalReserveExhausted === true,
        pressureState: gateSnapshot.pressureState,
        currentPriorityRecoveryPartitionBlocked:
          gateSnapshot.currentPriorityRecoveryPartitionBlocked,
        priorityRecoveryOperationCreationRequired:
          gateSnapshot.priorityRecoveryOperationCreationRequired,
        priorityRecoveryOperationCreationPartitionId:
          gateSnapshot.priorityRecoveryOperationCreationPartitionId,
        priorityRecoveryOperationCreationScope:
          gateSnapshot.priorityRecoveryOperationCreationScope,
        delayMs,
      },
      scheduleMode: REBALANCE_PLANNING_GATE_SCHEDULE_MODE.PRIORITY_AWARE,
      scheduleDelayMs,
    });
  }

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
  }

  async resolveCheckRebalanceGateDecision() {
    const planningGateDecisions =
      await this.collectRebalancePlanningGateDecisions();
    return planningGateDecisions.length > NUM.ZERO ?
      planningGateDecisions[NUM.ZERO] :
      null;
  }

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
  }

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
  }

  /**
   * Perform a rebalance check.
   * Requirements: 2.2, 2.3, 2.4
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
  }

  /**
   * Return the local router's outbound pressure summary when available.
   * @return {Object|null}
   * @private
   */
  getTransportPressureSummary() {
    const pressureProfile = this.buildTransportPressureProfile();
    return PressureGovernor.getShared({
      nodeId: this.nodeId,
      messageRouter: this.messageRouter,
    }).getPressureSummary(
      pressureProfile.resourceKeys,
      pressureProfile.workClass,
    );
  }

  /**
   * Priority control-plane partitions must observe control-plane pressure,
   * not the generic scheduler lane, because critical-reserve exhaustion is
   * the signal that was starving seed readiness probes during recovery.
   * @return {Object}
   * @private
   */
  buildTransportPressureProfile() {
    if (this.isControlPlanePriorityPartition()) {
      const workloadProfile = buildControlPlaneWorkloadProfile(
        CONTROL_PLANE_WORKLOAD_CLASS.REBALANCER_PRIORITY_VISIBILITY,
      );
      return Object.freeze({
        resourceKeys: workloadProfile.resourceKeys,
        workClass: workloadProfile.workClass || PRESSURE_WORK_CLASS.CRITICAL,
      });
    }
    return Object.freeze({
      resourceKeys: REBALANCER_SCHEDULE_PRESSURE_RESOURCE_KEYS,
      workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
    });
  }

  /**
   * Count moves that actually scheduled work (not skipped/deferred).
   * @param {Object} rebalanceResult - Result from rebalance().
   * @return {number} Number of actionable moves.
   * @private
   */
  countExecutedMoves(rebalanceResult) {
    if (!rebalanceResult || !Array.isArray(rebalanceResult.moves)) {
      return UNIFIED_REBALANCER_LITERAL.ZERO;
    }

    return rebalanceResult.moves.filter((move) => {
      if (!move || move.skipped) {
        return false;
      }
      return move.success !== false;
    }).length;
  }

  /**
   * Evaluate if rebalancing is needed.
   * @return {Promise<boolean>} True if rebalancing is needed.
   */
  async evaluateState() {
    const currentReplicas = this.getCurrentReplicas();
    const policy = await this.getPolicy();
    const availableNodes = this.getAvailableNodes();
    const assessment = this.movePlanner.assessState(
      currentReplicas,
      policy,
      availableNodes,
    );
    const {
      actionableTarget,
      critical,
      criticalReason,
      desiredTarget,
      healthyReplicas,
      suboptimal,
    } = assessment;

    this.logger.debug(REBALANCER_LOG_MSG.EVALUATING_STATE, {
      entityId: this.entityId,
      entityType: this.entityType,
      currentReplicaCount: currentReplicas.length,
      availableNodeCount: availableNodes.length,
      hasCache: !!this.systemTableCache,
      targetReplicaCount: desiredTarget,
      actionableTargetReplicaCount: actionableTarget,
    });

    // Skip rebalancing if cache appears unpopulated (no nodes known)
    // This prevents newly joined nodes from making incorrect decisions
    // before their cache is synchronized with the cluster state
    if (availableNodes.length === UNIFIED_REBALANCER_LITERAL.ZERO) {
      this.logger.debug(REBALANCER_LOG_MSG.NO_AVAILABLE_NODES, {
        entityId: this.entityId,
        entityType: this.entityType,
      });
      this.lastSuboptimalSignal = null;
      return false;
    }

    if (
      await this.hasPriorityRecoveryFollowUpOperationRequired() ||
      await this.hasPriorityRecoverySurrogateFollowUpOperationRequired()
    ) {
      this.lastSuboptimalSignal = null;
      return true;
    }

    if (
      availableNodes.length < desiredTarget &&
      healthyReplicas.length >= actionableTarget
    ) {
      const degradedSignal = this.buildDegradedTargetSignal(
        availableNodes,
        desiredTarget,
        actionableTarget,
        healthyReplicas.length,
      );
      if (this.lastDegradedTargetSignal !== degradedSignal) {
        this.lastDegradedTargetSignal = degradedSignal;
        this.logger.info(REBALANCER_LOG_MSG.DEGRADED_TARGET, {
          entityId: this.entityId,
          entityType: this.entityType,
          availableNodeCount: availableNodes.length,
          desiredTargetReplicaCount: desiredTarget,
          actionableTargetReplicaCount: actionableTarget,
          healthyReplicaCount: healthyReplicas.length,
        });
      }
    } else {
      this.lastDegradedTargetSignal = null;
    }

    // Critical checks - trigger immediate rebalancing
    if (critical) {
      this.lastSuboptimalSignal = null;
      this.logger.warn(REBALANCER_LOG_MSG.CRITICAL_STATE, {
        entityId: this.entityId,
        entityType: this.entityType,
        reason: criticalReason,
      });
      return true;
    }

    // Opportunistic checks - can wait for periodic schedule
    if (suboptimal) {
      const suboptimalSignal = this.buildSuboptimalSignal(
        availableNodes,
        desiredTarget,
        actionableTarget,
        healthyReplicas.length,
      );
      if (this.lastSuboptimalSignal !== suboptimalSignal) {
        this.lastSuboptimalSignal = suboptimalSignal;
        this.logger.info(REBALANCER_LOG_MSG.SUBOPTIMAL_STATE, {
          entityId: this.entityId,
          entityType: this.entityType,
          availableNodeCount: availableNodes.length,
          desiredTargetReplicaCount: desiredTarget,
          actionableTargetReplicaCount: actionableTarget,
          healthyReplicaCount: healthyReplicas.length,
        });
      }
      return true;
    }

    this.lastSuboptimalSignal = null;
    return false;
  }

  /**
   * Build a stable signal for degraded-target logging dedupe.
   * @param {Array<Object>} availableNodes - Ready nodes currently visible.
   * @param {number} desiredTarget - Policy target replica count.
   * @param {number} actionableTarget - Target constrained by ready topology.
   * @param {number} healthyReplicaCount - Current healthy replica count.
   * @return {string} Stable topology signal.
   * @private
   */
  buildDegradedTargetSignal(
    availableNodes,
    desiredTarget,
    actionableTarget,
    healthyReplicaCount,
  ) {
    const nodeSignature = availableNodes
      .map((node) => node?.node_id || node?.id || '')
      .filter(Boolean)
      .sort()
      .join(',');
    return (
      `${nodeSignature}|${desiredTarget}|${actionableTarget}|` +
      `${healthyReplicaCount}`
    );
  }

  /**
   * Build a stable signal for suboptimal-state logging dedupe.
   * @param {Array<Object>} availableNodes - Ready nodes currently visible.
   * @param {number} desiredTarget - Policy target replica count.
   * @param {number} actionableTarget - Target constrained by ready topology.
   * @param {number} healthyReplicaCount - Current healthy replica count.
   * @return {string} Stable suboptimal-state signal.
   * @private
   */
  buildSuboptimalSignal(
    availableNodes,
    desiredTarget,
    actionableTarget,
    healthyReplicaCount,
  ) {
    const nodeSignature = availableNodes
      .map((node) => node?.node_id || node?.id || '')
      .filter(Boolean)
      .sort()
      .join(',');
    return (
      `${nodeSignature}|${desiredTarget}|${actionableTarget}|` +
      `${healthyReplicaCount}`
    );
  }

  /**
   * Check if current state is critical (requires immediate action).
   * @param {Array<Object>} replicas - Current replicas.
   * @param {Object} policy - Applicable policy.
   * @return {boolean} True if state is critical.
   */
  isCriticalState(replicas, policy, availableNodes = null) {
    return this.movePlanner.isCriticalState(replicas, policy, availableNodes);
  }

  /**
   * Get the reason for critical state.
   * @param {Array<Object>} replicas - Current replicas.
   * @param {Object} policy - Applicable policy.
   * @return {string} Reason description.
   */
  getCriticalReason(replicas, policy, availableNodes = null) {
    return this.movePlanner.getCriticalReason(replicas, policy, availableNodes);
  }

  /**
   * Check if current state is suboptimal (can be improved).
   * @param {Array<Object>} replicas - Current replicas.
   * @param {Object} policy - Applicable policy.
   * @return {boolean} True if state is suboptimal.
   */
  isSuboptimalState(replicas, policy, availableNodes = null) {
    return this.movePlanner.isSuboptimalState(replicas, policy, availableNodes);
  }

  /**
   * Check if multiple replicas are on the same node.
   * @param {Array<Object>} replicas - Replicas to check.
   * @return {boolean} True if duplicates exist.
   */
  hasMultipleReplicasOnSameNode(replicas) {
    return this.movePlanner.hasMultipleReplicasOnSameNode(replicas);
  }

  /**
   * Get nodes that don't have a local replica.
   * @param {Array<Object>} replicas - Current replicas.
   * @return {Array<string>} Node IDs without local replicas.
   */
  getNodesWithoutLocalReplica(replicas) {
    return this.movePlanner.getNodesWithoutLocalReplica(replicas);
  }

  /**
   * Trigger immediate check (called by CDC event handlers).
   * @param {string} reason - Reason for immediate check.
   */
  triggerImmediateCheck(reason) {
    if (!this.isLeader || this.isShuttingDown) {
      return;
    }

    this.logger.info(REBALANCER_LOG_MSG.IMMEDIATE_TRIGGER, {
      entityId: this.entityId,
      entityType: this.entityType,
      reason,
    });

    const reconcileReason = this.mapTriggerReason(reason);
    this.enqueueRebalanceCheck(reconcileReason);
  }

  /**
   * Map a trigger reason string to a typed RECONCILE_REASON constant.
   * @param {string} reason - The trigger reason.
   * @return {string} A RECONCILE_REASON constant.
   * @private
   */
  mapTriggerReason(reason) {
    switch (reason) {
    case REBALANCER_RUNTIME_REASON.NODE_BECAME_READY:
      return RECONCILE_REASON.NODE_BECAME_READY;
    case REBALANCER_RUNTIME_REASON.NODE_LEFT_READY:
      return RECONCILE_REASON.NODE_LEFT_READY;
    case REBALANCER_RUNTIME_REASON.NODE_FAILED:
      return RECONCILE_REASON.NODE_FAILED;
    default:
      return RECONCILE_REASON.PERIODIC_CHECK;
    }
  }

  /**
   * Reconcile callback for the rebalance check queue.
   * Cancels any pending scheduled check and runs checkRebalance.
   * @param {Array<string>} _reasons - Accumulated reason codes.
   * @private
   */
  async reconcileRebalanceCheck(_reasons) {
    this.cancelScheduledCheck();
    this.cancelStabilizationTimer();
    await this.checkRebalance();
  }

  /**
   * Handle node state change notification from CDC.
   * Called by CDCIntegrationService when a node's state changes.
   * Emits 'nodeStateChange' event and optionally 'rebalanceNeeded' event.
   * @param {string} nodeId - The node ID.
   * @param {string} oldState - The previous state.
   * @param {string} newState - The new state.
   */
  onNodeStateChange(nodeId, oldState, newState) {
    // Always emit nodeStateChange event for observability
    this.emit(REBALANCER_EVENT.NODE_STATE_CHANGE, {
      nodeId,
      oldState,
      newState,
      timestamp: Date.now(),
    });

    // Non-leaders still emit events but don't trigger rebalancing
    if (!this.isLeader) {
      return;
    }

    this.logger.debug(REBALANCER_LOG_MSG.NODE_STATE_CHANGE, {
      entityId: this.entityId,
      nodeId,
      oldState,
      newState,
    });

    const rebalanceDecision = this.resolveNodeStateChangeRebalanceDecision(
      oldState,
      newState,
    );
    if (rebalanceDecision.needed) {
      // Record state change to reset stabilization timer
      if (rebalanceDecision.stabilizationTrigger) {
        this.recordStateChange(rebalanceDecision.stabilizationTrigger);
      }

      // Emit rebalanceNeeded event for observability
      this.emit(REBALANCER_EVENT.REBALANCE_NEEDED, {
        nodeId,
        oldState,
        newState,
        reason: rebalanceDecision.reason,
        timestamp: Date.now(),
      });

      this.triggerImmediateCheck(rebalanceDecision.reason);
    }
  }

  /**
   * Resolve one node-state-change rebalance decision.
   * @param {string} oldState
   * @param {string} newState
   * @return {{
   *   needed: boolean,
   *   reason: string|null,
   *   stabilizationTrigger: string|null,
   * }}
   * @private
   */
  resolveNodeStateChangeRebalanceDecision(oldState, newState) {
    if (newState === NodeStatus.FAILED) {
      return {
        needed: true,
        reason: REBALANCER_RUNTIME_REASON.NODE_FAILED,
        stabilizationTrigger: STABILIZATION_RESET_TRIGGER.NODE_FAILED,
      };
    } else if (
      newState === NodeStatus.ACTIVE &&
      oldState !== NodeStatus.ACTIVE
    ) {
      return {
        needed: true,
        reason: REBALANCER_RUNTIME_REASON.NODE_BECAME_READY,
        stabilizationTrigger: STABILIZATION_RESET_TRIGGER.NODE_JOINED,
      };
    } else if (
      oldState === NodeStatus.ACTIVE &&
      newState !== NodeStatus.ACTIVE
    ) {
      return {
        needed: true,
        reason: REBALANCER_RUNTIME_REASON.NODE_LEFT_READY,
        stabilizationTrigger: STABILIZATION_RESET_TRIGGER.NODE_LEFT,
      };
    }
    return {
      needed: false,
      reason: null,
      stabilizationTrigger: null,
    };
  }

  /**
   * Check if a CDC event is critical.
   * @param {Object} event - CDC event.
   * @return {boolean} True if event is critical.
   */
  isCriticalCDCEvent(event) {
    if (
      this.buildPriorityRecoveryVisibilityRebalanceDecision(
        event,
        {requireLeader: false},
      ).visibilityProgress === true
    ) {
      return true;
    }

    // Node failure is critical
    if (
      event.tableName === UNIFIED_REBALANCER_LITERAL.NODES &&
      event.operation === UNIFIED_REBALANCER_LITERAL.UPDATE &&
      event.data?.status === NodeStatus.FAILED
    ) {
      return this.affectsMyReplicas(event);
    }

    // Service failure is critical
    if (
      event.tableName === UNIFIED_REBALANCER_LITERAL.SERVICES &&
      event.operation === UNIFIED_REBALANCER_LITERAL.UPDATE &&
      event.data?.status === ReplicaStatus.FAILED
    ) {
      return (
        event.data?.partition_id === this.entityId ||
        event.data?.group_id === this.entityId ||
        (this.entityType === EntityType.RUNTIME_SERVICE &&
          event.data?.service_id === this.entityId)
      );
    }

    return false;
  }

  /**
   * Check if an event affects this entity's replicas.
   * @param {Object} event - CDC event.
   * @return {boolean} True if event affects our replicas.
   */
  affectsMyReplicas(event) {
    const replicas = this.getCurrentReplicas();
    const nodeId = event.data?.node_id;

    if (!nodeId) {
      return false;
    }

    // Filter out replicas without node_id (defensive check)
    return replicas.some((r) => r && r.node_id === nodeId);
  }

  /**
   * Get rebalancer statistics.
   * @return {Object} Statistics object.
   */
  getStats() {
    const stats = {
      entityId: this.entityId,
      entityType: this.entityType,
      isLeader: this.isLeader,
      lastRebalanceTime: this.lastRebalanceTime,
      rebalanceCount: this.rebalanceCount,
      currentInterval: this.currentInterval,
      initialized: this.initialized,
      usingCoordinator: !!this.rebalanceCoordinator,
    };

    // Coordinator stats are fetched asynchronously via getStatsAsync()
    // This method returns basic stats synchronously for backward compatibility

    return stats;
  }

  /**
   * Get rebalancer statistics including coordinator stats (async).
   * @return {Promise<Object>} Statistics object with coordinator stats.
   */
  async getStatsAsync() {
    const stats = this.getStats();

    if (this.rebalanceCoordinator && this.rebalanceCoordinator.getStats) {
      const coordStats = await this.rebalanceCoordinator.getStats();
      stats.coordinatorStats = {
        inFlightOperations: coordStats.inFlightOperations,
        operationsCreated: coordStats.operationsCreated,
        operationsCompleted: coordStats.operationsCompleted,
        operationsFailed: coordStats.operationsFailed,
      };
    }

    return stats;
  }

  /**
   * Shutdown the rebalancer.
   */
  shutdown() {
    this.isShuttingDown = true;
    this.isLeader = false;
    this.cancelScheduledCheck();
    this.rebalanceCheckQueue.shutdown();
    this.cancelStabilizationTimer();
    this.unbindCoordinatorProgressListeners();
    this.unbindPriorityRecoveryVisibilityCacheListener();
    this.lastStateChangeTime = null;
    this.initialized = false;

    this.logger.info(REBALANCER_LOG_MSG.SHUTDOWN, {
      entityId: this.entityId,
      entityType: this.entityType,
    });
  }
}

export {UnifiedRebalancerSegment5};
