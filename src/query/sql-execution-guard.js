/**
 * SQL Execution Guard — fail-fast enforcement for single-engine policy.
 *
 * Prevents configuration of a second SQL execution path or fallback
 * engine. When a statement cannot be planned by SqlCore, returns a
 * descriptive error instead of silently falling back.
 *
 * Requirements: 1.3, 1.4
 */

import {ADAPTER_ERROR_MSG} from './sql-adapter-constants.js';

/**
 * Singleton flag tracking whether SqlCore has been registered.
 * Only one SqlCore instance may exist per process.
 * @type {boolean}
 */
let sqlCoreRegistered = false;

/**
 * Register SqlCore as the single SQL execution engine.
 *
 * Requirement 1.3: Reject configuration that enables a second
 * SQL execution path or fallback engine.
 *
 * @param {Object} sqlCore - The SQLQueryEngine instance.
 * @throws {Error} If a second SqlCore is registered.
 */
function registerSqlCore(_sqlCore) {
  if (sqlCoreRegistered) {
    throw new Error(ADAPTER_ERROR_MSG.SECOND_ENGINE_REJECTED);
  }
  sqlCoreRegistered = true;
}

/**
 * Check whether SqlCore has been registered.
 * @return {boolean} True if registered.
 */
function isSqlCoreRegistered() {
  return sqlCoreRegistered;
}

/**
 * Reset the guard (for testing only).
 * @private
 */
function resetSqlCoreGuard() {
  sqlCoreRegistered = false;
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
  throw new Error(
    `${ADAPTER_ERROR_MSG.FALLBACK_EXECUTION_REJECTED}: ${reason}`,
  );
}

export {
  registerSqlCore,
  isSqlCoreRegistered,
  resetSqlCoreGuard,
  rejectFallbackExecution,
};
