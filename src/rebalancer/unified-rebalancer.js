/**
 * Unified Rebalancer - Manages replica placement for partitions and message groups.
 * Uses the same algorithm for all scenarios, driven by policies.
 * Operates fully autonomously - operators never manually specify replica placement.
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.10
 */

import {EventEmitter} from 'events';
import {v4 as uuidv4} from 'uuid';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {SystemTableName} from '../bootstrap/system-table-schemas-constants.js';
import {ReplicaStatus} from './replica-status.js';
import {assertCritical} from '../utils/assert.js';
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
  REBALANCER_SUBSYSTEM,
  REBALANCER_TRIGGER,
} from './rebalancer-constants.js';

const EntityType = REBALANCER_ENTITY_TYPE;

const TriggerType = REBALANCER_TRIGGER;

const MoveType = REBALANCER_MOVE_TYPE;

const NodeStatus = REBALANCER_NODE_STATUS;

const DEFAULT_TABLE_POLICY = REBALANCER_DEFAULT_POLICY.TABLE;

const DEFAULT_MESSAGE_GROUP_POLICY = REBALANCER_DEFAULT_POLICY.MESSAGE_GROUP;

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
 * @param {string} direction - 'up' or 'down'.
 * @return {number} Adjusted odd replica count.
 */
function adjustToOddCount(count, direction = 'up') {
  if (isOddReplicaCount(count)) {
    return count;
  }
  return direction === 'up' ? count + 1 : count - 1;
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

    // Scheduler state
    this.scheduledCheck = null;
    this.currentInterval = this.periodicCheckIntervalMs;
    this.maxInterval = this.periodicCheckIntervalMs * 2;

    this.initialized = false;
  }

  /**
   * Initialize the rebalancer.
   */
  initialize() {
    if (this.initialized) {
      return;
    }

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
   * @return {Object} The applicable policy.
   */
  getPolicy() {
    if (this.entityType === EntityType.MESSAGE_GROUP) {
      return this.getMessageGroupPolicy();
    }
    return this.getTablePolicy();
  }

  /**
   * Get table policy for a partition.
   * Uses TablePolicyService for policy lookup.
   * @return {Object} Table policy.
   */
  getTablePolicy() {
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
        this.checkRebalance();
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
      adjusted = adjustToOddCount(adjusted, 'up');
      // If adjusting up exceeds max, adjust down
      if (adjusted > max) {
        adjusted = adjustToOddCount(count, 'down');
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
    const targetCount = policy.targetReplicaCount || policy.replicaCount || 3;
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
   * Apply policy to determine if rebalancing is needed.
   * @param {Object} policy - Policy to apply.
   * @return {Object} Rebalancing decision with reason.
   */
  applyPolicy(policy) {
    const currentReplicas = this.getCurrentReplicas();
    const healthyReplicas = this.getHealthyReplicas(currentReplicas);
    const targetCount = this.calculateTargetReplicaCount(currentReplicas, policy);

    const decision = {
      needsRebalancing: false,
      reason: null,
      currentCount: healthyReplicas.length,
      targetCount,
      policy,
    };

    // Check if replica count needs adjustment
    if (healthyReplicas.length !== targetCount) {
      decision.needsRebalancing = true;
      decision.reason = healthyReplicas.length < targetCount ?
        'replica_count_below_target' : 'replica_count_above_target';
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
      const leaseValid = node.ready_lease_expires_at &&
        node.ready_lease_expires_at > now;
      return node.status === NodeStatus.ACTIVE &&
        node.ws_connection_state === 'ready' &&
        leaseValid;
    });
  }

  /**
   * Check if a node is ready to receive replica operations.
   * @param {string} nodeId - Node ID.
   * @return {Promise<boolean>} True if ready.
   */
  async isNodeReady(nodeId) {
    const node = this.systemTableCache.get('nodes', nodeId);
    if (!node || node.ws_connection_state !== 'ready') {
      return false;
    }

    const leaseValid = node.ready_lease_expires_at &&
      node.ready_lease_expires_at > Date.now();
    if (!leaseValid) {
      return false;
    }

    if (!this.messageRouter || !this.messageRouter.getConnectionState) {
      return false;
    }

    const connectionState = this.messageRouter.getConnectionState(nodeId);
    if (connectionState !== 'connected') {
      return false;
    }

    if (this.messageRouter.isOutboundQueueAvailable &&
        !this.messageRouter.isOutboundQueueAvailable(nodeId)) {
      return false;
    }

    if (this.enableReadinessPing && this.messageRouter.pingNode) {
      const ok = await this.messageRouter.pingNode(nodeId, this.readinessPingTimeoutMs);
      if (!ok) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get current replicas for this entity.
   * @return {Array<Object>} Array of replica objects.
   */
  getCurrentReplicas() {
    const _tableName = this.entityType === EntityType.MESSAGE_GROUP ?
      'message_groups' : 'services';

    if (this.entityType === EntityType.MESSAGE_GROUP) {
      const group = this.systemTableCache.get('message_groups', this.entityId);
      if (!group || !group.replicas) {
        return [];
      }
      try {
        return typeof group.replicas === 'string' ?
          JSON.parse(group.replicas) : group.replicas;
      } catch (_e) {
        return [];
      }
    }

    // For partitions, get services with matching partition_id
    return this.systemTableCache.filter('services', (service) => {
      return service.partition_id === this.entityId &&
        service.service_type === 'partition';
    });
  }

  /**
   * Get in-flight replica operations for this partition.
   * @return {Array<Object>} Array of replica_operations rows in-flight.
   */
  getInFlightOperations() {
    if (this.entityType !== EntityType.PARTITION) {
      return [];
    }

    const terminalStatuses = [
      ReplicaStatus.ACTIVE,
      ReplicaStatus.REMOVED,
      ReplicaStatus.FAILED,
    ];

    return this.systemTableCache.filter(
      SystemTableName.REPLICA_OPERATIONS,
      (operation) =>
        operation.partition_id === this.entityId &&
        !terminalStatuses.includes(operation.status),
    );
  }

  /**
   * Get healthy replicas (excluding failed or removed).
   * @param {Array<Object>} replicas - All replicas.
   * @return {Array<Object>} Healthy replicas only.
   */
  getHealthyReplicas(replicas) {
    return replicas.filter((replica) => {
      const status = replica.status || ReplicaStatus.ACTIVE;
      return status === ReplicaStatus.ACTIVE;
    });
  }

  /**
   * Calculate target state based on policy.
   * @param {Array<Object>} currentReplicas - Current replica state.
   * @param {Object} policy - Applicable policy.
   * @return {Object} Target state with replica count and placement.
   */
  calculateTargetState(currentReplicas, policy) {
    const nodes = this.getAvailableNodes();
    const targetReplicaCount = policy.targetReplicaCount || policy.replicaCount || 3;

    // For message groups: ensure every node has local access
    if (this.entityType === EntityType.MESSAGE_GROUP && policy.ensureLocalAccess) {
      return this.calculateMessageGroupPlacement(nodes, targetReplicaCount, policy);
    }

    // For partitions: spread across nodes by policy
    return this.calculatePartitionPlacement(nodes, targetReplicaCount, policy);
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
    const targetNodes = [];

    // No available nodes: we cannot place any replicas.
    if (!nodes || nodes.length === 0) {
      return {
        targetReplicaCount: 0,
        targetNodes: [],
        maxReplicaCount: policy.maxReplicaCount || 5,
      };
    }

    // First, ensure we have replicas spread across nodes
    if (policy.placementConstraints?.spreadAcrossNodes) {
      // Sort nodes by current replica load (prefer less loaded nodes)
      const sortedNodes = this.sortNodesByLoad(nodes);

      if (sortedNodes.length === 0) {
        return {
          targetReplicaCount: 0,
          targetNodes: [],
          maxReplicaCount: policy.maxReplicaCount || 5,
        };
      }

      // Select target nodes
      for (let i = 0; i < Math.min(targetCount, sortedNodes.length); i++) {
        targetNodes.push(sortedNodes[i].node_id);
      }

      // If we have fewer nodes than target count, duplicate on existing nodes
      while (targetNodes.length < targetCount) {
        const nodeIndex = targetNodes.length % sortedNodes.length;
        targetNodes.push(sortedNodes[nodeIndex].node_id);
      }
    }

    return {
      targetReplicaCount: targetCount,
      targetNodes,
      maxReplicaCount: policy.maxReplicaCount || 5,
    };
  }

  /**
   * Calculate optimal placement for partitions.
   * @param {Array<Object>} nodes - Available nodes.
   * @param {number} targetCount - Target replica count.
   * @param {Object} policy - Table policy.
   * @return {Object} Target placement state.
   */
  calculatePartitionPlacement(nodes, targetCount, policy) {
    const targetNodes = [];

    // Sort nodes by suitability based on policy constraints
    const sortedNodes = this.sortNodesBySuitability(nodes, policy);

    // No available nodes: we cannot place any replicas.
    if (sortedNodes.length === 0) {
      return {
        targetReplicaCount: 0,
        targetNodes: [],
        minReplicaCount: policy.minReplicaCount || 3,
        maxReplicaCount: policy.maxReplicaCount || 7,
      };
    }

    // Select target nodes
    for (let i = 0; i < Math.min(targetCount, sortedNodes.length); i++) {
      targetNodes.push(sortedNodes[i].node_id);
    }

    // If we have fewer nodes than target count, duplicate on existing nodes
    while (targetNodes.length < targetCount) {
      const nodeIndex = targetNodes.length % sortedNodes.length;
      targetNodes.push(sortedNodes[nodeIndex].node_id);
    }

    return {
      targetReplicaCount: targetCount,
      targetNodes,
      minReplicaCount: policy.minReplicaCount || 3,
      maxReplicaCount: policy.maxReplicaCount || 7,
    };
  }

  /**
   * Sort nodes by current load (prefer less loaded nodes).
   * @param {Array<Object>} nodes - Available nodes.
   * @return {Array<Object>} Sorted nodes.
   */
  sortNodesByLoad(nodes) {
    return [...nodes].sort((a, b) => {
      // Calculate load score (lower is better)
      const loadA = this.calculateNodeLoad(a);
      const loadB = this.calculateNodeLoad(b);
      return loadA - loadB;
    });
  }

  /**
   * Sort nodes by suitability based on policy constraints.
   * @param {Array<Object>} nodes - Available nodes.
   * @param {Object} policy - Policy with placement constraints.
   * @return {Array<Object>} Sorted nodes.
   */
  sortNodesBySuitability(nodes, policy) {
    const constraints = policy.placementConstraints || {};

    return [...nodes].sort((a, b) => {
      let scoreA = 0;
      let scoreB = 0;

      // Consider CPU load
      if (constraints.considerCpuLoad) {
        const cpuA = a.cpu_usage_percent || 0;
        const cpuB = b.cpu_usage_percent || 0;
        scoreA += cpuA;
        scoreB += cpuB;
      }

      // Consider memory load
      if (constraints.considerMemoryLoad) {
        const memA = a.memory_usage_percent || 0;
        const memB = b.memory_usage_percent || 0;
        scoreA += memA;
        scoreB += memB;
      }

      // Consider disk space
      if (constraints.considerDiskSpace) {
        const diskA = a.disk_usage_percent || 0;
        const diskB = b.disk_usage_percent || 0;
        scoreA += diskA;
        scoreB += diskB;
      }

      return scoreA - scoreB;
    });
  }

  /**
   * Calculate node load score.
   * @param {Object} node - Node object.
   * @return {number} Load score (0-300, lower is better).
   */
  calculateNodeLoad(node) {
    const cpuLoad = node.cpu_usage_percent || 0;
    const memoryLoad = node.memory_usage_percent || 0;
    const diskLoad = node.disk_usage_percent || 0;
    return cpuLoad + memoryLoad + diskLoad;
  }


  /**
   * Calculate moves needed to reach target state.
   * @param {Array<Object>} currentReplicas - Current replicas.
   * @param {Object} targetState - Target state.
   * @return {Array<Object>} Array of move operations.
   */
  calculateMoves(currentReplicas, targetState) {
    const moves = [];
    const healthyReplicas = this.getHealthyReplicas(currentReplicas);
    const targetNodeIds = targetState.targetNodes;

    const inFlightOperations = this.getInFlightOperations();
    const transitionalReplicas = [
      ...inFlightOperations.map((op) => ({
        replicaId: op.replica_id,
        partitionId: op.partition_id,
        nodeId: op.target_node_id,
        state: op.workflow_step ? op.workflow_step.toLowerCase() : op.status,
      })),
    ];

    // Build sets for quick lookup of transitional replicas by node and replica ID
    const nodesWithAddTransitional = new Set();
    const replicasInRemoving = new Set();

    for (const replica of transitionalReplicas) {
      // ADD transitional states: pending, sending, creating, syncing
      if (['pending', 'sending', 'creating', 'syncing'].includes(replica.state)) {
        // Only consider replicas for this partition
        if (replica.partitionId === this.entityId) {
          nodesWithAddTransitional.add(replica.nodeId);
        }
      }
      // REMOVE transitional state: removing
      if (replica.state === 'removing' || replica.state === 'stopping') {
        replicasInRemoving.add(replica.replicaId);
      }
    }

    // Count replicas in transition (creating/syncing/removing)
    const transitioningReplicas = currentReplicas.filter((r) =>
      r.status === ReplicaStatus.CREATING ||
      r.status === ReplicaStatus.SYNCING ||
      r.status === ReplicaStatus.REMOVING);

    // If there are replicas in transition, wait for them to complete
    if (transitioningReplicas.length > 0) {
      this.logger.debug(REBALANCER_LOG_MSG.SKIP_TRANSITIONAL, {
        entityId: this.entityId,
        transitioningCount: transitioningReplicas.length,
      });
      return [];
    }

    // Check for pending operations - don't generate new moves if we have any
    const pendingCount = inFlightOperations.length;

    if (pendingCount > 0) {
      this.logger.debug(REBALANCER_LOG_MSG.SKIP_PENDING, {
        entityId: this.entityId,
        pendingCount,
      });
      return [];
    }

    // Count target replicas per node
    const targetCounts = new Map();
    for (const nodeId of targetNodeIds) {
      targetCounts.set(nodeId, (targetCounts.get(nodeId) || 0) + 1);
    }

    // Count current replicas per node (skip replicas without node_id)
    const currentCounts = new Map();
    for (const replica of healthyReplicas) {
      if (replica && replica.node_id) {
        currentCounts.set(replica.node_id, (currentCounts.get(replica.node_id) || 0) + 1);
      }
    }

    // First, handle failed/inactive replicas - always remove them
    for (const replica of currentReplicas) {
      const status = replica.status || ReplicaStatus.ACTIVE;
      const replicaId = replica.replica_id || replica.service_id;

      // Skip if this replica already has a pending move
      if (this.hasPendingMove(replicaId)) {
        continue;
      }

      // Skip if replica is already in removing state (Requirements 3.3)
      if (replicasInRemoving.has(replicaId)) {
        this.logger.debug(REBALANCER_LOG_MSG.SKIP_REMOVE_REMOVING, {
          entityId: this.entityId,
          replicaId,
        });
        continue;
      }

      if (status === ReplicaStatus.FAILED) {
        moves.push({
          type: MoveType.REMOVE,
          replicaId,
          nodeId: replica.node_id,
          reason: 'replica_failed',
        });
      }
    }

    // Find nodes that have too many replicas (need removal)
    // Group healthy replicas by node for removal selection (skip replicas without node_id)
    const replicasByNode = new Map();
    for (const replica of healthyReplicas) {
      if (replica && replica.node_id) {
        if (!replicasByNode.has(replica.node_id)) {
          replicasByNode.set(replica.node_id, []);
        }
        replicasByNode.get(replica.node_id).push(replica);
      }
    }

    // Generate ADD moves for under-represented nodes FIRST
    // This ensures we know how many ADDs are needed before deciding on REMOVEs
    const addMoves = [];
    for (const [nodeId, targetCount] of targetCounts) {
      // Skip if this node already has a pending ADD move
      if (this.hasPendingAddForNode(nodeId)) {
        continue;
      }

      // Skip if this node already has a transitional replica for this partition
      // (Requirements 3.2)
      if (nodesWithAddTransitional.has(nodeId)) {
        this.logger.debug(REBALANCER_LOG_MSG.SKIP_ADD_TRANSITIONAL, {
          entityId: this.entityId,
          nodeId,
        });
        continue;
      }

      const currentCount = currentCounts.get(nodeId) || 0;
      const needed = targetCount - currentCount;

      for (let i = 0; i < needed; i++) {
        addMoves.push({
          type: MoveType.ADD,
          nodeId,
          reason: 'increase_replica_count',
        });
      }
    }

    // Calculate total healthy replicas after pending ADDs complete
    const totalHealthyAfterAdds = healthyReplicas.length + addMoves.length;
    const targetReplicaCount = targetState.targetReplicaCount;

    // Generate REMOVE moves for over-represented nodes
    // IMPORTANT: Only generate REMOVE moves for "spread_replicas" if we have
    // MORE healthy replicas than the target AFTER ADDs complete.
    // This implements the "ADD first, REMOVE after stable" strategy.
    for (const [nodeId, replicas] of replicasByNode) {
      const targetCount = targetCounts.get(nodeId) || 0;
      const currentCount = replicas.length;
      const excess = currentCount - targetCount;

      // Remove excess replicas from this node
      for (let i = 0; i < excess; i++) {
        const replicaToRemove = replicas[i];
        const replicaId = replicaToRemove.replica_id || replicaToRemove.service_id;

        // Skip if this replica already has a pending move
        if (this.hasPendingMove(replicaId)) {
          continue;
        }

        // Skip if replica is already in removing state (Requirements 3.3)
        if (replicasInRemoving.has(replicaId)) {
          this.logger.debug(REBALANCER_LOG_MSG.SKIP_REMOVE_REMOVING, {
            entityId: this.entityId,
            replicaId,
          });
          continue;
        }

        const reason = targetCount === 0 ? 'node_not_in_target' : 'spread_replicas';

        // For "spread_replicas" removals, only proceed if we'll have excess
        // replicas after the ADDs complete. This ensures we don't remove
        // replicas until new ones are stable.
        if (reason === 'spread_replicas') {
          // Count how many REMOVE moves we've already added
          const existingRemoves = moves.filter(
            (m) => m.type === MoveType.REMOVE && m.reason === 'spread_replicas',
          ).length;

          // Only add REMOVE if total after ADDs minus existing removes
          // is still above target
          if (totalHealthyAfterAdds - existingRemoves <= targetReplicaCount) {
            this.logger.debug(REBALANCER_LOG_MSG.DEFER_REMOVE_DETAIL, {
              entityId: this.entityId,
              replicaId,
              nodeId,
              totalHealthyAfterAdds,
              existingRemoves,
              targetReplicaCount,
            });
            continue;
          }
        }

        moves.push({
          type: MoveType.REMOVE,
          replicaId,
          nodeId: nodeId,
          reason,
        });
      }
    }

    // Add the ADD moves to the moves array
    moves.push(...addMoves);

    // CRITICAL: If there are any ADD moves, do NOT include REMOVE moves
    // (except for failed replica cleanup). This ensures ADD operations
    // complete and replicas become active BEFORE any REMOVE operations start.
    // The rebalancer will generate REMOVE moves in a subsequent cycle after
    // the ADDs have stabilized.
    //
    // This prevents the race condition where:
    // 1. ADD move is initiated (async, returns immediately)
    // 2. REMOVE move executes before ADD completes
    // 3. System loses replicas and queries fail
    if (addMoves.length > 0) {
      // Filter out non-critical REMOVE moves when we have ADDs pending
      const criticalRemoves = moves.filter(
        (m) => m.type === MoveType.REMOVE && m.reason === 'replica_failed',
      );
      // Return only ADD moves and critical removes (failed replicas)
      const filteredMoves = [...addMoves, ...criticalRemoves];

      this.logger.info(REBALANCER_LOG_MSG.DEFER_REMOVE, {
        entityId: this.entityId,
        addMoveCount: addMoves.length,
        deferredRemoveCount: moves.filter(
          (m) => m.type === MoveType.REMOVE && m.reason !== 'replica_failed',
        ).length,
        criticalRemoveCount: criticalRemoves.length,
      });

      return filteredMoves;
    }

    // Sort moves: ADD operations first, then REMOVE operations
    // This ensures we add new replicas before removing old ones, maintaining
    // replica count and data availability during rebalancing.
    // The only exception is failed replicas which should be removed immediately.
    moves.sort((a, b) => {
      // Failed replica removals have highest priority
      if (a.reason === 'replica_failed' && b.reason !== 'replica_failed') return -1;
      if (b.reason === 'replica_failed' && a.reason !== 'replica_failed') return 1;
      // ADD before REMOVE for all other cases
      if (a.type === MoveType.ADD && b.type === MoveType.REMOVE) return -1;
      if (a.type === MoveType.REMOVE && b.type === MoveType.ADD) return 1;
      return 0;
    });

    return moves;
  }

  /**
   * Execute a single move operation via the coordinator.
   * Requirements: 2.5
   * @param {Object} move - Move operation to execute.
   * @return {Promise<Object>} Result of the move.
   */
  async executeMove(move) {
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
          this.logger.warn(REBALANCER_LOG_MSG.SKIP_UNREADY_NODE, {
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
    // Create operation record via coordinator
    const replicaId = move.type === MoveType.ADD && !move.replicaId ?
      uuidv4() :
      move.replicaId;

    const operation = await this.rebalanceCoordinator.createOperation({
      type: move.type === MoveType.ADD ? 'ADD' : 'REMOVE',
      partitionId: this.entityId,
      nodeId: move.nodeId,
      replicaId: replicaId,
    });

    return {
      success: true,
      replicaId: replicaId || operation.replicaId,
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
      op.type === 'ADD' &&
      op.partition_id === this.entityId,
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
    const results = [];
    const batchSize = Number.isFinite(this.moveBatchSize) && this.moveBatchSize > 0 ?
      Math.floor(this.moveBatchSize) : 1;
    const interBatchDelayMs = Number.isFinite(this.interBatchDelayMs) &&
      this.interBatchDelayMs > 0 ? this.interBatchDelayMs : 0;
    const groupedMoves = this.groupMovesByTargetNode(moves);

    for (const [nodeId, nodeMoves] of groupedMoves.entries()) {
      if (nodeId) {
        const ready = await this.isNodeReady(nodeId);
        if (!ready) {
          this.logger.warn(REBALANCER_LOG_MSG.SKIP_BATCH_UNREADY, {
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
        const batch = nodeMoves.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map(async (move) => {
          try {
            return await this.executeMove(move);
          } catch (error) {
            throw error;
          }
        }));

        results.push(...batchResults);

        if (nodeId) {
          const stillReady = await this.isNodeReady(nodeId);
          if (!stillReady) {
            this.logger.warn(REBALANCER_LOG_MSG.NODE_DISCONNECTED_BATCH, {
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
    if (!this.isLeader) {
      this.logger.debug(REBALANCER_LOG_MSG.NOT_LEADER_SKIP, {
        entityId: this.entityId,
      });
      return {success: false, reason: 'not_leader'};
    }

    const effectivePolicy = policy || this.getPolicy();
    const currentReplicas = this.getCurrentReplicas();
    const availableNodes = this.getAvailableNodes();
    if (availableNodes.length === 0) {
      this.logger.debug(REBALANCER_LOG_MSG.NO_AVAILABLE_NODES, {
        entityId: this.entityId,
        entityType: this.entityType,
      });
      return {success: false, reason: 'no_available_nodes'};
    }

    const targetState = this.calculateTargetState(currentReplicas, effectivePolicy);
    const moves = this.calculateMoves(currentReplicas, targetState);

    if (moves.length === 0) {
      this.logger.debug(REBALANCER_LOG_MSG.NO_REBALANCE_NEEDED, {
        entityId: this.entityId,
        currentCount: currentReplicas.length,
        targetCount: targetState.targetReplicaCount,
      });
      return {success: true, moves: [], reason: 'no_changes_needed'};
    }

    this.logger.info(REBALANCER_LOG_MSG.START_REBALANCE, {
      entityId: this.entityId,
      entityType: this.entityType,
      trigger,
      moveCount: moves.length,
      currentCount: currentReplicas.length,
      targetCount: targetState.targetReplicaCount,
    });

    const limitedMoves = moves.slice(0, this.maxConcurrentMoves);
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
    if (!this.isLeader) {
      return;
    }

    // Add jitter: ±25% of interval to spread load
    const jitter = this.periodicCheckJitterMs * (Math.random() - 0.5) * 2;
    const delay = Math.max(1000, this.currentInterval + jitter);

    this.scheduledCheck = setTimeout(() => this.checkRebalance(), delay);

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
    if (!this.isLeader) {
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
        await this.rebalance(TriggerType.PERIODIC);
        // Reset interval on action
        this.currentInterval = this.periodicCheckIntervalMs;
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
    this.scheduleNextCheck();
  }

  /**
   * Evaluate if rebalancing is needed.
   * @return {Promise<boolean>} True if rebalancing is needed.
   */
  async evaluateState() {
    const currentReplicas = this.getCurrentReplicas();
    const policy = this.getPolicy();
    const availableNodes = this.getAvailableNodes();

    this.logger.debug(REBALANCER_LOG_MSG.EVALUATING_STATE, {
      entityId: this.entityId,
      entityType: this.entityType,
      currentReplicaCount: currentReplicas.length,
      availableNodeCount: availableNodes.length,
      hasCache: !!this.systemTableCache,
      targetReplicaCount: policy.targetReplicaCount || policy.replicaCount || 3,
    });

    // Skip rebalancing if cache appears unpopulated (no nodes known)
    // This prevents newly joined nodes from making incorrect decisions
    // before their cache is synchronized with the cluster state
    if (availableNodes.length === 0) {
      this.logger.debug(REBALANCER_LOG_MSG.NO_AVAILABLE_NODES, {
        entityId: this.entityId,
        entityType: this.entityType,
      });
      return false;
    }

    // Critical checks - trigger immediate rebalancing
    if (this.isCriticalState(currentReplicas, policy)) {
      this.logger.warn(REBALANCER_LOG_MSG.CRITICAL_STATE, {
        entityId: this.entityId,
        entityType: this.entityType,
        reason: this.getCriticalReason(currentReplicas, policy),
      });
      return true;
    }

    // Opportunistic checks - can wait for periodic schedule
    if (this.isSuboptimalState(currentReplicas, policy)) {
      this.logger.info(REBALANCER_LOG_MSG.SUBOPTIMAL_STATE, {
        entityId: this.entityId,
        entityType: this.entityType,
      });
      return true;
    }

    return false;
  }

  /**
   * Check if current state is critical (requires immediate action).
   * @param {Array<Object>} replicas - Current replicas.
   * @param {Object} policy - Applicable policy.
   * @return {boolean} True if state is critical.
   */
  isCriticalState(replicas, policy) {
    const healthyReplicas = this.getHealthyReplicas(replicas);
    const minReplicas = policy.minReplicaCount || 3;

    // Critical: Below minimum replica count
    if (healthyReplicas.length < minReplicas) {
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
  getCriticalReason(replicas, policy) {
    const healthyReplicas = this.getHealthyReplicas(replicas);
    const minReplicas = policy.minReplicaCount || 3;

    if (healthyReplicas.length < minReplicas) {
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
  isSuboptimalState(replicas, policy) {
    const targetCount = policy.targetReplicaCount || policy.replicaCount || 3;
    const healthyReplicas = this.getHealthyReplicas(replicas);

    // Suboptimal: Not at target replica count
    if (healthyReplicas.length !== targetCount) {
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
      this.checkRebalance();
    }, this.criticalCheckDelayMs);
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
