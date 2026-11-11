/**
 * Live query SQL helpers: parse LIVE SELECT statements, extract partition
 * keys and compile predicates.
 * Requirements: 33.1, 33.4, 33.16
 */

import {
  LIVE_QUERY_AST_TYPE,
  LIVE_QUERY_DEFAULT_VALUE,
  LIVE_QUERY_ERROR_MSG,
  LIVE_QUERY_OPERATOR,
  LIVE_QUERY_REGEX,
  LIVE_QUERY_REGEX_FLAG,
  LIVE_QUERY_REGEX_REPLACE,
  LIVE_QUERY_SQL,
} from './live-query-constants.js';

const LOCAL_STR_OBJECT = 'object';
const OP_IS = 'IS';
const OP_IS_NOT = 'IS NOT';

const BINARY_COMPARATORS = Object.freeze({
  [LIVE_QUERY_OPERATOR.EQUALS]: (l, r) => l === r,
  [LIVE_QUERY_OPERATOR.NOT_EQUALS]: (l, r) => l !== r,
  [LIVE_QUERY_OPERATOR.NOT_EQUALS_ALT]: (l, r) => l !== r,
  [LIVE_QUERY_OPERATOR.LESS_THAN]: (l, r) => l < r,
  [LIVE_QUERY_OPERATOR.LESS_THAN_OR_EQUAL]: (l, r) => l <= r,
  [LIVE_QUERY_OPERATOR.GREATER_THAN]: (l, r) => l > r,
  [LIVE_QUERY_OPERATOR.GREATER_THAN_OR_EQUAL]: (l, r) => l >= r,
});

/**
 * Compiles a WHERE clause AST into an efficient evaluation function.
 * @param {Object} whereClause - Parsed WHERE clause AST.
 * @param {Array} [params] - Bound query parameters.
 * @return {Function} Predicate function that takes a row and returns boolean.
 */
function compilePredicate(whereClause, params = []) {
  if (!whereClause) {
    // No WHERE clause - match all rows
    return () => true;
  }

  return (row) => Boolean(evaluateExpression(whereClause, row, params));
}

/**
 * Resolve parameter value from bound parameters array or object.
 * @param {Object} expr - Parameter expression AST.
 * @param {Array|Object} params - Bound parameters.
 * @return {*} Parameter value.
 */
function resolveParameterValue(expr, params = []) {
  if (expr.index !== undefined && expr.index !== null) {
    const idx = typeof expr.index === 'number' ? expr.index - 1 : 0;
    return params[idx] !== undefined ? params[idx] : null;
  }
  if (typeof expr.value === 'number') {
    return params[expr.value - 1] !== undefined ?
      params[expr.value - 1] :
      (params[expr.value] ?? null);
  }
  if (typeof expr.name === 'string') {
    return params[expr.name] !== undefined ? params[expr.name] : null;
  }
  return null;
}

const EXPR_HANDLERS = {
  [LIVE_QUERY_AST_TYPE.BINARY]: (e, r, p) => evaluateBinaryExpression(e, r, p),
  [LIVE_QUERY_AST_TYPE.UNARY]: (e, r, p) => evaluateUnaryExpression(e, r, p),
  [LIVE_QUERY_AST_TYPE.LITERAL]: (e) => e.value,
  [LIVE_QUERY_AST_TYPE.COLUMN_REF]: (e, r) => getColumnValue(e, r),
  [LIVE_QUERY_AST_TYPE.IN]: (e, r, p) => evaluateInExpression(e, r, p),
  [LIVE_QUERY_AST_TYPE.BETWEEN]: (e, r, p) => evaluateBetweenExpression(e, r, p),
  [LIVE_QUERY_AST_TYPE.LIKE]: (e, r, p) => evaluateLikeExpression(e, r, p),
  parameter: (e, _r, p) => resolveParameterValue(e, p),
  param: (e, _r, p) => resolveParameterValue(e, p),
  null: () => null,
  is_null: (e, r, p) => evaluateExpression(e.expression || e.operand || e.left, r, p) == null,
  is_not_null: (e, r, p) => evaluateExpression(e.expression || e.operand || e.left, r, p) != null,
};

/**
 * Evaluate an expression against a row with fail-closed semantics.
 * @param {Object} expr - Expression AST node.
 * @param {Object} row - Row data to evaluate against.
 * @param {Array|Object} [params] - Bound query parameters.
 * @return {*} Evaluation result.
 */
function evaluateExpression(expr, row, params = []) {
  if (!expr) return true;
  const handler = EXPR_HANDLERS[expr.type];
  return handler ? handler(expr, row, params) : false;
}

function evaluateNullComparison(opUpper, leftVal, rightVal) {
  if (opUpper === LIVE_QUERY_OPERATOR.IS_NULL) {
    return leftVal == null;
  }
  if (opUpper === LIVE_QUERY_OPERATOR.IS_NOT_NULL) {
    return leftVal != null;
  }
  if (opUpper === OP_IS) {
    return rightVal === null ? leftVal == null : leftVal === rightVal;
  }
  if (opUpper === OP_IS_NOT) {
    return rightVal === null ? leftVal != null : leftVal !== rightVal;
  }
  return null;
}

/**
 * Evaluate a binary expression with fail-closed semantics.
 * @param {Object} expr - Binary expression AST.
 * @param {Object} row - Row data.
 * @param {Array|Object} [params] - Bound parameters.
 * @return {*} Evaluation result.
 */
function evaluateBinaryExpression(expr, row, params = []) {
  const {operator, left, right} = expr;
  const opUpper = String(operator || '').toUpperCase();

  if (opUpper === LIVE_QUERY_OPERATOR.AND) {
    return Boolean(evaluateExpression(left, row, params) && evaluateExpression(right, row, params));
  }
  if (opUpper === LIVE_QUERY_OPERATOR.OR) {
    return Boolean(evaluateExpression(left, row, params) || evaluateExpression(right, row, params));
  }

  const leftVal = evaluateExpression(left, row, params);
  const rightVal = evaluateExpression(right, row, params);
  const nullResult = evaluateNullComparison(opUpper, leftVal, rightVal);
  if (nullResult !== null) {
    return nullResult;
  }

  const comparator = BINARY_COMPARATORS[operator];
  return comparator ? comparator(leftVal, rightVal) : false;
}

/**
 * Evaluate a unary expression.
 * @param {Object} expr - Unary expression AST.
 * @param {Object} row - Row data.
 * @param {Array|Object} [params] - Bound parameters.
 * @return {*} Evaluation result.
 */
function evaluateUnaryExpression(expr, row, params = []) {
  const {operator, operand} = expr;

  switch (operator) {
  case LIVE_QUERY_OPERATOR.NOT:
    return !evaluateExpression(operand, row, params);

  default:
    return false;
  }
}

/**
 * Get column value from row.
 * @param {Object} expr - Column reference expression.
 * @param {Object} row - Row data.
 * @return {*} Column value.
 */
function getColumnValue(expr, row) {
  const column = expr.column || expr.name;
  if (!column) return undefined;

  // Handle qualified column names (table.column)
  if (expr.table && row[expr.table]) {
    return row[expr.table][column];
  }

  return row[column];
}

/**
 * Evaluate IN expression.
 * @param {Object} expr - IN expression AST.
 * @param {Object} row - Row data.
 * @param {Array|Object} [params] - Bound parameters.
 * @return {boolean} True if value is in list.
 */
function evaluateInExpression(expr, row, params = []) {
  const value = evaluateExpression(expr.expression, row, params);
  if (value === null || value === undefined || !Array.isArray(expr.values)) {
    return false;
  }
  const values = expr.values.map((v) => evaluateExpression(v, row, params));
  return values.includes(value);
}

/**
 * Evaluate BETWEEN expression.
 * @param {Object} expr - BETWEEN expression AST.
 * @param {Object} row - Row data.
 * @param {Array|Object} [params] - Bound parameters.
 * @return {boolean} True if value is between low and high.
 */
function evaluateBetweenExpression(expr, row, params = []) {
  const value = evaluateExpression(expr.expression, row, params);
  const low = evaluateExpression(expr.low, row, params);
  const high = evaluateExpression(expr.high, row, params);
  if (value === null || value === undefined || low === null || high === null) {
    return false;
  }
  return value >= low && value <= high;
}

/**
 * Evaluate LIKE expression.
 * @param {Object} expr - LIKE expression AST.
 * @param {Object} row - Row data.
 * @param {Array|Object} [params] - Bound parameters.
 * @return {boolean} True if value matches pattern.
 */
function evaluateLikeExpression(expr, row, params = []) {
  const value = evaluateExpression(expr.expression, row, params);
  const pattern = evaluateExpression(expr.pattern, row, params);

  if (typeof value !== 'string' || typeof pattern !== 'string') {
    return false;
  }

  // Convert SQL LIKE pattern to regex
  const regexPattern = pattern
    .replace(LIVE_QUERY_REGEX.REGEX_SPECIAL, LIVE_QUERY_REGEX_REPLACE.ESCAPE)
    .replace(LIVE_QUERY_REGEX.PERCENT, LIVE_QUERY_REGEX_REPLACE.WILDCARD)
    .replace(LIVE_QUERY_REGEX.UNDERSCORE, LIVE_QUERY_REGEX_REPLACE.SINGLE_CHAR);

  const regex = new RegExp(`^${regexPattern}$`, LIVE_QUERY_REGEX_FLAG.CASE_INSENSITIVE);
  return regex.test(value);
}

/**
 * Extract partition key value from WHERE clause.
 * @param {Object} whereClause - Parsed WHERE clause AST.
 * @param {string} partitionKeyColumn - Name of the partition key column.
 * @return {*} Partition key value or null if not found.
 */
function extractPartitionKeyValue(whereClause, partitionKeyColumn) {
  if (!whereClause || !partitionKeyColumn) {
    return null;
  }

  return findPartitionKeyValue(whereClause, partitionKeyColumn.toLowerCase());
}

/**
 * Recursively find partition key equality value in expression.
 * @param {Object} expr - Expression AST.
 * @param {string} keyColumn - Partition key column name (lowercase).
 * @return {*} Key value or null.
 */
function findPartitionKeyValue(expr, keyColumn) {
  if (!expr) return null;

  switch (expr.type) {
  case LIVE_QUERY_AST_TYPE.BINARY: {
    const {operator, left, right} = expr;

    // Handle AND - check both sides
    if (operator === LIVE_QUERY_OPERATOR.AND) {
      const leftValue = findPartitionKeyValue(left, keyColumn);
      if (leftValue !== null) return leftValue;
      return findPartitionKeyValue(right, keyColumn);
    }

    // Handle equality on partition key
    if (operator === LIVE_QUERY_OPERATOR.EQUALS) {
      if (isPartitionKeyColumn(left, keyColumn) &&
          right.type === LIVE_QUERY_AST_TYPE.LITERAL) {
        return right.value;
      }
      if (isPartitionKeyColumn(right, keyColumn) &&
          left.type === LIVE_QUERY_AST_TYPE.LITERAL) {
        return left.value;
      }
    }
    break;
  }

  case LIVE_QUERY_AST_TYPE.IN: {
    // For IN clause, return array of values
    if (isPartitionKeyColumn(expr.expression, keyColumn)) {
      return expr.values
        .filter((v) => v.type === LIVE_QUERY_AST_TYPE.LITERAL)
        .map((v) => v.value);
    }
    break;
  }
  }

  return null;
}

/**
 * Check if expression is a reference to the partition key column.
 * @param {Object} expr - Expression AST.
 * @param {string} keyColumn - Partition key column name (lowercase).
 * @return {boolean} True if partition key column.
 */
function isPartitionKeyColumn(expr, keyColumn) {
  if (!expr || expr.type !== LIVE_QUERY_AST_TYPE.COLUMN_REF) return false;
  const column = (expr.column || expr.name || '').toLowerCase();
  return column === keyColumn;
}

/**
 * Canonicalize a predicate for grouping identical queries.
 * @param {Object} whereClause - Parsed WHERE clause AST.
 * @return {string} Canonical string representation.
 */
function canonicalizePredicate(whereClause) {
  if (!whereClause) return LIVE_QUERY_DEFAULT_VALUE.EMPTY_WHERE;
  return JSON.stringify(sortObject(whereClause));
}

/**
 * Sort object keys recursively for consistent serialization.
 * @param {*} obj - Object to sort.
 * @return {*} Sorted object.
 */
function sortObject(obj) {
  if (obj === null || typeof obj !== LOCAL_STR_OBJECT) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sortObject);
  }

  const sorted = {};
  const keys = Object.keys(obj).sort();
  for (const key of keys) {
    sorted[key] = sortObject(obj[key]);
  }
  return sorted;
}

/**
 * Parse a LIVE SELECT statement.
 * @param {string} sql - SQL string starting with LIVE SELECT.
 * @return {Object} Parsed query with isLive flag.
 */
function parseLiveSelect(sql) {
  if (!sql || typeof sql !== 'string') {
    throw new Error(LIVE_QUERY_ERROR_MSG.INVALID_SQL);
  }

  const trimmed = sql.trim();
  const upperSql = trimmed.toUpperCase();

  // Check for LIVE prefix
  if (!upperSql.startsWith(LIVE_QUERY_SQL.LIVE_PREFIX)) {
    return {isLive: false, sql: trimmed};
  }

  // Remove LIVE prefix and return the SELECT statement
  const selectSql = trimmed.substring(LIVE_QUERY_SQL.LIVE_PREFIX.length).trim();

  if (!selectSql.toUpperCase().startsWith(LIVE_QUERY_SQL.SELECT_PREFIX)) {
    throw new Error(LIVE_QUERY_ERROR_MSG.LIVE_REQUIRES_SELECT);
  }

  return {
    isLive: true,
    sql: selectSql,
  };
}

const COMPLEX_NODE_TYPES = new Set([
  'function', 'aggr_func', 'aggregate', 'subquery', 'case', 'cast',
]);

const CHILD_NODE_KEYS = ['left', 'right', 'operand', 'expression', 'low', 'high'];

/**
 * Check whether a WHERE AST node contains complex / non-in-memory expressions.
 * @param {Object} node - AST node.
 * @return {boolean} True if complex.
 */
function isComplexWhereNode(node) {
  if (!node || typeof node !== 'object') {
    return false;
  }
  const type = String(node.type || '').toLowerCase();
  if (COMPLEX_NODE_TYPES.has(type)) {
    return true;
  }
  for (const key of CHILD_NODE_KEYS) {
    if (node[key] && isComplexWhereNode(node[key])) return true;
  }
  if (Array.isArray(node.values) && node.values.some(isComplexWhereNode)) return true;
  if (Array.isArray(node.args) && node.args.some(isComplexWhereNode)) return true;
  return false;
}

const evaluateWhereExpression = evaluateExpression;

export {
  compilePredicate,
  extractPartitionKeyValue,
  canonicalizePredicate,
  parseLiveSelect,
  evaluateExpression,
  evaluateWhereExpression,
  isComplexWhereNode,
  sortObject,
};
