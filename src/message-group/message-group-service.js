/**
 * Message Group Service - Reliable inter-service communication.
 * Implements 3-replica Raft groups using liferaft library for consensus.
 * Requirements: 1.4, 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.4, 6.5
 */

import {EventEmitter} from 'events';
import {v4 as uuidv4} from 'uuid';
import LifeRaft from '@markwylde/liferaft';
import {
  ADDRESS,
  COLUMN,
  ENTITY_TYPE,
  METRICS_LOG_TAG,
  NUM,
  STRING,
  TABLES,
  TIME_MS,
  TYPEOF,
} from '../constants/index.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {CONFIG_KEY} from '../config/config-constants.js';
import {LoggingService} from '../logging/logging-service.js';
import {NodeService} from '../node/node-service.js';
import {HLCClockService} from '../hlc/hlc-clock-service.js';
import {HLCTimestamp} from '../hlc/hlc-timestamp.js';
import {SystemTableName} from '../bootstrap/system-table-schemas-constants.js';
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
import {AddressManager} from '../address/address-manager.js';
import {
  UnifiedRebalancer,
  EntityType as RebalancerEntityType,
} from '../rebalancer/unified-rebalancer.js';
import {
  MESSAGE_GROUP_APPLICATION_ERROR_MSG,
  MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE,
  MESSAGE_GROUP_APPLICATION_STATUS,
  MESSAGE_GROUP_SUBSYSTEM,
  MESSAGE_STATUS as MessageStatus,
  RAFT_ROLE as RaftRole,
} from './constants.js';
import {CDCHandler} from './cdc-handler.js';

// Note: isRaftPacket and RAFT_PACKET_TYPES are imported from shared module
// src/raft/raft-packet-utils.js - Requirements: 9.1, 9.2, 9.3, 9.4

/**
 * In-memory Raft log entry (kept for backward compatibility).
 */
class RaftLogEntry {
  /**
   * Create a new Raft log entry.
   * @param {number} term - Raft term.
   * @param {number} index - Log index.
   * @param {Object} data - Entry data.
   */
  constructor(term, index, data) {
    this.term = term;
    this.index = index;
    this.data = data;
    this.timestamp = Date.now();
  }
}


/**
 * In-memory Raft storage for message groups (kept for backward compatibility).
 */
class InMemoryRaftStorage {
  /**
   * Create a new in-memory Raft storage.
   */
  constructor() {
    this.log = [];
    this.currentTerm = 0;
    this.votedFor = null;
    this.commitIndex = 0;
    this.lastApplied = 0;
  }

  /**
   * Append an entry to the log.
   * @param {Object} data - Entry data.
   * @return {RaftLogEntry} The appended entry.
   */
  appendEntry(data) {
    const index = this.log.length + 1;
    const entry = new RaftLogEntry(this.currentTerm, index, data);
    this.log.push(entry);
    return entry;
  }

  /**
   * Get entries from a starting index.
   * @param {number} startIndex - Starting index (1-based).
   * @return {Array<RaftLogEntry>} Log entries.
   */
  getEntriesFrom(startIndex) {
    if (startIndex < 1) {
      return [...this.log];
    }
    return this.log.slice(startIndex - 1);
  }

  /**
   * Get the last log entry.
   * @return {RaftLogEntry|null} Last entry or null.
   */
  getLastEntry() {
    return this.log.length > 0 ? this.log[this.log.length - 1] : null;
  }

  /**
   * Get entry at a specific index.
   * @param {number} index - Log index (1-based).
   * @return {RaftLogEntry|null} Entry or null.
   */
  getEntry(index) {
    if (index < 1 || index > this.log.length) {
      return null;
    }
    return this.log[index - 1];
  }

  /**
   * Truncate log from a specific index.
   * @param {number} fromIndex - Index to truncate from (1-based).
   */
  truncateFrom(fromIndex) {
    if (fromIndex >= 1 && fromIndex <= this.log.length) {
      this.log = this.log.slice(0, fromIndex - 1);
    }
  }

  /**
   * Get the log length.
   * @return {number} Number of entries.
   */
  getLogLength() {
    return this.log.length;
  }
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
      throw new Error('MessageGroupService requires groupId');
    }
    if (!options.replicaId) {
      throw new Error('MessageGroupService requires replicaId');
    }

    // Transport is now required - WebSocket transport is mandatory
    if (!options.transport) {
      throw new Error(
        'MessageGroupService requires transport - WebSocket transport is mandatory',
      );
    }

    // Validate transport is WebSocket-based (MessageRouter)
    if (!this.isWebSocketBasedTransport(options.transport)) {
      throw new Error(
        'MessageGroupService requires WebSocket-based transport (MessageRouter)',
      );
    }

    this.groupId = options.groupId;
    this.replicaId = options.replicaId;
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
    this.deliveryTimeoutMs = config.get(CONFIG_KEY.MESSAGE_GROUP_DELIVERY_TIMEOUT_MS) || 5000;
    this.retryMaxAttempts = config.get(CONFIG_KEY.MESSAGE_GROUP_RETRY_MAX_ATTEMPTS) || 3;
    this.retryInitialDelayMs = config.get(CONFIG_KEY.MESSAGE_GROUP_RETRY_INITIAL_DELAY_MS) || 100;
    this.retryBackoffMultiplier =
      config.get(CONFIG_KEY.MESSAGE_GROUP_RETRY_BACKOFF_MULTIPLIER) || 2;
    this.retryMaxDelayMs = config.get(CONFIG_KEY.MESSAGE_GROUP_RETRY_MAX_DELAY_MS) || 10000;
    this.retryJitterFactor = config.get(CONFIG_KEY.MESSAGE_GROUP_RETRY_JITTER_FACTOR) || 0.1;

    // Raft state - using liferaft library
    // Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
    this.raft = null; // Initialized in initialize()
    this.logAdapter = new InMemoryLogAdapter();
    // Note: transportAdapter removed - RaftNode.write() now calls messageRouter directly
    // Requirements: 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 4.4

    this.storage = new InMemoryRaftStorage();
    this.role = RaftRole.FOLLOWER;
    this.leaderId = null;
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.pendingRoleUpdate = this.role;
    this.persistedRole = null;
    this.roleUpdateInFlight = false;
    this.roleUpdateRetryTimer = null;
    this.pendingLeaderNodeUpdate = null;
    this.persistedLeaderNodeId = null;
    this.leaderNodeUpdateInFlight = false;
    this.leaderNodeUpdateRetryTimer = null;
    this.tablePolicyService = options.tablePolicyService || null;
    this.rebalanceCoordinator = options.rebalanceCoordinator || null;
    this.rebalancer = null;

    // Message tracking
    this.pendingMessages = new Map();
    this.acknowledgedMessages = new Set();
    this.messageCallbacks = new Map();

    // System table cache - use shared cache from NodeService singleton
    // This ensures all services on the same node share the same cache
    const nodeService = NodeService.getInstance();
    this.systemTableCache = nodeService.getSystemTableCache();
    this.readOnlyCache = nodeService.getReadOnlySystemTableCache();

    // HLC clock for ordering
    this.hlcClock = new HLCClockService(this.replicaId);

    // Single-owner CDC handler for subscriptions and cache application.
    this.cdcHandler = new CDCHandler(this.systemTableCache);
    // Backward-compatible alias retained for status/read-only access.
    this.cdcSubscriptions = this.cdcHandler.subscriptions;

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(MESSAGE_GROUP_SUBSYSTEM.NAME) : console;

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
    this.raft.on(RAFT_EVENT.LEADER, () => {
      this.role = RaftRole.LEADER;
      this.isLeader = true;
      this.leaderId = this.replicaId;
      this.queueRoleUpdate(this.role);
      this.queueLeaderNodeUpdate(this.nodeId);
      this.updateRebalancerLeadership();
      this.storage.currentTerm = this.raftProvider.getCurrentTerm(this.raft);
      const term = this.raftProvider.getCurrentTerm(this.raft);

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
    });

    this.raft.on(RAFT_EVENT.FOLLOWER, () => {
      this.role = RaftRole.FOLLOWER;
      this.isLeader = false;
      this.queueRoleUpdate(this.role);
      this.pendingLeaderNodeUpdate = null;
      this.persistedLeaderNodeId = null;
      this.updateRebalancerLeadership();
      if (this.leaderNodeUpdateRetryTimer) {
        clearTimeout(this.leaderNodeUpdateRetryTimer);
        this.leaderNodeUpdateRetryTimer = null;
      }
      this.storage.currentTerm = this.raftProvider.getCurrentTerm(this.raft);
    });

    this.raft.on(RAFT_EVENT.CANDIDATE, () => {
      this.role = RaftRole.CANDIDATE;
      this.isLeader = false;
      this.queueRoleUpdate(this.role);
      this.pendingLeaderNodeUpdate = null;
      this.persistedLeaderNodeId = null;
      this.updateRebalancerLeadership();
      if (this.leaderNodeUpdateRetryTimer) {
        clearTimeout(this.leaderNodeUpdateRetryTimer);
        this.leaderNodeUpdateRetryTimer = null;
      }
      this.storage.currentTerm = this.raftProvider.getCurrentTerm(this.raft);
    });

    // Handle committed entries
    // Requirements: 6.1, 6.2, 6.4, 6.5
    this.raft.on(RAFT_EVENT.COMMIT, (command) => {
      this.applyCommittedEntry(command);
    });

    this.raft.on(RAFT_EVENT.LEADER_CHANGE, (to) => {
      this.leaderId = to;
      this.logger.debug('Leader changed', {
        newLeader: to,
        groupId: this.groupId,
      });
    });

    this.raft.on(RAFT_EVENT.TERM_CHANGE, (term) => {
      this.storage.currentTerm = term;
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
      createdAt: Date.now(),
    };


    this.logger.debug('Sending message', {
      messageId,
      targetService,
      groupId: this.groupId,
    });

    // Track pending message
    this.pendingMessages.set(messageId, messageEnvelope);

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

      if (deliveryResult.success) {
        // Direct delivery succeeded
        messageEnvelope.status = MessageStatus.DELIVERED;
        this.logger.debug('Message delivered directly', {
          messageId,
          targetService,
        });
        // Spread the transport result directly - ACK structure is flat
        const {success: _s, attempt: _a, ...transportResult} = deliveryResult;
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
   * @return {Promise<Object>} Delivery result.
   * @private
   */
  async attemptDirectDelivery(messageEnvelope) {
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

    for (let attempt = 0; attempt < this.retryMaxAttempts; attempt++) {
      messageEnvelope.attempts++;

      try {
        // Calculate delay with exponential backoff and jitter
        if (attempt > 0) {
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
          return {success: true, attempt: attempt + 1, ...result};
        }
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

    return {success: false, error: lastError?.message || 'Max retries exceeded'};
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
    const entry = this.storage.appendEntry({
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
    if (!tableName || !operation || !data) {
      throw new Error(
        MESSAGE_GROUP_APPLICATION_ERROR_MSG.INVALID_LATENCY_CDC_PAYLOAD,
      );
    }

    await this.applyCDCEvent(tableName, operation, data, {
      skipSubscriptionCheck: true,
    });

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
    const entry = this.storage.appendEntry({
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
    const applyStartMs = Date.now();
    const skipSubscriptionCheck =
      options.skipSubscriptionCheck === true;
    const eventTimestamp =
      options.timestamp || this.hlcClock.now().toString();
    const applied = this.cdcHandler.applyImmediate(
      {
        tableName,
        operation,
        data,
        timestamp: eventTimestamp,
      },
      {skipSubscriptionCheck},
    );
    if (!applied) {
      return;
    }

    if (!options.skipReplication) {
      // Persist CDC event to Raft log for replication
      const entry = this.storage.appendEntry({
        type: 'CDC',
        tableName,
        operation,
        data,
        timestamp: eventTimestamp,
      });

      // Replicate via Raft so all message group replicas (and their
      // co-located system caches) receive this CDC event.
      const isLiferaftLeader =
        this.raft && this.raft.state === LifeRaft.LEADER;
      if (isLiferaftLeader) {
        // Leader: propose directly to Raft log for replication.
        this.raftProvider.propose(this.raft, {
          type: 'CDC',
          tableName,
          operation,
          data,
        }, (err) => {
          if (err) {
            this.logger.debug('Raft CDC command failed', {
              tableName,
              error: err.message,
            });
          }
        });
      } else {
        // Non-leader: forward to the MG leader for Raft replication.
        // Without this, CDC events from partition leaders co-located
        // with a non-leader MG replica never reach other nodes.
        // Dedup in cdcHandler.applyImmediate prevents double-apply
        // when the Raft-replicated entry arrives back on this node.
        this.forwardCDCEventToLeader(tableName, operation, data);
      }

      try {
        const handlerDurationMs = Date.now() - applyStartMs;
        const metricsData = {
          tableName,
          operation,
          handlerDurationMs,
        };
        if (options.timestamp != null) {
          metricsData.eventAgeMs =
            Date.now() - options.timestamp;
        }
        this.logger.info(
          METRICS_LOG_TAG.CDC_PROPAGATION, metricsData,
        );
      } catch (_metricsErr) {
        // Metrics logging must not propagate to callers
      }

      this.emit('cdcApplied', {
        tableName, operation, data, logIndex: entry.index,
      });
      return;
    }

    try {
      const handlerDurationMs = Date.now() - applyStartMs;
      const metricsData = {
        tableName,
        operation,
        handlerDurationMs,
      };
      if (options.timestamp != null) {
        metricsData.eventAgeMs =
          Date.now() - options.timestamp;
      }
      this.logger.info(
        METRICS_LOG_TAG.CDC_PROPAGATION, metricsData,
      );
    } catch (_metricsErr) {
      // Metrics logging must not propagate to callers
    }

    this.emit('cdcApplied', {
      tableName, operation, data, logIndex: null,
    });
  }

  /**
   * Forward a CDC event to the message group leader for Raft replication.
   * Called when the local MG replica is not the Raft leader. Uses the
   * existing latency CDC propagation message type which the leader
   * already handles via handleLatencyCdcPropagationMessage.
   * Fire-and-forget: forwarding failures are logged but do not block
   * the caller. The local cache is already updated before this runs.
   * @param {string} tableName - System table name.
   * @param {string} operation - CDC operation.
   * @param {Object} data - Record data.
   * @private
   */
  forwardCDCEventToLeader(tableName, operation, data) {
    if (!this.leaderId || this.leaderId === this.replicaId) {
      return;
    }
    let leaderAddress;
    try {
      leaderAddress = this.buildPeerAddress(this.leaderId);
    } catch (_err) {
      this.logger.debug('Cannot resolve leader address for CDC forward', {
        groupId: this.groupId,
        leaderId: this.leaderId,
      });
      return;
    }
    const payload = {
      type: MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE.LATENCY_CDC_PROPAGATION,
      tableName,
      operation,
      data,
      sourceNodeId: this.nodeId,
    };
    this.transport.deliver(leaderAddress, payload).catch((err) => {
      this.logger.debug('CDC forward to leader failed', {
        groupId: this.groupId,
        leaderId: this.leaderId,
        tableName,
        error: err.message,
      });
    });
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
      this.rebalancer.rebalanceCoordinator = this.rebalanceCoordinator;
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
    if (!role || role === this.persistedRole) {
      return;
    }

    this.pendingRoleUpdate = role;
    if (!this.cdcIntegrationService) {
      return;
    }

    this.flushRoleUpdate().catch((error) => {
      this.logger.warn('Failed to persist raft role update', {
        groupId: this.groupId,
        replicaId: this.replicaId,
        role,
        error: error.message,
      });
    });
  }

  /**
   * Queue a message group leader update for persistence.
   * @param {string} leaderNodeId - Leader node ID.
   * @private
   */
  queueLeaderNodeUpdate(leaderNodeId) {
    if (!leaderNodeId || leaderNodeId === this.persistedLeaderNodeId) {
      return;
    }

    this.pendingLeaderNodeUpdate = leaderNodeId;
    if (!this.cdcIntegrationService) {
      return;
    }

    this.flushLeaderNodeUpdate().catch((error) => {
      this.logger.warn('Failed to persist message group leader update', {
        groupId: this.groupId,
        replicaId: this.replicaId,
        leaderNodeId,
        error: error.message,
      });
    });
  }

  /**
   * Persist the latest pending raft role update.
   * @return {Promise<void>}
   * @private
   */
  async flushRoleUpdate() {
    if (this.roleUpdateInFlight) {
      return;
    }

    if (!this.cdcIntegrationService || !this.pendingRoleUpdate ||
        this.pendingRoleUpdate === this.persistedRole) {
      return;
    }

    if (!this.isServicesLeaderAvailable()) {
      this.scheduleRoleUpdateRetry();
      return;
    }

    this.roleUpdateInFlight = true;
    const role = this.pendingRoleUpdate;

    try {
      await this.cdcIntegrationService.updateSystemTableRow(
        SystemTableName.SERVICES,
        {service_id: this.replicaId},
        {
          raft_role: role,
          updated_at: Date.now(),
        },
      );
      this.persistedRole = role;
    } catch (error) {
      this.scheduleRoleUpdateRetry();
      throw error;
    } finally {
      this.roleUpdateInFlight = false;
    }
  }

  /**
   * Persist the latest pending message group leader update.
   * @return {Promise<void>}
   * @private
   */
  async flushLeaderNodeUpdate() {
    if (this.leaderNodeUpdateInFlight) {
      return;
    }

    this.syncLeaderNodeFromCache();

    if (!this.isLeader) {
      this.pendingLeaderNodeUpdate = null;
      return;
    }

    if (!this.cdcIntegrationService || !this.pendingLeaderNodeUpdate ||
        this.pendingLeaderNodeUpdate === this.persistedLeaderNodeId) {
      return;
    }

    if (!this.isMessageGroupsLeaderAvailable()) {
      this.scheduleLeaderNodeUpdateRetry();
      return;
    }

    this.leaderNodeUpdateInFlight = true;
    const leaderNodeId = this.pendingLeaderNodeUpdate;

    try {
      await this.cdcIntegrationService.updateSystemTableRow(
        SystemTableName.MESSAGE_GROUPS,
        {[COLUMN.GROUP_ID]: this.groupId},
        {
          [COLUMN.LEADER_NODE_ID]: leaderNodeId,
          [COLUMN.UPDATED_AT]: Date.now(),
        },
      );
      this.persistedLeaderNodeId = leaderNodeId;
    } catch (error) {
      this.scheduleLeaderNodeUpdateRetry();
      throw error;
    } finally {
      this.leaderNodeUpdateInFlight = false;
    }
  }

  /**
   * Sync persisted leader node state from the system cache.
   * @private
   */
  syncLeaderNodeFromCache() {
    if (!this.systemTableCache || !this.systemTableCache.get) {
      return;
    }
    const cached = this.systemTableCache.get(TABLES.MESSAGE_GROUPS, this.groupId);
    const cachedLeaderNodeId = cached?.[COLUMN.LEADER_NODE_ID] || null;
    if (!cachedLeaderNodeId) {
      return;
    }
    this.persistedLeaderNodeId = cachedLeaderNodeId;
    if (this.pendingLeaderNodeUpdate === cachedLeaderNodeId) {
      this.pendingLeaderNodeUpdate = null;
    }
  }

  /**
   * Check if the message_groups partition leader is available for writes.
   * @return {boolean} True if a leader with an address is known.
   * @private
   */
  isMessageGroupsLeaderAvailable() {
    return isSystemTableWriteReady(this.systemTableCache, SystemTableName.MESSAGE_GROUPS);
  }

  /**
   * Check if the services partition leader is available for writes.
   * @return {boolean} True if a leader with an address is known.
   * @private
   */
  isServicesLeaderAvailable() {
    return isSystemTableWriteReady(this.systemTableCache, SystemTableName.SERVICES);
  }

  /**
   * Schedule a retry for persisting the pending role update.
   * @private
   */
  scheduleRoleUpdateRetry() {
    if (this.roleUpdateRetryTimer) {
      return;
    }
    this.roleUpdateRetryTimer = setTimeout(() => {
      this.roleUpdateRetryTimer = null;
      this.flushRoleUpdate().catch((error) => {
        this.logger.warn('Failed to persist raft role update', {
          groupId: this.groupId,
          replicaId: this.replicaId,
          role: this.pendingRoleUpdate,
          error: error.message,
        });
      });
    }, TIME_MS.SECOND);
  }

  /**
   * Schedule a retry for persisting the pending message group leader update.
   * @private
   */
  scheduleLeaderNodeUpdateRetry() {
    if (this.leaderNodeUpdateRetryTimer) {
      return;
    }
    this.leaderNodeUpdateRetryTimer = setTimeout(() => {
      this.leaderNodeUpdateRetryTimer = null;
      this.flushLeaderNodeUpdate().catch((error) => {
        this.logger.warn('Failed to persist message group leader update', {
          groupId: this.groupId,
          replicaId: this.replicaId,
          leaderNodeId: this.pendingLeaderNodeUpdate,
          error: error.message,
        });
      });
    }, TIME_MS.SECOND);
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
      this.storage.currentTerm;
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
        this.storage.currentTerm,
      logLength: this.storage.getLogLength(),
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

    // End liferaft instance - clear all timers first
    if (this.raft) {
      this.raftProvider.shutdownNode(this.raft);
      this.raft = null;
    }

    if (this.roleUpdateRetryTimer) {
      clearTimeout(this.roleUpdateRetryTimer);
      this.roleUpdateRetryTimer = null;
    }
    if (this.leaderNodeUpdateRetryTimer) {
      clearTimeout(this.leaderNodeUpdateRetryTimer);
      this.leaderNodeUpdateRetryTimer = null;
    }
    await this.quiesceRebalancing();
    this.cdcHandler.shutdown();

    this.initialized = false;
    this.pendingMessages.clear();
    this.messageCallbacks.clear();

    this.emit('shutdown', {groupId: this.groupId, replicaId: this.replicaId});
  }
}

export {
  MessageGroupService,
  MessageStatus,
  RaftRole,
  RaftLogEntry,
  InMemoryRaftStorage,
  isRaftPacket,
  RAFT_PACKET_TYPES,
};
