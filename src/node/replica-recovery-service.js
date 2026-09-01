/**
 * Replica Recovery Service - Creates replacement replicas on healthy nodes.
 * Maintains minimum replica counts when nodes fail.
 * Requirements: 14.2
 */

import {EventEmitter} from 'events';
import {v4 as uuidv4} from 'uuid';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {CONFIG_KEY} from '../config/config-constants.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {
  REPLICATION_TARGET_SOURCE,
  resolveDesiredReplicationFactor,
} from '../bootstrap/replication-target-authority.js';
import {SERVICE_TYPE} from '../constants/index.js';
import {assertCritical} from '../utils/assert.js';
import {
  CONTROL_PLANE_MUTATION_OPERATION,
} from '../control-plane/control-plane-system-table-gateway.js';
import {createControlPlaneRuntimeBundle} from
  '../control-plane/control-plane-runtime-bundle.js';
import {PRESSURE_WORK_CLASS} from '../control-plane/pressure-governor.js';
import {
  REPLICA_RECOVERY_DEFAULT,
  REPLICA_RECOVERY_ENTITY_TYPE,
  REPLICA_RECOVERY_ERROR_MSG,
  REPLICA_RECOVERY_EVENT,
  REPLICA_RECOVERY_KEY_PREFIX,
  REPLICA_RECOVERY_LOG_MSG,
  REPLICA_RECOVERY_NODE_STATUS,
  REPLICA_RECOVERY_NUM,
  REPLICA_RECOVERY_REPLICA_STATUS,
  REPLICA_RECOVERY_SUBSYSTEM,
} from './replica-recovery-constants.js';
import {
  selectReplicaRecoveryTargetNodes,
  sortReplicaRecoveryNodesByLoad,
} from './replica-recovery-placement.js';

const LOCAL_STR_CRITICAL = 'critical';

/**
 * Node status values.
 */
const NodeStatus = REPLICA_RECOVERY_NODE_STATUS;

/**
 * Replica status values.
 */
const ReplicaStatus = REPLICA_RECOVERY_REPLICA_STATUS;

/**
 * Service types.
 */
const ServiceType = {
  PARTITION_REPLICA: SERVICE_TYPE.PARTITION,
  MESSAGE_GROUP_REPLICA: SERVICE_TYPE.MESSAGE_GROUP,
};

/**
 * ReplicaRecoveryService monitors for failed replicas and creates replacements.
 * It ensures minimum replica counts are maintained for both partitions and
 * message groups.
 */
class ReplicaRecoveryService extends EventEmitter {
  /**
   * Create a new ReplicaRecoveryService.
   * @param {Object} options - Configuration options.
   * @param {Object} options.systemTableCache - Read-only system table cache.
   * @param {Object} options.cdcIntegrationService - CDC integration service for writes.
   * @param {string} options.nodeId - This node's ID.
   */
  constructor(options = {}) {
    super();

    this.systemTableCache = options.systemTableCache || null;
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.controlPlaneSystemTableGateway =
      options.controlPlaneSystemTableGateway || null;
    this.nodeId = options.nodeId || null;

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.checkIntervalMs = config.get(CONFIG_KEY.REPLICA_RECOVERY_CHECK_INTERVAL_MS) ||
      REPLICA_RECOVERY_DEFAULT.CHECK_INTERVAL_MS;
    this.recoveryDelayMs = config.get(CONFIG_KEY.REPLICA_RECOVERY_DELAY_MS) ||
      REPLICA_RECOVERY_DEFAULT.RECOVERY_DELAY_MS;

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(REPLICA_RECOVERY_SUBSYSTEM) : console;

    // State
    this.checkTimer = null;
    this.monitoringActive = false;
    this.currentCheckIntervalMs = this.checkIntervalMs;
    this.pendingRecoveries = new Map(); // entityId -> recovery info
    this.recoveryCount = 0;

    this.initialized = false;
  }

  /**
   * Initialize the replica recovery service.
   * @param {Object} options - Initialization options.
   */
  initialize(options = {}) {
    if (options.systemTableCache) {
      this.systemTableCache = options.systemTableCache;
    }
    if (options.cdcIntegrationService) {
      this.cdcIntegrationService = options.cdcIntegrationService;
    }
    if (options.controlPlaneSystemTableGateway) {
      this.controlPlaneSystemTableGateway = options.controlPlaneSystemTableGateway;
    }
    if (options.nodeId) {
      this.nodeId = options.nodeId;
    }

    if (!this.nodeId) {
      throw new Error(REPLICA_RECOVERY_ERROR_MSG.MISSING_NODE_ID);
    }
    this.systemTableCache = assertCritical(
      this.systemTableCache,
      REPLICA_RECOVERY_ERROR_MSG.MISSING_SYSTEM_TABLE_CACHE,
    );
    this.cdcIntegrationService = assertCritical(
      this.cdcIntegrationService,
      REPLICA_RECOVERY_ERROR_MSG.MISSING_CDC_SERVICE,
    );

    this.initialized = true;

    this.logger.info(REPLICA_RECOVERY_LOG_MSG.INITIALIZED, {
      nodeId: this.nodeId,
      checkIntervalMs: this.checkIntervalMs,
    });
  }

  /**
   * Start the replica recovery monitoring loop.
   */
  start() {
    if (!this.initialized) {
      throw new Error(REPLICA_RECOVERY_ERROR_MSG.NOT_INITIALIZED);
    }

    if (this.monitoringActive) {
      return; // Already running
    }

    this.logger.info(REPLICA_RECOVERY_LOG_MSG.STARTING_MONITORING, {
      nodeId: this.nodeId,
      intervalMs: this.checkIntervalMs,
    });

    this.monitoringActive = true;
    this.currentCheckIntervalMs = this.checkIntervalMs;
    this.scheduleNextCheck(this.currentCheckIntervalMs);
  }

  /**
   * Stop the replica recovery monitoring loop.
   */
  stop() {
    this.monitoringActive = false;
    if (this.checkTimer) {
      clearTimeout(this.checkTimer);
      this.checkTimer = null;
    }

    this.logger.info(REPLICA_RECOVERY_LOG_MSG.STOPPED_MONITORING, {
      nodeId: this.nodeId,
    });
  }

  /**
   * Check replica counts for all partitions and message groups.
   * @return {Promise<Object>} Summary of cycle activity.
   */
  async checkReplicaCounts() {
    const partitionSummary = await this.checkPartitionReplicas();
    const messageGroupSummary = await this.checkMessageGroupReplicas();
    const deficitCount = partitionSummary.deficitCount +
      messageGroupSummary.deficitCount;
    const recoveryCount = partitionSummary.recoveryCount +
      messageGroupSummary.recoveryCount;

    return {
      deficitCount,
      recoveryCount,
      hadActivity: deficitCount > REPLICA_RECOVERY_NUM.ZERO ||
        recoveryCount > REPLICA_RECOVERY_NUM.ZERO ||
        this.pendingRecoveries.size > REPLICA_RECOVERY_NUM.ZERO,
    };
  }

  /**
   * Scan one entity class for replica deficits and trigger recovery.
   * Desired RF is DECLARED policy, decoded by the single authority. An
   * undeclared policy is an unreadable requirement: recovery must not
   * substitute a config minimum for it (that fallback silently restated
   * policy), so the row is warned about and skipped instead.
   * @param {Object} spec - Entity scan specification.
   * @return {Promise<Object>} Summary counts for the entity class.
   * @private
   */
  async checkReplicaDeficits(spec) {
    let deficitCount = REPLICA_RECOVERY_NUM.ZERO;
    let recoveryCount = REPLICA_RECOVERY_NUM.ZERO;

    for (const row of spec.rows) {
      const context = {nodeId: this.nodeId, ...spec.rowContext(row)};
      const healthyReplicas = spec.healthyReplicasFor(row);
      const desiredTarget = resolveDesiredReplicationFactor(row);
      if (desiredTarget.source === REPLICATION_TARGET_SOURCE.UNDECLARED) {
        this.logger.warn(spec.undeclaredLogMessage, context);
        continue;
      }
      const targetCount = desiredTarget.replicationFactor;

      if (healthyReplicas.length < targetCount) {
        deficitCount += 1;
        try {
          recoveryCount += await spec.triggerRecovery(
            row,
            healthyReplicas,
            targetCount,
          );
        } catch (error) {
          if (error?.isCritical) {
            throw error;
          }
          this.logger.error(REPLICA_RECOVERY_LOG_MSG.CHECK_ERROR, {
            ...context,
            entityType: spec.entityType,
            error: error.message,
          });
        }
      }
    }

    return {
      deficitCount,
      recoveryCount,
    };
  }

  /**
   * Check partition replica counts and trigger recovery if needed.
   * @return {Promise<Object>} Summary for partition entities.
   * @private
   */
  async checkPartitionReplicas() {
    return this.checkReplicaDeficits({
      rows: this.getPartitions(),
      rowContext: (row) => ({partitionId: row.partition_id}),
      healthyReplicasFor: (row) =>
        this.getHealthyPartitionReplicas(row.partition_id),
      undeclaredLogMessage: REPLICA_RECOVERY_LOG_MSG.PARTITION_POLICY_UNDECLARED,
      entityType: REPLICA_RECOVERY_ENTITY_TYPE.PARTITION,
      triggerRecovery: (row, healthyReplicas, targetCount) =>
        this.triggerPartitionRecovery(row, healthyReplicas, targetCount),
    });
  }

  /**
   * Check message group replica counts and trigger recovery if needed.
   * @return {Promise<Object>} Summary for message group entities.
   * @private
   */
  async checkMessageGroupReplicas() {
    return this.checkReplicaDeficits({
      rows: this.getMessageGroups(),
      rowContext: (row) => ({groupId: row.group_id}),
      healthyReplicasFor: (row) =>
        this.getHealthyMessageGroupReplicas(row.group_id),
      undeclaredLogMessage:
        REPLICA_RECOVERY_LOG_MSG.MESSAGE_GROUP_POLICY_UNDECLARED,
      entityType: REPLICA_RECOVERY_ENTITY_TYPE.MESSAGE_GROUP,
      triggerRecovery: (row, healthyReplicas, targetCount) =>
        this.triggerMessageGroupRecovery(row, healthyReplicas, targetCount),
    });
  }

  /**
   * Schedule the next monitoring cycle as a one-shot timer.
   * @param {number} delayMs - Delay before next cycle.
   * @private
   */
  scheduleNextCheck(delayMs) {
    if (!this.monitoringActive) {
      return;
    }

    const boundedDelay = Math.max(
      this.checkIntervalMs,
      Math.min(delayMs, REPLICA_RECOVERY_DEFAULT.MAX_CHECK_INTERVAL_MS),
    );

    this.checkTimer = setTimeout(async () => {
      this.checkTimer = null;
      if (!this.monitoringActive) {
        return;
      }

      let cycleSummary = {
        hadActivity: false,
      };
      try {
        cycleSummary = await this.checkReplicaCounts();
      } catch (error) {
        if (error?.isCritical) {
          throw error;
        }
        this.logger.error(REPLICA_RECOVERY_LOG_MSG.CHECK_ERROR, {
          nodeId: this.nodeId,
          error: error.message,
        });
      }

      this.updateCheckCadence(cycleSummary);
      this.scheduleNextCheck(this.currentCheckIntervalMs);
    }, boundedDelay);

    this.checkTimer.unref();
  }

  /**
   * Adapt monitoring cadence based on recent activity.
   * @param {Object} cycleSummary - Summary returned from checkReplicaCounts.
   */
  updateCheckCadence(cycleSummary = {}) {
    if (cycleSummary.hadActivity) {
      this.currentCheckIntervalMs = this.checkIntervalMs;
      return;
    }

    const nextIntervalMs = Math.floor(
      this.currentCheckIntervalMs *
      REPLICA_RECOVERY_DEFAULT.IDLE_BACKOFF_MULTIPLIER,
    );
    this.currentCheckIntervalMs = Math.min(
      REPLICA_RECOVERY_DEFAULT.MAX_CHECK_INTERVAL_MS,
      Math.max(this.checkIntervalMs, nextIntervalMs),
    );
  }

  /**
   * Trigger recovery for a partition with insufficient replicas.
   * @param {Object} partition - Partition needing recovery.
   * @param {Array<Object>} healthyReplicas - Current healthy replicas.
   * @param {number} targetCount - Target replica count.
   * @return {Promise<number>} Number of replicas created.
   * @private
   */
  async triggerPartitionRecovery(partition, healthyReplicas, targetCount) {
    const needed = targetCount - healthyReplicas.length;
    const recoveryKey = `${REPLICA_RECOVERY_KEY_PREFIX.PARTITION}${partition.partition_id}`;

    // Check if recovery is already pending
    if (this.pendingRecoveries.has(recoveryKey)) {
      return REPLICA_RECOVERY_NUM.ZERO;
    }

    this.logger.warn(REPLICA_RECOVERY_LOG_MSG.PARTITION_BELOW_MIN, {
      partitionId: partition.partition_id,
      tableId: partition.table_id,
      healthyCount: healthyReplicas.length,
      targetCount,
      needed,
    });

    // Find healthy nodes to place new replicas
    const healthyNodes = this.getHealthyNodes();
    const existingNodeIds = new Set(healthyReplicas.map((r) => r.node_id));

    // Prefer nodes that don't already have a replica
    const candidateNodes = healthyNodes.filter((n) => !existingNodeIds.has(n.node_id));

    // If not enough candidate nodes, allow duplicates on existing nodes
    const targetNodes = this.selectTargetNodes(candidateNodes, healthyNodes, needed);

    if (targetNodes.length === REPLICA_RECOVERY_NUM.ZERO) {
      this.logger.error(REPLICA_RECOVERY_LOG_MSG.NO_HEALTHY_NODES_PARTITION, {
        partitionId: partition.partition_id,
        needed,
      });
      return REPLICA_RECOVERY_NUM.ZERO;
    }

    // Mark recovery as pending
    this.pendingRecoveries.set(recoveryKey, {
      type: REPLICA_RECOVERY_ENTITY_TYPE.PARTITION,
      entityId: partition.partition_id,
      startedAt: Date.now(),
      targetNodes,
    });

    try {
      // Create replacement replicas
      let createdCount = REPLICA_RECOVERY_NUM.ZERO;
      for (const node of targetNodes) {
        await this.createPartitionReplica(partition, node.node_id);
        createdCount += 1;
      }
      return createdCount;
    } finally {
      // Clear pending recovery even on failure so the next cycle can retry.
      this.pendingRecoveries.delete(recoveryKey);
    }
  }

  /**
   * Trigger recovery for a message group with insufficient replicas.
   * @param {Object} group - Message group needing recovery.
   * @param {Array<Object>} healthyReplicas - Current healthy replicas.
   * @param {number} targetCount - Target replica count.
   * @return {Promise<number>} Number of replicas created.
   * @private
   */
  async triggerMessageGroupRecovery(group, healthyReplicas, targetCount) {
    const needed = targetCount - healthyReplicas.length;
    const recoveryKey = `${REPLICA_RECOVERY_KEY_PREFIX.MESSAGE_GROUP}${group.group_id}`;

    // Check if recovery is already pending
    if (this.pendingRecoveries.has(recoveryKey)) {
      return REPLICA_RECOVERY_NUM.ZERO;
    }

    this.logger.warn(REPLICA_RECOVERY_LOG_MSG.MESSAGE_GROUP_BELOW_MIN, {
      groupId: group.group_id,
      healthyCount: healthyReplicas.length,
      targetCount,
      needed,
    });

    // Find healthy nodes to place new replicas
    const healthyNodes = this.getHealthyNodes();
    const existingNodeIds = new Set(healthyReplicas.map((r) => r.node_id));

    // Prefer nodes that don't already have a replica
    const candidateNodes = healthyNodes.filter((n) => !existingNodeIds.has(n.node_id));

    // If not enough candidate nodes, allow duplicates on existing nodes
    const targetNodes = this.selectTargetNodes(candidateNodes, healthyNodes, needed);

    if (targetNodes.length === REPLICA_RECOVERY_NUM.ZERO) {
      this.logger.error(REPLICA_RECOVERY_LOG_MSG.NO_HEALTHY_NODES_MESSAGE_GROUP, {
        groupId: group.group_id,
        needed,
      });
      return REPLICA_RECOVERY_NUM.ZERO;
    }

    // Mark recovery as pending
    this.pendingRecoveries.set(recoveryKey, {
      type: REPLICA_RECOVERY_ENTITY_TYPE.MESSAGE_GROUP,
      entityId: group.group_id,
      startedAt: Date.now(),
      targetNodes,
    });

    try {
      // Create replacement replicas
      let createdCount = REPLICA_RECOVERY_NUM.ZERO;
      for (const node of targetNodes) {
        await this.createMessageGroupReplica(group, node.node_id);
        createdCount += 1;
      }
      return createdCount;
    } finally {
      // Clear pending recovery even on failure so the next cycle can retry.
      this.pendingRecoveries.delete(recoveryKey);
    }
  }

  selectTargetNodes(preferredNodes, allNodes, needed) {
    return selectReplicaRecoveryTargetNodes(
      preferredNodes,
      allNodes,
      needed,
      (nodes) => this.sortNodesByLoad(nodes),
    );
  }

  sortNodesByLoad(nodes) {
    return sortReplicaRecoveryNodesByLoad(nodes);
  }

  /**
   * Create a new partition replica on a node.
   * @param {Object} partition - Partition to replicate.
   * @param {string} nodeId - Target node ID.
   * @return {Promise<Object>} Created replica info.
   * @private
   */
  async createPartitionReplica(partition, nodeId) {
    const serviceId = uuidv4();

    this.logger.info(REPLICA_RECOVERY_LOG_MSG.CREATE_PARTITION_REPLICA, {
      partitionId: partition.partition_id,
      tableId: partition.table_id,
      nodeId,
      serviceId,
    });

    try {
      await this.getControlPlaneSystemTableGateway().submitMutation({
        operation: CONTROL_PLANE_MUTATION_OPERATION.INSERT,
        tableName: SYSTEM_TABLE_NAME.SERVICES,
        row: {
          service_id: serviceId,
          node_id: nodeId,
          service_type: ServiceType.PARTITION_REPLICA,
          partition_id: partition.partition_id,
          table_id: partition.table_id,
          status: ReplicaStatus.STARTING,
          created_at: Date.now(),
          id: serviceId,
        },
      }, {
        workClass: PRESSURE_WORK_CLASS.CRITICAL,
        deliveryPriority: LOCAL_STR_CRITICAL,
      });

      this.recoveryCount++;

      this.emit(REPLICA_RECOVERY_EVENT.REPLICA_CREATED, {
        type: REPLICA_RECOVERY_ENTITY_TYPE.PARTITION,
        serviceId,
        partitionId: partition.partition_id,
        nodeId,
      });

      return {
        success: true,
        serviceId,
        partitionId: partition.partition_id,
        nodeId,
      };
    } catch (error) {
      this.logger.error(REPLICA_RECOVERY_LOG_MSG.CREATE_PARTITION_FAILED, {
        partitionId: partition.partition_id,
        nodeId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Create a new message group replica on a node.
   * @param {Object} group - Message group to replicate.
   * @param {string} nodeId - Target node ID.
   * @return {Promise<Object>} Created replica info.
   * @private
   */
  async createMessageGroupReplica(group, nodeId) {
    const serviceId = uuidv4();

    this.logger.info(REPLICA_RECOVERY_LOG_MSG.CREATE_MESSAGE_GROUP_REPLICA, {
      groupId: group.group_id,
      nodeId,
      serviceId,
    });

    try {
      await this.getControlPlaneSystemTableGateway().submitMutation({
        operation: CONTROL_PLANE_MUTATION_OPERATION.INSERT,
        tableName: SYSTEM_TABLE_NAME.SERVICES,
        row: {
          service_id: serviceId,
          node_id: nodeId,
          service_type: ServiceType.MESSAGE_GROUP_REPLICA,
          group_id: group.group_id,
          status: ReplicaStatus.STARTING,
          created_at: Date.now(),
          id: serviceId,
        },
      }, {
        workClass: PRESSURE_WORK_CLASS.CRITICAL,
        deliveryPriority: LOCAL_STR_CRITICAL,
      });

      this.recoveryCount++;

      this.emit(REPLICA_RECOVERY_EVENT.REPLICA_CREATED, {
        type: REPLICA_RECOVERY_ENTITY_TYPE.MESSAGE_GROUP,
        serviceId,
        groupId: group.group_id,
        nodeId,
      });

      return {
        success: true,
        serviceId,
        groupId: group.group_id,
        nodeId,
      };
    } catch (error) {
      this.logger.error(REPLICA_RECOVERY_LOG_MSG.CREATE_MESSAGE_GROUP_FAILED, {
        groupId: group.group_id,
        nodeId,
        error: error.message,
      });
      throw error;
    }
  }

  getControlPlaneSystemTableGateway() {
    if (this.controlPlaneSystemTableGateway) {
      return this.controlPlaneSystemTableGateway;
    }
    this.controlPlaneSystemTableGateway = createControlPlaneRuntimeBundle({
      nodeId: this.nodeId,
      getCdcIntegrationService: () => this.cdcIntegrationService,
    }).controlPlaneSystemTableGateway;
    return this.controlPlaneSystemTableGateway;
  }

  /**
   * Get all partitions from cache.
   * @return {Array<Object>} Array of partition objects.
   * @private
   */
  getPartitions() {
    assertCritical(
      this.systemTableCache,
      REPLICA_RECOVERY_ERROR_MSG.MISSING_SYSTEM_TABLE_CACHE,
    );

    return this.systemTableCache.getAll(SYSTEM_TABLE_NAME.PARTITIONS);
  }

  /**
   * Get all message groups from cache.
   * @return {Array<Object>} Array of message group objects.
   * @private
   */
  getMessageGroups() {
    assertCritical(
      this.systemTableCache,
      REPLICA_RECOVERY_ERROR_MSG.MISSING_SYSTEM_TABLE_CACHE,
    );

    return this.systemTableCache.getAll(SYSTEM_TABLE_NAME.MESSAGE_GROUPS);
  }

  /**
   * Get healthy partition replicas for a partition.
   * @param {string} partitionId - Partition ID.
   * @return {Array<Object>} Array of healthy replica objects.
   * @private
   */
  getHealthyPartitionReplicas(partitionId) {
    assertCritical(
      this.systemTableCache,
      REPLICA_RECOVERY_ERROR_MSG.MISSING_SYSTEM_TABLE_CACHE,
    );

    const services = this.systemTableCache.filter(SYSTEM_TABLE_NAME.SERVICES, (service) => {
      return service.partition_id === partitionId &&
        service.service_type === ServiceType.PARTITION_REPLICA &&
        service.status === ReplicaStatus.ACTIVE;
    });

    // Also check that the node is healthy
    return services.filter((service) => {
      const node = this.getNode(service.node_id);
      return node && node.status === NodeStatus.ACTIVE;
    });
  }

  /**
   * Get healthy message group replicas for a message group.
   * @param {string} groupId - Message group ID.
   * @return {Array<Object>} Array of healthy replica objects.
   * @private
   */
  getHealthyMessageGroupReplicas(groupId) {
    assertCritical(
      this.systemTableCache,
      REPLICA_RECOVERY_ERROR_MSG.MISSING_SYSTEM_TABLE_CACHE,
    );

    const services = this.systemTableCache.filter(SYSTEM_TABLE_NAME.SERVICES, (service) => {
      return service.group_id === groupId &&
        service.service_type === ServiceType.MESSAGE_GROUP_REPLICA &&
        service.status === ReplicaStatus.ACTIVE;
    });

    // Also check that the node is healthy
    return services.filter((service) => {
      const node = this.getNode(service.node_id);
      return node && node.status === NodeStatus.ACTIVE;
    });
  }

  /**
   * Get healthy nodes from cache.
   * @return {Array<Object>} Array of healthy node objects.
   * @private
   */
  getHealthyNodes() {
    assertCritical(
      this.systemTableCache,
      REPLICA_RECOVERY_ERROR_MSG.MISSING_SYSTEM_TABLE_CACHE,
    );

    return this.systemTableCache.filter(SYSTEM_TABLE_NAME.NODES, (node) => {
      return node.status === NodeStatus.ACTIVE;
    });
  }

  /**
   * Get a node by ID from cache.
   * @param {string} nodeId - Node ID.
   * @return {Object|null} Node object or null.
   * @private
   */
  getNode(nodeId) {
    assertCritical(
      this.systemTableCache,
      REPLICA_RECOVERY_ERROR_MSG.MISSING_SYSTEM_TABLE_CACHE,
    );

    const nodes = this.systemTableCache.filter(SYSTEM_TABLE_NAME.NODES, (node) => {
      return node.node_id === nodeId;
    });
    return nodes[0] || null;
  }

  /**
   * Get replica recovery statistics.
   * @return {Object} Statistics object.
   */
  getStats() {
    return {
      nodeId: this.nodeId,
      checkIntervalMs: this.checkIntervalMs,
      currentCheckIntervalMs: this.currentCheckIntervalMs,
      pendingRecoveries: this.pendingRecoveries.size,
      recoveryCount: this.recoveryCount,
      isRunning: this.monitoringActive,
      initialized: this.initialized,
    };
  }

  /**
   * Check if service is initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    return this.initialized;
  }

  /**
   * Check if service is running.
   * @return {boolean} True if running.
   */
  isRunning() {
    return this.monitoringActive;
  }

  /**
   * Shutdown the replica recovery service.
   */
  shutdown() {
    this.stop();
    this.pendingRecoveries.clear();
    this.initialized = false;

    this.logger.info(REPLICA_RECOVERY_LOG_MSG.SHUTDOWN, {
      nodeId: this.nodeId,
      totalRecoveries: this.recoveryCount,
    });
  }
}

export {
  ReplicaRecoveryService,
  NodeStatus,
  ReplicaStatus,
  ServiceType,
};
