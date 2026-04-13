/**
 * Delegation from sys-admin-meta to sys-wasm-meta for
 * WASM ownership areas. Thin adapter that checks whether
 * an action belongs to WASM_DELEGATION_ACTIONS and, if so,
 * routes it through the meta-service router.
 *
 * Requirements: 1.3, 11.1
 * @module admin/admin-meta-delegator
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
import { META_SERVICE_ID } from '../constants/index.js';
import { WASM_DELEGATION_ACTIONS } from './admin-meta-command-handlers.js';
import { routeToMetaService } from '../wasm-service/meta-service-router.js';
const ADMIN_DELEGATOR_ERROR_CODE = Object.freeze(stryMutAct_9fa48("4183") ? {} : (stryCov_9fa48("4183"), {
  NOT_DELEGATABLE: stryMutAct_9fa48("4184") ? "" : (stryCov_9fa48("4184"), 'NOT_DELEGATABLE')
}));
const ADMIN_DELEGATOR_ERROR_MSG = Object.freeze(stryMutAct_9fa48("4185") ? {} : (stryCov_9fa48("4185"), {
  NOT_DELEGATABLE: stryMutAct_9fa48("4186") ? "" : (stryCov_9fa48("4186"), 'Action is not delegatable to sys-wasm-meta')
}));

/**
 * Returns true if the action should be delegated to
 * sys-wasm-meta.
 *
 * @param {string} action - The action name to check.
 * @return {boolean} True when action is in
 *   WASM_DELEGATION_ACTIONS.
 */
function isDelegatable(action) {
  if (stryMutAct_9fa48("4187")) {
    {}
  } else {
    stryCov_9fa48("4187");
    return WASM_DELEGATION_ACTIONS.has(action);
  }
}

/**
 * Delegate an action to sys-wasm-meta if it belongs to
 * the WASM delegation set. Returns routing info on success
 * or a structured error otherwise.
 *
 * @param {Object} systemCacheClient - System cache read client.
 * @param {string} action - The command action name.
 * @param {Object} payload - The command payload.
 * @return {{success: boolean, leaderAddress?: string,
 *   serviceId?: string, command?: string, payload?: Object,
 *   error?: string, code?: string}} Routing or error result.
 */
function delegateToWasmMeta(systemCacheClient, action, payload) {
  if (stryMutAct_9fa48("4188")) {
    {}
  } else {
    stryCov_9fa48("4188");
    if (stryMutAct_9fa48("4191") ? false : stryMutAct_9fa48("4190") ? true : stryMutAct_9fa48("4189") ? isDelegatable(action) : (stryCov_9fa48("4189", "4190", "4191"), !isDelegatable(action))) {
      if (stryMutAct_9fa48("4192")) {
        {}
      } else {
        stryCov_9fa48("4192");
        return stryMutAct_9fa48("4193") ? {} : (stryCov_9fa48("4193"), {
          success: stryMutAct_9fa48("4194") ? true : (stryCov_9fa48("4194"), false),
          error: ADMIN_DELEGATOR_ERROR_MSG.NOT_DELEGATABLE,
          code: ADMIN_DELEGATOR_ERROR_CODE.NOT_DELEGATABLE
        });
      }
    }
    return routeToMetaService(systemCacheClient, META_SERVICE_ID.WASM_META, action, payload);
  }
}
export { ADMIN_DELEGATOR_ERROR_CODE, ADMIN_DELEGATOR_ERROR_MSG, isDelegatable, delegateToWasmMeta };