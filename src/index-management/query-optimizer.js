/**
 * Query Optimizer - Uses indices for query optimization.
 * Analyzes queries and determines which indices can be used.
 * Requirements: 12.4
 */

import {LoggingService} from '../logging/logging-service.js';
import {
  INDEX_COST,
  INDEX_HINT,
  INDEX_LOG_MSG,
  INDEX_PRIORITY,
  INDEX_SUBSYSTEM,
  INDEX_USAGE,
} from './index-constants.js';
import {QUERY_AST_NODE, QUERY_AST_TYPE} from '../query/query-constants.js';

const LOCAL_STR_COMMA_SPACE = ', ';
const LOCAL_STR_ORDER_BY = 'order_by';
const LOCAL_STR_COMMA = ',';

/**
 * QueryOptimizer analyzes queries and determines optimal index usage.
 * It examines WHERE clauses and JOIN conditions to identify
 * which indices can be used to speed up query execution.
 */
class QueryOptimizer {
  /**
   * Create a new QueryOptimizer.
   * @param {Object} options - Configuration options.
   * @param {Object} options.indexService - Index service for index metadata.
   * @param {Object} options.systemTableCache - System table cache for table metadata.
   */
  constructor(options = {}) {
    this.indexService = options.indexService || null;
    this.systemTableCache = options.systemTableCache || null;

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(INDEX_SUBSYSTEM.QUERY_OPTIMIZER) : console;
  }

  /**
   * Analyze a query AST and return optimization hints.
   * Requirements: 12.4
   * @param {Object} ast - Parsed query AST.
   * @param {string} tableId - Table ID being queried.
   * @return {Object} Optimization hints.
   */
  analyzeQuery(ast, tableId) {
    if (!ast || !tableId) {
      return {usableIndices: [], hints: []};
    }

    const result = {
      usableIndices: [],
      hints: [],
      estimatedCost: INDEX_COST.FULL_SCAN,
    };

    // Get available indices for the table
    const indices = this.getIndicesForTable(tableId);

    // Analyze based on query type
    switch (ast.type) {
    case QUERY_AST_TYPE.SELECT:
      this.analyzeSelectQuery(ast, indices, result);
      break;
    case QUERY_AST_TYPE.UPDATE:
      this.analyzeUpdateQuery(ast, indices, result);
      break;
    case QUERY_AST_TYPE.DELETE:
      this.analyzeDeleteQuery(ast, indices, result);
      break;
    default:
      // INSERT doesn't benefit from index optimization for reads
      break;
    }

    return result;
  }

  /**
   * Analyze a SELECT query for index usage.
   * @param {Object} ast - SELECT AST.
   * @param {Array} indices - Available indices.
   * @param {Object} result - Result object to populate.
   * @private
   */
  analyzeSelectQuery(ast, indices, result) {
    // Extract columns from WHERE clause
    const whereColumns = this.extractWhereColumns(ast.where);

    // Extract columns from ORDER BY clause
    const orderByColumns = this.extractOrderByColumns(ast.orderBy);

    // Extract columns from JOIN conditions
    const joinColumns = this.extractJoinColumns(ast.joins);

    // Find usable indices for WHERE clause
    for (const index of indices) {
      const indexColumns = index.columnNames;

      // Check if index can be used for WHERE clause
      const whereMatch = this.checkIndexMatch(indexColumns, whereColumns);
      if (whereMatch.usable) {
        result.usableIndices.push({
          indexName: index.indexName,
          usage: INDEX_USAGE.WHERE,
          matchedColumns: whereMatch.matchedColumns,
          coveringIndex: whereMatch.covering,
        });
        result.estimatedCost = INDEX_COST.INDEX_SCAN;
      }

      // Check if index can be used for ORDER BY
      const orderMatch = this.checkIndexMatch(indexColumns, orderByColumns);
      if (orderMatch.usable) {
        result.usableIndices.push({
          indexName: index.indexName,
          usage: INDEX_USAGE.ORDER_BY,
          matchedColumns: orderMatch.matchedColumns,
        });
      }

      // Check if index can be used for JOIN
      const joinMatch = this.checkIndexMatch(indexColumns, joinColumns);
      if (joinMatch.usable) {
        result.usableIndices.push({
          indexName: index.indexName,
          usage: INDEX_USAGE.JOIN,
          matchedColumns: joinMatch.matchedColumns,
        });
      }
    }

    // Generate hints
    if (result.usableIndices.length === 0 && whereColumns.length > 0) {
      result.hints.push(
        `${INDEX_HINT.WHERE_GENERIC_PREFIX}${whereColumns.join(LOCAL_STR_COMMA_SPACE)}`,
      );
    }

    if (orderByColumns.length > 0 &&
        !result.usableIndices.some((i) => i.usage === LOCAL_STR_ORDER_BY)) {
      result.hints.push(
        `${INDEX_HINT.ORDER_BY_PREFIX}${orderByColumns.join(LOCAL_STR_COMMA_SPACE)}`,
      );
    }
  }

  /**
   * Analyze an UPDATE query for index usage.
   * @param {Object} ast - UPDATE AST.
   * @param {Array} indices - Available indices.
   * @param {Object} result - Result object to populate.
   * @private
   */
  analyzeUpdateQuery(ast, indices, result) {
    const whereColumns = this.extractWhereColumns(ast.where);

    for (const index of indices) {
      const whereMatch = this.checkIndexMatch(index.columnNames, whereColumns);
      if (whereMatch.usable) {
        result.usableIndices.push({
          indexName: index.indexName,
          usage: INDEX_USAGE.WHERE,
          matchedColumns: whereMatch.matchedColumns,
        });
        result.estimatedCost = INDEX_COST.INDEX_SCAN;
      }
    }

    if (result.usableIndices.length === 0 && whereColumns.length > 0) {
      result.hints.push(
        `${INDEX_HINT.WHERE_PREFIX}${whereColumns.join(LOCAL_STR_COMMA_SPACE)}`,
      );
    }
  }

  /**
   * Analyze a DELETE query for index usage.
   * @param {Object} ast - DELETE AST.
   * @param {Array} indices - Available indices.
   * @param {Object} result - Result object to populate.
   * @private
   */
  analyzeDeleteQuery(ast, indices, result) {
    const whereColumns = this.extractWhereColumns(ast.where);

    for (const index of indices) {
      const whereMatch = this.checkIndexMatch(index.columnNames, whereColumns);
      if (whereMatch.usable) {
        result.usableIndices.push({
          indexName: index.indexName,
          usage: INDEX_USAGE.WHERE,
          matchedColumns: whereMatch.matchedColumns,
        });
        result.estimatedCost = INDEX_COST.INDEX_SCAN;
      }
    }

    if (result.usableIndices.length === 0 && whereColumns.length > 0) {
      result.hints.push(
        `${INDEX_HINT.WHERE_PREFIX}${whereColumns.join(LOCAL_STR_COMMA_SPACE)}`,
      );
    }
  }

  /**
   * Extract column names from a WHERE clause.
   * @param {Object} where - WHERE clause AST.
   * @return {Array<string>} Column names.
   * @private
   */
  extractWhereColumns(where) {
    const columns = [];

    if (!where) {
      return columns;
    }

    this.traverseExpression(where, (node) => {
      if (node.type === QUERY_AST_NODE.COLUMN_REF) {
        columns.push(node.column);
      }
    });

    return [...new Set(columns)]; // Remove duplicates
  }

  /**
   * Extract column names from ORDER BY clause.
   * @param {Array} orderBy - ORDER BY clause AST.
   * @return {Array<string>} Column names.
   * @private
   */
  extractOrderByColumns(orderBy) {
    if (!orderBy || !Array.isArray(orderBy)) {
      return [];
    }

    return orderBy.map((item) => {
      if (item.expression?.type === QUERY_AST_NODE.COLUMN_REF) {
        return item.expression.column;
      }
      return item.column;
    }).filter(Boolean);
  }

  /**
   * Extract column names from JOIN conditions.
   * @param {Array} joins - JOIN clauses AST.
   * @return {Array<string>} Column names.
   * @private
   */
  extractJoinColumns(joins) {
    const columns = [];

    if (!joins || !Array.isArray(joins)) {
      return columns;
    }

    for (const join of joins) {
      if (join.condition) {
        this.traverseExpression(join.condition, (node) => {
          if (node.type === QUERY_AST_NODE.COLUMN_REF) {
            columns.push(node.column);
          }
        });
      }
    }

    return [...new Set(columns)];
  }

  /**
   * Traverse an expression AST and call callback for each node.
   * @param {Object} node - AST node.
   * @param {Function} callback - Callback function.
   * @private
   */
  traverseExpression(node, callback) {
    if (!node) return;

    callback(node);

    if (node.left) this.traverseExpression(node.left, callback);
    if (node.right) this.traverseExpression(node.right, callback);
    if (node.operand) this.traverseExpression(node.operand, callback);
    if (node.expression) this.traverseExpression(node.expression, callback);
    if (node.values && Array.isArray(node.values)) {
      for (const v of node.values) {
        this.traverseExpression(v, callback);
      }
    }
  }

  /**
   * Check if an index can be used for a set of columns.
   * @param {Array<string>} indexColumns - Index column names.
   * @param {Array<string>} queryColumns - Query column names.
   * @return {Object} Match result.
   * @private
   */
  checkIndexMatch(indexColumns, queryColumns) {
    if (!indexColumns || !queryColumns || queryColumns.length === 0) {
      return {usable: false, matchedColumns: [], covering: false};
    }

    const matchedColumns = [];

    // Check if index prefix matches query columns
    // An index on (a, b, c) can be used for queries on (a), (a, b), or (a, b, c)
    for (let i = 0; i < indexColumns.length && i < queryColumns.length; i++) {
      if (queryColumns.includes(indexColumns[i])) {
        matchedColumns.push(indexColumns[i]);
      } else {
        break; // Index prefix must match
      }
    }

    // Also check if any query column matches any index column (less optimal but still useful)
    if (matchedColumns.length === 0) {
      for (const queryCol of queryColumns) {
        if (indexColumns.includes(queryCol)) {
          matchedColumns.push(queryCol);
        }
      }
    }

    const usable = matchedColumns.length > 0;
    const covering = usable &&
      queryColumns.every((col) => indexColumns.includes(col));

    return {usable, matchedColumns, covering};
  }

  /**
   * Get indices for a table.
   * @param {string} tableId - Table ID.
   * @return {Array} Array of index metadata.
   * @private
   */
  getIndicesForTable(tableId) {
    if (this.indexService) {
      return this.indexService.getIndicesForTable(tableId);
    }
    return [];
  }

  /**
   * Suggest indices for a query.
   * Requirements: 12.4
   * @param {Object} ast - Parsed query AST.
   * @param {string} tableId - Table ID.
   * @return {Array<Object>} Suggested indices.
   */
  suggestIndices(ast, tableId) {
    const suggestions = [];

    if (!ast) {
      return suggestions;
    }

    // Extract all columns used in the query
    const whereColumns = this.extractWhereColumns(ast.where);
    const orderByColumns = this.extractOrderByColumns(ast.orderBy);
    const joinColumns = this.extractJoinColumns(ast.joins);

    // Get existing indices
    const existingIndices = this.getIndicesForTable(tableId);
    const existingIndexColumns = new Set();
    for (const idx of existingIndices) {
      existingIndexColumns.add(idx.columnNames.join(LOCAL_STR_COMMA));
    }

    // Suggest index for WHERE clause columns
    if (whereColumns.length > 0) {
      const whereKey = whereColumns.sort().join(',');
      if (!existingIndexColumns.has(whereKey)) {
        suggestions.push({
          columns: whereColumns,
          reason: INDEX_HINT.WHERE_PREFIX.trim(),
          priority: INDEX_PRIORITY.HIGH,
        });
      }
    }

    // Suggest index for ORDER BY columns
    if (orderByColumns.length > 0) {
      const orderKey = orderByColumns.join(',');
      if (!existingIndexColumns.has(orderKey)) {
        suggestions.push({
          columns: orderByColumns,
          reason: INDEX_HINT.ORDER_BY_PREFIX.trim(),
          priority: INDEX_PRIORITY.MEDIUM,
        });
      }
    }

    // Suggest index for JOIN columns
    if (joinColumns.length > 0) {
      for (const col of joinColumns) {
        const hasIndex = existingIndices.some((idx) =>
          idx.columnNames[0] === col,
        );
        if (!hasIndex) {
          suggestions.push({
            columns: [col],
            reason: INDEX_HINT.JOIN_PREFIX.trim(),
            priority: INDEX_PRIORITY.HIGH,
          });
        }
      }
    }

    return suggestions;
  }

  /**
   * Get query execution plan with index information.
   * Requirements: 12.4
   * @param {Object} ast - Parsed query AST.
   * @param {string} tableId - Table ID.
   * @return {Object} Execution plan.
   */
  getExecutionPlan(ast, tableId) {
    const analysis = this.analyzeQuery(ast, tableId);

    const plan = {
      queryType: ast.type,
      tableId,
      estimatedCost: analysis.estimatedCost,
      usedIndices: analysis.usableIndices.filter((i) => i.usage === INDEX_USAGE.WHERE),
      orderByIndex: analysis.usableIndices.find((i) => i.usage === INDEX_USAGE.ORDER_BY),
      joinIndices: analysis.usableIndices.filter((i) => i.usage === INDEX_USAGE.JOIN),
      hints: analysis.hints,
      suggestions: this.suggestIndices(ast, tableId),
    };

    this.logger.debug(INDEX_LOG_MSG.EXECUTION_PLAN_GENERATED, {
      tableId,
      queryType: ast.type,
      usedIndexCount: plan.usedIndices.length,
    });

    return plan;
  }

  /**
   * Set the index service.
   * @param {Object} service - Index service.
   */
  setIndexService(service) {
    this.indexService = service;
  }

  /**
   * Set the system table cache.
   * @param {Object} cache - System table cache.
   */
  setSystemTableCache(cache) {
    this.systemTableCache = cache;
  }
}

export {QueryOptimizer};
