import {UNIFIED_REBALANCER_SHARED} from './unified-rebalancer-shared.js';
import {
  REBALANCER_SCHEDULE_PRESSURE_RESOURCE_KEYS,
  REBALANCE_PLANNING_GATE_DELAY_MULTIPLIER,
  REBALANCE_PLANNING_GATE,
  REBALANCE_PLANNING_GATE_SCHEDULE_MODE,
  TRANSPORT_BACKPRESSURE_PLANNING_ACTION,
  TRANSPORT_BACKPRESSURE_PLANNING_ACTION_BY_STATE,
  TRANSPORT_BACKPRESSURE_PLANNING_STATE,
  TRANSPORT_BACKPRESSURE_PLANNING_STATE_TABLE,
} from './rebalancer-planning-gate-constants.js';

const {
  CONTROL_PLANE_WORKLOAD_CLASS,
  PRESSURE_WORK_CLASS,
  TYPEOF,
  buildControlPlaneWorkloadProfile,
  PressureGovernor,
  REBALANCER_LOG_MSG,
} = UNIFIED_REBALANCER_SHARED;

const REBALANCER_TRANSPORT_PRESSURE_METHODS = {
  getTransportPressureSummary() {
    const pressureProfile = this.buildTransportPressureProfile();
    return PressureGovernor.getShared({
      nodeId: this.nodeId,
      messageRouter: this.messageRouter,
    }).getPressureSummary(
      pressureProfile.resourceKeys,
      pressureProfile.workClass,
    );
  },

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
  },

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
  },

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
  },

  resolveTransportBackpressurePlanningState(evidence) {
    const tableEntry = TRANSPORT_BACKPRESSURE_PLANNING_STATE_TABLE.find(
      (entry) => entry.matches(evidence),
    );
    return tableEntry ?
      tableEntry.state :
      TRANSPORT_BACKPRESSURE_PLANNING_STATE.GENERAL_BACKPRESSURE;
  },

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
          gateSnapshot.operationCreationPartitionId,
        priorityRecoveryOperationCreationScope:
          gateSnapshot.operationCreationScope,
        delayMs,
      },
      scheduleMode: REBALANCE_PLANNING_GATE_SCHEDULE_MODE.PRIORITY_AWARE,
      scheduleDelayMs,
    });
  },
};

export {REBALANCER_TRANSPORT_PRESSURE_METHODS};
