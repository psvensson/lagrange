/**
 * BudgetLimitError — typed error for query budget violations.
 *
 * Thrown when any per-query resource budget is exceeded.
 * Carries structured context so callers can identify which
 * budget was violated, the configured limit, and actual usage.
 *
 * Requirements: 9.1, 9.4
 * @module query/budget-limit-error
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
import { BaseError } from '../utils/base-error.js';

/**
 * Budget category identifiers for error context.
 * @enum {string}
 */
const BUDGET_CATEGORY = Object.freeze(stryMutAct_9fa48("108983") ? {} : (stryCov_9fa48("108983"), {
  CPU_TIME: stryMutAct_9fa48("108984") ? "" : (stryCov_9fa48("108984"), 'cpuTime'),
  MEMORY: stryMutAct_9fa48("108985") ? "" : (stryCov_9fa48("108985"), 'memory'),
  WALL_TIME: stryMutAct_9fa48("108986") ? "" : (stryCov_9fa48("108986"), 'wallTime'),
  LOOKUP_KEYS: stryMutAct_9fa48("108987") ? "" : (stryCov_9fa48("108987"), 'lookupKeys'),
  LOOKUP_BYTES: stryMutAct_9fa48("108988") ? "" : (stryCov_9fa48("108988"), 'lookupBytes'),
  EMIT_BYTES: stryMutAct_9fa48("108989") ? "" : (stryCov_9fa48("108989"), 'emitBytes'),
  BROADCAST_BYTES: stryMutAct_9fa48("108990") ? "" : (stryCov_9fa48("108990"), 'broadcastBytes'),
  OUT_BYTES: stryMutAct_9fa48("108991") ? "" : (stryCov_9fa48("108991"), 'outBytes'),
  NESTED_CALLS: stryMutAct_9fa48("108992") ? "" : (stryCov_9fa48("108992"), 'nestedCalls'),
  NESTED_KEYS: stryMutAct_9fa48("108993") ? "" : (stryCov_9fa48("108993"), 'nestedKeys'),
  NESTED_BYTES: stryMutAct_9fa48("108994") ? "" : (stryCov_9fa48("108994"), 'nestedBytes'),
  INFLIGHT: stryMutAct_9fa48("108995") ? "" : (stryCov_9fa48("108995"), 'inflight')
}));

/**
 * Typed error thrown when a query budget limit is exceeded.
 *
 * Requirement 9.4: IF any budget is exceeded, THEN THE System
 * SHALL terminate the operation and return a descriptive limit
 * error.
 *
 * @extends BaseError
 */
class BudgetLimitError extends BaseError {
  /**
   * @param {string} message - Human-readable error message.
   * @param {Object} options - Error options.
   * @param {string} options.category - Budget category from
   *   BUDGET_CATEGORY enum.
   * @param {number} options.limit - Configured budget limit.
   * @param {number} options.usage - Actual usage that exceeded
   *   the limit.
   */
  constructor(message, options = {}) {
    if (stryMutAct_9fa48("108996")) {
      {}
    } else {
      stryCov_9fa48("108996");
      super(message, stryMutAct_9fa48("108997") ? {} : (stryCov_9fa48("108997"), {
        context: stryMutAct_9fa48("108998") ? {} : (stryCov_9fa48("108998"), {
          component: stryMutAct_9fa48("108999") ? "" : (stryCov_9fa48("108999"), 'BudgetEnforcer'),
          operation: stryMutAct_9fa48("109000") ? "" : (stryCov_9fa48("109000"), 'budgetCheck'),
          metadata: stryMutAct_9fa48("109001") ? {} : (stryCov_9fa48("109001"), {
            category: options.category,
            limit: options.limit,
            usage: options.usage
          })
        })
      }));

      /** @type {string} */
      this.category = options.category;

      /** @type {number} */
      this.limit = options.limit;

      /** @type {number} */
      this.usage = options.usage;
    }
  }
}
export { BudgetLimitError, BUDGET_CATEGORY };