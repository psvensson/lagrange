/**
 * ServicesP1DiagnosticLogger - Diagnostic logger for services-p1 operations.
 *
 * Provides detailed timing diagnostics for services-p1 CREATE_REPLICA operations
 * to help diagnose timeout issues. Tracks step timings and logs pending steps
 * when operations timeout.
 *
 * Requirements: 1.4, 1.5
 */

import {LoggingService} from '../logging/logging-service.js';

/**
 * Subsystem name for logging.
 * @type {string}
 */
const SUBSYSTEM = 'services-p1-diagnostic';

/**
 * Log messages for the diagnostic logger.
 * @type {Object}
 */
const LOG_MSG = {
  STEP_COMPLETED: 'Services-p1 operation step completed',
  OPERATION_TIMEOUT: 'Services-p1 operation timeout',
};

/**
 * Diagnostic logger for services-p1 operations.
 * Tracks timing for each step of an operation and logs diagnostic
 * information when operations timeout.
 */
class ServicesP1DiagnosticLogger {
  /**
   * Create a new ServicesP1DiagnosticLogger.
   * @param {Object} logger - Logger instance (optional, defaults to LoggingService).
   */
  constructor(logger) {
    if (logger) {
      this.logger = logger;
    } else {
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.isInitialized() ?
        loggingService.forSubsystem(SUBSYSTEM) : console;
    }
    this.operationTimings = new Map();
  }

  /**
   * Start timing an operation step.
   * @param {string} operationId - Operation ID.
   * @param {string} step - Step name.
   */
  startStep(operationId, step) {
    const key = `${operationId}:${step}`;
    this.operationTimings.set(key, {
      step,
      startedAt: Date.now(),
    });
  }

  /**
   * End timing an operation step.
   * @param {string} operationId - Operation ID.
   * @param {string} step - Step name.
   * @param {Object} metadata - Additional metadata.
   */
  endStep(operationId, step, metadata = {}) {
    const key = `${operationId}:${step}`;
    const timing = this.operationTimings.get(key);

    if (timing) {
      const elapsed = Date.now() - timing.startedAt;
      this.logger.debug(LOG_MSG.STEP_COMPLETED, {
        operationId,
        step,
        elapsedMs: elapsed,
        ...metadata,
      });
      this.operationTimings.delete(key);
    }
  }

  /**
   * Log operation timeout with all collected timings.
   * @param {string} operationId - Operation ID.
   * @param {Object} metadata - Additional metadata.
   */
  logTimeout(operationId, metadata = {}) {
    const pendingSteps = [];
    const prefix = `${operationId}:`;

    for (const [key, timing] of this.operationTimings) {
      if (key.startsWith(prefix)) {
        pendingSteps.push({
          step: timing.step,
          elapsedMs: Date.now() - timing.startedAt,
        });
      }
    }

    this.logger.error(LOG_MSG.OPERATION_TIMEOUT, {
      operationId,
      pendingSteps,
      ...metadata,
    });
  }
}

export {ServicesP1DiagnosticLogger, LOG_MSG, SUBSYSTEM};
