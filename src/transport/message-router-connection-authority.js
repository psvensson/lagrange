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
import {isRaftPacket} from '../raft/raft-packet-utils.js';
import {
  ROUTER_QUERY_TRANSPORT_NOT_READY_ERROR_CODE,
  TRANSPORT_DELIVERY_OUTCOME_METADATA_FIELDS,
  buildTransportDeliveryOutcome,
  buildQueryTransportSemanticOutcome,
} from './transport-semantic-outcome.js';
import {CONNECTION_CLOSE_DISPOSITION, ConnectionState, EMPTY_ROUTER_REASON, INLINE_ACK_PASSTHROUGH_KEYS, INLINE_ACK_RESULT_FIELD, INPROC, IPV6_ANY_HOST, IPV6_HOST_PREFIX, IPV6_HOST_SUFFIX, InProcWebSocket, MESSAGE_ROUTER_LITERAL, OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE, OUTBOUND_QUEUE_BACKPRESSURE_SCOPE, OUTBOUND_QUEUE_PENDING_SOURCE_LIMIT_DIVISOR, OUTBOUND_QUEUE_PENDING_SOURCE_LIMIT_MINIMUM, OutboundDeliveryPriority, QUERY_DATA_PLANE_MESSAGE_TYPE, QUERY_TRANSPORT_DELIVERY_STATE, QUERY_TRANSPORT_SELECTION, QUEUE_WAIT_BUCKETS, QUEUE_WAIT_BUCKET_OVERFLOW, RECONNECT_ADDRESS_SUPPRESSION_DEFAULT_MS, RECONNECT_DISPOSITION, RETIRED_PENDING_RESPONSE_REASON, ROUTER_CONNECTION_CLOSED_ERROR_CODE, ROUTER_MESSAGE_TIMEOUT_ERROR_CODE, ROUTER_NO_CONNECTION_ERROR_CODE, RouterMessageType, SERVICE_RESPONSE_DISPOSITION_KIND, TRANSPORT_PRESSURE_SUMMARY_FIELD, UNMATCHED_SERVICE_RESPONSE_WARN_INTERVAL_MS, WEBSOCKET_CONNECT_TIMEOUT_CONFIG_KEY, WEBSOCKET_CONNECT_TIMEOUT_ERROR_CODE, buildQueueWaitSummary, createInProcWebSocketPair, createQueueWaitHistogram, extractSqlOperationKind, extractSqlTableName, isSupersedableHeartbeatNodeStateUpdate, isSupersedableRaftAppendFail, isSupersedableRaftHeartbeatAppend, normalizeIdentifier, queueMicrotaskFn, recordQueueWaitDuration, resolveNodeStateUpdateReplacementNodeId, resolveOperationIdFromMessage, resolvePendingReplacementKey, resolveQueueWaitBucket, resolveRequestIdFromMessage, summarizeRaftAppendCommand} from './message-router-shared-vocabulary.js';
import {adjustInFlightPriorityCount, buildDerivedDeliverySource, buildPendingSourceSummary, buildRetiredPendingClassification, buildServiceResponseDisposition, buildSupersededPendingResult, canDispatchPendingItem, countInFlightByPriority, countInFlightReadinessReserve, countPendingByPriority, countPendingBySource, dequeueNextPendingItem, normalizeDeliveryOutcome, normalizeOutboundDeliveryPriority, normalizeRetryAfterMs, peekNextPendingItem, resolveBackgroundInFlightLimit, resolveBackgroundPendingLimit, resolveBoundedCriticalReserve, resolveDeliverySource, resolveNextPendingItemIndex, resolvePendingSourceLimit, resolveReadinessReserveInFlightLimit} from './message-router-outbound-queue-admission.js';
import {INCOMING_CONNECTION_ADOPTION, OutboundDeliveryRegistryOwner} from './message-router-outbound-delivery-registry.js';

const RECONNECT_ADDRESS_SOURCE = Object.freeze({
  CANONICAL: 'canonical',
  CONFIGURED: 'configured',
  CURRENT: 'current',
  PREFERRED: 'preferred',
  OBSERVED: 'observed',
});

const WEBSOCKET_CONNECTION_TIMEOUT_MESSAGE =
  'WebSocket connection timeout';

const WEBSOCKET_CLOSED_BEFORE_CONNECTION_ESTABLISHED_MESSAGE =
  'WebSocket was closed before the connection was established';

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
      state: shouldAdoptIncomingConnection ?
        INCOMING_CONNECTION_ADOPTION.ADOPT_INCOMING :
        INCOMING_CONNECTION_ADOPTION.KEEP_EXISTING,
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
        resolved.length > TRANSPORT_NUM.ZERO ?
        resolved :
        null;
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
      normalizedFallback.length > TRANSPORT_NUM.ZERO ?
      normalizedFallback :
      null;
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
      this.router.reconnectAddressSuppressionMs > TRANSPORT_NUM.ZERO ?
        this.router.reconnectAddressSuppressionMs :
        TRANSPORT_NUM.ZERO;
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
    if (error?.code === WEBSOCKET_CONNECT_TIMEOUT_ERROR_CODE) {
      return true;
    }
    const errorMessage = error?.message || null;
    if (
      typeof errorMessage !== TRANSPORT_TYPEOF.STRING ||
      errorMessage.length === TRANSPORT_NUM.ZERO
    ) {
      return false;
    }
    return (
      errorMessage.includes(MESSAGE_ROUTER_LITERAL.STRING_ENOTFOUND) ||
      errorMessage.includes(MESSAGE_ROUTER_LITERAL.STRING_EAI_AGAIN) ||
      errorMessage.includes(WEBSOCKET_CONNECTION_TIMEOUT_MESSAGE) ||
      errorMessage.includes(
        MESSAGE_ROUTER_LITERAL
          .STRING_WEBSOCKET_CONNECTION_CLOSED_BEFORE_OPEN_FOR_NODE,
      ) ||
      errorMessage.includes(
        WEBSOCKET_CLOSED_BEFORE_CONNECTION_ESTABLISHED_MESSAGE,
      )
    );
  }
  normalizeReconnectCandidateAddress(candidate) {
    return normalizeToWebSocketAddress(candidate) || candidate;
  }
  resolveReconnectAddressCandidates(targetNodeId, preferredAddress = null) {
    const candidates = [];
    const candidatesByAddress = new Map();
    const pushUniqueCandidate = (candidate, source) => {
      const address = this.normalizeReconnectCandidateAddress(candidate);
      if (
        typeof address !== TRANSPORT_TYPEOF.STRING ||
        address.length === TRANSPORT_NUM.ZERO ||
        this.isReconnectAddressSuppressed(targetNodeId, address)
      ) {
        return;
      }
      const existingCandidate = candidatesByAddress.get(address);
      if (existingCandidate) {
        if (!existingCandidate.candidateSources.includes(source)) {
          existingCandidate.candidateSources.push(source);
        }
        return;
      }
      const reconnectCandidate = {
        address,
        candidateSource: source,
        candidateSources: [source],
      };
      candidatesByAddress.set(address, reconnectCandidate);
      candidates.push(reconnectCandidate);
    };
    const existing = this.router.nodeConnections.get(targetNodeId) || null;
    const canonicalAddress = existing ?
      this.refreshReconnectAuthority(existing, preferredAddress) :
      this.resolveCanonicalReconnectAddress(targetNodeId, preferredAddress);
    pushUniqueCandidate(canonicalAddress, RECONNECT_ADDRESS_SOURCE.CANONICAL);
    pushUniqueCandidate(
      existing?.configuredAddress,
      RECONNECT_ADDRESS_SOURCE.CONFIGURED,
    );
    pushUniqueCandidate(
      existing?.address,
      RECONNECT_ADDRESS_SOURCE.CURRENT,
    );
    pushUniqueCandidate(
      preferredAddress,
      RECONNECT_ADDRESS_SOURCE.PREFERRED,
    );
    pushUniqueCandidate(
      existing?.observedAddress,
      RECONNECT_ADDRESS_SOURCE.OBSERVED,
    );
    return candidates;
  }
  resolveReconnectAddresses(targetNodeId, preferredAddress = null) {
    return this.resolveReconnectAddressCandidates(
      targetNodeId,
      preferredAddress,
    ).map((candidate) => candidate.address);
  }
}

const MESSAGE_ROUTER_SHARED = {
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
  countInFlightReadinessReserve,
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
  resolveReadinessReserveInFlightLimit,
  resolveRequestIdFromMessage,
  summarizeRaftAppendCommand,
  uuidv4,
};

export {
  MESSAGE_ROUTER_SHARED,
  RouterConnectionAuthorityOwner,
};
