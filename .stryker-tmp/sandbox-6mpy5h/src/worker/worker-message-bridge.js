/**
 * WorkerMessageBridge - IPC bridge for worker-to-main process communication.
 *
 * This module handles IPC communication between worker processes and the main
 * process MessageRouter. It runs in each worker process and provides methods
 * to send messages, handle incoming messages, and manage the message handler.
 *
 * Note: Registration with MessageRouter is handled by ReplicaWorkerManager,
 * not by the worker itself. Workers receive messages via piscina task queue
 * (DELIVER_MESSAGE operation), not via IPC registration.
 *
 * @module worker/worker-message-bridge
 * @see Requirements 7.1, 7.2, 7.3 - Message Routing in Worker Processes
 * @see Requirement 11.3 - Workers do NOT self-register with MessageRouter
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
import { parentPort } from 'worker_threads';
import { v4 as uuidv4 } from 'uuid';
import { WORKER_DEFAULT, WORKER_ERROR_MSG, WORKER_EVENT, WORKER_LOG_MSG, WORKER_RESPONSE_STATUS } from './worker-constants.js';

/**
 * IPC message types for communication between worker and main process.
 * Note: REGISTER and UNREGISTER are no longer used - registration is handled
 * by ReplicaWorkerManager in the main process.
 * @type {Readonly<Object>}
 */
const IPC_MESSAGE_TYPE = Object.freeze(stryMutAct_9fa48("166391") ? {} : (stryCov_9fa48("166391"), {
  /** Send message through main process MessageRouter */
  SEND: stryMutAct_9fa48("166392") ? "" : (stryCov_9fa48("166392"), 'WORKER_SEND'),
  /** Incoming message from main process */
  INCOMING: stryMutAct_9fa48("166393") ? "" : (stryCov_9fa48("166393"), 'WORKER_INCOMING'),
  /** Response to a previous request */
  RESPONSE: stryMutAct_9fa48("166394") ? "" : (stryCov_9fa48("166394"), 'WORKER_RESPONSE')
}));

/**
 * WorkerMessageBridge provides IPC communication between worker processes
 * and the main process MessageRouter.
 *
 * Each worker process creates one instance of this bridge to:
 * - Send messages to other replicas through the MessageRouter
 * - Receive incoming messages from the MessageRouter
 *
 * Note: Workers do NOT self-register with MessageRouter. The ReplicaWorkerManager
 * handles registration after successful worker creation. Workers receive messages
 * via piscina task queue (DELIVER_MESSAGE operation).
 *
 * @extends EventEmitter
 * @fires WorkerMessageBridge#initialized - When bridge is initialized
 * @fires WorkerMessageBridge#message - When a message is received
 */
class WorkerMessageBridge extends EventEmitter {
  /**
   * Create a new WorkerMessageBridge instance.
   * @param {Object} [options={}] - Configuration options.
   * @param {Object} [options.logger=console] - Logger instance.
   * @param {number} [options.requestTimeoutMs] - Timeout for pending requests.
   * @param {string} [options.unifiedAddress] - Unified address for this worker.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("166395")) {
      {}
    } else {
      stryCov_9fa48("166395");
      super();
      this.logger = stryMutAct_9fa48("166398") ? options.logger && console : stryMutAct_9fa48("166397") ? false : stryMutAct_9fa48("166396") ? true : (stryCov_9fa48("166396", "166397", "166398"), options.logger || console);
      this.requestTimeoutMs = stryMutAct_9fa48("166401") ? options.requestTimeoutMs && WORKER_DEFAULT.OPERATION_TIMEOUT_MS : stryMutAct_9fa48("166400") ? false : stryMutAct_9fa48("166399") ? true : (stryCov_9fa48("166399", "166400", "166401"), options.requestTimeoutMs || WORKER_DEFAULT.OPERATION_TIMEOUT_MS);

      /** @type {string|null} Unified address of this worker (set externally) */
      this.unifiedAddress = stryMutAct_9fa48("166404") ? options.unifiedAddress && null : stryMutAct_9fa48("166403") ? false : stryMutAct_9fa48("166402") ? true : (stryCov_9fa48("166402", "166403", "166404"), options.unifiedAddress || null);

      /** @type {Map<string, Object>} Pending requests awaiting response */
      this.pendingRequests = new Map();

      /** @type {Function|null} Handler for incoming messages */
      this.messageHandler = null;

      /** @type {boolean} Whether the bridge is initialized */
      this.initialized = stryMutAct_9fa48("166405") ? true : (stryCov_9fa48("166405"), false);

      // Bind the IPC message handler
      this.boundMessageHandler = this.handleIPCMessage.bind(this);
    }
  }

  /**
   * Initialize the message bridge.
   * Sets up the IPC message listener on parentPort.
   * @return {Promise<void>}
   */
  async initialize() {
    if (stryMutAct_9fa48("166406")) {
      {}
    } else {
      stryCov_9fa48("166406");
      if (stryMutAct_9fa48("166408") ? false : stryMutAct_9fa48("166407") ? true : (stryCov_9fa48("166407", "166408"), this.initialized)) {
        if (stryMutAct_9fa48("166409")) {
          {}
        } else {
          stryCov_9fa48("166409");
          return;
        }
      }
      if (stryMutAct_9fa48("166412") ? false : stryMutAct_9fa48("166411") ? true : stryMutAct_9fa48("166410") ? parentPort : (stryCov_9fa48("166410", "166411", "166412"), !parentPort)) {
        if (stryMutAct_9fa48("166413")) {
          {}
        } else {
          stryCov_9fa48("166413");
          throw new Error(WORKER_ERROR_MSG.NOT_INITIALIZED);
        }
      }
      parentPort.on(stryMutAct_9fa48("166414") ? "" : (stryCov_9fa48("166414"), 'message'), this.boundMessageHandler);
      this.initialized = stryMutAct_9fa48("166415") ? false : (stryCov_9fa48("166415"), true);
      this.logger.info(WORKER_LOG_MSG.INITIALIZED);
      this.emit(WORKER_EVENT.INITIALIZED);
    }
  }

  /**
   * Set the unified address for this worker.
   * This is called by the worker service after initialization.
   * @param {string} address - Unified address (nodeId/entityType/replicaId).
   */
  setUnifiedAddress(address) {
    if (stryMutAct_9fa48("166416")) {
      {}
    } else {
      stryCov_9fa48("166416");
      this.unifiedAddress = address;
    }
  }

  /**
   * Send a message through the main process MessageRouter.
   * @param {string} targetAddress - Target unified address.
   * @param {Object} message - Message payload.
   * @return {Promise<Object>} Response from target.
   * @throws {Error} If not initialized or send fails.
   */
  async send(targetAddress, message) {
    if (stryMutAct_9fa48("166417")) {
      {}
    } else {
      stryCov_9fa48("166417");
      if (stryMutAct_9fa48("166420") ? false : stryMutAct_9fa48("166419") ? true : stryMutAct_9fa48("166418") ? this.initialized : (stryCov_9fa48("166418", "166419", "166420"), !this.initialized)) {
        if (stryMutAct_9fa48("166421")) {
          {}
        } else {
          stryCov_9fa48("166421");
          throw new Error(WORKER_ERROR_MSG.NOT_INITIALIZED);
        }
      }
      if (stryMutAct_9fa48("166424") ? false : stryMutAct_9fa48("166423") ? true : stryMutAct_9fa48("166422") ? this.unifiedAddress : (stryCov_9fa48("166422", "166423", "166424"), !this.unifiedAddress)) {
        if (stryMutAct_9fa48("166425")) {
          {}
        } else {
          stryCov_9fa48("166425");
          throw new Error(WORKER_ERROR_MSG.ADDRESS_NOT_SET);
        }
      }
      const messageId = uuidv4();
      const correlationId = stryMutAct_9fa48("166428") ? message.correlationId && uuidv4() : stryMutAct_9fa48("166427") ? false : stryMutAct_9fa48("166426") ? true : (stryCov_9fa48("166426", "166427", "166428"), message.correlationId || uuidv4());
      const envelope = stryMutAct_9fa48("166429") ? {} : (stryCov_9fa48("166429"), {
        type: IPC_MESSAGE_TYPE.SEND,
        messageId,
        sourceAddress: this.unifiedAddress,
        targetAddress,
        payload: message,
        correlationId,
        timestamp: Date.now()
      });
      this.logger.debug(WORKER_LOG_MSG.MESSAGE_SENT, stryMutAct_9fa48("166430") ? {} : (stryCov_9fa48("166430"), {
        messageId,
        targetAddress,
        correlationId
      }));
      const response = await this.sendIPCRequest(envelope);
      if (stryMutAct_9fa48("166433") ? response.status !== WORKER_RESPONSE_STATUS.ERROR : stryMutAct_9fa48("166432") ? false : stryMutAct_9fa48("166431") ? true : (stryCov_9fa48("166431", "166432", "166433"), response.status === WORKER_RESPONSE_STATUS.ERROR)) {
        if (stryMutAct_9fa48("166434")) {
          {}
        } else {
          stryCov_9fa48("166434");
          const errorMsg = stryMutAct_9fa48("166437") ? response.error && WORKER_ERROR_MSG.MESSAGE_DELIVERY_FAILED : stryMutAct_9fa48("166436") ? false : stryMutAct_9fa48("166435") ? true : (stryCov_9fa48("166435", "166436", "166437"), response.error || WORKER_ERROR_MSG.MESSAGE_DELIVERY_FAILED);
          throw new Error(errorMsg);
        }
      }
      return stryMutAct_9fa48("166440") ? response.payload && response : stryMutAct_9fa48("166439") ? false : stryMutAct_9fa48("166438") ? true : (stryCov_9fa48("166438", "166439", "166440"), response.payload || response);
    }
  }

  /**
   * Deliver a message using the same transport contract as MessageRouter.
   * Raft traffic uses fire-and-forget semantics and only needs local send
   * acknowledgment for liferaft callbacks.
   * @param {string} targetAddress - Target unified address.
   * @param {Object} message - Message payload.
   * @return {Promise<Object>} Local acknowledgment.
   */
  async deliver(targetAddress, message) {
    if (stryMutAct_9fa48("166441")) {
      {}
    } else {
      stryCov_9fa48("166441");
      this.sendFireAndForget(targetAddress, message);
      return stryMutAct_9fa48("166442") ? {} : (stryCov_9fa48("166442"), {
        acknowledged: stryMutAct_9fa48("166443") ? false : (stryCov_9fa48("166443"), true),
        status: WORKER_RESPONSE_STATUS.OK
      });
    }
  }

  /**
   * Send a message without waiting for a response (fire-and-forget).
   * Used for Raft packet routing where the Raft protocol handles retries.
   * @param {string} targetAddress - Target unified address.
   * @param {Object} message - Message payload.
   * @throws {Error} If not initialized.
   */
  sendFireAndForget(targetAddress, message) {
    if (stryMutAct_9fa48("166444")) {
      {}
    } else {
      stryCov_9fa48("166444");
      if (stryMutAct_9fa48("166447") ? false : stryMutAct_9fa48("166446") ? true : stryMutAct_9fa48("166445") ? this.initialized : (stryCov_9fa48("166445", "166446", "166447"), !this.initialized)) {
        if (stryMutAct_9fa48("166448")) {
          {}
        } else {
          stryCov_9fa48("166448");
          throw new Error(WORKER_ERROR_MSG.NOT_INITIALIZED);
        }
      }
      if (stryMutAct_9fa48("166451") ? false : stryMutAct_9fa48("166450") ? true : stryMutAct_9fa48("166449") ? this.unifiedAddress : (stryCov_9fa48("166449", "166450", "166451"), !this.unifiedAddress)) {
        if (stryMutAct_9fa48("166452")) {
          {}
        } else {
          stryCov_9fa48("166452");
          throw new Error(WORKER_ERROR_MSG.ADDRESS_NOT_SET);
        }
      }
      const messageId = uuidv4();
      const correlationId = stryMutAct_9fa48("166455") ? message.correlationId && uuidv4() : stryMutAct_9fa48("166454") ? false : stryMutAct_9fa48("166453") ? true : (stryCov_9fa48("166453", "166454", "166455"), message.correlationId || uuidv4());
      const envelope = stryMutAct_9fa48("166456") ? {} : (stryCov_9fa48("166456"), {
        type: IPC_MESSAGE_TYPE.SEND,
        messageId,
        sourceAddress: this.unifiedAddress,
        targetAddress,
        payload: message,
        correlationId,
        timestamp: Date.now()
      });
      this.logger.debug(WORKER_LOG_MSG.MESSAGE_SENT, stryMutAct_9fa48("166457") ? {} : (stryCov_9fa48("166457"), {
        messageId,
        targetAddress,
        correlationId,
        fireAndForget: stryMutAct_9fa48("166458") ? false : (stryCov_9fa48("166458"), true)
      }));

      // Post message without waiting for response
      parentPort.postMessage(envelope);
    }
  }

  /**
   * Handle incoming message from main process.
   * This method is called by the message handler when a message arrives.
   * @param {Object} envelope - Message envelope.
   * @return {Promise<Object>} Response to send back.
   */
  async handleIncoming(envelope) {
    if (stryMutAct_9fa48("166459")) {
      {}
    } else {
      stryCov_9fa48("166459");
      let resultPayload;
      if (stryMutAct_9fa48("166461") ? false : stryMutAct_9fa48("166460") ? true : (stryCov_9fa48("166460", "166461"), this.initialized)) {
        if (stryMutAct_9fa48("166462")) {
          {}
        } else {
          stryCov_9fa48("166462");
          this.logger.debug(WORKER_LOG_MSG.MESSAGE_RECEIVED, stryMutAct_9fa48("166463") ? {} : (stryCov_9fa48("166463"), {
            messageId: envelope.messageId,
            sourceAddress: envelope.sourceAddress,
            correlationId: envelope.correlationId
          }));
          this.emit(stryMutAct_9fa48("166464") ? "" : (stryCov_9fa48("166464"), 'message'), envelope);
          if (stryMutAct_9fa48("166466") ? false : stryMutAct_9fa48("166465") ? true : (stryCov_9fa48("166465", "166466"), this.messageHandler)) {
            if (stryMutAct_9fa48("166467")) {
              {}
            } else {
              stryCov_9fa48("166467");
              resultPayload = await this.messageHandler(envelope);
            }
          }
        }
      }
      return (stryMutAct_9fa48("166468") ? this.initialized : (stryCov_9fa48("166468"), !this.initialized)) ? stryMutAct_9fa48("166469") ? {} : (stryCov_9fa48("166469"), {
        status: WORKER_RESPONSE_STATUS.ERROR,
        error: WORKER_ERROR_MSG.NOT_INITIALIZED
      }) : this.messageHandler ? stryMutAct_9fa48("166470") ? {} : (stryCov_9fa48("166470"), {
        status: WORKER_RESPONSE_STATUS.OK,
        messageId: envelope.messageId,
        correlationId: envelope.correlationId,
        payload: resultPayload,
        timestamp: Date.now()
      }) : stryMutAct_9fa48("166471") ? {} : (stryCov_9fa48("166471"), {
        status: WORKER_RESPONSE_STATUS.OK,
        messageId: envelope.messageId,
        correlationId: envelope.correlationId,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Set the handler for incoming messages.
   * @param {Function} handler - Message handler function.
   */
  setMessageHandler(handler) {
    if (stryMutAct_9fa48("166472")) {
      {}
    } else {
      stryCov_9fa48("166472");
      this.messageHandler = handler;
    }
  }

  /**
   * Shutdown the message bridge.
   * Cleans up resources.
   * @return {Promise<void>}
   */
  async shutdown() {
    if (stryMutAct_9fa48("166473")) {
      {}
    } else {
      stryCov_9fa48("166473");
      // Clear all pending requests with error
      for (const [messageId, pending] of this.pendingRequests) {
        if (stryMutAct_9fa48("166474")) {
          {}
        } else {
          stryCov_9fa48("166474");
          clearTimeout(pending.timeout);
          pending.reject(new Error(WORKER_ERROR_MSG.OPERATION_FAILED));
          this.pendingRequests.delete(messageId);
        }
      }

      // Remove IPC listener
      if (stryMutAct_9fa48("166477") ? parentPort || this.initialized : stryMutAct_9fa48("166476") ? false : stryMutAct_9fa48("166475") ? true : (stryCov_9fa48("166475", "166476", "166477"), parentPort && this.initialized)) {
        if (stryMutAct_9fa48("166478")) {
          {}
        } else {
          stryCov_9fa48("166478");
          parentPort.off(stryMutAct_9fa48("166479") ? "" : (stryCov_9fa48("166479"), 'message'), this.boundMessageHandler);
        }
      }
      this.initialized = stryMutAct_9fa48("166480") ? true : (stryCov_9fa48("166480"), false);
      this.messageHandler = null;
      this.logger.info(WORKER_LOG_MSG.STOPPED);
    }
  }

  /**
   * Send an IPC request and wait for response.
   * @param {Object} message - Message to send.
   * @return {Promise<Object>} Response from main process.
   * @private
   */
  sendIPCRequest(message) {
    if (stryMutAct_9fa48("166481")) {
      {}
    } else {
      stryCov_9fa48("166481");
      return new Promise((resolve, reject) => {
        if (stryMutAct_9fa48("166482")) {
          {}
        } else {
          stryCov_9fa48("166482");
          const messageId = message.messageId;
          const timeout = setTimeout(() => {
            if (stryMutAct_9fa48("166483")) {
              {}
            } else {
              stryCov_9fa48("166483");
              this.pendingRequests.delete(messageId);
              reject(new Error(WORKER_ERROR_MSG.OPERATION_TIMEOUT));
            }
          }, this.requestTimeoutMs);
          this.pendingRequests.set(messageId, stryMutAct_9fa48("166484") ? {} : (stryCov_9fa48("166484"), {
            resolve,
            reject,
            timeout,
            timestamp: Date.now()
          }));
          parentPort.postMessage(message);
        }
      });
    }
  }

  /**
   * Handle IPC message from main process.
   * @param {Object} message - IPC message.
   * @private
   */
  async handleIPCMessage(message) {
    if (stryMutAct_9fa48("166485")) {
      {}
    } else {
      stryCov_9fa48("166485");
      if (stryMutAct_9fa48("166488") ? !message && !message.type : stryMutAct_9fa48("166487") ? false : stryMutAct_9fa48("166486") ? true : (stryCov_9fa48("166486", "166487", "166488"), (stryMutAct_9fa48("166489") ? message : (stryCov_9fa48("166489"), !message)) || (stryMutAct_9fa48("166490") ? message.type : (stryCov_9fa48("166490"), !message.type)))) {
        if (stryMutAct_9fa48("166491")) {
          {}
        } else {
          stryCov_9fa48("166491");
          return;
        }
      }

      // Handle response to pending request
      if (stryMutAct_9fa48("166494") ? message.type !== IPC_MESSAGE_TYPE.RESPONSE : stryMutAct_9fa48("166493") ? false : stryMutAct_9fa48("166492") ? true : (stryCov_9fa48("166492", "166493", "166494"), message.type === IPC_MESSAGE_TYPE.RESPONSE)) {
        if (stryMutAct_9fa48("166495")) {
          {}
        } else {
          stryCov_9fa48("166495");
          const pending = this.pendingRequests.get(message.messageId);
          if (stryMutAct_9fa48("166497") ? false : stryMutAct_9fa48("166496") ? true : (stryCov_9fa48("166496", "166497"), pending)) {
            if (stryMutAct_9fa48("166498")) {
              {}
            } else {
              stryCov_9fa48("166498");
              clearTimeout(pending.timeout);
              this.pendingRequests.delete(message.messageId);
              pending.resolve(message);
            }
          }
          return;
        }
      }

      // Handle incoming message from MessageRouter
      if (stryMutAct_9fa48("166501") ? message.type !== IPC_MESSAGE_TYPE.INCOMING : stryMutAct_9fa48("166500") ? false : stryMutAct_9fa48("166499") ? true : (stryCov_9fa48("166499", "166500", "166501"), message.type === IPC_MESSAGE_TYPE.INCOMING)) {
        if (stryMutAct_9fa48("166502")) {
          {}
        } else {
          stryCov_9fa48("166502");
          const response = await this.handleIncoming(message);

          // Send response back to main process
          parentPort.postMessage(stryMutAct_9fa48("166503") ? {} : (stryCov_9fa48("166503"), {
            type: IPC_MESSAGE_TYPE.RESPONSE,
            messageId: message.messageId,
            ...response
          }));
        }
      }
    }
  }

  /**
   * Check if the bridge is initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    if (stryMutAct_9fa48("166504")) {
      {}
    } else {
      stryCov_9fa48("166504");
      return this.initialized;
    }
  }

  /**
   * Get the unified address of this worker.
   * @return {string|null} Unified address or null if not set.
   */
  getUnifiedAddress() {
    if (stryMutAct_9fa48("166505")) {
      {}
    } else {
      stryCov_9fa48("166505");
      return this.unifiedAddress;
    }
  }

  /**
   * Get statistics about the message bridge.
   * @return {Object} Bridge statistics.
   */
  getStats() {
    if (stryMutAct_9fa48("166506")) {
      {}
    } else {
      stryCov_9fa48("166506");
      return stryMutAct_9fa48("166507") ? {} : (stryCov_9fa48("166507"), {
        initialized: this.initialized,
        unifiedAddress: this.unifiedAddress,
        pendingRequestCount: this.pendingRequests.size
      });
    }
  }
}
export { IPC_MESSAGE_TYPE, WorkerMessageBridge };