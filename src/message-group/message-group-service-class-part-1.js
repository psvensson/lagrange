/**
 * Message Group Service - Reliable inter-service communication.
 * Implements 3-replica Raft groups using liferaft library for consensus.
 * Requirements: 1.4, 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.4, 6.5
 */
import { EventEmitter } from "events";
import { v4 as uuidv4 } from "uuid";
import LifeRaft from "../raft/liferaft.js";
import {
  ADDRESS,
  COLUMN,
  ENTITY_TYPE,
  METRICS_LOG_TAG,
  NUM,
  SERVICE_STATUS,
  SERVICE_TYPE,
  STATE,
  STRING,
  TABLES,
  TIME_MS,
  TYPEOF,
} from "../constants/index.js";
import { ConfigurationManager } from "../config/configuration-manager.js";
import { CONFIG_KEY } from "../config/config-constants.js";
import { ControlPlaneMessageType } from "../control-plane/control-plane-constants.js";
import { CONTROL_PLANE_READINESS_DIMENSION } from "../control-plane/control-plane-readiness-constants.js";
import { CONTROL_PLANE_READ_STRATEGY } from "../control-plane/control-plane-system-table-gateway.js";
import { createControlPlaneRuntimeBundle } from "../control-plane/control-plane-runtime-bundle.js";
import { PRESSURE_WORK_CLASS } from "../control-plane/pressure-governor.js";
import { LoggingService } from "../logging/logging-service.js";
import { NodeService } from "../node/node-service.js";
import { HLCClockService } from "../hlc/hlc-clock-service.js";
import { HLCTimestamp } from "../hlc/hlc-timestamp.js";
import {
  INITIAL_MESSAGE_GROUP_ID,
  SYSTEM_TABLE_NAME,
} from "../bootstrap/system-table-schemas-constants.js";
import { isCriticalTransportTargetAddress } from "../bootstrap/system-partition-classification.js";
import {
  attachTrafficReadinessListener,
  isBackgroundWorkReady as isBackgroundWorkLifecycleReady,
  isMetadataPublicationReady as isMetadataPublicationLifecycleReady,
} from "../bootstrap/traffic-readiness-utils.js";
import { isSystemTableWriteReady } from "../cache/leader-readiness-gate.js";
import { InMemoryLogAdapter } from "../raft/in-memory-log-adapter.js";
import { isRaftPacket, RAFT_PACKET_TYPES } from "../raft/raft-packet-utils.js";
import {
  RAFT_ELECTION_TIMING,
  RAFT_EVENT,
  RAFT_PACKET_TYPE,
  resolveRaftTransportDeliveryOptions,
} from "../raft/constants.js";
import {
  applyRuntimeRaftTiming,
  computeReplicaElectionTimeouts,
} from "../raft/raft-timing-utils.js";
import { RaftGroup } from "../raft/raft-group.js";
import { LeaderActivationGate } from "../raft/leader-activation-gate.js";
import { LeaderActivationScheduler } from "../raft/leader-activation-scheduler.js";
import { assertRaftProviderContract } from "../raft/raft-provider-contract.js";
import { LiferaftProvider } from "../raft/liferaft-provider.js";
import { AuthoritativeRowMutationHelper } from "../raft/authoritative-row-mutation-helper.js";
import { wireReplicaLifecycleEvents } from "../raft/replica-leadership-state.js";
import { normalizePublishedRaftRole } from "../raft/published-raft-role.js";
import { AddressManager } from "../address/address-manager.js";
import { ReplicaStatus } from "../rebalancer/replica-status.js";
import {
  UnifiedRebalancer,
  EntityType as RebalancerEntityType,
} from "../rebalancer/unified-rebalancer.js";
import {
  MESSAGE_GROUP_APPLICATION_ERROR_MSG,
  MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE,
  MESSAGE_GROUP_APPLICATION_STATUS,
  MESSAGE_GROUP_CDC_ERROR_MSG,
  MESSAGE_GROUP_OPERATION_LEDGER_NOW,
  MESSAGE_GROUP_SERVICE_DEFAULT,
  MESSAGE_GROUP_SERVICE_ERROR_MSG,
  MESSAGE_GROUP_SERVICE_LOG_MSG,
  MESSAGE_GROUP_SUBSYSTEM,
  MESSAGE_STATUS as MessageStatus,
  RAFT_ROLE as RaftRole,
} from "./constants.js";
import { CDCHandler } from "./cdc-handler.js";
import {
  MESSAGE_GROUP_CDC_INGRESS_ACTION,
  MESSAGE_GROUP_CDC_LOG_CONTEXT_FIELD,
  MessageGroupForwardingOwner,
} from "./message-group-forwarding-owner.js";
import { createMessageGroupServiceRuntimeMethods } from "./message-group-service-runtime-methods.js";
import { getOrCreateCauseId, normalizeCauseId } from "../utils/cause-id.js";
import { MessageGroupOperationLedger } from "./message-group-operation-ledger.js";
import { QUERY_MESSAGE_TYPE } from "../query/query-constants.js";
import { assertCritical } from "../utils/assert.js";
// Note: isRaftPacket and RAFT_PACKET_TYPES are imported from shared module
// src/raft/raft-packet-utils.js - Requirements: 9.1, 9.2, 9.3, 9.4
const MESSAGE_GROUP_SERVICE_LITERAL = Object.freeze({
  VALUE: "",
  VALUE_2: "/",
  CRITICAL: "critical",
  VALUE_250: 250,
  VALUE_25: 25,
  FAILED_TO_FLUSH_DEFERRED_MESSAGE_GROUP_ROLE_UPDATE:
    "Failed to flush deferred message-group role update",
  FAILED_TO_FLUSH_DEFERRED_MESSAGE_GROUP_LEADER_UPDATE:
    "Failed to flush deferred message-group leader update",
  BACKGROUND: "background",
  PEER_ADDRESS_MUST_BE_IN_UNIFIED_FORMAT:
    "Peer address must be in unified format",
  USING_BOOTSTRAP_PEER_HINT_BECAUSE_SERVICES_CACHE_HAS_NO_PEER_LOCATION:
    "Using bootstrap peer hint because services cache has no peer location",
  BOOTSTRAP_HINT: "bootstrap_hint",
  INITIALIZING_MESSAGE_GROUP_SERVICE: "Initializing message group service",
  DEFERRING_ELECTION_START: "Deferring election start",
  HEARTBEAT_ELECTION: "heartbeat, election",
  CLEARED_LIFERAFT_TIMERS_FOR_DEFERRED_ELECTION:
    "Cleared liferaft timers for deferred election",
  FAILED_DURING_INITIALIZE_CLEANING_UP_RAFT:
    "Failed during initialize, cleaning up raft",
  MESSAGE_GROUP_SERVICE_INITIALIZED: "Message group service initialized",
  INITIALIZED: "initialized",
  LEADER_CHANGED: "Leader changed",
  SINGLE_REPLICA_BECOMING_LEADER_IMMEDIATELY:
    "Single replica - becoming leader immediately",
  LEADERELECTED: "leaderElected",
  STARTING_RAFT_ELECTION_TIMER: "Starting Raft election timer",
  APPLIED_RUNTIME_RAFT_TIMING_CONFIGURATION:
    "Applied runtime raft timing configuration",
  TICKINTERVALMS: "tickIntervalMs",
  MESSAGE: "MESSAGE",
  CDC: "CDC",
  CDCAPPLIED: "cdcApplied",
  ACK: "ACK",
  MESSAGEGROUPSERVICE_NOT_INITIALIZED: "MessageGroupService not initialized",
  SENDING_MESSAGE: "Sending message",
  MESSAGE_DELIVERED_DIRECTLY: "Message delivered directly",
  DIRECT: "direct",
  MESSAGE_PERSISTED_TO_RAFT_LOG_DELIVERY_FAILED:
    "Message persisted to Raft log (delivery failed)",
  PERSISTED: "persisted",
  FAILED_TO_SEND_MESSAGE: "Failed to send message",
  WEBSOCKET_TRANSPORT_NOT_AVAILABLE_FOR_MESSAGE_DELIVERY:
    "WebSocket transport not available for message delivery",
  WEBSOCKET_TRANSPORT_REQUIRED_BUT_NOT_AVAILABLE:
    "WebSocket transport required but not available",
  MESSAGE_DELIVERY_DEFERRED: "Message delivery deferred",
  MESSAGE_DELIVERY_NOT_ACKNOWLEDGED: "Message delivery not acknowledged",
  DELIVERY_ATTEMPT_FAILED: "Delivery attempt failed",
  MAX_RETRIES_EXCEEDED: "Max retries exceeded",
  RAFT_COMMAND_FAILED: "Raft command failed",
  RECEIVED_RAFT_PACKET: "Received Raft packet",
  DATA: "data",
  RECEIVED_APPLICATION_MESSAGE: "Received application message",
  DUPLICATE_MESSAGE_IGNORED: "Duplicate message ignored",
  INVALID_HLC_TIMESTAMP_IN_MESSAGE_IGNORING:
    "Invalid HLC timestamp in message, ignoring",
  MESSAGERECEIVED: "messageReceived",
  ERROR_PROCESSING_RECEIVED_MESSAGE: "Error processing received message",
  ACKNOWLEDGING_MESSAGE: "Acknowledging message",
  MESSAGEACKNOWLEDGED: "messageAcknowledged",
  SUBSCRIBED_TO_CDC: "Subscribed to CDC",
  CDC_EVENT_PROPOSED_FOR_REPLICATION_AWAITING_COMMIT_APPLY:
    "CDC event proposed for replication; awaiting commit apply",
  BATCH: "batch",
  RETRYING_RAFT_CDC_COMMAND: "Retrying Raft CDC command",
  RAFT_CDC_COMMAND_FAILED: "Raft CDC command failed",
  UNKNOWN_ERROR: "unknown error",
  FAILED_TO_PERSIST_ROLE_UPDATE_AFTER_CDC_SERVICE_SET:
    "Failed to persist role update after CDC service set",
  FAILED_TO_PERSIST_LEADER_UPDATE_AFTER_CDC_SERVICE_SET:
    "Failed to persist leader update after CDC service set",
  BECAME_LEADER: "Became leader",
  SHUTTING_DOWN_MESSAGE_GROUP_SERVICE: "Shutting down message group service",
  SHUTDOWN: "shutdown",
});
const ROLE_PERSIST_ERROR_MSG = "Failed to persist raft role update";
const LEADER_NODE_PERSIST_ERROR_MSG =
  "Failed to persist message group leader update";
const FLUSH_SKIP_NOT_OWNER = "not-owner";
const FLUSH_SKIP_READY = "ready";
const FLUSH_SKIP_DISABLED = "disabled";
const CDC_FORWARD_MAX_RELAY_DEPTH = NUM.TWO;
const CDC_FORWARD_ERROR_DETAIL_MAX_LENGTH = NUM.TWO_HUNDRED_FIFTY_SIX;
const CDC_FORWARD_ERROR_TRUNCATION_SUFFIX = "...[truncated]";
const CDC_BATCH_COMMAND_TYPE = "CDC_BATCH";
const FORWARD_TOPOLOGY_REPAIR_DEFAULT = Object.freeze({
  COOLDOWN_MS: 1000,
  FAILURE_COOLDOWN_MS: 5000,
  NO_CHANGE_COOLDOWN_MS: 2000,
  QUERY_TIMEOUT_MS: 1500,
});
const DIRECT_ONLY_MESSAGE_TYPES = new Set([
  ...Object.values(ControlPlaneMessageType),
]);
const MESSAGE_DELIVERY_MODE = Object.freeze({
  AUTO: "auto",
  DIRECT_ONLY: "direct_only",
  DIRECT_WITH_RAFT_DURABILITY: "direct_with_raft_durability",
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
  const error = new Error(deliveryResult?.error || "Message delivery deferred");
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
 * message growth across CDC forward retry cycles (doctrine §7).
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
  })
    ? { deliveryPriority: MESSAGE_GROUP_SERVICE_LITERAL.CRITICAL }
    : {};
  if (Number.isFinite(overrides?.timeoutMs) && overrides.timeoutMs > NUM.ZERO) {
    baseOptions.timeoutMs = Math.floor(overrides.timeoutMs);
  }
  if (
    typeof overrides?.deliveryPriority === TYPEOF.STRING &&
    overrides.deliveryPriority.length > NUM.ZERO
  ) {
    baseOptions.deliveryPriority = overrides.deliveryPriority;
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
/**
 * MessageGroupService provides reliable inter-service communication.
 * Implements a 3-replica Raft group using liferaft library.
 */
class MessageGroupServicePart1 extends EventEmitter {
  /**
   * Create a new MessageGroupService.
   * @param {Object} options - Configuration options.
   * @param {string} options.groupId - Message group ID.
   * @param {string} options.replicaId - This replica's ID.
   * @param {string} options.nodeId - Node ID hosting this replica.
   * @param {Array<string>} options.replicaIds - All replica IDs in the group.
   * @param {Object} options.transport - WebSocket-based transport for communication.
   */
  constructor(options = {}) {
    super();
    if (!options.groupId) {
      throw new Error(MESSAGE_GROUP_SERVICE_ERROR_MSG.MISSING_GROUP_ID);
    }
    if (!options.replicaId) {
      throw new Error(MESSAGE_GROUP_SERVICE_ERROR_MSG.MISSING_REPLICA_ID);
    }
    // Transport is now required - WebSocket transport is mandatory
    if (!options.transport) {
      throw new Error(MESSAGE_GROUP_SERVICE_ERROR_MSG.MISSING_TRANSPORT);
    }
    // Validate transport is WebSocket-based (MessageRouter)
    if (!this.isWebSocketBasedTransport(options.transport)) {
      throw new Error(MESSAGE_GROUP_SERVICE_ERROR_MSG.INVALID_TRANSPORT);
    }
    this.groupId = options.groupId;
    this.replicaId = options.replicaId;
    this.now =
      typeof options.now === TYPEOF.FUNCTION
        ? options.now
        : MESSAGE_GROUP_OPERATION_LEDGER_NOW;
    this.nodeId = options.nodeId || STRING.UNKNOWN;
    this.replicaIds = options.replicaIds || [this.replicaId];
    this.transport = options.transport;
    this.raftProvider = options.raftProvider || new LiferaftProvider();
    assertRaftProviderContract(this.raftProvider);
    // Peer addresses for cross-node communication
    // Map of replicaId -> unified address (e.g., 'nodeId/message-group/replicaId')
    // Used when joining an existing message group on a different node
    this.peerAddresses = options.peerAddresses || [];
    this.bootstrapHintFallbackLogged = new Set();
    // Get AddressManager instance for unified address operations
    // Requirements: 1.4
    this.addressManager = AddressManager.getInstance();
    // Unified address format: ${nodeId}/message-group/${replicaId}
    // Requirements: 1.1, 1.4, 5.1
    this.unifiedAddress = this.addressManager.format(
      this.nodeId,
      ENTITY_TYPE.MESSAGE_GROUP,
      this.replicaId,
    );
    // Configuration
    const config = ConfigurationManager.getInstance();
    this.deliveryTimeoutMs =
      config.get(CONFIG_KEY.MESSAGE_GROUP_DELIVERY_TIMEOUT_MS) ??
      MESSAGE_GROUP_SERVICE_DEFAULT.DELIVERY_TIMEOUT_MS;
    this.retryMaxAttempts =
      config.get(CONFIG_KEY.MESSAGE_GROUP_RETRY_MAX_ATTEMPTS) ??
      MESSAGE_GROUP_SERVICE_DEFAULT.RETRY_MAX_ATTEMPTS;
    this.retryInitialDelayMs =
      config.get(CONFIG_KEY.MESSAGE_GROUP_RETRY_INITIAL_DELAY_MS) ??
      MESSAGE_GROUP_SERVICE_DEFAULT.RETRY_INITIAL_DELAY_MS;
    this.retryBackoffMultiplier =
      config.get(CONFIG_KEY.MESSAGE_GROUP_RETRY_BACKOFF_MULTIPLIER) ??
      MESSAGE_GROUP_SERVICE_DEFAULT.RETRY_BACKOFF_MULTIPLIER;
    this.retryMaxDelayMs =
      config.get(CONFIG_KEY.MESSAGE_GROUP_RETRY_MAX_DELAY_MS) ??
      MESSAGE_GROUP_SERVICE_DEFAULT.RETRY_MAX_DELAY_MS;
    this.retryJitterFactor =
      config.get(CONFIG_KEY.MESSAGE_GROUP_RETRY_JITTER_FACTOR) ??
      MESSAGE_GROUP_SERVICE_DEFAULT.RETRY_JITTER_FACTOR;
    this.leaderActivationStabilizationMs =
      Number.isFinite(options.leaderActivationStabilizationMs) &&
      options.leaderActivationStabilizationMs >= NUM.ZERO
        ? Math.floor(options.leaderActivationStabilizationMs)
        : (config.get(CONFIG_KEY.RAFT_LEADER_ACTIVATION_STABILIZATION_MS) ??
          MESSAGE_GROUP_SERVICE_LITERAL.VALUE_250);
    this.leaderActivationNodeSpacingMs =
      Number.isFinite(options.leaderActivationNodeSpacingMs) &&
      options.leaderActivationNodeSpacingMs >= NUM.ZERO
        ? Math.floor(options.leaderActivationNodeSpacingMs)
        : (config.get(CONFIG_KEY.RAFT_LEADER_ACTIVATION_NODE_SPACING_MS) ??
          MESSAGE_GROUP_SERVICE_LITERAL.VALUE_25);
    this.forwardTargetSuppressionMs =
      Number.isFinite(options.forwardTargetSuppressionMs) &&
      options.forwardTargetSuppressionMs > NUM.ZERO
        ? Math.floor(options.forwardTargetSuppressionMs)
        : Math.min(this.retryMaxDelayMs, TIME_MS.SECOND * NUM.FIVE);
    this.forwardTopologyRepairCooldownMs =
      Number.isFinite(options.forwardTopologyRepairCooldownMs) &&
      options.forwardTopologyRepairCooldownMs > NUM.ZERO
        ? Math.floor(options.forwardTopologyRepairCooldownMs)
        : FORWARD_TOPOLOGY_REPAIR_DEFAULT.COOLDOWN_MS;
    this.forwardTopologyRepairFailureCooldownMs =
      Number.isFinite(options.forwardTopologyRepairFailureCooldownMs) &&
      options.forwardTopologyRepairFailureCooldownMs > NUM.ZERO
        ? Math.floor(options.forwardTopologyRepairFailureCooldownMs)
        : FORWARD_TOPOLOGY_REPAIR_DEFAULT.FAILURE_COOLDOWN_MS;
    this.forwardTopologyRepairNoChangeCooldownMs =
      Number.isFinite(options.forwardTopologyRepairNoChangeCooldownMs) &&
      options.forwardTopologyRepairNoChangeCooldownMs > NUM.ZERO
        ? Math.floor(options.forwardTopologyRepairNoChangeCooldownMs)
        : FORWARD_TOPOLOGY_REPAIR_DEFAULT.NO_CHANGE_COOLDOWN_MS;
    this.forwardTopologyRepairQueryTimeoutMs =
      Number.isFinite(options.forwardTopologyRepairQueryTimeoutMs) &&
      options.forwardTopologyRepairQueryTimeoutMs > NUM.ZERO
        ? Math.floor(options.forwardTopologyRepairQueryTimeoutMs)
        : FORWARD_TOPOLOGY_REPAIR_DEFAULT.QUERY_TIMEOUT_MS;
    // Raft state - using liferaft library
    // Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
    this.raft = null;
    // Initialized in initialize()
    this.raftRuntime = null;
    this.logAdapter = InMemoryLogAdapter;
    // Requirements: 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 4.4
    this.operationLedger = new MessageGroupOperationLedger({
      now: this.now,
      maxEntries: options.operationLedgerMaxEntries,
    });
    this.role = RaftRole.FOLLOWER;
    this.leaderId = null;
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.tablePolicyService = options.tablePolicyService || null;
    this.rebalanceCoordinator = options.rebalanceCoordinator || null;
    this.controlPlaneSystemTableGateway =
      options.controlPlaneSystemTableGateway ||
      createControlPlaneRuntimeBundle({
        nodeId: this.nodeId,
        getSqlQueryEngine: () =>
          this.cdcIntegrationService?.sqlQueryEngine || null,
        getCdcIntegrationService: () => this.cdcIntegrationService,
        getSystemTableCache: () => this.systemTableCache,
        getMessageRouter: () => this.transport,
      }).controlPlaneSystemTableGateway;
    this.rebalancer = null;
    // Message tracking
    this.pendingMessages = new Map();
    this.acknowledgedMessages = new Set();
    this.messageCallbacks = new Map();
    // System table cache - use shared cache from NodeService singleton
    // This ensures all services on the same node share the same cache
    this.systemTableCacheChangeListener =
      this.handleSystemTableCacheChange.bind(this);
    this.peerReconciliationScheduled = false;
    const nodeService = NodeService.getInstance();
    this.systemTableCache = nodeService.getSystemTableCache();
    this.readOnlyCache = nodeService.getReadOnlySystemTableCache();
    // HLC clock for ordering
    this.hlcClock = new HLCClockService(this.replicaId);
    // Single-owner CDC handler for subscriptions and cache application.
    this.cdcHandler = new CDCHandler(this.systemTableCache);
    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.forSubsystem(MESSAGE_GROUP_SUBSYSTEM.NAME);
    this.forwardingOwner = new MessageGroupForwardingOwner({
      service: this,
      buildDeferredCdcForwardError,
      boundCdcForwardErrorDetail,
    });
    this.roleMutationHelper = this.createRoleMutationHelper();
    this.pendingRoleUpdate = this.role;
    this.persistedRole = null;
    this.leaderNodeMutationHelper = this.createLeaderNodeMutationHelper();
    this.pendingLeaderNodeUpdate = null;
    this.persistedLeaderNodeId = null;
    this.metadataPublicationReadinessTransitionListener =
      this.handleMetadataPublicationReadinessTransition.bind(this);
    this.releaseMetadataPublicationReadinessListener = null;
    this._metadataPublicationReadinessState = null;
    this.publishRoleMetadata = options.publishRoleMetadata !== false;
    this.publishLeaderNodeMetadata =
      options.publishLeaderNodeMetadata !== false;
    this.metadataPublicationReadinessState =
      options.metadataPublicationReadinessState ||
      options.bootstrapReadinessState ||
      null;
    // State
    this.initialized = false;
    this.isLeader = false;
    this.leaderActivationScheduler =
      options.leaderActivationScheduler ||
      LeaderActivationScheduler.getShared({
        nodeId: this.nodeId,
        spacingMs: this.leaderActivationNodeSpacingMs,
      });
    this.leaderActivationGate = new LeaderActivationGate({
      holdoffMs: this.leaderActivationStabilizationMs,
      activationScheduler: this.leaderActivationScheduler,
    });
    this.lastLeaderCdcResubscribeTerm = undefined;
    // Defer election start until all replicas are ready
    // When true, the Raft election timer won't start until startElection() is called
    // This prevents election storms when multiple replicas are created on the same node
    this.isJoiningExistingGroup = options.isJoiningExistingGroup || false;
    this.deferElectionUntilJoinConvergence =
      options.deferElectionUntilJoinConvergence === true;
    this.deferElection =
      options.deferElection || this.isJoiningExistingGroup || false;
    this.electionStarted = false;
    this.raftTimingConfig = null;
    this.joinSuppressedHeartbeat = null;
  }
  get systemTableCache() {
    return this._systemTableCache || null;
  }
  set systemTableCache(systemTableCache) {
    const previousCache = this._systemTableCache || null;
    if (
      previousCache &&
      previousCache !== systemTableCache &&
      typeof previousCache.offCacheChange === TYPEOF.FUNCTION &&
      this.systemTableCacheChangeListener
    ) {
      previousCache.offCacheChange(this.systemTableCacheChangeListener);
    }
    this._systemTableCache = systemTableCache;
    this.roleMutationHelper?.setSystemTableCache(systemTableCache);
    this.leaderNodeMutationHelper?.setSystemTableCache(systemTableCache);
    if (this.rebalancer) {
      this.rebalancer.systemTableCache = systemTableCache;
    }
    if (
      systemTableCache &&
      systemTableCache !== previousCache &&
      typeof systemTableCache.onCacheChange === TYPEOF.FUNCTION &&
      this.systemTableCacheChangeListener
    ) {
      systemTableCache.onCacheChange(this.systemTableCacheChangeListener);
    }
    this.scheduleRaftPeerReconciliation();
  }
  get cdcIntegrationService() {
    return this._cdcIntegrationService || null;
  }
  set cdcIntegrationService(cdcIntegrationService) {
    this._cdcIntegrationService = cdcIntegrationService;
    this.roleMutationHelper?.setCdcIntegrationService(cdcIntegrationService);
    this.leaderNodeMutationHelper?.setCdcIntegrationService(
      cdcIntegrationService,
    );
    if (this.rebalancer) {
      this.rebalancer.cdcIntegrationService = cdcIntegrationService;
    }
  }
  get metadataPublicationReadinessState() {
    return this._metadataPublicationReadinessState || null;
  }
  set metadataPublicationReadinessState(readinessState) {
    if (
      typeof this.releaseMetadataPublicationReadinessListener ===
      TYPEOF.FUNCTION
    ) {
      this.releaseMetadataPublicationReadinessListener();
    }
    this._metadataPublicationReadinessState = readinessState || null;
    this.releaseMetadataPublicationReadinessListener =
      attachTrafficReadinessListener(
        this._metadataPublicationReadinessState,
        this.metadataPublicationReadinessTransitionListener,
      );
  }
  get pendingRoleUpdate() {
    return this.roleMutationHelper?.pendingValue || null;
  }
  set pendingRoleUpdate(role) {
    if (this.roleMutationHelper) {
      this.roleMutationHelper.pendingValue = normalizePublishedRaftRole(role, {
        collapseLeaderToFollower: true,
      });
    }
  }
  get persistedRole() {
    return this.roleMutationHelper?.persistedValue || null;
  }
  set persistedRole(role) {
    if (this.roleMutationHelper) {
      this.roleMutationHelper.persistedValue = role;
    }
  }
  get roleUpdateInFlight() {
    return this.roleMutationHelper?.inFlight || false;
  }
  get roleUpdateRetryTimer() {
    return this.roleMutationHelper?.retryTimer || null;
  }
  set roleUpdateRetryTimer(timer) {
    if (this.roleMutationHelper) {
      this.roleMutationHelper.retryTimer = timer;
    }
  }
  get pendingLeaderNodeUpdate() {
    return this.leaderNodeMutationHelper?.pendingValue || null;
  }
  set pendingLeaderNodeUpdate(leaderNodeId) {
    if (this.leaderNodeMutationHelper) {
      this.leaderNodeMutationHelper.pendingValue = leaderNodeId;
    }
  }
  get persistedLeaderNodeId() {
    return this.leaderNodeMutationHelper?.persistedValue || null;
  }
  set persistedLeaderNodeId(leaderNodeId) {
    if (this.leaderNodeMutationHelper) {
      this.leaderNodeMutationHelper.persistedValue = leaderNodeId;
    }
  }
  get leaderNodeUpdateInFlight() {
    return this.leaderNodeMutationHelper?.inFlight || false;
  }
  set leaderNodeUpdateInFlight(inFlight) {
    if (this.leaderNodeMutationHelper) {
      this.leaderNodeMutationHelper.inFlight = inFlight;
    }
  }
  get leaderNodeUpdateRetryTimer() {
    return this.leaderNodeMutationHelper?.retryTimer || null;
  }
  set leaderNodeUpdateRetryTimer(timer) {
    if (this.leaderNodeMutationHelper) {
      this.leaderNodeMutationHelper.retryTimer = timer;
    }
  }
  isMetadataPublicationReady() {
    if (!this.metadataPublicationReadinessState) {
      return true;
    }
    return isMetadataPublicationLifecycleReady(
      this.metadataPublicationReadinessState,
    );
  }
  isMetadataPublicationConvergenceWindowOpen() {
    return this.isMetadataPublicationReady() && !this.isBackgroundWorkReady();
  }
  isBackgroundWorkReady() {
    return isBackgroundWorkLifecycleReady(
      this.metadataPublicationReadinessState,
    );
  }
  handleMetadataPublicationReadinessTransition() {
    this.maybeInitializeRebalancer();
    if (!this.isMetadataPublicationReady()) {
      return;
    }
    this.flushRoleUpdate().catch((error) => {
      this.logger.warn(
        MESSAGE_GROUP_SERVICE_LITERAL.FAILED_TO_FLUSH_DEFERRED_MESSAGE_GROUP_ROLE_UPDATE,
        {
          groupId: this.groupId,
          replicaId: this.replicaId,
          error: error.message,
        },
      );
    });
    this.flushLeaderNodeUpdate().catch((error) => {
      this.logger.warn(
        MESSAGE_GROUP_SERVICE_LITERAL.FAILED_TO_FLUSH_DEFERRED_MESSAGE_GROUP_LEADER_UPDATE,
        {
          groupId: this.groupId,
          replicaId: this.replicaId,
          error: error.message,
        },
      );
    });
  }
  createRoleMutationHelper() {
    return new AuthoritativeRowMutationHelper({
      tableName: SYSTEM_TABLE_NAME.SERVICES,
      buildWhereClause: (_role, context = {}) => {
        const whereClause = { [COLUMN.SERVICE_ID]: this.replicaId };
        const cachedRow = context.cachedRow;
        if (
          typeof cachedRow?.raft_role === TYPEOF.STRING &&
          cachedRow.raft_role.length > NUM.ZERO
        ) {
          whereClause.raft_role = cachedRow.raft_role;
        }
        if (Number.isFinite(cachedRow?.updated_at)) {
          whereClause.updated_at = cachedRow.updated_at;
        }
        return whereClause;
      },
      buildUpdateData: (role, updatedAt) => ({
        raft_role: role,
        updated_at: updatedAt,
      }),
      buildUpdateOptions: () => ({
        deliveryPriority: MESSAGE_GROUP_SERVICE_LITERAL.BACKGROUND,
        workClass: PRESSURE_WORK_CLASS.BACKGROUND,
        allowPressureDefer: true,
        routingReadinessDimension:
          this.getMetadataPublicationReadinessDimension(),
      }),
      buildExpectedCacheFields: (role) => ({ raft_role: role }),
      prepareFlush: () => ({
        skip: !this.publishRoleMetadata,
        clearPending: !this.publishRoleMetadata,
        reason: !this.publishRoleMetadata
          ? FLUSH_SKIP_DISABLED
          : FLUSH_SKIP_READY,
      }),
      readRowFromCache: (systemTableCache) =>
        systemTableCache?.get?.(TABLES.SERVICES, this.replicaId) || null,
      readValueFromCache: (systemTableCache) => {
        const cached = systemTableCache?.get?.(TABLES.SERVICES, this.replicaId);
        return cached?.raft_role || null;
      },
      isWriteReady: () => this.isServicesLeaderAvailable(),
      systemTableCache: this.systemTableCache,
      cdcIntegrationService: this.cdcIntegrationService,
      onAsyncError: (error, context = {}) => {
        this.logger.warn(ROLE_PERSIST_ERROR_MSG, {
          groupId: this.groupId,
          replicaId: this.replicaId,
          role: context.value ?? this.pendingRoleUpdate,
          error: error.message,
        });
      },
    });
  }
  createLeaderNodeMutationHelper() {
    return new AuthoritativeRowMutationHelper({
      tableName: SYSTEM_TABLE_NAME.MESSAGE_GROUPS,
      buildWhereClause: (_leaderNodeId, context = {}) => {
        const whereClause = { [COLUMN.GROUP_ID]: this.groupId };
        const cachedRow = context.cachedRow;
        if (
          typeof cachedRow?.[COLUMN.LEADER_NODE_ID] === TYPEOF.STRING &&
          cachedRow[COLUMN.LEADER_NODE_ID].length > NUM.ZERO
        ) {
          whereClause[COLUMN.LEADER_NODE_ID] = cachedRow[COLUMN.LEADER_NODE_ID];
        }
        if (Number.isFinite(cachedRow?.[COLUMN.UPDATED_AT])) {
          whereClause[COLUMN.UPDATED_AT] = cachedRow[COLUMN.UPDATED_AT];
        }
        return whereClause;
      },
      buildUpdateData: (leaderNodeId, updatedAt) => ({
        [COLUMN.LEADER_NODE_ID]: leaderNodeId,
        [COLUMN.UPDATED_AT]: updatedAt,
      }),
      buildUpdateOptions: () => ({
        deliveryPriority: this.getMetadataPublicationDeliveryPriority(),
        routingReadinessDimension:
          this.getMetadataPublicationReadinessDimension(),
      }),
      buildExpectedCacheFields: (leaderNodeId) => ({
        [COLUMN.LEADER_NODE_ID]: leaderNodeId,
      }),
      readRowFromCache: (systemTableCache) =>
        systemTableCache?.get?.(TABLES.MESSAGE_GROUPS, this.groupId) || null,
      readValueFromCache: (systemTableCache) => {
        const cached = systemTableCache?.get?.(
          TABLES.MESSAGE_GROUPS,
          this.groupId,
        );
        return cached?.[COLUMN.LEADER_NODE_ID] || null;
      },
      prepareFlush: () => ({
        skip: !this.publishLeaderNodeMetadata || !this.isLeader,
        clearPending: !this.publishLeaderNodeMetadata || !this.isLeader,
        reason: !this.publishLeaderNodeMetadata
          ? FLUSH_SKIP_DISABLED
          : !this.isLeader
            ? FLUSH_SKIP_NOT_OWNER
            : FLUSH_SKIP_READY,
      }),
      isWriteReady: () => this.isMessageGroupsLeaderAvailable(),
      systemTableCache: this.systemTableCache,
      cdcIntegrationService: this.cdcIntegrationService,
      onAsyncError: (error, context = {}) => {
        this.logger.warn(LEADER_NODE_PERSIST_ERROR_MSG, {
          groupId: this.groupId,
          replicaId: this.replicaId,
          leaderNodeId: context.value ?? this.pendingLeaderNodeUpdate,
          error: error.message,
        });
      },
    });
  }
  /**
   * Check if transport is WebSocket-based (MessageRouter).
   * Valid transports: MessageRouter
   * Invalid: InMemoryTransport, null, undefined
   *
   * Detection is done via duck typing:
   * - MessageRouter has: deliver(), initialize(), shutdown(), setServiceNodeResolver()
   *
   * @param {Object} transport - Transport to validate.
   * @return {boolean} True if transport is WebSocket-based.
   */
  isWebSocketBasedTransport(transport) {
    if (!transport) {
      return false;
    }
    // Check for required methods
    const hasDeliver = typeof transport.deliver === TYPEOF.FUNCTION;
    const hasInitialize = typeof transport.initialize === TYPEOF.FUNCTION;
    // Check for MessageRouter marker
    const isMessageRouter =
      typeof transport.setServiceNodeResolver === TYPEOF.FUNCTION;
    return hasDeliver && hasInitialize && isMessageRouter;
  }
  /**
   * Get the unified address for this service.
   * Format: ${nodeId}/message-group/${replicaId}
   * Requirements: 1.1, 5.1
   * @return {string} Unified address.
   */
  getUnifiedAddress() {
    return this.unifiedAddress;
  }
  /**
   * Build a unified address for a peer replica.
   * Looks up the address from the authoritative cache first, then live raft
   * peers, and only uses bootstrap hints when a caller explicitly opts in.
   * Uses AddressManager for consistent address formatting and validation.
   * Requirements: 1.1, 1.4, 9.1
   * @param {string} peerId - Peer replica ID.
   * @param {Object} [options]
   * @param {boolean} [options.allowBootstrapHints=false] - Permit
   * bootstrap-time peer hints when authoritative runtime location has not
   * converged yet.
   * @return {string} Unified address for the peer.
   */
  buildPeerAddress(peerId, options = {}) {
    // If peerId is already in unified format, validate and return as-is.
    // Fail fast (and log) when a provided address is not unified.
    // Requirements: 1.4
    if (peerId.includes(ADDRESS.SEPARATOR)) {
      const validation = this.addressManager.validate(peerId);
      if (validation.valid) {
        return peerId;
      }
      this.logger.error(
        MESSAGE_GROUP_SERVICE_LITERAL.PEER_ADDRESS_MUST_BE_IN_UNIFIED_FORMAT,
        {
          peerId,
          groupId: this.groupId,
          replicaId: this.replicaId,
          error: validation.error,
        },
      );
      throw new Error(`Peer address must be unified: ${peerId}`);
    }
    // Prefer cache-backed topology first so handoff/move metadata wins over
    // bootstrap-time peer hints.
    const cachedAddress = this.resolvePeerAddressFromCache(peerId);
    if (cachedAddress) {
      this.bootstrapHintFallbackLogged.delete(peerId);
      return cachedAddress;
    }
    const livePeerAddress = this.resolveLivePeerAddressFromRaftNodes(peerId);
    if (livePeerAddress) {
      return livePeerAddress;
    }
    if (options.allowBootstrapHints !== true) {
      throw new Error(`Unable to resolve unified peer address for ${peerId}`);
    }
    const hintedAddress = this.resolvePeerAddressFromHints(peerId);
    if (hintedAddress) {
      this.logBootstrapHintFallback(peerId, hintedAddress);
      return hintedAddress;
    }
    throw new Error(`Unable to resolve unified peer address for ${peerId}`);
  }
  resolvePeerAddressFromHints(peerId) {
    if (!this.peerAddresses || this.peerAddresses.length === NUM.ZERO) {
      return null;
    }
    for (const addr of this.peerAddresses) {
      const validation = this.addressManager.validate(addr);
      if (!validation.valid) {
        this.logger.error(
          MESSAGE_GROUP_SERVICE_LITERAL.PEER_ADDRESS_MUST_BE_IN_UNIFIED_FORMAT,
          {
            peerId: addr,
            groupId: this.groupId,
            replicaId: this.replicaId,
            error: validation.error,
          },
        );
        throw new Error(`Peer address must be unified: ${addr}`);
      }
      try {
        const parsed = this.addressManager.parse(addr);
        if (parsed.serviceId === peerId) {
          return addr;
        }
      } catch (_e) {}
    }
    return null;
  }
  /**
   * Resolve an authoritative join candidate without failing closed when the
   * local replica has no remote same-id peer yet.
   * @param {string} peerId
   * @return {string|null}
   * @private
   */
  resolveOptionalRaftJoinPeerAddress(peerId) {
    const cachedAddress = this.resolvePeerAddressFromCache(peerId);
    if (cachedAddress) {
      this.bootstrapHintFallbackLogged.delete(peerId);
      return cachedAddress;
    }
    const livePeerAddress = this.resolveLivePeerAddressFromRaftNodes(peerId);
    if (livePeerAddress) {
      return livePeerAddress;
    }
    const hintedAddress = this.resolvePeerAddressFromHints(peerId);
    if (hintedAddress) {
      this.logBootstrapHintFallback(peerId, hintedAddress);
      return hintedAddress;
    }
    return null;
  }
  /**
   * Resolve one canonical join decision for the shared raft runtime owner.
   * @param {string} peerId
   * @return {{address: string|null, shouldJoin: boolean}}
   * @private
   */
  resolveRaftJoinTarget(peerId) {
    const optionalPeerAddress = this.resolveOptionalRaftJoinPeerAddress(peerId);
    if (peerId === this.replicaId && !optionalPeerAddress) {
      return {
        address: null,
        shouldJoin: false,
      };
    }
    const peerAddress =
      optionalPeerAddress ||
      this.buildPeerAddress(peerId, { allowBootstrapHints: true });
    return {
      address: peerAddress,
      shouldJoin: this.shouldJoinRaftPeer(peerId, peerAddress),
    };
  }
  /**
   * Build one shared peer-address resolver surface for the canonical raft owner.
   * @return {{resolve: Function}}
   * @private
   */
  createRaftPeerAddressResolver() {
    return {
      resolve: (peerId) => {
        return this.buildPeerAddress(peerId, { allowBootstrapHints: true });
      },
      resolveJoinTarget: (peerId) => {
        return this.resolveRaftJoinTarget(peerId);
      },
    };
  }
  shouldJoinRaftPeer(peerId, peerAddress) {
    return !this.isLocalForwardTarget(peerId, peerAddress);
  }
  /**
   * Resolve peer address from the services cache.
   * @param {string} peerId - Peer replica ID.
   * @return {string|null} Unified address from cache, otherwise null.
   * @private
   */
  resolvePeerAddressFromCache(peerId) {
    if (!this.systemTableCache) {
      return null;
    }
    const service = this.systemTableCache.get(TABLES.SERVICES, peerId);
    if (!service) {
      return null;
    }
    if (service.address) {
      const validation = this.addressManager.validate(service.address);
      if (validation.valid) {
        return service.address;
      }
    }
    if (service.node_id) {
      return this.addressManager.format(
        service.node_id,
        ENTITY_TYPE.MESSAGE_GROUP,
        peerId,
      );
    }
    return null;
  }
  /**
   * Emit a structured warning when bootstrap peer hints are used as fallback.
   * @param {string} peerId - Peer replica ID.
   * @param {string} address - Resolved bootstrap hint address.
   * @private
   */
  logBootstrapHintFallback(peerId, address) {
    if (this.bootstrapHintFallbackLogged.has(peerId)) {
      return;
    }
    this.bootstrapHintFallbackLogged.add(peerId);
    this.logger.warn(
      MESSAGE_GROUP_SERVICE_LITERAL.USING_BOOTSTRAP_PEER_HINT_BECAUSE_SERVICES_CACHE_HAS_NO_PEER_LOCATION,
      {
        groupId: this.groupId,
        replicaId: this.replicaId,
        peerId,
        address,
        resolutionSource: MESSAGE_GROUP_SERVICE_LITERAL.BOOTSTRAP_HINT,
      },
    );
  }
  /**
   * React to authoritative services cache changes for this message group.
   * Existing replicas need this to discover newly added or moved peers.
   * @param {string} tableName
   * @param {string} _operation
   * @param {Object} record
   * @private
   */
  handleSystemTableCacheChange(tableName, _operation, record) {
    if (tableName !== TABLES.SERVICES || !record) {
      return;
    }
    if (
      (record?.[COLUMN.GROUP_ID] || record?.group_id) !== this.groupId ||
      (record?.[COLUMN.SERVICE_TYPE] || record?.service_type) !==
        SERVICE_TYPE.MESSAGE_GROUP
    ) {
      return;
    }
    this.scheduleRaftPeerReconciliation();
  }
  /**
   * Coalesce peer reconciliation work triggered by cache updates.
   * @private
   */
  scheduleRaftPeerReconciliation() {
    if (this.peerReconciliationScheduled) {
      return;
    }
    this.peerReconciliationScheduled = true;
    setImmediate(() => {
      this.peerReconciliationScheduled = false;
      this.reconcileRaftPeersFromCache();
    });
  }
}
export { MessageGroupServicePart1 };
