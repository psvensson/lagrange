/**
 * Canonical SqlRequest execution-mode dispatch.
 */

import {META_SERVICE_ID} from '../constants/wasm-meta.js';
import {isSystemTableName} from
  '../bootstrap/system-table-schema-shared-constants.js';
import {SQL_QUERY_ENGINE_SHARED} from './sql-query-engine-shared.js';
import {SQLQueryEngineLifecycleAndCallbackDispatch} from
  './sql-query-engine-lifecycle-and-callback-dispatch.js';
import {SERVICE_LIFECYCLE_EXECUTION_DISPOSITION} from
  './service-lifecycle-sql-contract.js';
import {classifyTransactionControlStatement} from
  './sql-transaction-control-grammar.js';
import {
  CLIENT_STATEMENT_INGRESS,
  resolveClientStatementRefusal,
} from './sql-statement-ingress.js';
import {
  STATEMENT_ADMISSION,
  TRANSACTION_END_TYPES,
  admitExpectedTransaction,
  admitParsedStatement,
} from './sql-query-engine-statement-admission.js';

const STATEMENT_LOG_LIMIT = 100;
const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_STRING = 'string';

const {
  ADAPTER_ERROR_MSG,
  ADAPTER_LOG_MSG,
  BudgetEnforcer,
  CancellationToken,
  DEFAULT_SNAPSHOT_MODE,
  EXECUTION_MODE,
  ExecutionContext,
  LineageTracker,
  METRICS_LOG_TAG,
  QUERY_AST_TYPE,
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_SESSION,
  SQLParser,
  executePlan,
  executeStage,
  isSqlRequest,
} = SQL_QUERY_ENGINE_SHARED;

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

/**
 * Admit a statement a session sent for an explicit transaction only while
 * the engine holds it; the statements that end a block (COMMIT, ROLLBACK)
 * answer for a missing transaction themselves.
 * @param {Object} transactionCoordinator - The engine's coordinator.
 * @param {Object} sqlRequest - Canonical SqlRequest.
 * @return {{state: string, failure?: Object}} STATEMENT_ADMISSION decision.
 */
function admitRequestTransaction(transactionCoordinator, sqlRequest) {
  const endsBlock = TRANSACTION_END_TYPES.has(
    classifyTransactionControlStatement(sqlRequest.statement));
  return admitExpectedTransaction(transactionCoordinator,
    sqlRequest.sessionId,
    endsBlock ? null : sqlRequest.expectedTransactionId);
}

function expectedTransactionOption(sqlRequest) {
  return sqlRequest.expectedTransactionId ?
    {expectedTransactionId: sqlRequest.expectedTransactionId} :
    {};
}

function resolveIssuingServiceId(sqlRequest, executionOptions = {}) {
  const issuingServiceId =
    executionOptions?.issuingServiceId ||
    sqlRequest?.issuingServiceId ||
    null;
  if (typeof issuingServiceId !== 'string' || issuingServiceId.length === 0) {
    return null;
  }

  // The built-in PostgreSQL runtime is an authenticated ingress transport,
  // not the application principal for client SQL. Once PostgresWireAdapter has
  // attached an authenticated securityContext to the canonical SqlRequest,
  // that session identity owns authorization. Keeping sys-postgres-wire as the
  // issuing service here would incorrectly run every external statement
  // through runtime-service table-access policy.
  if (
    issuingServiceId === META_SERVICE_ID.POSTGRES_WIRE &&
    sqlRequest?.securityContext
  ) {
    return null;
  }

  return issuingServiceId;
}

function buildClientRequestQueryOptions(sqlRequest, executionOptions = {}) {
  const issuingServiceId = resolveIssuingServiceId(
    sqlRequest,
    executionOptions,
  );
  const securityContext =
    sqlRequest?.securityContext || executionOptions?.securityContext || null;
  return {
    // Every SqlRequest statement is client SQL: its origin is set
    // here, by the engine's client entry, never by the caller.
    [CLIENT_STATEMENT_INGRESS]: true,
    sessionId: sqlRequest.sessionId || QUERY_SESSION.DEFAULT,
    tenantId: sqlRequest.tenantId,
    dialect: sqlRequest.dialect,
    timeoutMs: sqlRequest.timeoutMs,
    timeoutBudget: sqlRequest.timeoutBudget,
    cancellationToken: sqlRequest.cancellationToken || null,
    budgets: sqlRequest.budgets,
    ...expectedTransactionOption(sqlRequest),
    ...(issuingServiceId ? {issuingServiceId} : {}),
    ...(securityContext ? {securityContext} : {}),
  };
}

class SQLQueryEngineRequestDispatch extends
  SQLQueryEngineLifecycleAndCallbackDispatch {
  suppressedMetricFailureCount = 0;

  createRequestExecutionContext(
    sqlRequest,
    executionOptions = {},
    refusedResults = [],
  ) {
    const sessionId = sqlRequest.sessionId || QUERY_SESSION.DEFAULT;
    const queryOptions = buildClientRequestQueryOptions(
      sqlRequest,
      executionOptions,
    );
    const clientQueryExecutor = async (query, params) => {
      const result = await this.executeQuery(query, params, queryOptions);
      if (result?.success === false) {
        refusedResults.push(result);
      }
      return result;
    };
    const recordNestedCallRefusal = (query) => {
      if (typeof query !== LOCAL_STR_STRING || query.trim().length === 0) {
        return;
      }
      try {
        const parser = new SQLParser(query, {dialect: queryOptions.dialect});
        const ast = parser.parse();
        const refusal = resolveClientStatementRefusal(ast, queryOptions);
        if (refusal !== null) {
          refusedResults.push(refusal);
        }
      } catch (parseError) {
        void parseError;
      }
    };

    const executionContext = sqlRequest.executionContext ||
      new ExecutionContext({
        session: sessionId,
        snapshot: sqlRequest.snapshot || {mode: DEFAULT_SNAPSHOT_MODE},
        budgetEnforcer:
          sqlRequest.budgetEnforcer ||
          new BudgetEnforcer(sqlRequest.budgets || {}),
        cancellationToken:
          sqlRequest.cancellationToken || new CancellationToken(),
        lineageTracker:
          sqlRequest.lineageTracker ||
          new LineageTracker(`${sessionId}-${Date.now()}`),
        queryExecutor: clientQueryExecutor,
        resultStream: sqlRequest.resultStream,
        exchangeManager: sqlRequest.exchangeManager,
        dedupeRegistry: sqlRequest.dedupeRegistry,
        planDiagnostics: sqlRequest.planDiagnostics || null,
      });

    executionContext._queryExecutor = clientQueryExecutor;
    const baseCall = ExecutionContext.prototype.call.bind(executionContext);
    executionContext.call = (query, params, handler, opts) => {
      recordNestedCallRefusal(query);
      return baseCall(query, params, handler, opts);
    };
    return executionContext;
  }

  async executeStageRequest(sqlRequest, executionOptions = {}) {
    if (typeof sqlRequest.handler !== LOCAL_STR_FUNCTION) {
      throw new Error(ADAPTER_ERROR_MSG.STAGE_HANDLER_REQUIRED);
    }

    const refusedResults = [];
    const executionContext = this.createRequestExecutionContext(
      sqlRequest,
      executionOptions,
      refusedResults,
    );
    const cancellationToken =
      sqlRequest.cancellationToken || executionContext.getCancellationToken();
    const stageOptions = sqlRequest.options || null;
    const stageResults = await executeStage({
      query: sqlRequest.statement,
      params: sqlRequest.parameters,
      handler: sqlRequest.handler,
      opts: stageOptions,
      queryExecutor: executionContext._queryExecutor,
      cancellationToken,
      executionContext,
    });
    if (refusedResults.length > 0) {
      return refusedResults[0];
    }

    return {
      success: true,
      executionMode: EXECUTION_MODE.STAGE,
      results: stageResults,
    };
  }

  async checkPlanRequestStatement(sqlRequest, queryOptions) {
    const statement = typeof sqlRequest?.statement === LOCAL_STR_STRING ?
      sqlRequest.statement.trim() : '';
    if (!statement) {
      return {allowed: true};
    }
    let ast;
    try {
      const parser = new SQLParser(statement, {dialect: queryOptions.dialect});
      ast = parser.parse();
    } catch (parseError) {
      return {
        allowed: false,
        refusal: {
          success: false,
          error: parseError.message,
          errorCode: resolveParseFailureCode(parseError),
        },
      };
    }
    const clientRefusal = resolveClientStatementRefusal(ast, queryOptions);
    if (clientRefusal !== null) {
      return {allowed: false, refusal: clientRefusal};
    }
    if (ast.type === QUERY_AST_TYPE.CREATE_TABLE &&
        isSystemTableName(ast.tableName ?? ast.table)) {
      return {
        allowed: false,
        refusal: {
          success: false,
          error: QUERY_ERROR_MSG.SYSTEM_TABLE_NAME_RESERVED,
          errorCode: QUERY_ERROR_CODE.SYSTEM_TABLE_NAME_RESERVED,
        },
      };
    }
    const admission = admitParsedStatement(
      this.transactionCoordinator,
      queryOptions.sessionId,
      ast,
      queryOptions.expectedTransactionId,
    );
    if (admission.state === STATEMENT_ADMISSION.REFUSED) {
      return {allowed: false, refusal: admission.failure};
    }
    const accessFailure = await this.authorizeRuntimeServiceStatement(
      ast,
      queryOptions,
    );
    return accessFailure ? {allowed: false, refusal: accessFailure} : {allowed: true};
  }

  async executePlanRequest(sqlRequest, executionOptions = {}) {
    const plan = sqlRequest.plan || sqlRequest.hints?.plan || null;
    if (!plan || typeof plan !== LOCAL_STR_OBJECT) {
      throw new Error(ADAPTER_ERROR_MSG.PLAN_OBJECT_REQUIRED);
    }

    const queryOptions = buildClientRequestQueryOptions(
      sqlRequest,
      executionOptions,
    );
    const statementCheck = await this.checkPlanRequestStatement(
      sqlRequest,
      queryOptions,
    );
    if (!statementCheck.allowed) {
      return statementCheck.refusal;
    }
    const refusedResults = [];
    const executionContext = this.createRequestExecutionContext(
      sqlRequest,
      executionOptions,
      refusedResults,
    );
    const cancellationToken =
      sqlRequest.cancellationToken || executionContext.getCancellationToken();
    const planOptions = sqlRequest.options || null;
    const planResult = await executePlan({
      plan,
      params: sqlRequest.parameters,
      handler: sqlRequest.handler,
      opts: planOptions,
      queryExecutor: executionContext._queryExecutor,
      cancellationToken,
      executionContext,
    });
    if (refusedResults.length > 0) {
      return refusedResults[0];
    }

    return {
      success: true,
      executionMode: EXECUTION_MODE.PLAN,
      result: planResult,
    };
  }

  async executeRequest(sqlRequest, executionOptions = {}) {
    if (!isSqlRequest(sqlRequest)) {
      throw new Error(ADAPTER_ERROR_MSG.INVALID_SQL_REQUEST);
    }

    const {executionMode, statement, sessionId} = sqlRequest;
    this.logger.debug(ADAPTER_LOG_MSG.EXECUTE_REQUEST_START, {
      executionMode,
      statement: statement.substring(0, STATEMENT_LOG_LIMIT),
      sessionId,
    });

    const dispatchStartMs = Date.now();
    try {
      const result = await this.dispatchSqlRequest(
        sqlRequest,
        executionOptions,
      );
      this.logger.debug(ADAPTER_LOG_MSG.EXECUTE_REQUEST_COMPLETE, {
        executionMode,
        success: result.success,
      });
      this.recordRequestDispatchMetric(
        executionMode, dispatchStartMs, result?.success ?? false, sessionId,
      );
      return result;
    } catch (error) {
      this.recordRequestDispatchMetric(
        executionMode, dispatchStartMs, false, sessionId,
      );
      this.logger.error(ADAPTER_LOG_MSG.EXECUTE_REQUEST_FAILED, {
        executionMode,
        error: error.message,
      });
      throw error;
    }
  }

  async dispatchSqlRequest(sqlRequest, executionOptions = {}) {
    switch (sqlRequest.executionMode) {
    case EXECUTION_MODE.SQL_STATEMENT: {
      const admission = admitRequestTransaction(
        this.transactionCoordinator, sqlRequest);
      if (admission.state === STATEMENT_ADMISSION.REFUSED) {
        return admission.failure;
      }
      const lifecycleExecution = await this.tryExecuteServiceLifecycleSql(
        sqlRequest.statement,
        sqlRequest.parameters,
        {
          sessionId: sqlRequest.sessionId,
          ...(sqlRequest.securityContext ?
            {securityContext: sqlRequest.securityContext} : {}),
        },
      );
      if (lifecycleExecution.disposition ===
          SERVICE_LIFECYCLE_EXECUTION_DISPOSITION.HANDLED) {
        return lifecycleExecution.result;
      }
      return this.executeQuery(
        sqlRequest.statement,
        sqlRequest.parameters,
        buildClientRequestQueryOptions(sqlRequest, executionOptions),
      );
    }
    case EXECUTION_MODE.STAGE:
      return this.executeStageRequest(sqlRequest, executionOptions);
    case EXECUTION_MODE.PLAN:
      return this.executePlanRequest(sqlRequest, executionOptions);
    default:
      throw new Error(
        `${ADAPTER_ERROR_MSG.UNSUPPORTED_EXECUTION_MODE}` +
          `${sqlRequest.executionMode}`,
      );
    }
  }

  recordRequestDispatchMetric(
    executionMode, dispatchStartMs, success, sessionId,
  ) {
    try {
      this.logger.info(METRICS_LOG_TAG.QUERY_DISPATCH, {
        executionMode,
        totalDurationMs: Date.now() - dispatchStartMs,
        success,
        sessionId,
      });
    } catch (_metricsError) {
      this.suppressedMetricFailureCount += 1;
    }
  }
}

export {SQLQueryEngineRequestDispatch, resolveIssuingServiceId};
