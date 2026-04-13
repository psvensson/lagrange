/**
 * CDC Handler - Manages CDC subscriptions and cache updates for message groups.
 * Ensures cache consistency across replicas via CDC event processing.
 * Requirements: 4.4, 4.7, 5.3, 5.4
 */
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { EventEmitter } from 'events';
import { LoggingService } from '../logging/logging-service.js';
import { ConfigurationManager } from '../config/configuration-manager.js';
import { CONFIG_KEY } from '../config/config-constants.js';
import { CDC_OPERATION } from '../constants/index.js';
import { CDC_PIPELINE_METRIC } from '../constants/cdc-lifecycle-constants.js';
import { HLCTimestamp } from '../hlc/hlc-timestamp.js';
import { getSystemCachePrimaryKeyFieldOrFallback } from '../cache/system-cache-key-descriptor.js';
import { canonicalizeSystemTableRow } from '../control-plane/system-row-normalizers.js';

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
  constructor(tableName, operation, data, timestamp, sourcePartition = null, causeId = null) {
    if (stryMutAct_9fa48("85043")) {
      {}
    } else {
      stryCov_9fa48("85043");
      this.tableName = tableName;
      this.operation = operation;
      this.data = data;
      this.timestamp = timestamp;
      this.sourcePartition = sourcePartition;
      this.causeId = causeId;
      this.receivedAt = Date.now();
    }
  }

  /**
   * Get the record key from the event data.
   * @return {string} Record key (id field).
   */
  getKey() {
    if (stryMutAct_9fa48("85044")) {
      {}
    } else {
      stryCov_9fa48("85044");
      const keyField = getSystemCachePrimaryKeyFieldOrFallback(this.tableName);
      const canonicalData = canonicalizeSystemTableRow(this.tableName, this.data);
      return stryMutAct_9fa48("85047") ? canonicalData?.[keyField] && canonicalData?.id : stryMutAct_9fa48("85046") ? false : stryMutAct_9fa48("85045") ? true : (stryCov_9fa48("85045", "85046", "85047"), (stryMutAct_9fa48("85048") ? canonicalData[keyField] : (stryCov_9fa48("85048"), canonicalData?.[keyField])) || (stryMutAct_9fa48("85049") ? canonicalData.id : (stryCov_9fa48("85049"), canonicalData?.id)));
    }
  }

  /**
   * Compare timestamps for ordering.
   * @param {CDCEvent} other - Other event to compare.
   * @return {number} Comparison result (-1, 0, 1).
   */
  compareTimestamp(other) {
    if (stryMutAct_9fa48("85050")) {
      {}
    } else {
      stryCov_9fa48("85050");
      const thisTs = HLCTimestamp.fromString(this.timestamp);
      const otherTs = HLCTimestamp.fromString(other.timestamp);
      return thisTs.compare(otherTs);
    }
  }
}
const CDC_OPERATIONS = CDC_OPERATION;
function normalizeCDCEventData(event) {
  if (stryMutAct_9fa48("85051")) {
    {}
  } else {
    stryCov_9fa48("85051");
    const data = (stryMutAct_9fa48("85054") ? event?.data || typeof event.data === 'object' : stryMutAct_9fa48("85053") ? false : stryMutAct_9fa48("85052") ? true : (stryCov_9fa48("85052", "85053", "85054"), (stryMutAct_9fa48("85055") ? event.data : (stryCov_9fa48("85055"), event?.data)) && (stryMutAct_9fa48("85057") ? typeof event.data !== 'object' : stryMutAct_9fa48("85056") ? true : (stryCov_9fa48("85056", "85057"), typeof event.data === (stryMutAct_9fa48("85058") ? "" : (stryCov_9fa48("85058"), 'object')))))) ? event.data : null;
    const whereClause = (stryMutAct_9fa48("85061") ? event?.whereClause || typeof event.whereClause === 'object' : stryMutAct_9fa48("85060") ? false : stryMutAct_9fa48("85059") ? true : (stryCov_9fa48("85059", "85060", "85061"), (stryMutAct_9fa48("85062") ? event.whereClause : (stryCov_9fa48("85062"), event?.whereClause)) && (stryMutAct_9fa48("85064") ? typeof event.whereClause !== 'object' : stryMutAct_9fa48("85063") ? true : (stryCov_9fa48("85063", "85064"), typeof event.whereClause === (stryMutAct_9fa48("85065") ? "" : (stryCov_9fa48("85065"), 'object')))))) ? event.whereClause : null;
    if (stryMutAct_9fa48("85068") ? event?.operation !== CDC_OPERATIONS.DELETE : stryMutAct_9fa48("85067") ? false : stryMutAct_9fa48("85066") ? true : (stryCov_9fa48("85066", "85067", "85068"), (stryMutAct_9fa48("85069") ? event.operation : (stryCov_9fa48("85069"), event?.operation)) === CDC_OPERATIONS.DELETE)) {
      if (stryMutAct_9fa48("85070")) {
        {}
      } else {
        stryCov_9fa48("85070");
        const normalizedDeleteData = whereClause ? stryMutAct_9fa48("85071") ? {} : (stryCov_9fa48("85071"), {
          ...whereClause
        }) : data;
        return canonicalizeSystemTableRow(stryMutAct_9fa48("85072") ? event.tableName : (stryCov_9fa48("85072"), event?.tableName), normalizedDeleteData);
      }
    }
    if (stryMutAct_9fa48("85075") ? event?.operation !== CDC_OPERATIONS.UPDATE : stryMutAct_9fa48("85074") ? false : stryMutAct_9fa48("85073") ? true : (stryCov_9fa48("85073", "85074", "85075"), (stryMutAct_9fa48("85076") ? event.operation : (stryCov_9fa48("85076"), event?.operation)) === CDC_OPERATIONS.UPDATE)) {
      if (stryMutAct_9fa48("85077")) {
        {}
      } else {
        stryCov_9fa48("85077");
        if (stryMutAct_9fa48("85080") ? whereClause || data : stryMutAct_9fa48("85079") ? false : stryMutAct_9fa48("85078") ? true : (stryCov_9fa48("85078", "85079", "85080"), whereClause && data)) {
          if (stryMutAct_9fa48("85081")) {
            {}
          } else {
            stryCov_9fa48("85081");
            return canonicalizeSystemTableRow(stryMutAct_9fa48("85082") ? event.tableName : (stryCov_9fa48("85082"), event?.tableName), stryMutAct_9fa48("85083") ? {} : (stryCov_9fa48("85083"), {
              ...whereClause,
              ...data
            }));
          }
        }
        return canonicalizeSystemTableRow(stryMutAct_9fa48("85084") ? event.tableName : (stryCov_9fa48("85084"), event?.tableName), stryMutAct_9fa48("85087") ? data && whereClause : stryMutAct_9fa48("85086") ? false : stryMutAct_9fa48("85085") ? true : (stryCov_9fa48("85085", "85086", "85087"), data || whereClause));
      }
    }
    return canonicalizeSystemTableRow(stryMutAct_9fa48("85088") ? event.tableName : (stryCov_9fa48("85088"), event?.tableName), data);
  }
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
    if (stryMutAct_9fa48("85089")) {
      {}
    } else {
      stryCov_9fa48("85089");
      super();
      if (stryMutAct_9fa48("85092") ? false : stryMutAct_9fa48("85091") ? true : stryMutAct_9fa48("85090") ? cache : (stryCov_9fa48("85090", "85091", "85092"), !cache)) {
        if (stryMutAct_9fa48("85093")) {
          {}
        } else {
          stryCov_9fa48("85093");
          throw new Error(stryMutAct_9fa48("85094") ? "" : (stryCov_9fa48("85094"), 'CDCHandler requires a SystemTableCache'));
        }
      }
      this.cache = cache;
      this.subscriptions = new Set();
      this.eventBuffer = new Map(); // tableName -> array of pending events
      this.lastAppliedTimestamp = new Map(); // tableName -> last applied HLC timestamp
      this.lastAppliedTimestampByKey = new Map(); // tableName -> key -> HLC
      this.processedEventIds = new Set(); // For deduplication

      // Configuration
      const config = ConfigurationManager.getInstance();
      this.bufferSize = stryMutAct_9fa48("85097") ? (options.bufferSize || config.get(CONFIG_KEY.MESSAGE_GROUP_CDC_BUFFER_SIZE)) && 100 : stryMutAct_9fa48("85096") ? false : stryMutAct_9fa48("85095") ? true : (stryCov_9fa48("85095", "85096", "85097"), (stryMutAct_9fa48("85099") ? options.bufferSize && config.get(CONFIG_KEY.MESSAGE_GROUP_CDC_BUFFER_SIZE) : stryMutAct_9fa48("85098") ? false : (stryCov_9fa48("85098", "85099"), options.bufferSize || config.get(CONFIG_KEY.MESSAGE_GROUP_CDC_BUFFER_SIZE))) || 100);
      this.flushIntervalMs = stryMutAct_9fa48("85102") ? (options.flushIntervalMs || config.get(CONFIG_KEY.MESSAGE_GROUP_CDC_FLUSH_INTERVAL_MS)) && 1000 : stryMutAct_9fa48("85101") ? false : stryMutAct_9fa48("85100") ? true : (stryCov_9fa48("85100", "85101", "85102"), (stryMutAct_9fa48("85104") ? options.flushIntervalMs && config.get(CONFIG_KEY.MESSAGE_GROUP_CDC_FLUSH_INTERVAL_MS) : stryMutAct_9fa48("85103") ? false : (stryCov_9fa48("85103", "85104"), options.flushIntervalMs || config.get(CONFIG_KEY.MESSAGE_GROUP_CDC_FLUSH_INTERVAL_MS))) || 1000);
      this.maxProcessedEventIds = stryMutAct_9fa48("85107") ? options.maxProcessedEventIds && 10000 : stryMutAct_9fa48("85106") ? false : stryMutAct_9fa48("85105") ? true : (stryCov_9fa48("85105", "85106", "85107"), options.maxProcessedEventIds || 10000);

      // Optional CDC pipeline metrics for delivery tracking
      this.cdcPipelineMetrics = stryMutAct_9fa48("85110") ? options.cdcPipelineMetrics && null : stryMutAct_9fa48("85109") ? false : stryMutAct_9fa48("85108") ? true : (stryCov_9fa48("85108", "85109", "85110"), options.cdcPipelineMetrics || null);

      // Logging
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.isInitialized() ? loggingService.forSubsystem(stryMutAct_9fa48("85111") ? "" : (stryCov_9fa48("85111"), 'cdc-handler')) : console;

      // Flush scheduling
      this.flushTimer = null;
      this.initialized = stryMutAct_9fa48("85112") ? true : (stryCov_9fa48("85112"), false);
    }
  }

  /**
   * Initialize the CDC handler.
   */
  initialize() {
    if (stryMutAct_9fa48("85113")) {
      {}
    } else {
      stryCov_9fa48("85113");
      if (stryMutAct_9fa48("85115") ? false : stryMutAct_9fa48("85114") ? true : (stryCov_9fa48("85114", "85115"), this.initialized)) {
        if (stryMutAct_9fa48("85116")) {
          {}
        } else {
          stryCov_9fa48("85116");
          return;
        }
      }
      this.initialized = stryMutAct_9fa48("85117") ? false : (stryCov_9fa48("85117"), true);
      this.logger.debug(stryMutAct_9fa48("85118") ? "" : (stryCov_9fa48("85118"), 'CDC handler initialized'), stryMutAct_9fa48("85119") ? {} : (stryCov_9fa48("85119"), {
        bufferSize: this.bufferSize,
        flushIntervalMs: this.flushIntervalMs
      }));
    }
  }

  /**
   * Subscribe to CDC events for a system table.
   * @param {string} tableName - System table name.
   */
  subscribe(tableName) {
    if (stryMutAct_9fa48("85120")) {
      {}
    } else {
      stryCov_9fa48("85120");
      if (stryMutAct_9fa48("85122") ? false : stryMutAct_9fa48("85121") ? true : (stryCov_9fa48("85121", "85122"), this.subscriptions.has(tableName))) {
        if (stryMutAct_9fa48("85123")) {
          {}
        } else {
          stryCov_9fa48("85123");
          return;
        }
      }
      this.subscriptions.add(tableName);
      this.eventBuffer.set(tableName, stryMutAct_9fa48("85124") ? ["Stryker was here"] : (stryCov_9fa48("85124"), []));
      this.lastAppliedTimestamp.set(tableName, null);
      this.lastAppliedTimestampByKey.set(tableName, new Map());
      this.logger.debug(stryMutAct_9fa48("85125") ? "" : (stryCov_9fa48("85125"), 'Subscribed to CDC'), stryMutAct_9fa48("85126") ? {} : (stryCov_9fa48("85126"), {
        tableName
      }));
      this.emit(stryMutAct_9fa48("85127") ? "" : (stryCov_9fa48("85127"), 'subscribed'), stryMutAct_9fa48("85128") ? {} : (stryCov_9fa48("85128"), {
        tableName
      }));
    }
  }

  /**
   * Unsubscribe from CDC events for a system table.
   * @param {string} tableName - System table name.
   */
  unsubscribe(tableName) {
    if (stryMutAct_9fa48("85129")) {
      {}
    } else {
      stryCov_9fa48("85129");
      if (stryMutAct_9fa48("85132") ? false : stryMutAct_9fa48("85131") ? true : stryMutAct_9fa48("85130") ? this.subscriptions.has(tableName) : (stryCov_9fa48("85130", "85131", "85132"), !this.subscriptions.has(tableName))) {
        if (stryMutAct_9fa48("85133")) {
          {}
        } else {
          stryCov_9fa48("85133");
          return;
        }
      }

      // Flush pending events before unsubscribing
      this.flushBuffer(tableName);
      this.subscriptions.delete(tableName);
      this.eventBuffer.delete(tableName);
      this.lastAppliedTimestamp.delete(tableName);
      this.lastAppliedTimestampByKey.delete(tableName);
      this.logger.debug(stryMutAct_9fa48("85134") ? "" : (stryCov_9fa48("85134"), 'Unsubscribed from CDC'), stryMutAct_9fa48("85135") ? {} : (stryCov_9fa48("85135"), {
        tableName
      }));
      this.emit(stryMutAct_9fa48("85136") ? "" : (stryCov_9fa48("85136"), 'unsubscribed'), stryMutAct_9fa48("85137") ? {} : (stryCov_9fa48("85137"), {
        tableName
      }));
    }
  }

  /**
   * Check if subscribed to a table.
   * @param {string} tableName - System table name.
   * @return {boolean} True if subscribed.
   */
  isSubscribed(tableName) {
    if (stryMutAct_9fa48("85138")) {
      {}
    } else {
      stryCov_9fa48("85138");
      return this.subscriptions.has(tableName);
    }
  }

  /**
   * Get all subscriptions.
   * @return {Array<string>} Array of subscribed table names.
   */
  getSubscriptions() {
    if (stryMutAct_9fa48("85139")) {
      {}
    } else {
      stryCov_9fa48("85139");
      return Array.from(this.subscriptions);
    }
  }

  /**
   * Handle an incoming CDC event.
   * Events are buffered and applied in timestamp order.
   * @param {CDCEvent|Object} event - CDC event or event-like object.
   * @return {boolean} True if event was accepted.
   */
  handleEvent(event) {
    if (stryMutAct_9fa48("85140")) {
      {}
    } else {
      stryCov_9fa48("85140");
      // Convert to CDCEvent if needed
      const cdcEvent = event instanceof CDCEvent ? event : new CDCEvent(event.tableName, event.operation, normalizeCDCEventData(event), event.timestamp, event.sourcePartition, event.causeId);
      const {
        tableName
      } = cdcEvent;

      // Check subscription
      if (stryMutAct_9fa48("85143") ? false : stryMutAct_9fa48("85142") ? true : stryMutAct_9fa48("85141") ? this.subscriptions.has(tableName) : (stryCov_9fa48("85141", "85142", "85143"), !this.subscriptions.has(tableName))) {
        if (stryMutAct_9fa48("85144")) {
          {}
        } else {
          stryCov_9fa48("85144");
          this.logger.debug(stryMutAct_9fa48("85145") ? "" : (stryCov_9fa48("85145"), 'Ignoring event for unsubscribed table'), stryMutAct_9fa48("85146") ? {} : (stryCov_9fa48("85146"), {
            tableName
          }));
          return stryMutAct_9fa48("85147") ? true : (stryCov_9fa48("85147"), false);
        }
      }

      // Generate event ID for deduplication
      const eventId = this.generateEventId(cdcEvent);
      if (stryMutAct_9fa48("85149") ? false : stryMutAct_9fa48("85148") ? true : (stryCov_9fa48("85148", "85149"), this.processedEventIds.has(eventId))) {
        if (stryMutAct_9fa48("85150")) {
          {}
        } else {
          stryCov_9fa48("85150");
          this.logger.debug(stryMutAct_9fa48("85151") ? "" : (stryCov_9fa48("85151"), 'Duplicate CDC event ignored'), stryMutAct_9fa48("85152") ? {} : (stryCov_9fa48("85152"), {
            tableName,
            eventId,
            key: cdcEvent.getKey()
          }));
          return stryMutAct_9fa48("85153") ? true : (stryCov_9fa48("85153"), false);
        }
      }

      // Add to buffer
      const buffer = this.eventBuffer.get(tableName);
      buffer.push(cdcEvent);
      this.logger.debug(stryMutAct_9fa48("85154") ? "" : (stryCov_9fa48("85154"), 'CDC event buffered'), stryMutAct_9fa48("85155") ? {} : (stryCov_9fa48("85155"), {
        tableName,
        operation: cdcEvent.operation,
        key: cdcEvent.getKey(),
        bufferSize: buffer.length
      }));
      this.scheduleBufferedFlush();

      // Flush if buffer is full
      if (stryMutAct_9fa48("85159") ? buffer.length < this.bufferSize : stryMutAct_9fa48("85158") ? buffer.length > this.bufferSize : stryMutAct_9fa48("85157") ? false : stryMutAct_9fa48("85156") ? true : (stryCov_9fa48("85156", "85157", "85158", "85159"), buffer.length >= this.bufferSize)) {
        if (stryMutAct_9fa48("85160")) {
          {}
        } else {
          stryCov_9fa48("85160");
          this.flushBuffer(tableName);
        }
      }
      return stryMutAct_9fa48("85161") ? false : (stryCov_9fa48("85161"), true);
    }
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
    if (stryMutAct_9fa48("85162")) {
      {}
    } else {
      stryCov_9fa48("85162");
      const cdcEvent = event instanceof CDCEvent ? event : new CDCEvent(event.tableName, event.operation, normalizeCDCEventData(event), event.timestamp, event.sourcePartition, event.causeId);
      const skipSubscriptionCheck = stryMutAct_9fa48("85165") ? options.skipSubscriptionCheck !== true : stryMutAct_9fa48("85164") ? false : stryMutAct_9fa48("85163") ? true : (stryCov_9fa48("85163", "85164", "85165"), options.skipSubscriptionCheck === (stryMutAct_9fa48("85166") ? false : (stryCov_9fa48("85166"), true)));
      if (stryMutAct_9fa48("85169") ? !skipSubscriptionCheck || !this.subscriptions.has(cdcEvent.tableName) : stryMutAct_9fa48("85168") ? false : stryMutAct_9fa48("85167") ? true : (stryCov_9fa48("85167", "85168", "85169"), (stryMutAct_9fa48("85170") ? skipSubscriptionCheck : (stryCov_9fa48("85170"), !skipSubscriptionCheck)) && (stryMutAct_9fa48("85171") ? this.subscriptions.has(cdcEvent.tableName) : (stryCov_9fa48("85171"), !this.subscriptions.has(cdcEvent.tableName))))) {
        if (stryMutAct_9fa48("85172")) {
          {}
        } else {
          stryCov_9fa48("85172");
          this.logger.debug(stryMutAct_9fa48("85173") ? "" : (stryCov_9fa48("85173"), 'Ignoring event for unsubscribed table'), stryMutAct_9fa48("85174") ? {} : (stryCov_9fa48("85174"), {
            tableName: cdcEvent.tableName
          }));
          return stryMutAct_9fa48("85175") ? true : (stryCov_9fa48("85175"), false);
        }
      }
      const eventId = this.generateEventId(cdcEvent);
      if (stryMutAct_9fa48("85177") ? false : stryMutAct_9fa48("85176") ? true : (stryCov_9fa48("85176", "85177"), this.processedEventIds.has(eventId))) {
        if (stryMutAct_9fa48("85178")) {
          {}
        } else {
          stryCov_9fa48("85178");
          this.logger.debug(stryMutAct_9fa48("85179") ? "" : (stryCov_9fa48("85179"), 'Duplicate CDC event ignored'), stryMutAct_9fa48("85180") ? {} : (stryCov_9fa48("85180"), {
            tableName: cdcEvent.tableName,
            eventId,
            key: cdcEvent.getKey()
          }));
          return stryMutAct_9fa48("85181") ? true : (stryCov_9fa48("85181"), false);
        }
      }
      this.applyEvent(cdcEvent);
      return stryMutAct_9fa48("85182") ? false : (stryCov_9fa48("85182"), true);
    }
  }

  /**
   * Flush the event buffer for a specific table.
   * Events are sorted by timestamp and applied in order.
   * @param {string} tableName - System table name.
   */
  flushBuffer(tableName) {
    if (stryMutAct_9fa48("85183")) {
      {}
    } else {
      stryCov_9fa48("85183");
      const buffer = this.eventBuffer.get(tableName);
      if (stryMutAct_9fa48("85186") ? !buffer && buffer.length === 0 : stryMutAct_9fa48("85185") ? false : stryMutAct_9fa48("85184") ? true : (stryCov_9fa48("85184", "85185", "85186"), (stryMutAct_9fa48("85187") ? buffer : (stryCov_9fa48("85187"), !buffer)) || (stryMutAct_9fa48("85189") ? buffer.length !== 0 : stryMutAct_9fa48("85188") ? false : (stryCov_9fa48("85188", "85189"), buffer.length === 0)))) {
        if (stryMutAct_9fa48("85190")) {
          {}
        } else {
          stryCov_9fa48("85190");
          return;
        }
      }

      // Sort by HLC timestamp
      stryMutAct_9fa48("85191") ? buffer : (stryCov_9fa48("85191"), buffer.sort(stryMutAct_9fa48("85192") ? () => undefined : (stryCov_9fa48("85192"), (a, b) => a.compareTimestamp(b))));

      // Apply events in order
      for (const event of buffer) {
        if (stryMutAct_9fa48("85193")) {
          {}
        } else {
          stryCov_9fa48("85193");
          this.applyEvent(event);
        }
      }

      // Clear buffer
      this.eventBuffer.set(tableName, stryMutAct_9fa48("85194") ? ["Stryker was here"] : (stryCov_9fa48("85194"), []));
      this.reconcileFlushScheduling();
      this.logger.debug(stryMutAct_9fa48("85195") ? "" : (stryCov_9fa48("85195"), 'Flushed CDC buffer'), stryMutAct_9fa48("85196") ? {} : (stryCov_9fa48("85196"), {
        tableName,
        eventCount: buffer.length
      }));
    }
  }

  /**
   * Flush all event buffers.
   */
  flushAllBuffers() {
    if (stryMutAct_9fa48("85197")) {
      {}
    } else {
      stryCov_9fa48("85197");
      for (const tableName of this.subscriptions) {
        if (stryMutAct_9fa48("85198")) {
          {}
        } else {
          stryCov_9fa48("85198");
          this.flushBuffer(tableName);
        }
      }
    }
  }

  /**
   * Check whether any table has buffered events.
   * @return {boolean}
   * @private
   */
  hasBufferedEvents() {
    if (stryMutAct_9fa48("85199")) {
      {}
    } else {
      stryCov_9fa48("85199");
      for (const buffer of this.eventBuffer.values()) {
        if (stryMutAct_9fa48("85200")) {
          {}
        } else {
          stryCov_9fa48("85200");
          if (stryMutAct_9fa48("85203") ? Array.isArray(buffer) || buffer.length > 0 : stryMutAct_9fa48("85202") ? false : stryMutAct_9fa48("85201") ? true : (stryCov_9fa48("85201", "85202", "85203"), Array.isArray(buffer) && (stryMutAct_9fa48("85206") ? buffer.length <= 0 : stryMutAct_9fa48("85205") ? buffer.length >= 0 : stryMutAct_9fa48("85204") ? true : (stryCov_9fa48("85204", "85205", "85206"), buffer.length > 0)))) {
            if (stryMutAct_9fa48("85207")) {
              {}
            } else {
              stryCov_9fa48("85207");
              return stryMutAct_9fa48("85208") ? false : (stryCov_9fa48("85208"), true);
            }
          }
        }
      }
      return stryMutAct_9fa48("85209") ? true : (stryCov_9fa48("85209"), false);
    }
  }

  /**
   * Schedule one delayed flush while buffered events exist.
   * @private
   */
  scheduleBufferedFlush() {
    if (stryMutAct_9fa48("85210")) {
      {}
    } else {
      stryCov_9fa48("85210");
      if (stryMutAct_9fa48("85213") ? this.flushTimer && !this.hasBufferedEvents() : stryMutAct_9fa48("85212") ? false : stryMutAct_9fa48("85211") ? true : (stryCov_9fa48("85211", "85212", "85213"), this.flushTimer || (stryMutAct_9fa48("85214") ? this.hasBufferedEvents() : (stryCov_9fa48("85214"), !this.hasBufferedEvents())))) {
        if (stryMutAct_9fa48("85215")) {
          {}
        } else {
          stryCov_9fa48("85215");
          return;
        }
      }
      this.flushTimer = setTimeout(() => {
        if (stryMutAct_9fa48("85216")) {
          {}
        } else {
          stryCov_9fa48("85216");
          this.flushTimer = null;
          this.flushAllBuffers();
          if (stryMutAct_9fa48("85218") ? false : stryMutAct_9fa48("85217") ? true : (stryCov_9fa48("85217", "85218"), this.hasBufferedEvents())) {
            if (stryMutAct_9fa48("85219")) {
              {}
            } else {
              stryCov_9fa48("85219");
              this.scheduleBufferedFlush();
            }
          }
        }
      }, this.flushIntervalMs);
      if (stryMutAct_9fa48("85221") ? false : stryMutAct_9fa48("85220") ? true : (stryCov_9fa48("85220", "85221"), this.flushTimer.unref)) {
        if (stryMutAct_9fa48("85222")) {
          {}
        } else {
          stryCov_9fa48("85222");
          this.flushTimer.unref();
        }
      }
    }
  }

  /**
   * Cancel any pending delayed flush.
   * @private
   */
  cancelScheduledFlush() {
    if (stryMutAct_9fa48("85223")) {
      {}
    } else {
      stryCov_9fa48("85223");
      if (stryMutAct_9fa48("85226") ? false : stryMutAct_9fa48("85225") ? true : stryMutAct_9fa48("85224") ? this.flushTimer : (stryCov_9fa48("85224", "85225", "85226"), !this.flushTimer)) {
        if (stryMutAct_9fa48("85227")) {
          {}
        } else {
          stryCov_9fa48("85227");
          return;
        }
      }
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Keep delayed flush scheduling aligned with current buffer state.
   * @private
   */
  reconcileFlushScheduling() {
    if (stryMutAct_9fa48("85228")) {
      {}
    } else {
      stryCov_9fa48("85228");
      if (stryMutAct_9fa48("85230") ? false : stryMutAct_9fa48("85229") ? true : (stryCov_9fa48("85229", "85230"), this.hasBufferedEvents())) {
        if (stryMutAct_9fa48("85231")) {
          {}
        } else {
          stryCov_9fa48("85231");
          this.scheduleBufferedFlush();
          return;
        }
      }
      this.cancelScheduledFlush();
    }
  }

  /**
   * Apply a single CDC event to the cache.
   * @param {CDCEvent} event - CDC event to apply.
   * @private
   */
  applyEvent(event) {
    if (stryMutAct_9fa48("85232")) {
      {}
    } else {
      stryCov_9fa48("85232");
      const {
        tableName,
        operation,
        data,
        timestamp,
        causeId
      } = event;
      const key = event.getKey();

      // Check timestamp ordering
      const lastTimestamp = (stryMutAct_9fa48("85235") ? key !== null || key !== undefined : stryMutAct_9fa48("85234") ? false : stryMutAct_9fa48("85233") ? true : (stryCov_9fa48("85233", "85234", "85235"), (stryMutAct_9fa48("85237") ? key === null : stryMutAct_9fa48("85236") ? true : (stryCov_9fa48("85236", "85237"), key !== null)) && (stryMutAct_9fa48("85239") ? key === undefined : stryMutAct_9fa48("85238") ? true : (stryCov_9fa48("85238", "85239"), key !== undefined)))) ? this.getLastAppliedTimestampForKey(tableName, key) : this.lastAppliedTimestamp.get(tableName);
      if (stryMutAct_9fa48("85241") ? false : stryMutAct_9fa48("85240") ? true : (stryCov_9fa48("85240", "85241"), lastTimestamp)) {
        if (stryMutAct_9fa48("85242")) {
          {}
        } else {
          stryCov_9fa48("85242");
          const lastTs = HLCTimestamp.fromString(lastTimestamp);
          const eventTs = HLCTimestamp.fromString(timestamp);
          if (stryMutAct_9fa48("85246") ? eventTs.compare(lastTs) >= 0 : stryMutAct_9fa48("85245") ? eventTs.compare(lastTs) <= 0 : stryMutAct_9fa48("85244") ? false : stryMutAct_9fa48("85243") ? true : (stryCov_9fa48("85243", "85244", "85245", "85246"), eventTs.compare(lastTs) < 0)) {
            if (stryMutAct_9fa48("85247")) {
              {}
            } else {
              stryCov_9fa48("85247");
              this.logger.warn(stryMutAct_9fa48("85248") ? "" : (stryCov_9fa48("85248"), 'Out-of-order CDC event detected'), stryMutAct_9fa48("85249") ? {} : (stryCov_9fa48("85249"), {
                tableName,
                key,
                eventTimestamp: timestamp,
                lastTimestamp
              }));
              // Still apply - the cache handles conflicts
            }
          }
        }
      }
      try {
        if (stryMutAct_9fa48("85250")) {
          {}
        } else {
          stryCov_9fa48("85250");
          // Canonical CDC apply path: all steady-state cache mutations flow here.
          // See architecture.md: Sanctioned direct applySystemTableChange call sites.
          this.cache.applySystemTableChange(tableName, operation, data, stryMutAct_9fa48("85251") ? {} : (stryCov_9fa48("85251"), {
            causeId
          }));

          // Track successful delivery to cache
          if (stryMutAct_9fa48("85253") ? false : stryMutAct_9fa48("85252") ? true : (stryCov_9fa48("85252", "85253"), this.cdcPipelineMetrics)) {
            if (stryMutAct_9fa48("85254")) {
              {}
            } else {
              stryCov_9fa48("85254");
              this.cdcPipelineMetrics.increment(CDC_PIPELINE_METRIC.EVENTS_DELIVERED);
            }
          }

          // Update tracking
          this.recordLastAppliedTimestamp(tableName, timestamp, key);
          if (stryMutAct_9fa48("85257") ? typeof this.cache.recordAppliedSchemaVersion !== 'function' : stryMutAct_9fa48("85256") ? false : stryMutAct_9fa48("85255") ? true : (stryCov_9fa48("85255", "85256", "85257"), typeof this.cache.recordAppliedSchemaVersion === (stryMutAct_9fa48("85258") ? "" : (stryCov_9fa48("85258"), 'function')))) {
            if (stryMutAct_9fa48("85259")) {
              {}
            } else {
              stryCov_9fa48("85259");
              this.cache.recordAppliedSchemaVersion(tableName, timestamp);
            }
          }
          this.markEventProcessed(event);
          this.logger.debug(stryMutAct_9fa48("85260") ? "" : (stryCov_9fa48("85260"), 'Applied CDC event'), stryMutAct_9fa48("85261") ? {} : (stryCov_9fa48("85261"), {
            tableName,
            operation,
            key,
            timestamp,
            causeId
          }));
          this.emit(stryMutAct_9fa48("85262") ? "" : (stryCov_9fa48("85262"), 'eventApplied'), stryMutAct_9fa48("85263") ? {} : (stryCov_9fa48("85263"), {
            tableName,
            operation,
            key,
            timestamp,
            causeId
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("85264")) {
          {}
        } else {
          stryCov_9fa48("85264");
          this.logger.error(stryMutAct_9fa48("85265") ? "" : (stryCov_9fa48("85265"), 'Failed to apply CDC event'), stryMutAct_9fa48("85266") ? {} : (stryCov_9fa48("85266"), {
            tableName,
            operation,
            key,
            causeId,
            error: error.message
          }));
          this.emit(stryMutAct_9fa48("85267") ? "" : (stryCov_9fa48("85267"), 'eventError'), stryMutAct_9fa48("85268") ? {} : (stryCov_9fa48("85268"), {
            tableName,
            operation,
            key,
            causeId,
            error: error.message
          }));
          throw error;
        }
      }
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
    if (stryMutAct_9fa48("85269")) {
      {}
    } else {
      stryCov_9fa48("85269");
      if (stryMutAct_9fa48("85272") ? false : stryMutAct_9fa48("85271") ? true : stryMutAct_9fa48("85270") ? timestamp : (stryCov_9fa48("85270", "85271", "85272"), !timestamp)) {
        if (stryMutAct_9fa48("85273")) {
          {}
        } else {
          stryCov_9fa48("85273");
          return this.getLastAppliedTimestamp(tableName);
        }
      }
      const keyMap = this.getOrCreateLastAppliedTimestampKeyMap(tableName);
      if (stryMutAct_9fa48("85276") ? key !== null || key !== undefined : stryMutAct_9fa48("85275") ? false : stryMutAct_9fa48("85274") ? true : (stryCov_9fa48("85274", "85275", "85276"), (stryMutAct_9fa48("85278") ? key === null : stryMutAct_9fa48("85277") ? true : (stryCov_9fa48("85277", "85278"), key !== null)) && (stryMutAct_9fa48("85280") ? key === undefined : stryMutAct_9fa48("85279") ? true : (stryCov_9fa48("85279", "85280"), key !== undefined)))) {
        if (stryMutAct_9fa48("85281")) {
          {}
        } else {
          stryCov_9fa48("85281");
          const normalizedKey = String(key);
          const previousForKey = stryMutAct_9fa48("85284") ? keyMap.get(normalizedKey) && null : stryMutAct_9fa48("85283") ? false : stryMutAct_9fa48("85282") ? true : (stryCov_9fa48("85282", "85283", "85284"), keyMap.get(normalizedKey) || null);
          if (stryMutAct_9fa48("85287") ? !previousForKey && this.compareTimestampStrings(timestamp, previousForKey) >= 0 : stryMutAct_9fa48("85286") ? false : stryMutAct_9fa48("85285") ? true : (stryCov_9fa48("85285", "85286", "85287"), (stryMutAct_9fa48("85288") ? previousForKey : (stryCov_9fa48("85288"), !previousForKey)) || (stryMutAct_9fa48("85291") ? this.compareTimestampStrings(timestamp, previousForKey) < 0 : stryMutAct_9fa48("85290") ? this.compareTimestampStrings(timestamp, previousForKey) > 0 : stryMutAct_9fa48("85289") ? false : (stryCov_9fa48("85289", "85290", "85291"), this.compareTimestampStrings(timestamp, previousForKey) >= 0)))) {
            if (stryMutAct_9fa48("85292")) {
              {}
            } else {
              stryCov_9fa48("85292");
              keyMap.set(normalizedKey, timestamp);
            }
          }
        }
      }
      const previous = this.lastAppliedTimestamp.get(tableName);
      if (stryMutAct_9fa48("85295") ? !previous && this.compareTimestampStrings(timestamp, previous) >= 0 : stryMutAct_9fa48("85294") ? false : stryMutAct_9fa48("85293") ? true : (stryCov_9fa48("85293", "85294", "85295"), (stryMutAct_9fa48("85296") ? previous : (stryCov_9fa48("85296"), !previous)) || (stryMutAct_9fa48("85299") ? this.compareTimestampStrings(timestamp, previous) < 0 : stryMutAct_9fa48("85298") ? this.compareTimestampStrings(timestamp, previous) > 0 : stryMutAct_9fa48("85297") ? false : (stryCov_9fa48("85297", "85298", "85299"), this.compareTimestampStrings(timestamp, previous) >= 0)))) {
        if (stryMutAct_9fa48("85300")) {
          {}
        } else {
          stryCov_9fa48("85300");
          this.lastAppliedTimestamp.set(tableName, timestamp);
          return timestamp;
        }
      }
      return previous;
    }
  }

  /**
   * Resolve or initialize the per-table key timestamp map.
   * @param {string} tableName
   * @return {Map<string, string>}
   * @private
   */
  getOrCreateLastAppliedTimestampKeyMap(tableName) {
    if (stryMutAct_9fa48("85301")) {
      {}
    } else {
      stryCov_9fa48("85301");
      let keyMap = this.lastAppliedTimestampByKey.get(tableName);
      if (stryMutAct_9fa48("85303") ? false : stryMutAct_9fa48("85302") ? true : (stryCov_9fa48("85302", "85303"), keyMap instanceof Map)) {
        if (stryMutAct_9fa48("85304")) {
          {}
        } else {
          stryCov_9fa48("85304");
          return keyMap;
        }
      }
      keyMap = new Map();
      this.lastAppliedTimestampByKey.set(tableName, keyMap);
      return keyMap;
    }
  }

  /**
   * Get the last applied timestamp for one table/key pair.
   * @param {string} tableName
   * @param {string} key
   * @return {string|null}
   * @private
   */
  getLastAppliedTimestampForKey(tableName, key) {
    if (stryMutAct_9fa48("85305")) {
      {}
    } else {
      stryCov_9fa48("85305");
      if (stryMutAct_9fa48("85308") ? key === null && key === undefined : stryMutAct_9fa48("85307") ? false : stryMutAct_9fa48("85306") ? true : (stryCov_9fa48("85306", "85307", "85308"), (stryMutAct_9fa48("85310") ? key !== null : stryMutAct_9fa48("85309") ? false : (stryCov_9fa48("85309", "85310"), key === null)) || (stryMutAct_9fa48("85312") ? key !== undefined : stryMutAct_9fa48("85311") ? false : (stryCov_9fa48("85311", "85312"), key === undefined)))) {
        if (stryMutAct_9fa48("85313")) {
          {}
        } else {
          stryCov_9fa48("85313");
          return null;
        }
      }
      const keyMap = this.lastAppliedTimestampByKey.get(tableName);
      if (stryMutAct_9fa48("85316") ? false : stryMutAct_9fa48("85315") ? true : stryMutAct_9fa48("85314") ? keyMap instanceof Map : (stryCov_9fa48("85314", "85315", "85316"), !(keyMap instanceof Map))) {
        if (stryMutAct_9fa48("85317")) {
          {}
        } else {
          stryCov_9fa48("85317");
          return null;
        }
      }
      return stryMutAct_9fa48("85320") ? keyMap.get(String(key)) && null : stryMutAct_9fa48("85319") ? false : stryMutAct_9fa48("85318") ? true : (stryCov_9fa48("85318", "85319", "85320"), keyMap.get(String(key)) || null);
    }
  }

  /**
   * Compare two timestamp strings (prefers HLC ordering when possible).
   * @param {string} a
   * @param {string} b
   * @return {number}
   * @private
   */
  compareTimestampStrings(a, b) {
    if (stryMutAct_9fa48("85321")) {
      {}
    } else {
      stryCov_9fa48("85321");
      try {
        if (stryMutAct_9fa48("85322")) {
          {}
        } else {
          stryCov_9fa48("85322");
          const aTs = HLCTimestamp.fromString(a);
          const bTs = HLCTimestamp.fromString(b);
          return aTs.compare(bTs);
        }
      } catch {
        if (stryMutAct_9fa48("85323")) {
          {}
        } else {
          stryCov_9fa48("85323");
          return String(a).localeCompare(String(b));
        }
      }
    }
  }

  /**
   * Generate a unique event ID for deduplication.
   * @param {CDCEvent} event - CDC event.
   * @return {string} Event ID.
   * @private
   */
  generateEventId(event) {
    if (stryMutAct_9fa48("85324")) {
      {}
    } else {
      stryCov_9fa48("85324");
      return stryMutAct_9fa48("85325") ? `` : (stryCov_9fa48("85325"), `${event.tableName}:${event.operation}:${event.getKey()}:${event.timestamp}`);
    }
  }

  /**
   * Mark an event as processed for deduplication.
   * @param {CDCEvent} event - CDC event.
   * @private
   */
  markEventProcessed(event) {
    if (stryMutAct_9fa48("85326")) {
      {}
    } else {
      stryCov_9fa48("85326");
      const eventId = this.generateEventId(event);
      this.processedEventIds.add(eventId);

      // Limit size of processed set
      if (stryMutAct_9fa48("85330") ? this.processedEventIds.size <= this.maxProcessedEventIds : stryMutAct_9fa48("85329") ? this.processedEventIds.size >= this.maxProcessedEventIds : stryMutAct_9fa48("85328") ? false : stryMutAct_9fa48("85327") ? true : (stryCov_9fa48("85327", "85328", "85329", "85330"), this.processedEventIds.size > this.maxProcessedEventIds)) {
        if (stryMutAct_9fa48("85331")) {
          {}
        } else {
          stryCov_9fa48("85331");
          // Remove oldest entries (convert to array, slice, convert back)
          const entries = Array.from(this.processedEventIds);
          const toRemove = stryMutAct_9fa48("85332") ? entries : (stryCov_9fa48("85332"), entries.slice(0, stryMutAct_9fa48("85333") ? entries.length + this.maxProcessedEventIds : (stryCov_9fa48("85333"), entries.length - this.maxProcessedEventIds)));
          for (const id of toRemove) {
            if (stryMutAct_9fa48("85334")) {
              {}
            } else {
              stryCov_9fa48("85334");
              this.processedEventIds.delete(id);
            }
          }
        }
      }
    }
  }

  /**
   * Get the last applied timestamp for a table.
   * @param {string} tableName - System table name.
   * @return {string|null} Last applied HLC timestamp.
   */
  getLastAppliedTimestamp(tableName) {
    if (stryMutAct_9fa48("85335")) {
      {}
    } else {
      stryCov_9fa48("85335");
      return stryMutAct_9fa48("85338") ? this.lastAppliedTimestamp.get(tableName) && null : stryMutAct_9fa48("85337") ? false : stryMutAct_9fa48("85336") ? true : (stryCov_9fa48("85336", "85337", "85338"), this.lastAppliedTimestamp.get(tableName) || null);
    }
  }

  /**
   * Get buffer size for a table.
   * @param {string} tableName - System table name.
   * @return {number} Number of buffered events.
   */
  getBufferSize(tableName) {
    if (stryMutAct_9fa48("85339")) {
      {}
    } else {
      stryCov_9fa48("85339");
      const buffer = this.eventBuffer.get(tableName);
      return buffer ? buffer.length : 0;
    }
  }

  /**
   * Get total buffered event count.
   * @return {number} Total buffered events across all tables.
   */
  getTotalBufferedEvents() {
    if (stryMutAct_9fa48("85340")) {
      {}
    } else {
      stryCov_9fa48("85340");
      let total = 0;
      for (const buffer of this.eventBuffer.values()) {
        if (stryMutAct_9fa48("85341")) {
          {}
        } else {
          stryCov_9fa48("85341");
          stryMutAct_9fa48("85342") ? total -= buffer.length : (stryCov_9fa48("85342"), total += buffer.length);
        }
      }
      return total;
    }
  }

  /**
   * Get handler status.
   * @return {Object} Handler status.
   */
  getStatus() {
    if (stryMutAct_9fa48("85343")) {
      {}
    } else {
      stryCov_9fa48("85343");
      const bufferSizes = {};
      for (const [tableName, buffer] of this.eventBuffer) {
        if (stryMutAct_9fa48("85344")) {
          {}
        } else {
          stryCov_9fa48("85344");
          bufferSizes[tableName] = buffer.length;
        }
      }
      return stryMutAct_9fa48("85345") ? {} : (stryCov_9fa48("85345"), {
        initialized: this.initialized,
        subscriptions: Array.from(this.subscriptions),
        bufferSizes,
        totalBuffered: this.getTotalBufferedEvents(),
        processedEventCount: this.processedEventIds.size
      });
    }
  }

  /**
   * Shutdown the CDC handler.
   */
  shutdown() {
    if (stryMutAct_9fa48("85346")) {
      {}
    } else {
      stryCov_9fa48("85346");
      this.cancelScheduledFlush();

      // Flush remaining events
      this.flushAllBuffers();
      this.initialized = stryMutAct_9fa48("85347") ? true : (stryCov_9fa48("85347"), false);
      this.logger.debug(stryMutAct_9fa48("85348") ? "" : (stryCov_9fa48("85348"), 'CDC handler shutdown'));
      this.emit(stryMutAct_9fa48("85349") ? "" : (stryCov_9fa48("85349"), 'shutdown'));
    }
  }
}
export { CDCHandler, CDCEvent, CDC_OPERATIONS };