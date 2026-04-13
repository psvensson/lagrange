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
import { NUM } from '../constants/numbers.js';
import { STRING } from '../constants/strings.js';
import { TABLES } from '../constants/tables.js';
import { TIME_MS } from '../constants/time.js';
import { RAFT_ELECTION_TIMING } from '../raft/constants.js';
const PARTITION_SERVICE_DEFAULT = Object.freeze(stryMutAct_9fa48("101039") ? {} : (stryCov_9fa48("101039"), {
  NODE_ID: STRING.UNKNOWN,
  MEMORY_DB_PATH: stryMutAct_9fa48("101040") ? "" : (stryCov_9fa48("101040"), ':memory:'),
  DEFAULT_REPLICA_COUNT: NUM.THREE,
  SIZE_UPDATE_DEBOUNCE_MS: stryMutAct_9fa48("101041") ? TIME_MS.SECOND / NUM.FIVE : (stryCov_9fa48("101041"), TIME_MS.SECOND * NUM.FIVE),
  SIZE_UPDATE_INTERVAL_MS: TIME_MS.MINUTE,
  MANAGED_SPLIT_WRITE_ACTIVITY_DEBOUNCE_MS: stryMutAct_9fa48("101042") ? TIME_MS.SECOND / NUM.FIVE : (stryCov_9fa48("101042"), TIME_MS.SECOND * NUM.FIVE),
  SIZE_PERSIST_RETRY_TIMEOUT_MS: TIME_MS.SECOND,
  SIZE_PERSIST_RETRY_BASE_DELAY_MS: 50,
  SIZE_PERSIST_RETRY_MAX_DELAY_MS: 250,
  PENDING_REQUEST_TIMEOUT_MS: stryMutAct_9fa48("101043") ? TIME_MS.SECOND / 30 : (stryCov_9fa48("101043"), TIME_MS.SECOND * 30),
  KEY_RANGE_START: null,
  KEY_RANGE_END: null,
  CDC_BUFFER_REPLAY_INITIAL_DELAY_MS: 50,
  CDC_BUFFER_REPLAY_MAX_DELAY_MS: stryMutAct_9fa48("101044") ? TIME_MS.SECOND / NUM.TEN : (stryCov_9fa48("101044"), TIME_MS.SECOND * NUM.TEN),
  // Learner phase: new replicas joining existing groups start as non-voting learners
  // They receive log entries but don't vote until caught up
  // This prevents new replicas from disrupting existing leadership
  LEARNER_PROMOTION_DELAY_MS: stryMutAct_9fa48("101045") ? TIME_MS.SECOND / 30 : (stryCov_9fa48("101045"), TIME_MS.SECOND * 30),
  // Min time before promotion (30s for stability)
  LEARNER_PROMOTION_PRIORITY_RECOVERY_DELAY_MS: stryMutAct_9fa48("101046") ? TIME_MS.SECOND / NUM.FIVE : (stryCov_9fa48("101046"), TIME_MS.SECOND * NUM.FIVE),
  LEARNER_CATCH_UP_CHECK_INTERVAL_MS: TIME_MS.SECOND,
  // How often to check catch-up
  MAX_TRACKED_APPLIED_ENTRIES: stryMutAct_9fa48("101047") ? NUM.THOUSAND / NUM.FIVE : (stryCov_9fa48("101047"), NUM.THOUSAND * NUM.FIVE),
  MAX_COMMITTED_WRITE_LOG_ENTRIES: NUM.THOUSAND,
  PREPARED_STATE_HOLD_SWEEP_INTERVAL_MS: TIME_MS.SECOND
}));
const PARTITION_SERVICE_LEARNER_PROMOTION_SCHEDULE_REASON = Object.freeze(stryMutAct_9fa48("101048") ? {} : (stryCov_9fa48("101048"), {
  INITIAL_DELAY: stryMutAct_9fa48("101049") ? "" : (stryCov_9fa48("101049"), 'initial_delay'),
  DEFERRED_RECHECK: stryMutAct_9fa48("101050") ? "" : (stryCov_9fa48("101050"), 'deferred_recheck')
}));
const PARTITION_SERVICE_SQL = Object.freeze(stryMutAct_9fa48("101051") ? {} : (stryCov_9fa48("101051"), {
  CREATE_RAFT_STATE_TABLE: stryMutAct_9fa48("101052") ? `` : (stryCov_9fa48("101052"), `
      CREATE TABLE IF NOT EXISTS _raft_state (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `),
  CREATE_RAFT_LOG_TABLE: stryMutAct_9fa48("101053") ? `` : (stryCov_9fa48("101053"), `
      CREATE TABLE IF NOT EXISTS _raft_log (
        log_index INTEGER PRIMARY KEY,
        term INTEGER NOT NULL,
        command TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      )
    `),
  SELECT_RAFT_STATE_VALUE: stryMutAct_9fa48("101054") ? "" : (stryCov_9fa48("101054"), 'SELECT value FROM _raft_state WHERE key = ?'),
  SELECT_RAFT_LOGS: stryMutAct_9fa48("101055") ? "" : (stryCov_9fa48("101055"), 'SELECT log_index, term, command, timestamp FROM _raft_log ORDER BY log_index'),
  UPSERT_RAFT_STATE: stryMutAct_9fa48("101056") ? "" : (stryCov_9fa48("101056"), 'INSERT OR REPLACE INTO _raft_state (key, value) VALUES (?, ?)'),
  UPSERT_RAFT_LOG: (stryMutAct_9fa48("101057") ? "" : (stryCov_9fa48("101057"), 'INSERT OR REPLACE INTO _raft_log (log_index, term, command, timestamp) ')) + (stryMutAct_9fa48("101058") ? "" : (stryCov_9fa48("101058"), 'VALUES (?, ?, ?, ?)')),
  DELETE_RAFT_LOG_FROM: stryMutAct_9fa48("101059") ? "" : (stryCov_9fa48("101059"), 'DELETE FROM _raft_log WHERE log_index >= ?'),
  BEGIN_IMMEDIATE: stryMutAct_9fa48("101060") ? "" : (stryCov_9fa48("101060"), 'BEGIN IMMEDIATE'),
  SAVEPOINT_PREPARE: stryMutAct_9fa48("101061") ? "" : (stryCov_9fa48("101061"), 'SAVEPOINT prepare_transaction'),
  COMMIT: stryMutAct_9fa48("101062") ? "" : (stryCov_9fa48("101062"), 'COMMIT'),
  ROLLBACK: stryMutAct_9fa48("101063") ? "" : (stryCov_9fa48("101063"), 'ROLLBACK'),
  UPDATE_SERVICE_RAFT_ROLE: (stryMutAct_9fa48("101064") ? `` : (stryCov_9fa48("101064"), `UPDATE ${TABLES.SERVICES} SET raft_role = ?, updated_at = ? `)) + (stryMutAct_9fa48("101065") ? "" : (stryCov_9fa48("101065"), 'WHERE (service_id = ?)'))
}));
const PARTITION_SERVICE_SQL_FRAGMENT = Object.freeze(stryMutAct_9fa48("101066") ? {} : (stryCov_9fa48("101066"), {
  PRIMARY_KEY: stryMutAct_9fa48("101067") ? "" : (stryCov_9fa48("101067"), ' PRIMARY KEY'),
  NOT_NULL: stryMutAct_9fa48("101068") ? "" : (stryCov_9fa48("101068"), ' NOT NULL'),
  COMMA_SPACE: stryMutAct_9fa48("101069") ? "" : (stryCov_9fa48("101069"), ', '),
  AND: stryMutAct_9fa48("101070") ? "" : (stryCov_9fa48("101070"), ' AND '),
  QUESTION_MARK: stryMutAct_9fa48("101071") ? "" : (stryCov_9fa48("101071"), '?'),
  OPEN_PAREN: stryMutAct_9fa48("101072") ? "" : (stryCov_9fa48("101072"), '('),
  CLOSE_PAREN: stryMutAct_9fa48("101073") ? "" : (stryCov_9fa48("101073"), ')'),
  COMMA: stryMutAct_9fa48("101074") ? "" : (stryCov_9fa48("101074"), ','),
  SINGLE_QUOTE: stryMutAct_9fa48("101075") ? "" : (stryCov_9fa48("101075"), '\''),
  DOUBLE_QUOTE: stryMutAct_9fa48("101076") ? "" : (stryCov_9fa48("101076"), '"'),
  NULL_VALUE: stryMutAct_9fa48("101077") ? "" : (stryCov_9fa48("101077"), 'NULL')
}));
const PARTITION_SERVICE_STATE_KEY = Object.freeze(stryMutAct_9fa48("101078") ? {} : (stryCov_9fa48("101078"), {
  CURRENT_TERM: stryMutAct_9fa48("101079") ? "" : (stryCov_9fa48("101079"), 'currentTerm'),
  VOTED_FOR: stryMutAct_9fa48("101080") ? "" : (stryCov_9fa48("101080"), 'votedFor')
}));
const PARTITION_SERVICE_MESSAGE_TYPE = Object.freeze(stryMutAct_9fa48("101081") ? {} : (stryCov_9fa48("101081"), {
  FORWARD_WRITE: stryMutAct_9fa48("101082") ? "" : (stryCov_9fa48("101082"), 'FORWARD_WRITE'),
  SYSTEM_TABLE_WRITE: stryMutAct_9fa48("101083") ? "" : (stryCov_9fa48("101083"), 'SYSTEM_TABLE_WRITE'),
  QUERY: stryMutAct_9fa48("101084") ? "" : (stryCov_9fa48("101084"), 'QUERY'),
  TRANSACTION: stryMutAct_9fa48("101085") ? "" : (stryCov_9fa48("101085"), 'TRANSACTION'),
  START_SPLIT_REPLICATION: stryMutAct_9fa48("101086") ? "" : (stryCov_9fa48("101086"), 'START_SPLIT_REPLICATION')
}));
const PARTITION_SERVICE_RESPONSE = Object.freeze(stryMutAct_9fa48("101087") ? {} : (stryCov_9fa48("101087"), {
  LEADER_REDIRECT: stryMutAct_9fa48("101088") ? "" : (stryCov_9fa48("101088"), 'LEADER_REDIRECT')
}));
const PARTITION_SERVICE_OPERATION = Object.freeze(stryMutAct_9fa48("101089") ? {} : (stryCov_9fa48("101089"), {
  WRITE: stryMutAct_9fa48("101090") ? "" : (stryCov_9fa48("101090"), 'WRITE'),
  INSERT: stryMutAct_9fa48("101091") ? "" : (stryCov_9fa48("101091"), 'INSERT'),
  UPDATE: stryMutAct_9fa48("101092") ? "" : (stryCov_9fa48("101092"), 'UPDATE'),
  DELETE: stryMutAct_9fa48("101093") ? "" : (stryCov_9fa48("101093"), 'DELETE'),
  UPSERT: stryMutAct_9fa48("101094") ? "" : (stryCov_9fa48("101094"), 'UPSERT'),
  QUERY: stryMutAct_9fa48("101095") ? "" : (stryCov_9fa48("101095"), 'QUERY'),
  MIGRATION_ALTER_TABLE: stryMutAct_9fa48("101096") ? "" : (stryCov_9fa48("101096"), 'MIGRATION_ALTER_TABLE'),
  BEGIN_TRANSACTION: stryMutAct_9fa48("101097") ? "" : (stryCov_9fa48("101097"), 'BEGIN_TRANSACTION'),
  PREPARE_TRANSACTION: stryMutAct_9fa48("101098") ? "" : (stryCov_9fa48("101098"), 'PREPARE_TRANSACTION'),
  COMMIT: stryMutAct_9fa48("101099") ? "" : (stryCov_9fa48("101099"), 'COMMIT'),
  ROLLBACK: stryMutAct_9fa48("101100") ? "" : (stryCov_9fa48("101100"), 'ROLLBACK'),
  TRANSACTION_COMMIT: stryMutAct_9fa48("101101") ? "" : (stryCov_9fa48("101101"), 'TRANSACTION_COMMIT')
}));
const PARTITION_SERVICE_ROLE = Object.freeze(stryMutAct_9fa48("101102") ? {} : (stryCov_9fa48("101102"), {
  LEADER: stryMutAct_9fa48("101103") ? "" : (stryCov_9fa48("101103"), 'leader'),
  FOLLOWER: stryMutAct_9fa48("101104") ? "" : (stryCov_9fa48("101104"), 'follower'),
  CANDIDATE: stryMutAct_9fa48("101105") ? "" : (stryCov_9fa48("101105"), 'candidate')
}));
const PARTITION_SERVICE_EVENT = Object.freeze(stryMutAct_9fa48("101106") ? {} : (stryCov_9fa48("101106"), {
  DATA: stryMutAct_9fa48("101107") ? "" : (stryCov_9fa48("101107"), 'data'),
  INITIALIZED: stryMutAct_9fa48("101108") ? "" : (stryCov_9fa48("101108"), 'initialized'),
  LEADER_ELECTED: stryMutAct_9fa48("101109") ? "" : (stryCov_9fa48("101109"), 'leaderElected'),
  ENTRY_COMMITTED: stryMutAct_9fa48("101110") ? "" : (stryCov_9fa48("101110"), 'entryCommitted'),
  KEY_RANGE_CHANGED: stryMutAct_9fa48("101111") ? "" : (stryCov_9fa48("101111"), 'keyRangeChanged'),
  SIZE_UPDATED: stryMutAct_9fa48("101112") ? "" : (stryCov_9fa48("101112"), 'sizeUpdated'),
  CDC_EVENT: stryMutAct_9fa48("101113") ? "" : (stryCov_9fa48("101113"), 'cdcEvent'),
  CDC_CATCHUP_STARTED: stryMutAct_9fa48("101114") ? "" : (stryCov_9fa48("101114"), 'cdcCatchupStarted'),
  CDC_CATCHUP_COMPLETED: stryMutAct_9fa48("101115") ? "" : (stryCov_9fa48("101115"), 'cdcCatchupCompleted'),
  SHUTDOWN: stryMutAct_9fa48("101116") ? "" : (stryCov_9fa48("101116"), 'shutdown')
}));
const PARTITION_SERVICE_REASON = Object.freeze(stryMutAct_9fa48("101117") ? {} : (stryCov_9fa48("101117"), {
  COMMIT: stryMutAct_9fa48("101118") ? "" : (stryCov_9fa48("101118"), 'commit'),
  LEADER_CHANGE: stryMutAct_9fa48("101119") ? "" : (stryCov_9fa48("101119"), 'leader change'),
  TERM_CHANGE: stryMutAct_9fa48("101120") ? "" : (stryCov_9fa48("101120"), 'term change')
}));
const PARTITION_SERVICE_ADDRESS = Object.freeze(stryMutAct_9fa48("101121") ? {} : (stryCov_9fa48("101121"), {
  SEPARATOR: stryMutAct_9fa48("101122") ? "" : (stryCov_9fa48("101122"), '/'),
  FORMAT_UNIFIED: stryMutAct_9fa48("101123") ? "" : (stryCov_9fa48("101123"), 'unified'),
  FORMAT_SIMPLE: stryMutAct_9fa48("101124") ? "" : (stryCov_9fa48("101124"), 'simple')
}));
const PARTITION_SERVICE_DB = Object.freeze(stryMutAct_9fa48("101125") ? {} : (stryCov_9fa48("101125"), {
  PRAGMA_JOURNAL_MODE: stryMutAct_9fa48("101126") ? "" : (stryCov_9fa48("101126"), 'journal_mode = WAL'),
  PRAGMA_SYNCHRONOUS: stryMutAct_9fa48("101127") ? "" : (stryCov_9fa48("101127"), 'synchronous = NORMAL'),
  PRAGMA_PAGE_COUNT: stryMutAct_9fa48("101128") ? "" : (stryCov_9fa48("101128"), 'page_count'),
  PRAGMA_PAGE_SIZE: stryMutAct_9fa48("101129") ? "" : (stryCov_9fa48("101129"), 'page_size'),
  PRAGMA_SIMPLE: stryMutAct_9fa48("101130") ? "" : (stryCov_9fa48("101130"), 'simple')
}));
const PARTITION_SERVICE_COLUMN = Object.freeze(stryMutAct_9fa48("101131") ? {} : (stryCov_9fa48("101131"), {
  CONNECTION_STATE: stryMutAct_9fa48("101132") ? "" : (stryCov_9fa48("101132"), 'connection_state'),
  LEGACY_WS_CONNECTION_STATE: stryMutAct_9fa48("101133") ? "" : (stryCov_9fa48("101133"), 'ws_connection_state'),
  CAPABILITIES: stryMutAct_9fa48("101134") ? "" : (stryCov_9fa48("101134"), 'capabilities'),
  READY_LEASE_EXPIRES_AT: stryMutAct_9fa48("101135") ? "" : (stryCov_9fa48("101135"), 'ready_lease_expires_at'),
  TABLE_NAME: stryMutAct_9fa48("101136") ? "" : (stryCov_9fa48("101136"), 'table_name'),
  ACTIVE_PARTITION_VERSION: stryMutAct_9fa48("101137") ? "" : (stryCov_9fa48("101137"), 'active_partition_version'),
  PENDING_PARTITION_VERSION: stryMutAct_9fa48("101138") ? "" : (stryCov_9fa48("101138"), 'pending_partition_version'),
  PARTITION_TRANSITION_STATE: stryMutAct_9fa48("101139") ? "" : (stryCov_9fa48("101139"), 'partition_transition_state'),
  PARTITION_TRANSITION_METADATA: stryMutAct_9fa48("101140") ? "" : (stryCov_9fa48("101140"), 'partition_transition_metadata'),
  PARTITION_VERSION: stryMutAct_9fa48("101141") ? "" : (stryCov_9fa48("101141"), 'partition_version')
}));
const PARTITION_SERVICE_COLUMN_SQL = Object.freeze(stryMutAct_9fa48("101142") ? {} : (stryCov_9fa48("101142"), {
  ADD_CONNECTION_STATE: stryMutAct_9fa48("101143") ? "" : (stryCov_9fa48("101143"), 'ADD COLUMN connection_state TEXT DEFAULT \'disconnected\''),
  ADD_CAPABILITIES: stryMutAct_9fa48("101144") ? "" : (stryCov_9fa48("101144"), 'ADD COLUMN capabilities TEXT DEFAULT \'[]\''),
  ADD_READY_LEASE_EXPIRES_AT: stryMutAct_9fa48("101145") ? "" : (stryCov_9fa48("101145"), 'ADD COLUMN ready_lease_expires_at INTEGER'),
  ADD_LEADER_NODE_ID: stryMutAct_9fa48("101146") ? "" : (stryCov_9fa48("101146"), 'ADD COLUMN leader_node_id TEXT'),
  ADD_TABLE_NAME: stryMutAct_9fa48("101147") ? "" : (stryCov_9fa48("101147"), 'ADD COLUMN table_name TEXT'),
  ADD_ACTIVE_PARTITION_VERSION: stryMutAct_9fa48("101148") ? "" : (stryCov_9fa48("101148"), 'ADD COLUMN active_partition_version INTEGER NOT NULL DEFAULT 1'),
  ADD_PENDING_PARTITION_VERSION: stryMutAct_9fa48("101149") ? "" : (stryCov_9fa48("101149"), 'ADD COLUMN pending_partition_version INTEGER'),
  ADD_PARTITION_TRANSITION_STATE: stryMutAct_9fa48("101150") ? "" : (stryCov_9fa48("101150"), 'ADD COLUMN partition_transition_state TEXT'),
  ADD_PARTITION_TRANSITION_METADATA: stryMutAct_9fa48("101151") ? "" : (stryCov_9fa48("101151"), 'ADD COLUMN partition_transition_metadata TEXT'),
  ADD_PARTITION_VERSION: stryMutAct_9fa48("101152") ? "" : (stryCov_9fa48("101152"), 'ADD COLUMN partition_version INTEGER NOT NULL DEFAULT 1'),
  BACKFILL_CONNECTION_STATE_FROM_LEGACY_WS: (stryMutAct_9fa48("101153") ? "" : (stryCov_9fa48("101153"), 'SET connection_state = ws_connection_state ')) + (stryMutAct_9fa48("101154") ? "" : (stryCov_9fa48("101154"), 'WHERE ws_connection_state IS NOT NULL'))
}));
const PARTITION_SERVICE_LIFERAFT_TIMER = Object.freeze(stryMutAct_9fa48("101155") ? {} : (stryCov_9fa48("101155"), {
  HEARTBEAT: stryMutAct_9fa48("101156") ? "" : (stryCov_9fa48("101156"), 'heartbeat'),
  ELECTION_MIN: stryMutAct_9fa48("101157") ? "" : (stryCov_9fa48("101157"), 'election min'),
  ELECTION_MAX: stryMutAct_9fa48("101158") ? "" : (stryCov_9fa48("101158"), 'election max'),
  LOG: stryMutAct_9fa48("101159") ? "" : (stryCov_9fa48("101159"), 'Log'),
  HEARTBEAT_ELECTION: stryMutAct_9fa48("101160") ? "" : (stryCov_9fa48("101160"), 'heartbeat, election')
}));
const PARTITION_SERVICE_STATUS = Object.freeze(stryMutAct_9fa48("101161") ? {} : (stryCov_9fa48("101161"), {
  INITIATED: stryMutAct_9fa48("101162") ? "" : (stryCov_9fa48("101162"), 'initiated')
}));
const PARTITION_SERVICE_MIGRATION_OPERATION = Object.freeze(stryMutAct_9fa48("101163") ? {} : (stryCov_9fa48("101163"), {
  ALTER_TABLE: stryMutAct_9fa48("101164") ? "" : (stryCov_9fa48("101164"), 'alter_table')
}));
const PARTITION_SERVICE_TYPE = Object.freeze(stryMutAct_9fa48("101165") ? {} : (stryCov_9fa48("101165"), {
  FUNCTION: stryMutAct_9fa48("101166") ? "" : (stryCov_9fa48("101166"), 'function')
}));
const PARTITION_SERVICE_CDC = Object.freeze(stryMutAct_9fa48("101167") ? {} : (stryCov_9fa48("101167"), {
  HANDSHAKE_STATUS_OK: stryMutAct_9fa48("101168") ? "" : (stryCov_9fa48("101168"), 'ok'),
  HANDSHAKE_STATUS_ALREADY_SUBSCRIBED: stryMutAct_9fa48("101169") ? "" : (stryCov_9fa48("101169"), 'already_subscribed'),
  CATCHUP_MODE_NONE: stryMutAct_9fa48("101170") ? "" : (stryCov_9fa48("101170"), 'none'),
  CATCHUP_MODE_BACKFILL: stryMutAct_9fa48("101171") ? "" : (stryCov_9fa48("101171"), 'backfill'),
  CATCHUP_MODE_SLIDING_WINDOW: stryMutAct_9fa48("101172") ? "" : (stryCov_9fa48("101172"), 'sliding_window'),
  STREAM_MODE_CATCHUP: stryMutAct_9fa48("101173") ? "" : (stryCov_9fa48("101173"), 'catchup'),
  STREAM_MODE_STEADY: stryMutAct_9fa48("101174") ? "" : (stryCov_9fa48("101174"), 'steady'),
  SUBSCRIBER_ID_PREFIX: stryMutAct_9fa48("101175") ? "" : (stryCov_9fa48("101175"), 'cdc-subscriber'),
  REPLAY_REASON_BUFFERED_REMAINING: stryMutAct_9fa48("101176") ? "" : (stryCov_9fa48("101176"), 'buffered_events_remaining')
}));
const PARTITION_SERVICE_INIT_STAGE = Object.freeze(stryMutAct_9fa48("101177") ? {} : (stryCov_9fa48("101177"), {
  STARTING: stryMutAct_9fa48("101178") ? "" : (stryCov_9fa48("101178"), 'starting'),
  OPENING_DB: stryMutAct_9fa48("101179") ? "" : (stryCov_9fa48("101179"), 'opening_db'),
  JOINING_PEERS: stryMutAct_9fa48("101180") ? "" : (stryCov_9fa48("101180"), 'joining_peers'),
  JOINED_PEER: stryMutAct_9fa48("101181") ? "" : (stryCov_9fa48("101181"), 'joined_peer'),
  READY: stryMutAct_9fa48("101182") ? "" : (stryCov_9fa48("101182"), 'ready')
}));
const PARTITION_SERVICE_LOG_MSG = Object.freeze(stryMutAct_9fa48("101183") ? {} : (stryCov_9fa48("101183"), {
  INITIALIZING: stryMutAct_9fa48("101184") ? "" : (stryCov_9fa48("101184"), 'Initializing partition service'),
  CREATED_PARTITION_DIR: stryMutAct_9fa48("101185") ? "" : (stryCov_9fa48("101185"), 'Created partition directory'),
  DEFERRING_ELECTION_START: stryMutAct_9fa48("101186") ? "" : (stryCov_9fa48("101186"), 'Deferring election start'),
  STARTING_AS_LEARNER: stryMutAct_9fa48("101187") ? "" : (stryCov_9fa48("101187"), 'Starting as learner (non-voting) - will promote after catch-up'),
  LEARNER_PROMOTION_SCHEDULED: stryMutAct_9fa48("101188") ? "" : (stryCov_9fa48("101188"), 'Learner promotion check scheduled'),
  LEARNER_PROMOTED_TO_FOLLOWER: stryMutAct_9fa48("101189") ? "" : (stryCov_9fa48("101189"), 'Learner promoted to follower - now participating in elections'),
  LEARNER_PROMOTION_CHECK: stryMutAct_9fa48("101190") ? "" : (stryCov_9fa48("101190"), 'Checking learner promotion eligibility'),
  LEARNER_PROMOTION_DEFERRED: stryMutAct_9fa48("101191") ? "" : (stryCov_9fa48("101191"), 'Learner promotion deferred - would cause even voter count'),
  LEARNER_PROMOTION_ALLOWED_MULTI: stryMutAct_9fa48("101192") ? "" : (stryCov_9fa48("101192"), 'Learner promotion allowed - multiple learners will reach odd'),
  CLEARED_LIFERAFT_TIMERS: stryMutAct_9fa48("101193") ? "" : (stryCov_9fa48("101193"), 'Cleared liferaft timers for deferred election'),
  BECAME_LEADER: stryMutAct_9fa48("101194") ? "" : (stryCov_9fa48("101194"), 'Became leader (liferaft)'),
  LEADER_CHANGED: stryMutAct_9fa48("101195") ? "" : (stryCov_9fa48("101195"), 'Leader changed'),
  JOINING_PEER_ADDRESS: stryMutAct_9fa48("101196") ? "" : (stryCov_9fa48("101196"), 'Joining peer with fully qualified address'),
  PEER_ADDRESS_NOT_UNIFIED: stryMutAct_9fa48("101197") ? "" : (stryCov_9fa48("101197"), 'Peer address must be in unified format'),
  PEER_ADDRESS_FROM_LIST: stryMutAct_9fa48("101198") ? "" : (stryCov_9fa48("101198"), 'Built peer address from peerAddresses array'),
  PEER_ADDRESS_FROM_CACHE: stryMutAct_9fa48("101199") ? "" : (stryCov_9fa48("101199"), 'Built peer address from cache'),
  PEER_ADDRESS_FROM_NODE: stryMutAct_9fa48("101200") ? "" : (stryCov_9fa48("101200"), 'Built peer address using local nodeId'),
  SINGLE_REPLICA_LEADER: stryMutAct_9fa48("101201") ? "" : (stryCov_9fa48("101201"), 'Single replica - becoming leader immediately'),
  INITIALIZED: stryMutAct_9fa48("101202") ? "" : (stryCov_9fa48("101202"), 'Partition service initialized'),
  STARTING_ELECTION_TIMER: stryMutAct_9fa48("101203") ? "" : (stryCov_9fa48("101203"), 'Starting Raft election timer'),
  APPLIED_RUNTIME_RAFT_TIMING: stryMutAct_9fa48("101204") ? "" : (stryCov_9fa48("101204"), 'Applied runtime raft timing configuration'),
  CREATED_TABLE: stryMutAct_9fa48("101205") ? "" : (stryCov_9fa48("101205"), 'Created table'),
  ADDED_CONNECTION_STATE: stryMutAct_9fa48("101206") ? "" : (stryCov_9fa48("101206"), 'Added connection_state column to nodes table'),
  MIGRATED_CONNECTION_STATE_FROM_LEGACY_WS: stryMutAct_9fa48("101207") ? "" : (stryCov_9fa48("101207"), 'Migrated connection_state values from legacy ws_connection_state column'),
  ADDED_CAPABILITIES: stryMutAct_9fa48("101208") ? "" : (stryCov_9fa48("101208"), 'Added capabilities column to nodes table'),
  ADDED_READY_LEASE: stryMutAct_9fa48("101209") ? "" : (stryCov_9fa48("101209"), 'Added ready_lease_expires_at column to nodes table'),
  ADDED_MESSAGE_GROUP_LEADER: stryMutAct_9fa48("101210") ? "" : (stryCov_9fa48("101210"), 'Added leader_node_id column to message_groups table'),
  ADDED_ACTIVE_PARTITION_VERSION: stryMutAct_9fa48("101211") ? "" : (stryCov_9fa48("101211"), 'Added active_partition_version column to tables table'),
  ADDED_PENDING_PARTITION_VERSION: stryMutAct_9fa48("101212") ? "" : (stryCov_9fa48("101212"), 'Added pending_partition_version column to tables table'),
  ADDED_PARTITION_TRANSITION_STATE: stryMutAct_9fa48("101213") ? "" : (stryCov_9fa48("101213"), 'Added partition_transition_state column to tables table'),
  ADDED_PARTITION_TRANSITION_METADATA: stryMutAct_9fa48("101214") ? "" : (stryCov_9fa48("101214"), 'Added partition_transition_metadata column to tables table'),
  ADDED_PARTITIONS_TABLE_NAME: stryMutAct_9fa48("101215") ? "" : (stryCov_9fa48("101215"), 'Added table_name column to partitions table'),
  ADDED_PARTITION_VERSION: stryMutAct_9fa48("101216") ? "" : (stryCov_9fa48("101216"), 'Added partition_version column to partitions table'),
  RECEIVED_RAFT_PACKET: stryMutAct_9fa48("101217") ? "" : (stryCov_9fa48("101217"), 'Received Raft packet'),
  SENDING_RAFT_RESPONSE: stryMutAct_9fa48("101218") ? "" : (stryCov_9fa48("101218"), 'Sending Raft response'),
  FAILED_RAFT_RESPONSE: stryMutAct_9fa48("101219") ? "" : (stryCov_9fa48("101219"), 'Failed to send Raft response'),
  UNKNOWN_MESSAGE_TYPE: stryMutAct_9fa48("101220") ? "" : (stryCov_9fa48("101220"), 'Unknown application message type'),
  HANDLING_SYSTEM_TABLE_WRITE: stryMutAct_9fa48("101221") ? "" : (stryCov_9fa48("101221"), 'Handling system table write from remote node'),
  HANDLING_REMOTE_QUERY: stryMutAct_9fa48("101222") ? "" : (stryCov_9fa48("101222"), 'Handling remote query'),
  START_SPLIT_REPLICATION_REQUEST: stryMutAct_9fa48("101223") ? "" : (stryCov_9fa48("101223"), 'Handling partition split replication request'),
  SPLIT_REPLICATION_STARTED: stryMutAct_9fa48("101224") ? "" : (stryCov_9fa48("101224"), 'Partition split replication started'),
  SPLIT_REPLICATION_COMPLETED: stryMutAct_9fa48("101225") ? "" : (stryCov_9fa48("101225"), 'Partition split replication completed'),
  SPLIT_REPLICATION_FAILED: stryMutAct_9fa48("101226") ? "" : (stryCov_9fa48("101226"), 'Partition split replication failed'),
  SPLIT_REPLICATION_MIRROR_FAILED: stryMutAct_9fa48("101227") ? "" : (stryCov_9fa48("101227"), 'Partition split mirror delivery failed'),
  SPLIT_REPLICATION_CUTOVER_UPDATED: stryMutAct_9fa48("101228") ? "" : (stryCov_9fa48("101228"), 'Partition split cutover metadata updated'),
  SPLIT_REPLICATION_ACK_EMITTED: stryMutAct_9fa48("101229") ? "" : (stryCov_9fa48("101229"), 'Partition split source acknowledgement emitted'),
  SPLIT_REPLICATION_ACK_FAILED: stryMutAct_9fa48("101230") ? "" : (stryCov_9fa48("101230"), 'Partition split source acknowledgement failed'),
  SPLIT_REPLICATION_RECONSTRUCTED: stryMutAct_9fa48("101231") ? "" : (stryCov_9fa48("101231"), 'Partition split execution state reconstructed from durable workflow'),
  SPLIT_REPLICATION_SIZE_PERSIST_FAILED: stryMutAct_9fa48("101232") ? "" : (stryCov_9fa48("101232"), 'Partition size persistence failed'),
  REDIRECTING_WRITE_TO_LEADER: stryMutAct_9fa48("101233") ? "" : (stryCov_9fa48("101233"), 'Redirecting write to leader'),
  APPLYING_COMMITTED_ENTRY: stryMutAct_9fa48("101234") ? "" : (stryCov_9fa48("101234"), 'Applying committed entry'),
  TRANSACTION_COMMIT_APPLIED: stryMutAct_9fa48("101235") ? "" : (stryCov_9fa48("101235"), 'Transaction commit entry applied'),
  BEGINNING_TRANSACTION: stryMutAct_9fa48("101236") ? "" : (stryCov_9fa48("101236"), 'Beginning transaction'),
  PREPARING_TRANSACTION: stryMutAct_9fa48("101237") ? "" : (stryCov_9fa48("101237"), 'Preparing transaction'),
  PREPARED_STATE_RECONSTRUCTED: stryMutAct_9fa48("101238") ? "" : (stryCov_9fa48("101238"), 'Prepared transaction state reconstructed'),
  PREPARED_STATE_HOLD_TIMEOUT: stryMutAct_9fa48("101239") ? "" : (stryCov_9fa48("101239"), 'Prepared transaction state hold timeout'),
  COMMITTING_TRANSACTION: stryMutAct_9fa48("101240") ? "" : (stryCov_9fa48("101240"), 'Committing transaction'),
  ROLLING_BACK_TRANSACTION: stryMutAct_9fa48("101241") ? "" : (stryCov_9fa48("101241"), 'Rolling back transaction'),
  EXECUTING_QUERY: stryMutAct_9fa48("101242") ? "" : (stryCov_9fa48("101242"), 'Executing query'),
  APPLY_WRITE_CALLED: stryMutAct_9fa48("101243") ? "" : (stryCov_9fa48("101243"), 'applyWrite called'),
  GENERATE_CDC_EVENT_CALLED: stryMutAct_9fa48("101244") ? "" : (stryCov_9fa48("101244"), 'generateCDCEvent called'),
  NO_CDC_SUBSCRIBERS: stryMutAct_9fa48("101245") ? "" : (stryCov_9fa48("101245"), 'No CDC subscribers, skipping event generation'),
  DETECTED_OPERATION_TYPE: stryMutAct_9fa48("101246") ? "" : (stryCov_9fa48("101246"), 'Detected operation type from SQL'),
  EXTRACTED_TABLE_NAME: stryMutAct_9fa48("101247") ? "" : (stryCov_9fa48("101247"), 'Extracted table name from SQL'),
  GENERATED_CDC_EVENT: stryMutAct_9fa48("101248") ? "" : (stryCov_9fa48("101248"), 'Generated CDC event'),
  CDC_DELIVERY_COMPLETE: stryMutAct_9fa48("101249") ? "" : (stryCov_9fa48("101249"), 'CDC event delivery complete'),
  CDC_DELIVERY_BUFFERED_FOR_RETRY: stryMutAct_9fa48("101250") ? "" : (stryCov_9fa48("101250"), 'CDC event buffered for retry after delivery failure'),
  CDC_BUFFER_REPLAY_SCHEDULED: stryMutAct_9fa48("101251") ? "" : (stryCov_9fa48("101251"), 'Scheduled buffered CDC replay'),
  CDC_BUFFER_REPLAY_COMPLETE: stryMutAct_9fa48("101252") ? "" : (stryCov_9fa48("101252"), 'Buffered CDC replay complete'),
  CDC_BUFFER_REPLAY_FAILED: stryMutAct_9fa48("101253") ? "" : (stryCov_9fa48("101253"), 'Buffered CDC replay failed'),
  FETCHED_INSERT_ROW: stryMutAct_9fa48("101254") ? "" : (stryCov_9fa48("101254"), 'Fetched inserted row for CDC'),
  FETCHING_UPDATE_ROW: stryMutAct_9fa48("101255") ? "" : (stryCov_9fa48("101255"), 'Fetching updated row for CDC'),
  FETCHED_UPDATE_ROW: stryMutAct_9fa48("101256") ? "" : (stryCov_9fa48("101256"), 'Fetched updated row for CDC'),
  EXTRACTED_PARAM_INSERT: stryMutAct_9fa48("101257") ? "" : (stryCov_9fa48("101257"), 'Extracted data from parameterized INSERT'),
  EXTRACTED_PARAM_UPDATE: stryMutAct_9fa48("101258") ? "" : (stryCov_9fa48("101258"), 'Extracted data from parameterized UPDATE'),
  EXTRACTED_PARAM_DELETE: stryMutAct_9fa48("101259") ? "" : (stryCov_9fa48("101259"), 'Extracted data from parameterized DELETE'),
  CDC_SUBSCRIBER_ADDED: stryMutAct_9fa48("101260") ? "" : (stryCov_9fa48("101260"), 'CDC subscriber added'),
  CDC_SUBSCRIBER_REMOVED: stryMutAct_9fa48("101261") ? "" : (stryCov_9fa48("101261"), 'CDC subscriber removed'),
  CDC_SUBSCRIPTION_HANDSHAKE_ACK: stryMutAct_9fa48("101262") ? "" : (stryCov_9fa48("101262"), 'CDC subscription handshake acknowledged'),
  CDC_CATCHUP_STARTED: stryMutAct_9fa48("101263") ? "" : (stryCov_9fa48("101263"), 'CDC catch-up replay started'),
  CDC_CATCHUP_COMPLETED: stryMutAct_9fa48("101264") ? "" : (stryCov_9fa48("101264"), 'CDC catch-up replay completed'),
  PARTITION_SIZE_UPDATED: stryMutAct_9fa48("101265") ? "" : (stryCov_9fa48("101265"), 'Partition size updated'),
  INIT_STAGE_CALLBACK_FAILED: stryMutAct_9fa48("101266") ? "" : (stryCov_9fa48("101266"), 'Partition initialization stage callback failed'),
  REBALANCER_DEPENDENCIES_APPLIED: stryMutAct_9fa48("101267") ? "" : (stryCov_9fa48("101267"), 'Rebalancer dependencies applied via bundle'),
  COORDINATOR_REBOUND: stryMutAct_9fa48("101268") ? "" : (stryCov_9fa48("101268"), 'Coordinator rebound via canonical rebind path'),
  DELIVERING_WITH_ACK: stryMutAct_9fa48("101269") ? "" : (stryCov_9fa48("101269"), 'Delivering message with ACK via PendingRequestTracker'),
  TRACKER_SHUTDOWN: stryMutAct_9fa48("101270") ? "" : (stryCov_9fa48("101270"), 'Tracker shutdown'),
  TRACKER_SHUTDOWN_DELIVERY: stryMutAct_9fa48("101271") ? "" : (stryCov_9fa48("101271"), 'Tracker shutdown during delivery - operation completed'),
  TRACKER_SHUTDOWN_ACK: stryMutAct_9fa48("101272") ? "" : (stryCov_9fa48("101272"), 'Tracker shutdown during ACK wait - operation completed'),
  REPLICA_REMOVAL_SELF: stryMutAct_9fa48("101273") ? "" : (stryCov_9fa48("101273"), 'Replica removal completed (self-removal)'),
  RECEIVED_ACK: stryMutAct_9fa48("101274") ? "" : (stryCov_9fa48("101274"), 'Received ACK in transport response'),
  SHUTTING_DOWN: stryMutAct_9fa48("101275") ? "" : (stryCov_9fa48("101275"), 'Shutting down partition service'),
  TIMER_SKIPPED_AFTER_SHUTDOWN: stryMutAct_9fa48("101276") ? "" : (stryCov_9fa48("101276"), 'Timer creation skipped - partition service already shut down'),
  MIGRATION_ALTER_TABLE_APPLIED: stryMutAct_9fa48("101277") ? "" : (stryCov_9fa48("101277"), 'Applied migration ALTER TABLE command'),
  MIGRATION_DEFAULT_REGISTERED: stryMutAct_9fa48("101278") ? "" : (stryCov_9fa48("101278"), 'Registered migration column default')
}));
const PARTITION_SERVICE_ERROR_MSG = Object.freeze(stryMutAct_9fa48("101279") ? {} : (stryCov_9fa48("101279"), {
  REQUIRE_PARTITION_ID: stryMutAct_9fa48("101280") ? "" : (stryCov_9fa48("101280"), 'PartitionService requires partitionId'),
  REQUIRE_TABLE_ID: stryMutAct_9fa48("101281") ? "" : (stryCov_9fa48("101281"), 'PartitionService requires tableId'),
  REQUIRE_REPLICA_ID: stryMutAct_9fa48("101282") ? "" : (stryCov_9fa48("101282"), 'PartitionService requires replicaId'),
  INVALID_MESSAGE: stryMutAct_9fa48("101283") ? "" : (stryCov_9fa48("101283"), 'Invalid message'),
  INVALID_FORWARD_WRITE: stryMutAct_9fa48("101284") ? "" : (stryCov_9fa48("101284"), 'Invalid FORWARD_WRITE message'),
  INVALID_SPLIT_REPLICATION: stryMutAct_9fa48("101285") ? "" : (stryCov_9fa48("101285"), 'Invalid START_SPLIT_REPLICATION message'),
  unknownMessage: stryMutAct_9fa48("101286") ? () => undefined : (stryCov_9fa48("101286"), type => stryMutAct_9fa48("101287") ? `` : (stryCov_9fa48("101287"), `Unknown message type: ${type}`)),
  unknownOperation: stryMutAct_9fa48("101288") ? () => undefined : (stryCov_9fa48("101288"), operation => stryMutAct_9fa48("101289") ? `` : (stryCov_9fa48("101289"), `Unknown operation: ${operation}`)),
  forwardWriteFailed: stryMutAct_9fa48("101290") ? () => undefined : (stryCov_9fa48("101290"), message => stryMutAct_9fa48("101291") ? `` : (stryCov_9fa48("101291"), `Failed to forward write to leader: ${message}`)),
  SYSTEM_TABLE_WRITE_FAILED: stryMutAct_9fa48("101292") ? "" : (stryCov_9fa48("101292"), 'System table write failed'),
  MISSING_SQL_QUERY: stryMutAct_9fa48("101293") ? "" : (stryCov_9fa48("101293"), 'Missing SQL query'),
  REMOTE_QUERY_FAILED: stryMutAct_9fa48("101294") ? "" : (stryCov_9fa48("101294"), 'Remote query execution failed'),
  CDC_EVENT_FAILED: stryMutAct_9fa48("101295") ? "" : (stryCov_9fa48("101295"), 'Failed to generate CDC event for committed entry'),
  APPLY_COMMITTED_FAILED: stryMutAct_9fa48("101296") ? "" : (stryCov_9fa48("101296"), 'Failed to apply committed entry'),
  NOT_INITIALIZED: stryMutAct_9fa48("101297") ? "" : (stryCov_9fa48("101297"), 'PartitionService not initialized'),
  TRANSACTION_ALREADY_ACTIVE: stryMutAct_9fa48("101298") ? "" : (stryCov_9fa48("101298"), 'Transaction already active on this partition'),
  BEGIN_TRANSACTION_FAILED: stryMutAct_9fa48("101299") ? "" : (stryCov_9fa48("101299"), 'Failed to begin transaction'),
  PREPARE_CONFLICT: stryMutAct_9fa48("101300") ? "" : (stryCov_9fa48("101300"), 'Prepare failed due to write conflict'),
  NO_ACTIVE_TRANSACTION_PREPARE: stryMutAct_9fa48("101301") ? "" : (stryCov_9fa48("101301"), 'No active transaction to prepare'),
  SNAPSHOT_EXPIRED: stryMutAct_9fa48("101302") ? "" : (stryCov_9fa48("101302"), 'Snapshot history expired for transaction epoch'),
  PREPARE_LOST: stryMutAct_9fa48("101303") ? "" : (stryCov_9fa48("101303"), 'Prepared state lost after failover'),
  NO_ACTIVE_TRANSACTION_COMMIT: stryMutAct_9fa48("101304") ? "" : (stryCov_9fa48("101304"), 'No active transaction to commit'),
  COMMIT_TRANSACTION_FAILED: stryMutAct_9fa48("101305") ? "" : (stryCov_9fa48("101305"), 'Failed to commit transaction'),
  NO_ACTIVE_TRANSACTION_ROLLBACK: stryMutAct_9fa48("101306") ? "" : (stryCov_9fa48("101306"), 'No active transaction to rollback'),
  ROLLBACK_TRANSACTION_FAILED: stryMutAct_9fa48("101307") ? "" : (stryCov_9fa48("101307"), 'Failed to rollback transaction'),
  NO_ACTIVE_TRANSACTION: stryMutAct_9fa48("101308") ? "" : (stryCov_9fa48("101308"), 'No active transaction'),
  TRANSACTION_WRITE_FAILED: stryMutAct_9fa48("101309") ? "" : (stryCov_9fa48("101309"), 'Transaction write failed'),
  RAFT_COMMAND_FAILED: stryMutAct_9fa48("101310") ? "" : (stryCov_9fa48("101310"), 'Raft command failed'),
  TRANSACTION_COMMIT_RAFT_FAILED: stryMutAct_9fa48("101311") ? "" : (stryCov_9fa48("101311"), 'Raft command failed for transaction commit'),
  SINGLE_REPLICA_RAFT_OWNER_REQUIRED: stryMutAct_9fa48("101312") ? "" : (stryCov_9fa48("101312"), 'PartitionService single-replica leadership requires raft.change(...)'),
  QUERY_FAILED: stryMutAct_9fa48("101313") ? "" : (stryCov_9fa48("101313"), 'Query execution failed'),
  CDC_UNKNOWN_OPERATION: stryMutAct_9fa48("101314") ? "" : (stryCov_9fa48("101314"), 'Unknown operation type, skipping CDC'),
  CDC_PARSE_INSERT_FAILED: stryMutAct_9fa48("101315") ? "" : (stryCov_9fa48("101315"), 'Could not parse INSERT SQL for CDC'),
  CDC_INSERT_MISMATCH: stryMutAct_9fa48("101316") ? "" : (stryCov_9fa48("101316"), 'Column/value count mismatch in INSERT SQL'),
  CDC_FETCH_INSERT_FAILED: stryMutAct_9fa48("101317") ? "" : (stryCov_9fa48("101317"), 'Failed to fetch inserted row for CDC'),
  CDC_FETCH_UPDATE_FAILED: stryMutAct_9fa48("101318") ? "" : (stryCov_9fa48("101318"), 'Failed to fetch updated row for CDC'),
  CDC_NO_ROW_UPDATE: stryMutAct_9fa48("101319") ? "" : (stryCov_9fa48("101319"), 'No row found for CDC update'),
  CDC_EXTRACT_UPDATE_WHERE_FAILED: stryMutAct_9fa48("101320") ? "" : (stryCov_9fa48("101320"), 'Could not extract WHERE clause from UPDATE SQL'),
  CDC_EXTRACT_DELETE_WHERE_FAILED: stryMutAct_9fa48("101321") ? "" : (stryCov_9fa48("101321"), 'Could not extract WHERE clause from DELETE SQL'),
  CDC_PARSE_PARAM_INSERT_COLUMNS_FAILED: stryMutAct_9fa48("101322") ? "" : (stryCov_9fa48("101322"), 'Could not parse columns from parameterized INSERT'),
  CDC_PARAM_INSERT_MISMATCH: stryMutAct_9fa48("101323") ? "" : (stryCov_9fa48("101323"), 'Column/param count mismatch in parameterized INSERT'),
  CDC_PARSE_PARAM_UPDATE_SET_FAILED: stryMutAct_9fa48("101324") ? "" : (stryCov_9fa48("101324"), 'Could not parse SET clause from parameterized UPDATE'),
  CDC_PARAM_UPDATE_MISMATCH: stryMutAct_9fa48("101325") ? "" : (stryCov_9fa48("101325"), 'Column/param count mismatch in parameterized UPDATE'),
  CDC_PARSE_PARAM_DELETE_WHERE_FAILED: stryMutAct_9fa48("101326") ? "" : (stryCov_9fa48("101326"), 'Could not parse WHERE from parameterized DELETE'),
  CDC_PARAM_DELETE_MISMATCH: stryMutAct_9fa48("101327") ? "" : (stryCov_9fa48("101327"), 'Column/param count mismatch in parameterized DELETE'),
  CDC_DELIVERY_FAILED: stryMutAct_9fa48("101328") ? "" : (stryCov_9fa48("101328"), 'Failed to deliver CDC event'),
  CDC_SUBSCRIPTION_FAILED: stryMutAct_9fa48("101329") ? "" : (stryCov_9fa48("101329"), 'Failed to subscribe CDC listener'),
  CDC_INVALID_SUBSCRIBER: stryMutAct_9fa48("101330") ? "" : (stryCov_9fa48("101330"), 'CDC subscriber must be a function or object with handleCDCEvent'),
  PARTITION_SIZE_FAILED: stryMutAct_9fa48("101331") ? "" : (stryCov_9fa48("101331"), 'Failed to calculate partition size'),
  PARTITION_SIZE_UPDATE_FAILED: stryMutAct_9fa48("101332") ? "" : (stryCov_9fa48("101332"), 'Failed to update partition size'),
  SPLIT_REPLICATION_ROUTING_FAILED: stryMutAct_9fa48("101333") ? "" : (stryCov_9fa48("101333"), 'Failed to route mirrored partition split write'),
  SPLIT_REPLICATION_STATE_REQUIRED: stryMutAct_9fa48("101334") ? "" : (stryCov_9fa48("101334"), 'Partition split transition metadata is required'),
  PERSIST_LEADER_AFTER_CDC_FAILED: stryMutAct_9fa48("101335") ? "" : (stryCov_9fa48("101335"), 'Failed to persist partition leader after CDC service set'),
  PERSIST_PARTITION_LEADER_FAILED: stryMutAct_9fa48("101336") ? "" : (stryCov_9fa48("101336"), 'Failed to persist partition leader update'),
  PERSIST_ROLE_AFTER_CDC_FAILED: stryMutAct_9fa48("101337") ? "" : (stryCov_9fa48("101337"), 'Failed to persist role update after CDC service set'),
  PERSIST_RAFT_ROLE_FAILED: stryMutAct_9fa48("101338") ? "" : (stryCov_9fa48("101338"), 'Failed to persist raft role update'),
  REBALANCER_CACHE_REQUIRED: stryMutAct_9fa48("101339") ? "" : (stryCov_9fa48("101339"), 'PartitionService requires systemTableCache for rebalancer'),
  REBALANCER_CDC_REQUIRED: stryMutAct_9fa48("101340") ? "" : (stryCov_9fa48("101340"), 'PartitionService requires cdcIntegrationService for rebalancer'),
  REBALANCER_POLICY_REQUIRED: stryMutAct_9fa48("101341") ? "" : (stryCov_9fa48("101341"), 'PartitionService requires tablePolicyService for rebalancer'),
  REBALANCER_ROUTER_REQUIRED: stryMutAct_9fa48("101342") ? "" : (stryCov_9fa48("101342"), 'PartitionService requires messageRouter for rebalancer'),
  REBALANCER_SQL_ENGINE_REQUIRED: stryMutAct_9fa48("101343") ? "" : (stryCov_9fa48("101343"), 'PartitionService requires sqlQueryEngine for rebalancer'),
  REBALANCER_COORDINATOR_REQUIRED: stryMutAct_9fa48("101344") ? "" : (stryCov_9fa48("101344"), 'PartitionService requires rebalanceCoordinator for rebalancer'),
  REBALANCER_SET_COORDINATOR_REQUIRED: stryMutAct_9fa48("101345") ? "" : (stryCov_9fa48("101345"), 'PartitionService rebalancer must implement setRebalanceCoordinator'),
  REBALANCE_COORDINATOR_SHUTDOWN_FAILED: stryMutAct_9fa48("101346") ? "" : (stryCov_9fa48("101346"), 'Failed to shutdown rebalance coordinator'),
  REBALANCER_DEPENDENCY_BUNDLE_INCOMPLETE: stryMutAct_9fa48("101347") ? "" : (stryCov_9fa48("101347"), 'Rebalancer dependency bundle is missing required fields'),
  DELIVERY_NOT_ACK: stryMutAct_9fa48("101348") ? "" : (stryCov_9fa48("101348"), 'Delivery not acknowledged'),
  NESTED_ACK_UNSUPPORTED: stryMutAct_9fa48("101349") ? "" : (stryCov_9fa48("101349"), 'Nested ACK responses are not supported'),
  MESSAGE_DELIVERY_FAILED: stryMutAct_9fa48("101350") ? "" : (stryCov_9fa48("101350"), 'Message delivery failed'),
  MIGRATION_ALTER_MISSING_SQL: stryMutAct_9fa48("101351") ? "" : (stryCov_9fa48("101351"), 'Migration ALTER TABLE SQL is required')
}));
const PARTITION_SERVICE_VALUE = Object.freeze(stryMutAct_9fa48("101352") ? {} : (stryCov_9fa48("101352"), {
  ONE_HUNDRED: NUM.HUNDRED,
  TEN: NUM.TEN,
  DEFAULT_TIMEOUT_MS: stryMutAct_9fa48("101353") ? TIME_MS.SECOND / 30 : (stryCov_9fa48("101353"), TIME_MS.SECOND * 30),
  PENDING_REQUEST_SHUTDOWN_TIMEOUT_MS: stryMutAct_9fa48("101354") ? TIME_MS.SECOND / 30 : (stryCov_9fa48("101354"), TIME_MS.SECOND * 30),
  DEFAULT_QUERY_TIMEOUT_MS: NUM.HUNDRED,
  SIZE_BYTES_DIVISOR: NUM.BYTES_PER_MIB,
  SIZE_MB_PRECISION: NUM.TWO,
  // Raft timing: heartbeat should be much smaller than election timeout
  // Election timeout should be 5-10x heartbeat to avoid unnecessary elections
  // On single-node clusters, all replicas are on same node so network is fast
  // but we still need stable leadership to avoid oscillation
  LIFERAFT_HEARTBEAT_DEFAULT_MS: RAFT_ELECTION_TIMING.HEARTBEAT_DEFAULT_MS,
  LIFERAFT_ELECTION_MIN_DEFAULT_MS: RAFT_ELECTION_TIMING.ELECTION_MIN_DEFAULT_MS,
  LIFERAFT_ELECTION_MAX_DEFAULT_MS: RAFT_ELECTION_TIMING.ELECTION_MAX_DEFAULT_MS,
  // Jitter added per replica index to stagger election timeouts.
  // Must be >= (LIFERAFT_ELECTION_MAX - LIFERAFT_ELECTION_MIN) so that
  // replica N's max timeout is always less than replica N+1's min timeout.
  // This guarantees r1 always fires first, preventing re-elections.
  // r1: [1000,3000], r2: [3500,5500], r3: [6000,8000], etc.
  ELECTION_JITTER_PER_REPLICA_MS: RAFT_ELECTION_TIMING.JITTER_PER_REPLICA_MS,
  CDC_WHERE_LIMIT: NUM.HUNDRED,
  CDC_PARSE_LIMIT: NUM.HUNDRED,
  CDC_REDACTION_LIMIT: NUM.HUNDRED,
  CDC_PARSE_SLICE_START: NUM.ZERO,
  CDC_PARSE_SLICE_END: NUM.HUNDRED,
  CDC_TABLE_NAME_EXTRACTION_STATE_FOUND: stryMutAct_9fa48("101355") ? "" : (stryCov_9fa48("101355"), 'found'),
  CDC_TABLE_NAME_EXTRACTION_STATE_NOT_FOUND: stryMutAct_9fa48("101356") ? "" : (stryCov_9fa48("101356"), 'not_found'),
  LIFERAFT_SINGLE_REPLICA_COUNT: NUM.ONE,
  ADDRESS_PARTS_MIN: NUM.ONE
}));
export { PARTITION_SERVICE_LEARNER_PROMOTION_SCHEDULE_REASON, PARTITION_SERVICE_CDC, PARTITION_SERVICE_ADDRESS, PARTITION_SERVICE_COLUMN, PARTITION_SERVICE_COLUMN_SQL, PARTITION_SERVICE_DB, PARTITION_SERVICE_DEFAULT, PARTITION_SERVICE_ERROR_MSG, PARTITION_SERVICE_EVENT, PARTITION_SERVICE_INIT_STAGE, PARTITION_SERVICE_LIFERAFT_TIMER, PARTITION_SERVICE_MIGRATION_OPERATION, PARTITION_SERVICE_LOG_MSG, PARTITION_SERVICE_MESSAGE_TYPE, PARTITION_SERVICE_OPERATION, PARTITION_SERVICE_REASON, PARTITION_SERVICE_RESPONSE, PARTITION_SERVICE_ROLE, PARTITION_SERVICE_SQL, PARTITION_SERVICE_SQL_FRAGMENT, PARTITION_SERVICE_STATE_KEY, PARTITION_SERVICE_STATUS, PARTITION_SERVICE_TYPE, PARTITION_SERVICE_VALUE };