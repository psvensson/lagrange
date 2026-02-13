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
import {
  WORKER_ENTITY_TYPE,
  CACHE_MESSAGE_TYPE,
  LEADERSHIP_MESSAGE_TYPE,
  CDC_MESSAGE_TYPE,
  SEED_CACHE_MESSAGE_TYPE,
  FACADE_MESSAGE_TYPE,
  WORKER_ADDRESS,
  WORKER_RESPONSE_STATUS,
} from './worker-constants.js';
import {NUM} from '../constants/index.js';
import {RaftGroup} from '../raft/raft-group.js';
import {
  RAFT_GROUP_EVENT,
  RAFT_GROUP_ROLE,
} from '../raft/raft-group-constants.js';
import {PeerAddressResolver} from '../raft/peer-address-resolver.js';
import {SQLiteLogAdapter} from '../raft/sqlite-log-adapter.js';
import {isRaftPacket} from '../raft/raft-packet-utils.js';
import Database from 'better-sqlite3';

/**
 * Default configuration values for MessageGroupWorkerService.
 * @type {Readonly<Object>}
 */
const MESSAGE_GROUP_WORKER_DEFAULT = Object.freeze({
  /** Default heartbeat interval in milliseconds */
  HEARTBEAT_MS: 150,
  /** Default minimum election timeout in milliseconds */
  ELECTION_MIN_MS: 1000,
  /** Default maximum election timeout in milliseconds */
  ELECTION_MAX_MS: 3000,
  /** Jitter added per replica index to stagger election timeouts */
  ELECTION_JITTER_PER_REPLICA_MS: 500,
  /** In-memory database path */
  MEMORY_DB_PATH: ':memory:',
  /** Maximum CDC relay hops when forwarding from stale follower targets */
  CDC_RELAY_MAX_HOPS: NUM.TWO,
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
const INSERT_SQL_COLUMNS_PATTERN = /^\s*INSERT(?:\s+OR\s+REPLACE)?\s+INTO\s+(?:"([^"]+)"|`([^`]+)`|([A-Za-z_][A-Za-z0-9_]*))\s*\(([^)]+)\)/i;
const RAFT_PACKET_TYPE_APPEND_ACK = 'append ack';
const RAFT_PACKET_TYPE_APPEND_FAIL = 'append fail';

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
    this.logDb.pragma('journal_mode = WAL');

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
      deferElection: false,
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
      const wasLeader = this.raftGroup.isLeaderReplica() &&
        this.cdcSubscribed;

      this.logger.info(MESSAGE_GROUP_WORKER_LOG_MSG.BECAME_LEADER, {
        groupId: this.groupId,
        replicaId: this.replicaId,
      });

      // Subscribe to CDC events when becoming leader
      if (!wasLeader) {
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
      const wasLeader = this.cdcSubscribed;

      // Unsubscribe from CDC events when losing leadership
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
      const wasLeader = this.cdcSubscribed;

      // Unsubscribe from CDC events when losing leadership
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

      // Handle leadership transition
      if (isNowLeader && !wasLeader) {
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
      } else if (!isNowLeader && wasLeader) {
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
    // If already leader, subscribe to CDC
    if (this.isLeaderReplica() && !this.cdcSubscribed) {
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
    // Unsubscribe from CDC events
    if (this.cdcSubscribed) {
      await this.unsubscribeFromCDC();
    }

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
   * Subscribe to CDC events from partition leaders (leader only).
   * @param {Array<string>} [partitionAddresses] - Partition addresses.
   * @return {Promise<void>}
   */
  async subscribeToCDC(partitionAddresses = []) {
    if (this.cdcSubscribed) {
      return;
    }

    this.logger.info(MESSAGE_GROUP_WORKER_LOG_MSG.SUBSCRIBING_CDC, {
      groupId: this.groupId,
      replicaId: this.replicaId,
      isLeader: this.isLeaderReplica(),
      partitionCount: partitionAddresses.length,
    });

    // Send SUBSCRIBE_CDC messages to each partition address
    for (const partitionAddress of partitionAddresses) {
      try {
        if (this.messageBridge) {
          await this.messageBridge.send(partitionAddress, {
            type: CDC_MESSAGE_TYPE.SUBSCRIBE_CDC,
            subscriberAddress: this.unifiedAddress,
          });
          this.cdcSubscriptions.add(partitionAddress);
        }
      } catch (error) {
        this.logger.warn('Failed to subscribe to partition CDC', {
          groupId: this.groupId,
          partitionAddress,
          error: error.message,
        });
      }
    }

    this.cdcSubscribed = true;

    this.logger.info(MESSAGE_GROUP_WORKER_LOG_MSG.SUBSCRIBED_CDC, {
      groupId: this.groupId,
      replicaId: this.replicaId,
      subscriptionCount: this.cdcSubscriptions.size,
    });
  }

  /**
   * Unsubscribe from CDC events (when losing leadership).
   * @return {Promise<void>}
   */
  async unsubscribeFromCDC() {
    if (!this.cdcSubscribed) {
      return;
    }

    this.logger.info(MESSAGE_GROUP_WORKER_LOG_MSG.UNSUBSCRIBING_CDC, {
      groupId: this.groupId,
      replicaId: this.replicaId,
      subscriptionCount: this.cdcSubscriptions.size,
    });

    // Send UNSUBSCRIBE_CDC messages to each subscribed partition
    for (const partitionAddress of this.cdcSubscriptions) {
      try {
        if (this.messageBridge) {
          await this.messageBridge.send(partitionAddress, {
            type: CDC_MESSAGE_TYPE.UNSUBSCRIBE_CDC,
            subscriberAddress: this.unifiedAddress,
          });
        }
      } catch (error) {
        this.logger.warn(
          'Failed to unsubscribe from partition CDC',
          {
            groupId: this.groupId,
            partitionAddress,
            error: error.message,
          },
        );
      }
    }

    this.cdcSubscriptions.clear();
    this.cdcSubscribed = false;

    this.logger.info(MESSAGE_GROUP_WORKER_LOG_MSG.UNSUBSCRIBED_CDC, {
      groupId: this.groupId,
      replicaId: this.replicaId,
    });
  }

  /**
   * Apply CDC event to local cache and replicate to followers.
   * @param {Object} cdcEvent - CDC event from partition.
   * @param {string} cdcEvent.tableName - System table name.
   * @param {string} cdcEvent.operation - CDC operation.
   * @param {Object} cdcEvent.data - Record data.
   * @return {Promise<void>}
   */
  async applyCDCEvent(cdcEvent) {
    if (!this.initialized || !this.systemCache) {
      throw new Error(
        MESSAGE_GROUP_WORKER_ERROR_MSG.NOT_INITIALIZED,
      );
    }

    this.logger.debug(
      MESSAGE_GROUP_WORKER_LOG_MSG.APPLYING_CDC_EVENT,
      {
        groupId: this.groupId,
        replicaId: this.replicaId,
        tableName: cdcEvent.tableName,
        operation: cdcEvent.operation,
      },
    );

    if (this.isLeaderReplica()) {
      // Leader: replicate via Raft, then apply on commit
      await this.replicateCDCEvent(cdcEvent);
    } else {
      // Follower: apply directly
      this.applyCacheMutation(
        cdcEvent.tableName,
        cdcEvent.operation,
        cdcEvent.data,
      );
    }

    this.logger.debug(
      MESSAGE_GROUP_WORKER_LOG_MSG.CDC_EVENT_APPLIED,
      {
        groupId: this.groupId,
        replicaId: this.replicaId,
        tableName: cdcEvent.tableName,
        operation: cdcEvent.operation,
      },
    );
  }

  /**
   * Replicate CDC event to followers via Raft.
   * @param {Object} cdcEvent - CDC event to replicate.
   * @return {Promise<void>}
   * @private
   */
  async replicateCDCEvent(cdcEvent) {
    const raft = this.raftGroup ?
      this.raftGroup.getRaftInstance() : null;

    if (!raft) {
      throw new Error(
        MESSAGE_GROUP_WORKER_ERROR_MSG.NOT_INITIALIZED,
      );
    }

    this.logger.debug(
      MESSAGE_GROUP_WORKER_LOG_MSG.REPLICATING_CDC,
      {
        groupId: this.groupId,
        replicaId: this.replicaId,
        tableName: cdcEvent.tableName,
        operation: cdcEvent.operation,
      },
    );

    // Create Raft log entry for CDC replication
    const command = {
      type: CDC_REPLICATION_TYPE,
      tableName: cdcEvent.tableName,
      operation: cdcEvent.operation,
      data: cdcEvent.data,
      sourcePartitionId: cdcEvent.sourcePartitionId,
      hlcTimestamp: cdcEvent.hlcTimestamp,
      sequenceNumber: cdcEvent.sequenceNumber,
    };

    // Append to Raft log (will be replicated to followers)
    return new Promise((resolve, reject) => {
      raft.command(JSON.stringify(command), (error) => {
        if (error) {
          reject(error);
        } else {
          this.logger.debug(
            MESSAGE_GROUP_WORKER_LOG_MSG.CDC_REPLICATED,
            {
              groupId: this.groupId,
              replicaId: this.replicaId,
            },
          );
          resolve();
        }
      });
    });
  }

  /**
   * Get system cache for local queries.
   * @return {SQLiteSystemCache} Local system cache.
   */
  getSystemCache() {
    return this.systemCache;
  }

  /**
   * Handle incoming message from MessageRouter.
   * Detects Raft packets and routes them to RaftGroup.
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

    // Handle CDC event messages (from partition leaders)
    if (message.type === CDC_MESSAGE_TYPE.CDC_EVENT) {
      const cdcEvent = message.cdcEvent || message;
      // Avoid deadlock in single-thread worker pools:
      // leader-side CDC replication requires processing incoming append-ack
      // packets, so we must not block this handler waiting for quorum.
      if (this.isLeaderReplica()) {
        this.applyCDCEvent(cdcEvent).catch((error) => {
          this.logger.error(
            MESSAGE_GROUP_WORKER_ERROR_MSG.CDC_APPLY_FAILED,
            {
              groupId: this.groupId,
              replicaId: this.replicaId,
              tableName: cdcEvent.tableName,
              operation: cdcEvent.operation,
              error: error.message,
            },
          );
        });
        return {
          status: WORKER_RESPONSE_STATUS.OK,
          replicaId: this.replicaId,
        };
      } else {
        const leaderAddress = this.resolveLeaderAddress();
        const relayCount = Number(message.cdcRelayCount) || NUM.ZERO;
        if (leaderAddress &&
          leaderAddress !== this.unifiedAddress &&
          relayCount < MESSAGE_GROUP_WORKER_DEFAULT.CDC_RELAY_MAX_HOPS &&
          this.messageBridge) {
          try {
            this.messageBridge.sendFireAndForget(leaderAddress, {
              type: CDC_MESSAGE_TYPE.CDC_EVENT,
              cdcEvent,
              cdcRelayCount: relayCount + NUM.ONE,
            });
          } catch (error) {
            this.logger.warn(
              MESSAGE_GROUP_WORKER_ERROR_MSG.CDC_APPLY_FAILED,
              {
                groupId: this.groupId,
                replicaId: this.replicaId,
                leaderAddress,
                error: error.message,
              },
            );
          }
        }
        return {
          status: WORKER_RESPONSE_STATUS.OK,
          replicaId: this.replicaId,
          leaderAddress,
        };
      }
    }

    // Handle SEED_CACHE message (during bootstrap)
    if (message.type === SEED_CACHE_MESSAGE_TYPE.SEED_CACHE) {
      return this.handleSeedCache(message);
    }

    // Handle SET_BOOTSTRAP_PHASE message
    if (message.type ===
      SEED_CACHE_MESSAGE_TYPE.SET_BOOTSTRAP_PHASE) {
      return this.handleSetBootstrapPhase(message);
    }

    // Handle cache query messages
    if (message.type === CACHE_MESSAGE_TYPE.CACHE_GET) {
      return this.handleCacheGet(message);
    }

    if (message.type === CACHE_MESSAGE_TYPE.CACHE_QUERY) {
      return this.handleCacheQuery(message);
    }

    if (message.type === CACHE_MESSAGE_TYPE.CACHE_FILTER) {
      return this.handleCacheFilter(message);
    }

    if (message.type === CACHE_MESSAGE_TYPE.CACHE_GET_ALL) {
      return this.handleCacheGetAll(message);
    }

    // Handle leadership status query
    if (message.type ===
      LEADERSHIP_MESSAGE_TYPE.GET_LEADERSHIP_STATUS) {
      return this.handleGetLeadershipStatus();
    }

    // Handle facade START_ELECTION message
    if (message.type === FACADE_MESSAGE_TYPE.START_ELECTION) {
      return this.handleStartElection();
    }

    // Delegate to base class
    return super.handleMessage(message);
  }

  /**
   * Resolve the current leader to a unified address when possible.
   * @return {string|null} Leader unified address or null when unknown.
   * @private
   */
  resolveLeaderAddress() {
    const leaderId = this.getLeaderId();
    if (!leaderId || typeof leaderId !== 'string') {
      return null;
    }

    if (leaderId.includes(WORKER_ADDRESS.SEPARATOR)) {
      return leaderId;
    }

    if (leaderId === this.replicaId) {
      return this.unifiedAddress;
    }

    const matchedPeer = this.peerAddresses.find((address) =>
      address.endsWith(`${WORKER_ADDRESS.SEPARATOR}${leaderId}`),
    );
    return matchedPeer || null;
  }

  /**
   * Handle incoming Raft packet via RaftGroup.
   * @param {Object} packet - Raft packet from peer.
   * @return {Object} Acknowledgment result.
   * @private
   */
  handleRaftPacket(packet) {
    if (!this.raftGroup) {
      return {
        acknowledged: false,
        error: MESSAGE_GROUP_WORKER_ERROR_MSG.NOT_INITIALIZED,
      };
    }
    const result = this.raftGroup.handleRaftPacket(packet);
    return result || {acknowledged: false};
  }

  /**
   * Handle CACHE_GET message.
   * @param {Object} message - Cache get message.
   * @return {Object} Response with data.
   * @private
   */
  handleCacheGet(message) {
    if (!this.systemCache) {
      return {
        type: CACHE_MESSAGE_TYPE.CACHE_GET_RESPONSE,
        data: null,
        error: MESSAGE_GROUP_WORKER_ERROR_MSG.NOT_INITIALIZED,
      };
    }

    const data = this.systemCache.get(
      message.tableName,
      message.key,
    );
    return {
      type: CACHE_MESSAGE_TYPE.CACHE_GET_RESPONSE,
      data: data || null,
    };
  }

  /**
   * Handle CACHE_QUERY message.
   * @param {Object} message - Cache query message.
   * @return {Object} Response with rows.
   * @private
   */
  handleCacheQuery(message) {
    if (!this.systemCache) {
      return {
        type: CACHE_MESSAGE_TYPE.CACHE_QUERY_RESPONSE,
        rows: [],
        error: MESSAGE_GROUP_WORKER_ERROR_MSG.NOT_INITIALIZED,
      };
    }

    try {
      const rows = this.systemCache.query(
        message.sql,
        message.params || [],
      );
      return {
        type: CACHE_MESSAGE_TYPE.CACHE_QUERY_RESPONSE,
        rows,
      };
    } catch (error) {
      return {
        type: CACHE_MESSAGE_TYPE.CACHE_QUERY_RESPONSE,
        rows: [],
        error: error.message,
      };
    }
  }

  /**
   * Handle CACHE_FILTER message.
   * @param {Object} message - Cache filter message.
   * @return {Object} Response with records.
   * @private
   */
  handleCacheFilter(message) {
    if (!this.systemCache) {
      return {
        type: CACHE_MESSAGE_TYPE.CACHE_FILTER_RESPONSE,
        records: [],
        error: MESSAGE_GROUP_WORKER_ERROR_MSG.NOT_INITIALIZED,
      };
    }

    try {
      const predicateFn =
        new Function('return ' + message.predicateString)();
      const records = this.systemCache.filter(
        message.tableName,
        predicateFn,
      );
      return {
        type: CACHE_MESSAGE_TYPE.CACHE_FILTER_RESPONSE,
        records,
      };
    } catch (error) {
      return {
        type: CACHE_MESSAGE_TYPE.CACHE_FILTER_RESPONSE,
        records: [],
        error: error.message,
      };
    }
  }

  /**
   * Handle CACHE_GET_ALL message.
   * @param {Object} message - Cache get all message.
   * @return {Object} Response with records.
   * @private
   */
  handleCacheGetAll(message) {
    if (!this.systemCache) {
      return {
        type: CACHE_MESSAGE_TYPE.CACHE_GET_ALL_RESPONSE,
        records: [],
        error: MESSAGE_GROUP_WORKER_ERROR_MSG.NOT_INITIALIZED,
      };
    }

    const records = this.systemCache.getAll(message.tableName);
    return {
      type: CACHE_MESSAGE_TYPE.CACHE_GET_ALL_RESPONSE,
      records,
    };
  }

  /**
   * Handle GET_LEADERSHIP_STATUS message.
   * @return {Object} Response with leadership status.
   * @private
   */
  handleGetLeadershipStatus() {
    return {
      type: LEADERSHIP_MESSAGE_TYPE.LEADERSHIP_STATUS,
      isLeader: this.isLeaderReplica(),
      term: this.getCurrentTerm(),
      leaderId: this.getLeaderId(),
      replicaId: this.replicaId,
    };
  }

  /**
   * Handle START_ELECTION facade message.
   * Starts the Raft election timer via RaftGroup.
   * @return {Object} Response with status.
   * @private
   */
  handleStartElection() {
    if (this.raftGroup) {
      this.raftGroup.startElection();
    }
    return {status: 'ok', replicaId: this.replicaId};
  }

  /**
   * Handle SEED_CACHE message during bootstrap.
   * @param {Object} message - SEED_CACHE message.
   * @return {Promise<Object>} SEED_CACHE_RESPONSE.
   * @private
   */
  async handleSeedCache(message) {
    this.logger.info(
      MESSAGE_GROUP_WORKER_LOG_MSG.SEED_CACHE_RECEIVED,
      {
        groupId: this.groupId,
        replicaId: this.replicaId,
        entryCount: message.entries ?
          message.entries.length : NUM.ZERO,
        bootstrapPhase: message.bootstrapPhase,
      },
    );

    // Reject if not in bootstrap phase
    if (!this.bootstrapPhase) {
      this.logger.warn(
        MESSAGE_GROUP_WORKER_LOG_MSG.SEED_CACHE_REJECTED,
        {
          groupId: this.groupId,
          replicaId: this.replicaId,
          reason: MESSAGE_GROUP_WORKER_ERROR_MSG
            .SEED_CACHE_NOT_BOOTSTRAP_PHASE,
        },
      );
      return {
        type: SEED_CACHE_MESSAGE_TYPE.SEED_CACHE_RESPONSE,
        success: false,
        entriesApplied: NUM.ZERO,
        error: MESSAGE_GROUP_WORKER_ERROR_MSG
          .SEED_CACHE_NOT_BOOTSTRAP_PHASE,
      };
    }

    // Reject if bootstrapPhase flag in message is false
    if (!message.bootstrapPhase) {
      this.logger.warn(
        MESSAGE_GROUP_WORKER_LOG_MSG.SEED_CACHE_REJECTED,
        {
          groupId: this.groupId,
          replicaId: this.replicaId,
          reason: MESSAGE_GROUP_WORKER_ERROR_MSG
            .SEED_CACHE_NOT_BOOTSTRAP_PHASE,
        },
      );
      return {
        type: SEED_CACHE_MESSAGE_TYPE.SEED_CACHE_RESPONSE,
        success: false,
        entriesApplied: NUM.ZERO,
        error: MESSAGE_GROUP_WORKER_ERROR_MSG
          .SEED_CACHE_NOT_BOOTSTRAP_PHASE,
      };
    }

    // Validate entries array
    if (!message.entries || !Array.isArray(message.entries)) {
      this.logger.warn(
        MESSAGE_GROUP_WORKER_LOG_MSG.SEED_CACHE_REJECTED,
        {
          groupId: this.groupId,
          replicaId: this.replicaId,
          reason: MESSAGE_GROUP_WORKER_ERROR_MSG
            .SEED_CACHE_MISSING_ENTRIES,
        },
      );
      return {
        type: SEED_CACHE_MESSAGE_TYPE.SEED_CACHE_RESPONSE,
        success: false,
        entriesApplied: NUM.ZERO,
        error: MESSAGE_GROUP_WORKER_ERROR_MSG
          .SEED_CACHE_MISSING_ENTRIES,
      };
    }

    // Check if system cache is initialized
    if (!this.systemCache) {
      return {
        type: SEED_CACHE_MESSAGE_TYPE.SEED_CACHE_RESPONSE,
        success: false,
        entriesApplied: NUM.ZERO,
        error: MESSAGE_GROUP_WORKER_ERROR_MSG.NOT_INITIALIZED,
      };
    }

    this.logger.info(
      MESSAGE_GROUP_WORKER_LOG_MSG.SEED_CACHE_APPLYING,
      {
        groupId: this.groupId,
        replicaId: this.replicaId,
        entryCount: message.entries.length,
      },
    );

    let entriesApplied = NUM.ZERO;

    // Apply each entry to the system cache
    for (const entry of message.entries) {
      try {
        if (this.isLeaderReplica()) {
          this.logger.debug(
            MESSAGE_GROUP_WORKER_LOG_MSG.SEED_CACHE_REPLICATING,
            {
              groupId: this.groupId,
              replicaId: this.replicaId,
              tableName: entry.tableName,
              operation: entry.operation,
            },
          );

          await this.replicateCDCEvent({
            tableName: entry.tableName,
            operation: entry.operation,
            data: entry.data,
          });
        } else {
          this.systemCache.applyCDCEvent(
            entry.tableName,
            entry.operation,
            entry.data,
          );
        }

        entriesApplied++;

        this.logger.debug(
          MESSAGE_GROUP_WORKER_LOG_MSG.SEED_CACHE_ENTRY_APPLIED,
          {
            groupId: this.groupId,
            replicaId: this.replicaId,
            tableName: entry.tableName,
            operation: entry.operation,
            entriesApplied,
          },
        );
      } catch (error) {
        this.logger.error(
          MESSAGE_GROUP_WORKER_ERROR_MSG.SEED_CACHE_APPLY_FAILED,
          {
            groupId: this.groupId,
            replicaId: this.replicaId,
            tableName: entry.tableName,
            operation: entry.operation,
            error: error.message,
          },
        );

        return {
          type: SEED_CACHE_MESSAGE_TYPE.SEED_CACHE_RESPONSE,
          success: false,
          entriesApplied,
          error: `${MESSAGE_GROUP_WORKER_ERROR_MSG.SEED_CACHE_APPLY_FAILED}: ${error.message}`,
        };
      }
    }

    this.logger.info(
      MESSAGE_GROUP_WORKER_LOG_MSG.SEED_CACHE_COMPLETED,
      {
        groupId: this.groupId,
        replicaId: this.replicaId,
        entriesApplied,
      },
    );

    return {
      type: SEED_CACHE_MESSAGE_TYPE.SEED_CACHE_RESPONSE,
      success: true,
      entriesApplied,
      error: null,
    };
  }

  /**
   * Set the bootstrap phase flag.
   * @param {boolean} phase - Whether in bootstrap phase.
   */
  setBootstrapPhase(phase) {
    this.bootstrapPhase = phase;
    this.logger.info(
      MESSAGE_GROUP_WORKER_LOG_MSG.BOOTSTRAP_PHASE_UPDATED,
      {
        groupId: this.groupId,
        replicaId: this.replicaId,
        bootstrapPhase: phase,
      },
    );
  }

  /**
   * Handle SET_BOOTSTRAP_PHASE message.
   * @param {Object} message - Message with bootstrapPhase flag.
   * @return {Object} Response with status.
   * @private
   */
  handleSetBootstrapPhase(message) {
    const newPhase = message.bootstrapPhase === true;
    this.setBootstrapPhase(newPhase);
    return {
      status: 'ok',
      replicaId: this.replicaId,
      bootstrapPhase: this.bootstrapPhase,
    };
  }

  /**
   * Check if the service is in bootstrap phase.
   * @return {boolean} True if in bootstrap phase.
   */
  isInBootstrapPhase() {
    return this.bootstrapPhase;
  }

  /**
   * Get the message group ID.
   * @return {string} Message group ID.
   */
  getGroupId() {
    return this.groupId;
  }

  /**
   * Apply CDC mutation to local cache.
   * Supports both structured system-table CDC records and user-table CDC
   * payloads that carry raw SQL + params.
   * @param {string} tableName - Target table name.
   * @param {string} operation - CDC operation.
   * @param {Object} data - CDC data payload.
   * @private
   */
  applyCacheMutation(tableName, operation, data) {
    if (data && typeof data.sql === 'string') {
      this.applyRawCDCMutation(tableName, data.sql, data.params || []);
      return;
    }

    this.systemCache.applyCDCEvent(tableName, operation, data);
  }

  /**
   * Apply raw SQL CDC mutation to cache. If the target table does not yet
   * exist and the SQL is INSERT-like, create a compatible dynamic table first.
   * @param {string} tableName - Target table name.
   * @param {string} sql - SQL statement from CDC event.
   * @param {Array} params - SQL parameters.
   * @private
   */
  applyRawCDCMutation(tableName, sql, params) {
    try {
      this.systemCache.executeRawSQL(sql, params);
    } catch (error) {
      if (!this.isMissingTableError(error)) {
        throw error;
      }

      const columns = this.extractInsertColumns(sql, tableName);
      if (!columns || columns.length === NUM.ZERO) {
        throw error;
      }

      if (!this.systemCache.hasTable(tableName)) {
        this.systemCache.createDynamicTable(tableName, columns);
      }

      this.systemCache.executeRawSQL(sql, params);
    }
  }

  /**
   * Check if a SQLite error indicates a missing table.
   * @param {Error} error - Error thrown by SQLite.
   * @return {boolean} True when table is missing.
   * @private
   */
  isMissingTableError(error) {
    return Boolean(error &&
      typeof error.message === 'string' &&
      error.message.includes('no such table'));
  }

  /**
   * Extract column list from INSERT SQL.
   * @param {string} sql - SQL statement.
   * @param {string} expectedTableName - Expected table name.
   * @return {Array<string>|null} Extracted columns or null.
   * @private
   */
  extractInsertColumns(sql, expectedTableName) {
    const match = INSERT_SQL_COLUMNS_PATTERN.exec(sql);
    if (!match) {
      return null;
    }

    const parsedTableName = this.normalizeIdentifier(
      match[1] || match[2] || match[3] || '',
    );
    if (parsedTableName !== this.normalizeIdentifier(expectedTableName)) {
      return null;
    }

    return match[4]
      .split(',')
      .map((column) => this.normalizeIdentifier(column))
      .filter((column) => column.length > NUM.ZERO);
  }

  /**
   * Normalize SQL identifiers by trimming and removing wrapper quotes.
   * @param {string} identifier - Raw SQL identifier.
   * @return {string} Normalized identifier.
   * @private
   */
  normalizeIdentifier(identifier) {
    const trimmed = String(identifier).trim();
    if (trimmed.length < 2) {
      return trimmed;
    }
    const starts = trimmed[0];
    const ends = trimmed[trimmed.length - 1];
    if ((starts === '"' && ends === '"') ||
      (starts === '`' && ends === '`')) {
      return trimmed.slice(1, -1);
    }
    return trimmed;
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
   * Check if CDC subscriptions are active.
   * @return {boolean} True if subscribed to CDC events.
   */
  isCDCSubscribed() {
    return this.cdcSubscribed;
  }

  /**
   * Get the number of active CDC subscriptions.
   * @return {number} Number of subscriptions.
   */
  getCDCSubscriptionCount() {
    return this.cdcSubscriptions.size;
  }

  /**
   * Get the RaftGroup instance.
   * @return {RaftGroup|null} RaftGroup instance.
   */
  getRaftGroup() {
    return this.raftGroup;
  }

  /**
   * Get statistics about the message group worker.
   * @return {Object} Message group worker statistics.
   */
  getStats() {
    const baseStats = super.getStats();
    return {
      ...baseStats,
      groupId: this.groupId,
      role: this.getRole(),
      isLeader: this.isLeaderReplica(),
      leaderId: this.getLeaderId(),
      term: this.getCurrentTerm(),
      cdcSubscribed: this.cdcSubscribed,
      cdcSubscriptionCount: this.cdcSubscriptions.size,
      replicaCount: this.replicaIds.length,
      bootstrapPhase: this.bootstrapPhase,
      cacheStats: this.systemCache ?
        this.systemCache.getStats() : null,
    };
  }
}

export {
  MessageGroupWorkerService,
  MESSAGE_GROUP_WORKER_DEFAULT,
  MESSAGE_GROUP_WORKER_ERROR_MSG,
  MESSAGE_GROUP_WORKER_LOG_MSG,
  CDC_REPLICATION_TYPE,
};
