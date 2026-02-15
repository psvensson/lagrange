/**
 * TraceCollector manages trace stream subscribers and forwards
 * JSON-serialized events with optional scope filters.
 */

import {NUM, TYPEOF} from '../constants/index.js';
import {
  DEBUG_DEFAULT,
  DEBUG_ERROR_MSG,
} from './debug-constants.js';

/**
 * Node-local collector for Trace_Event forwarding.
 */
class TraceCollector {
  /**
   * @param {Object} [options]
   * @param {Function} [options.serialize] - Event serializer.
   */
  constructor(options = {}) {
    this.serialize = options.serialize || JSON.stringify;
    this.subscribers = new Map();
    this.nextSubscriberId = NUM.ONE;
  }

  /**
   * Register one subscriber.
   *
   * subscriber may be:
   * 1) function(payload, event)
   * 2) socket-like object with send(payload)
   *
   * @param {Function|Object} subscriber
   * @param {Object} [filter]
   * @return {{subscriberId: string, unsubscribe: Function}}
   */
  subscribe(subscriber, filter = {}) {
    const sender = normalizeSender(subscriber);
    const subscriberId = `${DEBUG_DEFAULT.SUBSCRIBER_ID_PREFIX}-` +
      `${this.nextSubscriberId++}`;
    this.subscribers.set(subscriberId, {
      subscriberId,
      sender,
      filter: normalizeFilter(filter),
    });
    return {
      subscriberId,
      unsubscribe: () => this.unsubscribe(subscriberId),
    };
  }

  /**
   * Unregister one subscriber by ID.
   * @param {string} subscriberId
   * @return {boolean}
   */
  unsubscribe(subscriberId) {
    return this.subscribers.delete(subscriberId);
  }

  /**
   * Emit one Trace_Event to matching subscribers.
   * Drop/no-buffer when there are no subscribers.
   *
   * @param {Object} event
   * @return {{delivered: number, dropped: boolean}}
   */
  emit(event) {
    if (this.subscribers.size === NUM.ZERO) {
      return {delivered: NUM.ZERO, dropped: true};
    }

    let serialized;
    let delivered = NUM.ZERO;
    for (const subscription of this.subscribers.values()) {
      if (!matchesFilter(event, subscription.filter)) {
        continue;
      }
      if (serialized === undefined) {
        serialized = this.serialize(event);
      }
      try {
        subscription.sender(serialized, event);
        delivered++;
      } catch {
        // Best-effort stream delivery only.
      }
    }

    return {
      delivered,
      dropped: delivered === NUM.ZERO,
    };
  }

  /**
   * @return {number}
   */
  getSubscriberCount() {
    return this.subscribers.size;
  }
}

/**
 * @param {Function|Object} subscriber
 * @return {Function}
 */
function normalizeSender(subscriber) {
  if (typeof subscriber === TYPEOF.FUNCTION) {
    return subscriber;
  }
  if (subscriber &&
    typeof subscriber.send === TYPEOF.FUNCTION) {
    return (payload) => subscriber.send(payload);
  }
  throw new Error(DEBUG_ERROR_MSG.TRACE_COLLECTOR_REQUIRED);
}

/**
 * @param {Object} filter
 * @return {Object}
 */
function normalizeFilter(filter) {
  const normalized = {};
  if (typeof filter.lineagePrefix === TYPEOF.STRING &&
    filter.lineagePrefix.length > NUM.ZERO) {
    normalized.lineagePrefix = filter.lineagePrefix;
  }
  if (typeof filter.level === TYPEOF.STRING &&
    filter.level.length > NUM.ZERO) {
    normalized.level = filter.level;
  }
  if (Array.isArray(filter.levels)) {
    const levels = filter.levels.filter((value) =>
      typeof value === TYPEOF.STRING &&
      value.length > NUM.ZERO,
    );
    if (levels.length > NUM.ZERO) {
      normalized.levels = new Set(levels);
    }
  }
  if (typeof filter.nodeId === TYPEOF.STRING &&
    filter.nodeId.length > NUM.ZERO) {
    normalized.nodeId = filter.nodeId;
  }
  if (typeof filter.source === TYPEOF.STRING &&
    filter.source.length > NUM.ZERO) {
    normalized.source = filter.source;
  }
  return normalized;
}

/**
 * @param {Object} event
 * @param {Object} filter
 * @return {boolean}
 */
function matchesFilter(event, filter) {
  if (!event || typeof event !== TYPEOF.OBJECT) {
    return false;
  }
  if (!filter || typeof filter !== TYPEOF.OBJECT) {
    return true;
  }
  if (filter.lineagePrefix &&
    !String(event.lineageId || '').startsWith(filter.lineagePrefix)) {
    return false;
  }
  if (filter.level &&
    event.level !== filter.level) {
    return false;
  }
  if (filter.levels &&
    !filter.levels.has(event.level)) {
    return false;
  }
  if (filter.nodeId &&
    event.nodeId !== filter.nodeId) {
    return false;
  }
  if (filter.source &&
    event.source !== filter.source) {
    return false;
  }
  return true;
}

export {
  TraceCollector,
  matchesFilter,
};
