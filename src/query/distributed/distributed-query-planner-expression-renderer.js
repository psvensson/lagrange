import {
  QUERY_AST_NODE,
} from '../query-constants.js';

const LOCAL_STR_NULL = 'NULL';
const LOCAL_STR_SQUOTE_SQUOTE = '\'\'';
const LOCAL_STR_QUESTION = '?';

/**
 * Render a planner expression to SQL for fragment diagnostics.
 * @param {Object} expr - Expression AST.
 * @return {string} SQL expression.
 */
function renderPlannerExpression(expr) {
  if (!expr || typeof expr !== 'object') {
    return '';
  }

  if (expr.type === QUERY_AST_NODE.LITERAL) {
    if (expr.value === null) {
      return LOCAL_STR_NULL;
    }
    if (typeof expr.value === 'string') {
      return `'${expr.value.replace(/'/g, LOCAL_STR_SQUOTE_SQUOTE)}'`;
    }
    return String(expr.value);
  }

  if (expr.type === QUERY_AST_NODE.PARAMETER) {
    return LOCAL_STR_QUESTION;
  }

  if (expr.type === QUERY_AST_NODE.COLUMN_REF) {
    if (expr.table) {
      return `${expr.table}.${expr.column}`;
    }
    return expr.column;
  }

  if (expr.type === QUERY_AST_NODE.UNARY) {
    return `${expr.operator} ${renderPlannerExpression(expr.operand)}`;
  }

  if (expr.type === QUERY_AST_NODE.BINARY) {
    return `${renderPlannerExpression(expr.left)} ` +
      `${expr.operator} ` +
      `${renderPlannerExpression(expr.right)}`;
  }

  if (expr.type === QUERY_AST_NODE.IN) {
    const values = (expr.values || [])
      .map((valueExpr) => renderPlannerExpression(valueExpr))
      .join(', ');
    return `${renderPlannerExpression(expr.expression)} IN (${values})`;
  }

  if (expr.type === QUERY_AST_NODE.BETWEEN) {
    return `${renderPlannerExpression(expr.expression)} BETWEEN ` +
      `${renderPlannerExpression(expr.low)} AND ` +
      `${renderPlannerExpression(expr.high)}`;
  }

  if (expr.type === QUERY_AST_NODE.LIKE) {
    return `${renderPlannerExpression(expr.expression)} LIKE ` +
      `${renderPlannerExpression(expr.pattern)}`;
  }

  return '';
}

export {renderPlannerExpression};
