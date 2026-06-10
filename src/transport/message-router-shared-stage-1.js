import {EventEmitter} from 'events';
import WebSocket from 'ws';
import {
  CONNECTION_STATE,
  OUTBOUND_DELIVERY_PRIORITY,
  ROUTER_MESSAGE_TYPE,
  TRANSPORT_EVENT,
  TRANSPORT_NUM,
  TRANSPORT_TYPEOF,
} from '../constants/transport.js';
import {TRANSPORT_DELIVERY_OUTCOME_METADATA_FIELDS} from './transport-semantic-outcome.js';

const LOCAL_NUM_ZERO = 0;

const LOCAL_NUM_ONE = 1;

const MESSAGE_ROUTER_LITERAL = Object.freeze({
  STRING_UNKNOWN: 'unknown',
  STRING_SELECT: 'select',
  STRING_INSERT: 'insert',
  STRING_UPDATE: 'update',
  STRING_DELETE: 'delete',
  STRING_RAFT_APPEND_UNKNOWN: 'raft:append:unknown',
  STRING_CDC: 'cdc',
  STRING_CDC_BATCH: 'cdc_batch',
  STRING_RAFT_APPEND_CDC_BATCH_UNKNOWN: 'raft:append:cdc_batch:unknown',
  STRING_MESSAGE: 'message',
  STRING_NODE_STATE_UPDATE: 'node_state_update',
  STRING_ACK: 'ack',
  STRING_RAFT_APPEND_ACK: 'raft:append:ack',
  STRING_APPEND: 'append',
  STRING_APPEND_FAIL: 'append fail',
  STRING_RAFT_APPEND_HEARTBEAT: 'raft:append:heartbeat',
  STRING_RAFT_APPEND_FAIL: 'raft:append:fail',
  STRING_LATE_AFTER_TIMEOUT: 'late_after_timeout',
  STRING_LATE_AFTER_NODE_FAILURE: 'late_after_node_failure',
  STRING_LATE_AFTER_DEFERRED_DELIVERY: 'late_after_deferred_delivery',
  STRING_LATE_AFTER_ACK_REJECTED: 'late_after_ack_rejected',
  STRING_LATE_AFTER_INLINE_ACK: 'late_after_inline_ack',
  STRING_LATE_AFTER_CANCELLED: 'late_after_cancelled',
  STRING_LATE_AFTER_RETIRED_WAITER: 'late_after_retired_waiter',
  STRING_RESULT: 'result',
  STRING_QUEUEWAITMS: 'queueWaitMs',
  STRING_TARGET_PREFIX: 'target:',
  STRING_TARGET_CRITICAL_FALLBACK: 'target:critical-fallback',
  STRING_TARGET_PRIORITY_CONTROL_PLANE: 'target:priority-control-plane',
  STRING_FUNCTION: 'function',
  STRING_INVALID_WSPORT_FOR_IN_PROCESS_SERVER:
    'Invalid wsPort for in-process server',
  STRING_EADDRINUSE: 'EADDRINUSE',
  STRING_VALUE: ':',
  STRING_WEBSOCKET_CONNECTION_CLOSED_BEFORE_OPEN_FOR_NODE:
    'WebSocket connection closed before open for node ',
  STRING_ECONNREFUSED: 'ECONNREFUSED',
  STRING_REJECTING_INCOMING_CONNECTION_WHILE_EXTERNAL_ADMISSION_IS_CLOSED:
    'Rejecting incoming connection while external admission is closed',
  STRING_EXISTING_CONNECTION_PREFERRED: 'existing_connection_preferred',
  STRING_ORPHANED: 'orphaned',
  STRING_RESPONSETYPE: 'responseType',
  STRING_IGNORING_STALE_CONNECTION_CLOSE_EVENT:
    'Ignoring stale connection close event',
  STRING_ROUTER_QUERY_TRANSPORT_NOT_READY: 'ROUTER_QUERY_TRANSPORT_NOT_READY',
  STRING_OUTBOUND_QUEUE_SATURATED_FOR_NODE_DELIVERY:
    'Outbound queue saturated for node delivery',
  STRING_FAILED_TO_RESOLVE_NODE_CONNECTION_ADDRESS_FOR_DELIVERY_RECOVERY:
    'Failed to resolve node connection address for delivery recovery',
  STRING_ENOTFOUND: 'ENOTFOUND',
  STRING_EAI_AGAIN: 'EAI_AGAIN',
  STRING_OBSERVED_ACK_TIMEOUT_BELOW_QUARANTINE_THRESHOLD:
    'Observed ACK timeout below quarantine threshold',
  STRING_QUARANTINING_TARGET_CONNECTION_AFTER_ACK_TIMEOUT:
    'Quarantining target connection after ACK timeout',
  STRING_QUARANTINE_SKIPPED_PEER_RECENTLY_ALIVE:
    'Skipping ACK-timeout quarantine: peer demonstrably alive (slow, not dead)',
  NUMBER_5: 5,
});

const queueMicrotaskFn = globalThis.queueMicrotask;

const ConnectionState = CONNECTION_STATE;

const RouterMessageType = ROUTER_MESSAGE_TYPE;

const IPV6_ANY_HOST = '::';

const IPV6_HOST_PREFIX = '[';

const IPV6_HOST_SUFFIX = ']';

const WEBSOCKET_CONNECT_TIMEOUT_CONFIG_KEY = 'timeout.websocketConnectMs';

const WEBSOCKET_CONNECT_TIMEOUT_ERROR_CODE = 'WS_CONNECT_TIMEOUT';

const RECONNECT_ADDRESS_SUPPRESSION_DEFAULT_MS = 5e3;

const UNMATCHED_SERVICE_RESPONSE_WARN_INTERVAL_MS = 3e4;

const DELIVERY_SOURCE_MESSAGE_UNWRAP_LIMIT = 4;

const EMPTY_DELIVERY_SOURCE = '';

const RETIRED_PENDING_RESPONSE_REASON = Object.freeze({
  TIMEOUT: 'timeout',
  CANCELLED: 'cancelled',
  NODE_FAILURE: 'node_failure',
  DEFERRED_DELIVERY: 'deferred_delivery',
  ACK_REJECTED: 'ack_rejected',
  INLINE_ACK: 'inline_ack_payload',
  UNKNOWN: 'unknown',
});

const SERVICE_RESPONSE_DISPOSITION_KIND = Object.freeze({
  SETTLED: 'settled',
  ABSORBED: 'absorbed_late',
  ORPHANED: 'orphaned',
});

const ROUTER_NO_CONNECTION_ERROR_CODE = 'ROUTER_NO_CONNECTION';

const ROUTER_CONNECTION_CLOSED_ERROR_CODE = 'ROUTER_CONNECTION_CLOSED';

const ROUTER_MESSAGE_TIMEOUT_ERROR_CODE = 'ROUTER_MESSAGE_TIMEOUT';

const QUEUE_WAIT_BUCKETS = Object.freeze([
  {
    upperBoundMs: 1,
    label: 'le_1ms',
  },
  {
    upperBoundMs: 5,
    label: 'le_5ms',
  },
  {
    upperBoundMs: 10,
    label: 'le_10ms',
  },
  {
    upperBoundMs: 25,
    label: 'le_25ms',
  },
  {
    upperBoundMs: 50,
    label: 'le_50ms',
  },
  {
    upperBoundMs: 100,
    label: 'le_100ms',
  },
  {
    upperBoundMs: 500,
    label: 'le_500ms',
  },
  {
    upperBoundMs: 1e3,
    label: 'le_1000ms',
  },
]);

const QUEUE_WAIT_BUCKET_OVERFLOW = 'gt_1000ms';

const QUERY_DATA_PLANE_MESSAGE_TYPE = 'QUERY';

const OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE =
  'ROUTER_OUTBOUND_QUEUE_BACKPRESSURED';

const OUTBOUND_QUEUE_PENDING_SOURCE_LIMIT_DIVISOR = TRANSPORT_NUM.FOUR;

const OUTBOUND_QUEUE_TARGET_FALLBACK_PENDING_SOURCE_LIMIT_DIVISOR =
  TRANSPORT_NUM.EIGHT;

const OUTBOUND_QUEUE_TARGET_FALLBACK_IN_FLIGHT_SOURCE_LIMIT_DIVISOR =
  TRANSPORT_NUM.FOUR;

const OUTBOUND_QUEUE_PENDING_SOURCE_LIMIT_MINIMUM = TRANSPORT_NUM.FOUR;

const OUTBOUND_QUEUE_PENDING_SOURCE_LIMIT_STATE = Object.freeze({
  DISABLED: 'disabled',
  CRITICAL_RESERVE_PROTECTED: 'critical_reserve_protected',
  PROPORTIONAL: 'proportional',
});

const OUTBOUND_QUEUE_BACKPRESSURE_SCOPE = Object.freeze({
  NODE: 'node',
  DELIVERY_SOURCE: 'delivery_source',
});

const OutboundDeliveryPriority = OUTBOUND_DELIVERY_PRIORITY;

const OUTBOUND_QUEUE_PENDING_SOURCE_LIMIT_STATE_TABLE = Object.freeze([
  Object.freeze({
    state: OUTBOUND_QUEUE_PENDING_SOURCE_LIMIT_STATE.DISABLED,
    matches: (evidence) => evidence.maxPending <= TRANSPORT_NUM.ZERO,
  }),
  Object.freeze({
    state: OUTBOUND_QUEUE_PENDING_SOURCE_LIMIT_STATE.PROPORTIONAL,
    matches: (evidence) =>
      evidence.deliveryPriority === OutboundDeliveryPriority.CRITICAL &&
      evidence.targetFallbackSource === true,
  }),
  Object.freeze({
    state: OUTBOUND_QUEUE_PENDING_SOURCE_LIMIT_STATE.CRITICAL_RESERVE_PROTECTED,
    matches: (evidence) =>
      evidence.deliveryPriority === OutboundDeliveryPriority.CRITICAL,
  }),
  Object.freeze({
    state: OUTBOUND_QUEUE_PENDING_SOURCE_LIMIT_STATE.PROPORTIONAL,
    matches: () => true,
  }),
]);

const CONNECTION_CLOSE_DISPOSITION = Object.freeze({
  SHUTDOWN: 'shutdown',
  RETIRED: 'retired',
  SELF_DISCONNECT: 'self_disconnect',
  RECONNECT: 'reconnect',
  NO_ACTION: 'no_action',
});

const RECONNECT_DISPOSITION = Object.freeze({
  RETIRE: 'retire',
  PENDING: 'pending',
  MAX_ATTEMPTS_REACHED: 'max_attempts_reached',
  SCHEDULE: 'schedule',
});

const TRANSPORT_PRESSURE_SUMMARY_FIELD = Object.freeze({
  MAX_OBSERVED_PENDING_NODE_CONNECTION_COUNT:
    'maxObservedPendingNodeConnectionCount',
  PENDING_NODE_CONNECTION_COUNT: 'pendingNodeConnectionCount',
  RECONNECT_BEFORE_DELIVERY_FAILURE_COUNT:
    'reconnectBeforeDeliveryFailureCount',
});

const QUERY_TRANSPORT_SELECTION = Object.freeze({
  UNAVAILABLE: 'unavailable',
  DIRECT_SERVICE: 'direct_service',
  SELECTION_SERVICE: 'selection_service',
});

const QUERY_TRANSPORT_DELIVERY_STATE = Object.freeze({
  SUCCESS: 'success',
  DEFER_RETRY: 'defer_retry',
  HARD_FAILURE: 'hard_failure',
});

const INLINE_ACK_RESULT_FIELD = Object.freeze({
  ACKNOWLEDGED: 'acknowledged',
  CORRELATION_ID: 'correlationId',
  MESSAGE_ID: 'messageId',
});

const INLINE_ACK_PASSTHROUGH_KEYS = /* @__PURE__ */ new Set([
  INLINE_ACK_RESULT_FIELD.MESSAGE_ID,
  INLINE_ACK_RESULT_FIELD.ACKNOWLEDGED,
  INLINE_ACK_RESULT_FIELD.CORRELATION_ID,
  ...TRANSPORT_DELIVERY_OUTCOME_METADATA_FIELDS,
]);

const EMPTY_ROUTER_REASON = '';

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
  if (value === null || value === void LOCAL_NUM_ZERO) {
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
      sampleCount > TRANSPORT_NUM.ZERO ?
        Math.round(totalMs / sampleCount) :
        TRANSPORT_NUM.ZERO,
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

function buildTypelessQueryDeliverySource(message) {
  const tableName = extractSqlTableName(message?.sql);
  const operationKind = extractSqlOperationKind(message?.sql);
  if (!tableName && operationKind === MESSAGE_ROUTER_LITERAL.STRING_UNKNOWN) {
    return null;
  }
  return `query:${operationKind}:${tableName || MESSAGE_ROUTER_LITERAL.STRING_UNKNOWN}`;
}

function buildTypelessCdcDeliverySource(message) {
  const tableName = normalizeIdentifier(message?.tableName)?.toLowerCase();
  const operation = normalizeIdentifier(message?.operation)?.toLowerCase();
  if (tableName && operation) {
    return `cdc:${operation}:${tableName}`;
  }
  const events = Array.isArray(message?.events) ? message.events : [];
  if (events.length === TRANSPORT_NUM.ZERO) {
    return null;
  }
  const distinctTableNames = [
    ...new Set(
      events
        .map((event) => normalizeIdentifier(event?.tableName)?.toLowerCase())
        .filter(Boolean),
    ),
  ];
  if (distinctTableNames.length === TRANSPORT_NUM.ONE) {
    return `cdc_batch:${distinctTableNames[TRANSPORT_NUM.ZERO]}:${events.length}`;
  }
  if (distinctTableNames.length > TRANSPORT_NUM.ONE) {
    return `cdc_batch:mixed:${events.length}`;
  }
  return MESSAGE_ROUTER_LITERAL.STRING_CDC_BATCH;
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

export {
  CONNECTION_CLOSE_DISPOSITION,
  ConnectionState,
  DELIVERY_SOURCE_MESSAGE_UNWRAP_LIMIT,
  EMPTY_DELIVERY_SOURCE,
  EMPTY_ROUTER_REASON,
  INLINE_ACK_PASSTHROUGH_KEYS,
  INLINE_ACK_RESULT_FIELD,
  INPROC,
  IPV6_ANY_HOST,
  IPV6_HOST_PREFIX,
  IPV6_HOST_SUFFIX,
  InProcWebSocket,
  LOCAL_NUM_ONE,
  LOCAL_NUM_ZERO,
  MESSAGE_ROUTER_LITERAL,
  OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE,
  OUTBOUND_QUEUE_BACKPRESSURE_SCOPE,
  OUTBOUND_QUEUE_PENDING_SOURCE_LIMIT_DIVISOR,
  OUTBOUND_QUEUE_PENDING_SOURCE_LIMIT_MINIMUM,
  OUTBOUND_QUEUE_PENDING_SOURCE_LIMIT_STATE,
  OUTBOUND_QUEUE_PENDING_SOURCE_LIMIT_STATE_TABLE,
  OUTBOUND_QUEUE_TARGET_FALLBACK_IN_FLIGHT_SOURCE_LIMIT_DIVISOR,
  OUTBOUND_QUEUE_TARGET_FALLBACK_PENDING_SOURCE_LIMIT_DIVISOR,
  OutboundDeliveryPriority,
  QUERY_DATA_PLANE_MESSAGE_TYPE,
  QUERY_TRANSPORT_DELIVERY_STATE,
  QUERY_TRANSPORT_SELECTION,
  QUEUE_WAIT_BUCKETS,
  QUEUE_WAIT_BUCKET_OVERFLOW,
  RECONNECT_ADDRESS_SUPPRESSION_DEFAULT_MS,
  RECONNECT_DISPOSITION,
  RETIRED_PENDING_RESPONSE_REASON,
  ROUTER_CONNECTION_CLOSED_ERROR_CODE,
  ROUTER_MESSAGE_TIMEOUT_ERROR_CODE,
  ROUTER_NO_CONNECTION_ERROR_CODE,
  RouterMessageType,
  SERVICE_RESPONSE_DISPOSITION_KIND,
  TRANSPORT_PRESSURE_SUMMARY_FIELD,
  UNMATCHED_SERVICE_RESPONSE_WARN_INTERVAL_MS,
  WEBSOCKET_CONNECT_TIMEOUT_CONFIG_KEY,
  WEBSOCKET_CONNECT_TIMEOUT_ERROR_CODE,
  buildQueueWaitSummary,
  buildTypelessCdcDeliverySource,
  buildTypelessQueryDeliverySource,
  createInProcWebSocketPair,
  createQueueWaitHistogram,
  extractSqlOperationKind,
  extractSqlTableName,
  isSupersedableHeartbeatNodeStateUpdate,
  isSupersedableRaftAppendFail,
  isSupersedableRaftHeartbeatAppend,
  normalizeIdentifier,
  queueMicrotaskFn,
  recordQueueWaitDuration,
  resolveNodeStateUpdateReplacementNodeId,
  resolveOperationIdFromMessage,
  resolvePendingReplacementKey,
  resolveQueueWaitBucket,
  resolveRequestIdFromMessage,
  summarizeRaftAppendCommand,
};
