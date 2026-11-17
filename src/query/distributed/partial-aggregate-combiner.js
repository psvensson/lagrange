import {
  AGGREGATE_COMBINE_MODE,
  COMBINED_AGGREGATE_MARKER,
  EXTENDED_EXPR_TYPE,
  PARTIAL_ALIAS,
  SCALAR_BINARY_OPS,
  SCALAR_UNARY_OPS,
  hasBoundParameterAt,
  resolveParameterNodeOrdinal,
} from './distributed-select-fanout-plan.js';
import {EXPR_TYPE} from '../parser-constants.js';

const UNBOUND_PARAMETER_ERROR_CODE = 'SYNTAX_ERROR';
const UNBOUND_PARAMETER_PREFIX = 'Unbound parameter index: ';
const UNKNOWN_PARAMETER_LABEL = '?';
const INVALID_PARAMETER_NAN_MSG =
  'Invalid parameter value: NaN is unrepresentable';
const SUBSTR_WITH_LENGTH_ARG_COUNT = 3;
const DECIMAL_BASE = 10;
const SCALAR_FN = Object.freeze({
  COALESCE: 'COALESCE',
  IFNULL: 'IFNULL',
  NULLIF: 'NULLIF',
  IIF: 'IIF',
  ABS: 'ABS',
  LOWER: 'LOWER',
  UPPER: 'UPPER',
  TRIM: 'TRIM',
  LENGTH: 'LENGTH',
  SUBSTR: 'SUBSTR',
  SUBSTRING: 'SUBSTRING',
  ROUND: 'ROUND',
});
const AFFINITY_TOKEN = Object.freeze({
  INT: 'INT',
  TEXT: 'TEXT',
  CHAR: 'CHAR',
  CLOB: 'CLOB',
  REAL: 'REAL',
  FLOA: 'FLOA',
  DOUB: 'DOUB',
  NUM: 'NUM',
  DEC: 'DEC',
});

/** Aggregate function names as the parser normalizes them. */
const AGGREGATE_FN = Object.freeze({
  COUNT: 'COUNT',
  SUM: 'SUM',
  AVG: 'AVG',
  MIN: 'MIN',
  MAX: 'MAX',
});

/**
 * Combine partial-aggregate rows returned by the partitions into final,
 * globally-correct result rows: group by the projected group keys,
 * combine each aggregate's partials per its combine mode, then apply
 * HAVING, ORDER BY, and LIMIT/OFFSET exactly once at the coordinator.
 *
 * The queryExecutor argument supplies the existing row-level clause
 * appliers (applyHaving, applyOrderBy, applyLimit) so global-clause
 * semantics stay single-sourced.
 */

/**
 * Combine one aggregate's partial values for one group.
 * @param {Object} aggregate - Aggregate combine spec entry.
 * @param {Array<Object>} groupRows - Partial rows of the group.
 * @return {*} Final aggregate value (SQL semantics: null over no input
 *   for SUM/AVG/MIN/MAX, 0 for COUNT).
 */
function combineAggregate(aggregate, groupRows) {
  switch (aggregate.combineMode) {
  case AGGREGATE_COMBINE_MODE.SUM_OF_COUNTS:
    return groupRows.reduce(
      (total, row) => total + (Number(row[aggregate.partials.value]) || 0),
      0,
    );
  case AGGREGATE_COMBINE_MODE.SUM_OF_SUMS:
    return combineNullSkipping(
      groupRows,
      aggregate.partials.value,
      (total, value) => total + value,
    );
  case AGGREGATE_COMBINE_MODE.MIN_OF_MINS:
    return combineNullSkipping(
      groupRows,
      aggregate.partials.value,
      (best, value) => (value < best ? value : best),
    );
  case AGGREGATE_COMBINE_MODE.MAX_OF_MAXES:
    return combineNullSkipping(
      groupRows,
      aggregate.partials.value,
      (best, value) => (value > best ? value : best),
    );
  case AGGREGATE_COMBINE_MODE.SUM_PAIR_RATIO: {
    const totalCount = groupRows.reduce(
      (total, row) => total + (Number(row[aggregate.partials.count]) || 0),
      0,
    );
    if (totalCount === 0) {
      return null;
    }
    const totalSum = combineNullSkipping(
      groupRows,
      aggregate.partials.sum,
      (total, value) => total + value,
    );
    return totalSum === null ? null : totalSum / totalCount;
  }
  case AGGREGATE_COMBINE_MODE.DISTINCT_VALUES:
    return combineDistinct(aggregate, groupRows);
  default:
    return null;
  }
}

function combineNullSkipping(groupRows, alias, reducer) {
  let acc = null;
  for (const row of groupRows) {
    const value = row[alias];
    if (value === null || value === undefined) {
      continue;
    }
    acc = acc === null ? value : reducer(acc, value);
  }
  return acc;
}

function combineDistinct(aggregate, groupRows) {
  const distinct = new Set();
  for (const row of groupRows) {
    const value = row[aggregate.partials.values];
    if (value !== null && value !== undefined) {
      distinct.add(value);
    }
  }
  const values = [...distinct];
  if (aggregate.fn === AGGREGATE_FN.COUNT) {
    return values.length;
  }
  if (values.length === 0) {
    return null;
  }
  switch (aggregate.fn) {
  case AGGREGATE_FN.SUM:
    return values.reduce((total, value) => total + Number(value), 0);
  case AGGREGATE_FN.AVG:
    return values.reduce((total, value) => total + Number(value), 0) /
      values.length;
  case AGGREGATE_FN.MIN:
    return values.reduce((best, value) => (value < best ? value : best));
  case AGGREGATE_FN.MAX:
    return values.reduce((best, value) => (value > best ? value : best));
  default:
    return null;
  }
}

/**
 * Build the group key for a partial row.
 * @param {Object} combineSpec - Plan combine spec.
 * @param {Object} row - Partial row.
 * @return {string} Stable group key.
 */
function groupKeyOf(combineSpec, row) {
  return JSON.stringify(
    combineSpec.groupKeys.map((key) => row[key.alias]),
  );
}

function resolveBoundParameterNodeValue(node, params) {
  const ordinal = resolveParameterNodeOrdinal(node);
  if (!hasBoundParameterAt(params, ordinal)) {
    const label = Number.isInteger(ordinal) ?
      String(ordinal) :
      UNKNOWN_PARAMETER_LABEL;
    const error = new Error(`${UNBOUND_PARAMETER_PREFIX}${label}`);
    error.code = UNBOUND_PARAMETER_ERROR_CODE;
    error.errorCode = UNBOUND_PARAMETER_ERROR_CODE;
    throw error;
  }
  const value = params[ordinal];
  if (typeof value === 'number' && Number.isNaN(value)) {
    const error = new Error(INVALID_PARAMETER_NAN_MSG);
    error.code = UNBOUND_PARAMETER_ERROR_CODE;
    error.errorCode = UNBOUND_PARAMETER_ERROR_CODE;
    throw error;
  }
  return value;
}

function assertExpressionParametersBound(node, params) {
  if (!node || typeof node !== 'object') {
    return;
  }
  if (Array.isArray(node)) {
    for (const entry of node) {
      assertExpressionParametersBound(entry, params);
    }
    return;
  }
  if (node.type === EXPR_TYPE.PARAMETER) {
    resolveBoundParameterNodeValue(node, params);
    return;
  }
  for (const value of Object.values(node)) {
    if (value && typeof value === 'object') {
      assertExpressionParametersBound(value, params);
    }
  }
}

/**
 * Merge partition partial-aggregate rows into the final result rows.
 * @param {Array<Object>} partialRows - Concatenated partition rows.
 * @param {Object} combineSpec - Plan combine spec.
 * @param {Object} queryExecutor - QueryExecutor (clause appliers).
 * @param {Array} [params] - Bound query parameters.
 * @return {Array<Object>} Final rows.
 */
function combinePartialAggregateRows(
  partialRows,
  combineSpec,
  queryExecutor,
  params,
) {
  for (const expressionColumn of combineSpec.expressionColumns) {
    assertExpressionParametersBound(expressionColumn.expression, params);
  }
  const groups = new Map();
  for (const row of partialRows) {
    const key = groupKeyOf(combineSpec, row);
    let group = groups.get(key);
    if (!group) {
      group = [];
      groups.set(key, group);
    }
    group.push(row);
  }
  if (groups.size === 0 && !combineSpec.hasGroupBy) {
    groups.set(groupKeyOf(combineSpec, {}), []);
  }

  let internalRows = [];
  for (const groupRows of groups.values()) {
    internalRows.push(buildInternalRow(combineSpec, groupRows, params));
  }

  if (combineSpec.having) {
    internalRows = queryExecutor.applyHaving(
      internalRows,
      combineSpec.having,
      params,
    );
  }
  if (combineSpec.orderBy) {
    internalRows = queryExecutor.applyOrderBy(
      internalRows,
      combineSpec.orderBy,
    );
  }
  if (combineSpec.limit) {
    internalRows = queryExecutor.applyLimit(internalRows, combineSpec.limit);
  }
  return internalRows.map((row) => projectFinalRow(combineSpec, row));
}

/** Hidden per-row list of star-projected raw column names. */
const STAR_KEYS_PROPERTY = '__fanoutStarKeys';

function buildInternalRow(combineSpec, groupRows, params) {
  const firstRow = groupRows[0] || {};
  const row = {};
  const starKeys = [];
  if (combineSpec.includeStar) {
    for (const key of Object.keys(firstRow)) {
      if (!isInternalAlias(key)) {
        row[key] = firstRow[key];
        starKeys.push(key);
      }
    }
  }
  for (const key of combineSpec.groupKeys) {
    const value = firstRow[key.alias];
    if (key.columnName && !Object.hasOwn(row, key.columnName)) {
      row[key.columnName] = value;
    }
    for (const outputKey of key.outputKeys) {
      row[outputKey] = value;
    }
    row[key.alias] = value;
  }
  for (const bare of combineSpec.bareColumns) {
    row[bare.outputKey] = firstRow[bare.alias];
  }
  const combinedBySpecIndex = new Map();
  for (const aggregate of combineSpec.aggregates) {
    const value = combineAggregate(aggregate, groupRows);
    combinedBySpecIndex.set(aggregate.index, value);
    row[aggregate.havingKey] = value;
    for (const outputKey of aggregate.outputKeys) {
      row[outputKey] = value;
    }
  }
  const evalCtx = {row, combinedBySpecIndex, params};
  for (const expressionColumn of combineSpec.expressionColumns) {
    row[expressionColumn.outputKey] = evaluateScalarExpression(
      expressionColumn.expression,
      evalCtx,
    );
  }
  Object.defineProperty(row, STAR_KEYS_PROPERTY, {
    value: starKeys,
    enumerable: false,
  });
  return row;
}

function isInternalAlias(key) {
  return key.startsWith(PARTIAL_ALIAS.GROUP_KEY_PREFIX) ||
    key.startsWith(PARTIAL_ALIAS.AGGREGATE_PREFIX) ||
    key.startsWith(PARTIAL_ALIAS.BARE_PREFIX);
}

function evaluateScalarIn(node, evalCtx) {
  const value = evaluateScalarExpression(node.expression, evalCtx);
  const candidates = (node.values || []).map((entry) =>
    evaluateScalarExpression(entry, evalCtx),
  );
  if (value === null || value === undefined) {
    return null;
  }
  let sawNull = false;
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined) {
      sawNull = true;
      continue;
    }
    if (value === candidate) {
      return node.negated ? 0 : 1;
    }
  }
  if (sawNull) {
    return null;
  }
  return node.negated ? 1 : 0;
}

function evaluateScalarCase(node, evalCtx) {
  const hasOperand = Boolean(node.operand);
  const operandVal = hasOperand ?
    evaluateScalarExpression(node.operand, evalCtx) :
    null;
  for (const cond of node.conditions || []) {
    const whenVal = evaluateScalarExpression(cond.when, evalCtx);
    const matched = hasOperand ?
      (operandVal !== null && operandVal !== undefined &&
        whenVal !== null && whenVal !== undefined &&
        operandVal === whenVal) :
      Boolean(whenVal);
    if (matched) {
      return evaluateScalarExpression(cond.thenExpression, evalCtx);
    }
  }
  return node.elseExpr ?
    evaluateScalarExpression(node.elseExpr, evalCtx) :
    null;
}

function evaluateScalarCast(node, evalCtx) {
  const sourceNode = node.expression ?
    node.expression :
    (node.expr ? node.expr : node.operand);
  const inner = evaluateScalarExpression(sourceNode, evalCtx);
  if (inner === null || inner === undefined) {
    return null;
  }
  const rawType = String(
    node.affinity ? node.affinity : (node.targetType || ''),
  ).toUpperCase();
  if (rawType.includes(AFFINITY_TOKEN.INT)) {
    const parsed = Number.parseInt(String(inner), 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (
    rawType.includes(AFFINITY_TOKEN.TEXT) ||
    rawType.includes(AFFINITY_TOKEN.CHAR) ||
    rawType.includes(AFFINITY_TOKEN.CLOB)
  ) {
    return String(inner);
  }
  if (
    rawType.includes(AFFINITY_TOKEN.REAL) ||
    rawType.includes(AFFINITY_TOKEN.FLOA) ||
    rawType.includes(AFFINITY_TOKEN.DOUB) ||
    rawType.includes(AFFINITY_TOKEN.NUM) ||
    rawType.includes(AFFINITY_TOKEN.DEC)
  ) {
    const parsed = Number(inner);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return inner;
}

function evaluateScalarSubstr(args) {
  if (args[0] === null || args[0] === undefined ||
      args[1] === null || args[1] === undefined) {
    return null;
  }
  const text = String(args[0]);
  const start = Math.trunc(Number(args[1]));
  const zeroStart = start > 0 ? start - 1 :
    (start < 0 ? Math.max(text.length + start, 0) : 0);
  if (args.length < SUBSTR_WITH_LENGTH_ARG_COUNT) {
    return text.slice(zeroStart);
  }
  if (args[2] === null || args[2] === undefined) {
    return null;
  }
  const length = Math.max(Math.trunc(Number(args[2])), 0);
  return text.slice(zeroStart, zeroStart + length);
}

function evaluateScalarFunctionCall(node, evalCtx) {
  const fnName = String(node.name || '').toUpperCase();
  const args = (node.args || []).map((arg) =>
    evaluateScalarExpression(arg, evalCtx),
  );
  switch (fnName) {
  case SCALAR_FN.COALESCE:
  case SCALAR_FN.IFNULL: {
    const found = args.find((val) => val !== null && val !== undefined);
    return found === undefined ? null : found;
  }
  case SCALAR_FN.NULLIF:
    if (args[0] === null || args[0] === undefined) {
      return null;
    }
    return args[0] === args[1] ? null : args[0];
  case SCALAR_FN.IIF:
    return args[0] ?
      (args[1] === undefined ? null : args[1]) :
      (args[2] === undefined ? null : args[2]);
  case SCALAR_FN.ABS:
    return args[0] === null || args[0] === undefined ?
      null :
      Math.abs(Number(args[0]));
  case SCALAR_FN.LOWER:
    return args[0] === null || args[0] === undefined ?
      null :
      String(args[0]).toLowerCase();
  case SCALAR_FN.UPPER:
    return args[0] === null || args[0] === undefined ?
      null :
      String(args[0]).toUpperCase();
  case SCALAR_FN.TRIM:
    return args[0] === null || args[0] === undefined ?
      null :
      String(args[0]).trim();
  case SCALAR_FN.LENGTH:
    return args[0] === null || args[0] === undefined ?
      null :
      String(args[0]).length;
  case SCALAR_FN.SUBSTR:
  case SCALAR_FN.SUBSTRING:
    return evaluateScalarSubstr(args);
  case SCALAR_FN.ROUND: {
    if (args[0] === null || args[0] === undefined) {
      return null;
    }
    const digits = args[1] === undefined || args[1] === null ?
      0 :
      Math.trunc(Number(args[1]));
    const factor = DECIMAL_BASE ** digits;
    return Math.round(Number(args[0]) * factor) / factor;
  }
  default:
    return null;
  }
}

function evaluateScalarBinary(node, evalCtx) {
  const op = SCALAR_BINARY_OPS[node.operator];
  if (!op) {
    return null;
  }
  const left = evaluateScalarExpression(node.left, evalCtx);
  const right = evaluateScalarExpression(node.right, evalCtx);
  if (left === null || left === undefined ||
    right === null || right === undefined) {
    return null;
  }
  return op(left, right);
}

/**
 * Evaluate a coordinator-side scalar expression over a combined row.
 * @param {Object} node - Expression AST (markers for aggregates).
 * @param {Object} evalCtx - {row, combinedBySpecIndex, params}.
 * @return {*} Scalar value.
 */
function evaluateScalarExpression(node, evalCtx) {
  switch (node?.type) {
  case EXPR_TYPE.LITERAL:
    return node.value;
  case EXPR_TYPE.PARAMETER:
    return resolveBoundParameterNodeValue(node, evalCtx.params);
  case EXPR_TYPE.COLUMN_REF:
    return evalCtx.row[node.column];
  case COMBINED_AGGREGATE_MARKER:
    return evalCtx.combinedBySpecIndex.get(node.specIndex);
  case EXPR_TYPE.UNARY: {
    const op = SCALAR_UNARY_OPS[node.operator];
    if (!op) {
      return null;
    }
    const operand = evaluateScalarExpression(node.operand, evalCtx);
    return operand === null || operand === undefined ? null : op(operand);
  }
  case EXPR_TYPE.BINARY:
    return evaluateScalarBinary(node, evalCtx);
  case EXPR_TYPE.IN:
    return evaluateScalarIn(node, evalCtx);
  case EXTENDED_EXPR_TYPE.CASE:
    return evaluateScalarCase(node, evalCtx);
  case EXTENDED_EXPR_TYPE.CAST:
    return evaluateScalarCast(node, evalCtx);
  case EXTENDED_EXPR_TYPE.FUNCTION_CALL:
  case EXTENDED_EXPR_TYPE.FUNCTION:
    return evaluateScalarFunctionCall(node, evalCtx);
  default:
    return null;
  }
}

function projectFinalRow(combineSpec, internalRow) {
  const row = {};
  for (const starKey of internalRow[STAR_KEYS_PROPERTY] || []) {
    row[starKey] = internalRow[starKey];
  }
  for (const key of combineSpec.groupKeys) {
    for (const outputKey of key.outputKeys) {
      row[outputKey] = internalRow[outputKey];
    }
  }
  for (const bare of combineSpec.bareColumns) {
    if (bare.projected) {
      row[bare.outputKey] = internalRow[bare.outputKey];
    }
  }
  for (const aggregate of combineSpec.aggregates) {
    for (const outputKey of aggregate.outputKeys) {
      row[outputKey] = internalRow[outputKey];
    }
  }
  for (const expressionColumn of combineSpec.expressionColumns) {
    row[expressionColumn.outputKey] = internalRow[expressionColumn.outputKey];
  }
  return row;
}

export {combinePartialAggregateRows};
