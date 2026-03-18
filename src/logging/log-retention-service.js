/**
 * Log Retention Service - Automatic cleanup of old log entries.
 * Uses table policies to manage log retention.
 * Requirements: 27.8
 */

import {EventEmitter} from 'events';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {CONFIG_KEY} from '../config/config-constants.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {ControlPlaneSystemTableGateway} from '../control-plane/control-plane-system-table-gateway.js';
import {PRESSURE_WORK_CLASS} from '../control-plane/pressure-governor.js';
import {
  createSystemMetadataGatewayRequiredError,
} from '../control-plane/system-metadata-access-error.js';
import {
  LOG_RETENTION_DEFAULT,
  LOG_RETENTION_ERROR_MSG,
  LOG_RETENTION_LOG_MSG,
} from './logging-constants.js';

const INITIAL_CLEANUP_DELAY_MS = 5000;
const CLEANUP_EVENT_NAME = 'cleanup';

const DEFAULT_CONFIG = Object.freeze({
  retentionPeriodMs: LOG_RETENTION_DEFAULT.RETENTION_PERIOD_MS,
  cleanupIntervalMs: LOG_RETENTION_DEFAULT.CLEANUP_INTERVAL_MS,
  batchSize: LOG_RETENTION_DEFAULT.BATCH_SIZE,
  maxDeletesPerRun: LOG_RETENTION_DEFAULT.MAX_DELETES_PER_RUN,
});

const retentionLogMessages = Object.freeze({
  initialized: LOG_RETENTION_LOG_MSG.INITIALIZED,
  shutdown: LOG_RETENTION_LOG_MSG.SHUTDOWN,
  schedulerStart: LOG_RETENTION_LOG_MSG.SCHEDULER_START,
  schedulerStopped: LOG_RETENTION_LOG_MSG.SCHEDULER_STOPPED,
  runningCleanup: LOG_RETENTION_LOG_MSG.RUNNING_CLEANUP,
  cleanupCompleted: LOG_RETENTION_LOG_MSG.CLEANUP_COMPLETED,
  retentionSet: LOG_RETENTION_LOG_MSG.RETENTION_SET,
});

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

    this.sqlQueryEngine = options.sqlQueryEngine || null;
    this.tablePolicyService = options.tablePolicyService || null;
    this.controlPlaneSystemTableGateway =
      options.controlPlaneSystemTableGateway || null;

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.retentionPeriodMs = options.retentionPeriodMs ||
      config.get(CONFIG_KEY.LOGGING_RETENTION_PERIOD_MS) ||
      LOG_RETENTION_DEFAULT.RETENTION_PERIOD_MS;
    this.cleanupIntervalMs = options.cleanupIntervalMs ||
      config.get(CONFIG_KEY.LOGGING_CLEANUP_INTERVAL_MS) ||
      LOG_RETENTION_DEFAULT.CLEANUP_INTERVAL_MS;
    this.batchSize = options.batchSize ||
      config.get(CONFIG_KEY.LOGGING_CLEANUP_BATCH_SIZE) || LOG_RETENTION_DEFAULT.BATCH_SIZE;
    this.maxDeletesPerRun = options.maxDeletesPerRun ||
      config.get(CONFIG_KEY.LOGGING_MAX_DELETES_PER_RUN) ||
      LOG_RETENTION_DEFAULT.MAX_DELETES_PER_RUN;

    // State
    this.initialized = false;
    this.cleanupTimer = null;
    this.isRunning = false;
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
    if (!LogRetentionService.instance) {
      LogRetentionService.instance = new LogRetentionService();
    }
    return LogRetentionService.instance;
  }

  /**
   * Reset the singleton instance (for testing).
   */
  static resetInstance() {
    if (LogRetentionService.instance) {
      LogRetentionService.instance.shutdown();
    }
    LogRetentionService.instance = null;
  }

  /**
   * Initialize the log retention service.
   * @param {Object} options - Initialization options.
   * @param {Object} options.sqlQueryEngine - SQL query engine.
   * @param {Object} options.tablePolicyService - Table policy service.
   */
  initialize(options = {}) {
    if (this.initialized) {
      return;
    }

    if (options.sqlQueryEngine) {
      this.sqlQueryEngine = options.sqlQueryEngine;
    }

    if (options.tablePolicyService) {
      this.tablePolicyService = options.tablePolicyService;
    }
    if (options.controlPlaneSystemTableGateway) {
      this.controlPlaneSystemTableGateway = options.controlPlaneSystemTableGateway;
    }

    this.initialized = true;
    this.logger.log(retentionLogMessages.initialized);
  }

  /**
   * Start the automatic cleanup scheduler.
   */
  startScheduler() {
    if (this.cleanupTimer) {
      return;
    }

    this.logger.log(retentionLogMessages.schedulerStart(this.cleanupIntervalMs));

    // Run initial cleanup after a short delay
    setTimeout(() => {
      this.runCleanup().catch((error) => {
        this.logger.error(LOG_RETENTION_ERROR_MSG.INITIAL_CLEANUP_FAILED, error.message);
      });
    }, INITIAL_CLEANUP_DELAY_MS);

    // Schedule periodic cleanup
    this.cleanupTimer = setInterval(() => {
      this.runCleanup().catch((error) => {
        this.logger.error(LOG_RETENTION_ERROR_MSG.SCHEDULED_CLEANUP_FAILED, error.message);
      });
    }, this.cleanupIntervalMs);

    // Don't prevent process exit
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Stop the automatic cleanup scheduler.
   */
  stopScheduler() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      this.logger.log(retentionLogMessages.schedulerStopped);
    }
  }

  /**
   * Run a cleanup cycle.
   * @return {Promise<Object>} Cleanup result.
   */
  async runCleanup() {
    if (this.isRunning) {
      return {
        success: false,
        error: LOG_RETENTION_ERROR_MSG.CLEANUP_IN_PROGRESS,
        deleted: 0,
      };
    }

    this.isRunning = true;
    const startTime = Date.now();
    let totalDeleted = 0;

    try {
      // Get retention period from table policy if available
      const retentionPeriodMs = await this.getRetentionPeriod();
      const cutoffTime = Date.now() - retentionPeriodMs;

      this.logger.log(
        retentionLogMessages.runningCleanup(new Date(cutoffTime).toISOString()),
      );

      // Delete in batches to avoid overwhelming the system
      let deletedInBatch = 0;
      let iterations = 0;
      const maxIterations = Math.ceil(this.maxDeletesPerRun / this.batchSize);

      do {
        deletedInBatch = await this.deleteOldLogs(cutoffTime, this.batchSize);
        totalDeleted += deletedInBatch;
        iterations++;
      } while (deletedInBatch >= this.batchSize && iterations < maxIterations);

      const duration = Date.now() - startTime;
      this.lastCleanupTime = Date.now();
      this.totalDeleted += totalDeleted;
      this.cleanupCount++;

      this.logger.log(
        retentionLogMessages.cleanupCompleted(totalDeleted, duration),
      );

      this.emit(CLEANUP_EVENT_NAME, {
        deleted: totalDeleted,
        duration,
        cutoffTime,
      });

      return {
        success: true,
        deleted: totalDeleted,
        duration,
        cutoffTime,
      };
    } catch (error) {
      this.logger.error(LOG_RETENTION_ERROR_MSG.CLEANUP_FAILED, error.message);
      throw error;
    } finally {
      this.isRunning = false;
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
    const gateway = this.getControlPlaneSystemTableGateway();
    if (!gateway) {
      throw createSystemMetadataGatewayRequiredError({
        serviceName: 'LogRetentionService',
        tableName: SYSTEM_TABLE_NAME.LOGS,
        operation: 'write',
        message: LOG_RETENTION_ERROR_MSG.ENGINE_NOT_AVAILABLE,
      });
    }

    // First, get the IDs of logs to delete
    const selectSQL =
      `SELECT log_id FROM ${SYSTEM_TABLE_NAME.LOGS}` +
      ' WHERE timestamp < ? ORDER BY timestamp ASC LIMIT ?';

    const selectResult = await gateway.executeQuery(
      selectSQL,
      [cutoffTime, limit],
      {
        workClass: PRESSURE_WORK_CLASS.BACKGROUND,
        allowPressureDefer: true,
      },
    );
    const selectedRows = Array.isArray(selectResult.results) ?
      selectResult.results :
      (Array.isArray(selectResult.rows) ? selectResult.rows : []);

    if (!selectResult.success ||
        selectedRows.length === 0) {
      return 0;
    }

    // Delete the selected logs
    const placeholders = selectedRows
      .map(() => '?').join(', ');
    const logIds = selectedRows.map((r) => r.log_id);
    const deleteSQL =
      `DELETE FROM ${SYSTEM_TABLE_NAME.LOGS}` +
      ` WHERE log_id IN (${placeholders})`;

    const deleteResult = await gateway.executeQuery(
      deleteSQL,
      logIds,
      {
        workClass: PRESSURE_WORK_CLASS.BACKGROUND,
        allowPressureDefer: true,
      },
    );

    return deleteResult.affectedRows ||
      selectedRows.length;
  }

  /**
   * Get the retention period from table policy or default.
   * @return {Promise<number>} Retention period in milliseconds.
   * @private
   */
  async getRetentionPeriod() {
    if (this.tablePolicyService) {
      try {
        const policy =
          await this.tablePolicyService.getTablePolicy(
            SYSTEM_TABLE_NAME.LOGS,
          );
        if (policy && policy.retentionPeriodMs) {
          return policy.retentionPeriodMs;
        }
      } catch (policyErr) {
        this.logger.warn(
          LOG_RETENTION_ERROR_MSG.CLEANUP_FAILED, policyErr.message,
        );
      }
    }

    return this.retentionPeriodMs;
  }

  /**
   * Set the retention period.
   * @param {number} periodMs - Retention period in milliseconds.
   */
  setRetentionPeriod(periodMs) {
    if (periodMs < 0) {
      throw new Error(LOG_RETENTION_ERROR_MSG.RETENTION_PERIOD_NEGATIVE);
    }
    this.retentionPeriodMs = periodMs;
    this.logger.log(retentionLogMessages.retentionSet(periodMs));
  }

  /**
   * Get service statistics.
   * @return {Object} Service statistics.
   */
  getStats() {
    return {
      initialized: this.initialized,
      isRunning: this.isRunning,
      lastCleanupTime: this.lastCleanupTime,
      totalDeleted: this.totalDeleted,
      cleanupCount: this.cleanupCount,
      retentionPeriodMs: this.retentionPeriodMs,
      cleanupIntervalMs: this.cleanupIntervalMs,
    };
  }

  /**
   * Check if the service is initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    return this.initialized;
  }

  /**
   * Shutdown the service.
   */
  shutdown() {
    this.stopScheduler();
    this.initialized = false;
    this.removeAllListeners();
    this.logger.log(retentionLogMessages.shutdown);
  }

  /**
   * @return {ControlPlaneSystemTableGateway|null}
   * @private
   */
  getControlPlaneSystemTableGateway() {
    if (this.controlPlaneSystemTableGateway) {
      if (!this.controlPlaneSystemTableGateway.sqlQueryEngine &&
          this.sqlQueryEngine) {
        this.controlPlaneSystemTableGateway.setSqlQueryEngine(this.sqlQueryEngine);
      }
      return this.controlPlaneSystemTableGateway;
    }
    if (!this.sqlQueryEngine) {
      return null;
    }
    this.controlPlaneSystemTableGateway = new ControlPlaneSystemTableGateway({
      sqlQueryEngine: this.sqlQueryEngine,
    });
    return this.controlPlaneSystemTableGateway;
  }
}

export {
  LogRetentionService,
  DEFAULT_CONFIG,
};
