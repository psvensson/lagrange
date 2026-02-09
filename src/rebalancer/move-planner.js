/**
 * Move Planner - Calculates replica placement and moves for rebalancing.
 *
 * This module provides move planning logic extracted from UnifiedRebalancer.
 * It calculates target replica state and the moves needed to reach that state.
 *
 * Requirements: 1.3, 1.8
 *
 * @module rebalancer/move-planner
 */

import {LoggingService} from '../logging/logging-service.js';
import {ReplicaStatus} from './replica-status.js';
import {
  REBALANCER_ENTITY_TYPE,
  REBALANCER_LOG_MSG,
  REBALANCER_MOVE_TYPE,
  REBALANCER_SUBSYSTEM,
} from './rebalancer-constants.js';

const EntityType = REBALANCER_ENTITY_TYPE;
const MoveType = REBALANCER_MOVE_TYPE;

/**
 * MovePlanner calculates replica placement and moves for partitions and message groups.
 *
 * This class is responsible for:
 * - Calculating target replica state based on policy
 * - Determining optimal node placement for replicas
 * - Calculating the moves needed to reach target state
 * - Sorting nodes by load and suitability
 *
 * @interface
 *
 * @description
 * MovePlanner provides move planning logic that was previously embedded
 * in UnifiedRebalancer. It works with a MoveStateProvider to access current
 * replica state and cluster information.
 *
 * Requirements: 1.3, 1.8
 *
 * @constructor
 * @param {Object} options - Configuration options
 * @param {string} options.entityId - Partition ID or message group ID (REQUIRED)
 * @param {string} options.entityType - 'partition' or 'message_group' (REQUIRED)
 * @param {Object} options.moveStateProvider - Provider for state access (REQUIRED)
 *
 * @example
 * const planner = new MovePlanner({
 *   entityId: 'partition-1',
 *   entityType: 'partition',
 *   moveStateProvider: stateProvider,
 * });
 *
 * const targetState = planner.calculateTargetState(currentReplicas, policy);
 * const moves = planner.calculateMoves(currentReplicas, targetState);
 */
class MovePlanner {
  /**
   * Create a new MovePlanner instance.
   * @param {Object} options - Configuration options.
   * @param {string} options.entityId - Partition ID or message group ID.
   * @param {string} options.entityType - 'partition' or 'message_group'.
   * @param {Object} options.moveStateProvider - Provider for state access.
   */
  constructor(options = {}) {
    if (!options.entityId) {
      throw new Error('MovePlanner requires entityId');
    }
    if (!options.entityType) {
      throw new Error('MovePlanner requires entityType');
    }
    if (!options.moveStateProvider) {
      throw new Error('MovePlanner requires moveStateProvider');
    }

    this.entityId = options.entityId;
    this.entityType = options.entityType;
    this.moveStateProvider = options.moveStateProvider;

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(REBALANCER_SUBSYSTEM.UNIFIED) : console;
  }

  /**
   * Calculate target state based on policy.
   * @param {Array<Object>} currentReplicas - Current replica state.
   * @param {Object} policy - Applicable policy.
   * @return {Object} Target state with replica count and placement.
   */
  calculateTargetState(currentReplicas, policy) {
    const nodes = this.moveStateProvider.getAvailableNodes();
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
        targetReplicaCount: targetCount,
        targetNodes: [],
        maxReplicaCount: policy.maxReplicaCount || 5,
        degraded: true,
        degradedReason: 'insufficient_nodes',
        availableNodeCount: 0,
      };
    }

    // First, ensure we have replicas spread across nodes
    if (policy.placementConstraints?.spreadAcrossNodes) {
      // Sort nodes by current replica load (prefer less loaded nodes)
      const sortedNodes = this.sortNodesByLoad(nodes);

      if (sortedNodes.length === 0) {
        return {
          targetReplicaCount: targetCount,
          targetNodes: [],
          maxReplicaCount: policy.maxReplicaCount || 5,
          degraded: true,
          degradedReason: 'insufficient_nodes',
          availableNodeCount: 0,
        };
      }

      // The desired target replica count remains the policy value even when
      // the cluster temporarily has fewer ready nodes. Placement itself still
      // assigns at most one replica per available node to avoid duplicate ADDs.
      const effectiveCount = Math.min(targetCount, sortedNodes.length);

      // Select target nodes — one replica per node, no wrapping
      for (let i = 0; i < effectiveCount; i++) {
        targetNodes.push(sortedNodes[i].node_id);
      }

      return {
        targetReplicaCount: targetCount,
        targetNodes,
        maxReplicaCount: policy.maxReplicaCount || 5,
        degraded: effectiveCount < targetCount,
        degradedReason: effectiveCount < targetCount ? 'insufficient_nodes' : null,
        availableNodeCount: sortedNodes.length,
      };
    }

    return {
      targetReplicaCount: targetCount,
      targetNodes,
      maxReplicaCount: policy.maxReplicaCount || 5,
      degraded: targetNodes.length < targetCount,
      degradedReason: targetNodes.length < targetCount ? 'insufficient_nodes' : null,
      availableNodeCount: nodes.length,
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
        targetReplicaCount: targetCount,
        targetNodes: [],
        minReplicaCount: policy.minReplicaCount || 3,
        maxReplicaCount: policy.maxReplicaCount || 7,
        degraded: true,
        degradedReason: 'insufficient_nodes',
        availableNodeCount: 0,
      };
    }

    // Keep desired replica target independent of current node count.
    // Placement assigns at most one replica per available node.
    const effectiveCount = Math.min(targetCount, sortedNodes.length);

    // Select target nodes — one replica per node, no wrapping
    for (let i = 0; i < effectiveCount; i++) {
      targetNodes.push(sortedNodes[i].node_id);
    }

    return {
      targetReplicaCount: targetCount,
      targetNodes,
      minReplicaCount: policy.minReplicaCount || 3,
      maxReplicaCount: policy.maxReplicaCount || 7,
      degraded: effectiveCount < targetCount,
      degradedReason: effectiveCount < targetCount ? 'insufficient_nodes' : null,
      availableNodeCount: sortedNodes.length,
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
    const healthyReplicas = this.moveStateProvider.getHealthyReplicas(currentReplicas);
    const targetNodeIds = targetState.targetNodes;
    const isDegradedPlacement = !!targetState?.degraded;

    const inFlightOperations = this.moveStateProvider.getInFlightOperations();
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
      if (this.moveStateProvider.hasPendingMove(replicaId)) {
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
    const replaceMoves = [];
    for (const [nodeId, targetCount] of targetCounts) {
      // Skip if this node already has a pending ADD move
      if (this.moveStateProvider.hasPendingAddForNode(nodeId)) {
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

    const targetReplicaCount = targetState.targetReplicaCount;
    const shouldDeferAddsInDegraded = isDegradedPlacement &&
      healthyReplicas.length >= targetReplicaCount &&
      addMoves.length > 0;

    // Calculate total healthy replicas after pending ADDs complete
    const totalHealthyAfterAdds = healthyReplicas.length + addMoves.length;
    const candidateRemoves = [];

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
        if (this.moveStateProvider.hasPendingMove(replicaId)) {
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

        // In degraded topology (insufficient ready nodes), defer standalone non-failed
        // removals by default. The only exception is when we are explicitly planning
        // REPLACE moves (paired add+remove) to improve spread without add-only growth.
        if (isDegradedPlacement && !shouldDeferAddsInDegraded) {
          this.logger.debug(REBALANCER_LOG_MSG.DEFER_REMOVE_DETAIL, {
            entityId: this.entityId,
            replicaId,
            nodeId,
            reason,
            degraded: true,
            availableNodeCount: targetState.availableNodeCount || 0,
            targetReplicaCount,
          });
          continue;
        }

        // For "spread_replicas" removals, only proceed if we'll have excess
        // replicas after the ADDs complete. This ensures we don't remove
        // replicas until new ones are stable.
        if (reason === 'spread_replicas') {
          // Count how many spread REMOVE moves are already queued.
          const existingRemoves = candidateRemoves.filter(
            (m) => m.reason === 'spread_replicas',
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

        candidateRemoves.push({
          type: MoveType.REMOVE,
          replicaId,
          nodeId: nodeId,
          reason,
        });
      }
    }

    const canUseDegradedReplace = isDegradedPlacement &&
      shouldDeferAddsInDegraded &&
      candidateRemoves.length > 0;

    if (shouldDeferAddsInDegraded && !canUseDegradedReplace) {
      this.logger.debug(REBALANCER_LOG_MSG.DEFER_ADD_DEGRADED, {
        entityId: this.entityId,
        healthyReplicaCount: healthyReplicas.length,
        targetReplicaCount,
        deferredAddCount: addMoves.length,
        availableNodeCount: targetState.availableNodeCount || 0,
      });
      addMoves.length = 0;
    }

    if (addMoves.length > 0 &&
        candidateRemoves.length > 0 &&
        (!isDegradedPlacement || canUseDegradedReplace)) {
      const replaceCandidates = candidateRemoves.filter((move) => {
        return move.reason === 'node_not_in_target' ||
          move.reason === 'spread_replicas';
      });
      const replaceCount = Math.min(addMoves.length, replaceCandidates.length);
      const consumedRemoveReplicaIds = new Set();

      for (let i = 0; i < replaceCount; i++) {
        const addMove = addMoves.shift();
        const removeMove = replaceCandidates[i];
        consumedRemoveReplicaIds.add(removeMove.replicaId);
        replaceMoves.push({
          type: MoveType.REPLACE,
          nodeId: addMove.nodeId,
          sourceNodeId: removeMove.nodeId,
          replicaId: removeMove.replicaId,
          reason: 'replace_replica',
        });
      }

      if (!isDegradedPlacement) {
        moves.push(...candidateRemoves.filter((move) => {
          return !consumedRemoveReplicaIds.has(move.replicaId);
        }));
      } else {
        const deferredAddCount = addMoves.length;
        if (deferredAddCount > 0) {
          this.logger.debug(REBALANCER_LOG_MSG.DEFER_ADD_DEGRADED, {
            entityId: this.entityId,
            healthyReplicaCount: healthyReplicas.length,
            targetReplicaCount,
            deferredAddCount,
            replaceMoveCount: replaceMoves.length,
            availableNodeCount: targetState.availableNodeCount || 0,
          });
        }
        // Keep degraded placement bounded by executing only paired REPLACE moves.
        addMoves.length = 0;
      }
    } else {
      moves.push(...candidateRemoves);
    }

    // Add the ADD moves to the moves array
    moves.push(...addMoves);

    // CRITICAL: If there are any ADD moves, only include critical REMOVE moves.
    // Critical REMOVE moves are:
    // 1. Failed replicas (reason: 'replica_failed')
    // 2. Replicas on nodes not in target placement (reason: 'node_not_in_target')
    //
    // The 'node_not_in_target' case is critical because it means the node has
    // replicas that should be redistributed to other nodes. Without removing
    // these, the system accumulates excess replicas as nodes join.
    //
    // Non-critical REMOVE moves (reason: 'spread_replicas') are deferred until
    // ADD moves complete to prevent data loss during rebalancing.
    if (addMoves.length > 0) {
      // Include critical REMOVE moves: failed replicas and (when not degraded)
      // replicas on nodes outside target placement.
      const criticalRemoves = moves.filter(
        (m) => m.type === MoveType.REMOVE &&
          (m.reason === 'replica_failed' ||
            (!isDegradedPlacement && m.reason === 'node_not_in_target')),
      );
      // Return ADD moves and critical removes
      const filteredMoves = [...replaceMoves, ...addMoves, ...criticalRemoves];

      const deferredCount = moves.filter(
        (m) => m.type === MoveType.REMOVE &&
          m.reason !== 'replica_failed' &&
          m.reason !== 'node_not_in_target',
      ).length;

      if (criticalRemoves.length > 0 || deferredCount > 0) {
        this.logger.info(REBALANCER_LOG_MSG.INCLUDE_CRITICAL_REMOVE, {
          entityId: this.entityId,
          addMoveCount: addMoves.length,
          criticalRemoveCount: criticalRemoves.length,
          deferredRemoveCount: deferredCount,
        });
      }

      return filteredMoves;
    }

    // Include computed REPLACE and ADD moves.
    moves.push(...replaceMoves);
    moves.push(...addMoves);

    // Sort moves: failed REMOVE first, then REPLACE, then ADD, then REMOVE.
    // This ensures we add new replicas before removing old ones, maintaining
    // replica count and data availability during rebalancing.
    // The only exception is failed replicas which should be removed immediately.
    moves.sort((a, b) => {
      const getPriority = (move) => {
        if (move.type === MoveType.REMOVE && move.reason === 'replica_failed') {
          return 0;
        }
        if (move.type === MoveType.REPLACE) {
          return 1;
        }
        if (move.type === MoveType.ADD) {
          return 2;
        }
        return 3;
      };
      return getPriority(a) - getPriority(b);
    });

    return moves;
  }
}

export {MovePlanner};
