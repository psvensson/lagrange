/**
 * Control snapshot building for the admin WebSocket API.
 *
 * This module owns all control-snapshot diagnostics: leader summary,
 * voter counts, replica operation summary, and CDC telemetry. The parent
 * AdminWebSocketAPI instantiates one AdminControlSnapshot and delegates
 * all control-snapshot-related calls to it.
 *
 * Single-use helpers that exist only for control-snapshot logic live here
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
import { COLUMN, NUM, TABLES, TIME_MS, TYPEOF } from '../constants/index.js';
import { PARTITION_TRANSITION_METADATA_FIELD } from '../partition/partition-constants.js';
import { isLoadReadyReplicaRaftRole } from '../node/replica-state-machine-constants.js';
import { CONTROL_PLANE_READINESS_DIMENSION } from '../control-plane/control-plane-readiness-constants.js';
import { evaluateAuthoritativeRepairPolicy } from './admin-authoritative-repair-policy.js';
import { AUTHORITATIVE_REPAIR_TRIGGER } from './admin-authoritative-repair-policy.js';
import { summarizeReplicaOperationLiveness } from '../rebalancer/replica-operation-liveness.js';
import { TERMINAL_STATUSES as REPLICA_OPERATION_TERMINAL_STATUSES, isTerminalStep as isTerminalReplicaOperationStep, isValidWorkflowStep as isValidReplicaOperationStep } from '../rebalancer/replica-status.js';
import { ADMIN_CACHE_DUMP, ADMIN_CONTROL_SNAPSHOT, ADMIN_ERROR_MESSAGE, ADMIN_OPERATIONAL_DIAGNOSTICS, CONSISTENCY_MISMATCH_KIND } from './admin-constants.js';
import { filterActiveServingPartitionRows, firstStringField, uniqueSorted } from './admin-helpers.js';
import { resolveActiveNodeViews, buildReadinessByNodeId, hasCanonicalWebSocketEndpoint, hasCanonicalWebSocketEndpoints, isCanonicalWebSocketEndpointRow, isCanonicallyActiveNode } from '../control-plane/active-node-projection.js';
import { buildPublicationRecoveryProtocolSnapshot } from '../control-plane/recovery-protocol-snapshot.js';
import { normalizeControlPlanePublicationRow } from '../control-plane/system-row-normalizers.js';
import { buildPriorityRecoveryDecisionSnapshots as buildSharedPriorityRecoveryDecisionSnapshots } from '../control-plane/priority-recovery-snapshot.js';
import { PRIORITY_RECOVERY_BLOCKER_REASON, PRIORITY_RECOVERY_BLOCKER_REASON_PRECEDENCE, PRIORITY_RECOVERY_BLOCKER_TO_SEMANTIC_STATE, PRIORITY_RECOVERY_CORRELATION_KEY, PRIORITY_RECOVERY_PROGRESS_CLASS_IDS, PRIORITY_RECOVERY_SEMANTIC_STATE, PRIORITY_RECOVERY_SEMANTIC_STATE_IDS, PRIORITY_RECOVERY_UNRESOLVED_SEMANTIC_STATE_IDS } from '../control-plane/priority-recovery-diagnostics-constants.js';
import { evaluateSharedMetadataNodeCoverage } from './admin-shared-metadata-consistency.js';
import { hasAuthoritativeRepairTrigger, isReplicaOperationsOnlyRepairScope, isReplicaOperationsOnlyTableSet, shouldAttemptAuthoritativeRepair } from './admin-authoritative-repair-evaluation.js';
import { LogsTableService } from '../logging/logs-table-service.js';
import { StartupRecoveryCoordinator } from '../bootstrap/startup-recovery-coordinator.js';

// ── file-local constants ────────────────────────────────────────────────────
const ADMIN_CONTROL_SNAPSHOT_LITERAL = Object.freeze(stryMutAct_9fa48("1026") ? {} : (stryCov_9fa48("1026"), {
  VALUE: stryMutAct_9fa48("1027") ? "Stryker was here!" : (stryCov_9fa48("1027"), ''),
  READY: stryMutAct_9fa48("1028") ? "" : (stryCov_9fa48("1028"), 'ready'),
  UPDATEDAT: stryMutAct_9fa48("1029") ? "" : (stryCov_9fa48("1029"), 'updatedAt'),
  UPDATED_AT: stryMutAct_9fa48("1030") ? "" : (stryCov_9fa48("1030"), 'updated_at'),
  UNKNOWN_ERROR: stryMutAct_9fa48("1031") ? "" : (stryCov_9fa48("1031"), 'unknown_error'),
  PUBLISHED: stryMutAct_9fa48("1032") ? "" : (stryCov_9fa48("1032"), 'PUBLISHED'),
  NODEID: stryMutAct_9fa48("1033") ? "" : (stryCov_9fa48("1033"), 'nodeId'),
  ID: stryMutAct_9fa48("1034") ? "" : (stryCov_9fa48("1034"), 'id'),
  NAME: stryMutAct_9fa48("1035") ? "" : (stryCov_9fa48("1035"), 'name'),
  CAPTUREDAT: stryMutAct_9fa48("1036") ? "" : (stryCov_9fa48("1036"), 'capturedAt'),
  SOURCELEADERNODEID: stryMutAct_9fa48("1037") ? "" : (stryCov_9fa48("1037"), 'sourceLeaderNodeId'),
  DECISIONTIMESTAMP: stryMutAct_9fa48("1038") ? "" : (stryCov_9fa48("1038"), 'decisionTimestamp'),
  FAILEDAT: stryMutAct_9fa48("1039") ? "" : (stryCov_9fa48("1039"), 'failedAt'),
  NEXTATTEMPTAT: stryMutAct_9fa48("1040") ? "" : (stryCov_9fa48("1040"), 'nextAttemptAt'),
  TABLEID: stryMutAct_9fa48("1041") ? "" : (stryCov_9fa48("1041"), 'tableId'),
  TABLE_NAME: stryMutAct_9fa48("1042") ? "" : (stryCov_9fa48("1042"), 'table_name'),
  TABLENAME: stryMutAct_9fa48("1043") ? "" : (stryCov_9fa48("1043"), 'tableName'),
  PARTITIONSTATE: stryMutAct_9fa48("1044") ? "" : (stryCov_9fa48("1044"), 'partitionState'),
  REPLICAID: stryMutAct_9fa48("1045") ? "" : (stryCov_9fa48("1045"), 'replicaId'),
  RAFTROLE: stryMutAct_9fa48("1046") ? "" : (stryCov_9fa48("1046"), 'raftRole'),
  STATUS: stryMutAct_9fa48("1047") ? "" : (stryCov_9fa48("1047"), 'status'),
  ADDRESS: stryMutAct_9fa48("1048") ? "" : (stryCov_9fa48("1048"), 'address')
}));
const LEADER_RAFT_ROLE = stryMutAct_9fa48("1049") ? "" : (stryCov_9fa48("1049"), 'leader');
const SERVICE_TYPE_PARTITION = stryMutAct_9fa48("1050") ? "" : (stryCov_9fa48("1050"), 'partition');
const STATUS_ACTIVE = stryMutAct_9fa48("1051") ? "" : (stryCov_9fa48("1051"), 'active');
const PARTITION_STATE_NORMAL = stryMutAct_9fa48("1052") ? "" : (stryCov_9fa48("1052"), 'NORMAL');
const PARTITION_STATE_UNKNOWN = stryMutAct_9fa48("1053") ? "" : (stryCov_9fa48("1053"), 'unknown');
const SQL_DIAGNOSTICS_REPLICA_COUNT = NUM.THREE;
const CONTROL_PLANE_DIAGNOSTICS_SCHEMA_VERSION = 1;
const CONTROL_PLANE_DIAGNOSTICS_READINESS_CACHE_MAX_AGE_MS = 5000;
const CONTROL_PLANE_DIAGNOSTICS_LEDGER_LIMIT = 64;
const CONTROL_SNAPSHOT_CACHE_STALE_THRESHOLD_MS = 5000;
const MANAGED_SPLIT_WORKFLOW_TYPE = stryMutAct_9fa48("1054") ? "" : (stryCov_9fa48("1054"), 'managed_split');
const CONTROL_SNAPSHOT_REPAIR_REASON = stryMutAct_9fa48("1055") ? "" : (stryCov_9fa48("1055"), 'control_snapshot');
const CDC_TELEMETRY_MODE = Object.freeze(stryMutAct_9fa48("1056") ? {} : (stryCov_9fa48("1056"), {
  STEADY: stryMutAct_9fa48("1057") ? "" : (stryCov_9fa48("1057"), 'steady'),
  CATCHUP: stryMutAct_9fa48("1058") ? "" : (stryCov_9fa48("1058"), 'catchup')
}));
const CONTROL_PLANE_DIAGNOSTICS_CDC_REPLAY_LIMIT = 5;
const MEMBERSHIP_PUBLICATION_KIND = stryMutAct_9fa48("1059") ? "" : (stryCov_9fa48("1059"), 'cluster_membership');
const AUTHORITATIVE_REPAIR_CAUSE_LEADER_RESOLUTION_GAP = stryMutAct_9fa48("1060") ? "" : (stryCov_9fa48("1060"), 'leader_resolution_gap');
const AUTHORITATIVE_REPAIR_CAUSE_QUERY_TIMEOUT = stryMutAct_9fa48("1061") ? "" : (stryCov_9fa48("1061"), 'query_timeout');
const AUTHORITATIVE_REPAIR_CAUSE_CONTROL_PLANE_BACKPRESSURE = stryMutAct_9fa48("1062") ? "" : (stryCov_9fa48("1062"), 'control_plane_backpressure');
const CONTROL_SNAPSHOT_PUBLICATION_READ_REPAIR_ERROR_FRAGMENTS = Object.freeze(stryMutAct_9fa48("1063") ? [] : (stryCov_9fa48("1063"), [stryMutAct_9fa48("1064") ? "" : (stryCov_9fa48("1064"), 'leader is unknown'), stryMutAct_9fa48("1065") ? "" : (stryCov_9fa48("1065"), 'leader unknown'), stryMutAct_9fa48("1066") ? "" : (stryCov_9fa48("1066"), 'no handler'), stryMutAct_9fa48("1067") ? "" : (stryCov_9fa48("1067"), 'no leader'), stryMutAct_9fa48("1068") ? "" : (stryCov_9fa48("1068"), 'partition_service_not_found'), stryMutAct_9fa48("1069") ? "" : (stryCov_9fa48("1069"), 'partition service not found')]));
const PRIORITY_RECOVERY_DECISION_SNAPSHOT_SCHEMA_VERSION = 1;
const PRIORITY_RECOVERY_REPLICA_OPERATION_ENTITY_TYPE_PARTITION = stryMutAct_9fa48("1070") ? "" : (stryCov_9fa48("1070"), 'partition');
const PRIORITY_RECOVERY_RAFT_ROLE_LEARNER = stryMutAct_9fa48("1071") ? "" : (stryCov_9fa48("1071"), 'learner');
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_OPERATION_ID = stryMutAct_9fa48("1072") ? "" : (stryCov_9fa48("1072"), 'operation_id');
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_PARTITION_ID = stryMutAct_9fa48("1073") ? "" : (stryCov_9fa48("1073"), 'partition_id');
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_ENTITY_ID = stryMutAct_9fa48("1074") ? "" : (stryCov_9fa48("1074"), 'entity_id');
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_ENTITY_TYPE = stryMutAct_9fa48("1075") ? "" : (stryCov_9fa48("1075"), 'entity_type');
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_STATUS = stryMutAct_9fa48("1076") ? "" : (stryCov_9fa48("1076"), 'status');
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_WORKFLOW_STEP = stryMutAct_9fa48("1077") ? "" : (stryCov_9fa48("1077"), 'workflow_step');
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_TARGET_NODE_ID = stryMutAct_9fa48("1078") ? "" : (stryCov_9fa48("1078"), 'target_node_id');
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_SOURCE_NODE_ID = stryMutAct_9fa48("1079") ? "" : (stryCov_9fa48("1079"), 'source_node_id');
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_REPLICA_ID = stryMutAct_9fa48("1080") ? "" : (stryCov_9fa48("1080"), 'replica_id');
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_CREATED_AT = stryMutAct_9fa48("1081") ? "" : (stryCov_9fa48("1081"), 'created_at');
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_UPDATED_AT = stryMutAct_9fa48("1082") ? "" : (stryCov_9fa48("1082"), 'updated_at');
const PRIORITY_RECOVERY_SERVICE_FIELD_RAFT_ROLE = stryMutAct_9fa48("1083") ? "" : (stryCov_9fa48("1083"), 'raft_role');
const PRIORITY_RECOVERY_SERVICE_FIELD_NODE_ID = stryMutAct_9fa48("1084") ? "" : (stryCov_9fa48("1084"), 'node_id');
const PRIORITY_RECOVERY_SERVICE_FIELD_STATUS = stryMutAct_9fa48("1085") ? "" : (stryCov_9fa48("1085"), 'status');
const PRIORITY_RECOVERY_SERVICE_FIELD_PARTITION_ID = stryMutAct_9fa48("1086") ? "" : (stryCov_9fa48("1086"), 'partition_id');
const PRIORITY_RECOVERY_STATUS_ACTIVE = stryMutAct_9fa48("1087") ? "" : (stryCov_9fa48("1087"), 'active');
const PRIORITY_RECOVERY_LEARNER_HOLD_REASON_NOT_RECOVERY_ELIGIBLE = stryMutAct_9fa48("1088") ? "" : (stryCov_9fa48("1088"), 'not_control_plane_recovery_eligible');
const PRIORITY_RECOVERY_LEARNER_HOLD_REASON_RECOVERY_ONLY = stryMutAct_9fa48("1089") ? "" : (stryCov_9fa48("1089"), 'recovery_eligible_not_repair_eligible');
const PRIORITY_RECOVERY_LEARNER_HOLD_REASON_NO_READINESS = stryMutAct_9fa48("1090") ? "" : (stryCov_9fa48("1090"), 'readiness_unknown');
const PRIORITY_RECOVERY_PLANNER_REASON_PRIORITY_SPREAD_GAP = stryMutAct_9fa48("1091") ? "" : (stryCov_9fa48("1091"), 'priority_spread_gap');
const PRIORITY_RECOVERY_PLANNER_REASON_PRIORITY_PARTITION_MISSING = stryMutAct_9fa48("1092") ? "" : (stryCov_9fa48("1092"), 'priority_partition_missing');
const PRIORITY_RECOVERY_PUBLICATION_INCLUSION_REASON_RECOVERY_ELIGIBLE_PROJECTION_INCLUDED = stryMutAct_9fa48("1093") ? "" : (stryCov_9fa48("1093"), 'recovery_eligible_projection_included');
const PRIORITY_RECOVERY_PUBLICATION_EXCLUSION_REASON_READINESS_PROJECTION_EXCLUDED = stryMutAct_9fa48("1094") ? "" : (stryCov_9fa48("1094"), 'readiness_projection_excluded');
const PRIORITY_RECOVERY_PUBLICATION_EXCLUSION_REASON_CLUSTER_MEMBER_UNHEALTHY = stryMutAct_9fa48("1095") ? "" : (stryCov_9fa48("1095"), 'cluster_member_unhealthy');
const PRIORITY_RECOVERY_TERMINAL_OPERATION_STATUS_SET = new Set(REPLICA_OPERATION_TERMINAL_STATUSES.map(stryMutAct_9fa48("1096") ? () => undefined : (stryCov_9fa48("1096"), status => stryMutAct_9fa48("1097") ? String(status || '').toUpperCase() : (stryCov_9fa48("1097"), String(stryMutAct_9fa48("1100") ? status && '' : stryMutAct_9fa48("1099") ? false : stryMutAct_9fa48("1098") ? true : (stryCov_9fa48("1098", "1099", "1100"), status || (stryMutAct_9fa48("1101") ? "Stryker was here!" : (stryCov_9fa48("1101"), '')))).toLowerCase()))));
const MEMBERSHIP_PUBLICATION_READ_PROFILE_DIAGNOSTICS = stryMutAct_9fa48("1102") ? "" : (stryCov_9fa48("1102"), 'diagnostics'); /**
                                                                                                                                * Normalize one arbitrary value to a non-negative integer.
                                                                                                                                * @param {*} value
                                                                                                                                * @return {number}
                                                                                                                                */
function toNonNegativeInteger(value) {
  if (stryMutAct_9fa48("1103")) {
    {}
  } else {
    stryCov_9fa48("1103");
    const parsedValue = Number(value);
    if (stryMutAct_9fa48("1106") ? !Number.isFinite(parsedValue) && parsedValue < NUM.ZERO : stryMutAct_9fa48("1105") ? false : stryMutAct_9fa48("1104") ? true : (stryCov_9fa48("1104", "1105", "1106"), (stryMutAct_9fa48("1107") ? Number.isFinite(parsedValue) : (stryCov_9fa48("1107"), !Number.isFinite(parsedValue))) || (stryMutAct_9fa48("1110") ? parsedValue >= NUM.ZERO : stryMutAct_9fa48("1109") ? parsedValue <= NUM.ZERO : stryMutAct_9fa48("1108") ? false : (stryCov_9fa48("1108", "1109", "1110"), parsedValue < NUM.ZERO)))) {
      if (stryMutAct_9fa48("1111")) {
        {}
      } else {
        stryCov_9fa48("1111");
        return NUM.ZERO;
      }
    }
    return Math.floor(parsedValue);
  }
}
function buildLogsTableRetentionDiagnostics() {
  if (stryMutAct_9fa48("1112")) {
    {}
  } else {
    stryCov_9fa48("1112");
    const stats = (stryMutAct_9fa48("1115") ? LogsTableService.instance || typeof LogsTableService.instance.getStats === TYPEOF.FUNCTION : stryMutAct_9fa48("1114") ? false : stryMutAct_9fa48("1113") ? true : (stryCov_9fa48("1113", "1114", "1115"), LogsTableService.instance && (stryMutAct_9fa48("1117") ? typeof LogsTableService.instance.getStats !== TYPEOF.FUNCTION : stryMutAct_9fa48("1116") ? true : (stryCov_9fa48("1116", "1117"), typeof LogsTableService.instance.getStats === TYPEOF.FUNCTION)))) ? LogsTableService.instance.getStats() : null;
    if (stryMutAct_9fa48("1120") ? !stats && typeof stats !== TYPEOF.OBJECT : stryMutAct_9fa48("1119") ? false : stryMutAct_9fa48("1118") ? true : (stryCov_9fa48("1118", "1119", "1120"), (stryMutAct_9fa48("1121") ? stats : (stryCov_9fa48("1121"), !stats)) || (stryMutAct_9fa48("1123") ? typeof stats === TYPEOF.OBJECT : stryMutAct_9fa48("1122") ? false : (stryCov_9fa48("1122", "1123"), typeof stats !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("1124")) {
        {}
      } else {
        stryCov_9fa48("1124");
        return null;
      }
    }
    return stryMutAct_9fa48("1125") ? {} : (stryCov_9fa48("1125"), {
      pendingWrites: toNonNegativeInteger(stats.pendingWrites),
      pendingWriteGrowthCount: toNonNegativeInteger(stats.pendingWriteGrowthCount),
      retainedBacklogGrowthCount: toNonNegativeInteger(stats.retainedBacklogGrowthCount),
      retainedPressureBacklogCap: toNonNegativeInteger(stats.retainedPressureBacklogCap),
      maxPendingWrites: toNonNegativeInteger(stats.maxPendingWrites),
      isWriting: stryMutAct_9fa48("1128") ? stats.isWriting !== true : stryMutAct_9fa48("1127") ? false : stryMutAct_9fa48("1126") ? true : (stryCov_9fa48("1126", "1127", "1128"), stats.isWriting === (stryMutAct_9fa48("1129") ? false : (stryCov_9fa48("1129"), true))),
      consecutiveDeferredWriteFailures: toNonNegativeInteger(stats.consecutiveDeferredWriteFailures),
      sharedPressureBackpressured: stryMutAct_9fa48("1132") ? stats.sharedPressureBackpressured !== true : stryMutAct_9fa48("1131") ? false : stryMutAct_9fa48("1130") ? true : (stryCov_9fa48("1130", "1131", "1132"), stats.sharedPressureBackpressured === (stryMutAct_9fa48("1133") ? false : (stryCov_9fa48("1133"), true)))
    });
  }
}
function hasOnlyLeaderResolutionGapRepairCause(repair = null) {
  if (stryMutAct_9fa48("1134")) {
    {}
  } else {
    stryCov_9fa48("1134");
    const causeChain = Array.isArray(stryMutAct_9fa48("1135") ? repair.causeChain : (stryCov_9fa48("1135"), repair?.causeChain)) ? stryMutAct_9fa48("1136") ? repair.causeChain : (stryCov_9fa48("1136"), repair.causeChain.filter(stryMutAct_9fa48("1137") ? () => undefined : (stryCov_9fa48("1137"), value => stryMutAct_9fa48("1140") ? typeof value === TYPEOF.STRING || value.length > NUM.ZERO : stryMutAct_9fa48("1139") ? false : stryMutAct_9fa48("1138") ? true : (stryCov_9fa48("1138", "1139", "1140"), (stryMutAct_9fa48("1142") ? typeof value !== TYPEOF.STRING : stryMutAct_9fa48("1141") ? true : (stryCov_9fa48("1141", "1142"), typeof value === TYPEOF.STRING)) && (stryMutAct_9fa48("1145") ? value.length <= NUM.ZERO : stryMutAct_9fa48("1144") ? value.length >= NUM.ZERO : stryMutAct_9fa48("1143") ? true : (stryCov_9fa48("1143", "1144", "1145"), value.length > NUM.ZERO)))))) : ADMIN_CACHE_DUMP.EMPTY;
    return stryMutAct_9fa48("1148") ? causeChain.length > NUM.ZERO || causeChain.every(value => value === AUTHORITATIVE_REPAIR_CAUSE_LEADER_RESOLUTION_GAP) : stryMutAct_9fa48("1147") ? false : stryMutAct_9fa48("1146") ? true : (stryCov_9fa48("1146", "1147", "1148"), (stryMutAct_9fa48("1151") ? causeChain.length <= NUM.ZERO : stryMutAct_9fa48("1150") ? causeChain.length >= NUM.ZERO : stryMutAct_9fa48("1149") ? true : (stryCov_9fa48("1149", "1150", "1151"), causeChain.length > NUM.ZERO)) && (stryMutAct_9fa48("1152") ? causeChain.some(value => value === AUTHORITATIVE_REPAIR_CAUSE_LEADER_RESOLUTION_GAP) : (stryCov_9fa48("1152"), causeChain.every(stryMutAct_9fa48("1153") ? () => undefined : (stryCov_9fa48("1153"), value => stryMutAct_9fa48("1156") ? value !== AUTHORITATIVE_REPAIR_CAUSE_LEADER_RESOLUTION_GAP : stryMutAct_9fa48("1155") ? false : stryMutAct_9fa48("1154") ? true : (stryCov_9fa48("1154", "1155", "1156"), value === AUTHORITATIVE_REPAIR_CAUSE_LEADER_RESOLUTION_GAP))))));
  }
}
function hasPressureOrTimeoutRepairCause(repair = null) {
  if (stryMutAct_9fa48("1157")) {
    {}
  } else {
    stryCov_9fa48("1157");
    const causeChain = Array.isArray(stryMutAct_9fa48("1158") ? repair.causeChain : (stryCov_9fa48("1158"), repair?.causeChain)) ? stryMutAct_9fa48("1159") ? repair.causeChain : (stryCov_9fa48("1159"), repair.causeChain.filter(stryMutAct_9fa48("1160") ? () => undefined : (stryCov_9fa48("1160"), value => stryMutAct_9fa48("1163") ? typeof value === TYPEOF.STRING || value.length > NUM.ZERO : stryMutAct_9fa48("1162") ? false : stryMutAct_9fa48("1161") ? true : (stryCov_9fa48("1161", "1162", "1163"), (stryMutAct_9fa48("1165") ? typeof value !== TYPEOF.STRING : stryMutAct_9fa48("1164") ? true : (stryCov_9fa48("1164", "1165"), typeof value === TYPEOF.STRING)) && (stryMutAct_9fa48("1168") ? value.length <= NUM.ZERO : stryMutAct_9fa48("1167") ? value.length >= NUM.ZERO : stryMutAct_9fa48("1166") ? true : (stryCov_9fa48("1166", "1167", "1168"), value.length > NUM.ZERO)))))) : ADMIN_CACHE_DUMP.EMPTY;
    return stryMutAct_9fa48("1171") ? causeChain.includes(AUTHORITATIVE_REPAIR_CAUSE_QUERY_TIMEOUT) && causeChain.includes(AUTHORITATIVE_REPAIR_CAUSE_CONTROL_PLANE_BACKPRESSURE) : stryMutAct_9fa48("1170") ? false : stryMutAct_9fa48("1169") ? true : (stryCov_9fa48("1169", "1170", "1171"), causeChain.includes(AUTHORITATIVE_REPAIR_CAUSE_QUERY_TIMEOUT) || causeChain.includes(AUTHORITATIVE_REPAIR_CAUSE_CONTROL_PLANE_BACKPRESSURE));
  }
}
function isRecoverableControlSnapshotPublicationReadError(error = null) {
  if (stryMutAct_9fa48("1172")) {
    {}
  } else {
    stryCov_9fa48("1172");
    const message = stryMutAct_9fa48("1173") ? String(error?.message || error || '').toUpperCase() : (stryCov_9fa48("1173"), String(stryMutAct_9fa48("1176") ? (error?.message || error) && '' : stryMutAct_9fa48("1175") ? false : stryMutAct_9fa48("1174") ? true : (stryCov_9fa48("1174", "1175", "1176"), (stryMutAct_9fa48("1178") ? error?.message && error : stryMutAct_9fa48("1177") ? false : (stryCov_9fa48("1177", "1178"), (stryMutAct_9fa48("1179") ? error.message : (stryCov_9fa48("1179"), error?.message)) || error)) || (stryMutAct_9fa48("1180") ? "Stryker was here!" : (stryCov_9fa48("1180"), '')))).toLowerCase());
    return stryMutAct_9fa48("1183") ? message.length > NUM.ZERO || CONTROL_SNAPSHOT_PUBLICATION_READ_REPAIR_ERROR_FRAGMENTS.some(fragment => message.includes(fragment)) : stryMutAct_9fa48("1182") ? false : stryMutAct_9fa48("1181") ? true : (stryCov_9fa48("1181", "1182", "1183"), (stryMutAct_9fa48("1186") ? message.length <= NUM.ZERO : stryMutAct_9fa48("1185") ? message.length >= NUM.ZERO : stryMutAct_9fa48("1184") ? true : (stryCov_9fa48("1184", "1185", "1186"), message.length > NUM.ZERO)) && (stryMutAct_9fa48("1187") ? CONTROL_SNAPSHOT_PUBLICATION_READ_REPAIR_ERROR_FRAGMENTS.every(fragment => message.includes(fragment)) : (stryCov_9fa48("1187"), CONTROL_SNAPSHOT_PUBLICATION_READ_REPAIR_ERROR_FRAGMENTS.some(stryMutAct_9fa48("1188") ? () => undefined : (stryCov_9fa48("1188"), fragment => message.includes(fragment))))));
  }
}
function buildAuthoritativeControlSnapshotRepairFailure(detail, cause = null) {
  if (stryMutAct_9fa48("1189")) {
    {}
  } else {
    stryCov_9fa48("1189");
    const error = new Error((stryMutAct_9fa48("1190") ? "" : (stryCov_9fa48("1190"), 'Authoritative control snapshot repair failed: ')) + String(stryMutAct_9fa48("1193") ? detail && 'unknown_error' : stryMutAct_9fa48("1192") ? false : stryMutAct_9fa48("1191") ? true : (stryCov_9fa48("1191", "1192", "1193"), detail || (stryMutAct_9fa48("1194") ? "" : (stryCov_9fa48("1194"), 'unknown_error')))));
    if (stryMutAct_9fa48("1196") ? false : stryMutAct_9fa48("1195") ? true : (stryCov_9fa48("1195", "1196"), cause)) {
      if (stryMutAct_9fa48("1197")) {
        {}
      } else {
        stryCov_9fa48("1197");
        error.cause = cause;
      }
    }
    return error;
  }
}
function isReadyLocalQueryTransportDiagnostic(localQueryTransport = null) {
  if (stryMutAct_9fa48("1198")) {
    {}
  } else {
    stryCov_9fa48("1198");
    if (stryMutAct_9fa48("1201") ? !localQueryTransport && typeof localQueryTransport !== TYPEOF.OBJECT : stryMutAct_9fa48("1200") ? false : stryMutAct_9fa48("1199") ? true : (stryCov_9fa48("1199", "1200", "1201"), (stryMutAct_9fa48("1202") ? localQueryTransport : (stryCov_9fa48("1202"), !localQueryTransport)) || (stryMutAct_9fa48("1204") ? typeof localQueryTransport === TYPEOF.OBJECT : stryMutAct_9fa48("1203") ? false : (stryCov_9fa48("1203", "1204"), typeof localQueryTransport !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("1205")) {
        {}
      } else {
        stryCov_9fa48("1205");
        return stryMutAct_9fa48("1206") ? true : (stryCov_9fa48("1206"), false);
      }
    }
    if (stryMutAct_9fa48("1209") ? localQueryTransport.ready !== true : stryMutAct_9fa48("1208") ? false : stryMutAct_9fa48("1207") ? true : (stryCov_9fa48("1207", "1208", "1209"), localQueryTransport.ready === (stryMutAct_9fa48("1210") ? false : (stryCov_9fa48("1210"), true)))) {
      if (stryMutAct_9fa48("1211")) {
        {}
      } else {
        stryCov_9fa48("1211");
        return stryMutAct_9fa48("1212") ? false : (stryCov_9fa48("1212"), true);
      }
    }
    return stryMutAct_9fa48("1215") ? String(localQueryTransport.state || ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE).toLowerCase() !== ADMIN_CONTROL_SNAPSHOT_LITERAL.READY : stryMutAct_9fa48("1214") ? false : stryMutAct_9fa48("1213") ? true : (stryCov_9fa48("1213", "1214", "1215"), (stryMutAct_9fa48("1216") ? String(localQueryTransport.state || ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE).toUpperCase() : (stryCov_9fa48("1216"), String(stryMutAct_9fa48("1219") ? localQueryTransport.state && ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE : stryMutAct_9fa48("1218") ? false : stryMutAct_9fa48("1217") ? true : (stryCov_9fa48("1217", "1218", "1219"), localQueryTransport.state || ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE)).toLowerCase())) === ADMIN_CONTROL_SNAPSHOT_LITERAL.READY);
  }
}
function buildMembershipPublicationReadOptions(options = {}) {
  if (stryMutAct_9fa48("1220")) {
    {}
  } else {
    stryCov_9fa48("1220");
    return (stryMutAct_9fa48("1223") ? options.preferAuthoritativeRead !== true : stryMutAct_9fa48("1222") ? false : stryMutAct_9fa48("1221") ? true : (stryCov_9fa48("1221", "1222", "1223"), options.preferAuthoritativeRead === (stryMutAct_9fa48("1224") ? false : (stryCov_9fa48("1224"), true)))) ? stryMutAct_9fa48("1225") ? {} : (stryCov_9fa48("1225"), {
      preferAuthoritativeRead: stryMutAct_9fa48("1226") ? false : (stryCov_9fa48("1226"), true),
      readProfile: MEMBERSHIP_PUBLICATION_READ_PROFILE_DIAGNOSTICS
    }) : stryMutAct_9fa48("1227") ? {} : (stryCov_9fa48("1227"), {
      readProfile: MEMBERSHIP_PUBLICATION_READ_PROFILE_DIAGNOSTICS
    });
  }
}
function buildCdcReplayRetentionDiagnostics(partitionServices) {
  if (stryMutAct_9fa48("1228")) {
    {}
  } else {
    stryCov_9fa48("1228");
    if (stryMutAct_9fa48("1231") ? !(partitionServices instanceof Map) && partitionServices.size === NUM.ZERO : stryMutAct_9fa48("1230") ? false : stryMutAct_9fa48("1229") ? true : (stryCov_9fa48("1229", "1230", "1231"), (stryMutAct_9fa48("1232") ? partitionServices instanceof Map : (stryCov_9fa48("1232"), !(partitionServices instanceof Map))) || (stryMutAct_9fa48("1234") ? partitionServices.size !== NUM.ZERO : stryMutAct_9fa48("1233") ? false : (stryCov_9fa48("1233", "1234"), partitionServices.size === NUM.ZERO)))) {
      if (stryMutAct_9fa48("1235")) {
        {}
      } else {
        stryCov_9fa48("1235");
        return null;
      }
    }
    const entries = stryMutAct_9fa48("1236") ? ["Stryker was here"] : (stryCov_9fa48("1236"), []);
    for (const partitionService of partitionServices.values()) {
      if (stryMutAct_9fa48("1237")) {
        {}
      } else {
        stryCov_9fa48("1237");
        if (stryMutAct_9fa48("1240") ? !partitionService && typeof partitionService.getStats !== TYPEOF.FUNCTION : stryMutAct_9fa48("1239") ? false : stryMutAct_9fa48("1238") ? true : (stryCov_9fa48("1238", "1239", "1240"), (stryMutAct_9fa48("1241") ? partitionService : (stryCov_9fa48("1241"), !partitionService)) || (stryMutAct_9fa48("1243") ? typeof partitionService.getStats === TYPEOF.FUNCTION : stryMutAct_9fa48("1242") ? false : (stryCov_9fa48("1242", "1243"), typeof partitionService.getStats !== TYPEOF.FUNCTION)))) {
          if (stryMutAct_9fa48("1244")) {
            {}
          } else {
            stryCov_9fa48("1244");
            continue;
          }
        }
        const stats = partitionService.getStats();
        const replay = (stryMutAct_9fa48("1247") ? stats?.cdcReplay || typeof stats.cdcReplay === TYPEOF.OBJECT : stryMutAct_9fa48("1246") ? false : stryMutAct_9fa48("1245") ? true : (stryCov_9fa48("1245", "1246", "1247"), (stryMutAct_9fa48("1248") ? stats.cdcReplay : (stryCov_9fa48("1248"), stats?.cdcReplay)) && (stryMutAct_9fa48("1250") ? typeof stats.cdcReplay !== TYPEOF.OBJECT : stryMutAct_9fa48("1249") ? true : (stryCov_9fa48("1249", "1250"), typeof stats.cdcReplay === TYPEOF.OBJECT)))) ? stats.cdcReplay : null;
        if (stryMutAct_9fa48("1253") ? false : stryMutAct_9fa48("1252") ? true : stryMutAct_9fa48("1251") ? replay : (stryCov_9fa48("1251", "1252", "1253"), !replay)) {
          if (stryMutAct_9fa48("1254")) {
            {}
          } else {
            stryCov_9fa48("1254");
            continue;
          }
        }
        entries.push(stryMutAct_9fa48("1255") ? {} : (stryCov_9fa48("1255"), {
          partitionId: String(stryMutAct_9fa48("1258") ? stats?.partitionId && ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE : stryMutAct_9fa48("1257") ? false : stryMutAct_9fa48("1256") ? true : (stryCov_9fa48("1256", "1257", "1258"), (stryMutAct_9fa48("1259") ? stats.partitionId : (stryCov_9fa48("1259"), stats?.partitionId)) || ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE)),
          bufferedEvents: toNonNegativeInteger(replay.bufferedEvents),
          replayBufferGrowthCount: toNonNegativeInteger(replay.replayBufferGrowthCount),
          replayRetryDepth: toNonNegativeInteger(replay.replayRetryDepth),
          replayInFlight: stryMutAct_9fa48("1262") ? replay.replayInFlight !== true : stryMutAct_9fa48("1261") ? false : stryMutAct_9fa48("1260") ? true : (stryCov_9fa48("1260", "1261", "1262"), replay.replayInFlight === (stryMutAct_9fa48("1263") ? false : (stryCov_9fa48("1263"), true)))
        }));
      }
    }
    if (stryMutAct_9fa48("1266") ? entries.length !== NUM.ZERO : stryMutAct_9fa48("1265") ? false : stryMutAct_9fa48("1264") ? true : (stryCov_9fa48("1264", "1265", "1266"), entries.length === NUM.ZERO)) {
      if (stryMutAct_9fa48("1267")) {
        {}
      } else {
        stryCov_9fa48("1267");
        return null;
      }
    }
    stryMutAct_9fa48("1268") ? entries : (stryCov_9fa48("1268"), entries.sort((left, right) => {
      if (stryMutAct_9fa48("1269")) {
        {}
      } else {
        stryCov_9fa48("1269");
        const leftPressureScore = stryMutAct_9fa48("1270") ? left.bufferedEvents + left.replayBufferGrowthCount - left.replayRetryDepth : (stryCov_9fa48("1270"), (stryMutAct_9fa48("1271") ? left.bufferedEvents - left.replayBufferGrowthCount : (stryCov_9fa48("1271"), left.bufferedEvents + left.replayBufferGrowthCount)) + left.replayRetryDepth);
        const rightPressureScore = stryMutAct_9fa48("1272") ? right.bufferedEvents + right.replayBufferGrowthCount - right.replayRetryDepth : (stryCov_9fa48("1272"), (stryMutAct_9fa48("1273") ? right.bufferedEvents - right.replayBufferGrowthCount : (stryCov_9fa48("1273"), right.bufferedEvents + right.replayBufferGrowthCount)) + right.replayRetryDepth);
        if (stryMutAct_9fa48("1276") ? leftPressureScore === rightPressureScore : stryMutAct_9fa48("1275") ? false : stryMutAct_9fa48("1274") ? true : (stryCov_9fa48("1274", "1275", "1276"), leftPressureScore !== rightPressureScore)) {
          if (stryMutAct_9fa48("1277")) {
            {}
          } else {
            stryCov_9fa48("1277");
            return stryMutAct_9fa48("1278") ? rightPressureScore + leftPressureScore : (stryCov_9fa48("1278"), rightPressureScore - leftPressureScore);
          }
        }
        return left.partitionId.localeCompare(right.partitionId);
      }
    }));
    const byPartitionId = {};
    let bufferedEvents = NUM.ZERO;
    let replayBufferGrowthCount = NUM.ZERO;
    let replayRetryDepth = NUM.ZERO;
    for (const entry of entries) {
      if (stryMutAct_9fa48("1279")) {
        {}
      } else {
        stryCov_9fa48("1279");
        stryMutAct_9fa48("1280") ? bufferedEvents -= entry.bufferedEvents : (stryCov_9fa48("1280"), bufferedEvents += entry.bufferedEvents);
        stryMutAct_9fa48("1281") ? replayBufferGrowthCount -= entry.replayBufferGrowthCount : (stryCov_9fa48("1281"), replayBufferGrowthCount += entry.replayBufferGrowthCount);
        replayRetryDepth = stryMutAct_9fa48("1282") ? Math.min(replayRetryDepth, entry.replayRetryDepth) : (stryCov_9fa48("1282"), Math.max(replayRetryDepth, entry.replayRetryDepth));
      }
    }
    for (const entry of stryMutAct_9fa48("1283") ? entries : (stryCov_9fa48("1283"), entries.slice(NUM.ZERO, CONTROL_PLANE_DIAGNOSTICS_CDC_REPLAY_LIMIT))) {
      if (stryMutAct_9fa48("1284")) {
        {}
      } else {
        stryCov_9fa48("1284");
        byPartitionId[entry.partitionId] = entry;
      }
    }
    return stryMutAct_9fa48("1285") ? {} : (stryCov_9fa48("1285"), {
      bufferedEvents,
      replayBufferGrowthCount,
      replayRetryDepth,
      partitionCount: entries.length,
      replayInFlightPartitionCount: stryMutAct_9fa48("1286") ? entries.length : (stryCov_9fa48("1286"), entries.filter(stryMutAct_9fa48("1287") ? () => undefined : (stryCov_9fa48("1287"), entry => entry.replayInFlight)).length),
      byPartitionId
    });
  }
}
function attachAuthoritativeRepairDiagnostics(snapshot, options = {}) {
  if (stryMutAct_9fa48("1288")) {
    {}
  } else {
    stryCov_9fa48("1288");
    if (stryMutAct_9fa48("1291") ? !snapshot && typeof snapshot !== TYPEOF.OBJECT : stryMutAct_9fa48("1290") ? false : stryMutAct_9fa48("1289") ? true : (stryCov_9fa48("1289", "1290", "1291"), (stryMutAct_9fa48("1292") ? snapshot : (stryCov_9fa48("1292"), !snapshot)) || (stryMutAct_9fa48("1294") ? typeof snapshot === TYPEOF.OBJECT : stryMutAct_9fa48("1293") ? false : (stryCov_9fa48("1293", "1294"), typeof snapshot !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("1295")) {
        {}
      } else {
        stryCov_9fa48("1295");
        return snapshot;
      }
    }
    const activeProjection = stryMutAct_9fa48("1298") ? options.repairEvaluation?.nodeCoverage?.activeProjection && null : stryMutAct_9fa48("1297") ? false : stryMutAct_9fa48("1296") ? true : (stryCov_9fa48("1296", "1297", "1298"), (stryMutAct_9fa48("1300") ? options.repairEvaluation.nodeCoverage?.activeProjection : stryMutAct_9fa48("1299") ? options.repairEvaluation?.nodeCoverage.activeProjection : (stryCov_9fa48("1299", "1300"), options.repairEvaluation?.nodeCoverage?.activeProjection)) || null);
    snapshot.authoritativeRepair = stryMutAct_9fa48("1301") ? {} : (stryCov_9fa48("1301"), {
      applied: stryMutAct_9fa48("1304") ? options.repair?.applied !== true : stryMutAct_9fa48("1303") ? false : stryMutAct_9fa48("1302") ? true : (stryCov_9fa48("1302", "1303", "1304"), (stryMutAct_9fa48("1305") ? options.repair.applied : (stryCov_9fa48("1305"), options.repair?.applied)) === (stryMutAct_9fa48("1306") ? false : (stryCov_9fa48("1306"), true))),
      forced: stryMutAct_9fa48("1309") ? options.forceAuthoritativeRepair !== true : stryMutAct_9fa48("1308") ? false : stryMutAct_9fa48("1307") ? true : (stryCov_9fa48("1307", "1308", "1309"), options.forceAuthoritativeRepair === (stryMutAct_9fa48("1310") ? false : (stryCov_9fa48("1310"), true))),
      triggerCodes: Array.isArray(stryMutAct_9fa48("1311") ? options.repairEvaluation.triggerCodes : (stryCov_9fa48("1311"), options.repairEvaluation?.triggerCodes)) ? stryMutAct_9fa48("1312") ? [] : (stryCov_9fa48("1312"), [...options.repairEvaluation.triggerCodes]) : ADMIN_CACHE_DUMP.EMPTY,
      activeProjectionCoverageGap: stryMutAct_9fa48("1315") ? activeProjection?.hasCoverageGap !== true : stryMutAct_9fa48("1314") ? false : stryMutAct_9fa48("1313") ? true : (stryCov_9fa48("1313", "1314", "1315"), (stryMutAct_9fa48("1316") ? activeProjection.hasCoverageGap : (stryCov_9fa48("1316"), activeProjection?.hasCoverageGap)) === (stryMutAct_9fa48("1317") ? false : (stryCov_9fa48("1317"), true))),
      activeProjectionMissingNodeIds: Array.isArray(stryMutAct_9fa48("1318") ? activeProjection.missingNodeIds : (stryCov_9fa48("1318"), activeProjection?.missingNodeIds)) ? stryMutAct_9fa48("1319") ? [] : (stryCov_9fa48("1319"), [...activeProjection.missingNodeIds]) : ADMIN_CACHE_DUMP.EMPTY
    });
    return snapshot;
  }
}
function resolvePublicationOrderingValue(row, keys = stryMutAct_9fa48("1320") ? ["Stryker was here"] : (stryCov_9fa48("1320"), [])) {
  if (stryMutAct_9fa48("1321")) {
    {}
  } else {
    stryCov_9fa48("1321");
    for (const key of keys) {
      if (stryMutAct_9fa48("1322")) {
        {}
      } else {
        stryCov_9fa48("1322");
        const value = Number(stryMutAct_9fa48("1323") ? row[key] : (stryCov_9fa48("1323"), row?.[key]));
        if (stryMutAct_9fa48("1325") ? false : stryMutAct_9fa48("1324") ? true : (stryCov_9fa48("1324", "1325"), Number.isFinite(value))) {
          if (stryMutAct_9fa48("1326")) {
            {}
          } else {
            stryCov_9fa48("1326");
            return value;
          }
        }
      }
    }
    return NUM.ZERO;
  }
}
function isMembershipPublicationRow(row) {
  if (stryMutAct_9fa48("1327")) {
    {}
  } else {
    stryCov_9fa48("1327");
    const normalizedRow = normalizeControlPlanePublicationRow(row);
    const publicationKind = stryMutAct_9fa48("1328") ? String(normalizedRow.publicationKind || '').toUpperCase() : (stryCov_9fa48("1328"), String(stryMutAct_9fa48("1331") ? normalizedRow.publicationKind && '' : stryMutAct_9fa48("1330") ? false : stryMutAct_9fa48("1329") ? true : (stryCov_9fa48("1329", "1330", "1331"), normalizedRow.publicationKind || (stryMutAct_9fa48("1332") ? "Stryker was here!" : (stryCov_9fa48("1332"), '')))).toLowerCase());
    return stryMutAct_9fa48("1335") ? publicationKind.length === NUM.ZERO && publicationKind === MEMBERSHIP_PUBLICATION_KIND : stryMutAct_9fa48("1334") ? false : stryMutAct_9fa48("1333") ? true : (stryCov_9fa48("1333", "1334", "1335"), (stryMutAct_9fa48("1337") ? publicationKind.length !== NUM.ZERO : stryMutAct_9fa48("1336") ? false : (stryCov_9fa48("1336", "1337"), publicationKind.length === NUM.ZERO)) || (stryMutAct_9fa48("1339") ? publicationKind !== MEMBERSHIP_PUBLICATION_KIND : stryMutAct_9fa48("1338") ? false : (stryCov_9fa48("1338", "1339"), publicationKind === MEMBERSHIP_PUBLICATION_KIND)));
  }
}
function resolveLatestMembershipPublicationRow(publicationRows = stryMutAct_9fa48("1340") ? ["Stryker was here"] : (stryCov_9fa48("1340"), []), options = {}) {
  if (stryMutAct_9fa48("1341")) {
    {}
  } else {
    stryCov_9fa48("1341");
    const expectedStatus = (stryMutAct_9fa48("1344") ? typeof options.status !== TYPEOF.STRING : stryMutAct_9fa48("1343") ? false : stryMutAct_9fa48("1342") ? true : (stryCov_9fa48("1342", "1343", "1344"), typeof options.status === TYPEOF.STRING)) ? stryMutAct_9fa48("1345") ? options.status.toLowerCase() : (stryCov_9fa48("1345"), options.status.toUpperCase()) : null;
    const normalizedRows = stryMutAct_9fa48("1348") ? (Array.isArray(publicationRows) ? publicationRows : []).filter(row => isMembershipPublicationRow(row)).map(row => normalizeControlPlanePublicationRow(row)).filter(row => {
      if (expectedStatus && row.status !== expectedStatus) {
        return false;
      }
      return Boolean(row.publicationId || row.publicationEpoch || row.status || Array.isArray(row.publishedActiveNodeIds) && row.publishedActiveNodeIds.length > NUM.ZERO);
    }) : stryMutAct_9fa48("1347") ? (Array.isArray(publicationRows) ? publicationRows : []).filter(row => row && typeof row === TYPEOF.OBJECT).map(row => normalizeControlPlanePublicationRow(row)).filter(row => {
      if (expectedStatus && row.status !== expectedStatus) {
        return false;
      }
      return Boolean(row.publicationId || row.publicationEpoch || row.status || Array.isArray(row.publishedActiveNodeIds) && row.publishedActiveNodeIds.length > NUM.ZERO);
    }) : stryMutAct_9fa48("1346") ? (Array.isArray(publicationRows) ? publicationRows : []).filter(row => row && typeof row === TYPEOF.OBJECT).filter(row => isMembershipPublicationRow(row)).map(row => normalizeControlPlanePublicationRow(row)) : (stryCov_9fa48("1346", "1347", "1348"), (Array.isArray(publicationRows) ? publicationRows : stryMutAct_9fa48("1349") ? ["Stryker was here"] : (stryCov_9fa48("1349"), [])).filter(stryMutAct_9fa48("1350") ? () => undefined : (stryCov_9fa48("1350"), row => stryMutAct_9fa48("1353") ? row || typeof row === TYPEOF.OBJECT : stryMutAct_9fa48("1352") ? false : stryMutAct_9fa48("1351") ? true : (stryCov_9fa48("1351", "1352", "1353"), row && (stryMutAct_9fa48("1355") ? typeof row !== TYPEOF.OBJECT : stryMutAct_9fa48("1354") ? true : (stryCov_9fa48("1354", "1355"), typeof row === TYPEOF.OBJECT))))).filter(stryMutAct_9fa48("1356") ? () => undefined : (stryCov_9fa48("1356"), row => isMembershipPublicationRow(row))).map(stryMutAct_9fa48("1357") ? () => undefined : (stryCov_9fa48("1357"), row => normalizeControlPlanePublicationRow(row))).filter(row => {
      if (stryMutAct_9fa48("1358")) {
        {}
      } else {
        stryCov_9fa48("1358");
        if (stryMutAct_9fa48("1361") ? expectedStatus || row.status !== expectedStatus : stryMutAct_9fa48("1360") ? false : stryMutAct_9fa48("1359") ? true : (stryCov_9fa48("1359", "1360", "1361"), expectedStatus && (stryMutAct_9fa48("1363") ? row.status === expectedStatus : stryMutAct_9fa48("1362") ? true : (stryCov_9fa48("1362", "1363"), row.status !== expectedStatus)))) {
          if (stryMutAct_9fa48("1364")) {
            {}
          } else {
            stryCov_9fa48("1364");
            return stryMutAct_9fa48("1365") ? true : (stryCov_9fa48("1365"), false);
          }
        }
        return Boolean(stryMutAct_9fa48("1368") ? (row.publicationId || row.publicationEpoch || row.status) && Array.isArray(row.publishedActiveNodeIds) && row.publishedActiveNodeIds.length > NUM.ZERO : stryMutAct_9fa48("1367") ? false : stryMutAct_9fa48("1366") ? true : (stryCov_9fa48("1366", "1367", "1368"), (stryMutAct_9fa48("1370") ? (row.publicationId || row.publicationEpoch) && row.status : stryMutAct_9fa48("1369") ? false : (stryCov_9fa48("1369", "1370"), (stryMutAct_9fa48("1372") ? row.publicationId && row.publicationEpoch : stryMutAct_9fa48("1371") ? false : (stryCov_9fa48("1371", "1372"), row.publicationId || row.publicationEpoch)) || row.status)) || (stryMutAct_9fa48("1374") ? Array.isArray(row.publishedActiveNodeIds) || row.publishedActiveNodeIds.length > NUM.ZERO : stryMutAct_9fa48("1373") ? false : (stryCov_9fa48("1373", "1374"), Array.isArray(row.publishedActiveNodeIds) && (stryMutAct_9fa48("1377") ? row.publishedActiveNodeIds.length <= NUM.ZERO : stryMutAct_9fa48("1376") ? row.publishedActiveNodeIds.length >= NUM.ZERO : stryMutAct_9fa48("1375") ? true : (stryCov_9fa48("1375", "1376", "1377"), row.publishedActiveNodeIds.length > NUM.ZERO))))));
      }
    }));
    if (stryMutAct_9fa48("1380") ? normalizedRows.length !== NUM.ZERO : stryMutAct_9fa48("1379") ? false : stryMutAct_9fa48("1378") ? true : (stryCov_9fa48("1378", "1379", "1380"), normalizedRows.length === NUM.ZERO)) {
      if (stryMutAct_9fa48("1381")) {
        {}
      } else {
        stryCov_9fa48("1381");
        return null;
      }
    }
    stryMutAct_9fa48("1382") ? normalizedRows : (stryCov_9fa48("1382"), normalizedRows.sort((left, right) => {
      if (stryMutAct_9fa48("1383")) {
        {}
      } else {
        stryCov_9fa48("1383");
        const publicationEpochDelta = stryMutAct_9fa48("1384") ? resolvePublicationOrderingValue(right, ['publicationEpoch', 'publication_epoch']) + resolvePublicationOrderingValue(left, ['publicationEpoch', 'publication_epoch']) : (stryCov_9fa48("1384"), resolvePublicationOrderingValue(right, stryMutAct_9fa48("1385") ? [] : (stryCov_9fa48("1385"), [stryMutAct_9fa48("1386") ? "" : (stryCov_9fa48("1386"), 'publicationEpoch'), stryMutAct_9fa48("1387") ? "" : (stryCov_9fa48("1387"), 'publication_epoch')])) - resolvePublicationOrderingValue(left, stryMutAct_9fa48("1388") ? [] : (stryCov_9fa48("1388"), [stryMutAct_9fa48("1389") ? "" : (stryCov_9fa48("1389"), 'publicationEpoch'), stryMutAct_9fa48("1390") ? "" : (stryCov_9fa48("1390"), 'publication_epoch')])));
        if (stryMutAct_9fa48("1393") ? publicationEpochDelta === NUM.ZERO : stryMutAct_9fa48("1392") ? false : stryMutAct_9fa48("1391") ? true : (stryCov_9fa48("1391", "1392", "1393"), publicationEpochDelta !== NUM.ZERO)) {
          if (stryMutAct_9fa48("1394")) {
            {}
          } else {
            stryCov_9fa48("1394");
            return publicationEpochDelta;
          }
        }
        const publishedAtDelta = stryMutAct_9fa48("1395") ? resolvePublicationOrderingValue(right, ['publishedAt', 'published_at']) + resolvePublicationOrderingValue(left, ['publishedAt', 'published_at']) : (stryCov_9fa48("1395"), resolvePublicationOrderingValue(right, stryMutAct_9fa48("1396") ? [] : (stryCov_9fa48("1396"), [stryMutAct_9fa48("1397") ? "" : (stryCov_9fa48("1397"), 'publishedAt'), stryMutAct_9fa48("1398") ? "" : (stryCov_9fa48("1398"), 'published_at')])) - resolvePublicationOrderingValue(left, stryMutAct_9fa48("1399") ? [] : (stryCov_9fa48("1399"), [stryMutAct_9fa48("1400") ? "" : (stryCov_9fa48("1400"), 'publishedAt'), stryMutAct_9fa48("1401") ? "" : (stryCov_9fa48("1401"), 'published_at')])));
        if (stryMutAct_9fa48("1404") ? publishedAtDelta === NUM.ZERO : stryMutAct_9fa48("1403") ? false : stryMutAct_9fa48("1402") ? true : (stryCov_9fa48("1402", "1403", "1404"), publishedAtDelta !== NUM.ZERO)) {
          if (stryMutAct_9fa48("1405")) {
            {}
          } else {
            stryCov_9fa48("1405");
            return publishedAtDelta;
          }
        }
        return stryMutAct_9fa48("1406") ? resolvePublicationOrderingValue(right, [ADMIN_CONTROL_SNAPSHOT_LITERAL.UPDATEDAT, ADMIN_CONTROL_SNAPSHOT_LITERAL.UPDATED_AT]) + resolvePublicationOrderingValue(left, [ADMIN_CONTROL_SNAPSHOT_LITERAL.UPDATEDAT, ADMIN_CONTROL_SNAPSHOT_LITERAL.UPDATED_AT]) : (stryCov_9fa48("1406"), resolvePublicationOrderingValue(right, stryMutAct_9fa48("1407") ? [] : (stryCov_9fa48("1407"), [ADMIN_CONTROL_SNAPSHOT_LITERAL.UPDATEDAT, ADMIN_CONTROL_SNAPSHOT_LITERAL.UPDATED_AT])) - resolvePublicationOrderingValue(left, stryMutAct_9fa48("1408") ? [] : (stryCov_9fa48("1408"), [ADMIN_CONTROL_SNAPSHOT_LITERAL.UPDATEDAT, ADMIN_CONTROL_SNAPSHOT_LITERAL.UPDATED_AT])));
      }
    }));
    return stryMutAct_9fa48("1411") ? normalizedRows[NUM.ZERO] && null : stryMutAct_9fa48("1410") ? false : stryMutAct_9fa48("1409") ? true : (stryCov_9fa48("1409", "1410", "1411"), normalizedRows[NUM.ZERO] || null);
  }
}
function normalizePriorityRecoveryInteger(value) {
  if (stryMutAct_9fa48("1412")) {
    {}
  } else {
    stryCov_9fa48("1412");
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? Math.floor(parsedValue) : null;
  }
}
function normalizePriorityRecoveryStringList(values = stryMutAct_9fa48("1413") ? ["Stryker was here"] : (stryCov_9fa48("1413"), [])) {
  if (stryMutAct_9fa48("1414")) {
    {}
  } else {
    stryCov_9fa48("1414");
    return uniqueSorted(stryMutAct_9fa48("1415") ? (Array.isArray(values) ? values : []).map(value => String(value || ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE).trim()) : (stryCov_9fa48("1415"), (Array.isArray(values) ? values : stryMutAct_9fa48("1416") ? ["Stryker was here"] : (stryCov_9fa48("1416"), [])).map(stryMutAct_9fa48("1417") ? () => undefined : (stryCov_9fa48("1417"), value => stryMutAct_9fa48("1418") ? String(value || ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE) : (stryCov_9fa48("1418"), String(stryMutAct_9fa48("1421") ? value && ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE : stryMutAct_9fa48("1420") ? false : stryMutAct_9fa48("1419") ? true : (stryCov_9fa48("1419", "1420", "1421"), value || ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE)).trim()))).filter(stryMutAct_9fa48("1422") ? () => undefined : (stryCov_9fa48("1422"), value => stryMutAct_9fa48("1426") ? value.length <= NUM.ZERO : stryMutAct_9fa48("1425") ? value.length >= NUM.ZERO : stryMutAct_9fa48("1424") ? false : stryMutAct_9fa48("1423") ? true : (stryCov_9fa48("1423", "1424", "1425", "1426"), value.length > NUM.ZERO)))));
  }
}
function inferPriorityRecoveryTableNameFromPartitionId(partitionId) {
  if (stryMutAct_9fa48("1427")) {
    {}
  } else {
    stryCov_9fa48("1427");
    const normalizedPartitionId = String(stryMutAct_9fa48("1430") ? partitionId && '' : stryMutAct_9fa48("1429") ? false : stryMutAct_9fa48("1428") ? true : (stryCov_9fa48("1428", "1429", "1430"), partitionId || (stryMutAct_9fa48("1431") ? "Stryker was here!" : (stryCov_9fa48("1431"), ''))));
    if (stryMutAct_9fa48("1434") ? normalizedPartitionId.length !== NUM.ZERO : stryMutAct_9fa48("1433") ? false : stryMutAct_9fa48("1432") ? true : (stryCov_9fa48("1432", "1433", "1434"), normalizedPartitionId.length === NUM.ZERO)) {
      if (stryMutAct_9fa48("1435")) {
        {}
      } else {
        stryCov_9fa48("1435");
        return null;
      }
    }
    const partitionSuffixIndex = normalizedPartitionId.lastIndexOf(stryMutAct_9fa48("1436") ? "" : (stryCov_9fa48("1436"), '-p'));
    if (stryMutAct_9fa48("1440") ? partitionSuffixIndex > NUM.ZERO : stryMutAct_9fa48("1439") ? partitionSuffixIndex < NUM.ZERO : stryMutAct_9fa48("1438") ? false : stryMutAct_9fa48("1437") ? true : (stryCov_9fa48("1437", "1438", "1439", "1440"), partitionSuffixIndex <= NUM.ZERO)) {
      if (stryMutAct_9fa48("1441")) {
        {}
      } else {
        stryCov_9fa48("1441");
        return normalizedPartitionId;
      }
    }
    const suffix = stryMutAct_9fa48("1442") ? normalizedPartitionId : (stryCov_9fa48("1442"), normalizedPartitionId.slice(stryMutAct_9fa48("1443") ? partitionSuffixIndex - 2 : (stryCov_9fa48("1443"), partitionSuffixIndex + 2)));
    if (stryMutAct_9fa48("1446") ? false : stryMutAct_9fa48("1445") ? true : stryMutAct_9fa48("1444") ? /^\d+$/.test(suffix) : (stryCov_9fa48("1444", "1445", "1446"), !(stryMutAct_9fa48("1450") ? /^\D+$/ : stryMutAct_9fa48("1449") ? /^\d$/ : stryMutAct_9fa48("1448") ? /^\d+/ : stryMutAct_9fa48("1447") ? /\d+$/ : (stryCov_9fa48("1447", "1448", "1449", "1450"), /^\d+$/)).test(suffix))) {
      if (stryMutAct_9fa48("1451")) {
        {}
      } else {
        stryCov_9fa48("1451");
        return normalizedPartitionId;
      }
    }
    return stryMutAct_9fa48("1452") ? normalizedPartitionId : (stryCov_9fa48("1452"), normalizedPartitionId.slice(NUM.ZERO, partitionSuffixIndex));
  }
}
function buildPriorityRecoveryCorrelationKey(partitionId, epoch, operationId) {
  if (stryMutAct_9fa48("1453")) {
    {}
  } else {
    stryCov_9fa48("1453");
    const normalizedPartitionId = stryMutAct_9fa48("1454") ? String(partitionId || '') : (stryCov_9fa48("1454"), String(stryMutAct_9fa48("1457") ? partitionId && '' : stryMutAct_9fa48("1456") ? false : stryMutAct_9fa48("1455") ? true : (stryCov_9fa48("1455", "1456", "1457"), partitionId || (stryMutAct_9fa48("1458") ? "Stryker was here!" : (stryCov_9fa48("1458"), '')))).trim());
    if (stryMutAct_9fa48("1461") ? normalizedPartitionId.length !== NUM.ZERO : stryMutAct_9fa48("1460") ? false : stryMutAct_9fa48("1459") ? true : (stryCov_9fa48("1459", "1460", "1461"), normalizedPartitionId.length === NUM.ZERO)) {
      if (stryMutAct_9fa48("1462")) {
        {}
      } else {
        stryCov_9fa48("1462");
        return null;
      }
    }
    const normalizedEpoch = Number.isInteger(epoch) ? String(epoch) : PRIORITY_RECOVERY_CORRELATION_KEY.EPOCH_UNKNOWN;
    const normalizedOperationId = (stryMutAct_9fa48("1465") ? typeof operationId === TYPEOF.STRING || operationId.length > NUM.ZERO : stryMutAct_9fa48("1464") ? false : stryMutAct_9fa48("1463") ? true : (stryCov_9fa48("1463", "1464", "1465"), (stryMutAct_9fa48("1467") ? typeof operationId !== TYPEOF.STRING : stryMutAct_9fa48("1466") ? true : (stryCov_9fa48("1466", "1467"), typeof operationId === TYPEOF.STRING)) && (stryMutAct_9fa48("1470") ? operationId.length <= NUM.ZERO : stryMutAct_9fa48("1469") ? operationId.length >= NUM.ZERO : stryMutAct_9fa48("1468") ? true : (stryCov_9fa48("1468", "1469", "1470"), operationId.length > NUM.ZERO)))) ? operationId : PRIORITY_RECOVERY_CORRELATION_KEY.OPERATION_UNKNOWN;
    return (stryMutAct_9fa48("1471") ? [] : (stryCov_9fa48("1471"), [normalizedPartitionId, normalizedEpoch, normalizedOperationId])).join(PRIORITY_RECOVERY_CORRELATION_KEY.SEPARATOR);
  }
}
function buildPriorityRecoverySemanticPartitionSetMap() {
  if (stryMutAct_9fa48("1472")) {
    {}
  } else {
    stryCov_9fa48("1472");
    const partitionSetsBySemanticState = {};
    for (const semanticState of PRIORITY_RECOVERY_SEMANTIC_STATE_IDS) {
      if (stryMutAct_9fa48("1473")) {
        {}
      } else {
        stryCov_9fa48("1473");
        partitionSetsBySemanticState[semanticState] = new Set();
      }
    }
    return partitionSetsBySemanticState;
  }
}
function resolvePriorityRecoverySemanticState(options = {}) {
  if (stryMutAct_9fa48("1474")) {
    {}
  } else {
    stryCov_9fa48("1474");
    const blockerReasons = normalizePriorityRecoveryStringList(options.blockerReasons);
    for (const blockerReason of PRIORITY_RECOVERY_BLOCKER_REASON_PRECEDENCE) {
      if (stryMutAct_9fa48("1475")) {
        {}
      } else {
        stryCov_9fa48("1475");
        if (stryMutAct_9fa48("1478") ? false : stryMutAct_9fa48("1477") ? true : stryMutAct_9fa48("1476") ? blockerReasons.includes(blockerReason) : (stryCov_9fa48("1476", "1477", "1478"), !blockerReasons.includes(blockerReason))) {
          if (stryMutAct_9fa48("1479")) {
            {}
          } else {
            stryCov_9fa48("1479");
            continue;
          }
        }
        return stryMutAct_9fa48("1482") ? PRIORITY_RECOVERY_BLOCKER_TO_SEMANTIC_STATE[blockerReason] && PRIORITY_RECOVERY_SEMANTIC_STATE.BLOCKED_UNCLASSIFIED : stryMutAct_9fa48("1481") ? false : stryMutAct_9fa48("1480") ? true : (stryCov_9fa48("1480", "1481", "1482"), PRIORITY_RECOVERY_BLOCKER_TO_SEMANTIC_STATE[blockerReason] || PRIORITY_RECOVERY_SEMANTIC_STATE.BLOCKED_UNCLASSIFIED);
      }
    }
    if (stryMutAct_9fa48("1485") ? options.plannerReady !== true : stryMutAct_9fa48("1484") ? false : stryMutAct_9fa48("1483") ? true : (stryCov_9fa48("1483", "1484", "1485"), options.plannerReady === (stryMutAct_9fa48("1486") ? false : (stryCov_9fa48("1486"), true)))) {
      if (stryMutAct_9fa48("1487")) {
        {}
      } else {
        stryCov_9fa48("1487");
        return PRIORITY_RECOVERY_SEMANTIC_STATE.CONVERGED;
      }
    }
    if (stryMutAct_9fa48("1490") ? options.hasActiveOperationContexts !== true : stryMutAct_9fa48("1489") ? false : stryMutAct_9fa48("1488") ? true : (stryCov_9fa48("1488", "1489", "1490"), options.hasActiveOperationContexts === (stryMutAct_9fa48("1491") ? false : (stryCov_9fa48("1491"), true)))) {
      if (stryMutAct_9fa48("1492")) {
        {}
      } else {
        stryCov_9fa48("1492");
        return PRIORITY_RECOVERY_SEMANTIC_STATE.RECOVERING_IN_FLIGHT;
      }
    }
    return PRIORITY_RECOVERY_SEMANTIC_STATE.BLOCKED_UNCLASSIFIED;
  }
}
function resolvePriorityRecoveryReasonCodesFromReadiness(readinessEntry) {
  if (stryMutAct_9fa48("1493")) {
    {}
  } else {
    stryCov_9fa48("1493");
    const reasons = Array.isArray(stryMutAct_9fa48("1494") ? readinessEntry.reasons : (stryCov_9fa48("1494"), readinessEntry?.reasons)) ? readinessEntry.reasons : stryMutAct_9fa48("1495") ? ["Stryker was here"] : (stryCov_9fa48("1495"), []);
    return normalizePriorityRecoveryStringList(reasons.map(stryMutAct_9fa48("1496") ? () => undefined : (stryCov_9fa48("1496"), reason => stryMutAct_9fa48("1497") ? String(reason?.code || ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE) : (stryCov_9fa48("1497"), String(stryMutAct_9fa48("1500") ? reason?.code && ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE : stryMutAct_9fa48("1499") ? false : stryMutAct_9fa48("1498") ? true : (stryCov_9fa48("1498", "1499", "1500"), (stryMutAct_9fa48("1501") ? reason.code : (stryCov_9fa48("1501"), reason?.code)) || ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE)).trim()))));
  }
}
function buildPriorityRecoveryPlannerByPartitionId(priorityPartitionSummary) {
  if (stryMutAct_9fa48("1502")) {
    {}
  } else {
    stryCov_9fa48("1502");
    const normalizedSummary = (stryMutAct_9fa48("1505") ? priorityPartitionSummary || typeof priorityPartitionSummary === TYPEOF.OBJECT : stryMutAct_9fa48("1504") ? false : stryMutAct_9fa48("1503") ? true : (stryCov_9fa48("1503", "1504", "1505"), priorityPartitionSummary && (stryMutAct_9fa48("1507") ? typeof priorityPartitionSummary !== TYPEOF.OBJECT : stryMutAct_9fa48("1506") ? true : (stryCov_9fa48("1506", "1507"), typeof priorityPartitionSummary === TYPEOF.OBJECT)))) ? priorityPartitionSummary : null;
    const blockedPartitions = Array.isArray(stryMutAct_9fa48("1508") ? normalizedSummary.blockedPartitions : (stryCov_9fa48("1508"), normalizedSummary?.blockedPartitions)) ? normalizedSummary.blockedPartitions : stryMutAct_9fa48("1509") ? ["Stryker was here"] : (stryCov_9fa48("1509"), []);
    const missingPartitionIds = normalizePriorityRecoveryStringList(stryMutAct_9fa48("1510") ? normalizedSummary.missingPartitionIds : (stryCov_9fa48("1510"), normalizedSummary?.missingPartitionIds));
    const plannerByPartitionId = {};
    for (const partition of blockedPartitions) {
      if (stryMutAct_9fa48("1511")) {
        {}
      } else {
        stryCov_9fa48("1511");
        const partitionId = stryMutAct_9fa48("1512") ? String(partition?.partitionId || '') : (stryCov_9fa48("1512"), String(stryMutAct_9fa48("1515") ? partition?.partitionId && '' : stryMutAct_9fa48("1514") ? false : stryMutAct_9fa48("1513") ? true : (stryCov_9fa48("1513", "1514", "1515"), (stryMutAct_9fa48("1516") ? partition.partitionId : (stryCov_9fa48("1516"), partition?.partitionId)) || (stryMutAct_9fa48("1517") ? "Stryker was here!" : (stryCov_9fa48("1517"), '')))).trim());
        if (stryMutAct_9fa48("1520") ? partitionId.length !== NUM.ZERO : stryMutAct_9fa48("1519") ? false : stryMutAct_9fa48("1518") ? true : (stryCov_9fa48("1518", "1519", "1520"), partitionId.length === NUM.ZERO)) {
          if (stryMutAct_9fa48("1521")) {
            {}
          } else {
            stryCov_9fa48("1521");
            continue;
          }
        }
        const spreadGap = stryMutAct_9fa48("1522") ? Math.min(NUM.ZERO, normalizePriorityRecoveryInteger(partition?.spreadGap) || NUM.ZERO) : (stryCov_9fa48("1522"), Math.max(NUM.ZERO, stryMutAct_9fa48("1525") ? normalizePriorityRecoveryInteger(partition?.spreadGap) && NUM.ZERO : stryMutAct_9fa48("1524") ? false : stryMutAct_9fa48("1523") ? true : (stryCov_9fa48("1523", "1524", "1525"), normalizePriorityRecoveryInteger(stryMutAct_9fa48("1526") ? partition.spreadGap : (stryCov_9fa48("1526"), partition?.spreadGap)) || NUM.ZERO)));
        plannerByPartitionId[partitionId] = stryMutAct_9fa48("1527") ? {} : (stryCov_9fa48("1527"), {
          partitionId,
          requiredDistinctNodeCount: normalizePriorityRecoveryInteger(stryMutAct_9fa48("1528") ? partition.requiredDistinctNodeCount : (stryCov_9fa48("1528"), partition?.requiredDistinctNodeCount)),
          readyDistinctNodeCount: normalizePriorityRecoveryInteger(stryMutAct_9fa48("1529") ? partition.readyDistinctNodeCount : (stryCov_9fa48("1529"), partition?.readyDistinctNodeCount)),
          spreadGap,
          ready: stryMutAct_9fa48("1532") ? spreadGap !== NUM.ZERO : stryMutAct_9fa48("1531") ? false : stryMutAct_9fa48("1530") ? true : (stryCov_9fa48("1530", "1531", "1532"), spreadGap === NUM.ZERO),
          reasons: (stryMutAct_9fa48("1536") ? spreadGap <= NUM.ZERO : stryMutAct_9fa48("1535") ? spreadGap >= NUM.ZERO : stryMutAct_9fa48("1534") ? false : stryMutAct_9fa48("1533") ? true : (stryCov_9fa48("1533", "1534", "1535", "1536"), spreadGap > NUM.ZERO)) ? stryMutAct_9fa48("1537") ? [] : (stryCov_9fa48("1537"), [PRIORITY_RECOVERY_PLANNER_REASON_PRIORITY_SPREAD_GAP]) : stryMutAct_9fa48("1538") ? ["Stryker was here"] : (stryCov_9fa48("1538"), [])
        });
      }
    }
    for (const partitionId of missingPartitionIds) {
      if (stryMutAct_9fa48("1539")) {
        {}
      } else {
        stryCov_9fa48("1539");
        if (stryMutAct_9fa48("1541") ? false : stryMutAct_9fa48("1540") ? true : (stryCov_9fa48("1540", "1541"), plannerByPartitionId[partitionId])) {
          if (stryMutAct_9fa48("1542")) {
            {}
          } else {
            stryCov_9fa48("1542");
            if (stryMutAct_9fa48("1545") ? false : stryMutAct_9fa48("1544") ? true : stryMutAct_9fa48("1543") ? plannerByPartitionId[partitionId].reasons.includes(PRIORITY_RECOVERY_PLANNER_REASON_PRIORITY_PARTITION_MISSING) : (stryCov_9fa48("1543", "1544", "1545"), !plannerByPartitionId[partitionId].reasons.includes(PRIORITY_RECOVERY_PLANNER_REASON_PRIORITY_PARTITION_MISSING))) {
              if (stryMutAct_9fa48("1546")) {
                {}
              } else {
                stryCov_9fa48("1546");
                plannerByPartitionId[partitionId].reasons.push(PRIORITY_RECOVERY_PLANNER_REASON_PRIORITY_PARTITION_MISSING);
              }
            }
            continue;
          }
        }
        plannerByPartitionId[partitionId] = stryMutAct_9fa48("1547") ? {} : (stryCov_9fa48("1547"), {
          partitionId,
          requiredDistinctNodeCount: normalizePriorityRecoveryInteger(stryMutAct_9fa48("1548") ? normalizedSummary.requiredDistinctNodeCount : (stryCov_9fa48("1548"), normalizedSummary?.requiredDistinctNodeCount)),
          readyDistinctNodeCount: NUM.ZERO,
          spreadGap: stryMutAct_9fa48("1551") ? normalizePriorityRecoveryInteger(normalizedSummary?.requiredDistinctNodeCount) && NUM.ONE : stryMutAct_9fa48("1550") ? false : stryMutAct_9fa48("1549") ? true : (stryCov_9fa48("1549", "1550", "1551"), normalizePriorityRecoveryInteger(stryMutAct_9fa48("1552") ? normalizedSummary.requiredDistinctNodeCount : (stryCov_9fa48("1552"), normalizedSummary?.requiredDistinctNodeCount)) || NUM.ONE),
          ready: stryMutAct_9fa48("1553") ? true : (stryCov_9fa48("1553"), false),
          reasons: stryMutAct_9fa48("1554") ? [] : (stryCov_9fa48("1554"), [PRIORITY_RECOVERY_PLANNER_REASON_PRIORITY_PARTITION_MISSING])
        });
      }
    }
    return plannerByPartitionId;
  }
}
function buildPriorityRecoveryReplicaOperationContexts(replicaOperationRows = stryMutAct_9fa48("1555") ? ["Stryker was here"] : (stryCov_9fa48("1555"), []), replicaOperationsSummary = null) {
  if (stryMutAct_9fa48("1556")) {
    {}
  } else {
    stryCov_9fa48("1556");
    const operationTimelineById = (stryMutAct_9fa48("1559") ? replicaOperationsSummary?.operationTimelineById || typeof replicaOperationsSummary.operationTimelineById === TYPEOF.OBJECT : stryMutAct_9fa48("1558") ? false : stryMutAct_9fa48("1557") ? true : (stryCov_9fa48("1557", "1558", "1559"), (stryMutAct_9fa48("1560") ? replicaOperationsSummary.operationTimelineById : (stryCov_9fa48("1560"), replicaOperationsSummary?.operationTimelineById)) && (stryMutAct_9fa48("1562") ? typeof replicaOperationsSummary.operationTimelineById !== TYPEOF.OBJECT : stryMutAct_9fa48("1561") ? true : (stryCov_9fa48("1561", "1562"), typeof replicaOperationsSummary.operationTimelineById === TYPEOF.OBJECT)))) ? replicaOperationsSummary.operationTimelineById : {};
    const byOperationId = {};
    const byPartitionId = {};
    for (const replicaOperationRow of Array.isArray(replicaOperationRows) ? replicaOperationRows : stryMutAct_9fa48("1563") ? ["Stryker was here"] : (stryCov_9fa48("1563"), [])) {
      if (stryMutAct_9fa48("1564")) {
        {}
      } else {
        stryCov_9fa48("1564");
        const operationId = firstStringField(replicaOperationRow, PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_OPERATION_ID, stryMutAct_9fa48("1565") ? "" : (stryCov_9fa48("1565"), 'operationId'));
        if (stryMutAct_9fa48("1568") ? false : stryMutAct_9fa48("1567") ? true : stryMutAct_9fa48("1566") ? operationId : (stryCov_9fa48("1566", "1567", "1568"), !operationId)) {
          if (stryMutAct_9fa48("1569")) {
            {}
          } else {
            stryCov_9fa48("1569");
            continue;
          }
        }
        const entityType = stryMutAct_9fa48("1570") ? String(firstStringField(replicaOperationRow, PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_ENTITY_TYPE, 'entityType', 'service_type', 'serviceType') || PRIORITY_RECOVERY_REPLICA_OPERATION_ENTITY_TYPE_PARTITION).toUpperCase() : (stryCov_9fa48("1570"), String(stryMutAct_9fa48("1573") ? firstStringField(replicaOperationRow, PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_ENTITY_TYPE, 'entityType', 'service_type', 'serviceType') && PRIORITY_RECOVERY_REPLICA_OPERATION_ENTITY_TYPE_PARTITION : stryMutAct_9fa48("1572") ? false : stryMutAct_9fa48("1571") ? true : (stryCov_9fa48("1571", "1572", "1573"), firstStringField(replicaOperationRow, PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_ENTITY_TYPE, stryMutAct_9fa48("1574") ? "" : (stryCov_9fa48("1574"), 'entityType'), stryMutAct_9fa48("1575") ? "" : (stryCov_9fa48("1575"), 'service_type'), stryMutAct_9fa48("1576") ? "" : (stryCov_9fa48("1576"), 'serviceType')) || PRIORITY_RECOVERY_REPLICA_OPERATION_ENTITY_TYPE_PARTITION)).toLowerCase());
        if (stryMutAct_9fa48("1579") ? entityType === PRIORITY_RECOVERY_REPLICA_OPERATION_ENTITY_TYPE_PARTITION : stryMutAct_9fa48("1578") ? false : stryMutAct_9fa48("1577") ? true : (stryCov_9fa48("1577", "1578", "1579"), entityType !== PRIORITY_RECOVERY_REPLICA_OPERATION_ENTITY_TYPE_PARTITION)) {
          if (stryMutAct_9fa48("1580")) {
            {}
          } else {
            stryCov_9fa48("1580");
            continue;
          }
        }
        const partitionId = firstStringField(replicaOperationRow, PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_PARTITION_ID, stryMutAct_9fa48("1581") ? "" : (stryCov_9fa48("1581"), 'partitionId'), PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_ENTITY_ID, stryMutAct_9fa48("1582") ? "" : (stryCov_9fa48("1582"), 'entityId'));
        if (stryMutAct_9fa48("1585") ? false : stryMutAct_9fa48("1584") ? true : stryMutAct_9fa48("1583") ? partitionId : (stryCov_9fa48("1583", "1584", "1585"), !partitionId)) {
          if (stryMutAct_9fa48("1586")) {
            {}
          } else {
            stryCov_9fa48("1586");
            continue;
          }
        }
        const timeline = Array.isArray(operationTimelineById[operationId]) ? operationTimelineById[operationId] : stryMutAct_9fa48("1587") ? ["Stryker was here"] : (stryCov_9fa48("1587"), []);
        const timelineSteps = normalizePriorityRecoveryStringList(timeline.map(stryMutAct_9fa48("1588") ? () => undefined : (stryCov_9fa48("1588"), entry => stryMutAct_9fa48("1589") ? String(entry?.step || '') : (stryCov_9fa48("1589"), String(stryMutAct_9fa48("1592") ? entry?.step && '' : stryMutAct_9fa48("1591") ? false : stryMutAct_9fa48("1590") ? true : (stryCov_9fa48("1590", "1591", "1592"), (stryMutAct_9fa48("1593") ? entry.step : (stryCov_9fa48("1593"), entry?.step)) || (stryMutAct_9fa48("1594") ? "Stryker was here!" : (stryCov_9fa48("1594"), '')))).trim()))));
        const latestTimelineEntry = (stryMutAct_9fa48("1598") ? timeline.length <= NUM.ZERO : stryMutAct_9fa48("1597") ? timeline.length >= NUM.ZERO : stryMutAct_9fa48("1596") ? false : stryMutAct_9fa48("1595") ? true : (stryCov_9fa48("1595", "1596", "1597", "1598"), timeline.length > NUM.ZERO)) ? timeline[stryMutAct_9fa48("1599") ? timeline.length + 1 : (stryCov_9fa48("1599"), timeline.length - 1)] : null;
        const context = stryMutAct_9fa48("1600") ? {} : (stryCov_9fa48("1600"), {
          operationId,
          partitionId,
          tableName: inferPriorityRecoveryTableNameFromPartitionId(partitionId),
          type: stryMutAct_9fa48("1601") ? String(firstStringField(replicaOperationRow, 'type', 'operation_type', 'operationType') || '').toLowerCase() : (stryCov_9fa48("1601"), String(stryMutAct_9fa48("1604") ? firstStringField(replicaOperationRow, 'type', 'operation_type', 'operationType') && '' : stryMutAct_9fa48("1603") ? false : stryMutAct_9fa48("1602") ? true : (stryCov_9fa48("1602", "1603", "1604"), firstStringField(replicaOperationRow, stryMutAct_9fa48("1605") ? "" : (stryCov_9fa48("1605"), 'type'), stryMutAct_9fa48("1606") ? "" : (stryCov_9fa48("1606"), 'operation_type'), stryMutAct_9fa48("1607") ? "" : (stryCov_9fa48("1607"), 'operationType')) || (stryMutAct_9fa48("1608") ? "Stryker was here!" : (stryCov_9fa48("1608"), '')))).toUpperCase()),
          status: stryMutAct_9fa48("1609") ? String(firstStringField(replicaOperationRow, PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_STATUS, 'status') || '').toUpperCase() : (stryCov_9fa48("1609"), String(stryMutAct_9fa48("1612") ? firstStringField(replicaOperationRow, PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_STATUS, 'status') && '' : stryMutAct_9fa48("1611") ? false : stryMutAct_9fa48("1610") ? true : (stryCov_9fa48("1610", "1611", "1612"), firstStringField(replicaOperationRow, PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_STATUS, stryMutAct_9fa48("1613") ? "" : (stryCov_9fa48("1613"), 'status')) || (stryMutAct_9fa48("1614") ? "Stryker was here!" : (stryCov_9fa48("1614"), '')))).toLowerCase()),
          workflowStep: stryMutAct_9fa48("1615") ? String(firstStringField(replicaOperationRow, PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_WORKFLOW_STEP, 'workflowStep') || '').toLowerCase() : (stryCov_9fa48("1615"), String(stryMutAct_9fa48("1618") ? firstStringField(replicaOperationRow, PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_WORKFLOW_STEP, 'workflowStep') && '' : stryMutAct_9fa48("1617") ? false : stryMutAct_9fa48("1616") ? true : (stryCov_9fa48("1616", "1617", "1618"), firstStringField(replicaOperationRow, PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_WORKFLOW_STEP, stryMutAct_9fa48("1619") ? "" : (stryCov_9fa48("1619"), 'workflowStep')) || (stryMutAct_9fa48("1620") ? "Stryker was here!" : (stryCov_9fa48("1620"), '')))).toUpperCase()),
          sourceNodeId: firstStringField(replicaOperationRow, PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_SOURCE_NODE_ID, stryMutAct_9fa48("1621") ? "" : (stryCov_9fa48("1621"), 'sourceNodeId')),
          targetNodeId: firstStringField(replicaOperationRow, PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_TARGET_NODE_ID, stryMutAct_9fa48("1622") ? "" : (stryCov_9fa48("1622"), 'targetNodeId')),
          replicaId: firstStringField(replicaOperationRow, PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_REPLICA_ID, stryMutAct_9fa48("1623") ? "" : (stryCov_9fa48("1623"), 'replicaId'), stryMutAct_9fa48("1624") ? "" : (stryCov_9fa48("1624"), 'service_id'), stryMutAct_9fa48("1625") ? "" : (stryCov_9fa48("1625"), 'serviceId')),
          createdAtMs: normalizePriorityRecoveryInteger(stryMutAct_9fa48("1626") ? replicaOperationRow[PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_CREATED_AT] && replicaOperationRow.createdAt : (stryCov_9fa48("1626"), replicaOperationRow[PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_CREATED_AT] ?? replicaOperationRow.createdAt)),
          updatedAtMs: normalizePriorityRecoveryInteger(stryMutAct_9fa48("1627") ? replicaOperationRow[PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_UPDATED_AT] && replicaOperationRow.updatedAt : (stryCov_9fa48("1627"), replicaOperationRow[PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_UPDATED_AT] ?? replicaOperationRow.updatedAt)),
          timelineLength: timeline.length,
          timelineStepCount: timelineSteps.length,
          latestTimelineStep: stryMutAct_9fa48("1630") ? String(latestTimelineEntry?.step || '').toUpperCase() && null : stryMutAct_9fa48("1629") ? false : stryMutAct_9fa48("1628") ? true : (stryCov_9fa48("1628", "1629", "1630"), (stryMutAct_9fa48("1631") ? String(latestTimelineEntry?.step || '').toLowerCase() : (stryCov_9fa48("1631"), String(stryMutAct_9fa48("1634") ? latestTimelineEntry?.step && '' : stryMutAct_9fa48("1633") ? false : stryMutAct_9fa48("1632") ? true : (stryCov_9fa48("1632", "1633", "1634"), (stryMutAct_9fa48("1635") ? latestTimelineEntry.step : (stryCov_9fa48("1635"), latestTimelineEntry?.step)) || (stryMutAct_9fa48("1636") ? "Stryker was here!" : (stryCov_9fa48("1636"), '')))).toUpperCase())) || null),
          latestTimelineStatus: stryMutAct_9fa48("1639") ? String(latestTimelineEntry?.status || '').toLowerCase() && null : stryMutAct_9fa48("1638") ? false : stryMutAct_9fa48("1637") ? true : (stryCov_9fa48("1637", "1638", "1639"), (stryMutAct_9fa48("1640") ? String(latestTimelineEntry?.status || '').toUpperCase() : (stryCov_9fa48("1640"), String(stryMutAct_9fa48("1643") ? latestTimelineEntry?.status && '' : stryMutAct_9fa48("1642") ? false : stryMutAct_9fa48("1641") ? true : (stryCov_9fa48("1641", "1642", "1643"), (stryMutAct_9fa48("1644") ? latestTimelineEntry.status : (stryCov_9fa48("1644"), latestTimelineEntry?.status)) || (stryMutAct_9fa48("1645") ? "Stryker was here!" : (stryCov_9fa48("1645"), '')))).toLowerCase())) || null),
          latestTimelineInFlight: stryMutAct_9fa48("1648") ? latestTimelineEntry?.inFlight !== true : stryMutAct_9fa48("1647") ? false : stryMutAct_9fa48("1646") ? true : (stryCov_9fa48("1646", "1647", "1648"), (stryMutAct_9fa48("1649") ? latestTimelineEntry.inFlight : (stryCov_9fa48("1649"), latestTimelineEntry?.inFlight)) === (stryMutAct_9fa48("1650") ? false : (stryCov_9fa48("1650"), true)))
        });
        byOperationId[operationId] = context;
        if (stryMutAct_9fa48("1653") ? false : stryMutAct_9fa48("1652") ? true : stryMutAct_9fa48("1651") ? byPartitionId[partitionId] : (stryCov_9fa48("1651", "1652", "1653"), !byPartitionId[partitionId])) {
          if (stryMutAct_9fa48("1654")) {
            {}
          } else {
            stryCov_9fa48("1654");
            byPartitionId[partitionId] = stryMutAct_9fa48("1655") ? ["Stryker was here"] : (stryCov_9fa48("1655"), []);
          }
        }
        byPartitionId[partitionId].push(context);
      }
    }
    for (const partitionId of Object.keys(byPartitionId)) {
      if (stryMutAct_9fa48("1656")) {
        {}
      } else {
        stryCov_9fa48("1656");
        stryMutAct_9fa48("1657") ? byPartitionId[partitionId] : (stryCov_9fa48("1657"), byPartitionId[partitionId].sort(stryMutAct_9fa48("1658") ? () => undefined : (stryCov_9fa48("1658"), (left, right) => String(left.operationId).localeCompare(String(right.operationId)))));
      }
    }
    return stryMutAct_9fa48("1659") ? {} : (stryCov_9fa48("1659"), {
      byOperationId,
      byPartitionId
    });
  }
}
function isPriorityRecoveryOperationContextTerminal(operationContext) {
  if (stryMutAct_9fa48("1660")) {
    {}
  } else {
    stryCov_9fa48("1660");
    if (stryMutAct_9fa48("1663") ? !operationContext && typeof operationContext !== TYPEOF.OBJECT : stryMutAct_9fa48("1662") ? false : stryMutAct_9fa48("1661") ? true : (stryCov_9fa48("1661", "1662", "1663"), (stryMutAct_9fa48("1664") ? operationContext : (stryCov_9fa48("1664"), !operationContext)) || (stryMutAct_9fa48("1666") ? typeof operationContext === TYPEOF.OBJECT : stryMutAct_9fa48("1665") ? false : (stryCov_9fa48("1665", "1666"), typeof operationContext !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("1667")) {
        {}
      } else {
        stryCov_9fa48("1667");
        return stryMutAct_9fa48("1668") ? true : (stryCov_9fa48("1668"), false);
      }
    }
    const operationType = stryMutAct_9fa48("1669") ? String(operationContext.type || '').toLowerCase() : (stryCov_9fa48("1669"), String(stryMutAct_9fa48("1672") ? operationContext.type && '' : stryMutAct_9fa48("1671") ? false : stryMutAct_9fa48("1670") ? true : (stryCov_9fa48("1670", "1671", "1672"), operationContext.type || (stryMutAct_9fa48("1673") ? "Stryker was here!" : (stryCov_9fa48("1673"), '')))).toUpperCase());
    const workflowStep = stryMutAct_9fa48("1674") ? String(operationContext.workflowStep || '').toLowerCase() : (stryCov_9fa48("1674"), String(stryMutAct_9fa48("1677") ? operationContext.workflowStep && '' : stryMutAct_9fa48("1676") ? false : stryMutAct_9fa48("1675") ? true : (stryCov_9fa48("1675", "1676", "1677"), operationContext.workflowStep || (stryMutAct_9fa48("1678") ? "Stryker was here!" : (stryCov_9fa48("1678"), '')))).toUpperCase());
    if (stryMutAct_9fa48("1681") ? operationType.length > NUM.ZERO && workflowStep.length > NUM.ZERO || isValidReplicaOperationStep(operationType, workflowStep) : stryMutAct_9fa48("1680") ? false : stryMutAct_9fa48("1679") ? true : (stryCov_9fa48("1679", "1680", "1681"), (stryMutAct_9fa48("1683") ? operationType.length > NUM.ZERO || workflowStep.length > NUM.ZERO : stryMutAct_9fa48("1682") ? true : (stryCov_9fa48("1682", "1683"), (stryMutAct_9fa48("1686") ? operationType.length <= NUM.ZERO : stryMutAct_9fa48("1685") ? operationType.length >= NUM.ZERO : stryMutAct_9fa48("1684") ? true : (stryCov_9fa48("1684", "1685", "1686"), operationType.length > NUM.ZERO)) && (stryMutAct_9fa48("1689") ? workflowStep.length <= NUM.ZERO : stryMutAct_9fa48("1688") ? workflowStep.length >= NUM.ZERO : stryMutAct_9fa48("1687") ? true : (stryCov_9fa48("1687", "1688", "1689"), workflowStep.length > NUM.ZERO)))) && isValidReplicaOperationStep(operationType, workflowStep))) {
      if (stryMutAct_9fa48("1690")) {
        {}
      } else {
        stryCov_9fa48("1690");
        return isTerminalReplicaOperationStep(operationType, workflowStep);
      }
    }
    const status = stryMutAct_9fa48("1691") ? String(operationContext.status || '').toUpperCase() : (stryCov_9fa48("1691"), String(stryMutAct_9fa48("1694") ? operationContext.status && '' : stryMutAct_9fa48("1693") ? false : stryMutAct_9fa48("1692") ? true : (stryCov_9fa48("1692", "1693", "1694"), operationContext.status || (stryMutAct_9fa48("1695") ? "Stryker was here!" : (stryCov_9fa48("1695"), '')))).toLowerCase());
    if (stryMutAct_9fa48("1698") ? status.length !== NUM.ZERO : stryMutAct_9fa48("1697") ? false : stryMutAct_9fa48("1696") ? true : (stryCov_9fa48("1696", "1697", "1698"), status.length === NUM.ZERO)) {
      if (stryMutAct_9fa48("1699")) {
        {}
      } else {
        stryCov_9fa48("1699");
        return stryMutAct_9fa48("1700") ? true : (stryCov_9fa48("1700"), false);
      }
    }
    if (stryMutAct_9fa48("1703") ? status !== STATUS_ACTIVE : stryMutAct_9fa48("1702") ? false : stryMutAct_9fa48("1701") ? true : (stryCov_9fa48("1701", "1702", "1703"), status === STATUS_ACTIVE)) {
      if (stryMutAct_9fa48("1704")) {
        {}
      } else {
        stryCov_9fa48("1704");
        return stryMutAct_9fa48("1705") ? true : (stryCov_9fa48("1705"), false);
      }
    }
    return PRIORITY_RECOVERY_TERMINAL_OPERATION_STATUS_SET.has(status);
  }
}
function buildPriorityRecoveryAdmissionByPartitionId(workflowAdmissionsByWorkflowId = {}) {
  if (stryMutAct_9fa48("1706")) {
    {}
  } else {
    stryCov_9fa48("1706");
    const admissionByPartitionId = {};
    for (const workflow of Object.values(stryMutAct_9fa48("1709") ? workflowAdmissionsByWorkflowId && {} : stryMutAct_9fa48("1708") ? false : stryMutAct_9fa48("1707") ? true : (stryCov_9fa48("1707", "1708", "1709"), workflowAdmissionsByWorkflowId || {}))) {
      if (stryMutAct_9fa48("1710")) {
        {}
      } else {
        stryCov_9fa48("1710");
        if (stryMutAct_9fa48("1713") ? !workflow && typeof workflow !== TYPEOF.OBJECT : stryMutAct_9fa48("1712") ? false : stryMutAct_9fa48("1711") ? true : (stryCov_9fa48("1711", "1712", "1713"), (stryMutAct_9fa48("1714") ? workflow : (stryCov_9fa48("1714"), !workflow)) || (stryMutAct_9fa48("1716") ? typeof workflow === TYPEOF.OBJECT : stryMutAct_9fa48("1715") ? false : (stryCov_9fa48("1715", "1716"), typeof workflow !== TYPEOF.OBJECT)))) {
          if (stryMutAct_9fa48("1717")) {
            {}
          } else {
            stryCov_9fa48("1717");
            continue;
          }
        }
        const workflowId = stryMutAct_9fa48("1718") ? String(workflow.workflowId || '') : (stryCov_9fa48("1718"), String(stryMutAct_9fa48("1721") ? workflow.workflowId && '' : stryMutAct_9fa48("1720") ? false : stryMutAct_9fa48("1719") ? true : (stryCov_9fa48("1719", "1720", "1721"), workflow.workflowId || (stryMutAct_9fa48("1722") ? "Stryker was here!" : (stryCov_9fa48("1722"), '')))).trim());
        if (stryMutAct_9fa48("1725") ? workflowId.length !== NUM.ZERO : stryMutAct_9fa48("1724") ? false : stryMutAct_9fa48("1723") ? true : (stryCov_9fa48("1723", "1724", "1725"), workflowId.length === NUM.ZERO)) {
          if (stryMutAct_9fa48("1726")) {
            {}
          } else {
            stryCov_9fa48("1726");
            continue;
          }
        }
        const admission = (stryMutAct_9fa48("1729") ? workflow.admission || typeof workflow.admission === TYPEOF.OBJECT : stryMutAct_9fa48("1728") ? false : stryMutAct_9fa48("1727") ? true : (stryCov_9fa48("1727", "1728", "1729"), workflow.admission && (stryMutAct_9fa48("1731") ? typeof workflow.admission !== TYPEOF.OBJECT : stryMutAct_9fa48("1730") ? true : (stryCov_9fa48("1730", "1731"), typeof workflow.admission === TYPEOF.OBJECT)))) ? workflow.admission : null;
        const partitionIds = normalizePriorityRecoveryStringList(stryMutAct_9fa48("1732") ? [] : (stryCov_9fa48("1732"), [workflow.sourcePartitionId, ...(Array.isArray(workflow.targetPartitionIds) ? workflow.targetPartitionIds : stryMutAct_9fa48("1733") ? ["Stryker was here"] : (stryCov_9fa48("1733"), []))]));
        for (const partitionId of partitionIds) {
          if (stryMutAct_9fa48("1734")) {
            {}
          } else {
            stryCov_9fa48("1734");
            admissionByPartitionId[partitionId] = stryMutAct_9fa48("1735") ? {} : (stryCov_9fa48("1735"), {
              workflowId,
              workflowType: stryMutAct_9fa48("1738") ? workflow.workflowType && null : stryMutAct_9fa48("1737") ? false : stryMutAct_9fa48("1736") ? true : (stryCov_9fa48("1736", "1737", "1738"), workflow.workflowType || null),
              transitionState: stryMutAct_9fa48("1741") ? workflow.transitionState && null : stryMutAct_9fa48("1740") ? false : stryMutAct_9fa48("1739") ? true : (stryCov_9fa48("1739", "1740", "1741"), workflow.transitionState || null),
              decisionType: stryMutAct_9fa48("1744") ? admission?.decisionType && null : stryMutAct_9fa48("1743") ? false : stryMutAct_9fa48("1742") ? true : (stryCov_9fa48("1742", "1743", "1744"), (stryMutAct_9fa48("1745") ? admission.decisionType : (stryCov_9fa48("1745"), admission?.decisionType)) || null),
              decisionDimension: stryMutAct_9fa48("1748") ? admission?.decisionDimension && null : stryMutAct_9fa48("1747") ? false : stryMutAct_9fa48("1746") ? true : (stryCov_9fa48("1746", "1747", "1748"), (stryMutAct_9fa48("1749") ? admission.decisionDimension : (stryCov_9fa48("1749"), admission?.decisionDimension)) || null),
              admissionDecisionAt: stryMutAct_9fa48("1752") ? workflow.admissionDecisionAt && null : stryMutAct_9fa48("1751") ? false : stryMutAct_9fa48("1750") ? true : (stryCov_9fa48("1750", "1751", "1752"), workflow.admissionDecisionAt || null),
              eligibleNodeIds: normalizePriorityRecoveryStringList(stryMutAct_9fa48("1753") ? admission.eligibleNodeIds : (stryCov_9fa48("1753"), admission?.eligibleNodeIds)),
              ineligibleNodes: Array.isArray(stryMutAct_9fa48("1754") ? admission.ineligibleNodes : (stryCov_9fa48("1754"), admission?.ineligibleNodes)) ? stryMutAct_9fa48("1755") ? admission.ineligibleNodes.map(entry => ({
                nodeId: String(entry?.nodeId || ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE),
                reasonCodes: normalizePriorityRecoveryStringList(entry?.reasonCodes)
              })) : (stryCov_9fa48("1755"), admission.ineligibleNodes.map(stryMutAct_9fa48("1756") ? () => undefined : (stryCov_9fa48("1756"), entry => stryMutAct_9fa48("1757") ? {} : (stryCov_9fa48("1757"), {
                nodeId: String(stryMutAct_9fa48("1760") ? entry?.nodeId && ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE : stryMutAct_9fa48("1759") ? false : stryMutAct_9fa48("1758") ? true : (stryCov_9fa48("1758", "1759", "1760"), (stryMutAct_9fa48("1761") ? entry.nodeId : (stryCov_9fa48("1761"), entry?.nodeId)) || ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE)),
                reasonCodes: normalizePriorityRecoveryStringList(stryMutAct_9fa48("1762") ? entry.reasonCodes : (stryCov_9fa48("1762"), entry?.reasonCodes))
              }))).filter(stryMutAct_9fa48("1763") ? () => undefined : (stryCov_9fa48("1763"), entry => stryMutAct_9fa48("1767") ? entry.nodeId.length <= NUM.ZERO : stryMutAct_9fa48("1766") ? entry.nodeId.length >= NUM.ZERO : stryMutAct_9fa48("1765") ? false : stryMutAct_9fa48("1764") ? true : (stryCov_9fa48("1764", "1765", "1766", "1767"), entry.nodeId.length > NUM.ZERO)))) : stryMutAct_9fa48("1768") ? ["Stryker was here"] : (stryCov_9fa48("1768"), []),
              blockingReasons: normalizePriorityRecoveryStringList(workflow.blockingReasons)
            });
          }
        }
      }
    }
    return admissionByPartitionId;
  }
}
function buildPriorityRecoveryLearnerPromotionByPartitionId(serviceRows = stryMutAct_9fa48("1769") ? ["Stryker was here"] : (stryCov_9fa48("1769"), []), readinessByNodeId = {}) {
  if (stryMutAct_9fa48("1770")) {
    {}
  } else {
    stryCov_9fa48("1770");
    const learnerByPartitionId = {};
    for (const serviceRow of Array.isArray(serviceRows) ? serviceRows : stryMutAct_9fa48("1771") ? ["Stryker was here"] : (stryCov_9fa48("1771"), [])) {
      if (stryMutAct_9fa48("1772")) {
        {}
      } else {
        stryCov_9fa48("1772");
        const partitionId = firstStringField(serviceRow, PRIORITY_RECOVERY_SERVICE_FIELD_PARTITION_ID, stryMutAct_9fa48("1773") ? "" : (stryCov_9fa48("1773"), 'partitionId'));
        if (stryMutAct_9fa48("1776") ? false : stryMutAct_9fa48("1775") ? true : stryMutAct_9fa48("1774") ? partitionId : (stryCov_9fa48("1774", "1775", "1776"), !partitionId)) {
          if (stryMutAct_9fa48("1777")) {
            {}
          } else {
            stryCov_9fa48("1777");
            continue;
          }
        }
        const status = stryMutAct_9fa48("1778") ? String(firstStringField(serviceRow, PRIORITY_RECOVERY_SERVICE_FIELD_STATUS, 'status') || '').toUpperCase() : (stryCov_9fa48("1778"), String(stryMutAct_9fa48("1781") ? firstStringField(serviceRow, PRIORITY_RECOVERY_SERVICE_FIELD_STATUS, 'status') && '' : stryMutAct_9fa48("1780") ? false : stryMutAct_9fa48("1779") ? true : (stryCov_9fa48("1779", "1780", "1781"), firstStringField(serviceRow, PRIORITY_RECOVERY_SERVICE_FIELD_STATUS, stryMutAct_9fa48("1782") ? "" : (stryCov_9fa48("1782"), 'status')) || (stryMutAct_9fa48("1783") ? "Stryker was here!" : (stryCov_9fa48("1783"), '')))).toLowerCase());
        const raftRole = stryMutAct_9fa48("1784") ? String(firstStringField(serviceRow, PRIORITY_RECOVERY_SERVICE_FIELD_RAFT_ROLE, 'raftRole') || '').toUpperCase() : (stryCov_9fa48("1784"), String(stryMutAct_9fa48("1787") ? firstStringField(serviceRow, PRIORITY_RECOVERY_SERVICE_FIELD_RAFT_ROLE, 'raftRole') && '' : stryMutAct_9fa48("1786") ? false : stryMutAct_9fa48("1785") ? true : (stryCov_9fa48("1785", "1786", "1787"), firstStringField(serviceRow, PRIORITY_RECOVERY_SERVICE_FIELD_RAFT_ROLE, stryMutAct_9fa48("1788") ? "" : (stryCov_9fa48("1788"), 'raftRole')) || (stryMutAct_9fa48("1789") ? "Stryker was here!" : (stryCov_9fa48("1789"), '')))).toLowerCase());
        if (stryMutAct_9fa48("1792") ? status !== PRIORITY_RECOVERY_STATUS_ACTIVE && raftRole !== PRIORITY_RECOVERY_RAFT_ROLE_LEARNER : stryMutAct_9fa48("1791") ? false : stryMutAct_9fa48("1790") ? true : (stryCov_9fa48("1790", "1791", "1792"), (stryMutAct_9fa48("1794") ? status === PRIORITY_RECOVERY_STATUS_ACTIVE : stryMutAct_9fa48("1793") ? false : (stryCov_9fa48("1793", "1794"), status !== PRIORITY_RECOVERY_STATUS_ACTIVE)) || (stryMutAct_9fa48("1796") ? raftRole === PRIORITY_RECOVERY_RAFT_ROLE_LEARNER : stryMutAct_9fa48("1795") ? false : (stryCov_9fa48("1795", "1796"), raftRole !== PRIORITY_RECOVERY_RAFT_ROLE_LEARNER)))) {
          if (stryMutAct_9fa48("1797")) {
            {}
          } else {
            stryCov_9fa48("1797");
            continue;
          }
        }
        const nodeId = firstStringField(serviceRow, PRIORITY_RECOVERY_SERVICE_FIELD_NODE_ID, stryMutAct_9fa48("1798") ? "" : (stryCov_9fa48("1798"), 'nodeId'));
        if (stryMutAct_9fa48("1801") ? false : stryMutAct_9fa48("1800") ? true : stryMutAct_9fa48("1799") ? nodeId : (stryCov_9fa48("1799", "1800", "1801"), !nodeId)) {
          if (stryMutAct_9fa48("1802")) {
            {}
          } else {
            stryCov_9fa48("1802");
            continue;
          }
        }
        if (stryMutAct_9fa48("1805") ? false : stryMutAct_9fa48("1804") ? true : stryMutAct_9fa48("1803") ? learnerByPartitionId[partitionId] : (stryCov_9fa48("1803", "1804", "1805"), !learnerByPartitionId[partitionId])) {
          if (stryMutAct_9fa48("1806")) {
            {}
          } else {
            stryCov_9fa48("1806");
            learnerByPartitionId[partitionId] = stryMutAct_9fa48("1807") ? ["Stryker was here"] : (stryCov_9fa48("1807"), []);
          }
        }
        learnerByPartitionId[partitionId].push(nodeId);
      }
    }
    const learnerPromotionByPartitionId = {};
    for (const [partitionId, learnerNodeIds] of Object.entries(learnerByPartitionId)) {
      if (stryMutAct_9fa48("1808")) {
        {}
      } else {
        stryCov_9fa48("1808");
        const learnerHoldByNodeId = {};
        const promotableLearnerNodeIds = stryMutAct_9fa48("1809") ? ["Stryker was here"] : (stryCov_9fa48("1809"), []);
        for (const nodeId of normalizePriorityRecoveryStringList(learnerNodeIds)) {
          if (stryMutAct_9fa48("1810")) {
            {}
          } else {
            stryCov_9fa48("1810");
            const readiness = stryMutAct_9fa48("1813") ? readinessByNodeId[nodeId] && null : stryMutAct_9fa48("1812") ? false : stryMutAct_9fa48("1811") ? true : (stryCov_9fa48("1811", "1812", "1813"), readinessByNodeId[nodeId] || null);
            const dimensions = (stryMutAct_9fa48("1816") ? readiness?.dimensions || typeof readiness.dimensions === TYPEOF.OBJECT : stryMutAct_9fa48("1815") ? false : stryMutAct_9fa48("1814") ? true : (stryCov_9fa48("1814", "1815", "1816"), (stryMutAct_9fa48("1817") ? readiness.dimensions : (stryCov_9fa48("1817"), readiness?.dimensions)) && (stryMutAct_9fa48("1819") ? typeof readiness.dimensions !== TYPEOF.OBJECT : stryMutAct_9fa48("1818") ? true : (stryCov_9fa48("1818", "1819"), typeof readiness.dimensions === TYPEOF.OBJECT)))) ? readiness.dimensions : {};
            const repairEligible = stryMutAct_9fa48("1822") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE] !== true : stryMutAct_9fa48("1821") ? false : stryMutAct_9fa48("1820") ? true : (stryCov_9fa48("1820", "1821", "1822"), dimensions[CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE] === (stryMutAct_9fa48("1823") ? false : (stryCov_9fa48("1823"), true)));
            const recoveryEligible = stryMutAct_9fa48("1826") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE] !== true : stryMutAct_9fa48("1825") ? false : stryMutAct_9fa48("1824") ? true : (stryCov_9fa48("1824", "1825", "1826"), dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE] === (stryMutAct_9fa48("1827") ? false : (stryCov_9fa48("1827"), true)));
            if (stryMutAct_9fa48("1829") ? false : stryMutAct_9fa48("1828") ? true : (stryCov_9fa48("1828", "1829"), repairEligible)) {
              if (stryMutAct_9fa48("1830")) {
                {}
              } else {
                stryCov_9fa48("1830");
                promotableLearnerNodeIds.push(nodeId);
                continue;
              }
            }
            const reasonCodes = resolvePriorityRecoveryReasonCodesFromReadiness(readiness);
            learnerHoldByNodeId[nodeId] = stryMutAct_9fa48("1831") ? {} : (stryCov_9fa48("1831"), {
              holdReason: readiness ? recoveryEligible ? PRIORITY_RECOVERY_LEARNER_HOLD_REASON_RECOVERY_ONLY : PRIORITY_RECOVERY_LEARNER_HOLD_REASON_NOT_RECOVERY_ELIGIBLE : PRIORITY_RECOVERY_LEARNER_HOLD_REASON_NO_READINESS,
              reasonCodes
            });
          }
        }
        learnerPromotionByPartitionId[partitionId] = stryMutAct_9fa48("1832") ? {} : (stryCov_9fa48("1832"), {
          activeLearnerNodeIds: normalizePriorityRecoveryStringList(learnerNodeIds),
          promotableLearnerNodeIds,
          activeLearnerNodeCount: learnerNodeIds.length,
          promotableLearnerNodeCount: promotableLearnerNodeIds.length,
          learnerHoldByNodeId
        });
      }
    }
    return learnerPromotionByPartitionId;
  }
}
function buildPriorityRecoveryPublicationNodeDecisions(publicationConvergence) {
  if (stryMutAct_9fa48("1833")) {
    {}
  } else {
    stryCov_9fa48("1833");
    const projectionDiagnostics = (stryMutAct_9fa48("1836") ? publicationConvergence?.projectionDiagnostics || typeof publicationConvergence.projectionDiagnostics === TYPEOF.OBJECT : stryMutAct_9fa48("1835") ? false : stryMutAct_9fa48("1834") ? true : (stryCov_9fa48("1834", "1835", "1836"), (stryMutAct_9fa48("1837") ? publicationConvergence.projectionDiagnostics : (stryCov_9fa48("1837"), publicationConvergence?.projectionDiagnostics)) && (stryMutAct_9fa48("1839") ? typeof publicationConvergence.projectionDiagnostics !== TYPEOF.OBJECT : stryMutAct_9fa48("1838") ? true : (stryCov_9fa48("1838", "1839"), typeof publicationConvergence.projectionDiagnostics === TYPEOF.OBJECT)))) ? publicationConvergence.projectionDiagnostics : null;
    const inclusionReasonsByNodeId = {};
    const exclusionReasonsByNodeId = {};
    for (const nodeId of normalizePriorityRecoveryStringList(stryMutAct_9fa48("1840") ? projectionDiagnostics.recoveryEligibleIncludedNodeIds : (stryCov_9fa48("1840"), projectionDiagnostics?.recoveryEligibleIncludedNodeIds))) {
      if (stryMutAct_9fa48("1841")) {
        {}
      } else {
        stryCov_9fa48("1841");
        inclusionReasonsByNodeId[nodeId] = stryMutAct_9fa48("1842") ? [] : (stryCov_9fa48("1842"), [PRIORITY_RECOVERY_PUBLICATION_INCLUSION_REASON_RECOVERY_ELIGIBLE_PROJECTION_INCLUDED]);
      }
    }
    for (const nodeId of normalizePriorityRecoveryStringList(stryMutAct_9fa48("1843") ? projectionDiagnostics.readinessExcludedNodeIds : (stryCov_9fa48("1843"), projectionDiagnostics?.readinessExcludedNodeIds))) {
      if (stryMutAct_9fa48("1844")) {
        {}
      } else {
        stryCov_9fa48("1844");
        exclusionReasonsByNodeId[nodeId] = stryMutAct_9fa48("1845") ? [] : (stryCov_9fa48("1845"), [PRIORITY_RECOVERY_PUBLICATION_EXCLUSION_REASON_READINESS_PROJECTION_EXCLUDED]);
      }
    }
    for (const nodeId of normalizePriorityRecoveryStringList(stryMutAct_9fa48("1846") ? projectionDiagnostics.clusterMemberUnhealthyExcludedNodeIds : (stryCov_9fa48("1846"), projectionDiagnostics?.clusterMemberUnhealthyExcludedNodeIds))) {
      if (stryMutAct_9fa48("1847")) {
        {}
      } else {
        stryCov_9fa48("1847");
        exclusionReasonsByNodeId[nodeId] = stryMutAct_9fa48("1848") ? [] : (stryCov_9fa48("1848"), [...(Array.isArray(exclusionReasonsByNodeId[nodeId]) ? exclusionReasonsByNodeId[nodeId] : stryMutAct_9fa48("1849") ? ["Stryker was here"] : (stryCov_9fa48("1849"), [])), PRIORITY_RECOVERY_PUBLICATION_EXCLUSION_REASON_CLUSTER_MEMBER_UNHEALTHY]);
      }
    }
    return stryMutAct_9fa48("1850") ? {} : (stryCov_9fa48("1850"), {
      inclusionReasonsByNodeId,
      exclusionReasonsByNodeId
    });
  }
}
const CONTROL_SNAPSHOT_PUBLICATION_OBSERVATION_STATE = Object.freeze(stryMutAct_9fa48("1851") ? {} : (stryCov_9fa48("1851"), {
  AVAILABLE: stryMutAct_9fa48("1852") ? "" : (stryCov_9fa48("1852"), 'available')
}));
function hasDurablePublishedMembershipObservation(publicationDiagnostics = null) {
  if (stryMutAct_9fa48("1853")) {
    {}
  } else {
    stryCov_9fa48("1853");
    if (stryMutAct_9fa48("1856") ? !publicationDiagnostics && typeof publicationDiagnostics !== TYPEOF.OBJECT : stryMutAct_9fa48("1855") ? false : stryMutAct_9fa48("1854") ? true : (stryCov_9fa48("1854", "1855", "1856"), (stryMutAct_9fa48("1857") ? publicationDiagnostics : (stryCov_9fa48("1857"), !publicationDiagnostics)) || (stryMutAct_9fa48("1859") ? typeof publicationDiagnostics === TYPEOF.OBJECT : stryMutAct_9fa48("1858") ? false : (stryCov_9fa48("1858", "1859"), typeof publicationDiagnostics !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("1860")) {
        {}
      } else {
        stryCov_9fa48("1860");
        return stryMutAct_9fa48("1861") ? true : (stryCov_9fa48("1861"), false);
      }
    }
    if (stryMutAct_9fa48("1864") ? publicationDiagnostics?.publicationObservation?.state !== CONTROL_SNAPSHOT_PUBLICATION_OBSERVATION_STATE.AVAILABLE : stryMutAct_9fa48("1863") ? false : stryMutAct_9fa48("1862") ? true : (stryCov_9fa48("1862", "1863", "1864"), (stryMutAct_9fa48("1866") ? publicationDiagnostics.publicationObservation?.state : stryMutAct_9fa48("1865") ? publicationDiagnostics?.publicationObservation.state : (stryCov_9fa48("1865", "1866"), publicationDiagnostics?.publicationObservation?.state)) === CONTROL_SNAPSHOT_PUBLICATION_OBSERVATION_STATE.AVAILABLE)) {
      if (stryMutAct_9fa48("1867")) {
        {}
      } else {
        stryCov_9fa48("1867");
        return stryMutAct_9fa48("1868") ? false : (stryCov_9fa48("1868"), true);
      }
    }
    if (stryMutAct_9fa48("1871") ? publicationDiagnostics?.publishedActiveNodeIdsPresent === true && Array.isArray(publicationDiagnostics?.publishedActiveNodeIds) : stryMutAct_9fa48("1870") ? false : stryMutAct_9fa48("1869") ? true : (stryCov_9fa48("1869", "1870", "1871"), (stryMutAct_9fa48("1873") ? publicationDiagnostics?.publishedActiveNodeIdsPresent !== true : stryMutAct_9fa48("1872") ? false : (stryCov_9fa48("1872", "1873"), (stryMutAct_9fa48("1874") ? publicationDiagnostics.publishedActiveNodeIdsPresent : (stryCov_9fa48("1874"), publicationDiagnostics?.publishedActiveNodeIdsPresent)) === (stryMutAct_9fa48("1875") ? false : (stryCov_9fa48("1875"), true)))) || Array.isArray(stryMutAct_9fa48("1876") ? publicationDiagnostics.publishedActiveNodeIds : (stryCov_9fa48("1876"), publicationDiagnostics?.publishedActiveNodeIds)))) {
      if (stryMutAct_9fa48("1877")) {
        {}
      } else {
        stryCov_9fa48("1877");
        return stryMutAct_9fa48("1878") ? false : (stryCov_9fa48("1878"), true);
      }
    }
    const publicationStatus = stryMutAct_9fa48("1879") ? String(publicationDiagnostics?.status || publicationDiagnostics?.publicationStatus || publicationDiagnostics?.publicationObservation?.status || ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE).toLowerCase() : (stryCov_9fa48("1879"), String(stryMutAct_9fa48("1882") ? (publicationDiagnostics?.status || publicationDiagnostics?.publicationStatus || publicationDiagnostics?.publicationObservation?.status) && ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE : stryMutAct_9fa48("1881") ? false : stryMutAct_9fa48("1880") ? true : (stryCov_9fa48("1880", "1881", "1882"), (stryMutAct_9fa48("1884") ? (publicationDiagnostics?.status || publicationDiagnostics?.publicationStatus) && publicationDiagnostics?.publicationObservation?.status : stryMutAct_9fa48("1883") ? false : (stryCov_9fa48("1883", "1884"), (stryMutAct_9fa48("1886") ? publicationDiagnostics?.status && publicationDiagnostics?.publicationStatus : stryMutAct_9fa48("1885") ? false : (stryCov_9fa48("1885", "1886"), (stryMutAct_9fa48("1887") ? publicationDiagnostics.status : (stryCov_9fa48("1887"), publicationDiagnostics?.status)) || (stryMutAct_9fa48("1888") ? publicationDiagnostics.publicationStatus : (stryCov_9fa48("1888"), publicationDiagnostics?.publicationStatus)))) || (stryMutAct_9fa48("1890") ? publicationDiagnostics.publicationObservation?.status : stryMutAct_9fa48("1889") ? publicationDiagnostics?.publicationObservation.status : (stryCov_9fa48("1889", "1890"), publicationDiagnostics?.publicationObservation?.status)))) || ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE)).toUpperCase());
    return stryMutAct_9fa48("1893") ? publicationStatus !== ADMIN_CONTROL_SNAPSHOT_LITERAL.PUBLISHED : stryMutAct_9fa48("1892") ? false : stryMutAct_9fa48("1891") ? true : (stryCov_9fa48("1891", "1892", "1893"), publicationStatus === ADMIN_CONTROL_SNAPSHOT_LITERAL.PUBLISHED);
  }
}
function selectDurablePublishedMembershipObservation(publicationDiagnostics = null) {
  if (stryMutAct_9fa48("1894")) {
    {}
  } else {
    stryCov_9fa48("1894");
    return hasDurablePublishedMembershipObservation(publicationDiagnostics) ? publicationDiagnostics : null;
  }
} // ── AdminControlSnapshot class ──────────────────────────────────────────────
/**
 * Control snapshot builder.
 *
 * Receives all required dependencies via constructor injection.
 * Cross-module callbacks (partition services resolution) are injected
 * as functions so this module has no back-reference to AdminWebSocketAPI.
 */
class AdminControlSnapshot {
  /**
  * @param {Object} deps
  * @param {Object} deps.systemTableCache
  * @param {string} deps.nodeId
  * @param {Object|null} deps.cdcIntegrationService
  * @param {Function|null} deps.resolveLocalPartitionServices
  */
  constructor(deps = {}) {
    if (stryMutAct_9fa48("1895")) {
      {}
    } else {
      stryCov_9fa48("1895");
      this.systemTableCache = stryMutAct_9fa48("1898") ? deps.systemTableCache && null : stryMutAct_9fa48("1897") ? false : stryMutAct_9fa48("1896") ? true : (stryCov_9fa48("1896", "1897", "1898"), deps.systemTableCache || null);
      this.nodeId = stryMutAct_9fa48("1901") ? deps.nodeId && null : stryMutAct_9fa48("1900") ? false : stryMutAct_9fa48("1899") ? true : (stryCov_9fa48("1899", "1900", "1901"), deps.nodeId || null);
      this.cacheMutationTarget = stryMutAct_9fa48("1904") ? deps.cacheMutationTarget && null : stryMutAct_9fa48("1903") ? false : stryMutAct_9fa48("1902") ? true : (stryCov_9fa48("1902", "1903", "1904"), deps.cacheMutationTarget || null);
      this.sqlQueryEngine = stryMutAct_9fa48("1907") ? deps.sqlQueryEngine && null : stryMutAct_9fa48("1906") ? false : stryMutAct_9fa48("1905") ? true : (stryCov_9fa48("1905", "1906", "1907"), deps.sqlQueryEngine || null);
      this.messageRouter = stryMutAct_9fa48("1910") ? deps.messageRouter && null : stryMutAct_9fa48("1909") ? false : stryMutAct_9fa48("1908") ? true : (stryCov_9fa48("1908", "1909", "1910"), deps.messageRouter || null);
      this.cdcIntegrationService = stryMutAct_9fa48("1913") ? deps.cdcIntegrationService && null : stryMutAct_9fa48("1912") ? false : stryMutAct_9fa48("1911") ? true : (stryCov_9fa48("1911", "1912", "1913"), deps.cdcIntegrationService || null);
      this.controlPlaneSystemTableGateway = stryMutAct_9fa48("1916") ? deps.controlPlaneSystemTableGateway && null : stryMutAct_9fa48("1915") ? false : stryMutAct_9fa48("1914") ? true : (stryCov_9fa48("1914", "1915", "1916"), deps.controlPlaneSystemTableGateway || null);
      this.controlPlaneReadinessService = stryMutAct_9fa48("1919") ? deps.controlPlaneReadinessService && null : stryMutAct_9fa48("1918") ? false : stryMutAct_9fa48("1917") ? true : (stryCov_9fa48("1917", "1918", "1919"), deps.controlPlaneReadinessService || null);
      this.startupRecoveryCoordinator = stryMutAct_9fa48("1922") ? deps.startupRecoveryCoordinator && new StartupRecoveryCoordinator({
        readinessState: deps.bootstrapReadinessState || null,
        now: deps.nowFn
      }) : stryMutAct_9fa48("1921") ? false : stryMutAct_9fa48("1920") ? true : (stryCov_9fa48("1920", "1921", "1922"), deps.startupRecoveryCoordinator || new StartupRecoveryCoordinator(stryMutAct_9fa48("1923") ? {} : (stryCov_9fa48("1923"), {
        readinessState: stryMutAct_9fa48("1926") ? deps.bootstrapReadinessState && null : stryMutAct_9fa48("1925") ? false : stryMutAct_9fa48("1924") ? true : (stryCov_9fa48("1924", "1925", "1926"), deps.bootstrapReadinessState || null),
        now: deps.nowFn
      })));
      this.heartbeatService = stryMutAct_9fa48("1929") ? deps.heartbeatService && null : stryMutAct_9fa48("1928") ? false : stryMutAct_9fa48("1927") ? true : (stryCov_9fa48("1927", "1928", "1929"), deps.heartbeatService || null);
      this.readinessSnapshotCacheMaxAgeMs = (stryMutAct_9fa48("1932") ? Number.isFinite(deps.readinessSnapshotCacheMaxAgeMs) || deps.readinessSnapshotCacheMaxAgeMs > NUM.ZERO : stryMutAct_9fa48("1931") ? false : stryMutAct_9fa48("1930") ? true : (stryCov_9fa48("1930", "1931", "1932"), Number.isFinite(deps.readinessSnapshotCacheMaxAgeMs) && (stryMutAct_9fa48("1935") ? deps.readinessSnapshotCacheMaxAgeMs <= NUM.ZERO : stryMutAct_9fa48("1934") ? deps.readinessSnapshotCacheMaxAgeMs >= NUM.ZERO : stryMutAct_9fa48("1933") ? true : (stryCov_9fa48("1933", "1934", "1935"), deps.readinessSnapshotCacheMaxAgeMs > NUM.ZERO)))) ? Math.floor(deps.readinessSnapshotCacheMaxAgeMs) : CONTROL_PLANE_DIAGNOSTICS_READINESS_CACHE_MAX_AGE_MS;
      this.ensureAuthoritativeDiscoveryCacheRepair = (stryMutAct_9fa48("1938") ? typeof deps.ensureAuthoritativeDiscoveryCacheRepair !== TYPEOF.FUNCTION : stryMutAct_9fa48("1937") ? false : stryMutAct_9fa48("1936") ? true : (stryCov_9fa48("1936", "1937", "1938"), typeof deps.ensureAuthoritativeDiscoveryCacheRepair === TYPEOF.FUNCTION)) ? deps.ensureAuthoritativeDiscoveryCacheRepair : null;
      this.resolveLocalPartitionServices = (stryMutAct_9fa48("1941") ? typeof deps.resolveLocalPartitionServices !== TYPEOF.FUNCTION : stryMutAct_9fa48("1940") ? false : stryMutAct_9fa48("1939") ? true : (stryCov_9fa48("1939", "1940", "1941"), typeof deps.resolveLocalPartitionServices === TYPEOF.FUNCTION)) ? deps.resolveLocalPartitionServices : null;
      this.nowFn = (stryMutAct_9fa48("1944") ? typeof deps.nowFn !== TYPEOF.FUNCTION : stryMutAct_9fa48("1943") ? false : stryMutAct_9fa48("1942") ? true : (stryCov_9fa48("1942", "1943", "1944"), typeof deps.nowFn === TYPEOF.FUNCTION)) ? deps.nowFn : stryMutAct_9fa48("1945") ? () => undefined : (stryCov_9fa48("1945"), () => Date.now());
    }
  } /**
    * Build local control snapshot payload from system cache only.
    * @return {Object}
    */
  async buildLocalControlSnapshot(options = {}) {
    if (stryMutAct_9fa48("1946")) {
      {}
    } else {
      stryCov_9fa48("1946");
      if (stryMutAct_9fa48("1949") ? !this.systemTableCache && typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("1948") ? false : stryMutAct_9fa48("1947") ? true : (stryCov_9fa48("1947", "1948", "1949"), (stryMutAct_9fa48("1950") ? this.systemTableCache : (stryCov_9fa48("1950"), !this.systemTableCache)) || (stryMutAct_9fa48("1952") ? typeof this.systemTableCache.getAll === TYPEOF.FUNCTION : stryMutAct_9fa48("1951") ? false : (stryCov_9fa48("1951", "1952"), typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("1953")) {
          {}
        } else {
          stryCov_9fa48("1953");
          throw new Error(ADMIN_ERROR_MESSAGE.CONTROL_SNAPSHOT_UNAVAILABLE);
        }
      }
      const tableRows = this.systemTableCache.getAll(TABLES.TABLES);
      const partitionRows = this.systemTableCache.getAll(TABLES.PARTITIONS);
      const replicaOperationRows = this.systemTableCache.getAll(TABLES.REPLICA_OPERATIONS);
      const capturedAt = this.nowFn();
      const preferAuthoritativePublicationRead = stryMutAct_9fa48("1956") ? (options.preferAuthoritativePublicationRead === true || options.allowAuthoritativeRepair === true) && options.forceAuthoritativeRepair === true : stryMutAct_9fa48("1955") ? false : stryMutAct_9fa48("1954") ? true : (stryCov_9fa48("1954", "1955", "1956"), (stryMutAct_9fa48("1958") ? options.preferAuthoritativePublicationRead === true && options.allowAuthoritativeRepair === true : stryMutAct_9fa48("1957") ? false : (stryCov_9fa48("1957", "1958"), (stryMutAct_9fa48("1960") ? options.preferAuthoritativePublicationRead !== true : stryMutAct_9fa48("1959") ? false : (stryCov_9fa48("1959", "1960"), options.preferAuthoritativePublicationRead === (stryMutAct_9fa48("1961") ? false : (stryCov_9fa48("1961"), true)))) || (stryMutAct_9fa48("1963") ? options.allowAuthoritativeRepair !== true : stryMutAct_9fa48("1962") ? false : (stryCov_9fa48("1962", "1963"), options.allowAuthoritativeRepair === (stryMutAct_9fa48("1964") ? false : (stryCov_9fa48("1964"), true)))))) || (stryMutAct_9fa48("1966") ? options.forceAuthoritativeRepair !== true : stryMutAct_9fa48("1965") ? false : (stryCov_9fa48("1965", "1966"), options.forceAuthoritativeRepair === (stryMutAct_9fa48("1967") ? false : (stryCov_9fa48("1967"), true)))));
      const reconcileAuthoritativeMembershipPublication = stryMutAct_9fa48("1970") ? options.reconcileAuthoritativeMembershipPublication === true && options.forceAuthoritativeRepair === true : stryMutAct_9fa48("1969") ? false : stryMutAct_9fa48("1968") ? true : (stryCov_9fa48("1968", "1969", "1970"), (stryMutAct_9fa48("1972") ? options.reconcileAuthoritativeMembershipPublication !== true : stryMutAct_9fa48("1971") ? false : (stryCov_9fa48("1971", "1972"), options.reconcileAuthoritativeMembershipPublication === (stryMutAct_9fa48("1973") ? false : (stryCov_9fa48("1973"), true)))) || (stryMutAct_9fa48("1975") ? options.forceAuthoritativeRepair !== true : stryMutAct_9fa48("1974") ? false : (stryCov_9fa48("1974", "1975"), options.forceAuthoritativeRepair === (stryMutAct_9fa48("1976") ? false : (stryCov_9fa48("1976"), true)))));
      const controlPlaneDiagnostics = await this.buildControlPlaneDiagnosticsSnapshot(stryMutAct_9fa48("1977") ? {} : (stryCov_9fa48("1977"), {
        capturedAt,
        tableRows,
        preferAuthoritativePublicationRead,
        reconcileAuthoritativeMembershipPublication,
        allowAuthoritativeReadinessRefresh: options.allowAuthoritativeReadinessRefresh,
        allowStaleReadinessOnCacheChange: options.allowStaleReadinessOnCacheChange
      }));
      const nodeRows = this.systemTableCache.getAll(TABLES.NODES);
      const serviceRows = this.systemTableCache.getAll(TABLES.SERVICES);
      const nodeEndpointRows = this.systemTableCache.getAll(TABLES.NODE_ENDPOINTS);
      const publicationRows = this.systemTableCache.getAll(TABLES.CONTROL_PLANE_PUBLICATIONS);
      const publicationRowsForActiveNodeResolution = Array.isArray(publicationRows) ? stryMutAct_9fa48("1978") ? publicationRows : (stryCov_9fa48("1978"), publicationRows.slice()) : stryMutAct_9fa48("1979") ? ["Stryker was here"] : (stryCov_9fa48("1979"), []);
      const publishedMembershipObservation = selectDurablePublishedMembershipObservation(stryMutAct_9fa48("1980") ? controlPlaneDiagnostics.publishedMembershipObservation : (stryCov_9fa48("1980"), controlPlaneDiagnostics?.publishedMembershipObservation));
      if (stryMutAct_9fa48("1982") ? false : stryMutAct_9fa48("1981") ? true : (stryCov_9fa48("1981", "1982"), publishedMembershipObservation)) {
        if (stryMutAct_9fa48("1983")) {
          {}
        } else {
          stryCov_9fa48("1983");
          publicationRowsForActiveNodeResolution.push(publishedMembershipObservation);
        }
      }
      const activeNodeViews = this.resolveControlSnapshotNodeViews(nodeRows, serviceRows, nodeEndpointRows, controlPlaneDiagnostics, publicationRowsForActiveNodeResolution);
      if (stryMutAct_9fa48("1986") ? controlPlaneDiagnostics || typeof controlPlaneDiagnostics === TYPEOF.OBJECT : stryMutAct_9fa48("1985") ? false : stryMutAct_9fa48("1984") ? true : (stryCov_9fa48("1984", "1985", "1986"), controlPlaneDiagnostics && (stryMutAct_9fa48("1988") ? typeof controlPlaneDiagnostics !== TYPEOF.OBJECT : stryMutAct_9fa48("1987") ? true : (stryCov_9fa48("1987", "1988"), typeof controlPlaneDiagnostics === TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("1989")) {
          {}
        } else {
          stryCov_9fa48("1989");
          controlPlaneDiagnostics.activeNodeViews = stryMutAct_9fa48("1990") ? {} : (stryCov_9fa48("1990"), {
            authoritativeSource: activeNodeViews.authoritativeSource,
            authoritativeNodeIds: stryMutAct_9fa48("1991") ? [] : (stryCov_9fa48("1991"), [...activeNodeViews.authoritativeActiveNodeIds]),
            projectedServingNodeIds: stryMutAct_9fa48("1992") ? [] : (stryCov_9fa48("1992"), [...activeNodeViews.projectedServingNodeIds]),
            locallyEligibleNodeIds: stryMutAct_9fa48("1993") ? [] : (stryCov_9fa48("1993"), [...activeNodeViews.locallyEligibleNodeIds]),
            suspectedOrTransitioningNodeIds: stryMutAct_9fa48("1994") ? [] : (stryCov_9fa48("1994"), [...activeNodeViews.suspectedOrTransitioningNodeIds]),
            membershipFreeze: activeNodeViews.membershipFreeze,
            effectiveSource: activeNodeViews.effectiveSource,
            effectiveNodeIds: stryMutAct_9fa48("1995") ? [] : (stryCov_9fa48("1995"), [...activeNodeViews.effectiveActiveNodeIds]),
            projectedNodeIds: stryMutAct_9fa48("1996") ? [] : (stryCov_9fa48("1996"), [...activeNodeViews.projectedActiveNodeIds]),
            publishedNodeIds: Array.isArray(activeNodeViews.publishedActiveNodeIds) ? stryMutAct_9fa48("1997") ? [] : (stryCov_9fa48("1997"), [...activeNodeViews.publishedActiveNodeIds]) : stryMutAct_9fa48("1998") ? ["Stryker was here"] : (stryCov_9fa48("1998"), []),
            publishedMembershipAvailable: stryMutAct_9fa48("2001") ? activeNodeViews.publishedMembershipAvailable !== true : stryMutAct_9fa48("2000") ? false : stryMutAct_9fa48("1999") ? true : (stryCov_9fa48("1999", "2000", "2001"), activeNodeViews.publishedMembershipAvailable === (stryMutAct_9fa48("2002") ? false : (stryCov_9fa48("2002"), true)))
          });
        }
      }
      const activePartitionRows = filterActiveServingPartitionRows(partitionRows, tableRows);
      const activePartitionIdSet = new Set(stryMutAct_9fa48("2003") ? activePartitionRows.map(row => firstStringField(row, COLUMN.PARTITION_ID, 'partitionId', 'id')) : (stryCov_9fa48("2003"), activePartitionRows.map(stryMutAct_9fa48("2004") ? () => undefined : (stryCov_9fa48("2004"), row => firstStringField(row, COLUMN.PARTITION_ID, stryMutAct_9fa48("2005") ? "" : (stryCov_9fa48("2005"), 'partitionId'), stryMutAct_9fa48("2006") ? "" : (stryCov_9fa48("2006"), 'id')))).filter(Boolean)));
      const activePartitionServiceRows = stryMutAct_9fa48("2007") ? serviceRows : (stryCov_9fa48("2007"), serviceRows.filter(serviceRow => {
        if (stryMutAct_9fa48("2008")) {
          {}
        } else {
          stryCov_9fa48("2008");
          const partitionId = firstStringField(serviceRow, COLUMN.PARTITION_ID, stryMutAct_9fa48("2009") ? "" : (stryCov_9fa48("2009"), 'partitionId'), stryMutAct_9fa48("2010") ? "" : (stryCov_9fa48("2010"), 'id'));
          return stryMutAct_9fa48("2013") ? partitionId || activePartitionIdSet.has(partitionId) : stryMutAct_9fa48("2012") ? false : stryMutAct_9fa48("2011") ? true : (stryCov_9fa48("2011", "2012", "2013"), partitionId && activePartitionIdSet.has(partitionId));
        }
      }));
      const partitionIds = uniqueSorted(stryMutAct_9fa48("2014") ? activePartitionRows.map(row => firstStringField(row, COLUMN.PARTITION_ID, 'id')) : (stryCov_9fa48("2014"), activePartitionRows.map(stryMutAct_9fa48("2015") ? () => undefined : (stryCov_9fa48("2015"), row => firstStringField(row, COLUMN.PARTITION_ID, stryMutAct_9fa48("2016") ? "" : (stryCov_9fa48("2016"), 'id')))).filter(Boolean)));
      const leaderSummary = this.buildControlSnapshotLeaderSummary(activePartitionRows, activePartitionServiceRows);
      const voterCounts = this.buildControlSnapshotVoterCounts(activePartitionServiceRows);
      const replicaOperations = this.buildControlSnapshotReplicaOperationSummary(replicaOperationRows);
      return stryMutAct_9fa48("2017") ? {} : (stryCov_9fa48("2017"), {
        schemaVersion: ADMIN_CONTROL_SNAPSHOT.SCHEMA_VERSION,
        nodeId: this.nodeId,
        capturedAt,
        nodes: stryMutAct_9fa48("2018") ? [] : (stryCov_9fa48("2018"), [...activeNodeViews.effectiveActiveNodeIds]),
        publishedNodes: Array.isArray(activeNodeViews.publishedActiveNodeIds) ? stryMutAct_9fa48("2019") ? [] : (stryCov_9fa48("2019"), [...activeNodeViews.publishedActiveNodeIds]) : stryMutAct_9fa48("2020") ? ["Stryker was here"] : (stryCov_9fa48("2020"), []),
        projectedNodes: stryMutAct_9fa48("2021") ? [] : (stryCov_9fa48("2021"), [...activeNodeViews.projectedServingNodeIds]),
        suspectedOrTransitioningNodes: stryMutAct_9fa48("2022") ? [] : (stryCov_9fa48("2022"), [...activeNodeViews.suspectedOrTransitioningNodeIds]),
        partitions: partitionIds,
        cdcTelemetry: this.buildLocalCdcTelemetry(),
        controlPlaneDiagnostics,
        leaders: leaderSummary.leaders,
        replicaRoles: leaderSummary.replicaRoles,
        replicaRoleDiagnostics: leaderSummary.replicaRoleDiagnostics,
        voterCounts,
        replicaOperations
      });
    }
  } /**
    * Resolve one local control snapshot with optional authoritative
    * cache repair when partition topology appears incomplete.
    * @return {Promise<Object>}
    */
  async resolveLocalControlSnapshot(options = {}) {
    if (stryMutAct_9fa48("2023")) {
      {}
    } else {
      stryCov_9fa48("2023");
      const forceAuthoritativeRepair = stryMutAct_9fa48("2026") ? options.forceAuthoritativeRepair !== true : stryMutAct_9fa48("2025") ? false : stryMutAct_9fa48("2024") ? true : (stryCov_9fa48("2024", "2025", "2026"), options.forceAuthoritativeRepair === (stryMutAct_9fa48("2027") ? false : (stryCov_9fa48("2027"), true)));
      const allowAuthoritativeRepair = stryMutAct_9fa48("2030") ? options.allowAuthoritativeRepair !== true : stryMutAct_9fa48("2029") ? false : stryMutAct_9fa48("2028") ? true : (stryCov_9fa48("2028", "2029", "2030"), options.allowAuthoritativeRepair === (stryMutAct_9fa48("2031") ? false : (stryCov_9fa48("2031"), true)));
      let snapshot = null;
      try {
        if (stryMutAct_9fa48("2032")) {
          {}
        } else {
          stryCov_9fa48("2032");
          snapshot = await this.buildLocalControlSnapshot(options);
        }
      } catch (error) {
        if (stryMutAct_9fa48("2033")) {
          {}
        } else {
          stryCov_9fa48("2033");
          if (stryMutAct_9fa48("2036") ? (!forceAuthoritativeRepair || !this.canRunAuthoritativeControlSnapshotRepair()) && !isRecoverableControlSnapshotPublicationReadError(error) : stryMutAct_9fa48("2035") ? false : stryMutAct_9fa48("2034") ? true : (stryCov_9fa48("2034", "2035", "2036"), (stryMutAct_9fa48("2038") ? !forceAuthoritativeRepair && !this.canRunAuthoritativeControlSnapshotRepair() : stryMutAct_9fa48("2037") ? false : (stryCov_9fa48("2037", "2038"), (stryMutAct_9fa48("2039") ? forceAuthoritativeRepair : (stryCov_9fa48("2039"), !forceAuthoritativeRepair)) || (stryMutAct_9fa48("2040") ? this.canRunAuthoritativeControlSnapshotRepair() : (stryCov_9fa48("2040"), !this.canRunAuthoritativeControlSnapshotRepair())))) || (stryMutAct_9fa48("2041") ? isRecoverableControlSnapshotPublicationReadError(error) : (stryCov_9fa48("2041"), !isRecoverableControlSnapshotPublicationReadError(error))))) {
            if (stryMutAct_9fa48("2042")) {
              {}
            } else {
              stryCov_9fa48("2042");
              throw error;
            }
          }
          let repair = null;
          try {
            if (stryMutAct_9fa48("2043")) {
              {}
            } else {
              stryCov_9fa48("2043");
              repair = await this.ensureAuthoritativeDiscoveryCacheRepair(stryMutAct_9fa48("2044") ? {} : (stryCov_9fa48("2044"), {
                reason: CONTROL_SNAPSHOT_REPAIR_REASON,
                bypassReuse: stryMutAct_9fa48("2045") ? false : (stryCov_9fa48("2045"), true)
              }));
            }
          } catch (repairError) {
            if (stryMutAct_9fa48("2046")) {
              {}
            } else {
              stryCov_9fa48("2046");
              throw buildAuthoritativeControlSnapshotRepairFailure(stryMutAct_9fa48("2049") ? repairError?.message && repairError : stryMutAct_9fa48("2048") ? false : stryMutAct_9fa48("2047") ? true : (stryCov_9fa48("2047", "2048", "2049"), (stryMutAct_9fa48("2050") ? repairError.message : (stryCov_9fa48("2050"), repairError?.message)) || repairError), repairError);
            }
          }
          if (stryMutAct_9fa48("2053") ? repair?.applied === true : stryMutAct_9fa48("2052") ? false : stryMutAct_9fa48("2051") ? true : (stryCov_9fa48("2051", "2052", "2053"), (stryMutAct_9fa48("2054") ? repair.applied : (stryCov_9fa48("2054"), repair?.applied)) !== (stryMutAct_9fa48("2055") ? false : (stryCov_9fa48("2055"), true)))) {
            if (stryMutAct_9fa48("2056")) {
              {}
            } else {
              stryCov_9fa48("2056");
              const errors = Array.isArray(stryMutAct_9fa48("2057") ? repair.errors : (stryCov_9fa48("2057"), repair?.errors)) ? repair.errors : ADMIN_CACHE_DUMP.EMPTY;
              const detail = stryMutAct_9fa48("2060") ? (errors[NUM.ZERO] || repair?.error) && (repair?.skipped === true ? 'repair_skipped' : 'repair_not_applied') : stryMutAct_9fa48("2059") ? false : stryMutAct_9fa48("2058") ? true : (stryCov_9fa48("2058", "2059", "2060"), (stryMutAct_9fa48("2062") ? errors[NUM.ZERO] && repair?.error : stryMutAct_9fa48("2061") ? false : (stryCov_9fa48("2061", "2062"), errors[NUM.ZERO] || (stryMutAct_9fa48("2063") ? repair.error : (stryCov_9fa48("2063"), repair?.error)))) || ((stryMutAct_9fa48("2066") ? repair?.skipped !== true : stryMutAct_9fa48("2065") ? false : stryMutAct_9fa48("2064") ? true : (stryCov_9fa48("2064", "2065", "2066"), (stryMutAct_9fa48("2067") ? repair.skipped : (stryCov_9fa48("2067"), repair?.skipped)) === (stryMutAct_9fa48("2068") ? false : (stryCov_9fa48("2068"), true)))) ? stryMutAct_9fa48("2069") ? "" : (stryCov_9fa48("2069"), 'repair_skipped') : stryMutAct_9fa48("2070") ? "" : (stryCov_9fa48("2070"), 'repair_not_applied')));
              throw buildAuthoritativeControlSnapshotRepairFailure(detail);
            }
          }
          const repairedSnapshot = await this.buildLocalControlSnapshot(stryMutAct_9fa48("2071") ? {} : (stryCov_9fa48("2071"), {
            ...options,
            preferAuthoritativePublicationRead: stryMutAct_9fa48("2072") ? false : (stryCov_9fa48("2072"), true),
            reconcileAuthoritativeMembershipPublication: stryMutAct_9fa48("2073") ? false : (stryCov_9fa48("2073"), true)
          }));
          const repairedEvaluation = this.evaluateAuthoritativeControlSnapshotRepair(repairedSnapshot);
          return attachAuthoritativeRepairDiagnostics(repairedSnapshot, stryMutAct_9fa48("2074") ? {} : (stryCov_9fa48("2074"), {
            repair,
            repairEvaluation: repairedEvaluation,
            forceAuthoritativeRepair
          }));
        }
      }
      const repairEvaluation = this.evaluateAuthoritativeControlSnapshotRepair(snapshot);
      if (stryMutAct_9fa48("2077") ? false : stryMutAct_9fa48("2076") ? true : stryMutAct_9fa48("2075") ? this.canRunAuthoritativeControlSnapshotRepair() : (stryCov_9fa48("2075", "2076", "2077"), !this.canRunAuthoritativeControlSnapshotRepair())) {
        if (stryMutAct_9fa48("2078")) {
          {}
        } else {
          stryCov_9fa48("2078");
          return snapshot;
        }
      }
      if (stryMutAct_9fa48("2081") ? forceAuthoritativeRepair !== true || !shouldAttemptAuthoritativeRepair({
        repairEvaluation,
        forceAuthoritativeRepair,
        allowAuthoritativeRepair
      }) : stryMutAct_9fa48("2080") ? false : stryMutAct_9fa48("2079") ? true : (stryCov_9fa48("2079", "2080", "2081"), (stryMutAct_9fa48("2083") ? forceAuthoritativeRepair === true : stryMutAct_9fa48("2082") ? true : (stryCov_9fa48("2082", "2083"), forceAuthoritativeRepair !== (stryMutAct_9fa48("2084") ? false : (stryCov_9fa48("2084"), true)))) && (stryMutAct_9fa48("2085") ? shouldAttemptAuthoritativeRepair({
        repairEvaluation,
        forceAuthoritativeRepair,
        allowAuthoritativeRepair
      }) : (stryCov_9fa48("2085"), !shouldAttemptAuthoritativeRepair(stryMutAct_9fa48("2086") ? {} : (stryCov_9fa48("2086"), {
        repairEvaluation,
        forceAuthoritativeRepair,
        allowAuthoritativeRepair
      })))))) {
        if (stryMutAct_9fa48("2087")) {
          {}
        } else {
          stryCov_9fa48("2087");
          return snapshot;
        }
      }
      const canDegradeRepairFailure = this.canDegradeAuthoritativeControlSnapshotRepairFailure(stryMutAct_9fa48("2088") ? {} : (stryCov_9fa48("2088"), {
        forceAuthoritativeRepair,
        repairEvaluation
      }));
      let repair = null;
      try {
        if (stryMutAct_9fa48("2089")) {
          {}
        } else {
          stryCov_9fa48("2089");
          repair = await this.ensureAuthoritativeDiscoveryCacheRepair(stryMutAct_9fa48("2090") ? {} : (stryCov_9fa48("2090"), {
            reason: CONTROL_SNAPSHOT_REPAIR_REASON,
            bypassReuse: forceAuthoritativeRepair,
            triggerCodes: stryMutAct_9fa48("2091") ? repairEvaluation.triggerCodes : (stryCov_9fa48("2091"), repairEvaluation?.triggerCodes)
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("2092")) {
          {}
        } else {
          stryCov_9fa48("2092");
          if (stryMutAct_9fa48("2094") ? false : stryMutAct_9fa48("2093") ? true : (stryCov_9fa48("2093", "2094"), canDegradeRepairFailure)) {
            if (stryMutAct_9fa48("2095")) {
              {}
            } else {
              stryCov_9fa48("2095");
              return snapshot;
            }
          }
          throw buildAuthoritativeControlSnapshotRepairFailure(stryMutAct_9fa48("2098") ? (error?.message || error) && ADMIN_CONTROL_SNAPSHOT_LITERAL.UNKNOWN_ERROR : stryMutAct_9fa48("2097") ? false : stryMutAct_9fa48("2096") ? true : (stryCov_9fa48("2096", "2097", "2098"), (stryMutAct_9fa48("2100") ? error?.message && error : stryMutAct_9fa48("2099") ? false : (stryCov_9fa48("2099", "2100"), (stryMutAct_9fa48("2101") ? error.message : (stryCov_9fa48("2101"), error?.message)) || error)) || ADMIN_CONTROL_SNAPSHOT_LITERAL.UNKNOWN_ERROR), error);
        }
      }
      if (stryMutAct_9fa48("2104") ? repair?.applied === true : stryMutAct_9fa48("2103") ? false : stryMutAct_9fa48("2102") ? true : (stryCov_9fa48("2102", "2103", "2104"), (stryMutAct_9fa48("2105") ? repair.applied : (stryCov_9fa48("2105"), repair?.applied)) !== (stryMutAct_9fa48("2106") ? false : (stryCov_9fa48("2106"), true)))) {
        if (stryMutAct_9fa48("2107")) {
          {}
        } else {
          stryCov_9fa48("2107");
          if (stryMutAct_9fa48("2109") ? false : stryMutAct_9fa48("2108") ? true : (stryCov_9fa48("2108", "2109"), canDegradeRepairFailure)) {
            if (stryMutAct_9fa48("2110")) {
              {}
            } else {
              stryCov_9fa48("2110");
              return snapshot;
            }
          }
          if (stryMutAct_9fa48("2112") ? false : stryMutAct_9fa48("2111") ? true : (stryCov_9fa48("2111", "2112"), this.canDegradeAuthoritativeControlSnapshotRepairFailure(stryMutAct_9fa48("2113") ? {} : (stryCov_9fa48("2113"), {
            forceAuthoritativeRepair,
            repairEvaluation,
            repair
          })))) {
            if (stryMutAct_9fa48("2114")) {
              {}
            } else {
              stryCov_9fa48("2114");
              return snapshot;
            }
          }
          const errors = Array.isArray(stryMutAct_9fa48("2115") ? repair.errors : (stryCov_9fa48("2115"), repair?.errors)) ? repair.errors : ADMIN_CACHE_DUMP.EMPTY;
          const detail = stryMutAct_9fa48("2118") ? (errors[NUM.ZERO] || repair?.error) && (repair?.skipped === true ? 'repair_skipped' : 'repair_not_applied') : stryMutAct_9fa48("2117") ? false : stryMutAct_9fa48("2116") ? true : (stryCov_9fa48("2116", "2117", "2118"), (stryMutAct_9fa48("2120") ? errors[NUM.ZERO] && repair?.error : stryMutAct_9fa48("2119") ? false : (stryCov_9fa48("2119", "2120"), errors[NUM.ZERO] || (stryMutAct_9fa48("2121") ? repair.error : (stryCov_9fa48("2121"), repair?.error)))) || ((stryMutAct_9fa48("2124") ? repair?.skipped !== true : stryMutAct_9fa48("2123") ? false : stryMutAct_9fa48("2122") ? true : (stryCov_9fa48("2122", "2123", "2124"), (stryMutAct_9fa48("2125") ? repair.skipped : (stryCov_9fa48("2125"), repair?.skipped)) === (stryMutAct_9fa48("2126") ? false : (stryCov_9fa48("2126"), true)))) ? stryMutAct_9fa48("2127") ? "" : (stryCov_9fa48("2127"), 'repair_skipped') : stryMutAct_9fa48("2128") ? "" : (stryCov_9fa48("2128"), 'repair_not_applied')));
          throw buildAuthoritativeControlSnapshotRepairFailure(detail);
        }
      }
      const repairedSnapshot = await this.buildLocalControlSnapshot(stryMutAct_9fa48("2129") ? {} : (stryCov_9fa48("2129"), {
        ...options,
        preferAuthoritativePublicationRead: stryMutAct_9fa48("2130") ? false : (stryCov_9fa48("2130"), true),
        reconcileAuthoritativeMembershipPublication: stryMutAct_9fa48("2131") ? false : (stryCov_9fa48("2131"), true)
      }));
      const repairedEvaluation = this.evaluateAuthoritativeControlSnapshotRepair(repairedSnapshot);
      return attachAuthoritativeRepairDiagnostics(repairedSnapshot, stryMutAct_9fa48("2132") ? {} : (stryCov_9fa48("2132"), {
        repair,
        repairEvaluation: repairedEvaluation,
        forceAuthoritativeRepair
      }));
    }
  }
  canDegradeAuthoritativeControlSnapshotRepairFailure(options = {}) {
    if (stryMutAct_9fa48("2133")) {
      {}
    } else {
      stryCov_9fa48("2133");
      if (stryMutAct_9fa48("2136") ? options.forceAuthoritativeRepair !== true && hasOnlyLeaderResolutionGapRepairCause(options.repair) || isReadyLocalQueryTransportDiagnostic(options.repair?.localQueryTransport) : stryMutAct_9fa48("2135") ? false : stryMutAct_9fa48("2134") ? true : (stryCov_9fa48("2134", "2135", "2136"), (stryMutAct_9fa48("2138") ? options.forceAuthoritativeRepair !== true || hasOnlyLeaderResolutionGapRepairCause(options.repair) : stryMutAct_9fa48("2137") ? true : (stryCov_9fa48("2137", "2138"), (stryMutAct_9fa48("2140") ? options.forceAuthoritativeRepair === true : stryMutAct_9fa48("2139") ? true : (stryCov_9fa48("2139", "2140"), options.forceAuthoritativeRepair !== (stryMutAct_9fa48("2141") ? false : (stryCov_9fa48("2141"), true)))) && hasOnlyLeaderResolutionGapRepairCause(options.repair))) && isReadyLocalQueryTransportDiagnostic(stryMutAct_9fa48("2142") ? options.repair.localQueryTransport : (stryCov_9fa48("2142"), options.repair?.localQueryTransport)))) {
        if (stryMutAct_9fa48("2143")) {
          {}
        } else {
          stryCov_9fa48("2143");
          return stryMutAct_9fa48("2144") ? false : (stryCov_9fa48("2144"), true);
        }
      }
      if (stryMutAct_9fa48("2147") ? options.forceAuthoritativeRepair !== true && hasPressureOrTimeoutRepairCause(options.repair) || isReadyLocalQueryTransportDiagnostic(options.repair?.localQueryTransport) : stryMutAct_9fa48("2146") ? false : stryMutAct_9fa48("2145") ? true : (stryCov_9fa48("2145", "2146", "2147"), (stryMutAct_9fa48("2149") ? options.forceAuthoritativeRepair !== true || hasPressureOrTimeoutRepairCause(options.repair) : stryMutAct_9fa48("2148") ? true : (stryCov_9fa48("2148", "2149"), (stryMutAct_9fa48("2151") ? options.forceAuthoritativeRepair === true : stryMutAct_9fa48("2150") ? true : (stryCov_9fa48("2150", "2151"), options.forceAuthoritativeRepair !== (stryMutAct_9fa48("2152") ? false : (stryCov_9fa48("2152"), true)))) && hasPressureOrTimeoutRepairCause(options.repair))) && isReadyLocalQueryTransportDiagnostic(stryMutAct_9fa48("2153") ? options.repair.localQueryTransport : (stryCov_9fa48("2153"), options.repair?.localQueryTransport)))) {
        if (stryMutAct_9fa48("2154")) {
          {}
        } else {
          stryCov_9fa48("2154");
          return stryMutAct_9fa48("2155") ? false : (stryCov_9fa48("2155"), true);
        }
      }
      if (stryMutAct_9fa48("2158") ? hasAuthoritativeRepairTrigger(options.repairEvaluation, AUTHORITATIVE_REPAIR_TRIGGER.DISCOVERY_NODE_COVERAGE_GAP) && options.repairEvaluation?.nodeCoverage?.activeProjection?.hasCoverageGap === true : stryMutAct_9fa48("2157") ? false : stryMutAct_9fa48("2156") ? true : (stryCov_9fa48("2156", "2157", "2158"), hasAuthoritativeRepairTrigger(options.repairEvaluation, AUTHORITATIVE_REPAIR_TRIGGER.DISCOVERY_NODE_COVERAGE_GAP) || (stryMutAct_9fa48("2160") ? options.repairEvaluation?.nodeCoverage?.activeProjection?.hasCoverageGap !== true : stryMutAct_9fa48("2159") ? false : (stryCov_9fa48("2159", "2160"), (stryMutAct_9fa48("2163") ? options.repairEvaluation.nodeCoverage?.activeProjection?.hasCoverageGap : stryMutAct_9fa48("2162") ? options.repairEvaluation?.nodeCoverage.activeProjection?.hasCoverageGap : stryMutAct_9fa48("2161") ? options.repairEvaluation?.nodeCoverage?.activeProjection.hasCoverageGap : (stryCov_9fa48("2161", "2162", "2163"), options.repairEvaluation?.nodeCoverage?.activeProjection?.hasCoverageGap)) === (stryMutAct_9fa48("2164") ? false : (stryCov_9fa48("2164"), true)))))) {
        if (stryMutAct_9fa48("2165")) {
          {}
        } else {
          stryCov_9fa48("2165");
          return stryMutAct_9fa48("2166") ? true : (stryCov_9fa48("2166"), false);
        }
      }
      if (stryMutAct_9fa48("2168") ? false : stryMutAct_9fa48("2167") ? true : (stryCov_9fa48("2167", "2168"), isReplicaOperationsOnlyRepairScope(options.repairEvaluation))) {
        if (stryMutAct_9fa48("2169")) {
          {}
        } else {
          stryCov_9fa48("2169");
          return stryMutAct_9fa48("2170") ? false : (stryCov_9fa48("2170"), true);
        }
      }
      const failedTables = Array.isArray(stryMutAct_9fa48("2171") ? options.repair.failedTables : (stryCov_9fa48("2171"), options.repair?.failedTables)) ? stryMutAct_9fa48("2172") ? options.repair.failedTables : (stryCov_9fa48("2172"), options.repair.failedTables.filter(stryMutAct_9fa48("2173") ? () => undefined : (stryCov_9fa48("2173"), value => stryMutAct_9fa48("2176") ? typeof value === TYPEOF.STRING || value.length > NUM.ZERO : stryMutAct_9fa48("2175") ? false : stryMutAct_9fa48("2174") ? true : (stryCov_9fa48("2174", "2175", "2176"), (stryMutAct_9fa48("2178") ? typeof value !== TYPEOF.STRING : stryMutAct_9fa48("2177") ? true : (stryCov_9fa48("2177", "2178"), typeof value === TYPEOF.STRING)) && (stryMutAct_9fa48("2181") ? value.length <= NUM.ZERO : stryMutAct_9fa48("2180") ? value.length >= NUM.ZERO : stryMutAct_9fa48("2179") ? true : (stryCov_9fa48("2179", "2180", "2181"), value.length > NUM.ZERO)))))) : ADMIN_CACHE_DUMP.EMPTY;
      return isReplicaOperationsOnlyTableSet(failedTables);
    }
  }
  resolveControlSnapshotActiveNodeIds(nodeRows = stryMutAct_9fa48("2182") ? ["Stryker was here"] : (stryCov_9fa48("2182"), []), serviceRows = stryMutAct_9fa48("2183") ? ["Stryker was here"] : (stryCov_9fa48("2183"), []), nodeEndpointRows = stryMutAct_9fa48("2184") ? ["Stryker was here"] : (stryCov_9fa48("2184"), []), controlPlaneDiagnostics = null, publicationRows = stryMutAct_9fa48("2185") ? ["Stryker was here"] : (stryCov_9fa48("2185"), [])) {
    if (stryMutAct_9fa48("2186")) {
      {}
    } else {
      stryCov_9fa48("2186");
      return this.resolveControlSnapshotNodeViews(nodeRows, serviceRows, nodeEndpointRows, controlPlaneDiagnostics, publicationRows).authoritativeActiveNodeIds;
    }
  }
  resolveControlSnapshotNodeViews(nodeRows = stryMutAct_9fa48("2187") ? ["Stryker was here"] : (stryCov_9fa48("2187"), []), serviceRows = stryMutAct_9fa48("2188") ? ["Stryker was here"] : (stryCov_9fa48("2188"), []), nodeEndpointRows = stryMutAct_9fa48("2189") ? ["Stryker was here"] : (stryCov_9fa48("2189"), []), controlPlaneDiagnostics = null, publicationRows = stryMutAct_9fa48("2190") ? ["Stryker was here"] : (stryCov_9fa48("2190"), [])) {
    if (stryMutAct_9fa48("2191")) {
      {}
    } else {
      stryCov_9fa48("2191");
      const latestPublishedMembershipObservation = selectDurablePublishedMembershipObservation(stryMutAct_9fa48("2192") ? controlPlaneDiagnostics.publishedMembershipObservation : (stryCov_9fa48("2192"), controlPlaneDiagnostics?.publishedMembershipObservation));
      const publicationConvergence = stryMutAct_9fa48("2195") ? controlPlaneDiagnostics?.publicationConvergence && null : stryMutAct_9fa48("2194") ? false : stryMutAct_9fa48("2193") ? true : (stryCov_9fa48("2193", "2194", "2195"), (stryMutAct_9fa48("2196") ? controlPlaneDiagnostics.publicationConvergence : (stryCov_9fa48("2196"), controlPlaneDiagnostics?.publicationConvergence)) || null);
      const latestPublishedPublicationObservation = stryMutAct_9fa48("2199") ? latestPublishedMembershipObservation && selectDurablePublishedMembershipObservation(publicationConvergence) : stryMutAct_9fa48("2198") ? false : stryMutAct_9fa48("2197") ? true : (stryCov_9fa48("2197", "2198", "2199"), latestPublishedMembershipObservation || selectDurablePublishedMembershipObservation(publicationConvergence));
      const readinessByNodeId = buildReadinessByNodeId(stryMutAct_9fa48("2200") ? {} : (stryCov_9fa48("2200"), {
        readinessByNodeId: stryMutAct_9fa48("2203") ? controlPlaneDiagnostics?.readinessByNodeId && null : stryMutAct_9fa48("2202") ? false : stryMutAct_9fa48("2201") ? true : (stryCov_9fa48("2201", "2202", "2203"), (stryMutAct_9fa48("2204") ? controlPlaneDiagnostics.readinessByNodeId : (stryCov_9fa48("2204"), controlPlaneDiagnostics?.readinessByNodeId)) || null)
      }));
      const connectedNodeIds = (stryMutAct_9fa48("2207") ? this.messageRouter || typeof this.messageRouter.getConnectedNodes === TYPEOF.FUNCTION : stryMutAct_9fa48("2206") ? false : stryMutAct_9fa48("2205") ? true : (stryCov_9fa48("2205", "2206", "2207"), this.messageRouter && (stryMutAct_9fa48("2209") ? typeof this.messageRouter.getConnectedNodes !== TYPEOF.FUNCTION : stryMutAct_9fa48("2208") ? true : (stryCov_9fa48("2208", "2209"), typeof this.messageRouter.getConnectedNodes === TYPEOF.FUNCTION)))) ? this.messageRouter.getConnectedNodes() : ADMIN_CACHE_DUMP.EMPTY;
      const activeNodeViews = resolveActiveNodeViews(stryMutAct_9fa48("2210") ? {} : (stryCov_9fa48("2210"), {
        nodeRows,
        serviceRows,
        nodeEndpointRows,
        publicationRows,
        latestPublicationRow: latestPublishedPublicationObservation,
        readinessByNodeId,
        connectedNodeIds,
        localNodeId: this.nodeId,
        localNodeResponsive: stryMutAct_9fa48("2211") ? false : (stryCov_9fa48("2211"), true),
        nowMs: this.nowFn()
      }));
      return stryMutAct_9fa48("2212") ? {} : (stryCov_9fa48("2212"), {
        authoritativeSource: activeNodeViews.authoritativeSource,
        authoritativeActiveNodeIds: stryMutAct_9fa48("2213") ? [] : (stryCov_9fa48("2213"), [...activeNodeViews.authoritativeActiveNodeIds]),
        projectedServingNodeIds: stryMutAct_9fa48("2214") ? [] : (stryCov_9fa48("2214"), [...activeNodeViews.projectedServingNodeIds]),
        locallyEligibleNodeIds: stryMutAct_9fa48("2215") ? [] : (stryCov_9fa48("2215"), [...activeNodeViews.locallyEligibleNodeIds]),
        suspectedOrTransitioningNodeIds: stryMutAct_9fa48("2216") ? [] : (stryCov_9fa48("2216"), [...activeNodeViews.suspectedOrTransitioningNodeIds]),
        membershipFreeze: activeNodeViews.membershipFreeze,
        effectiveSource: activeNodeViews.effectiveSource,
        effectiveActiveNodeIds: stryMutAct_9fa48("2217") ? [] : (stryCov_9fa48("2217"), [...activeNodeViews.effectiveActiveNodeIds]),
        projectedActiveNodeIds: stryMutAct_9fa48("2218") ? [] : (stryCov_9fa48("2218"), [...activeNodeViews.projectedActiveNodeIds]),
        publishedActiveNodeIds: Array.isArray(activeNodeViews.publishedActiveNodeIds) ? stryMutAct_9fa48("2219") ? [] : (stryCov_9fa48("2219"), [...activeNodeViews.publishedActiveNodeIds]) : null,
        publishedMembershipAvailable: Array.isArray(activeNodeViews.publishedActiveNodeIds)
      });
    }
  }
  isControlSnapshotActiveNode(nodeRow, readinessByNodeId, nodeEndpointRows, options = {}) {
    if (stryMutAct_9fa48("2220")) {
      {}
    } else {
      stryCov_9fa48("2220");
      return isCanonicallyActiveNode(nodeRow, stryMutAct_9fa48("2221") ? {} : (stryCov_9fa48("2221"), {
        readinessByNodeId,
        nodeEndpointRows,
        nowMs: this.nowFn(),
        requireWebSocketEndpoint: options.requireWebSocketEndpoint
      }));
    }
  }
  hasAnyActiveWebSocketEndpoint(nodeEndpointRows = stryMutAct_9fa48("2222") ? ["Stryker was here"] : (stryCov_9fa48("2222"), [])) {
    if (stryMutAct_9fa48("2223")) {
      {}
    } else {
      stryCov_9fa48("2223");
      return hasCanonicalWebSocketEndpoints(nodeEndpointRows);
    }
  }
  hasActiveWebSocketEndpoint(nodeId, nodeEndpointRows = stryMutAct_9fa48("2224") ? ["Stryker was here"] : (stryCov_9fa48("2224"), [])) {
    if (stryMutAct_9fa48("2225")) {
      {}
    } else {
      stryCov_9fa48("2225");
      return hasCanonicalWebSocketEndpoint(nodeId, nodeEndpointRows);
    }
  }
  isActiveWebSocketEndpoint(endpointRow) {
    if (stryMutAct_9fa48("2226")) {
      {}
    } else {
      stryCov_9fa48("2226");
      return isCanonicalWebSocketEndpointRow(endpointRow);
    }
  } /**
    * Determine whether one authoritative control-snapshot repair path
    * can run with current dependencies.
    * @return {boolean}
    * @private
    */
  canRunAuthoritativeControlSnapshotRepair() {
    if (stryMutAct_9fa48("2227")) {
      {}
    } else {
      stryCov_9fa48("2227");
      return Boolean(stryMutAct_9fa48("2230") ? this.systemTableCache && typeof this.systemTableCache.getAll === TYPEOF.FUNCTION && this.cacheMutationTarget && typeof this.cacheMutationTarget.applySystemTableChange === TYPEOF.FUNCTION || this.ensureAuthoritativeDiscoveryCacheRepair : stryMutAct_9fa48("2229") ? false : stryMutAct_9fa48("2228") ? true : (stryCov_9fa48("2228", "2229", "2230"), (stryMutAct_9fa48("2232") ? this.systemTableCache && typeof this.systemTableCache.getAll === TYPEOF.FUNCTION && this.cacheMutationTarget || typeof this.cacheMutationTarget.applySystemTableChange === TYPEOF.FUNCTION : stryMutAct_9fa48("2231") ? true : (stryCov_9fa48("2231", "2232"), (stryMutAct_9fa48("2234") ? this.systemTableCache && typeof this.systemTableCache.getAll === TYPEOF.FUNCTION || this.cacheMutationTarget : stryMutAct_9fa48("2233") ? true : (stryCov_9fa48("2233", "2234"), (stryMutAct_9fa48("2236") ? this.systemTableCache || typeof this.systemTableCache.getAll === TYPEOF.FUNCTION : stryMutAct_9fa48("2235") ? true : (stryCov_9fa48("2235", "2236"), this.systemTableCache && (stryMutAct_9fa48("2238") ? typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("2237") ? true : (stryCov_9fa48("2237", "2238"), typeof this.systemTableCache.getAll === TYPEOF.FUNCTION)))) && this.cacheMutationTarget)) && (stryMutAct_9fa48("2240") ? typeof this.cacheMutationTarget.applySystemTableChange !== TYPEOF.FUNCTION : stryMutAct_9fa48("2239") ? true : (stryCov_9fa48("2239", "2240"), typeof this.cacheMutationTarget.applySystemTableChange === TYPEOF.FUNCTION)))) && this.ensureAuthoritativeDiscoveryCacheRepair));
    }
  } /**
    * Determine whether local control snapshot should attempt
    * authoritative cache repair.
    * @return {boolean}
    * @private
    */
  shouldAttemptAuthoritativeControlSnapshotRepair() {
    if (stryMutAct_9fa48("2241")) {
      {}
    } else {
      stryCov_9fa48("2241");
      return shouldAttemptAuthoritativeRepair(stryMutAct_9fa48("2242") ? {} : (stryCov_9fa48("2242"), {
        repairEvaluation: this.evaluateAuthoritativeControlSnapshotRepair(),
        allowAuthoritativeRepair: stryMutAct_9fa48("2243") ? false : (stryCov_9fa48("2243"), true)
      }));
    }
  } /**
    * Evaluate whether local control snapshot should attempt
    * authoritative cache repair.
    * @return {Object|null}
    * @private
    */
  evaluateAuthoritativeControlSnapshotRepair(snapshot = null) {
    if (stryMutAct_9fa48("2244")) {
      {}
    } else {
      stryCov_9fa48("2244");
      if (stryMutAct_9fa48("2247") ? false : stryMutAct_9fa48("2246") ? true : stryMutAct_9fa48("2245") ? this.canRunAuthoritativeControlSnapshotRepair() : (stryCov_9fa48("2245", "2246", "2247"), !this.canRunAuthoritativeControlSnapshotRepair())) {
        if (stryMutAct_9fa48("2248")) {
          {}
        } else {
          stryCov_9fa48("2248");
          return null;
        }
      }
      const capturedAt = Number.isFinite(stryMutAct_9fa48("2249") ? snapshot.capturedAt : (stryCov_9fa48("2249"), snapshot?.capturedAt)) ? snapshot.capturedAt : this.nowFn();
      const nodeRows = this.systemTableCache.getAll(TABLES.NODES);
      const tableRows = this.systemTableCache.getAll(TABLES.TABLES);
      const partitionRows = this.systemTableCache.getAll(TABLES.PARTITIONS);
      const serviceRows = this.systemTableCache.getAll(TABLES.SERVICES);
      const nodeEndpointRows = this.systemTableCache.getAll(TABLES.NODE_ENDPOINTS);
      const controlPlaneDiagnostics = stryMutAct_9fa48("2252") ? snapshot?.controlPlaneDiagnostics && null : stryMutAct_9fa48("2251") ? false : stryMutAct_9fa48("2250") ? true : (stryCov_9fa48("2250", "2251", "2252"), (stryMutAct_9fa48("2253") ? snapshot.controlPlaneDiagnostics : (stryCov_9fa48("2253"), snapshot?.controlPlaneDiagnostics)) || null);
      const topologyGap = this.hasControlSnapshotPartitionTopologyGap(tableRows, partitionRows);
      const nodeCoverage = evaluateSharedMetadataNodeCoverage(stryMutAct_9fa48("2254") ? {} : (stryCov_9fa48("2254"), {
        nodeRows,
        serviceRows,
        partitionRows,
        nodeEndpointRows
      }));
      const connectedNodeCoverage = this.evaluateConnectedNodeCoverageGap(nodeRows);
      const activeProjectionCoverage = this.evaluateActiveNodeProjectionCoverageGap(stryMutAct_9fa48("2255") ? {} : (stryCov_9fa48("2255"), {
        nodeRows,
        serviceRows,
        nodeEndpointRows,
        controlPlaneDiagnostics
      }));
      const replicaOperationRows = this.systemTableCache.getAll(TABLES.REPLICA_OPERATIONS);
      const replicaOperationSummary = this.buildControlSnapshotReplicaOperationSummary(replicaOperationRows);
      const evaluation = evaluateAuthoritativeRepairPolicy(stryMutAct_9fa48("2256") ? {} : (stryCov_9fa48("2256"), {
        cacheStalenessMs: this.resolveControlSnapshotCacheStalenessMs(nodeRows, capturedAt),
        staleThresholdMs: CONTROL_SNAPSHOT_CACHE_STALE_THRESHOLD_MS,
        nodeCoverageGap: stryMutAct_9fa48("2259") ? (nodeCoverage.hasCoverageGap || connectedNodeCoverage.hasCoverageGap) && activeProjectionCoverage.hasCoverageGap : stryMutAct_9fa48("2258") ? false : stryMutAct_9fa48("2257") ? true : (stryCov_9fa48("2257", "2258", "2259"), (stryMutAct_9fa48("2261") ? nodeCoverage.hasCoverageGap && connectedNodeCoverage.hasCoverageGap : stryMutAct_9fa48("2260") ? false : (stryCov_9fa48("2260", "2261"), nodeCoverage.hasCoverageGap || connectedNodeCoverage.hasCoverageGap)) || activeProjectionCoverage.hasCoverageGap),
        topologyGap,
        staleReplicaOpsInFlightCount: replicaOperationSummary.staleInFlightCount
      }));
      return Object.freeze(stryMutAct_9fa48("2262") ? {} : (stryCov_9fa48("2262"), {
        ...evaluation,
        nodeCoverage: Object.freeze(stryMutAct_9fa48("2263") ? {} : (stryCov_9fa48("2263"), {
          sharedMetadata: nodeCoverage,
          connectedNodes: connectedNodeCoverage,
          activeProjection: activeProjectionCoverage
        }))
      }));
    }
  }
  evaluateConnectedNodeCoverageGap(nodeRows = stryMutAct_9fa48("2264") ? ["Stryker was here"] : (stryCov_9fa48("2264"), [])) {
    if (stryMutAct_9fa48("2265")) {
      {}
    } else {
      stryCov_9fa48("2265");
      if (stryMutAct_9fa48("2268") ? !this.messageRouter && typeof this.messageRouter.getConnectedNodes !== TYPEOF.FUNCTION : stryMutAct_9fa48("2267") ? false : stryMutAct_9fa48("2266") ? true : (stryCov_9fa48("2266", "2267", "2268"), (stryMutAct_9fa48("2269") ? this.messageRouter : (stryCov_9fa48("2269"), !this.messageRouter)) || (stryMutAct_9fa48("2271") ? typeof this.messageRouter.getConnectedNodes === TYPEOF.FUNCTION : stryMutAct_9fa48("2270") ? false : (stryCov_9fa48("2270", "2271"), typeof this.messageRouter.getConnectedNodes !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("2272")) {
          {}
        } else {
          stryCov_9fa48("2272");
          return Object.freeze(stryMutAct_9fa48("2273") ? {} : (stryCov_9fa48("2273"), {
            hasCoverageGap: stryMutAct_9fa48("2274") ? true : (stryCov_9fa48("2274"), false),
            missingNodeIds: Object.freeze(stryMutAct_9fa48("2275") ? ["Stryker was here"] : (stryCov_9fa48("2275"), []))
          }));
        }
      }
      const observedNodeIds = new Set();
      for (const nodeRow of Array.isArray(nodeRows) ? nodeRows : stryMutAct_9fa48("2276") ? ["Stryker was here"] : (stryCov_9fa48("2276"), [])) {
        if (stryMutAct_9fa48("2277")) {
          {}
        } else {
          stryCov_9fa48("2277");
          const nodeId = firstStringField(nodeRow, COLUMN.NODE_ID, stryMutAct_9fa48("2278") ? "" : (stryCov_9fa48("2278"), 'node_id'), stryMutAct_9fa48("2279") ? "" : (stryCov_9fa48("2279"), 'nodeId'), stryMutAct_9fa48("2280") ? "" : (stryCov_9fa48("2280"), 'id'));
          if (stryMutAct_9fa48("2282") ? false : stryMutAct_9fa48("2281") ? true : (stryCov_9fa48("2281", "2282"), nodeId)) {
            if (stryMutAct_9fa48("2283")) {
              {}
            } else {
              stryCov_9fa48("2283");
              observedNodeIds.add(nodeId);
            }
          }
        }
      }
      const connectedNodeIds = uniqueSorted(stryMutAct_9fa48("2284") ? this.messageRouter.getConnectedNodes() || [] : (stryCov_9fa48("2284"), (stryMutAct_9fa48("2287") ? this.messageRouter.getConnectedNodes() && [] : stryMutAct_9fa48("2286") ? false : stryMutAct_9fa48("2285") ? true : (stryCov_9fa48("2285", "2286", "2287"), this.messageRouter.getConnectedNodes() || (stryMutAct_9fa48("2288") ? ["Stryker was here"] : (stryCov_9fa48("2288"), [])))).filter(stryMutAct_9fa48("2289") ? () => undefined : (stryCov_9fa48("2289"), nodeId => stryMutAct_9fa48("2292") ? typeof nodeId === TYPEOF.STRING && nodeId.length > NUM.ZERO || nodeId !== this.nodeId : stryMutAct_9fa48("2291") ? false : stryMutAct_9fa48("2290") ? true : (stryCov_9fa48("2290", "2291", "2292"), (stryMutAct_9fa48("2294") ? typeof nodeId === TYPEOF.STRING || nodeId.length > NUM.ZERO : stryMutAct_9fa48("2293") ? true : (stryCov_9fa48("2293", "2294"), (stryMutAct_9fa48("2296") ? typeof nodeId !== TYPEOF.STRING : stryMutAct_9fa48("2295") ? true : (stryCov_9fa48("2295", "2296"), typeof nodeId === TYPEOF.STRING)) && (stryMutAct_9fa48("2299") ? nodeId.length <= NUM.ZERO : stryMutAct_9fa48("2298") ? nodeId.length >= NUM.ZERO : stryMutAct_9fa48("2297") ? true : (stryCov_9fa48("2297", "2298", "2299"), nodeId.length > NUM.ZERO)))) && (stryMutAct_9fa48("2301") ? nodeId === this.nodeId : stryMutAct_9fa48("2300") ? true : (stryCov_9fa48("2300", "2301"), nodeId !== this.nodeId)))))));
      const missingNodeIds = stryMutAct_9fa48("2302") ? connectedNodeIds : (stryCov_9fa48("2302"), connectedNodeIds.filter(stryMutAct_9fa48("2303") ? () => undefined : (stryCov_9fa48("2303"), nodeId => stryMutAct_9fa48("2304") ? observedNodeIds.has(nodeId) : (stryCov_9fa48("2304"), !observedNodeIds.has(nodeId)))));
      return Object.freeze(stryMutAct_9fa48("2305") ? {} : (stryCov_9fa48("2305"), {
        hasCoverageGap: stryMutAct_9fa48("2309") ? missingNodeIds.length <= NUM.ZERO : stryMutAct_9fa48("2308") ? missingNodeIds.length >= NUM.ZERO : stryMutAct_9fa48("2307") ? false : stryMutAct_9fa48("2306") ? true : (stryCov_9fa48("2306", "2307", "2308", "2309"), missingNodeIds.length > NUM.ZERO),
        missingNodeIds: Object.freeze(missingNodeIds)
      }));
    }
  }
  evaluateActiveNodeProjectionCoverageGap(options = {}) {
    if (stryMutAct_9fa48("2310")) {
      {}
    } else {
      stryCov_9fa48("2310");
      const nodeRows = Array.isArray(options.nodeRows) ? options.nodeRows : ADMIN_CACHE_DUMP.EMPTY;
      const serviceRows = Array.isArray(options.serviceRows) ? options.serviceRows : ADMIN_CACHE_DUMP.EMPTY;
      const nodeEndpointRows = Array.isArray(options.nodeEndpointRows) ? options.nodeEndpointRows : ADMIN_CACHE_DUMP.EMPTY;
      const readinessByNodeId = buildReadinessByNodeId(stryMutAct_9fa48("2311") ? {} : (stryCov_9fa48("2311"), {
        readinessByNodeId: stryMutAct_9fa48("2314") ? options.controlPlaneDiagnostics?.readinessByNodeId && null : stryMutAct_9fa48("2313") ? false : stryMutAct_9fa48("2312") ? true : (stryCov_9fa48("2312", "2313", "2314"), (stryMutAct_9fa48("2315") ? options.controlPlaneDiagnostics.readinessByNodeId : (stryCov_9fa48("2315"), options.controlPlaneDiagnostics?.readinessByNodeId)) || null)
      }));
      const activeNodeViews = this.resolveControlSnapshotNodeViews(nodeRows, serviceRows, nodeEndpointRows, stryMutAct_9fa48("2318") ? options.controlPlaneDiagnostics && null : stryMutAct_9fa48("2317") ? false : stryMutAct_9fa48("2316") ? true : (stryCov_9fa48("2316", "2317", "2318"), options.controlPlaneDiagnostics || null));
      const activeNodeIds = new Set(activeNodeViews.projectedActiveNodeIds);
      const visibleNodeIds = new Set();
      for (const [nodeId, readinessEntry] of Object.entries(stryMutAct_9fa48("2321") ? readinessByNodeId && {} : stryMutAct_9fa48("2320") ? false : stryMutAct_9fa48("2319") ? true : (stryCov_9fa48("2319", "2320", "2321"), readinessByNodeId || {}))) {
        if (stryMutAct_9fa48("2322")) {
          {}
        } else {
          stryCov_9fa48("2322");
          const readinessDimensions = (stryMutAct_9fa48("2325") ? readinessEntry?.dimensions || typeof readinessEntry.dimensions === TYPEOF.OBJECT : stryMutAct_9fa48("2324") ? false : stryMutAct_9fa48("2323") ? true : (stryCov_9fa48("2323", "2324", "2325"), (stryMutAct_9fa48("2326") ? readinessEntry.dimensions : (stryCov_9fa48("2326"), readinessEntry?.dimensions)) && (stryMutAct_9fa48("2328") ? typeof readinessEntry.dimensions !== TYPEOF.OBJECT : stryMutAct_9fa48("2327") ? true : (stryCov_9fa48("2327", "2328"), typeof readinessEntry.dimensions === TYPEOF.OBJECT)))) ? readinessEntry.dimensions : null;
          if (stryMutAct_9fa48("2331") ? !readinessDimensions && readinessDimensions[CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY] !== true : stryMutAct_9fa48("2330") ? false : stryMutAct_9fa48("2329") ? true : (stryCov_9fa48("2329", "2330", "2331"), (stryMutAct_9fa48("2332") ? readinessDimensions : (stryCov_9fa48("2332"), !readinessDimensions)) || (stryMutAct_9fa48("2334") ? readinessDimensions[CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY] === true : stryMutAct_9fa48("2333") ? false : (stryCov_9fa48("2333", "2334"), readinessDimensions[CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY] !== (stryMutAct_9fa48("2335") ? false : (stryCov_9fa48("2335"), true)))))) {
            if (stryMutAct_9fa48("2336")) {
              {}
            } else {
              stryCov_9fa48("2336");
              continue;
            }
          }
          visibleNodeIds.add(nodeId);
        }
      }
      for (const endpointRow of nodeEndpointRows) {
        if (stryMutAct_9fa48("2337")) {
          {}
        } else {
          stryCov_9fa48("2337");
          if (stryMutAct_9fa48("2340") ? false : stryMutAct_9fa48("2339") ? true : stryMutAct_9fa48("2338") ? this.isActiveWebSocketEndpoint(endpointRow) : (stryCov_9fa48("2338", "2339", "2340"), !this.isActiveWebSocketEndpoint(endpointRow))) {
            if (stryMutAct_9fa48("2341")) {
              {}
            } else {
              stryCov_9fa48("2341");
              continue;
            }
          }
          const nodeId = firstStringField(endpointRow, COLUMN.NODE_ID, stryMutAct_9fa48("2342") ? "" : (stryCov_9fa48("2342"), 'node_id'), stryMutAct_9fa48("2343") ? "" : (stryCov_9fa48("2343"), 'nodeId'));
          if (stryMutAct_9fa48("2345") ? false : stryMutAct_9fa48("2344") ? true : (stryCov_9fa48("2344", "2345"), nodeId)) {
            if (stryMutAct_9fa48("2346")) {
              {}
            } else {
              stryCov_9fa48("2346");
              visibleNodeIds.add(nodeId);
            }
          }
        }
      }
      if (stryMutAct_9fa48("2349") ? this.messageRouter || typeof this.messageRouter.getConnectedNodes === TYPEOF.FUNCTION : stryMutAct_9fa48("2348") ? false : stryMutAct_9fa48("2347") ? true : (stryCov_9fa48("2347", "2348", "2349"), this.messageRouter && (stryMutAct_9fa48("2351") ? typeof this.messageRouter.getConnectedNodes !== TYPEOF.FUNCTION : stryMutAct_9fa48("2350") ? true : (stryCov_9fa48("2350", "2351"), typeof this.messageRouter.getConnectedNodes === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("2352")) {
          {}
        } else {
          stryCov_9fa48("2352");
          for (const nodeId of stryMutAct_9fa48("2355") ? this.messageRouter.getConnectedNodes() && [] : stryMutAct_9fa48("2354") ? false : stryMutAct_9fa48("2353") ? true : (stryCov_9fa48("2353", "2354", "2355"), this.messageRouter.getConnectedNodes() || (stryMutAct_9fa48("2356") ? ["Stryker was here"] : (stryCov_9fa48("2356"), [])))) {
            if (stryMutAct_9fa48("2357")) {
              {}
            } else {
              stryCov_9fa48("2357");
              if (stryMutAct_9fa48("2360") ? typeof nodeId === TYPEOF.STRING || nodeId.length > NUM.ZERO : stryMutAct_9fa48("2359") ? false : stryMutAct_9fa48("2358") ? true : (stryCov_9fa48("2358", "2359", "2360"), (stryMutAct_9fa48("2362") ? typeof nodeId !== TYPEOF.STRING : stryMutAct_9fa48("2361") ? true : (stryCov_9fa48("2361", "2362"), typeof nodeId === TYPEOF.STRING)) && (stryMutAct_9fa48("2365") ? nodeId.length <= NUM.ZERO : stryMutAct_9fa48("2364") ? nodeId.length >= NUM.ZERO : stryMutAct_9fa48("2363") ? true : (stryCov_9fa48("2363", "2364", "2365"), nodeId.length > NUM.ZERO)))) {
                if (stryMutAct_9fa48("2366")) {
                  {}
                } else {
                  stryCov_9fa48("2366");
                  visibleNodeIds.add(nodeId);
                }
              }
            }
          }
        }
      }
      const missingNodeIds = uniqueSorted(stryMutAct_9fa48("2367") ? [...visibleNodeIds] : (stryCov_9fa48("2367"), (stryMutAct_9fa48("2368") ? [] : (stryCov_9fa48("2368"), [...visibleNodeIds])).filter(stryMutAct_9fa48("2369") ? () => undefined : (stryCov_9fa48("2369"), nodeId => stryMutAct_9fa48("2370") ? activeNodeIds.has(nodeId) : (stryCov_9fa48("2370"), !activeNodeIds.has(nodeId))))));
      return Object.freeze(stryMutAct_9fa48("2371") ? {} : (stryCov_9fa48("2371"), {
        hasCoverageGap: stryMutAct_9fa48("2375") ? missingNodeIds.length <= NUM.ZERO : stryMutAct_9fa48("2374") ? missingNodeIds.length >= NUM.ZERO : stryMutAct_9fa48("2373") ? false : stryMutAct_9fa48("2372") ? true : (stryCov_9fa48("2372", "2373", "2374", "2375"), missingNodeIds.length > NUM.ZERO),
        missingNodeIds: Object.freeze(missingNodeIds)
      }));
    }
  } /**
    * Detect local partition-topology gaps that indicate stale cache
    * state for control snapshot consumers.
    * @param {Array<Object>} tableRows
    * @param {Array<Object>} partitionRows
    * @return {boolean}
    * @private
    */
  hasControlSnapshotPartitionTopologyGap(tableRows, partitionRows) {
    if (stryMutAct_9fa48("2376")) {
      {}
    } else {
      stryCov_9fa48("2376");
      const normalizedTableRows = Array.isArray(tableRows) ? tableRows : ADMIN_CACHE_DUMP.EMPTY;
      const normalizedPartitionRows = Array.isArray(partitionRows) ? partitionRows : ADMIN_CACHE_DUMP.EMPTY;
      if (stryMutAct_9fa48("2379") ? normalizedTableRows.length === NUM.ZERO && normalizedPartitionRows.length === NUM.ZERO : stryMutAct_9fa48("2378") ? false : stryMutAct_9fa48("2377") ? true : (stryCov_9fa48("2377", "2378", "2379"), (stryMutAct_9fa48("2381") ? normalizedTableRows.length !== NUM.ZERO : stryMutAct_9fa48("2380") ? false : (stryCov_9fa48("2380", "2381"), normalizedTableRows.length === NUM.ZERO)) || (stryMutAct_9fa48("2383") ? normalizedPartitionRows.length !== NUM.ZERO : stryMutAct_9fa48("2382") ? false : (stryCov_9fa48("2382", "2383"), normalizedPartitionRows.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("2384")) {
          {}
        } else {
          stryCov_9fa48("2384");
          return stryMutAct_9fa48("2385") ? true : (stryCov_9fa48("2385"), false);
        }
      }
      const partitionIds = new Set();
      const activePartitionCountByTableVersion = new Map();
      for (const partitionRow of normalizedPartitionRows) {
        if (stryMutAct_9fa48("2386")) {
          {}
        } else {
          stryCov_9fa48("2386");
          const partitionId = firstStringField(partitionRow, COLUMN.PARTITION_ID, stryMutAct_9fa48("2387") ? "" : (stryCov_9fa48("2387"), 'id'));
          if (stryMutAct_9fa48("2389") ? false : stryMutAct_9fa48("2388") ? true : (stryCov_9fa48("2388", "2389"), partitionId)) {
            if (stryMutAct_9fa48("2390")) {
              {}
            } else {
              stryCov_9fa48("2390");
              partitionIds.add(partitionId);
            }
          }
          const tableId = firstStringField(partitionRow, COLUMN.TABLE_ID);
          const partitionVersion = Number(stryMutAct_9fa48("2391") ? partitionRow?.partition_version && partitionRow?.partitionVersion : (stryCov_9fa48("2391"), (stryMutAct_9fa48("2392") ? partitionRow.partition_version : (stryCov_9fa48("2392"), partitionRow?.partition_version)) ?? (stryMutAct_9fa48("2393") ? partitionRow.partitionVersion : (stryCov_9fa48("2393"), partitionRow?.partitionVersion))));
          if (stryMutAct_9fa48("2396") ? (!tableId || !Number.isInteger(partitionVersion)) && partitionVersion < NUM.ONE : stryMutAct_9fa48("2395") ? false : stryMutAct_9fa48("2394") ? true : (stryCov_9fa48("2394", "2395", "2396"), (stryMutAct_9fa48("2398") ? !tableId && !Number.isInteger(partitionVersion) : stryMutAct_9fa48("2397") ? false : (stryCov_9fa48("2397", "2398"), (stryMutAct_9fa48("2399") ? tableId : (stryCov_9fa48("2399"), !tableId)) || (stryMutAct_9fa48("2400") ? Number.isInteger(partitionVersion) : (stryCov_9fa48("2400"), !Number.isInteger(partitionVersion))))) || (stryMutAct_9fa48("2403") ? partitionVersion >= NUM.ONE : stryMutAct_9fa48("2402") ? partitionVersion <= NUM.ONE : stryMutAct_9fa48("2401") ? false : (stryCov_9fa48("2401", "2402", "2403"), partitionVersion < NUM.ONE)))) {
            if (stryMutAct_9fa48("2404")) {
              {}
            } else {
              stryCov_9fa48("2404");
              continue;
            }
          }
          const state = stryMutAct_9fa48("2405") ? String(partitionRow?.state ?? partitionRow?.partition_state ?? PARTITION_STATE_NORMAL).toLowerCase() : (stryCov_9fa48("2405"), String(stryMutAct_9fa48("2406") ? (partitionRow?.state ?? partitionRow?.partition_state) && PARTITION_STATE_NORMAL : (stryCov_9fa48("2406"), (stryMutAct_9fa48("2407") ? partitionRow?.state && partitionRow?.partition_state : (stryCov_9fa48("2407"), (stryMutAct_9fa48("2408") ? partitionRow.state : (stryCov_9fa48("2408"), partitionRow?.state)) ?? (stryMutAct_9fa48("2409") ? partitionRow.partition_state : (stryCov_9fa48("2409"), partitionRow?.partition_state)))) ?? PARTITION_STATE_NORMAL)).toUpperCase());
          if (stryMutAct_9fa48("2412") ? state === PARTITION_STATE_NORMAL : stryMutAct_9fa48("2411") ? false : stryMutAct_9fa48("2410") ? true : (stryCov_9fa48("2410", "2411", "2412"), state !== PARTITION_STATE_NORMAL)) {
            if (stryMutAct_9fa48("2413")) {
              {}
            } else {
              stryCov_9fa48("2413");
              continue;
            }
          }
          const key = stryMutAct_9fa48("2414") ? `` : (stryCov_9fa48("2414"), `${tableId}:${partitionVersion}`);
          activePartitionCountByTableVersion.set(key, stryMutAct_9fa48("2415") ? (activePartitionCountByTableVersion.get(key) || NUM.ZERO) - NUM.ONE : (stryCov_9fa48("2415"), (stryMutAct_9fa48("2418") ? activePartitionCountByTableVersion.get(key) && NUM.ZERO : stryMutAct_9fa48("2417") ? false : stryMutAct_9fa48("2416") ? true : (stryCov_9fa48("2416", "2417", "2418"), activePartitionCountByTableVersion.get(key) || NUM.ZERO)) + NUM.ONE));
        }
      }
      for (const tableRow of normalizedTableRows) {
        if (stryMutAct_9fa48("2419")) {
          {}
        } else {
          stryCov_9fa48("2419");
          const tableId = firstStringField(tableRow, COLUMN.TABLE_ID, stryMutAct_9fa48("2420") ? "" : (stryCov_9fa48("2420"), 'id'));
          if (stryMutAct_9fa48("2423") ? false : stryMutAct_9fa48("2422") ? true : stryMutAct_9fa48("2421") ? tableId : (stryCov_9fa48("2421", "2422", "2423"), !tableId)) {
            if (stryMutAct_9fa48("2424")) {
              {}
            } else {
              stryCov_9fa48("2424");
              continue;
            }
          }
          const activePartitionVersion = Number(stryMutAct_9fa48("2425") ? tableRow?.active_partition_version && tableRow?.activePartitionVersion : (stryCov_9fa48("2425"), (stryMutAct_9fa48("2426") ? tableRow.active_partition_version : (stryCov_9fa48("2426"), tableRow?.active_partition_version)) ?? (stryMutAct_9fa48("2427") ? tableRow.activePartitionVersion : (stryCov_9fa48("2427"), tableRow?.activePartitionVersion))));
          const expectedPartitionCount = Number(stryMutAct_9fa48("2428") ? tableRow?.partition_count && tableRow?.partitionCount : (stryCov_9fa48("2428"), (stryMutAct_9fa48("2429") ? tableRow.partition_count : (stryCov_9fa48("2429"), tableRow?.partition_count)) ?? (stryMutAct_9fa48("2430") ? tableRow.partitionCount : (stryCov_9fa48("2430"), tableRow?.partitionCount))));
          if (stryMutAct_9fa48("2433") ? Number.isInteger(activePartitionVersion) && activePartitionVersion >= NUM.ONE && Number.isInteger(expectedPartitionCount) || expectedPartitionCount > NUM.ZERO : stryMutAct_9fa48("2432") ? false : stryMutAct_9fa48("2431") ? true : (stryCov_9fa48("2431", "2432", "2433"), (stryMutAct_9fa48("2435") ? Number.isInteger(activePartitionVersion) && activePartitionVersion >= NUM.ONE || Number.isInteger(expectedPartitionCount) : stryMutAct_9fa48("2434") ? true : (stryCov_9fa48("2434", "2435"), (stryMutAct_9fa48("2437") ? Number.isInteger(activePartitionVersion) || activePartitionVersion >= NUM.ONE : stryMutAct_9fa48("2436") ? true : (stryCov_9fa48("2436", "2437"), Number.isInteger(activePartitionVersion) && (stryMutAct_9fa48("2440") ? activePartitionVersion < NUM.ONE : stryMutAct_9fa48("2439") ? activePartitionVersion > NUM.ONE : stryMutAct_9fa48("2438") ? true : (stryCov_9fa48("2438", "2439", "2440"), activePartitionVersion >= NUM.ONE)))) && Number.isInteger(expectedPartitionCount))) && (stryMutAct_9fa48("2443") ? expectedPartitionCount <= NUM.ZERO : stryMutAct_9fa48("2442") ? expectedPartitionCount >= NUM.ZERO : stryMutAct_9fa48("2441") ? true : (stryCov_9fa48("2441", "2442", "2443"), expectedPartitionCount > NUM.ZERO)))) {
            if (stryMutAct_9fa48("2444")) {
              {}
            } else {
              stryCov_9fa48("2444");
              const key = stryMutAct_9fa48("2445") ? `` : (stryCov_9fa48("2445"), `${tableId}:${activePartitionVersion}`);
              const observedPartitionCount = stryMutAct_9fa48("2448") ? activePartitionCountByTableVersion.get(key) && NUM.ZERO : stryMutAct_9fa48("2447") ? false : stryMutAct_9fa48("2446") ? true : (stryCov_9fa48("2446", "2447", "2448"), activePartitionCountByTableVersion.get(key) || NUM.ZERO);
              if (stryMutAct_9fa48("2451") ? observedPartitionCount === expectedPartitionCount : stryMutAct_9fa48("2450") ? false : stryMutAct_9fa48("2449") ? true : (stryCov_9fa48("2449", "2450", "2451"), observedPartitionCount !== expectedPartitionCount)) {
                if (stryMutAct_9fa48("2452")) {
                  {}
                } else {
                  stryCov_9fa48("2452");
                  return stryMutAct_9fa48("2453") ? false : (stryCov_9fa48("2453"), true);
                }
              }
            }
          }
          const transitionMetadata = this.parseWorkflowTransitionMetadata(tableRow);
          const targetPartitionIds = Array.isArray(stryMutAct_9fa48("2454") ? transitionMetadata[PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS] : (stryCov_9fa48("2454"), transitionMetadata?.[PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS])) ? transitionMetadata[PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS] : ADMIN_CACHE_DUMP.EMPTY;
          for (const targetPartitionId of targetPartitionIds) {
            if (stryMutAct_9fa48("2455")) {
              {}
            } else {
              stryCov_9fa48("2455");
              const normalizedTargetPartitionId = String(stryMutAct_9fa48("2458") ? targetPartitionId && '' : stryMutAct_9fa48("2457") ? false : stryMutAct_9fa48("2456") ? true : (stryCov_9fa48("2456", "2457", "2458"), targetPartitionId || (stryMutAct_9fa48("2459") ? "Stryker was here!" : (stryCov_9fa48("2459"), ''))));
              if (stryMutAct_9fa48("2462") ? false : stryMutAct_9fa48("2461") ? true : stryMutAct_9fa48("2460") ? normalizedTargetPartitionId : (stryCov_9fa48("2460", "2461", "2462"), !normalizedTargetPartitionId)) {
                if (stryMutAct_9fa48("2463")) {
                  {}
                } else {
                  stryCov_9fa48("2463");
                  continue;
                }
              }
              if (stryMutAct_9fa48("2466") ? false : stryMutAct_9fa48("2465") ? true : stryMutAct_9fa48("2464") ? partitionIds.has(normalizedTargetPartitionId) : (stryCov_9fa48("2464", "2465", "2466"), !partitionIds.has(normalizedTargetPartitionId))) {
                if (stryMutAct_9fa48("2467")) {
                  {}
                } else {
                  stryCov_9fa48("2467");
                  return stryMutAct_9fa48("2468") ? false : (stryCov_9fa48("2468"), true);
                }
              }
            }
          }
        }
      }
      return stryMutAct_9fa48("2469") ? true : (stryCov_9fa48("2469"), false);
    }
  } /**
    * Compute local cache staleness for active node heartbeat rows.
    * Stale live-node rows indicate the control snapshot should rebuild from
    * the authoritative owner path before consumers trust the local projection.
    * @param {Array<Object>} nodeRows
    * @param {number} capturedAtMs
    * @return {number}
    * @private
    */
  resolveControlSnapshotCacheStalenessMs(nodeRows = stryMutAct_9fa48("2470") ? ["Stryker was here"] : (stryCov_9fa48("2470"), []), capturedAtMs = null) {
    if (stryMutAct_9fa48("2471")) {
      {}
    } else {
      stryCov_9fa48("2471");
      const observedAtMs = Number.isFinite(capturedAtMs) ? capturedAtMs : this.nowFn();
      let maxStalenessMs = NUM.ZERO;
      for (const nodeRow of Array.isArray(nodeRows) ? nodeRows : stryMutAct_9fa48("2472") ? ["Stryker was here"] : (stryCov_9fa48("2472"), [])) {
        if (stryMutAct_9fa48("2473")) {
          {}
        } else {
          stryCov_9fa48("2473");
          const status = stryMutAct_9fa48("2474") ? String(firstStringField(nodeRow, COLUMN.STATUS, 'status') || '').toUpperCase() : (stryCov_9fa48("2474"), String(stryMutAct_9fa48("2477") ? firstStringField(nodeRow, COLUMN.STATUS, 'status') && '' : stryMutAct_9fa48("2476") ? false : stryMutAct_9fa48("2475") ? true : (stryCov_9fa48("2475", "2476", "2477"), firstStringField(nodeRow, COLUMN.STATUS, stryMutAct_9fa48("2478") ? "" : (stryCov_9fa48("2478"), 'status')) || (stryMutAct_9fa48("2479") ? "Stryker was here!" : (stryCov_9fa48("2479"), '')))).toLowerCase());
          const connectionState = stryMutAct_9fa48("2480") ? String(firstStringField(nodeRow, COLUMN.CONNECTION_STATE, 'connection_state', 'connectionState') || '').toUpperCase() : (stryCov_9fa48("2480"), String(stryMutAct_9fa48("2483") ? firstStringField(nodeRow, COLUMN.CONNECTION_STATE, 'connection_state', 'connectionState') && '' : stryMutAct_9fa48("2482") ? false : stryMutAct_9fa48("2481") ? true : (stryCov_9fa48("2481", "2482", "2483"), firstStringField(nodeRow, COLUMN.CONNECTION_STATE, stryMutAct_9fa48("2484") ? "" : (stryCov_9fa48("2484"), 'connection_state'), stryMutAct_9fa48("2485") ? "" : (stryCov_9fa48("2485"), 'connectionState')) || (stryMutAct_9fa48("2486") ? "Stryker was here!" : (stryCov_9fa48("2486"), '')))).toLowerCase());
          const considerForStaleness = stryMutAct_9fa48("2489") ? (status === STATUS_ACTIVE || connectionState === 'ready') && connectionState === 'connected' : stryMutAct_9fa48("2488") ? false : stryMutAct_9fa48("2487") ? true : (stryCov_9fa48("2487", "2488", "2489"), (stryMutAct_9fa48("2491") ? status === STATUS_ACTIVE && connectionState === 'ready' : stryMutAct_9fa48("2490") ? false : (stryCov_9fa48("2490", "2491"), (stryMutAct_9fa48("2493") ? status !== STATUS_ACTIVE : stryMutAct_9fa48("2492") ? false : (stryCov_9fa48("2492", "2493"), status === STATUS_ACTIVE)) || (stryMutAct_9fa48("2495") ? connectionState !== 'ready' : stryMutAct_9fa48("2494") ? false : (stryCov_9fa48("2494", "2495"), connectionState === (stryMutAct_9fa48("2496") ? "" : (stryCov_9fa48("2496"), 'ready')))))) || (stryMutAct_9fa48("2498") ? connectionState !== 'connected' : stryMutAct_9fa48("2497") ? false : (stryCov_9fa48("2497", "2498"), connectionState === (stryMutAct_9fa48("2499") ? "" : (stryCov_9fa48("2499"), 'connected')))));
          if (stryMutAct_9fa48("2502") ? false : stryMutAct_9fa48("2501") ? true : stryMutAct_9fa48("2500") ? considerForStaleness : (stryCov_9fa48("2500", "2501", "2502"), !considerForStaleness)) {
            if (stryMutAct_9fa48("2503")) {
              {}
            } else {
              stryCov_9fa48("2503");
              continue;
            }
          }
          const lastHeartbeatMs = Number(stryMutAct_9fa48("2504") ? (nodeRow?.[COLUMN.LAST_HEARTBEAT] ?? nodeRow?.last_heartbeat ?? nodeRow?.updated_at ?? nodeRow?.updatedAt ?? nodeRow?.created_at) && nodeRow?.createdAt : (stryCov_9fa48("2504"), (stryMutAct_9fa48("2505") ? (nodeRow?.[COLUMN.LAST_HEARTBEAT] ?? nodeRow?.last_heartbeat ?? nodeRow?.updated_at ?? nodeRow?.updatedAt) && nodeRow?.created_at : (stryCov_9fa48("2505"), (stryMutAct_9fa48("2506") ? (nodeRow?.[COLUMN.LAST_HEARTBEAT] ?? nodeRow?.last_heartbeat ?? nodeRow?.updated_at) && nodeRow?.updatedAt : (stryCov_9fa48("2506"), (stryMutAct_9fa48("2507") ? (nodeRow?.[COLUMN.LAST_HEARTBEAT] ?? nodeRow?.last_heartbeat) && nodeRow?.updated_at : (stryCov_9fa48("2507"), (stryMutAct_9fa48("2508") ? nodeRow?.[COLUMN.LAST_HEARTBEAT] && nodeRow?.last_heartbeat : (stryCov_9fa48("2508"), (stryMutAct_9fa48("2509") ? nodeRow[COLUMN.LAST_HEARTBEAT] : (stryCov_9fa48("2509"), nodeRow?.[COLUMN.LAST_HEARTBEAT])) ?? (stryMutAct_9fa48("2510") ? nodeRow.last_heartbeat : (stryCov_9fa48("2510"), nodeRow?.last_heartbeat)))) ?? (stryMutAct_9fa48("2511") ? nodeRow.updated_at : (stryCov_9fa48("2511"), nodeRow?.updated_at)))) ?? (stryMutAct_9fa48("2512") ? nodeRow.updatedAt : (stryCov_9fa48("2512"), nodeRow?.updatedAt)))) ?? (stryMutAct_9fa48("2513") ? nodeRow.created_at : (stryCov_9fa48("2513"), nodeRow?.created_at)))) ?? (stryMutAct_9fa48("2514") ? nodeRow.createdAt : (stryCov_9fa48("2514"), nodeRow?.createdAt))));
          if (stryMutAct_9fa48("2517") ? false : stryMutAct_9fa48("2516") ? true : stryMutAct_9fa48("2515") ? Number.isFinite(lastHeartbeatMs) : (stryCov_9fa48("2515", "2516", "2517"), !Number.isFinite(lastHeartbeatMs))) {
            if (stryMutAct_9fa48("2518")) {
              {}
            } else {
              stryCov_9fa48("2518");
              return Number.POSITIVE_INFINITY;
            }
          }
          maxStalenessMs = stryMutAct_9fa48("2519") ? Math.min(maxStalenessMs, Math.max(NUM.ZERO, observedAtMs - lastHeartbeatMs)) : (stryCov_9fa48("2519"), Math.max(maxStalenessMs, stryMutAct_9fa48("2520") ? Math.min(NUM.ZERO, observedAtMs - lastHeartbeatMs) : (stryCov_9fa48("2520"), Math.max(NUM.ZERO, stryMutAct_9fa48("2521") ? observedAtMs + lastHeartbeatMs : (stryCov_9fa48("2521"), observedAtMs - lastHeartbeatMs)))));
        }
      }
      return maxStalenessMs;
    }
  } /**
    * Build structured control-plane diagnostics for admin snapshots.
    * @param {Object} [options={}]
    * @return {Promise<Object>}
    */
  async buildControlPlaneDiagnosticsSnapshot(options = {}) {
    if (stryMutAct_9fa48("2522")) {
      {}
    } else {
      stryCov_9fa48("2522");
      const capturedAt = Number.isFinite(options.capturedAt) ? options.capturedAt : this.nowFn();
      const observedMembershipPublication = await this.ensureMembershipPublicationObservation(stryMutAct_9fa48("2523") ? {} : (stryCov_9fa48("2523"), {
        preferAuthoritativeRead: stryMutAct_9fa48("2526") ? options.preferAuthoritativePublicationRead !== true : stryMutAct_9fa48("2525") ? false : stryMutAct_9fa48("2524") ? true : (stryCov_9fa48("2524", "2525", "2526"), options.preferAuthoritativePublicationRead === (stryMutAct_9fa48("2527") ? false : (stryCov_9fa48("2527"), true))),
        reconcileAuthoritativeMembership: stryMutAct_9fa48("2530") ? options.reconcileAuthoritativeMembershipPublication !== true : stryMutAct_9fa48("2529") ? false : stryMutAct_9fa48("2528") ? true : (stryCov_9fa48("2528", "2529", "2530"), options.reconcileAuthoritativeMembershipPublication === (stryMutAct_9fa48("2531") ? false : (stryCov_9fa48("2531"), true)))
      }));
      let observedPublishedMembership = await this.ensurePublishedMembershipObservation(observedMembershipPublication, stryMutAct_9fa48("2532") ? {} : (stryCov_9fa48("2532"), {
        preferAuthoritativeRead: stryMutAct_9fa48("2535") ? options.preferAuthoritativePublicationRead !== true : stryMutAct_9fa48("2534") ? false : stryMutAct_9fa48("2533") ? true : (stryCov_9fa48("2533", "2534", "2535"), options.preferAuthoritativePublicationRead === (stryMutAct_9fa48("2536") ? false : (stryCov_9fa48("2536"), true)))
      }));
      if (stryMutAct_9fa48("2539") ? !observedPublishedMembership && options.preferAuthoritativePublicationRead !== true && observedMembershipPublication && typeof observedMembershipPublication === TYPEOF.OBJECT || String(observedMembershipPublication.status || ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE).toUpperCase() !== ADMIN_CONTROL_SNAPSHOT_LITERAL.PUBLISHED : stryMutAct_9fa48("2538") ? false : stryMutAct_9fa48("2537") ? true : (stryCov_9fa48("2537", "2538", "2539"), (stryMutAct_9fa48("2541") ? !observedPublishedMembership && options.preferAuthoritativePublicationRead !== true && observedMembershipPublication || typeof observedMembershipPublication === TYPEOF.OBJECT : stryMutAct_9fa48("2540") ? true : (stryCov_9fa48("2540", "2541"), (stryMutAct_9fa48("2543") ? !observedPublishedMembership && options.preferAuthoritativePublicationRead !== true || observedMembershipPublication : stryMutAct_9fa48("2542") ? true : (stryCov_9fa48("2542", "2543"), (stryMutAct_9fa48("2545") ? !observedPublishedMembership || options.preferAuthoritativePublicationRead !== true : stryMutAct_9fa48("2544") ? true : (stryCov_9fa48("2544", "2545"), (stryMutAct_9fa48("2546") ? observedPublishedMembership : (stryCov_9fa48("2546"), !observedPublishedMembership)) && (stryMutAct_9fa48("2548") ? options.preferAuthoritativePublicationRead === true : stryMutAct_9fa48("2547") ? true : (stryCov_9fa48("2547", "2548"), options.preferAuthoritativePublicationRead !== (stryMutAct_9fa48("2549") ? false : (stryCov_9fa48("2549"), true)))))) && observedMembershipPublication)) && (stryMutAct_9fa48("2551") ? typeof observedMembershipPublication !== TYPEOF.OBJECT : stryMutAct_9fa48("2550") ? true : (stryCov_9fa48("2550", "2551"), typeof observedMembershipPublication === TYPEOF.OBJECT)))) && (stryMutAct_9fa48("2553") ? String(observedMembershipPublication.status || ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE).toUpperCase() === ADMIN_CONTROL_SNAPSHOT_LITERAL.PUBLISHED : stryMutAct_9fa48("2552") ? true : (stryCov_9fa48("2552", "2553"), (stryMutAct_9fa48("2554") ? String(observedMembershipPublication.status || ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE).toLowerCase() : (stryCov_9fa48("2554"), String(stryMutAct_9fa48("2557") ? observedMembershipPublication.status && ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE : stryMutAct_9fa48("2556") ? false : stryMutAct_9fa48("2555") ? true : (stryCov_9fa48("2555", "2556", "2557"), observedMembershipPublication.status || ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE)).toUpperCase())) !== ADMIN_CONTROL_SNAPSHOT_LITERAL.PUBLISHED)))) {
        if (stryMutAct_9fa48("2558")) {
          {}
        } else {
          stryCov_9fa48("2558");
          observedPublishedMembership = await this.ensurePublishedMembershipObservation(observedMembershipPublication, stryMutAct_9fa48("2559") ? {} : (stryCov_9fa48("2559"), {
            preferAuthoritativeRead: stryMutAct_9fa48("2560") ? false : (stryCov_9fa48("2560"), true)
          }));
        }
      }
      const readinessEntries = await this.resolveControlPlaneReadinessEntries(stryMutAct_9fa48("2561") ? {} : (stryCov_9fa48("2561"), {
        allowAuthoritativeRefresh: stryMutAct_9fa48("2564") ? options.allowAuthoritativeReadinessRefresh === false : stryMutAct_9fa48("2563") ? false : stryMutAct_9fa48("2562") ? true : (stryCov_9fa48("2562", "2563", "2564"), options.allowAuthoritativeReadinessRefresh !== (stryMutAct_9fa48("2565") ? true : (stryCov_9fa48("2565"), false))),
        allowStaleOnCacheChange: stryMutAct_9fa48("2568") ? options.allowStaleReadinessOnCacheChange === false : stryMutAct_9fa48("2567") ? false : stryMutAct_9fa48("2566") ? true : (stryCov_9fa48("2566", "2567", "2568"), options.allowStaleReadinessOnCacheChange !== (stryMutAct_9fa48("2569") ? true : (stryCov_9fa48("2569"), false)))
      }));
      const readinessByNodeId = {};
      const nodeLivenessByNodeId = {};
      const placementEligibilityByNodeId = {};
      for (const readiness of readinessEntries) {
        if (stryMutAct_9fa48("2570")) {
          {}
        } else {
          stryCov_9fa48("2570");
          const nodeId = firstStringField(readiness, COLUMN.NODE_ID, stryMutAct_9fa48("2571") ? "" : (stryCov_9fa48("2571"), 'nodeId'));
          if (stryMutAct_9fa48("2574") ? false : stryMutAct_9fa48("2573") ? true : stryMutAct_9fa48("2572") ? nodeId : (stryCov_9fa48("2572", "2573", "2574"), !nodeId)) {
            if (stryMutAct_9fa48("2575")) {
              {}
            } else {
              stryCov_9fa48("2575");
              continue;
            }
          }
          readinessByNodeId[nodeId] = readiness;
          nodeLivenessByNodeId[nodeId] = stryMutAct_9fa48("2578") ? readiness?.nodeEvidence && null : stryMutAct_9fa48("2577") ? false : stryMutAct_9fa48("2576") ? true : (stryCov_9fa48("2576", "2577", "2578"), (stryMutAct_9fa48("2579") ? readiness.nodeEvidence : (stryCov_9fa48("2579"), readiness?.nodeEvidence)) || null);
          placementEligibilityByNodeId[nodeId] = this.buildPlacementEligibilityExplanation(readiness);
        }
      }
      const publicationMode = this.resolvePublicationModeDiagnostics(readinessEntries);
      const publicationConvergence = this.resolvePublicationConvergenceDiagnostics(readinessEntries, observedMembershipPublication);
      const readinessTransitionsByNodeId = this.resolveReadinessTransitionHistory();
      const priorityControlPlaneRecoveryByNodeId = this.resolvePriorityControlPlaneRecoveryByNodeId(readinessEntries);
      const participationDecisions = this.resolveParticipationDecisionDiagnostics();
      const authoritativeReadinessRepairs = this.resolveAuthoritativeReadinessRepairDiagnostics();
      const recoveryEpochsByNodeId = this.resolveRecoveryEpochDiagnostics();
      const controlPlaneOperations = this.resolveControlPlaneOperationDiagnostics();
      const startupRecovery = (stryMutAct_9fa48("2582") ? this.startupRecoveryCoordinator || typeof this.startupRecoveryCoordinator.evaluate === TYPEOF.FUNCTION : stryMutAct_9fa48("2581") ? false : stryMutAct_9fa48("2580") ? true : (stryCov_9fa48("2580", "2581", "2582"), this.startupRecoveryCoordinator && (stryMutAct_9fa48("2584") ? typeof this.startupRecoveryCoordinator.evaluate !== TYPEOF.FUNCTION : stryMutAct_9fa48("2583") ? true : (stryCov_9fa48("2583", "2584"), typeof this.startupRecoveryCoordinator.evaluate === TYPEOF.FUNCTION)))) ? this.startupRecoveryCoordinator.evaluate() : null;
      const heartbeatPublication = this.resolveHeartbeatPublicationDiagnostics();
      const workflowDiagnostics = this.buildWorkflowAdmissionDiagnostics(Array.isArray(options.tableRows) ? options.tableRows : stryMutAct_9fa48("2585") ? this.systemTableCache.getAll(TABLES.TABLES) : (stryCov_9fa48("2585"), this.systemTableCache?.getAll(TABLES.TABLES)));
      const replicaOperationRows = stryMutAct_9fa48("2588") ? this.systemTableCache?.getAll(TABLES.REPLICA_OPERATIONS) && ADMIN_CACHE_DUMP.EMPTY : stryMutAct_9fa48("2587") ? false : stryMutAct_9fa48("2586") ? true : (stryCov_9fa48("2586", "2587", "2588"), (stryMutAct_9fa48("2589") ? this.systemTableCache.getAll(TABLES.REPLICA_OPERATIONS) : (stryCov_9fa48("2589"), this.systemTableCache?.getAll(TABLES.REPLICA_OPERATIONS))) || ADMIN_CACHE_DUMP.EMPTY);
      const serviceRows = stryMutAct_9fa48("2592") ? this.systemTableCache?.getAll(TABLES.SERVICES) && ADMIN_CACHE_DUMP.EMPTY : stryMutAct_9fa48("2591") ? false : stryMutAct_9fa48("2590") ? true : (stryCov_9fa48("2590", "2591", "2592"), (stryMutAct_9fa48("2593") ? this.systemTableCache.getAll(TABLES.SERVICES) : (stryCov_9fa48("2593"), this.systemTableCache?.getAll(TABLES.SERVICES))) || ADMIN_CACHE_DUMP.EMPTY);
      const replicaOperations = this.buildControlSnapshotReplicaOperationSummary(replicaOperationRows);
      const priorityRecoveryDecisionSnapshots = this.buildPriorityRecoveryDecisionSnapshots(stryMutAct_9fa48("2594") ? {} : (stryCov_9fa48("2594"), {
        capturedAt,
        publicationConvergence,
        readinessByNodeId,
        placementEligibilityByNodeId,
        workflowAdmissionsByWorkflowId: workflowDiagnostics.workflowAdmissionsByWorkflowId,
        controlPlaneOperations,
        replicaOperationRows,
        replicaOperations,
        serviceRows
      }));
      const splitEvaluation = this.resolveSplitEvaluationDiagnostics();
      const partitionServices = (stryMutAct_9fa48("2597") ? this.resolveLocalPartitionServices || typeof this.resolveLocalPartitionServices === TYPEOF.FUNCTION : stryMutAct_9fa48("2596") ? false : stryMutAct_9fa48("2595") ? true : (stryCov_9fa48("2595", "2596", "2597"), this.resolveLocalPartitionServices && (stryMutAct_9fa48("2599") ? typeof this.resolveLocalPartitionServices !== TYPEOF.FUNCTION : stryMutAct_9fa48("2598") ? true : (stryCov_9fa48("2598", "2599"), typeof this.resolveLocalPartitionServices === TYPEOF.FUNCTION)))) ? this.resolveLocalPartitionServices() : null;
      const logsTable = buildLogsTableRetentionDiagnostics();
      const cdcReplay = buildCdcReplayRetentionDiagnostics(partitionServices);
      return stryMutAct_9fa48("2600") ? {} : (stryCov_9fa48("2600"), {
        schemaVersion: CONTROL_PLANE_DIAGNOSTICS_SCHEMA_VERSION,
        nodeId: this.nodeId,
        capturedAt,
        publicationMode,
        publicationConvergence,
        publishedMembershipObservation: this.resolvePublicationConvergenceDiagnostics(ADMIN_CACHE_DUMP.EMPTY, observedPublishedMembership),
        heartbeatPublication,
        readinessByNodeId,
        nodeLivenessByNodeId,
        priorityControlPlaneRecoveryByNodeId,
        readinessTransitionsByNodeId,
        participationDecisions,
        authoritativeReadinessRepairs,
        recoveryEpochsByNodeId,
        startupRecovery,
        placementEligibilityByNodeId,
        workflowAdmissionsByWorkflowId: workflowDiagnostics.workflowAdmissionsByWorkflowId,
        timeoutClassifications: workflowDiagnostics.timeoutClassifications,
        controlPlaneOperations,
        priorityRecoveryDecisionSnapshots,
        replicaOperations,
        splitEvaluation,
        logsTable,
        cdcReplay,
        cdcReplayByPartitionId: stryMutAct_9fa48("2603") ? cdcReplay?.byPartitionId && null : stryMutAct_9fa48("2602") ? false : stryMutAct_9fa48("2601") ? true : (stryCov_9fa48("2601", "2602", "2603"), (stryMutAct_9fa48("2604") ? cdcReplay.byPartitionId : (stryCov_9fa48("2604"), cdcReplay?.byPartitionId)) || null)
      });
    }
  } /**
    * Build priority-recovery cross-service decision snapshots keyed by
    * partition/epoch/op.
    * @param {Object} options
    * @return {Object}
    * @private
    */
  buildPriorityRecoveryDecisionSnapshots(options = {}) {
    if (stryMutAct_9fa48("2605")) {
      {}
    } else {
      stryCov_9fa48("2605");
      return buildSharedPriorityRecoveryDecisionSnapshots(stryMutAct_9fa48("2606") ? {} : (stryCov_9fa48("2606"), {
        ...options,
        schemaVersion: PRIORITY_RECOVERY_DECISION_SNAPSHOT_SCHEMA_VERSION
      }));
    }
  }
  async ensureMembershipPublicationObservation(options = {}) {
    if (stryMutAct_9fa48("2607")) {
      {}
    } else {
      stryCov_9fa48("2607");
      const readinessService = stryMutAct_9fa48("2610") ? this.controlPlaneReadinessService && null : stryMutAct_9fa48("2609") ? false : stryMutAct_9fa48("2608") ? true : (stryCov_9fa48("2608", "2609", "2610"), this.controlPlaneReadinessService || null);
      const membershipPublicationService = stryMutAct_9fa48("2613") ? readinessService?.membershipPublicationService && null : stryMutAct_9fa48("2612") ? false : stryMutAct_9fa48("2611") ? true : (stryCov_9fa48("2611", "2612", "2613"), (stryMutAct_9fa48("2614") ? readinessService.membershipPublicationService : (stryCov_9fa48("2614"), readinessService?.membershipPublicationService)) || null);
      const hasMembershipPublicationService = stryMutAct_9fa48("2617") ? membershipPublicationService || typeof membershipPublicationService === TYPEOF.OBJECT : stryMutAct_9fa48("2616") ? false : stryMutAct_9fa48("2615") ? true : (stryCov_9fa48("2615", "2616", "2617"), membershipPublicationService && (stryMutAct_9fa48("2619") ? typeof membershipPublicationService !== TYPEOF.OBJECT : stryMutAct_9fa48("2618") ? true : (stryCov_9fa48("2618", "2619"), typeof membershipPublicationService === TYPEOF.OBJECT)));
      const preferAuthoritativeRead = stryMutAct_9fa48("2622") ? options.preferAuthoritativeRead !== true : stryMutAct_9fa48("2621") ? false : stryMutAct_9fa48("2620") ? true : (stryCov_9fa48("2620", "2621", "2622"), options.preferAuthoritativeRead === (stryMutAct_9fa48("2623") ? false : (stryCov_9fa48("2623"), true)));
      if (stryMutAct_9fa48("2626") ? !preferAuthoritativeRead || typeof readinessService?.getLatestMembershipPublicationRowSync === TYPEOF.FUNCTION : stryMutAct_9fa48("2625") ? false : stryMutAct_9fa48("2624") ? true : (stryCov_9fa48("2624", "2625", "2626"), (stryMutAct_9fa48("2627") ? preferAuthoritativeRead : (stryCov_9fa48("2627"), !preferAuthoritativeRead)) && (stryMutAct_9fa48("2629") ? typeof readinessService?.getLatestMembershipPublicationRowSync !== TYPEOF.FUNCTION : stryMutAct_9fa48("2628") ? true : (stryCov_9fa48("2628", "2629"), typeof (stryMutAct_9fa48("2630") ? readinessService.getLatestMembershipPublicationRowSync : (stryCov_9fa48("2630"), readinessService?.getLatestMembershipPublicationRowSync)) === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("2631")) {
          {}
        } else {
          stryCov_9fa48("2631");
          const publicationRow = readinessService.getLatestMembershipPublicationRowSync(null, stryMutAct_9fa48("2632") ? {} : (stryCov_9fa48("2632"), {
            lane: MEMBERSHIP_PUBLICATION_READ_PROFILE_DIAGNOSTICS
          }));
          if (stryMutAct_9fa48("2634") ? false : stryMutAct_9fa48("2633") ? true : (stryCov_9fa48("2633", "2634"), publicationRow)) {
            if (stryMutAct_9fa48("2635")) {
              {}
            } else {
              stryCov_9fa48("2635");
              return publicationRow;
            }
          }
        }
      }
      if (stryMutAct_9fa48("2638") ? typeof readinessService?.getLatestMembershipPublicationRow !== TYPEOF.FUNCTION : stryMutAct_9fa48("2637") ? false : stryMutAct_9fa48("2636") ? true : (stryCov_9fa48("2636", "2637", "2638"), typeof (stryMutAct_9fa48("2639") ? readinessService.getLatestMembershipPublicationRow : (stryCov_9fa48("2639"), readinessService?.getLatestMembershipPublicationRow)) === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("2640")) {
          {}
        } else {
          stryCov_9fa48("2640");
          const publicationRow = await readinessService.getLatestMembershipPublicationRow(null, stryMutAct_9fa48("2641") ? {} : (stryCov_9fa48("2641"), {
            lane: MEMBERSHIP_PUBLICATION_READ_PROFILE_DIAGNOSTICS
          }));
          if (stryMutAct_9fa48("2643") ? false : stryMutAct_9fa48("2642") ? true : (stryCov_9fa48("2642", "2643"), publicationRow)) {
            if (stryMutAct_9fa48("2644")) {
              {}
            } else {
              stryCov_9fa48("2644");
              return publicationRow;
            }
          }
        }
      }
      if (stryMutAct_9fa48("2647") ? hasMembershipPublicationService && !preferAuthoritativeRead || typeof membershipPublicationService.getLatestClusterPublicationSync === TYPEOF.FUNCTION : stryMutAct_9fa48("2646") ? false : stryMutAct_9fa48("2645") ? true : (stryCov_9fa48("2645", "2646", "2647"), (stryMutAct_9fa48("2649") ? hasMembershipPublicationService || !preferAuthoritativeRead : stryMutAct_9fa48("2648") ? true : (stryCov_9fa48("2648", "2649"), hasMembershipPublicationService && (stryMutAct_9fa48("2650") ? preferAuthoritativeRead : (stryCov_9fa48("2650"), !preferAuthoritativeRead)))) && (stryMutAct_9fa48("2652") ? typeof membershipPublicationService.getLatestClusterPublicationSync !== TYPEOF.FUNCTION : stryMutAct_9fa48("2651") ? true : (stryCov_9fa48("2651", "2652"), typeof membershipPublicationService.getLatestClusterPublicationSync === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("2653")) {
          {}
        } else {
          stryCov_9fa48("2653");
          const publicationRow = membershipPublicationService.getLatestClusterPublicationSync();
          if (stryMutAct_9fa48("2655") ? false : stryMutAct_9fa48("2654") ? true : (stryCov_9fa48("2654", "2655"), publicationRow)) {
            if (stryMutAct_9fa48("2656")) {
              {}
            } else {
              stryCov_9fa48("2656");
              return publicationRow;
            }
          }
        }
      }
      if (stryMutAct_9fa48("2659") ? hasMembershipPublicationService || typeof membershipPublicationService.getLatestClusterPublication === TYPEOF.FUNCTION : stryMutAct_9fa48("2658") ? false : stryMutAct_9fa48("2657") ? true : (stryCov_9fa48("2657", "2658", "2659"), hasMembershipPublicationService && (stryMutAct_9fa48("2661") ? typeof membershipPublicationService.getLatestClusterPublication !== TYPEOF.FUNCTION : stryMutAct_9fa48("2660") ? true : (stryCov_9fa48("2660", "2661"), typeof membershipPublicationService.getLatestClusterPublication === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("2662")) {
          {}
        } else {
          stryCov_9fa48("2662");
          const publicationRow = await membershipPublicationService.getLatestClusterPublication(buildMembershipPublicationReadOptions(stryMutAct_9fa48("2663") ? {} : (stryCov_9fa48("2663"), {
            preferAuthoritativeRead
          })));
          if (stryMutAct_9fa48("2665") ? false : stryMutAct_9fa48("2664") ? true : (stryCov_9fa48("2664", "2665"), publicationRow)) {
            if (stryMutAct_9fa48("2666")) {
              {}
            } else {
              stryCov_9fa48("2666");
              return publicationRow;
            }
          }
        }
      }
      return resolveLatestMembershipPublicationRow(stryMutAct_9fa48("2668") ? this.systemTableCache.getAll?.(TABLES.CONTROL_PLANE_PUBLICATIONS) : stryMutAct_9fa48("2667") ? this.systemTableCache?.getAll(TABLES.CONTROL_PLANE_PUBLICATIONS) : (stryCov_9fa48("2667", "2668"), this.systemTableCache?.getAll?.(TABLES.CONTROL_PLANE_PUBLICATIONS)));
    }
  }
  async ensurePublishedMembershipObservation(fallbackPublication = null, options = {}) {
    if (stryMutAct_9fa48("2669")) {
      {}
    } else {
      stryCov_9fa48("2669");
      if (stryMutAct_9fa48("2672") ? fallbackPublication && typeof fallbackPublication === TYPEOF.OBJECT || String(fallbackPublication.status || ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE).toUpperCase() === ADMIN_CONTROL_SNAPSHOT_LITERAL.PUBLISHED : stryMutAct_9fa48("2671") ? false : stryMutAct_9fa48("2670") ? true : (stryCov_9fa48("2670", "2671", "2672"), (stryMutAct_9fa48("2674") ? fallbackPublication || typeof fallbackPublication === TYPEOF.OBJECT : stryMutAct_9fa48("2673") ? true : (stryCov_9fa48("2673", "2674"), fallbackPublication && (stryMutAct_9fa48("2676") ? typeof fallbackPublication !== TYPEOF.OBJECT : stryMutAct_9fa48("2675") ? true : (stryCov_9fa48("2675", "2676"), typeof fallbackPublication === TYPEOF.OBJECT)))) && (stryMutAct_9fa48("2678") ? String(fallbackPublication.status || ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE).toUpperCase() !== ADMIN_CONTROL_SNAPSHOT_LITERAL.PUBLISHED : stryMutAct_9fa48("2677") ? true : (stryCov_9fa48("2677", "2678"), (stryMutAct_9fa48("2679") ? String(fallbackPublication.status || ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE).toLowerCase() : (stryCov_9fa48("2679"), String(stryMutAct_9fa48("2682") ? fallbackPublication.status && ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE : stryMutAct_9fa48("2681") ? false : stryMutAct_9fa48("2680") ? true : (stryCov_9fa48("2680", "2681", "2682"), fallbackPublication.status || ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE)).toUpperCase())) === ADMIN_CONTROL_SNAPSHOT_LITERAL.PUBLISHED)))) {
        if (stryMutAct_9fa48("2683")) {
          {}
        } else {
          stryCov_9fa48("2683");
          return fallbackPublication;
        }
      }
      const readinessService = stryMutAct_9fa48("2686") ? this.controlPlaneReadinessService && null : stryMutAct_9fa48("2685") ? false : stryMutAct_9fa48("2684") ? true : (stryCov_9fa48("2684", "2685", "2686"), this.controlPlaneReadinessService || null);
      const membershipPublicationService = stryMutAct_9fa48("2689") ? readinessService?.membershipPublicationService && null : stryMutAct_9fa48("2688") ? false : stryMutAct_9fa48("2687") ? true : (stryCov_9fa48("2687", "2688", "2689"), (stryMutAct_9fa48("2690") ? readinessService.membershipPublicationService : (stryCov_9fa48("2690"), readinessService?.membershipPublicationService)) || null);
      const hasMembershipPublicationService = stryMutAct_9fa48("2693") ? membershipPublicationService || typeof membershipPublicationService === TYPEOF.OBJECT : stryMutAct_9fa48("2692") ? false : stryMutAct_9fa48("2691") ? true : (stryCov_9fa48("2691", "2692", "2693"), membershipPublicationService && (stryMutAct_9fa48("2695") ? typeof membershipPublicationService !== TYPEOF.OBJECT : stryMutAct_9fa48("2694") ? true : (stryCov_9fa48("2694", "2695"), typeof membershipPublicationService === TYPEOF.OBJECT)));
      if (stryMutAct_9fa48("2698") ? options.preferAuthoritativeRead !== true || typeof readinessService?.getLatestPublishedMembershipPublicationRowSync === TYPEOF.FUNCTION : stryMutAct_9fa48("2697") ? false : stryMutAct_9fa48("2696") ? true : (stryCov_9fa48("2696", "2697", "2698"), (stryMutAct_9fa48("2700") ? options.preferAuthoritativeRead === true : stryMutAct_9fa48("2699") ? true : (stryCov_9fa48("2699", "2700"), options.preferAuthoritativeRead !== (stryMutAct_9fa48("2701") ? false : (stryCov_9fa48("2701"), true)))) && (stryMutAct_9fa48("2703") ? typeof readinessService?.getLatestPublishedMembershipPublicationRowSync !== TYPEOF.FUNCTION : stryMutAct_9fa48("2702") ? true : (stryCov_9fa48("2702", "2703"), typeof (stryMutAct_9fa48("2704") ? readinessService.getLatestPublishedMembershipPublicationRowSync : (stryCov_9fa48("2704"), readinessService?.getLatestPublishedMembershipPublicationRowSync)) === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("2705")) {
          {}
        } else {
          stryCov_9fa48("2705");
          const publicationRow = readinessService.getLatestPublishedMembershipPublicationRowSync(stryMutAct_9fa48("2706") ? {} : (stryCov_9fa48("2706"), {
            lane: MEMBERSHIP_PUBLICATION_READ_PROFILE_DIAGNOSTICS
          }));
          if (stryMutAct_9fa48("2709") ? publicationRow || typeof publicationRow === TYPEOF.OBJECT : stryMutAct_9fa48("2708") ? false : stryMutAct_9fa48("2707") ? true : (stryCov_9fa48("2707", "2708", "2709"), publicationRow && (stryMutAct_9fa48("2711") ? typeof publicationRow !== TYPEOF.OBJECT : stryMutAct_9fa48("2710") ? true : (stryCov_9fa48("2710", "2711"), typeof publicationRow === TYPEOF.OBJECT)))) {
            if (stryMutAct_9fa48("2712")) {
              {}
            } else {
              stryCov_9fa48("2712");
              return publicationRow;
            }
          }
        }
      }
      if (stryMutAct_9fa48("2715") ? typeof readinessService?.getLatestPublishedMembershipPublicationRow !== TYPEOF.FUNCTION : stryMutAct_9fa48("2714") ? false : stryMutAct_9fa48("2713") ? true : (stryCov_9fa48("2713", "2714", "2715"), typeof (stryMutAct_9fa48("2716") ? readinessService.getLatestPublishedMembershipPublicationRow : (stryCov_9fa48("2716"), readinessService?.getLatestPublishedMembershipPublicationRow)) === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("2717")) {
          {}
        } else {
          stryCov_9fa48("2717");
          const publicationRow = await readinessService.getLatestPublishedMembershipPublicationRow(stryMutAct_9fa48("2718") ? {} : (stryCov_9fa48("2718"), {
            lane: MEMBERSHIP_PUBLICATION_READ_PROFILE_DIAGNOSTICS
          }));
          if (stryMutAct_9fa48("2721") ? publicationRow || typeof publicationRow === TYPEOF.OBJECT : stryMutAct_9fa48("2720") ? false : stryMutAct_9fa48("2719") ? true : (stryCov_9fa48("2719", "2720", "2721"), publicationRow && (stryMutAct_9fa48("2723") ? typeof publicationRow !== TYPEOF.OBJECT : stryMutAct_9fa48("2722") ? true : (stryCov_9fa48("2722", "2723"), typeof publicationRow === TYPEOF.OBJECT)))) {
            if (stryMutAct_9fa48("2724")) {
              {}
            } else {
              stryCov_9fa48("2724");
              return publicationRow;
            }
          }
        }
      }
      if (stryMutAct_9fa48("2727") ? hasMembershipPublicationService && options.preferAuthoritativeRead !== true || typeof membershipPublicationService.getLatestPublishedClusterPublicationSync === TYPEOF.FUNCTION : stryMutAct_9fa48("2726") ? false : stryMutAct_9fa48("2725") ? true : (stryCov_9fa48("2725", "2726", "2727"), (stryMutAct_9fa48("2729") ? hasMembershipPublicationService || options.preferAuthoritativeRead !== true : stryMutAct_9fa48("2728") ? true : (stryCov_9fa48("2728", "2729"), hasMembershipPublicationService && (stryMutAct_9fa48("2731") ? options.preferAuthoritativeRead === true : stryMutAct_9fa48("2730") ? true : (stryCov_9fa48("2730", "2731"), options.preferAuthoritativeRead !== (stryMutAct_9fa48("2732") ? false : (stryCov_9fa48("2732"), true)))))) && (stryMutAct_9fa48("2734") ? typeof membershipPublicationService.getLatestPublishedClusterPublicationSync !== TYPEOF.FUNCTION : stryMutAct_9fa48("2733") ? true : (stryCov_9fa48("2733", "2734"), typeof membershipPublicationService.getLatestPublishedClusterPublicationSync === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("2735")) {
          {}
        } else {
          stryCov_9fa48("2735");
          const publicationRow = membershipPublicationService.getLatestPublishedClusterPublicationSync();
          if (stryMutAct_9fa48("2738") ? publicationRow || typeof publicationRow === TYPEOF.OBJECT : stryMutAct_9fa48("2737") ? false : stryMutAct_9fa48("2736") ? true : (stryCov_9fa48("2736", "2737", "2738"), publicationRow && (stryMutAct_9fa48("2740") ? typeof publicationRow !== TYPEOF.OBJECT : stryMutAct_9fa48("2739") ? true : (stryCov_9fa48("2739", "2740"), typeof publicationRow === TYPEOF.OBJECT)))) {
            if (stryMutAct_9fa48("2741")) {
              {}
            } else {
              stryCov_9fa48("2741");
              return publicationRow;
            }
          }
        }
      }
      if (stryMutAct_9fa48("2744") ? hasMembershipPublicationService || typeof membershipPublicationService.getLatestPublishedClusterPublication === TYPEOF.FUNCTION : stryMutAct_9fa48("2743") ? false : stryMutAct_9fa48("2742") ? true : (stryCov_9fa48("2742", "2743", "2744"), hasMembershipPublicationService && (stryMutAct_9fa48("2746") ? typeof membershipPublicationService.getLatestPublishedClusterPublication !== TYPEOF.FUNCTION : stryMutAct_9fa48("2745") ? true : (stryCov_9fa48("2745", "2746"), typeof membershipPublicationService.getLatestPublishedClusterPublication === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("2747")) {
          {}
        } else {
          stryCov_9fa48("2747");
          const publicationRow = await membershipPublicationService.getLatestPublishedClusterPublication(buildMembershipPublicationReadOptions(stryMutAct_9fa48("2748") ? {} : (stryCov_9fa48("2748"), {
            preferAuthoritativeRead: stryMutAct_9fa48("2751") ? options.preferAuthoritativeRead !== true : stryMutAct_9fa48("2750") ? false : stryMutAct_9fa48("2749") ? true : (stryCov_9fa48("2749", "2750", "2751"), options.preferAuthoritativeRead === (stryMutAct_9fa48("2752") ? false : (stryCov_9fa48("2752"), true)))
          })));
          if (stryMutAct_9fa48("2755") ? publicationRow || typeof publicationRow === TYPEOF.OBJECT : stryMutAct_9fa48("2754") ? false : stryMutAct_9fa48("2753") ? true : (stryCov_9fa48("2753", "2754", "2755"), publicationRow && (stryMutAct_9fa48("2757") ? typeof publicationRow !== TYPEOF.OBJECT : stryMutAct_9fa48("2756") ? true : (stryCov_9fa48("2756", "2757"), typeof publicationRow === TYPEOF.OBJECT)))) {
            if (stryMutAct_9fa48("2758")) {
              {}
            } else {
              stryCov_9fa48("2758");
              return publicationRow;
            }
          }
        }
      }
      return resolveLatestMembershipPublicationRow(stryMutAct_9fa48("2760") ? this.systemTableCache.getAll?.(TABLES.CONTROL_PLANE_PUBLICATIONS) : stryMutAct_9fa48("2759") ? this.systemTableCache?.getAll(TABLES.CONTROL_PLANE_PUBLICATIONS) : (stryCov_9fa48("2759", "2760"), this.systemTableCache?.getAll?.(TABLES.CONTROL_PLANE_PUBLICATIONS)), stryMutAct_9fa48("2761") ? {} : (stryCov_9fa48("2761"), {
        status: ADMIN_CONTROL_SNAPSHOT_LITERAL.PUBLISHED
      }));
    }
  }
  resolvePublicationConvergenceDiagnostics(readinessEntries = stryMutAct_9fa48("2762") ? ["Stryker was here"] : (stryCov_9fa48("2762"), []), fallbackPublication = null) {
    if (stryMutAct_9fa48("2763")) {
      {}
    } else {
      stryCov_9fa48("2763");
      const unavailablePublicationDiagnostics = Object.freeze(stryMutAct_9fa48("2764") ? {} : (stryCov_9fa48("2764"), {
        publicationObservation: Object.freeze(stryMutAct_9fa48("2765") ? {} : (stryCov_9fa48("2765"), {
          state: stryMutAct_9fa48("2766") ? "" : (stryCov_9fa48("2766"), 'unavailable')
        })),
        timestamps: Object.freeze(stryMutAct_9fa48("2767") ? {} : (stryCov_9fa48("2767"), {
          publishedAt: Object.freeze(stryMutAct_9fa48("2768") ? {} : (stryCov_9fa48("2768"), {
            state: stryMutAct_9fa48("2769") ? "" : (stryCov_9fa48("2769"), 'unavailable')
          })),
          updatedAt: Object.freeze(stryMutAct_9fa48("2770") ? {} : (stryCov_9fa48("2770"), {
            state: stryMutAct_9fa48("2771") ? "" : (stryCov_9fa48("2771"), 'unavailable')
          }))
        }))
      }));
      const buildPublicationDiagnostics = (membershipPublication, timestampFields = {}) => {
        if (stryMutAct_9fa48("2772")) {
          {}
        } else {
          stryCov_9fa48("2772");
          const publicationSnapshot = buildPublicationRecoveryProtocolSnapshot(membershipPublication);
          if (stryMutAct_9fa48("2775") ? false : stryMutAct_9fa48("2774") ? true : stryMutAct_9fa48("2773") ? publicationSnapshot : (stryCov_9fa48("2773", "2774", "2775"), !publicationSnapshot)) {
            if (stryMutAct_9fa48("2776")) {
              {}
            } else {
              stryCov_9fa48("2776");
              return unavailablePublicationDiagnostics;
            }
          }
          const requiredAckNodeIds = stryMutAct_9fa48("2777") ? [] : (stryCov_9fa48("2777"), [...publicationSnapshot.requiredAckNodeIds]);
          const acknowledgedNodeIds = stryMutAct_9fa48("2778") ? [] : (stryCov_9fa48("2778"), [...publicationSnapshot.acknowledgedNodeIds]);
          const publishedAtKnown = Number.isFinite(timestampFields.publishedAt);
          const updatedAtKnown = Number.isFinite(timestampFields.updatedAt);
          return stryMutAct_9fa48("2779") ? {} : (stryCov_9fa48("2779"), {
            publicationObservation: stryMutAct_9fa48("2780") ? {} : (stryCov_9fa48("2780"), {
              state: stryMutAct_9fa48("2781") ? "" : (stryCov_9fa48("2781"), 'available'),
              epoch: publicationSnapshot.publicationEpoch,
              status: publicationSnapshot.publicationStatus
            }),
            publicationEpoch: publicationSnapshot.publicationEpoch,
            status: publicationSnapshot.publicationStatus,
            publicationStatus: publicationSnapshot.publicationStatus,
            publishedActiveNodeIds: stryMutAct_9fa48("2782") ? [] : (stryCov_9fa48("2782"), [...publicationSnapshot.publishedActiveNodeIds]),
            requiredAckNodeIds,
            acknowledgedNodeIds,
            pendingAckNodeIds: stryMutAct_9fa48("2783") ? requiredAckNodeIds : (stryCov_9fa48("2783"), requiredAckNodeIds.filter(stryMutAct_9fa48("2784") ? () => undefined : (stryCov_9fa48("2784"), nodeId => stryMutAct_9fa48("2785") ? acknowledgedNodeIds.includes(nodeId) : (stryCov_9fa48("2785"), !acknowledgedNodeIds.includes(nodeId))))),
            priorityPartitionSummary: publicationSnapshot.priorityPartitionSummary,
            sourceTopologyEpoch: publicationSnapshot.sourceTopologyEpoch,
            sourceSnapshotVersion: publicationSnapshot.sourceSnapshotVersion,
            timestamps: stryMutAct_9fa48("2786") ? {} : (stryCov_9fa48("2786"), {
              publishedAt: publishedAtKnown ? stryMutAct_9fa48("2787") ? {} : (stryCov_9fa48("2787"), {
                state: stryMutAct_9fa48("2788") ? "" : (stryCov_9fa48("2788"), 'known'),
                value: timestampFields.publishedAt
              }) : stryMutAct_9fa48("2789") ? {} : (stryCov_9fa48("2789"), {
                state: stryMutAct_9fa48("2790") ? "" : (stryCov_9fa48("2790"), 'unavailable')
              }),
              updatedAt: updatedAtKnown ? stryMutAct_9fa48("2791") ? {} : (stryCov_9fa48("2791"), {
                state: stryMutAct_9fa48("2792") ? "" : (stryCov_9fa48("2792"), 'known'),
                value: timestampFields.updatedAt
              }) : stryMutAct_9fa48("2793") ? {} : (stryCov_9fa48("2793"), {
                state: stryMutAct_9fa48("2794") ? "" : (stryCov_9fa48("2794"), 'unavailable')
              })
            }),
            ...(publishedAtKnown ? stryMutAct_9fa48("2795") ? {} : (stryCov_9fa48("2795"), {
              publishedAt: timestampFields.publishedAt
            }) : {}),
            ...(updatedAtKnown ? stryMutAct_9fa48("2796") ? {} : (stryCov_9fa48("2796"), {
              updatedAt: timestampFields.updatedAt
            }) : {}),
            membershipLifecycleSummary: publicationSnapshot.membershipLifecycleSummary,
            projectionDiagnostics: publicationSnapshot.projectionDiagnostics,
            recoveryActiveNodeIds: publicationSnapshot.recoveryActiveNodeIds,
            recoveryActiveNodeSource: publicationSnapshot.recoveryActiveNodeSource,
            missingPublishedRecoveryActiveNodeIds: publicationSnapshot.missingPublishedRecoveryActiveNodeIds,
            participationByNodeId: publicationSnapshot.participationByNodeId,
            participationStateCounts: publicationSnapshot.participationStateCounts,
            recoveryProtocolState: publicationSnapshot.recoveryProtocolState,
            priorityRecoveryReasonCodes: publicationSnapshot.priorityRecoveryReasonCodes
          });
        }
      };
      for (const readiness of Array.isArray(readinessEntries) ? readinessEntries : stryMutAct_9fa48("2797") ? ["Stryker was here"] : (stryCov_9fa48("2797"), [])) {
        if (stryMutAct_9fa48("2798")) {
          {}
        } else {
          stryCov_9fa48("2798");
          const membershipPublication = stryMutAct_9fa48("2799") ? readiness.membershipPublication : (stryCov_9fa48("2799"), readiness?.membershipPublication);
          if (stryMutAct_9fa48("2802") ? !membershipPublication && typeof membershipPublication !== TYPEOF.OBJECT : stryMutAct_9fa48("2801") ? false : stryMutAct_9fa48("2800") ? true : (stryCov_9fa48("2800", "2801", "2802"), (stryMutAct_9fa48("2803") ? membershipPublication : (stryCov_9fa48("2803"), !membershipPublication)) || (stryMutAct_9fa48("2805") ? typeof membershipPublication === TYPEOF.OBJECT : stryMutAct_9fa48("2804") ? false : (stryCov_9fa48("2804", "2805"), typeof membershipPublication !== TYPEOF.OBJECT)))) {
            if (stryMutAct_9fa48("2806")) {
              {}
            } else {
              stryCov_9fa48("2806");
              continue;
            }
          }
          return buildPublicationDiagnostics(membershipPublication, stryMutAct_9fa48("2807") ? {} : (stryCov_9fa48("2807"), {
            publishedAt: membershipPublication.publishedAt,
            updatedAt: membershipPublication.updatedAt
          }));
        }
      }
      if (stryMutAct_9fa48("2810") ? fallbackPublication || typeof fallbackPublication === TYPEOF.OBJECT : stryMutAct_9fa48("2809") ? false : stryMutAct_9fa48("2808") ? true : (stryCov_9fa48("2808", "2809", "2810"), fallbackPublication && (stryMutAct_9fa48("2812") ? typeof fallbackPublication !== TYPEOF.OBJECT : stryMutAct_9fa48("2811") ? true : (stryCov_9fa48("2811", "2812"), typeof fallbackPublication === TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("2813")) {
          {}
        } else {
          stryCov_9fa48("2813");
          return buildPublicationDiagnostics(fallbackPublication, stryMutAct_9fa48("2814") ? {} : (stryCov_9fa48("2814"), {
            publishedAt: stryMutAct_9fa48("2815") ? fallbackPublication.publishedAt && fallbackPublication.published_at : (stryCov_9fa48("2815"), fallbackPublication.publishedAt ?? fallbackPublication.published_at),
            updatedAt: stryMutAct_9fa48("2816") ? fallbackPublication.updatedAt && fallbackPublication.updated_at : (stryCov_9fa48("2816"), fallbackPublication.updatedAt ?? fallbackPublication.updated_at)
          }));
        }
      }
      return unavailablePublicationDiagnostics;
    }
  }
  resolvePriorityControlPlaneRecoveryByNodeId(readinessEntries = stryMutAct_9fa48("2817") ? ["Stryker was here"] : (stryCov_9fa48("2817"), [])) {
    if (stryMutAct_9fa48("2818")) {
      {}
    } else {
      stryCov_9fa48("2818");
      const entries = {};
      for (const readiness of Array.isArray(readinessEntries) ? readinessEntries : stryMutAct_9fa48("2819") ? ["Stryker was here"] : (stryCov_9fa48("2819"), [])) {
        if (stryMutAct_9fa48("2820")) {
          {}
        } else {
          stryCov_9fa48("2820");
          const nodeId = firstStringField(readiness, COLUMN.NODE_ID, stryMutAct_9fa48("2821") ? "" : (stryCov_9fa48("2821"), 'nodeId'));
          if (stryMutAct_9fa48("2824") ? false : stryMutAct_9fa48("2823") ? true : stryMutAct_9fa48("2822") ? nodeId : (stryCov_9fa48("2822", "2823", "2824"), !nodeId)) {
            if (stryMutAct_9fa48("2825")) {
              {}
            } else {
              stryCov_9fa48("2825");
              continue;
            }
          }
          const priorityControlPlaneRecovery = stryMutAct_9fa48("2826") ? readiness.priorityControlPlaneRecovery : (stryCov_9fa48("2826"), readiness?.priorityControlPlaneRecovery);
          if (stryMutAct_9fa48("2829") ? !priorityControlPlaneRecovery && typeof priorityControlPlaneRecovery !== TYPEOF.OBJECT : stryMutAct_9fa48("2828") ? false : stryMutAct_9fa48("2827") ? true : (stryCov_9fa48("2827", "2828", "2829"), (stryMutAct_9fa48("2830") ? priorityControlPlaneRecovery : (stryCov_9fa48("2830"), !priorityControlPlaneRecovery)) || (stryMutAct_9fa48("2832") ? typeof priorityControlPlaneRecovery === TYPEOF.OBJECT : stryMutAct_9fa48("2831") ? false : (stryCov_9fa48("2831", "2832"), typeof priorityControlPlaneRecovery !== TYPEOF.OBJECT)))) {
            if (stryMutAct_9fa48("2833")) {
              {}
            } else {
              stryCov_9fa48("2833");
              continue;
            }
          }
          entries[nodeId] = priorityControlPlaneRecovery;
        }
      }
      return entries;
    }
  } /**
    * Resolve canonical readiness vectors when the owner is available.
    * @return {Promise<Array<Object>>}
    * @private
    */
  async resolveControlPlaneReadinessEntries(options = {}) {
    if (stryMutAct_9fa48("2834")) {
      {}
    } else {
      stryCov_9fa48("2834");
      if (stryMutAct_9fa48("2837") ? !this.controlPlaneReadinessService && typeof this.controlPlaneReadinessService.getAllNodeReadiness !== TYPEOF.FUNCTION : stryMutAct_9fa48("2836") ? false : stryMutAct_9fa48("2835") ? true : (stryCov_9fa48("2835", "2836", "2837"), (stryMutAct_9fa48("2838") ? this.controlPlaneReadinessService : (stryCov_9fa48("2838"), !this.controlPlaneReadinessService)) || (stryMutAct_9fa48("2840") ? typeof this.controlPlaneReadinessService.getAllNodeReadiness === TYPEOF.FUNCTION : stryMutAct_9fa48("2839") ? false : (stryCov_9fa48("2839", "2840"), typeof this.controlPlaneReadinessService.getAllNodeReadiness !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("2841")) {
          {}
        } else {
          stryCov_9fa48("2841");
          return ADMIN_CACHE_DUMP.EMPTY;
        }
      }
      try {
        if (stryMutAct_9fa48("2842")) {
          {}
        } else {
          stryCov_9fa48("2842");
          const readiness = await this.controlPlaneReadinessService.getAllNodeReadiness(stryMutAct_9fa48("2843") ? {} : (stryCov_9fa48("2843"), {
            allowAuthoritativeRefresh: stryMutAct_9fa48("2846") ? options.allowAuthoritativeRefresh === false : stryMutAct_9fa48("2845") ? false : stryMutAct_9fa48("2844") ? true : (stryCov_9fa48("2844", "2845", "2846"), options.allowAuthoritativeRefresh !== (stryMutAct_9fa48("2847") ? true : (stryCov_9fa48("2847"), false))),
            allowStaleOnCacheChange: stryMutAct_9fa48("2850") ? options.allowStaleOnCacheChange === false : stryMutAct_9fa48("2849") ? false : stryMutAct_9fa48("2848") ? true : (stryCov_9fa48("2848", "2849", "2850"), options.allowStaleOnCacheChange !== (stryMutAct_9fa48("2851") ? true : (stryCov_9fa48("2851"), false))),
            maxCachedAgeMs: this.readinessSnapshotCacheMaxAgeMs
          }));
          return Array.isArray(readiness) ? readiness : ADMIN_CACHE_DUMP.EMPTY;
        }
      } catch (_error) {
        if (stryMutAct_9fa48("2852")) {
          {}
        } else {
          stryCov_9fa48("2852");
          return ADMIN_CACHE_DUMP.EMPTY;
        }
      }
    }
  } /**
    * Build one placement-eligibility explanation from canonical readiness.
    * @param {Object} readiness
    * @return {Object}
    * @private
    */
  buildPlacementEligibilityExplanation(readiness) {
    if (stryMutAct_9fa48("2853")) {
      {}
    } else {
      stryCov_9fa48("2853");
      const dimensions = (stryMutAct_9fa48("2856") ? readiness?.dimensions || typeof readiness.dimensions === TYPEOF.OBJECT : stryMutAct_9fa48("2855") ? false : stryMutAct_9fa48("2854") ? true : (stryCov_9fa48("2854", "2855", "2856"), (stryMutAct_9fa48("2857") ? readiness.dimensions : (stryCov_9fa48("2857"), readiness?.dimensions)) && (stryMutAct_9fa48("2859") ? typeof readiness.dimensions !== TYPEOF.OBJECT : stryMutAct_9fa48("2858") ? true : (stryCov_9fa48("2858", "2859"), typeof readiness.dimensions === TYPEOF.OBJECT)))) ? readiness.dimensions : {};
      const reasons = Array.isArray(stryMutAct_9fa48("2860") ? readiness.reasons : (stryCov_9fa48("2860"), readiness?.reasons)) ? readiness.reasons : ADMIN_CACHE_DUMP.EMPTY;
      return stryMutAct_9fa48("2861") ? {} : (stryCov_9fa48("2861"), {
        nodeId: firstStringField(readiness, COLUMN.NODE_ID, ADMIN_CONTROL_SNAPSHOT_LITERAL.NODEID),
        placementEligible: stryMutAct_9fa48("2864") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE] !== true : stryMutAct_9fa48("2863") ? false : stryMutAct_9fa48("2862") ? true : (stryCov_9fa48("2862", "2863", "2864"), dimensions[CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE] === (stryMutAct_9fa48("2865") ? false : (stryCov_9fa48("2865"), true))),
        failedDimensions: uniqueSorted(stryMutAct_9fa48("2866") ? Object.entries(dimensions).map(([dimension]) => dimension) : (stryCov_9fa48("2866"), Object.entries(dimensions).filter(stryMutAct_9fa48("2867") ? () => undefined : (stryCov_9fa48("2867"), ([_dimension, value]) => stryMutAct_9fa48("2870") ? value === true : stryMutAct_9fa48("2869") ? false : stryMutAct_9fa48("2868") ? true : (stryCov_9fa48("2868", "2869", "2870"), value !== (stryMutAct_9fa48("2871") ? false : (stryCov_9fa48("2871"), true))))).map(stryMutAct_9fa48("2872") ? () => undefined : (stryCov_9fa48("2872"), ([dimension]) => dimension)))),
        reasonCodes: uniqueSorted(stryMutAct_9fa48("2873") ? reasons.map(reason => String(reason?.code || ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE)) : (stryCov_9fa48("2873"), reasons.map(stryMutAct_9fa48("2874") ? () => undefined : (stryCov_9fa48("2874"), reason => String(stryMutAct_9fa48("2877") ? reason?.code && ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE : stryMutAct_9fa48("2876") ? false : stryMutAct_9fa48("2875") ? true : (stryCov_9fa48("2875", "2876", "2877"), (stryMutAct_9fa48("2878") ? reason.code : (stryCov_9fa48("2878"), reason?.code)) || ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE)))).filter(Boolean))),
        reasons
      });
    }
  } /**
    * Resolve the current publication-mode diagnostics.
    * @param {Array<Object>} readinessEntries
    * @return {Object|null}
    * @private
    */
  resolvePublicationModeDiagnostics(readinessEntries = stryMutAct_9fa48("2879") ? ["Stryker was here"] : (stryCov_9fa48("2879"), [])) {
    if (stryMutAct_9fa48("2880")) {
      {}
    } else {
      stryCov_9fa48("2880");
      for (const readiness of readinessEntries) {
        if (stryMutAct_9fa48("2881")) {
          {}
        } else {
          stryCov_9fa48("2881");
          const publication = stryMutAct_9fa48("2882") ? readiness.publication : (stryCov_9fa48("2882"), readiness?.publication);
          if (stryMutAct_9fa48("2885") ? publication || typeof publication === TYPEOF.OBJECT : stryMutAct_9fa48("2884") ? false : stryMutAct_9fa48("2883") ? true : (stryCov_9fa48("2883", "2884", "2885"), publication && (stryMutAct_9fa48("2887") ? typeof publication !== TYPEOF.OBJECT : stryMutAct_9fa48("2886") ? true : (stryCov_9fa48("2886", "2887"), typeof publication === TYPEOF.OBJECT)))) {
            if (stryMutAct_9fa48("2888")) {
              {}
            } else {
              stryCov_9fa48("2888");
              return publication;
            }
          }
        }
      }
      const publicationService = stryMutAct_9fa48("2891") ? this.controlPlaneReadinessService?.cdcGroupPropagationService && null : stryMutAct_9fa48("2890") ? false : stryMutAct_9fa48("2889") ? true : (stryCov_9fa48("2889", "2890", "2891"), (stryMutAct_9fa48("2892") ? this.controlPlaneReadinessService.cdcGroupPropagationService : (stryCov_9fa48("2892"), this.controlPlaneReadinessService?.cdcGroupPropagationService)) || null);
      if (stryMutAct_9fa48("2895") ? publicationService || typeof publicationService.getPublicationModeDiagnostics === TYPEOF.FUNCTION : stryMutAct_9fa48("2894") ? false : stryMutAct_9fa48("2893") ? true : (stryCov_9fa48("2893", "2894", "2895"), publicationService && (stryMutAct_9fa48("2897") ? typeof publicationService.getPublicationModeDiagnostics !== TYPEOF.FUNCTION : stryMutAct_9fa48("2896") ? true : (stryCov_9fa48("2896", "2897"), typeof publicationService.getPublicationModeDiagnostics === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("2898")) {
          {}
        } else {
          stryCov_9fa48("2898");
          return publicationService.getPublicationModeDiagnostics();
        }
      }
      return null;
    }
  } /**
    * Resolve recent readiness transitions recorded by the canonical owner.
    * @return {Object}
    * @private
    */
  resolveReadinessTransitionHistory() {
    if (stryMutAct_9fa48("2899")) {
      {}
    } else {
      stryCov_9fa48("2899");
      if (stryMutAct_9fa48("2902") ? !this.controlPlaneReadinessService && typeof this.controlPlaneReadinessService.getReadinessTransitionHistoryByNodeId !== TYPEOF.FUNCTION : stryMutAct_9fa48("2901") ? false : stryMutAct_9fa48("2900") ? true : (stryCov_9fa48("2900", "2901", "2902"), (stryMutAct_9fa48("2903") ? this.controlPlaneReadinessService : (stryCov_9fa48("2903"), !this.controlPlaneReadinessService)) || (stryMutAct_9fa48("2905") ? typeof this.controlPlaneReadinessService.getReadinessTransitionHistoryByNodeId === TYPEOF.FUNCTION : stryMutAct_9fa48("2904") ? false : (stryCov_9fa48("2904", "2905"), typeof this.controlPlaneReadinessService.getReadinessTransitionHistoryByNodeId !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("2906")) {
          {}
        } else {
          stryCov_9fa48("2906");
          return {};
        }
      }
      try {
        if (stryMutAct_9fa48("2907")) {
          {}
        } else {
          stryCov_9fa48("2907");
          const history = this.controlPlaneReadinessService.getReadinessTransitionHistoryByNodeId();
          return (stryMutAct_9fa48("2910") ? history || typeof history === TYPEOF.OBJECT : stryMutAct_9fa48("2909") ? false : stryMutAct_9fa48("2908") ? true : (stryCov_9fa48("2908", "2909", "2910"), history && (stryMutAct_9fa48("2912") ? typeof history !== TYPEOF.OBJECT : stryMutAct_9fa48("2911") ? true : (stryCov_9fa48("2911", "2912"), typeof history === TYPEOF.OBJECT)))) ? history : {};
        }
      } catch (_error) {
        if (stryMutAct_9fa48("2913")) {
          {}
        } else {
          stryCov_9fa48("2913");
          return {};
        }
      }
    }
  } /**
    * Resolve recent canonical participation decisions.
    * @return {Object[]}
    * @private
    */
  resolveParticipationDecisionDiagnostics() {
    if (stryMutAct_9fa48("2914")) {
      {}
    } else {
      stryCov_9fa48("2914");
      if (stryMutAct_9fa48("2917") ? !this.controlPlaneReadinessService && typeof this.controlPlaneReadinessService.getParticipationDecisionLedgerEntries !== TYPEOF.FUNCTION : stryMutAct_9fa48("2916") ? false : stryMutAct_9fa48("2915") ? true : (stryCov_9fa48("2915", "2916", "2917"), (stryMutAct_9fa48("2918") ? this.controlPlaneReadinessService : (stryCov_9fa48("2918"), !this.controlPlaneReadinessService)) || (stryMutAct_9fa48("2920") ? typeof this.controlPlaneReadinessService.getParticipationDecisionLedgerEntries === TYPEOF.FUNCTION : stryMutAct_9fa48("2919") ? false : (stryCov_9fa48("2919", "2920"), typeof this.controlPlaneReadinessService.getParticipationDecisionLedgerEntries !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("2921")) {
          {}
        } else {
          stryCov_9fa48("2921");
          return ADMIN_CACHE_DUMP.EMPTY;
        }
      }
      try {
        if (stryMutAct_9fa48("2922")) {
          {}
        } else {
          stryCov_9fa48("2922");
          const entries = this.controlPlaneReadinessService.getParticipationDecisionLedgerEntries(stryMutAct_9fa48("2923") ? {} : (stryCov_9fa48("2923"), {
            limit: CONTROL_PLANE_DIAGNOSTICS_LEDGER_LIMIT
          }));
          return Array.isArray(entries) ? entries : ADMIN_CACHE_DUMP.EMPTY;
        }
      } catch (_error) {
        if (stryMutAct_9fa48("2924")) {
          {}
        } else {
          stryCov_9fa48("2924");
          return ADMIN_CACHE_DUMP.EMPTY;
        }
      }
    }
  } /**
    * Resolve recent authoritative readiness repair attempts.
    * @return {Object[]}
    * @private
    */
  resolveAuthoritativeReadinessRepairDiagnostics() {
    if (stryMutAct_9fa48("2925")) {
      {}
    } else {
      stryCov_9fa48("2925");
      if (stryMutAct_9fa48("2928") ? !this.controlPlaneReadinessService && typeof this.controlPlaneReadinessService.getAuthoritativeReadinessRepairLedgerEntries !== TYPEOF.FUNCTION : stryMutAct_9fa48("2927") ? false : stryMutAct_9fa48("2926") ? true : (stryCov_9fa48("2926", "2927", "2928"), (stryMutAct_9fa48("2929") ? this.controlPlaneReadinessService : (stryCov_9fa48("2929"), !this.controlPlaneReadinessService)) || (stryMutAct_9fa48("2931") ? typeof this.controlPlaneReadinessService.getAuthoritativeReadinessRepairLedgerEntries === TYPEOF.FUNCTION : stryMutAct_9fa48("2930") ? false : (stryCov_9fa48("2930", "2931"), typeof this.controlPlaneReadinessService.getAuthoritativeReadinessRepairLedgerEntries !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("2932")) {
          {}
        } else {
          stryCov_9fa48("2932");
          return ADMIN_CACHE_DUMP.EMPTY;
        }
      }
      try {
        if (stryMutAct_9fa48("2933")) {
          {}
        } else {
          stryCov_9fa48("2933");
          const entries = this.controlPlaneReadinessService.getAuthoritativeReadinessRepairLedgerEntries(stryMutAct_9fa48("2934") ? {} : (stryCov_9fa48("2934"), {
            limit: CONTROL_PLANE_DIAGNOSTICS_LEDGER_LIMIT
          }));
          return Array.isArray(entries) ? entries : ADMIN_CACHE_DUMP.EMPTY;
        }
      } catch (_error) {
        if (stryMutAct_9fa48("2935")) {
          {}
        } else {
          stryCov_9fa48("2935");
          return ADMIN_CACHE_DUMP.EMPTY;
        }
      }
    }
  } /**
    * Resolve bounded recovery epoch history by node.
    * @return {Object}
    * @private
    */
  resolveRecoveryEpochDiagnostics() {
    if (stryMutAct_9fa48("2936")) {
      {}
    } else {
      stryCov_9fa48("2936");
      if (stryMutAct_9fa48("2939") ? !this.controlPlaneReadinessService && typeof this.controlPlaneReadinessService.getRecoveryEpochHistoryByNodeId !== TYPEOF.FUNCTION : stryMutAct_9fa48("2938") ? false : stryMutAct_9fa48("2937") ? true : (stryCov_9fa48("2937", "2938", "2939"), (stryMutAct_9fa48("2940") ? this.controlPlaneReadinessService : (stryCov_9fa48("2940"), !this.controlPlaneReadinessService)) || (stryMutAct_9fa48("2942") ? typeof this.controlPlaneReadinessService.getRecoveryEpochHistoryByNodeId === TYPEOF.FUNCTION : stryMutAct_9fa48("2941") ? false : (stryCov_9fa48("2941", "2942"), typeof this.controlPlaneReadinessService.getRecoveryEpochHistoryByNodeId !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("2943")) {
          {}
        } else {
          stryCov_9fa48("2943");
          return {};
        }
      }
      try {
        if (stryMutAct_9fa48("2944")) {
          {}
        } else {
          stryCov_9fa48("2944");
          const history = this.controlPlaneReadinessService.getRecoveryEpochHistoryByNodeId();
          return (stryMutAct_9fa48("2947") ? history || typeof history === TYPEOF.OBJECT : stryMutAct_9fa48("2946") ? false : stryMutAct_9fa48("2945") ? true : (stryCov_9fa48("2945", "2946", "2947"), history && (stryMutAct_9fa48("2949") ? typeof history !== TYPEOF.OBJECT : stryMutAct_9fa48("2948") ? true : (stryCov_9fa48("2948", "2949"), typeof history === TYPEOF.OBJECT)))) ? history : {};
        }
      } catch (_error) {
        if (stryMutAct_9fa48("2950")) {
          {}
        } else {
          stryCov_9fa48("2950");
          return {};
        }
      }
    }
  } /**
    * Resolve recent control-plane system-table operations.
    * @return {Object[]}
    * @private
    */
  resolveControlPlaneOperationDiagnostics() {
    if (stryMutAct_9fa48("2951")) {
      {}
    } else {
      stryCov_9fa48("2951");
      if (stryMutAct_9fa48("2954") ? !this.controlPlaneSystemTableGateway && typeof this.controlPlaneSystemTableGateway.getControlPlaneOperationLedgerEntries !== TYPEOF.FUNCTION : stryMutAct_9fa48("2953") ? false : stryMutAct_9fa48("2952") ? true : (stryCov_9fa48("2952", "2953", "2954"), (stryMutAct_9fa48("2955") ? this.controlPlaneSystemTableGateway : (stryCov_9fa48("2955"), !this.controlPlaneSystemTableGateway)) || (stryMutAct_9fa48("2957") ? typeof this.controlPlaneSystemTableGateway.getControlPlaneOperationLedgerEntries === TYPEOF.FUNCTION : stryMutAct_9fa48("2956") ? false : (stryCov_9fa48("2956", "2957"), typeof this.controlPlaneSystemTableGateway.getControlPlaneOperationLedgerEntries !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("2958")) {
          {}
        } else {
          stryCov_9fa48("2958");
          return ADMIN_CACHE_DUMP.EMPTY;
        }
      }
      try {
        if (stryMutAct_9fa48("2959")) {
          {}
        } else {
          stryCov_9fa48("2959");
          const entries = this.controlPlaneSystemTableGateway.getControlPlaneOperationLedgerEntries(stryMutAct_9fa48("2960") ? {} : (stryCov_9fa48("2960"), {
            limit: CONTROL_PLANE_DIAGNOSTICS_LEDGER_LIMIT
          }));
          return Array.isArray(entries) ? entries : ADMIN_CACHE_DUMP.EMPTY;
        }
      } catch (_error) {
        if (stryMutAct_9fa48("2961")) {
          {}
        } else {
          stryCov_9fa48("2961");
          return ADMIN_CACHE_DUMP.EMPTY;
        }
      }
    }
  } /**
    * Resolve heartbeat publication diagnostics from the local owner.
    * @return {Object|null}
    * @private
    */
  resolveHeartbeatPublicationDiagnostics() {
    if (stryMutAct_9fa48("2962")) {
      {}
    } else {
      stryCov_9fa48("2962");
      if (stryMutAct_9fa48("2965") ? !this.heartbeatService && typeof this.heartbeatService.getHeartbeatPublicationDiagnostics !== TYPEOF.FUNCTION : stryMutAct_9fa48("2964") ? false : stryMutAct_9fa48("2963") ? true : (stryCov_9fa48("2963", "2964", "2965"), (stryMutAct_9fa48("2966") ? this.heartbeatService : (stryCov_9fa48("2966"), !this.heartbeatService)) || (stryMutAct_9fa48("2968") ? typeof this.heartbeatService.getHeartbeatPublicationDiagnostics === TYPEOF.FUNCTION : stryMutAct_9fa48("2967") ? false : (stryCov_9fa48("2967", "2968"), typeof this.heartbeatService.getHeartbeatPublicationDiagnostics !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("2969")) {
          {}
        } else {
          stryCov_9fa48("2969");
          return null;
        }
      }
      try {
        if (stryMutAct_9fa48("2970")) {
          {}
        } else {
          stryCov_9fa48("2970");
          const diagnostics = this.heartbeatService.getHeartbeatPublicationDiagnostics();
          return (stryMutAct_9fa48("2973") ? diagnostics || typeof diagnostics === TYPEOF.OBJECT : stryMutAct_9fa48("2972") ? false : stryMutAct_9fa48("2971") ? true : (stryCov_9fa48("2971", "2972", "2973"), diagnostics && (stryMutAct_9fa48("2975") ? typeof diagnostics !== TYPEOF.OBJECT : stryMutAct_9fa48("2974") ? true : (stryCov_9fa48("2974", "2975"), typeof diagnostics === TYPEOF.OBJECT)))) ? diagnostics : null;
        }
      } catch (_error) {
        if (stryMutAct_9fa48("2976")) {
          {}
        } else {
          stryCov_9fa48("2976");
          return null;
        }
      }
    }
  } /**
    * Resolve split-evaluation diagnostics from the canonical owner.
    * @return {Object|null}
    * @private
    */
  resolveSplitEvaluationDiagnostics() {
    if (stryMutAct_9fa48("2977")) {
      {}
    } else {
      stryCov_9fa48("2977");
      const splitManager = stryMutAct_9fa48("2978") ? this.sqlQueryEngine.partitionSplitMergeManager : (stryCov_9fa48("2978"), this.sqlQueryEngine?.partitionSplitMergeManager);
      if (stryMutAct_9fa48("2981") ? !splitManager && typeof splitManager.getEvaluationDiagnostics !== TYPEOF.FUNCTION : stryMutAct_9fa48("2980") ? false : stryMutAct_9fa48("2979") ? true : (stryCov_9fa48("2979", "2980", "2981"), (stryMutAct_9fa48("2982") ? splitManager : (stryCov_9fa48("2982"), !splitManager)) || (stryMutAct_9fa48("2984") ? typeof splitManager.getEvaluationDiagnostics === TYPEOF.FUNCTION : stryMutAct_9fa48("2983") ? false : (stryCov_9fa48("2983", "2984"), typeof splitManager.getEvaluationDiagnostics !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("2985")) {
          {}
        } else {
          stryCov_9fa48("2985");
          return null;
        }
      }
      try {
        if (stryMutAct_9fa48("2986")) {
          {}
        } else {
          stryCov_9fa48("2986");
          const diagnostics = splitManager.getEvaluationDiagnostics();
          return (stryMutAct_9fa48("2989") ? diagnostics || typeof diagnostics === TYPEOF.OBJECT : stryMutAct_9fa48("2988") ? false : stryMutAct_9fa48("2987") ? true : (stryCov_9fa48("2987", "2988", "2989"), diagnostics && (stryMutAct_9fa48("2991") ? typeof diagnostics !== TYPEOF.OBJECT : stryMutAct_9fa48("2990") ? true : (stryCov_9fa48("2990", "2991"), typeof diagnostics === TYPEOF.OBJECT)))) ? diagnostics : null;
        }
      } catch (_error) {
        if (stryMutAct_9fa48("2992")) {
          {}
        } else {
          stryCov_9fa48("2992");
          return null;
        }
      }
    }
  } /**
    * Build persisted workflow-admission diagnostics from table metadata.
    * @param {Array<Object>} tableRows
    * @return {Object}
    * @private
    */
  buildWorkflowAdmissionDiagnostics(tableRows = stryMutAct_9fa48("2993") ? ["Stryker was here"] : (stryCov_9fa48("2993"), [])) {
    if (stryMutAct_9fa48("2994")) {
      {}
    } else {
      stryCov_9fa48("2994");
      const workflowAdmissionsByWorkflowId = {};
      const timeoutClassifications = stryMutAct_9fa48("2995") ? ["Stryker was here"] : (stryCov_9fa48("2995"), []);
      for (const tableRow of Array.isArray(tableRows) ? tableRows : stryMutAct_9fa48("2996") ? ["Stryker was here"] : (stryCov_9fa48("2996"), [])) {
        if (stryMutAct_9fa48("2997")) {
          {}
        } else {
          stryCov_9fa48("2997");
          const workflow = this.buildWorkflowAdmissionEntry(tableRow);
          if (stryMutAct_9fa48("3000") ? false : stryMutAct_9fa48("2999") ? true : stryMutAct_9fa48("2998") ? workflow : (stryCov_9fa48("2998", "2999", "3000"), !workflow)) {
            if (stryMutAct_9fa48("3001")) {
              {}
            } else {
              stryCov_9fa48("3001");
              continue;
            }
          }
          workflowAdmissionsByWorkflowId[workflow.workflowId] = workflow;
          if (stryMutAct_9fa48("3004") ? workflow.timeoutClassification || typeof workflow.timeoutClassification === TYPEOF.OBJECT : stryMutAct_9fa48("3003") ? false : stryMutAct_9fa48("3002") ? true : (stryCov_9fa48("3002", "3003", "3004"), workflow.timeoutClassification && (stryMutAct_9fa48("3006") ? typeof workflow.timeoutClassification !== TYPEOF.OBJECT : stryMutAct_9fa48("3005") ? true : (stryCov_9fa48("3005", "3006"), typeof workflow.timeoutClassification === TYPEOF.OBJECT)))) {
            if (stryMutAct_9fa48("3007")) {
              {}
            } else {
              stryCov_9fa48("3007");
              timeoutClassifications.push(stryMutAct_9fa48("3008") ? {} : (stryCov_9fa48("3008"), {
                workflowId: workflow.workflowId,
                workflowType: workflow.workflowType,
                tableId: workflow.tableId,
                tableName: workflow.tableName,
                transitionState: workflow.transitionState,
                timeoutClassification: workflow.timeoutClassification
              }));
            }
          }
        }
      }
      return stryMutAct_9fa48("3009") ? {} : (stryCov_9fa48("3009"), {
        workflowAdmissionsByWorkflowId,
        timeoutClassifications
      });
    }
  } /**
    * Build one workflow-admission record from table transition metadata.
    * @param {Object} tableRow
    * @return {Object|null}
    * @private
    */
  buildWorkflowAdmissionEntry(tableRow) {
    if (stryMutAct_9fa48("3010")) {
      {}
    } else {
      stryCov_9fa48("3010");
      const transitionState = firstStringField(tableRow, stryMutAct_9fa48("3011") ? "" : (stryCov_9fa48("3011"), 'partition_transition_state'), stryMutAct_9fa48("3012") ? "" : (stryCov_9fa48("3012"), 'partitionTransitionState'));
      const metadata = this.parseWorkflowTransitionMetadata(tableRow);
      const workflowId = firstStringField(metadata, PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID);
      if (stryMutAct_9fa48("3015") ? (!transitionState || !metadata) && !workflowId : stryMutAct_9fa48("3014") ? false : stryMutAct_9fa48("3013") ? true : (stryCov_9fa48("3013", "3014", "3015"), (stryMutAct_9fa48("3017") ? !transitionState && !metadata : stryMutAct_9fa48("3016") ? false : (stryCov_9fa48("3016", "3017"), (stryMutAct_9fa48("3018") ? transitionState : (stryCov_9fa48("3018"), !transitionState)) || (stryMutAct_9fa48("3019") ? metadata : (stryCov_9fa48("3019"), !metadata)))) || (stryMutAct_9fa48("3020") ? workflowId : (stryCov_9fa48("3020"), !workflowId)))) {
        if (stryMutAct_9fa48("3021")) {
          {}
        } else {
          stryCov_9fa48("3021");
          return null;
        }
      }
      const admission = (stryMutAct_9fa48("3024") ? metadata?.[PARTITION_TRANSITION_METADATA_FIELD.ADMISSION] || typeof metadata[PARTITION_TRANSITION_METADATA_FIELD.ADMISSION] === TYPEOF.OBJECT : stryMutAct_9fa48("3023") ? false : stryMutAct_9fa48("3022") ? true : (stryCov_9fa48("3022", "3023", "3024"), (stryMutAct_9fa48("3025") ? metadata[PARTITION_TRANSITION_METADATA_FIELD.ADMISSION] : (stryCov_9fa48("3025"), metadata?.[PARTITION_TRANSITION_METADATA_FIELD.ADMISSION])) && (stryMutAct_9fa48("3027") ? typeof metadata[PARTITION_TRANSITION_METADATA_FIELD.ADMISSION] !== TYPEOF.OBJECT : stryMutAct_9fa48("3026") ? true : (stryCov_9fa48("3026", "3027"), typeof metadata[PARTITION_TRANSITION_METADATA_FIELD.ADMISSION] === TYPEOF.OBJECT)))) ? metadata[PARTITION_TRANSITION_METADATA_FIELD.ADMISSION] : null;
      const failure = (stryMutAct_9fa48("3030") ? metadata?.[PARTITION_TRANSITION_METADATA_FIELD.FAILURE] || typeof metadata[PARTITION_TRANSITION_METADATA_FIELD.FAILURE] === TYPEOF.OBJECT : stryMutAct_9fa48("3029") ? false : stryMutAct_9fa48("3028") ? true : (stryCov_9fa48("3028", "3029", "3030"), (stryMutAct_9fa48("3031") ? metadata[PARTITION_TRANSITION_METADATA_FIELD.FAILURE] : (stryCov_9fa48("3031"), metadata?.[PARTITION_TRANSITION_METADATA_FIELD.FAILURE])) && (stryMutAct_9fa48("3033") ? typeof metadata[PARTITION_TRANSITION_METADATA_FIELD.FAILURE] !== TYPEOF.OBJECT : stryMutAct_9fa48("3032") ? true : (stryCov_9fa48("3032", "3033"), typeof metadata[PARTITION_TRANSITION_METADATA_FIELD.FAILURE] === TYPEOF.OBJECT)))) ? metadata[PARTITION_TRANSITION_METADATA_FIELD.FAILURE] : null;
      const blockingReasons = Array.isArray(stryMutAct_9fa48("3034") ? admission.blockingReasons : (stryCov_9fa48("3034"), admission?.blockingReasons)) ? admission.blockingReasons : ADMIN_CACHE_DUMP.EMPTY;
      const timeoutClassification = (stryMutAct_9fa48("3037") ? failure?.timeoutClassification || typeof failure.timeoutClassification === TYPEOF.OBJECT : stryMutAct_9fa48("3036") ? false : stryMutAct_9fa48("3035") ? true : (stryCov_9fa48("3035", "3036", "3037"), (stryMutAct_9fa48("3038") ? failure.timeoutClassification : (stryCov_9fa48("3038"), failure?.timeoutClassification)) && (stryMutAct_9fa48("3040") ? typeof failure.timeoutClassification !== TYPEOF.OBJECT : stryMutAct_9fa48("3039") ? true : (stryCov_9fa48("3039", "3040"), typeof failure.timeoutClassification === TYPEOF.OBJECT)))) ? failure.timeoutClassification : null;
      const retry = (stryMutAct_9fa48("3043") ? metadata?.[PARTITION_TRANSITION_METADATA_FIELD.RETRY] || typeof metadata[PARTITION_TRANSITION_METADATA_FIELD.RETRY] === TYPEOF.OBJECT : stryMutAct_9fa48("3042") ? false : stryMutAct_9fa48("3041") ? true : (stryCov_9fa48("3041", "3042", "3043"), (stryMutAct_9fa48("3044") ? metadata[PARTITION_TRANSITION_METADATA_FIELD.RETRY] : (stryCov_9fa48("3044"), metadata?.[PARTITION_TRANSITION_METADATA_FIELD.RETRY])) && (stryMutAct_9fa48("3046") ? typeof metadata[PARTITION_TRANSITION_METADATA_FIELD.RETRY] !== TYPEOF.OBJECT : stryMutAct_9fa48("3045") ? true : (stryCov_9fa48("3045", "3046"), typeof metadata[PARTITION_TRANSITION_METADATA_FIELD.RETRY] === TYPEOF.OBJECT)))) ? metadata[PARTITION_TRANSITION_METADATA_FIELD.RETRY] : null;
      const topologySnapshot = (stryMutAct_9fa48("3049") ? metadata?.[PARTITION_TRANSITION_METADATA_FIELD.TOPOLOGY_SNAPSHOT] || typeof metadata[PARTITION_TRANSITION_METADATA_FIELD.TOPOLOGY_SNAPSHOT] === TYPEOF.OBJECT : stryMutAct_9fa48("3048") ? false : stryMutAct_9fa48("3047") ? true : (stryCov_9fa48("3047", "3048", "3049"), (stryMutAct_9fa48("3050") ? metadata[PARTITION_TRANSITION_METADATA_FIELD.TOPOLOGY_SNAPSHOT] : (stryCov_9fa48("3050"), metadata?.[PARTITION_TRANSITION_METADATA_FIELD.TOPOLOGY_SNAPSHOT])) && (stryMutAct_9fa48("3052") ? typeof metadata[PARTITION_TRANSITION_METADATA_FIELD.TOPOLOGY_SNAPSHOT] !== TYPEOF.OBJECT : stryMutAct_9fa48("3051") ? true : (stryCov_9fa48("3051", "3052"), typeof metadata[PARTITION_TRANSITION_METADATA_FIELD.TOPOLOGY_SNAPSHOT] === TYPEOF.OBJECT)))) ? metadata[PARTITION_TRANSITION_METADATA_FIELD.TOPOLOGY_SNAPSHOT] : null;
      return stryMutAct_9fa48("3053") ? {} : (stryCov_9fa48("3053"), {
        workflowId,
        workflowType: MANAGED_SPLIT_WORKFLOW_TYPE,
        transitionState,
        tableId: firstStringField(tableRow, COLUMN.TABLE_ID, ADMIN_CONTROL_SNAPSHOT_LITERAL.ID),
        tableName: firstStringField(tableRow, COLUMN.TABLE_NAME, ADMIN_CONTROL_SNAPSHOT_LITERAL.NAME),
        sourcePartitionId: firstStringField(metadata, PARTITION_TRANSITION_METADATA_FIELD.SOURCE_PARTITION_ID),
        targetPartitionIds: Array.isArray(stryMutAct_9fa48("3054") ? metadata[PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS] : (stryCov_9fa48("3054"), metadata?.[PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS])) ? metadata[PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS] : ADMIN_CACHE_DUMP.EMPTY,
        topologySnapshotCapturedAt: firstStringField(topologySnapshot, ADMIN_CONTROL_SNAPSHOT_LITERAL.CAPTUREDAT),
        sourceLeaderNodeId: firstStringField(topologySnapshot, ADMIN_CONTROL_SNAPSHOT_LITERAL.SOURCELEADERNODEID),
        candidateTargetNodeIds: Array.isArray(stryMutAct_9fa48("3055") ? admission.candidateTargetNodeIds : (stryCov_9fa48("3055"), admission?.candidateTargetNodeIds)) ? admission.candidateTargetNodeIds : Array.isArray(stryMutAct_9fa48("3056") ? topologySnapshot.candidateTargetNodeIds : (stryCov_9fa48("3056"), topologySnapshot?.candidateTargetNodeIds)) ? topologySnapshot.candidateTargetNodeIds : ADMIN_CACHE_DUMP.EMPTY,
        sourceRoutableNodeIds: Array.isArray(stryMutAct_9fa48("3057") ? admission.sourceRoutableNodeIds : (stryCov_9fa48("3057"), admission?.sourceRoutableNodeIds)) ? admission.sourceRoutableNodeIds : Array.isArray(stryMutAct_9fa48("3058") ? topologySnapshot.sourceRoutableNodeIds : (stryCov_9fa48("3058"), topologySnapshot?.sourceRoutableNodeIds)) ? topologySnapshot.sourceRoutableNodeIds : ADMIN_CACHE_DUMP.EMPTY,
        eligibleNodeIds: Array.isArray(stryMutAct_9fa48("3059") ? admission.eligibleNodeIds : (stryCov_9fa48("3059"), admission?.eligibleNodeIds)) ? admission.eligibleNodeIds : ADMIN_CACHE_DUMP.EMPTY,
        ineligibleNodes: Array.isArray(stryMutAct_9fa48("3060") ? admission.ineligibleNodes : (stryCov_9fa48("3060"), admission?.ineligibleNodes)) ? admission.ineligibleNodes : ADMIN_CACHE_DUMP.EMPTY,
        estimatedBytes: Number.isFinite(Number(stryMutAct_9fa48("3061") ? admission.estimatedBytes : (stryCov_9fa48("3061"), admission?.estimatedBytes))) ? Number(admission.estimatedBytes) : null,
        admissionDecisionAt: firstStringField(admission, ADMIN_CONTROL_SNAPSHOT_LITERAL.DECISIONTIMESTAMP),
        admission,
        blockingReasons,
        failure,
        failedAt: firstStringField(failure, ADMIN_CONTROL_SNAPSHOT_LITERAL.FAILEDAT),
        nextAttemptAt: firstStringField(retry, ADMIN_CONTROL_SNAPSHOT_LITERAL.NEXTATTEMPTAT),
        timeoutClassification
      });
    }
  } /**
    * Parse table transition metadata.
    * @param {Object} tableRow
    * @return {Object|null}
    * @private
    */
  parseWorkflowTransitionMetadata(tableRow) {
    if (stryMutAct_9fa48("3062")) {
      {}
    } else {
      stryCov_9fa48("3062");
      const rawMetadata = stryMutAct_9fa48("3063") ? (tableRow?.partition_transition_metadata ?? tableRow?.partitionTransitionMetadata) && null : (stryCov_9fa48("3063"), (stryMutAct_9fa48("3064") ? tableRow?.partition_transition_metadata && tableRow?.partitionTransitionMetadata : (stryCov_9fa48("3064"), (stryMutAct_9fa48("3065") ? tableRow.partition_transition_metadata : (stryCov_9fa48("3065"), tableRow?.partition_transition_metadata)) ?? (stryMutAct_9fa48("3066") ? tableRow.partitionTransitionMetadata : (stryCov_9fa48("3066"), tableRow?.partitionTransitionMetadata)))) ?? null);
      if (stryMutAct_9fa48("3069") ? false : stryMutAct_9fa48("3068") ? true : stryMutAct_9fa48("3067") ? rawMetadata : (stryCov_9fa48("3067", "3068", "3069"), !rawMetadata)) {
        if (stryMutAct_9fa48("3070")) {
          {}
        } else {
          stryCov_9fa48("3070");
          return null;
        }
      }
      if (stryMutAct_9fa48("3073") ? rawMetadata || typeof rawMetadata === TYPEOF.OBJECT : stryMutAct_9fa48("3072") ? false : stryMutAct_9fa48("3071") ? true : (stryCov_9fa48("3071", "3072", "3073"), rawMetadata && (stryMutAct_9fa48("3075") ? typeof rawMetadata !== TYPEOF.OBJECT : stryMutAct_9fa48("3074") ? true : (stryCov_9fa48("3074", "3075"), typeof rawMetadata === TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("3076")) {
          {}
        } else {
          stryCov_9fa48("3076");
          return rawMetadata;
        }
      }
      if (stryMutAct_9fa48("3079") ? typeof rawMetadata === TYPEOF.STRING : stryMutAct_9fa48("3078") ? false : stryMutAct_9fa48("3077") ? true : (stryCov_9fa48("3077", "3078", "3079"), typeof rawMetadata !== TYPEOF.STRING)) {
        if (stryMutAct_9fa48("3080")) {
          {}
        } else {
          stryCov_9fa48("3080");
          return null;
        }
      }
      try {
        if (stryMutAct_9fa48("3081")) {
          {}
        } else {
          stryCov_9fa48("3081");
          const parsed = JSON.parse(rawMetadata);
          return (stryMutAct_9fa48("3084") ? parsed || typeof parsed === TYPEOF.OBJECT : stryMutAct_9fa48("3083") ? false : stryMutAct_9fa48("3082") ? true : (stryCov_9fa48("3082", "3083", "3084"), parsed && (stryMutAct_9fa48("3086") ? typeof parsed !== TYPEOF.OBJECT : stryMutAct_9fa48("3085") ? true : (stryCov_9fa48("3085", "3086"), typeof parsed === TYPEOF.OBJECT)))) ? parsed : null;
        }
      } catch (_error) {
        if (stryMutAct_9fa48("3087")) {
          {}
        } else {
          stryCov_9fa48("3087");
          return null;
        }
      }
    }
  } /**
    * Build canonical leader summary from owner rows plus
    * replica-role detail.
    * Canonical leader identity comes from
    * partitions.leader_node_id.
    * Replica rows are attached only as supporting diagnostics.
    * @param {Array<Object>} partitionRows
    * @param {Array<Object>} serviceRows
    * @return {Object}
    */
  buildControlSnapshotLeaderSummary(partitionRows = stryMutAct_9fa48("3088") ? ["Stryker was here"] : (stryCov_9fa48("3088"), []), serviceRows = stryMutAct_9fa48("3089") ? ["Stryker was here"] : (stryCov_9fa48("3089"), [])) {
    if (stryMutAct_9fa48("3090")) {
      {}
    } else {
      stryCov_9fa48("3090");
      const leaders = {};
      const replicaRoles = {};
      const replicaLeaderNodeIdsByPartition = new Map();
      for (const serviceRow of serviceRows) {
        if (stryMutAct_9fa48("3091")) {
          {}
        } else {
          stryCov_9fa48("3091");
          const serviceType = firstStringField(serviceRow, COLUMN.SERVICE_TYPE, stryMutAct_9fa48("3092") ? "" : (stryCov_9fa48("3092"), 'type'), stryMutAct_9fa48("3093") ? "" : (stryCov_9fa48("3093"), 'serviceType'));
          if (stryMutAct_9fa48("3096") ? serviceType === SERVICE_TYPE_PARTITION : stryMutAct_9fa48("3095") ? false : stryMutAct_9fa48("3094") ? true : (stryCov_9fa48("3094", "3095", "3096"), serviceType !== SERVICE_TYPE_PARTITION)) {
            if (stryMutAct_9fa48("3097")) {
              {}
            } else {
              stryCov_9fa48("3097");
              continue;
            }
          }
          const partitionId = firstStringField(serviceRow, COLUMN.PARTITION_ID, stryMutAct_9fa48("3098") ? "" : (stryCov_9fa48("3098"), 'partitionId'));
          if (stryMutAct_9fa48("3101") ? false : stryMutAct_9fa48("3100") ? true : stryMutAct_9fa48("3099") ? partitionId : (stryCov_9fa48("3099", "3100", "3101"), !partitionId)) {
            if (stryMutAct_9fa48("3102")) {
              {}
            } else {
              stryCov_9fa48("3102");
              continue;
            }
          }
          const raftRole = firstStringField(serviceRow, COLUMN.RAFT_ROLE, stryMutAct_9fa48("3103") ? "" : (stryCov_9fa48("3103"), 'raftRole'));
          const normalizedRaftRole = stryMutAct_9fa48("3104") ? String(raftRole || '').toUpperCase() : (stryCov_9fa48("3104"), String(stryMutAct_9fa48("3107") ? raftRole && '' : stryMutAct_9fa48("3106") ? false : stryMutAct_9fa48("3105") ? true : (stryCov_9fa48("3105", "3106", "3107"), raftRole || (stryMutAct_9fa48("3108") ? "Stryker was here!" : (stryCov_9fa48("3108"), '')))).toLowerCase());
          if (stryMutAct_9fa48("3111") ? false : stryMutAct_9fa48("3110") ? true : stryMutAct_9fa48("3109") ? normalizedRaftRole : (stryCov_9fa48("3109", "3110", "3111"), !normalizedRaftRole)) {
            if (stryMutAct_9fa48("3112")) {
              {}
            } else {
              stryCov_9fa48("3112");
              continue;
            }
          }
          const replicaId = firstStringField(serviceRow, COLUMN.REPLICA_ID, COLUMN.SERVICE_ID, stryMutAct_9fa48("3113") ? "" : (stryCov_9fa48("3113"), 'replicaId'), stryMutAct_9fa48("3114") ? "" : (stryCov_9fa48("3114"), 'id'));
          if (stryMutAct_9fa48("3117") ? false : stryMutAct_9fa48("3116") ? true : stryMutAct_9fa48("3115") ? replicaId : (stryCov_9fa48("3115", "3116", "3117"), !replicaId)) {
            if (stryMutAct_9fa48("3118")) {
              {}
            } else {
              stryCov_9fa48("3118");
              continue;
            }
          }
          replicaRoles[partitionId] = stryMutAct_9fa48("3121") ? replicaRoles[partitionId] && {} : stryMutAct_9fa48("3120") ? false : stryMutAct_9fa48("3119") ? true : (stryCov_9fa48("3119", "3120", "3121"), replicaRoles[partitionId] || {});
          replicaRoles[partitionId][replicaId] = normalizedRaftRole;
          if (stryMutAct_9fa48("3124") ? normalizedRaftRole === LEADER_RAFT_ROLE : stryMutAct_9fa48("3123") ? false : stryMutAct_9fa48("3122") ? true : (stryCov_9fa48("3122", "3123", "3124"), normalizedRaftRole !== LEADER_RAFT_ROLE)) {
            if (stryMutAct_9fa48("3125")) {
              {}
            } else {
              stryCov_9fa48("3125");
              continue;
            }
          }
          const leaderNodeId = firstStringField(serviceRow, COLUMN.LEADER_NODE_ID, COLUMN.NODE_ID, stryMutAct_9fa48("3126") ? "" : (stryCov_9fa48("3126"), 'nodeId'));
          if (stryMutAct_9fa48("3129") ? false : stryMutAct_9fa48("3128") ? true : stryMutAct_9fa48("3127") ? leaderNodeId : (stryCov_9fa48("3127", "3128", "3129"), !leaderNodeId)) {
            if (stryMutAct_9fa48("3130")) {
              {}
            } else {
              stryCov_9fa48("3130");
              continue;
            }
          }
          let partitionLeaderNodeIds = replicaLeaderNodeIdsByPartition.get(partitionId);
          if (stryMutAct_9fa48("3133") ? false : stryMutAct_9fa48("3132") ? true : stryMutAct_9fa48("3131") ? partitionLeaderNodeIds : (stryCov_9fa48("3131", "3132", "3133"), !partitionLeaderNodeIds)) {
            if (stryMutAct_9fa48("3134")) {
              {}
            } else {
              stryCov_9fa48("3134");
              partitionLeaderNodeIds = new Set();
              replicaLeaderNodeIdsByPartition.set(partitionId, partitionLeaderNodeIds);
            }
          }
          partitionLeaderNodeIds.add(leaderNodeId);
        }
      }
      const replicaRoleDiagnostics = {};
      for (const partitionRow of partitionRows) {
        if (stryMutAct_9fa48("3135")) {
          {}
        } else {
          stryCov_9fa48("3135");
          const partitionId = firstStringField(partitionRow, COLUMN.PARTITION_ID, stryMutAct_9fa48("3136") ? "" : (stryCov_9fa48("3136"), 'partitionId'), stryMutAct_9fa48("3137") ? "" : (stryCov_9fa48("3137"), 'id'));
          if (stryMutAct_9fa48("3140") ? false : stryMutAct_9fa48("3139") ? true : stryMutAct_9fa48("3138") ? partitionId : (stryCov_9fa48("3138", "3139", "3140"), !partitionId)) {
            if (stryMutAct_9fa48("3141")) {
              {}
            } else {
              stryCov_9fa48("3141");
              continue;
            }
          }
          const canonicalLeaderNodeId = firstStringField(partitionRow, COLUMN.LEADER_NODE_ID, stryMutAct_9fa48("3142") ? "" : (stryCov_9fa48("3142"), 'leaderNodeId'));
          if (stryMutAct_9fa48("3144") ? false : stryMutAct_9fa48("3143") ? true : (stryCov_9fa48("3143", "3144"), canonicalLeaderNodeId)) {
            if (stryMutAct_9fa48("3145")) {
              {}
            } else {
              stryCov_9fa48("3145");
              leaders[partitionId] = canonicalLeaderNodeId;
            }
          }
          const replicaLeaderNodeIds = uniqueSorted(Array.from(stryMutAct_9fa48("3148") ? replicaLeaderNodeIdsByPartition.get(partitionId) && [] : stryMutAct_9fa48("3147") ? false : stryMutAct_9fa48("3146") ? true : (stryCov_9fa48("3146", "3147", "3148"), replicaLeaderNodeIdsByPartition.get(partitionId) || (stryMutAct_9fa48("3149") ? ["Stryker was here"] : (stryCov_9fa48("3149"), [])))));
          const inconsistentReplicaRoles = stryMutAct_9fa48("3152") ? replicaLeaderNodeIds.length > NUM.ONE && canonicalLeaderNodeId && replicaLeaderNodeIds.length > NUM.ZERO && !replicaLeaderNodeIds.includes(canonicalLeaderNodeId) : stryMutAct_9fa48("3151") ? false : stryMutAct_9fa48("3150") ? true : (stryCov_9fa48("3150", "3151", "3152"), (stryMutAct_9fa48("3155") ? replicaLeaderNodeIds.length <= NUM.ONE : stryMutAct_9fa48("3154") ? replicaLeaderNodeIds.length >= NUM.ONE : stryMutAct_9fa48("3153") ? false : (stryCov_9fa48("3153", "3154", "3155"), replicaLeaderNodeIds.length > NUM.ONE)) || (stryMutAct_9fa48("3157") ? canonicalLeaderNodeId && replicaLeaderNodeIds.length > NUM.ZERO || !replicaLeaderNodeIds.includes(canonicalLeaderNodeId) : stryMutAct_9fa48("3156") ? false : (stryCov_9fa48("3156", "3157"), (stryMutAct_9fa48("3159") ? canonicalLeaderNodeId || replicaLeaderNodeIds.length > NUM.ZERO : stryMutAct_9fa48("3158") ? true : (stryCov_9fa48("3158", "3159"), canonicalLeaderNodeId && (stryMutAct_9fa48("3162") ? replicaLeaderNodeIds.length <= NUM.ZERO : stryMutAct_9fa48("3161") ? replicaLeaderNodeIds.length >= NUM.ZERO : stryMutAct_9fa48("3160") ? true : (stryCov_9fa48("3160", "3161", "3162"), replicaLeaderNodeIds.length > NUM.ZERO)))) && (stryMutAct_9fa48("3163") ? replicaLeaderNodeIds.includes(canonicalLeaderNodeId) : (stryCov_9fa48("3163"), !replicaLeaderNodeIds.includes(canonicalLeaderNodeId))))));
          replicaRoleDiagnostics[partitionId] = stryMutAct_9fa48("3164") ? {} : (stryCov_9fa48("3164"), {
            canonicalLeaderNodeId: stryMutAct_9fa48("3167") ? canonicalLeaderNodeId && null : stryMutAct_9fa48("3166") ? false : stryMutAct_9fa48("3165") ? true : (stryCov_9fa48("3165", "3166", "3167"), canonicalLeaderNodeId || null),
            source: TABLES.PARTITIONS,
            inconsistentReplicaRoles,
            replicaLeaderNodeIds,
            issues: inconsistentReplicaRoles ? stryMutAct_9fa48("3168") ? [] : (stryCov_9fa48("3168"), [CONSISTENCY_MISMATCH_KIND.REPLICA_ROLE]) : stryMutAct_9fa48("3169") ? ["Stryker was here"] : (stryCov_9fa48("3169"), [])
          });
        }
      }
      return stryMutAct_9fa48("3170") ? {} : (stryCov_9fa48("3170"), {
        leaders,
        replicaRoles,
        replicaRoleDiagnostics
      });
    }
  } /**
    * Build voter-count map per partition from local services rows.
    * @param {Array<Object>} serviceRows
    * @return {Object}
    */
  buildControlSnapshotVoterCounts(serviceRows = stryMutAct_9fa48("3171") ? ["Stryker was here"] : (stryCov_9fa48("3171"), [])) {
    if (stryMutAct_9fa48("3172")) {
      {}
    } else {
      stryCov_9fa48("3172");
      const voterCounts = {};
      for (const serviceRow of serviceRows) {
        if (stryMutAct_9fa48("3173")) {
          {}
        } else {
          stryCov_9fa48("3173");
          const serviceType = firstStringField(serviceRow, COLUMN.SERVICE_TYPE, stryMutAct_9fa48("3174") ? "" : (stryCov_9fa48("3174"), 'type'), stryMutAct_9fa48("3175") ? "" : (stryCov_9fa48("3175"), 'serviceType'));
          if (stryMutAct_9fa48("3178") ? serviceType === SERVICE_TYPE_PARTITION : stryMutAct_9fa48("3177") ? false : stryMutAct_9fa48("3176") ? true : (stryCov_9fa48("3176", "3177", "3178"), serviceType !== SERVICE_TYPE_PARTITION)) {
            if (stryMutAct_9fa48("3179")) {
              {}
            } else {
              stryCov_9fa48("3179");
              continue;
            }
          }
          const status = firstStringField(serviceRow, COLUMN.STATUS, stryMutAct_9fa48("3180") ? "" : (stryCov_9fa48("3180"), 'status'));
          if (stryMutAct_9fa48("3183") ? String(status || ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE).toLowerCase() === STATUS_ACTIVE : stryMutAct_9fa48("3182") ? false : stryMutAct_9fa48("3181") ? true : (stryCov_9fa48("3181", "3182", "3183"), (stryMutAct_9fa48("3184") ? String(status || ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE).toUpperCase() : (stryCov_9fa48("3184"), String(stryMutAct_9fa48("3187") ? status && ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE : stryMutAct_9fa48("3186") ? false : stryMutAct_9fa48("3185") ? true : (stryCov_9fa48("3185", "3186", "3187"), status || ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE)).toLowerCase())) !== STATUS_ACTIVE)) {
            if (stryMutAct_9fa48("3188")) {
              {}
            } else {
              stryCov_9fa48("3188");
              continue;
            }
          }
          const raftRole = firstStringField(serviceRow, COLUMN.RAFT_ROLE, stryMutAct_9fa48("3189") ? "" : (stryCov_9fa48("3189"), 'raftRole'));
          const normalizedRaftRole = stryMutAct_9fa48("3190") ? String(raftRole || '').toUpperCase() : (stryCov_9fa48("3190"), String(stryMutAct_9fa48("3193") ? raftRole && '' : stryMutAct_9fa48("3192") ? false : stryMutAct_9fa48("3191") ? true : (stryCov_9fa48("3191", "3192", "3193"), raftRole || (stryMutAct_9fa48("3194") ? "Stryker was here!" : (stryCov_9fa48("3194"), '')))).toLowerCase());
          if (stryMutAct_9fa48("3197") ? !normalizedRaftRole && !isLoadReadyReplicaRaftRole(normalizedRaftRole) : stryMutAct_9fa48("3196") ? false : stryMutAct_9fa48("3195") ? true : (stryCov_9fa48("3195", "3196", "3197"), (stryMutAct_9fa48("3198") ? normalizedRaftRole : (stryCov_9fa48("3198"), !normalizedRaftRole)) || (stryMutAct_9fa48("3199") ? isLoadReadyReplicaRaftRole(normalizedRaftRole) : (stryCov_9fa48("3199"), !isLoadReadyReplicaRaftRole(normalizedRaftRole))))) {
            if (stryMutAct_9fa48("3200")) {
              {}
            } else {
              stryCov_9fa48("3200");
              continue;
            }
          }
          const address = firstStringField(serviceRow, COLUMN.ADDRESS, stryMutAct_9fa48("3201") ? "" : (stryCov_9fa48("3201"), 'address'));
          if (stryMutAct_9fa48("3204") ? false : stryMutAct_9fa48("3203") ? true : stryMutAct_9fa48("3202") ? address : (stryCov_9fa48("3202", "3203", "3204"), !address)) {
            if (stryMutAct_9fa48("3205")) {
              {}
            } else {
              stryCov_9fa48("3205");
              continue;
            }
          }
          const partitionId = firstStringField(serviceRow, COLUMN.PARTITION_ID, stryMutAct_9fa48("3206") ? "" : (stryCov_9fa48("3206"), 'partitionId'));
          if (stryMutAct_9fa48("3209") ? false : stryMutAct_9fa48("3208") ? true : stryMutAct_9fa48("3207") ? partitionId : (stryCov_9fa48("3207", "3208", "3209"), !partitionId)) {
            if (stryMutAct_9fa48("3210")) {
              {}
            } else {
              stryCov_9fa48("3210");
              continue;
            }
          }
          voterCounts[partitionId] = stryMutAct_9fa48("3211") ? (voterCounts[partitionId] || NUM.ZERO) - NUM.ONE : (stryCov_9fa48("3211"), (stryMutAct_9fa48("3214") ? voterCounts[partitionId] && NUM.ZERO : stryMutAct_9fa48("3213") ? false : stryMutAct_9fa48("3212") ? true : (stryCov_9fa48("3212", "3213", "3214"), voterCounts[partitionId] || NUM.ZERO)) + NUM.ONE);
        }
      }
      return voterCounts;
    }
  } /**
    * Build replica operation in-flight summary.
    * @param {Array<Object>} replicaOperationRows
    * @param {Object} [options={}]
    * @return {Object}
    */
  buildControlSnapshotReplicaOperationSummary(replicaOperationRows = stryMutAct_9fa48("3215") ? ["Stryker was here"] : (stryCov_9fa48("3215"), []), options = {}) {
    if (stryMutAct_9fa48("3216")) {
      {}
    } else {
      stryCov_9fa48("3216");
      const scopedPartitionIds = (stryMutAct_9fa48("3219") ? options.partitionIds instanceof Set || options.partitionIds.size > NUM.ZERO : stryMutAct_9fa48("3218") ? false : stryMutAct_9fa48("3217") ? true : (stryCov_9fa48("3217", "3218", "3219"), options.partitionIds instanceof Set && (stryMutAct_9fa48("3222") ? options.partitionIds.size <= NUM.ZERO : stryMutAct_9fa48("3221") ? options.partitionIds.size >= NUM.ZERO : stryMutAct_9fa48("3220") ? true : (stryCov_9fa48("3220", "3221", "3222"), options.partitionIds.size > NUM.ZERO)))) ? options.partitionIds : null;
      const serviceRows = Array.isArray(options.serviceRows) ? options.serviceRows : (stryMutAct_9fa48("3225") ? typeof this.systemTableCache?.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("3224") ? false : stryMutAct_9fa48("3223") ? true : (stryCov_9fa48("3223", "3224", "3225"), typeof (stryMutAct_9fa48("3226") ? this.systemTableCache.getAll : (stryCov_9fa48("3226"), this.systemTableCache?.getAll)) === TYPEOF.FUNCTION)) ? this.systemTableCache.getAll(TABLES.SERVICES) : ADMIN_CACHE_DUMP.EMPTY;
      const livenessSummary = summarizeReplicaOperationLiveness(replicaOperationRows, stryMutAct_9fa48("3227") ? {} : (stryCov_9fa48("3227"), {
        partitionIds: scopedPartitionIds,
        serviceRows,
        nowMs: this.nowFn(),
        includeTimeline: stryMutAct_9fa48("3228") ? false : (stryCov_9fa48("3228"), true)
      }));
      return stryMutAct_9fa48("3229") ? {} : (stryCov_9fa48("3229"), {
        inFlightCount: livenessSummary.inFlightCount,
        statusHistogram: livenessSummary.statusHistogram,
        partitionGroupInFlight: livenessSummary.partitionGroupInFlight,
        stepHistogram: livenessSummary.stepHistogram,
        oldestInFlightAgeMs: livenessSummary.oldestInFlightAgeMs,
        staleInFlightCount: livenessSummary.staleInFlightCount,
        inFlightOperationIds: livenessSummary.inFlightOperationIds,
        operationTimelineById: livenessSummary.operationTimelineById,
        inFlightExcludedStatuses: ADMIN_CONTROL_SNAPSHOT.IN_FLIGHT_EXCLUDED_STATUSES
      });
    }
  } /**
    * Build node-local CDC telemetry with authoritative fallback
    * diagnostics.
    * @return {Object}
    */
  buildLocalCdcTelemetry() {
    if (stryMutAct_9fa48("3230")) {
      {}
    } else {
      stryCov_9fa48("3230");
      const partitionServices = this.resolveLocalPartitionServices ? this.resolveLocalPartitionServices() : null;
      let subscriberCount = NUM.ZERO;
      let bufferedEvents = NUM.ZERO;
      let catchupLagEvents = NUM.ZERO;
      const catchupThroughputEventsPerSec = NUM.ZERO;
      let catchupDetected = stryMutAct_9fa48("3231") ? true : (stryCov_9fa48("3231"), false);
      if (stryMutAct_9fa48("3233") ? false : stryMutAct_9fa48("3232") ? true : (stryCov_9fa48("3232", "3233"), partitionServices instanceof Map)) {
        if (stryMutAct_9fa48("3234")) {
          {}
        } else {
          stryCov_9fa48("3234");
          for (const partitionService of partitionServices.values()) {
            if (stryMutAct_9fa48("3235")) {
              {}
            } else {
              stryCov_9fa48("3235");
              if (stryMutAct_9fa48("3238") ? !partitionService && typeof partitionService.getCDCSubscriptionDiagnostics !== TYPEOF.FUNCTION : stryMutAct_9fa48("3237") ? false : stryMutAct_9fa48("3236") ? true : (stryCov_9fa48("3236", "3237", "3238"), (stryMutAct_9fa48("3239") ? partitionService : (stryCov_9fa48("3239"), !partitionService)) || (stryMutAct_9fa48("3241") ? typeof partitionService.getCDCSubscriptionDiagnostics === TYPEOF.FUNCTION : stryMutAct_9fa48("3240") ? false : (stryCov_9fa48("3240", "3241"), typeof partitionService.getCDCSubscriptionDiagnostics !== TYPEOF.FUNCTION)))) {
                if (stryMutAct_9fa48("3242")) {
                  {}
                } else {
                  stryCov_9fa48("3242");
                  continue;
                }
              }
              const diagnostics = partitionService.getCDCSubscriptionDiagnostics();
              if (stryMutAct_9fa48("3245") ? !diagnostics && typeof diagnostics !== TYPEOF.OBJECT : stryMutAct_9fa48("3244") ? false : stryMutAct_9fa48("3243") ? true : (stryCov_9fa48("3243", "3244", "3245"), (stryMutAct_9fa48("3246") ? diagnostics : (stryCov_9fa48("3246"), !diagnostics)) || (stryMutAct_9fa48("3248") ? typeof diagnostics === TYPEOF.OBJECT : stryMutAct_9fa48("3247") ? false : (stryCov_9fa48("3247", "3248"), typeof diagnostics !== TYPEOF.OBJECT)))) {
                if (stryMutAct_9fa48("3249")) {
                  {}
                } else {
                  stryCov_9fa48("3249");
                  continue;
                }
              }
              const partitionSubscriberCount = Number(stryMutAct_9fa48("3252") ? diagnostics.subscriberCount && NUM.ZERO : stryMutAct_9fa48("3251") ? false : stryMutAct_9fa48("3250") ? true : (stryCov_9fa48("3250", "3251", "3252"), diagnostics.subscriberCount || NUM.ZERO));
              const partitionBufferedEvents = Number(stryMutAct_9fa48("3255") ? diagnostics.bufferedEvents && NUM.ZERO : stryMutAct_9fa48("3254") ? false : stryMutAct_9fa48("3253") ? true : (stryCov_9fa48("3253", "3254", "3255"), diagnostics.bufferedEvents || NUM.ZERO));
              stryMutAct_9fa48("3256") ? subscriberCount -= partitionSubscriberCount : (stryCov_9fa48("3256"), subscriberCount += partitionSubscriberCount);
              stryMutAct_9fa48("3257") ? bufferedEvents -= partitionBufferedEvents : (stryCov_9fa48("3257"), bufferedEvents += partitionBufferedEvents);
              catchupLagEvents = stryMutAct_9fa48("3258") ? Math.min(catchupLagEvents, partitionBufferedEvents) : (stryCov_9fa48("3258"), Math.max(catchupLagEvents, partitionBufferedEvents));
              if (stryMutAct_9fa48("3261") ? partitionBufferedEvents > NUM.ZERO && diagnostics.bufferReplayInFlight === true : stryMutAct_9fa48("3260") ? false : stryMutAct_9fa48("3259") ? true : (stryCov_9fa48("3259", "3260", "3261"), (stryMutAct_9fa48("3264") ? partitionBufferedEvents <= NUM.ZERO : stryMutAct_9fa48("3263") ? partitionBufferedEvents >= NUM.ZERO : stryMutAct_9fa48("3262") ? false : (stryCov_9fa48("3262", "3263", "3264"), partitionBufferedEvents > NUM.ZERO)) || (stryMutAct_9fa48("3266") ? diagnostics.bufferReplayInFlight !== true : stryMutAct_9fa48("3265") ? false : (stryCov_9fa48("3265", "3266"), diagnostics.bufferReplayInFlight === (stryMutAct_9fa48("3267") ? false : (stryCov_9fa48("3267"), true)))))) {
                if (stryMutAct_9fa48("3268")) {
                  {}
                } else {
                  stryCov_9fa48("3268");
                  catchupDetected = stryMutAct_9fa48("3269") ? false : (stryCov_9fa48("3269"), true);
                }
              }
            }
          }
        }
      }
      const authoritativeFallback = (stryMutAct_9fa48("3272") ? typeof this.cdcIntegrationService?.getAuthoritativeFallbackDiagnostics !== TYPEOF.FUNCTION : stryMutAct_9fa48("3271") ? false : stryMutAct_9fa48("3270") ? true : (stryCov_9fa48("3270", "3271", "3272"), typeof (stryMutAct_9fa48("3273") ? this.cdcIntegrationService.getAuthoritativeFallbackDiagnostics : (stryCov_9fa48("3273"), this.cdcIntegrationService?.getAuthoritativeFallbackDiagnostics)) === TYPEOF.FUNCTION)) ? this.cdcIntegrationService.getAuthoritativeFallbackDiagnostics() : stryMutAct_9fa48("3274") ? {} : (stryCov_9fa48("3274"), {
        schemaVersion: NUM.ONE,
        nodeId: this.nodeId,
        windowMs: TIME_MS.MINUTE,
        totalCount: NUM.ZERO,
        windowCount: NUM.ZERO,
        windowRatePerMinute: NUM.ZERO,
        phases: stryMutAct_9fa48("3275") ? {} : (stryCov_9fa48("3275"), {
          bootstrap: stryMutAct_9fa48("3276") ? {} : (stryCov_9fa48("3276"), {
            windowCount: NUM.ZERO,
            totalCount: NUM.ZERO
          }),
          recovery: stryMutAct_9fa48("3277") ? {} : (stryCov_9fa48("3277"), {
            windowCount: NUM.ZERO,
            totalCount: NUM.ZERO
          }),
          steady_state: stryMutAct_9fa48("3278") ? {} : (stryCov_9fa48("3278"), {
            windowCount: NUM.ZERO,
            totalCount: NUM.ZERO
          })
        }),
        outcomes: stryMutAct_9fa48("3279") ? {} : (stryCov_9fa48("3279"), {
          recovered: stryMutAct_9fa48("3280") ? {} : (stryCov_9fa48("3280"), {
            windowCount: NUM.ZERO,
            totalCount: NUM.ZERO
          }),
          failed: stryMutAct_9fa48("3281") ? {} : (stryCov_9fa48("3281"), {
            windowCount: NUM.ZERO,
            totalCount: NUM.ZERO
          })
        }),
        byTable: {},
        recentEvents: ADMIN_CACHE_DUMP.EMPTY
      });
      return stryMutAct_9fa48("3282") ? {} : (stryCov_9fa48("3282"), {
        subscriberCount,
        bufferedEvents,
        catchupLagEvents,
        catchupThroughputEventsPerSec,
        mode: catchupDetected ? CDC_TELEMETRY_MODE.CATCHUP : CDC_TELEMETRY_MODE.STEADY,
        authoritativeFallback
      });
    }
  } /**
    * Build node-local CDC diagnostics payload.
    * @return {Object}
    */
  buildLocalCdcDiagnostics() {
    if (stryMutAct_9fa48("3283")) {
      {}
    } else {
      stryCov_9fa48("3283");
      if (stryMutAct_9fa48("3286") ? !this.systemTableCache && typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("3285") ? false : stryMutAct_9fa48("3284") ? true : (stryCov_9fa48("3284", "3285", "3286"), (stryMutAct_9fa48("3287") ? this.systemTableCache : (stryCov_9fa48("3287"), !this.systemTableCache)) || (stryMutAct_9fa48("3289") ? typeof this.systemTableCache.getAll === TYPEOF.FUNCTION : stryMutAct_9fa48("3288") ? false : (stryCov_9fa48("3288", "3289"), typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("3290")) {
          {}
        } else {
          stryCov_9fa48("3290");
          throw new Error(ADMIN_ERROR_MESSAGE.CDC_DIAGNOSTICS_UNAVAILABLE);
        }
      }
      const capturedAt = this.nowFn();
      const partitionRows = this.systemTableCache.getAll(TABLES.PARTITIONS);
      const clusterPartitionIds = uniqueSorted(stryMutAct_9fa48("3291") ? partitionRows.map(row => firstStringField(row, COLUMN.PARTITION_ID, 'partitionId', 'id')) : (stryCov_9fa48("3291"), partitionRows.map(stryMutAct_9fa48("3292") ? () => undefined : (stryCov_9fa48("3292"), row => firstStringField(row, COLUMN.PARTITION_ID, stryMutAct_9fa48("3293") ? "" : (stryCov_9fa48("3293"), 'partitionId'), stryMutAct_9fa48("3294") ? "" : (stryCov_9fa48("3294"), 'id')))).filter(Boolean)));
      const partitionDiagnosticsById = {};
      const missingDiagnosticsPartitionIds = stryMutAct_9fa48("3295") ? ["Stryker was here"] : (stryCov_9fa48("3295"), []);
      const noSubscriberPartitionIds = stryMutAct_9fa48("3296") ? ["Stryker was here"] : (stryCov_9fa48("3296"), []);
      const bufferedPartitionIds = stryMutAct_9fa48("3297") ? ["Stryker was here"] : (stryCov_9fa48("3297"), []);
      const partitionServices = this.resolveLocalPartitionServices ? this.resolveLocalPartitionServices() : null;
      if (stryMutAct_9fa48("3299") ? false : stryMutAct_9fa48("3298") ? true : (stryCov_9fa48("3298", "3299"), partitionServices instanceof Map)) {
        if (stryMutAct_9fa48("3300")) {
          {}
        } else {
          stryCov_9fa48("3300");
          for (const [partitionServiceKey, partitionService] of partitionServices.entries()) {
            if (stryMutAct_9fa48("3301")) {
              {}
            } else {
              stryCov_9fa48("3301");
              const partitionId = stryMutAct_9fa48("3304") ? firstStringField(partitionService, COLUMN.PARTITION_ID, 'partitionId', 'id') && String(partitionServiceKey || '') : stryMutAct_9fa48("3303") ? false : stryMutAct_9fa48("3302") ? true : (stryCov_9fa48("3302", "3303", "3304"), firstStringField(partitionService, COLUMN.PARTITION_ID, stryMutAct_9fa48("3305") ? "" : (stryCov_9fa48("3305"), 'partitionId'), stryMutAct_9fa48("3306") ? "" : (stryCov_9fa48("3306"), 'id')) || String(stryMutAct_9fa48("3309") ? partitionServiceKey && '' : stryMutAct_9fa48("3308") ? false : stryMutAct_9fa48("3307") ? true : (stryCov_9fa48("3307", "3308", "3309"), partitionServiceKey || (stryMutAct_9fa48("3310") ? "Stryker was here!" : (stryCov_9fa48("3310"), '')))));
              if (stryMutAct_9fa48("3313") ? false : stryMutAct_9fa48("3312") ? true : stryMutAct_9fa48("3311") ? partitionId : (stryCov_9fa48("3311", "3312", "3313"), !partitionId)) {
                if (stryMutAct_9fa48("3314")) {
                  {}
                } else {
                  stryCov_9fa48("3314");
                  continue;
                }
              }
              if (stryMutAct_9fa48("3317") ? !partitionService && typeof partitionService.getCDCSubscriptionDiagnostics !== TYPEOF.FUNCTION : stryMutAct_9fa48("3316") ? false : stryMutAct_9fa48("3315") ? true : (stryCov_9fa48("3315", "3316", "3317"), (stryMutAct_9fa48("3318") ? partitionService : (stryCov_9fa48("3318"), !partitionService)) || (stryMutAct_9fa48("3320") ? typeof partitionService.getCDCSubscriptionDiagnostics === TYPEOF.FUNCTION : stryMutAct_9fa48("3319") ? false : (stryCov_9fa48("3319", "3320"), typeof partitionService.getCDCSubscriptionDiagnostics !== TYPEOF.FUNCTION)))) {
                if (stryMutAct_9fa48("3321")) {
                  {}
                } else {
                  stryCov_9fa48("3321");
                  partitionDiagnosticsById[partitionId] = stryMutAct_9fa48("3322") ? {} : (stryCov_9fa48("3322"), {
                    diagnosticsAvailable: stryMutAct_9fa48("3323") ? true : (stryCov_9fa48("3323"), false),
                    ready: stryMutAct_9fa48("3324") ? true : (stryCov_9fa48("3324"), false),
                    subscriberCount: NUM.ZERO,
                    bufferedEvents: NUM.ZERO,
                    bufferReplayInFlight: stryMutAct_9fa48("3325") ? true : (stryCov_9fa48("3325"), false)
                  });
                  missingDiagnosticsPartitionIds.push(partitionId);
                  continue;
                }
              }
              const diagnostics = partitionService.getCDCSubscriptionDiagnostics();
              if (stryMutAct_9fa48("3328") ? !diagnostics && typeof diagnostics !== TYPEOF.OBJECT : stryMutAct_9fa48("3327") ? false : stryMutAct_9fa48("3326") ? true : (stryCov_9fa48("3326", "3327", "3328"), (stryMutAct_9fa48("3329") ? diagnostics : (stryCov_9fa48("3329"), !diagnostics)) || (stryMutAct_9fa48("3331") ? typeof diagnostics === TYPEOF.OBJECT : stryMutAct_9fa48("3330") ? false : (stryCov_9fa48("3330", "3331"), typeof diagnostics !== TYPEOF.OBJECT)))) {
                if (stryMutAct_9fa48("3332")) {
                  {}
                } else {
                  stryCov_9fa48("3332");
                  partitionDiagnosticsById[partitionId] = stryMutAct_9fa48("3333") ? {} : (stryCov_9fa48("3333"), {
                    diagnosticsAvailable: stryMutAct_9fa48("3334") ? true : (stryCov_9fa48("3334"), false),
                    ready: stryMutAct_9fa48("3335") ? true : (stryCov_9fa48("3335"), false),
                    subscriberCount: NUM.ZERO,
                    bufferedEvents: NUM.ZERO,
                    bufferReplayInFlight: stryMutAct_9fa48("3336") ? true : (stryCov_9fa48("3336"), false)
                  });
                  missingDiagnosticsPartitionIds.push(partitionId);
                  continue;
                }
              }
              const subscriberCount = toNonNegativeInteger(diagnostics.subscriberCount);
              const bufferedEvents = toNonNegativeInteger(diagnostics.bufferedEvents);
              const bufferReplayInFlight = stryMutAct_9fa48("3339") ? diagnostics.bufferReplayInFlight !== true : stryMutAct_9fa48("3338") ? false : stryMutAct_9fa48("3337") ? true : (stryCov_9fa48("3337", "3338", "3339"), diagnostics.bufferReplayInFlight === (stryMutAct_9fa48("3340") ? false : (stryCov_9fa48("3340"), true)));
              const ready = stryMutAct_9fa48("3343") ? subscriberCount > NUM.ZERO && bufferedEvents === NUM.ZERO || bufferReplayInFlight !== true : stryMutAct_9fa48("3342") ? false : stryMutAct_9fa48("3341") ? true : (stryCov_9fa48("3341", "3342", "3343"), (stryMutAct_9fa48("3345") ? subscriberCount > NUM.ZERO || bufferedEvents === NUM.ZERO : stryMutAct_9fa48("3344") ? true : (stryCov_9fa48("3344", "3345"), (stryMutAct_9fa48("3348") ? subscriberCount <= NUM.ZERO : stryMutAct_9fa48("3347") ? subscriberCount >= NUM.ZERO : stryMutAct_9fa48("3346") ? true : (stryCov_9fa48("3346", "3347", "3348"), subscriberCount > NUM.ZERO)) && (stryMutAct_9fa48("3350") ? bufferedEvents !== NUM.ZERO : stryMutAct_9fa48("3349") ? true : (stryCov_9fa48("3349", "3350"), bufferedEvents === NUM.ZERO)))) && (stryMutAct_9fa48("3352") ? bufferReplayInFlight === true : stryMutAct_9fa48("3351") ? true : (stryCov_9fa48("3351", "3352"), bufferReplayInFlight !== (stryMutAct_9fa48("3353") ? false : (stryCov_9fa48("3353"), true)))));
              partitionDiagnosticsById[partitionId] = stryMutAct_9fa48("3354") ? {} : (stryCov_9fa48("3354"), {
                diagnosticsAvailable: stryMutAct_9fa48("3355") ? false : (stryCov_9fa48("3355"), true),
                ready,
                subscriberCount,
                bufferedEvents,
                bufferReplayInFlight,
                diagnostics
              });
              if (stryMutAct_9fa48("3359") ? subscriberCount > NUM.ZERO : stryMutAct_9fa48("3358") ? subscriberCount < NUM.ZERO : stryMutAct_9fa48("3357") ? false : stryMutAct_9fa48("3356") ? true : (stryCov_9fa48("3356", "3357", "3358", "3359"), subscriberCount <= NUM.ZERO)) {
                if (stryMutAct_9fa48("3360")) {
                  {}
                } else {
                  stryCov_9fa48("3360");
                  noSubscriberPartitionIds.push(partitionId);
                }
              }
              if (stryMutAct_9fa48("3363") ? bufferedEvents > NUM.ZERO && bufferReplayInFlight === true : stryMutAct_9fa48("3362") ? false : stryMutAct_9fa48("3361") ? true : (stryCov_9fa48("3361", "3362", "3363"), (stryMutAct_9fa48("3366") ? bufferedEvents <= NUM.ZERO : stryMutAct_9fa48("3365") ? bufferedEvents >= NUM.ZERO : stryMutAct_9fa48("3364") ? false : (stryCov_9fa48("3364", "3365", "3366"), bufferedEvents > NUM.ZERO)) || (stryMutAct_9fa48("3368") ? bufferReplayInFlight !== true : stryMutAct_9fa48("3367") ? false : (stryCov_9fa48("3367", "3368"), bufferReplayInFlight === (stryMutAct_9fa48("3369") ? false : (stryCov_9fa48("3369"), true)))))) {
                if (stryMutAct_9fa48("3370")) {
                  {}
                } else {
                  stryCov_9fa48("3370");
                  bufferedPartitionIds.push(partitionId);
                }
              }
            }
          }
        }
      }
      const localPartitionIds = uniqueSorted(Object.keys(partitionDiagnosticsById));
      const diagnosticsAvailablePartitionCount = stryMutAct_9fa48("3371") ? Object.values(partitionDiagnosticsById).length : (stryCov_9fa48("3371"), Object.values(partitionDiagnosticsById).filter(stryMutAct_9fa48("3372") ? () => undefined : (stryCov_9fa48("3372"), entry => stryMutAct_9fa48("3375") ? entry?.diagnosticsAvailable !== true : stryMutAct_9fa48("3374") ? false : stryMutAct_9fa48("3373") ? true : (stryCov_9fa48("3373", "3374", "3375"), (stryMutAct_9fa48("3376") ? entry.diagnosticsAvailable : (stryCov_9fa48("3376"), entry?.diagnosticsAvailable)) === (stryMutAct_9fa48("3377") ? false : (stryCov_9fa48("3377"), true))))).length);
      const readyLocalPartitionCount = stryMutAct_9fa48("3378") ? Object.values(partitionDiagnosticsById).length : (stryCov_9fa48("3378"), Object.values(partitionDiagnosticsById).filter(stryMutAct_9fa48("3379") ? () => undefined : (stryCov_9fa48("3379"), entry => stryMutAct_9fa48("3382") ? entry?.ready !== true : stryMutAct_9fa48("3381") ? false : stryMutAct_9fa48("3380") ? true : (stryCov_9fa48("3380", "3381", "3382"), (stryMutAct_9fa48("3383") ? entry.ready : (stryCov_9fa48("3383"), entry?.ready)) === (stryMutAct_9fa48("3384") ? false : (stryCov_9fa48("3384"), true))))).length);
      return stryMutAct_9fa48("3385") ? {} : (stryCov_9fa48("3385"), {
        schemaVersion: ADMIN_OPERATIONAL_DIAGNOSTICS.CDC_SCHEMA_VERSION,
        nodeId: this.nodeId,
        capturedAt,
        telemetry: this.buildLocalCdcTelemetry(),
        clusterPartitionCount: clusterPartitionIds.length,
        clusterPartitionIds,
        localPartitionCount: localPartitionIds.length,
        localPartitionIds,
        diagnosticsAvailablePartitionCount,
        readyLocalPartitionCount,
        missingDiagnosticsPartitionIds: uniqueSorted(missingDiagnosticsPartitionIds),
        noSubscriberPartitionIds: uniqueSorted(noSubscriberPartitionIds),
        bufferedPartitionIds: uniqueSorted(bufferedPartitionIds),
        partitionDiagnosticsById
      });
    }
  } /**
    * Build node-local partition diagnostics payload.
    * @return {Object}
    */
  buildLocalPartitionDiagnostics() {
    if (stryMutAct_9fa48("3386")) {
      {}
    } else {
      stryCov_9fa48("3386");
      if (stryMutAct_9fa48("3389") ? !this.systemTableCache && typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("3388") ? false : stryMutAct_9fa48("3387") ? true : (stryCov_9fa48("3387", "3388", "3389"), (stryMutAct_9fa48("3390") ? this.systemTableCache : (stryCov_9fa48("3390"), !this.systemTableCache)) || (stryMutAct_9fa48("3392") ? typeof this.systemTableCache.getAll === TYPEOF.FUNCTION : stryMutAct_9fa48("3391") ? false : (stryCov_9fa48("3391", "3392"), typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("3393")) {
          {}
        } else {
          stryCov_9fa48("3393");
          throw new Error(ADMIN_ERROR_MESSAGE.PARTITION_DIAGNOSTICS_UNAVAILABLE);
        }
      }
      const capturedAt = this.nowFn();
      const partitionRows = this.systemTableCache.getAll(TABLES.PARTITIONS);
      const serviceRows = this.systemTableCache.getAll(TABLES.SERVICES);
      const replicaOperationRows = this.systemTableCache.getAll(TABLES.REPLICA_OPERATIONS);
      const leaderSummary = this.buildControlSnapshotLeaderSummary(partitionRows, serviceRows);
      const voterCounts = this.buildControlSnapshotVoterCounts(serviceRows);
      const replicaOperations = this.buildControlSnapshotReplicaOperationSummary(replicaOperationRows);
      const partitionMetadataById = {};
      for (const partitionRow of partitionRows) {
        if (stryMutAct_9fa48("3394")) {
          {}
        } else {
          stryCov_9fa48("3394");
          const partitionId = firstStringField(partitionRow, COLUMN.PARTITION_ID, stryMutAct_9fa48("3395") ? "" : (stryCov_9fa48("3395"), 'partitionId'), stryMutAct_9fa48("3396") ? "" : (stryCov_9fa48("3396"), 'id'));
          if (stryMutAct_9fa48("3399") ? false : stryMutAct_9fa48("3398") ? true : stryMutAct_9fa48("3397") ? partitionId : (stryCov_9fa48("3397", "3398", "3399"), !partitionId)) {
            if (stryMutAct_9fa48("3400")) {
              {}
            } else {
              stryCov_9fa48("3400");
              continue;
            }
          }
          partitionMetadataById[partitionId] = stryMutAct_9fa48("3401") ? {} : (stryCov_9fa48("3401"), {
            tableId: firstStringField(partitionRow, COLUMN.TABLE_ID, ADMIN_CONTROL_SNAPSHOT_LITERAL.TABLEID),
            tableName: firstStringField(partitionRow, ADMIN_CONTROL_SNAPSHOT_LITERAL.TABLE_NAME, ADMIN_CONTROL_SNAPSHOT_LITERAL.TABLENAME),
            state: firstStringField(partitionRow, COLUMN.STATE, ADMIN_CONTROL_SNAPSHOT_LITERAL.PARTITIONSTATE)
          });
        }
      }
      const replicasByPartitionId = {};
      for (const serviceRow of serviceRows) {
        if (stryMutAct_9fa48("3402")) {
          {}
        } else {
          stryCov_9fa48("3402");
          const serviceType = firstStringField(serviceRow, COLUMN.SERVICE_TYPE, stryMutAct_9fa48("3403") ? "" : (stryCov_9fa48("3403"), 'type'), stryMutAct_9fa48("3404") ? "" : (stryCov_9fa48("3404"), 'serviceType'));
          if (stryMutAct_9fa48("3407") ? serviceType === SERVICE_TYPE_PARTITION : stryMutAct_9fa48("3406") ? false : stryMutAct_9fa48("3405") ? true : (stryCov_9fa48("3405", "3406", "3407"), serviceType !== SERVICE_TYPE_PARTITION)) {
            if (stryMutAct_9fa48("3408")) {
              {}
            } else {
              stryCov_9fa48("3408");
              continue;
            }
          }
          const partitionId = firstStringField(serviceRow, COLUMN.PARTITION_ID, stryMutAct_9fa48("3409") ? "" : (stryCov_9fa48("3409"), 'partitionId'), stryMutAct_9fa48("3410") ? "" : (stryCov_9fa48("3410"), 'id'));
          if (stryMutAct_9fa48("3413") ? false : stryMutAct_9fa48("3412") ? true : stryMutAct_9fa48("3411") ? partitionId : (stryCov_9fa48("3411", "3412", "3413"), !partitionId)) {
            if (stryMutAct_9fa48("3414")) {
              {}
            } else {
              stryCov_9fa48("3414");
              continue;
            }
          }
          replicasByPartitionId[partitionId] = stryMutAct_9fa48("3417") ? replicasByPartitionId[partitionId] && [] : stryMutAct_9fa48("3416") ? false : stryMutAct_9fa48("3415") ? true : (stryCov_9fa48("3415", "3416", "3417"), replicasByPartitionId[partitionId] || (stryMutAct_9fa48("3418") ? ["Stryker was here"] : (stryCov_9fa48("3418"), [])));
          replicasByPartitionId[partitionId].push(stryMutAct_9fa48("3419") ? {} : (stryCov_9fa48("3419"), {
            replicaId: firstStringField(serviceRow, COLUMN.REPLICA_ID, COLUMN.SERVICE_ID, ADMIN_CONTROL_SNAPSHOT_LITERAL.REPLICAID, ADMIN_CONTROL_SNAPSHOT_LITERAL.ID),
            nodeId: firstStringField(serviceRow, COLUMN.NODE_ID, ADMIN_CONTROL_SNAPSHOT_LITERAL.NODEID),
            raftRole: firstStringField(serviceRow, COLUMN.RAFT_ROLE, ADMIN_CONTROL_SNAPSHOT_LITERAL.RAFTROLE),
            status: firstStringField(serviceRow, COLUMN.STATUS, ADMIN_CONTROL_SNAPSHOT_LITERAL.STATUS),
            address: firstStringField(serviceRow, COLUMN.ADDRESS, ADMIN_CONTROL_SNAPSHOT_LITERAL.ADDRESS)
          }));
        }
      }
      const partitionIds = uniqueSorted(stryMutAct_9fa48("3420") ? [] : (stryCov_9fa48("3420"), [...Object.keys(partitionMetadataById), ...Object.keys(replicasByPartitionId)]));
      const partitionsById = {};
      for (const partitionId of partitionIds) {
        if (stryMutAct_9fa48("3421")) {
          {}
        } else {
          stryCov_9fa48("3421");
          const metadata = stryMutAct_9fa48("3424") ? partitionMetadataById[partitionId] && {} : stryMutAct_9fa48("3423") ? false : stryMutAct_9fa48("3422") ? true : (stryCov_9fa48("3422", "3423", "3424"), partitionMetadataById[partitionId] || {});
          const replicas = stryMutAct_9fa48("3427") ? replicasByPartitionId[partitionId] && ADMIN_CACHE_DUMP.EMPTY : stryMutAct_9fa48("3426") ? false : stryMutAct_9fa48("3425") ? true : (stryCov_9fa48("3425", "3426", "3427"), replicasByPartitionId[partitionId] || ADMIN_CACHE_DUMP.EMPTY);
          const activeReplicaCount = stryMutAct_9fa48("3428") ? replicas.length : (stryCov_9fa48("3428"), replicas.filter(stryMutAct_9fa48("3429") ? () => undefined : (stryCov_9fa48("3429"), replica => stryMutAct_9fa48("3432") ? String(replica?.status || '').toLowerCase() !== STATUS_ACTIVE : stryMutAct_9fa48("3431") ? false : stryMutAct_9fa48("3430") ? true : (stryCov_9fa48("3430", "3431", "3432"), (stryMutAct_9fa48("3433") ? String(replica?.status || '').toUpperCase() : (stryCov_9fa48("3433"), String(stryMutAct_9fa48("3436") ? replica?.status && '' : stryMutAct_9fa48("3435") ? false : stryMutAct_9fa48("3434") ? true : (stryCov_9fa48("3434", "3435", "3436"), (stryMutAct_9fa48("3437") ? replica.status : (stryCov_9fa48("3437"), replica?.status)) || (stryMutAct_9fa48("3438") ? "Stryker was here!" : (stryCov_9fa48("3438"), '')))).toLowerCase())) === STATUS_ACTIVE))).length);
          partitionsById[partitionId] = stryMutAct_9fa48("3439") ? {} : (stryCov_9fa48("3439"), {
            partitionId,
            tableId: stryMutAct_9fa48("3442") ? metadata.tableId && null : stryMutAct_9fa48("3441") ? false : stryMutAct_9fa48("3440") ? true : (stryCov_9fa48("3440", "3441", "3442"), metadata.tableId || null),
            tableName: stryMutAct_9fa48("3445") ? metadata.tableName && null : stryMutAct_9fa48("3444") ? false : stryMutAct_9fa48("3443") ? true : (stryCov_9fa48("3443", "3444", "3445"), metadata.tableName || null),
            state: stryMutAct_9fa48("3448") ? metadata.state && PARTITION_STATE_UNKNOWN : stryMutAct_9fa48("3447") ? false : stryMutAct_9fa48("3446") ? true : (stryCov_9fa48("3446", "3447", "3448"), metadata.state || PARTITION_STATE_UNKNOWN),
            leaderNodeId: stryMutAct_9fa48("3451") ? leaderSummary.leaders[partitionId] && null : stryMutAct_9fa48("3450") ? false : stryMutAct_9fa48("3449") ? true : (stryCov_9fa48("3449", "3450", "3451"), leaderSummary.leaders[partitionId] || null),
            voterCount: toNonNegativeInteger(voterCounts[partitionId]),
            replicaCount: replicas.length,
            activeReplicaCount,
            replicaRoles: stryMutAct_9fa48("3454") ? leaderSummary.replicaRoles[partitionId] && {} : stryMutAct_9fa48("3453") ? false : stryMutAct_9fa48("3452") ? true : (stryCov_9fa48("3452", "3453", "3454"), leaderSummary.replicaRoles[partitionId] || {}),
            replicaRoleDiagnostics: stryMutAct_9fa48("3457") ? leaderSummary.replicaRoleDiagnostics[partitionId] && {
              canonicalLeaderNodeId: null,
              source: TABLES.PARTITIONS,
              inconsistentReplicaRoles: false,
              replicaLeaderNodeIds: ADMIN_CACHE_DUMP.EMPTY,
              issues: ADMIN_CACHE_DUMP.EMPTY
            } : stryMutAct_9fa48("3456") ? false : stryMutAct_9fa48("3455") ? true : (stryCov_9fa48("3455", "3456", "3457"), leaderSummary.replicaRoleDiagnostics[partitionId] || (stryMutAct_9fa48("3458") ? {} : (stryCov_9fa48("3458"), {
              canonicalLeaderNodeId: null,
              source: TABLES.PARTITIONS,
              inconsistentReplicaRoles: stryMutAct_9fa48("3459") ? true : (stryCov_9fa48("3459"), false),
              replicaLeaderNodeIds: ADMIN_CACHE_DUMP.EMPTY,
              issues: ADMIN_CACHE_DUMP.EMPTY
            }))),
            replicas
          });
        }
      }
      return stryMutAct_9fa48("3460") ? {} : (stryCov_9fa48("3460"), {
        schemaVersion: ADMIN_OPERATIONAL_DIAGNOSTICS.PARTITION_SCHEMA_VERSION,
        nodeId: this.nodeId,
        capturedAt,
        partitionCount: partitionIds.length,
        leaders: leaderSummary.leaders,
        voterCounts,
        replicaRoleDiagnostics: leaderSummary.replicaRoleDiagnostics,
        replicaOperations,
        partitionsById
      });
    }
  } /**
    * Build node-local cluster SQL diagnostics payload.
    * @return {Object}
    */
  buildLocalSqlDiagnostics() {
    if (stryMutAct_9fa48("3461")) {
      {}
    } else {
      stryCov_9fa48("3461");
      if (stryMutAct_9fa48("3464") ? !this.systemTableCache && typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("3463") ? false : stryMutAct_9fa48("3462") ? true : (stryCov_9fa48("3462", "3463", "3464"), (stryMutAct_9fa48("3465") ? this.systemTableCache : (stryCov_9fa48("3465"), !this.systemTableCache)) || (stryMutAct_9fa48("3467") ? typeof this.systemTableCache.getAll === TYPEOF.FUNCTION : stryMutAct_9fa48("3466") ? false : (stryCov_9fa48("3466", "3467"), typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("3468")) {
          {}
        } else {
          stryCov_9fa48("3468");
          throw new Error(ADMIN_ERROR_MESSAGE.SQL_DIAGNOSTICS_UNAVAILABLE);
        }
      }
      const capturedAt = this.nowFn();
      const nodeRows = this.systemTableCache.getAll(TABLES.NODES);
      const partitionRows = this.systemTableCache.getAll(TABLES.PARTITIONS);
      const tableRows = this.systemTableCache.getAll(TABLES.TABLES);
      const sqlQueryEngine = this.sqlQueryEngine;
      const queryEngineAvailable = Boolean(stryMutAct_9fa48("3471") ? sqlQueryEngine || typeof sqlQueryEngine.executeRequest === TYPEOF.FUNCTION : stryMutAct_9fa48("3470") ? false : stryMutAct_9fa48("3469") ? true : (stryCov_9fa48("3469", "3470", "3471"), sqlQueryEngine && (stryMutAct_9fa48("3473") ? typeof sqlQueryEngine.executeRequest !== TYPEOF.FUNCTION : stryMutAct_9fa48("3472") ? true : (stryCov_9fa48("3472", "3473"), typeof sqlQueryEngine.executeRequest === TYPEOF.FUNCTION))));
      const queryExecutor = stryMutAct_9fa48("3476") ? sqlQueryEngine?.queryExecutor && null : stryMutAct_9fa48("3475") ? false : stryMutAct_9fa48("3474") ? true : (stryCov_9fa48("3474", "3475", "3476"), (stryMutAct_9fa48("3477") ? sqlQueryEngine.queryExecutor : (stryCov_9fa48("3477"), sqlQueryEngine?.queryExecutor)) || null);
      const lastCoordinatorMetrics = (stryMutAct_9fa48("3480") ? queryExecutor || typeof queryExecutor.getLastCoordinatorMetrics === TYPEOF.FUNCTION : stryMutAct_9fa48("3479") ? false : stryMutAct_9fa48("3478") ? true : (stryCov_9fa48("3478", "3479", "3480"), queryExecutor && (stryMutAct_9fa48("3482") ? typeof queryExecutor.getLastCoordinatorMetrics !== TYPEOF.FUNCTION : stryMutAct_9fa48("3481") ? true : (stryCov_9fa48("3481", "3482"), typeof queryExecutor.getLastCoordinatorMetrics === TYPEOF.FUNCTION)))) ? queryExecutor.getLastCoordinatorMetrics() : null;
      let provisionTargetDiagnostics = null;
      if (stryMutAct_9fa48("3485") ? sqlQueryEngine || typeof sqlQueryEngine.resolveProvisionTargetNodeIdsWithDiagnostics === TYPEOF.FUNCTION : stryMutAct_9fa48("3484") ? false : stryMutAct_9fa48("3483") ? true : (stryCov_9fa48("3483", "3484", "3485"), sqlQueryEngine && (stryMutAct_9fa48("3487") ? typeof sqlQueryEngine.resolveProvisionTargetNodeIdsWithDiagnostics !== TYPEOF.FUNCTION : stryMutAct_9fa48("3486") ? true : (stryCov_9fa48("3486", "3487"), typeof sqlQueryEngine.resolveProvisionTargetNodeIdsWithDiagnostics === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("3488")) {
          {}
        } else {
          stryCov_9fa48("3488");
          const diagnosticsResult = sqlQueryEngine.resolveProvisionTargetNodeIdsWithDiagnostics(SQL_DIAGNOSTICS_REPLICA_COUNT);
          if (stryMutAct_9fa48("3491") ? diagnosticsResult?.diagnostics || typeof diagnosticsResult.diagnostics === TYPEOF.OBJECT : stryMutAct_9fa48("3490") ? false : stryMutAct_9fa48("3489") ? true : (stryCov_9fa48("3489", "3490", "3491"), (stryMutAct_9fa48("3492") ? diagnosticsResult.diagnostics : (stryCov_9fa48("3492"), diagnosticsResult?.diagnostics)) && (stryMutAct_9fa48("3494") ? typeof diagnosticsResult.diagnostics !== TYPEOF.OBJECT : stryMutAct_9fa48("3493") ? true : (stryCov_9fa48("3493", "3494"), typeof diagnosticsResult.diagnostics === TYPEOF.OBJECT)))) {
            if (stryMutAct_9fa48("3495")) {
              {}
            } else {
              stryCov_9fa48("3495");
              provisionTargetDiagnostics = diagnosticsResult.diagnostics;
            }
          }
        }
      } else if (stryMutAct_9fa48("3498") ? sqlQueryEngine || typeof sqlQueryEngine.resolveProvisionTargetNodeDiagnostics === TYPEOF.FUNCTION : stryMutAct_9fa48("3497") ? false : stryMutAct_9fa48("3496") ? true : (stryCov_9fa48("3496", "3497", "3498"), sqlQueryEngine && (stryMutAct_9fa48("3500") ? typeof sqlQueryEngine.resolveProvisionTargetNodeDiagnostics !== TYPEOF.FUNCTION : stryMutAct_9fa48("3499") ? true : (stryCov_9fa48("3499", "3500"), typeof sqlQueryEngine.resolveProvisionTargetNodeDiagnostics === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("3501")) {
          {}
        } else {
          stryCov_9fa48("3501");
          provisionTargetDiagnostics = sqlQueryEngine.resolveProvisionTargetNodeDiagnostics(SQL_DIAGNOSTICS_REPLICA_COUNT);
        }
      }
      const activeNodeCount = stryMutAct_9fa48("3502") ? nodeRows.length : (stryCov_9fa48("3502"), nodeRows.filter(stryMutAct_9fa48("3503") ? () => undefined : (stryCov_9fa48("3503"), row => stryMutAct_9fa48("3506") ? String(firstStringField(row, COLUMN.STATUS, 'state') || '').toLowerCase() !== STATUS_ACTIVE : stryMutAct_9fa48("3505") ? false : stryMutAct_9fa48("3504") ? true : (stryCov_9fa48("3504", "3505", "3506"), (stryMutAct_9fa48("3507") ? String(firstStringField(row, COLUMN.STATUS, 'state') || '').toUpperCase() : (stryCov_9fa48("3507"), String(stryMutAct_9fa48("3510") ? firstStringField(row, COLUMN.STATUS, 'state') && '' : stryMutAct_9fa48("3509") ? false : stryMutAct_9fa48("3508") ? true : (stryCov_9fa48("3508", "3509", "3510"), firstStringField(row, COLUMN.STATUS, stryMutAct_9fa48("3511") ? "" : (stryCov_9fa48("3511"), 'state')) || (stryMutAct_9fa48("3512") ? "Stryker was here!" : (stryCov_9fa48("3512"), '')))).toLowerCase())) === STATUS_ACTIVE))).length);
      return stryMutAct_9fa48("3513") ? {} : (stryCov_9fa48("3513"), {
        schemaVersion: ADMIN_OPERATIONAL_DIAGNOSTICS.SQL_SCHEMA_VERSION,
        nodeId: this.nodeId,
        capturedAt,
        queryEngineAvailable,
        cluster: stryMutAct_9fa48("3514") ? {} : (stryCov_9fa48("3514"), {
          nodeCount: nodeRows.length,
          activeNodeCount,
          partitionCount: partitionRows.length,
          tableCount: tableRows.length
        }),
        queryEngine: stryMutAct_9fa48("3515") ? {} : (stryCov_9fa48("3515"), {
          timeoutMs: Number.isFinite(Number(stryMutAct_9fa48("3516") ? sqlQueryEngine.queryTimeoutMs : (stryCov_9fa48("3516"), sqlQueryEngine?.queryTimeoutMs))) ? Number(sqlQueryEngine.queryTimeoutMs) : null,
          fanoutMetricsAvailable: stryMutAct_9fa48("3519") ? lastCoordinatorMetrics === null : stryMutAct_9fa48("3518") ? false : stryMutAct_9fa48("3517") ? true : (stryCov_9fa48("3517", "3518", "3519"), lastCoordinatorMetrics !== null),
          lastCoordinatorMetrics,
          provisionTargetDiagnostics,
          transactionRecovery: (stryMutAct_9fa48("3522") ? sqlQueryEngine?.lastTransactionRecoveryReplayResult || typeof sqlQueryEngine.lastTransactionRecoveryReplayResult === TYPEOF.OBJECT : stryMutAct_9fa48("3521") ? false : stryMutAct_9fa48("3520") ? true : (stryCov_9fa48("3520", "3521", "3522"), (stryMutAct_9fa48("3523") ? sqlQueryEngine.lastTransactionRecoveryReplayResult : (stryCov_9fa48("3523"), sqlQueryEngine?.lastTransactionRecoveryReplayResult)) && (stryMutAct_9fa48("3525") ? typeof sqlQueryEngine.lastTransactionRecoveryReplayResult !== TYPEOF.OBJECT : stryMutAct_9fa48("3524") ? true : (stryCov_9fa48("3524", "3525"), typeof sqlQueryEngine.lastTransactionRecoveryReplayResult === TYPEOF.OBJECT)))) ? sqlQueryEngine.lastTransactionRecoveryReplayResult : null,
          trackedWriteSplitEvaluations: (stryMutAct_9fa48("3526") ? sqlQueryEngine.lastWriteSplitEvaluationByTable : (stryCov_9fa48("3526"), sqlQueryEngine?.lastWriteSplitEvaluationByTable)) instanceof Map ? sqlQueryEngine.lastWriteSplitEvaluationByTable.size : NUM.ZERO
        }),
        splitEvaluation: this.resolveSplitEvaluationDiagnostics()
      });
    }
  } /**
    * Build canonical query_result payload for control snapshot
    * query.
    * @param {Object} [options={}]
    * @return {Object}
    */
  async buildControlSnapshotQueryResult(options = {}) {
    if (stryMutAct_9fa48("3527")) {
      {}
    } else {
      stryCov_9fa48("3527");
      const forceAuthoritativeRepair = stryMutAct_9fa48("3530") ? options.forceAuthoritativeRepair !== true : stryMutAct_9fa48("3529") ? false : stryMutAct_9fa48("3528") ? true : (stryCov_9fa48("3528", "3529", "3530"), options.forceAuthoritativeRepair === (stryMutAct_9fa48("3531") ? false : (stryCov_9fa48("3531"), true)));
      const snapshot = await this.resolveLocalControlSnapshot(forceAuthoritativeRepair ? stryMutAct_9fa48("3532") ? {} : (stryCov_9fa48("3532"), {
        forceAuthoritativeRepair: stryMutAct_9fa48("3533") ? false : (stryCov_9fa48("3533"), true),
        allowAuthoritativeRepair: options.allowAuthoritativeRepair,
        allowAuthoritativeReadinessRefresh: options.allowAuthoritativeReadinessRefresh,
        allowStaleReadinessOnCacheChange: options.allowStaleReadinessOnCacheChange
      }) : stryMutAct_9fa48("3534") ? {} : (stryCov_9fa48("3534"), {
        allowAuthoritativeRepair: options.allowAuthoritativeRepair,
        allowAuthoritativeReadinessRefresh: options.allowAuthoritativeReadinessRefresh,
        allowStaleReadinessOnCacheChange: options.allowStaleReadinessOnCacheChange
      }));
      return stryMutAct_9fa48("3535") ? {} : (stryCov_9fa48("3535"), {
        success: stryMutAct_9fa48("3536") ? false : (stryCov_9fa48("3536"), true),
        rows: stryMutAct_9fa48("3537") ? [] : (stryCov_9fa48("3537"), [snapshot]),
        count: NUM.ONE,
        partitions: ADMIN_CACHE_DUMP.EMPTY,
        tableName: ADMIN_CONTROL_SNAPSHOT.TABLE_NAME
      });
    }
  }
}
export { AdminControlSnapshot };