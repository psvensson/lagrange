/**
 * Cluster abstraction for the distributed testing framework.
 * Provides unified cluster lifecycle management over Docker containers.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3, 3.4
 */

import {v4 as uuidv4, v5 as uuidv5} from 'uuid';
import http from 'node:http';
import {DockerProvider} from './docker-provider.js';
import {ChaosPrimitives} from './chaos.js';
import {LoadGenerator} from './load-generator.js';
import {ENTRYPOINT_ENV} from '../../../src/constants/entrypoint.js';
import {
  waitForConvergence,
  assertConsistency,
  assertDataIntegrity,
} from './assertions.js';
import {LogCollector} from './log-collector.js';
import {LogAnalyzer} from './log-analyzer.js';
import {PlaybackRecorder} from './playback-recorder.js';
import {TraceArtifactRecorder} from './trace-artifact-recorder.js';
import {
  PORTS,
  TIMEOUTS,
  LABELS,
  CONTAINER_ENV_KEYS,
  NETWORK,
  NODE_ROLES,
  PLAYBACK_EVENT_TYPE,
  LOG_SUBSCRIPTION_CAPABILITY,
  RAFT_PROVIDER_DEFAULTS,
  NODE_CLIENT_CONTROL_SNAPSHOT_SQL,
  NODE_CLIENT_SERVICE_DISCOVERY_SQL,
  NODE_CLIENT_SERVICE_ID_ADMIN_META,
} from './constants.js';

const BOOTSTRAP_POLL_INTERVAL_MS = 500;
const ACTIVE_POLL_INTERVAL_MS = 1000;
const ACTIVE_WAIT_MIN_CLUSTER_SIZE = 1;
const ACTIVE_WAIT_TIMEOUT_SCALE_PERCENT_PER_EXTRA_NODE = 15;
const ACTIVE_WAIT_TIMEOUT_SCALE_PERCENT_DENOMINATOR = 100;
const ACTIVE_WAIT_TIMEOUT_MAX_MULTIPLIER = 3;
const ACTIVE_STATE = 'ACTIVE';
const INACTIVE_STATE = 'inactive';
const UNKNOWN_STATE = 'unknown';
const UNKNOWN_PHASE = 'unknown';
const DATA_DIR_PATH = '/data';
const MIN_TIMEOUT_MS = 1;
const HTTP_OK_LOWER = 200;
const HTTP_OK_UPPER = 299;
const FETCH_TIMEOUT_MS = 1000;
const CONTROL_SNAPSHOT_PROBE_TIMEOUT_MS = 3000;
const BOOTSTRAP_WAIT_REQUEST_TIMEOUT_MS = 10000;
const BOOTSTRAP_READY_STABLE_WINDOW_MS = 10000;
const ADMIN_QUERY_TIMEOUT_MS = 15000;
const REQUEST_TIMEOUT_OPTION_DEFAULT_MS = ADMIN_QUERY_TIMEOUT_MS;
const LOG_COLLECTION_TIMEOUT_MS = 1000;
const LOG_TAIL_LINES = 50;
const BOOTSTRAP_HEALTH_PATH = '/health';
const BOOTSTRAP_JOIN_READY_PATH = '/bootstrap/ready';
const ADMIN_HEALTH_PATH = '/health';
const ADMIN_STREAM_PATH = '/api/admin/stream';
const HTTP_METHOD_GET = 'GET';
const HTTP_HEADER_CONTENT_TYPE = 'Content-Type';
const HTTP_HEADER_CONTENT_LENGTH = 'Content-Length';
const HTTP_CONTENT_TYPE_JSON = 'application/json';
const HTTP_ERROR_STATUS = -1;
const JOINING_HTTP_TIMEOUT_ENV_KEY = ENTRYPOINT_ENV.JOINING_HTTP_TIMEOUT_MS;
const JOINING_LEADERSHIP_WAIT_TIMEOUT_ENV_KEY =
  ENTRYPOINT_ENV.JOINING_LEADERSHIP_WAIT_TIMEOUT_MS;
const JOINING_HTTP_TIMEOUT_DEFAULT_MS = 30000;
const JOINING_LEADERSHIP_WAIT_TIMEOUT_DEFAULT_MS = 120000;
const WS_HOST_ENV_KEY = 'TRANSPORT_WS_HOST';
const WS_BIND_ALL_HOST = '0.0.0.0';
const RAFT_PROVIDER_ENV_KEY = RAFT_PROVIDER_DEFAULTS.envKey;
const NODE_OPTIONS_ENV_KEY = 'NODE_OPTIONS';
const NODE_OPTION_HEAP_PROF = '--heap-prof';
const NODE_OPTION_HEAP_SNAPSHOT_NEAR_LIMIT_PREFIX =
  '--heapsnapshot-near-heap-limit=';
const HEAP_SNAPSHOT_NEAR_LIMIT_MIN_COUNT = 1;
const HEAP_SNAPSHOT_NEAR_LIMIT_DEFAULT_COUNT = 2;
const QUERY_MESSAGE_TYPE = 'query';
const PARTITION_CALLBACK_MESSAGE_TYPE = 'partition_callback';
const QUERY_RESULT_MESSAGE_TYPE = 'query_result';
const CDC_EVENT_MESSAGE_TYPE = 'cdc_event';
const LIVE_QUERY_EVENT_MESSAGE_TYPE = 'live_query_event';
const LIVE_QUERY_INITIAL_MESSAGE_TYPE = 'live_query_initial';
const LOGS_TABLE_NAME = 'logs';
const REACHABILITY_PROBE_SQL = 'SELECT node_id FROM nodes LIMIT 1';
const REACHABILITY_SOURCE_BOOTSTRAP_HEALTH = 'bootstrap_health';
const REACHABILITY_SOURCE_ADMIN_HEALTH = 'admin_health';
const REACHABILITY_SOURCE_ADMIN_WS = 'admin_ws';
const REACHABILITY_SOURCE_SQL_PROBE = 'sql_probe';
const REACHABILITY_STATUS_HTTP = 'http_status_';
const REACHABILITY_ERROR_UNKNOWN = 'unknown reachability error';
const STATUS_ACTIVE_LOWER = ACTIVE_STATE.toLowerCase();
const WS_READY_STATE_OPEN = 1;
const WS_READY_STATE_CONNECTING = 0;
const PLAYBACK_SCOPE_CLUSTER = 'cluster';
const PLAYBACK_SCOPE_NODE = 'node';
const PLAYBACK_SCOPE_CHAOS = 'chaos';
const PLAYBACK_SCOPE_LOAD = 'load';
const PLAYBACK_ENTITY_CLUSTER = 'cluster';
const LOAD_RUN_ENTITY = 'load-run';
const LOAD_PROGRESS_INTERVAL_MS = 1000;
const CONTROL_SNAPSHOT_NODES_FIELD = 'nodes';
const SERVICE_DISCOVERY_SERVICES_FIELD = 'services';
const SERVICE_DISCOVERY_SERVICE_IDS_FIELD = 'serviceIds';
const SERVICE_DISCOVERY_REPLICAS_FIELD = 'replicas';
const SERVICE_DISCOVERY_REPLICA_NODE_ID_FIELD = 'nodeId';
const SERVICE_DISCOVERY_REPLICA_SERVICE_ID_FIELD = 'serviceId';
const SERVICE_DISCOVERY_REPLICA_READINESS_FIELD = 'readiness';
const SERVICE_DISCOVERY_READINESS_ROUTING_READY_FIELD = 'routingReady';
const CLUSTER_STAGE_SETUP_NETWORK_CREATING = 'setup.network.creating';
const CLUSTER_STAGE_SETUP_NETWORK_CREATED = 'setup.network.created';
const CLUSTER_STAGE_SETUP_SEED_STARTING = 'setup.seed.starting';
const CLUSTER_STAGE_SETUP_SEED_BOOTSTRAP_WAITING =
  'setup.seed.bootstrap.waiting';
const CLUSTER_STAGE_SETUP_SEED_BOOTSTRAP_READY =
  'setup.seed.bootstrap.ready';
const CLUSTER_STAGE_SETUP_JOINER_STARTING = 'setup.joiner.starting';
const CLUSTER_STAGE_SETUP_JOINER_STARTED = 'setup.joiner.started';
const CLUSTER_STAGE_SETUP_CLUSTER_WAITING_ACTIVE =
  'setup.cluster.waiting-active';
const CLUSTER_STAGE_SETUP_CLUSTER_ACTIVE = 'setup.cluster.active';
const STARTUP_GATE_STATE_SEED_LIVE = 'seed_live';
const STARTUP_GATE_STATE_SEED_JOIN_READY = 'seed_join_ready';
const STARTUP_GATE_STATE_CLUSTER_ACTIVE = 'cluster_active';
const STARTUP_GATE_STATE = Object.freeze({
  SEED_LIVE: STARTUP_GATE_STATE_SEED_LIVE,
  SEED_JOIN_READY: STARTUP_GATE_STATE_SEED_JOIN_READY,
  CLUSTER_ACTIVE: STARTUP_GATE_STATE_CLUSTER_ACTIVE,
});
const STARTUP_GATE_WAITING_EVENT_INTERVAL = 20;
const CLUSTER_STAGE_SETUP_LOG_SUB_STARTING = 'setup.logs.subscription.starting';
const CLUSTER_STAGE_SETUP_LOG_SUB_READY = 'setup.logs.subscription.ready';
const CLUSTER_STAGE_SETUP_LOG_SUB_FAILED = 'setup.logs.subscription.failed';
const CLUSTER_STAGE_TEARDOWN_STARTING = 'teardown.starting';
const CLUSTER_STAGE_TEARDOWN_NETWORK_REMOVING = 'teardown.network.removing';
const CLUSTER_STAGE_TEARDOWN_NETWORK_REMOVED = 'teardown.network.removed';
const CLUSTER_STAGE_TEARDOWN_CAPTURE_FINALIZING =
  'teardown.capture.finalizing';
const CLUSTER_STAGE_TEARDOWN_COMPLETE = 'teardown.complete';
const CLUSTER_CONFIG_DOCKER_OPERATION_SINK = 'dockerOperationSink';
const PROCESS_EVENT_EXIT = 'exit';
const PROCESS_EVENT_SIGINT = 'SIGINT';
const PROCESS_EVENT_SIGTERM = 'SIGTERM';
const PROCESS_EVENT_UNCAUGHT_EXCEPTION = 'uncaughtException';
const PROCESS_SIGNAL_EVENTS = Object.freeze([
  PROCESS_EVENT_SIGINT,
  PROCESS_EVENT_SIGTERM,
]);
const PROCESS_CLEANUP_REGISTRY = new Map();
let processCleanupHandlersRegistered = false;
const DOCKER_HOST_CONFIG_BINDS_KEY = 'Binds';
const CONTAINER_RUNNING_STATUS = 'running';
const REUSE_NETWORK_NAME_SUFFIX = 'reuse-local';
const REUSE_NODE_ID_PREFIX = 'reuse-node-';
const REUSE_NODE_ID_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const REUSE_CONTAINER_NAME_PREFIX = 'ddb-test-reuse';
const REUSE_ENTRYPOINT = Object.freeze(['sh', '-lc']);
const REUSE_START_COMMAND =
  'rm -rf /data/* && exec node --max-old-space-size=1536 /app/src/index.js';
const REUSE_START_COMMAND_ARGS = Object.freeze([REUSE_START_COMMAND]);
const CONTAINER_STOP_NOT_RUNNING_PATTERN = 'is not running';
const CONTAINER_STOP_NOT_FOUND_PATTERN = 'no such container';
const ADMIN_SOCKET_LANE_DEFAULT = 'default';
const ADMIN_SOCKET_LANE_PROBE = 'probe';
const ADMIN_SOCKET_LANE_SNAPSHOT = 'snapshot';

/**
 * Simple HTTP request with timeout using node:http.
 * Returns the status code, or -1 on error/timeout.
 */
function httpRequest(options = {}) {
  const url = String(options.url || '');
  const timeoutMs = Number(options.timeoutMs) || 0;
  const method = typeof options.method === 'string' ?
    options.method :
    HTTP_METHOD_GET;
  const includeBody = options.includeBody === true;
  const hasBody = options.body !== undefined && options.body !== null;
  const payload = hasBody ? JSON.stringify(options.body) : null;
  const headers = hasBody ?
    {
      [HTTP_HEADER_CONTENT_TYPE]: HTTP_CONTENT_TYPE_JSON,
      [HTTP_HEADER_CONTENT_LENGTH]: Buffer.byteLength(payload),
    } :
    undefined;

  return new Promise((resolve) => {
    const resolveError = () => {
      if (includeBody) {
        resolve({
          status: HTTP_ERROR_STATUS,
          body: null,
        });
        return;
      }
      resolve(HTTP_ERROR_STATUS);
    };
    const onResponse = (res) => {
      if (!includeBody) {
        res.resume();
        resolve(res.statusCode);
        return;
      }

      let rawBody = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        rawBody += chunk;
      });
      res.on('end', () => {
        let parsedBody = null;
        if (rawBody.length > 0) {
          try {
            parsedBody = JSON.parse(rawBody);
          } catch (_parseError) {
            parsedBody = null;
          }
        }
        resolve({
          status: res.statusCode,
          body: parsedBody,
        });
      });
    };
    const requestOptions = {
      timeout: timeoutMs,
      headers,
    };
    const useGetRequest = method === HTTP_METHOD_GET && !hasBody;
    const req = useGetRequest ?
      http.get(url, requestOptions, onResponse) :
      http.request(url, {
        ...requestOptions,
        method,
      }, onResponse);
    req.on('error', resolveError);
    req.on('timeout', () => {
      req.destroy();
      resolveError();
    });
    if (payload !== null) {
      req.write(payload);
    }
    if (!useGetRequest) {
      req.end();
    }
  });
}

/**
 * Simple HTTP GET with timeout using node:http.
 * Returns the status code, or -1 on error/timeout.
 */
function httpGet(url, timeoutMs) {
  return httpRequest({
    url,
    timeoutMs,
    method: HTTP_METHOD_GET,
  });
}

/**
 * Resolve a timeout override while enforcing a positive integer value.
 * @param {*} value
 * @param {number} fallback
 * @returns {number}
 */
function resolvePositiveTimeoutMs(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < MIN_TIMEOUT_MS) {
    return fallback;
  }
  return Math.floor(parsed);
}

/**
 * Resolve/reject with timeout protection for potentially hanging operations.
 * @param {Promise<*>} promise
 * @param {number} timeoutMs
 * @param {string} timeoutMessage
 * @returns {Promise<*>}
 */
function withTimeout(promise, timeoutMs, timeoutMessage) {
  const boundedTimeoutMs = Math.max(MIN_TIMEOUT_MS, Number(timeoutMs) || 0);
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      reject(new Error(timeoutMessage));
    }, boundedTimeoutMs);
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
    Promise.resolve(promise)
      .then((result) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        reject(error);
      });
  });
}

/**
 * Format count-map entries as "key:value" pairs for diagnostic errors.
 * @param {Map<string|number, number>} counts
 * @returns {string}
 */
function formatCountSummary(counts) {
  return Array.from(counts.entries())
    .map(([key, count]) => String(key) + ':' + String(count))
    .join(', ');
}

/**
 * Format node diagnostics into compact "node=state" entries.
 * @param {Array<Object>} nodeDiagnostics
 * @returns {string}
 */
function formatNodeDiagnostics(nodeDiagnostics = []) {
  return nodeDiagnostics
    .map((diagnostic) => {
      const nodeId = String(diagnostic.nodeId || 'unknown-node');
      if (diagnostic.active === true) {
        return nodeId + '=active';
      }
      if (typeof diagnostic.error === 'string' &&
          diagnostic.error.length > 0) {
        return nodeId + '=error:' + diagnostic.error;
      }
      const stateValue = typeof diagnostic.state === 'string' &&
        diagnostic.state.length > 0 ?
        diagnostic.state :
        UNKNOWN_STATE;
      return nodeId + '=' + stateValue;
    })
    .join(', ');
}

/**
 * Format control snapshot coverage summary.
 * @param {Object|null} snapshotCoverage
 * @returns {string}
 */
function formatSnapshotCoverage(snapshotCoverage) {
  if (!snapshotCoverage || typeof snapshotCoverage !== 'object') {
    return 'none';
  }
  const expectedNodeCount = Number(snapshotCoverage.expectedNodeCount) || 0;
  const bestCoverageNodeCount = Number(snapshotCoverage.bestCoverageNodeCount) || 0;
  return String(bestCoverageNodeCount) + '/' + String(expectedNodeCount);
}

/**
 * Poll a probe until success or timeout.
 * @param {Object} options
 * @param {function(): Promise<Object>} options.probe
 * @param {function(Object): boolean} options.isSuccess
 * @param {number} options.deadline
 * @param {number} options.intervalMs
 * @param {function(number): Promise<void>} options.sleep
 * @param {function(Object): Promise<void>|void} [options.onAttempt]
 * @returns {Promise<Object>}
 */
async function pollUntilCondition(options = {}) {
  const deadline = Number(options.deadline) || Date.now();
  const intervalMs = Math.max(0, Number(options.intervalMs) || 0);
  const probe = options.probe;
  const isSuccess = options.isSuccess;
  const sleep = typeof options.sleep === 'function' ?
    options.sleep :
    async () => {};
  const onAttempt = typeof options.onAttempt === 'function' ?
    options.onAttempt :
    null;

  const startedAt = Date.now();
  let attempts = 0;
  let lastResult = null;

  while (Date.now() < deadline) {
    attempts += 1;
    lastResult = await probe();
    const elapsedMs = Date.now() - startedAt;
    const attemptResult = {
      attempts,
      elapsedMs,
      lastResult,
      remainingMs: Math.max(0, deadline - Date.now()),
    };

    if (isSuccess(lastResult)) {
      return {
        success: true,
        ...attemptResult,
      };
    }

    if (onAttempt) {
      await onAttempt(attemptResult);
    }
    await sleep(intervalMs);
  }

  return {
    success: false,
    attempts,
    elapsedMs: Date.now() - startedAt,
    lastResult,
    remainingMs: 0,
  };
}

/**
 * Best-effort WebSocket close that suppresses transient close-time errors.
 * @param {Object|null} socket
 */
function closeWebSocketSafely(socket) {
  if (!socket || typeof socket.close !== 'function') {
    return;
  }
  try {
    socket.once('error', () => {});
  } catch (_onceErr) {
    // Ignore
  }
  try {
    socket.close();
  } catch (_closeErr) {
    // Ignore
  }
}

/**
 * Build a reusable probe object for reachability diagnostics.
 * @param {Object} options
 * @param {boolean} [options.attempted]
 * @param {boolean} [options.ok]
 * @param {number|null} [options.statusCode]
 * @param {string|null} [options.error]
 * @param {string|null} [options.url]
 * @param {string|null} [options.endpoint]
 * @param {string|null} [options.query]
 * @returns {Object}
 */
function createProbeResult(options = {}) {
  return {
    attempted: options.attempted === true,
    ok: options.ok === true,
    statusCode: Number.isInteger(options.statusCode) ?
      options.statusCode :
      null,
    error: typeof options.error === 'string' ?
      options.error :
      null,
    url: typeof options.url === 'string' ? options.url : null,
    endpoint: typeof options.endpoint === 'string' ?
      options.endpoint :
      null,
    query: typeof options.query === 'string' ? options.query : null,
  };
}

/**
 * Convert a caught error value into a stable diagnostic string.
 * @param {*} error
 * @returns {string}
 */
function normalizeProbeError(error) {
  if (error && typeof error.message === 'string' && error.message.length > 0) {
    return error.message;
  }
  if (typeof error === 'string' && error.length > 0) {
    return error;
  }
  return REACHABILITY_ERROR_UNKNOWN;
}

/**
 * Read one environment value from docker inspect payload.
 * @param {Object} inspect
 * @param {string} key
 * @returns {string|null}
 */
function readContainerInspectEnvValue(inspect, key) {
  const envList = Array.isArray(inspect?.Config?.Env) ?
    inspect.Config.Env :
    [];
  const prefix = String(key || '') + '=';
  for (const entry of envList) {
    if (typeof entry === 'string' && entry.startsWith(prefix)) {
      return entry.slice(prefix.length);
    }
  }
  return null;
}

/**
 * Determine whether one reusable-container stop error can be ignored.
 * @param {*} error
 * @returns {boolean}
 */
function isIgnorableContainerStopError(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes(CONTAINER_STOP_NOT_RUNNING_PATTERN) ||
    message.includes(CONTAINER_STOP_NOT_FOUND_PATTERN);
}

/**
 * Build a health probe result from an HTTP status code.
 * @param {string} url
 * @param {number} statusCode
 * @returns {Object}
 */
function buildHealthProbeResult(url, statusCode) {
  const ok = statusCode >= HTTP_OK_LOWER && statusCode <= HTTP_OK_UPPER;
  return createProbeResult({
    attempted: true,
    ok,
    statusCode,
    url,
    error: ok ? null : REACHABILITY_STATUS_HTTP + String(statusCode),
  });
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
  ) {
    this.id = id;
    this.containerId = containerId;
    this.ip = ip;
    this.role = role;
    this._dockerProvider = dockerProvider;
    this._adminApiPort = adminApiPort;
    this._adminSocketByLane = new Map();
    this._adminSocketReadyByLane = new Map();
    this._pendingAdminSocketByLane = new Map();
    this._pendingQueriesByLane = new Map();
    this._logStreamListeners = new Set();
    this._lastReachabilityDiagnostics = null;
  }

  /**
   * Query the Admin API via WebSocket.
   * Connects to ws://{ip}:8081/api/admin/stream, sends SQL,
   * returns results.
   */
  async query(sql, params = []) {
    return this.queryWithTimeout(sql, params, {
      timeoutMs: ADMIN_QUERY_TIMEOUT_MS,
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
    return this._sendAdminRequest(
      {
        type: QUERY_MESSAGE_TYPE,
        sql,
        params: Array.isArray(params) ? params : [],
      },
      'query',
      {
        ...options,
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
        'Partition callback payload must be an object for node ' +
        this.id,
      );
    }
    return this._sendAdminRequest(
      {
        type: PARTITION_CALLBACK_MESSAGE_TYPE,
        statement: payload.statement,
        parameters: Array.isArray(payload.parameters) ?
          payload.parameters :
          [],
        callbackModuleRef: payload.callbackModuleRef,
        callbackExport: payload.callbackExport,
        runtimeKind: payload.runtimeKind,
      },
      'partition callback',
    );
  }

  _resolveAdminLane(options = {}) {
    const lane = typeof options?.lane === 'string' ?
      options.lane.trim() :
      '';
    return lane.length > 0 ? lane : ADMIN_SOCKET_LANE_DEFAULT;
  }

  _getPendingQueries(lane) {
    if (!this._pendingQueriesByLane.has(lane)) {
      this._pendingQueriesByLane.set(lane, new Map());
    }
    return this._pendingQueriesByLane.get(lane);
  }

  /**
   * Send one request over the shared admin socket and await query_result.
   * @param {Object} requestPayload
   * @param {string} operationLabel
   * @returns {Promise<Object>}
   * @private
   */
  async _sendAdminRequest(requestPayload, operationLabel, options = {}) {
    const requestTimeoutMs = resolvePositiveTimeoutMs(
      options.timeoutMs,
      REQUEST_TIMEOUT_OPTION_DEFAULT_MS,
    );
    const lane = this._resolveAdminLane(options);
    const ws = await withTimeout(
      this._getAdminSocket(lane),
      requestTimeoutMs,
      'Admin API ' + operationLabel + ' timed out for node ' +
        this.id + ' on lane ' + lane + ' after ' + requestTimeoutMs + 'ms',
    );
    const queryId = this._nextQueryId();
    const pendingQueries = this._getPendingQueries(lane);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingQueries.delete(queryId);
        reject(new Error(
          'Admin API ' + operationLabel + ' timed out for node ' +
          this.id + ' on lane ' + lane + ' after ' + requestTimeoutMs + 'ms',
        ));
      }, requestTimeoutMs);

      pendingQueries.set(queryId, {
        resolve,
        reject,
        timeout,
        operationLabel,
      });

      try {
        ws.send(JSON.stringify({
          ...requestPayload,
          queryId,
        }));
      } catch (err) {
        pendingQueries.delete(queryId);
        clearTimeout(timeout);
        this._resetAdminSocket(lane);
        try {
          ws.close();
        } catch (_closeErr) {
          // Best-effort cleanup
        }
        reject(new Error(
          'Admin API ' + operationLabel + ' failed for node ' +
          this.id + ' on lane ' + lane + ': ' + err.message,
        ));
      }
    });
  }

  /**
   * Build stable request IDs for admin socket requests.
   * @returns {string}
   * @private
   */
  _nextQueryId() {
    return 'q-' + Date.now() + '-' +
      Math.random().toString(36).slice(2);
  }

  /**
   * Close the long-lived Admin API WebSocket connection.
   */
  closeQueryConnection() {
    this._rejectPendingQueries(
      'Admin API query connection closed for node ' +
      this.id,
    );
    this._logStreamListeners.clear();
    for (const socket of this._adminSocketByLane.values()) {
      try {
        socket.close();
      } catch (_err) {
        // Best-effort cleanup
      }
    }
    for (const pendingSocket of this._pendingAdminSocketByLane.values()) {
      if (pendingSocket &&
        pendingSocket.readyState === WS_READY_STATE_CONNECTING) {
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
        'Log stream listener must be a function for node ' +
        this.id,
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
    if (existingSocket &&
        existingSocket.readyState === WS_READY_STATE_OPEN) {
      return existingSocket;
    }
    const pendingReadyPromise = this._adminSocketReadyByLane.get(lane);
    if (pendingReadyPromise) {
      return pendingReadyPromise;
    }

    const {default: WebSocket} = await import('ws');
    const url =
      'ws://' + this.ip + ':' + this._adminApiPort +
      '/api/admin/stream';

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
        reject(new Error(
          'Admin API query failed for node ' +
          this.id + ' on lane ' + lane + ': connection timed out',
        ));
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
        reject(new Error(
          'Admin API query failed for node ' +
          this.id + ' on lane ' + lane + ': ' + err.message,
        ));
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
        // Ignore malformed frames and continue.
      }
    });

    ws.on('error', (err) => {
      this._rejectPendingQueries(
        'Admin API query failed for node ' +
        this.id + ' on lane ' + lane + ': ' + err.message,
        lane,
      );
      this._resetAdminSocket(lane);
    });

    ws.on('close', () => {
      this._rejectPendingQueries(
        'Admin API query connection closed before response ' +
        'for node ' + this.id + ' on lane ' + lane,
        lane,
      );
      this._resetAdminSocket(lane);
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
      pending.reject(new Error(
        'Admin API ' + (pending.operationLabel || 'request') +
        ' failed for node ' +
        this.id + ' on lane ' + lane + ': ' + parsed.error,
      ));
      return;
    }

    pending.resolve({
      rows: Array.isArray(parsed.results) ?
        parsed.results :
        [],
      count: parsed.count,
      partitions: parsed.partitions,
      tableName: parsed.tableName,
      operation: parsed.operation,
      affectedRows: parsed.affectedRows,
      hostResult: parsed.hostResult,
      callbackModuleRef: parsed.callbackModuleRef,
      callbackExport: parsed.callbackExport,
      warning: parsed.warning,
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

    const payload = parsed.record || parsed.row ||
      parsed.data || parsed.new || parsed.old || null;

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
        // Best-effort log streaming callback isolation.
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
      this._adminSocketByLane.delete(lane);
      this._adminSocketReadyByLane.delete(lane);
      this._pendingAdminSocketByLane.delete(lane);
      return;
    }
    this._adminSocketByLane.clear();
    this._adminSocketReadyByLane.clear();
    this._pendingAdminSocketByLane.clear();
    this._pendingQueriesByLane.clear();
  }

  /** Get node status from Admin API. */
  async getStatus(options = {}) {
    const lane = typeof options?.lane === 'string' ?
      options.lane :
      ADMIN_SOCKET_LANE_PROBE;
    const timeoutMs = resolvePositiveTimeoutMs(
      options?.timeoutMs,
      ADMIN_QUERY_TIMEOUT_MS,
    );
    const discoverySnapshot = await this.queryWithTimeout(
      NODE_CLIENT_SERVICE_DISCOVERY_SQL,
      [],
      {
        lane,
        timeoutMs,
      },
    );
    const routingReady = this._resolveAdminRoutingReadiness(
      discoverySnapshot,
    );
    return {
      rows: [{
        status: routingReady ? STATUS_ACTIVE_LOWER : INACTIVE_STATE,
      }],
    };
  }

  /** Get local control snapshot from Admin API cache projection. */
  async getControlSnapshot(options = {}) {
    const lane = typeof options?.lane === 'string' ?
      options.lane :
      ADMIN_SOCKET_LANE_SNAPSHOT;
    const timeoutMs = resolvePositiveTimeoutMs(
      options?.timeoutMs,
      ADMIN_QUERY_TIMEOUT_MS,
    );
    return this.queryWithTimeout(
      NODE_CLIENT_CONTROL_SNAPSHOT_SQL,
      [],
      {
        lane,
        timeoutMs,
      },
    );
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
      'http://' + this.ip + ':' + PORTS.REST + BOOTSTRAP_JOIN_READY_PATH;
    const probeResponse = await httpRequest({
      url: bootstrapJoinReadyUrl,
      timeoutMs,
      method: HTTP_METHOD_GET,
      includeBody: true,
    });

    const normalized = {
      status: HTTP_ERROR_STATUS,
      phase: null,
      state: null,
      reasons: [],
      retryAfterMs: null,
    };

    if (typeof probeResponse === 'number') {
      normalized.status = probeResponse;
      return normalized;
    }

    if (!probeResponse || typeof probeResponse !== 'object') {
      return normalized;
    }

    normalized.status = Number.isFinite(probeResponse.status) ?
      Math.floor(probeResponse.status) :
      HTTP_ERROR_STATUS;

    const body = probeResponse.body;
    if (!body || typeof body !== 'object') {
      return normalized;
    }

    normalized.phase = typeof body.phase === 'string' ? body.phase : null;
    normalized.state = typeof body.state === 'string' ? body.state : null;
    normalized.reasons = Array.isArray(body.reasons) ?
      body.reasons.map((reason) => String(reason)) :
      [];
    normalized.retryAfterMs = Number.isFinite(body.retryAfterMs) ?
      Math.floor(body.retryAfterMs) :
      null;
    return normalized;
  }

  _resolveAdminRoutingReadiness(discoverySnapshot) {
    const rows = Array.isArray(discoverySnapshot?.rows) ?
      discoverySnapshot.rows :
      [];
    const firstRow = rows.length > 0 &&
      rows[0] &&
      typeof rows[0] === 'object' ?
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
      const serviceIds = Array.isArray(service[SERVICE_DISCOVERY_SERVICE_IDS_FIELD]) ?
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
        const replicaNodeId =
          String(replica[SERVICE_DISCOVERY_REPLICA_NODE_ID_FIELD] || '');
        const replicaServiceId =
          String(replica[SERVICE_DISCOVERY_REPLICA_SERVICE_ID_FIELD] || '');
        if (replicaNodeId !== this.id ||
            replicaServiceId !== NODE_CLIENT_SERVICE_ID_ADMIN_META) {
          continue;
        }
        const readiness = replica[SERVICE_DISCOVERY_REPLICA_READINESS_FIELD];
        if (!readiness || typeof readiness !== 'object') {
          return false;
        }
        return readiness[SERVICE_DISCOVERY_READINESS_ROUTING_READY_FIELD] === true;
      }
    }
    return false;
  }

  /** Get container logs. */
  async getLogs(options = {}) {
    return this._dockerProvider.getContainerLogs(
      this.containerId,
      options,
    );
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
    const bootstrapUrl =
      'http://' + this.ip + ':' + PORTS.REST + BOOTSTRAP_HEALTH_PATH;
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
      bootstrapHealth: createProbeResult({
        url: bootstrapUrl,
      }),
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

    const bootstrapStatus = await httpGet(bootstrapUrl, probeTimeoutMs);
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

    const adminStatus = await httpGet(adminUrl, probeTimeoutMs);
    diagnostics.adminHealth = buildHealthProbeResult(
      adminUrl,
      adminStatus,
    );
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
      await this._getAdminSocket();
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
      await this.queryWithTimeout(
        REACHABILITY_PROBE_SQL,
        [],
        {
          timeoutMs: probeTimeoutMs,
          lane: ADMIN_SOCKET_LANE_PROBE,
        },
      );
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

/**
 * Distribute node indices across Docker hosts in round-robin
 * fashion, respecting the nodesPerHost limit.
 */
function distributeNodes(size, providers, nodesPerHost) {
  const hostCount = providers.length;
  const perHostCount = new Array(hostCount).fill(0);
  const assignment = [];

  let hostIdx = 0;
  for (let i = 0; i < size; i++) {
    let assigned = false;
    for (let attempt = 0; attempt < hostCount; attempt++) {
      const candidate = (hostIdx + attempt) % hostCount;
      if (perHostCount[candidate] < nodesPerHost) {
        assignment.push(candidate);
        perHostCount[candidate]++;
        hostIdx = (candidate + 1) % hostCount;
        assigned = true;
        break;
      }
    }
    if (!assigned) {
      break;
    }
  }

  return assignment;
}

/**
 * Unified startup readiness gate.
 * Drives startup readiness through deterministic states:
 * seed_live -> seed_join_ready -> cluster_active.
 */
class StartupGate {
  /**
   * @param {Cluster} cluster
   * @param {NodeHandle} seedNode
   * @param {string} seedNodeId
   */
  constructor(cluster, seedNode, seedNodeId) {
    this._cluster = cluster;
    this._seedNode = seedNode;
    this._seedNodeId = seedNodeId;
    this._state = STARTUP_GATE_STATE.SEED_LIVE;
  }

  getState() {
    return this._state;
  }

  /**
   * Wait until seed bootstrap endpoint is join-ready.
   * @returns {Promise<void>}
   */
  async waitForSeedJoinReady() {
    this._cluster._recordClusterStage(
      CLUSTER_STAGE_SETUP_SEED_BOOTSTRAP_WAITING,
      {
        nodeId: this._seedNodeId,
        startupGateState: this._state,
      },
    );
    await this._cluster._waitForBootstrapApi(this._seedNode);
    this._state = STARTUP_GATE_STATE.SEED_JOIN_READY;
    this._cluster._recordClusterStage(
      CLUSTER_STAGE_SETUP_SEED_BOOTSTRAP_READY,
      {
        nodeId: this._seedNodeId,
        startupGateState: this._state,
      },
    );
  }

  /**
   * Wait until all cluster nodes are ACTIVE.
   * @param {number} expectedNodeCount
   * @returns {Promise<void>}
   */
  async waitForClusterActive(expectedNodeCount) {
    if (this._state !== STARTUP_GATE_STATE.SEED_JOIN_READY) {
      throw new Error(
        'Startup gate state violation: expected ' +
        STARTUP_GATE_STATE.SEED_JOIN_READY +
        ' before cluster-active wait, got ' + this._state,
      );
    }

    this._cluster._recordClusterStage(
      CLUSTER_STAGE_SETUP_CLUSTER_WAITING_ACTIVE,
      {
        expectedNodeCount,
        startupGateState: this._state,
      },
    );
    await this._cluster._waitForAllActive();
    this._state = STARTUP_GATE_STATE.CLUSTER_ACTIVE;
    this._cluster._recordClusterStage(
      CLUSTER_STAGE_SETUP_CLUSTER_ACTIVE,
      {
        nodeCount: this._cluster._nodes.size,
        startupGateState: this._state,
      },
    );
  }
}

/**
 * Unified cluster abstraction.
 * Scenarios interact exclusively with this interface.
 */
class Cluster {
  constructor(config, providers, hostAssignment) {
    this._config = config;
    this._providers = providers;
    this._hostAssignment = hostAssignment;
    this._clusterId = uuidv4();
    this._scenarioName = config.scenarioName || 'unknown-scenario';
    this._networkId = null;
    this._networkName = null;
    this._nodes = new Map();
    this._started = false;
    this._chaos = null;
    this._logCollector = new LogCollector(
      config.outputDir,
    );
    this._logAnalyzer = new LogAnalyzer(
      config.outputDir,
    );
    this._playbackRecorder = new PlaybackRecorder({
      outputDir: config.outputDir,
    });
    this._playbackManifest = null;
    this._playbackStartWarning = null;
    this._traceRecorder = null;
    this._traceManifest = null;
    this._traceStartWarning = null;
    this._cleanupUnregister = null;
    this._httpGet = httpGet;
    this._httpRequest = httpRequest;
    this._activeLoadRuns = new Set();
  }

  _isContainerReuseEnabled() {
    const dockerConfig =
      this._config && typeof this._config.docker === 'object' ?
        this._config.docker :
        {};
    const hasRemoteHosts = Array.isArray(dockerConfig.hosts) &&
      dockerConfig.hosts.length > 0;
    return !hasRemoteHosts && dockerConfig.reuseContainers === true;
  }

  _shouldKeepReuseContainersRunning() {
    if (!this._isContainerReuseEnabled()) {
      return false;
    }
    return this._config?.docker?.keepRunningContainers !== false;
  }

  _buildReusableNetworkName() {
    return NETWORK.NAME_PREFIX +
      '-' +
      REUSE_NETWORK_NAME_SUFFIX +
      '-' +
      String(this._config.size);
  }

  _buildNodeId(nodeIndex) {
    if (this._isContainerReuseEnabled()) {
      return uuidv5(
        REUSE_NODE_ID_PREFIX + String(nodeIndex + 1),
        REUSE_NODE_ID_NAMESPACE,
      );
    }
    return uuidv4();
  }

  _buildContainerName(nodeId, nodeIndex) {
    if (this._isContainerReuseEnabled()) {
      return REUSE_CONTAINER_NAME_PREFIX +
        '-' +
        String(this._config.size) +
        '-' +
        String(nodeIndex + 1);
    }
    return 'ddb-test-' + this._clusterId.slice(0, 8) + '-' + nodeId;
  }

  _buildNodeEnv(nodeId, containerName, seedIp) {
    const env = {};
    env[CONTAINER_ENV_KEYS.NODE_ID] = nodeId;
    env[CONTAINER_ENV_KEYS.DATA_DIR] = DATA_DIR_PATH;
    env[CONTAINER_ENV_KEYS.NODE_ADDRESS] =
      containerName + ':' + PORTS.REST;
    env[WS_HOST_ENV_KEY] = WS_BIND_ALL_HOST;
    env[RAFT_PROVIDER_ENV_KEY] =
      String(this._config.raftProvider || RAFT_PROVIDER_DEFAULTS.provider);
    if (this._config?.memoryLeak?.captureHeapArtifacts === true) {
      const nearLimitCount = Number.isInteger(
        this._config?.memoryLeak?.heapSnapshotNearLimitCount,
      ) &&
      this._config.memoryLeak.heapSnapshotNearLimitCount >=
        HEAP_SNAPSHOT_NEAR_LIMIT_MIN_COUNT ?
        this._config.memoryLeak.heapSnapshotNearLimitCount :
        HEAP_SNAPSHOT_NEAR_LIMIT_DEFAULT_COUNT;
      const existingNodeOptions = String(env[NODE_OPTIONS_ENV_KEY] || '').trim();
      const leakNodeOptions = [
        NODE_OPTION_HEAP_PROF,
        NODE_OPTION_HEAP_SNAPSHOT_NEAR_LIMIT_PREFIX + nearLimitCount,
      ].join(' ');
      env[NODE_OPTIONS_ENV_KEY] = existingNodeOptions ?
        existingNodeOptions + ' ' + leakNodeOptions :
        leakNodeOptions;
    }

    if (seedIp) {
      env[CONTAINER_ENV_KEYS.SEED_NODE_ADDRESS] =
        seedIp + ':' + PORTS.REST;
      env[JOINING_HTTP_TIMEOUT_ENV_KEY] = String(
        resolvePositiveTimeoutMs(
          this._config?.timeouts?.joiningHttpTimeoutMs,
          JOINING_HTTP_TIMEOUT_DEFAULT_MS,
        ),
      );
      env[JOINING_LEADERSHIP_WAIT_TIMEOUT_ENV_KEY] = String(
        resolvePositiveTimeoutMs(
          this._config?.timeouts?.joiningLeadershipWaitTimeoutMs,
          JOINING_LEADERSHIP_WAIT_TIMEOUT_DEFAULT_MS,
        ),
      );
    }
    return env;
  }

  _shouldRecreateReusableContainer(inspect, expectedEnv = {}) {
    if (!inspect || typeof inspect !== 'object') {
      return true;
    }
    for (const [key, value] of Object.entries(expectedEnv)) {
      const currentValue = readContainerInspectEnvValue(inspect, key);
      if (String(currentValue || '') !== String(value)) {
        return true;
      }
    }

    const entrypoint = Array.isArray(inspect?.Config?.Entrypoint) ?
      inspect.Config.Entrypoint :
      [];
    if (entrypoint.length !== REUSE_ENTRYPOINT.length ||
        entrypoint[0] !== REUSE_ENTRYPOINT[0] ||
        entrypoint[1] !== REUSE_ENTRYPOINT[1]) {
      return true;
    }

    const cmd = Array.isArray(inspect?.Config?.Cmd) ?
      inspect.Config.Cmd :
      [];
    if (cmd.length !== REUSE_START_COMMAND_ARGS.length ||
        cmd[0] !== REUSE_START_COMMAND_ARGS[0]) {
      return true;
    }

    return false;
  }

  async _quiesceReusableContainers() {
    if (!this._isContainerReuseEnabled()) {
      return;
    }
    const provider = this._providers[this._hostAssignment[0]];
    for (let index = 0; index < this._config.size; index++) {
      const nodeId = this._buildNodeId(index);
      const containerName = this._buildContainerName(nodeId, index);
      let inspect = null;
      try {
        inspect = await provider.inspectContainerIfExists(containerName);
      } catch (_inspectErr) {
        inspect = null;
      }
      if (!inspect) {
        continue;
      }
      const containerId = inspect.Id || inspect.id || containerName;
      const status = String(inspect?.State?.Status || '').toLowerCase();
      if (status !== CONTAINER_RUNNING_STATUS) {
        continue;
      }
      try {
        await provider.stopContainer(containerId);
      } catch (error) {
        if (!isIgnorableContainerStopError(error)) {
          throw error;
        }
      }
    }
  }

  /**
   * Start the cluster: create network, start seed, wait for
   * bootstrap API, start joiners sequentially, wait for ACTIVE.
   */
  async start() {
    if (!this._cleanupUnregister) {
      this._cleanupUnregister = registerClusterCleanup(
        this._providers[this._hostAssignment[0]],
        this._clusterId,
      );
    }

    try {
      await this._playbackRecorder.start({
        scenarioName: this._scenarioName,
        cluster: this,
        skipInitialCapture: true,
      });
      this._playbackStartWarning = null;
    } catch (_err) {
      // Playback capture is best-effort.
      this._playbackStartWarning = 'Failed to initialize playback capture';
    }

    const provider = this._providers[this._hostAssignment[0]];
    const reuseContainers = this._isContainerReuseEnabled();
    this._networkName = reuseContainers ?
      this._buildReusableNetworkName() :
      NETWORK.NAME_PREFIX + '-' + this._clusterId.slice(0, 8);
    this._recordClusterStage(
      CLUSTER_STAGE_SETUP_NETWORK_CREATING,
      {
        networkName: this._networkName,
      },
    );
    const networkLabels = {
      [LABELS.CLUSTER]: this._clusterId,
    };
    const net = reuseContainers ?
      await provider.ensureNetwork(
        this._networkName,
        networkLabels,
      ) :
      await provider.createNetwork(
        this._networkName,
        networkLabels,
      );
    this._networkId = net.id;
    this._recordClusterStage(
      CLUSTER_STAGE_SETUP_NETWORK_CREATED,
      {
        networkName: this._networkName,
        networkId: this._networkId,
      },
    );
    if (reuseContainers) {
      await this._quiesceReusableContainers();
    }

    const seedId = this._buildNodeId(0);
    this._recordClusterStage(
      CLUSTER_STAGE_SETUP_SEED_STARTING,
      {
        nodeId: seedId,
      },
    );
    const seedNode = await this._startNode(
      seedId,
      NODE_ROLES.SEED,
      null,
      0,
    );
    this._nodes.set(seedId, seedNode);
    this._recordPlaybackEvent(
      PLAYBACK_EVENT_TYPE.NODE_CREATED,
      PLAYBACK_SCOPE_NODE,
      seedId,
      {
        role: NODE_ROLES.SEED,
        ip: seedNode.ip,
        containerId: seedNode.containerId,
      },
    );
    this._recordPlaybackEvent(
      PLAYBACK_EVENT_TYPE.NODE_STARTED,
      PLAYBACK_SCOPE_NODE,
      seedId,
      {
        role: NODE_ROLES.SEED,
      },
    );

    const startupGate = new StartupGate(
      this,
      seedNode,
      seedId,
    );
    await startupGate.waitForSeedJoinReady();

    for (let i = 1; i < this._config.size; i++) {
      const joinerId = this._buildNodeId(i);
      this._recordClusterStage(
        CLUSTER_STAGE_SETUP_JOINER_STARTING,
        {
          nodeId: joinerId,
          ordinal: i,
        },
      );
      const joinerNode = await this._startNode(
        joinerId,
        NODE_ROLES.JOINER,
        seedNode.ip,
        i,
      );
      this._nodes.set(joinerId, joinerNode);
      this._recordPlaybackEvent(
        PLAYBACK_EVENT_TYPE.NODE_CREATED,
        PLAYBACK_SCOPE_NODE,
        joinerId,
        {
          role: NODE_ROLES.JOINER,
          ip: joinerNode.ip,
          containerId: joinerNode.containerId,
        },
      );
      this._recordPlaybackEvent(
        PLAYBACK_EVENT_TYPE.NODE_STARTED,
        PLAYBACK_SCOPE_NODE,
        joinerId,
        {
          role: NODE_ROLES.JOINER,
          seedIp: seedNode.ip,
        },
      );
      this._recordClusterStage(
        CLUSTER_STAGE_SETUP_JOINER_STARTED,
        {
          nodeId: joinerId,
          ordinal: i,
        },
      );
    }

    await startupGate.waitForClusterActive(this._config.size);
    this._started = true;
    this._recordPlaybackEvent(
      PLAYBACK_EVENT_TYPE.CLUSTER_READY,
      PLAYBACK_SCOPE_CLUSTER,
      PLAYBACK_ENTITY_CLUSTER,
      {
        nodeCount: this._nodes.size,
      },
    );

    if (this._config.debugTrace &&
      this._config.debugTrace.enabled === true) {
      try {
        this._traceRecorder = new TraceArtifactRecorder({
          outputDir: this._config.outputDir,
        });
        await this._traceRecorder.start({
          scenarioName: this._scenarioName,
          node: seedNode,
          debugTrace: this._config.debugTrace,
        });
        this._traceManifest = null;
        this._traceStartWarning = null;
      } catch (error) {
        this._traceStartWarning =
          'Failed to initialize trace capture: ' +
          error.message;
      }
    }

    // Initialize chaos primitives now that nodes and network exist
    const primaryProvider =
      this._providers[this._hostAssignment[0]];
    this._chaos = new ChaosPrimitives(
      primaryProvider,
      this._nodes,
      this._networkId,
    );

    // Start live log subscription on the seed node
    this._recordClusterStage(
      CLUSTER_STAGE_SETUP_LOG_SUB_STARTING,
      {
        nodeId: seedId,
      },
    );
    try {
      await this._logCollector.startLiveSubscription(seedNode);
      this._recordClusterStage(
        CLUSTER_STAGE_SETUP_LOG_SUB_READY,
        {
          nodeId: seedId,
        },
      );
    } catch (_err) {
      this._recordClusterStage(
        CLUSTER_STAGE_SETUP_LOG_SUB_FAILED,
        {
          nodeId: seedId,
        },
      );
      // Log collection is best-effort; cluster still usable
    }
  }

  /** Stop and remove all containers, networks, volumes. */
  async stop() {
    const errors = [];
    const reuseContainers = this._isContainerReuseEnabled();
    const keepRunning = this._shouldKeepReuseContainersRunning();
    this._playbackRecorder.suspendPolling();
    this._recordClusterStage(
      CLUSTER_STAGE_TEARDOWN_STARTING,
      {
        nodeCount: this._nodes.size,
      },
    );
    await this._cancelActiveLoadRuns();

    // Collect final log snapshot and run analysis before teardown
    try {
      const seedNode = this._nodes.values().next().value;
      if (seedNode) {
        await this._logCollector.collectFinalSnapshot(seedNode);
      }
    } catch (_err) {
      // Best-effort log collection
    }

    try {
      await this._logCollector.stopSubscription();
    } catch (_err) {
      // Best-effort cleanup
    }

    if (this._traceRecorder) {
      try {
        this._traceManifest = await this._traceRecorder.stop();
      } catch (err) {
        this._traceManifest = {
          warning: 'Failed to finalize trace artifacts: ' + err.message,
        };
      }
    }

    for (const [nodeId, node] of this._nodes) {
      try {
        node.closeQueryConnection();
      } catch (_err) {
        // Best-effort stop
      }
      if (!reuseContainers || !keepRunning) {
        try {
          await node._dockerProvider.stopContainer(
            node.containerId,
          );
          this._recordPlaybackEvent(
            PLAYBACK_EVENT_TYPE.NODE_STOPPED,
            PLAYBACK_SCOPE_NODE,
            nodeId,
            {
              containerId: node.containerId,
            },
          );
        } catch (_err) {
          // Best-effort stop
        }
      }
      if (!reuseContainers) {
        try {
          await node._dockerProvider.removeContainer(
            node.containerId,
          );
          this._recordPlaybackEvent(
            PLAYBACK_EVENT_TYPE.NODE_REMOVED,
            PLAYBACK_SCOPE_NODE,
            nodeId,
            {
              containerId: node.containerId,
            },
          );
        } catch (err) {
          errors.push(
            'Failed to remove container for ' +
            nodeId + ': ' + err.message,
          );
        }
      }
    }

    if (this._networkId && !reuseContainers) {
      try {
        const provider =
          this._providers[this._hostAssignment[0]];
        this._recordClusterStage(
          CLUSTER_STAGE_TEARDOWN_NETWORK_REMOVING,
          {
            networkId: this._networkId,
            networkName: this._networkName,
          },
        );
        await provider.removeNetwork(this._networkId);
        this._recordClusterStage(
          CLUSTER_STAGE_TEARDOWN_NETWORK_REMOVED,
          {
            networkId: this._networkId,
            networkName: this._networkName,
          },
        );
      } catch (err) {
        errors.push(
          'Failed to remove network: ' + err.message,
        );
      }
      this._networkId = null;
    } else if (this._networkId && reuseContainers) {
      this._networkId = null;
    }

    try {
      this._recordClusterStage(
        CLUSTER_STAGE_TEARDOWN_COMPLETE,
        {
          nodeCount: this._nodes.size,
        },
      );
      this._recordClusterStage(
        CLUSTER_STAGE_TEARDOWN_CAPTURE_FINALIZING,
        {},
      );
      this._playbackManifest = await this._playbackRecorder.stop({
        clusterId: this._clusterId,
        nodeCount: this._nodes.size,
      }, {
        skipFinalCapture: true,
      });
      if (this._traceManifest && this._playbackManifest) {
        this._playbackManifest.trace = this._traceManifest;
      }
      if (this._playbackStartWarning && this._playbackManifest) {
        this._playbackManifest.warning = this._playbackStartWarning;
      } else if (this._playbackStartWarning &&
                 !this._playbackManifest) {
        this._playbackManifest = {
          warning: this._playbackStartWarning,
        };
      }
      if (this._traceStartWarning && this._playbackManifest) {
        this._playbackManifest.traceWarning = this._traceStartWarning;
      }
    } catch (err) {
      errors.push(
        'Failed to finalize playback artifacts: ' + err.message,
      );
    }

    this._nodes.clear();

    this._started = false;
    this._unregisterCleanup();
    if (errors.length > 0) {
      process.stderr.write(
        'Cluster stop warnings:\n' +
        errors.join('\n') + '\n',
      );
    }
  }

  async _cancelActiveLoadRuns() {
    if (this._activeLoadRuns.size === 0) {
      return;
    }

    const activeRuns = Array.from(this._activeLoadRuns.values());
    this._activeLoadRuns.clear();

    for (const run of activeRuns) {
      if (typeof run?.cancel !== 'function') {
        continue;
      }
      try {
        run.cancel();
      } catch (_err) {
        // Best-effort cancellation
      }
    }

    await Promise.all(activeRuns.map(async (run) => {
      if (typeof run?.waitComplete !== 'function') {
        return;
      }
      try {
        await run.waitComplete();
      } catch (_err) {
        // Best-effort completion wait
      }
    }));
  }

  _unregisterCleanup() {
    if (typeof this._cleanupUnregister === 'function') {
      this._cleanupUnregister();
      this._cleanupUnregister = null;
    }
  }

  /** Get a node handle by ID. */
  getNode(id) {
    const node = this._nodes.get(id);
    if (!node) {
      throw new Error('Node "' + id + '" not found in cluster');
    }
    return node;
  }

  /** Get all node handles. */
  getNodes() {
    return Array.from(this._nodes.values());
  }

  /** Pick a random non-seed node ID. */
  randomNonSeed() {
    const joiners = Array.from(this._nodes.values())
      .filter((n) => n.role === NODE_ROLES.JOINER);
    if (joiners.length === 0) {
      throw new Error('No non-seed nodes in cluster');
    }
    const idx = Math.floor(Math.random() * joiners.length);
    return joiners[idx].id;
  }

  // --- Delegated component methods ---

  async waitForConvergence(options) {
    const nodes = Array.from(this._nodes.values());
    return waitForConvergence(nodes, options);
  }

  async assertConsistency() {
    const nodes = Array.from(this._nodes.values());
    return assertConsistency(nodes);
  }

  async assertDataIntegrity(table, expectedRows) {
    const nodes = Array.from(this._nodes.values());
    return assertDataIntegrity(nodes, table, expectedRows);
  }

  async killNode(id) {
    return this._runChaosAction('killNode', id, null, () =>
      this._chaos.killNode(id),
    );
  }

  async stopNode(id) {
    return this._runChaosAction('stopNode', id, null, () =>
      this._chaos.stopNode(id),
    );
  }

  async pauseNode(id) {
    return this._runChaosAction('pauseNode', id, null, () =>
      this._chaos.pauseNode(id),
    );
  }

  async unpauseNode(id) {
    return this._runChaosAction('unpauseNode', id, null, () =>
      this._chaos.unpauseNode(id),
    );
  }

  async restartNode(id) {
    return this._runChaosAction('restartNode', id, null, () =>
      this._chaos.restartNode(id),
    );
  }

  async partitionNetwork(groupA, groupB) {
    return this._runChaosAction(
      'partitionNetwork',
      'network',
      {groupA, groupB},
      () => this._chaos.partitionNetwork(groupA, groupB),
    );
  }

  async healPartition() {
    return this._runChaosAction('healPartition', 'network', null, () =>
      this._chaos.healPartition(),
    );
  }

  async slowNetwork(nodeId, options) {
    return this._runChaosAction('slowNetwork', nodeId, options, () =>
      this._chaos.slowNetwork(nodeId, options),
    );
  }

  async corruptDisk(nodeId, path) {
    return this._runChaosAction(
      'corruptDisk',
      nodeId,
      {path},
      () => this._chaos.corruptDisk(nodeId, path),
    );
  }

  startLoad(options) {
    const nodes = Array.from(this._nodes.values());
    const generator = new LoadGenerator(nodes, options);
    const run = generator.start();
    this._activeLoadRuns.add(run);
    let stopped = false;
    let cancelled = false;
    let progressTimer = null;
    this._recordPlaybackEvent(
      PLAYBACK_EVENT_TYPE.LOAD_STARTED,
      PLAYBACK_SCOPE_LOAD,
      LOAD_RUN_ENTITY,
      {
        options: options || {},
      },
    );

    const clearProgressTimer = () => {
      if (progressTimer !== null) {
        clearInterval(progressTimer);
        progressTimer = null;
      }
    };

    const recordProgress = () => {
      if (stopped || typeof run.getMetrics !== 'function') {
        return;
      }
      this._recordPlaybackEvent(
        PLAYBACK_EVENT_TYPE.LOAD_PROGRESS,
        PLAYBACK_SCOPE_LOAD,
        LOAD_RUN_ENTITY,
        {
          metrics: run.getMetrics(),
          cancelled,
        },
      );
    };

    const finalize = (details) => {
      if (stopped) {
        return;
      }
      stopped = true;
      this._activeLoadRuns.delete(run);
      clearProgressTimer();
      this._recordPlaybackEvent(
        PLAYBACK_EVENT_TYPE.LOAD_COMPLETED,
        PLAYBACK_SCOPE_LOAD,
        LOAD_RUN_ENTITY,
        details,
      );
    };

    recordProgress();
    progressTimer = setInterval(
      recordProgress,
      LOAD_PROGRESS_INTERVAL_MS,
    );

    const waitComplete = run.waitComplete.bind(run);
    const completionPromise = waitComplete()
      .then((metrics) => {
        finalize({
          metrics,
          cancelled,
        });
        return metrics;
      })
      .catch((error) => {
        finalize({
          cancelled,
          error: error?.message || 'load-run-failed',
        });
        throw error;
      });

    run.waitComplete = async () => completionPromise;

    if (typeof run.cancel === 'function') {
      const cancel = run.cancel.bind(run);
      run.cancel = () => {
        cancelled = true;
        clearProgressTimer();
        return cancel();
      };
    }

    completionPromise.catch(() => {
      // Prevent unhandled rejection when waitComplete is not awaited.
    });

    return run;
  }

  /**
   * Get the LogCollector instance for direct access.
   * @returns {LogCollector}
   */
  getLogCollector() {
    return this._logCollector;
  }

  /**
   * Get the LogAnalyzer instance for direct access.
   * @returns {LogAnalyzer}
   */
  getLogAnalyzer() {
    return this._logAnalyzer;
  }

  /**
   * Set scenario context for capture artifacts.
   * @param {string} scenarioName
   */
  setScenarioName(scenarioName) {
    if (typeof scenarioName !== 'string' ||
        scenarioName.length === 0) {
      return;
    }
    this._scenarioName = scenarioName;
  }

  /**
   * Get finalized playback manifest generated on stop().
   * @returns {Object|null}
   */
  getPlaybackManifest() {
    return this._playbackManifest;
  }

  /**
   * Get finalized trace manifest generated on stop().
   * @returns {Object|null}
   */
  getTraceManifest() {
    if (this._traceManifest) {
      return this._traceManifest;
    }
    if (this._traceStartWarning) {
      return {warning: this._traceStartWarning};
    }
    return null;
  }

  // --- Internal helpers ---

  _recordPlaybackEvent(type, scope, entityId, details) {
    try {
      this._playbackRecorder.recordEvent({
        type,
        scope,
        entityId,
        details,
      });
    } catch (_err) {
      // Best-effort playback recording
    }
  }

  _recordClusterStage(stage, details = {}) {
    this._recordPlaybackEvent(
      PLAYBACK_EVENT_TYPE.CLUSTER_STAGE,
      PLAYBACK_SCOPE_CLUSTER,
      PLAYBACK_ENTITY_CLUSTER,
      {
        stage,
        ...details,
      },
    );
  }

  _recordPeriodicStartupWaitingStage(stage, attemptResult, details = {}) {
    const attempts = Number(attemptResult?.attempts) || 0;
    if (attempts % STARTUP_GATE_WAITING_EVENT_INTERVAL !== 0) {
      return;
    }
    this._recordClusterStage(
      stage,
      {
        attempts,
        elapsedMs: Number(attemptResult?.elapsedMs) || 0,
        ...details,
      },
    );
  }

  async _runChaosAction(action, entityId, details, operation) {
    this._recordPlaybackEvent(
      PLAYBACK_EVENT_TYPE.CHAOS_ACTION_STARTED,
      PLAYBACK_SCOPE_CHAOS,
      entityId,
      {
        action,
        details: details || {},
      },
    );
    const result = await operation();
    this._recordPlaybackEvent(
      PLAYBACK_EVENT_TYPE.CHAOS_ACTION_COMPLETED,
      PLAYBACK_SCOPE_CHAOS,
      entityId,
      {
        action,
        details: details || {},
      },
    );
    return result;
  }

  async _startNode(nodeId, role, seedIp, nodeIndex) {
    const providerIdx = this._hostAssignment[nodeIndex];
    const provider = this._providers[providerIdx];
    const reuseContainers = this._isContainerReuseEnabled();
    const containerName = this._buildContainerName(nodeId, nodeIndex);

    const env = this._buildNodeEnv(nodeId, containerName, seedIp);

    const labels = {
      [LABELS.CLUSTER]: this._clusterId,
      [LABELS.NODE_ID]: nodeId,
      [LABELS.ROLE]: role,
    };
    const dockerBinds = Array.isArray(this._config?.docker?.binds) ?
      this._config.docker.binds.filter((entry) =>
        typeof entry === 'string' && entry.length > 0) :
      [];
    const hostConfigExtras = dockerBinds.length > 0 ?
      {[DOCKER_HOST_CONFIG_BINDS_KEY]: dockerBinds} :
      null;
    const startTimeout = this._config.timeouts?.nodeStartup ||
      TIMEOUTS.NODE_STARTUP;

    if (reuseContainers) {
      let existing = null;
      try {
        existing = await provider.inspectContainerIfExists(containerName);
      } catch (_inspectErr) {
        existing = null;
      }
      if (existing &&
          this._shouldRecreateReusableContainer(
            existing,
            env,
          )) {
        const existingContainerId = existing.Id || existing.id || containerName;
        try {
          await provider.removeContainer(existingContainerId);
          existing = null;
        } catch (err) {
          await this._collectFailureLogs();
          throw new Error(
            'Node "' + nodeId + '" (' + role +
            ') failed to reset reusable container: ' + err.message,
          );
        }
      }

      if (existing) {
        const containerId = existing.Id || existing.id || containerName;
        try {
          const status = String(existing?.State?.Status || '').toLowerCase();
          if (status === CONTAINER_RUNNING_STATUS) {
            await provider.restartContainer(containerId);
          } else {
            await provider.startContainer(containerId, startTimeout);
          }

          let refreshed = await provider.inspectContainer(containerId);
          const networks = refreshed?.NetworkSettings?.Networks;
          const connectedToRunNetwork = networks &&
            Object.prototype.hasOwnProperty.call(
              networks,
              this._networkName,
            );
          if (!connectedToRunNetwork && this._networkId) {
            await provider.connectToNetwork(this._networkId, containerId);
            refreshed = await provider.inspectContainer(containerId);
          }

          const ip = refreshed?.NetworkSettings?.Networks?.[
            this._networkName
          ]?.IPAddress || '';
          return new NodeHandle(
            nodeId,
            containerId,
            ip,
            role,
            provider,
          );
        } catch (err) {
          await this._collectFailureLogs();
          throw new Error(
            'Node "' + nodeId + '" (' + role +
            ') failed to reuse container: ' + err.message,
          );
        }
      }
    }

    let result;
    try {
      result = await provider.createContainer({
        name: containerName,
        image: this._config.image,
        network: this._networkName,
        env,
        labels,
        resourceLimits: this._config.resourceLimits || {},
        startTimeout,
        hostConfigExtras,
        ...(reuseContainers ?
          {
            entrypoint: REUSE_ENTRYPOINT,
            command: REUSE_START_COMMAND_ARGS,
          } :
          {}),
      });
    } catch (err) {
      await this._collectFailureLogs();
      throw new Error(
        'Node "' + nodeId + '" (' + role +
        ') failed to start: ' + err.message,
      );
    }

    return new NodeHandle(
      nodeId,
      result.containerId,
      result.ip,
      role,
      provider,
    );
  }

  async _waitForBootstrapApi(seedNode) {
    const timeout = this._config.timeouts?.nodeStartup ||
      TIMEOUTS.NODE_STARTUP;
    const stableWindowMs = Math.max(
      0,
      this._config.timeouts?.bootstrapReadyStableWindowMs ??
        BOOTSTRAP_READY_STABLE_WINDOW_MS,
    );
    const deadline = Date.now() + timeout;
    const bootstrapJoinReadyUrl =
      'http://' + seedNode.ip + ':' + PORTS.REST + BOOTSTRAP_JOIN_READY_PATH;
    const statusCounts = new Map();
    const phaseCounts = new Map();
    const reasonCounts = new Map();
    let successWindowStartedAt = null;
    const pollResult = await pollUntilCondition({
      deadline,
      intervalMs: BOOTSTRAP_POLL_INTERVAL_MS,
      sleep: (ms) => this._sleep(ms),
      probe: async () => {
        const probeResponse = await this._httpRequest({
          url: bootstrapJoinReadyUrl,
          timeoutMs: BOOTSTRAP_WAIT_REQUEST_TIMEOUT_MS,
          method: HTTP_METHOD_GET,
          includeBody: true,
        });
        const normalizedProbe =
          this._normalizeBootstrapReadinessProbeResult(probeResponse);
        const status = normalizedProbe.status;
        statusCounts.set(
          status,
          (statusCounts.get(status) || 0) + 1,
        );
        if (normalizedProbe.phase) {
          phaseCounts.set(
            normalizedProbe.phase,
            (phaseCounts.get(normalizedProbe.phase) || 0) + 1,
          );
        }
        for (const reason of normalizedProbe.reasons) {
          reasonCounts.set(
            reason,
            (reasonCounts.get(reason) || 0) + 1,
          );
        }
        const now = Date.now();
        const success = status >= HTTP_OK_LOWER &&
          status <= HTTP_OK_UPPER;
        if (success) {
          if (successWindowStartedAt === null) {
            successWindowStartedAt = now;
          }
        } else {
          successWindowStartedAt = null;
        }
        const stableElapsedMs = successWindowStartedAt === null ?
          0 :
          now - successWindowStartedAt;
        return {
          status,
          phase: normalizedProbe.phase,
          success,
          state: normalizedProbe.state,
          reasons: normalizedProbe.reasons,
          retryAfterMs: normalizedProbe.retryAfterMs,
          stableElapsedMs,
          stable: success && stableElapsedMs >= stableWindowMs,
        };
      },
      isSuccess: (result) => {
        return result.stable === true;
      },
      onAttempt: ({attempts, elapsedMs, lastResult}) => {
        this._recordPeriodicStartupWaitingStage(
          CLUSTER_STAGE_SETUP_SEED_BOOTSTRAP_WAITING,
          {
            attempts,
            elapsedMs,
          },
          {
            nodeId: seedNode.id,
            lastStatus: lastResult?.status ?? null,
            lastPhase: lastResult?.phase ?? null,
            lastState: lastResult?.state ?? null,
            lastReasons: lastResult?.reasons || [],
            stableWindowMs,
            stableElapsedMs: lastResult?.stableElapsedMs ?? 0,
          },
        );
      },
    });

    if (pollResult.success) {
      return;
    }

    await this._collectFailureLogs();
    const statusSummary = formatCountSummary(statusCounts);
    const phaseSummary = formatCountSummary(phaseCounts);
    const reasonSummary = formatCountSummary(reasonCounts);
    const lastStatus = pollResult.lastResult?.status ?? null;
    const lastPhase = pollResult.lastResult?.phase || UNKNOWN_PHASE;
    const lastState = pollResult.lastResult?.state || UNKNOWN_STATE;
    const lastReasons = Array.isArray(pollResult.lastResult?.reasons) &&
      pollResult.lastResult.reasons.length > 0 ?
      pollResult.lastResult.reasons.join(',') :
      'none';
    throw new Error(
      'Seed node bootstrap API did not become join-ready ' +
      'within ' + timeout + 'ms' +
      ' (attempts=' + pollResult.attempts +
      ', lastStatus=' + String(lastStatus) +
      ', lastPhase=' + lastPhase +
      ', lastState=' + lastState +
      ', lastReasons=' + lastReasons +
      ', stableWindowMs=' + stableWindowMs +
      ', elapsedMs=' + pollResult.elapsedMs +
      ', statusCounts=' + (statusSummary || 'none') +
      ', phaseCounts=' + (phaseSummary || 'none') +
      ', reasonCounts=' + (reasonSummary || 'none') +
      ')',
    );
  }

  _normalizeBootstrapReadinessProbeResult(probeResponse) {
    const normalized = {
      status: HTTP_ERROR_STATUS,
      phase: null,
      state: null,
      reasons: [],
      retryAfterMs: null,
    };

    if (typeof probeResponse === 'number') {
      normalized.status = probeResponse;
      return normalized;
    }

    if (!probeResponse || typeof probeResponse !== 'object') {
      return normalized;
    }

    normalized.status = Number.isFinite(probeResponse.status) ?
      Math.floor(probeResponse.status) :
      HTTP_ERROR_STATUS;

    const body = probeResponse.body;
    if (!body || typeof body !== 'object') {
      return normalized;
    }

    normalized.phase = typeof body.phase === 'string' ? body.phase : null;
    normalized.state = typeof body.state === 'string' ? body.state : null;
    normalized.reasons = Array.isArray(body.reasons) ?
      body.reasons.map((reason) => String(reason)) :
      [];
    normalized.retryAfterMs = Number.isFinite(body.retryAfterMs) ?
      Math.floor(body.retryAfterMs) :
      null;
    return normalized;
  }

  async _probeClusterActiveState(deadline) {
    const nodes = [...this._nodes.values()];
    const nodeDiagnostics = await Promise.all(nodes.map(async (node) => {
      const remainingMs = Math.max(MIN_TIMEOUT_MS, deadline - Date.now());
      const probeTimeoutMs = Math.min(
        ADMIN_QUERY_TIMEOUT_MS,
        remainingMs,
      );
      try {
        let active = false;
        let state = INACTIVE_STATE;
        let phase = null;
        let reasons = [];

        if (typeof node.probeBootstrapReadiness === 'function') {
          const readiness = await withTimeout(
            node.probeBootstrapReadiness({
              timeoutMs: probeTimeoutMs,
            }),
            probeTimeoutMs,
            'Node readiness probe timed out for ' + node.id,
          );
          active = readiness.status >= HTTP_OK_LOWER &&
            readiness.status <= HTTP_OK_UPPER;
          phase = typeof readiness.phase === 'string' ?
            readiness.phase :
            null;
          reasons = Array.isArray(readiness.reasons) ?
            readiness.reasons :
            [];
          if (active) {
            state = ACTIVE_STATE.toLowerCase();
          } else if (typeof readiness.state === 'string' &&
              readiness.state.length > 0) {
            state = readiness.state.toLowerCase();
          } else if (phase && phase.length > 0) {
            state = phase.toLowerCase();
          }
        } else {
          const status = await withTimeout(
            node.getStatus({
              timeoutMs: probeTimeoutMs,
              lane: ADMIN_SOCKET_LANE_PROBE,
            }),
            probeTimeoutMs,
            'Node status probe timed out for ' + node.id,
          );
          active = this._isNodeActive(status);
          state = active ?
            ACTIVE_STATE.toLowerCase() :
            (this._extractNodeState(status) || INACTIVE_STATE);
        }

        return {
          nodeId: node.id,
          active,
          state,
          phase,
          reasons,
          error: null,
        };
      } catch (error) {
        return {
          nodeId: node.id,
          active: false,
          state: INACTIVE_STATE,
          error: normalizeProbeError(error),
        };
      }
    }));
    const activeByStatus = nodeDiagnostics.every(
      (diagnostic) => diagnostic.active === true,
    );
    const snapshotCoverage = await this._probeControlSnapshotCoverage(
      deadline,
      nodes.map((node) => node.id),
    );

    return {
      allActive: activeByStatus && snapshotCoverage.completeCoverage === true,
      nodeDiagnostics,
      snapshotCoverage,
    };
  }

  _extractControlSnapshotNodes(snapshotResult) {
    const rows = Array.isArray(snapshotResult?.rows) ?
      snapshotResult.rows :
      [];
    if (rows.length === 0) {
      return [];
    }
    const row = rows[0];
    const nodes = Array.isArray(row?.[CONTROL_SNAPSHOT_NODES_FIELD]) ?
      row[CONTROL_SNAPSHOT_NODES_FIELD] :
      [];
    return nodes
      .map((nodeId) => String(nodeId))
      .filter((nodeId) => nodeId.length > 0);
  }

  async _probeControlSnapshotCoverage(deadline, expectedNodeIds = []) {
    const expectedNodeSet = new Set(
      expectedNodeIds.map((nodeId) => String(nodeId)),
    );
    const nodes = [...this._nodes.values()];
    nodes.sort((left, right) => {
      const leftRank = left.role === NODE_ROLES.SEED ? 0 : 1;
      const rightRank = right.role === NODE_ROLES.SEED ? 0 : 1;
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }
      return String(left.id).localeCompare(String(right.id));
    });

    const snapshotProbeResults = [];
    for (const node of nodes) {
      const remainingMs = Math.max(MIN_TIMEOUT_MS, deadline - Date.now());
      const snapshotTimeoutMs = Math.min(
        CONTROL_SNAPSHOT_PROBE_TIMEOUT_MS,
        remainingMs,
      );
      try {
        const snapshotResult = await node.getControlSnapshot({
          timeoutMs: snapshotTimeoutMs,
          lane: ADMIN_SOCKET_LANE_SNAPSHOT,
        });
        const observedNodeIds = this._extractControlSnapshotNodes(snapshotResult);
        const observedNodeSet = new Set(observedNodeIds);
        let missingExpectedNodeCount = 0;
        for (const expectedNodeId of expectedNodeSet) {
          if (!observedNodeSet.has(expectedNodeId)) {
            missingExpectedNodeCount += 1;
          }
        }
        snapshotProbeResults.push({
          nodeId: node.id,
          error: null,
          observedNodeCount: observedNodeSet.size,
          missingExpectedNodeCount,
        });
        if (missingExpectedNodeCount === 0) {
          break;
        }
      } catch (error) {
        snapshotProbeResults.push({
          nodeId: node.id,
          error: normalizeProbeError(error),
          observedNodeCount: 0,
          missingExpectedNodeCount: expectedNodeSet.size,
        });
      }
    }
    const bestCoverageNodeCount = snapshotProbeResults.reduce(
      (maxCoverage, result) => Math.max(maxCoverage, result.observedNodeCount),
      0,
    );
    const completeCoverage = snapshotProbeResults.some(
      (result) => result.missingExpectedNodeCount === 0,
    );
    return {
      completeCoverage,
      expectedNodeCount: expectedNodeSet.size,
      bestCoverageNodeCount,
    };
  }

  _resolveActiveWaitTimeoutMs() {
    const baseTimeout = this._config.timeouts?.convergence ||
      TIMEOUTS.CONVERGENCE;
    const configuredClusterSize = Number.isInteger(this._config?.size) ?
      this._config.size :
      0;
    const expectedNodeCount = Math.max(
      ACTIVE_WAIT_MIN_CLUSTER_SIZE,
      configuredClusterSize,
      this._nodes.size,
    );
    const extraNodeCount = Math.max(
      0,
      expectedNodeCount - ACTIVE_WAIT_MIN_CLUSTER_SIZE,
    );
    if (extraNodeCount === 0) {
      return baseTimeout;
    }
    const scaledTimeout = baseTimeout + Math.floor(
      (baseTimeout * extraNodeCount *
        ACTIVE_WAIT_TIMEOUT_SCALE_PERCENT_PER_EXTRA_NODE) /
      ACTIVE_WAIT_TIMEOUT_SCALE_PERCENT_DENOMINATOR,
    );
    const maxScaledTimeout = baseTimeout * ACTIVE_WAIT_TIMEOUT_MAX_MULTIPLIER;
    return Math.min(scaledTimeout, maxScaledTimeout);
  }

  async _waitForAllActive() {
    const timeout = this._resolveActiveWaitTimeoutMs();
    const deadline = Date.now() + timeout;
    const inactiveSummaryCounts = new Map();
    const pollResult = await pollUntilCondition({
      deadline,
      intervalMs: ACTIVE_POLL_INTERVAL_MS,
      sleep: (ms) => this._sleep(ms),
      probe: () => this._probeClusterActiveState(deadline),
      isSuccess: (result) => result.allActive === true,
      onAttempt: ({attempts, elapsedMs, lastResult}) => {
        for (const diagnostic of lastResult.nodeDiagnostics || []) {
          if (diagnostic.active === true) {
            continue;
          }
          const summaryKey = diagnostic.error ?
            'error:' + diagnostic.error :
            'state:' + (diagnostic.state || UNKNOWN_STATE);
          inactiveSummaryCounts.set(
            summaryKey,
            (inactiveSummaryCounts.get(summaryKey) || 0) + 1,
          );
        }

        this._recordPeriodicStartupWaitingStage(
          CLUSTER_STAGE_SETUP_CLUSTER_WAITING_ACTIVE,
          {
            attempts,
            elapsedMs,
          },
          {
            nodeDiagnostics: lastResult.nodeDiagnostics || [],
            snapshotCoverage: lastResult.snapshotCoverage || null,
          },
        );
      },
    });

    if (pollResult.success) {
      return;
    }

    await this._collectFailureLogs();
    const nodeDiagnosticsSummary = formatNodeDiagnostics(
      pollResult.lastResult?.nodeDiagnostics || [],
    );
    const inactiveSummary = formatCountSummary(inactiveSummaryCounts);
    const snapshotCoverageSummary = formatSnapshotCoverage(
      pollResult.lastResult?.snapshotCoverage || null,
    );
    throw new Error(
      'Not all nodes reached ' + ACTIVE_STATE +
      ' state within ' + timeout + 'ms' +
      ' (attempts=' + pollResult.attempts +
      ', elapsedMs=' + pollResult.elapsedMs +
      ', nodeDiagnostics=' + (nodeDiagnosticsSummary || 'none') +
      ', snapshotCoverage=' + snapshotCoverageSummary +
      ', inactiveSummary=' + (inactiveSummary || 'none') +
      ')',
    );
  }

  _extractNodeState(status) {
    if (!status) {
      return null;
    }
    if (Array.isArray(status.rows) && status.rows.length > 0) {
      const row = status.rows[0];
      if (typeof row.status === 'string' && row.status.length > 0) {
        return row.status.toLowerCase();
      }
      if (typeof row.state === 'string' && row.state.length > 0) {
        return row.state.toLowerCase();
      }
    }
    if (typeof status.status === 'string' && status.status.length > 0) {
      return status.status.toLowerCase();
    }
    if (typeof status.state === 'string' && status.state.length > 0) {
      return status.state.toLowerCase();
    }
    return null;
  }

  _isNodeActive(status) {
    if (!status) return false;
    if (status.rows && status.rows.length > 0) {
      return this._isActiveValue(status.rows[0].status) ||
        this._isActiveValue(status.rows[0].state);
    }
    if (this._isActiveValue(status.status)) return true;
    if (this._isActiveValue(status.state)) return true;
    return false;
  }

  _isActiveValue(value) {
    if (typeof value !== 'string') {
      return false;
    }
    return value.toLowerCase() === STATUS_ACTIVE_LOWER;
  }

  async _collectFailureLogs() {
    for (const node of this._nodes.values()) {
      try {
        const logs = await withTimeout(
          node.getLogs({tail: LOG_TAIL_LINES}),
          LOG_COLLECTION_TIMEOUT_MS,
          'Timed out collecting logs for node ' + node.id,
        );
        process.stderr.write(
          '--- Logs from ' + node.id +
          ' (' + node.role + ') ---\n' + logs + '\n',
        );
      } catch (_err) {
        // Best-effort log collection
      }
    }
  }

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Best-effort cleanup of Docker resources on unexpected exit.
 * Lists containers by cluster label and removes them.
 * Req 2.6
 */
async function bestEffortCleanup(provider, clusterId) {
  try {
    const containers = await provider.listContainers({
      [LABELS.CLUSTER]: clusterId,
    });
    for (const container of containers) {
      try {
        await provider.removeContainer(container.Id);
      } catch (_err) {
        // Best-effort
      }
    }
  } catch (_err) {
    // Best-effort
  }
}

/**
 * Register one cluster for process-level best-effort cleanup.
 * @param {DockerProvider} provider
 * @param {string} clusterId
 * @return {Function}
 */
function registerClusterCleanup(provider, clusterId) {
  registerProcessCleanupHandlers();
  PROCESS_CLEANUP_REGISTRY.set(clusterId, {
    provider,
    clusterId,
  });
  return () => {
    PROCESS_CLEANUP_REGISTRY.delete(clusterId);
  };
}

/**
 * Install process cleanup handlers once per process.
 */
function registerProcessCleanupHandlers() {
  if (processCleanupHandlersRegistered) {
    return;
  }
  processCleanupHandlersRegistered = true;

  process.on(PROCESS_EVENT_EXIT, handleExitCleanup);
  for (const signal of PROCESS_SIGNAL_EVENTS) {
    process.on(signal, handleSignalCleanup);
  }
  process.on(PROCESS_EVENT_UNCAUGHT_EXCEPTION, handleExceptionCleanup);
}

/**
 * Snapshot and clear current cleanup registrations.
 * @return {Array<Object>}
 */
function drainCleanupRegistry() {
  const entries = Array.from(PROCESS_CLEANUP_REGISTRY.values());
  PROCESS_CLEANUP_REGISTRY.clear();
  return entries;
}

/**
 * Trigger best-effort cleanup for all registered clusters.
 * @param {Array<Object>} entries
 * @return {Promise<void>}
 */
async function cleanupEntries(entries) {
  await Promise.all(
    entries.map((entry) =>
      bestEffortCleanup(entry.provider, entry.clusterId),
    ),
  );
}

/**
 * Handle process exit event.
 */
function handleExitCleanup() {
  const entries = drainCleanupRegistry();
  for (const entry of entries) {
    bestEffortCleanup(entry.provider, entry.clusterId).catch(() => {});
  }
}

/**
 * Handle SIGINT/SIGTERM and preserve default process termination.
 * @param {string} signal
 */
function handleSignalCleanup(signal) {
  const entries = drainCleanupRegistry();
  cleanupEntries(entries)
    .catch(() => {})
    .finally(() => {
      process.removeListener(signal, handleSignalCleanup);
      process.kill(process.pid, signal);
    });
}

/**
 * Handle uncaught exceptions without swallowing the original failure.
 * @param {Error} error
 */
function handleExceptionCleanup(error) {
  const entries = drainCleanupRegistry();
  cleanupEntries(entries)
    .catch(() => {})
    .finally(() => {
      process.removeListener(
        PROCESS_EVENT_UNCAUGHT_EXCEPTION,
        handleExceptionCleanup,
      );
      process.nextTick(() => {
        throw error;
      });
    });
}

/**
 * Create a cluster.
 * Req 2.1, 2.2, 2.3
 *
 * @param {Object} config - Parsed cluster configuration
 * @returns {Cluster}
 */
function createCluster(config) {
  let providers;
  let hostAssignment;
  const dockerOperationSink =
    typeof config?.[CLUSTER_CONFIG_DOCKER_OPERATION_SINK] === 'function' ?
      config[CLUSTER_CONFIG_DOCKER_OPERATION_SINK] :
      null;

  if (config.docker.hosts && config.docker.hosts.length > 0) {
    providers = config.docker.hosts.map(
      (host) => new DockerProvider({
        host,
        operationSink: dockerOperationSink,
      }),
    );
    const nodesPerHost = config.nodesPerHost || config.size;
    hostAssignment = distributeNodes(
      config.size,
      providers,
      nodesPerHost,
    );
  } else {
    providers = [new DockerProvider({
      socketPath: config.docker.socketPath,
      operationSink: dockerOperationSink,
    })];
    hostAssignment = new Array(config.size).fill(0);
  }

  const cluster = new Cluster(config, providers, hostAssignment);

  registerProcessCleanupHandlers();

  return cluster;
}

export {createCluster, Cluster, NodeHandle, distributeNodes};
