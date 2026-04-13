/**
 * BaseError - Foundation class for custom errors.
 * Provides consistent error properties and behavior across the codebase.
 *
 * Features:
 * - Automatic name property set to constructor name
 * - Support for error chaining via cause parameter
 * - Support for context metadata for debugging
 * - JSON serialization for structured logging
 *
 * @module utils/base-error
 * @see Requirements 4.1, 4.2, 4.3, 4.4, 4.5
 */
// @ts-nocheck


/**
 * @typedef {Object} ErrorContext
 * @property {string} [component] - Component where error occurred
 * @property {string} [operation] - Operation that failed
 * @property {string} [nodeId] - Node ID if applicable
 * @property {Object} [metadata] - Additional error metadata
 */

/**
 * @typedef {Object} BaseErrorOptions
 * @property {Error} [cause] - Underlying cause of the error
 * @property {ErrorContext} [context] - Additional context for debugging
 */

/**
 * BaseError - Foundation class for all custom errors in the codebase.
 * Extends native Error with consistent properties and behavior.
 *
 * @extends Error
 */function stryNS_9fa48() {
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
class BaseError extends Error {
  /**
   * Create a BaseError.
   * @param {string} message - Error message
   * @param {BaseErrorOptions} [options={}] - Error options
   */
  constructor(message, options = {}) {
    if (stryMutAct_9fa48("160168")) {
      {}
    } else {
      stryCov_9fa48("160168");
      super(message, stryMutAct_9fa48("160169") ? {} : (stryCov_9fa48("160169"), {
        cause: options.cause
      }));

      /**
       * Error name - automatically set to constructor name.
       * @type {string}
       */
      this.name = this.constructor.name;

      /**
       * Additional context for debugging.
       * @type {ErrorContext|null}
       */
      this.context = stryMutAct_9fa48("160172") ? options.context && null : stryMutAct_9fa48("160171") ? false : stryMutAct_9fa48("160170") ? true : (stryCov_9fa48("160170", "160171", "160172"), options.context || null);

      // Capture stack trace, excluding constructor call
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert error to JSON for structured logging.
   * @return {Object} JSON representation of the error
   */
  toJSON() {
    if (stryMutAct_9fa48("160173")) {
      {}
    } else {
      stryCov_9fa48("160173");
      return stryMutAct_9fa48("160174") ? {} : (stryCov_9fa48("160174"), {
        name: this.name,
        message: this.message,
        context: this.context,
        cause: stryMutAct_9fa48("160177") ? this.cause?.message && null : stryMutAct_9fa48("160176") ? false : stryMutAct_9fa48("160175") ? true : (stryCov_9fa48("160175", "160176", "160177"), (stryMutAct_9fa48("160178") ? this.cause.message : (stryCov_9fa48("160178"), this.cause?.message)) || null),
        stack: this.stack
      });
    }
  }
}
export { BaseError };