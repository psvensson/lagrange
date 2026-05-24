import {NUM, TYPEOF} from '../constants/index.js';
import {ControlPlaneMessageType} from '../control-plane/control-plane-constants.js';
import {isCriticalTransportTargetAddress} from '../bootstrap/system-partition-classification.js';

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
const CDC_FORWARD_MAX_RELAY_DEPTH = NUM.TWO;
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

function shouldDeferImmediateDeliveryRetry(result) {
  return Boolean(
    result &&
    typeof result === TYPEOF.OBJECT &&
    result.deferRetry === true &&
    Number.isFinite(result.retryAfterMs) &&
    result.retryAfterMs > NUM.ZERO,
  );
}

function buildDeferredDeliveryError(deliveryResult) {
  const error = new Error(deliveryResult?.error || 'Message delivery deferred');
  if (
    typeof deliveryResult?.errorCode === TYPEOF.STRING &&
    deliveryResult.errorCode.length > NUM.ZERO
  ) {
    error.code = deliveryResult.errorCode;
  }
  if (deliveryResult?.deferRetry === true) {
    error.deferRetry = true;
  }
  if (Number.isFinite(deliveryResult?.retryAfterMs)) {
    error.retryAfterMs = Math.max(
      NUM.ZERO,
      Math.floor(deliveryResult.retryAfterMs),
    );
  }
  return error;
}

function buildDeferredCdcForwardError(message, retryAfterMs = NUM.ZERO) {
  const error = new Error(message);
  error.retryable = false;
  error.deferRetry = true;
  error.retryAfterMs = Math.max(NUM.ONE, Math.floor(retryAfterMs || NUM.ZERO));
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
  const hasDeliver = typeof transport.deliver === TYPEOF.FUNCTION;
  const hasInitialize = typeof transport.initialize === TYPEOF.FUNCTION;
  const isMessageRouter =
    typeof transport.setServiceNodeResolver === TYPEOF.FUNCTION;
  return hasDeliver && hasInitialize && isMessageRouter;
}

function wrapCdcProposeError(message, error) {
  const wrappedError = new Error(message);
  if (error?.deferRetry === true) {
    wrappedError.deferRetry = true;
  }
  if (Number.isFinite(error?.retryAfterMs) && error.retryAfterMs > NUM.ZERO) {
    wrappedError.retryAfterMs = Math.max(
      NUM.ONE,
      Math.floor(error.retryAfterMs),
    );
  }
  if (typeof error?.code === TYPEOF.STRING && error.code.length > NUM.ZERO) {
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
    typeof detail !== TYPEOF.STRING ||
    detail.length <= CDC_FORWARD_ERROR_DETAIL_MAX_LENGTH
  ) {
    return detail || MESSAGE_GROUP_SERVICE_LITERAL.VALUE;
  }
  return (
    detail.substring(NUM.ZERO, CDC_FORWARD_ERROR_DETAIL_MAX_LENGTH) +
    CDC_FORWARD_ERROR_TRUNCATION_SUFFIX
  );
}

function resolveTransportDeliveryOptions(targetService, overrides = null) {
  const baseOptions = isCriticalTransportTargetAddress({
    targetAddress: targetService,
  }) ?
    {deliveryPriority: MESSAGE_GROUP_SERVICE_LITERAL.CRITICAL} :
    {};
  if (Number.isFinite(overrides?.timeoutMs) && overrides.timeoutMs > NUM.ZERO) {
    baseOptions.timeoutMs = Math.floor(overrides.timeoutMs);
  }
  if (
    typeof overrides?.deliveryPriority === TYPEOF.STRING &&
    overrides.deliveryPriority.length > NUM.ZERO
  ) {
    baseOptions.deliveryPriority = overrides.deliveryPriority;
  }
  if (
    typeof overrides?.deliverySource === TYPEOF.STRING &&
    overrides.deliverySource.length > NUM.ZERO
  ) {
    baseOptions.deliverySource = overrides.deliverySource;
  }
  return Object.keys(baseOptions).length > NUM.ZERO ? baseOptions : undefined;
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
  if (typeof success === TYPEOF.BOOLEAN) {
    result.success = success;
  }
  if (typeof error === TYPEOF.STRING && error.length > NUM.ZERO) {
    result.error = error;
  }
  if (deferRetry === true) {
    result.deferRetry = true;
  }
  if (Number.isFinite(retryAfterMs)) {
    result.retryAfterMs = retryAfterMs;
  }
  if (typeof tableName === TYPEOF.STRING && tableName.length > NUM.ZERO) {
    result.tableName = tableName;
  }
  if (typeof operation === TYPEOF.STRING && operation.length > NUM.ZERO) {
    result.operation = operation;
  }
  if (Number.isInteger(eventCount) && eventCount >= NUM.ZERO) {
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
