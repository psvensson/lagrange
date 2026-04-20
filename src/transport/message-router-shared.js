import { EventEmitter } from "events";
import { URL } from "url";
import { v4 as uuidv4 } from "uuid";
import WebSocket, { WebSocketServer } from "ws";
import { ConfigurationManager } from "../config/configuration-manager.js";
import { LoggingService } from "../logging/logging-service.js";
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
} from "../constants/transport.js";
import { HOST, METRICS_LOG_TAG } from "../constants/index.js";
import { isRaftPacket } from "../raft/raft-packet-utils.js";
import {
  ROUTER_QUERY_TRANSPORT_NOT_READY_ERROR_CODE,
  TRANSPORT_DELIVERY_OUTCOME_METADATA_FIELDS,
  buildTransportDeliveryOutcome,
  buildQueryTransportSemanticOutcome,
} from "./transport-semantic-outcome.js";
const MESSAGE_ROUTER_LITERAL = Object.freeze({
  STRING_UNKNOWN: "unknown",
  STRING_SELECT: "select",
  STRING_INSERT: "insert",
  STRING_UPDATE: "update",
  STRING_DELETE: "delete",
  STRING_RAFT_APPEND_UNKNOWN: "raft:append:unknown",
  STRING_CDC: "cdc",
  STRING_CDC_BATCH: "cdc_batch",
  STRING_RAFT_APPEND_CDC_BATCH_UNKNOWN: "raft:append:cdc_batch:unknown",
  STRING_MESSAGE: "message",
  STRING_NODE_STATE_UPDATE: "node_state_update",
  STRING_ACK: "ack",
  STRING_RAFT_APPEND_ACK: "raft:append:ack",
  STRING_APPEND: "append",
  STRING_APPEND_FAIL: "append fail",
  STRING_RAFT_APPEND_HEARTBEAT: "raft:append:heartbeat",
  STRING_RAFT_APPEND_FAIL: "raft:append:fail",
  STRING_LATE_AFTER_TIMEOUT: "late_after_timeout",
  STRING_LATE_AFTER_NODE_FAILURE: "late_after_node_failure",
  STRING_LATE_AFTER_DEFERRED_DELIVERY: "late_after_deferred_delivery",
  STRING_LATE_AFTER_ACK_REJECTED: "late_after_ack_rejected",
  STRING_LATE_AFTER_INLINE_ACK: "late_after_inline_ack",
  STRING_LATE_AFTER_CANCELLED: "late_after_cancelled",
  STRING_LATE_AFTER_RETIRED_WAITER: "late_after_retired_waiter",
  STRING_RESULT: "result",
  STRING_QUEUEWAITMS: "queueWaitMs",
  STRING_FUNCTION: "function",
  STRING_INVALID_WSPORT_FOR_IN_PROCESS_SERVER:
    "Invalid wsPort for in-process server",
  STRING_EADDRINUSE: "EADDRINUSE",
  STRING_VALUE: ":",
  STRING_WEBSOCKET_CONNECTION_CLOSED_BEFORE_OPEN_FOR_NODE:
    "WebSocket connection closed before open for node ",
  STRING_ECONNREFUSED: "ECONNREFUSED",
  STRING_REJECTING_INCOMING_CONNECTION_WHILE_EXTERNAL_ADMISSION_IS_CLOSED:
    "Rejecting incoming connection while external admission is closed",
  STRING_EXISTING_CONNECTION_PREFERRED: "existing_connection_preferred",
  STRING_ORPHANED: "orphaned",
  STRING_RESPONSETYPE: "responseType",
  STRING_IGNORING_STALE_CONNECTION_CLOSE_EVENT:
    "Ignoring stale connection close event",
  STRING_ROUTER_QUERY_TRANSPORT_NOT_READY: "ROUTER_QUERY_TRANSPORT_NOT_READY",
  STRING_OUTBOUND_QUEUE_SATURATED_FOR_NODE_DELIVERY:
    "Outbound queue saturated for node delivery",
  STRING_FAILED_TO_RESOLVE_NODE_CONNECTION_ADDRESS_FOR_DELIVERY_RECOVERY:
    "Failed to resolve node connection address for delivery recovery",
  STRING_ENOTFOUND: "ENOTFOUND",
  STRING_EAI_AGAIN: "EAI_AGAIN",
  STRING_OBSERVED_ACK_TIMEOUT_BELOW_QUARANTINE_THRESHOLD:
    "Observed ACK timeout below quarantine threshold",
  STRING_QUARANTINING_TARGET_CONNECTION_AFTER_ACK_TIMEOUT:
    "Quarantining target connection after ACK timeout",
  NUMBER_5: 5,
});
const queueMicrotaskFn = globalThis.queueMicrotask;
const ConnectionState = CONNECTION_STATE;
const RouterMessageType = ROUTER_MESSAGE_TYPE;
const IPV6_ANY_HOST = "::";
const IPV6_HOST_PREFIX = "[";
const IPV6_HOST_SUFFIX = "]";
const WEBSOCKET_CONNECT_TIMEOUT_CONFIG_KEY = "timeout.websocketConnectMs";
const WEBSOCKET_CONNECT_TIMEOUT_ERROR_CODE = "WS_CONNECT_TIMEOUT";
const RECONNECT_ADDRESS_SUPPRESSION_DEFAULT_MS = 5e3;
const UNMATCHED_SERVICE_RESPONSE_WARN_INTERVAL_MS = 3e4;
const RETIRED_PENDING_RESPONSE_REASON = Object.freeze({
  TIMEOUT: "timeout",
  CANCELLED: "cancelled",
  NODE_FAILURE: "node_failure",
  DEFERRED_DELIVERY: "deferred_delivery",
  ACK_REJECTED: "ack_rejected",
  INLINE_ACK: "inline_ack_payload",
  UNKNOWN: "unknown",
});
const SERVICE_RESPONSE_DISPOSITION_KIND = Object.freeze({
  SETTLED: "settled",
  ABSORBED: "absorbed_late",
  ORPHANED: "orphaned",
});
const ROUTER_NO_CONNECTION_ERROR_CODE = "ROUTER_NO_CONNECTION";
const ROUTER_CONNECTION_CLOSED_ERROR_CODE = "ROUTER_CONNECTION_CLOSED";
const ROUTER_MESSAGE_TIMEOUT_ERROR_CODE = "ROUTER_MESSAGE_TIMEOUT";
const QUEUE_WAIT_BUCKETS = Object.freeze([
  {
    upperBoundMs: 1,
    label: "le_1ms",
  },
  {
    upperBoundMs: 5,
    label: "le_5ms",
  },
  {
    upperBoundMs: 10,
    label: "le_10ms",
  },
  {
    upperBoundMs: 25,
    label: "le_25ms",
  },
  {
    upperBoundMs: 50,
    label: "le_50ms",
  },
  {
    upperBoundMs: 100,
    label: "le_100ms",
  },
  {
    upperBoundMs: 500,
    label: "le_500ms",
  },
  {
    upperBoundMs: 1e3,
    label: "le_1000ms",
  },
]);
const QUEUE_WAIT_BUCKET_OVERFLOW = "gt_1000ms";
const QUERY_DATA_PLANE_MESSAGE_TYPE = "QUERY";
const OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE =
  "ROUTER_OUTBOUND_QUEUE_BACKPRESSURED";
const OUTBOUND_QUEUE_PENDING_SOURCE_LIMIT_DIVISOR = TRANSPORT_NUM.FOUR;
const OUTBOUND_QUEUE_PENDING_SOURCE_LIMIT_MINIMUM = TRANSPORT_NUM.FOUR;
const OUTBOUND_QUEUE_BACKPRESSURE_SCOPE = Object.freeze({
  NODE: "node",
  DELIVERY_SOURCE: "delivery_source",
});
const OutboundDeliveryPriority = OUTBOUND_DELIVERY_PRIORITY;
const CONNECTION_CLOSE_DISPOSITION = Object.freeze({
  SHUTDOWN: "shutdown",
  RETIRED: "retired",
  SELF_DISCONNECT: "self_disconnect",
  RECONNECT: "reconnect",
  NO_ACTION: "no_action",
});
const RECONNECT_DISPOSITION = Object.freeze({
  RETIRE: "retire",
  PENDING: "pending",
  MAX_ATTEMPTS_REACHED: "max_attempts_reached",
  SCHEDULE: "schedule",
});
const TRANSPORT_PRESSURE_SUMMARY_FIELD = Object.freeze({
  MAX_OBSERVED_PENDING_NODE_CONNECTION_COUNT:
    "maxObservedPendingNodeConnectionCount",
  PENDING_NODE_CONNECTION_COUNT: "pendingNodeConnectionCount",
  RECONNECT_BEFORE_DELIVERY_FAILURE_COUNT:
    "reconnectBeforeDeliveryFailureCount",
});
const QUERY_TRANSPORT_SELECTION = Object.freeze({
  UNAVAILABLE: "unavailable",
  DIRECT_SERVICE: "direct_service",
  SELECTION_SERVICE: "selection_service",
});
const QUERY_TRANSPORT_DELIVERY_STATE = Object.freeze({
  SUCCESS: "success",
  DEFER_RETRY: "defer_retry",
  HARD_FAILURE: "hard_failure",
});
const INLINE_ACK_RESULT_FIELD = Object.freeze({
  ACKNOWLEDGED: "acknowledged",
  CORRELATION_ID: "correlationId",
  MESSAGE_ID: "messageId",
});
const INLINE_ACK_PASSTHROUGH_KEYS = /* @__PURE__ */ new Set([
  INLINE_ACK_RESULT_FIELD.MESSAGE_ID,
  INLINE_ACK_RESULT_FIELD.ACKNOWLEDGED,
  INLINE_ACK_RESULT_FIELD.CORRELATION_ID,
  ...TRANSPORT_DELIVERY_OUTCOME_METADATA_FIELDS,
]);
const EMPTY_ROUTER_REASON = "";
const INPROC = (globalThis.__DDB_INPROC_MESSAGE_ROUTER__ ||= {
  serversByPort: /* @__PURE__ */ new Map(),
  // port -> {router, nodeId}
});
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
  return {
    a,
    b,
  };
}
function normalizeIdentifier(value) {
  if (value === null || value === void 0) {
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
  const normalized = Number.isFinite(durationMs)
    ? Math.max(TRANSPORT_NUM.ZERO, Math.floor(durationMs))
    : TRANSPORT_NUM.ZERO;
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
  const normalized = Number.isFinite(durationMs)
    ? Math.max(TRANSPORT_NUM.ZERO, Math.floor(durationMs))
    : TRANSPORT_NUM.ZERO;
  queue.queueWaitSampleCount =
    (queue.queueWaitSampleCount || TRANSPORT_NUM.ZERO) + TRANSPORT_NUM.ONE;
  queue.queueWaitTotalMs =
    (queue.queueWaitTotalMs || TRANSPORT_NUM.ZERO) + normalized;
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
    avgMs:
      sampleCount > TRANSPORT_NUM.ZERO
        ? Math.round(totalMs / sampleCount)
        : TRANSPORT_NUM.ZERO,
    maxMs: queue?.queueWaitMaxMs || TRANSPORT_NUM.ZERO,
    histogram: {
      ...(queue?.queueWaitHistogram || createQueueWaitHistogram()),
    },
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
    return MESSAGE_ROUTER_LITERAL.STRING_UNKNOWN;
  }
  const normalized = sql.trim().toLowerCase();
  if (normalized.startsWith(MESSAGE_ROUTER_LITERAL.STRING_SELECT)) {
    return MESSAGE_ROUTER_LITERAL.STRING_SELECT;
  }
  if (normalized.startsWith(MESSAGE_ROUTER_LITERAL.STRING_INSERT)) {
    return MESSAGE_ROUTER_LITERAL.STRING_INSERT;
  }
  if (normalized.startsWith(MESSAGE_ROUTER_LITERAL.STRING_UPDATE)) {
    return MESSAGE_ROUTER_LITERAL.STRING_UPDATE;
  }
  if (normalized.startsWith(MESSAGE_ROUTER_LITERAL.STRING_DELETE)) {
    return MESSAGE_ROUTER_LITERAL.STRING_DELETE;
  }
  return MESSAGE_ROUTER_LITERAL.STRING_UNKNOWN;
}
function extractSqlTableName(sql) {
  if (
    typeof sql !== TRANSPORT_TYPEOF.STRING ||
    sql.trim().length === TRANSPORT_NUM.ZERO
  ) {
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
    if (match?.[TRANSPORT_NUM.ONE]) {
      return match[TRANSPORT_NUM.ONE].toLowerCase();
    }
  }
  return null;
}
function summarizeRaftAppendCommand(command) {
  const commandType = normalizeIdentifier(command?.type)?.toLowerCase();
  if (!commandType) {
    return MESSAGE_ROUTER_LITERAL.STRING_RAFT_APPEND_UNKNOWN;
  }
  if (commandType === MESSAGE_ROUTER_LITERAL.STRING_CDC) {
    const tableName = normalizeIdentifier(command?.tableName)?.toLowerCase();
    return `raft:append:cdc:${tableName || MESSAGE_ROUTER_LITERAL.STRING_UNKNOWN}`;
  }
  if (commandType === MESSAGE_ROUTER_LITERAL.STRING_CDC_BATCH) {
    const events = Array.isArray(command?.events) ? command.events : [];
    const eventCount = events.length;
    const distinctTableNames = [
      ...new Set(
        events
          .map((event) => normalizeIdentifier(event?.tableName)?.toLowerCase())
          .filter(Boolean),
      ),
    ];
    if (distinctTableNames.length === TRANSPORT_NUM.ONE) {
      return `raft:append:cdc_batch:${distinctTableNames[TRANSPORT_NUM.ZERO]}:${eventCount}`;
    }
    if (distinctTableNames.length > TRANSPORT_NUM.ONE) {
      return `raft:append:cdc_batch:mixed:${eventCount}`;
    }
    return MESSAGE_ROUTER_LITERAL.STRING_RAFT_APPEND_CDC_BATCH_UNKNOWN;
  }
  if (commandType === MESSAGE_ROUTER_LITERAL.STRING_MESSAGE) {
    const payloadType = normalizeIdentifier(
      command?.message?.payload?.type,
    )?.toLowerCase();
    return `raft:append:message:${payloadType || MESSAGE_ROUTER_LITERAL.STRING_UNKNOWN}`;
  }
  if (commandType === MESSAGE_ROUTER_LITERAL.STRING_ACK) {
    return MESSAGE_ROUTER_LITERAL.STRING_RAFT_APPEND_ACK;
  }
  return `raft:append:${commandType}`;
}
function isSupersedableRaftHeartbeatAppend(message) {
  const messageType = normalizeIdentifier(message?.type)?.toLowerCase();
  if (messageType !== MESSAGE_ROUTER_LITERAL.STRING_APPEND) {
    return false;
  }
  return (
    !Array.isArray(message?.data) || message.data.length === TRANSPORT_NUM.ZERO
  );
}
function isSupersedableRaftAppendFail(message) {
  const messageType = normalizeIdentifier(message?.type)?.toLowerCase();
  return messageType === MESSAGE_ROUTER_LITERAL.STRING_APPEND_FAIL;
}
function isSupersedableHeartbeatNodeStateUpdate(message) {
  const messageType = normalizeIdentifier(message?.type)?.toLowerCase();
  if (messageType !== MESSAGE_ROUTER_LITERAL.STRING_NODE_STATE_UPDATE) {
    return false;
  }
  return message?.heartbeat_only === true || message?.heartbeatOnly === true;
}
function resolveNodeStateUpdateReplacementNodeId(message) {
  return normalizeIdentifier(
    message?.node_id ||
      message?.nodeId ||
      message?.payload?.node_id ||
      message?.payload?.nodeId,
  );
}
function resolvePendingReplacementKey(targetAddress, message, options = {}) {
  const explicitKey = normalizeIdentifier(options?.replacePendingKey);
  if (explicitKey) {
    return explicitKey;
  }
  const normalizedTargetAddress = normalizeIdentifier(targetAddress);
  if (isSupersedableHeartbeatNodeStateUpdate(message)) {
    const replacementNodeId =
      resolveNodeStateUpdateReplacementNodeId(message) ||
      MESSAGE_ROUTER_LITERAL.STRING_UNKNOWN;
    if (!normalizedTargetAddress) {
      return `node_state_update:${replacementNodeId}`;
    }
    return `node_state_update:${normalizedTargetAddress}:${replacementNodeId}`;
  }
  if (isSupersedableRaftAppendFail(message)) {
    if (!normalizedTargetAddress) {
      return MESSAGE_ROUTER_LITERAL.STRING_RAFT_APPEND_FAIL;
    }
    return `raft:append:fail:${normalizedTargetAddress}`;
  }
  if (!isSupersedableRaftHeartbeatAppend(message)) {
    return null;
  }
  if (!normalizedTargetAddress) {
    return MESSAGE_ROUTER_LITERAL.STRING_RAFT_APPEND_HEARTBEAT;
  }
  return `raft:append:heartbeat:${normalizedTargetAddress}`;
}
function buildDerivedDeliverySource(targetAddress, message) {
  const messageType = normalizeIdentifier(message?.type)?.toLowerCase();
  if (messageType === MESSAGE_ROUTER_LITERAL.STRING_APPEND) {
    if (isSupersedableRaftHeartbeatAppend(message)) {
      return MESSAGE_ROUTER_LITERAL.STRING_RAFT_APPEND_HEARTBEAT;
    }
    const entry = Array.isArray(message?.data) ? message.data[0] : null;
    return summarizeRaftAppendCommand(entry?.command);
  }
  if (messageType === QUERY_DATA_PLANE_MESSAGE_TYPE.toLowerCase()) {
    const tableName = extractSqlTableName(message?.sql);
    const operationKind = extractSqlOperationKind(message?.sql);
    return `query:${operationKind}:${tableName || MESSAGE_ROUTER_LITERAL.STRING_UNKNOWN}`;
  }
  if (messageType) {
    return `message:${messageType}`;
  }
  const normalizedTarget = normalizeIdentifier(targetAddress);
  if (normalizedTarget) {
    return `target:${normalizedTarget}`;
  }
  return MESSAGE_ROUTER_LITERAL.STRING_UNKNOWN;
}
function buildRetiredPendingClassification(reason) {
  switch (reason) {
    case RETIRED_PENDING_RESPONSE_REASON.TIMEOUT:
      return MESSAGE_ROUTER_LITERAL.STRING_LATE_AFTER_TIMEOUT;
    case RETIRED_PENDING_RESPONSE_REASON.NODE_FAILURE:
      return MESSAGE_ROUTER_LITERAL.STRING_LATE_AFTER_NODE_FAILURE;
    case RETIRED_PENDING_RESPONSE_REASON.DEFERRED_DELIVERY:
      return MESSAGE_ROUTER_LITERAL.STRING_LATE_AFTER_DEFERRED_DELIVERY;
    case RETIRED_PENDING_RESPONSE_REASON.ACK_REJECTED:
      return MESSAGE_ROUTER_LITERAL.STRING_LATE_AFTER_ACK_REJECTED;
    case RETIRED_PENDING_RESPONSE_REASON.INLINE_ACK:
      return MESSAGE_ROUTER_LITERAL.STRING_LATE_AFTER_INLINE_ACK;
    case RETIRED_PENDING_RESPONSE_REASON.CANCELLED:
      return MESSAGE_ROUTER_LITERAL.STRING_LATE_AFTER_CANCELLED;
    default:
      return MESSAGE_ROUTER_LITERAL.STRING_LATE_AFTER_RETIRED_WAITER;
  }
}
function buildServiceResponseDisposition(options = {}) {
  return Object.freeze({
    messageId: normalizeIdentifier(options?.messageId) || null,
    kind:
      normalizeIdentifier(options?.kind) ||
      SERVICE_RESPONSE_DISPOSITION_KIND.ORPHANED,
    classification:
      normalizeIdentifier(options?.classification) ||
      SERVICE_RESPONSE_DISPOSITION_KIND.ORPHANED,
    absorbed: options?.absorbed === true,
    retiredReason: normalizeIdentifier(options?.retiredReason) || null,
    deliverySource: normalizeIdentifier(options?.deliverySource) || null,
    targetNodeId: normalizeIdentifier(options?.targetNodeId) || null,
  });
}
function resolveDeliverySource(targetAddress, message, options = {}) {
  const explicitSource = normalizeIdentifier(options?.deliverySource);
  if (explicitSource) {
    return explicitSource;
  }
  return buildDerivedDeliverySource(targetAddress, message);
}
function buildPendingSourceSummary(
  queue,
  limit = MESSAGE_ROUTER_LITERAL.NUMBER_5,
) {
  if (
    !queue ||
    !Array.isArray(queue.pending) ||
    queue.pending.length === TRANSPORT_NUM.ZERO
  ) {
    return [];
  }
  const countsBySource = /* @__PURE__ */ new Map();
  for (const item of queue.pending) {
    const source = normalizeIdentifier(item?.deliverySource) || "unknown";
    countsBySource.set(
      source,
      (countsBySource.get(source) || TRANSPORT_NUM.ZERO) + TRANSPORT_NUM.ONE,
    );
  }
  return [...countsBySource.entries()]
    .sort(
      (left, right) =>
        right[TRANSPORT_NUM.ONE] - left[TRANSPORT_NUM.ONE] ||
        left[TRANSPORT_NUM.ZERO].localeCompare(right[TRANSPORT_NUM.ZERO]),
    )
    .slice(TRANSPORT_NUM.ZERO, limit)
    .map(([source, count]) => ({
      source,
      count,
    }));
}
function normalizeDeliveryOutcome(outcome) {
  if (
    outcome &&
    typeof outcome === TRANSPORT_TYPEOF.OBJECT &&
    Object.prototype.hasOwnProperty.call(
      outcome,
      MESSAGE_ROUTER_LITERAL.STRING_RESULT,
    ) &&
    Object.prototype.hasOwnProperty.call(
      outcome,
      MESSAGE_ROUTER_LITERAL.STRING_QUEUEWAITMS,
    )
  ) {
    return {
      result: buildTransportDeliveryOutcome(outcome.result),
      queueWaitMs: Number.isFinite(outcome.queueWaitMs)
        ? Math.max(TRANSPORT_NUM.ZERO, Math.floor(outcome.queueWaitMs))
        : TRANSPORT_NUM.ZERO,
    };
  }
  return {
    result: buildTransportDeliveryOutcome(outcome),
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
  return priority === OutboundDeliveryPriority.CRITICAL
    ? OutboundDeliveryPriority.CRITICAL
    : OutboundDeliveryPriority.BACKGROUND;
}
function countPendingByPriority(queue, priority) {
  if (!queue || !Array.isArray(queue.pending)) {
    return TRANSPORT_NUM.ZERO;
  }
  return queue.pending.reduce((count, item) => {
    return item?.priority === priority ? count + TRANSPORT_NUM.ONE : count;
  }, TRANSPORT_NUM.ZERO);
}
function countPendingBySource(queue, deliverySource) {
  if (!queue || !Array.isArray(queue.pending)) {
    return TRANSPORT_NUM.ZERO;
  }
  const normalizedDeliverySource =
    normalizeIdentifier(deliverySource) ||
    MESSAGE_ROUTER_LITERAL.STRING_UNKNOWN;
  return queue.pending.reduce((count, item) => {
    const pendingSource =
      normalizeIdentifier(item?.deliverySource) ||
      MESSAGE_ROUTER_LITERAL.STRING_UNKNOWN;
    return pendingSource === normalizedDeliverySource
      ? count + TRANSPORT_NUM.ONE
      : count;
  }, TRANSPORT_NUM.ZERO);
}
function resolvePendingSourceLimit(queue) {
  if (!queue) {
    return TRANSPORT_NUM.ZERO;
  }
  const maxPending =
    Number.isFinite(queue.maxPending) && queue.maxPending > TRANSPORT_NUM.ZERO
      ? Math.floor(queue.maxPending)
      : TRANSPORT_NUM.ZERO;
  if (maxPending <= TRANSPORT_NUM.ZERO) {
    return TRANSPORT_NUM.ZERO;
  }
  const proportionalLimit = Math.floor(
    maxPending / OUTBOUND_QUEUE_PENDING_SOURCE_LIMIT_DIVISOR,
  );
  return Math.min(
    maxPending,
    Math.max(OUTBOUND_QUEUE_PENDING_SOURCE_LIMIT_MINIMUM, proportionalLimit),
  );
}
function countInFlightByPriority(queue, priority) {
  if (!queue) {
    return TRANSPORT_NUM.ZERO;
  }
  const rawCount =
    priority === OutboundDeliveryPriority.CRITICAL
      ? queue.inFlightCritical
      : queue.inFlightBackground;
  return Number.isFinite(rawCount) && rawCount > TRANSPORT_NUM.ZERO
    ? Math.floor(rawCount)
    : TRANSPORT_NUM.ZERO;
}
function resolveBoundedCriticalReserve(rawReserve, maxReserve) {
  const normalizedMaxReserve =
    Number.isFinite(maxReserve) && maxReserve > TRANSPORT_NUM.ZERO
      ? Math.floor(maxReserve)
      : TRANSPORT_NUM.ZERO;
  if (normalizedMaxReserve <= TRANSPORT_NUM.ZERO) {
    return TRANSPORT_NUM.ZERO;
  }
  const normalizedReserve =
    Number.isFinite(rawReserve) && rawReserve > TRANSPORT_NUM.ZERO
      ? Math.floor(rawReserve)
      : TRANSPORT_NUM.ZERO;
  return Math.min(normalizedReserve, normalizedMaxReserve);
}
function resolveBackgroundPendingLimit(queue) {
  if (!queue) {
    return TRANSPORT_NUM.ZERO;
  }
  const criticalReserve = resolveBoundedCriticalReserve(
    queue.criticalReserve,
    queue.maxPending,
  );
  return Math.max(TRANSPORT_NUM.ZERO, queue.maxPending - criticalReserve);
}
function resolveBackgroundInFlightLimit(queue) {
  if (!queue) {
    return TRANSPORT_NUM.ZERO;
  }
  const maxConcurrent =
    Number.isFinite(queue.maxConcurrent) &&
    queue.maxConcurrent > TRANSPORT_NUM.ZERO
      ? Math.floor(queue.maxConcurrent)
      : TRANSPORT_NUM.ZERO;
  if (maxConcurrent <= TRANSPORT_NUM.ZERO) {
    return TRANSPORT_NUM.ZERO;
  }
  const maxReservedConcurrent = Math.max(
    TRANSPORT_NUM.ZERO,
    maxConcurrent - TRANSPORT_NUM.ONE,
  );
  const criticalReserve = resolveBoundedCriticalReserve(
    queue.criticalReserve,
    maxReservedConcurrent,
  );
  return Math.max(TRANSPORT_NUM.ONE, maxConcurrent - criticalReserve);
}
function resolveNextPendingItemIndex(queue) {
  if (
    !queue ||
    !Array.isArray(queue.pending) ||
    queue.pending.length === TRANSPORT_NUM.ZERO
  ) {
    return -1;
  }
  const criticalIndex = queue.pending.findIndex((item) => {
    return item?.priority === OutboundDeliveryPriority.CRITICAL;
  });
  if (criticalIndex >= TRANSPORT_NUM.ZERO) {
    return criticalIndex;
  }
  return TRANSPORT_NUM.ZERO;
}
function peekNextPendingItem(queue) {
  const nextItemIndex = resolveNextPendingItemIndex(queue);
  return nextItemIndex >= TRANSPORT_NUM.ZERO
    ? queue.pending[nextItemIndex]
    : null;
}
function dequeueNextPendingItem(queue) {
  const nextItemIndex = resolveNextPendingItemIndex(queue);
  return nextItemIndex >= TRANSPORT_NUM.ZERO
    ? queue.pending.splice(nextItemIndex, TRANSPORT_NUM.ONE)[TRANSPORT_NUM.ZERO]
    : null;
}
function canDispatchPendingItem(queue, item) {
  if (!queue || !item || queue.inFlight >= queue.maxConcurrent) {
    return false;
  }
  if (item.priority === OutboundDeliveryPriority.CRITICAL) {
    return true;
  }
  return (
    countInFlightByPriority(queue, OutboundDeliveryPriority.BACKGROUND) <
    resolveBackgroundInFlightLimit(queue)
  );
}
function adjustInFlightPriorityCount(queue, priority, delta) {
  if (!queue || !Number.isFinite(delta) || delta === TRANSPORT_NUM.ZERO) {
    return;
  }
  const normalizedDelta =
    delta > TRANSPORT_NUM.ZERO ? TRANSPORT_NUM.ONE : -TRANSPORT_NUM.ONE;
  if (priority === OutboundDeliveryPriority.CRITICAL) {
    queue.inFlightCritical = Math.max(
      TRANSPORT_NUM.ZERO,
      countInFlightByPriority(queue, OutboundDeliveryPriority.CRITICAL) +
        normalizedDelta,
    );
    return;
  }
  queue.inFlightBackground = Math.max(
    TRANSPORT_NUM.ZERO,
    countInFlightByPriority(queue, OutboundDeliveryPriority.BACKGROUND) +
      normalizedDelta,
  );
}
class OutboundDeliveryRegistryOwner {
  constructor(router) {
    this.router = router;
  }
  getOutboundQueue(nodeId) {
    if (!this.router.outboundQueues.has(nodeId)) {
      this.router.outboundQueues.set(nodeId, {
        nodeId,
        inFlight: TRANSPORT_NUM.ZERO,
        inFlightCritical: TRANSPORT_NUM.ZERO,
        inFlightBackground: TRANSPORT_NUM.ZERO,
        pending: [],
        maxConcurrent: this.router.outboundQueueMaxConcurrent,
        maxPending: this.router.outboundQueueMaxPending,
        criticalReserve: this.router.outboundQueueCriticalReserve,
        queueWaitSampleCount: TRANSPORT_NUM.ZERO,
        queueWaitTotalMs: TRANSPORT_NUM.ZERO,
        queueWaitMaxMs: TRANSPORT_NUM.ZERO,
        queueWaitHistogram: createQueueWaitHistogram(),
      });
    }
    return this.router.outboundQueues.get(nodeId);
  }
  isOutboundQueueAvailable(nodeId) {
    const queue = this.router.outboundQueues.get(nodeId);
    if (!queue) {
      return true;
    }
    return queue.inFlight < queue.maxConcurrent;
  }
  enqueue(nodeId, deliverFn, options = {}) {
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
        const existingPendingIndex = queue.pending.findIndex(
          (item) => item?.replacePendingKey === replacePendingKey,
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
      const pendingForSource = countPendingBySource(queue, deliverySource);
      const pendingSourceLimit = resolvePendingSourceLimit(queue);
      const isNodeBackpressured =
        deliveryPriority === OutboundDeliveryPriority.CRITICAL
          ? queue.pending.length >= queue.maxPending
          : pendingBackground >= backgroundPendingLimit;
      const isSourceBackpressured =
        pendingSourceLimit > TRANSPORT_NUM.ZERO &&
        pendingForSource >= pendingSourceLimit;
      if (isNodeBackpressured || isSourceBackpressured) {
        const error = new Error(
          ROUTER_ERROR_MSG.outboundQueueBackpressured(nodeId, queue.maxPending),
        );
        error.code = OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE;
        error.backpressureScope = isSourceBackpressured
          ? OUTBOUND_QUEUE_BACKPRESSURE_SCOPE.DELIVERY_SOURCE
          : OUTBOUND_QUEUE_BACKPRESSURE_SCOPE.NODE;
        this.router.logger.warn(
          MESSAGE_ROUTER_LITERAL.STRING_OUTBOUND_QUEUE_SATURATED_FOR_NODE_DELIVERY,
          {
            localNodeId: this.router.nodeId,
            targetNodeId: nodeId,
            deliveryPriority,
            attemptedDeliverySource: deliverySource,
            attemptedTargetAddress: normalizeIdentifier(options.targetAddress),
            backpressureScope: error.backpressureScope,
            pending: queue.pending.length,
            pendingCritical: countPendingByPriority(
              queue,
              OutboundDeliveryPriority.CRITICAL,
            ),
            pendingBackground,
            pendingForSource,
            pendingSourceLimit,
            backgroundPendingLimit,
            criticalReserve: queue.criticalReserve,
            maxPending: queue.maxPending,
            inFlight: queue.inFlight,
            inFlightCritical: countInFlightByPriority(
              queue,
              OutboundDeliveryPriority.CRITICAL,
            ),
            inFlightBackground: countInFlightByPriority(
              queue,
              OutboundDeliveryPriority.BACKGROUND,
            ),
            pendingSourceSummary: buildPendingSourceSummary(queue),
          },
        );
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
      this.process(nodeId);
    });
  }
  process(nodeId) {
    const queue = this.router.outboundQueues.get(nodeId);
    if (!queue) {
      return;
    }
    while (queue.pending.length > TRANSPORT_NUM.ZERO) {
      const nextItem = peekNextPendingItem(queue);
      if (!canDispatchPendingItem(queue, nextItem)) {
        return;
      }
      const item = dequeueNextPendingItem(queue);
      queue.inFlight += TRANSPORT_NUM.ONE;
      adjustInFlightPriorityCount(queue, item?.priority, TRANSPORT_NUM.ONE);
      const queueWaitMs = Math.max(
        TRANSPORT_NUM.ZERO,
        Date.now() - (item?.queuedAt || Date.now()),
      );
      recordQueueWaitDuration(queue, queueWaitMs);
      Promise.resolve()
        .then(() => item.deliverFn())
        .then((result) => {
          queue.inFlight -= TRANSPORT_NUM.ONE;
          adjustInFlightPriorityCount(
            queue,
            item?.priority,
            -TRANSPORT_NUM.ONE,
          );
          item.resolve({
            result,
            queueWaitMs,
          });
          this.process(nodeId);
        })
        .catch((error) => {
          queue.inFlight -= TRANSPORT_NUM.ONE;
          adjustInFlightPriorityCount(
            queue,
            item?.priority,
            -TRANSPORT_NUM.ONE,
          );
          item.reject(error);
          this.process(nodeId);
        });
    }
  }
  fail(nodeId, error) {
    const queue = this.router.outboundQueues.get(nodeId);
    if (!queue) {
      return;
    }
    while (queue.pending.length > TRANSPORT_NUM.ZERO) {
      const item = dequeueNextPendingItem(queue);
      item.reject(error);
    }
  }
  failGracefully(nodeId, error) {
    const queue = this.router.outboundQueues.get(nodeId);
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
  buildPressureSummary() {
    let saturatedNodeCount = TRANSPORT_NUM.ZERO;
    let totalPending = TRANSPORT_NUM.ZERO;
    let maxPendingUtilization = TRANSPORT_NUM.ZERO;
    for (const queue of this.router.outboundQueues.values()) {
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
      pendingNodeConnectionCount: this.router.pendingNodeConnections.size,
      reconnectBeforeDeliveryFailureCount:
        this.router.transportPressureMetrics[
          TRANSPORT_PRESSURE_SUMMARY_FIELD
            .RECONNECT_BEFORE_DELIVERY_FAILURE_COUNT
        ],
      maxObservedPendingNodeConnectionCount:
        this.router.transportPressureMetrics[
          TRANSPORT_PRESSURE_SUMMARY_FIELD
            .MAX_OBSERVED_PENDING_NODE_CONNECTION_COUNT
        ],
    });
  }
}
const INCOMING_CONNECTION_ADOPTION = Object.freeze({
  ADOPT_INCOMING: "adopt_incoming",
  KEEP_EXISTING: "keep_existing",
  KEEP_SELF_CONNECTION: "keep_self_connection",
});
class RouterConnectionAuthorityOwner {
  constructor(router) {
    this.router = router;
  }
  buildObservedReconnectAddress(ws, candidateAddress = null) {
    const observedHost = ws?._socket?.remoteAddress;
    if (
      typeof observedHost !== TRANSPORT_TYPEOF.STRING ||
      observedHost.length === TRANSPORT_NUM.ZERO
    ) {
      return null;
    }
    const port =
      this.router.extractWebSocketPort(candidateAddress) ||
      Number(ws?._socket?.remotePort) ||
      null;
    if (!Number.isFinite(port) || port <= TRANSPORT_NUM.ZERO) {
      return null;
    }
    return TRANSPORT_FORMAT.buildWebSocketAddress(
      this.router.normalizeWebSocketHost(observedHost),
      port,
    );
  }
  rememberReconnectAddress(connectionInfo, ws, candidateAddress = null) {
    if (!connectionInfo || typeof connectionInfo !== TRANSPORT_TYPEOF.OBJECT) {
      return;
    }
    const normalizedCandidateAddress =
      normalizeToWebSocketAddress(candidateAddress) || candidateAddress;
    if (
      typeof candidateAddress === TRANSPORT_TYPEOF.STRING &&
      candidateAddress.length > TRANSPORT_NUM.ZERO &&
      (!connectionInfo.configuredAddress ||
        connectionInfo.configuredAddress.length === TRANSPORT_NUM.ZERO)
    ) {
      connectionInfo.configuredAddress = normalizedCandidateAddress;
    }
    const observedAddress = this.buildObservedReconnectAddress(
      ws,
      normalizedCandidateAddress,
    );
    if (
      typeof observedAddress === TRANSPORT_TYPEOF.STRING &&
      observedAddress.length > TRANSPORT_NUM.ZERO
    ) {
      connectionInfo.observedAddress = observedAddress;
      connectionInfo.address = observedAddress;
      return;
    }
    if (
      typeof normalizedCandidateAddress === TRANSPORT_TYPEOF.STRING &&
      normalizedCandidateAddress.length > TRANSPORT_NUM.ZERO
    ) {
      connectionInfo.address = normalizedCandidateAddress;
    }
  }
  resolveIncomingConnectionAdoption(nodeId) {
    const existing = this.router.nodeConnections.get(nodeId) || null;
    const isSelfConnection =
      existing?.isSelfConnection && nodeId === this.router.nodeId;
    if (isSelfConnection) {
      return {
        state: INCOMING_CONNECTION_ADOPTION.KEEP_SELF_CONNECTION,
        existing,
      };
    }
    const existingConnected =
      Boolean(existing) && existing.state === ConnectionState.CONNECTED;
    const preferIncomingConnection =
      this.router.nodeId.localeCompare(nodeId) > TRANSPORT_NUM.ZERO;
    const existingPreferredIncomingConnection =
      existingConnected &&
      preferIncomingConnection &&
      existing?.isIncoming === true;
    const shouldAdoptIncomingConnection =
      !existing ||
      !existingConnected ||
      (preferIncomingConnection && !existingPreferredIncomingConnection);
    return {
      state: shouldAdoptIncomingConnection
        ? INCOMING_CONNECTION_ADOPTION.ADOPT_INCOMING
        : INCOMING_CONNECTION_ADOPTION.KEEP_EXISTING,
      existing,
    };
  }
  resolveNodeAddressForDelivery(targetNodeId) {
    if (typeof this.router.resolveNodeAddress !== TRANSPORT_TYPEOF.FUNCTION) {
      return null;
    }
    try {
      const resolved = this.router.resolveNodeAddress(targetNodeId);
      return typeof resolved === TRANSPORT_TYPEOF.STRING &&
        resolved.length > TRANSPORT_NUM.ZERO
        ? resolved
        : null;
    } catch (error) {
      this.router.logger.warn(
        MESSAGE_ROUTER_LITERAL.STRING_FAILED_TO_RESOLVE_NODE_CONNECTION_ADDRESS_FOR_DELIVERY_RECOVERY,
        {
          targetNodeId,
          localNodeId: this.router.nodeId,
          error: error?.message || String(error),
        },
      );
      return null;
    }
  }
  resolveCanonicalReconnectAddress(targetNodeId, fallbackAddress = null) {
    const resolvedAddress = this.resolveNodeAddressForDelivery(targetNodeId);
    if (
      typeof resolvedAddress === TRANSPORT_TYPEOF.STRING &&
      resolvedAddress.length > TRANSPORT_NUM.ZERO
    ) {
      return normalizeToWebSocketAddress(resolvedAddress) || resolvedAddress;
    }
    const normalizedFallback =
      normalizeToWebSocketAddress(fallbackAddress) || fallbackAddress;
    return typeof normalizedFallback === TRANSPORT_TYPEOF.STRING &&
      normalizedFallback.length > TRANSPORT_NUM.ZERO
      ? normalizedFallback
      : null;
  }
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
    if (
      !hasObservedAddress ||
      !currentAddress ||
      connectionInfo.state !== ConnectionState.CONNECTED ||
      currentAddress === previousConfigured
    ) {
      connectionInfo.address = canonicalAddress;
    }
    return canonicalAddress;
  }
  getReconnectAddressSuppressionKey(targetNodeId, address) {
    if (
      typeof targetNodeId !== TRANSPORT_TYPEOF.STRING ||
      targetNodeId.length === TRANSPORT_NUM.ZERO ||
      typeof address !== TRANSPORT_TYPEOF.STRING ||
      address.length === TRANSPORT_NUM.ZERO
    ) {
      return null;
    }
    return `${targetNodeId}::${address}`;
  }
  pruneReconnectAddressSuppressions(nowMs = Date.now()) {
    for (const [
      key,
      expiresAt,
    ] of this.router.suppressedReconnectAddresses.entries()) {
      if (!Number.isFinite(expiresAt) || expiresAt <= nowMs) {
        this.router.suppressedReconnectAddresses.delete(key);
      }
    }
  }
  isReconnectAddressSuppressed(targetNodeId, address) {
    const key = this.getReconnectAddressSuppressionKey(targetNodeId, address);
    if (!key) {
      return false;
    }
    this.pruneReconnectAddressSuppressions();
    const expiresAt = this.router.suppressedReconnectAddresses.get(key);
    return Number.isFinite(expiresAt) && expiresAt > Date.now();
  }
  suppressReconnectAddress(targetNodeId, address) {
    const key = this.getReconnectAddressSuppressionKey(targetNodeId, address);
    if (!key) {
      return;
    }
    const suppressionMs =
      Number.isFinite(this.router.reconnectAddressSuppressionMs) &&
      this.router.reconnectAddressSuppressionMs > TRANSPORT_NUM.ZERO
        ? this.router.reconnectAddressSuppressionMs
        : TRANSPORT_NUM.ZERO;
    if (suppressionMs <= TRANSPORT_NUM.ZERO) {
      return;
    }
    this.router.suppressedReconnectAddresses.set(
      key,
      Date.now() + suppressionMs,
    );
  }
  clearReconnectAddressSuppression(targetNodeId, address) {
    const key = this.getReconnectAddressSuppressionKey(targetNodeId, address);
    if (!key) {
      return;
    }
    this.router.suppressedReconnectAddresses.delete(key);
  }
  shouldSuppressReconnectAddress(error) {
    const errorMessage = error?.message || null;
    if (
      typeof errorMessage !== TRANSPORT_TYPEOF.STRING ||
      errorMessage.length === TRANSPORT_NUM.ZERO
    ) {
      return false;
    }
    return (
      errorMessage.includes(MESSAGE_ROUTER_LITERAL.STRING_ENOTFOUND) ||
      errorMessage.includes(MESSAGE_ROUTER_LITERAL.STRING_EAI_AGAIN)
    );
  }
  resolveReconnectAddresses(targetNodeId, preferredAddress = null) {
    const addresses = [];
    const pushUniqueAddress = (candidate) => {
      if (
        typeof candidate !== TRANSPORT_TYPEOF.STRING ||
        candidate.length === TRANSPORT_NUM.ZERO ||
        this.isReconnectAddressSuppressed(targetNodeId, candidate) ||
        addresses.includes(candidate)
      ) {
        return;
      }
      addresses.push(candidate);
    };
    const existing = this.router.nodeConnections.get(targetNodeId) || null;
    const canonicalAddress = existing
      ? this.refreshReconnectAuthority(existing, preferredAddress)
      : this.resolveCanonicalReconnectAddress(targetNodeId, preferredAddress);
    pushUniqueAddress(canonicalAddress);
    pushUniqueAddress(
      normalizeToWebSocketAddress(existing?.configuredAddress) ||
        existing?.configuredAddress,
    );
    pushUniqueAddress(
      normalizeToWebSocketAddress(existing?.address) || existing?.address,
    );
    pushUniqueAddress(
      normalizeToWebSocketAddress(preferredAddress) || preferredAddress,
    );
    pushUniqueAddress(
      normalizeToWebSocketAddress(existing?.observedAddress) ||
        existing?.observedAddress,
    );
    return addresses;
  }
}

export const MESSAGE_ROUTER_SHARED = {
  CONNECTION_CLOSE_DISPOSITION,
  CONNECTION_STATE,
  ConfigurationManager,
  ConnectionState,
  EMPTY_ROUTER_REASON,
  EventEmitter,
  HOST,
  INCOMING_CONNECTION_ADOPTION,
  INLINE_ACK_PASSTHROUGH_KEYS,
  INLINE_ACK_RESULT_FIELD,
  INPROC,
  IPV6_ANY_HOST,
  IPV6_HOST_PREFIX,
  IPV6_HOST_SUFFIX,
  InProcWebSocket,
  LoggingService,
  MESSAGE_ROUTER_LITERAL,
  METRICS_LOG_TAG,
  OUTBOUND_DELIVERY_PRIORITY,
  OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE,
  OUTBOUND_QUEUE_BACKPRESSURE_SCOPE,
  OUTBOUND_QUEUE_PENDING_SOURCE_LIMIT_DIVISOR,
  OUTBOUND_QUEUE_PENDING_SOURCE_LIMIT_MINIMUM,
  OutboundDeliveryPriority,
  OutboundDeliveryRegistryOwner,
  QUERY_DATA_PLANE_MESSAGE_TYPE,
  QUERY_TRANSPORT_DELIVERY_STATE,
  QUERY_TRANSPORT_SELECTION,
  QUEUE_WAIT_BUCKETS,
  QUEUE_WAIT_BUCKET_OVERFLOW,
  RECONNECT_ADDRESS_SUPPRESSION_DEFAULT_MS,
  RECONNECT_DISPOSITION,
  RETIRED_PENDING_RESPONSE_REASON,
  ROUTER_ADDRESS,
  ROUTER_CONNECTION_CLOSED_ERROR_CODE,
  ROUTER_ERROR_MSG,
  ROUTER_LOG_MSG,
  ROUTER_MESSAGE_TIMEOUT_ERROR_CODE,
  ROUTER_MESSAGE_TYPE,
  ROUTER_NO_CONNECTION_ERROR_CODE,
  ROUTER_QUERY_TRANSPORT_NOT_READY_ERROR_CODE,
  ROUTER_VALID_ENTITY_TYPES,
  RouterConnectionAuthorityOwner,
  RouterMessageType,
  SERVICE_RESPONSE_DISPOSITION_KIND,
  TRANSPORT_CONFIG_KEY,
  TRANSPORT_DEFAULT,
  TRANSPORT_DELIVERY_OUTCOME_METADATA_FIELDS,
  TRANSPORT_ERROR_MSG,
  TRANSPORT_EVENT,
  TRANSPORT_FORMAT,
  TRANSPORT_METRIC,
  TRANSPORT_METRIC_TRIGGER,
  TRANSPORT_NUM,
  TRANSPORT_PRESSURE_SUMMARY_FIELD,
  TRANSPORT_SUBSYSTEM,
  TRANSPORT_TYPEOF,
  UNMATCHED_SERVICE_RESPONSE_WARN_INTERVAL_MS,
  URL,
  WEBSOCKET_CONNECT_TIMEOUT_CONFIG_KEY,
  WEBSOCKET_CONNECT_TIMEOUT_ERROR_CODE,
  WebSocket,
  WebSocketServer,
  adjustInFlightPriorityCount,
  buildDerivedDeliverySource,
  buildPendingSourceSummary,
  buildQueryTransportSemanticOutcome,
  buildQueueWaitSummary,
  buildRetiredPendingClassification,
  buildServiceResponseDisposition,
  buildSupersededPendingResult,
  buildTransportDeliveryOutcome,
  canDispatchPendingItem,
  countInFlightByPriority,
  countPendingByPriority,
  countPendingBySource,
  createInProcWebSocketPair,
  createQueueWaitHistogram,
  dequeueNextPendingItem,
  extractSqlOperationKind,
  extractSqlTableName,
  isRaftPacket,
  isSupersedableHeartbeatNodeStateUpdate,
  isSupersedableRaftAppendFail,
  isSupersedableRaftHeartbeatAppend,
  normalizeDeliveryOutcome,
  normalizeIdentifier,
  normalizeOutboundDeliveryPriority,
  normalizeRetryAfterMs,
  normalizeToWebSocketAddress,
  peekNextPendingItem,
  queueMicrotaskFn,
  recordQueueWaitDuration,
  resolveBackgroundInFlightLimit,
  resolveBackgroundPendingLimit,
  resolveBoundedCriticalReserve,
  resolveDeliverySource,
  resolveNextPendingItemIndex,
  resolveNodeStateUpdateReplacementNodeId,
  resolveOperationIdFromMessage,
  resolvePendingReplacementKey,
  resolvePendingSourceLimit,
  resolveQueueWaitBucket,
  resolveRequestIdFromMessage,
  summarizeRaftAppendCommand,
  uuidv4,
};
