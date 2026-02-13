/**
 * Message Group Phase - Delegation adapter.
 *
 * Legacy phase entry point retained for API compatibility.
 * Canonical execution logic is owned by bootstrap phase owners.
 */

import {EventEmitter} from 'events';
import {assertCritical} from '../../utils/assert.js';
import {TYPEOF} from '../../constants/index.js';

/**
 * Phase constants for message group setup.
 */
const MESSAGE_GROUP_PHASE = Object.freeze({
  NAME: 'message_groups',
  EVENT_START: 'message_groups:start',
  EVENT_COMPLETE: 'message_groups:complete',
  EVENT_FAILED: 'message_groups:failed',
});

const PHASE_ERROR = Object.freeze({
  EXECUTE_OWNER_REQUIRED:
    'MessageGroupPhase requires executeOwner delegation function',
});

/**
 * MessageGroupPhase delegation adapter.
 */
class MessageGroupPhase extends EventEmitter {
  /**
   * @param {Object} options - Phase options.
   * @param {string} options.nodeId - Node ID (required).
   * @param {Object} options.messageRouter - Message router (required).
   * @param {Object} [options.workerManager] - Worker manager for worker-mode checks.
   * @param {Function} [options.executeOwner] - Canonical owner execute function.
   * @param {Function} [options.cleanupOwner] - Canonical owner cleanup function.
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

    this.workerManager = options.workerManager || null;
    this.executeOwner = typeof options.executeOwner === TYPEOF.FUNCTION ?
      options.executeOwner :
      null;
    this.cleanupOwner = typeof options.cleanupOwner === TYPEOF.FUNCTION ?
      options.cleanupOwner :
      null;
  }

  /**
   * Worker-mode compatibility check used by existing tests.
   * @return {boolean} True when worker mode is available.
   */
  shouldUseWorkerProcesses() {
    return this.workerManager !== null && this.workerManager.isInitialized();
  }

  /**
   * Execute via canonical owner callback.
   * @return {Promise<Object>} Phase result.
   */
  async execute() {
    const startTime = Date.now();

    this.emit(MESSAGE_GROUP_PHASE.EVENT_START, {
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
        phaseName: result.phaseName || MESSAGE_GROUP_PHASE.NAME,
        duration: typeof result.duration === TYPEOF.NUMBER ?
          result.duration :
          Date.now() - startTime,
        services: result.services || {},
        metadata: result.metadata || {},
      };

      this.emit(MESSAGE_GROUP_PHASE.EVENT_COMPLETE, phaseResult);
      return phaseResult;
    } catch (error) {
      this.emit(MESSAGE_GROUP_PHASE.EVENT_FAILED, {
        phaseName: MESSAGE_GROUP_PHASE.NAME,
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
  }
}

export {MessageGroupPhase, MESSAGE_GROUP_PHASE};
