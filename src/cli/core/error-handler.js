/**
 * ErrorHandler - Centralized error handling and notification system
 *
 * Provides non-blocking notifications, error logging, terminal resize handling,
 * and graceful degradation for missing data.
 *
 * Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 19.10
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Error severity levels
 */
export const ERROR_LEVEL = {
  DEBUG: 'debug',
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical',
};

/**
 * Notification types
 */
export const NOTIFICATION_TYPE = {
  INFO: 'info',
  SUCCESS: 'success',
  WARNING: 'warning',
  ERROR: 'error',
};

/**
 * Minimum terminal dimensions
 */
export const MIN_TERMINAL_SIZE = {
  width: 80,
  height: 24,
};

/**
 * @typedef {Object} Notification
 * @property {string} id - Unique notification ID
 * @property {string} type - Notification type
 * @property {string} message - Notification message
 * @property {number} timestamp - Creation timestamp
 * @property {number} [duration] - Display duration in ms
 * @property {boolean} dismissed - Whether notification was dismissed
 */

/**
 * @typedef {Object} LogEntry
 * @property {string} level - Log level
 * @property {string} message - Log message
 * @property {number} timestamp - Log timestamp
 * @property {Object} [context] - Additional context
 * @property {string} [stack] - Error stack trace
 */

export class ErrorHandler {
  /**
   * Creates a new ErrorHandler instance
   * @param {Object} options - Configuration options
   * @param {import('./event-bus.js').EventBus} [options.eventBus] - Event bus
   * @param {string} [options.logPath] - Path to error log file
   * @param {number} [options.maxNotifications] - Max notifications to keep
   * @param {number} [options.defaultDuration] - Default notification duration
   * @param {boolean} [options.logToConsole] - Whether to log to console
   */
  constructor(options = {}) {
    this.eventBus = options.eventBus || null;
    this.logPath = options.logPath ||
      path.join(os.homedir(), '.ddb-admin', 'error.log');
    this.maxNotifications = options.maxNotifications || 50;
    this.defaultDuration = options.defaultDuration || 5000;
    this.logToConsole = options.logToConsole || false;

    /** @type {Notification[]} */
    this.notifications = [];

    /** @type {number} */
    this.notificationCounter = 0;

    /** @type {Map<string, NodeJS.Timeout>} */
    this.dismissTimers = new Map();

    /** @type {{width: number, height: number}} */
    this.terminalSize = {width: 80, height: 24};

    /** @type {boolean} */
    this.terminalTooSmall = false;

    /** @type {Function|null} */
    this.onNotification = null;

    /** @type {Function|null} */
    this.onTerminalResize = null;

    /** @type {Function|null} */
    this.onTerminalTooSmall = null;

    // Ensure log directory exists
    this.ensureLogDirectory();
  }

  /**
   * Ensure the log directory exists
   * Requirements: 19.3
   */
  ensureLogDirectory() {
    const logDir = path.dirname(this.logPath);
    try {
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, {recursive: true});
      }
    } catch {
      // Silently fail - we'll try again when writing
    }
  }

  /**
   * Log an error to the error log file
   * Requirements: 19.3, 19.10
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} [context] - Additional context
   */
  log(level, message, context = {}) {
    const entry = {
      level,
      message,
      timestamp: Date.now(),
      isoTime: new Date().toISOString(),
      context,
    };

    if (context.error instanceof Error) {
      entry.stack = context.error.stack;
      entry.context = {...context, error: context.error.message};
    }

    // Write to log file
    this.writeToLogFile(entry);

    // Optionally log to console
    if (this.logToConsole) {
      this.logToConsoleOutput(entry);
    }

    // Emit event
    if (this.eventBus) {
      this.eventBus.emit('error:logged', entry);
    }
  }

  /**
   * Write a log entry to the log file
   * Requirements: 19.3
   * @param {LogEntry} entry - Log entry
   */
  writeToLogFile(entry) {
    try {
      this.ensureLogDirectory();
      const line = JSON.stringify(entry) + '\n';
      fs.appendFileSync(this.logPath, line, 'utf8');
    } catch (err) {
      // Silently fail - can't log the logging error
      if (this.logToConsole) {
        console.error('Failed to write to log file:', err.message);
      }
    }
  }

  /**
   * Log to console output
   * @param {LogEntry} entry - Log entry
   */
  logToConsoleOutput(entry) {
    const prefix = `[${entry.isoTime}] [${entry.level.toUpperCase()}]`;
    switch (entry.level) {
    case ERROR_LEVEL.ERROR:
    case ERROR_LEVEL.CRITICAL:
      console.error(prefix, entry.message, entry.context);
      break;
    case ERROR_LEVEL.WARNING:
      console.warn(prefix, entry.message, entry.context);
      break;
    default:
      console.log(prefix, entry.message, entry.context);
    }
  }

  /**
   * Log a debug message
   * @param {string} message - Message
   * @param {Object} [context] - Context
   */
  debug(message, context = {}) {
    this.log(ERROR_LEVEL.DEBUG, message, context);
  }

  /**
   * Log an info message
   * @param {string} message - Message
   * @param {Object} [context] - Context
   */
  info(message, context = {}) {
    this.log(ERROR_LEVEL.INFO, message, context);
  }

  /**
   * Log a warning message
   * Requirements: 19.10
   * @param {string} message - Message
   * @param {Object} [context] - Context
   */
  warn(message, context = {}) {
    this.log(ERROR_LEVEL.WARNING, message, context);
  }

  /**
   * Log an error message
   * Requirements: 19.3
   * @param {string} message - Message
   * @param {Object} [context] - Context
   */
  error(message, context = {}) {
    this.log(ERROR_LEVEL.ERROR, message, context);
  }

  /**
   * Log a critical error message
   * @param {string} message - Message
   * @param {Object} [context] - Context
   */
  critical(message, context = {}) {
    this.log(ERROR_LEVEL.CRITICAL, message, context);
  }

  /**
   * Show a non-blocking notification
   * Requirements: 19.1
   * @param {string} type - Notification type
   * @param {string} message - Notification message
   * @param {Object} [options] - Options
   * @param {number} [options.duration] - Display duration in ms
   * @return {string} Notification ID
   */
  notify(type, message, options = {}) {
    const id = `notification_${++this.notificationCounter}`;
    const duration = options.duration !== undefined ?
      options.duration : this.defaultDuration;

    const notification = {
      id,
      type,
      message,
      timestamp: Date.now(),
      duration,
      dismissed: false,
    };

    this.notifications.push(notification);

    // Trim old notifications
    if (this.notifications.length > this.maxNotifications) {
      this.notifications = this.notifications.slice(-this.maxNotifications);
    }

    // Set auto-dismiss timer if duration > 0
    if (duration > 0) {
      const timer = setTimeout(() => {
        this.dismissNotification(id);
      }, duration);
      this.dismissTimers.set(id, timer);
    }

    // Emit event
    if (this.eventBus) {
      this.eventBus.emit('notification:show', notification);
    }

    // Call callback
    if (this.onNotification) {
      this.onNotification(notification);
    }

    return id;
  }

  /**
   * Show an info notification
   * @param {string} message - Message
   * @param {Object} [options] - Options
   * @return {string} Notification ID
   */
  notifyInfo(message, options = {}) {
    return this.notify(NOTIFICATION_TYPE.INFO, message, options);
  }

  /**
   * Show a success notification
   * @param {string} message - Message
   * @param {Object} [options] - Options
   * @return {string} Notification ID
   */
  notifySuccess(message, options = {}) {
    return this.notify(NOTIFICATION_TYPE.SUCCESS, message, options);
  }

  /**
   * Show a warning notification
   * @param {string} message - Message
   * @param {Object} [options] - Options
   * @return {string} Notification ID
   */
  notifyWarning(message, options = {}) {
    return this.notify(NOTIFICATION_TYPE.WARNING, message, options);
  }

  /**
   * Show an error notification
   * Requirements: 19.1
   * @param {string} message - Message
   * @param {Object} [options] - Options
   * @return {string} Notification ID
   */
  notifyError(message, options = {}) {
    // Also log the error
    this.error(message, options.context || {});
    return this.notify(NOTIFICATION_TYPE.ERROR, message, options);
  }

  /**
   * Dismiss a notification
   * @param {string} id - Notification ID
   */
  dismissNotification(id) {
    const notification = this.notifications.find((n) => n.id === id);
    if (notification && !notification.dismissed) {
      notification.dismissed = true;

      // Clear timer if exists
      const timer = this.dismissTimers.get(id);
      if (timer) {
        clearTimeout(timer);
        this.dismissTimers.delete(id);
      }

      // Emit event
      if (this.eventBus) {
        this.eventBus.emit('notification:dismiss', notification);
      }
    }
  }

  /**
   * Dismiss all notifications
   */
  dismissAllNotifications() {
    for (const notification of this.notifications) {
      if (!notification.dismissed) {
        this.dismissNotification(notification.id);
      }
    }
  }

  /**
   * Get active (non-dismissed) notifications
   * @return {Notification[]}
   */
  getActiveNotifications() {
    return this.notifications.filter((n) => !n.dismissed);
  }

  /**
   * Get all notifications
   * @return {Notification[]}
   */
  getAllNotifications() {
    return [...this.notifications];
  }

  /**
   * Handle API error with notification
   * Requirements: 19.1
   * @param {Error} error - Error object
   * @param {string} [operation] - Operation that failed
   */
  handleApiError(error, operation = 'API call') {
    const message = `${operation} failed: ${error.message}`;
    this.notifyError(message, {context: {operation, error}});
  }

  /**
   * Handle terminal resize
   * Requirements: 19.4, 19.5
   * @param {number} width - New terminal width
   * @param {number} height - New terminal height
   */
  handleTerminalResize(width, height) {
    const oldSize = {...this.terminalSize};
    this.terminalSize = {width, height};

    // Check if terminal is too small
    const wasTooSmall = this.terminalTooSmall;
    this.terminalTooSmall = width < MIN_TERMINAL_SIZE.width ||
      height < MIN_TERMINAL_SIZE.height;

    // Log resize
    this.debug('Terminal resized', {
      from: oldSize,
      to: this.terminalSize,
      tooSmall: this.terminalTooSmall,
    });

    // Emit resize event
    if (this.eventBus) {
      this.eventBus.emit('terminal:resize', {
        width,
        height,
        tooSmall: this.terminalTooSmall,
      });
    }

    // Call resize callback
    if (this.onTerminalResize) {
      this.onTerminalResize(width, height);
    }

    // Handle too small state change
    if (this.terminalTooSmall && !wasTooSmall) {
      this.handleTerminalTooSmall();
    } else if (!this.terminalTooSmall && wasTooSmall) {
      // Terminal is now large enough
      if (this.eventBus) {
        this.eventBus.emit('terminal:sizeOk', this.terminalSize);
      }
    }
  }

  /**
   * Handle terminal too small condition
   * Requirements: 19.5
   */
  handleTerminalTooSmall() {
    const message = 'Terminal too small. Minimum size: ' +
      `${MIN_TERMINAL_SIZE.width}x${MIN_TERMINAL_SIZE.height}. ` +
      `Current: ${this.terminalSize.width}x${this.terminalSize.height}`;

    this.warn(message);

    // Emit event
    if (this.eventBus) {
      this.eventBus.emit('terminal:tooSmall', {
        current: this.terminalSize,
        minimum: MIN_TERMINAL_SIZE,
      });
    }

    // Call callback
    if (this.onTerminalTooSmall) {
      this.onTerminalTooSmall(this.terminalSize, MIN_TERMINAL_SIZE);
    }
  }

  /**
   * Check if terminal is too small
   * Requirements: 19.5
   * @return {boolean}
   */
  isTerminalTooSmall() {
    return this.terminalTooSmall;
  }

  /**
   * Get current terminal size
   * @return {{width: number, height: number}}
   */
  getTerminalSize() {
    return {...this.terminalSize};
  }

  /**
   * Get minimum terminal size
   * @return {{width: number, height: number}}
   */
  getMinTerminalSize() {
    return {...MIN_TERMINAL_SIZE};
  }

  /**
   * Format a value with missing data indicator
   * Requirements: 19.2
   * @param {*} value - Value to format
   * @param {string} [placeholder='N/A'] - Placeholder for missing data
   * @return {string}
   */
  formatWithMissingIndicator(value, placeholder = 'N/A') {
    if (value === null || value === undefined) {
      return placeholder;
    }
    return String(value);
  }

  /**
   * Create a partial data indicator
   * Requirements: 19.2
   * @param {string} section - Section name
   * @return {Object}
   */
  createPartialDataIndicator(section) {
    return {
      section,
      message: `[${section}: Data unavailable]`,
      isMissing: true,
    };
  }

  /**
   * Check if data is partial/incomplete
   * Requirements: 19.2
   * @param {Object} data - Data object
   * @param {string[]} requiredFields - Required field names
   * @return {{isPartial: boolean, missingFields: string[]}}
   */
  checkPartialData(data, requiredFields) {
    const missingFields = [];

    for (const field of requiredFields) {
      if (data[field] === null || data[field] === undefined) {
        missingFields.push(field);
      }
    }

    return {
      isPartial: missingFields.length > 0,
      missingFields,
    };
  }

  /**
   * Log metadata computation warning
   * Requirements: 19.10
   * @param {string} operation - Operation name
   * @param {string} message - Warning message
   * @param {Object} [data] - Related data
   */
  logMetadataWarning(operation, message, data = {}) {
    this.warn(`Metadata computation: ${operation} - ${message}`, {
      operation,
      data,
    });
  }

  /**
   * Wrap a function with error handling
   * @param {Function} fn - Function to wrap
   * @param {string} [operation] - Operation name for error messages
   * @return {Function} Wrapped function
   */
  wrapWithErrorHandling(fn, operation = 'Operation') {
    return async (...args) => {
      try {
        return await fn(...args);
      } catch (error) {
        this.handleApiError(error, operation);
        throw error;
      }
    };
  }

  /**
   * Safely execute a function, returning default on error
   * @param {Function} fn - Function to execute
   * @param {*} defaultValue - Default value on error
   * @param {string} [operation] - Operation name for logging
   * @return {*} Result or default value
   */
  safeExecute(fn, defaultValue, operation = 'Operation') {
    try {
      return fn();
    } catch (error) {
      this.warn(`${operation} failed, using default`, {error});
      return defaultValue;
    }
  }

  /**
   * Clear all dismiss timers
   */
  clearTimers() {
    for (const timer of this.dismissTimers.values()) {
      clearTimeout(timer);
    }
    this.dismissTimers.clear();
  }

  /**
   * Destroy and cleanup
   */
  destroy() {
    this.clearTimers();
    this.notifications = [];
    this.eventBus = null;
    this.onNotification = null;
    this.onTerminalResize = null;
    this.onTerminalTooSmall = null;
  }
}
