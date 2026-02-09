/**
 * Partition Phase - Third phase of bootstrap process.
 *
 * Creates partitions for all system tables.
 * Elections are deferred until all partitions are created.
 *
 * Supports two modes:
 * - In-process mode: Creates PartitionService instances directly
 * - Worker mode: Uses ReplicaWorkerManager to create replicas in worker processes
 *
 * Requirements: 2.3, 2.6, 2.7, 2.8, 1.1 (Worker Process Isolation)
 */

import {EventEmitter} from 'events';
import {LoggingService} from '../../logging/logging-service.js';
import {PartitionService} from '../../partition/partition-service.js';
import {AssignmentEpochManager} from '../../rebalancer/assignment-epoch-manager.js';
import {AssignmentEpoch} from '../../rebalancer/assignment-epoch.js';
import {assertCritical} from '../../utils/assert.js';
import {ADDRESS, ENTITY_TYPE, NUM} from '../../constants/index.js';
import {
  BOOTSTRAP_SUBSYSTEM,
  BOOTSTRAP_LOG_MSG,
  BOOTSTRAP_DEFAULT,
} from '../bootstrap-constants.js';
import {
  SYSTEM_TABLE_SCHEMAS,
  INITIAL_PARTITION_IDS,
  INITIAL_REPLICA_IDS,
} from '../system-table-schemas-constants.js';
import {WORKER_ENTITY_TYPE} from '../../worker/worker-constants.js';

/**
 * Phase constants for partition setup.
 */
const PARTITION_PHASE = {
  NAME: 'partitions',
  EVENT_START: 'partitions:start',
  EVENT_COMPLETE: 'partitions:complete',
  EVENT_FAILED: 'partitions:failed',
};

/**
 * PartitionPhase handles the third phase of bootstrap.
 * Creates system table partitions for data storage.
 *
 * When workerManager is provided, creates replicas in worker processes
 * and returns WorkerReplicaHandle objects instead of service instances.
 *
 * Requirements: 1.1 - Worker process isolation for partition replicas.
 */
class PartitionPhase extends EventEmitter {
  /**
   * Create partition phase.
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - Node ID (REQUIRED).
   * @param {Object} options.messageRouter - Message router (REQUIRED).
   * @param {Function} options.getLeaderMessageGroupService - Function to get leader (REQUIRED
   *   in in-process mode).
   * @param {Object} [options.workerManager] - ReplicaWorkerManager for worker process isolation.
   * @param {Object} options.dataDirectoryManager - Data directory manager.
   * @param {Object} options.config - Bootstrap configuration.
   */
  constructor(options = {}) {
    super();

    this.nodeId = assertCritical(
      options.nodeId,
      'nodeId is required for PartitionPhase',
    );
    this.messageRouter = assertCritical(
      options.messageRouter,
      'messageRouter is required for PartitionPhase',
    );

    // Optional worker manager for worker process isolation
    // Requirements 1.1 - Worker process isolation for partition replicas
    this.workerManager = options.workerManager || null;

    // getLeaderMessageGroupService is only required in in-process mode
    this.getLeaderMessageGroupService = options.getLeaderMessageGroupService || null;

    this.dataDirectoryManager = options.dataDirectoryManager || null;
    this.config = {...BOOTSTRAP_DEFAULT, ...options.config};

    // Services created during this phase (in-process mode)
    this.partitionServices = new Map();
    this.allPartitionReplicas = [];
    this.epochManager = null;
    this.partitionsCreated = NUM.ZERO;

    // Worker handles created during this phase (worker mode)
    // Requirements 1.1 - Return WorkerReplicaHandle instead of service instances
    this.workerHandles = new Map();

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(BOOTSTRAP_SUBSYSTEM.SERVICE) : console;
  }

  /**
   * Check if worker process isolation should be used.
   * @return {boolean} True if worker processes should be used.
   */
  shouldUseWorkerProcesses() {
    return this.workerManager !== null && this.workerManager.isInitialized();
  }

  /**
   * Execute the partition phase.
   * Uses worker processes if workerManager is provided, otherwise creates in-process.
   * @return {Promise<Object>} Phase result with created services or worker handles.
   */
  async execute() {
    const startTime = Date.now();

    this.emit(PARTITION_PHASE.EVENT_START, {
      nodeId: this.nodeId,
    });

    try {
      if (this.shouldUseWorkerProcesses()) {
        return await this.executeWithWorkers(startTime);
      } else {
        return await this.executeInProcess(startTime);
      }
    } catch (error) {
      const duration = Date.now() - startTime;

      this.emit(PARTITION_PHASE.EVENT_FAILED, {
        phaseName: PARTITION_PHASE.NAME,
        duration,
        error: error.message,
      });

      throw error;
    }
  }

  /**
   * Execute partition phase using worker processes.
   * Requirements 1.1 - Worker process isolation for partition replicas.
   * @param {number} startTime - Phase start timestamp.
   * @return {Promise<Object>} Phase result with worker handles.
   * @private
   */
  async executeWithWorkers(startTime) {
    const replicaStaggerDelayMs = this.config.replicaStaggerDelayMs;

    // Create partitions for each system table
    for (const schema of SYSTEM_TABLE_SCHEMAS) {
      const tableName = schema.tableName;
      const partitionId = INITIAL_PARTITION_IDS[tableName];
      const replicaIds = INITIAL_REPLICA_IDS[tableName];

      this.logger.debug(BOOTSTRAP_LOG_MSG.CREATING_SYSTEM_PARTITION, {
        tableName,
        partitionId,
        replicaCount: replicaIds.length,
        nodeId: this.nodeId,
        mode: 'worker',
      });

      // Build peer addresses for Raft using worker entity type
      const peerAddresses = replicaIds.map((replicaId) =>
        `${this.nodeId}/${WORKER_ENTITY_TYPE.PARTITION}/${replicaId}`,
      );

      for (let i = NUM.ZERO; i < replicaIds.length; i++) {
        const replicaId = replicaIds[i];

        // Stagger replica creation
        if (i > NUM.ZERO) {
          await new Promise((resolve) => setTimeout(resolve, replicaStaggerDelayMs));
        }

        // Generate database path
        let dbPath = BOOTSTRAP_DEFAULT.partitionDbPath;
        if (this.dataDirectoryManager && this.dataDirectoryManager.isInitialized()) {
          dbPath = this.dataDirectoryManager.getPartitionDbPath(partitionId, replicaId);
        } else if (this.config.partitionDbPath) {
          dbPath = this.config.partitionDbPath;
        }

        this.logger.debug(BOOTSTRAP_LOG_MSG.PARTITION_REPLICA_CREATED, {
          tableName,
          partitionId,
          replicaId,
          replicaIndex: i,
          nodeId: this.nodeId,
          mode: 'worker',
        });

        // Create replica in worker process via workerManager
        // Requirements 1.1 - Use workerManager.createPartitionReplica()
        const handle = await this.workerManager.createPartitionReplica({
          partitionId,
          replicaId,
          tableId: tableName,
          tableName,
          schema,
          dbPath,
          replicaIds,
          peerAddresses,
        });

        // Store worker handle instead of service instance
        this.workerHandles.set(replicaId, handle);

        this.logger.debug(BOOTSTRAP_LOG_MSG.PARTITION_REPLICA_CREATED, {
          tableName,
          partitionId,
          replicaId,
          replicaIndex: i,
          nodeId: this.nodeId,
          unifiedAddress: handle.unifiedAddress,
        });
      }

      this.partitionsCreated++;
    }

    // Initialize epoch manager with initial assignments (worker mode)
    this.initializeEpochManagerForWorkers();

    this.logger.debug(BOOTSTRAP_LOG_MSG.PARTITIONS_CREATED, {
      partitionsCreated: this.partitionsCreated,
      nodeId: this.nodeId,
      mode: 'worker',
    });

    const duration = Date.now() - startTime;

    const result = {
      phaseName: PARTITION_PHASE.NAME,
      duration,
      services: {
        // Return worker handles instead of service instances
        // Requirements 1.1 - Return WorkerReplicaHandle instead of service instances
        workerHandles: this.workerHandles,
        partitionServices: new Map(), // Empty in worker mode
        epochManager: this.epochManager,
      },
      metadata: {
        partitionsCreated: this.partitionsCreated,
        servicesCreated: this.workerHandles.size,
        mode: 'worker',
      },
    };

    this.emit(PARTITION_PHASE.EVENT_COMPLETE, result);

    return result;
  }

  /**
   * Execute partition phase in-process (legacy mode).
   * @param {number} startTime - Phase start timestamp.
   * @return {Promise<Object>} Phase result with service instances.
   * @private
   */
  async executeInProcess(startTime) {
    // Validate getLeaderMessageGroupService is provided for in-process mode
    if (!this.getLeaderMessageGroupService) {
      throw new Error('getLeaderMessageGroupService is required for in-process mode');
    }

    const replicaStaggerDelayMs = this.config.replicaStaggerDelayMs;

    // Create partitions for each system table
    for (const schema of SYSTEM_TABLE_SCHEMAS) {
      const tableName = schema.tableName;
      const partitionId = INITIAL_PARTITION_IDS[tableName];
      const replicaIds = INITIAL_REPLICA_IDS[tableName];

      this.logger.debug(BOOTSTRAP_LOG_MSG.CREATING_SYSTEM_PARTITION, {
        tableName,
        partitionId,
        replicaCount: replicaIds.length,
        nodeId: this.nodeId,
        mode: 'in-process',
      });

      // Create all replicas on seed node with staggered delays
      const peerAddresses = replicaIds.map((replicaId) =>
        `${this.nodeId}${ADDRESS.SEPARATOR}` +
        `${ENTITY_TYPE.PARTITION}${ADDRESS.SEPARATOR}${replicaId}`,
      );

      for (let i = NUM.ZERO; i < replicaIds.length; i++) {
        const replicaId = replicaIds[i];

        // Stagger replica creation
        if (i > NUM.ZERO) {
          await new Promise((resolve) => setTimeout(resolve, replicaStaggerDelayMs));
        }

        // Generate database path
        let dbPath = BOOTSTRAP_DEFAULT.partitionDbPath;
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
          keyRange: {start: null, end: null},
          replicaId,
          replicaIds,
          peerAddresses,
          nodeId: this.nodeId,
          transport: this.messageRouter,
          dbPath,
          messageGroupService: this.getLeaderMessageGroupService(),
          messageRouter: this.messageRouter,
          deferElection: true,
        });

        await partition.initialize();

        this.partitionServices.set(replicaId, partition);
        this.allPartitionReplicas.push(partition);

        this.logger.debug(BOOTSTRAP_LOG_MSG.PARTITION_REPLICA_CREATED, {
          tableName,
          partitionId,
          replicaId,
          replicaIndex: i,
          nodeId: this.nodeId,
        });
      }

      this.partitionsCreated++;
    }

    // Initialize epoch manager with initial assignments
    this.initializeEpochManager();

    this.logger.debug(BOOTSTRAP_LOG_MSG.PARTITIONS_CREATED, {
      partitionsCreated: this.partitionsCreated,
      nodeId: this.nodeId,
      mode: 'in-process',
    });

    const duration = Date.now() - startTime;

    const result = {
      phaseName: PARTITION_PHASE.NAME,
      duration,
      services: {
        partitionServices: this.partitionServices,
        epochManager: this.epochManager,
        workerHandles: new Map(), // Empty in in-process mode
      },
      metadata: {
        partitionsCreated: this.partitionsCreated,
        servicesCreated: this.partitionServices.size,
        mode: 'in-process',
      },
    };

    this.emit(PARTITION_PHASE.EVENT_COMPLETE, result);

    return result;
  }

  /**
   * Initialize the AssignmentEpochManager with the initial epoch (in-process mode).
   * @private
   */
  initializeEpochManager() {
    const initialAssignments = {};
    const partitionNodes = new Map();

    for (const [_replicaId, partition] of this.partitionServices) {
      const partitionId = partition.partitionId;
      if (!partitionNodes.has(partitionId)) {
        partitionNodes.set(partitionId, []);
      }
      if (!partitionNodes.get(partitionId).includes(this.nodeId)) {
        partitionNodes.get(partitionId).push(this.nodeId);
      }
    }

    for (const [partitionId, nodes] of partitionNodes) {
      initialAssignments[partitionId] = nodes;
    }

    this.epochManager = new AssignmentEpochManager({
      nodeId: this.nodeId,
      timestampProvider: () => new Date().toISOString(),
    });

    const initialEpoch = new AssignmentEpoch({
      epoch: NUM.ZERO,
      assignments: initialAssignments,
      timestamp: new Date().toISOString(),
      proposedBy: this.nodeId,
    });

    this.epochManager.initialize(initialEpoch);

    this.logger.info(BOOTSTRAP_LOG_MSG.EPOCH_MANAGER_READY, {
      nodeId: this.nodeId,
      epoch: this.epochManager.getCurrentEpoch().epoch,
      partitionCount: Object.keys(initialAssignments).length,
      assignments: initialAssignments,
    });
  }

  /**
   * Initialize the AssignmentEpochManager with the initial epoch (worker mode).
   * Uses worker handles instead of service instances.
   * @private
   */
  initializeEpochManagerForWorkers() {
    const initialAssignments = {};
    const partitionNodes = new Map();

    for (const [_replicaId, handle] of this.workerHandles) {
      const partitionId = handle.partitionId;
      if (!partitionNodes.has(partitionId)) {
        partitionNodes.set(partitionId, []);
      }
      if (!partitionNodes.get(partitionId).includes(this.nodeId)) {
        partitionNodes.get(partitionId).push(this.nodeId);
      }
    }

    for (const [partitionId, nodes] of partitionNodes) {
      initialAssignments[partitionId] = nodes;
    }

    this.epochManager = new AssignmentEpochManager({
      nodeId: this.nodeId,
      timestampProvider: () => new Date().toISOString(),
    });

    const initialEpoch = new AssignmentEpoch({
      epoch: NUM.ZERO,
      assignments: initialAssignments,
      timestamp: new Date().toISOString(),
      proposedBy: this.nodeId,
    });

    this.epochManager.initialize(initialEpoch);

    this.logger.info(BOOTSTRAP_LOG_MSG.EPOCH_MANAGER_READY, {
      nodeId: this.nodeId,
      epoch: this.epochManager.getCurrentEpoch().epoch,
      partitionCount: Object.keys(initialAssignments).length,
      assignments: initialAssignments,
      mode: 'worker',
    });
  }

  /**
   * Start elections on all partition replicas.
   * Only applicable in in-process mode; worker mode handles elections internally.
   */
  startElections() {
    if (this.shouldUseWorkerProcesses()) {
      // In worker mode, elections are handled by the worker processes
      this.logger.debug('Elections handled by worker processes', {
        nodeId: this.nodeId,
        workerCount: this.workerHandles.size,
      });
      return;
    }

    this.logger.info(BOOTSTRAP_LOG_MSG.STARTING_PARTITION_ELECTIONS, {
      totalReplicas: this.allPartitionReplicas.length,
      partitionsCreated: this.partitionsCreated,
      nodeId: this.nodeId,
    });

    for (const partition of this.allPartitionReplicas) {
      partition.startElection();
    }
  }

  /**
   * Get worker handles (worker mode only).
   * @return {Map<string, Object>} Worker handles by replica ID.
   */
  getWorkerHandles() {
    return this.workerHandles;
  }

  /**
   * Check if using worker mode.
   * @return {boolean} True if using worker processes.
   */
  isWorkerMode() {
    return this.shouldUseWorkerProcesses();
  }

  /**
   * Clean up resources on failure.
   * @return {Promise<void>}
   */
  async cleanup() {
    if (this.shouldUseWorkerProcesses()) {
      // In worker mode, stop replicas via workerManager
      for (const [replicaId, _handle] of this.workerHandles) {
        try {
          await this.workerManager.stopReplica(replicaId);
        } catch (error) {
          this.logger.warn('Failed to stop worker replica during cleanup', {
            replicaId,
            error: error.message,
          });
        }
      }
      this.workerHandles.clear();
    } else {
      // In-process mode cleanup
      for (const service of this.partitionServices.values()) {
        try {
          if (service.stop) {
            await service.stop();
          }
        } catch (error) {
          this.logger.warn('Failed to stop partition service during cleanup', {
            error: error.message,
          });
        }
      }
      this.partitionServices.clear();
      this.allPartitionReplicas = [];
    }
  }
}

export {PartitionPhase, PARTITION_PHASE};
