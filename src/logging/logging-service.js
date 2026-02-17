/**
 * Logging Service - Structured logging with pino.
 * Provides centralized logging with buffering during bootstrap.
 * Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 28.1, 28.2, 28.3, 28.4, 28.5
 */

import pino from 'pino';
import {v4 as uuidv4} from 'uuid';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {CONFIG_KEY} from '../config/config-constants.js';
import {METRICS_LOG_PREFIX} from '../constants/metrics-constants.js';
import {
  LOG_LEVELS,
  LOGGING_DEFAULT,
  LOGGING_DIAGNOSTICS_DEFAULT,
  LOGGING_LOG_MSG,
  LOGGING_PRETTY,
} from './logging-constants.js';

const LOGGING_DIAGNOSTICS_UNKNOWN_SUBSYSTEM = 'unknown';
const LOGGING_LEVEL_FALLBACK = LOGGING_DEFAULT.LEVEL;
const LOGGING_LEVEL_INDEX = Object.freeze(
  LOG_LEVELS.reduce((result, level, index) => {
    result[level] = index;
    return result;
  }, {}),
);

/**
 * LoggingService provides structured logging with bootstrap buffering.
 */
class LoggingService {
  static instance = null;

  /**
   * Create a new LoggingService instance.
   * @private
   */
  constructor() {
    this.buffer = [];
    this.logsTableReady = false;
    this.maxBufferSize = LOGGING_DEFAULT.MAX_BUFFER_SIZE;
    this.flushCallback = null;
    this.nodeId = null;
    this.logger = null;
    this.initialized = false;
    this.showMetricsInConsole = LOGGING_DEFAULT.SHOW_METRICS_IN_CONSOLE;
    this.persistMetricsLogs = LOGGING_DEFAULT.PERSIST_METRICS_LOGS;
    this.level = LOGGING_LEVEL_FALLBACK;
    this.levelPriority = this.getLogLevelPriority(LOGGING_LEVEL_FALLBACK);
    this.diagnostics = this.createDiagnosticsState();
  }

  /**
   * Get the singleton instance.
   * @return {LoggingService} The logging service instance.
   */
  static getInstance() {
    if (!LoggingService.instance) {
      LoggingService.instance = new LoggingService();
    }
    return LoggingService.instance;
  }

  /**
   * Reset the singleton instance (for testing).
   */
  static resetInstance() {
    LoggingService.instance = null;
  }

  /**
   * Initialize the logging service.
   * @param {Object} options - Configuration options.
   * @param {boolean} [options.showMetricsInConsole] - Enable console output
   *   for `metrics.*` log tags (disabled by default).
   * @param {boolean} [options.persistMetricsLogs] - Persist `metrics.*` logs
   *   into logs-table buffering/write pipeline.
   */
  initialize(options = {}) {
    const config = ConfigurationManager.getInstance();

    this.nodeId = options.nodeId || config.get(CONFIG_KEY.NODE_ID) || LOGGING_DEFAULT.NODE_ID;
    this.maxBufferSize =
      options.bufferSize || config.get(CONFIG_KEY.LOGGING_BUFFER_SIZE) ||
      LOGGING_DEFAULT.MAX_BUFFER_SIZE;

    const configuredLevel =
      options.level || config.get(CONFIG_KEY.LOGGING_LEVEL) || LOGGING_DEFAULT.LEVEL;
    this.level = this.normalizeLogLevel(configuredLevel);
    this.levelPriority = this.getLogLevelPriority(this.level);
    const prettyPrint =
      options.prettyPrint ?? config.get(CONFIG_KEY.LOGGING_PRETTY_PRINT) ??
      LOGGING_DEFAULT.PRETTY_PRINT;
    this.showMetricsInConsole =
      options.showMetricsInConsole ??
      LOGGING_DEFAULT.SHOW_METRICS_IN_CONSOLE;
    this.persistMetricsLogs =
      options.persistMetricsLogs ??
      config.get(CONFIG_KEY.LOGGING_PERSIST_METRICS_LOGS) ??
      LOGGING_DEFAULT.PERSIST_METRICS_LOGS;

    // Configure pino logger
    const pinoOptions = {
      level: this.level,
      base: {
        nodeId: this.nodeId,
        pid: process.pid,
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    };

    if (prettyPrint) {
      this.logger = pino(pinoOptions, pino.transport({
        target: LOGGING_PRETTY.TARGET,
        options: {
          colorize: LOGGING_PRETTY.COLORIZE,
          translateTime: LOGGING_PRETTY.TRANSLATE_TIME,
          singleLine: LOGGING_PRETTY.SINGLE_LINE,
        },
      }));
    } else {
      this.logger = pino(pinoOptions);
    }

    this.initialized = true;
  }

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
      subsystemCounts: new Map(),
      metricTagCounts: new Map(),
    };
  }

  /**
   * Create a log entry with metadata.
   * @param {string} level - Log level.
   * @param {string} message - Log message.
   * @param {Object} context - Additional context.
   * @return {Object} Log entry object.
   * @private
   */
  createLogEntry(level, message, context = {}) {
    return {
      logId: uuidv4(),
      timestamp: Date.now(),
      level: level.toUpperCase(),
      nodeId: this.nodeId,
      subsystem: context.subsystem || null,
      serviceId: context.serviceId || null,
      serviceType: context.serviceType || null,
      message,
      traceId: context.traceId || null,
      metadata: context,
      createdAt: Date.now(),
    };
  }

  /**
   * Check whether a log message belongs to the metrics namespace.
   * @param {*} message - Log message value.
   * @return {boolean} True when message starts with metrics namespace prefix.
   * @private
   */
  isMetricsLogMessage(message) {
    return typeof message === 'string' &&
      message.startsWith(METRICS_LOG_PREFIX);
  }

  /**
   * Normalize log level input to the canonical lowercase value.
   * @param {string} level
   * @return {string}
   * @private
   */
  normalizeLogLevel(level) {
    if (typeof level !== 'string') {
      return LOGGING_LEVEL_FALLBACK;
    }
    const normalized = level.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(LOGGING_LEVEL_INDEX, normalized)) {
      return normalized;
    }
    return LOGGING_LEVEL_FALLBACK;
  }

  /**
   * Resolve numeric priority for a log level.
   * @param {string} level
   * @return {number}
   * @private
   */
  getLogLevelPriority(level) {
    const normalized = this.normalizeLogLevel(level);
    return LOGGING_LEVEL_INDEX[normalized];
  }

  /**
   * Check whether a log level is enabled by current logger level.
   * @param {string} level
   * @return {boolean}
   * @private
   */
  isLogLevelEnabled(level) {
    return this.getLogLevelPriority(level) >= this.levelPriority;
  }

  /**
   * Record diagnostics counters for a log invocation.
   * @param {Object} options
   * @param {boolean} options.isLevelEnabled
   * @param {boolean} options.isMetricsMessage
   * @param {boolean} options.shouldWriteToConsole
   * @param {boolean} options.shouldPersist
   * @param {string} options.message
   * @param {Object} options.context
   * @private
   */
  recordDiagnostics(options) {
    const isLevelEnabled = options.isLevelEnabled;
    const isMetricsMessage = options.isMetricsMessage;
    const shouldWriteToConsole = options.shouldWriteToConsole;
    const shouldPersist = options.shouldPersist;
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
  }

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
  }

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
  }

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
      level: this.level,
      persistMetricsLogs: this.persistMetricsLogs,
      showMetricsInConsole: this.showMetricsInConsole,
      bufferSize: this.buffer.length,
      logsTableReady: this.logsTableReady,
      topSubsystems: this.getTopCounterEntries(
        this.diagnostics.subsystemCounts,
        'subsystem',
      ),
      topMetricTags: this.getTopCounterEntries(
        this.diagnostics.metricTagCounts,
        'tag',
      ),
    };
  }

  /**
   * Log a message at the specified level.
   * @param {string} level - Log level.
   * @param {string} message - Log message.
   * @param {Object} context - Additional context.
   */
  log(level, message, context = {}) {
    const normalizedLevel = this.normalizeLogLevel(level);
    const isLevelEnabled = this.isLogLevelEnabled(normalizedLevel);
    const isMetricsMessage = this.isMetricsLogMessage(message);
    const shouldWriteToConsole = isLevelEnabled &&
      (this.showMetricsInConsole || !isMetricsMessage);
    const shouldPersist = isLevelEnabled &&
      (this.persistMetricsLogs || !isMetricsMessage);

    this.recordDiagnostics({
      isLevelEnabled,
      isMetricsMessage,
      shouldWriteToConsole,
      shouldPersist,
      message,
      context,
    });

    if (!this.initialized) {
      // Fallback to console during pre-initialization
      if (shouldWriteToConsole) {
        console.log(JSON.stringify({level: normalizedLevel, message, ...context}));
      }
      return;
    }

    // Log to pino
    if (shouldWriteToConsole) {
      this.logger[normalizedLevel]({...context, nodeId: this.nodeId}, message);
    }

    if (!shouldPersist) {
      return;
    }

    const entry = this.createLogEntry(normalizedLevel, message, context);

    // Buffer during bootstrap
    if (!this.logsTableReady) {
      this.buffer.push(entry);

      // Prevent unbounded growth
      if (this.buffer.length > this.maxBufferSize) {
        this.buffer.shift();
      }
    } else if (this.flushCallback) {
      // Write to logs table
      this.flushCallback(entry);
    }
  }

  /**
   * Log a trace message.
   * @param {string} message - Log message.
   * @param {Object} context - Additional context.
   */
  trace(message, context = {}) {
    this.log('trace', message, context);
  }

  /**
   * Log a debug message.
   * @param {string} message - Log message.
   * @param {Object} context - Additional context.
   */
  debug(message, context = {}) {
    this.log('debug', message, context);
  }

  /**
   * Log an info message.
   * @param {string} message - Log message.
   * @param {Object} context - Additional context.
   */
  info(message, context = {}) {
    this.log('info', message, context);
  }

  /**
   * Log a warning message.
   * @param {string} message - Log message.
   * @param {Object} context - Additional context.
   */
  warn(message, context = {}) {
    this.log('warn', message, context);
  }

  /**
   * Log an error message.
   * @param {string} message - Log message.
   * @param {Object} context - Additional context.
   */
  error(message, context = {}) {
    this.log('error', message, context);
  }

  /**
   * Log a fatal message.
   * @param {string} message - Log message.
   * @param {Object} context - Additional context.
   */
  fatal(message, context = {}) {
    this.log('fatal', message, context);
  }

  /**
   * Create a child logger with additional context.
   * @param {Object} bindings - Additional bindings for the child logger.
   * @return {Object} Child logger interface.
   */
  child(bindings) {
    const childContext = {...bindings};
    const parent = this;

    return {
      trace: (msg, ctx = {}) => parent.trace(msg, {...childContext, ...ctx}),
      debug: (msg, ctx = {}) => parent.debug(msg, {...childContext, ...ctx}),
      info: (msg, ctx = {}) => parent.info(msg, {...childContext, ...ctx}),
      warn: (msg, ctx = {}) => parent.warn(msg, {...childContext, ...ctx}),
      error: (msg, ctx = {}) => parent.error(msg, {...childContext, ...ctx}),
      fatal: (msg, ctx = {}) => parent.fatal(msg, {...childContext, ...ctx}),
      child: (moreBindings) => parent.child({...childContext, ...moreBindings}),
    };
  }

  /**
   * Create a logger for a specific subsystem.
   * This makes it easy to filter logs by subsystem name.
   * @param {string} subsystemName - Name of the subsystem (e.g., 'config', 'hlc', 'raft').
   * @return {Object} Subsystem-specific logger interface.
   */
  forSubsystem(subsystemName) {
    return this.child({subsystem: subsystemName});
  }

  /**
   * Mark the logs table as ready and flush buffered entries.
   * @param {Function} writeCallback - Callback to write entries to logs table.
   * @return {Promise<number>} Number of entries flushed.
   */
  async onLogsTableReady(writeCallback) {
    this.logsTableReady = true;
    this.flushCallback = writeCallback;

    this.info(LOGGING_LOG_MSG.LOGS_TABLE_READY, {
      bufferedEntries: this.buffer.length,
    });

    // Flush buffered entries
    const flushedCount = this.buffer.length;
    for (const entry of this.buffer) {
      if (writeCallback) {
        await writeCallback(entry);
      }
    }

    this.buffer = [];
    return flushedCount;
  }

  /**
   * Get the current buffer size.
   * @return {number} Number of buffered entries.
   */
  getBufferSize() {
    return this.buffer.length;
  }

  /**
   * Check if the logs table is ready.
   * @return {boolean} True if logs table is ready.
   */
  isLogsTableReady() {
    return this.logsTableReady;
  }

  /**
   * Check if the service is initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    return this.initialized;
  }

  /**
   * Get the node ID.
   * @return {string} The node ID.
   */
  getNodeId() {
    return this.nodeId;
  }

  /**
   * Get the underlying pino logger.
   * @return {Object} The pino logger instance.
   */
  getPinoLogger() {
    return this.logger;
  }

  /**
   * Update metrics persistence toggle at runtime.
   * @param {boolean} persistMetricsLogs - True to persist metrics logs.
   * @return {boolean} True when the update was applied.
   */
  setPersistMetricsLogs(persistMetricsLogs) {
    if (typeof persistMetricsLogs !== 'boolean') {
      return false;
    }

    this.persistMetricsLogs = persistMetricsLogs;
    return true;
  }

  /**
   * Shutdown the logging service.
   * Flushes any pending logs and releases resources.
   * @return {Promise<void>}
   */
  async shutdown() {
    if (this.logger && typeof this.logger.flush === 'function') {
      this.logger.flush();
    }
    this.initialized = false;
  }
}

export {LoggingService, LOG_LEVELS};
