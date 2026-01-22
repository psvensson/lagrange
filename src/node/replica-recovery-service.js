/**
 * Replica Recovery Service - Creates replacement replicas on healthy nodes.
 * Maintains minimum replica counts when nodes fail.
 * Requirements: 14.2
 */

import {EventEmitter} from 'events';
import {v4 as uuidv4} from 'uuid';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {SystemTableName} from '../bootstrap/system-table-schemas.js';

/**
 * Node status values.
 */
const NodeStatus = {
  ACTIVE: 'active',
  SUSPECTED: 'suspected',
  FAILED: 'failed',
  RECOVERING: 'recovering',
};

/**
 * Replica status values.
 */
const ReplicaStatus = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  FAILED: 'failed',
  STARTING: 'starting',
  STOPPING: 'stopping',
};

/**
 * Service types.
 */
const ServiceType = {
  PARTITION_REPLICA: 'partition',
  MESSAGE_GROUP_REPLICA: 'message_group',
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
    this.nodeId = options.nodeId || null;

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.checkIntervalMs = config.get('replicaRecovery.checkIntervalMs') || 10000;
    this.minPartitionReplicas = config.get('replicaRecovery.minPartitionReplicas') || 3;
    this.minMessageGroupReplicas =
      config.get('replicaRecovery.minMessageGroupReplicas') || 3;
    this.recoveryDelayMs = config.get('replicaRecovery.recoveryDelayMs') || 5000;

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem('replica-recovery') : console;

    // State
    this.checkTimer = null;
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
    if (options.nodeId) {
      this.nodeId = options.nodeId;
    }

    if (!this.nodeId) {
      throw new Error('ReplicaRecoveryService requires nodeId');
    }

    this.initialized = true;

    this.logger.info('Replica recovery service initialized', {
      nodeId: this.nodeId,
      checkIntervalMs: this.checkIntervalMs,
      minPartitionReplicas: this.minPartitionReplicas,
      minMessageGroupReplicas: this.minMessageGroupReplicas,
    });
  }

  /**
   * Start the replica recovery monitoring loop.
   */
  start() {
    if (!this.initialized) {
      throw new Error('ReplicaRecoveryService not initialized');
    }

    if (this.checkTimer) {
      return; // Already running
    }

    this.logger.info('Starting replica recovery monitoring', {
      nodeId: this.nodeId,
      intervalMs: this.checkIntervalMs,
    });

    this.checkTimer = setInterval(async () => {
      try {
        await this.checkReplicaCounts();
      } catch (error) {
        this.logger.error('Error during replica recovery check', {
          nodeId: this.nodeId,
          error: error.message,
        });
      }
    }, this.checkIntervalMs);
  }

  /**
   * Stop the replica recovery monitoring loop.
   */
  stop() {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }

    this.logger.info('Stopped replica recovery monitoring', {
      nodeId: this.nodeId,
    });
  }

  /**
   * Check replica counts for all partitions and message groups.
   * @return {Promise<void>}
   */
  async checkReplicaCounts() {
    await this.checkPartitionReplicas();
    await this.checkMessageGroupReplicas();
  }

  /**
   * Check partition replica counts and trigger recovery if needed.
   * @return {Promise<void>}
   * @private
   */
  async checkPartitionReplicas() {
    const partitions = this.getPartitions();

    for (const partition of partitions) {
      const healthyReplicas = this.getHealthyPartitionReplicas(partition.partition_id);
      const targetCount = partition.replica_count || this.minPartitionReplicas;

      if (healthyReplicas.length < targetCount) {
        await this.triggerPartitionRecovery(partition, healthyReplicas, targetCount);
      }
    }
  }

  /**
   * Check message group replica counts and trigger recovery if needed.
   * @return {Promise<void>}
   * @private
   */
  async checkMessageGroupReplicas() {
    const messageGroups = this.getMessageGroups();

    for (const group of messageGroups) {
      const healthyReplicas = this.getHealthyMessageGroupReplicas(group.group_id);
      const targetCount = group.replica_count || this.minMessageGroupReplicas;

      if (healthyReplicas.length < targetCount) {
        await this.triggerMessageGroupRecovery(group, healthyReplicas, targetCount);
      }
    }
  }

  /**
   * Trigger recovery for a partition with insufficient replicas.
   * @param {Object} partition - Partition needing recovery.
   * @param {Array<Object>} healthyReplicas - Current healthy replicas.
   * @param {number} targetCount - Target replica count.
   * @return {Promise<void>}
   * @private
   */
  async triggerPartitionRecovery(partition, healthyReplicas, targetCount) {
    const needed = targetCount - healthyReplicas.length;
    const recoveryKey = `partition:${partition.partition_id}`;

    // Check if recovery is already pending
    if (this.pendingRecoveries.has(recoveryKey)) {
      return;
    }

    this.logger.warn('Partition replica count below minimum', {
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

    if (targetNodes.length === 0) {
      this.logger.error('No healthy nodes available for partition recovery', {
        partitionId: partition.partition_id,
        needed,
      });
      return;
    }

    // Mark recovery as pending
    this.pendingRecoveries.set(recoveryKey, {
      type: 'partition',
      entityId: partition.partition_id,
      startedAt: Date.now(),
      targetNodes,
    });

    // Create replacement replicas
    for (const node of targetNodes) {
      await this.createPartitionReplica(partition, node.node_id);
    }

    // Clear pending recovery
    this.pendingRecoveries.delete(recoveryKey);
  }

  /**
   * Trigger recovery for a message group with insufficient replicas.
   * @param {Object} group - Message group needing recovery.
   * @param {Array<Object>} healthyReplicas - Current healthy replicas.
   * @param {number} targetCount - Target replica count.
   * @return {Promise<void>}
   * @private
   */
  async triggerMessageGroupRecovery(group, healthyReplicas, targetCount) {
    const needed = targetCount - healthyReplicas.length;
    const recoveryKey = `message_group:${group.group_id}`;

    // Check if recovery is already pending
    if (this.pendingRecoveries.has(recoveryKey)) {
      return;
    }

    this.logger.warn('Message group replica count below minimum', {
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

    if (targetNodes.length === 0) {
      this.logger.error('No healthy nodes available for message group recovery', {
        groupId: group.group_id,
        needed,
      });
      return;
    }

    // Mark recovery as pending
    this.pendingRecoveries.set(recoveryKey, {
      type: 'message_group',
      entityId: group.group_id,
      startedAt: Date.now(),
      targetNodes,
    });

    // Create replacement replicas
    for (const node of targetNodes) {
      await this.createMessageGroupReplica(group, node.node_id);
    }

    // Clear pending recovery
    this.pendingRecoveries.delete(recoveryKey);
  }

  /**
   * Select target nodes for replica placement.
   * @param {Array<Object>} preferredNodes - Nodes without existing replicas.
   * @param {Array<Object>} allNodes - All healthy nodes.
   * @param {number} needed - Number of replicas needed.
   * @return {Array<Object>} Selected target nodes.
   * @private
   */
  selectTargetNodes(preferredNodes, allNodes, needed) {
    const selected = [];

    // First, use preferred nodes (no existing replicas)
    for (let i = 0; i < Math.min(needed, preferredNodes.length); i++) {
      selected.push(preferredNodes[i]);
    }

    // If still need more, use any healthy node
    const remaining = needed - selected.length;
    if (remaining > 0 && allNodes.length > 0) {
      // Sort by load (prefer less loaded nodes)
      const sortedNodes = this.sortNodesByLoad(allNodes);
      for (let i = 0; i < remaining && i < sortedNodes.length; i++) {
        selected.push(sortedNodes[i]);
      }
    }

    return selected;
  }

  /**
   * Sort nodes by load (prefer less loaded nodes).
   * @param {Array<Object>} nodes - Nodes to sort.
   * @return {Array<Object>} Sorted nodes.
   * @private
   */
  sortNodesByLoad(nodes) {
    return [...nodes].sort((a, b) => {
      const loadA = (a.cpu_usage_percent || 0) +
        (a.memory_usage_percent || 0) +
        (a.disk_usage_percent || 0);
      const loadB = (b.cpu_usage_percent || 0) +
        (b.memory_usage_percent || 0) +
        (b.disk_usage_percent || 0);
      return loadA - loadB;
    });
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

    this.logger.info('Creating replacement partition replica', {
      partitionId: partition.partition_id,
      tableId: partition.table_id,
      nodeId,
      serviceId,
    });

    if (this.cdcIntegrationService) {
      try {
        await this.cdcIntegrationService.insertSystemTableRow(
          SystemTableName.SERVICES,
          {
            service_id: serviceId,
            node_id: nodeId,
            service_type: ServiceType.PARTITION_REPLICA,
            partition_id: partition.partition_id,
            table_id: partition.table_id,
            status: ReplicaStatus.STARTING,
            created_at: Date.now(),
            id: serviceId,
          },
        );

        this.recoveryCount++;

        this.emit('replicaCreated', {
          type: 'partition',
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
        this.logger.error('Failed to create partition replica', {
          partitionId: partition.partition_id,
          nodeId,
          error: error.message,
        });
        throw error;
      }
    }

    return {success: false, reason: 'no_cdc_service'};
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

    this.logger.info('Creating replacement message group replica', {
      groupId: group.group_id,
      nodeId,
      serviceId,
    });

    if (this.cdcIntegrationService) {
      try {
        await this.cdcIntegrationService.insertSystemTableRow(
          SystemTableName.SERVICES,
          {
            service_id: serviceId,
            node_id: nodeId,
            service_type: ServiceType.MESSAGE_GROUP_REPLICA,
            group_id: group.group_id,
            status: ReplicaStatus.STARTING,
            created_at: Date.now(),
            id: serviceId,
          },
        );

        this.recoveryCount++;

        this.emit('replicaCreated', {
          type: 'message_group',
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
        this.logger.error('Failed to create message group replica', {
          groupId: group.group_id,
          nodeId,
          error: error.message,
        });
        throw error;
      }
    }

    return {success: false, reason: 'no_cdc_service'};
  }

  /**
   * Get all partitions from cache.
   * @return {Array<Object>} Array of partition objects.
   * @private
   */
  getPartitions() {
    if (!this.systemTableCache) {
      return [];
    }

    try {
      return this.systemTableCache.getAll('partitions') || [];
    } catch (_error) {
      return [];
    }
  }

  /**
   * Get all message groups from cache.
   * @return {Array<Object>} Array of message group objects.
   * @private
   */
  getMessageGroups() {
    if (!this.systemTableCache) {
      return [];
    }

    try {
      return this.systemTableCache.getAll('message_groups') || [];
    } catch (_error) {
      return [];
    }
  }

  /**
   * Get healthy partition replicas for a partition.
   * @param {string} partitionId - Partition ID.
   * @return {Array<Object>} Array of healthy replica objects.
   * @private
   */
  getHealthyPartitionReplicas(partitionId) {
    if (!this.systemTableCache) {
      return [];
    }

    try {
      const services = this.systemTableCache.filter('services', (service) => {
        return service.partition_id === partitionId &&
          service.service_type === ServiceType.PARTITION_REPLICA &&
          service.status === ReplicaStatus.ACTIVE;
      }) || [];

      // Also check that the node is healthy
      return services.filter((service) => {
        const node = this.getNode(service.node_id);
        return node && node.status === NodeStatus.ACTIVE;
      });
    } catch (_error) {
      return [];
    }
  }

  /**
   * Get healthy message group replicas for a message group.
   * @param {string} groupId - Message group ID.
   * @return {Array<Object>} Array of healthy replica objects.
   * @private
   */
  getHealthyMessageGroupReplicas(groupId) {
    if (!this.systemTableCache) {
      return [];
    }

    try {
      const services = this.systemTableCache.filter('services', (service) => {
        return service.group_id === groupId &&
          service.service_type === ServiceType.MESSAGE_GROUP_REPLICA &&
          service.status === ReplicaStatus.ACTIVE;
      }) || [];

      // Also check that the node is healthy
      return services.filter((service) => {
        const node = this.getNode(service.node_id);
        return node && node.status === NodeStatus.ACTIVE;
      });
    } catch (_error) {
      return [];
    }
  }

  /**
   * Get healthy nodes from cache.
   * @return {Array<Object>} Array of healthy node objects.
   * @private
   */
  getHealthyNodes() {
    if (!this.systemTableCache) {
      return [];
    }

    try {
      return this.systemTableCache.filter('nodes', (node) => {
        return node.status === NodeStatus.ACTIVE;
      }) || [];
    } catch (_error) {
      return [];
    }
  }

  /**
   * Get a node by ID from cache.
   * @param {string} nodeId - Node ID.
   * @return {Object|null} Node object or null.
   * @private
   */
  getNode(nodeId) {
    if (!this.systemTableCache) {
      return null;
    }

    try {
      const nodes = this.systemTableCache.filter('nodes', (node) => {
        return node.node_id === nodeId;
      }) || [];
      return nodes[0] || null;
    } catch (_error) {
      return null;
    }
  }

  /**
   * Get replica recovery statistics.
   * @return {Object} Statistics object.
   */
  getStats() {
    return {
      nodeId: this.nodeId,
      checkIntervalMs: this.checkIntervalMs,
      minPartitionReplicas: this.minPartitionReplicas,
      minMessageGroupReplicas: this.minMessageGroupReplicas,
      pendingRecoveries: this.pendingRecoveries.size,
      recoveryCount: this.recoveryCount,
      isRunning: this.checkTimer !== null,
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
    return this.checkTimer !== null;
  }

  /**
   * Shutdown the replica recovery service.
   */
  shutdown() {
    this.stop();
    this.pendingRecoveries.clear();
    this.initialized = false;

    this.logger.info('Replica recovery service shutdown', {
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
