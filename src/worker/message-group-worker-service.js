/**
 * MessageGroupWorkerService - Message group replica running in worker process.
 *
 * Uses RaftGroup for composable Raft lifecycle management and
 * PeerAddressResolver for peer address resolution. Extends
 * ReplicaWorkerBase with message group functionality including
 * SQLite system cache management, Raft consensus, and CDC event
 * subscription/replication.
 *
 * @module worker/message-group-worker-service
 * @see Requirements 1.2, 1.9, 3.1, 4.1, 4.2
 */

import {ReplicaWorkerBase} from './replica-worker-base.js';
import {SQLiteSystemCache} from './sqlite-system-cache.js';
import {WORKER_ENTITY_TYPE} from './worker-constants.js';
import {NUM} from '../constants/index.js';
import {RaftGroup} from '../raft/raft-group.js';
import {
  RAFT_GROUP_EVENT,
  RAFT_GROUP_ROLE,
} from '../raft/raft-group-constants.js';
import {PeerAddressResolver} from '../raft/peer-address-resolver.js';
import {SQLiteLogAdapter} from '../raft/sqlite-log-adapter.js';
import Database from 'better-sqlite3';
import {WORKER_RAFT_RUNTIME_DEFAULT} from './worker-raft-runtime-defaults.js';
import {
  createMessageGroupWorkerServiceRuntimeMethods,
} from './message-group-worker-service-runtime-methods.js';
import {
  createMessageGroupWorkerServiceCDCMethods,
} from './message-group-worker-service-cdc-methods.js';
import {
  createMessageGroupWorkerServiceMessageMethods,
} from './message-group-worker-service-message-methods.js';

const LOCAL_STR_JOURNAL_MODE_WAL = 'journal_mode = WAL';
const LOCAL_STR_FA5IJ = 'MessageGroupWorkerService stopped before CDC commit';

/**
 * Default configuration values for MessageGroupWorkerService.
 * @type {Readonly<Object>}
 */
const MESSAGE_GROUP_WORKER_DEFAULT = Object.freeze({
  /** Default heartbeat interval in milliseconds */
  HEARTBEAT_MS: WORKER_RAFT_RUNTIME_DEFAULT.HEARTBEAT_MS,
  /** Default minimum election timeout in milliseconds */
  ELECTION_MIN_MS: WORKER_RAFT_RUNTIME_DEFAULT.ELECTION_MIN_MS,
  /** Default maximum election timeout in milliseconds */
  ELECTION_MAX_MS: WORKER_RAFT_RUNTIME_DEFAULT.ELECTION_MAX_MS,
  /** Jitter added per replica index to stagger election timeouts */
  ELECTION_JITTER_PER_REPLICA_MS:
    WORKER_RAFT_RUNTIME_DEFAULT.ELECTION_JITTER_PER_REPLICA_MS,
  /** In-memory database path */
  MEMORY_DB_PATH: ':memory:',
  /** Maximum CDC relay hops when forwarding from stale follower targets */
  CDC_RELAY_MAX_HOPS: NUM.TWO,
  /** Max time to wait for one CDC entry to commit locally */
  RAFT_COMMIT_TIMEOUT_MS: 2000,
});

/**
 * Error messages for MessageGroupWorkerService.
 * @type {Readonly<Object>}
 */
const MESSAGE_GROUP_WORKER_ERROR_MSG = Object.freeze({
  NOT_INITIALIZED: 'MessageGroupWorkerService not initialized',
  MISSING_GROUP_ID: 'groupId is required',
  CDC_SUBSCRIPTION_FAILED: 'Failed to subscribe to CDC events',
  CDC_UNSUBSCRIPTION_FAILED: 'Failed to unsubscribe from CDC events',
  CDC_APPLY_FAILED: 'Failed to apply CDC event',
  NOT_LEADER: 'Only leader can subscribe to CDC events',
  SEED_CACHE_NOT_BOOTSTRAP_PHASE:
    'SEED_CACHE rejected: not in bootstrap phase',
  SEED_CACHE_MISSING_ENTRIES:
    'SEED_CACHE rejected: entries array is required',
  SEED_CACHE_APPLY_FAILED: 'Failed to apply SEED_CACHE entry',
  RAFT_COMMIT_TIMEOUT: 'Raft commit timeout',
});

/**
 * Log messages for MessageGroupWorkerService.
 * @type {Readonly<Object>}
 */
const MESSAGE_GROUP_WORKER_LOG_MSG = Object.freeze({
  INITIALIZING_CACHE:
    'Initializing SQLite system cache for message group worker',
  CACHE_INITIALIZED:
    'SQLite system cache initialized for message group worker',
  INITIALIZING_RAFT:
    'Initializing Raft for message group worker',
  RAFT_INITIALIZED:
    'Raft initialized for message group worker',
  BECAME_LEADER: 'Message group worker became leader',
  LEADER_CHANGED: 'Message group worker leader changed',
  SUBSCRIBING_CDC:
    'Subscribing to CDC events from partition leaders',
  SUBSCRIBED_CDC:
    'Subscribed to CDC events from partition leaders',
  UNSUBSCRIBING_CDC: 'Unsubscribing from CDC events',
  UNSUBSCRIBED_CDC: 'Unsubscribed from CDC events',
  APPLYING_CDC_EVENT: 'Applying CDC event to system cache',
  CDC_EVENT_APPLIED: 'CDC event applied to system cache',
  REPLICATING_CDC:
    'Replicating CDC event to followers via Raft',
  CDC_REPLICATED: 'CDC event replicated to followers',
  STOPPING_RAFT: 'Stopping Raft for message group worker',
  RAFT_STOPPED: 'Raft stopped for message group worker',
  CLOSING_CACHE:
    'Closing SQLite system cache for message group worker',
  CACHE_CLOSED:
    'SQLite system cache closed for message group worker',
  SEED_CACHE_RECEIVED: 'SEED_CACHE message received',
  SEED_CACHE_APPLYING:
    'Applying SEED_CACHE entries to system cache',
  SEED_CACHE_ENTRY_APPLIED: 'SEED_CACHE entry applied',
  SEED_CACHE_REPLICATING:
    'Replicating SEED_CACHE entries via Raft',
  SEED_CACHE_COMPLETED: 'SEED_CACHE completed successfully',
  SEED_CACHE_REJECTED: 'SEED_CACHE rejected',
  BOOTSTRAP_PHASE_UPDATED: 'Bootstrap phase updated',
});

/**
 * CDC replication entry type for Raft log.
 * @type {string}
 */
const CDC_REPLICATION_TYPE = 'CDC_REPLICATION';
const INSERT_SQL_COLUMNS_PATTERN = new RegExp(
  '^\\s*INSERT(?:\\s+OR\\s+REPLACE)?\\s+INTO\\s+' +
    '(?:"([^"]+)"|`([^`]+)`|([A-Za-z_][A-Za-z0-9_]*))\\s*\\(([^)]+)\\)',
  'i',
);

const MESSAGE_GROUP_WORKER_SERVICE_RUNTIME_METHODS =
  createMessageGroupWorkerServiceRuntimeMethods({
    getBaseWorkerStats: (workerService) =>
      ReplicaWorkerBase.prototype.getStats.call(workerService),
    INSERT_SQL_COLUMNS_PATTERN,
    MESSAGE_GROUP_WORKER_LOG_MSG,
    NUM,
    RAFT_GROUP_ROLE,
  });

const MESSAGE_GROUP_WORKER_SERVICE_CDC_METHODS =
  createMessageGroupWorkerServiceCDCMethods({
    CDC_REPLICATION_TYPE,
    MESSAGE_GROUP_WORKER_DEFAULT,
    MESSAGE_GROUP_WORKER_ERROR_MSG,
    MESSAGE_GROUP_WORKER_LOG_MSG,
  });

const MESSAGE_GROUP_WORKER_SERVICE_MESSAGE_METHODS =
  createMessageGroupWorkerServiceMessageMethods({
    handleBaseWorkerMessage: (workerService, message) =>
      ReplicaWorkerBase.prototype.handleMessage.call(workerService, message),
    MESSAGE_GROUP_WORKER_DEFAULT,
    MESSAGE_GROUP_WORKER_ERROR_MSG,
    MESSAGE_GROUP_WORKER_LOG_MSG,
  });

/**
 * MessageGroupWorkerService - Message group replica running in worker
 * process. Composes RaftGroup and PeerAddressResolver for Raft
 * lifecycle management.
 *
 * @extends ReplicaWorkerBase
 */
class MessageGroupWorkerService extends ReplicaWorkerBase {
  /**
   * Create a new MessageGroupWorkerService instance.
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - Node ID where this replica runs.
   * @param {string} options.replicaId - Unique replica identifier.
   * @param {string} options.groupId - Message group ID.
   * @param {Array<string>} [options.replicaIds] - All replica IDs.
   * @param {Array<string>} [options.peerAddresses] - Peer addresses.
   * @param {Object} [options.addressManager] - AddressManager instance.
   * @param {Object} [options.systemTableCache] - SystemTableCache.
   * @param {Object} [options.logger=console] - Logger instance.
   */
  constructor(options = {}) {
    if (!options.groupId) {
      throw new Error(
        MESSAGE_GROUP_WORKER_ERROR_MSG.MISSING_GROUP_ID,
      );
    }

    super({
      nodeId: options.nodeId,
      entityType: WORKER_ENTITY_TYPE.MESSAGE_GROUP,
      replicaId: options.replicaId,
      logger: options.logger,
    });

    /** @type {string} Message group ID */
    this.groupId = options.groupId;

    /** @type {Array<string>} All replica IDs in the group */
    this.replicaIds = options.replicaIds || [options.replicaId];

    /** @type {Array<string>} Peer unified addresses */
    this.peerAddresses = options.peerAddresses || [];

    /** @type {boolean} Whether to defer election start until explicitly armed */
    this.deferElection = options.deferElection === true;

    /** @type {Object|null} AddressManager instance */
    this.addressManager = options.addressManager || null;

    /** @type {Object|null} SystemTableCache instance */
    this.systemTableCache = options.systemTableCache || null;

    /** @type {SQLiteSystemCache|null} System cache instance */
    this.systemCache = null;

    /** @type {Database|null} SQLite database for Raft log */
    this.logDb = null;

    /** @type {SQLiteLogAdapter|null} Raft log adapter */
    this.logAdapter = null;

    // Composable building blocks (initialized in onInitialize)
    /** @type {RaftGroup|null} */
    this.raftGroup = null;
    /** @type {PeerAddressResolver|null} */
    this.peerAddressResolver = null;

    /** @type {Set<string>} Active CDC subscriptions */
    this.cdcSubscriptions = new Set();

    /** @type {boolean} Whether CDC subscriptions are active */
    this.cdcSubscribed = false;

    /** @type {boolean} Whether leader activation has completed */
    this.leaderActivated = false;

    /** @type {Map<string, Object>} Pending CDC commits keyed by entry ID */
    this.pendingCDCCommits = new Map();

    /** @type {number} Monotonic counter for CDC commit correlation IDs */
    this.nextCDCCommitId = NUM.ZERO;

    /**
     * Whether the service is in bootstrap phase.
     * During bootstrap phase, SEED_CACHE messages are accepted.
     * @type {boolean}
     */
    this.bootstrapPhase = true;
  }

  /**
   * Initialize message group with SQLite cache and RaftGroup.
   * Called by ReplicaWorkerBase.initialize() via onInitialize hook.
   * @return {Promise<void>}
   * @protected
   */
  async onInitialize() {
    this.logger.info(MESSAGE_GROUP_WORKER_LOG_MSG.INITIALIZING_CACHE, {
      groupId: this.groupId,
      replicaId: this.replicaId,
    });

    // Create and initialize SQLite system cache
    this.systemCache = new SQLiteSystemCache();
    this.systemCache.initialize();

    this.logger.info(MESSAGE_GROUP_WORKER_LOG_MSG.CACHE_INITIALIZED, {
      groupId: this.groupId,
      replicaId: this.replicaId,
    });

    // Initialize Raft via RaftGroup composition
    await this.initializeRaft();
  }

  /**
   * Initialize Raft consensus via RaftGroup composition.
   * @return {Promise<void>}
   * @private
   */
  async initializeRaft() {
    this.logger.info(MESSAGE_GROUP_WORKER_LOG_MSG.INITIALIZING_RAFT, {
      groupId: this.groupId,
      replicaId: this.replicaId,
      replicaCount: this.replicaIds.length,
    });

    // Create in-memory SQLite database for Raft log
    this.logDb = new Database(
      MESSAGE_GROUP_WORKER_DEFAULT.MEMORY_DB_PATH,
    );
    this.logDb.pragma(LOCAL_STR_JOURNAL_MODE_WAL);

    // Create SQLite log adapter for liferaft
    this.logAdapter = new SQLiteLogAdapter(this.logDb);

    // Create PeerAddressResolver
    this.peerAddressResolver = new PeerAddressResolver({
      addressManager: this.addressManager,
      systemTableCache: this.systemTableCache,
      entityType: WORKER_ENTITY_TYPE.MESSAGE_GROUP,
      logger: this.logger,
    });

    // Create RaftGroup with all dependencies injected
    this.raftGroup = new RaftGroup({
      replicaId: this.replicaId,
      replicaIds: this.replicaIds,
      transport: this.messageBridge,
      entityType: WORKER_ENTITY_TYPE.MESSAGE_GROUP,
      peerAddressResolver: this.peerAddressResolver,
      unifiedAddress: this.unifiedAddress,
      peerAddresses: this.peerAddresses,
      logAdapter: this.logAdapter,
      deferElection: this.deferElection,
      heartbeatMs:
        MESSAGE_GROUP_WORKER_DEFAULT.HEARTBEAT_MS,
      electionMinMs:
        MESSAGE_GROUP_WORKER_DEFAULT.ELECTION_MIN_MS,
      electionMaxMs:
        MESSAGE_GROUP_WORKER_DEFAULT.ELECTION_MAX_MS,
      electionJitterPerReplicaMs:
        MESSAGE_GROUP_WORKER_DEFAULT.ELECTION_JITTER_PER_REPLICA_MS,
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

    this.logger.info(MESSAGE_GROUP_WORKER_LOG_MSG.RAFT_INITIALIZED, {
      groupId: this.groupId,
      replicaId: this.replicaId,
    });
  }

  /**
   * Wire RaftGroup events to message-group-specific handlers.
   * @private
   */
  wireRaftGroupEvents() {
    this.raftGroup.on(RAFT_GROUP_EVENT.LEADER, () => {
      const wasLeaderActivated = this.leaderActivated;
      this.leaderActivated = true;

      this.logger.info(MESSAGE_GROUP_WORKER_LOG_MSG.BECAME_LEADER, {
        groupId: this.groupId,
        replicaId: this.replicaId,
      });

      if (!wasLeaderActivated && !this.cdcSubscribed) {
        this.subscribeToCDC().catch((error) => {
          this.logger.error(
            MESSAGE_GROUP_WORKER_ERROR_MSG.CDC_SUBSCRIPTION_FAILED,
            {
              groupId: this.groupId,
              replicaId: this.replicaId,
              error: error.message,
            },
          );
        });
      }
    });

    this.raftGroup.on(RAFT_GROUP_EVENT.FOLLOWER, () => {
      this.leaderActivated = false;
      const wasLeader = this.cdcSubscribed;

      if (wasLeader) {
        this.unsubscribeFromCDC().catch((error) => {
          this.logger.error(
            MESSAGE_GROUP_WORKER_ERROR_MSG.CDC_UNSUBSCRIPTION_FAILED,
            {
              groupId: this.groupId,
              replicaId: this.replicaId,
              error: error.message,
            },
          );
        });
      }
    });

    this.raftGroup.on(RAFT_GROUP_EVENT.CANDIDATE, () => {
      this.leaderActivated = false;
      const wasLeader = this.cdcSubscribed;

      if (wasLeader) {
        this.unsubscribeFromCDC().catch((error) => {
          this.logger.error(
            MESSAGE_GROUP_WORKER_ERROR_MSG.CDC_UNSUBSCRIPTION_FAILED,
            {
              groupId: this.groupId,
              replicaId: this.replicaId,
              error: error.message,
            },
          );
        });
      }
    });

    this.raftGroup.on(RAFT_GROUP_EVENT.LEADER_CHANGE, (newLeader) => {
      this.leaderActivated = false;
      const wasLeader = this.cdcSubscribed;
      const isNowLeader =
        newLeader === this.unifiedAddress;

      this.logger.info(
        MESSAGE_GROUP_WORKER_LOG_MSG.LEADER_CHANGED,
        {
          groupId: this.groupId,
          replicaId: this.replicaId,
          newLeader,
        },
      );

      if (!isNowLeader && wasLeader) {
        this.unsubscribeFromCDC().catch((error) => {
          this.logger.error(
            MESSAGE_GROUP_WORKER_ERROR_MSG.CDC_UNSUBSCRIPTION_FAILED,
            {
              groupId: this.groupId,
              replicaId: this.replicaId,
              error: error.message,
            },
          );
        });
      }
    });

    // Handle committed entries (for CDC replication)
    this.raftGroup.on(RAFT_GROUP_EVENT.COMMIT, (entry) => {
      this.handleCommittedEntry(entry).catch((error) => {
        this.logger.error(
          MESSAGE_GROUP_WORKER_ERROR_MSG.CDC_APPLY_FAILED,
          {
            groupId: this.groupId,
            replicaId: this.replicaId,
            error: error.message,
          },
        );
      });
    });
  }

  /**
   * Handle committed Raft entry.
   * Applies CDC events to local cache when committed.
   * @param {Object|string} entry - Committed Raft log entry.
   * @return {Promise<void>}
   * @private
   */
  async handleCommittedEntry(entry) {
    if (!entry) {
      return;
    }

    const command = typeof entry === 'string' ?
      JSON.parse(entry) : entry;

    // Handle wrapped entry format (entry.command)
    const data = command.command ?
      (typeof command.command === 'string' ?
        JSON.parse(command.command) : command.command) :
      command;

    if (data.type === CDC_REPLICATION_TYPE) {
      // Apply CDC event to local cache
      this.applyCacheMutation(
        data.tableName,
        data.operation,
        data.data,
      );

      this.resolvePendingCDCCommit(data.entryId);

      this.logger.debug(
        MESSAGE_GROUP_WORKER_LOG_MSG.CDC_EVENT_APPLIED,
        {
          groupId: this.groupId,
          replicaId: this.replicaId,
          tableName: data.tableName,
          operation: data.operation,
        },
      );
    }
  }

  /**
   * Start the message group service.
   * Called by ReplicaWorkerBase.start() via onStart hook.
   * @return {Promise<void>}
   * @protected
   */
  async onStart() {
    if (this.isLeaderActivated() && !this.cdcSubscribed) {
      await this.subscribeToCDC();
    }
  }

  /**
   * Stop the message group service.
   * Shutdown order: CDC → RaftGroup → log adapter → log DB → cache.
   * Called by ReplicaWorkerBase.stop() via onStop hook.
   * @return {Promise<void>}
   * @protected
   */
  async onStop() {
    this.leaderActivated = false;

    // Unsubscribe from CDC events
    if (this.cdcSubscribed) {
      await this.unsubscribeFromCDC();
    }

    this.clearPendingCDCCommits(
      LOCAL_STR_FA5IJ,
    );

    // Shutdown RaftGroup
    if (this.raftGroup) {
      this.logger.info(MESSAGE_GROUP_WORKER_LOG_MSG.STOPPING_RAFT, {
        groupId: this.groupId,
        replicaId: this.replicaId,
      });

      await this.raftGroup.shutdown();
      this.raftGroup = null;

      this.logger.info(MESSAGE_GROUP_WORKER_LOG_MSG.RAFT_STOPPED, {
        groupId: this.groupId,
        replicaId: this.replicaId,
      });
    }

    // Close log adapter
    if (this.logAdapter) {
      this.logAdapter.close();
      this.logAdapter = null;
    }

    // Close log database
    if (this.logDb) {
      this.logDb.close();
      this.logDb = null;
    }

    // Close system cache
    if (this.systemCache) {
      this.logger.info(MESSAGE_GROUP_WORKER_LOG_MSG.CLOSING_CACHE, {
        groupId: this.groupId,
        replicaId: this.replicaId,
      });

      this.systemCache.close();
      this.systemCache = null;

      this.logger.info(MESSAGE_GROUP_WORKER_LOG_MSG.CACHE_CLOSED, {
        groupId: this.groupId,
        replicaId: this.replicaId,
      });
    }
  }

  /**
   * Get system cache for local queries.
   * @return {SQLiteSystemCache} Local system cache.
   */
  getSystemCache() {
    return this.systemCache;
  }

}

Object.assign(
  MessageGroupWorkerService.prototype,
  MESSAGE_GROUP_WORKER_SERVICE_RUNTIME_METHODS,
  MESSAGE_GROUP_WORKER_SERVICE_CDC_METHODS,
  MESSAGE_GROUP_WORKER_SERVICE_MESSAGE_METHODS,
);

export {
  MessageGroupWorkerService,
  MESSAGE_GROUP_WORKER_DEFAULT,
  MESSAGE_GROUP_WORKER_ERROR_MSG,
  MESSAGE_GROUP_WORKER_LOG_MSG,
  CDC_REPLICATION_TYPE,
};
