import { QUERY_EXECUTOR_SHARED } from './query-executor-shared.js';
import { QueryExecutorSegment3 } from './query-executor-segment-3.js';

const {
  COLUMN,
  CONTROL_PLANE_PARTICIPATION_KIND,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_WRITE_RETRY_DECISION_STATE,
  ConfigurationManager,
  DISTRIBUTED_JOIN_STRATEGY,
  DistributedMergeEngine,
  ERRORS,
  HLCClockService,
  LEADER_GAP_REASON_OWNER_MISSING,
  LEADER_GAP_REASON_SERVICE_MISSING,
  LOG_MSG,
  LoggingService,
  METRICS_LOG_TAG,
  MIGRATION_PARTITION_OPERATION,
  NUM,
  PARTITION_SERVICE_ERROR_MSG,
  PG_EXPR_TYPE,
  ParallelQueryCoordinator,
  QUERY_AST_NODE,
  QUERY_AST_TYPE,
  QUERY_CONFIG_KEY,
  QUERY_DEFAULTS,
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_EXECUTOR_LITERAL,
  QUERY_JOIN_TYPE,
  QUERY_LOG_MSG,
  QUERY_MESSAGE_FIELD_MIGRATION_ID,
  QUERY_MESSAGE_FIELD_MIGRATION_OPERATION,
  QUERY_MESSAGE_FIELD_SESSION_ID,
  QUERY_MESSAGE_FIELD_SPLIT_MIRROR_ORIGIN,
  QUERY_MESSAGE_TYPE,
  QUERY_OPERATOR,
  QUERY_RESPONSE_TYPE,
  QUERY_ROUTING_DIAGNOSTIC_REASON,
  QUERY_ROUTING_REPAIR_REASON,
  QUERY_SQL,
  QUERY_SUBSYSTEM,
  RAFT_ROLE,
  SERVICE_STATUS,
  SERVICE_TYPE,
  SQL,
  SYSTEM_TABLE_NAMES,
  TABLES,
  TRANSPORT_ERROR_MSG,
  buildDistributedFailureSummary,
  buildParticipantFailureEntry,
  buildPartitionServiceWitnessFingerprint,
  compactEligibilitySnapshot,
  evaluateEligibilityDecision,
  isRetryableControlPlaneError,
  normalizeParticipantFailureString,
  normalizeParticipantRetryAfterMs,
  resolveBootstrapLeaderSelection,
  resolveParticipantBackpressureState,
} = QUERY_EXECUTOR_SHARED;

class QueryExecutor extends QueryExecutorSegment3 {
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
      rows
    };
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
      return {
        rows: this.applyGroupBy(allRows, ast)
      };
    } else {
      return {
        rows: this.applyAggregates(allRows, ast)
      };
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
    return rows.filter(row => {
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
    return ast.columns.some(col => col.expression?.type === QUERY_EXECUTOR_LITERAL.STRING_AGGREGATE || col.type === QUERY_EXECUTOR_LITERAL.STRING_AGGREGATE);
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
    const groupByColumns = ast.groupBy.map(g => g.column || g.expression?.column || g);

    // Group rows
    for (const row of rows) {
      const key = groupByColumns.map(col => row[col]).join('|');
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
  }

  /**
   * Get argument name for aggregate function.
   * @param {Object} expr - Aggregate expression.
   * @return {string} Argument name.
   * @private
   */
  getArgName(expr) {
    if (expr.argument?.type === QUERY_EXECUTOR_LITERAL.STRING_STAR) return QUERY_EXECUTOR_LITERAL.STRING_VALUE_3;
    if (expr.argument?.type === QUERY_EXECUTOR_LITERAL.STRING_COLUMN_REF) return expr.argument.column;
    return QUERY_EXECUTOR_LITERAL.STRING_VALUE_4;
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
      if (expr.type === QUERY_EXECUTOR_LITERAL.STRING_AGGREGATE) {
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
      values = rows.map(r => r[colName]).filter(v => v !== null && v !== undefined);
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
        return values.reduce((sum, v) => sum + (Number(v) || NUM.ZERO), NUM.ZERO);
      case QUERY_EXECUTOR_LITERAL.STRING_AVG:
        {
          // AVG must be computed on combined data, not averaged averages
          if (values.length === NUM.ZERO) return null;
          const avgSum = values.reduce((s, v) => s + (Number(v) || 0), 0);
          return avgSum / values.length;
        }
      case QUERY_EXECUTOR_LITERAL.STRING_MIN:
        // MIN finds the minimum across all partitions
        if (values.length === NUM.ZERO) return null;
        return values.reduce((min, v) => v < min ? v : min, values[NUM.ZERO]);
      case QUERY_EXECUTOR_LITERAL.STRING_MAX:
        // MAX finds the maximum across all partitions
        if (values.length === NUM.ZERO) return null;
        return values.reduce((max, v) => v > max ? v : max, values[NUM.ZERO]);
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
    return rows.filter(row => this.evaluateExpression(row, having));
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
  }

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
  }

  /**
   * Evaluate an IN/NOT IN expression.
   * @param {Object} row - Data row.
   * @param {Object} expr - IN expression AST.
   * @return {boolean} Expression result.
   * @private
   */
  evaluateIn(row, expr) {
    const value = this.evaluateExpression(row, expr.expression);
    const set = expr.values.map(v => this.evaluateExpression(row, v));
    const matches = set.some(candidate => candidate === value);
    return expr.negated ? !matches : matches;
  }

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
  }

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
    if (value === null || value === undefined || pattern === null || pattern === undefined) {
      return false;
    }
    const regex = this.buildLikeRegex(String(pattern));
    const matches = regex.test(String(value));
    return expr.negated ? !matches : matches;
  }

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
        if (typeof aVal === QUERY_EXECUTOR_LITERAL.STRING_STRING && typeof bVal === QUERY_EXECUTOR_LITERAL.STRING_STRING) {
          const cmp = aVal.localeCompare(bVal);
          if (cmp !== NUM.ZERO) return cmp * dir;
        } else {
          if (aVal < bVal) return -dir;
          if (aVal > bVal) return dir;
        }
      }
      return NUM.ZERO;
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
    const offset = Number.isInteger(limit.offset) ? Math.max(limit.offset, NUM.ZERO) : NUM.ZERO;
    if (!Number.isInteger(limit.count)) {
      return rows.slice(offset);
    }
    const count = Math.max(limit.count, NUM.ZERO);
    return rows.slice(offset, offset + count);
  }

  /**
   * Build SQL string from SELECT AST.
   * @param {Object} ast - SELECT AST.
   * @return {string} SQL string.
   * @private
   */
  buildSelectSQL(ast) {
    let sql = QUERY_EXECUTOR_LITERAL.STRING_SELECT;
    if (ast.distinct) {
      sql += QUERY_EXECUTOR_LITERAL.STRING_DISTINCT;
    }

    // Columns
    const cols = ast.columns.map(col => this.buildColumnSQL(col));
    sql += cols.join(QUERY_EXECUTOR_LITERAL.STRING_VALUE_14);

    // FROM
    if (ast.from.subquery) {
      sql += ` FROM (${this.buildSelectSQL(ast.from.subquery)})`;
    } else {
      sql += ` FROM ${ast.from.name}`;
    }
    if (ast.from.alias) {
      sql += ` AS ${ast.from.alias}`;
    }

    // JOINs
    for (const join of ast.joins || []) {
      if (join.table.subquery) {
        sql += ` ${join.joinType} JOIN` + ` (${this.buildSelectSQL(join.table.subquery)})`;
      } else {
        sql += ` ${join.joinType} JOIN ${join.table.name}`;
      }
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
      const groups = ast.groupBy.map(g => this.buildExpressionSQL(g));
      sql += ` GROUP BY ${groups.join(QUERY_EXECUTOR_LITERAL.STRING_VALUE_14)}`;
    }

    // HAVING
    if (ast.having) {
      sql += ` HAVING ${this.buildExpressionSQL(ast.having)}`;
    }

    // ORDER BY
    if (ast.orderBy) {
      const orders = ast.orderBy.map(o => `${this.buildExpressionSQL(o.expression)} ${o.direction}`);
      sql += ` ORDER BY ${orders.join(QUERY_EXECUTOR_LITERAL.STRING_VALUE_14)}`;
    }

    // LIMIT
    if (ast.limit) {
      sql += ` LIMIT ${ast.limit.count}`;
      if (ast.limit.offset) {
        sql += ` OFFSET ${ast.limit.offset}`;
      }
    }

    // Set operations (UNION, UNION ALL, INTERSECT, EXCEPT)
    if (ast.setOperation) {
      sql += ` ${ast.setOperation.type}` + ` ${this.buildSelectSQL(ast.setOperation.right)}`;
    }

    // CTE prefix
    if (ast.ctes && ast.ctes.length > NUM.ZERO) {
      const recursive = ast.recursive ? 'RECURSIVE ' : '';
      const cteDefs = ast.ctes.map(c => `${c.name} AS (${this.buildSelectSQL(c.query)})`);
      sql = `WITH ${recursive}${cteDefs.join(QUERY_EXECUTOR_LITERAL.STRING_VALUE_14)} ` + sql;
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
    if (col.type === QUERY_EXECUTOR_LITERAL.STRING_STAR) return QUERY_EXECUTOR_LITERAL.STRING_VALUE_3;
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
    if (!expr) return QUERY_EXECUTOR_LITERAL.STRING_VALUE;
    switch (expr.type) {
      case QUERY_EXECUTOR_LITERAL.STRING_STAR:
        return QUERY_EXECUTOR_LITERAL.STRING_VALUE_3;
      case QUERY_EXECUTOR_LITERAL.STRING_LITERAL:
        if (expr.value === null) return QUERY_EXECUTOR_LITERAL.STRING_NULL;
        if (typeof expr.value === QUERY_EXECUTOR_LITERAL.STRING_STRING) return `'${expr.value}'`;
        return String(expr.value);
      case QUERY_EXECUTOR_LITERAL.STRING_COLUMN_REF:
        if (expr.table) return `${expr.table}.${expr.column}`;
        return expr.column;
      case QUERY_EXECUTOR_LITERAL.STRING_BINARY:
        if (expr.operator === QUERY_EXECUTOR_LITERAL.STRING_IS_NULL || expr.operator === QUERY_EXECUTOR_LITERAL.STRING_IS_NOT_NULL) {
          return `(${this.buildExpressionSQL(expr.left)} ${expr.operator})`;
        }
        return `(${this.buildExpressionSQL(expr.left)} ` + `${expr.operator} ${this.buildExpressionSQL(expr.right)})`;
      case QUERY_EXECUTOR_LITERAL.STRING_UNARY:
        return `${expr.operator} ${this.buildExpressionSQL(expr.operand)}`;
      case QUERY_EXECUTOR_LITERAL.STRING_AGGREGATE:
        {
          const aggArg = this.buildExpressionSQL(expr.argument);
          const aggDistinct = expr.distinct ? 'DISTINCT ' : '';
          return `${expr.function}(${aggDistinct}${aggArg})`;
        }
      case QUERY_EXECUTOR_LITERAL.STRING_IN:
        {
          const inVals = expr.values.map(v => this.buildExpressionSQL(v));
          const operator = expr.negated ? 'NOT IN' : 'IN';
          return `${this.buildExpressionSQL(expr.expression)} ${operator} (${inVals.join(QUERY_EXECUTOR_LITERAL.STRING_VALUE_14)})`;
        }
      case QUERY_EXECUTOR_LITERAL.STRING_BETWEEN:
        return `${this.buildExpressionSQL(expr.expression)} BETWEEN ` + `${this.buildExpressionSQL(expr.low)} AND ` + `${this.buildExpressionSQL(expr.high)}`;
      case QUERY_EXECUTOR_LITERAL.STRING_LIKE:
        return `${this.buildExpressionSQL(expr.expression)} ${expr.negated ? QUERY_EXECUTOR_LITERAL.STRING_NOT_LIKE : QUERY_EXECUTOR_LITERAL.STRING_LIKE_2} ` + `${this.buildExpressionSQL(expr.pattern)}`;
      case QUERY_EXECUTOR_LITERAL.STRING_PARAMETER:
        return QUERY_EXECUTOR_LITERAL.STRING_VALUE_4;
      case PG_EXPR_TYPE.CAST:
        return `CAST(${this.buildExpressionSQL(expr.expression)} AS ${expr.affinity})`;
      case PG_EXPR_TYPE.CASE:
        return this.buildCaseSQL(expr);
      case PG_EXPR_TYPE.SUBQUERY:
        return `(${this.buildSelectSQL(expr.query)})`;
      case PG_EXPR_TYPE.EXISTS:
        return `EXISTS (${this.buildSelectSQL(expr.query)})`;
      case PG_EXPR_TYPE.FUNCTION_CALL:
        {
          const fnArgs = expr.args.map(a => this.buildExpressionSQL(a));
          return `${expr.name}(${fnArgs.join(QUERY_EXECUTOR_LITERAL.STRING_VALUE_14)})`;
        }
      default:
        return QUERY_EXECUTOR_LITERAL.STRING_VALUE;
    }
  }

  /**
   * Build SQL for a CASE WHEN expression.
   * Handles both searched CASE (CASE WHEN ...) and simple CASE (CASE expr WHEN ...).
   * @param {Object} expr - CASE AST node.
   * @return {string} Reconstructed CASE SQL.
   */
  buildCaseSQL(expr) {
    let sql = QUERY_EXECUTOR_LITERAL.STRING_CASE;
    if (expr.operand) {
      sql += QUERY_EXECUTOR_LITERAL.STRING_VALUE_15 + this.buildExpressionSQL(expr.operand);
    }
    for (const cond of expr.conditions) {
      sql += QUERY_EXECUTOR_LITERAL.STRING_WHEN + this.buildExpressionSQL(cond.when);
      sql += QUERY_EXECUTOR_LITERAL.STRING_THEN + this.buildExpressionSQL(cond.then);
    }
    if (expr.elseExpr) {
      sql += QUERY_EXECUTOR_LITERAL.STRING_ELSE + this.buildExpressionSQL(expr.elseExpr);
    }
    sql += QUERY_EXECUTOR_LITERAL.STRING_END;
    return sql;
  }

  /**
   * Execute an INSERT statement.
   * Routes ALL queries through message router - no local vs remote distinction.
   * @param {Object} ast - Parsed INSERT AST.
   * @param {string} partitionId - Target partition ID.
   * @param {Array} params - Query parameters.
   * @return {Promise<Object>} Insert result.
   */
  async executeInsert(ast, partitionId, params = [], executionOptions = {}) {
    const sql = this.buildInsertSQL(ast);
    this.logger.debug(QUERY_EXECUTOR_LITERAL.STRING_EXECUTING_INSERT, {
      table: ast.table,
      partitionId,
      rowCount: ast.values.length
    });

    // Route through message router like all other operations
    const result = await this.executeOnPartition(partitionId, sql, params, false, false, false, executionOptions);
    if (!result.success) {
      const error = new Error(
        result.error || `Insert failed on partition: ${partitionId}`,
      );
      if (typeof result?.errorCode === 'string' &&
          result.errorCode.length > NUM.ZERO) {
        error.code = result.errorCode;
        error.errorCode = result.errorCode;
      }
      if (Number.isFinite(result?.retryAfterMs) &&
          result.retryAfterMs > NUM.ZERO) {
        error.retryAfterMs = Math.floor(result.retryAfterMs);
      }
      if (result?.deferRetry === true) {
        error.deferRetry = true;
      }
      if (Array.isArray(result?.participantFailures)) {
        error.participantFailures = result.participantFailures
          .filter((entry) => entry && typeof entry === 'object')
          .map((entry) => ({...entry}));
      }
      if (result?.firstFailedParticipant &&
          typeof result.firstFailedParticipant === 'object') {
        error.firstFailedParticipant = {
          ...result.firstFailedParticipant,
        };
      }
      if (typeof result?.participantNodeId === 'string' &&
          result.participantNodeId.length > NUM.ZERO) {
        error.participantNodeId = result.participantNodeId;
      }
      if (typeof result?.participantAddress === 'string' &&
          result.participantAddress.length > NUM.ZERO) {
        error.participantAddress = result.participantAddress;
      }
      if (typeof result?.reasonCode === 'string' &&
          result.reasonCode.length > NUM.ZERO) {
        error.reasonCode = result.reasonCode;
      }
      if (typeof result?.participationKind === 'string' &&
          result.participationKind.length > NUM.ZERO) {
        error.participationKind = result.participationKind;
      }
      if (typeof result?.tableName === 'string' &&
          result.tableName.length > NUM.ZERO) {
        error.tableName = result.tableName;
      } else if (typeof ast?.table === 'string' &&
          ast.table.length > NUM.ZERO) {
        error.tableName = ast.table;
      }
      if (typeof result?.failedTable === 'string' &&
          result.failedTable.length > NUM.ZERO) {
        error.failedTable = result.failedTable;
      }
      throw error;
    }
    return {
      success: true,
      operation: QUERY_EXECUTOR_LITERAL.STRING_INSERT,
      affectedRows: typeof result?.changes === QUERY_EXECUTOR_LITERAL.STRING_NUMBER ? result.changes : ast.values.length,
      rows: Array.isArray(result.rows) ? result.rows : [],
      partitions: [partitionId]
    };
  }

  /**
   * Append RETURNING clause to a SQL string when present in the AST.
   * @param {string} sql - SQL string to append to.
   * @param {string[]|string|null} returning - RETURNING clause info.
   * @return {string} SQL string with RETURNING appended if applicable.
   * @private
   */
  appendReturning(sql, returning) {
    if (!returning) {
      return sql;
    }
    const cols = returning === '*' ? '*' : returning.join(', ');
    return `${sql} ${SQL.RETURNING} ${cols}`;
  }

  /**
   * Build SQL for INSERT statement.
   * @param {Object} ast - INSERT AST.
   * @return {string} SQL string.
   * @private
   */
  buildInsertSQL(ast) {
    let sql;
    if (ast.orReplace) {
      sql = `${SQL.INSERT_OR_REPLACE_INTO} `;
    } else if (ast.orIgnore) {
      sql = `${SQL.INSERT_OR_IGNORE_INTO} `;
    } else {
      sql = `${SQL.INSERT_INTO} `;
    }
    sql += ast.table;
    if (ast.columns) {
      sql += ` (${ast.columns.join(QUERY_EXECUTOR_LITERAL.STRING_VALUE_14)})`;
    }
    sql += ` ${SQL.VALUES} `;
    const rows = ast.values.map(row => {
      const vals = row.map(v => this.buildExpressionSQL(v));
      return `(${vals.join(', ')})`;
    });
    sql += rows.join(QUERY_EXECUTOR_LITERAL.STRING_VALUE_14);
    return this.appendReturning(sql, ast.returning);
  }

  /**
   * Execute an UPDATE statement.
   * @param {Object} ast - Parsed UPDATE AST.
   * @param {Array} partitionIds - Target partition IDs.
   * @param {Array} params - Query parameters.
   * @return {Promise<Object>} Update result.
   */
  async executeUpdate(ast, partitionIds, params = [], executionOptions = {}) {
    const sql = this.buildUpdateSQL(ast);
    this.logger.debug(QUERY_EXECUTOR_LITERAL.STRING_EXECUTING_UPDATE, {
      table: ast.table,
      partitionCount: partitionIds.length
    });
    const results = await this.executeOnPartitions(partitionIds, sql, params, this.hlcClock.now(), false, false, false, {
      ...executionOptions,
      tableName: ast.table
    });
    const fanoutMetrics = this.getLastCoordinatorMetrics();
    const failedResults = results.filter(result => !result.success);
    const totalChanges = results.reduce((sum, result) => sum + (result.success ? result.changes || 0 : 0), 0);
    const returningRows = [];
    for (const result of results) {
      if (result.success && Array.isArray(result.rows) && result.rows.length > NUM.ZERO) {
        returningRows.push(...result.rows);
      }
    }
    if (failedResults.length > NUM.ZERO) {
      const failureSummary = buildDistributedFailureSummary(failedResults);
      return {
        success: false,
        operation: QUERY_AST_TYPE.UPDATE,
        affectedRows: totalChanges,
        partitions: partitionIds,
        ...failureSummary,
        errorCode: QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
        error: QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE,
        rows: returningRows,
        distributedMetrics: {
          fanout: fanoutMetrics,
          failedPartitionCount: failedResults.length
        }
      };
    }
    return {
      success: true,
      operation: QUERY_AST_TYPE.UPDATE,
      affectedRows: totalChanges,
      partitions: partitionIds,
      rows: returningRows,
      distributedMetrics: {
        fanout: fanoutMetrics,
        failedPartitionCount: NUM.ZERO
      }
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
    const sets = ast.assignments.map(a => `${a.column} = ${this.buildExpressionSQL(a.value)}`);
    sql += sets.join(QUERY_EXECUTOR_LITERAL.STRING_VALUE_14);
    if (ast.where) {
      sql += ` WHERE ${this.buildExpressionSQL(ast.where)}`;
    }
    return this.appendReturning(sql, ast.returning);
  }

  /**
   * Execute a DELETE statement.
   * @param {Object} ast - Parsed DELETE AST.
   * @param {Array} partitionIds - Target partition IDs.
   * @param {Array} params - Query parameters.
   * @return {Promise<Object>} Delete result.
   */
  async executeDelete(ast, partitionIds, params = [], executionOptions = {}) {
    const sql = this.buildDeleteSQL(ast);
    this.logger.debug(QUERY_EXECUTOR_LITERAL.STRING_EXECUTING_DELETE, {
      table: ast.table,
      partitionCount: partitionIds.length
    });
    const results = await this.executeOnPartitions(partitionIds, sql, params, this.hlcClock.now(), false, false, false, {
      ...executionOptions,
      tableName: ast.table
    });
    const fanoutMetrics = this.getLastCoordinatorMetrics();
    const failedResults = results.filter(result => !result.success);
    const totalChanges = results.reduce((sum, result) => sum + (result.success ? result.changes || 0 : 0), 0);
    const returningRows = [];
    for (const result of results) {
      if (result.success && Array.isArray(result.rows) && result.rows.length > NUM.ZERO) {
        returningRows.push(...result.rows);
      }
    }
    if (failedResults.length > NUM.ZERO) {
      const failureSummary = buildDistributedFailureSummary(failedResults);
      return {
        success: false,
        operation: QUERY_AST_TYPE.DELETE,
        affectedRows: totalChanges,
        partitions: partitionIds,
        ...failureSummary,
        errorCode: QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
        error: QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE,
        rows: returningRows,
        distributedMetrics: {
          fanout: fanoutMetrics,
          failedPartitionCount: failedResults.length
        }
      };
    }
    return {
      success: true,
      operation: QUERY_AST_TYPE.DELETE,
      affectedRows: totalChanges,
      partitions: partitionIds,
      rows: returningRows,
      distributedMetrics: {
        fanout: fanoutMetrics,
        failedPartitionCount: NUM.ZERO
      }
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
    return this.appendReturning(sql, ast.returning);
  }
}
export { QueryExecutor };

