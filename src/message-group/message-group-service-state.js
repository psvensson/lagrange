/**
 * Message Group Service - construction and persisted-state accessors.
 * Holds the public class declaration: constructor wiring plus the role and
 * leader-node mutation-helper backed property accessors.
 * Implements 3-replica Raft groups using liferaft library for consensus.
 * Requirements: 1.4, 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.4, 6.5
 */
import {EventEmitter} from 'events';
import {
  ENTITY_TYPE,
  NUM,
  STRING,
  TIME_MS,
} from '../constants/index.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {CONFIG_KEY} from '../config/config-constants.js';
import {createControlPlaneRuntimeBundle} from '../control-plane/control-plane-runtime-bundle.js';
import {LoggingService} from '../logging/logging-service.js';
import {NodeService} from '../node/node-service.js';
import {HLCClockService} from '../hlc/hlc-clock-service.js';
import {
  attachTrafficReadinessListener,
} from '../bootstrap/traffic-readiness-utils.js';
import {InMemoryLogAdapter} from '../raft/in-memory-log-adapter.js';
import {LeaderActivationGate} from '../raft/leader-activation-gate.js';
import {LeaderActivationScheduler} from '../raft/leader-activation-scheduler.js';
import {assertRaftProviderContract} from '../raft/raft-provider-contract.js';
import {LiferaftProvider} from '../raft/liferaft-provider.js';
import {normalizePublishedRaftRole} from '../raft/published-raft-role.js';
import {AddressManager} from '../address/address-manager.js';
import {
  MESSAGE_GROUP_OPERATION_LEDGER_NOW,
  MESSAGE_GROUP_SERVICE_DEFAULT,
  MESSAGE_GROUP_SERVICE_ERROR_MSG,
  MESSAGE_GROUP_SUBSYSTEM,
  RAFT_ROLE as RaftRole,
} from './constants.js';
import {CDCHandler} from './cdc-handler.js';
import {MessageGroupForwardingOwner} from './message-group-forwarding-owner.js';
import {MessageGroupOperationLedger} from './message-group-operation-ledger.js';
import {
  FORWARD_TOPOLOGY_REPAIR_DEFAULT,
  MESSAGE_GROUP_SERVICE_LITERAL,
  boundCdcForwardErrorDetail,
  buildDeferredCdcForwardError,
} from './message-group-service-runtime-support.js';

/**
 * MessageGroupService provides reliable inter-service communication.
 * Implements a 3-replica Raft group using liferaft library.
 */
class MessageGroupService extends EventEmitter {
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
      typeof options.now === 'function' ?
        options.now :
        MESSAGE_GROUP_OPERATION_LEDGER_NOW;
    this.nodeId = options.nodeId || STRING.UNKNOWN;
    // COPY, for the same reason as the partition sibling: this list is
    // mutated in place by raft lifecycle, and callers hand in the shared
    // INITIAL_MESSAGE_GROUP_REPLICA_IDS declaration.
    this.replicaIds = Array.isArray(options.replicaIds) ?
      [...options.replicaIds] :
      [this.replicaId];
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
      options.leaderActivationStabilizationMs >= 0 ?
        Math.floor(options.leaderActivationStabilizationMs) :
        (config.get(CONFIG_KEY.RAFT_LEADER_ACTIVATION_STABILIZATION_MS) ??
          MESSAGE_GROUP_SERVICE_LITERAL.VALUE_250);
    this.leaderActivationNodeSpacingMs =
      Number.isFinite(options.leaderActivationNodeSpacingMs) &&
      options.leaderActivationNodeSpacingMs >= 0 ?
        Math.floor(options.leaderActivationNodeSpacingMs) :
        (config.get(CONFIG_KEY.RAFT_LEADER_ACTIVATION_NODE_SPACING_MS) ??
          MESSAGE_GROUP_SERVICE_LITERAL.VALUE_25);
    this.forwardTargetSuppressionMs =
      Number.isFinite(options.forwardTargetSuppressionMs) &&
      options.forwardTargetSuppressionMs > 0 ?
        Math.floor(options.forwardTargetSuppressionMs) :
        Math.min(this.retryMaxDelayMs, TIME_MS.SECOND * NUM.FIVE);
    this.forwardTopologyRepairCooldownMs =
      Number.isFinite(options.forwardTopologyRepairCooldownMs) &&
      options.forwardTopologyRepairCooldownMs > 0 ?
        Math.floor(options.forwardTopologyRepairCooldownMs) :
        FORWARD_TOPOLOGY_REPAIR_DEFAULT.COOLDOWN_MS;
    this.forwardTopologyRepairFailureCooldownMs =
      Number.isFinite(options.forwardTopologyRepairFailureCooldownMs) &&
      options.forwardTopologyRepairFailureCooldownMs > 0 ?
        Math.floor(options.forwardTopologyRepairFailureCooldownMs) :
        FORWARD_TOPOLOGY_REPAIR_DEFAULT.FAILURE_COOLDOWN_MS;
    this.forwardTopologyRepairNoChangeCooldownMs =
      Number.isFinite(options.forwardTopologyRepairNoChangeCooldownMs) &&
      options.forwardTopologyRepairNoChangeCooldownMs > 0 ?
        Math.floor(options.forwardTopologyRepairNoChangeCooldownMs) :
        FORWARD_TOPOLOGY_REPAIR_DEFAULT.NO_CHANGE_COOLDOWN_MS;
    this.forwardTopologyRepairQueryTimeoutMs =
      Number.isFinite(options.forwardTopologyRepairQueryTimeoutMs) &&
      options.forwardTopologyRepairQueryTimeoutMs > 0 ?
        Math.floor(options.forwardTopologyRepairQueryTimeoutMs) :
        FORWARD_TOPOLOGY_REPAIR_DEFAULT.QUERY_TIMEOUT_MS;
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
    // Application delivery has one completion owner. EventEmitter remains a
    // compatibility notification surface, but it cannot represent when an
    // async owner has actually finished its work.
    this.applicationMessageCompletionHandlers = new Map();
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
      typeof previousCache.offCacheChange === 'function' &&
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
      typeof systemTableCache.onCacheChange === 'function' &&
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
      'function'
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
}

export {MessageGroupService};
