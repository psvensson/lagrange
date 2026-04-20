import { ADMIN_WEBSOCKET_API_SHARED } from './admin-websocket-api-shared.js';
import { AdminWebSocketAPISegment3 } from './admin-websocket-api-segment-3.js';

const {
  ADMIN_CACHE_DUMP,
  ADMIN_CACHE_OBSERVATION_TABLES,
  ADMIN_CLIENT,
  ADMIN_CONFIG_KEY,
  ADMIN_CONTENT_TYPE,
  ADMIN_CONTROL_SNAPSHOT,
  ADMIN_DEFAULT,
  ADMIN_ENFORCEMENT_MODE,
  ADMIN_ERROR_CODE,
  ADMIN_ERROR_DETAIL_KEY,
  ADMIN_ERROR_HINT,
  ADMIN_ERROR_MATCH,
  ADMIN_ERROR_MESSAGE,
  ADMIN_LIMIT,
  ADMIN_LOCAL_DISPATCH,
  ADMIN_LOG_MSG,
  ADMIN_MESSAGE_TYPE,
  ADMIN_META_ACTION,
  ADMIN_PREFLIGHT_CRITICAL_PATH_SNAPSHOT,
  ADMIN_QUERY_RESULT,
  ADMIN_ROUTE,
  ADMIN_SERVICE_DISCOVERY,
  ADMIN_SERVICE_OPERATION,
  ADMIN_STATUS,
  ADMIN_STREAM_LANE_DEFAULT,
  ADMIN_STREAM_LANE_LOAD,
  ADMIN_STREAM_LANE_PROBE,
  ADMIN_STREAM_LANE_SNAPSHOT,
  ADMIN_SUBSYSTEM,
  ADMIN_TEST_DEFAULT,
  ADMIN_TEST_ERROR_MSG,
  ADMIN_TEST_STREAM_EVENT,
  AST_TYPE,
  AdminControlSnapshot,
  AdminDebugHandlers,
  AdminPreflightSnapshot,
  AdminServiceDiscovery,
  AdminTestRunService,
  CACHE_DUMP_TABLES,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE,
  CONTROL_PLANE_WORKLOAD_CLASS,
  CancellationToken,
  ConfigurationManager,
  ControlPlaneSnapshotOwner,
  DebugMetadataStore,
  EMPTY_STRING,
  ENDPOINT_SYNC_UNHEALTHY_POLICY,
  ERRNO,
  EXECUTION_MODE,
  EXPR_TYPE,
  ErrorCode,
  Fastify,
  HTTP_HEADER,
  HTTP_HEADER_VALUE,
  HTTP_STATUS,
  LOAD_LANE_ADMISSION_REASON_FALLBACK,
  LOAD_LANE_QUERY_ADMISSION_STATE,
  LOAD_LANE_QUERY_TIMEOUT_CAP_MS,
  LOAD_LANE_READINESS_CACHE_MAX_AGE_MS,
  LOAD_LANE_SOFT_ADMISSION_REASON_CODES,
  LOAD_LANE_TABLE_ADMISSION_CACHE_MAX_AGE_MS,
  LOAD_LANE_TABLE_ADMISSION_RETRY_AFTER_MS,
  LOAD_LANE_TABLE_ADMISSION_STATE,
  LOAD_LANE_VOTER_READY_REPLICA_ROLES,
  LoggingService,
  META_SERVICE_ID,
  MUTATION_GUARD_MODE,
  MessageType,
  NUM,
  PRESSURE_GOVERNOR_ACTION,
  PressureGovernor,
  QUERY_RESULT_MESSAGE_KIND,
  QUERY_RESULT_WRITE_OPERATIONS,
  READINESS_SNAPSHOT_KEY,
  SQLParser,
  SQL_REQUEST_TIMEOUT_BUDGET_COMPLETION_MARGIN_MS,
  SSE_FRAME_PREFIX,
  SSE_FRAME_SUFFIX,
  TABLES,
  TIMEOUT_BUDGET_CLASSIFICATION,
  TRANSPORT_EVENT,
  TYPEOF,
  TraceCollector,
  WASM_SERVICE_PROTOCOL,
  adaptAdminMessageToServiceMessage,
  appendStructuredQueryMetadata,
  buildControlPlaneWorkloadProfile,
  buildLoadLaneAdmissionErrorDetails,
  buildLoadLaneQueryAdmissionResult,
  buildLoadLaneQueryAdmissionSnapshot,
  buildLoadLaneRuntimeAuthoritySummary,
  createAdminOperationError,
  createRetryableAdminOperationError,
  createSqlRequest,
  createTimeoutBudget,
  createTimeoutBudgetError,
  evaluateSharedMetadataNodeCoverage,
  getControlPlaneRetryAfterMs,
  getRegisteredControlPlaneSystemTableGateway,
  guardedAdaptAdminAction,
  isAdminMessageDispatchable,
  isRetryableControlPlaneError,
  normalizeIdentifier,
  normalizeSql,
  parseDiscoveryBooleanQuery,
  parseDiscoveryListQuery,
  parseLiveSelect,
  parseServiceDiscoverySqlQuery,
  resolveLoadLaneQueryAdmissionState,
  resolveRequestedQueryTimeoutMs,
  resolveSqlEngineControlPlaneReadinessService,
  resolveSqlRequestTimeoutBudgetMs,
  websocket,
} = ADMIN_WEBSOCKET_API_SHARED;

class AdminWebSocketAPI extends AdminWebSocketAPISegment3 {
  async handleQueryMessage(clientInfo, message) {
    const queryId = message.queryId || null;
    const payload = {
      queryId,
      sql: message.sql,
      params: message.params || [],
      timeoutMs: resolveRequestedQueryTimeoutMs(message.timeoutMs),
    };

    this.logger.debug(ADMIN_LOG_MSG.EXECUTING_QUERY, {
      clientId: clientInfo.id,
      queryId,
      sql: typeof payload.sql === TYPEOF.STRING ?
        payload.sql.substring(NUM.ZERO, ADMIN_LIMIT.SQL_PREVIEW_LENGTH) :
        null,
    });

    try {
      const result = await this.executeLocalQueryEnvelope(payload);
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
  }

  /**
   * Handle partition callback execution message.
   * @param {Object} clientInfo - Client information.
   * @param {Object} message - Callback message.
   * @private
   */
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
      sql: typeof payload.statement === TYPEOF.STRING ?
        payload.statement.substring(NUM.ZERO, ADMIN_LIMIT.SQL_PREVIEW_LENGTH) :
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
  }

  /**
   * Execute query with timeout.
   * @param {string} sql - SQL query.
   * @param {Array} params - Query parameters.
   * @param {string} queryId - Query ID.
   * @param {number|null} [timeoutMs] - Optional timeout override.
   * @return {Promise<Object>} Query result.
   * @private
   */
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
  }

  /**
   * Execute canonical SQL request with timeout.
   * @param {Object} sqlRequest - Canonical SqlRequest.
   * @return {Promise<Object>} Query result.
   * @private
   */
  async executeSqlRequestWithTimeout(sqlRequest, timeoutMs = this.queryTimeoutMs) {
    if (!this.sqlQueryEngine ||
        typeof this.sqlQueryEngine.executeRequest !== TYPEOF.FUNCTION) {
      throw new Error(ADMIN_ERROR_MESSAGE.QUERY_ENGINE_UNAVAILABLE);
    }

    const timeoutBudget = createTimeoutBudget({
      configuredBudgetMs: resolveSqlRequestTimeoutBudgetMs(timeoutMs),
      now: this.nowFn,
    });
    const cancellationToken =
      sqlRequest?.cancellationToken ||
      new CancellationToken();
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
            nestedOperation: 'admin_sql_query',
            now: this.nowFn,
          });
          const canonicalFailure =
            typeof this.sqlQueryEngine.buildTimedOutSqlRequestFailure ===
              TYPEOF.FUNCTION ?
              this.sqlQueryEngine.buildTimedOutSqlRequestFailure(
                requestWithControl,
                timeoutError,
              ) :
              null;
          if (canonicalFailure && typeof canonicalFailure === TYPEOF.OBJECT) {
            resolve(canonicalFailure);
            return;
          }
          reject(timeoutError);
        }, timeoutMs);
      });

      const queryPromise = this.sqlQueryEngine.executeRequest(requestWithControl);

      return await Promise.race([queryPromise, timeoutPromise]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  /**
   * Resolve guard mode for adapter routing based on enforcement mode.
   * @return {string} MUTATION_GUARD_MODE value.
   * @private
   */
  resolveMutationGuardMode() {
    if (this.enforcementMode === ADMIN_ENFORCEMENT_MODE.ENFORCE) {
      return MUTATION_GUARD_MODE.REJECT;
    }
    return MUTATION_GUARD_MODE.WARN;
  }

  /**
   * Send query result to client.
   * @param {Object} clientInfo - Client information.
   * @param {string} queryId - Query ID.
   * @param {Object} result - Query result.
   * @private
   */
  sendQueryResult(clientInfo, queryId, result) {
    const message = this.createQueryResultMessageEnvelope(queryId);
    const payloadContext = this.resolveQueryResultPayloadContext(result);
    this.applyQueryResultMessagePayload(message, result, payloadContext);
    this.applyOptionalQueryResultWarning(message, result);
    appendStructuredQueryMetadata(message, result);

    this.sendToClient(clientInfo, message);

    this.logger.debug(ADMIN_LOG_MSG.QUERY_RESULT_SENT, {
      clientId: clientInfo.id,
      queryId,
      success: result.success !== false,
    });
  }

  createQueryResultMessageEnvelope(queryId) {
    return {
      type: MessageType.QUERY_RESULT,
      queryId,
      timestamp: Date.now(),
    };
  }

  resolveQueryResultPayloadContext(result) {
    const operation = typeof result?.operation === TYPEOF.STRING ?
      result.operation.trim().toLowerCase() :
      EMPTY_STRING;
    const hasAffectedRows = Number.isFinite(Number(result?.affectedRows));
    const hasRowPayload =
      result.rows !== undefined ||
      result.results !== undefined;
    if (result.success === false) {
      return {kind: QUERY_RESULT_MESSAGE_KIND.ERROR, hasRowPayload};
    }
    if (
      result.hostResult ||
      result.executionMode === EXECUTION_MODE.PARTITION_CALLBACK
    ) {
      return {kind: QUERY_RESULT_MESSAGE_KIND.HOST_CALLBACK, hasRowPayload};
    }
    if (
      QUERY_RESULT_WRITE_OPERATIONS.has(operation) ||
      hasAffectedRows
    ) {
      return {kind: QUERY_RESULT_MESSAGE_KIND.WRITE, hasRowPayload};
    }
    if (hasRowPayload) {
      return {kind: QUERY_RESULT_MESSAGE_KIND.ROWS, hasRowPayload};
    }
    return {kind: QUERY_RESULT_MESSAGE_KIND.DEFAULT_WRITE, hasRowPayload};
  }

  applyQueryResultMessagePayload(message, result, payloadContext) {
    switch (payloadContext.kind) {
    case QUERY_RESULT_MESSAGE_KIND.ERROR:
      this.applyErrorQueryResultMessagePayload(message, result);
      return;
    case QUERY_RESULT_MESSAGE_KIND.HOST_CALLBACK:
      this.applyHostCallbackQueryResultMessagePayload(message, result);
      return;
    case QUERY_RESULT_MESSAGE_KIND.WRITE:
      this.applyWriteQueryResultMessagePayload(
        message,
        result,
        payloadContext,
      );
      return;
    case QUERY_RESULT_MESSAGE_KIND.ROWS:
      this.applyRowsQueryResultMessagePayload(message, result);
      return;
    default:
      this.applyDefaultWriteQueryResultMessagePayload(message, result);
    }
  }

  applyErrorQueryResultMessagePayload(message, result) {
    message.error = result.error;
    message.errorCode = result.errorCode || ErrorCode.INTERNAL_ERROR;
    if (result.hint) {
      message.hint = result.hint;
    }
    if (result.details && typeof result.details === TYPEOF.OBJECT) {
      message.details = result.details;
    }
    if (result.deferRetry === true) {
      message.deferRetry = true;
    }
    if (Number.isFinite(result.retryAfterMs)) {
      message.retryAfterMs = Math.max(
        NUM.ZERO,
        Math.floor(result.retryAfterMs),
      );
    }
  }

  applyHostCallbackQueryResultMessagePayload(message, result) {
    message.operation = EXECUTION_MODE.PARTITION_CALLBACK;
    message.results = Array.isArray(result.results) ?
      result.results :
      ADMIN_CACHE_DUMP.EMPTY;
    message.hostResult = result.hostResult || null;
    message.callbackModuleRef = result.callbackModuleRef || null;
    message.callbackExport = result.callbackExport || null;
  }

  applyWriteQueryResultMessagePayload(message, result, payloadContext) {
    message.operation = result.operation || null;
    message.affectedRows = this.resolveQueryResultAffectedRows(
      result.affectedRows,
      false,
    );
    this.applyQueryResultTableScope(message, result);
    if (payloadContext.hasRowPayload) {
      message.results = this.resolveQueryResultRows(result);
      message.count = message.results.length;
    }
  }

  applyRowsQueryResultMessagePayload(message, result) {
    message.results = this.resolveQueryResultRows(result);
    message.count = result.count !== undefined ?
      result.count :
      message.results.length;
    this.applyQueryResultTableScope(message, result);
  }

  applyDefaultWriteQueryResultMessagePayload(message, result) {
    message.operation = result.operation;
    message.affectedRows = this.resolveQueryResultAffectedRows(
      result.affectedRows,
      true,
    );
    this.applyQueryResultTableScope(message, result);
  }

  resolveQueryResultAffectedRows(affectedRows, preserveOriginalValue) {
    const parsedAffectedRows = Number(affectedRows);
    if (Number.isFinite(parsedAffectedRows)) {
      return parsedAffectedRows;
    }
    if (preserveOriginalValue && affectedRows) {
      return affectedRows;
    }
    return ADMIN_QUERY_RESULT.AFFECTED_ROWS_DEFAULT;
  }

  applyQueryResultTableScope(message, result) {
    message.partitions = result.partitions || ADMIN_CACHE_DUMP.EMPTY;
    message.tableName = result.tableName || null;
  }

  resolveQueryResultRows(result) {
    return result.rows || result.results || ADMIN_CACHE_DUMP.EMPTY;
  }

  applyOptionalQueryResultWarning(message, result) {
    if (result.warning) {
      message.warning = result.warning;
    }
  }

  /**
   * Handle refresh message (request new cache dump).
   * @param {Object} clientInfo - Client information.
   * @param {Object} _message - Refresh message.
   * @private
   */
  handleRefreshMessage(clientInfo, _message) {
    this.logger.debug(ADMIN_LOG_MSG.REFRESH_REQUESTED, {
      clientId: clientInfo.id,
    });

    try {
      this.sendCacheDumpPayload(clientInfo, this.executeLocalCacheDumpEnvelope());
    } catch (error) {
      const errorCode = this.getErrorCode(error);
      this.sendError(
        clientInfo,
        null,
        errorCode,
        error.message,
        error.adminHint,
        error,
      );
    }
  }

  /**
   * Send error to client.
   * @param {Object} clientInfo - Client information.
   * @param {string|null} queryId - Query ID (if applicable).
   * @param {string} errorCode - Error code.
   * @param {string} errorMessage - Error message.
   * @param {string} hint - Optional hint for resolution.
   * @private
   */
  sendError(clientInfo, queryId, errorCode, errorMessage, hint, options = {}) {
    const message = {
      type: queryId ? MessageType.QUERY_RESULT : MessageType.ERROR,
      timestamp: Date.now(),
      error: errorMessage,
      errorCode,
    };

    if (queryId) {
      message.queryId = queryId;
    }

    if (hint) {
      message.hint = hint;
    }
    if (options?.adminDetails && typeof options.adminDetails === TYPEOF.OBJECT) {
      message.details = options.adminDetails;
    } else if (options?.details && typeof options.details === TYPEOF.OBJECT) {
      message.details = options.details;
    }

    if (options?.deferRetry === true) {
      message.deferRetry = true;
    }
    if (Number.isFinite(options?.retryAfterMs)) {
      message.retryAfterMs = Math.max(
        NUM.ZERO,
        Math.floor(options.retryAfterMs),
      );
    }
    appendStructuredQueryMetadata(message, options);

    this.sendToClient(clientInfo, message);
  }

  /**
   * Send message to a specific client.
   * @param {Object} clientInfo - Client information.
   * @param {Object} message - Message to send.
   * @private
   */
  sendToClient(clientInfo, message) {
    try {
      const json = JSON.stringify(message);
      clientInfo.socket.send(json);
    } catch (error) {
      this.logger.error(ADMIN_LOG_MSG.SEND_FAILED, {
        clientId: clientInfo.id,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Broadcast CDC event to all connected clients.
   * @param {string} tableName - Table name.
   * @param {string} operation - CDC operation (insert, update, delete).
   * @param {Object} record - Record data.
   */
  broadcastCDCEvent(tableName, operation, record) {
    const message = {
      type: MessageType.CDC_EVENT,
      timestamp: Date.now(),
      table: tableName,
      operation: operation.toLowerCase(),
      record,
    };

    for (const clientInfo of this.clients) {
      this.sendToClient(clientInfo, message);
    }
  }

  /**
   * Get error code from error.
   * @param {Error} error - Error object.
   * @return {string} Error code.
   * @private
   */
  getErrorCode(error) {
    if (error && typeof error.adminErrorCode === TYPEOF.STRING) {
      return error.adminErrorCode;
    }
    const message = error.message.toLowerCase();

    if (message.includes(ADMIN_ERROR_MATCH.PARSE) ||
        message.includes(ADMIN_ERROR_MATCH.SYNTAX)) {
      return ErrorCode.SYNTAX_ERROR;
    }
    if (message.includes(ADMIN_ERROR_MATCH.TABLE_NOT_FOUND) ||
        message.includes(ADMIN_ERROR_MATCH.TABLE_NOT_FOUND_CODE)) {
      return ErrorCode.TABLE_NOT_FOUND;
    }
    if (message.includes(ADMIN_ERROR_MATCH.TIMEOUT)) {
      return ErrorCode.TIMEOUT;
    }

    return ErrorCode.INTERNAL_ERROR;
  }

  /**
   * Set the system table cache.
   * @param {Object} cache - System table cache.
   */
  setSystemTableCache(cache) {
    this.systemTableCache = cache;
    // Subscribe to cache notifications when cache is set (Requirement 2.2)
    this.subscribeToCacheNotifications();
  }

  /**
   * Set the SQL query engine.
   * @param {Object} engine - SQL query engine.
   */
  setSQLQueryEngine(engine) {
    this.sqlQueryEngine = engine;
    this.controlPlaneReadinessService =
      this.controlPlaneReadinessService ||
      resolveSqlEngineControlPlaneReadinessService(engine);
    if (this.controlSnapshot) {
      this.controlSnapshot.sqlQueryEngine = engine || null;
      this.controlSnapshot.controlPlaneReadinessService =
        this.controlSnapshot.controlPlaneReadinessService ||
        this.controlPlaneReadinessService;
    }
    if (this.preflightSnapshot) {
      this.preflightSnapshot.sqlQueryEngine = engine || null;
    }
    if (this.liveQueryManager &&
      typeof this.liveQueryManager.initialize === TYPEOF.FUNCTION) {
      this.liveQueryManager.initialize({
        sqlQueryEngine: engine,
      });
    }
    if (this.debugMetadataStore &&
      typeof this.debugMetadataStore.setSqlQueryEngine === TYPEOF.FUNCTION) {
      this.debugMetadataStore.setSqlQueryEngine(engine);
      return;
    }
    if (!this.debugMetadataStore && engine) {
      this.debugMetadataStore = new DebugMetadataStore({
        sqlQueryEngine: engine,
      });
      this.debugHandlers.debugMetadataStore =
        this.debugMetadataStore;
    }
  }

  /**
   * Get the number of connected clients.
   * @return {number} Number of connected clients.
   */
  getClientCount() {
    return this.clients.size;
  }

  /**
   * Get the Fastify instance.
   * @return {Object} Fastify instance.
   */
  getFastify() {
    return this.fastify;
  }

  /**
   * Check if the API is initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    return this.initialized;
  }

  /**
   * Returns whether the API is bound to a TCP port.
   * @return {boolean}
   */
  isListening() {
    return this.listening;
  }

  /**
   * Shutdown the WebSocket server.
   * @return {Promise<void>}
   */
  async shutdown() {
    // Close all client connections
    for (const clientInfo of this.clients) {
      try {
        clientInfo.socket.close();
      } catch (_closeErr) {
        // Ignore close errors during shutdown
      }
    }
    this.clients.clear();

    if (this.fastify) {
      const server = this.fastify.server;
      // Close all active connections immediately
      if (server && typeof server.closeAllConnections === TYPEOF.FUNCTION) {
        server.closeAllConnections();
      }
      await this.fastify.close();
      // Ensure underlying HTTP server is fully closed
      if (server && typeof server.close === TYPEOF.FUNCTION) {
        await new Promise((resolve) => {
          server.close((error) => {
            if (error && error.code !== ERRNO.NOT_RUNNING) {
              this.logger.warn(ADMIN_LOG_MSG.SERVER_CLOSE_ERROR, {
                error: error.message,
              });
            }
            resolve();
          });
        });
      }
      // Unref the server to allow process exit
      if (server && typeof server.unref === TYPEOF.FUNCTION) {
        server.unref();
      }
      this.fastify = null;
    }

    this.initialized = false;

    this.logger.info(ADMIN_LOG_MSG.SHUTDOWN, {
      nodeId: this.nodeId,
    });
  }
}
export {AdminWebSocketAPI, MessageType, ErrorCode};

