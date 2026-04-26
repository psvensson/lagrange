/**
 * Guard module that enforces the single-path mutation contract.
 * After migration is complete, any attempt to mutate system state
 * through deprecated/bypass paths should hard-fail.
 *
 * Requirements: 1.5, 12.2
 * @module admin/admin-mutation-guard
 */

import {
  isDeprecatedPath,
  DEPRECATION_WARNING,
} from './admin-deprecation.js';

const MUTATION_GUARD_MODE = Object.freeze({
  WARN: 'warn',
  REJECT: 'reject',
});

const MUTATION_GUARD_ERROR_MSG = Object.freeze({
  BYPASS_REJECTED: 'Direct mutation path is rejected.' +
    ' Use meta-service commands.',
  MODE_REQUIRED: 'Guard mode is required',
  ACTION_REQUIRED: 'Action is required',
});

const MUTATION_GUARD_ERROR_CODE = Object.freeze({
  BYPASS_REJECTED: 'BYPASS_REJECTED',
});

/**
 * Valid guard modes for fast lookup.
 * @type {Set<string>}
 */
const VALID_MODES = new Set(
  Object.values(MUTATION_GUARD_MODE),
);

/**
 * Guard a mutation action against deprecated bypass paths.
 *
 * @param {string} action - The action string to guard.
 * @param {string} mode - One of MUTATION_GUARD_MODE values.
 * @return {Object} Guard result with allowed, warning, or error.
 */
function guardMutation(action, mode) {
  if (!action) {
    return {
      allowed: false,
      error: MUTATION_GUARD_ERROR_MSG.ACTION_REQUIRED,
    };
  }
  if (!mode || !VALID_MODES.has(mode)) {
    return {
      allowed: false,
      error: MUTATION_GUARD_ERROR_MSG.MODE_REQUIRED,
    };
  }
  if (!isDeprecatedPath(action)) {
    return {allowed: true};
  }
  if (mode === MUTATION_GUARD_MODE.WARN) {
    return {
      allowed: true,
      warning: DEPRECATION_WARNING.DIRECT_MUTATION,
    };
  }
  return {
    allowed: false,
    error: MUTATION_GUARD_ERROR_MSG.BYPASS_REJECTED,
    code: MUTATION_GUARD_ERROR_CODE.BYPASS_REJECTED,
  };
}

export {
  MUTATION_GUARD_MODE,
  MUTATION_GUARD_ERROR_MSG,
  MUTATION_GUARD_ERROR_CODE,
  guardMutation,
};
