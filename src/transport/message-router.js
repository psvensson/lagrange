/**
 * MessageRouter - Unified message routing for local and cross-node communication.
 * Routes messages through local handlers or WebSocket connections.
 * Requirements: 4.21, 4.22, 11.6, 11.7, 11.8, 11.9
 */

import {EventEmitter} from 'events';
import {URL} from 'url';
import {v4 as uuidv4} from 'uuid';
import WebSocket, {WebSocketServer} from 'ws';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {LoggingService} from '../logging/logging-service.js';
import {
  CONNECTION_STATE,
  OUTBOUND_DELIVERY_PRIORITY,
  ROUTER_ADDRESS,
  ROUTER_ERROR_MSG,
  ROUTER_LOG_MSG,
  ROUTER_MESSAGE_TYPE,
  ROUTER_VALID_ENTITY_TYPES,
  TRANSPORT_CONFIG_KEY,
  TRANSPORT_DEFAULT,
  TRANSPORT_ERROR_MSG,
  TRANSPORT_EVENT,
  TRANSPORT_FORMAT,
  TRANSPORT_METRIC,
  TRANSPORT_METRIC_TRIGGER,
  TRANSPORT_NUM,
  TRANSPORT_SUBSYSTEM,
  TRANSPORT_TYPEOF,
  normalizeToWebSocketAddress,
} from '../constants/transport.js';
import {HOST, METRICS_LOG_TAG} from '../constants/index.js';

// queueMicrotask is a global in Node.js, but ESLint doesn't know about it
const queueMicrotaskFn = globalThis.queueMicrotask;

const ConnectionState = CONNECTION_STATE;
const RouterMessageType = ROUTER_MESSAGE_TYPE;
const IPV6_ANY_HOST = '::';
const IPV6_HOST_PREFIX = '[';
const IPV6_HOST_SUFFIX = ']';
const WEBSOCKET_CONNECT_TIMEOUT_CONFIG_KEY = 'timeout.websocketConnectMs';
const WEBSOCKET_CONNECT_TIMEOUT_ERROR_CODE = 'WS_CONNECT_TIMEOUT';
const RECONNECT_ADDRESS_SUPPRESSION_DEFAULT_MS = 5000;
const ROUTER_NO_CONNECTION_ERROR_CODE = 'ROUTER_NO_CONNECTION';
const ROUTER_CONNECTION_CLOSED_ERROR_CODE = 'ROUTER_CONNECTION_CLOSED';
const ROUTER_MESSAGE_TIMEOUT_ERROR_CODE = 'ROUTER_MESSAGE_TIMEOUT';
const QUEUE_WAIT_BUCKETS = Object.freeze([
  {upperBoundMs: 1, label: 'le_1ms'},
  {upperBoundMs: 5, label: 'le_5ms'},
  {upperBoundMs: 10, label: 'le_10ms'},
  {upperBoundMs: 25, label: 'le_25ms'},
  {upperBoundMs: 50, label: 'le_50ms'},
  {upperBoundMs: 100, label: 'le_100ms'},
  {upperBoundMs: 500, label: 'le_500ms'},
  {upperBoundMs: 1000, label: 'le_1000ms'},
]);
const QUEUE_WAIT_BUCKET_OVERFLOW = 'gt_1000ms';
const QUERY_DATA_PLANE_MESSAGE_TYPE = 'QUERY';
const OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE =
  'ROUTER_OUTBOUND_QUEUE_BACKPRESSURED';
const OutboundDeliveryPriority = OUTBOUND_DELIVERY_PRIORITY;

// In-process transport for test environments. This is only enabled when explicitly
// requested via options.inProcess to avoid hidden behavior in production.
const INPROC = globalThis.__DDB_INPROC_MESSAGE_ROUTER__ ||= {
  serversByPort: new Map(), // port -> {router, nodeId}
};

class InProcWebSocket extends EventEmitter {
  constructor() {
    super();
    this.readyState = WebSocket.CONNECTING;
    this._peer = null;
  }

  _setPeer(peer) {
    this._peer = peer;
  }

  _open() {
    this.readyState = WebSocket.OPEN;
    queueMicrotaskFn(() => this.emit(TRANSPORT_EVENT.OPEN));
  }

  send(data) {
    if (this.readyState !== WebSocket.OPEN || !this._peer) {
      return;
    }
    // Deliver asynchronously to preserve ordering without recursion.
    queueMicrotaskFn(() => {
      if (this._peer.readyState === WebSocket.OPEN) {
        this._peer.emit(TRANSPORT_EVENT.MESSAGE, data);
      }
    });
  }

  close() {
    this.terminate();
  }

  terminate() {
    if (this.readyState === WebSocket.CLOSED) {
      return;
    }
    this.readyState = WebSocket.CLOSED;
    queueMicrotaskFn(() => this.emit(TRANSPORT_EVENT.CLOSE));
    if (this._peer && this._peer.readyState !== WebSocket.CLOSED) {
      this._peer.readyState = WebSocket.CLOSED;
      queueMicrotaskFn(() => this._peer.emit(TRANSPORT_EVENT.CLOSE));
    }
  }
}

function createInProcWebSocketPair() {
  const a = new InProcWebSocket();
  const b = new InProcWebSocket();
  a._setPeer(b);
  b._setPeer(a);
  a._open();
  b._open();
  return {a, b};
}

function normalizeIdentifier(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized.length > TRANSPORT_NUM.ZERO ? normalized : null;
}

function createQueueWaitHistogram() {
  const histogram = {};
  for (const bucket of QUEUE_WAIT_BUCKETS) {
    histogram[bucket.label] = TRANSPORT_NUM.ZERO;
  }
  histogram[QUEUE_WAIT_BUCKET_OVERFLOW] = TRANSPORT_NUM.ZERO;
  return histogram;
}

function resolveQueueWaitBucket(durationMs) {
  const normalized = Number.isFinite(durationMs) ?
    Math.max(TRANSPORT_NUM.ZERO, Math.floor(durationMs)) :
    TRANSPORT_NUM.ZERO;
  for (const bucket of QUEUE_WAIT_BUCKETS) {
    if (normalized <= bucket.upperBoundMs) {
      return bucket.label;
    }
  }
  return QUEUE_WAIT_BUCKET_OVERFLOW;
}

function recordQueueWaitDuration(queue, durationMs) {
  if (!queue) {
    return;
  }
  const normalized = Number.isFinite(durationMs) ?
    Math.max(TRANSPORT_NUM.ZERO, Math.floor(durationMs)) :
    TRANSPORT_NUM.ZERO;
  queue.queueWaitSampleCount =
    (queue.queueWaitSampleCount || TRANSPORT_NUM.ZERO) +
    TRANSPORT_NUM.ONE;
  queue.queueWaitTotalMs =
    (queue.queueWaitTotalMs || TRANSPORT_NUM.ZERO) +
    normalized;
  queue.queueWaitMaxMs = Math.max(
    queue.queueWaitMaxMs || TRANSPORT_NUM.ZERO,
    normalized,
  );
  if (!queue.queueWaitHistogram) {
    queue.queueWaitHistogram = createQueueWaitHistogram();
  }
  const bucket = resolveQueueWaitBucket(normalized);
  queue.queueWaitHistogram[bucket] =
    (queue.queueWaitHistogram[bucket] || TRANSPORT_NUM.ZERO) +
    TRANSPORT_NUM.ONE;
}

function buildQueueWaitSummary(queue) {
  const sampleCount = queue?.queueWaitSampleCount || TRANSPORT_NUM.ZERO;
  const totalMs = queue?.queueWaitTotalMs || TRANSPORT_NUM.ZERO;
  return {
    sampleCount,
    avgMs: sampleCount > TRANSPORT_NUM.ZERO ?
      Math.round(totalMs / sampleCount) :
      TRANSPORT_NUM.ZERO,
    maxMs: queue?.queueWaitMaxMs || TRANSPORT_NUM.ZERO,
    histogram: {...(queue?.queueWaitHistogram || createQueueWaitHistogram())},
  };
}

function resolveRequestIdFromMessage(message) {
  return normalizeIdentifier(
    message?.requestId ||
      message?.request_id ||
      message?.payload?.requestId ||
      message?.payload?.request_id,
  );
}

function resolveOperationIdFromMessage(message) {
  return normalizeIdentifier(
    message?.operationId ||
      message?.operation_id ||
      message?.id ||
      message?.payload?.operationId ||
      message?.payload?.operation_id,
  );
}

function extractSqlOperationKind(sql) {
  if (typeof sql !== TRANSPORT_TYPEOF.STRING) {
    return 'unknown';
  }
  const normalized = sql.trim().toLowerCase();
  if (normalized.startsWith('select')) {
    return 'select';
  }
  if (normalized.startsWith('insert')) {
    return 'insert';
  }
  if (normalized.startsWith('update')) {
    return 'update';
  }
  if (normalized.startsWith('delete')) {
    return 'delete';
  }
  return 'unknown';
}

function extractSqlTableName(sql) {
  if (typeof sql !== TRANSPORT_TYPEOF.STRING || sql.trim().length === 0) {
    return null;
  }
  const normalizedSql = sql.trim();
  for (const matcher of [
    /^\s*select\b[\s\S]*?\bfrom\s+([a-zA-Z_][\w]*)/i,
    /^\s*insert(?:\s+or\s+replace)?\s+into\s+([a-zA-Z_][\w]*)/i,
    /^\s*update\s+([a-zA-Z_][\w]*)/i,
    /^\s*delete\s+from\s+([a-zA-Z_][\w]*)/i,
  ]) {
    const match = normalizedSql.match(matcher);
    if (match?.[1]) {
      return match[1].toLowerCase();
    }
  }
  return null;
}

function summarizeRaftAppendCommand(command) {
  const commandType = normalizeIdentifier(command?.type)?.toLowerCase();
  if (!commandType) {
    return 'raft:append:unknown';
  }
  if (commandType === 'cdc') {
    const tableName = normalizeIdentifier(command?.tableName)?.toLowerCase();
    return `raft:append:cdc:${tableName || 'unknown'}`;
  }
  if (commandType === 'cdc_batch') {
    const events = Array.isArray(command?.events) ? command.events : [];
    const eventCount = events.length;
    const distinctTableNames = [...new Set(events
      .map((event) => normalizeIdentifier(event?.tableName)?.toLowerCase())
      .filter(Boolean))];
    if (distinctTableNames.length === 1) {
      return `raft:append:cdc_batch:${distinctTableNames[0]}:${eventCount}`;
    }
    if (distinctTableNames.length > 1) {
      return `raft:append:cdc_batch:mixed:${eventCount}`;
    }
    return 'raft:append:cdc_batch:unknown';
  }
  if (commandType === 'message') {
    const payloadType = normalizeIdentifier(
      command?.message?.payload?.type,
    )?.toLowerCase();
    return `raft:append:message:${payloadType || 'unknown'}`;
  }
  if (commandType === 'ack') {
    return 'raft:append:ack';
  }
  return `raft:append:${commandType}`;
}

function isSupersedableRaftHeartbeatAppend(message) {
  const messageType = normalizeIdentifier(message?.type)?.toLowerCase();
  if (messageType !== 'append') {
    return false;
  }
  return !Array.isArray(message?.data) || message.data.length === 0;
}

function resolvePendingReplacementKey(targetAddress, message, options = {}) {
  const explicitKey = normalizeIdentifier(options?.replacePendingKey);
  if (explicitKey) {
    return explicitKey;
  }
  if (!isSupersedableRaftHeartbeatAppend(message)) {
    return null;
  }
  const normalizedTargetAddress = normalizeIdentifier(targetAddress);
  if (!normalizedTargetAddress) {
    return 'raft:append:heartbeat';
  }
  return `raft:append:heartbeat:${normalizedTargetAddress}`;
}

function buildDerivedDeliverySource(targetAddress, message) {
  const messageType = normalizeIdentifier(message?.type)?.toLowerCase();
  if (messageType === 'append') {
    if (isSupersedableRaftHeartbeatAppend(message)) {
      return 'raft:append:heartbeat';
    }
    const entry = Array.isArray(message?.data) ? message.data[0] : null;
    return summarizeRaftAppendCommand(entry?.command);
  }
  if (messageType === QUERY_DATA_PLANE_MESSAGE_TYPE.toLowerCase()) {
    const tableName = extractSqlTableName(message?.sql);
    const operationKind = extractSqlOperationKind(message?.sql);
    return `query:${operationKind}:${tableName || 'unknown'}`;
  }
  if (messageType) {
    return `message:${messageType}`;
  }
  const normalizedTarget = normalizeIdentifier(targetAddress);
  if (normalizedTarget) {
    return `target:${normalizedTarget}`;
  }
  return 'unknown';
}

function resolveDeliverySource(targetAddress, message, options = {}) {
  const explicitSource = normalizeIdentifier(options?.deliverySource);
  if (explicitSource) {
    return explicitSource;
  }
  return buildDerivedDeliverySource(targetAddress, message);
}

function buildPendingSourceSummary(queue, limit = 5) {
  if (!queue || !Array.isArray(queue.pending) || queue.pending.length === 0) {
    return [];
  }
  const countsBySource = new Map();
  for (const item of queue.pending) {
    const source = normalizeIdentifier(item?.deliverySource) || 'unknown';
    countsBySource.set(source, (countsBySource.get(source) || 0) + 1);
  }
  return [...countsBySource.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([source, count]) => ({source, count}));
}

function normalizeDeliveryOutcome(outcome) {
  if (outcome &&
    typeof outcome === TRANSPORT_TYPEOF.OBJECT &&
    Object.prototype.hasOwnProperty.call(outcome, 'result') &&
    Object.prototype.hasOwnProperty.call(outcome, 'queueWaitMs')) {
    return {
      result: outcome.result,
      queueWaitMs: Number.isFinite(outcome.queueWaitMs) ?
        Math.max(TRANSPORT_NUM.ZERO, Math.floor(outcome.queueWaitMs)) :
        TRANSPORT_NUM.ZERO,
    };
  }
  return {
    result: outcome,
    queueWaitMs: TRANSPORT_NUM.ZERO,
  };
}

function normalizeRetryAfterMs(value, fallback) {
  if (Number.isFinite(value) && value > TRANSPORT_NUM.ZERO) {
    return Math.floor(value);
  }
  if (Number.isFinite(fallback) && fallback > TRANSPORT_NUM.ZERO) {
    return Math.floor(fallback);
  }
  return TRANSPORT_NUM.ZERO;
}

function buildSupersededPendingResult(replacedItem) {
  return {
    result: {
      acknowledged: true,
      coalesced: true,
      replacedPending: true,
      deliverySource: replacedItem?.deliverySource || null,
    },
    queueWaitMs: TRANSPORT_NUM.ZERO,
  };
}

function normalizeOutboundDeliveryPriority(priority) {
  return priority === OutboundDeliveryPriority.CRITICAL ?
    OutboundDeliveryPriority.CRITICAL :
    OutboundDeliveryPriority.BACKGROUND;
}

function countPendingByPriority(queue, priority) {
  if (!queue || !Array.isArray(queue.pending)) {
    return TRANSPORT_NUM.ZERO;
  }
  return queue.pending.reduce((count, item) => {
    return item?.priority === priority ?
      count + TRANSPORT_NUM.ONE :
      count;
  }, TRANSPORT_NUM.ZERO);
}

function resolveBackgroundPendingLimit(queue) {
  if (!queue) {
    return TRANSPORT_NUM.ZERO;
  }
  const criticalReserve = Number.isFinite(queue.criticalReserve) &&
    queue.criticalReserve > TRANSPORT_NUM.ZERO ?
    queue.criticalReserve :
    TRANSPORT_NUM.ZERO;
  return Math.max(
    TRANSPORT_NUM.ZERO,
    queue.maxPending - criticalReserve,
  );
}

function dequeueNextPendingItem(queue) {
  if (!queue || !Array.isArray(queue.pending) ||
      queue.pending.length === TRANSPORT_NUM.ZERO) {
    return null;
  }
  const criticalIndex = queue.pending.findIndex((item) => {
    return item?.priority === OutboundDeliveryPriority.CRITICAL;
  });
  if (criticalIndex >= TRANSPORT_NUM.ZERO) {
    return queue.pending.splice(criticalIndex, TRANSPORT_NUM.ONE)[TRANSPORT_NUM.ZERO];
  }
  return queue.pending.shift();
}

/**
 * MessageRouter provides unified message routing for both local and remote services.
 * - Local messages are delivered directly to registered handlers
 * - Remote messages are sent via WebSocket connections to other nodes
 */
class MessageRouter extends EventEmitter {
  /**
   * Create a new MessageRouter.
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - Local node ID.
   * @param {string} options.nodeAddress - Local node address (for WebSocket server).
   * @param {number} options.wsPort - WebSocket server port.
   * @param {string} options.wsHost - Optional WebSocket bind host.
   */
  constructor(options = {}) {
    super();

    const nodeWsPort = options.wsPort || TRANSPORT_DEFAULT.WS_PORT;
    this.nodeId = options.nodeId || uuidv4();
    this.nodeAddress = options.nodeAddress ||
      TRANSPORT_FORMAT.buildDefaultNodeAddress(nodeWsPort);
    this.advertisedAddress =
      options.advertisedAddress ||
      normalizeToWebSocketAddress(this.nodeAddress) ||
      this.nodeAddress;
    this.wsPort = options.wsPort || null;
    this.routerId = uuidv4();
    this.identifyPayload = options.identifyPayload || null;

    // Registered handlers (address -> handler function)
    // Handlers are invoked when messages arrive via WebSocket
    this.handlers = new Map();
    this.inProcess = options.inProcess === true;

    // Node connections (nodeId -> connection info)
    // Includes self-connection for local routing
    this.nodeConnections = new Map();

    // Pending messages awaiting acknowledgment
    this.pendingMessages = new Map();
    // Pending SERVICE_RESPONSE payloads awaiting handler completion.
    this.pendingResponses = new Map();
    this.pendingPings = new Map();

    // Configuration
    const config = ConfigurationManager.getInstance();
    const configuredWsHost = config.get(TRANSPORT_CONFIG_KEY.WS_HOST);
    // Bind to localhost by default so tests (and local dev) don't require
    // listening on all interfaces (0.0.0.0), which can be disallowed in some
    // sandboxed environments. Production deployments can override via
    // `transport.wsHost` (e.g. 0.0.0.0).
    this.wsHost = options.wsHost ||
      (typeof configuredWsHost === TRANSPORT_TYPEOF.STRING &&
        configuredWsHost.length > TRANSPORT_NUM.ZERO ?
        configuredWsHost :
        TRANSPORT_DEFAULT.WS_HOST);
    this.messageTimeoutMs =
      config.get(TRANSPORT_CONFIG_KEY.MESSAGE_TIMEOUT_MS) ||
      TRANSPORT_DEFAULT.MESSAGE_TIMEOUT_MS;
    this.ackTimeoutQuarantineThreshold =
      Number.isFinite(options.ackTimeoutQuarantineThreshold) &&
      options.ackTimeoutQuarantineThreshold >= TRANSPORT_NUM.ONE ?
        Math.floor(options.ackTimeoutQuarantineThreshold) :
        Number.isFinite(
          config.get(TRANSPORT_CONFIG_KEY.ACK_TIMEOUT_QUARANTINE_THRESHOLD),
        ) &&
        config.get(TRANSPORT_CONFIG_KEY.ACK_TIMEOUT_QUARANTINE_THRESHOLD) >=
          TRANSPORT_NUM.ONE ?
          Math.floor(
            config.get(TRANSPORT_CONFIG_KEY.ACK_TIMEOUT_QUARANTINE_THRESHOLD),
          ) :
          TRANSPORT_DEFAULT.ACK_TIMEOUT_QUARANTINE_THRESHOLD;
    const configuredConnectTimeoutMs =
      config.get(WEBSOCKET_CONNECT_TIMEOUT_CONFIG_KEY);
    this.connectTimeoutMs =
      Number.isFinite(options.connectTimeoutMs) &&
      options.connectTimeoutMs > TRANSPORT_NUM.ZERO ?
        Math.floor(options.connectTimeoutMs) :
        Number.isFinite(configuredConnectTimeoutMs) &&
        configuredConnectTimeoutMs > TRANSPORT_NUM.ZERO ?
          Math.floor(configuredConnectTimeoutMs) :
          this.messageTimeoutMs;
    this.pingTimeoutMs =
      config.get(TRANSPORT_CONFIG_KEY.PING_TIMEOUT_MS) ||
      TRANSPORT_DEFAULT.PING_TIMEOUT_MS;
    this.reconnectIntervalMs =
      config.get(TRANSPORT_CONFIG_KEY.RECONNECT_INTERVAL_MS) ||
      TRANSPORT_DEFAULT.RECONNECT_INTERVAL_MS;
    this.reconnectMaxAttempts =
      config.get(TRANSPORT_CONFIG_KEY.RECONNECT_MAX_ATTEMPTS) ||
      TRANSPORT_DEFAULT.RECONNECT_MAX_ATTEMPTS;
    this.pingIntervalMs =
      config.get(TRANSPORT_CONFIG_KEY.PING_INTERVAL_MS) ||
      TRANSPORT_DEFAULT.PING_INTERVAL_MS;
    this.reconnectBackoffMultiplier =
      config.get(TRANSPORT_CONFIG_KEY.RECONNECT_BACKOFF_MULTIPLIER) ||
      TRANSPORT_DEFAULT.RECONNECT_BACKOFF_MULTIPLIER;
    const configuredMaxConcurrent =
      Number.isFinite(options.outboundQueueMaxConcurrent) &&
      options.outboundQueueMaxConcurrent > TRANSPORT_NUM.ZERO ?
        options.outboundQueueMaxConcurrent :
        config.get(TRANSPORT_CONFIG_KEY.OUTBOUND_QUEUE_MAX_CONCURRENT);
    this.outboundQueueMaxConcurrent =
      Number.isFinite(configuredMaxConcurrent) &&
      configuredMaxConcurrent > TRANSPORT_NUM.ZERO ?
        Math.floor(configuredMaxConcurrent) :
        TRANSPORT_DEFAULT.OUTBOUND_QUEUE_CONCURRENCY;
    const configuredMaxPending =
      Number.isFinite(options.outboundQueueMaxPending) &&
      options.outboundQueueMaxPending >= TRANSPORT_NUM.ZERO ?
        options.outboundQueueMaxPending :
        config.get(TRANSPORT_CONFIG_KEY.OUTBOUND_QUEUE_MAX_PENDING);
    this.outboundQueueMaxPending =
      Number.isFinite(configuredMaxPending) &&
      configuredMaxPending >= TRANSPORT_NUM.ZERO ?
        Math.floor(configuredMaxPending) :
        TRANSPORT_DEFAULT.OUTBOUND_QUEUE_MAX_PENDING;
    const configuredCriticalReserve =
      Number.isFinite(options.outboundQueueCriticalReserve) &&
      options.outboundQueueCriticalReserve >= TRANSPORT_NUM.ZERO ?
        options.outboundQueueCriticalReserve :
        config.get(TRANSPORT_CONFIG_KEY.OUTBOUND_QUEUE_CRITICAL_RESERVE);
    const maxCriticalReserve = Math.max(
      TRANSPORT_NUM.ZERO,
      this.outboundQueueMaxPending - TRANSPORT_NUM.ONE,
    );
    this.outboundQueueCriticalReserve =
      Number.isFinite(configuredCriticalReserve) &&
      configuredCriticalReserve >= TRANSPORT_NUM.ZERO ?
        Math.min(
          Math.floor(configuredCriticalReserve),
          maxCriticalReserve,
        ) :
        Math.min(
          TRANSPORT_DEFAULT.OUTBOUND_QUEUE_CRITICAL_RESERVE,
          maxCriticalReserve,
        );

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(TRANSPORT_SUBSYSTEM.ROUTER) : console;

    // State
    this.initialized = false;
    this.server = null;
    this.messageCount = TRANSPORT_NUM.ZERO;
    this.isShuttingDown = false;
    this.inProcessTransport = false;

    // Per-node outbound delivery queues
    this.outboundQueues = new Map();

    // Metric sampling state for high-volume transport delivery logging.
    this.deliverMetricSampleByTarget = new Map();
    this.deliverMetricFaultSampleByTarget = new Map();
    this.deliverMetricQueueDepthByTarget = new Map();

    // Function to resolve service address to node ID
    this.resolveServiceNode = options.resolveServiceNode || null;
    this.resolveNodeAddress = options.resolveNodeAddress || null;
    this.resolveQueryMessageGroupService =
      options.resolveQueryMessageGroupService || null;
    this.pendingNodeConnections = new Map();
    this.reconnectAddressSuppressionMs =
      Number.isFinite(options.reconnectAddressSuppressionMs) &&
      options.reconnectAddressSuppressionMs > TRANSPORT_NUM.ZERO ?
        Math.floor(options.reconnectAddressSuppressionMs) :
        RECONNECT_ADDRESS_SUPPRESSION_DEFAULT_MS;
    this.suppressedReconnectAddresses = new Map();
  }

  /**
   * Set optional payload to include with IDENTIFY messages.
   * @param {Object|null} payload - Additional identify payload.
   */
  setIdentificationPayload(payload) {
    this.identifyPayload = payload || null;
  }

  /**
   * Initialize the message router.
   * Starts WebSocket server and establishes self-connection for uniform routing.
   * Requirements: 2.2, 8.2
   * @param {Object} options - Initialization options.
   * @param {boolean} options.startServer - Whether to start WebSocket server.
   * @return {Promise<void>}
   */
  async initialize(options = {}) {
    if (this.initialized) {
      return;
    }
    this.isShuttingDown = false;

    this.logger.info(ROUTER_LOG_MSG.INITIALIZING, {
      routerId: this.routerId,
      nodeId: this.nodeId,
      wsPort: this.wsPort,
      wsHost: this.wsHost,
    });

    // Start WebSocket server if port specified
    if (options.startServer && this.wsPort) {
      await this.startServer();

      // Establish self-connection for uniform message routing
      // All messages (local and remote) go through WebSocket
      try {
        await this.connectToSelf();
      } catch (error) {
        this.logger.error(ROUTER_LOG_MSG.SELF_CONNECTION_FAILED, {
          error: error.message,
          nodeId: this.nodeId,
        });
        // Clean up server if self-connection fails
        if (this.server) {
          await new Promise((resolve) => this.server.close(resolve));
          this.server = null;
        }
        throw new Error(ROUTER_ERROR_MSG.selfConnectionFailed(error.message));
      }
    }

    this.initialized = true;

    this.emit(TRANSPORT_EVENT.INITIALIZED, {
      routerId: this.routerId,
      nodeId: this.nodeId,
    });
  }

  /**
   * Start WebSocket server to accept incoming connections.
   * @return {Promise<void>}
   */
  async startServer() {
    return new Promise((resolve, reject) => {
      let settled = false;
      const resolveOnce = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };
      const rejectOnce = (error) => {
        if (!settled) {
          settled = true;
          reject(error);
        }
      };

      try {
        if (this.inProcess) {
          this.startInProcessServer();
          resolveOnce();
          return;
        }
        const serverOptions = {port: this.wsPort};
        if (this.wsHost) {
          serverOptions.host = this.wsHost;
        }
        const wsServer = new WebSocketServer(serverOptions);
        this.server = wsServer;

        wsServer.on(TRANSPORT_EVENT.CONNECTION, (ws, req) => {
          this.handleIncomingConnection(ws, req);
        });

        wsServer.on(TRANSPORT_EVENT.LISTENING, () => {
          this.logger.info(ROUTER_LOG_MSG.WS_SERVER_LISTENING, {
            port: this.wsPort,
            routerId: this.routerId,
          });
          resolveOnce();
        });

        wsServer.on(TRANSPORT_EVENT.ERROR, (error) => {
          this.logger.error(ROUTER_LOG_MSG.WS_SERVER_ERROR, {
            error: error.message,
            routerId: this.routerId,
          });
          rejectOnce(error);
        });
      } catch (error) {
        rejectOnce(error);
      }
    });
  }

  /**
   * Start an in-process "server" registered by port for test-only transport.
   * @private
   */
  startInProcessServer() {
    const portKey = Number(this.wsPort);
    if (!Number.isFinite(portKey)) {
      throw new Error('Invalid wsPort for in-process server');
    }
    if (INPROC.serversByPort.has(portKey)) {
      const err = new Error(`listen EADDRINUSE: address already in use 127.0.0.1:${portKey}`);
      err.code = 'EADDRINUSE';
      throw err;
    }
    this.inProcessTransport = true;
    INPROC.serversByPort.set(portKey, {router: this, nodeId: this.nodeId});

    // Minimal server-like object for diagnostics; shutdown() handles in-process servers separately.
    this.server = {
      clients: new Set(),
      close: (cb) => {
        INPROC.serversByPort.delete(portKey);
        cb?.();
      },
    };

    this.logger.info(ROUTER_LOG_MSG.WS_SERVER_LISTENING, {
      port: this.wsPort,
      routerId: this.routerId,
    });
  }

  /**
   * Handle incoming WebSocket connection from another node.
   * @param {WebSocket} ws - WebSocket connection.
   * @param {Object} _req - HTTP request.
   * @private
   */
  handleIncomingConnection(ws, _req) {
    const connectionId = uuidv4();
    const connectionInfo = {
      connectionId,
      ws,
      state: ConnectionState.CONNECTED,
      nodeId: null,
      isIncoming: true,
      retired: false,
      createdAt: Date.now(),
    };

    this.logger.debug(ROUTER_LOG_MSG.INCOMING_CONNECTION, {
      connectionId,
      routerId: this.routerId,
    });

    // Set up message handler
    ws.on(TRANSPORT_EVENT.MESSAGE, (data) => {
      this.handleMessage(connectionInfo.nodeId || connectionId, ws, data);
    });

    ws.on(TRANSPORT_EVENT.CLOSE, () => {
      this.handleConnectionClose(
        connectionInfo.nodeId || connectionId,
        connectionInfo.connectionId,
      );
    });

    ws.on(TRANSPORT_EVENT.ERROR, (error) => {
      this.logger.error(ROUTER_LOG_MSG.WS_CONNECTION_ERROR, {
        connectionId,
        error: error.message,
      });
    });

    // Store connection temporarily until we know the peer node ID
    this.nodeConnections.set(connectionId, connectionInfo);

    this.emit(TRANSPORT_EVENT.CONNECTION_ESTABLISHED, {
      connectionId,
      incoming: true,
    });
  }

  /**
   * Connect to self via loopback.
   * This enables uniform routing for all messages - local and remote use the same path.
   * Requirements: 2.1, 2.4
   * @return {Promise<void>}
   */
  async connectToSelf() {
    const selfAddress = this.buildSelfConnectionAddress();
    this.logger.debug(ROUTER_LOG_MSG.SELF_CONNECTION_START, {
      nodeId: this.nodeId,
      address: selfAddress,
    });
    await this.connectToNode(this.nodeId, selfAddress, {isSelfConnection: true});
  }

  /**
   * Build WebSocket address for self-connection.
   * Uses bound server address when available to avoid localhost DNS family mismatch.
   * @return {string}
   * @private
   */
  buildSelfConnectionAddress() {
    const host = this.resolveSelfConnectionHost();
    const normalizedHost = this.normalizeWebSocketHost(host);
    return TRANSPORT_FORMAT.buildWebSocketAddress(normalizedHost, this.wsPort);
  }

  /**
   * Resolve host used for self-connection.
   * @return {string}
   * @private
   */
  resolveSelfConnectionHost() {
    const configuredHost = this.wsHost || TRANSPORT_DEFAULT.WS_HOST;
    const defaultHost =
      configuredHost === HOST.ANY || configuredHost === IPV6_ANY_HOST ?
        HOST.LOCALHOST :
        configuredHost;
    if (!this.server || typeof this.server.address !== TRANSPORT_TYPEOF.FUNCTION) {
      return defaultHost;
    }

    const serverAddress = this.server.address();
    if (!serverAddress || typeof serverAddress !== TRANSPORT_TYPEOF.OBJECT) {
      return defaultHost;
    }

    const boundHost = serverAddress.address;
    if (typeof boundHost !== TRANSPORT_TYPEOF.STRING ||
      boundHost.length === TRANSPORT_NUM.ZERO) {
      return defaultHost;
    }

    if (boundHost === HOST.ANY || boundHost === IPV6_ANY_HOST) {
      return defaultHost;
    }

    return boundHost;
  }

  /**
   * Normalize host for URL usage.
   * @param {string} host - Hostname or IP.
   * @return {string}
   * @private
   */
  normalizeWebSocketHost(host) {
    if (!host.includes(':')) {
      return host;
    }
    if (host.startsWith(IPV6_HOST_PREFIX) && host.endsWith(IPV6_HOST_SUFFIX)) {
      return host;
    }
    return `${IPV6_HOST_PREFIX}${host}${IPV6_HOST_SUFFIX}`;
  }

  /**
   * Extract one websocket port from an address.
   * @param {string|null} address
   * @return {number|null}
   * @private
   */
  extractWebSocketPort(address) {
    if (typeof address !== TRANSPORT_TYPEOF.STRING ||
        address.length === TRANSPORT_NUM.ZERO) {
      return null;
    }
    try {
      const parsed = new URL(address);
      const port = Number(parsed.port);
      return Number.isFinite(port) && port > TRANSPORT_NUM.ZERO ?
        port :
        null;
    } catch {
      return null;
    }
  }

  /**
   * Build a directly-routable websocket address from an observed socket IP.
   * @param {WebSocket|null} ws
   * @param {string|null} candidateAddress
   * @return {string|null}
   * @private
   */
  buildObservedReconnectAddress(ws, candidateAddress = null) {
    const observedHost = ws?._socket?.remoteAddress;
    if (typeof observedHost !== TRANSPORT_TYPEOF.STRING ||
        observedHost.length === TRANSPORT_NUM.ZERO) {
      return null;
    }
    const port = this.extractWebSocketPort(candidateAddress) ||
      Number(ws?._socket?.remotePort) ||
      null;
    if (!Number.isFinite(port) || port <= TRANSPORT_NUM.ZERO) {
      return null;
    }
    return TRANSPORT_FORMAT.buildWebSocketAddress(
      this.normalizeWebSocketHost(observedHost),
      port,
    );
  }

  /**
   * Remember the most directly-routable reconnect address observed for one
   * connection while retaining the configured resolver address as fallback.
   * @param {Object|null} connectionInfo
   * @param {WebSocket|null} ws
   * @param {string|null} candidateAddress
   * @return {void}
   * @private
   */
  rememberReconnectAddress(connectionInfo, ws, candidateAddress = null) {
    if (!connectionInfo || typeof connectionInfo !== TRANSPORT_TYPEOF.OBJECT) {
      return;
    }
    const normalizedCandidateAddress =
      normalizeToWebSocketAddress(candidateAddress) || candidateAddress;
    if (typeof candidateAddress === TRANSPORT_TYPEOF.STRING &&
        candidateAddress.length > TRANSPORT_NUM.ZERO &&
        (!connectionInfo.configuredAddress ||
          connectionInfo.configuredAddress.length === TRANSPORT_NUM.ZERO)) {
      connectionInfo.configuredAddress = normalizedCandidateAddress;
    }
    const observedAddress =
      this.buildObservedReconnectAddress(ws, normalizedCandidateAddress);
    if (typeof observedAddress === TRANSPORT_TYPEOF.STRING &&
        observedAddress.length > TRANSPORT_NUM.ZERO) {
      connectionInfo.observedAddress = observedAddress;
      connectionInfo.address = observedAddress;
      return;
    }
    if (typeof normalizedCandidateAddress === TRANSPORT_TYPEOF.STRING &&
        normalizedCandidateAddress.length > TRANSPORT_NUM.ZERO) {
      connectionInfo.address = normalizedCandidateAddress;
    }
  }

  /**
   * Clear an armed reconnect timer for one connection.
   * @param {Object|null} connectionInfo
   * @return {void}
   * @private
   */
  clearReconnectTimeout(connectionInfo) {
    if (!connectionInfo?.reconnectTimeout) {
      if (connectionInfo) {
        connectionInfo.reconnectDueAt = null;
      }
      return;
    }
    clearTimeout(connectionInfo.reconnectTimeout);
    connectionInfo.reconnectTimeout = null;
    connectionInfo.reconnectDueAt = null;
  }

  /**
   * Clear one heartbeat interval.
   * @param {Object|null} connectionInfo
   * @return {void}
   * @private
   */
  clearPingInterval(connectionInfo) {
    if (!connectionInfo?.pingInterval) {
      return;
    }
    clearInterval(connectionInfo.pingInterval);
    connectionInfo.pingInterval = null;
  }

  /**
   * Retire a superseded connection object so it stops reconnecting.
   * @param {Object|null} connectionInfo
   * @return {void}
   * @private
   */
  retireConnection(connectionInfo) {
    if (!connectionInfo || typeof connectionInfo !== TRANSPORT_TYPEOF.OBJECT) {
      return;
    }
    connectionInfo.retired = true;
    this.clearReconnectTimeout(connectionInfo);
    this.clearPingInterval(connectionInfo);
  }

  /**
   * Return whether a connection object is still the active entry for its peer.
   * @param {Object|null} connectionInfo
   * @return {boolean}
   * @private
   */
  isCurrentConnection(connectionInfo) {
    if (!connectionInfo || typeof connectionInfo !== TRANSPORT_TYPEOF.OBJECT) {
      return false;
    }
    return this.nodeConnections.get(connectionInfo.nodeId) === connectionInfo;
  }

  /**
   * Connect to a remote node via WebSocket.
   * @param {string} nodeId - Remote node ID.
   * @param {string} address - Remote node WebSocket address.
   * @param {Object} options - Connection options.
   * @param {boolean} options.isSelfConnection - Whether this is a self-connection.
   * @return {Promise<void>}
   */
  async connectToNode(nodeId, address, options = {}) {
    // Check if already connected
    if (this.nodeConnections.has(nodeId)) {
      const existing = this.nodeConnections.get(nodeId);
      if (existing.state === ConnectionState.CONNECTED) {
        this.logger.debug(ROUTER_LOG_MSG.ALREADY_CONNECTED, {nodeId});
        return;
      }
    }

    this.logger.debug(ROUTER_LOG_MSG.CONNECTING, {
      nodeId,
      address,
      routerId: this.routerId,
    });
    const normalizedAddress =
      normalizeToWebSocketAddress(address) || address;
    const existing = this.nodeConnections.get(nodeId) || null;
    if (existing) {
      this.refreshReconnectAuthority(existing, normalizedAddress);
      this.retireConnection(existing);
    }
    const configuredAddress =
      this.resolveCanonicalReconnectAddress(nodeId, normalizedAddress) ||
      normalizedAddress;

    const connectionInfo = {
      connectionId: uuidv4(),
      nodeId,
      address: normalizedAddress,
      configuredAddress,
      observedAddress: existing?.observedAddress || null,
      ws: null,
      state: ConnectionState.CONNECTING,
      reconnectAttempts: TRANSPORT_NUM.ZERO,
      reconnectTimeout: null,
      reconnectDueAt: null,
      isIncoming: false,
      isSelfConnection: options.isSelfConnection || false,
      ackTimeoutStreak: TRANSPORT_NUM.ZERO,
      lastAckAt: null,
      lastAckTimeoutAt: null,
      retired: false,
      createdAt: Date.now(),
    };

    this.nodeConnections.set(nodeId, connectionInfo);

    await this.establishConnection(connectionInfo);
  }

  /**
   * Establish WebSocket connection to a remote node.
   * @param {Object} connectionInfo - Connection information.
   * @return {Promise<void>}
   * @private
   */
  async establishConnection(connectionInfo) {
    if (this.inProcessTransport) {
      return this.establishInProcessConnection(connectionInfo);
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      try {
        const ws = new WebSocket(connectionInfo.address);
        let connectionEstablished = false;
        const clearConnectTimeout = () => {
          if (connectTimeout) {
            clearTimeout(connectTimeout);
            connectTimeout = null;
          }
        };
        const rejectPendingConnection = (error) => {
          if (settled) {
            return;
          }
          settled = true;
          clearConnectTimeout();
          connectionInfo.state = ConnectionState.DISCONNECTED;
          connectionInfo.ws = null;
          reject(error);
        };
        let connectTimeout = setTimeout(() => {
          const error = new Error(
            `WebSocket connection timeout after ${this.connectTimeoutMs}ms`,
          );
          error.code = WEBSOCKET_CONNECT_TIMEOUT_ERROR_CODE;
          rejectPendingConnection(error);
          try {
            ws.terminate();
          } catch {
            // Best-effort cleanup for stalled handshakes.
          }
        }, this.connectTimeoutMs);
        if (typeof connectTimeout?.unref === 'function') {
          connectTimeout.unref();
        }

        ws.on(TRANSPORT_EVENT.OPEN, () => {
          if (settled) {
            return;
          }
          if (!connectionInfo.isSelfConnection &&
              !this.isCurrentConnection(connectionInfo)) {
            settled = true;
            clearConnectTimeout();
            connectionInfo.state = ConnectionState.CLOSED;
            connectionInfo.ws = null;
            try {
              ws.terminate();
            } catch {
              // Best-effort cleanup for a superseded handshake.
            }
            resolve();
            return;
          }
          settled = true;
          connectionEstablished = true;
          clearConnectTimeout();
          connectionInfo.ws = ws;
          connectionInfo.state = ConnectionState.CONNECTED;
          connectionInfo.reconnectAttempts = TRANSPORT_NUM.ZERO;
          connectionInfo.reconnectDueAt = null;
          connectionInfo.ackTimeoutStreak = TRANSPORT_NUM.ZERO;
          connectionInfo.lastAckTimeoutAt = null;
          this.rememberReconnectAddress(
            connectionInfo,
            ws,
            connectionInfo.address,
          );

          this.logger.info(ROUTER_LOG_MSG.CONNECTED, {
            nodeId: connectionInfo.nodeId,
            address: connectionInfo.address,
          });

          // Send identification message
          this.sendIdentification(connectionInfo);

          // Start ping interval
          this.startPingInterval(connectionInfo);

          this.emit(TRANSPORT_EVENT.CONNECTION_ESTABLISHED, {
            nodeId: connectionInfo.nodeId,
            connectionId: connectionInfo.connectionId,
          });

          resolve();
        });

        ws.on(TRANSPORT_EVENT.MESSAGE, (data) => {
          this.handleMessage(connectionInfo.nodeId, ws, data);
        });

        ws.on(TRANSPORT_EVENT.CLOSE, () => {
          if (!connectionEstablished) {
            if (!settled) {
              rejectPendingConnection(new Error(
                `WebSocket connection closed before open for node ` +
                `${connectionInfo.nodeId}`,
              ));
            }
            return;
          }
          this.handleConnectionClose(
            connectionInfo.nodeId,
            connectionInfo.connectionId,
          );
        });

        ws.on(TRANSPORT_EVENT.ERROR, (error) => {
          this.logger.error(ROUTER_LOG_MSG.WS_ERROR, {
            nodeId: connectionInfo.nodeId,
            error: error.message,
          });

          if (!connectionEstablished &&
              connectionInfo.state === ConnectionState.CONNECTING) {
            rejectPendingConnection(error);
          }
        });
      } catch (error) {
        connectionInfo.state = ConnectionState.DISCONNECTED;
        reject(error);
      }
    });
  }

  /**
   * Establish a duplex in-process connection to a router registered on the target port.
   * @param {Object} connectionInfo - Connection information.
   * @return {Promise<void>}
   * @private
   */
  async establishInProcessConnection(connectionInfo) {
    const url = new URL(connectionInfo.address);
    const portKey = Number(url.port);
    const target = INPROC.serversByPort.get(portKey);
    if (!target?.router) {
      const err = new Error(`connect ECONNREFUSED ${connectionInfo.address}`);
      err.code = 'ECONNREFUSED';
      throw err;
    }

    const {a: clientWs, b: serverWs} = createInProcWebSocketPair();

    // Track the server-side ws so shutdown() can terminate it if needed.
    if (this.server?.clients) {
      this.server.clients.add(serverWs);
    }

    // Simulate server accepting incoming connection.
    target.router.handleIncomingConnection(serverWs, null);

    // Simulate the client-side "open" behavior from establishConnection().
    // Wire up client-side handlers so ACKs, pings, and service messages can flow back.
    clientWs.on(TRANSPORT_EVENT.MESSAGE, (data) => {
      this.handleMessage(connectionInfo.nodeId, clientWs, data);
    });
    clientWs.on(TRANSPORT_EVENT.CLOSE, () => {
      this.handleConnectionClose(
        connectionInfo.nodeId,
        connectionInfo.connectionId,
      );
    });
    clientWs.on(TRANSPORT_EVENT.ERROR, (error) => {
      this.logger.error(ROUTER_LOG_MSG.WS_ERROR, {
        nodeId: connectionInfo.nodeId,
        error: error?.message || String(error),
      });
    });

    if (!connectionInfo.isSelfConnection &&
        !this.isCurrentConnection(connectionInfo)) {
      connectionInfo.state = ConnectionState.CLOSED;
      clientWs.terminate();
      return;
    }

    connectionInfo.ws = clientWs;
    connectionInfo.state = ConnectionState.CONNECTED;
    connectionInfo.reconnectAttempts = TRANSPORT_NUM.ZERO;
    connectionInfo.reconnectDueAt = null;
    connectionInfo.ackTimeoutStreak = TRANSPORT_NUM.ZERO;
    connectionInfo.lastAckTimeoutAt = null;
    this.rememberReconnectAddress(
      connectionInfo,
      clientWs,
      connectionInfo.address,
    );

    this.logger.info(ROUTER_LOG_MSG.CONNECTED, {
      nodeId: connectionInfo.nodeId,
      address: connectionInfo.address,
    });

    this.sendIdentification(connectionInfo);
    this.startPingInterval(connectionInfo);

    this.emit(TRANSPORT_EVENT.CONNECTION_ESTABLISHED, {
      nodeId: connectionInfo.nodeId,
      connectionId: connectionInfo.connectionId,
    });
  }

  /**
   * Send identification message to remote node.
   * @param {Object} connectionInfo - Connection information.
   * @private
   */
  sendIdentification(connectionInfo) {
    const message = {
      type: RouterMessageType.IDENTIFY,
      nodeId: this.nodeId,
      nodeAddress: this.advertisedAddress,
      address: this.advertisedAddress,
      timestamp: Date.now(),
    };

    if (this.identifyPayload && !connectionInfo.isSelfConnection) {
      message.bootstrap = this.identifyPayload;
    }

    this.sendRaw(connectionInfo.ws, message);
  }

  /**
   * Handle incoming message from WebSocket.
   * @param {string} connectionId - Connection or node ID.
   * @param {WebSocket} ws - WebSocket connection.
   * @param {Buffer|string} data - Message data.
   * @private
   */
  handleMessage(connectionId, ws, data) {
    try {
      const message = JSON.parse(data.toString());

      this.logger.debug(ROUTER_LOG_MSG.MESSAGE_RECEIVED, {
        connectionId,
        type: message.type,
        messageId: message.messageId,
      });

      // Handle identification
      if (message.type === RouterMessageType.IDENTIFY) {
        this.handleIdentification(connectionId, ws, message);
        return;
      }

      // Handle ping/pong
      if (message.type === RouterMessageType.PING) {
        this.sendRaw(ws, {
          type: RouterMessageType.PONG,
          pingId: message.pingId || null,
          timestamp: Date.now(),
        });
        return;
      }

      if (message.type === RouterMessageType.PONG) {
        if (message.pingId && this.pendingPings.has(message.pingId)) {
          const pending = this.pendingPings.get(message.pingId);
          clearTimeout(pending.timeout);
          this.pendingPings.delete(message.pingId);
          pending.resolve(true);
        }
        return;
      }

      // Handle acknowledgment
      if (message.type === RouterMessageType.ACK) {
        this.handleAcknowledgment(message);
        return;
      }

      if (message.type === RouterMessageType.SERVICE_RESPONSE) {
        this.handleServiceResponse(message);
        return;
      }

      // Handle service message
      if (message.type === RouterMessageType.SERVICE_MESSAGE) {
        this.handleServiceMessage(ws, message);
        return;
      }

      // Unknown message type
      this.logger.warn(ROUTER_LOG_MSG.MESSAGE_UNKNOWN, {
        type: message.type,
        connectionId,
      });
    } catch (error) {
      this.logger.error(ROUTER_LOG_MSG.MESSAGE_PARSE_FAILED, {
        connectionId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Handle identification message from remote node.
   * @param {string} connectionId - Connection ID.
   * @param {WebSocket} ws - WebSocket connection.
   * @param {Object} message - Identification message.
   * @private
   */
  handleIdentification(connectionId, ws, message) {
    const nodeId = message?.nodeId;
    const nodeAddress = message?.nodeAddress || message?.address;

    if (!nodeId || !nodeAddress) {
      this.logger.warn(ROUTER_LOG_MSG.IDENTIFICATION_MISSING_FIELDS, {
        connectionId,
        hasNodeId: !!nodeId,
        hasNodeAddress: !!nodeAddress,
      });
      try {
        ws.close();
      } catch (error) {
        this.logger.warn(ROUTER_LOG_MSG.FAILED_CLOSE_UNIDENTIFIED, {
          connectionId,
          error: error.message,
        });
        throw error;
      }
      return;
    }

    this.logger.info(ROUTER_LOG_MSG.IDENTIFICATION_RECEIVED, {
      connectionId,
      remoteNodeId: nodeId,
      remoteNodeAddress: nodeAddress,
      localNodeId: this.nodeId,
      existingConnectionForNode: this.nodeConnections.has(nodeId),
    });

    // Update connection with node ID
    const connection = this.nodeConnections.get(connectionId);
    if (connection && connection.isIncoming) {
      const normalizedAddress =
        normalizeToWebSocketAddress(nodeAddress) || nodeAddress;
      connection.nodeId = nodeId;
      connection.nodeAddress = normalizedAddress;
      connection.configuredAddress = normalizedAddress;
      this.rememberReconnectAddress(
        connection, ws, normalizedAddress,
      );

      const existing = this.nodeConnections.get(nodeId);
      const isSelfConnection = existing?.isSelfConnection && nodeId === this.nodeId;
      const existingConnected = Boolean(existing) &&
        existing.state === ConnectionState.CONNECTED;
      const preferIncomingConnection =
        this.nodeId.localeCompare(nodeId) > TRANSPORT_NUM.ZERO;
      const existingPreferredIncomingConnection =
        existingConnected &&
        preferIncomingConnection &&
        existing?.isIncoming === true;
      const shouldAdoptIncomingConnection = !existing ||
        (!isSelfConnection &&
          (!existingConnected ||
            (preferIncomingConnection &&
              !existingPreferredIncomingConnection)));

      if (isSelfConnection) {
        this.logger.debug(ROUTER_LOG_MSG.KEEP_ORIGINAL_CONNECTION, {
          connectionId,
          nodeId,
          reason: ROUTER_LOG_MSG.SELF_CONNECTION_ALREADY_REGISTERED,
        });
      } else if (shouldAdoptIncomingConnection) {
        if (existing &&
            existing.ws &&
            existing.connectionId !== connectionId) {
          this.retireConnection(existing);
          try {
            existing.ws.terminate();
          } catch (error) {
            this.logger.warn(ROUTER_LOG_MSG.FAILED_TERMINATE_EXISTING, {
              nodeId,
              error: error.message,
            });
          }
        }
        if (existing &&
            this.nodeConnections.get(nodeId) === existing) {
          this.nodeConnections.delete(nodeId);
        }
        this.nodeConnections.delete(connectionId);
        this.nodeConnections.set(nodeId, connection);
        this.logger.info(ROUTER_LOG_MSG.REKEYED_CONNECTION, {
          oldKey: connectionId,
          newKey: nodeId,
          localNodeId: this.nodeId,
        });
      } else {
        this.logger.debug(ROUTER_LOG_MSG.KEEP_ORIGINAL_CONNECTION, {
          connectionId,
          nodeId,
          reason: 'existing_connection_preferred',
        });
        this.retireConnection(connection);
        this.nodeConnections.delete(connectionId);
        try {
          ws.terminate();
        } catch (error) {
          this.logger.warn(ROUTER_LOG_MSG.FAILED_TERMINATE_EXISTING, {
            nodeId,
            error: error.message,
          });
        }
      }
    }

    this.emit(TRANSPORT_EVENT.NODE_CONNECTED, {
      nodeId,
      nodeAddress,
      connectionId,
    });
    this.emit(TRANSPORT_EVENT.NODE_IDENTIFIED, {
      nodeId,
      nodeAddress,
      connectionId,
    });
  }

  /**
   * Handle service message from remote node.
   * Sends ACK immediately to release sender-side queue pressure, then
   * resolves the handler asynchronously via SERVICE_RESPONSE.
   * @param {WebSocket} ws - WebSocket connection.
   * @param {Object} message - Service message.
   * @private
   */
  handleServiceMessage(ws, message) {
    const {targetAddress, messageId, payload} = message;

    this.logger.debug(ROUTER_LOG_MSG.SERVICE_MESSAGE_HANDLING, {
      messageId,
      targetAddress,
      sourceNodeId: message.sourceNodeId,
      registeredHandlers: Array.from(this.handlers.keys()),
      hasHandler: this.handlers.has(targetAddress),
    });

    // Always ACK immediately so the sender can release outbound queue slots.
    this.sendRaw(ws, {
      type: RouterMessageType.ACK,
      messageId,
      acknowledged: true,
    });

    // Find handler for target address
    const handler = this.handlers.get(targetAddress);

    if (!handler) {
      this.emit(TRANSPORT_EVENT.MESSAGE, {
        messageId,
        targetAddress,
        payload,
        sourceAddress: message.sourceAddress,
        sourceNodeId: message.sourceNodeId,
      });
      this.sendRaw(ws, {
        type: RouterMessageType.SERVICE_RESPONSE,
        messageId,
        sourceAddress: message.sourceAddress,
        result: {
          noHandler: true,
          error: ROUTER_ERROR_MSG.noHandlerForAddress(targetAddress),
        },
      });
      return;
    }

    const envelope = {
      messageId,
      sourceAddress: message.sourceAddress,
      sourceNodeId: message.sourceNodeId,
      targetAddress,
      payload,
      timestamp: message.timestamp,
    };

    Promise.resolve()
      .then(() => handler(envelope))
      .then((result) => {
        this.logger.debug(ROUTER_LOG_MSG.SERVICE_RESPONSE_SENT, {
          messageId,
          targetAddress,
        });
        this.sendRaw(ws, {
          type: RouterMessageType.SERVICE_RESPONSE,
          messageId,
          sourceAddress: message.sourceAddress,
          result,
        });
      })
      .catch((error) => {
        this.logger.debug(ROUTER_LOG_MSG.SERVICE_RESPONSE_ERROR, {
          messageId,
          targetAddress,
          error: error.message,
        });
        this.sendRaw(ws, {
          type: RouterMessageType.SERVICE_RESPONSE,
          messageId,
          sourceAddress: message.sourceAddress,
          error: error.message,
        });
      });
  }

  /**
   * Handle SERVICE_RESPONSE message and settle pending response waiters.
   * @param {Object} message - Service response message.
   * @private
   */
  handleServiceResponse(message) {
    const {messageId, result, error} = message;
    this.logger.debug(ROUTER_LOG_MSG.SERVICE_RESPONSE_RECEIVED, {
      messageId,
      hasError: Boolean(error),
    });
    const settled = this.settlePendingResponse(messageId, {
      result,
      error,
    });
    if (!settled) {
      this.logger.warn(ROUTER_LOG_MSG.SERVICE_RESPONSE_NO_PENDING, {
        messageId,
      });
    }
  }

  /**
   * Register a pending SERVICE_RESPONSE waiter.
   * @param {string} messageId - Correlated message ID.
   * @param {string|null} targetNodeId - Target node ID.
   * @return {Promise<*>} Resolves with handler result.
   * @private
   */
  registerPendingResponse(messageId, targetNodeId = null) {
    return new Promise((resolve, reject) => {
      this.pendingResponses.set(messageId, {
        resolve,
        reject,
        timeoutId: null,
        targetNodeId,
      });
    });
  }

  /**
   * Arm timeout for a pending SERVICE_RESPONSE waiter.
   * Timeout is started after ACK to avoid premature rejection while still
   * waiting for sender-side ACK.
   * @param {string} messageId - Correlated message ID.
   * @param {number} timeoutMs - Timeout in milliseconds.
   * @return {boolean} True when timeout was armed.
   * @private
   */
  armPendingResponseTimeout(messageId, timeoutMs) {
    const pending = this.pendingResponses.get(messageId);
    if (!pending || pending.timeoutId) {
      return false;
    }
    const timeoutId = setTimeout(() => {
      this.pendingResponses.delete(messageId);
      pending.reject(new Error(ROUTER_ERROR_MSG.PENDING_RESPONSE_TIMEOUT));
    }, timeoutMs);
    if (typeof timeoutId.unref === TRANSPORT_TYPEOF.FUNCTION) {
      timeoutId.unref();
    }
    pending.timeoutId = timeoutId;
    return true;
  }

  /**
   * Settle pending SERVICE_RESPONSE waiter.
   * @param {string} messageId - Correlated message ID.
   * @param {Object} payload - Service response payload.
   * @param {*} payload.result - Handler result.
   * @param {string} payload.error - Handler error.
   * @return {boolean} True when pending waiter was found.
   * @private
   */
  settlePendingResponse(messageId, {result, error}) {
    const pending = this.pendingResponses.get(messageId);
    if (!pending) {
      return false;
    }
    if (pending.timeoutId) {
      clearTimeout(pending.timeoutId);
    }
    this.pendingResponses.delete(messageId);

    if (error) {
      pending.reject(new Error(error));
    } else {
      pending.resolve(result);
    }
    return true;
  }

  /**
   * Remove pending SERVICE_RESPONSE waiter without settling it.
   * @param {string} messageId - Correlated message ID.
   * @return {boolean} True when a waiter was removed.
   * @private
   */
  cancelPendingResponse(messageId) {
    const pending = this.pendingResponses.get(messageId);
    if (!pending) {
      return false;
    }
    if (pending.timeoutId) {
      clearTimeout(pending.timeoutId);
    }
    this.pendingResponses.delete(messageId);
    return true;
  }

  /**
   * Fail pending SERVICE_RESPONSE waiters for a target node.
   * @param {string} nodeId - Target node ID.
   * @param {Error} error - Failure reason.
   * @private
   */
  failPendingResponsesForNode(nodeId, error) {
    for (const [messageId, pending] of this.pendingResponses) {
      if (pending.targetNodeId === nodeId) {
        if (pending.timeoutId) {
          clearTimeout(pending.timeoutId);
        }
        this.pendingResponses.delete(messageId);
        pending.reject(error);
      }
    }
  }

  /**
   * Check whether an ACK includes legacy inline handler payload.
   * @param {Object} ackResult - ACK result.
   * @return {boolean} True when ACK carries handler payload.
   * @private
   */
  hasInlineAckPayload(ackResult) {
    if (!ackResult ||
      typeof ackResult !== TRANSPORT_TYPEOF.OBJECT ||
      ackResult.acknowledged !== true) {
      return false;
    }
    const passthroughKeys = new Set([
      'messageId',
      'acknowledged',
      'correlationId',
    ]);
    return Object.keys(ackResult).some((key) => !passthroughKeys.has(key));
  }

  /**
   * Normalize SERVICE_RESPONSE payload to transport delivery shape.
   * @param {*} result - Handler result payload.
   * @return {Object} Normalized payload fields.
   * @private
   */
  normalizeServiceResponseResult(result) {
    if (!result || typeof result !== TRANSPORT_TYPEOF.OBJECT) {
      return {};
    }
    const {acknowledged: _ack, type: handlerType, ...rest} = result;
    if (handlerType && !Object.prototype.hasOwnProperty.call(rest, 'responseType')) {
      rest.responseType = handlerType;
    }
    return rest;
  }

  /**
   * Handle acknowledgment message.
   * Passes through flat ACK structure without additional nesting.
   * @param {Object} message - Acknowledgment message.
   * @private
   */
  handleAcknowledgment(message) {
    const {messageId, acknowledged, error, type: _type, ...rest} = message;

    const pending = this.pendingMessages.get(messageId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingMessages.delete(messageId);

      if (acknowledged) {
        const connection = this.nodeConnections.get(pending.targetNodeId);
        if (connection &&
            connection.isIncoming !== true &&
            connection.isSelfConnection !== true) {
          connection.ackTimeoutStreak = TRANSPORT_NUM.ZERO;
          connection.lastAckAt = Date.now();
          connection.lastAckTimeoutAt = null;
        }
        const resolved = {messageId, acknowledged: true, ...rest};
        if (error !== undefined) {
          resolved.error = error;
        }
        // Pass through flat structure - spread all fields from ACK
        pending.resolve(resolved);
      } else {
        pending.reject(new Error(error || TRANSPORT_ERROR_MSG.MESSAGE_NOT_ACKNOWLEDGED));
      }
    }
  }

  /**
   * Handle connection close.
   * Self-disconnection is treated as a fatal error (no reconnection).
   * Requirements: 2.1
   * @param {string} nodeId - Node ID.
   * @param {string|null} expectedConnectionId - Optional stale-close fence.
   * @private
   */
  handleConnectionClose(nodeId, expectedConnectionId = null) {
    const connection = this.nodeConnections.get(nodeId);
    if (expectedConnectionId &&
        connection &&
        connection.connectionId !== expectedConnectionId) {
      this.logger.debug('Ignoring stale connection close event', {
        nodeId,
        expectedConnectionId,
        actualConnectionId: connection.connectionId,
      });
      return;
    }

    if (connection) {
      this.logger.info(ROUTER_LOG_MSG.CONNECTION_CLOSED, {
        nodeId,
        connectionId: connection.connectionId,
        isSelfConnection: connection.isSelfConnection,
      });

      connection.state = ConnectionState.DISCONNECTED;
      connection.ws = null;

      // Stop ping interval
      this.clearPingInterval(connection);

      const disconnectError = new Error(
        ROUTER_ERROR_MSG.connectionClosed(nodeId),
      );
      this.failOutboundQueue(nodeId, disconnectError);
      this.failPendingMessagesForNode(nodeId, disconnectError);
      this.failPendingResponsesForNode(nodeId, disconnectError);

      this.emit(TRANSPORT_EVENT.CONNECTION_CLOSED, {nodeId});

      if (this.isShuttingDown) {
        return;
      }

      if (connection.retired) {
        connection.state = ConnectionState.CLOSED;
        return;
      }

      // Self-disconnection is fatal - do not attempt reconnection
      if (connection.isSelfConnection) {
        this.logger.error(ROUTER_LOG_MSG.SELF_CONNECTION_LOST, {
          nodeId,
          connectionId: connection.connectionId,
        });
        this.emit(TRANSPORT_EVENT.SELF_DISCONNECT, {nodeId});
        return;
      }

      // Attempt reconnection for outgoing connections to other nodes
      if (!connection.isIncoming && connection.address) {
        this.scheduleReconnect(connection);
      }
    }
  }

  /**
   * Schedule reconnection attempt.
   * @param {Object} connectionInfo - Connection information.
   * @private
   */
  scheduleReconnect(connectionInfo) {
    if (this.isShuttingDown) {
      return;
    }
    if (connectionInfo.retired || !this.isCurrentConnection(connectionInfo)) {
      this.retireConnection(connectionInfo);
      connectionInfo.state = ConnectionState.CLOSED;
      return;
    }
    if (connectionInfo.reconnectTimeout) {
      return;
    }
    if (connectionInfo.reconnectAttempts >= this.reconnectMaxAttempts) {
      this.logger.error(ROUTER_LOG_MSG.MAX_RECONNECTS_REACHED, {
        nodeId: connectionInfo.nodeId,
        attempts: connectionInfo.reconnectAttempts,
      });
      connectionInfo.state = ConnectionState.CLOSED;
      return;
    }

    connectionInfo.state = ConnectionState.RECONNECTING;
    connectionInfo.reconnectAttempts += TRANSPORT_NUM.ONE;

    const delay = this.reconnectIntervalMs *
      Math.pow(
        this.reconnectBackoffMultiplier,
        connectionInfo.reconnectAttempts - TRANSPORT_NUM.ONE,
      );
    connectionInfo.reconnectDueAt = Date.now() + delay;

    this.logger.debug(ROUTER_LOG_MSG.SCHEDULING_RECONNECT, {
      nodeId: connectionInfo.nodeId,
      attempt: connectionInfo.reconnectAttempts,
      delayMs: delay,
    });

    connectionInfo.reconnectTimeout = setTimeout(async () => {
      connectionInfo.reconnectTimeout = null;
      connectionInfo.reconnectDueAt = null;
      if (connectionInfo.retired || !this.isCurrentConnection(connectionInfo)) {
        this.retireConnection(connectionInfo);
        connectionInfo.state = ConnectionState.CLOSED;
        return;
      }
      try {
        this.refreshReconnectAuthority(
          connectionInfo,
          connectionInfo.address || connectionInfo.configuredAddress,
        );
        if ((!connectionInfo.address ||
            connectionInfo.address.length === TRANSPORT_NUM.ZERO) &&
            typeof connectionInfo.configuredAddress === TRANSPORT_TYPEOF.STRING &&
            connectionInfo.configuredAddress.length > TRANSPORT_NUM.ZERO) {
          connectionInfo.address = connectionInfo.configuredAddress;
        }
        await this.establishConnection(connectionInfo);
      } catch (error) {
        this.logger.error(ROUTER_LOG_MSG.RECONNECT_FAILED, {
          nodeId: connectionInfo.nodeId,
          error: error.message,
        });
        if (this.isShuttingDown) {
          return;
        }
        this.scheduleReconnect(connectionInfo);
      }
    }, delay);
    if (typeof connectionInfo.reconnectTimeout?.unref === 'function') {
      connectionInfo.reconnectTimeout.unref();
    }
  }

  /**
   * Start ping interval for connection.
   * @param {Object} connectionInfo - Connection information.
   * @private
   */
  startPingInterval(connectionInfo) {
    connectionInfo.pingInterval = setInterval(() => {
      if (connectionInfo.ws &&
          connectionInfo.ws.readyState === WebSocket.OPEN) {
        this.sendRaw(connectionInfo.ws, {
          type: RouterMessageType.PING,
          timestamp: Date.now(),
        });
      }
    }, this.pingIntervalMs);
    // Unref to allow process exit when this is the only timer
    connectionInfo.pingInterval.unref();
  }

  /**
   * Register a service handler.
   * The handler will be invoked when messages arrive for this address.
   * Requirements: 5.1
   * @param {string} address - Service address in unified format (nodeId/entityType/entityId).
   * @param {Function} handler - Message handler function.
   */
  register(address, handler, _options = {}) {
    if (typeof handler !== TRANSPORT_TYPEOF.FUNCTION) {
      throw new Error(TRANSPORT_ERROR_MSG.HANDLER_MUST_BE_FUNCTION);
    }

    // Validate address format
    if (!this.isValidAddress(address)) {
      throw new Error(ROUTER_ERROR_MSG.invalidAddressFormat(address));
    }

    this.handlers.set(address, handler);

    this.logger.debug(ROUTER_LOG_MSG.HANDLER_REGISTERED, {
      address,
      routerId: this.routerId,
      totalHandlers: this.handlers.size,
    });
  }

  /**
   * Register a worker delivery handler.
   * Alias for register() used by ReplicaWorkerManager.
   * @param {string} address - Worker unified address.
   * @param {Function} deliverFn - Worker delivery function.
   */
  registerWorkerHandler(address, deliverFn) {
    this.register(address, deliverFn);
  }

  /**
   * Parse a unified address into its components.
   * Address format: ${nodeId}/${entityType}/${entityId}
   * Requirements: 1.2, 9.1
   * @param {string} address - Address to parse.
   * @return {Object} Parsed address with nodeId, entityType, entityId.
   *                  Returns null values for malformed addresses.
   */
  parseAddress(address) {
    if (!address || typeof address !== TRANSPORT_TYPEOF.STRING) {
      return {nodeId: null, entityType: null, entityId: null};
    }

    const parts = address.split(ROUTER_ADDRESS.SEPARATOR);
    if (parts.length !== TRANSPORT_NUM.THREE) {
      return {nodeId: null, entityType: null, entityId: null};
    }
    return {
      nodeId: parts[TRANSPORT_NUM.ZERO] || null,
      entityType: parts[TRANSPORT_NUM.ONE] || null,
      entityId: parts[TRANSPORT_NUM.TWO] || null,
    };
  }

  /**
   * Validate that an address follows the unified format.
   * Format: ${nodeId}/${entityType}/${entityId}
   * Valid entityTypes: message-group, partition, lifecycle, service
   * Requirements: 1.1, 1.3
   * @param {string} address - Address to validate.
   * @return {boolean} True if address is valid.
   */
  isValidAddress(address) {
    if (!address || typeof address !== TRANSPORT_TYPEOF.STRING) {
      return false;
    }

    const parts = address.split(ROUTER_ADDRESS.SEPARATOR);
    if (parts.length !== TRANSPORT_NUM.THREE) {
      return false;
    }

    const [nodeId, entityType, entityId] = parts;

    // All parts must be non-empty
    if (!nodeId || !entityType || !entityId) {
      return false;
    }

    // entityType must be one of the valid types
    return ROUTER_VALID_ENTITY_TYPES.includes(entityType);
  }

  /**
   * Unregister a service handler.
   * @param {string} address - Service address.
   */
  unregister(address) {
    this.handlers.delete(address);

    this.logger.debug(ROUTER_LOG_MSG.HANDLER_UNREGISTERED, {
      address,
      routerId: this.routerId,
      totalHandlers: this.handlers.size,
    });
  }

  /**
   * Unregister a worker delivery handler.
   * Alias for unregister() used by ReplicaWorkerManager.
   * @param {string} address - Worker unified address.
   */
  unregisterWorkerHandler(address) {
    this.unregister(address);
  }

  /**
   * Check whether a worker handler is registered.
   * @param {string} address - Worker unified address.
   * @return {boolean} True if registered.
   */
  hasWorkerHandler(address) {
    return this.handlers.has(address);
  }

  /**
   * Set the function to resolve service address to node ID.
   * @param {Function} resolver - Function(address) => nodeId or null.
   */
  setServiceNodeResolver(resolver) {
    this.resolveServiceNode = resolver;
  }

  /**
   * Set the function to resolve node ID to a WebSocket address.
   * @param {Function|null} resolver - Function(nodeId) => wsAddress or null.
   */
  setNodeAddressResolver(resolver) {
    this.resolveNodeAddress = resolver || null;
  }

  /**
   * Set resolver for query/data-plane message-group transport.
   * Resolver must return a local MessageGroupService with sendMessage().
   * @param {Function|null} resolver - Resolver function.
   */
  setQueryMessageGroupServiceResolver(resolver) {
    this.resolveQueryMessageGroupService = resolver || null;
  }

  /**
   * Check whether a payload is a query/data-plane message.
   * @param {Object} message - Delivery payload.
   * @return {boolean} True for query/data-plane payloads.
   * @private
   */
  isQueryDataPlaneMessage(message) {
    return Boolean(
      message &&
      typeof message === TRANSPORT_TYPEOF.OBJECT &&
      message.type === QUERY_DATA_PLANE_MESSAGE_TYPE,
    );
  }

  /**
   * Resolve the query/data-plane transport selection.
   * Resolver may return a service directly or a typed selection object.
   * @return {{service:Object|null, reason:string, retryAfterMs:number}}
   * @private
   */
  resolveQueryDataPlaneTransportSelection() {
    if (typeof this.resolveQueryMessageGroupService !==
      TRANSPORT_TYPEOF.FUNCTION) {
      return {
        service: null,
        reason: ROUTER_ERROR_MSG.QUERY_MESSAGE_GROUP_TRANSPORT_REQUIRED,
        retryAfterMs: this.reconnectIntervalMs,
      };
    }

    const selection = this.resolveQueryMessageGroupService();
    if (selection &&
        typeof selection.sendMessage === TRANSPORT_TYPEOF.FUNCTION) {
      return {
        service: selection,
        reason: '',
        retryAfterMs: TRANSPORT_NUM.ZERO,
      };
    }

    if (selection?.service &&
        typeof selection.service.sendMessage === TRANSPORT_TYPEOF.FUNCTION) {
      return {
        service: selection.service,
        reason: '',
        retryAfterMs:
          Number.isFinite(selection.retryAfterMs) &&
            selection.retryAfterMs > TRANSPORT_NUM.ZERO ?
            Math.floor(selection.retryAfterMs) :
            TRANSPORT_NUM.ZERO,
      };
    }

    return {
      service: null,
      reason:
        typeof selection?.reason === TRANSPORT_TYPEOF.STRING &&
          selection.reason.length > TRANSPORT_NUM.ZERO ?
          selection.reason :
          ROUTER_ERROR_MSG.QUERY_MESSAGE_GROUP_TRANSPORT_REQUIRED,
      retryAfterMs:
        Number.isFinite(selection?.retryAfterMs) &&
          selection.retryAfterMs > TRANSPORT_NUM.ZERO ?
          Math.floor(selection.retryAfterMs) :
          this.reconnectIntervalMs,
    };
  }

  /**
   * Build a typed deferred outcome for query/data-plane transport misses.
   * @param {{reason:string,retryAfterMs:number}} selection
   * @return {Object}
   * @private
   */
  buildDeferredQueryTransportOutcome(selection = {}) {
    const retryAfterMs =
      Number.isFinite(selection.retryAfterMs) &&
        selection.retryAfterMs > TRANSPORT_NUM.ZERO ?
        Math.floor(selection.retryAfterMs) :
        this.reconnectIntervalMs;
    return {
      acknowledged: false,
      error:
        selection.reason ||
        ROUTER_ERROR_MSG.QUERY_MESSAGE_GROUP_TRANSPORT_REQUIRED,
      errorCode: 'ROUTER_QUERY_TRANSPORT_NOT_READY',
      deferRetry: true,
      retryAfterMs,
    };
  }

  /**
   * Get or create outbound queue for a node.
   * @param {string} nodeId - Target node ID.
   * @return {Object} Queue state.
   * @private
   */
  getOutboundQueue(nodeId) {
    if (!this.outboundQueues.has(nodeId)) {
      this.outboundQueues.set(nodeId, {
        nodeId,
        inFlight: TRANSPORT_NUM.ZERO,
        pending: [],
        maxConcurrent: this.outboundQueueMaxConcurrent,
        maxPending: this.outboundQueueMaxPending,
        criticalReserve: this.outboundQueueCriticalReserve,
        queueWaitSampleCount: TRANSPORT_NUM.ZERO,
        queueWaitTotalMs: TRANSPORT_NUM.ZERO,
        queueWaitMaxMs: TRANSPORT_NUM.ZERO,
        queueWaitHistogram: createQueueWaitHistogram(),
      });
    }
    return this.outboundQueues.get(nodeId);
  }

  /**
   * Check if the outbound queue has immediate capacity for a node.
   * @param {string} nodeId - Target node ID.
   * @return {boolean} True if capacity is available.
   */
  isOutboundQueueAvailable(nodeId) {
    const queue = this.outboundQueues.get(nodeId);
    if (!queue) {
      return true;
    }
    return queue.inFlight < queue.maxConcurrent;
  }

  /**
   * Enqueue a delivery for a node with per-node concurrency limits.
   * @param {string} nodeId - Target node ID.
   * @param {Function} deliverFn - Function that returns a Promise result.
   * @return {Promise<Object>} Delivery result.
   * @private
   */
  enqueueOutbound(nodeId, deliverFn, options = {}) {
    const queue = this.getOutboundQueue(nodeId);
    const deliveryPriority = normalizeOutboundDeliveryPriority(
      options.deliveryPriority,
    );
    const deliverySource = resolveDeliverySource(
      options.targetAddress,
      options.message,
      options,
    );
    const replacePendingKey = resolvePendingReplacementKey(
      options.targetAddress,
      options.message,
      options,
    );

    return new Promise((resolve, reject) => {
      if (replacePendingKey) {
        const existingPendingIndex = queue.pending.findIndex((item) =>
          item?.replacePendingKey === replacePendingKey,
        );
        if (existingPendingIndex >= TRANSPORT_NUM.ZERO) {
          const existingPendingItem = queue.pending[existingPendingIndex];
          existingPendingItem.resolve(
            buildSupersededPendingResult(existingPendingItem),
          );
          queue.pending[existingPendingIndex] = {
            deliverFn,
            resolve,
            reject,
            queuedAt: Date.now(),
            priority: deliveryPriority,
            deliverySource,
            replacePendingKey,
          };
          return;
        }
      }
      const pendingBackground = countPendingByPriority(
        queue,
        OutboundDeliveryPriority.BACKGROUND,
      );
      const backgroundPendingLimit = resolveBackgroundPendingLimit(queue);
      const isBackpressured =
        deliveryPriority === OutboundDeliveryPriority.CRITICAL ?
          queue.pending.length >= queue.maxPending :
          pendingBackground >= backgroundPendingLimit;
      if (isBackpressured) {
        const error = new Error(
          ROUTER_ERROR_MSG.outboundQueueBackpressured(
            nodeId,
            queue.maxPending,
          ),
        );
        error.code = OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE;
        this.logger.warn('Outbound queue saturated for node delivery', {
          localNodeId: this.nodeId,
          targetNodeId: nodeId,
          deliveryPriority,
          attemptedDeliverySource: deliverySource,
          attemptedTargetAddress:
            normalizeIdentifier(options.targetAddress),
          pending: queue.pending.length,
          pendingCritical: countPendingByPriority(
            queue,
            OutboundDeliveryPriority.CRITICAL,
          ),
          pendingBackground,
          backgroundPendingLimit,
          criticalReserve: queue.criticalReserve,
          maxPending: queue.maxPending,
          inFlight: queue.inFlight,
          pendingSourceSummary: buildPendingSourceSummary(queue),
        });
        reject(error);
        return;
      }
      queue.pending.push({
        deliverFn,
        resolve,
        reject,
        queuedAt: Date.now(),
        priority: deliveryPriority,
        deliverySource,
        replacePendingKey,
      });
      this.processOutboundQueue(nodeId);
    });
  }

  /**
   * Process queued outbound deliveries for a node.
   * @param {string} nodeId - Target node ID.
   * @private
   */
  processOutboundQueue(nodeId) {
    const queue = this.outboundQueues.get(nodeId);
    if (!queue) {
      return;
    }

    while (queue.inFlight < queue.maxConcurrent &&
      queue.pending.length > TRANSPORT_NUM.ZERO) {
      const item = dequeueNextPendingItem(queue);
      queue.inFlight += TRANSPORT_NUM.ONE;
      const queueWaitMs = Math.max(
        TRANSPORT_NUM.ZERO,
        Date.now() - (item?.queuedAt || Date.now()),
      );
      recordQueueWaitDuration(queue, queueWaitMs);

      Promise.resolve()
        .then(() => item.deliverFn())
        .then((result) => {
          queue.inFlight -= TRANSPORT_NUM.ONE;
          item.resolve({result, queueWaitMs});
          this.processOutboundQueue(nodeId);
        })
        .catch((error) => {
          queue.inFlight -= TRANSPORT_NUM.ONE;
          item.reject(error);
          this.processOutboundQueue(nodeId);
        });
    }
  }

  /**
   * Fail queued outbound deliveries for a node.
   * @param {string} nodeId - Target node ID.
   * @param {Error} error - Error to reject with.
   * @private
   */
  failOutboundQueue(nodeId, error) {
    const queue = this.outboundQueues.get(nodeId);
    if (!queue) {
      return;
    }

    while (queue.pending.length > TRANSPORT_NUM.ZERO) {
      const item = dequeueNextPendingItem(queue);
      item.reject(error);
    }
  }

  /**
   * Gracefully fail queued outbound deliveries (no rejection).
   * Used during shutdown to avoid unhandled rejections from fire-and-forget tasks.
   * @param {string} nodeId - Target node ID.
   * @param {Error} error - Error to return as a failed delivery.
   * @private
   */
  failOutboundQueueGracefully(nodeId, error) {
    const queue = this.outboundQueues.get(nodeId);
    if (!queue) {
      return;
    }

    const errorMessage = error?.message || ROUTER_ERROR_MSG.SHUTDOWN;
    while (queue.pending.length > TRANSPORT_NUM.ZERO) {
      const item = dequeueNextPendingItem(queue);
      item.resolve({
        acknowledged: false,
        error: errorMessage,
        shutdown: true,
      });
    }
  }

  /**
   * Fail pending in-flight messages for a node.
   * @param {string} nodeId - Target node ID.
   * @param {Error} error - Error to reject with.
   * @private
   */
  failPendingMessagesForNode(nodeId, error) {
    for (const [messageId, pending] of this.pendingMessages) {
      if (pending.targetNodeId === nodeId) {
        clearTimeout(pending.timeout);
        this.pendingMessages.delete(messageId);
        pending.reject(error);
      }
    }
  }

  /**
   * Decide whether a transport-deliver metric should be emitted.
   * Emits immediately for faults, slow deliveries, and meaningful
   * queue-depth transitions; samples steady-state successful traffic.
   * @param {string} targetNodeId - Target node ID.
   * @param {number} durationMs - Delivery duration in milliseconds.
   * @param {number} queueDepth - Pending outbound queue depth.
   * @param {boolean} acknowledged - Whether delivery was acknowledged.
   * @return {string|null} Trigger code when metric should be emitted.
   * @private
   */
  getDeliverMetricTrigger(targetNodeId, durationMs, queueDepth, acknowledged) {
    if (!acknowledged) {
      const faultSampleCount = (
        this.deliverMetricFaultSampleByTarget.get(targetNodeId) ||
        TRANSPORT_NUM.ZERO
      ) + TRANSPORT_NUM.ONE;
      this.deliverMetricFaultSampleByTarget.set(
        targetNodeId,
        faultSampleCount,
      );
      if (
        faultSampleCount === TRANSPORT_NUM.ONE ||
        faultSampleCount %
          TRANSPORT_METRIC.DELIVER_FAULT_SAMPLE_EVERY === TRANSPORT_NUM.ZERO
      ) {
        return TRANSPORT_METRIC_TRIGGER.FAULT;
      }
      return null;
    }
    this.deliverMetricFaultSampleByTarget.set(targetNodeId, TRANSPORT_NUM.ZERO);

    if (durationMs >= TRANSPORT_METRIC.DELIVER_SLOW_THRESHOLD_MS) {
      return TRANSPORT_METRIC_TRIGGER.SLOW;
    }

    const previousQueueDepth =
      this.deliverMetricQueueDepthByTarget.get(targetNodeId) ||
      TRANSPORT_NUM.ZERO;

    if (queueDepth >= TRANSPORT_METRIC.DELIVER_QUEUE_BACKPRESSURE_THRESHOLD) {
      const queueDepthDelta = Math.abs(queueDepth - previousQueueDepth);
      if (previousQueueDepth <
        TRANSPORT_METRIC.DELIVER_QUEUE_BACKPRESSURE_THRESHOLD ||
        queueDepthDelta >= TRANSPORT_METRIC.DELIVER_QUEUE_CHANGE_THRESHOLD) {
        return TRANSPORT_METRIC_TRIGGER.BACKPRESSURE;
      }
    } else if (
      previousQueueDepth >=
      TRANSPORT_METRIC.DELIVER_QUEUE_BACKPRESSURE_THRESHOLD
    ) {
      return TRANSPORT_METRIC_TRIGGER.QUEUE_DRAINED;
    }

    const sampleCount = (this.deliverMetricSampleByTarget.get(targetNodeId) ||
      TRANSPORT_NUM.ZERO) + TRANSPORT_NUM.ONE;
    this.deliverMetricSampleByTarget.set(targetNodeId, sampleCount);

    if (sampleCount >= TRANSPORT_METRIC.DELIVER_SUCCESS_SAMPLE_EVERY) {
      this.deliverMetricSampleByTarget.set(targetNodeId, TRANSPORT_NUM.ZERO);
      return TRANSPORT_METRIC_TRIGGER.SAMPLE;
    }

    return null;
  }

  /**
   * Deliver message locally by invoking the registered handler directly,
   * bypassing WebSocket serialization. Falls back to deliverRemote when
   * no handler is registered (e.g. join request/complete special handlers).
   * @param {string} targetAddress - Target address.
   * @param {string} messageId - Message ID.
   * @param {Object} payload - Message payload.
   * @param {string} correlationId - Correlation ID.
   * @return {Promise<Object>} Delivery outcome with result and queueWaitMs.
   * @private
   */
  async deliverLocal(targetAddress, messageId, payload, correlationId) {
    const handler = this.handlers.get(targetAddress);
    if (!handler) {
      // Fall back to remote path for special handlers (join request, etc.)
      return this.deliverRemote(
        targetAddress, messageId, payload,
        this.nodeId, correlationId,
      );
    }

    const envelope = {
      messageId,
      sourceAddress: ROUTER_ADDRESS.buildSourceAddress(this.nodeId),
      sourceNodeId: this.nodeId,
      targetAddress,
      payload,
      timestamp: Date.now(),
    };

    try {
      const result = await Promise.resolve(handler(envelope));
      return {
        result: {
          messageId,
          correlationId,
          acknowledged: true,
          ...(result && typeof result === TRANSPORT_TYPEOF.OBJECT
            ? (() => {
              const {
                acknowledged: _ack,
                type: handlerType,
                ...rest
              } = result;
              const merged = {...rest};
              if (handlerType) merged.responseType = handlerType;
              return merged;
            })()
            : {}),
        },
        queueWaitMs: TRANSPORT_NUM.ZERO,
      };
    } catch (error) {
      return {
        result: {
          messageId,
          correlationId,
          acknowledged: false,
          error: error.message,
        },
        queueWaitMs: TRANSPORT_NUM.ZERO,
      };
    }
  }


  /**
   * Deliver a message to a target service via WebSocket connections.
   * @param {string} targetAddress - Target service address.
   * @param {Object} message - Message to deliver.
   * @param {Object} options - Delivery options.
   * @param {string} options.targetNodeId - Target node ID (if known).
   * @return {Promise<Object>} Delivery result with transportUsed field when using registry.
   */
  async deliver(targetAddress, message, options = {}) {
    const deliverStartMs = Date.now();
    if (!this.initialized) {
      await this.initialize();
    }

    const messageId = message.messageId || uuidv4();
    const correlationId = message.correlationId || messageId;
    const requestId = resolveRequestIdFromMessage(message);
    const operationId = resolveOperationIdFromMessage(message);
    const deliverySource = resolveDeliverySource(targetAddress, message, options);
    this.messageCount += TRANSPORT_NUM.ONE;

    // Determine target node
    let targetNodeId = options.targetNodeId;

    // If no targetNodeId provided, try to extract from address or use resolver
    if (!targetNodeId) {
      // Try to parse nodeId from unified address format (nodeId/entityType/entityId)
      const parsed = this.parseAddress(targetAddress);
      if (parsed.nodeId) {
        targetNodeId = parsed.nodeId;
      }
    }

    if (!targetNodeId && this.resolveServiceNode) {
      targetNodeId = this.resolveServiceNode(targetAddress);
    }

    if (!targetNodeId) {
      throw new Error(ROUTER_ERROR_MSG.invalidAddressFormat(targetAddress));
    }

    let deliveryOutcome;
    if (this.isQueryDataPlaneMessage(message)) {
      const queryTransportSelection =
        this.resolveQueryDataPlaneTransportSelection();
      const queryTransport = queryTransportSelection.service;
      if (queryTransport) {
        const queryResult = await queryTransport.sendMessage(
          targetAddress,
          message,
        );
        deliveryOutcome = {
          result: queryResult,
          queueWaitMs: TRANSPORT_NUM.ZERO,
        };
      } else {
        deliveryOutcome = {
          result: this.buildDeferredQueryTransportOutcome(
            queryTransportSelection,
          ),
          queueWaitMs: TRANSPORT_NUM.ZERO,
        };
      }
    }
    if (!deliveryOutcome && targetNodeId === this.nodeId) {
      deliveryOutcome = await this.deliverLocal(
        targetAddress, messageId, message, correlationId,
      );
    } else if (!deliveryOutcome) {
      deliveryOutcome = await this.deliverRemote(
        targetAddress, messageId, message,
        targetNodeId, correlationId, {
          ...options,
          deliverySource,
        },
      );
    }
    const normalizedOutcome = normalizeDeliveryOutcome(deliveryOutcome);
    const result = normalizedOutcome.result;
    const queueWaitMs = normalizedOutcome.queueWaitMs;

    try {
      const queue = this.outboundQueues.get(targetNodeId);
      const queueDepth = queue ? queue.pending.length : TRANSPORT_NUM.ZERO;
      const queueWaitSummary = buildQueueWaitSummary(queue);
      const durationMs = Date.now() - deliverStartMs;
      const acknowledged = result?.acknowledged === true;
      const trigger = this.getDeliverMetricTrigger(
        targetNodeId,
        durationMs,
        queueDepth,
        acknowledged,
      );
      if (trigger) {
        this.deliverMetricQueueDepthByTarget.set(targetNodeId, queueDepth);
        if (trigger !== TRANSPORT_METRIC_TRIGGER.SAMPLE) {
          this.deliverMetricSampleByTarget.set(targetNodeId, TRANSPORT_NUM.ZERO);
        }
        this.logger.info(METRICS_LOG_TAG.TRANSPORT_DELIVER, {
          targetNodeId,
          messageId,
          correlationId,
          requestId,
          operationId,
          durationMs,
          messageCount: this.messageCount,
          queueDepth,
          queueWaitMs,
          queueWaitSummary,
          acknowledged,
          trigger,
          error: acknowledged ? null : (result?.error || null),
        });
      }
    } catch (_metricsErr) {
      // Metrics logging must not propagate to callers
    }

    return result;
  }

  /**
   * Deliver message to node via WebSocket.
   * @param {string} targetAddress - Target address.
   * @param {string} messageId - Message ID.
   * @param {Object} payload - Message payload.
   * @param {string} targetNodeId - Target node ID.
   * @return {Promise<Object>} Delivery result.
   * @private
   */
  async deliverRemote(
    targetAddress,
    messageId,
    payload,
    targetNodeId,
    correlationId,
    options = {},
  ) {
    // Register pending response before send to avoid races where the
    // SERVICE_RESPONSE arrives immediately after ACK.
    const responsePromise = this.registerPendingResponse(
      messageId,
      targetNodeId,
    );
    let earlyResponseError = null;
    responsePromise.catch((error) => {
      earlyResponseError = error;
    });

    let ackResult;
    let queueWaitMs = TRANSPORT_NUM.ZERO;
    try {
      const ackOutcome = await this.enqueueOutbound(targetNodeId, () => {
        let connection = this.nodeConnections.get(targetNodeId);
        const reconnectInProgress = this.buildReconnectInProgressFailure(
          targetNodeId,
          messageId,
          correlationId,
        );
        if (reconnectInProgress) {
          return reconnectInProgress;
        }

        if ((!connection || connection.state !== ConnectionState.CONNECTED) &&
            !this.isShuttingDown) {
          const reconnectAddress =
            this.resolveReconnectAddresses(targetNodeId)[TRANSPORT_NUM.ZERO] ||
            null;
          if (reconnectAddress) {
            return this.tryDeliverAfterReconnect(
              reconnectAddress,
              targetAddress,
              messageId,
              payload,
              targetNodeId,
              correlationId,
            );
          }
        }

        if (!connection || connection.state !== ConnectionState.CONNECTED) {
          this.logger.warn(ROUTER_LOG_MSG.NO_TARGET_CONNECTION, {
            messageId,
            targetAddress,
            targetNodeId,
            localNodeId: this.nodeId,
            connectionExists: !!connection,
            connectionState: connection?.state,
            availableConnections: Array.from(this.nodeConnections.keys()),
          });

          return this.buildDeferredDeliveryFailure(
            messageId,
            correlationId,
            ROUTER_ERROR_MSG.noConnectionToNode(targetNodeId),
            {
              errorCode: ROUTER_NO_CONNECTION_ERROR_CODE,
              retryAfterMs: this.reconnectIntervalMs,
            },
          );
        }

        return this.sendMessage(
          connection,
          targetAddress,
          messageId,
          payload,
          targetNodeId,
          correlationId,
        );
      }, {
        deliveryPriority: options.deliveryPriority,
        deliverySource: options.deliverySource,
        targetAddress,
        message: payload,
      });
      const normalizedAckOutcome = normalizeDeliveryOutcome(ackOutcome);
      ackResult = normalizedAckOutcome.result;
      queueWaitMs = normalizedAckOutcome.queueWaitMs;
    } catch (error) {
      const deferredFailure = await this.resolveRecoverableDeliveryError({
        error,
        targetNodeId,
        targetAddress,
        messageId,
        payload,
        correlationId,
      });
      if (deferredFailure) {
        this.cancelPendingResponse(messageId);
        return {
          result: deferredFailure,
          queueWaitMs: TRANSPORT_NUM.ZERO,
        };
      }
      this.cancelPendingResponse(messageId);
      if (error?.code === OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE) {
        return {
          result: this.buildDeferredDeliveryFailure(
            messageId,
            correlationId,
            error.message,
            {
              errorCode: error.code,
              retryAfterMs: this.reconnectIntervalMs,
            },
          ),
          queueWaitMs: TRANSPORT_NUM.ZERO,
        };
      }
      throw error;
    }

    if (!ackResult?.acknowledged) {
      this.cancelPendingResponse(messageId);
      return {
        result: ackResult,
        queueWaitMs,
      };
    }

    // Compatibility: tolerate legacy ACKs that still include handler payload.
    if (this.hasInlineAckPayload(ackResult)) {
      this.cancelPendingResponse(messageId);
      return {
        result: ackResult,
        queueWaitMs,
      };
    }

    // Start response timeout only after ACK succeeded.
    this.armPendingResponseTimeout(messageId, this.messageTimeoutMs);

    try {
      if (earlyResponseError) {
        throw earlyResponseError;
      }
      const serviceResult = await responsePromise;
      return {
        result: {
          messageId,
          correlationId,
          acknowledged: true,
          ...this.normalizeServiceResponseResult(serviceResult),
        },
        queueWaitMs,
      };
    } catch (error) {
      return {
        result: {
          messageId,
          correlationId,
          acknowledged: true,
          error: error.message,
        },
        queueWaitMs,
      };
    }
  }

  /**
   * Resolve a WebSocket address for one target node when delivery needs an
   * on-demand connection recovery.
   * @param {string} targetNodeId
   * @return {string|null}
   * @private
   */
  resolveNodeAddressForDelivery(targetNodeId) {
    if (typeof this.resolveNodeAddress !== TRANSPORT_TYPEOF.FUNCTION) {
      return null;
    }
    try {
      const resolved = this.resolveNodeAddress(targetNodeId);
      return typeof resolved === TRANSPORT_TYPEOF.STRING &&
        resolved.length > TRANSPORT_NUM.ZERO ?
        resolved :
        null;
    } catch (error) {
      this.logger.warn('Failed to resolve node connection address for delivery recovery', {
        targetNodeId,
        localNodeId: this.nodeId,
        error: error?.message || String(error),
      });
      return null;
    }
  }

  /**
   * Resolve the current canonical reconnect address for one peer.
   * Authoritative endpoint/cache data wins over historical connection memory.
   * @param {string} targetNodeId
   * @param {string|null} fallbackAddress
   * @return {string|null}
   * @private
   */
  resolveCanonicalReconnectAddress(targetNodeId, fallbackAddress = null) {
    const resolvedAddress = this.resolveNodeAddressForDelivery(targetNodeId);
    if (typeof resolvedAddress === TRANSPORT_TYPEOF.STRING &&
        resolvedAddress.length > TRANSPORT_NUM.ZERO) {
      return normalizeToWebSocketAddress(resolvedAddress) || resolvedAddress;
    }

    const normalizedFallback =
      normalizeToWebSocketAddress(fallbackAddress) || fallbackAddress;
    return typeof normalizedFallback === TRANSPORT_TYPEOF.STRING &&
      normalizedFallback.length > TRANSPORT_NUM.ZERO ?
      normalizedFallback :
      null;
  }

  /**
   * Refresh reconnect ownership to the latest canonical address for a peer.
   * This prevents scheduled reconnects from carrying stale hostnames forward
   * after authoritative endpoint data has changed.
   * @param {Object|null} connectionInfo
   * @param {string|null} fallbackAddress
   * @return {string|null}
   * @private
   */
  refreshReconnectAuthority(connectionInfo, fallbackAddress = null) {
    if (!connectionInfo || typeof connectionInfo !== TRANSPORT_TYPEOF.OBJECT) {
      return null;
    }

    const previousConfigured =
      normalizeToWebSocketAddress(connectionInfo.configuredAddress) ||
      connectionInfo.configuredAddress ||
      null;
    const canonicalAddress = this.resolveCanonicalReconnectAddress(
      connectionInfo.nodeId,
      fallbackAddress,
    );
    if (!canonicalAddress) {
      return null;
    }

    connectionInfo.configuredAddress = canonicalAddress;
    const currentAddress =
      normalizeToWebSocketAddress(connectionInfo.address) ||
      connectionInfo.address ||
      null;
    const hasObservedAddress =
      typeof connectionInfo.observedAddress === TRANSPORT_TYPEOF.STRING &&
      connectionInfo.observedAddress.length > TRANSPORT_NUM.ZERO;
    if (!hasObservedAddress ||
        !currentAddress ||
        connectionInfo.state !== ConnectionState.CONNECTED ||
        currentAddress === previousConfigured) {
      connectionInfo.address = canonicalAddress;
    }

    return canonicalAddress;
  }

  /**
   * Return true when one peer already owns a reconnect timer.
   * @param {Object|null} connectionInfo
   * @return {boolean}
   * @private
   */
  hasScheduledReconnect(connectionInfo) {
    return Boolean(
      connectionInfo &&
      connectionInfo.state === ConnectionState.RECONNECTING &&
      connectionInfo.reconnectTimeout,
    );
  }

  /**
   * Compute one bounded retry-after hint for an armed reconnect.
   * @param {Object|null} connectionInfo
   * @return {number}
   * @private
   */
  resolveReconnectRetryAfterMs(connectionInfo) {
    const dueAt = connectionInfo?.reconnectDueAt;
    if (!Number.isFinite(dueAt)) {
      return this.reconnectIntervalMs;
    }
    return Math.max(
      TRANSPORT_NUM.ZERO,
      Math.ceil(dueAt - Date.now()),
    );
  }

  /**
   * Build one closed-connection error with recovery metadata.
   * @param {string} targetNodeId
   * @param {Object} [options]
   * @param {boolean} [options.beforeSend=false]
   * @param {number} [options.retryAfterMs]
   * @return {Error}
   * @private
   */
  buildConnectionClosedError(targetNodeId, options = {}) {
    const error = new Error(
      ROUTER_ERROR_MSG.connectionClosed(targetNodeId),
    );
    error.code = ROUTER_CONNECTION_CLOSED_ERROR_CODE;
    error.deferRetry = true;
    error.retryAfterMs = normalizeRetryAfterMs(
      options.retryAfterMs,
      this.reconnectIntervalMs,
    );
    error.recoverableBeforeSend = options.beforeSend === true;
    return error;
  }

  /**
   * Return one deferred outcome when a reconnect timer already owns recovery.
   * @param {string} targetNodeId
   * @param {string} messageId
   * @param {string} correlationId
   * @return {Object|null}
   * @private
   */
  buildReconnectInProgressFailure(targetNodeId, messageId, correlationId) {
    const connection = this.nodeConnections.get(targetNodeId) || null;
    if (!this.hasScheduledReconnect(connection)) {
      return null;
    }
    return this.buildDeferredDeliveryFailure(
      messageId,
      correlationId,
      ROUTER_ERROR_MSG.connectionClosed(targetNodeId),
      {
        errorCode: ROUTER_CONNECTION_CLOSED_ERROR_CODE,
        retryAfterMs: this.resolveReconnectRetryAfterMs(connection),
      },
    );
  }

  /**
   * Convert one recoverable transport send failure into a deferred delivery.
   * @param {Object} options
   * @param {Error} options.error
   * @param {string} options.targetNodeId
   * @param {string} options.targetAddress
   * @param {string} options.messageId
   * @param {Object} options.payload
   * @param {string} options.correlationId
   * @return {Promise<Object|null>}
   * @private
   */
  async resolveRecoverableDeliveryError({
    error,
    targetNodeId,
    targetAddress,
    messageId,
    payload,
    correlationId,
  }) {
    if (!error || this.isShuttingDown) {
      return null;
    }

    const retryAfterMs = Number.isFinite(error?.retryAfterMs) ?
      Math.max(TRANSPORT_NUM.ZERO, Math.floor(error.retryAfterMs)) :
      this.resolveReconnectRetryAfterMs(
        this.nodeConnections.get(targetNodeId) || null,
      );

    if (error.code === ROUTER_CONNECTION_CLOSED_ERROR_CODE &&
        error.recoverableBeforeSend === true) {
      const reconnectInProgress = this.buildReconnectInProgressFailure(
        targetNodeId,
        messageId,
        correlationId,
      );
      if (reconnectInProgress) {
        return reconnectInProgress;
      }

      const reconnectAddress =
        this.resolveReconnectAddresses(targetNodeId)[TRANSPORT_NUM.ZERO] ||
        null;
      if (reconnectAddress) {
        try {
          return await this.tryDeliverAfterReconnect(
            reconnectAddress,
            targetAddress,
            messageId,
            payload,
            targetNodeId,
            correlationId,
          );
        } catch (reconnectError) {
          return this.buildDeferredDeliveryFailure(
            messageId,
            correlationId,
            reconnectError?.message ||
              ROUTER_ERROR_MSG.connectionClosed(targetNodeId),
            {
              errorCode:
                reconnectError?.code || ROUTER_CONNECTION_CLOSED_ERROR_CODE,
              retryAfterMs: Number.isFinite(reconnectError?.retryAfterMs) ?
                reconnectError.retryAfterMs :
                retryAfterMs,
            },
          );
        }
      }
    }

    if (error.code === ROUTER_CONNECTION_CLOSED_ERROR_CODE ||
        error.message === ROUTER_ERROR_MSG.connectionClosed(targetNodeId)) {
      return this.buildDeferredDeliveryFailure(
        messageId,
        correlationId,
        error.message,
        {
          errorCode: error.code || ROUTER_CONNECTION_CLOSED_ERROR_CODE,
          retryAfterMs,
        },
      );
    }

    return null;
  }

  /**
   * Build one suppression key for a reconnect address.
   * @param {string} targetNodeId
   * @param {string} address
   * @return {string|null}
   * @private
   */
  getReconnectAddressSuppressionKey(targetNodeId, address) {
    if (typeof targetNodeId !== TRANSPORT_TYPEOF.STRING ||
        targetNodeId.length === TRANSPORT_NUM.ZERO ||
        typeof address !== TRANSPORT_TYPEOF.STRING ||
        address.length === TRANSPORT_NUM.ZERO) {
      return null;
    }
    return `${targetNodeId}::${address}`;
  }

  /**
   * Remove expired reconnect-address suppressions.
   * @param {number} [nowMs]
   * @return {void}
   * @private
   */
  pruneReconnectAddressSuppressions(nowMs = Date.now()) {
    for (const [key, expiresAt] of this.suppressedReconnectAddresses.entries()) {
      if (!Number.isFinite(expiresAt) || expiresAt <= nowMs) {
        this.suppressedReconnectAddresses.delete(key);
      }
    }
  }

  /**
   * Return whether one reconnect address is temporarily suppressed.
   * @param {string} targetNodeId
   * @param {string} address
   * @return {boolean}
   * @private
   */
  isReconnectAddressSuppressed(targetNodeId, address) {
    const key = this.getReconnectAddressSuppressionKey(targetNodeId, address);
    if (!key) {
      return false;
    }
    this.pruneReconnectAddressSuppressions();
    const expiresAt = this.suppressedReconnectAddresses.get(key);
    return Number.isFinite(expiresAt) && expiresAt > Date.now();
  }

  /**
   * Temporarily suppress one reconnect address after a fatal DNS failure.
   * @param {string} targetNodeId
   * @param {string} address
   * @return {void}
   * @private
   */
  suppressReconnectAddress(targetNodeId, address) {
    const key = this.getReconnectAddressSuppressionKey(targetNodeId, address);
    if (!key) {
      return;
    }
    const suppressionMs =
      Number.isFinite(this.reconnectAddressSuppressionMs) &&
      this.reconnectAddressSuppressionMs > TRANSPORT_NUM.ZERO ?
        this.reconnectAddressSuppressionMs :
        TRANSPORT_NUM.ZERO;
    if (suppressionMs <= TRANSPORT_NUM.ZERO) {
      return;
    }
    this.suppressedReconnectAddresses.set(
      key,
      Date.now() + suppressionMs,
    );
  }

  /**
   * Clear suppression for one reconnect address after a successful dial.
   * @param {string} targetNodeId
   * @param {string} address
   * @return {void}
   * @private
   */
  clearReconnectAddressSuppression(targetNodeId, address) {
    const key = this.getReconnectAddressSuppressionKey(targetNodeId, address);
    if (!key) {
      return;
    }
    this.suppressedReconnectAddresses.delete(key);
  }

  /**
   * Return whether one reconnect error indicates a stale DNS-owned address.
   * @param {Error|null} error
   * @return {boolean}
   * @private
   */
  shouldSuppressReconnectAddress(error) {
    const errorMessage = error?.message || null;
    if (typeof errorMessage !== TRANSPORT_TYPEOF.STRING ||
        errorMessage.length === TRANSPORT_NUM.ZERO) {
      return false;
    }
    return errorMessage.includes('ENOTFOUND') ||
      errorMessage.includes('EAI_AGAIN');
  }

  /**
   * Resolve ordered reconnect addresses for one target node.
   * Prefer the last directly-observed transport address, then the originally
   * configured address, then the resolver-provided fallback.
   * @param {string} targetNodeId
   * @param {string|null} preferredAddress
   * @return {Array<string>}
   * @private
   */
  resolveReconnectAddresses(targetNodeId, preferredAddress = null) {
    const addresses = [];
    const pushUniqueAddress = (candidate) => {
      if (typeof candidate !== TRANSPORT_TYPEOF.STRING ||
          candidate.length === TRANSPORT_NUM.ZERO ||
          this.isReconnectAddressSuppressed(targetNodeId, candidate) ||
          addresses.includes(candidate)) {
        return;
      }
      addresses.push(candidate);
    };

    const existing = this.nodeConnections.get(targetNodeId) || null;
    const canonicalAddress = existing ?
      this.refreshReconnectAuthority(existing, preferredAddress) :
      this.resolveCanonicalReconnectAddress(targetNodeId, preferredAddress);
    pushUniqueAddress(normalizeToWebSocketAddress(preferredAddress) ||
      preferredAddress);
    pushUniqueAddress(normalizeToWebSocketAddress(
      existing?.observedAddress) || existing?.observedAddress);
    pushUniqueAddress(normalizeToWebSocketAddress(existing?.address) ||
      existing?.address);
    pushUniqueAddress(normalizeToWebSocketAddress(
      existing?.configuredAddress) || existing?.configuredAddress);
    pushUniqueAddress(canonicalAddress);
    return addresses;
  }

  /**
   * Ensure one reconnect owner record exists even when the first cold dial
   * fails before a durable socket was established.
   * @param {string} targetNodeId
   * @param {string|null} preferredAddress
   * @return {Object|null}
   * @private
   */
  ensureReconnectOwnerConnection(targetNodeId, preferredAddress = null) {
    const existing = this.nodeConnections.get(targetNodeId) || null;
    if (existing) {
      this.refreshReconnectAuthority(existing, preferredAddress);
      if (typeof preferredAddress === TRANSPORT_TYPEOF.STRING &&
          preferredAddress.length > TRANSPORT_NUM.ZERO) {
        if (typeof existing.configuredAddress !== TRANSPORT_TYPEOF.STRING ||
            existing.configuredAddress.length === TRANSPORT_NUM.ZERO) {
          existing.configuredAddress = preferredAddress;
        }
        if (typeof existing.address !== TRANSPORT_TYPEOF.STRING ||
            existing.address.length === TRANSPORT_NUM.ZERO) {
          existing.address = preferredAddress;
        }
      }
      return existing;
    }
    if (typeof preferredAddress !== TRANSPORT_TYPEOF.STRING ||
        preferredAddress.length === TRANSPORT_NUM.ZERO) {
      return null;
    }
    const canonicalPreferredAddress =
      this.resolveCanonicalReconnectAddress(targetNodeId, preferredAddress) ||
      preferredAddress;
    const connectionInfo = {
      connectionId: uuidv4(),
      nodeId: targetNodeId,
      address: canonicalPreferredAddress,
      configuredAddress: canonicalPreferredAddress,
      observedAddress: null,
      ws: null,
      state: ConnectionState.DISCONNECTED,
      reconnectAttempts: TRANSPORT_NUM.ZERO,
      reconnectTimeout: null,
      reconnectDueAt: null,
      pingInterval: null,
      isIncoming: false,
      isSelfConnection: false,
      ackTimeoutStreak: TRANSPORT_NUM.ZERO,
      lastAckAt: null,
      lastAckTimeoutAt: null,
      retired: false,
      createdAt: Date.now(),
    };
    this.nodeConnections.set(targetNodeId, connectionInfo);
    return connectionInfo;
  }

  /**
   * Arm one reconnect owner after a failed cold dial so subsequent deliveries
   * defer behind the same cooldown instead of redialing immediately.
   * @param {string} targetNodeId
   * @param {string|null} preferredAddress
   * @return {Object|null}
   * @private
   */
  armReconnectAfterConnectFailure(targetNodeId, preferredAddress = null) {
    const connection = this.ensureReconnectOwnerConnection(
      targetNodeId,
      preferredAddress,
    );
    if (!connection ||
        connection.isIncoming === true ||
        connection.isSelfConnection === true ||
        connection.state === ConnectionState.CONNECTED ||
        this.hasScheduledReconnect(connection)) {
      return connection;
    }
    if (typeof connection.address !== TRANSPORT_TYPEOF.STRING ||
        connection.address.length === TRANSPORT_NUM.ZERO) {
      return connection;
    }
    connection.state = ConnectionState.DISCONNECTED;
    this.scheduleReconnect(connection);
    return connection;
  }

  /**
   * Ensure a remote node connection exists for delivery recovery.
   * @param {string} targetNodeId
   * @param {string} address
   * @return {Promise<Object|null>}
   * @private
   */
  async ensureNodeConnection(targetNodeId, address) {
    const existing = this.nodeConnections.get(targetNodeId);
    if (existing && existing.state === ConnectionState.CONNECTED) {
      return existing;
    }
    if (this.hasScheduledReconnect(existing)) {
      return null;
    }

    if (this.pendingNodeConnections.has(targetNodeId)) {
      return this.pendingNodeConnections.get(targetNodeId);
    }

    const connectionPromise = (async () => {
      const reconnectAddresses =
        this.resolveReconnectAddresses(targetNodeId, address);
      let lastError = null;
      try {
        for (const reconnectAddress of reconnectAddresses) {
          try {
            await this.connectToNode(targetNodeId, reconnectAddress);
            this.clearReconnectAddressSuppression(
              targetNodeId,
              reconnectAddress,
            );
            lastError = null;
            break;
          } catch (error) {
            lastError = error;
            if (this.shouldSuppressReconnectAddress(error)) {
              this.suppressReconnectAddress(
                targetNodeId,
                reconnectAddress,
              );
            }
            this.logger.warn('Failed to reconnect target node before delivery', {
              targetNodeId,
              address: reconnectAddress,
              localNodeId: this.nodeId,
              error: error?.message || String(error),
            });
          }
        }
      } finally {
        this.pendingNodeConnections.delete(targetNodeId);
      }

      this.armReconnectAfterConnectFailure(
        targetNodeId,
        reconnectAddresses[reconnectAddresses.length - TRANSPORT_NUM.ONE] ||
          address,
      );
      const connection = this.nodeConnections.get(targetNodeId) || null;
      if (!connection || connection.state !== ConnectionState.CONNECTED) {
        if (lastError && reconnectAddresses.length === TRANSPORT_NUM.ZERO) {
          this.logger.warn('Failed to reconnect target node before delivery', {
            targetNodeId,
            address: null,
            localNodeId: this.nodeId,
            error: lastError?.message || String(lastError),
          });
        }
      }
      return connection && connection.state === ConnectionState.CONNECTED ?
        connection :
        null;
    })();
    this.pendingNodeConnections.set(targetNodeId, connectionPromise);
    return connectionPromise;
  }

  /**
   * Reconnect to one node and retry the send once.
   * @param {string} reconnectAddress
   * @param {string} targetAddress
   * @param {string} messageId
   * @param {Object} payload
   * @param {string} targetNodeId
   * @param {string} correlationId
   * @return {Promise<Object>}
   * @private
   */
  async tryDeliverAfterReconnect(
    reconnectAddress,
    targetAddress,
    messageId,
    payload,
    targetNodeId,
    correlationId,
  ) {
    const connection = await this.ensureNodeConnection(
      targetNodeId,
      reconnectAddress,
    );
    if (!connection || connection.state !== ConnectionState.CONNECTED) {
      const reconnectInProgress = this.buildReconnectInProgressFailure(
        targetNodeId,
        messageId,
        correlationId,
      );
      if (reconnectInProgress) {
        return reconnectInProgress;
      }
      this.logger.warn(ROUTER_LOG_MSG.NO_TARGET_CONNECTION, {
        messageId,
        targetAddress,
        targetNodeId,
        localNodeId: this.nodeId,
        connectionExists: !!connection,
        connectionState: connection?.state,
        availableConnections: Array.from(this.nodeConnections.keys()),
        reconnectAddress,
        recoveredViaResolver: true,
      });
      return this.buildDeferredDeliveryFailure(
        messageId,
        correlationId,
        ROUTER_ERROR_MSG.noConnectionToNode(targetNodeId),
        {
          errorCode: ROUTER_NO_CONNECTION_ERROR_CODE,
          retryAfterMs: this.reconnectIntervalMs,
        },
      );
    }

    return this.sendMessage(
      connection,
      targetAddress,
      messageId,
      payload,
      targetNodeId,
      correlationId,
    );
  }

  /**
   * Retire one superseded socket after a bounded grace window.
   * Keeps late ACK / SERVICE_RESPONSE frames from being cut off immediately
   * while still ensuring stale sockets cannot accumulate indefinitely.
   * @param {WebSocket|null} staleWs
   * @return {void}
   * @private
   */
  scheduleRetiredSocketTermination(staleWs) {
    if (!staleWs ||
        (typeof staleWs.terminate !== TRANSPORT_TYPEOF.FUNCTION &&
          typeof staleWs.close !== TRANSPORT_TYPEOF.FUNCTION)) {
      return;
    }
    const graceMs = Math.max(
      this.reconnectIntervalMs,
      this.messageTimeoutMs,
    );
    const timeout = setTimeout(() => {
      try {
        if (typeof staleWs.terminate === TRANSPORT_TYPEOF.FUNCTION) {
          staleWs.terminate();
        } else if (typeof staleWs.close === TRANSPORT_TYPEOF.FUNCTION) {
          staleWs.close();
        }
      } catch (_closeErr) {
        // Best-effort stale socket retirement after bounded grace.
      }
    }, graceMs);
    if (typeof timeout?.unref === TRANSPORT_TYPEOF.FUNCTION) {
      timeout.unref();
    }
  }

  /**
   * Quarantine one remote connection after an ACK timeout so recovery is
   * owned by a single reconnect state machine instead of cascading socket
   * resets across all callers.
   * @param {string} targetNodeId
   * @param {Object|null} connection
   * @param {string} messageId
   * @param {string} targetAddress
   * @return {Object|null}
   * @private
   */
  quarantineConnectionAfterAckTimeout(
    targetNodeId,
    connection,
    messageId,
    targetAddress,
  ) {
    if (!connection ||
        connection.isIncoming === true ||
        connection.isSelfConnection === true) {
      return;
    }

    const activeConnection = this.nodeConnections.get(targetNodeId);
    if (!activeConnection ||
        activeConnection.connectionId !== connection.connectionId ||
        activeConnection.state !== ConnectionState.CONNECTED) {
      return activeConnection || null;
    }

    activeConnection.ackTimeoutStreak =
      (activeConnection.ackTimeoutStreak || TRANSPORT_NUM.ZERO) +
      TRANSPORT_NUM.ONE;
    activeConnection.lastAckTimeoutAt = Date.now();
    if (activeConnection.ackTimeoutStreak <
      this.ackTimeoutQuarantineThreshold) {
      this.logger.debug('Observed ACK timeout below quarantine threshold', {
        messageId,
        targetAddress,
        targetNodeId,
        localNodeId: this.nodeId,
        connectionId: activeConnection.connectionId,
        ackTimeoutStreak: activeConnection.ackTimeoutStreak,
        ackTimeoutQuarantineThreshold: this.ackTimeoutQuarantineThreshold,
      });
      return activeConnection;
    }

    this.logger.warn('Quarantining target connection after ACK timeout', {
      messageId,
      targetAddress,
      targetNodeId,
      localNodeId: this.nodeId,
      connectionId: activeConnection.connectionId,
      ackTimeoutStreak: activeConnection.ackTimeoutStreak,
      ackTimeoutQuarantineThreshold: this.ackTimeoutQuarantineThreshold,
    });
    const staleWs = activeConnection.ws || null;
    const reconnectOwner = {
      connectionId: uuidv4(),
      nodeId: activeConnection.nodeId,
      nodeAddress: activeConnection.nodeAddress,
      address: activeConnection.address,
      configuredAddress:
        activeConnection.configuredAddress || activeConnection.address,
      observedAddress: activeConnection.observedAddress || null,
      ws: null,
      state: ConnectionState.DISCONNECTED,
      reconnectAttempts: activeConnection.reconnectAttempts,
      reconnectTimeout: null,
      reconnectDueAt: null,
      pingInterval: null,
      isIncoming: false,
      isSelfConnection: false,
      ackTimeoutStreak: TRANSPORT_NUM.ZERO,
      lastAckAt: activeConnection.lastAckAt || null,
      lastAckTimeoutAt: activeConnection.lastAckTimeoutAt || null,
      retired: false,
      createdAt: Date.now(),
    };

    this.retireConnection(activeConnection);
    activeConnection.state = ConnectionState.CLOSED;
    this.nodeConnections.set(targetNodeId, reconnectOwner);
    this.scheduleReconnect(reconnectOwner);
    this.scheduleRetiredSocketTermination(staleWs);
    return reconnectOwner;
  }

  /**
   * Build one failed-delivery result that asks upstream owners to defer
   * immediate retries instead of multiplying pressure on the same target.
   * @param {string} messageId
   * @param {string} correlationId
   * @param {string} error
   * @param {Object} options
   * @param {string|null} [options.errorCode]
   * @param {number} [options.retryAfterMs]
   * @return {Object}
   * @private
   */
  buildDeferredDeliveryFailure(
    messageId,
    correlationId,
    error,
    options = {},
  ) {
    const result = {
      messageId,
      correlationId,
      acknowledged: false,
      error,
      deferRetry: true,
      retryAfterMs: normalizeRetryAfterMs(
        options.retryAfterMs,
        this.reconnectIntervalMs,
      ),
    };
    if (typeof options.errorCode === TRANSPORT_TYPEOF.STRING &&
        options.errorCode.length > TRANSPORT_NUM.ZERO) {
      result.errorCode = options.errorCode;
    }
    return result;
  }

  /**
   * Send message through WebSocket connection.
   * @param {Object} connection - Connection info.
   * @param {string} targetAddress - Target address.
   * @param {string} messageId - Message ID.
   * @param {Object} payload - Message payload.
   * @return {Promise<Object>} Send result.
   * @private
   */
  sendMessage(connection, targetAddress, messageId, payload, targetNodeId, correlationId) {
    return new Promise((resolve, reject) => {
      const message = {
        type: RouterMessageType.SERVICE_MESSAGE,
        messageId,
        targetAddress,
        sourceAddress: ROUTER_ADDRESS.buildSourceAddress(this.nodeId),
        sourceNodeId: this.nodeId,
        payload,
        timestamp: Date.now(),
      };

      const failBeforeSend = () => {
        const activeConnection = this.nodeConnections.get(targetNodeId) || connection;
        const retryAfterMs = this.resolveReconnectRetryAfterMs(activeConnection);
        if (activeConnection &&
            activeConnection.isIncoming !== true &&
            activeConnection.isSelfConnection !== true) {
          const staleWs = activeConnection.ws;
          this.handleConnectionClose(
            targetNodeId,
            activeConnection.connectionId,
          );
          try {
            if (typeof staleWs?.terminate === TRANSPORT_TYPEOF.FUNCTION) {
              staleWs.terminate();
            } else if (typeof staleWs?.close === TRANSPORT_TYPEOF.FUNCTION) {
              staleWs.close();
            }
          } catch (_closeErr) {
            // Best-effort stale connection reset before recovery.
          }
        }
        reject(this.buildConnectionClosedError(targetNodeId, {
          beforeSend: true,
          retryAfterMs,
        }));
      };

      if (!connection?.ws || connection.ws.readyState !== WebSocket.OPEN) {
        failBeforeSend();
        return;
      }

      // Set up timeout
      const timeout = setTimeout(() => {
        this.pendingMessages.delete(messageId);
        const recoveryOwner = this.quarantineConnectionAfterAckTimeout(
          targetNodeId,
          connection,
          messageId,
          targetAddress,
        );
        resolve(this.buildDeferredDeliveryFailure(
          messageId,
          correlationId,
          TRANSPORT_ERROR_MSG.MESSAGE_TIMEOUT,
          {
            errorCode: ROUTER_MESSAGE_TIMEOUT_ERROR_CODE,
            retryAfterMs: this.resolveReconnectRetryAfterMs(
              recoveryOwner || connection,
            ),
          },
        ));
      }, this.messageTimeoutMs);

      // Track pending message
      this.pendingMessages.set(messageId, {
        messageId,
        resolve,
        reject,
        timeout,
        sentAt: Date.now(),
        targetNodeId,
      });

      try {
        connection.ws.send(JSON.stringify(message));
      } catch (_sendError) {
        clearTimeout(timeout);
        this.pendingMessages.delete(messageId);
        failBeforeSend();
      }
    });
  }

  /**
   * Send raw message through WebSocket.
   * @param {WebSocket} ws - WebSocket connection.
   * @param {Object} message - Message to send.
   * @private
   */
  sendRaw(ws, message) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Check if a service is registered.
   * @param {string} address - Service address.
   * @return {boolean} True if registered.
   */
  isRegistered(address) {
    return this.handlers.has(address);
  }

  /**
   * Get all registered service addresses.
   * @return {Array<string>} Service addresses.
   */
  getRegisteredAddresses() {
    return Array.from(this.handlers.keys());
  }

  /**
   * Get connection state for a node.
   * @param {string} nodeId - Node ID.
   * @return {string|null} Connection state.
   */
  getConnectionState(nodeId) {
    const connection = this.nodeConnections.get(nodeId);
    return connection ? connection.state : null;
  }

  /**
   * Ping a node to verify it responds within a timeout.
   * @param {string} nodeId - Node ID to ping.
   * @param {number} timeoutMs - Optional timeout override.
   * @return {Promise<boolean>} True if pong received before timeout.
   */
  async pingNode(nodeId, timeoutMs = null) {
    const connection = this.nodeConnections.get(nodeId);
    if (!connection || connection.state !== ConnectionState.CONNECTED || !connection.ws) {
      return false;
    }

    const pingId = uuidv4();
    const timeout = timeoutMs ?? this.pingTimeoutMs;

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingPings.delete(pingId);
        resolve(false);
      }, timeout);

      this.pendingPings.set(pingId, {resolve, timeout: timer});
      this.sendRaw(connection.ws, {
        type: RouterMessageType.PING,
        pingId,
        timestamp: Date.now(),
      });
    });
  }

  /**
   * Get all connected node IDs.
   * @return {Array<string>} Connected node IDs.
   */
  getConnectedNodes() {
    const connected = [];
    for (const [_nodeId, connection] of this.nodeConnections) {
      if (connection.state === ConnectionState.CONNECTED && connection.nodeId) {
        connected.push(connection.nodeId);
      }
    }
    return connected;
  }

  /**
   * Check if self-connection is established.
   * @return {boolean} True if self-connection exists and is connected.
   */
  hasSelfConnection() {
    const connection = this.nodeConnections.get(this.nodeId);
    return connection &&
           connection.isSelfConnection &&
           connection.state === ConnectionState.CONNECTED;
  }

  /**
   * Get router statistics.
   * @return {Object} Router stats.
   */
  getStats() {
    const connectionStats = {};
    for (const [nodeId, connection] of this.nodeConnections) {
      connectionStats[nodeId] = {
        state: connection.state,
        isIncoming: connection.isIncoming,
        reconnectAttempts: connection.reconnectAttempts,
        ackTimeoutStreak: connection.ackTimeoutStreak || TRANSPORT_NUM.ZERO,
      };
    }

    const outboundQueueStats = {};
    for (const [nodeId, queue] of this.outboundQueues) {
      outboundQueueStats[nodeId] = {
        inFlight: queue.inFlight,
        pending: queue.pending.length,
        pendingCritical: countPendingByPriority(
          queue,
          OutboundDeliveryPriority.CRITICAL,
        ),
        pendingBackground: countPendingByPriority(
          queue,
          OutboundDeliveryPriority.BACKGROUND,
        ),
        criticalReserve: queue.criticalReserve,
        backgroundPendingLimit: resolveBackgroundPendingLimit(queue),
        maxConcurrent: queue.maxConcurrent,
        maxPending: queue.maxPending,
        queueWait: buildQueueWaitSummary(queue),
      };
    }

    return {
      routerId: this.routerId,
      nodeId: this.nodeId,
      nodeAddress: this.nodeAddress,
      advertisedAddress: this.advertisedAddress,
      initialized: this.initialized,
      messageCount: this.messageCount,
      pendingMessages: this.pendingMessages.size,
      pendingResponses: this.pendingResponses.size,
      handlers: this.handlers.size,
      connections: connectionStats,
      connectedNodes: this.getConnectedNodes().length,
      outboundQueues: outboundQueueStats,
    };
  }

  /**
   * Summarize current outbound queue pressure across all peer queues.
   * @return {Object} Pressure summary.
   */
  getOutboundPressureSummary() {
    let saturatedNodeCount = TRANSPORT_NUM.ZERO;
    let totalPending = TRANSPORT_NUM.ZERO;
    let maxPendingUtilization = TRANSPORT_NUM.ZERO;

    for (const queue of this.outboundQueues.values()) {
      const pending = queue.pending.length;
      const pendingBackground = countPendingByPriority(
        queue,
        OutboundDeliveryPriority.BACKGROUND,
      );
      const backgroundPendingLimit = resolveBackgroundPendingLimit(queue);
      const backpressured =
        pending >= queue.maxPending ||
        (pending > TRANSPORT_NUM.ZERO &&
          pendingBackground >= backgroundPendingLimit);
      if (backpressured) {
        saturatedNodeCount += TRANSPORT_NUM.ONE;
      }
      totalPending += pending;
      if (queue.maxPending > TRANSPORT_NUM.ZERO) {
        maxPendingUtilization = Math.max(
          maxPendingUtilization,
          pending / queue.maxPending,
        );
      }
    }

    return Object.freeze({
      backpressured: saturatedNodeCount > TRANSPORT_NUM.ZERO,
      saturatedNodeCount,
      totalPending,
      maxPendingUtilization,
    });
  }

  /**
   * Shutdown the message router.
   * @return {Promise<void>}
   */
  async shutdown() {
    this.logger.debug(ROUTER_LOG_MSG.SHUTTING_DOWN, {
      routerId: this.routerId,
    });
    this.isShuttingDown = true;

    // Clear pending messages first to avoid timeout callbacks
    for (const [, pending] of this.pendingMessages) {
      clearTimeout(pending.timeout);
      pending.resolve({
        messageId: pending.messageId,
        acknowledged: false,
        error: ROUTER_ERROR_MSG.SHUTDOWN,
        shutdown: true,
      });
    }
    this.pendingMessages.clear();

    const shutdownError = new Error(ROUTER_ERROR_MSG.SHUTDOWN);
    for (const [, pending] of this.pendingResponses) {
      clearTimeout(pending.timeoutId);
      pending.reject(shutdownError);
    }
    this.pendingResponses.clear();

    for (const [, pending] of this.pendingPings) {
      clearTimeout(pending.timeout);
      pending.resolve(false);
    }
    this.pendingPings.clear();

    for (const [nodeId] of this.outboundQueues) {
      this.failOutboundQueueGracefully(nodeId, shutdownError);
    }
    this.outboundQueues.clear();

    // Close all connections and wait for them to close
    const closePromises = [];
    for (const [, connection] of this.nodeConnections) {
      if (connection.pingInterval) {
        clearInterval(connection.pingInterval);
        connection.pingInterval = null;
      }
      if (connection.reconnectTimeout) {
        clearTimeout(connection.reconnectTimeout);
        connection.reconnectTimeout = null;
      }
      if (connection.ws) {
        const ws = connection.ws;
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          closePromises.push(new Promise((resolve) => {
            ws.once(TRANSPORT_EVENT.CLOSE, resolve);
            ws.terminate(); // Force close instead of graceful close
          }));
        }
      }
    }

    // Wait for all connections to close (with timeout that gets cleared)
    if (closePromises.length > TRANSPORT_NUM.ZERO) {
      let timeoutId;
      await Promise.race([
        Promise.all(closePromises),
        new Promise((resolve) => {
          timeoutId = setTimeout(resolve, TRANSPORT_DEFAULT.SHUTDOWN_WAIT_MS);
        }),
      ]).finally(() => {
        clearTimeout(timeoutId);
      });
    }

    // Close server and all its client connections
    if (this.server) {
      // In-process server: just terminate tracked clients and unregister.
      if (this.inProcessTransport) {
        for (const client of this.server.clients || []) {
          client.terminate();
        }
        await new Promise((resolve) => this.server.close(resolve));
        this.server = null;
        this.inProcessTransport = false;
      } else {
        const wsServer = this.server;
        const httpServer = wsServer._server || null;

        // Terminate all clients connected to the server
        for (const client of wsServer.clients) {
          client.terminate();
        }

        await new Promise((resolve) => {
          wsServer.close(() => resolve());
        });

        if (httpServer) {
          if (typeof httpServer.closeAllConnections === TRANSPORT_TYPEOF.FUNCTION) {
            httpServer.closeAllConnections();
          }
          await new Promise((resolve) => {
            httpServer.close(() => resolve());
          });
          if (typeof httpServer.unref === TRANSPORT_TYPEOF.FUNCTION) {
            httpServer.unref();
          }
        }

        this.server = null;
      }
    }

    this.nodeConnections.clear();
    this.handlers.clear();
    this.initialized = false;

    this.emit(TRANSPORT_EVENT.SHUTDOWN, {routerId: this.routerId});
  }
}

export {
  MessageRouter,
  ConnectionState,
  RouterMessageType,
};
