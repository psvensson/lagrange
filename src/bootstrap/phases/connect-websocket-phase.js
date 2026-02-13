/**
 * Connect WebSocket Phase - Delegation adapter.
 *
 * Legacy phase entry point retained for API compatibility.
 * Canonical execution logic is owned by joining phase owners.
 */

import {EventEmitter} from 'events';
import {assertCritical} from '../../utils/assert.js';
import {TYPEOF} from '../../constants/index.js';
import {JOINING_DEFAULT} from '../node-joining-constants.js';

/**
 * Phase constants for connect websocket setup.
 */
const CONNECT_WEBSOCKET_PHASE = Object.freeze({
  NAME: 'connect_websocket',
  EVENT_START: 'connect_websocket:start',
  EVENT_COMPLETE: 'connect_websocket:complete',
  EVENT_FAILED: 'connect_websocket:failed',
});

const PHASE_ERROR = Object.freeze({
  EXECUTE_OWNER_REQUIRED:
    'ConnectWebSocketPhase requires executeOwner delegation function',
});

/**
 * ConnectWebSocketPhase delegation adapter.
 */
class ConnectWebSocketPhase extends EventEmitter {
  /**
   * @param {Object} options - Phase options.
   * @param {string} options.nodeId - Node ID (required).
   * @param {string} options.nodeAddress - Node address (required).
   * @param {string} options.seedNodeId - Seed node ID (required).
   * @param {string} options.seedNodeWsAddress - Seed node WS address (required).
   * @param {Object} options.bootstrapResponse - Bootstrap response (required).
   * @param {number} [options.wsPort] - Local websocket port.
   * @param {Object} [options.config] - Join config.
   * @param {Function} [options.executeOwner] - Canonical owner execute function.
   * @param {Function} [options.cleanupOwner] - Canonical owner cleanup function.
   */
  constructor(options = {}) {
    super();

    this.nodeId = assertCritical(
      options.nodeId,
      'nodeId is required for ConnectWebSocketPhase',
    );
    this.nodeAddress = assertCritical(
      options.nodeAddress,
      'nodeAddress is required for ConnectWebSocketPhase',
    );
    this.seedNodeId = assertCritical(
      options.seedNodeId,
      'seedNodeId is required for ConnectWebSocketPhase',
    );
    this.seedNodeWsAddress = assertCritical(
      options.seedNodeWsAddress,
      'seedNodeWsAddress is required for ConnectWebSocketPhase',
    );
    this.bootstrapResponse = assertCritical(
      options.bootstrapResponse,
      'bootstrapResponse is required for ConnectWebSocketPhase',
    );

    this.wsPort = options.wsPort ?? null;
    this.config = {...JOINING_DEFAULT, ...options.config};

    this.executeOwner = typeof options.executeOwner === TYPEOF.FUNCTION ?
      options.executeOwner :
      null;
    this.cleanupOwner = typeof options.cleanupOwner === TYPEOF.FUNCTION ?
      options.cleanupOwner :
      null;

    this.messageRouter = null;
    this.controlPlaneTargetAddress = null;
  }

  /**
   * Execute via canonical owner callback.
   * @return {Promise<Object>} Phase result.
   */
  async execute() {
    const startTime = Date.now();

    this.emit(CONNECT_WEBSOCKET_PHASE.EVENT_START, {
      nodeId: this.nodeId,
    });

    try {
      if (typeof this.executeOwner !== TYPEOF.FUNCTION) {
        throw new Error(PHASE_ERROR.EXECUTE_OWNER_REQUIRED);
      }

      const ownerResult = await this.executeOwner(this);
      const result = ownerResult && typeof ownerResult === TYPEOF.OBJECT ?
        ownerResult :
        {};

      const phaseResult = {
        phaseName: result.phaseName || CONNECT_WEBSOCKET_PHASE.NAME,
        duration: typeof result.duration === TYPEOF.NUMBER ?
          result.duration :
          Date.now() - startTime,
        services: result.services || {},
        metadata: result.metadata || {},
      };

      this.emit(CONNECT_WEBSOCKET_PHASE.EVENT_COMPLETE, phaseResult);
      return phaseResult;
    } catch (error) {
      this.emit(CONNECT_WEBSOCKET_PHASE.EVENT_FAILED, {
        phaseName: CONNECT_WEBSOCKET_PHASE.NAME,
        duration: Date.now() - startTime,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Cleanup via canonical owner callback.
   * @return {Promise<void>}
   */
  async cleanup() {
    if (typeof this.cleanupOwner === TYPEOF.FUNCTION) {
      await this.cleanupOwner(this);
    }
    this.messageRouter = null;
    this.controlPlaneTargetAddress = null;
  }
}

export {ConnectWebSocketPhase, CONNECT_WEBSOCKET_PHASE};
