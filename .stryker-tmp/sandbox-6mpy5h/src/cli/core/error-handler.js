/**
 * ErrorHandler - Centralized error handling and notification system
 *
 * Provides non-blocking notifications, error logging, terminal resize handling,
 * and graceful degradation for missing data.
 *
 * Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 19.10
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
import fs from 'fs';
import path from 'path';
import os from 'os';
import { CLI_DEFAULT, CLI_ERROR_LEVEL, CLI_NOTIFICATION_TYPE, CLI_PATH, CLI_TERMINAL_SIZE } from '../cli-constants.js';

/**
 * Error severity levels
 */
export const ERROR_LEVEL = stryMutAct_9fa48("42059") ? {} : (stryCov_9fa48("42059"), {
  DEBUG: CLI_ERROR_LEVEL.DEBUG,
  INFO: CLI_ERROR_LEVEL.INFO,
  WARNING: CLI_ERROR_LEVEL.WARNING,
  ERROR: CLI_ERROR_LEVEL.ERROR,
  CRITICAL: CLI_ERROR_LEVEL.CRITICAL
});

/**
 * Notification types
 */
export const NOTIFICATION_TYPE = stryMutAct_9fa48("42060") ? {} : (stryCov_9fa48("42060"), {
  INFO: CLI_NOTIFICATION_TYPE.INFO,
  SUCCESS: CLI_NOTIFICATION_TYPE.SUCCESS,
  WARNING: CLI_NOTIFICATION_TYPE.WARNING,
  ERROR: CLI_NOTIFICATION_TYPE.ERROR
});

/**
 * Minimum terminal dimensions
 */
export const MIN_TERMINAL_SIZE = stryMutAct_9fa48("42061") ? {} : (stryCov_9fa48("42061"), {
  width: CLI_TERMINAL_SIZE.width,
  height: CLI_TERMINAL_SIZE.height
});

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
    if (stryMutAct_9fa48("42062")) {
      {}
    } else {
      stryCov_9fa48("42062");
      this.eventBus = stryMutAct_9fa48("42065") ? options.eventBus && null : stryMutAct_9fa48("42064") ? false : stryMutAct_9fa48("42063") ? true : (stryCov_9fa48("42063", "42064", "42065"), options.eventBus || null);
      this.logPath = stryMutAct_9fa48("42068") ? options.logPath && path.join(os.homedir(), CLI_PATH.CONFIG_DIR_NAME, CLI_PATH.ERROR_LOG_FILE) : stryMutAct_9fa48("42067") ? false : stryMutAct_9fa48("42066") ? true : (stryCov_9fa48("42066", "42067", "42068"), options.logPath || path.join(os.homedir(), CLI_PATH.CONFIG_DIR_NAME, CLI_PATH.ERROR_LOG_FILE));
      this.maxNotifications = stryMutAct_9fa48("42071") ? options.maxNotifications && CLI_DEFAULT.MAX_NOTIFICATIONS : stryMutAct_9fa48("42070") ? false : stryMutAct_9fa48("42069") ? true : (stryCov_9fa48("42069", "42070", "42071"), options.maxNotifications || CLI_DEFAULT.MAX_NOTIFICATIONS);
      this.defaultDuration = stryMutAct_9fa48("42074") ? options.defaultDuration && CLI_DEFAULT.DEFAULT_NOTIFICATION_DURATION_MS : stryMutAct_9fa48("42073") ? false : stryMutAct_9fa48("42072") ? true : (stryCov_9fa48("42072", "42073", "42074"), options.defaultDuration || CLI_DEFAULT.DEFAULT_NOTIFICATION_DURATION_MS);
      this.logToConsole = stryMutAct_9fa48("42077") ? options.logToConsole && false : stryMutAct_9fa48("42076") ? false : stryMutAct_9fa48("42075") ? true : (stryCov_9fa48("42075", "42076", "42077"), options.logToConsole || (stryMutAct_9fa48("42078") ? true : (stryCov_9fa48("42078"), false)));

      /** @type {Notification[]} */
      this.notifications = stryMutAct_9fa48("42079") ? ["Stryker was here"] : (stryCov_9fa48("42079"), []);

      /** @type {number} */
      this.notificationCounter = 0;

      /** @type {Map<string, NodeJS.Timeout>} */
      this.dismissTimers = new Map();

      /** @type {{width: number, height: number}} */
      this.terminalSize = stryMutAct_9fa48("42080") ? {} : (stryCov_9fa48("42080"), {
        width: CLI_TERMINAL_SIZE.width,
        height: CLI_TERMINAL_SIZE.height
      });

      /** @type {boolean} */
      this.terminalTooSmall = stryMutAct_9fa48("42081") ? true : (stryCov_9fa48("42081"), false);

      /** @type {Function|null} */
      this.onNotification = null;

      /** @type {Function|null} */
      this.onTerminalResize = null;

      /** @type {Function|null} */
      this.onTerminalTooSmall = null;

      // Ensure log directory exists
      this.ensureLogDirectory();
    }
  }

  /**
   * Ensure the log directory exists
   * Requirements: 19.3
   */
  ensureLogDirectory() {
    if (stryMutAct_9fa48("42082")) {
      {}
    } else {
      stryCov_9fa48("42082");
      const logDir = path.dirname(this.logPath);
      try {
        if (stryMutAct_9fa48("42083")) {
          {}
        } else {
          stryCov_9fa48("42083");
          if (stryMutAct_9fa48("42086") ? false : stryMutAct_9fa48("42085") ? true : stryMutAct_9fa48("42084") ? fs.existsSync(logDir) : (stryCov_9fa48("42084", "42085", "42086"), !fs.existsSync(logDir))) {
            if (stryMutAct_9fa48("42087")) {
              {}
            } else {
              stryCov_9fa48("42087");
              fs.mkdirSync(logDir, stryMutAct_9fa48("42088") ? {} : (stryCov_9fa48("42088"), {
                recursive: stryMutAct_9fa48("42089") ? false : (stryCov_9fa48("42089"), true)
              }));
            }
          }
        }
      } catch {
        // Silently fail - we'll try again when writing
      }
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
    if (stryMutAct_9fa48("42090")) {
      {}
    } else {
      stryCov_9fa48("42090");
      const entry = stryMutAct_9fa48("42091") ? {} : (stryCov_9fa48("42091"), {
        level,
        message,
        timestamp: Date.now(),
        isoTime: new Date().toISOString(),
        context
      });
      if (stryMutAct_9fa48("42093") ? false : stryMutAct_9fa48("42092") ? true : (stryCov_9fa48("42092", "42093"), context.error instanceof Error)) {
        if (stryMutAct_9fa48("42094")) {
          {}
        } else {
          stryCov_9fa48("42094");
          entry.stack = context.error.stack;
          entry.context = stryMutAct_9fa48("42095") ? {} : (stryCov_9fa48("42095"), {
            ...context,
            error: context.error.message
          });
        }
      }

      // Write to log file
      this.writeToLogFile(entry);

      // Optionally log to console
      if (stryMutAct_9fa48("42097") ? false : stryMutAct_9fa48("42096") ? true : (stryCov_9fa48("42096", "42097"), this.logToConsole)) {
        if (stryMutAct_9fa48("42098")) {
          {}
        } else {
          stryCov_9fa48("42098");
          this.logToConsoleOutput(entry);
        }
      }

      // Emit event
      if (stryMutAct_9fa48("42100") ? false : stryMutAct_9fa48("42099") ? true : (stryCov_9fa48("42099", "42100"), this.eventBus)) {
        if (stryMutAct_9fa48("42101")) {
          {}
        } else {
          stryCov_9fa48("42101");
          this.eventBus.emit(stryMutAct_9fa48("42102") ? "" : (stryCov_9fa48("42102"), 'error:logged'), entry);
        }
      }
    }
  }

  /**
   * Write a log entry to the log file
   * Requirements: 19.3
   * @param {LogEntry} entry - Log entry
   */
  writeToLogFile(entry) {
    if (stryMutAct_9fa48("42103")) {
      {}
    } else {
      stryCov_9fa48("42103");
      try {
        if (stryMutAct_9fa48("42104")) {
          {}
        } else {
          stryCov_9fa48("42104");
          this.ensureLogDirectory();
          const line = JSON.stringify(entry) + (stryMutAct_9fa48("42105") ? "" : (stryCov_9fa48("42105"), '\n'));
          fs.appendFileSync(this.logPath, line, stryMutAct_9fa48("42106") ? "" : (stryCov_9fa48("42106"), 'utf8'));
        }
      } catch (err) {
        if (stryMutAct_9fa48("42107")) {
          {}
        } else {
          stryCov_9fa48("42107");
          // Silently fail - can't log the logging error
          if (stryMutAct_9fa48("42109") ? false : stryMutAct_9fa48("42108") ? true : (stryCov_9fa48("42108", "42109"), this.logToConsole)) {
            if (stryMutAct_9fa48("42110")) {
              {}
            } else {
              stryCov_9fa48("42110");
              console.error(stryMutAct_9fa48("42111") ? "" : (stryCov_9fa48("42111"), 'Failed to write to log file:'), err.message);
            }
          }
        }
      }
    }
  }

  /**
   * Log to console output
   * @param {LogEntry} entry - Log entry
   */
  logToConsoleOutput(entry) {
    if (stryMutAct_9fa48("42112")) {
      {}
    } else {
      stryCov_9fa48("42112");
      const prefix = stryMutAct_9fa48("42113") ? `` : (stryCov_9fa48("42113"), `[${entry.isoTime}] [${stryMutAct_9fa48("42114") ? entry.level.toLowerCase() : (stryCov_9fa48("42114"), entry.level.toUpperCase())}]`);
      switch (entry.level) {
        case ERROR_LEVEL.ERROR:
        case ERROR_LEVEL.CRITICAL:
          if (stryMutAct_9fa48("42115")) {} else {
            stryCov_9fa48("42115");
            console.error(prefix, entry.message, entry.context);
            break;
          }
        case ERROR_LEVEL.WARNING:
          if (stryMutAct_9fa48("42116")) {} else {
            stryCov_9fa48("42116");
            console.warn(prefix, entry.message, entry.context);
            break;
          }
        default:
          if (stryMutAct_9fa48("42117")) {} else {
            stryCov_9fa48("42117");
            console.log(prefix, entry.message, entry.context);
          }
      }
    }
  }

  /**
   * Log a debug message
   * @param {string} message - Message
   * @param {Object} [context] - Context
   */
  debug(message, context = {}) {
    if (stryMutAct_9fa48("42118")) {
      {}
    } else {
      stryCov_9fa48("42118");
      this.log(ERROR_LEVEL.DEBUG, message, context);
    }
  }

  /**
   * Log an info message
   * @param {string} message - Message
   * @param {Object} [context] - Context
   */
  info(message, context = {}) {
    if (stryMutAct_9fa48("42119")) {
      {}
    } else {
      stryCov_9fa48("42119");
      this.log(ERROR_LEVEL.INFO, message, context);
    }
  }

  /**
   * Log a warning message
   * Requirements: 19.10
   * @param {string} message - Message
   * @param {Object} [context] - Context
   */
  warn(message, context = {}) {
    if (stryMutAct_9fa48("42120")) {
      {}
    } else {
      stryCov_9fa48("42120");
      this.log(ERROR_LEVEL.WARNING, message, context);
    }
  }

  /**
   * Log an error message
   * Requirements: 19.3
   * @param {string} message - Message
   * @param {Object} [context] - Context
   */
  error(message, context = {}) {
    if (stryMutAct_9fa48("42121")) {
      {}
    } else {
      stryCov_9fa48("42121");
      this.log(ERROR_LEVEL.ERROR, message, context);
    }
  }

  /**
   * Log a critical error message
   * @param {string} message - Message
   * @param {Object} [context] - Context
   */
  critical(message, context = {}) {
    if (stryMutAct_9fa48("42122")) {
      {}
    } else {
      stryCov_9fa48("42122");
      this.log(ERROR_LEVEL.CRITICAL, message, context);
    }
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
    if (stryMutAct_9fa48("42123")) {
      {}
    } else {
      stryCov_9fa48("42123");
      const id = stryMutAct_9fa48("42124") ? `` : (stryCov_9fa48("42124"), `notification_${stryMutAct_9fa48("42125") ? --this.notificationCounter : (stryCov_9fa48("42125"), ++this.notificationCounter)}`);
      const duration = (stryMutAct_9fa48("42128") ? options.duration === undefined : stryMutAct_9fa48("42127") ? false : stryMutAct_9fa48("42126") ? true : (stryCov_9fa48("42126", "42127", "42128"), options.duration !== undefined)) ? options.duration : this.defaultDuration;
      const notification = stryMutAct_9fa48("42129") ? {} : (stryCov_9fa48("42129"), {
        id,
        type,
        message,
        timestamp: Date.now(),
        duration,
        dismissed: stryMutAct_9fa48("42130") ? true : (stryCov_9fa48("42130"), false)
      });
      this.notifications.push(notification);

      // Trim old notifications
      if (stryMutAct_9fa48("42134") ? this.notifications.length <= this.maxNotifications : stryMutAct_9fa48("42133") ? this.notifications.length >= this.maxNotifications : stryMutAct_9fa48("42132") ? false : stryMutAct_9fa48("42131") ? true : (stryCov_9fa48("42131", "42132", "42133", "42134"), this.notifications.length > this.maxNotifications)) {
        if (stryMutAct_9fa48("42135")) {
          {}
        } else {
          stryCov_9fa48("42135");
          this.notifications = stryMutAct_9fa48("42136") ? this.notifications : (stryCov_9fa48("42136"), this.notifications.slice(stryMutAct_9fa48("42137") ? +this.maxNotifications : (stryCov_9fa48("42137"), -this.maxNotifications)));
        }
      }

      // Set auto-dismiss timer if duration > 0
      if (stryMutAct_9fa48("42141") ? duration <= 0 : stryMutAct_9fa48("42140") ? duration >= 0 : stryMutAct_9fa48("42139") ? false : stryMutAct_9fa48("42138") ? true : (stryCov_9fa48("42138", "42139", "42140", "42141"), duration > 0)) {
        if (stryMutAct_9fa48("42142")) {
          {}
        } else {
          stryCov_9fa48("42142");
          const timer = setTimeout(() => {
            if (stryMutAct_9fa48("42143")) {
              {}
            } else {
              stryCov_9fa48("42143");
              this.dismissNotification(id);
            }
          }, duration);
          this.dismissTimers.set(id, timer);
        }
      }

      // Emit event
      if (stryMutAct_9fa48("42145") ? false : stryMutAct_9fa48("42144") ? true : (stryCov_9fa48("42144", "42145"), this.eventBus)) {
        if (stryMutAct_9fa48("42146")) {
          {}
        } else {
          stryCov_9fa48("42146");
          this.eventBus.emit(stryMutAct_9fa48("42147") ? "" : (stryCov_9fa48("42147"), 'notification:show'), notification);
        }
      }

      // Call callback
      if (stryMutAct_9fa48("42149") ? false : stryMutAct_9fa48("42148") ? true : (stryCov_9fa48("42148", "42149"), this.onNotification)) {
        if (stryMutAct_9fa48("42150")) {
          {}
        } else {
          stryCov_9fa48("42150");
          this.onNotification(notification);
        }
      }
      return id;
    }
  }

  /**
   * Show an info notification
   * @param {string} message - Message
   * @param {Object} [options] - Options
   * @return {string} Notification ID
   */
  notifyInfo(message, options = {}) {
    if (stryMutAct_9fa48("42151")) {
      {}
    } else {
      stryCov_9fa48("42151");
      return this.notify(NOTIFICATION_TYPE.INFO, message, options);
    }
  }

  /**
   * Show a success notification
   * @param {string} message - Message
   * @param {Object} [options] - Options
   * @return {string} Notification ID
   */
  notifySuccess(message, options = {}) {
    if (stryMutAct_9fa48("42152")) {
      {}
    } else {
      stryCov_9fa48("42152");
      return this.notify(NOTIFICATION_TYPE.SUCCESS, message, options);
    }
  }

  /**
   * Show a warning notification
   * @param {string} message - Message
   * @param {Object} [options] - Options
   * @return {string} Notification ID
   */
  notifyWarning(message, options = {}) {
    if (stryMutAct_9fa48("42153")) {
      {}
    } else {
      stryCov_9fa48("42153");
      return this.notify(NOTIFICATION_TYPE.WARNING, message, options);
    }
  }

  /**
   * Show an error notification
   * Requirements: 19.1
   * @param {string} message - Message
   * @param {Object} [options] - Options
   * @return {string} Notification ID
   */
  notifyError(message, options = {}) {
    if (stryMutAct_9fa48("42154")) {
      {}
    } else {
      stryCov_9fa48("42154");
      // Also log the error
      this.error(message, stryMutAct_9fa48("42157") ? options.context && {} : stryMutAct_9fa48("42156") ? false : stryMutAct_9fa48("42155") ? true : (stryCov_9fa48("42155", "42156", "42157"), options.context || {}));
      return this.notify(NOTIFICATION_TYPE.ERROR, message, options);
    }
  }

  /**
   * Dismiss a notification
   * @param {string} id - Notification ID
   */
  dismissNotification(id) {
    if (stryMutAct_9fa48("42158")) {
      {}
    } else {
      stryCov_9fa48("42158");
      const notification = this.notifications.find(stryMutAct_9fa48("42159") ? () => undefined : (stryCov_9fa48("42159"), n => stryMutAct_9fa48("42162") ? n.id !== id : stryMutAct_9fa48("42161") ? false : stryMutAct_9fa48("42160") ? true : (stryCov_9fa48("42160", "42161", "42162"), n.id === id)));
      if (stryMutAct_9fa48("42165") ? notification || !notification.dismissed : stryMutAct_9fa48("42164") ? false : stryMutAct_9fa48("42163") ? true : (stryCov_9fa48("42163", "42164", "42165"), notification && (stryMutAct_9fa48("42166") ? notification.dismissed : (stryCov_9fa48("42166"), !notification.dismissed)))) {
        if (stryMutAct_9fa48("42167")) {
          {}
        } else {
          stryCov_9fa48("42167");
          notification.dismissed = stryMutAct_9fa48("42168") ? false : (stryCov_9fa48("42168"), true);

          // Clear timer if exists
          const timer = this.dismissTimers.get(id);
          if (stryMutAct_9fa48("42170") ? false : stryMutAct_9fa48("42169") ? true : (stryCov_9fa48("42169", "42170"), timer)) {
            if (stryMutAct_9fa48("42171")) {
              {}
            } else {
              stryCov_9fa48("42171");
              clearTimeout(timer);
              this.dismissTimers.delete(id);
            }
          }

          // Emit event
          if (stryMutAct_9fa48("42173") ? false : stryMutAct_9fa48("42172") ? true : (stryCov_9fa48("42172", "42173"), this.eventBus)) {
            if (stryMutAct_9fa48("42174")) {
              {}
            } else {
              stryCov_9fa48("42174");
              this.eventBus.emit(stryMutAct_9fa48("42175") ? "" : (stryCov_9fa48("42175"), 'notification:dismiss'), notification);
            }
          }
        }
      }
    }
  }

  /**
   * Dismiss all notifications
   */
  dismissAllNotifications() {
    if (stryMutAct_9fa48("42176")) {
      {}
    } else {
      stryCov_9fa48("42176");
      for (const notification of this.notifications) {
        if (stryMutAct_9fa48("42177")) {
          {}
        } else {
          stryCov_9fa48("42177");
          if (stryMutAct_9fa48("42180") ? false : stryMutAct_9fa48("42179") ? true : stryMutAct_9fa48("42178") ? notification.dismissed : (stryCov_9fa48("42178", "42179", "42180"), !notification.dismissed)) {
            if (stryMutAct_9fa48("42181")) {
              {}
            } else {
              stryCov_9fa48("42181");
              this.dismissNotification(notification.id);
            }
          }
        }
      }
    }
  }

  /**
   * Get active (non-dismissed) notifications
   * @return {Notification[]}
   */
  getActiveNotifications() {
    if (stryMutAct_9fa48("42182")) {
      {}
    } else {
      stryCov_9fa48("42182");
      return stryMutAct_9fa48("42183") ? this.notifications : (stryCov_9fa48("42183"), this.notifications.filter(stryMutAct_9fa48("42184") ? () => undefined : (stryCov_9fa48("42184"), n => stryMutAct_9fa48("42185") ? n.dismissed : (stryCov_9fa48("42185"), !n.dismissed))));
    }
  }

  /**
   * Get all notifications
   * @return {Notification[]}
   */
  getAllNotifications() {
    if (stryMutAct_9fa48("42186")) {
      {}
    } else {
      stryCov_9fa48("42186");
      return stryMutAct_9fa48("42187") ? [] : (stryCov_9fa48("42187"), [...this.notifications]);
    }
  }

  /**
   * Handle API error with notification
   * Requirements: 19.1
   * @param {Error} error - Error object
   * @param {string} [operation] - Operation that failed
   */
  handleApiError(error, operation = stryMutAct_9fa48("42188") ? "" : (stryCov_9fa48("42188"), 'API call')) {
    if (stryMutAct_9fa48("42189")) {
      {}
    } else {
      stryCov_9fa48("42189");
      const message = stryMutAct_9fa48("42190") ? `` : (stryCov_9fa48("42190"), `${operation} failed: ${error.message}`);
      this.notifyError(message, stryMutAct_9fa48("42191") ? {} : (stryCov_9fa48("42191"), {
        context: stryMutAct_9fa48("42192") ? {} : (stryCov_9fa48("42192"), {
          operation,
          error
        })
      }));
    }
  }

  /**
   * Handle terminal resize
   * Requirements: 19.4, 19.5
   * @param {number} width - New terminal width
   * @param {number} height - New terminal height
   */
  handleTerminalResize(width, height) {
    if (stryMutAct_9fa48("42193")) {
      {}
    } else {
      stryCov_9fa48("42193");
      const oldSize = stryMutAct_9fa48("42194") ? {} : (stryCov_9fa48("42194"), {
        ...this.terminalSize
      });
      this.terminalSize = stryMutAct_9fa48("42195") ? {} : (stryCov_9fa48("42195"), {
        width,
        height
      });

      // Check if terminal is too small
      const wasTooSmall = this.terminalTooSmall;
      this.terminalTooSmall = stryMutAct_9fa48("42198") ? width < MIN_TERMINAL_SIZE.width && height < MIN_TERMINAL_SIZE.height : stryMutAct_9fa48("42197") ? false : stryMutAct_9fa48("42196") ? true : (stryCov_9fa48("42196", "42197", "42198"), (stryMutAct_9fa48("42201") ? width >= MIN_TERMINAL_SIZE.width : stryMutAct_9fa48("42200") ? width <= MIN_TERMINAL_SIZE.width : stryMutAct_9fa48("42199") ? false : (stryCov_9fa48("42199", "42200", "42201"), width < MIN_TERMINAL_SIZE.width)) || (stryMutAct_9fa48("42204") ? height >= MIN_TERMINAL_SIZE.height : stryMutAct_9fa48("42203") ? height <= MIN_TERMINAL_SIZE.height : stryMutAct_9fa48("42202") ? false : (stryCov_9fa48("42202", "42203", "42204"), height < MIN_TERMINAL_SIZE.height)));

      // Log resize
      this.debug(stryMutAct_9fa48("42205") ? "" : (stryCov_9fa48("42205"), 'Terminal resized'), stryMutAct_9fa48("42206") ? {} : (stryCov_9fa48("42206"), {
        from: oldSize,
        to: this.terminalSize,
        tooSmall: this.terminalTooSmall
      }));

      // Emit resize event
      if (stryMutAct_9fa48("42208") ? false : stryMutAct_9fa48("42207") ? true : (stryCov_9fa48("42207", "42208"), this.eventBus)) {
        if (stryMutAct_9fa48("42209")) {
          {}
        } else {
          stryCov_9fa48("42209");
          this.eventBus.emit(stryMutAct_9fa48("42210") ? "" : (stryCov_9fa48("42210"), 'terminal:resize'), stryMutAct_9fa48("42211") ? {} : (stryCov_9fa48("42211"), {
            width,
            height,
            tooSmall: this.terminalTooSmall
          }));
        }
      }

      // Call resize callback
      if (stryMutAct_9fa48("42213") ? false : stryMutAct_9fa48("42212") ? true : (stryCov_9fa48("42212", "42213"), this.onTerminalResize)) {
        if (stryMutAct_9fa48("42214")) {
          {}
        } else {
          stryCov_9fa48("42214");
          this.onTerminalResize(width, height);
        }
      }

      // Handle too small state change
      if (stryMutAct_9fa48("42217") ? this.terminalTooSmall || !wasTooSmall : stryMutAct_9fa48("42216") ? false : stryMutAct_9fa48("42215") ? true : (stryCov_9fa48("42215", "42216", "42217"), this.terminalTooSmall && (stryMutAct_9fa48("42218") ? wasTooSmall : (stryCov_9fa48("42218"), !wasTooSmall)))) {
        if (stryMutAct_9fa48("42219")) {
          {}
        } else {
          stryCov_9fa48("42219");
          this.handleTerminalTooSmall();
        }
      } else if (stryMutAct_9fa48("42222") ? !this.terminalTooSmall || wasTooSmall : stryMutAct_9fa48("42221") ? false : stryMutAct_9fa48("42220") ? true : (stryCov_9fa48("42220", "42221", "42222"), (stryMutAct_9fa48("42223") ? this.terminalTooSmall : (stryCov_9fa48("42223"), !this.terminalTooSmall)) && wasTooSmall)) {
        if (stryMutAct_9fa48("42224")) {
          {}
        } else {
          stryCov_9fa48("42224");
          // Terminal is now large enough
          if (stryMutAct_9fa48("42226") ? false : stryMutAct_9fa48("42225") ? true : (stryCov_9fa48("42225", "42226"), this.eventBus)) {
            if (stryMutAct_9fa48("42227")) {
              {}
            } else {
              stryCov_9fa48("42227");
              this.eventBus.emit(stryMutAct_9fa48("42228") ? "" : (stryCov_9fa48("42228"), 'terminal:sizeOk'), this.terminalSize);
            }
          }
        }
      }
    }
  }

  /**
   * Handle terminal too small condition
   * Requirements: 19.5
   */
  handleTerminalTooSmall() {
    if (stryMutAct_9fa48("42229")) {
      {}
    } else {
      stryCov_9fa48("42229");
      const message = (stryMutAct_9fa48("42230") ? "" : (stryCov_9fa48("42230"), 'Terminal too small. Minimum size: ')) + (stryMutAct_9fa48("42231") ? `` : (stryCov_9fa48("42231"), `${MIN_TERMINAL_SIZE.width}x${MIN_TERMINAL_SIZE.height}. `)) + (stryMutAct_9fa48("42232") ? `` : (stryCov_9fa48("42232"), `Current: ${this.terminalSize.width}x${this.terminalSize.height}`));
      this.warn(message);

      // Emit event
      if (stryMutAct_9fa48("42234") ? false : stryMutAct_9fa48("42233") ? true : (stryCov_9fa48("42233", "42234"), this.eventBus)) {
        if (stryMutAct_9fa48("42235")) {
          {}
        } else {
          stryCov_9fa48("42235");
          this.eventBus.emit(stryMutAct_9fa48("42236") ? "" : (stryCov_9fa48("42236"), 'terminal:tooSmall'), stryMutAct_9fa48("42237") ? {} : (stryCov_9fa48("42237"), {
            current: this.terminalSize,
            minimum: MIN_TERMINAL_SIZE
          }));
        }
      }

      // Call callback
      if (stryMutAct_9fa48("42239") ? false : stryMutAct_9fa48("42238") ? true : (stryCov_9fa48("42238", "42239"), this.onTerminalTooSmall)) {
        if (stryMutAct_9fa48("42240")) {
          {}
        } else {
          stryCov_9fa48("42240");
          this.onTerminalTooSmall(this.terminalSize, MIN_TERMINAL_SIZE);
        }
      }
    }
  }

  /**
   * Check if terminal is too small
   * Requirements: 19.5
   * @return {boolean}
   */
  isTerminalTooSmall() {
    if (stryMutAct_9fa48("42241")) {
      {}
    } else {
      stryCov_9fa48("42241");
      return this.terminalTooSmall;
    }
  }

  /**
   * Get current terminal size
   * @return {{width: number, height: number}}
   */
  getTerminalSize() {
    if (stryMutAct_9fa48("42242")) {
      {}
    } else {
      stryCov_9fa48("42242");
      return stryMutAct_9fa48("42243") ? {} : (stryCov_9fa48("42243"), {
        ...this.terminalSize
      });
    }
  }

  /**
   * Get minimum terminal size
   * @return {{width: number, height: number}}
   */
  getMinTerminalSize() {
    if (stryMutAct_9fa48("42244")) {
      {}
    } else {
      stryCov_9fa48("42244");
      return stryMutAct_9fa48("42245") ? {} : (stryCov_9fa48("42245"), {
        ...MIN_TERMINAL_SIZE
      });
    }
  }

  /**
   * Format a value with missing data indicator
   * Requirements: 19.2
   * @param {*} value - Value to format
   * @param {string} [placeholder='N/A'] - Placeholder for missing data
   * @return {string}
   */
  formatWithMissingIndicator(value, placeholder = stryMutAct_9fa48("42246") ? "" : (stryCov_9fa48("42246"), 'N/A')) {
    if (stryMutAct_9fa48("42247")) {
      {}
    } else {
      stryCov_9fa48("42247");
      if (stryMutAct_9fa48("42250") ? value === null && value === undefined : stryMutAct_9fa48("42249") ? false : stryMutAct_9fa48("42248") ? true : (stryCov_9fa48("42248", "42249", "42250"), (stryMutAct_9fa48("42252") ? value !== null : stryMutAct_9fa48("42251") ? false : (stryCov_9fa48("42251", "42252"), value === null)) || (stryMutAct_9fa48("42254") ? value !== undefined : stryMutAct_9fa48("42253") ? false : (stryCov_9fa48("42253", "42254"), value === undefined)))) {
        if (stryMutAct_9fa48("42255")) {
          {}
        } else {
          stryCov_9fa48("42255");
          return placeholder;
        }
      }
      return String(value);
    }
  }

  /**
   * Create a partial data indicator
   * Requirements: 19.2
   * @param {string} section - Section name
   * @return {Object}
   */
  createPartialDataIndicator(section) {
    if (stryMutAct_9fa48("42256")) {
      {}
    } else {
      stryCov_9fa48("42256");
      return stryMutAct_9fa48("42257") ? {} : (stryCov_9fa48("42257"), {
        section,
        message: stryMutAct_9fa48("42258") ? `` : (stryCov_9fa48("42258"), `[${section}: Data unavailable]`),
        isMissing: stryMutAct_9fa48("42259") ? false : (stryCov_9fa48("42259"), true)
      });
    }
  }

  /**
   * Check if data is partial/incomplete
   * Requirements: 19.2
   * @param {Object} data - Data object
   * @param {string[]} requiredFields - Required field names
   * @return {{isPartial: boolean, missingFields: string[]}}
   */
  checkPartialData(data, requiredFields) {
    if (stryMutAct_9fa48("42260")) {
      {}
    } else {
      stryCov_9fa48("42260");
      const missingFields = stryMutAct_9fa48("42261") ? ["Stryker was here"] : (stryCov_9fa48("42261"), []);
      for (const field of requiredFields) {
        if (stryMutAct_9fa48("42262")) {
          {}
        } else {
          stryCov_9fa48("42262");
          if (stryMutAct_9fa48("42265") ? data[field] === null && data[field] === undefined : stryMutAct_9fa48("42264") ? false : stryMutAct_9fa48("42263") ? true : (stryCov_9fa48("42263", "42264", "42265"), (stryMutAct_9fa48("42267") ? data[field] !== null : stryMutAct_9fa48("42266") ? false : (stryCov_9fa48("42266", "42267"), data[field] === null)) || (stryMutAct_9fa48("42269") ? data[field] !== undefined : stryMutAct_9fa48("42268") ? false : (stryCov_9fa48("42268", "42269"), data[field] === undefined)))) {
            if (stryMutAct_9fa48("42270")) {
              {}
            } else {
              stryCov_9fa48("42270");
              missingFields.push(field);
            }
          }
        }
      }
      return stryMutAct_9fa48("42271") ? {} : (stryCov_9fa48("42271"), {
        isPartial: stryMutAct_9fa48("42275") ? missingFields.length <= 0 : stryMutAct_9fa48("42274") ? missingFields.length >= 0 : stryMutAct_9fa48("42273") ? false : stryMutAct_9fa48("42272") ? true : (stryCov_9fa48("42272", "42273", "42274", "42275"), missingFields.length > 0),
        missingFields
      });
    }
  }

  /**
   * Log metadata computation warning
   * Requirements: 19.10
   * @param {string} operation - Operation name
   * @param {string} message - Warning message
   * @param {Object} [data] - Related data
   */
  logMetadataWarning(operation, message, data = {}) {
    if (stryMutAct_9fa48("42276")) {
      {}
    } else {
      stryCov_9fa48("42276");
      this.warn(stryMutAct_9fa48("42277") ? `` : (stryCov_9fa48("42277"), `Metadata computation: ${operation} - ${message}`), stryMutAct_9fa48("42278") ? {} : (stryCov_9fa48("42278"), {
        operation,
        data
      }));
    }
  }

  /**
   * Wrap a function with error handling
   * @param {Function} fn - Function to wrap
   * @param {string} [operation] - Operation name for error messages
   * @return {Function} Wrapped function
   */
  wrapWithErrorHandling(fn, operation = stryMutAct_9fa48("42279") ? "" : (stryCov_9fa48("42279"), 'Operation')) {
    if (stryMutAct_9fa48("42280")) {
      {}
    } else {
      stryCov_9fa48("42280");
      return async (...args) => {
        if (stryMutAct_9fa48("42281")) {
          {}
        } else {
          stryCov_9fa48("42281");
          try {
            if (stryMutAct_9fa48("42282")) {
              {}
            } else {
              stryCov_9fa48("42282");
              return await fn(...args);
            }
          } catch (error) {
            if (stryMutAct_9fa48("42283")) {
              {}
            } else {
              stryCov_9fa48("42283");
              this.handleApiError(error, operation);
              throw error;
            }
          }
        }
      };
    }
  }

  /**
   * Safely execute a function, returning default on error
   * @param {Function} fn - Function to execute
   * @param {*} defaultValue - Default value on error
   * @param {string} [operation] - Operation name for logging
   * @return {*} Result or default value
   */
  safeExecute(fn, defaultValue, operation = stryMutAct_9fa48("42284") ? "" : (stryCov_9fa48("42284"), 'Operation')) {
    if (stryMutAct_9fa48("42285")) {
      {}
    } else {
      stryCov_9fa48("42285");
      try {
        if (stryMutAct_9fa48("42286")) {
          {}
        } else {
          stryCov_9fa48("42286");
          return fn();
        }
      } catch (error) {
        if (stryMutAct_9fa48("42287")) {
          {}
        } else {
          stryCov_9fa48("42287");
          this.warn(stryMutAct_9fa48("42288") ? `` : (stryCov_9fa48("42288"), `${operation} failed, using default`), stryMutAct_9fa48("42289") ? {} : (stryCov_9fa48("42289"), {
            error
          }));
          return defaultValue;
        }
      }
    }
  }

  /**
   * Clear all dismiss timers
   */
  clearTimers() {
    if (stryMutAct_9fa48("42290")) {
      {}
    } else {
      stryCov_9fa48("42290");
      for (const timer of this.dismissTimers.values()) {
        if (stryMutAct_9fa48("42291")) {
          {}
        } else {
          stryCov_9fa48("42291");
          clearTimeout(timer);
        }
      }
      this.dismissTimers.clear();
    }
  }

  /**
   * Destroy and cleanup
   */
  destroy() {
    if (stryMutAct_9fa48("42292")) {
      {}
    } else {
      stryCov_9fa48("42292");
      this.clearTimers();
      this.notifications = stryMutAct_9fa48("42293") ? ["Stryker was here"] : (stryCov_9fa48("42293"), []);
      this.eventBus = null;
      this.onNotification = null;
      this.onTerminalResize = null;
      this.onTerminalTooSmall = null;
    }
  }
}