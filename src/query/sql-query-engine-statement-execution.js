import {resolveClientStatementRefusal} from './sql-statement-ingress.js';
import {SQL_QUERY_ENGINE_SHARED} from './sql-query-engine-shared.js';
import {
  SQLQueryEngineServiceLifecycleExecution,
} from './sql-query-engine-service-lifecycle-execution.js';
import {RUNTIME_ACCESS_POLICY_DECISION} from
  '../control-plane/owners/runtime-access-policy-owner.js';
import {
  enforceApplicationDatabaseExplainPolicy,
} from './application-database-statement-policy.js';
import {
  STATEMENT_ADMISSION,
  admitParsedStatement,
  withSessionTransactionState,
} from './sql-query-engine-statement-admission.js';
import {
  readAffectedRowCount,
  withExecutedStatementType,
} from './application-database-result.js';

const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_STRING = 'string';
const LOCAL_STR_WRITE_ACTIVITY = 'write_activity';
const LOCAL_NUM_ONE_HUNDRED = 100;
const LOCAL_STR_QUERY_ADMISSION_DEFERRED = 'query_admission_deferred';
const LOCAL_STR_QUERY_ADMISSION_REJECTED = 'query_admission_rejected';
const LOCAL_STR_MAXIMUM_CALL_STACK_SIZE_EXCEEDED = 'Maximum call stack size exceeded';
const LOCAL_STR_QUERY_PLANE_WRITE = 'query-plane:write';
const LOCAL_STR_QUERY_PLANE_READ = 'query-plane:read';
const LOCAL_STR_UNKNOWN = 'unknown';

const {
  EXPLAIN_DISTRIBUTED_PREFIX_REGEX,
  METRICS_LOG_TAG,
  PRESSURE_GOVERNOR_ACTION,
  PRESSURE_WORK_CLASS,
  PressureGovernor,
  QUERY_AST_TYPE,
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_LOG_MSG,
  QUERY_OPERATION,
  QUERY_SESSION,
  SQLParser,
  WRITE_ACTIVITY_SPLIT_EVALUATION_MIN_INTERVAL_MS,
  buildPressureAdmissionFailure,
  reorderParams,
} = SQL_QUERY_ENGINE_SHARED;

// Typed parser refusals (statement count, unsupported statement form,
// malformed transaction control) keep their own code; every other parse
// failure is a syntax error.
const TYPED_PARSE_FAILURE_CODES = new Set([
  QUERY_ERROR_CODE.EMPTY_STATEMENT,
  QUERY_ERROR_CODE.MULTIPLE_STATEMENTS_UNSUPPORTED,
  QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE,
  QUERY_ERROR_CODE.TRANSACTION_CONTROL_SYNTAX_ERROR,
]);

function resolveParseFailureCode(parseError) {
  return TYPED_PARSE_FAILURE_CODES.has(parseError?.code) ?
    parseError.code :
    QUERY_ERROR_CODE.SYNTAX_ERROR;
}

const COUNTED_WRITE_TYPES = new Set([
  QUERY_AST_TYPE.INSERT,
  QUERY_AST_TYPE.UPDATE,
  QUERY_AST_TYPE.DELETE,
]);

const PRESSURE_WRITE_AST_TYPES = new Set([
  QUERY_AST_TYPE.INSERT,
  QUERY_AST_TYPE.UPDATE,
  QUERY_AST_TYPE.DELETE,
  QUERY_AST_TYPE.CREATE_TABLE,
  QUERY_AST_TYPE.ALTER_TABLE,
]);

/**
 * The row count the query-lifecycle metric records: a write's
 * engine-reported affected-row count (null when it has none; never logged as
 * zero rows), else the number of rows returned.
 * @param {Object} result - SqlCore result.
 * @param {string} statementType - The executed statement kind.
 * @return {?number}
 */
function resolveLoggedRowCount(result, statementType) {
  if (COUNTED_WRITE_TYPES.has(statementType)) {
    return readAffectedRowCount(result);
  }
  return Array.isArray(result?.rows) ? result.rows.length : null;
}

class SQLQueryEngineStatementExecution extends
  SQLQueryEngineServiceLifecycleExecution {
  /**
   * Track write activity for managed split diagnostics and request local
   * evaluation only for partitions this node actually owns.
   *
   * Leader-local partition services are the authoritative trigger source for
   * write-driven split evaluation. The SQL coordinator only keeps lightweight
   * diagnostics here and may opportunistically request evaluation when it also
   * owns one of the target partitions.
   *
   * @param {string} tableName - Target table name.
   * @param {Object} writePlan - Distributed write plan.
   * @param {Object} writeResult - Distributed write execution result.
   * @private
   */
  requestManagedSplitEvaluationForWrite(tableName, writePlan, writeResult) {
    const manager = this.partitionSplitMergeManager;
    if (
      !manager ||
      typeof manager.requestEvaluation !== LOCAL_STR_FUNCTION ||
      !tableName ||
      this.isSystemTable(tableName) ||
      writeResult?.success !== true
    ) {
      return;
    }

    const nowMs = Date.now();
    const lastEvaluationState =
      this.lastWriteSplitEvaluationByTable.get(tableName) || null;
    const lastRequestedAtMs =
      typeof lastEvaluationState === 'number' ?
        lastEvaluationState :
        Number(lastEvaluationState?.requestedAtMs || 0);
    if (
      nowMs - lastRequestedAtMs <
      WRITE_ACTIVITY_SPLIT_EVALUATION_MIN_INTERVAL_MS
    ) {
      return;
    }

    const partitionIds =
      writePlan?.partitionStatements instanceof Map ?
        Array.from(writePlan.partitionStatements.keys()) :
        [];
    const localLeaderPartitionIds =
      this.resolveLocalManagedSplitEvaluationPartitionIds(partitionIds);
    this.lastWriteSplitEvaluationByTable.set(tableName, {
      requestedAtMs: nowMs,
      partitionIds,
      localLeaderPartitionIds,
    });

    if (localLeaderPartitionIds.length === 0) {
      return;
    }

    manager.requestEvaluation({
      reasonCode: LOCAL_STR_WRITE_ACTIVITY,
      tableName,
      partitionIds: localLeaderPartitionIds,
    });
  }

  /**
   * Resolve the subset of requested partitions this node may evaluate for
   * managed split ownership.
   * @param {string[]} partitionIds
   * @return {string[]}
   * @private
   */
  resolveLocalManagedSplitEvaluationPartitionIds(partitionIds = []) {
    const requestedPartitionIdSet = new Set(
      partitionIds
        .map((partitionId) => String(partitionId || ''))
        .filter(Boolean),
    );
    if (requestedPartitionIdSet.size === 0) {
      return [];
    }

    const localPartitionIds = [];
    for (const partition of this.listManagedSplitPartitions()) {
      const partitionId =
        partition?.partition_id ?? partition?.partitionId ?? null;
      if (!partitionId || !requestedPartitionIdSet.has(partitionId)) {
        continue;
      }
      localPartitionIds.push(partitionId);
    }
    return localPartitionIds;
  }

  /**
   * Execute a SQL query.
   * @param {string} sql - SQL query string.
   * @param {Array} params - Query parameters.
   * @param {Object} options - Execution options.
   * @param {string} options.sessionId - Session ID for transaction tracking.
   * @return {Promise<Object>} Query result.
   */
  async executeQuery(sql, params = [], options = {}) {
    const sessionId = options.sessionId || QUERY_SESSION.DEFAULT;
    const cancellationToken = options?.cancellationToken || null;
    cancellationToken?.throwIfCancelled?.();
    this.recoverDistributedTransactionStateFromCache();
    if (EXPLAIN_DISTRIBUTED_PREFIX_REGEX.test(sql)) {
      const explainDecision = enforceApplicationDatabaseExplainPolicy(options);
      if (explainDecision.allowed !== true) return explainDecision.failure;
      return this.executeExplainDistributed(sql, params, {
        sessionId,
        dialect: options.dialect,
      });
    }

    this.logger.debug(QUERY_LOG_MSG.EXECUTING_SQL_QUERY, {
      sql: sql.substring(0, LOCAL_NUM_ONE_HUNDRED),
      paramCount: params.length,
      sessionId,
    });

    const queryStartMs = Date.now();

    // Parse the SQL (check cache first)
    let ast;
    try {
      const dialect = options.dialect;
      ast = this.parseCache.get(sql, dialect);
      if (!ast) {
        const parser = new SQLParser(sql, {dialect});
        ast = parser.parse();
        this.parseCache.set(sql, dialect, ast);
        ast = this.parseCache.cloneAst(ast);
      }
      // If PG mode produced param mapping, reorder params
      if (ast._paramMapping && ast._paramMapping.length > 0) {
        params = reorderParams(params, ast._paramMapping);
      }
    } catch (parseError) {
      this.logger.error(QUERY_LOG_MSG.QUERY_EXECUTION_FAILED, {
        sql: sql.substring(0, LOCAL_NUM_ONE_HUNDRED),
        error: parseError.message,
      });
      return {
        success: false,
        error: parseError.message,
        errorCode: resolveParseFailureCode(parseError),
      };
    }

    const parseEndMs = Date.now();
    cancellationToken?.throwIfCancelled?.();

    const clientStatementRefusal = resolveClientStatementRefusal(ast,
      options);
    if (clientStatementRefusal !== null) {
      return clientStatementRefusal;
    }
    const admission = admitParsedStatement(this.transactionCoordinator,
      sessionId, ast, options.expectedTransactionId);
    if (admission.state === STATEMENT_ADMISSION.REFUSED) {
      return admission.failure;
    }

    try {
      const accessFailure = await this.authorizeRuntimeServiceStatement(
        ast,
        options,
      );
      if (accessFailure) return accessFailure;
      const ingressPressureDecision = this.evaluateQueryIngressPressure(
        ast,
        options,
      );
      if (
        ingressPressureDecision &&
        (ingressPressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEFER ||
          ingressPressureDecision.action === PRESSURE_GOVERNOR_ACTION.REJECT)
      ) {
        this.logger.warn(
          ingressPressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEFER ?
            QUERY_LOG_MSG.QUERY_ADMISSION_DEFERRED :
            QUERY_LOG_MSG.QUERY_ADMISSION_REJECTED,
          {
            statementType: ast.type,
            pressureAction: ingressPressureDecision.action,
            pressureReason: ingressPressureDecision.reason,
            retryAfterMs: ingressPressureDecision.retryAfterMs,
            workClass: options?.workClass || PRESSURE_WORK_CLASS.INTERACTIVE,
          },
        );
        return buildPressureAdmissionFailure(ingressPressureDecision, {
          error:
            ingressPressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEFER ?
              LOCAL_STR_QUERY_ADMISSION_DEFERRED :
              LOCAL_STR_QUERY_ADMISSION_REJECTED,
          errorCode: QUERY_ERROR_CODE.INTERNAL_ERROR,
        });
      }

      // Route based on statement type
      let result;
      switch (ast.type) {
      case QUERY_AST_TYPE.SELECT:
        result = await this.executeSelect(
          ast,
          params,
          sessionId,
          options,
          sql,
        );
        break;

      case QUERY_AST_TYPE.INSERT:
        result = await this.executeInsert(ast, params, sessionId, options);
        break;

      case QUERY_AST_TYPE.UPDATE:
        result = await this.executeUpdate(ast, params, sessionId, options);
        break;

      case QUERY_AST_TYPE.DELETE:
        result = await this.executeDelete(ast, params, sessionId, options);
        break;

      case QUERY_AST_TYPE.CREATE_TABLE:
        result = await this.executeCreateTable(ast, sessionId, options);
        break;

      case QUERY_AST_TYPE.ALTER_TABLE:
        result = await this.executeAlterTable(ast, sessionId);
        break;

      case QUERY_AST_TYPE.BEGIN_TRANSACTION:
        return withExecutedStatementType(
          await this.handleAdmittedBegin(sessionId, options),
          ast.type,
        );

      case QUERY_AST_TYPE.COMMIT:
      case QUERY_AST_TYPE.ROLLBACK:
        return withExecutedStatementType(withSessionTransactionState(
          ast.type === QUERY_AST_TYPE.COMMIT ?
            await this.handleCommit(sessionId, options) :
            await this.handleRollback(sessionId, options),
          this.transactionCoordinator,
          sessionId,
        ), ast.type);

      default:
        throw new Error(
          `${QUERY_ERROR_MSG.UNSUPPORTED_STATEMENT_PREFIX}${ast.type}`,
        );
      }

      const queryEndMs = Date.now();
      try {
        this.logger.info(METRICS_LOG_TAG.QUERY_LIFECYCLE, {
          sessionId,
          statementType: ast.type,
          parseDurationMs: parseEndMs - queryStartMs,
          executionDurationMs: queryEndMs - parseEndMs,
          totalDurationMs: queryEndMs - queryStartMs,
          partitionCount: result?.partitions?.length ?? 0,
          rowCount: resolveLoggedRowCount(result, ast.type),
          success: result?.success ?? false,
        });
      } catch (_metricsErr) {
        // Metrics logging must not propagate to callers
      }

      // Strip partition details from results (Requirement 20.10)
      return withExecutedStatementType(
        this.tableCreationService.stripPartitionDetails(result),
        ast.type,
      );
    } catch (error) {
      const queryEndMs = Date.now();
      try {
        this.logger.info(METRICS_LOG_TAG.QUERY_LIFECYCLE, {
          sessionId,
          statementType: ast.type,
          parseDurationMs: parseEndMs - queryStartMs,
          executionDurationMs: queryEndMs - parseEndMs,
          totalDurationMs: queryEndMs - queryStartMs,
          partitionCount: 0,
          rowCount: 0,
          success: false,
        });
      } catch (_metricsErr) {
        // Metrics logging must not propagate to callers
      }

      const failureResult = this.buildCaughtQueryExecutionFailure(error);
      this.logger.error(QUERY_LOG_MSG.QUERY_EXECUTION_FAILED, {
        sql: sql.substring(0, LOCAL_NUM_ONE_HUNDRED),
        error: failureResult.error,
        errorCode: failureResult.errorCode || null,
        retryAfterMs: Number.isFinite(failureResult.retryAfterMs) ?
          failureResult.retryAfterMs :
          null,
        deferRetry: failureResult.deferRetry === true,
        stack: String(failureResult.error || '').includes(
          LOCAL_STR_MAXIMUM_CALL_STACK_SIZE_EXCEEDED,
        ) ?
          error?.stack || null :
          null,
      });
      return failureResult;
    }
  }

  async authorizeRuntimeServiceStatement(ast, options = {}) {
    const issuingServiceId = options?.issuingServiceId;
    if (typeof issuingServiceId !== LOCAL_STR_STRING ||
        issuingServiceId.length === 0) {
      return null;
    }
    const owner = this.runtimeAccessPolicyOwner;
    if (!owner || typeof owner.authorizeStatement !== LOCAL_STR_FUNCTION) {
      return {
        success: false,
        error: QUERY_ERROR_MSG.RUNTIME_ACCESS_DENIED,
        errorCode: QUERY_ERROR_CODE.RUNTIME_ACCESS_DENIED,
        reasonCode: 'policy_owner_unavailable',
      };
    }
    const decision = await owner.authorizeStatement(issuingServiceId, ast);
    if (decision.decision === RUNTIME_ACCESS_POLICY_DECISION.ALLOWED) {
      return null;
    }
    return {
      success: false,
      error: QUERY_ERROR_MSG.RUNTIME_ACCESS_DENIED,
      errorCode: QUERY_ERROR_CODE.RUNTIME_ACCESS_DENIED,
      reasonCode: decision.reason,
      ...(decision.access ? {access: decision.access} : {}),
    };
  }

  evaluateQueryIngressPressure(ast, options = {}) {
    const astType = ast?.type || null;
    const writeStatement = PRESSURE_WRITE_AST_TYPES.has(astType);
    const statementKey = String(astType || LOCAL_STR_UNKNOWN).toLowerCase();
    return this.getPressureGovernor().evaluate({
      workClass: options?.workClass || PRESSURE_WORK_CLASS.INTERACTIVE,
      resourceKeys: [
        writeStatement ? LOCAL_STR_QUERY_PLANE_WRITE : LOCAL_STR_QUERY_PLANE_READ,
        `query-plane:statement:${statementKey}`,
      ],
    });
  }

  getPressureGovernor() {
    this.pressureGovernor =
      this.pressureGovernor ||
      PressureGovernor.getShared({
        nodeId: this.nodeId,
        messageRouter: this.messageRouter,
        logger: this.logger,
      });
    this.pressureGovernor.configure({
      nodeId: this.nodeId,
      messageRouter: this.messageRouter,
      logger: this.logger,
    });
    return this.pressureGovernor;
  }

  /**
   * Execute EXPLAIN DISTRIBUTED and return canonical planner output.
   * @param {string} sql - EXPLAIN DISTRIBUTED statement.
   * @param {Array} params - Bound parameters.
   * @param {Object} options - Explain options.
   * @param {string} options.sessionId - Session ID.
   * @param {string} options.dialect - SQL dialect.
   * @return {Promise<Object>} Explain result.
   * @private
   */
  async executeExplainDistributed(sql, params = [], options = {}) {
    const statement = sql.replace(EXPLAIN_DISTRIBUTED_PREFIX_REGEX, '');
    if (!statement.trim()) {
      return {
        success: false,
        error: QUERY_ERROR_MSG.EXPLAIN_DISTRIBUTED_REQUIRES_STATEMENT,
        errorCode: QUERY_ERROR_CODE.SYNTAX_ERROR,
      };
    }

    let ast;
    let normalizedParams = params;
    try {
      const parser = new SQLParser(statement, {dialect: options.dialect});
      ast = parser.parse();
      if (ast._paramMapping && ast._paramMapping.length > 0) {
        normalizedParams = reorderParams(params, ast._paramMapping);
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
        errorCode: resolveParseFailureCode(error),
      };
    }

    const distributedPlan = this.distributedQueryPlanner.planStatement(
      ast,
      normalizedParams,
      {
        sessionId: options.sessionId || QUERY_SESSION.DEFAULT,
        explain: true,
      },
    );
    if (!distributedPlan) {
      return {
        success: false,
        error: `${QUERY_ERROR_MSG.UNSUPPORTED_STATEMENT_PREFIX}${ast.type}`,
        errorCode: QUERY_ERROR_CODE.INTERNAL_ERROR,
      };
    }

    return withExecutedStatementType({
      success: true,
      operation: QUERY_OPERATION.EXPLAIN_DISTRIBUTED,
      rows: [
        {
          plan_id: distributedPlan.planId,
          statement_type: distributedPlan.statementType,
          execution_policy: distributedPlan.executionPolicy,
          table_plans: Array.from(distributedPlan.tablePlans.values()),
          join_plan: distributedPlan.joinPlan,
          merge_plan: distributedPlan.mergePlan,
          diagnostics: distributedPlan.diagnostics,
        },
      ],
      distributedPlan,
      distributedDiagnostics: distributedPlan.diagnostics,
    }, QUERY_OPERATION.EXPLAIN_DISTRIBUTED);
  }

  /**
   * Execute a CREATE TABLE statement.
   * Requirements: 20.1, 20.2, 20.3
   * @param {Object} ast - Parsed CREATE TABLE AST.
   * @param {string} _sessionId - Session ID (unused for DDL).
   * @return {Promise<Object>} Creation result.
   * @private
   */
  async executeCreateTable(ast, _sessionId, options = {}) {
    return this.tableCreationService.createTable(ast, {
      namespace: options?.tenantId,
      timeoutBudget: options?.timeoutBudget,
      cancellationToken: options?.cancellationToken || null,
    });
  }

  /**
   * Execute an ALTER TABLE statement through the migration pipeline.
   * @param {Object} ast - Parsed ALTER TABLE AST.
   * @param {string} sessionId - Session ID.
   * @return {Promise<Object>} Migration initiation result.
   * @private
   */
  async executeAlterTable(ast, sessionId) {
    if (
      !this.migrationPipeline ||
      typeof this.migrationPipeline.handleAlterTable !== LOCAL_STR_FUNCTION
    ) {
      throw new Error(QUERY_ERROR_MSG.MIGRATION_PIPELINE_UNAVAILABLE);
    }
    return this.migrationPipeline.handleAlterTable(ast, sessionId);
  }

  /**
   * Provision initial routable replica for a newly-created table partition.
   * @param {Object} context - Table partition context.
   * @param {string} context.tableId - Table ID.
   * @param {Object} [context.tableMetadata] - Canonical table row snapshot.
   * @param {string} context.partitionId - Partition ID.
   * @param {Object} [context.partitionMetadata] - Canonical partition row
   *   snapshot.
   * @param {number} [context.minimumRoutableReplicaCount] - Minimum ready
   *   replica cohort required before provisioning can continue.
   * @param {string[]} [context.targetNodeIds] - Explicit provisioning target
   *   nodes for split child bootstrapping.
   * @param {Object} [context.admissionConvergence] - Optional previously
   *   probed admission result to reuse for explicit target cohorts.
   * @param {string} [context.routingReadinessDimension] - Optional routing
   *   readiness dimension used while waiting for bootstrap quorum visibility.
   * @return {Promise<void>}
   * @private
   */
}

export {SQLQueryEngineStatementExecution};
