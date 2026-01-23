/**
 * State-Aware Rebalancer - Rebalancer that respects node lifecycle states.
 * Only considers READY nodes for replica placement and handles DRAINING nodes.
 * Requirements: 5.3, 5.6, 5.8
 */

import {EventEmitter} from 'events';
import {NodeState} from '../node/node-lifecycle-state-machine.js';

/**
 * StateAwareRebalancer manages replica placement while respecting node lifecycle states.
 * Key behaviors:
 * - Only READY nodes are considered for replica placement
 * - DRAINING nodes have their replicas relocated to READY nodes
 * - Batches multiple moves into a single epoch proposal
 *
 * @extends EventEmitter
 */
class StateAwareRebalancer extends EventEmitter {
  /**
   * Create a new StateAwareRebalancer.
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - The ID of this node.
   * @param {number} [options.maxMovesPerEpoch=10] - Maximum moves per epoch proposal.
   */
  constructor(options = {}) {
    super();

    this._nodeId = options.nodeId || 'unknown';
    this._maxMovesPerEpoch = options.maxMovesPerEpoch || 10;

    // Track pending moves for batching
    this._pendingMoves = [];
  }

  /**
   * Check if rebalancing should consider a node for replica placement.
   * Only nodes in READY state are considered.
   *
   * @param {string} nodeId - The node ID.
   * @param {string} nodeState - The node's current state.
   * @return {boolean} True if node should be considered for placement.
   */
  shouldConsiderNode(nodeId, nodeState) {
    // Only READY nodes are considered for replica placement
    return nodeState === NodeState.READY;
  }

  /**
   * Calculate rebalancing moves respecting node states.
   * - Only places replicas on READY nodes
   * - Moves replicas away from DRAINING nodes
   * - Batches moves into a single epoch proposal
   *
   * @param {Object} currentEpoch - The current AssignmentEpoch.
   * @param {Map<string, string>} nodeStates - Map of nodeId to state.
   * @return {Object} Proposed assignment changes.
   */
  calculateMoves(currentEpoch, nodeStates) {
    // Get nodes by state
    const readyNodes = [];
    const drainingNodes = [];

    for (const [nodeId, state] of nodeStates) {
      if (state === NodeState.READY) {
        readyNodes.push(nodeId);
      } else if (state === NodeState.DRAINING) {
        drainingNodes.push(nodeId);
      }
    }

    // If no ready nodes, we can't do anything
    if (readyNodes.length === 0) {
      return {
        moves: [],
        proposedAssignments: null,
        reason: 'no_ready_nodes',
      };
    }

    const moves = [];
    const currentAssignments = currentEpoch.assignments;
    const newAssignments = {};

    // Deep copy current assignments
    for (const [partitionId, nodeList] of Object.entries(currentAssignments)) {
      newAssignments[partitionId] = [...nodeList];
    }

    // Process each partition
    for (const [partitionId, nodeList] of Object.entries(currentAssignments)) {
      const updatedNodeList = [...nodeList];
      let modified = false;

      // Find replicas on draining nodes and relocate them
      for (let i = 0; i < updatedNodeList.length; i++) {
        const currentNodeId = updatedNodeList[i];
        const nodeState = nodeStates.get(currentNodeId);

        // If node is draining, find a ready node to move the replica to
        if (nodeState === NodeState.DRAINING) {
          // Find a ready node that doesn't already have this partition
          const targetNode = this._findTargetNode(
            readyNodes,
            updatedNodeList,
            partitionId,
          );

          if (targetNode) {
            moves.push({
              type: 'relocate',
              partitionId,
              fromNode: currentNodeId,
              toNode: targetNode,
              reason: 'draining_node',
            });

            updatedNodeList[i] = targetNode;
            modified = true;
          }
        }
      }

      // Also check for replicas on non-ready, non-draining nodes
      // (e.g., JOINING, SYNCING, STOPPED)
      for (let i = 0; i < updatedNodeList.length; i++) {
        const currentNodeId = updatedNodeList[i];
        const nodeState = nodeStates.get(currentNodeId);

        // Skip if node is ready or draining (draining handled above)
        if (nodeState === NodeState.READY || nodeState === NodeState.DRAINING) {
          continue;
        }

        // Node is in a non-ready state, find a ready replacement
        const targetNode = this._findTargetNode(
          readyNodes,
          updatedNodeList,
          partitionId,
        );

        if (targetNode) {
          moves.push({
            type: 'relocate',
            partitionId,
            fromNode: currentNodeId,
            toNode: targetNode,
            reason: 'node_not_ready',
          });

          updatedNodeList[i] = targetNode;
          modified = true;
        }
      }

      if (modified) {
        newAssignments[partitionId] = updatedNodeList;
      }
    }

    // Limit moves per epoch
    const limitedMoves = moves.slice(0, this._maxMovesPerEpoch);

    // If we limited moves, we need to recalculate assignments
    if (limitedMoves.length < moves.length) {
      // Rebuild assignments with only the limited moves
      const limitedAssignments = {};
      for (const [partitionId, nodeList] of Object.entries(currentAssignments)) {
        limitedAssignments[partitionId] = [...nodeList];
      }

      for (const move of limitedMoves) {
        const nodeList = limitedAssignments[move.partitionId];
        const idx = nodeList.indexOf(move.fromNode);
        if (idx !== -1) {
          nodeList[idx] = move.toNode;
        }
      }

      return {
        moves: limitedMoves,
        proposedAssignments: limitedMoves.length > 0 ? limitedAssignments : null,
        reason: limitedMoves.length > 0 ? 'rebalancing_needed' : 'no_moves_needed',
        truncated: true,
        totalMoves: moves.length,
      };
    }

    return {
      moves: limitedMoves,
      proposedAssignments: limitedMoves.length > 0 ? newAssignments : null,
      reason: limitedMoves.length > 0 ? 'rebalancing_needed' : 'no_moves_needed',
    };
  }

  /**
   * Find a target node for replica placement.
   * Selects a ready node that doesn't already have this partition.
   *
   * @param {string[]} readyNodes - Array of ready node IDs.
   * @param {string[]} currentNodeList - Current nodes hosting this partition.
   * @param {string} _partitionId - The partition ID (for logging).
   * @return {string|null} Target node ID or null if none available.
   * @private
   */
  _findTargetNode(readyNodes, currentNodeList, _partitionId) {
    // Find ready nodes that don't already have this partition
    const availableNodes = readyNodes.filter(
      (nodeId) => !currentNodeList.includes(nodeId),
    );

    if (availableNodes.length === 0) {
      return null;
    }

    // Simple selection: pick the first available node
    // In a production system, this would consider load balancing
    return availableNodes[0];
  }

  /**
   * Handle CDC event for node state change.
   * Triggers rebalancing when nodes transition to/from READY or DRAINING states.
   *
   * @param {string} nodeId - The node ID.
   * @param {string} oldState - The previous state.
   * @param {string} newState - The new state.
   */
  onNodeStateChange(nodeId, oldState, newState) {
    // Emit event for state change
    this.emit('nodeStateChange', {
      nodeId,
      oldState,
      newState,
      timestamp: Date.now(),
    });

    // Determine if rebalancing is needed
    let rebalanceNeeded = false;
    let reason = null;

    // Node became READY - may need to rebalance to use this node
    if (newState === NodeState.READY && oldState !== NodeState.READY) {
      rebalanceNeeded = true;
      reason = 'node_became_ready';
    }

    // Node started DRAINING - need to move replicas away
    if (newState === NodeState.DRAINING) {
      rebalanceNeeded = true;
      reason = 'node_draining';
    }

    // Node left READY state (not to DRAINING) - may need to relocate replicas
    if (oldState === NodeState.READY &&
        newState !== NodeState.READY &&
        newState !== NodeState.DRAINING) {
      rebalanceNeeded = true;
      reason = 'node_left_ready';
    }

    // Node stopped - need to relocate replicas
    if (newState === NodeState.STOPPED) {
      rebalanceNeeded = true;
      reason = 'node_stopped';
    }

    if (rebalanceNeeded) {
      this.emit('rebalanceNeeded', {
        nodeId,
        oldState,
        newState,
        reason,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Get all ready nodes from a node states map.
   *
   * @param {Map<string, string>} nodeStates - Map of nodeId to state.
   * @return {string[]} Array of ready node IDs.
   */
  getReadyNodes(nodeStates) {
    const readyNodes = [];
    for (const [nodeId, state] of nodeStates) {
      if (this.shouldConsiderNode(nodeId, state)) {
        readyNodes.push(nodeId);
      }
    }
    return readyNodes;
  }

  /**
   * Get all draining nodes from a node states map.
   *
   * @param {Map<string, string>} nodeStates - Map of nodeId to state.
   * @return {string[]} Array of draining node IDs.
   */
  getDrainingNodes(nodeStates) {
    const drainingNodes = [];
    for (const [nodeId, state] of nodeStates) {
      if (state === NodeState.DRAINING) {
        drainingNodes.push(nodeId);
      }
    }
    return drainingNodes;
  }

  /**
   * Check if any replicas need to be moved from draining nodes.
   *
   * @param {Object} currentEpoch - The current AssignmentEpoch.
   * @param {Map<string, string>} nodeStates - Map of nodeId to state.
   * @return {boolean} True if replicas need to be moved.
   */
  hasDrainingNodeReplicas(currentEpoch, nodeStates) {
    const drainingNodes = this.getDrainingNodes(nodeStates);

    if (drainingNodes.length === 0) {
      return false;
    }

    const drainingSet = new Set(drainingNodes);

    for (const nodeList of Object.values(currentEpoch.assignments)) {
      for (const nodeId of nodeList) {
        if (drainingSet.has(nodeId)) {
          return true;
        }
      }
    }

    return false;
  }
}

export {StateAwareRebalancer};
