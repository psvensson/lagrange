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
import { SQLiteSystemCache } from './sqlite-system-cache.js';
import { WORKER_ENTITY_TYPE, CACHE_MESSAGE_TYPE, LEADERSHIP_MESSAGE_TYPE, CDC_MESSAGE_TYPE, SEED_CACHE_MESSAGE_TYPE, FACADE_MESSAGE_TYPE, WORKER_ADDRESS, WORKER_RESPONSE_STATUS } from './worker-constants.js';
import { NUM } from '../constants/index.js';
import { RaftGroup } from '../raft/raft-group.js';
import { RAFT_GROUP_EVENT, RAFT_GROUP_ROLE } from '../raft/raft-group-constants.js';
import { PeerAddressResolver } from '../raft/peer-address-resolver.js';
import { SQLiteLogAdapter } from '../raft/sqlite-log-adapter.js';
import { isRaftPacket } from '../raft/raft-packet-utils.js';
import Database from 'better-sqlite3';
import { WORKER_RAFT_RUNTIME_DEFAULT } from './worker-raft-runtime-defaults.js';

/**
 * Default configuration values for MessageGroupWorkerService.
 * @type {Readonly<Object>}
 */
const MESSAGE_GROUP_WORKER_DEFAULT = Object.freeze(stryMutAct_9fa48("164457") ? {} : (stryCov_9fa48("164457"), {
  /** Default heartbeat interval in milliseconds */
  HEARTBEAT_MS: WORKER_RAFT_RUNTIME_DEFAULT.HEARTBEAT_MS,
  /** Default minimum election timeout in milliseconds */
  ELECTION_MIN_MS: WORKER_RAFT_RUNTIME_DEFAULT.ELECTION_MIN_MS,
  /** Default maximum election timeout in milliseconds */
  ELECTION_MAX_MS: WORKER_RAFT_RUNTIME_DEFAULT.ELECTION_MAX_MS,
  /** Jitter added per replica index to stagger election timeouts */
  ELECTION_JITTER_PER_REPLICA_MS: WORKER_RAFT_RUNTIME_DEFAULT.ELECTION_JITTER_PER_REPLICA_MS,
  /** In-memory database path */
  MEMORY_DB_PATH: stryMutAct_9fa48("164458") ? "" : (stryCov_9fa48("164458"), ':memory:'),
  /** Maximum CDC relay hops when forwarding from stale follower targets */
  CDC_RELAY_MAX_HOPS: NUM.TWO,
  /** Max time to wait for one CDC entry to commit locally */
  RAFT_COMMIT_TIMEOUT_MS: 2000
}));

/**
 * Error messages for MessageGroupWorkerService.
 * @type {Readonly<Object>}
 */
const MESSAGE_GROUP_WORKER_ERROR_MSG = Object.freeze(stryMutAct_9fa48("164459") ? {} : (stryCov_9fa48("164459"), {
  NOT_INITIALIZED: stryMutAct_9fa48("164460") ? "" : (stryCov_9fa48("164460"), 'MessageGroupWorkerService not initialized'),
  MISSING_GROUP_ID: stryMutAct_9fa48("164461") ? "" : (stryCov_9fa48("164461"), 'groupId is required'),
  CDC_SUBSCRIPTION_FAILED: stryMutAct_9fa48("164462") ? "" : (stryCov_9fa48("164462"), 'Failed to subscribe to CDC events'),
  CDC_UNSUBSCRIPTION_FAILED: stryMutAct_9fa48("164463") ? "" : (stryCov_9fa48("164463"), 'Failed to unsubscribe from CDC events'),
  CDC_APPLY_FAILED: stryMutAct_9fa48("164464") ? "" : (stryCov_9fa48("164464"), 'Failed to apply CDC event'),
  NOT_LEADER: stryMutAct_9fa48("164465") ? "" : (stryCov_9fa48("164465"), 'Only leader can subscribe to CDC events'),
  SEED_CACHE_NOT_BOOTSTRAP_PHASE: stryMutAct_9fa48("164466") ? "" : (stryCov_9fa48("164466"), 'SEED_CACHE rejected: not in bootstrap phase'),
  SEED_CACHE_MISSING_ENTRIES: stryMutAct_9fa48("164467") ? "" : (stryCov_9fa48("164467"), 'SEED_CACHE rejected: entries array is required'),
  SEED_CACHE_APPLY_FAILED: stryMutAct_9fa48("164468") ? "" : (stryCov_9fa48("164468"), 'Failed to apply SEED_CACHE entry'),
  RAFT_COMMIT_TIMEOUT: stryMutAct_9fa48("164469") ? "" : (stryCov_9fa48("164469"), 'Raft commit timeout')
}));

/**
 * Log messages for MessageGroupWorkerService.
 * @type {Readonly<Object>}
 */
const MESSAGE_GROUP_WORKER_LOG_MSG = Object.freeze(stryMutAct_9fa48("164470") ? {} : (stryCov_9fa48("164470"), {
  INITIALIZING_CACHE: stryMutAct_9fa48("164471") ? "" : (stryCov_9fa48("164471"), 'Initializing SQLite system cache for message group worker'),
  CACHE_INITIALIZED: stryMutAct_9fa48("164472") ? "" : (stryCov_9fa48("164472"), 'SQLite system cache initialized for message group worker'),
  INITIALIZING_RAFT: stryMutAct_9fa48("164473") ? "" : (stryCov_9fa48("164473"), 'Initializing Raft for message group worker'),
  RAFT_INITIALIZED: stryMutAct_9fa48("164474") ? "" : (stryCov_9fa48("164474"), 'Raft initialized for message group worker'),
  BECAME_LEADER: stryMutAct_9fa48("164475") ? "" : (stryCov_9fa48("164475"), 'Message group worker became leader'),
  LEADER_CHANGED: stryMutAct_9fa48("164476") ? "" : (stryCov_9fa48("164476"), 'Message group worker leader changed'),
  SUBSCRIBING_CDC: stryMutAct_9fa48("164477") ? "" : (stryCov_9fa48("164477"), 'Subscribing to CDC events from partition leaders'),
  SUBSCRIBED_CDC: stryMutAct_9fa48("164478") ? "" : (stryCov_9fa48("164478"), 'Subscribed to CDC events from partition leaders'),
  UNSUBSCRIBING_CDC: stryMutAct_9fa48("164479") ? "" : (stryCov_9fa48("164479"), 'Unsubscribing from CDC events'),
  UNSUBSCRIBED_CDC: stryMutAct_9fa48("164480") ? "" : (stryCov_9fa48("164480"), 'Unsubscribed from CDC events'),
  APPLYING_CDC_EVENT: stryMutAct_9fa48("164481") ? "" : (stryCov_9fa48("164481"), 'Applying CDC event to system cache'),
  CDC_EVENT_APPLIED: stryMutAct_9fa48("164482") ? "" : (stryCov_9fa48("164482"), 'CDC event applied to system cache'),
  REPLICATING_CDC: stryMutAct_9fa48("164483") ? "" : (stryCov_9fa48("164483"), 'Replicating CDC event to followers via Raft'),
  CDC_REPLICATED: stryMutAct_9fa48("164484") ? "" : (stryCov_9fa48("164484"), 'CDC event replicated to followers'),
  STOPPING_RAFT: stryMutAct_9fa48("164485") ? "" : (stryCov_9fa48("164485"), 'Stopping Raft for message group worker'),
  RAFT_STOPPED: stryMutAct_9fa48("164486") ? "" : (stryCov_9fa48("164486"), 'Raft stopped for message group worker'),
  CLOSING_CACHE: stryMutAct_9fa48("164487") ? "" : (stryCov_9fa48("164487"), 'Closing SQLite system cache for message group worker'),
  CACHE_CLOSED: stryMutAct_9fa48("164488") ? "" : (stryCov_9fa48("164488"), 'SQLite system cache closed for message group worker'),
  SEED_CACHE_RECEIVED: stryMutAct_9fa48("164489") ? "" : (stryCov_9fa48("164489"), 'SEED_CACHE message received'),
  SEED_CACHE_APPLYING: stryMutAct_9fa48("164490") ? "" : (stryCov_9fa48("164490"), 'Applying SEED_CACHE entries to system cache'),
  SEED_CACHE_ENTRY_APPLIED: stryMutAct_9fa48("164491") ? "" : (stryCov_9fa48("164491"), 'SEED_CACHE entry applied'),
  SEED_CACHE_REPLICATING: stryMutAct_9fa48("164492") ? "" : (stryCov_9fa48("164492"), 'Replicating SEED_CACHE entries via Raft'),
  SEED_CACHE_COMPLETED: stryMutAct_9fa48("164493") ? "" : (stryCov_9fa48("164493"), 'SEED_CACHE completed successfully'),
  SEED_CACHE_REJECTED: stryMutAct_9fa48("164494") ? "" : (stryCov_9fa48("164494"), 'SEED_CACHE rejected'),
  BOOTSTRAP_PHASE_UPDATED: stryMutAct_9fa48("164495") ? "" : (stryCov_9fa48("164495"), 'Bootstrap phase updated')
}));

/**
 * CDC replication entry type for Raft log.
 * @type {string}
 */
const CDC_REPLICATION_TYPE = stryMutAct_9fa48("164496") ? "" : (stryCov_9fa48("164496"), 'CDC_REPLICATION');
const INSERT_SQL_COLUMNS_PATTERN = stryMutAct_9fa48("164519") ? /^\s*INSERT(?:\s+OR\s+REPLACE)?\s+INTO\s+(?:"([^"]+)"|`([^`]+)`|([A-Za-z_][A-Za-z0-9_]*))\s*\(([)]+)\)/i : stryMutAct_9fa48("164518") ? /^\s*INSERT(?:\s+OR\s+REPLACE)?\s+INTO\s+(?:"([^"]+)"|`([^`]+)`|([A-Za-z_][A-Za-z0-9_]*))\s*\(([^)])\)/i : stryMutAct_9fa48("164517") ? /^\s*INSERT(?:\s+OR\s+REPLACE)?\s+INTO\s+(?:"([^"]+)"|`([^`]+)`|([A-Za-z_][A-Za-z0-9_]*))\S*\(([^)]+)\)/i : stryMutAct_9fa48("164516") ? /^\s*INSERT(?:\s+OR\s+REPLACE)?\s+INTO\s+(?:"([^"]+)"|`([^`]+)`|([A-Za-z_][A-Za-z0-9_]*))\s\(([^)]+)\)/i : stryMutAct_9fa48("164515") ? /^\s*INSERT(?:\s+OR\s+REPLACE)?\s+INTO\s+(?:"([^"]+)"|`([^`]+)`|([A-Za-z_][^A-Za-z0-9_]*))\s*\(([^)]+)\)/i : stryMutAct_9fa48("164514") ? /^\s*INSERT(?:\s+OR\s+REPLACE)?\s+INTO\s+(?:"([^"]+)"|`([^`]+)`|([A-Za-z_][A-Za-z0-9_]))\s*\(([^)]+)\)/i : stryMutAct_9fa48("164513") ? /^\s*INSERT(?:\s+OR\s+REPLACE)?\s+INTO\s+(?:"([^"]+)"|`([^`]+)`|([^A-Za-z_][A-Za-z0-9_]*))\s*\(([^)]+)\)/i : stryMutAct_9fa48("164512") ? /^\s*INSERT(?:\s+OR\s+REPLACE)?\s+INTO\s+(?:"([^"]+)"|`([`]+)`|([A-Za-z_][A-Za-z0-9_]*))\s*\(([^)]+)\)/i : stryMutAct_9fa48("164511") ? /^\s*INSERT(?:\s+OR\s+REPLACE)?\s+INTO\s+(?:"([^"]+)"|`([^`])`|([A-Za-z_][A-Za-z0-9_]*))\s*\(([^)]+)\)/i : stryMutAct_9fa48("164510") ? /^\s*INSERT(?:\s+OR\s+REPLACE)?\s+INTO\s+(?:"(["]+)"|`([^`]+)`|([A-Za-z_][A-Za-z0-9_]*))\s*\(([^)]+)\)/i : stryMutAct_9fa48("164509") ? /^\s*INSERT(?:\s+OR\s+REPLACE)?\s+INTO\s+(?:"([^"])"|`([^`]+)`|([A-Za-z_][A-Za-z0-9_]*))\s*\(([^)]+)\)/i : stryMutAct_9fa48("164508") ? /^\s*INSERT(?:\s+OR\s+REPLACE)?\s+INTO\S+(?:"([^"]+)"|`([^`]+)`|([A-Za-z_][A-Za-z0-9_]*))\s*\(([^)]+)\)/i : stryMutAct_9fa48("164507") ? /^\s*INSERT(?:\s+OR\s+REPLACE)?\s+INTO\s(?:"([^"]+)"|`([^`]+)`|([A-Za-z_][A-Za-z0-9_]*))\s*\(([^)]+)\)/i : stryMutAct_9fa48("164506") ? /^\s*INSERT(?:\s+OR\s+REPLACE)?\S+INTO\s+(?:"([^"]+)"|`([^`]+)`|([A-Za-z_][A-Za-z0-9_]*))\s*\(([^)]+)\)/i : stryMutAct_9fa48("164505") ? /^\s*INSERT(?:\s+OR\s+REPLACE)?\sINTO\s+(?:"([^"]+)"|`([^`]+)`|([A-Za-z_][A-Za-z0-9_]*))\s*\(([^)]+)\)/i : stryMutAct_9fa48("164504") ? /^\s*INSERT(?:\s+OR\S+REPLACE)?\s+INTO\s+(?:"([^"]+)"|`([^`]+)`|([A-Za-z_][A-Za-z0-9_]*))\s*\(([^)]+)\)/i : stryMutAct_9fa48("164503") ? /^\s*INSERT(?:\s+OR\sREPLACE)?\s+INTO\s+(?:"([^"]+)"|`([^`]+)`|([A-Za-z_][A-Za-z0-9_]*))\s*\(([^)]+)\)/i : stryMutAct_9fa48("164502") ? /^\s*INSERT(?:\S+OR\s+REPLACE)?\s+INTO\s+(?:"([^"]+)"|`([^`]+)`|([A-Za-z_][A-Za-z0-9_]*))\s*\(([^)]+)\)/i : stryMutAct_9fa48("164501") ? /^\s*INSERT(?:\sOR\s+REPLACE)?\s+INTO\s+(?:"([^"]+)"|`([^`]+)`|([A-Za-z_][A-Za-z0-9_]*))\s*\(([^)]+)\)/i : stryMutAct_9fa48("164500") ? /^\s*INSERT(?:\s+OR\s+REPLACE)\s+INTO\s+(?:"([^"]+)"|`([^`]+)`|([A-Za-z_][A-Za-z0-9_]*))\s*\(([^)]+)\)/i : stryMutAct_9fa48("164499") ? /^\S*INSERT(?:\s+OR\s+REPLACE)?\s+INTO\s+(?:"([^"]+)"|`([^`]+)`|([A-Za-z_][A-Za-z0-9_]*))\s*\(([^)]+)\)/i : stryMutAct_9fa48("164498") ? /^\sINSERT(?:\s+OR\s+REPLACE)?\s+INTO\s+(?:"([^"]+)"|`([^`]+)`|([A-Za-z_][A-Za-z0-9_]*))\s*\(([^)]+)\)/i : stryMutAct_9fa48("164497") ? /\s*INSERT(?:\s+OR\s+REPLACE)?\s+INTO\s+(?:"([^"]+)"|`([^`]+)`|([A-Za-z_][A-Za-z0-9_]*))\s*\(([^)]+)\)/i : (stryCov_9fa48("164497", "164498", "164499", "164500", "164501", "164502", "164503", "164504", "164505", "164506", "164507", "164508", "164509", "164510", "164511", "164512", "164513", "164514", "164515", "164516", "164517", "164518", "164519"), /^\s*INSERT(?:\s+OR\s+REPLACE)?\s+INTO\s+(?:"([^"]+)"|`([^`]+)`|([A-Za-z_][A-Za-z0-9_]*))\s*\(([^)]+)\)/i);
const RAFT_PACKET_TYPE_APPEND_ACK = stryMutAct_9fa48("164520") ? "" : (stryCov_9fa48("164520"), 'append ack');
const RAFT_PACKET_TYPE_APPEND_FAIL = stryMutAct_9fa48("164521") ? "" : (stryCov_9fa48("164521"), 'append fail');
function isPromiseLike(value) {
  if (stryMutAct_9fa48("164522")) {
    {}
  } else {
    stryCov_9fa48("164522");
    return stryMutAct_9fa48("164525") ? !!value || typeof value.then === 'function' : stryMutAct_9fa48("164524") ? false : stryMutAct_9fa48("164523") ? true : (stryCov_9fa48("164523", "164524", "164525"), (stryMutAct_9fa48("164526") ? !value : (stryCov_9fa48("164526"), !(stryMutAct_9fa48("164527") ? value : (stryCov_9fa48("164527"), !value)))) && (stryMutAct_9fa48("164529") ? typeof value.then !== 'function' : stryMutAct_9fa48("164528") ? true : (stryCov_9fa48("164528", "164529"), typeof value.then === (stryMutAct_9fa48("164530") ? "" : (stryCov_9fa48("164530"), 'function')))));
  }
}

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
    if (stryMutAct_9fa48("164531")) {
      {}
    } else {
      stryCov_9fa48("164531");
      if (stryMutAct_9fa48("164534") ? false : stryMutAct_9fa48("164533") ? true : stryMutAct_9fa48("164532") ? options.groupId : (stryCov_9fa48("164532", "164533", "164534"), !options.groupId)) {
        if (stryMutAct_9fa48("164535")) {
          {}
        } else {
          stryCov_9fa48("164535");
          throw new Error(MESSAGE_GROUP_WORKER_ERROR_MSG.MISSING_GROUP_ID);
        }
      }
      super(stryMutAct_9fa48("164536") ? {} : (stryCov_9fa48("164536"), {
        nodeId: options.nodeId,
        entityType: WORKER_ENTITY_TYPE.MESSAGE_GROUP,
        replicaId: options.replicaId,
        logger: options.logger
      }));

      /** @type {string} Message group ID */
      this.groupId = options.groupId;

      /** @type {Array<string>} All replica IDs in the group */
      this.replicaIds = stryMutAct_9fa48("164539") ? options.replicaIds && [options.replicaId] : stryMutAct_9fa48("164538") ? false : stryMutAct_9fa48("164537") ? true : (stryCov_9fa48("164537", "164538", "164539"), options.replicaIds || (stryMutAct_9fa48("164540") ? [] : (stryCov_9fa48("164540"), [options.replicaId])));

      /** @type {Array<string>} Peer unified addresses */
      this.peerAddresses = stryMutAct_9fa48("164543") ? options.peerAddresses && [] : stryMutAct_9fa48("164542") ? false : stryMutAct_9fa48("164541") ? true : (stryCov_9fa48("164541", "164542", "164543"), options.peerAddresses || (stryMutAct_9fa48("164544") ? ["Stryker was here"] : (stryCov_9fa48("164544"), [])));

      /** @type {boolean} Whether to defer election start until explicitly armed */
      this.deferElection = stryMutAct_9fa48("164547") ? options.deferElection !== true : stryMutAct_9fa48("164546") ? false : stryMutAct_9fa48("164545") ? true : (stryCov_9fa48("164545", "164546", "164547"), options.deferElection === (stryMutAct_9fa48("164548") ? false : (stryCov_9fa48("164548"), true)));

      /** @type {Object|null} AddressManager instance */
      this.addressManager = stryMutAct_9fa48("164551") ? options.addressManager && null : stryMutAct_9fa48("164550") ? false : stryMutAct_9fa48("164549") ? true : (stryCov_9fa48("164549", "164550", "164551"), options.addressManager || null);

      /** @type {Object|null} SystemTableCache instance */
      this.systemTableCache = stryMutAct_9fa48("164554") ? options.systemTableCache && null : stryMutAct_9fa48("164553") ? false : stryMutAct_9fa48("164552") ? true : (stryCov_9fa48("164552", "164553", "164554"), options.systemTableCache || null);

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
      this.cdcSubscribed = stryMutAct_9fa48("164555") ? true : (stryCov_9fa48("164555"), false);

      /** @type {boolean} Whether leader activation has completed */
      this.leaderActivated = stryMutAct_9fa48("164556") ? true : (stryCov_9fa48("164556"), false);

      /** @type {Map<string, Object>} Pending CDC commits keyed by entry ID */
      this.pendingCDCCommits = new Map();

      /** @type {number} Monotonic counter for CDC commit correlation IDs */
      this.nextCDCCommitId = NUM.ZERO;

      /**
       * Whether the service is in bootstrap phase.
       * During bootstrap phase, SEED_CACHE messages are accepted.
       * @type {boolean}
       */
      this.bootstrapPhase = stryMutAct_9fa48("164557") ? false : (stryCov_9fa48("164557"), true);
    }
  }

  /**
   * Initialize message group with SQLite cache and RaftGroup.
   * Called by ReplicaWorkerBase.initialize() via onInitialize hook.
   * @return {Promise<void>}
   * @protected
   */
  async onInitialize() {
    if (stryMutAct_9fa48("164558")) {
      {}
    } else {
      stryCov_9fa48("164558");
      this.logger.info(MESSAGE_GROUP_WORKER_LOG_MSG.INITIALIZING_CACHE, stryMutAct_9fa48("164559") ? {} : (stryCov_9fa48("164559"), {
        groupId: this.groupId,
        replicaId: this.replicaId
      }));

      // Create and initialize SQLite system cache
      this.systemCache = new SQLiteSystemCache();
      this.systemCache.initialize();
      this.logger.info(MESSAGE_GROUP_WORKER_LOG_MSG.CACHE_INITIALIZED, stryMutAct_9fa48("164560") ? {} : (stryCov_9fa48("164560"), {
        groupId: this.groupId,
        replicaId: this.replicaId
      }));

      // Initialize Raft via RaftGroup composition
      await this.initializeRaft();
    }
  }

  /**
   * Initialize Raft consensus via RaftGroup composition.
   * @return {Promise<void>}
   * @private
   */
  async initializeRaft() {
    if (stryMutAct_9fa48("164561")) {
      {}
    } else {
      stryCov_9fa48("164561");
      this.logger.info(MESSAGE_GROUP_WORKER_LOG_MSG.INITIALIZING_RAFT, stryMutAct_9fa48("164562") ? {} : (stryCov_9fa48("164562"), {
        groupId: this.groupId,
        replicaId: this.replicaId,
        replicaCount: this.replicaIds.length
      }));

      // Create in-memory SQLite database for Raft log
      this.logDb = new Database(MESSAGE_GROUP_WORKER_DEFAULT.MEMORY_DB_PATH);
      this.logDb.pragma(stryMutAct_9fa48("164563") ? "" : (stryCov_9fa48("164563"), 'journal_mode = WAL'));

      // Create SQLite log adapter for liferaft
      this.logAdapter = new SQLiteLogAdapter(this.logDb);

      // Create PeerAddressResolver
      this.peerAddressResolver = new PeerAddressResolver(stryMutAct_9fa48("164564") ? {} : (stryCov_9fa48("164564"), {
        addressManager: this.addressManager,
        systemTableCache: this.systemTableCache,
        entityType: WORKER_ENTITY_TYPE.MESSAGE_GROUP,
        logger: this.logger
      }));

      // Create RaftGroup with all dependencies injected
      this.raftGroup = new RaftGroup(stryMutAct_9fa48("164565") ? {} : (stryCov_9fa48("164565"), {
        replicaId: this.replicaId,
        replicaIds: this.replicaIds,
        transport: this.messageBridge,
        entityType: WORKER_ENTITY_TYPE.MESSAGE_GROUP,
        peerAddressResolver: this.peerAddressResolver,
        unifiedAddress: this.unifiedAddress,
        peerAddresses: this.peerAddresses,
        logAdapter: this.logAdapter,
        deferElection: this.deferElection,
        heartbeatMs: MESSAGE_GROUP_WORKER_DEFAULT.HEARTBEAT_MS,
        electionMinMs: MESSAGE_GROUP_WORKER_DEFAULT.ELECTION_MIN_MS,
        electionMaxMs: MESSAGE_GROUP_WORKER_DEFAULT.ELECTION_MAX_MS,
        electionJitterPerReplicaMs: MESSAGE_GROUP_WORKER_DEFAULT.ELECTION_JITTER_PER_REPLICA_MS,
        logger: this.logger
      }));

      // Wire RaftGroup events
      this.wireRaftGroupEvents();

      // Initialize and join peers
      this.raftGroup.initialize();
      this.raftGroup.joinPeers();
      if (stryMutAct_9fa48("164568") ? this.replicaIds.length !== NUM.ONE : stryMutAct_9fa48("164567") ? false : stryMutAct_9fa48("164566") ? true : (stryCov_9fa48("164566", "164567", "164568"), this.replicaIds.length === NUM.ONE)) {
        if (stryMutAct_9fa48("164569")) {
          {}
        } else {
          stryCov_9fa48("164569");
          this.raftGroup.startElection();
        }
      }
      this.logger.info(MESSAGE_GROUP_WORKER_LOG_MSG.RAFT_INITIALIZED, stryMutAct_9fa48("164570") ? {} : (stryCov_9fa48("164570"), {
        groupId: this.groupId,
        replicaId: this.replicaId
      }));
    }
  }

  /**
   * Wire RaftGroup events to message-group-specific handlers.
   * @private
   */
  wireRaftGroupEvents() {
    if (stryMutAct_9fa48("164571")) {
      {}
    } else {
      stryCov_9fa48("164571");
      this.raftGroup.on(RAFT_GROUP_EVENT.LEADER, () => {
        if (stryMutAct_9fa48("164572")) {
          {}
        } else {
          stryCov_9fa48("164572");
          const wasLeaderActivated = this.leaderActivated;
          this.leaderActivated = stryMutAct_9fa48("164573") ? false : (stryCov_9fa48("164573"), true);
          this.logger.info(MESSAGE_GROUP_WORKER_LOG_MSG.BECAME_LEADER, stryMutAct_9fa48("164574") ? {} : (stryCov_9fa48("164574"), {
            groupId: this.groupId,
            replicaId: this.replicaId
          }));
          if (stryMutAct_9fa48("164577") ? !wasLeaderActivated || !this.cdcSubscribed : stryMutAct_9fa48("164576") ? false : stryMutAct_9fa48("164575") ? true : (stryCov_9fa48("164575", "164576", "164577"), (stryMutAct_9fa48("164578") ? wasLeaderActivated : (stryCov_9fa48("164578"), !wasLeaderActivated)) && (stryMutAct_9fa48("164579") ? this.cdcSubscribed : (stryCov_9fa48("164579"), !this.cdcSubscribed)))) {
            if (stryMutAct_9fa48("164580")) {
              {}
            } else {
              stryCov_9fa48("164580");
              this.subscribeToCDC().catch(error => {
                if (stryMutAct_9fa48("164581")) {
                  {}
                } else {
                  stryCov_9fa48("164581");
                  this.logger.error(MESSAGE_GROUP_WORKER_ERROR_MSG.CDC_SUBSCRIPTION_FAILED, stryMutAct_9fa48("164582") ? {} : (stryCov_9fa48("164582"), {
                    groupId: this.groupId,
                    replicaId: this.replicaId,
                    error: error.message
                  }));
                }
              });
            }
          }
        }
      });
      this.raftGroup.on(RAFT_GROUP_EVENT.FOLLOWER, () => {
        if (stryMutAct_9fa48("164583")) {
          {}
        } else {
          stryCov_9fa48("164583");
          this.leaderActivated = stryMutAct_9fa48("164584") ? true : (stryCov_9fa48("164584"), false);
          const wasLeader = this.cdcSubscribed;
          if (stryMutAct_9fa48("164586") ? false : stryMutAct_9fa48("164585") ? true : (stryCov_9fa48("164585", "164586"), wasLeader)) {
            if (stryMutAct_9fa48("164587")) {
              {}
            } else {
              stryCov_9fa48("164587");
              this.unsubscribeFromCDC().catch(error => {
                if (stryMutAct_9fa48("164588")) {
                  {}
                } else {
                  stryCov_9fa48("164588");
                  this.logger.error(MESSAGE_GROUP_WORKER_ERROR_MSG.CDC_UNSUBSCRIPTION_FAILED, stryMutAct_9fa48("164589") ? {} : (stryCov_9fa48("164589"), {
                    groupId: this.groupId,
                    replicaId: this.replicaId,
                    error: error.message
                  }));
                }
              });
            }
          }
        }
      });
      this.raftGroup.on(RAFT_GROUP_EVENT.CANDIDATE, () => {
        if (stryMutAct_9fa48("164590")) {
          {}
        } else {
          stryCov_9fa48("164590");
          this.leaderActivated = stryMutAct_9fa48("164591") ? true : (stryCov_9fa48("164591"), false);
          const wasLeader = this.cdcSubscribed;
          if (stryMutAct_9fa48("164593") ? false : stryMutAct_9fa48("164592") ? true : (stryCov_9fa48("164592", "164593"), wasLeader)) {
            if (stryMutAct_9fa48("164594")) {
              {}
            } else {
              stryCov_9fa48("164594");
              this.unsubscribeFromCDC().catch(error => {
                if (stryMutAct_9fa48("164595")) {
                  {}
                } else {
                  stryCov_9fa48("164595");
                  this.logger.error(MESSAGE_GROUP_WORKER_ERROR_MSG.CDC_UNSUBSCRIPTION_FAILED, stryMutAct_9fa48("164596") ? {} : (stryCov_9fa48("164596"), {
                    groupId: this.groupId,
                    replicaId: this.replicaId,
                    error: error.message
                  }));
                }
              });
            }
          }
        }
      });
      this.raftGroup.on(RAFT_GROUP_EVENT.LEADER_CHANGE, newLeader => {
        if (stryMutAct_9fa48("164597")) {
          {}
        } else {
          stryCov_9fa48("164597");
          this.leaderActivated = stryMutAct_9fa48("164598") ? true : (stryCov_9fa48("164598"), false);
          const wasLeader = this.cdcSubscribed;
          const isNowLeader = stryMutAct_9fa48("164601") ? newLeader !== this.unifiedAddress : stryMutAct_9fa48("164600") ? false : stryMutAct_9fa48("164599") ? true : (stryCov_9fa48("164599", "164600", "164601"), newLeader === this.unifiedAddress);
          this.logger.info(MESSAGE_GROUP_WORKER_LOG_MSG.LEADER_CHANGED, stryMutAct_9fa48("164602") ? {} : (stryCov_9fa48("164602"), {
            groupId: this.groupId,
            replicaId: this.replicaId,
            newLeader
          }));
          if (stryMutAct_9fa48("164605") ? !isNowLeader || wasLeader : stryMutAct_9fa48("164604") ? false : stryMutAct_9fa48("164603") ? true : (stryCov_9fa48("164603", "164604", "164605"), (stryMutAct_9fa48("164606") ? isNowLeader : (stryCov_9fa48("164606"), !isNowLeader)) && wasLeader)) {
            if (stryMutAct_9fa48("164607")) {
              {}
            } else {
              stryCov_9fa48("164607");
              this.unsubscribeFromCDC().catch(error => {
                if (stryMutAct_9fa48("164608")) {
                  {}
                } else {
                  stryCov_9fa48("164608");
                  this.logger.error(MESSAGE_GROUP_WORKER_ERROR_MSG.CDC_UNSUBSCRIPTION_FAILED, stryMutAct_9fa48("164609") ? {} : (stryCov_9fa48("164609"), {
                    groupId: this.groupId,
                    replicaId: this.replicaId,
                    error: error.message
                  }));
                }
              });
            }
          }
        }
      });

      // Handle committed entries (for CDC replication)
      this.raftGroup.on(RAFT_GROUP_EVENT.COMMIT, entry => {
        if (stryMutAct_9fa48("164610")) {
          {}
        } else {
          stryCov_9fa48("164610");
          this.handleCommittedEntry(entry).catch(error => {
            if (stryMutAct_9fa48("164611")) {
              {}
            } else {
              stryCov_9fa48("164611");
              this.logger.error(MESSAGE_GROUP_WORKER_ERROR_MSG.CDC_APPLY_FAILED, stryMutAct_9fa48("164612") ? {} : (stryCov_9fa48("164612"), {
                groupId: this.groupId,
                replicaId: this.replicaId,
                error: error.message
              }));
            }
          });
        }
      });
    }
  }

  /**
   * Handle committed Raft entry.
   * Applies CDC events to local cache when committed.
   * @param {Object|string} entry - Committed Raft log entry.
   * @return {Promise<void>}
   * @private
   */
  async handleCommittedEntry(entry) {
    if (stryMutAct_9fa48("164613")) {
      {}
    } else {
      stryCov_9fa48("164613");
      if (stryMutAct_9fa48("164616") ? false : stryMutAct_9fa48("164615") ? true : stryMutAct_9fa48("164614") ? entry : (stryCov_9fa48("164614", "164615", "164616"), !entry)) {
        if (stryMutAct_9fa48("164617")) {
          {}
        } else {
          stryCov_9fa48("164617");
          return;
        }
      }
      const command = (stryMutAct_9fa48("164620") ? typeof entry !== 'string' : stryMutAct_9fa48("164619") ? false : stryMutAct_9fa48("164618") ? true : (stryCov_9fa48("164618", "164619", "164620"), typeof entry === (stryMutAct_9fa48("164621") ? "" : (stryCov_9fa48("164621"), 'string')))) ? JSON.parse(entry) : entry;

      // Handle wrapped entry format (entry.command)
      const data = command.command ? (stryMutAct_9fa48("164624") ? typeof command.command !== 'string' : stryMutAct_9fa48("164623") ? false : stryMutAct_9fa48("164622") ? true : (stryCov_9fa48("164622", "164623", "164624"), typeof command.command === (stryMutAct_9fa48("164625") ? "" : (stryCov_9fa48("164625"), 'string')))) ? JSON.parse(command.command) : command.command : command;
      if (stryMutAct_9fa48("164628") ? data.type !== CDC_REPLICATION_TYPE : stryMutAct_9fa48("164627") ? false : stryMutAct_9fa48("164626") ? true : (stryCov_9fa48("164626", "164627", "164628"), data.type === CDC_REPLICATION_TYPE)) {
        if (stryMutAct_9fa48("164629")) {
          {}
        } else {
          stryCov_9fa48("164629");
          // Apply CDC event to local cache
          this.applyCacheMutation(data.tableName, data.operation, data.data);
          this.resolvePendingCDCCommit(data.entryId);
          this.logger.debug(MESSAGE_GROUP_WORKER_LOG_MSG.CDC_EVENT_APPLIED, stryMutAct_9fa48("164630") ? {} : (stryCov_9fa48("164630"), {
            groupId: this.groupId,
            replicaId: this.replicaId,
            tableName: data.tableName,
            operation: data.operation
          }));
        }
      }
    }
  }

  /**
   * Start the message group service.
   * Called by ReplicaWorkerBase.start() via onStart hook.
   * @return {Promise<void>}
   * @protected
   */
  async onStart() {
    if (stryMutAct_9fa48("164631")) {
      {}
    } else {
      stryCov_9fa48("164631");
      if (stryMutAct_9fa48("164634") ? this.isLeaderActivated() || !this.cdcSubscribed : stryMutAct_9fa48("164633") ? false : stryMutAct_9fa48("164632") ? true : (stryCov_9fa48("164632", "164633", "164634"), this.isLeaderActivated() && (stryMutAct_9fa48("164635") ? this.cdcSubscribed : (stryCov_9fa48("164635"), !this.cdcSubscribed)))) {
        if (stryMutAct_9fa48("164636")) {
          {}
        } else {
          stryCov_9fa48("164636");
          await this.subscribeToCDC();
        }
      }
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
    if (stryMutAct_9fa48("164637")) {
      {}
    } else {
      stryCov_9fa48("164637");
      this.leaderActivated = stryMutAct_9fa48("164638") ? true : (stryCov_9fa48("164638"), false);

      // Unsubscribe from CDC events
      if (stryMutAct_9fa48("164640") ? false : stryMutAct_9fa48("164639") ? true : (stryCov_9fa48("164639", "164640"), this.cdcSubscribed)) {
        if (stryMutAct_9fa48("164641")) {
          {}
        } else {
          stryCov_9fa48("164641");
          await this.unsubscribeFromCDC();
        }
      }
      this.clearPendingCDCCommits(stryMutAct_9fa48("164642") ? "" : (stryCov_9fa48("164642"), 'MessageGroupWorkerService stopped before CDC commit'));

      // Shutdown RaftGroup
      if (stryMutAct_9fa48("164644") ? false : stryMutAct_9fa48("164643") ? true : (stryCov_9fa48("164643", "164644"), this.raftGroup)) {
        if (stryMutAct_9fa48("164645")) {
          {}
        } else {
          stryCov_9fa48("164645");
          this.logger.info(MESSAGE_GROUP_WORKER_LOG_MSG.STOPPING_RAFT, stryMutAct_9fa48("164646") ? {} : (stryCov_9fa48("164646"), {
            groupId: this.groupId,
            replicaId: this.replicaId
          }));
          await this.raftGroup.shutdown();
          this.raftGroup = null;
          this.logger.info(MESSAGE_GROUP_WORKER_LOG_MSG.RAFT_STOPPED, stryMutAct_9fa48("164647") ? {} : (stryCov_9fa48("164647"), {
            groupId: this.groupId,
            replicaId: this.replicaId
          }));
        }
      }

      // Close log adapter
      if (stryMutAct_9fa48("164649") ? false : stryMutAct_9fa48("164648") ? true : (stryCov_9fa48("164648", "164649"), this.logAdapter)) {
        if (stryMutAct_9fa48("164650")) {
          {}
        } else {
          stryCov_9fa48("164650");
          this.logAdapter.close();
          this.logAdapter = null;
        }
      }

      // Close log database
      if (stryMutAct_9fa48("164652") ? false : stryMutAct_9fa48("164651") ? true : (stryCov_9fa48("164651", "164652"), this.logDb)) {
        if (stryMutAct_9fa48("164653")) {
          {}
        } else {
          stryCov_9fa48("164653");
          this.logDb.close();
          this.logDb = null;
        }
      }

      // Close system cache
      if (stryMutAct_9fa48("164655") ? false : stryMutAct_9fa48("164654") ? true : (stryCov_9fa48("164654", "164655"), this.systemCache)) {
        if (stryMutAct_9fa48("164656")) {
          {}
        } else {
          stryCov_9fa48("164656");
          this.logger.info(MESSAGE_GROUP_WORKER_LOG_MSG.CLOSING_CACHE, stryMutAct_9fa48("164657") ? {} : (stryCov_9fa48("164657"), {
            groupId: this.groupId,
            replicaId: this.replicaId
          }));
          this.systemCache.close();
          this.systemCache = null;
          this.logger.info(MESSAGE_GROUP_WORKER_LOG_MSG.CACHE_CLOSED, stryMutAct_9fa48("164658") ? {} : (stryCov_9fa48("164658"), {
            groupId: this.groupId,
            replicaId: this.replicaId
          }));
        }
      }
    }
  }

  /**
   * Subscribe to CDC events from partition leaders (leader only).
   * @param {Array<string>} [partitionAddresses] - Partition addresses.
   * @return {Promise<void>}
   */
  async subscribeToCDC(partitionAddresses = stryMutAct_9fa48("164659") ? ["Stryker was here"] : (stryCov_9fa48("164659"), [])) {
    if (stryMutAct_9fa48("164660")) {
      {}
    } else {
      stryCov_9fa48("164660");
      if (stryMutAct_9fa48("164662") ? false : stryMutAct_9fa48("164661") ? true : (stryCov_9fa48("164661", "164662"), this.cdcSubscribed)) {
        if (stryMutAct_9fa48("164663")) {
          {}
        } else {
          stryCov_9fa48("164663");
          return;
        }
      }
      this.logger.info(MESSAGE_GROUP_WORKER_LOG_MSG.SUBSCRIBING_CDC, stryMutAct_9fa48("164664") ? {} : (stryCov_9fa48("164664"), {
        groupId: this.groupId,
        replicaId: this.replicaId,
        isLeader: this.isLeaderReplica(),
        partitionCount: partitionAddresses.length
      }));

      // Send SUBSCRIBE_CDC messages to each partition address
      for (const partitionAddress of partitionAddresses) {
        if (stryMutAct_9fa48("164665")) {
          {}
        } else {
          stryCov_9fa48("164665");
          try {
            if (stryMutAct_9fa48("164666")) {
              {}
            } else {
              stryCov_9fa48("164666");
              if (stryMutAct_9fa48("164668") ? false : stryMutAct_9fa48("164667") ? true : (stryCov_9fa48("164667", "164668"), this.messageBridge)) {
                if (stryMutAct_9fa48("164669")) {
                  {}
                } else {
                  stryCov_9fa48("164669");
                  await this.messageBridge.send(partitionAddress, stryMutAct_9fa48("164670") ? {} : (stryCov_9fa48("164670"), {
                    type: CDC_MESSAGE_TYPE.SUBSCRIBE_CDC,
                    subscriberAddress: this.unifiedAddress
                  }));
                  this.cdcSubscriptions.add(partitionAddress);
                }
              }
            }
          } catch (error) {
            if (stryMutAct_9fa48("164671")) {
              {}
            } else {
              stryCov_9fa48("164671");
              this.logger.warn(stryMutAct_9fa48("164672") ? "" : (stryCov_9fa48("164672"), 'Failed to subscribe to partition CDC'), stryMutAct_9fa48("164673") ? {} : (stryCov_9fa48("164673"), {
                groupId: this.groupId,
                partitionAddress,
                error: error.message
              }));
            }
          }
        }
      }
      this.cdcSubscribed = stryMutAct_9fa48("164674") ? false : (stryCov_9fa48("164674"), true);
      this.logger.info(MESSAGE_GROUP_WORKER_LOG_MSG.SUBSCRIBED_CDC, stryMutAct_9fa48("164675") ? {} : (stryCov_9fa48("164675"), {
        groupId: this.groupId,
        replicaId: this.replicaId,
        subscriptionCount: this.cdcSubscriptions.size
      }));
    }
  }

  /**
   * Unsubscribe from CDC events (when losing leadership).
   * @return {Promise<void>}
   */
  async unsubscribeFromCDC() {
    if (stryMutAct_9fa48("164676")) {
      {}
    } else {
      stryCov_9fa48("164676");
      if (stryMutAct_9fa48("164679") ? false : stryMutAct_9fa48("164678") ? true : stryMutAct_9fa48("164677") ? this.cdcSubscribed : (stryCov_9fa48("164677", "164678", "164679"), !this.cdcSubscribed)) {
        if (stryMutAct_9fa48("164680")) {
          {}
        } else {
          stryCov_9fa48("164680");
          return;
        }
      }
      this.logger.info(MESSAGE_GROUP_WORKER_LOG_MSG.UNSUBSCRIBING_CDC, stryMutAct_9fa48("164681") ? {} : (stryCov_9fa48("164681"), {
        groupId: this.groupId,
        replicaId: this.replicaId,
        subscriptionCount: this.cdcSubscriptions.size
      }));

      // Send UNSUBSCRIBE_CDC messages to each subscribed partition
      for (const partitionAddress of this.cdcSubscriptions) {
        if (stryMutAct_9fa48("164682")) {
          {}
        } else {
          stryCov_9fa48("164682");
          try {
            if (stryMutAct_9fa48("164683")) {
              {}
            } else {
              stryCov_9fa48("164683");
              if (stryMutAct_9fa48("164685") ? false : stryMutAct_9fa48("164684") ? true : (stryCov_9fa48("164684", "164685"), this.messageBridge)) {
                if (stryMutAct_9fa48("164686")) {
                  {}
                } else {
                  stryCov_9fa48("164686");
                  await this.messageBridge.send(partitionAddress, stryMutAct_9fa48("164687") ? {} : (stryCov_9fa48("164687"), {
                    type: CDC_MESSAGE_TYPE.UNSUBSCRIBE_CDC,
                    subscriberAddress: this.unifiedAddress
                  }));
                }
              }
            }
          } catch (error) {
            if (stryMutAct_9fa48("164688")) {
              {}
            } else {
              stryCov_9fa48("164688");
              this.logger.warn(stryMutAct_9fa48("164689") ? "" : (stryCov_9fa48("164689"), 'Failed to unsubscribe from partition CDC'), stryMutAct_9fa48("164690") ? {} : (stryCov_9fa48("164690"), {
                groupId: this.groupId,
                partitionAddress,
                error: error.message
              }));
            }
          }
        }
      }
      this.cdcSubscriptions.clear();
      this.cdcSubscribed = stryMutAct_9fa48("164691") ? true : (stryCov_9fa48("164691"), false);
      this.logger.info(MESSAGE_GROUP_WORKER_LOG_MSG.UNSUBSCRIBED_CDC, stryMutAct_9fa48("164692") ? {} : (stryCov_9fa48("164692"), {
        groupId: this.groupId,
        replicaId: this.replicaId
      }));
    }
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
    if (stryMutAct_9fa48("164693")) {
      {}
    } else {
      stryCov_9fa48("164693");
      if (stryMutAct_9fa48("164696") ? !this.initialized && !this.systemCache : stryMutAct_9fa48("164695") ? false : stryMutAct_9fa48("164694") ? true : (stryCov_9fa48("164694", "164695", "164696"), (stryMutAct_9fa48("164697") ? this.initialized : (stryCov_9fa48("164697"), !this.initialized)) || (stryMutAct_9fa48("164698") ? this.systemCache : (stryCov_9fa48("164698"), !this.systemCache)))) {
        if (stryMutAct_9fa48("164699")) {
          {}
        } else {
          stryCov_9fa48("164699");
          throw new Error(MESSAGE_GROUP_WORKER_ERROR_MSG.NOT_INITIALIZED);
        }
      }
      this.logger.debug(MESSAGE_GROUP_WORKER_LOG_MSG.APPLYING_CDC_EVENT, stryMutAct_9fa48("164700") ? {} : (stryCov_9fa48("164700"), {
        groupId: this.groupId,
        replicaId: this.replicaId,
        tableName: cdcEvent.tableName,
        operation: cdcEvent.operation
      }));
      const isLeaderReplica = this.isLeaderReplica();
      if (stryMutAct_9fa48("164702") ? false : stryMutAct_9fa48("164701") ? true : (stryCov_9fa48("164701", "164702"), isLeaderReplica)) {
        if (stryMutAct_9fa48("164703")) {
          {}
        } else {
          stryCov_9fa48("164703");
          // Leader: replicate via Raft, then apply on commit
          await this.replicateCDCEvent(cdcEvent);
        }
      } else {
        if (stryMutAct_9fa48("164704")) {
          {}
        } else {
          stryCov_9fa48("164704");
          // Follower: apply directly
          this.applyCacheMutation(cdcEvent.tableName, cdcEvent.operation, cdcEvent.data);
        }
      }
      if (stryMutAct_9fa48("164707") ? false : stryMutAct_9fa48("164706") ? true : stryMutAct_9fa48("164705") ? isLeaderReplica : (stryCov_9fa48("164705", "164706", "164707"), !isLeaderReplica)) {
        if (stryMutAct_9fa48("164708")) {
          {}
        } else {
          stryCov_9fa48("164708");
          this.logger.debug(MESSAGE_GROUP_WORKER_LOG_MSG.CDC_EVENT_APPLIED, stryMutAct_9fa48("164709") ? {} : (stryCov_9fa48("164709"), {
            groupId: this.groupId,
            replicaId: this.replicaId,
            tableName: cdcEvent.tableName,
            operation: cdcEvent.operation
          }));
        }
      }
    }
  }

  /**
   * Replicate CDC event to followers via Raft.
   * @param {Object} cdcEvent - CDC event to replicate.
   * @return {Promise<void>}
   * @private
   */
  async replicateCDCEvent(cdcEvent) {
    if (stryMutAct_9fa48("164710")) {
      {}
    } else {
      stryCov_9fa48("164710");
      const raft = this.raftGroup ? this.raftGroup.getRaftInstance() : null;
      if (stryMutAct_9fa48("164713") ? false : stryMutAct_9fa48("164712") ? true : stryMutAct_9fa48("164711") ? raft : (stryCov_9fa48("164711", "164712", "164713"), !raft)) {
        if (stryMutAct_9fa48("164714")) {
          {}
        } else {
          stryCov_9fa48("164714");
          throw new Error(MESSAGE_GROUP_WORKER_ERROR_MSG.NOT_INITIALIZED);
        }
      }
      this.logger.debug(MESSAGE_GROUP_WORKER_LOG_MSG.REPLICATING_CDC, stryMutAct_9fa48("164715") ? {} : (stryCov_9fa48("164715"), {
        groupId: this.groupId,
        replicaId: this.replicaId,
        tableName: cdcEvent.tableName,
        operation: cdcEvent.operation
      }));

      // Create Raft log entry for CDC replication
      const command = stryMutAct_9fa48("164716") ? {} : (stryCov_9fa48("164716"), {
        type: CDC_REPLICATION_TYPE,
        entryId: this.createCDCCommitEntryId(),
        tableName: cdcEvent.tableName,
        operation: cdcEvent.operation,
        data: cdcEvent.data,
        sourcePartitionId: cdcEvent.sourcePartitionId,
        hlcTimestamp: cdcEvent.hlcTimestamp,
        sequenceNumber: cdcEvent.sequenceNumber
      });
      const commitPromise = this.waitForCDCCommit(command.entryId, MESSAGE_GROUP_WORKER_DEFAULT.RAFT_COMMIT_TIMEOUT_MS);
      commitPromise.catch(() => {});
      try {
        if (stryMutAct_9fa48("164717")) {
          {}
        } else {
          stryCov_9fa48("164717");
          await this.proposeCDCCommand(raft, command);
        }
      } catch (error) {
        if (stryMutAct_9fa48("164718")) {
          {}
        } else {
          stryCov_9fa48("164718");
          this.rejectPendingCDCCommit(command.entryId, error);
          throw error;
        }
      }
      await commitPromise;
      this.logger.debug(MESSAGE_GROUP_WORKER_LOG_MSG.CDC_REPLICATED, stryMutAct_9fa48("164719") ? {} : (stryCov_9fa48("164719"), {
        groupId: this.groupId,
        replicaId: this.replicaId,
        entryId: command.entryId
      }));
    }
  }

  /**
   * Create a unique correlation ID for one CDC commit.
   * @return {string} CDC entry ID.
   * @private
   */
  createCDCCommitEntryId() {
    if (stryMutAct_9fa48("164720")) {
      {}
    } else {
      stryCov_9fa48("164720");
      stryMutAct_9fa48("164721") ? this.nextCDCCommitId -= NUM.ONE : (stryCov_9fa48("164721"), this.nextCDCCommitId += NUM.ONE);
      return stryMutAct_9fa48("164722") ? `` : (stryCov_9fa48("164722"), `${this.replicaId}:cdc:${this.nextCDCCommitId}`);
    }
  }

  /**
   * Propose a CDC command to the raw raft instance.
   * Supports both promise-returning raft nodes and callback-only mocks.
   * @param {Object} raft - Raw raft instance.
   * @param {Object} command - CDC command payload.
   * @return {Promise<void>}
   * @private
   */
  proposeCDCCommand(raft, command) {
    if (stryMutAct_9fa48("164723")) {
      {}
    } else {
      stryCov_9fa48("164723");
      return new Promise((resolve, reject) => {
        if (stryMutAct_9fa48("164724")) {
          {}
        } else {
          stryCov_9fa48("164724");
          let settled = stryMutAct_9fa48("164725") ? true : (stryCov_9fa48("164725"), false);
          const settleResolve = () => {
            if (stryMutAct_9fa48("164726")) {
              {}
            } else {
              stryCov_9fa48("164726");
              if (stryMutAct_9fa48("164728") ? false : stryMutAct_9fa48("164727") ? true : (stryCov_9fa48("164727", "164728"), settled)) {
                if (stryMutAct_9fa48("164729")) {
                  {}
                } else {
                  stryCov_9fa48("164729");
                  return;
                }
              }
              settled = stryMutAct_9fa48("164730") ? false : (stryCov_9fa48("164730"), true);
              resolve();
            }
          };
          const settleReject = error => {
            if (stryMutAct_9fa48("164731")) {
              {}
            } else {
              stryCov_9fa48("164731");
              if (stryMutAct_9fa48("164733") ? false : stryMutAct_9fa48("164732") ? true : (stryCov_9fa48("164732", "164733"), settled)) {
                if (stryMutAct_9fa48("164734")) {
                  {}
                } else {
                  stryCov_9fa48("164734");
                  return;
                }
              }
              settled = stryMutAct_9fa48("164735") ? false : (stryCov_9fa48("164735"), true);
              reject(error);
            }
          };
          try {
            if (stryMutAct_9fa48("164736")) {
              {}
            } else {
              stryCov_9fa48("164736");
              const proposal = raft.command(JSON.stringify(command), error => {
                if (stryMutAct_9fa48("164737")) {
                  {}
                } else {
                  stryCov_9fa48("164737");
                  if (stryMutAct_9fa48("164739") ? false : stryMutAct_9fa48("164738") ? true : (stryCov_9fa48("164738", "164739"), error)) {
                    if (stryMutAct_9fa48("164740")) {
                      {}
                    } else {
                      stryCov_9fa48("164740");
                      settleReject(error);
                    }
                  } else {
                    if (stryMutAct_9fa48("164741")) {
                      {}
                    } else {
                      stryCov_9fa48("164741");
                      settleResolve();
                    }
                  }
                }
              });
              if (stryMutAct_9fa48("164743") ? false : stryMutAct_9fa48("164742") ? true : (stryCov_9fa48("164742", "164743"), isPromiseLike(proposal))) {
                if (stryMutAct_9fa48("164744")) {
                  {}
                } else {
                  stryCov_9fa48("164744");
                  proposal.then(() => {
                    if (stryMutAct_9fa48("164745")) {
                      {}
                    } else {
                      stryCov_9fa48("164745");
                      settleResolve();
                    }
                  }).catch(error => {
                    if (stryMutAct_9fa48("164746")) {
                      {}
                    } else {
                      stryCov_9fa48("164746");
                      settleReject(error);
                    }
                  });
                }
              }
            }
          } catch (error) {
            if (stryMutAct_9fa48("164747")) {
              {}
            } else {
              stryCov_9fa48("164747");
              settleReject(error);
            }
          }
        }
      });
    }
  }

  /**
   * Wait for the matching CDC entry to commit locally.
   * @param {string} entryId - CDC entry correlation ID.
   * @param {number} timeoutMs - Max wait budget.
   * @return {Promise<void>}
   * @private
   */
  waitForCDCCommit(entryId, timeoutMs) {
    if (stryMutAct_9fa48("164748")) {
      {}
    } else {
      stryCov_9fa48("164748");
      return new Promise((resolve, reject) => {
        if (stryMutAct_9fa48("164749")) {
          {}
        } else {
          stryCov_9fa48("164749");
          const timeoutId = setTimeout(() => {
            if (stryMutAct_9fa48("164750")) {
              {}
            } else {
              stryCov_9fa48("164750");
              this.rejectPendingCDCCommit(entryId, new Error(stryMutAct_9fa48("164751") ? `` : (stryCov_9fa48("164751"), `${MESSAGE_GROUP_WORKER_ERROR_MSG.RAFT_COMMIT_TIMEOUT} after ${timeoutMs}ms`)));
            }
          }, timeoutMs);
          this.pendingCDCCommits.set(entryId, stryMutAct_9fa48("164752") ? {} : (stryCov_9fa48("164752"), {
            resolve,
            reject,
            timeoutId
          }));
        }
      });
    }
  }

  /**
   * Resolve one pending CDC commit.
   * @param {string} entryId - CDC entry correlation ID.
   * @return {boolean} True when a pending commit was resolved.
   * @private
   */
  resolvePendingCDCCommit(entryId) {
    if (stryMutAct_9fa48("164753")) {
      {}
    } else {
      stryCov_9fa48("164753");
      if (stryMutAct_9fa48("164756") ? false : stryMutAct_9fa48("164755") ? true : stryMutAct_9fa48("164754") ? entryId : (stryCov_9fa48("164754", "164755", "164756"), !entryId)) {
        if (stryMutAct_9fa48("164757")) {
          {}
        } else {
          stryCov_9fa48("164757");
          return stryMutAct_9fa48("164758") ? true : (stryCov_9fa48("164758"), false);
        }
      }
      const pending = this.pendingCDCCommits.get(entryId);
      if (stryMutAct_9fa48("164761") ? false : stryMutAct_9fa48("164760") ? true : stryMutAct_9fa48("164759") ? pending : (stryCov_9fa48("164759", "164760", "164761"), !pending)) {
        if (stryMutAct_9fa48("164762")) {
          {}
        } else {
          stryCov_9fa48("164762");
          return stryMutAct_9fa48("164763") ? true : (stryCov_9fa48("164763"), false);
        }
      }
      clearTimeout(pending.timeoutId);
      this.pendingCDCCommits.delete(entryId);
      pending.resolve();
      return stryMutAct_9fa48("164764") ? false : (stryCov_9fa48("164764"), true);
    }
  }

  /**
   * Reject one pending CDC commit.
   * @param {string} entryId - CDC entry correlation ID.
   * @param {Error|string} error - Rejection reason.
   * @return {boolean} True when a pending commit was rejected.
   * @private
   */
  rejectPendingCDCCommit(entryId, error) {
    if (stryMutAct_9fa48("164765")) {
      {}
    } else {
      stryCov_9fa48("164765");
      const pending = this.pendingCDCCommits.get(entryId);
      if (stryMutAct_9fa48("164768") ? false : stryMutAct_9fa48("164767") ? true : stryMutAct_9fa48("164766") ? pending : (stryCov_9fa48("164766", "164767", "164768"), !pending)) {
        if (stryMutAct_9fa48("164769")) {
          {}
        } else {
          stryCov_9fa48("164769");
          return stryMutAct_9fa48("164770") ? true : (stryCov_9fa48("164770"), false);
        }
      }
      clearTimeout(pending.timeoutId);
      this.pendingCDCCommits.delete(entryId);
      pending.reject(error instanceof Error ? error : new Error(String(error)));
      return stryMutAct_9fa48("164771") ? false : (stryCov_9fa48("164771"), true);
    }
  }

  /**
   * Reject all pending CDC commits.
   * @param {string} reason - Rejection reason.
   * @private
   */
  clearPendingCDCCommits(reason) {
    if (stryMutAct_9fa48("164772")) {
      {}
    } else {
      stryCov_9fa48("164772");
      for (const entryId of this.pendingCDCCommits.keys()) {
        if (stryMutAct_9fa48("164773")) {
          {}
        } else {
          stryCov_9fa48("164773");
          this.rejectPendingCDCCommit(entryId, reason);
        }
      }
    }
  }

  /**
   * Get system cache for local queries.
   * @return {SQLiteSystemCache} Local system cache.
   */
  getSystemCache() {
    if (stryMutAct_9fa48("164774")) {
      {}
    } else {
      stryCov_9fa48("164774");
      return this.systemCache;
    }
  }

  /**
   * Handle one CDC_EVENT message through the canonical CDC dispatcher.
   * @param {Object} message - Incoming CDC message.
   * @return {Object} Worker response.
   * @private
   */
  handleCDCMessage(message) {
    if (stryMutAct_9fa48("164775")) {
      {}
    } else {
      stryCov_9fa48("164775");
      const cdcEvent = stryMutAct_9fa48("164778") ? message.cdcEvent && message : stryMutAct_9fa48("164777") ? false : stryMutAct_9fa48("164776") ? true : (stryCov_9fa48("164776", "164777", "164778"), message.cdcEvent || message);
      const isLeaderReplica = this.isLeaderReplica();
      let leaderAddress = null;
      if (stryMutAct_9fa48("164780") ? false : stryMutAct_9fa48("164779") ? true : (stryCov_9fa48("164779", "164780"), isLeaderReplica)) {
        if (stryMutAct_9fa48("164781")) {
          {}
        } else {
          stryCov_9fa48("164781");
          // Avoid deadlock in single-thread worker pools:
          // leader-side CDC replication requires processing incoming append-ack
          // packets, so we must not block this handler waiting for quorum.
          this.applyCDCEvent(cdcEvent).catch(error => {
            if (stryMutAct_9fa48("164782")) {
              {}
            } else {
              stryCov_9fa48("164782");
              this.logger.error(MESSAGE_GROUP_WORKER_ERROR_MSG.CDC_APPLY_FAILED, stryMutAct_9fa48("164783") ? {} : (stryCov_9fa48("164783"), {
                groupId: this.groupId,
                replicaId: this.replicaId,
                tableName: cdcEvent.tableName,
                operation: cdcEvent.operation,
                error: error.message
              }));
            }
          });
        }
      } else {
        if (stryMutAct_9fa48("164784")) {
          {}
        } else {
          stryCov_9fa48("164784");
          leaderAddress = this.resolveLeaderAddress();
          const relayCount = stryMutAct_9fa48("164787") ? Number(message.cdcRelayCount) && NUM.ZERO : stryMutAct_9fa48("164786") ? false : stryMutAct_9fa48("164785") ? true : (stryCov_9fa48("164785", "164786", "164787"), Number(message.cdcRelayCount) || NUM.ZERO);
          const shouldRelay = stryMutAct_9fa48("164790") ? leaderAddress && leaderAddress !== this.unifiedAddress && relayCount < MESSAGE_GROUP_WORKER_DEFAULT.CDC_RELAY_MAX_HOPS || this.messageBridge : stryMutAct_9fa48("164789") ? false : stryMutAct_9fa48("164788") ? true : (stryCov_9fa48("164788", "164789", "164790"), (stryMutAct_9fa48("164792") ? leaderAddress && leaderAddress !== this.unifiedAddress || relayCount < MESSAGE_GROUP_WORKER_DEFAULT.CDC_RELAY_MAX_HOPS : stryMutAct_9fa48("164791") ? true : (stryCov_9fa48("164791", "164792"), (stryMutAct_9fa48("164794") ? leaderAddress || leaderAddress !== this.unifiedAddress : stryMutAct_9fa48("164793") ? true : (stryCov_9fa48("164793", "164794"), leaderAddress && (stryMutAct_9fa48("164796") ? leaderAddress === this.unifiedAddress : stryMutAct_9fa48("164795") ? true : (stryCov_9fa48("164795", "164796"), leaderAddress !== this.unifiedAddress)))) && (stryMutAct_9fa48("164799") ? relayCount >= MESSAGE_GROUP_WORKER_DEFAULT.CDC_RELAY_MAX_HOPS : stryMutAct_9fa48("164798") ? relayCount <= MESSAGE_GROUP_WORKER_DEFAULT.CDC_RELAY_MAX_HOPS : stryMutAct_9fa48("164797") ? true : (stryCov_9fa48("164797", "164798", "164799"), relayCount < MESSAGE_GROUP_WORKER_DEFAULT.CDC_RELAY_MAX_HOPS)))) && this.messageBridge);
          if (stryMutAct_9fa48("164801") ? false : stryMutAct_9fa48("164800") ? true : (stryCov_9fa48("164800", "164801"), shouldRelay)) {
            if (stryMutAct_9fa48("164802")) {
              {}
            } else {
              stryCov_9fa48("164802");
              try {
                if (stryMutAct_9fa48("164803")) {
                  {}
                } else {
                  stryCov_9fa48("164803");
                  this.messageBridge.sendFireAndForget(leaderAddress, stryMutAct_9fa48("164804") ? {} : (stryCov_9fa48("164804"), {
                    type: CDC_MESSAGE_TYPE.CDC_EVENT,
                    cdcEvent,
                    cdcRelayCount: stryMutAct_9fa48("164805") ? relayCount - NUM.ONE : (stryCov_9fa48("164805"), relayCount + NUM.ONE)
                  }));
                }
              } catch (error) {
                if (stryMutAct_9fa48("164806")) {
                  {}
                } else {
                  stryCov_9fa48("164806");
                  this.logger.warn(MESSAGE_GROUP_WORKER_ERROR_MSG.CDC_APPLY_FAILED, stryMutAct_9fa48("164807") ? {} : (stryCov_9fa48("164807"), {
                    groupId: this.groupId,
                    replicaId: this.replicaId,
                    leaderAddress,
                    error: error.message
                  }));
                }
              }
            }
          }
        }
      }
      return isLeaderReplica ? stryMutAct_9fa48("164808") ? {} : (stryCov_9fa48("164808"), {
        status: WORKER_RESPONSE_STATUS.OK,
        replicaId: this.replicaId
      }) : stryMutAct_9fa48("164809") ? {} : (stryCov_9fa48("164809"), {
        status: WORKER_RESPONSE_STATUS.OK,
        replicaId: this.replicaId,
        leaderAddress
      });
    }
  }

  /**
   * Handle incoming message from MessageRouter.
   * Detects Raft packets and routes them to RaftGroup.
   * @param {Object} message - Incoming message.
   * @return {Promise<Object>} Response.
   */
  async handleMessage(message) {
    if (stryMutAct_9fa48("164810")) {
      {}
    } else {
      stryCov_9fa48("164810");
      // Handle Raft packets via RaftGroup
      if (stryMutAct_9fa48("164813") ? (isRaftPacket(message) || message?.type === RAFT_PACKET_TYPE_APPEND_ACK) && message?.type === RAFT_PACKET_TYPE_APPEND_FAIL : stryMutAct_9fa48("164812") ? false : stryMutAct_9fa48("164811") ? true : (stryCov_9fa48("164811", "164812", "164813"), (stryMutAct_9fa48("164815") ? isRaftPacket(message) && message?.type === RAFT_PACKET_TYPE_APPEND_ACK : stryMutAct_9fa48("164814") ? false : (stryCov_9fa48("164814", "164815"), isRaftPacket(message) || (stryMutAct_9fa48("164817") ? message?.type !== RAFT_PACKET_TYPE_APPEND_ACK : stryMutAct_9fa48("164816") ? false : (stryCov_9fa48("164816", "164817"), (stryMutAct_9fa48("164818") ? message.type : (stryCov_9fa48("164818"), message?.type)) === RAFT_PACKET_TYPE_APPEND_ACK)))) || (stryMutAct_9fa48("164820") ? message?.type !== RAFT_PACKET_TYPE_APPEND_FAIL : stryMutAct_9fa48("164819") ? false : (stryCov_9fa48("164819", "164820"), (stryMutAct_9fa48("164821") ? message.type : (stryCov_9fa48("164821"), message?.type)) === RAFT_PACKET_TYPE_APPEND_FAIL)))) {
        if (stryMutAct_9fa48("164822")) {
          {}
        } else {
          stryCov_9fa48("164822");
          return this.handleRaftPacket(message);
        }
      }
      switch (message.type) {
        case CDC_MESSAGE_TYPE.CDC_EVENT:
          if (stryMutAct_9fa48("164823")) {} else {
            stryCov_9fa48("164823");
            return this.handleCDCMessage(message);
          }
        case SEED_CACHE_MESSAGE_TYPE.SEED_CACHE:
          if (stryMutAct_9fa48("164824")) {} else {
            stryCov_9fa48("164824");
            return this.handleSeedCache(message);
          }
        case SEED_CACHE_MESSAGE_TYPE.SET_BOOTSTRAP_PHASE:
          if (stryMutAct_9fa48("164825")) {} else {
            stryCov_9fa48("164825");
            return this.handleSetBootstrapPhase(message);
          }
        case CACHE_MESSAGE_TYPE.CACHE_GET:
          if (stryMutAct_9fa48("164826")) {} else {
            stryCov_9fa48("164826");
            return this.handleCacheGet(message);
          }
        case CACHE_MESSAGE_TYPE.CACHE_QUERY:
          if (stryMutAct_9fa48("164827")) {} else {
            stryCov_9fa48("164827");
            return this.handleCacheQuery(message);
          }
        case CACHE_MESSAGE_TYPE.CACHE_FILTER:
          if (stryMutAct_9fa48("164828")) {} else {
            stryCov_9fa48("164828");
            return this.handleCacheFilter(message);
          }
        case CACHE_MESSAGE_TYPE.CACHE_GET_ALL:
          if (stryMutAct_9fa48("164829")) {} else {
            stryCov_9fa48("164829");
            return this.handleCacheGetAll(message);
          }
        case LEADERSHIP_MESSAGE_TYPE.GET_LEADERSHIP_STATUS:
          if (stryMutAct_9fa48("164830")) {} else {
            stryCov_9fa48("164830");
            return this.handleGetLeadershipStatus();
          }
        case FACADE_MESSAGE_TYPE.START_ELECTION:
          if (stryMutAct_9fa48("164831")) {} else {
            stryCov_9fa48("164831");
            return this.handleStartElection();
          }
        default:
          if (stryMutAct_9fa48("164832")) {} else {
            stryCov_9fa48("164832");
            // Delegate to base class
            return super.handleMessage(message);
          }
      }
    }
  }

  /**
   * Resolve the current leader to a unified address when possible.
   * @return {string|null} Leader unified address or null when unknown.
   * @private
   */
  resolveLeaderAddress() {
    if (stryMutAct_9fa48("164833")) {
      {}
    } else {
      stryCov_9fa48("164833");
      const leaderId = this.getLeaderId();
      if (stryMutAct_9fa48("164836") ? !leaderId && typeof leaderId !== 'string' : stryMutAct_9fa48("164835") ? false : stryMutAct_9fa48("164834") ? true : (stryCov_9fa48("164834", "164835", "164836"), (stryMutAct_9fa48("164837") ? leaderId : (stryCov_9fa48("164837"), !leaderId)) || (stryMutAct_9fa48("164839") ? typeof leaderId === 'string' : stryMutAct_9fa48("164838") ? false : (stryCov_9fa48("164838", "164839"), typeof leaderId !== (stryMutAct_9fa48("164840") ? "" : (stryCov_9fa48("164840"), 'string')))))) {
        if (stryMutAct_9fa48("164841")) {
          {}
        } else {
          stryCov_9fa48("164841");
          return null;
        }
      }
      if (stryMutAct_9fa48("164843") ? false : stryMutAct_9fa48("164842") ? true : (stryCov_9fa48("164842", "164843"), leaderId.includes(WORKER_ADDRESS.SEPARATOR))) {
        if (stryMutAct_9fa48("164844")) {
          {}
        } else {
          stryCov_9fa48("164844");
          return leaderId;
        }
      }
      if (stryMutAct_9fa48("164847") ? leaderId !== this.replicaId : stryMutAct_9fa48("164846") ? false : stryMutAct_9fa48("164845") ? true : (stryCov_9fa48("164845", "164846", "164847"), leaderId === this.replicaId)) {
        if (stryMutAct_9fa48("164848")) {
          {}
        } else {
          stryCov_9fa48("164848");
          return this.unifiedAddress;
        }
      }
      const matchedPeer = this.peerAddresses.find(stryMutAct_9fa48("164849") ? () => undefined : (stryCov_9fa48("164849"), address => stryMutAct_9fa48("164850") ? address.startsWith(`${WORKER_ADDRESS.SEPARATOR}${leaderId}`) : (stryCov_9fa48("164850"), address.endsWith(stryMutAct_9fa48("164851") ? `` : (stryCov_9fa48("164851"), `${WORKER_ADDRESS.SEPARATOR}${leaderId}`)))));
      return stryMutAct_9fa48("164854") ? matchedPeer && null : stryMutAct_9fa48("164853") ? false : stryMutAct_9fa48("164852") ? true : (stryCov_9fa48("164852", "164853", "164854"), matchedPeer || null);
    }
  }

  /**
   * Handle incoming Raft packet via RaftGroup.
   * @param {Object} packet - Raft packet from peer.
   * @return {Object} Acknowledgment result.
   * @private
   */
  handleRaftPacket(packet) {
    if (stryMutAct_9fa48("164855")) {
      {}
    } else {
      stryCov_9fa48("164855");
      if (stryMutAct_9fa48("164858") ? false : stryMutAct_9fa48("164857") ? true : stryMutAct_9fa48("164856") ? this.raftGroup : (stryCov_9fa48("164856", "164857", "164858"), !this.raftGroup)) {
        if (stryMutAct_9fa48("164859")) {
          {}
        } else {
          stryCov_9fa48("164859");
          return stryMutAct_9fa48("164860") ? {} : (stryCov_9fa48("164860"), {
            acknowledged: stryMutAct_9fa48("164861") ? true : (stryCov_9fa48("164861"), false),
            error: MESSAGE_GROUP_WORKER_ERROR_MSG.NOT_INITIALIZED
          });
        }
      }
      const result = this.raftGroup.handleRaftPacket(packet);
      return stryMutAct_9fa48("164864") ? result && {
        acknowledged: false
      } : stryMutAct_9fa48("164863") ? false : stryMutAct_9fa48("164862") ? true : (stryCov_9fa48("164862", "164863", "164864"), result || (stryMutAct_9fa48("164865") ? {} : (stryCov_9fa48("164865"), {
        acknowledged: stryMutAct_9fa48("164866") ? true : (stryCov_9fa48("164866"), false)
      })));
    }
  }

  /**
   * Handle CACHE_GET message.
   * @param {Object} message - Cache get message.
   * @return {Object} Response with data.
   * @private
   */
  handleCacheGet(message) {
    if (stryMutAct_9fa48("164867")) {
      {}
    } else {
      stryCov_9fa48("164867");
      if (stryMutAct_9fa48("164870") ? false : stryMutAct_9fa48("164869") ? true : stryMutAct_9fa48("164868") ? this.systemCache : (stryCov_9fa48("164868", "164869", "164870"), !this.systemCache)) {
        if (stryMutAct_9fa48("164871")) {
          {}
        } else {
          stryCov_9fa48("164871");
          return stryMutAct_9fa48("164872") ? {} : (stryCov_9fa48("164872"), {
            type: CACHE_MESSAGE_TYPE.CACHE_GET_RESPONSE,
            data: null,
            error: MESSAGE_GROUP_WORKER_ERROR_MSG.NOT_INITIALIZED
          });
        }
      }
      const data = this.systemCache.get(message.tableName, message.key);
      return stryMutAct_9fa48("164873") ? {} : (stryCov_9fa48("164873"), {
        type: CACHE_MESSAGE_TYPE.CACHE_GET_RESPONSE,
        data: stryMutAct_9fa48("164876") ? data && null : stryMutAct_9fa48("164875") ? false : stryMutAct_9fa48("164874") ? true : (stryCov_9fa48("164874", "164875", "164876"), data || null)
      });
    }
  }

  /**
   * Handle CACHE_QUERY message.
   * @param {Object} message - Cache query message.
   * @return {Object} Response with rows.
   * @private
   */
  handleCacheQuery(message) {
    if (stryMutAct_9fa48("164877")) {
      {}
    } else {
      stryCov_9fa48("164877");
      if (stryMutAct_9fa48("164880") ? false : stryMutAct_9fa48("164879") ? true : stryMutAct_9fa48("164878") ? this.systemCache : (stryCov_9fa48("164878", "164879", "164880"), !this.systemCache)) {
        if (stryMutAct_9fa48("164881")) {
          {}
        } else {
          stryCov_9fa48("164881");
          return stryMutAct_9fa48("164882") ? {} : (stryCov_9fa48("164882"), {
            type: CACHE_MESSAGE_TYPE.CACHE_QUERY_RESPONSE,
            rows: stryMutAct_9fa48("164883") ? ["Stryker was here"] : (stryCov_9fa48("164883"), []),
            error: MESSAGE_GROUP_WORKER_ERROR_MSG.NOT_INITIALIZED
          });
        }
      }
      try {
        if (stryMutAct_9fa48("164884")) {
          {}
        } else {
          stryCov_9fa48("164884");
          const rows = this.systemCache.query(message.sql, stryMutAct_9fa48("164887") ? message.params && [] : stryMutAct_9fa48("164886") ? false : stryMutAct_9fa48("164885") ? true : (stryCov_9fa48("164885", "164886", "164887"), message.params || (stryMutAct_9fa48("164888") ? ["Stryker was here"] : (stryCov_9fa48("164888"), []))));
          return stryMutAct_9fa48("164889") ? {} : (stryCov_9fa48("164889"), {
            type: CACHE_MESSAGE_TYPE.CACHE_QUERY_RESPONSE,
            rows
          });
        }
      } catch (error) {
        if (stryMutAct_9fa48("164890")) {
          {}
        } else {
          stryCov_9fa48("164890");
          return stryMutAct_9fa48("164891") ? {} : (stryCov_9fa48("164891"), {
            type: CACHE_MESSAGE_TYPE.CACHE_QUERY_RESPONSE,
            rows: stryMutAct_9fa48("164892") ? ["Stryker was here"] : (stryCov_9fa48("164892"), []),
            error: error.message
          });
        }
      }
    }
  }

  /**
   * Handle CACHE_FILTER message.
   * @param {Object} message - Cache filter message.
   * @return {Object} Response with records.
   * @private
   */
  handleCacheFilter(message) {
    if (stryMutAct_9fa48("164893")) {
      {}
    } else {
      stryCov_9fa48("164893");
      if (stryMutAct_9fa48("164896") ? false : stryMutAct_9fa48("164895") ? true : stryMutAct_9fa48("164894") ? this.systemCache : (stryCov_9fa48("164894", "164895", "164896"), !this.systemCache)) {
        if (stryMutAct_9fa48("164897")) {
          {}
        } else {
          stryCov_9fa48("164897");
          return stryMutAct_9fa48("164898") ? {} : (stryCov_9fa48("164898"), {
            type: CACHE_MESSAGE_TYPE.CACHE_FILTER_RESPONSE,
            records: stryMutAct_9fa48("164899") ? ["Stryker was here"] : (stryCov_9fa48("164899"), []),
            error: MESSAGE_GROUP_WORKER_ERROR_MSG.NOT_INITIALIZED
          });
        }
      }
      try {
        if (stryMutAct_9fa48("164900")) {
          {}
        } else {
          stryCov_9fa48("164900");
          const predicateFn = new Function((stryMutAct_9fa48("164901") ? "" : (stryCov_9fa48("164901"), 'return ')) + message.predicateString)();
          const records = stryMutAct_9fa48("164902") ? this.systemCache : (stryCov_9fa48("164902"), this.systemCache.filter(message.tableName, predicateFn));
          return stryMutAct_9fa48("164903") ? {} : (stryCov_9fa48("164903"), {
            type: CACHE_MESSAGE_TYPE.CACHE_FILTER_RESPONSE,
            records
          });
        }
      } catch (error) {
        if (stryMutAct_9fa48("164904")) {
          {}
        } else {
          stryCov_9fa48("164904");
          return stryMutAct_9fa48("164905") ? {} : (stryCov_9fa48("164905"), {
            type: CACHE_MESSAGE_TYPE.CACHE_FILTER_RESPONSE,
            records: stryMutAct_9fa48("164906") ? ["Stryker was here"] : (stryCov_9fa48("164906"), []),
            error: error.message
          });
        }
      }
    }
  }

  /**
   * Handle CACHE_GET_ALL message.
   * @param {Object} message - Cache get all message.
   * @return {Object} Response with records.
   * @private
   */
  handleCacheGetAll(message) {
    if (stryMutAct_9fa48("164907")) {
      {}
    } else {
      stryCov_9fa48("164907");
      if (stryMutAct_9fa48("164910") ? false : stryMutAct_9fa48("164909") ? true : stryMutAct_9fa48("164908") ? this.systemCache : (stryCov_9fa48("164908", "164909", "164910"), !this.systemCache)) {
        if (stryMutAct_9fa48("164911")) {
          {}
        } else {
          stryCov_9fa48("164911");
          return stryMutAct_9fa48("164912") ? {} : (stryCov_9fa48("164912"), {
            type: CACHE_MESSAGE_TYPE.CACHE_GET_ALL_RESPONSE,
            records: stryMutAct_9fa48("164913") ? ["Stryker was here"] : (stryCov_9fa48("164913"), []),
            error: MESSAGE_GROUP_WORKER_ERROR_MSG.NOT_INITIALIZED
          });
        }
      }
      const records = this.systemCache.getAll(message.tableName);
      return stryMutAct_9fa48("164914") ? {} : (stryCov_9fa48("164914"), {
        type: CACHE_MESSAGE_TYPE.CACHE_GET_ALL_RESPONSE,
        records
      });
    }
  }

  /**
   * Handle GET_LEADERSHIP_STATUS message.
   * @return {Object} Response with leadership status.
   * @private
   */
  handleGetLeadershipStatus() {
    if (stryMutAct_9fa48("164915")) {
      {}
    } else {
      stryCov_9fa48("164915");
      return stryMutAct_9fa48("164916") ? {} : (stryCov_9fa48("164916"), {
        type: LEADERSHIP_MESSAGE_TYPE.LEADERSHIP_STATUS,
        isLeader: this.isLeaderReplica(),
        leaderActivated: this.isLeaderActivated(),
        term: this.getCurrentTerm(),
        leaderId: this.getLeaderId(),
        replicaId: this.replicaId
      });
    }
  }

  /**
   * Handle START_ELECTION facade message.
   * Starts the Raft election timer via RaftGroup.
   * @return {Object} Response with status.
   * @private
   */
  handleStartElection() {
    if (stryMutAct_9fa48("164917")) {
      {}
    } else {
      stryCov_9fa48("164917");
      if (stryMutAct_9fa48("164919") ? false : stryMutAct_9fa48("164918") ? true : (stryCov_9fa48("164918", "164919"), this.raftGroup)) {
        if (stryMutAct_9fa48("164920")) {
          {}
        } else {
          stryCov_9fa48("164920");
          this.raftGroup.startElection();
        }
      }
      return stryMutAct_9fa48("164921") ? {} : (stryCov_9fa48("164921"), {
        status: stryMutAct_9fa48("164922") ? "" : (stryCov_9fa48("164922"), 'ok'),
        replicaId: this.replicaId
      });
    }
  }

  /**
   * Handle SEED_CACHE message during bootstrap.
   * @param {Object} message - SEED_CACHE message.
   * @return {Promise<Object>} SEED_CACHE_RESPONSE.
   * @private
   */
  async handleSeedCache(message) {
    if (stryMutAct_9fa48("164923")) {
      {}
    } else {
      stryCov_9fa48("164923");
      this.logger.info(MESSAGE_GROUP_WORKER_LOG_MSG.SEED_CACHE_RECEIVED, stryMutAct_9fa48("164924") ? {} : (stryCov_9fa48("164924"), {
        groupId: this.groupId,
        replicaId: this.replicaId,
        entryCount: message.entries ? message.entries.length : NUM.ZERO,
        bootstrapPhase: message.bootstrapPhase
      }));

      // Reject if not in bootstrap phase
      if (stryMutAct_9fa48("164927") ? false : stryMutAct_9fa48("164926") ? true : stryMutAct_9fa48("164925") ? this.bootstrapPhase : (stryCov_9fa48("164925", "164926", "164927"), !this.bootstrapPhase)) {
        if (stryMutAct_9fa48("164928")) {
          {}
        } else {
          stryCov_9fa48("164928");
          this.logger.warn(MESSAGE_GROUP_WORKER_LOG_MSG.SEED_CACHE_REJECTED, stryMutAct_9fa48("164929") ? {} : (stryCov_9fa48("164929"), {
            groupId: this.groupId,
            replicaId: this.replicaId,
            reason: MESSAGE_GROUP_WORKER_ERROR_MSG.SEED_CACHE_NOT_BOOTSTRAP_PHASE
          }));
          return stryMutAct_9fa48("164930") ? {} : (stryCov_9fa48("164930"), {
            type: SEED_CACHE_MESSAGE_TYPE.SEED_CACHE_RESPONSE,
            success: stryMutAct_9fa48("164931") ? true : (stryCov_9fa48("164931"), false),
            entriesApplied: NUM.ZERO,
            error: MESSAGE_GROUP_WORKER_ERROR_MSG.SEED_CACHE_NOT_BOOTSTRAP_PHASE
          });
        }
      }

      // Reject if bootstrapPhase flag in message is false
      if (stryMutAct_9fa48("164934") ? false : stryMutAct_9fa48("164933") ? true : stryMutAct_9fa48("164932") ? message.bootstrapPhase : (stryCov_9fa48("164932", "164933", "164934"), !message.bootstrapPhase)) {
        if (stryMutAct_9fa48("164935")) {
          {}
        } else {
          stryCov_9fa48("164935");
          this.logger.warn(MESSAGE_GROUP_WORKER_LOG_MSG.SEED_CACHE_REJECTED, stryMutAct_9fa48("164936") ? {} : (stryCov_9fa48("164936"), {
            groupId: this.groupId,
            replicaId: this.replicaId,
            reason: MESSAGE_GROUP_WORKER_ERROR_MSG.SEED_CACHE_NOT_BOOTSTRAP_PHASE
          }));
          return stryMutAct_9fa48("164937") ? {} : (stryCov_9fa48("164937"), {
            type: SEED_CACHE_MESSAGE_TYPE.SEED_CACHE_RESPONSE,
            success: stryMutAct_9fa48("164938") ? true : (stryCov_9fa48("164938"), false),
            entriesApplied: NUM.ZERO,
            error: MESSAGE_GROUP_WORKER_ERROR_MSG.SEED_CACHE_NOT_BOOTSTRAP_PHASE
          });
        }
      }

      // Validate entries array
      if (stryMutAct_9fa48("164941") ? !message.entries && !Array.isArray(message.entries) : stryMutAct_9fa48("164940") ? false : stryMutAct_9fa48("164939") ? true : (stryCov_9fa48("164939", "164940", "164941"), (stryMutAct_9fa48("164942") ? message.entries : (stryCov_9fa48("164942"), !message.entries)) || (stryMutAct_9fa48("164943") ? Array.isArray(message.entries) : (stryCov_9fa48("164943"), !Array.isArray(message.entries))))) {
        if (stryMutAct_9fa48("164944")) {
          {}
        } else {
          stryCov_9fa48("164944");
          this.logger.warn(MESSAGE_GROUP_WORKER_LOG_MSG.SEED_CACHE_REJECTED, stryMutAct_9fa48("164945") ? {} : (stryCov_9fa48("164945"), {
            groupId: this.groupId,
            replicaId: this.replicaId,
            reason: MESSAGE_GROUP_WORKER_ERROR_MSG.SEED_CACHE_MISSING_ENTRIES
          }));
          return stryMutAct_9fa48("164946") ? {} : (stryCov_9fa48("164946"), {
            type: SEED_CACHE_MESSAGE_TYPE.SEED_CACHE_RESPONSE,
            success: stryMutAct_9fa48("164947") ? true : (stryCov_9fa48("164947"), false),
            entriesApplied: NUM.ZERO,
            error: MESSAGE_GROUP_WORKER_ERROR_MSG.SEED_CACHE_MISSING_ENTRIES
          });
        }
      }

      // Check if system cache is initialized
      if (stryMutAct_9fa48("164950") ? false : stryMutAct_9fa48("164949") ? true : stryMutAct_9fa48("164948") ? this.systemCache : (stryCov_9fa48("164948", "164949", "164950"), !this.systemCache)) {
        if (stryMutAct_9fa48("164951")) {
          {}
        } else {
          stryCov_9fa48("164951");
          return stryMutAct_9fa48("164952") ? {} : (stryCov_9fa48("164952"), {
            type: SEED_CACHE_MESSAGE_TYPE.SEED_CACHE_RESPONSE,
            success: stryMutAct_9fa48("164953") ? true : (stryCov_9fa48("164953"), false),
            entriesApplied: NUM.ZERO,
            error: MESSAGE_GROUP_WORKER_ERROR_MSG.NOT_INITIALIZED
          });
        }
      }
      this.logger.info(MESSAGE_GROUP_WORKER_LOG_MSG.SEED_CACHE_APPLYING, stryMutAct_9fa48("164954") ? {} : (stryCov_9fa48("164954"), {
        groupId: this.groupId,
        replicaId: this.replicaId,
        entryCount: message.entries.length
      }));
      let entriesApplied = NUM.ZERO;

      // Apply each entry to the system cache
      for (const entry of message.entries) {
        if (stryMutAct_9fa48("164955")) {
          {}
        } else {
          stryCov_9fa48("164955");
          try {
            if (stryMutAct_9fa48("164956")) {
              {}
            } else {
              stryCov_9fa48("164956");
              if (stryMutAct_9fa48("164958") ? false : stryMutAct_9fa48("164957") ? true : (stryCov_9fa48("164957", "164958"), this.isLeaderReplica())) {
                if (stryMutAct_9fa48("164959")) {
                  {}
                } else {
                  stryCov_9fa48("164959");
                  this.logger.debug(MESSAGE_GROUP_WORKER_LOG_MSG.SEED_CACHE_REPLICATING, stryMutAct_9fa48("164960") ? {} : (stryCov_9fa48("164960"), {
                    groupId: this.groupId,
                    replicaId: this.replicaId,
                    tableName: entry.tableName,
                    operation: entry.operation
                  }));
                  await this.replicateCDCEvent(stryMutAct_9fa48("164961") ? {} : (stryCov_9fa48("164961"), {
                    tableName: entry.tableName,
                    operation: entry.operation,
                    data: entry.data
                  }));
                }
              } else {
                if (stryMutAct_9fa48("164962")) {
                  {}
                } else {
                  stryCov_9fa48("164962");
                  this.systemCache.applyCDCEvent(entry.tableName, entry.operation, entry.data);
                }
              }
              stryMutAct_9fa48("164963") ? entriesApplied-- : (stryCov_9fa48("164963"), entriesApplied++);
              this.logger.debug(MESSAGE_GROUP_WORKER_LOG_MSG.SEED_CACHE_ENTRY_APPLIED, stryMutAct_9fa48("164964") ? {} : (stryCov_9fa48("164964"), {
                groupId: this.groupId,
                replicaId: this.replicaId,
                tableName: entry.tableName,
                operation: entry.operation,
                entriesApplied
              }));
            }
          } catch (error) {
            if (stryMutAct_9fa48("164965")) {
              {}
            } else {
              stryCov_9fa48("164965");
              this.logger.error(MESSAGE_GROUP_WORKER_ERROR_MSG.SEED_CACHE_APPLY_FAILED, stryMutAct_9fa48("164966") ? {} : (stryCov_9fa48("164966"), {
                groupId: this.groupId,
                replicaId: this.replicaId,
                tableName: entry.tableName,
                operation: entry.operation,
                error: error.message
              }));
              return stryMutAct_9fa48("164967") ? {} : (stryCov_9fa48("164967"), {
                type: SEED_CACHE_MESSAGE_TYPE.SEED_CACHE_RESPONSE,
                success: stryMutAct_9fa48("164968") ? true : (stryCov_9fa48("164968"), false),
                entriesApplied,
                error: stryMutAct_9fa48("164969") ? `` : (stryCov_9fa48("164969"), `${MESSAGE_GROUP_WORKER_ERROR_MSG.SEED_CACHE_APPLY_FAILED}: ${error.message}`)
              });
            }
          }
        }
      }
      this.logger.info(MESSAGE_GROUP_WORKER_LOG_MSG.SEED_CACHE_COMPLETED, stryMutAct_9fa48("164970") ? {} : (stryCov_9fa48("164970"), {
        groupId: this.groupId,
        replicaId: this.replicaId,
        entriesApplied
      }));
      return stryMutAct_9fa48("164971") ? {} : (stryCov_9fa48("164971"), {
        type: SEED_CACHE_MESSAGE_TYPE.SEED_CACHE_RESPONSE,
        success: stryMutAct_9fa48("164972") ? false : (stryCov_9fa48("164972"), true),
        entriesApplied,
        error: null
      });
    }
  }

  /**
   * Set the bootstrap phase flag.
   * @param {boolean} phase - Whether in bootstrap phase.
   */
  setBootstrapPhase(phase) {
    if (stryMutAct_9fa48("164973")) {
      {}
    } else {
      stryCov_9fa48("164973");
      this.bootstrapPhase = phase;
      this.logger.info(MESSAGE_GROUP_WORKER_LOG_MSG.BOOTSTRAP_PHASE_UPDATED, stryMutAct_9fa48("164974") ? {} : (stryCov_9fa48("164974"), {
        groupId: this.groupId,
        replicaId: this.replicaId,
        bootstrapPhase: phase
      }));
    }
  }

  /**
   * Handle SET_BOOTSTRAP_PHASE message.
   * @param {Object} message - Message with bootstrapPhase flag.
   * @return {Object} Response with status.
   * @private
   */
  handleSetBootstrapPhase(message) {
    if (stryMutAct_9fa48("164975")) {
      {}
    } else {
      stryCov_9fa48("164975");
      const newPhase = stryMutAct_9fa48("164978") ? message.bootstrapPhase !== true : stryMutAct_9fa48("164977") ? false : stryMutAct_9fa48("164976") ? true : (stryCov_9fa48("164976", "164977", "164978"), message.bootstrapPhase === (stryMutAct_9fa48("164979") ? false : (stryCov_9fa48("164979"), true)));
      this.setBootstrapPhase(newPhase);
      return stryMutAct_9fa48("164980") ? {} : (stryCov_9fa48("164980"), {
        status: stryMutAct_9fa48("164981") ? "" : (stryCov_9fa48("164981"), 'ok'),
        replicaId: this.replicaId,
        bootstrapPhase: this.bootstrapPhase
      });
    }
  }

  /**
   * Check if the service is in bootstrap phase.
   * @return {boolean} True if in bootstrap phase.
   */
  isInBootstrapPhase() {
    if (stryMutAct_9fa48("164982")) {
      {}
    } else {
      stryCov_9fa48("164982");
      return this.bootstrapPhase;
    }
  }

  /**
   * Get the message group ID.
   * @return {string} Message group ID.
   */
  getGroupId() {
    if (stryMutAct_9fa48("164983")) {
      {}
    } else {
      stryCov_9fa48("164983");
      return this.groupId;
    }
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
    if (stryMutAct_9fa48("164984")) {
      {}
    } else {
      stryCov_9fa48("164984");
      if (stryMutAct_9fa48("164987") ? data || typeof data.sql === 'string' : stryMutAct_9fa48("164986") ? false : stryMutAct_9fa48("164985") ? true : (stryCov_9fa48("164985", "164986", "164987"), data && (stryMutAct_9fa48("164989") ? typeof data.sql !== 'string' : stryMutAct_9fa48("164988") ? true : (stryCov_9fa48("164988", "164989"), typeof data.sql === (stryMutAct_9fa48("164990") ? "" : (stryCov_9fa48("164990"), 'string')))))) {
        if (stryMutAct_9fa48("164991")) {
          {}
        } else {
          stryCov_9fa48("164991");
          this.applyRawCDCMutation(tableName, data.sql, stryMutAct_9fa48("164994") ? data.params && [] : stryMutAct_9fa48("164993") ? false : stryMutAct_9fa48("164992") ? true : (stryCov_9fa48("164992", "164993", "164994"), data.params || (stryMutAct_9fa48("164995") ? ["Stryker was here"] : (stryCov_9fa48("164995"), []))));
          return;
        }
      }
      this.systemCache.applyCDCEvent(tableName, operation, data);
    }
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
    if (stryMutAct_9fa48("164996")) {
      {}
    } else {
      stryCov_9fa48("164996");
      try {
        if (stryMutAct_9fa48("164997")) {
          {}
        } else {
          stryCov_9fa48("164997");
          this.systemCache.executeRawSQL(sql, params);
        }
      } catch (error) {
        if (stryMutAct_9fa48("164998")) {
          {}
        } else {
          stryCov_9fa48("164998");
          if (stryMutAct_9fa48("165001") ? false : stryMutAct_9fa48("165000") ? true : stryMutAct_9fa48("164999") ? this.isMissingTableError(error) : (stryCov_9fa48("164999", "165000", "165001"), !this.isMissingTableError(error))) {
            if (stryMutAct_9fa48("165002")) {
              {}
            } else {
              stryCov_9fa48("165002");
              throw error;
            }
          }
          const columns = this.extractInsertColumns(sql, tableName);
          if (stryMutAct_9fa48("165005") ? !columns && columns.length === NUM.ZERO : stryMutAct_9fa48("165004") ? false : stryMutAct_9fa48("165003") ? true : (stryCov_9fa48("165003", "165004", "165005"), (stryMutAct_9fa48("165006") ? columns : (stryCov_9fa48("165006"), !columns)) || (stryMutAct_9fa48("165008") ? columns.length !== NUM.ZERO : stryMutAct_9fa48("165007") ? false : (stryCov_9fa48("165007", "165008"), columns.length === NUM.ZERO)))) {
            if (stryMutAct_9fa48("165009")) {
              {}
            } else {
              stryCov_9fa48("165009");
              throw error;
            }
          }
          if (stryMutAct_9fa48("165012") ? false : stryMutAct_9fa48("165011") ? true : stryMutAct_9fa48("165010") ? this.systemCache.hasTable(tableName) : (stryCov_9fa48("165010", "165011", "165012"), !this.systemCache.hasTable(tableName))) {
            if (stryMutAct_9fa48("165013")) {
              {}
            } else {
              stryCov_9fa48("165013");
              this.systemCache.createDynamicTable(tableName, columns);
            }
          }
          this.systemCache.executeRawSQL(sql, params);
        }
      }
    }
  }

  /**
   * Check if a SQLite error indicates a missing table.
   * @param {Error} error - Error thrown by SQLite.
   * @return {boolean} True when table is missing.
   * @private
   */
  isMissingTableError(error) {
    if (stryMutAct_9fa48("165014")) {
      {}
    } else {
      stryCov_9fa48("165014");
      return Boolean(stryMutAct_9fa48("165017") ? error && typeof error.message === 'string' || error.message.includes('no such table') : stryMutAct_9fa48("165016") ? false : stryMutAct_9fa48("165015") ? true : (stryCov_9fa48("165015", "165016", "165017"), (stryMutAct_9fa48("165019") ? error || typeof error.message === 'string' : stryMutAct_9fa48("165018") ? true : (stryCov_9fa48("165018", "165019"), error && (stryMutAct_9fa48("165021") ? typeof error.message !== 'string' : stryMutAct_9fa48("165020") ? true : (stryCov_9fa48("165020", "165021"), typeof error.message === (stryMutAct_9fa48("165022") ? "" : (stryCov_9fa48("165022"), 'string')))))) && error.message.includes(stryMutAct_9fa48("165023") ? "" : (stryCov_9fa48("165023"), 'no such table'))));
    }
  }

  /**
   * Extract column list from INSERT SQL.
   * @param {string} sql - SQL statement.
   * @param {string} expectedTableName - Expected table name.
   * @return {Array<string>|null} Extracted columns or null.
   * @private
   */
  extractInsertColumns(sql, expectedTableName) {
    if (stryMutAct_9fa48("165024")) {
      {}
    } else {
      stryCov_9fa48("165024");
      const match = INSERT_SQL_COLUMNS_PATTERN.exec(sql);
      if (stryMutAct_9fa48("165027") ? false : stryMutAct_9fa48("165026") ? true : stryMutAct_9fa48("165025") ? match : (stryCov_9fa48("165025", "165026", "165027"), !match)) {
        if (stryMutAct_9fa48("165028")) {
          {}
        } else {
          stryCov_9fa48("165028");
          return null;
        }
      }
      const parsedTableName = this.normalizeIdentifier(stryMutAct_9fa48("165031") ? (match[1] || match[2] || match[3]) && '' : stryMutAct_9fa48("165030") ? false : stryMutAct_9fa48("165029") ? true : (stryCov_9fa48("165029", "165030", "165031"), (stryMutAct_9fa48("165033") ? (match[1] || match[2]) && match[3] : stryMutAct_9fa48("165032") ? false : (stryCov_9fa48("165032", "165033"), (stryMutAct_9fa48("165035") ? match[1] && match[2] : stryMutAct_9fa48("165034") ? false : (stryCov_9fa48("165034", "165035"), match[1] || match[2])) || match[3])) || (stryMutAct_9fa48("165036") ? "Stryker was here!" : (stryCov_9fa48("165036"), ''))));
      if (stryMutAct_9fa48("165039") ? parsedTableName === this.normalizeIdentifier(expectedTableName) : stryMutAct_9fa48("165038") ? false : stryMutAct_9fa48("165037") ? true : (stryCov_9fa48("165037", "165038", "165039"), parsedTableName !== this.normalizeIdentifier(expectedTableName))) {
        if (stryMutAct_9fa48("165040")) {
          {}
        } else {
          stryCov_9fa48("165040");
          return null;
        }
      }
      return stryMutAct_9fa48("165041") ? match[4].split(',').map(column => this.normalizeIdentifier(column)) : (stryCov_9fa48("165041"), match[4].split(stryMutAct_9fa48("165042") ? "" : (stryCov_9fa48("165042"), ',')).map(stryMutAct_9fa48("165043") ? () => undefined : (stryCov_9fa48("165043"), column => this.normalizeIdentifier(column))).filter(stryMutAct_9fa48("165044") ? () => undefined : (stryCov_9fa48("165044"), column => stryMutAct_9fa48("165048") ? column.length <= NUM.ZERO : stryMutAct_9fa48("165047") ? column.length >= NUM.ZERO : stryMutAct_9fa48("165046") ? false : stryMutAct_9fa48("165045") ? true : (stryCov_9fa48("165045", "165046", "165047", "165048"), column.length > NUM.ZERO))));
    }
  }

  /**
   * Normalize SQL identifiers by trimming and removing wrapper quotes.
   * @param {string} identifier - Raw SQL identifier.
   * @return {string} Normalized identifier.
   * @private
   */
  normalizeIdentifier(identifier) {
    if (stryMutAct_9fa48("165049")) {
      {}
    } else {
      stryCov_9fa48("165049");
      const trimmed = stryMutAct_9fa48("165050") ? String(identifier) : (stryCov_9fa48("165050"), String(identifier).trim());
      if (stryMutAct_9fa48("165054") ? trimmed.length >= 2 : stryMutAct_9fa48("165053") ? trimmed.length <= 2 : stryMutAct_9fa48("165052") ? false : stryMutAct_9fa48("165051") ? true : (stryCov_9fa48("165051", "165052", "165053", "165054"), trimmed.length < 2)) {
        if (stryMutAct_9fa48("165055")) {
          {}
        } else {
          stryCov_9fa48("165055");
          return trimmed;
        }
      }
      const starts = trimmed[0];
      const ends = trimmed[stryMutAct_9fa48("165056") ? trimmed.length + 1 : (stryCov_9fa48("165056"), trimmed.length - 1)];
      if (stryMutAct_9fa48("165059") ? starts === '"' && ends === '"' && starts === '`' && ends === '`' : stryMutAct_9fa48("165058") ? false : stryMutAct_9fa48("165057") ? true : (stryCov_9fa48("165057", "165058", "165059"), (stryMutAct_9fa48("165061") ? starts === '"' || ends === '"' : stryMutAct_9fa48("165060") ? false : (stryCov_9fa48("165060", "165061"), (stryMutAct_9fa48("165063") ? starts !== '"' : stryMutAct_9fa48("165062") ? true : (stryCov_9fa48("165062", "165063"), starts === (stryMutAct_9fa48("165064") ? "" : (stryCov_9fa48("165064"), '"')))) && (stryMutAct_9fa48("165066") ? ends !== '"' : stryMutAct_9fa48("165065") ? true : (stryCov_9fa48("165065", "165066"), ends === (stryMutAct_9fa48("165067") ? "" : (stryCov_9fa48("165067"), '"')))))) || (stryMutAct_9fa48("165069") ? starts === '`' || ends === '`' : stryMutAct_9fa48("165068") ? false : (stryCov_9fa48("165068", "165069"), (stryMutAct_9fa48("165071") ? starts !== '`' : stryMutAct_9fa48("165070") ? true : (stryCov_9fa48("165070", "165071"), starts === (stryMutAct_9fa48("165072") ? "" : (stryCov_9fa48("165072"), '`')))) && (stryMutAct_9fa48("165074") ? ends !== '`' : stryMutAct_9fa48("165073") ? true : (stryCov_9fa48("165073", "165074"), ends === (stryMutAct_9fa48("165075") ? "" : (stryCov_9fa48("165075"), '`')))))))) {
        if (stryMutAct_9fa48("165076")) {
          {}
        } else {
          stryCov_9fa48("165076");
          return stryMutAct_9fa48("165077") ? trimmed : (stryCov_9fa48("165077"), trimmed.slice(1, stryMutAct_9fa48("165078") ? +1 : (stryCov_9fa48("165078"), -1)));
        }
      }
      return trimmed;
    }
  }

  /**
   * Get the current Raft role.
   * @return {string} Current role.
   */
  getRole() {
    if (stryMutAct_9fa48("165079")) {
      {}
    } else {
      stryCov_9fa48("165079");
      return this.raftGroup ? this.raftGroup.getRole() : RAFT_GROUP_ROLE.FOLLOWER;
    }
  }

  /**
   * Check if this replica is the leader.
   * @return {boolean} True if leader.
   */
  isLeaderReplica() {
    if (stryMutAct_9fa48("165080")) {
      {}
    } else {
      stryCov_9fa48("165080");
      return this.raftGroup ? this.raftGroup.isLeaderReplica() : stryMutAct_9fa48("165081") ? true : (stryCov_9fa48("165081"), false);
    }
  }

  /**
   * Check if leader activation has completed.
   * @return {boolean} True if activation completed.
   */
  isLeaderActivated() {
    if (stryMutAct_9fa48("165082")) {
      {}
    } else {
      stryCov_9fa48("165082");
      return this.leaderActivated;
    }
  }

  /**
   * Get the current leader ID.
   * @return {string|null} Leader replica ID or null.
   */
  getLeaderId() {
    if (stryMutAct_9fa48("165083")) {
      {}
    } else {
      stryCov_9fa48("165083");
      return this.raftGroup ? this.raftGroup.getLeaderId() : null;
    }
  }

  /**
   * Get the current Raft term.
   * @return {number} Current term.
   */
  getCurrentTerm() {
    if (stryMutAct_9fa48("165084")) {
      {}
    } else {
      stryCov_9fa48("165084");
      return this.raftGroup ? this.raftGroup.getCurrentTerm() : NUM.ZERO;
    }
  }

  /**
   * Check if CDC subscriptions are active.
   * @return {boolean} True if subscribed to CDC events.
   */
  isCDCSubscribed() {
    if (stryMutAct_9fa48("165085")) {
      {}
    } else {
      stryCov_9fa48("165085");
      return this.cdcSubscribed;
    }
  }

  /**
   * Get the number of active CDC subscriptions.
   * @return {number} Number of subscriptions.
   */
  getCDCSubscriptionCount() {
    if (stryMutAct_9fa48("165086")) {
      {}
    } else {
      stryCov_9fa48("165086");
      return this.cdcSubscriptions.size;
    }
  }

  /**
   * Get the RaftGroup instance.
   * @return {RaftGroup|null} RaftGroup instance.
   */
  getRaftGroup() {
    if (stryMutAct_9fa48("165087")) {
      {}
    } else {
      stryCov_9fa48("165087");
      return this.raftGroup;
    }
  }

  /**
   * Get statistics about the message group worker.
   * @return {Object} Message group worker statistics.
   */
  getStats() {
    if (stryMutAct_9fa48("165088")) {
      {}
    } else {
      stryCov_9fa48("165088");
      const baseStats = super.getStats();
      return stryMutAct_9fa48("165089") ? {} : (stryCov_9fa48("165089"), {
        ...baseStats,
        groupId: this.groupId,
        role: this.getRole(),
        isLeader: this.isLeaderReplica(),
        leaderActivated: this.isLeaderActivated(),
        leaderId: this.getLeaderId(),
        term: this.getCurrentTerm(),
        cdcSubscribed: this.cdcSubscribed,
        cdcSubscriptionCount: this.cdcSubscriptions.size,
        replicaCount: this.replicaIds.length,
        bootstrapPhase: this.bootstrapPhase,
        cacheStats: this.systemCache ? this.systemCache.getStats() : null
      });
    }
  }
}
export { MessageGroupWorkerService, MESSAGE_GROUP_WORKER_DEFAULT, MESSAGE_GROUP_WORKER_ERROR_MSG, MESSAGE_GROUP_WORKER_LOG_MSG, CDC_REPLICATION_TYPE };