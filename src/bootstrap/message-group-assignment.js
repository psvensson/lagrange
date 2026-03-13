/**
 * Message Group Assignment - Strategies for assigning message groups to new nodes.
 * Implements replica movement and self-hosted creation strategies.
 * Requirements: 7.5, 7.6, 7.9
 */

import {LoggingService} from '../logging/logging-service.js';
import {NUM, STRING} from '../constants/index.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {
  MESSAGE_GROUP_ASSIGNMENT_DEFAULT,
  MESSAGE_GROUP_ASSIGNMENT_ERROR,
  MESSAGE_GROUP_ASSIGNMENT_LOG_MSG,
  MESSAGE_GROUP_ASSIGNMENT_STRATEGY,
  MESSAGE_GROUP_ASSIGNMENT_SUBSYSTEM,
} from './message-group-assignment-constants.js';

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
    this.seedNodeAddress = options.seedNodeAddress || STRING.EMPTY;

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(MESSAGE_GROUP_ASSIGNMENT_SUBSYSTEM) : console;
  }

  /**
   * Determine message group assignment for a new node.
   * Strategy 1: Move replica from node with 2+ replicas
   * Strategy 2: Create self-hosted message group (3 replicas on new node)
   * @param {string} newNodeId - New node ID.
   * @param {Array<Object>} messageGroups - Existing message groups.
   * @param {Object} [options={}] - Optional assignment filters.
   * @param {Set<string>} [options.excludedReplicaIds] - Replica IDs that are
   *   temporarily unavailable for MOVE_REPLICA selection.
   * @param {Set<string>} [options.excludedSourceNodeIds] - Source nodes that
   *   must not be selected for MOVE_REPLICA assignments.
   * @return {Object} Assignment instructions.
   */
  determineAssignment(newNodeId, messageGroups, options = {}) {
    this.logger.debug(MESSAGE_GROUP_ASSIGNMENT_LOG_MSG.DETERMINING, {
      newNodeId,
      messageGroupCount: messageGroups.length,
      excludedReplicaCount:
        options.excludedReplicaIds instanceof Set ?
          options.excludedReplicaIds.size :
          NUM.ZERO,
    });

    // Strategy 1: Find a message group with 2+ replicas on the same node
    const excludedSourceNodeIds = new Set(
      options.excludedSourceNodeIds instanceof Set ?
        options.excludedSourceNodeIds :
        [],
    );
    if (typeof newNodeId === 'string' && newNodeId.length > NUM.ZERO) {
      excludedSourceNodeIds.add(newNodeId);
    }
    const movableReplica = this.findMovableReplica(messageGroups, {
      ...options,
      excludedSourceNodeIds,
    });

    if (movableReplica) {
      this.logger.info(MESSAGE_GROUP_ASSIGNMENT_LOG_MSG.USING_MOVE_REPLICA, {
        newNodeId,
        groupId: movableReplica.groupId,
        sourceNodeId: movableReplica.sourceNodeId,
        replicaToMove: movableReplica.replicaId,
      });

      return {
        strategy: MESSAGE_GROUP_ASSIGNMENT_STRATEGY.MOVE_REPLICA,
        groupId: movableReplica.groupId,
        sourceNodeId: movableReplica.sourceNodeId,
        replicaToMove: movableReplica.replicaId,
        replicaAddresses: movableReplica.replicaAddresses,
        existingPeerIds: movableReplica.peerIds,
      };
    }

    // Strategy 2: Create self-hosted message group
    const newGroupId = this.generateGroupId(newNodeId);

    this.logger.info(MESSAGE_GROUP_ASSIGNMENT_LOG_MSG.USING_CREATE_SELF_HOSTED, {
      newNodeId,
      newGroupId,
    });

    return {
      strategy: MESSAGE_GROUP_ASSIGNMENT_STRATEGY.CREATE_SELF_HOSTED,
      groupId: newGroupId,
      replicaCount: MESSAGE_GROUP_ASSIGNMENT_DEFAULT.REPLICA_COUNT,
    };
  }

  /**
   * Find a message group with 2+ replicas on the same node.
   * @param {Array<Object>} messageGroups - Message groups to search.
   * @param {Object} [options={}] - Optional candidate filters.
   * @param {Set<string>} [options.excludedReplicaIds] - Replica IDs excluded
   *   from MOVE_REPLICA consideration.
   * @param {Set<string>} [options.excludedSourceNodeIds] - Source nodes
   *   excluded from MOVE_REPLICA consideration.
   * @return {Object|null} Movable replica info or null.
   */
  findMovableReplica(messageGroups, options = {}) {
    const excludedReplicaIds = options.excludedReplicaIds instanceof Set ?
      options.excludedReplicaIds :
      null;
    const excludedSourceNodeIds = options.excludedSourceNodeIds instanceof Set ?
      options.excludedSourceNodeIds :
      null;

    for (const group of messageGroups) {
      const replicas = group.replicas || [];

      // Skip groups with fewer than 3 replicas
      if (replicas.length < MESSAGE_GROUP_ASSIGNMENT_DEFAULT.MIN_REPLICAS_FOR_MOVE) {
        continue;
      }

      // Count replicas per node
      const selectableReplicas = excludedReplicaIds ?
        replicas.filter((replica) =>
          !excludedReplicaIds.has(replica.replica_id),
        ) :
        replicas;

      // If reservations leave fewer than 2 replicas on every node, this
      // group cannot safely provide another MOVE_REPLICA candidate.
      const replicasByNode = this.countReplicasByNode(selectableReplicas);

      // Find node with 2+ replicas
      for (const [nodeId, nodeReplicas] of replicasByNode) {
        if (excludedSourceNodeIds?.has(nodeId)) {
          continue;
        }
        if (nodeReplicas.length >= MESSAGE_GROUP_ASSIGNMENT_DEFAULT.MIN_REPLICAS_ON_NODE_FOR_MOVE) {
          const nonLeaderReplicas = nodeReplicas.filter((replica) =>
            replica.raft_role !== RAFT_ROLE.LEADER,
          );
          const replicaToMove = nonLeaderReplicas.length > NUM.ZERO ?
            nonLeaderReplicas[NUM.ZERO] :
            nodeReplicas[NUM.ZERO];

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
    const normalizedNodeId = typeof nodeId === 'string' ?
      nodeId.replace(/[^a-zA-Z0-9]/g, STRING.EMPTY) :
      STRING.EMPTY;
    if (normalizedNodeId.length === NUM.ZERO) {
      return `${MESSAGE_GROUP_ASSIGNMENT_DEFAULT.GROUP_ID_PREFIX}` +
        MESSAGE_GROUP_ASSIGNMENT_DEFAULT.GROUP_ID_FALLBACK;
    }

    const headLength = MESSAGE_GROUP_ASSIGNMENT_DEFAULT.GROUP_ID_HEAD_LENGTH;
    const tailLength = MESSAGE_GROUP_ASSIGNMENT_DEFAULT.GROUP_ID_TAIL_LENGTH;
    const groupPrefix = MESSAGE_GROUP_ASSIGNMENT_DEFAULT.GROUP_ID_PREFIX;
    const separator = MESSAGE_GROUP_ASSIGNMENT_DEFAULT.GROUP_ID_SEGMENT_SEPARATOR;
    const headSegment = normalizedNodeId.slice(NUM.ZERO, headLength);

    if (normalizedNodeId.length <= headLength) {
      return `${groupPrefix}${headSegment}`;
    }

    const tailSegment = normalizedNodeId.slice(-tailLength);
    return `${groupPrefix}${headSegment}${separator}${tailSegment}`;
  }

  /**
   * Generate replica IDs for a new self-hosted message group.
   * @param {string} groupId - Message group ID.
   * @param {number} count - Number of replicas (default 3).
   * @return {Array<string>} Replica IDs.
   */
  generateReplicaIds(groupId, count = MESSAGE_GROUP_ASSIGNMENT_DEFAULT.REPLICA_COUNT) {
    const replicaIds = [];
    for (let i = NUM.ZERO; i < count; i++) {
      replicaIds.push(`${groupId}-r${i}`);
    }
    return replicaIds;
  }

  /**
   * Build unified replica addresses for Raft communication.
   * All addresses use the unified format: ${nodeId}/${entityType}/${entityId}
   * @param {string} nodeId - Node ID hosting the replicas.
   * @param {Array<string>} replicaIds - Replica IDs.
   * @param {string} entityType - Entity type (e.g., 'message-group', 'partition').
   * @return {Array<string>} Unified replica addresses.
   */
  buildReplicaAddresses(
    nodeId,
    replicaIds,
    entityType = MESSAGE_GROUP_ASSIGNMENT_DEFAULT.DEFAULT_ENTITY_TYPE,
  ) {
    return replicaIds.map((id) => `${nodeId}/${entityType}/${id}`);
  }

  /**
   * Validate assignment instructions.
   * @param {Object} assignment - Assignment to validate.
   * @return {Object} Validation result with isValid and errors.
   */
  validateAssignment(assignment) {
    const errors = [];

    if (!assignment) {
      return {
        isValid: false,
        errors: [MESSAGE_GROUP_ASSIGNMENT_ERROR.ASSIGNMENT_REQUIRED],
      };
    }

    if (!assignment.strategy) {
      errors.push(MESSAGE_GROUP_ASSIGNMENT_ERROR.STRATEGY_REQUIRED);
    } else if (!Object.values(MESSAGE_GROUP_ASSIGNMENT_STRATEGY).includes(assignment.strategy)) {
      errors.push(MESSAGE_GROUP_ASSIGNMENT_ERROR.invalidStrategy(assignment.strategy));
    }

    if (!assignment.groupId) {
      errors.push(MESSAGE_GROUP_ASSIGNMENT_ERROR.GROUP_ID_REQUIRED);
    }

    if (assignment.strategy === MESSAGE_GROUP_ASSIGNMENT_STRATEGY.MOVE_REPLICA) {
      if (!assignment.sourceNodeId) {
        errors.push(MESSAGE_GROUP_ASSIGNMENT_ERROR.SOURCE_NODE_REQUIRED);
      }
      if (!assignment.replicaToMove) {
        errors.push(MESSAGE_GROUP_ASSIGNMENT_ERROR.REPLICA_TO_MOVE_REQUIRED);
      }
      if (!assignment.replicaAddresses ||
          assignment.replicaAddresses.length === NUM.ZERO) {
        errors.push(MESSAGE_GROUP_ASSIGNMENT_ERROR.REPLICA_ADDRESSES_REQUIRED);
      }
    }

    if (assignment.strategy === MESSAGE_GROUP_ASSIGNMENT_STRATEGY.CREATE_SELF_HOSTED) {
      if (!assignment.replicaCount ||
          assignment.replicaCount < MESSAGE_GROUP_ASSIGNMENT_DEFAULT.RAFT_MIN_REPLICA_COUNT) {
        errors.push(MESSAGE_GROUP_ASSIGNMENT_ERROR.REPLICA_COUNT_MIN);
      }
      if (assignment.replicaCount % MESSAGE_GROUP_ASSIGNMENT_DEFAULT.RAFT_ODD_MODULO === NUM.ZERO) {
        errors.push(MESSAGE_GROUP_ASSIGNMENT_ERROR.REPLICA_COUNT_ODD);
      }
    }

    return {
      isValid: errors.length === NUM.ZERO,
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
    const messageGroupsNeeded = Math.ceil(
      nodeCount / MESSAGE_GROUP_ASSIGNMENT_DEFAULT.DISTRIBUTION_NODES_PER_GROUP,
    );

    // Each message group has exactly 3 replicas
    const totalReplicas = messageGroupsNeeded *
      MESSAGE_GROUP_ASSIGNMENT_DEFAULT.REPLICA_COUNT;

    // Average replicas per node
    const avgReplicasPerNode = totalReplicas / nodeCount;

    return {
      nodeCount,
      messageGroupsNeeded,
      totalReplicas,
      avgReplicasPerNode: Math.round(
        avgReplicasPerNode * MESSAGE_GROUP_ASSIGNMENT_DEFAULT.ROUNDING_MULTIPLIER,
      ) / MESSAGE_GROUP_ASSIGNMENT_DEFAULT.ROUNDING_DIVISOR,
    };
  }
}

export {MessageGroupAssignment, MESSAGE_GROUP_ASSIGNMENT_STRATEGY};
