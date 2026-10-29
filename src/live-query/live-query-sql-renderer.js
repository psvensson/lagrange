/**
 * Live Query SQL Renderer and AST Inspector.
 *
 * Reconstructs standard SQL queries from parsed ASTs (including WHERE,
 * JOIN, GROUP BY, ORDER BY, LIMIT, and OFFSET), and inspects query complexity
 * to classify queries into Tier 1 (incremental deltas) vs Tier 2 (re-execution).
 */

import {
  LIVE_QUERY_AST_TYPE,
  LIVE_QUERY_OPERATOR,
  LIVE_QUERY_SQL,
} from './live-query-constants.js';

const COMMA_SPACE = ', ';
const SPACE = ' ';
const LOCAL_STR_ONE = '1';
const LOCAL_STR_ZERO = '0';
const LOCAL_STR_NORMAL = 'NORMAL';
const AGGREGATE_FUNCTIONS = new Set([
  'COUNT',
  'SUM',
  'AVG',
  'MIN',
  'MAX',
  'GROUP_CONCAT',
  'TOTAL',
]);

function resolveTableName(target) {
  if (!target) {
    return null;
  }
  if (typeof target === 'string') {
    return target;
  }
  return target.name || target.table || null;
}

function extractPrimaryTable(parsedQuery) {
  const fromTarget = resolveTableName(parsedQuery.from);
  if (fromTarget) {
    return fromTarget;
  }
  return typeof parsedQuery.table === 'string' ? parsedQuery.table : null;
}

/**
 * Extract all referenced table names from a parsed query AST.
 * @param {Object} parsedQuery - Parsed query AST.
 * @return {string[]} Array of table names.
 */
function extractReferencedTables(parsedQuery) {
  if (!parsedQuery) {
    return [];
  }

  const tables = new Set();
  const primaryTable = extractPrimaryTable(parsedQuery);
  if (primaryTable) {
    tables.add(primaryTable);
  }

  if (Array.isArray(parsedQuery.joins)) {
    for (const join of parsedQuery.joins) {
      const joinTable = resolveTableName(join?.table);
      if (joinTable) {
        tables.add(joinTable);
      }
    }
  }

  return Array.from(tables);
}

function isAggregateExpression(expr) {
  if (!expr) {
    return false;
  }
  const isFuncType =
    expr.type === LIVE_QUERY_AST_TYPE.AGGR_FUNC ||
    expr.type === LIVE_QUERY_AST_TYPE.AGGREGATE ||
    expr.type === LIVE_QUERY_AST_TYPE.FUNCTION;
  if (!isFuncType) {
    return false;
  }
  const fnName = String(expr.name || expr.func || '').toUpperCase();
  return AGGREGATE_FUNCTIONS.has(fnName);
}

function hasAggregateColumn(columns) {
  if (!Array.isArray(columns)) {
    return false;
  }
  for (const col of columns) {
    const expr = col.expression || col;
    if (isAggregateExpression(expr)) {
      return true;
    }
  }
  return false;
}

function hasComplexClause(parsedQuery) {
  return Boolean(
    (parsedQuery.joins?.length) ||
    (parsedQuery.groupBy?.length) ||
    parsedQuery.having ||
    parsedQuery.distinct ||
    parsedQuery.limit ||
    (parsedQuery.orderBy?.length) ||
    parsedQuery.setOperation ||
    parsedQuery.from?.subquery,
  );
}

/**
 * Check whether a parsed query AST requires Tier 2 complex re-execution
 * (contains joins, aggregates, GROUP BY, HAVING, DISTINCT, ORDER BY, or LIMIT/OFFSET).
 * @param {Object} parsedQuery - Parsed SELECT AST.
 * @return {boolean} True if query is complex.
 */
function isComplexQuery(parsedQuery) {
  if (!parsedQuery) {
    return false;
  }
  if (hasComplexClause(parsedQuery)) {
    return true;
  }
  return hasAggregateColumn(parsedQuery.columns);
}

function renderFunctionExpression(expr) {
  const fnName = expr.name || expr.func;
  let args = '';
  if (Array.isArray(expr.args)) {
    args = expr.args.map(renderExpression).join(COMMA_SPACE);
  } else if (expr.arg) {
    args = renderExpression(expr.arg);
  } else if (expr.star) {
    args = LIVE_QUERY_SQL.STAR;
  }
  return `${fnName}(${args})`;
}

function renderColumnRef(expr) {
  const col = expr.column || expr.name;
  return expr.table ? `${expr.table}.${col}` : String(col);
}

function renderBetweenExpression(expr) {
  return `${renderExpression(expr.expression)} BETWEEN ` +
    `${renderExpression(expr.low)} AND ${renderExpression(expr.high)}`;
}

function renderLikeExpression(expr) {
  return `${renderExpression(expr.expression)} LIKE ${renderExpression(expr.pattern)}`;
}

const AST_TYPE_RENDERERS = {
  [LIVE_QUERY_AST_TYPE.LITERAL]: (expr) => formatLiteralValue(expr.value),
  [LIVE_QUERY_AST_TYPE.COLUMN_REF]: renderColumnRef,
  [LIVE_QUERY_AST_TYPE.STAR]: () => LIVE_QUERY_SQL.STAR,
  [LIVE_QUERY_AST_TYPE.BINARY]: renderBinaryExpression,
  [LIVE_QUERY_AST_TYPE.UNARY]: renderUnaryExpression,
  [LIVE_QUERY_AST_TYPE.IN]: renderInExpression,
  [LIVE_QUERY_AST_TYPE.BETWEEN]: renderBetweenExpression,
  [LIVE_QUERY_AST_TYPE.LIKE]: renderLikeExpression,
  [LIVE_QUERY_AST_TYPE.FUNCTION]: renderFunctionExpression,
  [LIVE_QUERY_AST_TYPE.AGGR_FUNC]: renderFunctionExpression,
  [LIVE_QUERY_AST_TYPE.AGGREGATE]: renderFunctionExpression,
};

/**
 * Render an AST expression to a SQL snippet.
 * @param {Object|*} expr - Expression AST node.
 * @return {string} SQL snippet.
 */
function renderExpression(expr) {
  if (expr === null || expr === undefined) {
    return LIVE_QUERY_SQL.NULL;
  }

  if (typeof expr !== 'object') {
    return formatLiteralValue(expr);
  }

  const renderer = AST_TYPE_RENDERERS[expr.type];
  if (renderer) {
    return renderer(expr);
  }

  return expr.value !== undefined ? formatLiteralValue(expr.value) : '';
}

/**
 * Format a literal JavaScript value for SQL.
 * @param {*} value
 * @return {string}
 */
function formatLiteralValue(value) {
  if (value === null || value === undefined) {
    return LIVE_QUERY_SQL.NULL;
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? LOCAL_STR_ONE : LOCAL_STR_ZERO;
  }
  const escaped = String(value).replace(/'/g, '\'\'');
  return `'${escaped}'`;
}

/**
 * Render a binary expression AST.
 * @param {Object} expr
 * @return {string}
 */
function renderBinaryExpression(expr) {
  const {operator, left, right} = expr;
  const opUpper = String(operator).toUpperCase();

  if (opUpper === LIVE_QUERY_OPERATOR.IS_NULL) {
    return `${renderExpression(left)} IS NULL`;
  }
  if (opUpper === LIVE_QUERY_OPERATOR.IS_NOT_NULL) {
    return `${renderExpression(left)} IS NOT NULL`;
  }

  return `(${renderExpression(left)} ${operator} ${renderExpression(right)})`;
}

/**
 * Render a unary expression AST.
 * @param {Object} expr
 * @return {string}
 */
function renderUnaryExpression(expr) {
  const {operator, operand} = expr;
  const opUpper = String(operator).toUpperCase();
  if (opUpper === LIVE_QUERY_OPERATOR.NOT) {
    return `NOT (${renderExpression(operand)})`;
  }
  return `${operator}(${renderExpression(operand)})`;
}

/**
 * Render an IN expression AST.
 * @param {Object} expr
 * @return {string}
 */
function renderInExpression(expr) {
  const values = Array.isArray(expr.values) ?
    expr.values.map(renderExpression).join(COMMA_SPACE) :
    '';
  return `${renderExpression(expr.expression)} IN (${values})`;
}

/**
 * Render a column specification in SELECT.
 * @param {Object} col
 * @return {string}
 */
function renderColumn(col) {
  if (col.type === LIVE_QUERY_AST_TYPE.STAR) {
    return LIVE_QUERY_SQL.STAR;
  }
  const exprSql = col.expression ? renderExpression(col.expression) : (col.name || '*');
  return col.alias ? `${exprSql} AS ${col.alias}` : exprSql;
}

function resolveRawSql(parsedQuery) {
  if (typeof parsedQuery.sql === 'string' && parsedQuery.sql.trim().length > 0) {
    return parsedQuery.sql.trim();
  }
  if (typeof parsedQuery.rawSql === 'string' && parsedQuery.rawSql.trim().length > 0) {
    return parsedQuery.rawSql.trim();
  }
  return null;
}

function appendFromClause(parts, parsedQuery) {
  const fromName = extractPrimaryTable(parsedQuery) || '';
  if (fromName) {
    parts.push(LIVE_QUERY_SQL.FROM, fromName);
    if (parsedQuery.from?.alias) {
      parts.push(LIVE_QUERY_SQL.AS, parsedQuery.from.alias);
    }
  }
}

function renderJoin(join) {
  const joinType = (join.joinType || 'INNER').toUpperCase();
  const joinTable = resolveTableName(join.table) || join.table;
  let joinStr = `${joinType} JOIN ${joinTable}`;
  if (join.table?.alias) {
    joinStr += ` ${LIVE_QUERY_SQL.AS} ${join.table.alias}`;
  }
  if (join.condition) {
    joinStr += ` ON ${renderExpression(join.condition)}`;
  }
  return joinStr;
}

function appendJoinClauses(parts, joins) {
  if (Array.isArray(joins)) {
    for (const join of joins) {
      parts.push(renderJoin(join));
    }
  }
}

function renderOrderItem(item) {
  const expr = item.expression ? renderExpression(item.expression) : (item.column || item.name);
  const dir = (item.direction || 'ASC').toUpperCase();
  return `${expr} ${dir}`;
}

function appendOrderAndLimit(parts, parsedQuery) {
  if (Array.isArray(parsedQuery.orderBy) && parsedQuery.orderBy.length > 0) {
    parts.push(
      LIVE_QUERY_SQL.ORDER_BY,
      parsedQuery.orderBy.map(renderOrderItem).join(COMMA_SPACE),
    );
  }
  if (parsedQuery.limit) {
    parts.push(LIVE_QUERY_SQL.LIMIT, String(parsedQuery.limit.count ?? parsedQuery.limit));
    if (parsedQuery.limit.offset) {
      parts.push(LIVE_QUERY_SQL.OFFSET, String(parsedQuery.limit.offset));
    }
  }
}

function appendFilterClauses(parts, parsedQuery) {
  if (parsedQuery.where) {
    parts.push(LIVE_QUERY_SQL.WHERE, renderExpression(parsedQuery.where));
  }
  if (Array.isArray(parsedQuery.groupBy) && parsedQuery.groupBy.length > 0) {
    parts.push(
      LIVE_QUERY_SQL.GROUP_BY,
      parsedQuery.groupBy.map(renderExpression).join(COMMA_SPACE),
    );
  }
  if (parsedQuery.having) {
    parts.push(LIVE_QUERY_SQL.HAVING, renderExpression(parsedQuery.having));
  }
}

/**
 * Build a complete SELECT SQL string from a parsed AST.
 * @param {Object} parsedQuery - Parsed SELECT AST.
 * @return {string} Rendered SQL string.
 */
function buildSelectSQL(parsedQuery) {
  if (!parsedQuery) {
    return '';
  }

  // If raw SQL was preserved, return it directly
  const rawSql = resolveRawSql(parsedQuery);
  if (rawSql !== null) {
    return rawSql;
  }

  const parts = [LIVE_QUERY_SQL.SELECT];

  if (parsedQuery.distinct) {
    parts.push(LIVE_QUERY_SQL.DISTINCT);
  }

  // Columns
  if (Array.isArray(parsedQuery.columns) && parsedQuery.columns.length > 0) {
    parts.push(parsedQuery.columns.map(renderColumn).join(COMMA_SPACE));
  } else {
    parts.push(LIVE_QUERY_SQL.STAR);
  }

  appendFromClause(parts, parsedQuery);
  appendJoinClauses(parts, parsedQuery.joins);
  appendFilterClauses(parts, parsedQuery);
  appendOrderAndLimit(parts, parsedQuery);

  return parts.join(SPACE);
}

/**
 * Compare two versions or timestamps.
 * @param {*} a
 * @param {*} b
 * @return {number} -1, 0, or 1.
 */
function compareVersions(a, b) {
  if (a === null || a === undefined || b === null || b === undefined) {
    return 0;
  }
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }
  try {
    const bigA = BigInt(a);
    const bigB = BigInt(b);
    if (bigA < bigB) return -1;
    if (bigA > bigB) return 1;
    return 0;
  } catch {
    return String(a).localeCompare(String(b));
  }
}

/**
 * Resolve active partition version from table metadata.
 * @param {Object|null} tableInfo
 * @return {number}
 */
function resolveActivePartitionVersion(tableInfo) {
  const value = tableInfo?.active_partition_version ??
    tableInfo?.activePartitionVersion;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return 1;
  }
  return parsed;
}

/**
 * Check if partition is visible for routing given active version.
 * @param {Object} partition
 * @param {number} activePartitionVersion
 * @return {boolean}
 */
function isPartitionVisibleForRouting(partition, activePartitionVersion) {
  const partitionVersion = Number(
    partition?.partition_version ?? partition?.partitionVersion,
  );
  const normalizedVersion = Number.isInteger(partitionVersion) &&
    partitionVersion >= 1 ?
    partitionVersion :
    1;
  if (normalizedVersion !== activePartitionVersion) {
    return false;
  }

  const state = String(partition?.state ?? LOCAL_STR_NORMAL).toUpperCase();
  return state === LOCAL_STR_NORMAL;
}

export {
  buildSelectSQL,
  compareVersions,
  extractReferencedTables,
  isComplexQuery,
  isPartitionVisibleForRouting,
  renderExpression,
  resolveActivePartitionVersion,
};
