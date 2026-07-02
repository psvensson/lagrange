/**
 * Delivery, batching, and retry methods for CDCGroupPropagationService.
 */

import {getSystemCachePrimaryKeyFieldOrFallback} from '../cache/system-cache-key-descriptor.js';
import {isTableInternalCachePropagationEnabled} from '../cache/cdc-table-policy.js';
import {resolveCdcPropagationDeliveryProfile} from '../cache/cdc-propagation-delivery-profile.js';
import {PRESSURE_GOVERNOR_ACTION, PressureGovernor} from '../control-plane/pressure-governor.js';
import {LATENCY_TOPOLOGY_MESSAGE_TYPE} from './latency-topology-constants.js';
import {
  CDC_GROUP_PROPAGATION_LOG_MSG,
  CDC_GROUP_PROPAGATION_REASON,
  CDC_GROUP_PROPAGATION_STATE,
} from './cdc-group-propagation-constants.js';

const CDC_GROUP_PROPAGATION_SERVICE_LITERAL = Object.freeze({
  BATCH: 'batch',
  VALUE: ',',
  VALUE_2: '|',
  CDC_RETRY: 'cdc:retry',
});
const DELIVERY_ERROR_UNKNOWN = 'unknown delivery error';
const BACKGROUND_RETRY_PENDING_ERROR = 'background_retry_pending';
const CDC_GROUP_PROPAGATION_TRAFFIC_GATE_STATE = Object.freeze({
  ALLOW_DELIVERY: 'allow_delivery',
  DEFER_RETRY_WAVE: 'defer_retry_wave',
});

function sortObjectKeys(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => sortObjectKeys(entry));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  return Object.keys(value)
    .sort()
    .reduce((accumulator, key) => {
      accumulator[key] = sortObjectKeys(value[key]);
      return accumulator;
    }, {});
}

function stableSerialize(value) {
  return JSON.stringify(sortObjectKeys(value));
}

class CDCGroupPropagationDeliveryMethods {
  /**
   * Deliver CDC payload to targets with bounded retry on failed destinations.
   * @param {Object} options
   * @return {Promise<Array<Object>>}
   * @private
   */ async deliverToTargetsWithRetry(options) {
    const events = this.normalizeDeliveryEvents(options);
    const deliveryLabel = this.describeDeliveryEvents(events);
    const retryKey = !options?.events ? this.buildBackgroundRetryKey(options) : null;
    const allowDeferToExistingRetry = options?.allowDeferToExistingRetry !== false;
    const trafficGate = this.resolvePropagationTrafficGate(events, {
      replayOnly: options?.replayOnly === true,
    });
    if (allowDeferToExistingRetry && retryKey && this.backgroundRetryEntriesByKey.has(retryKey)) {
      this.scheduleDeferredDeliveryEvents(events, options, 1);
      return this.buildDeferredFailures(options.targets);
    }
    if (trafficGate.state === CDC_GROUP_PROPAGATION_TRAFFIC_GATE_STATE.DEFER_RETRY_WAVE) {
      this.scheduleDeferredDeliveryEvents(events, options, 1);
      return this.buildDeferredFailures(options.targets);
    }
    if (this.shouldBatchImmediateDelivery(options)) {
      return this.enqueueImmediateBatch(options);
    }
    let pendingTargets = Array.isArray(options.targets) ? [...options.targets] : [];
    let deliveryFailures = [];
    let attempt = 1;
    const maxAttempts = Math.max(1, this.deliveryRetryMaxAttempts);
    while (pendingTargets.length > 0 && attempt <= maxAttempts) {
      deliveryFailures = await this.deliverToTargets({
        ...options,
        events,
        targets: pendingTargets,
      });
      if (deliveryFailures.length === 0) {
        return [];
      }
      if (attempt >= maxAttempts) {
        break;
      }
      const retryDelayMs = this.computeRetryDelayMs(attempt);
      this.logger.warn(CDC_GROUP_PROPAGATION_LOG_MSG.RETRYING_DELIVERY_FAILURES, {
        nodeId: this.nodeId,
        tableName: deliveryLabel.tableName,
        operation: deliveryLabel.operation,
        eventCount: deliveryLabel.eventCount,
        attempt,
        retryDelayMs,
        failureCount: deliveryFailures.length,
      });
      await this.sleep(retryDelayMs);
      pendingTargets = this.convertFailuresToRetryTargets(deliveryFailures);
      attempt += 1;
    }
    if (deliveryFailures.length > 0) {
      this.logger.warn(CDC_GROUP_PROPAGATION_LOG_MSG.DELIVERY_RETRY_EXHAUSTED, {
        nodeId: this.nodeId,
        tableName: deliveryLabel.tableName,
        operation: deliveryLabel.operation,
        eventCount: deliveryLabel.eventCount,
        attempts: maxAttempts,
        failureCount: deliveryFailures.length,
      });
      const retryTargets = this.convertFailuresToRetryTargets(deliveryFailures);
      this.scheduleDeferredDeliveryEvents(
        events,
        {...options, targets: retryTargets},
        maxAttempts + 1,
      );
    }
    return deliveryFailures;
  }
  /**
   * Describe one delivery wave for diagnostics.
   * @param {Array<Object>} events
   * @return {{tableName:string|null, operation:string|null, eventCount:number}}
   * @private
   */ describeDeliveryEvents(events) {
    const normalizedEvents = Array.isArray(events) ? events : [];
    if (normalizedEvents.length === 0) {
      return {tableName: null, operation: null, eventCount: 0};
    }
    if (normalizedEvents.length === 1) {
      return {
        tableName: normalizedEvents[0].tableName || null,
        operation: normalizedEvents[0].operation || null,
        eventCount: 1,
      };
    }
    return {
      tableName: CDC_GROUP_PROPAGATION_SERVICE_LITERAL.BATCH,
      operation: CDC_GROUP_PROPAGATION_SERVICE_LITERAL.BATCH,
      eventCount: normalizedEvents.length,
    };
  }
  /**
   * Schedule one or more failed delivery events onto the background retry owner.
   * @param {Array<Object>} events
   * @param {Object} options
   * @param {number} attempt
   * @private
   */ scheduleDeferredDeliveryEvents(events, options, attempt) {
    for (const event of events) {
      this.scheduleBackgroundRetry({
        tableName: event.tableName,
        operation: event.operation,
        data: event.data,
        sourceGroupId: options.sourceGroupId,
        targets: options.targets,
        attempt,
      });
    }
  }
  /**
   * Return true when one propagation wave should use immediate batching.
   * @param {Object} options
   * @return {boolean}
   * @private
   */ shouldBatchImmediateDelivery(options) {
    if (options?.allowBatching === false || options?.events) {
      return false;
    }
    if (typeof options?.tableName !== 'string' || options.tableName.length === 0) {
      return false;
    }
    if (!isTableInternalCachePropagationEnabled(options.tableName)) {
      return false;
    }
    return Array.isArray(options.targets) && options.targets.length > 0;
  }
  /**
   * Queue one immediate propagation wave into the canonical batch owner.
   * Repeated row updates for the same target wave collapse to the latest state.
   * @param {Object} options
   * @return {Promise<Array<Object>>}
   * @private
   */ enqueueImmediateBatch(options) {
    const batchKey = this.buildImmediateBatchKey(options);
    if (!batchKey) {
      return this.deliverToTargetsWithRetry({...options, allowBatching: false});
    }
    let entry = this.immediateBatchEntriesByKey.get(batchKey);
    if (!entry) {
      entry = {
        pendingEventsByKey: new Map(),
        resolvers: [],
        sourceGroupId: options.sourceGroupId || null,
        targets: Array.isArray(options.targets) ? [...options.targets] : [],
        timer: null,
      };
      this.immediateBatchEntriesByKey.set(batchKey, entry);
      this.armImmediateBatchEntry(batchKey, entry);
    }
    const eventKey = this.buildBackgroundRetryEventKey(options);
    entry.pendingEventsByKey.set(eventKey, {
      eventKey,
      tableName: options.tableName,
      operation: options.operation,
      data: options.data,
    });
    if (entry.pendingEventsByKey.size >= this.immediateBatchMaxEvents && entry.timer) {
      clearTimeout(entry.timer);
      this.immediateBatchTimers.delete(entry.timer);
      entry.timer = null;
      void this.runImmediateBatchEntry(batchKey, entry);
    }
    return new Promise((resolve) => {
      entry.resolvers.push(resolve);
    });
  }
  /**
   * Build a canonical key for one immediate publication batch.
   * @param {Object} options
   * @return {string|null}
   * @private
   */ buildImmediateBatchKey(options) {
    const targetGroupIds = Array.isArray(options?.targets) ?
      [
        ...new Set(
          options.targets
            .map((target) => target?.groupId)
            .filter((groupId) => typeof groupId === 'string' && groupId.length > 0),
        ),
      ].sort() :
      [];
    if (targetGroupIds.length === 0) {
      return null;
    }
    const sourceGroupId =
      typeof options?.sourceGroupId === 'string' ? options.sourceGroupId : '';
    return [sourceGroupId, targetGroupIds.join(CDC_GROUP_PROPAGATION_SERVICE_LITERAL.VALUE)].join(
      CDC_GROUP_PROPAGATION_SERVICE_LITERAL.VALUE_2,
    );
  }
  /**
   * Arm the timer for one immediate publication batch.
   * @param {string} batchKey
   * @param {Object} entry
   * @private
   */ armImmediateBatchEntry(batchKey, entry) {
    if (entry?.timer) {
      return;
    }
    const timer = setTimeout(async () => {
      await this.runImmediateBatchEntry(batchKey, entry);
    }, this.immediateBatchDelayMs);
    entry.timer = timer;
    this.immediateBatchTimers.add(timer);
  }
  /**
   * Drain one immediate publication batch.
   * @param {string} batchKey
   * @param {Object} entry
   * @return {Promise<void>}
   * @private
   */ async runImmediateBatchEntry(batchKey, entry) {
    if (entry?.timer) {
      this.immediateBatchTimers.delete(entry.timer);
      entry.timer = null;
    }
    if (this.immediateBatchEntriesByKey.get(batchKey) === entry) {
      this.immediateBatchEntriesByKey.delete(batchKey);
    }
    const events = [...entry.pendingEventsByKey.values()];
    entry.pendingEventsByKey.clear();
    if (events.length === 0) {
      this.resolveImmediateBatch(entry, []);
      return;
    }
    const trafficGate = this.resolvePropagationTrafficGate(events);
    if (trafficGate.state === CDC_GROUP_PROPAGATION_TRAFFIC_GATE_STATE.DEFER_RETRY_WAVE) {
      for (const event of events) {
        this.scheduleBackgroundRetry({
          tableName: event.tableName,
          operation: event.operation,
          data: event.data,
          sourceGroupId: entry.sourceGroupId,
          targets: entry.targets,
          attempt: 1,
        });
      }
      this.resolveImmediateBatch(entry, this.buildDeferredFailures(entry.targets));
      return;
    }
    const deliveryFailures = await this.deliverToTargetsWithRetry({
      events,
      sourceGroupId: entry.sourceGroupId,
      targets: entry.targets,
      allowBatching: false,
    });
    this.resolveImmediateBatch(entry, deliveryFailures);
  }
  /**
   * Resolve all waiters attached to one immediate batch entry.
   * @param {Object} entry
   * @param {Array<Object>} deliveryFailures
   * @private
   */ resolveImmediateBatch(entry, deliveryFailures) {
    const resolvers = Array.isArray(entry?.resolvers) ? entry.resolvers : [];
    entry.resolvers = [];
    for (const resolve of resolvers) {
      resolve([...deliveryFailures]);
    }
  }
  /**
   * Continue delivery retries in background after bounded synchronous retries.
   * @param {Object} options
   * @param {string} options.tableName
   * @param {string} options.operation
   * @param {Object} options.data
   * @param {string|null} options.sourceGroupId
   * @param {Array<Object>} options.targets
   * @param {number} options.attempt
   * @private
   */ scheduleBackgroundRetry(options) {
    if (this.state !== CDC_GROUP_PROPAGATION_STATE.RUNNING) {
      return;
    }
    if (!Array.isArray(options.targets) || options.targets.length === 0) {
      return;
    }
    const {tableName, operation, data, sourceGroupId, targets} = options;
    const retryKey = this.buildBackgroundRetryKey({tableName, operation, sourceGroupId, targets});
    const eventKey = this.buildBackgroundRetryEventKey({tableName, operation, data});
    const existingEntry = retryKey ? this.backgroundRetryEntriesByKey.get(retryKey) : null;
    if (existingEntry) {
      this.recordBackgroundRetryEvent(existingEntry, eventKey, data);
      if (!existingEntry.timer) {
        this.armBackgroundRetryEntry(retryKey, existingEntry);
      }
      return;
    }
    const attempt =
      Number.isFinite(options.attempt) && options.attempt > 0 ?
        Math.floor(options.attempt) :
        1;
    options = null;
    const maxTotalAttempts = this.deliveryRetryMaxAttempts + this.backgroundRetryMaxAttempts;
    if (attempt >= maxTotalAttempts) {
      this.logger.warn(CDC_GROUP_PROPAGATION_LOG_MSG.DELIVERY_RETRY_EXHAUSTED, {
        nodeId: this.nodeId,
        tableName,
        operation,
        attempt,
        maxTotalAttempts,
        failureCount: targets.length,
        background: true,
      });
      return;
    }
    const entry = {
      attempt,
      operation,
      pendingEventsByKey: new Map(),
      sourceGroupId,
      tableName,
      targets: Array.isArray(targets) ? [...targets] : [],
      timer: null,
    };
    this.recordBackgroundRetryEvent(entry, eventKey, data);
    this.armBackgroundRetryEntry(retryKey, entry);
  }
  /**
   * Arm the retry timer for one background entry.
   * @param {string|null} retryKey
   * @param {Object} entry
   * @private
   */ armBackgroundRetryEntry(retryKey, entry) {
    if (entry?.timer) {
      return;
    }
    const attempt =
      Number.isFinite(entry?.attempt) && entry.attempt > 0 ?
        Math.floor(entry.attempt) :
        1;
    const maxTotalAttempts = this.deliveryRetryMaxAttempts + this.backgroundRetryMaxAttempts;
    if (attempt >= maxTotalAttempts) {
      this.logger.warn(CDC_GROUP_PROPAGATION_LOG_MSG.DELIVERY_RETRY_EXHAUSTED, {
        nodeId: this.nodeId,
        tableName: entry?.tableName,
        operation: entry?.operation,
        attempt,
        maxTotalAttempts,
        failureCount: entry?.pendingEventsByKey?.size || 0,
        background: true,
      });
      if (retryKey) {
        this.backgroundRetryEntriesByKey.delete(retryKey);
      }
      return;
    }
    const retryDelayMs = this.computeRetryDelayMs(attempt);
    this.logger.warn(CDC_GROUP_PROPAGATION_LOG_MSG.RETRYING_DELIVERY_FAILURES, {
      nodeId: this.nodeId,
      tableName: entry.tableName,
      operation: entry.operation,
      attempt,
      retryDelayMs,
      failureCount: entry.pendingEventsByKey.size,
      background: true,
    });
    const retryTimer = setTimeout(async () => {
      await this.runBackgroundRetryEntry(retryKey, retryTimer, entry);
    }, retryDelayMs);
    entry.timer = retryTimer;
    this.backgroundRetryTimers.add(retryTimer);
    if (retryKey) {
      this.backgroundRetryEntriesByKey.set(retryKey, entry);
    }
  }
  /**
   * Clear all pending background retry timers.
   * @private
   */ clearBackgroundRetryTimers() {
    for (const retryTimer of this.backgroundRetryTimers) {
      clearTimeout(retryTimer);
    }
    this.backgroundRetryTimers.clear();
    this.backgroundRetryEntriesByKey.clear();
  }
  /**
   * Clear all pending immediate publication batch timers.
   * @private
   */ clearImmediateBatchTimers() {
    for (const timer of this.immediateBatchTimers) {
      clearTimeout(timer);
    }
    this.immediateBatchTimers.clear();
    this.immediateBatchEntriesByKey.clear();
  }
  /**
   * Build a canonical key for one background retry wave.
   * @param {Object} options
   * @return {string|null}
   * @private
   */ buildBackgroundRetryKey(options) {
    const targetGroupIds = Array.isArray(options.targets) ?
      [
        ...new Set(
          options.targets
            .map((target) => target?.groupId)
            .filter((groupId) => typeof groupId === 'string' && groupId.length > 0),
        ),
      ].sort() :
      [];
    if (targetGroupIds.length === 0) {
      return null;
    }
    const tableName = typeof options.tableName === 'string' ? options.tableName : '';
    const operation = typeof options.operation === 'string' ? options.operation : '';
    const sourceGroupId =
      typeof options.sourceGroupId === 'string' ? options.sourceGroupId : '';
    return [
      tableName,
      operation,
      sourceGroupId,
      targetGroupIds.join(CDC_GROUP_PROPAGATION_SERVICE_LITERAL.VALUE),
    ].join(CDC_GROUP_PROPAGATION_SERVICE_LITERAL.VALUE_2);
  }
  /**
   * Build a canonical event key for one deferred propagation payload.
   * Uses table primary key when available so repeated row updates collapse
   * to the latest state while preserving distinct rows under one retry wave.
   * @param {Object} options
   * @return {string}
   * @private
   */ buildBackgroundRetryEventKey(options) {
    const tableName = typeof options?.tableName === 'string' ? options.tableName : '';
    const operation = typeof options?.operation === 'string' ? options.operation : '';
    const data = options?.data && typeof options.data === 'object' ? options.data : null;
    const pkField = getSystemCachePrimaryKeyFieldOrFallback(tableName, 'id');
    const pkValue = data?.[pkField] ?? data?.id ?? null;
    if (pkValue !== null && pkValue !== undefined) {
      return `${tableName}|${operation}|${String(pkValue)}`;
    }
    return `${tableName}|${operation}|${stableSerialize(data)}`;
  }
  /**
   * Record or replace the latest deferred payload for one retry entry.
   * @param {Object} entry
   * @param {string} eventKey
   * @param {Object} data
   * @private
   */ recordBackgroundRetryEvent(entry, eventKey, data) {
    if (!entry || !eventKey) {
      return;
    }
    entry.pendingEventsByKey.set(eventKey, {data, eventKey});
  }
  /**
   * Execute one background retry entry, draining all queued row events and
   * rescheduling only the remaining misses.
   * @param {string|null} retryKey
   * @param {Object} retryTimer
   * @param {Object} entry
   * @return {Promise<void>}
   * @private
   */ async runBackgroundRetryEntry(retryKey, retryTimer, entry) {
    this.backgroundRetryTimers.delete(retryTimer);
    if (retryKey) {
      const activeEntry = this.backgroundRetryEntriesByKey.get(retryKey);
      if (activeEntry === entry) {
        activeEntry.timer = null;
      }
    }
    if (this.state !== CDC_GROUP_PROPAGATION_STATE.RUNNING) {
      return;
    }
    const pendingEvents = [...entry.pendingEventsByKey.values()].map((pendingEvent) => ({
      tableName: entry.tableName,
      operation: entry.operation,
      data: pendingEvent.data,
      eventKey: pendingEvent.eventKey,
    }));
    const trafficGate = this.resolvePropagationTrafficGate(pendingEvents);
    if (trafficGate.state === CDC_GROUP_PROPAGATION_TRAFFIC_GATE_STATE.DEFER_RETRY_WAVE) {
      this.rescheduleBackgroundRetryEntry(retryKey, entry);
      return;
    }
    entry.pendingEventsByKey.clear();
    if (pendingEvents.length === 0) {
      if (retryKey) {
        this.backgroundRetryEntriesByKey.delete(retryKey);
      }
      return;
    }
    const deliveryFailures = await this.deliverToTargets({
      events: pendingEvents.map((pendingEvent) => ({
        tableName: pendingEvent.tableName,
        operation: pendingEvent.operation,
        data: pendingEvent.data,
      })),
      sourceGroupId: entry.sourceGroupId,
      targets: entry.targets,
    });
    if (deliveryFailures.length > 0) {
      for (const pendingEvent of pendingEvents) {
        this.recordBackgroundRetryEvent(entry, pendingEvent.eventKey, pendingEvent.data);
      }
    }
    if (entry.pendingEventsByKey.size === 0) {
      if (retryKey) {
        this.backgroundRetryEntriesByKey.delete(retryKey);
      }
      return;
    }
    entry.attempt += 1;
    this.rescheduleBackgroundRetryEntry(retryKey, entry);
  }
  /**
   * Reschedule one existing retry entry if budget remains.
   * @param {string|null} retryKey
   * @param {Object} entry
   * @private
   */ rescheduleBackgroundRetryEntry(retryKey, entry) {
    const maxTotalAttempts = this.deliveryRetryMaxAttempts + this.backgroundRetryMaxAttempts;
    if (entry.attempt >= maxTotalAttempts) {
      this.logger.warn(CDC_GROUP_PROPAGATION_LOG_MSG.DELIVERY_RETRY_EXHAUSTED, {
        nodeId: this.nodeId,
        tableName: entry.tableName,
        operation: entry.operation,
        attempt: entry.attempt,
        maxTotalAttempts,
        failureCount: entry.pendingEventsByKey.size,
        background: true,
      });
      if (retryKey) {
        this.backgroundRetryEntriesByKey.delete(retryKey);
      }
      return;
    }
    this.armBackgroundRetryEntry(retryKey, entry);
  }
  /**
   * Determine whether the local router is currently backpressured.
   * @return {boolean}
   * @private
   */ resolvePropagationTrafficGate(events = [], options = {}) {
    const deliveryProfile = resolveCdcPropagationDeliveryProfile(events, options);
    const pressureDecision = PressureGovernor.getShared({
      nodeId: this.nodeId,
      messageRouter: this.messageRouter,
    }).evaluate({
      workClass: deliveryProfile.workClass,
      resourceKeys: [CDC_GROUP_PROPAGATION_SERVICE_LITERAL.CDC_RETRY],
      allowDegrade: false,
      allowDefer: true,
    });
    return {
      deliveryProfile,
      pressureDecision,
      state:
        pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEFER ?
          CDC_GROUP_PROPAGATION_TRAFFIC_GATE_STATE.DEFER_RETRY_WAVE :
          CDC_GROUP_PROPAGATION_TRAFFIC_GATE_STATE.ALLOW_DELIVERY,
    };
  }
  /**
   * Build immediate deferred failures for a queued retry wave.
   * @param {Array<Object>} targets
   * @return {Array<Object>}
   * @private
   */ buildDeferredFailures(targets) {
    return (Array.isArray(targets) ? targets : []).map((target) => ({
      targetGroupId: target?.groupId || null,
      coordinatorNodeId: target?.coordinatorNodeId || null,
      address: target?.address || null,
      error: BACKGROUND_RETRY_PENDING_ERROR,
    }));
  }
  /**
   * Convert delivery failures into retry targets.
   * @param {Array<Object>} deliveryFailures
   * @return {Array<Object>}
   * @private
   */ convertFailuresToRetryTargets(deliveryFailures) {
    const targetsByGroupId = new Map();
    for (const failure of deliveryFailures) {
      const groupId = failure?.targetGroupId;
      if (typeof groupId !== 'string' || groupId.length === 0) {
        continue;
      }
      targetsByGroupId.set(groupId, {
        groupId,
        coordinatorNodeId: failure?.coordinatorNodeId || null,
        address: failure?.address || null,
      });
    }
    return [...targetsByGroupId.values()];
  }

  /**
   * Compute exponential backoff retry delay.
   * @param {number} attempt
   * @return {number}
   * @private
   */
  computeRetryDelayMs(attempt) {
    const safeAttempt = Number.isFinite(attempt) && attempt > 0 ? attempt : 1;
    const exponentialFactor = Math.pow(this.deliveryRetryBackoffMultiplier, safeAttempt - 1);
    const delayMs = this.deliveryRetryDelayMs * exponentialFactor;
    return Math.min(this.deliveryRetryMaxDelayMs, Math.max(1, Math.floor(delayMs)));
  }

  /**
   * Sleep helper for retry delay.
   * @param {number} delayMs
   * @return {Promise<void>}
   * @private
   */
  async sleep(delayMs) {
    return new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  /**
   * Deliver CDC payload to target coordinators.
   * @param {Object} options
   * @return {Promise<Array<Object>>}
   * @private
   */
  async deliverToTargets(options) {
    const events = this.normalizeDeliveryEvents(options);
    const deliveryProfile = resolveCdcPropagationDeliveryProfile(events, {
      replayOnly: options?.replayOnly === true,
    });
    const baseDeliveryOptions = {
      deliveryPriority: deliveryProfile.deliveryPriority,
      deliverySource: deliveryProfile.deliverySource,
    };
    if (deliveryProfile.replacePendingKey) {
      baseDeliveryOptions.replacePendingKey = deliveryProfile.replacePendingKey;
    }
    const deliveryFailures = [];
    for (const target of options.targets) {
      if (!this.messageRouter || typeof this.messageRouter.deliver !== 'function') {
        deliveryFailures.push({
          targetGroupId: target.groupId,
          coordinatorNodeId: target.coordinatorNodeId,
          address: target.address,
          error: CDC_GROUP_PROPAGATION_REASON.MESSAGE_ROUTER_UNAVAILABLE,
        });
        continue;
      }

      const payload =
        events.length > 1 ?
          {
            type: LATENCY_TOPOLOGY_MESSAGE_TYPE.CDC_PROPAGATION_BATCH,
            events,
            sourceNodeId: this.nodeId,
            sourceGroupId: options.sourceGroupId,
            targetGroupId: target.groupId,
          } :
          {
            type: LATENCY_TOPOLOGY_MESSAGE_TYPE.CDC_PROPAGATION,
            tableName: events[0].tableName,
            operation: events[0].operation,
            data: events[0].data,
            sourceNodeId: this.nodeId,
            sourceGroupId: options.sourceGroupId,
            targetGroupId: target.groupId,
          };
      let result = null;
      try {
        result = await this.messageRouter.deliver(target.address, payload, {
          ...baseDeliveryOptions,
          targetNodeId: target.coordinatorNodeId,
        });
      } catch (error) {
        deliveryFailures.push({
          targetGroupId: target.groupId,
          coordinatorNodeId: target.coordinatorNodeId,
          address: target.address,
          error: String(error?.message || error || DELIVERY_ERROR_UNKNOWN),
        });
        continue;
      }
      if (!result?.acknowledged) {
        deliveryFailures.push({
          targetGroupId: target.groupId,
          coordinatorNodeId: target.coordinatorNodeId,
          address: target.address,
          error: result?.error || null,
        });
      }
    }
    return deliveryFailures;
  }

  /**
   * Normalize one delivery request into a batch-safe event array.
   * @param {Object} options
   * @return {Array<Object>}
   * @private
   */
  normalizeDeliveryEvents(options) {
    const explicitEvents = Array.isArray(options?.events) ?
      options.events
        .filter((event) => event?.tableName && event?.operation && event?.data)
        .map((event) => ({
          tableName: event.tableName,
          operation: event.operation,
          data: event.data,
        })) :
      [];
    if (explicitEvents.length > 0) {
      return explicitEvents;
    }
    return [
      {
        tableName: options.tableName,
        operation: options.operation,
        data: options.data,
      },
    ];
  }
}

function defineCDCGroupPropagationDeliveryMethods(prototype) {
  const descriptors = Object.getOwnPropertyDescriptors(
    CDCGroupPropagationDeliveryMethods.prototype,
  );
  delete descriptors.constructor;
  Object.defineProperties(prototype, descriptors);
}

export {defineCDCGroupPropagationDeliveryMethods};
