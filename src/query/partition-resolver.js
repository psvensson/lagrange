/**
 * Partition Resolver - Routes queries to appropriate partitions.
 * Implements partition resolution based on PRIMARY KEY filters.
 * Requirements: 20.6, 20.7
 */

import {LoggingService} from '../logging/logging-service.js';
import {NUM, TABLES, TYPEOF} from '../constants/index.js';
import {
  QUERY_AST_NODE,
  QUERY_DEFAULT_VALUE,
  QUERY_LOG_MSG,
  QUERY_OPERATOR,
  QUERY_SUBSYSTEM,
} from './query-constants.js';
import {DISTRIBUTED_PREDICATE_SHAPE as PREDICATE_SHAPE} from
  './distributed/distributed-query-plan-constants.js';
import {
  KEY_CONDITION_TYPE,
  createInitialKeyConditions,
  resolvePredicateShape,
} from './partition-resolver-key-conditions.js';

const LOCAL_NUM_ONE = 1;
const LOCAL_NUM_ZERO = 0;

const UNARY_OPERATOR = Object.freeze({
  PLUS: '+',
  MINUS: '-',
});

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
    this.lastResolutionInfo = null;
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
    } catch (_logErr) {
      // Logging not available — fall through to console
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
  resolvePartitions(tableName, whereClause, partitions, options = {}) {
    if (!partitions || partitions.length === NUM.ZERO) {
      this.logger.warn(QUERY_LOG_MSG.NO_PARTITIONS_FOR_TABLE, {tableName});
      return [];
    }

    const resolutionContext = this.createResolutionContext(options);
    const tableInfo = this.getTableInfo(tableName);
    const primaryKeyColumns = this.resolvePrimaryKeyColumns(tableInfo, options);

    if (primaryKeyColumns.length > LOCAL_NUM_ONE) {
      const compositeResolution = this.resolveCompositeKeyPartitions(
        whereClause,
        primaryKeyColumns,
        partitions,
        resolutionContext,
      );
      this.lastResolutionInfo = Object.freeze({
        tableName,
        predicateShape: compositeResolution.predicateShape,
        keyColumns: primaryKeyColumns,
        partitionCount: compositeResolution.partitionIds.length,
      });
      return compositeResolution.partitionIds;
    }

    const primaryKey =
      primaryKeyColumns[NUM.ZERO] || QUERY_DEFAULT_VALUE.PRIMARY_KEY;

    // Extract key conditions from WHERE clause
    const keyConditions = this.extractKeyConditions(
      whereClause,
      primaryKey,
      resolutionContext,
    );

    if (!keyConditions) {
      // No PRIMARY KEY filter - scatter-gather to all partitions
      this.logger.debug(QUERY_LOG_MSG.NO_KEY_CONDITIONS, {
        tableName,
        partitionCount: partitions.length,
      });
      const partitionIds = partitions.map((partition) =>
        partition.partition_id || partition.partitionId,
      );
      this.lastResolutionInfo = Object.freeze({
        tableName,
        predicateShape: PREDICATE_SHAPE.SCATTER,
        keyColumns: primaryKeyColumns,
        partitionCount: partitionIds.length,
      });
      return partitionIds;
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
    const partitionIds = matchingPartitions.map((partition) =>
      partition.partition_id || partition.partitionId,
    );
    this.lastResolutionInfo = Object.freeze({
      tableName,
      predicateShape: keyConditions.predicateShape || PREDICATE_SHAPE.SCATTER,
      keyColumns: primaryKeyColumns,
      partitionCount: partitionIds.length,
    });
    return partitionIds;
  }

  /**
   * Resolve key-column metadata for routing.
   * @param {Object|null} tableInfo - Table metadata row.
   * @param {Object} options - Resolve options.
   * @return {string[]} Ordered key column names.
   * @private
   */
  resolvePrimaryKeyColumns(tableInfo, options) {
    if (Array.isArray(options.keyColumns) &&
      options.keyColumns.length > NUM.ZERO) {
      return options.keyColumns;
    }

    const primaryKey = tableInfo?.primaryKey || tableInfo?.primary_key;
    if (Array.isArray(primaryKey) && primaryKey.length > NUM.ZERO) {
      return primaryKey;
    }
    if (typeof primaryKey === TYPEOF.STRING &&
      primaryKey.length > NUM.ZERO) {
      return [primaryKey];
    }
    return [QUERY_DEFAULT_VALUE.PRIMARY_KEY];
  }

  /**
   * Create an immutable resolution context.
   * @param {Object} options - Resolver options.
   * @return {Object} Resolution context.
   * @private
   */
  createResolutionContext(options) {
    const params = Array.isArray(options.params) ? options.params : [];
    const tableAliases = Array.isArray(options.tableAliases) ?
      options.tableAliases.map((alias) => String(alias).toLowerCase()) :
      null;
    return {
      params,
      tableAliases,
      parameterState: {nextIndex: NUM.ZERO},
    };
  }

  /**
   * Resolve composite-key equality predicates when all key columns are bound.
   * @param {Object} whereClause - WHERE clause AST.
   * @param {string[]} keyColumns - Composite key columns.
   * @param {Object[]} partitions - Candidate partitions.
   * @param {Object} resolutionContext - Resolution context.
   * @return {{partitionIds: string[], predicateShape: string}}
   * @private
   */
  resolveCompositeKeyPartitions(
    whereClause,
    keyColumns,
    partitions,
    resolutionContext,
  ) {
    const values = [];
    for (const keyColumn of keyColumns) {
      const keyConditions = this.extractKeyConditions(
        whereClause,
        keyColumn,
        resolutionContext,
      );
      if (!keyConditions ||
        keyConditions.type !== KEY_CONDITION_TYPE.EQUALS ||
        keyConditions.values.length !== LOCAL_NUM_ONE) {
        return {
          partitionIds: partitions.map((partition) =>
            partition.partition_id || partition.partitionId,
          ),
          predicateShape: PREDICATE_SHAPE.SCATTER,
        };
      }
      values.push(keyConditions.values[NUM.ZERO]);
    }

    const serializedCompositeKey = JSON.stringify(values);
    const partitionId = this.resolvePartitionForKey(
      null,
      serializedCompositeKey,
      partitions,
    );
    if (!partitionId) {
      return {
        partitionIds: [],
        predicateShape: PREDICATE_SHAPE.EQ,
      };
    }
    return {
      partitionIds: [partitionId],
      predicateShape: PREDICATE_SHAPE.EQ,
    };
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
      if (typeof this.systemCache.get === TYPEOF.FUNCTION) {
        const byPrimaryKey = this.systemCache.get(TABLES.TABLES, tableName);
        if (byPrimaryKey) {
          return byPrimaryKey;
        }
      }
      if (typeof this.systemCache.find === TYPEOF.FUNCTION) {
        const found = this.systemCache.find(TABLES.TABLES, (t) =>
          t.table_name === tableName || t.tableName === tableName,
        );
        if (found) {
          return found;
        }
      }
      if (typeof this.systemCache.getAll === TYPEOF.FUNCTION) {
        const tables = this.systemCache.getAll(TABLES.TABLES) || [];
        return tables.find((table) =>
          table.table_name === tableName ||
          table.tableName === tableName ||
          table.table_id === tableName ||
          table.tableId === tableName,
        ) || null;
      }
    } catch (_cacheErr) {
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
  extractKeyConditions(whereClause, primaryKey, resolutionContext) {
    if (!whereClause) {
      return null;
    }

    const conditions = createInitialKeyConditions();
    const found = this.findKeyConditions(
      whereClause,
      primaryKey,
      conditions,
      resolutionContext,
    );
    if (found) {
      conditions.predicateShape = resolvePredicateShape(conditions);
    }
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
  findKeyConditions(expr, primaryKey, conditions, resolutionContext) {
    if (!expr) return false;

    switch (expr.type) {
    case QUERY_AST_NODE.BINARY:
      return this.handleBinaryExpr(
        expr,
        primaryKey,
        conditions,
        resolutionContext,
      );

    case QUERY_AST_NODE.IN:
      return this.handleInExpr(
        expr,
        primaryKey,
        conditions,
        resolutionContext,
      );

    case QUERY_AST_NODE.BETWEEN:
      return this.handleBetweenExpr(
        expr,
        primaryKey,
        conditions,
        resolutionContext,
      );

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
  handleBinaryExpr(expr, primaryKey, conditions, resolutionContext) {
    const {operator, left, right} = expr;

    // Handle AND - both sides may have key conditions
    if (operator === QUERY_OPERATOR.AND) {
      const leftFound = this.findKeyConditions(
        left,
        primaryKey,
        conditions,
        resolutionContext,
      );
      const rightFound = this.findKeyConditions(
        right,
        primaryKey,
        conditions,
        resolutionContext,
      );
      return leftFound || rightFound;
    }

    // Handle OR - need all branches to have key conditions for optimization
    if (operator === QUERY_OPERATOR.OR) {
      // For OR, we can't easily optimize unless all branches are on the key
      // For now, return false to trigger scatter-gather
      return false;
    }

    // Check if this is a comparison on the primary key
    const leftIsKey = this.isKeyColumn(left, primaryKey, resolutionContext);
    const rightIsKey = this.isKeyColumn(right, primaryKey, resolutionContext);
    const keyColumn = leftIsKey ? left : rightIsKey ? right : null;

    if (!keyColumn) return false;

    const rawOperator = leftIsKey ?
      operator :
      this.invertComparisonOperator(operator);
    const valueExpr = keyColumn === left ? right : left;
    const value = this.extractLiteralValue(valueExpr, resolutionContext);

    if (value === undefined) return false;

    // Handle different operators
    switch (rawOperator) {
    case QUERY_OPERATOR.EQUALS:
      conditions.type = KEY_CONDITION_TYPE.EQUALS;
      conditions.values.push(value);
      return true;

    case QUERY_OPERATOR.LESS_THAN:
      conditions.type = KEY_CONDITION_TYPE.RANGE;
      conditions.high = value;
      conditions.highInclusive = false;
      return true;

    case QUERY_OPERATOR.LESS_THAN_OR_EQUAL:
      conditions.type = KEY_CONDITION_TYPE.RANGE;
      conditions.high = value;
      conditions.highInclusive = true;
      return true;

    case QUERY_OPERATOR.GREATER_THAN:
      conditions.type = KEY_CONDITION_TYPE.RANGE;
      conditions.low = value;
      conditions.lowInclusive = false;
      return true;

    case QUERY_OPERATOR.GREATER_THAN_OR_EQUAL:
      conditions.type = KEY_CONDITION_TYPE.RANGE;
      conditions.low = value;
      conditions.lowInclusive = true;
      return true;

    default:
      return false;
    }
  }

  /**
   * Invert a comparison operator when key column is on the right side.
   * @param {string} operator - Original operator.
   * @return {string} Inverted operator.
   * @private
   */
  invertComparisonOperator(operator) {
    switch (operator) {
    case QUERY_OPERATOR.LESS_THAN:
      return QUERY_OPERATOR.GREATER_THAN;
    case QUERY_OPERATOR.LESS_THAN_OR_EQUAL:
      return QUERY_OPERATOR.GREATER_THAN_OR_EQUAL;
    case QUERY_OPERATOR.GREATER_THAN:
      return QUERY_OPERATOR.LESS_THAN;
    case QUERY_OPERATOR.GREATER_THAN_OR_EQUAL:
      return QUERY_OPERATOR.LESS_THAN_OR_EQUAL;
    default:
      return operator;
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
  handleInExpr(expr, primaryKey, conditions, resolutionContext) {
    if (!this.isKeyColumn(expr.expression, primaryKey, resolutionContext)) {
      return false;
    }

    conditions.type = KEY_CONDITION_TYPE.IN;
    conditions.values = expr.values
      .map((valueExpr) =>
        this.extractLiteralValue(valueExpr, resolutionContext),
      )
      .filter((v) => v !== undefined);

    return conditions.values.length > NUM.ZERO;
  }

  /**
   * Handle BETWEEN expression for key extraction.
   * @param {Object} expr - BETWEEN expression.
   * @param {string} primaryKey - Primary key column.
   * @param {Object} conditions - Conditions accumulator.
   * @return {boolean} True if key condition found.
   * @private
   */
  handleBetweenExpr(expr, primaryKey, conditions, resolutionContext) {
    if (!this.isKeyColumn(expr.expression, primaryKey, resolutionContext)) {
      return false;
    }

    const low = this.extractLiteralValue(expr.low, resolutionContext);
    const high = this.extractLiteralValue(expr.high, resolutionContext);

    if (low === undefined || high === undefined) {
      return false;
    }

    conditions.type = KEY_CONDITION_TYPE.RANGE;
    conditions.low = low;
    conditions.high = high;
    conditions.lowInclusive = true;
    conditions.highInclusive = true;
    conditions.fromBetween = true;

    return true;
  }

  /**
   * Check if expression is a reference to the primary key column.
   * @param {Object} expr - Expression AST.
   * @param {string} primaryKey - Primary key column name.
   * @return {boolean} True if key column.
   * @private
   */
  isKeyColumn(expr, primaryKey, resolutionContext) {
    if (!expr) return false;

    if (expr.type === QUERY_AST_NODE.COLUMN_REF) {
      if (expr.table && resolutionContext.tableAliases) {
        const exprTable = String(expr.table).toLowerCase();
        if (!resolutionContext.tableAliases.includes(exprTable)) {
          return false;
        }
      }
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
  extractLiteralValue(expr, resolutionContext) {
    if (!expr) return undefined;

    if (expr.type === QUERY_AST_NODE.LITERAL) {
      return expr.value;
    }

    if (expr.type === QUERY_AST_NODE.PARAMETER) {
      if (typeof expr.index === TYPEOF.NUMBER &&
        expr.index >= NUM.ZERO &&
        expr.index < resolutionContext.params.length) {
        return resolutionContext.params[expr.index];
      }

      const fallbackIndex = resolutionContext.parameterState.nextIndex;
      resolutionContext.parameterState.nextIndex += NUM.ONE;
      return resolutionContext.params[fallbackIndex];
    }

    if (expr.type === QUERY_AST_NODE.UNARY &&
      (expr.operator === UNARY_OPERATOR.PLUS ||
        expr.operator === UNARY_OPERATOR.MINUS)) {
      const operand = this.extractLiteralValue(expr.operand, resolutionContext);
      if (operand === undefined) {
        return undefined;
      }
      return expr.operator === UNARY_OPERATOR.MINUS ?
        -Number(operand) :
        Number(operand);
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
    case KEY_CONDITION_TYPE.EQUALS:
      return this.findPartitionsForValues(partitions, conditions.values);

    case KEY_CONDITION_TYPE.IN:
      return this.findPartitionsForValues(partitions, conditions.values);

    case KEY_CONDITION_TYPE.RANGE:
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
      return this.compareValues(value, end) < LOCAL_NUM_ZERO;
    }

    if (end === null || end === undefined) {
      return this.compareValues(value, start) >= LOCAL_NUM_ZERO;
    }

    return this.compareValues(value, start) >= LOCAL_NUM_ZERO &&
           this.compareValues(value, end) < LOCAL_NUM_ZERO;
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
      if (cmp < LOCAL_NUM_ZERO || (cmp === LOCAL_NUM_ZERO && !lowInclusive)) {
        return false;
      }
    }

    // If partition starts after query ends, no overlap
    if (pStart !== null && pStart !== undefined && high !== null) {
      const cmp = this.compareValues(pStart, high);
      if (cmp > LOCAL_NUM_ZERO || (cmp === LOCAL_NUM_ZERO && !highInclusive)) {
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
    if (a === b) return NUM.ZERO;
    if (a === null) return NUM.NEGATIVE_ONE;
    if (b === null) return NUM.ONE;

    if (typeof a === TYPEOF.STRING && typeof b === TYPEOF.STRING) {
      return a.localeCompare(b);
    }

    if (typeof a === TYPEOF.NUMBER && typeof b === TYPEOF.NUMBER) {
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
    if (!partitions || partitions.length === NUM.ZERO) {
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
    if (!partitions || partitions.length === NUM.ZERO) {
      return [];
    }
    return partitions.map((p) => p.partition_id || p.partitionId);
  }

  /**
   * Return the most recent partition-resolution diagnostics.
   * @return {Object|null} Last resolution info.
   */
  getLastResolutionInfo() {
    return this.lastResolutionInfo;
  }
}

export {PartitionResolver};
