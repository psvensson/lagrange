/**
 * ReplicaWorkerBase - Base class for worker process replicas.
 *
 * This abstract base class handles common lifecycle and communication setup
 * for both partition and message group replicas running in worker processes.
 * Subclasses implement replica-specific initialization and message handling.
 *
 * @module worker/replica-worker-base
 * @see Requirements 6.1, 6.2, 6.3, 6.5 - Shared Base Class for Worker Replicas
 */

import {EventEmitter} from 'events';
import {WorkerMessageBridge} from './worker-message-bridge.js';
import {
  WORKER_ADDRESS,
  WORKER_EVENT,
  WORKER_LOG_MSG,
  WORKER_STATUS,
} from './worker-constants.js';

/**
 * Error messages specific to ReplicaWorkerBase.
 * @type {Readonly<Object>}
 */
const REPLICA_BASE_ERROR_MSG = Object.freeze({
  NOT_INITIALIZED: 'ReplicaWorkerBase not initialized',
  ALREADY_INITIALIZED: 'ReplicaWorkerBase already initialized',
  NOT_STARTED: 'ReplicaWorkerBase not started',
  ALREADY_STARTED: 'ReplicaWorkerBase already started',
  ALREADY_STOPPED: 'ReplicaWorkerBase already stopped',
  MISSING_NODE_ID: 'nodeId is required',
  MISSING_ENTITY_TYPE: 'entityType is required',
  MISSING_REPLICA_ID: 'replicaId is required',
  ABSTRACT_METHOD: 'Subclass must implement this method',
});

/**
 * ReplicaWorkerBase - Base class for worker process replicas.
 *
 * Handles common lifecycle and communication setup for replicas.
 * Subclasses (PartitionWorkerService, MessageGroupWorkerService) extend
 * this class to implement replica-specific functionality.
 *
 * @extends EventEmitter
 * @fires ReplicaWorkerBase#initialized - When bridge is initialized
 * @fires ReplicaWorkerBase#started - When replica is started and ready
 * @fires ReplicaWorkerBase#stopped - When replica has stopped gracefully
 * @fires ReplicaWorkerBase#failed - When replica has failed with an error
 */
class ReplicaWorkerBase extends EventEmitter {
  /**
   * Create a new ReplicaWorkerBase instance.
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - Node ID where this replica runs.
   * @param {string} options.entityType - Entity type ('partition' or 'message-group').
   * @param {string} options.replicaId - Unique replica identifier.
   * @param {Object} [options.logger=console] - Logger instance.
   */
  constructor(options = {}) {
    super();

    if (!options.nodeId) {
      throw new Error(REPLICA_BASE_ERROR_MSG.MISSING_NODE_ID);
    }
    if (!options.entityType) {
      throw new Error(REPLICA_BASE_ERROR_MSG.MISSING_ENTITY_TYPE);
    }
    if (!options.replicaId) {
      throw new Error(REPLICA_BASE_ERROR_MSG.MISSING_REPLICA_ID);
    }

    /** @type {string} Node ID where this replica runs */
    this.nodeId = options.nodeId;

    /** @type {string} Entity type ('partition' or 'message-group') */
    this.entityType = options.entityType;

    /** @type {string} Unique replica identifier */
    this.replicaId = options.replicaId;

    /** @type {Object} Logger instance */
    this.logger = options.logger || console;

    /** @type {string} Unified address for this replica */
    this.unifiedAddress = WORKER_ADDRESS.build(
      this.nodeId,
      this.entityType,
      this.replicaId,
    );

    /** @type {WorkerMessageBridge|null} IPC bridge for communication */
    this.messageBridge = null;

    /** @type {string} Current status of the replica */
    this.status = WORKER_STATUS.STOPPED;

    /** @type {boolean} Whether the replica is initialized */
    this.initialized = false;

    /** @type {boolean} Whether the replica is started */
    this.started = false;
  }

  /**
   * Initialize the worker replica.
   * Sets up IPC bridge and registers with MessageRouter.
   * @return {Promise<void>}
   * @throws {Error} If already initialized or initialization fails.
   */
  async initialize() {
    if (this.initialized) {
      throw new Error(REPLICA_BASE_ERROR_MSG.ALREADY_INITIALIZED);
    }

    this.status = WORKER_STATUS.STARTING;
    this.logger.info(WORKER_LOG_MSG.INITIALIZING, {
      replicaId: this.replicaId,
      entityType: this.entityType,
      unifiedAddress: this.unifiedAddress,
    });

    try {
      // Create and initialize the message bridge
      // Note: Registration with MessageRouter is handled by ReplicaWorkerManager,
      // not by the worker itself. Workers receive messages via piscina task queue.
      this.messageBridge = new WorkerMessageBridge({
        logger: this.logger,
        unifiedAddress: this.unifiedAddress,
      });

      await this.messageBridge.initialize();

      // Set up message handler to route incoming messages
      this.messageBridge.setMessageHandler(
        this.handleIncomingMessage.bind(this),
      );

      // Allow subclasses to perform additional initialization
      await this.onInitialize();

      this.initialized = true;
      this.logger.info(WORKER_LOG_MSG.INITIALIZED, {
        replicaId: this.replicaId,
        unifiedAddress: this.unifiedAddress,
      });

      this.emit(WORKER_EVENT.INITIALIZED, {
        replicaId: this.replicaId,
        entityType: this.entityType,
        unifiedAddress: this.unifiedAddress,
      });
    } catch (error) {
      this.status = WORKER_STATUS.STOPPED;
      this.logger.error(WORKER_LOG_MSG.FAILED, {
        replicaId: this.replicaId,
        error: error.message,
      });

      this.emit(WORKER_EVENT.FAILED, {
        replicaId: this.replicaId,
        error,
      });

      throw error;
    }
  }

  /**
   * Start the replica service.
   * Subclasses implement replica-specific startup in onStart().
   * @return {Promise<void>}
   * @throws {Error} If not initialized or already started.
   */
  async start() {
    if (!this.initialized) {
      throw new Error(REPLICA_BASE_ERROR_MSG.NOT_INITIALIZED);
    }

    if (this.started) {
      throw new Error(REPLICA_BASE_ERROR_MSG.ALREADY_STARTED);
    }

    this.logger.info(WORKER_LOG_MSG.STARTING, {
      replicaId: this.replicaId,
      unifiedAddress: this.unifiedAddress,
    });

    try {
      // Allow subclasses to perform startup logic
      await this.onStart();

      this.started = true;
      this.status = WORKER_STATUS.RUNNING;

      this.logger.info(WORKER_LOG_MSG.STARTED, {
        replicaId: this.replicaId,
        unifiedAddress: this.unifiedAddress,
      });

      this.emit(WORKER_EVENT.STARTED, {
        replicaId: this.replicaId,
        entityType: this.entityType,
        unifiedAddress: this.unifiedAddress,
      });
    } catch (error) {
      this.status = WORKER_STATUS.STOPPED;
      this.logger.error(WORKER_LOG_MSG.FAILED, {
        replicaId: this.replicaId,
        error: error.message,
      });

      this.emit(WORKER_EVENT.FAILED, {
        replicaId: this.replicaId,
        error,
      });

      throw error;
    }
  }

  /**
   * Stop the replica service gracefully.
   * @return {Promise<void>}
   */
  async stop() {
    if (this.status === WORKER_STATUS.STOPPED) {
      return;
    }

    this.status = WORKER_STATUS.STOPPING;
    this.logger.info(WORKER_LOG_MSG.STOPPING, {
      replicaId: this.replicaId,
      unifiedAddress: this.unifiedAddress,
    });

    try {
      // Allow subclasses to perform cleanup
      await this.onStop();

      // Shutdown the message bridge
      if (this.messageBridge) {
        await this.messageBridge.shutdown();
        this.messageBridge = null;
      }

      this.started = false;
      this.initialized = false;
      this.status = WORKER_STATUS.STOPPED;

      this.logger.info(WORKER_LOG_MSG.STOPPED, {
        replicaId: this.replicaId,
        unifiedAddress: this.unifiedAddress,
      });

      this.emit(WORKER_EVENT.STOPPED, {
        replicaId: this.replicaId,
        entityType: this.entityType,
        unifiedAddress: this.unifiedAddress,
      });
    } catch (error) {
      this.status = WORKER_STATUS.STOPPED;
      this.logger.error(WORKER_LOG_MSG.FAILED, {
        replicaId: this.replicaId,
        error: error.message,
      });

      this.emit(WORKER_EVENT.FAILED, {
        replicaId: this.replicaId,
        error,
      });

      throw error;
    }
  }

  /**
   * Handle incoming message from MessageRouter.
   * Routes to subclass handleMessage() implementation.
   * @param {Object} envelope - Message envelope from IPC.
   * @return {Promise<Object>} Response to send back.
   * @private
   */
  async handleIncomingMessage(envelope) {
    const message = envelope.payload || envelope;
    return this.handleMessage(message);
  }

  /**
   * Handle incoming message from MessageRouter.
   * Subclasses should override this to handle replica-specific messages.
   * @param {Object} message - Incoming message.
   * @return {Promise<Object>} Response.
   */
  async handleMessage(message) {
    // Default implementation - subclasses should override
    this.logger.debug(WORKER_LOG_MSG.MESSAGE_RECEIVED, {
      replicaId: this.replicaId,
      messageType: message.type,
    });

    return {
      status: 'ok',
      replicaId: this.replicaId,
    };
  }

  /**
   * Send message to another replica via MessageRouter.
   * @param {string} targetAddress - Target unified address.
   * @param {Object} message - Message payload.
   * @return {Promise<Object>} Response from target.
   * @throws {Error} If not initialized or send fails.
   */
  async sendMessage(targetAddress, message) {
    if (!this.initialized || !this.messageBridge) {
      throw new Error(REPLICA_BASE_ERROR_MSG.NOT_INITIALIZED);
    }

    this.logger.debug(WORKER_LOG_MSG.MESSAGE_SENT, {
      replicaId: this.replicaId,
      targetAddress,
    });

    return this.messageBridge.send(targetAddress, message);
  }

  /**
   * Hook for subclass initialization.
   * Called during initialize() after bridge setup.
   * Subclasses should override to perform replica-specific initialization.
   * @return {Promise<void>}
   * @protected
   */
  async onInitialize() {
    // Default implementation - subclasses override
  }

  /**
   * Hook for subclass startup.
   * Called during start() before emitting started event.
   * Subclasses should override to perform replica-specific startup.
   * @return {Promise<void>}
   * @protected
   */
  async onStart() {
    // Default implementation - subclasses override
  }

  /**
   * Hook for subclass cleanup.
   * Called during stop() before shutting down bridge.
   * Subclasses should override to perform replica-specific cleanup.
   * @return {Promise<void>}
   * @protected
   */
  async onStop() {
    // Default implementation - subclasses override
  }

  /**
   * Get the current status of the replica.
   * @return {string} Current status.
   */
  getStatus() {
    return this.status;
  }

  /**
   * Get the unified address of this replica.
   * @return {string} Unified address.
   */
  getUnifiedAddress() {
    return this.unifiedAddress;
  }

  /**
   * Get the replica ID.
   * @return {string} Replica ID.
   */
  getReplicaId() {
    return this.replicaId;
  }

  /**
   * Get the entity type.
   * @return {string} Entity type.
   */
  getEntityType() {
    return this.entityType;
  }

  /**
   * Get the node ID.
   * @return {string} Node ID.
   */
  getNodeId() {
    return this.nodeId;
  }

  /**
   * Check if the replica is initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    return this.initialized;
  }

  /**
   * Check if the replica is started.
   * @return {boolean} True if started.
   */
  isStarted() {
    return this.started;
  }

  /**
   * Check if the replica is running.
   * @return {boolean} True if running.
   */
  isRunning() {
    return this.status === WORKER_STATUS.RUNNING;
  }

  /**
   * Get statistics about the replica.
   * @return {Object} Replica statistics.
   */
  getStats() {
    return {
      replicaId: this.replicaId,
      entityType: this.entityType,
      nodeId: this.nodeId,
      unifiedAddress: this.unifiedAddress,
      status: this.status,
      initialized: this.initialized,
      started: this.started,
      messageBridgeStats: this.messageBridge ?
        this.messageBridge.getStats() : null,
    };
  }
}

export {
  ReplicaWorkerBase,
  REPLICA_BASE_ERROR_MSG,
};
