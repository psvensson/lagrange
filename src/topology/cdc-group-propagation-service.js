/**
 * CDCGroupPropagationService - single owner for topology-aware CDC fanout.
 */

import {EventEmitter} from 'events';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {LoggingService} from '../logging/logging-service.js';
import {assertCritical} from '../utils/assert.js';
import {hasDurableCdcEvents, unknownCdcAcceptance} from '../cdc/cdc-delivery-outcome.js';
import {isCdcDeliveryInvocation} from '../cdc/cdc-delivery-invocation.js';
import {propagateDurableCdcEvent} from './cdc-group-propagation-durable-delivery.js';
import {
  LATENCY_PROPAGATION_MODE,
  LATENCY_TOPOLOGY_CONFIG_KEY,
} from './latency-topology-constants.js';
import {
  defineCDCGroupPropagationDeliveryMethods,
} from './cdc-group-propagation-delivery-methods.js';
import {
  defineCDCGroupPropagationLifecycleMethods,
} from './cdc-group-propagation-lifecycle-methods.js';
import {
  CDC_GROUP_PUBLICATION_MODE,
  CDC_GROUP_PROPAGATION_DELIVERY_ERROR,
  CDC_GROUP_PROPAGATION_ERROR_MSG,
  CDC_GROUP_PROPAGATION_LOG_MSG,
  CDC_GROUP_PROPAGATION_REASON,
  CDC_GROUP_PROPAGATION_RETRY,
  CDC_GROUP_PROPAGATION_STATE,
  CDC_GROUP_PROPAGATION_SUBSYSTEM,
} from './cdc-group-propagation-constants.js';
const PUBLICATION_TRANSITION_HISTORY_LIMIT = 10;
class CDCGroupPropagationService extends EventEmitter {
  /**
   * @param {Object} options
   * @param {string} options.nodeId
   * @param {Object} options.systemTableCache
   * @param {Object} options.messageRouter
   * @param {Object} options.latencyTreeService
   * @param {Function} options.nowFn
   */ constructor(options = {}) {
    super();
    this.nodeId = options.nodeId || null;
    this.systemTableCache = options.systemTableCache || null;
    this.messageRouter = options.messageRouter || null;
    this.latencyTreeService = options.latencyTreeService || null;
    this.nowFn = options.nowFn || Date.now;
    this.config = ConfigurationManager.getInstance();
    this.propagationMode =
      this.config.get(LATENCY_TOPOLOGY_CONFIG_KEY.PROPAGATION_MODE) ===
      LATENCY_PROPAGATION_MODE.GROUPED ?
        LATENCY_PROPAGATION_MODE.GROUPED :
        LATENCY_PROPAGATION_MODE.SAFE;
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(CDC_GROUP_PROPAGATION_SUBSYSTEM) :
      console;
    this.state = CDC_GROUP_PROPAGATION_STATE.CREATED;
    this.activeDurablePropagation = null;
    this.durablePropagationLifetime = Object.freeze({});
    this.stats = {
      groupedCount: 0,
      safeCount: 0,
      lastStrategy: null,
      lastMode: null,
      lastFallbackReason: null,
      lastPropagationAt: null,
      lastTargetGroupCount: 0,
    };
    this.deliveryRetryMaxAttempts = this.resolvePositiveInteger(
      options.deliveryRetryMaxAttempts,
      CDC_GROUP_PROPAGATION_RETRY.MAX_ATTEMPTS,
    );
    this.deliveryRetryDelayMs = this.resolvePositiveInteger(
      options.deliveryRetryDelayMs,
      CDC_GROUP_PROPAGATION_RETRY.INITIAL_DELAY_MS,
    );
    this.deliveryRetryBackoffMultiplier = this.resolvePositiveNumber(
      options.deliveryRetryBackoffMultiplier,
      CDC_GROUP_PROPAGATION_RETRY.BACKOFF_MULTIPLIER,
    );
    this.deliveryRetryMaxDelayMs = this.resolvePositiveInteger(
      options.deliveryRetryMaxDelayMs,
      CDC_GROUP_PROPAGATION_RETRY.MAX_DELAY_MS,
    );
    this.retrySleepReleases = new Set();
    this.publicationModeDiagnostics = this.freezePublicationModeDiagnostics({
      currentMode:
        this.propagationMode === LATENCY_PROPAGATION_MODE.GROUPED ?
          CDC_GROUP_PUBLICATION_MODE.GROUPED :
          CDC_GROUP_PUBLICATION_MODE.REPAIR_ONLY,
      reasonCode:
        this.propagationMode === LATENCY_PROPAGATION_MODE.GROUPED ?
          null :
          CDC_GROUP_PROPAGATION_REASON.CONFIG_SAFE_MODE,
      enteredAt: this.toIsoTimestamp(this.now()),
      recentTransitions: [],
    });
  }
  /**
   * Initialize dependencies.
   * @param {Object} options
   */ initialize(options = {}) {
    this.activeDurablePropagation?.context.retire();
    this.durablePropagationLifetime = Object.freeze({});
    if (options.nodeId) {
      this.nodeId = options.nodeId;
    }
    if (options.systemTableCache) {
      this.systemTableCache = options.systemTableCache;
    }
    if (options.messageRouter) {
      this.messageRouter = options.messageRouter;
    }
    if (options.latencyTreeService) {
      this.latencyTreeService = options.latencyTreeService;
    }
    if (options.nowFn) {
      this.nowFn = options.nowFn;
    }
    this.nodeId = assertCritical(this.nodeId, CDC_GROUP_PROPAGATION_ERROR_MSG.MISSING_NODE_ID);
    this.systemTableCache = assertCritical(
      this.systemTableCache,
      CDC_GROUP_PROPAGATION_ERROR_MSG.MISSING_CACHE,
    );
    this.latencyTreeService = assertCritical(
      this.latencyTreeService,
      CDC_GROUP_PROPAGATION_ERROR_MSG.MISSING_TREE_SERVICE,
    );
    this.refreshConfig();
    this.state = CDC_GROUP_PROPAGATION_STATE.INITIALIZED;
    this.logger.info(CDC_GROUP_PROPAGATION_LOG_MSG.INITIALIZED, {
      nodeId: this.nodeId,
      propagationMode: this.propagationMode,
    });
  }
  /**
   * Start propagation lifecycle.
   */ start() {
    this.ensureInitialized();
    this.refreshConfig();
    this.durablePropagationLifetime = Object.freeze({});
    this.state = CDC_GROUP_PROPAGATION_STATE.RUNNING;
    this.logger.info(CDC_GROUP_PROPAGATION_LOG_MSG.STARTED, {
      nodeId: this.nodeId,
      propagationMode: this.propagationMode,
    });
  }
  /**
   * Stop propagation lifecycle.
   */ stop() {
    this.state = CDC_GROUP_PROPAGATION_STATE.STOPPED;
    this.activeDurablePropagation?.context.retire();
    for (const releaseSleep of [...this.retrySleepReleases]) {
      releaseSleep();
    }
    this.logger.info(CDC_GROUP_PROPAGATION_LOG_MSG.STOPPED, {nodeId: this.nodeId});
  }
  /**
   * Propagate one durable partition CDC event through the durable wave
   * (cdc-group-propagation-durable-delivery.js), grouped or safe by config.
   * @param {Object} options - The durable event, its delivery invocation
   *   (`deliveryContext`) and the source message group.
   * @return {Promise<Object>}
   */ async propagateCDCEvent(options = {}) {
    this.ensureInitialized();
    this.assertPropagationRequest(options);
    // A stopped service proposes nothing on the source group and delivers
    // nothing: its answer is the CDC outcome owner's typed unknown.
    if (this.isPropagationStopped()) {
      return {...unknownCdcAcceptance(),
        reason: CDC_GROUP_PROPAGATION_DELIVERY_ERROR.PROPAGATION_STOPPED};
    }
    return propagateDurableCdcEvent(this, options);
  }

  /**
   * The caller's contract: a durable partition event with its delivery
   * invocation, and a source message group with the surface the durable wave
   * reads (its group, consensus port and commit lifetime, the strict forward
   * retry hint, and the batch apply answered with the committed receipt).
   * @param {Object} options
   * @private
   */
  assertPropagationRequest(options) {
    const source = options.sourceMessageGroupService;
    assertCritical(
      source && typeof source.groupId === 'string' && source.groupId.length > 0 &&
        source.raft && typeof source.raft === 'object' &&
        source.cdcCommitLifetime && typeof source.cdcCommitLifetime === 'object' &&
        typeof source.resolveStrictCdcForwardRetryAfterMs === 'function' &&
        typeof source.applyCDCBatch === 'function',
      CDC_GROUP_PROPAGATION_ERROR_MSG.MISSING_MESSAGE_GROUP_SERVICE,
    );
    assertCritical(
      options.tableName && options.operation && options.data,
      CDC_GROUP_PROPAGATION_ERROR_MSG.MISSING_CDC_PAYLOAD,
    );
    assertCritical(
      hasDurableCdcEvents([options]) && isCdcDeliveryInvocation(options.deliveryContext),
      CDC_GROUP_PROPAGATION_ERROR_MSG.MISSING_DURABLE_EVENT,
    );
  }

  /**
   * Refresh propagation mode from centralized config.
   */
  refreshConfig() {
    const value = this.config.get(LATENCY_TOPOLOGY_CONFIG_KEY.PROPAGATION_MODE);
    if (value === LATENCY_PROPAGATION_MODE.GROUPED) {
      const previousPropagationMode = this.propagationMode;
      this.propagationMode = LATENCY_PROPAGATION_MODE.GROUPED;
      if (
        previousPropagationMode !== LATENCY_PROPAGATION_MODE.GROUPED ||
        !this.publicationModeDiagnostics
      ) {
        this.setPublicationMode(
          CDC_GROUP_PUBLICATION_MODE.GROUPED,
          CDC_GROUP_PROPAGATION_REASON.CONFIG_GROUPED_MODE,
        );
      }
      return;
    }
    this.propagationMode = LATENCY_PROPAGATION_MODE.SAFE;
    this.setPublicationMode(
      CDC_GROUP_PUBLICATION_MODE.REPAIR_ONLY,
      CDC_GROUP_PROPAGATION_REASON.CONFIG_SAFE_MODE,
    );
  }

  /**
   * Get the canonical publication-mode diagnostics snapshot.
   * @return {Object}
   */
  getPublicationModeDiagnostics() {
    // The stored diagnostics are always frozen at write time (constructor +
    // setPublicationMode), so this read sits on the readiness hot path with
    // zero per-call allocation (CL-019).
    if (
      this.publicationModeDiagnostics &&
      Array.isArray(this.publicationModeDiagnostics.recentTransitions)
    ) {
      return this.publicationModeDiagnostics;
    }
    return this.freezePublicationModeDiagnostics({
      ...this.publicationModeDiagnostics,
      recentTransitions: Array.isArray(this.publicationModeDiagnostics?.recentTransitions) ?
        this.publicationModeDiagnostics.recentTransitions :
        [],
    });
  }

  /**
   * Get current diagnostics counters.
   * @return {Object}
   */
  getStats() {
    return {
      ...this.stats,
      nodeId: this.nodeId,
      state: this.state,
      propagationMode: this.propagationMode,
      deliveryRetryMaxAttempts: this.deliveryRetryMaxAttempts,
      deliveryRetryDelayMs: this.deliveryRetryDelayMs,
      deliveryRetryBackoffMultiplier: this.deliveryRetryBackoffMultiplier,
      deliveryRetryMaxDelayMs: this.deliveryRetryMaxDelayMs,
      publicationModeDiagnostics: this.getPublicationModeDiagnostics(),
    };
  }

  /**
   * Update the canonical publication-mode diagnostics.
   * @param {string} nextMode
   * @param {string|null} reasonCode
   * @private
   */
  setPublicationMode(nextMode, reasonCode) {
    const current = this.publicationModeDiagnostics;
    if (!nextMode) {
      return;
    }

    if (!current || current.currentMode !== nextMode) {
      const changedAt = this.toIsoTimestamp(this.now());
      const recentTransitions = Array.isArray(current?.recentTransitions) ?
        [...current.recentTransitions] :
        [];

      if (current?.currentMode) {
        recentTransitions.push(
          Object.freeze({
            from: current.currentMode,
            to: nextMode,
            reasonCode: reasonCode || null,
            changedAt,
          }),
        );
      }
      this.publicationModeDiagnostics = this.freezePublicationModeDiagnostics({
        currentMode: nextMode,
        reasonCode: reasonCode || null,
        enteredAt: changedAt,
        recentTransitions: recentTransitions.slice(-PUBLICATION_TRANSITION_HISTORY_LIMIT),
      });
      return;
    }

    if (reasonCode && current.reasonCode !== reasonCode) {
      this.publicationModeDiagnostics = this.freezePublicationModeDiagnostics({
        ...current,
        reasonCode,
      });
    }
  }

  /**
   * Create a read-only publication diagnostics snapshot.
   * @param {Object} diagnostics
   * @return {Object}
   * @private
   */
  freezePublicationModeDiagnostics(diagnostics) {
    const transitions = Array.isArray(diagnostics?.recentTransitions) ?
      diagnostics.recentTransitions.map((entry) => Object.freeze({...entry})) :
      [];
    return Object.freeze({
      currentMode: diagnostics?.currentMode || null,
      reasonCode: diagnostics?.reasonCode || null,
      enteredAt: diagnostics?.enteredAt || null,
      recentTransitions: Object.freeze(transitions),
    });
  }

  /**
   * Ensure lifecycle initialization has happened.
   * @private
   */
  ensureInitialized() {
    assertCritical(
      this.state !== CDC_GROUP_PROPAGATION_STATE.CREATED,
      CDC_GROUP_PROPAGATION_ERROR_MSG.NOT_INITIALIZED,
    );
  }

  /**
   * Current wall-clock time.
   * @return {number}
   * @private
   */
  now() {
    return this.nowFn();
  }

  /**
   * Convert the current clock value to an ISO-8601 timestamp.
   * @param {number} value
   * @return {string}
   * @private
   */
  toIsoTimestamp(value) {
    return new Date(value).toISOString();
  }

  /**
   * Resolve positive integer option with fallback.
   * @param {*} value
   * @param {number} fallback
   * @return {number}
   * @private
   */
  resolvePositiveInteger(value, fallback) {
    if (!Number.isFinite(value)) {
      return fallback;
    }
    const normalized = Math.floor(value);
    if (normalized < 1) {
      return fallback;
    }
    return normalized;
  }

  /**
   * Resolve positive numeric option with fallback.
   * @param {*} value
   * @param {number} fallback
   * @return {number}
   * @private
   */
  resolvePositiveNumber(value, fallback) {
    if (!Number.isFinite(value)) {
      return fallback;
    }
    if (value <= 0) {
      return fallback;
    }
    return value;
  }
}

defineCDCGroupPropagationDeliveryMethods(CDCGroupPropagationService.prototype);
defineCDCGroupPropagationLifecycleMethods(CDCGroupPropagationService.prototype);

export {CDCGroupPropagationService};
