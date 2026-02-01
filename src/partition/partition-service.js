/**
 * Partition Service - SQLite-backed Raft group for data storage.
 * Implements table partitions with Raft consensus for replication.
 * Uses liferaft library for Raft consensus with simplified transport.
 * Requirements: 1.4, 3.2, 3.3, 3.4, 3.5, 4.4, 8.1, 10.1, 35.1, 35.5
 */

import {EventEmitter} from 'events';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import LifeRaft from '@markwylde/liferaft';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {CONFIG_KEY} from '../config/config-constants.js';
import {LoggingService} from '../logging/logging-service.js';
import {HLCClockService} from '../hlc/hlc-clock-service.js';
import {UnifiedRebalancer, EntityType} from '../rebalancer/unified-rebalancer.js';
import {RebalanceCoordinator} from '../rebalancer/rebalance-coordinator.js';
import {ReplicaStatus} from '../rebalancer/replica-status.js';
import {assertCritical} from '../utils/assert.js';
import {PendingRequestTracker} from './pending-request-tracker.js';
import {isRaftPacket} from '../raft/raft-packet-utils.js';
import {SQLiteLogAdapter} from '../raft/sqlite-log-adapter.js';
import {
  SystemTableName,
} from '../bootstrap/system-table-schemas-constants.js';
import {AddressManager} from '../address/address-manager.js';
import {NodeService as nodeServiceClass} from '../node/node-service.js';
import {isSystemTableWriteReady} from '../cache/leader-readiness-gate.js';
import {
  COLUMN,
  CDC_OPERATION,
  ENTITY_TYPE,
  ERRORS,
  NUM,
  SQL,
  SERVICE_TYPE,
  STRING,
  TABLES,
  TIME_MS,
} from '../constants/index.js';
import {PARTITION_RAFT_ROLE, PARTITION_STATE, PARTITION_SUBSYSTEM} from './partition-constants.js';
import {
  PARTITION_SERVICE_ADDRESS,
  PARTITION_SERVICE_COLUMN,
  PARTITION_SERVICE_COLUMN_SQL,
  PARTITION_SERVICE_DB,
  PARTITION_SERVICE_DEFAULT,
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_EVENT,
  PARTITION_SERVICE_LIFERAFT_TIMER,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_MESSAGE_TYPE,
  PARTITION_SERVICE_OPERATION,
  PARTITION_SERVICE_REASON,
  PARTITION_SERVICE_RESPONSE,
  PARTITION_SERVICE_ROLE,
  PARTITION_SERVICE_SQL,
  PARTITION_SERVICE_SQL_FRAGMENT,
  PARTITION_SERVICE_STATE_KEY,
  PARTITION_SERVICE_STATUS,
  PARTITION_SERVICE_TYPE,
  PARTITION_SERVICE_VALUE,
} from './partition-service-constants.js';

const getNodeService = () => nodeServiceClass.getInstance();

/**
 * Partition state enumeration.
 */
const PartitionState = PARTITION_STATE;

/**
 * Raft role enumeration.
 */
const RaftRole = PARTITION_RAFT_ROLE;

/**
 * CDC operation types.
 */
const CDCOperation = CDC_OPERATION;

/**
 * Raft log entry for partition operations.
 */
class PartitionRaftLogEntry {
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
 * SQLite-backed Raft storage for partitions.
 */
class SQLiteRaftStorage {
  /**
   * Create a new SQLite Raft storage.
   * @param {Database} db - SQLite database instance.
   * @param {string} partitionId - Partition ID.
   */
  constructor(db, partitionId) {
    this.db = db;
    this.partitionId = partitionId;
    this.currentTerm = NUM.ZERO;
    this.votedFor = null;
    this.commitIndex = NUM.ZERO;
    this.lastApplied = NUM.ZERO;

    // In-memory log for Raft entries
    this.log = [];

    this.initializeRaftTables();
  }

  /**
   * Initialize Raft metadata tables.
   * @private
   */
  initializeRaftTables() {
    // Create Raft state table
    this.db.exec(PARTITION_SERVICE_SQL.CREATE_RAFT_STATE_TABLE);

    // Create Raft log table
    this.db.exec(PARTITION_SERVICE_SQL.CREATE_RAFT_LOG_TABLE);

    // Load persisted state
    this.loadPersistedState();
  }

  /**
   * Load persisted Raft state from SQLite.
   * @private
   */
  loadPersistedState() {
    const termRow = this.db.prepare(
      PARTITION_SERVICE_SQL.SELECT_RAFT_STATE_VALUE,
    ).get(PARTITION_SERVICE_STATE_KEY.CURRENT_TERM);
    if (termRow) {
      this.currentTerm = parseInt(termRow.value, NUM.TEN);
    }

    const votedRow = this.db.prepare(
      PARTITION_SERVICE_SQL.SELECT_RAFT_STATE_VALUE,
    ).get(PARTITION_SERVICE_STATE_KEY.VOTED_FOR);
    if (votedRow) {
      this.votedFor = votedRow.value;
    }

    // Load log entries
    const entries = this.db.prepare(
      PARTITION_SERVICE_SQL.SELECT_RAFT_LOGS,
    ).all();

    this.log = entries.map((row) => new PartitionRaftLogEntry(
      row.term,
      row.log_index,
      JSON.parse(row.command),
    ));

    if (this.log.length > NUM.ZERO) {
      this.commitIndex = this.log[this.log.length - NUM.ONE].index;
      this.lastApplied = this.commitIndex;
    }
  }

  /**
   * Persist current term to SQLite.
   */
  persistTerm() {
    this.db.prepare(
      PARTITION_SERVICE_SQL.UPSERT_RAFT_STATE,
    ).run(PARTITION_SERVICE_STATE_KEY.CURRENT_TERM, String(this.currentTerm));
  }

  /**
   * Persist voted for to SQLite.
   */
  persistVotedFor() {
    this.db.prepare(
      PARTITION_SERVICE_SQL.UPSERT_RAFT_STATE,
    ).run(PARTITION_SERVICE_STATE_KEY.VOTED_FOR, this.votedFor || STRING.EMPTY);
  }

  /**
   * Append an entry to the log.
   * @param {Object} data - Entry data.
   * @return {PartitionRaftLogEntry} The appended entry.
   */
  appendEntry(data) {
    const index = this.log.length + NUM.ONE;
    const entry = new PartitionRaftLogEntry(this.currentTerm, index, data);
    this.log.push(entry);

    // Persist to SQLite - use INSERT OR REPLACE to handle edge cases gracefully
    this.db.prepare(
      PARTITION_SERVICE_SQL.UPSERT_RAFT_LOG,
    ).run(entry.index, entry.term, JSON.stringify(entry.data), entry.timestamp);

    return entry;
  }

  /**
   * Get entries from a starting index.
   * @param {number} startIndex - Starting index (1-based).
   * @return {Array<PartitionRaftLogEntry>} Log entries.
   */
  getEntriesFrom(startIndex) {
    if (startIndex < NUM.ONE) {
      return [...this.log];
    }
    return this.log.slice(startIndex - NUM.ONE);
  }

  /**
   * Get the last log entry.
   * @return {PartitionRaftLogEntry|null} Last entry or null.
   */
  getLastEntry() {
    return this.log.length > NUM.ZERO ? this.log[this.log.length - NUM.ONE] : null;
  }

  /**
   * Get entry at a specific index.
   * @param {number} index - Log index (1-based).
   * @return {PartitionRaftLogEntry|null} Entry or null.
   */
  getEntry(index) {
    if (index < NUM.ONE || index > this.log.length) {
      return null;
    }
    return this.log[index - NUM.ONE];
  }

  /**
   * Truncate log from a specific index.
   * @param {number} fromIndex - Index to truncate from (1-based).
   */
  truncateFrom(fromIndex) {
    if (fromIndex >= NUM.ONE && fromIndex <= this.log.length) {
      this.log = this.log.slice(NUM.ZERO, fromIndex - NUM.ONE);

      // Truncate in SQLite
      this.db.prepare(PARTITION_SERVICE_SQL.DELETE_RAFT_LOG_FROM).run(fromIndex);
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
 * PartitionService implements a SQLite-backed Raft group for data storage.
 * Each partition is a Raft consensus group with odd-numbered replicas.
 */
class PartitionService extends EventEmitter {
  /**
   * Create a new PartitionService.
   * @param {Object} options - Configuration options.
   * @param {string} options.partitionId - Partition ID.
   * @param {string} options.tableId - Table ID this partition belongs to.
   * @param {string} options.tableName - Table name.
   * @param {Object} options.schema - Table schema definition.
   * @param {Object} options.keyRange - Partition key range {start, end}.
   * @param {string} options.replicaId - This replica's ID.
   * @param {Array<string>} options.replicaIds - All replica IDs in the partition.
   * @param {string} options.nodeId - Node ID hosting this replica.
   * @param {Object} options.transport - MessageRouter for Raft communication.
   * @param {string} options.dbPath - Path to SQLite database file.
   * @param {Object} options.messageGroupService - Message group service for lifecycle messages.
   */
  constructor(options = {}) {
    super();

    if (!options.partitionId) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.REQUIRE_PARTITION_ID);
    }
    if (!options.tableId) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.REQUIRE_TABLE_ID);
    }
    if (!options.replicaId) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.REQUIRE_REPLICA_ID);
    }

    this.partitionId = options.partitionId;
    this.tableId = options.tableId;
    this.tableName = options.tableName || options.tableId;
    this.schema = options.schema || null;
    this.keyRange = options.keyRange || {
      start: PARTITION_SERVICE_DEFAULT.KEY_RANGE_START,
      end: PARTITION_SERVICE_DEFAULT.KEY_RANGE_END,
    };
    this.replicaId = options.replicaId;
    this.replicaIds = options.replicaIds || [this.replicaId];
    this.nodeId = options.nodeId || PARTITION_SERVICE_DEFAULT.NODE_ID;
    this.transport = options.transport || null;
    this.dbPath = options.dbPath || PARTITION_SERVICE_DEFAULT.MEMORY_DB_PATH;

    // Unified address format: {nodeId}/partition/{replicaId}
    // Requirements: 1.1, 1.4, 5.1
    const addressManager = AddressManager.getInstance();
    this.unifiedAddress = addressManager.format(this.nodeId, ENTITY_TYPE.PARTITION, this.replicaId);

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.defaultReplicaCount =
      config.get(CONFIG_KEY.PARTITION_DEFAULT_REPLICA_COUNT) ||
      PARTITION_SERVICE_DEFAULT.DEFAULT_REPLICA_COUNT;
    this.sizeUpdateDebounceMs =
      config.get(CONFIG_KEY.PARTITION_SIZE_UPDATE_DEBOUNCE_MS) ||
      PARTITION_SERVICE_DEFAULT.SIZE_UPDATE_DEBOUNCE_MS;
    this.sizeUpdateIntervalMs =
      config.get(CONFIG_KEY.PARTITION_SIZE_UPDATE_INTERVAL_MS) ||
      PARTITION_SERVICE_DEFAULT.SIZE_UPDATE_INTERVAL_MS;

    // SQLite database
    this.db = null;
    this.storage = null;

    // Raft state - liferaft handles election/heartbeat timers internally
    // Requirements: 11.9
    this.role = RaftRole.FOLLOWER;
    this.leaderId = null;
    this.pendingRoleUpdate = this.role;
    this.persistedRole = null;
    this.roleUpdateInFlight = false;
    this.roleUpdateRetryTimer = null;
    this.pendingLeaderNodeUpdate = null;
    this.persistedLeaderNodeId = null;
    this.leaderNodeUpdateInFlight = false;
    this.leaderNodeUpdateRetryTimer = null;

    // Partition state
    this.state = PartitionState.NORMAL;

    // Size tracking
    this.sizeBytes = NUM.ZERO;
    this.sizeUpdatePending = false;
    this.lastSizeUpdate = NUM.ZERO;
    this.sizeUpdateTimer = null;

    // CDC subscribers
    this.cdcSubscribers = new Set();

    // HLC clock for ordering
    this.hlcClock = new HLCClockService(this.replicaId);

    // Transaction state
    this.activeTransaction = null;
    this.transactionOperations = [];

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(PARTITION_SUBSYSTEM.PARTITION) : console;

    // State
    this.initialized = false;
    this.isLeader = false;

    // PendingRequestTracker for lifecycle messages (replaces EventEmitter-based ACK handling)
    // Requirements: 3.1, 6.1, 6.2, 6.3, 6.4
    this.pendingRequestTracker = new PendingRequestTracker({
      defaultTimeoutMs: PARTITION_SERVICE_DEFAULT.PENDING_REQUEST_TIMEOUT_MS,
    });

    // Rebalancer - manages replica placement when this partition is leader
    this.rebalancer = null;
    this.rebalanceCoordinator = null;
    this.systemTableCache = options.systemTableCache || null;
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.tablePolicyService = options.tablePolicyService || null;
    // Message group service for sending CREATE_REPLICA/REMOVE_REPLICA messages
    this.messageGroupService = options.messageGroupService || null;
    // MessageRouter for cross-node lifecycle messages (CREATE_REPLICA/REMOVE_REPLICA)
    // This transport properly routes through WebSocket to reach remote nodes
    this.messageRouter = options.messageRouter || null;

    // Defer election start until all replicas are ready
    // Learner phase support - new replicas joining existing groups start as learners
    // They receive log entries but don't vote until caught up
    // This prevents new replicas from disrupting existing leadership
    this.isJoiningExistingGroup = options.isJoiningExistingGroup || false;

    // When true, the Raft election timer won't start until startElection() is called
    // This prevents election storms when multiple replicas are created on the same node
    // CRITICAL: Learners must defer elections to prevent disrupting existing leadership
    this.deferElection = options.deferElection || this.isJoiningExistingGroup;
    this.electionStarted = false;
    // ReplicaStateMachine for tracking replica lifecycle states
    this.replicaStateMachine = options.replicaStateMachine || null;

    // Map of replicaId -> unified address (e.g., 'nodeId/partition/replicaId')
    // Used when joining an existing partition on a different node
    // Requirements: 1.1, 3.1, 3.2, 3.3
    this.peerAddresses = options.peerAddresses || [];
    this.learnerPromotionDelayMs = options.learnerPromotionDelayMs ||
      PARTITION_SERVICE_DEFAULT.LEARNER_PROMOTION_DELAY_MS;
    this.learnerCatchUpCheckIntervalMs = options.learnerCatchUpCheckIntervalMs ||
      PARTITION_SERVICE_DEFAULT.LEARNER_CATCH_UP_CHECK_INTERVAL_MS;
    this.learnerPromotionTimer = null;
  }

  /**
   * Get the unified address for this service.
   * Format: ${nodeId}/partition/${replicaId}
   * Requirements: 1.1, 5.1
   * @return {string} Unified address.
   */
  getUnifiedAddress() {
    return this.unifiedAddress;
  }

  /**
   * Build a unified address for a peer replica.
   * Looks up the nodeId from the system table cache if available.
   * Throws if a unified address cannot be resolved.
   * All addresses use fully qualified network identity format: {nodeId}/partition/{replicaId}
   * Requirements: 1.1, 1.4, 3.1, 3.2, 3.3, 9.1
   * @param {string} peerId - Peer replica ID.
   * @return {string} Unified address for the peer.
   */
  buildPeerAddress(peerId) {
    const addressManager = AddressManager.getInstance();

    // If peerId is already in unified format, validate and return as-is.
    // Fail fast (and log) when a provided address is not unified.
    if (peerId.includes(PARTITION_SERVICE_ADDRESS.SEPARATOR)) {
      const validation = addressManager.validate(peerId);
      if (validation.valid) {
        return peerId;
      }
      this.logger.error(PARTITION_SERVICE_LOG_MSG.PEER_ADDRESS_NOT_UNIFIED, {
        peerId,
        partitionId: this.partitionId,
        replicaId: this.replicaId,
        error: validation.error,
      });
      throw new Error(`Peer address must be unified: ${peerId}`);
    }

    // Check peerAddresses array (provided during cross-node joining)
    // Format: ['nodeId/partition/replicaId', ...]
    // Requirements: 1.1, 1.4, 3.1, 3.2, 3.3
    if (this.peerAddresses && this.peerAddresses.length > NUM.ZERO) {
      for (const addr of this.peerAddresses) {
        const validation = addressManager.validate(addr);
        if (!validation.valid) {
          this.logger.error(PARTITION_SERVICE_LOG_MSG.PEER_ADDRESS_NOT_UNIFIED, {
            peerId: addr,
            partitionId: this.partitionId,
            replicaId: this.replicaId,
            error: validation.error,
          });
          throw new Error(`Peer address must be unified: ${addr}`);
        }
        if (
          addr.endsWith(
            `${PARTITION_SERVICE_ADDRESS.SEPARATOR}${ENTITY_TYPE.PARTITION}` +
            `${PARTITION_SERVICE_ADDRESS.SEPARATOR}${peerId}`,
          ) ||
          addr.endsWith(`${PARTITION_SERVICE_ADDRESS.SEPARATOR}${peerId}`)
        ) {
          this.logger.debug(PARTITION_SERVICE_LOG_MSG.PEER_ADDRESS_FROM_LIST, {
            peerId,
            address: addr,
            partitionId: this.partitionId,
          });
          return addr;
        }
      }
    }

    // Try to look up nodeId from system table cache
    if (this.systemTableCache) {
      const service = this.systemTableCache.get(TABLES.SERVICES, peerId);
      if (service && service.node_id) {
        const address = addressManager.format(
          service.node_id,
          ENTITY_TYPE.PARTITION,
          peerId,
        );
        this.logger.debug(PARTITION_SERVICE_LOG_MSG.PEER_ADDRESS_FROM_CACHE, {
          peerId,
          nodeId: service.node_id,
          address,
          partitionId: this.partitionId,
        });
        return address;
      }
    }

    throw new Error(`Unable to resolve unified peer address for ${peerId}`);
  }

  /**
   * Resolve the leader's unified address for write forwarding.
   * @return {string|null} Unified leader address or null if unavailable.
   * @private
   */
  resolveLeaderAddress() {
    if (!this.leaderId) {
      return null;
    }

    return this.buildPeerAddress(this.leaderId);
  }

  /**
   * Initialize the partition service.
   * Uses liferaft library for Raft consensus with simplified transport.
   * Requirements: 8.1, 10.1, 10.2, 10.3, 10.4, 10.5
   * @return {Promise<void>}
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    this.logger.info(PARTITION_SERVICE_LOG_MSG.INITIALIZING, {
      partitionId: this.partitionId,
      tableId: this.tableId,
      replicaId: this.replicaId,
      nodeId: this.nodeId,
      replicaCount: this.replicaIds.length,
      dbPath: this.dbPath,
    });

    // Ensure directory exists for file-based databases
    if (this.dbPath !== PARTITION_SERVICE_DEFAULT.MEMORY_DB_PATH) {
      const dbDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, {recursive: true});
        this.logger.debug(PARTITION_SERVICE_LOG_MSG.CREATED_PARTITION_DIR, {path: dbDir});
      }
    }

    // Open SQLite database
    this.db = new Database(this.dbPath);
    this.db.pragma(PARTITION_SERVICE_DB.PRAGMA_JOURNAL_MODE);
    this.db.pragma(PARTITION_SERVICE_DB.PRAGMA_SYNCHRONOUS);

    // Initialize Raft storage
    this.storage = new SQLiteRaftStorage(this.db, this.partitionId);

    // Create table if schema provided
    if (this.schema) {
      this.createTable();
    }

    // Register with transport if available using unified address format
    // Requirements: 1.1, 5.1 - Unified address format ${nodeId}/${entityType}/${entityId}
    if (this.transport) {
      this.transport.register(this.unifiedAddress, this.handleTransportMessage.bind(this));
    }

    // Start as follower
    this.role = RaftRole.FOLLOWER;

    // Get Raft configuration from ConfigurationManager
    // Requirements: 10.1
    const config = ConfigurationManager.getInstance();
    const heartbeatMs = config.get(CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS) ||
      PARTITION_SERVICE_VALUE.LIFERAFT_HEARTBEAT_DEFAULT_MS;
    const baseElectionMinMs = config.get(CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS) ||
      PARTITION_SERVICE_VALUE.LIFERAFT_ELECTION_MIN_DEFAULT_MS;
    const baseElectionMaxMs = config.get(CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS) ||
      PARTITION_SERVICE_VALUE.LIFERAFT_ELECTION_MAX_DEFAULT_MS;

    // Add replica-index-based jitter to election timeouts to prevent oscillation
    // Lower-indexed replicas (r1) have shorter timeouts and win elections first
    // This provides deterministic leadership without modifying Raft protocol
    //
    // For dynamically created replicas (UUID-based IDs during rebalancing),
    // indexOf() returns -1. We use a hash-based fallback to ensure these
    // replicas get consistently higher jitter than existing replicas.
    let replicaIndex = this.replicaIds.indexOf(this.replicaId);
    if (replicaIndex < 0) {
      // Hash-based fallback for UUID replica IDs not in the original list
      // This ensures new replicas joining during rebalancing don't disrupt
      // existing leadership by having unpredictable election timeouts
      const hashCode = this.replicaId.split('').reduce(
        (acc, char) => acc + char.charCodeAt(0), 0,
      );
      // Add offset to ensure new replicas have higher jitter than existing ones
      replicaIndex = this.replicaIds.length + (hashCode % 10);
    }
    const jitterMs = replicaIndex * PARTITION_SERVICE_VALUE.ELECTION_JITTER_PER_REPLICA_MS;
    const electionMinMs = baseElectionMinMs + jitterMs;
    const electionMaxMs = baseElectionMaxMs + jitterMs;

    // Create extended LifeRaft class with our transport using ES6 class inheritance
    // Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
    const self = this;
    const deferElection = this.deferElection;

    /**
     * Custom Raft node class that extends LifeRaft with our transport.
     * Simplified to call transport.deliver() directly without type conversion.
     * Supports deferred election start to prevent election storms during bootstrap.
     * Requirements: 10.1, 10.2, 10.3, 10.4
     */
    class RaftNode extends LifeRaft {
      /**
       * Override initialize to support deferred election start.
       * When deferElection is true, we don't start the heartbeat timer.
       * Call startElection() later to begin the election process.
       * @param {Object} options - Initialization options.
       * @param {Function} callback - Completion callback.
       */
      initialize(options, callback) {
        if (deferElection) {
          // Don't start heartbeat timer - election will be started manually
          self.logger.debug(PARTITION_SERVICE_LOG_MSG.DEFERRING_ELECTION_START, {
            replicaId: self.replicaId,
            partitionId: self.partitionId,
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
       * Sends packets directly to transport without type conversion.
       * Note: When liferaft calls node.write(), 'this' is the cloned node
       * representing the peer, so 'this.address' is the destination address.
       * Requirements: 10.2, 10.3, 10.4
       * @param {Object} packet - Raft protocol packet (packet.address is sender)
       * @param {Function} callback - Completion callback
       */
      write(packet, callback) {
        // Build peer address for routing
        // this.address is the destination, packet.address is the sender
        const peerAddress = self.buildPeerAddress(this.address);

        // Send packet unchanged - no type conversion
        // Only add destination address for routing, preserve all packet fields
        // Requirements: 10.2, 10.3
        self.transport.deliver(peerAddress, packet)
          .then((result) => callback(null, result))
          .catch((err) => callback(err));
      }
    }

    // Create SQLiteLogAdapter for liferaft
    // Requirements: 12.1, 12.2, 12.3, 12.4
    this.logAdapter = new SQLiteLogAdapter(this.db);

    // Create liferaft instance
    // Use unified address so that packet.address contains the full address
    // This allows other nodes to respond to vote requests correctly
    // Requirements: 8.1, 10.1, 10.5
    const logAdapter = this.logAdapter;
    this.raft = new RaftNode(this.unifiedAddress, {
      [PARTITION_SERVICE_LIFERAFT_TIMER.HEARTBEAT]: heartbeatMs,
      [PARTITION_SERVICE_LIFERAFT_TIMER.ELECTION_MIN]: electionMinMs,
      [PARTITION_SERVICE_LIFERAFT_TIMER.ELECTION_MAX]: electionMaxMs,
      [PARTITION_SERVICE_LIFERAFT_TIMER.LOG]: function() {
        return logAdapter;
      },
    });

    // If deferElection is true, clear all timers that liferaft started automatically
    // This prevents elections from starting until startElection() is called
    // Liferaft's _initialize() sets up a 'state change' handler that starts timers
    if (this.deferElection && this.raft.timers) {
      this.raft.timers.clear(PARTITION_SERVICE_LIFERAFT_TIMER.HEARTBEAT_ELECTION);
      this.logger.debug(PARTITION_SERVICE_LOG_MSG.CLEARED_LIFERAFT_TIMERS, {
        replicaId: this.replicaId,
        partitionId: this.partitionId,
      });
    }

    // Track if this is a truly single-replica group for special handling
    // Only consider it single-replica if replicaIds.length === 1
    // Do NOT use replicaIds.every() check as that could cause premature leadership
    // when peer list is incomplete (violates Requirements 4.3, 5.1, 5.2, 5.3)
    const isSingleReplica = this.replicaIds.length === NUM.ONE;

    // Learner phase: new replicas joining existing groups start as non-voting learners
    // They receive log entries but don't vote until caught up
    // This prevents new replicas from disrupting existing leadership
    if (this.isJoiningExistingGroup) {
      this.role = RaftRole.LEARNER;
      this.logger.info(PARTITION_SERVICE_LOG_MSG.STARTING_AS_LEARNER, {
        replicaId: this.replicaId,
        partitionId: this.partitionId,
        promotionDelayMs: this.learnerPromotionDelayMs,
      });
      // Schedule promotion check after minimum delay
      this.scheduleLearnerPromotion();
    }

    // Wire up liferaft events
    // Requirements: 10.5
    this.raft.on(PARTITION_SERVICE_ROLE.LEADER, () => {
      this.role = RaftRole.LEADER;
      this.isLeader = true;
      this.leaderId = this.replicaId;
      this.storage.currentTerm = this.raft.term;
      const nodeService = getNodeService();
      nodeService.setPartitionLeader({
        partitionId: this.partitionId,
        replicaId: this.replicaId,
        nodeId: this.nodeId,
        address: this.unifiedAddress,
      });
      this.queueRoleUpdate(this.role);
      this.queueLeaderNodeUpdate(this.nodeId);

      // Activate rebalancer when becoming leader
      // CRITICAL: Don't activate rebalancer if still in learner phase
      // Learners should not trigger rebalancing until fully integrated
      if (this.rebalancer && !this.isJoiningExistingGroup) {
        this.rebalancer.setLeader(true);
      }

      this.logger.info(PARTITION_SERVICE_LOG_MSG.BECAME_LEADER, {
        term: this.raft.term,
        replicaId: this.replicaId,
        partitionId: this.partitionId,
        rebalancerActive: !this.isJoiningExistingGroup,
      });

      this.emit(PARTITION_SERVICE_EVENT.LEADER_ELECTED, {
        leaderId: this.replicaId,
        term: this.raft.term,
        partitionId: this.partitionId,
      });
    });

    this.raft.on(PARTITION_SERVICE_ROLE.FOLLOWER, () => {
      // For single-replica groups, ignore follower events since we're always leader
      // liferaft may emit follower events during initialization
      if (isSingleReplica && this.isLeader) {
        return;
      }
      this.role = RaftRole.FOLLOWER;
      this.isLeader = false;
      this.storage.currentTerm = this.raft.term;
      const nodeService = getNodeService();
      nodeService.clearPartitionLeader(this.partitionId);
      this.queueRoleUpdate(this.role);
      this.pendingLeaderNodeUpdate = null;
      this.persistedLeaderNodeId = null;
      if (this.leaderNodeUpdateRetryTimer) {
        clearTimeout(this.leaderNodeUpdateRetryTimer);
        this.leaderNodeUpdateRetryTimer = null;
      }

      // Deactivate rebalancer when losing leadership
      if (this.rebalancer) {
        this.rebalancer.setLeader(false);
      }
    });

    this.raft.on(PARTITION_SERVICE_ROLE.CANDIDATE, () => {
      // For single-replica groups, ignore candidate events since we're always leader
      // liferaft may emit candidate events during election cycles
      if (isSingleReplica && this.isLeader) {
        return;
      }
      this.role = RaftRole.CANDIDATE;
      this.isLeader = false;
      this.storage.currentTerm = this.raft.term;
      const nodeService = getNodeService();
      nodeService.clearPartitionLeader(this.partitionId);
      this.queueRoleUpdate(this.role);
      this.pendingLeaderNodeUpdate = null;
      this.persistedLeaderNodeId = null;
      if (this.leaderNodeUpdateRetryTimer) {
        clearTimeout(this.leaderNodeUpdateRetryTimer);
        this.leaderNodeUpdateRetryTimer = null;
      }
    });

    // Handle committed entries
    // Requirements: 10.5
    this.raft.on(PARTITION_SERVICE_REASON.COMMIT, (command) => {
      this.applyCommittedEntry(command);
    });

    this.raft.on(PARTITION_SERVICE_REASON.LEADER_CHANGE, (to) => {
      this.leaderId = to;
      this.logger.debug(PARTITION_SERVICE_LOG_MSG.LEADER_CHANGED, {
        newLeader: to,
        partitionId: this.partitionId,
      });
    });

    this.raft.on(PARTITION_SERVICE_REASON.TERM_CHANGE, (term) => {
      this.storage.currentTerm = term;
    });

    // Join peer nodes
    // Requirements: 3.1, 3.2, 3.3 - All peer addresses use fully qualified format
    for (const peerId of this.replicaIds) {
      if (peerId !== this.replicaId) {
        const peerAddress = this.buildPeerAddress(peerId);
        this.logger.info(PARTITION_SERVICE_LOG_MSG.JOINING_PEER_ADDRESS, {
          peerId,
          peerAddress,
          replicaId: this.replicaId,
          partitionId: this.partitionId,
          addressFormat: peerAddress.includes(PARTITION_SERVICE_ADDRESS.SEPARATOR) ?
            PARTITION_SERVICE_ADDRESS.FORMAT_UNIFIED :
            PARTITION_SERVICE_ADDRESS.FORMAT_SIMPLE,
        });
        this.raft.join(peerAddress);
      }
    }

    this.maybeInitializeRebalancer();

    // For truly single-replica groups, become leader immediately
    // This avoids the election timer delay during bootstrap
    // Only do this when replicaIds.length === 1 (truly single replica)
    // Do NOT use replicaIds.every() check - that could cause premature leadership
    // when peer list is incomplete (violates Requirements 4.3, 5.1, 5.2, 5.3)
    // Let liferaft handle all multi-replica elections
    // Requirements: 10.5
    if (this.replicaIds.length === NUM.ONE) {
      // Manually promote to leader for single-replica case
      this.role = RaftRole.LEADER;
      this.isLeader = true;
      this.leaderId = this.replicaId;
      const nodeService = getNodeService();
      nodeService.setPartitionLeader({
        partitionId: this.partitionId,
        replicaId: this.replicaId,
        nodeId: this.nodeId,
        address: this.unifiedAddress,
      });
      this.queueRoleUpdate(this.role);
      this.queueLeaderNodeUpdate(this.nodeId);

      // Activate rebalancer when becoming leader
      if (this.rebalancer) {
        this.rebalancer.setLeader(true);
      }

      this.logger.info(PARTITION_SERVICE_LOG_MSG.SINGLE_REPLICA_LEADER, {
        replicaId: this.replicaId,
        partitionId: this.partitionId,
      });

      this.emit(PARTITION_SERVICE_EVENT.LEADER_ELECTED, {
        leaderId: this.replicaId,
        term: this.raft ? this.raft.term : NUM.ZERO,
        partitionId: this.partitionId,
      });
    }

    // Start periodic size updates
    this.startPeriodicSizeUpdates();

    // Calculate initial size
    await this.updatePartitionSize();

    this.initialized = true;

    this.logger.info(PARTITION_SERVICE_LOG_MSG.INITIALIZED, {
      partitionId: this.partitionId,
      replicaId: this.replicaId,
      sizeBytes: this.sizeBytes,
    });

    this.emit(PARTITION_SERVICE_EVENT.INITIALIZED, {
      partitionId: this.partitionId,
      replicaId: this.replicaId,
    });
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
    if (this.replicaIds.length === NUM.ONE) {
      this.electionStarted = true;
      return;
    }

    this.electionStarted = true;

    if (this.raft) {
      this.logger.info(PARTITION_SERVICE_LOG_MSG.STARTING_ELECTION_TIMER, {
        replicaId: this.replicaId,
        partitionId: this.partitionId,
        peerCount: this.replicaIds.length - NUM.ONE,
      });

      // Start the heartbeat timer which will trigger election on timeout
      // Use a random timeout to stagger elections across replicas
      this.raft.heartbeat(this.raft.timeout());
    }
  }

  /**
   * Create the table based on schema.
   * @private
   */
  createTable() {
    if (!this.schema || !this.schema.columns) {
      return;
    }

    const columns = this.schema.columns.map((col) => {
      let def = `${col.name} ${col.type}`;
      if (col.primaryKey) {
        def += PARTITION_SERVICE_SQL_FRAGMENT.PRIMARY_KEY;
      }
      if (col.notNull) {
        def += PARTITION_SERVICE_SQL_FRAGMENT.NOT_NULL;
      }
      if (col.defaultValue !== undefined) {
        def += ` DEFAULT ${col.defaultValue}`;
      }
      return def;
    }).join(PARTITION_SERVICE_SQL_FRAGMENT.COMMA_SPACE);

    const sql = `CREATE TABLE IF NOT EXISTS ${this.tableName} (${columns})`;
    this.db.exec(sql);

    this.ensureNodesTableColumns();
    this.ensureMessageGroupsTableColumns();
    this.ensurePartitionsTableColumns();

    this.logger.debug(PARTITION_SERVICE_LOG_MSG.CREATED_TABLE, {
      tableName: this.tableName,
      partitionId: this.partitionId,
    });
  }

  /**
   * Ensure nodes table includes ws_connection_state column for readiness tracking.
   * @private
   */
  ensureNodesTableColumns() {
    if (this.tableName !== SystemTableName.NODES) {
      return;
    }

    const columns = this.db.prepare(`PRAGMA table_info(${this.tableName})`).all();
    const hasConnectionState = columns.some(
      (col) => col.name === PARTITION_SERVICE_COLUMN.WS_CONNECTION_STATE,
    );
    const hasCapabilities = columns.some(
      (col) => col.name === PARTITION_SERVICE_COLUMN.CAPABILITIES,
    );
    const hasReadyLease = columns.some(
      (col) => col.name === PARTITION_SERVICE_COLUMN.READY_LEASE_EXPIRES_AT,
    );

    if (!hasConnectionState) {
      this.db.exec(
        `ALTER TABLE ${this.tableName} ` +
        PARTITION_SERVICE_COLUMN_SQL.ADD_WS_CONNECTION_STATE,
      );

      this.logger.info(PARTITION_SERVICE_LOG_MSG.ADDED_WS_CONNECTION_STATE, {
        tableName: this.tableName,
        partitionId: this.partitionId,
      });
    }

    if (!hasCapabilities) {
      this.db.exec(
        `ALTER TABLE ${this.tableName} ` +
        PARTITION_SERVICE_COLUMN_SQL.ADD_CAPABILITIES,
      );

      this.logger.info(PARTITION_SERVICE_LOG_MSG.ADDED_CAPABILITIES, {
        tableName: this.tableName,
        partitionId: this.partitionId,
      });
    }

    if (!hasReadyLease) {
      this.db.exec(
        `ALTER TABLE ${this.tableName} ` +
        PARTITION_SERVICE_COLUMN_SQL.ADD_READY_LEASE_EXPIRES_AT,
      );

      this.logger.info(PARTITION_SERVICE_LOG_MSG.ADDED_READY_LEASE, {
        tableName: this.tableName,
        partitionId: this.partitionId,
      });
    }
  }

  /**
   * Ensure message_groups table includes leader_node_id column.
   * @private
   */
  ensureMessageGroupsTableColumns() {
    if (this.tableName !== SystemTableName.MESSAGE_GROUPS) {
      return;
    }

    const columns = this.db.prepare(`PRAGMA table_info(${this.tableName})`).all();
    const hasLeaderNode = columns.some(
      (col) => col.name === COLUMN.LEADER_NODE_ID,
    );

    if (!hasLeaderNode) {
      this.db.exec(
        `ALTER TABLE ${this.tableName} ` +
        PARTITION_SERVICE_COLUMN_SQL.ADD_LEADER_NODE_ID,
      );

      this.logger.info(PARTITION_SERVICE_LOG_MSG.ADDED_MESSAGE_GROUP_LEADER, {
        tableName: this.tableName,
        partitionId: this.partitionId,
      });
    }
  }

  /**
   * Ensure partitions table includes table_name column for compatibility.
   * @private
   */
  ensurePartitionsTableColumns() {
    if (this.tableName !== SystemTableName.PARTITIONS) {
      return;
    }

    const columns = this.db.prepare(`PRAGMA table_info(${this.tableName})`).all();
    const hasTableName = columns.some(
      (col) => col.name === PARTITION_SERVICE_COLUMN.TABLE_NAME,
    );

    if (!hasTableName) {
      this.db.exec(
        `ALTER TABLE ${this.tableName} ` +
        PARTITION_SERVICE_COLUMN_SQL.ADD_TABLE_NAME,
      );

      this.logger.info(PARTITION_SERVICE_LOG_MSG.ADDED_PARTITIONS_TABLE_NAME, {
        tableName: this.tableName,
        partitionId: this.partitionId,
      });
    }
  }

  /**
   * Handle incoming transport message.
   * Detects Raft packets using isRaftPacket() and routes them directly to liferaft.
   * Handles non-Raft messages as application messages.
   * Requirements: 8.3, 8.4, 13.1, 13.2, 13.3, 13.4
   * @param {Object} envelope - Message envelope.
   * @return {Promise<Object>} Response.
   * @private
   */
  async handleTransportMessage(envelope) {
    // Extract payload - handle both envelope and direct packet formats
    const payload = envelope.payload || envelope;

    // Detect and handle Raft packets directly using isRaftPacket()
    // No type conversion needed - packets flow through unchanged
    // Requirements: 8.3, 8.4, 13.1, 13.2
    if (isRaftPacket(payload)) {
      if (this.raft) {
        this.logger.trace(PARTITION_SERVICE_LOG_MSG.RECEIVED_RAFT_PACKET, {
          type: payload.type,
          term: payload.term,
          address: payload.address,
          replicaId: this.replicaId,
          partitionId: this.partitionId,
        });

        // Create write function for sending responses back to the sender
        // The sender's address is in payload.address
        // Requirements: 8.4
        const senderAddress = payload.address;
        const write = (responsePacket) => {
          if (responsePacket) {
            this.logger.trace(PARTITION_SERVICE_LOG_MSG.SENDING_RAFT_RESPONSE, {
              type: responsePacket.type,
              destination: senderAddress,
              term: responsePacket.term,
            });
            // Send response to the sender
            this.transport.deliver(senderAddress, responsePacket)
              .catch((err) => {
                this.logger.error(PARTITION_SERVICE_LOG_MSG.FAILED_RAFT_RESPONSE, {
                  error: err.message,
                  destination: senderAddress,
                });
              });
          }
        };

        // Emit to liferaft with write function for responses
        // Requirements: 8.4
        this.raft.emit(PARTITION_SERVICE_EVENT.DATA, payload, write);
      }
      return {acknowledged: true};
    }

    // Handle application messages (non-Raft)
    // Requirements: 13.3
    return this.handleApplicationMessage(envelope);
  }

  /**
   * Handle application messages (non-Raft messages).
   * Raft packets are handled by handleTransportMessage() using isRaftPacket().
   * This method only handles application-level messages like FORWARD_WRITE.
   * Requirements: 13.3, 13.4
   * @param {Object} message - Application message
   * @return {Promise<Object>} Processing result
   */
  async handleApplicationMessage(message) {
    const payload = message.payload || message;

    if (!payload || !payload.type) {
      return {acknowledged: false, error: PARTITION_SERVICE_ERROR_MSG.INVALID_MESSAGE};
    }

    // Handle application messages only - Raft packets are handled by
    // handleTransportMessage() using isRaftPacket() and emitted to liferaft
    // Requirements: 13.3, 13.4
    switch (payload.type) {
    case PARTITION_SERVICE_MESSAGE_TYPE.FORWARD_WRITE:
      // Handle forwarded write operations from followers
      if (payload.operation) {
        return this.applyWrite(payload.operation);
      }
      return {acknowledged: false, error: PARTITION_SERVICE_ERROR_MSG.INVALID_FORWARD_WRITE};
    case PARTITION_SERVICE_MESSAGE_TYPE.SYSTEM_TABLE_WRITE:
      // Handle system table writes from joining nodes
      // Routes CDC updates from nodes that don't have local system partitions
      return this.handleSystemTableWrite(payload);
    case PARTITION_SERVICE_MESSAGE_TYPE.QUERY:
      // Handle remote SQL query execution
      // Enables transparent query routing across the cluster
      return this.handleRemoteQuery(payload);
    default:
      // Unknown message type - log and acknowledge to avoid blocking
      this.logger.debug(PARTITION_SERVICE_LOG_MSG.UNKNOWN_MESSAGE_TYPE, {
        type: payload.type,
        partitionId: this.partitionId,
      });
      return {
        acknowledged: false,
        error: PARTITION_SERVICE_ERROR_MSG.unknownMessage(payload.type),
      };
    }
  }

  /**
   * Handle system table write operations from remote nodes.
   * This allows joining nodes to update system tables via CDC routing.
   * @param {Object} payload - Write operation payload.
   * @param {string} payload.operation - Operation type (INSERT, UPDATE, DELETE).
   * @param {string} payload.tableName - Target table name.
   * @param {Object} payload.data - Data for INSERT/UPDATE.
   * @param {Object} payload.whereClause - WHERE clause for UPDATE/DELETE.
   * @return {Promise<Object>} Operation result.
   * @private
   */
  async handleSystemTableWrite(payload) {
    const {operation, tableName, data, whereClause} = payload;

    this.logger.debug(PARTITION_SERVICE_LOG_MSG.HANDLING_SYSTEM_TABLE_WRITE, {
      operation,
      tableName,
      partitionId: this.partitionId,
      replicaId: this.replicaId,
    });

    try {
      let result;
      switch (operation) {
      case PARTITION_SERVICE_OPERATION.INSERT:
        result = await this.insertData(tableName, data);
        break;
      case PARTITION_SERVICE_OPERATION.UPDATE:
        result = await this.updateData(tableName, whereClause, data);
        break;
      case PARTITION_SERVICE_OPERATION.DELETE:
        result = await this.deleteData(tableName, whereClause);
        break;
      case PARTITION_SERVICE_OPERATION.UPSERT:
        result = await this.upsertData(tableName, data);
        break;
      default:
        return {
          acknowledged: false,
          error: PARTITION_SERVICE_ERROR_MSG.unknownOperation(operation),
        };
      }

      return {
        acknowledged: true,
        success: result.success,
        changes: result.changes || NUM.ZERO,
      };
    } catch (error) {
      this.logger.error(PARTITION_SERVICE_ERROR_MSG.SYSTEM_TABLE_WRITE_FAILED, {
        operation,
        tableName,
        error: error.message,
        partitionId: this.partitionId,
      });
      throw error;
    }
  }

  /**
   * Handle remote SQL query execution.
   * Enables transparent query routing - any node can execute queries on any partition.
   * For write operations on non-leaders, returns a redirect response with leader address.
   * @param {Object} payload - Query payload.
   * @param {string} payload.sql - SQL query string.
   * @param {Array} payload.params - Query parameters.
   * @return {Promise<Object>} Query result or redirect response.
   * @private
   */
  async handleRemoteQuery(payload) {
    const {sql, params} = payload;

    if (!sql) {
      return {acknowledged: false, error: PARTITION_SERVICE_ERROR_MSG.MISSING_SQL_QUERY};
    }

    const isWriteOperation = this.isWriteQuery(sql);

    // For write operations, redirect to leader if we're not the leader
    if (isWriteOperation && this.role !== RaftRole.LEADER) {
      const leaderAddress = this.resolveLeaderAddress();
      if (leaderAddress) {
        this.logger.debug(PARTITION_SERVICE_LOG_MSG.REDIRECTING_WRITE_TO_LEADER, {
          partitionId: this.partitionId,
          replicaId: this.replicaId,
          leaderAddress,
        });
        return {
          acknowledged: true,
          success: false,
          redirect: PARTITION_SERVICE_RESPONSE.LEADER_REDIRECT,
          leaderAddress,
          partitionId: this.partitionId,
        };
      }
      // No leader known - return error so client can retry
      return {
        acknowledged: true,
        success: false,
        error: ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE,
        partitionId: this.partitionId,
      };
    }

    this.logger.debug(PARTITION_SERVICE_LOG_MSG.HANDLING_REMOTE_QUERY, {
      sql: sql.substring(NUM.ZERO, PARTITION_SERVICE_VALUE.DEFAULT_QUERY_TIMEOUT_MS),
      partitionId: this.partitionId,
      replicaId: this.replicaId,
    });

    try {
      const result = await this.executeQuery(sql, params || []);
      return {
        acknowledged: true,
        success: true,
        rows: result.rows,
        changes: result.changes,
        count: result.count,
        partitionId: this.partitionId,
      };
    } catch (error) {
      this.logger.error(PARTITION_SERVICE_ERROR_MSG.REMOTE_QUERY_FAILED, {
        sql: sql.substring(NUM.ZERO, PARTITION_SERVICE_VALUE.DEFAULT_QUERY_TIMEOUT_MS),
        error: error.message,
        partitionId: this.partitionId,
      });
      throw error;
    }
  }

  /**
   * Check if a SQL query is a write operation.
   * @param {string} sql - SQL query string.
   * @return {boolean} True if write operation.
   * @private
   */
  isWriteQuery(sql) {
    if (!sql) return false;
    const trimmed = sql.trim().toUpperCase();
    return trimmed.startsWith('INSERT') ||
           trimmed.startsWith('UPDATE') ||
           trimmed.startsWith('DELETE') ||
           trimmed.startsWith('CREATE') ||
           trimmed.startsWith('DROP') ||
           trimmed.startsWith('ALTER');
  }

  /**
   * Apply a committed entry to the state machine.
   * This is called by liferaft when an entry is committed.
   * Requirements: 10.5
   * @param {Object} command - The committed command
   */
  applyCommittedEntry(command) {
    if (!command) {
      return;
    }

    this.logger.debug(PARTITION_SERVICE_LOG_MSG.APPLYING_COMMITTED_ENTRY, {
      partitionId: this.partitionId,
      commandType: command.type,
    });

    // Handle different command types
    if (command.type === PARTITION_SERVICE_OPERATION.WRITE ||
        command.type === PARTITION_SERVICE_OPERATION.INSERT ||
        command.type === PARTITION_SERVICE_OPERATION.UPDATE ||
        command.type === PARTITION_SERVICE_OPERATION.DELETE ||
        command.type === PARTITION_SERVICE_OPERATION.UPSERT ||
        command.type === PARTITION_SERVICE_OPERATION.QUERY) {
      // Apply SQL write operation
      if (command.sql) {
        try {
          const stmt = this.db.prepare(command.sql);
          stmt.run(...(command.params || []));

          // Generate CDC event
          this.generateCDCEvent(command).catch((err) => {
            this.logger.error(PARTITION_SERVICE_ERROR_MSG.CDC_EVENT_FAILED, {
              partitionId: this.partitionId,
              error: err.message,
            });
            throw err;
          });
        } catch (error) {
          this.logger.error(PARTITION_SERVICE_ERROR_MSG.APPLY_COMMITTED_FAILED, {
            partitionId: this.partitionId,
            error: error.message,
          });
          throw error;
        }
      }
    } else if (command.type === PARTITION_SERVICE_OPERATION.TRANSACTION_COMMIT) {
      // Handle transaction commit - operations already applied
      this.logger.debug(PARTITION_SERVICE_LOG_MSG.TRANSACTION_COMMIT_APPLIED, {
        partitionId: this.partitionId,
        operationCount: command.operations?.length || NUM.ZERO,
      });
    }

    this.emit(PARTITION_SERVICE_EVENT.ENTRY_COMMITTED, {
      partitionId: this.partitionId,
      command,
    });
  }


  /**
   * Begin a transaction on this partition.
   * Uses SQLite's transaction support for READ COMMITTED isolation.
   * @return {Promise<Object>} Transaction result.
   */
  async beginTransaction() {
    if (!this.initialized) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.NOT_INITIALIZED);
    }

    if (this.activeTransaction) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE);
    }

    this.logger.debug(PARTITION_SERVICE_LOG_MSG.BEGINNING_TRANSACTION, {
      partitionId: this.partitionId,
    });

    try {
      // Use SQLite's BEGIN for transaction support
      this.db.exec(PARTITION_SERVICE_SQL.BEGIN_IMMEDIATE);
      this.activeTransaction = {
        startTime: Date.now(),
        operations: [],
      };
      this.transactionOperations = [];

      return {
        success: true,
        operation: PARTITION_SERVICE_OPERATION.BEGIN_TRANSACTION,
        partitionId: this.partitionId,
        inTransaction: true,
      };
    } catch (error) {
      this.logger.error(PARTITION_SERVICE_ERROR_MSG.BEGIN_TRANSACTION_FAILED, {
        partitionId: this.partitionId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Commit the active transaction.
   * Ensures durability through Raft replication before acknowledging.
   * @return {Promise<Object>} Commit result.
   */
  async commitTransaction() {
    if (!this.initialized) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.NOT_INITIALIZED);
    }

    if (!this.activeTransaction) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.NO_ACTIVE_TRANSACTION_COMMIT);
    }

    this.logger.debug(PARTITION_SERVICE_LOG_MSG.COMMITTING_TRANSACTION, {
      partitionId: this.partitionId,
      operationCount: this.transactionOperations.length,
    });

    try {
      // Replicate transaction operations through Raft for durability
      const raftEntry = await this.replicateTransactionCommit();

      // Commit in SQLite
      this.db.exec(PARTITION_SERVICE_SQL.COMMIT);

      const duration = Date.now() - this.activeTransaction.startTime;
      const operationCount = this.transactionOperations.length;

      // Generate CDC events for all operations
      for (const op of this.transactionOperations) {
        await this.generateCDCEvent(op);
      }

      // Clear transaction state
      this.activeTransaction = null;
      this.transactionOperations = [];

      // Schedule size update
      this.scheduleSizeUpdate();

      return {
        success: true,
        operation: PARTITION_SERVICE_OPERATION.COMMIT,
        partitionId: this.partitionId,
        committed: true,
        durationMs: duration,
        operationCount,
        raftLogIndex: raftEntry?.index || null,
      };
    } catch (error) {
      this.logger.error(PARTITION_SERVICE_ERROR_MSG.COMMIT_TRANSACTION_FAILED, {
        partitionId: this.partitionId,
        error: error.message,
      });

      // Rollback on failure
      try {
        this.db.exec(PARTITION_SERVICE_SQL.ROLLBACK);
      } catch {
        // Ignore rollback errors
      }

      this.activeTransaction = null;
      this.transactionOperations = [];

      throw error;
    }
  }

  /**
   * Rollback the active transaction.
   * @return {Promise<Object>} Rollback result.
   */
  async rollbackTransaction() {
    if (!this.initialized) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.NOT_INITIALIZED);
    }

    if (!this.activeTransaction) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.NO_ACTIVE_TRANSACTION_ROLLBACK);
    }

    this.logger.debug(PARTITION_SERVICE_LOG_MSG.ROLLING_BACK_TRANSACTION, {
      partitionId: this.partitionId,
      operationCount: this.transactionOperations.length,
    });

    try {
      // Rollback in SQLite - this reverts all changes
      this.db.exec(PARTITION_SERVICE_SQL.ROLLBACK);

      const duration = Date.now() - this.activeTransaction.startTime;
      const operationCount = this.transactionOperations.length;

      // Clear transaction state
      this.activeTransaction = null;
      this.transactionOperations = [];

      return {
        success: true,
        operation: PARTITION_SERVICE_OPERATION.ROLLBACK,
        partitionId: this.partitionId,
        rolledBack: true,
        durationMs: duration,
        operationCount,
      };
    } catch (error) {
      this.logger.error(PARTITION_SERVICE_ERROR_MSG.ROLLBACK_TRANSACTION_FAILED, {
        partitionId: this.partitionId,
        error: error.message,
      });

      // Clear transaction state anyway
      this.activeTransaction = null;
      this.transactionOperations = [];

      throw error;
    }
  }

  /**
   * Check if a transaction is active.
   * @return {boolean} True if transaction is active.
   */
  isInTransaction() {
    return this.activeTransaction !== null;
  }

  /**
   * Replicate transaction commit through Raft for durability.
   * @return {Promise<Object>} Raft log entry.
   * @private
   */
  async replicateTransactionCommit() {
    if (this.transactionOperations.length === NUM.ZERO) {
      return null;
    }

    const timestamp = this.hlcClock.now();

    const entry = {
      type: PARTITION_SERVICE_OPERATION.TRANSACTION_COMMIT,
      operations: this.transactionOperations,
      timestamp: timestamp.toString(),
      proposedBy: this.replicaId,
      proposedAt: Date.now(),
    };

    // Append to Raft log
    const logEntry = this.storage.appendEntry(entry);

    // Replicate to followers via liferaft if we're the leader
    // liferaft handles replication through its heartbeat mechanism
    // Only use liferaft's command if it considers itself the leader
    // For single-replica groups, liferaft may not be in LEADER state
    // Requirements: 11.9
    const isLiferaftLeader = this.raft && this.raft.state === LifeRaft.LEADER;
    if (isLiferaftLeader) {
      this.raft.command(entry, (err) => {
        if (err) {
          this.logger.debug(PARTITION_SERVICE_ERROR_MSG.TRANSACTION_COMMIT_RAFT_FAILED, {
            partitionId: this.partitionId,
            error: err.message,
          });
        }
      });
    }

    return logEntry;
  }

  /**
   * Execute a SQL query on this partition.
   * @param {string} sql - SQL query string.
   * @param {Array} params - Query parameters.
   * @return {Promise<Object>} Query result.
   */
  async executeQuery(sql, params = []) {
    if (!this.initialized) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.NOT_INITIALIZED);
    }

    this.logger.debug(PARTITION_SERVICE_LOG_MSG.EXECUTING_QUERY, {
      partitionId: this.partitionId,
      sql: sql.substring(NUM.ZERO, PARTITION_SERVICE_VALUE.DEFAULT_QUERY_TIMEOUT_MS),
    });

    try {
      const stmt = this.db.prepare(sql);
      const isSelect = sql.trim().toUpperCase().startsWith(SQL.SELECT);

      if (isSelect) {
        const rows = stmt.all(...params);
        return {
          success: true,
          rows,
          count: rows.length,
          partitionId: this.partitionId,
        };
      } else {
        // For write operations within a transaction, execute directly
        if (this.activeTransaction) {
          return this.executeTransactionWrite({
            type: PARTITION_SERVICE_OPERATION.QUERY,
            sql,
            params,
          });
        }
        // For write operations outside transaction, go through Raft
        return this.proposeWrite({
          type: PARTITION_SERVICE_OPERATION.QUERY,
          sql,
          params,
        });
      }
    } catch (error) {
      this.logger.error(PARTITION_SERVICE_ERROR_MSG.QUERY_FAILED, {
        partitionId: this.partitionId,
        sql: sql.substring(NUM.ZERO, PARTITION_SERVICE_VALUE.DEFAULT_QUERY_TIMEOUT_MS),
        error: error.message,
      });

      throw error;
    }
  }

  /**
   * Execute a SQL query directly on the local SQLite database.
   * Bootstrap-only helper: bypasses Raft and does not replicate.
   * @param {string} sql - SQL query string.
   * @param {Array} params - Query parameters.
   * @return {Promise<Object>} Query result.
   */
  async executeLocalQuery(sql, params = []) {
    if (!this.initialized) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.NOT_INITIALIZED);
    }

    this.logger.debug(PARTITION_SERVICE_LOG_MSG.EXECUTING_QUERY, {
      partitionId: this.partitionId,
      sql: sql.substring(NUM.ZERO, PARTITION_SERVICE_VALUE.DEFAULT_QUERY_TIMEOUT_MS),
      bootstrap: true,
    });

    try {
      const stmt = this.db.prepare(sql);
      const isSelect = sql.trim().toUpperCase().startsWith(SQL.SELECT);

      if (isSelect) {
        const rows = stmt.all(...params);
        return {
          success: true,
          rows,
          count: rows.length,
          partitionId: this.partitionId,
        };
      }

      const info = stmt.run(...params);
      this.scheduleSizeUpdate();
      return {
        success: true,
        changes: info.changes,
        lastInsertRowid: info.lastInsertRowid,
        partitionId: this.partitionId,
      };
    } catch (error) {
      this.logger.error(PARTITION_SERVICE_ERROR_MSG.QUERY_FAILED, {
        partitionId: this.partitionId,
        sql: sql.substring(NUM.ZERO, PARTITION_SERVICE_VALUE.DEFAULT_QUERY_TIMEOUT_MS),
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Execute a write operation within an active transaction.
   * @param {Object} operation - Write operation.
   * @return {Promise<Object>} Operation result.
   * @private
   */
  async executeTransactionWrite(operation) {
    if (!this.activeTransaction) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.NO_ACTIVE_TRANSACTION);
    }

    const timestamp = this.hlcClock.now();

    const entry = {
      ...operation,
      timestamp: timestamp.toString(),
      proposedBy: this.replicaId,
      proposedAt: Date.now(),
    };

    try {
      const stmt = this.db.prepare(entry.sql);
      const info = stmt.run(...(entry.params || []));

      // Track operation for later CDC generation and Raft replication
      this.transactionOperations.push(entry);

      return {
        success: true,
        changes: info.changes,
        lastInsertRowid: info.lastInsertRowid,
        partitionId: this.partitionId,
        inTransaction: true,
      };
    } catch (error) {
      this.logger.error(PARTITION_SERVICE_ERROR_MSG.TRANSACTION_WRITE_FAILED, {
        partitionId: this.partitionId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Insert data into the partition.
   * @param {string} tableName - Table name.
   * @param {Object} data - Data to insert.
   * @return {Promise<Object>} Insert result.
   */
  async insertData(tableName, data) {
    if (!this.initialized) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.NOT_INITIALIZED);
    }

    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = columns
      .map(() => PARTITION_SERVICE_SQL_FRAGMENT.QUESTION_MARK)
      .join(PARTITION_SERVICE_SQL_FRAGMENT.COMMA_SPACE);
    const sql = `${SQL.INSERT_INTO} ${tableName} ` +
      `(${columns.join(PARTITION_SERVICE_SQL_FRAGMENT.COMMA_SPACE)}) ` +
      `${SQL.VALUES} (${placeholders})`;

    return this.proposeWrite({
      type: PARTITION_SERVICE_OPERATION.INSERT,
      tableName,
      data,
      sql,
      params: values,
    });
  }

  /**
   * Update data in the partition.
   * @param {string} tableName - Table name.
   * @param {Object} whereClause - WHERE clause conditions.
   * @param {Object} data - Data to update.
   * @return {Promise<Object>} Update result.
   */
  async updateData(tableName, whereClause, data) {
    if (!this.initialized) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.NOT_INITIALIZED);
    }

    const setClauses = Object.keys(data)
      .map((k) => `${k} = ${PARTITION_SERVICE_SQL_FRAGMENT.QUESTION_MARK}`)
      .join(PARTITION_SERVICE_SQL_FRAGMENT.COMMA_SPACE);
    const whereClauses = Object.keys(whereClause)
      .map((k) => `${k} = ${PARTITION_SERVICE_SQL_FRAGMENT.QUESTION_MARK}`)
      .join(PARTITION_SERVICE_SQL_FRAGMENT.AND);
    const sql = `${SQL.UPDATE} ${tableName} ${SQL.SET} ${setClauses} ` +
      `${SQL.WHERE} ${whereClauses}`;
    const params = [...Object.values(data), ...Object.values(whereClause)];

    return this.proposeWrite({
      type: PARTITION_SERVICE_OPERATION.UPDATE,
      tableName,
      data,
      whereClause,
      sql,
      params,
    });
  }

  /**
   * Delete data from the partition.
   * @param {string} tableName - Table name.
   * @param {Object} whereClause - WHERE clause conditions.
   * @return {Promise<Object>} Delete result.
   */
  async deleteData(tableName, whereClause) {
    if (!this.initialized) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.NOT_INITIALIZED);
    }

    const whereClauses = Object.keys(whereClause)
      .map((k) => `${k} = ${PARTITION_SERVICE_SQL_FRAGMENT.QUESTION_MARK}`)
      .join(PARTITION_SERVICE_SQL_FRAGMENT.AND);
    const sql = `${SQL.DELETE_FROM} ${tableName} ${SQL.WHERE} ${whereClauses}`;
    const params = Object.values(whereClause);

    return this.proposeWrite({
      type: PARTITION_SERVICE_OPERATION.DELETE,
      tableName,
      whereClause,
      sql,
      params,
    });
  }

  /**
   * Upsert data in the partition (insert or replace on conflict).
   * @param {string} tableName - Table name.
   * @param {Object} data - Data to upsert.
   * @return {Promise<Object>} Upsert result.
   */
  async upsertData(tableName, data) {
    if (!this.initialized) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.NOT_INITIALIZED);
    }

    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = columns
      .map(() => PARTITION_SERVICE_SQL_FRAGMENT.QUESTION_MARK)
      .join(PARTITION_SERVICE_SQL_FRAGMENT.COMMA_SPACE);
    const sql = `${SQL.INSERT_OR_REPLACE_INTO} ${tableName} ` +
      `(${columns.join(PARTITION_SERVICE_SQL_FRAGMENT.COMMA_SPACE)}) ` +
      `${SQL.VALUES} (${placeholders})`;

    return this.proposeWrite({
      type: PARTITION_SERVICE_OPERATION.UPSERT,
      tableName,
      data,
      sql,
      params: values,
    });
  }

  /**
   * Propose a write operation through Raft.
   * @param {Object} operation - Write operation.
   * @return {Promise<Object>} Operation result.
   * @private
   */
  async proposeWrite(operation) {
    const timestamp = this.hlcClock.now();

    const entry = {
      ...operation,
      timestamp: timestamp.toString(),
      proposedBy: this.replicaId,
      proposedAt: Date.now(),
    };

    // If we're the leader, append and replicate
    if (this.role === RaftRole.LEADER) {
      return this.applyWrite(entry);
    }

    // If we're not the leader, forward to leader
    if (this.leaderId && this.transport) {
      try {
        const leaderAddress = this.resolveLeaderAddress();
        if (!leaderAddress) {
          throw new Error(ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE);
        }
        const result = await this.transport.deliver(leaderAddress, {
          type: PARTITION_SERVICE_MESSAGE_TYPE.FORWARD_WRITE,
          operation: entry,
        });
        return result;
      } catch (error) {
        throw new Error(PARTITION_SERVICE_ERROR_MSG.forwardWriteFailed(error.message));
      }
    }

    throw new Error(ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE);
  }

  /**
   * Apply a write operation (leader only).
   * @param {Object} entry - Write entry.
   * @return {Promise<Object>} Operation result.
   * @private
   */
  async applyWrite(entry) {
    this.logger.debug(PARTITION_SERVICE_LOG_MSG.APPLY_WRITE_CALLED, {
      partitionId: this.partitionId,
      replicaId: this.replicaId,
      tableName: this.tableName,
      isLeader: this.isLeader,
      cdcSubscribers: this.cdcSubscribers.size,
      entryType: entry.type,
    });

    // Append to Raft log
    const logEntry = this.storage.appendEntry(entry);

    // Execute the SQL
    let result;
    try {
      const stmt = this.db.prepare(entry.sql);
      const info = stmt.run(...(entry.params || []));

      result = {
        success: true,
        changes: info.changes,
        lastInsertRowid: info.lastInsertRowid,
        partitionId: this.partitionId,
        logIndex: logEntry.index,
      };

      // Generate CDC event asynchronously to avoid blocking write acknowledgments.
      this.generateCDCEvent(entry).catch((error) => {
        this.logger.error(PARTITION_SERVICE_ERROR_MSG.CDC_EVENT_FAILED, {
          partitionId: this.partitionId,
          error: error.message,
        });
      });

      // Schedule size update
      this.scheduleSizeUpdate();
    } catch (error) {
      result = {
        success: false,
        error: error.message,
        partitionId: this.partitionId,
      };
    }

    // Replicate to followers via liferaft
    // liferaft handles replication through its heartbeat mechanism
    // Only use liferaft's command if it considers itself the leader
    // For single-replica groups, liferaft may not be in LEADER state
    // Requirements: 11.9
    const isLiferaftLeader = this.raft && this.raft.state === LifeRaft.LEADER;
    if (isLiferaftLeader) {
      this.raft.command(entry, (err) => {
        if (err) {
          this.logger.debug(PARTITION_SERVICE_ERROR_MSG.RAFT_COMMAND_FAILED, {
            partitionId: this.partitionId,
            error: err.message,
          });
        }
      });
    }

    return result;
  }

  /**
   * Generate a CDC event for a write operation.
   * @param {Object} entry - Write entry.
   * @return {Promise<void>}
   * @private
   */
  async generateCDCEvent(entry) {
    this.logger.debug(PARTITION_SERVICE_LOG_MSG.GENERATE_CDC_EVENT_CALLED, {
      partitionId: this.partitionId,
      entryType: entry.type,
      sql: entry.sql ?
        entry.sql.substring(NUM.ZERO, PARTITION_SERVICE_VALUE.CDC_PARSE_LIMIT) :
        null,
      subscriberCount: this.cdcSubscribers.size,
    });

    if (this.cdcSubscribers.size === NUM.ZERO) {
      this.logger.debug(PARTITION_SERVICE_LOG_MSG.NO_CDC_SUBSCRIBERS, {
        partitionId: this.partitionId,
      });
      return;
    }

    let operation;
    let entryType = entry.type;

    // For raw SQL queries, determine operation type from SQL
    if (entryType === PARTITION_SERVICE_OPERATION.QUERY && entry.sql) {
      const sqlUpper = entry.sql.trim().toUpperCase();
      if (sqlUpper.startsWith(PARTITION_SERVICE_OPERATION.INSERT)) {
        entryType = PARTITION_SERVICE_OPERATION.INSERT;
      } else if (sqlUpper.startsWith(PARTITION_SERVICE_OPERATION.UPDATE)) {
        entryType = PARTITION_SERVICE_OPERATION.UPDATE;
      } else if (sqlUpper.startsWith(PARTITION_SERVICE_OPERATION.DELETE)) {
        entryType = PARTITION_SERVICE_OPERATION.DELETE;
      }
      this.logger.debug(PARTITION_SERVICE_LOG_MSG.DETECTED_OPERATION_TYPE, {
        originalType: entry.type,
        detectedType: entryType,
      });
    }

    switch (entryType) {
    case PARTITION_SERVICE_OPERATION.INSERT:
      operation = CDCOperation.INSERT;
      break;
    case PARTITION_SERVICE_OPERATION.UPDATE:
      operation = CDCOperation.UPDATE;
      break;
    case PARTITION_SERVICE_OPERATION.UPSERT:
      // UPSERT is INSERT OR REPLACE - treat as INSERT for CDC purposes
      operation = CDCOperation.INSERT;
      break;
    case PARTITION_SERVICE_OPERATION.DELETE:
      operation = CDCOperation.DELETE;
      break;
    default:
      this.logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_UNKNOWN_OPERATION, {
        entryType,
        partitionId: this.partitionId,
      });
      return; // No CDC for other operations
    }

    // For UPDATE operations, merge whereClause (contains primary key) with data
    // This ensures CDC events always include the primary key field
    // For DELETE operations, use whereClause as the data (contains primary key)
    let cdcData = entry.data || {};
    if ((entry.type === PARTITION_SERVICE_OPERATION.UPDATE ||
      entryType === PARTITION_SERVICE_OPERATION.UPDATE) && entry.whereClause) {
      cdcData = {...entry.whereClause, ...cdcData};
    } else if ((entry.type === PARTITION_SERVICE_OPERATION.DELETE ||
      entryType === PARTITION_SERVICE_OPERATION.DELETE) && entry.whereClause) {
      cdcData = {...entry.whereClause};
    }

    // For raw SQL queries, extract table name and data from SQL
    let tableName = entry.tableName || this.tableName;
    if (entry.type === PARTITION_SERVICE_OPERATION.QUERY && entry.sql) {
      // Extract table name from SQL
      const tableMatch = entry.sql.match(
        /(?:UPDATE|INSERT\s+(?:OR\s+REPLACE\s+)?INTO|DELETE\s+FROM)\s+(\w+)/i,
      );
      if (tableMatch) {
        tableName = tableMatch[NUM.ONE];
        this.logger.debug(PARTITION_SERVICE_LOG_MSG.EXTRACTED_TABLE_NAME, {tableName});
      }

      // For parameterized queries (SQL with ? placeholders), build data from params
      const hasParams = entry.params && entry.params.length > NUM.ZERO;
      const hasPlaceholders = entry.sql.includes(
        PARTITION_SERVICE_SQL_FRAGMENT.QUESTION_MARK,
      );

      if (hasParams && hasPlaceholders && Object.keys(cdcData).length === NUM.ZERO) {
        cdcData = this.extractDataFromParameterizedSQL(
          entry.sql, entry.params, tableName, entryType,
        );
      }

      // For INSERT queries without params, parse literal values from SQL
      if ((entryType === PARTITION_SERVICE_OPERATION.INSERT ||
        entryType === PARTITION_SERVICE_OPERATION.UPSERT) &&
          Object.keys(cdcData).length === NUM.ZERO) {
        cdcData = this.extractInsertDataFromSQL(entry.sql, tableName);
      }

      // For UPDATE queries, try to extract the WHERE clause to query updated row
      if (entryType === PARTITION_SERVICE_OPERATION.UPDATE &&
        Object.keys(cdcData).length === NUM.ZERO) {
        cdcData = this.extractUpdateDataFromSQL(entry.sql, tableName);
      }

      // For DELETE queries, extract the WHERE clause
      if (entryType === PARTITION_SERVICE_OPERATION.DELETE &&
        Object.keys(cdcData).length === NUM.ZERO) {
        cdcData = this.extractDeleteDataFromSQL(entry.sql);
      }
    }

    const cdcEvent = {
      tableName,
      operation,
      data: cdcData,
      timestamp: entry.timestamp,
      sourcePartition: this.partitionId,
      sourceReplica: this.replicaId,
    };

    this.logger.debug(PARTITION_SERVICE_LOG_MSG.GENERATED_CDC_EVENT, {
      partitionId: this.partitionId,
      operation,
      tableName: cdcEvent.tableName,
      dataKeys: Object.keys(cdcData),
      subscriberCount: this.cdcSubscribers.size,
    });

    // Deliver to subscribers
    let deliveredCount = NUM.ZERO;
    for (const subscriber of this.cdcSubscribers) {
      try {
        if (typeof subscriber === PARTITION_SERVICE_TYPE.FUNCTION) {
          await subscriber(cdcEvent);
          deliveredCount++;
        } else if (subscriber.handleCDCEvent) {
          await subscriber.handleCDCEvent(cdcEvent);
          deliveredCount++;
        }
      } catch (error) {
        this.logger.error(PARTITION_SERVICE_ERROR_MSG.CDC_DELIVERY_FAILED, {
          partitionId: this.partitionId,
          error: error.message,
        });
        throw error;
      }
    }

    this.logger.debug(PARTITION_SERVICE_LOG_MSG.CDC_DELIVERY_COMPLETE, {
      partitionId: this.partitionId,
      deliveredCount,
      subscriberCount: this.cdcSubscribers.size,
    });

    this.emit(PARTITION_SERVICE_EVENT.CDC_EVENT, cdcEvent);
  }

  /**
   * Extract data from INSERT SQL by querying the inserted row.
   * @param {string} sql - INSERT SQL statement.
   * @param {string} tableName - Table name.
   * @return {Object} Extracted data or empty object.
   * @private
   */
  extractInsertDataFromSQL(sql, tableName) {
    // Parse INSERT INTO table (col1, col2) VALUES ('val1', 'val2')
    // or INSERT OR REPLACE INTO table (col1, col2) VALUES ('val1', 'val2')
    const columnsMatch = sql.match(
      /INSERT\s+(?:OR\s+REPLACE\s+)?INTO\s+\w+\s*\(([^)]+)\)/i,
    );
    const valuesMatch = sql.match(/VALUES\s*\(([^)]+)\)/i);

    if (!columnsMatch || !valuesMatch) {
      this.logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_PARSE_INSERT_FAILED, {
        sql: sql.substring(
          NUM.ZERO,
          PARTITION_SERVICE_VALUE.CDC_PARSE_LIMIT,
        ),
      });
      return {};
    }

    const columns = columnsMatch[NUM.ONE].split(
      PARTITION_SERVICE_SQL_FRAGMENT.COMMA,
    ).map((c) => c.trim());
    const valuesStr = valuesMatch[NUM.ONE];

    // Parse values - handle quoted strings and numbers
    const values = this.parseValuesFromSQL(valuesStr);

    if (columns.length !== values.length) {
      this.logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_INSERT_MISMATCH, {
        columns: columns.length,
        values: values.length,
      });
      return {};
    }

    // Build data object
    const data = {};
    for (let i = NUM.ZERO; i < columns.length; i++) {
      data[columns[i]] = values[i];
    }

    // Try to fetch the full row from DB to get any default values
    // Find the primary key column (usually first column or 'id')
    const pkColumn = columns[NUM.ZERO];
    const pkValue = values[NUM.ZERO];

    if (pkValue !== null && pkValue !== undefined) {
      try {
        const stmt = this.db.prepare(`SELECT * FROM ${tableName} WHERE ${pkColumn} = ?`);
        const row = stmt.get(pkValue);
        if (row) {
          this.logger.info(PARTITION_SERVICE_LOG_MSG.FETCHED_INSERT_ROW, {
            tableName,
            rowKeys: Object.keys(row),
          });
          return row;
        }
      } catch (err) {
        this.logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_FETCH_INSERT_FAILED, {
          tableName,
          error: err.message,
        });
        throw err;
      }
    }

    return data;
  }

  /**
   * Extract data from UPDATE SQL by querying the updated row.
   * @param {string} sql - UPDATE SQL statement.
   * @param {string} tableName - Table name.
   * @return {Object} Extracted data or empty object.
   * @private
   */
  extractUpdateDataFromSQL(sql, tableName) {
    // Match WHERE clause with optional parentheses: WHERE (col = 'val') or WHERE col = 'val'
    const whereMatch = sql.match(/WHERE\s*\(?(\w+)\s*=\s*'([^']+)'/i);
    if (whereMatch) {
      const keyColumn = whereMatch[NUM.ONE];
      const keyValue = whereMatch[NUM.TWO];
      this.logger.info(PARTITION_SERVICE_LOG_MSG.FETCHING_UPDATE_ROW, {
        tableName,
        keyColumn,
        keyValue,
      });
      // Query the updated row to get full data for CDC
      try {
        const stmt = this.db.prepare(`SELECT * FROM ${tableName} WHERE ${keyColumn} = ?`);
        const row = stmt.get(keyValue);
        if (row) {
          this.logger.info(PARTITION_SERVICE_LOG_MSG.FETCHED_UPDATE_ROW, {
            tableName,
            rowKeys: Object.keys(row),
          });
          return row;
        } else {
          this.logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_NO_ROW_UPDATE, {
            tableName,
            keyColumn,
            keyValue,
          });
        }
      } catch (err) {
        this.logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_FETCH_UPDATE_FAILED, {
          tableName,
          error: err.message,
        });
        throw err;
      }
    } else {
      this.logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_EXTRACT_UPDATE_WHERE_FAILED, {
        sql: sql.substring(
          NUM.ZERO,
          PARTITION_SERVICE_VALUE.CDC_PARSE_LIMIT,
        ),
      });
    }
    return {};
  }

  /**
   * Extract data from DELETE SQL.
   * @param {string} sql - DELETE SQL statement.
   * @return {Object} Extracted data or empty object.
   * @private
   */
  extractDeleteDataFromSQL(sql) {
    // Match WHERE clause: WHERE col = 'val'
    const whereMatch = sql.match(/WHERE\s*\(?(\w+)\s*=\s*'([^']+)'/i);
    if (whereMatch) {
      const keyColumn = whereMatch[NUM.ONE];
      const keyValue = whereMatch[NUM.TWO];
      return {[keyColumn]: keyValue};
    }
    this.logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_EXTRACT_DELETE_WHERE_FAILED, {
      sql: sql.substring(
        NUM.ZERO,
        PARTITION_SERVICE_VALUE.CDC_PARSE_LIMIT,
      ),
    });
    return {};
  }

  /**
   * Extract data from parameterized SQL (SQL with ? placeholders and params array).
   * @param {string} sql - SQL statement with ? placeholders.
   * @param {Array} params - Parameter values.
   * @param {string} tableName - Table name.
   * @param {string} operationType - INSERT, UPDATE, or DELETE.
   * @return {Object} Extracted data or empty object.
   * @private
   */
  extractDataFromParameterizedSQL(sql, params, tableName, operationType) {
    if (!params || params.length === NUM.ZERO) {
      return {};
    }

    if (operationType === PARTITION_SERVICE_OPERATION.INSERT ||
      operationType === PARTITION_SERVICE_OPERATION.UPSERT) {
      // Parse INSERT INTO table (col1, col2, ...) VALUES (?, ?, ...)
      const columnsMatch = sql.match(
        /INSERT\s+(?:OR\s+REPLACE\s+)?INTO\s+\w+\s*\(([^)]+)\)/i,
      );
      if (!columnsMatch) {
        this.logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_PARSE_PARAM_INSERT_COLUMNS_FAILED, {
          sql: sql.substring(
            NUM.ZERO,
            PARTITION_SERVICE_VALUE.CDC_PARSE_LIMIT,
          ),
        });
        return {};
      }

      const columns = columnsMatch[NUM.ONE].split(
        PARTITION_SERVICE_SQL_FRAGMENT.COMMA,
      ).map((c) => c.trim());
      if (columns.length !== params.length) {
        this.logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_PARAM_INSERT_MISMATCH, {
          columns: columns.length,
          params: params.length,
        });
        return {};
      }

      // Build data object from columns and params
      const data = {};
      for (let i = NUM.ZERO; i < columns.length; i++) {
        data[columns[i]] = params[i];
      }

      this.logger.debug(PARTITION_SERVICE_LOG_MSG.EXTRACTED_PARAM_INSERT, {
        tableName,
        dataKeys: Object.keys(data),
      });

      return data;
    }

    if (operationType === PARTITION_SERVICE_OPERATION.UPDATE) {
      // Parse UPDATE table SET col1 = ?, col2 = ? WHERE pk = ?
      const setMatch = sql.match(/SET\s+(.+?)\s+WHERE/i);
      const whereMatch = sql.match(/WHERE\s+(.+)$/i);

      if (!setMatch) {
        this.logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_PARSE_PARAM_UPDATE_SET_FAILED, {
          sql: sql.substring(
            NUM.ZERO,
            PARTITION_SERVICE_VALUE.CDC_PARSE_LIMIT,
          ),
        });
        return {};
      }

      // Extract column names from SET clause
      const setColumns = setMatch[NUM.ONE].split(
        PARTITION_SERVICE_SQL_FRAGMENT.COMMA,
      ).map((part) => {
        const match = part.trim().match(/^(\w+)\s*=/);
        return match ? match[NUM.ONE] : null;
      }).filter(Boolean);

      // Extract column names from WHERE clause
      // Handle parentheses around the WHERE clause: WHERE (col = ?)
      const whereColumns = [];
      if (whereMatch) {
        // Strip outer parentheses if present
        let whereContent = whereMatch[NUM.ONE].trim();
        if (whereContent.startsWith(PARTITION_SERVICE_SQL_FRAGMENT.OPEN_PAREN) &&
          whereContent.endsWith(PARTITION_SERVICE_SQL_FRAGMENT.CLOSE_PAREN)) {
          whereContent = whereContent.slice(NUM.ONE, -NUM.ONE).trim();
        }
        const whereParts = whereContent.split(/\s+AND\s+/i);
        for (const part of whereParts) {
          // Strip any remaining parentheses from individual parts
          const cleanPart = part.trim().replace(/^\(+|\)+$/g, STRING.EMPTY);
          const match = cleanPart.match(/^(\w+)\s*=/);
          if (match) whereColumns.push(match[NUM.ONE]);
        }
      }

      const allColumns = [...setColumns, ...whereColumns];
      if (allColumns.length !== params.length) {
        this.logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_PARAM_UPDATE_MISMATCH, {
          columns: allColumns.length,
          params: params.length,
        });
        return {};
      }

      // Build data object
      const data = {};
      for (let i = NUM.ZERO; i < allColumns.length; i++) {
        data[allColumns[i]] = params[i];
      }

      this.logger.debug(PARTITION_SERVICE_LOG_MSG.EXTRACTED_PARAM_UPDATE, {
        tableName,
        dataKeys: Object.keys(data),
      });

      return data;
    }

    if (operationType === PARTITION_SERVICE_OPERATION.DELETE) {
      // Parse DELETE FROM table WHERE pk = ? or WHERE (pk = ?)
      const whereMatch = sql.match(/WHERE\s+\(?(.+?)\)?$/i);
      if (!whereMatch) {
        this.logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_PARSE_PARAM_DELETE_WHERE_FAILED, {
          sql: sql.substring(
            NUM.ZERO,
            PARTITION_SERVICE_VALUE.CDC_PARSE_LIMIT,
          ),
        });
        return {};
      }

      const whereColumns = [];
      // Handle both "col = ?" and "(col = ?)" formats
      const whereContent = whereMatch[NUM.ONE].replace(/^\(|\)$/g, STRING.EMPTY).trim();
      const whereParts = whereContent.split(/\s+AND\s+/i);
      for (const part of whereParts) {
        const match = part.trim().match(/^(\w+)\s*=/);
        if (match) whereColumns.push(match[NUM.ONE]);
      }

      if (whereColumns.length !== params.length) {
        this.logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_PARAM_DELETE_MISMATCH, {
          columns: whereColumns.length,
          params: params.length,
          whereContent,
        });
        return {};
      }

      const data = {};
      for (let i = NUM.ZERO; i < whereColumns.length; i++) {
        data[whereColumns[i]] = params[i];
      }

      this.logger.debug(PARTITION_SERVICE_LOG_MSG.EXTRACTED_PARAM_DELETE, {
        tableName,
        dataKeys: Object.keys(data),
      });

      return data;
    }

    return {};
  }

  /**
   * Parse values from SQL VALUES clause.
   * @param {string} valuesStr - Values string like "'val1', 123, NULL".
   * @return {Array} Parsed values.
   * @private
   */
  parseValuesFromSQL(valuesStr) {
    const values = [];
    let current = STRING.EMPTY;
    let inQuote = false;
    let quoteChar = null;

    for (let i = NUM.ZERO; i < valuesStr.length; i++) {
      const char = valuesStr[i];

      if (!inQuote && (char === PARTITION_SERVICE_SQL_FRAGMENT.SINGLE_QUOTE ||
        char === PARTITION_SERVICE_SQL_FRAGMENT.DOUBLE_QUOTE)) {
        inQuote = true;
        quoteChar = char;
      } else if (inQuote && char === quoteChar) {
        // Check for escaped quote
        if (i + NUM.ONE < valuesStr.length &&
          valuesStr[i + NUM.ONE] === quoteChar) {
          current += char;
          i += NUM.ONE; // Skip next quote
        } else {
          inQuote = false;
          quoteChar = null;
        }
      } else if (!inQuote && char === PARTITION_SERVICE_SQL_FRAGMENT.COMMA) {
        values.push(this.parseValue(current.trim()));
        current = STRING.EMPTY;
      } else {
        current += char;
      }
    }

    // Don't forget the last value
    if (current.trim()) {
      values.push(this.parseValue(current.trim()));
    }

    return values;
  }

  /**
   * Parse a single value from SQL.
   * @param {string} val - Value string.
   * @return {*} Parsed value.
   * @private
   */
  parseValue(val) {
    if (val.toUpperCase() === PARTITION_SERVICE_SQL_FRAGMENT.NULL_VALUE) {
      return null;
    }
    // Remove quotes
    if ((val.startsWith(PARTITION_SERVICE_SQL_FRAGMENT.SINGLE_QUOTE) &&
      val.endsWith(PARTITION_SERVICE_SQL_FRAGMENT.SINGLE_QUOTE)) ||
        (val.startsWith(PARTITION_SERVICE_SQL_FRAGMENT.DOUBLE_QUOTE) &&
        val.endsWith(PARTITION_SERVICE_SQL_FRAGMENT.DOUBLE_QUOTE))) {
      return val.slice(NUM.ONE, -NUM.ONE);
    }
    // Try to parse as number
    const num = Number(val);
    if (!isNaN(num)) {
      return num;
    }
    return val;
  }

  /**
   * Subscribe to CDC events from this partition.
   * @param {Function|Object} subscriber - Subscriber function or object.
   */
  subscribeToCDC(subscriber) {
    this.cdcSubscribers.add(subscriber);
    this.logger.debug(PARTITION_SERVICE_LOG_MSG.CDC_SUBSCRIBER_ADDED, {
      partitionId: this.partitionId,
      subscriberCount: this.cdcSubscribers.size,
    });
  }

  /**
   * Unsubscribe from CDC events.
   * @param {Function|Object} subscriber - Subscriber to remove.
   */
  unsubscribeFromCDC(subscriber) {
    this.cdcSubscribers.delete(subscriber);
    this.logger.debug(PARTITION_SERVICE_LOG_MSG.CDC_SUBSCRIBER_REMOVED, {
      partitionId: this.partitionId,
      subscriberCount: this.cdcSubscribers.size,
    });
  }


  /**
   * Calculate the partition size using SQLite pragmas.
   * @return {Promise<number>} Size in bytes.
   */
  async calculatePartitionSize() {
    if (!this.db) {
      return NUM.ZERO;
    }

    try {
      const pageCount = this.db.pragma(PARTITION_SERVICE_DB.PRAGMA_PAGE_COUNT, {
        simple: true,
      });
      const pageSize = this.db.pragma(PARTITION_SERVICE_DB.PRAGMA_PAGE_SIZE, {
        simple: true,
      });
      return pageCount * pageSize;
    } catch (error) {
      this.logger.error(PARTITION_SERVICE_ERROR_MSG.PARTITION_SIZE_FAILED, {
        partitionId: this.partitionId,
        error: error.message,
      });
      return NUM.ZERO;
    }
  }

  /**
   * Update the partition size and emit event.
   * @return {Promise<void>}
   */
  async updatePartitionSize() {
    try {
      const sizeBytes = await this.calculatePartitionSize();
      this.sizeBytes = sizeBytes;
      this.lastSizeUpdate = Date.now();

      this.logger.debug(PARTITION_SERVICE_LOG_MSG.PARTITION_SIZE_UPDATED, {
        partitionId: this.partitionId,
        sizeBytes,
        sizeMB: (
          sizeBytes / PARTITION_SERVICE_VALUE.SIZE_BYTES_DIVISOR
        ).toFixed(PARTITION_SERVICE_VALUE.SIZE_MB_PRECISION),
      });

      this.emit(PARTITION_SERVICE_EVENT.SIZE_UPDATED, {
        partitionId: this.partitionId,
        sizeBytes,
        timestamp: this.lastSizeUpdate,
      });
    } catch (error) {
      this.logger.error(PARTITION_SERVICE_ERROR_MSG.PARTITION_SIZE_UPDATE_FAILED, {
        partitionId: this.partitionId,
        error: error.message,
      });
    }
  }

  /**
   * Schedule an asynchronous size update (debounced).
   * @private
   */
  scheduleSizeUpdate() {
    if (this.sizeUpdatePending) {
      return;
    }

    const timeSinceLastUpdate = Date.now() - this.lastSizeUpdate;
    if (timeSinceLastUpdate < this.sizeUpdateDebounceMs) {
      return;
    }

    this.sizeUpdatePending = true;

    setImmediate(async () => {
      try {
        await this.updatePartitionSize();
      } finally {
        this.sizeUpdatePending = false;
      }
    });
  }

  /**
   * Start periodic size updates.
   * @private
   */
  startPeriodicSizeUpdates() {
    if (this.sizeUpdateTimer) {
      return;
    }

    this.sizeUpdateTimer = setInterval(async () => {
      const timeSinceLastUpdate = Date.now() - this.lastSizeUpdate;
      if (timeSinceLastUpdate >= this.sizeUpdateIntervalMs) {
        await this.updatePartitionSize();
      }
    }, this.sizeUpdateIntervalMs);
    this.sizeUpdateTimer.unref();
  }

  /**
   * Stop periodic size updates.
   * @private
   */
  stopPeriodicSizeUpdates() {
    if (this.sizeUpdateTimer) {
      clearInterval(this.sizeUpdateTimer);
      this.sizeUpdateTimer = null;
    }
  }

  /**
   * Get the current partition size.
   * @return {number} Size in bytes.
   */
  getSize() {
    return this.sizeBytes;
  }

  /**
   * Get the partition key range.
   * @return {Object} Key range {start, end}.
   */
  getKeyRange() {
    return {...this.keyRange};
  }

  /**
   * Set the partition key range.
   * @param {Object} keyRange - New key range {start, end}.
   */
  setKeyRange(keyRange) {
    this.keyRange = {...keyRange};
    this.emit(PARTITION_SERVICE_EVENT.KEY_RANGE_CHANGED, {
      partitionId: this.partitionId,
      keyRange: this.keyRange,
    });
  }

  /**
   * Check if a key falls within this partition's range.
   * @param {*} key - Key to check.
   * @return {boolean} True if key is in range.
   */
  isKeyInRange(key) {
    const {start, end} = this.keyRange;

    // NULL start means unbounded lower
    // NULL end means unbounded upper
    if (start === null && end === null) {
      return true;
    }

    if (start === null) {
      return key < end;
    }

    if (end === null) {
      return key >= start;
    }

    return key >= start && key < end;
  }


  /**
   * Check if this replica is the leader.
   * @return {boolean} True if leader.
   */
  isLeaderReplica() {
    return this.role === RaftRole.LEADER;
  }

  /**
   * Get the current leader ID.
   * @return {string|null} Leader replica ID.
   */
  getLeaderId() {
    return this.leaderId;
  }

  /**
   * Get the current Raft role.
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
    return this.storage?.currentTerm || NUM.ZERO;
  }

  /**
   * Get the partition state.
   * @return {string} Partition state.
   */
  getState() {
    return this.state;
  }

  /**
   * Get service status.
   * @return {Object} Service status.
   */
  getStatus() {
    return {
      partitionId: this.partitionId,
      tableId: this.tableId,
      tableName: this.tableName,
      replicaId: this.replicaId,
      nodeId: this.nodeId,
      role: this.role,
      isLeader: this.isLeader,
      leaderId: this.leaderId,
      term: this.storage?.currentTerm || NUM.ZERO,
      logLength: this.storage?.getLogLength() || NUM.ZERO,
      state: this.state,
      keyRange: this.keyRange,
      sizeBytes: this.sizeBytes,
      replicaCount: this.replicaIds.length,
      cdcSubscribers: this.cdcSubscribers.size,
      initialized: this.initialized,
    };
  }

  /**
   * Set the system table cache for the rebalancer.
   * Called after cache hydration is complete.
   * @param {Object} systemTableCache - Read-only system table cache.
   */
  setSystemTableCache(systemTableCache) {
    this.systemTableCache = systemTableCache;
    if (this.rebalancer) {
      this.rebalancer.systemTableCache = systemTableCache;
    }
    if (this.rebalanceCoordinator) {
      this.rebalanceCoordinator.systemTableCache = systemTableCache;
    }
    this.maybeInitializeRebalancer();
  }

  /**
   * Set the CDC integration service for system table writes.
   * Called after cache hydration is complete.
   * Required for rebalancer to delete service rows after REMOVE_REPLICA.
   * @param {Object} cdcIntegrationService - CDC integration service.
   */
  setCdcIntegrationService(cdcIntegrationService) {
    this.cdcIntegrationService = cdcIntegrationService;
    if (this.rebalancer) {
      this.rebalancer.cdcIntegrationService = cdcIntegrationService;
    }
    if (this.rebalanceCoordinator) {
      this.rebalanceCoordinator.cdcIntegrationService = cdcIntegrationService;
    }
    this.maybeInitializeRebalancer();
    this.flushRoleUpdate().catch((error) => {
      this.logger.warn(PARTITION_SERVICE_ERROR_MSG.PERSIST_ROLE_AFTER_CDC_FAILED, {
        partitionId: this.partitionId,
        replicaId: this.replicaId,
        error: error.message,
      });
    });
    this.flushLeaderNodeUpdate().catch((error) => {
      this.logger.warn(PARTITION_SERVICE_ERROR_MSG.PERSIST_LEADER_AFTER_CDC_FAILED, {
        partitionId: this.partitionId,
        replicaId: this.replicaId,
        error: error.message,
      });
    });
  }

  /**
   * Set table policy service for rebalancing decisions.
   * @param {Object} tablePolicyService - Table policy service instance.
   */
  setTablePolicyService(tablePolicyService) {
    this.tablePolicyService = tablePolicyService;
    if (this.rebalancer) {
      this.rebalancer.tablePolicyService = tablePolicyService;
    }
    if (this.rebalanceCoordinator) {
      this.rebalanceCoordinator.tablePolicyService = tablePolicyService;
    }
    this.maybeInitializeRebalancer();
  }

  /**
   * Set SQL query engine for rebalancer operations.
   * @param {Object} sqlQueryEngine - SQL query engine instance.
   */
  setSqlQueryEngine(sqlQueryEngine) {
    this.sqlQueryEngine = sqlQueryEngine;
    if (this.rebalanceCoordinator) {
      this.rebalanceCoordinator.sqlQueryEngine = sqlQueryEngine;
    }
    this.maybeInitializeRebalancer();
  }

  /**
   * Initialize rebalancer only when required dependencies are ready.
   * @private
   */
  maybeInitializeRebalancer() {
    if (this.rebalancer || this.rebalanceCoordinator) {
      return;
    }

    if (!this.systemTableCache ||
        !this.cdcIntegrationService ||
        !this.tablePolicyService ||
        !this.messageRouter ||
        !this.sqlQueryEngine) {
      return;
    }

    this.initializeRebalancer();
  }

  /**
   * Initialize rebalancer components with required dependencies.
   * @private
   */
  initializeRebalancer() {
    const systemTableCache = assertCritical(
      this.systemTableCache,
      PARTITION_SERVICE_ERROR_MSG.REBALANCER_CACHE_REQUIRED,
    );
    const cdcIntegrationService = assertCritical(
      this.cdcIntegrationService,
      PARTITION_SERVICE_ERROR_MSG.REBALANCER_CDC_REQUIRED,
    );
    const tablePolicyService = assertCritical(
      this.tablePolicyService,
      PARTITION_SERVICE_ERROR_MSG.REBALANCER_POLICY_REQUIRED,
    );
    const messageRouter = assertCritical(
      this.messageRouter,
      PARTITION_SERVICE_ERROR_MSG.REBALANCER_ROUTER_REQUIRED,
    );
    const sqlQueryEngine = assertCritical(
      this.sqlQueryEngine,
      PARTITION_SERVICE_ERROR_MSG.REBALANCER_SQL_ENGINE_REQUIRED,
    );

    this.rebalanceCoordinator = new RebalanceCoordinator({
      nodeId: this.nodeId,
      systemTableCache: systemTableCache,
      cdcIntegrationService: cdcIntegrationService,
      messageRouter: messageRouter,
      tablePolicyService: tablePolicyService,
      sqlQueryEngine: sqlQueryEngine,
      enableTimeouts: false,
    });
    this.rebalanceCoordinator.initialize();

    this.rebalancer = new UnifiedRebalancer({
      entityId: this.partitionId,
      entityType: EntityType.PARTITION,
      systemTableCache: systemTableCache,
      cdcIntegrationService: cdcIntegrationService,
      tablePolicyService: tablePolicyService,
      nodeId: this.nodeId,
      replicaStateMachine: this.replicaStateMachine,
      messageRouter: messageRouter,
      rebalanceCoordinator: this.rebalanceCoordinator,
    });
    this.rebalancer.initialize();
    this.rebalancer.setLeader(this.isLeader);
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
      this.logger.warn(PARTITION_SERVICE_ERROR_MSG.PERSIST_RAFT_ROLE_FAILED, {
        partitionId: this.partitionId,
        replicaId: this.replicaId,
        role,
        error: error.message,
      });
    });
  }

  /**
   * Queue a partition leader update for persistence.
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
      this.logger.warn(PARTITION_SERVICE_ERROR_MSG.PERSIST_PARTITION_LEADER_FAILED, {
        partitionId: this.partitionId,
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
    } finally {
      this.roleUpdateInFlight = false;
    }
  }

  /**
   * Persist the latest pending partition leader update.
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

    if (!this.isPartitionsLeaderAvailable()) {
      this.scheduleLeaderNodeUpdateRetry();
      return;
    }

    this.leaderNodeUpdateInFlight = true;
    const leaderNodeId = this.pendingLeaderNodeUpdate;

    try {
      await this.cdcIntegrationService.updateSystemTableRow(
        SystemTableName.PARTITIONS,
        {[COLUMN.PARTITION_ID]: this.partitionId},
        {
          [COLUMN.LEADER_NODE_ID]: leaderNodeId,
          [COLUMN.UPDATED_AT]: Date.now(),
        },
      );
      this.persistedLeaderNodeId = leaderNodeId;
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
    const cached = this.systemTableCache.get(TABLES.PARTITIONS, this.partitionId);
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
   * Check if the partitions partition leader is available for writes.
   * @return {boolean} True if a leader with an address is known.
   * @private
   */
  isPartitionsLeaderAvailable() {
    return isSystemTableWriteReady(this.systemTableCache, SystemTableName.PARTITIONS);
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
        this.logger.warn(PARTITION_SERVICE_ERROR_MSG.PERSIST_RAFT_ROLE_FAILED, {
          partitionId: this.partitionId,
          replicaId: this.replicaId,
          role: this.pendingRoleUpdate,
          error: error.message,
        });
      });
    }, TIME_MS.SECOND);
  }

  /**
   * Schedule a retry for persisting the pending partition leader update.
   * @private
   */
  scheduleLeaderNodeUpdateRetry() {
    if (this.leaderNodeUpdateRetryTimer) {
      return;
    }
    this.leaderNodeUpdateRetryTimer = setTimeout(() => {
      this.leaderNodeUpdateRetryTimer = null;
      this.flushLeaderNodeUpdate().catch((error) => {
        this.logger.warn(PARTITION_SERVICE_ERROR_MSG.PERSIST_PARTITION_LEADER_FAILED, {
          partitionId: this.partitionId,
          replicaId: this.replicaId,
          leaderNodeId: this.pendingLeaderNodeUpdate,
          error: error.message,
        });
      });
    }, TIME_MS.SECOND);
  }

  /**
   * Trigger an immediate rebalance check.
   * Called when a significant cluster event occurs (e.g., node join).
   * @param {string} reason - Reason for the trigger.
   */
  triggerRebalanceCheck(reason) {
    if (this.rebalancer && this.isLeader) {
      this.rebalancer.recordStateChange(reason);
    }
  }

  /**
   * Extract ACK from transport response.
   * Requirements: 6.1, 6.2, 6.3, 6.4
   * @param {Object} result - Transport result (now flat structure).
   * @param {string} requestId - Expected request ID.
   * @return {Object|null} ACK or null if not found.
   * @private
   */
  extractAckFromResponse(result, requestId) {
    if (!result) return null;

    // With flat message structure, request_id should be directly on the result
    if (result.request_id === requestId) {
      return result;
    }
    if (result.result) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.NESTED_ACK_UNSUPPORTED);
    }

    return null;
  }

  /**
   * Deliver a message via transport and wait for ACK with timeout.
   * Uses PendingRequestTracker instead of EventEmitter-based ACK handling.
   * Requirements: 3.1, 6.1, 6.2, 6.3, 6.4
   * @param {Object} transport - MessageRouter instance.
   * @param {string} targetAddress - Target address (e.g., 'node-2/lifecycle').
   * @param {Object} message - Message to send.
   * @param {number} timeoutMs - Timeout in milliseconds.
   * @return {Promise<Object>} ACK response or timeout error.
   * @private
   */
  async deliverWithAck(
    transport,
    targetAddress,
    message,
    timeoutMs = PARTITION_SERVICE_VALUE.DEFAULT_TIMEOUT_MS,
  ) {
    const requestId = message.request_id;

    this.logger.debug(PARTITION_SERVICE_LOG_MSG.DELIVERING_WITH_ACK, {
      requestId,
      targetAddress,
      messageType: message.type,
      partitionId: this.partitionId,
    });

    // Track the request with PendingRequestTracker
    const trackPromise = this.pendingRequestTracker.track(requestId, {
      type: message.type,
      targetAddress,
      timeoutMs,
    });

    // Store any rejection that happens during delivery (e.g., from shutdown)
    // This prevents unhandled promise rejection when delivery triggers shutdown
    // on the same node, which clears pending requests before we await trackPromise
    let earlyRejection = null;
    trackPromise.catch((err) => {
      earlyRejection = err;
    });

    try {
      // Send the message via transport
      const result = await transport.deliver(targetAddress, message);

      // Check if the tracker was cleared during delivery (e.g., self-removal)
      if (earlyRejection) {
        // If the error is "Tracker shutdown", this is expected for self-removal
        // The operation was successful - the replica was removed
        if (earlyRejection.message === PARTITION_SERVICE_LOG_MSG.TRACKER_SHUTDOWN) {
          this.logger.debug(PARTITION_SERVICE_LOG_MSG.TRACKER_SHUTDOWN_DELIVERY, {
            requestId,
            partitionId: this.partitionId,
          });
          // Return a synthetic ACK indicating the operation completed
          return {
            request_id: requestId,
            status: PARTITION_SERVICE_STATUS.INITIATED,
            message: PARTITION_SERVICE_LOG_MSG.REPLICA_REMOVAL_SELF,
          };
        }
        throw earlyRejection;
      }

      // Check if delivery failed (no connection, no handler, etc.)
      // Fail fast instead of waiting for timeout
      if (result && result.acknowledged === false) {
        const errorMsg = result.error || PARTITION_SERVICE_ERROR_MSG.DELIVERY_NOT_ACK;
        this.logger.warn(PARTITION_SERVICE_ERROR_MSG.MESSAGE_DELIVERY_FAILED, {
          requestId,
          targetAddress,
          error: errorMsg,
          partitionId: this.partitionId,
        });
        // Clean up the pending request
        if (this.pendingRequestTracker.hasPending(requestId)) {
          this.pendingRequestTracker.reject(
            requestId,
            new Error(`Delivery failed: ${errorMsg}`),
          );
        }
        throw new Error(`Delivery failed: ${errorMsg}`);
      }

      // Extract ACK from response if present (Requirements 6.1, 6.2, 6.3, 6.4)
      const ack = this.extractAckFromResponse(result, requestId);
      if (ack) {
        // Resolve via tracker (clears timeout)
        this.pendingRequestTracker.resolve(requestId, ack);
        this.logger.debug(PARTITION_SERVICE_LOG_MSG.RECEIVED_ACK, {
          requestId,
          status: ack.status,
          partitionId: this.partitionId,
        });
        return ack;
      }

      // Wait for ACK via tracker (will timeout if not received)
      return await trackPromise;
    } catch (error) {
      // Handle "Tracker shutdown" error gracefully for self-removal scenarios
      if (error.message === PARTITION_SERVICE_LOG_MSG.TRACKER_SHUTDOWN) {
        this.logger.debug(PARTITION_SERVICE_LOG_MSG.TRACKER_SHUTDOWN_ACK, {
          requestId,
          partitionId: this.partitionId,
        });
        return {
          request_id: requestId,
          status: PARTITION_SERVICE_STATUS.INITIATED,
          message: PARTITION_SERVICE_LOG_MSG.REPLICA_REMOVAL_SELF,
        };
      }
      // Ensure cleanup on error - reject the pending request if still tracked
      if (this.pendingRequestTracker.hasPending(requestId)) {
        this.pendingRequestTracker.reject(requestId, error);
      }
      throw error;
    }
  }

  /**
   * Schedule learner promotion check after minimum delay.
   * Learners are promoted to followers after catching up with the leader's log.
   * This prevents new replicas from disrupting existing leadership.
   * @private
   */
  scheduleLearnerPromotion() {
    if (this.learnerPromotionTimer) {
      return;
    }

    this.logger.debug(PARTITION_SERVICE_LOG_MSG.LEARNER_PROMOTION_SCHEDULED, {
      replicaId: this.replicaId,
      partitionId: this.partitionId,
      delayMs: this.learnerPromotionDelayMs,
    });

    this.learnerPromotionTimer = setTimeout(() => {
      this.checkLearnerPromotion();
    }, this.learnerPromotionDelayMs);
  }

  /**
   * Check if learner can be promoted to follower.
   * Promotion happens when:
   * 1. Minimum delay has passed (already satisfied by timer)
   * 2. We have received at least one heartbeat from the leader
   * 3. Promoting would not result in an even number of voters (prevents split votes)
   *    OR promoting all pending learners would result in an odd count
   * @private
   */
  checkLearnerPromotion() {
    this.learnerPromotionTimer = null;

    // Only promote if still in learner role
    if (this.role !== RaftRole.LEARNER) {
      return;
    }

    // Check if promoting would result in an even number of voters
    // This prevents election storms caused by split votes (e.g., 2-2)
    // Count current active voters (followers + candidates + leader, excluding learners)
    const activeVoterCount = this.countActiveVoters();
    const learnerCount = this.countPendingLearners();

    // If promoting this learner would result in an even number of voters,
    // defer promotion until the old replica is removed
    // activeVoterCount is current voters, adding this learner makes it activeVoterCount + 1
    const votersAfterPromotion = activeVoterCount + NUM.ONE;
    const wouldBeEven = votersAfterPromotion % NUM.TWO === NUM.ZERO;

    // Check if promoting ALL learners would result in an odd count
    // This handles the case where multiple nodes join simultaneously
    // e.g., 3 voters + 2 learners = 5 (odd) - allow promotion
    const votersAfterAllLearners = activeVoterCount + learnerCount;
    const allLearnersWouldBeOdd = votersAfterAllLearners % NUM.TWO === NUM.ONE;

    this.logger.debug(PARTITION_SERVICE_LOG_MSG.LEARNER_PROMOTION_CHECK, {
      replicaId: this.replicaId,
      partitionId: this.partitionId,
      leaderId: this.leaderId,
      logLength: this.storage?.getLogLength() || NUM.ZERO,
      activeVoterCount,
      votersAfterPromotion,
      wouldBeEven,
      learnerCount,
      votersAfterAllLearners,
      allLearnersWouldBeOdd,
    });

    // Allow promotion if:
    // 1. Promoting this learner alone would result in odd count, OR
    // 2. There are multiple learners and promoting ALL would result in odd count
    if (wouldBeEven && activeVoterCount >= NUM.THREE && !allLearnersWouldBeOdd) {
      // Defer promotion - reschedule check after a shorter interval
      // The old replica should be removed soon, which will make the count odd again
      this.logger.info(PARTITION_SERVICE_LOG_MSG.LEARNER_PROMOTION_DEFERRED, {
        replicaId: this.replicaId,
        partitionId: this.partitionId,
        activeVoterCount,
        votersAfterPromotion,
        learnerCount,
        votersAfterAllLearners,
        reason: 'would_cause_even_voter_count',
      });
      this.scheduleLearnerPromotion();
      return;
    }

    // Log if we're allowing promotion due to multiple learners
    if (wouldBeEven && allLearnersWouldBeOdd) {
      this.logger.info(PARTITION_SERVICE_LOG_MSG.LEARNER_PROMOTION_ALLOWED_MULTI, {
        replicaId: this.replicaId,
        partitionId: this.partitionId,
        activeVoterCount,
        learnerCount,
        votersAfterAllLearners,
      });
    }

    // Promote to follower - now eligible to participate in elections
    this.role = RaftRole.FOLLOWER;
    this.queueRoleUpdate(this.role);

    this.logger.info(PARTITION_SERVICE_LOG_MSG.LEARNER_PROMOTED_TO_FOLLOWER, {
      replicaId: this.replicaId,
      partitionId: this.partitionId,
      leaderId: this.leaderId,
      activeVoterCount: votersAfterPromotion,
    });

    // Start election timer now that we're a full participant
    this.startElection();
  }

  /**
   * Count pending learners in the Raft group.
   * Uses the system table cache to get current replica states.
   * @return {number} Number of pending learners.
   * @private
   */
  countPendingLearners() {
    // If no system table cache, return 1 (just this learner)
    if (!this.systemTableCache) {
      return NUM.ONE;
    }

    // Query services table for replicas of this partition
    const services = this.systemTableCache.filter(TABLES.SERVICES, (service) => {
      return service.partition_id === this.partitionId &&
        service.service_type === SERVICE_TYPE.PARTITION;
    });

    // Count replicas that are learners
    let learnerCount = NUM.ZERO;
    for (const service of services) {
      const status = service.status || ReplicaStatus.ACTIVE;
      const raftRole = service.raft_role;

      // Skip failed, removing, or removed replicas
      if (status === ReplicaStatus.FAILED ||
          status === ReplicaStatus.REMOVING ||
          status === ReplicaStatus.REMOVED) {
        continue;
      }

      // Count learners
      if (raftRole === PARTITION_RAFT_ROLE.LEARNER) {
        learnerCount++;
      }
    }

    // Ensure we count at least 1 (this learner) even if cache is stale
    return Math.max(learnerCount, NUM.ONE);
  }

  /**
   * Count active voters in the Raft group (excluding learners).
   * Uses the system table cache to get current replica states.
   * @return {number} Number of active voters.
   * @private
   */
  countActiveVoters() {
    // If no system table cache, fall back to replicaIds count
    // This is a conservative estimate that may include learners
    if (!this.systemTableCache) {
      return this.replicaIds.length;
    }

    // Query services table for replicas of this partition
    const services = this.systemTableCache.filter(TABLES.SERVICES, (service) => {
      return service.partition_id === this.partitionId &&
        service.service_type === SERVICE_TYPE.PARTITION;
    });

    // Count replicas that are active voters (not learners, not failed, not removing)
    let voterCount = NUM.ZERO;
    for (const service of services) {
      const status = service.status || ReplicaStatus.ACTIVE;
      const raftRole = service.raft_role;

      // Skip failed, removing, or removed replicas
      if (status === ReplicaStatus.FAILED ||
          status === ReplicaStatus.REMOVING ||
          status === ReplicaStatus.REMOVED) {
        continue;
      }

      // Skip learners (they don't vote)
      if (raftRole === PARTITION_RAFT_ROLE.LEARNER) {
        continue;
      }

      // Count as voter (leader, follower, candidate, or unknown role but active)
      voterCount++;
    }

    return voterCount;
  }

  /**
   * Shutdown the partition service.
   * @return {Promise<void>}
   */
  async shutdown() {
    this.logger.info(PARTITION_SERVICE_LOG_MSG.SHUTTING_DOWN, {
      partitionId: this.partitionId,
      replicaId: this.replicaId,
    });

    // Clear learner promotion timer
    if (this.learnerPromotionTimer) {
      clearTimeout(this.learnerPromotionTimer);
      this.learnerPromotionTimer = null;
    }

    // Close log adapter first to prevent database access after close
    // This must happen before raft.end() to avoid race conditions
    if (this.logAdapter) {
      this.logAdapter.close();
    }

    // Stop liferaft instance - clear all timers first
    if (this.raft) {
      if (this.raft.timers) {
        this.raft.timers.clear();
      }
      this.raft.end();
      this.raft = null;
    }

    // Stop periodic size updates
    this.stopPeriodicSizeUpdates();

    if (this.roleUpdateRetryTimer) {
      clearTimeout(this.roleUpdateRetryTimer);
      this.roleUpdateRetryTimer = null;
    }
    if (this.leaderNodeUpdateRetryTimer) {
      clearTimeout(this.leaderNodeUpdateRetryTimer);
      this.leaderNodeUpdateRetryTimer = null;
    }

    // Clear pending requests via PendingRequestTracker (Requirements: 3.5)
    if (this.pendingRequestTracker) {
      this.pendingRequestTracker.clear();
    }

    // Shutdown rebalancer
    if (this.rebalancer) {
      this.rebalancer.shutdown();
      this.rebalancer = null;
    }

    // Unregister from transport
    if (this.transport) {
      this.transport.unregister(this.unifiedAddress);
    }

    // Close database
    if (this.db) {
      this.db.close();
      this.db = null;
    }

    this.initialized = false;
    this.cdcSubscribers.clear();

    this.emit(PARTITION_SERVICE_EVENT.SHUTDOWN, {
      partitionId: this.partitionId,
      replicaId: this.replicaId,
    });
  }
}

export {
  PartitionService,
  PartitionState,
  RaftRole,
  CDCOperation,
  PartitionRaftLogEntry,
  SQLiteRaftStorage,
};
