/**
 * Lightweight metrics collector for meta-service command execution.
 * Tracks command counts, latencies, and error rates in-memory.
 * Requirements: 8.5, 13.4
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
import { NUM } from '../constants/index.js';
const METRIC_TYPE = Object.freeze(stryMutAct_9fa48("763") ? {} : (stryCov_9fa48("763"), {
  COMMAND_COUNT: stryMutAct_9fa48("764") ? "" : (stryCov_9fa48("764"), 'commandCount'),
  COMMAND_LATENCY_MS: stryMutAct_9fa48("765") ? "" : (stryCov_9fa48("765"), 'commandLatencyMs'),
  COMMAND_ERROR: stryMutAct_9fa48("766") ? "" : (stryCov_9fa48("766"), 'commandError'),
  OPERATION_DURATION_MS: stryMutAct_9fa48("767") ? "" : (stryCov_9fa48("767"), 'operationDurationMs')
}));

/**
 * In-memory metrics collector for meta-service commands.
 */
class CommandMetrics {
  constructor() {
    if (stryMutAct_9fa48("768")) {
      {}
    } else {
      stryCov_9fa48("768");
      /** @type {Map<string, number>} */
      this._counts = new Map();
      /** @type {Map<string, number>} */
      this._latencies = new Map();
      /** @type {Map<string, number>} */
      this._errors = new Map();
      /** @type {Map<string, number>} */
      this._operationDurations = new Map();
    }
  }

  /**
   * Record a command execution.
   * @param {string} action - The command action name.
   * @param {number} latencyMs - Execution latency in milliseconds.
   * @param {boolean} success - Whether the command succeeded.
   */
  recordCommand(action, latencyMs, success) {
    if (stryMutAct_9fa48("769")) {
      {}
    } else {
      stryCov_9fa48("769");
      const prevCount = stryMutAct_9fa48("770") ? this._counts.get(action) && NUM.ZERO : (stryCov_9fa48("770"), this._counts.get(action) ?? NUM.ZERO);
      this._counts.set(action, stryMutAct_9fa48("771") ? prevCount - NUM.ONE : (stryCov_9fa48("771"), prevCount + NUM.ONE));
      const prevLatency = stryMutAct_9fa48("772") ? this._latencies.get(action) && NUM.ZERO : (stryCov_9fa48("772"), this._latencies.get(action) ?? NUM.ZERO);
      this._latencies.set(action, stryMutAct_9fa48("773") ? prevLatency - latencyMs : (stryCov_9fa48("773"), prevLatency + latencyMs));
      if (stryMutAct_9fa48("776") ? false : stryMutAct_9fa48("775") ? true : stryMutAct_9fa48("774") ? success : (stryCov_9fa48("774", "775", "776"), !success)) {
        if (stryMutAct_9fa48("777")) {
          {}
        } else {
          stryCov_9fa48("777");
          const prevErrors = stryMutAct_9fa48("778") ? this._errors.get(action) && NUM.ZERO : (stryCov_9fa48("778"), this._errors.get(action) ?? NUM.ZERO);
          this._errors.set(action, stryMutAct_9fa48("779") ? prevErrors - NUM.ONE : (stryCov_9fa48("779"), prevErrors + NUM.ONE));
        }
      }
    }
  }

  /**
   * Record total duration for an operation.
   * @param {string} operationId
   * @param {number} durationMs
   */
  recordOperationDuration(operationId, durationMs) {
    if (stryMutAct_9fa48("780")) {
      {}
    } else {
      stryCov_9fa48("780");
      this._operationDurations.set(operationId, durationMs);
    }
  }

  /**
   * @param {string} action
   * @returns {number}
   */
  getCommandCount(action) {
    if (stryMutAct_9fa48("781")) {
      {}
    } else {
      stryCov_9fa48("781");
      return stryMutAct_9fa48("782") ? this._counts.get(action) && NUM.ZERO : (stryCov_9fa48("782"), this._counts.get(action) ?? NUM.ZERO);
    }
  }

  /**
   * @param {string} action
   * @returns {number}
   */
  getErrorCount(action) {
    if (stryMutAct_9fa48("783")) {
      {}
    } else {
      stryCov_9fa48("783");
      return stryMutAct_9fa48("784") ? this._errors.get(action) && NUM.ZERO : (stryCov_9fa48("784"), this._errors.get(action) ?? NUM.ZERO);
    }
  }

  /** @returns {number} */
  getTotalCommandCount() {
    if (stryMutAct_9fa48("785")) {
      {}
    } else {
      stryCov_9fa48("785");
      let total = NUM.ZERO;
      for (const count of this._counts.values()) {
        if (stryMutAct_9fa48("786")) {
          {}
        } else {
          stryCov_9fa48("786");
          stryMutAct_9fa48("787") ? total -= count : (stryCov_9fa48("787"), total += count);
        }
      }
      return total;
    }
  }

  /** @returns {number} */
  getTotalErrorCount() {
    if (stryMutAct_9fa48("788")) {
      {}
    } else {
      stryCov_9fa48("788");
      let total = NUM.ZERO;
      for (const count of this._errors.values()) {
        if (stryMutAct_9fa48("789")) {
          {}
        } else {
          stryCov_9fa48("789");
          stryMutAct_9fa48("790") ? total -= count : (stryCov_9fa48("790"), total += count);
        }
      }
      return total;
    }
  }

  /**
   * Returns a frozen snapshot of all collected metrics.
   * @returns {Readonly<{commands: Object, operations: Object}>}
   */
  getSnapshot() {
    if (stryMutAct_9fa48("791")) {
      {}
    } else {
      stryCov_9fa48("791");
      const commands = {};
      for (const [action, count] of this._counts) {
        if (stryMutAct_9fa48("792")) {
          {}
        } else {
          stryCov_9fa48("792");
          commands[action] = Object.freeze(stryMutAct_9fa48("793") ? {} : (stryCov_9fa48("793"), {
            count,
            errors: stryMutAct_9fa48("794") ? this._errors.get(action) && NUM.ZERO : (stryCov_9fa48("794"), this._errors.get(action) ?? NUM.ZERO),
            totalLatencyMs: stryMutAct_9fa48("795") ? this._latencies.get(action) && NUM.ZERO : (stryCov_9fa48("795"), this._latencies.get(action) ?? NUM.ZERO)
          }));
        }
      }
      const operations = {};
      for (const [opId, duration] of this._operationDurations) {
        if (stryMutAct_9fa48("796")) {
          {}
        } else {
          stryCov_9fa48("796");
          operations[opId] = duration;
        }
      }
      return Object.freeze(stryMutAct_9fa48("797") ? {} : (stryCov_9fa48("797"), {
        commands: Object.freeze(commands),
        operations: Object.freeze(operations)
      }));
    }
  }

  /** Clear all collected metrics. */
  reset() {
    if (stryMutAct_9fa48("798")) {
      {}
    } else {
      stryCov_9fa48("798");
      this._counts.clear();
      this._latencies.clear();
      this._errors.clear();
      this._operationDurations.clear();
    }
  }
}
export { METRIC_TYPE, CommandMetrics };