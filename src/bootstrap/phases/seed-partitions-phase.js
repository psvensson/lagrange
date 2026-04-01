/**
 * Seed Partitions Phase — handles Phase 3 of seed bootstrap:
 * creating system table partitions with deferred elections,
 * partition leadership wait, epoch manager initialization,
 * and partition replica progress reporting.
 *
 * Extracted from BootstrapService to keep the orchestrator thin.
 * The class receives required dependencies via constructor injection.
 */

import {PartitionService} from '../../partition/partition-service.js';
import {assertCritical} from '../../utils/assert.js';
import {AssignmentEpochManager} from '../../rebalancer/assignment-epoch-manager.js';
import {AssignmentEpoch} from '../../rebalancer/assignment-epoch.js';
import {EPOCH_CONFIG_KEY} from '../../cdc/cdc-integration-service.js';
import {StartupRecoveryCoordinator} from '../startup-recovery-coordinator.js';
import {resolveCanonicalLeaderService} from
  '../../cache/leader-readiness-gate.js';
import {
  BOOTSTRAP_DEFAULT,
  BOOTSTRAP_ERROR,
  BOOTSTRAP_LOG_MSG,
  BOOTSTRAP_PARTITION_LEADERSHIP_DEFAULT,
  BOOTSTRAP_REPLICA_PROGRESS,
  BOOTSTRAP_UNIFIED_RECONCILE,
} from '../bootstrap-constants.js';
import {
  SYSTEM_TABLE_NAME,
  SYSTEM_TABLE_SCHEMAS,
  INITIAL_PARTITION_IDS,
  INITIAL_REPLICA_IDS,
  INITIAL_MESSAGE_GROUP_ID,
  INITIAL_MESSAGE_GROUP_REPLICA_IDS,
} from '../system-table-schemas-constants.js';
import {PARTITION_SERVICE_INIT_STAGE} from
  '../../partition/partition-service-constants.js';
import {
  ADDRESS,
  COLUMN,
  ENTITY_TYPE,
  NUM,
  SERVICE_DESCRIPTOR_FIELD,
  SERVICE_LIFECYCLE_STATE,
  SERVICE_TYPE,
  STRING,
  UNIFIED_SERVICE_TYPE,
} from '../../constants/index.js';

/**
 * Handles the partitions phase of seed bootstrap.
 */
class SeedPartitionsPhase {
  /**
   * @param {Object} options
   * @param {Object} options.delegates - Callbacks into the bootstrap
   *   service for accessing mutable state.
   */
  constructor(options = {}) {
    this.delegates = options.delegates || {};
  }

  /**
   * Phase 3: Partition creation for system tables.
   * Elections are deferred until ALL partitions are created.
   * @return {Promise<void>}
   */
  async phasePartitions() {
    const d = this.delegates;
    const logger = d.getLogger();
    const config = d.getConfig();
    const replicaStaggerDelayMs = config.replicaStaggerDelayMs;
    let queuedPartitionReplicaCount = NUM.ZERO;
    d.resetPartitionReplicas();

    for (const schema of SYSTEM_TABLE_SCHEMAS) {
      const tableName = schema.tableName;
      const partitionId = INITIAL_PARTITION_IDS[tableName];
      const replicaIds = INITIAL_REPLICA_IDS[tableName];

      logger.debug(BOOTSTRAP_LOG_MSG.CREATING_SYSTEM_PARTITION, {
        tableName,
        partitionId,
        replicaCount: replicaIds.length,
        nodeId: d.getNodeId(),
      });

      const nodeId = d.getNodeId();
      const peerAddresses = replicaIds.map((replicaId) =>
        `${nodeId}${ADDRESS.SEPARATOR}` +
        `${ENTITY_TYPE.PARTITION}${ADDRESS.SEPARATOR}${replicaId}`,
      );
      for (let index = NUM.ZERO; index < replicaIds.length; index++) {
        const replicaId = replicaIds[index];
        const dbPath = d.resolvePartitionDbPath(
          partitionId, replicaId,
        );

        d.queueBootstrapServiceReplica(
          d.createBootstrapServiceDescriptor(
            UNIFIED_SERVICE_TYPE.PARTITION,
            replicaId,
          ),
          {
            serviceType: UNIFIED_SERVICE_TYPE.PARTITION,
            tableName,
            schema,
            partitionId,
            replicaId,
            replicaIds,
            replicaIndex: index,
            peerAddresses,
            dbPath,
            deferElection: true,
            createDelayMs: index > NUM.ZERO ?
              index * replicaStaggerDelayMs :
              NUM.ZERO,
          },
        );
        queuedPartitionReplicaCount++;
      }
    }

    const firstBatchReplicaCount = Math.min(
      queuedPartitionReplicaCount,
      config.maxConcurrentServiceActions,
    );
    logger.info(BOOTSTRAP_LOG_MSG.PARTITION_CREATION_BATCH_STARTING, {
      nodeId: d.getNodeId(),
      tableCount: SYSTEM_TABLE_SCHEMAS.length,
      queuedReplicaCount: queuedPartitionReplicaCount,
      firstBatchReplicaCount,
      maxConcurrentServiceActions:
        config.maxConcurrentServiceActions,
    });
    await d.triggerBootstrapReconciler(
      BOOTSTRAP_UNIFIED_RECONCILE.PARTITIONS_REASON,
    );
    d.setPartitionsCreated(SYSTEM_TABLE_SCHEMAS.length);

    await this.startDeferredBootstrapReplicaElections();

    const serviceReconciler = d.getServiceReconciler();
    if (serviceReconciler) {
      serviceReconciler.stop();
    }
    await this.initializeEpochManager();

    logger.debug(BOOTSTRAP_LOG_MSG.PARTITIONS_CREATED, {
      partitionsCreated: d.getPartitionsCreated(),
      nodeId: d.getNodeId(),
    });
  }

  /**
   * Unified lifecycle create hook for partition replicas.
   * @param {Object} context
   * @return {Promise<Object>}
   */
  async createBootstrapPartitionReplica(context) {
    const d = this.delegates;
    const logger = d.getLogger();
    const definition = context?.definition || {};
    const serviceId =
      definition[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID];
    const options = d.resolveBootstrapReplicaOptions(
      serviceId,
      UNIFIED_SERVICE_TYPE.PARTITION,
    );

    if (d.getPartitionServices().has(options.replicaId)) {
      return {status: SERVICE_LIFECYCLE_STATE.CREATED};
    }

    if (options.createDelayMs > NUM.ZERO) {
      await d.sleep(options.createDelayMs);
    }

    const progress = this.startPartitionReplicaProgress({
      tableName: options.tableName,
      partitionId: options.partitionId,
      replicaId: options.replicaId,
      peerTotal: Math.max(
        NUM.ZERO, options.replicaIds.length - NUM.ONE,
      ),
    });

    try {
      const partition = new PartitionService({
        partitionId: options.partitionId,
        tableId: options.tableName,
        tableName: options.tableName,
        schema: options.schema,
        keyRange: {start: null, end: null},
        replicaId: options.replicaId,
        replicaIds: options.replicaIds,
        peerAddresses: options.peerAddresses,
        nodeId: d.getNodeId(),
        transport: d.getTransport(),
        dbPath: options.dbPath,
        messageGroupService: d.getBootstrapMessageGroupService(),
        messageRouter: d.getMessageRouter(),
        rebalanceCoordinator: d.getRebalanceCoordinator(),
        cdcIntegrationService: d.getCdcIntegrationService(),
        sqlQueryEngine: d.getCdcIntegrationService()?.sqlQueryEngine || null,
        deferElection: Boolean(options.deferElection),
        bootstrapReadinessState:
          typeof d.getBootstrapReadinessState === 'function' ?
            d.getBootstrapReadinessState() :
            null,
        suppressLifecycleLogs: true,
        onInitializationStage: (stageEvent) =>
          this.updatePartitionReplicaProgress(
            progress, stageEvent,
          ),
      });

      await partition.initialize();
      d.getPartitionServices().set(options.replicaId, partition);
      d.pushPartitionReplica(partition);
      d.incrementServicesCreated();
      this.finishPartitionReplicaProgress(progress);

      logger.debug(BOOTSTRAP_LOG_MSG.PARTITION_REPLICA_CREATED, {
        tableName: options.tableName,
        partitionId: options.partitionId,
        replicaId: options.replicaId,
        replicaIndex: options.replicaIndex,
        nodeId: d.getNodeId(),
      });
    } catch (error) {
      this.failPartitionReplicaProgress(progress, error);
      throw error;
    }

    return {status: SERVICE_LIFECYCLE_STATE.CREATED};
  }

  /**
   * Unified lifecycle start hook for partition replicas.
   * @param {Object} replicaHandle
   * @param {Object} _context
   * @return {Promise<Object>}
   */
  async startBootstrapPartitionReplica(replicaHandle, _context) {
    const d = this.delegates;
    const serviceId =
      replicaHandle[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID] ||
      replicaHandle[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID];
    const options = d.resolveBootstrapReplicaOptions(
      serviceId,
      UNIFIED_SERVICE_TYPE.PARTITION,
    );
    const partition =
      d.getPartitionServices().get(options.replicaId);

    assertCritical(
      partition,
      `Partition replica ${options.replicaId} missing at start`,
    );

    if (!options.deferElection) {
      partition.startElection();
    }

    return {
      status: SERVICE_LIFECYCLE_STATE.RUNNING,
      deferred: Boolean(options.deferElection),
    };
  }

  /**
   * Unified lifecycle stop hook for partition replicas.
   * @param {Object} replicaHandle
   * @param {Object} _context
   * @return {Promise<Object>}
   */
  async stopBootstrapPartitionReplica(replicaHandle, _context) {
    const d = this.delegates;
    const serviceId =
      replicaHandle[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID] ||
      replicaHandle[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID];
    const options = d.resolveBootstrapReplicaOptions(
      serviceId,
      UNIFIED_SERVICE_TYPE.PARTITION,
    );
    const partition =
      d.getPartitionServices().get(options.replicaId);
    if (!partition) {
      return {status: SERVICE_LIFECYCLE_STATE.STOPPED};
    }

    if (partition.shutdown) {
      await partition.shutdown();
    }

    const unifiedAddress = partition.getUnifiedAddress ?
      partition.getUnifiedAddress() :
      `${d.getNodeId()}${ADDRESS.SEPARATOR}` +
      `${ENTITY_TYPE.PARTITION}${ADDRESS.SEPARATOR}` +
      `${options.replicaId}`;
    const messageRouter = d.getMessageRouter();
    if (messageRouter) {
      messageRouter.unregister(unifiedAddress);
    }

    d.getPartitionServices().delete(options.replicaId);
    d.filterPartitionReplicas(partition);

    return {status: SERVICE_LIFECYCLE_STATE.STOPPED};
  }

  /**
   * Start deferred elections for message groups then partitions.
   * @return {Promise<void>}
   */
  async startDeferredBootstrapReplicaElections() {
    const d = this.delegates;
    const logger = d.getLogger();
    const messageGroupReplicas = d.getMessageGroupReplicas();

    if (messageGroupReplicas &&
        messageGroupReplicas.length > NUM.ZERO) {
      logger.info(BOOTSTRAP_LOG_MSG.STARTING_MG_ELECTIONS, {
        totalReplicas: messageGroupReplicas.length,
        nodeId: d.getNodeId(),
      });

      for (const messageGroup of messageGroupReplicas) {
        messageGroup.startElection();
      }

      await d.waitForMessageGroupLeadership(
        INITIAL_MESSAGE_GROUP_ID,
        INITIAL_MESSAGE_GROUP_REPLICA_IDS,
      );

      logger.debug(
        BOOTSTRAP_LOG_MSG.MESSAGE_GROUP_LEADERSHIP_READY, {
          groupId: INITIAL_MESSAGE_GROUP_ID,
          nodeId: d.getNodeId(),
        });
    }

    const partitionReplicas = d.getPartitionReplicas();
    logger.info(BOOTSTRAP_LOG_MSG.STARTING_PARTITION_ELECTIONS, {
      totalReplicas: partitionReplicas.length,
      partitionsCreated: d.getPartitionsCreated(),
      nodeId: d.getNodeId(),
    });

    for (const partition of partitionReplicas) {
      partition.startElection();
    }
  }

  /**
   * Wait for all system table partitions to establish leadership.
   * @return {Promise<void>}
   */
  async waitForPartitionLeadership() {
    const d = this.delegates;
    const logger = d.getLogger();
    const config = d.getConfig();
    const startTime = Date.now();
    const timeoutMs = Math.min(
      config.leadershipWaitTimeoutMs ||
        BOOTSTRAP_DEFAULT.leadershipWaitTimeoutMs,
      BOOTSTRAP_PARTITION_LEADERSHIP_DEFAULT.TIMEOUT_CAP_MS,
    );
    let delay = config.leadershipWaitInitialDelayMs ||
      BOOTSTRAP_PARTITION_LEADERSHIP_DEFAULT.INITIAL_DELAY_MS;
    const maxDelay =
      BOOTSTRAP_PARTITION_LEADERSHIP_DEFAULT.MAX_DELAY_MS;
    const backoffMultiplier =
      BOOTSTRAP_PARTITION_LEADERSHIP_DEFAULT.BACKOFF_MULTIPLIER;

    const partitionIds = new Set();
    for (const partition of d.getPartitionServices().values()) {
      partitionIds.add(partition.partitionId);
    }

    logger.debug(BOOTSTRAP_LOG_MSG.WAITING_PARTITION_LEADERS, {
      partitionCount: partitionIds.size,
      timeoutMs,
      nodeId: d.getNodeId(),
    });

    const leadersFound = this.checkPartitionLeaders(partitionIds);
    if (leadersFound.size === partitionIds.size) {
      logger.debug(
        BOOTSTRAP_LOG_MSG.PARTITION_LEADERS_IMMEDIATE, {
          partitionCount: partitionIds.size,
          elapsedMs: NUM.ZERO,
        });
      return;
    }

    while (Date.now() - startTime < timeoutMs) {
      await d.sleep(delay);
      delay = Math.min(delay * backoffMultiplier, maxDelay);

      const leaders = this.checkPartitionLeaders(partitionIds);
      if (leaders.size === partitionIds.size) {
        logger.debug(BOOTSTRAP_LOG_MSG.PARTITION_LEADERS_FOUND, {
          partitionCount: partitionIds.size,
          elapsedMs: Date.now() - startTime,
        });
        return;
      }
    }

    const leaders = this.checkPartitionLeaders(partitionIds);
    const missing = [...partitionIds].filter(
      (id) => !leaders.has(id),
    );
    logger.error(BOOTSTRAP_LOG_MSG.PARTITION_LEADERS_PENDING, {
      totalPartitions: partitionIds.size,
      leadersFound: leaders.size,
      missingLeaders: missing,
      elapsedMs: Date.now() - startTime,
      nodeId: d.getNodeId(),
    });

    const error = new Error(
      BOOTSTRAP_ERROR.partitionLeadershipTimeout(
        missing, timeoutMs,
      ),
    );
    error.missingLeaders = missing;
    error.timeoutMs = timeoutMs;
    throw error;
  }

  /**
   * Check which partitions have leaders.
   * @param {Set<string>} partitionIds
   * @return {Set<string>}
   */
  checkPartitionLeaders(partitionIds) {
    const d = this.delegates;
    const leadersFound = new Set();
    for (const partition of d.getPartitionServices().values()) {
      if (!partitionIds.has(partition.partitionId)) {
        continue;
      }

      if (partition.isLeader ||
          this.canBypassCanonicalPartitionLeadership(
            partition.partitionId,
          ) ||
          this.canBypassLocalPriorityPartitionLeadership(
            partition.partitionId,
          )) {
        leadersFound.add(partition.partitionId);
      }
    }
    return leadersFound;
  }

  canBypassLocalPriorityPartitionLeadership(partitionId) {
    const d = this.delegates;
    if (!this.hasInitializedLocalPartitionReplica(partitionId)) {
      return false;
    }

    const readinessState =
      typeof d.getBootstrapReadinessState === 'function' ?
        d.getBootstrapReadinessState() :
        null;
    if (!readinessState) {
      return false;
    }

    const startupRecoveryCoordinator =
      new StartupRecoveryCoordinator({readinessState});
    return startupRecoveryCoordinator.evaluate({partitionId})
      .shouldBypassLocalPriorityControlPlaneStartupReadiness === true;
  }

  canBypassCanonicalPartitionLeadership(partitionId) {
    if (!this.hasInitializedLocalPartitionReplica(partitionId)) {
      return false;
    }

    const d = this.delegates;
    const systemTableCache =
      typeof d.getSystemTableCacheRef === 'function' ?
        d.getSystemTableCacheRef() :
        typeof d.getSystemTableCacheSafe === 'function' ?
          d.getSystemTableCacheSafe() :
        null;
    if (!systemTableCache) {
      return false;
    }

    return Boolean(resolveCanonicalLeaderService(
      systemTableCache,
      SERVICE_TYPE.PARTITION,
      partitionId,
      {requireAddress: true},
    ).leaderService);
  }

  hasInitializedLocalPartitionReplica(partitionId) {
    const d = this.delegates;
    for (const partition of d.getPartitionServices().values()) {
      if (partition?.partitionId !== partitionId) {
        continue;
      }
      if (partition?.initialized === false) {
        continue;
      }
      return true;
    }

    return false;
  }

  /**
   * Initialize the AssignmentEpochManager with the initial epoch.
   * @return {Promise<void>}
   */
  async initializeEpochManager() {
    const d = this.delegates;
    const logger = d.getLogger();
    const initialAssignments = {};
    const partitionNodes = new Map();

    for (const [_replicaId, partition] of d.getPartitionServices()) {
      const partitionId = partition.partitionId;
      if (!partitionNodes.has(partitionId)) {
        partitionNodes.set(partitionId, []);
      }
      if (!partitionNodes.get(partitionId).includes(d.getNodeId())) {
        partitionNodes.get(partitionId).push(d.getNodeId());
      }
    }

    for (const [partitionId, nodes] of partitionNodes) {
      initialAssignments[partitionId] = nodes;
    }

    const epochManager = new AssignmentEpochManager({
      nodeId: d.getNodeId(),
      timestampProvider: () => new Date().toISOString(),
    });

    const persistedEpoch =
      await this.loadPersistedEpochFromLocalConfigPartition();
    if (persistedEpoch) {
      epochManager.initialize(persistedEpoch);
    } else {
      const initialEpoch = new AssignmentEpoch({
        epoch: NUM.ZERO,
        assignments: initialAssignments,
        timestamp: new Date().toISOString(),
        proposedBy: d.getNodeId(),
      });
      epochManager.initialize(initialEpoch);
    }

    d.setEpochManager(epochManager);

    logger.info(BOOTSTRAP_LOG_MSG.EPOCH_MANAGER_READY, {
      nodeId: d.getNodeId(),
      epoch: epochManager.getCurrentEpoch().epoch,
      partitionCount: Object.keys(initialAssignments).length,
      assignments: initialAssignments,
    });
  }

  /**
   * Load persisted assignment epoch from the local config partition.
   * @return {Promise<AssignmentEpoch|null>}
   */
  async loadPersistedEpochFromLocalConfigPartition() {
    const d = this.delegates;
    const logger = d.getLogger();
    const configReplicaIds =
      INITIAL_REPLICA_IDS[SYSTEM_TABLE_NAME.CONFIG] || [];
    for (const replicaId of configReplicaIds) {
      const configPartition =
        d.getPartitionServices().get(replicaId);
      if (!configPartition) {
        continue;
      }

      try {
        const result = await configPartition.executeLocalQuery(
          'SELECT config_value FROM config WHERE config_key = ?',
          [EPOCH_CONFIG_KEY],
        );
        const hasRow = result?.success &&
          Array.isArray(result.rows) &&
          result.rows.length > NUM.ZERO;
        if (!hasRow) {
          continue;
        }

        const configValue =
          result.rows[NUM.ZERO]?.[COLUMN.CONFIG_VALUE];
        if (typeof configValue !== 'string' ||
            configValue.length === NUM.ZERO) {
          continue;
        }

        return AssignmentEpoch.fromJSON(configValue);
      } catch (error) {
        logger.warn(BOOTSTRAP_LOG_MSG.CONFIG_CHECK_FAILED, {
          nodeId: d.getNodeId(),
          replicaId,
          error: error.message,
        });
      }
    }

    return null;
  }

  // -- Progress reporting methods --

  /**
   * Start progress reporting for one partition replica creation.
   * @param {Object} details
   * @return {Object}
   */
  startPartitionReplicaProgress(details) {
    const d = this.delegates;
    return d.getPartitionReplicaProgressReporter().start({
      ...details,
      stage: PARTITION_SERVICE_INIT_STAGE.STARTING,
      peerTotal: Math.max(
        NUM.ZERO, details.peerTotal || NUM.ZERO,
      ),
      peerJoined: NUM.ZERO,
    });
  }

  /**
   * Update partition creation progress based on stage callbacks.
   * @param {Object|null} progress
   * @param {Object} stageEvent
   */
  updatePartitionReplicaProgress(progress, stageEvent) {
    if (!progress || !stageEvent) {
      return;
    }

    const update = {};
    if (stageEvent.stage) {
      update.stage = stageEvent.stage;
    }
    if (Number.isFinite(stageEvent.peerTotal)) {
      update.peerTotal = Math.max(NUM.ZERO, stageEvent.peerTotal);
    }
    if (Number.isFinite(stageEvent.peerJoined)) {
      update.peerJoined = Math.max(
        NUM.ZERO, stageEvent.peerJoined,
      );
    }
    if (stageEvent.peerId) {
      update.peerId = stageEvent.peerId;
    }
    if (Number.isFinite(stageEvent.sizeBytes)) {
      update.sizeBytes = stageEvent.sizeBytes;
    }

    const d = this.delegates;
    d.getPartitionReplicaProgressReporter().update(
      progress, update,
    );
  }

  /**
   * Complete partition creation progress reporting.
   * @param {Object|null} progress
   */
  finishPartitionReplicaProgress(progress) {
    const d = this.delegates;
    d.getPartitionReplicaProgressReporter().finish(progress, {
      stage: PARTITION_SERVICE_INIT_STAGE.READY,
    });
  }

  /**
   * Fail partition creation progress reporting.
   * @param {Object|null} progress
   * @param {Error|string|null} error
   */
  failPartitionReplicaProgress(progress, error) {
    const d = this.delegates;
    d.getPartitionReplicaProgressReporter().fail(progress, error);
  }

  /**
   * Format one partition creation progress line.
   * @param {Object} progress
   * @param {string|null} status
   * @param {Error|string|null} error
   * @return {string}
   */
  formatPartitionReplicaProgressLine(progress, status, error) {
    const d = this.delegates;
    const spinner = progress.spinnerFrame ||
      BOOTSTRAP_REPLICA_PROGRESS.SPINNER_IDLE;
    const peerTotal = Number.isFinite(progress.peerTotal) ?
      progress.peerTotal : NUM.ZERO;
    const peerJoined = Number.isFinite(progress.peerJoined) ?
      progress.peerJoined : NUM.ZERO;
    const localReplicas = d.getPartitionServices().size +
      (status ? NUM.ZERO : NUM.ONE);
    const statusText = status ? ` status=${status}` : '';
    const errorText = error ?
      ` error=${this.formatReplicaCreationError(error)}` : '';

    return (
      `${BOOTSTRAP_REPLICA_PROGRESS.PREFIX} ${spinner} ` +
      `service=${progress.partitionId} ` +
      `replica=${progress.replicaId} ` +
      `type=${BOOTSTRAP_REPLICA_PROGRESS.TYPE_PARTITION} ` +
      `stage=${progress.stage} ` +
      `peers=${peerJoined}/${peerTotal} ` +
      `local_replicas=${localReplicas}` +
      `${statusText}${errorText}`
    );
  }

  /**
   * Build structured context for non-interactive partition progress
   * logs.
   * @param {Object} progress
   * @param {string|null} status
   * @param {Error|string|null} error
   * @return {Object}
   */
  buildPartitionReplicaProgressContext(
    progress, status = null, error = null,
  ) {
    const d = this.delegates;
    const context = {
      nodeId: d.getNodeId(),
      partitionId: progress.partitionId,
      tableName: progress.tableName,
      replicaId: progress.replicaId,
      stage: progress.stage,
      peerTotal: progress.peerTotal,
      peerJoined: progress.peerJoined,
      localReplicas: d.getPartitionServices().size,
    };
    if (status) {
      context.status = status;
    }
    if (error) {
      context.error = this.formatReplicaCreationError(error);
    }
    return context;
  }

  /**
   * Normalize replica creation errors for display.
   * @param {Error|string|null} error
   * @return {string}
   */
  formatReplicaCreationError(error) {
    if (!error) {
      return STRING.EMPTY;
    }
    return typeof error === 'string' ? error : error.message;
  }

  /**
   * Get the AssignmentEpochManager instance.
   * @return {AssignmentEpochManager|null}
   */
  getEpochManager() {
    return this.delegates.getEpochManager();
  }
}

export {SeedPartitionsPhase};
