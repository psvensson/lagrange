/**
 * Owner contract:
 * Owner: MessageRouter owns transport connection, queue, ACK, and reconnect behavior.
 * Inputs: normalized router messages, delivery sources, WebSocket state, node routing.
 * Canonical output: delivery outcomes, queue stats, connection state, transport events.
 * Prohibited fallbacks: no ad hoc ACK, reconnect, or backpressure classification.
 * Primary tests: test/transport/message-router.test.js.
 */
import {MESSAGE_ROUTER_SHARED} from './message-router-shared.js';
import {createMessageRouterConnectionLifecycleMethods} from './message-router-connection-lifecycle-methods.js';
import {MESSAGE_ROUTER_DELIVERY_PRESSURE_ROUTING_METHODS} from './message-router-delivery-pressure-routing.js';
import {OwnerRetryBudget} from './owner-retry-budget.js';
import {defineMessageRouterAdmissionControls} from './message-router-admission-controls.js';
import {defineMessageRouterServerLifecycle} from './message-router-server-lifecycle.js';
import {defineMessageRouterInboundDispatch} from './message-router-inbound-dispatch.js';
import {defineMessageRouterPendingResponseLedger} from './message-router-pending-response-ledger.js';
import {defineMessageRouterConnectionCloseReconnect} from './message-router-connection-close-reconnect.js';
import {defineMessageRouterHandlerRegistry} from './message-router-handler-registry.js';
import {defineMessageRouterDeliveryDelegation} from './message-router-delivery-delegation.js';
import {defineMessageRouterStatsShutdown} from './message-router-stats-shutdown.js';

const {
  ConfigurationManager,
  ConnectionState,
  EventEmitter,
  LoggingService,
  MESSAGE_ROUTER_LITERAL,
  OutboundDeliveryRegistryOwner,
  RECONNECT_ADDRESS_SUPPRESSION_DEFAULT_MS,
  RouterConnectionAuthorityOwner,
  RouterMessageType,
  TRANSPORT_CONFIG_KEY,
  TRANSPORT_DEFAULT,
  TRANSPORT_FORMAT,
  TRANSPORT_NUM,
  TRANSPORT_SUBSYSTEM,
  TRANSPORT_TYPEOF,
  UNMATCHED_SERVICE_RESPONSE_WARN_INTERVAL_MS,
  WEBSOCKET_CONNECT_TIMEOUT_CONFIG_KEY,
  normalizeToWebSocketAddress,
  uuidv4,
} = MESSAGE_ROUTER_SHARED;

class MessageRouter extends EventEmitter {
  constructor(options = {}) {
    super();
    const nodeWsPort = options.wsPort || TRANSPORT_DEFAULT.WS_PORT;
    this.nodeId = options.nodeId || uuidv4();
    this.nodeAddress =
      options.nodeAddress ||
      TRANSPORT_FORMAT.buildDefaultNodeAddress(nodeWsPort);
    this.advertisedAddress =
      options.advertisedAddress ||
      normalizeToWebSocketAddress(this.nodeAddress) ||
      this.nodeAddress;
    this.wsPort = options.wsPort || null;
    this.routerId = uuidv4();
    this.identifyPayload = options.identifyPayload || null;
    this.handlers = /* @__PURE__ */ new Map();
    this.inProcess = options.inProcess === true;
    this.nodeConnections = /* @__PURE__ */ new Map();
    this.pendingMessages = /* @__PURE__ */ new Map();
    this.pendingResponses = /* @__PURE__ */ new Map();
    this.retiredPendingResponses = /* @__PURE__ */ new Map();
    this.pendingPings = /* @__PURE__ */ new Map();
    const config = ConfigurationManager.getInstance();
    const configuredWsHost = config.get(TRANSPORT_CONFIG_KEY.WS_HOST);
    this.wsHost =
      options.wsHost ||
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
    this.ackTimeoutQuarantineLivenessWindowMs =
      Number.isFinite(options.ackTimeoutQuarantineLivenessWindowMs) &&
      options.ackTimeoutQuarantineLivenessWindowMs >= TRANSPORT_NUM.ZERO ?
        Math.floor(options.ackTimeoutQuarantineLivenessWindowMs) :
        Number.isFinite(
          config.get(
            TRANSPORT_CONFIG_KEY.ACK_TIMEOUT_QUARANTINE_LIVENESS_WINDOW_MS,
          ),
        ) &&
            config.get(
              TRANSPORT_CONFIG_KEY.ACK_TIMEOUT_QUARANTINE_LIVENESS_WINDOW_MS,
            ) >= TRANSPORT_NUM.ZERO ?
          Math.floor(
            config.get(
              TRANSPORT_CONFIG_KEY.ACK_TIMEOUT_QUARANTINE_LIVENESS_WINDOW_MS,
            ),
          ) :
          TRANSPORT_DEFAULT.ACK_TIMEOUT_QUARANTINE_LIVENESS_WINDOW_MS;
    // Per-node timestamp of the most recent inbound traffic (any parsed
    // message on any socket from that node). Liveness evidence for the
    // quarantine guard: a peer we are actively receiving from is slow, not
    // dead, and its connection must not be severed on ACK timeouts.
    this.nodeInboundActivityAt = new Map();
    const configuredConnectTimeoutMs = config.get(
      WEBSOCKET_CONNECT_TIMEOUT_CONFIG_KEY,
    );
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
    this.pingMaxMissed =
      config.get(TRANSPORT_CONFIG_KEY.PING_MAX_MISSED) ||
      TRANSPORT_DEFAULT.PING_MAX_MISSED;
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
        Math.min(Math.floor(configuredCriticalReserve), maxCriticalReserve) :
        Math.min(
          TRANSPORT_DEFAULT.OUTBOUND_QUEUE_CRITICAL_RESERVE,
          maxCriticalReserve,
        );
    const configuredReadinessReserve =
      Number.isFinite(options.outboundQueueReadinessReserve) &&
      options.outboundQueueReadinessReserve >= TRANSPORT_NUM.ZERO ?
        options.outboundQueueReadinessReserve :
        config.get(TRANSPORT_CONFIG_KEY.OUTBOUND_QUEUE_READINESS_RESERVE);
    const maxReadinessReserve = Math.max(
      TRANSPORT_NUM.ZERO,
      this.outboundQueueMaxPending - TRANSPORT_NUM.ONE,
    );
    this.outboundQueueReadinessReserve =
      Number.isFinite(configuredReadinessReserve) &&
      configuredReadinessReserve >= TRANSPORT_NUM.ZERO ?
        Math.min(Math.floor(configuredReadinessReserve), maxReadinessReserve) :
        Math.min(
          TRANSPORT_DEFAULT.OUTBOUND_QUEUE_READINESS_RESERVE,
          maxReadinessReserve,
        );
    const configuredReadinessInflightReserve =
      Number.isFinite(options.outboundQueueReadinessInflightReserve) &&
      options.outboundQueueReadinessInflightReserve >= TRANSPORT_NUM.ZERO ?
        options.outboundQueueReadinessInflightReserve :
        config.get(
          TRANSPORT_CONFIG_KEY.OUTBOUND_QUEUE_READINESS_INFLIGHT_RESERVE,
        );
    const maxReadinessInflightReserve = Math.max(
      TRANSPORT_NUM.ZERO,
      this.outboundQueueMaxConcurrent,
    );
    this.outboundQueueReadinessInflightReserve =
      Number.isFinite(configuredReadinessInflightReserve) &&
      configuredReadinessInflightReserve >= TRANSPORT_NUM.ZERO ?
        Math.min(
          Math.floor(configuredReadinessInflightReserve),
          maxReadinessInflightReserve,
        ) :
        Math.min(
          TRANSPORT_DEFAULT.OUTBOUND_QUEUE_READINESS_INFLIGHT_RESERVE,
          maxReadinessInflightReserve,
        );
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(TRANSPORT_SUBSYSTEM.ROUTER) :
      console;
    this.nowFn =
      typeof options.nowFn === MESSAGE_ROUTER_LITERAL.STRING_FUNCTION ?
        options.nowFn :
        Date.now;
    this.unmatchedServiceResponseWarnIntervalMs =
      Number.isFinite(options.unmatchedServiceResponseWarnIntervalMs) &&
      options.unmatchedServiceResponseWarnIntervalMs >= TRANSPORT_NUM.ZERO ?
        Math.floor(options.unmatchedServiceResponseWarnIntervalMs) :
        UNMATCHED_SERVICE_RESPONSE_WARN_INTERVAL_MS;
    this.lastUnmatchedServiceResponseWarnAtMs = null;
    this.unmatchedServiceResponseWarnSuppressedCount = TRANSPORT_NUM.ZERO;
    this.serviceResponseDispositionCounts = /* @__PURE__ */ new Map();
    this.initialized = false;
    this.server = null;
    this.messageCount = TRANSPORT_NUM.ZERO;
    this.isShuttingDown = false;
    this.inProcessTransport = false;
    this.externalAdmissionEnabled = options.externalAdmissionEnabled !== false;
    this.outboundQueues = /* @__PURE__ */ new Map();
    this.deliverMetricSampleByTarget = /* @__PURE__ */ new Map();
    this.deliverMetricFaultSampleByTarget = /* @__PURE__ */ new Map();
    this.deliverMetricQueueDepthByTarget = /* @__PURE__ */ new Map();
    this.resolveServiceNode = options.resolveServiceNode || null;
    this.resolveNodeAddress = options.resolveNodeAddress || null;
    this.resolveQueryMessageGroupService =
      options.resolveQueryMessageGroupService || null;
    this.pendingNodeConnections = /* @__PURE__ */ new Map();
    // Bounds the rate of delivery-triggered reconnect attempts toward a single
    // target so a briefly-disconnected/saturated node is not hammered into a
    // reconnect storm. Engages by default via OwnerRetryBudget's per-target token
    // bucket; the independent scheduleReconnect timer still reconnects a genuinely
    // down node even when the delivery-triggered budget is exhausted.
    this.ownerRetryBudget =
      options.ownerRetryBudget || new OwnerRetryBudget();
    this.transportPressureMetrics = {
      reconnectBeforeDeliveryFailureCount: TRANSPORT_NUM.ZERO,
      maxObservedPendingNodeConnectionCount: TRANSPORT_NUM.ZERO,
    };
    this.reconnectAddressSuppressionMs =
      Number.isFinite(options.reconnectAddressSuppressionMs) &&
      options.reconnectAddressSuppressionMs > TRANSPORT_NUM.ZERO ?
        Math.floor(options.reconnectAddressSuppressionMs) :
        RECONNECT_ADDRESS_SUPPRESSION_DEFAULT_MS;
    this.suppressedReconnectAddresses = /* @__PURE__ */ new Map();
    this.connectionAuthorityOwner = new RouterConnectionAuthorityOwner(this);
    this.outboundDeliveryRegistryOwner = new OutboundDeliveryRegistryOwner(
      this,
    );
  }
}

// Compose the router behavior from semantic method-group modules. Each group
// attaches to the same prototype so cross-group `this.x()` calls resolve.
Object.defineProperties(
  MessageRouter.prototype,
  createMessageRouterConnectionLifecycleMethods(),
);
Object.defineProperties(
  MessageRouter.prototype,
  Object.fromEntries(
    Object.entries(MESSAGE_ROUTER_DELIVERY_PRESSURE_ROUTING_METHODS).map(
      ([name, value]) => [
        name,
        {
          value,
          configurable: true,
          writable: true,
        },
      ],
    ),
  ),
);
defineMessageRouterAdmissionControls(MessageRouter);
defineMessageRouterServerLifecycle(MessageRouter);
defineMessageRouterInboundDispatch(MessageRouter);
defineMessageRouterPendingResponseLedger(MessageRouter);
defineMessageRouterConnectionCloseReconnect(MessageRouter);
defineMessageRouterHandlerRegistry(MessageRouter);
defineMessageRouterDeliveryDelegation(MessageRouter);
defineMessageRouterStatsShutdown(MessageRouter);

export {
  ConnectionState,
  MessageRouter,
  RouterMessageType,
};
