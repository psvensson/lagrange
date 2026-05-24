import {UNIFIED_REBALANCER_SHARED} from './unified-rebalancer-shared.js';

const {
  EntityType,
  NUM,
  REBALANCER_DEFAULT,
  REBALANCER_DEFAULT_POLICY,
  REBALANCER_LOG_MSG,
  RECONCILE_REASON,
  UNIFIED_REBALANCER_LITERAL,
} = UNIFIED_REBALANCER_SHARED;

const SEGMENT_1_POLICY_SCHEDULER_CONSTRUCTOR = 'constructor';

class UnifiedRebalancerSegment1PolicySchedulerMethods {
  /**
   * Get the policy for this entity.
   * @return {Promise<Object>} The applicable policy.
   */
  async getPolicy() {
    if (this.entityType === EntityType.MESSAGE_GROUP) {
      return this.getMessageGroupPolicy();
    }
    if (this.entityType === EntityType.RUNTIME_SERVICE) {
      return this.getRuntimeServicePolicy();
    }
    return this.getTablePolicy();
  }

  /**
   * Get table policy for a partition.
   * Uses TablePolicyService for policy lookup.
   * @return {Promise<Object>} Table policy.
   */
  async getTablePolicy() {
    return this.tablePolicyService.getPolicyForPartition(this.entityId);
  }

  /**
   * Get message group policy.
   * @return {Object} Message group policy.
   */
  getMessageGroupPolicy() {
    // Delegate to TablePolicyService for canonical validation/merge
    return this.tablePolicyService.getMessageGroupPolicy(this.entityId);
  }

  /**
   * Get runtime service policy.
   * Returns the default runtime service placement policy.
   * @return {Object} Runtime service policy.
   */
  getRuntimeServicePolicy() {
    return {...REBALANCER_DEFAULT_POLICY.RUNTIME_SERVICE};
  }

  /**
   * Clamp stabilization period to valid range [1000ms, 10000ms].
   * @param {number} value - Configured stabilization period.
   * @return {number} Clamped stabilization period.
   */
  clampStabilizationPeriod(value) {
    if (typeof value !== UNIFIED_REBALANCER_LITERAL.NUMBER || isNaN(value)) {
      return this.defaultStabilizationMs;
    }
    return Math.max(
      this.minStabilizationMs,
      Math.min(this.maxStabilizationMs, value),
    );
  }

  /**
   * Resolve non-negative millisecond value with fallback.
   * @param {*} value - Candidate config value.
   * @param {number} fallback - Fallback milliseconds.
   * @return {number} Non-negative milliseconds.
   */
  resolveNonNegativeMs(value, fallback) {
    if (
      typeof value === UNIFIED_REBALANCER_LITERAL.NUMBER &&
      Number.isFinite(value) &&
      value >= UNIFIED_REBALANCER_LITERAL.ZERO
    ) {
      return Math.floor(value);
    }
    return fallback;
  }

  /**
   * Resolve the short retry cadence used while startup-critical control-plane
   * partitions wait on gating conditions.
   * @return {number}
   */
  getPriorityRetryDelayMs() {
    const configuredDelayMs =
      Number.isFinite(this.criticalCheckDelayMs) &&
      this.criticalCheckDelayMs > NUM.ZERO ?
        Math.floor(this.criticalCheckDelayMs) :
        REBALANCER_DEFAULT.UNIFIED.CRITICAL_CHECK_DELAY_MS;
    return Math.max(UNIFIED_REBALANCER_LITERAL.THOUSAND, configuredDelayMs);
  }

  /**
   * Resolve the first scheduler delay after leadership activation.
   * Priority control-plane partitions should begin checking quickly instead
   * of inheriting the ordinary 60s+ periodic cadence.
   * @return {number}
   */
  getLeadershipStartDelayMs() {
    if (this.isControlPlanePriorityPartition()) {
      return Math.max(
        UNIFIED_REBALANCER_LITERAL.ONE,
        Math.floor(Math.random() * this.getPriorityRetryDelayMs()),
      );
    }
    // Stagger initial check with per-entity random offset to avoid
    // thundering herd when many partitions become leaders at once
    // (e.g. during bootstrap or rolling restarts).
    const initialJitter = Math.floor(
      Math.random() * this.periodicCheckIntervalMs,
    );
    return this.periodicCheckIntervalMs + initialJitter;
  }

  /**
   * Schedule a follow-up check using the priority control-plane cadence when
   * this entity owns startup-critical control-plane work.
   * @param {number|null} [delayMs]
   */
  schedulePriorityAwareCheck(delayMs = null) {
    if (this.isControlPlanePriorityPartition()) {
      this.scheduleNextCheck(this.getPriorityRetryDelayMs());
      return;
    }
    this.scheduleNextCheck(delayMs);
  }

  /**
   * Resolve start delay before rebalancing is eligible.
   * @return {number} Delay in milliseconds.
   */
  getRebalanceStartDelayMs() {
    if (this.entityType !== EntityType.PARTITION) {
      return UNIFIED_REBALANCER_LITERAL.ZERO;
    }
    if (this.isSystemPartitionEntity()) {
      return this.systemPartitionStartDelayMs;
    }
    return this.userPartitionStartDelayMs;
  }

  /**
   * Milliseconds remaining until this entity is eligible for rebalancing.
   * @param {number} [nowMs=Date.now()] - Current timestamp.
   * @return {number} Remaining milliseconds, or 0 if eligible.
   */
  getTimeUntilRebalanceStartEligible(nowMs = Date.now()) {
    const delayMs = this.getRebalanceStartDelayMs();
    if (delayMs <= UNIFIED_REBALANCER_LITERAL.ZERO) {
      return UNIFIED_REBALANCER_LITERAL.ZERO;
    }
    const elapsed = nowMs - this.rebalanceStartAtMs;
    const remaining = delayMs - elapsed;
    return remaining > UNIFIED_REBALANCER_LITERAL.ZERO ?
      remaining :
      UNIFIED_REBALANCER_LITERAL.ZERO;
  }

  /**
   * Check if stabilization period has elapsed since last state change.
   * Requirements: 2.2, 2.3
   * @return {boolean} True if stable (no recent state changes).
   */
  isStabilized() {
    if (!this.lastStateChangeTime) {
      return true;
    }
    const elapsed = Date.now() - this.lastStateChangeTime;
    return elapsed >= this.stabilizationPeriodMs;
  }

  /**
   * Record a state change and reset stabilization timer.
   * Requirements: 2.5
   * @param {string} reason - Reason for state change.
   */
  recordStateChange(reason) {
    if (this.isShuttingDown) {
      return;
    }

    this.lastStateChangeTime = Date.now();

    this.logger.debug(REBALANCER_LOG_MSG.STABILIZATION_RESET, {
      entityId: this.entityId,
      reason,
      stabilizationPeriodMs: this.stabilizationPeriodMs,
    });

    // Any previously scheduled periodic or stabilization check now represents
    // stale topology evidence. Replace them with one fresh stabilization timer.
    this.cancelScheduledCheck();
    this.cancelStabilizationTimer();

    // Schedule check after stabilization period
    if (this.isLeader) {
      this.stabilizationTimer = setTimeout(() => {
        this.stabilizationTimer = null;
        this.enqueueRebalanceCheck(RECONCILE_REASON.PERIODIC_CHECK);
      }, this.stabilizationPeriodMs);
    }
  }

  /**
   * Get the current stabilization period in milliseconds.
   * @return {number} Stabilization period.
   */
  getStabilizationPeriodMs() {
    return this.stabilizationPeriodMs;
  }

  /**
   * Get the time remaining until stabilization completes.
   * @return {number} Milliseconds remaining, or 0 if already stable.
   */
  getTimeUntilStabilized() {
    if (!this.lastStateChangeTime) {
      return UNIFIED_REBALANCER_LITERAL.ZERO;
    }
    const elapsed = Date.now() - this.lastStateChangeTime;
    const remaining = this.stabilizationPeriodMs - elapsed;
    return Math.max(UNIFIED_REBALANCER_LITERAL.ZERO, remaining);
  }

  /**
   * Validate and adjust replica count to be odd.
   * @param {number} count - Desired replica count.
   * @param {Object} policy - Policy with min/max constraints.
   * @return {number} Valid odd replica count.
   */
  validateReplicaCount(count, policy) {
    return this.movePlanner.validateReplicaCount(count, policy);
  }

  /**
   * Calculate target replica count based on policy and current state.
   * Supports growing/shrinking in odd increments (3->5->7 or 7->5->3).
   * @param {Array<Object>} currentReplicas - Current replicas.
   * @param {Object} policy - Applicable policy.
   * @return {number} Target replica count.
   */
  calculateTargetReplicaCount(currentReplicas, policy) {
    return this.movePlanner.calculateTargetReplicaCount(
      currentReplicas,
      policy,
    );
  }

  /**
   * Get desired replica target from policy.
   * @param {Object} policy - Applicable policy.
   * @return {number} Desired policy target.
   */
  getPolicyTargetReplicaCount(policy) {
    return this.movePlanner.getPolicyTargetReplicaCount(policy);
  }

  /**
   * Get actionable target based on currently available ready nodes.
   * @param {Object} policy - Applicable policy.
   * @param {Array<Object>} availableNodes - Ready nodes.
   * @return {number} Actionable target for current topology.
   */
  getActionableTargetReplicaCount(policy, availableNodes) {
    return this.movePlanner.getActionableTargetReplicaCount(
      policy,
      availableNodes,
    );
  }
}

function applyUnifiedRebalancerSegment1PolicySchedulerMethods(targetClass) {
  const sourcePrototype =
    UnifiedRebalancerSegment1PolicySchedulerMethods.prototype;
  for (const methodName of Object.getOwnPropertyNames(sourcePrototype)) {
    if (methodName === SEGMENT_1_POLICY_SCHEDULER_CONSTRUCTOR) {
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(
      sourcePrototype,
      methodName,
    );
    Object.defineProperty(targetClass.prototype, methodName, descriptor);
  }
}

export {applyUnifiedRebalancerSegment1PolicySchedulerMethods};
