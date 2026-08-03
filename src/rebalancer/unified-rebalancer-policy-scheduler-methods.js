import {UNIFIED_REBALANCER_SHARED} from './unified-rebalancer-shared.js';
import {liveActivationPinNodeIds} from
  '../service/call-activation-lease-owner.js';
import {
  buildServiceDataAffinityWeights,
} from './service-data-affinity-weights.js';
import {
  PLACEMENT_OWNER_POLICY_FIELD,
} from './placement-owner-evidence.js';
import {resolveRuntimeServiceTargetReplicaCount} from
  './runtime-service-policy.js';

const {
  EntityType,
  REBALANCER_DEFAULT,
  REBALANCER_DEFAULT_POLICY,
  REBALANCER_LOG_MSG,
  RECONCILE_REASON,
  SYSTEM_TABLE_NAME,
  UNIFIED_REBALANCER_LITERAL,
} = UNIFIED_REBALANCER_SHARED;

const POLICY_SCHEDULER_CONSTRUCTOR = 'constructor';

class UnifiedRebalancerPolicySchedulerMethods {
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
   *
   * Starts from the system-owned runtime-service placement policy. Legacy
   * non-Binding definitions may override `targetReplicaCount` with their
   * desired `replica_count`, preserving built-in scale and "ship not-started"
   * behavior. Binding-derived definitions never supply placement intent:
   * target/min/max, topology, capacity, and affinity remain policy outputs.
   *
   * Affinity lift (service↔data affinity placement epic): fresh
   * cross-node attribution rows always become per-node/per-group
   * placement weights for runtime services. `read_locality` remains a
   * query-routing choice; it does not disable the placement behavior
   * that makes replicated services converge toward their data. Before
   * the service has an access profile, the policy remains unchanged.
   *
   * @return {Object} Runtime service policy.
   */
  getRuntimeServicePolicy() {
    const policy = {...REBALANCER_DEFAULT_POLICY.RUNTIME_SERVICE};
    const definition = this.systemTableCache?.get(
      SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS,
      this.entityId,
    );
    policy.targetReplicaCount =
      resolveRuntimeServiceTargetReplicaCount(definition);
    // Data-local call activation pins: LIVE bounded leases published by
    // the call invocation owner deterministically pin their nodes into
    // the placement target while they last (distinct from the soft
    // decaying data-affinity weights below — the locality contract is an
    // execution-time requirement, not a steady-state preference). An
    // expired lease stops pinning, so the surplus cure reclaims the
    // activated replica on the next pass.
    const activationPinNodeIds = liveActivationPinNodeIds({
      nowMs: Date.now(),
      serviceId: this.entityId,
      systemTableCache: this.systemTableCache,
    });
    if (activationPinNodeIds.length > 0) {
      policy.activationPinNodeIds = activationPinNodeIds;
    }
    const {nodeWeights, groupWeights} = buildServiceDataAffinityWeights({
      systemTableCache: this.systemTableCache,
      serviceId: this.entityId,
      nowMs: Date.now(),
    });
    if (Object.keys(nodeWeights).length > 0 ||
        Object.keys(groupWeights).length > 0) {
      policy[PLACEMENT_OWNER_POLICY_FIELD.DATA_AFFINITY] = {
        [PLACEMENT_OWNER_POLICY_FIELD.DATA_AFFINITY_NODE_WEIGHTS]:
          nodeWeights,
        [PLACEMENT_OWNER_POLICY_FIELD.DATA_AFFINITY_GROUP_WEIGHTS]:
          groupWeights,
      };
      policy[PLACEMENT_OWNER_POLICY_FIELD.PLACEMENT_CONSTRAINTS] = {
        ...policy[PLACEMENT_OWNER_POLICY_FIELD.PLACEMENT_CONSTRAINTS],
        [PLACEMENT_OWNER_POLICY_FIELD.PREFER_DATA_AFFINITY]: true,
      };
    }
    return policy;
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
      this.criticalCheckDelayMs > 0 ?
        Math.floor(this.criticalCheckDelayMs) :
        REBALANCER_DEFAULT.UNIFIED.CRITICAL_CHECK_DELAY_MS;
    return Math.max(UNIFIED_REBALANCER_LITERAL.THOUSAND, configuredDelayMs);
  }

  /**
   * Resolve the continuous-clear interval required before ordinary work can
   * resume after any rebalancer sharing this node's readiness owner observed
   * priority recovery. The ordinary cadence is followed by the scheduler's
   * existing positive jitter window so a different background entity cannot
   * release the shared fence at the exact formation-quiescence boundary. This
   * preserves an observation handoff without changing the ordinary scheduled
   * delay or the admission owner's stability window.
   * @return {number}
   */
  getBackgroundPrioritySpreadStableWindowMs() {
    const ordinaryIntervalMs = Math.max(
      this.getPriorityRetryDelayMs(),
      Number.isFinite(this.periodicCheckIntervalMs) &&
      this.periodicCheckIntervalMs > 0 ?
        Math.floor(this.periodicCheckIntervalMs) :
        REBALANCER_DEFAULT.UNIFIED.PERIODIC_CHECK_INTERVAL_MS,
    );
    return ordinaryIntervalMs +
      this.getBackgroundPrioritySpreadObservationHandoffMs();
  }

  /**
   * Resolve the already-configured positive window separating formation
   * quiescence maturity from ordinary background release.
   * @return {number}
   */
  getBackgroundPrioritySpreadObservationHandoffMs() {
    return Number.isFinite(this.periodicCheckJitterMs) &&
      this.periodicCheckJitterMs > 0 ?
      Math.floor(this.periodicCheckJitterMs) :
      REBALANCER_DEFAULT.UNIFIED.PERIODIC_CHECK_JITTER_MS;
  }

  /**
   * Resolve the release cadence for background work deferred behind priority
   * spread. Those entities must not inherit the exact short priority retry:
   * doing so synchronizes every deferred partition. The stable window already
   * includes the positive observation handoff; per-entity jitter then keeps the
   * background cohort staggered.
   * @return {number}
   */
  getBackgroundPrioritySpreadReleaseDelayMs() {
    const stableWindowMs =
      this.getBackgroundPrioritySpreadStableWindowMs();
    const jitterWindowMs =
      this.getBackgroundPrioritySpreadObservationHandoffMs();
    const jitterMs = Math.floor(
      this.randomSource.random() * jitterWindowMs,
    );
    return stableWindowMs + jitterMs;
  }

  /**
   * Preserve the shared fence's already-observed maturity deadline when an
   * unrelated progress event rechecks a stabilizing background entity. The
   * positive observation handoff is already part of stableRemainingMs; a new
   * full ordinary delay here would cancel the earlier timer and move maturity
   * another cadence into the future.
   * @param {number} stableRemainingMs
   * @return {number}
   */
  getBackgroundPrioritySpreadStableReleaseDelayMs(stableRemainingMs) {
    if (!Number.isFinite(stableRemainingMs)) {
      return this.getBackgroundPrioritySpreadStableWindowMs();
    }
    return Math.max(
      UNIFIED_REBALANCER_LITERAL.THOUSAND,
      Math.floor(stableRemainingMs),
    );
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
        Math.floor(this.randomSource.random() * this.getPriorityRetryDelayMs()),
      );
    }
    // Stagger initial check with per-entity random offset to avoid
    // thundering herd when many partitions become leaders at once
    // (e.g. during bootstrap or rolling restarts).
    const initialJitter = Math.floor(
      this.randomSource.random() * this.periodicCheckIntervalMs,
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

function applyUnifiedRebalancerPolicySchedulerMethods(targetClass) {
  const sourcePrototype =
    UnifiedRebalancerPolicySchedulerMethods.prototype;
  for (const methodName of Object.getOwnPropertyNames(sourcePrototype)) {
    if (methodName === POLICY_SCHEDULER_CONSTRUCTOR) {
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(
      sourcePrototype,
      methodName,
    );
    Object.defineProperty(targetClass.prototype, methodName, descriptor);
  }
}

export {applyUnifiedRebalancerPolicySchedulerMethods};
