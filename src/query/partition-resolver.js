/**
 * Partition Resolver - Routes queries to appropriate partitions.
 * Implements partition resolution based on PRIMARY KEY filters.
 * Requirements: 20.6, 20.7
 */

import {LoggingService} from '../logging/logging-service.js';
import {TABLES} from '../constants/index.js';
import {
  QUERY_AST_NODE,
  QUERY_DEFAULT_VALUE,
  QUERY_LOG_MSG,
  QUERY_OPERATOR,
  QUERY_SUBSYSTEM,
} from './query-constants.js';

/**
 * PartitionResolver resolves queries to relevant partitions based on
 * WHERE clause conditions on the PRIMARY KEY.
 */
class PartitionResolver {
  /**
   * Create a new partition resolver.
   * @param {Object} options - Configuration options.
   * @param {Object} options.systemCache - System table cache for partition lookup.
   */
  constructor(options = {}) {
    this.systemCache = options.systemCache || null;
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
        return loggingService.forSubsystem(QUERY_SUBSYSTEM.PARTITION_RESOLVER);
      }
    } catch {
      // Logging not available
    }
    return console;
  }

  /**
   * Set the system cache.
   * @param {Object} cache - System table cache.
   */
  setSystemCache(cache) {
    this.systemCache = cache;
  }

  /**
   * Resolve partitions for a query.
   * @param {string} tableName - Table name.
   * @param {Object} whereClause - Parsed WHERE clause AST.
   * @param {Array} partitions - Available partitions for the table.
   * @return {Array} Array of partition IDs to query.
   */
  resolvePartitions(tableName, whereClause, partitions) {
    if (!partitions || partitions.length === 0) {
      this.logger.warn(QUERY_LOG_MSG.NO_PARTITIONS_FOR_TABLE, {tableName});
      return [];
    }

    // Get table metadata to find primary key
    const tableInfo = this.getTableInfo(tableName);
    const primaryKey = tableInfo?.primaryKey || QUERY_DEFAULT_VALUE.PRIMARY_KEY;

    // Extract key conditions from WHERE clause
    const keyConditions = this.extractKeyConditions(whereClause, primaryKey);

    if (!keyConditions) {
      // No PRIMARY KEY filter - scatter-gather to all partitions
      this.logger.debug(QUERY_LOG_MSG.NO_KEY_CONDITIONS, {
        tableName,
        partitionCount: partitions.length,
      });
      return partitions.map((p) => p.partition_id || p.partitionId);
    }

    // Find partitions whose ranges overlap with query conditions
    const matchingPartitions = this.findMatchingPartitions(
      partitions,
      keyConditions,
    );

    this.logger.debug(QUERY_LOG_MSG.RESOLVED_PARTITIONS, {
      tableName,
      keyConditions,
      matchingCount: matchingPartitions.length,
      totalPartitions: partitions.length,
    });

    return matchingPartitions.map((p) => p.partition_id || p.partitionId);
  }

  /**
   * Get table information from system cache.
   * @param {string} tableName - Table name.
   * @return {Object|null} Table info or null.
   * @private
   */
  getTableInfo(tableName) {
    if (!this.systemCache) {
      return null;
    }

    try {
      if (typeof this.systemCache.get === 'function') {
        return this.systemCache.get(TABLES.TABLES, tableName);
      }
      if (typeof this.systemCache.find === 'function') {
        return this.systemCache.find(TABLES.TABLES, (t) =>
          t.table_name === tableName || t.tableName === tableName,
        );
      }
    } catch {
      // Cache not available
    }
    return null;
  }

  /**
   * Extract PRIMARY KEY conditions from WHERE clause.
   * @param {Object} whereClause - Parsed WHERE clause AST.
   * @param {string} primaryKey - Primary key column name.
   * @return {Object|null} Key conditions or null if no key filter.
   * @private
   */
  extractKeyConditions(whereClause, primaryKey) {
    if (!whereClause) {
      return null;
    }

    const conditions = {
      type: null, // QUERY_KEY_CONDITION_TYPE
      values: [],
      low: null,
      high: null,
      lowInclusive: true,
      highInclusive: false,
    };

    const found = this.findKeyConditions(whereClause, primaryKey, conditions);
    return found ? conditions : null;
  }

  /**
   * Recursively find key conditions in expression.
   * @param {Object} expr - Expression AST.
   * @param {string} primaryKey - Primary key column name.
   * @param {Object} conditions - Conditions accumulator.
   * @return {boolean} True if key conditions found.
   * @private
   */
  findKeyConditions(expr, primaryKey, conditions) {
    if (!expr) return false;

    switch (expr.type) {
    case QUERY_AST_NODE.BINARY:
      return this.handleBinaryExpr(expr, primaryKey, conditions);

    case QUERY_AST_NODE.IN:
      return this.handleInExpr(expr, primaryKey, conditions);

    case QUERY_AST_NODE.BETWEEN:
      return this.handleBetweenExpr(expr, primaryKey, conditions);

    default:
      return false;
    }
  }

  /**
   * Handle binary expression for key extraction.
   * @param {Object} expr - Binary expression.
   * @param {string} primaryKey - Primary key column.
   * @param {Object} conditions - Conditions accumulator.
   * @return {boolean} True if key condition found.
   * @private
   */
  handleBinaryExpr(expr, primaryKey, conditions) {
    const {operator, left, right} = expr;

    // Handle AND - both sides may have key conditions
    if (operator === QUERY_OPERATOR.AND) {
      const leftFound = this.findKeyConditions(left, primaryKey, conditions);
      const rightFound = this.findKeyConditions(right, primaryKey, conditions);
      return leftFound || rightFound;
    }

    // Handle OR - need all branches to have key conditions for optimization
    if (operator === QUERY_OPERATOR.OR) {
      // For OR, we can't easily optimize unless all branches are on the key
      // For now, return false to trigger scatter-gather
      return false;
    }

    // Check if this is a comparison on the primary key
    const keyColumn = this.isKeyColumn(left, primaryKey) ? left :
      this.isKeyColumn(right, primaryKey) ? right : null;

    if (!keyColumn) return false;

    const valueExpr = keyColumn === left ? right : left;
    const value = this.extractLiteralValue(valueExpr);

    if (value === undefined) return false;

    // Handle different operators
    switch (operator) {
    case QUERY_OPERATOR.EQUALS:
      conditions.type = 'equals';
      conditions.values.push(value);
      return true;

    case QUERY_OPERATOR.LESS_THAN:
      conditions.type = 'range';
      conditions.high = value;
      conditions.highInclusive = false;
      return true;

    case QUERY_OPERATOR.LESS_THAN_OR_EQUAL:
      conditions.type = 'range';
      conditions.high = value;
      conditions.highInclusive = true;
      return true;

    case QUERY_OPERATOR.GREATER_THAN:
      conditions.type = 'range';
      conditions.low = value;
      conditions.lowInclusive = false;
      return true;

    case QUERY_OPERATOR.GREATER_THAN_OR_EQUAL:
      conditions.type = 'range';
      conditions.low = value;
      conditions.lowInclusive = true;
      return true;

    default:
      return false;
    }
  }

  /**
   * Handle IN expression for key extraction.
   * @param {Object} expr - IN expression.
   * @param {string} primaryKey - Primary key column.
   * @param {Object} conditions - Conditions accumulator.
   * @return {boolean} True if key condition found.
   * @private
   */
  handleInExpr(expr, primaryKey, conditions) {
    if (!this.isKeyColumn(expr.expression, primaryKey)) {
      return false;
    }

    conditions.type = 'in';
    conditions.values = expr.values
      .map((v) => this.extractLiteralValue(v))
      .filter((v) => v !== undefined);

    return conditions.values.length > 0;
  }

  /**
   * Handle BETWEEN expression for key extraction.
   * @param {Object} expr - BETWEEN expression.
   * @param {string} primaryKey - Primary key column.
   * @param {Object} conditions - Conditions accumulator.
   * @return {boolean} True if key condition found.
   * @private
   */
  handleBetweenExpr(expr, primaryKey, conditions) {
    if (!this.isKeyColumn(expr.expression, primaryKey)) {
      return false;
    }

    const low = this.extractLiteralValue(expr.low);
    const high = this.extractLiteralValue(expr.high);

    if (low === undefined || high === undefined) {
      return false;
    }

    conditions.type = 'range';
    conditions.low = low;
    conditions.high = high;
    conditions.lowInclusive = true;
    conditions.highInclusive = true;

    return true;
  }

  /**
   * Check if expression is a reference to the primary key column.
   * @param {Object} expr - Expression AST.
   * @param {string} primaryKey - Primary key column name.
   * @return {boolean} True if key column.
   * @private
   */
  isKeyColumn(expr, primaryKey) {
    if (!expr) return false;

    if (expr.type === QUERY_AST_NODE.COLUMN_REF) {
      const column = expr.column || expr.name;
      return column?.toLowerCase() === primaryKey.toLowerCase();
    }

    return false;
  }

  /**
   * Extract literal value from expression.
   * @param {Object} expr - Expression AST.
   * @return {*} Literal value or undefined.
   * @private
   */
  extractLiteralValue(expr) {
    if (!expr) return undefined;

    if (expr.type === QUERY_AST_NODE.LITERAL) {
      return expr.value;
    }

    return undefined;
  }

  /**
   * Find partitions matching key conditions.
   * @param {Array} partitions - Available partitions.
   * @param {Object} conditions - Key conditions.
   * @return {Array} Matching partitions.
   * @private
   */
  findMatchingPartitions(partitions, conditions) {
    switch (conditions.type) {
    case 'equals':
      return this.findPartitionsForValues(partitions, conditions.values);

    case 'in':
      return this.findPartitionsForValues(partitions, conditions.values);

    case 'range':
      return this.findPartitionsForRange(partitions, conditions);

    default:
      return partitions;
    }
  }

  /**
   * Find partitions containing specific values.
   * @param {Array} partitions - Available partitions.
   * @param {Array} values - Values to find.
   * @return {Array} Matching partitions.
   * @private
   */
  findPartitionsForValues(partitions, values) {
    const matching = new Set();

    for (const value of values) {
      for (const partition of partitions) {
        if (this.isValueInPartition(value, partition)) {
          matching.add(partition);
        }
      }
    }

    return Array.from(matching);
  }

  /**
   * Find partitions overlapping with a range.
   * @param {Array} partitions - Available partitions.
   * @param {Object} conditions - Range conditions.
   * @return {Array} Matching partitions.
   * @private
   */
  findPartitionsForRange(partitions, conditions) {
    return partitions.filter((partition) =>
      this.rangeOverlaps(partition, conditions),
    );
  }

  /**
   * Check if a value falls within a partition's range.
   * @param {*} value - Value to check.
   * @param {Object} partition - Partition with key range.
   * @return {boolean} True if value in partition.
   * @private
   */
  isValueInPartition(value, partition) {
    // Use 'in' operator to check property existence since null is a valid value
    const start = 'partition_key_start' in partition ?
      partition.partition_key_start : partition.keyRange?.start;
    const end = 'partition_key_end' in partition ?
      partition.partition_key_end : partition.keyRange?.end;

    // NULL/undefined start means unbounded lower (negative infinity)
    // NULL/undefined end means unbounded upper (positive infinity)
    if ((start === null || start === undefined) &&
        (end === null || end === undefined)) {
      return true;
    }

    if (start === null || start === undefined) {
      return this.compareValues(value, end) < 0;
    }

    if (end === null || end === undefined) {
      return this.compareValues(value, start) >= 0;
    }

    return this.compareValues(value, start) >= 0 &&
           this.compareValues(value, end) < 0;
  }

  /**
   * Check if partition range overlaps with query range.
   * @param {Object} partition - Partition with key range.
   * @param {Object} conditions - Query range conditions.
   * @return {boolean} True if ranges overlap.
   * @private
   */
  rangeOverlaps(partition, conditions) {
    // Use 'in' operator to check property existence since null is a valid value
    const pStart = 'partition_key_start' in partition ?
      partition.partition_key_start : partition.keyRange?.start;
    const pEnd = 'partition_key_end' in partition ?
      partition.partition_key_end : partition.keyRange?.end;
    const {low, high, lowInclusive, highInclusive} = conditions;

    // Check if partition range overlaps with query range
    // Partition: [pStart, pEnd)
    // Query: [low, high] or variations based on inclusive flags

    // If partition ends before query starts, no overlap
    if (pEnd !== null && pEnd !== undefined && low !== null) {
      const cmp = this.compareValues(pEnd, low);
      if (cmp < 0 || (cmp === 0 && !lowInclusive)) {
        return false;
      }
    }

    // If partition starts after query ends, no overlap
    if (pStart !== null && pStart !== undefined && high !== null) {
      const cmp = this.compareValues(pStart, high);
      if (cmp > 0 || (cmp === 0 && !highInclusive)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Compare two values for ordering.
   * @param {*} a - First value.
   * @param {*} b - Second value.
   * @return {number} Comparison result (-1, 0, 1).
   * @private
   */
  compareValues(a, b) {
    if (a === b) return 0;
    if (a === null) return -1;
    if (b === null) return 1;

    if (typeof a === 'string' && typeof b === 'string') {
      return a.localeCompare(b);
    }

    if (typeof a === 'number' && typeof b === 'number') {
      return a - b;
    }

    // Convert to strings for comparison
    return String(a).localeCompare(String(b));
  }

  /**
   * Resolve partition for a single key value (for INSERT/UPDATE/DELETE).
   * @param {string} tableName - Table name.
   * @param {*} keyValue - Primary key value.
   * @param {Array} partitions - Available partitions.
   * @return {string|null} Partition ID or null.
   */
  resolvePartitionForKey(tableName, keyValue, partitions) {
    if (!partitions || partitions.length === 0) {
      return null;
    }

    for (const partition of partitions) {
      if (this.isValueInPartition(keyValue, partition)) {
        return partition.partition_id || partition.partitionId;
      }
    }

    this.logger.warn(QUERY_LOG_MSG.NO_PARTITION_FOR_KEY, {tableName, keyValue});
    return null;
  }

  /**
   * Get all partitions for a table (for scatter-gather).
   * @param {string} tableName - Table name.
   * @param {Array} partitions - Available partitions.
   * @return {Array} All partition IDs.
   */
  getAllPartitions(tableName, partitions) {
    if (!partitions || partitions.length === 0) {
      return [];
    }
    return partitions.map((p) => p.partition_id || p.partitionId);
  }
}

export {PartitionResolver};
