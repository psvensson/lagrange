/**
 * Deprecation warning utilities for direct node-local mutation paths.
 * Emits warnings when legacy admin handlers or direct cache writes
 * are invoked instead of meta-service command handlers.
 *
 * Requirements: 11.4, 13.3
 * @module admin/admin-deprecation
 */

import {ADMIN_META_ACTION} from './admin-meta-command-handlers.js';
import {WASM_META_ACTION} from '../constants/index.js';

const DEPRECATION_WARNING = Object.freeze({
  DIRECT_MUTATION: 'Direct node-local mutation is deprecated.' +
    ' Use sys-admin-meta or sys-wasm-meta service' +
    ' commands instead.',
  DIRECT_CACHE_WRITE: 'Direct cache writes are deprecated.' +
    ' All mutations must flow through SQL/CDC paths.',
  LEGACY_ADMIN_HANDLER: 'Legacy admin handler is deprecated.' +
    ' Use the adapter layer forwarding to' +
    ' meta-service commands.',
});

const DEPRECATION_ERROR_MSG = Object.freeze({
  WARNING_TYPE_REQUIRED: 'Warning type is required',
});

/**
 * Set of all known non-deprecated action strings.
 * @type {Set<string>}
 */
const KNOWN_ACTIONS = new Set([
  ...Object.values(ADMIN_META_ACTION),
  ...Object.values(WASM_META_ACTION),
]);

/**
 * Build a frozen deprecation notice object.
 *
 * @param {string} warningType - One of DEPRECATION_WARNING values.
 * @param {Object} [context] - Optional context object.
 * @return {Object} Frozen notice or error object.
 */
function buildDeprecationNotice(warningType, context) {
  if (!warningType) {
    return {
      success: false,
      error: DEPRECATION_ERROR_MSG.WARNING_TYPE_REQUIRED,
    };
  }
  return Object.freeze({
    deprecated: true,
    warning: warningType,
    context: context ?? null,
    timestamp: Date.now(),
  });
}

/**
 * Check whether an action represents a deprecated direct
 * mutation path (i.e. not a known meta-service action).
 *
 * @param {string} action - The action string to check.
 * @return {boolean} True if the action is deprecated.
 */
function isDeprecatedPath(action) {
  return !KNOWN_ACTIONS.has(action);
}

export {
  DEPRECATION_WARNING,
  DEPRECATION_ERROR_MSG,
  buildDeprecationNotice,
  isDeprecatedPath,
};
