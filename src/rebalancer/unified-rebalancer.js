/**
 * Unified Rebalancer - Manages replica placement for partitions and message groups.
 * Uses the same algorithm for all scenarios, driven by policies.
 * Operates fully autonomously - operators never manually specify replica placement.
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.10
 */

import {EventEmitter} from 'events';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {SystemTableName} from '../bootstrap/system-table-schemas-constants.js';
import {MovePlanner} from './move-planner.js';
import {
  OperationType,
  ReplicaStatus,
  TERMINAL_STATUSES,
  TERMINAL_STATUS_SQL_CLAUSE,
  ADJUST_DIRECTION,
} from './replica-status.js';
import {assertCritical} from '../utils/assert.js';
import {
  isNodeRecordReady,
  isNodeReadyWithTransport,
} from '../node/node-readiness-policy.js';
import {
  REBALANCER_CONFIG_KEY,
  REBALANCER_DEFAULT,
  REBALANCER_DEFAULT_POLICY,
  REBALANCER_ENTITY_TYPE,
  REBALANCER_ERROR_MSG,
  REBALANCER_EVENT,
  REBALANCER_LOG_MSG,
  REBALANCER_MOVE_TYPE,
  REBALANCER_NODE_STATUS,
  REBALANCER_SKIP_REASON,
  REBALANCER_SUBSYSTEM,
  REBALANCER_TRIGGER,
  STABILIZATION_RESET_TRIGGER,
} from './rebalancer-constants.js';

const EntityType = REBALANCER_ENTITY_TYPE;

const TriggerType = REBALANCER_TRIGGER;

const MoveType = REBALANCER_MOVE_TYPE;

const NodeStatus = REBALANCER_NODE_STATUS;

const DEFAULT_TABLE_POLICY = REBALANCER_DEFAULT_POLICY.TABLE;

const DEFAULT_MESSAGE_GROUP_POLICY = REBALANCER_DEFAULT_POLICY.MESSAGE_GROUP;

const SQL_BUDGET = Object.freeze({
  SELECT_REBALANCE_BUDGET:
    'SELECT config_value FROM config WHERE config_key = ? LIMIT 1',
  SELECT_IN_FLIGHT_COUNT:
    `SELECT COUNT(*) AS count FROM replica_operations
     WHERE status NOT IN (${TERMINAL_STATUS_SQL_CLAUSE})`,
});

const LEARNER_ROLE = 'learner';

const CRITICAL_SYSTEM_PARTITION_IDS = new Set(
  Object.values(SystemTableName).map((tableName) => `${tableName}-p1`),
);

/**
 * Validate that a replica count is odd (required for Raft quorum).
 * @param {number} count - Replica count to validate.
 * @return {boolean} True if count is odd.
 */
function isOddReplicaCount(count) {
  return count % 2 === 1;
}

/**
 * Adjust replica count to nearest odd number.
 * @param {number} count - Replica count to adjust.
 * @param {string} direction - ADJUST_DIRECTION.UP or ADJUST_DIRECTION.DOWN.
 * @return {number} Adjusted odd replica count.
 */
function adjustToOddCount(count, direction = ADJUST_DIRECTION.UP) {
  if (isOddReplicaCount(count)) {
    return count;
  }
  return direction === ADJUST_DIRECTION.UP ? count + 1 : count - 1;
}

/**
 * Get the next higher odd replica count (3→5→7).
 * @param {number} current - Current replica count.
 * @param {number} max - Maximum allowed count.
 * @return {number} Next odd count or current if at max.
 */
function getNextOddCount(current, max) {
  const next = current + 2;
  return next <= max ? next : current;
}

/**
 * Get the next lower odd replica count (7→5→3).
 * @param {number} current - Current replica count.
 * @param {number} min - Minimum allowed count.
 * @return {number} Previous odd count or current if at min.
 */
function getPreviousOddCount(current, min) {
  const prev = current - 2;
  return prev >= min ? prev : current;
}


/**
 * UnifiedRebalancer manages replica placement for both partitions and message groups.
 * Each partition/message group leader runs its own rebalancer instance.
 * Leaders make independent decisions that converge to optimal state.
 *
 * NOTE: This class delegates operation execution to RebalanceCoordinator.
 */
class UnifiedRebalancer extends EventEmitter {
  /**
   * Create a new UnifiedRebalancer instance.
   * @param {Object} options - Configuration options.
   * @param {string} options.entityId - Partition ID or message group ID.
   * @param {string} options.entityType - 'partition' or 'message_group'.
   * @param {Object} options.systemTableCache - Read-only system table cache.
   * @param {Object} options.cdcIntegrationService - CDC integration service for writes.
   * @param {Object} options.tablePolicyService - TablePolicyService for policy lookup.
   * @param {string} options.nodeId - Current node ID.
   * @param {Object} options.rebalanceCoordinator - RebalanceCoordinator for operation execution.
   */
  constructor(options = {}) {
    super();

    this.entityId = assertCritical(
      options.entityId,
      REBALANCER_ERROR_MSG.ENTITY_ID_REQUIRED,
    );
    this.entityType = assertCritical(
      options.entityType,
      REBALANCER_ERROR_MSG.ENTITY_TYPE_REQUIRED,
    );
    this.systemTableCache = assertCritical(
      options.systemTableCache,
      REBALANCER_ERROR_MSG.CACHE_REQUIRED,
    );
    this.cdcIntegrationService = assertCritical(
      options.cdcIntegrationService,
      REBALANCER_ERROR_MSG.CDC_REQUIRED,
    );
    this.tablePolicyService = assertCritical(
      options.tablePolicyService,
      REBALANCER_ERROR_MSG.POLICY_REQUIRED,
    );
    this.nodeId = assertCritical(
      options.nodeId,
      REBALANCER_ERROR_MSG.NODE_ID_REQUIRED,
    );
    this.messageRouter = assertCritical(
      options.messageRouter,
      REBALANCER_ERROR_MSG.ROUTER_REQUIRED,
    );
    this.sqlQueryEngine = options.sqlQueryEngine || null;

    // RebalanceCoordinator for delegated operation execution (Requirements 2.5)
    this.rebalanceCoordinator = assertCritical(
      options.rebalanceCoordinator,
      REBALANCER_ERROR_MSG.COORDINATOR_REQUIRED,
    );

    // Leadership state
    this.isLeader = false;

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.periodicCheckIntervalMs =
      config.get(REBALANCER_CONFIG_KEY.PERIODIC_CHECK_INTERVAL_MS) ||
      REBALANCER_DEFAULT.UNIFIED.PERIODIC_CHECK_INTERVAL_MS;
    this.periodicCheckJitterMs =
      config.get(REBALANCER_CONFIG_KEY.PERIODIC_CHECK_JITTER_MS) ||
      REBALANCER_DEFAULT.UNIFIED.PERIODIC_CHECK_JITTER_MS;
    this.criticalCheckDelayMs =
      config.get(REBALANCER_CONFIG_KEY.CRITICAL_CHECK_DELAY_MS) ||
      REBALANCER_DEFAULT.UNIFIED.CRITICAL_CHECK_DELAY_MS;
    this.maxConcurrentMoves =
      config.get(REBALANCER_CONFIG_KEY.MAX_CONCURRENT_MOVES) ||
      REBALANCER_DEFAULT.UNIFIED.MAX_CONCURRENT_MOVES;
    this.moveTimeoutMs =
      config.get(REBALANCER_CONFIG_KEY.MOVE_TIMEOUT_MS) ||
      REBALANCER_DEFAULT.UNIFIED.MOVE_TIMEOUT_MS;
    this.moveBatchSize =
      config.get(REBALANCER_CONFIG_KEY.MOVE_BATCH_SIZE) ||
      REBALANCER_DEFAULT.UNIFIED.MOVE_BATCH_SIZE;
    this.interBatchDelayMs =
      config.get(REBALANCER_CONFIG_KEY.INTER_BATCH_DELAY_MS) ||
      REBALANCER_DEFAULT.UNIFIED.INTER_BATCH_DELAY_MS;
    this.rebalanceBudget =
      config.get(REBALANCER_CONFIG_KEY.REBALANCE_BUDGET) ||
      REBALANCER_DEFAULT.UNIFIED.REBALANCE_BUDGET;
    this.criticalBudgetMultiplier =
      REBALANCER_DEFAULT.UNIFIED.CRITICAL_BUDGET_MULTIPLIER;
    this.nodeCpuThreshold =
      config.get(REBALANCER_CONFIG_KEY.NODE_CPU_THRESHOLD) ||
      REBALANCER_DEFAULT.UNIFIED.NODE_CPU_THRESHOLD;
    this.nodeMemoryThreshold =
      config.get(REBALANCER_CONFIG_KEY.NODE_MEMORY_THRESHOLD) ||
      REBALANCER_DEFAULT.UNIFIED.NODE_MEMORY_THRESHOLD;
    this.nodeDiskThreshold =
      config.get(REBALANCER_CONFIG_KEY.NODE_DISK_THRESHOLD) ||
      REBALANCER_DEFAULT.UNIFIED.NODE_DISK_THRESHOLD;
    this.enableReadinessPing =
      config.get(REBALANCER_CONFIG_KEY.READINESS_PING_ENABLED) ||
      REBALANCER_DEFAULT.UNIFIED.READINESS_PING_ENABLED;
    this.readinessPingTimeoutMs =
      config.get(REBALANCER_CONFIG_KEY.READINESS_PING_TIMEOUT_MS) ||
      REBALANCER_DEFAULT.UNIFIED.READINESS_PING_TIMEOUT_MS;

    // Stabilization period configuration (Requirements 2.1)
    const configuredStabilization =
      config.get(REBALANCER_CONFIG_KEY.STABILIZATION_PERIOD_MS);
    this.minStabilizationMs = REBALANCER_DEFAULT.UNIFIED.MIN_STABILIZATION_MS;
    this.maxStabilizationMs = REBALANCER_DEFAULT.UNIFIED.MAX_STABILIZATION_MS;
    this.defaultStabilizationMs = REBALANCER_DEFAULT.UNIFIED.DEFAULT_STABILIZATION_MS;
    // Clamp to valid range [1000ms, 10000ms] with default 1000ms
    this.stabilizationPeriodMs = this.clampStabilizationPeriod(
      configuredStabilization ?? this.defaultStabilizationMs,
    );

    // Stabilization state
    // Initialize to current time so rebalancer waits for stabilization period
    // before first check (prevents premature rebalancing during bootstrap)
    this.lastStateChangeTime = Date.now();
    this.stabilizationTimer = null;

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(REBALANCER_SUBSYSTEM.UNIFIED) : console;

    // State
    this.lastRebalanceTime = null;
    this.rebalanceCount = 0;
    this.lastDegradedTargetSignal = null;
    this.lastSuboptimalSignal = null;

    // Scheduler state
    this.scheduledCheck = null;
    this.currentInterval = this.periodicCheckIntervalMs;
    this.maxInterval = this.periodicCheckIntervalMs * 2;

    // Planning is delegated to MovePlanner (single-path planning).
    this.movePlanner = new MovePlanner({
      entityId: this.entityId,
      entityType: this.entityType,
      moveStateProvider: this,
    });

    this.isShuttingDown = false;
    this.initialized = false;
  }

  /**
   * Initialize the rebalancer.
   */
  initialize() {
    if (this.initialized) {
      return;
    }

    this.isShuttingDown = false;
    this.logger.info(REBALANCER_LOG_MSG.INITIALIZED, {
      entityId: this.entityId,
      entityType: this.entityType,
      nodeId: this.nodeId,
      usingCoordinator: !!this.rebalanceCoordinator,
    });

    this.initialized = true;
  }

  /**
   * Set the RebalanceCoordinator for delegated operation execution.
   * Requirements: 2.5
   * @param {Object} coordinator - RebalanceCoordinator instance.
   */
  setRebalanceCoordinator(coordinator) {
    this.rebalanceCoordinator = coordinator;

    this.logger.info(REBALANCER_LOG_MSG.COORDINATOR_SET, {
      entityId: this.entityId,
      entityType: this.entityType,
      hasCoordinator: !!coordinator,
    });
  }

  /**
   * Set leadership status.
   * @param {boolean} isLeader - Whether this instance is the leader.
   */
  setLeader(isLeader) {
    if (this.isShuttingDown) {
      this.isLeader = false;
      this.cancelScheduledCheck();
      return;
    }

    const wasLeader = this.isLeader;
    this.isLeader = isLeader;

    if (isLeader && !wasLeader) {
      this.logger.info(REBALANCER_LOG_MSG.LEADER_START, {
        entityId: this.entityId,
        entityType: this.entityType,
      });
      this.scheduleNextCheck();
    } else if (!isLeader && wasLeader) {
      this.logger.info(REBALANCER_LOG_MSG.LEADER_STOP, {
        entityId: this.entityId,
        entityType: this.entityType,
      });
      this.cancelScheduledCheck();
    }
  }

  /**
   * Get the policy for this entity.
   * @return {Promise<Object>} The applicable policy.
   */
  async getPolicy() {
    if (this.entityType === EntityType.MESSAGE_GROUP) {
      return this.getMessageGroupPolicy();
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
    // Message groups use a fixed policy
    return {...DEFAULT_MESSAGE_GROUP_POLICY};
  }

  /**
   * Clamp stabilization period to valid range [1000ms, 10000ms].
   * @param {number} value - Configured stabilization period.
   * @return {number} Clamped stabilization period.
   */
  clampStabilizationPeriod(value) {
    if (typeof value !== 'number' || isNaN(value)) {
      return this.defaultStabilizationMs;
    }
    return Math.max(this.minStabilizationMs, Math.min(this.maxStabilizationMs, value));
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
    this.lastStateChangeTime = Date.now();

    this.logger.debug(REBALANCER_LOG_MSG.STABILIZATION_RESET, {
      entityId: this.entityId,
      reason,
      stabilizationPeriodMs: this.stabilizationPeriodMs,
    });

    // Cancel any pending stabilization check
    if (this.stabilizationTimer) {
      clearTimeout(this.stabilizationTimer);
      this.stabilizationTimer = null;
    }

    // Schedule check after stabilization period
    if (this.isLeader) {
      this.stabilizationTimer = setTimeout(() => {
        this.stabilizationTimer = null;
        // Avoid unhandled rejections from timer-triggered checks during shutdown races.
        void this.checkRebalance().catch(() => {});
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
      return 0;
    }
    const elapsed = Date.now() - this.lastStateChangeTime;
    const remaining = this.stabilizationPeriodMs - elapsed;
    return Math.max(0, remaining);
  }

  /**
   * Validate and adjust replica count to be odd.
   * @param {number} count - Desired replica count.
   * @param {Object} policy - Policy with min/max constraints.
   * @return {number} Valid odd replica count.
   */
  validateReplicaCount(count, policy) {
    const min = policy.minReplicaCount || 3;
    const max = policy.maxReplicaCount || 7;

    // Ensure count is within bounds
    let adjusted = Math.max(min, Math.min(max, count));

    // Ensure count is odd
    if (!isOddReplicaCount(adjusted)) {
      adjusted = adjustToOddCount(adjusted, ADJUST_DIRECTION.UP);
      // If adjusting up exceeds max, adjust down
      if (adjusted > max) {
        adjusted = adjustToOddCount(count, ADJUST_DIRECTION.DOWN);
      }
    }

    return adjusted;
  }

  /**
   * Calculate target replica count based on policy and current state.
   * Supports growing/shrinking in odd increments (3→5→7 or 7→5→3).
   * @param {Array<Object>} currentReplicas - Current replicas.
   * @param {Object} policy - Applicable policy.
   * @return {number} Target replica count.
   */
  calculateTargetReplicaCount(currentReplicas, policy) {
    const healthyCount = this.getHealthyReplicas(currentReplicas).length;
    const targetCount = this.getPolicyTargetReplicaCount(policy);
    const minCount = policy.minReplicaCount || 3;
    const maxCount = policy.maxReplicaCount || 7;

    // Validate target is odd
    const validTarget = this.validateReplicaCount(targetCount, policy);

    // If we're below minimum, grow to minimum
    if (healthyCount < minCount) {
      return this.validateReplicaCount(minCount, policy);
    }

    // If we're above maximum, shrink to maximum
    if (healthyCount > maxCount) {
      return this.validateReplicaCount(maxCount, policy);
    }

    // If we need to grow, grow in odd increments
    if (healthyCount < validTarget) {
      // Grow by 2 (odd increment) until we reach target
      const nextCount = getNextOddCount(healthyCount, maxCount);
      return Math.min(nextCount, validTarget);
    }

    // If we need to shrink, shrink in odd increments
    if (healthyCount > validTarget) {
      // Shrink by 2 (odd decrement) until we reach target
      const prevCount = getPreviousOddCount(healthyCount, minCount);
      return Math.max(prevCount, validTarget);
    }

    return validTarget;
  }

  /**
   * Get desired replica target from policy.
   * @param {Object} policy - Applicable policy.
   * @return {number} Desired policy target.
   */
  getPolicyTargetReplicaCount(policy) {
    return policy.targetReplicaCount || policy.replicaCount || 3;
  }

  /**
   * Get actionable target based on currently available ready nodes.
   * @param {Object} policy - Applicable policy.
   * @param {Array<Object>} availableNodes - Ready nodes.
   * @return {number} Actionable target for current topology.
   */
  getActionableTargetReplicaCount(policy, availableNodes) {
    const desiredTarget = this.getPolicyTargetReplicaCount(policy);
    const availableCount = Array.isArray(availableNodes) ? availableNodes.length : 0;
    return Math.min(desiredTarget, availableCount);
  }

  /**
   * Apply policy to determine if rebalancing is needed.
   * @param {Object} policy - Policy to apply.
   * @return {Object} Rebalancing decision with reason.
   */
  applyPolicy(policy) {
    const currentReplicas = this.getCurrentReplicas();
    const healthyReplicas = this.getHealthyReplicas(currentReplicas);
    const availableNodes = this.getAvailableNodes();
    const actionableTarget = this.getActionableTargetReplicaCount(policy, availableNodes);
    const targetCount = this.calculateTargetReplicaCount(currentReplicas, policy);

    const decision = {
      needsRebalancing: false,
      reason: null,
      currentCount: healthyReplicas.length,
      targetCount,
      policy,
    };

    // Check if replica count needs adjustment
    if (healthyReplicas.length < actionableTarget) {
      decision.needsRebalancing = true;
      decision.reason = 'replica_count_below_target';
    } else if (healthyReplicas.length > targetCount) {
      decision.needsRebalancing = true;
      decision.reason = 'replica_count_above_target';
    }

    // Check placement constraints
    // But only if there are actually more nodes available to spread to
    if (policy.placementConstraints?.spreadAcrossNodes) {
      if (this.hasMultipleReplicasOnSameNode(healthyReplicas)) {
        const availableNodes = this.getAvailableNodes();
        // Filter out replicas without node_id (defensive check)
        const usedNodeIds = new Set(
          healthyReplicas.filter((r) => r && r.node_id).map((r) => r.node_id),
        );
        const unusedNodes = availableNodes.filter(
          (n) => n && n.node_id && !usedNodeIds.has(n.node_id),
        );

        // Only needs rebalancing if we can actually spread to other nodes
        if (unusedNodes.length > 0) {
          decision.needsRebalancing = true;
          decision.reason = decision.reason || 'replicas_not_spread';
        }
      }
    }

    // For message groups, check local access requirement
    if (this.entityType === EntityType.MESSAGE_GROUP && policy.ensureLocalAccess) {
      const nodesWithoutReplica = this.getNodesWithoutLocalReplica(currentReplicas);
      if (nodesWithoutReplica.length > 0) {
        decision.needsRebalancing = true;
        decision.reason = decision.reason || 'nodes_without_local_replica';
      }
    }

    return decision;
  }


  /**
   * Get all available nodes from the cache.
   * @return {Array<Object>} Array of active nodes.
   */
  getAvailableNodes() {
    const now = Date.now();
    return this.systemTableCache.filter('nodes', (node) => {
      return isNodeRecordReady(node, {
        now,
        requireActiveStatus: true,
      });
    });
  }

  /**
   * Check if a node is ready to receive replica operations.
   * @param {string} nodeId - Node ID.
   * @return {Promise<boolean>} True if ready.
   */
  async isNodeReady(nodeId) {
    return isNodeReadyWithTransport({
      nodeId,
      systemTableCache: this.systemTableCache,
      messageRouter: this.messageRouter,
      requireActiveStatus: true,
      requireOutboundQueue: true,
      enableReadinessPing: this.enableReadinessPing,
      readinessPingTimeoutMs: this.readinessPingTimeoutMs,
    });
  }

  /**
   * Get current replicas for this entity.
   * @return {Array<Object>} Array of replica objects.
   */
  getCurrentReplicas() {
    if (this.entityType === EntityType.MESSAGE_GROUP) {
      return this.systemTableCache.filter('services', (service) => {
        return service.group_id === this.entityId &&
          service.service_type === EntityType.MESSAGE_GROUP;
      });
    }

    // For partitions, get services with matching partition_id
    return this.systemTableCache.filter('services', (service) => {
      return service.partition_id === this.entityId &&
        service.service_type === EntityType.PARTITION;
    });
  }

  /**
   * Check if an operation row targets this rebalancer entity.
   * @param {Object} operation - replica_operations row.
   * @return {boolean} True when operation matches this entity.
   * @private
   */
  isOperationForEntity(operation) {
    const entityType = operation.entity_type || EntityType.PARTITION;
    const entityId = operation.entity_id || operation.partition_id;
    return entityType === this.entityType && entityId === this.entityId;
  }

  /**
   * Get in-flight replica operations for this entity.
   * @return {Array<Object>} Array of replica_operations rows in-flight.
   */
  getInFlightOperations() {
    return this.systemTableCache.filter(
      SystemTableName.REPLICA_OPERATIONS,
      (operation) => {
        if (TERMINAL_STATUSES.includes(operation.status)) {
          return false;
        }
        return this.isOperationForEntity(operation);
      },
    );
  }

  /**
   * Query configured rebalance budget.
   * Falls back to configured default when SQL is unavailable or key missing.
   * @return {Promise<number>} Configured budget.
   */
  async getConfiguredRebalanceBudget() {
    if (!this.sqlQueryEngine || !this.sqlQueryEngine.executeQuery) {
      return this.rebalanceBudget;
    }

    const result = await this.sqlQueryEngine.executeQuery(
      SQL_BUDGET.SELECT_REBALANCE_BUDGET,
      [REBALANCER_CONFIG_KEY.REBALANCE_BUDGET],
    );

    if (!result.success || !result.rows || result.rows.length === 0) {
      return this.rebalanceBudget;
    }

    const parsed = Number(result.rows[0].config_value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : this.rebalanceBudget;
  }

  /**
   * Query global in-flight operation count.
   * Falls back to local cache if SQL is unavailable.
   * @return {Promise<number>} In-flight operation count.
   */
  async getGlobalInFlightOperationCount() {
    if (!this.sqlQueryEngine || !this.sqlQueryEngine.executeQuery) {
      return this.getInFlightOperations().length;
    }

    const result = await this.sqlQueryEngine.executeQuery(
      SQL_BUDGET.SELECT_IN_FLIGHT_COUNT,
      [],
    );

    if (!result.success || !result.rows || result.rows.length === 0) {
      return 0;
    }

    const parsed = Number(result.rows[0].count);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  }

  /**
   * Check whether this rebalancer targets a critical system partition.
   * @return {boolean} True when entity is a critical system partition.
   * @private
   */
  isCriticalSystemPartition() {
    return this.entityType === EntityType.PARTITION &&
      CRITICAL_SYSTEM_PARTITION_IDS.has(this.entityId);
  }

  /**
   * Get healthy replicas (excluding failed or removed).
   * @param {Array<Object>} replicas - All replicas.
   * @return {Array<Object>} Healthy replicas only.
   */
  getHealthyReplicas(replicas) {
    const activeReplicas = replicas.filter((replica) => {
      const status = replica.status || ReplicaStatus.ACTIVE;
      return status === ReplicaStatus.ACTIVE;
    });

    // Align critical-partition health semantics with coordinator safety checks:
    // consider only routable non-learner replicas on ready nodes as healthy.
    if (!this.isCriticalSystemPartition()) {
      return activeReplicas;
    }

    const now = Date.now();
    const readyNodeIds = new Set(
      this.systemTableCache
        .filter(SystemTableName.NODES, (node) => {
          return isNodeRecordReady(node, {
            now,
            requireActiveStatus: true,
          });
        })
        .map((node) => node.node_id),
    );

    return activeReplicas.filter((replica) => {
      if (!replica?.node_id || !replica?.address) {
        return false;
      }
      const role = typeof replica.raft_role === 'string' ?
        replica.raft_role.toLowerCase() :
        null;
      if (!role || role === LEARNER_ROLE) {
        return false;
      }
      return readyNodeIds.has(replica.node_id);
    });
  }

  /**
   * Calculate target state based on policy.
   * @param {Array<Object>} currentReplicas - Current replica state.
   * @param {Object} policy - Applicable policy.
   * @return {Object} Target state with replica count and placement.
   */
  calculateTargetState(currentReplicas, policy) {
    return this.movePlanner.calculateTargetState(currentReplicas, policy);
  }

  /**
   * Calculate optimal placement for message groups.
   * Ensures every node has at least one local replica.
   * @param {Array<Object>} nodes - Available nodes.
   * @param {number} targetCount - Target replica count.
   * @param {Object} policy - Message group policy.
   * @return {Object} Target placement state.
   */
  calculateMessageGroupPlacement(nodes, targetCount, policy) {
    return this.movePlanner.calculateMessageGroupPlacement(
      nodes,
      targetCount,
      policy,
    );
  }

  /**
   * Calculate optimal placement for partitions.
   * @param {Array<Object>} nodes - Available nodes.
   * @param {number} targetCount - Target replica count.
   * @param {Object} policy - Table policy.
   * @return {Object} Target placement state.
   */
  calculatePartitionPlacement(nodes, targetCount, policy) {
    return this.movePlanner.calculatePartitionPlacement(nodes, targetCount, policy);
  }

  /**
   * Sort nodes by current load (prefer less loaded nodes).
   * @param {Array<Object>} nodes - Available nodes.
   * @return {Array<Object>} Sorted nodes.
   */
  sortNodesByLoad(nodes) {
    return this.movePlanner.sortNodesByLoad(nodes);
  }

  /**
   * Sort nodes by suitability based on policy constraints.
   * @param {Array<Object>} nodes - Available nodes.
   * @param {Object} policy - Policy with placement constraints.
   * @return {Array<Object>} Sorted nodes.
   */
  sortNodesBySuitability(nodes, policy) {
    return this.movePlanner.sortNodesBySuitability(nodes, policy);
  }

  /**
   * Calculate node load score.
   * @param {Object} node - Node object.
   * @return {number} Load score (0-300, lower is better).
   */
  calculateNodeLoad(node) {
    return this.movePlanner.calculateNodeLoad(node);
  }


  /**
   * Calculate moves needed to reach target state.
   * @param {Array<Object>} currentReplicas - Current replicas.
   * @param {Object} targetState - Target state.
   * @return {Array<Object>} Array of move operations.
   */
  calculateMoves(currentReplicas, targetState) {
    return this.movePlanner.calculateMoves(currentReplicas, targetState);
  }

  /**
   * Execute a single move operation via the coordinator.
   * Requirements: 2.5
   * @param {Object} move - Move operation to execute.
   * @return {Promise<Object>} Result of the move.
   */
  async executeMove(move) {
    if (this.isShuttingDown) {
      return {
        success: false,
        skipped: true,
        reason: 'shutdown_in_progress',
        operation: move?.type,
        nodeId: move?.nodeId,
        replicaId: move?.replicaId,
      };
    }

    this.logger.info(REBALANCER_LOG_MSG.EXECUTE_MOVE, {
      entityId: this.entityId,
      entityType: this.entityType,
      moveType: move.type,
      nodeId: move.nodeId,
      reason: move.reason,
      usingCoordinator: !!this.rebalanceCoordinator,
    });

    try {
      if (move?.nodeId) {
        const ready = await this.isNodeReady(move.nodeId);
        if (!ready) {
          this.logger.debug(REBALANCER_LOG_MSG.SKIP_UNREADY_NODE, {
            entityId: this.entityId,
            nodeId: move.nodeId,
            moveType: move.type,
          });
          return {
            success: false,
            skipped: true,
            reason: 'node_not_ready',
            operation: move.type,
            nodeId: move.nodeId,
            replicaId: move.replicaId,
          };
        }
      }

      if (!this.rebalanceCoordinator) {
        throw new Error(REBALANCER_ERROR_MSG.COORDINATOR_REQUIRED);
      }

      return await this.executeMoveViaCoordinator(move);
    } catch (error) {
      this.logger.error(REBALANCER_LOG_MSG.MOVE_FAILED, {
        entityId: this.entityId,
        moveType: move.type,
        nodeId: move.nodeId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Execute a move via the RebalanceCoordinator.
   * The coordinator owns operation state tracking.
   * Requirements: 2.5
   * @param {Object} move - Move operation to execute.
   * @return {Promise<Object>} Result of the move.
   * @private
   */
  async executeMoveViaCoordinator(move) {
    if (this.isShuttingDown) {
      return {
        success: false,
        skipped: true,
        reason: 'shutdown_in_progress',
        operation: move?.type,
        nodeId: move?.nodeId,
        replicaId: move?.replicaId,
      };
    }

    const safetyError =
      await this.rebalanceCoordinator.getMoveSafetyError({
        ...move,
        partitionId: move.partitionId || this.entityId,
        entityType: move.entityType || this.entityType,
        entityId: move.entityId || this.entityId,
      });
    if (safetyError) {
      this.logger.debug(REBALANCER_LOG_MSG.MOVE_BLOCKED_BY_SAFETY_POLICY, {
        entityId: this.entityId,
        entityType: this.entityType,
        partitionId: this.entityId,
        moveType: move.type,
        nodeId: move.nodeId,
        replicaId: move.replicaId,
        error: safetyError,
      });
      return {
        success: false,
        skipped: true,
        reason: REBALANCER_SKIP_REASON.SAFETY_BLOCKED,
        operation: move.type,
        nodeId: move.nodeId,
        replicaId: move.replicaId,
        error: safetyError,
      };
    }

    let operationType = null;
    if (move.type === MoveType.ADD) {
      operationType = OperationType.ADD;
    } else if (move.type === MoveType.REMOVE) {
      operationType = OperationType.REMOVE;
    } else if (move.type === MoveType.REPLACE) {
      operationType = OperationType.REPLACE;
    } else {
      throw new Error(`Unsupported move type: ${move.type}`);
    }

    // Create operation record via coordinator
    const operation = await this.rebalanceCoordinator.createOperation({
      type: operationType,
      partitionId: this.entityId,
      entityType: this.entityType,
      entityId: this.entityId,
      nodeId: move.nodeId,
      replicaId: move.replicaId,
      sourceNodeId: move.sourceNodeId,
    });

    return {
      success: true,
      replicaId: move.replicaId || operation.replicaId,
      nodeId: move.nodeId,
      operationId: operation.operationId,
      operation: move.type,
      status: 'scheduled',
    };
  }

  /**
   * Check if a replica has a pending move operation.
   * @param {string} replicaId - Replica ID to check.
   * @return {boolean} True if replica has pending move.
   */
  hasPendingMove(replicaId) {
    const inFlightOps = this.getInFlightOperations();
    if (inFlightOps.some((op) => op.replica_id === replicaId)) {
      return true;
    }
    return false;
  }

  /**
   * Check if a node has a pending ADD move for this entity.
   * @param {string} nodeId - Node ID to check.
   * @return {boolean} True if node has pending ADD move.
   */
  hasPendingAddForNode(nodeId) {
    const inFlightOps = this.getInFlightOperations();
    if (inFlightOps.some((op) =>
      op.target_node_id === nodeId &&
      (op.type === OperationType.ADD || op.type === OperationType.REPLACE),
    )) {
      return true;
    }
    return false;
  }

  /**
   * Group moves by target node ID.
   * @param {Array<Object>} moves - Move operations.
   * @return {Map<string|null, Array<Object>>} Grouped moves by node ID.
   * @private
   */
  groupMovesByTargetNode(moves) {
    const grouped = new Map();
    for (const move of moves) {
      const nodeId = move?.nodeId || null;
      if (!grouped.has(nodeId)) {
        grouped.set(nodeId, []);
      }
      grouped.get(nodeId).push(move);
    }
    return grouped;
  }

  /**
   * Execute move operations with per-node batching and backpressure.
   * @param {Array<Object>} moves - Move operations.
   * @return {Promise<Array<Object>>} Execution results.
   * @private
   */
  async executeRebalancingMoves(moves) {
    if (this.isShuttingDown) {
      return [];
    }

    const results = [];
    const batchSize = Number.isFinite(this.moveBatchSize) && this.moveBatchSize > 0 ?
      Math.floor(this.moveBatchSize) : 1;
    const interBatchDelayMs = Number.isFinite(this.interBatchDelayMs) &&
      this.interBatchDelayMs > 0 ? this.interBatchDelayMs : 0;
    const readinessByNodeId = new Map();
    const isNodeReadyCached = async (nodeId) => {
      if (!nodeId) {
        return true;
      }
      if (readinessByNodeId.has(nodeId)) {
        return readinessByNodeId.get(nodeId);
      }
      const ready = await this.isNodeReady(nodeId);
      readinessByNodeId.set(nodeId, ready);
      return ready;
    };

    const movesToExecute = [];
    const blockedAddNodeIds = new Set();
    for (const move of moves) {
      if (this.isShuttingDown) {
        return results;
      }
      if ((move?.type === MoveType.ADD || move?.type === MoveType.REPLACE) &&
          move?.nodeId) {
        const addTargetReady = await isNodeReadyCached(move.nodeId);
        if (!addTargetReady) {
          blockedAddNodeIds.add(move.nodeId);
        }
      }
    }

    for (const move of moves) {
      if (this.isShuttingDown) {
        return results;
      }
      const isDeferrableRemove = move?.type === MoveType.REMOVE &&
        move?.reason !== 'replica_failed';
      if (blockedAddNodeIds.size > 0 && isDeferrableRemove) {
        results.push({
          success: false,
          skipped: true,
          reason: REBALANCER_SKIP_REASON.AWAITING_READY_ADD_CAPACITY,
          operation: move.type,
          nodeId: move.nodeId,
          replicaId: move.replicaId,
        });
        continue;
      }
      movesToExecute.push(move);
    }

    const groupedMoves = this.groupMovesByTargetNode(movesToExecute);

    for (const [nodeId, nodeMoves] of groupedMoves.entries()) {
      if (this.isShuttingDown) {
        break;
      }
      if (nodeId) {
        const ready = await isNodeReadyCached(nodeId);
        if (!ready) {
          this.logger.debug(REBALANCER_LOG_MSG.SKIP_BATCH_UNREADY, {
            entityId: this.entityId,
            nodeId,
            moveCount: nodeMoves.length,
          });
          for (const move of nodeMoves) {
            results.push({
              success: false,
              skipped: true,
              reason: 'node_not_ready',
              operation: move.type,
              nodeId: move.nodeId,
              replicaId: move.replicaId,
            });
          }
          continue;
        }
      }

      for (let i = 0; i < nodeMoves.length; i += batchSize) {
        if (this.isShuttingDown) {
          break;
        }
        const batch = nodeMoves.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map((move) => {
          return this.executeMove(move);
        }));

        results.push(...batchResults);

        if (nodeId) {
          const stillReady = await this.isNodeReady(nodeId);
          if (!stillReady) {
            this.logger.debug(REBALANCER_LOG_MSG.NODE_DISCONNECTED_BATCH, {
              entityId: this.entityId,
              nodeId,
              remainingMoves: nodeMoves.length - (i + batch.length),
            });
            const remainingMoves = nodeMoves.slice(i + batch.length);
            for (const move of remainingMoves) {
              results.push({
                success: false,
                skipped: true,
                reason: 'node_not_ready',
                operation: move.type,
                nodeId: move.nodeId,
                replicaId: move.replicaId,
              });
            }
            break;
          }
        }

        if (interBatchDelayMs > 0 && i + batchSize < nodeMoves.length) {
          await new Promise((resolve) => setTimeout(resolve, interBatchDelayMs));
        }
      }
    }

    return results;
  }

  /**
   * Main rebalancing entry point.
   * @param {string} trigger - What triggered the rebalance.
   * @param {Object} policy - Optional policy override.
   * @return {Promise<Object>} Rebalancing result.
   */
  async rebalance(trigger = TriggerType.PERIODIC, policy = null) {
    if (this.isShuttingDown) {
      return {success: false, skipped: true, reason: 'shutdown_in_progress'};
    }

    if (!this.isLeader) {
      this.logger.debug(REBALANCER_LOG_MSG.NOT_LEADER_SKIP, {
        entityId: this.entityId,
      });
      return {success: false, reason: 'not_leader'};
    }

    const effectivePolicy = policy || await this.getPolicy();
    const currentReplicas = this.getCurrentReplicas();
    const availableNodes = this.getAvailableNodes();
    if (availableNodes.length === 0) {
      this.logger.debug(REBALANCER_LOG_MSG.NO_AVAILABLE_NODES, {
        entityId: this.entityId,
        entityType: this.entityType,
      });
      return {success: false, reason: 'no_available_nodes'};
    }

    const targetState = this.movePlanner.calculateTargetState(
      currentReplicas,
      effectivePolicy,
    );
    const moves = this.movePlanner.calculateMoves(currentReplicas, targetState);

    if (moves.length === 0) {
      this.logger.debug(REBALANCER_LOG_MSG.NO_REBALANCE_NEEDED, {
        entityId: this.entityId,
        currentCount: currentReplicas.length,
        targetCount: targetState.targetReplicaCount,
      });
      return {success: true, moves: [], reason: 'no_changes_needed'};
    }

    let availableBudget = this.maxConcurrentMoves;
    try {
      const configuredBudget = await this.getConfiguredRebalanceBudget();
      const inFlightCount = await this.getGlobalInFlightOperationCount();
      const isCritical = this.isCriticalState(
        currentReplicas,
        effectivePolicy,
        availableNodes,
      );
      const effectiveBudget = isCritical ?
        configuredBudget * this.criticalBudgetMultiplier :
        configuredBudget;

      availableBudget = Math.max(0, effectiveBudget - inFlightCount);
      if (availableBudget <= 0) {
        return {
          success: true,
          skipped: true,
          reason: REBALANCER_SKIP_REASON.BUDGET_EXCEEDED,
          moves: [],
        };
      }
    } catch (error) {
      this.logger.warn(REBALANCER_LOG_MSG.REBALANCE_ERROR, {
        entityId: this.entityId,
        error: error.message,
      });
      return {
        success: false,
        skipped: true,
        reason: REBALANCER_SKIP_REASON.BUDGET_QUERY_FAILED,
        moves: [],
      };
    }

    this.logger.info(REBALANCER_LOG_MSG.START_REBALANCE, {
      entityId: this.entityId,
      entityType: this.entityType,
      trigger,
      moveCount: moves.length,
      currentCount: currentReplicas.length,
      targetCount: targetState.targetReplicaCount,
    });

    const moveLimit = Math.max(0, Math.min(this.maxConcurrentMoves, availableBudget));
    const limitedMoves = moves.slice(0, moveLimit);
    const results = await this.executeRebalancingMoves(limitedMoves);

    this.lastRebalanceTime = Date.now();
    this.rebalanceCount++;

    this.emit(REBALANCER_EVENT.REBALANCE_COMPLETE, {
      entityId: this.entityId,
      entityType: this.entityType,
      trigger,
      results,
    });

    return {
      success: true,
      moves: results,
      trigger,
      timestamp: this.lastRebalanceTime,
    };
  }


  /**
   * Schedule the next periodic check.
   */
  scheduleNextCheck() {
    if (!this.isLeader || this.isShuttingDown) {
      return;
    }

    // Add jitter: ±25% of interval to spread load
    const jitter = this.periodicCheckJitterMs * (Math.random() - 0.5) * 2;
    const delay = Math.max(1000, this.currentInterval + jitter);

    this.scheduledCheck = setTimeout(() => {
      // Avoid unhandled rejections from timer-triggered checks during shutdown races.
      void this.checkRebalance().catch(() => {});
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
   * Perform a rebalance check.
   * Requirements: 2.2, 2.3, 2.4
   * @return {Promise<void>}
   */
  async checkRebalance() {
    if (!this.isLeader || this.isShuttingDown) {
      return;
    }

    try {
      // Check if we're still in stabilization period (Requirements 2.2, 2.3)
      if (!this.isStabilized()) {
        this.logger.debug(REBALANCER_LOG_MSG.WAIT_STABILIZATION, {
          entityId: this.entityId,
          timeUntilStabilized: this.getTimeUntilStabilized(),
        });
        // Schedule next check after stabilization completes
        this.scheduleNextCheck();
        return;
      }

      // Re-evaluate state after stabilization (Requirement 2.4)
      const needsRebalance = await this.evaluateState();

      if (needsRebalance) {
        const rebalanceResult = await this.rebalance(TriggerType.PERIODIC);
        const executedMoveCount = this.countExecutedMoves(rebalanceResult);

        if (executedMoveCount > 0) {
          // Reset interval only when work was actually scheduled/executed.
          this.currentInterval = this.periodicCheckIntervalMs;
        } else {
          // No actionable work (all skipped/blocked); back off to reduce CPU/log churn.
          this.currentInterval = Math.min(
            this.currentInterval * 1.5,
            this.maxInterval,
          );
        }
      } else {
        // Exponential backoff if stable - check less frequently
        this.currentInterval = Math.min(
          this.currentInterval * 1.5,
          this.maxInterval,
        );
      }
    } catch (error) {
      this.logger.error(REBALANCER_LOG_MSG.REBALANCE_ERROR, {
        entityId: this.entityId,
        error: error.message,
      });
      throw error;
    }

    // Schedule next check
    if (!this.isShuttingDown) {
      this.scheduleNextCheck();
    }
  }

  /**
   * Count moves that actually scheduled work (not skipped/deferred).
   * @param {Object} rebalanceResult - Result from rebalance().
   * @return {number} Number of actionable moves.
   * @private
   */
  countExecutedMoves(rebalanceResult) {
    if (!rebalanceResult || !Array.isArray(rebalanceResult.moves)) {
      return 0;
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
    const desiredTarget = this.getPolicyTargetReplicaCount(policy);
    const actionableTarget = this.getActionableTargetReplicaCount(
      policy,
      availableNodes,
    );

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
    if (availableNodes.length === 0) {
      this.logger.debug(REBALANCER_LOG_MSG.NO_AVAILABLE_NODES, {
        entityId: this.entityId,
        entityType: this.entityType,
      });
      this.lastSuboptimalSignal = null;
      return false;
    }

    const healthyReplicas = this.getHealthyReplicas(currentReplicas);
    if (availableNodes.length < desiredTarget &&
        healthyReplicas.length >= actionableTarget) {
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
    if (this.isCriticalState(currentReplicas, policy, availableNodes)) {
      this.lastSuboptimalSignal = null;
      this.logger.warn(REBALANCER_LOG_MSG.CRITICAL_STATE, {
        entityId: this.entityId,
        entityType: this.entityType,
        reason: this.getCriticalReason(currentReplicas, policy, availableNodes),
      });
      return true;
    }

    // Opportunistic checks - can wait for periodic schedule
    if (this.isSuboptimalState(currentReplicas, policy, availableNodes)) {
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
    return `${nodeSignature}|${desiredTarget}|${actionableTarget}|` +
      `${healthyReplicaCount}`;
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
    return `${nodeSignature}|${desiredTarget}|${actionableTarget}|` +
      `${healthyReplicaCount}`;
  }

  /**
   * Check if current state is critical (requires immediate action).
   * @param {Array<Object>} replicas - Current replicas.
   * @param {Object} policy - Applicable policy.
   * @return {boolean} True if state is critical.
   */
  isCriticalState(replicas, policy, availableNodes = null) {
    const healthyReplicas = this.getHealthyReplicas(replicas);
    const readyNodes = Array.isArray(availableNodes) ?
      availableNodes :
      this.getAvailableNodes();
    const minReplicas = policy.minReplicaCount || 3;

    // Critical: Below minimum replica count
    if (healthyReplicas.length < minReplicas &&
        readyNodes.length >= minReplicas) {
      return true;
    }

    // Critical: Message group has no local replica on some node
    if (this.entityType === EntityType.MESSAGE_GROUP && policy.ensureLocalAccess) {
      const nodesWithoutLocalReplica = this.getNodesWithoutLocalReplica(replicas);
      if (nodesWithoutLocalReplica.length > 0) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get the reason for critical state.
   * @param {Array<Object>} replicas - Current replicas.
   * @param {Object} policy - Applicable policy.
   * @return {string} Reason description.
   */
  getCriticalReason(replicas, policy, availableNodes = null) {
    const healthyReplicas = this.getHealthyReplicas(replicas);
    const readyNodes = Array.isArray(availableNodes) ?
      availableNodes :
      this.getAvailableNodes();
    const minReplicas = policy.minReplicaCount || 3;

    if (healthyReplicas.length < minReplicas &&
        readyNodes.length >= minReplicas) {
      return `replica_count_below_minimum: ${healthyReplicas.length} < ${minReplicas}`;
    }

    if (this.entityType === EntityType.MESSAGE_GROUP && policy.ensureLocalAccess) {
      const nodesWithoutLocalReplica = this.getNodesWithoutLocalReplica(replicas);
      if (nodesWithoutLocalReplica.length > 0) {
        return `nodes_without_local_replica: ${nodesWithoutLocalReplica.join(', ')}`;
      }
    }

    return 'unknown';
  }

  /**
   * Check if current state is suboptimal (can be improved).
   * @param {Array<Object>} replicas - Current replicas.
   * @param {Object} policy - Applicable policy.
   * @return {boolean} True if state is suboptimal.
   */
  isSuboptimalState(replicas, policy, availableNodes = null) {
    const targetCount = this.getPolicyTargetReplicaCount(policy);
    const healthyReplicas = this.getHealthyReplicas(replicas);
    const readyNodes = Array.isArray(availableNodes) ?
      availableNodes :
      this.getAvailableNodes();
    const actionableTarget = this.getActionableTargetReplicaCount(policy, readyNodes);

    // Suboptimal: Not at target replica count
    if (healthyReplicas.length < actionableTarget ||
        healthyReplicas.length > targetCount) {
      return true;
    }

    // Suboptimal: Replicas not spread across nodes
    // But only if there are actually more nodes available to spread to
    if (policy.placementConstraints?.spreadAcrossNodes) {
      if (this.hasMultipleReplicasOnSameNode(healthyReplicas)) {
        // Check if there are more nodes available than currently used
        // Filter out replicas without node_id (defensive check)
        const availableNodes = this.getAvailableNodes();
        const usedNodeIds = new Set(
          healthyReplicas.filter((r) => r && r.node_id).map((r) => r.node_id),
        );
        const unusedNodes = availableNodes.filter(
          (n) => n && n.node_id && !usedNodeIds.has(n.node_id),
        );

        // Only suboptimal if we can actually spread to other nodes
        if (unusedNodes.length > 0) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check if multiple replicas are on the same node.
   * @param {Array<Object>} replicas - Replicas to check.
   * @return {boolean} True if duplicates exist.
   */
  hasMultipleReplicasOnSameNode(replicas) {
    // Filter out replicas without node_id (defensive check)
    const nodeIds = replicas
      .filter((r) => r && r.node_id)
      .map((r) => r.node_id);
    if (nodeIds.length === 0) {
      return false;
    }
    const uniqueNodeIds = new Set(nodeIds);
    return uniqueNodeIds.size < nodeIds.length;
  }

  /**
   * Get nodes that don't have a local replica.
   * @param {Array<Object>} replicas - Current replicas.
   * @return {Array<string>} Node IDs without local replicas.
   */
  getNodesWithoutLocalReplica(replicas) {
    const allNodes = this.getAvailableNodes();
    // Filter out replicas without node_id (defensive check)
    const nodesWithReplicas = new Set(
      replicas.filter((r) => r && r.node_id).map((r) => r.node_id),
    );

    return allNodes
      .filter((node) => node && node.node_id && !nodesWithReplicas.has(node.node_id))
      .map((node) => node.node_id);
  }

  /**
   * Trigger immediate check (called by CDC event handlers).
   * @param {string} reason - Reason for immediate check.
   */
  triggerImmediateCheck(reason) {
    if (!this.isLeader) {
      return;
    }

    this.logger.info(REBALANCER_LOG_MSG.IMMEDIATE_TRIGGER, {
      entityId: this.entityId,
      entityType: this.entityType,
      reason,
    });

    // Cancel pending scheduled check
    this.cancelScheduledCheck();

    // Execute check after short delay (to batch rapid events)
    // Track this timeout so it can be cancelled on shutdown
    this.scheduledCheck = setTimeout(() => {
      // Avoid unhandled rejections from timer-triggered checks during shutdown races.
      void this.checkRebalance().catch(() => {});
    }, this.criticalCheckDelayMs);
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

    // Determine if rebalancing is needed based on state transition
    let rebalanceNeeded = false;
    let reason = null;

    // Node became ready - may need to rebalance to use this node
    if (newState === NodeStatus.ACTIVE && oldState !== NodeStatus.ACTIVE) {
      rebalanceNeeded = true;
      reason = 'node_became_ready';
    }

    // Node left active state - may need to relocate replicas
    if (oldState === NodeStatus.ACTIVE && newState !== NodeStatus.ACTIVE) {
      rebalanceNeeded = true;
      reason = 'node_left_ready';
    }

    // Node failed - critical, need immediate action
    if (newState === NodeStatus.FAILED) {
      rebalanceNeeded = true;
      reason = 'node_failed';
    }

    if (rebalanceNeeded) {
      // Record state change to reset stabilization timer
      if (newState === NodeStatus.FAILED) {
        this.recordStateChange(
          STABILIZATION_RESET_TRIGGER.NODE_FAILED,
        );
      } else if (
        newState === NodeStatus.ACTIVE &&
        oldState !== NodeStatus.ACTIVE
      ) {
        this.recordStateChange(
          STABILIZATION_RESET_TRIGGER.NODE_JOINED,
        );
      } else if (
        oldState === NodeStatus.ACTIVE &&
        newState !== NodeStatus.ACTIVE
      ) {
        this.recordStateChange(
          STABILIZATION_RESET_TRIGGER.NODE_LEFT,
        );
      }

      // Emit rebalanceNeeded event for observability
      this.emit(REBALANCER_EVENT.REBALANCE_NEEDED, {
        nodeId,
        oldState,
        newState,
        reason,
        timestamp: Date.now(),
      });

      this.triggerImmediateCheck(reason);
    }
  }

  /**
   * Handle CDC event for potential rebalancing trigger.
   * @param {Object} event - CDC event.
   */
  onCDCEvent(event) {
    if (!this.isLeader) {
      return;
    }

    // Check if this is a critical event requiring immediate action
    if (this.isCriticalCDCEvent(event)) {
      // Reset stabilization timer for critical state changes
      if (event.tableName === 'services' &&
          event.data?.status === ReplicaStatus.FAILED) {
        this.recordStateChange(
          STABILIZATION_RESET_TRIGGER.REPLICA_FAILED,
        );
      } else if (event.tableName === 'nodes' &&
          event.data?.status === NodeStatus.FAILED) {
        this.recordStateChange(
          STABILIZATION_RESET_TRIGGER.NODE_FAILED,
        );
      }
      this.triggerImmediateCheck(event.type || 'cdc_event');
    }
    // Otherwise, let the periodic check handle it
  }

  /**
   * Check if a CDC event is critical.
   * @param {Object} event - CDC event.
   * @return {boolean} True if event is critical.
   */
  isCriticalCDCEvent(event) {
    // Node failure is critical
    if (event.tableName === 'nodes' &&
        event.operation === 'UPDATE' &&
        event.data?.status === NodeStatus.FAILED) {
      return this.affectsMyReplicas(event);
    }

    // Service failure is critical
    if (event.tableName === 'services' &&
        event.operation === 'UPDATE' &&
        event.data?.status === ReplicaStatus.FAILED) {
      return event.data?.partition_id === this.entityId ||
        event.data?.group_id === this.entityId;
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

    // Include coordinator stats if available
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
    // Clear stabilization timer
    if (this.stabilizationTimer) {
      clearTimeout(this.stabilizationTimer);
      this.stabilizationTimer = null;
    }
    this.lastStateChangeTime = null;
    this.initialized = false;

    this.logger.info(REBALANCER_LOG_MSG.SHUTDOWN, {
      entityId: this.entityId,
      entityType: this.entityType,
    });
  }
}

export {
  UnifiedRebalancer,
  EntityType,
  TriggerType,
  MoveType,
  ReplicaStatus,
  NodeStatus,
  DEFAULT_TABLE_POLICY,
  DEFAULT_MESSAGE_GROUP_POLICY,
  isOddReplicaCount,
  adjustToOddCount,
  getNextOddCount,
  getPreviousOddCount,
};
