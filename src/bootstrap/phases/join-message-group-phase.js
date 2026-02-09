/**
 * Join Message Group Phase - Third phase of joining node bootstrap.
 *
 * Creates or joins message group based on assignment strategy:
 * - CREATE_SELF_HOSTED: Creates 3 replicas on this node
 * - MOVE_REPLICA: Joins existing message group by taking over a replica
 *
 * Requirements: 2.6, 2.7, 2.8
 */

import {EventEmitter} from 'events';
import {LoggingService} from '../../logging/logging-service.js';
import {MessageGroupService} from '../../message-group/message-group-service.js';
import {assertCritical} from '../../utils/assert.js';
import {ADDRESS, ENTITY_TYPE, NUM, TYPEOF} from '../../constants/index.js';
import {BOOTSTRAP_SUBSYSTEM} from '../bootstrap-constants.js';
import {
  MESSAGE_GROUP_ASSIGNMENT_STRATEGY as AssignmentStrategy,
} from '../message-group-assignment.js';
import {
  JOINING_DEFAULT,
  JOINING_ERROR_MSG,
  JOINING_HTTP,
  JOINING_LOG_MSG,
} from '../node-joining-constants.js';

/**
 * Phase constants for join message group setup.
 */
const JOIN_MESSAGE_GROUP_PHASE = Object.freeze({
  NAME: 'join_message_group',
  EVENT_START: 'join_message_group:start',
  EVENT_COMPLETE: 'join_message_group:complete',
  EVENT_FAILED: 'join_message_group:failed',
});

/**
 * JoinMessageGroupPhase handles message group creation/joining for joining nodes.
 * Supports both CREATE_SELF_HOSTED and MOVE_REPLICA strategies.
 */
class JoinMessageGroupPhase extends EventEmitter {
  /**
   * Create join message group phase.
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - Node ID (REQUIRED).
   * @param {Object} options.messageRouter - Message router (REQUIRED).
   * @param {Object} options.bootstrapResponse - Bootstrap response from seed (REQUIRED).
   * @param {string} options.seedNodeAddress - Seed node HTTP address for service registration.
   * @param {Object} options.config - Configuration options.
   * @param {Function} options.httpPost - Optional HTTP POST implementation override.
   */
  constructor(options = {}) {
    super();

    this.nodeId = assertCritical(
      options.nodeId,
      'nodeId is required for JoinMessageGroupPhase',
    );
    this.messageRouter = assertCritical(
      options.messageRouter,
      'messageRouter is required for JoinMessageGroupPhase',
    );
    this.bootstrapResponse = assertCritical(
      options.bootstrapResponse,
      'bootstrapResponse is required for JoinMessageGroupPhase',
    );

    this.seedNodeAddress = options.seedNodeAddress || null;
    this.config = {...JOINING_DEFAULT, ...options.config};

    // Allow tests to bypass real network I/O
    this.httpPostImpl = typeof options.httpPost === TYPEOF.FUNCTION ?
      options.httpPost :
      this.httpPost.bind(this);

    // Services created during this phase
    this.messageGroupServices = new Map();
    this.messageGroupReplicas = [];

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(BOOTSTRAP_SUBSYSTEM.NODE_JOINING) : console;
  }

  /**
   * Execute the join message group phase.
   * @return {Promise<Object>} Phase result with message group services.
   */
  async execute() {
    const startTime = Date.now();
    const assignment = this.bootstrapResponse.messageGroupAssignment;

    this.emit(JOIN_MESSAGE_GROUP_PHASE.EVENT_START, {
      nodeId: this.nodeId,
      strategy: assignment?.strategy,
    });

    try {
      if (assignment.strategy === AssignmentStrategy.CREATE_SELF_HOSTED) {
        await this.createSelfHostedMessageGroup(assignment);
      } else if (assignment.strategy === AssignmentStrategy.MOVE_REPLICA) {
        await this.joinExistingMessageGroup(assignment);
      } else {
        throw new Error(`Unknown assignment strategy: ${assignment.strategy}`);
      }

      const duration = Date.now() - startTime;

      const result = {
        phaseName: JOIN_MESSAGE_GROUP_PHASE.NAME,
        duration,
        services: {
          messageGroupServices: this.messageGroupServices,
          messageGroupReplicas: this.messageGroupReplicas,
        },
        metadata: {
          strategy: assignment.strategy,
          groupId: assignment.groupId,
          replicaCount: this.messageGroupServices.size,
        },
      };

      this.emit(JOIN_MESSAGE_GROUP_PHASE.EVENT_COMPLETE, result);

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      this.emit(JOIN_MESSAGE_GROUP_PHASE.EVENT_FAILED, {
        phaseName: JOIN_MESSAGE_GROUP_PHASE.NAME,
        duration,
        error: error.message,
      });

      throw error;
    }
  }

  /**
   * Create self-hosted message group (3 replicas on this node).
   * @param {Object} assignment - Assignment instructions.
   * @return {Promise<void>}
   * @private
   */
  async createSelfHostedMessageGroup(assignment) {
    const groupId = assignment.groupId;
    const replicaCount = assignment.replicaCount || NUM.THREE;

    this.logger.debug(JOINING_LOG_MSG.SELF_HOSTED_CREATING, {
      nodeId: this.nodeId,
      groupId,
      replicaCount,
    });

    // Stagger delay between replica creations
    const replicaStaggerDelayMs = this.config.replicaStaggerDelayMs;

    // Generate replica IDs
    const replicaIds = [];
    for (let i = NUM.ZERO; i < replicaCount; i++) {
      replicaIds.push(`${groupId}-r${i}`);
    }

    const peerAddresses = replicaIds.map(
      (replicaId) =>
        `${this.nodeId}${ADDRESS.SEPARATOR}` +
        `${ENTITY_TYPE.MESSAGE_GROUP}${ADDRESS.SEPARATOR}${replicaId}`,
    );

    // Create all replicas on this node with staggered delays
    // Use deferElection to prevent election storms
    for (let i = NUM.ZERO; i < replicaIds.length; i++) {
      const replicaId = replicaIds[i];

      // Stagger replica creation
      if (i > NUM.ZERO) {
        await new Promise((resolve) => setTimeout(resolve, replicaStaggerDelayMs));
      }

      const messageGroup = new MessageGroupService({
        groupId,
        replicaId,
        nodeId: this.nodeId,
        replicaIds,
        peerAddresses,
        transport: this.messageRouter,
        deferElection: true,
      });

      // Register with MessageRouter using unified address format
      const unifiedAddress = `${this.nodeId}${ADDRESS.SEPARATOR}` +
        `${ENTITY_TYPE.MESSAGE_GROUP}${ADDRESS.SEPARATOR}${replicaId}`;
      this.messageRouter.register(unifiedAddress, (envelope) => {
        return messageGroup.receiveMessage(envelope);
      });

      await messageGroup.initialize();

      this.messageGroupServices.set(replicaId, messageGroup);
      this.messageGroupReplicas.push(messageGroup);

      this.logger.debug(JOINING_LOG_MSG.MESSAGE_GROUP_REPLICA_CREATED, {
        groupId,
        replicaId,
        replicaIndex: i,
        nodeId: this.nodeId,
      });
    }

    // All replicas created - start elections
    this.logger.debug(JOINING_LOG_MSG.MESSAGE_GROUP_ELECTIONS_START, {
      groupId,
      replicaCount: this.messageGroupReplicas.length,
    });

    for (const messageGroup of this.messageGroupReplicas) {
      messageGroup.startElection();
    }

    this.logger.info(JOINING_LOG_MSG.SELF_HOSTED_CREATED, {
      nodeId: this.nodeId,
      groupId,
      replicaCount: this.messageGroupServices.size,
      hasMessageRouter: !!this.messageRouter,
    });
  }

  /**
   * Join existing message group by moving a replica.
   * @param {Object} assignment - Assignment instructions.
   * @return {Promise<void>}
   * @private
   */
  async joinExistingMessageGroup(assignment) {
    const {groupId, peerAddresses, existingPeerIds, replicaAddresses} = assignment;

    this.logger.info(JOINING_LOG_MSG.JOIN_ASSIGNMENT_RECEIVED, {
      nodeId: this.nodeId,
      groupId,
      strategy: assignment.strategy,
      existingPeerIds: existingPeerIds,
      peerAddresses: peerAddresses,
      replicaAddresses: replicaAddresses,
      sourceNodeId: assignment.sourceNodeId,
      replicaToMove: assignment.replicaToMove,
    });

    // MOVE_REPLICA strategy: Take over the existing replica ID
    const replicaId = assignment.replicaToMove;
    if (!replicaId) {
      throw new Error(JOINING_ERROR_MSG.MOVE_REPLICA_MISSING);
    }

    // The replica IDs stay the same - we're just moving one replica to a different node
    const allReplicaIds = existingPeerIds || [];

    this.logger.info(JOINING_LOG_MSG.JOIN_CREATING_WITH_PEERS, {
      nodeId: this.nodeId,
      groupId,
      replicaId,
      allReplicaIds,
      peerAddresses: peerAddresses || [],
      hasMessageRouter: !!this.messageRouter,
      messageRouterConnections: this.messageRouter?.getConnectedNodes?.() || 'N/A',
    });

    const messageGroup = new MessageGroupService({
      groupId,
      replicaId: replicaId,
      nodeId: this.nodeId,
      replicaIds: allReplicaIds,
      transport: this.messageRouter,
      peerAddresses: peerAddresses || [],
    });

    // Register with MessageRouter using unified address format
    const unifiedAddress = `${this.nodeId}${ADDRESS.SEPARATOR}` +
      `${ENTITY_TYPE.MESSAGE_GROUP}${ADDRESS.SEPARATOR}${replicaId}`;
    this.messageRouter.register(unifiedAddress, (envelope) => {
      this.logger.debug(JOINING_LOG_MSG.JOIN_MESSAGE_RECEIVED, {
        address: unifiedAddress,
        envelopeType: envelope?.type || envelope?.payload?.type,
        from: envelope?.from || envelope?.payload?.address,
      });
      return messageGroup.receiveMessage(envelope);
    });

    this.logger.info(JOINING_LOG_MSG.JOIN_HANDLER_REGISTERED, {
      unifiedAddress,
      nodeId: this.nodeId,
    });

    await messageGroup.initialize();

    this.logger.info(JOINING_LOG_MSG.JOIN_SERVICE_INITIALIZED, {
      nodeId: this.nodeId,
      groupId,
      replicaId,
      role: messageGroup.role,
      isLeader: messageGroup.isLeaderReplica?.() || false,
      leaderId: messageGroup.leaderId,
      raftState: messageGroup.raft?.state,
      raftTerm: messageGroup.raft?.term,
    });

    this.messageGroupServices.set(replicaId, messageGroup);
    this.messageGroupReplicas.push(messageGroup);

    // Update the services table to point this replica to the new node
    await this.registerMessageGroupService(groupId, replicaId, messageGroup);

    this.logger.info(JOINING_LOG_MSG.JOINED_EXISTING_GROUP, {
      nodeId: this.nodeId,
      groupId,
      replicaId,
      hasMessageRouter: !!this.messageRouter,
      peerAddressCount: peerAddresses?.length || NUM.ZERO,
    });
  }

  /**
   * Register a message group service in the cluster's services table.
   * @param {string} groupId - Message group ID.
   * @param {string} replicaId - Replica ID.
   * @param {MessageGroupService} service - The message group service.
   * @return {Promise<void>}
   * @private
   */
  async registerMessageGroupService(groupId, replicaId, service) {
    if (!this.seedNodeAddress) {
      this.logger.warn('No seed node address for service registration', {
        nodeId: this.nodeId,
        replicaId,
      });
      return;
    }

    const now = Date.now();
    const serviceData = {
      service_id: replicaId,
      service_type: 'message_group',
      node_id: this.nodeId,
      partition_id: null,
      group_id: groupId,
      replica_id: replicaId,
      raft_role: service.getRole ? service.getRole() : service.role,
      status: 'active',
      address: `${this.nodeId}${ADDRESS.SEPARATOR}` +
        `${ENTITY_TYPE.MESSAGE_GROUP}${ADDRESS.SEPARATOR}${replicaId}`,
      created_at: now,
      updated_at: now,
    };

    const registerUrl = `${this.seedNodeAddress}${JOINING_HTTP.REGISTER_SERVICE_PATH}`;

    this.logger.debug(JOINING_LOG_MSG.REGISTERING_MESSAGE_GROUP_SERVICE, {
      nodeId: this.nodeId,
      replicaId,
      groupId,
      registerUrl,
    });

    try {
      const response = await this.httpPostImpl(registerUrl, serviceData);

      if (!response.success) {
        this.logger.error(JOINING_LOG_MSG.MESSAGE_GROUP_REGISTER_NON_SUCCESS, {
          nodeId: this.nodeId,
          replicaId,
          error: response.error,
        });
        throw new Error(response.error || JOINING_ERROR_MSG.BOOTSTRAP_REQUEST_FAILED);
      } else {
        this.logger.info(JOINING_LOG_MSG.MESSAGE_GROUP_REGISTERED, {
          nodeId: this.nodeId,
          replicaId,
          groupId,
        });
      }
    } catch (error) {
      this.logger.error(JOINING_LOG_MSG.MESSAGE_GROUP_REGISTER_FAILED, {
        nodeId: this.nodeId,
        replicaId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Make an HTTP POST request.
   * @param {string} url - URL to post to.
   * @param {Object} body - Request body.
   * @return {Promise<Object>} Response body.
   * @private
   */
  async httpPost(url, body) {
    const controller = new globalThis.AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.config.httpTimeoutMs,
    );

    try {
      const response = await fetch(url, {
        method: JOINING_HTTP.METHOD_POST,
        headers: {
          [JOINING_HTTP.HEADER_CONTENT_TYPE]: JOINING_HTTP.CONTENT_TYPE_JSON,
          [JOINING_HTTP.HEADER_CONNECTION]: JOINING_HTTP.CONNECTION_CLOSE,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(JOINING_ERROR_MSG.httpStatus(response.status, errorBody));
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new Error(JOINING_ERROR_MSG.httpTimeout(this.config.httpTimeoutMs));
      }

      throw error;
    }
  }

  /**
   * Get the leader message group service.
   * @return {Object|null} Leader message group service or null.
   */
  getLeaderService() {
    // First try to find a leader
    for (const service of this.messageGroupServices.values()) {
      if (service && service.isLeaderReplica && service.isLeaderReplica()) {
        return service;
      }
    }

    // Fall back to any replica that knows the leader
    for (const service of this.messageGroupServices.values()) {
      if (service && typeof service.getLeaderId === TYPEOF.FUNCTION &&
          service.getLeaderId()) {
        return service;
      }
    }
    return null;
  }

  /**
   * Clean up resources on failure.
   * @return {Promise<void>}
   */
  async cleanup() {
    for (const service of this.messageGroupServices.values()) {
      try {
        if (service.shutdown) {
          await service.shutdown();
        }
      } catch (error) {
        this.logger.warn('Failed to shutdown message group service during cleanup', {
          error: error.message,
        });
      }
    }
    this.messageGroupServices.clear();
    this.messageGroupReplicas = [];
  }
}

export {JoinMessageGroupPhase, JOIN_MESSAGE_GROUP_PHASE};
