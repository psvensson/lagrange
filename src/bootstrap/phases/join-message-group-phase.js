/**
 * Join Message Group Phase - Delegation adapter.
 *
 * Legacy phase entry point retained for API compatibility.
 * Canonical execution logic is owned by joining phase owners.
 */

import {EventEmitter} from 'events';
import {assertCritical} from '../../utils/assert.js';
import {TYPEOF} from '../../constants/index.js';
import {JOINING_DEFAULT} from '../node-joining-constants.js';

/**
 * Phase constants for join message group setup.
 */
const JOIN_MESSAGE_GROUP_PHASE = Object.freeze({
  NAME: 'join_message_group',
  EVENT_START: 'join_message_group:start',
  EVENT_COMPLETE: 'join_message_group:complete',
  EVENT_FAILED: 'join_message_group:failed',
});

const PHASE_ERROR = Object.freeze({
  EXECUTE_OWNER_REQUIRED:
    'JoinMessageGroupPhase requires executeOwner delegation function',
});

/**
 * JoinMessageGroupPhase delegation adapter.
 */
class JoinMessageGroupPhase extends EventEmitter {
  /**
   * @param {Object} options - Phase options.
   * @param {string} options.nodeId - Node ID (required).
   * @param {Object} options.messageRouter - Message router (required).
   * @param {Object} options.bootstrapResponse - Bootstrap response (required).
   * @param {string} [options.seedNodeAddress] - Seed node address.
   * @param {Object} [options.config] - Join config.
   * @param {Function} [options.executeOwner] - Canonical owner execute function.
   * @param {Function} [options.cleanupOwner] - Canonical owner cleanup function.
   */
  constructor(options = {}) {
    super();

    this.nodeId = assertCritical(
      options.nodeId,
      'nodeId is required for JoinMessageGroupPhase',
    );
    this.messageRouter = assertCritical(
      options.messageRouter,
      'messageRouter is required for JoinMessageGroupPhase',
    );
    this.bootstrapResponse = assertCritical(
      options.bootstrapResponse,
      'bootstrapResponse is required for JoinMessageGroupPhase',
    );

    this.seedNodeAddress = options.seedNodeAddress || null;
    this.config = {...JOINING_DEFAULT, ...options.config};

    this.executeOwner = typeof options.executeOwner === TYPEOF.FUNCTION ?
      options.executeOwner :
      null;
    this.cleanupOwner = typeof options.cleanupOwner === TYPEOF.FUNCTION ?
      options.cleanupOwner :
      null;
  }

  /**
   * Execute via canonical owner callback.
   * @return {Promise<Object>} Phase result.
   */
  async execute() {
    const startTime = Date.now();

    this.emit(JOIN_MESSAGE_GROUP_PHASE.EVENT_START, {
      nodeId: this.nodeId,
      strategy: this.bootstrapResponse?.messageGroupAssignment?.strategy,
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
        phaseName: result.phaseName || JOIN_MESSAGE_GROUP_PHASE.NAME,
        duration: typeof result.duration === TYPEOF.NUMBER ?
          result.duration :
          Date.now() - startTime,
        services: result.services || {},
        metadata: result.metadata || {},
      };

      this.emit(JOIN_MESSAGE_GROUP_PHASE.EVENT_COMPLETE, phaseResult);
      return phaseResult;
    } catch (error) {
      this.emit(JOIN_MESSAGE_GROUP_PHASE.EVENT_FAILED, {
        phaseName: JOIN_MESSAGE_GROUP_PHASE.NAME,
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

export {JoinMessageGroupPhase, JOIN_MESSAGE_GROUP_PHASE};
