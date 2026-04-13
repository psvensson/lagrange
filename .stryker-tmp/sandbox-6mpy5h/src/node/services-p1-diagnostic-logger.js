/**
 * ServicesP1DiagnosticLogger - Diagnostic logger for services-p1 operations.
 *
 * Provides detailed timing diagnostics for services-p1 CREATE_REPLICA operations
 * to help diagnose timeout issues. Tracks step timings and logs pending steps
 * when operations timeout.
 *
 * Requirements: 1.4, 1.5
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
import { LoggingService } from '../logging/logging-service.js';

/**
 * Subsystem name for logging.
 * @type {string}
 */
const SUBSYSTEM = stryMutAct_9fa48("97191") ? "" : (stryCov_9fa48("97191"), 'services-p1-diagnostic');

/**
 * Log messages for the diagnostic logger.
 * @type {Object}
 */
const LOG_MSG = stryMutAct_9fa48("97192") ? {} : (stryCov_9fa48("97192"), {
  STEP_COMPLETED: stryMutAct_9fa48("97193") ? "" : (stryCov_9fa48("97193"), 'Services-p1 operation step completed'),
  OPERATION_TIMEOUT: stryMutAct_9fa48("97194") ? "" : (stryCov_9fa48("97194"), 'Services-p1 operation timeout')
});

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
    if (stryMutAct_9fa48("97195")) {
      {}
    } else {
      stryCov_9fa48("97195");
      if (stryMutAct_9fa48("97197") ? false : stryMutAct_9fa48("97196") ? true : (stryCov_9fa48("97196", "97197"), logger)) {
        if (stryMutAct_9fa48("97198")) {
          {}
        } else {
          stryCov_9fa48("97198");
          this.logger = logger;
        }
      } else {
        if (stryMutAct_9fa48("97199")) {
          {}
        } else {
          stryCov_9fa48("97199");
          const loggingService = LoggingService.getInstance();
          this.logger = loggingService.isInitialized() ? loggingService.forSubsystem(SUBSYSTEM) : console;
        }
      }
      this.operationTimings = new Map();
    }
  }

  /**
   * Start timing an operation step.
   * @param {string} operationId - Operation ID.
   * @param {string} step - Step name.
   */
  startStep(operationId, step) {
    if (stryMutAct_9fa48("97200")) {
      {}
    } else {
      stryCov_9fa48("97200");
      const key = stryMutAct_9fa48("97201") ? `` : (stryCov_9fa48("97201"), `${operationId}:${step}`);
      this.operationTimings.set(key, stryMutAct_9fa48("97202") ? {} : (stryCov_9fa48("97202"), {
        step,
        startedAt: Date.now()
      }));
    }
  }

  /**
   * End timing an operation step.
   * @param {string} operationId - Operation ID.
   * @param {string} step - Step name.
   * @param {Object} metadata - Additional metadata.
   */
  endStep(operationId, step, metadata = {}) {
    if (stryMutAct_9fa48("97203")) {
      {}
    } else {
      stryCov_9fa48("97203");
      const key = stryMutAct_9fa48("97204") ? `` : (stryCov_9fa48("97204"), `${operationId}:${step}`);
      const timing = this.operationTimings.get(key);
      if (stryMutAct_9fa48("97206") ? false : stryMutAct_9fa48("97205") ? true : (stryCov_9fa48("97205", "97206"), timing)) {
        if (stryMutAct_9fa48("97207")) {
          {}
        } else {
          stryCov_9fa48("97207");
          const elapsed = stryMutAct_9fa48("97208") ? Date.now() + timing.startedAt : (stryCov_9fa48("97208"), Date.now() - timing.startedAt);
          this.logger.debug(LOG_MSG.STEP_COMPLETED, stryMutAct_9fa48("97209") ? {} : (stryCov_9fa48("97209"), {
            operationId,
            step,
            elapsedMs: elapsed,
            ...metadata
          }));
          this.operationTimings.delete(key);
        }
      }
    }
  }

  /**
   * Log operation timeout with all collected timings.
   * @param {string} operationId - Operation ID.
   * @param {Object} metadata - Additional metadata.
   */
  logTimeout(operationId, metadata = {}) {
    if (stryMutAct_9fa48("97210")) {
      {}
    } else {
      stryCov_9fa48("97210");
      const pendingSteps = stryMutAct_9fa48("97211") ? ["Stryker was here"] : (stryCov_9fa48("97211"), []);
      const prefix = stryMutAct_9fa48("97212") ? `` : (stryCov_9fa48("97212"), `${operationId}:`);
      for (const [key, timing] of this.operationTimings) {
        if (stryMutAct_9fa48("97213")) {
          {}
        } else {
          stryCov_9fa48("97213");
          if (stryMutAct_9fa48("97216") ? key.endsWith(prefix) : stryMutAct_9fa48("97215") ? false : stryMutAct_9fa48("97214") ? true : (stryCov_9fa48("97214", "97215", "97216"), key.startsWith(prefix))) {
            if (stryMutAct_9fa48("97217")) {
              {}
            } else {
              stryCov_9fa48("97217");
              pendingSteps.push(stryMutAct_9fa48("97218") ? {} : (stryCov_9fa48("97218"), {
                step: timing.step,
                elapsedMs: stryMutAct_9fa48("97219") ? Date.now() + timing.startedAt : (stryCov_9fa48("97219"), Date.now() - timing.startedAt)
              }));
            }
          }
        }
      }
      this.logger.error(LOG_MSG.OPERATION_TIMEOUT, stryMutAct_9fa48("97220") ? {} : (stryCov_9fa48("97220"), {
        operationId,
        pendingSteps,
        ...metadata
      }));
    }
  }
}
export { ServicesP1DiagnosticLogger, LOG_MSG, SUBSYSTEM };