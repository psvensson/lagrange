/**
 * Deprecation warning utilities for direct node-local mutation paths.
 * Emits warnings when legacy admin handlers or direct cache writes
 * are invoked instead of meta-service command handlers.
 *
 * Requirements: 11.4, 13.3
 * @module admin/admin-deprecation
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
import { ADMIN_META_ACTION } from './admin-meta-command-handlers.js';
import { WASM_META_ACTION } from '../constants/index.js';
const DEPRECATION_WARNING = Object.freeze(stryMutAct_9fa48("3890") ? {} : (stryCov_9fa48("3890"), {
  DIRECT_MUTATION: (stryMutAct_9fa48("3891") ? "" : (stryCov_9fa48("3891"), 'Direct node-local mutation is deprecated.')) + (stryMutAct_9fa48("3892") ? "" : (stryCov_9fa48("3892"), ' Use sys-admin-meta or sys-wasm-meta service')) + (stryMutAct_9fa48("3893") ? "" : (stryCov_9fa48("3893"), ' commands instead.')),
  DIRECT_CACHE_WRITE: (stryMutAct_9fa48("3894") ? "" : (stryCov_9fa48("3894"), 'Direct cache writes are deprecated.')) + (stryMutAct_9fa48("3895") ? "" : (stryCov_9fa48("3895"), ' All mutations must flow through SQL/CDC paths.')),
  LEGACY_ADMIN_HANDLER: (stryMutAct_9fa48("3896") ? "" : (stryCov_9fa48("3896"), 'Legacy admin handler is deprecated.')) + (stryMutAct_9fa48("3897") ? "" : (stryCov_9fa48("3897"), ' Use the adapter layer forwarding to')) + (stryMutAct_9fa48("3898") ? "" : (stryCov_9fa48("3898"), ' meta-service commands.'))
}));
const DEPRECATION_ERROR_MSG = Object.freeze(stryMutAct_9fa48("3899") ? {} : (stryCov_9fa48("3899"), {
  WARNING_TYPE_REQUIRED: stryMutAct_9fa48("3900") ? "" : (stryCov_9fa48("3900"), 'Warning type is required')
}));

/**
 * Set of all known non-deprecated action strings.
 * @type {Set<string>}
 */
const KNOWN_ACTIONS = new Set(stryMutAct_9fa48("3901") ? [] : (stryCov_9fa48("3901"), [...Object.values(ADMIN_META_ACTION), ...Object.values(WASM_META_ACTION)]));

/**
 * Build a frozen deprecation notice object.
 *
 * @param {string} warningType - One of DEPRECATION_WARNING values.
 * @param {Object} [context] - Optional context object.
 * @return {Object} Frozen notice or error object.
 */
function buildDeprecationNotice(warningType, context) {
  if (stryMutAct_9fa48("3902")) {
    {}
  } else {
    stryCov_9fa48("3902");
    if (stryMutAct_9fa48("3905") ? false : stryMutAct_9fa48("3904") ? true : stryMutAct_9fa48("3903") ? warningType : (stryCov_9fa48("3903", "3904", "3905"), !warningType)) {
      if (stryMutAct_9fa48("3906")) {
        {}
      } else {
        stryCov_9fa48("3906");
        return stryMutAct_9fa48("3907") ? {} : (stryCov_9fa48("3907"), {
          success: stryMutAct_9fa48("3908") ? true : (stryCov_9fa48("3908"), false),
          error: DEPRECATION_ERROR_MSG.WARNING_TYPE_REQUIRED
        });
      }
    }
    return Object.freeze(stryMutAct_9fa48("3909") ? {} : (stryCov_9fa48("3909"), {
      deprecated: stryMutAct_9fa48("3910") ? false : (stryCov_9fa48("3910"), true),
      warning: warningType,
      context: stryMutAct_9fa48("3911") ? context && null : (stryCov_9fa48("3911"), context ?? null),
      timestamp: Date.now()
    }));
  }
}

/**
 * Check whether an action represents a deprecated direct
 * mutation path (i.e. not a known meta-service action).
 *
 * @param {string} action - The action string to check.
 * @return {boolean} True if the action is deprecated.
 */
function isDeprecatedPath(action) {
  if (stryMutAct_9fa48("3912")) {
    {}
  } else {
    stryCov_9fa48("3912");
    return stryMutAct_9fa48("3913") ? KNOWN_ACTIONS.has(action) : (stryCov_9fa48("3913"), !KNOWN_ACTIONS.has(action));
  }
}
export { DEPRECATION_WARNING, DEPRECATION_ERROR_MSG, buildDeprecationNotice, isDeprecatedPath };