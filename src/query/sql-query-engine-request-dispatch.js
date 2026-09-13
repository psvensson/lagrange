/**
 * Canonical SqlRequest execution-mode dispatch.
 */

import {META_SERVICE_ID} from '../constants/wasm-meta.js';
import {SQL_QUERY_ENGINE_SHARED} from './sql-query-engine-shared.js';
import {SQLQueryEngineLifecycleAndCallbackDispatch} from
  './sql-query-engine-lifecycle-and-callback-dispatch.js';
import {SERVICE_LIFECYCLE_EXECUTION_DISPOSITION} from
  './service-lifecycle-sql-contract.js';

const STATEMENT_LOG_LIMIT = 100;

const {
  ADAPTER_ERROR_MSG,
  ADAPTER_LOG_MSG,
  EXECUTION_MODE,
  METRICS_LOG_TAG,
  isSqlRequest,
} = SQL_QUERY_ENGINE_SHARED;

function resolveIssuingServiceId(sqlRequest, executionOptions = {}) {
  const issuingServiceId = executionOptions.issuingServiceId;
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
    sqlRequest.securityContext
  ) {
    return null;
  }

  return issuingServiceId;
}

class SQLQueryEngineRequestDispatch extends
  SQLQueryEngineLifecycleAndCallbackDispatch {
  suppressedMetricFailureCount = 0;

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
      const issuingServiceId = resolveIssuingServiceId(
        sqlRequest,
        executionOptions,
      );
      return this.executeQuery(
        sqlRequest.statement,
        sqlRequest.parameters,
        {
          sessionId: sqlRequest.sessionId,
          tenantId: sqlRequest.tenantId,
          dialect: sqlRequest.dialect,
          timeoutMs: sqlRequest.timeoutMs,
          timeoutBudget: sqlRequest.timeoutBudget,
          cancellationToken: sqlRequest.cancellationToken || null,
          budgets: sqlRequest.budgets,
          ...(issuingServiceId ? {issuingServiceId} : {}),
          ...(sqlRequest.securityContext ?
            {securityContext: sqlRequest.securityContext} : {}),
        },
      );
    }
    case EXECUTION_MODE.PARTITION_CALLBACK:
      return this.executePartitionCallback(sqlRequest);
    case EXECUTION_MODE.STAGE:
      return this.executeStageRequest(sqlRequest);
    case EXECUTION_MODE.PLAN:
      return this.executePlanRequest(sqlRequest);
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
