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
  SERVICE_STATUS,
  SERVICE_TYPE,
  STRING,
  TABLES,
  UNIFIED_SERVICE_TYPE,
} from '../../constants/index.js';

const LOG_ENVELOPE_DEFAULT = JOIN_REPLICA_DEFAULT.LOG_ENVELOPE;
const LOG_REGISTRATION_DEFAULT = JOIN_REPLICA_DEFAULT.LOG_REGISTRATION;

class JoinMessageGroupRuntimeOwner {
  constructor(options = {}) {
    this.nodeId = options.nodeId;
    this.delegates = options.delegates || {};
  }

  assertReplicaStartupOwnership(replicaId) {
    const systemTableCache =
      NodeService.getInstance().getSystemTableCache();
    if (!systemTableCache ||
        typeof systemTableCache.get !== 'function') {
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
      typeof assignment.assignmentId === 'string' &&
      assignment.assignmentId.length > 0;
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

    const messageRouter = this.delegates.getMessageRouter();
    if (!messageRouter) {
      throw new Error(JOINING_ERROR_MSG.MESSAGE_ROUTER_REQUIRED);
    }

    const replicaId = assignment.replicaToMove;
    if (!replicaId) {
      throw new Error(JOINING_ERROR_MSG.MOVE_REPLICA_MISSING);
    }
    this.assertReplicaStartupOwnership(replicaId);

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
        replicaIndex: 0,
        peerAddresses: peerAddresses || [],
        deferElection: true,
        isJoiningExistingGroup: true,
        createDelayMs: 0,
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

    logger.info(JOINING_LOG_MSG.JOINED_EXISTING_GROUP, {
      nodeId: this.nodeId,
      groupId,
      replicaId,
      hasMessageRouter: !!messageRouter,
      peerAddressCount: peerAddresses?.length || 0,
    });
  }
}

export {JoinMessageGroupRuntimeOwner};
