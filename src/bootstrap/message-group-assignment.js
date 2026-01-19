/**
 * Message Group Assignment - Strategies for assigning message groups to new nodes.
 * Implements replica movement and self-hosted creation strategies.
 * Requirements: 7.5, 7.6, 7.9
 */

import {LoggingService} from '../logging/logging-service.js';

/**
 * Assignment strategy types.
 */
const AssignmentStrategy = {
  MOVE_REPLICA: 'MOVE_REPLICA',
  CREATE_SELF_HOSTED: 'CREATE_SELF_HOSTED',
};

/**
 * MessageGroupAssignment handles determining how new nodes get message group access.
 */
class MessageGroupAssignment {
  /**
   * Create a new MessageGroupAssignment.
   * @param {Object} options - Configuration options.
   * @param {string} options.seedNodeAddress - Seed node address for building addresses.
   */
  constructor(options = {}) {
    this.seedNodeAddress = options.seedNodeAddress || '';

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem('message-group-assignment') : console;
  }

  /**
   * Determine message group assignment for a new node.
   * Strategy 1: Move replica from node with 2+ replicas
   * Strategy 2: Create self-hosted message group (3 replicas on new node)
   * @param {string} newNodeId - New node ID.
   * @param {Array<Object>} messageGroups - Existing message groups.
   * @return {Object} Assignment instructions.
   */
  determineAssignment(newNodeId, messageGroups) {
    this.logger.debug('Determining message group assignment', {
      newNodeId,
      messageGroupCount: messageGroups.length,
    });

    // Strategy 1: Find a message group with 2+ replicas on the same node
    const movableReplica = this.findMovableReplica(messageGroups);

    if (movableReplica) {
      this.logger.info('Using MOVE_REPLICA strategy', {
        newNodeId,
        groupId: movableReplica.groupId,
        sourceNodeId: movableReplica.sourceNodeId,
        replicaToMove: movableReplica.replicaId,
      });

      return {
        strategy: AssignmentStrategy.MOVE_REPLICA,
        groupId: movableReplica.groupId,
        sourceNodeId: movableReplica.sourceNodeId,
        replicaToMove: movableReplica.replicaId,
        replicaAddresses: movableReplica.replicaAddresses,
        existingPeerIds: movableReplica.peerIds,
      };
    }

    // Strategy 2: Create self-hosted message group
    const newGroupId = this.generateGroupId(newNodeId);

    this.logger.info('Using CREATE_SELF_HOSTED strategy', {
      newNodeId,
      newGroupId,
    });

    return {
      strategy: AssignmentStrategy.CREATE_SELF_HOSTED,
      groupId: newGroupId,
      replicaCount: 3,
    };
  }

  /**
   * Find a message group with 2+ replicas on the same node.
   * @param {Array<Object>} messageGroups - Message groups to search.
   * @return {Object|null} Movable replica info or null.
   */
  findMovableReplica(messageGroups) {
    for (const group of messageGroups) {
      const replicas = group.replicas || [];

      // Skip groups with fewer than 3 replicas
      if (replicas.length < 3) {
        continue;
      }

      // Count replicas per node
      const replicasByNode = this.countReplicasByNode(replicas);

      // Find node with 2+ replicas
      for (const [nodeId, nodeReplicas] of replicasByNode) {
        if (nodeReplicas.length >= 2) {
          // Found a movable replica - pick the first one
          const replicaToMove = nodeReplicas[0];

          return {
            groupId: group.group_id,
            sourceNodeId: nodeId,
            replicaId: replicaToMove.replica_id,
            replicaAddresses: replicas.map((r) => r.address),
            peerIds: replicas.map((r) => r.replica_id),
          };
        }
      }
    }

    return null;
  }

  /**
   * Count replicas by node.
   * @param {Array<Object>} replicas - Replicas to count.
   * @return {Map<string, Array<Object>>} Map of nodeId to replicas.
   */
  countReplicasByNode(replicas) {
    const replicasByNode = new Map();

    for (const replica of replicas) {
      const nodeId = replica.node_id;
      if (!replicasByNode.has(nodeId)) {
        replicasByNode.set(nodeId, []);
      }
      replicasByNode.get(nodeId).push(replica);
    }

    return replicasByNode;
  }

  /**
   * Generate a message group ID for a new node.
   * @param {string} nodeId - Node ID.
   * @return {string} Generated group ID.
   */
  generateGroupId(nodeId) {
    // Use first 8 characters of node ID for readability
    const shortId = nodeId.substring(0, 8);
    return `mg-${shortId}`;
  }

  /**
   * Generate replica IDs for a new self-hosted message group.
   * @param {string} groupId - Message group ID.
   * @param {number} count - Number of replicas (default 3).
   * @return {Array<string>} Replica IDs.
   */
  generateReplicaIds(groupId, count = 3) {
    const replicaIds = [];
    for (let i = 0; i < count; i++) {
      replicaIds.push(`${groupId}-r${i}`);
    }
    return replicaIds;
  }

  /**
   * Build replica addresses for a node.
   * @param {string} nodeAddress - Node address.
   * @param {Array<string>} replicaIds - Replica IDs.
   * @return {Array<string>} Replica addresses.
   */
  buildReplicaAddresses(nodeAddress, replicaIds) {
    return replicaIds.map((id) => `${nodeAddress}/services/${id}`);
  }

  /**
   * Validate assignment instructions.
   * @param {Object} assignment - Assignment to validate.
   * @return {Object} Validation result with isValid and errors.
   */
  validateAssignment(assignment) {
    const errors = [];

    if (!assignment) {
      return {isValid: false, errors: ['Assignment is required']};
    }

    if (!assignment.strategy) {
      errors.push('Strategy is required');
    } else if (!Object.values(AssignmentStrategy).includes(assignment.strategy)) {
      errors.push(`Invalid strategy: ${assignment.strategy}`);
    }

    if (!assignment.groupId) {
      errors.push('Group ID is required');
    }

    if (assignment.strategy === AssignmentStrategy.MOVE_REPLICA) {
      if (!assignment.sourceNodeId) {
        errors.push('Source node ID is required for MOVE_REPLICA');
      }
      if (!assignment.replicaToMove) {
        errors.push('Replica to move is required for MOVE_REPLICA');
      }
      if (!assignment.replicaAddresses || assignment.replicaAddresses.length === 0) {
        errors.push('Replica addresses are required for MOVE_REPLICA');
      }
    }

    if (assignment.strategy === AssignmentStrategy.CREATE_SELF_HOSTED) {
      if (!assignment.replicaCount || assignment.replicaCount < 3) {
        errors.push('Replica count must be at least 3 for CREATE_SELF_HOSTED');
      }
      if (assignment.replicaCount % 2 === 0) {
        errors.push('Replica count must be odd for Raft consensus');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Calculate optimal message group distribution for a cluster.
   * @param {number} nodeCount - Number of nodes in cluster.
   * @return {Object} Distribution info.
   */
  calculateOptimalDistribution(nodeCount) {
    // Each message group serves up to 3 nodes
    const messageGroupsNeeded = Math.ceil(nodeCount / 3);

    // Each message group has exactly 3 replicas
    const totalReplicas = messageGroupsNeeded * 3;

    // Average replicas per node
    const avgReplicasPerNode = totalReplicas / nodeCount;

    return {
      nodeCount,
      messageGroupsNeeded,
      totalReplicas,
      avgReplicasPerNode: Math.round(avgReplicasPerNode * 100) / 100,
    };
  }
}

export {MessageGroupAssignment, AssignmentStrategy};
