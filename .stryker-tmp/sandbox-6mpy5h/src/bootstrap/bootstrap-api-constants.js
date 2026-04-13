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
import { HOST, NUM, STRING } from '../constants/index.js';
import { BOOTSTRAP_LOG_PREFIX, BOOTSTRAP_SUBSYSTEM } from './bootstrap-constants.js';
const BOOTSTRAP_API_SUBSYSTEM = BOOTSTRAP_SUBSYSTEM.API;
const BOOTSTRAP_API_ROUTE = Object.freeze(stryMutAct_9fa48("10978") ? {} : (stryCov_9fa48("10978"), {
  HEALTH: stryMutAct_9fa48("10979") ? "" : (stryCov_9fa48("10979"), '/health'),
  LIVEZ: stryMutAct_9fa48("10980") ? "" : (stryCov_9fa48("10980"), '/livez'),
  STARTUPZ: stryMutAct_9fa48("10981") ? "" : (stryCov_9fa48("10981"), '/startupz'),
  READYZ: stryMutAct_9fa48("10982") ? "" : (stryCov_9fa48("10982"), '/readyz'),
  BOOTSTRAP_READY: stryMutAct_9fa48("10983") ? "" : (stryCov_9fa48("10983"), '/bootstrap/ready'),
  BOOTSTRAP: stryMutAct_9fa48("10984") ? "" : (stryCov_9fa48("10984"), '/bootstrap'),
  REGISTER_SERVICE: stryMutAct_9fa48("10985") ? "" : (stryCov_9fa48("10985"), '/register-service'),
  CLUSTER_STATE: stryMutAct_9fa48("10986") ? "" : (stryCov_9fa48("10986"), '/cluster/state')
}));
const BOOTSTRAP_API_HEALTH_STATUS = stryMutAct_9fa48("10987") ? "" : (stryCov_9fa48("10987"), 'healthy');
const BOOTSTRAP_API_HEALTH_STATUS_INITIALIZING = stryMutAct_9fa48("10988") ? "" : (stryCov_9fa48("10988"), 'initializing');
const BOOTSTRAP_API_MESSAGE_GROUP_PREFIX = stryMutAct_9fa48("10989") ? "" : (stryCov_9fa48("10989"), 'mg-');
const BOOTSTRAP_API_DEFAULT = Object.freeze(stryMutAct_9fa48("10990") ? {} : (stryCov_9fa48("10990"), {
  MG_ID_LENGTH: NUM.EIGHT,
  WS_HOST: HOST.LOCALHOST,
  MAX_CONCURRENT_BOOTSTRAP_REQUESTS: 1,
  BOOTSTRAP_ADMISSION_RETRY_AFTER_MS: 1000,
  MOVE_REPLICA_ASSIGNMENT_LEASE_MS: NUM.THIRTY_THOUSAND,
  MOVE_REPLICA_ASSIGNMENT_SWEEP_INTERVAL_MS: NUM.THOUSAND,
  SERVICE_REGISTRATION_WRITE_RETRY_TIMEOUT_MS: stryMutAct_9fa48("10991") ? NUM.TWO / NUM.THOUSAND : (stryCov_9fa48("10991"), NUM.TWO * NUM.THOUSAND),
  SERVICE_REGISTRATION_CACHE_VISIBILITY_TIMEOUT_MS: NUM.FIVE_THOUSAND,
  SERVICE_REGISTRATION_CACHE_VISIBILITY_POLL_INTERVAL_MS: NUM.TEN
}));
const BOOTSTRAP_API_CACHE_VISIBILITY = Object.freeze(stryMutAct_9fa48("10992") ? {} : (stryCov_9fa48("10992"), {
  REASON_CACHE_UNAVAILABLE: stryMutAct_9fa48("10993") ? "" : (stryCov_9fa48("10993"), 'cache_unavailable'),
  REASON_SERVICE_ROW_MISSING: stryMutAct_9fa48("10994") ? "" : (stryCov_9fa48("10994"), 'service_row_missing'),
  REASON_FIELD_MISMATCH: stryMutAct_9fa48("10995") ? "" : (stryCov_9fa48("10995"), 'field_mismatch'),
  REASON_STORAGE_ROW_VISIBLE_CACHE_STALE: stryMutAct_9fa48("10996") ? "" : (stryCov_9fa48("10996"), 'storage_row_visible_cache_stale'),
  REASON_STORAGE_ROW_MISSING: stryMutAct_9fa48("10997") ? "" : (stryCov_9fa48("10997"), 'storage_row_missing'),
  REASON_STORAGE_LOOKUP_FAILED: stryMutAct_9fa48("10998") ? "" : (stryCov_9fa48("10998"), 'storage_lookup_failed'),
  REASON_VISIBLE: stryMutAct_9fa48("10999") ? "" : (stryCov_9fa48("10999"), 'visible')
}));
const BOOTSTRAP_API_LOG_MSG = Object.freeze(stryMutAct_9fa48("11000") ? {} : (stryCov_9fa48("11000"), {
  SQL_ENGINE_SET: stryMutAct_9fa48("11001") ? "" : (stryCov_9fa48("11001"), 'SQL query engine set for bootstrap API'),
  STARTED: stryMutAct_9fa48("11002") ? "" : (stryCov_9fa48("11002"), 'Bootstrap API started'),
  BOOTSTRAP_JOIN_READINESS_BLOCKED: stryMutAct_9fa48("11003") ? "" : (stryCov_9fa48("11003"), 'Bootstrap join-readiness projection remains blocked'),
  RECEIVED_BOOTSTRAP_REQUEST: stryMutAct_9fa48("11004") ? "" : (stryCov_9fa48("11004"), 'Received bootstrap request'),
  VALIDATION_FAILED: stryMutAct_9fa48("11005") ? "" : (stryCov_9fa48("11005"), 'Bootstrap request validation failed'),
  CONFLICT_DETECTED: stryMutAct_9fa48("11006") ? "" : (stryCov_9fa48("11006"), 'Bootstrap request conflict detected'),
  RESPONSE_PREPARED: stryMutAct_9fa48("11007") ? "" : (stryCov_9fa48("11007"), 'Bootstrap response prepared'),
  BOOTSTRAP_FAILED: stryMutAct_9fa48("11008") ? "" : (stryCov_9fa48("11008"), 'Bootstrap request failed'),
  REGISTER_NODE_UNSUPPORTED: stryMutAct_9fa48("11009") ? "" : (stryCov_9fa48("11009"), 'register-node endpoint is not supported'),
  RECEIVED_REGISTER_SERVICE: stryMutAct_9fa48("11010") ? "" : (stryCov_9fa48("11010"), 'Received register-service request'),
  SQL_ENGINE_MISSING: stryMutAct_9fa48("11011") ? "" : (stryCov_9fa48("11011"), 'SQL query engine not available for service registration'),
  MOVE_REPLICA_SOURCE_REMOVAL_START: stryMutAct_9fa48("11012") ? "" : (stryCov_9fa48("11012"), 'Removing local source replica before MOVE_REPLICA ownership commit'),
  MOVE_REPLICA_SOURCE_REMOVED: stryMutAct_9fa48("11013") ? "" : (stryCov_9fa48("11013"), 'Removed local source replica for MOVE_REPLICA handoff'),
  MOVE_REPLICA_SOURCE_REMOVAL_FAILED: stryMutAct_9fa48("11014") ? "" : (stryCov_9fa48("11014"), 'Failed to remove local source replica during MOVE_REPLICA handoff'),
  MOVE_REPLICA_HANDOFF_STARTED: stryMutAct_9fa48("11015") ? "" : (stryCov_9fa48("11015"), 'Started MOVE_REPLICA handoff operation tracking'),
  MOVE_REPLICA_HANDOFF_PHASE_APPLIED: stryMutAct_9fa48("11016") ? "" : (stryCov_9fa48("11016"), 'Applied MOVE_REPLICA handoff phase'),
  MOVE_REPLICA_HANDOFF_COMPLETED: stryMutAct_9fa48("11017") ? "" : (stryCov_9fa48("11017"), 'Completed MOVE_REPLICA handoff operation'),
  MOVE_REPLICA_HANDOFF_FAILED: stryMutAct_9fa48("11018") ? "" : (stryCov_9fa48("11018"), 'MOVE_REPLICA handoff operation failed'),
  MOVE_REPLICA_ASSIGNMENT_RESERVED: stryMutAct_9fa48("11019") ? "" : (stryCov_9fa48("11019"), 'Reserved MOVE_REPLICA assignment for joining node'),
  MOVE_REPLICA_ASSIGNMENT_RENEWED: stryMutAct_9fa48("11020") ? "" : (stryCov_9fa48("11020"), 'Renewed MOVE_REPLICA assignment reservation for original target node'),
  MOVE_REPLICA_ASSIGNMENT_RESERVATION_WRITE_FAILED: (stryMutAct_9fa48("11021") ? "" : (stryCov_9fa48("11021"), 'Best-effort MOVE_REPLICA assignment reservation write failed')) + (stryMutAct_9fa48("11022") ? "" : (stryCov_9fa48("11022"), ' (in-memory reservation remains authoritative)')),
  MOVE_REPLICA_ASSIGNMENT_RENEWAL_WRITE_FAILED: (stryMutAct_9fa48("11023") ? "" : (stryCov_9fa48("11023"), 'Best-effort MOVE_REPLICA assignment lease renewal write failed')) + (stryMutAct_9fa48("11024") ? "" : (stryCov_9fa48("11024"), ' (in-memory reservation remains authoritative)')),
  MOVE_REPLICA_HANDOFF_INITIATION_WRITE_FAILED: (stryMutAct_9fa48("11025") ? "" : (stryCov_9fa48("11025"), 'Best-effort MOVE_REPLICA handoff initiation write failed')) + (stryMutAct_9fa48("11026") ? "" : (stryCov_9fa48("11026"), ' (in-memory reservation remains authoritative)')),
  MOVE_REPLICA_ASSIGNMENT_RECONCILED: stryMutAct_9fa48("11027") ? "" : (stryCov_9fa48("11027"), 'Reconciled observed MOVE_REPLICA assignment to committed state'),
  MOVE_REPLICA_ASSIGNMENT_EXPIRED: stryMutAct_9fa48("11028") ? "" : (stryCov_9fa48("11028"), 'Expired stale MOVE_REPLICA assignment reservation'),
  MOVE_REPLICA_ASSIGNMENT_SWEEP_FAILED: stryMutAct_9fa48("11029") ? "" : (stryCov_9fa48("11029"), 'Failed to sweep MOVE_REPLICA assignment reservations'),
  MOVE_REPLICA_ASSIGNMENT_CONFLICT: stryMutAct_9fa48("11030") ? "" : (stryCov_9fa48("11030"), 'MOVE_REPLICA assignment reservation conflict detected'),
  MOVE_REPLICA_ASSIGNMENT_VALIDATION_FAILED: stryMutAct_9fa48("11031") ? "" : (stryCov_9fa48("11031"), 'MOVE_REPLICA assignment token validation failed'),
  SERVICE_REGISTRATION_DEFERRED: stryMutAct_9fa48("11032") ? "" : (stryCov_9fa48("11032"), 'Register-service metadata publication deferred'),
  SERVICE_REGISTRATION_WRITE_RETRY: stryMutAct_9fa48("11033") ? "" : (stryCov_9fa48("11033"), 'Retrying register-service metadata write after retryable failure'),
  SERVICE_REGISTRATION_CACHE_VISIBILITY_TIMEOUT: stryMutAct_9fa48("11034") ? "" : (stryCov_9fa48("11034"), 'Service registration cache visibility timeout diagnostics'),
  SERVICE_REGISTERED: stryMutAct_9fa48("11035") ? "" : (stryCov_9fa48("11035"), 'Service registered in services table'),
  REGISTER_SERVICE_FAILED: stryMutAct_9fa48("11036") ? "" : (stryCov_9fa48("11036"), 'Failed to register service'),
  CACHE_UNAVAILABLE_LEADER: stryMutAct_9fa48("11037") ? "" : (stryCov_9fa48("11037"), 'System table cache not available for leader lookup'),
  CACHE_UNAVAILABLE_GROUPS: stryMutAct_9fa48("11038") ? "" : (stryCov_9fa48("11038"), 'System table cache not available for message group lookup'),
  CACHE_UNAVAILABLE_PARTITIONS: stryMutAct_9fa48("11039") ? "" : (stryCov_9fa48("11039"), 'System table cache not available for partition leader lookup'),
  JOIN_ASSIGNMENT: stryMutAct_9fa48("11040") ? `` : (stryCov_9fa48("11040"), `${BOOTSTRAP_LOG_PREFIX.JOIN_DEBUG} Determining message group assignment`),
  JOIN_MOVABLE_REPLICA: stryMutAct_9fa48("11041") ? `` : (stryCov_9fa48("11041"), `${BOOTSTRAP_LOG_PREFIX.JOIN_DEBUG} Found movable replica - using MOVE_REPLICA strategy`),
  LEADERS_NOT_READY: stryMutAct_9fa48("11042") ? "" : (stryCov_9fa48("11042"), 'Bootstrap blocked - missing raft group leaders'),
  UPDATE_NODE_STATUS_UNSUPPORTED: stryMutAct_9fa48("11043") ? "" : (stryCov_9fa48("11043"), 'updateNodeStatus is not supported - use CDC integration service'),
  SHUTDOWN: stryMutAct_9fa48("11044") ? "" : (stryCov_9fa48("11044"), 'Bootstrap API shutdown'),
  SERVER_CLOSE_ERROR: stryMutAct_9fa48("11045") ? "" : (stryCov_9fa48("11045"), 'Bootstrap server close error'),
  READY_NODES_FOR_BOOTSTRAP: stryMutAct_9fa48("11046") ? "" : (stryCov_9fa48("11046"), 'Ready nodes for bootstrap response'),
  IDEMPOTENT_NODE_REJOIN_ALLOWED: stryMutAct_9fa48("11047") ? "" : (stryCov_9fa48("11047"), 'Allowing idempotent re-registration of node with unchanged address'),
  STALE_NODE_REJOIN_ALLOWED: stryMutAct_9fa48("11048") ? "" : (stryCov_9fa48("11048"), 'Allowing re-registration of dead node'),
  BOOTSTRAP_ADMISSION_DEFERRED: stryMutAct_9fa48("11049") ? "" : (stryCov_9fa48("11049"), 'Deferred bootstrap request due to bounded join admission')
}));
const BOOTSTRAP_API_ERROR = Object.freeze(stryMutAct_9fa48("11050") ? {} : (stryCov_9fa48("11050"), {
  SYSTEM_TABLE_CACHE_REQUIRED: stryMutAct_9fa48("11051") ? "" : (stryCov_9fa48("11051"), 'BootstrapAPI requires systemTableCache'),
  NODE_ID_REQUIRED: stryMutAct_9fa48("11052") ? "" : (stryCov_9fa48("11052"), 'nodeId is required'),
  NODE_ID_INVALID: stryMutAct_9fa48("11053") ? "" : (stryCov_9fa48("11053"), 'nodeId must be a valid UUID'),
  NODE_ADDRESS_REQUIRED: stryMutAct_9fa48("11054") ? "" : (stryCov_9fa48("11054"), 'nodeAddress is required'),
  NODE_ADDRESS_INVALID: stryMutAct_9fa48("11055") ? "" : (stryCov_9fa48("11055"), 'nodeAddress must be a non-empty string'),
  SEED_NODE_ID_CONFLICT: stryMutAct_9fa48("11056") ? "" : (stryCov_9fa48("11056"), 'Cannot bootstrap with seed node ID'),
  SEED_NODE_ADDRESS_CONFLICT: stryMutAct_9fa48("11057") ? "" : (stryCov_9fa48("11057"), 'Cannot use seed node address'),
  NODE_ID_ALREADY_REGISTERED: stryMutAct_9fa48("11058") ? () => undefined : (stryCov_9fa48("11058"), nodeId => stryMutAct_9fa48("11059") ? `` : (stryCov_9fa48("11059"), `Node ID ${nodeId} is already registered`)),
  NODE_ADDRESS_IN_USE: stryMutAct_9fa48("11060") ? () => undefined : (stryCov_9fa48("11060"), nodeAddress => stryMutAct_9fa48("11061") ? `` : (stryCov_9fa48("11061"), `Node address ${nodeAddress} is already in use`)),
  INTERNAL_BOOTSTRAP_ERROR: stryMutAct_9fa48("11062") ? "" : (stryCov_9fa48("11062"), 'Internal server error during bootstrap'),
  BOOTSTRAP_NOT_READY: stryMutAct_9fa48("11063") ? "" : (stryCov_9fa48("11063"), 'Bootstrap not ready'),
  RAFT_LEADERS_NOT_READY: stryMutAct_9fa48("11064") ? "" : (stryCov_9fa48("11064"), 'Bootstrap unavailable until all raft group leaders are elected'),
  REGISTER_NODE_UNSUPPORTED: stryMutAct_9fa48("11065") ? "" : (stryCov_9fa48("11065"), 'register-node is not supported; use WebSocket IDENTIFY + NODE_STATE_UPDATE'),
  SERVICE_ID_REQUIRED: stryMutAct_9fa48("11066") ? "" : (stryCov_9fa48("11066"), 'service_id is required'),
  SERVICE_TYPE_REQUIRED: stryMutAct_9fa48("11067") ? "" : (stryCov_9fa48("11067"), 'service_type is required'),
  SERVICE_NODE_ID_REQUIRED: stryMutAct_9fa48("11068") ? "" : (stryCov_9fa48("11068"), 'node_id is required'),
  SQL_ENGINE_UNAVAILABLE: stryMutAct_9fa48("11069") ? "" : (stryCov_9fa48("11069"), 'SQL query engine not available'),
  SERVICE_REGISTRATION_FAILED: stryMutAct_9fa48("11070") ? "" : (stryCov_9fa48("11070"), 'Failed to register service'),
  ASSIGNMENT_TOKEN_REQUIRED: stryMutAct_9fa48("11071") ? "" : (stryCov_9fa48("11071"), 'assignment_id is required for MOVE_REPLICA register-service'),
  ASSIGNMENT_TOKEN_UNKNOWN: stryMutAct_9fa48("11072") ? "" : (stryCov_9fa48("11072"), 'assignment_id does not reference an active MOVE_REPLICA assignment'),
  ASSIGNMENT_TOKEN_EXPIRED: stryMutAct_9fa48("11073") ? "" : (stryCov_9fa48("11073"), 'assignment_id lease has expired for MOVE_REPLICA handoff'),
  ASSIGNMENT_TOKEN_MISMATCH: stryMutAct_9fa48("11074") ? "" : (stryCov_9fa48("11074"), 'assignment_id does not match requested node_id/replica_id'),
  ASSIGNMENT_TOKEN_LOOKUP_UNAVAILABLE: stryMutAct_9fa48("11075") ? "" : (stryCov_9fa48("11075"), 'assignment_id lookup is temporarily unavailable'),
  REPLICA_OWNER_CONFLICT: stryMutAct_9fa48("11076") ? "" : (stryCov_9fa48("11076"), 'active replica owner conflict for message-group replica'),
  SERVICE_REGISTRATION_CACHE_VISIBILITY_TIMEOUT: stryMutAct_9fa48("11077") ? () => undefined : (stryCov_9fa48("11077"), (serviceId, nodeId, timeoutMs) => (stryMutAct_9fa48("11078") ? `` : (stryCov_9fa48("11078"), `Timed out waiting for services cache visibility for service ${serviceId} `)) + (stryMutAct_9fa48("11079") ? `` : (stryCov_9fa48("11079"), `on node ${nodeId} after ${timeoutMs}ms`))),
  UPDATE_NODE_STATUS_UNSUPPORTED: stryMutAct_9fa48("11080") ? "" : (stryCov_9fa48("11080"), 'updateNodeStatus is not supported; use CDC integration service')
}));
const BOOTSTRAP_API_REGISTER_SERVICE_ERROR_CODE = Object.freeze(stryMutAct_9fa48("11081") ? {} : (stryCov_9fa48("11081"), {
  ASSIGNMENT_TOKEN_REQUIRED: stryMutAct_9fa48("11082") ? "" : (stryCov_9fa48("11082"), 'ASSIGNMENT_TOKEN_REQUIRED'),
  ASSIGNMENT_TOKEN_UNKNOWN: stryMutAct_9fa48("11083") ? "" : (stryCov_9fa48("11083"), 'ASSIGNMENT_TOKEN_UNKNOWN'),
  ASSIGNMENT_TOKEN_EXPIRED: stryMutAct_9fa48("11084") ? "" : (stryCov_9fa48("11084"), 'ASSIGNMENT_TOKEN_EXPIRED'),
  ASSIGNMENT_TOKEN_MISMATCH: stryMutAct_9fa48("11085") ? "" : (stryCov_9fa48("11085"), 'ASSIGNMENT_TOKEN_MISMATCH'),
  ASSIGNMENT_TOKEN_LOOKUP_UNAVAILABLE: stryMutAct_9fa48("11086") ? "" : (stryCov_9fa48("11086"), 'ASSIGNMENT_TOKEN_LOOKUP_UNAVAILABLE'),
  REPLICA_OWNER_CONFLICT: stryMutAct_9fa48("11087") ? "" : (stryCov_9fa48("11087"), 'REPLICA_OWNER_CONFLICT')
}));
const BOOTSTRAP_API_SQL = Object.freeze(stryMutAct_9fa48("11088") ? {} : (stryCov_9fa48("11088"), {
  UPSERT_SERVICE: stryMutAct_9fa48("11089") ? `` : (stryCov_9fa48("11089"), `INSERT OR REPLACE INTO services (
        service_id, service_type, node_id, partition_id, group_id,
        replica_id, raft_role, status, address, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
  INSERT_REPLICA_OPERATION: stryMutAct_9fa48("11090") ? `` : (stryCov_9fa48("11090"), `INSERT INTO replica_operations (
        operation_id, type, partition_id, replica_id, source_node_id, target_node_id,
        status, workflow_step, created_at, updated_at, completed_at, lease_expires_at,
        error_message, steps_history, entity_type, entity_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
  UPDATE_REPLICA_OPERATION: stryMutAct_9fa48("11091") ? `` : (stryCov_9fa48("11091"), `UPDATE replica_operations SET
        status = ?, workflow_step = ?, updated_at = ?, completed_at = ?,
        lease_expires_at = ?, error_message = ?, steps_history = ?
      WHERE operation_id = ?`),
  SELECT_REPLICA_OPERATION_BY_ID: stryMutAct_9fa48("11092") ? `` : (stryCov_9fa48("11092"), `SELECT *
      FROM replica_operations
      WHERE operation_id = ?`),
  SELECT_MOVE_ASSIGNMENT_RESERVATIONS: stryMutAct_9fa48("11093") ? `` : (stryCov_9fa48("11093"), `SELECT *
      FROM replica_operations
      WHERE type = ?`),
  SELECT_REGISTERED_SERVICE_BY_ID: stryMutAct_9fa48("11094") ? `` : (stryCov_9fa48("11094"), `SELECT
        service_id, service_type, node_id, group_id, replica_id,
        raft_role, status, address, created_at, updated_at
      FROM services
      WHERE service_id = ?
      LIMIT 1`)
}));
const BOOTSTRAP_API_HANDOFF_PHASE = Object.freeze(stryMutAct_9fa48("11095") ? {} : (stryCov_9fa48("11095"), {
  PREPARE_TARGET: stryMutAct_9fa48("11096") ? "" : (stryCov_9fa48("11096"), 'prepare_target'),
  VERIFY_TARGET: stryMutAct_9fa48("11097") ? "" : (stryCov_9fa48("11097"), 'verify_target'),
  REMOVE_SOURCE: stryMutAct_9fa48("11098") ? "" : (stryCov_9fa48("11098"), 'remove_source'),
  COMMIT_METADATA: stryMutAct_9fa48("11099") ? "" : (stryCov_9fa48("11099"), 'commit_metadata'),
  FAILED: stryMutAct_9fa48("11100") ? "" : (stryCov_9fa48("11100"), 'failed')
}));
const BOOTSTRAP_API_HANDOFF_STATUS = Object.freeze(stryMutAct_9fa48("11101") ? {} : (stryCov_9fa48("11101"), {
  PREPARING: stryMutAct_9fa48("11102") ? "" : (stryCov_9fa48("11102"), 'creating'),
  VERIFYING: stryMutAct_9fa48("11103") ? "" : (stryCov_9fa48("11103"), 'syncing'),
  REMOVING: stryMutAct_9fa48("11104") ? "" : (stryCov_9fa48("11104"), 'removing'),
  COMMITTED: stryMutAct_9fa48("11105") ? "" : (stryCov_9fa48("11105"), 'active'),
  FAILED: stryMutAct_9fa48("11106") ? "" : (stryCov_9fa48("11106"), 'failed')
}));
const BOOTSTRAP_API_HANDOFF_OPERATION = Object.freeze(stryMutAct_9fa48("11107") ? {} : (stryCov_9fa48("11107"), {
  TYPE: stryMutAct_9fa48("11108") ? "" : (stryCov_9fa48("11108"), 'ADD')
}));
const BOOTSTRAP_API_ASSIGNMENT = Object.freeze(stryMutAct_9fa48("11109") ? {} : (stryCov_9fa48("11109"), {
  FIELD_ID: stryMutAct_9fa48("11110") ? "" : (stryCov_9fa48("11110"), 'assignment_id'),
  OPERATION_TYPE: stryMutAct_9fa48("11111") ? "" : (stryCov_9fa48("11111"), 'MOVE_ASSIGNMENT'),
  ACTIVE_RESERVATION_STATUSES: Object.freeze(stryMutAct_9fa48("11112") ? [] : (stryCov_9fa48("11112"), [stryMutAct_9fa48("11113") ? "" : (stryCov_9fa48("11113"), 'creating'), stryMutAct_9fa48("11114") ? "" : (stryCov_9fa48("11114"), 'syncing'), stryMutAct_9fa48("11115") ? "" : (stryCov_9fa48("11115"), 'removing')])),
  TERMINAL_STATUSES: Object.freeze(stryMutAct_9fa48("11116") ? [] : (stryCov_9fa48("11116"), [stryMutAct_9fa48("11117") ? "" : (stryCov_9fa48("11117"), 'active'), stryMutAct_9fa48("11118") ? "" : (stryCov_9fa48("11118"), 'failed'), stryMutAct_9fa48("11119") ? "" : (stryCov_9fa48("11119"), 'removed')]))
}));
const BOOTSTRAP_API_CLOSE_ERROR_CODE = stryMutAct_9fa48("11120") ? "" : (stryCov_9fa48("11120"), 'ERR_SERVER_NOT_RUNNING');
const BOOTSTRAP_API_CLUSTER_STATE = Object.freeze(stryMutAct_9fa48("11121") ? {} : (stryCov_9fa48("11121"), {
  HEALTHY: BOOTSTRAP_API_HEALTH_STATUS,
  UNKNOWN: STRING.UNKNOWN
}));
const BOOTSTRAP_API_PROBE_SCOPE = Object.freeze(stryMutAct_9fa48("11122") ? {} : (stryCov_9fa48("11122"), {
  BOOTSTRAP_JOIN: stryMutAct_9fa48("11123") ? "" : (stryCov_9fa48("11123"), 'bootstrap_join')
}));
const BOOTSTRAP_API_PROBE_REASON = Object.freeze(stryMutAct_9fa48("11124") ? {} : (stryCov_9fa48("11124"), {
  BOOTSTRAP_PHASE_INCOMPLETE: stryMutAct_9fa48("11125") ? "" : (stryCov_9fa48("11125"), 'BOOTSTRAP_PHASE_INCOMPLETE'),
  JOIN_ADMISSION_BACKPRESSURED: stryMutAct_9fa48("11126") ? "" : (stryCov_9fa48("11126"), 'JOIN_ADMISSION_BACKPRESSURED'),
  MOVE_REPLICA_HANDOFF_STABILIZING: stryMutAct_9fa48("11127") ? "" : (stryCov_9fa48("11127"), 'MOVE_REPLICA_HANDOFF_STABILIZING'),
  CONTROL_PLANE_DEPENDENCY_UNAVAILABLE: stryMutAct_9fa48("11128") ? "" : (stryCov_9fa48("11128"), 'CONTROL_PLANE_DEPENDENCY_UNAVAILABLE')
}));
const BOOTSTRAP_API_LIVENESS = Object.freeze(stryMutAct_9fa48("11129") ? {} : (stryCov_9fa48("11129"), {
  ALIVE: stryMutAct_9fa48("11130") ? false : (stryCov_9fa48("11130"), true),
  STATE_RUNNING: stryMutAct_9fa48("11131") ? "" : (stryCov_9fa48("11131"), 'running')
}));
export { BOOTSTRAP_API_CACHE_VISIBILITY, BOOTSTRAP_API_CLUSTER_STATE, BOOTSTRAP_API_DEFAULT, BOOTSTRAP_API_CLOSE_ERROR_CODE, BOOTSTRAP_API_ERROR, BOOTSTRAP_API_HEALTH_STATUS, BOOTSTRAP_API_HEALTH_STATUS_INITIALIZING, BOOTSTRAP_API_HANDOFF_PHASE, BOOTSTRAP_API_HANDOFF_OPERATION, BOOTSTRAP_API_HANDOFF_STATUS, BOOTSTRAP_API_ASSIGNMENT, BOOTSTRAP_API_LIVENESS, BOOTSTRAP_API_LOG_MSG, BOOTSTRAP_API_MESSAGE_GROUP_PREFIX, BOOTSTRAP_API_PROBE_REASON, BOOTSTRAP_API_PROBE_SCOPE, BOOTSTRAP_API_ROUTE, BOOTSTRAP_API_REGISTER_SERVICE_ERROR_CODE, BOOTSTRAP_API_SQL, BOOTSTRAP_API_SUBSYSTEM };