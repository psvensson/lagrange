/**
 * Query Executor - Executes queries across partitions in parallel.
 * Implements parallel query execution and result aggregation.
 * Requirements: 7.2, 7.4, 22.1, 22.2, 22.3, 22.4, 22.5, 22.6, 22.7
 */

import {LoggingService} from '../logging/logging-service.js';
import {HLCClockService} from '../hlc/hlc-clock-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';

/**
 * QueryExecutor handles parallel query execution across partitions
 * and aggregates results while preserving SQL semantics.
 * Supports distributed read-only queries with cross-partition JOINs
 * and aggregate functions (COUNT, SUM, AVG, MIN, MAX).
 */
class QueryExecutor {
  /**
   * Create a new query executor.
   * @param {Object} options - Configuration options.
   * @param {Object} options.partitionRegistry - Registry of partition services.
   * @param {Object} options.replicaRegistry - Registry of replica services for load distribution.
   * @param {string} options.nodeId - Node ID for HLC.
   */
  constructor(options = {}) {
    this.partitionRegistry = options.partitionRegistry || new Map();
    this.replicaRegistry = options.replicaRegistry || new Map();
    this.nodeId = options.nodeId || 'query-executor';
    this.hlcClock = new HLCClockService(this.nodeId);
    this.logger = this.initLogger();

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.queryTimeoutMs = config.get('query.timeoutMs') || 30000;
    this.maxParallelPartitions = config.get('query.maxParallelPartitions') || 1000;
    this.distributeReads = config.get('query.distributeReads') !== false;
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
        return loggingService.forSubsystem('query-executor');
      }
    } catch {
      // Logging not available
    }
    return console;
  }

  /**
   * Set the partition registry.
   * @param {Map|Object} registry - Partition registry.
   */
  setPartitionRegistry(registry) {
    this.partitionRegistry = registry;
  }

  /**
   * Set the replica registry for read load distribution.
   * @param {Map|Object} registry - Replica registry mapping partitionId to replica list.
   */
  setReplicaRegistry(registry) {
    this.replicaRegistry = registry;
  }

  /**
   * Get a partition service by ID, optionally selecting a replica for reads.
   * Implements read load distribution by routing to any available replica.
   * Requirements: 22.4, 22.5
   * @param {string} partitionId - Partition ID.
   * @param {boolean} forRead - If true, can route to any replica (not just leader).
   * @return {Object|null} Partition service or null.
   * @private
   */
  getPartition(partitionId, forRead = false) {
    // If read distribution is enabled and this is a read operation,
    // try to select a replica to distribute load
    if (forRead && this.distributeReads) {
      const replica = this.selectReplicaForRead(partitionId);
      if (replica) {
        return replica;
      }
    }

    // Fall back to partition registry
    if (this.partitionRegistry instanceof Map) {
      return this.partitionRegistry.get(partitionId);
    }
    return this.partitionRegistry[partitionId] || null;
  }

  /**
   * Select a replica for read operations to distribute load.
   * Requirements: 22.4, 22.5
   * @param {string} partitionId - Partition ID.
   * @return {Object|null} Selected replica or null.
   * @private
   */
  selectReplicaForRead(partitionId) {
    let replicas;

    if (this.replicaRegistry instanceof Map) {
      replicas = this.replicaRegistry.get(partitionId);
    } else {
      replicas = this.replicaRegistry[partitionId];
    }

    if (!replicas || replicas.length === 0) {
      return null;
    }

    // Filter to only active replicas
    const activeReplicas = replicas.filter((r) =>
      r.status === 'active' || r.status === undefined,
    );

    if (activeReplicas.length === 0) {
      return null;
    }

    // Simple round-robin or random selection for load distribution
    const index = Math.floor(Math.random() * activeReplicas.length);
    return activeReplicas[index];
  }

  /**
   * Execute a SELECT query across partitions in parallel.
   * Supports cross-partition queries including JOINs and aggregates.
   * Requirements: 22.1, 22.2, 22.3, 22.4, 22.5, 22.6, 22.7
   * @param {Object} ast - Parsed SELECT AST.
   * @param {Array} partitionIds - Partition IDs to query.
   * @param {Array} params - Query parameters.
   * @param {Object} options - Execution options.
   * @param {Map} options.joinPartitions - Map of table name to partition IDs for JOINs.
   * @return {Promise<Object>} Query result.
   */
  async executeSelect(ast, partitionIds, params = [], options = {}) {
    if (partitionIds.length === 0) {
      return {
        success: true,
        rows: [],
        count: 0,
        partitions: [],
      };
    }

    // Get consistent snapshot timestamp
    const queryTimestamp = this.hlcClock.now();

    this.logger.debug('Executing distributed SELECT', {
      partitionCount: partitionIds.length,
      timestamp: queryTimestamp.toString(),
      hasJoins: (ast.joins && ast.joins.length > 0) || false,
      hasAggregates: this.hasAggregates(ast),
    });

    // Check if this is a cross-partition JOIN query
    if (ast.joins && ast.joins.length > 0 && options.joinPartitions) {
      return this.executeCrossPartitionJoin(ast, partitionIds, params, options, queryTimestamp);
    }

    // Build SQL from AST
    const sql = this.buildSelectSQL(ast);

    // Execute on all partitions in parallel (read operations can go to any replica)
    const results = await this.executeOnPartitions(
      partitionIds,
      sql,
      params,
      queryTimestamp,
      true, // forRead = true for SELECT
    );

    // Aggregate results
    const aggregated = this.aggregateSelectResults(results, ast);

    return {
      success: true,
      rows: aggregated.rows,
      count: aggregated.rows.length,
      partitions: partitionIds,
      timestamp: queryTimestamp.toString(),
    };
  }

  /**
   * Execute a cross-partition JOIN query.
   * Requirements: 22.2, 22.3
   * @param {Object} ast - Parsed SELECT AST with JOINs.
   * @param {Array} mainPartitionIds - Partition IDs for main table.
   * @param {Array} params - Query parameters.
   * @param {Object} options - Execution options with joinPartitions map.
   * @param {Object} queryTimestamp - HLC timestamp for consistent snapshot.
   * @return {Promise<Object>} Query result.
   * @private
   */
  async executeCrossPartitionJoin(ast, mainPartitionIds, params, options, queryTimestamp) {
    const {joinPartitions} = options;

    this.logger.debug('Executing cross-partition JOIN', {
      mainTable: ast.from.name,
      mainPartitionCount: mainPartitionIds.length,
      joinCount: ast.joins.length,
    });

    // Strategy: Fetch data from all tables in parallel, then perform JOIN in memory
    // This is a simple hash-join approach suitable for moderate data sizes

    // 1. Fetch main table data from all partitions
    const mainTableSql = this.buildSelectSQLWithoutJoins(ast);
    const mainResults = await this.executeOnPartitions(
      mainPartitionIds,
      mainTableSql,
      params,
      queryTimestamp,
      true,
    );

    let mainRows = [];
    for (const result of mainResults) {
      if (result.success && result.rows) {
        mainRows = mainRows.concat(result.rows);
      }
    }

    // 2. Fetch joined table data from their partitions
    const joinedData = new Map(); // tableName -> rows

    for (const join of ast.joins) {
      const joinTableName = join.table.name;
      const joinTablePartitions = joinPartitions.get(joinTableName) || [];

      if (joinTablePartitions.length > 0) {
        const joinSql = `SELECT * FROM ${joinTableName}`;
        const joinResults = await this.executeOnPartitions(
          joinTablePartitions,
          joinSql,
          [],
          queryTimestamp,
          true,
        );

        let joinRows = [];
        for (const result of joinResults) {
          if (result.success && result.rows) {
            joinRows = joinRows.concat(result.rows);
          }
        }
        joinedData.set(joinTableName, joinRows);
      }
    }

    // 3. Perform in-memory JOIN
    let resultRows = mainRows;
    for (const join of ast.joins) {
      const joinTableName = join.table.name;
      const joinRows = joinedData.get(joinTableName) || [];
      resultRows = this.performJoin(resultRows, joinRows, join, ast.from.name, joinTableName);
    }

    // 4. Apply remaining clauses (WHERE on joined data, GROUP BY, etc.)
    const aggregated = this.aggregateSelectResults(
      [{success: true, rows: resultRows}],
      ast,
    );

    const allPartitions = [...mainPartitionIds];
    for (const partitions of joinPartitions.values()) {
      allPartitions.push(...partitions);
    }

    return {
      success: true,
      rows: aggregated.rows,
      count: aggregated.rows.length,
      partitions: [...new Set(allPartitions)],
      timestamp: queryTimestamp.toString(),
    };
  }

  /**
   * Perform an in-memory JOIN between two result sets.
   * @param {Array} leftRows - Left table rows.
   * @param {Array} rightRows - Right table rows.
   * @param {Object} join - JOIN clause AST.
   * @param {string} leftTableName - Left table name.
   * @param {string} rightTableName - Right table name.
   * @return {Array} Joined rows.
   * @private
   */
  performJoin(leftRows, rightRows, join, leftTableName, rightTableName) {
    const joinType = (join.joinType || 'INNER').toUpperCase();
    const condition = join.condition;

    // Extract join columns from condition
    const {leftColumn, rightColumn} = this.extractJoinColumns(
      condition,
      leftTableName,
      rightTableName,
    );

    if (!leftColumn || !rightColumn) {
      // Can't optimize, do nested loop join
      return this.nestedLoopJoin(leftRows, rightRows, condition, joinType);
    }

    // Build hash index on right table for efficient join
    const rightIndex = new Map();
    for (const row of rightRows) {
      const key = row[rightColumn];
      if (!rightIndex.has(key)) {
        rightIndex.set(key, []);
      }
      rightIndex.get(key).push(row);
    }

    const result = [];
    const matchedRight = new Set();

    for (const leftRow of leftRows) {
      const key = leftRow[leftColumn];
      const matches = rightIndex.get(key) || [];

      if (matches.length > 0) {
        for (const rightRow of matches) {
          result.push({...leftRow, ...rightRow});
          matchedRight.add(rightRow);
        }
      } else if (joinType === 'LEFT' || joinType === 'LEFT OUTER') {
        // Include left row with nulls for right columns
        const nullRight = {};
        if (rightRows.length > 0) {
          for (const col of Object.keys(rightRows[0])) {
            nullRight[col] = null;
          }
        }
        result.push({...leftRow, ...nullRight});
      }
    }

    // Handle RIGHT JOIN
    if (joinType === 'RIGHT' || joinType === 'RIGHT OUTER') {
      for (const rightRow of rightRows) {
        if (!matchedRight.has(rightRow)) {
          const nullLeft = {};
          if (leftRows.length > 0) {
            for (const col of Object.keys(leftRows[0])) {
              nullLeft[col] = null;
            }
          }
          result.push({...nullLeft, ...rightRow});
        }
      }
    }

    return result;
  }

  /**
   * Extract join columns from a join condition.
   * @param {Object} condition - JOIN condition AST.
   * @param {string} leftTable - Left table name.
   * @param {string} rightTable - Right table name.
   * @return {Object} {leftColumn, rightColumn} or nulls if not extractable.
   * @private
   */
  extractJoinColumns(condition, leftTable, rightTable) {
    if (!condition || condition.type !== 'binary' || condition.operator !== '=') {
      return {leftColumn: null, rightColumn: null};
    }

    const left = condition.left;
    const right = condition.right;

    if (left.type !== 'column_ref' || right.type !== 'column_ref') {
      return {leftColumn: null, rightColumn: null};
    }

    // Determine which column belongs to which table
    let leftColumn = null;
    let rightColumn = null;

    if (left.table === leftTable || !left.table) {
      leftColumn = left.column;
    }
    if (right.table === leftTable || !right.table) {
      leftColumn = leftColumn || right.column;
    }
    if (left.table === rightTable) {
      rightColumn = left.column;
    }
    if (right.table === rightTable) {
      rightColumn = rightColumn || right.column;
    }

    // If tables not specified, assume left.column is from left table
    if (!leftColumn && !rightColumn) {
      leftColumn = left.column;
      rightColumn = right.column;
    }

    return {leftColumn, rightColumn};
  }

  /**
   * Perform a nested loop join (fallback for complex conditions).
   * @param {Array} leftRows - Left table rows.
   * @param {Array} rightRows - Right table rows.
   * @param {Object} condition - JOIN condition.
   * @param {string} joinType - JOIN type.
   * @return {Array} Joined rows.
   * @private
   */
  nestedLoopJoin(leftRows, rightRows, condition, joinType) {
    const result = [];
    const matchedRight = new Set();

    for (const leftRow of leftRows) {
      let hasMatch = false;

      for (const rightRow of rightRows) {
        const combined = {...leftRow, ...rightRow};
        if (this.evaluateExpression(combined, condition)) {
          result.push(combined);
          matchedRight.add(rightRow);
          hasMatch = true;
        }
      }

      if (!hasMatch && (joinType === 'LEFT' || joinType === 'LEFT OUTER')) {
        const nullRight = {};
        if (rightRows.length > 0) {
          for (const col of Object.keys(rightRows[0])) {
            nullRight[col] = null;
          }
        }
        result.push({...leftRow, ...nullRight});
      }
    }

    if (joinType === 'RIGHT' || joinType === 'RIGHT OUTER') {
      for (const rightRow of rightRows) {
        if (!matchedRight.has(rightRow)) {
          const nullLeft = {};
          if (leftRows.length > 0) {
            for (const col of Object.keys(leftRows[0])) {
              nullLeft[col] = null;
            }
          }
          result.push({...nullLeft, ...rightRow});
        }
      }
    }

    return result;
  }

  /**
   * Build SELECT SQL without JOIN clauses (for fetching base table data).
   * @param {Object} ast - SELECT AST.
   * @return {string} SQL string without JOINs.
   * @private
   */
  buildSelectSQLWithoutJoins(ast) {
    let sql = 'SELECT ';

    if (ast.distinct) {
      sql += 'DISTINCT ';
    }

    // For cross-partition JOINs, select all columns from main table
    sql += '*';

    // FROM
    sql += ` FROM ${ast.from.name}`;
    if (ast.from.alias) {
      sql += ` AS ${ast.from.alias}`;
    }

    // WHERE (only conditions on main table)
    if (ast.where) {
      const mainTableWhere = this.filterWhereForTable(ast.where, ast.from.name);
      if (mainTableWhere) {
        sql += ` WHERE ${this.buildExpressionSQL(mainTableWhere)}`;
      }
    }

    return sql;
  }

  /**
   * Filter WHERE clause to only include conditions for a specific table.
   * @param {Object} where - WHERE clause AST.
   * @param {string} tableName - Table name to filter for.
   * @return {Object|null} Filtered WHERE clause or null.
   * @private
   */
  filterWhereForTable(where, _tableName) {
    if (!where) return null;

    // For simplicity, return the full WHERE clause
    // A more sophisticated implementation would filter by table
    return where;
  }

  /**
   * Execute a query on multiple partitions in parallel.
   * Requirements: 22.1, 22.4, 22.5
   * @param {Array} partitionIds - Partition IDs.
   * @param {string} sql - SQL query.
   * @param {Array} params - Query parameters.
   * @param {Object} timestamp - HLC timestamp for consistent snapshot.
   * @param {boolean} forRead - If true, can route to any replica for load distribution.
   * @return {Promise<Array>} Array of partition results.
   * @private
   */
  async executeOnPartitions(partitionIds, sql, params, timestamp, forRead = false) {
    // Limit parallel partitions
    const limitedIds = partitionIds.slice(0, this.maxParallelPartitions);

    if (limitedIds.length < partitionIds.length) {
      this.logger.warn('Partition count exceeds limit', {
        requested: partitionIds.length,
        limit: this.maxParallelPartitions,
      });
    }

    // Create promises for parallel execution
    // Read operations don't block writes (they can go to any replica)
    const promises = limitedIds.map((partitionId) =>
      this.executeOnPartition(partitionId, sql, params, timestamp, forRead),
    );

    // Execute with timeout - ensure timer is always cleared
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('Query timeout')), this.queryTimeoutMs);
    });

    try {
      const results = await Promise.race([
        Promise.all(promises),
        timeoutPromise,
      ]);
      return results;
    } catch (error) {
      if (error.message === 'Query timeout') {
        this.logger.error('Query timed out', {
          partitionCount: limitedIds.length,
          timeoutMs: this.queryTimeoutMs,
        });
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Execute a query on a single partition.
   * Requirements: 22.4, 22.5
   * @param {string} partitionId - Partition ID.
   * @param {string} sql - SQL query.
   * @param {Array} params - Query parameters.
   * @param {Object} _timestamp - HLC timestamp (unused for now).
   * @param {boolean} forRead - If true, can route to any replica.
   * @return {Promise<Object>} Partition result.
   * @private
   */
  async executeOnPartition(partitionId, sql, params, _timestamp, forRead = false) {
    const partition = this.getPartition(partitionId, forRead);

    if (!partition) {
      this.logger.warn('Partition not found', {partitionId});
      return {
        partitionId,
        success: false,
        error: 'Partition not found',
        rows: [],
      };
    }

    try {
      const result = await partition.executeQuery(sql, params);
      return {
        partitionId,
        success: true,
        rows: result.rows || [],
        changes: result.changes,
      };
    } catch (error) {
      this.logger.error('Partition query failed', {
        partitionId,
        error: error.message,
      });
      return {
        partitionId,
        success: false,
        error: error.message,
        rows: [],
      };
    }
  }

  /**
   * Aggregate SELECT results from multiple partitions.
   * Properly handles cross-partition aggregation for COUNT, SUM, AVG, MIN, MAX.
   * Requirements: 22.3, 22.6, 22.7
   * @param {Array} results - Partition results.
   * @param {Object} ast - Parsed SELECT AST.
   * @return {Object} Aggregated result.
   * @private
   */
  aggregateSelectResults(results, ast) {
    // Combine rows from all partitions
    let rows = [];
    for (const result of results) {
      if (result.success && result.rows) {
        rows = rows.concat(result.rows);
      }
    }

    // Handle DISTINCT
    if (ast.distinct) {
      rows = this.applyDistinct(rows);
    }

    // Handle GROUP BY with aggregates
    if (ast.groupBy) {
      rows = this.applyGroupBy(rows, ast);
    } else if (this.hasAggregates(ast)) {
      // Aggregates without GROUP BY - aggregate across all partitions
      rows = this.applyAggregates(rows, ast);
    }

    // Handle HAVING
    if (ast.having) {
      rows = this.applyHaving(rows, ast.having);
    }

    // Handle ORDER BY
    if (ast.orderBy) {
      rows = this.applyOrderBy(rows, ast.orderBy);
    }

    // Handle LIMIT/OFFSET
    if (ast.limit) {
      rows = this.applyLimit(rows, ast.limit);
    }

    return {rows};
  }

  /**
   * Aggregate results from multiple partitions for cross-partition queries.
   * This method handles partial aggregates that need to be combined.
   * Requirements: 22.3, 22.7
   * @param {Array} partitionResults - Results from each partition.
   * @param {Object} ast - Parsed SELECT AST.
   * @return {Object} Combined aggregated result.
   */
  aggregateCrossPartitionResults(partitionResults, ast) {
    // For queries with aggregates, we need to combine partial results
    if (!this.hasAggregates(ast)) {
      return this.aggregateSelectResults(partitionResults, ast);
    }

    // Collect all rows first
    let allRows = [];
    for (const result of partitionResults) {
      if (result.success && result.rows) {
        allRows = allRows.concat(result.rows);
      }
    }

    // Re-compute aggregates on combined data
    if (ast.groupBy) {
      return {rows: this.applyGroupBy(allRows, ast)};
    } else {
      return {rows: this.applyAggregates(allRows, ast)};
    }
  }

  /**
   * Apply DISTINCT to rows.
   * @param {Array} rows - Input rows.
   * @return {Array} Distinct rows.
   * @private
   */
  applyDistinct(rows) {
    const seen = new Set();
    return rows.filter((row) => {
      const key = JSON.stringify(row);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Check if AST has aggregate functions.
   * @param {Object} ast - SELECT AST.
   * @return {boolean} True if has aggregates.
   * @private
   */
  hasAggregates(ast) {
    return ast.columns.some((col) =>
      col.expression?.type === 'aggregate' ||
      col.type === 'aggregate',
    );
  }

  /**
   * Apply GROUP BY to rows.
   * @param {Array} rows - Input rows.
   * @param {Object} ast - SELECT AST.
   * @return {Array} Grouped rows.
   * @private
   */
  applyGroupBy(rows, ast) {
    const groups = new Map();
    const groupByColumns = ast.groupBy.map((g) =>
      g.column || g.expression?.column || g,
    );

    // Group rows
    for (const row of rows) {
      const key = groupByColumns.map((col) => row[col]).join('|');
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(row);
    }

    // Apply aggregates to each group
    const result = [];
    for (const groupRows of groups.values()) {
      const aggregatedRow = this.computeGroupAggregates(groupRows, ast);
      result.push(aggregatedRow);
    }

    return result;
  }

  /**
   * Compute aggregates for a group of rows.
   * @param {Array} rows - Group rows.
   * @param {Object} ast - SELECT AST.
   * @return {Object} Aggregated row.
   * @private
   */
  computeGroupAggregates(rows, ast) {
    const result = {};

    // Copy group by columns from first row
    if (ast.groupBy && rows.length > 0) {
      for (const g of ast.groupBy) {
        const col = g.column || g.expression?.column || g;
        result[col] = rows[0][col];
      }
    }

    // Compute aggregates
    for (const col of ast.columns) {
      const expr = col.expression || col;
      if (expr.type === 'aggregate') {
        const alias = col.alias || `${expr.function}(${this.getArgName(expr)})`;
        result[alias] = this.computeAggregate(rows, expr);
      } else if (expr.type === 'column_ref') {
        const colName = expr.column;
        if (rows.length > 0) {
          result[colName] = rows[0][colName];
        }
      }
    }

    return result;
  }

  /**
   * Get argument name for aggregate function.
   * @param {Object} expr - Aggregate expression.
   * @return {string} Argument name.
   * @private
   */
  getArgName(expr) {
    if (expr.argument?.type === 'star') return '*';
    if (expr.argument?.type === 'column_ref') return expr.argument.column;
    return '?';
  }

  /**
   * Apply aggregates without GROUP BY.
   * @param {Array} rows - Input rows.
   * @param {Object} ast - SELECT AST.
   * @return {Array} Single aggregated row.
   * @private
   */
  applyAggregates(rows, ast) {
    const result = {};

    for (const col of ast.columns) {
      const expr = col.expression || col;
      if (expr.type === 'aggregate') {
        const alias = col.alias || `${expr.function}(${this.getArgName(expr)})`;
        result[alias] = this.computeAggregate(rows, expr);
      }
    }

    return [result];
  }

  /**
   * Compute a single aggregate value across all rows.
   * Supports COUNT, SUM, AVG, MIN, MAX for cross-partition aggregation.
   * Requirements: 22.7
   * @param {Array} rows - Input rows.
   * @param {Object} expr - Aggregate expression.
   * @return {*} Aggregate value.
   * @private
   */
  computeAggregate(rows, expr) {
    const func = expr.function.toUpperCase();
    const arg = expr.argument;
    const colName = arg?.type === 'column_ref' ? arg.column : null;

    let values = rows;
    if (colName) {
      values = rows.map((r) => r[colName]).filter((v) => v !== null && v !== undefined);
    }

    if (expr.distinct && colName) {
      values = [...new Set(values)];
    }

    switch (func) {
    case 'COUNT':
      // COUNT(*) counts all rows, COUNT(column) counts non-null values
      if (arg?.type === 'star') {
        return rows.length;
      }
      return values.length;

    case 'SUM':
      // SUM aggregates numeric values across all partitions
      return values.reduce((sum, v) => sum + (Number(v) || 0), 0);

    case 'AVG': {
      // AVG must be computed on combined data, not averaged averages
      if (values.length === 0) return null;
      const avgSum = values.reduce((s, v) => s + (Number(v) || 0), 0);
      return avgSum / values.length;
    }

    case 'MIN':
      // MIN finds the minimum across all partitions
      if (values.length === 0) return null;
      return values.reduce((min, v) => v < min ? v : min, values[0]);

    case 'MAX':
      // MAX finds the maximum across all partitions
      if (values.length === 0) return null;
      return values.reduce((max, v) => v > max ? v : max, values[0]);

    default:
      return null;
    }
  }

  /**
   * Apply HAVING clause to grouped rows.
   * @param {Array} rows - Grouped rows.
   * @param {Object} having - HAVING clause AST.
   * @return {Array} Filtered rows.
   * @private
   */
  applyHaving(rows, having) {
    return rows.filter((row) => this.evaluateExpression(row, having));
  }

  /**
   * Evaluate an expression against a row.
   * @param {Object} row - Data row.
   * @param {Object} expr - Expression AST.
   * @return {*} Expression value.
   * @private
   */
  evaluateExpression(row, expr) {
    if (!expr) return true;

    switch (expr.type) {
    case 'binary':
      return this.evaluateBinary(row, expr);
    case 'literal':
      return expr.value;
    case 'column_ref':
      return row[expr.column];
    case 'aggregate': {
      // For HAVING, aggregate values should already be computed
      const alias = `${expr.function}(${this.getArgName(expr)})`;
      return row[alias];
    }
    default:
      return true;
    }
  }

  /**
   * Evaluate a binary expression.
   * @param {Object} row - Data row.
   * @param {Object} expr - Binary expression.
   * @return {boolean} Expression result.
   * @private
   */
  evaluateBinary(row, expr) {
    const left = this.evaluateExpression(row, expr.left);
    const right = this.evaluateExpression(row, expr.right);

    switch (expr.operator) {
    case 'AND': return left && right;
    case 'OR': return left || right;
    case '=': return left === right;
    case '!=':
    case '<>': return left !== right;
    case '<': return left < right;
    case '<=': return left <= right;
    case '>': return left > right;
    case '>=': return left >= right;
    default: return true;
    }
  }

  /**
   * Apply ORDER BY to rows.
   * @param {Array} rows - Input rows.
   * @param {Array} orderBy - ORDER BY clauses.
   * @return {Array} Sorted rows.
   * @private
   */
  applyOrderBy(rows, orderBy) {
    return [...rows].sort((a, b) => {
      for (const clause of orderBy) {
        const col = clause.expression?.column || clause.column;
        const dir = clause.direction === 'DESC' ? -1 : 1;

        const aVal = a[col];
        const bVal = b[col];

        if (aVal === bVal) continue;
        if (aVal === null) return dir;
        if (bVal === null) return -dir;

        if (typeof aVal === 'string' && typeof bVal === 'string') {
          const cmp = aVal.localeCompare(bVal);
          if (cmp !== 0) return cmp * dir;
        } else {
          if (aVal < bVal) return -dir;
          if (aVal > bVal) return dir;
        }
      }
      return 0;
    });
  }

  /**
   * Apply LIMIT and OFFSET to rows.
   * @param {Array} rows - Input rows.
   * @param {Object} limit - LIMIT clause.
   * @return {Array} Limited rows.
   * @private
   */
  applyLimit(rows, limit) {
    const offset = limit.offset || 0;
    const count = limit.count;
    return rows.slice(offset, offset + count);
  }

  /**
   * Build SQL string from SELECT AST.
   * @param {Object} ast - SELECT AST.
   * @return {string} SQL string.
   * @private
   */
  buildSelectSQL(ast) {
    let sql = 'SELECT ';

    if (ast.distinct) {
      sql += 'DISTINCT ';
    }

    // Columns
    const cols = ast.columns.map((col) => this.buildColumnSQL(col));
    sql += cols.join(', ');

    // FROM
    sql += ` FROM ${ast.from.name}`;
    if (ast.from.alias) {
      sql += ` AS ${ast.from.alias}`;
    }

    // JOINs
    for (const join of ast.joins || []) {
      sql += ` ${join.joinType} JOIN ${join.table.name}`;
      if (join.table.alias) {
        sql += ` AS ${join.table.alias}`;
      }
      sql += ` ON ${this.buildExpressionSQL(join.condition)}`;
    }

    // WHERE
    if (ast.where) {
      sql += ` WHERE ${this.buildExpressionSQL(ast.where)}`;
    }

    // GROUP BY
    if (ast.groupBy) {
      const groups = ast.groupBy.map((g) => this.buildExpressionSQL(g));
      sql += ` GROUP BY ${groups.join(', ')}`;
    }

    // HAVING
    if (ast.having) {
      sql += ` HAVING ${this.buildExpressionSQL(ast.having)}`;
    }

    // ORDER BY
    if (ast.orderBy) {
      const orders = ast.orderBy.map((o) =>
        `${this.buildExpressionSQL(o.expression)} ${o.direction}`,
      );
      sql += ` ORDER BY ${orders.join(', ')}`;
    }

    // LIMIT
    if (ast.limit) {
      sql += ` LIMIT ${ast.limit.count}`;
      if (ast.limit.offset) {
        sql += ` OFFSET ${ast.limit.offset}`;
      }
    }

    return sql;
  }

  /**
   * Build SQL for a column.
   * @param {Object} col - Column AST.
   * @return {string} Column SQL.
   * @private
   */
  buildColumnSQL(col) {
    if (col.type === 'star') return '*';

    let sql = this.buildExpressionSQL(col.expression || col);
    if (col.alias) {
      sql += ` AS ${col.alias}`;
    }
    return sql;
  }

  /**
   * Build SQL for an expression.
   * @param {Object} expr - Expression AST.
   * @return {string} Expression SQL.
   * @private
   */
  buildExpressionSQL(expr) {
    if (!expr) return '';

    switch (expr.type) {
    case 'star':
      return '*';

    case 'literal':
      if (expr.value === null) return 'NULL';
      if (typeof expr.value === 'string') return `'${expr.value}'`;
      return String(expr.value);

    case 'column_ref':
      if (expr.table) return `${expr.table}.${expr.column}`;
      return expr.column;

    case 'binary':
      return `(${this.buildExpressionSQL(expr.left)} ` +
             `${expr.operator} ${this.buildExpressionSQL(expr.right)})`;

    case 'unary':
      return `${expr.operator} ${this.buildExpressionSQL(expr.operand)}`;

    case 'aggregate': {
      const aggArg = this.buildExpressionSQL(expr.argument);
      const aggDistinct = expr.distinct ? 'DISTINCT ' : '';
      return `${expr.function}(${aggDistinct}${aggArg})`;
    }

    case 'in': {
      const inVals = expr.values.map((v) => this.buildExpressionSQL(v));
      return `${this.buildExpressionSQL(expr.expression)} IN (${inVals.join(', ')})`;
    }

    case 'between':
      return `${this.buildExpressionSQL(expr.expression)} BETWEEN ` +
             `${this.buildExpressionSQL(expr.low)} AND ` +
             `${this.buildExpressionSQL(expr.high)}`;

    case 'like':
      return `${this.buildExpressionSQL(expr.expression)} LIKE ` +
             `${this.buildExpressionSQL(expr.pattern)}`;

    case 'parameter':
      return '?';

    default:
      return '';
    }
  }

  /**
   * Execute an INSERT statement.
   * @param {Object} ast - Parsed INSERT AST.
   * @param {string} partitionId - Target partition ID.
   * @param {Array} params - Query parameters.
   * @return {Promise<Object>} Insert result.
   */
  async executeInsert(ast, partitionId, params = []) {
    const partition = this.getPartition(partitionId);

    if (!partition) {
      throw new Error(`Partition not found: ${partitionId}`);
    }

    const sql = this.buildInsertSQL(ast);

    this.logger.debug('Executing INSERT', {
      table: ast.table,
      partitionId,
      rowCount: ast.values.length,
    });

    const result = await partition.executeQuery(sql, params);

    return {
      success: true,
      operation: 'INSERT',
      affectedRows: result.changes || ast.values.length,
      partitions: [partitionId],
    };
  }

  /**
   * Build SQL for INSERT statement.
   * @param {Object} ast - INSERT AST.
   * @return {string} SQL string.
   * @private
   */
  buildInsertSQL(ast) {
    let sql = `INSERT INTO ${ast.table}`;

    if (ast.columns) {
      sql += ` (${ast.columns.join(', ')})`;
    }

    sql += ' VALUES ';

    const rows = ast.values.map((row) => {
      const vals = row.map((v) => this.buildExpressionSQL(v));
      return `(${vals.join(', ')})`;
    });

    sql += rows.join(', ');

    return sql;
  }

  /**
   * Execute an UPDATE statement.
   * @param {Object} ast - Parsed UPDATE AST.
   * @param {Array} partitionIds - Target partition IDs.
   * @param {Array} params - Query parameters.
   * @return {Promise<Object>} Update result.
   */
  async executeUpdate(ast, partitionIds, params = []) {
    const sql = this.buildUpdateSQL(ast);

    this.logger.debug('Executing UPDATE', {
      table: ast.table,
      partitionCount: partitionIds.length,
    });

    const results = await this.executeOnPartitions(
      partitionIds,
      sql,
      params,
      this.hlcClock.now(),
    );

    const totalChanges = results.reduce(
      (sum, r) => sum + (r.changes || 0),
      0,
    );

    return {
      success: true,
      operation: 'UPDATE',
      affectedRows: totalChanges,
      partitions: partitionIds,
    };
  }

  /**
   * Build SQL for UPDATE statement.
   * @param {Object} ast - UPDATE AST.
   * @return {string} SQL string.
   * @private
   */
  buildUpdateSQL(ast) {
    let sql = `UPDATE ${ast.table} SET `;

    const sets = ast.assignments.map((a) =>
      `${a.column} = ${this.buildExpressionSQL(a.value)}`,
    );
    sql += sets.join(', ');

    if (ast.where) {
      sql += ` WHERE ${this.buildExpressionSQL(ast.where)}`;
    }

    return sql;
  }

  /**
   * Execute a DELETE statement.
   * @param {Object} ast - Parsed DELETE AST.
   * @param {Array} partitionIds - Target partition IDs.
   * @param {Array} params - Query parameters.
   * @return {Promise<Object>} Delete result.
   */
  async executeDelete(ast, partitionIds, params = []) {
    const sql = this.buildDeleteSQL(ast);

    this.logger.debug('Executing DELETE', {
      table: ast.table,
      partitionCount: partitionIds.length,
    });

    const results = await this.executeOnPartitions(
      partitionIds,
      sql,
      params,
      this.hlcClock.now(),
    );

    const totalChanges = results.reduce(
      (sum, r) => sum + (r.changes || 0),
      0,
    );

    return {
      success: true,
      operation: 'DELETE',
      affectedRows: totalChanges,
      partitions: partitionIds,
    };
  }

  /**
   * Build SQL for DELETE statement.
   * @param {Object} ast - DELETE AST.
   * @return {string} SQL string.
   * @private
   */
  buildDeleteSQL(ast) {
    let sql = `DELETE FROM ${ast.table}`;

    if (ast.where) {
      sql += ` WHERE ${this.buildExpressionSQL(ast.where)}`;
    }

    return sql;
  }
}

export {QueryExecutor};
