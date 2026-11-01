/**
 * Canonical owner of Call Cell selector parameter schema declaration,
 * SQL placeholder correspondence, and runtime typed parameter vector
 * normalization (Q2: call-selector-typed-parameter-narrowing).
 */

import {Buffer} from 'node:buffer';
import {createHash} from 'node:crypto';
import {types} from 'node:util';

import {SQLParser} from '../query/sql-parser.js';
import {PARSER_DIALECT} from '../query/pg/pg-compat-constants.js';
import {reorderParams, validateParamMapping} from '../query/pg/pg-translate.js';
import {
  CALL_CELL_ROUTE_ERROR_CODE,
  createCallRoutingFailure,
  normalizeCallArguments,
} from './call-cell-routing-contract.js';

const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';
const UTF8_ENCODING = 'utf8';
const AST_TYPE_SELECT = 'SELECT';
const MIN_DOLLAR_INDEX = 1;
const NUMERIC_ZERO = 0;
const SQLITE_BOOL_TRUE = 1;
const SQLITE_BOOL_FALSE = 0;
const BINDING_SOURCE_SUBPATH = Object.freeze({
  PARAMETERS: 'parameters',
  STATEMENT: 'statement',
});

const CALL_SELECTOR_PARAM_TYPE = Object.freeze({
  BOOLEAN: 'boolean',
  INTEGER: 'integer',
  NUMBER: 'number',
  TEXT: 'text',
});

const PARAM_TYPE_ALIAS = Object.freeze({
  boolean: CALL_SELECTOR_PARAM_TYPE.BOOLEAN,
  float64: CALL_SELECTOR_PARAM_TYPE.NUMBER,
  int64: CALL_SELECTOR_PARAM_TYPE.INTEGER,
  integer: CALL_SELECTOR_PARAM_TYPE.INTEGER,
  number: CALL_SELECTOR_PARAM_TYPE.NUMBER,
  string: CALL_SELECTOR_PARAM_TYPE.TEXT,
  text: CALL_SELECTOR_PARAM_TYPE.TEXT,
});

const FORBIDDEN_AUTHORITY_PARAMETER_NAMES = new Set([
  'principal',
  'principalId',
  'principal_id',
  'roles',
  'securityContext',
  'security_context',
  'tenantId',
  'tenant_id',
]);

const SLOT_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/u;
const ALLOWED_SLOT_FIELDS = new Set([
  'allowEmpty',
  'max',
  'maxBytes',
  'maxLength',
  'min',
  'minLength',
  'name',
  'nullable',
  'type',
]);
const NUMERIC_SLOT_TYPES = new Set([
  CALL_SELECTOR_PARAM_TYPE.INTEGER,
  CALL_SELECTOR_PARAM_TYPE.NUMBER,
]);
const PLACEHOLDER_MODE = Object.freeze({
  DOLLAR: 'dollar',
  NONE: 'none',
  QUESTION: 'question',
});
const SQL_STRIP_LITERALS_AND_COMMENTS_PATTERN =
  /'(?:''|[^'])*'|"(?:""|[^"])*"|--[^\n]*|\/\*[\s\S]*?\*\//gu;
const DOLLAR_PLACEHOLDER_PATTERN = /\$(\d+)/gu;
const QUESTION_PLACEHOLDER_PATTERN = /\?/gu;
const INVALID_PARAMETERS_CODE = 'invalid_parameters';

const SELECTOR_PARAM_MESSAGE = Object.freeze({
  AUTHORITY_IMPERSONATION:
    'Call selector arguments must not supply platform-derived tenant or principal authority fields',
  DIVERGENT_PARAMETERS:
    'Dispatched Call selector parameters or digest diverged from the canonical normalized arguments',
  EMPTY_TEXT_DISALLOWED:
    'Call selector text parameter does not allow an empty string',
  INVALID_BOUNDS:
    'Call selector parameter bounds are invalid for the declared slot type',
  INVALID_NULL:
    'Call selector parameter does not allow null',
  INVALID_PLACEHOLDERS:
    'Call selector statement placeholders are malformed or mix placeholder styles',
  INVALID_SCHEMA:
    'Call selector parameter schema must be a non-empty array or plain object of typed slot declarations',
  INVALID_SLOT_NAME:
    'Call selector parameter slot name must be a unique valid identifier and not a reserved authority name',
  INVALID_SLOT_TYPE:
    'Call selector parameter slot type must be boolean, integer, number, or text',
  INVALID_VALUE_TYPE:
    'Call selector parameter value does not match the declared slot type',
  MISSING_PARAMETER:
    'Call selector invocation is missing a required declared parameter',
  OUT_OF_RANGE:
    'Call selector parameter value is outside its declared bounds',
  PLACEHOLDER_MISMATCH:
    'Call selector parameter schema count does not match statement placeholders',
  STATEMENT_NOT_SELECT:
    'Call Cell declared statement must be a single-table SELECT',
  STATEMENT_PARSE_FAILED:
    'Call Cell declared statement could not be parsed',
  UNKNOWN_PARAMETER:
    'Call selector invocation includes an undeclared parameter field',
});

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || types.isProxy(value)) {
    return false;
  }
  if (Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
  );
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function sha256Hex(text) {
  return createHash(HASH_ALGORITHM).update(text, UTF8_ENCODING).digest(HASH_ENCODING);
}

function createSchemaError(message, field = null) {
  const error = new Error(message);
  error.code = INVALID_PARAMETERS_CODE;
  error.field = field;
  return error;
}

function normalizeSlotName(name) {
  if (typeof name !== 'string' ||
      !SLOT_NAME_PATTERN.test(name) ||
      FORBIDDEN_AUTHORITY_PARAMETER_NAMES.has(name)) {
    throw createSchemaError(SELECTOR_PARAM_MESSAGE.INVALID_SLOT_NAME, name);
  }
  return name;
}

function normalizeSlotType(rawType, slotName) {
  const mapped = typeof rawType === 'string' ?
    PARAM_TYPE_ALIAS[rawType] :
    undefined;
  if (!mapped) {
    throw createSchemaError(SELECTOR_PARAM_MESSAGE.INVALID_SLOT_TYPE, slotName);
  }
  return mapped;
}

function validateNumericBound(value, slotType, slotName) {
  if (value === undefined) return undefined;
  const valid = slotType === CALL_SELECTOR_PARAM_TYPE.INTEGER ?
    Number.isSafeInteger(value) :
    (typeof value === 'number' && Number.isFinite(value));
  if (!valid) {
    throw createSchemaError(SELECTOR_PARAM_MESSAGE.INVALID_BOUNDS, slotName);
  }
  return Object.is(value, -NUMERIC_ZERO) ? NUMERIC_ZERO : value;
}

function applyNumericSlotBounds(rawSlot, slotType, normalized) {
  const hasTextBounds = rawSlot.allowEmpty !== undefined ||
    rawSlot.minLength !== undefined ||
    rawSlot.maxLength !== undefined ||
    rawSlot.maxBytes !== undefined;
  if (hasTextBounds) {
    throw createSchemaError(SELECTOR_PARAM_MESSAGE.INVALID_BOUNDS, normalized.name);
  }
  const min = validateNumericBound(rawSlot.min, slotType, normalized.name);
  const max = validateNumericBound(rawSlot.max, slotType, normalized.name);
  if (min !== undefined && max !== undefined && min > max) {
    throw createSchemaError(SELECTOR_PARAM_MESSAGE.INVALID_BOUNDS, normalized.name);
  }
  if (min !== undefined) normalized.min = min;
  if (max !== undefined) normalized.max = max;
}

function validateNonNegativeIntBound(value, minAllowed, slotName) {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || value < minAllowed) {
    throw createSchemaError(SELECTOR_PARAM_MESSAGE.INVALID_BOUNDS, slotName);
  }
  return value;
}

function applyTextSlotBounds(rawSlot, normalized) {
  if (rawSlot.min !== undefined || rawSlot.max !== undefined) {
    throw createSchemaError(SELECTOR_PARAM_MESSAGE.INVALID_BOUNDS, normalized.name);
  }
  if (rawSlot.allowEmpty !== undefined) {
    if (typeof rawSlot.allowEmpty !== 'boolean') {
      throw createSchemaError(SELECTOR_PARAM_MESSAGE.INVALID_BOUNDS, normalized.name);
    }
    if (rawSlot.allowEmpty === false) {
      normalized.allowEmpty = false;
    }
  }
  const minLength = validateNonNegativeIntBound(rawSlot.minLength, 0, normalized.name);
  const maxLength = validateNonNegativeIntBound(rawSlot.maxLength, 0, normalized.name);
  const maxBytes = validateNonNegativeIntBound(rawSlot.maxBytes, 1, normalized.name);
  if (minLength !== undefined && maxLength !== undefined && minLength > maxLength) {
    throw createSchemaError(SELECTOR_PARAM_MESSAGE.INVALID_BOUNDS, normalized.name);
  }
  if (minLength !== undefined) normalized.minLength = minLength;
  if (maxLength !== undefined) normalized.maxLength = maxLength;
  if (maxBytes !== undefined) normalized.maxBytes = maxBytes;
}

function assertBooleanSlotNoBounds(rawSlot, slotName) {
  if (rawSlot.min !== undefined ||
      rawSlot.max !== undefined ||
      rawSlot.allowEmpty !== undefined ||
      rawSlot.minLength !== undefined ||
      rawSlot.maxLength !== undefined ||
      rawSlot.maxBytes !== undefined) {
    throw createSchemaError(SELECTOR_PARAM_MESSAGE.INVALID_BOUNDS, slotName);
  }
}

function normalizeOneSlot(rawSlot, fallbackName) {
  const slotObj = typeof rawSlot === 'string' ?
    {name: fallbackName, type: rawSlot} :
    rawSlot;
  if (!isPlainObject(slotObj)) {
    throw createSchemaError(SELECTOR_PARAM_MESSAGE.INVALID_SCHEMA, fallbackName);
  }
  for (const key of Object.keys(slotObj)) {
    if (!ALLOWED_SLOT_FIELDS.has(key)) {
      throw createSchemaError(SELECTOR_PARAM_MESSAGE.INVALID_SCHEMA, key);
    }
  }
  const name = normalizeSlotName(slotObj.name ?? fallbackName);
  const type = normalizeSlotType(slotObj.type, name);
  if (slotObj.nullable !== undefined && typeof slotObj.nullable !== 'boolean') {
    throw createSchemaError(SELECTOR_PARAM_MESSAGE.INVALID_SCHEMA, name);
  }
  const normalized = {
    name,
    nullable: slotObj.nullable === true,
    type,
  };
  if (NUMERIC_SLOT_TYPES.has(type)) {
    applyNumericSlotBounds(slotObj, type, normalized);
  } else if (type === CALL_SELECTOR_PARAM_TYPE.TEXT) {
    applyTextSlotBounds(slotObj, normalized);
  } else {
    assertBooleanSlotNoBounds(slotObj, name);
  }
  return Object.freeze(normalized);
}

function rawSlotsListFromSchema(rawSchema) {
  if (Array.isArray(rawSchema)) {
    return rawSchema.map((entry) => ({entry, fallbackName: undefined}));
  }
  if (isPlainObject(rawSchema)) {
    return Object.keys(rawSchema).map((key) => ({
      entry: rawSchema[key],
      fallbackName: key,
    }));
  }
  throw createSchemaError(SELECTOR_PARAM_MESSAGE.INVALID_SCHEMA);
}

function normalizeCallSelectorParameterSchema(rawSchema) {
  if (rawSchema === undefined || rawSchema === null) {
    return undefined;
  }
  const rawEntries = rawSlotsListFromSchema(rawSchema);
  const seenNames = new Set();
  const normalizedSlots = [];
  for (const {entry, fallbackName} of rawEntries) {
    const slot = normalizeOneSlot(entry, fallbackName);
    if (seenNames.has(slot.name)) {
      throw createSchemaError(SELECTOR_PARAM_MESSAGE.INVALID_SLOT_NAME, slot.name);
    }
    seenNames.add(slot.name);
    normalizedSlots.push(slot);
  }
  return deepFreeze(normalizedSlots);
}

function inspectSelectorPlaceholders(statementText) {
  if (typeof statementText !== 'string' || statementText.length === 0) {
    throw createSchemaError(SELECTOR_PARAM_MESSAGE.STATEMENT_PARSE_FAILED);
  }
  const stripped = statementText.replace(
    SQL_STRIP_LITERALS_AND_COMMENTS_PATTERN, ' ');
  const dollarMatches = [...stripped.matchAll(DOLLAR_PLACEHOLDER_PATTERN)];
  const questionMatches = [...stripped.matchAll(QUESTION_PLACEHOLDER_PATTERN)];
  if (dollarMatches.length > 0 && questionMatches.length > 0) {
    throw createSchemaError(SELECTOR_PARAM_MESSAGE.INVALID_PLACEHOLDERS);
  }
  if (dollarMatches.length > 0) {
    const paramMapping = dollarMatches.map((match) => Number(match[1]));
    if (paramMapping.some((idx) => !Number.isSafeInteger(idx) || idx < MIN_DOLLAR_INDEX)) {
      throw createSchemaError(SELECTOR_PARAM_MESSAGE.INVALID_PLACEHOLDERS);
    }
    const maxIndex = Math.max(...paramMapping);
    try {
      validateParamMapping(paramMapping, maxIndex);
    } catch {
      throw createSchemaError(SELECTOR_PARAM_MESSAGE.INVALID_PLACEHOLDERS);
    }
    return Object.freeze({
      logicalCount: maxIndex,
      mode: PLACEHOLDER_MODE.DOLLAR,
      paramMapping: Object.freeze(paramMapping),
    });
  }
  if (questionMatches.length > 0) {
    return Object.freeze({
      logicalCount: questionMatches.length,
      mode: PLACEHOLDER_MODE.QUESTION,
      paramMapping: null,
    });
  }
  return Object.freeze({
    logicalCount: 0,
    mode: PLACEHOLDER_MODE.NONE,
    paramMapping: null,
  });
}

function assertSelectorParameterCorrespondence(statementText, normalizedSchema) {
  const info = inspectSelectorPlaceholders(statementText);
  const declaredCount = Array.isArray(normalizedSchema) ?
    normalizedSchema.length :
    0;
  if (declaredCount !== info.logicalCount) {
    throw createSchemaError(SELECTOR_PARAM_MESSAGE.PLACEHOLDER_MISMATCH);
  }
  return info;
}

function parseSelectorStatementAst(sqlParser, statementText) {
  let placeholderInfo;
  try {
    placeholderInfo = inspectSelectorPlaceholders(statementText);
  } catch (error) {
    throw createCallRoutingFailure(
      CALL_CELL_ROUTE_ERROR_CODE.STATEMENT_INVALID,
      error.message,
      {cause: error},
    );
  }
  let ast = null;
  try {
    ast = placeholderInfo.mode === PLACEHOLDER_MODE.DOLLAR ?
      new SQLParser(statementText, {dialect: PARSER_DIALECT.POSTGRESQL}).parse() :
      sqlParser.parse(statementText);
  } catch (parseError) {
    throw createCallRoutingFailure(
      CALL_CELL_ROUTE_ERROR_CODE.STATEMENT_INVALID,
      SELECTOR_PARAM_MESSAGE.STATEMENT_PARSE_FAILED,
      {cause: parseError},
    );
  }
  if (String(ast?.type || '').toUpperCase() !== AST_TYPE_SELECT ||
      !ast?.from?.name) {
    throw createCallRoutingFailure(
      CALL_CELL_ROUTE_ERROR_CODE.STATEMENT_INVALID,
      SELECTOR_PARAM_MESSAGE.STATEMENT_NOT_SELECT,
    );
  }
  return {ast, placeholderInfo};
}

function assertNoForbiddenAuthorityArguments(parsedArgs) {
  for (const key of Object.keys(parsedArgs)) {
    if (FORBIDDEN_AUTHORITY_PARAMETER_NAMES.has(key)) {
      throw createCallRoutingFailure(
        CALL_CELL_ROUTE_ERROR_CODE.INVALID_ARGUMENTS,
        `${SELECTOR_PARAM_MESSAGE.AUTHORITY_IMPERSONATION}: ${key}`,
      );
    }
  }
}

function coerceNumericSlotValue(slot, value) {
  const validType = slot.type === CALL_SELECTOR_PARAM_TYPE.INTEGER ?
    Number.isSafeInteger(value) :
    (typeof value === 'number' && Number.isFinite(value));
  if (!validType) {
    throw createCallRoutingFailure(
      CALL_CELL_ROUTE_ERROR_CODE.INVALID_ARGUMENTS,
      `${SELECTOR_PARAM_MESSAGE.INVALID_VALUE_TYPE}: ${slot.name}`,
    );
  }
  const normalized = Object.is(value, -NUMERIC_ZERO) ? NUMERIC_ZERO : value;
  if ((slot.min !== undefined && normalized < slot.min) ||
      (slot.max !== undefined && normalized > slot.max)) {
    throw createCallRoutingFailure(
      CALL_CELL_ROUTE_ERROR_CODE.INVALID_ARGUMENTS,
      `${SELECTOR_PARAM_MESSAGE.OUT_OF_RANGE}: ${slot.name}`,
    );
  }
  return {bindValue: normalized, logicalValue: normalized};
}

function coerceTextSlotValue(slot, value) {
  if (typeof value !== 'string') {
    throw createCallRoutingFailure(
      CALL_CELL_ROUTE_ERROR_CODE.INVALID_ARGUMENTS,
      `${SELECTOR_PARAM_MESSAGE.INVALID_VALUE_TYPE}: ${slot.name}`,
    );
  }
  if (slot.allowEmpty === false && value.length === 0) {
    throw createCallRoutingFailure(
      CALL_CELL_ROUTE_ERROR_CODE.INVALID_ARGUMENTS,
      `${SELECTOR_PARAM_MESSAGE.EMPTY_TEXT_DISALLOWED}: ${slot.name}`,
    );
  }
  const byteLength = Buffer.byteLength(value, UTF8_ENCODING);
  if ((slot.minLength !== undefined && value.length < slot.minLength) ||
      (slot.maxLength !== undefined && value.length > slot.maxLength) ||
      (slot.maxBytes !== undefined && byteLength > slot.maxBytes)) {
    throw createCallRoutingFailure(
      CALL_CELL_ROUTE_ERROR_CODE.INVALID_ARGUMENTS,
      `${SELECTOR_PARAM_MESSAGE.OUT_OF_RANGE}: ${slot.name}`,
    );
  }
  return {bindValue: value, logicalValue: value};
}

function coerceSlotValue(slot, value) {
  if (value === null) {
    if (slot.nullable !== true) {
      throw createCallRoutingFailure(
        CALL_CELL_ROUTE_ERROR_CODE.INVALID_ARGUMENTS,
        `${SELECTOR_PARAM_MESSAGE.INVALID_NULL}: ${slot.name}`,
      );
    }
    return {bindValue: null, logicalValue: null};
  }
  if (slot.type === CALL_SELECTOR_PARAM_TYPE.BOOLEAN) {
    if (typeof value !== 'boolean') {
      throw createCallRoutingFailure(
        CALL_CELL_ROUTE_ERROR_CODE.INVALID_ARGUMENTS,
        `${SELECTOR_PARAM_MESSAGE.INVALID_VALUE_TYPE}: ${slot.name}`,
      );
    }
    return {
      bindValue: value ? SQLITE_BOOL_TRUE : SQLITE_BOOL_FALSE,
      logicalValue: value,
    };
  }
  if (NUMERIC_SLOT_TYPES.has(slot.type)) {
    return coerceNumericSlotValue(slot, value);
  }
  return coerceTextSlotValue(slot, value);
}

function resolveBoundParametersForPlaceholders(slotBindValues, statement) {
  if (typeof statement !== 'string' || statement.length === 0) {
    return Object.freeze([...slotBindValues]);
  }
  let info;
  try {
    info = inspectSelectorPlaceholders(statement);
  } catch (error) {
    throw createCallRoutingFailure(
      CALL_CELL_ROUTE_ERROR_CODE.STATEMENT_INVALID,
      error.message,
      {cause: error},
    );
  }
  if (info.logicalCount !== slotBindValues.length) {
    throw createCallRoutingFailure(
      CALL_CELL_ROUTE_ERROR_CODE.STATEMENT_INVALID,
      SELECTOR_PARAM_MESSAGE.PLACEHOLDER_MISMATCH,
    );
  }
  if (info.mode === PLACEHOLDER_MODE.DOLLAR && info.paramMapping) {
    return Object.freeze(reorderParams(slotBindValues, info.paramMapping));
  }
  return Object.freeze([...slotBindValues]);
}

function computeParameterSchemaDigest(parameterSchema) {
  if (!Array.isArray(parameterSchema)) return null;
  return sha256Hex(canonicalJson(parameterSchema));
}

function normalizeCallSelectorInvocationParameters({
  argumentsJson,
  parameterSchema,
  statement,
} = {}) {
  const normalizedArgsJson = normalizeCallArguments(argumentsJson);
  const parsedArgs = JSON.parse(normalizedArgsJson);
  assertNoForbiddenAuthorityArguments(parsedArgs);

  let schema;
  try {
    schema = normalizeCallSelectorParameterSchema(parameterSchema);
  } catch (error) {
    throw createCallRoutingFailure(
      CALL_CELL_ROUTE_ERROR_CODE.STATEMENT_INVALID,
      error.message,
      {cause: error},
    );
  }

  if (!Array.isArray(schema)) {
    if (typeof statement === 'string' && statement.length > 0) {
      const info = inspectSelectorPlaceholders(statement);
      if (info.logicalCount > 0) {
        throw createCallRoutingFailure(
          CALL_CELL_ROUTE_ERROR_CODE.STATEMENT_INVALID,
          SELECTOR_PARAM_MESSAGE.PLACEHOLDER_MISMATCH,
        );
      }
    }
    return Object.freeze({
      boundParameters: Object.freeze([]),
      logicalParameters: Object.freeze([]),
      parameterSchemaDigest: null,
      parametersDigest: null,
      parametersJson: null,
    });
  }

  const declaredNames = new Set(schema.map((slot) => slot.name));
  for (const key of Object.keys(parsedArgs)) {
    if (!declaredNames.has(key)) {
      throw createCallRoutingFailure(
        CALL_CELL_ROUTE_ERROR_CODE.INVALID_ARGUMENTS,
        `${SELECTOR_PARAM_MESSAGE.UNKNOWN_PARAMETER}: ${key}`,
      );
    }
  }

  const logicalParameters = [];
  const slotBindValues = [];
  for (const slot of schema) {
    if (!Object.hasOwn(parsedArgs, slot.name) ||
        parsedArgs[slot.name] === undefined) {
      throw createCallRoutingFailure(
        CALL_CELL_ROUTE_ERROR_CODE.INVALID_ARGUMENTS,
        `${SELECTOR_PARAM_MESSAGE.MISSING_PARAMETER}: ${slot.name}`,
      );
    }
    const {bindValue, logicalValue} = coerceSlotValue(
      slot, parsedArgs[slot.name]);
    logicalParameters.push(logicalValue);
    slotBindValues.push(bindValue);
  }

  const boundParameters = resolveBoundParametersForPlaceholders(
    slotBindValues, statement);
  const parameterSchemaDigest = computeParameterSchemaDigest(schema);
  const parametersJson = canonicalJson({
    boundParameters,
    logicalParameters,
    parameterSchemaDigest,
  });
  const parametersDigest = sha256Hex(parametersJson);

  return Object.freeze({
    boundParameters,
    logicalParameters: Object.freeze(logicalParameters),
    parameterSchemaDigest,
    parametersDigest,
    parametersJson,
  });
}

function assertDispatchedSelectorParameters({
  argumentsJson,
  dispatchedParameters,
  dispatchedParametersDigest,
  parameterSchema,
  statement,
}) {
  const expected = normalizeCallSelectorInvocationParameters({
    argumentsJson,
    parameterSchema,
    statement,
  });
  if (!Array.isArray(parameterSchema)) {
    if (Array.isArray(dispatchedParameters) &&
        dispatchedParameters.length > 0) {
      throw createCallRoutingFailure(
        CALL_CELL_ROUTE_ERROR_CODE.INVALID_ARGUMENTS,
        SELECTOR_PARAM_MESSAGE.DIVERGENT_PARAMETERS,
      );
    }
    return expected;
  }
  if (!Array.isArray(dispatchedParameters) ||
      dispatchedParametersDigest !== expected.parametersDigest ||
      dispatchedParameters.length !== expected.boundParameters.length ||
      dispatchedParameters.some((val, idx) =>
        !Object.is(val, expected.boundParameters[idx]))) {
    throw createCallRoutingFailure(
      CALL_CELL_ROUTE_ERROR_CODE.INVALID_ARGUMENTS,
      SELECTOR_PARAM_MESSAGE.DIVERGENT_PARAMETERS,
    );
  }
  return expected;
}

function normalizeBindingSelectorParameters(
  rawParameters,
  statement,
  failAtSubpath,
) {
  if (rawParameters !== undefined) {
    if (statement === undefined) {
      failAtSubpath(BINDING_SOURCE_SUBPATH.PARAMETERS);
    }
    try {
      const schema = normalizeCallSelectorParameterSchema(rawParameters);
      assertSelectorParameterCorrespondence(statement, schema);
      return schema;
    } catch {
      failAtSubpath(BINDING_SOURCE_SUBPATH.PARAMETERS);
    }
  }
  if (statement !== undefined) {
    try {
      assertSelectorParameterCorrespondence(statement, undefined);
    } catch {
      failAtSubpath(BINDING_SOURCE_SUBPATH.STATEMENT);
    }
  }
  return undefined;
}

export {
  CALL_SELECTOR_PARAM_TYPE,
  FORBIDDEN_AUTHORITY_PARAMETER_NAMES,
  INVALID_PARAMETERS_CODE,
  PLACEHOLDER_MODE,
  SELECTOR_PARAM_MESSAGE,
  assertDispatchedSelectorParameters,
  assertSelectorParameterCorrespondence,
  computeParameterSchemaDigest,
  inspectSelectorPlaceholders,
  normalizeBindingSelectorParameters,
  normalizeCallSelectorInvocationParameters,
  normalizeCallSelectorParameterSchema,
  parseSelectorStatementAst,
};
