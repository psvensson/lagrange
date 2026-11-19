/**
 * The one SQL renderer: every partition statement and every rendered
 * expression (planner diagnostics, CHECK constraints, join fetches, live
 * queries through the engine) comes from these functions over the parser's
 * AST (design coordinator-sqlite-merge §2.5).
 *
 * Fidelity rules:
 * - A literal is emitted in the storage class it carries (`sqlType`,
 *   parser-constants.js SQL_STORAGE_CLASS); a literal without one is refused,
 *   never guessed from its JS value.
 * - `collate` nodes, LIKE ... ESCAPE, NOT BETWEEN (as NOT over BETWEEN), IN
 *   subqueries, CTE column lists and `t.*` are emitted, never dropped.
 * - Every operator expression is parenthesized (CASE ... END, EXISTS (...)
 *   and calls are self-delimiting), so the rendered precedence is the AST's.
 * - A result column is named as SQLite names it for the statement as written
 *   (resultColumnName): its alias, else the source span of an expression
 *   (the parser's `span`), else the column's own name.
 *
 * @module query/sql-statement-renderer
 */

import {EXPR_TYPE, SQL_STORAGE_CLASS, isBuiltinCollation} from './parser-constants.js';
import {PG_EXPR_TYPE} from './pg/pg-compat-constants.js';
import {QUERY_ERROR_CODE} from './query-constants.js';
import {renderSqliteIdentifier} from './sqlite-identifier.js';

const objectHasOwn = Object.hasOwn;
const TYPEOF_OBJECT = 'object';
const SQLITE_INT64_MIN = -9223372036854775808n;
const SQLITE_INT64_MAX = 9223372036854775807n;

const SQL = Object.freeze({
  SELECT: 'SELECT ',
  DISTINCT: 'DISTINCT ',
  STAR: '*',
  COMMA: ', ',
  SPACE: ' ',
  NULL: 'NULL',
  PARAMETER: '?',
  AS: ' AS ',
  FROM: ' FROM ',
  JOIN: ' JOIN ',
  ON: ' ON ',
  WHERE: ' WHERE ',
  GROUP_BY: ' GROUP BY ',
  HAVING: ' HAVING ',
  ORDER_BY: ' ORDER BY ',
  LIMIT: ' LIMIT ',
  OFFSET: ' OFFSET ',
  WITH: 'WITH ',
  RECURSIVE: 'RECURSIVE ',
  NOT: 'NOT ',
  IN: 'IN',
  BETWEEN: ' BETWEEN ',
  AND: ' AND ',
  LIKE: 'LIKE ',
  ESCAPE: ' ESCAPE ',
  COLLATE: ' COLLATE ',
  CASE: 'CASE',
  WHEN: ' WHEN ',
  THEN: ' THEN ',
  ELSE: ' ELSE ',
  END: ' END',
  EXISTS: 'EXISTS ',
  CAST: 'CAST(',
  QUOTE: '\'',
  ESCAPED_QUOTE: '\'\'',
  DOUBLE_QUOTE: '"',
  ESCAPED_DOUBLE_QUOTE: '""',
  TRUE_INTEGER: '1',
  FALSE_INTEGER: '0',
  REAL_FRACTION: '.0',
  NEGATIVE_ZERO_REAL: '-0.0',
  BLOB_PREFIX: 'X\'',
  HEX_RADIX: 'hex',
  DOT: '.',
  OPEN: '(',
  CLOSE: ')',
});

const NULL_TEST_OPERATORS = new Set(['IS NULL', 'IS NOT NULL']);
const INTEGER_LEXEME = /^[+-]?\d+$/u;
const NUMERIC_LEXEME = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/u;
const RENDER_ERROR_MSG = Object.freeze({
  UNSUPPORTED_EXPRESSION_PREFIX: 'Unsupported expression type: ',
  UNSUPPORTED_COLLATION_PREFIX: 'Unsupported collation sequence: ',
  UNTYPED_LITERAL: 'A literal without a storage class cannot be rendered',
  UNREPRESENTABLE_LITERAL_PREFIX: 'Literal not representable in storage class ',
});

function renderError(message) {
  const error = new Error(message);
  error.code = QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE;
  return error;
}

// A source span as a name: always quoted, since the span is any SQL text
// (a keyword such as NULL or CURRENT_TIME included).
function quoteIdentifier(name) {
  return SQL.DOUBLE_QUOTE + name.replaceAll(SQL.DOUBLE_QUOTE, SQL.ESCAPED_DOUBLE_QUOTE) +
    SQL.DOUBLE_QUOTE;
}

function quoteText(value) {
  return SQL.QUOTE + String(value).replaceAll(SQL.QUOTE, SQL.ESCAPED_QUOTE) + SQL.QUOTE;
}

function renderIntegerLiteral(value) {
  if (typeof value === 'boolean') return value ? SQL.TRUE_INTEGER : SQL.FALSE_INTEGER;
  if (typeof value === 'bigint') {
    if (value >= SQLITE_INT64_MIN && value <= SQLITE_INT64_MAX) return String(value);
    throw renderError(RENDER_ERROR_MSG.UNREPRESENTABLE_LITERAL_PREFIX + SQL_STORAGE_CLASS.INTEGER);
  }
  if (Number.isSafeInteger(value)) return String(value);
  throw renderError(RENDER_ERROR_MSG.UNREPRESENTABLE_LITERAL_PREFIX + SQL_STORAGE_CLASS.INTEGER);
}

// A REAL literal is emitted so SQLite reads it back as REAL: the decimal
// lexeme the parser kept, or a number's shortest round-trip text, with a
// fraction added to an integer-looking form (2 would read back INTEGER).
function renderRealLiteral(value) {
  if (typeof value === 'string' && NUMERIC_LEXEME.test(value)) {
    return INTEGER_LEXEME.test(value) ? value + SQL.REAL_FRACTION : value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (Object.is(value, -0)) return SQL.NEGATIVE_ZERO_REAL;
    const text = String(value);
    return INTEGER_LEXEME.test(text) ? text + SQL.REAL_FRACTION : text;
  }
  throw renderError(RENDER_ERROR_MSG.UNREPRESENTABLE_LITERAL_PREFIX + SQL_STORAGE_CLASS.REAL);
}

function renderBlobLiteral(value) {
  if (!(value instanceof Uint8Array)) {
    throw renderError(RENDER_ERROR_MSG.UNREPRESENTABLE_LITERAL_PREFIX + SQL_STORAGE_CLASS.BLOB);
  }
  const buf = Buffer.isBuffer(value) ?
    value :
    Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  return SQL.BLOB_PREFIX + buf.toString(SQL.HEX_RADIX) + SQL.QUOTE;
}

/**
 * A literal in the storage class it carries.
 * @param {Object} expr - LITERAL node ({value, sqlType}).
 * @return {string}
 */
function renderLiteral(expr) {
  switch (expr.sqlType) {
  case SQL_STORAGE_CLASS.NULL:
    return SQL.NULL;
  case SQL_STORAGE_CLASS.INTEGER:
    return renderIntegerLiteral(expr.value);
  case SQL_STORAGE_CLASS.REAL:
    return renderRealLiteral(expr.value);
  case SQL_STORAGE_CLASS.TEXT:
    return quoteText(expr.value);
  case SQL_STORAGE_CLASS.BLOB:
    return renderBlobLiteral(expr.value);
  default:
    throw renderError(RENDER_ERROR_MSG.UNTYPED_LITERAL);
  }
}

function renderColumnRef(expr) {
  const column = renderSqliteIdentifier(expr.column);
  return expr.table ? renderSqliteIdentifier(expr.table) + SQL.DOT + column : column;
}

function renderStar(expr) {
  return expr.table ? renderSqliteIdentifier(expr.table) + SQL.DOT + SQL.STAR : SQL.STAR;
}

function parenthesize(text) {
  return SQL.OPEN + text + SQL.CLOSE;
}

function renderList(expressions) {
  return expressions.map((entry) => renderExpression(entry)).join(SQL.COMMA);
}

function renderBinary(expr) {
  const left = renderExpression(expr.left);
  if (NULL_TEST_OPERATORS.has(expr.operator)) {
    return parenthesize(left + SQL.SPACE + expr.operator);
  }
  return parenthesize(left + SQL.SPACE + expr.operator + SQL.SPACE +
    renderExpression(expr.right));
}

function renderIn(expr) {
  const lhs = renderExpression(expr.expression);
  const operator = (expr.negated ? SQL.NOT : '') + SQL.IN;
  const members = expr.subquery ? renderSelect(expr.subquery.query) : renderList(expr.values);
  return parenthesize(lhs + SQL.SPACE + operator + SQL.SPACE +
    parenthesize(members));
}

function renderLike(expr) {
  const lhs = renderExpression(expr.expression);
  const operator = (expr.negated ? SQL.NOT : '') + SQL.LIKE;
  const pattern = renderExpression(expr.pattern);
  const escape = expr.escape ? SQL.ESCAPE + renderExpression(expr.escape) : '';
  return parenthesize(lhs + SQL.SPACE + operator + pattern + escape);
}

function renderAggregate(expr) {
  const distinct = expr.distinct ? SQL.DISTINCT : '';
  return expr.function + parenthesize(distinct + renderExpression(expr.argument));
}

function renderCase(expr) {
  let sql = SQL.CASE;
  if (expr.operand) sql += SQL.SPACE + renderExpression(expr.operand);
  for (const condition of expr.conditions) {
    sql += SQL.WHEN + renderExpression(condition.when) +
      SQL.THEN + renderExpression(condition.thenExpression);
  }
  if (expr.elseExpr) sql += SQL.ELSE + renderExpression(expr.elseExpr);
  return sql + SQL.END;
}

// A keyword function (CURRENT_TIME, CURRENT_DATE, CURRENT_TIMESTAMP) is
// written without an argument list, as SQLite spells it.
function renderFunctionCall(expr) {
  if (expr.keyword === true) return expr.name;
  return expr.name + parenthesize(renderList(expr.args || []));
}

// Node types outside the core expression set: CASE, CAST, subqueries and
// function calls (parser-constants.js PG_EXPR_TYPE shares them with the
// PostgreSQL translation).
function renderStructuredExpression(expr) {
  switch (expr.type) {
  case PG_EXPR_TYPE.CAST:
    return SQL.CAST + renderExpression(expr.expression) + SQL.AS + expr.targetType + SQL.CLOSE;
  case PG_EXPR_TYPE.CASE:
    return renderCase(expr);
  case PG_EXPR_TYPE.SUBQUERY:
    return parenthesize(renderSelect(expr.query));
  case PG_EXPR_TYPE.EXISTS:
    return SQL.EXISTS + parenthesize(renderSelect(expr.query));
  case PG_EXPR_TYPE.FUNCTION_CALL:
    return renderFunctionCall(expr);
  default:
    throw renderError(RENDER_ERROR_MSG.UNSUPPORTED_EXPRESSION_PREFIX + expr.type);
  }
}

function renderCollate(expr) {
  if (!isBuiltinCollation(expr.collation)) {
    throw renderError(RENDER_ERROR_MSG.UNSUPPORTED_COLLATION_PREFIX + String(expr.collation));
  }
  return parenthesize(renderExpression(expr.expression) + SQL.COLLATE + expr.collation);
}

let activeParameterSink = null;

function renderParameter(expr) {
  if (activeParameterSink !== null) {
    activeParameterSink(expr);
  }
  return SQL.PARAMETER;
}

const EXPRESSION_RENDERERS = Object.freeze(Object.assign(Object.create(null), {
  [EXPR_TYPE.STAR]: renderStar,
  [EXPR_TYPE.LITERAL]: renderLiteral,
  [EXPR_TYPE.PARAMETER]: renderParameter,
  [EXPR_TYPE.COLUMN_REF]: renderColumnRef,
  [EXPR_TYPE.BINARY]: renderBinary,
  [EXPR_TYPE.UNARY]: (expr) =>
    parenthesize(expr.operator + SQL.SPACE + renderExpression(expr.operand)),
  [EXPR_TYPE.AGGREGATE]: renderAggregate,
  [EXPR_TYPE.IN]: renderIn,
  [EXPR_TYPE.BETWEEN]: (expr) => parenthesize(
    renderExpression(expr.expression) + SQL.BETWEEN +
    renderExpression(expr.low) + SQL.AND + renderExpression(expr.high),
  ),
  [EXPR_TYPE.LIKE]: renderLike,
  [EXPR_TYPE.COLLATE]: renderCollate,
}));

/**
 * Render one expression node.
 * @param {Object} expr - Expression AST node.
 * @return {string} SQL text.
 */
function renderExpression(expr) {
  if (expr !== null && typeof expr === TYPEOF_OBJECT &&
      objectHasOwn(EXPRESSION_RENDERERS, expr.type)) {
    return EXPRESSION_RENDERERS[expr.type](expr);
  }
  return renderStructuredExpression(expr ?? {type: String(expr)});
}

/**
 * Render one expression node and collect its bound parameter values in exact
 * placeholder emission order through the canonical renderer.
 * @param {Object} expr - Expression AST node.
 * @param {Function} resolveParameter - Maps each PARAMETER AST node to its bound value.
 * @return {{sql: string, params: Array}}
 */
function renderExpressionWithParameters(expr, resolveParameter) {
  const bound = [];
  const previousSink = activeParameterSink;
  activeParameterSink = (paramExpr) => {
    bound.push(resolveParameter(paramExpr));
  };
  try {
    return {sql: renderExpression(expr), params: bound};
  } finally {
    activeParameterSink = previousSink;
  }
}

/**
 * The name SQLite gives a result column of the statement as written: its
 * alias; else, for a bare column reference, the column; else the source text
 * of the expression (the parser's `span`, SQLite dialect); else the rendered
 * expression, which is the text SQLite names it by when the AST has no source.
 * @param {Object} col - Select-list column node.
 * @return {string}
 */
function resultColumnName(col) {
  if (col.alias) return col.alias;
  const expr = col.expression;
  if (expr.type === EXPR_TYPE.COLUMN_REF) return expr.column;
  return col.span ?? renderExpression(expr);
}

/**
 * Render one select-list column, named as SQLite names it for the statement
 * as written (resultColumnName).
 * @param {Object} col - Select-list column node (or a STAR node).
 * @return {string}
 */
function renderResultColumn(col) {
  if (col.type === EXPR_TYPE.STAR) return renderStar(col);
  const sql = renderExpression(col.expression);
  if (col.alias) return sql + SQL.AS + renderSqliteIdentifier(col.alias);
  if (col.expression.type !== EXPR_TYPE.COLUMN_REF && typeof col.span === 'string') {
    return sql + SQL.AS + quoteIdentifier(col.span);
  }
  return sql;
}

function renderLimitTerm(term) {
  return typeof term === 'number' ? String(term) : renderExpression(term);
}

// LIMIT [OFFSET]. Placeholders bind by position, so when the offset's
// parameter precedes the count's (SQLite's `LIMIT m, n`), the comma form
// keeps them in that order.
function renderLimit(limit) {
  const {count, offset} = limit;
  if (offset === null || offset === undefined) {
    return SQL.LIMIT + renderLimitTerm(count);
  }
  const offsetFirst = offset?.type === EXPR_TYPE.PARAMETER &&
    count?.type === EXPR_TYPE.PARAMETER && offset.index < count.index;
  return offsetFirst ?
    SQL.LIMIT + renderLimitTerm(offset) + SQL.COMMA + renderLimitTerm(count) :
    SQL.LIMIT + renderLimitTerm(count) + SQL.OFFSET + renderLimitTerm(offset);
}

function renderTableSource(source) {
  const table = source.subquery ? parenthesize(renderSelect(source.subquery)) :
    renderSqliteIdentifier(source.name);
  return source.alias ? table + SQL.AS + renderSqliteIdentifier(source.alias) : table;
}

function renderCtes(ast) {
  const definitions = ast.ctes.map((cte) => {
    const columns = Array.isArray(cte.columns) && cte.columns.length > 0 ?
      parenthesize(cte.columns.map(renderSqliteIdentifier).join(SQL.COMMA)) : '';
    return renderSqliteIdentifier(cte.name) + columns + SQL.AS +
      parenthesize(renderSelect(cte.query));
  });
  return SQL.WITH + (ast.recursive ? SQL.RECURSIVE : '') + definitions.join(SQL.COMMA) +
    SQL.SPACE;
}

function renderSelectClauses(ast) {
  let sql = '';
  for (const join of ast.joins || []) {
    sql += SQL.SPACE + join.joinType + SQL.JOIN + renderTableSource(join.table) +
      SQL.ON + renderExpression(join.condition);
  }
  if (ast.where) sql += SQL.WHERE + renderExpression(ast.where);
  if (ast.groupBy) sql += SQL.GROUP_BY + renderList(ast.groupBy);
  if (ast.having) sql += SQL.HAVING + renderExpression(ast.having);
  if (ast.orderBy) {
    sql += SQL.ORDER_BY + ast.orderBy.map((term) =>
      renderExpression(term.expression) + SQL.SPACE + term.direction).join(SQL.COMMA);
  }
  if (ast.limit) {
    sql += renderLimit(ast.limit);
  }
  return sql;
}

/**
 * Render a SELECT statement (CTEs, compound arms and every clause).
 * @param {Object} ast - SELECT AST.
 * @return {string} SQL text.
 */
function renderSelect(ast) {
  const prefix = ast.ctes && ast.ctes.length > 0 ? renderCtes(ast) : '';
  let sql = prefix + SQL.SELECT + (ast.distinct ? SQL.DISTINCT : '') +
    ast.columns.map(renderResultColumn).join(SQL.COMMA);
  if (ast.from) sql += SQL.FROM + renderTableSource(ast.from);
  sql += renderSelectClauses(ast);
  if (ast.setOperation) {
    sql += SQL.SPACE + ast.setOperation.type + SQL.SPACE +
      renderSelect(ast.setOperation.right);
  }
  return sql;
}

/**
 * Render a SELECT statement and collect its bound parameter values in exact
 * placeholder emission order through the canonical renderer.
 * @param {Object} ast - SELECT AST.
 * @param {Function} resolveParameter - Maps each PARAMETER AST node to its bound value.
 * @return {{sql: string, params: Array}}
 */
function renderSelectWithParameters(ast, resolveParameter) {
  const bound = [];
  const previousSink = activeParameterSink;
  activeParameterSink = (paramExpr) => {
    bound.push(resolveParameter(paramExpr));
  };
  try {
    return {sql: renderSelect(ast), params: bound};
  } finally {
    activeParameterSink = previousSink;
  }
}

export {
  renderExpression,
  renderExpressionWithParameters,
  renderLiteral,
  renderResultColumn,
  renderSelect,
  renderSelectWithParameters,
  resultColumnName,
};
