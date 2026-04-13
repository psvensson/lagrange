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
import { NUM, RUNTIME_KIND, TABLES, TIME_MS } from '../constants/index.js';
import { JOINING_SUB_PHASE } from '../node/node-constants.js';
const DEFAULT_REPLICA_STAGGER_DELAY_MS = 50;
const DEFAULT_MAX_CONCURRENT_SERVICE_ACTIONS = 16;
const DEFAULT_REPLICA_REGISTRATION_TRACE_ENABLED = stryMutAct_9fa48("12038") ? true : (stryCov_9fa48("12038"), false);
const BOOTSTRAP_ASSIGNMENT_STRATEGY = Object.freeze(stryMutAct_9fa48("12039") ? {} : (stryCov_9fa48("12039"), {
  MOVE_REPLICA: stryMutAct_9fa48("12040") ? "" : (stryCov_9fa48("12040"), 'MOVE_REPLICA'),
  CREATE_SELF_HOSTED: stryMutAct_9fa48("12041") ? "" : (stryCov_9fa48("12041"), 'CREATE_SELF_HOSTED')
}));
const BOOTSTRAP_PHASE = Object.freeze(stryMutAct_9fa48("12042") ? {} : (stryCov_9fa48("12042"), {
  NOT_STARTED: stryMutAct_9fa48("12043") ? "" : (stryCov_9fa48("12043"), 'not_started'),
  INFRASTRUCTURE: stryMutAct_9fa48("12044") ? "" : (stryCov_9fa48("12044"), 'infrastructure'),
  MESSAGE_GROUPS: stryMutAct_9fa48("12045") ? "" : (stryCov_9fa48("12045"), 'message_groups'),
  PARTITIONS: stryMutAct_9fa48("12046") ? "" : (stryCov_9fa48("12046"), 'partitions'),
  REGISTRATION: stryMutAct_9fa48("12047") ? "" : (stryCov_9fa48("12047"), 'registration'),
  CACHE_HYDRATION: stryMutAct_9fa48("12048") ? "" : (stryCov_9fa48("12048"), 'cache_hydration'),
  COMPLETE: stryMutAct_9fa48("12049") ? "" : (stryCov_9fa48("12049"), 'complete'),
  FAILED: stryMutAct_9fa48("12050") ? "" : (stryCov_9fa48("12050"), 'failed')
}));

/**
 * Shared cleanup result constants for seed and join cleanup paths.
 * Both SeedCleanupHandler and JoinCleanupHandler use these values
 * so diagnostics shape is consistent (D3.3, Requirement 2.4).
 */
const CLEANUP_RESULT = Object.freeze(stryMutAct_9fa48("12051") ? {} : (stryCov_9fa48("12051"), {
  SUCCESS: stryMutAct_9fa48("12052") ? "" : (stryCov_9fa48("12052"), 'success'),
  ERROR: stryMutAct_9fa48("12053") ? "" : (stryCov_9fa48("12053"), 'error'),
  SKIPPED: stryMutAct_9fa48("12054") ? "" : (stryCov_9fa48("12054"), 'skipped')
}));

/**
 * Cleanup steps for failed bootstrap, executed in reverse phase order.
 * Each step corresponds to undoing the work of a bootstrap phase.
 */
const BOOTSTRAP_CLEANUP_STEP = Object.freeze(stryMutAct_9fa48("12055") ? {} : (stryCov_9fa48("12055"), {
  CACHE_HYDRATION: stryMutAct_9fa48("12056") ? "" : (stryCov_9fa48("12056"), 'cache_hydration'),
  REGISTRATION: stryMutAct_9fa48("12057") ? "" : (stryCov_9fa48("12057"), 'registration'),
  PARTITIONS: stryMutAct_9fa48("12058") ? "" : (stryCov_9fa48("12058"), 'partitions'),
  MESSAGE_GROUPS: stryMutAct_9fa48("12059") ? "" : (stryCov_9fa48("12059"), 'message_groups'),
  INFRASTRUCTURE: stryMutAct_9fa48("12060") ? "" : (stryCov_9fa48("12060"), 'infrastructure')
}));
const BOOTSTRAP_PIPELINE_PHASE = Object.freeze(stryMutAct_9fa48("12061") ? {} : (stryCov_9fa48("12061"), {
  INFRA: stryMutAct_9fa48("12062") ? "" : (stryCov_9fa48("12062"), 'infra'),
  RAFT_ELECTION: stryMutAct_9fa48("12063") ? "" : (stryCov_9fa48("12063"), 'raft_election'),
  SYSTEM_TABLE_SEED: stryMutAct_9fa48("12064") ? "" : (stryCov_9fa48("12064"), 'system_table_seed'),
  CACHE_HYDRATION: stryMutAct_9fa48("12065") ? "" : (stryCov_9fa48("12065"), 'cache_hydration'),
  CDC_SUBSCRIBE: stryMutAct_9fa48("12066") ? "" : (stryCov_9fa48("12066"), 'cdc_subscribe'),
  CONTROL_PLANE_REGISTER: stryMutAct_9fa48("12067") ? "" : (stryCov_9fa48("12067"), 'control_plane_register'),
  READY: stryMutAct_9fa48("12068") ? "" : (stryCov_9fa48("12068"), 'ready'),
  FAILED: stryMutAct_9fa48("12069") ? "" : (stryCov_9fa48("12069"), 'failed')
}));
const BOOTSTRAP_PIPELINE_ERROR_CODE = Object.freeze(stryMutAct_9fa48("12070") ? {} : (stryCov_9fa48("12070"), {
  BOOTSTRAP_NOT_READY: stryMutAct_9fa48("12071") ? "" : (stryCov_9fa48("12071"), 'BOOTSTRAP_NOT_READY'),
  LEADER_METADATA_INCOMPLETE: stryMutAct_9fa48("12072") ? "" : (stryCov_9fa48("12072"), 'LEADER_METADATA_INCOMPLETE'),
  SQL_ENGINE_UNAVAILABLE: stryMutAct_9fa48("12073") ? "" : (stryCov_9fa48("12073"), 'SQL_ENGINE_UNAVAILABLE'),
  SERVICE_REGISTRATION_CACHE_VISIBILITY_TIMEOUT: stryMutAct_9fa48("12074") ? "" : (stryCov_9fa48("12074"), 'SERVICE_REGISTRATION_CACHE_VISIBILITY_TIMEOUT')
}));
const BOOTSTRAP_PIPELINE_TIMEOUT_MS = Object.freeze(stryMutAct_9fa48("12075") ? {} : (stryCov_9fa48("12075"), {
  INFRA: 5000,
  RAFT_ELECTION: 30000,
  SYSTEM_TABLE_SEED: 10000,
  CACHE_HYDRATION: 10000,
  CDC_SUBSCRIBE: 5000,
  CONTROL_PLANE_REGISTER: 10000
}));
const JOINING_PHASE = Object.freeze(stryMutAct_9fa48("12076") ? {} : (stryCov_9fa48("12076"), {
  NOT_STARTED: stryMutAct_9fa48("12077") ? "" : (stryCov_9fa48("12077"), 'not_started'),
  CONTACTING_SEED: stryMutAct_9fa48("12078") ? "" : (stryCov_9fa48("12078"), 'contacting_seed'),
  CONNECTING_WEBSOCKET: stryMutAct_9fa48("12079") ? "" : (stryCov_9fa48("12079"), 'connecting_websocket'),
  CREATING_MESSAGE_GROUP: stryMutAct_9fa48("12080") ? "" : (stryCov_9fa48("12080"), 'creating_message_group'),
  JOINING_MESSAGE_GROUP: stryMutAct_9fa48("12081") ? "" : (stryCov_9fa48("12081"), 'joining_message_group'),
  WAITING_LEADERSHIP: stryMutAct_9fa48("12082") ? "" : (stryCov_9fa48("12082"), 'waiting_leadership'),
  QUERYING_STATE: stryMutAct_9fa48("12083") ? "" : (stryCov_9fa48("12083"), 'querying_state'),
  COMPLETE: stryMutAct_9fa48("12084") ? "" : (stryCov_9fa48("12084"), 'complete'),
  FAILED: stryMutAct_9fa48("12085") ? "" : (stryCov_9fa48("12085"), 'failed')
}));

/**
 * Declarative mapping from JOINING_PHASE to JOINING_SUB_PHASE
 * for NodeLifecycleStateMachine sub-phase transitions during join.
 * Mirrors bootstrap's PHASE_TO_SUB_PHASE pattern (D5.1, Req 4.1, 4.4).
 */
const JOINING_PHASE_TO_SUB_PHASE = Object.freeze(stryMutAct_9fa48("12086") ? {} : (stryCov_9fa48("12086"), {
  [JOINING_PHASE.CONTACTING_SEED]: JOINING_SUB_PHASE.CONTACTING_SEED,
  [JOINING_PHASE.CONNECTING_WEBSOCKET]: JOINING_SUB_PHASE.CONNECTING_WEBSOCKET,
  [JOINING_PHASE.CREATING_MESSAGE_GROUP]: JOINING_SUB_PHASE.CREATING_MESSAGE_GROUP,
  [JOINING_PHASE.JOINING_MESSAGE_GROUP]: JOINING_SUB_PHASE.JOINING_MESSAGE_GROUP,
  [JOINING_PHASE.WAITING_LEADERSHIP]: JOINING_SUB_PHASE.WAITING_LEADERSHIP,
  [JOINING_PHASE.QUERYING_STATE]: JOINING_SUB_PHASE.QUERYING_STATE
}));
const BOOTSTRAP_SUBSYSTEM = Object.freeze(stryMutAct_9fa48("12087") ? {} : (stryCov_9fa48("12087"), {
  SERVICE: stryMutAct_9fa48("12088") ? "" : (stryCov_9fa48("12088"), 'bootstrap'),
  API: stryMutAct_9fa48("12089") ? "" : (stryCov_9fa48("12089"), 'bootstrap-api'),
  TRACKER: stryMutAct_9fa48("12090") ? "" : (stryCov_9fa48("12090"), 'bootstrap-tracker'),
  NODE_JOINING: stryMutAct_9fa48("12091") ? "" : (stryCov_9fa48("12091"), 'node-joining')
}));
const BOOTSTRAP_LOG_PREFIX = Object.freeze(stryMutAct_9fa48("12092") ? {} : (stryCov_9fa48("12092"), {
  JOIN_DEBUG: stryMutAct_9fa48("12093") ? "" : (stryCov_9fa48("12093"), '[JOIN-DEBUG]')
}));
const BOOTSTRAP_READY_MESSAGE = Object.freeze(stryMutAct_9fa48("12094") ? {} : (stryCov_9fa48("12094"), {
  TYPE: stryMutAct_9fa48("12095") ? "" : (stryCov_9fa48("12095"), 'NODE_READY'),
  PATH: stryMutAct_9fa48("12096") ? "" : (stryCov_9fa48("12096"), 'ready')
}));
const BOOTSTRAP_REBALANCE_REASON = Object.freeze(stryMutAct_9fa48("12097") ? {} : (stryCov_9fa48("12097"), {
  NODE_READY: stryMutAct_9fa48("12098") ? "" : (stryCov_9fa48("12098"), 'node_ready')
}));
const BOOTSTRAP_NODE_READY_REBALANCE_TABLES = Object.freeze(stryMutAct_9fa48("12099") ? [] : (stryCov_9fa48("12099"), [TABLES.NODES, TABLES.TABLES, TABLES.PARTITIONS, TABLES.SERVICES, TABLES.MESSAGE_GROUPS, TABLES.CONTROL_PLANE_PUBLICATIONS, TABLES.REPLICA_OPERATIONS, TABLES.NODE_ENDPOINTS, TABLES.SERVICE_DEFINITIONS, TABLES.SERVICE_ENDPOINTS, TABLES.CONFIG]));

// Delay before triggering rebalancing after a node becomes ready.
// Keep this short so cluster-growth runs surface placement changes in-time.
const BOOTSTRAP_REBALANCE_DELAY_MS = 5000;
const BOOTSTRAP_MESSAGE_GROUP = Object.freeze(stryMutAct_9fa48("12100") ? {} : (stryCov_9fa48("12100"), {
  NAME: stryMutAct_9fa48("12101") ? "" : (stryCov_9fa48("12101"), 'message_group_seed'),
  REPLICA_COUNT: 3,
  POLICY: Object.freeze(stryMutAct_9fa48("12102") ? {} : (stryCov_9fa48("12102"), {
    TARGET_REPLICA_COUNT: 3,
    MAX_REPLICA_COUNT: 5,
    ENSURE_LOCAL_ACCESS: stryMutAct_9fa48("12103") ? false : (stryCov_9fa48("12103"), true)
  }))
}));
const BOOTSTRAP_REPLICA_REGISTRATION_REASON = Object.freeze(stryMutAct_9fa48("12104") ? {} : (stryCov_9fa48("12104"), {
  BOOTSTRAP_REGISTRATION: stryMutAct_9fa48("12105") ? "" : (stryCov_9fa48("12105"), 'bootstrap_registration')
}));
const BOOTSTRAP_EPOCH = Object.freeze(stryMutAct_9fa48("12106") ? {} : (stryCov_9fa48("12106"), {
  CONFIG_DESCRIPTION: stryMutAct_9fa48("12107") ? "" : (stryCov_9fa48("12107"), 'Authoritative cluster assignment epoch')
}));
const BOOTSTRAP_REPLICA_PROGRESS = Object.freeze(stryMutAct_9fa48("12108") ? {} : (stryCov_9fa48("12108"), {
  PREFIX: stryMutAct_9fa48("12109") ? "" : (stryCov_9fa48("12109"), '[replica-create]'),
  TYPE_PARTITION: stryMutAct_9fa48("12110") ? "" : (stryCov_9fa48("12110"), 'partition'),
  SPINNER_IDLE: stryMutAct_9fa48("12111") ? "" : (stryCov_9fa48("12111"), '|')
}));
const BOOTSTRAP_UNIFIED_RECONCILE = Object.freeze(stryMutAct_9fa48("12112") ? {} : (stryCov_9fa48("12112"), {
  INFRA_READY_REASON: stryMutAct_9fa48("12113") ? "" : (stryCov_9fa48("12113"), 'bootstrap_infrastructure_ready'),
  MESSAGE_GROUPS_REASON: stryMutAct_9fa48("12114") ? "" : (stryCov_9fa48("12114"), 'bootstrap_message_groups'),
  PARTITIONS_REASON: stryMutAct_9fa48("12115") ? "" : (stryCov_9fa48("12115"), 'bootstrap_partitions'),
  CHECK_INTERVAL_MS: stryMutAct_9fa48("12116") ? TIME_MS.MINUTE / (NUM.THIRTY * NUM.TWO) : (stryCov_9fa48("12116"), TIME_MS.MINUTE * (stryMutAct_9fa48("12117") ? NUM.THIRTY / NUM.TWO : (stryCov_9fa48("12117"), NUM.THIRTY * NUM.TWO))),
  RUNTIME_KIND: RUNTIME_KIND.NATIVE_JS
}));
const BOOTSTRAP_REPLICA_REGISTRATION_TRACE = Object.freeze(stryMutAct_9fa48("12118") ? {} : (stryCov_9fa48("12118"), {
  PREFIX: stryMutAct_9fa48("12119") ? "" : (stryCov_9fa48("12119"), '[bootstrap replica registration]'),
  SCOPE_PARTITION: stryMutAct_9fa48("12120") ? "" : (stryCov_9fa48("12120"), 'partition'),
  SCOPE_STATE: stryMutAct_9fa48("12121") ? "" : (stryCov_9fa48("12121"), 'state'),
  EVENT_START: stryMutAct_9fa48("12122") ? "" : (stryCov_9fa48("12122"), 'start'),
  EVENT_CALL_BEGIN: stryMutAct_9fa48("12123") ? "" : (stryCov_9fa48("12123"), 'call_begin'),
  EVENT_CALL_END: stryMutAct_9fa48("12124") ? "" : (stryCov_9fa48("12124"), 'call_end'),
  EVENT_ATTEMPT: stryMutAct_9fa48("12125") ? "" : (stryCov_9fa48("12125"), 'attempt'),
  EVENT_TRANSITION_BEGIN: stryMutAct_9fa48("12126") ? "" : (stryCov_9fa48("12126"), 'transition_begin'),
  EVENT_TRANSITION_END: stryMutAct_9fa48("12127") ? "" : (stryCov_9fa48("12127"), 'transition_end'),
  EVENT_SUCCESS: stryMutAct_9fa48("12128") ? "" : (stryCov_9fa48("12128"), 'success'),
  EVENT_ERROR: stryMutAct_9fa48("12129") ? "" : (stryCov_9fa48("12129"), 'error'),
  EVENT_COMPLETE: stryMutAct_9fa48("12130") ? "" : (stryCov_9fa48("12130"), 'complete'),
  EVENT_SKIP_MISSING_PARTITION: stryMutAct_9fa48("12131") ? "" : (stryCov_9fa48("12131"), 'skip_missing_partition')
}));

/**
 * Concern-scoped delegate bundle names for seed bootstrap.
 * Each bundle groups delegates by concern so phase/readiness/cleanup
 * owners receive only the dependencies they need (D2.2).
 */
const SEED_DELEGATE_BUNDLE = Object.freeze(stryMutAct_9fa48("12132") ? {} : (stryCov_9fa48("12132"), {
  PHASE_EXECUTION: stryMutAct_9fa48("12133") ? "" : (stryCov_9fa48("12133"), 'phaseExecution'),
  READINESS: stryMutAct_9fa48("12134") ? "" : (stryCov_9fa48("12134"), 'readiness'),
  CLEANUP: stryMutAct_9fa48("12135") ? "" : (stryCov_9fa48("12135"), 'cleanup'),
  RUNTIME_WIRING: stryMutAct_9fa48("12136") ? "" : (stryCov_9fa48("12136"), 'runtimeWiring')
}));

/**
 * Concern-scoped delegate bundle names for join bootstrap.
 * Mirrors SEED_DELEGATE_BUNDLE so join phase/readiness/cleanup
 * owners receive only the dependencies they need (D2.2).
 */
const JOIN_DELEGATE_BUNDLE = Object.freeze(stryMutAct_9fa48("12137") ? {} : (stryCov_9fa48("12137"), {
  PHASE_EXECUTION: stryMutAct_9fa48("12138") ? "" : (stryCov_9fa48("12138"), 'phaseExecution'),
  READINESS: stryMutAct_9fa48("12139") ? "" : (stryCov_9fa48("12139"), 'readiness'),
  CLEANUP: stryMutAct_9fa48("12140") ? "" : (stryCov_9fa48("12140"), 'cleanup'),
  RUNTIME_WIRING: stryMutAct_9fa48("12141") ? "" : (stryCov_9fa48("12141"), 'runtimeWiring')
}));

/**
 * Named segment keys for the join startup plan (D4.1, Req 3.1).
 * Each key identifies a checkpoint boundary group of phases.
 */
const JOIN_PLAN_SEGMENT = Object.freeze(stryMutAct_9fa48("12142") ? {} : (stryCov_9fa48("12142"), {
  SEED_CONTACT: stryMutAct_9fa48("12143") ? "" : (stryCov_9fa48("12143"), 'seedContact'),
  INFRASTRUCTURE: stryMutAct_9fa48("12144") ? "" : (stryCov_9fa48("12144"), 'infrastructure'),
  MEMBERSHIP: stryMutAct_9fa48("12145") ? "" : (stryCov_9fa48("12145"), 'membership'),
  READINESS: stryMutAct_9fa48("12146") ? "" : (stryCov_9fa48("12146"), 'readiness')
}));
const BOOTSTRAP_PARTITION_LEADERSHIP_DEFAULT = Object.freeze(stryMutAct_9fa48("12147") ? {} : (stryCov_9fa48("12147"), {
  TIMEOUT_CAP_MS: 5000,
  INITIAL_DELAY_MS: 10,
  MAX_DELAY_MS: 100,
  BACKOFF_MULTIPLIER: 1.5
}));
const BOOTSTRAP_EVENT = Object.freeze(stryMutAct_9fa48("12148") ? {} : (stryCov_9fa48("12148"), {
  COMPLETE: stryMutAct_9fa48("12149") ? "" : (stryCov_9fa48("12149"), 'complete'),
  FAILED: stryMutAct_9fa48("12150") ? "" : (stryCov_9fa48("12150"), 'failed'),
  PHASE_START: stryMutAct_9fa48("12151") ? "" : (stryCov_9fa48("12151"), 'phaseStart'),
  PHASE_COMPLETE: stryMutAct_9fa48("12152") ? "" : (stryCov_9fa48("12152"), 'phaseComplete'),
  PHASE_FAILED: stryMutAct_9fa48("12153") ? "" : (stryCov_9fa48("12153"), 'phaseFailed'),
  SHUTDOWN: stryMutAct_9fa48("12154") ? "" : (stryCov_9fa48("12154"), 'shutdown')
}));
const BOOTSTRAP_LOG_MSG = Object.freeze(stryMutAct_9fa48("12155") ? {} : (stryCov_9fa48("12155"), {
  STARTING: stryMutAct_9fa48("12156") ? "" : (stryCov_9fa48("12156"), 'Starting bootstrap process'),
  COMPLETED: stryMutAct_9fa48("12157") ? "" : (stryCov_9fa48("12157"), 'Bootstrap completed successfully'),
  PHASE_STARTING: stryMutAct_9fa48("12158") ? "" : (stryCov_9fa48("12158"), 'Starting bootstrap phase'),
  PHASE_COMPLETED: stryMutAct_9fa48("12159") ? "" : (stryCov_9fa48("12159"), 'Bootstrap phase completed'),
  PHASE_FAILED: stryMutAct_9fa48("12160") ? "" : (stryCov_9fa48("12160"), 'Bootstrap phase failed'),
  WS_SELF_CONNECTED: stryMutAct_9fa48("12161") ? "" : (stryCov_9fa48("12161"), 'WebSocket server started and self-connection established'),
  ROUTER_INIT_FAILED: stryMutAct_9fa48("12162") ? "" : (stryCov_9fa48("12162"), 'MessageRouter initialization failed'),
  INFRA_READY: stryMutAct_9fa48("12163") ? "" : (stryCov_9fa48("12163"), 'Infrastructure setup complete'),
  RUNTIME_WIRING_READY: stryMutAct_9fa48("12164") ? "" : (stryCov_9fa48("12164"), 'Runtime startup wiring initialized'),
  CREATING_MESSAGE_GROUP: stryMutAct_9fa48("12165") ? "" : (stryCov_9fa48("12165"), 'Creating initial message group'),
  MESSAGE_GROUP_REPLICA_CREATED: stryMutAct_9fa48("12166") ? "" : (stryCov_9fa48("12166"), 'Message group replica created'),
  MESSAGE_GROUPS_CREATED_DEFERRED: stryMutAct_9fa48("12167") ? "" : (stryCov_9fa48("12167"), 'Message group replicas created, elections deferred'),
  WAITING_MESSAGE_GROUP_LEADER: stryMutAct_9fa48("12168") ? "" : (stryCov_9fa48("12168"), 'Waiting for message group leadership'),
  MESSAGE_GROUP_LEADER_IMMEDIATE: stryMutAct_9fa48("12169") ? "" : (stryCov_9fa48("12169"), 'Message group leader found immediately'),
  MESSAGE_GROUP_LEADER_FOUND: stryMutAct_9fa48("12170") ? "" : (stryCov_9fa48("12170"), 'Message group leader found'),
  WAITING_PARTITION_LEADERS: stryMutAct_9fa48("12171") ? "" : (stryCov_9fa48("12171"), 'Waiting for partition leadership'),
  PARTITION_LEADERS_IMMEDIATE: stryMutAct_9fa48("12172") ? "" : (stryCov_9fa48("12172"), 'All partition leaders found immediately'),
  PARTITION_LEADERS_FOUND: stryMutAct_9fa48("12173") ? "" : (stryCov_9fa48("12173"), 'All partition leaders found'),
  PARTITION_LEADERS_PENDING: stryMutAct_9fa48("12174") ? "" : (stryCov_9fa48("12174"), 'Some partitions still electing leaders, failing bootstrap'),
  CREATING_SYSTEM_PARTITION: stryMutAct_9fa48("12175") ? "" : (stryCov_9fa48("12175"), 'Creating system table partition'),
  PARTITION_REPLICA_CREATED: stryMutAct_9fa48("12176") ? "" : (stryCov_9fa48("12176"), 'Partition replica created'),
  PARTITION_CREATION_BATCH_STARTING: stryMutAct_9fa48("12177") ? "" : (stryCov_9fa48("12177"), 'Starting first system table partition creation batch'),
  STARTING_MG_ELECTIONS: stryMutAct_9fa48("12178") ? "" : (stryCov_9fa48("12178"), 'Starting elections for message group replicas'),
  MESSAGE_GROUP_LEADERSHIP_READY: stryMutAct_9fa48("12179") ? "" : (stryCov_9fa48("12179"), 'Message group leadership established'),
  STARTING_PARTITION_ELECTIONS: stryMutAct_9fa48("12180") ? "" : (stryCov_9fa48("12180"), 'Starting elections for all partition replicas'),
  PARTITIONS_CREATED: stryMutAct_9fa48("12181") ? "" : (stryCov_9fa48("12181"), 'All system table partitions created'),
  EPOCH_MANAGER_READY: stryMutAct_9fa48("12182") ? "" : (stryCov_9fa48("12182"), 'AssignmentEpochManager initialized'),
  CDC_SUBSCRIPTION_START: stryMutAct_9fa48("12183") ? "" : (stryCov_9fa48("12183"), 'Setting up CDC subscription'),
  CDC_PARTITION_MISSING: stryMutAct_9fa48("12184") ? "" : (stryCov_9fa48("12184"), 'Partition not found for CDC subscription'),
  CDC_EVENT_RECEIVED: stryMutAct_9fa48("12185") ? "" : (stryCov_9fa48("12185"), 'CDC event received by bootstrap handler'),
  CDC_SUBSCRIPTION_REGISTERED: stryMutAct_9fa48("12186") ? "" : (stryCov_9fa48("12186"), 'CDC subscription registered on replica'),
  REBALANCE_TRIGGER: stryMutAct_9fa48("12187") ? "" : (stryCov_9fa48("12187"), 'Triggering rebalancing on all partitions'),
  BOOTSTRAP_MODE_ENABLED: stryMutAct_9fa48("12188") ? "" : (stryCov_9fa48("12188"), 'Bootstrap mode enabled for direct partition writes'),
  BOOTSTRAP_MODE_DISABLED: stryMutAct_9fa48("12189") ? "" : (stryCov_9fa48("12189"), 'Bootstrap mode disabled, routing through SQL engine'),
  SERVICE_REGISTRATION_COMPLETE: stryMutAct_9fa48("12190") ? "" : (stryCov_9fa48("12190"), 'Service registration complete'),
  SERVICE_DEFINITIONS_SCHEMA_MIGRATING: stryMutAct_9fa48("12191") ? "" : (stryCov_9fa48("12191"), 'Migrating service_definitions schema to canonical contract'),
  SERVICE_DEFINITIONS_SCHEMA_MIGRATED: stryMutAct_9fa48("12192") ? "" : (stryCov_9fa48("12192"), 'service_definitions schema migrated to canonical contract'),
  CDC_MG_UNAVAILABLE: stryMutAct_9fa48("12193") ? "" : (stryCov_9fa48("12193"), 'CDC integration service not available for message group registration'),
  MESSAGE_GROUP_REGISTERED: stryMutAct_9fa48("12194") ? "" : (stryCov_9fa48("12194"), 'Message group registered'),
  MESSAGE_GROUP_REGISTER_FAILED: stryMutAct_9fa48("12195") ? "" : (stryCov_9fa48("12195"), 'Failed to register message group'),
  CDC_SERVICE_UNAVAILABLE: stryMutAct_9fa48("12196") ? "" : (stryCov_9fa48("12196"), 'CDC integration service not available for service registration'),
  MESSAGE_GROUP_SERVICE_REGISTER_FAILED: stryMutAct_9fa48("12197") ? "" : (stryCov_9fa48("12197"), 'Failed to register message group service'),
  PARTITION_SERVICE_REGISTER_FAILED: stryMutAct_9fa48("12198") ? "" : (stryCov_9fa48("12198"), 'Failed to register partition service'),
  SERVICES_REGISTERED: stryMutAct_9fa48("12199") ? "" : (stryCov_9fa48("12199"), 'Services registered'),
  CDC_TABLE_UNAVAILABLE: stryMutAct_9fa48("12200") ? "" : (stryCov_9fa48("12200"), 'CDC integration service not available for table registration'),
  TABLE_REGISTER_FAILED: stryMutAct_9fa48("12201") ? "" : (stryCov_9fa48("12201"), 'Failed to register table'),
  PARTITION_REGISTER_FAILED: stryMutAct_9fa48("12202") ? "" : (stryCov_9fa48("12202"), 'Failed to register partition'),
  SYSTEM_TABLES_REGISTERED: stryMutAct_9fa48("12203") ? "" : (stryCov_9fa48("12203"), 'System tables registered'),
  CDC_SIZE_UNAVAILABLE: stryMutAct_9fa48("12204") ? "" : (stryCov_9fa48("12204"), 'CDC integration service not available for size update'),
  PARTITION_SIZE_UPDATED: stryMutAct_9fa48("12205") ? "" : (stryCov_9fa48("12205"), 'Updated partition size'),
  PARTITION_SIZE_UPDATE_FAILED: stryMutAct_9fa48("12206") ? "" : (stryCov_9fa48("12206"), 'Failed to update partition size'),
  PARTITION_SIZES_UPDATED: stryMutAct_9fa48("12207") ? "" : (stryCov_9fa48("12207"), 'Partition sizes updated'),
  CONFIG_LEADER_MISSING: stryMutAct_9fa48("12208") ? "" : (stryCov_9fa48("12208"), 'Config partition leader not available for seeding'),
  CONFIG_ALREADY_SEEDED: stryMutAct_9fa48("12209") ? "" : (stryCov_9fa48("12209"), 'Config already seeded, skipping'),
  CONFIG_CHECK_FAILED: stryMutAct_9fa48("12210") ? "" : (stryCov_9fa48("12210"), 'Could not check existing config, proceeding with seeding'),
  CONFIG_SEEDED: stryMutAct_9fa48("12211") ? "" : (stryCov_9fa48("12211"), 'Dynamic configuration seeded'),
  CONFIG_SEED_FAILED: stryMutAct_9fa48("12212") ? "" : (stryCov_9fa48("12212"), 'Failed to seed dynamic configuration'),
  CACHE_UNAVAILABLE: stryMutAct_9fa48("12213") ? "" : (stryCov_9fa48("12213"), 'No system table cache available for hydration'),
  CDC_HYDRATION_MISSING: stryMutAct_9fa48("12214") ? "" : (stryCov_9fa48("12214"), 'No message group available for CDC hydration'),
  CACHE_HYDRATION_STARTING: stryMutAct_9fa48("12215") ? "" : (stryCov_9fa48("12215"), 'Starting cache hydration from local partitions'),
  CACHE_HYDRATION_READING: stryMutAct_9fa48("12216") ? "" : (stryCov_9fa48("12216"), 'Reading system table data from local partitions'),
  TABLE_HYDRATED: stryMutAct_9fa48("12217") ? "" : (stryCov_9fa48("12217"), 'System table hydrated from local partition'),
  TABLE_HYDRATION_FAILED: stryMutAct_9fa48("12218") ? "" : (stryCov_9fa48("12218"), 'Failed to hydrate system table from local partition'),
  CACHE_HYDRATION_COMPLETE: stryMutAct_9fa48("12219") ? "" : (stryCov_9fa48("12219"), 'Cache hydration complete'),
  CACHE_HYDRATION_INCOMPLETE: stryMutAct_9fa48("12220") ? "" : (stryCov_9fa48("12220"), 'Cache hydration incomplete - some tables missing or empty'),
  CACHE_HYDRATION_VERIFIED: stryMutAct_9fa48("12221") ? "" : (stryCov_9fa48("12221"), 'Cache hydration verified - all expected tables populated'),
  CDC_DYNAMIC_PARTITION_EVENT: stryMutAct_9fa48("12222") ? "" : (stryCov_9fa48("12222"), 'CDC event received from dynamically created partition'),
  CDC_DYNAMIC_SUBSCRIPTION: stryMutAct_9fa48("12223") ? "" : (stryCov_9fa48("12223"), 'CDC subscription set up for dynamically created partition'),
  REPLICA_HANDLER_READY: stryMutAct_9fa48("12224") ? "" : (stryCov_9fa48("12224"), 'ReplicaHandler initialized'),
  REPLICA_HANDLER_MISSING: stryMutAct_9fa48("12225") ? "" : (stryCov_9fa48("12225"), 'No replica handler provided for partition registration'),
  REPLICA_HANDLER_REGISTER_FAILED: stryMutAct_9fa48("12226") ? "" : (stryCov_9fa48("12226"), 'Failed to register partition with replica handler'),
  REPLICA_HANDLER_REGISTERED: stryMutAct_9fa48("12227") ? "" : (stryCov_9fa48("12227"), 'Registered partitions with replica handler'),
  CONTROL_PLANE_READY: stryMutAct_9fa48("12228") ? "" : (stryCov_9fa48("12228"), 'Control plane service initialized'),
  CONTROL_PLANE_BACKGROUND_WRITERS_ACTIVE: stryMutAct_9fa48("12229") ? "" : (stryCov_9fa48("12229"), 'Control plane background writers activated'),
  LATENCY_TOPOLOGY_READY: stryMutAct_9fa48("12230") ? "" : (stryCov_9fa48("12230"), 'Latency topology services initialized'),
  LATENCY_TOPOLOGY_STARTED: stryMutAct_9fa48("12231") ? "" : (stryCov_9fa48("12231"), 'Latency topology lifecycle started'),
  CONTROL_PLANE_REGISTER_FAILED: stryMutAct_9fa48("12232") ? "" : (stryCov_9fa48("12232"), 'Failed to register seed node via control plane'),
  STATE_MACHINE_MISSING: stryMutAct_9fa48("12233") ? "" : (stryCov_9fa48("12233"), 'No state machine provided for replica registration'),
  STATE_MACHINE_REGISTER_FAILED: stryMutAct_9fa48("12234") ? "" : (stryCov_9fa48("12234"), 'Failed to register replica with state machine'),
  STATE_MACHINE_REGISTERED: stryMutAct_9fa48("12235") ? "" : (stryCov_9fa48("12235"), 'Registered replicas with state machine'),
  BOOTSTRAP_FAILED: stryMutAct_9fa48("12236") ? "" : (stryCov_9fa48("12236"), 'Bootstrap failed'),
  CLEANUP_START: stryMutAct_9fa48("12237") ? "" : (stryCov_9fa48("12237"), 'Cleaning up partially initialized services'),
  PARTITION_CLEANED: stryMutAct_9fa48("12238") ? "" : (stryCov_9fa48("12238"), 'Partition service cleaned up'),
  PARTITION_CLEANUP_FAILED: stryMutAct_9fa48("12239") ? "" : (stryCov_9fa48("12239"), 'Error cleaning up partition service'),
  MESSAGE_GROUP_CLEANED: stryMutAct_9fa48("12240") ? "" : (stryCov_9fa48("12240"), 'Message group service cleaned up'),
  MESSAGE_GROUP_CLEANUP_FAILED: stryMutAct_9fa48("12241") ? "" : (stryCov_9fa48("12241"), 'Error cleaning up message group service'),
  CLEANUP_COMPLETE: stryMutAct_9fa48("12242") ? "" : (stryCov_9fa48("12242"), 'Cleanup complete'),
  WS_PORT_MISSING: stryMutAct_9fa48("12243") ? "" : (stryCov_9fa48("12243"), 'No WebSocket port configured, skipping server start'),
  WS_ALREADY_RUNNING: stryMutAct_9fa48("12244") ? "" : (stryCov_9fa48("12244"), 'WebSocket server already running'),
  WS_SERVER_STARTED: stryMutAct_9fa48("12245") ? "" : (stryCov_9fa48("12245"), 'WebSocket server started for cross-node communication'),
  SHUTDOWN: stryMutAct_9fa48("12246") ? "" : (stryCov_9fa48("12246"), 'Shutting down bootstrap service'),
  BOOTSTRAP_EXIT_FAILED: stryMutAct_9fa48("12247") ? "" : (stryCov_9fa48("12247"), 'Bootstrap failed, exiting with non-zero exit code'),
  FAILED_BOOTSTRAP_CLEANUP_START: stryMutAct_9fa48("12248") ? "" : (stryCov_9fa48("12248"), 'Starting failed bootstrap cleanup in reverse phase order'),
  FAILED_BOOTSTRAP_CLEANUP_CACHE: stryMutAct_9fa48("12249") ? "" : (stryCov_9fa48("12249"), 'Clearing system table cache during failed bootstrap cleanup'),
  FAILED_BOOTSTRAP_CLEANUP_CACHE_DONE: stryMutAct_9fa48("12250") ? "" : (stryCov_9fa48("12250"), 'System table cache cleared during failed bootstrap cleanup'),
  FAILED_BOOTSTRAP_CLEANUP_CACHE_ERROR: stryMutAct_9fa48("12251") ? "" : (stryCov_9fa48("12251"), 'Error clearing system table cache during failed bootstrap cleanup'),
  FAILED_BOOTSTRAP_CLEANUP_REGISTRATION: stryMutAct_9fa48("12252") ? "" : (stryCov_9fa48("12252"), 'Removing partial registration entries during failed bootstrap cleanup'),
  FAILED_BOOTSTRAP_CLEANUP_REGISTRATION_DONE: stryMutAct_9fa48("12253") ? "" : (stryCov_9fa48("12253"), 'Partial registration entries removed during failed bootstrap cleanup'),
  FAILED_BOOTSTRAP_CLEANUP_REGISTRATION_ERROR: stryMutAct_9fa48("12254") ? "" : (stryCov_9fa48("12254"), 'Error removing registration entries during failed bootstrap cleanup'),
  FAILED_BOOTSTRAP_CLEANUP_PARTITIONS: stryMutAct_9fa48("12255") ? "" : (stryCov_9fa48("12255"), 'Stopping partition services during failed bootstrap cleanup'),
  FAILED_BOOTSTRAP_CLEANUP_PARTITIONS_DONE: stryMutAct_9fa48("12256") ? "" : (stryCov_9fa48("12256"), 'Partition services stopped during failed bootstrap cleanup'),
  FAILED_BOOTSTRAP_CLEANUP_PARTITIONS_ERROR: stryMutAct_9fa48("12257") ? "" : (stryCov_9fa48("12257"), 'Error stopping partition services during failed bootstrap cleanup'),
  FAILED_BOOTSTRAP_CLEANUP_MESSAGE_GROUPS: stryMutAct_9fa48("12258") ? "" : (stryCov_9fa48("12258"), 'Stopping message group services during failed bootstrap cleanup'),
  FAILED_BOOTSTRAP_CLEANUP_MESSAGE_GROUPS_DONE: stryMutAct_9fa48("12259") ? "" : (stryCov_9fa48("12259"), 'Message group services stopped during failed bootstrap cleanup'),
  FAILED_BOOTSTRAP_CLEANUP_MESSAGE_GROUPS_ERROR: stryMutAct_9fa48("12260") ? "" : (stryCov_9fa48("12260"), 'Error stopping message group services during failed bootstrap cleanup'),
  FAILED_BOOTSTRAP_CLEANUP_INFRASTRUCTURE: stryMutAct_9fa48("12261") ? "" : (stryCov_9fa48("12261"), 'Stopping message router during failed bootstrap cleanup'),
  FAILED_BOOTSTRAP_CLEANUP_INFRASTRUCTURE_DONE: stryMutAct_9fa48("12262") ? "" : (stryCov_9fa48("12262"), 'Message router stopped during failed bootstrap cleanup'),
  FAILED_BOOTSTRAP_CLEANUP_INFRASTRUCTURE_ERROR: stryMutAct_9fa48("12263") ? "" : (stryCov_9fa48("12263"), 'Error stopping message router during failed bootstrap cleanup'),
  FAILED_BOOTSTRAP_CLEANUP_COMPLETE: stryMutAct_9fa48("12264") ? "" : (stryCov_9fa48("12264"), 'Failed bootstrap cleanup complete'),
  FAILED_BOOTSTRAP_CLEANUP_SUMMARY: stryMutAct_9fa48("12265") ? "" : (stryCov_9fa48("12265"), 'Failed bootstrap cleanup summary'),
  REGISTERING_SERVICE: stryMutAct_9fa48("12266") ? "" : (stryCov_9fa48("12266"), 'Registering service')
}));
const BOOTSTRAP_ERROR = Object.freeze(stryMutAct_9fa48("12267") ? {} : (stryCov_9fa48("12267"), {
  routerInitFailed: stryMutAct_9fa48("12268") ? () => undefined : (stryCov_9fa48("12268"), message => stryMutAct_9fa48("12269") ? `` : (stryCov_9fa48("12269"), `MessageRouter initialization failed: ${message}`)),
  messageGroupLeadershipTimeout: stryMutAct_9fa48("12270") ? () => undefined : (stryCov_9fa48("12270"), (groupId, timeoutMs) => stryMutAct_9fa48("12271") ? `` : (stryCov_9fa48("12271"), `Message group ${groupId} failed to establish leadership within ${timeoutMs}ms`)),
  partitionLeadershipTimeout: stryMutAct_9fa48("12272") ? () => undefined : (stryCov_9fa48("12272"), (missingLeaders, timeoutMs) => stryMutAct_9fa48("12273") ? `` : (stryCov_9fa48("12273"), `Partition leaders not established within ${timeoutMs}ms: ${missingLeaders.join(stryMutAct_9fa48("12274") ? "" : (stryCov_9fa48("12274"), ', '))}`)),
  PARTITION_REPLICAS_MISSING: stryMutAct_9fa48("12275") ? "" : (stryCov_9fa48("12275"), 'Partition replica set not configured'),
  NODES_LEADER_MISSING: stryMutAct_9fa48("12276") ? "" : (stryCov_9fa48("12276"), 'Nodes partition leader not available'),
  ROUTER_NOT_READY: stryMutAct_9fa48("12277") ? "" : (stryCov_9fa48("12277"), 'MessageRouter not initialized - bootstrap must complete first'),
  CDC_REPLICA_HANDLER_MISSING: stryMutAct_9fa48("12278") ? "" : (stryCov_9fa48("12278"), 'CDC integration service not initialized for replica handler'),
  CDC_CONTROL_PLANE_MISSING: stryMutAct_9fa48("12279") ? "" : (stryCov_9fa48("12279"), 'CDC integration service not initialized for control plane'),
  CDC_HYDRATION_MISSING: stryMutAct_9fa48("12280") ? "" : (stryCov_9fa48("12280"), 'No message group available for CDC hydration'),
  LATENCY_TOPOLOGY_MISSING: stryMutAct_9fa48("12281") ? "" : (stryCov_9fa48("12281"), 'Latency topology services are not initialized'),
  SYSTEM_CACHE_MISSING: stryMutAct_9fa48("12282") ? "" : (stryCov_9fa48("12282"), 'System table cache not available'),
  seedReadyTimeout: stryMutAct_9fa48("12283") ? () => undefined : (stryCov_9fa48("12283"), (nodeId, timeoutMs) => stryMutAct_9fa48("12284") ? `` : (stryCov_9fa48("12284"), `Seed node ${nodeId} not ready in system cache within ${timeoutMs}ms`))
}));
const BOOTSTRAP_SQL = Object.freeze(stryMutAct_9fa48("12285") ? {} : (stryCov_9fa48("12285"), {
  CONFIG_COUNT: stryMutAct_9fa48("12286") ? "" : (stryCov_9fa48("12286"), 'SELECT COUNT(*) as count FROM config'),
  EPOCH_EXISTS: stryMutAct_9fa48("12287") ? "" : (stryCov_9fa48("12287"), 'SELECT config_key FROM config WHERE config_key = ?')
}));
const BOOTSTRAP_DEFAULT = Object.freeze(stryMutAct_9fa48("12288") ? {} : (stryCov_9fa48("12288"), {
  leadershipWaitTimeoutMs: 30000,
  leadershipWaitInitialDelayMs: 100,
  leadershipWaitMaxDelayMs: 5000,
  leadershipWaitBackoffMultiplier: 2,
  partitionDbPath: stryMutAct_9fa48("12289") ? "" : (stryCov_9fa48("12289"), ':memory:'),
  replicaStaggerDelayMs: DEFAULT_REPLICA_STAGGER_DELAY_MS,
  maxConcurrentServiceActions: DEFAULT_MAX_CONCURRENT_SERVICE_ACTIONS,
  replicaRegistrationTraceEnabled: DEFAULT_REPLICA_REGISTRATION_TRACE_ENABLED,
  nodeReadyRebalanceDelayMs: BOOTSTRAP_REBALANCE_DELAY_MS,
  wsPort: null
}));
export { BOOTSTRAP_ASSIGNMENT_STRATEGY, BOOTSTRAP_CLEANUP_STEP, CLEANUP_RESULT, BOOTSTRAP_DEFAULT, BOOTSTRAP_ERROR, BOOTSTRAP_EVENT, BOOTSTRAP_EPOCH, BOOTSTRAP_LOG_MSG, BOOTSTRAP_LOG_PREFIX, BOOTSTRAP_MESSAGE_GROUP, BOOTSTRAP_PIPELINE_ERROR_CODE, BOOTSTRAP_PIPELINE_PHASE, BOOTSTRAP_PIPELINE_TIMEOUT_MS, BOOTSTRAP_PHASE, BOOTSTRAP_NODE_READY_REBALANCE_TABLES, BOOTSTRAP_READY_MESSAGE, BOOTSTRAP_REBALANCE_DELAY_MS, BOOTSTRAP_REBALANCE_REASON, BOOTSTRAP_REPLICA_PROGRESS, BOOTSTRAP_REPLICA_REGISTRATION_REASON, BOOTSTRAP_REPLICA_REGISTRATION_TRACE, BOOTSTRAP_PARTITION_LEADERSHIP_DEFAULT, BOOTSTRAP_SQL, BOOTSTRAP_SUBSYSTEM, BOOTSTRAP_UNIFIED_RECONCILE, DEFAULT_MAX_CONCURRENT_SERVICE_ACTIONS, DEFAULT_REPLICA_STAGGER_DELAY_MS, JOIN_DELEGATE_BUNDLE, JOIN_PLAN_SEGMENT, JOINING_PHASE, JOINING_PHASE_TO_SUB_PHASE, SEED_DELEGATE_BUNDLE };