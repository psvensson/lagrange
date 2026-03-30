/**
 * Message Group Service - Reliable inter-service communication.
 * Implements 3-replica Raft groups using liferaft library for consensus.
 * Requirements: 1.4, 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.4, 6.5
 */

import {EventEmitter} from 'events';
import {v4 as uuidv4} from 'uuid';
import LifeRaft from '../raft/liferaft.js';
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
} from '../constants/index.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {CONFIG_KEY} from '../config/config-constants.js';
import {
  ControlPlaneMessageType,
} from '../control-plane/control-plane-constants.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../control-plane/control-plane-readiness-constants.js';
import {
  CONTROL_PLANE_READ_STRATEGY,
} from '../control-plane/control-plane-system-table-gateway.js';
import {
  createControlPlaneRuntimeBundle,
} from '../control-plane/control-plane-runtime-bundle.js';
import {
  PRESSURE_WORK_CLASS,
} from '../control-plane/pressure-governor.js';
import {LoggingService} from '../logging/logging-service.js';
import {NodeService} from '../node/node-service.js';
import {HLCClockService} from '../hlc/hlc-clock-service.js';
import {HLCTimestamp} from '../hlc/hlc-timestamp.js';
import {
  INITIAL_MESSAGE_GROUP_ID,
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
} from '../bootstrap/system-table-schemas-constants.js';
import {
  attachTrafficReadinessListener,
  isBackgroundWorkReady as isBackgroundWorkLifecycleReady,
  isMetadataPublicationReady as isMetadataPublicationLifecycleReady,
} from '../bootstrap/traffic-readiness-utils.js';
import {isSystemTableWriteReady} from '../cache/leader-readiness-gate.js';
import {InMemoryLogAdapter} from '../raft/in-memory-log-adapter.js';
import {isRaftPacket, RAFT_PACKET_TYPES} from '../raft/raft-packet-utils.js';
import {
  RAFT_ELECTION_TIMING,
  RAFT_EVENT,
  RAFT_PACKET_TYPE,
} from '../raft/constants.js';
import {
  applyRuntimeRaftTiming,
  computeReplicaElectionTimeouts,
} from '../raft/raft-timing-utils.js';
import {LeaderActivationGate} from '../raft/leader-activation-gate.js';
import {LeaderActivationScheduler} from '../raft/leader-activation-scheduler.js';
import {assertRaftProviderContract} from '../raft/raft-provider-contract.js';
import {LiferaftProvider} from '../raft/liferaft-provider.js';
import {AuthoritativeRowMutationHelper} from '../raft/authoritative-row-mutation-helper.js';
import {wireReplicaLifecycleEvents} from '../raft/replica-leadership-state.js';
import {normalizePublishedRaftRole} from '../raft/published-raft-role.js';
import {AddressManager} from '../address/address-manager.js';
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
  MESSAGE_GROUP_OPERATION_LEDGER_NOW,
  MESSAGE_GROUP_SERVICE_DEFAULT,
  MESSAGE_GROUP_SERVICE_ERROR_MSG,
  MESSAGE_GROUP_SERVICE_LOG_MSG,
  MESSAGE_GROUP_SUBSYSTEM,
  MESSAGE_STATUS as MessageStatus,
  RAFT_ROLE as RaftRole,
} from './constants.js';
import {
  CDCHandler,
} from './cdc-handler.js';
import {MessageGroupForwardingOwner} from './message-group-forwarding-owner.js';
import {getOrCreateCauseId, normalizeCauseId} from '../utils/cause-id.js';
import {MessageGroupOperationLedger} from './message-group-operation-ledger.js';
import {QUERY_MESSAGE_TYPE} from '../query/query-constants.js';

// Note: isRaftPacket and RAFT_PACKET_TYPES are imported from shared module
// src/raft/raft-packet-utils.js - Requirements: 9.1, 9.2, 9.3, 9.4

const ROLE_PERSIST_ERROR_MSG =
  'Failed to persist raft role update';
const LEADER_NODE_PERSIST_ERROR_MSG =
  'Failed to persist message group leader update';
const FLUSH_SKIP_NOT_OWNER = 'not-owner';
const FLUSH_SKIP_READY = 'ready';
const FLUSH_SKIP_DISABLED = 'disabled';
const CDC_FORWARD_MAX_RELAY_DEPTH = NUM.TWO;
const CDC_FORWARD_ERROR_DETAIL_MAX_LENGTH = NUM.TWO_HUNDRED_FIFTY_SIX;
const CDC_FORWARD_ERROR_TRUNCATION_SUFFIX = '...[truncated]';
const CDC_BATCH_COMMAND_TYPE = 'CDC_BATCH';
const FORWARD_TOPOLOGY_REPAIR_DEFAULT = Object.freeze({
  COOLDOWN_MS: 1000,
  FAILURE_COOLDOWN_MS: 5000,
  NO_CHANGE_COOLDOWN_MS: 2000,
  QUERY_TIMEOUT_MS: 1500,
});
const CONTROL_PLANE_PARTITION_IDS = new Set(
  Object.values(INITIAL_PARTITION_IDS),
);
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
  const error = new Error(
    deliveryResult?.error || 'Message delivery deferred',
  );
  if (typeof deliveryResult?.errorCode === TYPEOF.STRING &&
      deliveryResult.errorCode.length > NUM.ZERO) {
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
    wrappedError.retryAfterMs = Math.max(NUM.ONE, Math.floor(error.retryAfterMs));
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
  if (typeof detail !== TYPEOF.STRING ||
      detail.length <= CDC_FORWARD_ERROR_DETAIL_MAX_LENGTH) {
    return detail || '';
  }
  return detail.substring(
    NUM.ZERO,
    CDC_FORWARD_ERROR_DETAIL_MAX_LENGTH,
  ) + CDC_FORWARD_ERROR_TRUNCATION_SUFFIX;
}

function isControlPlaneTransportTarget(targetService) {
  if (typeof targetService !== TYPEOF.STRING || targetService.length === 0) {
    return false;
  }
  const [nodeId, entityType, entityId] = targetService.split('/');
  if (!nodeId || !entityType || !entityId) {
    return false;
  }
  if (entityType === ENTITY_TYPE.PARTITION) {
    const partitionId = entityId.replace(/-r\d+$/, '');
    return CONTROL_PLANE_PARTITION_IDS.has(partitionId);
  }
  if (entityType === ENTITY_TYPE.MESSAGE_GROUP) {
    return entityId === INITIAL_MESSAGE_GROUP_ID ||
      entityId.startsWith(`${INITIAL_MESSAGE_GROUP_ID}-r`);
  }
  return false;
}

function resolveTransportDeliveryOptions(targetService) {
  return isControlPlaneTransportTarget(targetService) ?
    {deliveryPriority: 'critical'} :
    undefined;
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
    this.now = typeof options.now === TYPEOF.FUNCTION ?
      options.now :
      MESSAGE_GROUP_OPERATION_LEDGER_NOW;
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
      options.leaderActivationStabilizationMs >= NUM.ZERO ?
        Math.floor(options.leaderActivationStabilizationMs) :
        (
          config.get(CONFIG_KEY.RAFT_LEADER_ACTIVATION_STABILIZATION_MS) ??
          250
        );
    this.leaderActivationNodeSpacingMs =
      Number.isFinite(options.leaderActivationNodeSpacingMs) &&
      options.leaderActivationNodeSpacingMs >= NUM.ZERO ?
        Math.floor(options.leaderActivationNodeSpacingMs) :
        (
          config.get(CONFIG_KEY.RAFT_LEADER_ACTIVATION_NODE_SPACING_MS) ??
          25
        );
    this.forwardTargetSuppressionMs =
      Number.isFinite(options.forwardTargetSuppressionMs) &&
      options.forwardTargetSuppressionMs > NUM.ZERO ?
        Math.floor(options.forwardTargetSuppressionMs) :
        Math.min(this.retryMaxDelayMs, TIME_MS.SECOND * NUM.FIVE);
    this.forwardTopologyRepairCooldownMs =
      Number.isFinite(options.forwardTopologyRepairCooldownMs) &&
      options.forwardTopologyRepairCooldownMs > NUM.ZERO ?
        Math.floor(options.forwardTopologyRepairCooldownMs) :
        FORWARD_TOPOLOGY_REPAIR_DEFAULT.COOLDOWN_MS;
    this.forwardTopologyRepairFailureCooldownMs =
      Number.isFinite(options.forwardTopologyRepairFailureCooldownMs) &&
      options.forwardTopologyRepairFailureCooldownMs > NUM.ZERO ?
        Math.floor(options.forwardTopologyRepairFailureCooldownMs) :
        FORWARD_TOPOLOGY_REPAIR_DEFAULT.FAILURE_COOLDOWN_MS;
    this.forwardTopologyRepairNoChangeCooldownMs =
      Number.isFinite(options.forwardTopologyRepairNoChangeCooldownMs) &&
      options.forwardTopologyRepairNoChangeCooldownMs > NUM.ZERO ?
        Math.floor(options.forwardTopologyRepairNoChangeCooldownMs) :
        FORWARD_TOPOLOGY_REPAIR_DEFAULT.NO_CHANGE_COOLDOWN_MS;
    this.forwardTopologyRepairQueryTimeoutMs =
      Number.isFinite(options.forwardTopologyRepairQueryTimeoutMs) &&
      options.forwardTopologyRepairQueryTimeoutMs > NUM.ZERO ?
        Math.floor(options.forwardTopologyRepairQueryTimeoutMs) :
        FORWARD_TOPOLOGY_REPAIR_DEFAULT.QUERY_TIMEOUT_MS;

    // Raft state - using liferaft library
    // Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
    this.raft = null; // Initialized in initialize()
    this.logAdapter = new InMemoryLogAdapter();
    // Note: transportAdapter removed - RaftNode.write() now calls messageRouter directly
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
        getSqlQueryEngine: () => this.cdcIntegrationService?.sqlQueryEngine || null,
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
    this.leaderActivationScheduler = options.leaderActivationScheduler ||
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
    if (previousCache &&
        previousCache !== systemTableCache &&
        typeof previousCache.offCacheChange === TYPEOF.FUNCTION &&
        this.systemTableCacheChangeListener) {
      previousCache.offCacheChange(this.systemTableCacheChangeListener);
    }

    this._systemTableCache = systemTableCache;
    this.roleMutationHelper?.setSystemTableCache(systemTableCache);
    this.leaderNodeMutationHelper?.setSystemTableCache(systemTableCache);
    if (this.rebalancer) {
      this.rebalancer.systemTableCache = systemTableCache;
    }
    if (systemTableCache &&
        systemTableCache !== previousCache &&
        typeof systemTableCache.onCacheChange === TYPEOF.FUNCTION &&
        this.systemTableCacheChangeListener) {
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
    this.leaderNodeMutationHelper?.setCdcIntegrationService(cdcIntegrationService);
    if (this.rebalancer) {
      this.rebalancer.cdcIntegrationService = cdcIntegrationService;
    }
  }

  get metadataPublicationReadinessState() {
    return this._metadataPublicationReadinessState || null;
  }

  set metadataPublicationReadinessState(readinessState) {
    if (typeof this.releaseMetadataPublicationReadinessListener ===
      TYPEOF.FUNCTION) {
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
      this.roleMutationHelper.pendingValue =
        normalizePublishedRaftRole(role, {collapseLeaderToFollower: true});
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
    return isMetadataPublicationLifecycleReady(this.metadataPublicationReadinessState);
  }

  isMetadataPublicationConvergenceWindowOpen() {
    return this.isMetadataPublicationReady() &&
      !this.isBackgroundWorkReady();
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
      this.logger.warn('Failed to flush deferred message-group role update', {
        groupId: this.groupId,
        replicaId: this.replicaId,
        error: error.message,
      });
    });
    this.flushLeaderNodeUpdate().catch((error) => {
      this.logger.warn('Failed to flush deferred message-group leader update', {
        groupId: this.groupId,
        replicaId: this.replicaId,
        error: error.message,
      });
    });
  }

  createRoleMutationHelper() {
    return new AuthoritativeRowMutationHelper({
      tableName: SYSTEM_TABLE_NAME.SERVICES,
      buildWhereClause: (_role, context = {}) => {
        const whereClause = {[COLUMN.SERVICE_ID]: this.replicaId};
        const cachedRow = context.cachedRow;
        if (typeof cachedRow?.raft_role === 'string' && cachedRow.raft_role.length > 0) {
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
        deliveryPriority: 'background',
        workClass: PRESSURE_WORK_CLASS.BACKGROUND,
        allowPressureDefer: true,
        routingReadinessDimension:
          this.getMetadataPublicationReadinessDimension(),
      }),
      buildExpectedCacheFields: (role) => ({
        raft_role: role,
      }),
      prepareFlush: () => ({
        skip: !this.publishRoleMetadata,
        clearPending: !this.publishRoleMetadata,
        reason: !this.publishRoleMetadata ?
          FLUSH_SKIP_DISABLED :
          FLUSH_SKIP_READY,
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
        const whereClause = {[COLUMN.GROUP_ID]: this.groupId};
        const cachedRow = context.cachedRow;
        if (typeof cachedRow?.[COLUMN.LEADER_NODE_ID] === 'string' &&
            cachedRow[COLUMN.LEADER_NODE_ID].length > 0) {
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
        const cached = systemTableCache?.get?.(TABLES.MESSAGE_GROUPS, this.groupId);
        return cached?.[COLUMN.LEADER_NODE_ID] || null;
      },
      prepareFlush: () => ({
        skip: !this.publishLeaderNodeMetadata || !this.isLeader,
        clearPending: !this.publishLeaderNodeMetadata || !this.isLeader,
        reason: !this.publishLeaderNodeMetadata ?
          FLUSH_SKIP_DISABLED :
          (!this.isLeader ? FLUSH_SKIP_NOT_OWNER : FLUSH_SKIP_READY),
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
    if (!transport) return false;

    // Check for required methods
    const hasDeliver = typeof transport.deliver === TYPEOF.FUNCTION;
    const hasInitialize = typeof transport.initialize === TYPEOF.FUNCTION;

    // Check for MessageRouter marker
    const isMessageRouter = typeof transport.setServiceNodeResolver === TYPEOF.FUNCTION;

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
   * Looks up the address from peerAddresses array, system table cache, or falls back.
   * Uses AddressManager for consistent address formatting and validation.
   * Requirements: 1.1, 1.4, 9.1
   * @param {string} peerId - Peer replica ID.
   * @return {string} Unified address for the peer.
   */
  buildPeerAddress(peerId) {
    // If peerId is already in unified format, validate and return as-is.
    // Fail fast (and log) when a provided address is not unified.
    // Requirements: 1.4
    if (peerId.includes(ADDRESS.SEPARATOR)) {
      const validation = this.addressManager.validate(peerId);
      if (validation.valid) {
        return peerId;
      }
      this.logger.error('Peer address must be in unified format', {
        peerId,
        groupId: this.groupId,
        replicaId: this.replicaId,
        error: validation.error,
      });
      throw new Error(`Peer address must be unified: ${peerId}`);
    }

    // Prefer cache-backed topology first so handoff/move metadata wins over
    // bootstrap-time peer hints.
    const cachedAddress = this.resolvePeerAddressFromCache(peerId);
    if (cachedAddress) {
      this.bootstrapHintFallbackLogged.delete(peerId);
      return cachedAddress;
    }

    const hintedAddress = this.resolvePeerAddressFromHints(peerId);
    if (hintedAddress) {
      this.logBootstrapHintFallback(peerId, hintedAddress);
      return hintedAddress;
    }

    throw new Error(`Unable to resolve unified peer address for ${peerId}`);
  }

  resolvePeerAddressFromHints(peerId) {
    if (!this.peerAddresses || this.peerAddresses.length === 0) {
      return null;
    }
    for (const addr of this.peerAddresses) {
      const validation = this.addressManager.validate(addr);
      if (!validation.valid) {
        this.logger.error('Peer address must be in unified format', {
          peerId: addr,
          groupId: this.groupId,
          replicaId: this.replicaId,
          error: validation.error,
        });
        throw new Error(`Peer address must be unified: ${addr}`);
      }
      try {
        const parsed = this.addressManager.parse(addr);
        if (parsed.serviceId === peerId) {
          return addr;
        }
      } catch (_e) {
        // Ignore parse errors here; validation already guards format.
      }
    }
    return null;
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
    this.logger.warn('Using bootstrap peer hint because services cache has no peer location', {
      groupId: this.groupId,
      replicaId: this.replicaId,
      peerId,
      address,
      resolutionSource: 'bootstrap_hint',
    });
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

    if ((record?.[COLUMN.GROUP_ID] || record?.group_id) !== this.groupId ||
        (record?.[COLUMN.SERVICE_TYPE] || record?.service_type) !==
          SERVICE_TYPE.MESSAGE_GROUP) {
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

  /**
   * Join newly visible peers and replace moved peer addresses using the
   * authoritative services cache. Missing rows are ignored conservatively.
   * @private
   */
  reconcileRaftPeersFromCache() {
    if (!this.raft ||
        !this.systemTableCache ||
        typeof this.systemTableCache.filter !== TYPEOF.FUNCTION) {
      return;
    }

    const services = this.systemTableCache.filter(TABLES.SERVICES, (service) => {
      return (service?.[COLUMN.GROUP_ID] || service?.group_id) === this.groupId &&
        (service?.[COLUMN.SERVICE_TYPE] || service?.service_type) ===
          SERVICE_TYPE.MESSAGE_GROUP;
    });
    if (services.length === NUM.ZERO) {
      return;
    }

    const expectedAddressesByReplicaId = new Map();
    for (const service of services) {
      const replicaId = service?.[COLUMN.SERVICE_ID] ||
        service?.service_id ||
        service?.[COLUMN.REPLICA_ID] ||
        service?.replica_id;
      if (!replicaId) {
        continue;
      }

      const status = service?.[COLUMN.STATUS] ||
        service?.status ||
        ReplicaStatus.ACTIVE;
      if (status === ReplicaStatus.FAILED ||
          status === ReplicaStatus.REMOVING ||
          status === ReplicaStatus.REMOVED) {
        continue;
      }

      const peerAddress =
        typeof (service?.[COLUMN.ADDRESS] || service?.address) === TYPEOF.STRING &&
          (service?.[COLUMN.ADDRESS] || service?.address).length > NUM.ZERO ?
          (service?.[COLUMN.ADDRESS] || service?.address) :
          (
            typeof (service?.[COLUMN.NODE_ID] || service?.node_id) === TYPEOF.STRING &&
            (service?.[COLUMN.NODE_ID] || service?.node_id).length > NUM.ZERO ?
              this.addressManager.format(
                service?.[COLUMN.NODE_ID] || service?.node_id,
                ENTITY_TYPE.MESSAGE_GROUP,
                replicaId,
              ) :
              null
          );
      if (!peerAddress ||
          this.isLocalForwardTarget(replicaId, peerAddress)) {
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
        .filter((address) =>
          typeof address === TYPEOF.STRING && address.length > NUM.ZERO,
        ),
    );

    for (const [replicaId, expectedAddress] of expectedAddressesByReplicaId.entries()) {
      const staleAddresses = currentNodes
        .map((node) => node?.address)
        .filter((address) => {
          if (typeof address !== TYPEOF.STRING ||
              address.length === NUM.ZERO ||
              address === expectedAddress) {
            return false;
          }
          try {
            const parsed = this.addressManager.parse(address);
            return parsed.serviceType === ENTITY_TYPE.MESSAGE_GROUP &&
              parsed.serviceId === replicaId;
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

    this.logger.info('Initializing message group service', {
      groupId: this.groupId,
      replicaId: this.replicaId,
      nodeId: this.nodeId,
      replicaCount: this.replicaIds.length,
    });

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

    // Create extended LifeRaft class with our transport using ES6 class inheritance
    // Requirements: 2.1, 2.2, 3.1, 3.2, 3.3, 3.4
    const self = this;
    const deferElection = this.deferElection;

    /**
     * Custom Raft node class that extends LifeRaft with our transport.
     * Simplified to call messageRouter.deliver() directly without type conversion.
     * Supports deferred election start to prevent election storms during bootstrap.
     * Requirements: 3.1, 3.2, 3.3, 3.4
     */
    class RaftNode extends LifeRaft {
      /**
       * Override initialize to support deferred election start.
       * When deferElection is true, we don't start the heartbeat timer.
       * Call startElection() later to begin the election process.
       * @param {Object} _options - Initialization options (unused).
       * @param {Function} callback - Completion callback.
       */
      initialize(_options, callback) {
        if (deferElection) {
          // Don't start heartbeat timer - election will be started manually
          self.logger.debug('Deferring election start', {
            replicaId: self.replicaId,
            groupId: self.groupId,
          });
          // Just signal initialization complete without starting timer
          if (callback) callback();
        } else {
          // Normal initialization - heartbeat timer will start automatically
          if (callback) callback();
        }
      }

      /**
       * Write method for sending Raft messages to peers.
       * Called by liferaft when it needs to communicate with other nodes.
       * Sends packets directly to MessageRouter without type conversion.
       * Note: When liferaft calls node.write(), 'this' is the cloned node
       * representing the peer, so 'this.address' is the destination address.
       * Requirements: 3.1, 3.2, 3.3, 3.4
       * @param {Object} packet - Raft protocol packet (packet.address is sender)
       * @param {Function} callback - Completion callback
       */
      write(packet, callback) {
        // Build peer address for routing
        // this.address is the destination, packet.address is the sender
        const peerAddress = self.buildPeerAddress(this.address);
        const deliveryOptions = resolveTransportDeliveryOptions(peerAddress);

        // Send packet unchanged - no type conversion
        // Only add destination address for routing, preserve all packet fields
        // Requirements: 3.1, 3.2, 3.3
        self.transport.deliver(peerAddress, packet, deliveryOptions)
          .then((result) => callback(null, result))
          .catch((err) => callback(err));
      }
    }


    // Create liferaft instance
    // Use unified address so that packet.address contains the full address
    // This allows other nodes to respond to vote requests correctly
    // Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
    this.raft = new RaftNode(this.unifiedAddress, {
      'heartbeat': heartbeatMs,
      'election min': electionMinMs,
      'election max': electionMaxMs,
      'Log': InMemoryLogAdapter,
    });
    this.armJoinExistingGroupElectionSuppression();

    // If deferElection is true, clear all timers that liferaft started automatically
    // This prevents elections from starting until startElection() is called
    // Liferaft's _initialize() sets up a 'state change' handler that starts timers
    if (this.deferElection && this.raft) {
      this.raftProvider.clearTimers(this.raft, 'heartbeat, election');
      this.logger.debug('Cleared liferaft timers for deferred election', {
        replicaId: this.replicaId,
        groupId: this.groupId,
      });
    }

    // Wrap post-raft-creation setup so that if peer resolution or any
    // subsequent step throws, we clean up the raft instance and its
    // timers. Without this, a failed initialize() leaks liferaft timers
    // that keep the Node.js process alive indefinitely.
    try {
      this.wireRaftEvents();
      this.joinPeerNodes();
      this.reconcileRaftPeersFromCache();
      this.promoteIfSingleReplica();
    } catch (error) {
      this.logger.error('Failed during initialize, cleaning up raft', {
        groupId: this.groupId,
        replicaId: this.replicaId,
        error: error.message,
      });
      if (this.raft) {
        this.raftProvider.shutdownNode(this.raft);
        this.raft = null;
      }
      throw error;
    }

    this.cdcHandler.initialize();
    this.initialized = true;
    this.maybeInitializeRebalancer();

    this.logger.info('Message group service initialized', {
      groupId: this.groupId,
      replicaId: this.replicaId,
      role: this.role,
    });

    this.emit('initialized', {groupId: this.groupId, replicaId: this.replicaId});
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
      if (eventName !== RAFT_EVENT.FOLLOWER &&
          eventName !== RAFT_EVENT.CANDIDATE) {
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
        this.logger.debug('Leader changed', {
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
   */
  joinPeerNodes() {
    for (const peerId of this.replicaIds) {
      if (peerId === this.replicaId &&
          !this.resolvePeerAddressFromCache(peerId) &&
          !this.resolvePeerAddressFromHints(peerId)) {
        continue;
      }
      const peerAddress = this.buildPeerAddress(peerId);
      if (this.isLocalForwardTarget(peerId, peerAddress)) {
        continue;
      }
      this.raftProvider.joinPeer(this.raft, peerAddress);
    }
  }

  /**
   * For single-replica groups, promote to leader immediately.
   * This avoids the election timer delay during bootstrap.
   * @private
   */
  promoteIfSingleReplica() {
    if (this.replicaIds.length === 1) {
      this.role = RaftRole.LEADER;
      this.isLeader = true;
      this.leaderId = this.replicaId;
      this.queueRoleUpdate(this.role);
      this.queueLeaderNodeUpdate(this.nodeId);
      this.updateRebalancerLeadership();

      this.logger.info('Single replica - becoming leader immediately', {
        replicaId: this.replicaId,
        groupId: this.groupId,
      });

      this.emit('leaderElected', {
        leaderId: this.replicaId,
        term: this.raftProvider.getCurrentTerm(this.raft),
        groupId: this.groupId,
      });
    }
  }

  /**
   * Start the Raft election timer.
   * Call this after all replicas in the group have been created and registered.
   * This prevents election storms when multiple replicas are created on the same node.
   * If deferElection was false, this is a no-op (election already started).
   */
  startElection() {
    if (this.electionStarted) {
      return;
    }

    // For single-replica groups, we're already leader
    if (this.replicaIds.length === 1) {
      this.electionStarted = true;
      return;
    }

    this.electionStarted = true;

    if (this.raft) {
      this.logger.info('Starting Raft election timer', {
        replicaId: this.replicaId,
        groupId: this.groupId,
        peerCount: this.replicaIds.length - 1,
      });

      this.raftProvider.startElectionTimer(this.raft);
    }
  }

  clearJoinExistingGroupTimers() {
    if (!this.raft) {
      return;
    }
    this.raftProvider.clearTimers(this.raft, 'heartbeat, election');
  }

  shouldSuppressJoinPhaseRaftParticipation() {
    return this.isJoiningExistingGroup === true ||
      this.deferElectionUntilJoinConvergence === true;
  }

  armJoinExistingGroupElectionSuppression() {
    if (!this.raft ||
        !this.shouldSuppressJoinPhaseRaftParticipation() ||
        this.joinSuppressedHeartbeat) {
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
    if (!Number.isFinite(heartbeatMs) ||
      !Number.isFinite(baseElectionMinMs) ||
      !Number.isFinite(baseElectionMaxMs) ||
      (hasTickInterval && (!Number.isFinite(tickIntervalMs) || tickIntervalMs <= 0)) ||
      baseElectionMinMs > baseElectionMaxMs) {
      return false;
    }

    const {electionMinMs, electionMaxMs, jitterMs} =
      computeReplicaElectionTimeouts({
        replicaId: this.replicaId,
        replicaIds: this.replicaIds,
        baseElectionMinMs,
        baseElectionMaxMs,
        electionJitterPerReplicaMs:
          RAFT_ELECTION_TIMING.JITTER_PER_REPLICA_MS,
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

    const shouldRearmTimer = this.replicaIds.length > NUM.ONE &&
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

    const tickChanged = hasTickInterval &&
      tickIntervalMs !== previousTickIntervalMs;
    const tickRuntimeApplied = !tickChanged ||
      this.applyRuntimeTickInterval(tickIntervalMs);

    this.logger.info('Applied runtime raft timing configuration', {
      groupId: this.groupId,
      replicaId: this.replicaId,
      heartbeatMs,
      electionMinMs,
      electionMaxMs,
      tickIntervalMs: hasTickInterval ? tickIntervalMs : null,
      tickRuntimeApplied,
      jitterMs,
      rearmTimer: shouldRearmTimer,
    });
    return tickRuntimeApplied;
  }

  /**
   * Apply raft provider tick interval when supported by the active provider.
   * @param {number} tickIntervalMs
   * @return {boolean} True when applied to a live raft instance.
   */
  applyRuntimeTickInterval(tickIntervalMs) {
    if (!this.raft ||
      !Number.isFinite(tickIntervalMs) ||
      tickIntervalMs <= 0) {
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

    if (Object.prototype.hasOwnProperty.call(this.raft, 'tickIntervalMs')) {
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
    case 'MESSAGE':
      // Handle message persistence - already tracked in pendingMessages
      break;
    case 'CDC':
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
      this.emit('cdcApplied', command);
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
        this.emit('cdcApplied', {
          tableName: event.tableName,
          operation: event.operation,
          data: event.data,
          logIndex: command.index || null,
          causeId: normalizeCauseId(event.causeId),
        });
      }
      break;
    case 'ACK':
      // Handle acknowledgment
      this.acknowledgedMessages.add(command.messageId);
      break;
    }
  }

  /**
   * Send a message to a target service.
   * Implements simultaneous delivery and persistence pattern.
   * @param {string} targetService - Target service address.
   * @param {Object} message - Message payload.
   * @param {Object} [options]
   * @param {string} [options.deliveryMode]
   * @return {Promise<Object>} Delivery result.
   */
  async sendMessage(targetService, message, options = {}) {
    if (!this.initialized) {
      throw new Error('MessageGroupService not initialized');
    }

    const messageId = uuidv4();
    const timestamp = this.hlcClock.now();

    const messageEnvelope = {
      id: messageId,
      sourceReplica: this.replicaId,
      sourceGroup: this.groupId,
      targetService,
      payload: message,
      timestamp: timestamp.toString(),
      status: MessageStatus.PENDING,
      attempts: 0,
      createdAt: this.now(),
    };


    this.logger.debug('Sending message', {
      messageId,
      targetService,
      groupId: this.groupId,
    });

    // Track pending message
    this.pendingMessages.set(messageId, messageEnvelope);

    const deliveryMode = this.resolveMessageDeliveryMode(
      targetService,
      message,
      options,
    );
    if (deliveryMode === MESSAGE_DELIVERY_MODE.DIRECT_ONLY) {
      return this.deliverDirectOnlyMessage(messageEnvelope);
    }

    // Simultaneous delivery and persistence (non-blocking)
    const deliveryPromise = this.attemptDirectDelivery(messageEnvelope);
    const persistPromise = this.persistToRaftLog(messageEnvelope);

    try {
      // Wait for delivery to complete - we need the result for ACK extraction
      // Persistence happens in parallel but we prioritize delivery result
      const [deliveryResult, _persistResult] = await Promise.all([
        deliveryPromise,
        persistPromise,
      ]);

      if (deliveryResult.delivered) {
        // Direct delivery succeeded
        messageEnvelope.status = MessageStatus.DELIVERED;
        this.logger.debug('Message delivered directly', {
          messageId,
          targetService,
        });
        // Spread the transport result directly - ACK structure is flat
        const {delivered: _d, attempt: _a, ...transportResult} = deliveryResult;
        return {
          messageId,
          status: MessageStatus.DELIVERED,
          deliveryType: 'direct',
          ...transportResult,
        };
      }

      this.logger.debug('Message persisted to Raft log (delivery failed)', {
        messageId,
        targetService,
      });

      return {
        messageId,
        status: MessageStatus.PENDING,
        deliveryType: 'persisted',
      };
    } catch (error) {
      this.logger.error('Failed to send message', {
        messageId,
        targetService,
        error: error.message,
      });

      messageEnvelope.status = MessageStatus.FAILED;
      throw error;
    }
  }


  /**
   * Attempt direct delivery to target service.
   * Throws error if transport is unavailable (defense in depth).
   * @param {Object} messageEnvelope - Message envelope.
   * @param {Object} options
   * @param {number} [options.maxAttempts]
   * @param {boolean} [options.disableRetryDelay]
   * @return {Promise<Object>} Delivery result.
   * @private
   */
  async attemptDirectDelivery(messageEnvelope, options = {}) {
    const {id: messageId, targetService, payload} = messageEnvelope;

    // Transport is guaranteed to exist (validated in constructor)
    // but we still check at runtime for defense in depth
    if (!this.transport) {
      this.logger.error('WebSocket transport not available for message delivery', {
        messageId,
        targetService,
        groupId: this.groupId,
      });
      throw new Error('WebSocket transport required but not available');
    }

    let lastError = null;

    const maxAttempts = Number.isInteger(options?.maxAttempts) &&
      options.maxAttempts > NUM.ZERO ?
      options.maxAttempts :
      this.retryMaxAttempts;
    const disableRetryDelay = options?.disableRetryDelay === true;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      messageEnvelope.attempts++;

      try {
        // Calculate delay with exponential backoff and jitter
        if (!disableRetryDelay && attempt > 0) {
          const baseDelay = Math.min(
            this.retryInitialDelayMs * Math.pow(this.retryBackoffMultiplier, attempt - 1),
            this.retryMaxDelayMs,
          );
          const jitter = baseDelay * this.retryJitterFactor * Math.random();
          const delay = baseDelay + jitter;
          await this.sleep(delay);
        }

        // Attempt delivery via transport
        const deliveryOptions =
          resolveTransportDeliveryOptions(targetService);
        const result = await this.transport.deliver(targetService, {
          messageId,
          payload,
          sourceGroup: this.groupId,
          sourceReplica: this.replicaId,
        }, deliveryOptions);

        if (result && result.acknowledged) {
          // Spread transport result directly - ACK structure is flat
          return {delivered: true, attempt: attempt + 1, ...result};
        }
        if (shouldDeferImmediateDeliveryRetry(result)) {
          return {
            delivered: false,
            attempt: attempt + 1,
            error: result?.error || 'Message delivery deferred',
            deferRetry: true,
            retryAfterMs: result.retryAfterMs,
            errorCode: result?.errorCode || null,
          };
        }
        lastError = new Error(result?.error || 'Message delivery not acknowledged');
      } catch (error) {
        lastError = error;
        this.logger.debug('Delivery attempt failed', {
          messageId,
          targetService,
          attempt: attempt + 1,
          error: error.message,
        });
      }
    }

    return {
      delivered: false,
      error: lastError?.message || 'Max retries exceeded',
    };
  }

  /**
   * Determine whether payload should use fast non-durable query delivery.
   * @param {Object} payload
   * @return {boolean}
   * @private
   */
  isQueryDeliveryPayload(payload) {
    return Boolean(
      payload &&
      typeof payload === TYPEOF.OBJECT &&
      payload.type === QUERY_MESSAGE_TYPE.QUERY,
    );
  }

  /**
   * Determine whether payload is an idempotent control-plane message that
   * should use direct delivery without duplicate Raft durability.
   * @param {Object} payload
   * @return {boolean}
   * @private
   */
  isDirectOnlyControlPlanePayload(payload) {
    return Boolean(
      payload &&
      typeof payload === TYPEOF.OBJECT &&
      DIRECT_ONLY_MESSAGE_TYPES.has(payload.type),
    );
  }

  /**
   * Resolve the canonical delivery mode for one outbound message.
   * @param {string} _targetService
   * @param {Object} payload
   * @param {Object} [options]
   * @return {string}
   * @private
   */
  resolveMessageDeliveryMode(_targetService, payload, options = {}) {
    const explicitMode = normalizeMessageDeliveryMode(options?.deliveryMode);
    if (explicitMode !== MESSAGE_DELIVERY_MODE.AUTO) {
      return explicitMode;
    }
    if (this.isQueryDeliveryPayload(payload) ||
        this.isDirectOnlyControlPlanePayload(payload)) {
      return MESSAGE_DELIVERY_MODE.DIRECT_ONLY;
    }
    return MESSAGE_DELIVERY_MODE.DIRECT_WITH_RAFT_DURABILITY;
  }

  /**
   * Send one message through the fast direct-only path.
   * @param {Object} messageEnvelope
   * @return {Promise<Object>}
   * @private
   */
  async deliverDirectOnlyMessage(messageEnvelope) {
    const {id: messageId, targetService, payload} = messageEnvelope;
    const failureDescription = this.isQueryDeliveryPayload(payload) ?
      'Query message delivery failed' :
      'Message delivery failed';
    try {
      const deliveryResult = await this.attemptDirectDelivery(
        messageEnvelope,
        {
          maxAttempts: NUM.ONE,
          disableRetryDelay: true,
        },
      );
      if (!deliveryResult.delivered) {
        throw shouldDeferImmediateDeliveryRetry(deliveryResult) ?
          buildDeferredDeliveryError(deliveryResult) :
          new Error(deliveryResult.error || failureDescription);
      }
      messageEnvelope.status = MessageStatus.DELIVERED;
      this.pendingMessages.delete(messageId);
      const {delivered: _d, attempt: _a, ...transportResult} = deliveryResult;
      return {
        messageId,
        status: MessageStatus.DELIVERED,
        deliveryType: 'direct',
        ...transportResult,
      };
    } catch (error) {
      const logLevel = error?.deferRetry === true ? 'debug' : 'error';
      this.logger[logLevel]('Failed to send message', {
        messageId,
        targetService,
        error: error.message,
        deferRetry: error?.deferRetry === true,
        retryAfterMs: Number.isFinite(error?.retryAfterMs) ?
          error.retryAfterMs :
          null,
      });
      messageEnvelope.status = MessageStatus.FAILED;
      this.pendingMessages.delete(messageId);
      throw error;
    }
  }


  /**
   * Persist message to Raft log.
   * Uses liferaft's command method for log replication.
   * Note: Does not wait for commit - fire and forget for performance.
   * @param {Object} messageEnvelope - Message envelope.
   * @return {Promise<Object>} Persistence result.
   * @private
   */
  async persistToRaftLog(messageEnvelope) {
    const entry = this.operationLedger.appendEntry({
      type: 'MESSAGE',
      message: messageEnvelope,
    });

    // Only use liferaft's command if it considers itself the leader
    // For single-replica groups, liferaft may not be in LEADER state
    const isLiferaftLeader = this.raft && this.raft.state === LifeRaft.LEADER;
    if (isLiferaftLeader) {
      // Fire and forget - don't wait for commit
      // The command will be replicated via heartbeats
      this.raftProvider.propose(this.raft, {
        type: 'MESSAGE',
        message: messageEnvelope,
      }, (err) => {
        if (err) {
          this.logger.debug('Raft command failed', {
            messageId: messageEnvelope.id,
            error: err.message,
          });
        }
      });
    }

    return {
      success: true,
      index: entry.index,
      term: entry.term,
    };
  }


  /**
   * Receive a message from another service or replica.
   * Detects Raft packets and routes them directly to liferaft.
   * Handles non-Raft messages as application messages.
   * Requirements: 2.2, 2.3, 5.2, 5.3
   * @param {Object} message - Incoming message.
   * @return {Promise<Object>} Processing result.
   */
  async receiveMessage(message) {
    if (!this.initialized) {
      throw new Error('MessageGroupService not initialized');
    }

    // Extract payload - handle both envelope and direct packet formats
    const payload = message.payload || message;

    // Detect and handle Raft packets directly using isRaftPacket()
    // No type conversion needed - packets flow through unchanged
    // Requirements: 2.2, 2.3
    if (isRaftPacket(payload)) {
      if (this.raft) {
        this.logger.trace('Received Raft packet', {
          type: payload.type,
          term: payload.term,
          address: payload.address,
          replicaId: this.replicaId,
          groupId: this.groupId,
        });

        // Create write function for sending responses back to the sender
        // The sender's address is in payload.address
        // Requirements: 2.2
        const senderAddress = payload.address;
        const write = (responsePacket) => {
          if (responsePacket) {
            const deliveryOptions =
              resolveTransportDeliveryOptions(senderAddress);
            this.logger.trace('Sending Raft response', {
              type: responsePacket.type,
              destination: senderAddress,
              term: responsePacket.term,
            });
            // Send response to the sender
            this.transport.deliver(
              senderAddress,
              responsePacket,
              deliveryOptions,
            )
              .then((result) => {
                if (!result?.acknowledged &&
                    shouldDeferImmediateDeliveryRetry(result)) {
                  this.logger.debug('Deferred Raft response delivery', {
                    destination: senderAddress,
                    retryAfterMs: result.retryAfterMs,
                    errorCode: result?.errorCode || null,
                  });
                }
              })
              .catch((err) => {
                this.logger.error('Failed to send Raft response', {
                  error: err.message,
                  destination: senderAddress,
                });
              });
          }
        };

        if (this.isJoiningExistingGroup === true &&
            payload.type === RAFT_PACKET_TYPE.VOTE) {
          this.clearJoinExistingGroupTimers();
          const deniedVote = await this.raft.packet(
            RAFT_PACKET_TYPE.VOTED,
            {granted: false},
          );
          write(deniedVote);
          return {acknowledged: true};
        }

        // Emit to liferaft with write function for responses
        // Requirements: 2.2
        this.raft.emit('data', payload, write);
      }
      return {acknowledged: true};
    }

    // Handle application messages (non-Raft)
    // Requirements: 2.3, 5.3
    return this.handleApplicationMessage(message);
  }

  /**
   * Handle application messages (non-Raft messages).
   * Requirements: 2.3, 5.3
   * @param {Object} message - Application message
   * @return {Promise<Object>} Processing result
   */
  async handleApplicationMessage(message) {
    const {messageId, payload, sourceGroup, sourceReplica} = message;

    this.logger.debug('Received application message', {
      messageId,
      sourceGroup,
      sourceReplica,
      groupId: this.groupId,
    });

    // Check for duplicate
    if (this.acknowledgedMessages.has(messageId)) {
      this.logger.debug('Duplicate message ignored', {messageId});
      return {
        messageId,
        status: MESSAGE_GROUP_APPLICATION_STATUS.DUPLICATE,
        acknowledged: true,
      };
    }

    // Update HLC from remote timestamp if present and is a valid HLC string
    // The timestamp must be a string in HLC format (physical-logical-nodeId)
    if (message.timestamp && typeof message.timestamp === 'string') {
      try {
        const remoteTimestamp = HLCTimestamp.fromString(message.timestamp);
        this.hlcClock.update(remoteTimestamp);
      } catch (err) {
        this.logger.debug('Invalid HLC timestamp in message, ignoring', {
          timestamp: message.timestamp,
          error: err.message,
        });
        throw err;
      }
    }

    // Process the message
    try {
      if (payload &&
        payload.type ===
          MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE.LATENCY_CDC_PROPAGATION) {
        return this.handleLatencyCdcPropagationMessage(messageId, payload);
      }
      if (payload &&
        payload.type ===
          MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE
            .LATENCY_CDC_PROPAGATION_BATCH) {
        return this.handleLatencyCdcPropagationBatchMessage(messageId, payload);
      }

      this.emit('messageReceived', {
        messageId,
        payload,
        sourceGroup,
        sourceReplica,
      });

      return {
        messageId,
        status: MESSAGE_GROUP_APPLICATION_STATUS.RECEIVED,
        acknowledged: false,
      };
    } catch (error) {
      this.logger.error('Error processing received message', {
        messageId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Handle grouped-latency CDC propagation message.
   * @param {string} messageId - Message ID.
   * @param {Object} payload - Propagation payload.
   * @return {Promise<Object>}
   * @private
   */
  async handleLatencyCdcPropagationMessage(messageId, payload) {
    const tableName = payload.tableName;
    const operation = payload.operation;
    const data = payload.data;
    const eventTimestamp = typeof payload.timestamp === 'string' &&
      payload.timestamp.length > NUM.ZERO ?
      payload.timestamp :
      null;
    const causeId = normalizeCauseId(payload.causeId);
    const replayOnly = payload?.replayOnly === true;
    const relayDepth = Number.isInteger(payload.relayDepth) &&
      payload.relayDepth >= NUM.ZERO ?
      payload.relayDepth :
      NUM.ZERO;
    if (!tableName || !operation || !data) {
      throw new Error(
        MESSAGE_GROUP_APPLICATION_ERROR_MSG.INVALID_LATENCY_CDC_PAYLOAD,
      );
    }

    // Followers relay toward the current leader without applying locally.
    // Allow one additional bounded hop so stale first-hop routing can
    // converge during elections without creating open-ended loops.
    if (!this.isCurrentRaftLeader()) {
      if (this.shouldUseStrictCDCForwarding({tableName, operation})) {
        const readiness = this.canAcceptCDCEvent({tableName, operation});
        if (readiness.ready !== true) {
          return {
            messageId,
            status: MESSAGE_GROUP_APPLICATION_STATUS.LATENCY_CDC_PROPAGATED,
            acknowledged: true,
            success: false,
            error: readiness.reason ||
              MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN,
            deferRetry: true,
            retryAfterMs: Number.isFinite(readiness.retryAfterMs) ?
              readiness.retryAfterMs :
              this.resolveStrictCdcForwardRetryAfterMs(),
            tableName,
            operation,
          };
        }
        if (readiness.localIngress === true) {
          const applyOptions = {
            skipSubscriptionCheck: true,
          };
          if (eventTimestamp) {
            applyOptions.timestamp = eventTimestamp;
          }
          if (causeId) {
            applyOptions.causeId = causeId;
          }
          if (replayOnly) {
            applyOptions.replayOnly = true;
          }
          await this.applyCDCEvent(tableName, operation, data, applyOptions);
          return {
            messageId,
            status: MESSAGE_GROUP_APPLICATION_STATUS.LATENCY_CDC_PROPAGATED,
            acknowledged: true,
            tableName,
            operation,
          };
        }
      }
      if (relayDepth >= CDC_FORWARD_MAX_RELAY_DEPTH) {
        throw new Error(MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN);
      }
      await this.forwardCDCEventToLeader(tableName, operation, data, {
        timestamp: eventTimestamp || undefined,
        relayDepth: relayDepth + NUM.ONE,
        causeId,
        replayOnly,
      });
      return {
        messageId,
        status: MESSAGE_GROUP_APPLICATION_STATUS.LATENCY_CDC_PROPAGATED,
        acknowledged: true,
        tableName,
        operation,
      };
    }

    const applyOptions = {
      skipSubscriptionCheck: true,
    };
    if (eventTimestamp) {
      applyOptions.timestamp = eventTimestamp;
    }
    if (causeId) {
      applyOptions.causeId = causeId;
    }
    await this.applyCDCEvent(tableName, operation, data, applyOptions);

    return {
      messageId,
      status: MESSAGE_GROUP_APPLICATION_STATUS.LATENCY_CDC_PROPAGATED,
      acknowledged: true,
      tableName,
      operation,
    };
  }

  /**
   * Handle grouped-latency CDC batch propagation message.
   * @param {string} messageId - Message ID.
   * @param {Object} payload - Propagation payload.
   * @return {Promise<Object>}
   * @private
   */
  async handleLatencyCdcPropagationBatchMessage(messageId, payload) {
    const events = Array.isArray(payload.events) ? payload.events : [];
    const replayOnly = payload?.replayOnly === true;
    const relayDepth = Number.isInteger(payload.relayDepth) &&
      payload.relayDepth >= NUM.ZERO ?
      payload.relayDepth :
      NUM.ZERO;
    if (events.length === NUM.ZERO ||
        events.some((event) =>
          !event?.tableName || !event?.operation || !event?.data,
        )) {
      throw new Error(
        MESSAGE_GROUP_APPLICATION_ERROR_MSG.INVALID_LATENCY_CDC_BATCH_PAYLOAD,
      );
    }

    if (!this.isCurrentRaftLeader()) {
      const strictEvent = events.find((event) => {
        return this.shouldUseStrictCDCForwarding({
          tableName: event?.tableName || null,
          operation: event?.operation || null,
        });
      });
      if (strictEvent) {
        const readiness = this.canAcceptCDCEvent({
          tableName: strictEvent.tableName,
          operation: strictEvent.operation,
        });
        if (readiness.ready !== true) {
          return {
            messageId,
            status: MESSAGE_GROUP_APPLICATION_STATUS.LATENCY_CDC_BATCH_PROPAGATED,
            acknowledged: true,
            success: false,
            error: readiness.reason ||
              MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN,
            deferRetry: true,
            retryAfterMs: Number.isFinite(readiness.retryAfterMs) ?
              readiness.retryAfterMs :
              this.resolveStrictCdcForwardRetryAfterMs(),
            eventCount: events.length,
          };
        }
        if (readiness.localIngress === true) {
          await this.applyCDCBatch(events, {
            skipSubscriptionCheck: true,
            replayOnly,
          });
          return {
            messageId,
            status: MESSAGE_GROUP_APPLICATION_STATUS.LATENCY_CDC_BATCH_PROPAGATED,
            acknowledged: true,
            eventCount: events.length,
          };
        }
      }
      if (relayDepth >= CDC_FORWARD_MAX_RELAY_DEPTH) {
        throw new Error(MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN);
      }
      await this.forwardCDCBatchToLeader(events, {
        relayDepth: relayDepth + NUM.ONE,
        replayOnly,
      });
      return {
        messageId,
        status: MESSAGE_GROUP_APPLICATION_STATUS.LATENCY_CDC_BATCH_PROPAGATED,
        acknowledged: true,
        eventCount: events.length,
      };
    }

    await this.applyCDCBatch(events, {
      skipSubscriptionCheck: true,
    });

    return {
      messageId,
      status: MESSAGE_GROUP_APPLICATION_STATUS.LATENCY_CDC_BATCH_PROPAGATED,
      acknowledged: true,
      eventCount: events.length,
    };
  }

  /**
   * Acknowledge a message as successfully processed.
   * @param {string} messageId - Message ID to acknowledge.
   * @return {Promise<Object>} Acknowledgment result.
   */
  async acknowledgeMessage(messageId) {
    if (!this.initialized) {
      throw new Error('MessageGroupService not initialized');
    }

    this.logger.debug('Acknowledging message', {
      messageId,
      groupId: this.groupId,
    });

    // Mark as acknowledged
    this.acknowledgedMessages.add(messageId);

    // Remove from pending if present
    const pendingMessage = this.pendingMessages.get(messageId);
    if (pendingMessage) {
      pendingMessage.status = MessageStatus.ACKNOWLEDGED;
      this.pendingMessages.delete(messageId);
    }

    // Persist acknowledgment to Raft log
    const entry = this.operationLedger.appendEntry({
      type: 'ACK',
      messageId,
      timestamp: this.hlcClock.now().toString(),
    });

    // Notify callback if registered
    const callback = this.messageCallbacks.get(messageId);
    if (callback) {
      callback({messageId, status: MessageStatus.ACKNOWLEDGED});
      this.messageCallbacks.delete(messageId);
    }

    this.emit('messageAcknowledged', {messageId});

    return {
      messageId,
      status: MessageStatus.ACKNOWLEDGED,
      logIndex: entry.index,
    };
  }


  /**
   * Subscribe to CDC events from a system table.
   * @param {string} tableName - System table name.
   * @return {Promise<void>}
   */
  async subscribeToCDC(tableName) {
    this.cdcHandler.subscribe(tableName);

    this.logger.debug('Subscribed to CDC', {
      tableName,
      groupId: this.groupId,
    });
  }

  /**
   * Apply a CDC event to the system table cache.
   * @param {string} tableName - System table name.
   * @param {string} operation - CDC operation (INSERT, UPDATE, DELETE).
   * @param {Object} data - Record data.
   * @param {Object} [options]
   * @param {boolean} [options.skipReplication]
   * @param {boolean} [options.skipSubscriptionCheck]
   * @return {Promise<void>}
   */
  async applyCDCEvent(tableName, operation, data, options = {}) {
    return this.applyCDCBatch(
      [{tableName, operation, data, ...options}],
      options,
    );
  }

  /**
   * Normalize CDC batch events into one canonical replicated command payload.
   * @param {Array<Object>} events
   * @param {Object} [options]
   * @return {Array<Object>}
   * @private
   */
  normalizeCDCBatchEvents(events, options = {}) {
    return (Array.isArray(events) ? events : [])
      .filter((event) =>
        event?.tableName &&
        event?.operation &&
        event?.data,
      )
      .map((event) => {
        const timestamp = typeof event.timestamp === 'string' &&
          event.timestamp.length > NUM.ZERO ?
          event.timestamp :
          (
            typeof options.timestamp === 'string' &&
            options.timestamp.length > NUM.ZERO ?
              options.timestamp :
              this.hlcClock.now().toString()
          );
        const causeId = normalizeCauseId(
          event.causeId ?? options.causeId,
        );
        return {
          tableName: event.tableName,
          operation: event.operation,
          data: event.data,
          timestamp,
          causeId,
          replayOnly:
            event.replayOnly === true || options.replayOnly === true,
        };
      });
  }

  /**
   * Emit canonical cdcApplied notifications for one or more events.
   * @param {Array<Object>} events
   * @param {?number} logIndex
   * @private
   */
  emitCDCAppliedEvents(events, logIndex = null) {
    for (const event of events) {
      this.emit('cdcApplied', {
        tableName: event.tableName,
        operation: event.operation,
        data: event.data,
        logIndex,
        causeId: normalizeCauseId(event.causeId),
      });
    }
  }

  /**
   * Record CDC propagation metrics for one or more events.
   * @param {Array<Object>} events
   * @param {number} applyStartMs
   * @private
   */
  recordCDCPropagationMetrics(events, applyStartMs) {
    for (const event of events) {
      try {
        const handlerDurationMs = this.now() - applyStartMs;
        const metricsData = {
          tableName: event.tableName,
          operation: event.operation,
          causeId: normalizeCauseId(event.causeId),
          handlerDurationMs,
        };
        if (event.timestamp != null) {
          metricsData.eventAgeMs = this.now() - event.timestamp;
        }
        this.logger.info(
          METRICS_LOG_TAG.CDC_PROPAGATION, metricsData,
        );
      } catch (_metricsErr) {
        // Metrics logging must not propagate to callers
      }
    }
  }

  /**
   * Apply one or more CDC events through the canonical cache/raft owner.
   * @param {Array<Object>} events
   * @param {Object} [options]
   * @param {boolean} [options.skipReplication]
   * @param {boolean} [options.skipSubscriptionCheck]
   * @return {Promise<void>}
   */
  async applyCDCBatch(events, options = {}) {
    const applyStartMs = this.now();
    const skipSubscriptionCheck =
      options.skipSubscriptionCheck === true;
    const skipReplication =
      options.skipReplication === true;
    const normalizedEvents = this.normalizeCDCBatchEvents(events, options)
      .map((event) => ({
        ...event,
        causeId: getOrCreateCauseId(event.causeId),
      }));
    if (normalizedEvents.length === NUM.ZERO) {
      return;
    }
    const strictEvent = normalizedEvents.find((event) => {
      return this.shouldUseStrictCDCForwarding({
        tableName: event.tableName,
        operation: event.operation,
      });
    });
    const strictEventReadiness = strictEvent ?
      this.canAcceptCDCEvent({
        tableName: strictEvent.tableName,
        operation: strictEvent.operation,
      }) :
      null;
    const useCanonicalLocalStrictIngress =
      strictEventReadiness?.localIngress === true;
    const isSingleReplicaGroup = Array.isArray(this.replicaIds) &&
      this.replicaIds.length <= NUM.ONE;
    const requiresRaftReplication = !skipReplication &&
      !useCanonicalLocalStrictIngress &&
      !isSingleReplicaGroup;
    const shouldApplyLocally = !requiresRaftReplication ||
      this.isCurrentRaftLeader();
    if (requiresRaftReplication && !shouldApplyLocally) {
      if (strictEvent) {
        const readiness = strictEventReadiness;
        if (readiness.ready !== true) {
          throw buildDeferredCdcForwardError(
            readiness.reason ||
              MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN,
            Number.isFinite(readiness.retryAfterMs) ?
              readiness.retryAfterMs :
              this.resolveStrictCdcForwardRetryAfterMs(),
          );
        }
      }
    }

    const appliedEvents = [];
    if (shouldApplyLocally) {
      for (const event of normalizedEvents) {
        const applied = this.cdcHandler.applyImmediate(
          {
            tableName: event.tableName,
            operation: event.operation,
            data: event.data,
            timestamp: event.timestamp,
            causeId: event.causeId,
          },
          {skipSubscriptionCheck},
        );
        if (applied) {
          appliedEvents.push(event);
        }
      }
    }

    if (requiresRaftReplication) {
      const cdcCommand = normalizedEvents.length === NUM.ONE ?
        {
          type: 'CDC',
          tableName: normalizedEvents[0].tableName,
          operation: normalizedEvents[0].operation,
          data: normalizedEvents[0].data,
          timestamp: normalizedEvents[0].timestamp,
          causeId: normalizedEvents[0].causeId,
          replayOnly: normalizedEvents[0].replayOnly === true,
        } :
        {
          type: CDC_BATCH_COMMAND_TYPE,
          events: normalizedEvents,
        };

      // Replicate via Raft so all message group replicas (and their
      // co-located system caches) receive this CDC event. Cache updates
      // are applied only from committed CDC entries.
      await this.proposeCDCCommand(cdcCommand);
      // Retain only successfully proposed commands in the bounded local
      // diagnostic ledger so failed relays do not accumulate indefinitely.
      const entry = this.operationLedger.appendEntry({
        ...cdcCommand,
      });

      this.recordCDCPropagationMetrics(normalizedEvents, applyStartMs);

      this.logger.debug('CDC event proposed for replication; awaiting commit apply', {
        tableName: normalizedEvents.length === NUM.ONE ?
          normalizedEvents[0].tableName :
          'batch',
        operation: normalizedEvents.length === NUM.ONE ?
          normalizedEvents[0].operation :
          `batch:${normalizedEvents.length}`,
        logIndex: entry.index,
        groupId: this.groupId,
        replicaId: this.replicaId,
        causeId: normalizeCauseId(normalizedEvents[0].causeId),
        eventCount: normalizedEvents.length,
      });

      if (!shouldApplyLocally) {
        return;
      }
      if (appliedEvents.length === NUM.ZERO) {
        return;
      }

      this.emitCDCAppliedEvents(appliedEvents, entry.index);
      return;
    }

    if (appliedEvents.length === NUM.ZERO) {
      return;
    }

    if (!skipReplication) {
      const entry = this.operationLedger.appendEntry({
        ...(normalizedEvents.length === NUM.ONE ?
          {
            type: 'CDC',
            tableName: normalizedEvents[0].tableName,
            operation: normalizedEvents[0].operation,
            data: normalizedEvents[0].data,
            timestamp: normalizedEvents[0].timestamp,
            causeId: normalizedEvents[0].causeId,
            replayOnly: normalizedEvents[0].replayOnly === true,
          } :
          {
            type: CDC_BATCH_COMMAND_TYPE,
            events: normalizedEvents,
          }),
      });

      this.recordCDCPropagationMetrics(normalizedEvents, applyStartMs);

      this.emitCDCAppliedEvents(appliedEvents, entry.index);
      return;
    }

    this.recordCDCPropagationMetrics(normalizedEvents, applyStartMs);

    this.emitCDCAppliedEvents(appliedEvents, null);
  }

  /**
   * Propose a CDC command through Raft and fail closed on replication errors.
   * @param {Object} cdcCommand
   * @return {Promise<void>}
   * @private
   */
  async proposeCDCCommand(cdcCommand) {
    const configuredRetryBudget = Number.isInteger(this.retryMaxAttempts) &&
      this.retryMaxAttempts > NUM.ZERO ?
      this.retryMaxAttempts :
      NUM.ONE;
    const proposeTimeoutMs = this.computeCdcProposeTimeoutMs(configuredRetryBudget);
    const leaderTargetSource =
      typeof this.raftProvider?.proposeWithLeaderRouting === 'function' ?
        'forward_to_leader' :
        'local_raft_propose';
    try {
      if (typeof this.raftProvider.proposeWithLeaderRouting === 'function') {
        await this.raftProvider.proposeWithLeaderRouting(this.raft, cdcCommand, {
          maxAttempts: configuredRetryBudget,
          proposeTimeoutMs,
          forwardToLeader: async (command) => {
            await this.forwardCDCEventToLeader(
              command.tableName,
              command.operation,
              command.data,
              {
                timestamp: command.timestamp,
                causeId: command.causeId,
                replayOnly: command.replayOnly === true,
              },
            );
          },
          computeRetryDelayMs: (attempt) =>
            this.computeCdcForwardRetryDelayMs(attempt),
          onRetry: ({attempt, mode, retryDelayMs, error}) => {
            this.logger.warn('Retrying Raft CDC command', {
              groupId: this.groupId,
              replicaId: this.replicaId,
              tableName: cdcCommand.tableName,
              causeId: normalizeCauseId(cdcCommand.causeId),
              attempt,
              mode,
              retryDelayMs,
              error: error?.message || null,
            });
          },
        });
        return;
      }

      await new Promise((resolve, reject) => {
        this.raftProvider.propose(this.raft, cdcCommand, (error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    } catch (error) {
      this.logger.error('Raft CDC command failed', {
        groupId: this.groupId,
        replicaId: this.replicaId,
        tableName: cdcCommand.tableName,
        causeId: normalizeCauseId(cdcCommand.causeId),
        attempts: configuredRetryBudget,
        configuredRetryBudget,
        proposeTimeoutMs,
        isCurrentRaftLeader: this.isCurrentRaftLeader(),
        raftState: this.raft?.state || null,
        leaderTargetSource,
        error: error?.message || null,
      });
      throw wrapCdcProposeError(
        `${MESSAGE_GROUP_CDC_ERROR_MSG.RAFT_PROPOSE_FAILED}: ` +
          `${boundCdcForwardErrorDetail(error?.message) || 'unknown error'}`,
        error,
      );
    }
  }

  /**
   * Determine whether this replica is currently the active Raft leader.
   * @return {boolean}
   * @private
   */
  isCurrentRaftLeader() {
    return (this.raft && this.raft.state === LifeRaft.LEADER) ||
      this.role === RaftRole.LEADER;
  }

  /**
   * Resolve the current live Raft leader target without using bootstrap
   * transport hints. This lets strict system-table forwarding honor the
   * owner's current leader state without waiting for the control-plane echo.
   * @return {{serviceId: string, address: string}|null}
   * @private
   */
  resolveLiveLeaderForwardTarget() {
    return this.forwardingOwner.resolveLiveLeaderForwardTarget();
  }

  normalizeLeaderReplicaId(candidate) {
    return this.forwardingOwner.normalizeLeaderReplicaId(candidate);
  }

  resolveLivePeerAddressFromRaftNodes(peerId) {
    return this.forwardingOwner.resolveLivePeerAddressFromRaftNodes(peerId);
  }

  resolveCDCForwardSelection(logContext = {}) {
    return this.forwardingOwner.resolveCDCForwardSelection(logContext);
  }

  buildCDCForwardTargets(cacheLeaderService, cacheForwardService, options = {}) {
    return this.forwardingOwner.buildCDCForwardTargets(
      cacheLeaderService,
      cacheForwardService,
      options,
    );
  }

  shouldUseStrictCDCForwarding(logContext = {}) {
    return this.forwardingOwner.shouldUseStrictCDCForwarding(logContext);
  }

  canAcceptCDCEvent(cdcEvent = {}) {
    return this.forwardingOwner.canAcceptCDCEvent(cdcEvent);
  }

  getMetadataIngressReadiness(options = {}) {
    return this.forwardingOwner.getMetadataIngressReadiness(options);
  }

  async resolveMetadataIngressForwardSelection(options = {}) {
    return this.forwardingOwner.resolveMetadataIngressForwardSelection(options);
  }

  async forwardMetadataIngressPayloadToLeader(payload, options = {}) {
    return this.forwardingOwner.forwardMetadataIngressPayloadToLeader(
      payload,
      options,
    );
  }

  isMetadataIngressReady(options = {}) {
    return this.forwardingOwner.isMetadataIngressReady(options);
  }

  isStrictForwardTargetEligible(target = null) {
    return this.forwardingOwner.isStrictForwardTargetEligible(target);
  }

  shouldAllowJoinConvergenceStrictTargeting() {
    return this.forwardingOwner.shouldAllowJoinConvergenceStrictTargeting();
  }

  resolveJoinConvergenceBootstrapForwardTarget() {
    return this.forwardingOwner.resolveJoinConvergenceBootstrapForwardTarget();
  }

  resolveCanonicalLeaderNodeIdFromCache() {
    return this.forwardingOwner.resolveCanonicalLeaderNodeIdFromCache();
  }

  isLocalForwardTarget(serviceId, address = null) {
    return this.forwardingOwner.isLocalForwardTarget(serviceId, address);
  }

  resolveForwardTargetNodeId(target = null) {
    return this.forwardingOwner.resolveForwardTargetNodeId(target);
  }

  isStrictForwardNodeReady(nodeId) {
    return this.forwardingOwner.isStrictForwardNodeReady(nodeId);
  }

  isStrictForwardNodeConnected(nodeId) {
    return this.forwardingOwner.isStrictForwardNodeConnected(nodeId);
  }

  getForwardTargetSuppressionKeys(target = {}) {
    return this.forwardingOwner.getForwardTargetSuppressionKeys(target);
  }

  pruneForwardTargetSuppressions(nowMs = this.now()) {
    return this.forwardingOwner.pruneForwardTargetSuppressions(nowMs);
  }

  isForwardTargetSuppressed(target = {}) {
    return this.forwardingOwner.isForwardTargetSuppressed(target);
  }

  suppressForwardTarget(target = {}) {
    return this.forwardingOwner.suppressForwardTarget(target);
  }

  clearForwardTargetSuppression(target = {}) {
    return this.forwardingOwner.clearForwardTargetSuppression(target);
  }

  shouldRepairForwardTopology(errorMessage) {
    return this.forwardingOwner.shouldRepairForwardTopology(errorMessage);
  }

  canRepairAuthoritativeForwardTopology() {
    return this.forwardingOwner.canRepairAuthoritativeForwardTopology();
  }

  async maybeRepairAuthoritativeForwardTopology(context = {}) {
    return this.forwardingOwner.maybeRepairAuthoritativeForwardTopology(context);
  }

  async repairAuthoritativeForwardTopology(context = {}) {
    return this.forwardingOwner.repairAuthoritativeForwardTopology(context);
  }

  async applyAuthoritativeForwardTopologyRows(tableName, rows = []) {
    return this.forwardingOwner.applyAuthoritativeForwardTopologyRows(
      tableName,
      rows,
    );
  }

  async reconcileAuthoritativeForwardServiceRows(authoritativeRows = []) {
    return this.forwardingOwner.reconcileAuthoritativeForwardServiceRows(
      authoritativeRows,
    );
  }

  getControlPlaneSystemTableGateway() {
    return this.controlPlaneSystemTableGateway;
  }

  areForwardTopologyRowsEqual(left, right) {
    return this.forwardingOwner.areForwardTopologyRowsEqual(left, right);
  }

  shouldSuppressForwardTarget(deliveryResult, errorMessage) {
    return this.forwardingOwner.shouldSuppressForwardTarget(
      deliveryResult,
      errorMessage,
    );
  }

  isForwardTargetBackpressured(deliveryResult, errorMessage) {
    return this.forwardingOwner.isForwardTargetBackpressured(
      deliveryResult,
      errorMessage,
    );
  }

  async forwardCDCEventToLeader(tableName, operation, data, options = {}) {
    return this.forwardingOwner.forwardCDCEventToLeader(
      tableName,
      operation,
      data,
      options,
    );
  }

  async forwardCDCBatchToLeader(events, options = {}) {
    return this.forwardingOwner.forwardCDCBatchToLeader(events, options);
  }

  async forwardCDCPayloadToLeader(payload, logContext = {}) {
    return this.forwardingOwner.forwardCDCPayloadToLeader(payload, logContext);
  }

  /**
   * Compute retry delay for CDC forward attempts.
   * @param {number} attempt
   * @return {number}
   * @private
   */
  computeCdcForwardRetryDelayMs(attempt) {
    const retryInitialDelayMs = Number.isFinite(this.retryInitialDelayMs) &&
      this.retryInitialDelayMs > NUM.ZERO ?
      this.retryInitialDelayMs :
      NUM.HUNDRED;
    const retryBackoffMultiplier = Number.isFinite(this.retryBackoffMultiplier) &&
      this.retryBackoffMultiplier >= NUM.ONE ?
      this.retryBackoffMultiplier :
      NUM.TWO;
    const retryMaxDelayMs = Number.isFinite(this.retryMaxDelayMs) &&
      this.retryMaxDelayMs > NUM.ZERO ?
      this.retryMaxDelayMs :
      TIME_MS.SECOND * NUM.TEN;
    return Math.min(
      retryMaxDelayMs,
      Math.floor(
        retryInitialDelayMs * (
          retryBackoffMultiplier ** Math.max(NUM.ZERO, attempt - NUM.TWO)
        ),
      ),
    );
  }

  resolveStrictCdcForwardRetryAfterMs() {
    return Math.max(
      NUM.ONE,
      this.computeCdcForwardRetryDelayMs(NUM.ONE),
      Number.isFinite(this.forwardTargetSuppressionMs) ?
        this.forwardTargetSuppressionMs :
        NUM.ZERO,
      Number.isFinite(this.forwardTopologyRepairCooldownMs) ?
        this.forwardTopologyRepairCooldownMs :
        NUM.ZERO,
    );
  }

  /**
   * Compute bounded timeout for one CDC Raft propose attempt.
   * Keeps end-to-end forwarding attempts below transport message timeout.
   * @param {number} attemptBudget
   * @return {number}
   * @private
   */
  computeCdcProposeTimeoutMs(attemptBudget) {
    const retryBudget = Number.isInteger(attemptBudget) && attemptBudget > NUM.ZERO ?
      attemptBudget :
      NUM.ONE;
    const deliveryTimeoutMs = Number.isFinite(this.deliveryTimeoutMs) &&
      this.deliveryTimeoutMs > NUM.ZERO ?
      Math.floor(this.deliveryTimeoutMs) :
      TIME_MS.SECOND * NUM.FIVE;
    const safetyBufferMs = NUM.TWO * NUM.HUNDRED;
    const perAttemptBudgetMs = Math.floor(
      (Math.max(NUM.HUNDRED, deliveryTimeoutMs - safetyBufferMs)) / retryBudget,
    );
    const cappedBudgetMs = Math.min(
      TIME_MS.SECOND + NUM.FIVE * NUM.HUNDRED,
      perAttemptBudgetMs,
    );
    return Math.max(NUM.TWO * NUM.HUNDRED, cappedBudgetMs);
  }

  /**
   * Query the system table cache.
   * Returns a read-only view of the cache.
   * @param {string} tableName - System table name.
   * @param {Object} query - Query parameters.
   * @return {Promise<*>} Query result.
   */
  async querySystemCache(tableName, query = {}) {
    if (!this.initialized) {
      throw new Error('MessageGroupService not initialized');
    }

    // Use read-only cache wrapper
    if (query.key) {
      return this.readOnlyCache.get(tableName, query.key);
    }

    if (query.predicate) {
      if (query.findOne) {
        return this.readOnlyCache.find(tableName, query.predicate);
      }
      return this.readOnlyCache.filter(tableName, query.predicate);
    }

    return this.readOnlyCache.getAll(tableName);
  }

  /**
   * Get the read-only system table cache.
   * @return {ReadOnlySystemTableCache} Read-only cache wrapper.
   */
  getReadOnlyCache() {
    return this.readOnlyCache;
  }

  /**
   * Get the underlying writable cache (for CDC handlers only).
   * @return {SystemTableCache} Writable cache.
   */
  getWritableCache() {
    return this.systemTableCache;
  }

  /**
   * Set the CDC integration service for raft role updates.
   * @param {Object} cdcIntegrationService - CDC integration service.
   */
  setCdcIntegrationService(cdcIntegrationService) {
    this.cdcIntegrationService = cdcIntegrationService;
    this.maybeInitializeRebalancer();
    this.flushRoleUpdate().catch((error) => {
      this.logger.warn('Failed to persist role update after CDC service set', {
        groupId: this.groupId,
        replicaId: this.replicaId,
        error: error.message,
      });
    });
    this.flushLeaderNodeUpdate().catch((error) => {
      this.logger.warn('Failed to persist leader update after CDC service set', {
        groupId: this.groupId,
        replicaId: this.replicaId,
        error: error.message,
      });
    });
  }

  /**
   * Set table policy service for message-group rebalancing.
   * @param {Object} tablePolicyService - Table policy service.
   */
  setTablePolicyService(tablePolicyService) {
    this.tablePolicyService = tablePolicyService;
    this.maybeInitializeRebalancer();
  }

  /**
   * Set rebalance coordinator for message-group rebalancing.
   * @param {Object} rebalanceCoordinator - Rebalance coordinator.
   */
  setRebalanceCoordinator(rebalanceCoordinator) {
    this.rebalanceCoordinator = rebalanceCoordinator;
    this.maybeInitializeRebalancer();
  }

  /**
   * Initialize message-group rebalancer when leader and dependencies are ready.
   * @private
   */
  maybeInitializeRebalancer() {
    const backgroundReady = this.isBackgroundWorkReady();
    if (this.rebalancer) {
      this.rebalancer.systemTableCache = this.systemTableCache;
      this.rebalancer.cdcIntegrationService = this.cdcIntegrationService;
      this.rebalancer.tablePolicyService = this.tablePolicyService;
      if (typeof this.rebalancer.setRebalanceCoordinator !== TYPEOF.FUNCTION) {
        throw new Error(
          MESSAGE_GROUP_SERVICE_ERROR_MSG.MISSING_REBALANCER_SET_COORDINATOR,
        );
      }
      this.rebalancer.setRebalanceCoordinator(this.rebalanceCoordinator);
      this.rebalancer.messageRouter = this.transport;
      this.rebalancer.sqlQueryEngine =
        this.cdcIntegrationService?.sqlQueryEngine || null;
      this.rebalancer.setLeader(backgroundReady && this.isLeaderReplica());
      return;
    }

    if (!backgroundReady || !this.initialized || !this.isLeaderReplica()) {
      return;
    }

    if (!this.systemTableCache ||
        !this.cdcIntegrationService ||
        !this.tablePolicyService ||
        !this.rebalanceCoordinator ||
        !this.transport) {
      return;
    }

    this.rebalancer = new UnifiedRebalancer({
      entityId: this.groupId,
      entityType: RebalancerEntityType.MESSAGE_GROUP,
      systemTableCache: this.systemTableCache,
      cdcIntegrationService: this.cdcIntegrationService,
      tablePolicyService: this.tablePolicyService,
      nodeId: this.nodeId,
      messageRouter: this.transport,
      sqlQueryEngine: this.cdcIntegrationService.sqlQueryEngine,
      rebalanceCoordinator: this.rebalanceCoordinator,
    });
    this.rebalancer.initialize();
    this.rebalancer.setLeader(backgroundReady && this.isLeaderReplica());
  }

  /**
   * Update rebalancer leadership when raft role changes.
   * @private
   */
  updateRebalancerLeadership() {
    if (this.rebalancer) {
      this.rebalancer.setLeader(
        this.isBackgroundWorkReady() && this.isLeaderReplica(),
      );
      return;
    }
    this.maybeInitializeRebalancer();
  }

  cancelLeaderOwnedActivation() {
    this.leaderActivationGate.cancel({clearActivatedTerm: true});
  }

  scheduleLeaderOwnedActivation(term) {
    this.leaderActivationGate.schedule(term, () => {
      if (!this.raft || !this.isLeaderReplica()) {
        return;
      }
      this.updateRebalancerLeadership();

      const existingSubscriptions = this.cdcHandler.getSubscriptions();
      if (existingSubscriptions.length > NUM.ZERO &&
          this.lastLeaderCdcResubscribeTerm !== term) {
        this.lastLeaderCdcResubscribeTerm = term;
        this.logger.info(
          MESSAGE_GROUP_SERVICE_LOG_MSG.CDC_RESUBSCRIBE_ON_LEADER,
          {
            term,
            replicaId: this.replicaId,
            groupId: this.groupId,
            tableCount: existingSubscriptions.length,
          },
        );
        for (const tableName of existingSubscriptions) {
          this.subscribeToCDC(tableName);
        }
        this.logger.info(
          MESSAGE_GROUP_SERVICE_LOG_MSG.CDC_RESUBSCRIBE_ON_LEADER_COMPLETE,
          {
            term,
            replicaId: this.replicaId,
            groupId: this.groupId,
            tableCount: existingSubscriptions.length,
          },
        );
      }

      this.logger.info('Became leader', {
        term,
        replicaId: this.replicaId,
        groupId: this.groupId,
      });

      this.emit('leaderElected', {
        leaderId: this.replicaId,
        term,
        groupId: this.groupId,
      });
    }, {
      shouldActivate: () => this.raft !== null && this.isLeaderReplica(),
    });
  }

  /**
   * Queue a raft role update for persistence.
   * @param {string} role - New raft role.
   * @private
   */
  queueRoleUpdate(role) {
    this.roleMutationHelper.queue(
      normalizePublishedRaftRole(role, {collapseLeaderToFollower: true}),
    );
  }

  /**
   * Queue a message group leader update for persistence.
   * @param {string} leaderNodeId - Leader node ID.
   * @private
   */
  queueLeaderNodeUpdate(leaderNodeId) {
    this.leaderNodeMutationHelper.queue(leaderNodeId);
  }

  /**
   * Persist the latest pending raft role update.
   * @return {Promise<void>}
   * @private
   */
  async flushRoleUpdate() {
    return this.roleMutationHelper.flush();
  }

  /**
   * Persist the latest pending message group leader update.
   * @return {Promise<void>}
   * @private
   */
  async flushLeaderNodeUpdate() {
    return this.leaderNodeMutationHelper.flush();
  }

  /**
   * Check if the message_groups partition leader is available for writes.
   * @return {boolean} True if a leader with an address is known.
   * @private
   */
  isMessageGroupsLeaderAvailable() {
    if (isSystemTableWriteReady(this.systemTableCache, SYSTEM_TABLE_NAME.MESSAGE_GROUPS)) {
      return true;
    }
    return this.cdcIntegrationService?.canWriteSystemTableLocally?.(
      SYSTEM_TABLE_NAME.MESSAGE_GROUPS,
    ) === true;
  }

  /**
   * Check if the services table is writable through either cache-visible
   * routing metadata or the local services-p1 leader owner.
   * @return {boolean} True if writes can be issued safely.
   * @private
   */
  isServicesLeaderAvailable() {
    if (isSystemTableWriteReady(this.systemTableCache, SYSTEM_TABLE_NAME.SERVICES)) {
      return true;
    }
    return this.cdcIntegrationService?.canWriteSystemTableLocally?.(
      SYSTEM_TABLE_NAME.SERVICES,
    ) === true;
  }

  getMetadataPublicationDeliveryPriority() {
    return this.groupId === INITIAL_MESSAGE_GROUP_ID ?
      'critical' :
      'background';
  }

  getMetadataPublicationReadinessDimension() {
    return CONTROL_PLANE_READINESS_DIMENSION
      .CONTROL_PLANE_RECOVERY_ELIGIBLE;
  }

  /**
   * Check if this replica is the leader.
   * Requirements: 5.5
   * @return {boolean} True if leader.
   */
  isLeaderReplica() {
    return this.role === RaftRole.LEADER;
  }

  /**
   * Get the current leader ID.
   * Requirements: 5.4
   * @return {string|null} Leader replica ID.
   */
  getLeaderId() {
    return this.leaderId;
  }

  /**
   * Get the current Raft role.
   * Requirements: 5.5
   * @return {string} Current role.
   */
  getRole() {
    return this.role;
  }

  /**
   * Get the current term.
   * @return {number} Current term.
   */
  getCurrentTerm() {
    return this.raft ?
      this.raftProvider.getCurrentTerm(this.raft) :
      this.operationLedger.currentTerm;
  }

  /**
   * Get pending message count.
   * @return {number} Number of pending messages.
   */
  getPendingMessageCount() {
    return this.pendingMessages.size;
  }


  /**
   * Get service status.
   * @return {Object} Service status.
   */
  getStatus() {
    return {
      groupId: this.groupId,
      replicaId: this.replicaId,
      nodeId: this.nodeId,
      role: this.role,
      isLeader: this.isLeader,
      leaderId: this.leaderId,
      term: this.raft ?
        this.raftProvider.getCurrentTerm(this.raft) :
        this.operationLedger.currentTerm,
      logLength: this.operationLedger.getLogLength(),
      pendingMessages: this.pendingMessages.size,
      acknowledgedMessages: this.acknowledgedMessages.size,
      cdcSubscriptions: this.cdcHandler.getSubscriptions(),
      initialized: this.initialized,
    };
  }

  /**
   * Sleep for a specified duration.
   * @param {number} ms - Milliseconds to sleep.
   * @return {Promise<void>}
   * @private
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Stop message-group rebalancing activity.
   * @return {Promise<void>}
   */
  async quiesceRebalancing() {
    if (this.rebalancer) {
      this.rebalancer.setLeader(false);
      this.rebalancer.shutdown();
      this.rebalancer = null;
    }
  }

  /**
   * Shutdown the message group service.
   * @return {Promise<void>}
   */
  async shutdown() {
    this.logger.info('Shutting down message group service', {
      groupId: this.groupId,
      replicaId: this.replicaId,
    });
    this.leaderActivationGate.shutdown();

    this.peerReconciliationScheduled = false;
    if (this.systemTableCache &&
        typeof this.systemTableCache.offCacheChange === TYPEOF.FUNCTION &&
        this.systemTableCacheChangeListener) {
      this.systemTableCache.offCacheChange(this.systemTableCacheChangeListener);
    }

    // End liferaft instance - clear all timers first
    if (this.raft) {
      this.raftProvider.shutdownNode(this.raft);
      this.raft = null;
    }
    this.joinSuppressedHeartbeat = null;

    if (typeof this.releaseMetadataPublicationReadinessListener ===
      TYPEOF.FUNCTION) {
      this.releaseMetadataPublicationReadinessListener();
    }
    this.releaseMetadataPublicationReadinessListener = null;
    this._metadataPublicationReadinessState = null;
    this.roleMutationHelper.shutdown();
    this.leaderNodeMutationHelper.shutdown();
    await this.quiesceRebalancing();
    this.cdcHandler.shutdown();

    this.initialized = false;
    this.pendingMessages.clear();
    this.messageCallbacks.clear();

    this.emit('shutdown', {groupId: this.groupId, replicaId: this.replicaId});
  }
}

export {
  MessageGroupOperationLedger,
  MessageGroupService,
  MessageStatus,
  RaftRole,
  isRaftPacket,
  RAFT_PACKET_TYPES,
};
