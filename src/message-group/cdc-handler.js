/**
 * CDC Handler - Manages CDC subscriptions and cache updates for message groups.
 * Ensures cache consistency across replicas via CDC event processing.
 * Requirements: 4.4, 4.7, 5.3, 5.4
 */

import {EventEmitter} from 'events';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {CONFIG_KEY} from '../config/config-constants.js';
import {CDC_OPERATION} from '../constants/index.js';
import {CDC_PIPELINE_METRIC} from '../constants/cdc-lifecycle-constants.js';
import {HLCTimestamp} from '../hlc/hlc-timestamp.js';
import {
  getSystemCachePrimaryKeyFieldOrFallback,
} from '../cache/system-cache-key-descriptor.js';
import {canonicalizeSystemTableRow} from '../control-plane/system-row-normalizers.js';

const LOCAL_STR_CDCHANDLER_REQUIRES_A_SYSTEMTABLECACHE = 'CDCHandler requires a SystemTableCache';
const LOCAL_NUM_ONE_HUNDRED = 100;
const LOCAL_NUM_ONE_HUNDRED0 = 1000;
const LOCAL_NUM_ONE_HUNDRED00 = 10000;
const LOCAL_STR_CDC_HANDLER = 'cdc-handler';
const LOCAL_STR_CDC_HANDLER_INITIALIZED = 'CDC handler initialized';
const LOCAL_STR_SUBSCRIBED_TO_CDC = 'Subscribed to CDC';
const LOCAL_STR_SUBSCRIBED = 'subscribed';
const LOCAL_STR_UNSUBSCRIBED_FROM_CDC = 'Unsubscribed from CDC';
const LOCAL_STR_UNSUBSCRIBED = 'unsubscribed';
const LOCAL_STR_IGNORING_EVENT_FOR_UNSUBSCRIBED_TABLE = 'Ignoring event for unsubscribed table';
const LOCAL_STR_DUPLICATE_CDC_EVENT_IGNORED = 'Duplicate CDC event ignored';
const LOCAL_STR_CDC_EVENT_BUFFERED = 'CDC event buffered';
const LOCAL_STR_FLUSHED_CDC_BUFFER = 'Flushed CDC buffer';
const LOCAL_STR_OUT_OF_ORDER_CDC_EVENT_DETECTED = 'Out-of-order CDC event detected';
const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_APPLIED_CDC_EVENT = 'Applied CDC event';
const LOCAL_STR_EVENTAPPLIED = 'eventApplied';
const LOCAL_STR_FAILED_TO_APPLY_CDC_EVENT = 'Failed to apply CDC event';
const LOCAL_STR_EVENTERROR = 'eventError';
const LOCAL_STR_CDC_HANDLER_SHUTDOWN = 'CDC handler shutdown';
const LOCAL_STR_SHUTDOWN = 'shutdown';

/**
 * CDC event structure.
 */
class CDCEvent {
  /**
   * Create a new CDC event.
   * @param {string} tableName - System table name.
   * @param {string} operation - CDC operation (INSERT, UPDATE, DELETE).
   * @param {Object} data - Record data.
   * @param {string} timestamp - HLC timestamp string.
   * @param {string} sourcePartition - Source partition ID.
   * @param {string|null} causeId - Correlation ID for causal tracing.
   */
  constructor(
    tableName,
    operation,
    data,
    timestamp,
    sourcePartition = null,
    causeId = null,
  ) {
    this.tableName = tableName;
    this.operation = operation;
    this.data = data;
    this.timestamp = timestamp;
    this.sourcePartition = sourcePartition;
    this.causeId = causeId;
    this.receivedAt = Date.now();
  }

  /**
   * Get the record key from the event data.
   * @return {string} Record key (id field).
   */
  getKey() {
    const keyField = getSystemCachePrimaryKeyFieldOrFallback(this.tableName);
    const canonicalData = canonicalizeSystemTableRow(this.tableName, this.data);
    return canonicalData?.[keyField] || canonicalData?.id;
  }

  /**
   * Compare timestamps for ordering.
   * @param {CDCEvent} other - Other event to compare.
   * @return {number} Comparison result (-1, 0, 1).
   */
  compareTimestamp(other) {
    const thisTs = HLCTimestamp.fromString(this.timestamp);
    const otherTs = HLCTimestamp.fromString(other.timestamp);
    return thisTs.compare(otherTs);
  }
}

const CDC_OPERATIONS = CDC_OPERATION;

function normalizeCDCEventData(event) {
  const data = event?.data && typeof event.data === 'object' ? event.data : null;
  const whereClause =
    event?.whereClause && typeof event.whereClause === 'object' ?
      event.whereClause :
      null;

  if (event?.operation === CDC_OPERATIONS.DELETE) {
    const normalizedDeleteData = whereClause ? {...whereClause} : data;
    return canonicalizeSystemTableRow(event?.tableName, normalizedDeleteData);
  }

  if (event?.operation === CDC_OPERATIONS.UPDATE) {
    if (whereClause && data) {
      return canonicalizeSystemTableRow(event?.tableName, {
        ...whereClause,
        ...data,
      });
    }
    return canonicalizeSystemTableRow(event?.tableName, data || whereClause);
  }

  return canonicalizeSystemTableRow(event?.tableName, data);
}

/**
 * CDCHandler manages CDC subscriptions and applies events to the cache.
 * It ensures events are applied in HLC timestamp order for consistency.
 */
class CDCHandler extends EventEmitter {
  /**
   * Create a new CDCHandler.
   * @param {SystemTableCache} cache - The writable system table cache.
   * @param {Object} options - Configuration options.
   */
  constructor(cache, options = {}) {
    super();

    if (!cache) {
      throw new Error(LOCAL_STR_CDCHANDLER_REQUIRES_A_SYSTEMTABLECACHE);
    }

    this.cache = cache;
    this.subscriptions = new Set();
    this.eventBuffer = new Map(); // tableName -> array of pending events
    this.lastAppliedTimestamp = new Map(); // tableName -> last applied HLC timestamp
    this.lastAppliedTimestampByKey = new Map(); // tableName -> key -> HLC
    this.processedEventIds = new Set(); // For deduplication

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.bufferSize = options.bufferSize ||
      config.get(CONFIG_KEY.MESSAGE_GROUP_CDC_BUFFER_SIZE) || LOCAL_NUM_ONE_HUNDRED;
    this.flushIntervalMs = options.flushIntervalMs ||
      config.get(CONFIG_KEY.MESSAGE_GROUP_CDC_FLUSH_INTERVAL_MS) || LOCAL_NUM_ONE_HUNDRED0;
    this.maxProcessedEventIds = options.maxProcessedEventIds || LOCAL_NUM_ONE_HUNDRED00;

    // Optional CDC pipeline metrics for delivery tracking
    this.cdcPipelineMetrics = options.cdcPipelineMetrics || null;

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(LOCAL_STR_CDC_HANDLER) : console;

    // Flush scheduling
    this.flushTimer = null;
    this.initialized = false;
  }

  /**
   * Initialize the CDC handler.
   */
  initialize() {
    if (this.initialized) {
      return;
    }

    this.initialized = true;

    this.logger.debug(LOCAL_STR_CDC_HANDLER_INITIALIZED, {
      bufferSize: this.bufferSize,
      flushIntervalMs: this.flushIntervalMs,
    });
  }

  /**
   * Subscribe to CDC events for a system table.
   * @param {string} tableName - System table name.
   */
  subscribe(tableName) {
    if (this.subscriptions.has(tableName)) {
      return;
    }

    this.subscriptions.add(tableName);
    this.eventBuffer.set(tableName, []);
    this.lastAppliedTimestamp.set(tableName, null);
    this.lastAppliedTimestampByKey.set(tableName, new Map());

    this.logger.debug(LOCAL_STR_SUBSCRIBED_TO_CDC, {tableName});
    this.emit(LOCAL_STR_SUBSCRIBED, {tableName});
  }

  /**
   * Unsubscribe from CDC events for a system table.
   * @param {string} tableName - System table name.
   */
  unsubscribe(tableName) {
    if (!this.subscriptions.has(tableName)) {
      return;
    }

    // Flush pending events before unsubscribing
    this.flushBuffer(tableName);

    this.subscriptions.delete(tableName);
    this.eventBuffer.delete(tableName);
    this.lastAppliedTimestamp.delete(tableName);
    this.lastAppliedTimestampByKey.delete(tableName);

    this.logger.debug(LOCAL_STR_UNSUBSCRIBED_FROM_CDC, {tableName});
    this.emit(LOCAL_STR_UNSUBSCRIBED, {tableName});
  }

  /**
   * Check if subscribed to a table.
   * @param {string} tableName - System table name.
   * @return {boolean} True if subscribed.
   */
  isSubscribed(tableName) {
    return this.subscriptions.has(tableName);
  }

  /**
   * Get all subscriptions.
   * @return {Array<string>} Array of subscribed table names.
   */
  getSubscriptions() {
    return Array.from(this.subscriptions);
  }

  /**
   * Handle an incoming CDC event.
   * Events are buffered and applied in timestamp order.
   * @param {CDCEvent|Object} event - CDC event or event-like object.
   * @return {boolean} True if event was accepted.
   */
  handleEvent(event) {
    // Convert to CDCEvent if needed
    const cdcEvent = event instanceof CDCEvent ?
      event :
      new CDCEvent(
        event.tableName,
        event.operation,
        normalizeCDCEventData(event),
        event.timestamp,
        event.sourcePartition,
        event.causeId,
      );

    const {tableName} = cdcEvent;

    // Check subscription
    if (!this.subscriptions.has(tableName)) {
      this.logger.debug(LOCAL_STR_IGNORING_EVENT_FOR_UNSUBSCRIBED_TABLE, {tableName});
      return false;
    }

    // Generate event ID for deduplication
    const eventId = this.generateEventId(cdcEvent);
    if (this.processedEventIds.has(eventId)) {
      this.logger.debug(LOCAL_STR_DUPLICATE_CDC_EVENT_IGNORED, {
        tableName,
        eventId,
        key: cdcEvent.getKey(),
      });
      return false;
    }

    // Add to buffer
    const buffer = this.eventBuffer.get(tableName);
    buffer.push(cdcEvent);

    this.logger.debug(LOCAL_STR_CDC_EVENT_BUFFERED, {
      tableName,
      operation: cdcEvent.operation,
      key: cdcEvent.getKey(),
      bufferSize: buffer.length,
    });
    this.scheduleBufferedFlush();

    // Flush if buffer is full
    if (buffer.length >= this.bufferSize) {
      this.flushBuffer(tableName);
    }

    return true;
  }

  /**
   * Apply a CDC event immediately (bypass buffering).
   * Used for critical events that need immediate application.
   * @param {CDCEvent|Object} event - CDC event.
   * @param {Object} [options] - Apply options.
   * @param {boolean} [options.skipSubscriptionCheck] - Skip subscription gating.
   * @return {boolean} True when event was applied.
   */
  applyImmediate(event, options = {}) {
    const cdcEvent = event instanceof CDCEvent ?
      event :
      new CDCEvent(
        event.tableName,
        event.operation,
        normalizeCDCEventData(event),
        event.timestamp,
        event.sourcePartition,
        event.causeId,
      );

    const skipSubscriptionCheck = options.skipSubscriptionCheck === true;
    if (!skipSubscriptionCheck && !this.subscriptions.has(cdcEvent.tableName)) {
      this.logger.debug(LOCAL_STR_IGNORING_EVENT_FOR_UNSUBSCRIBED_TABLE, {
        tableName: cdcEvent.tableName,
      });
      return false;
    }

    const eventId = this.generateEventId(cdcEvent);
    if (this.processedEventIds.has(eventId)) {
      this.logger.debug(LOCAL_STR_DUPLICATE_CDC_EVENT_IGNORED, {
        tableName: cdcEvent.tableName,
        eventId,
        key: cdcEvent.getKey(),
      });
      return false;
    }

    this.applyEvent(cdcEvent);
    return true;
  }

  /**
   * Flush the event buffer for a specific table.
   * Events are sorted by timestamp and applied in order.
   * @param {string} tableName - System table name.
   */
  flushBuffer(tableName) {
    const buffer = this.eventBuffer.get(tableName);
    if (!buffer || buffer.length === 0) {
      return;
    }

    // Sort by HLC timestamp
    buffer.sort((a, b) => a.compareTimestamp(b));

    // Apply events in order
    for (const event of buffer) {
      this.applyEvent(event);
    }

    // Clear buffer
    this.eventBuffer.set(tableName, []);
    this.reconcileFlushScheduling();

    this.logger.debug(LOCAL_STR_FLUSHED_CDC_BUFFER, {
      tableName,
      eventCount: buffer.length,
    });
  }

  /**
   * Flush all event buffers.
   */
  flushAllBuffers() {
    for (const tableName of this.subscriptions) {
      this.flushBuffer(tableName);
    }
  }

  /**
   * Check whether any table has buffered events.
   * @return {boolean}
   * @private
   */
  hasBufferedEvents() {
    for (const buffer of this.eventBuffer.values()) {
      if (Array.isArray(buffer) && buffer.length > 0) {
        return true;
      }
    }
    return false;
  }

  /**
   * Schedule one delayed flush while buffered events exist.
   * @private
   */
  scheduleBufferedFlush() {
    if (this.flushTimer || !this.hasBufferedEvents()) {
      return;
    }

    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flushAllBuffers();
      if (this.hasBufferedEvents()) {
        this.scheduleBufferedFlush();
      }
    }, this.flushIntervalMs);

    if (this.flushTimer.unref) {
      this.flushTimer.unref();
    }
  }

  /**
   * Cancel any pending delayed flush.
   * @private
   */
  cancelScheduledFlush() {
    if (!this.flushTimer) {
      return;
    }
    clearTimeout(this.flushTimer);
    this.flushTimer = null;
  }

  /**
   * Keep delayed flush scheduling aligned with current buffer state.
   * @private
   */
  reconcileFlushScheduling() {
    if (this.hasBufferedEvents()) {
      this.scheduleBufferedFlush();
      return;
    }
    this.cancelScheduledFlush();
  }

  /**
   * Apply a single CDC event to the cache.
   * @param {CDCEvent} event - CDC event to apply.
   * @private
   */
  applyEvent(event) {
    const {
      tableName,
      operation,
      data,
      timestamp,
      causeId,
      receivedAt,
    } = event;
    const key = event.getKey();

    // Check timestamp ordering
    const lastTimestamp =
      key !== null && key !== undefined ?
        this.getLastAppliedTimestampForKey(tableName, key) :
        this.lastAppliedTimestamp.get(tableName);
    if (lastTimestamp) {
      const lastTs = HLCTimestamp.fromString(lastTimestamp);
      const eventTs = HLCTimestamp.fromString(timestamp);
      if (eventTs.compare(lastTs) < 0) {
        this.logger.warn(LOCAL_STR_OUT_OF_ORDER_CDC_EVENT_DETECTED, {
          tableName,
          key,
          eventTimestamp: timestamp,
          lastTimestamp,
        });
        // Still apply - the cache handles conflicts
      }
    }

    try {
      // Canonical CDC apply path: all steady-state cache mutations flow here.
      // See architecture.md: Sanctioned direct applySystemTableChange call sites.
      this.cache.applySystemTableChange(tableName, operation, data, {
        causeId,
        cdcObservedAtMs: receivedAt,
      });

      // Track successful delivery to cache
      if (this.cdcPipelineMetrics) {
        this.cdcPipelineMetrics.increment(
          CDC_PIPELINE_METRIC.EVENTS_DELIVERED,
        );
      }

      // Update tracking
      this.recordLastAppliedTimestamp(tableName, timestamp, key);
      if (typeof this.cache.recordAppliedSchemaVersion === LOCAL_STR_FUNCTION) {
        this.cache.recordAppliedSchemaVersion(tableName, timestamp);
      }
      this.markEventProcessed(event);

      this.logger.debug(LOCAL_STR_APPLIED_CDC_EVENT, {
        tableName,
        operation,
        key,
        timestamp,
        causeId,
      });

      this.emit(LOCAL_STR_EVENTAPPLIED, {
        tableName,
        operation,
        key,
        timestamp,
        causeId,
      });
    } catch (error) {
      this.logger.error(LOCAL_STR_FAILED_TO_APPLY_CDC_EVENT, {
        tableName,
        operation,
        key,
        causeId,
        error: error.message,
      });

      this.emit(LOCAL_STR_EVENTERROR, {
        tableName,
        operation,
        key,
        causeId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Record per-table last applied timestamp without allowing regressions.
   * @param {string} tableName
   * @param {string} timestamp
   * @return {string|null}
   * @private
   */
  recordLastAppliedTimestamp(tableName, timestamp, key = null) {
    if (!timestamp) {
      return this.getLastAppliedTimestamp(tableName);
    }

    const keyMap = this.getOrCreateLastAppliedTimestampKeyMap(tableName);
    if (key !== null && key !== undefined) {
      const normalizedKey = String(key);
      const previousForKey = keyMap.get(normalizedKey) || null;
      if (!previousForKey ||
          this.compareTimestampStrings(timestamp, previousForKey) >= 0) {
        keyMap.set(normalizedKey, timestamp);
      }
    }

    const previous = this.lastAppliedTimestamp.get(tableName);
    if (!previous || this.compareTimestampStrings(timestamp, previous) >= 0) {
      this.lastAppliedTimestamp.set(tableName, timestamp);
      return timestamp;
    }

    return previous;
  }

  /**
   * Resolve or initialize the per-table key timestamp map.
   * @param {string} tableName
   * @return {Map<string, string>}
   * @private
   */
  getOrCreateLastAppliedTimestampKeyMap(tableName) {
    let keyMap = this.lastAppliedTimestampByKey.get(tableName);
    if (keyMap instanceof Map) {
      return keyMap;
    }
    keyMap = new Map();
    this.lastAppliedTimestampByKey.set(tableName, keyMap);
    return keyMap;
  }

  /**
   * Get the last applied timestamp for one table/key pair.
   * @param {string} tableName
   * @param {string} key
   * @return {string|null}
   * @private
   */
  getLastAppliedTimestampForKey(tableName, key) {
    if (key === null || key === undefined) {
      return null;
    }
    const keyMap = this.lastAppliedTimestampByKey.get(tableName);
    if (!(keyMap instanceof Map)) {
      return null;
    }
    return keyMap.get(String(key)) || null;
  }

  /**
   * Compare two timestamp strings (prefers HLC ordering when possible).
   * @param {string} a
   * @param {string} b
   * @return {number}
   * @private
   */
  compareTimestampStrings(a, b) {
    try {
      const aTs = HLCTimestamp.fromString(a);
      const bTs = HLCTimestamp.fromString(b);
      return aTs.compare(bTs);
    } catch {
      return String(a).localeCompare(String(b));
    }
  }

  /**
   * Generate a unique event ID for deduplication.
   * @param {CDCEvent} event - CDC event.
   * @return {string} Event ID.
   * @private
   */
  generateEventId(event) {
    return `${event.tableName}:${event.operation}:${event.getKey()}:${event.timestamp}`;
  }

  /**
   * Mark an event as processed for deduplication.
   * @param {CDCEvent} event - CDC event.
   * @private
   */
  markEventProcessed(event) {
    const eventId = this.generateEventId(event);
    this.processedEventIds.add(eventId);

    // Limit size of processed set
    if (this.processedEventIds.size > this.maxProcessedEventIds) {
      // Remove oldest entries (convert to array, slice, convert back)
      const entries = Array.from(this.processedEventIds);
      const toRemove = entries.slice(0, entries.length - this.maxProcessedEventIds);
      for (const id of toRemove) {
        this.processedEventIds.delete(id);
      }
    }
  }

  /**
   * Get the last applied timestamp for a table.
   * @param {string} tableName - System table name.
   * @return {string|null} Last applied HLC timestamp.
   */
  getLastAppliedTimestamp(tableName) {
    return this.lastAppliedTimestamp.get(tableName) || null;
  }

  /**
   * Get buffer size for a table.
   * @param {string} tableName - System table name.
   * @return {number} Number of buffered events.
   */
  getBufferSize(tableName) {
    const buffer = this.eventBuffer.get(tableName);
    return buffer ? buffer.length : 0;
  }

  /**
   * Get total buffered event count.
   * @return {number} Total buffered events across all tables.
   */
  getTotalBufferedEvents() {
    let total = 0;
    for (const buffer of this.eventBuffer.values()) {
      total += buffer.length;
    }
    return total;
  }

  /**
   * Get handler status.
   * @return {Object} Handler status.
   */
  getStatus() {
    const bufferSizes = {};
    for (const [tableName, buffer] of this.eventBuffer) {
      bufferSizes[tableName] = buffer.length;
    }

    return {
      initialized: this.initialized,
      subscriptions: Array.from(this.subscriptions),
      bufferSizes,
      totalBuffered: this.getTotalBufferedEvents(),
      processedEventCount: this.processedEventIds.size,
    };
  }

  /**
   * Shutdown the CDC handler.
   */
  shutdown() {
    this.cancelScheduledFlush();

    // Flush remaining events
    this.flushAllBuffers();

    this.initialized = false;
    this.logger.debug(LOCAL_STR_CDC_HANDLER_SHUTDOWN);
    this.emit(LOCAL_STR_SHUTDOWN);
  }
}

export {CDCHandler, CDCEvent, CDC_OPERATIONS};
