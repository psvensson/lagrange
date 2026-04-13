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
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { ReplicaWorkerBase } from './replica-worker-base.js';
import { WORKER_ENTITY_TYPE, LEADERSHIP_MESSAGE_TYPE, CDC_MESSAGE_TYPE, FACADE_MESSAGE_TYPE } from './worker-constants.js';
import { NUM } from '../constants/index.js';
import { RaftGroup } from '../raft/raft-group.js';
import { RAFT_GROUP_EVENT, RAFT_GROUP_ROLE } from '../raft/raft-group-constants.js';
import { PeerAddressResolver } from '../raft/peer-address-resolver.js';
import { SQLiteStore } from '../storage/sqlite-store.js';
import { CDCEmitter } from '../cdc/cdc-emitter.js';
import { SQLiteLogAdapter } from '../raft/sqlite-log-adapter.js';
import { HLCClockService } from '../hlc/hlc-clock-service.js';
import { isRaftPacket } from '../raft/raft-packet-utils.js';
import { WORKER_RAFT_RUNTIME_DEFAULT } from './worker-raft-runtime-defaults.js';
const RAFT_PACKET_TYPE_APPEND_ACK = stryMutAct_9fa48("165090") ? "" : (stryCov_9fa48("165090"), 'append ack');
const RAFT_PACKET_TYPE_APPEND_FAIL = stryMutAct_9fa48("165091") ? "" : (stryCov_9fa48("165091"), 'append fail');

/**
 * Default configuration values for PartitionWorkerService.
 * @type {Readonly<Object>}
 */
const PARTITION_WORKER_DEFAULT = Object.freeze(stryMutAct_9fa48("165092") ? {} : (stryCov_9fa48("165092"), {
  MEMORY_DB_PATH: stryMutAct_9fa48("165093") ? "" : (stryCov_9fa48("165093"), ':memory:'),
  HEARTBEAT_MS: WORKER_RAFT_RUNTIME_DEFAULT.HEARTBEAT_MS,
  ELECTION_MIN_MS: WORKER_RAFT_RUNTIME_DEFAULT.ELECTION_MIN_MS,
  ELECTION_MAX_MS: WORKER_RAFT_RUNTIME_DEFAULT.ELECTION_MAX_MS,
  ELECTION_JITTER_PER_REPLICA_MS: WORKER_RAFT_RUNTIME_DEFAULT.ELECTION_JITTER_PER_REPLICA_MS
}));

/**
 * Error messages for PartitionWorkerService.
 * @type {Readonly<Object>}
 */
const PARTITION_WORKER_ERROR_MSG = Object.freeze(stryMutAct_9fa48("165094") ? {} : (stryCov_9fa48("165094"), {
  NOT_INITIALIZED: stryMutAct_9fa48("165095") ? "" : (stryCov_9fa48("165095"), 'PartitionWorkerService not initialized'),
  MISSING_PARTITION_ID: stryMutAct_9fa48("165096") ? "" : (stryCov_9fa48("165096"), 'partitionId is required'),
  MISSING_TABLE_ID: stryMutAct_9fa48("165097") ? "" : (stryCov_9fa48("165097"), 'tableId is required'),
  QUERY_FAILED: stryMutAct_9fa48("165098") ? "" : (stryCov_9fa48("165098"), 'Query execution failed'),
  CDC_DELIVERY_FAILED: stryMutAct_9fa48("165099") ? "" : (stryCov_9fa48("165099"), 'Failed to deliver CDC event')
}));

/**
 * Log messages for PartitionWorkerService.
 * @type {Readonly<Object>}
 */
const PARTITION_WORKER_LOG_MSG = Object.freeze(stryMutAct_9fa48("165100") ? {} : (stryCov_9fa48("165100"), {
  INITIALIZING_SQLITE: stryMutAct_9fa48("165101") ? "" : (stryCov_9fa48("165101"), 'Initializing SQLite database for partition worker'),
  SQLITE_INITIALIZED: stryMutAct_9fa48("165102") ? "" : (stryCov_9fa48("165102"), 'SQLite database initialized for partition worker'),
  INITIALIZING_RAFT: stryMutAct_9fa48("165103") ? "" : (stryCov_9fa48("165103"), 'Initializing Raft for partition worker'),
  RAFT_INITIALIZED: stryMutAct_9fa48("165104") ? "" : (stryCov_9fa48("165104"), 'Raft initialized for partition worker'),
  BECAME_LEADER: stryMutAct_9fa48("165105") ? "" : (stryCov_9fa48("165105"), 'Partition worker became leader'),
  LEADER_CHANGED: stryMutAct_9fa48("165106") ? "" : (stryCov_9fa48("165106"), 'Partition worker leader changed'),
  EXECUTING_QUERY: stryMutAct_9fa48("165107") ? "" : (stryCov_9fa48("165107"), 'Executing query on partition worker'),
  QUERY_COMPLETED: stryMutAct_9fa48("165108") ? "" : (stryCov_9fa48("165108"), 'Query completed on partition worker'),
  STOPPING_CDC: stryMutAct_9fa48("165109") ? "" : (stryCov_9fa48("165109"), 'Stopping CDCEmitter for partition worker'),
  CDC_STOPPED: stryMutAct_9fa48("165110") ? "" : (stryCov_9fa48("165110"), 'CDCEmitter stopped for partition worker'),
  STOPPING_RAFT: stryMutAct_9fa48("165111") ? "" : (stryCov_9fa48("165111"), 'Stopping Raft for partition worker'),
  RAFT_STOPPED: stryMutAct_9fa48("165112") ? "" : (stryCov_9fa48("165112"), 'Raft stopped for partition worker'),
  CLOSING_SQLITE: stryMutAct_9fa48("165113") ? "" : (stryCov_9fa48("165113"), 'Closing SQLite database for partition worker'),
  SQLITE_CLOSED: stryMutAct_9fa48("165114") ? "" : (stryCov_9fa48("165114"), 'SQLite database closed for partition worker'),
  INITIALIZING_CDC: stryMutAct_9fa48("165115") ? "" : (stryCov_9fa48("165115"), 'Initializing CDCEmitter for partition worker'),
  CDC_INITIALIZED: stryMutAct_9fa48("165116") ? "" : (stryCov_9fa48("165116"), 'CDCEmitter initialized for partition worker')
}));

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
    if (stryMutAct_9fa48("165117")) {
      {}
    } else {
      stryCov_9fa48("165117");
      if (stryMutAct_9fa48("165120") ? false : stryMutAct_9fa48("165119") ? true : stryMutAct_9fa48("165118") ? options.partitionId : (stryCov_9fa48("165118", "165119", "165120"), !options.partitionId)) {
        if (stryMutAct_9fa48("165121")) {
          {}
        } else {
          stryCov_9fa48("165121");
          throw new Error(PARTITION_WORKER_ERROR_MSG.MISSING_PARTITION_ID);
        }
      }
      if (stryMutAct_9fa48("165124") ? false : stryMutAct_9fa48("165123") ? true : stryMutAct_9fa48("165122") ? options.tableId : (stryCov_9fa48("165122", "165123", "165124"), !options.tableId)) {
        if (stryMutAct_9fa48("165125")) {
          {}
        } else {
          stryCov_9fa48("165125");
          throw new Error(PARTITION_WORKER_ERROR_MSG.MISSING_TABLE_ID);
        }
      }
      super(stryMutAct_9fa48("165126") ? {} : (stryCov_9fa48("165126"), {
        nodeId: options.nodeId,
        entityType: WORKER_ENTITY_TYPE.PARTITION,
        replicaId: options.replicaId,
        logger: options.logger
      }));

      /** @type {string} Partition ID */
      this.partitionId = options.partitionId;

      /** @type {string} Table ID */
      this.tableId = options.tableId;

      /** @type {string} Table name for CDC events */
      this.tableName = stryMutAct_9fa48("165129") ? options.tableName && options.tableId : stryMutAct_9fa48("165128") ? false : stryMutAct_9fa48("165127") ? true : (stryCov_9fa48("165127", "165128", "165129"), options.tableName || options.tableId);

      /** @type {Object|null} Table schema */
      this.schema = stryMutAct_9fa48("165132") ? options.schema && null : stryMutAct_9fa48("165131") ? false : stryMutAct_9fa48("165130") ? true : (stryCov_9fa48("165130", "165131", "165132"), options.schema || null);

      /** @type {string} SQLite database path */
      this.dbPath = stryMutAct_9fa48("165135") ? options.dbPath && PARTITION_WORKER_DEFAULT.MEMORY_DB_PATH : stryMutAct_9fa48("165134") ? false : stryMutAct_9fa48("165133") ? true : (stryCov_9fa48("165133", "165134", "165135"), options.dbPath || PARTITION_WORKER_DEFAULT.MEMORY_DB_PATH);

      /** @type {Array<string>} All replica IDs in the group */
      this.replicaIds = stryMutAct_9fa48("165138") ? options.replicaIds && [options.replicaId] : stryMutAct_9fa48("165137") ? false : stryMutAct_9fa48("165136") ? true : (stryCov_9fa48("165136", "165137", "165138"), options.replicaIds || (stryMutAct_9fa48("165139") ? [] : (stryCov_9fa48("165139"), [options.replicaId])));

      /** @type {Array<string>} Peer unified addresses */
      this.peerAddresses = stryMutAct_9fa48("165142") ? options.peerAddresses && [] : stryMutAct_9fa48("165141") ? false : stryMutAct_9fa48("165140") ? true : (stryCov_9fa48("165140", "165141", "165142"), options.peerAddresses || (stryMutAct_9fa48("165143") ? ["Stryker was here"] : (stryCov_9fa48("165143"), [])));

      /** @type {Object|null} AddressManager instance */
      this.addressManager = stryMutAct_9fa48("165146") ? options.addressManager && null : stryMutAct_9fa48("165145") ? false : stryMutAct_9fa48("165144") ? true : (stryCov_9fa48("165144", "165145", "165146"), options.addressManager || null);

      /** @type {Object|null} SystemTableCache instance */
      this.systemTableCache = stryMutAct_9fa48("165149") ? options.systemTableCache && null : stryMutAct_9fa48("165148") ? false : stryMutAct_9fa48("165147") ? true : (stryCov_9fa48("165147", "165148", "165149"), options.systemTableCache || null);

      /** @type {boolean} Defer election start */
      this.deferElection = stryMutAct_9fa48("165152") ? options.deferElection && false : stryMutAct_9fa48("165151") ? false : stryMutAct_9fa48("165150") ? true : (stryCov_9fa48("165150", "165151", "165152"), options.deferElection || (stryMutAct_9fa48("165153") ? true : (stryCov_9fa48("165153"), false)));

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

      /** @type {boolean} Whether leader activation has completed */
      this.leaderActivated = stryMutAct_9fa48("165154") ? true : (stryCov_9fa48("165154"), false);
    }
  }

  /**
   * Initialize partition with SQLiteStore, RaftGroup, and CDCEmitter.
   * Called by ReplicaWorkerBase.initialize() via onInitialize hook.
   * Order: SQLiteStore → RaftGroup → CDCEmitter
   * @return {Promise<void>}
   * @protected
   */
  async onInitialize() {
    if (stryMutAct_9fa48("165155")) {
      {}
    } else {
      stryCov_9fa48("165155");
      // 1. Initialize SQLiteStore
      this.logger.info(PARTITION_WORKER_LOG_MSG.INITIALIZING_SQLITE, stryMutAct_9fa48("165156") ? {} : (stryCov_9fa48("165156"), {
        partitionId: this.partitionId,
        replicaId: this.replicaId,
        dbPath: this.dbPath
      }));
      this.sqliteStore = new SQLiteStore(stryMutAct_9fa48("165157") ? {} : (stryCov_9fa48("165157"), {
        dbPath: this.dbPath,
        schema: this.schema,
        tableName: this.tableName,
        logger: this.logger
      }));
      this.sqliteStore.initialize();
      this.logger.info(PARTITION_WORKER_LOG_MSG.SQLITE_INITIALIZED, stryMutAct_9fa48("165158") ? {} : (stryCov_9fa48("165158"), {
        partitionId: this.partitionId,
        replicaId: this.replicaId
      }));

      // 2. Initialize RaftGroup
      await this.initializeRaft();

      // 3. Initialize CDCEmitter
      this.initializeCDC();
    }
  }

  /**
   * Initialize Raft consensus via RaftGroup composition.
   * @return {Promise<void>}
   * @private
   */
  async initializeRaft() {
    if (stryMutAct_9fa48("165159")) {
      {}
    } else {
      stryCov_9fa48("165159");
      this.logger.info(PARTITION_WORKER_LOG_MSG.INITIALIZING_RAFT, stryMutAct_9fa48("165160") ? {} : (stryCov_9fa48("165160"), {
        partitionId: this.partitionId,
        replicaId: this.replicaId,
        replicaCount: this.replicaIds.length
      }));

      // Create SQLite log adapter from the store's database
      this.logAdapter = new SQLiteLogAdapter(this.sqliteStore.getDatabase());

      // Create PeerAddressResolver
      this.peerAddressResolver = new PeerAddressResolver(stryMutAct_9fa48("165161") ? {} : (stryCov_9fa48("165161"), {
        addressManager: this.addressManager,
        systemTableCache: this.systemTableCache,
        entityType: WORKER_ENTITY_TYPE.PARTITION,
        logger: this.logger
      }));

      // Create RaftGroup with all dependencies injected
      this.raftGroup = new RaftGroup(stryMutAct_9fa48("165162") ? {} : (stryCov_9fa48("165162"), {
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
        electionJitterPerReplicaMs: PARTITION_WORKER_DEFAULT.ELECTION_JITTER_PER_REPLICA_MS,
        logger: this.logger
      }));

      // Wire RaftGroup events
      this.wireRaftGroupEvents();

      // Initialize and join peers
      this.raftGroup.initialize();
      this.raftGroup.joinPeers();
      if (stryMutAct_9fa48("165165") ? this.replicaIds.length !== NUM.ONE : stryMutAct_9fa48("165164") ? false : stryMutAct_9fa48("165163") ? true : (stryCov_9fa48("165163", "165164", "165165"), this.replicaIds.length === NUM.ONE)) {
        if (stryMutAct_9fa48("165166")) {
          {}
        } else {
          stryCov_9fa48("165166");
          this.raftGroup.startElection();
        }
      }
      this.logger.info(PARTITION_WORKER_LOG_MSG.RAFT_INITIALIZED, stryMutAct_9fa48("165167") ? {} : (stryCov_9fa48("165167"), {
        partitionId: this.partitionId,
        replicaId: this.replicaId
      }));
    }
  }

  /**
   * Wire RaftGroup events to partition-specific handlers.
   * @private
   */
  wireRaftGroupEvents() {
    if (stryMutAct_9fa48("165168")) {
      {}
    } else {
      stryCov_9fa48("165168");
      this.raftGroup.on(RAFT_GROUP_EVENT.LEADER, info => {
        if (stryMutAct_9fa48("165169")) {
          {}
        } else {
          stryCov_9fa48("165169");
          this.leaderActivated = stryMutAct_9fa48("165170") ? false : (stryCov_9fa48("165170"), true);
          this.logger.info(PARTITION_WORKER_LOG_MSG.BECAME_LEADER, stryMutAct_9fa48("165171") ? {} : (stryCov_9fa48("165171"), {
            partitionId: this.partitionId,
            replicaId: this.replicaId,
            term: info.term
          }));
        }
      });
      this.raftGroup.on(RAFT_GROUP_EVENT.FOLLOWER, () => {
        if (stryMutAct_9fa48("165172")) {
          {}
        } else {
          stryCov_9fa48("165172");
          this.leaderActivated = stryMutAct_9fa48("165173") ? true : (stryCov_9fa48("165173"), false);
        }
      });
      this.raftGroup.on(RAFT_GROUP_EVENT.CANDIDATE, () => {
        if (stryMutAct_9fa48("165174")) {
          {}
        } else {
          stryCov_9fa48("165174");
          this.leaderActivated = stryMutAct_9fa48("165175") ? true : (stryCov_9fa48("165175"), false);
        }
      });
      this.raftGroup.on(RAFT_GROUP_EVENT.LEADER_CHANGE, newLeader => {
        if (stryMutAct_9fa48("165176")) {
          {}
        } else {
          stryCov_9fa48("165176");
          this.leaderActivated = stryMutAct_9fa48("165177") ? true : (stryCov_9fa48("165177"), false);
          this.logger.info(PARTITION_WORKER_LOG_MSG.LEADER_CHANGED, stryMutAct_9fa48("165178") ? {} : (stryCov_9fa48("165178"), {
            partitionId: this.partitionId,
            replicaId: this.replicaId,
            newLeader
          }));
        }
      });
      this.raftGroup.on(RAFT_GROUP_EVENT.COMMIT, command => {
        if (stryMutAct_9fa48("165179")) {
          {}
        } else {
          stryCov_9fa48("165179");
          this.handleCommittedEntry(command);
        }
      });
    }
  }

  /**
   * Initialize CDCEmitter for change data capture.
   * @private
   */
  initializeCDC() {
    if (stryMutAct_9fa48("165180")) {
      {}
    } else {
      stryCov_9fa48("165180");
      this.logger.info(PARTITION_WORKER_LOG_MSG.INITIALIZING_CDC, stryMutAct_9fa48("165181") ? {} : (stryCov_9fa48("165181"), {
        partitionId: this.partitionId,
        replicaId: this.replicaId
      }));
      this.hlcClock = new HLCClockService(this.nodeId);
      this.cdcEmitter = new CDCEmitter(stryMutAct_9fa48("165182") ? {} : (stryCov_9fa48("165182"), {
        partitionId: this.partitionId,
        replicaId: this.replicaId,
        tableName: this.tableName,
        hlcClock: this.hlcClock,
        logger: this.logger
      }));
      this.logger.info(PARTITION_WORKER_LOG_MSG.CDC_INITIALIZED, stryMutAct_9fa48("165183") ? {} : (stryCov_9fa48("165183"), {
        partitionId: this.partitionId,
        replicaId: this.replicaId
      }));
    }
  }

  /**
   * Handle committed Raft entry.
   * Applies the command to the local SQLite store.
   * @param {Object|string} command - Committed Raft log entry command.
   * @private
   */
  handleCommittedEntry(command) {
    if (stryMutAct_9fa48("165184")) {
      {}
    } else {
      stryCov_9fa48("165184");
      if (stryMutAct_9fa48("165187") ? false : stryMutAct_9fa48("165186") ? true : stryMutAct_9fa48("165185") ? command : (stryCov_9fa48("165185", "165186", "165187"), !command)) {
        if (stryMutAct_9fa48("165188")) {
          {}
        } else {
          stryCov_9fa48("165188");
          return;
        }
      }
      const parsed = (stryMutAct_9fa48("165191") ? typeof command !== 'string' : stryMutAct_9fa48("165190") ? false : stryMutAct_9fa48("165189") ? true : (stryCov_9fa48("165189", "165190", "165191"), typeof command === (stryMutAct_9fa48("165192") ? "" : (stryCov_9fa48("165192"), 'string')))) ? JSON.parse(command) : command;
      if (stryMutAct_9fa48("165195") ? parsed.sql || this.sqliteStore : stryMutAct_9fa48("165194") ? false : stryMutAct_9fa48("165193") ? true : (stryCov_9fa48("165193", "165194", "165195"), parsed.sql && this.sqliteStore)) {
        if (stryMutAct_9fa48("165196")) {
          {}
        } else {
          stryCov_9fa48("165196");
          const result = this.sqliteStore.executeQuery(parsed.sql, stryMutAct_9fa48("165199") ? parsed.params && [] : stryMutAct_9fa48("165198") ? false : stryMutAct_9fa48("165197") ? true : (stryCov_9fa48("165197", "165198", "165199"), parsed.params || (stryMutAct_9fa48("165200") ? ["Stryker was here"] : (stryCov_9fa48("165200"), []))));

          // Generate CDC event for write operations
          if (stryMutAct_9fa48("165203") ? this.cdcEmitter || parsed.sql : stryMutAct_9fa48("165202") ? false : stryMutAct_9fa48("165201") ? true : (stryCov_9fa48("165201", "165202", "165203"), this.cdcEmitter && parsed.sql)) {
            if (stryMutAct_9fa48("165204")) {
              {}
            } else {
              stryCov_9fa48("165204");
              this.cdcEmitter.emitFromSQL(parsed.sql, stryMutAct_9fa48("165207") ? parsed.params && [] : stryMutAct_9fa48("165206") ? false : stryMutAct_9fa48("165205") ? true : (stryCov_9fa48("165205", "165206", "165207"), parsed.params || (stryMutAct_9fa48("165208") ? ["Stryker was here"] : (stryCov_9fa48("165208"), []))), result).catch(error => {
                if (stryMutAct_9fa48("165209")) {
                  {}
                } else {
                  stryCov_9fa48("165209");
                  this.logger.error(PARTITION_WORKER_ERROR_MSG.CDC_DELIVERY_FAILED, stryMutAct_9fa48("165210") ? {} : (stryCov_9fa48("165210"), {
                    partitionId: this.partitionId,
                    error: error.message
                  }));
                }
              });
            }
          }
        }
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
    if (stryMutAct_9fa48("165211")) {
      {}
    } else {
      stryCov_9fa48("165211");
      // Start election if not deferred
      if (stryMutAct_9fa48("165214") ? !this.deferElection || this.raftGroup : stryMutAct_9fa48("165213") ? false : stryMutAct_9fa48("165212") ? true : (stryCov_9fa48("165212", "165213", "165214"), (stryMutAct_9fa48("165215") ? this.deferElection : (stryCov_9fa48("165215"), !this.deferElection)) && this.raftGroup)) {
        if (stryMutAct_9fa48("165216")) {
          {}
        } else {
          stryCov_9fa48("165216");
          this.raftGroup.startElection();
        }
      }
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
    if (stryMutAct_9fa48("165217")) {
      {}
    } else {
      stryCov_9fa48("165217");
      // 1. Shutdown CDCEmitter
      if (stryMutAct_9fa48("165219") ? false : stryMutAct_9fa48("165218") ? true : (stryCov_9fa48("165218", "165219"), this.cdcEmitter)) {
        if (stryMutAct_9fa48("165220")) {
          {}
        } else {
          stryCov_9fa48("165220");
          this.removeCDCForwarder();
          this.logger.info(PARTITION_WORKER_LOG_MSG.STOPPING_CDC, stryMutAct_9fa48("165221") ? {} : (stryCov_9fa48("165221"), {
            partitionId: this.partitionId,
            replicaId: this.replicaId
          }));
          this.cdcEmitter.shutdown();
          this.cdcEmitter = null;
          this.logger.info(PARTITION_WORKER_LOG_MSG.CDC_STOPPED, stryMutAct_9fa48("165222") ? {} : (stryCov_9fa48("165222"), {
            partitionId: this.partitionId,
            replicaId: this.replicaId
          }));
        }
      }

      // 2. Shutdown RaftGroup
      if (stryMutAct_9fa48("165224") ? false : stryMutAct_9fa48("165223") ? true : (stryCov_9fa48("165223", "165224"), this.raftGroup)) {
        if (stryMutAct_9fa48("165225")) {
          {}
        } else {
          stryCov_9fa48("165225");
          this.logger.info(PARTITION_WORKER_LOG_MSG.STOPPING_RAFT, stryMutAct_9fa48("165226") ? {} : (stryCov_9fa48("165226"), {
            partitionId: this.partitionId,
            replicaId: this.replicaId
          }));
          await this.raftGroup.shutdown();
          this.raftGroup = null;
          this.logger.info(PARTITION_WORKER_LOG_MSG.RAFT_STOPPED, stryMutAct_9fa48("165227") ? {} : (stryCov_9fa48("165227"), {
            partitionId: this.partitionId,
            replicaId: this.replicaId
          }));
        }
      }

      // Close log adapter
      if (stryMutAct_9fa48("165229") ? false : stryMutAct_9fa48("165228") ? true : (stryCov_9fa48("165228", "165229"), this.logAdapter)) {
        if (stryMutAct_9fa48("165230")) {
          {}
        } else {
          stryCov_9fa48("165230");
          this.logAdapter.close();
          this.logAdapter = null;
        }
      }

      // 3. Close SQLiteStore
      if (stryMutAct_9fa48("165232") ? false : stryMutAct_9fa48("165231") ? true : (stryCov_9fa48("165231", "165232"), this.sqliteStore)) {
        if (stryMutAct_9fa48("165233")) {
          {}
        } else {
          stryCov_9fa48("165233");
          this.logger.info(PARTITION_WORKER_LOG_MSG.CLOSING_SQLITE, stryMutAct_9fa48("165234") ? {} : (stryCov_9fa48("165234"), {
            partitionId: this.partitionId,
            replicaId: this.replicaId
          }));
          this.sqliteStore.close();
          this.sqliteStore = null;
          this.logger.info(PARTITION_WORKER_LOG_MSG.SQLITE_CLOSED, stryMutAct_9fa48("165235") ? {} : (stryCov_9fa48("165235"), {
            partitionId: this.partitionId,
            replicaId: this.replicaId
          }));
        }
      }
      this.cdcSubscribers.clear();
      this.cdcSubscriberForwarder = null;
    }
  }

  /**
   * Handle incoming message from MessageRouter.
   * Routes Raft packets to RaftGroup, handles queries and CDC.
   * @param {Object} message - Incoming message.
   * @return {Promise<Object>} Response.
   */
  async handleMessage(message) {
    if (stryMutAct_9fa48("165236")) {
      {}
    } else {
      stryCov_9fa48("165236");
      // Handle Raft packets via RaftGroup
      if (stryMutAct_9fa48("165239") ? (isRaftPacket(message) || message?.type === RAFT_PACKET_TYPE_APPEND_ACK) && message?.type === RAFT_PACKET_TYPE_APPEND_FAIL : stryMutAct_9fa48("165238") ? false : stryMutAct_9fa48("165237") ? true : (stryCov_9fa48("165237", "165238", "165239"), (stryMutAct_9fa48("165241") ? isRaftPacket(message) && message?.type === RAFT_PACKET_TYPE_APPEND_ACK : stryMutAct_9fa48("165240") ? false : (stryCov_9fa48("165240", "165241"), isRaftPacket(message) || (stryMutAct_9fa48("165243") ? message?.type !== RAFT_PACKET_TYPE_APPEND_ACK : stryMutAct_9fa48("165242") ? false : (stryCov_9fa48("165242", "165243"), (stryMutAct_9fa48("165244") ? message.type : (stryCov_9fa48("165244"), message?.type)) === RAFT_PACKET_TYPE_APPEND_ACK)))) || (stryMutAct_9fa48("165246") ? message?.type !== RAFT_PACKET_TYPE_APPEND_FAIL : stryMutAct_9fa48("165245") ? false : (stryCov_9fa48("165245", "165246"), (stryMutAct_9fa48("165247") ? message.type : (stryCov_9fa48("165247"), message?.type)) === RAFT_PACKET_TYPE_APPEND_FAIL)))) {
        if (stryMutAct_9fa48("165248")) {
          {}
        } else {
          stryCov_9fa48("165248");
          return this.handleRaftPacket(message);
        }
      }

      // Handle SQL query execution
      if (stryMutAct_9fa48("165251") ? message.type === FACADE_MESSAGE_TYPE.QUERY && message.type === FACADE_MESSAGE_TYPE.EXECUTE_QUERY : stryMutAct_9fa48("165250") ? false : stryMutAct_9fa48("165249") ? true : (stryCov_9fa48("165249", "165250", "165251"), (stryMutAct_9fa48("165253") ? message.type !== FACADE_MESSAGE_TYPE.QUERY : stryMutAct_9fa48("165252") ? false : (stryCov_9fa48("165252", "165253"), message.type === FACADE_MESSAGE_TYPE.QUERY)) || (stryMutAct_9fa48("165255") ? message.type !== FACADE_MESSAGE_TYPE.EXECUTE_QUERY : stryMutAct_9fa48("165254") ? false : (stryCov_9fa48("165254", "165255"), message.type === FACADE_MESSAGE_TYPE.EXECUTE_QUERY)))) {
        if (stryMutAct_9fa48("165256")) {
          {}
        } else {
          stryCov_9fa48("165256");
          return this.handleQuery(message);
        }
      }

      // Handle CDC subscription
      if (stryMutAct_9fa48("165259") ? message.type !== CDC_MESSAGE_TYPE.SUBSCRIBE_CDC : stryMutAct_9fa48("165258") ? false : stryMutAct_9fa48("165257") ? true : (stryCov_9fa48("165257", "165258", "165259"), message.type === CDC_MESSAGE_TYPE.SUBSCRIBE_CDC)) {
        if (stryMutAct_9fa48("165260")) {
          {}
        } else {
          stryCov_9fa48("165260");
          return this.handleCDCSubscribe(message);
        }
      }

      // Handle CDC unsubscription
      if (stryMutAct_9fa48("165263") ? message.type !== CDC_MESSAGE_TYPE.UNSUBSCRIBE_CDC : stryMutAct_9fa48("165262") ? false : stryMutAct_9fa48("165261") ? true : (stryCov_9fa48("165261", "165262", "165263"), message.type === CDC_MESSAGE_TYPE.UNSUBSCRIBE_CDC)) {
        if (stryMutAct_9fa48("165264")) {
          {}
        } else {
          stryCov_9fa48("165264");
          return this.handleCDCUnsubscribe(message);
        }
      }

      // Handle leadership status query
      if (stryMutAct_9fa48("165267") ? message.type !== LEADERSHIP_MESSAGE_TYPE.GET_LEADERSHIP_STATUS : stryMutAct_9fa48("165266") ? false : stryMutAct_9fa48("165265") ? true : (stryCov_9fa48("165265", "165266", "165267"), message.type === LEADERSHIP_MESSAGE_TYPE.GET_LEADERSHIP_STATUS)) {
        if (stryMutAct_9fa48("165268")) {
          {}
        } else {
          stryCov_9fa48("165268");
          return this.handleGetLeadershipStatus();
        }
      }

      // Handle start election request
      if (stryMutAct_9fa48("165271") ? message.type !== 'START_ELECTION' : stryMutAct_9fa48("165270") ? false : stryMutAct_9fa48("165269") ? true : (stryCov_9fa48("165269", "165270", "165271"), message.type === (stryMutAct_9fa48("165272") ? "" : (stryCov_9fa48("165272"), 'START_ELECTION')))) {
        if (stryMutAct_9fa48("165273")) {
          {}
        } else {
          stryCov_9fa48("165273");
          return this.handleStartElection();
        }
      }
      return super.handleMessage(message);
    }
  }

  /**
   * Handle incoming Raft packet via RaftGroup.
   * @param {Object} packet - Raft packet from peer.
   * @return {Object} Acknowledgment result.
   * @private
   */
  handleRaftPacket(packet) {
    if (stryMutAct_9fa48("165274")) {
      {}
    } else {
      stryCov_9fa48("165274");
      if (stryMutAct_9fa48("165277") ? false : stryMutAct_9fa48("165276") ? true : stryMutAct_9fa48("165275") ? this.raftGroup : (stryCov_9fa48("165275", "165276", "165277"), !this.raftGroup)) {
        if (stryMutAct_9fa48("165278")) {
          {}
        } else {
          stryCov_9fa48("165278");
          return stryMutAct_9fa48("165279") ? {} : (stryCov_9fa48("165279"), {
            acknowledged: stryMutAct_9fa48("165280") ? true : (stryCov_9fa48("165280"), false),
            error: PARTITION_WORKER_ERROR_MSG.NOT_INITIALIZED
          });
        }
      }
      const result = this.raftGroup.handleRaftPacket(packet);
      return stryMutAct_9fa48("165283") ? result && {
        acknowledged: false
      } : stryMutAct_9fa48("165282") ? false : stryMutAct_9fa48("165281") ? true : (stryCov_9fa48("165281", "165282", "165283"), result || (stryMutAct_9fa48("165284") ? {} : (stryCov_9fa48("165284"), {
        acknowledged: stryMutAct_9fa48("165285") ? true : (stryCov_9fa48("165285"), false)
      })));
    }
  }

  /**
   * Handle SQL query execution request.
   * @param {Object} message - Query message with sql and params.
   * @return {Object} Query result.
   * @private
   */
  async handleQuery(message) {
    if (stryMutAct_9fa48("165286")) {
      {}
    } else {
      stryCov_9fa48("165286");
      if (stryMutAct_9fa48("165289") ? false : stryMutAct_9fa48("165288") ? true : stryMutAct_9fa48("165287") ? this.sqliteStore : (stryCov_9fa48("165287", "165288", "165289"), !this.sqliteStore)) {
        if (stryMutAct_9fa48("165290")) {
          {}
        } else {
          stryCov_9fa48("165290");
          return stryMutAct_9fa48("165291") ? {} : (stryCov_9fa48("165291"), {
            error: PARTITION_WORKER_ERROR_MSG.NOT_INITIALIZED
          });
        }
      }
      this.logger.debug(PARTITION_WORKER_LOG_MSG.EXECUTING_QUERY, stryMutAct_9fa48("165292") ? {} : (stryCov_9fa48("165292"), {
        partitionId: this.partitionId,
        replicaId: this.replicaId
      }));
      try {
        if (stryMutAct_9fa48("165293")) {
          {}
        } else {
          stryCov_9fa48("165293");
          const result = this.sqliteStore.executeQuery(message.sql, stryMutAct_9fa48("165296") ? message.params && [] : stryMutAct_9fa48("165295") ? false : stryMutAct_9fa48("165294") ? true : (stryCov_9fa48("165294", "165295", "165296"), message.params || (stryMutAct_9fa48("165297") ? ["Stryker was here"] : (stryCov_9fa48("165297"), []))));
          this.logger.debug(PARTITION_WORKER_LOG_MSG.QUERY_COMPLETED, stryMutAct_9fa48("165298") ? {} : (stryCov_9fa48("165298"), {
            partitionId: this.partitionId,
            replicaId: this.replicaId
          }));
          if (stryMutAct_9fa48("165301") ? this.cdcEmitter || message.sql : stryMutAct_9fa48("165300") ? false : stryMutAct_9fa48("165299") ? true : (stryCov_9fa48("165299", "165300", "165301"), this.cdcEmitter && message.sql)) {
            if (stryMutAct_9fa48("165302")) {
              {}
            } else {
              stryCov_9fa48("165302");
              await this.cdcEmitter.emitFromSQL(message.sql, stryMutAct_9fa48("165305") ? message.params && [] : stryMutAct_9fa48("165304") ? false : stryMutAct_9fa48("165303") ? true : (stryCov_9fa48("165303", "165304", "165305"), message.params || (stryMutAct_9fa48("165306") ? ["Stryker was here"] : (stryCov_9fa48("165306"), []))), result);
            }
          }
          return stryMutAct_9fa48("165307") ? {} : (stryCov_9fa48("165307"), {
            status: stryMutAct_9fa48("165308") ? "" : (stryCov_9fa48("165308"), 'ok'),
            result
          });
        }
      } catch (error) {
        if (stryMutAct_9fa48("165309")) {
          {}
        } else {
          stryCov_9fa48("165309");
          this.logger.error(PARTITION_WORKER_ERROR_MSG.QUERY_FAILED, stryMutAct_9fa48("165310") ? {} : (stryCov_9fa48("165310"), {
            partitionId: this.partitionId,
            error: error.message
          }));
          return stryMutAct_9fa48("165311") ? {} : (stryCov_9fa48("165311"), {
            error: error.message
          });
        }
      }
    }
  }

  /**
   * Handle CDC subscribe request.
   * @param {Object} message - Subscribe message with subscriberAddress.
   * @return {Object} Response.
   * @private
   */
  handleCDCSubscribe(message) {
    if (stryMutAct_9fa48("165312")) {
      {}
    } else {
      stryCov_9fa48("165312");
      const subscriberAddress = message.subscriberAddress;
      this.cdcSubscribers.add(subscriberAddress);
      this.ensureCDCForwarder();
      return stryMutAct_9fa48("165313") ? {} : (stryCov_9fa48("165313"), {
        status: stryMutAct_9fa48("165314") ? "" : (stryCov_9fa48("165314"), 'ok'),
        partitionId: this.partitionId,
        replicaId: this.replicaId
      });
    }
  }

  /**
   * Handle CDC unsubscribe request.
   * @param {Object} message - Unsubscribe message with subscriberAddress.
   * @return {Object} Response.
   * @private
   */
  handleCDCUnsubscribe(message) {
    if (stryMutAct_9fa48("165315")) {
      {}
    } else {
      stryCov_9fa48("165315");
      this.cdcSubscribers.delete(message.subscriberAddress);
      if (stryMutAct_9fa48("165318") ? this.cdcSubscribers.size !== NUM.ZERO : stryMutAct_9fa48("165317") ? false : stryMutAct_9fa48("165316") ? true : (stryCov_9fa48("165316", "165317", "165318"), this.cdcSubscribers.size === NUM.ZERO)) {
        if (stryMutAct_9fa48("165319")) {
          {}
        } else {
          stryCov_9fa48("165319");
          this.removeCDCForwarder();
        }
      }
      return stryMutAct_9fa48("165320") ? {} : (stryCov_9fa48("165320"), {
        status: stryMutAct_9fa48("165321") ? "" : (stryCov_9fa48("165321"), 'ok'),
        replicaId: this.replicaId
      });
    }
  }

  /**
   * Ensure a single CDC forwarder is attached to the CDC emitter.
   * @private
   */
  ensureCDCForwarder() {
    if (stryMutAct_9fa48("165322")) {
      {}
    } else {
      stryCov_9fa48("165322");
      if (stryMutAct_9fa48("165325") ? (!this.cdcEmitter || !this.messageBridge) && this.cdcSubscriberForwarder : stryMutAct_9fa48("165324") ? false : stryMutAct_9fa48("165323") ? true : (stryCov_9fa48("165323", "165324", "165325"), (stryMutAct_9fa48("165327") ? !this.cdcEmitter && !this.messageBridge : stryMutAct_9fa48("165326") ? false : (stryCov_9fa48("165326", "165327"), (stryMutAct_9fa48("165328") ? this.cdcEmitter : (stryCov_9fa48("165328"), !this.cdcEmitter)) || (stryMutAct_9fa48("165329") ? this.messageBridge : (stryCov_9fa48("165329"), !this.messageBridge)))) || this.cdcSubscriberForwarder)) {
        if (stryMutAct_9fa48("165330")) {
          {}
        } else {
          stryCov_9fa48("165330");
          return;
        }
      }
      this.cdcSubscriberForwarder = event => {
        if (stryMutAct_9fa48("165331")) {
          {}
        } else {
          stryCov_9fa48("165331");
          const subscriberAddresses = Array.from(this.cdcSubscribers);
          for (const subscriberAddress of subscriberAddresses) {
            if (stryMutAct_9fa48("165332")) {
              {}
            } else {
              stryCov_9fa48("165332");
              this.deliverCDCEventToSubscriber(subscriberAddress, event);
            }
          }
        }
      };
      this.cdcEmitter.subscribe(this.cdcSubscriberForwarder);
    }
  }

  /**
   * Remove the CDC forwarder from the CDC emitter.
   * @private
   */
  removeCDCForwarder() {
    if (stryMutAct_9fa48("165333")) {
      {}
    } else {
      stryCov_9fa48("165333");
      if (stryMutAct_9fa48("165336") ? !this.cdcEmitter && !this.cdcSubscriberForwarder : stryMutAct_9fa48("165335") ? false : stryMutAct_9fa48("165334") ? true : (stryCov_9fa48("165334", "165335", "165336"), (stryMutAct_9fa48("165337") ? this.cdcEmitter : (stryCov_9fa48("165337"), !this.cdcEmitter)) || (stryMutAct_9fa48("165338") ? this.cdcSubscriberForwarder : (stryCov_9fa48("165338"), !this.cdcSubscriberForwarder)))) {
        if (stryMutAct_9fa48("165339")) {
          {}
        } else {
          stryCov_9fa48("165339");
          return;
        }
      }
      this.cdcEmitter.unsubscribe(this.cdcSubscriberForwarder);
      this.cdcSubscriberForwarder = null;
    }
  }

  /**
   * Deliver a CDC event to one subscriber address.
   * @param {string} subscriberAddress - Target subscriber address.
   * @param {Object} event - CDC event payload.
   * @private
   */
  deliverCDCEventToSubscriber(subscriberAddress, event) {
    if (stryMutAct_9fa48("165340")) {
      {}
    } else {
      stryCov_9fa48("165340");
      if (stryMutAct_9fa48("165343") ? false : stryMutAct_9fa48("165342") ? true : stryMutAct_9fa48("165341") ? this.messageBridge : (stryCov_9fa48("165341", "165342", "165343"), !this.messageBridge)) {
        if (stryMutAct_9fa48("165344")) {
          {}
        } else {
          stryCov_9fa48("165344");
          return;
        }
      }
      try {
        if (stryMutAct_9fa48("165345")) {
          {}
        } else {
          stryCov_9fa48("165345");
          this.messageBridge.sendFireAndForget(subscriberAddress, stryMutAct_9fa48("165346") ? {} : (stryCov_9fa48("165346"), {
            type: CDC_MESSAGE_TYPE.CDC_EVENT,
            cdcEvent: event
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("165347")) {
          {}
        } else {
          stryCov_9fa48("165347");
          this.logger.error(PARTITION_WORKER_ERROR_MSG.CDC_DELIVERY_FAILED, stryMutAct_9fa48("165348") ? {} : (stryCov_9fa48("165348"), {
            partitionId: this.partitionId,
            subscriberAddress,
            error: error.message
          }));
        }
      }
    }
  }

  /**
   * Handle leadership status query.
   * @return {Object} Leadership status response.
   * @private
   */
  handleGetLeadershipStatus() {
    if (stryMutAct_9fa48("165349")) {
      {}
    } else {
      stryCov_9fa48("165349");
      return stryMutAct_9fa48("165350") ? {} : (stryCov_9fa48("165350"), {
        type: LEADERSHIP_MESSAGE_TYPE.LEADERSHIP_STATUS,
        isLeader: this.raftGroup ? this.raftGroup.isLeaderReplica() : stryMutAct_9fa48("165351") ? true : (stryCov_9fa48("165351"), false),
        leaderActivated: this.isLeaderActivated(),
        term: this.raftGroup ? this.raftGroup.getCurrentTerm() : NUM.ZERO,
        leaderId: this.raftGroup ? this.raftGroup.getLeaderId() : null,
        replicaId: this.replicaId
      });
    }
  }

  /**
   * Handle start election request.
   * @return {Object} Response.
   * @private
   */
  handleStartElection() {
    if (stryMutAct_9fa48("165352")) {
      {}
    } else {
      stryCov_9fa48("165352");
      if (stryMutAct_9fa48("165354") ? false : stryMutAct_9fa48("165353") ? true : (stryCov_9fa48("165353", "165354"), this.raftGroup)) {
        if (stryMutAct_9fa48("165355")) {
          {}
        } else {
          stryCov_9fa48("165355");
          this.raftGroup.startElection();
        }
      }
      return stryMutAct_9fa48("165356") ? {} : (stryCov_9fa48("165356"), {
        status: stryMutAct_9fa48("165357") ? "" : (stryCov_9fa48("165357"), 'ok'),
        replicaId: this.replicaId
      });
    }
  }

  /**
   * Execute a SQL query on this partition.
   * @param {string} sql - SQL statement.
   * @param {Array} [params=[]] - Query parameters.
   * @return {Object} Query result.
   */
  executeQuery(sql, params = stryMutAct_9fa48("165358") ? ["Stryker was here"] : (stryCov_9fa48("165358"), [])) {
    if (stryMutAct_9fa48("165359")) {
      {}
    } else {
      stryCov_9fa48("165359");
      if (stryMutAct_9fa48("165362") ? false : stryMutAct_9fa48("165361") ? true : stryMutAct_9fa48("165360") ? this.sqliteStore : (stryCov_9fa48("165360", "165361", "165362"), !this.sqliteStore)) {
        if (stryMutAct_9fa48("165363")) {
          {}
        } else {
          stryCov_9fa48("165363");
          throw new Error(PARTITION_WORKER_ERROR_MSG.NOT_INITIALIZED);
        }
      }
      return this.sqliteStore.executeQuery(sql, params);
    }
  }

  /**
   * Start Raft election.
   */
  startElection() {
    if (stryMutAct_9fa48("165364")) {
      {}
    } else {
      stryCov_9fa48("165364");
      if (stryMutAct_9fa48("165366") ? false : stryMutAct_9fa48("165365") ? true : (stryCov_9fa48("165365", "165366"), this.raftGroup)) {
        if (stryMutAct_9fa48("165367")) {
          {}
        } else {
          stryCov_9fa48("165367");
          this.raftGroup.startElection();
        }
      }
    }
  }

  /**
   * Get the current Raft role.
   * @return {string} Current role.
   */
  getRole() {
    if (stryMutAct_9fa48("165368")) {
      {}
    } else {
      stryCov_9fa48("165368");
      return this.raftGroup ? this.raftGroup.getRole() : RAFT_GROUP_ROLE.FOLLOWER;
    }
  }

  /**
   * Check if this replica is the leader.
   * @return {boolean} True if leader.
   */
  isLeaderReplica() {
    if (stryMutAct_9fa48("165369")) {
      {}
    } else {
      stryCov_9fa48("165369");
      return this.raftGroup ? this.raftGroup.isLeaderReplica() : stryMutAct_9fa48("165370") ? true : (stryCov_9fa48("165370"), false);
    }
  }

  /**
   * Check if leader activation has completed.
   * @return {boolean} True if activation completed.
   */
  isLeaderActivated() {
    if (stryMutAct_9fa48("165371")) {
      {}
    } else {
      stryCov_9fa48("165371");
      return this.leaderActivated;
    }
  }

  /**
   * Get the current leader ID.
   * @return {string|null} Leader replica ID or null.
   */
  getLeaderId() {
    if (stryMutAct_9fa48("165372")) {
      {}
    } else {
      stryCov_9fa48("165372");
      return this.raftGroup ? this.raftGroup.getLeaderId() : null;
    }
  }

  /**
   * Get the current Raft term.
   * @return {number} Current term.
   */
  getCurrentTerm() {
    if (stryMutAct_9fa48("165373")) {
      {}
    } else {
      stryCov_9fa48("165373");
      return this.raftGroup ? this.raftGroup.getCurrentTerm() : NUM.ZERO;
    }
  }

  /**
   * Get the partition ID.
   * @return {string} Partition ID.
   */
  getPartitionId() {
    if (stryMutAct_9fa48("165374")) {
      {}
    } else {
      stryCov_9fa48("165374");
      return this.partitionId;
    }
  }

  /**
   * Get the table ID.
   * @return {string} Table ID.
   */
  getTableId() {
    if (stryMutAct_9fa48("165375")) {
      {}
    } else {
      stryCov_9fa48("165375");
      return this.tableId;
    }
  }

  /**
   * Get the SQLiteStore instance.
   * @return {SQLiteStore|null} SQLiteStore instance.
   */
  getSQLiteStore() {
    if (stryMutAct_9fa48("165376")) {
      {}
    } else {
      stryCov_9fa48("165376");
      return this.sqliteStore;
    }
  }

  /**
   * Get the CDCEmitter instance.
   * @return {CDCEmitter|null} CDCEmitter instance.
   */
  getCDCEmitter() {
    if (stryMutAct_9fa48("165377")) {
      {}
    } else {
      stryCov_9fa48("165377");
      return this.cdcEmitter;
    }
  }

  /**
   * Get the RaftGroup instance.
   * @return {RaftGroup|null} RaftGroup instance.
   */
  getRaftGroup() {
    if (stryMutAct_9fa48("165378")) {
      {}
    } else {
      stryCov_9fa48("165378");
      return this.raftGroup;
    }
  }

  /**
   * Get statistics about the partition worker.
   * @return {Object} Partition worker statistics.
   */
  getStats() {
    if (stryMutAct_9fa48("165379")) {
      {}
    } else {
      stryCov_9fa48("165379");
      const baseStats = super.getStats();
      return stryMutAct_9fa48("165380") ? {} : (stryCov_9fa48("165380"), {
        ...baseStats,
        partitionId: this.partitionId,
        tableId: this.tableId,
        role: this.getRole(),
        isLeader: this.isLeaderReplica(),
        leaderActivated: this.isLeaderActivated(),
        leaderId: this.getLeaderId(),
        term: this.getCurrentTerm(),
        replicaCount: this.replicaIds.length,
        cdcSubscriberCount: this.cdcSubscribers.size
      });
    }
  }
}
export { PartitionWorkerService, PARTITION_WORKER_DEFAULT, PARTITION_WORKER_ERROR_MSG, PARTITION_WORKER_LOG_MSG };