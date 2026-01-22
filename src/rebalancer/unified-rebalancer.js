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

/**
 * Entity types that can be rebalanced.
 */
const EntityType = {
  PARTITION: 'partition',
  MESSAGE_GROUP: 'message_group',
};

/**
 * Rebalancing trigger types.
 */
const TriggerType = {
  NODE_JOIN: 'node_join',
  NODE_LEAVE: 'node_leave',
  NODE_FAILURE: 'node_failure',
  POLICY_CHANGE: 'policy_change',
  PERIODIC: 'periodic',
  CRITICAL: 'critical',
};

/**
 * Move operation types.
 */
const MoveType = {
  ADD: 'add',
  REMOVE: 'remove',
};

/**
 * Replica status values.
 *
 * @deprecated This enum is deprecated in favor of ReplicaStatus from
 * './replica-status.js'. The unified ReplicaStatus enum should be used
 * by all components for consistency.
 *
 * Migration guide:
 * - Import ReplicaStatus from './replica-status.js'
 * - Replace INACTIVE with appropriate status based on context
 * - Replace STARTING with CREATING
 * - Replace STOPPING with REMOVING
 *
 * This enum is kept for backward compatibility during migration.
 */
const ReplicaStatus = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  FAILED: 'failed',
  STARTING: 'starting',
  STOPPING: 'stopping',
};

/**
 * Node status values.
 */
const NodeStatus = {
  ACTIVE: 'active',
  SUSPECTED: 'suspected',
  FAILED: 'failed',
};

/**
 * Default policy for partitions.
 */
const DEFAULT_TABLE_POLICY = {
  replicaCount: 3,
  minReplicaCount: 3,
  maxReplicaCount: 7,
  placementConstraints: {
    spreadAcrossNodes: true,
    considerDiskSpace: true,
    considerCpuLoad: true,
    considerMemoryLoad: true,
  },
};

/**
 * Default policy for message groups.
 */
const DEFAULT_MESSAGE_GROUP_POLICY = {
  targetReplicaCount: 3,
  maxReplicaCount: 5,
  ensureLocalAccess: true,
  placementConstraints: {
    spreadAcrossNodes: true,
    preferNearbyNodes: true,
  },
};

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
 * NOTE: This class now delegates operation execution to RebalanceCoordinator
 * when available. The coordinator owns operation state tracking (pendingMoves
 * tracking is deprecated when coordinator is used).
 */
class UnifiedRebalancer extends EventEmitter {
  /**
   * Create a new UnifiedRebalancer instance.
   * @param {Object} options - Configuration options.
   * @param {string} options.entityId - Partition ID or message group ID.
   * @param {string} options.entityType - 'partition' or 'message_group'.
   * @param {Object} options.systemTableCache - Read-only system table cache.
   * @param {Object} options.cdcIntegrationService - CDC integration service for writes.
   * @param {Object} options.tablePolicyService - Optional TablePolicyService for policy lookup.
   * @param {string} options.nodeId - Current node ID.
   * @param {Object} options.replicaStateMachine - Optional ReplicaStateMachine for state tracking.
   * @param {Object} options.rebalanceCoordinator - Optional RebalanceCoordinator for operation
   *   execution (new simplified architecture).
   */
  constructor(options = {}) {
    super();

    this.entityId = options.entityId;
    this.entityType = options.entityType || EntityType.PARTITION;
    this.systemTableCache = options.systemTableCache;
    this.cdcIntegrationService = options.cdcIntegrationService;
    this.tablePolicyService = options.tablePolicyService || null;
    this.nodeId = options.nodeId;
    this.replicaStateMachine = options.replicaStateMachine || null;

    // RebalanceCoordinator for delegated operation execution (Requirements 2.5)
    // When set, operation execution is delegated to the coordinator
    this.rebalanceCoordinator = options.rebalanceCoordinator || null;

    // Leadership state
    this.isLeader = false;

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.periodicCheckIntervalMs = config.get('rebalancer.periodicCheckIntervalMs') ||
      60000;
    this.periodicCheckJitterMs = config.get('rebalancer.periodicCheckJitterMs') ||
      10000;
    this.criticalCheckDelayMs = config.get('rebalancer.criticalCheckDelayMs') ||
      5000;
    this.maxConcurrentMoves = config.get('rebalancer.maxConcurrentMoves') || 5;
    this.moveTimeoutMs = config.get('rebalancer.moveTimeoutMs') || 300000;
    this.nodeCpuThreshold = config.get('rebalancer.nodeCpuThreshold') || 0.8;
    this.nodeMemoryThreshold = config.get('rebalancer.nodeMemoryThreshold') || 0.8;
    this.nodeDiskThreshold = config.get('rebalancer.nodeDiskThreshold') || 0.9;

    // Stabilization period configuration (Requirements 2.1)
    const configuredStabilization = config.get('rebalancer.stabilizationPeriodMs');
    this.minStabilizationMs = 1000;
    this.maxStabilizationMs = 10000;
    this.defaultStabilizationMs = 5000;
    // Clamp to valid range [1000ms, 10000ms] with default 5000ms
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
      loggingService.forSubsystem('rebalancer') : console;

    // State - pendingMoves is deprecated when rebalanceCoordinator is used
    // Kept for backward compatibility with legacy code paths
    /**
     * @deprecated pendingMoves is deprecated. Use RebalanceCoordinator.getInFlightOperations()
     * instead. The coordinator owns operation state tracking in the new architecture.
     */
    this.pendingMoves = new Map();
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

    this.logger.info('Rebalancer initialized', {
      entityId: this.entityId,
      entityType: this.entityType,
      nodeId: this.nodeId,
      usingCoordinator: !!this.rebalanceCoordinator,
    });

    this.initialized = true;
  }

  /**
   * Set the RebalanceCoordinator for delegated operation execution.
   * When set, operation execution is delegated to the coordinator,
   * and pendingMoves tracking is no longer used.
   * Requirements: 2.5
   * @param {Object} coordinator - RebalanceCoordinator instance.
   */
  setRebalanceCoordinator(coordinator) {
    this.rebalanceCoordinator = coordinator;

    this.logger.info('RebalanceCoordinator set for rebalancer', {
      entityId: this.entityId,
      entityType: this.entityType,
      hasCoordinator: !!coordinator,
    });

    // Clear legacy pendingMoves when switching to coordinator
    if (coordinator && this.pendingMoves.size > 0) {
      this.logger.warn('Clearing legacy pendingMoves after coordinator set', {
        entityId: this.entityId,
        pendingMovesCount: this.pendingMoves.size,
      });
      this.pendingMoves.clear();
    }
  }

  /**
   * Set leadership status.
   * @param {boolean} isLeader - Whether this instance is the leader.
   */
  setLeader(isLeader) {
    const wasLeader = this.isLeader;
    this.isLeader = isLeader;

    if (isLeader && !wasLeader) {
      this.logger.info('Became leader, starting rebalancing scheduler', {
        entityId: this.entityId,
        entityType: this.entityType,
      });
      this.scheduleNextCheck();
    } else if (!isLeader && wasLeader) {
      this.logger.info('Lost leadership, stopping rebalancing scheduler', {
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
   * Uses TablePolicyService if available, otherwise falls back to direct cache lookup.
   * @return {Object} Table policy.
   */
  getTablePolicy() {
    // Use TablePolicyService if available (preferred)
    if (this.tablePolicyService) {
      return this.tablePolicyService.getPolicyForPartition(this.entityId);
    }

    // Fallback to direct cache lookup
    if (!this.systemTableCache) {
      return {...DEFAULT_TABLE_POLICY};
    }

    // Get partition info to find table
    const partition = this.systemTableCache.get('partitions', this.entityId);
    if (!partition) {
      return {...DEFAULT_TABLE_POLICY};
    }

    // Get table policy
    const table = this.systemTableCache.get('tables', partition.table_id);
    if (!table || !table.table_policies) {
      return {...DEFAULT_TABLE_POLICY};
    }

    try {
      const policies = typeof table.table_policies === 'string' ?
        JSON.parse(table.table_policies) : table.table_policies;
      return {...DEFAULT_TABLE_POLICY, ...policies};
    } catch (_e) {
      return {...DEFAULT_TABLE_POLICY};
    }
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

    this.logger.debug('State change recorded, resetting stabilization timer', {
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
    if (!this.systemTableCache) {
      return [];
    }

    return this.systemTableCache.filter('nodes', (node) => {
      return node.status === NodeStatus.ACTIVE;
    });
  }

  /**
   * Get current replicas for this entity.
   * @return {Array<Object>} Array of replica objects.
   */
  getCurrentReplicas() {
    if (!this.systemTableCache) {
      return [];
    }

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
   * Get healthy replicas (excluding failed/inactive).
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

    // First, ensure we have replicas spread across nodes
    if (policy.placementConstraints?.spreadAcrossNodes) {
      // Sort nodes by current replica load (prefer less loaded nodes)
      const sortedNodes = this.sortNodesByLoad(nodes);

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

    // Get transitional replicas from coordinator or state machine
    // Coordinator is preferred (Requirements 1.1, 1.3)
    let transitionalReplicas = [];
    if (this.rebalanceCoordinator) {
      // Use coordinator's in-flight operations
      const inFlightOps = this.rebalanceCoordinator.getInFlightOperations();
      transitionalReplicas = inFlightOps.map((op) => ({
        replicaId: op.replicaId,
        partitionId: op.partitionId,
        nodeId: op.targetNodeId,
        state: op.workflowStep?.toLowerCase() || op.status,
      }));
    } else if (this.replicaStateMachine) {
      // Legacy: use state machine (deprecated)
      transitionalReplicas = this.replicaStateMachine.getTransitionalReplicas();
    }

    // Build sets for quick lookup of transitional replicas by node and replica ID
    const nodesWithAddTransitional = new Set();
    const replicasInRemoving = new Set();

    for (const replica of transitionalReplicas) {
      // ADD transitional states: pending, creating, syncing
      if (['pending', 'creating', 'syncing'].includes(replica.state)) {
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

    // Count replicas in transition (starting/stopping/syncing)
    const transitioningReplicas = currentReplicas.filter((r) =>
      r.status === ReplicaStatus.STARTING ||
      r.status === ReplicaStatus.STOPPING ||
      r.status === 'syncing');

    // If there are replicas in transition, wait for them to complete
    if (transitioningReplicas.length > 0) {
      this.logger.debug('Replicas in transition, skipping move calculation', {
        entityId: this.entityId,
        transitioningCount: transitioningReplicas.length,
      });
      return [];
    }

    // Check for pending moves - don't generate new moves if we have pending ones
    // When using coordinator, check coordinator's in-flight operations
    let pendingCount = 0;
    if (this.rebalanceCoordinator) {
      const inFlightOps = this.rebalanceCoordinator.getOperationsByPartition(this.entityId);
      pendingCount = inFlightOps.length;
    } else {
      pendingCount = Array.from(this.pendingMoves.values())
        .filter((m) => m.status === 'pending').length;
    }

    if (pendingCount > 0) {
      this.logger.debug('Pending moves exist, skipping move calculation', {
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
        this.logger.debug('Skipping REMOVE for replica already in removing state', {
          entityId: this.entityId,
          replicaId,
        });
        continue;
      }

      if (status === ReplicaStatus.FAILED || status === ReplicaStatus.INACTIVE) {
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

    // Generate REMOVE moves for over-represented nodes
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
          this.logger.debug('Skipping REMOVE for replica already in removing state', {
            entityId: this.entityId,
            replicaId,
          });
          continue;
        }

        moves.push({
          type: MoveType.REMOVE,
          replicaId,
          nodeId: nodeId,
          reason: targetCount === 0 ? 'node_not_in_target' : 'spread_replicas',
        });
      }
    }

    // Generate ADD moves for under-represented nodes
    for (const [nodeId, targetCount] of targetCounts) {
      // Skip if this node already has a pending ADD move
      if (this.hasPendingAddForNode(nodeId)) {
        continue;
      }

      // Skip if this node already has a transitional replica for this partition
      // (Requirements 3.2)
      if (nodesWithAddTransitional.has(nodeId)) {
        this.logger.debug('Skipping ADD for node with transitional replica', {
          entityId: this.entityId,
          nodeId,
        });
        continue;
      }

      const currentCount = currentCounts.get(nodeId) || 0;
      const needed = targetCount - currentCount;

      for (let i = 0; i < needed; i++) {
        moves.push({
          type: MoveType.ADD,
          nodeId,
          reason: 'increase_replica_count',
        });
      }
    }

    return moves;
  }

  /**
   * Execute a single move operation.
   * When rebalanceCoordinator is available, delegates to it (Requirements 2.5).
   * Otherwise falls back to legacy behavior.
   * @param {Object} move - Move operation to execute.
   * @return {Promise<Object>} Result of the move.
   */
  async executeMove(move) {
    this.logger.info('Executing rebalancing move', {
      entityId: this.entityId,
      entityType: this.entityType,
      moveType: move.type,
      nodeId: move.nodeId,
      reason: move.reason,
      usingCoordinator: !!this.rebalanceCoordinator,
    });

    try {
      // Delegate to RebalanceCoordinator if available (Requirements 2.5)
      if (this.rebalanceCoordinator) {
        return await this.executeMoveViaCoordinator(move);
      }

      // Legacy behavior - direct execution
      if (move.type === MoveType.ADD) {
        return await this.addReplica(move.nodeId);
      } else if (move.type === MoveType.REMOVE) {
        return await this.removeReplica(move.replicaId, move.nodeId);
      }

      throw new Error(`Unknown move type: ${move.type}`);
    } catch (error) {
      this.logger.error('Failed to execute move', {
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
    const operation = await this.rebalanceCoordinator.createOperation({
      type: move.type === MoveType.ADD ? 'ADD' : 'REMOVE',
      partitionId: this.entityId,
      nodeId: move.nodeId,
      replicaId: move.replicaId,
    });

    // Execute operation via coordinator
    const result = await this.rebalanceCoordinator.executeOperation(operation);

    // Emit event for compatibility with existing listeners
    if (result.success) {
      this.emit(move.type === MoveType.ADD ? 'addReplica' : 'removeReplica', {
        entityId: this.entityId,
        entityType: this.entityType,
        replicaId: move.replicaId || operation.replicaId,
        nodeId: move.nodeId,
        operationId: operation.operationId,
      });
    }

    return {
      success: result.success,
      replicaId: move.replicaId || operation.replicaId,
      nodeId: move.nodeId,
      operationId: operation.operationId,
      operation: move.type,
      error: result.error,
    };
  }

  /**
   * Add a replica on a node.
   * @param {string} nodeId - Target node ID.
   * @return {Promise<Object>} Result of the add operation.
   */
  async addReplica(nodeId) {
    const replicaId = uuidv4();
    const requestId = uuidv4();

    this.logger.info('Adding replica', {
      entityId: this.entityId,
      entityType: this.entityType,
      replicaId,
      nodeId,
      requestId,
    });

    // Track pending move
    this.pendingMoves.set(requestId, {
      type: MoveType.ADD,
      replicaId,
      nodeId,
      entityId: this.entityId,
      startedAt: Date.now(),
      status: 'pending',
    });

    // Emit event for external handling (legacy support)
    this.emit('addReplica', {
      entityId: this.entityId,
      entityType: this.entityType,
      replicaId,
      nodeId,
      requestId,
    });

    return {
      success: true,
      replicaId,
      nodeId,
      requestId,
      operation: MoveType.ADD,
    };
  }

  /**
   * Remove a replica from a node.
   * @param {string} replicaId - Replica ID to remove.
   * @param {string} nodeId - Node ID where replica is located.
   * @return {Promise<Object>} Result of the remove operation.
   */
  async removeReplica(replicaId, nodeId) {
    const requestId = uuidv4();

    this.logger.info('Removing replica', {
      entityId: this.entityId,
      entityType: this.entityType,
      replicaId,
      nodeId,
      requestId,
    });

    // Track pending move
    this.pendingMoves.set(requestId, {
      type: MoveType.REMOVE,
      replicaId,
      nodeId,
      entityId: this.entityId,
      startedAt: Date.now(),
      status: 'pending',
    });

    // Emit event for external handling (legacy support)
    this.emit('removeReplica', {
      entityId: this.entityId,
      entityType: this.entityType,
      replicaId,
      nodeId,
      requestId,
    });

    return {
      success: true,
      replicaId,
      nodeId,
      requestId,
      operation: MoveType.REMOVE,
    };
  }

  /**
   * Send a message with acknowledgment and timeout.
   * @param {Object} messageGroupService - Message group service for sending.
   * @param {string} targetNodeId - Target node ID.
   * @param {Object} message - Message to send.
   * @param {number} timeoutMs - Timeout in milliseconds.
   * @return {Promise<Object>} ACK response or timeout error.
   */
  async sendWithAck(messageGroupService, targetNodeId, message, timeoutMs = 30000) {
    const requestId = message.request_id || uuidv4();
    const messageWithId = {...message, request_id: requestId};

    // Target the lifecycle handler on the target node using unified address format
    // Requirements: 1.1, 7.1 - Unified address format ${nodeId}/${entityType}/${entityId}
    const targetAddress = `${targetNodeId}/lifecycle/manager`;

    this.logger.debug('Sending message with ACK', {
      requestId,
      targetNodeId,
      targetAddress,
      messageType: message.type,
      entityId: this.entityId,
    });

    return new Promise((resolve, reject) => {
      let timeoutId;
      let resolved = false;

      // Create one-time ACK handler
      const ackHandler = (ack) => {
        if (ack.request_id === requestId && !resolved) {
          resolved = true;
          clearTimeout(timeoutId);
          this.logger.debug('Received ACK', {
            requestId,
            status: ack.status,
            entityId: this.entityId,
          });
          resolve(ack);
        }
      };

      // Register handler for ACK
      const ackType = message.type === 'CREATE_REPLICA' ?
        'CREATE_REPLICA_ACK' : 'REMOVE_REPLICA_ACK';

      if (messageGroupService && messageGroupService.once) {
        messageGroupService.once(ackType, ackHandler);
      }

      // Set timeout
      timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          if (messageGroupService && messageGroupService.removeListener) {
            messageGroupService.removeListener(ackType, ackHandler);
          }
          this.logger.warn('Message ACK timeout', {
            requestId,
            targetNodeId,
            targetAddress,
            messageType: message.type,
            timeoutMs,
            entityId: this.entityId,
          });
          reject(new Error(`ACK timeout after ${timeoutMs}ms for request ${requestId}`));
        }
      }, timeoutMs);

      // Send the message to the lifecycle handler address
      if (messageGroupService && messageGroupService.sendMessage) {
        messageGroupService.sendMessage(targetAddress, messageWithId)
          .catch((error) => {
            if (!resolved) {
              resolved = true;
              clearTimeout(timeoutId);
              if (messageGroupService.removeListener) {
                messageGroupService.removeListener(ackType, ackHandler);
              }
              reject(error);
            }
          });
      } else {
        // No message group service - resolve immediately for testing
        clearTimeout(timeoutId);
        resolve({
          request_id: requestId,
          status: 'initiated',
          simulated: true,
        });
      }
    });
  }

  /**
   * Check if a replica has a pending move operation.
   * When rebalanceCoordinator is available, checks coordinator's in-flight operations.
   * @param {string} replicaId - Replica ID to check.
   * @return {boolean} True if replica has pending move.
   */
  hasPendingMove(replicaId) {
    // Check coordinator's in-flight operations if available
    if (this.rebalanceCoordinator) {
      const inFlightOps = this.rebalanceCoordinator.getInFlightOperations();
      return inFlightOps.some((op) => op.replicaId === replicaId);
    }

    // Legacy: check local pendingMoves
    for (const move of this.pendingMoves.values()) {
      if (move.replicaId === replicaId && move.status === 'pending') {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if a node has a pending ADD move for this entity.
   * When rebalanceCoordinator is available, checks coordinator's in-flight operations.
   * @param {string} nodeId - Node ID to check.
   * @return {boolean} True if node has pending ADD move.
   */
  hasPendingAddForNode(nodeId) {
    // Check coordinator's in-flight operations if available
    if (this.rebalanceCoordinator) {
      const inFlightOps = this.rebalanceCoordinator.getInFlightOperations();
      return inFlightOps.some((op) =>
        op.targetNodeId === nodeId &&
        op.type === 'ADD' &&
        op.partitionId === this.entityId,
      );
    }

    // Legacy: check local pendingMoves
    for (const move of this.pendingMoves.values()) {
      if (move.nodeId === nodeId &&
          move.type === MoveType.ADD &&
          move.status === 'pending') {
        return true;
      }
    }
    return false;
  }

  /**
   * Mark a pending move as completed.
   * @param {string} requestId - Request ID of the move.
   * @param {string} status - Final status ('completed' or 'failed').
   * @param {string} error - Error message if failed.
   */
  completePendingMove(requestId, status = 'completed', error = null) {
    const move = this.pendingMoves.get(requestId);
    if (move) {
      move.status = status;
      move.completedAt = Date.now();
      if (error) {
        move.error = error;
      }
      this.logger.debug('Pending move completed', {
        requestId,
        status,
        entityId: this.entityId,
      });
    }
  }

  /**
   * Clean up expired pending moves.
   * @param {number} maxAgeMs - Maximum age for pending moves.
   */
  cleanupExpiredMoves(maxAgeMs = 300000) {
    const now = Date.now();
    const expiredIds = [];

    for (const [requestId, move] of this.pendingMoves) {
      const age = now - move.startedAt;
      if (age > maxAgeMs) {
        if (move.status === 'pending') {
          // Mark as failed due to timeout
          move.status = 'failed';
          move.error = 'Operation timed out';
          move.completedAt = now;
        }
        // Remove completed/failed moves older than maxAge
        if (move.status !== 'pending') {
          expiredIds.push(requestId);
        }
      }
    }

    for (const id of expiredIds) {
      this.pendingMoves.delete(id);
    }

    if (expiredIds.length > 0) {
      this.logger.debug('Cleaned up expired pending moves', {
        count: expiredIds.length,
        entityId: this.entityId,
      });
    }
  }

  /**
   * Handle CDC event for services table to detect move completion.
   * @param {Object} event - CDC event.
   */
  handleServicesCDCEvent(event) {
    if (!event || !event.data) {
      return;
    }

    const {operation, data} = event;
    const serviceId = data.service_id;
    const status = data.status;

    // Find pending move for this service
    for (const [requestId, move] of this.pendingMoves) {
      if (move.replicaId === serviceId && move.status === 'pending') {
        if (move.type === MoveType.ADD) {
          // ADD completion: status becomes 'active'
          if (status === 'active') {
            this.completePendingMove(requestId, 'completed');
            this.emit('moveCompleted', {requestId, move, status: 'completed'});
          } else if (status === 'failed') {
            this.completePendingMove(requestId, 'failed', data.error_message);
            this.emit('moveFailed', {requestId, move, error: data.error_message});
          }
        } else if (move.type === MoveType.REMOVE) {
          // REMOVE completion: row is deleted or status is 'stopped'
          if (operation === 'DELETE' || status === 'stopped') {
            this.completePendingMove(requestId, 'completed');
            this.emit('moveCompleted', {requestId, move, status: 'completed'});
          } else if (status === 'failed') {
            this.completePendingMove(requestId, 'failed', data.error_message);
            this.emit('moveFailed', {requestId, move, error: data.error_message});
          }
        }
        break;
      }
    }
  }

  /**
   * Main rebalancing entry point.
   * @param {string} trigger - What triggered the rebalance.
   * @param {Object} policy - Optional policy override.
   * @return {Promise<Object>} Rebalancing result.
   */
  async rebalance(trigger = TriggerType.PERIODIC, policy = null) {
    if (!this.isLeader) {
      this.logger.debug('Not leader, skipping rebalance', {
        entityId: this.entityId,
      });
      return {success: false, reason: 'not_leader'};
    }

    const effectivePolicy = policy || this.getPolicy();
    const currentReplicas = this.getCurrentReplicas();
    const targetState = this.calculateTargetState(currentReplicas, effectivePolicy);
    const moves = this.calculateMoves(currentReplicas, targetState);

    if (moves.length === 0) {
      this.logger.debug('No rebalancing needed', {
        entityId: this.entityId,
        currentCount: currentReplicas.length,
        targetCount: targetState.targetReplicaCount,
      });
      return {success: true, moves: [], reason: 'no_changes_needed'};
    }

    this.logger.info('Starting rebalancing', {
      entityId: this.entityId,
      entityType: this.entityType,
      trigger,
      moveCount: moves.length,
      currentCount: currentReplicas.length,
      targetCount: targetState.targetReplicaCount,
    });

    const results = [];
    const limitedMoves = moves.slice(0, this.maxConcurrentMoves);

    for (const move of limitedMoves) {
      try {
        const result = await this.executeMove(move);
        results.push(result);
      } catch (error) {
        results.push({
          success: false,
          move,
          error: error.message,
        });
      }
    }

    this.lastRebalanceTime = Date.now();
    this.rebalanceCount++;

    this.emit('rebalanceComplete', {
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

    this.logger.debug('Scheduled next rebalance check', {
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

    // Skip rebalancing if system table cache isn't available yet
    // This happens during bootstrap before cache hydration completes
    if (!this.systemTableCache) {
      this.logger.debug('System table cache not available, skipping rebalance check', {
        entityId: this.entityId,
      });
      this.scheduleNextCheck();
      return;
    }

    try {
      // Check if we're still in stabilization period (Requirements 2.2, 2.3)
      if (!this.isStabilized()) {
        this.logger.debug('Waiting for stabilization period to complete', {
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
      this.logger.error('Error during rebalance check', {
        entityId: this.entityId,
        error: error.message,
      });
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

    this.logger.debug('Evaluating rebalancing state', {
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
      this.logger.debug('Skipping rebalance - no available nodes in cache', {
        entityId: this.entityId,
        entityType: this.entityType,
      });
      return false;
    }

    // Critical checks - trigger immediate rebalancing
    if (this.isCriticalState(currentReplicas, policy)) {
      this.logger.warn('Critical rebalancing state detected', {
        entityId: this.entityId,
        entityType: this.entityType,
        reason: this.getCriticalReason(currentReplicas, policy),
      });
      return true;
    }

    // Opportunistic checks - can wait for periodic schedule
    if (this.isSuboptimalState(currentReplicas, policy)) {
      this.logger.info('Suboptimal rebalancing state detected', {
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

    this.logger.info('Immediate rebalancing check triggered', {
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
      pendingMoves: this.pendingMoves.size,
      currentInterval: this.currentInterval,
      initialized: this.initialized,
      usingCoordinator: !!this.rebalanceCoordinator,
    };

    // Include coordinator stats if available
    if (this.rebalanceCoordinator) {
      const coordStats = this.rebalanceCoordinator.getStats();
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
    this.pendingMoves.clear();
    this.lastStateChangeTime = null;
    this.initialized = false;

    this.logger.info('Rebalancer shutdown', {
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
