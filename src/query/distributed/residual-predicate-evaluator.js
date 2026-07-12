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

function isNullValue(value) {
  return value === null || value === undefined;
}

function threeValuedComparison(operator, left, right) {
  if (isNullValue(left) || isNullValue(right)) {
    return UNKNOWN;
  }
  switch (operator) {
  case QUERY_OPERATOR.EQUALS:
    return left === right;
  case QUERY_OPERATOR.NOT_EQUALS:
  case QUERY_OPERATOR.NOT_EQUALS_ALT:
    return left !== right;
  case QUERY_OPERATOR.LESS_THAN:
    return left < right;
  case QUERY_OPERATOR.LESS_THAN_OR_EQUAL:
    return left <= right;
  case QUERY_OPERATOR.GREATER_THAN:
    return left > right;
  case QUERY_OPERATOR.GREATER_THAN_OR_EQUAL:
    return left >= right;
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
    );
  }
}

function evaluateIn(node, row) {
  const value = evaluateResidualValue(node.expression, row);
  if (isNullValue(value)) {
    // NULL IN (...) and NULL NOT IN (...) are both UNKNOWN.
    return UNKNOWN;
  }
  let sawNull = false;
  for (const candidate of node.values || []) {
    const candidateValue = evaluateResidualValue(candidate, row);
    if (isNullValue(candidateValue)) {
      sawNull = true;
      continue;
    }
    if (candidateValue === value) {
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
    threeValuedComparison(QUERY_OPERATOR.GREATER_THAN_OR_EQUAL, value, low),
    threeValuedComparison(QUERY_OPERATOR.LESS_THAN_OR_EQUAL, value, high),
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
  case EXPR_TYPE.UNARY: {
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

export {residualPredicateAdmitsRow};
