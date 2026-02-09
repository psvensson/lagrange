/**
 * Message Group Phase - Second phase of bootstrap process.
 *
 * Creates initial message group with replicas on seed node.
 * Elections are deferred until after partitions are created.
 *
 * Supports two modes:
 * - In-process mode: Creates MessageGroupService instances directly
 * - Worker mode: Uses ReplicaWorkerManager to create replicas in worker processes
 *
 * Requirements: 2.2, 2.6, 2.7, 2.8, 1.2 (Worker Process Isolation)
 */

import {EventEmitter} from 'events';
import {LoggingService} from '../../logging/logging-service.js';
import {MessageGroupService} from '../../message-group/message-group-service.js';
import {assertCritical} from '../../utils/assert.js';
import {ADDRESS, ENTITY_TYPE, NUM} from '../../constants/index.js';
import {
  BOOTSTRAP_SUBSYSTEM,
  BOOTSTRAP_LOG_MSG,
  BOOTSTRAP_DEFAULT,
} from '../bootstrap-constants.js';
import {
  INITIAL_MESSAGE_GROUP_ID,
  INITIAL_MESSAGE_GROUP_REPLICA_IDS,
} from '../system-table-schemas-constants.js';
import {WORKER_ENTITY_TYPE} from '../../worker/worker-constants.js';

/**
 * Phase constants for message group setup.
 */
const MESSAGE_GROUP_PHASE = {
  NAME: 'message_groups',
  EVENT_START: 'message_groups:start',
  EVENT_COMPLETE: 'message_groups:complete',
  EVENT_FAILED: 'message_groups:failed',
};

/**
 * MessageGroupPhase handles the second phase of bootstrap.
 * Creates initial message group replicas for cluster communication.
 *
 * When workerManager is provided, creates replicas in worker processes
 * and returns WorkerReplicaHandle objects instead of service instances.
 *
 * Requirements: 1.2 - Worker process isolation for message group replicas.
 */
class MessageGroupPhase extends EventEmitter {
  /**
   * Create message group phase.
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - Node ID (REQUIRED).
   * @param {Object} options.messageRouter - Message router (REQUIRED).
   * @param {Object} [options.workerManager] - ReplicaWorkerManager for worker process isolation.
   * @param {Object} options.config - Bootstrap configuration.
   */
  constructor(options = {}) {
    super();

    this.nodeId = assertCritical(
      options.nodeId,
      'nodeId is required for MessageGroupPhase',
    );
    this.messageRouter = assertCritical(
      options.messageRouter,
      'messageRouter is required for MessageGroupPhase',
    );
    this.config = {...BOOTSTRAP_DEFAULT, ...options.config};

    // Optional worker manager for worker process isolation
    // Requirements 1.2 - Worker process isolation for message group replicas
    this.workerManager = options.workerManager || null;

    // Services created during this phase (in-process mode)
    this.messageGroupServices = new Map();
    this.messageGroupReplicas = [];

    // Worker handles created during this phase (worker mode)
    // Requirements 1.2 - Return WorkerReplicaHandle instead of service instances
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
   * Execute the message group phase.
   * Uses worker processes if workerManager is provided, otherwise creates in-process.
   * @return {Promise<Object>} Phase result with created services or worker handles.
   */
  async execute() {
    const startTime = Date.now();

    this.emit(MESSAGE_GROUP_PHASE.EVENT_START, {
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

      this.emit(MESSAGE_GROUP_PHASE.EVENT_FAILED, {
        phaseName: MESSAGE_GROUP_PHASE.NAME,
        duration,
        error: error.message,
      });

      throw error;
    }
  }

  /**
   * Execute message group phase using worker processes.
   * Requirements 1.2 - Worker process isolation for message group replicas.
   * @param {number} startTime - Phase start timestamp.
   * @return {Promise<Object>} Phase result with worker handles.
   * @private
   */
  async executeWithWorkers(startTime) {
    const groupId = INITIAL_MESSAGE_GROUP_ID;
    const replicaIds = INITIAL_MESSAGE_GROUP_REPLICA_IDS;
    const replicaStaggerDelayMs = this.config.replicaStaggerDelayMs;

    this.logger.debug(BOOTSTRAP_LOG_MSG.CREATING_MESSAGE_GROUP, {
      groupId,
      replicaCount: replicaIds.length,
      nodeId: this.nodeId,
      mode: 'worker',
    });

    // Build peer addresses for Raft using worker entity type
    const peerAddresses = replicaIds.map((replicaId) =>
      `${this.nodeId}/${WORKER_ENTITY_TYPE.MESSAGE_GROUP}/${replicaId}`,
    );

    // Create all replicas in worker processes with staggered delays
    for (let i = NUM.ZERO; i < replicaIds.length; i++) {
      const replicaId = replicaIds[i];

      // Stagger replica creation
      if (i > NUM.ZERO) {
        await new Promise((resolve) => setTimeout(resolve, replicaStaggerDelayMs));
      }

      this.logger.debug(BOOTSTRAP_LOG_MSG.MESSAGE_GROUP_REPLICA_CREATED, {
        groupId,
        replicaId,
        replicaIndex: i,
        nodeId: this.nodeId,
        mode: 'worker',
      });

      // Create replica in worker process via workerManager
      // Requirements 1.2 - Use workerManager.createMessageGroupReplica()
      const handle = await this.workerManager.createMessageGroupReplica({
        groupId,
        replicaId,
        replicaIds,
        peerAddresses,
      });

      // Store worker handle instead of service instance
      this.workerHandles.set(replicaId, handle);

      this.logger.debug(BOOTSTRAP_LOG_MSG.MESSAGE_GROUP_REPLICA_CREATED, {
        groupId,
        replicaId,
        replicaIndex: i,
        nodeId: this.nodeId,
        unifiedAddress: handle.unifiedAddress,
      });
    }

    this.logger.debug(BOOTSTRAP_LOG_MSG.MESSAGE_GROUPS_CREATED_DEFERRED, {
      groupId,
      replicaCount: this.workerHandles.size,
      nodeId: this.nodeId,
      mode: 'worker',
    });

    const duration = Date.now() - startTime;

    const result = {
      phaseName: MESSAGE_GROUP_PHASE.NAME,
      duration,
      services: {
        // Return worker handles instead of service instances
        // Requirements 1.2 - Return WorkerReplicaHandle instead of service instances
        workerHandles: this.workerHandles,
        messageGroupServices: new Map(), // Empty in worker mode
        messageGroupReplicas: [], // Empty in worker mode
      },
      metadata: {
        groupId,
        replicaCount: replicaIds.length,
        servicesCreated: this.workerHandles.size,
        mode: 'worker',
      },
    };

    this.emit(MESSAGE_GROUP_PHASE.EVENT_COMPLETE, result);

    return result;
  }

  /**
   * Execute message group phase in-process (legacy mode).
   * @param {number} startTime - Phase start timestamp.
   * @return {Promise<Object>} Phase result with service instances.
   * @private
   */
  async executeInProcess(startTime) {
    const groupId = INITIAL_MESSAGE_GROUP_ID;
    const replicaIds = INITIAL_MESSAGE_GROUP_REPLICA_IDS;

    // Stagger delay between replica creations
    const replicaStaggerDelayMs = this.config.replicaStaggerDelayMs;

    this.logger.debug(BOOTSTRAP_LOG_MSG.CREATING_MESSAGE_GROUP, {
      groupId,
      replicaCount: replicaIds.length,
      nodeId: this.nodeId,
      mode: 'in-process',
    });

    // Create all replicas on seed node with staggered delays
    // Use deferElection to prevent election storms
    const peerAddresses = replicaIds.map((replicaId) =>
      `${this.nodeId}${ADDRESS.SEPARATOR}` +
      `${ENTITY_TYPE.MESSAGE_GROUP}${ADDRESS.SEPARATOR}${replicaId}`,
    );

    for (let i = NUM.ZERO; i < replicaIds.length; i++) {
      const replicaId = replicaIds[i];

      // Stagger replica creation
      if (i > NUM.ZERO) {
        await new Promise((resolve) => setTimeout(resolve, replicaStaggerDelayMs));
      }

      const messageGroup = new MessageGroupService({
        groupId,
        replicaId,
        nodeId: this.nodeId,
        replicaIds,
        peerAddresses,
        transport: this.messageRouter,
        deferElection: true,
      });

      // Register with MessageRouter using unified address format
      const unifiedAddress = `${this.nodeId}${ADDRESS.SEPARATOR}` +
        `${ENTITY_TYPE.MESSAGE_GROUP}${ADDRESS.SEPARATOR}${replicaId}`;
      this.messageRouter.register(unifiedAddress, (envelope) => {
        return messageGroup.receiveMessage(envelope);
      });

      await messageGroup.initialize();

      this.messageGroupServices.set(replicaId, messageGroup);
      this.messageGroupReplicas.push(messageGroup);

      this.logger.debug(BOOTSTRAP_LOG_MSG.MESSAGE_GROUP_REPLICA_CREATED, {
        groupId,
        replicaId,
        replicaIndex: i,
        nodeId: this.nodeId,
      });
    }

    this.logger.debug(BOOTSTRAP_LOG_MSG.MESSAGE_GROUPS_CREATED_DEFERRED, {
      groupId,
      replicaCount: this.messageGroupReplicas.length,
      nodeId: this.nodeId,
      mode: 'in-process',
    });

    const duration = Date.now() - startTime;

    const result = {
      phaseName: MESSAGE_GROUP_PHASE.NAME,
      duration,
      services: {
        messageGroupServices: this.messageGroupServices,
        messageGroupReplicas: this.messageGroupReplicas,
        workerHandles: new Map(), // Empty in in-process mode
      },
      metadata: {
        groupId,
        replicaCount: replicaIds.length,
        servicesCreated: this.messageGroupServices.size,
        mode: 'in-process',
      },
    };

    this.emit(MESSAGE_GROUP_PHASE.EVENT_COMPLETE, result);

    return result;
  }

  /**
   * Start elections on all message group replicas.
   * Called after partitions are created to prevent election storms.
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

    for (const messageGroup of this.messageGroupReplicas) {
      messageGroup.startElection();
    }
  }

  /**
   * Get the leader message group service.
   * Only applicable in in-process mode.
   * @return {Object|null} Leader message group service or null.
   */
  getLeaderService() {
    if (this.shouldUseWorkerProcesses()) {
      // In worker mode, use workerManager.getLeadershipStatus() instead
      this.logger.warn('getLeaderService() not available in worker mode', {
        nodeId: this.nodeId,
      });
      return null;
    }

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
      for (const service of this.messageGroupServices.values()) {
        try {
          if (service.stop) {
            await service.stop();
          }
        } catch (error) {
          this.logger.warn('Failed to stop message group service during cleanup', {
            error: error.message,
          });
        }
      }
      this.messageGroupServices.clear();
      this.messageGroupReplicas = [];
    }
  }
}

export {MessageGroupPhase, MESSAGE_GROUP_PHASE};
