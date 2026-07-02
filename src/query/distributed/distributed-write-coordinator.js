import {createHash} from 'node:crypto';
import {LoggingService} from '../../logging/logging-service.js';
import {
  QUERY_AST_NODE,
  QUERY_AST_TYPE,
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_LOG_MSG,
  QUERY_SUBSYSTEM,
} from '../query-constants.js';

const LOCAL_NUM_ONE = 1;
const LOCAL_NUM_ZERO = 0;
const LOCAL_STR_STRING = 'string';
const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_NUMBER = 'number';

const WRITE_COORDINATOR_DEFAULT = Object.freeze({
  MAX_RETRIES: 1,
});

const ERR_NO_PARTITION_FOR_KEY = 'No partition found for key: ';
const WRITE_EXHAUSTED_RETRIES_MSG =
  'Distributed write exhausted retries';
const DEFAULT_PRIMARY_KEY_COLUMN = 'id';
const HASH_ALGORITHM = 'sha1';
const DIGEST_ENCODING = 'hex';
const DIGEST_PREFIX_LENGTH = 16;
const OPERATION_ID_PREFIX = 'dwrite-';
const PROMISE_STATUS_FULFILLED = 'fulfilled';
const UNARY_MINUS = '-';
const UNARY_PLUS = '+';
const PARTICIPANT_ROLE_PRIMARY = 'primary';
const PARTICIPANT_ROLE_MIRROR = 'mirror';

/**
 * Canonical owner for distributed INSERT/UPDATE/DELETE execution.
 */
class DistributedWriteCoordinator {
  /**
   * @param {Object} options - Coordinator options.
   * @param {Object} options.partitionResolver - Partition resolver.
   * @param {Object} options.queryExecutor - Query executor.
   * @param {Function} options.getTablePartitions - Table partitions resolver.
   * @param {Function} options.getTableInfo - Table metadata resolver.
   * @param {number} [options.maxRetries] - Retry count per partition.
   */
  constructor(options = {}) {
    this.partitionResolver = options.partitionResolver || null;
    this.queryExecutor = options.queryExecutor || null;
    this.getTablePartitions = options.getTablePartitions || (() => []);
    this.getTableInfo = options.getTableInfo || (() => null);
    this.maxRetries = options.maxRetries ?? WRITE_COORDINATOR_DEFAULT.MAX_RETRIES;
    this.logger = this.initLogger();
  }

  /**
   * Initialize logger.
   * @return {Object} logger.
   * @private
   */
  initLogger() {
    try {
      const loggingService = LoggingService.getInstance();
      if (loggingService.isInitialized()) {
        return loggingService.forSubsystem(QUERY_SUBSYSTEM.SQL_QUERY_ENGINE);
      }
    } catch (logErr) {
      console.warn(QUERY_LOG_MSG.INIT_LOGGER_FAILED, logErr);
    }
    return console;
  }

  /**
   * Build a distributed write plan for INSERT/UPDATE/DELETE.
   * @param {Object} ast - Statement AST.
   * @param {Array} params - Bound parameters.
   * @param {Object} options - Plan options.
   * @return {Object} DistributedWritePlan.
   */
  createWritePlan(ast, params = [], options = {}) {
    const operationId = options.operationId || this.createOperationId(
      ast,
      params,
      options.sessionId || null,
    );
    const idempotencyKey = options.idempotencyKey || operationId;
    const partitionStatements = new Map();

    if (ast.type === QUERY_AST_TYPE.INSERT) {
      this.createInsertPartitionStatements(ast, params, partitionStatements);
    } else {
      const partitionIds = Array.isArray(options.partitionIds) ?
        options.partitionIds :
        [];
      for (const partitionId of partitionIds) {
        partitionStatements.set(partitionId, {
          ast: {...ast},
          role: PARTICIPANT_ROLE_PRIMARY,
          executionOptions: {},
        });
      }
    }

    return {
      operationId,
      statementType: ast.type,
      partitionStatements,
      returningSpec: ast.returning || null,
      idempotencyKey,
    };
  }

  /**
   * Append one mirror-only participant to an existing write plan.
   * Mirror participants affect success/failure but are excluded from
   * user-facing affected-row and RETURNING aggregation.
   * @param {Object} plan - Existing write plan.
   * @param {string} partitionId - Mirror partition ID.
   * @param {Object} ast - Statement AST.
   * @param {Object} executionOptions - Delivery options.
   * @return {Object} The mutated write plan.
   */
  addMirrorParticipant(plan, partitionId, ast, executionOptions = {}) {
    if (!plan || !partitionId || !ast) {
      return plan;
    }
    plan.partitionStatements.set(partitionId, {
      ast: {...ast},
      role: PARTICIPANT_ROLE_MIRROR,
      executionOptions: {...executionOptions},
    });
    return plan;
  }

  /**
   * Execute a distributed write plan and merge participant results.
   * @param {Object} plan - Distributed write plan.
   * @param {Array} params - Bound parameters.
   * @param {Object} [executionOptions] - Global execution options.
   * @return {Promise<Object>} Aggregated write result.
   */
  async executePlan(plan, params = [], executionOptions = {}) {
    const participantResults = [];
    const orderedPartitions = Array.from(
      plan.partitionStatements.keys(),
    ).sort();

    if (orderedPartitions.length === LOCAL_NUM_ONE) {
      const partitionId = orderedPartitions[0];
      const participant = plan.partitionStatements.get(partitionId);
      const result = await this.executePartitionStatement(
        plan.statementType,
        participant.ast,
        partitionId,
        params,
        {
          ...(executionOptions || {}),
          ...(participant.executionOptions || {}),
        },
      );
      participantResults.push({
        partitionId,
        role: participant.role || PARTICIPANT_ROLE_PRIMARY,
        ...result,
      });
    } else {
      const promises = orderedPartitions.map((partitionId) => {
        const participant = plan.partitionStatements.get(partitionId);
        return this.executePartitionStatement(
          plan.statementType,
          participant.ast,
          partitionId,
          params,
          {
            ...(executionOptions || {}),
            ...(participant.executionOptions || {}),
          },
        ).then((result) => ({
          partitionId,
          role: participant.role || PARTICIPANT_ROLE_PRIMARY,
          ...result,
        }));
      });
      const settled = await Promise.allSettled(promises);
      for (const outcome of settled) {
        if (outcome.status === PROMISE_STATUS_FULFILLED) {
          participantResults.push(outcome.value);
        } else {
          participantResults.push({
            partitionId: null,
            success: false,
            error: outcome.reason?.message ||
                QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE,
          });
        }
      }
      participantResults.sort((a, b) => {
        if (a.partitionId === null && b.partitionId === null) return LOCAL_NUM_ZERO;
        if (a.partitionId === null) return LOCAL_NUM_ONE;
        if (b.partitionId === null) return -LOCAL_NUM_ONE;
        return a.partitionId < b.partitionId ? -LOCAL_NUM_ONE :
          a.partitionId > b.partitionId ? LOCAL_NUM_ONE : LOCAL_NUM_ZERO;
      });
    }

    const failedParticipants = participantResults.filter(
      (result) => !result.success,
    );
    const primaryPartitions = participantResults
      .filter((result) => result.role !== PARTICIPANT_ROLE_MIRROR)
      .map((result) => result.partitionId)
      .filter(Boolean);
    const mirrorPartitions = participantResults
      .filter((result) => result.role === PARTICIPANT_ROLE_MIRROR)
      .map((result) => result.partitionId)
      .filter(Boolean);
    const rows = [];
    let affectedRows = LOCAL_NUM_ZERO;
    const retryCount = participantResults.reduce((sum, result) => {
      const attempts = Number.isInteger(result.attempts) ?
        result.attempts : 1;
      return sum + Math.max(attempts - 1, 0);
    }, 0);
    for (const result of participantResults) {
      if (!result.success) {
        continue;
      }
      if (result.role === PARTICIPANT_ROLE_MIRROR) {
        continue;
      }
      affectedRows += result.affectedRows || LOCAL_NUM_ZERO;
      if (Array.isArray(result.rows) && result.rows.length > LOCAL_NUM_ZERO) {
        rows.push(...result.rows);
      }
    }

    if (failedParticipants.length > LOCAL_NUM_ZERO) {
      const participantFailures = failedParticipants.map((result) => ({
        partitionId: result.partitionId,
        participantNodeId:
            typeof result.participantNodeId === 'string' ?
              result.participantNodeId :
              null,
        participantAddress:
            typeof result.participantAddress === 'string' ?
              result.participantAddress :
              null,
        errorCode:
            typeof result.errorCode === 'string' ?
              result.errorCode :
              null,
        error:
            result.error ||
            QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE,
        durationMs:
            Number.isFinite(result?.durationMs) ?
              Math.max(0, Math.floor(result.durationMs)) :
              null,
        retryAfterMs:
            Number.isFinite(result?.retryAfterMs) &&
            result.retryAfterMs > 0 ?
              Math.floor(result.retryAfterMs) :
              null,
        deferRetry: result?.deferRetry === true,
        backpressured: result?.backpressured === true,
        failedTable:
            typeof result.failedTable === 'string' ?
              result.failedTable :
              (typeof result.tableName === 'string' ?
                result.tableName :
                null),
      }));
      const firstFailedParticipant =
          participantFailures.length > 0 ?
            participantFailures[0] :
            null;
      const retryAfterMs = participantFailures.reduce(
        (maxRetryAfterMs, result) => {
          if (!Number.isFinite(result?.retryAfterMs) ||
                result.retryAfterMs <= 0) {
            return maxRetryAfterMs;
          }
          return Math.max(maxRetryAfterMs, result.retryAfterMs);
        },
        0,
      );
      return {
        success: false,
        operation: plan.statementType,
        affectedRows,
        rows,
        partitions: primaryPartitions,
        mirrorPartitions,
        failedPartitions: failedParticipants.map(
          (result) => result.partitionId,
        ),
        partitionErrors: failedParticipants.map((result) => ({
          partitionId: result.partitionId,
          error:
              result.error ||
              QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE,
          retryAfterMs:
              Number.isFinite(result?.retryAfterMs) &&
              result.retryAfterMs > LOCAL_NUM_ZERO ?
                Math.floor(result.retryAfterMs) :
                null,
        })),
        participantFailures,
        firstFailedParticipant,
        participantResults,
        errorCode: QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
        error: QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE,
        idempotencyKey: plan.idempotencyKey,
        operationId: plan.operationId,
        retryCount,
        retryAfterMs: retryAfterMs > LOCAL_NUM_ZERO ? retryAfterMs : null,
      };
    }

    return {
      success: true,
      operation: plan.statementType,
      affectedRows,
      rows,
      partitions: primaryPartitions,
      mirrorPartitions,
      participantResults,
      idempotencyKey: plan.idempotencyKey,
      operationId: plan.operationId,
      retryCount,
    };
  }

  /**
   * Execute one partition write with bounded retry.
   * @param {string} statementType - Statement type.
   * @param {Object} statementAst - Partition-scoped statement AST.
   * @param {string} partitionId - Target partition.
   * @param {Array} params - Bound parameters.
   * @return {Promise<Object>} Participant execution result.
   * @private
   */
  async executePartitionStatement(
    statementType,
    statementAst,
    partitionId,
    params,
    executionOptions = {},
  ) {
    for (let attempt = LOCAL_NUM_ZERO; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await this.executePartitionStatementOnce(
          statementType,
          statementAst,
          partitionId,
          params,
          executionOptions,
        );
        if (result.success !== false) {
          return {
            ...result,
            attempts: attempt + LOCAL_NUM_ONE,
          };
        }
        if (attempt >= this.maxRetries) {
          return {
            ...result,
            attempts: attempt + LOCAL_NUM_ONE,
          };
        }
      } catch (error) {
        if (attempt >= this.maxRetries) {
          return {
            success: false,
            error: error.message,
            errorCode:
              typeof error?.code === LOCAL_STR_STRING &&
              error.code.length > LOCAL_NUM_ZERO ?
                error.code :
                (typeof error?.errorCode === LOCAL_STR_STRING &&
                error.errorCode.length > LOCAL_NUM_ZERO ?
                  error.errorCode :
                  null),
            retryAfterMs:
              Number.isFinite(error?.retryAfterMs) &&
              error.retryAfterMs > LOCAL_NUM_ZERO ?
                Math.floor(error.retryAfterMs) :
                null,
            deferRetry: error?.deferRetry === true,
            participantNodeId:
              typeof error?.participantNodeId === LOCAL_STR_STRING ?
                error.participantNodeId :
                null,
            participantAddress:
              typeof error?.participantAddress === LOCAL_STR_STRING ?
                error.participantAddress :
                null,
            failedTable:
              typeof error?.failedTable === LOCAL_STR_STRING ?
                error.failedTable :
                (typeof error?.tableName === LOCAL_STR_STRING ?
                  error.tableName :
                  null),
            attempts: attempt + LOCAL_NUM_ONE,
          };
        }
      }
    }
    return {
      success: false,
      error: WRITE_EXHAUSTED_RETRIES_MSG,
      attempts: this.maxRetries + LOCAL_NUM_ONE,
    };
  }

  /**
   * Execute one partition write without retry.
   * @param {string} statementType - Statement type.
   * @param {Object} statementAst - Partition-scoped statement AST.
   * @param {string} partitionId - Target partition.
   * @param {Array} params - Bound parameters.
   * @return {Promise<Object>} Participant result.
   * @private
   */
  async executePartitionStatementOnce(
    statementType,
    statementAst,
    partitionId,
    params,
    executionOptions = {},
  ) {
    if (statementType === QUERY_AST_TYPE.INSERT) {
      return this.queryExecutor.executeInsert(
        statementAst,
        partitionId,
        params,
        executionOptions,
      );
    }
    if (statementType === QUERY_AST_TYPE.UPDATE) {
      return this.queryExecutor.executeUpdate(
        statementAst,
        [partitionId],
        params,
        executionOptions,
      );
    }
    return this.queryExecutor.executeDelete(
      statementAst,
      [partitionId],
      params,
      executionOptions,
    );
  }

  /**
   * Build INSERT partition statements grouped by partition key.
   * @param {Object} ast - INSERT AST.
   * @param {Array} params - Bound parameters.
   * @param {Map<string, Object>} partitionStatements - Output map.
   * @private
   */
  createInsertPartitionStatements(ast, params, partitionStatements) {
    const partitions = this.getTablePartitions(ast.table) || [];
    const tableInfo = this.getTableInfo(ast.table);
    const primaryKeyColumns = this.resolvePrimaryKeyColumns(tableInfo);
    const primaryKey = primaryKeyColumns[0];
    const keyIndex = this.findPrimaryKeyIndex(ast, primaryKey);

    for (const row of ast.values || []) {
      const keyValue = this.extractKeyValue(row[keyIndex], params);
      const partitionId = this.partitionResolver.resolvePartitionForKey(
        ast.table,
        keyValue,
        partitions,
      );
      if (!partitionId) {
        throw new Error(ERR_NO_PARTITION_FOR_KEY + keyValue);
      }
      if (!partitionStatements.has(partitionId)) {
        partitionStatements.set(partitionId, {
          ast: {
            ...ast,
            values: [],
          },
          role: PARTICIPANT_ROLE_PRIMARY,
          executionOptions: {},
        });
      }
      partitionStatements.get(partitionId).ast.values.push(row);
    }
  }

  /**
   * Resolve primary key columns from table metadata.
   * @param {Object|null} tableInfo - Table metadata.
   * @return {string[]} Key columns.
   * @private
   */
  resolvePrimaryKeyColumns(tableInfo) {
    const primaryKey = tableInfo?.primaryKey || tableInfo?.primary_key;
    if (Array.isArray(primaryKey) && primaryKey.length > LOCAL_NUM_ZERO) {
      return primaryKey;
    }
    if (typeof primaryKey === LOCAL_STR_STRING && primaryKey.length > LOCAL_NUM_ZERO) {
      return [primaryKey];
    }
    return [DEFAULT_PRIMARY_KEY_COLUMN];
  }

  /**
   * Find primary key column index in INSERT columns list.
   * @param {Object} ast - INSERT AST.
   * @param {string} primaryKey - Primary key column.
   * @return {number} Column index.
   * @private
   */
  findPrimaryKeyIndex(ast, primaryKey) {
    if (!Array.isArray(ast.columns) || ast.columns.length === LOCAL_NUM_ZERO) {
      return LOCAL_NUM_ZERO;
    }
    const index = ast.columns.findIndex(
      (columnName) => String(columnName).toLowerCase() ===
        String(primaryKey).toLowerCase(),
    );
    return index >= LOCAL_NUM_ZERO ? index : LOCAL_NUM_ZERO;
  }

  /**
   * Extract key value from INSERT row expression.
   * @param {Object} expr - Value expression.
   * @param {Array} params - Bound parameters.
   * @return {*} Key value.
   * @private
   */
  extractKeyValue(expr, params) {
    if (!expr || typeof expr !== LOCAL_STR_OBJECT) {
      return expr;
    }
    if (expr.type === QUERY_AST_NODE.LITERAL) {
      return expr.value;
    }
    if (expr.type === QUERY_AST_NODE.PARAMETER) {
      if (typeof expr.index === LOCAL_STR_NUMBER &&
          expr.index >= LOCAL_NUM_ZERO &&
          expr.index < params.length) {
        return params[expr.index];
      }
      return params[LOCAL_NUM_ZERO];
    }
    if (expr.type === QUERY_AST_NODE.UNARY) {
      const operand = this.extractKeyValue(expr.operand, params);
      if (expr.operator === UNARY_MINUS) {
        return -Number(operand);
      }
      if (expr.operator === UNARY_PLUS) {
        return Number(operand);
      }
      return operand;
    }
    return expr.value;
  }

  /**
   * Create a deterministic operation identifier.
   * @param {Object} ast - Write AST.
   * @param {Array} params - Bound parameters.
   * @param {string|null} sessionId - Session identifier.
   * @return {string} Operation identifier.
   * @private
   */
  createOperationId(ast, params, sessionId) {
    const payload = JSON.stringify({
      ast,
      paramsCount: params.length,
      sessionId: sessionId || null,
    });
    const digest = createHash(HASH_ALGORITHM)
      .update(payload)
      .digest(DIGEST_ENCODING)
      .slice(0, DIGEST_PREFIX_LENGTH);
    return `${OPERATION_ID_PREFIX}${digest}`;
  }
}

export {DistributedWriteCoordinator};
