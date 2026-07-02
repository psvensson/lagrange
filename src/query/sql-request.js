/**
 * Canonical SqlRequest model.
 *
 * Every SQL entrypoint (internal API, PostgreSQL wire protocol,
 * WASM DB.call) normalizes into this immutable request object
 * before delegation to SqlCore (SQLQueryEngine).
 */

import {DEFAULT_QUERY_BUDGET} from '../wasm-service/query-budget-constants.js';
import {
  EXECUTION_MODE,
  DEFAULT_TENANT_ID,
  DEFAULT_SESSION_ID,
  ADAPTER_ERROR_MSG,
} from './sql-adapter-constants.js';

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
  if (!fields.statement) {
    throw new Error(ADAPTER_ERROR_MSG.STATEMENT_REQUIRED);
  }
  if (typeof fields.statement !== 'string') {
    throw new Error(ADAPTER_ERROR_MSG.STATEMENT_MUST_BE_STRING);
  }

  const params = fields.parameters ?? [];
  if (!Array.isArray(params)) {
    throw new Error(ADAPTER_ERROR_MSG.PARAMETERS_MUST_BE_ARRAY);
  }

  const mode = fields.executionMode ?? EXECUTION_MODE.SQL_STATEMENT;

  if (mode === EXECUTION_MODE.PARTITION_CALLBACK) {
    if (!fields.callbackModuleRef) {
      throw new Error(ADAPTER_ERROR_MSG.CALLBACK_MODULE_REF_REQUIRED);
    }
    if (!fields.callbackExport) {
      throw new Error(ADAPTER_ERROR_MSG.CALLBACK_EXPORT_REQUIRED);
    }
    if (!fields.runtimeKind ||
        typeof fields.runtimeKind !== 'string') {
      throw new Error(
        ADAPTER_ERROR_MSG.PARTITION_CALLBACK_RUNTIME_KIND_REQUIRED,
      );
    }
  }

  const request = {
    tenantId: fields.tenantId ?? DEFAULT_TENANT_ID,
    sessionId: fields.sessionId ?? DEFAULT_SESSION_ID,
    statement: fields.statement,
    parameters: params,
    executionMode: mode,
    callbackModuleRef: fields.callbackModuleRef ?? null,
    callbackExport: fields.callbackExport ?? null,
    runtimeKind: fields.runtimeKind ?? null,
    budgets: Object.freeze({...DEFAULT_QUERY_BUDGET, ...fields.budgets}),
    hints: fields.hints ? Object.freeze({...fields.hints}) : null,
    dialect: fields.dialect ?? null,
  };

  return Object.freeze(request);
}

/**
 * Check whether an object looks like a valid SqlRequest.
 * @param {*} obj - Value to check.
 * @return {boolean} True when obj has the required SqlRequest shape.
 */
function isSqlRequest(obj) {
  if (!obj || typeof obj !== 'object') return false;
  if (typeof obj.statement !== 'string') return false;
  if (!Array.isArray(obj.parameters)) return false;
  if (typeof obj.tenantId !== 'string') return false;
  if (typeof obj.sessionId !== 'string') return false;
  if (typeof obj.executionMode !== 'string') return false;
  if (obj.executionMode === EXECUTION_MODE.PARTITION_CALLBACK &&
      typeof obj.runtimeKind !== 'string') {
    return false;
  }
  if (obj.runtimeKind !== undefined &&
      obj.runtimeKind !== null &&
      typeof obj.runtimeKind !== 'string') {
    return false;
  }
  if (obj.dialect !== undefined &&
      obj.dialect !== null &&
      typeof obj.dialect !== 'string') {
    return false;
  }
  return true;
}

export {createSqlRequest, isSqlRequest, EXECUTION_MODE};
