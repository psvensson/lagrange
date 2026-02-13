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

import {
  ADMIN_META_ACTION,
  handleExecuteQuery,
  handleGetCacheDump,
  handleGetNodeStatus,
  handleListServices,
  handleListNodes,
  handleListPartitions,
  handleListLatencyGroups,
  handleListInterGroupLatencies,
} from './admin-meta-command-handlers.js';
import {
  isDelegatable,
  delegateToWasmMeta,
} from './admin-meta-delegator.js';
import {
  guardMutation,
  MUTATION_GUARD_MODE,
} from './admin-mutation-guard.js';

/**
 * Role constant documenting this module's adapter-only contract.
 * @type {string}
 */
const ADAPTER_ROLE = 'compatibility_adapter';

const ADAPTER_ERROR_CODE = Object.freeze({
  UNKNOWN_ACTION: 'UNKNOWN_ACTION',
});

const ADAPTER_ERROR_MSG = Object.freeze({
  UNKNOWN_ACTION: 'Unknown admin action',
});

/**
 * Map of admin-meta actions to their handler functions.
 * @type {Object<string, Function>}
 */
const ACTION_HANDLER_MAP = Object.freeze({
  [ADMIN_META_ACTION.EXECUTE_QUERY]: handleExecuteQuery,
  [ADMIN_META_ACTION.GET_CACHE_DUMP]: handleGetCacheDump,
  [ADMIN_META_ACTION.GET_NODE_STATUS]: handleGetNodeStatus,
  [ADMIN_META_ACTION.LIST_SERVICES]: handleListServices,
  [ADMIN_META_ACTION.LIST_NODES]: handleListNodes,
  [ADMIN_META_ACTION.LIST_PARTITIONS]: handleListPartitions,
  [ADMIN_META_ACTION.LIST_LATENCY_GROUPS]: handleListLatencyGroups,
  [ADMIN_META_ACTION.LIST_INTER_GROUP_LATENCIES]: handleListInterGroupLatencies,
});

/**
 * Adapt a WebSocket query message to the command handler format.
 * This is a pure envelope translation — no SQL execution occurs here.
 *
 * @param {Object} message - {type, queryId, sql, params}.
 * @return {Object} {success, sql, params, queryId} or
 *   {success: false, errors, queryId}.
 */
function adaptQueryMessage(message) {
  const result = handleExecuteQuery({
    sql: message.sql,
    queryParams: message.params,
  });
  return {...result, queryId: message.queryId};
}

/**
 * Adapt a WebSocket refresh message to the command handler format.
 * Returns table names only — no cache reads or writes occur here.
 *
 * @param {Object} _message - {type: 'refresh'}.
 * @return {Object} {success, tables}.
 */
function adaptRefreshMessage(_message) {
  return handleGetCacheDump();
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
  if (isDelegatable(action)) {
    return delegateToWasmMeta(systemTableCache, action, params);
  }
  const handler = ACTION_HANDLER_MAP[action];
  if (handler) {
    return handler(params);
  }
  return {
    success: false,
    error: ADAPTER_ERROR_MSG.UNKNOWN_ACTION,
    code: ADAPTER_ERROR_CODE.UNKNOWN_ACTION,
  };
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
function guardedAdaptAdminAction(
  action, params, systemTableCache, guardMode,
) {
  const guardResult = guardMutation(action, guardMode);
  if (!guardResult.allowed) {
    return {
      success: false,
      error: guardResult.error,
      code: guardResult.code,
    };
  }
  const result = adaptAdminAction(
    action, params, systemTableCache,
  );
  if (guardResult.warning) {
    return {...result, warning: guardResult.warning};
  }
  return result;
}

export {
  ADAPTER_ROLE,
  ADAPTER_ERROR_CODE,
  ADAPTER_ERROR_MSG,
  adaptQueryMessage,
  adaptRefreshMessage,
  adaptAdminAction,
  guardedAdaptAdminAction,
};
