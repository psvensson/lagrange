import {UNIFIED_REBALANCER_SHARED} from './unified-rebalancer-shared.js';

const {
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_REASON,
  NUM,
  TYPEOF,
  UNIFIED_REBALANCER_LITERAL,
} = UNIFIED_REBALANCER_SHARED;

const LOCAL_SERVE_READINESS_REASON_STATE = Object.freeze({
  SERVE_ELIGIBLE: 'serve_eligible',
  STARTUP_BYPASS: 'startup_bypass',
  PRIORITY_RECOVERY_ONLY: 'priority_recovery_only',
  BLOCKING_REASON_PRESENT: 'blocking_reason_present',
});

const LOCAL_SERVE_READINESS_PLANNING_DECISION = Object.freeze({
  ALLOW_PLANNING: 'allow_planning',
  DEFER_PLANNING: 'defer_planning',
});

const LOCAL_SERVE_READINESS_REASON_DECISION_TABLE = Object.freeze({
  [LOCAL_SERVE_READINESS_REASON_STATE.SERVE_ELIGIBLE]:
    LOCAL_SERVE_READINESS_PLANNING_DECISION.ALLOW_PLANNING,
  [LOCAL_SERVE_READINESS_REASON_STATE.STARTUP_BYPASS]:
    LOCAL_SERVE_READINESS_PLANNING_DECISION.ALLOW_PLANNING,
  [LOCAL_SERVE_READINESS_REASON_STATE.PRIORITY_RECOVERY_ONLY]:
    LOCAL_SERVE_READINESS_PLANNING_DECISION.ALLOW_PLANNING,
  [LOCAL_SERVE_READINESS_REASON_STATE.BLOCKING_REASON_PRESENT]:
    LOCAL_SERVE_READINESS_PLANNING_DECISION.DEFER_PLANNING,
});

const LOCAL_SERVE_PRIORITY_RECOVERY_REASON_CODES = Object.freeze([
  CONTROL_PLANE_READINESS_REASON.CONTROL_PLANE_PUBLICATION_PENDING,
  CONTROL_PLANE_READINESS_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
]);

const LOCAL_SERVE_PRIORITY_RECOVERY_REASON_CODE_SET = new Set(
  LOCAL_SERVE_PRIORITY_RECOVERY_REASON_CODES,
);

const UNIFIED_REBALANCER_LOCAL_SERVE_READINESS_METHODS = {
  normalizeLocalServeReadinessReasonCodes(readiness) {
    const seenReasonCodes = new Set();
    const reasonCodes = [];
    for (const reason of Array.isArray(readiness?.reasons) ?
      readiness.reasons :
      []) {
      const rawCode =
        typeof reason === TYPEOF.STRING ?
          reason :
          reason?.code || reason?.reason ||
            UNIFIED_REBALANCER_LITERAL.EMPTY_STRING;
      const reasonCode = String(rawCode).trim();
      if (
        reasonCode.length === NUM.ZERO ||
        seenReasonCodes.has(reasonCode)
      ) {
        continue;
      }
      seenReasonCodes.add(reasonCode);
      reasonCodes.push(reasonCode);
    }
    return Object.freeze(reasonCodes);
  },

  resolveLocalServeReadinessReasonState({
    readiness,
    reasonCodes,
    startupBypass,
  } = {}) {
    if (
      readiness?.dimensions?.[
        CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE
      ] === true
    ) {
      return LOCAL_SERVE_READINESS_REASON_STATE.SERVE_ELIGIBLE;
    }
    if (startupBypass === true) {
      return LOCAL_SERVE_READINESS_REASON_STATE.STARTUP_BYPASS;
    }
    if (
      !this.isControlPlanePriorityPartition() ||
      !Array.isArray(reasonCodes) ||
      reasonCodes.length === NUM.ZERO
    ) {
      return LOCAL_SERVE_READINESS_REASON_STATE.BLOCKING_REASON_PRESENT;
    }
    const priorityRecoveryOnly = reasonCodes.every((reasonCode) =>
      LOCAL_SERVE_PRIORITY_RECOVERY_REASON_CODE_SET.has(reasonCode),
    );
    return priorityRecoveryOnly ?
      LOCAL_SERVE_READINESS_REASON_STATE.PRIORITY_RECOVERY_ONLY :
      LOCAL_SERVE_READINESS_REASON_STATE.BLOCKING_REASON_PRESENT;
  },

  buildLocalServeReadinessPlanningSnapshot(readiness) {
    const reasonCodes = this.normalizeLocalServeReadinessReasonCodes(readiness);
    const startupBypass =
      this.shouldBypassLocalPriorityControlPlaneStartupReadiness();
    const reasonState = this.resolveLocalServeReadinessReasonState({
      readiness,
      reasonCodes,
      startupBypass,
    });
    return Object.freeze({
      reasonCodes,
      reasonState,
      startupBypass,
      decision:
        LOCAL_SERVE_READINESS_REASON_DECISION_TABLE[reasonState] ||
        LOCAL_SERVE_READINESS_PLANNING_DECISION.DEFER_PLANNING,
    });
  },

  /**
   * Return one local readiness snapshot when critical system-partition
   * planning should wait for this leader to become serve-eligible.
   *
   * Background redistribution of seed-hosted system partitions fans out many
   * control-plane reads and writes. During join/restart convergence, a leader
   * that is not yet serve-eligible should not initiate that background work,
   * even though repair-eligible topology operations remain valid elsewhere.
   *
   * @return {Object|null}
   * @private
   */
  getCriticalSystemLocalServeReadinessBlocker() {
    if (
      !this.isSystemPartitionEntity() ||
      !this.controlPlaneReadinessService ||
      typeof this.controlPlaneReadinessService.getNodeReadinessSync !==
        TYPEOF.FUNCTION
    ) {
      return null;
    }
    const readiness = this.controlPlaneReadinessService.getNodeReadinessSync(
      this.nodeId,
      {
        allowStaleOnCacheChange: false,
      },
    );
    if (!readiness?.dimensions) {
      return null;
    }
    const planningSnapshot =
      this.buildLocalServeReadinessPlanningSnapshot(readiness);
    if (
      planningSnapshot.decision ===
        LOCAL_SERVE_READINESS_PLANNING_DECISION.ALLOW_PLANNING
    ) {
      return null;
    }
    return Object.freeze({
      ...readiness,
      localServeReadinessPlanning: planningSnapshot,
    });
  },
};

export {UNIFIED_REBALANCER_LOCAL_SERVE_READINESS_METHODS};
