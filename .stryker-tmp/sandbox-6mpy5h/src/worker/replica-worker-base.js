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
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { EventEmitter } from 'events';
import { WorkerMessageBridge } from './worker-message-bridge.js';
import { WORKER_ADDRESS, WORKER_EVENT, WORKER_LOG_MSG, WORKER_STATUS } from './worker-constants.js';

/**
 * Error messages specific to ReplicaWorkerBase.
 * @type {Readonly<Object>}
 */
const REPLICA_BASE_ERROR_MSG = Object.freeze(stryMutAct_9fa48("165381") ? {} : (stryCov_9fa48("165381"), {
  NOT_INITIALIZED: stryMutAct_9fa48("165382") ? "" : (stryCov_9fa48("165382"), 'ReplicaWorkerBase not initialized'),
  ALREADY_INITIALIZED: stryMutAct_9fa48("165383") ? "" : (stryCov_9fa48("165383"), 'ReplicaWorkerBase already initialized'),
  NOT_STARTED: stryMutAct_9fa48("165384") ? "" : (stryCov_9fa48("165384"), 'ReplicaWorkerBase not started'),
  ALREADY_STARTED: stryMutAct_9fa48("165385") ? "" : (stryCov_9fa48("165385"), 'ReplicaWorkerBase already started'),
  ALREADY_STOPPED: stryMutAct_9fa48("165386") ? "" : (stryCov_9fa48("165386"), 'ReplicaWorkerBase already stopped'),
  MISSING_NODE_ID: stryMutAct_9fa48("165387") ? "" : (stryCov_9fa48("165387"), 'nodeId is required'),
  MISSING_ENTITY_TYPE: stryMutAct_9fa48("165388") ? "" : (stryCov_9fa48("165388"), 'entityType is required'),
  MISSING_REPLICA_ID: stryMutAct_9fa48("165389") ? "" : (stryCov_9fa48("165389"), 'replicaId is required'),
  ABSTRACT_METHOD: stryMutAct_9fa48("165390") ? "" : (stryCov_9fa48("165390"), 'Subclass must implement this method')
}));

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
    if (stryMutAct_9fa48("165391")) {
      {}
    } else {
      stryCov_9fa48("165391");
      super();
      if (stryMutAct_9fa48("165394") ? false : stryMutAct_9fa48("165393") ? true : stryMutAct_9fa48("165392") ? options.nodeId : (stryCov_9fa48("165392", "165393", "165394"), !options.nodeId)) {
        if (stryMutAct_9fa48("165395")) {
          {}
        } else {
          stryCov_9fa48("165395");
          throw new Error(REPLICA_BASE_ERROR_MSG.MISSING_NODE_ID);
        }
      }
      if (stryMutAct_9fa48("165398") ? false : stryMutAct_9fa48("165397") ? true : stryMutAct_9fa48("165396") ? options.entityType : (stryCov_9fa48("165396", "165397", "165398"), !options.entityType)) {
        if (stryMutAct_9fa48("165399")) {
          {}
        } else {
          stryCov_9fa48("165399");
          throw new Error(REPLICA_BASE_ERROR_MSG.MISSING_ENTITY_TYPE);
        }
      }
      if (stryMutAct_9fa48("165402") ? false : stryMutAct_9fa48("165401") ? true : stryMutAct_9fa48("165400") ? options.replicaId : (stryCov_9fa48("165400", "165401", "165402"), !options.replicaId)) {
        if (stryMutAct_9fa48("165403")) {
          {}
        } else {
          stryCov_9fa48("165403");
          throw new Error(REPLICA_BASE_ERROR_MSG.MISSING_REPLICA_ID);
        }
      }

      /** @type {string} Node ID where this replica runs */
      this.nodeId = options.nodeId;

      /** @type {string} Entity type ('partition' or 'message-group') */
      this.entityType = options.entityType;

      /** @type {string} Unique replica identifier */
      this.replicaId = options.replicaId;

      /** @type {Object} Logger instance */
      this.logger = stryMutAct_9fa48("165406") ? options.logger && console : stryMutAct_9fa48("165405") ? false : stryMutAct_9fa48("165404") ? true : (stryCov_9fa48("165404", "165405", "165406"), options.logger || console);

      /** @type {string} Unified address for this replica */
      this.unifiedAddress = WORKER_ADDRESS.build(this.nodeId, this.entityType, this.replicaId);

      /** @type {WorkerMessageBridge|null} IPC bridge for communication */
      this.messageBridge = null;

      /** @type {string} Current status of the replica */
      this.status = WORKER_STATUS.STOPPED;

      /** @type {boolean} Whether the replica is initialized */
      this.initialized = stryMutAct_9fa48("165407") ? true : (stryCov_9fa48("165407"), false);

      /** @type {boolean} Whether the replica is started */
      this.started = stryMutAct_9fa48("165408") ? true : (stryCov_9fa48("165408"), false);
    }
  }

  /**
   * Initialize the worker replica.
   * Sets up IPC bridge and registers with MessageRouter.
   * @return {Promise<void>}
   * @throws {Error} If already initialized or initialization fails.
   */
  async initialize() {
    if (stryMutAct_9fa48("165409")) {
      {}
    } else {
      stryCov_9fa48("165409");
      if (stryMutAct_9fa48("165411") ? false : stryMutAct_9fa48("165410") ? true : (stryCov_9fa48("165410", "165411"), this.initialized)) {
        if (stryMutAct_9fa48("165412")) {
          {}
        } else {
          stryCov_9fa48("165412");
          throw new Error(REPLICA_BASE_ERROR_MSG.ALREADY_INITIALIZED);
        }
      }
      this.status = WORKER_STATUS.STARTING;
      this.logger.info(WORKER_LOG_MSG.INITIALIZING, stryMutAct_9fa48("165413") ? {} : (stryCov_9fa48("165413"), {
        replicaId: this.replicaId,
        entityType: this.entityType,
        unifiedAddress: this.unifiedAddress
      }));
      try {
        if (stryMutAct_9fa48("165414")) {
          {}
        } else {
          stryCov_9fa48("165414");
          // Create and initialize the message bridge
          // Note: Registration with MessageRouter is handled by ReplicaWorkerManager,
          // not by the worker itself. Workers receive messages via piscina task queue.
          this.messageBridge = new WorkerMessageBridge(stryMutAct_9fa48("165415") ? {} : (stryCov_9fa48("165415"), {
            logger: this.logger,
            unifiedAddress: this.unifiedAddress
          }));
          await this.messageBridge.initialize();

          // Set up message handler to route incoming messages
          this.messageBridge.setMessageHandler(this.handleIncomingMessage.bind(this));

          // Allow subclasses to perform additional initialization
          await this.onInitialize();
          this.initialized = stryMutAct_9fa48("165416") ? false : (stryCov_9fa48("165416"), true);
          this.logger.info(WORKER_LOG_MSG.INITIALIZED, stryMutAct_9fa48("165417") ? {} : (stryCov_9fa48("165417"), {
            replicaId: this.replicaId,
            unifiedAddress: this.unifiedAddress
          }));
          this.emit(WORKER_EVENT.INITIALIZED, stryMutAct_9fa48("165418") ? {} : (stryCov_9fa48("165418"), {
            replicaId: this.replicaId,
            entityType: this.entityType,
            unifiedAddress: this.unifiedAddress
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("165419")) {
          {}
        } else {
          stryCov_9fa48("165419");
          this.status = WORKER_STATUS.STOPPED;
          this.logger.error(WORKER_LOG_MSG.FAILED, stryMutAct_9fa48("165420") ? {} : (stryCov_9fa48("165420"), {
            replicaId: this.replicaId,
            error: error.message
          }));
          this.emit(WORKER_EVENT.FAILED, stryMutAct_9fa48("165421") ? {} : (stryCov_9fa48("165421"), {
            replicaId: this.replicaId,
            error
          }));
          throw error;
        }
      }
    }
  }

  /**
   * Start the replica service.
   * Subclasses implement replica-specific startup in onStart().
   * @return {Promise<void>}
   * @throws {Error} If not initialized or already started.
   */
  async start() {
    if (stryMutAct_9fa48("165422")) {
      {}
    } else {
      stryCov_9fa48("165422");
      if (stryMutAct_9fa48("165425") ? false : stryMutAct_9fa48("165424") ? true : stryMutAct_9fa48("165423") ? this.initialized : (stryCov_9fa48("165423", "165424", "165425"), !this.initialized)) {
        if (stryMutAct_9fa48("165426")) {
          {}
        } else {
          stryCov_9fa48("165426");
          throw new Error(REPLICA_BASE_ERROR_MSG.NOT_INITIALIZED);
        }
      }
      if (stryMutAct_9fa48("165428") ? false : stryMutAct_9fa48("165427") ? true : (stryCov_9fa48("165427", "165428"), this.started)) {
        if (stryMutAct_9fa48("165429")) {
          {}
        } else {
          stryCov_9fa48("165429");
          throw new Error(REPLICA_BASE_ERROR_MSG.ALREADY_STARTED);
        }
      }
      this.logger.info(WORKER_LOG_MSG.STARTING, stryMutAct_9fa48("165430") ? {} : (stryCov_9fa48("165430"), {
        replicaId: this.replicaId,
        unifiedAddress: this.unifiedAddress
      }));
      try {
        if (stryMutAct_9fa48("165431")) {
          {}
        } else {
          stryCov_9fa48("165431");
          // Allow subclasses to perform startup logic
          await this.onStart();
          this.started = stryMutAct_9fa48("165432") ? false : (stryCov_9fa48("165432"), true);
          this.status = WORKER_STATUS.RUNNING;
          this.logger.info(WORKER_LOG_MSG.STARTED, stryMutAct_9fa48("165433") ? {} : (stryCov_9fa48("165433"), {
            replicaId: this.replicaId,
            unifiedAddress: this.unifiedAddress
          }));
          this.emit(WORKER_EVENT.STARTED, stryMutAct_9fa48("165434") ? {} : (stryCov_9fa48("165434"), {
            replicaId: this.replicaId,
            entityType: this.entityType,
            unifiedAddress: this.unifiedAddress
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("165435")) {
          {}
        } else {
          stryCov_9fa48("165435");
          this.status = WORKER_STATUS.STOPPED;
          this.logger.error(WORKER_LOG_MSG.FAILED, stryMutAct_9fa48("165436") ? {} : (stryCov_9fa48("165436"), {
            replicaId: this.replicaId,
            error: error.message
          }));
          this.emit(WORKER_EVENT.FAILED, stryMutAct_9fa48("165437") ? {} : (stryCov_9fa48("165437"), {
            replicaId: this.replicaId,
            error
          }));
          throw error;
        }
      }
    }
  }

  /**
   * Stop the replica service gracefully.
   * @return {Promise<void>}
   */
  async stop() {
    if (stryMutAct_9fa48("165438")) {
      {}
    } else {
      stryCov_9fa48("165438");
      if (stryMutAct_9fa48("165441") ? this.status !== WORKER_STATUS.STOPPED : stryMutAct_9fa48("165440") ? false : stryMutAct_9fa48("165439") ? true : (stryCov_9fa48("165439", "165440", "165441"), this.status === WORKER_STATUS.STOPPED)) {
        if (stryMutAct_9fa48("165442")) {
          {}
        } else {
          stryCov_9fa48("165442");
          return;
        }
      }
      this.status = WORKER_STATUS.STOPPING;
      this.logger.info(WORKER_LOG_MSG.STOPPING, stryMutAct_9fa48("165443") ? {} : (stryCov_9fa48("165443"), {
        replicaId: this.replicaId,
        unifiedAddress: this.unifiedAddress
      }));
      try {
        if (stryMutAct_9fa48("165444")) {
          {}
        } else {
          stryCov_9fa48("165444");
          // Allow subclasses to perform cleanup
          await this.onStop();

          // Shutdown the message bridge
          if (stryMutAct_9fa48("165446") ? false : stryMutAct_9fa48("165445") ? true : (stryCov_9fa48("165445", "165446"), this.messageBridge)) {
            if (stryMutAct_9fa48("165447")) {
              {}
            } else {
              stryCov_9fa48("165447");
              await this.messageBridge.shutdown();
              this.messageBridge = null;
            }
          }
          this.started = stryMutAct_9fa48("165448") ? true : (stryCov_9fa48("165448"), false);
          this.initialized = stryMutAct_9fa48("165449") ? true : (stryCov_9fa48("165449"), false);
          this.status = WORKER_STATUS.STOPPED;
          this.logger.info(WORKER_LOG_MSG.STOPPED, stryMutAct_9fa48("165450") ? {} : (stryCov_9fa48("165450"), {
            replicaId: this.replicaId,
            unifiedAddress: this.unifiedAddress
          }));
          this.emit(WORKER_EVENT.STOPPED, stryMutAct_9fa48("165451") ? {} : (stryCov_9fa48("165451"), {
            replicaId: this.replicaId,
            entityType: this.entityType,
            unifiedAddress: this.unifiedAddress
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("165452")) {
          {}
        } else {
          stryCov_9fa48("165452");
          this.status = WORKER_STATUS.STOPPED;
          this.logger.error(WORKER_LOG_MSG.FAILED, stryMutAct_9fa48("165453") ? {} : (stryCov_9fa48("165453"), {
            replicaId: this.replicaId,
            error: error.message
          }));
          this.emit(WORKER_EVENT.FAILED, stryMutAct_9fa48("165454") ? {} : (stryCov_9fa48("165454"), {
            replicaId: this.replicaId,
            error
          }));
          throw error;
        }
      }
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
    if (stryMutAct_9fa48("165455")) {
      {}
    } else {
      stryCov_9fa48("165455");
      const message = stryMutAct_9fa48("165458") ? envelope.payload && envelope : stryMutAct_9fa48("165457") ? false : stryMutAct_9fa48("165456") ? true : (stryCov_9fa48("165456", "165457", "165458"), envelope.payload || envelope);
      return this.handleMessage(message);
    }
  }

  /**
   * Handle incoming message from MessageRouter.
   * Subclasses should override this to handle replica-specific messages.
   * @param {Object} message - Incoming message.
   * @return {Promise<Object>} Response.
   */
  async handleMessage(message) {
    if (stryMutAct_9fa48("165459")) {
      {}
    } else {
      stryCov_9fa48("165459");
      // Default implementation - subclasses should override
      this.logger.debug(WORKER_LOG_MSG.MESSAGE_RECEIVED, stryMutAct_9fa48("165460") ? {} : (stryCov_9fa48("165460"), {
        replicaId: this.replicaId,
        messageType: message.type
      }));
      return stryMutAct_9fa48("165461") ? {} : (stryCov_9fa48("165461"), {
        status: stryMutAct_9fa48("165462") ? "" : (stryCov_9fa48("165462"), 'ok'),
        replicaId: this.replicaId
      });
    }
  }

  /**
   * Send message to another replica via MessageRouter.
   * @param {string} targetAddress - Target unified address.
   * @param {Object} message - Message payload.
   * @return {Promise<Object>} Response from target.
   * @throws {Error} If not initialized or send fails.
   */
  async sendMessage(targetAddress, message) {
    if (stryMutAct_9fa48("165463")) {
      {}
    } else {
      stryCov_9fa48("165463");
      if (stryMutAct_9fa48("165466") ? !this.initialized && !this.messageBridge : stryMutAct_9fa48("165465") ? false : stryMutAct_9fa48("165464") ? true : (stryCov_9fa48("165464", "165465", "165466"), (stryMutAct_9fa48("165467") ? this.initialized : (stryCov_9fa48("165467"), !this.initialized)) || (stryMutAct_9fa48("165468") ? this.messageBridge : (stryCov_9fa48("165468"), !this.messageBridge)))) {
        if (stryMutAct_9fa48("165469")) {
          {}
        } else {
          stryCov_9fa48("165469");
          throw new Error(REPLICA_BASE_ERROR_MSG.NOT_INITIALIZED);
        }
      }
      this.logger.debug(WORKER_LOG_MSG.MESSAGE_SENT, stryMutAct_9fa48("165470") ? {} : (stryCov_9fa48("165470"), {
        replicaId: this.replicaId,
        targetAddress
      }));
      return this.messageBridge.send(targetAddress, message);
    }
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
    if (stryMutAct_9fa48("165471")) {
      {}
    } else {
      stryCov_9fa48("165471");
      return this.status;
    }
  }

  /**
   * Get the unified address of this replica.
   * @return {string} Unified address.
   */
  getUnifiedAddress() {
    if (stryMutAct_9fa48("165472")) {
      {}
    } else {
      stryCov_9fa48("165472");
      return this.unifiedAddress;
    }
  }

  /**
   * Get the replica ID.
   * @return {string} Replica ID.
   */
  getReplicaId() {
    if (stryMutAct_9fa48("165473")) {
      {}
    } else {
      stryCov_9fa48("165473");
      return this.replicaId;
    }
  }

  /**
   * Get the entity type.
   * @return {string} Entity type.
   */
  getEntityType() {
    if (stryMutAct_9fa48("165474")) {
      {}
    } else {
      stryCov_9fa48("165474");
      return this.entityType;
    }
  }

  /**
   * Get the node ID.
   * @return {string} Node ID.
   */
  getNodeId() {
    if (stryMutAct_9fa48("165475")) {
      {}
    } else {
      stryCov_9fa48("165475");
      return this.nodeId;
    }
  }

  /**
   * Check if the replica is initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    if (stryMutAct_9fa48("165476")) {
      {}
    } else {
      stryCov_9fa48("165476");
      return this.initialized;
    }
  }

  /**
   * Check if the replica is started.
   * @return {boolean} True if started.
   */
  isStarted() {
    if (stryMutAct_9fa48("165477")) {
      {}
    } else {
      stryCov_9fa48("165477");
      return this.started;
    }
  }

  /**
   * Check if the replica is running.
   * @return {boolean} True if running.
   */
  isRunning() {
    if (stryMutAct_9fa48("165478")) {
      {}
    } else {
      stryCov_9fa48("165478");
      return stryMutAct_9fa48("165481") ? this.status !== WORKER_STATUS.RUNNING : stryMutAct_9fa48("165480") ? false : stryMutAct_9fa48("165479") ? true : (stryCov_9fa48("165479", "165480", "165481"), this.status === WORKER_STATUS.RUNNING);
    }
  }

  /**
   * Get statistics about the replica.
   * @return {Object} Replica statistics.
   */
  getStats() {
    if (stryMutAct_9fa48("165482")) {
      {}
    } else {
      stryCov_9fa48("165482");
      return stryMutAct_9fa48("165483") ? {} : (stryCov_9fa48("165483"), {
        replicaId: this.replicaId,
        entityType: this.entityType,
        nodeId: this.nodeId,
        unifiedAddress: this.unifiedAddress,
        status: this.status,
        initialized: this.initialized,
        started: this.started,
        messageBridgeStats: this.messageBridge ? this.messageBridge.getStats() : null
      });
    }
  }
}
export { ReplicaWorkerBase, REPLICA_BASE_ERROR_MSG };