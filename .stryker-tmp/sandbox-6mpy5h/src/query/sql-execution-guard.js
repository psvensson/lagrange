/**
 * SQL Execution Guard — fail-fast enforcement for single-engine policy.
 *
 * Prevents configuration of a second SQL execution path or fallback
 * engine. When a statement cannot be planned by SqlCore, returns a
 * descriptive error instead of silently falling back.
 *
 * Requirements: 1.3, 1.4
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
import { ADAPTER_ERROR_MSG } from './sql-adapter-constants.js';

/**
 * Singleton flag tracking whether SqlCore has been registered.
 * Only one SqlCore instance may exist per process.
 * @type {boolean}
 */
let sqlCoreRegistered = stryMutAct_9fa48("118867") ? true : (stryCov_9fa48("118867"), false);

/**
 * Register SqlCore as the single SQL execution engine.
 *
 * Requirement 1.3: Reject configuration that enables a second
 * SQL execution path or fallback engine.
 *
 * @param {Object} sqlCore - The SQLQueryEngine instance.
 * @throws {Error} If a second SqlCore is registered.
 */
function registerSqlCore(sqlCore) {
  if (stryMutAct_9fa48("118868")) {
    {}
  } else {
    stryCov_9fa48("118868");
    if (stryMutAct_9fa48("118870") ? false : stryMutAct_9fa48("118869") ? true : (stryCov_9fa48("118869", "118870"), sqlCoreRegistered)) {
      if (stryMutAct_9fa48("118871")) {
        {}
      } else {
        stryCov_9fa48("118871");
        throw new Error(ADAPTER_ERROR_MSG.SECOND_ENGINE_REJECTED);
      }
    }
    sqlCoreRegistered = stryMutAct_9fa48("118872") ? false : (stryCov_9fa48("118872"), true);
  }
}

/**
 * Check whether SqlCore has been registered.
 * @return {boolean} True if registered.
 */
function isSqlCoreRegistered() {
  if (stryMutAct_9fa48("118873")) {
    {}
  } else {
    stryCov_9fa48("118873");
    return sqlCoreRegistered;
  }
}

/**
 * Reset the guard (for testing only).
 * @private
 */
function resetSqlCoreGuard() {
  if (stryMutAct_9fa48("118874")) {
    {}
  } else {
    stryCov_9fa48("118874");
    sqlCoreRegistered = stryMutAct_9fa48("118875") ? true : (stryCov_9fa48("118875"), false);
  }
}

/**
 * Fail-fast wrapper that rejects fallback execution attempts.
 *
 * Requirement 1.4: When a statement cannot be planned by SqlCore,
 * return a descriptive error instead of silently falling back to
 * alternate execution.
 *
 * @param {string} reason - Description of why fallback was attempted.
 * @throws {Error} Always throws with a descriptive message.
 */
function rejectFallbackExecution(reason) {
  if (stryMutAct_9fa48("118876")) {
    {}
  } else {
    stryCov_9fa48("118876");
    throw new Error(stryMutAct_9fa48("118877") ? `` : (stryCov_9fa48("118877"), `${ADAPTER_ERROR_MSG.FALLBACK_EXECUTION_REJECTED}: ${reason}`));
  }
}
export { registerSqlCore, isSqlCoreRegistered, resetSqlCoreGuard, rejectFallbackExecution };