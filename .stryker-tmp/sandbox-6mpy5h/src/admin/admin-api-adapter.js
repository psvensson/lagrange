/**
 * Node-local admin API compatibility adapter.
 *
 * This module is a THIN ROUTING ADAPTER ONLY. It translates
 * between the WebSocket message format used by CLI clients and
 * the service-owned command handlers in sys-admin-meta /
 * sys-wasm-meta. It performs three responsibilities:
 *
 *   1. Validate protocol envelopes (message shape / required fields).
 *   2. Route to the appropriate meta-service command handler.
 *   3. Return responses in the existing CLI-compatible envelope.
 *
 * This adapter MUST NOT:
 *   - Execute SQL directly against partitions.
 *   - Write system metadata or mutate system state.
 *   - Maintain its own caches or derived state.
 *   - Introduce alternative mutation paths.
 *
 * All mutations flow through SQL/CDC via the meta-service
 * command handlers. See architecture.md §Admin Serviceization.
 *
 * Requirements: 2.4, 13.2
 * @module admin/admin-api-adapter
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
import { ADMIN_META_ACTION, handleExecuteQuery, handleGetCacheDump, handleGetNodeStatus, handleListServices, handleListNodes, handleListPartitions, handleListLatencyGroups, handleListInterGroupLatencies } from './admin-meta-command-handlers.js';
import { isDelegatable, delegateToWasmMeta } from './admin-meta-delegator.js';
import { guardMutation, MUTATION_GUARD_MODE } from './admin-mutation-guard.js';

/**
 * Role constant documenting this module's adapter-only contract.
 * @type {string}
 */
const ADAPTER_ROLE = stryMutAct_9fa48("206") ? "" : (stryCov_9fa48("206"), 'compatibility_adapter');
const ADAPTER_ERROR_CODE = Object.freeze(stryMutAct_9fa48("207") ? {} : (stryCov_9fa48("207"), {
  UNKNOWN_ACTION: stryMutAct_9fa48("208") ? "" : (stryCov_9fa48("208"), 'UNKNOWN_ACTION')
}));
const ADAPTER_ERROR_MSG = Object.freeze(stryMutAct_9fa48("209") ? {} : (stryCov_9fa48("209"), {
  UNKNOWN_ACTION: stryMutAct_9fa48("210") ? "" : (stryCov_9fa48("210"), 'Unknown admin action')
}));

/**
 * Map of admin-meta actions to their handler functions.
 * @type {Object<string, Function>}
 */
const ACTION_HANDLER_MAP = Object.freeze(stryMutAct_9fa48("211") ? {} : (stryCov_9fa48("211"), {
  [ADMIN_META_ACTION.EXECUTE_QUERY]: handleExecuteQuery,
  [ADMIN_META_ACTION.GET_CACHE_DUMP]: handleGetCacheDump,
  [ADMIN_META_ACTION.GET_NODE_STATUS]: handleGetNodeStatus,
  [ADMIN_META_ACTION.LIST_SERVICES]: handleListServices,
  [ADMIN_META_ACTION.LIST_NODES]: handleListNodes,
  [ADMIN_META_ACTION.LIST_PARTITIONS]: handleListPartitions,
  [ADMIN_META_ACTION.LIST_LATENCY_GROUPS]: handleListLatencyGroups,
  [ADMIN_META_ACTION.LIST_INTER_GROUP_LATENCIES]: handleListInterGroupLatencies
}));

/**
 * Adapt a WebSocket query message to the command handler format.
 * This is a pure envelope translation — no SQL execution occurs here.
 *
 * @param {Object} message - {type, queryId, sql, params}.
 * @return {Object} {success, sql, params, queryId} or
 *   {success: false, errors, queryId}.
 */
function adaptQueryMessage(message) {
  if (stryMutAct_9fa48("212")) {
    {}
  } else {
    stryCov_9fa48("212");
    const result = handleExecuteQuery(stryMutAct_9fa48("213") ? {} : (stryCov_9fa48("213"), {
      sql: message.sql,
      queryParams: message.params
    }));
    return stryMutAct_9fa48("214") ? {} : (stryCov_9fa48("214"), {
      ...result,
      queryId: message.queryId
    });
  }
}

/**
 * Adapt a WebSocket refresh message to the command handler format.
 * Returns table names only — no cache reads or writes occur here.
 *
 * @param {Object} _message - {type: 'refresh'}.
 * @return {Object} {success, tables}.
 */
function adaptRefreshMessage(_message) {
  if (stryMutAct_9fa48("215")) {
    {}
  } else {
    stryCov_9fa48("215");
    return handleGetCacheDump();
  }
}

/**
 * Dispatch an admin action to the appropriate handler.
 * Delegates to sys-wasm-meta for WASM ownership actions,
 * otherwise dispatches to admin-meta command handlers.
 *
 * This function is the adapter's routing core. It never
 * executes SQL, writes metadata, or mutates system state.
 * All mutation ownership resides in the meta-service handlers.
 *
 * @param {string} action - The action name.
 * @param {Object} params - Action parameters.
 * @param {Object} systemTableCache - System table cache.
 * @return {Object} Handler result or error.
 */
function adaptAdminAction(action, params, systemTableCache) {
  if (stryMutAct_9fa48("216")) {
    {}
  } else {
    stryCov_9fa48("216");
    if (stryMutAct_9fa48("218") ? false : stryMutAct_9fa48("217") ? true : (stryCov_9fa48("217", "218"), isDelegatable(action))) {
      if (stryMutAct_9fa48("219")) {
        {}
      } else {
        stryCov_9fa48("219");
        return delegateToWasmMeta(systemTableCache, action, params);
      }
    }
    const handler = ACTION_HANDLER_MAP[action];
    if (stryMutAct_9fa48("221") ? false : stryMutAct_9fa48("220") ? true : (stryCov_9fa48("220", "221"), handler)) {
      if (stryMutAct_9fa48("222")) {
        {}
      } else {
        stryCov_9fa48("222");
        return handler(params);
      }
    }
    return stryMutAct_9fa48("223") ? {} : (stryCov_9fa48("223"), {
      success: stryMutAct_9fa48("224") ? true : (stryCov_9fa48("224"), false),
      error: ADAPTER_ERROR_MSG.UNKNOWN_ACTION,
      code: ADAPTER_ERROR_CODE.UNKNOWN_ACTION
    });
  }
}

/**
 * Guard-aware adapter dispatch. Runs the mutation guard
 * before routing the action. In reject mode, deprecated
 * bypass paths are blocked with a typed error. In warn
 * mode, a deprecation warning is attached but the action
 * proceeds.
 *
 * Requirements: 2.5, 6.3, 13.5
 *
 * @param {string} action - The action name.
 * @param {Object} params - Action parameters.
 * @param {Object} systemTableCache - System table cache.
 * @param {string} guardMode - MUTATION_GUARD_MODE value.
 * @return {Object} Handler result, possibly with warning,
 *   or guard rejection error.
 */
function guardedAdaptAdminAction(action, params, systemTableCache, guardMode) {
  if (stryMutAct_9fa48("225")) {
    {}
  } else {
    stryCov_9fa48("225");
    const guardResult = guardMutation(action, guardMode);
    if (stryMutAct_9fa48("228") ? false : stryMutAct_9fa48("227") ? true : stryMutAct_9fa48("226") ? guardResult.allowed : (stryCov_9fa48("226", "227", "228"), !guardResult.allowed)) {
      if (stryMutAct_9fa48("229")) {
        {}
      } else {
        stryCov_9fa48("229");
        return stryMutAct_9fa48("230") ? {} : (stryCov_9fa48("230"), {
          success: stryMutAct_9fa48("231") ? true : (stryCov_9fa48("231"), false),
          error: guardResult.error,
          code: guardResult.code
        });
      }
    }
    const result = adaptAdminAction(action, params, systemTableCache);
    if (stryMutAct_9fa48("233") ? false : stryMutAct_9fa48("232") ? true : (stryCov_9fa48("232", "233"), guardResult.warning)) {
      if (stryMutAct_9fa48("234")) {
        {}
      } else {
        stryCov_9fa48("234");
        return stryMutAct_9fa48("235") ? {} : (stryCov_9fa48("235"), {
          ...result,
          warning: guardResult.warning
        });
      }
    }
    return result;
  }
}
export { ADAPTER_ROLE, ADAPTER_ERROR_CODE, ADAPTER_ERROR_MSG, adaptQueryMessage, adaptRefreshMessage, adaptAdminAction, guardedAdaptAdminAction };