/**
 * Seed Message Groups Phase — handles Phase 2 of seed bootstrap:
 * creating initial message group replicas with deferred elections.
 *
 * Extracted from BootstrapService to keep the orchestrator thin.
 * The class receives required dependencies via constructor injection.
 */

import {MessageGroupService} from '../../message-group/message-group-service.js';
import {assertCritical} from '../../utils/assert.js';
import {
  BOOTSTRAP_DEFAULT,
  BOOTSTRAP_ERROR,
  BOOTSTRAP_LOG_MSG,
  BOOTSTRAP_UNIFIED_RECONCILE,
} from '../bootstrap-constants.js';
import {
  INITIAL_MESSAGE_GROUP_ID,
  INITIAL_MESSAGE_GROUP_REPLICA_IDS,
} from '../system-table-schemas-constants.js';
import {
  ADDRESS,
  ENTITY_TYPE,
  NUM,
  SERVICE_DESCRIPTOR_FIELD,
  SERVICE_LIFECYCLE_STATE,
  UNIFIED_SERVICE_TYPE,
} from '../../constants/index.js';
import {
  getBootstrapMessageGroupService as selectBootstrapMessageGroupService,
  resolveOperationalMessageGroupSelection,
  resolveOperationalMessageGroupSelectionAsync,
} from '../shared/message-group-selection.js';

/**
 * Format missing-replica assertion message for bootstrap lifecycle.
 * @param {string} replicaId
 * @return {string}
 */
const formatReplicaMissingAtStart = (replicaId) =>
  `Message-group replica ${replicaId} missing at start`;

/**
 * Handles the message-groups phase of seed bootstrap.
 */
class SeedMessageGroupsPhase {
  /**
   * @param {Object} options
   * @param {Object} options.delegates - Callbacks into the bootstrap
   *   service for accessing mutable state.
   */
  constructor(options = {}) {
    this.delegates = options.delegates || {};
  }

  /**
   * Phase 2: Message group creation.
   * Create initial message group with 3 replicas on seed node.
   * Elections are DEFERRED until after partitions are created.
   * @return {Promise<void>}
   */
  async phaseMessageGroups() {
    const d = this.delegates;
    const logger = d.getLogger();
    const config = d.getConfig();
    const groupId = INITIAL_MESSAGE_GROUP_ID;
    const replicaIds = INITIAL_MESSAGE_GROUP_REPLICA_IDS;
    const replicaStaggerDelayMs = config.replicaStaggerDelayMs;

    logger.debug(BOOTSTRAP_LOG_MSG.CREATING_MESSAGE_GROUP, {
      groupId,
      replicaCount: replicaIds.length,
      nodeId: d.getNodeId(),
    });

    d.resetMessageGroupReplicas();
    const nodeId = d.getNodeId();
    const peerAddresses = replicaIds.map((replicaId) =>
      `${nodeId}${ADDRESS.SEPARATOR}` +
      `${ENTITY_TYPE.MESSAGE_GROUP}${ADDRESS.SEPARATOR}${replicaId}`,
    );
    for (let index = NUM.ZERO; index < replicaIds.length; index++) {
      const replicaId = replicaIds[index];
      d.queueBootstrapServiceReplica(
        d.createBootstrapServiceDescriptor(
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
        },
      );
    }

    await d.triggerBootstrapReconciler(
      BOOTSTRAP_UNIFIED_RECONCILE.MESSAGE_GROUPS_REASON,
    );
    d.incrementMessageGroupsCreated();
    logger.debug(BOOTSTRAP_LOG_MSG.MESSAGE_GROUPS_CREATED_DEFERRED, {
      groupId,
      replicaCount: d.getMessageGroupReplicas().length,
      nodeId: d.getNodeId(),
    });
  }

  /**
   * Unified lifecycle create hook for message-group replicas.
   * @param {Object} context
   * @return {Promise<Object>}
   */
  async createBootstrapMessageGroupReplica(context) {
    const d = this.delegates;
    const logger = d.getLogger();
    const definition = context?.definition || {};
    const directOptions = context?.replicaOptions || null;
    const serviceId =
      directOptions?.replicaId ||
      definition[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID];
    const options = directOptions ||
      d.resolveBootstrapReplicaOptions(
        serviceId,
        UNIFIED_SERVICE_TYPE.MESSAGE_GROUP,
      );

    if (d.getMessageGroupServices().has(options.replicaId)) {
      return {status: SERVICE_LIFECYCLE_STATE.CREATED};
    }

    if (options.createDelayMs > NUM.ZERO) {
      await d.sleep(options.createDelayMs);
    }

    const messageGroup = new MessageGroupService({
      groupId: options.groupId,
      replicaId: options.replicaId,
      nodeId: d.getNodeId(),
      replicaIds: options.replicaIds,
      peerAddresses: options.peerAddresses,
      transport: d.getMessageRouter(),
      deferElection: Boolean(options.deferElection),
      bootstrapReadinessState:
        typeof d.getBootstrapReadinessState === 'function' ?
          d.getBootstrapReadinessState() :
          null,
    });

    const unifiedAddress =
      `${d.getNodeId()}${ADDRESS.SEPARATOR}` +
      `${ENTITY_TYPE.MESSAGE_GROUP}${ADDRESS.SEPARATOR}` +
      `${options.replicaId}`;
    d.getMessageRouter().register(unifiedAddress, (envelope) => {
      return messageGroup.receiveMessage(envelope);
    });

    await messageGroup.initialize();

    d.getMessageGroupServices().set(
      options.replicaId, messageGroup,
    );
    d.pushMessageGroupReplica(messageGroup);
    d.incrementServicesCreated();

    logger.debug(BOOTSTRAP_LOG_MSG.MESSAGE_GROUP_REPLICA_CREATED, {
      groupId: options.groupId,
      replicaId: options.replicaId,
      replicaIndex: options.replicaIndex,
      nodeId: d.getNodeId(),
    });

    return {status: SERVICE_LIFECYCLE_STATE.CREATED};
  }

  /**
   * Unified lifecycle start hook for message-group replicas.
   * @param {Object} replicaHandle
   * @param {Object} _context
   * @return {Promise<Object>}
   */
  async startBootstrapMessageGroupReplica(replicaHandle, _context) {
    const d = this.delegates;
    const directOptions = _context?.replicaOptions || null;
    const serviceId =
      directOptions?.replicaId ||
      replicaHandle[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID] ||
      replicaHandle[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID];
    const options = directOptions ||
      d.resolveBootstrapReplicaOptions(
        serviceId,
        UNIFIED_SERVICE_TYPE.MESSAGE_GROUP,
      );
    const messageGroup =
      d.getMessageGroupServices().get(options.replicaId);

    assertCritical(
      messageGroup,
      formatReplicaMissingAtStart(options.replicaId),
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
   * Unified lifecycle stop hook for message-group replicas.
   * @param {Object} replicaHandle
   * @param {Object} _context
   * @return {Promise<Object>}
   */
  async stopBootstrapMessageGroupReplica(replicaHandle, _context) {
    const d = this.delegates;
    const directOptions = _context?.replicaOptions || null;
    const serviceId =
      directOptions?.replicaId ||
      replicaHandle[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID] ||
      replicaHandle[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID];
    const options = directOptions ||
      d.resolveBootstrapReplicaOptions(
        serviceId,
        UNIFIED_SERVICE_TYPE.MESSAGE_GROUP,
      );
    const messageGroup =
      d.getMessageGroupServices().get(options.replicaId);
    if (!messageGroup) {
      return {status: SERVICE_LIFECYCLE_STATE.STOPPED};
    }

    if (messageGroup.shutdown) {
      await messageGroup.shutdown();
    }

    const unifiedAddress =
      `${d.getNodeId()}${ADDRESS.SEPARATOR}` +
      `${ENTITY_TYPE.MESSAGE_GROUP}${ADDRESS.SEPARATOR}` +
      `${options.replicaId}`;
    const messageRouter = d.getMessageRouter();
    if (messageRouter) {
      messageRouter.unregister(unifiedAddress);
    }

    d.getMessageGroupServices().delete(options.replicaId);
    d.filterMessageGroupReplicas(messageGroup);

    return {status: SERVICE_LIFECYCLE_STATE.STOPPED};
  }

  /**
   * Wait for message group leadership to be established.
   * Implements exponential backoff up to configured timeout.
   * @param {string} groupId - Message group ID.
   * @param {Array<string>} replicaIds - Replica IDs.
   * @return {Promise<void>}
   */
  async waitForMessageGroupLeadership(groupId, replicaIds) {
    const d = this.delegates;
    const logger = d.getLogger();
    const config = d.getConfig();
    const startTime = Date.now();
    const timeoutMs = config.leadershipWaitTimeoutMs ||
      BOOTSTRAP_DEFAULT.leadershipWaitTimeoutMs;
    let delay = config.leadershipWaitInitialDelayMs ||
      BOOTSTRAP_DEFAULT.leadershipWaitInitialDelayMs;
    const maxDelay = config.leadershipWaitMaxDelayMs ||
      BOOTSTRAP_DEFAULT.leadershipWaitMaxDelayMs;
    const backoffMultiplier =
      config.leadershipWaitBackoffMultiplier ||
      BOOTSTRAP_DEFAULT.leadershipWaitBackoffMultiplier;

    logger.debug(BOOTSTRAP_LOG_MSG.WAITING_MESSAGE_GROUP_LEADER, {
      groupId,
      timeoutMs,
      nodeId: d.getNodeId(),
    });

    // Check immediately first
    for (const replicaId of replicaIds) {
      const service =
        d.getMessageGroupServices().get(replicaId);
      if (service && service.isLeaderReplica()) {
        logger.debug(
          BOOTSTRAP_LOG_MSG.MESSAGE_GROUP_LEADER_IMMEDIATE, {
            groupId,
            leaderId: replicaId,
            elapsedMs: NUM.ZERO,
          });
        return;
      }
    }

    while (Date.now() - startTime < timeoutMs) {
      await d.sleep(delay);
      delay = Math.min(delay * backoffMultiplier, maxDelay);

      for (const replicaId of replicaIds) {
        const service =
          d.getMessageGroupServices().get(replicaId);
        if (service && service.isLeaderReplica()) {
          logger.debug(
            BOOTSTRAP_LOG_MSG.MESSAGE_GROUP_LEADER_FOUND, {
              groupId,
              leaderId: replicaId,
              elapsedMs: Date.now() - startTime,
            });
          return;
        }
      }
    }

    const error = new Error(
      BOOTSTRAP_ERROR.messageGroupLeadershipTimeout(
        groupId, timeoutMs,
      ),
    );
    error.groupId = groupId;
    error.timeoutMs = timeoutMs;
    throw error;
  }

  /**
   * Resolve the operational local message-group ingress.
   * Bootstrap-only "any replica" selection must not leak into runtime.
   * @param {Object} [options]
   * @param {Array<string>} [options.requiredTables]
   * @return {Object}
   */
  resolveOperationalMessageGroupSelection(options = {}) {
    const d = this.delegates;
    return resolveOperationalMessageGroupSelection(
      d.getMessageGroupServices(),
      options,
    );
  }

  /**
   * Resolve operational ingress after allowing authoritative topology repair
   * for strict system-table CDC.
   * @param {Object} [options]
   * @param {Array<string>} [options.requiredTables]
   * @return {Promise<Object>}
   */
  async resolveOperationalMessageGroupSelectionAsync(options = {}) {
    const d = this.delegates;
    return resolveOperationalMessageGroupSelectionAsync(
      d.getMessageGroupServices(),
      options,
    );
  }

  /**
   * Get the operational message-group service for runtime traffic.
   * @param {Object} [options]
   * @param {Array<string>} [options.requiredTables]
   * @return {Object|null}
   */
  getLeaderMessageGroupService(options = {}) {
    return this.resolveOperationalMessageGroupSelection(options).service;
  }

  /**
   * Get a bootstrap-only message-group handle before leadership exists.
   * This must only be used during formation-time wiring.
   * @return {Object|null}
   */
  getBootstrapMessageGroupService() {
    const d = this.delegates;
    return selectBootstrapMessageGroupService(
      d.getMessageGroupServices(),
    );
  }
}

export {SeedMessageGroupsPhase};
