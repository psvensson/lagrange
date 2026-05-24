import {QUERY_EXECUTOR_SHARED} from './query-executor-shared.js';

const {
  NUM,
  QUERY_EXECUTOR_LITERAL,
} = QUERY_EXECUTOR_SHARED;

const queryExecutorSelectAggregationMethods = {
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
    return {
      rows,
    };
  },

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
      return {
        rows: this.applyGroupBy(allRows, ast),
      };
    } else {
      return {
        rows: this.applyAggregates(allRows, ast),
      };
    }
  },

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
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  },

  /**
   * Check if AST has aggregate functions.
   * @param {Object} ast - SELECT AST.
   * @return {boolean} True if has aggregates.
   * @private
   */
  hasAggregates(ast) {
    return ast.columns.some(
      (col) =>
        col.expression?.type === QUERY_EXECUTOR_LITERAL.STRING_AGGREGATE ||
        col.type === QUERY_EXECUTOR_LITERAL.STRING_AGGREGATE,
    );
  },

  /**
   * Apply GROUP BY to rows.
   * @param {Array} rows - Input rows.
   * @param {Object} ast - SELECT AST.
   * @return {Array} Grouped rows.
   * @private
   */
  applyGroupBy(rows, ast) {
    const groups = new Map();
    const groupByColumns = ast.groupBy.map(
      (g) => g.column || g.expression?.column || g,
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
  },

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
    if (ast.groupBy && rows.length > NUM.ZERO) {
      for (const g of ast.groupBy) {
        const col = g.column || g.expression?.column || g;
        result[col] = rows[NUM.ZERO][col];
      }
    }

    // Compute aggregates
    for (const col of ast.columns) {
      const expr = col.expression || col;
      if (expr.type === QUERY_EXECUTOR_LITERAL.STRING_AGGREGATE) {
        const alias = col.alias || `${expr.function}(${this.getArgName(expr)})`;
        result[alias] = this.computeAggregate(rows, expr);
      } else if (expr.type === QUERY_EXECUTOR_LITERAL.STRING_COLUMN_REF) {
        const colName = expr.column;
        if (rows.length > NUM.ZERO) {
          result[colName] = rows[NUM.ZERO][colName];
        }
      }
    }
    return result;
  },

  /**
   * Get argument name for aggregate function.
   * @param {Object} expr - Aggregate expression.
   * @return {string} Argument name.
   * @private
   */
  getArgName(expr) {
    if (expr.argument?.type === QUERY_EXECUTOR_LITERAL.STRING_STAR) {
      return QUERY_EXECUTOR_LITERAL.STRING_VALUE_3;
    }
    if (expr.argument?.type === QUERY_EXECUTOR_LITERAL.STRING_COLUMN_REF) {
      return expr.argument.column;
    }
    return QUERY_EXECUTOR_LITERAL.STRING_VALUE_4;
  },

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
      if (expr.type === QUERY_EXECUTOR_LITERAL.STRING_AGGREGATE) {
        const alias = col.alias || `${expr.function}(${this.getArgName(expr)})`;
        result[alias] = this.computeAggregate(rows, expr);
      }
    }
    return [result];
  },

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
      values = rows
        .map((row) => row[colName])
        .filter((value) => value !== null && value !== undefined);
    }
    if (expr.distinct && colName) {
      values = [...new Set(values)];
    }
    switch (func) {
    case QUERY_EXECUTOR_LITERAL.STRING_COUNT:
      // COUNT(*) counts all rows, COUNT(column) counts non-null values
      if (arg?.type === QUERY_EXECUTOR_LITERAL.STRING_STAR) {
        return rows.length;
      }
      return values.length;
    case QUERY_EXECUTOR_LITERAL.STRING_SUM:
      // SUM aggregates numeric values across all partitions
      return values.reduce(
        (sum, value) => sum + (Number(value) || NUM.ZERO),
        NUM.ZERO,
      );
    case QUERY_EXECUTOR_LITERAL.STRING_AVG:
    {
      // AVG must be computed on combined data, not averaged averages
      if (values.length === NUM.ZERO) {
        return null;
      }
      const avgSum = values.reduce(
        (sum, value) => sum + (Number(value) || NUM.ZERO),
        NUM.ZERO,
      );
      return avgSum / values.length;
    }
    case QUERY_EXECUTOR_LITERAL.STRING_MIN:
      // MIN finds the minimum across all partitions
      if (values.length === NUM.ZERO) {
        return null;
      }
      return values.reduce(
        (min, value) => (value < min ? value : min),
        values[NUM.ZERO],
      );
    case QUERY_EXECUTOR_LITERAL.STRING_MAX:
      // MAX finds the maximum across all partitions
      if (values.length === NUM.ZERO) {
        return null;
      }
      return values.reduce(
        (max, value) => (value > max ? value : max),
        values[NUM.ZERO],
      );
    default:
      return null;
    }
  },

  /**
   * Apply HAVING clause to grouped rows.
   * @param {Array} rows - Grouped rows.
   * @param {Object} having - HAVING clause AST.
   * @return {Array} Filtered rows.
   * @private
   */
  applyHaving(rows, having) {
    return rows.filter((row) => this.evaluateExpression(row, having));
  },

  /**
   * Evaluate an expression against a row.
   * @param {Object} row - Data row.
   * @param {Object} expr - Expression AST.
   * @return {*} Expression value.
   * @private
   */
  evaluateExpression(row, expr) {
    if (!expr) {
      return true;
    }
    switch (expr.type) {
    case QUERY_EXECUTOR_LITERAL.STRING_BINARY:
      return this.evaluateBinary(row, expr);
    case QUERY_EXECUTOR_LITERAL.STRING_UNARY:
      return this.evaluateUnary(row, expr);
    case QUERY_EXECUTOR_LITERAL.STRING_IN:
      return this.evaluateIn(row, expr);
    case QUERY_EXECUTOR_LITERAL.STRING_BETWEEN:
      return this.evaluateBetween(row, expr);
    case QUERY_EXECUTOR_LITERAL.STRING_LIKE:
      return this.evaluateLike(row, expr);
    case QUERY_EXECUTOR_LITERAL.STRING_LITERAL:
      return expr.value;
    case QUERY_EXECUTOR_LITERAL.STRING_COLUMN_REF:
      return row[expr.column];
    case QUERY_EXECUTOR_LITERAL.STRING_AGGREGATE:
    {
      // For HAVING, aggregate values should already be computed
      const alias = `${expr.function}(${this.getArgName(expr)})`;
      return row[alias];
    }
    default:
      return true;
    }
  },

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
    case QUERY_EXECUTOR_LITERAL.STRING_AND:
      return left && right;
    case QUERY_EXECUTOR_LITERAL.STRING_OR:
      return left || right;
    case QUERY_EXECUTOR_LITERAL.STRING_VALUE_5:
      return left === right;
    case QUERY_EXECUTOR_LITERAL.STRING_VALUE_6:
    case QUERY_EXECUTOR_LITERAL.STRING_VALUE_7:
      return left !== right;
    case QUERY_EXECUTOR_LITERAL.STRING_VALUE_8:
      return left < right;
    case QUERY_EXECUTOR_LITERAL.STRING_VALUE_9:
      return left <= right;
    case QUERY_EXECUTOR_LITERAL.STRING_VALUE_10:
      return left > right;
    case QUERY_EXECUTOR_LITERAL.STRING_VALUE_11:
      return left >= right;
    case QUERY_EXECUTOR_LITERAL.STRING_IS_NULL:
      return left === null || left === undefined;
    case QUERY_EXECUTOR_LITERAL.STRING_IS_NOT_NULL:
      return left !== null && left !== undefined;
    default:
      return true;
    }
  },

  /**
   * Evaluate a unary expression.
   * @param {Object} row - Data row.
   * @param {Object} expr - Unary expression.
   * @return {*} Expression result.
   * @private
   */
  evaluateUnary(row, expr) {
    const operand = this.evaluateExpression(row, expr.operand);
    switch (expr.operator) {
    case QUERY_EXECUTOR_LITERAL.STRING_NOT:
      return !operand;
    case QUERY_EXECUTOR_LITERAL.STRING_VALUE_12:
      return +operand;
    case QUERY_EXECUTOR_LITERAL.STRING_VALUE_13:
      return -operand;
    default:
      return operand;
    }
  },

  /**
   * Evaluate an IN/NOT IN expression.
   * @param {Object} row - Data row.
   * @param {Object} expr - IN expression AST.
   * @return {boolean} Expression result.
   * @private
   */
  evaluateIn(row, expr) {
    const value = this.evaluateExpression(row, expr.expression);
    const set = expr.values.map((v) => this.evaluateExpression(row, v));
    const matches = set.some((candidate) => candidate === value);
    return expr.negated ? !matches : matches;
  },

  /**
   * Evaluate a BETWEEN expression.
   * @param {Object} row - Data row.
   * @param {Object} expr - BETWEEN expression AST.
   * @return {boolean} Expression result.
   * @private
   */
  evaluateBetween(row, expr) {
    const value = this.evaluateExpression(row, expr.expression);
    const low = this.evaluateExpression(row, expr.low);
    const high = this.evaluateExpression(row, expr.high);
    return value >= low && value <= high;
  },

  /**
   * Evaluate a LIKE/NOT LIKE expression.
   * @param {Object} row - Data row.
   * @param {Object} expr - LIKE expression AST.
   * @return {boolean} Expression result.
   * @private
   */
  evaluateLike(row, expr) {
    const value = this.evaluateExpression(row, expr.expression);
    const pattern = this.evaluateExpression(row, expr.pattern);
    if (
      value === null ||
      value === undefined ||
      pattern === null ||
      pattern === undefined
    ) {
      return false;
    }
    const regex = this.buildLikeRegex(String(pattern));
    const matches = regex.test(String(value));
    return expr.negated ? !matches : matches;
  },

  /**
   * Build regex for SQL LIKE semantics.
   * @param {string} pattern - SQL LIKE pattern.
   * @return {RegExp} Regex matcher.
   * @private
   */
  buildLikeRegex(pattern) {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regexPattern = escaped.replace(/%/g, '.*').replace(/_/g, '.');
    return new RegExp(`^${regexPattern}$`);
  },

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
        const dir = clause.direction === 'DESC' ? -1 : NUM.ONE;
        const aVal = a[col];
        const bVal = b[col];
        if (aVal === bVal) {
          continue;
        }
        if (aVal === null) {
          return dir;
        }
        if (bVal === null) {
          return -dir;
        }
        if (
          typeof aVal === QUERY_EXECUTOR_LITERAL.STRING_STRING &&
          typeof bVal === QUERY_EXECUTOR_LITERAL.STRING_STRING
        ) {
          const cmp = aVal.localeCompare(bVal);
          if (cmp !== NUM.ZERO) {
            return cmp * dir;
          }
        } else {
          if (aVal < bVal) {
            return -dir;
          }
          if (aVal > bVal) {
            return dir;
          }
        }
      }
      return NUM.ZERO;
    });
  },

  /**
   * Apply LIMIT and OFFSET to rows.
   * @param {Array} rows - Input rows.
   * @param {Object} limit - LIMIT clause.
   * @return {Array} Limited rows.
   * @private
   */
  applyLimit(rows, limit) {
    const offset = Number.isInteger(limit.offset) ?
      Math.max(limit.offset, NUM.ZERO) :
      NUM.ZERO;
    if (!Number.isInteger(limit.count)) {
      return rows.slice(offset);
    }
    const count = Math.max(limit.count, NUM.ZERO);
    return rows.slice(offset, offset + count);
  }
};

function installQueryExecutorSelectAggregationHelpers(target) {
  for (const [name, value] of Object.entries(
    queryExecutorSelectAggregationMethods,
  )) {
    Object.defineProperty(target.prototype, name, {
      value,
      configurable: true,
      writable: true,
    });
  }
}

export {installQueryExecutorSelectAggregationHelpers};
