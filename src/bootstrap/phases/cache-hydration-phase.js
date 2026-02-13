/**
 * Cache Hydration Phase - Delegation adapter.
 *
 * Legacy phase entry point retained for API compatibility.
 * Canonical execution logic is owned by bootstrap phase owners.
 */

import {EventEmitter} from 'events';
import {assertCritical} from '../../utils/assert.js';
import {TYPEOF} from '../../constants/index.js';

/**
 * Phase constants for cache hydration.
 */
const CACHE_HYDRATION_PHASE = Object.freeze({
  NAME: 'cache_hydration',
  EVENT_START: 'cache_hydration:start',
  EVENT_COMPLETE: 'cache_hydration:complete',
  EVENT_FAILED: 'cache_hydration:failed',
});

const PHASE_ERROR = Object.freeze({
  EXECUTE_OWNER_REQUIRED:
    'CacheHydrationPhase requires executeOwner delegation function',
});

/**
 * CacheHydrationPhase delegation adapter.
 */
class CacheHydrationPhase extends EventEmitter {
  /**
   * @param {Object} options - Phase options.
   * @param {string} options.nodeId - Node ID (required).
   * @param {Map} options.partitionServices - Partition services (required).
   * @param {Object} options.messageRouter - Message router (required).
   * @param {Function} options.getSystemTableCache - Cache getter (required).
   * @param {Function} options.getLeaderMessageGroupService - Leader getter (required).
   * @param {Function} [options.executeOwner] - Canonical owner execute function.
   * @param {Function} [options.cleanupOwner] - Canonical owner cleanup function.
   */
  constructor(options = {}) {
    super();

    this.nodeId = assertCritical(
      options.nodeId,
      'nodeId is required for CacheHydrationPhase',
    );
    this.partitionServices = assertCritical(
      options.partitionServices,
      'partitionServices is required for CacheHydrationPhase',
    );
    this.messageRouter = assertCritical(
      options.messageRouter,
      'messageRouter is required for CacheHydrationPhase',
    );
    this.getSystemTableCache = assertCritical(
      options.getSystemTableCache,
      'getSystemTableCache is required for CacheHydrationPhase',
    );
    this.getLeaderMessageGroupService = assertCritical(
      options.getLeaderMessageGroupService,
      'getLeaderMessageGroupService is required for CacheHydrationPhase',
    );

    this.executeOwner = typeof options.executeOwner === TYPEOF.FUNCTION ?
      options.executeOwner :
      null;
    this.cleanupOwner = typeof options.cleanupOwner === TYPEOF.FUNCTION ?
      options.cleanupOwner :
      null;

    this.systemTableCache = null;
    this.sqlQueryEngine = null;
  }

  /**
   * Execute via canonical owner callback.
   * @return {Promise<Object>} Phase result.
   */
  async execute() {
    const startTime = Date.now();

    this.emit(CACHE_HYDRATION_PHASE.EVENT_START, {
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

      if (result.services && typeof result.services === TYPEOF.OBJECT) {
        this.systemTableCache = result.services.systemTableCache || this.systemTableCache;
        this.sqlQueryEngine = result.services.sqlQueryEngine || this.sqlQueryEngine;
      }

      const phaseResult = {
        phaseName: result.phaseName || CACHE_HYDRATION_PHASE.NAME,
        duration: typeof result.duration === TYPEOF.NUMBER ?
          result.duration :
          Date.now() - startTime,
        services: result.services || {
          systemTableCache: this.systemTableCache,
          sqlQueryEngine: this.sqlQueryEngine,
        },
        metadata: result.metadata || {},
      };

      this.emit(CACHE_HYDRATION_PHASE.EVENT_COMPLETE, phaseResult);
      return phaseResult;
    } catch (error) {
      this.emit(CACHE_HYDRATION_PHASE.EVENT_FAILED, {
        phaseName: CACHE_HYDRATION_PHASE.NAME,
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
    this.systemTableCache = null;
    this.sqlQueryEngine = null;
  }
}

export {CacheHydrationPhase, CACHE_HYDRATION_PHASE};
