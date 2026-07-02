import {NUM} from '../constants/index.js';
import {ControlPlaneMessageType} from '../control-plane/control-plane-constants.js';
import {
  CRITICAL_TRANSPORT_TARGET_REASON,
  resolveCriticalTransportTargetSnapshot,
} from '../bootstrap/system-partition-classification.js';

const MESSAGE_GROUP_SERVICE_LITERAL = Object.freeze({
  VALUE: '',
  VALUE_2: '/',
  CRITICAL: 'critical',
  VALUE_250: 250,
  VALUE_25: 25,
  FAILED_TO_FLUSH_DEFERRED_MESSAGE_GROUP_ROLE_UPDATE:
    'Failed to flush deferred message-group role update',
  FAILED_TO_FLUSH_DEFERRED_MESSAGE_GROUP_LEADER_UPDATE:
    'Failed to flush deferred message-group leader update',
  BACKGROUND: 'background',
  PEER_ADDRESS_MUST_BE_IN_UNIFIED_FORMAT:
    'Peer address must be in unified format',
  USING_BOOTSTRAP_PEER_HINT_BECAUSE_SERVICES_CACHE_HAS_NO_PEER_LOCATION:
    'Using bootstrap peer hint because services cache has no peer location',
  BOOTSTRAP_HINT: 'bootstrap_hint',
  INITIALIZING_MESSAGE_GROUP_SERVICE: 'Initializing message group service',
  DEFERRING_ELECTION_START: 'Deferring election start',
  HEARTBEAT_ELECTION: 'heartbeat, election',
  CLEARED_LIFERAFT_TIMERS_FOR_DEFERRED_ELECTION:
    'Cleared liferaft timers for deferred election',
  FAILED_DURING_INITIALIZE_CLEANING_UP_RAFT:
    'Failed during initialize, cleaning up raft',
  MESSAGE_GROUP_SERVICE_INITIALIZED: 'Message group service initialized',
  INITIALIZED: 'initialized',
  LEADER_CHANGED: 'Leader changed',
  SINGLE_REPLICA_BECOMING_LEADER_IMMEDIATELY:
    'Single replica - becoming leader immediately',
  LEADERELECTED: 'leaderElected',
  STARTING_RAFT_ELECTION_TIMER: 'Starting Raft election timer',
  APPLIED_RUNTIME_RAFT_TIMING_CONFIGURATION:
    'Applied runtime raft timing configuration',
  TICKINTERVALMS: 'tickIntervalMs',
  MESSAGE: 'MESSAGE',
  CDC: 'CDC',
  CDCAPPLIED: 'cdcApplied',
  ACK: 'ACK',
  MESSAGEGROUPSERVICE_NOT_INITIALIZED: 'MessageGroupService not initialized',
  SENDING_MESSAGE: 'Sending message',
  MESSAGE_DELIVERED_DIRECTLY: 'Message delivered directly',
  DIRECT: 'direct',
  MESSAGE_PERSISTED_TO_RAFT_LOG_DELIVERY_FAILED:
    'Message persisted to Raft log (delivery failed)',
  PERSISTED: 'persisted',
  FAILED_TO_SEND_MESSAGE: 'Failed to send message',
  WEBSOCKET_TRANSPORT_NOT_AVAILABLE_FOR_MESSAGE_DELIVERY:
    'WebSocket transport not available for message delivery',
  WEBSOCKET_TRANSPORT_REQUIRED_BUT_NOT_AVAILABLE:
    'WebSocket transport required but not available',
  MESSAGE_DELIVERY_DEFERRED: 'Message delivery deferred',
  MESSAGE_DELIVERY_NOT_ACKNOWLEDGED: 'Message delivery not acknowledged',
  DELIVERY_ATTEMPT_FAILED: 'Delivery attempt failed',
  MAX_RETRIES_EXCEEDED: 'Max retries exceeded',
  RAFT_COMMAND_FAILED: 'Raft command failed',
  RECEIVED_RAFT_PACKET: 'Received Raft packet',
  DATA: 'data',
  RECEIVED_APPLICATION_MESSAGE: 'Received application message',
  DUPLICATE_MESSAGE_IGNORED: 'Duplicate message ignored',
  INVALID_HLC_TIMESTAMP_IN_MESSAGE_IGNORING:
    'Invalid HLC timestamp in message, ignoring',
  MESSAGERECEIVED: 'messageReceived',
  ERROR_PROCESSING_RECEIVED_MESSAGE: 'Error processing received message',
  ACKNOWLEDGING_MESSAGE: 'Acknowledging message',
  MESSAGEACKNOWLEDGED: 'messageAcknowledged',
  SUBSCRIBED_TO_CDC: 'Subscribed to CDC',
  CDC_EVENT_PROPOSED_FOR_REPLICATION_AWAITING_COMMIT_APPLY:
    'CDC event proposed for replication; awaiting commit apply',
  BATCH: 'batch',
  RETRYING_RAFT_CDC_COMMAND: 'Retrying Raft CDC command',
  RAFT_CDC_COMMAND_FAILED: 'Raft CDC command failed',
  UNKNOWN_ERROR: 'unknown error',
  FAILED_TO_PERSIST_ROLE_UPDATE_AFTER_CDC_SERVICE_SET:
    'Failed to persist role update after CDC service set',
  FAILED_TO_PERSIST_LEADER_UPDATE_AFTER_CDC_SERVICE_SET:
    'Failed to persist leader update after CDC service set',
  BECAME_LEADER: 'Became leader',
  SHUTTING_DOWN_MESSAGE_GROUP_SERVICE: 'Shutting down message group service',
  SHUTDOWN: 'shutdown',
});

const ROLE_PERSIST_ERROR_MSG = 'Failed to persist raft role update';
const LEADER_NODE_PERSIST_ERROR_MSG =
  'Failed to persist message group leader update';
const FLUSH_SKIP_NOT_OWNER = 'not-owner';
const FLUSH_SKIP_READY = 'ready';
const FLUSH_SKIP_DISABLED = 'disabled';
const FORWARD_TOPOLOGY_REPAIR_DEFAULT = Object.freeze({
  COOLDOWN_MS: 1000,
  FAILURE_COOLDOWN_MS: 5000,
  NO_CHANGE_COOLDOWN_MS: 2000,
  QUERY_TIMEOUT_MS: 1500,
});
const CDC_FORWARD_MAX_RELAY_DEPTH = 2;
const CDC_FORWARD_ERROR_DETAIL_MAX_LENGTH = NUM.TWO_HUNDRED_FIFTY_SIX;
const CDC_FORWARD_ERROR_TRUNCATION_SUFFIX = '...[truncated]';
const CDC_BATCH_COMMAND_TYPE = 'CDC_BATCH';
const DIRECT_ONLY_MESSAGE_TYPES = new Set([
  ...Object.values(ControlPlaneMessageType),
]);
const MESSAGE_DELIVERY_MODE = Object.freeze({
  AUTO: 'auto',
  DIRECT_ONLY: 'direct_only',
  DIRECT_WITH_RAFT_DURABILITY: 'direct_with_raft_durability',
});
const MESSAGE_GROUP_DELIVERY_SOURCE_UNWRAP_LIMIT = NUM.FOUR;
const MESSAGE_GROUP_DELIVERY_SOURCE_PREFIX = 'message-group';

function normalizeDeliverySourceSegment(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function resolveRouterSemanticPayload(payload) {
  let semanticPayload = payload;
  let unwrapCount = 0;
  while (
    semanticPayload &&
    typeof semanticPayload === 'object' &&
    unwrapCount < MESSAGE_GROUP_DELIVERY_SOURCE_UNWRAP_LIMIT
  ) {
    if (normalizeDeliverySourceSegment(semanticPayload.type)) {
      return semanticPayload;
    }
    const nestedPayload = semanticPayload.payload;
    if (
      !nestedPayload ||
      typeof nestedPayload !== 'object' ||
      nestedPayload === semanticPayload
    ) {
      return semanticPayload;
    }
    semanticPayload = nestedPayload;
    unwrapCount += 1;
  }
  return semanticPayload;
}

function hasRouterVisibleDeliverySource(payload) {
  const semanticPayload = resolveRouterSemanticPayload(payload);
  if (!semanticPayload || typeof semanticPayload !== 'object') {
    return false;
  }
  if (normalizeDeliverySourceSegment(semanticPayload.type)) {
    return true;
  }
  if (normalizeDeliverySourceSegment(semanticPayload.sql)) {
    return true;
  }
  if (
    normalizeDeliverySourceSegment(semanticPayload.tableName) &&
    normalizeDeliverySourceSegment(semanticPayload.operation)
  ) {
    return true;
  }
  const events = Array.isArray(semanticPayload.events) ?
    semanticPayload.events :
    [];
  return events.length > 0;
}

function buildMessageGroupDeliverySource(targetSnapshot, sourceContext = {}) {
  const partitionId = normalizeDeliverySourceSegment(
    targetSnapshot?.partitionId,
  );
  const sourceGroup = normalizeDeliverySourceSegment(
    sourceContext?.sourceGroup,
  );
  const sourceReplica = normalizeDeliverySourceSegment(
    sourceContext?.sourceReplica,
  );
  const sender = sourceReplica || sourceGroup;
  if (!partitionId || !sender) {
    return null;
  }
  const group = sourceGroup || sender;
  return `${MESSAGE_GROUP_DELIVERY_SOURCE_PREFIX}:${group}:${sender}:target:${partitionId}`;
}

function shouldSynthesizeMessageGroupDeliverySource(
  targetSnapshot,
  overrides = null,
  sourceContext = {},
) {
  if (normalizeDeliverySourceSegment(overrides?.deliverySource)) {
    return false;
  }
  if (
    targetSnapshot?.reasonCode !==
    CRITICAL_TRANSPORT_TARGET_REASON.CRITICAL_CONTROL_PLANE_PARTITION
  ) {
    return false;
  }
  return !hasRouterVisibleDeliverySource(sourceContext?.payload);
}

function shouldDeferImmediateDeliveryRetry(result) {
  return Boolean(
    result &&
    typeof result === 'object' &&
    result.deferRetry === true &&
    Number.isFinite(result.retryAfterMs) &&
    result.retryAfterMs > 0,
  );
}

function buildDeferredDeliveryError(deliveryResult) {
  const error = new Error(deliveryResult?.error || 'Message delivery deferred');
  if (
    typeof deliveryResult?.errorCode === 'string' &&
    deliveryResult.errorCode.length > 0
  ) {
    error.code = deliveryResult.errorCode;
  }
  if (deliveryResult?.deferRetry === true) {
    error.deferRetry = true;
  }
  if (Number.isFinite(deliveryResult?.retryAfterMs)) {
    error.retryAfterMs = Math.max(
      0,
      Math.floor(deliveryResult.retryAfterMs),
    );
  }
  return error;
}

function buildDeferredCdcForwardError(message, retryAfterMs = 0) {
  const error = new Error(message);
  error.retryable = false;
  error.deferRetry = true;
  error.retryAfterMs = Math.max(1, Math.floor(retryAfterMs || 0));
  return error;
}

/**
 * Check if transport is WebSocket-based (MessageRouter).
 * Detection is done via duck typing:
 * - MessageRouter has: deliver(), initialize(), setServiceNodeResolver()
 * @param {Object} transport - Transport to validate.
 * @return {boolean} True if transport is WebSocket-based.
 */
function isWebSocketBasedMessageRouterTransport(transport) {
  if (!transport) {
    return false;
  }
  const hasDeliver = typeof transport.deliver === 'function';
  const hasInitialize = typeof transport.initialize === 'function';
  const isMessageRouter =
    typeof transport.setServiceNodeResolver === 'function';
  return hasDeliver && hasInitialize && isMessageRouter;
}

function wrapCdcProposeError(message, error) {
  const wrappedError = new Error(message);
  if (error?.deferRetry === true) {
    wrappedError.deferRetry = true;
  }
  if (Number.isFinite(error?.retryAfterMs) && error.retryAfterMs > 0) {
    wrappedError.retryAfterMs = Math.max(
      1,
      Math.floor(error.retryAfterMs),
    );
  }
  if (typeof error?.code === 'string' && error.code.length > 0) {
    wrappedError.code = error.code;
  }
  if (error?.retryable === false) {
    wrappedError.retryable = false;
  }
  return wrappedError;
}

/**
 * Truncate a nested error detail string to prevent unbounded error
 * message growth across CDC forward retry cycles.
 * @param {string} detail - Error detail to bound.
 * @return {string} Bounded detail string.
 */
function boundCdcForwardErrorDetail(detail) {
  if (
    typeof detail !== 'string' ||
    detail.length <= CDC_FORWARD_ERROR_DETAIL_MAX_LENGTH
  ) {
    return detail || MESSAGE_GROUP_SERVICE_LITERAL.VALUE;
  }
  return (
    detail.substring(0, CDC_FORWARD_ERROR_DETAIL_MAX_LENGTH) +
    CDC_FORWARD_ERROR_TRUNCATION_SUFFIX
  );
}

function resolveTransportDeliveryOptions(
  targetService,
  overrides = null,
  sourceContext = {},
) {
  const targetSnapshot = resolveCriticalTransportTargetSnapshot({
    targetAddress: targetService,
  });
  const baseOptions = targetSnapshot.criticalTransport === true ?
    {deliveryPriority: MESSAGE_GROUP_SERVICE_LITERAL.CRITICAL} :
    {};
  if (Number.isFinite(overrides?.timeoutMs) && overrides.timeoutMs > 0) {
    baseOptions.timeoutMs = Math.floor(overrides.timeoutMs);
  }
  if (
    typeof overrides?.deliveryPriority === 'string' &&
    overrides.deliveryPriority.length > 0
  ) {
    baseOptions.deliveryPriority = overrides.deliveryPriority;
  }
  if (
    typeof overrides?.deliverySource === 'string' &&
    overrides.deliverySource.length > 0
  ) {
    baseOptions.deliverySource = overrides.deliverySource;
  } else if (
    shouldSynthesizeMessageGroupDeliverySource(
      targetSnapshot,
      overrides,
      sourceContext,
    )
  ) {
    const deliverySource = buildMessageGroupDeliverySource(
      targetSnapshot,
      sourceContext,
    );
    if (deliverySource) {
      baseOptions.deliverySource = deliverySource;
    }
  }
  return Object.keys(baseOptions).length > 0 ? baseOptions : undefined;
}

function normalizeMessageDeliveryMode(deliveryMode) {
  if (deliveryMode === MESSAGE_DELIVERY_MODE.DIRECT_ONLY) {
    return MESSAGE_DELIVERY_MODE.DIRECT_ONLY;
  }
  if (deliveryMode === MESSAGE_DELIVERY_MODE.DIRECT_WITH_RAFT_DURABILITY) {
    return MESSAGE_DELIVERY_MODE.DIRECT_WITH_RAFT_DURABILITY;
  }
  return MESSAGE_DELIVERY_MODE.AUTO;
}

function buildLatencyCdcPropagationResult({
  messageId,
  status,
  acknowledged = true,
  success,
  error,
  deferRetry,
  retryAfterMs,
  tableName,
  operation,
  eventCount,
}) {
  const result = {
    messageId,
    status,
    acknowledged,
  };
  if (typeof success === 'boolean') {
    result.success = success;
  }
  if (typeof error === 'string' && error.length > 0) {
    result.error = error;
  }
  if (deferRetry === true) {
    result.deferRetry = true;
  }
  if (Number.isFinite(retryAfterMs)) {
    result.retryAfterMs = retryAfterMs;
  }
  if (typeof tableName === 'string' && tableName.length > 0) {
    result.tableName = tableName;
  }
  if (typeof operation === 'string' && operation.length > 0) {
    result.operation = operation;
  }
  if (Number.isInteger(eventCount) && eventCount >= 0) {
    result.eventCount = eventCount;
  }
  return result;
}

export {
  CDC_BATCH_COMMAND_TYPE,
  CDC_FORWARD_MAX_RELAY_DEPTH,
  DIRECT_ONLY_MESSAGE_TYPES,
  FLUSH_SKIP_DISABLED,
  FLUSH_SKIP_NOT_OWNER,
  FLUSH_SKIP_READY,
  FORWARD_TOPOLOGY_REPAIR_DEFAULT,
  LEADER_NODE_PERSIST_ERROR_MSG,
  MESSAGE_DELIVERY_MODE,
  MESSAGE_GROUP_SERVICE_LITERAL,
  ROLE_PERSIST_ERROR_MSG,
  boundCdcForwardErrorDetail,
  buildDeferredCdcForwardError,
  buildDeferredDeliveryError,
  buildLatencyCdcPropagationResult,
  isWebSocketBasedMessageRouterTransport,
  normalizeMessageDeliveryMode,
  resolveTransportDeliveryOptions,
  shouldDeferImmediateDeliveryRetry,
  wrapCdcProposeError,
};
