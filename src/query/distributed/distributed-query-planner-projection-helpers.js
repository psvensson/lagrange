import {
  QUERY_AST_NODE,
  QUERY_OPERATOR,
} from '../query-constants.js';

function checkInExpressionAlias(expr, tableAlias) {
  if (!expressionReferencesAlias(expr.expression, tableAlias)) {
    return false;
  }
  return (expr.values || []).every((valueExpr) => expressionReferencesAlias(valueExpr, tableAlias));
}

function checkRangeOrPatternAlias(expr, tableAlias) {
  if (expr.type === QUERY_AST_NODE.BETWEEN) {
    return expressionReferencesAlias(expr.expression, tableAlias) &&
      expressionReferencesAlias(expr.low, tableAlias) &&
      expressionReferencesAlias(expr.high, tableAlias);
  }
  if (expr.type === QUERY_AST_NODE.LIKE) {
    return expressionReferencesAlias(expr.expression, tableAlias) &&
      expressionReferencesAlias(expr.pattern, tableAlias);
  }
  return true;
}

/**
 * Check whether expression references only a target table alias.
 * @param {Object} expr - Expression AST.
 * @param {string} tableAlias - Target table alias.
 * @return {boolean} True when local to target alias.
 */
function expressionReferencesAlias(expr, tableAlias) {
  if (!expr || typeof expr !== 'object') {
    return true;
  }
  switch (expr.type) {
  case QUERY_AST_NODE.COLUMN_REF:
    return !expr.table || String(expr.table).toLowerCase() === String(tableAlias).toLowerCase();
  case QUERY_AST_NODE.BINARY:
    return expressionReferencesAlias(expr.left, tableAlias) &&
      expressionReferencesAlias(expr.right, tableAlias);
  case QUERY_AST_NODE.UNARY:
    return expressionReferencesAlias(expr.operand, tableAlias);
  case QUERY_AST_NODE.IN:
    return checkInExpressionAlias(expr, tableAlias);
  case QUERY_AST_NODE.BETWEEN:
  case QUERY_AST_NODE.LIKE:
    return checkRangeOrPatternAlias(expr, tableAlias);
  default:
    return true;
  }
}

function extractConjunctiveLocalPredicate(expr, tableAlias) {
  const left = extractTableLocalPredicate(expr.left, tableAlias);
  const right = extractTableLocalPredicate(expr.right, tableAlias);
  if (left && right) {
    return {
      ...expr,
      left,
      right,
    };
  }
  return left || right || null;
}

function extractDisjunctiveLocalPredicate(expr, tableAlias) {
  const left = extractTableLocalPredicate(expr.left, tableAlias);
  const right = extractTableLocalPredicate(expr.right, tableAlias);
  if (left && right) {
    return {
      ...expr,
      left,
      right,
    };
  }
  return null;
}

/**
 * Extract table-local predicate expression from WHERE clause.
 * @param {Object|null} expr - WHERE expression.
 * @param {string} tableAlias - Target table alias.
 * @return {Object|null} Local predicate AST or null.
 */
function extractTableLocalPredicate(expr, tableAlias) {
  if (!expr) {
    return null;
  }
  if (expr.type === QUERY_AST_NODE.BINARY) {
    if (expr.operator === QUERY_OPERATOR.AND) {
      return extractConjunctiveLocalPredicate(expr, tableAlias);
    }
    if (expr.operator === QUERY_OPERATOR.OR) {
      return extractDisjunctiveLocalPredicate(expr, tableAlias);
    }
  }
  return expressionReferencesAlias(expr, tableAlias) ? expr : null;
}

function collectColumnRef(expr, tableAlias, out) {
  if (!expr.table ||
    String(expr.table).toLowerCase() === String(tableAlias).toLowerCase()) {
    if (expr.column) {
      out.add(expr.column);
    }
  }
}

/**
 * Collect column refs for a table alias from an expression.
 * @param {Object} expr - Expression AST.
 * @param {string} tableAlias - Table alias.
 * @param {Set<string>} out - Output column set.
 */
function collectProjectedColumns(expr, tableAlias, out) {
  if (!expr || typeof expr !== 'object') {
    return;
  }
  switch (expr.type) {
  case QUERY_AST_NODE.COLUMN_REF:
    collectColumnRef(expr, tableAlias, out);
    break;
  case QUERY_AST_NODE.BINARY:
    collectProjectedColumns(expr.left, tableAlias, out);
    collectProjectedColumns(expr.right, tableAlias, out);
    break;
  case QUERY_AST_NODE.UNARY:
    collectProjectedColumns(expr.operand, tableAlias, out);
    break;
  case QUERY_AST_NODE.IN:
    collectProjectedColumns(expr.expression, tableAlias, out);
    for (const valueExpr of expr.values || []) {
      collectProjectedColumns(valueExpr, tableAlias, out);
    }
    break;
  case QUERY_AST_NODE.BETWEEN:
    collectProjectedColumns(expr.expression, tableAlias, out);
    collectProjectedColumns(expr.low, tableAlias, out);
    collectProjectedColumns(expr.high, tableAlias, out);
    break;
  case QUERY_AST_NODE.AGGREGATE:
    collectProjectedColumns(expr.argument, tableAlias, out);
    break;
  default:
    break;
  }
}

/**
 * Compute projected columns for a table alias.
 * @param {Object|null} ast - SELECT AST.
 * @param {string} tableAlias - Table alias.
 * @return {string[]|null} Projected columns or null for wildcard.
 */
function extractProjectedColumns(ast, tableAlias) {
  if (!ast || !Array.isArray(ast.columns)) {
    return null;
  }
  if (ast.columns.some((column) =>
    (column.type === QUERY_AST_NODE.STAR) ||
    (column.expression && column.expression.type === QUERY_AST_NODE.STAR))) {
    return null;
  }

  const projected = new Set();
  for (const column of ast.columns) {
    const expr = column.expression || column;
    collectProjectedColumns(expr, tableAlias, projected);
  }
  for (const join of ast.joins || []) {
    collectProjectedColumns(join.condition, tableAlias, projected);
  }
  if (projected.size === 0) {
    return null;
  }
  return Array.from(projected.values());
}

export {
  collectProjectedColumns,
  expressionReferencesAlias,
  extractProjectedColumns,
  extractTableLocalPredicate,
};
