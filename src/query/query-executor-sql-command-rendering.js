import {QUERY_EXECUTOR_SHARED} from './query-executor-shared.js';
import {renderSqliteIdentifier} from './sqlite-identifier.js';

const LOCAL_STR_STRING = 'string';
const LOCAL_STR_OBJECT = 'object';

const {
  PG_EXPR_TYPE,
  QUERY_AST_TYPE,
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_EXECUTOR_LITERAL,
  SQL,
  buildDistributedFailureSummary,
} = QUERY_EXECUTOR_SHARED;

const queryExecutorSqlCommandMethods = {
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
    const cols = ast.columns.map((col) => this.buildColumnSQL(col));
    sql += cols.join(QUERY_EXECUTOR_LITERAL.STRING_VALUE_14);

    // FROM
    if (ast.from.subquery) {
      sql += ` FROM (${this.buildSelectSQL(ast.from.subquery)})`;
    } else {
      sql += ` FROM ${renderSqliteIdentifier(ast.from.name)}`;
    }
    if (ast.from.alias) {
      sql += ` AS ${ast.from.alias}`;
    }

    // JOINs
    for (const join of ast.joins || []) {
      if (join.table.subquery) {
        sql +=
          ` ${join.joinType} JOIN` +
          ` (${this.buildSelectSQL(join.table.subquery)})`;
      } else {
        sql +=
          ` ${join.joinType} JOIN ` +
          renderSqliteIdentifier(join.table.name);
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
      const groups = ast.groupBy.map((g) => this.buildExpressionSQL(g));
      sql += ` GROUP BY ${groups.join(QUERY_EXECUTOR_LITERAL.STRING_VALUE_14)}`;
    }

    // HAVING
    if (ast.having) {
      sql += ` HAVING ${this.buildExpressionSQL(ast.having)}`;
    }

    // ORDER BY
    if (ast.orderBy) {
      const orders = ast.orderBy.map(
        (orderBy) =>
          `${this.buildExpressionSQL(orderBy.expression)} ${orderBy.direction}`,
      );
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
      sql +=
        ` ${ast.setOperation.type}` +
        ` ${this.buildSelectSQL(ast.setOperation.right)}`;
    }

    // CTE prefix
    if (ast.ctes && ast.ctes.length > 0) {
      const recursive = ast.recursive ? 'RECURSIVE ' : '';
      const cteDefs = ast.ctes.map(
        (cte) => `${cte.name} AS (${this.buildSelectSQL(cte.query)})`,
      );
      sql =
        `WITH ${recursive}${cteDefs.join(QUERY_EXECUTOR_LITERAL.STRING_VALUE_14)} ` +
        sql;
    }
    return sql;
  },

  /**
   * Build SQL for a column.
   * @param {Object} col - Column AST.
   * @return {string} Column SQL.
   * @private
   */
  buildColumnSQL(col) {
    if (col.type === QUERY_EXECUTOR_LITERAL.STRING_STAR) {
      return QUERY_EXECUTOR_LITERAL.STRING_VALUE_3;
    }
    let sql = this.buildExpressionSQL(col.expression || col);
    if (col.alias) {
      sql += ` AS ${col.alias}`;
    }
    return sql;
  },

  /**
   * Build SQL for an expression.
   * @param {Object} expr - Expression AST.
   * @return {string} Expression SQL.
   * @private
   */
  buildExpressionSQL(expr) {
    if (!expr) {
      return QUERY_EXECUTOR_LITERAL.STRING_VALUE;
    }
    switch (expr.type) {
    case QUERY_EXECUTOR_LITERAL.STRING_STAR:
      return QUERY_EXECUTOR_LITERAL.STRING_VALUE_3;
    case QUERY_EXECUTOR_LITERAL.STRING_LITERAL:
      if (expr.value === null) {
        return QUERY_EXECUTOR_LITERAL.STRING_NULL;
      }
      if (typeof expr.value === QUERY_EXECUTOR_LITERAL.STRING_STRING) {
        return `'${expr.value}'`;
      }
      return String(expr.value);
    case QUERY_EXECUTOR_LITERAL.STRING_COLUMN_REF:
      if (expr.table) {
        return `${expr.table}.${expr.column}`;
      }
      return expr.column;
    case QUERY_EXECUTOR_LITERAL.STRING_BINARY:
      if (
        expr.operator === QUERY_EXECUTOR_LITERAL.STRING_IS_NULL ||
          expr.operator === QUERY_EXECUTOR_LITERAL.STRING_IS_NOT_NULL
      ) {
        return `(${this.buildExpressionSQL(expr.left)} ${expr.operator})`;
      }
      return (
        `(${this.buildExpressionSQL(expr.left)} ` +
          `${expr.operator} ${this.buildExpressionSQL(expr.right)})`
      );
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
      const inVals = expr.values.map((value) =>
        this.buildExpressionSQL(value),
      );
      const operator = expr.negated ? 'NOT IN' : 'IN';
      return (
        `${this.buildExpressionSQL(expr.expression)} ${operator} (` +
        `${inVals.join(QUERY_EXECUTOR_LITERAL.STRING_VALUE_14)})`
      );
    }
    case QUERY_EXECUTOR_LITERAL.STRING_BETWEEN:
      return (
        `${this.buildExpressionSQL(expr.expression)} BETWEEN ` +
          `${this.buildExpressionSQL(expr.low)} AND ` +
          `${this.buildExpressionSQL(expr.high)}`
      );
    case QUERY_EXECUTOR_LITERAL.STRING_LIKE:
      return (
        `${this.buildExpressionSQL(expr.expression)} ` +
          `${expr.negated ?
            QUERY_EXECUTOR_LITERAL.STRING_NOT_LIKE :
            QUERY_EXECUTOR_LITERAL.STRING_LIKE_2} ` +
          `${this.buildExpressionSQL(expr.pattern)}`
      );
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
      const fnArgs = expr.args.map((arg) => this.buildExpressionSQL(arg));
      return `${expr.name}(${fnArgs.join(QUERY_EXECUTOR_LITERAL.STRING_VALUE_14)})`;
    }
    default:
      return QUERY_EXECUTOR_LITERAL.STRING_VALUE;
    }
  },

  /**
   * Build SQL for a CASE WHEN expression.
   * Handles both searched CASE (CASE WHEN ...) and simple CASE (CASE expr WHEN ...).
   * @param {Object} expr - CASE AST node.
   * @return {string} Reconstructed CASE SQL.
   */
  buildCaseSQL(expr) {
    let sql = QUERY_EXECUTOR_LITERAL.STRING_CASE;
    if (expr.operand) {
      sql +=
        QUERY_EXECUTOR_LITERAL.STRING_VALUE_15 +
        this.buildExpressionSQL(expr.operand);
    }
    for (const cond of expr.conditions) {
      sql +=
        QUERY_EXECUTOR_LITERAL.STRING_WHEN +
        this.buildExpressionSQL(cond.when);
      sql +=
        QUERY_EXECUTOR_LITERAL.STRING_THEN +
        this.buildExpressionSQL(cond.then);
    }
    if (expr.elseExpr) {
      sql +=
        QUERY_EXECUTOR_LITERAL.STRING_ELSE +
        this.buildExpressionSQL(expr.elseExpr);
    }
    sql += QUERY_EXECUTOR_LITERAL.STRING_END;
    return sql;
  },

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
      rowCount: ast.values.length,
    });

    // Route through message router like all other operations
    const result = await this.executeOnPartition(
      partitionId,
      sql,
      params,
      false,
      false,
      false,
      executionOptions,
    );
    if (!result.success) {
      const error = new Error(
        result.error || `Insert failed on partition: ${partitionId}`,
      );
      if (
        typeof result?.errorCode === LOCAL_STR_STRING &&
        result.errorCode.length > 0
      ) {
        error.code = result.errorCode;
        error.errorCode = result.errorCode;
      }
      if (
        Number.isFinite(result?.retryAfterMs) &&
        result.retryAfterMs > 0
      ) {
        error.retryAfterMs = Math.floor(result.retryAfterMs);
      }
      if (result?.deferRetry === true) {
        error.deferRetry = true;
      }
      if (Array.isArray(result?.participantFailures)) {
        error.participantFailures = result.participantFailures
          .filter((entry) => entry && typeof entry === LOCAL_STR_OBJECT)
          .map((entry) => ({...entry}));
      }
      if (
        result?.firstFailedParticipant &&
        typeof result.firstFailedParticipant === LOCAL_STR_OBJECT
      ) {
        error.firstFailedParticipant = {
          ...result.firstFailedParticipant,
        };
      }
      if (
        typeof result?.participantNodeId === LOCAL_STR_STRING &&
        result.participantNodeId.length > 0
      ) {
        error.participantNodeId = result.participantNodeId;
      }
      if (
        typeof result?.participantAddress === LOCAL_STR_STRING &&
        result.participantAddress.length > 0
      ) {
        error.participantAddress = result.participantAddress;
      }
      if (
        typeof result?.reasonCode === LOCAL_STR_STRING &&
        result.reasonCode.length > 0
      ) {
        error.reasonCode = result.reasonCode;
      }
      if (
        typeof result?.participationKind === LOCAL_STR_STRING &&
        result.participationKind.length > 0
      ) {
        error.participationKind = result.participationKind;
      }
      if (
        typeof result?.tableName === LOCAL_STR_STRING &&
        result.tableName.length > 0
      ) {
        error.tableName = result.tableName;
      } else if (typeof ast?.table === LOCAL_STR_STRING && ast.table.length > 0) {
        error.tableName = ast.table;
      }
      if (
        typeof result?.failedTable === LOCAL_STR_STRING &&
        result.failedTable.length > 0
      ) {
        error.failedTable = result.failedTable;
      }
      throw error;
    }
    return {
      success: true,
      operation: QUERY_EXECUTOR_LITERAL.STRING_INSERT,
      affectedRows:
        typeof result?.changes === QUERY_EXECUTOR_LITERAL.STRING_NUMBER ?
          result.changes :
          ast.values.length,
      rows: Array.isArray(result.rows) ? result.rows : [],
      partitions: [partitionId],
      durableCommitWitness: result.durableCommitWitness,
      acceptingNodeId: result.acceptingNodeId,
      acknowledgedAtMs: result.acknowledgedAtMs,
    };
  },

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
  },

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
    sql += renderSqliteIdentifier(ast.table);
    if (ast.columns) {
      sql += ` (${ast.columns.join(QUERY_EXECUTOR_LITERAL.STRING_VALUE_14)})`;
    }
    sql += ` ${SQL.VALUES} `;
    const rows = ast.values.map((row) => {
      const vals = row.map((value) => this.buildExpressionSQL(value));
      return `(${vals.join(', ')})`;
    });
    sql += rows.join(QUERY_EXECUTOR_LITERAL.STRING_VALUE_14);
    return this.appendReturning(sql, ast.returning);
  },

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
      partitionCount: partitionIds.length,
    });
    const results = await this.executeOnPartitions(
      partitionIds,
      sql,
      params,
      this.hlcClock.now(),
      false,
      false,
      false,
      {
        ...executionOptions,
        tableName: ast.table,
      },
    );
    const fanoutMetrics = this.getLastCoordinatorMetrics();
    const failedResults = results.filter((result) => !result.success);
    const totalChanges = results.reduce(
      (sum, result) => sum + (result.success ? result.changes || 0 : 0),
      0,
    );
    const returningRows = [];
    for (const result of results) {
      if (
        result.success &&
        Array.isArray(result.rows) &&
        result.rows.length > 0
      ) {
        returningRows.push(...result.rows);
      }
    }
    if (failedResults.length > 0) {
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
          failedPartitionCount: failedResults.length,
        },
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
        failedPartitionCount: 0,
      },
    };
  },

  /**
   * Build SQL for UPDATE statement.
   * @param {Object} ast - UPDATE AST.
   * @return {string} SQL string.
   * @private
   */
  buildUpdateSQL(ast) {
    let sql = `UPDATE ${renderSqliteIdentifier(ast.table)} SET `;
    const sets = ast.assignments.map(
      (assignment) =>
        `${assignment.column} = ${this.buildExpressionSQL(assignment.value)}`,
    );
    sql += sets.join(QUERY_EXECUTOR_LITERAL.STRING_VALUE_14);
    if (ast.where) {
      sql += ` WHERE ${this.buildExpressionSQL(ast.where)}`;
    }
    return this.appendReturning(sql, ast.returning);
  },

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
      partitionCount: partitionIds.length,
    });
    const results = await this.executeOnPartitions(
      partitionIds,
      sql,
      params,
      this.hlcClock.now(),
      false,
      false,
      false,
      {
        ...executionOptions,
        tableName: ast.table,
      },
    );
    const fanoutMetrics = this.getLastCoordinatorMetrics();
    const failedResults = results.filter((result) => !result.success);
    const totalChanges = results.reduce(
      (sum, result) => sum + (result.success ? result.changes || 0 : 0),
      0,
    );
    const returningRows = [];
    for (const result of results) {
      if (
        result.success &&
        Array.isArray(result.rows) &&
        result.rows.length > 0
      ) {
        returningRows.push(...result.rows);
      }
    }
    if (failedResults.length > 0) {
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
          failedPartitionCount: failedResults.length,
        },
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
        failedPartitionCount: 0,
      },
    };
  },

  /**
   * Build SQL for DELETE statement.
   * @param {Object} ast - DELETE AST.
   * @return {string} SQL string.
   * @private
   */
  buildDeleteSQL(ast) {
    let sql = `DELETE FROM ${renderSqliteIdentifier(ast.table)}`;
    if (ast.where) {
      sql += ` WHERE ${this.buildExpressionSQL(ast.where)}`;
    }
    return this.appendReturning(sql, ast.returning);
  },
};

function installQueryExecutorSqlCommandHelpers(target) {
  for (const [name, value] of Object.entries(queryExecutorSqlCommandMethods)) {
    Object.defineProperty(target.prototype, name, {
      value,
      configurable: true,
      writable: true,
    });
  }
}

export {installQueryExecutorSqlCommandHelpers};
