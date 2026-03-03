/**
 * Create Message Group Phase — handles self-hosted message group creation
 * and message group replica lifecycle during the join process.
 *
 * Extracted from NodeJoiningService to keep the orchestrator thin.
 * The class receives required dependencies via constructor injection.
 */

import {assertCritical} from '../../utils/assert.js';
import {NodeService} from '../../node/node-service.js';
import {MessageGroupService} from '../../message-group/message-group-service.js';
import {
  MESSAGE_GROUP_ASSIGNMENT_STRATEGY as AssignmentStrategy,
} from '../message-group-assignment.js';
import {
  JOIN_BACKFILL_QUERY,
  JOINING_ERROR_MSG,
  JOINING_LOG_MSG,
  JOINING_UNIFIED_RECONCILE,
} from '../node-joining-constants.js';
import {
  JOINING_HTTP,
} from '../node-joining-constants.js';
import {
  ADDRESS,
  CDC_OPERATION,
  ENTITY_TYPE,
  NUM,
  SERVICE_DESCRIPTOR_FIELD,
  SERVICE_LIFECYCLE_STATE,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
  UNIFIED_SERVICE_TYPE,
} from '../../constants/index.js';

/**
 * Format missing-replica assertion message for join lifecycle.
 * @param {string} replicaId
 * @return {string}
 */
const formatJoinReplicaMissingAtStart = (replicaId) =>
  `Join message-group replica ${replicaId} missing at start`;

const ENSURE_LOCAL_ACCESS = false;
const SPREAD_ACROSS_NODES = false;
const CREATE_SELF_HOSTED_MESSAGE_GROUP_POLICY = Object.freeze({
  ensureLocalAccess: ENSURE_LOCAL_ACCESS,
  placementConstraints: {
    spreadAcrossNodes: SPREAD_ACROSS_NODES,
  },
});

const MESSAGE_GROUP_REPLICA_ID_INFIX = '-r';

/**
 * Handles the create-self-hosted-message-group phase and
 * message group replica lifecycle during the join process.
 */
class CreateMessageGroupPhase {
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
   * Create a join message-group replica with unified lifecycle.
   * @param {Object} context - Lifecycle context with definition.
   * @return {Promise<Object>} Status result.
   */
  async createJoinMessageGroupReplica(context) {
    const definition = context?.definition || {};
    const serviceId =
      definition[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID];
    const options = this.delegates.resolveJoinReplicaOptions(
      serviceId,
      UNIFIED_SERVICE_TYPE.MESSAGE_GROUP,
    );

    const messageGroupServices =
      this.delegates.getMessageGroupServices();
    if (messageGroupServices.has(options.replicaId)) {
      return {status: SERVICE_LIFECYCLE_STATE.CREATED};
    }

    if (options.createDelayMs > NUM.ZERO) {
      const sleep = this.delegates.getSleep();
      await sleep(options.createDelayMs);
    }

    const messageGroup = new MessageGroupService({
      groupId: options.groupId,
      replicaId: options.replicaId,
      nodeId: this.nodeId,
      replicaIds: options.replicaIds,
      transport: this.delegates.getMessageRouter(),
      peerAddresses: options.peerAddresses,
      deferElection: Boolean(options.deferElection),
    });

    const messageRouter = this.delegates.getMessageRouter();
    const unifiedAddress =
      `${this.nodeId}${ADDRESS.SEPARATOR}` +
      `${ENTITY_TYPE.MESSAGE_GROUP}` +
      `${ADDRESS.SEPARATOR}${options.replicaId}`;
    const logger = this.delegates.getLogger();
    messageRouter.register(unifiedAddress, (envelope) => {
      if (options.logEnvelope) {
        logger.debug(
          JOINING_LOG_MSG.JOIN_MESSAGE_RECEIVED,
          {
            address: unifiedAddress,
            envelopeType:
              envelope?.type || envelope?.payload?.type,
            from:
              envelope?.from || envelope?.payload?.address,
          },
        );
      }
      return messageGroup.receiveMessage(envelope);
    });

    if (options.logRegistration) {
      logger.info(
        JOINING_LOG_MSG.JOIN_HANDLER_REGISTERED,
        {
          unifiedAddress,
          nodeId: this.nodeId,
        },
      );
    }

    await messageGroup.initialize();
    messageGroupServices.set(options.replicaId, messageGroup);
    this.delegates.pushJoinMessageGroupReplica(messageGroup);

    logger.debug(
      JOINING_LOG_MSG.MESSAGE_GROUP_REPLICA_CREATED,
      {
        groupId: options.groupId,
        replicaId: options.replicaId,
        replicaIndex: options.replicaIndex,
        nodeId: this.nodeId,
      },
    );

    return {status: SERVICE_LIFECYCLE_STATE.CREATED};
  }

  /**
   * Unified lifecycle start hook for join message-group replicas.
   * @param {Object} replicaHandle
   * @param {Object} _context
   * @return {Promise<Object>}
   */
  async startJoinMessageGroupReplica(replicaHandle, _context) {
    const serviceId =
      replicaHandle[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID] ||
      replicaHandle[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID];
    const options = this.delegates.resolveJoinReplicaOptions(
      serviceId,
      UNIFIED_SERVICE_TYPE.MESSAGE_GROUP,
    );
    const messageGroupServices =
      this.delegates.getMessageGroupServices();
    const messageGroup =
      messageGroupServices.get(options.replicaId);

    assertCritical(
      messageGroup,
      formatJoinReplicaMissingAtStart(options.replicaId),
    );

    if (!options.deferElection) {
      messageGroup.startElection();
    }

    return {
      status: SERVICE_LIFECYCLE_STATE.RUNNING,
      deferred: Boolean(options.deferElection),
    };
  }

  /**
   * Unified lifecycle stop hook for join message-group replicas.
   * @param {Object} replicaHandle
   * @param {Object} _context
   * @return {Promise<Object>}
   */
  async stopJoinMessageGroupReplica(replicaHandle, _context) {
    const serviceId =
      replicaHandle[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID] ||
      replicaHandle[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID];
    const options = this.delegates.resolveJoinReplicaOptions(
      serviceId,
      UNIFIED_SERVICE_TYPE.MESSAGE_GROUP,
    );
    const messageGroupServices =
      this.delegates.getMessageGroupServices();
    const messageGroup =
      messageGroupServices.get(options.replicaId);
    if (!messageGroup) {
      return {status: SERVICE_LIFECYCLE_STATE.STOPPED};
    }

    if (messageGroup.shutdown) {
      await messageGroup.shutdown();
    }

    const unifiedAddress =
      `${this.nodeId}${ADDRESS.SEPARATOR}` +
      `${ENTITY_TYPE.MESSAGE_GROUP}` +
      `${ADDRESS.SEPARATOR}${options.replicaId}`;
    const messageRouter = this.delegates.getMessageRouter();
    if (messageRouter) {
      messageRouter.unregister(unifiedAddress);
    }

    messageGroupServices.delete(options.replicaId);
    this.delegates.removeJoinMessageGroupReplica(messageGroup);

    return {status: SERVICE_LIFECYCLE_STATE.STOPPED};
  }

  /**
   * Compatibility shim for deferred self-hosted join elections.
   * Replica create/start ownership remains in unified lifecycle
   * adapters.
   * @param {string} groupId - Message group ID.
   * @return {void}
   */
  startDeferredJoinMessageGroupElections(groupId) {
    const logger = this.delegates.getLogger();
    const replicas =
      this.delegates.getJoinMessageGroupReplicas();
    logger.debug(
      JOINING_LOG_MSG.MESSAGE_GROUP_ELECTIONS_START,
      {
        groupId,
        replicaCount: replicas.length,
      },
    );

    for (const messageGroup of replicas) {
      messageGroup.startElection();
    }
  }

  /**
   * Phase 3a: Create self-hosted message group (3 replicas on
   * this node).
   * Requirements: 8.3 - Services created AFTER self-connection
   * established.
   * @param {Object} assignment - Assignment instructions.
   * @return {Promise<void>}
   */
  async phaseCreateSelfHostedMessageGroup(assignment) {
    const groupId = assignment.groupId;
    const replicaCount = assignment.replicaCount || NUM.THREE;
    const logger = this.delegates.getLogger();
    const config = this.delegates.getConfig();
    const messageRouter = this.delegates.getMessageRouter();

    logger.debug(JOINING_LOG_MSG.SELF_HOSTED_CREATING, {
      nodeId: this.nodeId,
      groupId,
      replicaCount,
    });

    // Requirements: 8.3 - MessageRouter should already be
    // initialized in phaseConnectWebSocket
    if (!messageRouter) {
      throw new Error(
        JOINING_ERROR_MSG.MESSAGE_ROUTER_REQUIRED,
      );
    }

    const replicaStaggerDelayMs =
      config.replicaStaggerDelayMs;

    const replicaIds = [];
    for (let i = NUM.ZERO; i < replicaCount; i++) {
      replicaIds.push(`${groupId}${MESSAGE_GROUP_REPLICA_ID_INFIX}${i}`);
    }

    const peerAddresses = replicaIds.map(
      (replicaId) =>
        `${this.nodeId}${ADDRESS.SEPARATOR}` +
        `${ENTITY_TYPE.MESSAGE_GROUP}` +
        `${ADDRESS.SEPARATOR}${replicaId}`,
    );

    this.delegates.resetJoinMessageGroupReplicas();
    for (
      let index = NUM.ZERO;
      index < replicaIds.length;
      index++
    ) {
      const replicaId = replicaIds[index];
      this.delegates.assertReplicaStartupOwnership(replicaId);
      this.delegates.queueJoinServiceReplica(
        this.delegates.createJoinServiceDescriptor(
          UNIFIED_SERVICE_TYPE.MESSAGE_GROUP,
          replicaId,
        ),
        {
          serviceType: UNIFIED_SERVICE_TYPE.MESSAGE_GROUP,
          groupId,
          replicaId,
          replicaIds,
          replicaIndex: index,
          peerAddresses,
          deferElection: true,
          createDelayMs: index > NUM.ZERO ?
            index * replicaStaggerDelayMs :
            NUM.ZERO,
          logEnvelope: false,
          logRegistration: false,
        },
      );
    }

    await this.delegates.triggerJoinReconciler(
      JOINING_UNIFIED_RECONCILE.MESSAGE_GROUPS_REASON,
    );

    this.startDeferredJoinMessageGroupElections(groupId);

    const messageGroupServices =
      this.delegates.getMessageGroupServices();
    logger.info(JOINING_LOG_MSG.SELF_HOSTED_CREATED, {
      nodeId: this.nodeId,
      groupId,
      replicaCount: messageGroupServices.size,
      hasMessageRouter: !!messageRouter,
    });
  }

  /**
   * Register a message group service in the cluster's services
   * table. This ensures other nodes can discover this replica.
   * @param {string} groupId - Message group ID.
   * @param {string} replicaId - Replica ID.
   * @param {MessageGroupService} service - The message group
   *   service.
   * @return {Promise<void>}
   */
  async registerMessageGroupService(
    groupId,
    replicaId,
    service,
  ) {
    const nowFn = this.delegates.getNow();
    const sleep = this.delegates.getSleep();
    const logger = this.delegates.getLogger();
    const config = this.delegates.getConfig();
    const bootstrapResponse =
      this.delegates.getBootstrapResponse();
    const seedNodeAddress =
      this.delegates.getSeedNodeAddress();
    const now = nowFn();
    const moveReplicaAssignment =
      bootstrapResponse?.messageGroupAssignment || null;
    const assignmentId = moveReplicaAssignment &&
      moveReplicaAssignment.strategy ===
        AssignmentStrategy.MOVE_REPLICA &&
      moveReplicaAssignment.replicaToMove === replicaId ?
      moveReplicaAssignment.assignmentId || null :
      null;
    const serviceData = {
      service_id: replicaId,
      service_type: SERVICE_TYPE.MESSAGE_GROUP,
      node_id: this.nodeId,
      partition_id: null,
      group_id: groupId,
      replica_id: replicaId,
      raft_role: service.getRole ?
        service.getRole() :
        service.role,
      status: SERVICE_STATUS.ACTIVE,
      address: `${this.nodeId}${ADDRESS.SEPARATOR}` +
        `${ENTITY_TYPE.MESSAGE_GROUP}` +
        `${ADDRESS.SEPARATOR}${replicaId}`,
      created_at: now,
      updated_at: now,
      ...(assignmentId ?
        {
          [JOIN_BACKFILL_QUERY.ASSIGNMENT_ID_FIELD]:
            assignmentId,
        } :
        {}),
    };

    const registerUrl =
      `${seedNodeAddress}${JOINING_HTTP.REGISTER_SERVICE_PATH}`;

    logger.debug(
      JOINING_LOG_MSG.REGISTERING_MESSAGE_GROUP_SERVICE,
      {
        nodeId: this.nodeId,
        replicaId,
        groupId,
        assignmentId,
        registerUrl,
      },
    );

    const retryPolicy =
      this.delegates.resolveJoinRetryPolicy();
    const retryTimeoutMs = retryPolicy.retryTimeoutMs;
    let delayMs = retryPolicy.initialDelayMs;
    const maxDelayMs = retryPolicy.maxDelayMs;
    const backoffMultiplier = retryPolicy.backoffMultiplier;
    const retryableTimeoutErrorMessage =
      JOINING_ERROR_MSG.httpTimeout(config.httpTimeoutMs);
    const startTime = nowFn();
    let attempt = NUM.ZERO;
    let lastError = null;

    while (nowFn() - startTime < retryTimeoutMs) {
      attempt += 1;
      try {
        const response = await this.delegates
          .getHttpPostImpl()(registerUrl, serviceData);

        if (!response.success) {
          logger.error(
            JOINING_LOG_MSG
              .MESSAGE_GROUP_REGISTER_NON_SUCCESS,
            {
              nodeId: this.nodeId,
              replicaId,
              error: response.error,
            },
          );
          const err = new Error(
            JOINING_ERROR_MSG.BOOTSTRAP_REQUEST_FAILED,
          );
          if (response.error) {
            Object.assign(err, {cause: response.error});
          }
          throw err;
        }

        const systemTableCache =
          NodeService.getInstance().getSystemTableCache();
        if (systemTableCache) {
          // Bootstrap timing exception: local cache seeding
          // is required here because join-time CDC
          // subscriptions are activated later in
          // phaseQuerySystemState().
          // Control-plane address resolution and readiness
          // checks may consult the local services cache
          // before CDC fanout reaches this node.
          // See architecture.md: Sanctioned direct
          // applySystemTableChange call sites.
          systemTableCache.applySystemTableChange(
            TABLES.SERVICES,
            CDC_OPERATION.UPSERT,
            serviceData,
          );
        }

        logger.info(
          JOINING_LOG_MSG.MESSAGE_GROUP_REGISTERED,
          {
            nodeId: this.nodeId,
            replicaId,
            groupId,
            attempt,
          },
        );
        return;
      } catch (error) {
        lastError = error;
        const elapsedMs = nowFn() - startTime;
        const classification =
          this.delegates.classifySeedContactFailure(
            error,
            retryableTimeoutErrorMessage,
          );
        if (
          classification.retryable &&
          elapsedMs < retryTimeoutMs
        ) {
          const nextDelayMs =
            this.delegates
              .computeSeedContactRetryDelayMs({
                baseDelayMs: delayMs,
                maxDelayMs,
                retryAfterMs: classification.retryAfterMs,
              });
          logger.warn(
            JOINING_LOG_MSG
              .MESSAGE_GROUP_REGISTER_RETRYING,
            {
              nodeId: this.nodeId,
              replicaId,
              groupId,
              attempt,
              elapsedMs,
              error: error.message,
              lastCode: classification.code,
              lastStatusCode: classification.statusCode,
              retryAfterMs: classification.retryAfterMs,
              lastErrorDetails:
                classification.parsedError?.details ||
                null,
              nextDelayMs,
              retryTimeoutMs,
            },
          );
          await sleep(nextDelayMs);
          delayMs = Math.min(
            Math.floor(delayMs * backoffMultiplier),
            maxDelayMs,
          );
          continue;
        }
        break;
      }
    }

    const error = lastError || new Error(
      JOINING_ERROR_MSG.registerServiceTimeout(
        replicaId,
        retryTimeoutMs,
      ),
    );
    logger.error(
      JOINING_LOG_MSG.MESSAGE_GROUP_REGISTER_FAILED,
      {
        nodeId: this.nodeId,
        replicaId,
        groupId,
        attempts: attempt,
        elapsedMs: nowFn() - startTime,
        error: error.message,
      },
    );
    throw error;
  }

  /**
   * Persist metadata required for CREATE_SELF_HOSTED joins.
   * Ensures message_groups and per-replica services rows are
   * present before join can complete successfully.
   * @return {Promise<void>}
   */
  async registerCreateSelfHostedMetadata() {
    const bootstrapResponse =
      this.delegates.getBootstrapResponse();
    const assignment =
      bootstrapResponse?.messageGroupAssignment;
    if (
      !assignment ||
      assignment.strategy !==
        AssignmentStrategy.CREATE_SELF_HOSTED
    ) {
      return;
    }

    const groupId = assignment.groupId;
    if (!groupId) {
      throw new Error(
        JOINING_ERROR_MSG.SELF_HOSTED_MISSING_GROUP_ID,
      );
    }

    const messageGroupServices =
      this.delegates.getMessageGroupServices();
    const replicas = Array.from(
      messageGroupServices.entries(),
    ).filter(
      ([_replicaId, svc]) => svc?.groupId === groupId,
    );

    if (replicas.length === NUM.ZERO) {
      throw new Error(
        JOINING_ERROR_MSG
          .selfHostedNoLocalReplicas(groupId),
      );
    }

    const nowFn = this.delegates.getNow();
    const now = nowFn();
    const logger = this.delegates.getLogger();
    const messageGroupRow = {
      group_id: groupId,
      group_name: groupId,
      replica_count: replicas.length,
      leader_node_id: this.nodeId,
      policy: JSON.stringify(
        CREATE_SELF_HOSTED_MESSAGE_GROUP_POLICY,
      ),
      created_at: now,
      updated_at: now,
    };

    const groupResult =
      await this.delegates.upsertSystemTableRow(
        TABLES.MESSAGE_GROUPS,
        messageGroupRow,
      );
    if (!groupResult?.success) {
      throw new Error(
        JOINING_ERROR_MSG
          .selfHostedMetadataUpsertFailed(groupId),
      );
    }

    for (const [replicaId, svc] of replicas) {
      await this.delegates.registerMessageGroupService(
        groupId,
        replicaId,
        svc,
      );
    }

    logger.info(
      JOINING_LOG_MSG.SELF_HOSTED_METADATA_REGISTERED,
      {
        nodeId: this.nodeId,
        groupId,
        replicaCount: replicas.length,
      },
    );
  }
}

export {CreateMessageGroupPhase};
