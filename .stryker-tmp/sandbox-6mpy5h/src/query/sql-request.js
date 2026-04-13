/**
 * Canonical SqlRequest model.
 *
 * Every SQL entrypoint (internal API, PostgreSQL wire protocol,
 * WASM DB.call) normalizes into this immutable request object
 * before delegation to SqlCore (SQLQueryEngine).
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
import { NUM, TYPEOF } from '../constants/index.js';
import { DEFAULT_QUERY_BUDGET } from '../wasm-service/query-budget-constants.js';
import { EXECUTION_MODE, DEFAULT_TENANT_ID, DEFAULT_SESSION_ID, ADAPTER_ERROR_MSG } from './sql-adapter-constants.js';

/**
 * Create a canonical SqlRequest object.
 *
 * @param {Object} fields - Request fields.
 * @param {string} fields.statement - SQL statement text.
 * @param {unknown[]} [fields.parameters] - Bind parameters.
 * @param {string} [fields.tenantId] - Tenant identifier.
 * @param {string} [fields.sessionId] - Session identifier.
 * @param {string} [fields.executionMode] - EXECUTION_MODE value.
 * @param {string} [fields.callbackModuleRef] - Module ref for callbacks.
 * @param {string} [fields.callbackExport] - Export name for callbacks.
 * @param {Object} [fields.budgets] - QueryBudget overrides.
 * @param {Object} [fields.hints] - PlannerHints overrides.
 * @param {string|null} [fields.dialect] - Parser dialect hint.
 * @return {Readonly<Object>} Frozen SqlRequest.
 * @throws {Error} If required fields are missing or invalid.
 */
function createSqlRequest(fields) {
  if (stryMutAct_9fa48("124954")) {
    {}
  } else {
    stryCov_9fa48("124954");
    if (stryMutAct_9fa48("124957") ? false : stryMutAct_9fa48("124956") ? true : stryMutAct_9fa48("124955") ? fields.statement : (stryCov_9fa48("124955", "124956", "124957"), !fields.statement)) {
      if (stryMutAct_9fa48("124958")) {
        {}
      } else {
        stryCov_9fa48("124958");
        throw new Error(ADAPTER_ERROR_MSG.STATEMENT_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("124961") ? typeof fields.statement === TYPEOF.STRING : stryMutAct_9fa48("124960") ? false : stryMutAct_9fa48("124959") ? true : (stryCov_9fa48("124959", "124960", "124961"), typeof fields.statement !== TYPEOF.STRING)) {
      if (stryMutAct_9fa48("124962")) {
        {}
      } else {
        stryCov_9fa48("124962");
        throw new Error(ADAPTER_ERROR_MSG.STATEMENT_MUST_BE_STRING);
      }
    }
    const params = stryMutAct_9fa48("124963") ? fields.parameters && [] : (stryCov_9fa48("124963"), fields.parameters ?? (stryMutAct_9fa48("124964") ? ["Stryker was here"] : (stryCov_9fa48("124964"), [])));
    if (stryMutAct_9fa48("124967") ? false : stryMutAct_9fa48("124966") ? true : stryMutAct_9fa48("124965") ? Array.isArray(params) : (stryCov_9fa48("124965", "124966", "124967"), !Array.isArray(params))) {
      if (stryMutAct_9fa48("124968")) {
        {}
      } else {
        stryCov_9fa48("124968");
        throw new Error(ADAPTER_ERROR_MSG.PARAMETERS_MUST_BE_ARRAY);
      }
    }
    const mode = stryMutAct_9fa48("124969") ? fields.executionMode && EXECUTION_MODE.SQL_STATEMENT : (stryCov_9fa48("124969"), fields.executionMode ?? EXECUTION_MODE.SQL_STATEMENT);
    if (stryMutAct_9fa48("124972") ? mode !== EXECUTION_MODE.PARTITION_CALLBACK : stryMutAct_9fa48("124971") ? false : stryMutAct_9fa48("124970") ? true : (stryCov_9fa48("124970", "124971", "124972"), mode === EXECUTION_MODE.PARTITION_CALLBACK)) {
      if (stryMutAct_9fa48("124973")) {
        {}
      } else {
        stryCov_9fa48("124973");
        if (stryMutAct_9fa48("124976") ? false : stryMutAct_9fa48("124975") ? true : stryMutAct_9fa48("124974") ? fields.callbackModuleRef : (stryCov_9fa48("124974", "124975", "124976"), !fields.callbackModuleRef)) {
          if (stryMutAct_9fa48("124977")) {
            {}
          } else {
            stryCov_9fa48("124977");
            throw new Error(ADAPTER_ERROR_MSG.CALLBACK_MODULE_REF_REQUIRED);
          }
        }
        if (stryMutAct_9fa48("124980") ? false : stryMutAct_9fa48("124979") ? true : stryMutAct_9fa48("124978") ? fields.callbackExport : (stryCov_9fa48("124978", "124979", "124980"), !fields.callbackExport)) {
          if (stryMutAct_9fa48("124981")) {
            {}
          } else {
            stryCov_9fa48("124981");
            throw new Error(ADAPTER_ERROR_MSG.CALLBACK_EXPORT_REQUIRED);
          }
        }
        if (stryMutAct_9fa48("124984") ? !fields.runtimeKind && typeof fields.runtimeKind !== TYPEOF.STRING : stryMutAct_9fa48("124983") ? false : stryMutAct_9fa48("124982") ? true : (stryCov_9fa48("124982", "124983", "124984"), (stryMutAct_9fa48("124985") ? fields.runtimeKind : (stryCov_9fa48("124985"), !fields.runtimeKind)) || (stryMutAct_9fa48("124987") ? typeof fields.runtimeKind === TYPEOF.STRING : stryMutAct_9fa48("124986") ? false : (stryCov_9fa48("124986", "124987"), typeof fields.runtimeKind !== TYPEOF.STRING)))) {
          if (stryMutAct_9fa48("124988")) {
            {}
          } else {
            stryCov_9fa48("124988");
            throw new Error(ADAPTER_ERROR_MSG.PARTITION_CALLBACK_RUNTIME_KIND_REQUIRED);
          }
        }
      }
    }
    const request = stryMutAct_9fa48("124989") ? {} : (stryCov_9fa48("124989"), {
      tenantId: stryMutAct_9fa48("124990") ? fields.tenantId && DEFAULT_TENANT_ID : (stryCov_9fa48("124990"), fields.tenantId ?? DEFAULT_TENANT_ID),
      sessionId: stryMutAct_9fa48("124991") ? fields.sessionId && DEFAULT_SESSION_ID : (stryCov_9fa48("124991"), fields.sessionId ?? DEFAULT_SESSION_ID),
      statement: fields.statement,
      parameters: params,
      executionMode: mode,
      callbackModuleRef: stryMutAct_9fa48("124992") ? fields.callbackModuleRef && null : (stryCov_9fa48("124992"), fields.callbackModuleRef ?? null),
      callbackExport: stryMutAct_9fa48("124993") ? fields.callbackExport && null : (stryCov_9fa48("124993"), fields.callbackExport ?? null),
      runtimeKind: stryMutAct_9fa48("124994") ? fields.runtimeKind && null : (stryCov_9fa48("124994"), fields.runtimeKind ?? null),
      budgets: Object.freeze(stryMutAct_9fa48("124995") ? {} : (stryCov_9fa48("124995"), {
        ...DEFAULT_QUERY_BUDGET,
        ...fields.budgets
      })),
      hints: fields.hints ? Object.freeze(stryMutAct_9fa48("124996") ? {} : (stryCov_9fa48("124996"), {
        ...fields.hints
      })) : null,
      dialect: stryMutAct_9fa48("124997") ? fields.dialect && null : (stryCov_9fa48("124997"), fields.dialect ?? null)
    });
    return Object.freeze(request);
  }
}

/**
 * Check whether an object looks like a valid SqlRequest.
 * @param {*} obj - Value to check.
 * @return {boolean} True when obj has the required SqlRequest shape.
 */
function isSqlRequest(obj) {
  if (stryMutAct_9fa48("124998")) {
    {}
  } else {
    stryCov_9fa48("124998");
    if (stryMutAct_9fa48("125001") ? !obj && typeof obj !== TYPEOF.OBJECT : stryMutAct_9fa48("125000") ? false : stryMutAct_9fa48("124999") ? true : (stryCov_9fa48("124999", "125000", "125001"), (stryMutAct_9fa48("125002") ? obj : (stryCov_9fa48("125002"), !obj)) || (stryMutAct_9fa48("125004") ? typeof obj === TYPEOF.OBJECT : stryMutAct_9fa48("125003") ? false : (stryCov_9fa48("125003", "125004"), typeof obj !== TYPEOF.OBJECT)))) return stryMutAct_9fa48("125005") ? true : (stryCov_9fa48("125005"), false);
    if (stryMutAct_9fa48("125008") ? typeof obj.statement === TYPEOF.STRING : stryMutAct_9fa48("125007") ? false : stryMutAct_9fa48("125006") ? true : (stryCov_9fa48("125006", "125007", "125008"), typeof obj.statement !== TYPEOF.STRING)) return stryMutAct_9fa48("125009") ? true : (stryCov_9fa48("125009"), false);
    if (stryMutAct_9fa48("125012") ? false : stryMutAct_9fa48("125011") ? true : stryMutAct_9fa48("125010") ? Array.isArray(obj.parameters) : (stryCov_9fa48("125010", "125011", "125012"), !Array.isArray(obj.parameters))) return stryMutAct_9fa48("125013") ? true : (stryCov_9fa48("125013"), false);
    if (stryMutAct_9fa48("125016") ? typeof obj.tenantId === TYPEOF.STRING : stryMutAct_9fa48("125015") ? false : stryMutAct_9fa48("125014") ? true : (stryCov_9fa48("125014", "125015", "125016"), typeof obj.tenantId !== TYPEOF.STRING)) return stryMutAct_9fa48("125017") ? true : (stryCov_9fa48("125017"), false);
    if (stryMutAct_9fa48("125020") ? typeof obj.sessionId === TYPEOF.STRING : stryMutAct_9fa48("125019") ? false : stryMutAct_9fa48("125018") ? true : (stryCov_9fa48("125018", "125019", "125020"), typeof obj.sessionId !== TYPEOF.STRING)) return stryMutAct_9fa48("125021") ? true : (stryCov_9fa48("125021"), false);
    if (stryMutAct_9fa48("125024") ? typeof obj.executionMode === TYPEOF.STRING : stryMutAct_9fa48("125023") ? false : stryMutAct_9fa48("125022") ? true : (stryCov_9fa48("125022", "125023", "125024"), typeof obj.executionMode !== TYPEOF.STRING)) return stryMutAct_9fa48("125025") ? true : (stryCov_9fa48("125025"), false);
    if (stryMutAct_9fa48("125028") ? obj.executionMode === EXECUTION_MODE.PARTITION_CALLBACK || typeof obj.runtimeKind !== TYPEOF.STRING : stryMutAct_9fa48("125027") ? false : stryMutAct_9fa48("125026") ? true : (stryCov_9fa48("125026", "125027", "125028"), (stryMutAct_9fa48("125030") ? obj.executionMode !== EXECUTION_MODE.PARTITION_CALLBACK : stryMutAct_9fa48("125029") ? true : (stryCov_9fa48("125029", "125030"), obj.executionMode === EXECUTION_MODE.PARTITION_CALLBACK)) && (stryMutAct_9fa48("125032") ? typeof obj.runtimeKind === TYPEOF.STRING : stryMutAct_9fa48("125031") ? true : (stryCov_9fa48("125031", "125032"), typeof obj.runtimeKind !== TYPEOF.STRING)))) {
      if (stryMutAct_9fa48("125033")) {
        {}
      } else {
        stryCov_9fa48("125033");
        return stryMutAct_9fa48("125034") ? true : (stryCov_9fa48("125034"), false);
      }
    }
    if (stryMutAct_9fa48("125037") ? obj.runtimeKind !== undefined && obj.runtimeKind !== null || typeof obj.runtimeKind !== TYPEOF.STRING : stryMutAct_9fa48("125036") ? false : stryMutAct_9fa48("125035") ? true : (stryCov_9fa48("125035", "125036", "125037"), (stryMutAct_9fa48("125039") ? obj.runtimeKind !== undefined || obj.runtimeKind !== null : stryMutAct_9fa48("125038") ? true : (stryCov_9fa48("125038", "125039"), (stryMutAct_9fa48("125041") ? obj.runtimeKind === undefined : stryMutAct_9fa48("125040") ? true : (stryCov_9fa48("125040", "125041"), obj.runtimeKind !== undefined)) && (stryMutAct_9fa48("125043") ? obj.runtimeKind === null : stryMutAct_9fa48("125042") ? true : (stryCov_9fa48("125042", "125043"), obj.runtimeKind !== null)))) && (stryMutAct_9fa48("125045") ? typeof obj.runtimeKind === TYPEOF.STRING : stryMutAct_9fa48("125044") ? true : (stryCov_9fa48("125044", "125045"), typeof obj.runtimeKind !== TYPEOF.STRING)))) {
      if (stryMutAct_9fa48("125046")) {
        {}
      } else {
        stryCov_9fa48("125046");
        return stryMutAct_9fa48("125047") ? true : (stryCov_9fa48("125047"), false);
      }
    }
    if (stryMutAct_9fa48("125050") ? obj.dialect !== undefined && obj.dialect !== null || typeof obj.dialect !== TYPEOF.STRING : stryMutAct_9fa48("125049") ? false : stryMutAct_9fa48("125048") ? true : (stryCov_9fa48("125048", "125049", "125050"), (stryMutAct_9fa48("125052") ? obj.dialect !== undefined || obj.dialect !== null : stryMutAct_9fa48("125051") ? true : (stryCov_9fa48("125051", "125052"), (stryMutAct_9fa48("125054") ? obj.dialect === undefined : stryMutAct_9fa48("125053") ? true : (stryCov_9fa48("125053", "125054"), obj.dialect !== undefined)) && (stryMutAct_9fa48("125056") ? obj.dialect === null : stryMutAct_9fa48("125055") ? true : (stryCov_9fa48("125055", "125056"), obj.dialect !== null)))) && (stryMutAct_9fa48("125058") ? typeof obj.dialect === TYPEOF.STRING : stryMutAct_9fa48("125057") ? true : (stryCov_9fa48("125057", "125058"), typeof obj.dialect !== TYPEOF.STRING)))) {
      if (stryMutAct_9fa48("125059")) {
        {}
      } else {
        stryCov_9fa48("125059");
        return stryMutAct_9fa48("125060") ? true : (stryCov_9fa48("125060"), false);
      }
    }
    return stryMutAct_9fa48("125061") ? false : (stryCov_9fa48("125061"), true);
  }
}
export { createSqlRequest, isSqlRequest, EXECUTION_MODE };