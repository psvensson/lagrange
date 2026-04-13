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
import { CACHE_HYDRATION_TABLES } from '../cache/cache-constants.js';
import { DEFAULT_HEARTBEAT_INTERVAL_MS } from '../control-plane/control-plane-constants.js';
import { NUM, RUNTIME_KIND, TABLES, TIME_MS } from '../constants/index.js';
import { DEFAULT_REPLICA_STAGGER_DELAY_MS } from './bootstrap-constants.js';
const JOINING_DEFAULT = Object.freeze(stryMutAct_9fa48("16109") ? {} : (stryCov_9fa48("16109"), {
  httpTimeoutMs: 10000,
  leadershipWaitTimeoutMs: 30000,
  leadershipWaitInitialDelayMs: 100,
  leadershipWaitMaxDelayMs: 5000,
  leadershipWaitBackoffMultiplier: 2,
  leadershipWaitJitterRatio: 0.2,
  autoResumeRetryableFailures: stryMutAct_9fa48("16110") ? true : (stryCov_9fa48("16110"), false),
  retryableFailureResumeMaxAttempts: 4,
  retryableFailureResumeBaseDelayMs: 250,
  retryableFailureResumeMaxDelayMs: 5000,
  retryableFailureResumeMaxElapsedMs: stryMutAct_9fa48("16111") ? TIME_MS.MINUTE / 3 : (stryCov_9fa48("16111"), TIME_MS.MINUTE * 3),
  readySignalMaxAttempts: 6,
  readySignalRetryDelayMs: 1000,
  readySignalRetryMaxDelayMs: 5000,
  readySignalRetryBackoffMultiplier: 2,
  replicaStaggerDelayMs: DEFAULT_REPLICA_STAGGER_DELAY_MS,
  heartbeatIntervalMs: DEFAULT_HEARTBEAT_INTERVAL_MS,
  wsPort: null
}));
const JOINING_UNIFIED_RECONCILE = Object.freeze(stryMutAct_9fa48("16112") ? {} : (stryCov_9fa48("16112"), {
  INFRA_READY_REASON: stryMutAct_9fa48("16113") ? "" : (stryCov_9fa48("16113"), 'joining_infrastructure_ready'),
  MESSAGE_GROUPS_REASON: stryMutAct_9fa48("16114") ? "" : (stryCov_9fa48("16114"), 'joining_message_groups'),
  HYDRATION_REASON: stryMutAct_9fa48("16115") ? "" : (stryCov_9fa48("16115"), 'joining_hydration_handoff'),
  CHECK_INTERVAL_MS: stryMutAct_9fa48("16116") ? TIME_MS.MINUTE / (NUM.THIRTY * NUM.TWO) : (stryCov_9fa48("16116"), TIME_MS.MINUTE * (stryMutAct_9fa48("16117") ? NUM.THIRTY / NUM.TWO : (stryCov_9fa48("16117"), NUM.THIRTY * NUM.TWO))),
  RUNTIME_KIND: RUNTIME_KIND.NATIVE_JS
}));
const JOIN_READINESS_REASON = Object.freeze(stryMutAct_9fa48("16118") ? {} : (stryCov_9fa48("16118"), {
  ROUTING_NOT_READY: stryMutAct_9fa48("16119") ? "" : (stryCov_9fa48("16119"), 'routing_not_ready'),
  TOPOLOGY_NOT_READY: stryMutAct_9fa48("16120") ? "" : (stryCov_9fa48("16120"), 'topology_not_ready'),
  SCHEMA_VERSION_UNKNOWN: stryMutAct_9fa48("16121") ? "" : (stryCov_9fa48("16121"), 'schema_version_unknown'),
  SCHEMA_VERSION_LAG: stryMutAct_9fa48("16122") ? "" : (stryCov_9fa48("16122"), 'schema_version_lag')
}));
const JOIN_READINESS_SCHEMA_FIELD = Object.freeze(stryMutAct_9fa48("16123") ? {} : (stryCov_9fa48("16123"), {
  UPDATED_AT_HLC: stryMutAct_9fa48("16124") ? "" : (stryCov_9fa48("16124"), 'updated_at_hlc'),
  UPDATED_AT_HLC_CAMEL: stryMutAct_9fa48("16125") ? "" : (stryCov_9fa48("16125"), 'updatedAtHlc'),
  SCHEMA_VERSION: stryMutAct_9fa48("16126") ? "" : (stryCov_9fa48("16126"), 'schema_version'),
  SCHEMA_VERSION_CAMEL: stryMutAct_9fa48("16127") ? "" : (stryCov_9fa48("16127"), 'schemaVersion'),
  UPDATED_AT: stryMutAct_9fa48("16128") ? "" : (stryCov_9fa48("16128"), 'updated_at'),
  UPDATED_AT_CAMEL: stryMutAct_9fa48("16129") ? "" : (stryCov_9fa48("16129"), 'updatedAt'),
  CREATED_AT: stryMutAct_9fa48("16130") ? "" : (stryCov_9fa48("16130"), 'created_at'),
  CREATED_AT_CAMEL: stryMutAct_9fa48("16131") ? "" : (stryCov_9fa48("16131"), 'createdAt')
}));
const JOIN_READINESS_SCHEMA_FIELDS = Object.freeze(stryMutAct_9fa48("16132") ? [] : (stryCov_9fa48("16132"), [JOIN_READINESS_SCHEMA_FIELD.UPDATED_AT_HLC, JOIN_READINESS_SCHEMA_FIELD.UPDATED_AT_HLC_CAMEL, JOIN_READINESS_SCHEMA_FIELD.SCHEMA_VERSION, JOIN_READINESS_SCHEMA_FIELD.SCHEMA_VERSION_CAMEL, JOIN_READINESS_SCHEMA_FIELD.UPDATED_AT, JOIN_READINESS_SCHEMA_FIELD.UPDATED_AT_CAMEL, JOIN_READINESS_SCHEMA_FIELD.CREATED_AT, JOIN_READINESS_SCHEMA_FIELD.CREATED_AT_CAMEL]));
const JOIN_READINESS_DEFAULT_TABLE = TABLES.SERVICES;
const JOIN_BACKFILL_QUERY = Object.freeze(stryMutAct_9fa48("16133") ? {} : (stryCov_9fa48("16133"), {
  ASSIGNMENT_ID_FIELD: stryMutAct_9fa48("16134") ? "" : (stryCov_9fa48("16134"), 'assignment_id'),
  MESSAGE_TYPE: stryMutAct_9fa48("16135") ? "" : (stryCov_9fa48("16135"), 'QUERY'),
  RESPONSE_TYPE: Object.freeze(stryMutAct_9fa48("16136") ? {} : (stryCov_9fa48("16136"), {
    LEADER_REDIRECT: stryMutAct_9fa48("16137") ? "" : (stryCov_9fa48("16137"), 'LEADER_REDIRECT')
  }))
}));
const JOIN_READINESS_REPAIR = Object.freeze(stryMutAct_9fa48("16138") ? {} : (stryCov_9fa48("16138"), {
  TABLES: Object.freeze(stryMutAct_9fa48("16139") ? [] : (stryCov_9fa48("16139"), [TABLES.NODES, TABLES.PARTITIONS, TABLES.SERVICES, TABLES.MESSAGE_GROUPS, TABLES.REPLICA_OPERATIONS, TABLES.NODE_ENDPOINTS, TABLES.SERVICE_ENDPOINTS])),
  MIN_INTERVAL_MS: stryMutAct_9fa48("16140") ? TIME_MS.SECOND / NUM.FIVE : (stryCov_9fa48("16140"), TIME_MS.SECOND * NUM.FIVE)
}));
const JOIN_MESH_CONNECTIVITY_REPAIR = Object.freeze(stryMutAct_9fa48("16141") ? {} : (stryCov_9fa48("16141"), {
  TABLES: Object.freeze(stryMutAct_9fa48("16142") ? [] : (stryCov_9fa48("16142"), [TABLES.NODES, TABLES.NODE_ENDPOINTS])),
  MIN_INTERVAL_MS: JOIN_READINESS_REPAIR.MIN_INTERVAL_MS
}));
const JOIN_BACKFILL_SCOPE = (() => {
  if (stryMutAct_9fa48("16143")) {
    {}
  } else {
    stryCov_9fa48("16143");
    const blockingTables = JOIN_READINESS_REPAIR.TABLES;
    const blockingTableSet = new Set(blockingTables);
    return Object.freeze(stryMutAct_9fa48("16144") ? {} : (stryCov_9fa48("16144"), {
      BLOCKING_TABLES: blockingTables,
      OPPORTUNISTIC_TABLES: Object.freeze(stryMutAct_9fa48("16145") ? CACHE_HYDRATION_TABLES : (stryCov_9fa48("16145"), CACHE_HYDRATION_TABLES.filter(tableName => {
        if (stryMutAct_9fa48("16146")) {
          {}
        } else {
          stryCov_9fa48("16146");
          return stryMutAct_9fa48("16147") ? blockingTableSet.has(tableName) : (stryCov_9fa48("16147"), !blockingTableSet.has(tableName));
        }
      })))
    }));
  }
})();
const JOINING_LOG_MSG = Object.freeze(stryMutAct_9fa48("16148") ? {} : (stryCov_9fa48("16148"), {
  STARTING: stryMutAct_9fa48("16149") ? "" : (stryCov_9fa48("16149"), 'Starting node joining process'),
  COMPLETED: stryMutAct_9fa48("16150") ? "" : (stryCov_9fa48("16150"), 'Node joining completed successfully'),
  READY_SIGNAL_ROUTER_MISSING: stryMutAct_9fa48("16151") ? "" : (stryCov_9fa48("16151"), 'Cannot signal readiness without messageRouter'),
  READY_SIGNAL_TARGET_MISSING: stryMutAct_9fa48("16152") ? "" : (stryCov_9fa48("16152"), 'No control plane target address available for readiness'),
  READY_SIGNAL_SUCCESS: stryMutAct_9fa48("16153") ? "" : (stryCov_9fa48("16153"), 'Signaled readiness to seed node'),
  READY_SIGNAL_NOT_ACK: stryMutAct_9fa48("16154") ? "" : (stryCov_9fa48("16154"), 'Seed node did not acknowledge readiness'),
  READY_SIGNAL_RETRYING: stryMutAct_9fa48("16155") ? "" : (stryCov_9fa48("16155"), 'Retrying readiness signal to seed node'),
  READY_SIGNAL_FAILED: stryMutAct_9fa48("16156") ? "" : (stryCov_9fa48("16156"), 'Failed to signal readiness to seed node'),
  CANONICAL_READINESS_BLOCKED: stryMutAct_9fa48("16157") ? "" : (stryCov_9fa48("16157"), 'Join canonical readiness still blocked'),
  CONTROL_PLANE_BACKGROUND_WRITERS_ACTIVE: stryMutAct_9fa48("16158") ? "" : (stryCov_9fa48("16158"), 'Control plane background writers activated for joining node'),
  HEARTBEAT_FAILED: stryMutAct_9fa48("16159") ? "" : (stryCov_9fa48("16159"), 'Failed to send heartbeat to control plane'),
  CONTROL_PLANE_TARGET_UPDATED: stryMutAct_9fa48("16160") ? "" : (stryCov_9fa48("16160"), 'Control plane target address updated on leadership change'),
  PHASE_STARTING: stryMutAct_9fa48("16161") ? "" : (stryCov_9fa48("16161"), 'Starting joining phase'),
  PHASE_COMPLETED: stryMutAct_9fa48("16162") ? "" : (stryCov_9fa48("16162"), 'Joining phase completed'),
  PHASE_FAILED: stryMutAct_9fa48("16163") ? "" : (stryCov_9fa48("16163"), 'Joining phase failed'),
  SEED_CONTACTING: stryMutAct_9fa48("16164") ? "" : (stryCov_9fa48("16164"), 'Contacting seed node'),
  SEED_CONTACT_RETRYING: stryMutAct_9fa48("16165") ? "" : (stryCov_9fa48("16165"), 'Retrying seed bootstrap request'),
  SEED_CONTACT_TERMINAL: stryMutAct_9fa48("16166") ? "" : (stryCov_9fa48("16166"), 'Seed bootstrap request failed with terminal error'),
  BOOTSTRAP_RESPONSE_RECEIVED: stryMutAct_9fa48("16167") ? "" : (stryCov_9fa48("16167"), 'Received bootstrap response'),
  SEED_CONTACT_FAILED: stryMutAct_9fa48("16168") ? "" : (stryCov_9fa48("16168"), 'Failed to contact seed node'),
  CONNECTING_TO_CLUSTER_NODES: stryMutAct_9fa48("16169") ? "" : (stryCov_9fa48("16169"), 'Connecting to other cluster nodes'),
  CLUSTER_NODE_CONNECTED: stryMutAct_9fa48("16170") ? "" : (stryCov_9fa48("16170"), 'Connected to cluster node'),
  CLUSTER_NODE_CONNECT_FAILED: stryMutAct_9fa48("16171") ? "" : (stryCov_9fa48("16171"), 'Failed to connect to cluster node'),
  CLUSTER_CONNECTIONS_COMPLETE: stryMutAct_9fa48("16172") ? "" : (stryCov_9fa48("16172"), 'Cluster node connections complete'),
  SELF_HOSTED_CREATING: stryMutAct_9fa48("16173") ? "" : (stryCov_9fa48("16173"), 'Creating self-hosted message group'),
  MESSAGE_ROUTER_REQUIRED: stryMutAct_9fa48("16174") ? "" : (stryCov_9fa48("16174"), 'MessageRouter must be initialized before creating message groups'),
  MESSAGE_GROUP_REPLICA_CREATED: stryMutAct_9fa48("16175") ? "" : (stryCov_9fa48("16175"), 'Message group replica created'),
  MESSAGE_GROUP_ELECTIONS_START: stryMutAct_9fa48("16176") ? "" : (stryCov_9fa48("16176"), 'Starting elections for message group replicas'),
  SELF_HOSTED_CREATED: stryMutAct_9fa48("16177") ? "" : (stryCov_9fa48("16177"), 'Self-hosted message group created'),
  SELF_HOSTED_METADATA_REGISTERED: stryMutAct_9fa48("16178") ? "" : (stryCov_9fa48("16178"), 'Registered CREATE_SELF_HOSTED metadata'),
  JOIN_ASSIGNMENT_RECEIVED: stryMutAct_9fa48("16179") ? "" : (stryCov_9fa48("16179"), '[JOIN-DEBUG] phaseJoinExistingMessageGroup - received assignment'),
  JOIN_CREATING_WITH_PEERS: stryMutAct_9fa48("16180") ? "" : (stryCov_9fa48("16180"), '[JOIN-DEBUG] Creating MessageGroupService with peers'),
  JOIN_MESSAGE_RECEIVED: stryMutAct_9fa48("16181") ? "" : (stryCov_9fa48("16181"), '[JOIN-DEBUG] Message received at joining node'),
  JOIN_HANDLER_REGISTERED: stryMutAct_9fa48("16182") ? "" : (stryCov_9fa48("16182"), '[JOIN-DEBUG] Registered message handler'),
  JOIN_SERVICE_INITIALIZED: stryMutAct_9fa48("16183") ? "" : (stryCov_9fa48("16183"), '[JOIN-DEBUG] MessageGroupService initialized'),
  JOINED_EXISTING_GROUP: stryMutAct_9fa48("16184") ? "" : (stryCov_9fa48("16184"), '[JOIN-DEBUG] Joined existing message group'),
  REGISTERING_MESSAGE_GROUP_SERVICE: stryMutAct_9fa48("16185") ? "" : (stryCov_9fa48("16185"), 'Registering message group service in cluster'),
  MESSAGE_GROUP_REGISTER_NON_SUCCESS: stryMutAct_9fa48("16186") ? "" : (stryCov_9fa48("16186"), 'Message group service registration returned non-success'),
  MESSAGE_GROUP_REGISTERED: stryMutAct_9fa48("16187") ? "" : (stryCov_9fa48("16187"), 'Message group service registered in cluster'),
  MESSAGE_GROUP_REGISTER_RETRYING: stryMutAct_9fa48("16188") ? "" : (stryCov_9fa48("16188"), 'Retrying message group service registration in cluster'),
  MESSAGE_GROUP_REGISTER_FAILED: stryMutAct_9fa48("16189") ? "" : (stryCov_9fa48("16189"), 'Failed to register message group service in cluster'),
  WAITING_LEADERSHIP: stryMutAct_9fa48("16190") ? "" : (stryCov_9fa48("16190"), 'Waiting for message group leadership'),
  LEADERSHIP_ESTABLISHED: stryMutAct_9fa48("16191") ? "" : (stryCov_9fa48("16191"), 'Message group leadership established'),
  WS_SELF_CONNECTED: stryMutAct_9fa48("16192") ? "" : (stryCov_9fa48("16192"), 'WebSocket server started and self-connection established'),
  ROUTER_INIT_FAILED: stryMutAct_9fa48("16193") ? "" : (stryCov_9fa48("16193"), 'MessageRouter initialization failed'),
  RUNTIME_WIRING_READY: stryMutAct_9fa48("16194") ? "" : (stryCov_9fa48("16194"), 'Runtime startup wiring initialized'),
  SEED_WS_CONNECTING: stryMutAct_9fa48("16195") ? "" : (stryCov_9fa48("16195"), '[JOIN-DEBUG] Connecting to seed node via WebSocket'),
  SEED_WS_CONNECTED: stryMutAct_9fa48("16196") ? "" : (stryCov_9fa48("16196"), '[JOIN-DEBUG] Connected to seed node via WebSocket'),
  SEED_WS_RETRYING: stryMutAct_9fa48("16197") ? "" : (stryCov_9fa48("16197"), '[JOIN-DEBUG] Retrying seed node WebSocket connection'),
  SEED_WS_CONNECT_FAILED: stryMutAct_9fa48("16198") ? "" : (stryCov_9fa48("16198"), '[JOIN-DEBUG] Failed to connect to seed node via WebSocket'),
  SEED_WS_MISSING: stryMutAct_9fa48("16199") ? "" : (stryCov_9fa48("16199"), '[JOIN-DEBUG] No seed node WebSocket address provided'),
  NODE_STATE_UPDATE_SENT: stryMutAct_9fa48("16200") ? "" : (stryCov_9fa48("16200"), 'Sent NODE_STATE_UPDATE to control plane'),
  CONNECTED_STATE_UPDATE_DEFERRED: stryMutAct_9fa48("16201") ? "" : (stryCov_9fa48("16201"), 'Deferring connected NODE_STATE_UPDATE until later join phases'),
  NODE_STATE_UPDATE_RETRYING: stryMutAct_9fa48("16202") ? "" : (stryCov_9fa48("16202"), 'Retrying NODE_STATE_UPDATE against a different control-plane target'),
  NODE_STATE_UPDATE_FAILED: stryMutAct_9fa48("16203") ? "" : (stryCov_9fa48("16203"), 'Failed to send NODE_STATE_UPDATE to control plane'),
  RETRYABLE_FAILURE_RESUMING: stryMutAct_9fa48("16204") ? "" : (stryCov_9fa48("16204"), 'Resuming join session after retryable control-plane failure'),
  RETRYABLE_FAILURE_LIFECYCLE_RESET: stryMutAct_9fa48("16205") ? "" : (stryCov_9fa48("16205"), 'Reset join lifecycle state machine for retryable resume attempt'),
  RETRYABLE_FAILURE_RESUME_EXHAUSTED: stryMutAct_9fa48("16206") ? "" : (stryCov_9fa48("16206"), 'Join retryable resume budget exhausted'),
  WS_INFRA_READY: stryMutAct_9fa48("16207") ? "" : (stryCov_9fa48("16207"), 'WebSocket infrastructure setup complete'),
  STATE_QUERY_START: stryMutAct_9fa48("16208") ? "" : (stryCov_9fa48("16208"), 'Querying system state'),
  STATE_QUERY_HYDRATING_CACHE: stryMutAct_9fa48("16209") ? "" : (stryCov_9fa48("16209"), 'Hydrating system table cache'),
  STATE_QUERY_HYDRATION_FAILED: stryMutAct_9fa48("16210") ? "" : (stryCov_9fa48("16210"), 'Failed to hydrate system table cache'),
  STATE_QUERY_HYDRATION_COMPLETE: stryMutAct_9fa48("16211") ? "" : (stryCov_9fa48("16211"), 'System table cache hydration complete'),
  STATE_QUERY_TABLE: stryMutAct_9fa48("16212") ? "" : (stryCov_9fa48("16212"), 'Would query system table'),
  STATE_QUERY_COMPLETE: stryMutAct_9fa48("16213") ? "" : (stryCov_9fa48("16213"), 'System state query complete'),
  JOIN_FAILED: stryMutAct_9fa48("16214") ? "" : (stryCov_9fa48("16214"), 'Node joining failed'),
  CLEANUP_START: stryMutAct_9fa48("16215") ? "" : (stryCov_9fa48("16215"), 'Cleaning up partially initialized services'),
  PARTITION_CLEANED: stryMutAct_9fa48("16216") ? "" : (stryCov_9fa48("16216"), 'Partition service cleaned up'),
  PARTITION_CLEAN_FAILED: stryMutAct_9fa48("16217") ? "" : (stryCov_9fa48("16217"), 'Error cleaning up partition service'),
  MESSAGE_GROUP_CLEANED: stryMutAct_9fa48("16218") ? "" : (stryCov_9fa48("16218"), 'Message group service cleaned up'),
  MESSAGE_GROUP_CLEAN_FAILED: stryMutAct_9fa48("16219") ? "" : (stryCov_9fa48("16219"), 'Error cleaning up message group service'),
  CLEANUP_COMPLETE: stryMutAct_9fa48("16220") ? "" : (stryCov_9fa48("16220"), 'Cleanup complete'),
  CLEANUP_STEP_FAILED: stryMutAct_9fa48("16221") ? "" : (stryCov_9fa48("16221"), 'Node joining cleanup step failed'),
  REPLICA_HANDLER_ROUTER_MISSING: stryMutAct_9fa48("16222") ? "" : (stryCov_9fa48("16222"), 'MessageRouter not available for ReplicaHandler'),
  REPLICA_HANDLER_ROUTER_REQUIRED: stryMutAct_9fa48("16223") ? "" : (stryCov_9fa48("16223"), 'MessageRouter must be initialized before ReplicaHandler'),
  CDC_EVENT_RECEIVED: stryMutAct_9fa48("16224") ? "" : (stryCov_9fa48("16224"), 'CDC event received from partition on joining node'),
  CDC_SUBSCRIPTION_REGISTERED: stryMutAct_9fa48("16225") ? "" : (stryCov_9fa48("16225"), 'CDC subscription set up for partition on joining node'),
  CDC_SUBSCRIPTION_FAILED: stryMutAct_9fa48("16226") ? "" : (stryCov_9fa48("16226"), 'CDC subscription failed for message group service'),
  LATENCY_TOPOLOGY_READY: stryMutAct_9fa48("16227") ? "" : (stryCov_9fa48("16227"), 'Latency topology services initialized for joining node'),
  LATENCY_TOPOLOGY_STARTED: stryMutAct_9fa48("16228") ? "" : (stryCov_9fa48("16228"), 'Latency topology lifecycle started for joining node'),
  REPLICA_HANDLER_READY: stryMutAct_9fa48("16229") ? "" : (stryCov_9fa48("16229"), 'ReplicaHandler initialized'),
  CDC_INTEGRATION_CREATE: stryMutAct_9fa48("16230") ? "" : (stryCov_9fa48("16230"), 'Creating CDC integration service for joining node'),
  ENDPOINT_REGISTERING: stryMutAct_9fa48("16231") ? "" : (stryCov_9fa48("16231"), 'Registering node endpoint in cluster'),
  ENDPOINT_REGISTERED: stryMutAct_9fa48("16232") ? "" : (stryCov_9fa48("16232"), 'Node endpoint registered in cluster'),
  ENDPOINT_REGISTER_FAILED: stryMutAct_9fa48("16233") ? "" : (stryCov_9fa48("16233"), 'Failed to register node endpoint in cluster'),
  FAILED_JOIN_CLEANUP_START: stryMutAct_9fa48("16234") ? "" : (stryCov_9fa48("16234"), 'Starting failed join cleanup in reverse phase order'),
  FAILED_JOIN_CLEANUP_QUERYING_STATE: stryMutAct_9fa48("16235") ? "" : (stryCov_9fa48("16235"), 'Removing node and service entries during failed join cleanup'),
  FAILED_JOIN_CLEANUP_QUERYING_STATE_DONE: stryMutAct_9fa48("16236") ? "" : (stryCov_9fa48("16236"), 'Node and service entries removed during failed join cleanup'),
  FAILED_JOIN_CLEANUP_QUERYING_STATE_ERROR: stryMutAct_9fa48("16237") ? "" : (stryCov_9fa48("16237"), 'Error removing entries during failed join cleanup'),
  FAILED_JOIN_CLEANUP_WAITING_LEADERSHIP: stryMutAct_9fa48("16238") ? "" : (stryCov_9fa48("16238"), 'Stopping message group services during failed join cleanup'),
  FAILED_JOIN_CLEANUP_WAITING_LEADERSHIP_DONE: stryMutAct_9fa48("16239") ? "" : (stryCov_9fa48("16239"), 'Message group services stopped during failed join cleanup'),
  FAILED_JOIN_CLEANUP_WAITING_LEADERSHIP_ERROR: stryMutAct_9fa48("16240") ? "" : (stryCov_9fa48("16240"), 'Error stopping message group services during failed join cleanup'),
  FAILED_JOIN_CLEANUP_MESSAGE_GROUP: stryMutAct_9fa48("16241") ? "" : (stryCov_9fa48("16241"), 'Stopping message group replicas during failed join cleanup'),
  FAILED_JOIN_CLEANUP_MESSAGE_GROUP_DONE: stryMutAct_9fa48("16242") ? "" : (stryCov_9fa48("16242"), 'Message group replicas stopped during failed join cleanup'),
  FAILED_JOIN_CLEANUP_MESSAGE_GROUP_ERROR: stryMutAct_9fa48("16243") ? "" : (stryCov_9fa48("16243"), 'Error stopping message group replicas during failed join cleanup'),
  FAILED_JOIN_CLEANUP_WEBSOCKET: stryMutAct_9fa48("16244") ? "" : (stryCov_9fa48("16244"), 'Disconnecting from seed and stopping router during failed join cleanup'),
  FAILED_JOIN_CLEANUP_WEBSOCKET_DONE: stryMutAct_9fa48("16245") ? "" : (stryCov_9fa48("16245"), 'Disconnected from seed and router stopped during failed join cleanup'),
  FAILED_JOIN_CLEANUP_WEBSOCKET_ERROR: stryMutAct_9fa48("16246") ? "" : (stryCov_9fa48("16246"), 'Error disconnecting during failed join cleanup'),
  FAILED_JOIN_CLEANUP_COMPLETE: stryMutAct_9fa48("16247") ? "" : (stryCov_9fa48("16247"), 'Failed join cleanup complete'),
  FAILED_JOIN_CLEANUP_SUMMARY: stryMutAct_9fa48("16248") ? "" : (stryCov_9fa48("16248"), 'Failed join cleanup summary'),
  CDC_SUBSCRIPTION_RETRY: stryMutAct_9fa48("16249") ? "" : (stryCov_9fa48("16249"), 'CDC subscription retry'),
  CDC_SUBSCRIPTION_RETRY_EXHAUSTED: stryMutAct_9fa48("16250") ? "" : (stryCov_9fa48("16250"), 'CDC subscription retry exhausted'),
  CDC_RECOVERY_DIAGNOSTICS: stryMutAct_9fa48("16251") ? "" : (stryCov_9fa48("16251"), 'CDC recovery diagnostics'),
  CDC_REESTABLISHMENT_COMPLETE: stryMutAct_9fa48("16252") ? "" : (stryCov_9fa48("16252"), 'CDC re-establishment complete'),
  CDC_REESTABLISHMENT_TIMEOUT: stryMutAct_9fa48("16253") ? "" : (stryCov_9fa48("16253"), 'CDC re-establishment timeout'),
  CDC_READINESS_GATE_WAITING: stryMutAct_9fa48("16254") ? "" : (stryCov_9fa48("16254"), 'Waiting for CDC subscriptions before advertising readiness'),
  CDC_READINESS_GATE_PASSED: stryMutAct_9fa48("16255") ? "" : (stryCov_9fa48("16255"), 'CDC subscriptions confirmed active before readiness advertisement'),
  CDC_READINESS_GATE_DEGRADED: (stryMutAct_9fa48("16256") ? "" : (stryCov_9fa48("16256"), 'CDC subscriptions not confirmed within timeout, ')) + (stryMutAct_9fa48("16257") ? "" : (stryCov_9fa48("16257"), 'advertising readiness with degraded CDC status'))
}));
const JOINING_ERROR_MSG = Object.freeze(stryMutAct_9fa48("16258") ? {} : (stryCov_9fa48("16258"), {
  NODE_ADDRESS_REQUIRED: stryMutAct_9fa48("16259") ? "" : (stryCov_9fa48("16259"), 'Node address is required'),
  SEED_NODE_ADDRESS_REQUIRED: stryMutAct_9fa48("16260") ? "" : (stryCov_9fa48("16260"), 'Seed node address is required'),
  SEED_WS_ADDRESS_REQUIRED: stryMutAct_9fa48("16261") ? "" : (stryCov_9fa48("16261"), 'Seed node WebSocket address is required'),
  SEED_NODE_ID_REQUIRED: stryMutAct_9fa48("16262") ? "" : (stryCov_9fa48("16262"), 'Seed node ID is required'),
  BOOTSTRAP_REQUEST_FAILED: stryMutAct_9fa48("16263") ? "" : (stryCov_9fa48("16263"), 'Bootstrap request failed'),
  MESSAGE_ROUTER_REQUIRED: stryMutAct_9fa48("16264") ? "" : (stryCov_9fa48("16264"), 'MessageRouter must be initialized before creating message groups'),
  MOVE_REPLICA_MISSING: stryMutAct_9fa48("16265") ? "" : (stryCov_9fa48("16265"), 'MOVE_REPLICA strategy requires replicaToMove in assignment'),
  replicaOwnerConflict: stryMutAct_9fa48("16266") ? () => undefined : (stryCov_9fa48("16266"), (replicaId, existingNodeId, joiningNodeId) => (stryMutAct_9fa48("16267") ? `` : (stryCov_9fa48("16267"), `replica_owner_conflict: replica ${replicaId} owned by ${existingNodeId}, `)) + (stryMutAct_9fa48("16268") ? `` : (stryCov_9fa48("16268"), `joining node ${joiningNodeId} is not authorized`))),
  CONTROL_PLANE_TARGET_MISSING: stryMutAct_9fa48("16269") ? "" : (stryCov_9fa48("16269"), 'No reachable control plane target address available'),
  CONTROL_PLANE_SERVICE_REQUIRED: stryMutAct_9fa48("16270") ? "" : (stryCov_9fa48("16270"), 'Control plane service must be initialized'),
  MESSAGE_GROUP_LEADER_REQUIRED: stryMutAct_9fa48("16271") ? "" : (stryCov_9fa48("16271"), 'Message group leader is required for control plane routing'),
  leadershipTimeout: stryMutAct_9fa48("16272") ? () => undefined : (stryCov_9fa48("16272"), timeoutMs => stryMutAct_9fa48("16273") ? `` : (stryCov_9fa48("16273"), `Message group failed to establish leadership within ${timeoutMs}ms`)),
  contactSeedFailed: stryMutAct_9fa48("16274") ? () => undefined : (stryCov_9fa48("16274"), message => stryMutAct_9fa48("16275") ? `` : (stryCov_9fa48("16275"), `Failed to contact seed node: ${message}`)),
  routerInitFailed: stryMutAct_9fa48("16276") ? () => undefined : (stryCov_9fa48("16276"), message => stryMutAct_9fa48("16277") ? `` : (stryCov_9fa48("16277"), `MessageRouter initialization failed: ${message}`)),
  STATE_QUERY_FAILED: stryMutAct_9fa48("16278") ? "" : (stryCov_9fa48("16278"), 'State query failed'),
  STATE_QUERY_CACHE_REQUIRED: stryMutAct_9fa48("16279") ? "" : (stryCov_9fa48("16279"), 'System table cache is required for state query'),
  STATE_QUERY_ENGINE_REQUIRED: stryMutAct_9fa48("16280") ? "" : (stryCov_9fa48("16280"), 'SQL query engine is required for state query'),
  STATE_QUERY_LEADERS_REQUIRED: stryMutAct_9fa48("16281") ? "" : (stryCov_9fa48("16281"), 'Partition leaders are required for state query'),
  httpStatus: stryMutAct_9fa48("16282") ? () => undefined : (stryCov_9fa48("16282"), (status, body) => stryMutAct_9fa48("16283") ? `` : (stryCov_9fa48("16283"), `HTTP ${status}: ${body}`)),
  httpTimeout: stryMutAct_9fa48("16284") ? () => undefined : (stryCov_9fa48("16284"), timeoutMs => stryMutAct_9fa48("16285") ? `` : (stryCov_9fa48("16285"), `Request timeout after ${timeoutMs}ms`)),
  leaderMetadataIncomplete: stryMutAct_9fa48("16286") ? () => undefined : (stryCov_9fa48("16286"), details => stryMutAct_9fa48("16287") ? `` : (stryCov_9fa48("16287"), `Leader metadata incomplete: ${details}`)),
  bootstrapNotReady: stryMutAct_9fa48("16288") ? () => undefined : (stryCov_9fa48("16288"), phase => stryMutAct_9fa48("16289") ? `` : (stryCov_9fa48("16289"), `Seed bootstrap not ready${phase ? stryMutAct_9fa48("16290") ? `` : (stryCov_9fa48("16290"), ` (phase: ${phase})`) : stryMutAct_9fa48("16291") ? "Stryker was here!" : (stryCov_9fa48("16291"), '')}`)),
  registerServiceTimeout: stryMutAct_9fa48("16292") ? () => undefined : (stryCov_9fa48("16292"), (serviceId, timeoutMs) => stryMutAct_9fa48("16293") ? `` : (stryCov_9fa48("16293"), `Register-service timed out for ${serviceId} after ${timeoutMs}ms`)),
  SELF_HOSTED_MISSING_GROUP_ID: stryMutAct_9fa48("16294") ? "" : (stryCov_9fa48("16294"), 'CREATE_SELF_HOSTED assignment missing groupId'),
  selfHostedNoLocalReplicas: stryMutAct_9fa48("16295") ? () => undefined : (stryCov_9fa48("16295"), groupId => stryMutAct_9fa48("16296") ? `` : (stryCov_9fa48("16296"), `No local replicas found for CREATE_SELF_HOSTED group ${groupId}`)),
  selfHostedMetadataUpsertFailed: stryMutAct_9fa48("16297") ? () => undefined : (stryCov_9fa48("16297"), groupId => stryMutAct_9fa48("16298") ? `` : (stryCov_9fa48("16298"), `Failed to upsert message group metadata for ${groupId}`)),
  READY_SIGNAL_NOT_ACK: stryMutAct_9fa48("16299") ? "" : (stryCov_9fa48("16299"), 'Control plane did not acknowledge ready signal'),
  controlPlaneMessageFailed: stryMutAct_9fa48("16300") ? () => undefined : (stryCov_9fa48("16300"), message => stryMutAct_9fa48("16301") ? `` : (stryCov_9fa48("16301"), `Control plane message failed: ${message}`)),
  controlPlaneCdcSubscribeFailed: stryMutAct_9fa48("16302") ? () => undefined : (stryCov_9fa48("16302"), (tableName, message) => stryMutAct_9fa48("16303") ? `` : (stryCov_9fa48("16303"), `CDC subscription failed for ${tableName}: ${message}`)),
  REPLICA_HANDLER_ROUTER_REQUIRED: stryMutAct_9fa48("16304") ? "" : (stryCov_9fa48("16304"), 'MessageRouter must be initialized before ReplicaHandler'),
  LATENCY_TOPOLOGY_MISSING: stryMutAct_9fa48("16305") ? "" : (stryCov_9fa48("16305"), 'Latency topology services are not initialized'),
  JOIN_PLAN_SEGMENTS_MISSING: stryMutAct_9fa48("16306") ? "" : (stryCov_9fa48("16306"), 'Join plan missing segments property'),
  joinPlanSegmentMissing: stryMutAct_9fa48("16307") ? () => undefined : (stryCov_9fa48("16307"), segmentName => stryMutAct_9fa48("16308") ? `` : (stryCov_9fa48("16308"), `Join plan missing required segment: ${segmentName}`)),
  joinPlanSegmentEmpty: stryMutAct_9fa48("16309") ? () => undefined : (stryCov_9fa48("16309"), segmentName => stryMutAct_9fa48("16310") ? `` : (stryCov_9fa48("16310"), `Join plan required segment is empty: ${segmentName}`))
}));
const JOINING_CLEANUP_STEP = Object.freeze(stryMutAct_9fa48("16311") ? {} : (stryCov_9fa48("16311"), {
  QUERYING_STATE: stryMutAct_9fa48("16312") ? "" : (stryCov_9fa48("16312"), 'querying_state'),
  WAITING_LEADERSHIP: stryMutAct_9fa48("16313") ? "" : (stryCov_9fa48("16313"), 'waiting_leadership'),
  MESSAGE_GROUP: stryMutAct_9fa48("16314") ? "" : (stryCov_9fa48("16314"), 'message_group'),
  CONNECTING_WEBSOCKET: stryMutAct_9fa48("16315") ? "" : (stryCov_9fa48("16315"), 'connecting_websocket')
}));
const JOINING_ERROR_NAME = Object.freeze(stryMutAct_9fa48("16316") ? {} : (stryCov_9fa48("16316"), {
  ABORT: stryMutAct_9fa48("16317") ? "" : (stryCov_9fa48("16317"), 'AbortError')
}));
const JOINING_HTTP = Object.freeze(stryMutAct_9fa48("16318") ? {} : (stryCov_9fa48("16318"), {
  BOOTSTRAP_PATH: stryMutAct_9fa48("16319") ? "" : (stryCov_9fa48("16319"), '/bootstrap'),
  REGISTER_SERVICE_PATH: stryMutAct_9fa48("16320") ? "" : (stryCov_9fa48("16320"), '/register-service'),
  METHOD_POST: stryMutAct_9fa48("16321") ? "" : (stryCov_9fa48("16321"), 'POST'),
  HEADER_CONTENT_TYPE: stryMutAct_9fa48("16322") ? "" : (stryCov_9fa48("16322"), 'Content-Type'),
  HEADER_CONNECTION: stryMutAct_9fa48("16323") ? "" : (stryCov_9fa48("16323"), 'Connection'),
  HEADER_RETRY_AFTER: stryMutAct_9fa48("16324") ? "" : (stryCov_9fa48("16324"), 'Retry-After'),
  CONTENT_TYPE_JSON: stryMutAct_9fa48("16325") ? "" : (stryCov_9fa48("16325"), 'application/json'),
  CONNECTION_CLOSE: stryMutAct_9fa48("16326") ? "" : (stryCov_9fa48("16326"), 'close')
}));
const JOIN_REPLICA_DEFAULT = Object.freeze(stryMutAct_9fa48("16327") ? {} : (stryCov_9fa48("16327"), {
  DEFER_ELECTION: stryMutAct_9fa48("16328") ? true : (stryCov_9fa48("16328"), false),
  LOG_ENVELOPE: stryMutAct_9fa48("16329") ? false : (stryCov_9fa48("16329"), true),
  LOG_REGISTRATION: stryMutAct_9fa48("16330") ? false : (stryCov_9fa48("16330"), true)
}));
const CDC_REESTABLISHMENT = Object.freeze(stryMutAct_9fa48("16331") ? {} : (stryCov_9fa48("16331"), {
  TIMEOUT_MS: 30000,
  RETRY_DELAY_MS: 1000,
  MAX_RETRIES: 10,
  DIAGNOSTIC_INTERVAL_MS: 5000,
  READINESS_GATE_POLL_MS: 500
}));
const CDC_SUBSCRIPTION_STATUS = Object.freeze(stryMutAct_9fa48("16332") ? {} : (stryCov_9fa48("16332"), {
  SUBSCRIBED: stryMutAct_9fa48("16333") ? "" : (stryCov_9fa48("16333"), 'subscribed'),
  PENDING: stryMutAct_9fa48("16334") ? "" : (stryCov_9fa48("16334"), 'pending'),
  FAILED: stryMutAct_9fa48("16335") ? "" : (stryCov_9fa48("16335"), 'failed')
}));
export { CDC_REESTABLISHMENT, CDC_SUBSCRIPTION_STATUS, JOIN_BACKFILL_QUERY, JOIN_BACKFILL_SCOPE, JOIN_REPLICA_DEFAULT, JOINING_CLEANUP_STEP, JOINING_DEFAULT, JOINING_ERROR_MSG, JOINING_ERROR_NAME, JOINING_HTTP, JOINING_UNIFIED_RECONCILE, JOIN_MESH_CONNECTIVITY_REPAIR, JOIN_READINESS_DEFAULT_TABLE, JOIN_READINESS_REASON, JOIN_READINESS_REPAIR, JOIN_READINESS_SCHEMA_FIELD, JOIN_READINESS_SCHEMA_FIELDS, JOINING_LOG_MSG };