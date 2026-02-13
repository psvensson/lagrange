/**
 * Delegation from sys-admin-meta to sys-wasm-meta for
 * WASM ownership areas. Thin adapter that checks whether
 * an action belongs to WASM_DELEGATION_ACTIONS and, if so,
 * routes it through the meta-service router.
 *
 * Requirements: 1.3, 11.1
 * @module admin/admin-meta-delegator
 */

import {META_SERVICE_ID} from '../constants/index.js';
import {WASM_DELEGATION_ACTIONS} from './admin-meta-command-handlers.js';
import {routeToMetaService} from '../wasm-service/meta-service-router.js';

const ADMIN_DELEGATOR_ERROR_CODE = Object.freeze({
  NOT_DELEGATABLE: 'NOT_DELEGATABLE',
});

const ADMIN_DELEGATOR_ERROR_MSG = Object.freeze({
  NOT_DELEGATABLE:
    'Action is not delegatable to sys-wasm-meta',
});

/**
 * Returns true if the action should be delegated to
 * sys-wasm-meta.
 *
 * @param {string} action - The action name to check.
 * @return {boolean} True when action is in
 *   WASM_DELEGATION_ACTIONS.
 */
function isDelegatable(action) {
  return WASM_DELEGATION_ACTIONS.has(action);
}

/**
 * Delegate an action to sys-wasm-meta if it belongs to
 * the WASM delegation set. Returns routing info on success
 * or a structured error otherwise.
 *
 * @param {Object} systemTableCache - System table cache.
 * @param {string} action - The command action name.
 * @param {Object} payload - The command payload.
 * @return {{success: boolean, leaderAddress?: string,
 *   serviceId?: string, command?: string, payload?: Object,
 *   error?: string, code?: string}} Routing or error result.
 */
function delegateToWasmMeta(systemTableCache, action, payload) {
  if (!isDelegatable(action)) {
    return {
      success: false,
      error: ADMIN_DELEGATOR_ERROR_MSG.NOT_DELEGATABLE,
      code: ADMIN_DELEGATOR_ERROR_CODE.NOT_DELEGATABLE,
    };
  }
  return routeToMetaService(
    systemTableCache,
    META_SERVICE_ID.WASM_META,
    action,
    payload,
  );
}

export {
  ADMIN_DELEGATOR_ERROR_CODE,
  ADMIN_DELEGATOR_ERROR_MSG,
  isDelegatable,
  delegateToWasmMeta,
};
