/**
 * Message Group Service - Reliable inter-service communication.
 * Implements 3-replica Raft groups using liferaft library for consensus.
 * Requirements: 1.4, 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.4, 6.5
 */

import {EventEmitter} from 'events';
import {v4 as uuidv4} from 'uuid';
import LifeRaft from '@markwylde/liferaft';
import {
  CDC_OPERATION,
  ADDRESS,
  COLUMN,
  ENTITY_TYPE,
  METRICS_LOG_TAG,
  NUM,
  SERVICE_TYPE,
  STATE,
  STRING,
  TABLES,
  TIME_MS,
  TYPEOF,
} from '../constants/index.js';
import {getSystemCachePrimaryKeyFieldOrFallback} from
  '../cache/system-cache-key-descriptor.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {CONFIG_KEY} from '../config/config-constants.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../control-plane/control-plane-readiness-constants.js';
import {LoggingService} from '../logging/logging-service.js';
import {NodeService} from '../node/node-service.js';
import {HLCClockService} from '../hlc/hlc-clock-service.js';
import {HLCTimestamp} from '../hlc/hlc-timestamp.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {isSystemTableWriteReady} from '../cache/leader-readiness-gate.js';
import {InMemoryLogAdapter} from '../raft/in-memory-log-adapter.js';
import {isRaftPacket, RAFT_PACKET_TYPES} from '../raft/raft-packet-utils.js';
import {RAFT_ELECTION_TIMING, RAFT_EVENT} from '../raft/constants.js';
import {
  applyRuntimeRaftTiming,
  computeReplicaElectionTimeouts,
} from '../raft/raft-timing-utils.js';
import {assertRaftProviderContract} from '../raft/raft-provider-contract.js';
import {LiferaftProvider} from '../raft/liferaft-provider.js';
import {AuthoritativeRowMutationHelper} from '../raft/authoritative-row-mutation-helper.js';
import {wireReplicaLifecycleEvents} from '../raft/replica-leadership-state.js';
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
  MESSAGE_GROUP_SUBSYSTEM,
  MESSAGE_STATUS as MessageStatus,
  RAFT_ROLE as RaftRole,
} from './constants.js';
import {
  resolveMessageGroupForwardServiceFromCache,
  resolveMessageGroupLeaderServiceFromCache,
} from './message-group-target-resolver.js';
import {CDCHandler} from './cdc-handler.js';
import {getOrCreateCauseId, normalizeCauseId} from '../utils/cause-id.js';
import {MessageGroupOperationLedger} from './message-group-operation-ledger.js';
import {QUERY_MESSAGE_TYPE} from '../query/query-constants.js';
import {TRANSPORT_ERROR_MSG} from '../constants/transport.js';

// Note: isRaftPacket and RAFT_PACKET_TYPES are imported from shared module
// src/raft/raft-packet-utils.js - Requirements: 9.1, 9.2, 9.3, 9.4

const ROLE_PERSIST_ERROR_MSG =
  'Failed to persist raft role update';
const LEADER_NODE_PERSIST_ERROR_MSG =
  'Failed to persist message group leader update';
const FLUSH_SKIP_NOT_OWNER = 'not-owner';
const FLUSH_SKIP_READY = 'ready';
const CDC_FORWARD_MAX_RELAY_DEPTH = NUM.TWO;
const FORWARD_TOPOLOGY_REPAIR_LOCAL_READ_CONSISTENCY = 'local_leader';
const FORWARD_TOPOLOGY_REPAIR_DEFAULT = Object.freeze({
  COOLDOWN_MS: 1000,
  FAILURE_COOLDOWN_MS: 5000,
  NO_CHANGE_COOLDOWN_MS: 2000,
  QUERY_TIMEOUT_MS: 1500,
});

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
    this.forwardTargetSuppression = new Map();
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
    this.lastForwardTopologyRepairAtMs = NUM.ZERO;
    this.lastForwardTopologyRepairCooldownMs =
      this.forwardTopologyRepairCooldownMs;
    this.forwardTopologyRepairInFlight = null;

    // Raft state - using liferaft library
    // Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
    this.raft = null; // Initialized in initialize()
    this.logAdapter = new InMemoryLogAdapter();
    // Note: transportAdapter removed - RaftNode.write() now calls messageRouter directly
    // Requirements: 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 4.4

    this.operationLedger = new MessageGroupOperationLedger({now: this.now});
    this.role = RaftRole.FOLLOWER;
    this.leaderId = null;
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.tablePolicyService = options.tablePolicyService || null;
    this.rebalanceCoordinator = options.rebalanceCoordinator || null;
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

    this.roleMutationHelper = this.createRoleMutationHelper();
    this.pendingRoleUpdate = this.role;
    this.persistedRole = null;
    this.leaderNodeMutationHelper = this.createLeaderNodeMutationHelper();
    this.pendingLeaderNodeUpdate = null;
    this.persistedLeaderNodeId = null;

    // State
    this.initialized = false;
    this.isLeader = false;

    // Defer election start until all replicas are ready
    // When true, the Raft election timer won't start until startElection() is called
    // This prevents election storms when multiple replicas are created on the same node
    this.deferElection = options.deferElection || false;
    this.electionStarted = false;
    this.raftTimingConfig = null;
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

  get pendingRoleUpdate() {
    return this.roleMutationHelper?.pendingValue || null;
  }

  set pendingRoleUpdate(role) {
    if (this.roleMutationHelper) {
      this.roleMutationHelper.pendingValue = role;
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
        routingReadinessDimension:
          CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
      }),
      buildExpectedCacheFields: (role) => ({raft_role: role}),
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
        routingReadinessDimension:
          CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
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
        skip: !this.isLeader,
        clearPending: !this.isLeader,
        reason: !this.isLeader ? FLUSH_SKIP_NOT_OWNER : FLUSH_SKIP_READY,
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

    // Check peerAddresses array (provided during cross-node joining)
    // Format: ['nodeId/message-group/replicaId', ...]
    if (this.peerAddresses && this.peerAddresses.length > 0) {
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
            this.logBootstrapHintFallback(peerId, addr);
            return addr;
          }
        } catch (_e) {
          // Ignore parse errors here; validation already guards format.
        }
      }
    }

    throw new Error(`Unable to resolve unified peer address for ${peerId}`);
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
      if (!replicaId || replicaId === this.replicaId) {
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
      if (!peerAddress) {
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

        // Send packet unchanged - no type conversion
        // Only add destination address for routing, preserve all packet fields
        // Requirements: 3.1, 3.2, 3.3
        self.transport.deliver(peerAddress, packet)
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
    wireReplicaLifecycleEvents(this, {
      events: RAFT_EVENT,
      roles: RaftRole,
      getCurrentTerm: () => this.raftProvider.getCurrentTerm(this.raft),
      onLeader: ({term}) => {
        this.updateRebalancerLeadership();
        this.operationLedger.currentTerm = term;

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
      },
      onFollower: ({term}) => {
        this.updateRebalancerLeadership();
        this.operationLedger.currentTerm = term;
      },
      onCandidate: ({term}) => {
        this.updateRebalancerLeadership();
        this.operationLedger.currentTerm = term;
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
      if (peerId !== this.replicaId) {
        const peerAddress = this.buildPeerAddress(peerId);
        this.raftProvider.joinPeer(this.raft, peerAddress);
      }
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
   * @return {Promise<Object>} Delivery result.
   */
  async sendMessage(targetService, message) {
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

    if (this.isQueryDeliveryPayload(message)) {
      try {
        const deliveryResult = await this.attemptDirectDelivery(
          messageEnvelope,
          {
            maxAttempts: NUM.ONE,
            disableRetryDelay: true,
          },
        );
        if (!deliveryResult.delivered) {
          throw new Error(
            deliveryResult.error || 'Query message delivery failed',
          );
        }
        messageEnvelope.status = MessageStatus.DELIVERED;
        const {delivered: _d, attempt: _a, ...transportResult} = deliveryResult;
        return {
          messageId,
          status: MessageStatus.DELIVERED,
          deliveryType: 'direct',
          ...transportResult,
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
        const result = await this.transport.deliver(targetService, {
          messageId,
          payload,
          sourceGroup: this.groupId,
          sourceReplica: this.replicaId,
        });

        if (result && result.acknowledged) {
          // Spread transport result directly - ACK structure is flat
          return {delivered: true, attempt: attempt + 1, ...result};
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
            this.logger.trace('Sending Raft response', {
              type: responsePacket.type,
              destination: senderAddress,
              term: responsePacket.term,
            });
            // Send response to the sender
            this.transport.deliver(senderAddress, responsePacket)
              .catch((err) => {
                this.logger.error('Failed to send Raft response', {
                  error: err.message,
                  destination: senderAddress,
                });
              });
          }
        };

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
      if (relayDepth >= CDC_FORWARD_MAX_RELAY_DEPTH) {
        throw new Error(MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN);
      }
      await this.forwardCDCEventToLeader(tableName, operation, data, {
        timestamp: eventTimestamp || undefined,
        relayDepth: relayDepth + NUM.ONE,
        causeId,
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
    const applyStartMs = this.now();
    const skipSubscriptionCheck =
      options.skipSubscriptionCheck === true;
    const skipReplication =
      options.skipReplication === true;
    const eventTimestamp =
      options.timestamp || this.hlcClock.now().toString();
    const causeId = getOrCreateCauseId(options.causeId);
    const isSingleReplicaGroup = Array.isArray(this.replicaIds) &&
      this.replicaIds.length <= NUM.ONE;
    const requiresRaftReplication = !skipReplication && !isSingleReplicaGroup;
    const shouldApplyLocally = !requiresRaftReplication ||
      this.isCurrentRaftLeader();

    let applied = false;
    if (shouldApplyLocally) {
      applied = this.cdcHandler.applyImmediate(
        {
          tableName,
          operation,
          data,
          timestamp: eventTimestamp,
          causeId,
        },
        {skipSubscriptionCheck},
      );
    }

    if (requiresRaftReplication) {
      const cdcCommand = {
        type: 'CDC',
        tableName,
        operation,
        data,
        timestamp: eventTimestamp,
        causeId,
      };

      // Persist CDC event to Raft log for replication
      const entry = this.operationLedger.appendEntry({
        ...cdcCommand,
      });
      // Replicate via Raft so all message group replicas (and their
      // co-located system caches) receive this CDC event. Cache updates
      // are applied only from committed CDC entries.
      await this.proposeCDCCommand(cdcCommand);

      try {
        const handlerDurationMs = this.now() - applyStartMs;
        const metricsData = {
          tableName,
          operation,
          causeId,
          handlerDurationMs,
        };
        if (options.timestamp != null) {
          metricsData.eventAgeMs =
            this.now() - options.timestamp;
        }
        this.logger.info(
          METRICS_LOG_TAG.CDC_PROPAGATION, metricsData,
        );
      } catch (_metricsErr) {
        // Metrics logging must not propagate to callers
      }

      this.logger.debug('CDC event proposed for replication; awaiting commit apply', {
        tableName,
        operation,
        logIndex: entry.index,
        groupId: this.groupId,
        replicaId: this.replicaId,
        causeId,
      });

      if (!shouldApplyLocally) {
        return;
      }
      if (!applied) {
        return;
      }

      this.emit('cdcApplied', {
        tableName, operation, data, logIndex: entry.index,
        causeId,
      });
      return;
    }

    if (!applied) {
      return;
    }

    if (!skipReplication) {
      const entry = this.operationLedger.appendEntry({
        type: 'CDC',
        tableName,
        operation,
        data,
        timestamp: eventTimestamp,
      });

      try {
        const handlerDurationMs = this.now() - applyStartMs;
        const metricsData = {
          tableName,
          operation,
          causeId,
          handlerDurationMs,
        };
        if (options.timestamp != null) {
          metricsData.eventAgeMs =
            this.now() - options.timestamp;
        }
        this.logger.info(
          METRICS_LOG_TAG.CDC_PROPAGATION, metricsData,
        );
      } catch (_metricsErr) {
        // Metrics logging must not propagate to callers
      }

      this.emit('cdcApplied', {
        tableName, operation, data, logIndex: entry.index,
        causeId,
      });
      return;
    }

    try {
      const handlerDurationMs = this.now() - applyStartMs;
      const metricsData = {
        tableName,
        operation,
        causeId,
        handlerDurationMs,
      };
      if (options.timestamp != null) {
        metricsData.eventAgeMs =
          this.now() - options.timestamp;
      }
      this.logger.info(
        METRICS_LOG_TAG.CDC_PROPAGATION, metricsData,
      );
    } catch (_metricsErr) {
      // Metrics logging must not propagate to callers
    }

    this.emit('cdcApplied', {
      tableName, operation, data, logIndex: null,
      causeId,
    });
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
        proposeTimeoutMs,
        error: error?.message || null,
      });
      throw new Error(
        `${MESSAGE_GROUP_CDC_ERROR_MSG.RAFT_PROPOSE_FAILED}: ` +
        `${error?.message || 'unknown error'}`,
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
   * Build an ordered list of CDC forwarding targets.
   * Prefers cache-selected forward routes, then cache leader metadata, then
   * stale local leader hints, then bootstrap-time replica hints.
   * Suppressed targets are excluded until their local cooldown expires.
   * @param {?Object} cacheLeaderService
   * @param {?Object} cacheForwardService
   * @return {{targets: Array<{serviceId: string, address: ?string}>, suppressedCount: number}}
   * @private
   */
  buildCDCForwardTargets(cacheLeaderService, cacheForwardService) {
    const targets = [];
    let suppressedCount = NUM.ZERO;
    const targetsByServiceId = new Map();
    const addTarget = (serviceId, address = null) => {
      if (typeof serviceId !== TYPEOF.STRING ||
        serviceId.length === NUM.ZERO ||
        serviceId === this.replicaId) {
        return;
      }

      const normalizedAddress = typeof address === TYPEOF.STRING &&
        address.length > NUM.ZERO ?
        address :
        null;
      const existingTarget = targetsByServiceId.get(serviceId);
      if (existingTarget) {
        if (!existingTarget.address && normalizedAddress) {
          existingTarget.address = normalizedAddress;
        }
        return;
      }

      const target = {
        serviceId,
        address: normalizedAddress,
      };
      targetsByServiceId.set(serviceId, target);
      if (this.isForwardTargetSuppressed(target)) {
        suppressedCount += NUM.ONE;
        return;
      }
      targets.push(target);
    };

    addTarget(
      cacheForwardService?.[COLUMN.SERVICE_ID],
      cacheForwardService?.[COLUMN.ADDRESS],
    );
    addTarget(
      cacheLeaderService?.[COLUMN.SERVICE_ID],
      cacheLeaderService?.[COLUMN.ADDRESS],
    );
    addTarget(this.leaderId);

    if (Array.isArray(this.replicaIds)) {
      for (const peerId of this.replicaIds) {
        addTarget(peerId);
      }
    }

    return {
      targets,
      suppressedCount,
    };
  }

  /**
   * Resolve suppression keys for one forward target.
   * @param {Object} target
   * @return {Array<string>}
   * @private
   */
  getForwardTargetSuppressionKeys(target = {}) {
    const keys = [];
    if (typeof target.serviceId === TYPEOF.STRING &&
        target.serviceId.length > NUM.ZERO) {
      keys.push(`service:${target.serviceId}`);
    }
    if (typeof target.address === TYPEOF.STRING &&
        target.address.length > NUM.ZERO) {
      keys.push(`address:${target.address}`);
    }
    return keys;
  }

  /**
   * Remove expired target suppressions.
   * @param {number} [nowMs]
   * @return {void}
   * @private
   */
  pruneForwardTargetSuppressions(nowMs = this.now()) {
    for (const [key, expiresAt] of this.forwardTargetSuppression.entries()) {
      if (!Number.isFinite(expiresAt) || expiresAt <= nowMs) {
        this.forwardTargetSuppression.delete(key);
      }
    }
  }

  /**
   * Determine whether a forward target is temporarily suppressed.
   * @param {Object} target
   * @return {boolean}
   * @private
   */
  isForwardTargetSuppressed(target = {}) {
    const nowMs = this.now();
    this.pruneForwardTargetSuppressions(nowMs);
    return this.getForwardTargetSuppressionKeys(target).some((key) => {
      const expiresAt = this.forwardTargetSuppression.get(key);
      return Number.isFinite(expiresAt) && expiresAt > nowMs;
    });
  }

  /**
   * Temporarily suppress a forward target after a terminal routing failure.
   * @param {Object} target
   * @return {void}
   * @private
   */
  suppressForwardTarget(target = {}) {
    const suppressionMs = Number.isFinite(this.forwardTargetSuppressionMs) &&
      this.forwardTargetSuppressionMs > NUM.ZERO ?
      Math.floor(this.forwardTargetSuppressionMs) :
      NUM.ZERO;
    if (suppressionMs <= NUM.ZERO) {
      return;
    }
    const expiresAt = this.now() + suppressionMs;
    for (const key of this.getForwardTargetSuppressionKeys(target)) {
      this.forwardTargetSuppression.set(key, expiresAt);
    }
  }

  /**
   * Clear any suppression when a target becomes routable again.
   * @param {Object} target
   * @return {void}
   * @private
   */
  clearForwardTargetSuppression(target = {}) {
    for (const key of this.getForwardTargetSuppressionKeys(target)) {
      this.forwardTargetSuppression.delete(key);
    }
  }

  /**
   * Return true when one delivery rejection should trigger an authoritative
   * message-group topology repair.
   * @param {?string} errorMessage
   * @return {boolean}
   * @private
   */
  shouldRepairForwardTopology(errorMessage) {
    return typeof errorMessage === TYPEOF.STRING &&
      errorMessage.includes(MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN);
  }

  /**
   * Return true when this replica can refresh group topology authoritatively.
   * @return {boolean}
   * @private
   */
  canRepairAuthoritativeForwardTopology() {
    return Boolean(
      this.systemTableCache &&
      typeof this.systemTableCache.applySystemTableChange === TYPEOF.FUNCTION &&
      this.cdcIntegrationService &&
      typeof this.cdcIntegrationService.executeAuthoritativeSystemTableRead ===
        TYPEOF.FUNCTION,
    );
  }

  /**
   * Refresh authoritative message-group topology with cooldown and per-replica
   * deduplication so stale leader relays do not fan out repeated reads.
   * @param {Object} [context]
   * @return {Promise<boolean>}
   * @private
   */
  async maybeRepairAuthoritativeForwardTopology(context = {}) {
    if (!this.canRepairAuthoritativeForwardTopology()) {
      return false;
    }

    if (this.forwardTopologyRepairInFlight) {
      return this.forwardTopologyRepairInFlight;
    }

    const nowMs = this.now();
    if ((nowMs - this.lastForwardTopologyRepairAtMs) <
      this.lastForwardTopologyRepairCooldownMs) {
      return false;
    }

    this.forwardTopologyRepairInFlight = (async () => {
      try {
        const repairResult =
          await this.repairAuthoritativeForwardTopology(context);
        if (repairResult.repaired === true) {
          this.lastForwardTopologyRepairCooldownMs =
            this.forwardTopologyRepairCooldownMs;
        } else if (repairResult.outcome === 'unchanged') {
          this.lastForwardTopologyRepairCooldownMs =
            this.forwardTopologyRepairNoChangeCooldownMs;
        } else {
          this.lastForwardTopologyRepairCooldownMs =
            this.forwardTopologyRepairFailureCooldownMs;
        }
        return repairResult.repaired === true;
      } catch (error) {
        this.lastForwardTopologyRepairCooldownMs =
          this.forwardTopologyRepairFailureCooldownMs;
        this.logger.warn('Authoritative message-group forward topology repair failed', {
          groupId: this.groupId,
          replicaId: this.replicaId,
          staleServiceId: context?.serviceId || null,
          staleAddress: context?.address || null,
          error: error?.message || String(error),
        });
        return false;
      } finally {
        this.lastForwardTopologyRepairAtMs = this.now();
        this.forwardTopologyRepairInFlight = null;
      }
    })();

    return this.forwardTopologyRepairInFlight;
  }

  /**
   * Read canonical group/service/node rows and apply them to the local cache.
   * @param {Object} [context]
   * @return {Promise<{repaired:boolean,outcome:string}>}
   * @private
   */
  async repairAuthoritativeForwardTopology(context = {}) {
    const queryOptions = {
      localReadConsistency: FORWARD_TOPOLOGY_REPAIR_LOCAL_READ_CONSISTENCY,
      allowSqlFallback: true,
      queryOptions: {
        timeoutMs: this.forwardTopologyRepairQueryTimeoutMs,
        sessionId:
          `message-group-forward-topology:${this.groupId}:${this.now()}`,
      },
    };
    const [groupResult, serviceResult] = await Promise.all([
      this.cdcIntegrationService.executeAuthoritativeSystemTableRead(
        TABLES.MESSAGE_GROUPS,
        `SELECT * FROM ${TABLES.MESSAGE_GROUPS} WHERE ${COLUMN.GROUP_ID} = ?`,
        [this.groupId],
        queryOptions,
      ),
      this.cdcIntegrationService.executeAuthoritativeSystemTableRead(
        TABLES.SERVICES,
        `SELECT * FROM ${TABLES.SERVICES} WHERE ${COLUMN.GROUP_ID} = ? ` +
          `AND ${COLUMN.SERVICE_TYPE} = ?`,
        [this.groupId, SERVICE_TYPE.MESSAGE_GROUP],
        queryOptions,
      ),
    ]);

    const groupRows = groupResult?.success === true &&
      Array.isArray(groupResult.rows) ?
      groupResult.rows :
      [];
    const serviceRows = serviceResult?.success === true &&
      Array.isArray(serviceResult.rows) ?
      serviceResult.rows :
      [];
    const nodeIds = [...new Set(serviceRows
      .map((row) => row?.[COLUMN.NODE_ID] || row?.node_id || null)
      .filter((nodeId) => {
        return typeof nodeId === TYPEOF.STRING && nodeId.length > NUM.ZERO;
      }))];

    let nodeRows = [];
    if (nodeIds.length > NUM.ZERO) {
      const placeholders = nodeIds.map(() => '?').join(', ');
      const nodeResult =
        await this.cdcIntegrationService.executeAuthoritativeSystemTableRead(
          TABLES.NODES,
          `SELECT * FROM ${TABLES.NODES} WHERE ${COLUMN.NODE_ID} ` +
            `IN (${placeholders})`,
          nodeIds,
          queryOptions,
        );
      if (nodeResult?.success === true && Array.isArray(nodeResult.rows)) {
        nodeRows = nodeResult.rows;
      }
    }

    let repairedRowCount = NUM.ZERO;
    repairedRowCount += this.applyAuthoritativeForwardTopologyRows(
      TABLES.MESSAGE_GROUPS,
      groupRows,
    );
    repairedRowCount += this.reconcileAuthoritativeForwardServiceRows(
      serviceRows,
    );
    repairedRowCount += this.applyAuthoritativeForwardTopologyRows(
      TABLES.NODES,
      nodeRows,
    );

    if (repairedRowCount > NUM.ZERO) {
      this.logger.warn('Repaired message-group forward topology from authoritative rows', {
        groupId: this.groupId,
        replicaId: this.replicaId,
        staleServiceId: context?.serviceId || null,
        staleAddress: context?.address || null,
        repairedRowCount,
        repairedGroupRowCount: groupRows.length,
        repairedServiceRowCount: serviceRows.length,
        repairedNodeRowCount: nodeRows.length,
      });
      return {
        repaired: true,
        outcome: 'repaired',
      };
    }

    return {
      repaired: false,
      outcome: 'unchanged',
    };
  }

  /**
   * Upsert authoritative topology rows when they differ from the local cache.
   * @param {string} tableName
   * @param {Array<Object>} rows
   * @return {number}
   * @private
   */
  applyAuthoritativeForwardTopologyRows(tableName, rows = []) {
    const cache = this.systemTableCache;
    if (!cache || typeof cache.applySystemTableChange !== TYPEOF.FUNCTION) {
      return NUM.ZERO;
    }

    const primaryKeyField = getSystemCachePrimaryKeyFieldOrFallback(tableName);
    let repairedRowCount = NUM.ZERO;
    for (const row of Array.isArray(rows) ? rows : []) {
      if (!row || typeof row !== TYPEOF.OBJECT) {
        continue;
      }
      const key = row?.[primaryKeyField];
      if (typeof key !== TYPEOF.STRING || key.length === NUM.ZERO) {
        continue;
      }
      const cachedRow = cache.get(tableName, key);
      if (this.areForwardTopologyRowsEqual(cachedRow, row)) {
        continue;
      }
      cache.applySystemTableChange(
        tableName,
        CDC_OPERATION.UPSERT,
        row,
      );
      repairedRowCount += NUM.ONE;
    }
    return repairedRowCount;
  }

  /**
   * Reconcile authoritative message-group service rows, including deleting
   * local group service rows that no longer exist authoritatively.
   * @param {Array<Object>} authoritativeRows
   * @return {number}
   * @private
   */
  reconcileAuthoritativeForwardServiceRows(authoritativeRows = []) {
    const cache = this.systemTableCache;
    if (!cache || typeof cache.applySystemTableChange !== TYPEOF.FUNCTION) {
      return NUM.ZERO;
    }

    let repairedRowCount = this.applyAuthoritativeForwardTopologyRows(
      TABLES.SERVICES,
      authoritativeRows,
    );
    const authoritativeServiceIds = new Set(
      authoritativeRows
        .map((row) => row?.[COLUMN.SERVICE_ID] || row?.service_id || null)
        .filter((serviceId) => {
          return typeof serviceId === TYPEOF.STRING &&
            serviceId.length > NUM.ZERO;
        }),
    );
    const cachedRows = typeof cache.filter === TYPEOF.FUNCTION ?
      cache.filter(TABLES.SERVICES, (row) => {
        return row?.[COLUMN.GROUP_ID] === this.groupId &&
          row?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP;
      }) :
      [];
    for (const cachedRow of cachedRows) {
      const serviceId = cachedRow?.[COLUMN.SERVICE_ID] || cachedRow?.service_id;
      if (typeof serviceId !== TYPEOF.STRING ||
        serviceId.length === NUM.ZERO ||
        authoritativeServiceIds.has(serviceId)) {
        continue;
      }
      cache.applySystemTableChange(
        TABLES.SERVICES,
        CDC_OPERATION.DELETE,
        cachedRow,
      );
      repairedRowCount += NUM.ONE;
    }
    return repairedRowCount;
  }

  /**
   * Compare one cached row to an authoritative replacement.
   * @param {?Object} left
   * @param {?Object} right
   * @return {boolean}
   * @private
   */
  areForwardTopologyRowsEqual(left, right) {
    if (!left || !right ||
      typeof left !== TYPEOF.OBJECT ||
      typeof right !== TYPEOF.OBJECT) {
      return false;
    }
    const keys = new Set([
      ...Object.keys(left),
      ...Object.keys(right),
    ]);
    for (const key of keys) {
      if (left[key] !== right[key]) {
        return false;
      }
    }
    return true;
  }

  /**
   * Determine whether a delivery error indicates a stale or unavailable
   * forward target that should be temporarily suppressed.
   * @param {?Object} deliveryResult
   * @param {?string} errorMessage
   * @return {boolean}
   * @private
   */
  shouldSuppressForwardTarget(deliveryResult, errorMessage) {
    if (typeof errorMessage !== TYPEOF.STRING || errorMessage.length === NUM.ZERO) {
      return false;
    }
    return this.shouldRepairForwardTopology(errorMessage) ||
      errorMessage === TRANSPORT_ERROR_MSG.MESSAGE_TIMEOUT ||
      errorMessage.includes('ENOTFOUND') ||
      errorMessage.includes('EAI_AGAIN') ||
      errorMessage.includes('ECONNREFUSED') ||
      errorMessage.includes('No connection to node') ||
      (errorMessage.includes('Connection to node') &&
        errorMessage.includes('closed')) ||
      errorMessage.includes('No handler registered for address');
  }

  /**
   * Forward a CDC event to the message group leader for Raft replication.
   * Called when the local MG replica is not the Raft leader. Uses the
   * existing latency CDC propagation message type which the leader
   * already handles via handleLatencyCdcPropagationMessage.
   * @param {string} tableName - System table name.
   * @param {string} operation - CDC operation.
   * @param {Object} data - Record data.
   * @param {Object} [options]
   * @param {string} [options.timestamp]
   * @return {Promise<void>}
   * @private
   */
  async forwardCDCEventToLeader(tableName, operation, data, options = {}) {
    const eventTimestamp = typeof options.timestamp === 'string' &&
      options.timestamp.length > NUM.ZERO ?
      options.timestamp :
      this.hlcClock.now().toString();
    const relayDepth = Number.isInteger(options.relayDepth) &&
      options.relayDepth >= NUM.ZERO ?
      options.relayDepth :
      NUM.ZERO;
    const causeId = normalizeCauseId(options.causeId);
    const isConnectedNode = (nodeId) => {
      if (typeof this.transport?.getConnectionState !== TYPEOF.FUNCTION) {
        return true;
      }
      return this.transport.getConnectionState(nodeId) === STATE.CONNECTED;
    };
    const cacheLeaderService = resolveMessageGroupLeaderServiceFromCache(
      this.systemTableCache,
      this.groupId,
      {
        excludeServiceId: this.replicaId,
        isConnectedNode,
      },
    );
    const cacheForwardService = resolveMessageGroupForwardServiceFromCache(
      this.systemTableCache,
      this.groupId,
      {
        excludeServiceId: this.replicaId,
        isConnectedNode,
      },
    );
    const {
      targets: forwardTargets,
      suppressedCount,
    } = this.buildCDCForwardTargets(
      cacheLeaderService,
      cacheForwardService,
    );
    if (forwardTargets.length === NUM.ZERO) {
      const error = new Error(MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN);
      if (suppressedCount > NUM.ZERO) {
        error.retryable = false;
      }
      throw error;
    }

    const payload = {
      type: MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE.LATENCY_CDC_PROPAGATION,
      tableName,
      operation,
      data,
      timestamp: eventTimestamp,
      sourceNodeId: this.nodeId,
      relayDepth,
      causeId,
    };
    let lastAddressError = null;
    let lastDeliveryError = null;

    for (const target of forwardTargets) {
      let leaderAddress = target.address;
      try {
        if (!leaderAddress) {
          leaderAddress = this.buildPeerAddress(target.serviceId);
        }
        if (!leaderAddress) {
          throw new Error(
            MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_ADDRESS_UNRESOLVED,
          );
        }
      } catch (error) {
        lastAddressError = error;
        continue;
      }

      const forwardStartMs = this.now();
      try {
        const deliveryResult = await this.transport.deliver(leaderAddress, payload);
        const deliveryAcked = deliveryResult?.acknowledged === true;
        const deliverySucceeded = deliveryResult?.success !== false;
        const deliveryErrorMessage =
          typeof deliveryResult?.error === TYPEOF.STRING &&
          deliveryResult.error.length > NUM.ZERO ?
            deliveryResult.error :
            null;
        const deliveryRejectedByHandler = deliveryResult?.noHandler === true ||
          deliveryErrorMessage !== null;
        if (!deliveryAcked || !deliverySucceeded || deliveryRejectedByHandler) {
          const shouldRepairTopology =
            this.shouldRepairForwardTopology(deliveryErrorMessage);
          if (this.shouldSuppressForwardTarget(
            deliveryResult,
            deliveryErrorMessage,
          )) {
            this.suppressForwardTarget({
              serviceId: target.serviceId,
              address: leaderAddress,
            });
          }
          if (shouldRepairTopology) {
            await this.maybeRepairAuthoritativeForwardTopology({
              serviceId: target.serviceId,
              address: leaderAddress,
              errorMessage: deliveryErrorMessage,
            });
          }
          this.logger.warn('CDC forward to leader rejected', {
            groupId: this.groupId,
            replicaId: this.replicaId,
            leaderId: target.serviceId,
            leaderAddress,
            tableName,
            operation,
            relayDepth,
            causeId,
            durationMs: this.now() - forwardStartMs,
            acknowledged: deliveryAcked,
            success: deliverySucceeded,
            noHandler: deliveryResult?.noHandler === true,
            error: deliveryErrorMessage,
          });
          const deliveryError = deliveryErrorMessage !== null ?
              `: ${deliveryErrorMessage}` :
              '';
          lastDeliveryError = new Error(
            `${MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_DELIVERY_REJECTED}${deliveryError}`,
          );
          continue;
        }
        this.clearForwardTargetSuppression({
          serviceId: target.serviceId,
          address: leaderAddress,
        });
        return;
      } catch (error) {
        const shouldRepairTopology =
          this.shouldRepairForwardTopology(error?.message || null);
        if (this.shouldSuppressForwardTarget(
          null,
          error?.message || null,
        )) {
          this.suppressForwardTarget({
            serviceId: target.serviceId,
            address: leaderAddress,
          });
        }
        if (shouldRepairTopology) {
          await this.maybeRepairAuthoritativeForwardTopology({
            serviceId: target.serviceId,
            address: leaderAddress,
            errorMessage: error?.message || null,
          });
        }
        lastDeliveryError = error;
      }
    }

    if (lastDeliveryError) {
      throw lastDeliveryError;
    }
    if (lastAddressError) {
      throw new Error(
        `${MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_ADDRESS_UNRESOLVED}: ` +
          `${lastAddressError.message}`,
      );
    }

    throw new Error(MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN);
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
      this.rebalancer.sqlQueryEngine = this.cdcIntegrationService?.sqlQueryEngine || null;
      this.rebalancer.setLeader(this.isLeaderReplica());
      return;
    }

    if (!this.initialized || !this.isLeaderReplica()) {
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
    this.rebalancer.setLeader(true);
  }

  /**
   * Update rebalancer leadership when raft role changes.
   * @private
   */
  updateRebalancerLeadership() {
    if (this.rebalancer) {
      this.rebalancer.setLeader(this.isLeaderReplica());
      return;
    }
    this.maybeInitializeRebalancer();
  }

  /**
   * Queue a raft role update for persistence.
   * @param {string} role - New raft role.
   * @private
   */
  queueRoleUpdate(role) {
    this.roleMutationHelper.queue(role);
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
    return isSystemTableWriteReady(this.systemTableCache, SYSTEM_TABLE_NAME.MESSAGE_GROUPS);
  }

  /**
   * Check if the services partition leader is available for writes.
   * @return {boolean} True if a leader with an address is known.
   * @private
   */
  isServicesLeaderAvailable() {
    return isSystemTableWriteReady(this.systemTableCache, SYSTEM_TABLE_NAME.SERVICES);
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
