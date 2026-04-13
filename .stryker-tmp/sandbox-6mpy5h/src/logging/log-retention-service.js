/**
 * Log Retention Service - Automatic cleanup of old log entries.
 * Uses table policies to manage log retention.
 * Requirements: 27.8
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
import { ConfigurationManager } from '../config/configuration-manager.js';
import { CONFIG_KEY } from '../config/config-constants.js';
import { SYSTEM_TABLE_NAME } from '../bootstrap/system-table-schemas-constants.js';
import { createControlPlaneRuntimeBundle } from '../control-plane/control-plane-runtime-bundle.js';
import { PRESSURE_WORK_CLASS } from '../control-plane/pressure-governor.js';
import { createSystemMetadataGatewayRequiredError } from '../control-plane/system-metadata-access-error.js';
import { LOG_RETENTION_DEFAULT, LOG_RETENTION_ERROR_MSG, LOG_RETENTION_LOG_MSG } from './logging-constants.js';
const INITIAL_CLEANUP_DELAY_MS = 5000;
const CLEANUP_EVENT_NAME = stryMutAct_9fa48("83248") ? "" : (stryCov_9fa48("83248"), 'cleanup');
const DEFAULT_CONFIG = Object.freeze(stryMutAct_9fa48("83249") ? {} : (stryCov_9fa48("83249"), {
  retentionPeriodMs: LOG_RETENTION_DEFAULT.RETENTION_PERIOD_MS,
  cleanupIntervalMs: LOG_RETENTION_DEFAULT.CLEANUP_INTERVAL_MS,
  batchSize: LOG_RETENTION_DEFAULT.BATCH_SIZE,
  maxDeletesPerRun: LOG_RETENTION_DEFAULT.MAX_DELETES_PER_RUN
}));
const retentionLogMessages = Object.freeze(stryMutAct_9fa48("83250") ? {} : (stryCov_9fa48("83250"), {
  initialized: LOG_RETENTION_LOG_MSG.INITIALIZED,
  shutdown: LOG_RETENTION_LOG_MSG.SHUTDOWN,
  schedulerStart: LOG_RETENTION_LOG_MSG.SCHEDULER_START,
  schedulerStopped: LOG_RETENTION_LOG_MSG.SCHEDULER_STOPPED,
  runningCleanup: LOG_RETENTION_LOG_MSG.RUNNING_CLEANUP,
  cleanupCompleted: LOG_RETENTION_LOG_MSG.CLEANUP_COMPLETED,
  retentionSet: LOG_RETENTION_LOG_MSG.RETENTION_SET
}));

/**
 * LogRetentionService manages automatic cleanup of old log entries.
 * It uses table policies to determine retention periods.
 */
class LogRetentionService extends EventEmitter {
  static instance = null;

  /**
   * Create a new LogRetentionService.
   * @param {Object} options - Configuration options.
   * @private
   */
  constructor(options = {}) {
    super();
    this.sqlQueryEngine = stryMutAct_9fa48("83253") ? options.sqlQueryEngine && null : stryMutAct_9fa48("83252") ? false : stryMutAct_9fa48("83251") ? true : (stryCov_9fa48("83251", "83252", "83253"), options.sqlQueryEngine || null);
    this.tablePolicyService = stryMutAct_9fa48("83256") ? options.tablePolicyService && null : stryMutAct_9fa48("83255") ? false : stryMutAct_9fa48("83254") ? true : (stryCov_9fa48("83254", "83255", "83256"), options.tablePolicyService || null);
    this.controlPlaneSystemTableGateway = stryMutAct_9fa48("83259") ? options.controlPlaneSystemTableGateway && null : stryMutAct_9fa48("83258") ? false : stryMutAct_9fa48("83257") ? true : (stryCov_9fa48("83257", "83258", "83259"), options.controlPlaneSystemTableGateway || null);

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.retentionPeriodMs = stryMutAct_9fa48("83262") ? (options.retentionPeriodMs || config.get(CONFIG_KEY.LOGGING_RETENTION_PERIOD_MS)) && LOG_RETENTION_DEFAULT.RETENTION_PERIOD_MS : stryMutAct_9fa48("83261") ? false : stryMutAct_9fa48("83260") ? true : (stryCov_9fa48("83260", "83261", "83262"), (stryMutAct_9fa48("83264") ? options.retentionPeriodMs && config.get(CONFIG_KEY.LOGGING_RETENTION_PERIOD_MS) : stryMutAct_9fa48("83263") ? false : (stryCov_9fa48("83263", "83264"), options.retentionPeriodMs || config.get(CONFIG_KEY.LOGGING_RETENTION_PERIOD_MS))) || LOG_RETENTION_DEFAULT.RETENTION_PERIOD_MS);
    this.cleanupIntervalMs = stryMutAct_9fa48("83267") ? (options.cleanupIntervalMs || config.get(CONFIG_KEY.LOGGING_CLEANUP_INTERVAL_MS)) && LOG_RETENTION_DEFAULT.CLEANUP_INTERVAL_MS : stryMutAct_9fa48("83266") ? false : stryMutAct_9fa48("83265") ? true : (stryCov_9fa48("83265", "83266", "83267"), (stryMutAct_9fa48("83269") ? options.cleanupIntervalMs && config.get(CONFIG_KEY.LOGGING_CLEANUP_INTERVAL_MS) : stryMutAct_9fa48("83268") ? false : (stryCov_9fa48("83268", "83269"), options.cleanupIntervalMs || config.get(CONFIG_KEY.LOGGING_CLEANUP_INTERVAL_MS))) || LOG_RETENTION_DEFAULT.CLEANUP_INTERVAL_MS);
    this.batchSize = stryMutAct_9fa48("83272") ? (options.batchSize || config.get(CONFIG_KEY.LOGGING_CLEANUP_BATCH_SIZE)) && LOG_RETENTION_DEFAULT.BATCH_SIZE : stryMutAct_9fa48("83271") ? false : stryMutAct_9fa48("83270") ? true : (stryCov_9fa48("83270", "83271", "83272"), (stryMutAct_9fa48("83274") ? options.batchSize && config.get(CONFIG_KEY.LOGGING_CLEANUP_BATCH_SIZE) : stryMutAct_9fa48("83273") ? false : (stryCov_9fa48("83273", "83274"), options.batchSize || config.get(CONFIG_KEY.LOGGING_CLEANUP_BATCH_SIZE))) || LOG_RETENTION_DEFAULT.BATCH_SIZE);
    this.maxDeletesPerRun = stryMutAct_9fa48("83277") ? (options.maxDeletesPerRun || config.get(CONFIG_KEY.LOGGING_MAX_DELETES_PER_RUN)) && LOG_RETENTION_DEFAULT.MAX_DELETES_PER_RUN : stryMutAct_9fa48("83276") ? false : stryMutAct_9fa48("83275") ? true : (stryCov_9fa48("83275", "83276", "83277"), (stryMutAct_9fa48("83279") ? options.maxDeletesPerRun && config.get(CONFIG_KEY.LOGGING_MAX_DELETES_PER_RUN) : stryMutAct_9fa48("83278") ? false : (stryCov_9fa48("83278", "83279"), options.maxDeletesPerRun || config.get(CONFIG_KEY.LOGGING_MAX_DELETES_PER_RUN))) || LOG_RETENTION_DEFAULT.MAX_DELETES_PER_RUN);

    // State
    this.initialized = stryMutAct_9fa48("83280") ? true : (stryCov_9fa48("83280"), false);
    this.cleanupTimer = null;
    this.isRunning = stryMutAct_9fa48("83281") ? true : (stryCov_9fa48("83281"), false);
    this.lastCleanupTime = null;
    this.totalDeleted = 0;
    this.cleanupCount = 0;

    // Logging (use console to avoid recursion)
    this.logger = console;
  }

  /**
   * Get the singleton instance.
   * @return {LogRetentionService} The log retention service instance.
   */
  static getInstance() {
    if (stryMutAct_9fa48("83282")) {
      {}
    } else {
      stryCov_9fa48("83282");
      if (stryMutAct_9fa48("83285") ? false : stryMutAct_9fa48("83284") ? true : stryMutAct_9fa48("83283") ? LogRetentionService.instance : (stryCov_9fa48("83283", "83284", "83285"), !LogRetentionService.instance)) {
        if (stryMutAct_9fa48("83286")) {
          {}
        } else {
          stryCov_9fa48("83286");
          LogRetentionService.instance = new LogRetentionService();
        }
      }
      return LogRetentionService.instance;
    }
  }

  /**
   * Reset the singleton instance (for testing).
   */
  static resetInstance() {
    if (stryMutAct_9fa48("83287")) {
      {}
    } else {
      stryCov_9fa48("83287");
      if (stryMutAct_9fa48("83289") ? false : stryMutAct_9fa48("83288") ? true : (stryCov_9fa48("83288", "83289"), LogRetentionService.instance)) {
        if (stryMutAct_9fa48("83290")) {
          {}
        } else {
          stryCov_9fa48("83290");
          LogRetentionService.instance.shutdown();
        }
      }
      LogRetentionService.instance = null;
    }
  }

  /**
   * Initialize the log retention service.
   * @param {Object} options - Initialization options.
   * @param {Object} options.sqlQueryEngine - SQL query engine.
   * @param {Object} options.tablePolicyService - Table policy service.
   */
  initialize(options = {}) {
    if (stryMutAct_9fa48("83291")) {
      {}
    } else {
      stryCov_9fa48("83291");
      if (stryMutAct_9fa48("83293") ? false : stryMutAct_9fa48("83292") ? true : (stryCov_9fa48("83292", "83293"), this.initialized)) {
        if (stryMutAct_9fa48("83294")) {
          {}
        } else {
          stryCov_9fa48("83294");
          return;
        }
      }
      if (stryMutAct_9fa48("83296") ? false : stryMutAct_9fa48("83295") ? true : (stryCov_9fa48("83295", "83296"), options.sqlQueryEngine)) {
        if (stryMutAct_9fa48("83297")) {
          {}
        } else {
          stryCov_9fa48("83297");
          this.sqlQueryEngine = options.sqlQueryEngine;
        }
      }
      if (stryMutAct_9fa48("83299") ? false : stryMutAct_9fa48("83298") ? true : (stryCov_9fa48("83298", "83299"), options.tablePolicyService)) {
        if (stryMutAct_9fa48("83300")) {
          {}
        } else {
          stryCov_9fa48("83300");
          this.tablePolicyService = options.tablePolicyService;
        }
      }
      if (stryMutAct_9fa48("83302") ? false : stryMutAct_9fa48("83301") ? true : (stryCov_9fa48("83301", "83302"), options.controlPlaneSystemTableGateway)) {
        if (stryMutAct_9fa48("83303")) {
          {}
        } else {
          stryCov_9fa48("83303");
          this.controlPlaneSystemTableGateway = options.controlPlaneSystemTableGateway;
        }
      }
      this.initialized = stryMutAct_9fa48("83304") ? false : (stryCov_9fa48("83304"), true);
      this.logger.log(retentionLogMessages.initialized);
    }
  }

  /**
   * Start the automatic cleanup scheduler.
   */
  startScheduler() {
    if (stryMutAct_9fa48("83305")) {
      {}
    } else {
      stryCov_9fa48("83305");
      if (stryMutAct_9fa48("83307") ? false : stryMutAct_9fa48("83306") ? true : (stryCov_9fa48("83306", "83307"), this.cleanupTimer)) {
        if (stryMutAct_9fa48("83308")) {
          {}
        } else {
          stryCov_9fa48("83308");
          return;
        }
      }
      this.logger.log(retentionLogMessages.schedulerStart(this.cleanupIntervalMs));

      // Run initial cleanup after a short delay
      setTimeout(() => {
        if (stryMutAct_9fa48("83309")) {
          {}
        } else {
          stryCov_9fa48("83309");
          this.runCleanup().catch(error => {
            if (stryMutAct_9fa48("83310")) {
              {}
            } else {
              stryCov_9fa48("83310");
              this.logger.error(LOG_RETENTION_ERROR_MSG.INITIAL_CLEANUP_FAILED, error.message);
            }
          });
        }
      }, INITIAL_CLEANUP_DELAY_MS);

      // Schedule periodic cleanup
      this.cleanupTimer = setInterval(() => {
        if (stryMutAct_9fa48("83311")) {
          {}
        } else {
          stryCov_9fa48("83311");
          this.runCleanup().catch(error => {
            if (stryMutAct_9fa48("83312")) {
              {}
            } else {
              stryCov_9fa48("83312");
              this.logger.error(LOG_RETENTION_ERROR_MSG.SCHEDULED_CLEANUP_FAILED, error.message);
            }
          });
        }
      }, this.cleanupIntervalMs);

      // Don't prevent process exit
      if (stryMutAct_9fa48("83314") ? false : stryMutAct_9fa48("83313") ? true : (stryCov_9fa48("83313", "83314"), this.cleanupTimer.unref)) {
        if (stryMutAct_9fa48("83315")) {
          {}
        } else {
          stryCov_9fa48("83315");
          this.cleanupTimer.unref();
        }
      }
    }
  }

  /**
   * Stop the automatic cleanup scheduler.
   */
  stopScheduler() {
    if (stryMutAct_9fa48("83316")) {
      {}
    } else {
      stryCov_9fa48("83316");
      if (stryMutAct_9fa48("83318") ? false : stryMutAct_9fa48("83317") ? true : (stryCov_9fa48("83317", "83318"), this.cleanupTimer)) {
        if (stryMutAct_9fa48("83319")) {
          {}
        } else {
          stryCov_9fa48("83319");
          clearInterval(this.cleanupTimer);
          this.cleanupTimer = null;
          this.logger.log(retentionLogMessages.schedulerStopped);
        }
      }
    }
  }

  /**
   * Run a cleanup cycle.
   * @return {Promise<Object>} Cleanup result.
   */
  async runCleanup() {
    if (stryMutAct_9fa48("83320")) {
      {}
    } else {
      stryCov_9fa48("83320");
      if (stryMutAct_9fa48("83322") ? false : stryMutAct_9fa48("83321") ? true : (stryCov_9fa48("83321", "83322"), this.isRunning)) {
        if (stryMutAct_9fa48("83323")) {
          {}
        } else {
          stryCov_9fa48("83323");
          return stryMutAct_9fa48("83324") ? {} : (stryCov_9fa48("83324"), {
            success: stryMutAct_9fa48("83325") ? true : (stryCov_9fa48("83325"), false),
            error: LOG_RETENTION_ERROR_MSG.CLEANUP_IN_PROGRESS,
            deleted: 0
          });
        }
      }
      this.isRunning = stryMutAct_9fa48("83326") ? false : (stryCov_9fa48("83326"), true);
      const startTime = Date.now();
      let totalDeleted = 0;
      try {
        if (stryMutAct_9fa48("83327")) {
          {}
        } else {
          stryCov_9fa48("83327");
          // Get retention period from table policy if available
          const retentionPeriodMs = await this.getRetentionPeriod();
          const cutoffTime = stryMutAct_9fa48("83328") ? Date.now() + retentionPeriodMs : (stryCov_9fa48("83328"), Date.now() - retentionPeriodMs);
          this.logger.log(retentionLogMessages.runningCleanup(new Date(cutoffTime).toISOString()));

          // Delete in batches to avoid overwhelming the system
          let deletedInBatch = 0;
          let iterations = 0;
          const maxIterations = Math.ceil(stryMutAct_9fa48("83329") ? this.maxDeletesPerRun * this.batchSize : (stryCov_9fa48("83329"), this.maxDeletesPerRun / this.batchSize));
          do {
            if (stryMutAct_9fa48("83330")) {
              {}
            } else {
              stryCov_9fa48("83330");
              deletedInBatch = await this.deleteOldLogs(cutoffTime, this.batchSize);
              stryMutAct_9fa48("83331") ? totalDeleted -= deletedInBatch : (stryCov_9fa48("83331"), totalDeleted += deletedInBatch);
              stryMutAct_9fa48("83332") ? iterations-- : (stryCov_9fa48("83332"), iterations++);
            }
          } while (stryMutAct_9fa48("83334") ? deletedInBatch >= this.batchSize || iterations < maxIterations : stryMutAct_9fa48("83333") ? false : (stryCov_9fa48("83333", "83334"), (stryMutAct_9fa48("83337") ? deletedInBatch < this.batchSize : stryMutAct_9fa48("83336") ? deletedInBatch > this.batchSize : stryMutAct_9fa48("83335") ? true : (stryCov_9fa48("83335", "83336", "83337"), deletedInBatch >= this.batchSize)) && (stryMutAct_9fa48("83340") ? iterations >= maxIterations : stryMutAct_9fa48("83339") ? iterations <= maxIterations : stryMutAct_9fa48("83338") ? true : (stryCov_9fa48("83338", "83339", "83340"), iterations < maxIterations))));
          const duration = stryMutAct_9fa48("83341") ? Date.now() + startTime : (stryCov_9fa48("83341"), Date.now() - startTime);
          this.lastCleanupTime = Date.now();
          stryMutAct_9fa48("83342") ? this.totalDeleted -= totalDeleted : (stryCov_9fa48("83342"), this.totalDeleted += totalDeleted);
          stryMutAct_9fa48("83343") ? this.cleanupCount-- : (stryCov_9fa48("83343"), this.cleanupCount++);
          this.logger.log(retentionLogMessages.cleanupCompleted(totalDeleted, duration));
          this.emit(CLEANUP_EVENT_NAME, stryMutAct_9fa48("83344") ? {} : (stryCov_9fa48("83344"), {
            deleted: totalDeleted,
            duration,
            cutoffTime
          }));
          return stryMutAct_9fa48("83345") ? {} : (stryCov_9fa48("83345"), {
            success: stryMutAct_9fa48("83346") ? false : (stryCov_9fa48("83346"), true),
            deleted: totalDeleted,
            duration,
            cutoffTime
          });
        }
      } catch (error) {
        if (stryMutAct_9fa48("83347")) {
          {}
        } else {
          stryCov_9fa48("83347");
          this.logger.error(LOG_RETENTION_ERROR_MSG.CLEANUP_FAILED, error.message);
          throw error;
        }
      } finally {
        if (stryMutAct_9fa48("83348")) {
          {}
        } else {
          stryCov_9fa48("83348");
          this.isRunning = stryMutAct_9fa48("83349") ? true : (stryCov_9fa48("83349"), false);
        }
      }
    }
  }

  /**
   * Delete old log entries.
   * @param {number} cutoffTime - Timestamp before which to delete.
   * @param {number} limit - Maximum number to delete.
   * @return {Promise<number>} Number of entries deleted.
   * @private
   */
  async deleteOldLogs(cutoffTime, limit) {
    if (stryMutAct_9fa48("83350")) {
      {}
    } else {
      stryCov_9fa48("83350");
      const gateway = this.getControlPlaneSystemTableGateway();
      if (stryMutAct_9fa48("83353") ? false : stryMutAct_9fa48("83352") ? true : stryMutAct_9fa48("83351") ? gateway : (stryCov_9fa48("83351", "83352", "83353"), !gateway)) {
        if (stryMutAct_9fa48("83354")) {
          {}
        } else {
          stryCov_9fa48("83354");
          throw createSystemMetadataGatewayRequiredError(stryMutAct_9fa48("83355") ? {} : (stryCov_9fa48("83355"), {
            serviceName: stryMutAct_9fa48("83356") ? "" : (stryCov_9fa48("83356"), 'LogRetentionService'),
            tableName: SYSTEM_TABLE_NAME.LOGS,
            operation: stryMutAct_9fa48("83357") ? "" : (stryCov_9fa48("83357"), 'write'),
            message: LOG_RETENTION_ERROR_MSG.ENGINE_NOT_AVAILABLE
          }));
        }
      }

      // First, get the IDs of logs to delete
      const selectSQL = (stryMutAct_9fa48("83358") ? `` : (stryCov_9fa48("83358"), `SELECT log_id FROM ${SYSTEM_TABLE_NAME.LOGS}`)) + (stryMutAct_9fa48("83359") ? "" : (stryCov_9fa48("83359"), ' WHERE timestamp < ? ORDER BY timestamp ASC LIMIT ?'));
      const selectResult = await gateway.executeQuery(selectSQL, stryMutAct_9fa48("83360") ? [] : (stryCov_9fa48("83360"), [cutoffTime, limit]), stryMutAct_9fa48("83361") ? {} : (stryCov_9fa48("83361"), {
        workClass: PRESSURE_WORK_CLASS.BACKGROUND,
        allowPressureDefer: stryMutAct_9fa48("83362") ? false : (stryCov_9fa48("83362"), true)
      }));
      const selectedRows = Array.isArray(selectResult.results) ? selectResult.results : Array.isArray(selectResult.rows) ? selectResult.rows : stryMutAct_9fa48("83363") ? ["Stryker was here"] : (stryCov_9fa48("83363"), []);
      if (stryMutAct_9fa48("83366") ? !selectResult.success && selectedRows.length === 0 : stryMutAct_9fa48("83365") ? false : stryMutAct_9fa48("83364") ? true : (stryCov_9fa48("83364", "83365", "83366"), (stryMutAct_9fa48("83367") ? selectResult.success : (stryCov_9fa48("83367"), !selectResult.success)) || (stryMutAct_9fa48("83369") ? selectedRows.length !== 0 : stryMutAct_9fa48("83368") ? false : (stryCov_9fa48("83368", "83369"), selectedRows.length === 0)))) {
        if (stryMutAct_9fa48("83370")) {
          {}
        } else {
          stryCov_9fa48("83370");
          return 0;
        }
      }

      // Delete the selected logs
      const placeholders = selectedRows.map(stryMutAct_9fa48("83371") ? () => undefined : (stryCov_9fa48("83371"), () => stryMutAct_9fa48("83372") ? "" : (stryCov_9fa48("83372"), '?'))).join(stryMutAct_9fa48("83373") ? "" : (stryCov_9fa48("83373"), ', '));
      const logIds = selectedRows.map(stryMutAct_9fa48("83374") ? () => undefined : (stryCov_9fa48("83374"), r => r.log_id));
      const deleteSQL = (stryMutAct_9fa48("83375") ? `` : (stryCov_9fa48("83375"), `DELETE FROM ${SYSTEM_TABLE_NAME.LOGS}`)) + (stryMutAct_9fa48("83376") ? `` : (stryCov_9fa48("83376"), ` WHERE log_id IN (${placeholders})`));
      const deleteResult = await gateway.executeQuery(deleteSQL, logIds, stryMutAct_9fa48("83377") ? {} : (stryCov_9fa48("83377"), {
        workClass: PRESSURE_WORK_CLASS.BACKGROUND,
        allowPressureDefer: stryMutAct_9fa48("83378") ? false : (stryCov_9fa48("83378"), true)
      }));
      return stryMutAct_9fa48("83381") ? deleteResult.affectedRows && selectedRows.length : stryMutAct_9fa48("83380") ? false : stryMutAct_9fa48("83379") ? true : (stryCov_9fa48("83379", "83380", "83381"), deleteResult.affectedRows || selectedRows.length);
    }
  }

  /**
   * Get the retention period from table policy or default.
   * @return {Promise<number>} Retention period in milliseconds.
   * @private
   */
  async getRetentionPeriod() {
    if (stryMutAct_9fa48("83382")) {
      {}
    } else {
      stryCov_9fa48("83382");
      if (stryMutAct_9fa48("83384") ? false : stryMutAct_9fa48("83383") ? true : (stryCov_9fa48("83383", "83384"), this.tablePolicyService)) {
        if (stryMutAct_9fa48("83385")) {
          {}
        } else {
          stryCov_9fa48("83385");
          try {
            if (stryMutAct_9fa48("83386")) {
              {}
            } else {
              stryCov_9fa48("83386");
              const policy = await this.tablePolicyService.getTablePolicy(SYSTEM_TABLE_NAME.LOGS);
              if (stryMutAct_9fa48("83389") ? policy || policy.retentionPeriodMs : stryMutAct_9fa48("83388") ? false : stryMutAct_9fa48("83387") ? true : (stryCov_9fa48("83387", "83388", "83389"), policy && policy.retentionPeriodMs)) {
                if (stryMutAct_9fa48("83390")) {
                  {}
                } else {
                  stryCov_9fa48("83390");
                  return policy.retentionPeriodMs;
                }
              }
            }
          } catch (policyErr) {
            if (stryMutAct_9fa48("83391")) {
              {}
            } else {
              stryCov_9fa48("83391");
              this.logger.warn(LOG_RETENTION_ERROR_MSG.CLEANUP_FAILED, policyErr.message);
            }
          }
        }
      }
      return this.retentionPeriodMs;
    }
  }

  /**
   * Set the retention period.
   * @param {number} periodMs - Retention period in milliseconds.
   */
  setRetentionPeriod(periodMs) {
    if (stryMutAct_9fa48("83392")) {
      {}
    } else {
      stryCov_9fa48("83392");
      if (stryMutAct_9fa48("83396") ? periodMs >= 0 : stryMutAct_9fa48("83395") ? periodMs <= 0 : stryMutAct_9fa48("83394") ? false : stryMutAct_9fa48("83393") ? true : (stryCov_9fa48("83393", "83394", "83395", "83396"), periodMs < 0)) {
        if (stryMutAct_9fa48("83397")) {
          {}
        } else {
          stryCov_9fa48("83397");
          throw new Error(LOG_RETENTION_ERROR_MSG.RETENTION_PERIOD_NEGATIVE);
        }
      }
      this.retentionPeriodMs = periodMs;
      this.logger.log(retentionLogMessages.retentionSet(periodMs));
    }
  }

  /**
   * Get service statistics.
   * @return {Object} Service statistics.
   */
  getStats() {
    if (stryMutAct_9fa48("83398")) {
      {}
    } else {
      stryCov_9fa48("83398");
      return stryMutAct_9fa48("83399") ? {} : (stryCov_9fa48("83399"), {
        initialized: this.initialized,
        isRunning: this.isRunning,
        lastCleanupTime: this.lastCleanupTime,
        totalDeleted: this.totalDeleted,
        cleanupCount: this.cleanupCount,
        retentionPeriodMs: this.retentionPeriodMs,
        cleanupIntervalMs: this.cleanupIntervalMs
      });
    }
  }

  /**
   * Check if the service is initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    if (stryMutAct_9fa48("83400")) {
      {}
    } else {
      stryCov_9fa48("83400");
      return this.initialized;
    }
  }

  /**
   * Shutdown the service.
   */
  shutdown() {
    if (stryMutAct_9fa48("83401")) {
      {}
    } else {
      stryCov_9fa48("83401");
      this.stopScheduler();
      this.initialized = stryMutAct_9fa48("83402") ? true : (stryCov_9fa48("83402"), false);
      this.removeAllListeners();
      this.logger.log(retentionLogMessages.shutdown);
    }
  }

  /**
   * @return {ControlPlaneSystemTableGateway|null}
   * @private
   */
  getControlPlaneSystemTableGateway() {
    if (stryMutAct_9fa48("83403")) {
      {}
    } else {
      stryCov_9fa48("83403");
      if (stryMutAct_9fa48("83405") ? false : stryMutAct_9fa48("83404") ? true : (stryCov_9fa48("83404", "83405"), this.controlPlaneSystemTableGateway)) {
        if (stryMutAct_9fa48("83406")) {
          {}
        } else {
          stryCov_9fa48("83406");
          return this.controlPlaneSystemTableGateway;
        }
      }
      if (stryMutAct_9fa48("83409") ? false : stryMutAct_9fa48("83408") ? true : stryMutAct_9fa48("83407") ? this.sqlQueryEngine : (stryCov_9fa48("83407", "83408", "83409"), !this.sqlQueryEngine)) {
        if (stryMutAct_9fa48("83410")) {
          {}
        } else {
          stryCov_9fa48("83410");
          return null;
        }
      }
      this.controlPlaneSystemTableGateway = createControlPlaneRuntimeBundle(stryMutAct_9fa48("83411") ? {} : (stryCov_9fa48("83411"), {
        getSqlQueryEngine: stryMutAct_9fa48("83412") ? () => undefined : (stryCov_9fa48("83412"), () => this.sqlQueryEngine)
      })).controlPlaneSystemTableGateway;
      return this.controlPlaneSystemTableGateway;
    }
  }
}
export { LogRetentionService, DEFAULT_CONFIG };