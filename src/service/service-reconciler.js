/**
 * Unified reconciliation owner for desired-vs-actual service state.
 */

import {EventEmitter} from 'node:events';
import {LoggingService} from '../logging/logging-service.js';
import {
  SERVICE_DESCRIPTOR_FIELD,
  SERVICE_LIFECYCLE_STATE,
  SUBSYSTEM,
  TYPEOF,
} from '../constants/index.js';
import {ServiceLifecycleManager} from './service-lifecycle-manager.js';
import {ServicePolicyViolationError} from './service-lifecycle-errors.js';

const SERVICE_RECONCILER_DEFAULT = Object.freeze({
  CHECK_INTERVAL_MS: 5000,
  MAX_CONCURRENT_SERVICE_ACTIONS: 1,
});

const RECONCILER_EVENT = Object.freeze({
  CYCLE_START: 'reconciler:cycle:start',
  CYCLE_COMPLETE: 'reconciler:cycle:complete',
  CYCLE_ERROR: 'reconciler:cycle:error',
  PLAN_READY: 'reconciler:plan:ready',
  DECISION: 'reconciler:decision',
});

const RECONCILER_ACTION_TYPE = Object.freeze({
  CREATE_START_REPLICA: 'create_start_replica',
  START_REPLICA: 'start_replica',
  STOP_REPLICA: 'stop_replica',
});

const RECONCILER_DRIFT_REASON = Object.freeze({
  BELOW_TARGET: 'below_target_replica_count',
  ABOVE_TARGET: 'above_target_replica_count',
  NON_RUNNING_REPLICA: 'non_running_replica',
  SERVICE_REMOVED: 'service_removed_from_desired_state',
});

const RECONCILER_ACTION_PRIORITY = Object.freeze({
  [RECONCILER_ACTION_TYPE.STOP_REPLICA]: 1,
  [RECONCILER_ACTION_TYPE.START_REPLICA]: 2,
  [RECONCILER_ACTION_TYPE.CREATE_START_REPLICA]: 3,
});

const RECONCILER_ERROR = Object.freeze({
  LIFECYCLE_MANAGER_REQUIRED:
    'lifecycleManager must be an instance of ServiceLifecycleManager',
  DESIRED_STATE_READER_REQUIRED:
    'desiredStateReader must be a function',
  ACTUAL_STATE_READER_REQUIRED:
    'actualStateReader must be a function',
  TELEMETRY_SINK_REQUIRED:
    'telemetrySink must be a function',
  EVENT_SOURCE_REQUIRED:
    'eventSource must provide on() and off() methods',
  EVENT_NAME_REQUIRED:
    'eventNames entries must be non-empty strings',
  PLACEMENT_POLICY_CHECK_REQUIRED:
    'placementPolicyCheck must be a function',
  INTERVAL_REQUIRED:
    'checkIntervalMs must be a positive finite number',
  MAX_CONCURRENT_ACTIONS_REQUIRED:
    'maxConcurrentServiceActions must be a positive finite number',
});

const RECONCILER_POLICY_TYPE = Object.freeze({
  PLACEMENT: 'placement',
});

const RECONCILER_LOG = Object.freeze({
  CYCLE_START: 'Service reconciliation cycle started',
  CYCLE_COMPLETE: 'Service reconciliation cycle completed',
  CYCLE_ERROR: 'Service reconciliation cycle failed',
  DECISION: 'Service reconciliation decision recorded',
});

const DEFAULT_DECISION_HISTORY_LIMIT = 100;
const MAX_DECISION_HISTORY_LIMIT = 500;

const RECONCILER_PLACEMENT_POLICY_ERROR = Object.freeze({
  ACTION_REQUIRED: 'reconcile action must be an object',
  ACTION_SERVICE_ID_REQUIRED: 'reconcile action must resolve serviceId',
  ACTION_SERVICE_TYPE_REQUIRED: 'reconcile action must resolve serviceType',
  ACTION_REPLICA_ID_REQUIRED:
    'reconcile action must include replicaId for replica mutations',
});

function resolveServiceId(entity) {
  return entity?.[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID] ||
    entity?.definition?.[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID] ||
    null;
}

function resolveServiceType(entity) {
  return entity?.[SERVICE_DESCRIPTOR_FIELD.SERVICE_TYPE] ||
    entity?.definition?.[SERVICE_DESCRIPTOR_FIELD.SERVICE_TYPE] ||
    null;
}

function resolveReplicaId(entity) {
  return entity?.[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID] ||
    entity?.definition?.[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID] ||
    null;
}

function resolveTenantId(entity) {
  return entity?.[SERVICE_DESCRIPTOR_FIELD.TENANT_ID] ||
    entity?.definition?.[SERVICE_DESCRIPTOR_FIELD.TENANT_ID] ||
    resolveServiceId(entity);
}

function resolveRuntimeKind(entity) {
  return entity?.[SERVICE_DESCRIPTOR_FIELD.RUNTIME_KIND] ||
    entity?.runtime_kind ||
    entity?.definition?.[SERVICE_DESCRIPTOR_FIELD.RUNTIME_KIND] ||
    entity?.definition?.runtime_kind ||
    null;
}

function resolveReplicaCount(definition) {
  const count = definition?.[SERVICE_DESCRIPTOR_FIELD.REPLICA_COUNT];
  if (!Number.isFinite(count)) {
    return 0;
  }
  return Math.max(0, Math.floor(count));
}

function resolveLifecycleState(replica) {
  return replica?.[SERVICE_DESCRIPTOR_FIELD.LIFECYCLE_STATE] ||
    SERVICE_LIFECYCLE_STATE.CREATED;
}

function cloneReplicaHandle(replica) {
  return {
    [SERVICE_DESCRIPTOR_FIELD.SERVICE_ID]: resolveServiceId(replica),
    [SERVICE_DESCRIPTOR_FIELD.SERVICE_TYPE]: resolveServiceType(replica),
    [SERVICE_DESCRIPTOR_FIELD.TENANT_ID]: resolveTenantId(replica),
    [SERVICE_DESCRIPTOR_FIELD.REPLICA_ID]: resolveReplicaId(replica),
    [SERVICE_DESCRIPTOR_FIELD.LIFECYCLE_STATE]: resolveLifecycleState(replica),
  };
}

function compareReplicasByReplicaId(leftReplica, rightReplica) {
  const leftId = resolveReplicaId(leftReplica) || '';
  const rightId = resolveReplicaId(rightReplica) || '';
  return leftId.localeCompare(rightId);
}

function compareActionsDeterministically(leftAction, rightAction) {
  const typeCompare = (resolveServiceType(leftAction) || '')
    .localeCompare(resolveServiceType(rightAction) || '');
  if (typeCompare !== 0) {
    return typeCompare;
  }

  const serviceCompare = (resolveServiceId(leftAction) || '')
    .localeCompare(resolveServiceId(rightAction) || '');
  if (serviceCompare !== 0) {
    return serviceCompare;
  }

  const leftPriority = RECONCILER_ACTION_PRIORITY[leftAction.type] || 999;
  const rightPriority = RECONCILER_ACTION_PRIORITY[rightAction.type] || 999;
  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }

  return (resolveReplicaId(leftAction.replica) || '')
    .localeCompare(resolveReplicaId(rightAction.replica) || '');
}

async function defaultPlacementPolicyCheck(policyContext) {
  const action = policyContext?.action;
  if (!action || typeof action !== TYPEOF.OBJECT) {
    throw new Error(RECONCILER_PLACEMENT_POLICY_ERROR.ACTION_REQUIRED);
  }

  const serviceId = resolveServiceId(action.definition || action.replica);
  if (!serviceId) {
    throw new Error(RECONCILER_PLACEMENT_POLICY_ERROR.ACTION_SERVICE_ID_REQUIRED);
  }

  const serviceType = resolveServiceType(action.definition || action.replica);
  if (!serviceType) {
    throw new Error(RECONCILER_PLACEMENT_POLICY_ERROR.ACTION_SERVICE_TYPE_REQUIRED);
  }

  if (action.type === RECONCILER_ACTION_TYPE.START_REPLICA ||
    action.type === RECONCILER_ACTION_TYPE.STOP_REPLICA ||
    action.type === RECONCILER_ACTION_TYPE.CREATE_START_REPLICA) {
    const replicaId = resolveReplicaId(action.replica);
    if (!replicaId) {
      throw new Error(RECONCILER_PLACEMENT_POLICY_ERROR.ACTION_REPLICA_ID_REQUIRED);
    }
  }
}

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
    if (typeof options.desiredStateReader !== TYPEOF.FUNCTION) {
      throw new TypeError(RECONCILER_ERROR.DESIRED_STATE_READER_REQUIRED);
    }
    if (typeof options.actualStateReader !== TYPEOF.FUNCTION) {
      throw new TypeError(RECONCILER_ERROR.ACTUAL_STATE_READER_REQUIRED);
    }

    const checkIntervalMs = options.checkIntervalMs ||
      SERVICE_RECONCILER_DEFAULT.CHECK_INTERVAL_MS;
    if (!Number.isFinite(checkIntervalMs) || checkIntervalMs <= 0) {
      throw new TypeError(RECONCILER_ERROR.INTERVAL_REQUIRED);
    }
    const maxConcurrentServiceActions =
      options.maxConcurrentServiceActions ??
      SERVICE_RECONCILER_DEFAULT.MAX_CONCURRENT_SERVICE_ACTIONS;
    if (!Number.isFinite(maxConcurrentServiceActions) ||
      maxConcurrentServiceActions <= 0) {
      throw new TypeError(RECONCILER_ERROR.MAX_CONCURRENT_ACTIONS_REQUIRED);
    }

    if (options.telemetrySink !== undefined &&
      options.telemetrySink !== null &&
      typeof options.telemetrySink !== TYPEOF.FUNCTION) {
      throw new TypeError(RECONCILER_ERROR.TELEMETRY_SINK_REQUIRED);
    }

    if (options.eventSource) {
      if (typeof options.eventSource.on !== TYPEOF.FUNCTION ||
        typeof options.eventSource.off !== TYPEOF.FUNCTION) {
        throw new TypeError(RECONCILER_ERROR.EVENT_SOURCE_REQUIRED);
      }
    }
    if (options.placementPolicyCheck !== undefined &&
      typeof options.placementPolicyCheck !== TYPEOF.FUNCTION) {
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
      if (typeof eventName !== TYPEOF.STRING || eventName.length === 0) {
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
      cycleCount: 0,
      cycleSuccessCount: 0,
      cycleFailureCount: 0,
      actionCount: 0,
      actionSuccessCount: 0,
      actionFailureCount: 0,
      lastCycleDurationMs: 0,
      cycleLatencyMsTotal: 0,
      cycleLatencyMsMax: 0,
      lastActionDurationMs: 0,
      actionLatencyMsTotal: 0,
      actionLatencyMsMax: 0,
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
      this.trigger('interval');
    }, this._checkIntervalMs);

    this._bindEventTriggers();
    await this.trigger('startup');
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
        durationMs: decision.durationMs || 0,
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
      durationMs: decision.durationMs || 0,
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
        this._stats.cycleCount += 1;
        this._stats.cycleSuccessCount += 1;
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
        this._logger.info(RECONCILER_LOG.CYCLE_COMPLETE, {
          reason: nextReason,
          metadata: nextMetadata,
          durationMs,
          actionCount: actions.length,
          nodeId: nextMetadata?.nodeId || null,
        });

        if (this._rerunRequested && this._pendingTrigger) {
          nextReason = this._pendingTrigger.reason;
          nextMetadata = this._pendingTrigger.metadata;
        }
      } while (this._rerunRequested && this._pendingTrigger);
    } catch (error) {
      this._stats.cycleFailureCount += 1;
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
    const desiredByServiceId = new Map();
    for (const definition of desiredRows) {
      const serviceId = resolveServiceId(definition);
      const serviceType = resolveServiceType(definition);
      if (!serviceId || !serviceType) {
        continue;
      }
      desiredByServiceId.set(serviceId, {
        ...definition,
        [SERVICE_DESCRIPTOR_FIELD.SERVICE_ID]: serviceId,
        [SERVICE_DESCRIPTOR_FIELD.SERVICE_TYPE]: serviceType,
      });
    }

    const actualByServiceId = new Map();
    for (const replica of actualRows) {
      const serviceId = resolveServiceId(replica);
      const serviceType = resolveServiceType(replica);
      const replicaId = resolveReplicaId(replica);
      if (!serviceId || !serviceType || !replicaId) {
        continue;
      }
      const normalizedReplica = cloneReplicaHandle(replica);
      if (!actualByServiceId.has(serviceId)) {
        actualByServiceId.set(serviceId, []);
      }
      actualByServiceId.get(serviceId).push(normalizedReplica);
    }

    const actions = [];

    for (const [serviceId, definition] of desiredByServiceId.entries()) {
      const replicas = (actualByServiceId.get(serviceId) || [])
        .slice()
        .sort(compareReplicasByReplicaId);
      const runningReplicas = replicas
        .filter((replica) =>
          resolveLifecycleState(replica) === SERVICE_LIFECYCLE_STATE.RUNNING,
        );
      const nonRunningReplicas = replicas
        .filter((replica) =>
          resolveLifecycleState(replica) !== SERVICE_LIFECYCLE_STATE.RUNNING,
        );
      const desiredReplicaCount = resolveReplicaCount(definition);

      if (runningReplicas.length > desiredReplicaCount) {
        const stopCandidates = runningReplicas
          .slice()
          .sort(compareReplicasByReplicaId)
          .reverse()
          .slice(0, runningReplicas.length - desiredReplicaCount);

        for (const replica of stopCandidates) {
          actions.push({
            type: RECONCILER_ACTION_TYPE.STOP_REPLICA,
            driftReason: RECONCILER_DRIFT_REASON.ABOVE_TARGET,
            definition,
            replica,
          });
        }
      }

      if (runningReplicas.length < desiredReplicaCount) {
        let missingCount = desiredReplicaCount - runningReplicas.length;

        for (const replica of nonRunningReplicas) {
          if (missingCount <= 0) {
            break;
          }
          actions.push({
            type: RECONCILER_ACTION_TYPE.START_REPLICA,
            driftReason: RECONCILER_DRIFT_REASON.NON_RUNNING_REPLICA,
            definition,
            replica,
          });
          missingCount -= 1;
        }

        if (missingCount > 0) {
          const knownReplicaIds = new Set(
            replicas.map((replica) => resolveReplicaId(replica)),
          );

          for (let index = 1; index <= missingCount; index++) {
            let suffix = index;
            let candidateReplicaId = `${serviceId}-replica-${suffix}`;
            while (knownReplicaIds.has(candidateReplicaId)) {
              suffix += 1;
              candidateReplicaId = `${serviceId}-replica-${suffix}`;
            }
            knownReplicaIds.add(candidateReplicaId);

            const newReplica = {
              [SERVICE_DESCRIPTOR_FIELD.SERVICE_ID]: serviceId,
              [SERVICE_DESCRIPTOR_FIELD.SERVICE_TYPE]:
                resolveServiceType(definition),
              [SERVICE_DESCRIPTOR_FIELD.TENANT_ID]:
                resolveTenantId(definition),
              [SERVICE_DESCRIPTOR_FIELD.REPLICA_ID]: candidateReplicaId,
              [SERVICE_DESCRIPTOR_FIELD.LIFECYCLE_STATE]:
                SERVICE_LIFECYCLE_STATE.CREATED,
            };

            actions.push({
              type: RECONCILER_ACTION_TYPE.CREATE_START_REPLICA,
              driftReason: RECONCILER_DRIFT_REASON.BELOW_TARGET,
              definition,
              replica: newReplica,
            });
          }
        }
      }
    }

    for (const [serviceId, replicas] of actualByServiceId.entries()) {
      if (desiredByServiceId.has(serviceId)) {
        continue;
      }

      for (const replica of replicas.slice().sort(compareReplicasByReplicaId)) {
        if (resolveLifecycleState(replica) !== SERVICE_LIFECYCLE_STATE.RUNNING) {
          continue;
        }
        actions.push({
          type: RECONCILER_ACTION_TYPE.STOP_REPLICA,
          driftReason: RECONCILER_DRIFT_REASON.SERVICE_REMOVED,
          definition: {
            [SERVICE_DESCRIPTOR_FIELD.SERVICE_ID]: resolveServiceId(replica),
            [SERVICE_DESCRIPTOR_FIELD.SERVICE_TYPE]: resolveServiceType(replica),
            [SERVICE_DESCRIPTOR_FIELD.TENANT_ID]: resolveTenantId(replica),
            [SERVICE_DESCRIPTOR_FIELD.REPLICA_COUNT]: 0,
          },
          replica,
        });
      }
    }

    return actions.sort(compareActionsDeterministically);
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

    for (let index = 0; index < actions.length; index++) {
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
    let nextQueueIndex = 0;
    const workerCount = Math.min(
      this._maxConcurrentServiceActions,
      serviceActionQueues.length,
    );

    const workers = [];
    for (let workerIndex = 0; workerIndex < workerCount; workerIndex++) {
      workers.push((async () => {
        while (nextQueueIndex < serviceActionQueues.length) {
          const queueIndex = nextQueueIndex;
          nextQueueIndex += 1;
          const actionQueue = serviceActionQueues[queueIndex];
          for (const actionEntry of actionQueue) {
            execution[actionEntry.index] = await this._executeAction(
              actionEntry.action,
              context,
            );
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
    this._stats.actionCount += 1;
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

      if (action.type === RECONCILER_ACTION_TYPE.STOP_REPLICA) {
        decision.result = await this._lifecycleManager.stopReplica(
          action.replica,
          {reason: context.reason, driftReason: action.driftReason},
        );
      } else if (action.type === RECONCILER_ACTION_TYPE.START_REPLICA) {
        decision.result = await this._lifecycleManager.startReplica(
          action.replica,
          {reason: context.reason, driftReason: action.driftReason},
        );
      } else if (action.type === RECONCILER_ACTION_TYPE.CREATE_START_REPLICA) {
        await this._lifecycleManager.createReplica(
          {
            ...action.definition,
            [SERVICE_DESCRIPTOR_FIELD.REPLICA_ID]:
              resolveReplicaId(action.replica),
          },
          {reason: context.reason, driftReason: action.driftReason},
        );
        decision.result = await this._lifecycleManager.startReplica(
          action.replica,
          {reason: context.reason, driftReason: action.driftReason},
        );
      }

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
      this._stats.actionSuccessCount += 1;
    } else {
      this._stats.actionFailureCount += 1;
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
        context.reason || 'reconcile',
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
