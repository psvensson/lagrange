/**
 * Join Message Group Phase — handles joining an existing message group
 * by moving a replica during the join process.
 *
 * Extracted from NodeJoiningService to keep the orchestrator thin.
 * The class receives required dependencies via constructor injection.
 */

import {assertCritical} from '../../utils/assert.js';
import {NodeService} from '../../node/node-service.js';
import {
  MESSAGE_GROUP_ASSIGNMENT_STRATEGY as AssignmentStrategy,
} from '../message-group-assignment.js';
import {
  JOINING_ERROR_MSG,
  JOINING_LOG_MSG,
  JOINING_UNIFIED_RECONCILE,
  JOIN_REPLICA_DEFAULT,
} from '../node-joining-constants.js';
import {
  COLUMN,
  NUM,
  SERVICE_STATUS,
  SERVICE_TYPE,
  STRING,
  TABLES,
  TYPEOF,
  UNIFIED_SERVICE_TYPE,
} from '../../constants/index.js';

const DEFER_ELECTION_DEFAULT = JOIN_REPLICA_DEFAULT.DEFER_ELECTION;
const LOG_ENVELOPE_DEFAULT = JOIN_REPLICA_DEFAULT.LOG_ENVELOPE;
const LOG_REGISTRATION_DEFAULT = JOIN_REPLICA_DEFAULT.LOG_REGISTRATION;

/**
 * Handles the join-existing-message-group phase and
 * replica startup ownership assertion during the join process.
 */
class JoinMessageGroupPhase {
  /**
   * @param {Object} options
   * @param {string} options.nodeId - This node's ID.
   * @param {Object} options.delegates - Callbacks into the joining
   *   service for accessing mutable state.
   */
  constructor(options = {}) {
    this.nodeId = options.nodeId;
    this.delegates = options.delegates || {};
  }

  /**
   * Enforce single-owner invariant before starting a local
   * message-group replica.
   * Unauthorized duplicate startup must fail fast.
   * @param {string} replicaId
   * @return {void}
   */
  assertReplicaStartupOwnership(replicaId) {
    const systemTableCache =
      NodeService.getInstance().getSystemTableCache();
    if (!systemTableCache ||
        typeof systemTableCache.get !== TYPEOF.FUNCTION) {
      return;
    }

    const existingService =
      systemTableCache.get(TABLES.SERVICES, replicaId);
    if (!existingService) {
      return;
    }
    if (existingService[COLUMN.SERVICE_TYPE] !==
        SERVICE_TYPE.MESSAGE_GROUP) {
      return;
    }

    const existingNodeId =
      existingService[COLUMN.NODE_ID] || null;
    const existingStatus =
      String(existingService[COLUMN.STATUS] || STRING.UNKNOWN)
        .toLowerCase();
    if (!existingNodeId ||
        existingNodeId === this.nodeId ||
        existingStatus !== SERVICE_STATUS.ACTIVE) {
      return;
    }

    const assignment =
      this.delegates.getBootstrapResponse()
        ?.messageGroupAssignment;
    const authorizedMoveReplicaStartup = assignment &&
      assignment.strategy === AssignmentStrategy.MOVE_REPLICA &&
      assignment.replicaToMove === replicaId &&
      assignment.sourceNodeId === existingNodeId &&
      typeof assignment.assignmentId === TYPEOF.STRING &&
      assignment.assignmentId.length > NUM.ZERO;
    if (authorizedMoveReplicaStartup) {
      return;
    }

    throw new Error(
      JOINING_ERROR_MSG.replicaOwnerConflict(
        replicaId,
        existingNodeId,
        this.nodeId,
      ),
    );
  }

  /**
   * Phase 3b: Join existing message group by moving a replica.
   * Requirements: 8.3 - Services created AFTER self-connection
   * established.
   * @param {Object} assignment - Assignment instructions.
   * @return {Promise<void>}
   */
  async phaseJoinExistingMessageGroup(assignment) {
    const {
      groupId,
      peerAddresses,
      existingPeerIds,
      replicaAddresses,
    } = assignment;
    const logger = this.delegates.getLogger();

    logger.info(JOINING_LOG_MSG.JOIN_ASSIGNMENT_RECEIVED, {
      nodeId: this.nodeId,
      groupId,
      strategy: assignment.strategy,
      existingPeerIds: existingPeerIds,
      peerAddresses: peerAddresses,
      replicaAddresses: replicaAddresses,
      sourceNodeId: assignment.sourceNodeId,
      replicaToMove: assignment.replicaToMove,
    });

    // Requirements: 8.3 - MessageRouter should already be
    // initialized in phaseConnectWebSocket
    const messageRouter = this.delegates.getMessageRouter();
    if (!messageRouter) {
      throw new Error(JOINING_ERROR_MSG.MESSAGE_ROUTER_REQUIRED);
    }

    // MOVE_REPLICA strategy: Take over the existing replica ID
    // from the source node. We don't create a new replica, we
    // take over an existing one. The services table entry will
    // be UPDATED to point to this node.
    const replicaId = assignment.replicaToMove;
    if (!replicaId) {
      throw new Error(JOINING_ERROR_MSG.MOVE_REPLICA_MISSING);
    }
    this.assertReplicaStartupOwnership(replicaId);

    // The replica IDs stay the same - we're just moving one
    // replica to a different node. existingPeerIds already
    // contains all replica IDs including the one being moved.
    const allReplicaIds = existingPeerIds || [];

    logger.info(JOINING_LOG_MSG.JOIN_CREATING_WITH_PEERS, {
      nodeId: this.nodeId,
      groupId,
      replicaId,
      allReplicaIds,
      peerAddresses: peerAddresses || [],
      hasMessageRouter: !!messageRouter,
      messageRouterConnections:
        messageRouter?.getConnectedNodes?.() ||
        STRING.NOT_AVAILABLE,
    });

    this.delegates.queueJoinServiceReplica(
      this.delegates.createJoinServiceDescriptor(
        UNIFIED_SERVICE_TYPE.MESSAGE_GROUP,
        replicaId,
      ),
      {
        serviceType: UNIFIED_SERVICE_TYPE.MESSAGE_GROUP,
        groupId,
        replicaId,
        replicaIds: allReplicaIds,
        replicaIndex: NUM.ZERO,
        peerAddresses: peerAddresses || [],
        deferElection: DEFER_ELECTION_DEFAULT,
        createDelayMs: NUM.ZERO,
        logEnvelope: LOG_ENVELOPE_DEFAULT,
        logRegistration: LOG_REGISTRATION_DEFAULT,
      },
    );
    await this.delegates.triggerJoinReconciler(
      JOINING_UNIFIED_RECONCILE.MESSAGE_GROUPS_REASON,
    );

    const messageGroupServices =
      this.delegates.getMessageGroupServices();
    const messageGroup = assertCritical(
      messageGroupServices.get(replicaId),
      JOINING_ERROR_MSG.MESSAGE_GROUP_LEADER_REQUIRED,
    );

    logger.info(JOINING_LOG_MSG.JOIN_SERVICE_INITIALIZED, {
      nodeId: this.nodeId,
      groupId,
      replicaId,
      role: messageGroup.role,
      isLeader: messageGroup.isLeader,
      leaderId: messageGroup.leaderId,
      raftState: messageGroup.raft?.state,
      raftTerm: messageGroup.raft?.term,
    });

    // Update the services table to point this replica to the
    // new node. This is an UPDATE, not INSERT - the replica ID
    // already exists.
    await this.delegates.registerMessageGroupService(
      groupId,
      replicaId,
      messageGroup,
      {status: SERVICE_STATUS.STOPPED},
    );

    logger.info(JOINING_LOG_MSG.JOINED_EXISTING_GROUP, {
      nodeId: this.nodeId,
      groupId,
      replicaId,
      hasMessageRouter: !!messageRouter,
      peerAddressCount: peerAddresses?.length || NUM.ZERO,
    });
  }
}

export {JoinMessageGroupPhase};
