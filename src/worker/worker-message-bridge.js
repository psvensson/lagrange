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

import {EventEmitter} from 'events';
import {parentPort} from 'worker_threads';
import {v4 as uuidv4} from 'uuid';
import {
  WORKER_ERROR_MSG,
  WORKER_EVENT,
  WORKER_LOG_MSG,
  WORKER_RESPONSE_STATUS,
} from './worker-constants.js';

/**
 * IPC message types for communication between worker and main process.
 * Note: REGISTER and UNREGISTER are no longer used - registration is handled
 * by ReplicaWorkerManager in the main process.
 * @type {Readonly<Object>}
 */
const IPC_MESSAGE_TYPE = Object.freeze({
  /** Send message through main process MessageRouter */
  SEND: 'WORKER_SEND',
});

const WORKER_BRIDGE_DELIVERY_RESULT = Object.freeze({
  ACKNOWLEDGED: true,
  STATUS: WORKER_RESPONSE_STATUS.OK,
});

function buildLocalDeliveryAcknowledgment() {
  return {
    acknowledged: WORKER_BRIDGE_DELIVERY_RESULT.ACKNOWLEDGED,
    status: WORKER_BRIDGE_DELIVERY_RESULT.STATUS,
  };
}

/**
 * WorkerMessageBridge provides IPC communication between worker processes
 * and the main process MessageRouter.
 *
 * Each worker process creates one instance of this bridge to:
 * - Send outbound messages to other replicas through the MessageRouter
 *
 * Note: Workers do NOT self-register with MessageRouter, and they do not accept
 * inbound main-thread IPC over `parentPort`. The ReplicaWorkerManager handles
 * registration after successful worker creation, and workers receive incoming
 * messages via piscina task queue (`DELIVER_MESSAGE` operation). `parentPort`
 * is reserved for worker-to-main outbound envelopes only.
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
    super();

    this.logger = options.logger || console;

    /** @type {string|null} Unified address of this worker (set externally) */
    this.unifiedAddress = options.unifiedAddress || null;

    /** @type {Function|null} Handler for incoming messages */
    this.messageHandler = null;

    /** @type {boolean} Whether the bridge is initialized */
    this.initialized = false;
  }

  /**
   * Initialize the message bridge.
   * Sets up the IPC message listener on parentPort.
   * @return {Promise<void>}
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    if (!parentPort) {
      throw new Error(WORKER_ERROR_MSG.NOT_INITIALIZED);
    }

    this.initialized = true;

    this.logger.info(WORKER_LOG_MSG.INITIALIZED);
    this.emit(WORKER_EVENT.INITIALIZED);
  }

  /**
   * Set the unified address for this worker.
   * This is called by the worker service after initialization.
   * @param {string} address - Unified address (nodeId/entityType/replicaId).
   */
  setUnifiedAddress(address) {
    this.unifiedAddress = address;
  }

  /**
   * Send a message through the main process MessageRouter.
   * @param {string} targetAddress - Target unified address.
   * @param {Object} message - Message payload.
   * @return {Promise<Object>} Local delivery acknowledgment.
   * @throws {Error} If not initialized or send fails.
   */
  async send(targetAddress, message) {
    this.sendFireAndForget(targetAddress, message);
    return buildLocalDeliveryAcknowledgment();
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
    this.sendFireAndForget(targetAddress, message);
    return buildLocalDeliveryAcknowledgment();
  }

  /**
   * Send a message without waiting for a response (fire-and-forget).
   * Used for Raft packet routing where the Raft protocol handles retries.
   * @param {string} targetAddress - Target unified address.
   * @param {Object} message - Message payload.
   * @throws {Error} If not initialized.
   */
  sendFireAndForget(targetAddress, message) {
    if (!this.initialized) {
      throw new Error(WORKER_ERROR_MSG.NOT_INITIALIZED);
    }

    if (!this.unifiedAddress) {
      throw new Error(WORKER_ERROR_MSG.ADDRESS_NOT_SET);
    }

    const messageId = uuidv4();
    const correlationId = message.correlationId || uuidv4();

    const envelope = {
      type: IPC_MESSAGE_TYPE.SEND,
      messageId,
      sourceAddress: this.unifiedAddress,
      targetAddress,
      payload: message,
      correlationId,
      timestamp: Date.now(),
    };

    this.logger.debug(WORKER_LOG_MSG.MESSAGE_SENT, {
      messageId,
      targetAddress,
      correlationId,
      fireAndForget: true,
    });

    // Post message without waiting for response
    parentPort.postMessage(envelope);
  }

  /**
   * Handle incoming message from main process.
   * This method is called by the message handler when a message arrives.
   * @param {Object} envelope - Message envelope.
   * @return {Promise<Object>} Response to send back.
   */
  async handleIncoming(envelope) {
    let resultPayload;
    if (this.initialized) {
      this.logger.debug(WORKER_LOG_MSG.MESSAGE_RECEIVED, {
        messageId: envelope.messageId,
        sourceAddress: envelope.sourceAddress,
        correlationId: envelope.correlationId,
      });

      this.emit('message', envelope);

      if (this.messageHandler) {
        resultPayload = await this.messageHandler(envelope);
      }
    }

    return !this.initialized ?
      {
        status: WORKER_RESPONSE_STATUS.ERROR,
        error: WORKER_ERROR_MSG.NOT_INITIALIZED,
      } :
      this.messageHandler ?
        {
          status: WORKER_RESPONSE_STATUS.OK,
          messageId: envelope.messageId,
          correlationId: envelope.correlationId,
          payload: resultPayload,
          timestamp: Date.now(),
        } :
        {
          status: WORKER_RESPONSE_STATUS.OK,
          messageId: envelope.messageId,
          correlationId: envelope.correlationId,
          timestamp: Date.now(),
        };
  }

  /**
   * Set the handler for incoming messages.
   * @param {Function} handler - Message handler function.
   */
  setMessageHandler(handler) {
    this.messageHandler = handler;
  }

  /**
   * Shutdown the message bridge.
   * Cleans up resources.
   * @return {Promise<void>}
   */
  async shutdown() {
    this.initialized = false;
    this.messageHandler = null;

    this.logger.info(WORKER_LOG_MSG.STOPPED);
  }

  /**
   * Check if the bridge is initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    return this.initialized;
  }

  /**
   * Get the unified address of this worker.
   * @return {string|null} Unified address or null if not set.
   */
  getUnifiedAddress() {
    return this.unifiedAddress;
  }

  /**
   * Get statistics about the message bridge.
   * @return {Object} Bridge statistics.
   */
  getStats() {
    return {
      initialized: this.initialized,
      unifiedAddress: this.unifiedAddress,
      pendingRequestCount: 0,
    };
  }
}

export {
  IPC_MESSAGE_TYPE,
  WorkerMessageBridge,
};
