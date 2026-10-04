/**
 * Message Group Assignment - how a new node gets its message group.
 *
 * Every joiner hosts its own message group (CREATE_SELF_HOSTED); a node that
 * already holds one rejoins it. A message-group replica is never moved to a
 * joiner: its raft id derives from its name, so a move re-opened a committed
 * identity on a new host with an empty log and no conf change (the leader
 * kept its progress) - vote amnesia, a trapped core, two leaders in one term
 * (the identity-reuse safety fix). Spreading
 * a group over nodes is a fresh-identity ADD and promotion, never a move.
 * Requirements: 7.5, 7.6, 7.9
 */

import {LoggingService} from '../logging/logging-service.js';
import {STRING} from '../constants/index.js';
import {
  DECLARED_MESSAGE_GROUP_REPLICA_COUNT_DEFAULT,
  REPLICATION_TARGET_SOURCE,
  resolveDesiredReplicationFactor,
} from './replication-target-authority.js';
import {
  MESSAGE_GROUP_ASSIGNMENT_DEFAULT,
  MESSAGE_GROUP_ASSIGNMENT_ERROR,
  MESSAGE_GROUP_ASSIGNMENT_LOG_MSG,
  MESSAGE_GROUP_ASSIGNMENT_STRATEGY,
  MESSAGE_GROUP_ASSIGNMENT_SUBSYSTEM,
} from './message-group-assignment-constants.js';

const LOCAL_STR_STRING = 'string';

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
   * Determine message group assignment for a new node: rejoin the group it
   * already holds, or host a new self-hosted group.
   * @param {string} newNodeId - New node ID.
   * @param {Array<Object>} messageGroups - Existing message groups.
   * @param {Object} [options={}] - Optional assignment filters.
   * @param {boolean} [options.allowRejoinSingleOwnedGroup=false] - When true,
   *   a durable rejoin may reuse a single existing non-canonical owned group.
   * @return {Object} Assignment instructions.
   */
  determineAssignment(newNodeId, messageGroups, options = {}) {
    this.logger.debug(MESSAGE_GROUP_ASSIGNMENT_LOG_MSG.DETERMINING, {
      newNodeId,
      messageGroupCount: messageGroups.length,
    });

    // If the joining node already has a message group replica,
    // it is a restarting node: CREATE_SELF_HOSTED rejoins its existing
    // group with the same deterministic group ID.
    const existingMembershipGroupId =
      this.findExistingMembershipGroupId(newNodeId, messageGroups, options);
    if (existingMembershipGroupId) {
      const newGroupId = existingMembershipGroupId;
      const existingGroup = messageGroups.find((group) =>
        group?.group_id === newGroupId,
      ) || null;
      const existingReplicas = Array.isArray(existingGroup?.replicas) ?
        existingGroup.replicas :
        [];
      const startupReplicaIds = existingReplicas.filter((replica) =>
        replica?.node_id === newNodeId,
      ).map((replica) => replica.replica_id);

      this.logger.info(
        MESSAGE_GROUP_ASSIGNMENT_LOG_MSG.EXISTING_MEMBERSHIP_DETECTED,
        {newNodeId, newGroupId},
      );

      // The identity-mint plan for a reused group follows the group's
      // DECLARED policy, decoded by the single authority. The observed
      // replica count (existingReplicas.length) is runtime identity state:
      // a partially formed group reported 1 and that count was silently
      // restated as the plan, failing the odd/minimum validation and
      // under-minting on restart.
      const reusedGroupTarget = resolveDesiredReplicationFactor(existingGroup);
      return {
        strategy: MESSAGE_GROUP_ASSIGNMENT_STRATEGY.CREATE_SELF_HOSTED,
        groupId: newGroupId,
        replicaCount:
          reusedGroupTarget.source === REPLICATION_TARGET_SOURCE.UNDECLARED ?
            DECLARED_MESSAGE_GROUP_REPLICA_COUNT_DEFAULT :
            reusedGroupTarget.replicationFactor,
        reuseExistingGroup: true,
        startupReplicaIds,
      };
    }

    // Host a new self-hosted message group.
    const newGroupId = this.generateGroupId(newNodeId);

    this.logger.info(MESSAGE_GROUP_ASSIGNMENT_LOG_MSG.USING_CREATE_SELF_HOSTED, {
      newNodeId,
      newGroupId,
    });

    return {
      strategy: MESSAGE_GROUP_ASSIGNMENT_STRATEGY.CREATE_SELF_HOSTED,
      groupId: newGroupId,
      // A fresh self-hosted group is a creation: its plan follows the
      // MESSAGE_GROUPS schema declaration, not a restated literal.
      replicaCount: DECLARED_MESSAGE_GROUP_REPLICA_COUNT_DEFAULT,
    };
  }

  /**
   * Check whether the joining node already has a replica in any
   * existing message group. A node with existing membership is
   * a restarting node and should rejoin its group via
   * CREATE_SELF_HOSTED rather than hosting a new group.
   *
   * Returns true when the node already owns a canonical restart group.
   * This is normally the node-ID-derived self-hosted group, but durable
   * restart ownership can also be an existing replicated control-plane group
   * when the caller explicitly opts into that behavior.
   * @param {string} nodeId - Joining node ID.
   * @param {Array<Object>} messageGroups - Existing message groups.
   * @param {Object} [options={}] - Membership detection options.
   * @return {boolean} True when the node's canonical group exists.
   */
  hasExistingMembership(nodeId, messageGroups, options = {}) {
    return this.findExistingMembershipGroupId(
      nodeId,
      messageGroups,
      options,
    ) !== null;
  }

  /**
   * Resolve the canonical restart group already owned by the joining node.
   * @param {string} nodeId - Joining node ID.
   * @param {Array<Object>} messageGroups - Existing message groups.
   * @param {Object} [options={}] - Membership detection options.
   * @return {string|null} Existing canonical group ID or null.
   */
  findExistingMembershipGroupId(nodeId, messageGroups, options = {}) {
    if (typeof nodeId !== LOCAL_STR_STRING || nodeId.length === 0) {
      return null;
    }
    const canonicalGroupId = this.generateGroupId(nodeId);
    for (const group of messageGroups) {
      if (group.group_id === canonicalGroupId) {
        return canonicalGroupId;
      }
    }

    const ownedGroupIds = [];
    const fullyOwnedGroupIds = [];
    for (const group of messageGroups) {
      const replicas = Array.isArray(group?.replicas) ? group.replicas : [];
      const ownedReplicaCount = replicas.filter((replica) =>
        replica?.node_id === nodeId,
      ).length;
      if (ownedReplicaCount > 0) {
        ownedGroupIds.push(group.group_id || null);
      }
      if (ownedReplicaCount >= MESSAGE_GROUP_ASSIGNMENT_DEFAULT.REPLICA_COUNT) {
        fullyOwnedGroupIds.push(group.group_id || null);
      }
    }

    if (fullyOwnedGroupIds.length > 0) {
      return fullyOwnedGroupIds[0];
    }

    if (options.allowRejoinSingleOwnedGroup === true &&
        ownedGroupIds.length === 1) {
      return ownedGroupIds[0];
    }

    return null;
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
    if (normalizedNodeId.length === 0) {
      return `${MESSAGE_GROUP_ASSIGNMENT_DEFAULT.GROUP_ID_PREFIX}` +
        MESSAGE_GROUP_ASSIGNMENT_DEFAULT.GROUP_ID_FALLBACK;
    }

    const headLength = MESSAGE_GROUP_ASSIGNMENT_DEFAULT.GROUP_ID_HEAD_LENGTH;
    const tailLength = MESSAGE_GROUP_ASSIGNMENT_DEFAULT.GROUP_ID_TAIL_LENGTH;
    const groupPrefix = MESSAGE_GROUP_ASSIGNMENT_DEFAULT.GROUP_ID_PREFIX;
    const separator = MESSAGE_GROUP_ASSIGNMENT_DEFAULT.GROUP_ID_SEGMENT_SEPARATOR;
    const headSegment = normalizedNodeId.slice(0, headLength);

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
    for (let i = 0; i < count; i++) {
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

    if (assignment.strategy === MESSAGE_GROUP_ASSIGNMENT_STRATEGY.CREATE_SELF_HOSTED) {
      if (!assignment.replicaCount ||
          assignment.replicaCount < MESSAGE_GROUP_ASSIGNMENT_DEFAULT.RAFT_MIN_REPLICA_COUNT) {
        errors.push(MESSAGE_GROUP_ASSIGNMENT_ERROR.REPLICA_COUNT_MIN);
      }
      if (assignment.replicaCount % MESSAGE_GROUP_ASSIGNMENT_DEFAULT.RAFT_ODD_MODULO === 0) {
        errors.push(MESSAGE_GROUP_ASSIGNMENT_ERROR.REPLICA_COUNT_ODD);
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
