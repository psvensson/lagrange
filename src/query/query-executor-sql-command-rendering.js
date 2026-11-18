import {QUERY_EXECUTOR_SHARED} from './query-executor-shared.js';
import {renderSqliteIdentifier} from './sqlite-identifier.js';
import {
  renderExpression,
  renderResultColumn,
  renderSelect,
} from './sql-statement-renderer.js';
import {
  affectedRowsField,
  sumAffectedRowCounts,
} from './application-database-result.js';
import {
  isAppliedWithUnknownCount,
  pickTypedWriteAnswer,
} from '../partition/partition-write-kernel.js';
import {pickRoutingDenialFields} from './query-execution-budget.js';

const LOCAL_STR_STRING = 'string';
const LOCAL_STR_OBJECT = 'object';

const {
  QUERY_AST_TYPE,
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_EXECUTOR_LITERAL,
  SQL,
  buildDistributedFailureSummary,
} = QUERY_EXECUTOR_SHARED;

function stringOrNull(value) {
  return typeof value === LOCAL_STR_STRING ? value : null;
}

function copyParticipantDisposition(error, result) {
  Object.assign(
    error,
    {
      failureCode: stringOrNull(result?.failureCode),
      committed: result?.committed === true,
      outcome: stringOrNull(result?.outcome),
      disposition: stringOrNull(result?.disposition),
      logIndex: Number.isSafeInteger(result?.logIndex) ? result.logIndex : null,
      entryId: stringOrNull(result?.entryId),
      // The redelivery owner's report of the wait it spent on an unknown
      // outcome travels with the typed failure.
      spentWait: result?.spentWait ?? null,
    },
    pickTypedWriteAnswer(result),
    pickRoutingDenialFields(result),
  );
}

function buildDistributedMutationResult(
  results,
  partitionIds,
  operation,
  fanoutMetrics,
) {
  const failedResults = results.filter((result) => !result.success);
  const successfulResults = results.filter((result) => result.success);
  const unknownCount = successfulResults.find(isAppliedWithUnknownCount);
  const mutationResult = unknownCount === undefined ?
    affectedRowsField(sumAffectedRowCounts(successfulResults
      .map((result) => result.changes))) :
    {settledReplay: unknownCount.settledReplay};
  const rows = results.flatMap((result) =>
    result.success && Array.isArray(result.rows) ? result.rows : [],
  );
  const originHlc = results[0]?.originHlc;
  const hasSharedOriginHlc =
    typeof originHlc === LOCAL_STR_STRING &&
    originHlc.length > 0 &&
    results.every((result) => result.originHlc === originHlc);
  const commonResult = {
    operation,
    ...mutationResult,
    partitions: partitionIds,
    rows,
    ...(hasSharedOriginHlc ? {originHlc} : {}),
    distributedMetrics: {
      fanout: fanoutMetrics,
      failedPartitionCount: failedResults.length,
    },
  };
  if (failedResults.length === 0) {
    return {success: true, ...commonResult};
  }
  return {
    success: false,
    ...commonResult,
    ...buildDistributedFailureSummary(failedResults),
    errorCode: QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
    error: QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE,
  };
}

const queryExecutorSqlCommandMethods = {
  /**
   * Build SQL string from SELECT AST (the one renderer,
   * sql-statement-renderer.js).
   * @param {Object} ast - SELECT AST.
   * @return {string} SQL string.
   */
  buildSelectSQL(ast) {
    return renderSelect(ast);
  },

  /**
   * Build SQL for one select-list column, named as SQLite names it for the
   * statement as written.
   * @param {Object} col - Column AST.
   * @return {string} Column SQL.
   */
  buildColumnSQL(col) {
    return renderResultColumn(col);
  },

  /**
   * Build SQL for an expression (the one renderer).
   * @param {Object} expr - Expression AST.
   * @return {string} Expression SQL.
   */
  buildExpressionSQL(expr) {
    return renderExpression(expr);
  },

  extractLiteralValue(expr) {
    if (!expr) return null;
    if (expr.type === QUERY_EXECUTOR_LITERAL.STRING_LITERAL) {
      return expr.value;
    }
    return expr.value !== undefined ? expr.value : null;
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
    const targetParams = [...params];
    const sql = this.buildInsertSQL(ast, targetParams);
    this.logger.debug(QUERY_EXECUTOR_LITERAL.STRING_EXECUTING_INSERT, {
      table: ast.table,
      partitionId,
      rowCount: ast.values.length,
    });

    // Route through message router like all other operations
    const result = await this.executeOnPartition(
      partitionId,
      sql,
      targetParams,
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
      copyParticipantDisposition(error, result);
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
      ...(isAppliedWithUnknownCount(result) ?
        {settledReplay: result.settledReplay} :
        affectedRowsField(sumAffectedRowCounts([result?.changes]))),
      rows: Array.isArray(result.rows) ? result.rows : [],
      partitions: [partitionId],
      durableCommitWitness: result.durableCommitWitness,
      originHlc: result.originHlc,
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
  buildInsertSQL(ast, params) {
    const bindLiterals = Array.isArray(params) && params.length === 0;
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
      const vals = row.map((value) => {
        if (bindLiterals && value?.type === QUERY_EXECUTOR_LITERAL.STRING_LITERAL) {
          params.push(this.extractLiteralValue(value));
          return '?';
        }
        return this.buildExpressionSQL(value);
      });
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
    const targetParams = [...params];
    const sql = this.buildUpdateSQL(ast, targetParams);
    return this.executeDistributedMutation(
      ast,
      partitionIds,
      targetParams,
      executionOptions,
      sql,
      QUERY_AST_TYPE.UPDATE,
      QUERY_EXECUTOR_LITERAL.STRING_EXECUTING_UPDATE,
    );
  },

  /**
   * Execute a distributed UPDATE or DELETE through one result contract.
   * @param {Object} ast - Parsed mutation AST.
   * @param {Array} partitionIds - Target partition IDs.
   * @param {Array} params - Query parameters.
   * @param {Object} executionOptions - Distributed execution options.
   * @param {string} sql - Operation-specific SQL.
   * @param {string} operation - Operation AST type.
   * @param {string} logMessage - Operation-specific log message.
   * @return {Promise<Object>} Distributed mutation result.
   * @private
   */
  async executeDistributedMutation(
    ast,
    partitionIds,
    params,
    executionOptions,
    sql,
    operation,
    logMessage,
  ) {
    this.logger.debug(logMessage, {
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
    return buildDistributedMutationResult(
      results,
      partitionIds,
      operation,
      this.getLastCoordinatorMetrics(),
    );
  },

  /**
   * Build SQL for UPDATE statement.
   * @param {Object} ast - UPDATE AST.
   * @return {string} SQL string.
   * @private
   */
  buildUpdateSQL(ast, params) {
    const bindLiterals = Array.isArray(params) && params.length === 0;
    let sql = `UPDATE ${renderSqliteIdentifier(ast.table)} SET `;
    const assignments = ast.assignments || ast.set || [];
    const sets = assignments.map((assignment) => {
      const val = assignment.value;
      if (bindLiterals && val?.type === QUERY_EXECUTOR_LITERAL.STRING_LITERAL) {
        params.push(this.extractLiteralValue(val));
        return `${assignment.column} = ?`;
      }
      return `${assignment.column} = ${this.buildExpressionSQL(val)}`;
    });
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
    return this.executeDistributedMutation(
      ast,
      partitionIds,
      params,
      executionOptions,
      sql,
      QUERY_AST_TYPE.DELETE,
      QUERY_EXECUTOR_LITERAL.STRING_EXECUTING_DELETE,
    );
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
