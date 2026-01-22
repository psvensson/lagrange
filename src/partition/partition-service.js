/**
 * Partition Service - SQLite-backed Raft group for data storage.
 * Implements table partitions with Raft consensus for replication.
 * Uses liferaft library for Raft consensus with simplified transport.
 * Requirements: 3.2, 3.3, 3.4, 3.5, 4.4, 8.1, 10.1, 35.1, 35.5
 */

import {EventEmitter} from 'events';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import LifeRaft from '@markwylde/liferaft';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {LoggingService} from '../logging/logging-service.js';
import {HLCClockService} from '../hlc/hlc-clock-service.js';
import {UnifiedRebalancer, EntityType} from '../rebalancer/unified-rebalancer.js';
import {PendingRequestTracker} from './pending-request-tracker.js';
import {isRaftPacket} from '../raft/raft-packet-utils.js';
import {SQLiteLogAdapter} from '../raft/sqlite-log-adapter.js';

/**
 * Partition state enumeration.
 */
const PartitionState = {
  NORMAL: 'NORMAL',
  SPLITTING: 'SPLITTING',
  MERGING: 'MERGING',
};

/**
 * Raft role enumeration.
 */
const RaftRole = {
  FOLLOWER: 'follower',
  CANDIDATE: 'candidate',
  LEADER: 'leader',
};

/**
 * CDC operation types.
 */
const CDCOperation = {
  INSERT: 'INSERT',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
};

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
    this.currentTerm = 0;
    this.votedFor = null;
    this.commitIndex = 0;
    this.lastApplied = 0;

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
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS _raft_state (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);

    // Create Raft log table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS _raft_log (
        log_index INTEGER PRIMARY KEY,
        term INTEGER NOT NULL,
        command TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      )
    `);

    // Load persisted state
    this.loadPersistedState();
  }

  /**
   * Load persisted Raft state from SQLite.
   * @private
   */
  loadPersistedState() {
    const termRow = this.db.prepare(
      'SELECT value FROM _raft_state WHERE key = ?',
    ).get('currentTerm');
    if (termRow) {
      this.currentTerm = parseInt(termRow.value, 10);
    }

    const votedRow = this.db.prepare(
      'SELECT value FROM _raft_state WHERE key = ?',
    ).get('votedFor');
    if (votedRow) {
      this.votedFor = votedRow.value;
    }

    // Load log entries
    const entries = this.db.prepare(
      'SELECT log_index, term, command, timestamp FROM _raft_log ORDER BY log_index',
    ).all();

    this.log = entries.map((row) => new PartitionRaftLogEntry(
      row.term,
      row.log_index,
      JSON.parse(row.command),
    ));

    if (this.log.length > 0) {
      this.commitIndex = this.log[this.log.length - 1].index;
      this.lastApplied = this.commitIndex;
    }
  }

  /**
   * Persist current term to SQLite.
   */
  persistTerm() {
    this.db.prepare(
      'INSERT OR REPLACE INTO _raft_state (key, value) VALUES (?, ?)',
    ).run('currentTerm', String(this.currentTerm));
  }

  /**
   * Persist voted for to SQLite.
   */
  persistVotedFor() {
    this.db.prepare(
      'INSERT OR REPLACE INTO _raft_state (key, value) VALUES (?, ?)',
    ).run('votedFor', this.votedFor || '');
  }

  /**
   * Append an entry to the log.
   * @param {Object} data - Entry data.
   * @return {PartitionRaftLogEntry} The appended entry.
   */
  appendEntry(data) {
    const index = this.log.length + 1;
    const entry = new PartitionRaftLogEntry(this.currentTerm, index, data);
    this.log.push(entry);

    // Persist to SQLite - use INSERT OR REPLACE to handle edge cases gracefully
    this.db.prepare(
      'INSERT OR REPLACE INTO _raft_log (log_index, term, command, timestamp) VALUES (?, ?, ?, ?)',
    ).run(entry.index, entry.term, JSON.stringify(entry.data), entry.timestamp);

    return entry;
  }

  /**
   * Get entries from a starting index.
   * @param {number} startIndex - Starting index (1-based).
   * @return {Array<PartitionRaftLogEntry>} Log entries.
   */
  getEntriesFrom(startIndex) {
    if (startIndex < 1) {
      return [...this.log];
    }
    return this.log.slice(startIndex - 1);
  }

  /**
   * Get the last log entry.
   * @return {PartitionRaftLogEntry|null} Last entry or null.
   */
  getLastEntry() {
    return this.log.length > 0 ? this.log[this.log.length - 1] : null;
  }

  /**
   * Get entry at a specific index.
   * @param {number} index - Log index (1-based).
   * @return {PartitionRaftLogEntry|null} Entry or null.
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

      // Truncate in SQLite
      this.db.prepare('DELETE FROM _raft_log WHERE log_index >= ?').run(fromIndex);
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
      throw new Error('PartitionService requires partitionId');
    }
    if (!options.tableId) {
      throw new Error('PartitionService requires tableId');
    }
    if (!options.replicaId) {
      throw new Error('PartitionService requires replicaId');
    }

    this.partitionId = options.partitionId;
    this.tableId = options.tableId;
    this.tableName = options.tableName || options.tableId;
    this.schema = options.schema || null;
    this.keyRange = options.keyRange || {start: null, end: null};
    this.replicaId = options.replicaId;
    this.replicaIds = options.replicaIds || [this.replicaId];
    this.nodeId = options.nodeId || 'unknown';
    this.transport = options.transport || null;
    this.dbPath = options.dbPath || ':memory:';

    // Unified address format: ${nodeId}/partition/${replicaId}
    // Requirements: 1.1, 5.1
    this.unifiedAddress = `${this.nodeId}/partition/${this.replicaId}`;

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.defaultReplicaCount = config.get('partition.defaultReplicaCount') || 3;
    this.sizeUpdateDebounceMs = config.get('partition.sizeUpdateDebounceMs') || 5000;
    this.sizeUpdateIntervalMs = config.get('partition.sizeUpdateIntervalMs') || 60000;

    // SQLite database
    this.db = null;
    this.storage = null;

    // Raft state - liferaft handles election/heartbeat timers internally
    // Requirements: 11.9
    this.role = RaftRole.FOLLOWER;
    this.leaderId = null;

    // Partition state
    this.state = PartitionState.NORMAL;

    // Size tracking
    this.sizeBytes = 0;
    this.sizeUpdatePending = false;
    this.lastSizeUpdate = 0;
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
      loggingService.forSubsystem('partition') : console;

    // State
    this.initialized = false;
    this.isLeader = false;

    // PendingRequestTracker for lifecycle messages (replaces EventEmitter-based ACK handling)
    // Requirements: 3.1, 6.1, 6.2, 6.3, 6.4
    this.pendingRequestTracker = new PendingRequestTracker({
      defaultTimeoutMs: 30000,
    });

    // Rebalancer - manages replica placement when this partition is leader
    this.rebalancer = null;
    this.systemTableCache = options.systemTableCache || null;
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.tablePolicyService = options.tablePolicyService || null;
    // Message group service for sending CREATE_REPLICA/REMOVE_REPLICA messages
    this.messageGroupService = options.messageGroupService || null;
    // MessageRouter for cross-node lifecycle messages (CREATE_REPLICA/REMOVE_REPLICA)
    // This transport properly routes through WebSocket to reach remote nodes
    this.messageRouter = options.messageRouter || null;

    // Defer election start until all replicas are ready
    // When true, the Raft election timer won't start until startElection() is called
    // This prevents election storms when multiple replicas are created on the same node
    this.deferElection = options.deferElection || false;
    this.electionStarted = false;
    // ReplicaStateMachine for tracking replica lifecycle states
    this.replicaStateMachine = options.replicaStateMachine || null;
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
   * Falls back to using the peerId directly if nodeId cannot be determined.
   * All addresses use fully qualified network identity format: ${nodeId}/partition/${replicaId}
   * Requirements: 1.1, 3.1, 3.2, 3.3, 9.1
   * @param {string} peerId - Peer replica ID.
   * @return {string} Unified address for the peer.
   */
  buildPeerAddress(peerId) {
    // If peerId is already in unified format, return as-is
    if (peerId.includes('/')) {
      this.logger.debug('Peer address already in unified format', {
        peerId,
        partitionId: this.partitionId,
      });
      return peerId;
    }

    // Try to look up nodeId from system table cache
    if (this.systemTableCache) {
      const service = this.systemTableCache.get('services', peerId);
      if (service && service.node_id) {
        const address = `${service.node_id}/partition/${peerId}`;
        this.logger.debug('Built peer address from cache', {
          peerId,
          nodeId: service.node_id,
          address,
          partitionId: this.partitionId,
        });
        return address;
      }
    }

    // During bootstrap, all replicas are on the same node, so use this.nodeId
    // This enables Raft elections to work before the system table cache is populated
    // Requirements: 1.1, 3.1, 3.2, 3.3, 9.1
    const address = `${this.nodeId}/partition/${peerId}`;
    this.logger.debug('Built peer address using local nodeId', {
      peerId,
      nodeId: this.nodeId,
      address,
      partitionId: this.partitionId,
    });
    return address;
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

    this.logger.info('Initializing partition service', {
      partitionId: this.partitionId,
      tableId: this.tableId,
      replicaId: this.replicaId,
      nodeId: this.nodeId,
      replicaCount: this.replicaIds.length,
      dbPath: this.dbPath,
    });

    // Ensure directory exists for file-based databases
    if (this.dbPath !== ':memory:') {
      const dbDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, {recursive: true});
        this.logger.debug('Created partition directory', {path: dbDir});
      }
    }

    // Open SQLite database
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');

    // Initialize Raft storage (legacy - kept for compatibility)
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
    const heartbeatMs = config.get('raft.heartbeatIntervalMs') || 50;
    const electionMinMs = config.get('raft.electionTimeoutMinMs') || 150;
    const electionMaxMs = config.get('raft.electionTimeoutMaxMs') || 1000;

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
          self.logger.debug('Deferring election start', {
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
    const logAdapter = new SQLiteLogAdapter(this.db);

    // Create liferaft instance
    // Use unified address so that packet.address contains the full address
    // This allows other nodes to respond to vote requests correctly
    // Requirements: 8.1, 10.1, 10.5
    this.raft = new RaftNode(this.unifiedAddress, {
      'heartbeat': heartbeatMs,
      'election min': electionMinMs,
      'election max': electionMaxMs,
      'Log': function() {
        return logAdapter;
      },
    });

    // If deferElection is true, clear all timers that liferaft started automatically
    // This prevents elections from starting until startElection() is called
    // Liferaft's _initialize() sets up a 'state change' handler that starts timers
    if (this.deferElection && this.raft.timers) {
      this.raft.timers.clear('heartbeat, election');
      this.logger.debug('Cleared liferaft timers for deferred election', {
        replicaId: this.replicaId,
        partitionId: this.partitionId,
      });
    }

    // Track if this is a truly single-replica group for special handling
    // Only consider it single-replica if replicaIds.length === 1
    // Do NOT use replicaIds.every() check as that could cause premature leadership
    // when peer list is incomplete (violates Requirements 4.3, 5.1, 5.2, 5.3)
    const isSingleReplica = this.replicaIds.length === 1;

    // Wire up liferaft events
    // Requirements: 10.5
    this.raft.on('leader', () => {
      this.role = RaftRole.LEADER;
      this.isLeader = true;
      this.leaderId = this.replicaId;
      this.storage.currentTerm = this.raft.term;

      // Activate rebalancer when becoming leader
      if (this.rebalancer) {
        this.rebalancer.setLeader(true);
      }

      this.logger.info('Became leader (liferaft)', {
        term: this.raft.term,
        replicaId: this.replicaId,
        partitionId: this.partitionId,
      });

      this.emit('leaderElected', {
        leaderId: this.replicaId,
        term: this.raft.term,
        partitionId: this.partitionId,
      });
    });

    this.raft.on('follower', () => {
      // For single-replica groups, ignore follower events since we're always leader
      // liferaft may emit follower events during initialization
      if (isSingleReplica && this.isLeader) {
        return;
      }
      this.role = RaftRole.FOLLOWER;
      this.isLeader = false;
      this.storage.currentTerm = this.raft.term;

      // Deactivate rebalancer when losing leadership
      if (this.rebalancer) {
        this.rebalancer.setLeader(false);
      }
    });

    this.raft.on('candidate', () => {
      // For single-replica groups, ignore candidate events since we're always leader
      // liferaft may emit candidate events during election cycles
      if (isSingleReplica && this.isLeader) {
        return;
      }
      this.role = RaftRole.CANDIDATE;
      this.isLeader = false;
      this.storage.currentTerm = this.raft.term;
    });

    // Handle committed entries
    // Requirements: 10.5
    this.raft.on('commit', (command) => {
      this.applyCommittedEntry(command);
    });

    this.raft.on('leader change', (to) => {
      this.leaderId = to;
      this.logger.debug('Leader changed', {
        newLeader: to,
        partitionId: this.partitionId,
      });
    });

    this.raft.on('term change', (term) => {
      this.storage.currentTerm = term;
    });

    // Join peer nodes
    // Requirements: 3.1, 3.2, 3.3 - All peer addresses use fully qualified format
    for (const peerId of this.replicaIds) {
      if (peerId !== this.replicaId) {
        const peerAddress = this.buildPeerAddress(peerId);
        this.logger.info('Joining peer with fully qualified address', {
          peerId,
          peerAddress,
          replicaId: this.replicaId,
          partitionId: this.partitionId,
          addressFormat: peerAddress.includes('/') ? 'unified' : 'simple',
        });
        this.raft.join(peerAddress);
      }
    }

    // Create rebalancer for this partition
    this.rebalancer = new UnifiedRebalancer({
      entityId: this.partitionId,
      entityType: EntityType.PARTITION,
      systemTableCache: this.systemTableCache,
      cdcIntegrationService: this.cdcIntegrationService,
      tablePolicyService: this.tablePolicyService,
      nodeId: this.nodeId,
      replicaStateMachine: this.replicaStateMachine,
    });
    this.rebalancer.initialize();

    // Wire up rebalancer events to handle replica creation/removal (async handlers)
    this.rebalancer.on('addReplica', (event) => {
      this.handleRebalancerAddReplica(event).catch((err) => {
        this.logger.error('Error in handleRebalancerAddReplica', {
          partitionId: this.partitionId,
          error: err.message,
        });
      });
    });
    this.rebalancer.on('removeReplica', (event) => {
      this.handleRebalancerRemoveReplica(event).catch((err) => {
        this.logger.error('Error in handleRebalancerRemoveReplica', {
          partitionId: this.partitionId,
          error: err.message,
        });
      });
    });

    // For truly single-replica groups, become leader immediately
    // This avoids the election timer delay during bootstrap
    // Only do this when replicaIds.length === 1 (truly single replica)
    // Do NOT use replicaIds.every() check - that could cause premature leadership
    // when peer list is incomplete (violates Requirements 4.3, 5.1, 5.2, 5.3)
    // Let liferaft handle all multi-replica elections
    // Requirements: 10.5
    if (this.replicaIds.length === 1) {
      // Manually promote to leader for single-replica case
      this.role = RaftRole.LEADER;
      this.isLeader = true;
      this.leaderId = this.replicaId;

      // Activate rebalancer when becoming leader
      if (this.rebalancer) {
        this.rebalancer.setLeader(true);
      }

      this.logger.info('Single replica - becoming leader immediately', {
        replicaId: this.replicaId,
        partitionId: this.partitionId,
      });

      this.emit('leaderElected', {
        leaderId: this.replicaId,
        term: this.raft ? this.raft.term : 0,
        partitionId: this.partitionId,
      });
    }

    // Start periodic size updates
    this.startPeriodicSizeUpdates();

    // Calculate initial size
    await this.updatePartitionSize();

    this.initialized = true;

    this.logger.info('Partition service initialized', {
      partitionId: this.partitionId,
      replicaId: this.replicaId,
      sizeBytes: this.sizeBytes,
    });

    this.emit('initialized', {
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
    if (this.replicaIds.length === 1) {
      this.electionStarted = true;
      return;
    }

    this.electionStarted = true;

    if (this.raft) {
      this.logger.info('Starting Raft election timer', {
        replicaId: this.replicaId,
        partitionId: this.partitionId,
        peerCount: this.replicaIds.length - 1,
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
        def += ' PRIMARY KEY';
      }
      if (col.notNull) {
        def += ' NOT NULL';
      }
      if (col.defaultValue !== undefined) {
        def += ` DEFAULT ${col.defaultValue}`;
      }
      return def;
    }).join(', ');

    const sql = `CREATE TABLE IF NOT EXISTS ${this.tableName} (${columns})`;
    this.db.exec(sql);

    this.logger.debug('Created table', {
      tableName: this.tableName,
      partitionId: this.partitionId,
    });
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
        this.logger.debug('Received Raft packet', {
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
            this.logger.debug('Sending Raft response', {
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
        // Requirements: 8.4
        this.raft.emit('data', payload, write);
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
      return {acknowledged: false, error: 'Invalid message'};
    }

    // Handle application messages only - Raft packets are handled by
    // handleTransportMessage() using isRaftPacket() and emitted to liferaft
    // Requirements: 13.3, 13.4
    switch (payload.type) {
    case 'FORWARD_WRITE':
      // Handle forwarded write operations from followers
      if (payload.operation) {
        return this.applyWrite(payload.operation);
      }
      return {acknowledged: false, error: 'Invalid FORWARD_WRITE message'};
    default:
      // Unknown message type - log and acknowledge to avoid blocking
      this.logger.debug('Unknown application message type', {
        type: payload.type,
        partitionId: this.partitionId,
      });
      return {acknowledged: false, error: `Unknown message type: ${payload.type}`};
    }
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

    this.logger.debug('Applying committed entry', {
      partitionId: this.partitionId,
      commandType: command.type,
    });

    // Handle different command types
    if (command.type === 'WRITE' || command.type === 'INSERT' ||
        command.type === 'UPDATE' || command.type === 'DELETE' ||
        command.type === 'UPSERT' || command.type === 'QUERY') {
      // Apply SQL write operation
      if (command.sql) {
        try {
          const stmt = this.db.prepare(command.sql);
          stmt.run(...(command.params || []));

          // Generate CDC event
          this.generateCDCEvent(command).catch((err) => {
            this.logger.error('Failed to generate CDC event for committed entry', {
              partitionId: this.partitionId,
              error: err.message,
            });
          });
        } catch (error) {
          this.logger.error('Failed to apply committed entry', {
            partitionId: this.partitionId,
            error: error.message,
          });
        }
      }
    } else if (command.type === 'TRANSACTION_COMMIT') {
      // Handle transaction commit - operations already applied
      this.logger.debug('Transaction commit entry applied', {
        partitionId: this.partitionId,
        operationCount: command.operations?.length || 0,
      });
    }

    this.emit('entryCommitted', {
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
      throw new Error('PartitionService not initialized');
    }

    if (this.activeTransaction) {
      throw new Error('Transaction already active on this partition');
    }

    this.logger.debug('Beginning transaction', {
      partitionId: this.partitionId,
    });

    try {
      // Use SQLite's BEGIN for transaction support
      this.db.exec('BEGIN IMMEDIATE');
      this.activeTransaction = {
        startTime: Date.now(),
        operations: [],
      };
      this.transactionOperations = [];

      return {
        success: true,
        operation: 'BEGIN_TRANSACTION',
        partitionId: this.partitionId,
        inTransaction: true,
      };
    } catch (error) {
      this.logger.error('Failed to begin transaction', {
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
      throw new Error('PartitionService not initialized');
    }

    if (!this.activeTransaction) {
      throw new Error('No active transaction to commit');
    }

    this.logger.debug('Committing transaction', {
      partitionId: this.partitionId,
      operationCount: this.transactionOperations.length,
    });

    try {
      // Replicate transaction operations through Raft for durability
      const raftEntry = await this.replicateTransactionCommit();

      // Commit in SQLite
      this.db.exec('COMMIT');

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
        operation: 'COMMIT',
        partitionId: this.partitionId,
        committed: true,
        durationMs: duration,
        operationCount,
        raftLogIndex: raftEntry?.index || null,
      };
    } catch (error) {
      this.logger.error('Failed to commit transaction', {
        partitionId: this.partitionId,
        error: error.message,
      });

      // Rollback on failure
      try {
        this.db.exec('ROLLBACK');
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
      throw new Error('PartitionService not initialized');
    }

    if (!this.activeTransaction) {
      throw new Error('No active transaction to rollback');
    }

    this.logger.debug('Rolling back transaction', {
      partitionId: this.partitionId,
      operationCount: this.transactionOperations.length,
    });

    try {
      // Rollback in SQLite - this reverts all changes
      this.db.exec('ROLLBACK');

      const duration = Date.now() - this.activeTransaction.startTime;
      const operationCount = this.transactionOperations.length;

      // Clear transaction state
      this.activeTransaction = null;
      this.transactionOperations = [];

      return {
        success: true,
        operation: 'ROLLBACK',
        partitionId: this.partitionId,
        rolledBack: true,
        durationMs: duration,
        operationCount,
      };
    } catch (error) {
      this.logger.error('Failed to rollback transaction', {
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
    if (this.transactionOperations.length === 0) {
      return null;
    }

    const timestamp = this.hlcClock.now();

    const entry = {
      type: 'TRANSACTION_COMMIT',
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
          this.logger.debug('Raft command failed for transaction commit', {
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
      throw new Error('PartitionService not initialized');
    }

    this.logger.debug('Executing query', {
      partitionId: this.partitionId,
      sql: sql.substring(0, 100),
    });

    try {
      const stmt = this.db.prepare(sql);
      const isSelect = sql.trim().toUpperCase().startsWith('SELECT');

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
          return this.executeTransactionWrite({type: 'QUERY', sql, params});
        }
        // For write operations outside transaction, go through Raft
        return this.proposeWrite({type: 'QUERY', sql, params});
      }
    } catch (error) {
      this.logger.error('Query execution failed', {
        partitionId: this.partitionId,
        sql: sql.substring(0, 100),
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
      throw new Error('No active transaction');
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
      this.logger.error('Transaction write failed', {
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
      throw new Error('PartitionService not initialized');
    }

    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = columns.map(() => '?').join(', ');
    const sql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;

    return this.proposeWrite({
      type: 'INSERT',
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
      throw new Error('PartitionService not initialized');
    }

    const setClauses = Object.keys(data).map((k) => `${k} = ?`).join(', ');
    const whereClauses = Object.keys(whereClause).map((k) => `${k} = ?`).join(' AND ');
    const sql = `UPDATE ${tableName} SET ${setClauses} WHERE ${whereClauses}`;
    const params = [...Object.values(data), ...Object.values(whereClause)];

    return this.proposeWrite({
      type: 'UPDATE',
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
      throw new Error('PartitionService not initialized');
    }

    const whereClauses = Object.keys(whereClause).map((k) => `${k} = ?`).join(' AND ');
    const sql = `DELETE FROM ${tableName} WHERE ${whereClauses}`;
    const params = Object.values(whereClause);

    return this.proposeWrite({
      type: 'DELETE',
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
      throw new Error('PartitionService not initialized');
    }

    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = columns.map(() => '?').join(', ');
    const sql = `INSERT OR REPLACE INTO ${tableName} ` +
      `(${columns.join(', ')}) VALUES (${placeholders})`;

    return this.proposeWrite({
      type: 'UPSERT',
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
        const result = await this.transport.deliver(this.leaderId, {
          type: 'FORWARD_WRITE',
          operation: entry,
        });
        return result;
      } catch (error) {
        throw new Error(`Failed to forward write to leader: ${error.message}`);
      }
    }

    throw new Error('No leader available for write operation');
  }

  /**
   * Apply a write operation (leader only).
   * @param {Object} entry - Write entry.
   * @return {Promise<Object>} Operation result.
   * @private
   */
  async applyWrite(entry) {
    this.logger.info('applyWrite called', {
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

      // Generate CDC event
      await this.generateCDCEvent(entry);

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
          this.logger.debug('Raft command failed', {
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
    this.logger.info('generateCDCEvent called', {
      partitionId: this.partitionId,
      entryType: entry.type,
      sql: entry.sql ? entry.sql.substring(0, 100) : null,
      subscriberCount: this.cdcSubscribers.size,
    });

    if (this.cdcSubscribers.size === 0) {
      this.logger.warn('No CDC subscribers, skipping event generation', {
        partitionId: this.partitionId,
      });
      return;
    }

    let operation;
    let entryType = entry.type;

    // For raw SQL queries, determine operation type from SQL
    if (entryType === 'QUERY' && entry.sql) {
      const sqlUpper = entry.sql.trim().toUpperCase();
      if (sqlUpper.startsWith('INSERT')) {
        entryType = 'INSERT';
      } else if (sqlUpper.startsWith('UPDATE')) {
        entryType = 'UPDATE';
      } else if (sqlUpper.startsWith('DELETE')) {
        entryType = 'DELETE';
      }
      this.logger.info('Detected operation type from SQL', {
        originalType: entry.type,
        detectedType: entryType,
      });
    }

    switch (entryType) {
    case 'INSERT':
      operation = CDCOperation.INSERT;
      break;
    case 'UPDATE':
      operation = CDCOperation.UPDATE;
      break;
    case 'UPSERT':
      // UPSERT is INSERT OR REPLACE - treat as INSERT for CDC purposes
      operation = CDCOperation.INSERT;
      break;
    case 'DELETE':
      operation = CDCOperation.DELETE;
      break;
    default:
      this.logger.warn('Unknown operation type, skipping CDC', {
        entryType,
        partitionId: this.partitionId,
      });
      return; // No CDC for other operations
    }

    // For UPDATE operations, merge whereClause (contains primary key) with data
    // This ensures CDC events always include the primary key field
    // For DELETE operations, use whereClause as the data (contains primary key)
    let cdcData = entry.data || {};
    if (entry.type === 'UPDATE' && entry.whereClause) {
      cdcData = {...entry.whereClause, ...cdcData};
    } else if (entry.type === 'DELETE' && entry.whereClause) {
      cdcData = {...entry.whereClause};
    }

    // For raw SQL queries, extract table name and try to get updated data
    let tableName = entry.tableName || this.tableName;
    if (entry.type === 'QUERY' && entry.sql) {
      // Extract table name from SQL
      const tableMatch = entry.sql.match(/(?:UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+(\w+)/i);
      if (tableMatch) {
        tableName = tableMatch[1];
        this.logger.info('Extracted table name from SQL', {tableName});
      }

      // For UPDATE queries, try to extract the WHERE clause to query updated row
      if (entryType === 'UPDATE' && Object.keys(cdcData).length === 0) {
        // Match WHERE clause with optional parentheses: WHERE (col = 'val') or WHERE col = 'val'
        const whereMatch = entry.sql.match(/WHERE\s*\(?(\w+)\s*=\s*'([^']+)'/i);
        if (whereMatch) {
          const keyColumn = whereMatch[1];
          const keyValue = whereMatch[2];
          this.logger.info('Fetching updated row for CDC', {
            tableName,
            keyColumn,
            keyValue,
          });
          // Query the updated row to get full data for CDC
          try {
            const stmt = this.db.prepare(`SELECT * FROM ${tableName} WHERE ${keyColumn} = ?`);
            const row = stmt.get(keyValue);
            if (row) {
              cdcData = row;
              this.logger.info('Fetched updated row for CDC', {
                tableName,
                rowKeys: Object.keys(row),
              });
            } else {
              this.logger.warn('No row found for CDC update', {tableName, keyColumn, keyValue});
            }
          } catch (err) {
            this.logger.warn('Failed to fetch updated row for CDC', {
              tableName,
              error: err.message,
            });
          }
        } else {
          this.logger.warn('Could not extract WHERE clause from UPDATE SQL', {
            sql: entry.sql.substring(0, 100),
          });
        }
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

    this.logger.info('Generated CDC event', {
      partitionId: this.partitionId,
      operation,
      tableName: cdcEvent.tableName,
      dataKeys: Object.keys(cdcData),
      subscriberCount: this.cdcSubscribers.size,
    });

    // Deliver to subscribers
    let deliveredCount = 0;
    for (const subscriber of this.cdcSubscribers) {
      try {
        if (typeof subscriber === 'function') {
          await subscriber(cdcEvent);
          deliveredCount++;
        } else if (subscriber.handleCDCEvent) {
          await subscriber.handleCDCEvent(cdcEvent);
          deliveredCount++;
        }
      } catch (error) {
        this.logger.error('Failed to deliver CDC event', {
          partitionId: this.partitionId,
          error: error.message,
        });
      }
    }

    this.logger.info('CDC event delivery complete', {
      partitionId: this.partitionId,
      deliveredCount,
      subscriberCount: this.cdcSubscribers.size,
    });

    this.emit('cdcEvent', cdcEvent);
  }

  /**
   * Subscribe to CDC events from this partition.
   * @param {Function|Object} subscriber - Subscriber function or object.
   */
  subscribeToCDC(subscriber) {
    this.cdcSubscribers.add(subscriber);
    this.logger.debug('CDC subscriber added', {
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
    this.logger.debug('CDC subscriber removed', {
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
      return 0;
    }

    try {
      const pageCount = this.db.pragma('page_count', {simple: true});
      const pageSize = this.db.pragma('page_size', {simple: true});
      return pageCount * pageSize;
    } catch (error) {
      this.logger.error('Failed to calculate partition size', {
        partitionId: this.partitionId,
        error: error.message,
      });
      return 0;
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

      this.logger.debug('Partition size updated', {
        partitionId: this.partitionId,
        sizeBytes,
        sizeMB: (sizeBytes / (1024 * 1024)).toFixed(2),
      });

      this.emit('sizeUpdated', {
        partitionId: this.partitionId,
        sizeBytes,
        timestamp: this.lastSizeUpdate,
      });
    } catch (error) {
      this.logger.error('Failed to update partition size', {
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
    this.emit('keyRangeChanged', {
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
    return this.storage?.currentTerm || 0;
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
      term: this.storage?.currentTerm || 0,
      logLength: this.storage?.getLogLength() || 0,
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
  }

  /**
   * Trigger an immediate rebalance check.
   * Called when a significant cluster event occurs (e.g., node join).
   * @param {string} reason - Reason for the trigger.
   */
  triggerRebalanceCheck(reason) {
    if (this.rebalancer && this.isLeader) {
      this.rebalancer.triggerImmediateCheck(reason);
    }
  }

  /**
   * Handle rebalancer addReplica event.
   * Creates a new replica on the specified node by sending CREATE_REPLICA message.
   * Requirements: 10.1, 10.2, 10.20, 10.21
   * @param {Object} event - Add replica event.
   * @private
   */
  async handleRebalancerAddReplica(event) {
    const {replicaId, nodeId: targetNodeId, requestId} = event;
    const startTime = Date.now();

    this.logger.info('Rebalancer requested replica addition - sending CREATE_REPLICA', {
      partitionId: this.partitionId,
      tableName: this.tableName,
      entityId: event.entityId,
      replicaId,
      targetNodeId,
      requestId,
    });

    // Record the pending replica in services table BEFORE sending CREATE_REPLICA
    // This ensures the replica is tracked even if the message fails
    if (this.cdcIntegrationService) {
      try {
        this.logger.debug('Inserting pending replica into services table', {
          partitionId: this.partitionId,
          replicaId,
          targetNodeId,
          elapsedMs: Date.now() - startTime,
        });
        await this.cdcIntegrationService.insertSystemTableRow('services', {
          service_id: replicaId,
          service_type: 'partition',
          node_id: targetNodeId,
          partition_id: this.partitionId,
          group_id: null,
          replica_id: replicaId,
          raft_role: 'follower',
          status: 'starting',
          address: null,
          created_at: Date.now(),
          updated_at: Date.now(),
        });
        this.logger.debug('Recorded pending replica in services table', {
          partitionId: this.partitionId,
          replicaId,
          targetNodeId,
          elapsedMs: Date.now() - startTime,
        });
      } catch (err) {
        this.logger.error('Failed to record pending replica in services table', {
          partitionId: this.partitionId,
          replicaId,
          error: err.message,
          elapsedMs: Date.now() - startTime,
        });
        // Continue anyway - the replica creation may still succeed
      }
    }

    // Query system table cache for all replicas of this partition
    // Requirements: 4.1 - Ensure new replica receives complete peer list
    let replicaIds = [this.replicaId]; // Start with current replica
    if (this.systemTableCache) {
      try {
        const partitionServices = this.systemTableCache.filter(
          'services',
          (svc) => svc.partition_id === this.partitionId &&
                   svc.service_type === 'partition',
        );
        // Extract service_ids (replica IDs) from all partition services
        const existingReplicaIds = partitionServices.map((svc) => svc.service_id);
        // Include the new replica being created
        replicaIds = [...new Set([...existingReplicaIds, replicaId])];
        this.logger.debug('Collected replica IDs for CREATE_REPLICA', {
          partitionId: this.partitionId,
          replicaIds,
          existingCount: existingReplicaIds.length,
        });
      } catch (err) {
        this.logger.warn('Failed to query replica IDs from cache, using current replica only', {
          partitionId: this.partitionId,
          error: err.message,
        });
        // Fall back to including at least the current replica and new replica
        replicaIds = [this.replicaId, replicaId];
      }
    } else {
      // No cache available, include at least current and new replica
      replicaIds = [this.replicaId, replicaId];
    }

    // Build CREATE_REPLICA message per design spec
    const message = {
      type: 'CREATE_REPLICA',
      request_id: requestId,
      partition_id: this.partitionId,
      table_name: this.tableName,
      table_id: this.tableId,
      replica_id: replicaId,
      replica_ids: replicaIds, // Include all peer replica IDs for Raft group
      leader_address: this.nodeId,
      leader_replica_id: this.replicaId,
      key_range: this.keyRange,
      schema: this.schema,
      timestamp: Date.now(),
    };

    // Target the lifecycle handler on the target node using unified address format
    // Requirements: 1.1, 7.1 - Unified address format ${nodeId}/${entityType}/${entityId}
    const targetAddress = `${targetNodeId}/lifecycle/manager`;

    // Use messageRouter for cross-node delivery
    // This properly routes through WebSocket to reach remote nodes
    if (this.messageRouter) {
      try {
        this.logger.info('Sending CREATE_REPLICA via messageRouter', {
          partitionId: this.partitionId,
          tableName: this.tableName,
          replicaId,
          targetNodeId,
          targetAddress,
          requestId,
          elapsedMs: Date.now() - startTime,
        });
        const result = await this.deliverWithAck(
          this.messageRouter,
          targetAddress,
          message,
          30000, // 30 second timeout per requirement 10.20
        );

        this.logger.info('CREATE_REPLICA deliverWithAck returned', {
          partitionId: this.partitionId,
          replicaId,
          targetNodeId,
          resultStatus: result?.status,
          elapsedMs: Date.now() - startTime,
        });

        if (result.status === 'initiated' || result.status === 'already_exists') {
          this.logger.info('CREATE_REPLICA acknowledged via messageRouter', {
            partitionId: this.partitionId,
            replicaId,
            targetNodeId,
            status: result.status,
            elapsedMs: Date.now() - startTime,
          });

          // Update services table status to 'active' after successful ACK
          // The replica is now being created on the target node
          if (this.cdcIntegrationService && result.status === 'initiated') {
            this.cdcIntegrationService.updateSystemTableRow('services',
              {service_id: replicaId},
              {status: 'syncing', updated_at: Date.now()},
            ).catch((err) => {
              this.logger.error('Failed to update replica status to syncing', {
                partitionId: this.partitionId,
                replicaId,
                error: err.message,
              });
            });
          }

          this.emit('rebalancerAddReplica', {
            partitionId: this.partitionId,
            tableName: this.tableName,
            replicaId,
            targetNodeId,
            sourceNodeId: this.nodeId,
            acknowledged: true,
            status: result.status,
          });
        }
        return;
      } catch (error) {
        this.logger.error('CREATE_REPLICA failed via messageRouter', {
          partitionId: this.partitionId,
          tableName: this.tableName,
          replicaId,
          targetNodeId,
          error: error.message,
          errorStack: error.stack,
          elapsedMs: Date.now() - startTime,
        });

        // Update services table status to 'failed'
        if (this.cdcIntegrationService) {
          this.cdcIntegrationService.updateSystemTableRow('services',
            {service_id: replicaId},
            {status: 'failed', updated_at: Date.now()},
          ).catch((err) => {
            this.logger.error('Failed to update replica status to failed', {
              partitionId: this.partitionId,
              replicaId,
              error: err.message,
            });
          });
        }

        this.emit('rebalancerAddReplicaFailed', {
          partitionId: this.partitionId,
          replicaId,
          targetNodeId,
          error: error.message,
        });
        return;
      }
    }

    // No messageRouter available - this is an error condition
    // Requirements: 3.2, 7.4 - All messages must go through WebSocket (MessageRouter)
    this.logger.error('No messageRouter available for CREATE_REPLICA', {
      partitionId: this.partitionId,
      replicaId,
      targetNodeId,
    });

    this.emit('rebalancerAddReplicaFailed', {
      partitionId: this.partitionId,
      replicaId,
      targetNodeId,
      error: 'No messageRouter available',
    });
  }

  /**
   * Handle rebalancer removeReplica event.
   * Removes a replica from the specified node by sending REMOVE_REPLICA message.
   * Requirements: 10.10, 10.11, 10.20, 10.21
   * @param {Object} event - Remove replica event.
   * @private
   */
  async handleRebalancerRemoveReplica(event) {
    const {replicaId, nodeId: targetNodeId, requestId} = event;

    this.logger.info('Rebalancer requested replica removal - sending REMOVE_REPLICA', {
      partitionId: this.partitionId,
      entityId: event.entityId,
      replicaId,
      targetNodeId,
      requestId,
    });

    // Build REMOVE_REPLICA message per design spec
    const message = {
      type: 'REMOVE_REPLICA',
      request_id: requestId,
      partition_id: this.partitionId,
      replica_id: replicaId,
      reason: 'rebalancing',
      timestamp: Date.now(),
    };

    // Target the lifecycle handler on the target node using unified address format
    // Requirements: 1.1, 7.1 - Unified address format ${nodeId}/${entityType}/${entityId}
    const targetAddress = `${targetNodeId}/lifecycle/manager`;

    // Use messageRouter for cross-node delivery
    // This properly routes through WebSocket to reach remote nodes
    if (this.messageRouter) {
      try {
        const result = await this.deliverWithAck(
          this.messageRouter,
          targetAddress,
          message,
          30000, // 30 second timeout per requirement 10.20
        );

        if (result.status === 'initiated' || result.status === 'not_found') {
          this.logger.info('REMOVE_REPLICA acknowledged via messageRouter', {
            partitionId: this.partitionId,
            replicaId,
            targetNodeId,
            status: result.status,
          });

          // If replica was not found, mark the pending move as completed
          // This prevents the rebalancer from repeatedly trying to remove it
          if (result.status === 'not_found' && this.rebalancer) {
            this.rebalancer.completePendingMove(requestId, 'completed');
          }

          this.emit('rebalancerRemoveReplica', {
            partitionId: this.partitionId,
            tableName: this.tableName,
            replicaId,
            nodeId: targetNodeId,
            acknowledged: true,
            status: result.status,
          });
        }
        return;
      } catch (error) {
        this.logger.error('REMOVE_REPLICA failed via messageRouter', {
          partitionId: this.partitionId,
          replicaId,
          targetNodeId,
          error: error.message,
        });

        this.emit('rebalancerRemoveReplicaFailed', {
          partitionId: this.partitionId,
          replicaId,
          targetNodeId,
          error: error.message,
        });
        return;
      }
    }

    // No messageRouter available - this is an error condition
    // Requirements: 3.2, 7.4 - All messages must go through WebSocket (MessageRouter)
    this.logger.error('No messageRouter available for REMOVE_REPLICA', {
      partitionId: this.partitionId,
      replicaId,
      targetNodeId,
    });

    this.emit('rebalancerRemoveReplicaFailed', {
      partitionId: this.partitionId,
      replicaId,
      targetNodeId,
      error: 'No messageRouter available',
    });
  }

  /**
   * Extract ACK from transport response at any nesting level.
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

    // Search through nested result structures (for message group path)
    // This handles cases where the result is wrapped by transport layers
    let current = result;
    const maxDepth = 5; // Prevent infinite loops
    for (let i = 0; i < maxDepth && current; i++) {
      if (current.request_id === requestId) {
        return current;
      }
      // Check nested result
      if (current.result) {
        current = current.result;
      } else {
        break;
      }
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
  async deliverWithAck(transport, targetAddress, message, timeoutMs = 30000) {
    const requestId = message.request_id;

    this.logger.debug('Delivering message with ACK via PendingRequestTracker', {
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
        if (earlyRejection.message === 'Tracker shutdown') {
          this.logger.debug('Tracker shutdown during delivery - operation completed', {
            requestId,
            partitionId: this.partitionId,
          });
          // Return a synthetic ACK indicating the operation completed
          return {
            request_id: requestId,
            status: 'initiated',
            message: 'Replica removal completed (self-removal)',
          };
        }
        throw earlyRejection;
      }

      // Check if delivery failed (no connection, no handler, etc.)
      // Fail fast instead of waiting for timeout
      if (result && result.acknowledged === false) {
        const errorMsg = result.error || 'Delivery not acknowledged';
        this.logger.warn('Message delivery failed', {
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
        this.logger.debug('Received ACK in transport response', {
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
      if (error.message === 'Tracker shutdown') {
        this.logger.debug('Tracker shutdown during ACK wait - operation completed', {
          requestId,
          partitionId: this.partitionId,
        });
        return {
          request_id: requestId,
          status: 'initiated',
          message: 'Replica removal completed (self-removal)',
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
   * Shutdown the partition service.
   * @return {Promise<void>}
   */
  async shutdown() {
    this.logger.info('Shutting down partition service', {
      partitionId: this.partitionId,
      replicaId: this.replicaId,
    });

    // Stop liferaft instance
    if (this.raft) {
      this.raft.end();
      this.raft = null;
    }

    // Stop periodic size updates
    this.stopPeriodicSizeUpdates();

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
      this.transport.unregister(this.replicaId);
    }

    // Close database
    if (this.db) {
      this.db.close();
      this.db = null;
    }

    this.initialized = false;
    this.cdcSubscribers.clear();

    this.emit('shutdown', {
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
