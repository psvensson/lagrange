/**
 * Unified reconciliation owner for desired-vs-actual service state.
 */

import {EventEmitter} from 'node:events';
import {LoggingService} from '../logging/logging-service.js';
import {
  SERVICE_DESCRIPTOR_FIELD,
  SUBSYSTEM,
} from '../constants/index.js';
import {ServiceLifecycleManager} from './service-lifecycle-manager.js';
import {ServicePolicyViolationError} from './service-lifecycle-errors.js';
import {
  DEFAULT_DECISION_HISTORY_LIMIT,
  LOCAL_NUM_ONE,
  LOCAL_NUM_ZERO,
  LOCAL_STR_INTERVAL,
  LOCAL_STR_RECONCILE,
  LOCAL_STR_STARTUP,
  MAX_DECISION_HISTORY_LIMIT,
  RECONCILER_ACTION_TYPE,
  RECONCILER_DRIFT_REASON,
  RECONCILER_ERROR,
  RECONCILER_EVENT,
  RECONCILER_LOG,
  RECONCILER_POLICY_TYPE,
  SERVICE_RECONCILER_DEFAULT,
  defaultPlacementPolicyCheck,
  resolveReplicaId,
  resolveRuntimeKind,
  resolveServiceId,
  resolveServiceType,
} from './service-reconciler-contract.js';
import {planReconcilerActions} from './service-reconciler-planner.js';

/**
 * ServiceReconciler computes drift and converges state using one lifecycle owner.
 */
class ServiceReconciler extends EventEmitter {
  /**
   * @param {Object} options
   * @param {ServiceLifecycleManager} options.lifecycleManager
   * @param {Function} options.desiredStateReader
   * @param {Function} options.actualStateReader
   * @param {number} [options.checkIntervalMs]
   * @param {number} [options.maxConcurrentServiceActions]
   * @param {EventEmitter} [options.eventSource]
   * @param {string[]} [options.eventNames]
   * @param {Function|null} [options.telemetrySink]
   * @param {Object} [options.logger]
   */
  constructor(options = {}) {
    super();

    if (!(options.lifecycleManager instanceof ServiceLifecycleManager)) {
      throw new TypeError(RECONCILER_ERROR.LIFECYCLE_MANAGER_REQUIRED);
    }
    if (typeof options.desiredStateReader !== 'function') {
      throw new TypeError(RECONCILER_ERROR.DESIRED_STATE_READER_REQUIRED);
    }
    if (typeof options.actualStateReader !== 'function') {
      throw new TypeError(RECONCILER_ERROR.ACTUAL_STATE_READER_REQUIRED);
    }

    const checkIntervalMs = options.checkIntervalMs ||
      SERVICE_RECONCILER_DEFAULT.CHECK_INTERVAL_MS;
    if (!Number.isFinite(checkIntervalMs) || checkIntervalMs <= LOCAL_NUM_ZERO) {
      throw new TypeError(RECONCILER_ERROR.INTERVAL_REQUIRED);
    }
    const maxConcurrentServiceActions =
      options.maxConcurrentServiceActions ??
      SERVICE_RECONCILER_DEFAULT.MAX_CONCURRENT_SERVICE_ACTIONS;
    if (!Number.isFinite(maxConcurrentServiceActions) ||
      maxConcurrentServiceActions <= LOCAL_NUM_ZERO) {
      throw new TypeError(RECONCILER_ERROR.MAX_CONCURRENT_ACTIONS_REQUIRED);
    }

    if (options.telemetrySink !== undefined &&
      options.telemetrySink !== null &&
      typeof options.telemetrySink !== 'function') {
      throw new TypeError(RECONCILER_ERROR.TELEMETRY_SINK_REQUIRED);
    }

    if (options.eventSource) {
      if (typeof options.eventSource.on !== 'function' ||
        typeof options.eventSource.off !== 'function') {
        throw new TypeError(RECONCILER_ERROR.EVENT_SOURCE_REQUIRED);
      }
    }
    if (options.placementPolicyCheck !== undefined &&
      typeof options.placementPolicyCheck !== 'function') {
      throw new TypeError(RECONCILER_ERROR.PLACEMENT_POLICY_CHECK_REQUIRED);
    }

    /** @type {ServiceLifecycleManager} */
    this._lifecycleManager = options.lifecycleManager;

    /** @type {Function} */
    this._desiredStateReader = options.desiredStateReader;

    /** @type {Function} */
    this._actualStateReader = options.actualStateReader;

    /** @type {number} */
    this._checkIntervalMs = checkIntervalMs;

    /** @type {number} */
    this._maxConcurrentServiceActions = Math.floor(maxConcurrentServiceActions);

    /** @type {EventEmitter|null} */
    this._eventSource = options.eventSource || null;

    /** @type {string[]} */
    this._eventNames = options.eventNames || [];
    for (const eventName of this._eventNames) {
      if (typeof eventName !== 'string' || eventName.length === LOCAL_NUM_ZERO) {
        throw new TypeError(RECONCILER_ERROR.EVENT_NAME_REQUIRED);
      }
    }

    /** @type {Function|null} */
    this._telemetrySink = options.telemetrySink || null;

    /** @type {Function} */
    this._placementPolicyCheck =
      options.placementPolicyCheck || defaultPlacementPolicyCheck;

    /** @type {Object} */
    this._logger = options.logger || this._initLogger();

    /** @type {Map<string, Function>} */
    this._eventHandlers = new Map();

    /** @type {NodeJS.Timeout|null} */
    this._interval = null;

    /** @type {boolean} */
    this._running = false;

    /** @type {boolean} */
    this._rerunRequested = false;

    /** @type {{reason: string, metadata: Object}|null} */
    this._pendingTrigger = null;

    this._stats = {
      cycleCount: LOCAL_NUM_ZERO,
      cycleSuccessCount: LOCAL_NUM_ZERO,
      cycleFailureCount: LOCAL_NUM_ZERO,
      actionCount: LOCAL_NUM_ZERO,
      actionSuccessCount: LOCAL_NUM_ZERO,
      actionFailureCount: LOCAL_NUM_ZERO,
      lastCycleDurationMs: LOCAL_NUM_ZERO,
      cycleLatencyMsTotal: LOCAL_NUM_ZERO,
      cycleLatencyMsMax: LOCAL_NUM_ZERO,
      lastActionDurationMs: LOCAL_NUM_ZERO,
      actionLatencyMsTotal: LOCAL_NUM_ZERO,
      actionLatencyMsMax: LOCAL_NUM_ZERO,
      lastCycleAt: null,
      lastCycleReason: null,
      lastError: null,
    };

    /** @type {Object[]} */
    this._decisionHistory = [];
  }

  /**
   * @return {Object}
   * @private
   */
  _initLogger() {
    try {
      const loggingService = LoggingService.getInstance();
      if (loggingService.isInitialized()) {
        return loggingService.forSubsystem(SUBSYSTEM.SERVICE_LIFECYCLE);
      }
    } catch {
      // Logging service may not be initialized in unit tests.
    }
    return console;
  }

  /**
   * Start periodic and event-driven reconciliation.
   *
   * @return {Promise<void>}
   */
  async start() {
    if (this._interval) {
      return;
    }

    this._interval = setInterval(() => {
      this.trigger(LOCAL_STR_INTERVAL);
    }, this._checkIntervalMs);

    this._bindEventTriggers();
    await this.trigger(LOCAL_STR_STARTUP);
  }

  /**
   * Stop periodic and event-driven reconciliation.
   */
  stop() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }

    this._unbindEventTriggers();
  }

  /**
   * Trigger a reconciliation cycle.
   *
   * @param {string} reason
   * @param {Object} [metadata]
   * @return {Promise<void>}
   */
  async trigger(reason, metadata = {}) {
    if (this._running) {
      this._rerunRequested = true;
      this._pendingTrigger = {reason, metadata};
      return;
    }

    await this._runCycle(reason, metadata);
  }

  /**
   * Get immutable reconciliation stats.
   *
   * @return {Object}
   */
  getStats() {
    return {...this._stats};
  }

  /**
   * @param {number} [limit]
   * @return {Object[]}
   */
  getDecisionHistory(limit = DEFAULT_DECISION_HISTORY_LIMIT) {
    const boundedLimit = Number.isFinite(limit) ?
      Math.max(1, Math.min(MAX_DECISION_HISTORY_LIMIT, Math.floor(limit))) :
      DEFAULT_DECISION_HISTORY_LIMIT;
    return this._decisionHistory
      .slice(-boundedLimit)
      .map((decision) => ({
        timestamp: decision.timestamp,
        reason: decision.reason,
        metadata: decision.metadata,
        action: decision.action,
        success: decision.success,
        durationMs: decision.durationMs || LOCAL_NUM_ZERO,
        operationId: decision.operationId || null,
        error: decision.error || null,
      }));
  }

  /**
   * @param {Object} [options]
   * @param {number} [options.limit]
   * @return {Object}
   */
  getDiagnosticsReport(options = {}) {
    return {
      stats: this.getStats(),
      recentDecisions: this.getDecisionHistory(options.limit),
      lifecycleAdapterSelections:
        this._lifecycleManager.getAdapterSelectionReport ?
          this._lifecycleManager.getAdapterSelectionReport() :
          {adapters: []},
    };
  }

  /**
   * @param {Object} decision
   * @return {void}
   * @private
   */
  _recordDecisionHistory(decision) {
    this._decisionHistory.push({
      timestamp: decision.timestamp,
      reason: decision.reason,
      metadata: decision.metadata,
      action: decision.action,
      success: decision.success,
      durationMs: decision.durationMs || LOCAL_NUM_ZERO,
      operationId: decision.result?.operationId || null,
      error: decision.error ? decision.error.message : null,
    });
    if (this._decisionHistory.length > MAX_DECISION_HISTORY_LIMIT) {
      this._decisionHistory.shift();
    }
  }

  /**
   * Run one desired-vs-actual reconciliation cycle.
   *
   * @param {string} reason
   * @param {Object} metadata
   * @return {Promise<void>}
   * @private
   */
  async _runCycle(reason, metadata) {
    this._running = true;

    try {
      let nextReason = reason;
      let nextMetadata = metadata;

      do {
        this._rerunRequested = false;
        this._pendingTrigger = null;

        const cycleStartedAt = Date.now();
        this._logger.debug(RECONCILER_LOG.CYCLE_START, {
          reason: nextReason,
          metadata: nextMetadata,
          nodeId: nextMetadata?.nodeId || null,
        });
        this.emit(RECONCILER_EVENT.CYCLE_START, {
          reason: nextReason,
          metadata: nextMetadata,
        });

        const desiredRows = await this._desiredStateReader();
        const actualRows = await this._actualStateReader();

        const actions = this.planActions(desiredRows, actualRows);
        this.emit(RECONCILER_EVENT.PLAN_READY, {
          reason: nextReason,
          metadata: nextMetadata,
          actionCount: actions.length,
          actions,
        });

        const execution = await this.executePlan(actions, {
          reason: nextReason,
          metadata: nextMetadata,
        });

        const durationMs = Date.now() - cycleStartedAt;
        this._stats.cycleCount += LOCAL_NUM_ONE;
        this._stats.cycleSuccessCount += LOCAL_NUM_ONE;
        this._stats.lastCycleDurationMs = durationMs;
        this._stats.cycleLatencyMsTotal += durationMs;
        this._stats.cycleLatencyMsMax = Math.max(
          this._stats.cycleLatencyMsMax,
          durationMs,
        );
        this._stats.lastCycleAt = Date.now();
        this._stats.lastCycleReason = nextReason;
        this._stats.lastError = null;

        this.emit(RECONCILER_EVENT.CYCLE_COMPLETE, {
          reason: nextReason,
          metadata: nextMetadata,
          durationMs,
          actionCount: actions.length,
          execution,
        });
        const cycleLogPayload = {
          reason: nextReason,
          metadata: nextMetadata,
          durationMs,
          actionCount: actions.length,
          nodeId: nextMetadata?.nodeId || null,
        };
        if (actions.length > LOCAL_NUM_ZERO || nextReason !== LOCAL_STR_INTERVAL) {
          this._logger.info(RECONCILER_LOG.CYCLE_COMPLETE, cycleLogPayload);
        } else {
          this._logger.debug(RECONCILER_LOG.CYCLE_COMPLETE, cycleLogPayload);
        }

        if (this._rerunRequested && this._pendingTrigger) {
          nextReason = this._pendingTrigger.reason;
          nextMetadata = this._pendingTrigger.metadata;
        }
      } while (this._rerunRequested && this._pendingTrigger);
    } catch (error) {
      this._stats.cycleFailureCount += LOCAL_NUM_ONE;
      this._stats.lastError = error;
      this.emit(RECONCILER_EVENT.CYCLE_ERROR, {
        reason,
        metadata,
        error,
      });
      this._logger.error(RECONCILER_LOG.CYCLE_ERROR, {
        reason,
        metadata,
        nodeId: metadata?.nodeId || null,
        error: error.message,
      });
      throw error;
    } finally {
      this._running = false;
      this._pendingTrigger = null;
      this._rerunRequested = false;
    }
  }

  /**
   * Build deterministic reconciliation actions from desired/actual rows.
   *
   * @param {Object[]} desiredRows
   * @param {Object[]} actualRows
   * @return {Object[]}
   */
  planActions(desiredRows = [], actualRows = []) {
    return planReconcilerActions(desiredRows, actualRows);
  }

  /**
   * Execute one reconciliation action plan using lifecycle manager only.
   *
   * @param {Object[]} actions
   * @param {Object} context
   * @return {Promise<Object[]>}
   */
  async executePlan(actions, context) {
    const execution = new Array(actions.length);
    const actionsByServiceId = new Map();

    for (let index = LOCAL_NUM_ZERO; index < actions.length; index++) {
      const action = actions[index];
      const actionServiceId =
        resolveServiceId(action.definition || action.replica) ||
        `action-${index}`;
      if (!actionsByServiceId.has(actionServiceId)) {
        actionsByServiceId.set(actionServiceId, []);
      }
      actionsByServiceId.get(actionServiceId).push({action, index});
    }

    const serviceActionQueues = [...actionsByServiceId.values()];
    let nextQueueIndex = LOCAL_NUM_ZERO;
    const workerCount = Math.min(
      this._maxConcurrentServiceActions,
      serviceActionQueues.length,
    );

    const workers = [];
    for (let workerIndex = LOCAL_NUM_ZERO; workerIndex < workerCount; workerIndex++) {
      workers.push((async () => {
        while (nextQueueIndex < serviceActionQueues.length) {
          const queueIndex = nextQueueIndex;
          nextQueueIndex += LOCAL_NUM_ONE;
          const actionQueue = serviceActionQueues[queueIndex];
          for (const actionEntry of actionQueue) {
            execution[actionEntry.index] = await this._executeAction(
              actionEntry.action,
              context,
            );
            // One real event-loop turn per action. Replica-create actions
            // are 130-250ms of synchronous work whose awaits resolve as
            // microtasks; without a macrotask boundary the bootstrap
            // system-table batch drains 16 workers' continuations
            // back-to-back, starving timers (heartbeats, the gap watchdog)
            // for the whole batch — round-10: 7-8s unexplained ELU-1.0
            // gaps wedging the lone seed out of serve eligibility. Per-
            // queue action order is unchanged.
            await new Promise((resolve) => setImmediate(resolve));
          }
        }
      })());
    }

    await Promise.all(workers);

    return execution;
  }

  /**
   * Execute one reconciliation action and emit decision telemetry.
   *
   * @param {Object} action
   * @param {Object} context
   * @return {Promise<Object>}
   * @private
   */
  async _executeAction(action, context) {
    const actionStartedAt = Date.now();
    const serviceContext = action.definition || action.replica || {};
    this._stats.actionCount += LOCAL_NUM_ONE;
    const decision = {
      timestamp: Date.now(),
      reason: context.reason,
      metadata: context.metadata,
      action,
      success: false,
      result: null,
      error: null,
    };

    try {
      await this._enforcePlacementPolicy(action, context);
      decision.result = await this._executeLifecycleAction(action, context);

      decision.success = true;
    } catch (error) {
      decision.error = error;
    }

    const durationMs = Date.now() - actionStartedAt;
    decision.durationMs = durationMs;
    this._stats.lastActionDurationMs = durationMs;
    this._stats.actionLatencyMsTotal += durationMs;
    this._stats.actionLatencyMsMax = Math.max(
      this._stats.actionLatencyMsMax,
      durationMs,
    );
    if (decision.success) {
      this._stats.actionSuccessCount += LOCAL_NUM_ONE;
    } else {
      this._stats.actionFailureCount += LOCAL_NUM_ONE;
    }
    this._recordDecisionHistory(decision);
    const decisionLog = {
      reason: context.reason,
      driftReason: action.driftReason || null,
      actionType: action.type,
      success: decision.success,
      durationMs,
      serviceId: resolveServiceId(serviceContext),
      serviceType: resolveServiceType(serviceContext),
      runtimeKind: resolveRuntimeKind(serviceContext),
      operationId: decision.result?.operationId || null,
      nodeId: context.metadata?.nodeId || null,
    };
    if (decision.error) {
      decisionLog.error = decision.error.message;
    }
    this._logger.info(RECONCILER_LOG.DECISION, decisionLog);

    this.emit(RECONCILER_EVENT.DECISION, decision);
    if (this._telemetrySink) {
      this._telemetrySink(decision);
    }
    return decision;
  }

  /**
   * Execute one lifecycle action through the canonical action dispatcher.
   *
   * @param {Object} action
   * @param {Object} context
   * @return {Promise<Object|null>}
   * @private
   */
  async _executeLifecycleAction(action, context) {
    switch (action.type) {
    case RECONCILER_ACTION_TYPE.STOP_REPLICA:
      return await this._lifecycleManager.stopReplica(
        action.replica,
        {reason: context.reason, driftReason: action.driftReason},
      );
    case RECONCILER_ACTION_TYPE.START_REPLICA:
      return await this._lifecycleManager.startReplica(
        action.replica,
        {reason: context.reason, driftReason: action.driftReason},
      );
    case RECONCILER_ACTION_TYPE.CREATE_START_REPLICA:
      await this._lifecycleManager.createReplica(
        {
          ...action.definition,
          [SERVICE_DESCRIPTOR_FIELD.REPLICA_ID]:
            resolveReplicaId(action.replica),
        },
        {reason: context.reason, driftReason: action.driftReason},
      );
      return await this._lifecycleManager.startReplica(
        action.replica,
        {reason: context.reason, driftReason: action.driftReason},
      );
    default:
      return null;
    }
  }

  /**
   * Enforce placement policy checks for one reconcile action.
   *
   * @param {Object} action
   * @param {Object} context
   * @return {Promise<void>}
   * @private
   */
  async _enforcePlacementPolicy(action, context) {
    const serviceId =
      resolveServiceId(action?.definition || action?.replica) || 'unknown';

    try {
      await this._placementPolicyCheck({
        action,
        reason: context.reason,
        metadata: context.metadata,
      });
    } catch (error) {
      throw new ServicePolicyViolationError(
        RECONCILER_POLICY_TYPE.PLACEMENT,
        context.reason || LOCAL_STR_RECONCILE,
        serviceId,
        error.message,
        {cause: error},
      );
    }
  }

  /**
   * Attach event-triggered reconcile handlers.
   *
   * @return {void}
   * @private
   */
  _bindEventTriggers() {
    if (!this._eventSource) {
      return;
    }

    for (const eventName of this._eventNames) {
      const handler = () => {
        this.trigger('event', {eventName});
      };
      this._eventHandlers.set(eventName, handler);
      this._eventSource.on(eventName, handler);
    }
  }

  /**
   * Detach event-triggered reconcile handlers.
   *
   * @return {void}
   * @private
   */
  _unbindEventTriggers() {
    if (!this._eventSource) {
      return;
    }

    for (const [eventName, handler] of this._eventHandlers.entries()) {
      this._eventSource.off(eventName, handler);
    }
    this._eventHandlers.clear();
  }
}

export {
  RECONCILER_ACTION_TYPE,
  RECONCILER_DRIFT_REASON,
  RECONCILER_EVENT,
  ServiceReconciler,
};
