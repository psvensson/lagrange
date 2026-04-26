/**
 * Message Group Service - Reliable inter-service communication.
 * Implements 3-replica Raft groups using liferaft library for consensus.
 * Requirements: 1.4, 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.4, 6.5
 */
import {v4 as uuidv4} from 'uuid';
import LifeRaft from '../raft/liferaft.js';
import {
  COLUMN,
  ENTITY_TYPE,
  METRICS_LOG_TAG,
  NUM,
  SERVICE_TYPE,
  TABLES,
  TIME_MS,
  TYPEOF,
} from '../constants/index.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {CONFIG_KEY} from '../config/config-constants.js';
import {ControlPlaneMessageType} from '../control-plane/control-plane-constants.js';
import {CONTROL_PLANE_READINESS_DIMENSION} from '../control-plane/control-plane-readiness-constants.js';
import {HLCTimestamp} from '../hlc/hlc-timestamp.js';
import {
  INITIAL_MESSAGE_GROUP_ID,
  SYSTEM_TABLE_NAME,
} from '../bootstrap/system-table-schemas-constants.js';
import {isCriticalTransportTargetAddress} from '../bootstrap/system-partition-classification.js';
import {
} from '../bootstrap/traffic-readiness-utils.js';
import {isSystemTableWriteReady} from '../cache/leader-readiness-gate.js';
import {isRaftPacket, RAFT_PACKET_TYPES} from '../raft/raft-packet-utils.js';
import {
  RAFT_ELECTION_TIMING,
  RAFT_EVENT,
  RAFT_PACKET_TYPE,
  resolveRaftTransportDeliveryOptions,
} from '../raft/constants.js';
import {
  applyRuntimeRaftTiming,
  computeReplicaElectionTimeouts,
} from '../raft/raft-timing-utils.js';
import {RaftGroup} from '../raft/raft-group.js';
import {wireReplicaLifecycleEvents} from '../raft/replica-leadership-state.js';
import {normalizePublishedRaftRole} from '../raft/published-raft-role.js';
import {ReplicaStatus} from '../rebalancer/replica-status.js';
import {
  UnifiedRebalancer,
  EntityType as RebalancerEntityType,
} from '../rebalancer/unified-rebalancer.js';
import {
  MESSAGE_GROUP_APPLICATION_ERROR_MSG,
  MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE,
  MESSAGE_GROUP_APPLICATION_STATUS,
  MESSAGE_GROUP_CDC_ERROR_MSG,
  MESSAGE_GROUP_SERVICE_ERROR_MSG,
  MESSAGE_GROUP_SERVICE_LOG_MSG,
  MESSAGE_STATUS as MessageStatus,
  RAFT_ROLE as RaftRole,
} from './constants.js';
import {
  MESSAGE_GROUP_CDC_INGRESS_ACTION,
  MESSAGE_GROUP_CDC_LOG_CONTEXT_FIELD,
} from './message-group-forwarding-owner.js';
import {createMessageGroupServiceRuntimeMethods} from './message-group-service-runtime-methods.js';
import {getOrCreateCauseId, normalizeCauseId} from '../utils/cause-id.js';
import {MessageGroupOperationLedger} from './message-group-operation-ledger.js';
import {QUERY_MESSAGE_TYPE} from '../query/query-constants.js';
import {MessageGroupServicePart1} from './message-group-service-class-part-1.js';
// Note: isRaftPacket and RAFT_PACKET_TYPES are imported from shared module
// src/raft/raft-packet-utils.js - Requirements: 9.1, 9.2, 9.3, 9.4
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
/**
 * MessageGroupService provides reliable inter-service communication.
 * Implements a 3-replica Raft group using liferaft library.
 */
class MessageGroupService extends MessageGroupServicePart1 {
  /**
   * Join newly visible peers and replace moved peer addresses using the
   * authoritative services cache. Missing rows are ignored conservatively.
   * @private
   */
  reconcileRaftPeersFromCache() {
    if (
      !this.raft ||
      !this.systemTableCache ||
      typeof this.systemTableCache.filter !== TYPEOF.FUNCTION
    ) {
      return;
    }
    const services = this.systemTableCache.filter(
      TABLES.SERVICES,
      (service) => {
        return (
          (service?.[COLUMN.GROUP_ID] || service?.group_id) === this.groupId &&
          (service?.[COLUMN.SERVICE_TYPE] || service?.service_type) ===
            SERVICE_TYPE.MESSAGE_GROUP
        );
      },
    );
    if (services.length === NUM.ZERO) {
      return;
    }
    const expectedAddressesByReplicaId = new Map();
    for (const service of services) {
      const replicaId =
        service?.[COLUMN.SERVICE_ID] ||
        service?.service_id ||
        service?.[COLUMN.REPLICA_ID] ||
        service?.replica_id;
      if (!replicaId) {
        continue;
      }
      const status =
        service?.[COLUMN.STATUS] || service?.status || ReplicaStatus.ACTIVE;
      if (
        status === ReplicaStatus.FAILED ||
        status === ReplicaStatus.REMOVING ||
        status === ReplicaStatus.REMOVED
      ) {
        continue;
      }
      const serviceAddress = service?.[COLUMN.ADDRESS] || service?.address;
      const serviceNodeId = service?.[COLUMN.NODE_ID] || service?.node_id;
      const peerAddress =
        typeof serviceAddress === TYPEOF.STRING &&
        serviceAddress.length > NUM.ZERO ?
          serviceAddress :
          typeof serviceNodeId === TYPEOF.STRING &&
              serviceNodeId.length > NUM.ZERO ?
            this.addressManager.format(
              serviceNodeId,
              ENTITY_TYPE.MESSAGE_GROUP,
              replicaId,
            ) :
            null;
      if (!peerAddress || this.isLocalForwardTarget(replicaId, peerAddress)) {
        continue;
      }
      expectedAddressesByReplicaId.set(replicaId, peerAddress);
      if (!this.replicaIds.includes(replicaId)) {
        this.replicaIds.push(replicaId);
      }
    }
    const currentNodes = Array.isArray(this.raft.nodes) ?
      [...this.raft.nodes] :
      [];
    const currentAddresses = new Set(
      currentNodes
        .map((node) => node?.address)
        .filter(
          (address) =>
            typeof address === TYPEOF.STRING && address.length > NUM.ZERO,
        ),
    );
    for (const [
      replicaId,
      expectedAddress,
    ] of expectedAddressesByReplicaId.entries()) {
      const staleAddresses = currentNodes
        .map((node) => node?.address)
        .filter((address) => {
          if (
            typeof address !== TYPEOF.STRING ||
            address.length === NUM.ZERO ||
            address === expectedAddress
          ) {
            return false;
          }
          try {
            const parsed = this.addressManager.parse(address);
            return (
              parsed.serviceType === ENTITY_TYPE.MESSAGE_GROUP &&
              parsed.serviceId === replicaId
            );
          } catch (_error) {
            return false;
          }
        });
      if (typeof this.raft.leave === TYPEOF.FUNCTION) {
        for (const staleAddress of staleAddresses) {
          this.raft.leave(staleAddress);
          currentAddresses.delete(staleAddress);
        }
      }
      if (!currentAddresses.has(expectedAddress)) {
        this.raftProvider.joinPeer(this.raft, expectedAddress);
        currentAddresses.add(expectedAddress);
      }
    }
  }
  /**
   * Initialize the message group service.
   * Creates liferaft instance and wires up events.
   * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 7.1, 7.2, 7.3, 7.4
   * @return {Promise<void>}
   */
  async initialize() {
    if (this.initialized) {
      return;
    }
    this.logger.info(
      MESSAGE_GROUP_SERVICE_LITERAL.INITIALIZING_MESSAGE_GROUP_SERVICE,
      {
        groupId: this.groupId,
        replicaId: this.replicaId,
        nodeId: this.nodeId,
        replicaCount: this.replicaIds.length,
      },
    );
    // Get Raft configuration from ConfigurationManager
    // Requirements: 7.1, 7.2, 7.3, 7.4
    const config = ConfigurationManager.getInstance();
    const heartbeatMs =
      config.get(CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS) ||
      RAFT_ELECTION_TIMING.HEARTBEAT_DEFAULT_MS;
    const baseElectionMinMs =
      config.get(CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS) ||
      RAFT_ELECTION_TIMING.ELECTION_MIN_DEFAULT_MS;
    const baseElectionMaxMs =
      config.get(CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS) ||
      RAFT_ELECTION_TIMING.ELECTION_MAX_DEFAULT_MS;
    const tickIntervalMs = config.get(CONFIG_KEY.RAFT_TICK_INTERVAL_MS);
    const {electionMinMs, electionMaxMs} = computeReplicaElectionTimeouts({
      replicaId: this.replicaId,
      replicaIds: this.replicaIds,
      baseElectionMinMs,
      baseElectionMaxMs,
      electionJitterPerReplicaMs: RAFT_ELECTION_TIMING.JITTER_PER_REPLICA_MS,
    });
    this.raftTimingConfig = {
      heartbeatMs,
      baseElectionMinMs,
      baseElectionMaxMs,
      electionMinMs,
      electionMaxMs,
      tickIntervalMs: Number.isFinite(tickIntervalMs) ? tickIntervalMs : null,
    };
    this.raftRuntime = new RaftGroup({
      replicaId: this.replicaId,
      replicaIds: this.replicaIds,
      transport: this.transport,
      entityType: ENTITY_TYPE.MESSAGE_GROUP,
      peerAddressResolver: this.createRaftPeerAddressResolver(),
      unifiedAddress: this.unifiedAddress,
      peerAddresses: this.peerAddresses,
      logAdapter: this.logAdapter,
      deferElection: this.deferElection,
      heartbeatMs,
      electionMinMs: baseElectionMinMs,
      electionMaxMs: baseElectionMaxMs,
      electionJitterPerReplicaMs: RAFT_ELECTION_TIMING.JITTER_PER_REPLICA_MS,
      raftProvider: this.raftProvider,
      logger: this.logger,
      shouldJoinPeer: (peerId, peerAddress) =>
        this.shouldJoinRaftPeer(peerId, peerAddress),
    });
    try {
      this.raftRuntime.initialize();
      this.raft = this.raftRuntime.getRaftInstance();
      this.armJoinExistingGroupElectionSuppression();
      this.wireRaftEvents();
      this.raftRuntime.joinPeers();
      this.reconcileRaftPeersFromCache();
      if (Number.isFinite(this.raftTimingConfig.tickIntervalMs)) {
        this.applyRuntimeTickInterval(this.raftTimingConfig.tickIntervalMs);
      }
      if (this.replicaIds.length === NUM.ONE) {
        this.raftRuntime.startElection();
        this.electionStarted = true;
      }
    } catch (error) {
      this.logger.error(
        MESSAGE_GROUP_SERVICE_LITERAL.FAILED_DURING_INITIALIZE_CLEANING_UP_RAFT,
        {
          groupId: this.groupId,
          replicaId: this.replicaId,
          error: error.message,
        },
      );
      if (this.raftRuntime) {
        await this.raftRuntime.shutdown();
        this.raftRuntime = null;
      }
      this.raft = null;
      throw error;
    }
    this.cdcHandler.initialize();
    this.initialized = true;
    this.maybeInitializeRebalancer();
    this.logger.info(
      MESSAGE_GROUP_SERVICE_LITERAL.MESSAGE_GROUP_SERVICE_INITIALIZED,
      {
        groupId: this.groupId,
        replicaId: this.replicaId,
        role: this.role,
      },
    );
    this.emit(MESSAGE_GROUP_SERVICE_LITERAL.INITIALIZED, {
      groupId: this.groupId,
      replicaId: this.replicaId,
    });
  }
  /**
   * Wire up liferaft event handlers for role changes, commits, etc.
   * Extracted from initialize() for clarity and safe cleanup on failure.
   * Requirements: 5.1, 5.2, 5.3, 5.4
   * @private
   */
  wireRaftEvents() {
    const shouldIgnoreLeaderEvent = () => {
      if (!this.shouldSuppressJoinPhaseRaftParticipation()) {
        return false;
      }
      this.clearJoinExistingGroupTimers();
      return true;
    };
    const shouldIgnoreDemotionEvent = (eventName) => {
      if (!this.shouldSuppressJoinPhaseRaftParticipation()) {
        return false;
      }
      if (
        eventName !== RAFT_EVENT.FOLLOWER &&
        eventName !== RAFT_EVENT.CANDIDATE
      ) {
        return false;
      }
      if (this.raft) {
        this.raftProvider.clearTimers(this.raft, 'heartbeat, election');
      }
      return true;
    };
    wireReplicaLifecycleEvents(this, {
      events: RAFT_EVENT,
      roles: RaftRole,
      getCurrentTerm: () => this.raftProvider.getCurrentTerm(this.raft),
      normalizeLeaderId: (candidate) =>
        this.normalizeLeaderReplicaId(candidate),
      shouldIgnoreLeaderEvent,
      shouldIgnoreDemotionEvent,
      onLeader: ({term}) => {
        this.operationLedger.currentTerm = term;
        this.scheduleLeaderOwnedActivation(term);
      },
      onFollower: ({term}) => {
        this.cancelLeaderOwnedActivation();
        this.updateRebalancerLeadership();
        this.operationLedger.currentTerm = term;
        this.lastLeaderCdcResubscribeTerm = undefined;
      },
      onCandidate: ({term}) => {
        this.cancelLeaderOwnedActivation();
        this.updateRebalancerLeadership();
        this.operationLedger.currentTerm = term;
        this.lastLeaderCdcResubscribeTerm = undefined;
      },
      onCommit: (command) => {
        this.applyCommittedEntry(command);
      },
      onLeaderChange: ({leaderId}) => {
        this.logger.debug(MESSAGE_GROUP_SERVICE_LITERAL.LEADER_CHANGED, {
          newLeader: leaderId,
          groupId: this.groupId,
        });
      },
      onTermChange: ({term}) => {
        this.operationLedger.currentTerm = term;
      },
    });
  }
  /**
   * Join peer nodes in the Raft group.
   * Resolves peer addresses and joins them via liferaft.
   * @private
   * Delegate peer joins to the shared raft runtime owner.
   * @return {void}
   * @private
   */
  joinPeerNodes() {
    if (this.raftRuntime) {
      this.raftRuntime.joinPeers();
      return;
    }
    if (!this.raft) {
      return;
    }
    for (const peerId of this.replicaIds) {
      const joinTarget = this.resolveRaftJoinTarget(peerId);
      if (
        joinTarget.shouldJoin !== true ||
        typeof joinTarget.address !== TYPEOF.STRING ||
        joinTarget.address.length === NUM.ZERO
      ) {
        continue;
      }
      this.raftProvider.joinPeer(this.raft, joinTarget.address);
    }
  }
  /**
   * Delegate single-replica promotion to the shared raft runtime owner.
   * @return {void}
   * @private
   */
  promoteIfSingleReplica() {
    if (this.replicaIds.length !== NUM.ONE) {
      return;
    }
    this.startElection();
  }
  /**
   * Start the Raft election timer.
   * Call this after all replicas in the group have been created and registered.
   * This prevents election storms when multiple replicas are created on the same node.
   * If deferElection was false, this is a no-op (election already started).
   */
  startElection() {
    if (!this.raftRuntime) {
      return;
    }
    this.raftRuntime.startElection();
    this.electionStarted = true;
  }
  clearJoinExistingGroupTimers() {
    if (!this.raft) {
      return;
    }
    this.raftProvider.clearTimers(
      this.raft,
      MESSAGE_GROUP_SERVICE_LITERAL.HEARTBEAT_ELECTION,
    );
  }
  shouldSuppressJoinPhaseRaftParticipation() {
    return (
      this.isJoiningExistingGroup === true ||
      this.deferElectionUntilJoinConvergence === true
    );
  }
  armJoinExistingGroupElectionSuppression() {
    if (
      !this.raft ||
      !this.shouldSuppressJoinPhaseRaftParticipation() ||
      this.joinSuppressedHeartbeat
    ) {
      return;
    }
    const originalHeartbeat = this.raft.heartbeat;
    if (typeof originalHeartbeat !== TYPEOF.FUNCTION) {
      return;
    }
    const boundHeartbeat = originalHeartbeat.bind(this.raft);
    this.joinSuppressedHeartbeat = boundHeartbeat;
    this.raft.heartbeat = (duration) => {
      if (this.shouldSuppressJoinPhaseRaftParticipation()) {
        this.clearJoinExistingGroupTimers();
        return this.raft;
      }
      return boundHeartbeat(duration);
    };
    this.clearJoinExistingGroupTimers();
  }
  releaseJoinExistingGroupElectionSuppression() {
    if (!this.raft || !this.joinSuppressedHeartbeat) {
      return;
    }
    this.raft.heartbeat = this.joinSuppressedHeartbeat;
    this.joinSuppressedHeartbeat = null;
  }
  /**
   * Release join-time election suppression once the local node has completed
   * convergence and may participate normally in control-plane leadership.
   * @return {void}
   */
  completeJoinConvergence() {
    const wasJoiningExistingGroup = this.isJoiningExistingGroup === true;
    const shouldReleaseDeferredElection =
      this.deferElectionUntilJoinConvergence === true;
    if (!wasJoiningExistingGroup && !shouldReleaseDeferredElection) {
      return;
    }
    this.deferElection = false;
    this.releaseJoinExistingGroupElectionSuppression();
    if (wasJoiningExistingGroup) {
      this.isJoiningExistingGroup = false;
      if (this.role !== RaftRole.LEADER) {
        this.role = RaftRole.FOLLOWER;
        this.isLeader = false;
        if (this.leaderId === this.replicaId) {
          this.leaderId = null;
        }
        this.queueRoleUpdate(this.role);
      }
    }
    if (shouldReleaseDeferredElection) {
      this.deferElectionUntilJoinConvergence = false;
    }
    this.startElection();
  }
  /**
   * Apply raft timing configuration to this live replica.
   * @param {Object} timingConfig
   * @param {number} timingConfig.heartbeatIntervalMs
   * @param {number} timingConfig.electionTimeoutMinMs
   * @param {number} timingConfig.electionTimeoutMaxMs
   * @param {number} [timingConfig.tickIntervalMs]
   * @return {boolean} True when applied to an initialized raft instance.
   */
  applyRaftTimingConfig(timingConfig = {}) {
    const heartbeatMs = timingConfig.heartbeatIntervalMs;
    const baseElectionMinMs = timingConfig.electionTimeoutMinMs;
    const baseElectionMaxMs = timingConfig.electionTimeoutMaxMs;
    const previousTickIntervalMs =
      this.raftTimingConfig?.tickIntervalMs || null;
    const hasTickInterval = Object.prototype.hasOwnProperty.call(
      timingConfig,
      'tickIntervalMs',
    );
    const tickIntervalMs = timingConfig.tickIntervalMs;
    if (
      !Number.isFinite(heartbeatMs) ||
      !Number.isFinite(baseElectionMinMs) ||
      !Number.isFinite(baseElectionMaxMs) ||
      (hasTickInterval &&
        (!Number.isFinite(tickIntervalMs) || tickIntervalMs <= NUM.ZERO)) ||
      baseElectionMinMs > baseElectionMaxMs
    ) {
      return false;
    }
    const {electionMinMs, electionMaxMs, jitterMs} =
      computeReplicaElectionTimeouts({
        replicaId: this.replicaId,
        replicaIds: this.replicaIds,
        baseElectionMinMs,
        baseElectionMaxMs,
        electionJitterPerReplicaMs: RAFT_ELECTION_TIMING.JITTER_PER_REPLICA_MS,
      });
    this.raftTimingConfig = {
      heartbeatMs,
      baseElectionMinMs,
      baseElectionMaxMs,
      electionMinMs,
      electionMaxMs,
      tickIntervalMs: hasTickInterval ?
        tickIntervalMs :
        this.raftTimingConfig?.tickIntervalMs || null,
    };
    const shouldRearmTimer =
      this.replicaIds.length > NUM.ONE &&
      (!this.deferElection || this.electionStarted);
    const applied = applyRuntimeRaftTiming({
      raft: this.raft,
      heartbeatMs,
      electionMinMs,
      electionMaxMs,
      rearmTimer: shouldRearmTimer,
    });
    if (!applied) {
      return false;
    }
    const tickChanged =
      hasTickInterval && tickIntervalMs !== previousTickIntervalMs;
    const tickRuntimeApplied =
      !tickChanged || this.applyRuntimeTickInterval(tickIntervalMs);
    this.logger.info(
      MESSAGE_GROUP_SERVICE_LITERAL.APPLIED_RUNTIME_RAFT_TIMING_CONFIGURATION,
      {
        groupId: this.groupId,
        replicaId: this.replicaId,
        heartbeatMs,
        electionMinMs,
        electionMaxMs,
        tickIntervalMs: hasTickInterval ? tickIntervalMs : null,
        tickRuntimeApplied,
        jitterMs,
        rearmTimer: shouldRearmTimer,
      },
    );
    return tickRuntimeApplied;
  }
  /**
   * Apply raft provider tick interval when supported by the active provider.
   * @param {number} tickIntervalMs
   * @return {boolean} True when applied to a live raft instance.
   */
  applyRuntimeTickInterval(tickIntervalMs) {
    if (
      !this.raft ||
      !Number.isFinite(tickIntervalMs) ||
      tickIntervalMs <= NUM.ZERO
    ) {
      return false;
    }
    if (typeof this.raft.setTickInterval === TYPEOF.FUNCTION) {
      this.raft.setTickInterval(tickIntervalMs);
      return true;
    }
    if (typeof this.raft.configureTickInterval === TYPEOF.FUNCTION) {
      this.raft.configureTickInterval(tickIntervalMs);
      return true;
    }
    if (
      Object.prototype.hasOwnProperty.call(
        this.raft,
        MESSAGE_GROUP_SERVICE_LITERAL.TICKINTERVALMS,
      )
    ) {
      this.raft.tickIntervalMs = tickIntervalMs;
      return true;
    }
    return false;
  }
  /**
   * Apply a committed entry to the state machine.
   * This is called by liferaft when an entry is committed.
   * Requirements: 6.1, 6.2, 6.4, 6.5
   * @param {Object} command - The committed command
   */
  applyCommittedEntry(command) {
    if (!command || !command.type) {
      return;
    }
    switch (command.type) {
    case MESSAGE_GROUP_SERVICE_LITERAL.MESSAGE:
      // Handle message persistence - already tracked in pendingMessages
      break;
    case MESSAGE_GROUP_SERVICE_LITERAL.CDC:
      this.cdcHandler.applyImmediate(
        {
          tableName: command.tableName,
          operation: command.operation,
          data: command.data,
          timestamp: command.timestamp || this.hlcClock.now().toString(),
          causeId: normalizeCauseId(command.causeId),
        },
        {skipSubscriptionCheck: true},
      );
      this.emit(MESSAGE_GROUP_SERVICE_LITERAL.CDCAPPLIED, command);
      break;
    case CDC_BATCH_COMMAND_TYPE:
      for (const event of this.normalizeCDCBatchEvents(command.events)) {
        this.cdcHandler.applyImmediate(
          {
            tableName: event.tableName,
            operation: event.operation,
            data: event.data,
            timestamp: event.timestamp,
            causeId: normalizeCauseId(event.causeId),
          },
          {skipSubscriptionCheck: true},
        );
        this.emit(MESSAGE_GROUP_SERVICE_LITERAL.CDCAPPLIED, {
          tableName: event.tableName,
          operation: event.operation,
          data: event.data,
          logIndex: command.index || null,
          causeId: normalizeCauseId(event.causeId),
        });
      }
      break;
    case MESSAGE_GROUP_SERVICE_LITERAL.ACK:
      // Handle acknowledgment
      this.acknowledgedMessages.add(command.messageId);
      break;
    }
  }
}

const MESSAGE_GROUP_SERVICE_RUNTIME_METHODS =
  createMessageGroupServiceRuntimeMethods({
    CDC_BATCH_COMMAND_TYPE,
    CDC_FORWARD_MAX_RELAY_DEPTH,
    CONTROL_PLANE_READINESS_DIMENSION,
    DIRECT_ONLY_MESSAGE_TYPES,
    HLCTimestamp,
    INITIAL_MESSAGE_GROUP_ID,
    LifeRaft,
    MESSAGE_DELIVERY_MODE,
    MESSAGE_GROUP_APPLICATION_ERROR_MSG,
    MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE,
    MESSAGE_GROUP_APPLICATION_STATUS,
    MESSAGE_GROUP_CDC_ERROR_MSG,
    MESSAGE_GROUP_CDC_INGRESS_ACTION,
    MESSAGE_GROUP_CDC_LOG_CONTEXT_FIELD,
    MESSAGE_GROUP_SERVICE_ERROR_MSG,
    MESSAGE_GROUP_SERVICE_LITERAL,
    MESSAGE_GROUP_SERVICE_LOG_MSG,
    METRICS_LOG_TAG,
    MessageStatus,
    NUM,
    QUERY_MESSAGE_TYPE,
    RAFT_PACKET_TYPE,
    RebalancerEntityType,
    SYSTEM_TABLE_NAME,
    TIME_MS,
    TYPEOF,
    UnifiedRebalancer,
    boundCdcForwardErrorDetail,
    buildDeferredCdcForwardError,
    buildDeferredDeliveryError,
    buildLatencyCdcPropagationResult,
    getOrCreateCauseId,
    isRaftPacket,
    isSystemTableWriteReady,
    normalizeCauseId,
    normalizeMessageDeliveryMode,
    normalizePublishedRaftRole,
    resolveRaftTransportDeliveryOptions,
    resolveTransportDeliveryOptions,
    shouldDeferImmediateDeliveryRetry,
    uuidv4,
    wrapCdcProposeError,
    RaftRole,
  });

Object.assign(
  MessageGroupService.prototype,
  MESSAGE_GROUP_SERVICE_RUNTIME_METHODS,
);

export {
  MessageGroupOperationLedger,
  MessageGroupService,
  MessageStatus,
  RaftRole,
  isRaftPacket,
  RAFT_PACKET_TYPES,
};
