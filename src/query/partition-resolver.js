/**
 * Partition Resolver - Routes queries to appropriate partitions.
 * Implements partition resolution based on PRIMARY KEY filters.
 * Requirements: 20.6, 20.7
 */

import {LoggingService} from '../logging/logging-service.js';
import {compareRoutingKeys} from '../partition/split-key-comparator.js';
import {
  decodePartitionBoundaryValue,
  resolveDeclaredPartitionKeyType,
  resolveDeclaredPrimaryKeyColumns,
} from '../partition/partition-boundary-representation.js';
import {
  QUERY_AST_NODE,
  QUERY_LOG_MSG,
  QUERY_OPERATOR,
  QUERY_SUBSYSTEM,
} from './query-constants.js';
import {DISTRIBUTED_PREDICATE_SHAPE as PREDICATE_SHAPE} from
  './distributed/distributed-query-plan-constants.js';
import {
  KEY_CONDITION_TYPE,
  applyBinaryKeyCondition,
  createInitialKeyConditions,
  decodeCandidateValue,
  extractConditionValue,
  extractRawPartitionBounds,
  isEndBeforeLow,
  isNil,
  isStartAfterHigh,
  resolvePartitionKeyType,
  resolvePredicateShape,
} from './partition-resolver-key-conditions.js';
import {
  findTableInCache,
  resolveColumnType,
  resolveCompositeKeyPartitions,
} from './partition-resolver-composite.js';

const LOCAL_AST_NODE_BINARY_EXPR = 'binary_expr';
const LOCAL_AST_NODE_IN_EXPR = 'in_expr';
const LOCAL_AST_NODE_BETWEEN_EXPR = 'between_expr';

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
   * Record the outcome of partition resolution.
   * @param {string} tableName - Target table name.
   * @param {string} predicateShape - Resolved predicate shape.
   * @param {string[]} keyColumns - Key column names.
   * @param {number} partitionCount - Number of matched partitions.
   * @private
   */
  recordResolution(tableName, predicateShape, keyColumns, partitionCount) {
    this.lastResolutionInfo = Object.freeze({
      tableName,
      predicateShape,
      keyColumns,
      partitionCount,
    });
  }

  /**
   * Resolve partitions for a single primary key column.
   * @param {Object} whereClause - WHERE clause AST.
   * @param {string[]} primaryKeyColumns - Primary key columns.
   * @param {Array} partitions - Candidate partitions.
   * @param {Object} resolutionContext - Resolution context.
   * @param {Object|null} tableInfo - Table metadata row.
   * @return {{partitionIds: string[], predicateShape: string}}
   * @private
   */
  resolveSingleKeyPartitions(
    whereClause,
    primaryKeyColumns,
    partitions,
    resolutionContext,
    tableInfo,
  ) {
    const primaryKey = primaryKeyColumns[0];
    const keyType = resolveDeclaredPartitionKeyType(tableInfo, primaryKeyColumns) ||
      partitions[0]?.partition_key_type ||
      partitions[0]?.partitionKeyType ||
      null;

    const keyConditions = this.extractKeyConditions(
      whereClause,
      primaryKey,
      resolutionContext,
      keyType,
    );

    if (!keyConditions) {
      this.logger.debug(QUERY_LOG_MSG.NO_KEY_CONDITIONS, {
        partitionCount: partitions.length,
      });
      return {
        partitionIds: this.getAllPartitions(partitions),
        predicateShape: PREDICATE_SHAPE.SCATTER,
      };
    }

    if (keyConditions.contradiction) {
      return {
        partitionIds: [],
        predicateShape: PREDICATE_SHAPE.POINT,
      };
    }

    const matchingPartitions = this.findMatchingPartitions(
      partitions,
      keyConditions,
      tableInfo,
    );

    this.logger.debug(QUERY_LOG_MSG.RESOLVED_PARTITIONS, {
      keyConditions,
      matchingPartitions: matchingPartitions.length,
      totalPartitions: partitions.length,
    });

    return {
      partitionIds: matchingPartitions.map((p) => p.partition_id || p.partitionId),
      predicateShape: keyConditions.predicateShape || PREDICATE_SHAPE.SCATTER,
    };
  }

  /**
   * Resolve partitions for a query.
   * @param {string} tableName - Table name.
   * @param {Object} whereClause - Parsed WHERE clause AST.
   * @param {Array} partitions - Available partitions for the table.
   * @param {Object} [options={}] - Query options.
   * @return {Array} Array of partition IDs to query.
   */
  resolvePartitions(tableName, whereClause, partitions, options = {}) {
    if (!partitions || partitions.length === 0) {
      this.logger.warn(QUERY_LOG_MSG.NO_PARTITIONS_FOR_TABLE, {tableName});
      return [];
    }

    const resolutionContext = this.createResolutionContext(options);
    const tableInfo = options?.tableInfo || this.getTableInfo(tableName);
    const primaryKeyColumns = this.resolvePrimaryKeyColumns(tableInfo, options);

    if (primaryKeyColumns.length === 0) {
      const partitionIds = this.getAllPartitions(partitions);
      this.recordResolution(
        tableName,
        PREDICATE_SHAPE.SCATTER,
        primaryKeyColumns,
        partitionIds.length,
      );
      return partitionIds;
    }

    const resolution = primaryKeyColumns.length > 1 ?
      this.resolveCompositeKeyPartitions(
        whereClause,
        primaryKeyColumns,
        partitions,
        resolutionContext,
        tableName,
        tableInfo,
      ) :
      this.resolveSingleKeyPartitions(
        whereClause,
        primaryKeyColumns,
        partitions,
        resolutionContext,
        tableInfo,
      );

    this.recordResolution(
      tableName,
      resolution.predicateShape,
      primaryKeyColumns,
      resolution.partitionIds.length,
    );
    return resolution.partitionIds;
  }

  /**
   * Resolve key-column metadata for routing.
   * @param {Object|null} tableInfo - Table metadata row.
   * @param {Object} options - Resolve options.
   * @return {string[]} Ordered key column names.
   * @private
   */
  resolvePrimaryKeyColumns(tableInfo, options) {
    return resolveDeclaredPrimaryKeyColumns(tableInfo, options);
  }

  /**
   * Create an immutable resolution context.
   * @param {Object} options - Resolver options.
   * @return {Object} Resolution context.
   * @private
   */
  createResolutionContext(options) {
    const hasParams = Array.isArray(options?.params);
    const params = hasParams ? options.params : [];
    const tableAliases = Array.isArray(options?.tableAliases) ?
      options.tableAliases.map((alias) => String(alias).toLowerCase()) :
      null;
    return {
      params,
      hasParams,
      tableAliases,
      parameterState: {nextIndex: 0},
    };
  }

  /**
   * Resolve composite-key equality predicates when all key columns are bound.
   * @param {Object} whereClause - WHERE clause AST.
   * @param {string[]} keyColumns - Composite key columns.
   * @param {Object[]} partitions - Candidate partitions.
   * @param {Object} resolutionContext - Resolution context.
   * @param {string|null} [tableName=null] - Table name.
   * @param {Object|null} [tableInfo=null] - Table metadata.
   * @return {{partitionIds: string[], predicateShape: string}}
   * @private
   */
  resolveCompositeKeyPartitions(
    whereClause,
    keyColumns,
    partitions,
    resolutionContext,
    tableName = null,
    tableInfo = null,
  ) {
    return resolveCompositeKeyPartitions({
      whereClause,
      keyColumns,
      partitions,
      resolutionContext,
      tableName,
      tableInfo,
      resolver: this,
    });
  }

  /**
   * Resolve column type from table metadata schema.
   * @param {Object|null} tableInfo - Table metadata.
   * @param {string} columnName - Target column name.
   * @return {string|null} Normalized key type or null.
   * @private
   */
  resolveColumnType(tableInfo, columnName) {
    return resolveColumnType(tableInfo, columnName);
  }

  /**
   * Get table information from system cache.
   * @param {string} tableName - Table name.
   * @return {Object|null} Table info or null.
   * @private
   */
  getTableInfo(tableName) {
    return findTableInCache(this.systemCache, tableName);
  }

  /**
   * Extract PRIMARY KEY conditions from WHERE clause.
   * @param {Object} whereClause - Parsed WHERE clause AST.
   * @param {string} primaryKey - Primary key column name.
   * @param {Object} resolutionContext - Resolution context.
   * @param {string|null} [keyType=null] - Declared key type.
   * @return {Object|null} Key conditions or null if no key filter.
   * @private
   */
  extractKeyConditions(whereClause, primaryKey, resolutionContext, keyType = null) {
    if (!whereClause) {
      return null;
    }

    const conditions = createInitialKeyConditions();
    const found = this.findKeyConditions(
      whereClause,
      primaryKey,
      conditions,
      resolutionContext,
      keyType,
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
   * @param {Object} resolutionContext - Resolution context.
   * @param {string|null} [keyType=null] - Declared key type.
   * @return {boolean} True if key conditions found.
   * @private
   */
  findKeyConditions(expr, primaryKey, conditions, resolutionContext, keyType = null) {
    if (!expr) return false;

    if (expr.type === QUERY_AST_NODE.BINARY || expr.type === LOCAL_AST_NODE_BINARY_EXPR) {
      return this.handleBinaryExpr(expr, primaryKey, conditions, resolutionContext, keyType);
    }
    if (expr.type === QUERY_AST_NODE.IN || expr.type === LOCAL_AST_NODE_IN_EXPR) {
      return this.handleInExpr(expr, primaryKey, conditions, resolutionContext, keyType);
    }
    if (expr.type === QUERY_AST_NODE.BETWEEN || expr.type === LOCAL_AST_NODE_BETWEEN_EXPR) {
      return this.handleBetweenExpr(expr, primaryKey, conditions, resolutionContext, keyType);
    }
    return false;
  }

  /**
   * Handle binary expression for key extraction.
   * @param {Object} expr - Binary expression.
   * @param {string} primaryKey - Primary key column.
   * @param {Object} conditions - Conditions accumulator.
   * @param {Object} resolutionContext - Resolution context.
   * @param {string|null} [keyType=null] - Declared key type.
   * @return {boolean} True if key condition found.
   * @private
   */
  handleBinaryExpr(expr, primaryKey, conditions, resolutionContext, keyType = null) {
    const {operator, left, right} = expr;

    // Handle AND - both sides may have key conditions
    if (operator === QUERY_OPERATOR.AND) {
      const leftFound = this.findKeyConditions(
        left,
        primaryKey,
        conditions,
        resolutionContext,
        keyType,
      );
      const rightFound = this.findKeyConditions(
        right,
        primaryKey,
        conditions,
        resolutionContext,
        keyType,
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
    const value = this.extractLiteralValue(valueExpr, resolutionContext, keyType);

    if (value === undefined) return false;

    return this.applyBinaryKeyCondition(conditions, rawOperator, value);
  }

  /**
   * Apply one binary key condition with intersection and contradiction detection.
   * @param {Object} conditions - Key conditions accumulator.
   * @param {string} operator - Comparison operator.
   * @param {*} value - Literal value.
   * @return {boolean}
   * @private
   */
  applyBinaryKeyCondition(conditions, operator, value) {
    return applyBinaryKeyCondition(
      conditions,
      operator,
      value,
      (a, b) => this.compareValues(a, b),
    );
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
   * @param {Object} resolutionContext - Resolution context.
   * @param {string|null} [keyType=null] - Declared key type.
   * @return {boolean} True if key condition found.
   * @private
   */
  handleInExpr(expr, primaryKey, conditions, resolutionContext, keyType = null) {
    if (expr.not === true) {
      return false;
    }
    if (!this.isKeyColumn(expr.expression, primaryKey, resolutionContext)) {
      return false;
    }

    const rawValues = Array.isArray(expr.values) ? expr.values : [];
    const values = [];
    for (const valueExpr of rawValues) {
      const value = this.extractLiteralValue(valueExpr, resolutionContext, keyType);
      if (value === undefined) {
        return false;
      }
      values.push(value);
    }
    if (values.length === 0 || values.length !== rawValues.length) {
      return false;
    }

    conditions.type = KEY_CONDITION_TYPE.IN;
    conditions.values = values;
    return true;
  }

  /**
   * Handle BETWEEN expression for key extraction.
   * @param {Object} expr - BETWEEN expression.
   * @param {string} primaryKey - Primary key column.
   * @param {Object} conditions - Conditions accumulator.
   * @param {Object} resolutionContext - Resolution context.
   * @param {string|null} [keyType=null] - Declared key type.
   * @return {boolean} True if key condition found.
   * @private
   */
  handleBetweenExpr(expr, primaryKey, conditions, resolutionContext, keyType = null) {
    if (!this.isKeyColumn(expr.expression, primaryKey, resolutionContext)) {
      return false;
    }

    const low = this.extractLiteralValue(expr.low, resolutionContext, keyType);
    const high = this.extractLiteralValue(expr.high, resolutionContext, keyType);

    if (low === undefined || high === undefined) {
      return false;
    }

    this.applyBinaryKeyCondition(conditions, QUERY_OPERATOR.GREATER_THAN_OR_EQUAL, low);
    this.applyBinaryKeyCondition(conditions, QUERY_OPERATOR.LESS_THAN_OR_EQUAL, high);
    conditions.fromBetween = true;
    return true;
  }

  /**
   * Check if expression is a reference to the primary key column.
   * @param {Object} expr - Expression AST.
   * @param {string} primaryKey - Primary key column name.
   * @param {Object} resolutionContext - Resolution context.
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
   * Extract literal or parameter value from expression.
   * @param {Object} expr - Expression AST.
   * @param {Object} resolutionContext - Resolution context.
   * @param {string|null} [keyType=null] - Declared key type.
   * @return {*} Literal value or undefined.
   * @private
   */
  extractLiteralValue(expr, resolutionContext, keyType = null) {
    return extractConditionValue(expr, resolutionContext, keyType);
  }

  /**
   * Find partitions matching key conditions.
   * @param {Array} partitions - Available partitions.
   * @param {Object} conditions - Key conditions.
   * @param {Object|null} [tableInfo=null] - Table metadata row.
   * @return {Array} Matching partitions.
   * @private
   */
  findMatchingPartitions(partitions, conditions, tableInfo = null) {
    if (conditions.contradiction) {
      return [];
    }
    switch (conditions.type) {
    case KEY_CONDITION_TYPE.EQUALS:
    case KEY_CONDITION_TYPE.IN:
      return this.findPartitionsForValues(partitions, conditions.values, tableInfo);

    case KEY_CONDITION_TYPE.RANGE:
      return this.findPartitionsForRange(partitions, conditions, tableInfo);

    default:
      return partitions;
    }
  }

  /**
   * Find partitions containing specific values.
   * @param {Array} partitions - Available partitions.
   * @param {Array} values - Values to find.
   * @param {Object|null} [tableInfo=null] - Table metadata row.
   * @return {Array} Matching partitions.
   * @private
   */
  findPartitionsForValues(partitions, values, tableInfo = null) {
    const matching = new Set();

    for (const value of values) {
      for (const partition of partitions) {
        if (this.isValueInPartition(value, partition, tableInfo)) {
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
   * @param {Object|null} [tableInfo=null] - Table metadata row.
   * @return {Array} Matching partitions.
   * @private
   */
  findPartitionsForRange(partitions, conditions, tableInfo = null) {
    return partitions.filter((partition) =>
      this.rangeOverlaps(partition, conditions, tableInfo),
    );
  }

  /**
   * Check if a value falls within a partition's range.
   * @param {*} value - Value to check.
   * @param {Object} partition - Partition with key range.
   * @param {Object|null} [tableInfo=null] - Table metadata row.
   * @return {boolean} True if value in partition.
   * @private
   */
  isValueInPartition(value, partition, tableInfo = null) {
    const keyType = resolvePartitionKeyType(partition, tableInfo);
    const compValue = decodeCandidateValue(value, keyType);

    const {rawStart, rawEnd} = extractRawPartitionBounds(partition);
    if (isNil(rawStart) && isNil(rawEnd)) {
      return true;
    }

    const start = decodePartitionBoundaryValue(rawStart, keyType);
    const end = decodePartitionBoundaryValue(rawEnd, keyType);

    if (isNil(start)) {
      return this.compareValues(compValue, end) < 0;
    }
    if (isNil(end)) {
      return this.compareValues(compValue, start) >= 0;
    }
    return this.compareValues(compValue, start) >= 0 &&
           this.compareValues(compValue, end) < 0;
  }

  /**
   * Check if partition range overlaps with query range.
   * @param {Object} partition - Partition with key range.
   * @param {Object} conditions - Query range conditions.
   * @param {Object|null} [tableInfo=null] - Table metadata row.
   * @return {boolean} True if ranges overlap.
   * @private
   */
  rangeOverlaps(partition, conditions, tableInfo = null) {
    const keyType = resolvePartitionKeyType(partition, tableInfo);
    const {low, high, lowInclusive, highInclusive} = conditions;
    const compLow = decodeCandidateValue(low, keyType);
    const compHigh = decodeCandidateValue(high, keyType);

    const {rawStart, rawEnd} = extractRawPartitionBounds(partition);
    if (isNil(rawStart) && isNil(rawEnd)) {
      return true;
    }

    const pStart = decodePartitionBoundaryValue(rawStart, keyType);
    const pEnd = decodePartitionBoundaryValue(rawEnd, keyType);

    if (isEndBeforeLow(pEnd, compLow, lowInclusive, (a, b) => this.compareValues(a, b))) {
      return false;
    }
    if (isStartAfterHigh(pStart, compHigh, highInclusive, (a, b) => this.compareValues(a, b))) {
      return false;
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
    return compareRoutingKeys(a, b);
  }

  /**
   * Resolve partition for a single key value (for INSERT/UPDATE/DELETE).
   * @param {string} tableName - Table name.
   * @param {*} keyValue - Primary key value.
   * @param {Array} partitions - Available partitions.
   * @param {Object} [options={}] - Options containing tableInfo.
   * @return {string|null} Partition ID or null.
   */
  resolvePartitionForKey(tableName, keyValue, partitions, options = {}) {
    if (!partitions || partitions.length === 0 || keyValue === null || keyValue === undefined) {
      return null;
    }

    const tableInfo = options?.tableInfo || this.getTableInfo(tableName);
    for (const partition of partitions) {
      if (this.isValueInPartition(keyValue, partition, tableInfo)) {
        return partition.partition_id || partition.partitionId;
      }
    }

    this.logger.warn(QUERY_LOG_MSG.NO_PARTITION_FOR_KEY, {tableName, keyValue});
    return null;
  }

  /**
   * Get all partitions for a table (for scatter-gather).
   * Supports both (tableName, partitions) and (partitions).
   * @param {string|Array} tableNameOrPartitions - Table name or partition list.
   * @param {Array|null} [partitions=null] - Available partitions.
   * @return {Array} All partition IDs.
   */
  getAllPartitions(tableNameOrPartitions, partitions = null) {
    const list = Array.isArray(tableNameOrPartitions) ?
      tableNameOrPartitions :
      partitions;
    if (!list || list.length === 0) {
      return [];
    }
    return list.map((p) => p.partition_id || p.partitionId);
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
