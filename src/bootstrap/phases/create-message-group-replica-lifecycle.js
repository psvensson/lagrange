import {assertCritical} from '../../utils/assert.js';
import {MessageGroupService} from '../../message-group/message-group-service.js';
import {
  JOINING_LOG_MSG,
} from '../node-joining-constants.js';
import {
  ADDRESS,
  ENTITY_TYPE,
  NUM,
  SERVICE_DESCRIPTOR_FIELD,
  SERVICE_LIFECYCLE_STATE,
  UNIFIED_SERVICE_TYPE,
} from '../../constants/index.js';

const LOCAL_STR_FUNCTION = 'function';

/**
 * Format missing-replica assertion message for join lifecycle.
 * @param {string} replicaId
 * @return {string}
 */
const formatJoinReplicaMissingAtStart = (replicaId) =>
  `Join message-group replica ${replicaId} missing at start`;

const CREATE_MESSAGE_GROUP_REPLICA_LIFECYCLE_METHODS = {
  /**
   * Create a join message-group replica with unified lifecycle.
   * @param {Object} context - Lifecycle context with definition.
   * @return {Promise<Object>} Status result.
   */
  async createJoinMessageGroupReplica(context) {
    const definition = context?.definition || {};
    const directOptions = context?.replicaOptions || null;
    const serviceId =
      directOptions?.replicaId ||
      definition[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID];
    const options = directOptions ||
      this.delegates.resolveJoinReplicaOptions(
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
      deferElectionUntilJoinConvergence:
        options.deferElectionUntilJoinConvergence === true,
      isJoiningExistingGroup: Boolean(options.isJoiningExistingGroup),
      publishRoleMetadata: options.publishRoleMetadata !== false,
      publishLeaderNodeMetadata:
        options.publishLeaderNodeMetadata !== false,
      bootstrapReadinessState:
        typeof this.delegates.getBootstrapReadinessState === 'function' ?
          this.delegates.getBootstrapReadinessState() :
          null,
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
  },

  /**
   * Unified lifecycle start hook for join message-group replicas.
   * @param {Object} replicaHandle
   * @param {Object} _context
   * @return {Promise<Object>}
   */
  async startJoinMessageGroupReplica(replicaHandle, _context) {
    const directOptions = _context?.replicaOptions || null;
    const serviceId =
      directOptions?.replicaId ||
      replicaHandle[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID] ||
      replicaHandle[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID];
    const options = directOptions ||
      this.delegates.resolveJoinReplicaOptions(
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
  },

  /**
   * Unified lifecycle stop hook for join message-group replicas.
   * @param {Object} replicaHandle
   * @param {Object} _context
   * @return {Promise<Object>}
   */
  async stopJoinMessageGroupReplica(replicaHandle, _context) {
    const directOptions = _context?.replicaOptions || null;
    const serviceId =
      directOptions?.replicaId ||
      replicaHandle[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID] ||
      replicaHandle[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID];
    const options = directOptions ||
      this.delegates.resolveJoinReplicaOptions(
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
  },

  /**
   * Compute one deterministic delay between releasing deferred elections so a
   * previously started replica has time to establish leadership and heartbeat
   * before the next local replica arms its own timer.
   * @param {Array<Object>} replicas
   * @return {number}
   */
  resolveDeferredElectionReleaseDelayMs(replicas = []) {
    const config = this.delegates.getConfig?.() || {};
    const configuredMinimumDelay =
      Number.isFinite(config.replicaStaggerDelayMs) &&
      config.replicaStaggerDelayMs > NUM.ZERO ?
        Math.floor(config.replicaStaggerDelayMs) :
        NUM.ZERO;
    let computedDelayMs = configuredMinimumDelay;

    for (const replica of replicas) {
      const electionMaxMs = replica?.raftTimingConfig?.electionMaxMs;
      const heartbeatMs = replica?.raftTimingConfig?.heartbeatMs;
      if (!Number.isFinite(electionMaxMs) || electionMaxMs <= NUM.ZERO) {
        continue;
      }
      const heartbeatAllowanceMs =
        Number.isFinite(heartbeatMs) && heartbeatMs > NUM.ZERO ?
          Math.floor(heartbeatMs * 2) :
          NUM.ZERO;
      computedDelayMs = Math.max(
        computedDelayMs,
        Math.floor(electionMaxMs) + heartbeatAllowanceMs,
      );
    }

    return computedDelayMs;
  },

  /**
   * Compatibility shim for deferred self-hosted join elections.
   * Replica create/start ownership remains in unified lifecycle
   * adapters.
   * @param {string} groupId - Message group ID.
   * @return {Promise<void>}
   */
  async startDeferredJoinMessageGroupElections(groupId) {
    const logger = this.delegates.getLogger();
    const replicas =
      this.delegates.getJoinMessageGroupReplicas()
        .filter((replica) =>
          replica?.deferElectionUntilJoinConvergence !== true,
        );
    const sleep =
      typeof this.delegates.getSleep === 'function' ?
        this.delegates.getSleep() :
        null;
    const electionReleaseDelayMs =
      this.resolveDeferredElectionReleaseDelayMs(replicas);
    logger.debug(
      JOINING_LOG_MSG.MESSAGE_GROUP_ELECTIONS_START,
      {
        groupId,
        replicaCount: replicas.length,
        electionReleaseDelayMs,
      },
    );

    for (let index = NUM.ZERO; index < replicas.length; index += NUM.ONE) {
      const messageGroup = replicas[index];
      messageGroup.startElection();
      if (index < replicas.length - NUM.ONE &&
          electionReleaseDelayMs > NUM.ZERO &&
          typeof sleep === LOCAL_STR_FUNCTION) {
        await sleep(electionReleaseDelayMs);
      }
    }
  },

};

export {CREATE_MESSAGE_GROUP_REPLICA_LIFECYCLE_METHODS};
