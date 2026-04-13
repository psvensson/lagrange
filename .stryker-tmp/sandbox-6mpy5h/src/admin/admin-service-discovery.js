/**
 * Service discovery snapshot building for the admin WebSocket API.
 *
 * This module owns all service-discovery readiness evaluation, snapshot
 * construction, and bounded authoritative cache repair. The parent
 * AdminWebSocketAPI instantiates one AdminServiceDiscovery and delegates
 * all discovery-related calls to it.
 *
 * Single-use helpers that exist only for service-discovery logic live here
 * as module-private functions. Shared helpers are imported from
 * admin-helpers.js.
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
import { COLUMN, NUM, TABLES, TYPEOF } from '../constants/index.js';
import { ENDPOINT_SYNC_BOOLEAN, ENDPOINT_SYNC_HEALTH } from '../runtime/endpoint-sync-constants.js';
import { buildServiceDiscoveryCatalog } from '../runtime/service-discovery-catalog.js';
import { isLoadReadyReplicaRaftRole } from '../node/replica-state-machine-constants.js';
import { DEFAULT_STEP_TIMEOUT_MS_BY_WORKFLOW_STEP, isReplicaOperationInFlight, isReplicaOperationStale, isReplicaOperationTerminalSuccess, normalizeReplicaOperationRecord } from '../rebalancer/replica-operation-liveness.js';
import { getSystemCachePrimaryKeyField } from '../cache/system-cache-key-descriptor.js';
import { isTableCdcReadinessRelevant } from '../cache/cdc-table-policy.js';
import { CONTROL_PLANE_READINESS_DIMENSION } from '../control-plane/control-plane-readiness-constants.js';
import { PRESSURE_WORK_CLASS } from '../control-plane/pressure-governor.js';
import { ControlPlaneSystemTableGateway, CONTROL_PLANE_READ_STRATEGY } from '../control-plane/control-plane-system-table-gateway.js';
import { getControlPlaneErrorCode, getControlPlaneErrorMessage, getControlPlaneRetryAfterMs, isRetryableControlPlaneError } from '../control-plane/control-plane-error-classification.js';
import { getRegisteredControlPlaneSystemTableGateway } from '../control-plane/control-plane-gateway-registry.js';
import { AUTHORITATIVE_REPAIR_TRIGGER, DEFAULT_AUTHORITATIVE_REPAIR_TABLES, deriveAuthoritativeRepairTables, evaluateAuthoritativeRepairPolicy } from './admin-authoritative-repair-policy.js';
import { ADMIN_CACHE_DUMP, ADMIN_ERROR_MESSAGE, ADMIN_SERVICE_DISCOVERY } from './admin-constants.js';
import { filterActiveServingPartitionRows, firstStringField, normalizeDiscoveryTableId, normalizeIdentifier, normalizeSchemaVersionValue, normalizeSql, uniqueSorted } from './admin-helpers.js';
import { evaluateSharedMetadataNodeCoverage } from './admin-shared-metadata-consistency.js';
import { shouldAttemptAuthoritativeRepair } from './admin-authoritative-repair-evaluation.js';

// ── file-local constants ────────────────────────────────────────────────────
const ADMIN_SERVICE_DISCOVERY_LITERAL = Object.freeze(stryMutAct_9fa48("4860") ? {} : (stryCov_9fa48("4860"), {
  BOOLEAN: stryMutAct_9fa48("4861") ? "" : (stryCov_9fa48("4861"), 'boolean'),
  READY: stryMutAct_9fa48("4862") ? "" : (stryCov_9fa48("4862"), 'ready'),
  DEFERRED: stryMutAct_9fa48("4863") ? "" : (stryCov_9fa48("4863"), 'deferred'),
  UNKNOWN: stryMutAct_9fa48("4864") ? "" : (stryCov_9fa48("4864"), 'unknown'),
  DISTRIBUTED_PARTICIPANT_FAILURE: stryMutAct_9fa48("4865") ? "" : (stryCov_9fa48("4865"), 'DISTRIBUTED_PARTICIPANT_FAILURE'),
  PARTICIPANT_FAILURES: stryMutAct_9fa48("4866") ? "" : (stryCov_9fa48("4866"), 'participant failures'),
  UNKNOWN_ERROR: stryMutAct_9fa48("4867") ? "" : (stryCov_9fa48("4867"), 'unknown_error'),
  VALUE: stryMutAct_9fa48("4868") ? "Stryker was here!" : (stryCov_9fa48("4868"), ''),
  VALUE_2: 2,
  AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE: stryMutAct_9fa48("4869") ? "" : (stryCov_9fa48("4869"), 'authoritative_row_source_unavailable'),
  ENDPOINT_UNHEALTHY_OR_NODE_NOT_ACTIVE: stryMutAct_9fa48("4870") ? "" : (stryCov_9fa48("4870"), 'endpoint unhealthy or node not ACTIVE'),
  TABLE: stryMutAct_9fa48("4871") ? "" : (stryCov_9fa48("4871"), 'table "'),
  NOT_FOUND: stryMutAct_9fa48("4872") ? "" : (stryCov_9fa48("4872"), '" not found'),
  NOT_QUERY_READY_ON_NODE: stryMutAct_9fa48("4873") ? "" : (stryCov_9fa48("4873"), '" not query-ready on node'),
  LEADER_COVERAGE_INCOMPLETE_FOR_READINESS_SCOPE: stryMutAct_9fa48("4874") ? "" : (stryCov_9fa48("4874"), 'leader coverage incomplete for readiness scope'),
  VALUE_3: stryMutAct_9fa48("4875") ? "" : (stryCov_9fa48("4875"), ','),
  MIXED: stryMutAct_9fa48("4876") ? "" : (stryCov_9fa48("4876"), 'mixed')
}));
const EMPTY_STRING = stryMutAct_9fa48("4877") ? "Stryker was here!" : (stryCov_9fa48("4877"), '');
const LEADER_RAFT_ROLE = stryMutAct_9fa48("4878") ? "" : (stryCov_9fa48("4878"), 'leader');
const SERVICE_TYPE_PARTITION = stryMutAct_9fa48("4879") ? "" : (stryCov_9fa48("4879"), 'partition');
const STATUS_ACTIVE = stryMutAct_9fa48("4880") ? "" : (stryCov_9fa48("4880"), 'active');
const SERVICE_DISCOVERY_REASON_DETAIL_SEPARATOR = stryMutAct_9fa48("4881") ? "" : (stryCov_9fa48("4881"), ':');
const AUTHORITATIVE_REPAIR_CAUSE = Object.freeze(stryMutAct_9fa48("4882") ? {} : (stryCov_9fa48("4882"), {
  QUERY_PARTICIPANT_FAILURE: stryMutAct_9fa48("4883") ? "" : (stryCov_9fa48("4883"), 'query_participant_failure'),
  QUERY_TIMEOUT: stryMutAct_9fa48("4884") ? "" : (stryCov_9fa48("4884"), 'query_timeout'),
  CONTROL_PLANE_BACKPRESSURE: stryMutAct_9fa48("4885") ? "" : (stryCov_9fa48("4885"), 'control_plane_backpressure'),
  LEADER_RESOLUTION_GAP: stryMutAct_9fa48("4886") ? "" : (stryCov_9fa48("4886"), 'leader_resolution_gap'),
  REPLAY_BACKLOG: stryMutAct_9fa48("4887") ? "" : (stryCov_9fa48("4887"), 'replay_backlog')
}));
const AUTHORITATIVE_DISCOVERY_REPAIR_REASON_CONTROL_SNAPSHOT = stryMutAct_9fa48("4888") ? "" : (stryCov_9fa48("4888"), 'control_snapshot');
function markDiscoveryLocalPartitionCdcDiagnosticsMissing(state, partitionId) {
  if (stryMutAct_9fa48("4889")) {
    {}
  } else {
    stryCov_9fa48("4889");
    state.ready = stryMutAct_9fa48("4890") ? true : (stryCov_9fa48("4890"), false);
    state.diagnosticsAvailable = stryMutAct_9fa48("4891") ? true : (stryCov_9fa48("4891"), false);
    state.missingDiagnosticsPartitionIds.push(partitionId);
  }
}
function markDiscoveryLocalPartitionCdcNoSubscriber(state, partitionId) {
  if (stryMutAct_9fa48("4892")) {
    {}
  } else {
    stryCov_9fa48("4892");
    state.ready = stryMutAct_9fa48("4893") ? true : (stryCov_9fa48("4893"), false);
    state.noSubscriberPartitionIds.push(partitionId);
  }
}
function markDiscoveryLocalPartitionCdcBuffered(state, partitionId) {
  if (stryMutAct_9fa48("4894")) {
    {}
  } else {
    stryCov_9fa48("4894");
    state.ready = stryMutAct_9fa48("4895") ? true : (stryCov_9fa48("4895"), false);
    state.bufferedPartitionIds.push(partitionId);
  }
}
const SERVICE_DISCOVERY_READINESS_REASON = Object.freeze(stryMutAct_9fa48("4896") ? {} : (stryCov_9fa48("4896"), {
  ROUTING_NOT_READY: stryMutAct_9fa48("4897") ? "" : (stryCov_9fa48("4897"), 'routing_not_ready'),
  SCHEMA_TABLE_MISSING: stryMutAct_9fa48("4898") ? "" : (stryCov_9fa48("4898"), 'schema_table_missing'),
  SCHEMA_PARTITION_UNAVAILABLE: stryMutAct_9fa48("4899") ? "" : (stryCov_9fa48("4899"), 'schema_partition_unavailable'),
  REPLICA_OPERATIONS_IN_FLIGHT: stryMutAct_9fa48("4900") ? "" : (stryCov_9fa48("4900"), 'replica_operations_in_flight'),
  REPLICA_OPERATION_IN_FLIGHT: stryMutAct_9fa48("4901") ? "" : (stryCov_9fa48("4901"), 'replica_operation_in_flight'),
  REPLICA_OPERATION_FAILED: stryMutAct_9fa48("4902") ? "" : (stryCov_9fa48("4902"), 'replica_operation_failed'),
  REPLICA_OPERATION_STALE_TIMEOUT: stryMutAct_9fa48("4903") ? "" : (stryCov_9fa48("4903"), 'replica_operation_stale_timeout'),
  LEADERSHIP_UNSTABLE: stryMutAct_9fa48("4904") ? "" : (stryCov_9fa48("4904"), 'leadership_unstable'),
  LOCAL_REPLICA_NOT_VOTER_READY: stryMutAct_9fa48("4905") ? "" : (stryCov_9fa48("4905"), 'local_replica_not_voter_ready'),
  LOCAL_CDC_DIAGNOSTICS_UNAVAILABLE: stryMutAct_9fa48("4906") ? "" : (stryCov_9fa48("4906"), 'local_cdc_diagnostics_unavailable'),
  LOCAL_CDC_SUBSCRIBER_MISSING: stryMutAct_9fa48("4907") ? "" : (stryCov_9fa48("4907"), 'local_cdc_subscriber_missing'),
  LOCAL_CDC_BUFFER_NOT_DRAINED: stryMutAct_9fa48("4908") ? "" : (stryCov_9fa48("4908"), 'local_cdc_buffer_not_drained')
}));
const BENCHMARK_ADMISSION_STATE = Object.freeze(stryMutAct_9fa48("4909") ? {} : (stryCov_9fa48("4909"), {
  READY: stryMutAct_9fa48("4910") ? "" : (stryCov_9fa48("4910"), 'ready'),
  BLOCKED: stryMutAct_9fa48("4911") ? "" : (stryCov_9fa48("4911"), 'blocked')
}));
const BENCHMARK_DEGRADATION_STATE = Object.freeze(stryMutAct_9fa48("4912") ? {} : (stryCov_9fa48("4912"), {
  HEALTHY: stryMutAct_9fa48("4913") ? "" : (stryCov_9fa48("4913"), 'healthy'),
  MOVE_PENDING: stryMutAct_9fa48("4914") ? "" : (stryCov_9fa48("4914"), 'move_pending'),
  MOVE_FAILED: stryMutAct_9fa48("4915") ? "" : (stryCov_9fa48("4915"), 'move_failed'),
  PROMOTION_PENDING: stryMutAct_9fa48("4916") ? "" : (stryCov_9fa48("4916"), 'promotion_pending'),
  PROMOTION_FAILED: stryMutAct_9fa48("4917") ? "" : (stryCov_9fa48("4917"), 'promotion_failed'),
  DRAIN_BLOCKED: stryMutAct_9fa48("4918") ? "" : (stryCov_9fa48("4918"), 'drain_blocked')
}));
const BENCHMARK_DEGRADATION_PRIORITY = Object.freeze(stryMutAct_9fa48("4919") ? {} : (stryCov_9fa48("4919"), {
  [BENCHMARK_DEGRADATION_STATE.HEALTHY]: NUM.ZERO,
  [BENCHMARK_DEGRADATION_STATE.PROMOTION_PENDING]: NUM.ONE,
  [BENCHMARK_DEGRADATION_STATE.MOVE_PENDING]: NUM.TWO,
  [BENCHMARK_DEGRADATION_STATE.DRAIN_BLOCKED]: NUM.THREE,
  [BENCHMARK_DEGRADATION_STATE.PROMOTION_FAILED]: NUM.FOUR,
  [BENCHMARK_DEGRADATION_STATE.MOVE_FAILED]: NUM.FIVE
}));
const REPLICA_OPERATION_TYPE = Object.freeze(stryMutAct_9fa48("4920") ? {} : (stryCov_9fa48("4920"), {
  ADD: stryMutAct_9fa48("4921") ? "" : (stryCov_9fa48("4921"), 'ADD'),
  REMOVE: stryMutAct_9fa48("4922") ? "" : (stryCov_9fa48("4922"), 'REMOVE'),
  REPLACE: stryMutAct_9fa48("4923") ? "" : (stryCov_9fa48("4923"), 'REPLACE')
}));
const SERVICE_DISCOVERY_SCHEMA_VERSION_FIELD_CANDIDATES = Object.freeze(stryMutAct_9fa48("4924") ? [] : (stryCov_9fa48("4924"), [stryMutAct_9fa48("4925") ? "" : (stryCov_9fa48("4925"), 'updated_at_hlc'), stryMutAct_9fa48("4926") ? "" : (stryCov_9fa48("4926"), 'updatedAtHlc'), stryMutAct_9fa48("4927") ? "" : (stryCov_9fa48("4927"), 'schema_version'), stryMutAct_9fa48("4928") ? "" : (stryCov_9fa48("4928"), 'schemaVersion'), stryMutAct_9fa48("4929") ? "" : (stryCov_9fa48("4929"), 'updated_at'), stryMutAct_9fa48("4930") ? "" : (stryCov_9fa48("4930"), 'updatedAt'), stryMutAct_9fa48("4931") ? "" : (stryCov_9fa48("4931"), 'created_at'), stryMutAct_9fa48("4932") ? "" : (stryCov_9fa48("4932"), 'createdAt')]));
const AUTHORITATIVE_REPAIR_COOLDOWN_MS = 1000;
const AUTHORITATIVE_REPAIR_QUERY_TIMEOUT_MS = 1500;
const AUTHORITATIVE_REPAIR_STALE_THRESHOLD_MS = 5000;
const AUTHORITATIVE_REPAIR_TIMEOUT_FRAGMENT = stryMutAct_9fa48("4933") ? "" : (stryCov_9fa48("4933"), 'timeout');
const AUTHORITATIVE_REPAIR_LEADER_GAP_FRAGMENTS = Object.freeze(stryMutAct_9fa48("4934") ? [] : (stryCov_9fa48("4934"), [stryMutAct_9fa48("4935") ? "" : (stryCov_9fa48("4935"), 'leader is unknown'), stryMutAct_9fa48("4936") ? "" : (stryCov_9fa48("4936"), 'leader unknown'), stryMutAct_9fa48("4937") ? "" : (stryCov_9fa48("4937"), 'no handler'), stryMutAct_9fa48("4938") ? "" : (stryCov_9fa48("4938"), 'no leader'), stryMutAct_9fa48("4939") ? "" : (stryCov_9fa48("4939"), 'partition_service_not_found'), stryMutAct_9fa48("4940") ? "" : (stryCov_9fa48("4940"), 'partition service not found')]));
const AUTHORITATIVE_REPAIR_REPLAY_BACKLOG_FRAGMENTS = Object.freeze(stryMutAct_9fa48("4941") ? [] : (stryCov_9fa48("4941"), [stryMutAct_9fa48("4942") ? "" : (stryCov_9fa48("4942"), 'buffered cdc replay'), stryMutAct_9fa48("4943") ? "" : (stryCov_9fa48("4943"), 'replay backlog'), stryMutAct_9fa48("4944") ? "" : (stryCov_9fa48("4944"), 'replay buffer'), stryMutAct_9fa48("4945") ? "" : (stryCov_9fa48("4945"), 'buffered backlog')]));
const AUTHORITATIVE_REPAIR_REUSE_WINDOW_MS = AUTHORITATIVE_REPAIR_STALE_THRESHOLD_MS;
const AUTHORITATIVE_DISCOVERY_REPAIR = Object.freeze(stryMutAct_9fa48("4946") ? {} : (stryCov_9fa48("4946"), {
  COOLDOWN_MS: AUTHORITATIVE_REPAIR_COOLDOWN_MS,
  QUERY_TIMEOUT_MS: AUTHORITATIVE_REPAIR_QUERY_TIMEOUT_MS,
  STALE_THRESHOLD_MS: AUTHORITATIVE_REPAIR_STALE_THRESHOLD_MS,
  REUSE_WINDOW_MS: AUTHORITATIVE_REPAIR_REUSE_WINDOW_MS,
  TABLES: DEFAULT_AUTHORITATIVE_REPAIR_TABLES
}));
const AUTHORITATIVE_DISCOVERY_CACHE_GAP_REASON_CODES = new Set(stryMutAct_9fa48("4947") ? [] : (stryCov_9fa48("4947"), [SERVICE_DISCOVERY_READINESS_REASON.SCHEMA_TABLE_MISSING, SERVICE_DISCOVERY_READINESS_REASON.SCHEMA_PARTITION_UNAVAILABLE, SERVICE_DISCOVERY_READINESS_REASON.LEADERSHIP_UNSTABLE]));
const SERVICE_DISCOVERY_SQL_WITH_TABLE_PATTERN = stryMutAct_9fa48("4956") ? /^select \* from service_discovery_local\(\s*'([a-z_][a-z0-9_]*)'\S*\)$/ : stryMutAct_9fa48("4955") ? /^select \* from service_discovery_local\(\s*'([a-z_][a-z0-9_]*)'\s\)$/ : stryMutAct_9fa48("4954") ? /^select \* from service_discovery_local\(\s*'([a-z_][^a-z0-9_]*)'\s*\)$/ : stryMutAct_9fa48("4953") ? /^select \* from service_discovery_local\(\s*'([a-z_][a-z0-9_])'\s*\)$/ : stryMutAct_9fa48("4952") ? /^select \* from service_discovery_local\(\s*'([^a-z_][a-z0-9_]*)'\s*\)$/ : stryMutAct_9fa48("4951") ? /^select \* from service_discovery_local\(\S*'([a-z_][a-z0-9_]*)'\s*\)$/ : stryMutAct_9fa48("4950") ? /^select \* from service_discovery_local\(\s'([a-z_][a-z0-9_]*)'\s*\)$/ : stryMutAct_9fa48("4949") ? /^select \* from service_discovery_local\(\s*'([a-z_][a-z0-9_]*)'\s*\)/ : stryMutAct_9fa48("4948") ? /select \* from service_discovery_local\(\s*'([a-z_][a-z0-9_]*)'\s*\)$/ : (stryCov_9fa48("4948", "4949", "4950", "4951", "4952", "4953", "4954", "4955", "4956"), /^select \* from service_discovery_local\(\s*'([a-z_][a-z0-9_]*)'\s*\)$/);
const SERVICE_DISCOVERY_SQL_WITH_TABLE_AND_ID_PATTERN = stryMutAct_9fa48("4971") ? /^select \* from service_discovery_local\(\s*'([a-z_][a-z0-9_]*)'\s*,\s*'([a-z0-9_-]+)'\S*\)$/ : stryMutAct_9fa48("4970") ? /^select \* from service_discovery_local\(\s*'([a-z_][a-z0-9_]*)'\s*,\s*'([a-z0-9_-]+)'\s\)$/ : stryMutAct_9fa48("4969") ? /^select \* from service_discovery_local\(\s*'([a-z_][a-z0-9_]*)'\s*,\s*'([^a-z0-9_-]+)'\s*\)$/ : stryMutAct_9fa48("4968") ? /^select \* from service_discovery_local\(\s*'([a-z_][a-z0-9_]*)'\s*,\s*'([a-z0-9_-])'\s*\)$/ : stryMutAct_9fa48("4967") ? /^select \* from service_discovery_local\(\s*'([a-z_][a-z0-9_]*)'\s*,\S*'([a-z0-9_-]+)'\s*\)$/ : stryMutAct_9fa48("4966") ? /^select \* from service_discovery_local\(\s*'([a-z_][a-z0-9_]*)'\s*,\s'([a-z0-9_-]+)'\s*\)$/ : stryMutAct_9fa48("4965") ? /^select \* from service_discovery_local\(\s*'([a-z_][a-z0-9_]*)'\S*,\s*'([a-z0-9_-]+)'\s*\)$/ : stryMutAct_9fa48("4964") ? /^select \* from service_discovery_local\(\s*'([a-z_][a-z0-9_]*)'\s,\s*'([a-z0-9_-]+)'\s*\)$/ : stryMutAct_9fa48("4963") ? /^select \* from service_discovery_local\(\s*'([a-z_][^a-z0-9_]*)'\s*,\s*'([a-z0-9_-]+)'\s*\)$/ : stryMutAct_9fa48("4962") ? /^select \* from service_discovery_local\(\s*'([a-z_][a-z0-9_])'\s*,\s*'([a-z0-9_-]+)'\s*\)$/ : stryMutAct_9fa48("4961") ? /^select \* from service_discovery_local\(\s*'([^a-z_][a-z0-9_]*)'\s*,\s*'([a-z0-9_-]+)'\s*\)$/ : stryMutAct_9fa48("4960") ? /^select \* from service_discovery_local\(\S*'([a-z_][a-z0-9_]*)'\s*,\s*'([a-z0-9_-]+)'\s*\)$/ : stryMutAct_9fa48("4959") ? /^select \* from service_discovery_local\(\s'([a-z_][a-z0-9_]*)'\s*,\s*'([a-z0-9_-]+)'\s*\)$/ : stryMutAct_9fa48("4958") ? /^select \* from service_discovery_local\(\s*'([a-z_][a-z0-9_]*)'\s*,\s*'([a-z0-9_-]+)'\s*\)/ : stryMutAct_9fa48("4957") ? /select \* from service_discovery_local\(\s*'([a-z_][a-z0-9_]*)'\s*,\s*'([a-z0-9_-]+)'\s*\)$/ : (stryCov_9fa48("4957", "4958", "4959", "4960", "4961", "4962", "4963", "4964", "4965", "4966", "4967", "4968", "4969", "4970", "4971"), /^select \* from service_discovery_local\(\s*'([a-z_][a-z0-9_]*)'\s*,\s*'([a-z0-9_-]+)'\s*\)$/); // ── single-use helper functions ─────────────────────────────────────────────
/**
 * Compare two schema version values numerically or lexicographically.
 * @param {string} left
 * @param {string} right
 * @return {number}
 */
function compareSchemaVersionValues(left, right) {
  if (stryMutAct_9fa48("4972")) {
    {}
  } else {
    stryCov_9fa48("4972");
    if (stryMutAct_9fa48("4975") ? left !== right : stryMutAct_9fa48("4974") ? false : stryMutAct_9fa48("4973") ? true : (stryCov_9fa48("4973", "4974", "4975"), left === right)) {
      if (stryMutAct_9fa48("4976")) {
        {}
      } else {
        stryCov_9fa48("4976");
        return NUM.ZERO;
      }
    }
    const leftNumber = Number(left);
    const rightNumber = Number(right);
    if (stryMutAct_9fa48("4979") ? Number.isFinite(leftNumber) || Number.isFinite(rightNumber) : stryMutAct_9fa48("4978") ? false : stryMutAct_9fa48("4977") ? true : (stryCov_9fa48("4977", "4978", "4979"), Number.isFinite(leftNumber) && Number.isFinite(rightNumber))) {
      if (stryMutAct_9fa48("4980")) {
        {}
      } else {
        stryCov_9fa48("4980");
        return stryMutAct_9fa48("4981") ? leftNumber + rightNumber : (stryCov_9fa48("4981"), leftNumber - rightNumber);
      }
    }
    return String(left).localeCompare(String(right));
  }
}
function pushUniqueCause(causeChain, cause) {
  if (stryMutAct_9fa48("4982")) {
    {}
  } else {
    stryCov_9fa48("4982");
    if (stryMutAct_9fa48("4985") ? typeof cause !== TYPEOF.STRING && cause.length === NUM.ZERO : stryMutAct_9fa48("4984") ? false : stryMutAct_9fa48("4983") ? true : (stryCov_9fa48("4983", "4984", "4985"), (stryMutAct_9fa48("4987") ? typeof cause === TYPEOF.STRING : stryMutAct_9fa48("4986") ? false : (stryCov_9fa48("4986", "4987"), typeof cause !== TYPEOF.STRING)) || (stryMutAct_9fa48("4989") ? cause.length !== NUM.ZERO : stryMutAct_9fa48("4988") ? false : (stryCov_9fa48("4988", "4989"), cause.length === NUM.ZERO)))) {
      if (stryMutAct_9fa48("4990")) {
        {}
      } else {
        stryCov_9fa48("4990");
        return;
      }
    }
    if (stryMutAct_9fa48("4993") ? false : stryMutAct_9fa48("4992") ? true : stryMutAct_9fa48("4991") ? causeChain.includes(cause) : (stryCov_9fa48("4991", "4992", "4993"), !causeChain.includes(cause))) {
      if (stryMutAct_9fa48("4994")) {
        {}
      } else {
        stryCov_9fa48("4994");
        causeChain.push(cause);
      }
    }
  }
}
function normalizeFirstFailedParticipant(participant, tableName = null) {
  if (stryMutAct_9fa48("4995")) {
    {}
  } else {
    stryCov_9fa48("4995");
    if (stryMutAct_9fa48("4998") ? !participant && typeof participant !== TYPEOF.OBJECT : stryMutAct_9fa48("4997") ? false : stryMutAct_9fa48("4996") ? true : (stryCov_9fa48("4996", "4997", "4998"), (stryMutAct_9fa48("4999") ? participant : (stryCov_9fa48("4999"), !participant)) || (stryMutAct_9fa48("5001") ? typeof participant === TYPEOF.OBJECT : stryMutAct_9fa48("5000") ? false : (stryCov_9fa48("5000", "5001"), typeof participant !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("5002")) {
        {}
      } else {
        stryCov_9fa48("5002");
        return null;
      }
    }
    return stryMutAct_9fa48("5003") ? {} : (stryCov_9fa48("5003"), {
      partitionId: (stryMutAct_9fa48("5006") ? typeof participant.partitionId !== TYPEOF.STRING : stryMutAct_9fa48("5005") ? false : stryMutAct_9fa48("5004") ? true : (stryCov_9fa48("5004", "5005", "5006"), typeof participant.partitionId === TYPEOF.STRING)) ? participant.partitionId : null,
      participantNodeId: (stryMutAct_9fa48("5009") ? typeof participant.participantNodeId !== TYPEOF.STRING : stryMutAct_9fa48("5008") ? false : stryMutAct_9fa48("5007") ? true : (stryCov_9fa48("5007", "5008", "5009"), typeof participant.participantNodeId === TYPEOF.STRING)) ? participant.participantNodeId : null,
      participantAddress: (stryMutAct_9fa48("5012") ? typeof participant.participantAddress !== TYPEOF.STRING : stryMutAct_9fa48("5011") ? false : stryMutAct_9fa48("5010") ? true : (stryCov_9fa48("5010", "5011", "5012"), typeof participant.participantAddress === TYPEOF.STRING)) ? participant.participantAddress : null,
      errorCode: stryMutAct_9fa48("5015") ? getControlPlaneErrorCode(participant) && null : stryMutAct_9fa48("5014") ? false : stryMutAct_9fa48("5013") ? true : (stryCov_9fa48("5013", "5014", "5015"), getControlPlaneErrorCode(participant) || null),
      error: stryMutAct_9fa48("5018") ? getControlPlaneErrorMessage(participant) && null : stryMutAct_9fa48("5017") ? false : stryMutAct_9fa48("5016") ? true : (stryCov_9fa48("5016", "5017", "5018"), getControlPlaneErrorMessage(participant) || null),
      durationMs: Number.isFinite(participant.durationMs) ? stryMutAct_9fa48("5019") ? Math.min(NUM.ZERO, Math.floor(participant.durationMs)) : (stryCov_9fa48("5019"), Math.max(NUM.ZERO, Math.floor(participant.durationMs))) : null,
      retryAfterMs: stryMutAct_9fa48("5022") ? getControlPlaneRetryAfterMs(participant) && null : stryMutAct_9fa48("5021") ? false : stryMutAct_9fa48("5020") ? true : (stryCov_9fa48("5020", "5021", "5022"), getControlPlaneRetryAfterMs(participant) || null),
      backpressured: (stryMutAct_9fa48("5025") ? typeof participant.backpressured !== ADMIN_SERVICE_DISCOVERY_LITERAL.BOOLEAN : stryMutAct_9fa48("5024") ? false : stryMutAct_9fa48("5023") ? true : (stryCov_9fa48("5023", "5024", "5025"), typeof participant.backpressured === ADMIN_SERVICE_DISCOVERY_LITERAL.BOOLEAN)) ? participant.backpressured : isRetryableControlPlaneError(participant),
      failedTable: (stryMutAct_9fa48("5028") ? typeof participant.failedTable !== TYPEOF.STRING : stryMutAct_9fa48("5027") ? false : stryMutAct_9fa48("5026") ? true : (stryCov_9fa48("5026", "5027", "5028"), typeof participant.failedTable === TYPEOF.STRING)) ? participant.failedTable : tableName
    });
  }
}
function normalizeLocalQueryTransportDiagnostic(localQueryTransport) {
  if (stryMutAct_9fa48("5029")) {
    {}
  } else {
    stryCov_9fa48("5029");
    if (stryMutAct_9fa48("5032") ? !localQueryTransport && typeof localQueryTransport !== TYPEOF.OBJECT : stryMutAct_9fa48("5031") ? false : stryMutAct_9fa48("5030") ? true : (stryCov_9fa48("5030", "5031", "5032"), (stryMutAct_9fa48("5033") ? localQueryTransport : (stryCov_9fa48("5033"), !localQueryTransport)) || (stryMutAct_9fa48("5035") ? typeof localQueryTransport === TYPEOF.OBJECT : stryMutAct_9fa48("5034") ? false : (stryCov_9fa48("5034", "5035"), typeof localQueryTransport !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("5036")) {
        {}
      } else {
        stryCov_9fa48("5036");
        return null;
      }
    }
    const ready = (stryMutAct_9fa48("5039") ? typeof localQueryTransport.ready !== 'boolean' : stryMutAct_9fa48("5038") ? false : stryMutAct_9fa48("5037") ? true : (stryCov_9fa48("5037", "5038", "5039"), typeof localQueryTransport.ready === (stryMutAct_9fa48("5040") ? "" : (stryCov_9fa48("5040"), 'boolean')))) ? localQueryTransport.ready : null;
    return stryMutAct_9fa48("5041") ? {} : (stryCov_9fa48("5041"), {
      state: (stryMutAct_9fa48("5044") ? typeof localQueryTransport.state === TYPEOF.STRING || localQueryTransport.state.length > NUM.ZERO : stryMutAct_9fa48("5043") ? false : stryMutAct_9fa48("5042") ? true : (stryCov_9fa48("5042", "5043", "5044"), (stryMutAct_9fa48("5046") ? typeof localQueryTransport.state !== TYPEOF.STRING : stryMutAct_9fa48("5045") ? true : (stryCov_9fa48("5045", "5046"), typeof localQueryTransport.state === TYPEOF.STRING)) && (stryMutAct_9fa48("5049") ? localQueryTransport.state.length <= NUM.ZERO : stryMutAct_9fa48("5048") ? localQueryTransport.state.length >= NUM.ZERO : stryMutAct_9fa48("5047") ? true : (stryCov_9fa48("5047", "5048", "5049"), localQueryTransport.state.length > NUM.ZERO)))) ? localQueryTransport.state : (stryMutAct_9fa48("5052") ? ready !== true : stryMutAct_9fa48("5051") ? false : stryMutAct_9fa48("5050") ? true : (stryCov_9fa48("5050", "5051", "5052"), ready === (stryMutAct_9fa48("5053") ? false : (stryCov_9fa48("5053"), true)))) ? ADMIN_SERVICE_DISCOVERY_LITERAL.READY : (stryMutAct_9fa48("5056") ? ready !== false : stryMutAct_9fa48("5055") ? false : stryMutAct_9fa48("5054") ? true : (stryCov_9fa48("5054", "5055", "5056"), ready === (stryMutAct_9fa48("5057") ? true : (stryCov_9fa48("5057"), false)))) ? ADMIN_SERVICE_DISCOVERY_LITERAL.DEFERRED : ADMIN_SERVICE_DISCOVERY_LITERAL.UNKNOWN,
      ready,
      reason: (stryMutAct_9fa48("5060") ? typeof localQueryTransport.reason === TYPEOF.STRING || localQueryTransport.reason.length > NUM.ZERO : stryMutAct_9fa48("5059") ? false : stryMutAct_9fa48("5058") ? true : (stryCov_9fa48("5058", "5059", "5060"), (stryMutAct_9fa48("5062") ? typeof localQueryTransport.reason !== TYPEOF.STRING : stryMutAct_9fa48("5061") ? true : (stryCov_9fa48("5061", "5062"), typeof localQueryTransport.reason === TYPEOF.STRING)) && (stryMutAct_9fa48("5065") ? localQueryTransport.reason.length <= NUM.ZERO : stryMutAct_9fa48("5064") ? localQueryTransport.reason.length >= NUM.ZERO : stryMutAct_9fa48("5063") ? true : (stryCov_9fa48("5063", "5064", "5065"), localQueryTransport.reason.length > NUM.ZERO)))) ? localQueryTransport.reason : null,
      retryAfterMs: stryMutAct_9fa48("5068") ? getControlPlaneRetryAfterMs(localQueryTransport) && null : stryMutAct_9fa48("5067") ? false : stryMutAct_9fa48("5066") ? true : (stryCov_9fa48("5066", "5067", "5068"), getControlPlaneRetryAfterMs(localQueryTransport) || null)
    });
  }
}
function deriveAuthoritativeRepairCauseChain(error, firstFailedParticipant) {
  if (stryMutAct_9fa48("5069")) {
    {}
  } else {
    stryCov_9fa48("5069");
    const causeChain = stryMutAct_9fa48("5070") ? ["Stryker was here"] : (stryCov_9fa48("5070"), []);
    const errorCode = getControlPlaneErrorCode(error);
    const errorMessage = stryMutAct_9fa48("5071") ? getControlPlaneErrorMessage(error).toUpperCase() : (stryCov_9fa48("5071"), getControlPlaneErrorMessage(error).toLowerCase());
    const participantMessage = stryMutAct_9fa48("5072") ? getControlPlaneErrorMessage(firstFailedParticipant).toUpperCase() : (stryCov_9fa48("5072"), getControlPlaneErrorMessage(firstFailedParticipant).toLowerCase());
    if (stryMutAct_9fa48("5075") ? (errorCode === ADMIN_SERVICE_DISCOVERY_LITERAL.DISTRIBUTED_PARTICIPANT_FAILURE || Array.isArray(error?.participantFailures) && error.participantFailures.length > NUM.ZERO) && errorMessage.includes(ADMIN_SERVICE_DISCOVERY_LITERAL.PARTICIPANT_FAILURES) : stryMutAct_9fa48("5074") ? false : stryMutAct_9fa48("5073") ? true : (stryCov_9fa48("5073", "5074", "5075"), (stryMutAct_9fa48("5077") ? errorCode === ADMIN_SERVICE_DISCOVERY_LITERAL.DISTRIBUTED_PARTICIPANT_FAILURE && Array.isArray(error?.participantFailures) && error.participantFailures.length > NUM.ZERO : stryMutAct_9fa48("5076") ? false : (stryCov_9fa48("5076", "5077"), (stryMutAct_9fa48("5079") ? errorCode !== ADMIN_SERVICE_DISCOVERY_LITERAL.DISTRIBUTED_PARTICIPANT_FAILURE : stryMutAct_9fa48("5078") ? false : (stryCov_9fa48("5078", "5079"), errorCode === ADMIN_SERVICE_DISCOVERY_LITERAL.DISTRIBUTED_PARTICIPANT_FAILURE)) || (stryMutAct_9fa48("5081") ? Array.isArray(error?.participantFailures) || error.participantFailures.length > NUM.ZERO : stryMutAct_9fa48("5080") ? false : (stryCov_9fa48("5080", "5081"), Array.isArray(stryMutAct_9fa48("5082") ? error.participantFailures : (stryCov_9fa48("5082"), error?.participantFailures)) && (stryMutAct_9fa48("5085") ? error.participantFailures.length <= NUM.ZERO : stryMutAct_9fa48("5084") ? error.participantFailures.length >= NUM.ZERO : stryMutAct_9fa48("5083") ? true : (stryCov_9fa48("5083", "5084", "5085"), error.participantFailures.length > NUM.ZERO)))))) || errorMessage.includes(ADMIN_SERVICE_DISCOVERY_LITERAL.PARTICIPANT_FAILURES))) {
      if (stryMutAct_9fa48("5086")) {
        {}
      } else {
        stryCov_9fa48("5086");
        pushUniqueCause(causeChain, AUTHORITATIVE_REPAIR_CAUSE.QUERY_PARTICIPANT_FAILURE);
      }
    }
    if (stryMutAct_9fa48("5089") ? errorMessage.includes(AUTHORITATIVE_REPAIR_TIMEOUT_FRAGMENT) && participantMessage.includes(AUTHORITATIVE_REPAIR_TIMEOUT_FRAGMENT) : stryMutAct_9fa48("5088") ? false : stryMutAct_9fa48("5087") ? true : (stryCov_9fa48("5087", "5088", "5089"), errorMessage.includes(AUTHORITATIVE_REPAIR_TIMEOUT_FRAGMENT) || participantMessage.includes(AUTHORITATIVE_REPAIR_TIMEOUT_FRAGMENT))) {
      if (stryMutAct_9fa48("5090")) {
        {}
      } else {
        stryCov_9fa48("5090");
        pushUniqueCause(causeChain, AUTHORITATIVE_REPAIR_CAUSE.QUERY_TIMEOUT);
      }
    }
    if (stryMutAct_9fa48("5093") ? isRetryableControlPlaneError(error) && isRetryableControlPlaneError(firstFailedParticipant) : stryMutAct_9fa48("5092") ? false : stryMutAct_9fa48("5091") ? true : (stryCov_9fa48("5091", "5092", "5093"), isRetryableControlPlaneError(error) || isRetryableControlPlaneError(firstFailedParticipant))) {
      if (stryMutAct_9fa48("5094")) {
        {}
      } else {
        stryCov_9fa48("5094");
        pushUniqueCause(causeChain, AUTHORITATIVE_REPAIR_CAUSE.CONTROL_PLANE_BACKPRESSURE);
      }
    }
    if (stryMutAct_9fa48("5097") ? AUTHORITATIVE_REPAIR_LEADER_GAP_FRAGMENTS.every(fragment => errorMessage.includes(fragment) || participantMessage.includes(fragment)) : stryMutAct_9fa48("5096") ? false : stryMutAct_9fa48("5095") ? true : (stryCov_9fa48("5095", "5096", "5097"), AUTHORITATIVE_REPAIR_LEADER_GAP_FRAGMENTS.some(stryMutAct_9fa48("5098") ? () => undefined : (stryCov_9fa48("5098"), fragment => stryMutAct_9fa48("5101") ? errorMessage.includes(fragment) && participantMessage.includes(fragment) : stryMutAct_9fa48("5100") ? false : stryMutAct_9fa48("5099") ? true : (stryCov_9fa48("5099", "5100", "5101"), errorMessage.includes(fragment) || participantMessage.includes(fragment)))))) {
      if (stryMutAct_9fa48("5102")) {
        {}
      } else {
        stryCov_9fa48("5102");
        pushUniqueCause(causeChain, AUTHORITATIVE_REPAIR_CAUSE.LEADER_RESOLUTION_GAP);
      }
    }
    if (stryMutAct_9fa48("5105") ? AUTHORITATIVE_REPAIR_REPLAY_BACKLOG_FRAGMENTS.every(fragment => errorMessage.includes(fragment) || participantMessage.includes(fragment)) : stryMutAct_9fa48("5104") ? false : stryMutAct_9fa48("5103") ? true : (stryCov_9fa48("5103", "5104", "5105"), AUTHORITATIVE_REPAIR_REPLAY_BACKLOG_FRAGMENTS.some(stryMutAct_9fa48("5106") ? () => undefined : (stryCov_9fa48("5106"), fragment => stryMutAct_9fa48("5109") ? errorMessage.includes(fragment) && participantMessage.includes(fragment) : stryMutAct_9fa48("5108") ? false : stryMutAct_9fa48("5107") ? true : (stryCov_9fa48("5107", "5108", "5109"), errorMessage.includes(fragment) || participantMessage.includes(fragment)))))) {
      if (stryMutAct_9fa48("5110")) {
        {}
      } else {
        stryCov_9fa48("5110");
        pushUniqueCause(causeChain, AUTHORITATIVE_REPAIR_CAUSE.REPLAY_BACKLOG);
      }
    }
    return causeChain;
  }
}
function summarizeAuthoritativeRepairError(tableName, error) {
  if (stryMutAct_9fa48("5111")) {
    {}
  } else {
    stryCov_9fa48("5111");
    const firstFailedParticipant = normalizeFirstFailedParticipant(stryMutAct_9fa48("5114") ? error?.firstFailedParticipant && (Array.isArray(error?.participantFailures) ? error.participantFailures[NUM.ZERO] : null) : stryMutAct_9fa48("5113") ? false : stryMutAct_9fa48("5112") ? true : (stryCov_9fa48("5112", "5113", "5114"), (stryMutAct_9fa48("5115") ? error.firstFailedParticipant : (stryCov_9fa48("5115"), error?.firstFailedParticipant)) || (Array.isArray(stryMutAct_9fa48("5116") ? error.participantFailures : (stryCov_9fa48("5116"), error?.participantFailures)) ? error.participantFailures[NUM.ZERO] : null)), tableName);
    return stryMutAct_9fa48("5117") ? {} : (stryCov_9fa48("5117"), {
      tableName,
      error: stryMutAct_9fa48("5120") ? getControlPlaneErrorMessage(error) && ADMIN_SERVICE_DISCOVERY_LITERAL.UNKNOWN_ERROR : stryMutAct_9fa48("5119") ? false : stryMutAct_9fa48("5118") ? true : (stryCov_9fa48("5118", "5119", "5120"), getControlPlaneErrorMessage(error) || ADMIN_SERVICE_DISCOVERY_LITERAL.UNKNOWN_ERROR),
      errorCode: stryMutAct_9fa48("5123") ? getControlPlaneErrorCode(error) && null : stryMutAct_9fa48("5122") ? false : stryMutAct_9fa48("5121") ? true : (stryCov_9fa48("5121", "5122", "5123"), getControlPlaneErrorCode(error) || null),
      retryAfterMs: stryMutAct_9fa48("5126") ? getControlPlaneRetryAfterMs(error) && null : stryMutAct_9fa48("5125") ? false : stryMutAct_9fa48("5124") ? true : (stryCov_9fa48("5124", "5125", "5126"), getControlPlaneRetryAfterMs(error) || null),
      readSource: (stryMutAct_9fa48("5129") ? typeof error?.readSource !== TYPEOF.STRING : stryMutAct_9fa48("5128") ? false : stryMutAct_9fa48("5127") ? true : (stryCov_9fa48("5127", "5128", "5129"), typeof (stryMutAct_9fa48("5130") ? error.readSource : (stryCov_9fa48("5130"), error?.readSource)) === TYPEOF.STRING)) ? error.readSource : null,
      localQueryTransport: normalizeLocalQueryTransportDiagnostic(stryMutAct_9fa48("5131") ? error.localQueryTransport : (stryCov_9fa48("5131"), error?.localQueryTransport)),
      firstFailedParticipant,
      causeChain: deriveAuthoritativeRepairCauseChain(error, firstFailedParticipant)
    });
  }
}
function shouldAbortAuthoritativeRepairTableReads(errorSummary = null) {
  if (stryMutAct_9fa48("5132")) {
    {}
  } else {
    stryCov_9fa48("5132");
    const causeChain = Array.isArray(stryMutAct_9fa48("5133") ? errorSummary.causeChain : (stryCov_9fa48("5133"), errorSummary?.causeChain)) ? stryMutAct_9fa48("5134") ? errorSummary.causeChain : (stryCov_9fa48("5134"), errorSummary.causeChain.filter(stryMutAct_9fa48("5135") ? () => undefined : (stryCov_9fa48("5135"), value => stryMutAct_9fa48("5138") ? typeof value === TYPEOF.STRING || value.length > NUM.ZERO : stryMutAct_9fa48("5137") ? false : stryMutAct_9fa48("5136") ? true : (stryCov_9fa48("5136", "5137", "5138"), (stryMutAct_9fa48("5140") ? typeof value !== TYPEOF.STRING : stryMutAct_9fa48("5139") ? true : (stryCov_9fa48("5139", "5140"), typeof value === TYPEOF.STRING)) && (stryMutAct_9fa48("5143") ? value.length <= NUM.ZERO : stryMutAct_9fa48("5142") ? value.length >= NUM.ZERO : stryMutAct_9fa48("5141") ? true : (stryCov_9fa48("5141", "5142", "5143"), value.length > NUM.ZERO)))))) : ADMIN_CACHE_DUMP.EMPTY;
    return stryMutAct_9fa48("5146") ? causeChain.includes(AUTHORITATIVE_REPAIR_CAUSE.QUERY_TIMEOUT) && causeChain.includes(AUTHORITATIVE_REPAIR_CAUSE.CONTROL_PLANE_BACKPRESSURE) : stryMutAct_9fa48("5145") ? false : stryMutAct_9fa48("5144") ? true : (stryCov_9fa48("5144", "5145", "5146"), causeChain.includes(AUTHORITATIVE_REPAIR_CAUSE.QUERY_TIMEOUT) || causeChain.includes(AUTHORITATIVE_REPAIR_CAUSE.CONTROL_PLANE_BACKPRESSURE));
  }
} /**
  * Determine whether a service row represents an active voter-ready replica.
  * @param {Object} serviceRow
  * @return {boolean}
  */
function isActiveVoterReadyPartitionReplica(serviceRow) {
  if (stryMutAct_9fa48("5147")) {
    {}
  } else {
    stryCov_9fa48("5147");
    if (stryMutAct_9fa48("5150") ? !serviceRow && typeof serviceRow !== TYPEOF.OBJECT : stryMutAct_9fa48("5149") ? false : stryMutAct_9fa48("5148") ? true : (stryCov_9fa48("5148", "5149", "5150"), (stryMutAct_9fa48("5151") ? serviceRow : (stryCov_9fa48("5151"), !serviceRow)) || (stryMutAct_9fa48("5153") ? typeof serviceRow === TYPEOF.OBJECT : stryMutAct_9fa48("5152") ? false : (stryCov_9fa48("5152", "5153"), typeof serviceRow !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("5154")) {
        {}
      } else {
        stryCov_9fa48("5154");
        return stryMutAct_9fa48("5155") ? true : (stryCov_9fa48("5155"), false);
      }
    }
    const serviceType = firstStringField(serviceRow, COLUMN.SERVICE_TYPE, stryMutAct_9fa48("5156") ? "" : (stryCov_9fa48("5156"), 'service_type'), stryMutAct_9fa48("5157") ? "" : (stryCov_9fa48("5157"), 'serviceType'), stryMutAct_9fa48("5158") ? "" : (stryCov_9fa48("5158"), 'type'));
    if (stryMutAct_9fa48("5161") ? serviceType === SERVICE_TYPE_PARTITION : stryMutAct_9fa48("5160") ? false : stryMutAct_9fa48("5159") ? true : (stryCov_9fa48("5159", "5160", "5161"), serviceType !== SERVICE_TYPE_PARTITION)) {
      if (stryMutAct_9fa48("5162")) {
        {}
      } else {
        stryCov_9fa48("5162");
        return stryMutAct_9fa48("5163") ? true : (stryCov_9fa48("5163"), false);
      }
    }
    const status = firstStringField(serviceRow, COLUMN.STATUS, stryMutAct_9fa48("5164") ? "" : (stryCov_9fa48("5164"), 'status'));
    if (stryMutAct_9fa48("5167") ? String(status || ADMIN_SERVICE_DISCOVERY_LITERAL.VALUE).toLowerCase() === STATUS_ACTIVE : stryMutAct_9fa48("5166") ? false : stryMutAct_9fa48("5165") ? true : (stryCov_9fa48("5165", "5166", "5167"), (stryMutAct_9fa48("5168") ? String(status || ADMIN_SERVICE_DISCOVERY_LITERAL.VALUE).toUpperCase() : (stryCov_9fa48("5168"), String(stryMutAct_9fa48("5171") ? status && ADMIN_SERVICE_DISCOVERY_LITERAL.VALUE : stryMutAct_9fa48("5170") ? false : stryMutAct_9fa48("5169") ? true : (stryCov_9fa48("5169", "5170", "5171"), status || ADMIN_SERVICE_DISCOVERY_LITERAL.VALUE)).toLowerCase())) !== STATUS_ACTIVE)) {
      if (stryMutAct_9fa48("5172")) {
        {}
      } else {
        stryCov_9fa48("5172");
        return stryMutAct_9fa48("5173") ? true : (stryCov_9fa48("5173"), false);
      }
    }
    const raftRole = firstStringField(serviceRow, COLUMN.RAFT_ROLE, stryMutAct_9fa48("5174") ? "" : (stryCov_9fa48("5174"), 'raft_role'), stryMutAct_9fa48("5175") ? "" : (stryCov_9fa48("5175"), 'raftRole'));
    if (stryMutAct_9fa48("5178") ? false : stryMutAct_9fa48("5177") ? true : stryMutAct_9fa48("5176") ? isLoadReadyReplicaRaftRole(raftRole) : (stryCov_9fa48("5176", "5177", "5178"), !isLoadReadyReplicaRaftRole(raftRole))) {
      if (stryMutAct_9fa48("5179")) {
        {}
      } else {
        stryCov_9fa48("5179");
        return stryMutAct_9fa48("5180") ? true : (stryCov_9fa48("5180"), false);
      }
    }
    const address = firstStringField(serviceRow, COLUMN.ADDRESS, stryMutAct_9fa48("5181") ? "" : (stryCov_9fa48("5181"), 'address'));
    return Boolean(address);
  }
} /**
  * Select the newest of two schema version values.
  * @param {string|null} current
  * @param {string|null} candidate
  * @return {string|null}
  */
function selectNewestSchemaVersion(current, candidate) {
  if (stryMutAct_9fa48("5182")) {
    {}
  } else {
    stryCov_9fa48("5182");
    if (stryMutAct_9fa48("5185") ? false : stryMutAct_9fa48("5184") ? true : stryMutAct_9fa48("5183") ? candidate : (stryCov_9fa48("5183", "5184", "5185"), !candidate)) {
      if (stryMutAct_9fa48("5186")) {
        {}
      } else {
        stryCov_9fa48("5186");
        return current;
      }
    }
    if (stryMutAct_9fa48("5189") ? false : stryMutAct_9fa48("5188") ? true : stryMutAct_9fa48("5187") ? current : (stryCov_9fa48("5187", "5188", "5189"), !current)) {
      if (stryMutAct_9fa48("5190")) {
        {}
      } else {
        stryCov_9fa48("5190");
        return candidate;
      }
    }
    return (stryMutAct_9fa48("5194") ? compareSchemaVersionValues(candidate, current) < NUM.ZERO : stryMutAct_9fa48("5193") ? compareSchemaVersionValues(candidate, current) > NUM.ZERO : stryMutAct_9fa48("5192") ? false : stryMutAct_9fa48("5191") ? true : (stryCov_9fa48("5191", "5192", "5193", "5194"), compareSchemaVersionValues(candidate, current) >= NUM.ZERO)) ? candidate : current;
  }
} /**
  * Extract the best schema version value from a record.
  * @param {Object} record
  * @return {string|null}
  */
function extractSchemaVersionFromRecord(record) {
  if (stryMutAct_9fa48("5195")) {
    {}
  } else {
    stryCov_9fa48("5195");
    if (stryMutAct_9fa48("5198") ? !record && typeof record !== TYPEOF.OBJECT : stryMutAct_9fa48("5197") ? false : stryMutAct_9fa48("5196") ? true : (stryCov_9fa48("5196", "5197", "5198"), (stryMutAct_9fa48("5199") ? record : (stryCov_9fa48("5199"), !record)) || (stryMutAct_9fa48("5201") ? typeof record === TYPEOF.OBJECT : stryMutAct_9fa48("5200") ? false : (stryCov_9fa48("5200", "5201"), typeof record !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("5202")) {
        {}
      } else {
        stryCov_9fa48("5202");
        return null;
      }
    }
    for (const fieldName of SERVICE_DISCOVERY_SCHEMA_VERSION_FIELD_CANDIDATES) {
      if (stryMutAct_9fa48("5203")) {
        {}
      } else {
        stryCov_9fa48("5203");
        const normalized = normalizeSchemaVersionValue(record[fieldName]);
        if (stryMutAct_9fa48("5205") ? false : stryMutAct_9fa48("5204") ? true : (stryCov_9fa48("5204", "5205"), normalized)) {
          if (stryMutAct_9fa48("5206")) {
            {}
          } else {
            stryCov_9fa48("5206");
            return normalized;
          }
        }
      }
    }
    return null;
  }
} /**
  * Parse one comma-separated query parameter into sorted unique values.
  * @param {*} rawValue
  * @return {Array<string>}
  */
function parseDiscoveryListQuery(rawValue) {
  if (stryMutAct_9fa48("5207")) {
    {}
  } else {
    stryCov_9fa48("5207");
    const values = stryMutAct_9fa48("5208") ? ["Stryker was here"] : (stryCov_9fa48("5208"), []);
    const collectValues = inputValue => {
      if (stryMutAct_9fa48("5209")) {
        {}
      } else {
        stryCov_9fa48("5209");
        if (stryMutAct_9fa48("5211") ? false : stryMutAct_9fa48("5210") ? true : (stryCov_9fa48("5210", "5211"), Array.isArray(inputValue))) {
          if (stryMutAct_9fa48("5212")) {
            {}
          } else {
            stryCov_9fa48("5212");
            for (const item of inputValue) {
              if (stryMutAct_9fa48("5213")) {
                {}
              } else {
                stryCov_9fa48("5213");
                collectValues(item);
              }
            }
            return;
          }
        }
        if (stryMutAct_9fa48("5216") ? typeof inputValue === TYPEOF.STRING : stryMutAct_9fa48("5215") ? false : stryMutAct_9fa48("5214") ? true : (stryCov_9fa48("5214", "5215", "5216"), typeof inputValue !== TYPEOF.STRING)) {
          if (stryMutAct_9fa48("5217")) {
            {}
          } else {
            stryCov_9fa48("5217");
            return;
          }
        }
        for (const value of inputValue.split(stryMutAct_9fa48("5218") ? "" : (stryCov_9fa48("5218"), ','))) {
          if (stryMutAct_9fa48("5219")) {
            {}
          } else {
            stryCov_9fa48("5219");
            const trimmedValue = stryMutAct_9fa48("5220") ? value : (stryCov_9fa48("5220"), value.trim());
            if (stryMutAct_9fa48("5224") ? trimmedValue.length <= NUM.ZERO : stryMutAct_9fa48("5223") ? trimmedValue.length >= NUM.ZERO : stryMutAct_9fa48("5222") ? false : stryMutAct_9fa48("5221") ? true : (stryCov_9fa48("5221", "5222", "5223", "5224"), trimmedValue.length > NUM.ZERO)) {
              if (stryMutAct_9fa48("5225")) {
                {}
              } else {
                stryCov_9fa48("5225");
                values.push(trimmedValue);
              }
            }
          }
        }
      }
    };
    collectValues(rawValue);
    return uniqueSorted(values);
  }
} /**
  * Parse optional boolean query value with fallback.
  * @param {*} rawValue
  * @param {boolean} fallback
  * @return {boolean}
  */
function parseDiscoveryBooleanQuery(rawValue, fallback) {
  if (stryMutAct_9fa48("5226")) {
    {}
  } else {
    stryCov_9fa48("5226");
    if (stryMutAct_9fa48("5229") ? typeof rawValue !== TYPEOF.BOOLEAN : stryMutAct_9fa48("5228") ? false : stryMutAct_9fa48("5227") ? true : (stryCov_9fa48("5227", "5228", "5229"), typeof rawValue === TYPEOF.BOOLEAN)) {
      if (stryMutAct_9fa48("5230")) {
        {}
      } else {
        stryCov_9fa48("5230");
        return rawValue;
      }
    }
    if (stryMutAct_9fa48("5233") ? typeof rawValue === TYPEOF.STRING : stryMutAct_9fa48("5232") ? false : stryMutAct_9fa48("5231") ? true : (stryCov_9fa48("5231", "5232", "5233"), typeof rawValue !== TYPEOF.STRING)) {
      if (stryMutAct_9fa48("5234")) {
        {}
      } else {
        stryCov_9fa48("5234");
        return fallback;
      }
    }
    const normalizedValue = stryMutAct_9fa48("5236") ? rawValue.toLowerCase() : stryMutAct_9fa48("5235") ? rawValue.trim().toUpperCase() : (stryCov_9fa48("5235", "5236"), rawValue.trim().toLowerCase());
    if (stryMutAct_9fa48("5239") ? normalizedValue === ENDPOINT_SYNC_BOOLEAN.TRUE && normalizedValue === ENDPOINT_SYNC_BOOLEAN.ONE : stryMutAct_9fa48("5238") ? false : stryMutAct_9fa48("5237") ? true : (stryCov_9fa48("5237", "5238", "5239"), (stryMutAct_9fa48("5241") ? normalizedValue !== ENDPOINT_SYNC_BOOLEAN.TRUE : stryMutAct_9fa48("5240") ? false : (stryCov_9fa48("5240", "5241"), normalizedValue === ENDPOINT_SYNC_BOOLEAN.TRUE)) || (stryMutAct_9fa48("5243") ? normalizedValue !== ENDPOINT_SYNC_BOOLEAN.ONE : stryMutAct_9fa48("5242") ? false : (stryCov_9fa48("5242", "5243"), normalizedValue === ENDPOINT_SYNC_BOOLEAN.ONE)))) {
      if (stryMutAct_9fa48("5244")) {
        {}
      } else {
        stryCov_9fa48("5244");
        return stryMutAct_9fa48("5245") ? false : (stryCov_9fa48("5245"), true);
      }
    }
    if (stryMutAct_9fa48("5248") ? normalizedValue === ENDPOINT_SYNC_BOOLEAN.FALSE && normalizedValue === ENDPOINT_SYNC_BOOLEAN.ZERO : stryMutAct_9fa48("5247") ? false : stryMutAct_9fa48("5246") ? true : (stryCov_9fa48("5246", "5247", "5248"), (stryMutAct_9fa48("5250") ? normalizedValue !== ENDPOINT_SYNC_BOOLEAN.FALSE : stryMutAct_9fa48("5249") ? false : (stryCov_9fa48("5249", "5250"), normalizedValue === ENDPOINT_SYNC_BOOLEAN.FALSE)) || (stryMutAct_9fa48("5252") ? normalizedValue !== ENDPOINT_SYNC_BOOLEAN.ZERO : stryMutAct_9fa48("5251") ? false : (stryCov_9fa48("5251", "5252"), normalizedValue === ENDPOINT_SYNC_BOOLEAN.ZERO)))) {
      if (stryMutAct_9fa48("5253")) {
        {}
      } else {
        stryCov_9fa48("5253");
        return stryMutAct_9fa48("5254") ? true : (stryCov_9fa48("5254"), false);
      }
    }
    return fallback;
  }
} /**
  * Parse local service-discovery SQL with optional tableName/tableId args.
  * @param {string} sql
  * @return {{isQuery: boolean, tableName: (string|null), tableId: (string|null)}}
  */
function parseServiceDiscoverySqlQuery(sql) {
  if (stryMutAct_9fa48("5255")) {
    {}
  } else {
    stryCov_9fa48("5255");
    const normalizedSql = normalizeSql(sql);
    if (stryMutAct_9fa48("5258") ? normalizedSql !== normalizeSql(ADMIN_SERVICE_DISCOVERY.QUERY_SQL) : stryMutAct_9fa48("5257") ? false : stryMutAct_9fa48("5256") ? true : (stryCov_9fa48("5256", "5257", "5258"), normalizedSql === normalizeSql(ADMIN_SERVICE_DISCOVERY.QUERY_SQL))) {
      if (stryMutAct_9fa48("5259")) {
        {}
      } else {
        stryCov_9fa48("5259");
        return stryMutAct_9fa48("5260") ? {} : (stryCov_9fa48("5260"), {
          isQuery: stryMutAct_9fa48("5261") ? false : (stryCov_9fa48("5261"), true),
          tableName: null,
          tableId: null
        });
      }
    }
    const tableAndIdMatch = normalizedSql.match(SERVICE_DISCOVERY_SQL_WITH_TABLE_AND_ID_PATTERN);
    if (stryMutAct_9fa48("5263") ? false : stryMutAct_9fa48("5262") ? true : (stryCov_9fa48("5262", "5263"), tableAndIdMatch)) {
      if (stryMutAct_9fa48("5264")) {
        {}
      } else {
        stryCov_9fa48("5264");
        return stryMutAct_9fa48("5265") ? {} : (stryCov_9fa48("5265"), {
          isQuery: stryMutAct_9fa48("5266") ? false : (stryCov_9fa48("5266"), true),
          tableName: normalizeIdentifier(tableAndIdMatch[NUM.ONE]),
          tableId: normalizeDiscoveryTableId(tableAndIdMatch[ADMIN_SERVICE_DISCOVERY_LITERAL.VALUE_2])
        });
      }
    }
    const match = normalizedSql.match(SERVICE_DISCOVERY_SQL_WITH_TABLE_PATTERN);
    if (stryMutAct_9fa48("5269") ? false : stryMutAct_9fa48("5268") ? true : stryMutAct_9fa48("5267") ? match : (stryCov_9fa48("5267", "5268", "5269"), !match)) {
      if (stryMutAct_9fa48("5270")) {
        {}
      } else {
        stryCov_9fa48("5270");
        return stryMutAct_9fa48("5271") ? {} : (stryCov_9fa48("5271"), {
          isQuery: stryMutAct_9fa48("5272") ? true : (stryCov_9fa48("5272"), false),
          tableName: null,
          tableId: null
        });
      }
    }
    return stryMutAct_9fa48("5273") ? {} : (stryCov_9fa48("5273"), {
      isQuery: stryMutAct_9fa48("5274") ? false : (stryCov_9fa48("5274"), true),
      tableName: normalizeIdentifier(match[NUM.ONE]),
      tableId: null
    });
  }
} // ── AdminServiceDiscovery class ─────────────────────────────────────────────
/**
 * Service discovery snapshot builder.
 *
 * Receives all required dependencies via constructor injection.
 * Cross-module callbacks (preflight freshness, control-snapshot replica
 * operations, SQL execution) are injected as functions so this module
 * has no back-reference to AdminWebSocketAPI.
 */
class AdminServiceDiscovery {
  /**
  * @param {Object} deps
  * @param {Object} deps.systemTableCache
  * @param {string} deps.nodeId
  * @param {Object} deps.logger
  * @param {Object|null} deps.cacheMutationTarget
  * @param {Function|null} deps.partitionServicesProvider
  * @param {Map|null} deps.partitionServices
  * @param {Function} deps.buildPreflightCacheFreshnessSummary
  * @param {Function} deps.buildControlSnapshotReplicaOperationSummary
  */
  constructor(deps = {}) {
    if (stryMutAct_9fa48("5275")) {
      {}
    } else {
      stryCov_9fa48("5275");
      this.systemTableCache = stryMutAct_9fa48("5278") ? deps.systemTableCache && null : stryMutAct_9fa48("5277") ? false : stryMutAct_9fa48("5276") ? true : (stryCov_9fa48("5276", "5277", "5278"), deps.systemTableCache || null);
      this.nodeId = stryMutAct_9fa48("5281") ? deps.nodeId && null : stryMutAct_9fa48("5280") ? false : stryMutAct_9fa48("5279") ? true : (stryCov_9fa48("5279", "5280", "5281"), deps.nodeId || null);
      this.logger = stryMutAct_9fa48("5284") ? deps.logger && null : stryMutAct_9fa48("5283") ? false : stryMutAct_9fa48("5282") ? true : (stryCov_9fa48("5282", "5283", "5284"), deps.logger || null);
      this.sqlQueryEngine = stryMutAct_9fa48("5287") ? deps.sqlQueryEngine && null : stryMutAct_9fa48("5286") ? false : stryMutAct_9fa48("5285") ? true : (stryCov_9fa48("5285", "5286", "5287"), deps.sqlQueryEngine || null);
      this.cacheMutationTarget = stryMutAct_9fa48("5290") ? deps.cacheMutationTarget && null : stryMutAct_9fa48("5289") ? false : stryMutAct_9fa48("5288") ? true : (stryCov_9fa48("5288", "5289", "5290"), deps.cacheMutationTarget || null);
      this.partitionServicesProvider = (stryMutAct_9fa48("5293") ? typeof deps.partitionServicesProvider !== TYPEOF.FUNCTION : stryMutAct_9fa48("5292") ? false : stryMutAct_9fa48("5291") ? true : (stryCov_9fa48("5291", "5292", "5293"), typeof deps.partitionServicesProvider === TYPEOF.FUNCTION)) ? deps.partitionServicesProvider : null;
      this.partitionServices = deps.partitionServices instanceof Map ? deps.partitionServices : null;
      this.controlPlaneSystemTableGateway = stryMutAct_9fa48("5296") ? (deps.controlPlaneSystemTableGateway || getRegisteredControlPlaneSystemTableGateway()) && null : stryMutAct_9fa48("5295") ? false : stryMutAct_9fa48("5294") ? true : (stryCov_9fa48("5294", "5295", "5296"), (stryMutAct_9fa48("5298") ? deps.controlPlaneSystemTableGateway && getRegisteredControlPlaneSystemTableGateway() : stryMutAct_9fa48("5297") ? false : (stryCov_9fa48("5297", "5298"), deps.controlPlaneSystemTableGateway || getRegisteredControlPlaneSystemTableGateway())) || null);
      this.buildPreflightCacheFreshnessSummary = (stryMutAct_9fa48("5301") ? typeof deps.buildPreflightCacheFreshnessSummary !== TYPEOF.FUNCTION : stryMutAct_9fa48("5300") ? false : stryMutAct_9fa48("5299") ? true : (stryCov_9fa48("5299", "5300", "5301"), typeof deps.buildPreflightCacheFreshnessSummary === TYPEOF.FUNCTION)) ? deps.buildPreflightCacheFreshnessSummary : null;
      this.buildControlSnapshotReplicaOperationSummary = (stryMutAct_9fa48("5304") ? typeof deps.buildControlSnapshotReplicaOperationSummary !== TYPEOF.FUNCTION : stryMutAct_9fa48("5303") ? false : stryMutAct_9fa48("5302") ? true : (stryCov_9fa48("5302", "5303", "5304"), typeof deps.buildControlSnapshotReplicaOperationSummary === TYPEOF.FUNCTION)) ? deps.buildControlSnapshotReplicaOperationSummary : null;
      this.nowFn = (stryMutAct_9fa48("5307") ? typeof deps.nowFn !== TYPEOF.FUNCTION : stryMutAct_9fa48("5306") ? false : stryMutAct_9fa48("5305") ? true : (stryCov_9fa48("5305", "5306", "5307"), typeof deps.nowFn === TYPEOF.FUNCTION)) ? deps.nowFn : stryMutAct_9fa48("5308") ? () => undefined : (stryCov_9fa48("5308"), () => Date.now());
      this.authoritativeDiscoveryRepairPromise = null;
      this.lastAuthoritativeDiscoveryRepairAtMs = NUM.ZERO;
      this.lastAuthoritativeDiscoveryRepairCompletedAtMs = NUM.ZERO;
      this.lastAuthoritativeDiscoveryRepairResult = null;
    }
  } /**
    * Build local service-discovery snapshot from system cache only.
    * @param {Object} [options={}]
    * @return {Object}
    */
  buildLocalServiceDiscoverySnapshot(options = {}) {
    if (stryMutAct_9fa48("5309")) {
      {}
    } else {
      stryCov_9fa48("5309");
      if (stryMutAct_9fa48("5312") ? !this.systemTableCache && typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("5311") ? false : stryMutAct_9fa48("5310") ? true : (stryCov_9fa48("5310", "5311", "5312"), (stryMutAct_9fa48("5313") ? this.systemTableCache : (stryCov_9fa48("5313"), !this.systemTableCache)) || (stryMutAct_9fa48("5315") ? typeof this.systemTableCache.getAll === TYPEOF.FUNCTION : stryMutAct_9fa48("5314") ? false : (stryCov_9fa48("5314", "5315"), typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("5316")) {
          {}
        } else {
          stryCov_9fa48("5316");
          throw new Error(ADMIN_ERROR_MESSAGE.SERVICE_DISCOVERY_UNAVAILABLE);
        }
      }
      const endpointRows = this.systemTableCache.getAll(TABLES.SERVICE_ENDPOINTS);
      const definitionRows = this.systemTableCache.getAll(TABLES.SERVICE_DEFINITIONS);
      const readinessContext = this.buildServiceDiscoveryReadinessContext(options);
      const discoveredServices = buildServiceDiscoveryCatalog(endpointRows, stryMutAct_9fa48("5317") ? {} : (stryCov_9fa48("5317"), {
        protocolAllowlist: stryMutAct_9fa48("5320") ? options.protocolAllowlist && ADMIN_CACHE_DUMP.EMPTY : stryMutAct_9fa48("5319") ? false : stryMutAct_9fa48("5318") ? true : (stryCov_9fa48("5318", "5319", "5320"), options.protocolAllowlist || ADMIN_CACHE_DUMP.EMPTY),
        serviceIdAllowlist: stryMutAct_9fa48("5323") ? options.serviceIdAllowlist && ADMIN_CACHE_DUMP.EMPTY : stryMutAct_9fa48("5322") ? false : stryMutAct_9fa48("5321") ? true : (stryCov_9fa48("5321", "5322", "5323"), options.serviceIdAllowlist || ADMIN_CACHE_DUMP.EMPTY),
        nodeIdAllowlist: stryMutAct_9fa48("5326") ? options.nodeIdAllowlist && ADMIN_CACHE_DUMP.EMPTY : stryMutAct_9fa48("5325") ? false : stryMutAct_9fa48("5324") ? true : (stryCov_9fa48("5324", "5325", "5326"), options.nodeIdAllowlist || ADMIN_CACHE_DUMP.EMPTY),
        healthyOnly: stryMutAct_9fa48("5329") ? options.healthyOnly !== true : stryMutAct_9fa48("5328") ? false : stryMutAct_9fa48("5327") ? true : (stryCov_9fa48("5327", "5328", "5329"), options.healthyOnly === (stryMutAct_9fa48("5330") ? false : (stryCov_9fa48("5330"), true))),
        unhealthyPolicy: options.unhealthyPolicy,
        definitionRows
      }));
      const services = discoveredServices.map(stryMutAct_9fa48("5331") ? () => undefined : (stryCov_9fa48("5331"), service => stryMutAct_9fa48("5332") ? {} : (stryCov_9fa48("5332"), {
        ...service,
        replicas: service.replicas.map(replica => {
          if (stryMutAct_9fa48("5333")) {
            {}
          } else {
            stryCov_9fa48("5333");
            const readiness = this.buildServiceDiscoveryReplicaReadiness(replica, readinessContext);
            return stryMutAct_9fa48("5334") ? {} : (stryCov_9fa48("5334"), {
              ...replica,
              readiness,
              benchmarkAdmission: this.buildServiceDiscoveryReplicaBenchmarkAdmission(replica, readinessContext, readiness)
            });
          }
        })
      })));
      const replicaCount = services.reduce(stryMutAct_9fa48("5335") ? () => undefined : (stryCov_9fa48("5335"), (count, service) => stryMutAct_9fa48("5336") ? count - service.observedReplicaCount : (stryCov_9fa48("5336"), count + service.observedReplicaCount)), NUM.ZERO);
      return stryMutAct_9fa48("5337") ? {} : (stryCov_9fa48("5337"), {
        schemaVersion: ADMIN_SERVICE_DISCOVERY.SCHEMA_VERSION,
        nodeId: this.nodeId,
        capturedAt: Date.now(),
        serviceCount: services.length,
        replicaCount,
        replicaOperations: (stryMutAct_9fa48("5340") ? readinessContext.replicaOperationSummary || typeof readinessContext.replicaOperationSummary === TYPEOF.OBJECT : stryMutAct_9fa48("5339") ? false : stryMutAct_9fa48("5338") ? true : (stryCov_9fa48("5338", "5339", "5340"), readinessContext.replicaOperationSummary && (stryMutAct_9fa48("5342") ? typeof readinessContext.replicaOperationSummary !== TYPEOF.OBJECT : stryMutAct_9fa48("5341") ? true : (stryCov_9fa48("5341", "5342"), typeof readinessContext.replicaOperationSummary === TYPEOF.OBJECT)))) ? readinessContext.replicaOperationSummary : null,
        services
      });
    }
  } /**
    * Resolve local service discovery snapshot with bounded
    * authoritative repair.
    * @param {Object} [options={}]
    * @return {Promise<Object>}
    */
  async resolveServiceDiscoverySnapshot(options = {}) {
    if (stryMutAct_9fa48("5343")) {
      {}
    } else {
      stryCov_9fa48("5343");
      const snapshot = this.buildLocalServiceDiscoverySnapshot(options);
      const allowAuthoritativeRepair = stryMutAct_9fa48("5346") ? options.allowAuthoritativeRepair !== true : stryMutAct_9fa48("5345") ? false : stryMutAct_9fa48("5344") ? true : (stryCov_9fa48("5344", "5345", "5346"), options.allowAuthoritativeRepair === (stryMutAct_9fa48("5347") ? false : (stryCov_9fa48("5347"), true)));
      const repairEvaluation = this.evaluateAuthoritativeDiscoveryRepair(snapshot, options);
      if (stryMutAct_9fa48("5350") ? false : stryMutAct_9fa48("5349") ? true : stryMutAct_9fa48("5348") ? shouldAttemptAuthoritativeRepair({
        repairEvaluation,
        allowAuthoritativeRepair
      }) : (stryCov_9fa48("5348", "5349", "5350"), !shouldAttemptAuthoritativeRepair(stryMutAct_9fa48("5351") ? {} : (stryCov_9fa48("5351"), {
        repairEvaluation,
        allowAuthoritativeRepair
      })))) {
        if (stryMutAct_9fa48("5352")) {
          {}
        } else {
          stryCov_9fa48("5352");
          return snapshot;
        }
      }
      const repair = await this.ensureAuthoritativeDiscoveryCacheRepair(stryMutAct_9fa48("5353") ? {} : (stryCov_9fa48("5353"), {
        reason: stryMutAct_9fa48("5354") ? "" : (stryCov_9fa48("5354"), 'service_discovery_snapshot'),
        tableName: stryMutAct_9fa48("5357") ? options.tableName && null : stryMutAct_9fa48("5356") ? false : stryMutAct_9fa48("5355") ? true : (stryCov_9fa48("5355", "5356", "5357"), options.tableName || null),
        tableId: stryMutAct_9fa48("5360") ? options.tableId && null : stryMutAct_9fa48("5359") ? false : stryMutAct_9fa48("5358") ? true : (stryCov_9fa48("5358", "5359", "5360"), options.tableId || null),
        triggerCodes: repairEvaluation.triggerCodes
      }));
      if (stryMutAct_9fa48("5363") ? repair.applied === true : stryMutAct_9fa48("5362") ? false : stryMutAct_9fa48("5361") ? true : (stryCov_9fa48("5361", "5362", "5363"), repair.applied !== (stryMutAct_9fa48("5364") ? false : (stryCov_9fa48("5364"), true)))) {
        if (stryMutAct_9fa48("5365")) {
          {}
        } else {
          stryCov_9fa48("5365");
          return snapshot;
        }
      }
      return this.buildLocalServiceDiscoverySnapshot(options);
    }
  } /**
    * Determine whether discovery snapshot warrants authoritative
    * cache repair.
    * @param {Object} snapshot
    * @param {Object} [options={}]
    * @return {boolean}
    */
  evaluateAuthoritativeDiscoveryRepair(snapshot, options = {}) {
    if (stryMutAct_9fa48("5366")) {
      {}
    } else {
      stryCov_9fa48("5366");
      if (stryMutAct_9fa48("5369") ? (!this.systemTableCache || !this.cacheMutationTarget || typeof this.cacheMutationTarget.applySystemTableChange !== TYPEOF.FUNCTION) && !this.canReadAuthoritativeDiscoveryRows() : stryMutAct_9fa48("5368") ? false : stryMutAct_9fa48("5367") ? true : (stryCov_9fa48("5367", "5368", "5369"), (stryMutAct_9fa48("5371") ? (!this.systemTableCache || !this.cacheMutationTarget) && typeof this.cacheMutationTarget.applySystemTableChange !== TYPEOF.FUNCTION : stryMutAct_9fa48("5370") ? false : (stryCov_9fa48("5370", "5371"), (stryMutAct_9fa48("5373") ? !this.systemTableCache && !this.cacheMutationTarget : stryMutAct_9fa48("5372") ? false : (stryCov_9fa48("5372", "5373"), (stryMutAct_9fa48("5374") ? this.systemTableCache : (stryCov_9fa48("5374"), !this.systemTableCache)) || (stryMutAct_9fa48("5375") ? this.cacheMutationTarget : (stryCov_9fa48("5375"), !this.cacheMutationTarget)))) || (stryMutAct_9fa48("5377") ? typeof this.cacheMutationTarget.applySystemTableChange === TYPEOF.FUNCTION : stryMutAct_9fa48("5376") ? false : (stryCov_9fa48("5376", "5377"), typeof this.cacheMutationTarget.applySystemTableChange !== TYPEOF.FUNCTION)))) || (stryMutAct_9fa48("5378") ? this.canReadAuthoritativeDiscoveryRows() : (stryCov_9fa48("5378"), !this.canReadAuthoritativeDiscoveryRows())))) {
        if (stryMutAct_9fa48("5379")) {
          {}
        } else {
          stryCov_9fa48("5379");
          return null;
        }
      }
      if (stryMutAct_9fa48("5382") ? !snapshot && typeof snapshot !== TYPEOF.OBJECT : stryMutAct_9fa48("5381") ? false : stryMutAct_9fa48("5380") ? true : (stryCov_9fa48("5380", "5381", "5382"), (stryMutAct_9fa48("5383") ? snapshot : (stryCov_9fa48("5383"), !snapshot)) || (stryMutAct_9fa48("5385") ? typeof snapshot === TYPEOF.OBJECT : stryMutAct_9fa48("5384") ? false : (stryCov_9fa48("5384", "5385"), typeof snapshot !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("5386")) {
          {}
        } else {
          stryCov_9fa48("5386");
          return null;
        }
      }
      const freshness = this.buildPreflightCacheFreshnessSummary ? this.buildPreflightCacheFreshnessSummary(stryMutAct_9fa48("5387") ? {} : (stryCov_9fa48("5387"), {
        capturedAtMs: Date.now()
      })) : null;
      const stalenessMs = Number(stryMutAct_9fa48("5388") ? freshness.stalenessMs : (stryCov_9fa48("5388"), freshness?.stalenessMs));
      const cacheRepairEligible = stryMutAct_9fa48("5391") ? !Number.isFinite(stalenessMs) && stalenessMs >= AUTHORITATIVE_DISCOVERY_REPAIR.STALE_THRESHOLD_MS : stryMutAct_9fa48("5390") ? false : stryMutAct_9fa48("5389") ? true : (stryCov_9fa48("5389", "5390", "5391"), (stryMutAct_9fa48("5392") ? Number.isFinite(stalenessMs) : (stryCov_9fa48("5392"), !Number.isFinite(stalenessMs))) || (stryMutAct_9fa48("5395") ? stalenessMs < AUTHORITATIVE_DISCOVERY_REPAIR.STALE_THRESHOLD_MS : stryMutAct_9fa48("5394") ? stalenessMs > AUTHORITATIVE_DISCOVERY_REPAIR.STALE_THRESHOLD_MS : stryMutAct_9fa48("5393") ? false : (stryCov_9fa48("5393", "5394", "5395"), stalenessMs >= AUTHORITATIVE_DISCOVERY_REPAIR.STALE_THRESHOLD_MS)));
      const scopedDiscoveryQuery = stryMutAct_9fa48("5398") ? normalizeIdentifier(options.tableName) !== null && normalizeDiscoveryTableId(options.tableId) !== null : stryMutAct_9fa48("5397") ? false : stryMutAct_9fa48("5396") ? true : (stryCov_9fa48("5396", "5397", "5398"), (stryMutAct_9fa48("5400") ? normalizeIdentifier(options.tableName) === null : stryMutAct_9fa48("5399") ? false : (stryCov_9fa48("5399", "5400"), normalizeIdentifier(options.tableName) !== null)) || (stryMutAct_9fa48("5402") ? normalizeDiscoveryTableId(options.tableId) === null : stryMutAct_9fa48("5401") ? false : (stryCov_9fa48("5401", "5402"), normalizeDiscoveryTableId(options.tableId) !== null)));
      const services = Array.isArray(snapshot.services) ? snapshot.services : stryMutAct_9fa48("5403") ? ["Stryker was here"] : (stryCov_9fa48("5403"), []);
      let readyReplicaCount = NUM.ZERO;
      const selectedNodeIds = new Set();
      let hasCacheGapReasons = stryMutAct_9fa48("5404") ? true : (stryCov_9fa48("5404"), false);
      for (const service of services) {
        if (stryMutAct_9fa48("5405")) {
          {}
        } else {
          stryCov_9fa48("5405");
          const replicas = Array.isArray(stryMutAct_9fa48("5406") ? service.replicas : (stryCov_9fa48("5406"), service?.replicas)) ? service.replicas : stryMutAct_9fa48("5407") ? ["Stryker was here"] : (stryCov_9fa48("5407"), []);
          for (const replica of replicas) {
            if (stryMutAct_9fa48("5408")) {
              {}
            } else {
              stryCov_9fa48("5408");
              const nodeId = String(stryMutAct_9fa48("5411") ? replica?.nodeId && EMPTY_STRING : stryMutAct_9fa48("5410") ? false : stryMutAct_9fa48("5409") ? true : (stryCov_9fa48("5409", "5410", "5411"), (stryMutAct_9fa48("5412") ? replica.nodeId : (stryCov_9fa48("5412"), replica?.nodeId)) || EMPTY_STRING));
              const readiness = stryMutAct_9fa48("5415") ? replica?.readiness && null : stryMutAct_9fa48("5414") ? false : stryMutAct_9fa48("5413") ? true : (stryCov_9fa48("5413", "5414", "5415"), (stryMutAct_9fa48("5416") ? replica.readiness : (stryCov_9fa48("5416"), replica?.readiness)) || null);
              if (stryMutAct_9fa48("5419") ? !readiness && typeof readiness !== TYPEOF.OBJECT : stryMutAct_9fa48("5418") ? false : stryMutAct_9fa48("5417") ? true : (stryCov_9fa48("5417", "5418", "5419"), (stryMutAct_9fa48("5420") ? readiness : (stryCov_9fa48("5420"), !readiness)) || (stryMutAct_9fa48("5422") ? typeof readiness === TYPEOF.OBJECT : stryMutAct_9fa48("5421") ? false : (stryCov_9fa48("5421", "5422"), typeof readiness !== TYPEOF.OBJECT)))) {
                if (stryMutAct_9fa48("5423")) {
                  {}
                } else {
                  stryCov_9fa48("5423");
                  continue;
                }
              }
              const reasons = Array.isArray(readiness.reasons) ? readiness.reasons : stryMutAct_9fa48("5424") ? ["Stryker was here"] : (stryCov_9fa48("5424"), []);
              if (stryMutAct_9fa48("5427") ? readiness.benchmarkReady === true && reasons.length === NUM.ZERO : stryMutAct_9fa48("5426") ? false : stryMutAct_9fa48("5425") ? true : (stryCov_9fa48("5425", "5426", "5427"), (stryMutAct_9fa48("5429") ? readiness.benchmarkReady !== true : stryMutAct_9fa48("5428") ? false : (stryCov_9fa48("5428", "5429"), readiness.benchmarkReady === (stryMutAct_9fa48("5430") ? false : (stryCov_9fa48("5430"), true)))) || (stryMutAct_9fa48("5432") ? reasons.length !== NUM.ZERO : stryMutAct_9fa48("5431") ? false : (stryCov_9fa48("5431", "5432"), reasons.length === NUM.ZERO)))) {
                if (stryMutAct_9fa48("5433")) {
                  {}
                } else {
                  stryCov_9fa48("5433");
                  stryMutAct_9fa48("5434") ? readyReplicaCount -= NUM.ONE : (stryCov_9fa48("5434"), readyReplicaCount += NUM.ONE);
                  if (stryMutAct_9fa48("5436") ? false : stryMutAct_9fa48("5435") ? true : (stryCov_9fa48("5435", "5436"), nodeId)) {
                    if (stryMutAct_9fa48("5437")) {
                      {}
                    } else {
                      stryCov_9fa48("5437");
                      selectedNodeIds.add(nodeId);
                    }
                  }
                }
              }
              for (const reason of reasons) {
                if (stryMutAct_9fa48("5438")) {
                  {}
                } else {
                  stryCov_9fa48("5438");
                  const code = String(stryMutAct_9fa48("5441") ? reason?.code && EMPTY_STRING : stryMutAct_9fa48("5440") ? false : stryMutAct_9fa48("5439") ? true : (stryCov_9fa48("5439", "5440", "5441"), (stryMutAct_9fa48("5442") ? reason.code : (stryCov_9fa48("5442"), reason?.code)) || EMPTY_STRING));
                  if (stryMutAct_9fa48("5444") ? false : stryMutAct_9fa48("5443") ? true : (stryCov_9fa48("5443", "5444"), AUTHORITATIVE_DISCOVERY_CACHE_GAP_REASON_CODES.has(code))) {
                    if (stryMutAct_9fa48("5445")) {
                      {}
                    } else {
                      stryCov_9fa48("5445");
                      hasCacheGapReasons = stryMutAct_9fa48("5446") ? false : (stryCov_9fa48("5446"), true);
                    }
                  }
                }
              }
            }
          }
        }
      }
      const serviceEndpointsCount = (stryMutAct_9fa48("5449") ? typeof this.systemTableCache.count !== TYPEOF.FUNCTION : stryMutAct_9fa48("5448") ? false : stryMutAct_9fa48("5447") ? true : (stryCov_9fa48("5447", "5448", "5449"), typeof this.systemTableCache.count === TYPEOF.FUNCTION)) ? this.systemTableCache.count(TABLES.SERVICE_ENDPOINTS) : this.systemTableCache.getAll(TABLES.SERVICE_ENDPOINTS).length;
      const nodeCoverage = evaluateSharedMetadataNodeCoverage(stryMutAct_9fa48("5450") ? {} : (stryCov_9fa48("5450"), {
        nodeRows: this.systemTableCache.getAll(TABLES.NODES),
        serviceRows: this.systemTableCache.getAll(TABLES.SERVICES),
        partitionRows: this.systemTableCache.getAll(TABLES.PARTITIONS),
        nodeEndpointRows: this.systemTableCache.getAll(TABLES.NODE_ENDPOINTS)
      }));
      const staleReplicaOpsInFlightCount = Number(stryMutAct_9fa48("5452") ? snapshot.replicaOperations?.staleInFlightCount : stryMutAct_9fa48("5451") ? snapshot?.replicaOperations.staleInFlightCount : (stryCov_9fa48("5451", "5452"), snapshot?.replicaOperations?.staleInFlightCount));
      const evaluation = evaluateAuthoritativeRepairPolicy(stryMutAct_9fa48("5453") ? {} : (stryCov_9fa48("5453"), {
        cacheStalenessMs: stalenessMs,
        staleThresholdMs: AUTHORITATIVE_DISCOVERY_REPAIR.STALE_THRESHOLD_MS,
        cacheRepairEligible,
        scopedQuery: scopedDiscoveryQuery,
        serviceCount: snapshot.serviceCount,
        replicaCount: snapshot.replicaCount,
        readyReplicaCount,
        selectedNodeCount: selectedNodeIds.size,
        serviceEndpointsCount,
        nodeCoverageGap: nodeCoverage.hasCoverageGap,
        staleReplicaOpsInFlightCount,
        hasCacheGapReasons
      }));
      return evaluation;
    }
  } /**
    * Determine whether discovery snapshot warrants authoritative
    * cache repair.
    * @param {Object} snapshot
    * @param {Object} [options={}]
    * @return {boolean}
    */
  shouldAttemptAuthoritativeDiscoveryRepair(snapshot, options = {}) {
    if (stryMutAct_9fa48("5454")) {
      {}
    } else {
      stryCov_9fa48("5454");
      return stryMutAct_9fa48("5457") ? this.evaluateAuthoritativeDiscoveryRepair(snapshot, options)?.shouldRepair !== true : stryMutAct_9fa48("5456") ? false : stryMutAct_9fa48("5455") ? true : (stryCov_9fa48("5455", "5456", "5457"), (stryMutAct_9fa48("5458") ? this.evaluateAuthoritativeDiscoveryRepair(snapshot, options).shouldRepair : (stryCov_9fa48("5458"), this.evaluateAuthoritativeDiscoveryRepair(snapshot, options)?.shouldRepair)) === (stryMutAct_9fa48("5459") ? false : (stryCov_9fa48("5459"), true)));
    }
  } /**
    * Build per-replica readiness context from local cache state.
    * @param {Object} [options={}]
    * @return {Object}
    */
  buildServiceDiscoveryReadinessContext(options = {}) {
    if (stryMutAct_9fa48("5460")) {
      {}
    } else {
      stryCov_9fa48("5460");
      const tableName = normalizeIdentifier(options.tableName);
      const tableId = normalizeDiscoveryTableId(options.tableId);
      const nodeRows = this.systemTableCache.getAll(TABLES.NODES);
      const serviceRows = this.systemTableCache.getAll(TABLES.SERVICES);
      const partitionRows = this.systemTableCache.getAll(TABLES.PARTITIONS);
      const tableRows = this.systemTableCache.getAll(TABLES.TABLES);
      const replicaOperationRows = this.systemTableCache.getAll(TABLES.REPLICA_OPERATIONS);
      const activeNodeIds = new Set(stryMutAct_9fa48("5461") ? nodeRows.map(row => ({
        nodeId: firstStringField(row, COLUMN.NODE_ID, 'node_id', 'nodeId', 'id'),
        status: firstStringField(row, COLUMN.STATUS, 'status')
      })).map(entry => entry.nodeId) : (stryCov_9fa48("5461"), nodeRows.map(stryMutAct_9fa48("5462") ? () => undefined : (stryCov_9fa48("5462"), row => stryMutAct_9fa48("5463") ? {} : (stryCov_9fa48("5463"), {
        nodeId: firstStringField(row, COLUMN.NODE_ID, stryMutAct_9fa48("5464") ? "" : (stryCov_9fa48("5464"), 'node_id'), stryMutAct_9fa48("5465") ? "" : (stryCov_9fa48("5465"), 'nodeId'), stryMutAct_9fa48("5466") ? "" : (stryCov_9fa48("5466"), 'id')),
        status: firstStringField(row, COLUMN.STATUS, stryMutAct_9fa48("5467") ? "" : (stryCov_9fa48("5467"), 'status'))
      }))).filter(stryMutAct_9fa48("5468") ? () => undefined : (stryCov_9fa48("5468"), entry => stryMutAct_9fa48("5471") ? entry.nodeId || String(entry.status || '').toLowerCase() === STATUS_ACTIVE : stryMutAct_9fa48("5470") ? false : stryMutAct_9fa48("5469") ? true : (stryCov_9fa48("5469", "5470", "5471"), entry.nodeId && (stryMutAct_9fa48("5473") ? String(entry.status || '').toLowerCase() !== STATUS_ACTIVE : stryMutAct_9fa48("5472") ? true : (stryCov_9fa48("5472", "5473"), (stryMutAct_9fa48("5474") ? String(entry.status || '').toUpperCase() : (stryCov_9fa48("5474"), String(stryMutAct_9fa48("5477") ? entry.status && '' : stryMutAct_9fa48("5476") ? false : stryMutAct_9fa48("5475") ? true : (stryCov_9fa48("5475", "5476", "5477"), entry.status || (stryMutAct_9fa48("5478") ? "Stryker was here!" : (stryCov_9fa48("5478"), '')))).toLowerCase())) === STATUS_ACTIVE))))).map(stryMutAct_9fa48("5479") ? () => undefined : (stryCov_9fa48("5479"), entry => entry.nodeId))));
      const tablePartitionContext = this.resolveDiscoveryTablePartitionContext(tableName, tableId, partitionRows, tableRows);
      const schemaReady = this.resolveDiscoverySchemaReady(tablePartitionContext.partitionIds, serviceRows);
      const leadershipStable = this.resolveDiscoveryLeadershipStable(tablePartitionContext.partitionIds, partitionRows, serviceRows);
      const localTargetReplicaStateByNodeId = this.buildDiscoveryLocalTargetReplicaStateByNodeId(tablePartitionContext.partitionIds, serviceRows);
      const localTargetPartitionIds = this.buildDiscoveryLocalTargetPartitionIds(tablePartitionContext.partitionIds, serviceRows);
      const localPartitionCdcState = this.buildDiscoveryLocalPartitionCdcState(stryMutAct_9fa48("5480") ? {} : (stryCov_9fa48("5480"), {
        localTargetPartitionIds,
        tableName,
        cdcReadinessApplies: tablePartitionContext.cdcReadinessApplies
      }));
      const replicaOperationSummary = this.buildControlSnapshotReplicaOperationSummary ? this.buildControlSnapshotReplicaOperationSummary(replicaOperationRows, stryMutAct_9fa48("5481") ? {} : (stryCov_9fa48("5481"), {
        partitionIds: tablePartitionContext.partitionIds,
        serviceRows
      })) : stryMutAct_9fa48("5482") ? {} : (stryCov_9fa48("5482"), {
        inFlightCount: NUM.ZERO,
        staleInFlightCount: NUM.ZERO,
        stepHistogram: {},
        oldestInFlightAgeMs: null,
        operationTimelineById: {}
      });
      const replicaOperationDegradationByNodeId = this.buildDiscoveryReplicaOperationDegradationByNodeId(replicaOperationRows, stryMutAct_9fa48("5483") ? {} : (stryCov_9fa48("5483"), {
        partitionIds: tablePartitionContext.partitionIds,
        serviceRows
      }));
      return stryMutAct_9fa48("5484") ? {} : (stryCov_9fa48("5484"), {
        tableName,
        tableFound: tablePartitionContext.tableFound,
        appliedSchemaVersion: tablePartitionContext.appliedSchemaVersion,
        activeNodeIds,
        schemaReady,
        leadershipStable,
        localTargetReplicaStateByNodeId,
        localPartitionCdcState,
        replicaOpsInFlight: replicaOperationSummary.inFlightCount,
        staleReplicaOpsInFlight: Number(stryMutAct_9fa48("5487") ? replicaOperationSummary.staleInFlightCount && NUM.ZERO : stryMutAct_9fa48("5486") ? false : stryMutAct_9fa48("5485") ? true : (stryCov_9fa48("5485", "5486", "5487"), replicaOperationSummary.staleInFlightCount || NUM.ZERO)),
        oldestReplicaOperationAgeMs: Number.isFinite(replicaOperationSummary.oldestInFlightAgeMs) ? Math.floor(replicaOperationSummary.oldestInFlightAgeMs) : null,
        replicaOperationTimelineById: (stryMutAct_9fa48("5490") ? replicaOperationSummary.operationTimelineById || typeof replicaOperationSummary.operationTimelineById === TYPEOF.OBJECT : stryMutAct_9fa48("5489") ? false : stryMutAct_9fa48("5488") ? true : (stryCov_9fa48("5488", "5489", "5490"), replicaOperationSummary.operationTimelineById && (stryMutAct_9fa48("5492") ? typeof replicaOperationSummary.operationTimelineById !== TYPEOF.OBJECT : stryMutAct_9fa48("5491") ? true : (stryCov_9fa48("5491", "5492"), typeof replicaOperationSummary.operationTimelineById === TYPEOF.OBJECT)))) ? replicaOperationSummary.operationTimelineById : {},
        replicaOperationSummary,
        replicaOperationDegradationByNodeId
      });
    }
  } /**
    * Resolve local active target partition IDs for table-scoped
    * discovery.
    * @param {Set<string>} partitionIds
    * @param {Array<Object>} serviceRows
    * @return {Set<string>}
    */
  buildDiscoveryLocalTargetPartitionIds(partitionIds, serviceRows) {
    if (stryMutAct_9fa48("5493")) {
      {}
    } else {
      stryCov_9fa48("5493");
      const localPartitionIds = new Set();
      if (stryMutAct_9fa48("5496") ? !(partitionIds instanceof Set) && partitionIds.size === NUM.ZERO : stryMutAct_9fa48("5495") ? false : stryMutAct_9fa48("5494") ? true : (stryCov_9fa48("5494", "5495", "5496"), (stryMutAct_9fa48("5497") ? partitionIds instanceof Set : (stryCov_9fa48("5497"), !(partitionIds instanceof Set))) || (stryMutAct_9fa48("5499") ? partitionIds.size !== NUM.ZERO : stryMutAct_9fa48("5498") ? false : (stryCov_9fa48("5498", "5499"), partitionIds.size === NUM.ZERO)))) {
        if (stryMutAct_9fa48("5500")) {
          {}
        } else {
          stryCov_9fa48("5500");
          return localPartitionIds;
        }
      }
      for (const serviceRow of serviceRows) {
        if (stryMutAct_9fa48("5501")) {
          {}
        } else {
          stryCov_9fa48("5501");
          const serviceType = firstStringField(serviceRow, COLUMN.SERVICE_TYPE, stryMutAct_9fa48("5502") ? "" : (stryCov_9fa48("5502"), 'service_type'), stryMutAct_9fa48("5503") ? "" : (stryCov_9fa48("5503"), 'serviceType'), stryMutAct_9fa48("5504") ? "" : (stryCov_9fa48("5504"), 'type'));
          if (stryMutAct_9fa48("5507") ? serviceType === SERVICE_TYPE_PARTITION : stryMutAct_9fa48("5506") ? false : stryMutAct_9fa48("5505") ? true : (stryCov_9fa48("5505", "5506", "5507"), serviceType !== SERVICE_TYPE_PARTITION)) {
            if (stryMutAct_9fa48("5508")) {
              {}
            } else {
              stryCov_9fa48("5508");
              continue;
            }
          }
          const partitionId = firstStringField(serviceRow, COLUMN.PARTITION_ID, stryMutAct_9fa48("5509") ? "" : (stryCov_9fa48("5509"), 'partition_id'), stryMutAct_9fa48("5510") ? "" : (stryCov_9fa48("5510"), 'partitionId'), stryMutAct_9fa48("5511") ? "" : (stryCov_9fa48("5511"), 'id'));
          if (stryMutAct_9fa48("5514") ? !partitionId && !partitionIds.has(partitionId) : stryMutAct_9fa48("5513") ? false : stryMutAct_9fa48("5512") ? true : (stryCov_9fa48("5512", "5513", "5514"), (stryMutAct_9fa48("5515") ? partitionId : (stryCov_9fa48("5515"), !partitionId)) || (stryMutAct_9fa48("5516") ? partitionIds.has(partitionId) : (stryCov_9fa48("5516"), !partitionIds.has(partitionId))))) {
            if (stryMutAct_9fa48("5517")) {
              {}
            } else {
              stryCov_9fa48("5517");
              continue;
            }
          }
          const nodeId = firstStringField(serviceRow, COLUMN.NODE_ID, stryMutAct_9fa48("5518") ? "" : (stryCov_9fa48("5518"), 'node_id'), stryMutAct_9fa48("5519") ? "" : (stryCov_9fa48("5519"), 'nodeId'));
          if (stryMutAct_9fa48("5522") ? nodeId === this.nodeId : stryMutAct_9fa48("5521") ? false : stryMutAct_9fa48("5520") ? true : (stryCov_9fa48("5520", "5521", "5522"), nodeId !== this.nodeId)) {
            if (stryMutAct_9fa48("5523")) {
              {}
            } else {
              stryCov_9fa48("5523");
              continue;
            }
          }
          const status = firstStringField(serviceRow, COLUMN.STATUS, stryMutAct_9fa48("5524") ? "" : (stryCov_9fa48("5524"), 'status'));
          if (stryMutAct_9fa48("5527") ? String(status || ADMIN_SERVICE_DISCOVERY_LITERAL.VALUE).toLowerCase() === STATUS_ACTIVE : stryMutAct_9fa48("5526") ? false : stryMutAct_9fa48("5525") ? true : (stryCov_9fa48("5525", "5526", "5527"), (stryMutAct_9fa48("5528") ? String(status || ADMIN_SERVICE_DISCOVERY_LITERAL.VALUE).toUpperCase() : (stryCov_9fa48("5528"), String(stryMutAct_9fa48("5531") ? status && ADMIN_SERVICE_DISCOVERY_LITERAL.VALUE : stryMutAct_9fa48("5530") ? false : stryMutAct_9fa48("5529") ? true : (stryCov_9fa48("5529", "5530", "5531"), status || ADMIN_SERVICE_DISCOVERY_LITERAL.VALUE)).toLowerCase())) !== STATUS_ACTIVE)) {
            if (stryMutAct_9fa48("5532")) {
              {}
            } else {
              stryCov_9fa48("5532");
              continue;
            }
          }
          localPartitionIds.add(partitionId);
        }
      }
      return localPartitionIds;
    }
  } /**
    * Resolve one node-local partition-services registry.
    * @return {Map<string, Object>|null}
    */
  resolveLocalPartitionServices() {
    if (stryMutAct_9fa48("5533")) {
      {}
    } else {
      stryCov_9fa48("5533");
      if (stryMutAct_9fa48("5535") ? false : stryMutAct_9fa48("5534") ? true : (stryCov_9fa48("5534", "5535"), this.partitionServicesProvider)) {
        if (stryMutAct_9fa48("5536")) {
          {}
        } else {
          stryCov_9fa48("5536");
          const provided = this.partitionServicesProvider();
          return provided instanceof Map ? provided : null;
        }
      }
      return this.partitionServices instanceof Map ? this.partitionServices : null;
    }
  } /**
    * Return true when the injected authoritative system-table read owner is
    * available.
    * @return {boolean}
    */
  hasAuthoritativeDiscoveryReadOwner() {
    if (stryMutAct_9fa48("5537")) {
      {}
    } else {
      stryCov_9fa48("5537");
      return Boolean(stryMutAct_9fa48("5540") ? this.controlPlaneSystemTableGateway || typeof this.controlPlaneSystemTableGateway.executeRead === TYPEOF.FUNCTION : stryMutAct_9fa48("5539") ? false : stryMutAct_9fa48("5538") ? true : (stryCov_9fa48("5538", "5539", "5540"), this.controlPlaneSystemTableGateway && (stryMutAct_9fa48("5542") ? typeof this.controlPlaneSystemTableGateway.executeRead !== TYPEOF.FUNCTION : stryMutAct_9fa48("5541") ? true : (stryCov_9fa48("5541", "5542"), typeof this.controlPlaneSystemTableGateway.executeRead === TYPEOF.FUNCTION))));
    }
  } /**
    * Return true when authoritative discovery repair can read canonical rows.
    * @return {boolean}
    */
  canReadAuthoritativeDiscoveryRows() {
    if (stryMutAct_9fa48("5543")) {
      {}
    } else {
      stryCov_9fa48("5543");
      return this.hasAuthoritativeDiscoveryReadOwner();
    }
  } /**
    * Resolve one local partition service by partition ID.
    * @param {Map<string, Object>|null} partitionServices
    * @param {string} partitionId
    * @return {Object|null}
    */
  resolveLocalPartitionService(partitionServices, partitionId) {
    if (stryMutAct_9fa48("5544")) {
      {}
    } else {
      stryCov_9fa48("5544");
      if (stryMutAct_9fa48("5547") ? !(partitionServices instanceof Map) && !partitionId : stryMutAct_9fa48("5546") ? false : stryMutAct_9fa48("5545") ? true : (stryCov_9fa48("5545", "5546", "5547"), (stryMutAct_9fa48("5548") ? partitionServices instanceof Map : (stryCov_9fa48("5548"), !(partitionServices instanceof Map))) || (stryMutAct_9fa48("5549") ? partitionId : (stryCov_9fa48("5549"), !partitionId)))) {
        if (stryMutAct_9fa48("5550")) {
          {}
        } else {
          stryCov_9fa48("5550");
          return null;
        }
      }
      if (stryMutAct_9fa48("5552") ? false : stryMutAct_9fa48("5551") ? true : (stryCov_9fa48("5551", "5552"), partitionServices.has(partitionId))) {
        if (stryMutAct_9fa48("5553")) {
          {}
        } else {
          stryCov_9fa48("5553");
          return stryMutAct_9fa48("5556") ? partitionServices.get(partitionId) && null : stryMutAct_9fa48("5555") ? false : stryMutAct_9fa48("5554") ? true : (stryCov_9fa48("5554", "5555", "5556"), partitionServices.get(partitionId) || null);
        }
      }
      for (const partitionService of partitionServices.values()) {
        if (stryMutAct_9fa48("5557")) {
          {}
        } else {
          stryCov_9fa48("5557");
          if (stryMutAct_9fa48("5560") ? partitionService?.partitionId !== partitionId : stryMutAct_9fa48("5559") ? false : stryMutAct_9fa48("5558") ? true : (stryCov_9fa48("5558", "5559", "5560"), (stryMutAct_9fa48("5561") ? partitionService.partitionId : (stryCov_9fa48("5561"), partitionService?.partitionId)) === partitionId)) {
            if (stryMutAct_9fa48("5562")) {
              {}
            } else {
              stryCov_9fa48("5562");
              return partitionService;
            }
          }
        }
      }
      return null;
    }
  } /**
    * Read one authoritative system-table row set through the injected CDC
    * owner when available.
    * @param {string} tableName
    * @param {Object} options
    * @return {Promise<{tableName:string,rows:Object[]}|null>}
    * @private
    */
  async readAuthoritativeSystemTableRowsViaOwner(tableName, options = {}) {
    if (stryMutAct_9fa48("5563")) {
      {}
    } else {
      stryCov_9fa48("5563");
      if (stryMutAct_9fa48("5566") ? !this.hasAuthoritativeDiscoveryReadOwner() && typeof this.controlPlaneSystemTableGateway?.executeRead !== TYPEOF.FUNCTION : stryMutAct_9fa48("5565") ? false : stryMutAct_9fa48("5564") ? true : (stryCov_9fa48("5564", "5565", "5566"), (stryMutAct_9fa48("5567") ? this.hasAuthoritativeDiscoveryReadOwner() : (stryCov_9fa48("5567"), !this.hasAuthoritativeDiscoveryReadOwner())) || (stryMutAct_9fa48("5569") ? typeof this.controlPlaneSystemTableGateway?.executeRead === TYPEOF.FUNCTION : stryMutAct_9fa48("5568") ? false : (stryCov_9fa48("5568", "5569"), typeof (stryMutAct_9fa48("5570") ? this.controlPlaneSystemTableGateway.executeRead : (stryCov_9fa48("5570"), this.controlPlaneSystemTableGateway?.executeRead)) !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("5571")) {
          {}
        } else {
          stryCov_9fa48("5571");
          return null;
        }
      }
      const now = stryMutAct_9fa48("5574") ? options.nowMs && Date.now() : stryMutAct_9fa48("5573") ? false : stryMutAct_9fa48("5572") ? true : (stryCov_9fa48("5572", "5573", "5574"), options.nowMs || Date.now());
      const reason = String(stryMutAct_9fa48("5577") ? options.reason && '' : stryMutAct_9fa48("5576") ? false : stryMutAct_9fa48("5575") ? true : (stryCov_9fa48("5575", "5576", "5577"), options.reason || (stryMutAct_9fa48("5578") ? "Stryker was here!" : (stryCov_9fa48("5578"), ''))));
      const controlSnapshotRepairRead = stryMutAct_9fa48("5581") ? reason !== AUTHORITATIVE_DISCOVERY_REPAIR_REASON_CONTROL_SNAPSHOT : stryMutAct_9fa48("5580") ? false : stryMutAct_9fa48("5579") ? true : (stryCov_9fa48("5579", "5580", "5581"), reason === AUTHORITATIVE_DISCOVERY_REPAIR_REASON_CONTROL_SNAPSHOT);
      const tableScopedDiscoveryRepair = stryMutAct_9fa48("5584") ? reason === 'service_discovery_snapshot' || typeof options.tableName === TYPEOF.STRING || typeof options.tableId === TYPEOF.STRING : stryMutAct_9fa48("5583") ? false : stryMutAct_9fa48("5582") ? true : (stryCov_9fa48("5582", "5583", "5584"), (stryMutAct_9fa48("5586") ? reason !== 'service_discovery_snapshot' : stryMutAct_9fa48("5585") ? true : (stryCov_9fa48("5585", "5586"), reason === (stryMutAct_9fa48("5587") ? "" : (stryCov_9fa48("5587"), 'service_discovery_snapshot')))) && (stryMutAct_9fa48("5589") ? typeof options.tableName === TYPEOF.STRING && typeof options.tableId === TYPEOF.STRING : stryMutAct_9fa48("5588") ? true : (stryCov_9fa48("5588", "5589"), (stryMutAct_9fa48("5591") ? typeof options.tableName !== TYPEOF.STRING : stryMutAct_9fa48("5590") ? false : (stryCov_9fa48("5590", "5591"), typeof options.tableName === TYPEOF.STRING)) || (stryMutAct_9fa48("5593") ? typeof options.tableId !== TYPEOF.STRING : stryMutAct_9fa48("5592") ? false : (stryCov_9fa48("5592", "5593"), typeof options.tableId === TYPEOF.STRING)))));
      const routingReadinessDimension = tableScopedDiscoveryRepair ? CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE : CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE;
      const queryResult = await this.controlPlaneSystemTableGateway.executeRead(stryMutAct_9fa48("5594") ? {} : (stryCov_9fa48("5594"), {
        tableName,
        sql: stryMutAct_9fa48("5595") ? `` : (stryCov_9fa48("5595"), `SELECT * FROM ${tableName}`),
        params: ADMIN_CACHE_DUMP.EMPTY,
        strategy: CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED,
        owner: stryMutAct_9fa48("5596") ? "" : (stryCov_9fa48("5596"), 'admin-service-discovery')
      }), stryMutAct_9fa48("5597") ? {} : (stryCov_9fa48("5597"), {
        readProfile: stryMutAct_9fa48("5598") ? "" : (stryCov_9fa48("5598"), 'repair_required'),
        queryTimeoutMs: AUTHORITATIVE_DISCOVERY_REPAIR.QUERY_TIMEOUT_MS,
        sessionId: (stryMutAct_9fa48("5599") ? `` : (stryCov_9fa48("5599"), `${stryMutAct_9fa48("5602") ? reason && 'repair' : stryMutAct_9fa48("5601") ? false : stryMutAct_9fa48("5600") ? true : (stryCov_9fa48("5600", "5601", "5602"), reason || (stryMutAct_9fa48("5603") ? "" : (stryCov_9fa48("5603"), 'repair')))}`)) + (stryMutAct_9fa48("5604") ? `` : (stryCov_9fa48("5604"), `:${tableName}:${now}`)),
        allowSqlFallback: stryMutAct_9fa48("5607") ? tableScopedDiscoveryRepair !== true : stryMutAct_9fa48("5606") ? false : stryMutAct_9fa48("5605") ? true : (stryCov_9fa48("5605", "5606", "5607"), tableScopedDiscoveryRepair === (stryMutAct_9fa48("5608") ? false : (stryCov_9fa48("5608"), true))),
        allowPressureDegrade: controlSnapshotRepairRead ? stryMutAct_9fa48("5609") ? true : (stryCov_9fa48("5609"), false) : undefined,
        workClass: controlSnapshotRepairRead ? PRESSURE_WORK_CLASS.CRITICAL : undefined,
        deliveryPriority: controlSnapshotRepairRead ? stryMutAct_9fa48("5610") ? "" : (stryCov_9fa48("5610"), 'critical') : undefined,
        routingReadinessDimension
      }));
      if (stryMutAct_9fa48("5613") ? queryResult?.success === true : stryMutAct_9fa48("5612") ? false : stryMutAct_9fa48("5611") ? true : (stryCov_9fa48("5611", "5612", "5613"), (stryMutAct_9fa48("5614") ? queryResult.success : (stryCov_9fa48("5614"), queryResult?.success)) !== (stryMutAct_9fa48("5615") ? false : (stryCov_9fa48("5615"), true)))) {
        if (stryMutAct_9fa48("5616")) {
          {}
        } else {
          stryCov_9fa48("5616");
          const error = new Error(stryMutAct_9fa48("5619") ? queryResult.error && 'authoritative_query_failed' : stryMutAct_9fa48("5618") ? false : stryMutAct_9fa48("5617") ? true : (stryCov_9fa48("5617", "5618", "5619"), queryResult.error || (stryMutAct_9fa48("5620") ? "" : (stryCov_9fa48("5620"), 'authoritative_query_failed'))));
          error.code = stryMutAct_9fa48("5623") ? queryResult?.errorCode && null : stryMutAct_9fa48("5622") ? false : stryMutAct_9fa48("5621") ? true : (stryCov_9fa48("5621", "5622", "5623"), (stryMutAct_9fa48("5624") ? queryResult.errorCode : (stryCov_9fa48("5624"), queryResult?.errorCode)) || null);
          error.retryAfterMs = stryMutAct_9fa48("5627") ? getControlPlaneRetryAfterMs(queryResult) && null : stryMutAct_9fa48("5626") ? false : stryMutAct_9fa48("5625") ? true : (stryCov_9fa48("5625", "5626", "5627"), getControlPlaneRetryAfterMs(queryResult) || null);
          error.readSource = (stryMutAct_9fa48("5630") ? typeof queryResult?.source !== TYPEOF.STRING : stryMutAct_9fa48("5629") ? false : stryMutAct_9fa48("5628") ? true : (stryCov_9fa48("5628", "5629", "5630"), typeof (stryMutAct_9fa48("5631") ? queryResult.source : (stryCov_9fa48("5631"), queryResult?.source)) === TYPEOF.STRING)) ? queryResult.source : null;
          error.localQueryTransport = normalizeLocalQueryTransportDiagnostic(stryMutAct_9fa48("5632") ? queryResult.localQueryTransport : (stryCov_9fa48("5632"), queryResult?.localQueryTransport));
          error.tableName = tableName;
          error.failedPartitions = Array.isArray(stryMutAct_9fa48("5633") ? queryResult.failedPartitions : (stryCov_9fa48("5633"), queryResult?.failedPartitions)) ? stryMutAct_9fa48("5634") ? [] : (stryCov_9fa48("5634"), [...queryResult.failedPartitions]) : stryMutAct_9fa48("5635") ? ["Stryker was here"] : (stryCov_9fa48("5635"), []);
          error.partitionErrors = Array.isArray(stryMutAct_9fa48("5636") ? queryResult.partitionErrors : (stryCov_9fa48("5636"), queryResult?.partitionErrors)) ? queryResult.partitionErrors.map(stryMutAct_9fa48("5637") ? () => undefined : (stryCov_9fa48("5637"), entry => stryMutAct_9fa48("5638") ? {} : (stryCov_9fa48("5638"), {
            ...entry
          }))) : stryMutAct_9fa48("5639") ? ["Stryker was here"] : (stryCov_9fa48("5639"), []);
          error.participantFailures = Array.isArray(stryMutAct_9fa48("5640") ? queryResult.participantFailures : (stryCov_9fa48("5640"), queryResult?.participantFailures)) ? queryResult.participantFailures.map(stryMutAct_9fa48("5641") ? () => undefined : (stryCov_9fa48("5641"), entry => stryMutAct_9fa48("5642") ? {} : (stryCov_9fa48("5642"), {
            ...entry
          }))) : stryMutAct_9fa48("5643") ? ["Stryker was here"] : (stryCov_9fa48("5643"), []);
          error.firstFailedParticipant = (stryMutAct_9fa48("5646") ? queryResult?.firstFailedParticipant || typeof queryResult.firstFailedParticipant === TYPEOF.OBJECT : stryMutAct_9fa48("5645") ? false : stryMutAct_9fa48("5644") ? true : (stryCov_9fa48("5644", "5645", "5646"), (stryMutAct_9fa48("5647") ? queryResult.firstFailedParticipant : (stryCov_9fa48("5647"), queryResult?.firstFailedParticipant)) && (stryMutAct_9fa48("5649") ? typeof queryResult.firstFailedParticipant !== TYPEOF.OBJECT : stryMutAct_9fa48("5648") ? true : (stryCov_9fa48("5648", "5649"), typeof queryResult.firstFailedParticipant === TYPEOF.OBJECT)))) ? stryMutAct_9fa48("5650") ? {} : (stryCov_9fa48("5650"), {
            ...queryResult.firstFailedParticipant
          }) : null;
          error.distributedMetrics = (stryMutAct_9fa48("5653") ? queryResult?.distributedMetrics || typeof queryResult.distributedMetrics === TYPEOF.OBJECT : stryMutAct_9fa48("5652") ? false : stryMutAct_9fa48("5651") ? true : (stryCov_9fa48("5651", "5652", "5653"), (stryMutAct_9fa48("5654") ? queryResult.distributedMetrics : (stryCov_9fa48("5654"), queryResult?.distributedMetrics)) && (stryMutAct_9fa48("5656") ? typeof queryResult.distributedMetrics !== TYPEOF.OBJECT : stryMutAct_9fa48("5655") ? true : (stryCov_9fa48("5655", "5656"), typeof queryResult.distributedMetrics === TYPEOF.OBJECT)))) ? queryResult.distributedMetrics : null;
          throw error;
        }
      }
      return stryMutAct_9fa48("5657") ? {} : (stryCov_9fa48("5657"), {
        tableName,
        rows: Array.isArray(stryMutAct_9fa48("5658") ? queryResult.rows : (stryCov_9fa48("5658"), queryResult?.rows)) ? queryResult.rows : ADMIN_CACHE_DUMP.EMPTY
      });
    }
  } /**
    * Resolve one authoritative row set for bounded discovery repair.
    * Uses the canonical control-plane read gateway only.
    * @param {string} tableName
    * @param {Object} options
    * @return {Promise<{tableName: string, rows: Object[]}>}
    */
  async readAuthoritativeSystemTableRows(tableName, options = {}) {
    if (stryMutAct_9fa48("5659")) {
      {}
    } else {
      stryCov_9fa48("5659");
      const ownerRows = await this.readAuthoritativeSystemTableRowsViaOwner(tableName, options);
      if (stryMutAct_9fa48("5661") ? false : stryMutAct_9fa48("5660") ? true : (stryCov_9fa48("5660", "5661"), ownerRows)) {
        if (stryMutAct_9fa48("5662")) {
          {}
        } else {
          stryCov_9fa48("5662");
          return ownerRows;
        }
      }
      throw new Error(ADMIN_SERVICE_DISCOVERY_LITERAL.AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE);
    }
  } /**
    * Build node-local CDC readiness state for active propagated
    * system-table partitions.
    * @param {Object} options
    * @return {Object}
    */
  buildDiscoveryLocalPartitionCdcState(options = {}) {
    if (stryMutAct_9fa48("5663")) {
      {}
    } else {
      stryCov_9fa48("5663");
      const state = stryMutAct_9fa48("5664") ? {} : (stryCov_9fa48("5664"), {
        applies: stryMutAct_9fa48("5665") ? true : (stryCov_9fa48("5665"), false),
        ready: stryMutAct_9fa48("5666") ? false : (stryCov_9fa48("5666"), true),
        diagnosticsAvailable: stryMutAct_9fa48("5667") ? false : (stryCov_9fa48("5667"), true),
        missingDiagnosticsPartitionIds: stryMutAct_9fa48("5668") ? ["Stryker was here"] : (stryCov_9fa48("5668"), []),
        noSubscriberPartitionIds: stryMutAct_9fa48("5669") ? ["Stryker was here"] : (stryCov_9fa48("5669"), []),
        bufferedPartitionIds: stryMutAct_9fa48("5670") ? ["Stryker was here"] : (stryCov_9fa48("5670"), [])
      });
      const localTargetPartitionIds = options.localTargetPartitionIds;
      const tableName = String(stryMutAct_9fa48("5673") ? options.tableName && '' : stryMutAct_9fa48("5672") ? false : stryMutAct_9fa48("5671") ? true : (stryCov_9fa48("5671", "5672", "5673"), options.tableName || (stryMutAct_9fa48("5674") ? "Stryker was here!" : (stryCov_9fa48("5674"), ''))));
      if (stryMutAct_9fa48("5677") ? (options.cdcReadinessApplies !== true || !isTableCdcReadinessRelevant(tableName) || !(localTargetPartitionIds instanceof Set)) && localTargetPartitionIds.size === NUM.ZERO : stryMutAct_9fa48("5676") ? false : stryMutAct_9fa48("5675") ? true : (stryCov_9fa48("5675", "5676", "5677"), (stryMutAct_9fa48("5679") ? (options.cdcReadinessApplies !== true || !isTableCdcReadinessRelevant(tableName)) && !(localTargetPartitionIds instanceof Set) : stryMutAct_9fa48("5678") ? false : (stryCov_9fa48("5678", "5679"), (stryMutAct_9fa48("5681") ? options.cdcReadinessApplies !== true && !isTableCdcReadinessRelevant(tableName) : stryMutAct_9fa48("5680") ? false : (stryCov_9fa48("5680", "5681"), (stryMutAct_9fa48("5683") ? options.cdcReadinessApplies === true : stryMutAct_9fa48("5682") ? false : (stryCov_9fa48("5682", "5683"), options.cdcReadinessApplies !== (stryMutAct_9fa48("5684") ? false : (stryCov_9fa48("5684"), true)))) || (stryMutAct_9fa48("5685") ? isTableCdcReadinessRelevant(tableName) : (stryCov_9fa48("5685"), !isTableCdcReadinessRelevant(tableName))))) || (stryMutAct_9fa48("5686") ? localTargetPartitionIds instanceof Set : (stryCov_9fa48("5686"), !(localTargetPartitionIds instanceof Set))))) || (stryMutAct_9fa48("5688") ? localTargetPartitionIds.size !== NUM.ZERO : stryMutAct_9fa48("5687") ? false : (stryCov_9fa48("5687", "5688"), localTargetPartitionIds.size === NUM.ZERO)))) {
        if (stryMutAct_9fa48("5689")) {
          {}
        } else {
          stryCov_9fa48("5689");
          return state;
        }
      }
      const partitionServices = this.resolveLocalPartitionServices();
      if (stryMutAct_9fa48("5692") ? false : stryMutAct_9fa48("5691") ? true : stryMutAct_9fa48("5690") ? partitionServices instanceof Map : (stryCov_9fa48("5690", "5691", "5692"), !(partitionServices instanceof Map))) {
        if (stryMutAct_9fa48("5693")) {
          {}
        } else {
          stryCov_9fa48("5693");
          return state;
        }
      }
      state.applies = stryMutAct_9fa48("5694") ? false : (stryCov_9fa48("5694"), true);
      for (const partitionId of localTargetPartitionIds) {
        if (stryMutAct_9fa48("5695")) {
          {}
        } else {
          stryCov_9fa48("5695");
          const partitionService = this.resolveLocalPartitionService(partitionServices, partitionId);
          if (stryMutAct_9fa48("5698") ? !partitionService && typeof partitionService.getCDCSubscriptionDiagnostics !== TYPEOF.FUNCTION : stryMutAct_9fa48("5697") ? false : stryMutAct_9fa48("5696") ? true : (stryCov_9fa48("5696", "5697", "5698"), (stryMutAct_9fa48("5699") ? partitionService : (stryCov_9fa48("5699"), !partitionService)) || (stryMutAct_9fa48("5701") ? typeof partitionService.getCDCSubscriptionDiagnostics === TYPEOF.FUNCTION : stryMutAct_9fa48("5700") ? false : (stryCov_9fa48("5700", "5701"), typeof partitionService.getCDCSubscriptionDiagnostics !== TYPEOF.FUNCTION)))) {
            if (stryMutAct_9fa48("5702")) {
              {}
            } else {
              stryCov_9fa48("5702");
              markDiscoveryLocalPartitionCdcDiagnosticsMissing(state, partitionId);
              continue;
            }
          }
          const diagnostics = partitionService.getCDCSubscriptionDiagnostics();
          if (stryMutAct_9fa48("5705") ? !diagnostics && typeof diagnostics !== TYPEOF.OBJECT : stryMutAct_9fa48("5704") ? false : stryMutAct_9fa48("5703") ? true : (stryCov_9fa48("5703", "5704", "5705"), (stryMutAct_9fa48("5706") ? diagnostics : (stryCov_9fa48("5706"), !diagnostics)) || (stryMutAct_9fa48("5708") ? typeof diagnostics === TYPEOF.OBJECT : stryMutAct_9fa48("5707") ? false : (stryCov_9fa48("5707", "5708"), typeof diagnostics !== TYPEOF.OBJECT)))) {
            if (stryMutAct_9fa48("5709")) {
              {}
            } else {
              stryCov_9fa48("5709");
              markDiscoveryLocalPartitionCdcDiagnosticsMissing(state, partitionId);
              continue;
            }
          }
          const subscriberCount = Number(stryMutAct_9fa48("5712") ? diagnostics.subscriberCount && NUM.ZERO : stryMutAct_9fa48("5711") ? false : stryMutAct_9fa48("5710") ? true : (stryCov_9fa48("5710", "5711", "5712"), diagnostics.subscriberCount || NUM.ZERO));
          const bufferedEvents = Number(stryMutAct_9fa48("5715") ? diagnostics.bufferedEvents && NUM.ZERO : stryMutAct_9fa48("5714") ? false : stryMutAct_9fa48("5713") ? true : (stryCov_9fa48("5713", "5714", "5715"), diagnostics.bufferedEvents || NUM.ZERO));
          const replayInFlight = stryMutAct_9fa48("5718") ? diagnostics.bufferReplayInFlight !== true : stryMutAct_9fa48("5717") ? false : stryMutAct_9fa48("5716") ? true : (stryCov_9fa48("5716", "5717", "5718"), diagnostics.bufferReplayInFlight === (stryMutAct_9fa48("5719") ? false : (stryCov_9fa48("5719"), true)));
          if (stryMutAct_9fa48("5723") ? subscriberCount > NUM.ZERO : stryMutAct_9fa48("5722") ? subscriberCount < NUM.ZERO : stryMutAct_9fa48("5721") ? false : stryMutAct_9fa48("5720") ? true : (stryCov_9fa48("5720", "5721", "5722", "5723"), subscriberCount <= NUM.ZERO)) {
            if (stryMutAct_9fa48("5724")) {
              {}
            } else {
              stryCov_9fa48("5724");
              markDiscoveryLocalPartitionCdcNoSubscriber(state, partitionId);
            }
          }
          if (stryMutAct_9fa48("5727") ? bufferedEvents > NUM.ZERO && replayInFlight : stryMutAct_9fa48("5726") ? false : stryMutAct_9fa48("5725") ? true : (stryCov_9fa48("5725", "5726", "5727"), (stryMutAct_9fa48("5730") ? bufferedEvents <= NUM.ZERO : stryMutAct_9fa48("5729") ? bufferedEvents >= NUM.ZERO : stryMutAct_9fa48("5728") ? false : (stryCov_9fa48("5728", "5729", "5730"), bufferedEvents > NUM.ZERO)) || replayInFlight)) {
            if (stryMutAct_9fa48("5731")) {
              {}
            } else {
              stryCov_9fa48("5731");
              markDiscoveryLocalPartitionCdcBuffered(state, partitionId);
            }
          }
        }
      }
      state.missingDiagnosticsPartitionIds = uniqueSorted(state.missingDiagnosticsPartitionIds);
      state.noSubscriberPartitionIds = uniqueSorted(state.noSubscriberPartitionIds);
      state.bufferedPartitionIds = uniqueSorted(state.bufferedPartitionIds);
      return state;
    }
  } /**
    * Build per-node local target-replica readiness for table-scoped
    * discovery.
    * @param {Set<string>} partitionIds
    * @param {Array<Object>} serviceRows
    * @return {Map<string, Object>}
    */
  buildDiscoveryLocalTargetReplicaStateByNodeId(partitionIds, serviceRows) {
    if (stryMutAct_9fa48("5732")) {
      {}
    } else {
      stryCov_9fa48("5732");
      const stateByNodeId = new Map();
      if (stryMutAct_9fa48("5735") ? !(partitionIds instanceof Set) && partitionIds.size === NUM.ZERO : stryMutAct_9fa48("5734") ? false : stryMutAct_9fa48("5733") ? true : (stryCov_9fa48("5733", "5734", "5735"), (stryMutAct_9fa48("5736") ? partitionIds instanceof Set : (stryCov_9fa48("5736"), !(partitionIds instanceof Set))) || (stryMutAct_9fa48("5738") ? partitionIds.size !== NUM.ZERO : stryMutAct_9fa48("5737") ? false : (stryCov_9fa48("5737", "5738"), partitionIds.size === NUM.ZERO)))) {
        if (stryMutAct_9fa48("5739")) {
          {}
        } else {
          stryCov_9fa48("5739");
          return stateByNodeId;
        }
      }
      for (const serviceRow of serviceRows) {
        if (stryMutAct_9fa48("5740")) {
          {}
        } else {
          stryCov_9fa48("5740");
          const serviceType = firstStringField(serviceRow, COLUMN.SERVICE_TYPE, stryMutAct_9fa48("5741") ? "" : (stryCov_9fa48("5741"), 'service_type'), stryMutAct_9fa48("5742") ? "" : (stryCov_9fa48("5742"), 'serviceType'), stryMutAct_9fa48("5743") ? "" : (stryCov_9fa48("5743"), 'type'));
          if (stryMutAct_9fa48("5746") ? serviceType === SERVICE_TYPE_PARTITION : stryMutAct_9fa48("5745") ? false : stryMutAct_9fa48("5744") ? true : (stryCov_9fa48("5744", "5745", "5746"), serviceType !== SERVICE_TYPE_PARTITION)) {
            if (stryMutAct_9fa48("5747")) {
              {}
            } else {
              stryCov_9fa48("5747");
              continue;
            }
          }
          const partitionId = firstStringField(serviceRow, COLUMN.PARTITION_ID, stryMutAct_9fa48("5748") ? "" : (stryCov_9fa48("5748"), 'partition_id'), stryMutAct_9fa48("5749") ? "" : (stryCov_9fa48("5749"), 'partitionId'), stryMutAct_9fa48("5750") ? "" : (stryCov_9fa48("5750"), 'id'));
          if (stryMutAct_9fa48("5753") ? !partitionId && !partitionIds.has(partitionId) : stryMutAct_9fa48("5752") ? false : stryMutAct_9fa48("5751") ? true : (stryCov_9fa48("5751", "5752", "5753"), (stryMutAct_9fa48("5754") ? partitionId : (stryCov_9fa48("5754"), !partitionId)) || (stryMutAct_9fa48("5755") ? partitionIds.has(partitionId) : (stryCov_9fa48("5755"), !partitionIds.has(partitionId))))) {
            if (stryMutAct_9fa48("5756")) {
              {}
            } else {
              stryCov_9fa48("5756");
              continue;
            }
          }
          const status = firstStringField(serviceRow, COLUMN.STATUS, stryMutAct_9fa48("5757") ? "" : (stryCov_9fa48("5757"), 'status'));
          if (stryMutAct_9fa48("5760") ? String(status || ADMIN_SERVICE_DISCOVERY_LITERAL.VALUE).toLowerCase() === STATUS_ACTIVE : stryMutAct_9fa48("5759") ? false : stryMutAct_9fa48("5758") ? true : (stryCov_9fa48("5758", "5759", "5760"), (stryMutAct_9fa48("5761") ? String(status || ADMIN_SERVICE_DISCOVERY_LITERAL.VALUE).toUpperCase() : (stryCov_9fa48("5761"), String(stryMutAct_9fa48("5764") ? status && ADMIN_SERVICE_DISCOVERY_LITERAL.VALUE : stryMutAct_9fa48("5763") ? false : stryMutAct_9fa48("5762") ? true : (stryCov_9fa48("5762", "5763", "5764"), status || ADMIN_SERVICE_DISCOVERY_LITERAL.VALUE)).toLowerCase())) !== STATUS_ACTIVE)) {
            if (stryMutAct_9fa48("5765")) {
              {}
            } else {
              stryCov_9fa48("5765");
              continue;
            }
          }
          const nodeId = firstStringField(serviceRow, COLUMN.NODE_ID, stryMutAct_9fa48("5766") ? "" : (stryCov_9fa48("5766"), 'node_id'), stryMutAct_9fa48("5767") ? "" : (stryCov_9fa48("5767"), 'nodeId'));
          if (stryMutAct_9fa48("5770") ? false : stryMutAct_9fa48("5769") ? true : stryMutAct_9fa48("5768") ? nodeId : (stryCov_9fa48("5768", "5769", "5770"), !nodeId)) {
            if (stryMutAct_9fa48("5771")) {
              {}
            } else {
              stryCov_9fa48("5771");
              continue;
            }
          }
          const nodeState = stryMutAct_9fa48("5774") ? stateByNodeId.get(nodeId) && {
            nonVoterPartitionIds: new Set(),
            replicaRoles: new Set()
          } : stryMutAct_9fa48("5773") ? false : stryMutAct_9fa48("5772") ? true : (stryCov_9fa48("5772", "5773", "5774"), stateByNodeId.get(nodeId) || (stryMutAct_9fa48("5775") ? {} : (stryCov_9fa48("5775"), {
            nonVoterPartitionIds: new Set(),
            replicaRoles: new Set()
          })));
          const raftRole = stryMutAct_9fa48("5776") ? String(firstStringField(serviceRow, COLUMN.RAFT_ROLE, 'raft_role', 'raftRole') || EMPTY_STRING).toUpperCase() : (stryCov_9fa48("5776"), String(stryMutAct_9fa48("5779") ? firstStringField(serviceRow, COLUMN.RAFT_ROLE, 'raft_role', 'raftRole') && EMPTY_STRING : stryMutAct_9fa48("5778") ? false : stryMutAct_9fa48("5777") ? true : (stryCov_9fa48("5777", "5778", "5779"), firstStringField(serviceRow, COLUMN.RAFT_ROLE, stryMutAct_9fa48("5780") ? "" : (stryCov_9fa48("5780"), 'raft_role'), stryMutAct_9fa48("5781") ? "" : (stryCov_9fa48("5781"), 'raftRole')) || EMPTY_STRING)).toLowerCase());
          if (stryMutAct_9fa48("5785") ? raftRole.length <= NUM.ZERO : stryMutAct_9fa48("5784") ? raftRole.length >= NUM.ZERO : stryMutAct_9fa48("5783") ? false : stryMutAct_9fa48("5782") ? true : (stryCov_9fa48("5782", "5783", "5784", "5785"), raftRole.length > NUM.ZERO)) {
            if (stryMutAct_9fa48("5786")) {
              {}
            } else {
              stryCov_9fa48("5786");
              nodeState.replicaRoles.add(raftRole);
            }
          }
          if (stryMutAct_9fa48("5789") ? false : stryMutAct_9fa48("5788") ? true : stryMutAct_9fa48("5787") ? isActiveVoterReadyPartitionReplica(serviceRow) : (stryCov_9fa48("5787", "5788", "5789"), !isActiveVoterReadyPartitionReplica(serviceRow))) {
            if (stryMutAct_9fa48("5790")) {
              {}
            } else {
              stryCov_9fa48("5790");
              nodeState.nonVoterPartitionIds.add(partitionId);
            }
          }
          stateByNodeId.set(nodeId, nodeState);
        }
      }
      return stateByNodeId;
    }
  } /**
    * Resolve partition context for optional table-scoped readiness.
    * @param {string|null} tableName
    * @param {string|null} tableId
    * @param {Array<Object>} partitionRows
    * @param {Array<Object>} tableRows
    * @return {Object}
    */
  resolveDiscoveryTablePartitionContext(tableName, tableId, partitionRows, tableRows) {
    if (stryMutAct_9fa48("5791")) {
      {}
    } else {
      stryCov_9fa48("5791");
      if (stryMutAct_9fa48("5794") ? !tableName || !tableId : stryMutAct_9fa48("5793") ? false : stryMutAct_9fa48("5792") ? true : (stryCov_9fa48("5792", "5793", "5794"), (stryMutAct_9fa48("5795") ? tableName : (stryCov_9fa48("5795"), !tableName)) && (stryMutAct_9fa48("5796") ? tableId : (stryCov_9fa48("5796"), !tableId)))) {
        if (stryMutAct_9fa48("5797")) {
          {}
        } else {
          stryCov_9fa48("5797");
          return stryMutAct_9fa48("5798") ? {} : (stryCov_9fa48("5798"), {
            tableFound: stryMutAct_9fa48("5799") ? false : (stryCov_9fa48("5799"), true),
            partitionIds: new Set(),
            appliedSchemaVersion: null,
            cdcReadinessApplies: stryMutAct_9fa48("5800") ? true : (stryCov_9fa48("5800"), false)
          });
        }
      }
      const tableIds = new Set();
      const matchingTableRows = stryMutAct_9fa48("5801") ? ["Stryker was here"] : (stryCov_9fa48("5801"), []);
      let appliedSchemaVersion = null;
      let cdcReadinessApplies = stryMutAct_9fa48("5802") ? true : (stryCov_9fa48("5802"), false);
      for (const tableRow of tableRows) {
        if (stryMutAct_9fa48("5803")) {
          {}
        } else {
          stryCov_9fa48("5803");
          const rowTableName = firstStringField(tableRow, COLUMN.TABLE_NAME, stryMutAct_9fa48("5804") ? "" : (stryCov_9fa48("5804"), 'table_name'), stryMutAct_9fa48("5805") ? "" : (stryCov_9fa48("5805"), 'tableName'), stryMutAct_9fa48("5806") ? "" : (stryCov_9fa48("5806"), 'name'));
          const rowTableId = firstStringField(tableRow, COLUMN.TABLE_ID, stryMutAct_9fa48("5807") ? "" : (stryCov_9fa48("5807"), 'table_id'), stryMutAct_9fa48("5808") ? "" : (stryCov_9fa48("5808"), 'tableId'), stryMutAct_9fa48("5809") ? "" : (stryCov_9fa48("5809"), 'id'));
          const matchesTableName = stryMutAct_9fa48("5812") ? tableName || rowTableName === tableName : stryMutAct_9fa48("5811") ? false : stryMutAct_9fa48("5810") ? true : (stryCov_9fa48("5810", "5811", "5812"), tableName && (stryMutAct_9fa48("5814") ? rowTableName !== tableName : stryMutAct_9fa48("5813") ? true : (stryCov_9fa48("5813", "5814"), rowTableName === tableName)));
          const matchesTableId = stryMutAct_9fa48("5817") ? tableId || rowTableId === tableId : stryMutAct_9fa48("5816") ? false : stryMutAct_9fa48("5815") ? true : (stryCov_9fa48("5815", "5816", "5817"), tableId && (stryMutAct_9fa48("5819") ? rowTableId !== tableId : stryMutAct_9fa48("5818") ? true : (stryCov_9fa48("5818", "5819"), rowTableId === tableId)));
          if (stryMutAct_9fa48("5822") ? !matchesTableName || !matchesTableId : stryMutAct_9fa48("5821") ? false : stryMutAct_9fa48("5820") ? true : (stryCov_9fa48("5820", "5821", "5822"), (stryMutAct_9fa48("5823") ? matchesTableName : (stryCov_9fa48("5823"), !matchesTableName)) && (stryMutAct_9fa48("5824") ? matchesTableId : (stryCov_9fa48("5824"), !matchesTableId)))) {
            if (stryMutAct_9fa48("5825")) {
              {}
            } else {
              stryCov_9fa48("5825");
              continue;
            }
          }
          matchingTableRows.push(tableRow);
          if (stryMutAct_9fa48("5827") ? false : stryMutAct_9fa48("5826") ? true : (stryCov_9fa48("5826", "5827"), rowTableId)) {
            if (stryMutAct_9fa48("5828")) {
              {}
            } else {
              stryCov_9fa48("5828");
              tableIds.add(rowTableId);
            }
          }
          if (stryMutAct_9fa48("5830") ? false : stryMutAct_9fa48("5829") ? true : (stryCov_9fa48("5829", "5830"), isTableCdcReadinessRelevant(rowTableName))) {
            if (stryMutAct_9fa48("5831")) {
              {}
            } else {
              stryCov_9fa48("5831");
              cdcReadinessApplies = stryMutAct_9fa48("5832") ? false : (stryCov_9fa48("5832"), true);
            }
          }
          const rowSchemaVersion = extractSchemaVersionFromRecord(tableRow);
          appliedSchemaVersion = selectNewestSchemaVersion(appliedSchemaVersion, rowSchemaVersion);
        }
      }
      if (stryMutAct_9fa48("5834") ? false : stryMutAct_9fa48("5833") ? true : (stryCov_9fa48("5833", "5834"), tableId)) {
        if (stryMutAct_9fa48("5835")) {
          {}
        } else {
          stryCov_9fa48("5835");
          tableIds.add(tableId);
        }
      }
      const matchingPartitionRows = stryMutAct_9fa48("5836") ? ["Stryker was here"] : (stryCov_9fa48("5836"), []);
      for (const partitionRow of partitionRows) {
        if (stryMutAct_9fa48("5837")) {
          {}
        } else {
          stryCov_9fa48("5837");
          const rowTableName = firstStringField(partitionRow, COLUMN.TABLE_NAME, stryMutAct_9fa48("5838") ? "" : (stryCov_9fa48("5838"), 'table_name'), stryMutAct_9fa48("5839") ? "" : (stryCov_9fa48("5839"), 'tableName'), stryMutAct_9fa48("5840") ? "" : (stryCov_9fa48("5840"), 'name'));
          const rowTableId = firstStringField(partitionRow, COLUMN.TABLE_ID, stryMutAct_9fa48("5841") ? "" : (stryCov_9fa48("5841"), 'table_id'), stryMutAct_9fa48("5842") ? "" : (stryCov_9fa48("5842"), 'tableId'));
          const matchesTableName = stryMutAct_9fa48("5845") ? tableName || rowTableName === tableName : stryMutAct_9fa48("5844") ? false : stryMutAct_9fa48("5843") ? true : (stryCov_9fa48("5843", "5844", "5845"), tableName && (stryMutAct_9fa48("5847") ? rowTableName !== tableName : stryMutAct_9fa48("5846") ? true : (stryCov_9fa48("5846", "5847"), rowTableName === tableName)));
          const matchesTableId = stryMutAct_9fa48("5850") ? rowTableId || tableIds.has(rowTableId) : stryMutAct_9fa48("5849") ? false : stryMutAct_9fa48("5848") ? true : (stryCov_9fa48("5848", "5849", "5850"), rowTableId && tableIds.has(rowTableId));
          if (stryMutAct_9fa48("5853") ? matchesTableName && matchesTableId : stryMutAct_9fa48("5852") ? false : stryMutAct_9fa48("5851") ? true : (stryCov_9fa48("5851", "5852", "5853"), matchesTableName || matchesTableId)) {
            if (stryMutAct_9fa48("5854")) {
              {}
            } else {
              stryCov_9fa48("5854");
              matchingPartitionRows.push(partitionRow);
              const rowSchemaVersion = extractSchemaVersionFromRecord(partitionRow);
              appliedSchemaVersion = selectNewestSchemaVersion(appliedSchemaVersion, rowSchemaVersion);
            }
          }
        }
      }
      const activeServingPartitionRows = filterActiveServingPartitionRows(matchingPartitionRows, matchingTableRows);
      const partitionIds = new Set();
      for (const partitionRow of activeServingPartitionRows) {
        if (stryMutAct_9fa48("5855")) {
          {}
        } else {
          stryCov_9fa48("5855");
          const partitionId = firstStringField(partitionRow, COLUMN.PARTITION_ID, stryMutAct_9fa48("5856") ? "" : (stryCov_9fa48("5856"), 'partition_id'), stryMutAct_9fa48("5857") ? "" : (stryCov_9fa48("5857"), 'partitionId'), stryMutAct_9fa48("5858") ? "" : (stryCov_9fa48("5858"), 'id'));
          if (stryMutAct_9fa48("5861") ? false : stryMutAct_9fa48("5860") ? true : stryMutAct_9fa48("5859") ? partitionId : (stryCov_9fa48("5859", "5860", "5861"), !partitionId)) {
            if (stryMutAct_9fa48("5862")) {
              {}
            } else {
              stryCov_9fa48("5862");
              continue;
            }
          }
          partitionIds.add(partitionId);
        }
      }
      return stryMutAct_9fa48("5863") ? {} : (stryCov_9fa48("5863"), {
        tableFound: stryMutAct_9fa48("5866") ? matchingTableRows.length > NUM.ZERO && matchingPartitionRows.length > NUM.ZERO : stryMutAct_9fa48("5865") ? false : stryMutAct_9fa48("5864") ? true : (stryCov_9fa48("5864", "5865", "5866"), (stryMutAct_9fa48("5869") ? matchingTableRows.length <= NUM.ZERO : stryMutAct_9fa48("5868") ? matchingTableRows.length >= NUM.ZERO : stryMutAct_9fa48("5867") ? false : (stryCov_9fa48("5867", "5868", "5869"), matchingTableRows.length > NUM.ZERO)) || (stryMutAct_9fa48("5872") ? matchingPartitionRows.length <= NUM.ZERO : stryMutAct_9fa48("5871") ? matchingPartitionRows.length >= NUM.ZERO : stryMutAct_9fa48("5870") ? false : (stryCov_9fa48("5870", "5871", "5872"), matchingPartitionRows.length > NUM.ZERO))),
        partitionIds,
        appliedSchemaVersion,
        cdcReadinessApplies
      });
    }
  } /**
    * Resolve table-scope schema readiness from active partition
    * coverage.
    * @param {Set<string>} partitionIds
    * @param {Array<Object>} serviceRows
    * @return {boolean}
    */
  resolveDiscoverySchemaReady(partitionIds, serviceRows) {
    if (stryMutAct_9fa48("5873")) {
      {}
    } else {
      stryCov_9fa48("5873");
      if (stryMutAct_9fa48("5876") ? !(partitionIds instanceof Set) && partitionIds.size === NUM.ZERO : stryMutAct_9fa48("5875") ? false : stryMutAct_9fa48("5874") ? true : (stryCov_9fa48("5874", "5875", "5876"), (stryMutAct_9fa48("5877") ? partitionIds instanceof Set : (stryCov_9fa48("5877"), !(partitionIds instanceof Set))) || (stryMutAct_9fa48("5879") ? partitionIds.size !== NUM.ZERO : stryMutAct_9fa48("5878") ? false : (stryCov_9fa48("5878", "5879"), partitionIds.size === NUM.ZERO)))) {
        if (stryMutAct_9fa48("5880")) {
          {}
        } else {
          stryCov_9fa48("5880");
          return stryMutAct_9fa48("5881") ? true : (stryCov_9fa48("5881"), false);
        }
      }
      const readyPartitionIds = new Set();
      for (const serviceRow of serviceRows) {
        if (stryMutAct_9fa48("5882")) {
          {}
        } else {
          stryCov_9fa48("5882");
          const serviceType = firstStringField(serviceRow, COLUMN.SERVICE_TYPE, stryMutAct_9fa48("5883") ? "" : (stryCov_9fa48("5883"), 'service_type'), stryMutAct_9fa48("5884") ? "" : (stryCov_9fa48("5884"), 'serviceType'), stryMutAct_9fa48("5885") ? "" : (stryCov_9fa48("5885"), 'type'));
          if (stryMutAct_9fa48("5888") ? serviceType === SERVICE_TYPE_PARTITION : stryMutAct_9fa48("5887") ? false : stryMutAct_9fa48("5886") ? true : (stryCov_9fa48("5886", "5887", "5888"), serviceType !== SERVICE_TYPE_PARTITION)) {
            if (stryMutAct_9fa48("5889")) {
              {}
            } else {
              stryCov_9fa48("5889");
              continue;
            }
          }
          const partitionId = firstStringField(serviceRow, COLUMN.PARTITION_ID, stryMutAct_9fa48("5890") ? "" : (stryCov_9fa48("5890"), 'partition_id'), stryMutAct_9fa48("5891") ? "" : (stryCov_9fa48("5891"), 'partitionId'), stryMutAct_9fa48("5892") ? "" : (stryCov_9fa48("5892"), 'id'));
          if (stryMutAct_9fa48("5895") ? !partitionId && !partitionIds.has(partitionId) : stryMutAct_9fa48("5894") ? false : stryMutAct_9fa48("5893") ? true : (stryCov_9fa48("5893", "5894", "5895"), (stryMutAct_9fa48("5896") ? partitionId : (stryCov_9fa48("5896"), !partitionId)) || (stryMutAct_9fa48("5897") ? partitionIds.has(partitionId) : (stryCov_9fa48("5897"), !partitionIds.has(partitionId))))) {
            if (stryMutAct_9fa48("5898")) {
              {}
            } else {
              stryCov_9fa48("5898");
              continue;
            }
          }
          const status = firstStringField(serviceRow, COLUMN.STATUS, stryMutAct_9fa48("5899") ? "" : (stryCov_9fa48("5899"), 'status'));
          if (stryMutAct_9fa48("5902") ? String(status || ADMIN_SERVICE_DISCOVERY_LITERAL.VALUE).toLowerCase() === STATUS_ACTIVE : stryMutAct_9fa48("5901") ? false : stryMutAct_9fa48("5900") ? true : (stryCov_9fa48("5900", "5901", "5902"), (stryMutAct_9fa48("5903") ? String(status || ADMIN_SERVICE_DISCOVERY_LITERAL.VALUE).toUpperCase() : (stryCov_9fa48("5903"), String(stryMutAct_9fa48("5906") ? status && ADMIN_SERVICE_DISCOVERY_LITERAL.VALUE : stryMutAct_9fa48("5905") ? false : stryMutAct_9fa48("5904") ? true : (stryCov_9fa48("5904", "5905", "5906"), status || ADMIN_SERVICE_DISCOVERY_LITERAL.VALUE)).toLowerCase())) !== STATUS_ACTIVE)) {
            if (stryMutAct_9fa48("5907")) {
              {}
            } else {
              stryCov_9fa48("5907");
              continue;
            }
          }
          const nodeId = firstStringField(serviceRow, COLUMN.NODE_ID, stryMutAct_9fa48("5908") ? "" : (stryCov_9fa48("5908"), 'node_id'), stryMutAct_9fa48("5909") ? "" : (stryCov_9fa48("5909"), 'nodeId'));
          if (stryMutAct_9fa48("5912") ? false : stryMutAct_9fa48("5911") ? true : stryMutAct_9fa48("5910") ? nodeId : (stryCov_9fa48("5910", "5911", "5912"), !nodeId)) {
            if (stryMutAct_9fa48("5913")) {
              {}
            } else {
              stryCov_9fa48("5913");
              continue;
            }
          }
          readyPartitionIds.add(partitionId);
        }
      }
      return stryMutAct_9fa48("5916") ? readyPartitionIds.size !== partitionIds.size : stryMutAct_9fa48("5915") ? false : stryMutAct_9fa48("5914") ? true : (stryCov_9fa48("5914", "5915", "5916"), readyPartitionIds.size === partitionIds.size);
    }
  } /**
    * Resolve leader-coverage stability for target partitions.
    * @param {Set<string>} partitionIds
    * @param {Array<Object>} partitionRows
    * @param {Array<Object>} serviceRows
    * @return {boolean}
    */
  resolveDiscoveryLeadershipStable(partitionIds, partitionRows, serviceRows) {
    if (stryMutAct_9fa48("5917")) {
      {}
    } else {
      stryCov_9fa48("5917");
      if (stryMutAct_9fa48("5920") ? !(partitionIds instanceof Set) && partitionIds.size === NUM.ZERO : stryMutAct_9fa48("5919") ? false : stryMutAct_9fa48("5918") ? true : (stryCov_9fa48("5918", "5919", "5920"), (stryMutAct_9fa48("5921") ? partitionIds instanceof Set : (stryCov_9fa48("5921"), !(partitionIds instanceof Set))) || (stryMutAct_9fa48("5923") ? partitionIds.size !== NUM.ZERO : stryMutAct_9fa48("5922") ? false : (stryCov_9fa48("5922", "5923"), partitionIds.size === NUM.ZERO)))) {
        if (stryMutAct_9fa48("5924")) {
          {}
        } else {
          stryCov_9fa48("5924");
          return stryMutAct_9fa48("5925") ? false : (stryCov_9fa48("5925"), true);
        }
      }
      const activeReplicaNodeIdsByPartition = new Map();
      const advisoryLeaderPartitionIds = new Set();
      for (const serviceRow of serviceRows) {
        if (stryMutAct_9fa48("5926")) {
          {}
        } else {
          stryCov_9fa48("5926");
          const serviceType = firstStringField(serviceRow, COLUMN.SERVICE_TYPE, stryMutAct_9fa48("5927") ? "" : (stryCov_9fa48("5927"), 'service_type'), stryMutAct_9fa48("5928") ? "" : (stryCov_9fa48("5928"), 'serviceType'), stryMutAct_9fa48("5929") ? "" : (stryCov_9fa48("5929"), 'type'));
          if (stryMutAct_9fa48("5932") ? serviceType === SERVICE_TYPE_PARTITION : stryMutAct_9fa48("5931") ? false : stryMutAct_9fa48("5930") ? true : (stryCov_9fa48("5930", "5931", "5932"), serviceType !== SERVICE_TYPE_PARTITION)) {
            if (stryMutAct_9fa48("5933")) {
              {}
            } else {
              stryCov_9fa48("5933");
              continue;
            }
          }
          const partitionId = firstStringField(serviceRow, COLUMN.PARTITION_ID, stryMutAct_9fa48("5934") ? "" : (stryCov_9fa48("5934"), 'partition_id'), stryMutAct_9fa48("5935") ? "" : (stryCov_9fa48("5935"), 'partitionId'), stryMutAct_9fa48("5936") ? "" : (stryCov_9fa48("5936"), 'id'));
          if (stryMutAct_9fa48("5939") ? !partitionId && !partitionIds.has(partitionId) : stryMutAct_9fa48("5938") ? false : stryMutAct_9fa48("5937") ? true : (stryCov_9fa48("5937", "5938", "5939"), (stryMutAct_9fa48("5940") ? partitionId : (stryCov_9fa48("5940"), !partitionId)) || (stryMutAct_9fa48("5941") ? partitionIds.has(partitionId) : (stryCov_9fa48("5941"), !partitionIds.has(partitionId))))) {
            if (stryMutAct_9fa48("5942")) {
              {}
            } else {
              stryCov_9fa48("5942");
              continue;
            }
          }
          const status = firstStringField(serviceRow, COLUMN.STATUS, stryMutAct_9fa48("5943") ? "" : (stryCov_9fa48("5943"), 'status'));
          if (stryMutAct_9fa48("5946") ? String(status || ADMIN_SERVICE_DISCOVERY_LITERAL.VALUE).toLowerCase() === STATUS_ACTIVE : stryMutAct_9fa48("5945") ? false : stryMutAct_9fa48("5944") ? true : (stryCov_9fa48("5944", "5945", "5946"), (stryMutAct_9fa48("5947") ? String(status || ADMIN_SERVICE_DISCOVERY_LITERAL.VALUE).toUpperCase() : (stryCov_9fa48("5947"), String(stryMutAct_9fa48("5950") ? status && ADMIN_SERVICE_DISCOVERY_LITERAL.VALUE : stryMutAct_9fa48("5949") ? false : stryMutAct_9fa48("5948") ? true : (stryCov_9fa48("5948", "5949", "5950"), status || ADMIN_SERVICE_DISCOVERY_LITERAL.VALUE)).toLowerCase())) !== STATUS_ACTIVE)) {
            if (stryMutAct_9fa48("5951")) {
              {}
            } else {
              stryCov_9fa48("5951");
              continue;
            }
          }
          const nodeId = firstStringField(serviceRow, COLUMN.NODE_ID, stryMutAct_9fa48("5952") ? "" : (stryCov_9fa48("5952"), 'node_id'), stryMutAct_9fa48("5953") ? "" : (stryCov_9fa48("5953"), 'nodeId'));
          if (stryMutAct_9fa48("5956") ? false : stryMutAct_9fa48("5955") ? true : stryMutAct_9fa48("5954") ? nodeId : (stryCov_9fa48("5954", "5955", "5956"), !nodeId)) {
            if (stryMutAct_9fa48("5957")) {
              {}
            } else {
              stryCov_9fa48("5957");
              continue;
            }
          }
          let activeReplicaNodeIds = activeReplicaNodeIdsByPartition.get(partitionId);
          if (stryMutAct_9fa48("5960") ? false : stryMutAct_9fa48("5959") ? true : stryMutAct_9fa48("5958") ? activeReplicaNodeIds : (stryCov_9fa48("5958", "5959", "5960"), !activeReplicaNodeIds)) {
            if (stryMutAct_9fa48("5961")) {
              {}
            } else {
              stryCov_9fa48("5961");
              activeReplicaNodeIds = new Set();
              activeReplicaNodeIdsByPartition.set(partitionId, activeReplicaNodeIds);
            }
          }
          activeReplicaNodeIds.add(nodeId);
          const raftRole = firstStringField(serviceRow, COLUMN.RAFT_ROLE, stryMutAct_9fa48("5962") ? "" : (stryCov_9fa48("5962"), 'raft_role'), stryMutAct_9fa48("5963") ? "" : (stryCov_9fa48("5963"), 'raftRole'));
          if (stryMutAct_9fa48("5966") ? String(raftRole || ADMIN_SERVICE_DISCOVERY_LITERAL.VALUE).toLowerCase() === LEADER_RAFT_ROLE : stryMutAct_9fa48("5965") ? false : stryMutAct_9fa48("5964") ? true : (stryCov_9fa48("5964", "5965", "5966"), (stryMutAct_9fa48("5967") ? String(raftRole || ADMIN_SERVICE_DISCOVERY_LITERAL.VALUE).toUpperCase() : (stryCov_9fa48("5967"), String(stryMutAct_9fa48("5970") ? raftRole && ADMIN_SERVICE_DISCOVERY_LITERAL.VALUE : stryMutAct_9fa48("5969") ? false : stryMutAct_9fa48("5968") ? true : (stryCov_9fa48("5968", "5969", "5970"), raftRole || ADMIN_SERVICE_DISCOVERY_LITERAL.VALUE)).toLowerCase())) !== LEADER_RAFT_ROLE)) {
            if (stryMutAct_9fa48("5971")) {
              {}
            } else {
              stryCov_9fa48("5971");
              continue;
            }
          }
          advisoryLeaderPartitionIds.add(partitionId);
        }
      }
      const partitionRowsById = new Map();
      for (const partitionRow of partitionRows) {
        if (stryMutAct_9fa48("5972")) {
          {}
        } else {
          stryCov_9fa48("5972");
          const partitionId = firstStringField(partitionRow, COLUMN.PARTITION_ID, stryMutAct_9fa48("5973") ? "" : (stryCov_9fa48("5973"), 'partition_id'), stryMutAct_9fa48("5974") ? "" : (stryCov_9fa48("5974"), 'partitionId'), stryMutAct_9fa48("5975") ? "" : (stryCov_9fa48("5975"), 'id'));
          if (stryMutAct_9fa48("5978") ? (!partitionId || !partitionIds.has(partitionId)) && partitionRowsById.has(partitionId) : stryMutAct_9fa48("5977") ? false : stryMutAct_9fa48("5976") ? true : (stryCov_9fa48("5976", "5977", "5978"), (stryMutAct_9fa48("5980") ? !partitionId && !partitionIds.has(partitionId) : stryMutAct_9fa48("5979") ? false : (stryCov_9fa48("5979", "5980"), (stryMutAct_9fa48("5981") ? partitionId : (stryCov_9fa48("5981"), !partitionId)) || (stryMutAct_9fa48("5982") ? partitionIds.has(partitionId) : (stryCov_9fa48("5982"), !partitionIds.has(partitionId))))) || partitionRowsById.has(partitionId))) {
            if (stryMutAct_9fa48("5983")) {
              {}
            } else {
              stryCov_9fa48("5983");
              continue;
            }
          }
          partitionRowsById.set(partitionId, partitionRow);
        }
      }
      for (const partitionId of partitionIds) {
        if (stryMutAct_9fa48("5984")) {
          {}
        } else {
          stryCov_9fa48("5984");
          const partitionRow = stryMutAct_9fa48("5987") ? partitionRowsById.get(partitionId) && null : stryMutAct_9fa48("5986") ? false : stryMutAct_9fa48("5985") ? true : (stryCov_9fa48("5985", "5986", "5987"), partitionRowsById.get(partitionId) || null);
          const canonicalLeaderNodeId = firstStringField(partitionRow, COLUMN.LEADER_NODE_ID, stryMutAct_9fa48("5988") ? "" : (stryCov_9fa48("5988"), 'leader_node_id'), stryMutAct_9fa48("5989") ? "" : (stryCov_9fa48("5989"), 'leaderNodeId'));
          if (stryMutAct_9fa48("5991") ? false : stryMutAct_9fa48("5990") ? true : (stryCov_9fa48("5990", "5991"), canonicalLeaderNodeId)) {
            if (stryMutAct_9fa48("5992")) {
              {}
            } else {
              stryCov_9fa48("5992");
              const activeReplicaNodeIds = activeReplicaNodeIdsByPartition.get(partitionId);
              if (stryMutAct_9fa48("5995") ? !(activeReplicaNodeIds instanceof Set) && !activeReplicaNodeIds.has(canonicalLeaderNodeId) : stryMutAct_9fa48("5994") ? false : stryMutAct_9fa48("5993") ? true : (stryCov_9fa48("5993", "5994", "5995"), (stryMutAct_9fa48("5996") ? activeReplicaNodeIds instanceof Set : (stryCov_9fa48("5996"), !(activeReplicaNodeIds instanceof Set))) || (stryMutAct_9fa48("5997") ? activeReplicaNodeIds.has(canonicalLeaderNodeId) : (stryCov_9fa48("5997"), !activeReplicaNodeIds.has(canonicalLeaderNodeId))))) {
                if (stryMutAct_9fa48("5998")) {
                  {}
                } else {
                  stryCov_9fa48("5998");
                  return stryMutAct_9fa48("5999") ? true : (stryCov_9fa48("5999"), false);
                }
              }
              continue;
            }
          }
          const bootstrapLeaderNodeId = this.resolveDiscoveryBootstrapLeaderNodeId(partitionId);
          if (stryMutAct_9fa48("6001") ? false : stryMutAct_9fa48("6000") ? true : (stryCov_9fa48("6000", "6001"), bootstrapLeaderNodeId)) {
            if (stryMutAct_9fa48("6002")) {
              {}
            } else {
              stryCov_9fa48("6002");
              const activeReplicaNodeIds = activeReplicaNodeIdsByPartition.get(partitionId);
              if (stryMutAct_9fa48("6005") ? activeReplicaNodeIds instanceof Set || activeReplicaNodeIds.has(bootstrapLeaderNodeId) : stryMutAct_9fa48("6004") ? false : stryMutAct_9fa48("6003") ? true : (stryCov_9fa48("6003", "6004", "6005"), activeReplicaNodeIds instanceof Set && activeReplicaNodeIds.has(bootstrapLeaderNodeId))) {
                if (stryMutAct_9fa48("6006")) {
                  {}
                } else {
                  stryCov_9fa48("6006");
                  continue;
                }
              }
            }
          }
          if (stryMutAct_9fa48("6009") ? false : stryMutAct_9fa48("6008") ? true : stryMutAct_9fa48("6007") ? advisoryLeaderPartitionIds.has(partitionId) : (stryCov_9fa48("6007", "6008", "6009"), !advisoryLeaderPartitionIds.has(partitionId))) {
            if (stryMutAct_9fa48("6010")) {
              {}
            } else {
              stryCov_9fa48("6010");
              return stryMutAct_9fa48("6011") ? true : (stryCov_9fa48("6011"), false);
            }
          }
        }
      }
      return stryMutAct_9fa48("6012") ? false : (stryCov_9fa48("6012"), true);
    }
  } /**
    * Resolve one fresh bootstrap leader from the SQL engine routing overlay
    * when cache owner metadata still lacks leader_node_id.
    * @param {string} partitionId
    * @return {string|null}
    */
  resolveDiscoveryBootstrapLeaderNodeId(partitionId) {
    if (stryMutAct_9fa48("6013")) {
      {}
    } else {
      stryCov_9fa48("6013");
      if (stryMutAct_9fa48("6016") ? typeof partitionId !== TYPEOF.STRING && partitionId.length === NUM.ZERO : stryMutAct_9fa48("6015") ? false : stryMutAct_9fa48("6014") ? true : (stryCov_9fa48("6014", "6015", "6016"), (stryMutAct_9fa48("6018") ? typeof partitionId === TYPEOF.STRING : stryMutAct_9fa48("6017") ? false : (stryCov_9fa48("6017", "6018"), typeof partitionId !== TYPEOF.STRING)) || (stryMutAct_9fa48("6020") ? partitionId.length !== NUM.ZERO : stryMutAct_9fa48("6019") ? false : (stryCov_9fa48("6019", "6020"), partitionId.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("6021")) {
          {}
        } else {
          stryCov_9fa48("6021");
          return null;
        }
      }
      const queryExecutor = stryMutAct_9fa48("6024") ? this.sqlQueryEngine?.queryExecutor && null : stryMutAct_9fa48("6023") ? false : stryMutAct_9fa48("6022") ? true : (stryCov_9fa48("6022", "6023", "6024"), (stryMutAct_9fa48("6025") ? this.sqlQueryEngine.queryExecutor : (stryCov_9fa48("6025"), this.sqlQueryEngine?.queryExecutor)) || null);
      if (stryMutAct_9fa48("6028") ? !queryExecutor && typeof queryExecutor.getPartitionRoutingSnapshot !== TYPEOF.FUNCTION : stryMutAct_9fa48("6027") ? false : stryMutAct_9fa48("6026") ? true : (stryCov_9fa48("6026", "6027", "6028"), (stryMutAct_9fa48("6029") ? queryExecutor : (stryCov_9fa48("6029"), !queryExecutor)) || (stryMutAct_9fa48("6031") ? typeof queryExecutor.getPartitionRoutingSnapshot === TYPEOF.FUNCTION : stryMutAct_9fa48("6030") ? false : (stryCov_9fa48("6030", "6031"), typeof queryExecutor.getPartitionRoutingSnapshot !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("6032")) {
          {}
        } else {
          stryCov_9fa48("6032");
          return null;
        }
      }
      try {
        if (stryMutAct_9fa48("6033")) {
          {}
        } else {
          stryCov_9fa48("6033");
          const routingSnapshot = queryExecutor.getPartitionRoutingSnapshot(partitionId);
          const canonicalLeaderNodeId = firstStringField(routingSnapshot, stryMutAct_9fa48("6034") ? "" : (stryCov_9fa48("6034"), 'canonicalLeaderNodeId'));
          if (stryMutAct_9fa48("6037") ? false : stryMutAct_9fa48("6036") ? true : stryMutAct_9fa48("6035") ? canonicalLeaderNodeId : (stryCov_9fa48("6035", "6036", "6037"), !canonicalLeaderNodeId)) {
            if (stryMutAct_9fa48("6038")) {
              {}
            } else {
              stryCov_9fa48("6038");
              return null;
            }
          }
          const canonicalLeaderServiceCount = Number(stryMutAct_9fa48("6039") ? routingSnapshot.canonicalLeaderServiceCount : (stryCov_9fa48("6039"), routingSnapshot?.canonicalLeaderServiceCount));
          return (stryMutAct_9fa48("6043") ? canonicalLeaderServiceCount <= NUM.ZERO : stryMutAct_9fa48("6042") ? canonicalLeaderServiceCount >= NUM.ZERO : stryMutAct_9fa48("6041") ? false : stryMutAct_9fa48("6040") ? true : (stryCov_9fa48("6040", "6041", "6042", "6043"), canonicalLeaderServiceCount > NUM.ZERO)) ? canonicalLeaderNodeId : null;
        }
      } catch (_error) {
        if (stryMutAct_9fa48("6044")) {
          {}
        } else {
          stryCov_9fa48("6044");
          return null;
        }
      }
    }
  } /**
    * Build additive canonical readiness block for one discovery
    * replica.
    * @param {Object} replica
    * @param {Object} readinessContext
    * @return {Object}
    */
  buildServiceDiscoveryReplicaReadiness(replica, readinessContext) {
    if (stryMutAct_9fa48("6045")) {
      {}
    } else {
      stryCov_9fa48("6045");
      const nodeId = String(stryMutAct_9fa48("6048") ? replica?.nodeId && '' : stryMutAct_9fa48("6047") ? false : stryMutAct_9fa48("6046") ? true : (stryCov_9fa48("6046", "6047", "6048"), (stryMutAct_9fa48("6049") ? replica.nodeId : (stryCov_9fa48("6049"), replica?.nodeId)) || (stryMutAct_9fa48("6050") ? "Stryker was here!" : (stryCov_9fa48("6050"), ''))));
      const healthyEndpoint = stryMutAct_9fa48("6053") ? String(replica?.healthStatus || '').toLowerCase() !== ENDPOINT_SYNC_HEALTH.HEALTHY : stryMutAct_9fa48("6052") ? false : stryMutAct_9fa48("6051") ? true : (stryCov_9fa48("6051", "6052", "6053"), (stryMutAct_9fa48("6054") ? String(replica?.healthStatus || '').toUpperCase() : (stryCov_9fa48("6054"), String(stryMutAct_9fa48("6057") ? replica?.healthStatus && '' : stryMutAct_9fa48("6056") ? false : stryMutAct_9fa48("6055") ? true : (stryCov_9fa48("6055", "6056", "6057"), (stryMutAct_9fa48("6058") ? replica.healthStatus : (stryCov_9fa48("6058"), replica?.healthStatus)) || (stryMutAct_9fa48("6059") ? "Stryker was here!" : (stryCov_9fa48("6059"), '')))).toLowerCase())) === ENDPOINT_SYNC_HEALTH.HEALTHY);
      const routingReady = stryMutAct_9fa48("6062") ? healthyEndpoint || readinessContext.activeNodeIds.has(nodeId) : stryMutAct_9fa48("6061") ? false : stryMutAct_9fa48("6060") ? true : (stryCov_9fa48("6060", "6061", "6062"), healthyEndpoint && readinessContext.activeNodeIds.has(nodeId));
      const schemaReady = readinessContext.tableName ? stryMutAct_9fa48("6065") ? readinessContext.tableFound || readinessContext.schemaReady === true : stryMutAct_9fa48("6064") ? false : stryMutAct_9fa48("6063") ? true : (stryCov_9fa48("6063", "6064", "6065"), readinessContext.tableFound && (stryMutAct_9fa48("6067") ? readinessContext.schemaReady !== true : stryMutAct_9fa48("6066") ? true : (stryCov_9fa48("6066", "6067"), readinessContext.schemaReady === (stryMutAct_9fa48("6068") ? false : (stryCov_9fa48("6068"), true))))) : stryMutAct_9fa48("6069") ? false : (stryCov_9fa48("6069"), true);
      const localTargetReplicaState = readinessContext.localTargetReplicaStateByNodeId instanceof Map ? readinessContext.localTargetReplicaStateByNodeId.get(nodeId) : null;
      const localReplicaReady = stryMutAct_9fa48("6072") ? !localTargetReplicaState && localTargetReplicaState.nonVoterPartitionIds.size === NUM.ZERO : stryMutAct_9fa48("6071") ? false : stryMutAct_9fa48("6070") ? true : (stryCov_9fa48("6070", "6071", "6072"), (stryMutAct_9fa48("6073") ? localTargetReplicaState : (stryCov_9fa48("6073"), !localTargetReplicaState)) || (stryMutAct_9fa48("6075") ? localTargetReplicaState.nonVoterPartitionIds.size !== NUM.ZERO : stryMutAct_9fa48("6074") ? false : (stryCov_9fa48("6074", "6075"), localTargetReplicaState.nonVoterPartitionIds.size === NUM.ZERO)));
      const localPartitionCdcState = (stryMutAct_9fa48("6078") ? nodeId === this.nodeId && readinessContext.localPartitionCdcState || typeof readinessContext.localPartitionCdcState === TYPEOF.OBJECT : stryMutAct_9fa48("6077") ? false : stryMutAct_9fa48("6076") ? true : (stryCov_9fa48("6076", "6077", "6078"), (stryMutAct_9fa48("6080") ? nodeId === this.nodeId || readinessContext.localPartitionCdcState : stryMutAct_9fa48("6079") ? true : (stryCov_9fa48("6079", "6080"), (stryMutAct_9fa48("6082") ? nodeId !== this.nodeId : stryMutAct_9fa48("6081") ? true : (stryCov_9fa48("6081", "6082"), nodeId === this.nodeId)) && readinessContext.localPartitionCdcState)) && (stryMutAct_9fa48("6084") ? typeof readinessContext.localPartitionCdcState !== TYPEOF.OBJECT : stryMutAct_9fa48("6083") ? true : (stryCov_9fa48("6083", "6084"), typeof readinessContext.localPartitionCdcState === TYPEOF.OBJECT)))) ? readinessContext.localPartitionCdcState : null;
      const localCdcReady = stryMutAct_9fa48("6087") ? (!localPartitionCdcState || localPartitionCdcState.applies !== true) && localPartitionCdcState.ready === true : stryMutAct_9fa48("6086") ? false : stryMutAct_9fa48("6085") ? true : (stryCov_9fa48("6085", "6086", "6087"), (stryMutAct_9fa48("6089") ? !localPartitionCdcState && localPartitionCdcState.applies !== true : stryMutAct_9fa48("6088") ? false : (stryCov_9fa48("6088", "6089"), (stryMutAct_9fa48("6090") ? localPartitionCdcState : (stryCov_9fa48("6090"), !localPartitionCdcState)) || (stryMutAct_9fa48("6092") ? localPartitionCdcState.applies === true : stryMutAct_9fa48("6091") ? false : (stryCov_9fa48("6091", "6092"), localPartitionCdcState.applies !== (stryMutAct_9fa48("6093") ? false : (stryCov_9fa48("6093"), true)))))) || (stryMutAct_9fa48("6095") ? localPartitionCdcState.ready !== true : stryMutAct_9fa48("6094") ? false : (stryCov_9fa48("6094", "6095"), localPartitionCdcState.ready === (stryMutAct_9fa48("6096") ? false : (stryCov_9fa48("6096"), true)))));
      const operationDegradation = readinessContext.replicaOperationDegradationByNodeId instanceof Map ? readinessContext.replicaOperationDegradationByNodeId.get(nodeId) : null;
      const operationDegraded = stryMutAct_9fa48("6099") ? operationDegradation?.degradationState || operationDegradation.degradationState !== BENCHMARK_DEGRADATION_STATE.HEALTHY : stryMutAct_9fa48("6098") ? false : stryMutAct_9fa48("6097") ? true : (stryCov_9fa48("6097", "6098", "6099"), (stryMutAct_9fa48("6100") ? operationDegradation.degradationState : (stryCov_9fa48("6100"), operationDegradation?.degradationState)) && (stryMutAct_9fa48("6102") ? operationDegradation.degradationState === BENCHMARK_DEGRADATION_STATE.HEALTHY : stryMutAct_9fa48("6101") ? true : (stryCov_9fa48("6101", "6102"), operationDegradation.degradationState !== BENCHMARK_DEGRADATION_STATE.HEALTHY)));
      const topologyReady = stryMutAct_9fa48("6105") ? localReplicaReady && localCdcReady && !operationDegraded || readinessContext.leadershipStable === true : stryMutAct_9fa48("6104") ? false : stryMutAct_9fa48("6103") ? true : (stryCov_9fa48("6103", "6104", "6105"), (stryMutAct_9fa48("6107") ? localReplicaReady && localCdcReady || !operationDegraded : stryMutAct_9fa48("6106") ? true : (stryCov_9fa48("6106", "6107"), (stryMutAct_9fa48("6109") ? localReplicaReady || localCdcReady : stryMutAct_9fa48("6108") ? true : (stryCov_9fa48("6108", "6109"), localReplicaReady && localCdcReady)) && (stryMutAct_9fa48("6110") ? operationDegraded : (stryCov_9fa48("6110"), !operationDegraded)))) && (stryMutAct_9fa48("6112") ? readinessContext.leadershipStable !== true : stryMutAct_9fa48("6111") ? true : (stryCov_9fa48("6111", "6112"), readinessContext.leadershipStable === (stryMutAct_9fa48("6113") ? false : (stryCov_9fa48("6113"), true)))));
      const benchmarkReady = stryMutAct_9fa48("6116") ? routingReady && schemaReady || topologyReady : stryMutAct_9fa48("6115") ? false : stryMutAct_9fa48("6114") ? true : (stryCov_9fa48("6114", "6115", "6116"), (stryMutAct_9fa48("6118") ? routingReady || schemaReady : stryMutAct_9fa48("6117") ? true : (stryCov_9fa48("6117", "6118"), routingReady && schemaReady)) && topologyReady);
      const workloadReady = benchmarkReady;
      const reasons = stryMutAct_9fa48("6119") ? ["Stryker was here"] : (stryCov_9fa48("6119"), []);
      if (stryMutAct_9fa48("6122") ? false : stryMutAct_9fa48("6121") ? true : stryMutAct_9fa48("6120") ? routingReady : (stryCov_9fa48("6120", "6121", "6122"), !routingReady)) {
        if (stryMutAct_9fa48("6123")) {
          {}
        } else {
          stryCov_9fa48("6123");
          reasons.push(stryMutAct_9fa48("6124") ? {} : (stryCov_9fa48("6124"), {
            code: SERVICE_DISCOVERY_READINESS_REASON.ROUTING_NOT_READY,
            detail: ADMIN_SERVICE_DISCOVERY_LITERAL.ENDPOINT_UNHEALTHY_OR_NODE_NOT_ACTIVE
          }));
        }
      }
      if (stryMutAct_9fa48("6127") ? readinessContext.tableName || !readinessContext.tableFound : stryMutAct_9fa48("6126") ? false : stryMutAct_9fa48("6125") ? true : (stryCov_9fa48("6125", "6126", "6127"), readinessContext.tableName && (stryMutAct_9fa48("6128") ? readinessContext.tableFound : (stryCov_9fa48("6128"), !readinessContext.tableFound)))) {
        if (stryMutAct_9fa48("6129")) {
          {}
        } else {
          stryCov_9fa48("6129");
          reasons.push(stryMutAct_9fa48("6130") ? {} : (stryCov_9fa48("6130"), {
            code: SERVICE_DISCOVERY_READINESS_REASON.SCHEMA_TABLE_MISSING,
            detail: stryMutAct_9fa48("6131") ? ADMIN_SERVICE_DISCOVERY_LITERAL.TABLE + readinessContext.tableName - ADMIN_SERVICE_DISCOVERY_LITERAL.NOT_FOUND : (stryCov_9fa48("6131"), (stryMutAct_9fa48("6132") ? ADMIN_SERVICE_DISCOVERY_LITERAL.TABLE - readinessContext.tableName : (stryCov_9fa48("6132"), ADMIN_SERVICE_DISCOVERY_LITERAL.TABLE + readinessContext.tableName)) + ADMIN_SERVICE_DISCOVERY_LITERAL.NOT_FOUND)
          }));
        }
      } else if (stryMutAct_9fa48("6135") ? readinessContext.tableName || !schemaReady : stryMutAct_9fa48("6134") ? false : stryMutAct_9fa48("6133") ? true : (stryCov_9fa48("6133", "6134", "6135"), readinessContext.tableName && (stryMutAct_9fa48("6136") ? schemaReady : (stryCov_9fa48("6136"), !schemaReady)))) {
        if (stryMutAct_9fa48("6137")) {
          {}
        } else {
          stryCov_9fa48("6137");
          reasons.push(stryMutAct_9fa48("6138") ? {} : (stryCov_9fa48("6138"), {
            code: SERVICE_DISCOVERY_READINESS_REASON.SCHEMA_PARTITION_UNAVAILABLE,
            detail: stryMutAct_9fa48("6139") ? ADMIN_SERVICE_DISCOVERY_LITERAL.TABLE + readinessContext.tableName - ADMIN_SERVICE_DISCOVERY_LITERAL.NOT_QUERY_READY_ON_NODE : (stryCov_9fa48("6139"), (stryMutAct_9fa48("6140") ? ADMIN_SERVICE_DISCOVERY_LITERAL.TABLE - readinessContext.tableName : (stryCov_9fa48("6140"), ADMIN_SERVICE_DISCOVERY_LITERAL.TABLE + readinessContext.tableName)) + ADMIN_SERVICE_DISCOVERY_LITERAL.NOT_QUERY_READY_ON_NODE)
          }));
        }
      }
      if (stryMutAct_9fa48("6143") ? operationDegraded || Array.isArray(operationDegradation?.reasons) : stryMutAct_9fa48("6142") ? false : stryMutAct_9fa48("6141") ? true : (stryCov_9fa48("6141", "6142", "6143"), operationDegraded && Array.isArray(stryMutAct_9fa48("6144") ? operationDegradation.reasons : (stryCov_9fa48("6144"), operationDegradation?.reasons)))) {
        if (stryMutAct_9fa48("6145")) {
          {}
        } else {
          stryCov_9fa48("6145");
          for (const reason of operationDegradation.reasons) {
            if (stryMutAct_9fa48("6146")) {
              {}
            } else {
              stryCov_9fa48("6146");
              reasons.push(stryMutAct_9fa48("6147") ? {} : (stryCov_9fa48("6147"), {
                code: reason.code,
                detail: reason.detail
              }));
            }
          }
        }
      }
      if (stryMutAct_9fa48("6150") ? false : stryMutAct_9fa48("6149") ? true : stryMutAct_9fa48("6148") ? readinessContext.leadershipStable : (stryCov_9fa48("6148", "6149", "6150"), !readinessContext.leadershipStable)) {
        if (stryMutAct_9fa48("6151")) {
          {}
        } else {
          stryCov_9fa48("6151");
          reasons.push(stryMutAct_9fa48("6152") ? {} : (stryCov_9fa48("6152"), {
            code: SERVICE_DISCOVERY_READINESS_REASON.LEADERSHIP_UNSTABLE,
            detail: ADMIN_SERVICE_DISCOVERY_LITERAL.LEADER_COVERAGE_INCOMPLETE_FOR_READINESS_SCOPE
          }));
        }
      }
      if (stryMutAct_9fa48("6155") ? false : stryMutAct_9fa48("6154") ? true : stryMutAct_9fa48("6153") ? localReplicaReady : (stryCov_9fa48("6153", "6154", "6155"), !localReplicaReady)) {
        if (stryMutAct_9fa48("6156")) {
          {}
        } else {
          stryCov_9fa48("6156");
          reasons.push(stryMutAct_9fa48("6157") ? {} : (stryCov_9fa48("6157"), {
            code: SERVICE_DISCOVERY_READINESS_REASON.LOCAL_REPLICA_NOT_VOTER_READY,
            detail: uniqueSorted(stryMutAct_9fa48("6158") ? [] : (stryCov_9fa48("6158"), [...localTargetReplicaState.nonVoterPartitionIds])).join(ADMIN_SERVICE_DISCOVERY_LITERAL.VALUE_3)
          }));
        }
      }
      if (stryMutAct_9fa48("6161") ? localPartitionCdcState?.applies === true && localPartitionCdcState.diagnosticsAvailable === false || localPartitionCdcState.missingDiagnosticsPartitionIds.length > NUM.ZERO : stryMutAct_9fa48("6160") ? false : stryMutAct_9fa48("6159") ? true : (stryCov_9fa48("6159", "6160", "6161"), (stryMutAct_9fa48("6163") ? localPartitionCdcState?.applies === true || localPartitionCdcState.diagnosticsAvailable === false : stryMutAct_9fa48("6162") ? true : (stryCov_9fa48("6162", "6163"), (stryMutAct_9fa48("6165") ? localPartitionCdcState?.applies !== true : stryMutAct_9fa48("6164") ? true : (stryCov_9fa48("6164", "6165"), (stryMutAct_9fa48("6166") ? localPartitionCdcState.applies : (stryCov_9fa48("6166"), localPartitionCdcState?.applies)) === (stryMutAct_9fa48("6167") ? false : (stryCov_9fa48("6167"), true)))) && (stryMutAct_9fa48("6169") ? localPartitionCdcState.diagnosticsAvailable !== false : stryMutAct_9fa48("6168") ? true : (stryCov_9fa48("6168", "6169"), localPartitionCdcState.diagnosticsAvailable === (stryMutAct_9fa48("6170") ? true : (stryCov_9fa48("6170"), false)))))) && (stryMutAct_9fa48("6173") ? localPartitionCdcState.missingDiagnosticsPartitionIds.length <= NUM.ZERO : stryMutAct_9fa48("6172") ? localPartitionCdcState.missingDiagnosticsPartitionIds.length >= NUM.ZERO : stryMutAct_9fa48("6171") ? true : (stryCov_9fa48("6171", "6172", "6173"), localPartitionCdcState.missingDiagnosticsPartitionIds.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("6174")) {
          {}
        } else {
          stryCov_9fa48("6174");
          reasons.push(stryMutAct_9fa48("6175") ? {} : (stryCov_9fa48("6175"), {
            code: SERVICE_DISCOVERY_READINESS_REASON.LOCAL_CDC_DIAGNOSTICS_UNAVAILABLE,
            detail: localPartitionCdcState.missingDiagnosticsPartitionIds.join(ADMIN_SERVICE_DISCOVERY_LITERAL.VALUE_3)
          }));
        }
      }
      if (stryMutAct_9fa48("6178") ? localPartitionCdcState?.applies === true || localPartitionCdcState.noSubscriberPartitionIds.length > NUM.ZERO : stryMutAct_9fa48("6177") ? false : stryMutAct_9fa48("6176") ? true : (stryCov_9fa48("6176", "6177", "6178"), (stryMutAct_9fa48("6180") ? localPartitionCdcState?.applies !== true : stryMutAct_9fa48("6179") ? true : (stryCov_9fa48("6179", "6180"), (stryMutAct_9fa48("6181") ? localPartitionCdcState.applies : (stryCov_9fa48("6181"), localPartitionCdcState?.applies)) === (stryMutAct_9fa48("6182") ? false : (stryCov_9fa48("6182"), true)))) && (stryMutAct_9fa48("6185") ? localPartitionCdcState.noSubscriberPartitionIds.length <= NUM.ZERO : stryMutAct_9fa48("6184") ? localPartitionCdcState.noSubscriberPartitionIds.length >= NUM.ZERO : stryMutAct_9fa48("6183") ? true : (stryCov_9fa48("6183", "6184", "6185"), localPartitionCdcState.noSubscriberPartitionIds.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("6186")) {
          {}
        } else {
          stryCov_9fa48("6186");
          reasons.push(stryMutAct_9fa48("6187") ? {} : (stryCov_9fa48("6187"), {
            code: SERVICE_DISCOVERY_READINESS_REASON.LOCAL_CDC_SUBSCRIBER_MISSING,
            detail: localPartitionCdcState.noSubscriberPartitionIds.join(ADMIN_SERVICE_DISCOVERY_LITERAL.VALUE_3)
          }));
        }
      }
      if (stryMutAct_9fa48("6190") ? localPartitionCdcState?.applies === true || localPartitionCdcState.bufferedPartitionIds.length > NUM.ZERO : stryMutAct_9fa48("6189") ? false : stryMutAct_9fa48("6188") ? true : (stryCov_9fa48("6188", "6189", "6190"), (stryMutAct_9fa48("6192") ? localPartitionCdcState?.applies !== true : stryMutAct_9fa48("6191") ? true : (stryCov_9fa48("6191", "6192"), (stryMutAct_9fa48("6193") ? localPartitionCdcState.applies : (stryCov_9fa48("6193"), localPartitionCdcState?.applies)) === (stryMutAct_9fa48("6194") ? false : (stryCov_9fa48("6194"), true)))) && (stryMutAct_9fa48("6197") ? localPartitionCdcState.bufferedPartitionIds.length <= NUM.ZERO : stryMutAct_9fa48("6196") ? localPartitionCdcState.bufferedPartitionIds.length >= NUM.ZERO : stryMutAct_9fa48("6195") ? true : (stryCov_9fa48("6195", "6196", "6197"), localPartitionCdcState.bufferedPartitionIds.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("6198")) {
          {}
        } else {
          stryCov_9fa48("6198");
          reasons.push(stryMutAct_9fa48("6199") ? {} : (stryCov_9fa48("6199"), {
            code: SERVICE_DISCOVERY_READINESS_REASON.LOCAL_CDC_BUFFER_NOT_DRAINED,
            detail: localPartitionCdcState.bufferedPartitionIds.join(ADMIN_SERVICE_DISCOVERY_LITERAL.VALUE_3)
          }));
        }
      }
      return stryMutAct_9fa48("6200") ? {} : (stryCov_9fa48("6200"), {
        workloadReady,
        benchmarkReady,
        routingReady,
        schemaReady,
        topologyReady,
        appliedSchemaVersion: readinessContext.tableName ? readinessContext.appliedSchemaVersion : null,
        replicaOpsInFlight: readinessContext.replicaOpsInFlight,
        leadershipStable: readinessContext.leadershipStable,
        tableName: readinessContext.tableName,
        reasons
      });
    }
  } /**
    * Build canonical benchmark-admission block for one discovery
    * replica.
    * @param {Object} replica
    * @param {Object} readinessContext
    * @param {Object} readiness
    * @return {Object}
    */
  buildServiceDiscoveryReplicaBenchmarkAdmission(replica, readinessContext, readiness) {
    if (stryMutAct_9fa48("6201")) {
      {}
    } else {
      stryCov_9fa48("6201");
      const nodeId = String(stryMutAct_9fa48("6204") ? replica?.nodeId && EMPTY_STRING : stryMutAct_9fa48("6203") ? false : stryMutAct_9fa48("6202") ? true : (stryCov_9fa48("6202", "6203", "6204"), (stryMutAct_9fa48("6205") ? replica.nodeId : (stryCov_9fa48("6205"), replica?.nodeId)) || EMPTY_STRING));
      const operationDegradation = readinessContext.replicaOperationDegradationByNodeId instanceof Map ? readinessContext.replicaOperationDegradationByNodeId.get(nodeId) : null;
      const localTargetReplicaState = readinessContext.localTargetReplicaStateByNodeId instanceof Map ? readinessContext.localTargetReplicaStateByNodeId.get(nodeId) : null;
      let localReplicaRole = null;
      if (stryMutAct_9fa48("6208") ? localTargetReplicaState?.replicaRoles instanceof Set || localTargetReplicaState.replicaRoles.size === NUM.ONE : stryMutAct_9fa48("6207") ? false : stryMutAct_9fa48("6206") ? true : (stryCov_9fa48("6206", "6207", "6208"), (stryMutAct_9fa48("6209") ? localTargetReplicaState.replicaRoles : (stryCov_9fa48("6209"), localTargetReplicaState?.replicaRoles)) instanceof Set && (stryMutAct_9fa48("6211") ? localTargetReplicaState.replicaRoles.size !== NUM.ONE : stryMutAct_9fa48("6210") ? true : (stryCov_9fa48("6210", "6211"), localTargetReplicaState.replicaRoles.size === NUM.ONE)))) {
        if (stryMutAct_9fa48("6212")) {
          {}
        } else {
          stryCov_9fa48("6212");
          localReplicaRole = (stryMutAct_9fa48("6213") ? [] : (stryCov_9fa48("6213"), [...localTargetReplicaState.replicaRoles]))[NUM.ZERO];
        }
      } else if (stryMutAct_9fa48("6216") ? localTargetReplicaState?.replicaRoles instanceof Set || localTargetReplicaState.replicaRoles.size > NUM.ONE : stryMutAct_9fa48("6215") ? false : stryMutAct_9fa48("6214") ? true : (stryCov_9fa48("6214", "6215", "6216"), (stryMutAct_9fa48("6217") ? localTargetReplicaState.replicaRoles : (stryCov_9fa48("6217"), localTargetReplicaState?.replicaRoles)) instanceof Set && (stryMutAct_9fa48("6220") ? localTargetReplicaState.replicaRoles.size <= NUM.ONE : stryMutAct_9fa48("6219") ? localTargetReplicaState.replicaRoles.size >= NUM.ONE : stryMutAct_9fa48("6218") ? true : (stryCov_9fa48("6218", "6219", "6220"), localTargetReplicaState.replicaRoles.size > NUM.ONE)))) {
        if (stryMutAct_9fa48("6221")) {
          {}
        } else {
          stryCov_9fa48("6221");
          localReplicaRole = ADMIN_SERVICE_DISCOVERY_LITERAL.MIXED;
        }
      }
      const reasons = Array.isArray(stryMutAct_9fa48("6222") ? readiness.reasons : (stryCov_9fa48("6222"), readiness?.reasons)) ? readiness.reasons.map(stryMutAct_9fa48("6223") ? () => undefined : (stryCov_9fa48("6223"), reason => stryMutAct_9fa48("6224") ? {} : (stryCov_9fa48("6224"), {
        code: String(stryMutAct_9fa48("6227") ? reason?.code && EMPTY_STRING : stryMutAct_9fa48("6226") ? false : stryMutAct_9fa48("6225") ? true : (stryCov_9fa48("6225", "6226", "6227"), (stryMutAct_9fa48("6228") ? reason.code : (stryCov_9fa48("6228"), reason?.code)) || EMPTY_STRING)),
        detail: (stryMutAct_9fa48("6231") ? typeof reason?.detail === TYPEOF.STRING || reason.detail.length > NUM.ZERO : stryMutAct_9fa48("6230") ? false : stryMutAct_9fa48("6229") ? true : (stryCov_9fa48("6229", "6230", "6231"), (stryMutAct_9fa48("6233") ? typeof reason?.detail !== TYPEOF.STRING : stryMutAct_9fa48("6232") ? true : (stryCov_9fa48("6232", "6233"), typeof (stryMutAct_9fa48("6234") ? reason.detail : (stryCov_9fa48("6234"), reason?.detail)) === TYPEOF.STRING)) && (stryMutAct_9fa48("6237") ? reason.detail.length <= NUM.ZERO : stryMutAct_9fa48("6236") ? reason.detail.length >= NUM.ZERO : stryMutAct_9fa48("6235") ? true : (stryCov_9fa48("6235", "6236", "6237"), reason.detail.length > NUM.ZERO)))) ? reason.detail : null
      }))) : stryMutAct_9fa48("6238") ? ["Stryker was here"] : (stryCov_9fa48("6238"), []);
      const degradedByOperationIds = Array.isArray(stryMutAct_9fa48("6239") ? operationDegradation.operationIds : (stryCov_9fa48("6239"), operationDegradation?.operationIds)) ? stryMutAct_9fa48("6240") ? [] : (stryCov_9fa48("6240"), [...operationDegradation.operationIds]) : stryMutAct_9fa48("6241") ? ["Stryker was here"] : (stryCov_9fa48("6241"), []);
      const timelineByOperationId = (stryMutAct_9fa48("6244") ? readinessContext.replicaOperationTimelineById || typeof readinessContext.replicaOperationTimelineById === TYPEOF.OBJECT : stryMutAct_9fa48("6243") ? false : stryMutAct_9fa48("6242") ? true : (stryCov_9fa48("6242", "6243", "6244"), readinessContext.replicaOperationTimelineById && (stryMutAct_9fa48("6246") ? typeof readinessContext.replicaOperationTimelineById !== TYPEOF.OBJECT : stryMutAct_9fa48("6245") ? true : (stryCov_9fa48("6245", "6246"), typeof readinessContext.replicaOperationTimelineById === TYPEOF.OBJECT)))) ? readinessContext.replicaOperationTimelineById : {};
      const replicaOperationTimeline = stryMutAct_9fa48("6247") ? ["Stryker was here"] : (stryCov_9fa48("6247"), []);
      for (const operationId of degradedByOperationIds) {
        if (stryMutAct_9fa48("6248")) {
          {}
        } else {
          stryCov_9fa48("6248");
          const operationTimeline = timelineByOperationId[operationId];
          if (stryMutAct_9fa48("6251") ? false : stryMutAct_9fa48("6250") ? true : stryMutAct_9fa48("6249") ? Array.isArray(operationTimeline) : (stryCov_9fa48("6249", "6250", "6251"), !Array.isArray(operationTimeline))) {
            if (stryMutAct_9fa48("6252")) {
              {}
            } else {
              stryCov_9fa48("6252");
              continue;
            }
          }
          for (const entry of operationTimeline) {
            if (stryMutAct_9fa48("6253")) {
              {}
            } else {
              stryCov_9fa48("6253");
              replicaOperationTimeline.push(entry);
            }
          }
        }
      }
      return stryMutAct_9fa48("6254") ? {} : (stryCov_9fa48("6254"), {
        tableName: stryMutAct_9fa48("6257") ? readiness?.tableName && null : stryMutAct_9fa48("6256") ? false : stryMutAct_9fa48("6255") ? true : (stryCov_9fa48("6255", "6256", "6257"), (stryMutAct_9fa48("6258") ? readiness.tableName : (stryCov_9fa48("6258"), readiness?.tableName)) || null),
        nodeId,
        state: (stryMutAct_9fa48("6261") ? readiness?.benchmarkReady !== true : stryMutAct_9fa48("6260") ? false : stryMutAct_9fa48("6259") ? true : (stryCov_9fa48("6259", "6260", "6261"), (stryMutAct_9fa48("6262") ? readiness.benchmarkReady : (stryCov_9fa48("6262"), readiness?.benchmarkReady)) === (stryMutAct_9fa48("6263") ? false : (stryCov_9fa48("6263"), true)))) ? BENCHMARK_ADMISSION_STATE.READY : BENCHMARK_ADMISSION_STATE.BLOCKED,
        degradationState: stryMutAct_9fa48("6266") ? operationDegradation?.degradationState && BENCHMARK_DEGRADATION_STATE.HEALTHY : stryMutAct_9fa48("6265") ? false : stryMutAct_9fa48("6264") ? true : (stryCov_9fa48("6264", "6265", "6266"), (stryMutAct_9fa48("6267") ? operationDegradation.degradationState : (stryCov_9fa48("6267"), operationDegradation?.degradationState)) || BENCHMARK_DEGRADATION_STATE.HEALTHY),
        routingReady: stryMutAct_9fa48("6270") ? readiness?.routingReady !== true : stryMutAct_9fa48("6269") ? false : stryMutAct_9fa48("6268") ? true : (stryCov_9fa48("6268", "6269", "6270"), (stryMutAct_9fa48("6271") ? readiness.routingReady : (stryCov_9fa48("6271"), readiness?.routingReady)) === (stryMutAct_9fa48("6272") ? false : (stryCov_9fa48("6272"), true))),
        schemaReady: stryMutAct_9fa48("6275") ? readiness?.schemaReady !== true : stryMutAct_9fa48("6274") ? false : stryMutAct_9fa48("6273") ? true : (stryCov_9fa48("6273", "6274", "6275"), (stryMutAct_9fa48("6276") ? readiness.schemaReady : (stryCov_9fa48("6276"), readiness?.schemaReady)) === (stryMutAct_9fa48("6277") ? false : (stryCov_9fa48("6277"), true))),
        topologyReady: stryMutAct_9fa48("6280") ? readiness?.topologyReady !== true : stryMutAct_9fa48("6279") ? false : stryMutAct_9fa48("6278") ? true : (stryCov_9fa48("6278", "6279", "6280"), (stryMutAct_9fa48("6281") ? readiness.topologyReady : (stryCov_9fa48("6281"), readiness?.topologyReady)) === (stryMutAct_9fa48("6282") ? false : (stryCov_9fa48("6282"), true))),
        localReplicaRole,
        degradedByOperationIds,
        reasons,
        replicaOperationTimeline
      });
    }
  } /**
    * Build per-node replica-operation degradation state for
    * benchmark admission.
    * @param {Array<Object>} replicaOperationRows
    * @param {Object} [options={}]
    * @return {Map<string, Object>}
    */
  buildDiscoveryReplicaOperationDegradationByNodeId(replicaOperationRows = stryMutAct_9fa48("6283") ? ["Stryker was here"] : (stryCov_9fa48("6283"), []), options = {}) {
    if (stryMutAct_9fa48("6284")) {
      {}
    } else {
      stryCov_9fa48("6284");
      const degradationByNodeId = new Map();
      const scopedPartitionIds = options.partitionIds instanceof Set ? options.partitionIds : null;
      const serviceRows = Array.isArray(options.serviceRows) ? options.serviceRows : ADMIN_CACHE_DUMP.EMPTY;
      for (const row of replicaOperationRows) {
        if (stryMutAct_9fa48("6285")) {
          {}
        } else {
          stryCov_9fa48("6285");
          if (stryMutAct_9fa48("6288") ? false : stryMutAct_9fa48("6287") ? true : stryMutAct_9fa48("6286") ? this.isReplicaOperationRelevantToDiscoveryScope(row, scopedPartitionIds) : (stryCov_9fa48("6286", "6287", "6288"), !this.isReplicaOperationRelevantToDiscoveryScope(row, scopedPartitionIds))) {
            if (stryMutAct_9fa48("6289")) {
              {}
            } else {
              stryCov_9fa48("6289");
              continue;
            }
          }
          const normalizedOperation = normalizeReplicaOperationRecord(row);
          const operationId = normalizedOperation.operationId;
          const status = normalizedOperation.status;
          const type = normalizedOperation.type;
          const nodeIds = this.resolveReplicaOperationDegradedNodeIds(normalizedOperation);
          if (stryMutAct_9fa48("6292") ? !operationId && nodeIds.length === NUM.ZERO : stryMutAct_9fa48("6291") ? false : stryMutAct_9fa48("6290") ? true : (stryCov_9fa48("6290", "6291", "6292"), (stryMutAct_9fa48("6293") ? operationId : (stryCov_9fa48("6293"), !operationId)) || (stryMutAct_9fa48("6295") ? nodeIds.length !== NUM.ZERO : stryMutAct_9fa48("6294") ? false : (stryCov_9fa48("6294", "6295"), nodeIds.length === NUM.ZERO)))) {
            if (stryMutAct_9fa48("6296")) {
              {}
            } else {
              stryCov_9fa48("6296");
              continue;
            }
          }
          const observedConverged = stryMutAct_9fa48("6299") ? normalizedOperation.status !== 'failed' && !isReplicaOperationTerminalSuccess(normalizedOperation) || !isReplicaOperationInFlight(normalizedOperation, {
            serviceRows
          }) : stryMutAct_9fa48("6298") ? false : stryMutAct_9fa48("6297") ? true : (stryCov_9fa48("6297", "6298", "6299"), (stryMutAct_9fa48("6301") ? normalizedOperation.status !== 'failed' || !isReplicaOperationTerminalSuccess(normalizedOperation) : stryMutAct_9fa48("6300") ? true : (stryCov_9fa48("6300", "6301"), (stryMutAct_9fa48("6303") ? normalizedOperation.status === 'failed' : stryMutAct_9fa48("6302") ? true : (stryCov_9fa48("6302", "6303"), normalizedOperation.status !== (stryMutAct_9fa48("6304") ? "" : (stryCov_9fa48("6304"), 'failed')))) && (stryMutAct_9fa48("6305") ? isReplicaOperationTerminalSuccess(normalizedOperation) : (stryCov_9fa48("6305"), !isReplicaOperationTerminalSuccess(normalizedOperation))))) && (stryMutAct_9fa48("6306") ? isReplicaOperationInFlight(normalizedOperation, {
            serviceRows
          }) : (stryCov_9fa48("6306"), !isReplicaOperationInFlight(normalizedOperation, stryMutAct_9fa48("6307") ? {} : (stryCov_9fa48("6307"), {
            serviceRows
          })))));
          if (stryMutAct_9fa48("6310") ? isReplicaOperationTerminalSuccess(normalizedOperation) && observedConverged : stryMutAct_9fa48("6309") ? false : stryMutAct_9fa48("6308") ? true : (stryCov_9fa48("6308", "6309", "6310"), isReplicaOperationTerminalSuccess(normalizedOperation) || observedConverged)) {
            if (stryMutAct_9fa48("6311")) {
              {}
            } else {
              stryCov_9fa48("6311");
              continue;
            }
          }
          const staleTimeout = isReplicaOperationStale(normalizedOperation, stryMutAct_9fa48("6312") ? {} : (stryCov_9fa48("6312"), {
            serviceRows,
            stepTimeoutMsByWorkflowStep: DEFAULT_STEP_TIMEOUT_MS_BY_WORKFLOW_STEP,
            nowMs: this.nowFn()
          }));
          const timeoutMs = Number(DEFAULT_STEP_TIMEOUT_MS_BY_WORKFLOW_STEP[normalizedOperation.workflowStep]);
          const degradationState = this.resolveReplicaOperationDegradationState(type, status, stryMutAct_9fa48("6313") ? {} : (stryCov_9fa48("6313"), {
            staleTimeout
          }));
          if (stryMutAct_9fa48("6316") ? degradationState !== BENCHMARK_DEGRADATION_STATE.HEALTHY : stryMutAct_9fa48("6315") ? false : stryMutAct_9fa48("6314") ? true : (stryCov_9fa48("6314", "6315", "6316"), degradationState === BENCHMARK_DEGRADATION_STATE.HEALTHY)) {
            if (stryMutAct_9fa48("6317")) {
              {}
            } else {
              stryCov_9fa48("6317");
              continue;
            }
          }
          const reasonCode = (stryMutAct_9fa48("6320") ? status !== 'failed' : stryMutAct_9fa48("6319") ? false : stryMutAct_9fa48("6318") ? true : (stryCov_9fa48("6318", "6319", "6320"), status === (stryMutAct_9fa48("6321") ? "" : (stryCov_9fa48("6321"), 'failed')))) ? SERVICE_DISCOVERY_READINESS_REASON.REPLICA_OPERATION_FAILED : staleTimeout ? SERVICE_DISCOVERY_READINESS_REASON.REPLICA_OPERATION_STALE_TIMEOUT : SERVICE_DISCOVERY_READINESS_REASON.REPLICA_OPERATION_IN_FLIGHT;
          const reasonDetail = staleTimeout ? (stryMutAct_9fa48("6322") ? `${operationId}:${type}:${status}` + SERVICE_DISCOVERY_REASON_DETAIL_SEPARATOR + String(normalizedOperation.workflowStep || EMPTY_STRING) + SERVICE_DISCOVERY_REASON_DETAIL_SEPARATOR + 'ageMs=' + String(normalizedOperation.ageMs) - SERVICE_DISCOVERY_REASON_DETAIL_SEPARATOR : (stryCov_9fa48("6322"), (stryMutAct_9fa48("6323") ? `${operationId}:${type}:${status}` + SERVICE_DISCOVERY_REASON_DETAIL_SEPARATOR + String(normalizedOperation.workflowStep || EMPTY_STRING) - SERVICE_DISCOVERY_REASON_DETAIL_SEPARATOR : (stryCov_9fa48("6323"), (stryMutAct_9fa48("6324") ? `${operationId}:${type}:${status}` + SERVICE_DISCOVERY_REASON_DETAIL_SEPARATOR - String(normalizedOperation.workflowStep || EMPTY_STRING) : (stryCov_9fa48("6324"), (stryMutAct_9fa48("6325") ? `` : (stryCov_9fa48("6325"), `${operationId}:${type}:${status}`)) + SERVICE_DISCOVERY_REASON_DETAIL_SEPARATOR + String(stryMutAct_9fa48("6328") ? normalizedOperation.workflowStep && EMPTY_STRING : stryMutAct_9fa48("6327") ? false : stryMutAct_9fa48("6326") ? true : (stryCov_9fa48("6326", "6327", "6328"), normalizedOperation.workflowStep || EMPTY_STRING)))) + SERVICE_DISCOVERY_REASON_DETAIL_SEPARATOR)) + (stryMutAct_9fa48("6329") ? "" : (stryCov_9fa48("6329"), 'ageMs=')) + String(normalizedOperation.ageMs) + SERVICE_DISCOVERY_REASON_DETAIL_SEPARATOR)) + (stryMutAct_9fa48("6330") ? "" : (stryCov_9fa48("6330"), 'timeoutMs=')) + (Number.isFinite(timeoutMs) ? String(timeoutMs) : EMPTY_STRING) : stryMutAct_9fa48("6331") ? `` : (stryCov_9fa48("6331"), `${operationId}:${type}:${status}`);
          for (const nodeId of nodeIds) {
            if (stryMutAct_9fa48("6332")) {
              {}
            } else {
              stryCov_9fa48("6332");
              const existing = stryMutAct_9fa48("6335") ? degradationByNodeId.get(nodeId) && {
                degradationState: BENCHMARK_DEGRADATION_STATE.HEALTHY,
                operationIds: [],
                reasons: []
              } : stryMutAct_9fa48("6334") ? false : stryMutAct_9fa48("6333") ? true : (stryCov_9fa48("6333", "6334", "6335"), degradationByNodeId.get(nodeId) || (stryMutAct_9fa48("6336") ? {} : (stryCov_9fa48("6336"), {
                degradationState: BENCHMARK_DEGRADATION_STATE.HEALTHY,
                operationIds: stryMutAct_9fa48("6337") ? ["Stryker was here"] : (stryCov_9fa48("6337"), []),
                reasons: stryMutAct_9fa48("6338") ? ["Stryker was here"] : (stryCov_9fa48("6338"), [])
              })));
              if (stryMutAct_9fa48("6342") ? (BENCHMARK_DEGRADATION_PRIORITY[degradationState] || NUM.ZERO) <= (BENCHMARK_DEGRADATION_PRIORITY[existing.degradationState] || NUM.ZERO) : stryMutAct_9fa48("6341") ? (BENCHMARK_DEGRADATION_PRIORITY[degradationState] || NUM.ZERO) >= (BENCHMARK_DEGRADATION_PRIORITY[existing.degradationState] || NUM.ZERO) : stryMutAct_9fa48("6340") ? false : stryMutAct_9fa48("6339") ? true : (stryCov_9fa48("6339", "6340", "6341", "6342"), (stryMutAct_9fa48("6345") ? BENCHMARK_DEGRADATION_PRIORITY[degradationState] && NUM.ZERO : stryMutAct_9fa48("6344") ? false : stryMutAct_9fa48("6343") ? true : (stryCov_9fa48("6343", "6344", "6345"), BENCHMARK_DEGRADATION_PRIORITY[degradationState] || NUM.ZERO)) > (stryMutAct_9fa48("6348") ? BENCHMARK_DEGRADATION_PRIORITY[existing.degradationState] && NUM.ZERO : stryMutAct_9fa48("6347") ? false : stryMutAct_9fa48("6346") ? true : (stryCov_9fa48("6346", "6347", "6348"), BENCHMARK_DEGRADATION_PRIORITY[existing.degradationState] || NUM.ZERO)))) {
                if (stryMutAct_9fa48("6349")) {
                  {}
                } else {
                  stryCov_9fa48("6349");
                  existing.degradationState = degradationState;
                }
              }
              existing.operationIds = uniqueSorted(stryMutAct_9fa48("6350") ? [] : (stryCov_9fa48("6350"), [...existing.operationIds, operationId]));
              if (stryMutAct_9fa48("6353") ? false : stryMutAct_9fa48("6352") ? true : stryMutAct_9fa48("6351") ? existing.reasons.some(reason => reason.code === reasonCode && reason.detail === reasonDetail) : (stryCov_9fa48("6351", "6352", "6353"), !(stryMutAct_9fa48("6354") ? existing.reasons.every(reason => reason.code === reasonCode && reason.detail === reasonDetail) : (stryCov_9fa48("6354"), existing.reasons.some(stryMutAct_9fa48("6355") ? () => undefined : (stryCov_9fa48("6355"), reason => stryMutAct_9fa48("6358") ? reason.code === reasonCode || reason.detail === reasonDetail : stryMutAct_9fa48("6357") ? false : stryMutAct_9fa48("6356") ? true : (stryCov_9fa48("6356", "6357", "6358"), (stryMutAct_9fa48("6360") ? reason.code !== reasonCode : stryMutAct_9fa48("6359") ? true : (stryCov_9fa48("6359", "6360"), reason.code === reasonCode)) && (stryMutAct_9fa48("6362") ? reason.detail !== reasonDetail : stryMutAct_9fa48("6361") ? true : (stryCov_9fa48("6361", "6362"), reason.detail === reasonDetail))))))))) {
                if (stryMutAct_9fa48("6363")) {
                  {}
                } else {
                  stryCov_9fa48("6363");
                  existing.reasons.push(stryMutAct_9fa48("6364") ? {} : (stryCov_9fa48("6364"), {
                    code: reasonCode,
                    detail: reasonDetail
                  }));
                }
              }
              degradationByNodeId.set(nodeId, existing);
            }
          }
        }
      }
      return degradationByNodeId;
    }
  }

  /**
   * Resolve which nodes should be benchmark-degraded by one
   * replica operation.
   * ADD/REMOVE rows degrade the node hosting the affected replica.
   * REPLACE rows degrade both the source and the replacement target.
   * @param {Object} operation
   * @return {Array<string>}
   */
  resolveReplicaOperationDegradedNodeIds(operation) {
    if (stryMutAct_9fa48("6365")) {
      {}
    } else {
      stryCov_9fa48("6365");
      const sourceNodeId = String(stryMutAct_9fa48("6368") ? operation?.sourceNodeId && EMPTY_STRING : stryMutAct_9fa48("6367") ? false : stryMutAct_9fa48("6366") ? true : (stryCov_9fa48("6366", "6367", "6368"), (stryMutAct_9fa48("6369") ? operation.sourceNodeId : (stryCov_9fa48("6369"), operation?.sourceNodeId)) || EMPTY_STRING));
      const targetNodeId = String(stryMutAct_9fa48("6372") ? operation?.targetNodeId && EMPTY_STRING : stryMutAct_9fa48("6371") ? false : stryMutAct_9fa48("6370") ? true : (stryCov_9fa48("6370", "6371", "6372"), (stryMutAct_9fa48("6373") ? operation.targetNodeId : (stryCov_9fa48("6373"), operation?.targetNodeId)) || EMPTY_STRING));
      if (stryMutAct_9fa48("6376") ? operation?.type === REPLICA_OPERATION_TYPE.ADD && operation?.type === REPLICA_OPERATION_TYPE.REMOVE : stryMutAct_9fa48("6375") ? false : stryMutAct_9fa48("6374") ? true : (stryCov_9fa48("6374", "6375", "6376"), (stryMutAct_9fa48("6378") ? operation?.type !== REPLICA_OPERATION_TYPE.ADD : stryMutAct_9fa48("6377") ? false : (stryCov_9fa48("6377", "6378"), (stryMutAct_9fa48("6379") ? operation.type : (stryCov_9fa48("6379"), operation?.type)) === REPLICA_OPERATION_TYPE.ADD)) || (stryMutAct_9fa48("6381") ? operation?.type !== REPLICA_OPERATION_TYPE.REMOVE : stryMutAct_9fa48("6380") ? false : (stryCov_9fa48("6380", "6381"), (stryMutAct_9fa48("6382") ? operation.type : (stryCov_9fa48("6382"), operation?.type)) === REPLICA_OPERATION_TYPE.REMOVE)))) {
        if (stryMutAct_9fa48("6383")) {
          {}
        } else {
          stryCov_9fa48("6383");
          return uniqueSorted(stryMutAct_9fa48("6384") ? [] : (stryCov_9fa48("6384"), [stryMutAct_9fa48("6387") ? targetNodeId && sourceNodeId : stryMutAct_9fa48("6386") ? false : stryMutAct_9fa48("6385") ? true : (stryCov_9fa48("6385", "6386", "6387"), targetNodeId || sourceNodeId)]));
        }
      }
      return uniqueSorted(stryMutAct_9fa48("6388") ? [] : (stryCov_9fa48("6388"), [sourceNodeId, targetNodeId]));
    }
  }

  /**
   * Determine whether one replica operation applies to the
   * discovered scope.
   * @param {Object} row
   * @param {Set<string>|null} scopedPartitionIds
   * @return {boolean}
   */
  isReplicaOperationRelevantToDiscoveryScope(row, scopedPartitionIds) {
    if (stryMutAct_9fa48("6389")) {
      {}
    } else {
      stryCov_9fa48("6389");
      if (stryMutAct_9fa48("6392") ? !(scopedPartitionIds instanceof Set) && scopedPartitionIds.size === NUM.ZERO : stryMutAct_9fa48("6391") ? false : stryMutAct_9fa48("6390") ? true : (stryCov_9fa48("6390", "6391", "6392"), (stryMutAct_9fa48("6393") ? scopedPartitionIds instanceof Set : (stryCov_9fa48("6393"), !(scopedPartitionIds instanceof Set))) || (stryMutAct_9fa48("6395") ? scopedPartitionIds.size !== NUM.ZERO : stryMutAct_9fa48("6394") ? false : (stryCov_9fa48("6394", "6395"), scopedPartitionIds.size === NUM.ZERO)))) {
        if (stryMutAct_9fa48("6396")) {
          {}
        } else {
          stryCov_9fa48("6396");
          return stryMutAct_9fa48("6397") ? false : (stryCov_9fa48("6397"), true);
        }
      }
      const partitionId = firstStringField(row, COLUMN.PARTITION_ID, stryMutAct_9fa48("6398") ? "" : (stryCov_9fa48("6398"), 'partition_id'), stryMutAct_9fa48("6399") ? "" : (stryCov_9fa48("6399"), 'partitionId'), stryMutAct_9fa48("6400") ? "" : (stryCov_9fa48("6400"), 'entity_id'), stryMutAct_9fa48("6401") ? "" : (stryCov_9fa48("6401"), 'entityId'));
      return stryMutAct_9fa48("6404") ? Boolean(partitionId) || scopedPartitionIds.has(partitionId) : stryMutAct_9fa48("6403") ? false : stryMutAct_9fa48("6402") ? true : (stryCov_9fa48("6402", "6403", "6404"), Boolean(partitionId) && scopedPartitionIds.has(partitionId));
    }
  }

  /**
   * Resolve one benchmark degradation state from
   * replica-operation type/status.
   * @param {string} type
   * @param {string} status
   * @return {string}
   */
  resolveReplicaOperationDegradationState(type, status, options = {}) {
    if (stryMutAct_9fa48("6405")) {
      {}
    } else {
      stryCov_9fa48("6405");
      if (stryMutAct_9fa48("6408") ? !type && !status : stryMutAct_9fa48("6407") ? false : stryMutAct_9fa48("6406") ? true : (stryCov_9fa48("6406", "6407", "6408"), (stryMutAct_9fa48("6409") ? type : (stryCov_9fa48("6409"), !type)) || (stryMutAct_9fa48("6410") ? status : (stryCov_9fa48("6410"), !status)))) {
        if (stryMutAct_9fa48("6411")) {
          {}
        } else {
          stryCov_9fa48("6411");
          return BENCHMARK_DEGRADATION_STATE.HEALTHY;
        }
      }
      const isFailed = stryMutAct_9fa48("6414") ? status !== 'failed' : stryMutAct_9fa48("6413") ? false : stryMutAct_9fa48("6412") ? true : (stryCov_9fa48("6412", "6413", "6414"), status === (stryMutAct_9fa48("6415") ? "" : (stryCov_9fa48("6415"), 'failed')));
      const staleTimeout = stryMutAct_9fa48("6418") ? options?.staleTimeout !== true : stryMutAct_9fa48("6417") ? false : stryMutAct_9fa48("6416") ? true : (stryCov_9fa48("6416", "6417", "6418"), (stryMutAct_9fa48("6419") ? options.staleTimeout : (stryCov_9fa48("6419"), options?.staleTimeout)) === (stryMutAct_9fa48("6420") ? false : (stryCov_9fa48("6420"), true)));
      const treatAsFailed = stryMutAct_9fa48("6423") ? isFailed && staleTimeout : stryMutAct_9fa48("6422") ? false : stryMutAct_9fa48("6421") ? true : (stryCov_9fa48("6421", "6422", "6423"), isFailed || staleTimeout);
      if (stryMutAct_9fa48("6426") ? type !== REPLICA_OPERATION_TYPE.REPLACE : stryMutAct_9fa48("6425") ? false : stryMutAct_9fa48("6424") ? true : (stryCov_9fa48("6424", "6425", "6426"), type === REPLICA_OPERATION_TYPE.REPLACE)) {
        if (stryMutAct_9fa48("6427")) {
          {}
        } else {
          stryCov_9fa48("6427");
          return treatAsFailed ? BENCHMARK_DEGRADATION_STATE.MOVE_FAILED : BENCHMARK_DEGRADATION_STATE.MOVE_PENDING;
        }
      }
      if (stryMutAct_9fa48("6430") ? type !== REPLICA_OPERATION_TYPE.ADD : stryMutAct_9fa48("6429") ? false : stryMutAct_9fa48("6428") ? true : (stryCov_9fa48("6428", "6429", "6430"), type === REPLICA_OPERATION_TYPE.ADD)) {
        if (stryMutAct_9fa48("6431")) {
          {}
        } else {
          stryCov_9fa48("6431");
          return treatAsFailed ? BENCHMARK_DEGRADATION_STATE.PROMOTION_FAILED : BENCHMARK_DEGRADATION_STATE.PROMOTION_PENDING;
        }
      }
      if (stryMutAct_9fa48("6434") ? type !== REPLICA_OPERATION_TYPE.REMOVE : stryMutAct_9fa48("6433") ? false : stryMutAct_9fa48("6432") ? true : (stryCov_9fa48("6432", "6433", "6434"), type === REPLICA_OPERATION_TYPE.REMOVE)) {
        if (stryMutAct_9fa48("6435")) {
          {}
        } else {
          stryCov_9fa48("6435");
          return BENCHMARK_DEGRADATION_STATE.DRAIN_BLOCKED;
        }
      }
      return BENCHMARK_DEGRADATION_STATE.HEALTHY;
    }
  }

  /**
   * Ensure bounded authoritative discovery cache repair.
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async ensureAuthoritativeDiscoveryCacheRepair(options = {}) {
    if (stryMutAct_9fa48("6436")) {
      {}
    } else {
      stryCov_9fa48("6436");
      if (stryMutAct_9fa48("6439") ? (!this.systemTableCache || !this.cacheMutationTarget) && typeof this.cacheMutationTarget.applySystemTableChange !== TYPEOF.FUNCTION : stryMutAct_9fa48("6438") ? false : stryMutAct_9fa48("6437") ? true : (stryCov_9fa48("6437", "6438", "6439"), (stryMutAct_9fa48("6441") ? !this.systemTableCache && !this.cacheMutationTarget : stryMutAct_9fa48("6440") ? false : (stryCov_9fa48("6440", "6441"), (stryMutAct_9fa48("6442") ? this.systemTableCache : (stryCov_9fa48("6442"), !this.systemTableCache)) || (stryMutAct_9fa48("6443") ? this.cacheMutationTarget : (stryCov_9fa48("6443"), !this.cacheMutationTarget)))) || (stryMutAct_9fa48("6445") ? typeof this.cacheMutationTarget.applySystemTableChange === TYPEOF.FUNCTION : stryMutAct_9fa48("6444") ? false : (stryCov_9fa48("6444", "6445"), typeof this.cacheMutationTarget.applySystemTableChange !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("6446")) {
          {}
        } else {
          stryCov_9fa48("6446");
          return stryMutAct_9fa48("6447") ? {} : (stryCov_9fa48("6447"), {
            applied: stryMutAct_9fa48("6448") ? true : (stryCov_9fa48("6448"), false),
            skipped: stryMutAct_9fa48("6449") ? false : (stryCov_9fa48("6449"), true),
            tableCount: NUM.ZERO
          });
        }
      }
      if (stryMutAct_9fa48("6452") ? false : stryMutAct_9fa48("6451") ? true : stryMutAct_9fa48("6450") ? this.canReadAuthoritativeDiscoveryRows() : (stryCov_9fa48("6450", "6451", "6452"), !this.canReadAuthoritativeDiscoveryRows())) {
        if (stryMutAct_9fa48("6453")) {
          {}
        } else {
          stryCov_9fa48("6453");
          return stryMutAct_9fa48("6454") ? {} : (stryCov_9fa48("6454"), {
            applied: stryMutAct_9fa48("6455") ? true : (stryCov_9fa48("6455"), false),
            skipped: stryMutAct_9fa48("6456") ? false : (stryCov_9fa48("6456"), true),
            tableCount: NUM.ZERO
          });
        }
      }
      const now = this.nowFn();
      const repairTableNames = this.resolveAuthoritativeDiscoveryRepairTables(options);
      if (stryMutAct_9fa48("6459") ? repairTableNames.length !== NUM.ZERO : stryMutAct_9fa48("6458") ? false : stryMutAct_9fa48("6457") ? true : (stryCov_9fa48("6457", "6458", "6459"), repairTableNames.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("6460")) {
          {}
        } else {
          stryCov_9fa48("6460");
          return stryMutAct_9fa48("6461") ? {} : (stryCov_9fa48("6461"), {
            applied: stryMutAct_9fa48("6462") ? true : (stryCov_9fa48("6462"), false),
            skipped: stryMutAct_9fa48("6463") ? false : (stryCov_9fa48("6463"), true),
            tableCount: NUM.ZERO
          });
        }
      }
      if (stryMutAct_9fa48("6465") ? false : stryMutAct_9fa48("6464") ? true : (stryCov_9fa48("6464", "6465"), this.authoritativeDiscoveryRepairPromise)) {
        if (stryMutAct_9fa48("6466")) {
          {}
        } else {
          stryCov_9fa48("6466");
          return this.authoritativeDiscoveryRepairPromise;
        }
      }
      const recentRepairResult = this.resolveRecentAuthoritativeDiscoveryRepair(stryMutAct_9fa48("6467") ? {} : (stryCov_9fa48("6467"), {
        ...options,
        repairTables: repairTableNames
      }), now);
      if (stryMutAct_9fa48("6469") ? false : stryMutAct_9fa48("6468") ? true : (stryCov_9fa48("6468", "6469"), recentRepairResult)) {
        if (stryMutAct_9fa48("6470")) {
          {}
        } else {
          stryCov_9fa48("6470");
          return recentRepairResult;
        }
      }
      if (stryMutAct_9fa48("6473") ? options?.bypassReuse !== true && now - this.lastAuthoritativeDiscoveryRepairAtMs < AUTHORITATIVE_DISCOVERY_REPAIR.COOLDOWN_MS || this.lastAuthoritativeDiscoveryRepairCoversTables(repairTableNames) : stryMutAct_9fa48("6472") ? false : stryMutAct_9fa48("6471") ? true : (stryCov_9fa48("6471", "6472", "6473"), (stryMutAct_9fa48("6475") ? options?.bypassReuse !== true || now - this.lastAuthoritativeDiscoveryRepairAtMs < AUTHORITATIVE_DISCOVERY_REPAIR.COOLDOWN_MS : stryMutAct_9fa48("6474") ? true : (stryCov_9fa48("6474", "6475"), (stryMutAct_9fa48("6477") ? options?.bypassReuse === true : stryMutAct_9fa48("6476") ? true : (stryCov_9fa48("6476", "6477"), (stryMutAct_9fa48("6478") ? options.bypassReuse : (stryCov_9fa48("6478"), options?.bypassReuse)) !== (stryMutAct_9fa48("6479") ? false : (stryCov_9fa48("6479"), true)))) && (stryMutAct_9fa48("6482") ? now - this.lastAuthoritativeDiscoveryRepairAtMs >= AUTHORITATIVE_DISCOVERY_REPAIR.COOLDOWN_MS : stryMutAct_9fa48("6481") ? now - this.lastAuthoritativeDiscoveryRepairAtMs <= AUTHORITATIVE_DISCOVERY_REPAIR.COOLDOWN_MS : stryMutAct_9fa48("6480") ? true : (stryCov_9fa48("6480", "6481", "6482"), (stryMutAct_9fa48("6483") ? now + this.lastAuthoritativeDiscoveryRepairAtMs : (stryCov_9fa48("6483"), now - this.lastAuthoritativeDiscoveryRepairAtMs)) < AUTHORITATIVE_DISCOVERY_REPAIR.COOLDOWN_MS)))) && this.lastAuthoritativeDiscoveryRepairCoversTables(repairTableNames))) {
        if (stryMutAct_9fa48("6484")) {
          {}
        } else {
          stryCov_9fa48("6484");
          return stryMutAct_9fa48("6485") ? {} : (stryCov_9fa48("6485"), {
            applied: stryMutAct_9fa48("6486") ? true : (stryCov_9fa48("6486"), false),
            skipped: stryMutAct_9fa48("6487") ? false : (stryCov_9fa48("6487"), true),
            tableCount: NUM.ZERO
          });
        }
      }
      const runRepair = async () => {
        if (stryMutAct_9fa48("6488")) {
          {}
        } else {
          stryCov_9fa48("6488");
          const causeId = (stryMutAct_9fa48("6489") ? "" : (stryCov_9fa48("6489"), 'admin-authoritative-discovery-repair:')) + String(stryMutAct_9fa48("6492") ? options.reason && 'unknown' : stryMutAct_9fa48("6491") ? false : stryMutAct_9fa48("6490") ? true : (stryCov_9fa48("6490", "6491", "6492"), options.reason || (stryMutAct_9fa48("6493") ? "" : (stryCov_9fa48("6493"), 'unknown')))) + (stryMutAct_9fa48("6494") ? "" : (stryCov_9fa48("6494"), ':')) + String(now);
          let repairedTableCount = NUM.ZERO;
          let repairedRowCount = NUM.ZERO;
          const repairedTableNames = stryMutAct_9fa48("6495") ? ["Stryker was here"] : (stryCov_9fa48("6495"), []);
          const authoritativeRowsByTable = new Map();
          const failedTables = stryMutAct_9fa48("6496") ? ["Stryker was here"] : (stryCov_9fa48("6496"), []);
          const errors = stryMutAct_9fa48("6497") ? ["Stryker was here"] : (stryCov_9fa48("6497"), []);
          const errorSummaries = stryMutAct_9fa48("6498") ? ["Stryker was here"] : (stryCov_9fa48("6498"), []);
          for (const tableName of repairTableNames) {
            if (stryMutAct_9fa48("6499")) {
              {}
            } else {
              stryCov_9fa48("6499");
              try {
                if (stryMutAct_9fa48("6500")) {
                  {}
                } else {
                  stryCov_9fa48("6500");
                  const result = await this.readAuthoritativeSystemTableRows(tableName, stryMutAct_9fa48("6501") ? {} : (stryCov_9fa48("6501"), {
                    nowMs: now,
                    reason: stryMutAct_9fa48("6504") ? options.reason && 'repair' : stryMutAct_9fa48("6503") ? false : stryMutAct_9fa48("6502") ? true : (stryCov_9fa48("6502", "6503", "6504"), options.reason || (stryMutAct_9fa48("6505") ? "" : (stryCov_9fa48("6505"), 'repair'))),
                    tableName: stryMutAct_9fa48("6508") ? options.tableName && null : stryMutAct_9fa48("6507") ? false : stryMutAct_9fa48("6506") ? true : (stryCov_9fa48("6506", "6507", "6508"), options.tableName || null),
                    tableId: stryMutAct_9fa48("6511") ? options.tableId && null : stryMutAct_9fa48("6510") ? false : stryMutAct_9fa48("6509") ? true : (stryCov_9fa48("6509", "6510", "6511"), options.tableId || null)
                  }));
                  authoritativeRowsByTable.set(tableName, stryMutAct_9fa48("6512") ? {} : (stryCov_9fa48("6512"), {
                    tableName: result.tableName,
                    rows: result.rows
                  }));
                }
              } catch (error) {
                if (stryMutAct_9fa48("6513")) {
                  {}
                } else {
                  stryCov_9fa48("6513");
                  const errorSummary = summarizeAuthoritativeRepairError(tableName, error);
                  failedTables.push(tableName);
                  errorSummaries.push(errorSummary);
                  errors.push((stryMutAct_9fa48("6514") ? `` : (stryCov_9fa48("6514"), `${tableName}:`)) + String(stryMutAct_9fa48("6517") ? (error?.message || error) && 'unknown_error' : stryMutAct_9fa48("6516") ? false : stryMutAct_9fa48("6515") ? true : (stryCov_9fa48("6515", "6516", "6517"), (stryMutAct_9fa48("6519") ? error?.message && error : stryMutAct_9fa48("6518") ? false : (stryCov_9fa48("6518", "6519"), (stryMutAct_9fa48("6520") ? error.message : (stryCov_9fa48("6520"), error?.message)) || error)) || (stryMutAct_9fa48("6521") ? "" : (stryCov_9fa48("6521"), 'unknown_error')))));
                  if (stryMutAct_9fa48("6523") ? false : stryMutAct_9fa48("6522") ? true : (stryCov_9fa48("6522", "6523"), shouldAbortAuthoritativeRepairTableReads(errorSummary))) {
                    if (stryMutAct_9fa48("6524")) {
                      {}
                    } else {
                      stryCov_9fa48("6524");
                      break;
                    }
                  }
                }
              }
            }
          }
          if (stryMutAct_9fa48("6527") ? failedTables.length !== NUM.ZERO : stryMutAct_9fa48("6526") ? false : stryMutAct_9fa48("6525") ? true : (stryCov_9fa48("6525", "6526", "6527"), failedTables.length === NUM.ZERO)) {
            if (stryMutAct_9fa48("6528")) {
              {}
            } else {
              stryCov_9fa48("6528");
              for (const tableName of repairTableNames) {
                if (stryMutAct_9fa48("6529")) {
                  {}
                } else {
                  stryCov_9fa48("6529");
                  const result = authoritativeRowsByTable.get(tableName);
                  try {
                    if (stryMutAct_9fa48("6530")) {
                      {}
                    } else {
                      stryCov_9fa48("6530");
                      stryMutAct_9fa48("6531") ? repairedRowCount -= await this.applyAuthoritativeSystemTableRows(result?.tableName || tableName, result?.rows || ADMIN_CACHE_DUMP.EMPTY, causeId) : (stryCov_9fa48("6531"), repairedRowCount += await this.applyAuthoritativeSystemTableRows(stryMutAct_9fa48("6534") ? result?.tableName && tableName : stryMutAct_9fa48("6533") ? false : stryMutAct_9fa48("6532") ? true : (stryCov_9fa48("6532", "6533", "6534"), (stryMutAct_9fa48("6535") ? result.tableName : (stryCov_9fa48("6535"), result?.tableName)) || tableName), stryMutAct_9fa48("6538") ? result?.rows && ADMIN_CACHE_DUMP.EMPTY : stryMutAct_9fa48("6537") ? false : stryMutAct_9fa48("6536") ? true : (stryCov_9fa48("6536", "6537", "6538"), (stryMutAct_9fa48("6539") ? result.rows : (stryCov_9fa48("6539"), result?.rows)) || ADMIN_CACHE_DUMP.EMPTY), causeId));
                      stryMutAct_9fa48("6540") ? repairedTableCount -= NUM.ONE : (stryCov_9fa48("6540"), repairedTableCount += NUM.ONE);
                      repairedTableNames.push(tableName);
                    }
                  } catch (error) {
                    if (stryMutAct_9fa48("6541")) {
                      {}
                    } else {
                      stryCov_9fa48("6541");
                      failedTables.push(tableName);
                      errorSummaries.push(summarizeAuthoritativeRepairError(tableName, error));
                      errors.push((stryMutAct_9fa48("6542") ? `` : (stryCov_9fa48("6542"), `${tableName}:`)) + String(stryMutAct_9fa48("6545") ? (error?.message || error) && 'unknown_error' : stryMutAct_9fa48("6544") ? false : stryMutAct_9fa48("6543") ? true : (stryCov_9fa48("6543", "6544", "6545"), (stryMutAct_9fa48("6547") ? error?.message && error : stryMutAct_9fa48("6546") ? false : (stryCov_9fa48("6546", "6547"), (stryMutAct_9fa48("6548") ? error.message : (stryCov_9fa48("6548"), error?.message)) || error)) || (stryMutAct_9fa48("6549") ? "" : (stryCov_9fa48("6549"), 'unknown_error')))));
                      break;
                    }
                  }
                }
              }
            }
          }
          const completedAtMs = this.nowFn();
          this.lastAuthoritativeDiscoveryRepairAtMs = completedAtMs;
          const repairApplied = stryMutAct_9fa48("6552") ? failedTables.length === NUM.ZERO || repairedTableCount === repairTableNames.length : stryMutAct_9fa48("6551") ? false : stryMutAct_9fa48("6550") ? true : (stryCov_9fa48("6550", "6551", "6552"), (stryMutAct_9fa48("6554") ? failedTables.length !== NUM.ZERO : stryMutAct_9fa48("6553") ? true : (stryCov_9fa48("6553", "6554"), failedTables.length === NUM.ZERO)) && (stryMutAct_9fa48("6556") ? repairedTableCount !== repairTableNames.length : stryMutAct_9fa48("6555") ? true : (stryCov_9fa48("6555", "6556"), repairedTableCount === repairTableNames.length)));
          if (stryMutAct_9fa48("6558") ? false : stryMutAct_9fa48("6557") ? true : (stryCov_9fa48("6557", "6558"), repairApplied)) {
            if (stryMutAct_9fa48("6559")) {
              {}
            } else {
              stryCov_9fa48("6559");
              this.lastAuthoritativeDiscoveryRepairCompletedAtMs = completedAtMs;
              this.lastAuthoritativeDiscoveryRepairResult = stryMutAct_9fa48("6560") ? {} : (stryCov_9fa48("6560"), {
                applied: stryMutAct_9fa48("6561") ? false : (stryCov_9fa48("6561"), true),
                skipped: stryMutAct_9fa48("6562") ? true : (stryCov_9fa48("6562"), false),
                tableCount: repairedTableCount,
                tableNames: stryMutAct_9fa48("6563") ? [] : (stryCov_9fa48("6563"), [...repairedTableNames]),
                repairedRowCount,
                completedAtMs,
                reused: stryMutAct_9fa48("6564") ? true : (stryCov_9fa48("6564"), false)
              });
            }
          } else {
            if (stryMutAct_9fa48("6565")) {
              {}
            } else {
              stryCov_9fa48("6565");
              this.lastAuthoritativeDiscoveryRepairCompletedAtMs = NUM.ZERO;
              this.lastAuthoritativeDiscoveryRepairResult = null;
            }
          }
          const result = stryMutAct_9fa48("6568") ? this.lastAuthoritativeDiscoveryRepairResult && {
            applied: false,
            skipped: false,
            tableCount: repairedTableCount,
            tableNames: [...repairedTableNames],
            requestedTableCount: repairTableNames.length,
            requestedTableNames: [...repairTableNames],
            repairedRowCount,
            failedTables: [...failedTables],
            errorCount: errors.length,
            errors,
            causeChain: errorSummaries.flatMap(summary => Array.isArray(summary?.causeChain) ? summary.causeChain : []).filter((value, index, values) => values.indexOf(value) === index),
            readSource: errorSummaries.find(summary => summary?.readSource)?.readSource || null,
            localQueryTransport: errorSummaries.find(summary => summary?.localQueryTransport)?.localQueryTransport || null,
            firstFailedParticipant: errorSummaries.find(summary => summary?.firstFailedParticipant)?.firstFailedParticipant || null,
            completedAtMs,
            reused: false
          } : stryMutAct_9fa48("6567") ? false : stryMutAct_9fa48("6566") ? true : (stryCov_9fa48("6566", "6567", "6568"), this.lastAuthoritativeDiscoveryRepairResult || (stryMutAct_9fa48("6569") ? {} : (stryCov_9fa48("6569"), {
            applied: stryMutAct_9fa48("6570") ? true : (stryCov_9fa48("6570"), false),
            skipped: stryMutAct_9fa48("6571") ? true : (stryCov_9fa48("6571"), false),
            tableCount: repairedTableCount,
            tableNames: stryMutAct_9fa48("6572") ? [] : (stryCov_9fa48("6572"), [...repairedTableNames]),
            requestedTableCount: repairTableNames.length,
            requestedTableNames: stryMutAct_9fa48("6573") ? [] : (stryCov_9fa48("6573"), [...repairTableNames]),
            repairedRowCount,
            failedTables: stryMutAct_9fa48("6574") ? [] : (stryCov_9fa48("6574"), [...failedTables]),
            errorCount: errors.length,
            errors,
            causeChain: stryMutAct_9fa48("6575") ? errorSummaries.flatMap(summary => Array.isArray(summary?.causeChain) ? summary.causeChain : []) : (stryCov_9fa48("6575"), errorSummaries.flatMap(stryMutAct_9fa48("6576") ? () => undefined : (stryCov_9fa48("6576"), summary => Array.isArray(stryMutAct_9fa48("6577") ? summary.causeChain : (stryCov_9fa48("6577"), summary?.causeChain)) ? summary.causeChain : stryMutAct_9fa48("6578") ? ["Stryker was here"] : (stryCov_9fa48("6578"), []))).filter(stryMutAct_9fa48("6579") ? () => undefined : (stryCov_9fa48("6579"), (value, index, values) => stryMutAct_9fa48("6582") ? values.indexOf(value) !== index : stryMutAct_9fa48("6581") ? false : stryMutAct_9fa48("6580") ? true : (stryCov_9fa48("6580", "6581", "6582"), values.indexOf(value) === index)))),
            readSource: stryMutAct_9fa48("6585") ? errorSummaries.find(summary => summary?.readSource)?.readSource && null : stryMutAct_9fa48("6584") ? false : stryMutAct_9fa48("6583") ? true : (stryCov_9fa48("6583", "6584", "6585"), (stryMutAct_9fa48("6586") ? errorSummaries.find(summary => summary?.readSource).readSource : (stryCov_9fa48("6586"), errorSummaries.find(stryMutAct_9fa48("6587") ? () => undefined : (stryCov_9fa48("6587"), summary => stryMutAct_9fa48("6588") ? summary.readSource : (stryCov_9fa48("6588"), summary?.readSource)))?.readSource)) || null),
            localQueryTransport: stryMutAct_9fa48("6591") ? errorSummaries.find(summary => summary?.localQueryTransport)?.localQueryTransport && null : stryMutAct_9fa48("6590") ? false : stryMutAct_9fa48("6589") ? true : (stryCov_9fa48("6589", "6590", "6591"), (stryMutAct_9fa48("6592") ? errorSummaries.find(summary => summary?.localQueryTransport).localQueryTransport : (stryCov_9fa48("6592"), errorSummaries.find(stryMutAct_9fa48("6593") ? () => undefined : (stryCov_9fa48("6593"), summary => stryMutAct_9fa48("6594") ? summary.localQueryTransport : (stryCov_9fa48("6594"), summary?.localQueryTransport)))?.localQueryTransport)) || null),
            firstFailedParticipant: stryMutAct_9fa48("6597") ? errorSummaries.find(summary => summary?.firstFailedParticipant)?.firstFailedParticipant && null : stryMutAct_9fa48("6596") ? false : stryMutAct_9fa48("6595") ? true : (stryCov_9fa48("6595", "6596", "6597"), (stryMutAct_9fa48("6598") ? errorSummaries.find(summary => summary?.firstFailedParticipant).firstFailedParticipant : (stryCov_9fa48("6598"), errorSummaries.find(stryMutAct_9fa48("6599") ? () => undefined : (stryCov_9fa48("6599"), summary => stryMutAct_9fa48("6600") ? summary.firstFailedParticipant : (stryCov_9fa48("6600"), summary?.firstFailedParticipant)))?.firstFailedParticipant)) || null),
            completedAtMs,
            reused: stryMutAct_9fa48("6601") ? true : (stryCov_9fa48("6601"), false)
          })));
          const errorCodes = stryMutAct_9fa48("6602") ? [...new Set(errorSummaries.map(summary => summary?.errorCode || null).concat(errors.map(value => {
            const message = String(value || '');
            const separatorIndex = message.indexOf(':');
            const summary = separatorIndex >= NUM.ZERO ? message.slice(separatorIndex + NUM.ONE).trim() : message.trim();
            return summary.length > NUM.ZERO ? summary : null;
          })).filter(Boolean))] : (stryCov_9fa48("6602"), (stryMutAct_9fa48("6603") ? [] : (stryCov_9fa48("6603"), [...new Set(stryMutAct_9fa48("6604") ? errorSummaries.map(summary => summary?.errorCode || null).concat(errors.map(value => {
            const message = String(value || '');
            const separatorIndex = message.indexOf(':');
            const summary = separatorIndex >= NUM.ZERO ? message.slice(separatorIndex + NUM.ONE).trim() : message.trim();
            return summary.length > NUM.ZERO ? summary : null;
          })) : (stryCov_9fa48("6604"), errorSummaries.map(stryMutAct_9fa48("6605") ? () => undefined : (stryCov_9fa48("6605"), summary => stryMutAct_9fa48("6608") ? summary?.errorCode && null : stryMutAct_9fa48("6607") ? false : stryMutAct_9fa48("6606") ? true : (stryCov_9fa48("6606", "6607", "6608"), (stryMutAct_9fa48("6609") ? summary.errorCode : (stryCov_9fa48("6609"), summary?.errorCode)) || null))).concat(errors.map(value => {
            if (stryMutAct_9fa48("6610")) {
              {}
            } else {
              stryCov_9fa48("6610");
              const message = String(stryMutAct_9fa48("6613") ? value && '' : stryMutAct_9fa48("6612") ? false : stryMutAct_9fa48("6611") ? true : (stryCov_9fa48("6611", "6612", "6613"), value || (stryMutAct_9fa48("6614") ? "Stryker was here!" : (stryCov_9fa48("6614"), ''))));
              const separatorIndex = message.indexOf(stryMutAct_9fa48("6615") ? "" : (stryCov_9fa48("6615"), ':'));
              const summary = (stryMutAct_9fa48("6619") ? separatorIndex < NUM.ZERO : stryMutAct_9fa48("6618") ? separatorIndex > NUM.ZERO : stryMutAct_9fa48("6617") ? false : stryMutAct_9fa48("6616") ? true : (stryCov_9fa48("6616", "6617", "6618", "6619"), separatorIndex >= NUM.ZERO)) ? stryMutAct_9fa48("6621") ? message.trim() : stryMutAct_9fa48("6620") ? message.slice(separatorIndex + NUM.ONE) : (stryCov_9fa48("6620", "6621"), message.slice(stryMutAct_9fa48("6622") ? separatorIndex - NUM.ONE : (stryCov_9fa48("6622"), separatorIndex + NUM.ONE)).trim()) : stryMutAct_9fa48("6623") ? message : (stryCov_9fa48("6623"), message.trim());
              return (stryMutAct_9fa48("6627") ? summary.length <= NUM.ZERO : stryMutAct_9fa48("6626") ? summary.length >= NUM.ZERO : stryMutAct_9fa48("6625") ? false : stryMutAct_9fa48("6624") ? true : (stryCov_9fa48("6624", "6625", "6626", "6627"), summary.length > NUM.ZERO)) ? summary : null;
            }
          })).filter(Boolean)))])).slice(NUM.ZERO, 5));
          if (stryMutAct_9fa48("6630") ? false : stryMutAct_9fa48("6629") ? true : stryMutAct_9fa48("6628") ? repairApplied : (stryCov_9fa48("6628", "6629", "6630"), !repairApplied)) {
            if (stryMutAct_9fa48("6631")) {
              {}
            } else {
              stryCov_9fa48("6631");
              stryMutAct_9fa48("6633") ? this.logger.warn?.('Authoritative discovery cache repair failed', {
                nodeId: this.nodeId,
                reason: options.reason || null,
                tableName: options.tableName || null,
                tableId: options.tableId || null,
                repairTableNames,
                requestedTableCount: repairTableNames.length,
                repairedTableCount,
                repairedRowCount,
                failedTables,
                errorCount: errors.length,
                errorCodes,
                errors,
                causeChain: result.causeChain || [],
                readSource: result.readSource || null,
                localQueryTransport: result.localQueryTransport || null,
                firstFailedParticipant: result.firstFailedParticipant || null
              }) : stryMutAct_9fa48("6632") ? this.logger?.warn('Authoritative discovery cache repair failed', {
                nodeId: this.nodeId,
                reason: options.reason || null,
                tableName: options.tableName || null,
                tableId: options.tableId || null,
                repairTableNames,
                requestedTableCount: repairTableNames.length,
                repairedTableCount,
                repairedRowCount,
                failedTables,
                errorCount: errors.length,
                errorCodes,
                errors,
                causeChain: result.causeChain || [],
                readSource: result.readSource || null,
                localQueryTransport: result.localQueryTransport || null,
                firstFailedParticipant: result.firstFailedParticipant || null
              }) : (stryCov_9fa48("6632", "6633"), this.logger?.warn?.(stryMutAct_9fa48("6634") ? "" : (stryCov_9fa48("6634"), 'Authoritative discovery cache repair failed'), stryMutAct_9fa48("6635") ? {} : (stryCov_9fa48("6635"), {
                nodeId: this.nodeId,
                reason: stryMutAct_9fa48("6638") ? options.reason && null : stryMutAct_9fa48("6637") ? false : stryMutAct_9fa48("6636") ? true : (stryCov_9fa48("6636", "6637", "6638"), options.reason || null),
                tableName: stryMutAct_9fa48("6641") ? options.tableName && null : stryMutAct_9fa48("6640") ? false : stryMutAct_9fa48("6639") ? true : (stryCov_9fa48("6639", "6640", "6641"), options.tableName || null),
                tableId: stryMutAct_9fa48("6644") ? options.tableId && null : stryMutAct_9fa48("6643") ? false : stryMutAct_9fa48("6642") ? true : (stryCov_9fa48("6642", "6643", "6644"), options.tableId || null),
                repairTableNames,
                requestedTableCount: repairTableNames.length,
                repairedTableCount,
                repairedRowCount,
                failedTables,
                errorCount: errors.length,
                errorCodes,
                errors,
                causeChain: stryMutAct_9fa48("6647") ? result.causeChain && [] : stryMutAct_9fa48("6646") ? false : stryMutAct_9fa48("6645") ? true : (stryCov_9fa48("6645", "6646", "6647"), result.causeChain || (stryMutAct_9fa48("6648") ? ["Stryker was here"] : (stryCov_9fa48("6648"), []))),
                readSource: stryMutAct_9fa48("6651") ? result.readSource && null : stryMutAct_9fa48("6650") ? false : stryMutAct_9fa48("6649") ? true : (stryCov_9fa48("6649", "6650", "6651"), result.readSource || null),
                localQueryTransport: stryMutAct_9fa48("6654") ? result.localQueryTransport && null : stryMutAct_9fa48("6653") ? false : stryMutAct_9fa48("6652") ? true : (stryCov_9fa48("6652", "6653", "6654"), result.localQueryTransport || null),
                firstFailedParticipant: stryMutAct_9fa48("6657") ? result.firstFailedParticipant && null : stryMutAct_9fa48("6656") ? false : stryMutAct_9fa48("6655") ? true : (stryCov_9fa48("6655", "6656", "6657"), result.firstFailedParticipant || null)
              })));
            }
          } else {
            if (stryMutAct_9fa48("6658")) {
              {}
            } else {
              stryCov_9fa48("6658");
              stryMutAct_9fa48("6660") ? this.logger.info?.('Authoritative discovery cache repair completed', {
                nodeId: this.nodeId,
                reason: options.reason || null,
                tableName: options.tableName || null,
                tableId: options.tableId || null,
                repairTableNames,
                repairedTableCount,
                repairedRowCount
              }) : stryMutAct_9fa48("6659") ? this.logger?.info('Authoritative discovery cache repair completed', {
                nodeId: this.nodeId,
                reason: options.reason || null,
                tableName: options.tableName || null,
                tableId: options.tableId || null,
                repairTableNames,
                repairedTableCount,
                repairedRowCount
              }) : (stryCov_9fa48("6659", "6660"), this.logger?.info?.(stryMutAct_9fa48("6661") ? "" : (stryCov_9fa48("6661"), 'Authoritative discovery cache repair completed'), stryMutAct_9fa48("6662") ? {} : (stryCov_9fa48("6662"), {
                nodeId: this.nodeId,
                reason: stryMutAct_9fa48("6665") ? options.reason && null : stryMutAct_9fa48("6664") ? false : stryMutAct_9fa48("6663") ? true : (stryCov_9fa48("6663", "6664", "6665"), options.reason || null),
                tableName: stryMutAct_9fa48("6668") ? options.tableName && null : stryMutAct_9fa48("6667") ? false : stryMutAct_9fa48("6666") ? true : (stryCov_9fa48("6666", "6667", "6668"), options.tableName || null),
                tableId: stryMutAct_9fa48("6671") ? options.tableId && null : stryMutAct_9fa48("6670") ? false : stryMutAct_9fa48("6669") ? true : (stryCov_9fa48("6669", "6670", "6671"), options.tableId || null),
                repairTableNames,
                repairedTableCount,
                repairedRowCount
              })));
            }
          }
          return result;
        }
      };
      this.authoritativeDiscoveryRepairPromise = runRepair().finally(() => {
        if (stryMutAct_9fa48("6672")) {
          {}
        } else {
          stryCov_9fa48("6672");
          this.authoritativeDiscoveryRepairPromise = null;
        }
      });
      return this.authoritativeDiscoveryRepairPromise;
    }
  }

  /**
   * Reuse one recent successful repair result for non-forced callers so
   * repeated local snapshots rebuild from the repaired cache instead of
   * issuing another full discovery repair immediately.
   * @param {Object} options
   * @param {number} nowMs
   * @return {Object|null}
   * @private
   */
  resolveRecentAuthoritativeDiscoveryRepair(options = {}, nowMs = null) {
    if (stryMutAct_9fa48("6673")) {
      {}
    } else {
      stryCov_9fa48("6673");
      if (stryMutAct_9fa48("6676") ? options?.bypassReuse !== true : stryMutAct_9fa48("6675") ? false : stryMutAct_9fa48("6674") ? true : (stryCov_9fa48("6674", "6675", "6676"), (stryMutAct_9fa48("6677") ? options.bypassReuse : (stryCov_9fa48("6677"), options?.bypassReuse)) === (stryMutAct_9fa48("6678") ? false : (stryCov_9fa48("6678"), true)))) {
        if (stryMutAct_9fa48("6679")) {
          {}
        } else {
          stryCov_9fa48("6679");
          return null;
        }
      }
      const completedAtMs = Number(this.lastAuthoritativeDiscoveryRepairCompletedAtMs);
      if (stryMutAct_9fa48("6682") ? !Number.isFinite(completedAtMs) && completedAtMs <= NUM.ZERO : stryMutAct_9fa48("6681") ? false : stryMutAct_9fa48("6680") ? true : (stryCov_9fa48("6680", "6681", "6682"), (stryMutAct_9fa48("6683") ? Number.isFinite(completedAtMs) : (stryCov_9fa48("6683"), !Number.isFinite(completedAtMs))) || (stryMutAct_9fa48("6686") ? completedAtMs > NUM.ZERO : stryMutAct_9fa48("6685") ? completedAtMs < NUM.ZERO : stryMutAct_9fa48("6684") ? false : (stryCov_9fa48("6684", "6685", "6686"), completedAtMs <= NUM.ZERO)))) {
        if (stryMutAct_9fa48("6687")) {
          {}
        } else {
          stryCov_9fa48("6687");
          return null;
        }
      }
      const reuseWindowMs = (stryMutAct_9fa48("6690") ? Number.isFinite(options?.reuseWindowMs) || options.reuseWindowMs > NUM.ZERO : stryMutAct_9fa48("6689") ? false : stryMutAct_9fa48("6688") ? true : (stryCov_9fa48("6688", "6689", "6690"), Number.isFinite(stryMutAct_9fa48("6691") ? options.reuseWindowMs : (stryCov_9fa48("6691"), options?.reuseWindowMs)) && (stryMutAct_9fa48("6694") ? options.reuseWindowMs <= NUM.ZERO : stryMutAct_9fa48("6693") ? options.reuseWindowMs >= NUM.ZERO : stryMutAct_9fa48("6692") ? true : (stryCov_9fa48("6692", "6693", "6694"), options.reuseWindowMs > NUM.ZERO)))) ? Math.floor(options.reuseWindowMs) : AUTHORITATIVE_DISCOVERY_REPAIR.REUSE_WINDOW_MS;
      if (stryMutAct_9fa48("6697") ? !Number.isFinite(reuseWindowMs) && reuseWindowMs <= NUM.ZERO : stryMutAct_9fa48("6696") ? false : stryMutAct_9fa48("6695") ? true : (stryCov_9fa48("6695", "6696", "6697"), (stryMutAct_9fa48("6698") ? Number.isFinite(reuseWindowMs) : (stryCov_9fa48("6698"), !Number.isFinite(reuseWindowMs))) || (stryMutAct_9fa48("6701") ? reuseWindowMs > NUM.ZERO : stryMutAct_9fa48("6700") ? reuseWindowMs < NUM.ZERO : stryMutAct_9fa48("6699") ? false : (stryCov_9fa48("6699", "6700", "6701"), reuseWindowMs <= NUM.ZERO)))) {
        if (stryMutAct_9fa48("6702")) {
          {}
        } else {
          stryCov_9fa48("6702");
          return null;
        }
      }
      const effectiveNowMs = Number.isFinite(nowMs) ? nowMs : this.nowFn();
      if (stryMutAct_9fa48("6706") ? effectiveNowMs - completedAtMs <= reuseWindowMs : stryMutAct_9fa48("6705") ? effectiveNowMs - completedAtMs >= reuseWindowMs : stryMutAct_9fa48("6704") ? false : stryMutAct_9fa48("6703") ? true : (stryCov_9fa48("6703", "6704", "6705", "6706"), (stryMutAct_9fa48("6707") ? effectiveNowMs + completedAtMs : (stryCov_9fa48("6707"), effectiveNowMs - completedAtMs)) > reuseWindowMs)) {
        if (stryMutAct_9fa48("6708")) {
          {}
        } else {
          stryCov_9fa48("6708");
          return null;
        }
      }
      if (stryMutAct_9fa48("6711") ? !this.lastAuthoritativeDiscoveryRepairResult && this.lastAuthoritativeDiscoveryRepairResult.applied !== true : stryMutAct_9fa48("6710") ? false : stryMutAct_9fa48("6709") ? true : (stryCov_9fa48("6709", "6710", "6711"), (stryMutAct_9fa48("6712") ? this.lastAuthoritativeDiscoveryRepairResult : (stryCov_9fa48("6712"), !this.lastAuthoritativeDiscoveryRepairResult)) || (stryMutAct_9fa48("6714") ? this.lastAuthoritativeDiscoveryRepairResult.applied === true : stryMutAct_9fa48("6713") ? false : (stryCov_9fa48("6713", "6714"), this.lastAuthoritativeDiscoveryRepairResult.applied !== (stryMutAct_9fa48("6715") ? false : (stryCov_9fa48("6715"), true)))))) {
        if (stryMutAct_9fa48("6716")) {
          {}
        } else {
          stryCov_9fa48("6716");
          return null;
        }
      }
      const requestedRepairTables = Array.isArray(stryMutAct_9fa48("6717") ? options.repairTables : (stryCov_9fa48("6717"), options?.repairTables)) ? options.repairTables : this.resolveAuthoritativeDiscoveryRepairTables(options);
      if (stryMutAct_9fa48("6720") ? false : stryMutAct_9fa48("6719") ? true : stryMutAct_9fa48("6718") ? this.lastAuthoritativeDiscoveryRepairCoversTables(requestedRepairTables) : (stryCov_9fa48("6718", "6719", "6720"), !this.lastAuthoritativeDiscoveryRepairCoversTables(requestedRepairTables))) {
        if (stryMutAct_9fa48("6721")) {
          {}
        } else {
          stryCov_9fa48("6721");
          return null;
        }
      }
      return stryMutAct_9fa48("6722") ? {} : (stryCov_9fa48("6722"), {
        ...this.lastAuthoritativeDiscoveryRepairResult,
        reused: stryMutAct_9fa48("6723") ? false : (stryCov_9fa48("6723"), true),
        skipped: stryMutAct_9fa48("6724") ? true : (stryCov_9fa48("6724"), false),
        reusedAtMs: effectiveNowMs
      });
    }
  }

  /**
   * Resolve one canonical authoritative repair table set for the
   * current repair trigger scope.
   * @param {Object} [options={}]
   * @return {string[]}
   */
  resolveAuthoritativeDiscoveryRepairTables(options = {}) {
    if (stryMutAct_9fa48("6725")) {
      {}
    } else {
      stryCov_9fa48("6725");
      const scopedQuery = stryMutAct_9fa48("6728") ? (normalizeIdentifier(options.tableName) !== null || normalizeDiscoveryTableId(options.tableId) !== null) && options.scopedQuery === true : stryMutAct_9fa48("6727") ? false : stryMutAct_9fa48("6726") ? true : (stryCov_9fa48("6726", "6727", "6728"), (stryMutAct_9fa48("6730") ? normalizeIdentifier(options.tableName) !== null && normalizeDiscoveryTableId(options.tableId) !== null : stryMutAct_9fa48("6729") ? false : (stryCov_9fa48("6729", "6730"), (stryMutAct_9fa48("6732") ? normalizeIdentifier(options.tableName) === null : stryMutAct_9fa48("6731") ? false : (stryCov_9fa48("6731", "6732"), normalizeIdentifier(options.tableName) !== null)) || (stryMutAct_9fa48("6734") ? normalizeDiscoveryTableId(options.tableId) === null : stryMutAct_9fa48("6733") ? false : (stryCov_9fa48("6733", "6734"), normalizeDiscoveryTableId(options.tableId) !== null)))) || (stryMutAct_9fa48("6736") ? options.scopedQuery !== true : stryMutAct_9fa48("6735") ? false : (stryCov_9fa48("6735", "6736"), options.scopedQuery === (stryMutAct_9fa48("6737") ? false : (stryCov_9fa48("6737"), true)))));
      return deriveAuthoritativeRepairTables(stryMutAct_9fa48("6738") ? {} : (stryCov_9fa48("6738"), {
        scopedQuery,
        triggerCodes: options.triggerCodes
      }));
    }
  }

  /**
   * Return true when the last successful repair covered every requested
   * table in the current repair set.
   * @param {string[]} requestedRepairTables
   * @return {boolean}
   */
  lastAuthoritativeDiscoveryRepairCoversTables(requestedRepairTables = ADMIN_CACHE_DUMP.EMPTY) {
    if (stryMutAct_9fa48("6739")) {
      {}
    } else {
      stryCov_9fa48("6739");
      if (stryMutAct_9fa48("6742") ? !this.lastAuthoritativeDiscoveryRepairResult && this.lastAuthoritativeDiscoveryRepairResult.applied !== true : stryMutAct_9fa48("6741") ? false : stryMutAct_9fa48("6740") ? true : (stryCov_9fa48("6740", "6741", "6742"), (stryMutAct_9fa48("6743") ? this.lastAuthoritativeDiscoveryRepairResult : (stryCov_9fa48("6743"), !this.lastAuthoritativeDiscoveryRepairResult)) || (stryMutAct_9fa48("6745") ? this.lastAuthoritativeDiscoveryRepairResult.applied === true : stryMutAct_9fa48("6744") ? false : (stryCov_9fa48("6744", "6745"), this.lastAuthoritativeDiscoveryRepairResult.applied !== (stryMutAct_9fa48("6746") ? false : (stryCov_9fa48("6746"), true)))))) {
        if (stryMutAct_9fa48("6747")) {
          {}
        } else {
          stryCov_9fa48("6747");
          return stryMutAct_9fa48("6748") ? true : (stryCov_9fa48("6748"), false);
        }
      }
      const repairedTables = new Set(Array.isArray(this.lastAuthoritativeDiscoveryRepairResult.tableNames) ? this.lastAuthoritativeDiscoveryRepairResult.tableNames : AUTHORITATIVE_DISCOVERY_REPAIR.TABLES);
      const normalizedRequestedRepairTables = (stryMutAct_9fa48("6751") ? Array.isArray(requestedRepairTables) || requestedRepairTables.length > NUM.ZERO : stryMutAct_9fa48("6750") ? false : stryMutAct_9fa48("6749") ? true : (stryCov_9fa48("6749", "6750", "6751"), Array.isArray(requestedRepairTables) && (stryMutAct_9fa48("6754") ? requestedRepairTables.length <= NUM.ZERO : stryMutAct_9fa48("6753") ? requestedRepairTables.length >= NUM.ZERO : stryMutAct_9fa48("6752") ? true : (stryCov_9fa48("6752", "6753", "6754"), requestedRepairTables.length > NUM.ZERO)))) ? requestedRepairTables : AUTHORITATIVE_DISCOVERY_REPAIR.TABLES;
      return stryMutAct_9fa48("6755") ? normalizedRequestedRepairTables.some(tableName => repairedTables.has(tableName)) : (stryCov_9fa48("6755"), normalizedRequestedRepairTables.every(stryMutAct_9fa48("6756") ? () => undefined : (stryCov_9fa48("6756"), tableName => repairedTables.has(tableName))));
    }
  }

  /**
   * Reconcile one cached system table with authoritative query
   * rows.
   * @param {string} tableName
   * @param {Array<Object>} rows
   * @param {string} causeId
   * @return {number}
   */
  async applyAuthoritativeSystemTableRows(tableName, rows, causeId) {
    if (stryMutAct_9fa48("6757")) {
      {}
    } else {
      stryCov_9fa48("6757");
      const authoritativeRows = Array.isArray(rows) ? rows : ADMIN_CACHE_DUMP.EMPTY;
      const primaryKeyField = getSystemCachePrimaryKeyField(tableName);
      const cachedRows = this.systemTableCache.getAll(tableName);
      const result = await this.controlPlaneSystemTableGateway.reconcileAuthoritativeCacheRows(tableName, authoritativeRows, stryMutAct_9fa48("6758") ? {} : (stryCov_9fa48("6758"), {
        causeId,
        primaryKeyField,
        cachedRows,
        cacheMutationTarget: this.cacheMutationTarget,
        systemTableCache: this.systemTableCache
      }));
      return stryMutAct_9fa48("6761") ? result?.mutationCount && NUM.ZERO : stryMutAct_9fa48("6760") ? false : stryMutAct_9fa48("6759") ? true : (stryCov_9fa48("6759", "6760", "6761"), (stryMutAct_9fa48("6762") ? result.mutationCount : (stryCov_9fa48("6762"), result?.mutationCount)) || NUM.ZERO);
    }
  }

  /**
   * Build canonical query_result payload for service discovery
   * query.
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async buildServiceDiscoveryQueryResult(options = {}) {
    if (stryMutAct_9fa48("6763")) {
      {}
    } else {
      stryCov_9fa48("6763");
      const snapshot = await this.resolveServiceDiscoverySnapshot(options);
      return stryMutAct_9fa48("6764") ? {} : (stryCov_9fa48("6764"), {
        success: stryMutAct_9fa48("6765") ? false : (stryCov_9fa48("6765"), true),
        rows: stryMutAct_9fa48("6766") ? [] : (stryCov_9fa48("6766"), [snapshot]),
        count: NUM.ONE,
        partitions: ADMIN_CACHE_DUMP.EMPTY,
        tableName: ADMIN_SERVICE_DISCOVERY.TABLE_NAME
      });
    }
  }
}
export { AdminServiceDiscovery, AUTHORITATIVE_DISCOVERY_REPAIR, parseDiscoveryBooleanQuery, parseDiscoveryListQuery, parseServiceDiscoverySqlQuery };