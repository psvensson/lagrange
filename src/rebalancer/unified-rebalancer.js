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
   */
  constructor(options = {}) {
    super();

    this.entityId = options.entityId;
    this.entityType = options.entityType || EntityType.PARTITION;
    this.systemTableCache = options.systemTableCache;
    this.cdcIntegrationService = options.cdcIntegrationService;
    this.tablePolicyService = options.tablePolicyService || null;
    this.nodeId = options.nodeId;

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

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem('rebalancer') : console;

    // State
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
    });

    this.initialized = true;
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
    if (policy.placementConstraints?.spreadAcrossNodes) {
      if (this.hasMultipleReplicasOnSameNode(healthyReplicas)) {
        decision.needsRebalancing = true;
        decision.reason = decision.reason || 'replicas_not_spread';
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
        service.service_type === 'partition_replica';
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
    const _currentNodeIds = healthyReplicas.map((r) => r.node_id);
    const targetNodeIds = targetState.targetNodes;

    // Find replicas to remove (on nodes not in target)
    for (const replica of currentReplicas) {
      const status = replica.status || ReplicaStatus.ACTIVE;

      // Remove failed/inactive replicas
      if (status === ReplicaStatus.FAILED || status === ReplicaStatus.INACTIVE) {
        moves.push({
          type: MoveType.REMOVE,
          replicaId: replica.replica_id || replica.service_id,
          nodeId: replica.node_id,
          reason: 'replica_failed',
        });
        continue;
      }

      // Check if this node should have a replica
      const nodeIndex = targetNodeIds.indexOf(replica.node_id);
      if (nodeIndex === -1) {
        // Node not in target, remove replica
        moves.push({
          type: MoveType.REMOVE,
          replicaId: replica.replica_id || replica.service_id,
          nodeId: replica.node_id,
          reason: 'node_not_in_target',
        });
      }
    }

    // Find nodes that need replicas added
    const healthyNodeIds = healthyReplicas.map((r) => r.node_id);
    const nodeCounts = new Map();

    // Count replicas per node in target
    for (const nodeId of targetNodeIds) {
      nodeCounts.set(nodeId, (nodeCounts.get(nodeId) || 0) + 1);
    }

    // Count current replicas per node
    const currentCounts = new Map();
    for (const nodeId of healthyNodeIds) {
      currentCounts.set(nodeId, (currentCounts.get(nodeId) || 0) + 1);
    }

    // Add replicas where needed
    for (const [nodeId, targetCount] of nodeCounts) {
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
    });

    try {
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
   * Add a replica on a node.
   * @param {string} nodeId - Target node ID.
   * @return {Promise<Object>} Result of the add operation.
   */
  async addReplica(nodeId) {
    const replicaId = uuidv4();

    this.logger.info('Adding replica', {
      entityId: this.entityId,
      entityType: this.entityType,
      replicaId,
      nodeId,
    });

    // Emit event for external handling
    this.emit('addReplica', {
      entityId: this.entityId,
      entityType: this.entityType,
      replicaId,
      nodeId,
    });

    return {
      success: true,
      replicaId,
      nodeId,
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
    this.logger.info('Removing replica', {
      entityId: this.entityId,
      entityType: this.entityType,
      replicaId,
      nodeId,
    });

    // Emit event for external handling
    this.emit('removeReplica', {
      entityId: this.entityId,
      entityType: this.entityType,
      replicaId,
      nodeId,
    });

    return {
      success: true,
      replicaId,
      nodeId,
      operation: MoveType.REMOVE,
    };
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
   * @return {Promise<void>}
   */
  async checkRebalance() {
    if (!this.isLeader) {
      return;
    }

    try {
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
    if (policy.placementConstraints?.spreadAcrossNodes) {
      if (this.hasMultipleReplicasOnSameNode(healthyReplicas)) {
        return true;
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
    const nodeIds = replicas.map((r) => r.node_id);
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
    const nodesWithReplicas = new Set(replicas.map((r) => r.node_id));

    return allNodes
      .filter((node) => !nodesWithReplicas.has(node.node_id))
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
    setTimeout(() => {
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

    return replicas.some((r) => r.node_id === nodeId);
  }

  /**
   * Get rebalancer statistics.
   * @return {Object} Statistics object.
   */
  getStats() {
    return {
      entityId: this.entityId,
      entityType: this.entityType,
      isLeader: this.isLeader,
      lastRebalanceTime: this.lastRebalanceTime,
      rebalanceCount: this.rebalanceCount,
      pendingMoves: this.pendingMoves.size,
      currentInterval: this.currentInterval,
      initialized: this.initialized,
    };
  }

  /**
   * Shutdown the rebalancer.
   */
  shutdown() {
    this.cancelScheduledCheck();
    this.pendingMoves.clear();
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
