import {ADMIN_WEBSOCKET_API_SHARED} from './admin-websocket-api-shared.js';

const LOCAL_NESTED_OPERATION_ADMIN_SQL_QUERY = 'admin_sql_query';

const {
  ADMIN_ENFORCEMENT_MODE,
  ADMIN_ERROR_HINT,
  ADMIN_ERROR_MESSAGE,
  ADMIN_LIMIT,
  ADMIN_LOG_MSG,
  ADMIN_META_ACTION,
  CancellationToken,
  EXECUTION_MODE,
  ErrorCode,
  MUTATION_GUARD_MODE,
  TIMEOUT_BUDGET_CLASSIFICATION,
  createAdminOperationError,
  createRetryableAdminOperationError,
  createSqlRequest,
  createTimeoutBudget,
  createTimeoutBudgetError,
  guardedAdaptAdminAction,
  parseServiceDiscoverySqlQuery,
  resolveRequestedQueryTimeoutMs,
  resolveSqlRequestTimeoutBudgetMs,
} = ADMIN_WEBSOCKET_API_SHARED;

const ADMIN_WEBSOCKET_QUERY_EXECUTION_METHODS = {
  async executeLocalQueryEnvelope(payload, executionContext = {}) {
    const queryId = payload?.queryId || null;
    const sql = payload?.sql;
    const params = payload?.params || [];
    const timeoutMs = this.resolveExecutionQueryTimeoutMs(
      payload?.timeoutMs,
      executionContext,
    );
    const loadLaneExecution = this.isLoadLaneExecution(executionContext);

    if (!queryId) {
      throw createAdminOperationError(
        ErrorCode.MALFORMED_JSON,
        ADMIN_ERROR_MESSAGE.MISSING_QUERY_ID,
        ADMIN_ERROR_HINT.MISSING_QUERY_ID,
      );
    }
    if (!sql || typeof sql !== 'string') {
      throw createAdminOperationError(
        ErrorCode.SYNTAX_ERROR,
        ADMIN_ERROR_MESSAGE.MISSING_SQL,
        ADMIN_ERROR_HINT.MISSING_SQL,
      );
    }
    await this.assertLoadLaneQueryAdmitted(executionContext);
    if (this.isPreflightCriticalPathSnapshotQuery(sql)) {
      return this.buildPreflightCriticalPathSnapshotQueryResult();
    }
    const controlSnapshotQuery = this.parseControlSnapshotQuery(sql);
    if (controlSnapshotQuery.isQuery) {
      const observationPolicy = this.resolveLocalObservationExecutionPolicy(
        executionContext,
        {
          forceAuthoritativeRepair:
            controlSnapshotQuery.forceAuthoritativeRepair,
        },
      );
      return this.buildControlSnapshotQueryResult({
        forceAuthoritativeRepair: controlSnapshotQuery.forceAuthoritativeRepair,
        queryTimeoutMs: timeoutMs,
        allowAuthoritativeRepair: observationPolicy.allowAuthoritativeRepair,
        allowAuthoritativeReadinessRefresh:
          observationPolicy.allowAuthoritativeReadinessRefresh,
        allowStaleReadinessOnCacheChange:
          observationPolicy.allowStaleReadinessOnCacheChange,
        allowAuthoritativePublishedMembershipRecovery:
          observationPolicy.allowAuthoritativePublishedMembershipRecovery,
        ignorePreRestart: payload.ignorePreRestart === true,
        activeClientId: executionContext?.clientInfo?.id || null,
      });
    }
    const serviceDiscoveryQuery = parseServiceDiscoverySqlQuery(sql);
    if (serviceDiscoveryQuery.isQuery) {
      const observationPolicy =
        this.resolveLocalObservationExecutionPolicy(executionContext);
      return this.serviceDiscovery.buildServiceDiscoveryQueryResult({
        tableName: serviceDiscoveryQuery.tableName,
        tableId: serviceDiscoveryQuery.tableId,
        allowAuthoritativeRepair: observationPolicy.allowAuthoritativeRepair,
      });
    }
    const localSystemTableObservation =
      this.tryExecuteLocalSystemTableObservationQuery(sql, params);
    if (localSystemTableObservation) {
      return localSystemTableObservation;
    }

    await this.assertLoadLaneTableQueryAdmitted(sql, executionContext);

    const routed = guardedAdaptAdminAction(
      ADMIN_META_ACTION.EXECUTE_QUERY,
      {sql, queryParams: params},
      this.systemTableCache,
      this.resolveMutationGuardMode(),
    );
    if (!routed.success) {
      throw createAdminOperationError(
        routed.code || ErrorCode.INTERNAL_ERROR,
        routed.error || ADMIN_ERROR_MESSAGE.QUERY_ENGINE_UNAVAILABLE,
      );
    }

    let result;
    try {
      result = await this.executeQueryWithTimeout(
        routed.sql,
        routed.params || [],
        queryId,
        timeoutMs,
      );
    } catch (error) {
      if (
        loadLaneExecution &&
        this.isRetryableLoadLaneExecutionFailure(error)
      ) {
        throw createRetryableAdminOperationError(
          this.getErrorCode(error),
          String(
            error?.message || ADMIN_ERROR_MESSAGE.QUERY_ENGINE_UNAVAILABLE,
          ),
          {
            retryAfterMs: this.resolveLoadLaneRetryAfterMs(error),
          },
        );
      }
      throw error;
    }

    if (
      loadLaneExecution &&
      result?.success === false &&
      this.isRetryableLoadLaneExecutionFailure(result)
    ) {
      result = {
        ...result,
        deferRetry: true,
        retryAfterMs: this.resolveLoadLaneRetryAfterMs(result),
      };
    }
    if (routed.warning) {
      result.warning = routed.warning;
    }
    return result;
  },

  async executeLocalPartitionCallbackEnvelope(payload, _executionContext = {}) {
    const queryId = payload?.queryId || null;
    const statement = payload?.statement;
    const parameters = payload?.parameters || [];
    const callbackModuleRef = payload?.callbackModuleRef;
    const callbackExport = payload?.callbackExport;
    const runtimeKind = payload?.runtimeKind;
    const timeoutMs = resolveRequestedQueryTimeoutMs(payload?.timeoutMs);

    if (!queryId) {
      throw createAdminOperationError(
        ErrorCode.MALFORMED_JSON,
        ADMIN_ERROR_MESSAGE.MISSING_QUERY_ID,
        ADMIN_ERROR_HINT.MISSING_QUERY_ID,
      );
    }
    if (!statement || typeof statement !== 'string') {
      throw createAdminOperationError(
        ErrorCode.SYNTAX_ERROR,
        ADMIN_ERROR_MESSAGE.MISSING_CALLBACK_STATEMENT,
        ADMIN_ERROR_HINT.MISSING_CALLBACK_STATEMENT,
      );
    }
    if (!callbackModuleRef || typeof callbackModuleRef !== 'string') {
      throw createAdminOperationError(
        ErrorCode.MALFORMED_JSON,
        ADMIN_ERROR_MESSAGE.MISSING_CALLBACK_MODULE_REF,
        ADMIN_ERROR_HINT.MISSING_CALLBACK_MODULE_REF,
      );
    }
    if (!callbackExport || typeof callbackExport !== 'string') {
      throw createAdminOperationError(
        ErrorCode.MALFORMED_JSON,
        ADMIN_ERROR_MESSAGE.MISSING_CALLBACK_EXPORT,
        ADMIN_ERROR_HINT.MISSING_CALLBACK_EXPORT,
      );
    }
    if (!runtimeKind || typeof runtimeKind !== 'string') {
      throw createAdminOperationError(
        ErrorCode.MALFORMED_JSON,
        ADMIN_ERROR_MESSAGE.MISSING_CALLBACK_RUNTIME_KIND,
        ADMIN_ERROR_HINT.MISSING_CALLBACK_RUNTIME_KIND,
      );
    }

    return this.executeSqlRequestWithTimeout(
      createSqlRequest({
        statement,
        parameters,
        sessionId: queryId,
        executionMode: EXECUTION_MODE.PARTITION_CALLBACK,
        callbackModuleRef,
        callbackExport,
        runtimeKind,
      }),
      timeoutMs === null ? undefined : timeoutMs,
    );
  },

  executeLocalCacheDumpEnvelope() {
    const routed = guardedAdaptAdminAction(
      ADMIN_META_ACTION.GET_CACHE_DUMP,
      {},
      this.systemTableCache,
      this.resolveMutationGuardMode(),
    );
    if (!routed.success) {
      throw createAdminOperationError(
        routed.code || ErrorCode.INTERNAL_ERROR,
        routed.error || ADMIN_ERROR_MESSAGE.QUERY_ENGINE_UNAVAILABLE,
      );
    }
    return this.buildValidatedCacheDump(routed.tables);
  },

  async handleQueryMessage(clientInfo, message) {
    const queryId = message.queryId || null;
    const payload = {
      queryId,
      sql: message.sql,
      params: message.params || [],
      timeoutMs: resolveRequestedQueryTimeoutMs(message.timeoutMs),
      ignorePreRestart: message.ignorePreRestart === true,
    };

    this.logger.debug(ADMIN_LOG_MSG.EXECUTING_QUERY, {
      clientId: clientInfo.id,
      queryId,
      sql:
        typeof payload.sql === 'string' ?
          payload.sql.substring(0, ADMIN_LIMIT.SQL_PREVIEW_LENGTH) :
          null,
    });

    try {
      const result = await this.executeLocalQueryEnvelope(payload, {clientInfo});
      this.sendQueryResult(clientInfo, queryId, result);
    } catch (error) {
      const errorCode = this.getErrorCode(error);
      this.sendError(
        clientInfo,
        queryId,
        errorCode,
        error.message,
        error.adminHint,
        error,
      );
    }
  },

  async handlePartitionCallbackMessage(clientInfo, message) {
    const queryId = message.queryId || null;
    const payload = {
      queryId,
      statement: message.statement || message.sql,
      parameters: message.parameters || message.params || [],
      callbackModuleRef: message.callbackModuleRef,
      callbackExport: message.callbackExport,
      runtimeKind: message.runtimeKind,
      timeoutMs: resolveRequestedQueryTimeoutMs(message.timeoutMs),
    };

    this.logger.debug(ADMIN_LOG_MSG.EXECUTING_QUERY, {
      clientId: clientInfo.id,
      queryId,
      sql:
        typeof payload.statement === 'string' ?
          payload.statement.substring(
            0,
            ADMIN_LIMIT.SQL_PREVIEW_LENGTH,
          ) :
          null,
      executionMode: EXECUTION_MODE.PARTITION_CALLBACK,
      callbackModuleRef: payload.callbackModuleRef,
      callbackExport: payload.callbackExport,
      runtimeKind: payload.runtimeKind,
    });

    try {
      const result = await this.executeLocalPartitionCallbackEnvelope(payload);
      this.sendQueryResult(clientInfo, queryId, result);
    } catch (error) {
      const errorCode = this.getErrorCode(error);
      this.sendError(
        clientInfo,
        queryId,
        errorCode,
        error.message,
        error.adminHint,
        error,
      );
    }
  },

  async executeQueryWithTimeout(sql, params, queryId, timeoutMs = null) {
    const requestedTimeoutMs = resolveRequestedQueryTimeoutMs(timeoutMs);
    return this.executeSqlRequestWithTimeout(
      createSqlRequest({
        statement: sql,
        parameters: params,
        sessionId: queryId,
        executionMode: EXECUTION_MODE.SQL_STATEMENT,
      }),
      requestedTimeoutMs === null ? undefined : requestedTimeoutMs,
    );
  },

  async executeSqlRequestWithTimeout(
    sqlRequest,
    timeoutMs = this.queryTimeoutMs,
  ) {
    if (
      !this.sqlQueryEngine ||
      typeof this.sqlQueryEngine.executeRequest !== 'function'
    ) {
      throw new Error(ADMIN_ERROR_MESSAGE.QUERY_ENGINE_UNAVAILABLE);
    }

    const timeoutBudget = createTimeoutBudget({
      configuredBudgetMs: resolveSqlRequestTimeoutBudgetMs(timeoutMs),
      now: this.nowFn,
    });
    const cancellationToken =
      sqlRequest?.cancellationToken || new CancellationToken();
    const requestWithControl = {
      ...sqlRequest,
      timeoutMs,
      timeoutBudget,
      cancellationToken,
    };
    let timeoutId;
    try {
      const timeoutPromise = new Promise((resolve, reject) => {
        timeoutId = setTimeout(() => {
          cancellationToken.cancel(
            ADMIN_ERROR_MESSAGE.queryTimeout(timeoutMs),
          );
          const timeoutError = createTimeoutBudgetError({
            message: ADMIN_ERROR_MESSAGE.queryTimeout(timeoutMs),
            budget: timeoutBudget,
            classification: TIMEOUT_BUDGET_CLASSIFICATION.QUERY_TIMEOUT,
            nestedOperation: LOCAL_NESTED_OPERATION_ADMIN_SQL_QUERY,
            now: this.nowFn,
          });
          const canonicalFailure =
            typeof this.sqlQueryEngine.buildTimedOutSqlRequestFailure ===
              'function' ?
              this.sqlQueryEngine.buildTimedOutSqlRequestFailure(
                requestWithControl,
                timeoutError,
              ) :
              null;
          if (canonicalFailure && typeof canonicalFailure === 'object') {
            resolve(canonicalFailure);
            return;
          }
          reject(timeoutError);
        }, timeoutMs);
      });

      const queryPromise = this.sqlQueryEngine.executeRequest(
        requestWithControl,
      );

      return await Promise.race([queryPromise, timeoutPromise]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  },

  resolveMutationGuardMode() {
    if (this.enforcementMode === ADMIN_ENFORCEMENT_MODE.ENFORCE) {
      return MUTATION_GUARD_MODE.REJECT;
    }
    return MUTATION_GUARD_MODE.WARN;
  },
};

export {ADMIN_WEBSOCKET_QUERY_EXECUTION_METHODS};
