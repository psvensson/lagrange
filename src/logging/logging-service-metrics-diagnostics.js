/**
 * LoggingService metrics policy and diagnostics prototype helpers.
 */

import {METRICS_LOG_PREFIX} from '../constants/metrics-constants.js';
import {
  LOG_LEVELS,
  LOGGING_DEFAULT,
  LOGGING_DIAGNOSTICS_DEFAULT,
} from './logging-constants.js';

const LOCAL_NUM_ZERO = 0;
const LOCAL_NUM_ONE = 1;
const LOCAL_NUM_1000 = 1000;
const LOCAL_STR_STRING = 'string';
const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_BOOLEAN = 'boolean';
const LOCAL_STR_SUBSYSTEM = 'subsystem';
const LOCAL_STR_TAG = 'tag';

const LOGGING_DIAGNOSTICS_UNKNOWN_SUBSYSTEM = 'unknown';
const LOGGING_LEVEL_FALLBACK = LOGGING_DEFAULT.LEVEL;
const LOGGING_LEVEL_INDEX = Object.freeze(
  LOG_LEVELS.reduce((result, level, index) => {
    result[level] = index;
    return result;
  }, {}),
);

const LOGGING_METRICS_SUPPRESS_REASON = Object.freeze({
  NONE: null,
  RESOLUTION: 'resolution',
  DETAILED_WINDOW: 'detailedWindow',
});

const LOGGING_METRICS_DETAIL_LEVEL = Object.freeze({
  DETAILED: 'detailed',
  TIER_B_SHORT: 'b',
  TIER_B: 'tier_b',
});

const LOGGING_SERVICE_METRICS_DIAGNOSTICS_METHODS = {
  /**
   * Create diagnostics state counters.
   * @return {Object}
   * @private
   */
  createDiagnosticsState() {
    return {
      totalLogs: LOCAL_NUM_ZERO,
      metricsLogs: LOCAL_NUM_ZERO,
      nonMetricsLogs: LOCAL_NUM_ZERO,
      logsSuppressedByLevel: LOCAL_NUM_ZERO,
      metricsSuppressedFromConsole: LOCAL_NUM_ZERO,
      metricsSuppressedFromPersistence: LOCAL_NUM_ZERO,
      metricsSuppressedByResolution: LOCAL_NUM_ZERO,
      metricsSuppressedByDetailedWindow: LOCAL_NUM_ZERO,
      subsystemCounts: new Map(),
      metricTagCounts: new Map(),
    };
  },

  /**
   * Check whether a log message belongs to the metrics namespace.
   * @param {*} message - Log message value.
   * @return {boolean} True when message starts with metrics namespace prefix.
   * @private
   */
  isMetricsLogMessage(message) {
    return typeof message === LOCAL_STR_STRING &&
      message.startsWith(METRICS_LOG_PREFIX);
  },

  /**
   * Determine whether metrics context requests high-detail Tier-B logging.
   * @param {Object} context
   * @return {boolean}
   * @private
   */
  isDetailedMetricsContext(context = {}) {
    if (!context || typeof context !== LOCAL_STR_OBJECT) {
      return false;
    }
    if (context.metricsDetailed === true) {
      return true;
    }

    const detailLevel = typeof context.metricsDetailLevel === LOCAL_STR_STRING ?
      context.metricsDetailLevel.toLowerCase() :
      null;
    if (detailLevel === LOGGING_METRICS_DETAIL_LEVEL.DETAILED) {
      return true;
    }

    const tier = typeof context.metricsTier === LOCAL_STR_STRING ?
      context.metricsTier.toLowerCase() :
      null;
    return tier === LOGGING_METRICS_DETAIL_LEVEL.TIER_B ||
      tier === LOGGING_METRICS_DETAIL_LEVEL.TIER_B_SHORT;
  },

  /**
   * Check if the detailed metrics debug window is currently active.
   * @param {number} [nowMs]
   * @return {boolean}
   * @private
   */
  isMetricsDetailedWindowActive(nowMs = Date.now()) {
    if (!this.metricsDetailedWindowEnabled) {
      return false;
    }

    if (!Number.isFinite(this.metricsDetailedWindowExpiresAtMs)) {
      return false;
    }

    if (nowMs >= this.metricsDetailedWindowExpiresAtMs) {
      this.metricsDetailedWindowEnabled = false;
      this.metricsDetailedWindowExpiresAtMs = null;
      return false;
    }

    return true;
  },

  /**
   * Return remaining detailed debug window lifetime in milliseconds.
   * @param {number} [nowMs]
   * @return {number}
   * @private
   */
  getMetricsDetailedWindowRemainingMs(nowMs = Date.now()) {
    if (!this.isMetricsDetailedWindowActive(nowMs)) {
      return LOCAL_NUM_ZERO;
    }
    return Math.max(
      LOCAL_NUM_ZERO,
      this.metricsDetailedWindowExpiresAtMs - nowMs,
    );
  },

  /**
   * Track last successful metrics emission timestamp for a tag.
   * @param {string} tag
   * @param {number} nowMs
   * @private
   */
  setMetricsTagLastEmission(tag, nowMs) {
    if (this.metricsLastEmissionByTag.has(tag)) {
      this.metricsLastEmissionByTag.set(tag, nowMs);
      return;
    }

    if (this.metricsLastEmissionByTag.size >=
      LOGGING_DIAGNOSTICS_DEFAULT.MAX_METRIC_TAG_CARDINALITY) {
      return;
    }

    this.metricsLastEmissionByTag.set(tag, nowMs);
  },

  /**
   * Resolve whether a metrics log should be emitted in current policy state.
   * @param {string} message
   * @param {Object} context
   * @return {{shouldEmit: boolean, suppressReason: string|null}}
   * @private
   */
  shouldEmitMetricsMessage(message, context = {}) {
    const nowMs = Date.now();
    const detailedWindowActive = this.isMetricsDetailedWindowActive(nowMs);
    const resolutionMs = Math.max(LOCAL_NUM_ZERO, this.metricsDefaultResolutionMs);
    const lastEmissionMs = !detailedWindowActive && resolutionMs > LOCAL_NUM_ZERO ?
      this.metricsLastEmissionByTag.get(message) :
      undefined;
    const suppressReason =
      this.isDetailedMetricsContext(context) && !detailedWindowActive ?
        LOGGING_METRICS_SUPPRESS_REASON.DETAILED_WINDOW :
        !detailedWindowActive &&
          resolutionMs > LOCAL_NUM_ZERO &&
          Number.isFinite(lastEmissionMs) &&
          (nowMs - lastEmissionMs) < resolutionMs ?
          LOGGING_METRICS_SUPPRESS_REASON.RESOLUTION :
          LOGGING_METRICS_SUPPRESS_REASON.NONE;
    const shouldEmit =
      suppressReason === LOGGING_METRICS_SUPPRESS_REASON.NONE;

    if (shouldEmit) {
      this.setMetricsTagLastEmission(message, nowMs);
    }
    return {
      shouldEmit,
      suppressReason,
    };
  },

  /**
   * Normalize log level input to the canonical lowercase value.
   * @param {string} level
   * @return {string}
   * @private
   */
  normalizeLogLevel(level) {
    if (typeof level !== LOCAL_STR_STRING) {
      return LOGGING_LEVEL_FALLBACK;
    }
    const normalized = level.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(LOGGING_LEVEL_INDEX, normalized)) {
      return normalized;
    }
    return LOGGING_LEVEL_FALLBACK;
  },

  /**
   * Resolve numeric priority for a log level.
   * @param {string} level
   * @return {number}
   * @private
   */
  getLogLevelPriority(level) {
    const normalized = this.normalizeLogLevel(level);
    return LOGGING_LEVEL_INDEX[normalized];
  },

  /**
   * Check whether a log level is enabled by current logger level.
   * @param {string} level
   * @return {boolean}
   * @private
   */
  isLogLevelEnabled(level) {
    return this.getLogLevelPriority(level) >= this.levelPriority;
  },

  /**
   * Record diagnostics counters for a log invocation.
   * @param {Object} options
   * @param {boolean} options.isLevelEnabled
   * @param {boolean} options.isMetricsMessage
   * @param {boolean} options.shouldWriteToConsole
   * @param {boolean} options.shouldPersist
   * @param {string|null} options.metricsSuppressReason
   * @param {string} options.message
   * @param {Object} options.context
   * @private
   */
  recordDiagnostics(options) {
    const isLevelEnabled = options.isLevelEnabled;
    const isMetricsMessage = options.isMetricsMessage;
    const shouldWriteToConsole = options.shouldWriteToConsole;
    const shouldPersist = options.shouldPersist;
    const metricsSuppressReason = options.metricsSuppressReason;
    const message = options.message;
    const context = options.context || {};

    if (!isLevelEnabled) {
      this.diagnostics.logsSuppressedByLevel += LOCAL_NUM_ONE;
      return;
    }

    this.diagnostics.totalLogs += LOCAL_NUM_ONE;
    if (isMetricsMessage) {
      this.diagnostics.metricsLogs += LOCAL_NUM_ONE;
      if (!shouldWriteToConsole) {
        this.diagnostics.metricsSuppressedFromConsole += LOCAL_NUM_ONE;
      }
      if (!shouldPersist) {
        this.diagnostics.metricsSuppressedFromPersistence += LOCAL_NUM_ONE;
      }
      if (metricsSuppressReason ===
        LOGGING_METRICS_SUPPRESS_REASON.RESOLUTION) {
        this.diagnostics.metricsSuppressedByResolution += LOCAL_NUM_ONE;
      }
      if (metricsSuppressReason ===
        LOGGING_METRICS_SUPPRESS_REASON.DETAILED_WINDOW) {
        this.diagnostics.metricsSuppressedByDetailedWindow += LOCAL_NUM_ONE;
      }
      this.incrementBoundedCounter(
        this.diagnostics.metricTagCounts,
        message,
        LOGGING_DIAGNOSTICS_DEFAULT.MAX_METRIC_TAG_CARDINALITY,
      );
    } else {
      this.diagnostics.nonMetricsLogs += LOCAL_NUM_ONE;
    }

    const subsystem = context.subsystem || LOGGING_DIAGNOSTICS_UNKNOWN_SUBSYSTEM;
    this.incrementBoundedCounter(
      this.diagnostics.subsystemCounts,
      subsystem,
      LOGGING_DIAGNOSTICS_DEFAULT.MAX_SUBSYSTEM_CARDINALITY,
    );
  },

  /**
   * Increment a bounded map counter.
   * @param {Map<string, number>} map
   * @param {string} key
   * @param {number} maxCardinality
   * @private
   */
  incrementBoundedCounter(map, key, maxCardinality) {
    if (map.has(key)) {
      map.set(key, map.get(key) + LOCAL_NUM_ONE);
      return;
    }
    if (map.size >= maxCardinality) {
      return;
    }
    map.set(key, LOCAL_NUM_ONE);
  },

  /**
   * Convert counter map to sorted top entries.
   * @param {Map<string, number>} map
   * @param {string} fieldName
   * @return {Object[]}
   * @private
   */
  getTopCounterEntries(map, fieldName) {
    return [...map.entries()]
      .sort((left, right) => right[LOCAL_NUM_ONE] - left[LOCAL_NUM_ONE])
      .slice(LOCAL_NUM_ZERO, LOGGING_DIAGNOSTICS_DEFAULT.TOP_LIMIT)
      .map(([name, count]) => ({[fieldName]: name, count}));
  },

  /**
   * Get logging diagnostics counters.
   * @return {Object}
   */
  getDiagnosticsStats() {
    return {
      totalLogs: this.diagnostics.totalLogs,
      metricsLogs: this.diagnostics.metricsLogs,
      nonMetricsLogs: this.diagnostics.nonMetricsLogs,
      logsSuppressedByLevel: this.diagnostics.logsSuppressedByLevel,
      metricsSuppressedFromConsole:
        this.diagnostics.metricsSuppressedFromConsole,
      metricsSuppressedFromPersistence:
        this.diagnostics.metricsSuppressedFromPersistence,
      metricsSuppressedByResolution:
        this.diagnostics.metricsSuppressedByResolution,
      metricsSuppressedByDetailedWindow:
        this.diagnostics.metricsSuppressedByDetailedWindow,
      level: this.level,
      persistMetricsLogs: this.persistMetricsLogs,
      showMetricsInConsole: this.showMetricsInConsole,
      metricsDefaultResolutionMs: this.metricsDefaultResolutionMs,
      metricsDetailedWindowEnabled: this.metricsDetailedWindowEnabled,
      metricsDetailedWindowTtlMs: this.metricsDetailedWindowTtlMs,
      metricsDetailedWindowRemainingMs:
        this.getMetricsDetailedWindowRemainingMs(),
      bufferSize: this.buffer.length,
      logsTableReady: this.logsTableReady,
      topSubsystems: this.getTopCounterEntries(
        this.diagnostics.subsystemCounts,
        LOCAL_STR_SUBSYSTEM,
      ),
      topMetricTags: this.getTopCounterEntries(
        this.diagnostics.metricTagCounts,
        LOCAL_STR_TAG,
      ),
    };
  },

  /**
   * Update metrics persistence toggle at runtime.
   * @param {boolean} persistMetricsLogs - True to persist metrics logs.
   * @return {boolean} True when the update was applied.
   */
  setPersistMetricsLogs(persistMetricsLogs) {
    if (typeof persistMetricsLogs !== LOCAL_STR_BOOLEAN) {
      return false;
    }

    this.persistMetricsLogs = persistMetricsLogs;
    return true;
  },

  /**
   * Update default metrics emission resolution at runtime.
   * @param {number} metricsDefaultResolutionMs
   * @return {boolean} True when the update was applied.
   */
  setMetricsDefaultResolutionMs(metricsDefaultResolutionMs) {
    if (!Number.isFinite(metricsDefaultResolutionMs) ||
      metricsDefaultResolutionMs < LOCAL_NUM_ZERO) {
      return false;
    }

    this.metricsDefaultResolutionMs = Math.floor(metricsDefaultResolutionMs);
    return true;
  },

  /**
   * Update detailed metrics window TTL at runtime.
   * @param {number} metricsDetailedWindowTtlMs
   * @return {boolean} True when the update was applied.
   */
  setMetricsDetailedWindowTtlMs(metricsDetailedWindowTtlMs) {
    if (!Number.isFinite(metricsDetailedWindowTtlMs) ||
      metricsDetailedWindowTtlMs < LOCAL_NUM_1000) {
      return false;
    }

    this.metricsDetailedWindowTtlMs = Math.floor(metricsDetailedWindowTtlMs);
    if (this.metricsDetailedWindowEnabled) {
      this.metricsDetailedWindowExpiresAtMs =
        Date.now() + this.metricsDetailedWindowTtlMs;
    }
    return true;
  },

  /**
   * Enable or disable detailed Tier-B metrics emission window.
   * @param {boolean} metricsDetailedWindowEnabled
   * @return {boolean} True when the update was applied.
   */
  setMetricsDetailedWindowEnabled(metricsDetailedWindowEnabled) {
    if (typeof metricsDetailedWindowEnabled !== LOCAL_STR_BOOLEAN) {
      return false;
    }

    this.metricsDetailedWindowEnabled = metricsDetailedWindowEnabled;
    if (metricsDetailedWindowEnabled) {
      this.metricsDetailedWindowExpiresAtMs =
        Date.now() + this.metricsDetailedWindowTtlMs;
    } else {
      this.metricsDetailedWindowExpiresAtMs = null;
    }
    return true;
  },
};

function installLoggingServiceMetricsDiagnostics(LoggingServiceClass) {
  const descriptors = Object.fromEntries(
    Object.entries(LOGGING_SERVICE_METRICS_DIAGNOSTICS_METHODS)
      .map(([name, value]) => [name, {
        value,
        writable: true,
        configurable: true,
      }]),
  );
  Object.defineProperties(LoggingServiceClass.prototype, descriptors);
}

export {
  LOGGING_METRICS_SUPPRESS_REASON,
  installLoggingServiceMetricsDiagnostics,
};
