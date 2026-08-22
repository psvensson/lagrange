import {CLUSTER_CONTROL_SNAPSHOT_ADMIN_LAYER} from './cluster-control-snapshot-admin-layer.js';
import {ADMIN_ROUTE} from '../../../src/admin/admin-constants.js';
const {
  ADMIN_HEALTH_PATH,
  ADMIN_QUERY_TIMEOUT_MS,
  ADMIN_QUERY_TRACE_MAX_ENTRIES,
  ADMIN_QUERY_TRACE_OUTCOME_ERROR,
  ADMIN_QUERY_TRACE_OUTCOME_OK,
  ADMIN_QUERY_TRACE_OUTCOME_PENDING,
  ADMIN_QUERY_TRACE_OUTCOME_TIMEOUT,
  ADMIN_QUERY_TRACE_UNKNOWN,
  ADMIN_SOCKET_LANE_DEFAULT,
  ADMIN_SOCKET_LANE_PROBE,
  ADMIN_SOCKET_LANE_SNAPSHOT,
  ADMIN_STREAM_PATH,
  BOOTSTRAP_HEALTH_PATH,
  BOOTSTRAP_JOIN_READY_PATH,
  BOOTSTRAP_TRAFFIC_READY_PATH,
  BOOTSTRAP_WAIT_REQUEST_TIMEOUT_MS,
  CDC_EVENT_MESSAGE_TYPE,
  FETCH_TIMEOUT_MS,
  HTTP_METHOD_GET,
  HTTP_OK_LOWER,
  HTTP_OK_UPPER,
  INACTIVE_STATE,
  LIVE_QUERY_EVENT_MESSAGE_TYPE,
  LIVE_QUERY_INITIAL_MESSAGE_TYPE,
  LOGS_TABLE_NAME,
  LOG_SUBSCRIPTION_CAPABILITY,
  MIN_TIMEOUT_MS,
  NODE_CLIENT_CONTROL_SNAPSHOT_FORCE_REPAIR_SQL,
  NODE_CLIENT_CONTROL_SNAPSHOT_SQL,
  NODE_CLIENT_SERVICE_DISCOVERY_SQL,
  NODE_CLIENT_SERVICE_ID_ADMIN_META,
  PARTITION_CALLBACK_MESSAGE_TYPE,
  PORTS,
  QUERY_MESSAGE_TYPE,
  QUERY_RESULT_MESSAGE_TYPE,
  REACHABILITY_PROBE_SQL,
  REACHABILITY_SOURCE_ADMIN_HEALTH,
  REACHABILITY_SOURCE_ADMIN_WS,
  REACHABILITY_SOURCE_BOOTSTRAP_HEALTH,
  REACHABILITY_SOURCE_SQL_PROBE,
  SERVICE_DISCOVERY_READINESS_ROUTING_READY_FIELD,
  SERVICE_DISCOVERY_REPLICAS_FIELD,
  SERVICE_DISCOVERY_REPLICA_NODE_ID_FIELD,
  SERVICE_DISCOVERY_REPLICA_READINESS_FIELD,
  SERVICE_DISCOVERY_REPLICA_SERVICE_ID_FIELD,
  SERVICE_DISCOVERY_SERVICES_FIELD,
  SERVICE_DISCOVERY_SERVICE_IDS_FIELD,
  STATUS_ACTIVE_LOWER,
  WS_READY_STATE_CONNECTING,
  WS_READY_STATE_OPEN,
  ZERO,
  buildAdminStatementFingerprint,
  buildAdminStatementPreview,
  buildHealthProbeResult,
  closeWebSocketSafely,
  createProbeResult,
  httpGet,
  httpRequest,
  isControlPlaneRecoveryReadyProbe,
  isTimeoutErrorMessage,
  normalizeAdminQueryError,
  normalizeProbeError,
  normalizeReadinessProbeResult,
  resolveAdminRequestStatement,
  resolvePositiveTimeoutMs,
  shouldFallbackToForcedControlSnapshot,
  withTimeout,
} = CLUSTER_CONTROL_SNAPSHOT_ADMIN_LAYER;

const REACHABILITY_HTTP_STAGE_TIMEOUT_CAP_MS = 1000;
const REACHABILITY_HTTP_PROBE_TIMEOUT_MS = Math.max(
  MIN_TIMEOUT_MS,
  Math.min(FETCH_TIMEOUT_MS, REACHABILITY_HTTP_STAGE_TIMEOUT_CAP_MS),
);
const REACHABILITY_ADMIN_PROBE_TIMEOUT_MS = FETCH_TIMEOUT_MS;
const ADMIN_QUERY_CONNECTION_RESET_PREFIX =
  'Admin API query connection reset for node ';
const ADMIN_QUERY_CONNECTION_RESET_LANE_TEXT = ' on lane ';
const SUPPRESSED_BEST_EFFORT_ERROR_INCREMENT = 1;
const PROCESS_RESOURCE_DIAGNOSTICS_UNAVAILABLE_PREFIX =
  'Process resource diagnostics unavailable for node ';
const PROCESS_RESOURCE_DIAGNOSTICS_INVALID_PREFIX =
  'Process resource diagnostics invalid for node ';
const numberConstructor = Number;
const numberIsFinite = Number.isFinite;
const stringConstructor = String;

function requiredProcessResourceCounter(value, nodeId, field) {
  const numeric = numberConstructor(value);
  if (!numberIsFinite(numeric) || numeric < ZERO) {
    throw new Error(
      PROCESS_RESOURCE_DIAGNOSTICS_INVALID_PREFIX + nodeId + ': ' + field,
    );
  }
  return numeric;
}

function normalizeProcessResourceDiagnostics(body, expectedNodeId) {
  if (
    !body ||
    typeof body !== 'object' ||
    body.nodeId !== expectedNodeId
  ) {
    throw new Error(
      PROCESS_RESOURCE_DIAGNOSTICS_INVALID_PREFIX +
        expectedNodeId + ': node identity',
    );
  }
  const latest = body?.diagnostics?.resources?.latest;
  const processSnapshot = latest?.process;
  if (
    !latest ||
    typeof latest !== 'object' ||
    !processSnapshot ||
    typeof processSnapshot !== 'object'
  ) {
    throw new Error(
      PROCESS_RESOURCE_DIAGNOSTICS_INVALID_PREFIX +
        expectedNodeId + ': resource sample',
    );
  }
  return {
    nodeId: expectedNodeId,
    capturedAt: requiredProcessResourceCounter(
      latest.timestamp,
      expectedNodeId,
      'timestamp',
    ),
    process: {
      rssBytes: requiredProcessResourceCounter(
        processSnapshot.rssBytes,
        expectedNodeId,
        'rssBytes',
      ),
      heapUsedBytes: requiredProcessResourceCounter(
        processSnapshot.heapUsedBytes,
        expectedNodeId,
        'heapUsedBytes',
      ),
      heapTotalBytes: requiredProcessResourceCounter(
        processSnapshot.heapTotalBytes,
        expectedNodeId,
        'heapTotalBytes',
      ),
      externalBytes: requiredProcessResourceCounter(
        processSnapshot.externalBytes,
        expectedNodeId,
        'externalBytes',
      ),
      arrayBuffersBytes: requiredProcessResourceCounter(
        processSnapshot.arrayBuffersBytes,
        expectedNodeId,
        'arrayBuffersBytes',
      ),
    },
  };
}

function resolveReachabilityProbeTimeoutMs(remainingBudgetMs, maxTimeoutMs) {
  const remainingMs = resolvePositiveTimeoutMs(
    remainingBudgetMs,
    MIN_TIMEOUT_MS,
  );
  const boundedMaxMs = resolvePositiveTimeoutMs(
    maxTimeoutMs,
    remainingMs,
  );
  return Math.min(remainingMs, boundedMaxMs);
}

/**
 * Lightweight handle for interacting with a single cluster node.
 */
class NodeHandle {
  constructor(
    id,
    containerId,
    ip,
    role,
    dockerProvider,
    adminApiPort = PORTS.ADMIN_API,
    options = {},
  ) {
    this.id = id;
    this.containerId = containerId;
    this.ip = ip;
    this.role = role;
    this._dockerProvider = dockerProvider;
    this._adminApiPort = adminApiPort;
    // REST port override for host-network mode (each node binds a per-node
    // port on the host NIC). Defaults to the standard port for bridge mode.
    this._restPort = Number.isInteger(options.restPort) ?
      options.restPort :
      PORTS.REST;
    this._adminSocketByLane = new Map();
    this._adminSocketReadyByLane = new Map();
    this._pendingAdminSocketByLane = new Map();
    this._pendingQueriesByLane = new Map();
    this._adminQueryTrace = [];
    this._suppressedBestEffortErrorCount = ZERO;
    this._logStreamListeners = new Set();
    this._lastReachabilityDiagnostics = null;
    this._defaultAdminQueryTimeoutMs = resolvePositiveTimeoutMs(
      options.adminQueryTimeoutMs,
      ADMIN_QUERY_TIMEOUT_MS,
    );
  }

  _resolveAdminQueryTimeoutMs(timeoutMs) {
    return resolvePositiveTimeoutMs(
      timeoutMs,
      this._defaultAdminQueryTimeoutMs,
    );
  }

  _recordSuppressedBestEffortError() {
    this._suppressedBestEffortErrorCount +=
      SUPPRESSED_BEST_EFFORT_ERROR_INCREMENT;
  }

  /**
   * Query the Admin API via WebSocket.
   * Connects to ws://{ip}:8081/api/admin/stream, sends SQL,
   * returns results.
   */
  async query(sql, params = []) {
    return this.queryWithTimeout(sql, params, {
      timeoutMs: this._defaultAdminQueryTimeoutMs,
    });
  }

  /**
   * Query the Admin API via WebSocket with request timeout override.
   * @param {string} sql
   * @param {Array<*>} [params]
   * @param {Object} [options]
   * @param {number} [options.timeoutMs]
   * @returns {Promise<Object>}
   */
  async queryWithTimeout(sql, params = [], options = {}) {
    const lane = this._resolveAdminLane(options);
    const timeoutMs = this._resolveAdminQueryTimeoutMs(options.timeoutMs);
    return this._sendAdminRequest(
      {
        type: QUERY_MESSAGE_TYPE,
        sql,
        params: Array.isArray(params) ? params : [],
        timeoutMs,
        ignorePreRestart: options.ignorePreRestart === true,
      },
      'query',
      {
        ...options,
        timeoutMs,
        lane,
      },
    );
  }

  /**
   * Execute a partition callback via Admin API WebSocket.
   * @param {Object} payload
   * @param {string} payload.statement - SELECT statement.
   * @param {Array<*>} [payload.parameters] - Bind parameters.
   * @param {string} payload.callbackModuleRef - Module reference.
   * @param {string} payload.callbackExport - Callback export.
   * @param {string} payload.runtimeKind - Runtime kind.
   * @returns {Promise<Object>} Callback execution result payload.
   */
  async partitionCallback(payload) {
    if (!payload || typeof payload !== 'object') {
      throw new Error(
        'Partition callback payload must be an object for node ' + this.id,
      );
    }
    return this._sendAdminRequest(
      {
        type: PARTITION_CALLBACK_MESSAGE_TYPE,
        statement: payload.statement,
        parameters: Array.isArray(payload.parameters) ? payload.parameters : [],
        callbackModuleRef: payload.callbackModuleRef,
        callbackExport: payload.callbackExport,
        runtimeKind: payload.runtimeKind,
      },
      'partition callback',
    );
  }

  _resolveAdminLane(options = {}) {
    const lane = typeof options?.lane === 'string' ? options.lane.trim() : '';
    return lane.length > 0 ? lane : ADMIN_SOCKET_LANE_DEFAULT;
  }

  _getPendingQueries(lane) {
    if (!this._pendingQueriesByLane.has(lane)) {
      this._pendingQueriesByLane.set(lane, new Map());
    }
    return this._pendingQueriesByLane.get(lane);
  }

  /**
   * Return recent admin query trace entries for diagnostics.
   * @returns {Array<Object>}
   */
  getAdminQueryTraceSnapshot() {
    return this._adminQueryTrace.map((entry) => ({
      nodeId: entry.nodeId,
      queryId: entry.queryId,
      lane: entry.lane,
      requestType: entry.requestType,
      operation: entry.operation,
      statementPreview: entry.statementPreview,
      statementFingerprint: entry.statementFingerprint,
      timeoutMs: entry.timeoutMs,
      startedAtMs: entry.startedAtMs,
      socketReadyAtMs: entry.socketReadyAtMs,
      sentAtMs: entry.sentAtMs,
      resolvedAtMs: entry.resolvedAtMs,
      timeoutAtMs: entry.timeoutAtMs,
      erroredAtMs: entry.erroredAtMs,
      durationMs: entry.durationMs,
      rowCount: entry.rowCount,
      outcome: entry.outcome,
      error: entry.error,
    }));
  }

  /**
   * Send one request over the shared admin socket and await query_result.
   * @param {Object} requestPayload
   * @param {string} operationLabel
   * @returns {Promise<Object>}
   * @private
   */
  async _sendAdminRequest(requestPayload, operationLabel, options = {}) {
    const requestTimeoutMs = this._resolveAdminQueryTimeoutMs(
      options.timeoutMs,
    );
    const lane = this._resolveAdminLane(options);
    const queryId = this._nextQueryId();
    const timeoutMessage =
      'Admin API ' +
      operationLabel +
      ' timed out for node ' +
      this.id +
      ' on lane ' +
      lane +
      ' after ' +
      requestTimeoutMs +
      'ms';
    const traceEntry = this._createAdminQueryTraceEntry({
      queryId,
      lane,
      requestPayload,
      operationLabel,
      timeoutMs: requestTimeoutMs,
    });
    let ws = null;
    try {
      ws = await withTimeout(
        this._getAdminSocket(lane),
        requestTimeoutMs,
        timeoutMessage,
      );
      traceEntry.socketReadyAtMs = Date.now();
    } catch (error) {
      const errorMessage = normalizeAdminQueryError(error);
      const outcome = isTimeoutErrorMessage(errorMessage) ?
        ADMIN_QUERY_TRACE_OUTCOME_TIMEOUT :
        ADMIN_QUERY_TRACE_OUTCOME_ERROR;
      this._finalizeAdminQueryTrace(traceEntry, outcome, {
        error: errorMessage,
      });
      throw error;
    }
    const pendingQueries = this._getPendingQueries(lane);

    return new Promise((resolve, reject) => {
      const rejectWithOutcome = (
        error,
        outcome = ADMIN_QUERY_TRACE_OUTCOME_ERROR,
      ) => {
        const normalizedError =
          error instanceof Error ?
            error :
            new Error(normalizeAdminQueryError(error));
        this._finalizeAdminQueryTrace(traceEntry, outcome, {
          error: normalizeAdminQueryError(normalizedError),
        });
        reject(normalizedError);
      };
      const resolveWithTrace = (result) => {
        const rowCount = Array.isArray(result?.rows) ?
          result.rows.length :
          null;
        this._finalizeAdminQueryTrace(
          traceEntry,
          ADMIN_QUERY_TRACE_OUTCOME_OK,
          {
            rowCount,
          },
        );
        resolve(result);
      };

      const timeout = setTimeout(() => {
        pendingQueries.delete(queryId);
        rejectWithOutcome(
          new Error(timeoutMessage),
          ADMIN_QUERY_TRACE_OUTCOME_TIMEOUT,
        );
      }, requestTimeoutMs);

      pendingQueries.set(queryId, {
        resolve: resolveWithTrace,
        reject: (error) => rejectWithOutcome(error),
        timeout,
        operationLabel,
      });

      try {
        ws.send(
          JSON.stringify({
            ...requestPayload,
            queryId,
          }),
        );
        traceEntry.sentAtMs = Date.now();
      } catch (err) {
        pendingQueries.delete(queryId);
        clearTimeout(timeout);
        this._resetAdminSocket(lane);
        try {
          ws.close();
        } catch (_closeErr) {
          this._recordSuppressedBestEffortError();
        }
        rejectWithOutcome(
          new Error(
            'Admin API ' +
              operationLabel +
              ' failed for node ' +
              this.id +
              ' on lane ' +
              lane +
              ': ' +
              err.message,
          ),
        );
      }
    });
  }

  /**
   * Build stable request IDs for admin socket requests.
   * @returns {string}
   * @private
   */
  _nextQueryId() {
    return 'q-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  }

  _createAdminQueryTraceEntry(options = {}) {
    const requestPayload = options.requestPayload;
    const statement = resolveAdminRequestStatement(requestPayload);
    const requestType =
      typeof requestPayload?.type === 'string' &&
      requestPayload.type.length > ZERO ?
        requestPayload.type :
        ADMIN_QUERY_TRACE_UNKNOWN;
    return {
      nodeId: this.id,
      queryId: options.queryId,
      lane: options.lane,
      requestType,
      operation:
        typeof options.operationLabel === 'string' &&
        options.operationLabel.length > ZERO ?
          options.operationLabel :
          ADMIN_QUERY_TRACE_UNKNOWN,
      statementPreview: buildAdminStatementPreview(statement),
      statementFingerprint: buildAdminStatementFingerprint(statement),
      timeoutMs: Number.isFinite(options.timeoutMs) ?
        Math.floor(options.timeoutMs) :
        null,
      startedAtMs: Date.now(),
      socketReadyAtMs: null,
      sentAtMs: null,
      resolvedAtMs: null,
      timeoutAtMs: null,
      erroredAtMs: null,
      durationMs: null,
      rowCount: null,
      outcome: ADMIN_QUERY_TRACE_OUTCOME_PENDING,
      error: null,
      finalized: false,
    };
  }

  _finalizeAdminQueryTrace(traceEntry, outcome, details = {}) {
    if (!traceEntry || traceEntry.finalized === true) {
      return;
    }
    const finalizedAtMs = Date.now();
    traceEntry.finalized = true;
    traceEntry.outcome = outcome;
    traceEntry.durationMs = finalizedAtMs - traceEntry.startedAtMs;
    traceEntry.error =
      typeof details.error === 'string' && details.error.length > ZERO ?
        details.error :
        null;
    if (Number.isInteger(details.rowCount) && details.rowCount >= ZERO) {
      traceEntry.rowCount = details.rowCount;
    }
    if (outcome === ADMIN_QUERY_TRACE_OUTCOME_OK) {
      traceEntry.resolvedAtMs = finalizedAtMs;
    } else if (outcome === ADMIN_QUERY_TRACE_OUTCOME_TIMEOUT) {
      traceEntry.timeoutAtMs = finalizedAtMs;
    } else if (outcome === ADMIN_QUERY_TRACE_OUTCOME_ERROR) {
      traceEntry.erroredAtMs = finalizedAtMs;
    }
    this._recordAdminQueryTrace(traceEntry);
  }

  _recordAdminQueryTrace(traceEntry) {
    this._adminQueryTrace.push(traceEntry);
    const overflowCount =
      this._adminQueryTrace.length - ADMIN_QUERY_TRACE_MAX_ENTRIES;
    if (overflowCount > ZERO) {
      this._adminQueryTrace.splice(ZERO, overflowCount);
    }
  }

  /**
   * Close the long-lived Admin API WebSocket connection.
   */
  closeQueryConnection() {
    this._rejectPendingQueries(
      'Admin API query connection closed for node ' + this.id,
    );
    this._logStreamListeners.clear();
    for (const socket of this._adminSocketByLane.values()) {
      try {
        socket.close();
      } catch (_err) {
        this._recordSuppressedBestEffortError();
      }
    }
    for (const pendingSocket of this._pendingAdminSocketByLane.values()) {
      if (
        pendingSocket &&
        pendingSocket.readyState === WS_READY_STATE_CONNECTING
      ) {
        closeWebSocketSafely(pendingSocket);
      }
    }
    this._resetAdminSocket();
  }

  /**
   * Subscribe to streamed logs delivered on the Admin API socket.
   * Listener receives log rows from cdc_event/live_query frames.
   * Returns an unsubscribe callback.
   * @param {Function} listener
   * @returns {Promise<Function>}
   */
  async subscribeLogStream(listener) {
    if (typeof listener !== 'function') {
      throw new Error(
        'Log stream listener must be a function for node ' + this.id,
      );
    }
    this._logStreamListeners.add(listener);
    try {
      await this._getAdminSocket();
    } catch (err) {
      this._logStreamListeners.delete(listener);
      throw err;
    }
    return () => {
      this._logStreamListeners.delete(listener);
    };
  }

  /**
   * Advertise harness log-subscription capabilities for this node.
   * LIVE SELECT is disabled to avoid parser-noise on unsupported syntax;
   * streaming events come from the admin socket.
   * @returns {{streamEvents: boolean, liveSelectQuery: boolean}}
   */
  getLogSubscriptionCapabilities() {
    return {
      [LOG_SUBSCRIPTION_CAPABILITY.STREAM_EVENTS]: true,
      [LOG_SUBSCRIPTION_CAPABILITY.LIVE_SELECT_QUERY]: false,
    };
  }

  async _getAdminSocket(lane = ADMIN_SOCKET_LANE_DEFAULT) {
    const existingSocket = this._adminSocketByLane.get(lane);
    if (existingSocket && existingSocket.readyState === WS_READY_STATE_OPEN) {
      return existingSocket;
    }
    const pendingReadyPromise = this._adminSocketReadyByLane.get(lane);
    if (pendingReadyPromise) {
      return pendingReadyPromise;
    }

    const {default: WebSocket} = await import('ws');
    const laneQuery = encodeURIComponent(
      String(lane || ADMIN_SOCKET_LANE_DEFAULT),
    );
    const url =
      'ws://' +
      this.ip +
      ':' +
      this._adminApiPort +
      ADMIN_STREAM_PATH +
      '?lane=' +
      laneQuery;

    const readyPromise = new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this._pendingAdminSocketByLane.set(lane, ws);
      let settled = false;
      const connectTimeout = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        ws.off('open', onOpen);
        ws.off('error', onOpenError);
        closeWebSocketSafely(ws);
        this._resetAdminSocket(lane);
        reject(
          new Error(
            'Admin API query failed for node ' +
              this.id +
              ' on lane ' +
              lane +
              ': connection timed out',
          ),
        );
      }, ADMIN_QUERY_TIMEOUT_MS);
      if (typeof connectTimeout.unref === 'function') {
        connectTimeout.unref();
      }

      const onOpen = () => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(connectTimeout);
        ws.off('error', onOpenError);
        this._pendingAdminSocketByLane.delete(lane);
        this._bindAdminSocketHandlers(ws, lane);
        this._adminSocketByLane.set(lane, ws);
        resolve(ws);
      };

      const onOpenError = (err) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(connectTimeout);
        ws.off('open', onOpen);
        this._pendingAdminSocketByLane.delete(lane);
        this._resetAdminSocket(lane);
        reject(
          new Error(
            'Admin API query failed for node ' +
              this.id +
              ' on lane ' +
              lane +
              ': ' +
              err.message,
          ),
        );
      };

      ws.once('open', onOpen);
      ws.once('error', onOpenError);
    });
    this._adminSocketReadyByLane.set(lane, readyPromise);

    try {
      return await readyPromise;
    } catch (err) {
      this._resetAdminSocket(lane);
      throw err;
    }
  }

  _bindAdminSocketHandlers(ws, lane) {
    ws.on('message', (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        this._handleAdminSocketMessage(parsed, lane);
      } catch (_err) {
        this._recordSuppressedBestEffortError();
      }
    });

    ws.on('error', (err) => {
      this._rejectPendingQueries(
        'Admin API query failed for node ' +
          this.id +
          ' on lane ' +
          lane +
          ': ' +
          err.message,
        lane,
      );
      this._resetAdminSocket(lane);
    });

    ws.on('close', () => {
      const closeTimeout = setTimeout(() => {
        if (this._adminSocketByLane.get(lane) === ws) {
          this._rejectPendingQueries(
            'Admin API query connection closed before response ' +
              'for node ' +
              this.id +
              ' on lane ' +
              lane,
            lane,
          );
          this._resetAdminSocket(lane);
        }
      }, 2000);
      if (typeof closeTimeout.unref === 'function') {
        closeTimeout.unref();
      }
    });
  }

  _handleAdminSocketMessage(parsed, lane) {
    if (!parsed || typeof parsed !== 'object') {
      return;
    }
    if (parsed.type === QUERY_RESULT_MESSAGE_TYPE) {
      this._resolvePendingQuery(parsed, lane);
      return;
    }
    this._handleStreamedLogMessage(parsed);
  }

  _resolvePendingQuery(parsed, lane) {
    const queryId = parsed.queryId;
    if (!queryId) {
      return;
    }

    const pendingQueries = this._getPendingQueries(lane);
    const pending = pendingQueries.get(queryId);
    if (!pending) {
      return;
    }
    pendingQueries.delete(queryId);
    clearTimeout(pending.timeout);

    if (parsed.error) {
      const error = new Error(
        'Admin API ' +
          (pending.operationLabel || 'request') +
          ' failed for node ' +
          this.id +
          ' on lane ' +
          lane +
          ': ' +
          parsed.error,
      );
      if (
        typeof parsed.errorCode === 'string' &&
        parsed.errorCode.length > ZERO
      ) {
        error.code = parsed.errorCode.toLowerCase();
      }
      if (typeof parsed.hint === 'string' && parsed.hint.length > ZERO) {
        error.hint = parsed.hint;
      }
      if (parsed.deferRetry === true) {
        error.deferRetry = true;
      }
      if (Number.isFinite(parsed.retryAfterMs)) {
        error.retryAfterMs = Math.max(ZERO, Math.floor(parsed.retryAfterMs));
      }
      if (typeof parsed.outcome === 'string' && parsed.outcome.length > ZERO) {
        error.outcome = parsed.outcome;
      }
      if (
        typeof parsed.visibilityState === 'string' &&
        parsed.visibilityState.length > ZERO
      ) {
        error.visibilityState = parsed.visibilityState;
      }
      if (
        typeof parsed.contractState === 'string' &&
        parsed.contractState.length > ZERO
      ) {
        error.contractState = parsed.contractState;
      }
      if (
        typeof parsed.nextAction === 'string' &&
        parsed.nextAction.length > ZERO
      ) {
        error.nextAction = parsed.nextAction;
      }
      if (parsed.authoritativeVisibilityConfirmed === true) {
        error.authoritativeVisibilityConfirmed = true;
      }
      if (
        typeof parsed.reasonCode === 'string' &&
        parsed.reasonCode.length > ZERO
      ) {
        error.reasonCode = parsed.reasonCode;
      }
      if (Array.isArray(parsed.reasonCodes)) {
        error.reasonCodes = [...parsed.reasonCodes];
      }
      if (Array.isArray(parsed.failedDimensions)) {
        error.failedDimensions = [...parsed.failedDimensions];
      }
      if (
        parsed.runtimeAuthority &&
        typeof parsed.runtimeAuthority === 'object'
      ) {
        error.runtimeAuthority = parsed.runtimeAuthority;
      }
      pending.reject(error);
      return;
    }

    pending.resolve({
      rows: Array.isArray(parsed.results) ? parsed.results : [],
      count: parsed.count,
      partitions: parsed.partitions,
      tableName: parsed.tableName,
      operation: parsed.operation,
      affectedRows: parsed.affectedRows,
      writeReceipt: parsed.writeReceipt,
      readAuthorityWitnesses: parsed.readAuthorityWitnesses,
      hostResult: parsed.hostResult,
      callbackModuleRef: parsed.callbackModuleRef,
      callbackExport: parsed.callbackExport,
      warning: parsed.warning,
      outcome: typeof parsed.outcome === 'string' ? parsed.outcome : undefined,
      visibilityState:
        typeof parsed.visibilityState === 'string' ?
          parsed.visibilityState :
          undefined,
      contractState:
        typeof parsed.contractState === 'string' ?
          parsed.contractState :
          undefined,
      nextAction:
        typeof parsed.nextAction === 'string' ? parsed.nextAction : undefined,
      authoritativeVisibilityConfirmed:
        parsed.authoritativeVisibilityConfirmed === true,
      reasonCode:
        typeof parsed.reasonCode === 'string' ? parsed.reasonCode : undefined,
      reasonCodes: Array.isArray(parsed.reasonCodes) ?
        [...parsed.reasonCodes] :
        undefined,
      failedDimensions: Array.isArray(parsed.failedDimensions) ?
        [...parsed.failedDimensions] :
        undefined,
      runtimeAuthority:
        parsed.runtimeAuthority && typeof parsed.runtimeAuthority === 'object' ?
          parsed.runtimeAuthority :
          undefined,
    });
  }

  _handleStreamedLogMessage(parsed) {
    if (this._logStreamListeners.size === 0) {
      return;
    }

    if (parsed.type === CDC_EVENT_MESSAGE_TYPE) {
      if (parsed.table !== LOGS_TABLE_NAME || !parsed.record) {
        return;
      }
      this._emitLogStreamEntry(parsed.record);
      return;
    }

    if (parsed.type === LIVE_QUERY_INITIAL_MESSAGE_TYPE) {
      const rows = Array.isArray(parsed.data) ? parsed.data : [];
      for (const row of rows) {
        this._emitLogStreamEntry(row);
      }
      return;
    }

    if (parsed.type !== LIVE_QUERY_EVENT_MESSAGE_TYPE) {
      return;
    }

    const payload =
      parsed.record ||
      parsed.row ||
      parsed.data ||
      parsed.new ||
      parsed.old ||
      null;

    if (Array.isArray(payload)) {
      for (const row of payload) {
        this._emitLogStreamEntry(row);
      }
      return;
    }

    this._emitLogStreamEntry(payload);
  }

  _emitLogStreamEntry(entry) {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    for (const listener of this._logStreamListeners) {
      try {
        listener(entry);
      } catch (_err) {
        this._recordSuppressedBestEffortError();
      }
    }
  }

  _rejectPendingQueries(message, lane = null) {
    if (lane !== null) {
      const pendingQueries = this._pendingQueriesByLane.get(lane);
      if (!pendingQueries) {
        return;
      }
      for (const pending of pendingQueries.values()) {
        clearTimeout(pending.timeout);
        pending.reject(new Error(message));
      }
      pendingQueries.clear();
      return;
    }
    for (const pendingQueries of this._pendingQueriesByLane.values()) {
      for (const pending of pendingQueries.values()) {
        clearTimeout(pending.timeout);
        pending.reject(new Error(message));
      }
      pendingQueries.clear();
    }
  }

  _resetAdminSocket(lane = null) {
    if (lane !== null) {
      const socket = this._adminSocketByLane.get(lane);
      const pendingSocket = this._pendingAdminSocketByLane.get(lane);
      this._rejectPendingQueries(
        ADMIN_QUERY_CONNECTION_RESET_PREFIX +
          this.id +
          ADMIN_QUERY_CONNECTION_RESET_LANE_TEXT +
          lane,
        lane,
      );
      this._adminSocketByLane.delete(lane);
      this._adminSocketReadyByLane.delete(lane);
      this._pendingAdminSocketByLane.delete(lane);
      closeWebSocketSafely(socket);
      if (pendingSocket !== socket) {
        closeWebSocketSafely(pendingSocket);
      }
      return;
    }
    this._rejectPendingQueries(
      ADMIN_QUERY_CONNECTION_RESET_PREFIX + this.id,
    );
    for (const socket of this._adminSocketByLane.values()) {
      closeWebSocketSafely(socket);
    }
    for (const pendingSocket of this._pendingAdminSocketByLane.values()) {
      closeWebSocketSafely(pendingSocket);
    }
    this._adminSocketByLane.clear();
    this._adminSocketReadyByLane.clear();
    this._pendingAdminSocketByLane.clear();
    this._pendingQueriesByLane.clear();
  }

  /** Get node status from Admin API. */
  async getStatus(options = {}) {
    const lane =
      typeof options?.lane === 'string' ?
        options.lane :
        ADMIN_SOCKET_LANE_PROBE;
    const timeoutMs = this._resolveAdminQueryTimeoutMs(options?.timeoutMs);
    const discoverySnapshot = await this.queryWithTimeout(
      NODE_CLIENT_SERVICE_DISCOVERY_SQL,
      [],
      {
        lane,
        timeoutMs,
      },
    );
    const routingReady = this._resolveAdminRoutingReadiness(discoverySnapshot);
    return {
      rows: [
        {
          status: routingReady ? STATUS_ACTIVE_LOWER : INACTIVE_STATE,
        },
      ],
    };
  }

  /** Read the node-owned process resource sample from its diagnostics route. */
  async getProcessResourceDiagnostics(options = {}) {
    const timeoutMs = resolvePositiveTimeoutMs(
      options.timeoutMs,
      FETCH_TIMEOUT_MS,
    );
    const url = 'http://' + this.ip + ':' + this._adminApiPort +
      ADMIN_ROUTE.SERVICE_DIAGNOSTICS;
    const response = await httpRequest({
      url,
      timeoutMs,
      method: HTTP_METHOD_GET,
      includeBody: true,
    });
    if (
      response?.status < HTTP_OK_LOWER ||
      response?.status > HTTP_OK_UPPER
    ) {
      throw new Error(
        PROCESS_RESOURCE_DIAGNOSTICS_UNAVAILABLE_PREFIX + this.id +
          ' (status=' + stringConstructor(response?.status) + ')',
      );
    }
    return normalizeProcessResourceDiagnostics(response.body, this.id);
  }

  /** Get local control snapshot from Admin API cache projection. */
  async getControlSnapshot(options = {}) {
    const lane =
      typeof options?.lane === 'string' ?
        options.lane :
        ADMIN_SOCKET_LANE_SNAPSHOT;
    const timeoutMs = this._resolveAdminQueryTimeoutMs(options?.timeoutMs);
    const querySnapshot = (sql) =>
      this.queryWithTimeout(sql, [], {
        lane,
        timeoutMs,
        ignorePreRestart: options?.ignorePreRestart === true,
      });
    if (options?.forceAuthoritativeRepair === true) {
      return querySnapshot(NODE_CLIENT_CONTROL_SNAPSHOT_FORCE_REPAIR_SQL);
    }
    if (options?.forceRepair !== true) {
      return querySnapshot(NODE_CLIENT_CONTROL_SNAPSHOT_SQL);
    }

    let localSnapshotError = null;
    let localSnapshotResult = null;
    try {
      localSnapshotResult = await querySnapshot(
        NODE_CLIENT_CONTROL_SNAPSHOT_SQL,
      );
      if (!shouldFallbackToForcedControlSnapshot(localSnapshotResult)) {
        return localSnapshotResult;
      }
    } catch (error) {
      localSnapshotError = error;
    }

    try {
      return await querySnapshot(NODE_CLIENT_CONTROL_SNAPSHOT_FORCE_REPAIR_SQL);
    } catch (forcedSnapshotError) {
      if (!localSnapshotError) {
        return localSnapshotResult;
      }
      throw new Error(
        String(localSnapshotError?.message || localSnapshotError) +
          '; forced repair snapshot failed: ' +
          String(forcedSnapshotError?.message || forcedSnapshotError),
      );
    }
  }

  /** Get structured control-plane diagnostics directly from the snapshot lane. */
  async getControlPlaneLedgerSnapshot(options = {}) {
    const result = await this.getControlSnapshot(options);
    const rows = Array.isArray(result?.rows) ? result.rows : [];
    const firstRow =
      rows.length > 0 && rows[0] && typeof rows[0] === 'object' ?
        rows[0] :
        null;
    const controlPlaneDiagnostics =
      firstRow?.controlPlaneDiagnostics &&
      typeof firstRow.controlPlaneDiagnostics === 'object' ?
        JSON.parse(JSON.stringify(firstRow.controlPlaneDiagnostics)) :
        null;
    return {
      nodeId: this.id,
      capturedAt:
        typeof firstRow?.capturedAt === 'string' ? firstRow.capturedAt : null,
      capturedAtMs: Number.isFinite(firstRow?.capturedAtMs) ?
        firstRow.capturedAtMs :
        Number.isFinite(firstRow?.capturedAt) ?
          firstRow.capturedAt :
          null,
      controlPlaneDiagnostics,
    };
  }

  /**
   * Probe lightweight bootstrap readiness.
   * @param {Object} [options]
   * @param {number} [options.timeoutMs]
   * @returns {Promise<Object>}
   */
  async probeBootstrapReadiness(options = {}) {
    const timeoutMs = resolvePositiveTimeoutMs(
      options?.timeoutMs,
      BOOTSTRAP_WAIT_REQUEST_TIMEOUT_MS,
    );
    const bootstrapJoinReadyUrl =
      'http://' + this.ip + ':' + this._restPort + BOOTSTRAP_JOIN_READY_PATH;
    const probeResponse = await httpRequest({
      url: bootstrapJoinReadyUrl,
      timeoutMs,
      method: HTTP_METHOD_GET,
      includeBody: true,
    });
    return normalizeReadinessProbeResult(probeResponse);
  }

  /**
   * Probe full traffic readiness.
   * @param {Object} [options]
   * @param {number} [options.timeoutMs]
   * @returns {Promise<Object>}
   */
  async probeTrafficReadiness(options = {}) {
    const timeoutMs = resolvePositiveTimeoutMs(
      options?.timeoutMs,
      BOOTSTRAP_WAIT_REQUEST_TIMEOUT_MS,
    );
    const trafficReadyUrl =
      'http://' + this.ip + ':' + this._restPort + BOOTSTRAP_TRAFFIC_READY_PATH;
    const probeResponse = await httpRequest({
      url: trafficReadyUrl,
      timeoutMs,
      method: HTTP_METHOD_GET,
      includeBody: true,
    });
    return normalizeReadinessProbeResult(probeResponse);
  }

  _resolveAdminRoutingReadiness(discoverySnapshot) {
    const rows = Array.isArray(discoverySnapshot?.rows) ?
      discoverySnapshot.rows :
      [];
    const firstRow =
      rows.length > 0 && rows[0] && typeof rows[0] === 'object' ?
        rows[0] :
        null;
    if (!firstRow) {
      return false;
    }
    const services = Array.isArray(firstRow[SERVICE_DISCOVERY_SERVICES_FIELD]) ?
      firstRow[SERVICE_DISCOVERY_SERVICES_FIELD] :
      [];
    for (const service of services) {
      if (!service || typeof service !== 'object') {
        continue;
      }
      const serviceIds = Array.isArray(
        service[SERVICE_DISCOVERY_SERVICE_IDS_FIELD],
      ) ?
        service[SERVICE_DISCOVERY_SERVICE_IDS_FIELD] :
        [];
      if (!serviceIds.includes(NODE_CLIENT_SERVICE_ID_ADMIN_META)) {
        continue;
      }
      const replicas = Array.isArray(service[SERVICE_DISCOVERY_REPLICAS_FIELD]) ?
        service[SERVICE_DISCOVERY_REPLICAS_FIELD] :
        [];
      for (const replica of replicas) {
        if (!replica || typeof replica !== 'object') {
          continue;
        }
        const replicaNodeId = String(
          replica[SERVICE_DISCOVERY_REPLICA_NODE_ID_FIELD] || '',
        );
        const replicaServiceId = String(
          replica[SERVICE_DISCOVERY_REPLICA_SERVICE_ID_FIELD] || '',
        );
        if (
          replicaNodeId !== this.id ||
          replicaServiceId !== NODE_CLIENT_SERVICE_ID_ADMIN_META
        ) {
          continue;
        }
        const readiness = replica[SERVICE_DISCOVERY_REPLICA_READINESS_FIELD];
        if (!readiness || typeof readiness !== 'object') {
          return false;
        }
        return (
          readiness[SERVICE_DISCOVERY_READINESS_ROUTING_READY_FIELD] === true
        );
      }
    }
    return false;
  }

  /** Get container logs. */
  async getLogs(options = {}) {
    return this._dockerProvider.getContainerLogs(this.containerId, options);
  }

  /**
   * Inspect this node's container runtime state (CL-030: the
   * unexpected-exit sweep reads this at scenario-failure time).
   * @returns {Promise<Object>} normalized {status, running, exitCode,
   *   oomKilled, finishedAt, error}
   */
  async inspectContainerState() {
    if (typeof this._dockerProvider?.inspectContainerIfExists !== 'function') {
      return {status: null, error: 'inspect_unavailable'};
    }
    const inspect =
      await this._dockerProvider.inspectContainerIfExists(this.containerId);
    if (!inspect) {
      return {status: null, error: 'container_missing'};
    }
    const state = inspect.State || {};
    return {
      status: typeof state.Status === 'string' ? state.Status : null,
      running: state.Running === true,
      exitCode: Number.isInteger(state.ExitCode) ? state.ExitCode : null,
      oomKilled: state.OOMKilled === true,
      finishedAt: typeof state.FinishedAt === 'string' ?
        state.FinishedAt :
        null,
      error: null,
    };
  }

  /**
   * Probe node reachability with detailed diagnostics.
   * @returns {Promise<Object>}
   */
  async getReachabilityDiagnostics(options = {}) {
    const probeTimeoutMs = resolvePositiveTimeoutMs(
      options.timeoutMs,
      FETCH_TIMEOUT_MS,
    );
    const skipBootstrapReadiness = options?.skipBootstrapReadiness === true;
    const deadlineMs = Date.now() + probeTimeoutMs;
    const remainingProbeBudgetMs = () => {
      return Math.max(MIN_TIMEOUT_MS, deadlineMs - Date.now());
    };
    const reachabilityHttpProbeTimeoutMs = () =>
      resolveReachabilityProbeTimeoutMs(
        remainingProbeBudgetMs(),
        REACHABILITY_HTTP_PROBE_TIMEOUT_MS,
      );
    const reachabilityAdminProbeTimeoutMs = () =>
      resolveReachabilityProbeTimeoutMs(
        remainingProbeBudgetMs(),
        REACHABILITY_ADMIN_PROBE_TIMEOUT_MS,
      );
    const bootstrapUrl =
      'http://' + this.ip + ':' + this._restPort + BOOTSTRAP_HEALTH_PATH;
    const adminUrl =
      'http://' + this.ip + ':' + this._adminApiPort + ADMIN_HEALTH_PATH;
    const adminEndpoint =
      'ws://' + this.ip + ':' + this._adminApiPort + ADMIN_STREAM_PATH;

    const diagnostics = {
      nodeId: this.id,
      timestamp: Date.now(),
      probeTimeoutMs,
      reachable: false,
      reachableBy: null,
      adminReady: false,
      controlPlaneRecoveryReady: false,
      publishedControlPlaneEpoch: null,
      readinessStage: null,
      readinessStageRank: null,
      recoveryStage: null,
      recoveryStageRank: null,
      startupRuntimeHandoff: null,
      bootstrapHealth: createProbeResult({
        url: bootstrapUrl,
      }),
      bootstrapReadiness: null,
      adminHealth: createProbeResult({
        url: adminUrl,
      }),
      adminWs: createProbeResult({
        endpoint: adminEndpoint,
      }),
      sqlProbe: createProbeResult({
        query: REACHABILITY_PROBE_SQL,
      }),
      lastError: null,
    };

    const bootstrapStatus = await httpGet(
      bootstrapUrl,
      reachabilityHttpProbeTimeoutMs(),
    );
    diagnostics.bootstrapHealth = buildHealthProbeResult(
      bootstrapUrl,
      bootstrapStatus,
    );
    if (diagnostics.bootstrapHealth.ok) {
      diagnostics.reachable = true;
      diagnostics.reachableBy = REACHABILITY_SOURCE_BOOTSTRAP_HEALTH;
      diagnostics.lastError = null;
    } else {
      diagnostics.lastError = diagnostics.bootstrapHealth.error;
    }

    if (!skipBootstrapReadiness) {
      try {
        const bootstrapReadiness = await this.probeBootstrapReadiness({
          timeoutMs: reachabilityHttpProbeTimeoutMs(),
        });
        diagnostics.bootstrapReadiness = bootstrapReadiness;
        diagnostics.controlPlaneRecoveryReady =
          isControlPlaneRecoveryReadyProbe(bootstrapReadiness);
        diagnostics.publishedControlPlaneEpoch = Number.isFinite(
          bootstrapReadiness?.publishedControlPlaneEpoch,
        ) ?
          Math.max(
            ZERO,
            Math.floor(bootstrapReadiness.publishedControlPlaneEpoch),
          ) :
          null;
        diagnostics.readinessStage =
          typeof bootstrapReadiness?.readinessStage === 'string' ?
            bootstrapReadiness.readinessStage :
            null;
        diagnostics.readinessStageRank = Number.isFinite(
          bootstrapReadiness?.readinessStageRank,
        ) ?
          Math.max(ZERO, Math.floor(bootstrapReadiness.readinessStageRank)) :
          null;
        diagnostics.recoveryStage =
          typeof bootstrapReadiness?.recoveryStage === 'string' ?
            bootstrapReadiness.recoveryStage :
            null;
        diagnostics.recoveryStageRank = Number.isFinite(
          bootstrapReadiness?.recoveryStageRank,
        ) ?
          Math.max(ZERO, Math.floor(bootstrapReadiness.recoveryStageRank)) :
          null;
        diagnostics.startupRuntimeHandoff =
          bootstrapReadiness?.startupRuntimeHandoff &&
          typeof bootstrapReadiness.startupRuntimeHandoff === 'object' ?
            bootstrapReadiness.startupRuntimeHandoff :
            null;
      } catch (_error) {
        diagnostics.bootstrapReadiness = null;
      }
    }

    const adminStatus = await httpGet(
      adminUrl,
      reachabilityHttpProbeTimeoutMs(),
    );
    diagnostics.adminHealth = buildHealthProbeResult(adminUrl, adminStatus);
    if (diagnostics.adminHealth.ok) {
      diagnostics.reachable = true;
      diagnostics.reachableBy = REACHABILITY_SOURCE_ADMIN_HEALTH;
      diagnostics.adminReady = true;
      diagnostics.lastError = null;
      this._lastReachabilityDiagnostics = diagnostics;
      return diagnostics;
    }
    diagnostics.lastError = diagnostics.adminHealth.error;

    try {
      await withTimeout(
        this._getAdminSocket(),
        reachabilityAdminProbeTimeoutMs(),
        'Admin WebSocket probe timed out for node ' + this.id,
      );
      diagnostics.adminWs = createProbeResult({
        attempted: true,
        ok: true,
        endpoint: adminEndpoint,
      });
      diagnostics.reachable = true;
      diagnostics.reachableBy = REACHABILITY_SOURCE_ADMIN_WS;
      diagnostics.adminReady = true;
      diagnostics.lastError = null;
      this._lastReachabilityDiagnostics = diagnostics;
      return diagnostics;
    } catch (err) {
      diagnostics.adminWs = createProbeResult({
        attempted: true,
        ok: false,
        endpoint: adminEndpoint,
        error: normalizeProbeError(err),
      });
      diagnostics.lastError = diagnostics.adminWs.error;
    }

    try {
      await this.queryWithTimeout(REACHABILITY_PROBE_SQL, [], {
        timeoutMs: reachabilityAdminProbeTimeoutMs(),
        lane: ADMIN_SOCKET_LANE_PROBE,
      });
      diagnostics.sqlProbe = createProbeResult({
        attempted: true,
        ok: true,
        query: REACHABILITY_PROBE_SQL,
      });
      diagnostics.reachable = true;
      diagnostics.reachableBy = REACHABILITY_SOURCE_SQL_PROBE;
      diagnostics.adminReady = true;
      diagnostics.lastError = null;
      this._lastReachabilityDiagnostics = diagnostics;
      return diagnostics;
    } catch (err) {
      diagnostics.sqlProbe = createProbeResult({
        attempted: true,
        ok: false,
        query: REACHABILITY_PROBE_SQL,
        error: normalizeProbeError(err),
      });
      diagnostics.lastError = diagnostics.sqlProbe.error;
    }

    this._lastReachabilityDiagnostics = diagnostics;
    return diagnostics;
  }

  /** Check if node is reachable via HTTP GET to REST port. */
  async isReachable() {
    const diagnostics = await this.getReachabilityDiagnostics();
    return diagnostics.reachable === true;
  }

  /**
   * Return the latest computed reachability diagnostics.
   * @returns {Object|null}
   */
  getLastReachabilityDiagnostics() {
    return this._lastReachabilityDiagnostics;
  }
}

export const CLUSTER_NODE_HANDLE_LAYER = {
  ...CLUSTER_CONTROL_SNAPSHOT_ADMIN_LAYER,
  NodeHandle,
};
