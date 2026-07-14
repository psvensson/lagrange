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

function isCanonicalSecurityContext(context) {
  return typeof context?.tenantId === 'string' &&
    context.tenantId.length > 0 &&
    typeof context?.principal === 'string' &&
    context.principal.length > 0 &&
    Array.isArray(context?.roles) &&
    context.roles.every((role) => typeof role === 'string');
}

function buildSqlRequestSecurityFields(fields) {
  if (fields.securityContext === undefined) {
    return {
      tenantId: fields.tenantId ?? DEFAULT_TENANT_ID,
      requestFields: {},
    };
  }
  if (!isCanonicalSecurityContext(fields.securityContext)) {
    throw new Error(ADAPTER_ERROR_MSG.SECURITY_CONTEXT_INVALID);
  }
  const securityContext = Object.freeze({
    tenantId: fields.securityContext.tenantId,
    principal: fields.securityContext.principal,
    roles: Object.freeze([...fields.securityContext.roles]),
  });
  const tenantId = fields.tenantId ?? securityContext.tenantId;
  if (tenantId !== securityContext.tenantId) {
    throw new Error(ADAPTER_ERROR_MSG.SECURITY_CONTEXT_INVALID);
  }
  return {tenantId, requestFields: {securityContext}};
}

function hasValidSqlRequestSecurityFields(request) {
  if (request.securityContext === undefined) return true;
  return isCanonicalSecurityContext(request.securityContext) &&
    request.tenantId === request.securityContext.tenantId;
}

function validateSqlRequestStatementAndParameters(fields) {
  if (!fields.statement) {
    throw new Error(ADAPTER_ERROR_MSG.STATEMENT_REQUIRED);
  }
  if (typeof fields.statement !== 'string') {
    throw new Error(ADAPTER_ERROR_MSG.STATEMENT_MUST_BE_STRING);
  }
  const parameters = fields.parameters ?? [];
  if (!Array.isArray(parameters)) {
    throw new Error(ADAPTER_ERROR_MSG.PARAMETERS_MUST_BE_ARRAY);
  }
  return parameters;
}

function validatePartitionCallbackRequest(fields, mode) {
  if (mode !== EXECUTION_MODE.PARTITION_CALLBACK) return;
  if (!fields.callbackModuleRef) {
    throw new Error(ADAPTER_ERROR_MSG.CALLBACK_MODULE_REF_REQUIRED);
  }
  if (!fields.callbackExport) {
    throw new Error(ADAPTER_ERROR_MSG.CALLBACK_EXPORT_REQUIRED);
  }
  if (!fields.runtimeKind || typeof fields.runtimeKind !== 'string') {
    throw new Error(
      ADAPTER_ERROR_MSG.PARTITION_CALLBACK_RUNTIME_KIND_REQUIRED,
    );
  }
}

function hasRequiredSqlRequestFields(request) {
  return Boolean(request) && typeof request === 'object' &&
    typeof request.statement === 'string' &&
    Array.isArray(request.parameters) &&
    typeof request.tenantId === 'string' &&
    typeof request.sessionId === 'string' &&
    typeof request.executionMode === 'string';
}

function hasValidSqlRequestRuntimeKind(request) {
  if (request.executionMode === EXECUTION_MODE.PARTITION_CALLBACK &&
      typeof request.runtimeKind !== 'string') return false;
  return request.runtimeKind === undefined || request.runtimeKind === null ||
    typeof request.runtimeKind === 'string';
}

function hasValidSqlRequestDialect(request) {
  return request.dialect === undefined || request.dialect === null ||
    typeof request.dialect === 'string';
}

const SQL_REQUEST_VALIDATORS = Object.freeze([
  hasRequiredSqlRequestFields,
  hasValidSqlRequestRuntimeKind,
  hasValidSqlRequestDialect,
  hasValidSqlRequestSecurityFields,
]);

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
 * @param {Object} [fields.securityContext] - Server-derived protocol context.
 * @return {Readonly<Object>} Frozen SqlRequest.
 * @throws {Error} If required fields are missing or invalid.
 */
function createSqlRequest(fields) {
  const params = validateSqlRequestStatementAndParameters(fields);
  const mode = fields.executionMode ?? EXECUTION_MODE.SQL_STATEMENT;
  const securityFields = buildSqlRequestSecurityFields(fields);
  validatePartitionCallbackRequest(fields, mode);

  const request = {
    tenantId: securityFields.tenantId,
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
    ...(fields.timeoutBudget ? {timeoutBudget: fields.timeoutBudget} : {}),
    ...(fields.cancellationToken ?
      {cancellationToken: fields.cancellationToken} : {}),
    ...securityFields.requestFields,
  };

  return Object.freeze(request);
}

/**
 * Check whether an object looks like a valid SqlRequest.
 * @param {*} obj - Value to check.
 * @return {boolean} True when obj has the required SqlRequest shape.
 */
function isSqlRequest(obj) {
  return SQL_REQUEST_VALIDATORS.every((validator) => validator(obj));
}

export {createSqlRequest, isSqlRequest, EXECUTION_MODE};
