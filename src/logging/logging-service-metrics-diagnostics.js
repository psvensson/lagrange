/**
 * LoggingService metrics policy and diagnostics prototype helpers.
 */

import {METRICS_LOG_PREFIX} from '../constants/metrics-constants.js';
import {
  LOG_LEVELS,
  LOGGING_DEFAULT,
  LOGGING_DIAGNOSTICS_DEFAULT,
} from './logging-constants.js';

const LOCAL_NUM_ONE_THOUSAND = 1000;
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
      totalLogs: 0,
      metricsLogs: 0,
      nonMetricsLogs: 0,
      logsSuppressedByLevel: 0,
      metricsSuppressedFromConsole: 0,
      metricsSuppressedFromPersistence: 0,
      metricsSuppressedByResolution: 0,
      metricsSuppressedByDetailedWindow: 0,
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
      return 0;
    }
    return Math.max(
      0,
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
    const resolutionMs = Math.max(0, this.metricsDefaultResolutionMs);
    const lastEmissionMs = !detailedWindowActive && resolutionMs > 0 ?
      this.metricsLastEmissionByTag.get(message) :
      undefined;
    const suppressReason =
      this.isDetailedMetricsContext(context) && !detailedWindowActive ?
        LOGGING_METRICS_SUPPRESS_REASON.DETAILED_WINDOW :
        !detailedWindowActive &&
          resolutionMs > 0 &&
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
   * Check whether a level is enabled for PERSISTENCE to the logs table. Separate
   * from console gating so an investigation run can raise the console level (e.g.
   * to debug, capturing the per-tick decision trace in stdout) WITHOUT lowering
   * the persistence threshold and flooding the logs table — which matters when
   * that table rides a distributed write path that may itself be stalled.
   * Defaults to the console threshold when no separate persist level is set, so
   * existing single-level behavior is unchanged.
   * @param {string} level
   * @return {boolean}
   * @private
   */
  isPersistLevelEnabled(level) {
    const persistPriority =
      typeof this.persistLevelPriority === 'number' ?
        this.persistLevelPriority :
        this.levelPriority;
    return this.getLogLevelPriority(level) >= persistPriority;
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
      this.diagnostics.logsSuppressedByLevel += 1;
      return;
    }

    this.diagnostics.totalLogs += 1;
    if (isMetricsMessage) {
      this.diagnostics.metricsLogs += 1;
      if (!shouldWriteToConsole) {
        this.diagnostics.metricsSuppressedFromConsole += 1;
      }
      if (!shouldPersist) {
        this.diagnostics.metricsSuppressedFromPersistence += 1;
      }
      if (metricsSuppressReason ===
        LOGGING_METRICS_SUPPRESS_REASON.RESOLUTION) {
        this.diagnostics.metricsSuppressedByResolution += 1;
      }
      if (metricsSuppressReason ===
        LOGGING_METRICS_SUPPRESS_REASON.DETAILED_WINDOW) {
        this.diagnostics.metricsSuppressedByDetailedWindow += 1;
      }
      this.incrementBoundedCounter(
        this.diagnostics.metricTagCounts,
        message,
        LOGGING_DIAGNOSTICS_DEFAULT.MAX_METRIC_TAG_CARDINALITY,
      );
    } else {
      this.diagnostics.nonMetricsLogs += 1;
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
      map.set(key, map.get(key) + 1);
      return;
    }
    if (map.size >= maxCardinality) {
      return;
    }
    map.set(key, 1);
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
      .sort((left, right) => right[1] - left[1])
      .slice(0, LOGGING_DIAGNOSTICS_DEFAULT.TOP_LIMIT)
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
      metricsDefaultResolutionMs < 0) {
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
      metricsDetailedWindowTtlMs < LOCAL_NUM_ONE_THOUSAND) {
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
