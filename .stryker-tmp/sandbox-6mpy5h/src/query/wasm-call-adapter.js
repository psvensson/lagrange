/**
 * WasmCallAdapter — adapter for DB.call(select, fn) execution.
 *
 * Normalizes programmatic distributed SQL calls from WASM services
 * into canonical SqlRequest objects with PARTITION_CALLBACK execution
 * mode and delegates to SqlCore.
 *
 * Requirements: 1.1, 4.1, 4.2
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
import { TYPEOF } from '../constants/index.js';
import { LoggingService } from '../logging/logging-service.js';
import { createSqlRequest } from './sql-request.js';
import { EXECUTION_MODE, ADAPTER_SUBSYSTEM, ADAPTER_ERROR_MSG, ADAPTER_LOG_MSG, DEFAULT_TENANT_ID, DEFAULT_SESSION_ID, CALLBACK_RUNTIME_KIND } from './sql-adapter-constants.js';

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
    if (stryMutAct_9fa48("126400")) {
      {}
    } else {
      stryCov_9fa48("126400");
      if (stryMutAct_9fa48("126403") ? false : stryMutAct_9fa48("126402") ? true : stryMutAct_9fa48("126401") ? options.sqlCore : (stryCov_9fa48("126401", "126402", "126403"), !options.sqlCore)) {
        if (stryMutAct_9fa48("126404")) {
          {}
        } else {
          stryCov_9fa48("126404");
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
    if (stryMutAct_9fa48("126405")) {
      {}
    } else {
      stryCov_9fa48("126405");
      try {
        if (stryMutAct_9fa48("126406")) {
          {}
        } else {
          stryCov_9fa48("126406");
          const loggingService = LoggingService.getInstance();
          if (stryMutAct_9fa48("126408") ? false : stryMutAct_9fa48("126407") ? true : (stryCov_9fa48("126407", "126408"), loggingService.isInitialized())) {
            if (stryMutAct_9fa48("126409")) {
              {}
            } else {
              stryCov_9fa48("126409");
              return loggingService.forSubsystem(ADAPTER_SUBSYSTEM.WASM_CALL);
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
    if (stryMutAct_9fa48("126410")) {
      {}
    } else {
      stryCov_9fa48("126410");
      if (stryMutAct_9fa48("126413") ? !selectSql && typeof selectSql !== TYPEOF.STRING : stryMutAct_9fa48("126412") ? false : stryMutAct_9fa48("126411") ? true : (stryCov_9fa48("126411", "126412", "126413"), (stryMutAct_9fa48("126414") ? selectSql : (stryCov_9fa48("126414"), !selectSql)) || (stryMutAct_9fa48("126416") ? typeof selectSql === TYPEOF.STRING : stryMutAct_9fa48("126415") ? false : (stryCov_9fa48("126415", "126416"), typeof selectSql !== TYPEOF.STRING)))) {
        if (stryMutAct_9fa48("126417")) {
          {}
        } else {
          stryCov_9fa48("126417");
          throw new Error(ADAPTER_ERROR_MSG.SELECT_STATEMENT_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("126420") ? (!callbackRef || !callbackRef.moduleRef) && !callbackRef.exportName : stryMutAct_9fa48("126419") ? false : stryMutAct_9fa48("126418") ? true : (stryCov_9fa48("126418", "126419", "126420"), (stryMutAct_9fa48("126422") ? !callbackRef && !callbackRef.moduleRef : stryMutAct_9fa48("126421") ? false : (stryCov_9fa48("126421", "126422"), (stryMutAct_9fa48("126423") ? callbackRef : (stryCov_9fa48("126423"), !callbackRef)) || (stryMutAct_9fa48("126424") ? callbackRef.moduleRef : (stryCov_9fa48("126424"), !callbackRef.moduleRef)))) || (stryMutAct_9fa48("126425") ? callbackRef.exportName : (stryCov_9fa48("126425"), !callbackRef.exportName)))) {
        if (stryMutAct_9fa48("126426")) {
          {}
        } else {
          stryCov_9fa48("126426");
          throw new Error(ADAPTER_ERROR_MSG.CALLBACK_FN_REQUIRED);
        }
      }
      const request = createSqlRequest(stryMutAct_9fa48("126427") ? {} : (stryCov_9fa48("126427"), {
        statement: selectSql,
        parameters: stryMutAct_9fa48("126428") ? options.parameters && [] : (stryCov_9fa48("126428"), options.parameters ?? (stryMutAct_9fa48("126429") ? ["Stryker was here"] : (stryCov_9fa48("126429"), []))),
        tenantId: stryMutAct_9fa48("126430") ? options.tenantId && DEFAULT_TENANT_ID : (stryCov_9fa48("126430"), options.tenantId ?? DEFAULT_TENANT_ID),
        sessionId: stryMutAct_9fa48("126431") ? options.sessionId && DEFAULT_SESSION_ID : (stryCov_9fa48("126431"), options.sessionId ?? DEFAULT_SESSION_ID),
        executionMode: EXECUTION_MODE.PARTITION_CALLBACK,
        callbackModuleRef: callbackRef.moduleRef,
        callbackExport: callbackRef.exportName,
        runtimeKind: CALLBACK_RUNTIME_KIND.WASM_COMPONENT,
        budgets: options.budgets,
        hints: options.hints
      }));
      this.logger.debug(ADAPTER_LOG_MSG.WASM_CALL_DELEGATED, stryMutAct_9fa48("126432") ? {} : (stryCov_9fa48("126432"), {
        sessionId: request.sessionId,
        callbackModuleRef: request.callbackModuleRef,
        callbackExport: request.callbackExport
      }));
      return await this.sqlCore.executeRequest(request);
    }
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
    if (stryMutAct_9fa48("126433")) {
      {}
    } else {
      stryCov_9fa48("126433");
      if (stryMutAct_9fa48("126436") ? !selectSql && typeof selectSql !== TYPEOF.STRING : stryMutAct_9fa48("126435") ? false : stryMutAct_9fa48("126434") ? true : (stryCov_9fa48("126434", "126435", "126436"), (stryMutAct_9fa48("126437") ? selectSql : (stryCov_9fa48("126437"), !selectSql)) || (stryMutAct_9fa48("126439") ? typeof selectSql === TYPEOF.STRING : stryMutAct_9fa48("126438") ? false : (stryCov_9fa48("126438", "126439"), typeof selectSql !== TYPEOF.STRING)))) {
        if (stryMutAct_9fa48("126440")) {
          {}
        } else {
          stryCov_9fa48("126440");
          throw new Error(ADAPTER_ERROR_MSG.SELECT_STATEMENT_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("126443") ? (!callbackRef || !callbackRef.moduleRef) && !callbackRef.exportName : stryMutAct_9fa48("126442") ? false : stryMutAct_9fa48("126441") ? true : (stryCov_9fa48("126441", "126442", "126443"), (stryMutAct_9fa48("126445") ? !callbackRef && !callbackRef.moduleRef : stryMutAct_9fa48("126444") ? false : (stryCov_9fa48("126444", "126445"), (stryMutAct_9fa48("126446") ? callbackRef : (stryCov_9fa48("126446"), !callbackRef)) || (stryMutAct_9fa48("126447") ? callbackRef.moduleRef : (stryCov_9fa48("126447"), !callbackRef.moduleRef)))) || (stryMutAct_9fa48("126448") ? callbackRef.exportName : (stryCov_9fa48("126448"), !callbackRef.exportName)))) {
        if (stryMutAct_9fa48("126449")) {
          {}
        } else {
          stryCov_9fa48("126449");
          throw new Error(ADAPTER_ERROR_MSG.CALLBACK_FN_REQUIRED);
        }
      }
      return createSqlRequest(stryMutAct_9fa48("126450") ? {} : (stryCov_9fa48("126450"), {
        statement: selectSql,
        parameters: stryMutAct_9fa48("126451") ? options.parameters && [] : (stryCov_9fa48("126451"), options.parameters ?? (stryMutAct_9fa48("126452") ? ["Stryker was here"] : (stryCov_9fa48("126452"), []))),
        tenantId: stryMutAct_9fa48("126453") ? options.tenantId && DEFAULT_TENANT_ID : (stryCov_9fa48("126453"), options.tenantId ?? DEFAULT_TENANT_ID),
        sessionId: stryMutAct_9fa48("126454") ? options.sessionId && DEFAULT_SESSION_ID : (stryCov_9fa48("126454"), options.sessionId ?? DEFAULT_SESSION_ID),
        executionMode: EXECUTION_MODE.PARTITION_CALLBACK,
        callbackModuleRef: callbackRef.moduleRef,
        callbackExport: callbackRef.exportName,
        runtimeKind: CALLBACK_RUNTIME_KIND.WASM_COMPONENT,
        budgets: options.budgets,
        hints: options.hints
      }));
    }
  }
}
export { WasmCallAdapter };