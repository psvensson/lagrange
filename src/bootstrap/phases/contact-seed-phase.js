/**
 * Contact Seed Phase - Delegation adapter.
 *
 * Legacy phase entry point retained for API compatibility.
 * Canonical execution logic is owned by joining phase owners.
 */

import {EventEmitter} from 'events';
import {assertCritical} from '../../utils/assert.js';
import {TYPEOF} from '../../constants/index.js';
import {JOINING_DEFAULT} from '../node-joining-constants.js';

/**
 * Phase constants for contact seed setup.
 */
const CONTACT_SEED_PHASE = Object.freeze({
  NAME: 'contact_seed',
  EVENT_START: 'contact_seed:start',
  EVENT_COMPLETE: 'contact_seed:complete',
  EVENT_FAILED: 'contact_seed:failed',
});

const PHASE_ERROR = Object.freeze({
  EXECUTE_OWNER_REQUIRED:
    'ContactSeedPhase requires executeOwner delegation function',
});

/**
 * ContactSeedPhase delegation adapter.
 */
class ContactSeedPhase extends EventEmitter {
  /**
   * @param {Object} options - Phase options.
   * @param {string} options.nodeId - Node ID (required).
   * @param {string} options.nodeAddress - Node address (required).
   * @param {string} options.seedNodeAddress - Seed address (required).
   * @param {string} [options.seedNodeWsAddress] - Seed WebSocket address.
   * @param {Object} [options.config] - Join config.
   * @param {Function} [options.executeOwner] - Canonical owner execute function.
   * @param {Function} [options.cleanupOwner] - Canonical owner cleanup function.
   */
  constructor(options = {}) {
    super();

    this.nodeId = assertCritical(
      options.nodeId,
      'nodeId is required for ContactSeedPhase',
    );
    this.nodeAddress = assertCritical(
      options.nodeAddress,
      'nodeAddress is required for ContactSeedPhase',
    );
    this.seedNodeAddress = assertCritical(
      options.seedNodeAddress,
      'seedNodeAddress is required for ContactSeedPhase',
    );

    this.seedNodeWsAddress = options.seedNodeWsAddress || null;
    this.config = {...JOINING_DEFAULT, ...options.config};

    this.executeOwner = typeof options.executeOwner === TYPEOF.FUNCTION ?
      options.executeOwner :
      null;
    this.cleanupOwner = typeof options.cleanupOwner === TYPEOF.FUNCTION ?
      options.cleanupOwner :
      null;

    this.bootstrapResponse = null;
    this.seedNodeId = null;
  }

  /**
   * Execute via canonical owner callback.
   * @return {Promise<Object>} Phase result.
   */
  async execute() {
    const startTime = Date.now();

    this.emit(CONTACT_SEED_PHASE.EVENT_START, {
      nodeId: this.nodeId,
      seedNodeAddress: this.seedNodeAddress,
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
        phaseName: result.phaseName || CONTACT_SEED_PHASE.NAME,
        duration: typeof result.duration === TYPEOF.NUMBER ?
          result.duration :
          Date.now() - startTime,
        services: result.services || {},
        metadata: result.metadata || {},
      };

      this.emit(CONTACT_SEED_PHASE.EVENT_COMPLETE, phaseResult);
      return phaseResult;
    } catch (error) {
      this.emit(CONTACT_SEED_PHASE.EVENT_FAILED, {
        phaseName: CONTACT_SEED_PHASE.NAME,
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
    this.bootstrapResponse = null;
    this.seedNodeId = null;
  }
}

export {ContactSeedPhase, CONTACT_SEED_PHASE};
