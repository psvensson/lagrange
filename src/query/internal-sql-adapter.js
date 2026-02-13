/**
 * InternalSqlAdapter — adapter for in-process SQL calls.
 *
 * Wraps the existing SQLQueryEngine (SqlCore) behind the canonical
 * SqlRequest contract so that every internal caller goes through
 * the same single execution path.
 *
 * Requirements: 1.1, 1.2
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
} from './sql-adapter-constants.js';

/**
 * InternalSqlAdapter normalizes in-process SQL calls into
 * canonical SqlRequest objects and delegates to SqlCore.
 */
class InternalSqlAdapter {
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
        return loggingService.forSubsystem(ADAPTER_SUBSYSTEM.INTERNAL);
      }
    } catch {
      // Logging not available
    }
    return console;
  }

  /**
   * Execute a SQL statement through the unified SqlCore path.
   *
   * @param {string} sql - SQL statement text.
   * @param {unknown[]} [params] - Bind parameters.
   * @param {Object} [options] - Execution options.
   * @param {string} [options.sessionId] - Session identifier.
   * @param {string} [options.tenantId] - Tenant identifier.
   * @param {Object} [options.budgets] - Budget overrides.
   * @param {Object} [options.hints] - Planner hint overrides.
   * @return {Promise<Object>} Query result from SqlCore.
   */
  async execute(sql, params = [], options = {}) {
    const request = createSqlRequest({
      statement: sql,
      parameters: params,
      tenantId: options.tenantId ?? DEFAULT_TENANT_ID,
      sessionId: options.sessionId ?? DEFAULT_SESSION_ID,
      executionMode: EXECUTION_MODE.SQL_STATEMENT,
      budgets: options.budgets,
      hints: options.hints,
    });

    this.logger.debug(ADAPTER_LOG_MSG.EXECUTING_VIA_SQLCORE, {
      sessionId: request.sessionId,
      executionMode: request.executionMode,
    });

    return await this.sqlCore.executeRequest(request);
  }

  /**
   * Build a SqlRequest without executing it.
   * Useful for inspection, logging, or forwarding.
   *
   * @param {string} sql - SQL statement text.
   * @param {unknown[]} [params] - Bind parameters.
   * @param {Object} [options] - Options (same as execute).
   * @return {Readonly<Object>} Frozen SqlRequest.
   */
  buildRequest(sql, params = [], options = {}) {
    return createSqlRequest({
      statement: sql,
      parameters: params,
      tenantId: options.tenantId ?? DEFAULT_TENANT_ID,
      sessionId: options.sessionId ?? DEFAULT_SESSION_ID,
      executionMode: EXECUTION_MODE.SQL_STATEMENT,
      budgets: options.budgets,
      hints: options.hints,
    });
  }
}

export {InternalSqlAdapter};
