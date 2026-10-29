/**
 * Query Optimizer - Uses indices for query optimization.
 * Analyzes queries and determines which indices can be used.
 * Requirements: 12.4
 */

import {LoggingService} from '../logging/logging-service.js';
import {
  INDEX_COST,
  INDEX_HINT,
  INDEX_READABLE_STATE,
  INDEX_REJECTION_REASON,
  INDEX_SUBSYSTEM,
  INDEX_USAGE,
} from './index-constants.js';
import {queryOptimizerSuggestions} from './query-optimizer-suggestions.js';
import {QUERY_AST_NODE, QUERY_AST_TYPE} from '../query/query-constants.js';

const LOCAL_STR_COMMA_SPACE = ', ';
const LOCAL_STR_ORDER_BY = 'order_by';
const LOCAL_STR_AND = 'AND';
const LOCAL_STR_EQUALS = '=';
const LOCAL_STR_DOUBLE_EQUALS = '==';
const LOCAL_STR_LT = '<';
const LOCAL_STR_LTE = '<=';
const LOCAL_STR_GT = '>';
const LOCAL_STR_GTE = '>=';

const READABLE_INDEX_STATES = Object.freeze(new Set([
  INDEX_READABLE_STATE.READABLE,
  INDEX_READABLE_STATE.ACTIVE,
  INDEX_READABLE_STATE.READY,
]));

const RANGE_OPERATOR_SET = Object.freeze(new Set([
  LOCAL_STR_LT,
  LOCAL_STR_LTE,
  LOCAL_STR_GT,
  LOCAL_STR_GTE,
]));

function extractSingleColumnRef(left, right) {
  const leftCol = left?.type === QUERY_AST_NODE.COLUMN_REF ? left.column : null;
  const rightCol = right?.type === QUERY_AST_NODE.COLUMN_REF ? right.column : null;
  if (leftCol && !rightCol) return leftCol;
  if (rightCol && !leftCol) return rightCol;
  return null;
}

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
   * @return {Object} Optimization hints and diagnostics.
   */
  analyzeQuery(ast, tableId) {
    if (!ast || !tableId) {
      return {
        usableIndices: [],
        hints: [],
        estimatedCost: INDEX_COST.FULL_SCAN,
        selectedIndex: null,
        rejectedIndexes: [],
      };
    }

    const result = {
      usableIndices: [],
      hints: [],
      estimatedCost: INDEX_COST.FULL_SCAN,
      selectedIndex: null,
      rejectedIndexes: [],
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
      break;
    }

    return result;
  }

  /**
   * Collect top-level conjunctive terms (AND-connected terms) from an expression.
   * @param {Object} expr - AST expression.
   * @return {Array<Object>} Conjunctive terms.
   * @private
   */
  collectConjunctiveTerms(expr) {
    if (!expr) return [];
    if (expr.type === QUERY_AST_NODE.BINARY && expr.operator?.toUpperCase() === LOCAL_STR_AND) {
      return [
        ...this.collectConjunctiveTerms(expr.left),
        ...this.collectConjunctiveTerms(expr.right),
      ];
    }
    return [expr];
  }

  /**
   * Extract structural constraints from top-level AND conjunctions.
   * @param {Object} where - WHERE clause AST.
   * @return {Map<string, {hasEquality: boolean, hasRange: boolean}>}
   * @private
   */
  extractStructuralConstraints(where) {
    const constraints = new Map();
    if (!where) return constraints;

    const terms = this.collectConjunctiveTerms(where);
    for (const term of terms) {
      this.recordTermConstraint(term, constraints);
    }
    return constraints;
  }

  recordBinaryConstraint(term, constraints) {
    const targetCol = extractSingleColumnRef(term.left, term.right);
    if (!targetCol) return;
    const op = term.operator;
    if (op === LOCAL_STR_EQUALS || op === LOCAL_STR_DOUBLE_EQUALS) {
      this.addConstraint(constraints, targetCol, {hasEquality: true});
    } else if (RANGE_OPERATOR_SET.has(op)) {
      this.addConstraint(constraints, targetCol, {hasRange: true});
    }
  }

  recordInConstraint(term, constraints) {
    const col = term.expression?.type === QUERY_AST_NODE.COLUMN_REF ?
      term.expression.column :
      null;
    if (col && Array.isArray(term.values) && term.values.length === 1) {
      this.addConstraint(constraints, col, {hasEquality: true});
    }
  }

  recordBetweenConstraint(term, constraints) {
    const col = term.expression?.type === QUERY_AST_NODE.COLUMN_REF ?
      term.expression.column :
      null;
    if (col) {
      this.addConstraint(constraints, col, {hasRange: true});
    }
  }

  /**
   * Record constraint for a single conjunctive term.
   * @param {Object} term - AST node.
   * @param {Map} constraints - Output map.
   * @private
   */
  recordTermConstraint(term, constraints) {
    if (!term) return;
    if (term.type === QUERY_AST_NODE.BINARY) {
      this.recordBinaryConstraint(term, constraints);
    } else if (term.type === QUERY_AST_NODE.IN) {
      this.recordInConstraint(term, constraints);
    } else if (term.type === QUERY_AST_NODE.BETWEEN) {
      this.recordBetweenConstraint(term, constraints);
    }
  }

  /**
   * Add or update a column constraint.
   * @param {Map} constraints - Constraints map.
   * @param {string} col - Column name.
   * @param {Object} update - Constraint update.
   * @private
   */
  addConstraint(constraints, col, update) {
    if (!constraints.has(col)) {
      constraints.set(col, {hasEquality: false, hasRange: false});
    }
    const current = constraints.get(col);
    if (update.hasEquality) current.hasEquality = true;
    if (update.hasRange) current.hasRange = true;
  }

  checkOrderByPrefix(indexColumns, equalityPrefixCount, orderByColumns) {
    if (!Array.isArray(orderByColumns) || orderByColumns.length === 0) {
      return false;
    }
    const remaining = indexColumns.slice(equalityPrefixCount);
    if (orderByColumns.length > remaining.length) {
      return false;
    }
    return orderByColumns.every((col, idx) => col === remaining[idx]);
  }

  buildRejectedIndexMatch(reason) {
    return {
      canUseIndex: false,
      rejectionReason: reason,
      matchedColumns: [],
      equalityPrefixColumns: [],
      rangeColumn: null,
      orderBySatisfied: false,
    };
  }

  /**
   * Evaluate whether an index matches WHERE constraints using strict left-prefix rules.
   * @param {Array<string>} indexColumns - Index column names.
   * @param {Map} columnConstraints - Constraints map.
   * @param {Array<string>} [orderByColumns] - ORDER BY column names.
   * @return {Object} Match evaluation.
   * @private
   */
  evaluateIndexMatchForWhere(indexColumns, columnConstraints, orderByColumns = []) {
    if (!indexColumns || indexColumns.length === 0) {
      return this.buildRejectedIndexMatch(INDEX_REJECTION_REASON.MISSING_LEADING_COLUMN);
    }

    const equalityPrefixColumns = [];
    const matchedColumns = [];
    let rangeColumn = null;

    for (let i = 0; i < indexColumns.length; i++) {
      const col = indexColumns[i];
      const constraints = columnConstraints.get(col);

      if (constraints?.hasEquality && rangeColumn === null) {
        equalityPrefixColumns.push(col);
        matchedColumns.push(col);
      } else if (constraints?.hasRange && rangeColumn === null) {
        rangeColumn = col;
        matchedColumns.push(col);
        break;
      } else {
        break;
      }
    }

    if (matchedColumns.length === 0) {
      return this.buildRejectedIndexMatch(INDEX_REJECTION_REASON.MISSING_LEADING_COLUMN);
    }

    const orderBySatisfied = this.checkOrderByPrefix(
      indexColumns,
      equalityPrefixColumns.length,
      orderByColumns,
    );

    return {
      canUseIndex: true,
      rejectionReason: INDEX_REJECTION_REASON.NONE,
      matchedColumns,
      equalityPrefixColumns,
      rangeColumn,
      orderBySatisfied,
    };
  }

  isIndexStateReadable(index) {
    const state = index.state || index.status;
    return !state || READABLE_INDEX_STATES.has(String(state).toUpperCase());
  }

  rankCandidateMatches(candidateMatches, rejectedIndexes) {
    if (candidateMatches.length === 0) {
      return null;
    }
    candidateMatches.sort((a, b) => {
      if (b.matchedColumns.length !== a.matchedColumns.length) {
        return b.matchedColumns.length - a.matchedColumns.length;
      }
      if (b.equalityPrefixColumns.length !== a.equalityPrefixColumns.length) {
        return b.equalityPrefixColumns.length - a.equalityPrefixColumns.length;
      }
      if (b.orderBySatisfied !== a.orderBySatisfied) {
        return b.orderBySatisfied ? 1 : -1;
      }
      return a.indexName.localeCompare(b.indexName);
    });

    for (let i = 1; i < candidateMatches.length; i++) {
      rejectedIndexes.push({
        indexName: candidateMatches[i].indexName,
        columns: candidateMatches[i].columns,
        reason: INDEX_REJECTION_REASON.HIGHER_COST_OR_SHORTER_PREFIX,
      });
    }
    return candidateMatches[0];
  }

  populateSelectResultState(selectedIndex, rejectedIndexes, result) {
    result.selectedIndex = selectedIndex ? {
      indexName: selectedIndex.indexName,
      matchedColumns: selectedIndex.matchedColumns,
      equalityPrefixColumns: selectedIndex.equalityPrefixColumns,
      rangeColumn: selectedIndex.rangeColumn,
      selectivity: selectedIndex.selectivity,
      estimatedCost: selectedIndex.estimatedCost,
      orderBySatisfied: selectedIndex.orderBySatisfied,
    } : null;
    result.rejectedIndexes = rejectedIndexes;

    if (selectedIndex) {
      result.estimatedCost = INDEX_COST.INDEX_SCAN;
      result.usableIndices.push({
        indexName: selectedIndex.indexName,
        usage: INDEX_USAGE.WHERE,
        matchedColumns: selectedIndex.matchedColumns,
        coveringIndex: false,
      });
      if (selectedIndex.orderBySatisfied) {
        result.usableIndices.push({
          indexName: selectedIndex.indexName,
          usage: INDEX_USAGE.ORDER_BY,
          matchedColumns: selectedIndex.matchedColumns,
        });
      }
    } else {
      result.estimatedCost = INDEX_COST.FULL_SCAN;
    }
  }

  /**
   * Analyze a SELECT query for index usage.
   * @param {Object} ast - SELECT AST.
   * @param {Array} indices - Available indices.
   * @param {Object} result - Result object to populate.
   * @private
   */
  analyzeSelectQuery(ast, indices, result) {
    const whereColumns = this.extractWhereColumns(ast.where);
    const orderByColumns = this.extractOrderByColumns(ast.orderBy);
    const joinColumns = this.extractJoinColumns(ast.joins);
    const columnConstraints = this.extractStructuralConstraints(ast.where);

    const candidateMatches = [];
    const rejectedIndexes = [];

    for (const index of indices) {
      const indexName = index.indexName;
      const indexColumns = index.columnNames || [];

      if (!this.isIndexStateReadable(index)) {
        rejectedIndexes.push({
          indexName,
          columns: indexColumns,
          reason: INDEX_REJECTION_REASON.NON_READABLE_INDEX_STATE,
        });
        continue;
      }

      const match = this.evaluateIndexMatchForWhere(
        indexColumns,
        columnConstraints,
        orderByColumns,
      );

      if (!match.canUseIndex) {
        rejectedIndexes.push({
          indexName,
          columns: indexColumns,
          reason: match.rejectionReason || INDEX_REJECTION_REASON.MISSING_LEADING_COLUMN,
        });
        continue;
      }

      candidateMatches.push({
        indexName,
        columns: indexColumns,
        matchedColumns: match.matchedColumns,
        equalityPrefixColumns: match.equalityPrefixColumns,
        rangeColumn: match.rangeColumn,
        orderBySatisfied: match.orderBySatisfied,
        selectivity: Number((1 / (match.matchedColumns.length + 1)).toFixed(2)),
        estimatedCost: INDEX_COST.INDEX_SCAN,
      });
    }

    const selectedIndex = this.rankCandidateMatches(candidateMatches, rejectedIndexes);
    this.populateSelectResultState(selectedIndex, rejectedIndexes, result);

    // Standalone ORDER BY or JOIN check
    this.populateAuxiliaryIndexMatches(indices, orderByColumns, joinColumns, result);

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
   * Check for standalone ORDER BY and JOIN index matches.
   * @param {Array} indices - Table indices.
   * @param {Array} orderByColumns - Order by columns.
   * @param {Array} joinColumns - Join columns.
   * @param {Object} result - Result accumulator.
   * @private
   */
  populateAuxiliaryIndexMatches(indices, orderByColumns, joinColumns, result) {
    for (const index of indices) {
      const indexColumns = index.columnNames || [];

      if (orderByColumns.length > 0 &&
          !result.usableIndices.some((i) =>
            i.indexName === index.indexName && i.usage === INDEX_USAGE.ORDER_BY)) {
        const orderMatch = this.checkIndexMatch(indexColumns, orderByColumns);
        if (orderMatch.usable) {
          result.usableIndices.push({
            indexName: index.indexName,
            usage: INDEX_USAGE.ORDER_BY,
            matchedColumns: orderMatch.matchedColumns,
          });
        }
      }

      if (joinColumns.length > 0 &&
          !result.usableIndices.some((i) =>
            i.indexName === index.indexName && i.usage === INDEX_USAGE.JOIN)) {
        const joinMatch = this.checkIndexMatch(indexColumns, joinColumns);
        if (joinMatch.usable) {
          result.usableIndices.push({
            indexName: index.indexName,
            usage: INDEX_USAGE.JOIN,
            matchedColumns: joinMatch.matchedColumns,
          });
        }
      }
    }
  }

  /**
   * Analyze a mutation statement (UPDATE or DELETE) for index usage.
   * @param {Object} ast - Mutation AST.
   * @param {Array} indices - Available indices.
   * @param {Object} result - Result object to populate.
   * @private
   */
  analyzeMutationWhereQuery(ast, indices, result) {
    const whereColumns = this.extractWhereColumns(ast.where);
    const columnConstraints = this.extractStructuralConstraints(ast.where);

    for (const index of indices) {
      const match = this.evaluateIndexMatchForWhere(index.columnNames || [], columnConstraints);
      if (match.canUseIndex) {
        result.usableIndices.push({
          indexName: index.indexName,
          usage: INDEX_USAGE.WHERE,
          matchedColumns: match.matchedColumns,
        });
        result.estimatedCost = INDEX_COST.INDEX_SCAN;
        if (!result.selectedIndex) {
          result.selectedIndex = {
            indexName: index.indexName,
            matchedColumns: match.matchedColumns,
            equalityPrefixColumns: match.equalityPrefixColumns,
            rangeColumn: match.rangeColumn,
            estimatedCost: INDEX_COST.INDEX_SCAN,
          };
        }
      } else {
        result.rejectedIndexes.push({
          indexName: index.indexName,
          columns: index.columnNames,
          reason: match.rejectionReason,
        });
      }
    }

    if (result.usableIndices.length === 0 && whereColumns.length > 0) {
      result.hints.push(
        `${INDEX_HINT.WHERE_PREFIX}${whereColumns.join(LOCAL_STR_COMMA_SPACE)}`,
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
    this.analyzeMutationWhereQuery(ast, indices, result);
  }

  /**
   * Analyze a DELETE query for index usage.
   * @param {Object} ast - DELETE AST.
   * @param {Array} indices - Available indices.
   * @param {Object} result - Result object to populate.
   * @private
   */
  analyzeDeleteQuery(ast, indices, result) {
    this.analyzeMutationWhereQuery(ast, indices, result);
  }

  /**
   * Extract column names from a WHERE clause.
   * @param {Object} where - WHERE clause AST.
   * @return {Array<string>} Column names.
   * @private
   */
  extractWhereColumns(where) {
    const columns = [];
    if (!where) return columns;

    this.traverseExpression(where, (node) => {
      if (node.type === QUERY_AST_NODE.COLUMN_REF) {
        columns.push(node.column);
      }
    });

    return [...new Set(columns)];
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
   * Check if an index can be used for a set of columns (strict prefix matching).
   * Strict left-prefix contract: ZERO non-leading fallback logic.
   * @param {Array<string>} indexColumns - Index column names.
   * @param {Array<string>} queryColumns - Query column names.
   * @return {Object} Match result.
   */
  checkIndexMatch(indexColumns, queryColumns) {
    if (!indexColumns || !queryColumns || queryColumns.length === 0) {
      return {usable: false, matchedColumns: [], covering: false};
    }

    const matchedColumns = [];

    // Index prefix must match query columns starting at index 0
    for (let i = 0; i < indexColumns.length && i < queryColumns.length; i++) {
      if (queryColumns.includes(indexColumns[i])) {
        matchedColumns.push(indexColumns[i]);
      } else {
        break; // Index prefix must match
      }
    }

    // STRICT: Non-leading column fallback is completely deleted!

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
}

Object.assign(QueryOptimizer.prototype, queryOptimizerSuggestions);

export {QueryOptimizer};
