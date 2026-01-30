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
   */
  initialize(options = {}) {
    const config = ConfigurationManager.getInstance();

    this.nodeId = options.nodeId || config.get(CONFIG_KEY.NODE_ID) || LOGGING_DEFAULT.NODE_ID;
    this.maxBufferSize =
      options.bufferSize || config.get(CONFIG_KEY.LOGGING_BUFFER_SIZE) ||
      LOGGING_DEFAULT.MAX_BUFFER_SIZE;

    const level = options.level || config.get(CONFIG_KEY.LOGGING_LEVEL) || LOGGING_DEFAULT.LEVEL;
    const prettyPrint =
      options.prettyPrint ?? config.get(CONFIG_KEY.LOGGING_PRETTY_PRINT) ??
      LOGGING_DEFAULT.PRETTY_PRINT;

    // Configure pino logger
    const pinoOptions = {
      level,
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
   * Log a message at the specified level.
   * @param {string} level - Log level.
   * @param {string} message - Log message.
   * @param {Object} context - Additional context.
   */
  log(level, message, context = {}) {
    if (!this.initialized) {
      // Fallback to console during pre-initialization
      console.log(JSON.stringify({level, message, ...context}));
      return;
    }

    const entry = this.createLogEntry(level, message, context);

    // Log to pino
    this.logger[level]({...context, nodeId: this.nodeId}, message);

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
}

export {LoggingService, LOG_LEVELS};
