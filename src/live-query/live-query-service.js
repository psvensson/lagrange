/**
 * Live Query Service - Core service for real-time streaming queries.
 * Parses LIVE SELECT statements, extracts partition keys, and compiles predicates.
 * Requirements: 33.1, 33.4, 33.16
 */

import {v4 as uuidv4} from 'uuid';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';

/**
 * Live query event types sent to clients.
 */
const LiveQueryEventType = {
  INSERT: 'insert',
  UPDATE: 'update',
  DELETE: 'delete',
  SNAPSHOT: 'snapshot',
  ERROR: 'error',
};

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
  case 'binary':
    return evaluateBinaryExpression(expr, row);

  case 'unary':
    return evaluateUnaryExpression(expr, row);

  case 'literal':
    return expr.value;

  case 'column_ref':
    return getColumnValue(expr, row);

  case 'in':
    return evaluateInExpression(expr, row);

  case 'between':
    return evaluateBetweenExpression(expr, row);

  case 'like':
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
  case 'AND':
    return evaluateExpression(left, row) && evaluateExpression(right, row);

  case 'OR':
    return evaluateExpression(left, row) || evaluateExpression(right, row);

  case '=':
    return evaluateExpression(left, row) === evaluateExpression(right, row);

  case '!=':
  case '<>':
    return evaluateExpression(left, row) !== evaluateExpression(right, row);

  case '<':
    return evaluateExpression(left, row) < evaluateExpression(right, row);

  case '<=':
    return evaluateExpression(left, row) <= evaluateExpression(right, row);

  case '>':
    return evaluateExpression(left, row) > evaluateExpression(right, row);

  case '>=':
    return evaluateExpression(left, row) >= evaluateExpression(right, row);

  case 'IS NULL':
    return evaluateExpression(left, row) === null;

  case 'IS NOT NULL':
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
  case 'NOT':
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

  if (typeof value !== 'string' || typeof pattern !== 'string') {
    return false;
  }

  // Convert SQL LIKE pattern to regex
  const regexPattern = pattern
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
    .replace(/%/g, '.*') // % matches any sequence
    .replace(/_/g, '.'); // _ matches single char

  const regex = new RegExp(`^${regexPattern}$`, 'i');
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
  case 'binary': {
    const {operator, left, right} = expr;

    // Handle AND - check both sides
    if (operator === 'AND') {
      const leftValue = findPartitionKeyValue(left, keyColumn);
      if (leftValue !== null) return leftValue;
      return findPartitionKeyValue(right, keyColumn);
    }

    // Handle equality on partition key
    if (operator === '=') {
      if (isPartitionKeyColumn(left, keyColumn) && right.type === 'literal') {
        return right.value;
      }
      if (isPartitionKeyColumn(right, keyColumn) && left.type === 'literal') {
        return left.value;
      }
    }
    break;
  }

  case 'in': {
    // For IN clause, return array of values
    if (isPartitionKeyColumn(expr.expression, keyColumn)) {
      return expr.values
        .filter((v) => v.type === 'literal')
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
  if (!expr || expr.type !== 'column_ref') return false;
  const column = (expr.column || expr.name || '').toLowerCase();
  return column === keyColumn;
}

/**
 * Canonicalize a predicate for grouping identical queries.
 * @param {Object} whereClause - Parsed WHERE clause AST.
 * @return {string} Canonical string representation.
 */
function canonicalizePredicate(whereClause) {
  if (!whereClause) return '';
  return JSON.stringify(sortObject(whereClause));
}

/**
 * Sort object keys recursively for consistent serialization.
 * @param {*} obj - Object to sort.
 * @return {*} Sorted object.
 */
function sortObject(obj) {
  if (obj === null || typeof obj !== 'object') {
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
    throw new Error('Invalid SQL: expected string');
  }

  const trimmed = sql.trim();
  const upperSql = trimmed.toUpperCase();

  // Check for LIVE prefix
  if (!upperSql.startsWith('LIVE ')) {
    return {isLive: false, sql: trimmed};
  }

  // Remove LIVE prefix and return the SELECT statement
  const selectSql = trimmed.substring(5).trim();

  if (!selectSql.toUpperCase().startsWith('SELECT')) {
    throw new Error('LIVE must be followed by SELECT statement');
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
    this.nodeId = options.nodeId || 'unknown';

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
    this.ttlMs = this.config.get('liveQuery.defaultTtlMs') || 30000;
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
        return loggingService.forSubsystem('live-query-service');
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
      const tableInfo = this.systemCache.get('tables', this.table) ||
        this.systemCache.find('tables', (t) =>
          t.table_name === this.table || t.tableName === this.table,
        );

      if (tableInfo) {
        this.partitionKeyColumn = tableInfo.primary_key ||
          tableInfo.primaryKey || 'id';
        return this.partitionKeyColumn;
      }
    } catch {
      // Cache not available
    }

    return 'id'; // Default
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

    this.logger.debug('Live query renewed', {
      queryId: this.queryId,
      cursor,
    });

    return {
      queryId: this.queryId,
      expiresAt: this.lastRenewal + this.ttlMs,
      renewBefore: this.lastRenewal + Math.floor(this.ttlMs * 0.7),
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
    return `${this.table}:${canonicalizePredicate(this.whereClause)}`;
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

    this.logger.debug('Live query cleaned up', {
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
