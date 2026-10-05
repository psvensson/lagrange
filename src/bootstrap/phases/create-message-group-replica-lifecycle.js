import {assertCritical} from '../../utils/assert.js';
import {MessageGroupService} from '../../message-group/message-group-service.js';
import {getMessageGroupDbPath} from '../../storage/data-directory-manager.js';
import {
  registerMessageGroupTransportHandler,
  retireMessageGroupTransportHandler,
} from '../shared/message-group-transport-handler.js';
import {
  JOINING_LOG_MSG,
} from '../node-joining-constants.js';
import {
  ADDRESS,
  ENTITY_TYPE,
  SERVICE_DESCRIPTOR_FIELD,
  SERVICE_LIFECYCLE_STATE,
  UNIFIED_SERVICE_TYPE,
} from '../../constants/index.js';

const LOCAL_STR_FUNCTION = 'function';

function attachMessageGroupServiceBeforePublish(delegates, messageGroup) {
  if (typeof delegates.attachMessageGroupService === LOCAL_STR_FUNCTION) {
    delegates.attachMessageGroupService(messageGroup);
  }
}

/**
 * Format missing-replica assertion message for join lifecycle.
 * @param {string} replicaId
 * @return {string}
 */
const formatJoinReplicaMissingAtStart = (replicaId) =>
  `Join message-group replica ${replicaId} missing at start`;

/**
 * Build the debug envelope logger for a join message-group handler.
 * @param {Object} options - Join replica options (logEnvelope).
 * @param {Object} logger - Join logger.
 * @param {string} address - Handler address.
 * @return {Function|null} Envelope observer, or null when not logging.
 */
function buildJoinEnvelopeLogger(options, logger, address) {
  if (!options.logEnvelope) return null;
  return (envelope) => {
    logger.debug(JOINING_LOG_MSG.JOIN_MESSAGE_RECEIVED, {
      address,
      envelopeType: envelope?.type || envelope?.payload?.type,
      from: envelope?.from || envelope?.payload?.address,
    });
  };
}

/**
 * The join replica's identity options (F1): a rejoin's replica named by this
 * node's existing services row opened before - without its record it is
 * refused reseed-required; a first join's replica steps nothing until its row
 * is durable.
 * @param {Object} options - Join replica options.
 * @return {Object} {identityExisted, identityRecorded}.
 */
function joinReplicaIdentity(options) {
  return {
    identityExisted: options.identityExisted === true,
    identityRecorded: options.identityRecorded ?? null,
  };
}

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

    if (options.createDelayMs > 0) {
      const sleep = this.delegates.getSleep();
      await sleep(options.createDelayMs);
    }

    const messageGroup = new MessageGroupService({
      groupId: options.groupId,
      replicaId: options.replicaId,
      nodeId: this.nodeId,
      replicaIds: options.replicaIds,
      transport: this.delegates.getMessageRouter(),
      dbPath: getMessageGroupDbPath(
        this.delegates.getDataDir(), options.groupId, options.replicaId),
      peerAddresses: options.peerAddresses,
      deferElection: Boolean(options.deferElection),
      deferElectionUntilJoinConvergence:
        options.deferElectionUntilJoinConvergence === true,
      isJoiningExistingGroup: Boolean(options.isJoiningExistingGroup),
      ...joinReplicaIdentity(options),
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
    registerMessageGroupTransportHandler(messageGroup, {
      messageRouter,
      address: unifiedAddress,
      resolveLane: () => this.delegates.getReplicaStateMachine?.() || null,
      onEnvelope: buildJoinEnvelopeLogger(options, logger, unifiedAddress),
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
    attachMessageGroupServiceBeforePublish(this.delegates, messageGroup);
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
    await retireMessageGroupTransportHandler({
      messageGroup,
      messageRouter: this.delegates.getMessageRouter(),
      address: unifiedAddress,
      replicaId: options.replicaId,
    });

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
      config.replicaStaggerDelayMs > 0 ?
        Math.floor(config.replicaStaggerDelayMs) :
        0;
    let computedDelayMs = configuredMinimumDelay;

    for (const replica of replicas) {
      const electionMaxMs = replica?.raftTimingConfig?.electionMaxMs;
      const heartbeatMs = replica?.raftTimingConfig?.heartbeatMs;
      if (!Number.isFinite(electionMaxMs) || electionMaxMs <= 0) {
        continue;
      }
      const heartbeatAllowanceMs =
        Number.isFinite(heartbeatMs) && heartbeatMs > 0 ?
          Math.floor(heartbeatMs * 2) :
          0;
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

    for (let index = 0; index < replicas.length; index += 1) {
      const messageGroup = replicas[index];
      messageGroup.startElection();
      if (index < replicas.length - 1 &&
          electionReleaseDelayMs > 0 &&
          typeof sleep === LOCAL_STR_FUNCTION) {
        await sleep(electionReleaseDelayMs);
      }
    }
  },

};

export {CREATE_MESSAGE_GROUP_REPLICA_LIFECYCLE_METHODS};
