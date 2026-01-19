/**
 * Bootstrap Service - System initialization and startup.
 * Implements four-phase bootstrap process for seed node.
 * Requirements: 6.3, 6.4, 6.7, 6.8, 6.9, 6.12, 6.13, 6.14, 6.16, 35.1, 35.5
 */

import {EventEmitter} from 'events';
import {v4 as uuidv4} from 'uuid';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {LoggingService} from '../logging/logging-service.js';
import {DataDirectoryManager} from '../storage/data-directory-manager.js';
import {NodeService} from '../node/node-service.js';
import {MessageGroupService} from '../message-group/message-group-service.js';
import {PartitionService} from '../partition/partition-service.js';
import {InMemoryTransport} from '../transport/in-memory-transport.js';
import {
  SystemTableName,
  SYSTEM_TABLE_SCHEMAS,
  INITIAL_PARTITION_IDS,
  INITIAL_REPLICA_IDS,
  INITIAL_MESSAGE_GROUP_ID,
  INITIAL_MESSAGE_GROUP_REPLICA_IDS,
} from './system-table-schemas.js';
import {CacheHydrationService} from '../cache/cache-hydration-service.js';
import {SQLQueryEngine} from '../query/sql-query-engine.js';

/**
 * Bootstrap phases enumeration.
 */
const BootstrapPhase = {
  NOT_STARTED: 'not_started',
  INFRASTRUCTURE: 'infrastructure',
  MESSAGE_GROUPS: 'message_groups',
  PARTITIONS: 'partitions',
  REGISTRATION: 'registration',
  CACHE_HYDRATION: 'cache_hydration',
  COMPLETE: 'complete',
  FAILED: 'failed',
};

/**
 * Default bootstrap configuration.
 */
const DEFAULT_BOOTSTRAP_CONFIG = {
  leadershipWaitTimeoutMs: 30000,
  leadershipWaitInitialDelayMs: 100,
  leadershipWaitMaxDelayMs: 5000,
  leadershipWaitBackoffMultiplier: 2,
  partitionDbPath: ':memory:',
};

/**
 * BootstrapService handles system initialization for seed nodes.
 * Implements four-phase bootstrap: infrastructure, message groups, partitions, registration.
 */
class BootstrapService extends EventEmitter {
  /**
   * Create a new BootstrapService.
   * @param {Object} options - Configuration options.
   * @param {Object} options.dataDirectoryManager - DataDirectoryManager instance.
   */
  constructor(options = {}) {
    super();

    this.nodeId = options.nodeId || null;
    this.nodeAddress = options.nodeAddress || null;
    this.config = options.config || DEFAULT_BOOTSTRAP_CONFIG;
    this.dataDirectoryManager = options.dataDirectoryManager || null;

    // Services created during bootstrap
    this.messageGroupServices = new Map();
    this.partitionServices = new Map();
    this.transport = null;

    // Bootstrap state
    this.phase = BootstrapPhase.NOT_STARTED;
    this.startTime = null;
    this.phaseStartTime = null;
    this.servicesCreated = 0;
    this.partitionsCreated = 0;
    this.messageGroupsCreated = 0;

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem('bootstrap') : console;

    // Error tracking
    this.lastError = null;
    this.cleanupRequired = false;
  }

  /**
   * Execute the full bootstrap process.
   * @return {Promise<Object>} Bootstrap result.
   */
  async bootstrap() {
    this.startTime = Date.now();

    this.logger.info('Starting bootstrap process', {
      nodeId: this.nodeId,
      phase: BootstrapPhase.NOT_STARTED,
    });

    try {
      // Phase 1: Infrastructure setup
      await this.executePhase(
        BootstrapPhase.INFRASTRUCTURE,
        () => this.phaseInfrastructure(),
      );

      // Phase 2: Message group creation
      await this.executePhase(
        BootstrapPhase.MESSAGE_GROUPS,
        () => this.phaseMessageGroups(),
      );

      // Phase 3: Partition creation for system tables
      await this.executePhase(
        BootstrapPhase.PARTITIONS,
        () => this.phasePartitions(),
      );

      // Phase 4: Service registration
      await this.executePhase(
        BootstrapPhase.REGISTRATION,
        () => this.phaseRegistration(),
      );

      // Phase 5: Cache hydration
      await this.executePhase(
        BootstrapPhase.CACHE_HYDRATION,
        () => this.phaseCacheHydration(),
      );

      // Bootstrap complete
      this.phase = BootstrapPhase.COMPLETE;
      const duration = Date.now() - this.startTime;

      this.logger.info('Bootstrap completed successfully', {
        nodeId: this.nodeId,
        duration,
        servicesCreated: this.servicesCreated,
        partitionsCreated: this.partitionsCreated,
        messageGroupsCreated: this.messageGroupsCreated,
      });

      this.emit('complete', {
        nodeId: this.nodeId,
        duration,
        servicesCreated: this.servicesCreated,
        partitionsCreated: this.partitionsCreated,
        messageGroupsCreated: this.messageGroupsCreated,
      });

      return {
        success: true,
        nodeId: this.nodeId,
        duration,
        servicesCreated: this.servicesCreated,
        partitionsCreated: this.partitionsCreated,
        messageGroupsCreated: this.messageGroupsCreated,
        messageGroupServices: this.messageGroupServices,
        partitionServices: this.partitionServices,
        transport: this.transport,
      };
    } catch (error) {
      return this.handleBootstrapFailure(error);
    }
  }

  /**
   * Execute a bootstrap phase with logging and timing.
   * @param {string} phaseName - Phase name.
   * @param {Function} phaseFunction - Phase implementation function.
   * @return {Promise<void>}
   * @private
   */
  async executePhase(phaseName, phaseFunction) {
    this.phase = phaseName;
    this.phaseStartTime = Date.now();

    this.logger.info('Starting bootstrap phase', {
      nodeId: this.nodeId,
      phase: phaseName,
      servicesCreated: this.servicesCreated,
    });

    this.emit('phaseStart', {
      phase: phaseName,
      nodeId: this.nodeId,
    });

    try {
      await phaseFunction();

      const phaseDuration = Date.now() - this.phaseStartTime;

      this.logger.info('Bootstrap phase completed', {
        nodeId: this.nodeId,
        phase: phaseName,
        duration: phaseDuration,
        servicesCreated: this.servicesCreated,
      });

      this.emit('phaseComplete', {
        phase: phaseName,
        nodeId: this.nodeId,
        duration: phaseDuration,
      });
    } catch (error) {
      const phaseDuration = Date.now() - this.phaseStartTime;

      this.logger.error('Bootstrap phase failed', {
        nodeId: this.nodeId,
        phase: phaseName,
        duration: phaseDuration,
        error: error.message,
        stack: error.stack,
      });

      this.emit('phaseFailed', {
        phase: phaseName,
        nodeId: this.nodeId,
        duration: phaseDuration,
        error: error.message,
      });

      throw error;
    }
  }

  /**
   * Phase 1: Infrastructure setup.
   * Initialize node service and transport.
   * @return {Promise<void>}
   * @private
   */
  async phaseInfrastructure() {
    // Initialize configuration if not already done
    const configManager = ConfigurationManager.getInstance();
    if (!configManager.isInitialized()) {
      configManager.initialize({
        node: {id: this.nodeId},
      });
    }

    // Get or generate node ID
    this.nodeId = this.nodeId || configManager.get('node.id') || uuidv4();

    // Initialize node service
    const nodeService = NodeService.getInstance();
    if (!nodeService.isInitialized()) {
      nodeService.initialize({
        nodeId: this.nodeId,
        nodeAddress: this.nodeAddress,
      });
    }

    this.nodeId = nodeService.getNodeId();
    this.nodeAddress = nodeService.getNodeAddress();

    // Create in-memory transport for local message passing
    this.transport = new InMemoryTransport();

    this.logger.debug('Infrastructure setup complete', {
      nodeId: this.nodeId,
      nodeAddress: this.nodeAddress,
    });
  }

  /**
   * Phase 2: Message group creation.
   * Create initial message group with 3 replicas on seed node.
   * @return {Promise<void>}
   * @private
   */
  async phaseMessageGroups() {
    const groupId = INITIAL_MESSAGE_GROUP_ID;
    const replicaIds = INITIAL_MESSAGE_GROUP_REPLICA_IDS;

    this.logger.debug('Creating initial message group', {
      groupId,
      replicaCount: replicaIds.length,
      nodeId: this.nodeId,
    });

    // Create all 3 replicas on seed node
    for (const replicaId of replicaIds) {
      const messageGroup = new MessageGroupService({
        groupId,
        replicaId,
        nodeId: this.nodeId,
        replicaIds,
        transport: this.transport,
        isSelfHostedGroup: true, // All replicas on same node - enables fast leader election
      });

      // Register with transport before initializing
      this.transport.register(replicaId, (envelope) => {
        return messageGroup.receiveMessage(envelope);
      });

      await messageGroup.initialize();

      this.messageGroupServices.set(replicaId, messageGroup);
      this.servicesCreated++;

      this.logger.debug('Message group replica created', {
        groupId,
        replicaId,
        nodeId: this.nodeId,
      });
    }

    this.messageGroupsCreated++;

    // Wait for leadership establishment
    await this.waitForMessageGroupLeadership(groupId, replicaIds);

    this.logger.debug('Message group leadership established', {
      groupId,
      nodeId: this.nodeId,
    });
  }

  /**
   * Wait for message group leadership to be established.
   * Implements exponential backoff up to 30 seconds.
   * @param {string} groupId - Message group ID.
   * @param {Array<string>} replicaIds - Replica IDs.
   * @return {Promise<void>}
   * @private
   */
  async waitForMessageGroupLeadership(groupId, replicaIds) {
    const startTime = Date.now();
    const timeoutMs = this.config.leadershipWaitTimeoutMs || 30000;
    let delay = this.config.leadershipWaitInitialDelayMs || 100;
    const maxDelay = this.config.leadershipWaitMaxDelayMs || 5000;
    const backoffMultiplier = this.config.leadershipWaitBackoffMultiplier || 2;

    this.logger.debug('Waiting for message group leadership', {
      groupId,
      timeoutMs,
      nodeId: this.nodeId,
    });

    while (Date.now() - startTime < timeoutMs) {
      // Check if any replica is leader
      for (const replicaId of replicaIds) {
        const service = this.messageGroupServices.get(replicaId);
        if (service && service.isLeaderReplica()) {
          this.logger.debug('Message group leader found', {
            groupId,
            leaderId: replicaId,
            elapsedMs: Date.now() - startTime,
          });
          return;
        }
      }

      // Wait with exponential backoff
      await this.sleep(delay);
      delay = Math.min(delay * backoffMultiplier, maxDelay);
    }

    // Timeout - fail bootstrap
    const error = new Error(
      `Message group ${groupId} failed to establish leadership within ${timeoutMs}ms`,
    );
    error.groupId = groupId;
    error.timeoutMs = timeoutMs;
    throw error;
  }

  /**
   * Phase 3: Partition creation for system tables.
   * Create partitions for all system tables.
   * @return {Promise<void>}
   * @private
   */
  async phasePartitions() {
    // Create partitions for each system table
    for (const schema of SYSTEM_TABLE_SCHEMAS) {
      const tableName = schema.tableName;
      const partitionId = INITIAL_PARTITION_IDS[tableName];
      const replicaIds = INITIAL_REPLICA_IDS[tableName];

      this.logger.debug('Creating system table partition', {
        tableName,
        partitionId,
        replicaCount: replicaIds.length,
        nodeId: this.nodeId,
      });

      // Create all 3 replicas on seed node
      for (const replicaId of replicaIds) {
        // Generate database path using DataDirectoryManager
        let dbPath = ':memory:';
        if (this.dataDirectoryManager && this.dataDirectoryManager.isInitialized()) {
          dbPath = this.dataDirectoryManager.getPartitionDbPath(partitionId, replicaId);
        } else if (this.config.partitionDbPath) {
          dbPath = this.config.partitionDbPath;
        }

        const partition = new PartitionService({
          partitionId,
          tableId: tableName,
          tableName,
          schema,
          keyRange: {start: null, end: null}, // Full key space
          replicaId,
          replicaIds,
          nodeId: this.nodeId,
          transport: this.transport,
          dbPath,
          isSelfHostedGroup: true, // All replicas on same node - enables fast leader election
        });

        // Register with transport before initializing
        this.transport.register(replicaId, (envelope) => {
          return partition.handleTransportMessage ?
            partition.handleTransportMessage(envelope) :
            {acknowledged: true};
        });

        await partition.initialize();

        this.partitionServices.set(replicaId, partition);
        this.servicesCreated++;

        this.logger.debug('Partition replica created', {
          tableName,
          partitionId,
          replicaId,
          nodeId: this.nodeId,
        });
      }

      this.partitionsCreated++;

      // Subscribe message groups to CDC from this partition
      await this.subscribeToCDC(tableName, partitionId, replicaIds);
    }

    this.logger.debug('All system table partitions created', {
      partitionsCreated: this.partitionsCreated,
      nodeId: this.nodeId,
    });
  }

  /**
   * Subscribe message groups to CDC events from a partition.
   * @param {string} tableName - Table name.
   * @param {string} partitionId - Partition ID.
   * @param {Array<string>} replicaIds - Partition replica IDs.
   * @return {Promise<void>}
   * @private
   */
  async subscribeToCDC(tableName, partitionId, replicaIds) {
    // Get the leader partition replica
    let leaderPartition = null;
    for (const replicaId of replicaIds) {
      const partition = this.partitionServices.get(replicaId);
      if (partition && partition.isLeader) {
        leaderPartition = partition;
        break;
      }
    }

    // If no leader yet, use first replica
    if (!leaderPartition) {
      leaderPartition = this.partitionServices.get(replicaIds[0]);
    }

    if (!leaderPartition) {
      return;
    }

    // Subscribe all message group replicas to CDC
    for (const messageGroup of this.messageGroupServices.values()) {
      await messageGroup.subscribeToCDC(tableName);

      // Register CDC handler
      leaderPartition.subscribeToCDC(async (cdcEvent) => {
        if (cdcEvent.tableName === tableName) {
          await messageGroup.applyCDCEvent(
            cdcEvent.tableName,
            cdcEvent.operation,
            cdcEvent.data,
          );
        }
      });
    }
  }

  /**
   * Phase 4: Service registration.
   * Register all services in system tables.
   * @return {Promise<void>}
   * @private
   */
  async phaseRegistration() {
    const timestamp = Date.now();

    // Get node stats for registration
    const nodeService = NodeService.getInstance();
    const stats = await nodeService.getNodeStats();

    // Register node in nodes table
    await this.registerNode(stats, timestamp);

    // Register message group
    await this.registerMessageGroup(timestamp);

    // Register all services
    await this.registerServices(timestamp);

    // Register system tables metadata
    await this.registerSystemTables(timestamp);

    // Update partition sizes in the partitions table
    await this.updatePartitionSizes();

    this.logger.debug('Service registration complete', {
      nodeId: this.nodeId,
      servicesCreated: this.servicesCreated,
    });
  }

  /**
   * Register the seed node in the nodes table.
   * @param {Object} stats - Node statistics.
   * @param {number} now - Current timestamp.
   * @return {Promise<void>}
   * @private
   */
  async registerNode(stats, now) {
    const nodesPartition = this.getLeaderPartition(SystemTableName.NODES);
    if (!nodesPartition) {
      this.logger.warn('Nodes partition not available for registration');
      return;
    }

    // First, clean up any stale nodes with the same address but different ID
    // This handles the case where the node restarts with a new ID
    try {
      await nodesPartition.deleteData(SystemTableName.NODES, {
        node_address: this.nodeAddress,
      });
      this.logger.debug('Cleaned up stale node entries', {
        nodeAddress: this.nodeAddress,
      });
    } catch (error) {
      // Ignore delete errors - there may be no stale entries
      this.logger.debug('No stale node entries to clean up', {
        nodeAddress: this.nodeAddress,
      });
    }

    const nodeData = {
      node_id: this.nodeId,
      node_address: this.nodeAddress,
      cpu_cores: stats.cpu.count,
      memory_mb: Math.round(stats.memory.totalBytes / (1024 * 1024)),
      disk_gb: 0, // Will be updated later
      cpu_usage_percent: stats.cpu.usagePercent,
      memory_usage_percent: stats.memory.usagePercent,
      disk_usage_percent: 0,
      status: 'active',
      last_heartbeat: now,
      created_at: now,
    };

    try {
      await nodesPartition.insertData(SystemTableName.NODES, nodeData);
      this.logger.debug('Node registered', {nodeId: this.nodeId});
    } catch (error) {
      this.logger.error('Failed to register node', {
        nodeId: this.nodeId,
        error: error.message,
      });
    }
  }

  /**
   * Register the initial message group.
   * @param {number} now - Current timestamp.
   * @return {Promise<void>}
   * @private
   */
  async registerMessageGroup(now) {
    const mgPartition = this.getLeaderPartition(SystemTableName.MESSAGE_GROUPS);
    if (!mgPartition) {
      this.logger.warn('Message groups partition not available for registration');
      return;
    }

    const groupData = {
      group_id: INITIAL_MESSAGE_GROUP_ID,
      group_name: 'message_group_seed',
      replica_count: 3,
      policy: JSON.stringify({
        targetReplicaCount: 3,
        maxReplicaCount: 5,
        ensureLocalAccess: true,
      }),
      created_at: now,
      updated_at: now,
    };

    try {
      await mgPartition.insertData(SystemTableName.MESSAGE_GROUPS, groupData);
      this.logger.debug('Message group registered', {
        groupId: INITIAL_MESSAGE_GROUP_ID,
      });
    } catch (error) {
      this.logger.error('Failed to register message group', {
        groupId: INITIAL_MESSAGE_GROUP_ID,
        error: error.message,
      });
    }
  }

  /**
   * Register all services in the services table.
   * @param {number} now - Current timestamp.
   * @return {Promise<void>}
   * @private
   */
  async registerServices(now) {
    const servicesPartition = this.getLeaderPartition(SystemTableName.SERVICES);
    if (!servicesPartition) {
      this.logger.warn('Services partition not available for registration');
      return;
    }

    // Register message group replicas
    for (const [replicaId, service] of this.messageGroupServices) {
      const serviceData = {
        service_id: replicaId,
        service_type: 'message_group',
        node_id: this.nodeId,
        partition_id: null,
        group_id: INITIAL_MESSAGE_GROUP_ID,
        replica_id: replicaId,
        raft_role: service.getRole(),
        status: 'active',
        address: `${this.nodeAddress}/services/${replicaId}`,
        created_at: now,
        updated_at: now,
      };

      try {
        await servicesPartition.insertData(SystemTableName.SERVICES, serviceData);
      } catch (error) {
        this.logger.error('Failed to register message group service', {
          replicaId,
          error: error.message,
        });
      }
    }

    // Register partition replicas
    for (const [replicaId, service] of this.partitionServices) {
      const serviceData = {
        service_id: replicaId,
        service_type: 'partition',
        node_id: this.nodeId,
        partition_id: service.partitionId,
        group_id: null,
        replica_id: replicaId,
        raft_role: service.role,
        status: 'active',
        address: `${this.nodeAddress}/services/${replicaId}`,
        created_at: now,
        updated_at: now,
      };

      try {
        await servicesPartition.insertData(SystemTableName.SERVICES, serviceData);
      } catch (error) {
        this.logger.error('Failed to register partition service', {
          replicaId,
          error: error.message,
        });
      }
    }

    this.logger.debug('Services registered', {
      messageGroupServices: this.messageGroupServices.size,
      partitionServices: this.partitionServices.size,
    });
  }

  /**
   * Register system tables metadata.
   * @param {number} now - Current timestamp.
   * @return {Promise<void>}
   * @private
   */
  async registerSystemTables(now) {
    const tablesPartition = this.getLeaderPartition(SystemTableName.TABLES);
    const partitionsPartition = this.getLeaderPartition(SystemTableName.PARTITIONS);

    if (!tablesPartition || !partitionsPartition) {
      this.logger.warn('Tables/partitions partition not available for registration');
      return;
    }

    // Register each system table
    for (const schema of SYSTEM_TABLE_SCHEMAS) {
      const tableName = schema.tableName;
      const partitionId = INITIAL_PARTITION_IDS[tableName];

      // Register table
      const tableData = {
        table_id: tableName,
        table_name: tableName,
        schema_definition: JSON.stringify(schema),
        partition_key: schema.columns[0].name, // Primary key is partition key
        table_policies: JSON.stringify({}),
        partition_count: 1,
        created_at: now,
        updated_at: now,
      };

      try {
        await tablesPartition.insertData(SystemTableName.TABLES, tableData);
      } catch (error) {
        this.logger.error('Failed to register table', {
          tableName,
          error: error.message,
        });
      }

      // Register partition
      const partitionData = {
        partition_id: partitionId,
        table_id: tableName,
        partition_key_start: null,
        partition_key_end: null,
        replica_count: 3,
        size_bytes: 0,
        leader_node_id: this.nodeId,
        state: 'NORMAL',
        created_at: now,
        updated_at: now,
      };

      try {
        await partitionsPartition.insertData(SystemTableName.PARTITIONS, partitionData);
      } catch (error) {
        this.logger.error('Failed to register partition', {
          partitionId,
          error: error.message,
        });
      }
    }

    this.logger.debug('System tables registered', {
      tableCount: SYSTEM_TABLE_SCHEMAS.length,
    });
  }

  /**
   * Update partition sizes in the partitions table.
   * Calculates actual sizes from SQLite databases and updates the records.
   * @return {Promise<void>}
   * @private
   */
  async updatePartitionSizes() {
    const partitionsPartition = this.getLeaderPartition(SystemTableName.PARTITIONS);
    if (!partitionsPartition) {
      this.logger.warn('Partitions partition not available for size update');
      return;
    }

    // Track which partitions we've already updated (multiple replicas per partition)
    const updatedPartitions = new Set();
    let updatedCount = 0;

    for (const [_replicaId, partitionService] of this.partitionServices) {
      const partitionId = partitionService.partitionId;

      // Skip if we've already updated this partition (from another replica)
      if (updatedPartitions.has(partitionId)) {
        continue;
      }

      try {
        // Calculate the actual size from SQLite
        const sizeBytes = await partitionService.calculatePartitionSize();

        // Update the partition record
        await partitionsPartition.updateData(
          SystemTableName.PARTITIONS,
          {partition_id: partitionId},
          {size_bytes: sizeBytes, updated_at: Date.now()},
        );

        updatedPartitions.add(partitionId);
        updatedCount++;

        this.logger.debug('Updated partition size', {
          partitionId,
          sizeBytes,
        });
      } catch (error) {
        this.logger.error('Failed to update partition size', {
          partitionId,
          error: error.message,
        });
      }
    }

    this.logger.debug('Partition sizes updated', {
      updatedCount,
      totalPartitions: updatedPartitions.size,
    });
  }

  /**
   * Phase 5: Cache hydration.
   * Populate SystemTableCache with existing data from partitions.
   * Requirements: 1.3, 1.4
   * @return {Promise<void>}
   * @private
   */
  async phaseCacheHydration() {
    // Get the system table cache from the first message group service
    let systemTableCache = null;
    for (const mgService of this.messageGroupServices.values()) {
      // Get the writable cache for hydration
      systemTableCache = mgService.systemTableCache;
      break;
    }

    if (!systemTableCache) {
      this.logger.warn('No system table cache available for hydration');
      return;
    }

    // Build partition registry keyed by partitionId (not replicaId)
    // The query executor expects partitionId -> partition service mapping
    const partitionRegistry = new Map();
    for (const [_replicaId, partition] of this.partitionServices) {
      const partitionId = partition.partitionId;
      // Only add if not already present, or if this one is the leader
      if (!partitionRegistry.has(partitionId) || partition.isLeader) {
        partitionRegistry.set(partitionId, partition);
      }
    }

    // Create a query engine with the partition registry
    const queryEngine = new SQLQueryEngine({
      systemCache: systemTableCache,
      partitionRegistry,
      nodeId: this.nodeId,
    });

    // Create and run the hydration service
    const hydrationService = new CacheHydrationService(
      queryEngine,
      systemTableCache,
      this.logger,
    );

    const result = await hydrationService.hydrateCache();

    this.logger.info('Cache hydration complete', {
      success: result.success,
      tablesHydrated: Object.keys(result.tables).length,
      errors: result.errors.length,
    });
  }

  /**
   * Get the leader partition for a system table.
   * @param {string} tableName - Table name.
   * @return {PartitionService|null} Leader partition or null.
   * @private
   */
  getLeaderPartition(tableName) {
    const replicaIds = INITIAL_REPLICA_IDS[tableName];
    if (!replicaIds) {
      return null;
    }

    // Find leader replica
    for (const replicaId of replicaIds) {
      const partition = this.partitionServices.get(replicaId);
      if (partition && partition.isLeader) {
        return partition;
      }
    }

    // Return first replica if no leader found
    return this.partitionServices.get(replicaIds[0]) || null;
  }

  /**
   * Handle bootstrap failure.
   * Clean up partially initialized services and exit.
   * @param {Error} error - The error that caused failure.
   * @return {Object} Failure result.
   * @private
   */
  async handleBootstrapFailure(error) {
    this.phase = BootstrapPhase.FAILED;
    this.lastError = error;
    const duration = Date.now() - this.startTime;

    this.logger.error('Bootstrap failed', {
      nodeId: this.nodeId,
      phase: this.phase,
      duration,
      error: error.message,
      stack: error.stack,
      servicesCreated: this.servicesCreated,
    });

    // Clean up partially initialized services
    await this.cleanup();

    this.emit('failed', {
      nodeId: this.nodeId,
      phase: this.phase,
      duration,
      error: error.message,
      servicesCreated: this.servicesCreated,
    });

    return {
      success: false,
      nodeId: this.nodeId,
      duration,
      error: error.message,
      phase: this.phase,
      servicesCreated: this.servicesCreated,
    };
  }

  /**
   * Clean up partially initialized services.
   * @return {Promise<void>}
   * @private
   */
  async cleanup() {
    this.logger.info('Cleaning up partially initialized services', {
      nodeId: this.nodeId,
      messageGroupServices: this.messageGroupServices.size,
      partitionServices: this.partitionServices.size,
    });

    // Shutdown partition services
    for (const [replicaId, partition] of this.partitionServices) {
      try {
        if (partition.shutdown) {
          await partition.shutdown();
        }
        this.logger.debug('Partition service cleaned up', {replicaId});
      } catch (err) {
        this.logger.warn('Error cleaning up partition service', {
          replicaId,
          error: err.message,
        });
      }
    }
    this.partitionServices.clear();

    // Shutdown message group services
    for (const [replicaId, messageGroup] of this.messageGroupServices) {
      try {
        if (messageGroup.shutdown) {
          await messageGroup.shutdown();
        }
        this.logger.debug('Message group service cleaned up', {replicaId});
      } catch (err) {
        this.logger.warn('Error cleaning up message group service', {
          replicaId,
          error: err.message,
        });
      }
    }
    this.messageGroupServices.clear();

    // Clear transport
    if (this.transport) {
      this.transport.clear();
    }

    this.logger.info('Cleanup complete', {nodeId: this.nodeId});
  }

  /**
   * Get the current bootstrap phase.
   * @return {string} Current phase.
   */
  getPhase() {
    return this.phase;
  }

  /**
   * Get bootstrap status.
   * @return {Object} Bootstrap status.
   */
  getStatus() {
    return {
      nodeId: this.nodeId,
      phase: this.phase,
      startTime: this.startTime,
      duration: this.startTime ? Date.now() - this.startTime : 0,
      servicesCreated: this.servicesCreated,
      partitionsCreated: this.partitionsCreated,
      messageGroupsCreated: this.messageGroupsCreated,
      lastError: this.lastError?.message || null,
    };
  }

  /**
   * Sleep for a specified duration.
   * @param {number} ms - Milliseconds to sleep.
   * @return {Promise<void>}
   * @private
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Bootstrap and exit on failure.
   * This is the main entry point for seed node startup.
   * @param {Object} options - Bootstrap options.
   * @return {Promise<Object>} Bootstrap result.
   */
  static async bootstrapOrExit(options = {}) {
    const bootstrap = new BootstrapService(options);
    const result = await bootstrap.bootstrap();

    if (!result.success) {
      const loggingService = LoggingService.getInstance();
      const logger = loggingService.isInitialized() ?
        loggingService.forSubsystem('bootstrap') : console;

      logger.error('Bootstrap failed, exiting with non-zero exit code', {
        nodeId: result.nodeId,
        error: result.error,
        phase: result.phase,
      });

      // Exit with non-zero code (Requirement 6.16)
      process.exit(1);
    }

    return result;
  }
}

export {BootstrapService, BootstrapPhase, DEFAULT_BOOTSTRAP_CONFIG};
