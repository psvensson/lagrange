/**
 * Logging Service - Structured logging with pino.
 * Provides centralized logging with buffering during bootstrap.
 * Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 28.1, 28.2, 28.3, 28.4, 28.5
 */

import pino from 'pino';
import {v4 as uuidv4} from 'uuid';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {CONFIG_KEY} from '../config/config-constants.js';
import {
  LOG_LEVELS,
  LOGGING_DEFAULT,
  LOGGING_LOG_MSG,
  LOGGING_PRETTY,
} from './logging-constants.js';
import {
  LOGGING_METRICS_SUPPRESS_REASON,
  installLoggingServiceMetricsDiagnostics,
} from './logging-service-metrics-diagnostics.js';

const LOCAL_NUM_ZERO = 0;
const LOCAL_STR_TRACE = 'trace';
const LOCAL_STR_DEBUG = 'debug';
const LOCAL_STR_INFO = 'info';
const LOCAL_STR_WARN = 'warn';
const LOCAL_STR_ERROR = 'error';
const LOCAL_STR_FATAL = 'fatal';
const LOCAL_STR_BACKGROUND = 'background';
const LOCAL_NUM_10 = 10;
const LOCAL_STR_KRDOX = 'metrics.logging.buffer_flush.background.started';
const LOCAL_STR_FUNCTION = 'function';

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
    this.metricsDefaultResolutionMs =
      LOGGING_DEFAULT.METRICS_DEFAULT_RESOLUTION_MS;
    this.metricsDetailedWindowEnabled =
      LOGGING_DEFAULT.METRICS_DETAILED_WINDOW_ENABLED;
    this.metricsDetailedWindowTtlMs =
      LOGGING_DEFAULT.METRICS_DETAILED_WINDOW_TTL_MS;
    this.metricsDetailedWindowExpiresAtMs = null;
    this.metricsLastEmissionByTag = new Map();
    this.level = LOGGING_DEFAULT.LEVEL;
    this.levelPriority = this.getLogLevelPriority(LOGGING_DEFAULT.LEVEL);
    this.persistLevel = LOGGING_DEFAULT.LEVEL;
    this.persistLevelPriority = this.getLogLevelPriority(LOGGING_DEFAULT.LEVEL);
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
   * @param {number} [options.metricsDefaultResolutionMs] - Default per-tag
   *   emission resolution for `metrics.*` logs.
   * @param {boolean} [options.metricsDetailedWindowEnabled] - Enable
   *   high-detail metrics for a bounded debug window.
   * @param {number} [options.metricsDetailedWindowTtlMs] - TTL in
   *   milliseconds for the high-detail metrics debug window.
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
    // Persistence threshold defaults to the console level (unchanged behavior).
    // When given separately (e.g. --debug-logs sets console=debug, persist=info)
    // debug detail reaches stdout without flooding the logs table.
    const configuredPersistLevel = options.persistLevel || this.level;
    this.persistLevel = this.normalizeLogLevel(configuredPersistLevel);
    this.persistLevelPriority = this.getLogLevelPriority(this.persistLevel);
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
    this.setMetricsDefaultResolutionMs(
      options.metricsDefaultResolutionMs ??
      config.get(CONFIG_KEY.LOGGING_METRICS_DEFAULT_RESOLUTION_MS) ??
      LOGGING_DEFAULT.METRICS_DEFAULT_RESOLUTION_MS,
    );
    this.setMetricsDetailedWindowTtlMs(
      options.metricsDetailedWindowTtlMs ??
      config.get(CONFIG_KEY.LOGGING_METRICS_DETAILED_WINDOW_TTL_MS) ??
      LOGGING_DEFAULT.METRICS_DETAILED_WINDOW_TTL_MS,
    );
    this.setMetricsDetailedWindowEnabled(
      options.metricsDetailedWindowEnabled ??
      config.get(CONFIG_KEY.LOGGING_METRICS_DETAILED_WINDOW_ENABLED) ??
      LOGGING_DEFAULT.METRICS_DETAILED_WINDOW_ENABLED,
    );

    // Configure pino logger
    const pinoOptions = {
      level: this.level,
      base: {
        nodeId: this.nodeId,
        pid: process.pid,
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    };

    // Optional file destination (LAGRANGE_LOG_FILE) for observable runs. Writing
    // to a local FILE — not stdout — removes the observer effect where heavy
    // debug volume backs up the stdout pipe to the Docker daemon and stalls/hangs
    // the node (the very failure such runs try to observe). sync:true is correct
    // here: a synchronous write to a local file is fast and consumer-independent
    // (no pipe backpressure to block on), and unlike async buffering it loses no
    // tail if the node then hangs — which is exactly when the last lines matter.
    const logFilePath = options.logFile || process.env.LAGRANGE_LOG_FILE;
    if (logFilePath) {
      this.logger = pino(
        pinoOptions,
        pino.destination({dest: logFilePath, sync: true, mkdir: true}),
      );
    } else if (prettyPrint) {
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
   * Build the console-sink payload. The top-level nodeId is always the
   * EMITTING node (harness analyzers key on it); a context nodeId naming a
   * DIFFERENT node is preserved as contextNodeId instead of being silently
   * overwritten. Prefer role-specific keys (targetNodeId, peerNodeId, ...)
   * in new call sites.
   * @param {Object} context - Additional context.
   * @return {Object} Payload for the pino/console sink.
   * @private
   */
  buildConsolePayload(context) {
    if (context.nodeId === undefined || context.nodeId === this.nodeId) {
      return {...context, nodeId: this.nodeId};
    }
    return {...context, nodeId: this.nodeId, contextNodeId: context.nodeId};
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
    const metricsPolicy = (isLevelEnabled && isMetricsMessage) ?
      this.shouldEmitMetricsMessage(message, context) :
      {
        shouldEmit: true,
        suppressReason: LOGGING_METRICS_SUPPRESS_REASON.NONE,
      };
    const shouldWriteToConsole = isLevelEnabled &&
      (!isMetricsMessage ||
        (this.showMetricsInConsole && metricsPolicy.shouldEmit));
    const shouldPersist = this.isPersistLevelEnabled(normalizedLevel) &&
      (!isMetricsMessage ||
        (this.persistMetricsLogs && metricsPolicy.shouldEmit));

    this.recordDiagnostics({
      isLevelEnabled,
      isMetricsMessage,
      shouldWriteToConsole,
      shouldPersist,
      metricsSuppressReason: metricsPolicy.suppressReason,
      message,
      context,
    });

    if (!this.initialized) {
      // Fallback to console during pre-initialization. level and message are
      // authoritative: context keys must not overwrite them.
      if (shouldWriteToConsole) {
        console.log(JSON.stringify({...context, level: normalizedLevel, message}));
      }
      return;
    }

    // Log to pino
    if (shouldWriteToConsole) {
      this.logger[normalizedLevel](this.buildConsolePayload(context), message);
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
   * Console-only log: writes to the pino/stdout sink but NEVER to the logs table.
   * For high-frequency diagnostic traces (e.g. the per-tick convergence decision
   * trace) that must be retrievable from captured stdout WITHOUT adding write
   * load to the logs table — which matters acutely when the subsystem under
   * observation is itself a stalled distributed write path that the logs table
   * rides on. Still gated by the configured level, so it is silent unless the
   * level (e.g. raised by the harness --debug-logs switch) admits it.
   * @param {string} level - Log level.
   * @param {string} message - Log message.
   * @param {Object} context - Additional context.
   */
  logConsoleOnly(level, message, context = {}) {
    const normalizedLevel = this.normalizeLogLevel(level);
    if (!this.isLogLevelEnabled(normalizedLevel)) {
      return;
    }
    if (!this.initialized) {
      console.log(
        JSON.stringify({...context, level: normalizedLevel, message}),
      );
      return;
    }
    this.logger[normalizedLevel](this.buildConsolePayload(context), message);
  }

  /**
   * Log a trace message.
   * @param {string} message - Log message.
   * @param {Object} context - Additional context.
   */
  trace(message, context = {}) {
    this.log(LOCAL_STR_TRACE, message, context);
  }

  /**
   * Log a debug message.
   * @param {string} message - Log message.
   * @param {Object} context - Additional context.
   */
  debug(message, context = {}) {
    this.log(LOCAL_STR_DEBUG, message, context);
  }

  /**
   * Log an info message.
   * @param {string} message - Log message.
   * @param {Object} context - Additional context.
   */
  info(message, context = {}) {
    this.log(LOCAL_STR_INFO, message, context);
  }

  /**
   * Log a warning message.
   * @param {string} message - Log message.
   * @param {Object} context - Additional context.
   */
  warn(message, context = {}) {
    this.log(LOCAL_STR_WARN, message, context);
  }

  /**
   * Log an error message.
   * @param {string} message - Log message.
   * @param {Object} context - Additional context.
   */
  error(message, context = {}) {
    this.log(LOCAL_STR_ERROR, message, context);
  }

  /**
   * Log a fatal message.
   * @param {string} message - Log message.
   * @param {Object} context - Additional context.
   */
  fatal(message, context = {}) {
    this.log(LOCAL_STR_FATAL, message, context);
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
      logConsoleOnly: (level, msg, ctx = {}) =>
        parent.logConsoleOnly(level, msg, {...childContext, ...ctx}),
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
  async onLogsTableReady(writeCallback, options = {}) {
    return this.onLogsTableReadyWithOptions(writeCallback, options);
  }

  /**
   * Mark logs table ready and flush buffered entries.
   * @param {Function} writeCallback - Callback to write entries to logs table.
   * @param {Object} [options] - Flush options.
   * @param {'sync'|'background'} [options.flushMode='sync'] - Flush mode.
   * @param {number} [options.chunkSize=100] - Background chunk size.
   * @param {number} [options.yieldMs=0] - Delay between background chunks.
   * @return {Promise<number>} Number of entries scheduled/flushed.
   */
  async onLogsTableReadyWithOptions(writeCallback, options = {}) {
    this.logsTableReady = true;
    this.flushCallback = writeCallback;

    const flushMode = options.flushMode === 'background' ?
      'background' :
      'sync';
    const bufferedEntries = this.buffer.length;

    this.info(LOGGING_LOG_MSG.LOGS_TABLE_READY, {
      bufferedEntries,
      flushMode,
    });

    // Detach current buffer snapshot to avoid blocking bootstrap pathways.
    // New entries are routed through flushCallback because logsTableReady=true.
    const entriesToFlush = this.buffer;
    this.buffer = [];

    const flushedCount = entriesToFlush.length;
    if (flushMode === LOCAL_STR_BACKGROUND && flushedCount > LOCAL_NUM_ZERO && writeCallback) {
      this.flushBufferedEntriesInBackground(writeCallback, entriesToFlush, options);
      return flushedCount;
    }

    for (const entry of entriesToFlush) {
      if (writeCallback) {
        await writeCallback(entry);
      }
    }

    return flushedCount;
  }

  /**
   * Flush buffered entries asynchronously in chunks.
   * @param {Function} writeCallback
   * @param {Array<Object>} entries
   * @param {Object} options
   * @private
   */
  flushBufferedEntriesInBackground(writeCallback, entries, options = {}) {
    const chunkSize = Number.isFinite(options.chunkSize) && options.chunkSize > 0 ?
      Math.floor(options.chunkSize) : 100;
    const yieldMs = Number.isFinite(options.yieldMs) && options.yieldMs >= 0 ?
      Math.floor(options.yieldMs) : 0;
    const startedAt = Date.now();
    let index = LOCAL_NUM_ZERO;
    let nextProgressMark = chunkSize * LOCAL_NUM_10;

    this.info(LOCAL_STR_KRDOX, {
      bufferedEntries: entries.length,
      chunkSize,
      yieldMs,
    });

    const scheduleNext = () => {
      const timer = setTimeout(() => {
        void processChunk();
      }, yieldMs);
      if (typeof timer.unref === 'function') {
        timer.unref();
      }
    };

    const processChunk = async () => {
      try {
        let processedInChunk = LOCAL_NUM_ZERO;
        while (index < entries.length && processedInChunk < chunkSize) {
          await writeCallback(entries[index]);
          index++;
          processedInChunk++;
        }

        if (index >= nextProgressMark && index < entries.length) {
          this.debug('metrics.logging.buffer_flush.background.progress', {
            processedEntries: index,
            totalEntries: entries.length,
            durationMs: Date.now() - startedAt,
          });
          nextProgressMark += chunkSize * 10;
        }

        if (index < entries.length) {
          scheduleNext();
          return;
        }

        this.info('metrics.logging.buffer_flush.background.completed', {
          bufferedEntries: entries.length,
          durationMs: Date.now() - startedAt,
        });
      } catch (error) {
        this.error('Background logs buffer flush failed', {
          error: error.message,
          processedEntries: index,
          totalEntries: entries.length,
          durationMs: Date.now() - startedAt,
        });
      }
    };

    scheduleNext();
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
   * Shutdown the logging service.
   * Flushes any pending logs and releases resources.
   * @return {Promise<void>}
   */
  async shutdown() {
    if (this.logger && typeof this.logger.flush === LOCAL_STR_FUNCTION) {
      this.logger.flush();
    }
    this.initialized = false;
  }
}

installLoggingServiceMetricsDiagnostics(LoggingService);

export {LoggingService, LOG_LEVELS};
