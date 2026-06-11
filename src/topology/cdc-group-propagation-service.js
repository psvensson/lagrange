/**
 * CDCGroupPropagationService - single owner for topology-aware CDC fanout.
 */

import {EventEmitter} from 'events';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {LoggingService} from '../logging/logging-service.js';
import {assertCritical} from '../utils/assert.js';
import {NUM, TYPEOF} from '../constants/index.js';
import {
  LATENCY_PROPAGATION_MODE,
  LATENCY_TOPOLOGY_CONFIG_KEY,
} from './latency-topology-constants.js';
import {
  buildGroupedContext,
  buildSafeTargets,
  resolveKnownMessageGroupIds,
  resolveSourceMessageGroupId,
} from './cdc-group-propagation-routing.js';
import {
  defineCDCGroupPropagationDeliveryMethods,
} from './cdc-group-propagation-delivery-methods.js';
import {
  CDC_GROUP_PUBLICATION_MODE,
  CDC_GROUP_PROPAGATION_ERROR_MSG,
  CDC_GROUP_PROPAGATION_EVENT,
  CDC_GROUP_PROPAGATION_LOG_MSG,
  CDC_GROUP_PROPAGATION_REASON,
  CDC_GROUP_PROPAGATION_RETRY,
  CDC_GROUP_PROPAGATION_STATE,
  CDC_GROUP_PROPAGATION_STRATEGY,
  CDC_GROUP_PROPAGATION_STATUS,
  CDC_GROUP_PROPAGATION_SUBSYSTEM,
} from './cdc-group-propagation-constants.js';
const CDC_GROUP_PROPAGATION_MESSAGE = Object.freeze({STATUS_DELIVERED: 'delivered'});
const MESSAGE_GROUP_REPLICA_SUFFIX = '-r';
const PUBLICATION_TRANSITION_HISTORY_LIMIT = 10;
const IMMEDIATE_BATCH_DELAY_MS = NUM.TEN;
const IMMEDIATE_BATCH_MAX_EVENTS = NUM.SIXTY_FOUR;
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
    this.lastSkippedFanoutSignature = '';
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
    this.stats = {
      groupedCount: NUM.ZERO,
      safeCount: NUM.ZERO,
      fallbackCount: NUM.ZERO,
      groupedDeliveryFailureCount: NUM.ZERO,
      lastStrategy: null,
      lastMode: null,
      lastFallbackReason: null,
      lastPropagationAt: null,
      lastTargetGroupCount: NUM.ZERO,
    };
    this.deliveryRetryMaxAttempts = this.resolvePositiveInteger(
      options.deliveryRetryMaxAttempts,
      CDC_GROUP_PROPAGATION_RETRY.MAX_ATTEMPTS,
    );
    this.backgroundRetryMaxAttempts = this.resolvePositiveInteger(
      options.backgroundRetryMaxAttempts,
      CDC_GROUP_PROPAGATION_RETRY.BACKGROUND_MAX_ATTEMPTS,
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
    this.backgroundRetryTimers = new Set();
    this.backgroundRetryEntriesByKey = new Map();
    this.immediateBatchTimers = new Set();
    this.immediateBatchEntriesByKey = new Map();
    this.immediateBatchDelayMs = this.resolvePositiveInteger(
      options.immediateBatchDelayMs,
      IMMEDIATE_BATCH_DELAY_MS,
    );
    this.immediateBatchMaxEvents = this.resolvePositiveInteger(
      options.immediateBatchMaxEvents,
      IMMEDIATE_BATCH_MAX_EVENTS,
    );
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
    this.clearBackgroundRetryTimers();
    this.clearImmediateBatchTimers();
    this.logger.info(CDC_GROUP_PROPAGATION_LOG_MSG.STOPPED, {nodeId: this.nodeId});
  }
  /**
   * Propagate one CDC event through grouped mode or safe mode.
   * @param {Object} options
   * @param {string} options.tableName
   * @param {string} options.operation
   * @param {Object} options.data
   * @param {Object} options.sourceMessageGroupService
   * @return {Promise<Object>}
   */ async propagateCDCEvent(options = {}) {
    this.ensureInitialized();
    const tableName = options.tableName;
    const operation = options.operation;
    const data = options.data;
    const sourceMessageGroupService = options.sourceMessageGroupService;
    assertCritical(
      sourceMessageGroupService &&
        typeof sourceMessageGroupService.applyCDCEvent === TYPEOF.FUNCTION,
      CDC_GROUP_PROPAGATION_ERROR_MSG.MISSING_MESSAGE_GROUP_SERVICE,
    );
    assertCritical(
      tableName && operation && data,
      CDC_GROUP_PROPAGATION_ERROR_MSG.MISSING_CDC_PAYLOAD,
    );
    this.refreshConfig();
    if (this.propagationMode !== LATENCY_PROPAGATION_MODE.GROUPED) {
      this.setPublicationMode(
        CDC_GROUP_PUBLICATION_MODE.REPAIR_ONLY,
        CDC_GROUP_PROPAGATION_REASON.CONFIG_SAFE_MODE,
      );
      return this.propagateSafe({
        tableName,
        operation,
        data,
        sourceMessageGroupService,
        fallbackReason: CDC_GROUP_PROPAGATION_REASON.CONFIG_SAFE_MODE,
      });
    }
    const groupedContext = buildGroupedContext({
      nodeId: this.nodeId,
      systemTableCache: this.systemTableCache,
      messageRouter: this.messageRouter,
      latencyTreeService: this.latencyTreeService,
    });
    if (groupedContext.fallbackReason) {
      this.setPublicationMode(
        CDC_GROUP_PUBLICATION_MODE.CONSERVATIVE_FANOUT,
        groupedContext.fallbackReason,
      );
      return this.propagateSafe({
        tableName,
        operation,
        data,
        sourceMessageGroupService,
        fallbackReason: groupedContext.fallbackReason,
      });
    }
    await sourceMessageGroupService.applyCDCEvent(tableName, operation, data);
    const groupedDeliveryFailures = await this.deliverToTargetsWithRetry({
      tableName,
      operation,
      data,
      sourceGroupId: groupedContext.sourceGroupId,
      targets: groupedContext.targets,
    });
    const groupedFailureCount = groupedDeliveryFailures.length;
    const fallbackRecovery =
      groupedFailureCount > NUM.ZERO ?
        await this.recoverGroupedDeliveryFailuresWithSafeFanout({
          tableName,
          operation,
          data,
          sourceGroupId: groupedContext.sourceGroupId,
          deliveryFailures: groupedDeliveryFailures,
        }) :
        {deliveryFailures: groupedDeliveryFailures, fallbackUsed: false};
    const deliveryFailures = fallbackRecovery.deliveryFailures;
    const fallbackUsed = fallbackRecovery.fallbackUsed === true;
    const timestamp = this.now();
    this.stats.groupedCount += NUM.ONE;
    this.stats.lastStrategy = CDC_GROUP_PROPAGATION_STRATEGY.GROUP_COORDINATOR;
    this.stats.lastMode = CDC_GROUP_PROPAGATION_STATUS.GROUPED;
    this.stats.lastFallbackReason = fallbackUsed ?
      CDC_GROUP_PROPAGATION_REASON.GROUPED_DELIVERY_FAILURE :
      null;
    this.stats.lastPropagationAt = timestamp;
    this.stats.lastTargetGroupCount = groupedContext.targets.length;
    if (groupedFailureCount > NUM.ZERO) {
      this.stats.groupedDeliveryFailureCount += groupedFailureCount;
      this.setPublicationMode(
        CDC_GROUP_PUBLICATION_MODE.CONSERVATIVE_FANOUT,
        CDC_GROUP_PROPAGATION_REASON.GROUPED_DELIVERY_FAILURE,
      );
      this.logger.warn(CDC_GROUP_PROPAGATION_LOG_MSG.GROUPED_DELIVERY_FAILED, {
        nodeId: this.nodeId,
        tableName,
        operation,
        failureCount: groupedFailureCount,
        recoveredCount: groupedFailureCount - deliveryFailures.length,
        unresolvedCount: deliveryFailures.length,
      });
    } else {
      this.setPublicationMode(
        CDC_GROUP_PUBLICATION_MODE.GROUPED,
        CDC_GROUP_PROPAGATION_REASON.GROUPED_DELIVERY_RECOVERED,
      );
    }
    const result = {
      success: deliveryFailures.length === NUM.ZERO,
      strategy: CDC_GROUP_PROPAGATION_STRATEGY.GROUP_COORDINATOR,
      mode: CDC_GROUP_PROPAGATION_STATUS.GROUPED,
      status: CDC_GROUP_PROPAGATION_MESSAGE.STATUS_DELIVERED,
      sourceGroupId: groupedContext.sourceGroupId,
      targetGroupCount: groupedContext.targets.length,
      deliveryFailures,
      fallbackReason: fallbackUsed ? CDC_GROUP_PROPAGATION_REASON.GROUPED_DELIVERY_FAILURE : null,
      fallbackStrategy: fallbackUsed ? CDC_GROUP_PROPAGATION_STRATEGY.DIRECT_FANOUT : null,
      timestamp,
    };
    this.emit(CDC_GROUP_PROPAGATION_EVENT.PROPAGATED, result);
    this.logger.debug(CDC_GROUP_PROPAGATION_LOG_MSG.PROPAGATED_GROUPED, {
      nodeId: this.nodeId,
      tableName,
      operation,
      strategy: CDC_GROUP_PROPAGATION_STRATEGY.GROUP_COORDINATOR,
      sourceGroupId: groupedContext.sourceGroupId,
      targetGroupCount: groupedContext.targets.length,
      deliveryFailureCount: deliveryFailures.length,
    });
    return result;
  }
  /**
   * Make the fan-out's silent drop class observable (CL-014): when message
   * groups are KNOWN to the cache but excluded from the resolved targets
   * (not yet ACTIVE-with-address), every event sent meanwhile is lost to
   * those groups with no replay. Transition-logged: one warn per change of
   * the skipped-group set, not per event.
   * @param {Array<Object>} targets - Resolved fan-out targets.
   * @param {string|null} sourceGroupId
   * @param {string} tableName - Table of the triggering event (context).
   * @return {void}
   * @private
   */
  recordSkippedFanoutGroups(targets, sourceGroupId, tableName) {
    const knownGroupIds = resolveKnownMessageGroupIds({
      systemTableCache: this.systemTableCache,
      messageGroupReplicaSuffix: MESSAGE_GROUP_REPLICA_SUFFIX,
    });
    const targetGroupIds = new Set(
      (targets || []).map((target) => target.groupId),
    );
    const skippedGroupIds = [...knownGroupIds]
      .filter(
        (groupId) =>
          groupId !== sourceGroupId && !targetGroupIds.has(groupId),
      )
      .sort();
    const signature = skippedGroupIds.join(',');
    if (signature === this.lastSkippedFanoutSignature) {
      return;
    }
    this.lastSkippedFanoutSignature = signature;
    if (skippedGroupIds.length === NUM.ZERO) {
      return;
    }
    this.logger.warn(
      CDC_GROUP_PROPAGATION_LOG_MSG.FANOUT_SKIPPING_KNOWN_GROUPS,
      {
        nodeId: this.nodeId,
        tableName,
        skippedGroupIds,
        targetGroupCount: targetGroupIds.size,
      },
    );
  }

  /**
   * Apply canonical safe propagation path.
   * @param {Object} options
   * @return {Promise<Object>}
   * @private
   */ async propagateSafe(options) {
    await options.sourceMessageGroupService.applyCDCEvent(
      options.tableName,
      options.operation,
      options.data,
    );
    const sourceGroupId = resolveSourceMessageGroupId(options.sourceMessageGroupService);
    const safeTargets = buildSafeTargets({
      sourceGroupId,
      systemTableCache: this.systemTableCache,
      messageGroupReplicaSuffix: MESSAGE_GROUP_REPLICA_SUFFIX,
    });
    this.recordSkippedFanoutGroups(safeTargets, sourceGroupId, options.tableName);
    const deliveryFailures = await this.deliverToTargetsWithRetry({
      tableName: options.tableName,
      operation: options.operation,
      data: options.data,
      sourceGroupId,
      targets: safeTargets,
    });
    const timestamp = this.now();
    this.stats.safeCount += NUM.ONE;
    this.stats.lastStrategy = CDC_GROUP_PROPAGATION_STRATEGY.DIRECT_FANOUT;
    this.stats.lastMode = CDC_GROUP_PROPAGATION_STATUS.SAFE;
    this.stats.lastFallbackReason = options.fallbackReason || null;
    this.stats.lastPropagationAt = timestamp;
    this.stats.lastTargetGroupCount = safeTargets.length;
    if (options.fallbackReason) {
      this.recordSafeFallback(options.fallbackReason, {
        tableName: options.tableName,
        operation: options.operation,
      });
    }
    this.logger.debug(CDC_GROUP_PROPAGATION_LOG_MSG.PROPAGATED_SAFE, {
      nodeId: this.nodeId,
      tableName: options.tableName,
      operation: options.operation,
      strategy: CDC_GROUP_PROPAGATION_STRATEGY.DIRECT_FANOUT,
    });
    return {
      success: deliveryFailures.length === NUM.ZERO,
      strategy: CDC_GROUP_PROPAGATION_STRATEGY.DIRECT_FANOUT,
      mode: CDC_GROUP_PROPAGATION_STATUS.SAFE,
      status: CDC_GROUP_PROPAGATION_MESSAGE.STATUS_DELIVERED,
      sourceGroupId,
      targetGroupCount: safeTargets.length,
      deliveryFailures,
      fallbackReason: options.fallbackReason || null,
      timestamp,
    };
  }
  /**
   * Re-drive grouped delivery misses through the conservative direct-fanout
   * path so control-plane metadata converges under coordinator instability.
   * @param {Object} options
   * @return {Promise<{deliveryFailures:Array<Object>, fallbackUsed:boolean}>}
   * @private
   */ async recoverGroupedDeliveryFailuresWithSafeFanout(options) {
    const originalFailures = Array.isArray(options.deliveryFailures) ?
      options.deliveryFailures :
      [];
    let deliveryFailures = originalFailures;
    let fallbackUsed = false;
    if (originalFailures.length > NUM.ZERO) {
      const failedGroupIds = new Set();
      const unresolvedFailures = [];
      for (const failure of originalFailures) {
        const groupId = failure?.targetGroupId;
        if (typeof groupId === TYPEOF.STRING && groupId.length > NUM.ZERO) {
          failedGroupIds.add(groupId);
          continue;
        }
        unresolvedFailures.push(failure);
      }
      if (failedGroupIds.size > NUM.ZERO) {
        const safeTargets = buildSafeTargets({
          sourceGroupId: options.sourceGroupId,
          systemTableCache: this.systemTableCache,
          messageGroupReplicaSuffix: MESSAGE_GROUP_REPLICA_SUFFIX,
        }).filter((target) => failedGroupIds.has(target.groupId));
        if (safeTargets.length > NUM.ZERO) {
          this.recordSafeFallback(CDC_GROUP_PROPAGATION_REASON.GROUPED_DELIVERY_FAILURE, {
            tableName: options.tableName,
            operation: options.operation,
            failedGroupCount: failedGroupIds.size,
          });
          const recoveredFailures = await this.deliverToTargetsWithRetry({
            tableName: options.tableName,
            operation: options.operation,
            data: options.data,
            sourceGroupId: options.sourceGroupId,
            targets: safeTargets,
            allowDeferToExistingRetry: false,
          });
          const failuresByKey = new Map();
          let unkeyedCounter = NUM.ZERO;
          const targetedGroupIds = new Set(safeTargets.map((target) => target.groupId));
          for (const failure of unresolvedFailures) {
            failuresByKey.set(`unkeyed-${unkeyedCounter++}`, failure);
          }
          for (const failure of originalFailures) {
            const groupId = failure?.targetGroupId;
            if (
              typeof groupId === TYPEOF.STRING &&
              groupId.length > NUM.ZERO &&
              !targetedGroupIds.has(groupId)
            ) {
              failuresByKey.set(groupId, failure);
            }
          }
          for (const failure of recoveredFailures) {
            const groupId = failure?.targetGroupId;
            if (typeof groupId === TYPEOF.STRING && groupId.length > NUM.ZERO) {
              failuresByKey.set(groupId, failure);
            } else {
              failuresByKey.set(`recovered-unkeyed-${unkeyedCounter++}`, failure);
            }
          }
          deliveryFailures = [...failuresByKey.values()];
          fallbackUsed = true;
        }
      }
    }
    return this.buildGroupedDeliveryRecoveryResult(deliveryFailures, fallbackUsed);
  }
  buildGroupedDeliveryRecoveryResult(deliveryFailures, fallbackUsed) {
    return {deliveryFailures, fallbackUsed};
  }
  /**
   * Emit diagnostics for one direct-fanout fallback decision.
   * @param {string} reason
   * @param {Object} context
   * @private
   */ recordSafeFallback(reason, context = {}) {
    this.stats.fallbackCount += NUM.ONE;
    this.emit(CDC_GROUP_PROPAGATION_EVENT.SAFE_FALLBACK, {
      reason,
      tableName: context.tableName,
      operation: context.operation,
    });
    const fallbackLogContext = {
      nodeId: this.nodeId,
      tableName: context.tableName,
      operation: context.operation,
      strategy: CDC_GROUP_PROPAGATION_STRATEGY.DIRECT_FANOUT,
      reason,
    };
    if (Number.isInteger(context.failedGroupCount) && context.failedGroupCount > NUM.ZERO) {
      fallbackLogContext.failedGroupCount = context.failedGroupCount;
    }

    if (reason === CDC_GROUP_PROPAGATION_REASON.CONFIG_SAFE_MODE) {
      this.logger.debug(CDC_GROUP_PROPAGATION_LOG_MSG.SAFE_FALLBACK, fallbackLogContext);
      return;
    }
    this.logger.warn(CDC_GROUP_PROPAGATION_LOG_MSG.SAFE_FALLBACK, fallbackLogContext);
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
    if (normalized < NUM.ONE) {
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
    if (value <= NUM.ZERO) {
      return fallback;
    }
    return value;
  }
}

defineCDCGroupPropagationDeliveryMethods(CDCGroupPropagationService.prototype);

export {CDCGroupPropagationService};
