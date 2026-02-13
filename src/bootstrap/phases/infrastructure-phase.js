/**
 * Infrastructure Phase - Delegation adapter.
 *
 * Legacy phase entry point retained for API compatibility.
 * Canonical execution logic is owned by bootstrap phase owners.
 */

import {EventEmitter} from 'events';
import {LoggingService} from '../../logging/logging-service.js';
import {BOOTSTRAP_SUBSYSTEM} from '../bootstrap-constants.js';
import {TYPEOF} from '../../constants/index.js';

/**
 * Phase constants for infrastructure setup.
 */
const INFRASTRUCTURE_PHASE = Object.freeze({
  NAME: 'infrastructure',
  EVENT_START: 'infrastructure:start',
  EVENT_COMPLETE: 'infrastructure:complete',
  EVENT_FAILED: 'infrastructure:failed',
});

const PHASE_ERROR = Object.freeze({
  EXECUTE_OWNER_REQUIRED:
    'InfrastructurePhase requires executeOwner delegation function',
});

/**
 * InfrastructurePhase delegation adapter.
 */
class InfrastructurePhase extends EventEmitter {
  /**
   * @param {Object} options - Phase options.
   * @param {string} [options.nodeId] - Node ID.
   * @param {string} [options.nodeAddress] - Node address.
   * @param {number} [options.wsPort] - WebSocket port.
   * @param {Function} [options.executeOwner] - Canonical owner execute function.
   * @param {Function} [options.cleanupOwner] - Canonical owner cleanup function.
   */
  constructor(options = {}) {
    super();

    this.nodeId = options.nodeId || null;
    this.nodeAddress = options.nodeAddress || null;
    this.wsPort = options.wsPort || null;

    this.executeOwner = typeof options.executeOwner === TYPEOF.FUNCTION ?
      options.executeOwner :
      null;
    this.cleanupOwner = typeof options.cleanupOwner === TYPEOF.FUNCTION ?
      options.cleanupOwner :
      null;

    this.nodeService = null;
    this.messageRouter = null;

    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(BOOTSTRAP_SUBSYSTEM.SERVICE) :
      console;
  }

  /**
   * Execute via canonical owner callback.
   * @return {Promise<Object>} Phase result.
   */
  async execute() {
    const startTime = Date.now();

    this.emit(INFRASTRUCTURE_PHASE.EVENT_START, {
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
        this.nodeService = result.services.nodeService || this.nodeService;
        this.messageRouter = result.services.messageRouter || this.messageRouter;
      }

      const phaseResult = {
        phaseName: result.phaseName || INFRASTRUCTURE_PHASE.NAME,
        duration: typeof result.duration === TYPEOF.NUMBER ?
          result.duration :
          Date.now() - startTime,
        services: result.services || {
          nodeService: this.nodeService,
          messageRouter: this.messageRouter,
        },
        metadata: result.metadata || {
          nodeId: this.nodeId,
          nodeAddress: this.nodeAddress,
          wsPort: this.wsPort,
        },
      };

      this.emit(INFRASTRUCTURE_PHASE.EVENT_COMPLETE, phaseResult);
      return phaseResult;
    } catch (error) {
      this.emit(INFRASTRUCTURE_PHASE.EVENT_FAILED, {
        phaseName: INFRASTRUCTURE_PHASE.NAME,
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
    this.nodeService = null;
  }
}

export {InfrastructurePhase, INFRASTRUCTURE_PHASE};
