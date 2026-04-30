/**
 * Live Query Service - Core service for real-time streaming queries.
 * Parses LIVE SELECT statements, extracts partition keys, and compiles predicates.
 * Requirements: 33.1, 33.4, 33.16
 */

import {v4 as uuidv4} from 'uuid';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {TABLES} from '../constants/index.js';
import {
  LIVE_QUERY_AST_TYPE,
  LIVE_QUERY_CONFIG_KEY,
  LIVE_QUERY_CURSOR,
  LIVE_QUERY_DEFAULTS,
  LIVE_QUERY_DEFAULT_VALUE,
  LIVE_QUERY_ERROR_MSG,
  LIVE_QUERY_EVENT,
  LIVE_QUERY_LOG_MSG,
  LIVE_QUERY_OPERATOR,
  LIVE_QUERY_REGEX,
  LIVE_QUERY_REGEX_FLAG,
  LIVE_QUERY_REGEX_REPLACE,
  LIVE_QUERY_SQL,
  LIVE_QUERY_SUBSYSTEM,
  TYPEOF,
} from './live-query-constants.js';

const LOCAL_STR_OBJECT = 'object';
const LOCAL_NUM_0_POINT_7 = 0.7;

/**
 * Live query event types sent to clients.
 */
const LiveQueryEventType = LIVE_QUERY_EVENT;

/**
 * Compiles a WHERE clause AST into an efficient evaluation function.
 * @param {Object} whereClause - Parsed WHERE clause AST.
 * @return {Function} Predicate function that takes a row and returns boolean.
 */
function compilePredicate(whereClause) {
  if (!whereClause) {
    // No WHERE clause - match all rows
    return () => true;
  }

  return (row) => evaluateExpression(whereClause, row);
}

/**
 * Evaluate an expression against a row.
 * @param {Object} expr - Expression AST node.
 * @param {Object} row - Row data to evaluate against.
 * @return {*} Evaluation result.
 */
function evaluateExpression(expr, row) {
  if (!expr) return true;

  switch (expr.type) {
  case LIVE_QUERY_AST_TYPE.BINARY:
    return evaluateBinaryExpression(expr, row);

  case LIVE_QUERY_AST_TYPE.UNARY:
    return evaluateUnaryExpression(expr, row);

  case LIVE_QUERY_AST_TYPE.LITERAL:
    return expr.value;

  case LIVE_QUERY_AST_TYPE.COLUMN_REF:
    return getColumnValue(expr, row);

  case LIVE_QUERY_AST_TYPE.IN:
    return evaluateInExpression(expr, row);

  case LIVE_QUERY_AST_TYPE.BETWEEN:
    return evaluateBetweenExpression(expr, row);

  case LIVE_QUERY_AST_TYPE.LIKE:
    return evaluateLikeExpression(expr, row);

  default:
    return true;
  }
}

/**
 * Evaluate a binary expression.
 * @param {Object} expr - Binary expression AST.
 * @param {Object} row - Row data.
 * @return {*} Evaluation result.
 */
function evaluateBinaryExpression(expr, row) {
  const {operator, left, right} = expr;

  switch (operator) {
  case LIVE_QUERY_OPERATOR.AND:
    return evaluateExpression(left, row) && evaluateExpression(right, row);

  case LIVE_QUERY_OPERATOR.OR:
    return evaluateExpression(left, row) || evaluateExpression(right, row);

  case LIVE_QUERY_OPERATOR.EQUALS:
    return evaluateExpression(left, row) === evaluateExpression(right, row);

  case LIVE_QUERY_OPERATOR.NOT_EQUALS:
  case LIVE_QUERY_OPERATOR.NOT_EQUALS_ALT:
    return evaluateExpression(left, row) !== evaluateExpression(right, row);

  case LIVE_QUERY_OPERATOR.LESS_THAN:
    return evaluateExpression(left, row) < evaluateExpression(right, row);

  case LIVE_QUERY_OPERATOR.LESS_THAN_OR_EQUAL:
    return evaluateExpression(left, row) <= evaluateExpression(right, row);

  case LIVE_QUERY_OPERATOR.GREATER_THAN:
    return evaluateExpression(left, row) > evaluateExpression(right, row);

  case LIVE_QUERY_OPERATOR.GREATER_THAN_OR_EQUAL:
    return evaluateExpression(left, row) >= evaluateExpression(right, row);

  case LIVE_QUERY_OPERATOR.IS_NULL:
    return evaluateExpression(left, row) === null;

  case LIVE_QUERY_OPERATOR.IS_NOT_NULL:
    return evaluateExpression(left, row) !== null;

  default:
    return true;
  }
}

/**
 * Evaluate a unary expression.
 * @param {Object} expr - Unary expression AST.
 * @param {Object} row - Row data.
 * @return {*} Evaluation result.
 */
function evaluateUnaryExpression(expr, row) {
  const {operator, operand} = expr;

  switch (operator) {
  case LIVE_QUERY_OPERATOR.NOT:
    return !evaluateExpression(operand, row);

  default:
    return true;
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
 * @return {boolean} True if value is in list.
 */
function evaluateInExpression(expr, row) {
  const value = evaluateExpression(expr.expression, row);
  const values = expr.values.map((v) => evaluateExpression(v, row));
  return values.includes(value);
}

/**
 * Evaluate BETWEEN expression.
 * @param {Object} expr - BETWEEN expression AST.
 * @param {Object} row - Row data.
 * @return {boolean} True if value is between low and high.
 */
function evaluateBetweenExpression(expr, row) {
  const value = evaluateExpression(expr.expression, row);
  const low = evaluateExpression(expr.low, row);
  const high = evaluateExpression(expr.high, row);
  return value >= low && value <= high;
}

/**
 * Evaluate LIKE expression.
 * @param {Object} expr - LIKE expression AST.
 * @param {Object} row - Row data.
 * @return {boolean} True if value matches pattern.
 */
function evaluateLikeExpression(expr, row) {
  const value = evaluateExpression(expr.expression, row);
  const pattern = evaluateExpression(expr.pattern, row);

  if (typeof value !== TYPEOF.STRING || typeof pattern !== TYPEOF.STRING) {
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
  if (!sql || typeof sql !== TYPEOF.STRING) {
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
    this.parsedQuery = options.parsedQuery || null;
    this.client = options.client || null;
    this.systemCache = options.systemCache || null;
    this.nodeId = options.nodeId || LIVE_QUERY_DEFAULT_VALUE.UNKNOWN;

    // Extract table name from query
    this.table = this.parsedQuery?.from?.name || null;

    // Compile predicate from WHERE clause
    this.predicate = compilePredicate(this.parsedQuery?.where);

    // Store original WHERE clause for partition key extraction
    this.whereClause = this.parsedQuery?.where || null;

    // Partition key value (extracted lazily)
    this.partitionKeyValue = null;
    this.partitionKeyColumn = null;

    // Subscribed partitions
    this.subscribedPartitions = new Set();

    // Lifecycle management
    this.config = ConfigurationManager.getInstance();
    this.ttlMs = this.config.get(LIVE_QUERY_CONFIG_KEY.DEFAULT_TTL_MS) ||
      LIVE_QUERY_DEFAULTS.DEFAULT_TTL_MS;
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
        this.partitionKeyColumn = tableInfo.primary_key ||
          tableInfo.primaryKey || LIVE_QUERY_DEFAULT_VALUE.PRIMARY_KEY_FALLBACK;
        return this.partitionKeyColumn;
      }
    } catch {
      // Cache not available
    }

    return LIVE_QUERY_DEFAULT_VALUE.PRIMARY_KEY_FALLBACK;
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
      renewBefore: this.lastRenewal + Math.floor(this.ttlMs * LOCAL_NUM_0_POINT_7),
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

export {
  LiveQueryService,
  LiveQueryEventType,
  compilePredicate,
  extractPartitionKeyValue,
  canonicalizePredicate,
  parseLiveSelect,
  evaluateExpression,
};
