/**
 * Live Query Service - Core service for real-time streaming queries.
 * Parses LIVE SELECT statements, extracts partition keys, and compiles predicates.
 * Requirements: 33.1, 33.4, 33.16
 */

import {v4 as uuidv4} from 'uuid';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {resolveDeclaredPrimaryKeyColumns} from '../partition/partition-boundary-representation.js';
import {TABLES} from '../constants/index.js';
import {extractReferencedTables} from './live-query-sql-renderer.js';
import {
  LIVE_QUERY_AST_TYPE,
  LIVE_QUERY_CONFIG_KEY,
  LIVE_QUERY_CURSOR,
  LIVE_QUERY_DEFAULTS,
  LIVE_QUERY_DEFAULT_VALUE,
  LIVE_QUERY_ERROR_MSG,
  LIVE_QUERY_LOG_MSG,
  LIVE_QUERY_OPERATOR,
  LIVE_QUERY_REGEX,
  LIVE_QUERY_REGEX_FLAG,
  LIVE_QUERY_REGEX_REPLACE,
  LIVE_QUERY_SQL,
  LIVE_QUERY_SUBSYSTEM,
} from './live-query-constants.js';

const LOCAL_STR_OBJECT = 'object';
const LOCAL_NUM_ZERO_POINT_SEVEN = 0.7;
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

function resolveLiveQueryPrimaryTable(tables, parsedQuery) {
  if (tables.length > 0) {
    return tables[0];
  }
  return parsedQuery?.from?.name || null;
}

function resolveLiveQueryTtlMs(config) {
  return config.get(LIVE_QUERY_CONFIG_KEY.DEFAULT_TTL_MS) ||
    LIVE_QUERY_DEFAULTS.DEFAULT_TTL_MS;
}

/**
 * LiveQueryService manages a single live query subscription.
 */
class LiveQueryService {
  /**
   * Create a new LiveQueryService.
   * @param {Object} options - Configuration options.
   * @param {Object} options.parsedQuery - Parsed SELECT query AST.
   * @param {Object} options.client - Client connection.
   * @param {Object} options.systemCache - System table cache.
   * @param {string} options.nodeId - Node ID.
   */
  constructor(options = {}) {
    this.queryId = uuidv4();
    this.parsedQuery = options.parsedQuery ?? null;
    this.client = options.client ?? null;
    this.systemCache = options.systemCache ?? null;
    this.nodeId = options.nodeId || LIVE_QUERY_DEFAULT_VALUE.UNKNOWN;

    // Extract table names from query
    this.tables = extractReferencedTables(this.parsedQuery);
    this.table = resolveLiveQueryPrimaryTable(this.tables, this.parsedQuery);

    // Compile predicate from WHERE clause
    this.params = options.params || [];
    this.whereClause = this.parsedQuery?.where ?? null;
    this.predicate = compilePredicate(this.whereClause, this.params);

    // Partition key value (extracted lazily)
    this.partitionKeyValue = null;
    this.partitionKeyColumn = null;

    // Subscribed partitions
    this.subscribedPartitions = new Set();

    // Lifecycle management
    this.config = ConfigurationManager.getInstance();
    this.ttlMs = resolveLiveQueryTtlMs(this.config);
    this.lastRenewal = Date.now();
    this.lastSeenHLC = null;
    this.createdAt = Date.now();

    // Status
    this.active = false;
    this.cleanedUp = false;

    // Logging
    this.logger = this.initLogger();
  }

  /**
   * Initialize logger.
   * @return {Object} Logger instance.
   * @private
   */
  initLogger() {
    try {
      const loggingService = LoggingService.getInstance();
      if (loggingService.isInitialized()) {
        return loggingService.forSubsystem(LIVE_QUERY_SUBSYSTEM.LIVE_QUERY_SERVICE);
      }
    } catch {
      // Logging not available
    }
    return console;
  }

  /**
   * Get the partition key column for the table.
   * @return {string|null} Partition key column name.
   */
  getPartitionKeyColumn() {
    if (this.partitionKeyColumn) {
      return this.partitionKeyColumn;
    }

    if (!this.systemCache || !this.table) {
      return null;
    }

    try {
      const tableInfo = this.systemCache.get(TABLES.TABLES, this.table) ||
        this.systemCache.find(TABLES.TABLES, (t) =>
          t.table_name === this.table || t.tableName === this.table,
        );

      if (tableInfo) {
        const keyColumns = resolveDeclaredPrimaryKeyColumns(tableInfo);
        this.partitionKeyColumn = keyColumns[0] || null;
        return this.partitionKeyColumn;
      }
    } catch {
      // Cache not available
    }

    return null;
  }

  /**
   * Extract partition key value from WHERE clause.
   * @return {*} Partition key value or null.
   */
  extractPartitionKeyValue() {
    if (this.partitionKeyValue !== null) {
      return this.partitionKeyValue;
    }

    const keyColumn = this.getPartitionKeyColumn();
    this.partitionKeyValue = extractPartitionKeyValue(this.whereClause, keyColumn);
    return this.partitionKeyValue;
  }

  /**
   * Evaluate if a row matches the predicate.
   * @param {Object} row - Row data.
   * @return {boolean} True if row matches.
   */
  evaluatePredicate(row) {
    return this.predicate(row);
  }

  /**
   * Renew the subscription lease.
   * @param {string} cursor - Last seen HLC timestamp.
   * @return {Object} Renewal result with new expiry.
   */
  renew(cursor) {
    this.lastRenewal = Date.now();
    if (cursor) {
      this.lastSeenHLC = cursor;
    }

    this.logger.debug(LIVE_QUERY_LOG_MSG.RENEWED, {
      queryId: this.queryId,
      cursor,
    });

    return {
      queryId: this.queryId,
      expiresAt: this.lastRenewal + this.ttlMs,
      renewBefore: this.lastRenewal + Math.floor(this.ttlMs * LOCAL_NUM_ZERO_POINT_SEVEN),
    };
  }

  /**
   * Check if the subscription has expired.
   * @return {boolean} True if expired.
   */
  isExpired() {
    return Date.now() > this.lastRenewal + this.ttlMs;
  }

  /**
   * Get query metadata for monitoring.
   * @return {Object} Query metadata.
   */
  getMetadata() {
    return {
      queryId: this.queryId,
      table: this.table,
      partitionKeyValue: this.partitionKeyValue,
      subscribedPartitions: Array.from(this.subscribedPartitions),
      ttlMs: this.ttlMs,
      lastRenewal: this.lastRenewal,
      lastSeenHLC: this.lastSeenHLC,
      createdAt: this.createdAt,
      active: this.active,
    };
  }

  /**
   * Get canonical query signature for grouping.
   * @return {string} Query signature.
   */
  getQuerySignature() {
    return `${this.table}${LIVE_QUERY_CURSOR.SEPARATOR}` +
      `${canonicalizePredicate(this.whereClause)}`;
  }

  /**
   * Mark the query as active.
   */
  activate() {
    this.active = true;
  }

  /**
   * Mark the query as inactive and clean up.
   */
  deactivate() {
    this.active = false;
  }

  /**
   * Clean up resources.
   */
  cleanup() {
    if (this.cleanedUp) return;

    this.cleanedUp = true;
    this.active = false;
    this.subscribedPartitions.clear();

    this.logger.debug(LIVE_QUERY_LOG_MSG.CLEANED_UP, {
      queryId: this.queryId,
      table: this.table,
    });
  }
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
  LiveQueryService,
  compilePredicate,
  extractPartitionKeyValue,
  canonicalizePredicate,
  parseLiveSelect,
  evaluateExpression,
  evaluateWhereExpression,
  isComplexWhereNode,
  sortObject,
};
