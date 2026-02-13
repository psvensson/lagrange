/**
 * PartitionWorkerService - Partition replica running in worker process.
 *
 * Uses composable building blocks: RaftGroup, SQLiteStore, CDCEmitter,
 * and PeerAddressResolver. Extends ReplicaWorkerBase for lifecycle
 * management and IPC communication.
 *
 * @module worker/partition-worker-service
 * @see Requirements 1.1, 1.5, 1.9, 5.6 - Worker Process Isolation
 */

import {ReplicaWorkerBase} from './replica-worker-base.js';
import {
  WORKER_ENTITY_TYPE,
  LEADERSHIP_MESSAGE_TYPE,
  CDC_MESSAGE_TYPE,
  FACADE_MESSAGE_TYPE,
} from './worker-constants.js';
import {NUM} from '../constants/index.js';
import {RaftGroup} from '../raft/raft-group.js';
import {
  RAFT_GROUP_EVENT,
  RAFT_GROUP_ROLE,
} from '../raft/raft-group-constants.js';
import {PeerAddressResolver} from '../raft/peer-address-resolver.js';
import {SQLiteStore} from '../storage/sqlite-store.js';
import {CDCEmitter} from '../cdc/cdc-emitter.js';
import {SQLiteLogAdapter} from '../raft/sqlite-log-adapter.js';
import {HLCClockService} from '../hlc/hlc-clock-service.js';
import {isRaftPacket} from '../raft/raft-packet-utils.js';
const RAFT_PACKET_TYPE_APPEND_ACK = 'append ack';
const RAFT_PACKET_TYPE_APPEND_FAIL = 'append fail';

/**
 * Default configuration values for PartitionWorkerService.
 * @type {Readonly<Object>}
 */
const PARTITION_WORKER_DEFAULT = Object.freeze({
  MEMORY_DB_PATH: ':memory:',
  HEARTBEAT_MS: 150,
  ELECTION_MIN_MS: 1000,
  ELECTION_MAX_MS: 3000,
  ELECTION_JITTER_PER_REPLICA_MS: 500,
});

/**
 * Error messages for PartitionWorkerService.
 * @type {Readonly<Object>}
 */
const PARTITION_WORKER_ERROR_MSG = Object.freeze({
  NOT_INITIALIZED: 'PartitionWorkerService not initialized',
  MISSING_PARTITION_ID: 'partitionId is required',
  MISSING_TABLE_ID: 'tableId is required',
  QUERY_FAILED: 'Query execution failed',
  CDC_DELIVERY_FAILED: 'Failed to deliver CDC event',
});

/**
 * Log messages for PartitionWorkerService.
 * @type {Readonly<Object>}
 */
const PARTITION_WORKER_LOG_MSG = Object.freeze({
  INITIALIZING_SQLITE:
    'Initializing SQLite database for partition worker',
  SQLITE_INITIALIZED:
    'SQLite database initialized for partition worker',
  INITIALIZING_RAFT: 'Initializing Raft for partition worker',
  RAFT_INITIALIZED: 'Raft initialized for partition worker',
  BECAME_LEADER: 'Partition worker became leader',
  LEADER_CHANGED: 'Partition worker leader changed',
  EXECUTING_QUERY: 'Executing query on partition worker',
  QUERY_COMPLETED: 'Query completed on partition worker',
  STOPPING_CDC: 'Stopping CDCEmitter for partition worker',
  CDC_STOPPED: 'CDCEmitter stopped for partition worker',
  STOPPING_RAFT: 'Stopping Raft for partition worker',
  RAFT_STOPPED: 'Raft stopped for partition worker',
  CLOSING_SQLITE:
    'Closing SQLite database for partition worker',
  SQLITE_CLOSED:
    'SQLite database closed for partition worker',
  INITIALIZING_CDC:
    'Initializing CDCEmitter for partition worker',
  CDC_INITIALIZED:
    'CDCEmitter initialized for partition worker',
});

/**
 * PartitionWorkerService - Partition replica running in worker process.
 * Composes RaftGroup, SQLiteStore, CDCEmitter, and PeerAddressResolver.
 *
 * @extends ReplicaWorkerBase
 */
class PartitionWorkerService extends ReplicaWorkerBase {
  /**
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - Node ID where this replica runs.
   * @param {string} options.replicaId - Unique replica identifier.
   * @param {string} options.partitionId - Partition ID.
   * @param {string} options.tableId - Table ID this partition belongs to.
   * @param {string} [options.tableName] - Table name for CDC events.
   * @param {Object} [options.schema] - Table schema for SQLite creation.
   * @param {string} [options.dbPath] - SQLite database path.
   * @param {Array<string>} [options.replicaIds] - All replica IDs.
   * @param {Array<string>} [options.peerAddresses] - Peer unified addresses.
   * @param {Object} [options.addressManager] - AddressManager instance.
   * @param {Object} [options.systemTableCache] - SystemTableCache instance.
   * @param {boolean} [options.deferElection] - Defer election start.
   * @param {Object} [options.logger=console] - Logger instance.
   */
  constructor(options = {}) {
    if (!options.partitionId) {
      throw new Error(PARTITION_WORKER_ERROR_MSG.MISSING_PARTITION_ID);
    }
    if (!options.tableId) {
      throw new Error(PARTITION_WORKER_ERROR_MSG.MISSING_TABLE_ID);
    }

    super({
      nodeId: options.nodeId,
      entityType: WORKER_ENTITY_TYPE.PARTITION,
      replicaId: options.replicaId,
      logger: options.logger,
    });

    /** @type {string} Partition ID */
    this.partitionId = options.partitionId;

    /** @type {string} Table ID */
    this.tableId = options.tableId;

    /** @type {string} Table name for CDC events */
    this.tableName = options.tableName || options.tableId;

    /** @type {Object|null} Table schema */
    this.schema = options.schema || null;

    /** @type {string} SQLite database path */
    this.dbPath = options.dbPath ||
      PARTITION_WORKER_DEFAULT.MEMORY_DB_PATH;

    /** @type {Array<string>} All replica IDs in the group */
    this.replicaIds = options.replicaIds || [options.replicaId];

    /** @type {Array<string>} Peer unified addresses */
    this.peerAddresses = options.peerAddresses || [];

    /** @type {Object|null} AddressManager instance */
    this.addressManager = options.addressManager || null;

    /** @type {Object|null} SystemTableCache instance */
    this.systemTableCache = options.systemTableCache || null;

    /** @type {boolean} Defer election start */
    this.deferElection = options.deferElection || false;

    // Composable building blocks (initialized in onInitialize)
    /** @type {SQLiteStore|null} */
    this.sqliteStore = null;
    /** @type {RaftGroup|null} */
    this.raftGroup = null;
    /** @type {CDCEmitter|null} */
    this.cdcEmitter = null;
    /** @type {PeerAddressResolver|null} */
    this.peerAddressResolver = null;
    /** @type {SQLiteLogAdapter|null} */
    this.logAdapter = null;
    /** @type {HLCClockService|null} */
    this.hlcClock = null;

    /** @type {Set<string>} CDC subscriber addresses */
    this.cdcSubscribers = new Set();

    /** @type {Function|null} CDC forwarder subscribed to CDCEmitter */
    this.cdcSubscriberForwarder = null;
  }

  /**
   * Initialize partition with SQLiteStore, RaftGroup, and CDCEmitter.
   * Called by ReplicaWorkerBase.initialize() via onInitialize hook.
   * Order: SQLiteStore → RaftGroup → CDCEmitter
   * @return {Promise<void>}
   * @protected
   */
  async onInitialize() {
    // 1. Initialize SQLiteStore
    this.logger.info(PARTITION_WORKER_LOG_MSG.INITIALIZING_SQLITE, {
      partitionId: this.partitionId,
      replicaId: this.replicaId,
      dbPath: this.dbPath,
    });

    this.sqliteStore = new SQLiteStore({
      dbPath: this.dbPath,
      schema: this.schema,
      tableName: this.tableName,
      logger: this.logger,
    });
    this.sqliteStore.initialize();

    this.logger.info(PARTITION_WORKER_LOG_MSG.SQLITE_INITIALIZED, {
      partitionId: this.partitionId,
      replicaId: this.replicaId,
    });

    // 2. Initialize RaftGroup
    await this.initializeRaft();

    // 3. Initialize CDCEmitter
    this.initializeCDC();
  }

  /**
   * Initialize Raft consensus via RaftGroup composition.
   * @return {Promise<void>}
   * @private
   */
  async initializeRaft() {
    this.logger.info(PARTITION_WORKER_LOG_MSG.INITIALIZING_RAFT, {
      partitionId: this.partitionId,
      replicaId: this.replicaId,
      replicaCount: this.replicaIds.length,
    });

    // Create SQLite log adapter from the store's database
    this.logAdapter = new SQLiteLogAdapter(
      this.sqliteStore.getDatabase(),
    );

    // Create PeerAddressResolver
    this.peerAddressResolver = new PeerAddressResolver({
      addressManager: this.addressManager,
      systemTableCache: this.systemTableCache,
      entityType: WORKER_ENTITY_TYPE.PARTITION,
      logger: this.logger,
    });

    // Create RaftGroup with all dependencies injected
    this.raftGroup = new RaftGroup({
      replicaId: this.replicaId,
      replicaIds: this.replicaIds,
      transport: this.messageBridge,
      entityType: WORKER_ENTITY_TYPE.PARTITION,
      peerAddressResolver: this.peerAddressResolver,
      unifiedAddress: this.unifiedAddress,
      peerAddresses: this.peerAddresses,
      logAdapter: this.logAdapter,
      deferElection: this.deferElection,
      heartbeatMs: PARTITION_WORKER_DEFAULT.HEARTBEAT_MS,
      electionMinMs: PARTITION_WORKER_DEFAULT.ELECTION_MIN_MS,
      electionMaxMs: PARTITION_WORKER_DEFAULT.ELECTION_MAX_MS,
      electionJitterPerReplicaMs:
        PARTITION_WORKER_DEFAULT.ELECTION_JITTER_PER_REPLICA_MS,
      logger: this.logger,
    });

    // Wire RaftGroup events
    this.wireRaftGroupEvents();

    // Initialize and join peers
    this.raftGroup.initialize();
    this.raftGroup.joinPeers();
    if (this.replicaIds.length === NUM.ONE) {
      this.raftGroup.startElection();
    }

    this.logger.info(PARTITION_WORKER_LOG_MSG.RAFT_INITIALIZED, {
      partitionId: this.partitionId,
      replicaId: this.replicaId,
    });
  }

  /**
   * Wire RaftGroup events to partition-specific handlers.
   * @private
   */
  wireRaftGroupEvents() {
    this.raftGroup.on(RAFT_GROUP_EVENT.LEADER, (info) => {
      this.logger.info(PARTITION_WORKER_LOG_MSG.BECAME_LEADER, {
        partitionId: this.partitionId,
        replicaId: this.replicaId,
        term: info.term,
      });
    });

    this.raftGroup.on(RAFT_GROUP_EVENT.LEADER_CHANGE, (newLeader) => {
      this.logger.info(PARTITION_WORKER_LOG_MSG.LEADER_CHANGED, {
        partitionId: this.partitionId,
        replicaId: this.replicaId,
        newLeader,
      });
    });

    this.raftGroup.on(RAFT_GROUP_EVENT.COMMIT, (command) => {
      this.handleCommittedEntry(command);
    });
  }

  /**
   * Initialize CDCEmitter for change data capture.
   * @private
   */
  initializeCDC() {
    this.logger.info(PARTITION_WORKER_LOG_MSG.INITIALIZING_CDC, {
      partitionId: this.partitionId,
      replicaId: this.replicaId,
    });

    this.hlcClock = new HLCClockService(this.nodeId);

    this.cdcEmitter = new CDCEmitter({
      partitionId: this.partitionId,
      replicaId: this.replicaId,
      tableName: this.tableName,
      hlcClock: this.hlcClock,
      logger: this.logger,
    });

    this.logger.info(PARTITION_WORKER_LOG_MSG.CDC_INITIALIZED, {
      partitionId: this.partitionId,
      replicaId: this.replicaId,
    });
  }

  /**
   * Handle committed Raft entry.
   * Applies the command to the local SQLite store.
   * @param {Object|string} command - Committed Raft log entry command.
   * @private
   */
  handleCommittedEntry(command) {
    if (!command) {
      return;
    }

    const parsed = typeof command === 'string' ?
      JSON.parse(command) : command;

    if (parsed.sql && this.sqliteStore) {
      const result = this.sqliteStore.executeQuery(
        parsed.sql,
        parsed.params || [],
      );

      // Generate CDC event for write operations
      if (this.cdcEmitter && parsed.sql) {
        this.cdcEmitter.emitFromSQL(
          parsed.sql,
          parsed.params || [],
          result,
        ).catch((error) => {
          this.logger.error(
            PARTITION_WORKER_ERROR_MSG.CDC_DELIVERY_FAILED,
            {
              partitionId: this.partitionId,
              error: error.message,
            },
          );
        });
      }
    }
  }

  /**
   * Start the partition service.
   * Called by ReplicaWorkerBase.start() via onStart hook.
   * @return {Promise<void>}
   * @protected
   */
  async onStart() {
    // Start election if not deferred
    if (!this.deferElection && this.raftGroup) {
      this.raftGroup.startElection();
    }
  }

  /**
   * Stop the partition service.
   * Shutdown order: CDCEmitter → RaftGroup → SQLiteStore (reverse of init).
   * Called by ReplicaWorkerBase.stop() via onStop hook.
   * @return {Promise<void>}
   * @protected
   */
  async onStop() {
    // 1. Shutdown CDCEmitter
    if (this.cdcEmitter) {
      this.removeCDCForwarder();

      this.logger.info(PARTITION_WORKER_LOG_MSG.STOPPING_CDC, {
        partitionId: this.partitionId,
        replicaId: this.replicaId,
      });
      this.cdcEmitter.shutdown();
      this.cdcEmitter = null;
      this.logger.info(PARTITION_WORKER_LOG_MSG.CDC_STOPPED, {
        partitionId: this.partitionId,
        replicaId: this.replicaId,
      });
    }

    // 2. Shutdown RaftGroup
    if (this.raftGroup) {
      this.logger.info(PARTITION_WORKER_LOG_MSG.STOPPING_RAFT, {
        partitionId: this.partitionId,
        replicaId: this.replicaId,
      });
      await this.raftGroup.shutdown();
      this.raftGroup = null;
      this.logger.info(PARTITION_WORKER_LOG_MSG.RAFT_STOPPED, {
        partitionId: this.partitionId,
        replicaId: this.replicaId,
      });
    }

    // Close log adapter
    if (this.logAdapter) {
      this.logAdapter.close();
      this.logAdapter = null;
    }

    // 3. Close SQLiteStore
    if (this.sqliteStore) {
      this.logger.info(PARTITION_WORKER_LOG_MSG.CLOSING_SQLITE, {
        partitionId: this.partitionId,
        replicaId: this.replicaId,
      });
      this.sqliteStore.close();
      this.sqliteStore = null;
      this.logger.info(PARTITION_WORKER_LOG_MSG.SQLITE_CLOSED, {
        partitionId: this.partitionId,
        replicaId: this.replicaId,
      });
    }

    this.cdcSubscribers.clear();
    this.cdcSubscriberForwarder = null;
  }

  /**
   * Handle incoming message from MessageRouter.
   * Routes Raft packets to RaftGroup, handles queries and CDC.
   * @param {Object} message - Incoming message.
   * @return {Promise<Object>} Response.
   */
  async handleMessage(message) {
    // Handle Raft packets via RaftGroup
    if (isRaftPacket(message) ||
      message?.type === RAFT_PACKET_TYPE_APPEND_ACK ||
      message?.type === RAFT_PACKET_TYPE_APPEND_FAIL) {
      return this.handleRaftPacket(message);
    }

    // Handle SQL query execution
    if (message.type === FACADE_MESSAGE_TYPE.QUERY ||
      message.type === FACADE_MESSAGE_TYPE.EXECUTE_QUERY) {
      return this.handleQuery(message);
    }

    // Handle CDC subscription
    if (message.type === CDC_MESSAGE_TYPE.SUBSCRIBE_CDC) {
      return this.handleCDCSubscribe(message);
    }

    // Handle CDC unsubscription
    if (message.type === CDC_MESSAGE_TYPE.UNSUBSCRIBE_CDC) {
      return this.handleCDCUnsubscribe(message);
    }

    // Handle leadership status query
    if (message.type ===
      LEADERSHIP_MESSAGE_TYPE.GET_LEADERSHIP_STATUS) {
      return this.handleGetLeadershipStatus();
    }

    // Handle start election request
    if (message.type === 'START_ELECTION') {
      return this.handleStartElection();
    }

    return super.handleMessage(message);
  }

  /**
   * Handle incoming Raft packet via RaftGroup.
   * @param {Object} packet - Raft packet from peer.
   * @return {Object} Acknowledgment result.
   * @private
   */
  handleRaftPacket(packet) {
    if (!this.raftGroup) {
      return {acknowledged: false, error: PARTITION_WORKER_ERROR_MSG.NOT_INITIALIZED};
    }
    const result = this.raftGroup.handleRaftPacket(packet);
    return result || {acknowledged: false};
  }

  /**
   * Handle SQL query execution request.
   * @param {Object} message - Query message with sql and params.
   * @return {Object} Query result.
   * @private
   */
  async handleQuery(message) {
    if (!this.sqliteStore) {
      return {
        error: PARTITION_WORKER_ERROR_MSG.NOT_INITIALIZED,
      };
    }

    this.logger.debug(PARTITION_WORKER_LOG_MSG.EXECUTING_QUERY, {
      partitionId: this.partitionId,
      replicaId: this.replicaId,
    });

    try {
      const result = this.sqliteStore.executeQuery(
        message.sql,
        message.params || [],
      );

      this.logger.debug(PARTITION_WORKER_LOG_MSG.QUERY_COMPLETED, {
        partitionId: this.partitionId,
        replicaId: this.replicaId,
      });

      if (this.cdcEmitter && message.sql) {
        await this.cdcEmitter.emitFromSQL(
          message.sql,
          message.params || [],
          result,
        );
      }

      return {status: 'ok', result};
    } catch (error) {
      this.logger.error(PARTITION_WORKER_ERROR_MSG.QUERY_FAILED, {
        partitionId: this.partitionId,
        error: error.message,
      });
      return {error: error.message};
    }
  }

  /**
   * Handle CDC subscribe request.
   * @param {Object} message - Subscribe message with subscriberAddress.
   * @return {Object} Response.
   * @private
   */
  handleCDCSubscribe(message) {
    const subscriberAddress = message.subscriberAddress;
    this.cdcSubscribers.add(subscriberAddress);
    this.ensureCDCForwarder();

    return {
      status: 'ok',
      partitionId: this.partitionId,
      replicaId: this.replicaId,
    };
  }

  /**
   * Handle CDC unsubscribe request.
   * @param {Object} message - Unsubscribe message with subscriberAddress.
   * @return {Object} Response.
   * @private
   */
  handleCDCUnsubscribe(message) {
    this.cdcSubscribers.delete(message.subscriberAddress);
    if (this.cdcSubscribers.size === NUM.ZERO) {
      this.removeCDCForwarder();
    }
    return {status: 'ok', replicaId: this.replicaId};
  }

  /**
   * Ensure a single CDC forwarder is attached to the CDC emitter.
   * @private
   */
  ensureCDCForwarder() {
    if (!this.cdcEmitter || !this.messageBridge || this.cdcSubscriberForwarder) {
      return;
    }

    this.cdcSubscriberForwarder = (event) => {
      const subscriberAddresses = Array.from(this.cdcSubscribers);
      for (const subscriberAddress of subscriberAddresses) {
        this.deliverCDCEventToSubscriber(subscriberAddress, event);
      }
    };

    this.cdcEmitter.subscribe(this.cdcSubscriberForwarder);
  }

  /**
   * Remove the CDC forwarder from the CDC emitter.
   * @private
   */
  removeCDCForwarder() {
    if (!this.cdcEmitter || !this.cdcSubscriberForwarder) {
      return;
    }
    this.cdcEmitter.unsubscribe(this.cdcSubscriberForwarder);
    this.cdcSubscriberForwarder = null;
  }

  /**
   * Deliver a CDC event to one subscriber address.
   * @param {string} subscriberAddress - Target subscriber address.
   * @param {Object} event - CDC event payload.
   * @private
   */
  deliverCDCEventToSubscriber(subscriberAddress, event) {
    if (!this.messageBridge) {
      return;
    }
    try {
      this.messageBridge.sendFireAndForget(subscriberAddress, {
        type: CDC_MESSAGE_TYPE.CDC_EVENT,
        cdcEvent: event,
      });
    } catch (error) {
      this.logger.error(
        PARTITION_WORKER_ERROR_MSG.CDC_DELIVERY_FAILED,
        {
          partitionId: this.partitionId,
          subscriberAddress,
          error: error.message,
        },
      );
    }
  }

  /**
   * Handle leadership status query.
   * @return {Object} Leadership status response.
   * @private
   */
  handleGetLeadershipStatus() {
    return {
      type: LEADERSHIP_MESSAGE_TYPE.LEADERSHIP_STATUS,
      isLeader: this.raftGroup ?
        this.raftGroup.isLeaderReplica() : false,
      term: this.raftGroup ?
        this.raftGroup.getCurrentTerm() : NUM.ZERO,
      leaderId: this.raftGroup ?
        this.raftGroup.getLeaderId() : null,
      replicaId: this.replicaId,
    };
  }

  /**
   * Handle start election request.
   * @return {Object} Response.
   * @private
   */
  handleStartElection() {
    if (this.raftGroup) {
      this.raftGroup.startElection();
    }
    return {status: 'ok', replicaId: this.replicaId};
  }

  /**
   * Execute a SQL query on this partition.
   * @param {string} sql - SQL statement.
   * @param {Array} [params=[]] - Query parameters.
   * @return {Object} Query result.
   */
  executeQuery(sql, params = []) {
    if (!this.sqliteStore) {
      throw new Error(PARTITION_WORKER_ERROR_MSG.NOT_INITIALIZED);
    }
    return this.sqliteStore.executeQuery(sql, params);
  }

  /**
   * Start Raft election.
   */
  startElection() {
    if (this.raftGroup) {
      this.raftGroup.startElection();
    }
  }

  /**
   * Get the current Raft role.
   * @return {string} Current role.
   */
  getRole() {
    return this.raftGroup ?
      this.raftGroup.getRole() : RAFT_GROUP_ROLE.FOLLOWER;
  }

  /**
   * Check if this replica is the leader.
   * @return {boolean} True if leader.
   */
  isLeaderReplica() {
    return this.raftGroup ?
      this.raftGroup.isLeaderReplica() : false;
  }

  /**
   * Get the current leader ID.
   * @return {string|null} Leader replica ID or null.
   */
  getLeaderId() {
    return this.raftGroup ?
      this.raftGroup.getLeaderId() : null;
  }

  /**
   * Get the current Raft term.
   * @return {number} Current term.
   */
  getCurrentTerm() {
    return this.raftGroup ?
      this.raftGroup.getCurrentTerm() : NUM.ZERO;
  }

  /**
   * Get the partition ID.
   * @return {string} Partition ID.
   */
  getPartitionId() {
    return this.partitionId;
  }

  /**
   * Get the table ID.
   * @return {string} Table ID.
   */
  getTableId() {
    return this.tableId;
  }

  /**
   * Get the SQLiteStore instance.
   * @return {SQLiteStore|null} SQLiteStore instance.
   */
  getSQLiteStore() {
    return this.sqliteStore;
  }

  /**
   * Get the CDCEmitter instance.
   * @return {CDCEmitter|null} CDCEmitter instance.
   */
  getCDCEmitter() {
    return this.cdcEmitter;
  }

  /**
   * Get the RaftGroup instance.
   * @return {RaftGroup|null} RaftGroup instance.
   */
  getRaftGroup() {
    return this.raftGroup;
  }

  /**
   * Get statistics about the partition worker.
   * @return {Object} Partition worker statistics.
   */
  getStats() {
    const baseStats = super.getStats();
    return {
      ...baseStats,
      partitionId: this.partitionId,
      tableId: this.tableId,
      role: this.getRole(),
      isLeader: this.isLeaderReplica(),
      leaderId: this.getLeaderId(),
      term: this.getCurrentTerm(),
      replicaCount: this.replicaIds.length,
      cdcSubscriberCount: this.cdcSubscribers.size,
    };
  }
}

export {
  PartitionWorkerService,
  PARTITION_WORKER_DEFAULT,
  PARTITION_WORKER_ERROR_MSG,
  PARTITION_WORKER_LOG_MSG,
};
