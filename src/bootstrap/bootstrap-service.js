/**
 * Bootstrap Service - System initialization and startup.
 * Implements four-phase bootstrap process for seed node.
 * Requirements: 6.3, 6.4, 6.7, 6.8, 6.9, 6.12, 6.13, 6.14, 6.16, 35.1, 35.5
 */

import {EventEmitter} from 'events';
import {v4 as uuidv4} from 'uuid';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {LoggingService} from '../logging/logging-service.js';
import {DataDirectoryManager as _DataDirectoryManager} from '../storage/data-directory-manager.js';
import {NodeService} from '../node/node-service.js';
import {MessageGroupService} from '../message-group/message-group-service.js';
import {PartitionService} from '../partition/partition-service.js';
import {MessageRouter} from '../transport/message-router.js';
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
import {DynamicConfigService} from '../config/dynamic-config-service.js';
import {CDCIntegrationService} from '../cdc/cdc-integration-service.js';
import {ReplicaLifecycleManager} from '../node/replica-lifecycle-manager.js';
import {ReplicaStateMachine, ReplicaState} from '../node/replica-state-machine.js';
import {AssignmentEpochManager} from '../rebalancer/assignment-epoch-manager.js';
import {AssignmentEpoch} from '../rebalancer/assignment-epoch.js';

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
  wsPort: null, // WebSocket port for cross-node communication (null = no server)
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
    this.wsPort = options.wsPort || null;
    this.config = {...DEFAULT_BOOTSTRAP_CONFIG, ...options.config};
    this.dataDirectoryManager = options.dataDirectoryManager || null;

    // Services created during bootstrap
    this.messageGroupServices = new Map();
    this.partitionServices = new Map();
    this.transport = null;
    // MessageRouter for unified local/remote message routing
    this.messageRouter = null;
    // Track message group replicas for deferred election start
    this.messageGroupReplicas = [];

    // Replica lifecycle manager for handling CREATE_REPLICA/REMOVE_REPLICA
    this.replicaLifecycleManager = null;

    // Replica state machine for tracking replica lifecycle states
    this.replicaStateMachine = null;

    // Assignment epoch manager for epoch-based partition assignments
    // Requirements: 3.4, 4.1 - Epoch-based initialization
    this.epochManager = null;

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

      // Initialize ReplicaLifecycleManager after all services are ready
      this.initializeReplicaLifecycleManager();

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
        replicaLifecycleManager: this.replicaLifecycleManager,
        replicaStateMachine: this.replicaStateMachine,
        epochManager: this.epochManager,
        transport: this.transport,
        messageRouter: this.messageRouter,
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
   * Requirements: 2.1, 2.2, 2.3 - Use WebSocket-based transport for message groups.
   * Requirements: 8.1, 8.2, 8.3, 8.4 - Bootstrap sequence: server → self-connect → services.
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

    // Determine WebSocket port from config or options
    const wsPort = this.wsPort || this.config.wsPort;

    // Create MessageRouter for unified local/remote message routing
    // Requirements: 2.3 - Initialize MessageRouter before creating message groups
    this.messageRouter = new MessageRouter({
      nodeId: this.nodeId,
      nodeAddress: this.nodeAddress,
      wsPort: wsPort,
    });

    // Set up resolver to extract nodeId from address pattern "${nodeId}/..."
    // This enables routing messages to remote nodes based on address patterns
    // like "joining-node-id/lifecycle" -> routes to node "joining-node-id"
    this.messageRouter.setServiceNodeResolver((address) => {
      const match = address.match(/^([^/]+)\//);
      return match ? match[1] : null;
    });

    // Requirements: 8.1, 8.2, 8.4 - Start server first, then establish self-connection
    // If wsPort is specified, start server and establish self-connection
    // This ensures all messages (local and remote) go through WebSocket
    if (wsPort) {
      try {
        // Requirements: 8.1 - Start WebSocket server first
        await this.messageRouter.initialize({startServer: true});

        this.logger.info('WebSocket server started and self-connection established', {
          nodeId: this.nodeId,
          wsPort: wsPort,
          hasSelfConnection: this.messageRouter.hasSelfConnection(),
        });
      } catch (error) {
        // Requirements: 8.4 - Fail bootstrap if self-connection fails
        this.logger.error('MessageRouter initialization failed', {
          nodeId: this.nodeId,
          wsPort: wsPort,
          error: error.message,
          stack: error.stack,
        });
        throw new Error(`MessageRouter initialization failed: ${error.message}`);
      }
    } else {
      // No wsPort - initialize without server (for testing or single-node scenarios)
      try {
        await this.messageRouter.initialize({startServer: false});
      } catch (error) {
        this.logger.error('MessageRouter initialization failed', {
          nodeId: this.nodeId,
          error: error.message,
          stack: error.stack,
        });
        throw new Error(`MessageRouter initialization failed: ${error.message}`);
      }
    }

    // Use MessageRouter directly for all services
    // MessageRouter handles both local and remote message delivery
    // No MessageGroupTransport needed - all messages go through MessageRouter
    this.transport = this.messageRouter;

    this.logger.debug('Infrastructure setup complete', {
      nodeId: this.nodeId,
      nodeAddress: this.nodeAddress,
      wsPort: wsPort,
      hasMessageRouter: !!this.messageRouter,
      hasSelfConnection: wsPort ? this.messageRouter.hasSelfConnection() : false,
    });
  }

  /**
   * Phase 2: Message group creation.
   * Create initial message group with 3 replicas on seed node.
   * Elections are DEFERRED until after partitions are created to prevent election storms.
   * Requirements: 2.1, 2.2 - Use WebSocket-based transport for message groups.
   * @return {Promise<void>}
   * @private
   */
  async phaseMessageGroups() {
    const groupId = INITIAL_MESSAGE_GROUP_ID;
    const replicaIds = INITIAL_MESSAGE_GROUP_REPLICA_IDS;

    // Stagger delay between replica creations to allow handlers to be registered
    const replicaStaggerDelayMs = 50;

    this.logger.debug('Creating initial message group', {
      groupId,
      replicaCount: replicaIds.length,
      nodeId: this.nodeId,
    });

    // Track replicas created for this group - elections start AFTER partitions are created
    this.messageGroupReplicas = [];

    // Create all 3 replicas on seed node with staggered delays
    // Use deferElection to prevent election storms - elections start after ALL services ready
    for (let i = 0; i < replicaIds.length; i++) {
      const replicaId = replicaIds[i];

      // Stagger replica creation to allow handlers to be registered
      // First replica starts immediately, subsequent replicas wait
      if (i > 0) {
        await new Promise((resolve) => setTimeout(resolve, replicaStaggerDelayMs));
      }

      const messageGroup = new MessageGroupService({
        groupId,
        replicaId,
        nodeId: this.nodeId,
        replicaIds,
        // Use MessageRouter directly for all communication
        transport: this.messageRouter,
        // Defer election until ALL services (message groups + partitions) are created
        deferElection: true,
      });

      // Register with MessageRouter using unified address format
      // Requirements: 1.1, 5.1 - Unified address format ${nodeId}/${entityType}/${entityId}
      const unifiedAddress = `${this.nodeId}/message-group/${replicaId}`;
      this.messageRouter.register(unifiedAddress, (envelope) => {
        return messageGroup.receiveMessage(envelope);
      });

      await messageGroup.initialize();

      this.messageGroupServices.set(replicaId, messageGroup);
      this.messageGroupReplicas.push(messageGroup);
      this.servicesCreated++;

      this.logger.debug('Message group replica created', {
        groupId,
        replicaId,
        replicaIndex: i,
        nodeId: this.nodeId,
      });
    }

    this.messageGroupsCreated++;

    // NOTE: Elections are NOT started here - they will be started in phasePartitions()
    // after ALL partitions are created. This prevents election storms where message
    // group elections interfere with partition creation.
    this.logger.debug('Message group replicas created, elections deferred', {
      groupId,
      replicaCount: this.messageGroupReplicas.length,
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

    // Check immediately first (no delay) - leadership may already be established
    for (const replicaId of replicaIds) {
      const service = this.messageGroupServices.get(replicaId);
      if (service && service.isLeaderReplica()) {
        this.logger.debug('Message group leader found immediately', {
          groupId,
          leaderId: replicaId,
          elapsedMs: 0,
        });
        return;
      }
    }

    while (Date.now() - startTime < timeoutMs) {
      // Wait with exponential backoff
      await this.sleep(delay);
      delay = Math.min(delay * backoffMultiplier, maxDelay);

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
   * Wait for all system table partitions to establish leadership.
   * This ensures writes can succeed during the registration phase.
   * @return {Promise<void>}
   * @private
   */
  async waitForPartitionLeadership() {
    const startTime = Date.now();
    // Wait up to 5 seconds for partition leadership
    // Raft election takes 150-300ms per partition, and elections happen in parallel
    // so this should be enough for all 12 system table partitions
    const timeoutMs = Math.min(this.config.leadershipWaitTimeoutMs || 30000, 5000);
    let delay = this.config.leadershipWaitInitialDelayMs || 10;
    const maxDelay = 100; // Check frequently
    const backoffMultiplier = 1.5;

    // Get unique partition IDs (multiple replicas per partition)
    const partitionIds = new Set();
    for (const partition of this.partitionServices.values()) {
      partitionIds.add(partition.partitionId);
    }

    this.logger.debug('Waiting for partition leadership', {
      partitionCount: partitionIds.size,
      timeoutMs,
      nodeId: this.nodeId,
    });

    // Check immediately first (no delay) - leadership may already be established
    const leadersFound = this.checkPartitionLeaders(partitionIds);
    if (leadersFound.size === partitionIds.size) {
      this.logger.debug('All partition leaders found immediately', {
        partitionCount: partitionIds.size,
        elapsedMs: 0,
      });
      return;
    }

    while (Date.now() - startTime < timeoutMs) {
      // Wait with exponential backoff
      await this.sleep(delay);
      delay = Math.min(delay * backoffMultiplier, maxDelay);

      // Check if all partitions have leaders
      const leaders = this.checkPartitionLeaders(partitionIds);
      if (leaders.size === partitionIds.size) {
        this.logger.debug('All partition leaders found', {
          partitionCount: partitionIds.size,
          elapsedMs: Date.now() - startTime,
        });
        return;
      }
    }

    // Timeout - log debug but don't fail (registration operations handle errors)
    const leaders = this.checkPartitionLeaders(partitionIds);
    const missing = [...partitionIds].filter((id) => !leaders.has(id));
    this.logger.debug('Some partitions still electing leaders, continuing', {
      totalPartitions: partitionIds.size,
      leadersFound: leaders.size,
      missingLeaders: missing,
      elapsedMs: Date.now() - startTime,
      nodeId: this.nodeId,
    });
  }

  /**
   * Check which partitions have leaders.
   * @param {Set<string>} partitionIds - Partition IDs to check.
   * @return {Set<string>} Partition IDs that have leaders.
   * @private
   */
  checkPartitionLeaders(partitionIds) {
    const leadersFound = new Set();
    for (const partition of this.partitionServices.values()) {
      if (partition.isLeader && partitionIds.has(partition.partitionId)) {
        leadersFound.add(partition.partitionId);
      }
    }
    return leadersFound;
  }

  /**
   * Get the leader message group service for sending lifecycle messages.
   * Returns the first message group service that is a leader, or any available service.
   * @return {Object|null} Message group service or null.
   * @private
   */
  getLeaderMessageGroupService() {
    // First try to find a leader
    for (const service of this.messageGroupServices.values()) {
      if (service && service.isLeaderReplica && service.isLeaderReplica()) {
        return service;
      }
    }
    // Fall back to any available service
    for (const service of this.messageGroupServices.values()) {
      if (service) {
        return service;
      }
    }
    return null;
  }

  /**
   * Get the AssignmentEpochManager instance.
   * Returns the epoch manager created during bootstrap for epoch-based
   * partition assignment coordination.
   * Requirements: 3.4, 4.1 - Epoch-based initialization
   * @return {AssignmentEpochManager|null} The epoch manager or null if not initialized.
   */
  getEpochManager() {
    return this.epochManager;
  }

  /**
   * Phase 3: Partition creation for system tables.
   * Create partitions for all system tables.
   * Elections are deferred until ALL partitions are created to prevent election storms.
   * @return {Promise<void>}
   * @private
   */
  async phasePartitions() {
    // Stagger delay between replica creations to prevent election storms
    // When all replicas start simultaneously, they all timeout and start elections
    // at similar times, causing repeated failed elections
    const replicaStaggerDelayMs = 50;

    // Track ALL replicas across ALL partitions to start elections after all are ready
    // This prevents election storms where elections from different partitions interfere
    const allPartitionReplicas = [];

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

      // Create all 3 replicas on seed node with staggered delays
      // Use deferElection to prevent election storms - elections start after ALL ready
      for (let i = 0; i < replicaIds.length; i++) {
        const replicaId = replicaIds[i];

        // Stagger replica creation to allow handlers to be registered
        // First replica starts immediately, subsequent replicas wait
        if (i > 0) {
          await new Promise((resolve) => setTimeout(resolve, replicaStaggerDelayMs));
        }

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
          // Pass message group service for CREATE_REPLICA/REMOVE_REPLICA messages
          messageGroupService: this.getLeaderMessageGroupService(),
          // Pass MessageRouter for cross-node lifecycle messages
          messageRouter: this.messageRouter,
          // Defer election until ALL partitions are created to prevent election storms
          deferElection: true,
        });

        // Register with MessageRouter for unified local/remote message delivery
        // All local messages go through MessageRouter - no InMemoryTransport
        // Requirements: 1.1, 5.1 - Unified address format ${nodeId}/${entityType}/${entityId}
        const unifiedPartitionAddress = `${this.nodeId}/partition/${replicaId}`;
        this.messageRouter.register(unifiedPartitionAddress, (envelope) => {
          return partition.handleTransportMessage ?
            partition.handleTransportMessage(envelope) :
            {acknowledged: true};
        });

        await partition.initialize();

        this.partitionServices.set(replicaId, partition);
        allPartitionReplicas.push(partition);
        this.servicesCreated++;

        this.logger.debug('Partition replica created', {
          tableName,
          partitionId,
          replicaId,
          replicaIndex: i,
          nodeId: this.nodeId,
        });
      }

      this.partitionsCreated++;

      // Subscribe message groups to CDC from this partition
      // Do this before starting elections so CDC handlers are ready
      await this.subscribeToCDC(tableName, partitionId, replicaIds);
    }

    // ALL partitions are now created and registered
    // Now start elections on ALL Raft groups (message groups + partitions)
    // Starting them together prevents election storms where one group's elections
    // interfere with another group's elections during creation

    // First, start message group elections (they were created in phase 2)
    if (this.messageGroupReplicas && this.messageGroupReplicas.length > 0) {
      this.logger.info('Starting elections for message group replicas', {
        totalReplicas: this.messageGroupReplicas.length,
        nodeId: this.nodeId,
      });

      for (const messageGroup of this.messageGroupReplicas) {
        messageGroup.startElection();
      }

      // Wait for message group leadership before starting partition elections
      // This ensures message groups are stable before partitions start electing
      await this.waitForMessageGroupLeadership(
        INITIAL_MESSAGE_GROUP_ID,
        INITIAL_MESSAGE_GROUP_REPLICA_IDS,
      );

      this.logger.debug('Message group leadership established', {
        groupId: INITIAL_MESSAGE_GROUP_ID,
        nodeId: this.nodeId,
      });
    }

    // Now start partition elections
    this.logger.info('Starting elections for all partition replicas', {
      totalReplicas: allPartitionReplicas.length,
      partitionsCreated: this.partitionsCreated,
      nodeId: this.nodeId,
    });

    for (const partition of allPartitionReplicas) {
      partition.startElection();
    }

    // Initialize AssignmentEpochManager with initial epoch containing partition assignments
    // Requirements: 3.4, 4.1 - Fetch/create epoch during bootstrap
    this.initializeEpochManager();

    this.logger.debug('All system table partitions created', {
      partitionsCreated: this.partitionsCreated,
      nodeId: this.nodeId,
    });
  }

  /**
   * Initialize the AssignmentEpochManager with the initial epoch.
   * Creates epoch 0 with all partition assignments from the seed node.
   * Requirements: 3.4, 4.1 - Epoch-based initialization
   * @private
   */
  initializeEpochManager() {
    // Build initial assignments from created partitions
    // Map partitionId -> [nodeId] (all replicas on seed node initially)
    const initialAssignments = {};

    // Track unique partition IDs (multiple replicas per partition)
    const partitionNodes = new Map();

    for (const [_replicaId, partition] of this.partitionServices) {
      const partitionId = partition.partitionId;
      if (!partitionNodes.has(partitionId)) {
        partitionNodes.set(partitionId, []);
      }
      // All replicas are on this seed node during bootstrap
      if (!partitionNodes.get(partitionId).includes(this.nodeId)) {
        partitionNodes.get(partitionId).push(this.nodeId);
      }
    }

    // Convert to assignments format
    for (const [partitionId, nodes] of partitionNodes) {
      initialAssignments[partitionId] = nodes;
    }

    // Create the epoch manager
    this.epochManager = new AssignmentEpochManager({
      nodeId: this.nodeId,
      timestampProvider: () => new Date().toISOString(),
    });

    // Create initial epoch (epoch 0) with the assignments
    const initialEpoch = new AssignmentEpoch({
      epoch: 0,
      assignments: initialAssignments,
      timestamp: new Date().toISOString(),
      proposedBy: this.nodeId,
    });

    // Initialize the manager with the initial epoch
    this.epochManager.initialize(initialEpoch);

    this.logger.info('AssignmentEpochManager initialized', {
      nodeId: this.nodeId,
      epoch: this.epochManager.getCurrentEpoch().epoch,
      partitionCount: Object.keys(initialAssignments).length,
      assignments: initialAssignments,
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
    this.logger.info('Setting up CDC subscription', {
      tableName,
      partitionId,
      replicaIds,
    });

    // Subscribe to ALL replicas since any could become leader
    // and the query executor routes to the current leader
    for (const replicaId of replicaIds) {
      const partition = this.partitionServices.get(replicaId);
      if (!partition) {
        this.logger.warn('Partition not found for CDC subscription', {
          tableName,
          replicaId,
        });
        continue;
      }

      // Subscribe all message group replicas to CDC from this partition replica
      for (const messageGroup of this.messageGroupServices.values()) {
        await messageGroup.subscribeToCDC(tableName);

        // Register CDC handler on this partition replica
        partition.subscribeToCDC(async (cdcEvent) => {
          if (cdcEvent.tableName === tableName) {
            this.logger.debug('CDC event received by bootstrap handler', {
              tableName: cdcEvent.tableName,
              operation: cdcEvent.operation,
              sourceReplica: replicaId,
            });
            await messageGroup.applyCDCEvent(
              cdcEvent.tableName,
              cdcEvent.operation,
              cdcEvent.data,
            );

            // Trigger rebalancing on all partitions when a new node joins
            if (tableName === 'nodes' && cdcEvent.operation === 'INSERT') {
              this.triggerRebalancingOnAllPartitions('node_join');
            }
          }
        });
      }

      this.logger.info('CDC subscription registered on replica', {
        tableName,
        partitionId,
        replicaId,
        isLeader: partition.isLeader,
      });
    }
  }

  /**
   * Trigger rebalancing check on all partition leaders.
   * Called when a significant cluster event occurs.
   * @param {string} reason - Reason for triggering rebalancing.
   * @private
   */
  triggerRebalancingOnAllPartitions(reason) {
    this.logger.info('Triggering rebalancing on all partitions', {
      reason,
      partitionCount: this.partitionServices.size,
    });

    for (const partition of this.partitionServices.values()) {
      if (partition.isLeader) {
        partition.triggerRebalanceCheck(reason);
      }
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

    // Wait for partition leadership before attempting writes
    // This prevents "No leader available for write operation" errors
    await this.waitForPartitionLeadership();

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

    // Seed dynamic configuration into config system table
    await this.seedDynamicConfiguration();

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
      await nodesPartition.upsertData(SystemTableName.NODES, nodeData);
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
      await mgPartition.upsertData(SystemTableName.MESSAGE_GROUPS, groupData);
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
        // Use unified address format: ${nodeId}/${entityType}/${entityId}
        address: `${this.nodeId}/message-group/${replicaId}`,
        created_at: now,
        updated_at: now,
      };

      try {
        await servicesPartition.upsertData(SystemTableName.SERVICES, serviceData);
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
        // Use unified address format: ${nodeId}/${entityType}/${entityId}
        address: `${this.nodeId}/partition/${replicaId}`,
        created_at: now,
        updated_at: now,
      };

      try {
        await servicesPartition.upsertData(SystemTableName.SERVICES, serviceData);
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

      // Register table (use upsert to handle restarts with persistent storage)
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
        await tablesPartition.upsertData(SystemTableName.TABLES, tableData);
      } catch (error) {
        this.logger.error('Failed to register table', {
          tableName,
          error: error.message,
        });
      }

      // Register partition (use upsert to handle restarts with persistent storage)
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
        await partitionsPartition.upsertData(SystemTableName.PARTITIONS, partitionData);
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
   * Seed dynamic configuration into the config system table.
   * This must happen before cache hydration so config values are available.
   * @return {Promise<void>}
   * @private
   */
  async seedDynamicConfiguration() {
    // Get the config partition to check if data already exists
    const configPartition = this.getLeaderPartition(SystemTableName.CONFIG);
    if (!configPartition) {
      this.logger.warn('Config partition not available for seeding');
      return;
    }

    // Check if config already exists in the partition (from previous run)
    try {
      const result = await configPartition.executeQuery(
        'SELECT COUNT(*) as count FROM config',
      );
      if (result && result.rows && result.rows.length > 0 && result.rows[0].count > 0) {
        this.logger.info('Config already seeded, skipping', {
          existingCount: result.rows[0].count,
        });
        return;
      }
    } catch (error) {
      this.logger.debug('Could not check existing config, proceeding with seeding', {
        error: error.message,
      });
    }

    // Build partition registry for CDC integration service
    const partitionRegistry = new Map();
    for (const [_replicaId, partition] of this.partitionServices) {
      const partitionId = partition.partitionId;
      if (!partitionRegistry.has(partitionId) || partition.isLeader) {
        partitionRegistry.set(partitionId, partition);
      }
    }

    // Create a function to get partition for a table from the registry
    const getPartitionForTable = (tableName) => {
      for (const partition of partitionRegistry.values()) {
        if (partition.tableName === tableName && partition.isLeader) {
          return partition;
        }
      }
      // Return first matching partition if no leader found
      for (const partition of partitionRegistry.values()) {
        if (partition.tableName === tableName) {
          return partition;
        }
      }
      return null;
    };

    // Create CDC integration service for config seeding
    const cdcIntegrationService = new CDCIntegrationService({
      nodeId: this.nodeId,
      getPartitionForTable,
    });
    cdcIntegrationService.initialize();

    // Get system table cache for reading existing config
    let systemTableCache = null;
    for (const mgService of this.messageGroupServices.values()) {
      systemTableCache = mgService.systemTableCache;
      break;
    }

    // Create and initialize dynamic config service
    const dynamicConfigService = new DynamicConfigService({
      cdcIntegrationService,
      systemTableCache,
      nodeId: this.nodeId,
    });
    await dynamicConfigService.initialize();

    try {
      const result = await dynamicConfigService.seedConfiguration('system');
      this.logger.info('Dynamic configuration seeded', {
        seeded: result.seeded.length,
        skipped: result.skipped.length,
      });
    } catch (error) {
      this.logger.error('Failed to seed dynamic configuration', {
        error: error.message,
        stack: error.stack,
      });
      // Continue anyway - config seeding is not critical for startup
    }
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

    // Create a function to get partition for a table from the registry
    const getPartitionForTable = (tableName) => {
      for (const partition of partitionRegistry.values()) {
        if (partition.tableName === tableName && partition.isLeader) {
          return partition;
        }
      }
      // Return first matching partition if no leader found
      for (const partition of partitionRegistry.values()) {
        if (partition.tableName === tableName) {
          return partition;
        }
      }
      return null;
    };

    // Create CDC integration service for partition rebalancer operations
    // This enables partitions to delete service rows after REMOVE_REPLICA
    const cdcIntegrationService = new CDCIntegrationService({
      nodeId: this.nodeId,
      getPartitionForTable,
    });
    cdcIntegrationService.initialize();

    // Set system table cache and CDC integration service on all partition services
    for (const partition of this.partitionServices.values()) {
      partition.setSystemTableCache(systemTableCache);
      partition.setCdcIntegrationService(cdcIntegrationService);
    }

    this.logger.info('Cache hydration complete', {
      success: result.success,
      tablesHydrated: Object.keys(result.tables).length,
      errors: result.errors.length,
    });
  }

  /**
   * Initialize the ReplicaLifecycleManager to handle CREATE_REPLICA/REMOVE_REPLICA.
   * @private
   */
  initializeReplicaLifecycleManager() {
    // Get the leader message group service for routing
    const messageGroupService = this.getLeaderMessageGroupService();

    // Get data directory for partition storage
    let dataDir = './data';
    if (this.dataDirectoryManager && this.dataDirectoryManager.isInitialized()) {
      dataDir = this.dataDirectoryManager.getDataDir();
    }

    // Build partition registry for CDC integration service
    const partitionRegistry = new Map();
    for (const [_replicaId, partition] of this.partitionServices) {
      const partitionId = partition.partitionId;
      if (!partitionRegistry.has(partitionId) || partition.isLeader) {
        partitionRegistry.set(partitionId, partition);
      }
    }

    // Create a function to get partition for a table from the registry
    const getPartitionForTable = (tableName) => {
      for (const partition of partitionRegistry.values()) {
        if (partition.tableName === tableName && partition.isLeader) {
          return partition;
        }
      }
      // Return first matching partition if no leader found
      for (const partition of partitionRegistry.values()) {
        if (partition.tableName === tableName) {
          return partition;
        }
      }
      return null;
    };

    // Create CDC integration service for state machine persistence
    const cdcIntegrationService = new CDCIntegrationService({
      nodeId: this.nodeId,
      getPartitionForTable,
    });
    cdcIntegrationService.initialize();

    // Create ReplicaStateMachine for tracking replica lifecycle states
    // Requirements: 1.4 - Single source of truth for replica status
    this.replicaStateMachine = new ReplicaStateMachine({
      nodeId: this.nodeId,
      cdcIntegrationService: cdcIntegrationService,
    });

    // Start the timeout checker for stuck operations
    this.replicaStateMachine.startTimeoutChecker();

    // Create partition service factory that includes messageGroupService and transport
    const createPartitionService = async (options) => {
      // Generate database path
      let dbPath = ':memory:';
      if (this.dataDirectoryManager && this.dataDirectoryManager.isInitialized()) {
        dbPath = this.dataDirectoryManager.getPartitionDbPath(
          options.partitionId,
          options.replicaId,
        );
      }

      const partition = new PartitionService({
        ...options,
        dbPath,
        transport: this.transport,
        messageGroupService: messageGroupService,
        messageRouter: this.messageRouter,
        replicaStateMachine: this.replicaStateMachine,
      });

      // Note: PartitionService now registers itself with unified address format
      // in its initialize() method. No need to register here.

      await partition.initialize();

      // Track the partition service
      this.partitionServices.set(options.replicaId, partition);
      this.servicesCreated++;

      return partition;
    };

    // Create ReplicaLifecycleManager with state machine
    this.replicaLifecycleManager = new ReplicaLifecycleManager({
      nodeId: this.nodeId,
      messageGroupService: messageGroupService,
      createPartitionService: createPartitionService,
      dataDir: dataDir,
      replicaStateMachine: this.replicaStateMachine,
    });

    this.replicaLifecycleManager.initialize();

    // Register lifecycle handler with MessageRouter
    this.registerLifecycleHandler(this.messageRouter, this.replicaLifecycleManager);

    // Register all bootstrap-created partitions with ReplicaLifecycleManager
    // This ensures seed node partitions can be found during rebalancer remove operations
    this.registerPartitionsWithLifecycleManager(
      this.replicaLifecycleManager,
      this.partitionServices,
    );

    // Register existing replicas with the state machine
    // Requirements: 1.4 - State machine is single source of truth
    this.registerReplicasWithStateMachine(
      this.replicaStateMachine,
      this.partitionServices,
    );

    this.logger.info('ReplicaLifecycleManager initialized', {
      nodeId: this.nodeId,
      hasMessageGroupService: !!messageGroupService,
      hasStateMachine: !!this.replicaStateMachine,
      registeredPartitions: this.partitionServices.size,
    });
  }

  /**
   * Register bootstrap-created partitions with ReplicaLifecycleManager.
   * This ensures seed node partitions are tracked and can be found during
   * rebalancer remove operations.
   * Requirements: 1.1, 1.2
   * @param {ReplicaLifecycleManager} lifecycleManager - Manager instance.
   * @param {Map<string, PartitionService>} partitions - Created partitions.
   */
  registerPartitionsWithLifecycleManager(lifecycleManager, partitions) {
    if (!lifecycleManager) {
      this.logger.warn('No lifecycle manager provided for partition registration');
      return;
    }

    let registeredCount = 0;
    for (const [replicaId, partition] of partitions) {
      try {
        lifecycleManager.registerExistingReplica({
          replicaId: replicaId,
          partitionId: partition.partitionId,
          tableName: partition.tableName,
          status: 'active',
          service: partition,
        });
        registeredCount++;
      } catch (error) {
        this.logger.error('Failed to register partition with lifecycle manager', {
          replicaId,
          partitionId: partition.partitionId,
          error: error.message,
        });
      }
    }

    this.logger.debug('Registered partitions with lifecycle manager', {
      registeredCount,
      totalPartitions: partitions.size,
      nodeId: this.nodeId,
    });
  }

  /**
   * Register bootstrap-created replicas with the ReplicaStateMachine.
   * This ensures the state machine tracks all existing replicas as 'active'.
   * Requirements: 1.4 - State machine is single source of truth
   *
   * Note: During bootstrap, we temporarily disable CDC persistence because:
   * 1. Partition leadership may not be established yet (Raft election in progress)
   * 2. Services are already registered in registerServices() phase
   * 3. This avoids "No leader available for write operation" errors
   *
   * @param {ReplicaStateMachine} stateMachine - State machine instance.
   * @param {Map<string, PartitionService>} partitions - Created partitions.
   */
  registerReplicasWithStateMachine(stateMachine, partitions) {
    if (!stateMachine) {
      this.logger.warn('No state machine provided for replica registration');
      return;
    }

    // Temporarily disable CDC persistence during bootstrap registration
    // to avoid "No leader available" errors before Raft election completes.
    // The services are already registered in the registerServices() phase.
    const originalCdcService = stateMachine.cdcIntegrationService;
    stateMachine.cdcIntegrationService = null;

    let registeredCount = 0;
    for (const [replicaId, partition] of partitions) {
      try {
        // Transition from null (new) to pending, then through to active
        // For bootstrap replicas, we directly set them as active
        // First transition: null -> pending
        stateMachine.transition(replicaId, ReplicaState.PENDING, {
          partitionId: partition.partitionId,
          nodeId: this.nodeId,
          reason: 'bootstrap_registration',
          serviceId: replicaId,
        });

        // Second transition: pending -> creating
        stateMachine.transition(replicaId, ReplicaState.CREATING, {
          partitionId: partition.partitionId,
          nodeId: this.nodeId,
          reason: 'bootstrap_registration',
          serviceId: replicaId,
        });

        // Third transition: creating -> syncing
        stateMachine.transition(replicaId, ReplicaState.SYNCING, {
          partitionId: partition.partitionId,
          nodeId: this.nodeId,
          reason: 'bootstrap_registration',
          serviceId: replicaId,
        });

        // Fourth transition: syncing -> active
        stateMachine.transition(replicaId, ReplicaState.ACTIVE, {
          partitionId: partition.partitionId,
          nodeId: this.nodeId,
          reason: 'bootstrap_registration',
          serviceId: replicaId,
        });

        registeredCount++;
      } catch (error) {
        this.logger.error('Failed to register replica with state machine', {
          replicaId,
          partitionId: partition.partitionId,
          error: error.message,
        });
      }
    }

    // Restore CDC persistence for future state transitions
    stateMachine.cdcIntegrationService = originalCdcService;

    this.logger.debug('Registered replicas with state machine', {
      registeredCount,
      totalPartitions: partitions.size,
      nodeId: this.nodeId,
      stateCounts: stateMachine.getStateCounts(),
    });
  }

  /**
   * Register lifecycle handler with MessageRouter.
   * The handler delegates CREATE_REPLICA and REMOVE_REPLICA messages to
   * ReplicaLifecycleManager and emits ACK events.
   * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
   * @param {MessageRouter} messageRouter - Router instance.
   * @param {ReplicaLifecycleManager} lifecycleManager - Manager instance.
   */
  registerLifecycleHandler(messageRouter, lifecycleManager) {
    if (!messageRouter) {
      this.logger.warn('No message router provided for lifecycle handler registration');
      return;
    }

    if (!lifecycleManager) {
      this.logger.warn('No lifecycle manager provided for handler registration');
      return;
    }

    // Get message group service for ACK event emission
    const messageGroupService = this.getLeaderMessageGroupService();

    // Lifecycle handler address follows unified format: ${nodeId}/lifecycle/manager
    // Requirements: 1.1, 5.1 - Unified address format ${nodeId}/${entityType}/${entityId}
    const lifecycleAddress = `${this.nodeId}/lifecycle/manager`;

    const lifecycleHandler = async (envelope) => {
      const message = envelope.payload || envelope;
      if (message.type === 'CREATE_REPLICA') {
        const ack = await lifecycleManager.handleCreateReplica(message);
        if (messageGroupService) {
          messageGroupService.emit('CREATE_REPLICA_ACK', ack);
        }
        // Return flat structure - spread ACK fields directly
        return {acknowledged: true, ...ack};
      } else if (message.type === 'REMOVE_REPLICA') {
        const ack = await lifecycleManager.handleRemoveReplica(message);
        if (messageGroupService) {
          messageGroupService.emit('REMOVE_REPLICA_ACK', ack);
        }
        // Return flat structure - spread ACK fields directly
        return {acknowledged: true, ...ack};
      }
      return {acknowledged: false, error: 'Unknown message type'};
    };

    messageRouter.register(lifecycleAddress, lifecycleHandler);

    this.logger.debug('Registered lifecycle handler', {
      address: lifecycleAddress,
      nodeId: this.nodeId,
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

    // Shutdown replica state machine
    if (this.replicaStateMachine) {
      this.replicaStateMachine.stopTimeoutChecker();
      this.replicaStateMachine.clear();
      this.replicaStateMachine = null;
    }

    // Clear epoch manager
    if (this.epochManager) {
      this.epochManager = null;
    }

    // Shutdown replica lifecycle manager
    if (this.replicaLifecycleManager) {
      this.replicaLifecycleManager.shutdown();
      this.replicaLifecycleManager = null;
    }

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

    // Shutdown message router
    if (this.messageRouter && this.messageRouter.shutdown) {
      await this.messageRouter.shutdown();
      this.messageRouter = null;
    }

    // Shutdown transport (alias for messageRouter)
    if (this.transport && this.transport.shutdown && this.transport !== this.messageRouter) {
      await this.transport.shutdown();
    }
    this.transport = null;

    this.logger.info('Cleanup complete', {nodeId: this.nodeId});
  }

  /**
   * Start WebSocket server for cross-node communication.
   * Call this after bootstrap is complete to enable remote node connections.
   * Note: If wsPort was provided during bootstrap, the server is already started.
   * @return {Promise<void>}
   */
  async startWebSocketServer() {
    if (!this.messageRouter) {
      throw new Error('MessageRouter not initialized - bootstrap must complete first');
    }

    const wsPort = this.wsPort || this.config.wsPort;
    if (!wsPort) {
      this.logger.warn('No WebSocket port configured, skipping server start');
      return;
    }

    // Check if server is already running (started during bootstrap)
    if (this.messageRouter.server) {
      this.logger.debug('WebSocket server already running', {
        nodeId: this.nodeId,
        wsPort: wsPort,
      });
      return;
    }

    // Update the port if not already set
    if (!this.messageRouter.wsPort) {
      this.messageRouter.wsPort = wsPort;
    }

    // Start server and establish self-connection
    await this.messageRouter.initialize({startServer: true});

    this.logger.info('WebSocket server started for cross-node communication', {
      nodeId: this.nodeId,
      wsPort: wsPort,
    });
  }

  /**
   * Get the MessageRouter for cross-node communication.
   * @return {MessageRouter|null} The message router or null if not initialized.
   */
  getMessageRouter() {
    return this.messageRouter;
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
   * Shutdown the bootstrap service and all managed services.
   * @return {Promise<void>}
   */
  async shutdown() {
    this.logger.info('Shutting down bootstrap service', {
      nodeId: this.nodeId,
      messageGroupServices: this.messageGroupServices.size,
      partitionServices: this.partitionServices.size,
    });

    await this.cleanup();

    this.emit('shutdown', {nodeId: this.nodeId});
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
