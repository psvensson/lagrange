import {EXPR_TYPE} from '../parser-constants.js';
import {QUERY_OPERATOR} from '../query-constants.js';

/**
 * SQL three-valued-logic evaluator for coordinator-side residual JOIN
 * WHERE conjuncts. A comparison with a NULL operand is UNKNOWN (not
 * false, not true); AND/OR/NOT combine per 3VL; a row survives the
 * WHERE only when the predicate is exactly TRUE. JS-strict evaluation
 * (QueryExecutor#evaluateExpression) keeps NULL rows that SQLite
 * filters, which is why residual conjuncts must come through here.
 *
 * Operator names mirror the join-pushdown plan's supported set; any
 * conjunct outside that set never reaches this evaluator (the plan
 * routes it to the legacy whole-WHERE path).
 */

/** Parser operator names not carried by QUERY_OPERATOR. */
const RESIDUAL_OPERATOR = Object.freeze({
  OR: 'OR',
  IS_NULL: 'IS NULL',
  IS_NOT_NULL: 'IS NOT NULL',
  NOT: 'NOT',
  PLUS: '+',
  MINUS: '-',
});

/** 3VL truth constants; UNKNOWN is represented as null. */
const UNKNOWN = null;

const LIKE_REGEX_ESCAPE = /[.*+?^${}()|[\]\\]/g;
const LIKE_REGEX_ESCAPE_REPLACEMENT = '\\$&';
const LIKE_ANY_SEQUENCE = /%/g;
const LIKE_ANY_SINGLE = /_/g;
const LIKE_REGEX_ANY_SEQUENCE = '.*';
const LIKE_REGEX_ANY_SINGLE = '.';

const SQL_COMPARISON_AFFINITY = Object.freeze({
  NUMERIC: 'NUMERIC',
  TEXT: 'TEXT',
  NONE: 'NONE',
});
const CAST_NODE_TYPE = 'cast';
const INT_TYPE_TOKEN = 'INT';
const SQLITE_NUMERIC_TEXT_RE = /^\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?\s*$/u;
const SQLITE_INTEGER_TEXT_RE = /^[+-]?\d+$/u;
const NUMERIC_TYPE_TOKENS = Object.freeze([
  'NUM',
  'DEC',
  'REAL',
  'FLOA',
  'DOUB',
  'BOOL',
  'SERIAL',
]);
const TEXT_TYPE_TOKENS = Object.freeze(['CHAR', 'CLOB', 'TEXT']);
const NONE_TYPE_TOKENS = Object.freeze(['BLOB', 'BYTEA', 'NONE']);

function isNullValue(value) {
  return value === null || value === undefined;
}

function isValidComparableScalar(value) {
  if (typeof value === 'string') {
    return true;
  }
  return typeof value === 'number' && Number.isFinite(value);
}

function resolveExplicitTypeName(node) {
  if (!node || typeof node !== 'object') {
    return '';
  }
  const candidate = node.affinity;
  return typeof candidate === 'string' ?
    candidate :
    String(candidate?.name || '');
}

function classifyAffinityFromTypeString(rawType) {
  const upper = String(rawType || '').trim().toUpperCase();
  if (upper.length === 0) {
    return null;
  }
  if (upper.includes(INT_TYPE_TOKEN)) {
    return SQL_COMPARISON_AFFINITY.NUMERIC;
  }
  if (TEXT_TYPE_TOKENS.some((tok) => upper.includes(tok))) {
    return SQL_COMPARISON_AFFINITY.TEXT;
  }
  if (NONE_TYPE_TOKENS.some((tok) => upper.includes(tok))) {
    return SQL_COMPARISON_AFFINITY.NONE;
  }
  if (NUMERIC_TYPE_TOKENS.some((tok) => upper.includes(tok))) {
    return SQL_COMPARISON_AFFINITY.NUMERIC;
  }
  return SQL_COMPARISON_AFFINITY.NUMERIC;
}

function isColumnOrAggregateNode(node) {
  const type = node?.type;
  return (
    type === EXPR_TYPE.COLUMN_REF ||
    type === EXPR_TYPE.COLUMN ||
    type === EXPR_TYPE.AGGREGATE
  );
}

function resolveOperandComparisonAffinity(node, value) {
  if (typeof node === 'string') {
    return classifyAffinityFromTypeString(node) || SQL_COMPARISON_AFFINITY.NONE;
  }
  const explicit = classifyAffinityFromTypeString(resolveExplicitTypeName(node));
  if (explicit !== null) {
    return explicit;
  }
  if (isColumnOrAggregateNode(node)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return SQL_COMPARISON_AFFINITY.NUMERIC;
    }
    if (typeof value === 'string') {
      return SQL_COMPARISON_AFFINITY.TEXT;
    }
  }
  return SQL_COMPARISON_AFFINITY.NONE;
}

function coerceStringToNumericAffinity(value) {
  if (!SQLITE_NUMERIC_TEXT_RE.test(value)) {
    return value;
  }
  const trimmed = value.trim();
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || Math.abs(parsed) > Number.MAX_SAFE_INTEGER) {
    return value;
  }
  if (SQLITE_INTEGER_TEXT_RE.test(trimmed) && !Number.isSafeInteger(parsed)) {
    return value;
  }
  return Object.is(parsed, -0) ? 0 : parsed;
}

function applySqlComparisonAffinity(value, affinity) {
  if (affinity === SQL_COMPARISON_AFFINITY.NUMERIC) {
    if (typeof value === 'number') {
      return Number.isFinite(value) && Object.is(value, -0) ? 0 : value;
    }
    if (typeof value === 'string') {
      return coerceStringToNumericAffinity(value);
    }
    return value;
  }
  if (affinity === SQL_COMPARISON_AFFINITY.TEXT) {
    if (typeof value === 'number' &&
        Number.isFinite(value) &&
        Math.abs(value) <= Number.MAX_SAFE_INTEGER) {
      return String(Object.is(value, -0) ? 0 : value);
    }
    return value;
  }
  return value;
}

function coercePairWithAffinity(left, right, leftNodeOrAffinity, rightNodeOrAffinity) {
  const leftAffinity = resolveOperandComparisonAffinity(leftNodeOrAffinity, left);
  const rightAffinity = resolveOperandComparisonAffinity(rightNodeOrAffinity, right);
  if (leftAffinity === SQL_COMPARISON_AFFINITY.NUMERIC ||
      rightAffinity === SQL_COMPARISON_AFFINITY.NUMERIC) {
    return [
      applySqlComparisonAffinity(left, SQL_COMPARISON_AFFINITY.NUMERIC),
      applySqlComparisonAffinity(right, SQL_COMPARISON_AFFINITY.NUMERIC),
    ];
  }
  if (leftAffinity === SQL_COMPARISON_AFFINITY.TEXT &&
      rightAffinity === SQL_COMPARISON_AFFINITY.NONE) {
    return [left, applySqlComparisonAffinity(right, SQL_COMPARISON_AFFINITY.TEXT)];
  }
  if (rightAffinity === SQL_COMPARISON_AFFINITY.TEXT &&
      leftAffinity === SQL_COMPARISON_AFFINITY.NONE) {
    return [applySqlComparisonAffinity(left, SQL_COMPARISON_AFFINITY.TEXT), right];
  }
  return [left, right];
}

function areSqlScalarsEqualWithAffinity(
  left,
  right,
  leftNodeOrAffinity = SQL_COMPARISON_AFFINITY.NONE,
  rightNodeOrAffinity = SQL_COMPARISON_AFFINITY.NONE,
) {
  if (!isValidComparableScalar(left) || !isValidComparableScalar(right)) {
    return false;
  }
  const [coercedLeft, coercedRight] = coercePairWithAffinity(
    left,
    right,
    leftNodeOrAffinity,
    rightNodeOrAffinity,
  );
  return typeof coercedLeft === typeof coercedRight && coercedLeft === coercedRight;
}

function compareSqlScalarsWithAffinity(
  left,
  right,
  leftNodeOrAffinity = SQL_COMPARISON_AFFINITY.NONE,
  rightNodeOrAffinity = SQL_COMPARISON_AFFINITY.NONE,
) {
  if (!isValidComparableScalar(left) || !isValidComparableScalar(right)) {
    return UNKNOWN;
  }
  const [coercedLeft, coercedRight] = coercePairWithAffinity(
    left,
    right,
    leftNodeOrAffinity,
    rightNodeOrAffinity,
  );
  if (typeof coercedLeft === typeof coercedRight) {
    if (coercedLeft === coercedRight) {
      return 0;
    }
    return coercedLeft < coercedRight ? -1 : 1;
  }
  return typeof coercedLeft === 'number' ? -1 : 1;
}

function threeValuedComparison(operator, left, right, leftNode, rightNode) {
  if (isNullValue(left) || isNullValue(right)) {
    return UNKNOWN;
  }
  const cmp = compareSqlScalarsWithAffinity(left, right, leftNode, rightNode);
  if (cmp === UNKNOWN) {
    return UNKNOWN;
  }
  switch (operator) {
  case QUERY_OPERATOR.EQUALS:
    return cmp === 0;
  case QUERY_OPERATOR.NOT_EQUALS:
  case QUERY_OPERATOR.NOT_EQUALS_ALT:
    return cmp !== 0;
  case QUERY_OPERATOR.LESS_THAN:
    return cmp < 0;
  case QUERY_OPERATOR.LESS_THAN_OR_EQUAL:
    return cmp <= 0;
  case QUERY_OPERATOR.GREATER_THAN:
    return cmp > 0;
  case QUERY_OPERATOR.GREATER_THAN_OR_EQUAL:
    return cmp >= 0;
  default:
    return UNKNOWN;
  }
}

function threeValuedAnd(left, right) {
  if (left === false || right === false) {
    return false;
  }
  if (left === UNKNOWN || right === UNKNOWN) {
    return UNKNOWN;
  }
  return true;
}

function threeValuedOr(left, right) {
  if (left === true || right === true) {
    return true;
  }
  if (left === UNKNOWN || right === UNKNOWN) {
    return UNKNOWN;
  }
  return false;
}

function evaluateBinary(node, row) {
  switch (node.operator) {
  case QUERY_OPERATOR.AND:
    return threeValuedAnd(
      evaluateResidualPredicate(node.left, row),
      evaluateResidualPredicate(node.right, row),
    );
  case RESIDUAL_OPERATOR.OR:
    return threeValuedOr(
      evaluateResidualPredicate(node.left, row),
      evaluateResidualPredicate(node.right, row),
    );
  case RESIDUAL_OPERATOR.IS_NULL:
    return isNullValue(evaluateResidualValue(node.left, row));
  case RESIDUAL_OPERATOR.IS_NOT_NULL:
    return !isNullValue(evaluateResidualValue(node.left, row));
  default:
    return threeValuedComparison(
      node.operator,
      evaluateResidualValue(node.left, row),
      evaluateResidualValue(node.right, row),
      node.left,
      node.right,
    );
  }
}

function evaluateIn(node, row) {
  const value = evaluateResidualValue(node.expression, row);
  if (isNullValue(value)) {
    // NULL IN (...) and NULL NOT IN (...) are both UNKNOWN.
    return UNKNOWN;
  }
  const exprAffinity = resolveOperandComparisonAffinity(node.expression, value);
  let sawNull = false;
  for (const candidate of node.values || []) {
    const candidateValue = evaluateResidualValue(candidate, row);
    if (isNullValue(candidateValue)) {
      sawNull = true;
      continue;
    }
    if (areSqlScalarsEqualWithAffinity(value, candidateValue, exprAffinity, candidate)) {
      return node.negated ? false : true;
    }
  }
  if (sawNull) {
    return UNKNOWN;
  }
  return node.negated ? true : false;
}

function evaluateBetween(node, row) {
  const value = evaluateResidualValue(node.expression, row);
  const low = evaluateResidualValue(node.low, row);
  const high = evaluateResidualValue(node.high, row);
  return threeValuedAnd(
    threeValuedComparison(
      QUERY_OPERATOR.GREATER_THAN_OR_EQUAL,
      value,
      low,
      node.expression,
      node.low,
    ),
    threeValuedComparison(
      QUERY_OPERATOR.LESS_THAN_OR_EQUAL,
      value,
      high,
      node.expression,
      node.high,
    ),
  );
}

function buildLikeRegex(pattern) {
  const escaped = pattern.replace(
    LIKE_REGEX_ESCAPE,
    LIKE_REGEX_ESCAPE_REPLACEMENT,
  );
  const regexPattern = escaped
    .replace(LIKE_ANY_SEQUENCE, LIKE_REGEX_ANY_SEQUENCE)
    .replace(LIKE_ANY_SINGLE, LIKE_REGEX_ANY_SINGLE);
  return new RegExp(`^${regexPattern}$`);
}

function evaluateLike(node, row) {
  const value = evaluateResidualValue(node.expression, row);
  const pattern = evaluateResidualValue(node.pattern, row);
  if (isNullValue(value) || isNullValue(pattern)) {
    return UNKNOWN;
  }
  const matches = buildLikeRegex(String(pattern)).test(String(value));
  return node.negated ? !matches : matches;
}

function evaluateResidualUnaryValue(node, row) {
  const operand = evaluateResidualValue(node.operand, row);
  if (isNullValue(operand)) {
    return null;
  }
  if (node.operator === RESIDUAL_OPERATOR.MINUS) {
    return -operand;
  }
  if (node.operator === RESIDUAL_OPERATOR.PLUS) {
    return +operand;
  }
  return null;
}

function evaluateResidualCastValue(node, row) {
  const inner = evaluateResidualValue(
    node.expr || node.expression || node.operand,
    row,
  );
  if (isNullValue(inner)) {
    return null;
  }
  return applySqlComparisonAffinity(
    inner,
    resolveOperandComparisonAffinity(node, inner),
  );
}

/**
 * Evaluate a scalar sub-expression to a value (or null for SQL NULL).
 * @param {Object} node - Expression AST node.
 * @param {Object} row - Joined row.
 * @return {*} Scalar value or null.
 */
function evaluateResidualValue(node, row) {
  switch (node?.type) {
  case EXPR_TYPE.LITERAL:
    return node.value ?? null;
  case EXPR_TYPE.COLUMN_REF: {
    const value = row[node.column];
    return value === undefined ? null : value;
  }
  case EXPR_TYPE.UNARY:
    return evaluateResidualUnaryValue(node, row);
  case CAST_NODE_TYPE:
    return evaluateResidualCastValue(node, row);
  default:
    return null;
  }
}

/**
 * Evaluate a residual conjunct with SQL three-valued logic.
 * @param {Object} node - Prepared residual conjunct AST.
 * @param {Object} row - Joined row (column refs already resolved to
 *   row keys).
 * @return {(boolean|null)} true / false / UNKNOWN(null).
 */
function evaluateResidualPredicate(node, row) {
  switch (node?.type) {
  case EXPR_TYPE.BINARY:
    return evaluateBinary(node, row);
  case EXPR_TYPE.UNARY:
    if (node.operator === RESIDUAL_OPERATOR.NOT) {
      const operand = evaluateResidualPredicate(node.operand, row);
      return operand === UNKNOWN ? UNKNOWN : !operand;
    }
    return UNKNOWN;
  case EXPR_TYPE.IN:
    return evaluateIn(node, row);
  case EXPR_TYPE.BETWEEN:
    return evaluateBetween(node, row);
  case EXPR_TYPE.LIKE:
    return evaluateLike(node, row);
  case EXPR_TYPE.LITERAL:
    return isNullValue(node.value) ? UNKNOWN : Boolean(node.value);
  default:
    return UNKNOWN;
  }
}

/**
 * SQL WHERE row admission: only a predicate that is exactly TRUE keeps
 * the row; FALSE and UNKNOWN both filter it.
 * @param {Object} node - Prepared residual conjunct AST.
 * @param {Object} row - Joined row.
 * @return {boolean} Row survives.
 */
function residualPredicateAdmitsRow(node, row) {
  return evaluateResidualPredicate(node, row) === true;
}

export {
  SQL_COMPARISON_AFFINITY,
  applySqlComparisonAffinity,
  areSqlScalarsEqualWithAffinity,
  compareSqlScalarsWithAffinity,
  residualPredicateAdmitsRow,
  resolveOperandComparisonAffinity,
};
