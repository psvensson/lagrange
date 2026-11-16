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

const CONSTRAINT_START_TOKENS = new Set([
  'PRIMARY',
  'UNIQUE',
  'CHECK',
  'FOREIGN',
  'CONSTRAINT',
  'NOT',
  'NULL',
  'DEFAULT',
  'COLLATE',
  'REFERENCES',
  'GENERATED',
  'AS',
  'AUTOINCREMENT',
]);
const TABLE_CONSTRAINT_HEADS = new Set([
  'PRIMARY',
  'UNIQUE',
  'CHECK',
  'FOREIGN',
  'CONSTRAINT',
]);

const STORAGE_RANK_INVALID = 0;
const STORAGE_RANK_NUMBER = 1;
const STORAGE_RANK_TEXT = 2;
const STORAGE_RANK_BLOB = 3;
const SQLITE_MASTER_DDL_SQL =
  'SELECT sql FROM sqlite_master WHERE type = \'table\' AND lower(name) = lower(?)';
const OPEN_PAREN_CHAR = '(';
const CLOSE_PAREN_CHAR = ')';
const COMMA_CHAR = ',';
const SPACE_STR = ' ';
const EMPTY_STR = '';

function isNullValue(value) {
  return value === null || value === undefined;
}

function scalarStorageRank(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return STORAGE_RANK_NUMBER;
  }
  if (typeof value === 'string') {
    return STORAGE_RANK_TEXT;
  }
  if (value instanceof Uint8Array) {
    return STORAGE_RANK_BLOB;
  }
  return STORAGE_RANK_INVALID;
}

function compareByteArrays(left, right) {
  const minLen = Math.min(left.byteLength, right.byteLength);
  for (let i = 0; i < minLen; i += 1) {
    if (left[i] !== right[i]) {
      return left[i] < right[i] ? -1 : 1;
    }
  }
  if (left.byteLength === right.byteLength) {
    return 0;
  }
  return left.byteLength < right.byteLength ? -1 : 1;
}

function isAffinityCarryingNode(node) {
  const type = node?.type;
  if (type === EXPR_TYPE.COLUMN_REF || type === EXPR_TYPE.COLUMN) {
    return true;
  }
  return String(type || '').toLowerCase() === CAST_NODE_TYPE;
}

function resolveExplicitTypeName(node) {
  if (!node || typeof node !== 'object') {
    return EMPTY_STR;
  }
  const candidate = node.affinity ?? node.targetType;
  return typeof candidate === 'string' ?
    candidate :
    String(candidate?.name || EMPTY_STR);
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

function resolveOperandComparisonAffinity(node) {
  if (typeof node === 'string') {
    return classifyAffinityFromTypeString(node) || SQL_COMPARISON_AFFINITY.NONE;
  }
  if (!isAffinityCarryingNode(node)) {
    return SQL_COMPARISON_AFFINITY.NONE;
  }
  return (
    classifyAffinityFromTypeString(resolveExplicitTypeName(node)) ||
    SQL_COMPARISON_AFFINITY.NONE
  );
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
  const leftAffinity = resolveOperandComparisonAffinity(leftNodeOrAffinity);
  const rightAffinity = resolveOperandComparisonAffinity(rightNodeOrAffinity);
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
  if (scalarStorageRank(left) === 0 || scalarStorageRank(right) === 0) {
    return false;
  }
  const [coercedLeft, coercedRight] = coercePairWithAffinity(
    left,
    right,
    leftNodeOrAffinity,
    rightNodeOrAffinity,
  );
  const rankLeft = scalarStorageRank(coercedLeft);
  const rankRight = scalarStorageRank(coercedRight);
  if (rankLeft === STORAGE_RANK_INVALID || rankLeft !== rankRight) {
    return false;
  }
  if (rankLeft === STORAGE_RANK_BLOB) {
    return compareByteArrays(coercedLeft, coercedRight) === 0;
  }
  return coercedLeft === coercedRight;
}

function compareSqlScalarsWithAffinity(
  left,
  right,
  leftNodeOrAffinity = SQL_COMPARISON_AFFINITY.NONE,
  rightNodeOrAffinity = SQL_COMPARISON_AFFINITY.NONE,
) {
  if (scalarStorageRank(left) === STORAGE_RANK_INVALID ||
      scalarStorageRank(right) === STORAGE_RANK_INVALID) {
    return UNKNOWN;
  }
  const [coercedLeft, coercedRight] = coercePairWithAffinity(
    left,
    right,
    leftNodeOrAffinity,
    rightNodeOrAffinity,
  );
  const rankLeft = scalarStorageRank(coercedLeft);
  const rankRight = scalarStorageRank(coercedRight);
  if (rankLeft === STORAGE_RANK_INVALID || rankRight === STORAGE_RANK_INVALID) {
    return UNKNOWN;
  }
  if (rankLeft !== rankRight) {
    return rankLeft < rankRight ? -1 : 1;
  }
  if (rankLeft === STORAGE_RANK_BLOB) {
    return compareByteArrays(coercedLeft, coercedRight);
  }
  if (coercedLeft === coercedRight) {
    return 0;
  }
  return coercedLeft < coercedRight ? -1 : 1;
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
  const exprAffinity = resolveOperandComparisonAffinity(node.expression);
  let sawNull = false;
  for (const candidate of node.values || []) {
    const candidateValue = evaluateResidualValue(candidate, row);
    if (isNullValue(candidateValue)) {
      sawNull = true;
      continue;
    }
    if (
      areSqlScalarsEqualWithAffinity(
        value,
        candidateValue,
        exprAffinity,
        SQL_COMPARISON_AFFINITY.NONE,
      )
    ) {
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

function stripIdentifierQuotes(rawName) {
  return String(rawName || EMPTY_STR)
    .trim()
    .replace(/^["'`[]|["'`\]]$/gu, EMPTY_STR)
    .toLowerCase();
}

function splitTopLevelCommaItems(body) {
  const items = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < body.length; i += 1) {
    if (body[i] === OPEN_PAREN_CHAR) depth += 1;
    else if (body[i] === CLOSE_PAREN_CHAR && depth > 0) depth -= 1;
    else if (body[i] === COMMA_CHAR && depth === 0) {
      items.push(body.slice(start, i));
      start = i + 1;
    }
  }
  items.push(body.slice(start));
  return items;
}

function parseSingleColumnDefinition(defText) {
  const tokens = String(defText || EMPTY_STR).trim().split(/\s+/u).filter(Boolean);
  if (tokens.length === 0 || TABLE_CONSTRAINT_HEADS.has(tokens[0].toUpperCase())) {
    return null;
  }
  const colName = stripIdentifierQuotes(tokens[0]);
  if (colName.length === 0) return null;
  const typeTokens = [];
  for (let i = 1; i < tokens.length; i += 1) {
    if (CONSTRAINT_START_TOKENS.has(tokens[i].toUpperCase().replace(/\(.*/u, EMPTY_STR))) {
      break;
    }
    typeTokens.push(tokens[i]);
  }
  const rawType = typeTokens.join(SPACE_STR);
  const affinity = rawType.length === 0 ? SQL_COMPARISON_AFFINITY.NONE :
    classifyAffinityFromTypeString(rawType) || SQL_COMPARISON_AFFINITY.NONE;
  return [colName, affinity];
}

function parseCreateTableColumnAffinities(createSql) {
  const map = new Map();
  const sql = String(createSql || EMPTY_STR);
  const openIdx = sql.indexOf(OPEN_PAREN_CHAR);
  const closeIdx = sql.lastIndexOf(CLOSE_PAREN_CHAR);
  if (openIdx < 0 || closeIdx <= openIdx) return map;
  for (const item of splitTopLevelCommaItems(sql.slice(openIdx + 1, closeIdx))) {
    const parsed = parseSingleColumnDefinition(item);
    if (parsed !== null) map.set(parsed[0], parsed[1]);
  }
  return map;
}

function buildColumnAffinityMapFromColumns(columns) {
  const map = new Map();
  if (!Array.isArray(columns)) return map;
  for (const col of columns) {
    const colName = stripIdentifierQuotes(col?.name);
    if (colName.length === 0) continue;
    const rawType = String(col?.type || EMPTY_STR).trim();
    map.set(colName, rawType.length === 0 ? SQL_COMPARISON_AFFINITY.NONE :
      classifyAffinityFromTypeString(rawType) || SQL_COMPARISON_AFFINITY.NONE);
  }
  return map;
}

function hasUnannotatedColumnRefs(node) {
  if (!node || typeof node !== 'object') return false;
  if ((node.type === EXPR_TYPE.COLUMN_REF || node.type === EXPR_TYPE.COLUMN) &&
      typeof node.affinity !== 'string') {
    return true;
  }
  return (Array.isArray(node.values) && node.values.some(hasUnannotatedColumnRefs)) ||
    [node.left, node.right, node.operand, node.expression, node.low, node.high]
      .some(hasUnannotatedColumnRefs);
}

function resolveColumnAffinityFromMap(node, affinitiesByTable, defaultTableRef) {
  const colKey = stripIdentifierQuotes(node.column);
  if (colKey.length === 0 || !(affinitiesByTable instanceof Map)) return null;
  const tableKey = stripIdentifierQuotes(node.table || defaultTableRef || EMPTY_STR);
  if (tableKey.length > 0 && affinitiesByTable.get(tableKey)?.has(colKey)) {
    return affinitiesByTable.get(tableKey).get(colKey);
  }
  let matched = null;
  for (const tableMap of affinitiesByTable.values()) {
    if (!tableMap?.has(colKey)) continue;
    const candidate = tableMap.get(colKey);
    if (matched !== null && matched !== candidate) return null;
    matched = candidate;
  }
  return matched;
}

function annotateExpressionColumnAffinities(node, affinitiesByTable, defaultTableRef = null) {
  if (!node || typeof node !== 'object') return;
  if ((node.type === EXPR_TYPE.COLUMN_REF || node.type === EXPR_TYPE.COLUMN) &&
      typeof node.affinity !== 'string') {
    const resolved = resolveColumnAffinityFromMap(node, affinitiesByTable, defaultTableRef);
    if (resolved !== null) node.affinity = resolved;
    return;
  }
  for (const entry of node.values || []) {
    annotateExpressionColumnAffinities(entry, affinitiesByTable, defaultTableRef);
  }
  for (const child of [node.left, node.right, node.operand, node.expression, node.low, node.high]) {
    annotateExpressionColumnAffinities(child, affinitiesByTable, defaultTableRef);
  }
}

async function resolveExecutorTableColumnAffinities(
  executor, tableName, partitions, queryTimestamp, options = {}, getSchemaByTableName = null,
) {
  if (typeof tableName !== 'string' || tableName.length === 0) return new Map();
  const systemSchema = getSchemaByTableName?.(tableName);
  if (Array.isArray(systemSchema?.columns)) {
    return buildColumnAffinityMapFromColumns(systemSchema.columns);
  }
  if (!Array.isArray(partitions) || partitions.length === 0) return new Map();
  if (!(executor.tableColumnAffinities instanceof Map)) {
    executor.tableColumnAffinities = new Map();
  }
  const bindingKey = `${partitions[0]}::${tableName.toLowerCase()}`;
  if (executor.tableColumnAffinities.has(bindingKey)) {
    return executor.tableColumnAffinities.get(bindingKey);
  }
  const ddlResults = await executor.executeOnPartitions(
    [partitions[0]],
    SQLITE_MASTER_DDL_SQL,
    [tableName], queryTimestamp, true, options.preferLeader === true,
    options.preferSameLatencyGroup === true, {
      sessionId: options.sessionId, transactionIdentity: options.transactionIdentity,
      deliveryPriority: options.deliveryPriority,
      routingReadinessDimension: options.routingReadinessDimension,
      timeoutMs: options.timeoutMs, timeoutBudget: options.timeoutBudget || null,
      cancellationToken: options.cancellationToken || null, tableName});
  const createSql = ddlResults?.[0]?.rows?.[0]?.sql;
  const parsed = typeof createSql === 'string' && createSql.length > 0 ?
    parseCreateTableColumnAffinities(createSql) : new Map();
  if (parsed.size > 0) executor.tableColumnAffinities.set(bindingKey, parsed);
  return parsed;
}

async function ensureExecutorQueryColumnAffinities(
  executor, ast, residualConjuncts = [], tableBindings = [],
  queryTimestamp = null, options = {}, getSchemaByTableName = null,
) {
  const joinConditions = (ast?.joins || []).map((join) => join?.condition).filter(Boolean);
  const exprs = [
    ...(Array.isArray(residualConjuncts) ? residualConjuncts : []),
    ...joinConditions,
    ...(ast?.having ? [ast.having] : []),
  ].filter(hasUnannotatedColumnRefs);
  if (exprs.length === 0) return;
  const affinitiesByTable = new Map();
  for (const binding of tableBindings) {
    if (!binding?.tableName) continue;
    const colMap = await resolveExecutorTableColumnAffinities(executor,
      binding.tableName, binding.partitions, queryTimestamp, options, getSchemaByTableName);
    if (colMap.size > 0) {
      affinitiesByTable.set(binding.tableName.toLowerCase(), colMap);
      if (binding.alias) affinitiesByTable.set(binding.alias.toLowerCase(), colMap);
    }
  }
  if (affinitiesByTable.size === 0) return;
  const defaultTableRef = tableBindings.length === 1 ?
    tableBindings[0].alias || tableBindings[0].tableName : null;
  for (const expr of exprs) {
    annotateExpressionColumnAffinities(expr, affinitiesByTable, defaultTableRef);
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
  annotateExpressionColumnAffinities,
  applySqlComparisonAffinity,
  areSqlScalarsEqualWithAffinity,
  buildColumnAffinityMapFromColumns,
  compareSqlScalarsWithAffinity,
  ensureExecutorQueryColumnAffinities,
  hasUnannotatedColumnRefs,
  parseCreateTableColumnAffinities,
  residualPredicateAdmitsRow,
  resolveOperandComparisonAffinity,
};
