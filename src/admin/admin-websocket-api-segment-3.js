import {ADMIN_WEBSOCKET_API_SHARED} from './admin-websocket-api-shared.js';
import {AdminWebSocketAPISegment2} from './admin-websocket-api-segment-2.js';
import {resolveControlSnapshotQueryResult} from './admin-control-snapshot-query-result-helper.js';

const LOCAL_STR_I = 'i';
const STALE_SOCKET_LOG_MSG = 'Closing stale admin socket connection on lane';
const SNAPSHOT_RETRY_LOG_MSG = 'Snapshot query encountered pressure or timeout. Retrying after stale socket cleanup...';

const SNAPSHOT_RETRY_LIMIT = 3;
const SNAPSHOT_RETRY_DELAY_MS = 500;
const SNAPSHOT_RETRY_DECISION = Object.freeze({
  RETRY: 'retry',
  STOP_SUCCESS: 'stop_success',
  STOP_FAILURE: 'stop_failure',
});

const RETRY_REASON_FORCED_REPAIR_PATH_DISABLED = 'forced_repair_path_disabled';
const RETRY_REASON_RETRY_LIMIT_EXHAUSTED = 'retry_limit_exhausted';
const RETRY_REASON_ERROR_PRESSURE_OR_TIMEOUT = 'error_pressure_or_timeout';
const RETRY_REASON_NON_RETRYABLE_ERROR = 'non_retryable_error';
const RETRY_REASON_RESULT_PRESSURE_DEFERRED = 'result_pressure_deferred';
const RETRY_REASON_SNAPSHOT_OBSERVATION_PRESSURE = 'snapshot_observation_pressure';
const RETRY_REASON_ADMITTED_SUCCESSFULLY = 'admitted_successfully';

const CLOSE_STALE_SOCKET_BEFORE_RETRY_MSG = 'Closing stale admin socket connection on lane before retry';

const ERR_MSG_TIMED_OUT = 'timed out';
const ERR_MSG_TIMEOUT_LOWER = 'timeout';
const ERR_MSG_TIMEOUT_UPPER = 'Timeout';
const ERR_MSG_DISTRIBUTED_PARTICIPANT_FAILURE = 'Distributed operation failed due to participant failures';
const ERR_MSG_AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE = 'authoritative_row_source_unavailable';
const ERR_MSG_CONNECTION_TO_NODE = 'Connection to node';
const ERR_MSG_NO_CONNECTION_TO_NODE = 'No connection to node';
const ERR_MSG_CLOSED = 'closed';
const ERR_MSG_CONTROL_PLANE_PRESSURE_DEGRADED = 'control_plane_pressure_degraded';
const ERR_CODE_DISTRIBUTED_PARTICIPANT_FAILURE = 'DISTRIBUTED_PARTICIPANT_FAILURE';
const ERR_CODE_CONTROL_PLANE_PRESSURE_DEGRADED = 'CONTROL_PLANE_PRESSURE_DEGRADED';

const OBS_STATE_DEFERRED_REFRESH = 'deferred_refresh';
const OBS_STATE_FAILED = 'failed';
const REASON_SUBSTR_PRESSURE = 'pressure';
const REASON_SUBSTR_TIMEOUT = 'timeout';
const REASON_SUBSTR_FAIL = 'fail';

const SNAPSHOT_RETRY_RULES = [
  {
    match: (e) => e.isForcedRepair,
    outcome: SNAPSHOT_RETRY_DECISION.STOP_FAILURE,
    reason: RETRY_REASON_FORCED_REPAIR_PATH_DISABLED,
  },
  {
    match: (e) => e.isLimitReached,
    outcome: SNAPSHOT_RETRY_DECISION.STOP_FAILURE,
    reason: RETRY_REASON_RETRY_LIMIT_EXHAUSTED,
  },
  {
    match: (e) => e.isError && e.isPressureOrTimeoutError,
    outcome: SNAPSHOT_RETRY_DECISION.RETRY,
    reason: RETRY_REASON_ERROR_PRESSURE_OR_TIMEOUT,
  },
  {
    match: (e) => e.isError,
    outcome: SNAPSHOT_RETRY_DECISION.STOP_FAILURE,
    reason: RETRY_REASON_NON_RETRYABLE_ERROR,
  },
  {
    match: (e) => e.isPressureDeferred,
    outcome: SNAPSHOT_RETRY_DECISION.RETRY,
    reason: RETRY_REASON_RESULT_PRESSURE_DEFERRED,
  },
  {
    match: (e) => e.hasPressureObservation,
    outcome: SNAPSHOT_RETRY_DECISION.RETRY,
    reason: RETRY_REASON_SNAPSHOT_OBSERVATION_PRESSURE,
  },
  {
    match: () => true,
    outcome: SNAPSHOT_RETRY_DECISION.STOP_SUCCESS,
    reason: RETRY_REASON_ADMITTED_SUCCESSFULLY,
  },
];

function evaluateSnapshotRetryDecision(options, attempts, resultOrError) {
  const evidence = {
    isForcedRepair: options?.forceAuthoritativeRepair === true,
    isLimitReached: attempts >= SNAPSHOT_RETRY_LIMIT,
    isError: resultOrError instanceof Error,
    isPressureOrTimeoutError: false,
    isPressureDeferred: resultOrError?.criticalConvergenceDeferred === true,
    hasPressureObservation: false,
  };

  if (evidence.isError) {
    const msg = resultOrError.message || '';
    const code = resultOrError.code || '';
    evidence.isPressureOrTimeoutError = (
      msg.includes(ERR_MSG_TIMED_OUT) ||
      msg.includes(ERR_MSG_TIMEOUT_LOWER) ||
      msg.includes(ERR_MSG_TIMEOUT_UPPER) ||
      msg.includes(ERR_MSG_DISTRIBUTED_PARTICIPANT_FAILURE) ||
      msg.includes(ERR_MSG_AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE) ||
      msg.includes(ERR_MSG_CONNECTION_TO_NODE) ||
      msg.includes(ERR_MSG_NO_CONNECTION_TO_NODE) ||
      msg.includes(ERR_MSG_CLOSED) ||
      msg.includes(ERR_MSG_CONTROL_PLANE_PRESSURE_DEGRADED) ||
      code === ERR_CODE_DISTRIBUTED_PARTICIPANT_FAILURE ||
      code === ERR_CODE_CONTROL_PLANE_PRESSURE_DEGRADED
    );
  }

  const snapshot = Array.isArray(resultOrError?.rows) ? resultOrError.rows[NUM.ZERO] : null;
  if (snapshot) {
    const observation = snapshot.snapshotObservation;
    evidence.hasPressureObservation = (
      observation?.state === OBS_STATE_DEFERRED_REFRESH ||
      observation?.state === OBS_STATE_FAILED ||
      (Array.isArray(observation?.reasonCodes) &&
        observation.reasonCodes.some(code =>
          code.includes(REASON_SUBSTR_PRESSURE) ||
          code.includes(REASON_SUBSTR_TIMEOUT) ||
          code.includes(REASON_SUBSTR_FAIL)
        ))
    );
  }

  const matchedRule = SNAPSHOT_RETRY_RULES.find((rule) => rule.match(evidence));
  return {
    outcome: matchedRule.outcome,
    reason: matchedRule.reason,
  };
}

const {
  ADMIN_CACHE_DUMP,
  ADMIN_CONTROL_SNAPSHOT,
  ADMIN_ENFORCEMENT_MODE,
  ADMIN_ERROR_HINT,
  ADMIN_ERROR_MATCH,
  ADMIN_ERROR_MESSAGE,
  ADMIN_LIMIT,
  ADMIN_LOG_MSG,
  ADMIN_META_ACTION,
  ADMIN_PREFLIGHT_CRITICAL_PATH_SNAPSHOT,
  ADMIN_QUERY_RESULT,
  ADMIN_SERVICE_DISCOVERY,
  ADMIN_SERVICE_OPERATION,
  CancellationToken,
  DebugMetadataStore,
  EMPTY_STRING,
  ENDPOINT_SYNC_UNHEALTHY_POLICY,
  ERRNO,
  EXECUTION_MODE,
  ErrorCode,
  HTTP_STATUS,
  MUTATION_GUARD_MODE,
  MessageType,
  NUM,
  QUERY_RESULT_MESSAGE_KIND,
  QUERY_RESULT_WRITE_OPERATIONS,
  SQLParser,
  TABLES,
  TIMEOUT_BUDGET_CLASSIFICATION,
  TYPEOF,
  adaptAdminMessageToServiceMessage,
  appendStructuredQueryMetadata,
  createAdminOperationError,
  createRetryableAdminOperationError,
  createSqlRequest,
  createTimeoutBudget,
  createTimeoutBudgetError,
  guardedAdaptAdminAction,
  isAdminMessageDispatchable,
  normalizeIdentifier,
  normalizeSql,
  parseDiscoveryBooleanQuery,
  parseDiscoveryListQuery,
  parseLiveSelect,
  parseServiceDiscoverySqlQuery,
  resolvePreferredControlPlaneReadinessService,
  resolveRequestedQueryTimeoutMs,
  resolveSqlEngineControlPlaneReadinessService,
  resolveSqlRequestTimeoutBudgetMs,
  ADMIN_STREAM_LANE_SNAPSHOT,
} = ADMIN_WEBSOCKET_API_SHARED;

class AdminWebSocketAPISegment3 extends AdminWebSocketAPISegment2 {
  constructor(...args) {
    super(...args);
    if (this.controlPlaneSnapshotOwner) {
      this.controlPlaneSnapshotOwner.closeStaleSnapshotSockets = () => {
        this.closeStaleSnapshotLaneSockets();
      };
    }
  }

  closeStaleSnapshotLaneSockets() {
    const snapshotClients = [...this.clients].filter(
      (clientInfo) => clientInfo.lane === ADMIN_STREAM_LANE_SNAPSHOT
    );
    for (const clientInfo of snapshotClients) {
      this.logger.info(CLOSE_STALE_SOCKET_BEFORE_RETRY_MSG, {
        clientId: clientInfo.id,
        lane: ADMIN_STREAM_LANE_SNAPSHOT,
      });
      try {
        clientInfo.socket.close();
      } catch (_closeErr) {
        // Ignore
      }
      this.handleDisconnection(clientInfo);
    }
  }

  resolveLocalSystemTableObservationPartitions(tableName, rows) {
    if (tableName === TABLES.PARTITIONS) {
      return rows
        .map((row) => row?.partition_id || row?.partitionId || null)
        .filter(
          (partitionId) =>
            typeof partitionId === TYPEOF.STRING &&
            partitionId.length > NUM.ZERO,
        );
    }

    if (
      tableName === TABLES.SERVICES ||
      tableName === TABLES.REPLICA_OPERATIONS
    ) {
      return [
        ...new Set(
          rows
            .map((row) => row?.partition_id || row?.partitionId || null)
            .filter(
              (partitionId) =>
                typeof partitionId === TYPEOF.STRING &&
                partitionId.length > NUM.ZERO,
            ),
        ),
      ];
    }

    if (typeof this.systemTableCache.filter !== TYPEOF.FUNCTION) {
      return ADMIN_CACHE_DUMP.EMPTY;
    }

    return this.systemTableCache
      .filter(TABLES.PARTITIONS, (row) => {
        const rowTableName = normalizeIdentifier(
          row?.table_name || row?.tableName || null,
        );
        const rowTableId = normalizeIdentifier(
          row?.table_id || row?.tableId || null,
        );
        return rowTableName === tableName || rowTableId === tableName;
      })
      .map((row) => row?.partition_id || row?.partitionId || null)
      .filter(
        (partitionId) =>
          typeof partitionId === TYPEOF.STRING && partitionId.length > NUM.ZERO,
      );
  }

  /**
   * Match one SQL LIKE pattern for local cache observation queries.
   * @param {*} value
   * @param {*} pattern
   * @return {boolean}
   * @private
   */
  matchesLocalSystemTableObservationLike(value, pattern) {
    const normalizedValue = String(value ?? EMPTY_STRING);
    const normalizedPattern = String(pattern ?? EMPTY_STRING)
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/%/g, '.*')
      .replace(/_/g, '.');
    return new RegExp(`^${normalizedPattern}$`, LOCAL_STR_I).test(normalizedValue);
  }

  /**
   * Execute canonical query operation payload.
   * @param {Object} payload
   * @param {Object} executionContext
   * @return {Promise<Object>}
   * @private
   */
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
    if (!sql || typeof sql !== TYPEOF.STRING) {
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
  }

  /**
   * Execute canonical partition-callback payload.
   * @param {Object} payload
   * @param {Object} _executionContext
   * @return {Promise<Object>}
   * @private
   */
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
    if (!statement || typeof statement !== TYPEOF.STRING) {
      throw createAdminOperationError(
        ErrorCode.SYNTAX_ERROR,
        ADMIN_ERROR_MESSAGE.MISSING_CALLBACK_STATEMENT,
        ADMIN_ERROR_HINT.MISSING_CALLBACK_STATEMENT,
      );
    }
    if (!callbackModuleRef || typeof callbackModuleRef !== TYPEOF.STRING) {
      throw createAdminOperationError(
        ErrorCode.MALFORMED_JSON,
        ADMIN_ERROR_MESSAGE.MISSING_CALLBACK_MODULE_REF,
        ADMIN_ERROR_HINT.MISSING_CALLBACK_MODULE_REF,
      );
    }
    if (!callbackExport || typeof callbackExport !== TYPEOF.STRING) {
      throw createAdminOperationError(
        ErrorCode.MALFORMED_JSON,
        ADMIN_ERROR_MESSAGE.MISSING_CALLBACK_EXPORT,
        ADMIN_ERROR_HINT.MISSING_CALLBACK_EXPORT,
      );
    }
    if (!runtimeKind || typeof runtimeKind !== TYPEOF.STRING) {
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
  }

  /**
   * Execute canonical cache-dump operation payload.
   * @return {Object}
   * @private
   */
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
  }

  /**
   * Handle new WebSocket connection.
   * Overrides base connection logic to close stale connections on the same lane.
   * @param {Object} socket - WebSocket connection.
   * @param {Object} [request] - Fastify request.
   * @private
   */
  handleConnection(socket, request = null) {
    const lane = this.resolveAdminClientLane(request?.query?.lane);

    // Find and close any stale connections on the same lane to prevent accumulation
    if (lane === ADMIN_STREAM_LANE_SNAPSHOT) {
      for (const clientInfo of [...this.clients]) {
        if (clientInfo.lane === lane) {
          this.logger.info(STALE_SOCKET_LOG_MSG, {
            clientId: clientInfo.id,
            lane,
          });
          try {
            clientInfo.socket.close();
          } catch (_closeErr) {
            // Ignore close errors for stale clients
          }
          this.handleDisconnection(clientInfo);
        }
      }
    }

    super.handleConnection(socket, request);
  }

  /**
   * Handle incoming message from client.

   * @param {Object} clientInfo - Client information.
   * @param {Buffer|string} data - Message data.
   * @private
   */
  handleMessage(clientInfo, data) {
    let message;

    try {
      const messageStr = data.toString();
      message = JSON.parse(messageStr);
    } catch (_error) {
      this.sendError(
        clientInfo,
        null,
        ErrorCode.MALFORMED_JSON,
        ADMIN_ERROR_MESSAGE.INVALID_JSON,
        ADMIN_ERROR_HINT.INVALID_JSON,
      );
      return;
    }

    if (!message || typeof message.type !== TYPEOF.STRING) {
      this.sendError(
        clientInfo,
        null,
        ErrorCode.MALFORMED_JSON,
        ADMIN_ERROR_MESSAGE.MISSING_TYPE,
        ADMIN_ERROR_HINT.MISSING_TYPE,
      );
      return;
    }

    this.logger.debug(ADMIN_LOG_MSG.RECEIVED_MESSAGE, {
      clientId: clientInfo.id,
      type: message.type,
    });

    switch (message.type) {
    case MessageType.QUERY:
      this.handleDispatchableAdminMessage(clientInfo, message);
      break;

    case MessageType.PARTITION_CALLBACK:
      this.handleDispatchableAdminMessage(clientInfo, message);
      break;

    case MessageType.REFRESH:
      this.handleDispatchableAdminMessage(clientInfo, message);
      break;

    case MessageType.LIVE_QUERY_SUBSCRIBE:
      this.handleLiveQuerySubscribe(clientInfo, message);
      break;

    case MessageType.LIVE_QUERY_UNSUBSCRIBE:
      this.handleLiveQueryUnsubscribe(clientInfo, message);
      break;

    default:
      // Ignore unknown message types (Requirement 32.38)
      this.logger.debug(ADMIN_LOG_MSG.UNKNOWN_MESSAGE, {
        clientId: clientInfo.id,
        type: message.type,
      });
      break;
    }
  }

  /**
   * Handle live query subscribe request.
   * Parses the LIVE SELECT SQL, registers with the server-side
   * LiveQueryManager, and bridges CDC events to the client socket.
   * @param {Object} clientInfo - Client information.
   * @param {Object} message - Subscribe message.
   * @private
   */
  async handleLiveQuerySubscribe(clientInfo, message) {
    const subscriptionId = message.subscriptionId;
    const sql = message.sql;

    if (!subscriptionId) {
      this.sendError(
        clientInfo,
        null,
        ErrorCode.MALFORMED_JSON,
        ADMIN_ERROR_MESSAGE.LIVE_QUERY_MISSING_SUBSCRIPTION_ID,
        ADMIN_ERROR_HINT.LIVE_QUERY_MISSING_SUBSCRIPTION_ID,
      );
      return;
    }
    if (!sql || typeof sql !== TYPEOF.STRING) {
      this.sendError(
        clientInfo,
        null,
        ErrorCode.MALFORMED_JSON,
        ADMIN_ERROR_MESSAGE.LIVE_QUERY_MISSING_SQL,
        ADMIN_ERROR_HINT.LIVE_QUERY_MISSING_SQL,
      );
      return;
    }
    if (!this.liveQueryManager) {
      this.sendError(
        clientInfo,
        null,
        ErrorCode.INTERNAL_ERROR,
        ADMIN_ERROR_MESSAGE.LIVE_QUERY_MANAGER_UNAVAILABLE,
      );
      return;
    }

    try {
      const parsed = parseLiveSelect(sql);
      const selectSql = parsed.isLive ? parsed.sql : sql;
      const parser = new SQLParser(selectSql);
      const ast = parser.parse();

      const registrationResult = {partitions: []};
      const liveClient = {
        id: clientInfo.id,
        send: (data) => {
          const payload =
            typeof data === TYPEOF.STRING ? JSON.parse(data) : data;
          const innerType = payload.type;
          this.sendToClient(clientInfo, {
            type: MessageType.LIVE_QUERY_EVENT,
            subscriptionId,
            eventType: innerType,
            data: payload.row || payload.new || payload.rows || null,
            oldData: payload.old || null,
            queryId: payload.queryId || null,
            partitions: registrationResult.partitions || [],
          });
        },
      };

      const result = await this.liveQueryManager.registerLiveQuery(
        ast,
        liveClient,
      );
      registrationResult.partitions = result.partitions || [];

      clientInfo.liveQueryMap.set(subscriptionId, result.queryId);

      this.sendToClient(clientInfo, {
        type: MessageType.LIVE_QUERY_EVENT,
        subscriptionId,
        queryId: result.queryId,
        partitions: result.partitions,
        expiresAt: result.expiresAt,
      });

      this.logger.info(ADMIN_LOG_MSG.LIVE_QUERY_SUBSCRIBED, {
        clientId: clientInfo.id,
        subscriptionId,
        queryId: result.queryId,
      });
    } catch (error) {
      this.logger.error(ADMIN_LOG_MSG.LIVE_QUERY_SUBSCRIBE_FAILED, {
        clientId: clientInfo.id,
        subscriptionId,
        error: error.message,
      });
      this.sendError(
        clientInfo,
        null,
        ErrorCode.INTERNAL_ERROR,
        `${ADMIN_ERROR_MESSAGE.LIVE_QUERY_PARSE_FAILED}: ${error.message}`,
      );
    }
  }

  /**
   * Handle live query unsubscribe request.
   * @param {Object} clientInfo - Client information.
   * @param {Object} message - Unsubscribe message.
   * @private
   */
  handleLiveQueryUnsubscribe(clientInfo, message) {
    const subscriptionId = message.subscriptionId;
    if (!subscriptionId) {
      return;
    }

    const queryId = clientInfo.liveQueryMap.get(subscriptionId);
    if (queryId && this.liveQueryManager) {
      this.liveQueryManager.unregisterLiveQuery(queryId, clientInfo.id);
      clientInfo.liveQueryMap.delete(subscriptionId);

      this.logger.info(ADMIN_LOG_MSG.LIVE_QUERY_UNSUBSCRIBED, {
        clientId: clientInfo.id,
        subscriptionId,
        queryId,
      });
    }
  }

  /**
   * Handle one dispatchable admin message by first translating to
   * canonical Service_Message envelope.
   * @param {Object} clientInfo - Client information.
   * @param {Object} message - Admin websocket message.
   * @return {Promise<void>}
   * @private
   */
  async handleDispatchableAdminMessage(clientInfo, message) {
    if (!isAdminMessageDispatchable(message.type)) {
      return;
    }

    const envelope = adaptAdminMessageToServiceMessage(message, {
      clientId: clientInfo.id,
      lane: this.resolveAdminClientLane(clientInfo?.lane),
      tenantId: message.tenantId || null,
      principal: message.principal || null,
      traceId: message.traceId || null,
    });
    await this.handleServiceDispatchEnvelope(clientInfo, message, envelope);
  }

  /**
   * Handle dispatchable admin messages through ServiceDispatcher.
   * @param {Object} clientInfo - Client information.
   * @param {Object} message - Admin websocket message.
   * @private
   */
  async handleServiceDispatchMessage(clientInfo, message) {
    const envelope = adaptAdminMessageToServiceMessage(message, {
      clientId: clientInfo.id,
      lane: this.resolveAdminClientLane(clientInfo?.lane),
      tenantId: message.tenantId || null,
      principal: message.principal || null,
      traceId: message.traceId || null,
    });
    return this.handleServiceDispatchEnvelope(clientInfo, message, envelope);
  }

  /**
   * Dispatch one canonical envelope through the shared service dispatcher.
   * @param {Object} clientInfo - Client information.
   * @param {Object} message - Original admin websocket message.
   * @param {Object} envelope - Canonical service-message envelope.
   * @return {Promise<void>}
   * @private
   */
  async handleServiceDispatchEnvelope(clientInfo, message, envelope) {
    const queryId = message.queryId || message.messageId || null;

    try {
      const dispatchResult = await this.serviceDispatcher.dispatch(envelope, {
        clientInfo,
        nodeId: this.nodeId,
        traceId: envelope.traceId || null,
        tenantId: envelope.tenantId || null,
        principal: envelope.principal || null,
      });

      const deliveryPayload = dispatchResult.delivery?.payload || {};
      const operation = dispatchResult.envelope.operation;

      if (operation === ADMIN_SERVICE_OPERATION.GET_CACHE_DUMP) {
        const cacheDump =
          deliveryPayload.cacheDump || deliveryPayload.data || null;
        if (!cacheDump || typeof cacheDump !== TYPEOF.OBJECT) {
          throw new Error(ADMIN_ERROR_MESSAGE.SYSTEM_CACHE_EMPTY);
        }
        this.sendCacheDumpPayload(clientInfo, cacheDump);
        return;
      }

      if (
        deliveryPayload.queryResult &&
        typeof deliveryPayload.queryResult === TYPEOF.OBJECT
      ) {
        this.sendQueryResult(
          clientInfo,
          queryId || envelope.messageId,
          deliveryPayload.queryResult,
        );
        return;
      }

      const deliveryResults = Array.isArray(deliveryPayload.results) ?
        deliveryPayload.results :
        [];
      this.sendQueryResult(clientInfo, queryId || envelope.messageId, {
        operation,
        results: deliveryResults,
        count: deliveryResults.length,
      });
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
   * Resolve unified lifecycle diagnostics report payload.
   * @return {Object|null}
   * @private
   */
  resolveServiceDiagnosticsReport() {
    if (
      !this.serviceDiagnosticsProvider ||
      typeof this.serviceDiagnosticsProvider !== TYPEOF.FUNCTION
    ) {
      return null;
    }

    const report = this.serviceDiagnosticsProvider();
    if (!report || typeof report !== TYPEOF.OBJECT) {
      return null;
    }
    return report;
  }

  /**
   * Handle lifecycle/reconciler diagnostics route.
   * @param {Object} reply
   * @return {Promise<void>}
   * @private
   */
  async handleServiceDiagnostics(reply) {
    const report = this.resolveServiceDiagnosticsReport();
    if (!report) {
      reply
        .code(HTTP_STATUS.SERVICE_UNAVAILABLE)
        .send({error: ADMIN_ERROR_MESSAGE.SERVICE_DIAGNOSTICS_UNAVAILABLE});
      return;
    }

    reply.code(HTTP_STATUS.OK).send({
      nodeId: this.nodeId,
      timestamp: Date.now(),
      diagnostics: report,
    });
  }

  /**
   * Handle local CDC diagnostics route.
   * @param {Object} reply
   * @return {Promise<void>}
   * @private
   */
  async handleCdcDiagnostics(reply) {
    try {
      const diagnostics = this.buildLocalCdcDiagnostics();
      reply.code(HTTP_STATUS.OK).send(diagnostics);
    } catch (error) {
      reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE).send({
        error: error.message,
      });
    }
  }

  /**
   * Handle local partition diagnostics route.
   * @param {Object} reply
   * @return {Promise<void>}
   * @private
   */
  async handlePartitionDiagnostics(reply) {
    try {
      const diagnostics = this.buildLocalPartitionDiagnostics();
      reply.code(HTTP_STATUS.OK).send(diagnostics);
    } catch (error) {
      reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE).send({
        error: error.message,
      });
    }
  }

  /**
   * Handle local SQL diagnostics route.
   * @param {Object} reply
   * @return {Promise<void>}
   * @private
   */
  async handleSqlDiagnostics(reply) {
    try {
      const diagnostics = this.buildLocalSqlDiagnostics();
      reply.code(HTTP_STATUS.OK).send(diagnostics);
    } catch (error) {
      reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE).send({
        error: error.message,
      });
    }
  }

  /**
   * Handle preflight critical-path snapshot diagnostics route.
   * @param {Object} reply
   * @return {Promise<void>}
   * @private
   */
  async handlePreflightCriticalPathSnapshot(reply) {
    try {
      const snapshot = await this.resolvePreflightCriticalPathSnapshot();
      reply.code(HTTP_STATUS.OK).send(snapshot);
    } catch (error) {
      reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE).send({
        error: error.message,
      });
    }
  }

  /**
   * Handle local control snapshot route.
   * @param {Object} request
   * @param {Object} reply
   * @return {Promise<void>}
   * @private
   */
  async handleControlSnapshot(request, reply) {
    const scope = String(
      request?.query?.[ADMIN_CONTROL_SNAPSHOT.QUERY_SCOPE_KEY] ||
        ADMIN_CONTROL_SNAPSHOT.QUERY_SCOPE_LOCAL,
    )
      .trim()
      .toLowerCase();
    if (scope !== ADMIN_CONTROL_SNAPSHOT.QUERY_SCOPE_LOCAL) {
      reply.code(HTTP_STATUS.BAD_REQUEST).send({
        error: ADMIN_ERROR_MESSAGE.CONTROL_SNAPSHOT_SCOPE_UNSUPPORTED,
      });
      return;
    }
    try {
      const snapshot = await this.buildLocalControlSnapshot();
      reply.code(HTTP_STATUS.OK).send(snapshot);
    } catch (error) {
      reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE).send({
        error: error.message,
      });
    }
  }

  /**
   * Handle local service-discovery route.
   * @param {Object} request
   * @param {Object} reply
   * @return {Promise<void>}
   * @private
   */
  async handleServiceDiscovery(request, reply) {
    const protocolAllowlist = parseDiscoveryListQuery(
      request?.query?.[ADMIN_SERVICE_DISCOVERY.QUERY_PROTOCOL_KEY],
    );
    const serviceIdAllowlist = parseDiscoveryListQuery(
      request?.query?.[ADMIN_SERVICE_DISCOVERY.QUERY_SERVICE_ID_KEY],
    );
    const nodeIdAllowlist = parseDiscoveryListQuery(
      request?.query?.[ADMIN_SERVICE_DISCOVERY.QUERY_NODE_ID_KEY],
    );
    const healthyOnly = parseDiscoveryBooleanQuery(
      request?.query?.[ADMIN_SERVICE_DISCOVERY.QUERY_HEALTHY_ONLY_KEY],
      false,
    );
    const unhealthyPolicyRaw =
      request?.query?.[ADMIN_SERVICE_DISCOVERY.QUERY_UNHEALTHY_POLICY_KEY];
    const unhealthyPolicy = String(
      unhealthyPolicyRaw || ENDPOINT_SYNC_UNHEALTHY_POLICY.NOT_READY,
    )
      .trim()
      .toLowerCase();
    const tableName = normalizeIdentifier(
      request?.query?.[ADMIN_SERVICE_DISCOVERY.QUERY_TABLE_NAME_KEY],
    );
    const resolvedUnhealthyPolicy =
      unhealthyPolicy === ENDPOINT_SYNC_UNHEALTHY_POLICY.EXCLUDE ?
        ENDPOINT_SYNC_UNHEALTHY_POLICY.EXCLUDE :
        ENDPOINT_SYNC_UNHEALTHY_POLICY.NOT_READY;

    try {
      const snapshot =
        await this.serviceDiscovery.resolveServiceDiscoverySnapshot({
          protocolAllowlist,
          serviceIdAllowlist,
          nodeIdAllowlist,
          tableName,
          healthyOnly,
          unhealthyPolicy: resolvedUnhealthyPolicy,
        });
      reply.code(HTTP_STATUS.OK).send(snapshot);
    } catch (error) {
      reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE).send({
        error: error.message,
      });
    }
  }

  /**
   * Determine whether one SQL statement requests preflight critical path snapshot.
   * @param {string} sql
   * @return {boolean}
   * @private
   */
  isPreflightCriticalPathSnapshotQuery(sql) {
    return (
      normalizeSql(sql) ===
      normalizeSql(ADMIN_PREFLIGHT_CRITICAL_PATH_SNAPSHOT.QUERY_SQL)
    );
  }

  /**
   * Determine whether one SQL statement requests local control snapshot.
   * @param {string} sql
   * @return {boolean}
   * @private
   */
  isControlSnapshotQuery(sql) {
    return this.parseControlSnapshotQuery(sql).isQuery;
  }

  /**
   * Parse one local control snapshot SQL query.
   * @param {string} sql
   * @return {Object}
   * @private
   */
  parseControlSnapshotQuery(sql) {
    const normalizedSql = normalizeSql(sql);
    if (normalizedSql === normalizeSql(ADMIN_CONTROL_SNAPSHOT.QUERY_SQL)) {
      return {
        isQuery: true,
        forceAuthoritativeRepair: false,
      };
    }
    if (
      normalizedSql ===
      normalizeSql(ADMIN_CONTROL_SNAPSHOT.QUERY_SQL_FORCE_REPAIR)
    ) {
      return {
        isQuery: true,
        forceAuthoritativeRepair: true,
      };
    }
    return {
      isQuery: false,
      forceAuthoritativeRepair: false,
    };
  }

  /**
   * Determine whether one SQL statement requests local service discovery.
   * @param {string} sql
   * @return {boolean}
   * @private
   */
  isServiceDiscoveryQuery(sql) {
    return parseServiceDiscoverySqlQuery(sql).isQuery;
  }

  /**
   * Delegate: build service discovery query result.
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async buildServiceDiscoveryQueryResult(options = {}) {
    return this.serviceDiscovery.buildServiceDiscoveryQueryResult(options);
  }

  /**
   * Delegate: resolve service discovery snapshot.
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async resolveServiceDiscoverySnapshot(options = {}) {
    return this.serviceDiscovery.resolveServiceDiscoverySnapshot(options);
  }

  /**
   * Delegate: build service discovery replica readiness.
   * @param {Object} replica
   * @param {Object} readinessContext
   * @return {Object}
   */
  buildServiceDiscoveryReplicaReadiness(replica, readinessContext) {
    return this.serviceDiscovery.buildServiceDiscoveryReplicaReadiness(
      replica,
      readinessContext,
    );
  }

  /**
   * Delegate: build local preflight critical-path snapshot.
   * @return {Promise<Object>}
   */
  async buildLocalPreflightCriticalPathSnapshot() {
    return this.preflightSnapshot.buildLocalPreflightCriticalPathSnapshot();
  }

  /**
   * Delegate: resolve preflight critical-path snapshot.
   * @return {Promise<Object>}
   */
  async resolvePreflightCriticalPathSnapshot() {
    return this.preflightSnapshot.resolvePreflightCriticalPathSnapshot();
  }

  /**
   * Delegate: build preflight critical-path snapshot query result.
   * @return {Promise<Object>}
   */
  async buildPreflightCriticalPathSnapshotQueryResult() {
    return this.preflightSnapshot.buildPreflightCriticalPathSnapshotQueryResult();
  }

  /**
   * Delegate: build preflight cache freshness summary.
   * @param {Object} options
   * @return {Object}
   */
  buildPreflightCacheFreshnessSummary(options) {
    return this.preflightSnapshot.buildPreflightCacheFreshnessSummary(options);
  }

  /**
   * Delegate: build local control snapshot.
   * @return {Promise<Object>}
   */
  async buildLocalControlSnapshot() {
    if (
      typeof this.controlSnapshot.resolveLocalControlSnapshot ===
      TYPEOF.FUNCTION
    ) {
      return this.controlSnapshot.resolveLocalControlSnapshot();
    }
    return this.controlSnapshot.buildLocalControlSnapshot();
  }

  /**
   * Delegate: build control snapshot leader summary.
   * @param {Array<Object>} partitionRows
   * @param {Array<Object>} serviceRows
   * @return {Object}
   */
  buildControlSnapshotLeaderSummary(partitionRows = [], serviceRows = []) {
    return this.controlSnapshot.buildControlSnapshotLeaderSummary(
      partitionRows,
      serviceRows,
    );
  }

  /**
   * Delegate: build control snapshot voter counts.
   * @param {Array<Object>} serviceRows
   * @return {Object}
   */
  buildControlSnapshotVoterCounts(serviceRows = []) {
    return this.controlSnapshot.buildControlSnapshotVoterCounts(serviceRows);
  }

  /**
   * Delegate: build control snapshot replica operation summary.
   * @param {Array<Object>} replicaOperationRows
   * @param {Object} [options={}]
   * @return {Object}
   */
  buildControlSnapshotReplicaOperationSummary(
    replicaOperationRows = [],
    options = {},
  ) {
    return this.controlSnapshot.buildControlSnapshotReplicaOperationSummary(
      replicaOperationRows,
      options,
    );
  }

  /**
   * Delegate: build local CDC telemetry.
   * @return {Object}
   */
  buildLocalCdcTelemetry() {
    return this.controlSnapshot.buildLocalCdcTelemetry();
  }

  /**
   * Delegate: build local CDC diagnostics.
   * @return {Object}
   */
  buildLocalCdcDiagnostics() {
    return this.controlSnapshot.buildLocalCdcDiagnostics();
  }

  /**
   * Delegate: build local partition diagnostics.
   * @return {Object}
   */
  buildLocalPartitionDiagnostics() {
    return this.controlSnapshot.buildLocalPartitionDiagnostics();
  }

  /**
   * Delegate: build local SQL diagnostics.
   * @return {Object}
   */
  buildLocalSqlDiagnostics() {
    return this.controlSnapshot.buildLocalSqlDiagnostics();
  }

  /**
   * Delegate: build control snapshot query result.
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async buildControlSnapshotQueryResult(options = {}) {
    let attempts = NUM.ZERO;
    while (true) {
      let resultOrError;
      try {
        resultOrError = await this.controlSnapshot.buildControlSnapshotQueryResult(
          options,
        );
      } catch (error) {
        resultOrError = error;
      }

      const decision = evaluateSnapshotRetryDecision(options, attempts, resultOrError);

      if (decision.outcome === SNAPSHOT_RETRY_DECISION.RETRY) {
        attempts += NUM.ONE;
        this.logger.warn(SNAPSHOT_RETRY_LOG_MSG, {
          attempt: attempts,
          reason: decision.reason,
        });

        this.closeStaleSnapshotLaneSockets();

        await new Promise((resolve) => setTimeout(resolve, SNAPSHOT_RETRY_DELAY_MS));
        continue;
      }

      if (decision.outcome === SNAPSHOT_RETRY_DECISION.STOP_FAILURE) {
        if (resultOrError instanceof Error) {
          throw resultOrError;
        }
        return resolveControlSnapshotQueryResult(resultOrError);
      }

      return resolveControlSnapshotQueryResult(resultOrError);
    }
  }

  /**
   * Handle query message.
   * @param {Object} clientInfo - Client information.
   * @param {Object} message - Query message.
   * @private
   */
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
        typeof payload.sql === TYPEOF.STRING ?
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
      sql:
        typeof payload.statement === TYPEOF.STRING ?
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
  async executeSqlRequestWithTimeout(
    sqlRequest,
    timeoutMs = this.queryTimeoutMs,
  ) {
    if (
      !this.sqlQueryEngine ||
      typeof this.sqlQueryEngine.executeRequest !== TYPEOF.FUNCTION
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
    const operation =
      typeof result?.operation === TYPEOF.STRING ?
        result.operation.trim().toLowerCase() :
        EMPTY_STRING;
    const hasAffectedRows = Number.isFinite(Number(result?.affectedRows));
    const hasRowPayload =
      result.rows !== undefined || result.results !== undefined;
    if (result.success === false) {
      return {kind: QUERY_RESULT_MESSAGE_KIND.ERROR, hasRowPayload};
    } else if (
      result.hostResult ||
      result.executionMode === EXECUTION_MODE.PARTITION_CALLBACK
    ) {
      return {kind: QUERY_RESULT_MESSAGE_KIND.HOST_CALLBACK, hasRowPayload};
    } else if (QUERY_RESULT_WRITE_OPERATIONS.has(operation) || hasAffectedRows) {
      return {kind: QUERY_RESULT_MESSAGE_KIND.WRITE, hasRowPayload};
    } else if (hasRowPayload) {
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
    message.count =
      result.count !== undefined ? result.count : message.results.length;
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
      this.sendCacheDumpPayload(
        clientInfo,
        this.executeLocalCacheDumpEnvelope(),
      );
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

    if (
      message.includes(ADMIN_ERROR_MATCH.PARSE) ||
      message.includes(ADMIN_ERROR_MATCH.SYNTAX)
    ) {
      return ErrorCode.SYNTAX_ERROR;
    }
    if (
      message.includes(ADMIN_ERROR_MATCH.TABLE_NOT_FOUND) ||
      message.includes(ADMIN_ERROR_MATCH.TABLE_NOT_FOUND_CODE)
    ) {
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
    const resolvedControlPlaneReadinessService =
      resolveSqlEngineControlPlaneReadinessService(engine);
    this.controlPlaneReadinessService =
      resolvePreferredControlPlaneReadinessService(
        this.controlPlaneReadinessService,
        resolvedControlPlaneReadinessService,
      );
    if (this.controlSnapshot) {
      this.controlSnapshot.sqlQueryEngine = engine || null;
      this.controlSnapshot.controlPlaneReadinessService =
        resolvePreferredControlPlaneReadinessService(
          this.controlSnapshot.controlPlaneReadinessService,
          this.controlPlaneReadinessService,
        );
    }
    if (this.preflightSnapshot) {
      this.preflightSnapshot.sqlQueryEngine = engine || null;
    }
    if (
      this.liveQueryManager &&
      typeof this.liveQueryManager.initialize === TYPEOF.FUNCTION
    ) {
      this.liveQueryManager.initialize({
        sqlQueryEngine: engine,
      });
    }
    if (
      this.debugMetadataStore &&
      typeof this.debugMetadataStore.setSqlQueryEngine === TYPEOF.FUNCTION
    ) {
      this.debugMetadataStore.setSqlQueryEngine(engine);
      return;
    }
    if (!this.debugMetadataStore && engine) {
      this.debugMetadataStore = new DebugMetadataStore({
        sqlQueryEngine: engine,
      });
      this.debugHandlers.debugMetadataStore = this.debugMetadataStore;
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

export {
  AdminWebSocketAPISegment3,
  AdminWebSocketAPISegment3 as AdminWebSocketAPI,
  MessageType,
  ErrorCode,
};
