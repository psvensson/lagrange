/**
 * InternalSqlAdapter — adapter for in-process SQL calls.
 *
 * Wraps the existing SQLQueryEngine (SqlCore) behind the canonical
 * SqlRequest contract so that every internal caller goes through
 * the same single execution path.
 *
 * Requirements: 1.1, 1.2
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
import { LoggingService } from '../logging/logging-service.js';
import { createSqlRequest } from './sql-request.js';
import { EXECUTION_MODE, ADAPTER_SUBSYSTEM, ADAPTER_ERROR_MSG, ADAPTER_LOG_MSG, DEFAULT_TENANT_ID, DEFAULT_SESSION_ID } from './sql-adapter-constants.js';

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
    if (stryMutAct_9fa48("113183")) {
      {}
    } else {
      stryCov_9fa48("113183");
      if (stryMutAct_9fa48("113186") ? false : stryMutAct_9fa48("113185") ? true : stryMutAct_9fa48("113184") ? options.sqlCore : (stryCov_9fa48("113184", "113185", "113186"), !options.sqlCore)) {
        if (stryMutAct_9fa48("113187")) {
          {}
        } else {
          stryCov_9fa48("113187");
          throw new Error(ADAPTER_ERROR_MSG.SQL_CORE_REQUIRED);
        }
      }
      this.sqlCore = options.sqlCore;
      this.logger = this.initLogger();
    }
  }

  /**
   * Initialize logger.
   * @return {Object} Logger instance.
   * @private
   */
  initLogger() {
    if (stryMutAct_9fa48("113188")) {
      {}
    } else {
      stryCov_9fa48("113188");
      try {
        if (stryMutAct_9fa48("113189")) {
          {}
        } else {
          stryCov_9fa48("113189");
          const loggingService = LoggingService.getInstance();
          if (stryMutAct_9fa48("113191") ? false : stryMutAct_9fa48("113190") ? true : (stryCov_9fa48("113190", "113191"), loggingService.isInitialized())) {
            if (stryMutAct_9fa48("113192")) {
              {}
            } else {
              stryCov_9fa48("113192");
              return loggingService.forSubsystem(ADAPTER_SUBSYSTEM.INTERNAL);
            }
          }
        }
      } catch {
        // Logging not available
      }
      return console;
    }
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
  async execute(sql, params = stryMutAct_9fa48("113193") ? ["Stryker was here"] : (stryCov_9fa48("113193"), []), options = {}) {
    if (stryMutAct_9fa48("113194")) {
      {}
    } else {
      stryCov_9fa48("113194");
      const request = createSqlRequest(stryMutAct_9fa48("113195") ? {} : (stryCov_9fa48("113195"), {
        statement: sql,
        parameters: params,
        tenantId: stryMutAct_9fa48("113196") ? options.tenantId && DEFAULT_TENANT_ID : (stryCov_9fa48("113196"), options.tenantId ?? DEFAULT_TENANT_ID),
        sessionId: stryMutAct_9fa48("113197") ? options.sessionId && DEFAULT_SESSION_ID : (stryCov_9fa48("113197"), options.sessionId ?? DEFAULT_SESSION_ID),
        executionMode: EXECUTION_MODE.SQL_STATEMENT,
        budgets: options.budgets,
        hints: options.hints
      }));
      this.logger.debug(ADAPTER_LOG_MSG.EXECUTING_VIA_SQLCORE, stryMutAct_9fa48("113198") ? {} : (stryCov_9fa48("113198"), {
        sessionId: request.sessionId,
        executionMode: request.executionMode
      }));
      return await this.sqlCore.executeRequest(request);
    }
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
  buildRequest(sql, params = stryMutAct_9fa48("113199") ? ["Stryker was here"] : (stryCov_9fa48("113199"), []), options = {}) {
    if (stryMutAct_9fa48("113200")) {
      {}
    } else {
      stryCov_9fa48("113200");
      return createSqlRequest(stryMutAct_9fa48("113201") ? {} : (stryCov_9fa48("113201"), {
        statement: sql,
        parameters: params,
        tenantId: stryMutAct_9fa48("113202") ? options.tenantId && DEFAULT_TENANT_ID : (stryCov_9fa48("113202"), options.tenantId ?? DEFAULT_TENANT_ID),
        sessionId: stryMutAct_9fa48("113203") ? options.sessionId && DEFAULT_SESSION_ID : (stryCov_9fa48("113203"), options.sessionId ?? DEFAULT_SESSION_ID),
        executionMode: EXECUTION_MODE.SQL_STATEMENT,
        budgets: options.budgets,
        hints: options.hints
      }));
    }
  }
}
export { InternalSqlAdapter };