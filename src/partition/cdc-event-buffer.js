/**
 * CDCEventBuffer — bounded in-memory buffer for CDC events generated
 * before CDC subscribers are registered.
 *
 * Captures events at the generation site (PartitionService) when no
 * subscribers exist, and replays them in order once subscriptions
 * activate. Deduplicates on replay using event identity
 * (tableName + operation + primary key + timestamp).
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4
 *
 * @module partition/cdc-event-buffer
 */

import {LoggingService} from '../logging/logging-service.js';
import {
  CDC_EVENT_BUFFER_CAPACITY,
  CDC_EVENT_IDENTITY,
  CDC_LIFECYCLE_LOG_MSG,
} from '../constants/cdc-lifecycle-constants.js';
import {
  getSystemCachePrimaryKeyFieldOrFallback,
} from '../cache/system-cache-key-descriptor.js';
import {
  isTableInternalCachePropagationEnabled,
} from '../cache/cdc-table-policy.js';
import {serializeJsonData} from '../utils/canonical-json-data.js';
import {PARTITION_CDC_OBLIGATION_EVENT_FIELD} from './partition-cdc-obligation-constants.js';

const BUFFER_SUBSYSTEM = 'CDCEventBuffer';
const objectHasOwn = Object.hasOwn;
const objectAssign = Object.assign;

/**
 * Build a deduplication identity string for a CDC event.
 * Uses tableName + operation + primary key value + timestamp.
 *
 * @param {Object} cdcEvent - CDC event object.
 * @return {string} Identity string for deduplication.
 */
function buildEventIdentity(cdcEvent) {
  if (objectHasOwn(cdcEvent, PARTITION_CDC_OBLIGATION_EVENT_FIELD.EVENT_KEY)) {
    if (typeof cdcEvent.eventKey !== 'string' || cdcEvent.eventKey.length === 0 ||
        typeof cdcEvent.sourcePartition !== 'string' || cdcEvent.sourcePartition.length === 0) {
      throw objectAssign(new Error(CDC_EVENT_IDENTITY.INVALID_MESSAGE),
        {code: CDC_EVENT_IDENTITY.INVALID_CODE});
    }
    return serializeJsonData([CDC_EVENT_IDENTITY.DURABLE_TAG,
      cdcEvent.sourcePartition, cdcEvent.eventKey]);
  }
  const pkField = getSystemCachePrimaryKeyFieldOrFallback(
    cdcEvent.tableName,
  );
  const pkValue = cdcEvent.data ? cdcEvent.data[pkField] : '';
  return `${cdcEvent.tableName}:${cdcEvent.operation}:${pkValue}:${cdcEvent.timestamp}`;
}

/**
 * Build a coalescing identity for internal cache propagation tables.
 * Falls back to null when the event cannot be safely coalesced.
 *
 * @param {Object} cdcEvent - CDC event object.
 * @return {string|null} Coalescing identity or null.
 */
function buildInternalCoalescingIdentity(cdcEvent) {
  if (objectHasOwn(cdcEvent, PARTITION_CDC_OBLIGATION_EVENT_FIELD.EVENT_KEY)) {
    return null;
  }
  if (!isTableInternalCachePropagationEnabled(cdcEvent?.tableName)) {
    return null;
  }

  const pkField = getSystemCachePrimaryKeyFieldOrFallback(
    cdcEvent.tableName,
  );

  if (!cdcEvent?.data ||
      !objectHasOwn(cdcEvent.data, pkField)) {
    return null;
  }

  return `${cdcEvent.tableName}:${pkField}:${cdcEvent.data[pkField]}`;
}

/**
 * CDCEventBuffer captures CDC events in a bounded in-memory buffer
 * when no CDC subscribers are registered. Events are replayed in
 * generation order once subscriptions activate.
 */
class CDCEventBuffer {
  /**
   * @param {Object} options
   * @param {number} [options.capacity] — max buffered events
   * @param {Object} [options.logger] — logger instance
   */
  constructor(options = {}) {
    this.capacity = options.capacity || CDC_EVENT_BUFFER_CAPACITY;
    const loggingService = LoggingService.getInstance();
    this.logger = options.logger ||
      (loggingService.isInitialized() ?
        loggingService.forSubsystem(BUFFER_SUBSYSTEM) : console);
    this.events = [];
  }

  /**
   * Buffer a CDC event when no subscribers are present.
   * Drops the oldest event when capacity is exceeded.
   *
   * @param {Object} cdcEvent - CDC event to buffer.
   * @return {boolean} true if buffered, false if an event was dropped.
   */
  buffer(cdcEvent) {
    const coalescingIdentity = buildInternalCoalescingIdentity(cdcEvent);
    if (coalescingIdentity) {
      const compactedEvents = this.events.filter((bufferedEvent) =>
        buildInternalCoalescingIdentity(bufferedEvent) !== coalescingIdentity,
      );
      if (compactedEvents.length !== this.events.length) {
        compactedEvents.push(cdcEvent);
        this.events = compactedEvents;
        return true;
      }
    }

    if (this.events.length >= this.capacity) {
      const dropped = this.events.shift();
      this.logger.warn(CDC_LIFECYCLE_LOG_MSG.EVENT_DROPPED_OVERFLOW, {
        droppedCount: 1,
        bufferCapacity: this.capacity,
        tableName: dropped.tableName,
        operation: dropped.operation,
      });
      this.events.push(cdcEvent);
      return false;
    }
    this.events.push(cdcEvent);
    return true;
  }

  /**
   * Replay all buffered events to the given subscriber callback.
   * Deduplicates events using event identity. Clears the buffer
   * after replay.
   *
   * @param {Function} subscriber — async (cdcEvent) => void
   * @param {Set<string>} [deliveredIdentities] — identities already
   *   delivered through the normal subscription path
   * @return {Promise<number>} count of replayed events
   */
  async replay(subscriber, deliveredIdentities) {
    const seen = deliveredIdentities || new Set();
    const eventsToReplay = this.events.slice();
    this.events = [];

    let replayedCount = 0;
    const retained = [];
    for (let index = 0; index < eventsToReplay.length; index++) {
      const cdcEvent = eventsToReplay[index];
      const identity = buildEventIdentity(cdcEvent);
      if (seen.has(identity)) {
        continue;
      }
      seen.add(identity);
      try {
        // Explicit false means accepted provisionally. Retain it while
        // allowing later metadata to reach the same bounded replay pass.
        if (await subscriber(cdcEvent) === false) {
          retained.push(cdcEvent);
          continue;
        }
        replayedCount++;
      } catch (error) {
        // Preserve the failed event and any remaining tail for the next replay.
        // This prevents silent CDC loss when a subscriber fails transiently.
        seen.delete(identity);
        this.events = retained.concat(eventsToReplay.slice(index), this.events);
        throw error;
      }
    }
    this.events = retained.concat(this.events);
    return replayedCount;
  }

  /**
   * @return {number} current buffer size
   */
  size() {
    return this.events.length;
  }

  /**
   * @return {boolean} true if buffer has events
   */
  hasEvents() {
    return this.events.length > 0;
  }

  /**
   * Clear all buffered events.
   */
  clear() {
    this.events = [];
  }
}

export {
  CDCEventBuffer,
  buildEventIdentity,
  buildInternalCoalescingIdentity,
};
