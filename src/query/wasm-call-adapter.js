/**
 * WasmCallAdapter — adapter for DB.call(select, fn) execution.
 *
 * Normalizes programmatic distributed SQL calls from WASM services
 * into canonical SqlRequest objects with PARTITION_CALLBACK execution
 * mode and delegates to SqlCore.
 *
 * Requirements: 1.1, 4.1, 4.2
 */

import {LoggingService} from '../logging/logging-service.js';
import {createSqlRequest} from './sql-request.js';
import {
  EXECUTION_MODE,
  ADAPTER_SUBSYSTEM,
  ADAPTER_ERROR_MSG,
  ADAPTER_LOG_MSG,
  DEFAULT_TENANT_ID,
  DEFAULT_SESSION_ID,
  CALLBACK_RUNTIME_KIND,
} from './sql-adapter-constants.js';

/**
 * WasmCallAdapter translates DB.call(select, fn, options?) into
 * a canonical SqlRequest with executionMode = PARTITION_CALLBACK
 * and delegates to SqlCore.
 */
class WasmCallAdapter {
  /**
   * @param {Object} options
   * @param {Object} options.sqlCore - SQLQueryEngine instance (SqlCore).
   */
  constructor(options = {}) {
    if (!options.sqlCore) {
      throw new Error(ADAPTER_ERROR_MSG.SQL_CORE_REQUIRED);
    }
    this.sqlCore = options.sqlCore;
    this.logger = this.initLogger();
  }

  /**
   * Initialize logger.
   * @return {Object} Logger instance.
   * @private
   */
  initLogger() {
    try {
      const loggingService = LoggingService.getInstance();
      if (loggingService.isInitialized()) {
        return loggingService.forSubsystem(ADAPTER_SUBSYSTEM.WASM_CALL);
      }
    } catch {
      // Logging not available
    }
    return console;
  }

  /**
   * Execute DB.call(select, fn, options?).
   *
   * Builds a SqlRequest with PARTITION_CALLBACK mode so SqlCore
   * knows to run `fn` on every partition selected by `select`.
   *
   * Requirement 4.1: DB.call(select, fn, options?) runs fn on
   * all partitions selected by select.
   * Requirement 4.2: fn receives a context with local SQL access
   * and distributed movement primitives.
   *
   * @param {string} selectSql - SELECT statement that identifies
   *   target partitions.
   * @param {Object} callbackRef - Callback function reference.
   * @param {string} callbackRef.moduleRef - Module reference ID.
   * @param {string} callbackRef.exportName - Export function name.
   * @param {Object} [options] - Execution options.
   * @param {string} [options.tenantId] - Tenant identifier.
   * @param {string} [options.sessionId] - Session identifier.
   * @param {unknown[]} [options.parameters] - Bind parameters.
   * @param {Object} [options.budgets] - Budget overrides.
   * @param {Object} [options.hints] - Planner hint overrides.
   * @return {Promise<Object>} Query result from SqlCore.
   */
  async call(selectSql, callbackRef, options = {}) {
    if (!selectSql || typeof selectSql !== 'string') {
      throw new Error(ADAPTER_ERROR_MSG.SELECT_STATEMENT_REQUIRED);
    }
    if (!callbackRef ||
        !callbackRef.moduleRef ||
        !callbackRef.exportName) {
      throw new Error(ADAPTER_ERROR_MSG.CALLBACK_FN_REQUIRED);
    }

    const request = createSqlRequest({
      statement: selectSql,
      parameters: options.parameters ?? [],
      tenantId: options.tenantId ?? DEFAULT_TENANT_ID,
      sessionId: options.sessionId ?? DEFAULT_SESSION_ID,
      executionMode: EXECUTION_MODE.PARTITION_CALLBACK,
      callbackModuleRef: callbackRef.moduleRef,
      callbackExport: callbackRef.exportName,
      runtimeKind: CALLBACK_RUNTIME_KIND.WASM_COMPONENT,
      budgets: options.budgets,
      hints: options.hints,
    });

    this.logger.debug(ADAPTER_LOG_MSG.WASM_CALL_DELEGATED, {
      sessionId: request.sessionId,
      callbackModuleRef: request.callbackModuleRef,
      callbackExport: request.callbackExport,
    });

    return await this.sqlCore.executeRequest(request);
  }

  /**
   * Build a SqlRequest for DB.call without executing it.
   * Useful for inspection, logging, or forwarding.
   *
   * @param {string} selectSql - SELECT statement.
   * @param {Object} callbackRef - Callback function reference.
   * @param {string} callbackRef.moduleRef - Module reference ID.
   * @param {string} callbackRef.exportName - Export function name.
   * @param {Object} [options] - Options (same as call).
   * @return {Readonly<Object>} Frozen SqlRequest.
   */
  buildRequest(selectSql, callbackRef, options = {}) {
    if (!selectSql || typeof selectSql !== 'string') {
      throw new Error(ADAPTER_ERROR_MSG.SELECT_STATEMENT_REQUIRED);
    }
    if (!callbackRef ||
        !callbackRef.moduleRef ||
        !callbackRef.exportName) {
      throw new Error(ADAPTER_ERROR_MSG.CALLBACK_FN_REQUIRED);
    }

    return createSqlRequest({
      statement: selectSql,
      parameters: options.parameters ?? [],
      tenantId: options.tenantId ?? DEFAULT_TENANT_ID,
      sessionId: options.sessionId ?? DEFAULT_SESSION_ID,
      executionMode: EXECUTION_MODE.PARTITION_CALLBACK,
      callbackModuleRef: callbackRef.moduleRef,
      callbackExport: callbackRef.exportName,
      runtimeKind: CALLBACK_RUNTIME_KIND.WASM_COMPONENT,
      budgets: options.budgets,
      hints: options.hints,
    });
  }
}

export {WasmCallAdapter};
