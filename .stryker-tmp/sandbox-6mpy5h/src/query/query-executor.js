/**
 * Query Executor - Executes queries across partitions in parallel.
 * Implements parallel query execution and result aggregation.
 * All queries route through message router using service addresses from system cache.
 * Requirements: 7.2, 7.4, 22.1, 22.2, 22.3, 22.4, 22.5, 22.6, 22.7
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
import { LoggingService } from '../logging/logging-service.js';
import { HLCClockService } from '../hlc/hlc-clock-service.js';
import { ConfigurationManager } from '../config/configuration-manager.js';
import { COLUMN, ERRORS, LOG_MSG, METRICS_LOG_TAG, NUM, SQL, TABLES, SERVICE_STATUS, SERVICE_TYPE } from '../constants/index.js';
import { TRANSPORT_ERROR_MSG } from '../constants/transport.js';
import { RAFT_ROLE } from '../raft/constants.js';
import { QUERY_AST_TYPE, QUERY_CONFIG_KEY, QUERY_DEFAULTS, QUERY_ERROR_CODE, QUERY_ERROR_MSG, QUERY_JOIN_TYPE, QUERY_LOG_MSG, QUERY_MESSAGE_TYPE, QUERY_OPERATOR, QUERY_ROUTING_DIAGNOSTIC_REASON, QUERY_ROUTING_REPAIR_REASON, QUERY_AST_NODE, QUERY_RESPONSE_TYPE, QUERY_SQL, QUERY_SUBSYSTEM } from './query-constants.js';
import { PG_EXPR_TYPE } from './pg/pg-compat-constants.js';
import { DistributedMergeEngine } from './distributed/distributed-merge-engine.js';
import { ParallelQueryCoordinator } from './distributed/parallel-query-coordinator.js';
import { DISTRIBUTED_JOIN_STRATEGY } from './distributed/distributed-query-plan-constants.js';
import { MIGRATION_PARTITION_OPERATION } from '../migration/migration-constants.js';
import { CONTROL_PLANE_PARTICIPATION_KIND, CONTROL_PLANE_READINESS_DIMENSION } from '../control-plane/control-plane-readiness-constants.js';
import { compactEligibilitySnapshot, evaluateEligibilityDecision } from '../control-plane/eligibility-snapshot.js';
import { isRetryableControlPlaneError } from '../control-plane/control-plane-error-classification.js';
import { PARTITION_SERVICE_ERROR_MSG } from '../partition/partition-service-constants.js';
import { resolveBootstrapLeaderSelection } from './bootstrap-leader-selection.js';
const QUERY_EXECUTOR_LITERAL = Object.freeze(stryMutAct_9fa48("114727") ? {} : (stryCov_9fa48("114727"), {
  STRING_OBJECT: stryMutAct_9fa48("114728") ? "" : (stryCov_9fa48("114728"), "object"),
  STRING_VALUE: stryMutAct_9fa48("114729") ? "Stryker was here!" : (stryCov_9fa48("114729"), ""),
  STRING_VALUE_2: stryMutAct_9fa48("114730") ? "" : (stryCov_9fa48("114730"), "|"),
  STRING_STRING: stryMutAct_9fa48("114731") ? "" : (stryCov_9fa48("114731"), "string"),
  STRING_BOOLEAN: stryMutAct_9fa48("114732") ? "" : (stryCov_9fa48("114732"), "boolean"),
  STRING_PINNED: stryMutAct_9fa48("114733") ? "" : (stryCov_9fa48("114733"), "pinned"),
  STRING_UNPINNED: stryMutAct_9fa48("114734") ? "" : (stryCov_9fa48("114734"), "unpinned"),
  STRING_LEFT: stryMutAct_9fa48("114735") ? "" : (stryCov_9fa48("114735"), "left"),
  STRING_RIGHT: stryMutAct_9fa48("114736") ? "" : (stryCov_9fa48("114736"), "right"),
  STRING_SELECT: stryMutAct_9fa48("114737") ? "" : (stryCov_9fa48("114737"), "SELECT "),
  STRING_DISTINCT: stryMutAct_9fa48("114738") ? "" : (stryCov_9fa48("114738"), "DISTINCT "),
  STRING_VALUE_3: stryMutAct_9fa48("114739") ? "" : (stryCov_9fa48("114739"), "*"),
  STRING_FUNCTION: stryMutAct_9fa48("114740") ? "" : (stryCov_9fa48("114740"), "function"),
  STRING_ROUTER_CONNECTION_CLOSED: stryMutAct_9fa48("114741") ? "" : (stryCov_9fa48("114741"), "ROUTER_CONNECTION_CLOSED"),
  STRING_CONNECTION_TO_NODE: stryMutAct_9fa48("114742") ? "" : (stryCov_9fa48("114742"), "Connection to node"),
  STRING_CLOSED: stryMutAct_9fa48("114743") ? "" : (stryCov_9fa48("114743"), "closed"),
  STRING_NO_CONNECTION_TO_NODE: stryMutAct_9fa48("114744") ? "" : (stryCov_9fa48("114744"), "No connection to node"),
  STRING_FAILED_TO_FORWARD_WRITE_TO_LEADER: stryMutAct_9fa48("114745") ? "" : (stryCov_9fa48("114745"), "Failed to forward write to leader"),
  STRING_AGGREGATE: stryMutAct_9fa48("114746") ? "" : (stryCov_9fa48("114746"), "aggregate"),
  STRING_COLUMN_REF: stryMutAct_9fa48("114747") ? "" : (stryCov_9fa48("114747"), "column_ref"),
  STRING_STAR: stryMutAct_9fa48("114748") ? "" : (stryCov_9fa48("114748"), "star"),
  STRING_VALUE_4: stryMutAct_9fa48("114749") ? "" : (stryCov_9fa48("114749"), "?"),
  STRING_COUNT: stryMutAct_9fa48("114750") ? "" : (stryCov_9fa48("114750"), "COUNT"),
  STRING_SUM: stryMutAct_9fa48("114751") ? "" : (stryCov_9fa48("114751"), "SUM"),
  STRING_AVG: stryMutAct_9fa48("114752") ? "" : (stryCov_9fa48("114752"), "AVG"),
  STRING_MIN: stryMutAct_9fa48("114753") ? "" : (stryCov_9fa48("114753"), "MIN"),
  STRING_MAX: stryMutAct_9fa48("114754") ? "" : (stryCov_9fa48("114754"), "MAX"),
  STRING_BINARY: stryMutAct_9fa48("114755") ? "" : (stryCov_9fa48("114755"), "binary"),
  STRING_UNARY: stryMutAct_9fa48("114756") ? "" : (stryCov_9fa48("114756"), "unary"),
  STRING_IN: stryMutAct_9fa48("114757") ? "" : (stryCov_9fa48("114757"), "in"),
  STRING_BETWEEN: stryMutAct_9fa48("114758") ? "" : (stryCov_9fa48("114758"), "between"),
  STRING_LIKE: stryMutAct_9fa48("114759") ? "" : (stryCov_9fa48("114759"), "like"),
  STRING_LITERAL: stryMutAct_9fa48("114760") ? "" : (stryCov_9fa48("114760"), "literal"),
  STRING_AND: stryMutAct_9fa48("114761") ? "" : (stryCov_9fa48("114761"), "AND"),
  STRING_OR: stryMutAct_9fa48("114762") ? "" : (stryCov_9fa48("114762"), "OR"),
  STRING_VALUE_5: stryMutAct_9fa48("114763") ? "" : (stryCov_9fa48("114763"), "="),
  STRING_VALUE_6: stryMutAct_9fa48("114764") ? "" : (stryCov_9fa48("114764"), "!="),
  STRING_VALUE_7: stryMutAct_9fa48("114765") ? "" : (stryCov_9fa48("114765"), "<>"),
  STRING_VALUE_8: stryMutAct_9fa48("114766") ? "" : (stryCov_9fa48("114766"), "<"),
  STRING_VALUE_9: stryMutAct_9fa48("114767") ? "" : (stryCov_9fa48("114767"), "<="),
  STRING_VALUE_10: stryMutAct_9fa48("114768") ? "" : (stryCov_9fa48("114768"), ">"),
  STRING_VALUE_11: stryMutAct_9fa48("114769") ? "" : (stryCov_9fa48("114769"), ">="),
  STRING_IS_NULL: stryMutAct_9fa48("114770") ? "" : (stryCov_9fa48("114770"), "IS NULL"),
  STRING_IS_NOT_NULL: stryMutAct_9fa48("114771") ? "" : (stryCov_9fa48("114771"), "IS NOT NULL"),
  STRING_NOT: stryMutAct_9fa48("114772") ? "" : (stryCov_9fa48("114772"), "NOT"),
  STRING_VALUE_12: stryMutAct_9fa48("114773") ? "" : (stryCov_9fa48("114773"), "+"),
  STRING_VALUE_13: stryMutAct_9fa48("114774") ? "" : (stryCov_9fa48("114774"), "-"),
  STRING_VALUE_14: stryMutAct_9fa48("114775") ? "" : (stryCov_9fa48("114775"), ", "),
  STRING_NULL: stryMutAct_9fa48("114776") ? "" : (stryCov_9fa48("114776"), "NULL"),
  STRING_NOT_LIKE: stryMutAct_9fa48("114777") ? "" : (stryCov_9fa48("114777"), "NOT LIKE"),
  STRING_LIKE_2: stryMutAct_9fa48("114778") ? "" : (stryCov_9fa48("114778"), "LIKE"),
  STRING_PARAMETER: stryMutAct_9fa48("114779") ? "" : (stryCov_9fa48("114779"), "parameter"),
  STRING_CASE: stryMutAct_9fa48("114780") ? "" : (stryCov_9fa48("114780"), "CASE"),
  STRING_VALUE_15: stryMutAct_9fa48("114781") ? "" : (stryCov_9fa48("114781"), " "),
  STRING_WHEN: stryMutAct_9fa48("114782") ? "" : (stryCov_9fa48("114782"), " WHEN "),
  STRING_THEN: stryMutAct_9fa48("114783") ? "" : (stryCov_9fa48("114783"), " THEN "),
  STRING_ELSE: stryMutAct_9fa48("114784") ? "" : (stryCov_9fa48("114784"), " ELSE "),
  STRING_END: stryMutAct_9fa48("114785") ? "" : (stryCov_9fa48("114785"), " END"),
  STRING_EXECUTING_INSERT: stryMutAct_9fa48("114786") ? "" : (stryCov_9fa48("114786"), "Executing INSERT"),
  STRING_INSERT: stryMutAct_9fa48("114787") ? "" : (stryCov_9fa48("114787"), "INSERT"),
  STRING_NUMBER: stryMutAct_9fa48("114788") ? "" : (stryCov_9fa48("114788"), "number"),
  STRING_EXECUTING_UPDATE: stryMutAct_9fa48("114789") ? "" : (stryCov_9fa48("114789"), "Executing UPDATE"),
  STRING_EXECUTING_DELETE: stryMutAct_9fa48("114790") ? "" : (stryCov_9fa48("114790"), "Executing DELETE")
}));
const QUERY_MESSAGE_FIELD_SPLIT_MIRROR_ORIGIN = stryMutAct_9fa48("114791") ? "" : (stryCov_9fa48("114791"), 'splitMirrorOrigin');
const QUERY_MESSAGE_FIELD_MIGRATION_OPERATION = stryMutAct_9fa48("114792") ? "" : (stryCov_9fa48("114792"), 'migrationOperation');
const QUERY_MESSAGE_FIELD_MIGRATION_ID = stryMutAct_9fa48("114793") ? "" : (stryCov_9fa48("114793"), 'migrationId');
const QUERY_MESSAGE_FIELD_SESSION_ID = stryMutAct_9fa48("114794") ? "" : (stryCov_9fa48("114794"), 'sessionId');
const LEADER_GAP_REASON_OWNER_MISSING = stryMutAct_9fa48("114795") ? "" : (stryCov_9fa48("114795"), 'owner_missing');
const LEADER_GAP_REASON_SERVICE_MISSING = stryMutAct_9fa48("114796") ? "" : (stryCov_9fa48("114796"), 'service_missing');
const SYSTEM_TABLE_NAMES = new Set(Object.values(TABLES));
function buildPartitionServiceWitnessFingerprint(service) {
  if (stryMutAct_9fa48("114797")) {
    {}
  } else {
    stryCov_9fa48("114797");
    if (stryMutAct_9fa48("114800") ? !service && typeof service !== QUERY_EXECUTOR_LITERAL.STRING_OBJECT : stryMutAct_9fa48("114799") ? false : stryMutAct_9fa48("114798") ? true : (stryCov_9fa48("114798", "114799", "114800"), (stryMutAct_9fa48("114801") ? service : (stryCov_9fa48("114801"), !service)) || (stryMutAct_9fa48("114803") ? typeof service === QUERY_EXECUTOR_LITERAL.STRING_OBJECT : stryMutAct_9fa48("114802") ? false : (stryCov_9fa48("114802", "114803"), typeof service !== QUERY_EXECUTOR_LITERAL.STRING_OBJECT)))) {
      if (stryMutAct_9fa48("114804")) {
        {}
      } else {
        stryCov_9fa48("114804");
        return null;
      }
    }
    const serviceId = String(stryMutAct_9fa48("114807") ? (service.service_id || service.replica_id || service.serviceId || service.replicaId) && '' : stryMutAct_9fa48("114806") ? false : stryMutAct_9fa48("114805") ? true : (stryCov_9fa48("114805", "114806", "114807"), (stryMutAct_9fa48("114809") ? (service.service_id || service.replica_id || service.serviceId) && service.replicaId : stryMutAct_9fa48("114808") ? false : (stryCov_9fa48("114808", "114809"), (stryMutAct_9fa48("114811") ? (service.service_id || service.replica_id) && service.serviceId : stryMutAct_9fa48("114810") ? false : (stryCov_9fa48("114810", "114811"), (stryMutAct_9fa48("114813") ? service.service_id && service.replica_id : stryMutAct_9fa48("114812") ? false : (stryCov_9fa48("114812", "114813"), service.service_id || service.replica_id)) || service.serviceId)) || service.replicaId)) || (stryMutAct_9fa48("114814") ? "Stryker was here!" : (stryCov_9fa48("114814"), ''))));
    const address = String(stryMutAct_9fa48("114817") ? service.address && '' : stryMutAct_9fa48("114816") ? false : stryMutAct_9fa48("114815") ? true : (stryCov_9fa48("114815", "114816", "114817"), service.address || (stryMutAct_9fa48("114818") ? "Stryker was here!" : (stryCov_9fa48("114818"), ''))));
    if (stryMutAct_9fa48("114821") ? serviceId.length === NUM.ZERO || address.length === NUM.ZERO : stryMutAct_9fa48("114820") ? false : stryMutAct_9fa48("114819") ? true : (stryCov_9fa48("114819", "114820", "114821"), (stryMutAct_9fa48("114823") ? serviceId.length !== NUM.ZERO : stryMutAct_9fa48("114822") ? true : (stryCov_9fa48("114822", "114823"), serviceId.length === NUM.ZERO)) && (stryMutAct_9fa48("114825") ? address.length !== NUM.ZERO : stryMutAct_9fa48("114824") ? true : (stryCov_9fa48("114824", "114825"), address.length === NUM.ZERO)))) {
      if (stryMutAct_9fa48("114826")) {
        {}
      } else {
        stryCov_9fa48("114826");
        return null;
      }
    }
    const updatedAt = stryMutAct_9fa48("114827") ? (service.updated_at ?? service.updatedAt ?? service.created_at ?? service.createdAt) && null : (stryCov_9fa48("114827"), (stryMutAct_9fa48("114828") ? (service.updated_at ?? service.updatedAt ?? service.created_at) && service.createdAt : (stryCov_9fa48("114828"), (stryMutAct_9fa48("114829") ? (service.updated_at ?? service.updatedAt) && service.created_at : (stryCov_9fa48("114829"), (stryMutAct_9fa48("114830") ? service.updated_at && service.updatedAt : (stryCov_9fa48("114830"), service.updated_at ?? service.updatedAt)) ?? service.created_at)) ?? service.createdAt)) ?? null);
    return (stryMutAct_9fa48("114831") ? [] : (stryCov_9fa48("114831"), [serviceId, address, String(stryMutAct_9fa48("114834") ? (service.node_id || service.nodeId) && QUERY_EXECUTOR_LITERAL.STRING_VALUE : stryMutAct_9fa48("114833") ? false : stryMutAct_9fa48("114832") ? true : (stryCov_9fa48("114832", "114833", "114834"), (stryMutAct_9fa48("114836") ? service.node_id && service.nodeId : stryMutAct_9fa48("114835") ? false : (stryCov_9fa48("114835", "114836"), service.node_id || service.nodeId)) || QUERY_EXECUTOR_LITERAL.STRING_VALUE)), String(stryMutAct_9fa48("114839") ? (service.raft_role || service.raftRole) && QUERY_EXECUTOR_LITERAL.STRING_VALUE : stryMutAct_9fa48("114838") ? false : stryMutAct_9fa48("114837") ? true : (stryCov_9fa48("114837", "114838", "114839"), (stryMutAct_9fa48("114841") ? service.raft_role && service.raftRole : stryMutAct_9fa48("114840") ? false : (stryCov_9fa48("114840", "114841"), service.raft_role || service.raftRole)) || QUERY_EXECUTOR_LITERAL.STRING_VALUE)), String(stryMutAct_9fa48("114844") ? service.status && QUERY_EXECUTOR_LITERAL.STRING_VALUE : stryMutAct_9fa48("114843") ? false : stryMutAct_9fa48("114842") ? true : (stryCov_9fa48("114842", "114843", "114844"), service.status || QUERY_EXECUTOR_LITERAL.STRING_VALUE)), Number.isFinite(updatedAt) ? String(Math.floor(updatedAt)) : QUERY_EXECUTOR_LITERAL.STRING_VALUE])).join(QUERY_EXECUTOR_LITERAL.STRING_VALUE_2);
  }
}
function normalizeParticipantFailureString(value) {
  if (stryMutAct_9fa48("114845")) {
    {}
  } else {
    stryCov_9fa48("114845");
    return (stryMutAct_9fa48("114848") ? typeof value === QUERY_EXECUTOR_LITERAL.STRING_STRING || value.length > NUM.ZERO : stryMutAct_9fa48("114847") ? false : stryMutAct_9fa48("114846") ? true : (stryCov_9fa48("114846", "114847", "114848"), (stryMutAct_9fa48("114850") ? typeof value !== QUERY_EXECUTOR_LITERAL.STRING_STRING : stryMutAct_9fa48("114849") ? true : (stryCov_9fa48("114849", "114850"), typeof value === QUERY_EXECUTOR_LITERAL.STRING_STRING)) && (stryMutAct_9fa48("114853") ? value.length <= NUM.ZERO : stryMutAct_9fa48("114852") ? value.length >= NUM.ZERO : stryMutAct_9fa48("114851") ? true : (stryCov_9fa48("114851", "114852", "114853"), value.length > NUM.ZERO)))) ? value : null;
  }
}
function normalizeParticipantRetryAfterMs(value) {
  if (stryMutAct_9fa48("114854")) {
    {}
  } else {
    stryCov_9fa48("114854");
    return (stryMutAct_9fa48("114857") ? Number.isFinite(value) || value >= NUM.ZERO : stryMutAct_9fa48("114856") ? false : stryMutAct_9fa48("114855") ? true : (stryCov_9fa48("114855", "114856", "114857"), Number.isFinite(value) && (stryMutAct_9fa48("114860") ? value < NUM.ZERO : stryMutAct_9fa48("114859") ? value > NUM.ZERO : stryMutAct_9fa48("114858") ? true : (stryCov_9fa48("114858", "114859", "114860"), value >= NUM.ZERO)))) ? Math.floor(value) : null;
  }
}
function resolveParticipantBackpressureState(result = {}) {
  if (stryMutAct_9fa48("114861")) {
    {}
  } else {
    stryCov_9fa48("114861");
    if (stryMutAct_9fa48("114864") ? typeof result?.backpressured !== QUERY_EXECUTOR_LITERAL.STRING_BOOLEAN : stryMutAct_9fa48("114863") ? false : stryMutAct_9fa48("114862") ? true : (stryCov_9fa48("114862", "114863", "114864"), typeof (stryMutAct_9fa48("114865") ? result.backpressured : (stryCov_9fa48("114865"), result?.backpressured)) === QUERY_EXECUTOR_LITERAL.STRING_BOOLEAN)) {
      if (stryMutAct_9fa48("114866")) {
        {}
      } else {
        stryCov_9fa48("114866");
        return result.backpressured;
      }
    }
    if (stryMutAct_9fa48("114869") ? result?.deferRetry !== true : stryMutAct_9fa48("114868") ? false : stryMutAct_9fa48("114867") ? true : (stryCov_9fa48("114867", "114868", "114869"), (stryMutAct_9fa48("114870") ? result.deferRetry : (stryCov_9fa48("114870"), result?.deferRetry)) === (stryMutAct_9fa48("114871") ? false : (stryCov_9fa48("114871"), true)))) {
      if (stryMutAct_9fa48("114872")) {
        {}
      } else {
        stryCov_9fa48("114872");
        return stryMutAct_9fa48("114873") ? false : (stryCov_9fa48("114873"), true);
      }
    }
    return stryMutAct_9fa48("114876") ? Number.isFinite(result?.retryAfterMs) || result.retryAfterMs > NUM.ZERO : stryMutAct_9fa48("114875") ? false : stryMutAct_9fa48("114874") ? true : (stryCov_9fa48("114874", "114875", "114876"), Number.isFinite(stryMutAct_9fa48("114877") ? result.retryAfterMs : (stryCov_9fa48("114877"), result?.retryAfterMs)) && (stryMutAct_9fa48("114880") ? result.retryAfterMs <= NUM.ZERO : stryMutAct_9fa48("114879") ? result.retryAfterMs >= NUM.ZERO : stryMutAct_9fa48("114878") ? true : (stryCov_9fa48("114878", "114879", "114880"), result.retryAfterMs > NUM.ZERO)));
  }
}
function buildParticipantFailureEntry(result) {
  if (stryMutAct_9fa48("114881")) {
    {}
  } else {
    stryCov_9fa48("114881");
    return stryMutAct_9fa48("114882") ? {} : (stryCov_9fa48("114882"), {
      partitionId: result.partitionId,
      participantNodeId: normalizeParticipantFailureString(result.participantNodeId),
      participantAddress: normalizeParticipantFailureString(result.participantAddress),
      errorCode: normalizeParticipantFailureString(result.errorCode),
      error: stryMutAct_9fa48("114885") ? result.error && ERRORS.QUERY_FAILED : stryMutAct_9fa48("114884") ? false : stryMutAct_9fa48("114883") ? true : (stryCov_9fa48("114883", "114884", "114885"), result.error || ERRORS.QUERY_FAILED),
      durationMs: Number.isFinite(stryMutAct_9fa48("114886") ? result.durationMs : (stryCov_9fa48("114886"), result?.durationMs)) ? stryMutAct_9fa48("114887") ? Math.min(NUM.ZERO, Math.floor(result.durationMs)) : (stryCov_9fa48("114887"), Math.max(NUM.ZERO, Math.floor(result.durationMs))) : null,
      retryAfterMs: normalizeParticipantRetryAfterMs(stryMutAct_9fa48("114888") ? result.retryAfterMs : (stryCov_9fa48("114888"), result?.retryAfterMs)),
      deferRetry: stryMutAct_9fa48("114891") ? result?.deferRetry !== true : stryMutAct_9fa48("114890") ? false : stryMutAct_9fa48("114889") ? true : (stryCov_9fa48("114889", "114890", "114891"), (stryMutAct_9fa48("114892") ? result.deferRetry : (stryCov_9fa48("114892"), result?.deferRetry)) === (stryMutAct_9fa48("114893") ? false : (stryCov_9fa48("114893"), true))),
      backpressured: resolveParticipantBackpressureState(result),
      failedTable: normalizeParticipantFailureString(result.failedTable)
    });
  }
}
function buildDistributedFailureSummary(failedResults) {
  if (stryMutAct_9fa48("114894")) {
    {}
  } else {
    stryCov_9fa48("114894");
    const participantFailures = failedResults.map(stryMutAct_9fa48("114895") ? () => undefined : (stryCov_9fa48("114895"), result => buildParticipantFailureEntry(result)));
    return stryMutAct_9fa48("114896") ? {} : (stryCov_9fa48("114896"), {
      failedPartitions: failedResults.map(stryMutAct_9fa48("114897") ? () => undefined : (stryCov_9fa48("114897"), result => result.partitionId)),
      partitionErrors: participantFailures,
      participantFailures,
      firstFailedParticipant: (stryMutAct_9fa48("114901") ? participantFailures.length <= NUM.ZERO : stryMutAct_9fa48("114900") ? participantFailures.length >= NUM.ZERO : stryMutAct_9fa48("114899") ? false : stryMutAct_9fa48("114898") ? true : (stryCov_9fa48("114898", "114899", "114900", "114901"), participantFailures.length > NUM.ZERO)) ? participantFailures[NUM.ZERO] : null
    });
  }
}

/**
 * QueryExecutor handles parallel query execution across partitions
 * and aggregates results while preserving SQL semantics.
 * Supports distributed read-only queries with cross-partition JOINs
 * and aggregate functions (COUNT, SUM, AVG, MIN, MAX).
 * Routes ALL queries through message router - no local vs remote distinction.
 */
class QueryExecutor {
  /**
   * Create a new query executor.
   * @param {Object} options - Configuration options.
   * @param {Object} options.messageRouter - Message router for query routing.
   * @param {Object} options.systemCache - System table cache for service address lookup.
   * @param {string} options.nodeId - Node ID for HLC.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("114902")) {
      {}
    } else {
      stryCov_9fa48("114902");
      this.messageRouter = stryMutAct_9fa48("114905") ? options.messageRouter && null : stryMutAct_9fa48("114904") ? false : stryMutAct_9fa48("114903") ? true : (stryCov_9fa48("114903", "114904", "114905"), options.messageRouter || null);
      this.systemCache = stryMutAct_9fa48("114908") ? options.systemCache && null : stryMutAct_9fa48("114907") ? false : stryMutAct_9fa48("114906") ? true : (stryCov_9fa48("114906", "114907", "114908"), options.systemCache || null);
      this.routingMetadataOverlay = stryMutAct_9fa48("114911") ? options.routingMetadataOverlay && null : stryMutAct_9fa48("114910") ? false : stryMutAct_9fa48("114909") ? true : (stryCov_9fa48("114909", "114910", "114911"), options.routingMetadataOverlay || null);
      this.bootstrapTopologySnapshotOwner = stryMutAct_9fa48("114914") ? options.bootstrapTopologySnapshotOwner && null : stryMutAct_9fa48("114913") ? false : stryMutAct_9fa48("114912") ? true : (stryCov_9fa48("114912", "114913", "114914"), options.bootstrapTopologySnapshotOwner || null);
      this.controlPlaneReadinessService = stryMutAct_9fa48("114917") ? options.controlPlaneReadinessService && null : stryMutAct_9fa48("114916") ? false : stryMutAct_9fa48("114915") ? true : (stryCov_9fa48("114915", "114916", "114917"), options.controlPlaneReadinessService || null);
      this.defaultRoutingReadinessDimension = stryMutAct_9fa48("114920") ? options.defaultRoutingReadinessDimension && CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE : stryMutAct_9fa48("114919") ? false : stryMutAct_9fa48("114918") ? true : (stryCov_9fa48("114918", "114919", "114920"), options.defaultRoutingReadinessDimension || CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE);
      this.nodeId = stryMutAct_9fa48("114923") ? options.nodeId && QUERY_SUBSYSTEM.QUERY_EXECUTOR : stryMutAct_9fa48("114922") ? false : stryMutAct_9fa48("114921") ? true : (stryCov_9fa48("114921", "114922", "114923"), options.nodeId || QUERY_SUBSYSTEM.QUERY_EXECUTOR);
      this.hlcClock = new HLCClockService(this.nodeId);
      this.mergeEngine = stryMutAct_9fa48("114926") ? options.mergeEngine && new DistributedMergeEngine() : stryMutAct_9fa48("114925") ? false : stryMutAct_9fa48("114924") ? true : (stryCov_9fa48("114924", "114925", "114926"), options.mergeEngine || new DistributedMergeEngine());
      this.parallelQueryCoordinator = stryMutAct_9fa48("114929") ? options.parallelQueryCoordinator && new ParallelQueryCoordinator({
        systemCache: this.systemCache,
        nodeId: this.nodeId,
        partitionQueryExecutor: (sql, partitionId, params, coordinatorOptions = {}) => this.executeOnPartition(partitionId, sql, params, coordinatorOptions.forRead === true, coordinatorOptions.preferLeader === true, coordinatorOptions.preferSameLatencyGroup === true, coordinatorOptions)
      }) : stryMutAct_9fa48("114928") ? false : stryMutAct_9fa48("114927") ? true : (stryCov_9fa48("114927", "114928", "114929"), options.parallelQueryCoordinator || new ParallelQueryCoordinator(stryMutAct_9fa48("114930") ? {} : (stryCov_9fa48("114930"), {
        systemCache: this.systemCache,
        nodeId: this.nodeId,
        partitionQueryExecutor: stryMutAct_9fa48("114931") ? () => undefined : (stryCov_9fa48("114931"), (sql, partitionId, params, coordinatorOptions = {}) => this.executeOnPartition(partitionId, sql, params, stryMutAct_9fa48("114934") ? coordinatorOptions.forRead !== true : stryMutAct_9fa48("114933") ? false : stryMutAct_9fa48("114932") ? true : (stryCov_9fa48("114932", "114933", "114934"), coordinatorOptions.forRead === (stryMutAct_9fa48("114935") ? false : (stryCov_9fa48("114935"), true))), stryMutAct_9fa48("114938") ? coordinatorOptions.preferLeader !== true : stryMutAct_9fa48("114937") ? false : stryMutAct_9fa48("114936") ? true : (stryCov_9fa48("114936", "114937", "114938"), coordinatorOptions.preferLeader === (stryMutAct_9fa48("114939") ? false : (stryCov_9fa48("114939"), true))), stryMutAct_9fa48("114942") ? coordinatorOptions.preferSameLatencyGroup !== true : stryMutAct_9fa48("114941") ? false : stryMutAct_9fa48("114940") ? true : (stryCov_9fa48("114940", "114941", "114942"), coordinatorOptions.preferSameLatencyGroup === (stryMutAct_9fa48("114943") ? false : (stryCov_9fa48("114943"), true))), coordinatorOptions))
      })));
      this.lastCoordinatorMetrics = null;
      this.logger = this.initLogger();

      // Per-partition warning throttle to prevent log floods when a
      // partition has no active service (e.g. during rebalancer lag).
      this.noServiceWarnLastAt = new Map();
      this.canonicalLeaderWarnLastAt = new Map();

      // Configuration
      const config = ConfigurationManager.getInstance();
      this.queryTimeoutMs = stryMutAct_9fa48("114946") ? config.get(QUERY_CONFIG_KEY.QUERY_TIMEOUT_MS) && QUERY_DEFAULTS.QUERY_TIMEOUT_MS : stryMutAct_9fa48("114945") ? false : stryMutAct_9fa48("114944") ? true : (stryCov_9fa48("114944", "114945", "114946"), config.get(QUERY_CONFIG_KEY.QUERY_TIMEOUT_MS) || QUERY_DEFAULTS.QUERY_TIMEOUT_MS);
      this.leaderRetryAttempts = stryMutAct_9fa48("114949") ? config.get(QUERY_CONFIG_KEY.LEADER_RETRY_ATTEMPTS) && QUERY_DEFAULTS.LEADER_RETRY_ATTEMPTS : stryMutAct_9fa48("114948") ? false : stryMutAct_9fa48("114947") ? true : (stryCov_9fa48("114947", "114948", "114949"), config.get(QUERY_CONFIG_KEY.LEADER_RETRY_ATTEMPTS) || QUERY_DEFAULTS.LEADER_RETRY_ATTEMPTS);
      this.leaderRetryDelayMs = stryMutAct_9fa48("114952") ? config.get(QUERY_CONFIG_KEY.LEADER_RETRY_DELAY_MS) && QUERY_DEFAULTS.LEADER_RETRY_DELAY_MS : stryMutAct_9fa48("114951") ? false : stryMutAct_9fa48("114950") ? true : (stryCov_9fa48("114950", "114951", "114952"), config.get(QUERY_CONFIG_KEY.LEADER_RETRY_DELAY_MS) || QUERY_DEFAULTS.LEADER_RETRY_DELAY_MS);
      this.readRetryAttempts = stryMutAct_9fa48("114955") ? config.get(QUERY_CONFIG_KEY.READ_RETRY_ATTEMPTS) && QUERY_DEFAULTS.READ_RETRY_ATTEMPTS : stryMutAct_9fa48("114954") ? false : stryMutAct_9fa48("114953") ? true : (stryCov_9fa48("114953", "114954", "114955"), config.get(QUERY_CONFIG_KEY.READ_RETRY_ATTEMPTS) || QUERY_DEFAULTS.READ_RETRY_ATTEMPTS);
      this.noServiceWarnThrottleMs = QUERY_DEFAULTS.NO_SERVICE_WARN_THROTTLE_MS;
      this.noHandlerAddressQuarantineMsExplicit = stryMutAct_9fa48("114958") ? Number.isFinite(options.noHandlerAddressQuarantineMs) || options.noHandlerAddressQuarantineMs > NUM.ZERO : stryMutAct_9fa48("114957") ? false : stryMutAct_9fa48("114956") ? true : (stryCov_9fa48("114956", "114957", "114958"), Number.isFinite(options.noHandlerAddressQuarantineMs) && (stryMutAct_9fa48("114961") ? options.noHandlerAddressQuarantineMs <= NUM.ZERO : stryMutAct_9fa48("114960") ? options.noHandlerAddressQuarantineMs >= NUM.ZERO : stryMutAct_9fa48("114959") ? true : (stryCov_9fa48("114959", "114960", "114961"), options.noHandlerAddressQuarantineMs > NUM.ZERO)));
      this.noHandlerAddressQuarantineMs = this.noHandlerAddressQuarantineMsExplicit ? Math.floor(options.noHandlerAddressQuarantineMs) : this.noServiceWarnThrottleMs;
      this.temporarilyUnroutableAddressesByPartition = new Map();
      this.sessionPartitionAddresses = new Map();
    }
  }

  /**
   * Initialize logger.
   * @return {Object} Logger instance.
   * @private
   */
  initLogger() {
    if (stryMutAct_9fa48("114962")) {
      {}
    } else {
      stryCov_9fa48("114962");
      try {
        if (stryMutAct_9fa48("114963")) {
          {}
        } else {
          stryCov_9fa48("114963");
          const loggingService = LoggingService.getInstance();
          if (stryMutAct_9fa48("114965") ? false : stryMutAct_9fa48("114964") ? true : (stryCov_9fa48("114964", "114965"), loggingService.isInitialized())) {
            if (stryMutAct_9fa48("114966")) {
              {}
            } else {
              stryCov_9fa48("114966");
              return loggingService.forSubsystem(QUERY_SUBSYSTEM.QUERY_EXECUTOR);
            }
          }
        }
      } catch (_logErr) {
        // Logging not available — fall through to console
      }
      return console;
    }
  }

  /**
   * Set the message router for query routing.
   * @param {Object} router - Message router instance.
   */
  setMessageRouter(router) {
    if (stryMutAct_9fa48("114967")) {
      {}
    } else {
      stryCov_9fa48("114967");
      this.messageRouter = router;
    }
  }

  /**
   * Set the system cache for service address lookup.
   * @param {Object} cache - System table cache instance.
   */
  setSystemCache(cache) {
    if (stryMutAct_9fa48("114968")) {
      {}
    } else {
      stryCov_9fa48("114968");
      this.systemCache = cache;
      if (stryMutAct_9fa48("114970") ? false : stryMutAct_9fa48("114969") ? true : (stryCov_9fa48("114969", "114970"), this.parallelQueryCoordinator)) {
        if (stryMutAct_9fa48("114971")) {
          {}
        } else {
          stryCov_9fa48("114971");
          this.parallelQueryCoordinator.setSystemCache(cache);
        }
      }
    }
  }

  /**
   * Build one stable affinity key for session-bound partition routing.
   * @param {string|null|undefined} sessionId
   * @param {string|null|undefined} partitionId
   * @return {string|null}
   * @private
   */
  buildSessionPartitionAddressKey(sessionId, partitionId) {
    if (stryMutAct_9fa48("114972")) {
      {}
    } else {
      stryCov_9fa48("114972");
      if (stryMutAct_9fa48("114975") ? (typeof sessionId !== QUERY_EXECUTOR_LITERAL.STRING_STRING || sessionId.length === NUM.ZERO || typeof partitionId !== QUERY_EXECUTOR_LITERAL.STRING_STRING) && partitionId.length === NUM.ZERO : stryMutAct_9fa48("114974") ? false : stryMutAct_9fa48("114973") ? true : (stryCov_9fa48("114973", "114974", "114975"), (stryMutAct_9fa48("114977") ? (typeof sessionId !== QUERY_EXECUTOR_LITERAL.STRING_STRING || sessionId.length === NUM.ZERO) && typeof partitionId !== QUERY_EXECUTOR_LITERAL.STRING_STRING : stryMutAct_9fa48("114976") ? false : (stryCov_9fa48("114976", "114977"), (stryMutAct_9fa48("114979") ? typeof sessionId !== QUERY_EXECUTOR_LITERAL.STRING_STRING && sessionId.length === NUM.ZERO : stryMutAct_9fa48("114978") ? false : (stryCov_9fa48("114978", "114979"), (stryMutAct_9fa48("114981") ? typeof sessionId === QUERY_EXECUTOR_LITERAL.STRING_STRING : stryMutAct_9fa48("114980") ? false : (stryCov_9fa48("114980", "114981"), typeof sessionId !== QUERY_EXECUTOR_LITERAL.STRING_STRING)) || (stryMutAct_9fa48("114983") ? sessionId.length !== NUM.ZERO : stryMutAct_9fa48("114982") ? false : (stryCov_9fa48("114982", "114983"), sessionId.length === NUM.ZERO)))) || (stryMutAct_9fa48("114985") ? typeof partitionId === QUERY_EXECUTOR_LITERAL.STRING_STRING : stryMutAct_9fa48("114984") ? false : (stryCov_9fa48("114984", "114985"), typeof partitionId !== QUERY_EXECUTOR_LITERAL.STRING_STRING)))) || (stryMutAct_9fa48("114987") ? partitionId.length !== NUM.ZERO : stryMutAct_9fa48("114986") ? false : (stryCov_9fa48("114986", "114987"), partitionId.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("114988")) {
          {}
        } else {
          stryCov_9fa48("114988");
          return null;
        }
      }
      return stryMutAct_9fa48("114989") ? `` : (stryCov_9fa48("114989"), `${sessionId}::${partitionId}`);
    }
  }

  /**
   * Get the currently pinned address for one session-bound partition.
   * @param {string|null|undefined} sessionId
   * @param {string|null|undefined} partitionId
   * @return {string|null}
   * @private
   */
  getSessionPartitionAddress(sessionId, partitionId) {
    if (stryMutAct_9fa48("114990")) {
      {}
    } else {
      stryCov_9fa48("114990");
      const pinState = this.getSessionPartitionAddressState(sessionId, partitionId);
      return (stryMutAct_9fa48("114993") ? pinState.state !== QUERY_EXECUTOR_LITERAL.STRING_PINNED : stryMutAct_9fa48("114992") ? false : stryMutAct_9fa48("114991") ? true : (stryCov_9fa48("114991", "114992", "114993"), pinState.state === QUERY_EXECUTOR_LITERAL.STRING_PINNED)) ? pinState.address : null;
    }
  }

  /**
   * Resolve one explicit session-bound partition pin state.
   * @param {string|null|undefined} sessionId
   * @param {string|null|undefined} partitionId
   * @return {Object}
   * @private
   */
  getSessionPartitionAddressState(sessionId, partitionId) {
    if (stryMutAct_9fa48("114994")) {
      {}
    } else {
      stryCov_9fa48("114994");
      const key = this.buildSessionPartitionAddressKey(sessionId, partitionId);
      if (stryMutAct_9fa48("114997") ? false : stryMutAct_9fa48("114996") ? true : stryMutAct_9fa48("114995") ? key : (stryCov_9fa48("114995", "114996", "114997"), !key)) {
        if (stryMutAct_9fa48("114998")) {
          {}
        } else {
          stryCov_9fa48("114998");
          return Object.freeze(stryMutAct_9fa48("114999") ? {} : (stryCov_9fa48("114999"), {
            state: QUERY_EXECUTOR_LITERAL.STRING_UNPINNED
          }));
        }
      }
      const address = this.sessionPartitionAddresses.get(key);
      if (stryMutAct_9fa48("115002") ? typeof address !== QUERY_EXECUTOR_LITERAL.STRING_STRING && address.length === NUM.ZERO : stryMutAct_9fa48("115001") ? false : stryMutAct_9fa48("115000") ? true : (stryCov_9fa48("115000", "115001", "115002"), (stryMutAct_9fa48("115004") ? typeof address === QUERY_EXECUTOR_LITERAL.STRING_STRING : stryMutAct_9fa48("115003") ? false : (stryCov_9fa48("115003", "115004"), typeof address !== QUERY_EXECUTOR_LITERAL.STRING_STRING)) || (stryMutAct_9fa48("115006") ? address.length !== NUM.ZERO : stryMutAct_9fa48("115005") ? false : (stryCov_9fa48("115005", "115006"), address.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("115007")) {
          {}
        } else {
          stryCov_9fa48("115007");
          return Object.freeze(stryMutAct_9fa48("115008") ? {} : (stryCov_9fa48("115008"), {
            state: QUERY_EXECUTOR_LITERAL.STRING_UNPINNED
          }));
        }
      }
      return Object.freeze(stryMutAct_9fa48("115009") ? {} : (stryCov_9fa48("115009"), {
        state: QUERY_EXECUTOR_LITERAL.STRING_PINNED,
        address
      }));
    }
  }

  /**
   * Pin one session-bound partition to the replica address that actually
   * accepted the previous transactional step.
   * @param {string|null|undefined} sessionId
   * @param {string|null|undefined} partitionId
   * @param {string|null|undefined} address
   * @private
   */
  setSessionPartitionAddress(sessionId, partitionId, address) {
    if (stryMutAct_9fa48("115010")) {
      {}
    } else {
      stryCov_9fa48("115010");
      const key = this.buildSessionPartitionAddressKey(sessionId, partitionId);
      if (stryMutAct_9fa48("115013") ? (!key || typeof address !== QUERY_EXECUTOR_LITERAL.STRING_STRING) && address.length === NUM.ZERO : stryMutAct_9fa48("115012") ? false : stryMutAct_9fa48("115011") ? true : (stryCov_9fa48("115011", "115012", "115013"), (stryMutAct_9fa48("115015") ? !key && typeof address !== QUERY_EXECUTOR_LITERAL.STRING_STRING : stryMutAct_9fa48("115014") ? false : (stryCov_9fa48("115014", "115015"), (stryMutAct_9fa48("115016") ? key : (stryCov_9fa48("115016"), !key)) || (stryMutAct_9fa48("115018") ? typeof address === QUERY_EXECUTOR_LITERAL.STRING_STRING : stryMutAct_9fa48("115017") ? false : (stryCov_9fa48("115017", "115018"), typeof address !== QUERY_EXECUTOR_LITERAL.STRING_STRING)))) || (stryMutAct_9fa48("115020") ? address.length !== NUM.ZERO : stryMutAct_9fa48("115019") ? false : (stryCov_9fa48("115019", "115020"), address.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("115021")) {
          {}
        } else {
          stryCov_9fa48("115021");
          return;
        }
      }
      this.sessionPartitionAddresses.set(key, address);
    }
  }

  /**
   * Clear a stale session-bound partition address pin.
   * @param {string|null|undefined} sessionId
   * @param {string|null|undefined} partitionId
   * @private
   */
  clearSessionPartitionAddress(sessionId, partitionId) {
    if (stryMutAct_9fa48("115022")) {
      {}
    } else {
      stryCov_9fa48("115022");
      const key = this.buildSessionPartitionAddressKey(sessionId, partitionId);
      if (stryMutAct_9fa48("115025") ? false : stryMutAct_9fa48("115024") ? true : stryMutAct_9fa48("115023") ? key : (stryCov_9fa48("115023", "115024", "115025"), !key)) {
        if (stryMutAct_9fa48("115026")) {
          {}
        } else {
          stryCov_9fa48("115026");
          return;
        }
      }
      this.sessionPartitionAddresses.delete(key);
    }
  }

  /**
   * Prefer the previously successful transactional replica when it is still
   * among the current routable candidates.
   * @param {Array<Object>} candidates
   * @param {string|null|undefined} sessionId
   * @param {string|null|undefined} partitionId
   * @return {Array<Object>}
   * @private
   */
  prioritizeSessionPartitionAddress(candidates, routingSnapshot, sessionId, partitionId) {
    if (stryMutAct_9fa48("115027")) {
      {}
    } else {
      stryCov_9fa48("115027");
      if (stryMutAct_9fa48("115030") ? false : stryMutAct_9fa48("115029") ? true : stryMutAct_9fa48("115028") ? Array.isArray(candidates) : (stryCov_9fa48("115028", "115029", "115030"), !Array.isArray(candidates))) {
        if (stryMutAct_9fa48("115031")) {
          {}
        } else {
          stryCov_9fa48("115031");
          return stryMutAct_9fa48("115032") ? ["Stryker was here"] : (stryCov_9fa48("115032"), []);
        }
      }
      const pinState = this.getSessionPartitionAddressState(sessionId, partitionId);
      if (stryMutAct_9fa48("115035") ? pinState.state === QUERY_EXECUTOR_LITERAL.STRING_PINNED : stryMutAct_9fa48("115034") ? false : stryMutAct_9fa48("115033") ? true : (stryCov_9fa48("115033", "115034", "115035"), pinState.state !== QUERY_EXECUTOR_LITERAL.STRING_PINNED)) {
        if (stryMutAct_9fa48("115036")) {
          {}
        } else {
          stryCov_9fa48("115036");
          return candidates;
        }
      }
      const preferredAddress = pinState.address;
      const preferredCandidateIndex = candidates.findIndex(stryMutAct_9fa48("115037") ? () => undefined : (stryCov_9fa48("115037"), candidate => stryMutAct_9fa48("115040") ? candidate?.address !== preferredAddress : stryMutAct_9fa48("115039") ? false : stryMutAct_9fa48("115038") ? true : (stryCov_9fa48("115038", "115039", "115040"), (stryMutAct_9fa48("115041") ? candidate.address : (stryCov_9fa48("115041"), candidate?.address)) === preferredAddress)));
      if (stryMutAct_9fa48("115045") ? preferredCandidateIndex > NUM.ZERO : stryMutAct_9fa48("115044") ? preferredCandidateIndex < NUM.ZERO : stryMutAct_9fa48("115043") ? false : stryMutAct_9fa48("115042") ? true : (stryCov_9fa48("115042", "115043", "115044", "115045"), preferredCandidateIndex <= NUM.ZERO)) {
        if (stryMutAct_9fa48("115046")) {
          {}
        } else {
          stryCov_9fa48("115046");
          if (stryMutAct_9fa48("115049") ? preferredCandidateIndex !== NUM.ZERO : stryMutAct_9fa48("115048") ? false : stryMutAct_9fa48("115047") ? true : (stryCov_9fa48("115047", "115048", "115049"), preferredCandidateIndex === NUM.ZERO)) {
            if (stryMutAct_9fa48("115050")) {
              {}
            } else {
              stryCov_9fa48("115050");
              return candidates;
            }
          }
          const preferredService = Array.isArray(stryMutAct_9fa48("115051") ? routingSnapshot.routableServices : (stryCov_9fa48("115051"), routingSnapshot?.routableServices)) ? routingSnapshot.routableServices.find(stryMutAct_9fa48("115052") ? () => undefined : (stryCov_9fa48("115052"), service => stryMutAct_9fa48("115055") ? service?.address !== preferredAddress : stryMutAct_9fa48("115054") ? false : stryMutAct_9fa48("115053") ? true : (stryCov_9fa48("115053", "115054", "115055"), (stryMutAct_9fa48("115056") ? service.address : (stryCov_9fa48("115056"), service?.address)) === preferredAddress))) : null;
          if (stryMutAct_9fa48("115059") ? !preferredService && this.isTemporarilyUnroutableAddress(partitionId, preferredAddress) : stryMutAct_9fa48("115058") ? false : stryMutAct_9fa48("115057") ? true : (stryCov_9fa48("115057", "115058", "115059"), (stryMutAct_9fa48("115060") ? preferredService : (stryCov_9fa48("115060"), !preferredService)) || this.isTemporarilyUnroutableAddress(partitionId, preferredAddress))) {
            if (stryMutAct_9fa48("115061")) {
              {}
            } else {
              stryCov_9fa48("115061");
              return candidates;
            }
          }
          return stryMutAct_9fa48("115062") ? [] : (stryCov_9fa48("115062"), [stryMutAct_9fa48("115063") ? {} : (stryCov_9fa48("115063"), {
            address: preferredAddress,
            nodeId: stryMutAct_9fa48("115066") ? (preferredService.node_id || preferredService.nodeId) && null : stryMutAct_9fa48("115065") ? false : stryMutAct_9fa48("115064") ? true : (stryCov_9fa48("115064", "115065", "115066"), (stryMutAct_9fa48("115068") ? preferredService.node_id && preferredService.nodeId : stryMutAct_9fa48("115067") ? false : (stryCov_9fa48("115067", "115068"), preferredService.node_id || preferredService.nodeId)) || null),
            replicaId: stryMutAct_9fa48("115071") ? (preferredService.service_id || preferredService.replica_id || preferredService.replicaId) && null : stryMutAct_9fa48("115070") ? false : stryMutAct_9fa48("115069") ? true : (stryCov_9fa48("115069", "115070", "115071"), (stryMutAct_9fa48("115073") ? (preferredService.service_id || preferredService.replica_id) && preferredService.replicaId : stryMutAct_9fa48("115072") ? false : (stryCov_9fa48("115072", "115073"), (stryMutAct_9fa48("115075") ? preferredService.service_id && preferredService.replica_id : stryMutAct_9fa48("115074") ? false : (stryCov_9fa48("115074", "115075"), preferredService.service_id || preferredService.replica_id)) || preferredService.replicaId)) || null)
          }), ...candidates]);
        }
      }
      return stryMutAct_9fa48("115076") ? [] : (stryCov_9fa48("115076"), [candidates[preferredCandidateIndex], ...(stryMutAct_9fa48("115077") ? candidates : (stryCov_9fa48("115077"), candidates.slice(NUM.ZERO, preferredCandidateIndex))), ...(stryMutAct_9fa48("115078") ? candidates : (stryCov_9fa48("115078"), candidates.slice(stryMutAct_9fa48("115079") ? preferredCandidateIndex - NUM.ONE : (stryCov_9fa48("115079"), preferredCandidateIndex + NUM.ONE))))]);
    }
  }

  /**
   * Set optional routing metadata overlay.
   * Overlay entries are used when local cache is stale or incomplete.
   * @param {Object|null} overlay - Overlay provider.
   */
  setRoutingMetadataOverlay(overlay) {
    if (stryMutAct_9fa48("115080")) {
      {}
    } else {
      stryCov_9fa48("115080");
      this.routingMetadataOverlay = stryMutAct_9fa48("115083") ? overlay && null : stryMutAct_9fa48("115082") ? false : stryMutAct_9fa48("115081") ? true : (stryCov_9fa48("115081", "115082", "115083"), overlay || null);
    }
  }

  /**
   * Set optional bootstrap topology owner used for bootstrap-era active-node
   * and leader identity answers.
   * @param {Object|null} owner
   */
  setBootstrapTopologySnapshotOwner(owner) {
    if (stryMutAct_9fa48("115084")) {
      {}
    } else {
      stryCov_9fa48("115084");
      this.bootstrapTopologySnapshotOwner = stryMutAct_9fa48("115087") ? owner && null : stryMutAct_9fa48("115086") ? false : stryMutAct_9fa48("115085") ? true : (stryCov_9fa48("115085", "115086", "115087"), owner || null);
    }
  }

  /**
   * Set canonical readiness owner used for serve-routing decisions.
   * @param {Object|null} readinessService
   */
  setControlPlaneReadinessService(readinessService) {
    if (stryMutAct_9fa48("115088")) {
      {}
    } else {
      stryCov_9fa48("115088");
      this.controlPlaneReadinessService = stryMutAct_9fa48("115091") ? readinessService && null : stryMutAct_9fa48("115090") ? false : stryMutAct_9fa48("115089") ? true : (stryCov_9fa48("115089", "115090", "115091"), readinessService || null);
    }
  }

  /**
   * Set the default readiness dimension for routed partition work.
   * @param {string} readinessDimension
   */
  setDefaultRoutingReadinessDimension(readinessDimension) {
    if (stryMutAct_9fa48("115092")) {
      {}
    } else {
      stryCov_9fa48("115092");
      this.defaultRoutingReadinessDimension = stryMutAct_9fa48("115095") ? readinessDimension && CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE : stryMutAct_9fa48("115094") ? false : stryMutAct_9fa48("115093") ? true : (stryCov_9fa48("115093", "115094", "115095"), readinessDimension || CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE);
    }
  }

  /**
   * Execute a SELECT query across partitions in parallel.
   * Supports cross-partition queries including JOINs and aggregates.
   * Requirements: 22.1, 22.2, 22.3, 22.4, 22.5, 22.6, 22.7
   * @param {Object} ast - Parsed SELECT AST.
   * @param {Array} partitionIds - Partition IDs to query.
   * @param {Array} params - Query parameters.
   * @param {Object} options - Execution options.
   * @return {Promise<Object>} Query result.
   */
  async executeSelect(ast, partitionIds, params = stryMutAct_9fa48("115096") ? ["Stryker was here"] : (stryCov_9fa48("115096"), []), options = {}) {
    if (stryMutAct_9fa48("115097")) {
      {}
    } else {
      stryCov_9fa48("115097");
      if (stryMutAct_9fa48("115100") ? partitionIds.length !== NUM.ZERO : stryMutAct_9fa48("115099") ? false : stryMutAct_9fa48("115098") ? true : (stryCov_9fa48("115098", "115099", "115100"), partitionIds.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("115101")) {
          {}
        } else {
          stryCov_9fa48("115101");
          return stryMutAct_9fa48("115102") ? {} : (stryCov_9fa48("115102"), {
            success: stryMutAct_9fa48("115103") ? false : (stryCov_9fa48("115103"), true),
            rows: stryMutAct_9fa48("115104") ? ["Stryker was here"] : (stryCov_9fa48("115104"), []),
            count: NUM.ZERO,
            partitions: stryMutAct_9fa48("115105") ? ["Stryker was here"] : (stryCov_9fa48("115105"), [])
          });
        }
      }

      // Get consistent snapshot timestamp
      const queryTimestamp = this.hlcClock.now();
      this.logger.debug(QUERY_LOG_MSG.EXECUTING_DISTRIBUTED_SELECT, stryMutAct_9fa48("115106") ? {} : (stryCov_9fa48("115106"), {
        partitionCount: partitionIds.length,
        timestamp: queryTimestamp.toString(),
        hasJoins: stryMutAct_9fa48("115109") ? ast.joins && ast.joins.length > NUM.ZERO && false : stryMutAct_9fa48("115108") ? false : stryMutAct_9fa48("115107") ? true : (stryCov_9fa48("115107", "115108", "115109"), (stryMutAct_9fa48("115111") ? ast.joins || ast.joins.length > NUM.ZERO : stryMutAct_9fa48("115110") ? false : (stryCov_9fa48("115110", "115111"), ast.joins && (stryMutAct_9fa48("115114") ? ast.joins.length <= NUM.ZERO : stryMutAct_9fa48("115113") ? ast.joins.length >= NUM.ZERO : stryMutAct_9fa48("115112") ? true : (stryCov_9fa48("115112", "115113", "115114"), ast.joins.length > NUM.ZERO)))) || (stryMutAct_9fa48("115115") ? true : (stryCov_9fa48("115115"), false))),
        hasAggregates: this.hasAggregates(ast)
      }));

      // Check if this is a cross-partition JOIN query
      if (stryMutAct_9fa48("115118") ? ast.joins || ast.joins.length > NUM.ZERO : stryMutAct_9fa48("115117") ? false : stryMutAct_9fa48("115116") ? true : (stryCov_9fa48("115116", "115117", "115118"), ast.joins && (stryMutAct_9fa48("115121") ? ast.joins.length <= NUM.ZERO : stryMutAct_9fa48("115120") ? ast.joins.length >= NUM.ZERO : stryMutAct_9fa48("115119") ? true : (stryCov_9fa48("115119", "115120", "115121"), ast.joins.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("115122")) {
          {}
        } else {
          stryCov_9fa48("115122");
          const joinPartitions = this.resolveJoinPartitions(ast, options);
          if (stryMutAct_9fa48("115126") ? joinPartitions.size <= NUM.ZERO : stryMutAct_9fa48("115125") ? joinPartitions.size >= NUM.ZERO : stryMutAct_9fa48("115124") ? false : stryMutAct_9fa48("115123") ? true : (stryCov_9fa48("115123", "115124", "115125", "115126"), joinPartitions.size > NUM.ZERO)) {
            if (stryMutAct_9fa48("115127")) {
              {}
            } else {
              stryCov_9fa48("115127");
              return this.executeCrossPartitionJoin(ast, partitionIds, params, stryMutAct_9fa48("115128") ? {} : (stryCov_9fa48("115128"), {
                ...options,
                joinPartitions
              }), queryTimestamp);
            }
          }
          return stryMutAct_9fa48("115129") ? {} : (stryCov_9fa48("115129"), {
            success: stryMutAct_9fa48("115130") ? true : (stryCov_9fa48("115130"), false),
            errorCode: QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
            error: QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE,
            failedPartitions: stryMutAct_9fa48("115131") ? ["Stryker was here"] : (stryCov_9fa48("115131"), []),
            partitionErrors: stryMutAct_9fa48("115132") ? [] : (stryCov_9fa48("115132"), [stryMutAct_9fa48("115133") ? {} : (stryCov_9fa48("115133"), {
              partitionId: null,
              error: QUERY_ERROR_MSG.MISSING_JOIN_PLAN
            })]),
            partitions: partitionIds
          });
        }
      }

      // Build SQL from AST
      const sql = this.buildSelectSQL(ast);

      // Execute on all partitions in parallel (read operations can go to any replica)
      const results = await this.executeOnPartitions(partitionIds, sql, params, queryTimestamp, stryMutAct_9fa48("115134") ? false : (stryCov_9fa48("115134"), true), // forRead = true for SELECT
      stryMutAct_9fa48("115137") ?
      // forRead = true for SELECT
      options.preferLeader && false : stryMutAct_9fa48("115136") ? false : stryMutAct_9fa48("115135") ? true : (stryCov_9fa48("115135", "115136", "115137"), options.preferLeader || (stryMutAct_9fa48("115138") ? true : (stryCov_9fa48("115138"), false))), stryMutAct_9fa48("115141") ? options.preferSameLatencyGroup !== true : stryMutAct_9fa48("115140") ? false : stryMutAct_9fa48("115139") ? true : (stryCov_9fa48("115139", "115140", "115141"), options.preferSameLatencyGroup === (stryMutAct_9fa48("115142") ? false : (stryCov_9fa48("115142"), true))), stryMutAct_9fa48("115143") ? {} : (stryCov_9fa48("115143"), {
        deliveryPriority: options.deliveryPriority,
        timeoutMs: options.timeoutMs,
        cancellationToken: stryMutAct_9fa48("115146") ? options.cancellationToken && null : stryMutAct_9fa48("115145") ? false : stryMutAct_9fa48("115144") ? true : (stryCov_9fa48("115144", "115145", "115146"), options.cancellationToken || null),
        tableName: ast.table
      }));
      const fanoutMetrics = this.getLastCoordinatorMetrics();
      const failedPartitions = stryMutAct_9fa48("115147") ? results.map(result => result.partitionId) : (stryCov_9fa48("115147"), results.filter(stryMutAct_9fa48("115148") ? () => undefined : (stryCov_9fa48("115148"), result => stryMutAct_9fa48("115149") ? result.success : (stryCov_9fa48("115149"), !result.success))).map(stryMutAct_9fa48("115150") ? () => undefined : (stryCov_9fa48("115150"), result => result.partitionId)));
      if (stryMutAct_9fa48("115154") ? failedPartitions.length <= NUM.ZERO : stryMutAct_9fa48("115153") ? failedPartitions.length >= NUM.ZERO : stryMutAct_9fa48("115152") ? false : stryMutAct_9fa48("115151") ? true : (stryCov_9fa48("115151", "115152", "115153", "115154"), failedPartitions.length > NUM.ZERO)) {
        if (stryMutAct_9fa48("115155")) {
          {}
        } else {
          stryCov_9fa48("115155");
          const failureSummary = buildDistributedFailureSummary(stryMutAct_9fa48("115156") ? results : (stryCov_9fa48("115156"), results.filter(stryMutAct_9fa48("115157") ? () => undefined : (stryCov_9fa48("115157"), result => stryMutAct_9fa48("115158") ? result.success : (stryCov_9fa48("115158"), !result.success)))));
          return stryMutAct_9fa48("115159") ? {} : (stryCov_9fa48("115159"), {
            success: stryMutAct_9fa48("115160") ? true : (stryCov_9fa48("115160"), false),
            errorCode: QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
            error: QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE,
            ...failureSummary,
            partitions: partitionIds,
            distributedMetrics: stryMutAct_9fa48("115161") ? {} : (stryCov_9fa48("115161"), {
              fanout: fanoutMetrics,
              mergeDurationMs: NUM.ZERO,
              failedPartitionCount: failedPartitions.length
            })
          });
        }
      }

      // Aggregate results
      const mergeStartTimeMs = Date.now();
      const aggregated = this.mergeEngine.mergePartitionResults(results, ast, this);
      const mergeDurationMs = stryMutAct_9fa48("115162") ? Date.now() + mergeStartTimeMs : (stryCov_9fa48("115162"), Date.now() - mergeStartTimeMs);
      try {
        if (stryMutAct_9fa48("115163")) {
          {}
        } else {
          stryCov_9fa48("115163");
          this.logger.info(METRICS_LOG_TAG.SELECT_DISTRIBUTED, stryMutAct_9fa48("115164") ? {} : (stryCov_9fa48("115164"), {
            partitionCount: partitionIds.length,
            fanoutTotalLatencyMs: stryMutAct_9fa48("115165") ? fanoutMetrics.totalLatencyMs : (stryCov_9fa48("115165"), fanoutMetrics?.totalLatencyMs),
            fanoutMedianLatencyMs: stryMutAct_9fa48("115166") ? fanoutMetrics.medianLatencyMs : (stryCov_9fa48("115166"), fanoutMetrics?.medianLatencyMs),
            mergeDurationMs,
            totalRows: aggregated.rows.length,
            stragglerCount: stryMutAct_9fa48("115167") ? fanoutMetrics?.stragglers?.length && NUM.ZERO : (stryCov_9fa48("115167"), (stryMutAct_9fa48("115169") ? fanoutMetrics.stragglers?.length : stryMutAct_9fa48("115168") ? fanoutMetrics?.stragglers.length : (stryCov_9fa48("115168", "115169"), fanoutMetrics?.stragglers?.length)) ?? NUM.ZERO),
            speculativeExecutions: stryMutAct_9fa48("115170") ? fanoutMetrics?.speculativeExecutions && NUM.ZERO : (stryCov_9fa48("115170"), (stryMutAct_9fa48("115171") ? fanoutMetrics.speculativeExecutions : (stryCov_9fa48("115171"), fanoutMetrics?.speculativeExecutions)) ?? NUM.ZERO)
          }));
        }
      } catch (_metricsErr) {
        // Metrics logging must not propagate to callers
      }
      return stryMutAct_9fa48("115172") ? {} : (stryCov_9fa48("115172"), {
        success: stryMutAct_9fa48("115173") ? false : (stryCov_9fa48("115173"), true),
        rows: aggregated.rows,
        count: aggregated.rows.length,
        partitions: partitionIds,
        timestamp: queryTimestamp.toString(),
        distributedMetrics: stryMutAct_9fa48("115174") ? {} : (stryCov_9fa48("115174"), {
          fanout: fanoutMetrics,
          mergeDurationMs,
          failedPartitionCount: NUM.ZERO
        })
      });
    }
  }

  /**
   * Resolve JOIN table partition targets from canonical distributed plan.
   * @param {Object} ast - SELECT AST.
   * @param {Object} options - Execution options.
   * @return {Map<string, string[]>} Join table -> partition IDs map.
   * @private
   */
  resolveJoinPartitions(ast, options) {
    if (stryMutAct_9fa48("115175")) {
      {}
    } else {
      stryCov_9fa48("115175");
      const joinPartitions = new Map();
      const distributedPlan = stryMutAct_9fa48("115178") ? options.distributedPlan && null : stryMutAct_9fa48("115177") ? false : stryMutAct_9fa48("115176") ? true : (stryCov_9fa48("115176", "115177", "115178"), options.distributedPlan || null);
      const tablePlans = stryMutAct_9fa48("115181") ? distributedPlan?.tablePlans && null : stryMutAct_9fa48("115180") ? false : stryMutAct_9fa48("115179") ? true : (stryCov_9fa48("115179", "115180", "115181"), (stryMutAct_9fa48("115182") ? distributedPlan.tablePlans : (stryCov_9fa48("115182"), distributedPlan?.tablePlans)) || null);
      if (stryMutAct_9fa48("115185") ? false : stryMutAct_9fa48("115184") ? true : stryMutAct_9fa48("115183") ? tablePlans : (stryCov_9fa48("115183", "115184", "115185"), !tablePlans)) {
        if (stryMutAct_9fa48("115186")) {
          {}
        } else {
          stryCov_9fa48("115186");
          return joinPartitions;
        }
      }
      for (const join of stryMutAct_9fa48("115189") ? ast.joins && [] : stryMutAct_9fa48("115188") ? false : stryMutAct_9fa48("115187") ? true : (stryCov_9fa48("115187", "115188", "115189"), ast.joins || (stryMutAct_9fa48("115190") ? ["Stryker was here"] : (stryCov_9fa48("115190"), [])))) {
        if (stryMutAct_9fa48("115191")) {
          {}
        } else {
          stryCov_9fa48("115191");
          const joinTableName = stryMutAct_9fa48("115192") ? join.table.name : (stryCov_9fa48("115192"), join.table?.name);
          const joinAlias = stryMutAct_9fa48("115195") ? join.table?.alias && joinTableName : stryMutAct_9fa48("115194") ? false : stryMutAct_9fa48("115193") ? true : (stryCov_9fa48("115193", "115194", "115195"), (stryMutAct_9fa48("115196") ? join.table.alias : (stryCov_9fa48("115196"), join.table?.alias)) || joinTableName);
          if (stryMutAct_9fa48("115199") ? false : stryMutAct_9fa48("115198") ? true : stryMutAct_9fa48("115197") ? joinTableName : (stryCov_9fa48("115197", "115198", "115199"), !joinTableName)) {
            if (stryMutAct_9fa48("115200")) {
              {}
            } else {
              stryCov_9fa48("115200");
              continue;
            }
          }
          let partitionIds = stryMutAct_9fa48("115201") ? ["Stryker was here"] : (stryCov_9fa48("115201"), []);
          if (stryMutAct_9fa48("115203") ? false : stryMutAct_9fa48("115202") ? true : (stryCov_9fa48("115202", "115203"), tablePlans)) {
            if (stryMutAct_9fa48("115204")) {
              {}
            } else {
              stryCov_9fa48("115204");
              const planned = tablePlans.get ? stryMutAct_9fa48("115207") ? tablePlans.get(joinAlias) && tablePlans.get(joinTableName) : stryMutAct_9fa48("115206") ? false : stryMutAct_9fa48("115205") ? true : (stryCov_9fa48("115205", "115206", "115207"), tablePlans.get(joinAlias) || tablePlans.get(joinTableName)) : stryMutAct_9fa48("115210") ? tablePlans[joinAlias] && tablePlans[joinTableName] : stryMutAct_9fa48("115209") ? false : stryMutAct_9fa48("115208") ? true : (stryCov_9fa48("115208", "115209", "115210"), tablePlans[joinAlias] || tablePlans[joinTableName]);
              if (stryMutAct_9fa48("115213") ? planned.partitions : stryMutAct_9fa48("115212") ? false : stryMutAct_9fa48("115211") ? true : (stryCov_9fa48("115211", "115212", "115213"), planned?.partitions)) {
                if (stryMutAct_9fa48("115214")) {
                  {}
                } else {
                  stryCov_9fa48("115214");
                  partitionIds = planned.partitions;
                }
              }
            }
          }
          if (stryMutAct_9fa48("115218") ? partitionIds.length <= NUM.ZERO : stryMutAct_9fa48("115217") ? partitionIds.length >= NUM.ZERO : stryMutAct_9fa48("115216") ? false : stryMutAct_9fa48("115215") ? true : (stryCov_9fa48("115215", "115216", "115217", "115218"), partitionIds.length > NUM.ZERO)) {
            if (stryMutAct_9fa48("115219")) {
              {}
            } else {
              stryCov_9fa48("115219");
              joinPartitions.set(joinTableName, partitionIds);
            }
          }
        }
      }
      return joinPartitions;
    }
  }

  /**
   * Execute a cross-partition JOIN query.
   * Requirements: 22.2, 22.3
   * @param {Object} ast - Parsed SELECT AST with JOINs.
   * @param {Array} mainPartitionIds - Partition IDs for main table.
   * @param {Array} params - Query parameters.
   * @param {Object} options - Execution options with distributed plan.
   * @param {Object} queryTimestamp - HLC timestamp for consistent snapshot.
   * @return {Promise<Object>} Query result.
   * @private
   */
  async executeCrossPartitionJoin(ast, mainPartitionIds, params, options, queryTimestamp) {
    if (stryMutAct_9fa48("115220")) {
      {}
    } else {
      stryCov_9fa48("115220");
      const {
        joinPartitions
      } = options;
      const fanoutMetrics = stryMutAct_9fa48("115221") ? ["Stryker was here"] : (stryCov_9fa48("115221"), []);
      this.logger.debug(QUERY_LOG_MSG.EXECUTING_CROSS_PARTITION_JOIN, stryMutAct_9fa48("115222") ? {} : (stryCov_9fa48("115222"), {
        mainTable: ast.from.name,
        mainPartitionCount: mainPartitionIds.length,
        joinCount: ast.joins.length
      }));

      // Strategy: Fetch data from all tables in parallel, then perform JOIN in memory
      // This is a simple hash-join approach suitable for moderate data sizes

      // 1. Fetch main table data from all partitions
      const mainTableSql = this.buildSelectSQLWithoutJoins(ast);
      const mainResults = await this.executeOnPartitions(mainPartitionIds, mainTableSql, params, queryTimestamp, stryMutAct_9fa48("115223") ? false : (stryCov_9fa48("115223"), true), stryMutAct_9fa48("115226") ? options.preferLeader && false : stryMutAct_9fa48("115225") ? false : stryMutAct_9fa48("115224") ? true : (stryCov_9fa48("115224", "115225", "115226"), options.preferLeader || (stryMutAct_9fa48("115227") ? true : (stryCov_9fa48("115227"), false))), stryMutAct_9fa48("115230") ? options.preferSameLatencyGroup !== true : stryMutAct_9fa48("115229") ? false : stryMutAct_9fa48("115228") ? true : (stryCov_9fa48("115228", "115229", "115230"), options.preferSameLatencyGroup === (stryMutAct_9fa48("115231") ? false : (stryCov_9fa48("115231"), true))), stryMutAct_9fa48("115232") ? {} : (stryCov_9fa48("115232"), {
        deliveryPriority: options.deliveryPriority,
        timeoutMs: options.timeoutMs,
        cancellationToken: stryMutAct_9fa48("115235") ? options.cancellationToken && null : stryMutAct_9fa48("115234") ? false : stryMutAct_9fa48("115233") ? true : (stryCov_9fa48("115233", "115234", "115235"), options.cancellationToken || null),
        tableName: ast.from.name
      }));
      fanoutMetrics.push(this.getLastCoordinatorMetrics());
      const mainFailures = stryMutAct_9fa48("115236") ? mainResults : (stryCov_9fa48("115236"), mainResults.filter(stryMutAct_9fa48("115237") ? () => undefined : (stryCov_9fa48("115237"), result => stryMutAct_9fa48("115238") ? result.success : (stryCov_9fa48("115238"), !result.success))));
      if (stryMutAct_9fa48("115242") ? mainFailures.length <= NUM.ZERO : stryMutAct_9fa48("115241") ? mainFailures.length >= NUM.ZERO : stryMutAct_9fa48("115240") ? false : stryMutAct_9fa48("115239") ? true : (stryCov_9fa48("115239", "115240", "115241", "115242"), mainFailures.length > NUM.ZERO)) {
        if (stryMutAct_9fa48("115243")) {
          {}
        } else {
          stryCov_9fa48("115243");
          const failureSummary = buildDistributedFailureSummary(mainFailures);
          return stryMutAct_9fa48("115244") ? {} : (stryCov_9fa48("115244"), {
            success: stryMutAct_9fa48("115245") ? true : (stryCov_9fa48("115245"), false),
            errorCode: QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
            error: QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE,
            ...failureSummary,
            distributedMetrics: stryMutAct_9fa48("115246") ? {} : (stryCov_9fa48("115246"), {
              fanout: fanoutMetrics,
              mergeDurationMs: NUM.ZERO,
              failedPartitionCount: mainFailures.length
            })
          });
        }
      }
      let mainRows = stryMutAct_9fa48("115247") ? ["Stryker was here"] : (stryCov_9fa48("115247"), []);
      for (const result of mainResults) {
        if (stryMutAct_9fa48("115248")) {
          {}
        } else {
          stryCov_9fa48("115248");
          if (stryMutAct_9fa48("115251") ? result.success || result.rows : stryMutAct_9fa48("115250") ? false : stryMutAct_9fa48("115249") ? true : (stryCov_9fa48("115249", "115250", "115251"), result.success && result.rows)) {
            if (stryMutAct_9fa48("115252")) {
              {}
            } else {
              stryCov_9fa48("115252");
              mainRows = mainRows.concat(result.rows);
            }
          }
        }
      }

      // 2. Fetch joined table data from their partitions
      const joinedData = new Map(); // tableName -> rows

      for (const join of ast.joins) {
        if (stryMutAct_9fa48("115253")) {
          {}
        } else {
          stryCov_9fa48("115253");
          const joinTableName = join.table.name;
          const joinTablePartitions = stryMutAct_9fa48("115256") ? joinPartitions.get(joinTableName) && [] : stryMutAct_9fa48("115255") ? false : stryMutAct_9fa48("115254") ? true : (stryCov_9fa48("115254", "115255", "115256"), joinPartitions.get(joinTableName) || (stryMutAct_9fa48("115257") ? ["Stryker was here"] : (stryCov_9fa48("115257"), [])));
          if (stryMutAct_9fa48("115261") ? joinTablePartitions.length <= NUM.ZERO : stryMutAct_9fa48("115260") ? joinTablePartitions.length >= NUM.ZERO : stryMutAct_9fa48("115259") ? false : stryMutAct_9fa48("115258") ? true : (stryCov_9fa48("115258", "115259", "115260", "115261"), joinTablePartitions.length > NUM.ZERO)) {
            if (stryMutAct_9fa48("115262")) {
              {}
            } else {
              stryCov_9fa48("115262");
              const joinSql = stryMutAct_9fa48("115263") ? `` : (stryCov_9fa48("115263"), `${QUERY_SQL.SELECT_ALL_FROM_PREFIX}${joinTableName}`);
              const joinResults = await this.executeOnPartitions(joinTablePartitions, joinSql, stryMutAct_9fa48("115264") ? ["Stryker was here"] : (stryCov_9fa48("115264"), []), queryTimestamp, stryMutAct_9fa48("115265") ? false : (stryCov_9fa48("115265"), true), stryMutAct_9fa48("115268") ? options.preferLeader && false : stryMutAct_9fa48("115267") ? false : stryMutAct_9fa48("115266") ? true : (stryCov_9fa48("115266", "115267", "115268"), options.preferLeader || (stryMutAct_9fa48("115269") ? true : (stryCov_9fa48("115269"), false))), stryMutAct_9fa48("115272") ? options.preferSameLatencyGroup !== true : stryMutAct_9fa48("115271") ? false : stryMutAct_9fa48("115270") ? true : (stryCov_9fa48("115270", "115271", "115272"), options.preferSameLatencyGroup === (stryMutAct_9fa48("115273") ? false : (stryCov_9fa48("115273"), true))), stryMutAct_9fa48("115274") ? {} : (stryCov_9fa48("115274"), {
                deliveryPriority: options.deliveryPriority,
                timeoutMs: options.timeoutMs,
                cancellationToken: stryMutAct_9fa48("115277") ? options.cancellationToken && null : stryMutAct_9fa48("115276") ? false : stryMutAct_9fa48("115275") ? true : (stryCov_9fa48("115275", "115276", "115277"), options.cancellationToken || null),
                tableName: joinTableName
              }));
              fanoutMetrics.push(this.getLastCoordinatorMetrics());
              const joinFailures = stryMutAct_9fa48("115278") ? joinResults : (stryCov_9fa48("115278"), joinResults.filter(stryMutAct_9fa48("115279") ? () => undefined : (stryCov_9fa48("115279"), result => stryMutAct_9fa48("115280") ? result.success : (stryCov_9fa48("115280"), !result.success))));
              if (stryMutAct_9fa48("115284") ? joinFailures.length <= NUM.ZERO : stryMutAct_9fa48("115283") ? joinFailures.length >= NUM.ZERO : stryMutAct_9fa48("115282") ? false : stryMutAct_9fa48("115281") ? true : (stryCov_9fa48("115281", "115282", "115283", "115284"), joinFailures.length > NUM.ZERO)) {
                if (stryMutAct_9fa48("115285")) {
                  {}
                } else {
                  stryCov_9fa48("115285");
                  const failureSummary = buildDistributedFailureSummary(joinFailures);
                  return stryMutAct_9fa48("115286") ? {} : (stryCov_9fa48("115286"), {
                    success: stryMutAct_9fa48("115287") ? true : (stryCov_9fa48("115287"), false),
                    errorCode: QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
                    error: QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE,
                    ...failureSummary,
                    distributedMetrics: stryMutAct_9fa48("115288") ? {} : (stryCov_9fa48("115288"), {
                      fanout: fanoutMetrics,
                      mergeDurationMs: NUM.ZERO,
                      failedPartitionCount: joinFailures.length
                    })
                  });
                }
              }
              let joinRows = stryMutAct_9fa48("115289") ? ["Stryker was here"] : (stryCov_9fa48("115289"), []);
              for (const result of joinResults) {
                if (stryMutAct_9fa48("115290")) {
                  {}
                } else {
                  stryCov_9fa48("115290");
                  if (stryMutAct_9fa48("115293") ? result.success || result.rows : stryMutAct_9fa48("115292") ? false : stryMutAct_9fa48("115291") ? true : (stryCov_9fa48("115291", "115292", "115293"), result.success && result.rows)) {
                    if (stryMutAct_9fa48("115294")) {
                      {}
                    } else {
                      stryCov_9fa48("115294");
                      joinRows = joinRows.concat(result.rows);
                    }
                  }
                }
              }
              joinedData.set(joinTableName, joinRows);
            }
          }
        }
      }

      // 3. Perform in-memory JOIN
      let resultRows = mainRows;
      let leftTableRef = stryMutAct_9fa48("115297") ? ast.from.alias && ast.from.name : stryMutAct_9fa48("115296") ? false : stryMutAct_9fa48("115295") ? true : (stryCov_9fa48("115295", "115296", "115297"), ast.from.alias || ast.from.name);
      for (const join of ast.joins) {
        if (stryMutAct_9fa48("115298")) {
          {}
        } else {
          stryCov_9fa48("115298");
          const joinTableName = join.table.name;
          const rightTableRef = stryMutAct_9fa48("115301") ? join.table.alias && join.table.name : stryMutAct_9fa48("115300") ? false : stryMutAct_9fa48("115299") ? true : (stryCov_9fa48("115299", "115300", "115301"), join.table.alias || join.table.name);
          const joinRows = stryMutAct_9fa48("115304") ? joinedData.get(joinTableName) && [] : stryMutAct_9fa48("115303") ? false : stryMutAct_9fa48("115302") ? true : (stryCov_9fa48("115302", "115303", "115304"), joinedData.get(joinTableName) || (stryMutAct_9fa48("115305") ? ["Stryker was here"] : (stryCov_9fa48("115305"), [])));
          const strategy = this.resolveJoinStrategy(join, leftTableRef, options.distributedPlan);
          resultRows = this.executeJoinByStrategy(resultRows, joinRows, join, leftTableRef, rightTableRef, strategy);
          leftTableRef = rightTableRef;
        }
      }

      // 4. Apply remaining clauses (WHERE on joined data, GROUP BY, etc.)
      const mergeStartTimeMs = Date.now();
      const aggregated = this.mergeEngine.mergePartitionResults(stryMutAct_9fa48("115306") ? [] : (stryCov_9fa48("115306"), [stryMutAct_9fa48("115307") ? {} : (stryCov_9fa48("115307"), {
        success: stryMutAct_9fa48("115308") ? false : (stryCov_9fa48("115308"), true),
        rows: resultRows
      })]), ast, this);
      const mergeDurationMs = stryMutAct_9fa48("115309") ? Date.now() + mergeStartTimeMs : (stryCov_9fa48("115309"), Date.now() - mergeStartTimeMs);
      const allPartitions = stryMutAct_9fa48("115310") ? [] : (stryCov_9fa48("115310"), [...mainPartitionIds]);
      for (const partitions of joinPartitions.values()) {
        if (stryMutAct_9fa48("115311")) {
          {}
        } else {
          stryCov_9fa48("115311");
          allPartitions.push(...partitions);
        }
      }
      return stryMutAct_9fa48("115312") ? {} : (stryCov_9fa48("115312"), {
        success: stryMutAct_9fa48("115313") ? false : (stryCov_9fa48("115313"), true),
        rows: aggregated.rows,
        count: aggregated.rows.length,
        partitions: stryMutAct_9fa48("115314") ? [] : (stryCov_9fa48("115314"), [...new Set(allPartitions)]),
        timestamp: queryTimestamp.toString(),
        distributedMetrics: stryMutAct_9fa48("115315") ? {} : (stryCov_9fa48("115315"), {
          fanout: fanoutMetrics,
          mergeDurationMs,
          failedPartitionCount: NUM.ZERO
        })
      });
    }
  }

  /**
   * Perform an in-memory JOIN between two result sets.
   * @param {Array} leftRows - Left table rows.
   * @param {Array} rightRows - Right table rows.
   * @param {Object} join - JOIN clause AST.
   * @param {string} leftTableName - Left table name.
   * @param {string} rightTableName - Right table name.
   * @return {Array} Joined rows.
   * @private
   */
  performJoin(leftRows, rightRows, join, leftTableName, rightTableName) {
    if (stryMutAct_9fa48("115316")) {
      {}
    } else {
      stryCov_9fa48("115316");
      const joinType = stryMutAct_9fa48("115317") ? (join.joinType || QUERY_JOIN_TYPE.INNER).toLowerCase() : (stryCov_9fa48("115317"), (stryMutAct_9fa48("115320") ? join.joinType && QUERY_JOIN_TYPE.INNER : stryMutAct_9fa48("115319") ? false : stryMutAct_9fa48("115318") ? true : (stryCov_9fa48("115318", "115319", "115320"), join.joinType || QUERY_JOIN_TYPE.INNER)).toUpperCase());
      const condition = join.condition;

      // Extract join columns from condition
      const {
        leftColumn,
        rightColumn
      } = this.extractJoinColumns(condition, leftTableName, rightTableName);
      if (stryMutAct_9fa48("115323") ? !leftColumn && !rightColumn : stryMutAct_9fa48("115322") ? false : stryMutAct_9fa48("115321") ? true : (stryCov_9fa48("115321", "115322", "115323"), (stryMutAct_9fa48("115324") ? leftColumn : (stryCov_9fa48("115324"), !leftColumn)) || (stryMutAct_9fa48("115325") ? rightColumn : (stryCov_9fa48("115325"), !rightColumn)))) {
        if (stryMutAct_9fa48("115326")) {
          {}
        } else {
          stryCov_9fa48("115326");
          // Can't optimize, do nested loop join
          return this.nestedLoopJoin(leftRows, rightRows, condition, joinType, leftTableName, rightTableName);
        }
      }

      // Build hash index on right table for efficient join
      const rightIndex = new Map();
      for (const row of rightRows) {
        if (stryMutAct_9fa48("115327")) {
          {}
        } else {
          stryCov_9fa48("115327");
          const key = row[rightColumn];
          if (stryMutAct_9fa48("115330") ? false : stryMutAct_9fa48("115329") ? true : stryMutAct_9fa48("115328") ? rightIndex.has(key) : (stryCov_9fa48("115328", "115329", "115330"), !rightIndex.has(key))) {
            if (stryMutAct_9fa48("115331")) {
              {}
            } else {
              stryCov_9fa48("115331");
              rightIndex.set(key, stryMutAct_9fa48("115332") ? ["Stryker was here"] : (stryCov_9fa48("115332"), []));
            }
          }
          rightIndex.get(key).push(row);
        }
      }
      const result = stryMutAct_9fa48("115333") ? ["Stryker was here"] : (stryCov_9fa48("115333"), []);
      const matchedRight = new Set();
      for (const leftRow of leftRows) {
        if (stryMutAct_9fa48("115334")) {
          {}
        } else {
          stryCov_9fa48("115334");
          const key = leftRow[leftColumn];
          const matches = stryMutAct_9fa48("115337") ? rightIndex.get(key) && [] : stryMutAct_9fa48("115336") ? false : stryMutAct_9fa48("115335") ? true : (stryCov_9fa48("115335", "115336", "115337"), rightIndex.get(key) || (stryMutAct_9fa48("115338") ? ["Stryker was here"] : (stryCov_9fa48("115338"), [])));
          if (stryMutAct_9fa48("115342") ? matches.length <= NUM.ZERO : stryMutAct_9fa48("115341") ? matches.length >= NUM.ZERO : stryMutAct_9fa48("115340") ? false : stryMutAct_9fa48("115339") ? true : (stryCov_9fa48("115339", "115340", "115341", "115342"), matches.length > NUM.ZERO)) {
            if (stryMutAct_9fa48("115343")) {
              {}
            } else {
              stryCov_9fa48("115343");
              for (const rightRow of matches) {
                if (stryMutAct_9fa48("115344")) {
                  {}
                } else {
                  stryCov_9fa48("115344");
                  result.push(this.combineJoinRows(leftRow, rightRow, leftTableName, rightTableName));
                  matchedRight.add(rightRow);
                }
              }
            }
          } else if (stryMutAct_9fa48("115347") ? joinType === QUERY_JOIN_TYPE.LEFT && joinType === QUERY_JOIN_TYPE.LEFT_OUTER : stryMutAct_9fa48("115346") ? false : stryMutAct_9fa48("115345") ? true : (stryCov_9fa48("115345", "115346", "115347"), (stryMutAct_9fa48("115349") ? joinType !== QUERY_JOIN_TYPE.LEFT : stryMutAct_9fa48("115348") ? false : (stryCov_9fa48("115348", "115349"), joinType === QUERY_JOIN_TYPE.LEFT)) || (stryMutAct_9fa48("115351") ? joinType !== QUERY_JOIN_TYPE.LEFT_OUTER : stryMutAct_9fa48("115350") ? false : (stryCov_9fa48("115350", "115351"), joinType === QUERY_JOIN_TYPE.LEFT_OUTER)))) {
            if (stryMutAct_9fa48("115352")) {
              {}
            } else {
              stryCov_9fa48("115352");
              // Include left row with nulls for right columns
              const nullRight = {};
              if (stryMutAct_9fa48("115356") ? rightRows.length <= NUM.ZERO : stryMutAct_9fa48("115355") ? rightRows.length >= NUM.ZERO : stryMutAct_9fa48("115354") ? false : stryMutAct_9fa48("115353") ? true : (stryCov_9fa48("115353", "115354", "115355", "115356"), rightRows.length > NUM.ZERO)) {
                if (stryMutAct_9fa48("115357")) {
                  {}
                } else {
                  stryCov_9fa48("115357");
                  for (const col of Object.keys(rightRows[NUM.ZERO])) {
                    if (stryMutAct_9fa48("115358")) {
                      {}
                    } else {
                      stryCov_9fa48("115358");
                      nullRight[col] = null;
                    }
                  }
                }
              }
              result.push(this.combineJoinRows(leftRow, nullRight, leftTableName, rightTableName));
            }
          }
        }
      }

      // Handle RIGHT JOIN
      if (stryMutAct_9fa48("115361") ? joinType === QUERY_JOIN_TYPE.RIGHT && joinType === QUERY_JOIN_TYPE.RIGHT_OUTER : stryMutAct_9fa48("115360") ? false : stryMutAct_9fa48("115359") ? true : (stryCov_9fa48("115359", "115360", "115361"), (stryMutAct_9fa48("115363") ? joinType !== QUERY_JOIN_TYPE.RIGHT : stryMutAct_9fa48("115362") ? false : (stryCov_9fa48("115362", "115363"), joinType === QUERY_JOIN_TYPE.RIGHT)) || (stryMutAct_9fa48("115365") ? joinType !== QUERY_JOIN_TYPE.RIGHT_OUTER : stryMutAct_9fa48("115364") ? false : (stryCov_9fa48("115364", "115365"), joinType === QUERY_JOIN_TYPE.RIGHT_OUTER)))) {
        if (stryMutAct_9fa48("115366")) {
          {}
        } else {
          stryCov_9fa48("115366");
          for (const rightRow of rightRows) {
            if (stryMutAct_9fa48("115367")) {
              {}
            } else {
              stryCov_9fa48("115367");
              if (stryMutAct_9fa48("115370") ? false : stryMutAct_9fa48("115369") ? true : stryMutAct_9fa48("115368") ? matchedRight.has(rightRow) : (stryCov_9fa48("115368", "115369", "115370"), !matchedRight.has(rightRow))) {
                if (stryMutAct_9fa48("115371")) {
                  {}
                } else {
                  stryCov_9fa48("115371");
                  const nullLeft = {};
                  if (stryMutAct_9fa48("115375") ? leftRows.length <= NUM.ZERO : stryMutAct_9fa48("115374") ? leftRows.length >= NUM.ZERO : stryMutAct_9fa48("115373") ? false : stryMutAct_9fa48("115372") ? true : (stryCov_9fa48("115372", "115373", "115374", "115375"), leftRows.length > NUM.ZERO)) {
                    if (stryMutAct_9fa48("115376")) {
                      {}
                    } else {
                      stryCov_9fa48("115376");
                      for (const col of Object.keys(leftRows[NUM.ZERO])) {
                        if (stryMutAct_9fa48("115377")) {
                          {}
                        } else {
                          stryCov_9fa48("115377");
                          nullLeft[col] = null;
                        }
                      }
                    }
                  }
                  result.push(this.combineJoinRows(nullLeft, rightRow, leftTableName, rightTableName));
                }
              }
            }
          }
        }
      }
      return result;
    }
  }

  /**
   * Extract join columns from a join condition.
   * @param {Object} condition - JOIN condition AST.
   * @param {string} leftTable - Left table name.
   * @param {string} rightTable - Right table name.
   * @return {Object} {leftColumn, rightColumn} or nulls if not extractable.
   * @private
   */
  extractJoinColumns(condition, leftTable, rightTable) {
    if (stryMutAct_9fa48("115378")) {
      {}
    } else {
      stryCov_9fa48("115378");
      if (stryMutAct_9fa48("115381") ? (!condition || condition.type !== QUERY_AST_NODE.BINARY) && condition.operator !== QUERY_OPERATOR.EQUALS : stryMutAct_9fa48("115380") ? false : stryMutAct_9fa48("115379") ? true : (stryCov_9fa48("115379", "115380", "115381"), (stryMutAct_9fa48("115383") ? !condition && condition.type !== QUERY_AST_NODE.BINARY : stryMutAct_9fa48("115382") ? false : (stryCov_9fa48("115382", "115383"), (stryMutAct_9fa48("115384") ? condition : (stryCov_9fa48("115384"), !condition)) || (stryMutAct_9fa48("115386") ? condition.type === QUERY_AST_NODE.BINARY : stryMutAct_9fa48("115385") ? false : (stryCov_9fa48("115385", "115386"), condition.type !== QUERY_AST_NODE.BINARY)))) || (stryMutAct_9fa48("115388") ? condition.operator === QUERY_OPERATOR.EQUALS : stryMutAct_9fa48("115387") ? false : (stryCov_9fa48("115387", "115388"), condition.operator !== QUERY_OPERATOR.EQUALS)))) {
        if (stryMutAct_9fa48("115389")) {
          {}
        } else {
          stryCov_9fa48("115389");
          return stryMutAct_9fa48("115390") ? {} : (stryCov_9fa48("115390"), {
            leftColumn: null,
            rightColumn: null
          });
        }
      }
      const left = condition.left;
      const right = condition.right;
      if (stryMutAct_9fa48("115393") ? left.type !== QUERY_AST_NODE.COLUMN_REF && right.type !== QUERY_AST_NODE.COLUMN_REF : stryMutAct_9fa48("115392") ? false : stryMutAct_9fa48("115391") ? true : (stryCov_9fa48("115391", "115392", "115393"), (stryMutAct_9fa48("115395") ? left.type === QUERY_AST_NODE.COLUMN_REF : stryMutAct_9fa48("115394") ? false : (stryCov_9fa48("115394", "115395"), left.type !== QUERY_AST_NODE.COLUMN_REF)) || (stryMutAct_9fa48("115397") ? right.type === QUERY_AST_NODE.COLUMN_REF : stryMutAct_9fa48("115396") ? false : (stryCov_9fa48("115396", "115397"), right.type !== QUERY_AST_NODE.COLUMN_REF)))) {
        if (stryMutAct_9fa48("115398")) {
          {}
        } else {
          stryCov_9fa48("115398");
          return stryMutAct_9fa48("115399") ? {} : (stryCov_9fa48("115399"), {
            leftColumn: null,
            rightColumn: null
          });
        }
      }

      // Determine which column belongs to which table
      let leftColumn = null;
      let rightColumn = null;
      if (stryMutAct_9fa48("115402") ? left.table === leftTable && !left.table : stryMutAct_9fa48("115401") ? false : stryMutAct_9fa48("115400") ? true : (stryCov_9fa48("115400", "115401", "115402"), (stryMutAct_9fa48("115404") ? left.table !== leftTable : stryMutAct_9fa48("115403") ? false : (stryCov_9fa48("115403", "115404"), left.table === leftTable)) || (stryMutAct_9fa48("115405") ? left.table : (stryCov_9fa48("115405"), !left.table)))) {
        if (stryMutAct_9fa48("115406")) {
          {}
        } else {
          stryCov_9fa48("115406");
          leftColumn = left.column;
        }
      }
      if (stryMutAct_9fa48("115409") ? right.table === leftTable && !right.table : stryMutAct_9fa48("115408") ? false : stryMutAct_9fa48("115407") ? true : (stryCov_9fa48("115407", "115408", "115409"), (stryMutAct_9fa48("115411") ? right.table !== leftTable : stryMutAct_9fa48("115410") ? false : (stryCov_9fa48("115410", "115411"), right.table === leftTable)) || (stryMutAct_9fa48("115412") ? right.table : (stryCov_9fa48("115412"), !right.table)))) {
        if (stryMutAct_9fa48("115413")) {
          {}
        } else {
          stryCov_9fa48("115413");
          leftColumn = stryMutAct_9fa48("115416") ? leftColumn && right.column : stryMutAct_9fa48("115415") ? false : stryMutAct_9fa48("115414") ? true : (stryCov_9fa48("115414", "115415", "115416"), leftColumn || right.column);
        }
      }
      if (stryMutAct_9fa48("115419") ? left.table !== rightTable : stryMutAct_9fa48("115418") ? false : stryMutAct_9fa48("115417") ? true : (stryCov_9fa48("115417", "115418", "115419"), left.table === rightTable)) {
        if (stryMutAct_9fa48("115420")) {
          {}
        } else {
          stryCov_9fa48("115420");
          rightColumn = left.column;
        }
      }
      if (stryMutAct_9fa48("115423") ? right.table !== rightTable : stryMutAct_9fa48("115422") ? false : stryMutAct_9fa48("115421") ? true : (stryCov_9fa48("115421", "115422", "115423"), right.table === rightTable)) {
        if (stryMutAct_9fa48("115424")) {
          {}
        } else {
          stryCov_9fa48("115424");
          rightColumn = stryMutAct_9fa48("115427") ? rightColumn && right.column : stryMutAct_9fa48("115426") ? false : stryMutAct_9fa48("115425") ? true : (stryCov_9fa48("115425", "115426", "115427"), rightColumn || right.column);
        }
      }

      // If tables not specified, assume left.column is from left table
      if (stryMutAct_9fa48("115430") ? !leftColumn || !rightColumn : stryMutAct_9fa48("115429") ? false : stryMutAct_9fa48("115428") ? true : (stryCov_9fa48("115428", "115429", "115430"), (stryMutAct_9fa48("115431") ? leftColumn : (stryCov_9fa48("115431"), !leftColumn)) && (stryMutAct_9fa48("115432") ? rightColumn : (stryCov_9fa48("115432"), !rightColumn)))) {
        if (stryMutAct_9fa48("115433")) {
          {}
        } else {
          stryCov_9fa48("115433");
          leftColumn = left.column;
          rightColumn = right.column;
        }
      }
      return stryMutAct_9fa48("115434") ? {} : (stryCov_9fa48("115434"), {
        leftColumn,
        rightColumn
      });
    }
  }

  /**
   * Perform a nested loop join for complex conditions.
   * @param {Array} leftRows - Left table rows.
   * @param {Array} rightRows - Right table rows.
   * @param {Object} condition - JOIN condition.
   * @param {string} joinType - JOIN type.
   * @return {Array} Joined rows.
   * @private
   */
  nestedLoopJoin(leftRows, rightRows, condition, joinType, leftTableRef = QUERY_EXECUTOR_LITERAL.STRING_LEFT, rightTableRef = QUERY_EXECUTOR_LITERAL.STRING_RIGHT) {
    if (stryMutAct_9fa48("115435")) {
      {}
    } else {
      stryCov_9fa48("115435");
      const result = stryMutAct_9fa48("115436") ? ["Stryker was here"] : (stryCov_9fa48("115436"), []);
      const matchedRight = new Set();
      for (const leftRow of leftRows) {
        if (stryMutAct_9fa48("115437")) {
          {}
        } else {
          stryCov_9fa48("115437");
          let hasMatch = stryMutAct_9fa48("115438") ? true : (stryCov_9fa48("115438"), false);
          for (const rightRow of rightRows) {
            if (stryMutAct_9fa48("115439")) {
              {}
            } else {
              stryCov_9fa48("115439");
              const combined = stryMutAct_9fa48("115440") ? {} : (stryCov_9fa48("115440"), {
                ...leftRow,
                ...rightRow
              });
              if (stryMutAct_9fa48("115442") ? false : stryMutAct_9fa48("115441") ? true : (stryCov_9fa48("115441", "115442"), this.evaluateExpression(combined, condition))) {
                if (stryMutAct_9fa48("115443")) {
                  {}
                } else {
                  stryCov_9fa48("115443");
                  result.push(this.combineJoinRows(leftRow, rightRow, leftTableRef, rightTableRef));
                  matchedRight.add(rightRow);
                  hasMatch = stryMutAct_9fa48("115444") ? false : (stryCov_9fa48("115444"), true);
                }
              }
            }
          }
          if (stryMutAct_9fa48("115447") ? !hasMatch || joinType === QUERY_JOIN_TYPE.LEFT || joinType === QUERY_JOIN_TYPE.LEFT_OUTER : stryMutAct_9fa48("115446") ? false : stryMutAct_9fa48("115445") ? true : (stryCov_9fa48("115445", "115446", "115447"), (stryMutAct_9fa48("115448") ? hasMatch : (stryCov_9fa48("115448"), !hasMatch)) && (stryMutAct_9fa48("115450") ? joinType === QUERY_JOIN_TYPE.LEFT && joinType === QUERY_JOIN_TYPE.LEFT_OUTER : stryMutAct_9fa48("115449") ? true : (stryCov_9fa48("115449", "115450"), (stryMutAct_9fa48("115452") ? joinType !== QUERY_JOIN_TYPE.LEFT : stryMutAct_9fa48("115451") ? false : (stryCov_9fa48("115451", "115452"), joinType === QUERY_JOIN_TYPE.LEFT)) || (stryMutAct_9fa48("115454") ? joinType !== QUERY_JOIN_TYPE.LEFT_OUTER : stryMutAct_9fa48("115453") ? false : (stryCov_9fa48("115453", "115454"), joinType === QUERY_JOIN_TYPE.LEFT_OUTER)))))) {
            if (stryMutAct_9fa48("115455")) {
              {}
            } else {
              stryCov_9fa48("115455");
              const nullRight = {};
              if (stryMutAct_9fa48("115459") ? rightRows.length <= NUM.ZERO : stryMutAct_9fa48("115458") ? rightRows.length >= NUM.ZERO : stryMutAct_9fa48("115457") ? false : stryMutAct_9fa48("115456") ? true : (stryCov_9fa48("115456", "115457", "115458", "115459"), rightRows.length > NUM.ZERO)) {
                if (stryMutAct_9fa48("115460")) {
                  {}
                } else {
                  stryCov_9fa48("115460");
                  for (const col of Object.keys(rightRows[NUM.ZERO])) {
                    if (stryMutAct_9fa48("115461")) {
                      {}
                    } else {
                      stryCov_9fa48("115461");
                      nullRight[col] = null;
                    }
                  }
                }
              }
              result.push(this.combineJoinRows(leftRow, nullRight, leftTableRef, rightTableRef));
            }
          }
        }
      }
      if (stryMutAct_9fa48("115464") ? joinType === QUERY_JOIN_TYPE.RIGHT && joinType === QUERY_JOIN_TYPE.RIGHT_OUTER : stryMutAct_9fa48("115463") ? false : stryMutAct_9fa48("115462") ? true : (stryCov_9fa48("115462", "115463", "115464"), (stryMutAct_9fa48("115466") ? joinType !== QUERY_JOIN_TYPE.RIGHT : stryMutAct_9fa48("115465") ? false : (stryCov_9fa48("115465", "115466"), joinType === QUERY_JOIN_TYPE.RIGHT)) || (stryMutAct_9fa48("115468") ? joinType !== QUERY_JOIN_TYPE.RIGHT_OUTER : stryMutAct_9fa48("115467") ? false : (stryCov_9fa48("115467", "115468"), joinType === QUERY_JOIN_TYPE.RIGHT_OUTER)))) {
        if (stryMutAct_9fa48("115469")) {
          {}
        } else {
          stryCov_9fa48("115469");
          for (const rightRow of rightRows) {
            if (stryMutAct_9fa48("115470")) {
              {}
            } else {
              stryCov_9fa48("115470");
              if (stryMutAct_9fa48("115473") ? false : stryMutAct_9fa48("115472") ? true : stryMutAct_9fa48("115471") ? matchedRight.has(rightRow) : (stryCov_9fa48("115471", "115472", "115473"), !matchedRight.has(rightRow))) {
                if (stryMutAct_9fa48("115474")) {
                  {}
                } else {
                  stryCov_9fa48("115474");
                  const nullLeft = {};
                  if (stryMutAct_9fa48("115478") ? leftRows.length <= NUM.ZERO : stryMutAct_9fa48("115477") ? leftRows.length >= NUM.ZERO : stryMutAct_9fa48("115476") ? false : stryMutAct_9fa48("115475") ? true : (stryCov_9fa48("115475", "115476", "115477", "115478"), leftRows.length > NUM.ZERO)) {
                    if (stryMutAct_9fa48("115479")) {
                      {}
                    } else {
                      stryCov_9fa48("115479");
                      for (const col of Object.keys(leftRows[NUM.ZERO])) {
                        if (stryMutAct_9fa48("115480")) {
                          {}
                        } else {
                          stryCov_9fa48("115480");
                          nullLeft[col] = null;
                        }
                      }
                    }
                  }
                  result.push(this.combineJoinRows(nullLeft, rightRow, leftTableRef, rightTableRef));
                }
              }
            }
          }
        }
      }
      return result;
    }
  }

  /**
   * Execute one JOIN edge with the selected distributed strategy.
   * @param {Object[]} leftRows - Left-side rows.
   * @param {Object[]} rightRows - Right-side rows.
   * @param {Object} join - JOIN AST node.
   * @param {string} leftTableRef - Left table/alias reference.
   * @param {string} rightTableRef - Right table/alias reference.
   * @param {string} strategy - Planner-selected join strategy.
   * @return {Object[]} Joined rows.
   * @private
   */
  executeJoinByStrategy(leftRows, rightRows, join, leftTableRef, rightTableRef, strategy) {
    if (stryMutAct_9fa48("115481")) {
      {}
    } else {
      stryCov_9fa48("115481");
      switch (strategy) {
        case DISTRIBUTED_JOIN_STRATEGY.BROADCAST:
          if (stryMutAct_9fa48("115482")) {} else {
            stryCov_9fa48("115482");
            return this.performJoin(leftRows, rightRows, join, leftTableRef, rightTableRef);
          }
        case DISTRIBUTED_JOIN_STRATEGY.REPARTITION:
          if (stryMutAct_9fa48("115483")) {} else {
            stryCov_9fa48("115483");
            return this.performJoin(leftRows, rightRows, join, leftTableRef, rightTableRef);
          }
        case DISTRIBUTED_JOIN_STRATEGY.NESTED_LOOP:
          if (stryMutAct_9fa48("115484")) {} else {
            stryCov_9fa48("115484");
            return this.nestedLoopJoin(leftRows, rightRows, join.condition, stryMutAct_9fa48("115485") ? (join.joinType || QUERY_JOIN_TYPE.INNER).toLowerCase() : (stryCov_9fa48("115485"), (stryMutAct_9fa48("115488") ? join.joinType && QUERY_JOIN_TYPE.INNER : stryMutAct_9fa48("115487") ? false : stryMutAct_9fa48("115486") ? true : (stryCov_9fa48("115486", "115487", "115488"), join.joinType || QUERY_JOIN_TYPE.INNER)).toUpperCase()), leftTableRef, rightTableRef);
          }
        default:
          if (stryMutAct_9fa48("115489")) {} else {
            stryCov_9fa48("115489");
            return this.performJoin(leftRows, rightRows, join, leftTableRef, rightTableRef);
          }
      }
    }
  }

  /**
   * Resolve strategy for one JOIN edge from distributed plan metadata.
   * @param {Object} join - JOIN AST node.
   * @param {string} leftTableRef - Left table/alias reference.
   * @param {Object|null} distributedPlan - Distributed plan object.
   * @return {string} Join strategy.
   * @private
   */
  resolveJoinStrategy(join, leftTableRef, distributedPlan) {
    if (stryMutAct_9fa48("115490")) {
      {}
    } else {
      stryCov_9fa48("115490");
      const joinPlan = stryMutAct_9fa48("115493") ? distributedPlan?.joinPlan && null : stryMutAct_9fa48("115492") ? false : stryMutAct_9fa48("115491") ? true : (stryCov_9fa48("115491", "115492", "115493"), (stryMutAct_9fa48("115494") ? distributedPlan.joinPlan : (stryCov_9fa48("115494"), distributedPlan?.joinPlan)) || null);
      const rightTableRef = stryMutAct_9fa48("115497") ? (join.table?.alias || join.table?.name) && null : stryMutAct_9fa48("115496") ? false : stryMutAct_9fa48("115495") ? true : (stryCov_9fa48("115495", "115496", "115497"), (stryMutAct_9fa48("115499") ? join.table?.alias && join.table?.name : stryMutAct_9fa48("115498") ? false : (stryCov_9fa48("115498", "115499"), (stryMutAct_9fa48("115500") ? join.table.alias : (stryCov_9fa48("115500"), join.table?.alias)) || (stryMutAct_9fa48("115501") ? join.table.name : (stryCov_9fa48("115501"), join.table?.name)))) || null);
      if (stryMutAct_9fa48("115504") ? !joinPlan && !rightTableRef : stryMutAct_9fa48("115503") ? false : stryMutAct_9fa48("115502") ? true : (stryCov_9fa48("115502", "115503", "115504"), (stryMutAct_9fa48("115505") ? joinPlan : (stryCov_9fa48("115505"), !joinPlan)) || (stryMutAct_9fa48("115506") ? rightTableRef : (stryCov_9fa48("115506"), !rightTableRef)))) {
        if (stryMutAct_9fa48("115507")) {
          {}
        } else {
          stryCov_9fa48("115507");
          return DISTRIBUTED_JOIN_STRATEGY.BROADCAST;
        }
      }
      const edge = stryMutAct_9fa48("115510") ? joinPlan.find(entry => entry.leftAlias === leftTableRef && entry.rightAlias === rightTableRef) && joinPlan.find(entry => entry.rightAlias === rightTableRef) : stryMutAct_9fa48("115509") ? false : stryMutAct_9fa48("115508") ? true : (stryCov_9fa48("115508", "115509", "115510"), joinPlan.find(stryMutAct_9fa48("115511") ? () => undefined : (stryCov_9fa48("115511"), entry => stryMutAct_9fa48("115514") ? entry.leftAlias === leftTableRef || entry.rightAlias === rightTableRef : stryMutAct_9fa48("115513") ? false : stryMutAct_9fa48("115512") ? true : (stryCov_9fa48("115512", "115513", "115514"), (stryMutAct_9fa48("115516") ? entry.leftAlias !== leftTableRef : stryMutAct_9fa48("115515") ? true : (stryCov_9fa48("115515", "115516"), entry.leftAlias === leftTableRef)) && (stryMutAct_9fa48("115518") ? entry.rightAlias !== rightTableRef : stryMutAct_9fa48("115517") ? true : (stryCov_9fa48("115517", "115518"), entry.rightAlias === rightTableRef))))) || joinPlan.find(stryMutAct_9fa48("115519") ? () => undefined : (stryCov_9fa48("115519"), entry => stryMutAct_9fa48("115522") ? entry.rightAlias !== rightTableRef : stryMutAct_9fa48("115521") ? false : stryMutAct_9fa48("115520") ? true : (stryCov_9fa48("115520", "115521", "115522"), entry.rightAlias === rightTableRef))));
      return stryMutAct_9fa48("115525") ? edge?.strategy && DISTRIBUTED_JOIN_STRATEGY.BROADCAST : stryMutAct_9fa48("115524") ? false : stryMutAct_9fa48("115523") ? true : (stryCov_9fa48("115523", "115524", "115525"), (stryMutAct_9fa48("115526") ? edge.strategy : (stryCov_9fa48("115526"), edge?.strategy)) || DISTRIBUTED_JOIN_STRATEGY.BROADCAST);
    }
  }

  /**
   * Combine rows while preserving unqualified keys and qualified collisions.
   * @param {Object} leftRow - Left row.
   * @param {Object} rightRow - Right row.
   * @param {string} leftTableRef - Left table/alias reference.
   * @param {string} rightTableRef - Right table/alias reference.
   * @return {Object} Combined row.
   * @private
   */
  combineJoinRows(leftRow, rightRow, leftTableRef, rightTableRef) {
    if (stryMutAct_9fa48("115527")) {
      {}
    } else {
      stryCov_9fa48("115527");
      const combined = stryMutAct_9fa48("115528") ? {} : (stryCov_9fa48("115528"), {
        ...leftRow
      });
      for (const [column, value] of Object.entries(rightRow)) {
        if (stryMutAct_9fa48("115529")) {
          {}
        } else {
          stryCov_9fa48("115529");
          if (stryMutAct_9fa48("115531") ? false : stryMutAct_9fa48("115530") ? true : (stryCov_9fa48("115530", "115531"), Object.prototype.hasOwnProperty.call(combined, column))) {
            if (stryMutAct_9fa48("115532")) {
              {}
            } else {
              stryCov_9fa48("115532");
              const leftQualified = stryMutAct_9fa48("115533") ? `` : (stryCov_9fa48("115533"), `${leftTableRef}.${column}`);
              const rightQualified = stryMutAct_9fa48("115534") ? `` : (stryCov_9fa48("115534"), `${rightTableRef}.${column}`);
              if (stryMutAct_9fa48("115537") ? false : stryMutAct_9fa48("115536") ? true : stryMutAct_9fa48("115535") ? Object.prototype.hasOwnProperty.call(combined, leftQualified) : (stryCov_9fa48("115535", "115536", "115537"), !Object.prototype.hasOwnProperty.call(combined, leftQualified))) {
                if (stryMutAct_9fa48("115538")) {
                  {}
                } else {
                  stryCov_9fa48("115538");
                  combined[leftQualified] = leftRow[column];
                }
              }
              combined[rightQualified] = value;
              continue;
            }
          }
          combined[column] = value;
        }
      }
      return combined;
    }
  }

  /**
   * Build SELECT SQL without JOIN clauses (for fetching base table data).
   * @param {Object} ast - SELECT AST.
   * @return {string} SQL string without JOINs.
   * @private
   */
  buildSelectSQLWithoutJoins(ast) {
    if (stryMutAct_9fa48("115539")) {
      {}
    } else {
      stryCov_9fa48("115539");
      let sql = QUERY_EXECUTOR_LITERAL.STRING_SELECT;
      if (stryMutAct_9fa48("115541") ? false : stryMutAct_9fa48("115540") ? true : (stryCov_9fa48("115540", "115541"), ast.distinct)) {
        if (stryMutAct_9fa48("115542")) {
          {}
        } else {
          stryCov_9fa48("115542");
          stryMutAct_9fa48("115543") ? sql -= QUERY_EXECUTOR_LITERAL.STRING_DISTINCT : (stryCov_9fa48("115543"), sql += QUERY_EXECUTOR_LITERAL.STRING_DISTINCT);
        }
      }

      // For cross-partition JOINs, select all columns from main table
      stryMutAct_9fa48("115544") ? sql -= QUERY_EXECUTOR_LITERAL.STRING_VALUE_3 : (stryCov_9fa48("115544"), sql += QUERY_EXECUTOR_LITERAL.STRING_VALUE_3);

      // FROM
      if (stryMutAct_9fa48("115546") ? false : stryMutAct_9fa48("115545") ? true : (stryCov_9fa48("115545", "115546"), ast.from.subquery)) {
        if (stryMutAct_9fa48("115547")) {
          {}
        } else {
          stryCov_9fa48("115547");
          sql += stryMutAct_9fa48("115548") ? `` : (stryCov_9fa48("115548"), ` FROM (${this.buildSelectSQL(ast.from.subquery)})`);
        }
      } else {
        if (stryMutAct_9fa48("115549")) {
          {}
        } else {
          stryCov_9fa48("115549");
          sql += stryMutAct_9fa48("115550") ? `` : (stryCov_9fa48("115550"), ` FROM ${ast.from.name}`);
        }
      }
      if (stryMutAct_9fa48("115552") ? false : stryMutAct_9fa48("115551") ? true : (stryCov_9fa48("115551", "115552"), ast.from.alias)) {
        if (stryMutAct_9fa48("115553")) {
          {}
        } else {
          stryCov_9fa48("115553");
          sql += stryMutAct_9fa48("115554") ? `` : (stryCov_9fa48("115554"), ` AS ${ast.from.alias}`);
        }
      }

      // WHERE (only conditions on main table)
      if (stryMutAct_9fa48("115556") ? false : stryMutAct_9fa48("115555") ? true : (stryCov_9fa48("115555", "115556"), ast.where)) {
        if (stryMutAct_9fa48("115557")) {
          {}
        } else {
          stryCov_9fa48("115557");
          const mainTableWhere = this.filterWhereForTable(ast.where, ast.from.name);
          if (stryMutAct_9fa48("115559") ? false : stryMutAct_9fa48("115558") ? true : (stryCov_9fa48("115558", "115559"), mainTableWhere)) {
            if (stryMutAct_9fa48("115560")) {
              {}
            } else {
              stryCov_9fa48("115560");
              sql += stryMutAct_9fa48("115561") ? `` : (stryCov_9fa48("115561"), ` WHERE ${this.buildExpressionSQL(mainTableWhere)}`);
            }
          }
        }
      }
      return sql;
    }
  }

  /**
   * Filter WHERE clause to only include conditions for a specific table.
   * @param {Object} where - WHERE clause AST.
   * @param {string} tableName - Table name to filter for.
   * @return {Object|null} Filtered WHERE clause or null.
   * @private
   */
  filterWhereForTable(where, _tableName) {
    if (stryMutAct_9fa48("115562")) {
      {}
    } else {
      stryCov_9fa48("115562");
      if (stryMutAct_9fa48("115565") ? false : stryMutAct_9fa48("115564") ? true : stryMutAct_9fa48("115563") ? where : (stryCov_9fa48("115563", "115564", "115565"), !where)) return null;

      // For simplicity, return the full WHERE clause
      // A more sophisticated implementation would filter by table
      return where;
    }
  }

  /**
   * Execute a query on multiple partitions in parallel.
   * All queries route through message router using service addresses from system cache.
   * Requirements: 22.1, 22.4, 22.5
   * @param {Array} partitionIds - Partition IDs.
   * @param {string} sql - SQL query.
   * @param {Array} params - Query parameters.
   * @param {Object} _timestamp - HLC timestamp (unused for now).
   * @param {boolean} forRead - True when executing read-only queries.
   * @return {Promise<Array>} Array of partition results.
   * @private
   */
  async executeOnPartitions(partitionIds, sql, params, _timestamp, forRead = stryMutAct_9fa48("115566") ? true : (stryCov_9fa48("115566"), false), preferLeader = stryMutAct_9fa48("115567") ? true : (stryCov_9fa48("115567"), false), preferSameLatencyGroup = stryMutAct_9fa48("115568") ? true : (stryCov_9fa48("115568"), false), executionOptions = {}) {
    if (stryMutAct_9fa48("115569")) {
      {}
    } else {
      stryCov_9fa48("115569");
      const coordinatorResult = await this.parallelQueryCoordinator.executeParallel(sql, partitionIds, params, stryMutAct_9fa48("115570") ? {} : (stryCov_9fa48("115570"), {
        forRead,
        preferLeader,
        preferSameLatencyGroup,
        deliveryPriority: executionOptions.deliveryPriority,
        routingReadinessDimension: stryMutAct_9fa48("115573") ? executionOptions.routingReadinessDimension && this.defaultRoutingReadinessDimension : stryMutAct_9fa48("115572") ? false : stryMutAct_9fa48("115571") ? true : (stryCov_9fa48("115571", "115572", "115573"), executionOptions.routingReadinessDimension || this.defaultRoutingReadinessDimension),
        splitMirrorOrigin: stryMutAct_9fa48("115576") ? executionOptions.splitMirrorOrigin && null : stryMutAct_9fa48("115575") ? false : stryMutAct_9fa48("115574") ? true : (stryCov_9fa48("115574", "115575", "115576"), executionOptions.splitMirrorOrigin || null),
        timestamp: _timestamp,
        timeoutMs: executionOptions.timeoutMs,
        cancellationToken: stryMutAct_9fa48("115579") ? executionOptions.cancellationToken && null : stryMutAct_9fa48("115578") ? false : stryMutAct_9fa48("115577") ? true : (stryCov_9fa48("115577", "115578", "115579"), executionOptions.cancellationToken || null)
      }));
      this.lastCoordinatorMetrics = stryMutAct_9fa48("115582") ? coordinatorResult.metrics && null : stryMutAct_9fa48("115581") ? false : stryMutAct_9fa48("115580") ? true : (stryCov_9fa48("115580", "115581", "115582"), coordinatorResult.metrics || null);
      return coordinatorResult.results;
    }
  }

  /**
   * Return coordinator metrics for the most recent fanout execution.
   * @return {Object|null} Last coordinator metrics payload.
   */
  getLastCoordinatorMetrics() {
    if (stryMutAct_9fa48("115583")) {
      {}
    } else {
      stryCov_9fa48("115583");
      return this.lastCoordinatorMetrics;
    }
  }

  /**
   * Execute a query on a single partition.
   * Routes ALL queries through message router - no local vs remote distinction.
   * Looks up service address from system cache and delivers via message router.
   * Requirements: 22.4, 22.5
   * @param {string} partitionId - Partition ID.
   * @param {string} sql - SQL query.
   * @param {Array} params - Query parameters.
   * @return {Promise<Object>} Partition result.
   * @private
   */
  async executeOnPartition(partitionId, sql, params, forRead, preferLeader, preferSameLatencyGroup, executionOptions = {}) {
    if (stryMutAct_9fa48("115584")) {
      {}
    } else {
      stryCov_9fa48("115584");
      const cancellationToken = stryMutAct_9fa48("115587") ? executionOptions?.cancellationToken && null : stryMutAct_9fa48("115586") ? false : stryMutAct_9fa48("115585") ? true : (stryCov_9fa48("115585", "115586", "115587"), (stryMutAct_9fa48("115588") ? executionOptions.cancellationToken : (stryCov_9fa48("115588"), executionOptions?.cancellationToken)) || null);
      const failedTable = normalizeParticipantFailureString(stryMutAct_9fa48("115589") ? executionOptions.tableName : (stryCov_9fa48("115589"), executionOptions?.tableName));
      this.throwIfCancelled(cancellationToken);
      const buildFailureResult = stryMutAct_9fa48("115590") ? () => undefined : (stryCov_9fa48("115590"), (() => {
        const buildFailureResult = (errorMessage, details = {}) => stryMutAct_9fa48("115591") ? {} : (stryCov_9fa48("115591"), {
          partitionId,
          success: stryMutAct_9fa48("115592") ? true : (stryCov_9fa48("115592"), false),
          error: stryMutAct_9fa48("115595") ? errorMessage && ERRORS.QUERY_FAILED : stryMutAct_9fa48("115594") ? false : stryMutAct_9fa48("115593") ? true : (stryCov_9fa48("115593", "115594", "115595"), errorMessage || ERRORS.QUERY_FAILED),
          errorCode: normalizeParticipantFailureString(stryMutAct_9fa48("115598") ? details?.errorCode && details?.code : stryMutAct_9fa48("115597") ? false : stryMutAct_9fa48("115596") ? true : (stryCov_9fa48("115596", "115597", "115598"), (stryMutAct_9fa48("115599") ? details.errorCode : (stryCov_9fa48("115599"), details?.errorCode)) || (stryMutAct_9fa48("115600") ? details.code : (stryCov_9fa48("115600"), details?.code)))),
          retryAfterMs: normalizeParticipantRetryAfterMs(stryMutAct_9fa48("115601") ? details.retryAfterMs : (stryCov_9fa48("115601"), details?.retryAfterMs)),
          deferRetry: stryMutAct_9fa48("115604") ? details?.deferRetry !== true : stryMutAct_9fa48("115603") ? false : stryMutAct_9fa48("115602") ? true : (stryCov_9fa48("115602", "115603", "115604"), (stryMutAct_9fa48("115605") ? details.deferRetry : (stryCov_9fa48("115605"), details?.deferRetry)) === (stryMutAct_9fa48("115606") ? false : (stryCov_9fa48("115606"), true))),
          participantNodeId: normalizeParticipantFailureString(stryMutAct_9fa48("115607") ? details.participantNodeId : (stryCov_9fa48("115607"), details?.participantNodeId)),
          participantAddress: normalizeParticipantFailureString(stryMutAct_9fa48("115608") ? details.participantAddress : (stryCov_9fa48("115608"), details?.participantAddress)),
          backpressured: resolveParticipantBackpressureState(details),
          failedTable,
          rows: stryMutAct_9fa48("115609") ? ["Stryker was here"] : (stryCov_9fa48("115609"), [])
        });
        return buildFailureResult;
      })());

      // Validate dependencies
      if (stryMutAct_9fa48("115612") ? false : stryMutAct_9fa48("115611") ? true : stryMutAct_9fa48("115610") ? this.messageRouter : (stryCov_9fa48("115610", "115611", "115612"), !this.messageRouter)) {
        if (stryMutAct_9fa48("115613")) {
          {}
        } else {
          stryCov_9fa48("115613");
          this.logger.error(QUERY_LOG_MSG.MESSAGE_ROUTER_UNAVAILABLE, stryMutAct_9fa48("115614") ? {} : (stryCov_9fa48("115614"), {
            partitionId
          }));
          return stryMutAct_9fa48("115615") ? {} : (stryCov_9fa48("115615"), {
            ...buildFailureResult(QUERY_ERROR_MSG.MESSAGE_ROUTER_UNAVAILABLE)
          });
        }
      }
      if (stryMutAct_9fa48("115618") ? false : stryMutAct_9fa48("115617") ? true : stryMutAct_9fa48("115616") ? this.systemCache : (stryCov_9fa48("115616", "115617", "115618"), !this.systemCache)) {
        if (stryMutAct_9fa48("115619")) {
          {}
        } else {
          stryCov_9fa48("115619");
          this.logger.error(LOG_MSG.SYSTEM_CACHE_NOT_AVAILABLE, stryMutAct_9fa48("115620") ? {} : (stryCov_9fa48("115620"), {
            partitionId
          }));
          return stryMutAct_9fa48("115621") ? {} : (stryCov_9fa48("115621"), {
            ...buildFailureResult(ERRORS.SYSTEM_CACHE_NOT_AVAILABLE)
          });
        }
      }
      const maxAttempts = forRead ? this.getReadRetryAttemptLimit() : this.getWriteRetryAttemptLimit();
      let lastError = null;
      let lastFailureDetails = null;
      let awaitedRoutingRepair = stryMutAct_9fa48("115622") ? true : (stryCov_9fa48("115622"), false);
      let awaitedRuntimeRoutingRepair = stryMutAct_9fa48("115623") ? true : (stryCov_9fa48("115623"), false);
      const routingReadinessDimension = stryMutAct_9fa48("115626") ? executionOptions.routingReadinessDimension && this.defaultRoutingReadinessDimension : stryMutAct_9fa48("115625") ? false : stryMutAct_9fa48("115624") ? true : (stryCov_9fa48("115624", "115625", "115626"), executionOptions.routingReadinessDimension || this.defaultRoutingReadinessDimension);
      const allowReadinessAuthoritativeRefresh = this.shouldAllowRoutingAuthoritativeRefresh(executionOptions);
      const buildRequest = (stryMutAct_9fa48("115629") ? typeof executionOptions.buildRequest !== 'function' : stryMutAct_9fa48("115628") ? false : stryMutAct_9fa48("115627") ? true : (stryCov_9fa48("115627", "115628", "115629"), typeof executionOptions.buildRequest === (stryMutAct_9fa48("115630") ? "" : (stryCov_9fa48("115630"), 'function')))) ? executionOptions.buildRequest : () => {
        if (stryMutAct_9fa48("115631")) {
          {}
        } else {
          stryCov_9fa48("115631");
          const request = stryMutAct_9fa48("115632") ? {} : (stryCov_9fa48("115632"), {
            type: QUERY_MESSAGE_TYPE.QUERY,
            sql,
            params
          });
          if (stryMutAct_9fa48("115635") ? typeof executionOptions.sessionId === 'string' || executionOptions.sessionId.length > NUM.ZERO : stryMutAct_9fa48("115634") ? false : stryMutAct_9fa48("115633") ? true : (stryCov_9fa48("115633", "115634", "115635"), (stryMutAct_9fa48("115637") ? typeof executionOptions.sessionId !== 'string' : stryMutAct_9fa48("115636") ? true : (stryCov_9fa48("115636", "115637"), typeof executionOptions.sessionId === (stryMutAct_9fa48("115638") ? "" : (stryCov_9fa48("115638"), 'string')))) && (stryMutAct_9fa48("115641") ? executionOptions.sessionId.length <= NUM.ZERO : stryMutAct_9fa48("115640") ? executionOptions.sessionId.length >= NUM.ZERO : stryMutAct_9fa48("115639") ? true : (stryCov_9fa48("115639", "115640", "115641"), executionOptions.sessionId.length > NUM.ZERO)))) {
            if (stryMutAct_9fa48("115642")) {
              {}
            } else {
              stryCov_9fa48("115642");
              request[QUERY_MESSAGE_FIELD_SESSION_ID] = executionOptions.sessionId;
            }
          }
          if (stryMutAct_9fa48("115644") ? false : stryMutAct_9fa48("115643") ? true : (stryCov_9fa48("115643", "115644"), executionOptions.splitMirrorOrigin)) {
            if (stryMutAct_9fa48("115645")) {
              {}
            } else {
              stryCov_9fa48("115645");
              request[QUERY_MESSAGE_FIELD_SPLIT_MIRROR_ORIGIN] = executionOptions.splitMirrorOrigin;
            }
          }
          if (stryMutAct_9fa48("115648") ? executionOptions.migrationOperation !== MIGRATION_PARTITION_OPERATION.ALTER_TABLE : stryMutAct_9fa48("115647") ? false : stryMutAct_9fa48("115646") ? true : (stryCov_9fa48("115646", "115647", "115648"), executionOptions.migrationOperation === MIGRATION_PARTITION_OPERATION.ALTER_TABLE)) {
            if (stryMutAct_9fa48("115649")) {
              {}
            } else {
              stryCov_9fa48("115649");
              request[QUERY_MESSAGE_FIELD_MIGRATION_OPERATION] = executionOptions.migrationOperation;
              if (stryMutAct_9fa48("115651") ? false : stryMutAct_9fa48("115650") ? true : (stryCov_9fa48("115650", "115651"), executionOptions.migrationId)) {
                if (stryMutAct_9fa48("115652")) {
                  {}
                } else {
                  stryCov_9fa48("115652");
                  request[QUERY_MESSAGE_FIELD_MIGRATION_ID] = executionOptions.migrationId;
                }
              }
            }
          }
          return request;
        }
      };
      const isSuccessfulResponse = (stryMutAct_9fa48("115655") ? typeof executionOptions.isSuccessfulResponse !== 'function' : stryMutAct_9fa48("115654") ? false : stryMutAct_9fa48("115653") ? true : (stryCov_9fa48("115653", "115654", "115655"), typeof executionOptions.isSuccessfulResponse === (stryMutAct_9fa48("115656") ? "" : (stryCov_9fa48("115656"), 'function')))) ? executionOptions.isSuccessfulResponse : stryMutAct_9fa48("115657") ? () => undefined : (stryCov_9fa48("115657"), response => stryMutAct_9fa48("115660") ? response?.acknowledged || response?.success : stryMutAct_9fa48("115659") ? false : stryMutAct_9fa48("115658") ? true : (stryCov_9fa48("115658", "115659", "115660"), (stryMutAct_9fa48("115661") ? response.acknowledged : (stryCov_9fa48("115661"), response?.acknowledged)) && (stryMutAct_9fa48("115662") ? response.success : (stryCov_9fa48("115662"), response?.success))));
      const buildSuccessResult = (stryMutAct_9fa48("115665") ? typeof executionOptions.buildSuccessResult !== 'function' : stryMutAct_9fa48("115664") ? false : stryMutAct_9fa48("115663") ? true : (stryCov_9fa48("115663", "115664", "115665"), typeof executionOptions.buildSuccessResult === (stryMutAct_9fa48("115666") ? "" : (stryCov_9fa48("115666"), 'function')))) ? executionOptions.buildSuccessResult : stryMutAct_9fa48("115667") ? () => undefined : (stryCov_9fa48("115667"), response => stryMutAct_9fa48("115668") ? {} : (stryCov_9fa48("115668"), {
        partitionId,
        success: stryMutAct_9fa48("115669") ? false : (stryCov_9fa48("115669"), true),
        rows: stryMutAct_9fa48("115672") ? response.rows && [] : stryMutAct_9fa48("115671") ? false : stryMutAct_9fa48("115670") ? true : (stryCov_9fa48("115670", "115671", "115672"), response.rows || (stryMutAct_9fa48("115673") ? ["Stryker was here"] : (stryCov_9fa48("115673"), []))),
        changes: response.changes
      }));
      for (let attempt = NUM.ONE; stryMutAct_9fa48("115676") ? attempt > maxAttempts : stryMutAct_9fa48("115675") ? attempt < maxAttempts : stryMutAct_9fa48("115674") ? false : (stryCov_9fa48("115674", "115675", "115676"), attempt <= maxAttempts); stryMutAct_9fa48("115677") ? attempt-- : (stryCov_9fa48("115677"), attempt++)) {
        if (stryMutAct_9fa48("115678")) {
          {}
        } else {
          stryCov_9fa48("115678");
          this.throwIfCancelled(cancellationToken);
          let {
            candidates: serviceCandidates,
            routingSnapshot
          } = this.resolvePartitionServiceCandidates(partitionId, forRead, preferLeader, preferSameLatencyGroup, routingReadinessDimension, stryMutAct_9fa48("115679") ? {} : (stryCov_9fa48("115679"), {
            allowReadinessAuthoritativeRefresh
          }));
          if (stryMutAct_9fa48("115682") ? !awaitedRoutingRepair && serviceCandidates.length === NUM.ZERO || (await this.maybeAwaitDeniedPartitionRoutingRepair(routingSnapshot, {
            allowReadinessAuthoritativeRefresh
          })) : stryMutAct_9fa48("115681") ? false : stryMutAct_9fa48("115680") ? true : (stryCov_9fa48("115680", "115681", "115682"), (stryMutAct_9fa48("115684") ? !awaitedRoutingRepair || serviceCandidates.length === NUM.ZERO : stryMutAct_9fa48("115683") ? true : (stryCov_9fa48("115683", "115684"), (stryMutAct_9fa48("115685") ? awaitedRoutingRepair : (stryCov_9fa48("115685"), !awaitedRoutingRepair)) && (stryMutAct_9fa48("115687") ? serviceCandidates.length !== NUM.ZERO : stryMutAct_9fa48("115686") ? true : (stryCov_9fa48("115686", "115687"), serviceCandidates.length === NUM.ZERO)))) && (await this.maybeAwaitDeniedPartitionRoutingRepair(routingSnapshot, stryMutAct_9fa48("115688") ? {} : (stryCov_9fa48("115688"), {
            allowReadinessAuthoritativeRefresh
          }))))) {
            if (stryMutAct_9fa48("115689")) {
              {}
            } else {
              stryCov_9fa48("115689");
              awaitedRoutingRepair = stryMutAct_9fa48("115690") ? false : (stryCov_9fa48("115690"), true);
              this.throwIfCancelled(cancellationToken);
              ({
                candidates: serviceCandidates,
                routingSnapshot
              } = this.resolvePartitionServiceCandidates(partitionId, forRead, preferLeader, preferSameLatencyGroup, routingReadinessDimension, stryMutAct_9fa48("115691") ? {} : (stryCov_9fa48("115691"), {
                allowReadinessAuthoritativeRefresh
              })));
            }
          }
          serviceCandidates = this.prioritizeSessionPartitionAddress(serviceCandidates, routingSnapshot, executionOptions.sessionId, partitionId);
          if (stryMutAct_9fa48("115694") ? serviceCandidates.length !== NUM.ZERO : stryMutAct_9fa48("115693") ? false : stryMutAct_9fa48("115692") ? true : (stryCov_9fa48("115692", "115693", "115694"), serviceCandidates.length === NUM.ZERO)) {
            if (stryMutAct_9fa48("115695")) {
              {}
            } else {
              stryCov_9fa48("115695");
              const hasRoutableService = stryMutAct_9fa48("115699") ? routingSnapshot.routableServiceCount <= NUM.ZERO : stryMutAct_9fa48("115698") ? routingSnapshot.routableServiceCount >= NUM.ZERO : stryMutAct_9fa48("115697") ? false : stryMutAct_9fa48("115696") ? true : (stryCov_9fa48("115696", "115697", "115698", "115699"), routingSnapshot.routableServiceCount > NUM.ZERO);
              const hasPartitionRecord = this.hasPartitionRecord(partitionId);
              if (stryMutAct_9fa48("115702") ? false : stryMutAct_9fa48("115701") ? true : stryMutAct_9fa48("115700") ? forRead : (stryCov_9fa48("115700", "115701", "115702"), !forRead)) {
                if (stryMutAct_9fa48("115703")) {
                  {}
                } else {
                  stryCov_9fa48("115703");
                  if (stryMutAct_9fa48("115706") ? hasRoutableService || attempt < maxAttempts : stryMutAct_9fa48("115705") ? false : stryMutAct_9fa48("115704") ? true : (stryCov_9fa48("115704", "115705", "115706"), hasRoutableService && (stryMutAct_9fa48("115709") ? attempt >= maxAttempts : stryMutAct_9fa48("115708") ? attempt <= maxAttempts : stryMutAct_9fa48("115707") ? true : (stryCov_9fa48("115707", "115708", "115709"), attempt < maxAttempts)))) {
                    if (stryMutAct_9fa48("115710")) {
                      {}
                    } else {
                      stryCov_9fa48("115710");
                      lastError = ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE;
                      await this.delay(this.leaderRetryDelayMs);
                      this.throwIfCancelled(cancellationToken);
                      continue;
                    }
                  }
                  if (stryMutAct_9fa48("115713") ? !hasRoutableService && hasPartitionRecord || attempt < maxAttempts : stryMutAct_9fa48("115712") ? false : stryMutAct_9fa48("115711") ? true : (stryCov_9fa48("115711", "115712", "115713"), (stryMutAct_9fa48("115715") ? !hasRoutableService || hasPartitionRecord : stryMutAct_9fa48("115714") ? true : (stryCov_9fa48("115714", "115715"), (stryMutAct_9fa48("115716") ? hasRoutableService : (stryCov_9fa48("115716"), !hasRoutableService)) && hasPartitionRecord)) && (stryMutAct_9fa48("115719") ? attempt >= maxAttempts : stryMutAct_9fa48("115718") ? attempt <= maxAttempts : stryMutAct_9fa48("115717") ? true : (stryCov_9fa48("115717", "115718", "115719"), attempt < maxAttempts)))) {
                    if (stryMutAct_9fa48("115720")) {
                      {}
                    } else {
                      stryCov_9fa48("115720");
                      lastError = ERRORS.PARTITION_SERVICE_NOT_FOUND;
                      await this.delay(this.leaderRetryDelayMs);
                      this.throwIfCancelled(cancellationToken);
                      continue;
                    }
                  }
                  if (stryMutAct_9fa48("115722") ? false : stryMutAct_9fa48("115721") ? true : (stryCov_9fa48("115721", "115722"), hasRoutableService)) {
                    if (stryMutAct_9fa48("115723")) {
                      {}
                    } else {
                      stryCov_9fa48("115723");
                      this.logger.warn(QUERY_LOG_MSG.NO_LEADER_SERVICE_FOR_PARTITION, stryMutAct_9fa48("115724") ? {} : (stryCov_9fa48("115724"), {
                        partitionId,
                        attempts: attempt
                      }));
                      return stryMutAct_9fa48("115725") ? {} : (stryCov_9fa48("115725"), {
                        ...buildFailureResult(ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE)
                      });
                    }
                  }
                  if (stryMutAct_9fa48("115728") ? false : stryMutAct_9fa48("115727") ? true : stryMutAct_9fa48("115726") ? hasRoutableService : (stryCov_9fa48("115726", "115727", "115728"), !hasRoutableService)) {
                    if (stryMutAct_9fa48("115729")) {
                      {}
                    } else {
                      stryCov_9fa48("115729");
                      this.logNoServiceForPartition(partitionId, routingSnapshot);
                      return stryMutAct_9fa48("115730") ? {} : (stryCov_9fa48("115730"), {
                        ...buildFailureResult(QUERY_ERROR_MSG.PARTITION_SERVICE_NOT_FOUND)
                      });
                    }
                  }
                }
              } else {
                if (stryMutAct_9fa48("115731")) {
                  {}
                } else {
                  stryCov_9fa48("115731");
                  // §1.10/§1.12: Reads get bounded retries so routing
                  // repair and cache convergence can discover candidates.
                  if (stryMutAct_9fa48("115734") ? hasPartitionRecord || attempt < maxAttempts : stryMutAct_9fa48("115733") ? false : stryMutAct_9fa48("115732") ? true : (stryCov_9fa48("115732", "115733", "115734"), hasPartitionRecord && (stryMutAct_9fa48("115737") ? attempt >= maxAttempts : stryMutAct_9fa48("115736") ? attempt <= maxAttempts : stryMutAct_9fa48("115735") ? true : (stryCov_9fa48("115735", "115736", "115737"), attempt < maxAttempts)))) {
                    if (stryMutAct_9fa48("115738")) {
                      {}
                    } else {
                      stryCov_9fa48("115738");
                      lastError = QUERY_ERROR_MSG.PARTITION_SERVICE_NOT_FOUND;
                      await this.delay(this.leaderRetryDelayMs);
                      this.throwIfCancelled(cancellationToken);
                      continue;
                    }
                  }
                  this.logNoServiceForPartition(partitionId, routingSnapshot);
                  return stryMutAct_9fa48("115739") ? {} : (stryCov_9fa48("115739"), {
                    ...buildFailureResult(QUERY_ERROR_MSG.PARTITION_SERVICE_NOT_FOUND)
                  });
                }
              }
            }
          }
          const candidateQueue = stryMutAct_9fa48("115740") ? [] : (stryCov_9fa48("115740"), [...serviceCandidates]);
          const attemptedAddresses = new Set();
          let retryCurrentAddressOnNextAttempt = stryMutAct_9fa48("115741") ? true : (stryCov_9fa48("115741"), false);
          let leaderRecoveryQueued = stryMutAct_9fa48("115742") ? true : (stryCov_9fa48("115742"), false);
          const queueLeaderRecoveryCandidates = () => {
            if (stryMutAct_9fa48("115743")) {
              {}
            } else {
              stryCov_9fa48("115743");
              if (stryMutAct_9fa48("115746") ? forRead && leaderRecoveryQueued : stryMutAct_9fa48("115745") ? false : stryMutAct_9fa48("115744") ? true : (stryCov_9fa48("115744", "115745", "115746"), forRead || leaderRecoveryQueued)) {
                if (stryMutAct_9fa48("115747")) {
                  {}
                } else {
                  stryCov_9fa48("115747");
                  return;
                }
              }
              const recoveryCandidates = this.getLeaderRecoveryCandidates(routingSnapshot, attemptedAddresses, preferSameLatencyGroup);
              if (stryMutAct_9fa48("115750") ? recoveryCandidates.length !== 0 : stryMutAct_9fa48("115749") ? false : stryMutAct_9fa48("115748") ? true : (stryCov_9fa48("115748", "115749", "115750"), recoveryCandidates.length === 0)) {
                if (stryMutAct_9fa48("115751")) {
                  {}
                } else {
                  stryCov_9fa48("115751");
                  return;
                }
              }
              leaderRecoveryQueued = stryMutAct_9fa48("115752") ? false : (stryCov_9fa48("115752"), true);
              candidateQueue.push(...recoveryCandidates);
            }
          };
          const buildCandidateFailureDetails = stryMutAct_9fa48("115753") ? () => undefined : (stryCov_9fa48("115753"), (() => {
            const buildCandidateFailureDetails = (failure, participantNodeId, participantAddress) => stryMutAct_9fa48("115754") ? {} : (stryCov_9fa48("115754"), {
              errorCode: stryMutAct_9fa48("115757") ? failure?.errorCode && failure?.code : stryMutAct_9fa48("115756") ? false : stryMutAct_9fa48("115755") ? true : (stryCov_9fa48("115755", "115756", "115757"), (stryMutAct_9fa48("115758") ? failure.errorCode : (stryCov_9fa48("115758"), failure?.errorCode)) || (stryMutAct_9fa48("115759") ? failure.code : (stryCov_9fa48("115759"), failure?.code))),
              retryAfterMs: stryMutAct_9fa48("115760") ? failure.retryAfterMs : (stryCov_9fa48("115760"), failure?.retryAfterMs),
              deferRetry: stryMutAct_9fa48("115761") ? failure.deferRetry : (stryCov_9fa48("115761"), failure?.deferRetry),
              participantNodeId,
              participantAddress,
              backpressured: resolveParticipantBackpressureState(failure)
            });
            return buildCandidateFailureDetails;
          })());
          const recordCandidateFailure = (errorMessage, failure, participantNodeId, participantAddress) => {
            if (stryMutAct_9fa48("115762")) {
              {}
            } else {
              stryCov_9fa48("115762");
              lastError = errorMessage;
              lastFailureDetails = buildCandidateFailureDetails(failure, participantNodeId, participantAddress);
            }
          };
          const requestRetryCurrentAddress = () => {
            if (stryMutAct_9fa48("115763")) {
              {}
            } else {
              stryCov_9fa48("115763");
              retryCurrentAddressOnNextAttempt = stryMutAct_9fa48("115764") ? false : (stryCov_9fa48("115764"), true);
            }
          };
          for (let candidateIndex = NUM.ZERO; stryMutAct_9fa48("115767") ? candidateIndex >= candidateQueue.length : stryMutAct_9fa48("115766") ? candidateIndex <= candidateQueue.length : stryMutAct_9fa48("115765") ? false : (stryCov_9fa48("115765", "115766", "115767"), candidateIndex < candidateQueue.length); stryMutAct_9fa48("115768") ? candidateIndex -= NUM.ONE : (stryCov_9fa48("115768"), candidateIndex += NUM.ONE)) {
            if (stryMutAct_9fa48("115769")) {
              {}
            } else {
              stryCov_9fa48("115769");
              const serviceInfo = candidateQueue[candidateIndex];
              const {
                address
              } = serviceInfo;
              attemptedAddresses.add(address);
              this.logger.debug(QUERY_LOG_MSG.ROUTING_QUERY_TO_PARTITION, stryMutAct_9fa48("115770") ? {} : (stryCov_9fa48("115770"), {
                partitionId,
                address
              }));
              try {
                if (stryMutAct_9fa48("115771")) {
                  {}
                } else {
                  stryCov_9fa48("115771");
                  this.throwIfCancelled(cancellationToken);
                  const request = buildRequest(stryMutAct_9fa48("115772") ? {} : (stryCov_9fa48("115772"), {
                    partitionId,
                    address,
                    sql,
                    params,
                    executionOptions
                  }));
                  const response = await this.messageRouter.deliver(address, request, stryMutAct_9fa48("115773") ? {} : (stryCov_9fa48("115773"), {
                    deliveryPriority: executionOptions.deliveryPriority
                  }));
                  this.throwIfCancelled(cancellationToken);
                  if (stryMutAct_9fa48("115775") ? false : stryMutAct_9fa48("115774") ? true : (stryCov_9fa48("115774", "115775"), isSuccessfulResponse(response))) {
                    if (stryMutAct_9fa48("115776")) {
                      {}
                    } else {
                      stryCov_9fa48("115776");
                      this.clearTemporarilyUnroutableAddress(partitionId, address);
                      if (stryMutAct_9fa48("115779") ? executionOptions.clearSessionPartitionAffinityOnSuccess !== true : stryMutAct_9fa48("115778") ? false : stryMutAct_9fa48("115777") ? true : (stryCov_9fa48("115777", "115778", "115779"), executionOptions.clearSessionPartitionAffinityOnSuccess === (stryMutAct_9fa48("115780") ? false : (stryCov_9fa48("115780"), true)))) {
                        if (stryMutAct_9fa48("115781")) {
                          {}
                        } else {
                          stryCov_9fa48("115781");
                          this.clearSessionPartitionAddress(executionOptions.sessionId, partitionId);
                        }
                      } else {
                        if (stryMutAct_9fa48("115782")) {
                          {}
                        } else {
                          stryCov_9fa48("115782");
                          this.setSessionPartitionAddress(executionOptions.sessionId, partitionId, address);
                        }
                      }
                      return buildSuccessResult(response, stryMutAct_9fa48("115783") ? {} : (stryCov_9fa48("115783"), {
                        partitionId,
                        address,
                        request,
                        executionOptions
                      }));
                    }
                  }

                  // Handle leader redirect response - immediately retry with provided address
                  if (stryMutAct_9fa48("115786") ? response.redirect === QUERY_RESPONSE_TYPE.LEADER_REDIRECT || response.leaderAddress : stryMutAct_9fa48("115785") ? false : stryMutAct_9fa48("115784") ? true : (stryCov_9fa48("115784", "115785", "115786"), (stryMutAct_9fa48("115788") ? response.redirect !== QUERY_RESPONSE_TYPE.LEADER_REDIRECT : stryMutAct_9fa48("115787") ? true : (stryCov_9fa48("115787", "115788"), response.redirect === QUERY_RESPONSE_TYPE.LEADER_REDIRECT)) && response.leaderAddress)) {
                    if (stryMutAct_9fa48("115789")) {
                      {}
                    } else {
                      stryCov_9fa48("115789");
                      this.logger.debug(QUERY_LOG_MSG.FOLLOWING_LEADER_REDIRECT, stryMutAct_9fa48("115790") ? {} : (stryCov_9fa48("115790"), {
                        partitionId,
                        fromAddress: address,
                        leaderAddress: response.leaderAddress
                      }));
                      const redirectResponse = await this.messageRouter.deliver(response.leaderAddress, buildRequest(stryMutAct_9fa48("115791") ? {} : (stryCov_9fa48("115791"), {
                        partitionId,
                        address: response.leaderAddress,
                        redirectedFromAddress: address,
                        leaderAddress: response.leaderAddress,
                        sql,
                        params,
                        executionOptions
                      })), stryMutAct_9fa48("115792") ? {} : (stryCov_9fa48("115792"), {
                        deliveryPriority: executionOptions.deliveryPriority
                      }));
                      if (stryMutAct_9fa48("115794") ? false : stryMutAct_9fa48("115793") ? true : (stryCov_9fa48("115793", "115794"), isSuccessfulResponse(redirectResponse))) {
                        if (stryMutAct_9fa48("115795")) {
                          {}
                        } else {
                          stryCov_9fa48("115795");
                          this.clearTemporarilyUnroutableAddress(partitionId, response.leaderAddress);
                          if (stryMutAct_9fa48("115798") ? executionOptions.clearSessionPartitionAffinityOnSuccess !== true : stryMutAct_9fa48("115797") ? false : stryMutAct_9fa48("115796") ? true : (stryCov_9fa48("115796", "115797", "115798"), executionOptions.clearSessionPartitionAffinityOnSuccess === (stryMutAct_9fa48("115799") ? false : (stryCov_9fa48("115799"), true)))) {
                            if (stryMutAct_9fa48("115800")) {
                              {}
                            } else {
                              stryCov_9fa48("115800");
                              this.clearSessionPartitionAddress(executionOptions.sessionId, partitionId);
                            }
                          } else {
                            if (stryMutAct_9fa48("115801")) {
                              {}
                            } else {
                              stryCov_9fa48("115801");
                              this.setSessionPartitionAddress(executionOptions.sessionId, partitionId, response.leaderAddress);
                            }
                          }
                          return buildSuccessResult(redirectResponse, stryMutAct_9fa48("115802") ? {} : (stryCov_9fa48("115802"), {
                            partitionId,
                            address: response.leaderAddress,
                            redirectedFromAddress: address,
                            executionOptions
                          }));
                        }
                      }

                      // Redirect target also failed - continue to next candidate
                      recordCandidateFailure(stryMutAct_9fa48("115805") ? redirectResponse.error && ERRORS.QUERY_FAILED : stryMutAct_9fa48("115804") ? false : stryMutAct_9fa48("115803") ? true : (stryCov_9fa48("115803", "115804", "115805"), redirectResponse.error || ERRORS.QUERY_FAILED), redirectResponse, stryMutAct_9fa48("115806") ? serviceInfo.nodeId : (stryCov_9fa48("115806"), serviceInfo?.nodeId), response.leaderAddress);
                      continue;
                    }
                  }
                  if (stryMutAct_9fa48("115808") ? false : stryMutAct_9fa48("115807") ? true : (stryCov_9fa48("115807", "115808"), response.noHandler)) {
                    if (stryMutAct_9fa48("115809")) {
                      {}
                    } else {
                      stryCov_9fa48("115809");
                      const errorMessage = stryMutAct_9fa48("115812") ? response.error && `${ERRORS.NO_HANDLER_FOR_ADDRESS} ${address}` : stryMutAct_9fa48("115811") ? false : stryMutAct_9fa48("115810") ? true : (stryCov_9fa48("115810", "115811", "115812"), response.error || (stryMutAct_9fa48("115813") ? `` : (stryCov_9fa48("115813"), `${ERRORS.NO_HANDLER_FOR_ADDRESS} ${address}`)));
                      const witnessedService = this.findRoutingSnapshotService(routingSnapshot, serviceInfo, address);
                      this.logger.warn(QUERY_LOG_MSG.NO_HANDLER_FOR_PARTITION, stryMutAct_9fa48("115814") ? {} : (stryCov_9fa48("115814"), {
                        partitionId,
                        address
                      }));
                      this.markTemporarilyUnroutableAddress(partitionId, address, witnessedService);
                      if (stryMutAct_9fa48("115817") ? this.getSessionPartitionAddress(executionOptions.sessionId, partitionId) !== address : stryMutAct_9fa48("115816") ? false : stryMutAct_9fa48("115815") ? true : (stryCov_9fa48("115815", "115816", "115817"), this.getSessionPartitionAddress(executionOptions.sessionId, partitionId) === address)) {
                        if (stryMutAct_9fa48("115818")) {
                          {}
                        } else {
                          stryCov_9fa48("115818");
                          this.clearSessionPartitionAddress(executionOptions.sessionId, partitionId);
                        }
                      }
                      if (stryMutAct_9fa48("115821") ? !awaitedRuntimeRoutingRepair || (await this.maybeAwaitRuntimeRoutingRepair(routingSnapshot, {
                        partitionId,
                        participantNodeId: serviceInfo?.nodeId || null,
                        routingReadinessDimension,
                        allowReadinessAuthoritativeRefresh,
                        refreshReason: QUERY_ROUTING_REPAIR_REASON.NO_HANDLER_STALE_SERVICE
                      })) : stryMutAct_9fa48("115820") ? false : stryMutAct_9fa48("115819") ? true : (stryCov_9fa48("115819", "115820", "115821"), (stryMutAct_9fa48("115822") ? awaitedRuntimeRoutingRepair : (stryCov_9fa48("115822"), !awaitedRuntimeRoutingRepair)) && (await this.maybeAwaitRuntimeRoutingRepair(routingSnapshot, stryMutAct_9fa48("115823") ? {} : (stryCov_9fa48("115823"), {
                        partitionId,
                        participantNodeId: stryMutAct_9fa48("115826") ? serviceInfo?.nodeId && null : stryMutAct_9fa48("115825") ? false : stryMutAct_9fa48("115824") ? true : (stryCov_9fa48("115824", "115825", "115826"), (stryMutAct_9fa48("115827") ? serviceInfo.nodeId : (stryCov_9fa48("115827"), serviceInfo?.nodeId)) || null),
                        routingReadinessDimension,
                        allowReadinessAuthoritativeRefresh,
                        refreshReason: QUERY_ROUTING_REPAIR_REASON.NO_HANDLER_STALE_SERVICE
                      }))))) {
                        if (stryMutAct_9fa48("115828")) {
                          {}
                        } else {
                          stryCov_9fa48("115828");
                          awaitedRuntimeRoutingRepair = stryMutAct_9fa48("115829") ? false : (stryCov_9fa48("115829"), true);
                          const refreshedResolution = this.resolvePartitionServiceCandidates(partitionId, forRead, preferLeader, preferSameLatencyGroup, routingReadinessDimension, stryMutAct_9fa48("115830") ? {} : (stryCov_9fa48("115830"), {
                            allowReadinessAuthoritativeRefresh
                          }));
                          routingSnapshot = refreshedResolution.routingSnapshot;
                          const refreshedRecoveryCandidates = this.getLeaderRecoveryCandidates(routingSnapshot, attemptedAddresses, preferSameLatencyGroup);
                          if (stryMutAct_9fa48("115834") ? refreshedRecoveryCandidates.length <= NUM.ZERO : stryMutAct_9fa48("115833") ? refreshedRecoveryCandidates.length >= NUM.ZERO : stryMutAct_9fa48("115832") ? false : stryMutAct_9fa48("115831") ? true : (stryCov_9fa48("115831", "115832", "115833", "115834"), refreshedRecoveryCandidates.length > NUM.ZERO)) {
                            if (stryMutAct_9fa48("115835")) {
                              {}
                            } else {
                              stryCov_9fa48("115835");
                              candidateQueue.push(...refreshedRecoveryCandidates);
                            }
                          }
                        }
                      }
                      recordCandidateFailure(errorMessage, response, stryMutAct_9fa48("115836") ? serviceInfo.nodeId : (stryCov_9fa48("115836"), serviceInfo?.nodeId), address);
                      if (stryMutAct_9fa48("115839") ? !forRead || this.isLeaderUnavailable(errorMessage, response?.errorCode) : stryMutAct_9fa48("115838") ? false : stryMutAct_9fa48("115837") ? true : (stryCov_9fa48("115837", "115838", "115839"), (stryMutAct_9fa48("115840") ? forRead : (stryCov_9fa48("115840"), !forRead)) && this.isLeaderUnavailable(errorMessage, stryMutAct_9fa48("115841") ? response.errorCode : (stryCov_9fa48("115841"), response?.errorCode)))) {
                        if (stryMutAct_9fa48("115842")) {
                          {}
                        } else {
                          stryCov_9fa48("115842");
                          queueLeaderRecoveryCandidates();
                          continue;
                        }
                      }
                      continue;
                    }
                  }
                  const errorMessage = stryMutAct_9fa48("115845") ? response.error && ERRORS.QUERY_FAILED : stryMutAct_9fa48("115844") ? false : stryMutAct_9fa48("115843") ? true : (stryCov_9fa48("115843", "115844", "115845"), response.error || ERRORS.QUERY_FAILED);
                  if (stryMutAct_9fa48("115848") ? !forRead || this.isLeaderUnavailable(errorMessage, response?.errorCode) : stryMutAct_9fa48("115847") ? false : stryMutAct_9fa48("115846") ? true : (stryCov_9fa48("115846", "115847", "115848"), (stryMutAct_9fa48("115849") ? forRead : (stryCov_9fa48("115849"), !forRead)) && this.isLeaderUnavailable(errorMessage, stryMutAct_9fa48("115850") ? response.errorCode : (stryCov_9fa48("115850"), response?.errorCode)))) {
                    if (stryMutAct_9fa48("115851")) {
                      {}
                    } else {
                      stryCov_9fa48("115851");
                      recordCandidateFailure(errorMessage, response, stryMutAct_9fa48("115852") ? serviceInfo.nodeId : (stryCov_9fa48("115852"), serviceInfo?.nodeId), address);
                      if (stryMutAct_9fa48("115855") ? this.getSessionPartitionAddress(executionOptions.sessionId, partitionId) !== address : stryMutAct_9fa48("115854") ? false : stryMutAct_9fa48("115853") ? true : (stryCov_9fa48("115853", "115854", "115855"), this.getSessionPartitionAddress(executionOptions.sessionId, partitionId) === address)) {
                        if (stryMutAct_9fa48("115856")) {
                          {}
                        } else {
                          stryCov_9fa48("115856");
                          this.clearSessionPartitionAddress(executionOptions.sessionId, partitionId);
                        }
                      }
                      queueLeaderRecoveryCandidates();
                      continue;
                    }
                  }
                  if (stryMutAct_9fa48("115858") ? false : stryMutAct_9fa48("115857") ? true : (stryCov_9fa48("115857", "115858"), this.isRetryableControlPlaneWriteFailure(partitionId, stryMutAct_9fa48("115859") ? {} : (stryCov_9fa48("115859"), {
                    error: errorMessage,
                    errorCode: stryMutAct_9fa48("115860") ? response.errorCode : (stryCov_9fa48("115860"), response?.errorCode),
                    retryAfterMs: stryMutAct_9fa48("115861") ? response.retryAfterMs : (stryCov_9fa48("115861"), response?.retryAfterMs),
                    deferRetry: stryMutAct_9fa48("115862") ? response.deferRetry : (stryCov_9fa48("115862"), response?.deferRetry)
                  }), forRead))) {
                    if (stryMutAct_9fa48("115863")) {
                      {}
                    } else {
                      stryCov_9fa48("115863");
                      recordCandidateFailure(errorMessage, response, stryMutAct_9fa48("115864") ? serviceInfo.nodeId : (stryCov_9fa48("115864"), serviceInfo?.nodeId), address);
                      if (stryMutAct_9fa48("115866") ? false : stryMutAct_9fa48("115865") ? true : (stryCov_9fa48("115865", "115866"), this.shouldRetryTransactionActiveWriteOnSameAddress(partitionId, executionOptions, stryMutAct_9fa48("115867") ? {} : (stryCov_9fa48("115867"), {
                        error: errorMessage,
                        errorCode: stryMutAct_9fa48("115868") ? response.errorCode : (stryCov_9fa48("115868"), response?.errorCode),
                        retryAfterMs: stryMutAct_9fa48("115869") ? response.retryAfterMs : (stryCov_9fa48("115869"), response?.retryAfterMs),
                        deferRetry: stryMutAct_9fa48("115870") ? response.deferRetry : (stryCov_9fa48("115870"), response?.deferRetry)
                      }), forRead))) {
                        if (stryMutAct_9fa48("115871")) {
                          {}
                        } else {
                          stryCov_9fa48("115871");
                          requestRetryCurrentAddress();
                          break;
                        }
                      }
                      queueLeaderRecoveryCandidates();
                      continue;
                    }
                  }

                  // §1.12: For reads, treat transient failures as reasons
                  // to try the next candidate rather than hard-failing.
                  if (stryMutAct_9fa48("115873") ? false : stryMutAct_9fa48("115872") ? true : (stryCov_9fa48("115872", "115873"), forRead)) {
                    if (stryMutAct_9fa48("115874")) {
                      {}
                    } else {
                      stryCov_9fa48("115874");
                      this.logger.debug(QUERY_LOG_MSG.READ_CANDIDATE_TRANSIENT_FAILURE, stryMutAct_9fa48("115875") ? {} : (stryCov_9fa48("115875"), {
                        partitionId,
                        address
                      }));
                      recordCandidateFailure(errorMessage, response, stryMutAct_9fa48("115876") ? serviceInfo.nodeId : (stryCov_9fa48("115876"), serviceInfo?.nodeId), address);
                      continue;
                    }
                  }
                  return stryMutAct_9fa48("115877") ? {} : (stryCov_9fa48("115877"), {
                    ...buildFailureResult(errorMessage, stryMutAct_9fa48("115878") ? {} : (stryCov_9fa48("115878"), {
                      errorCode: stryMutAct_9fa48("115879") ? response.errorCode : (stryCov_9fa48("115879"), response?.errorCode),
                      retryAfterMs: stryMutAct_9fa48("115880") ? response.retryAfterMs : (stryCov_9fa48("115880"), response?.retryAfterMs),
                      deferRetry: stryMutAct_9fa48("115881") ? response.deferRetry : (stryCov_9fa48("115881"), response?.deferRetry),
                      participantNodeId: stryMutAct_9fa48("115882") ? serviceInfo.nodeId : (stryCov_9fa48("115882"), serviceInfo?.nodeId),
                      participantAddress: address,
                      backpressured: resolveParticipantBackpressureState(response)
                    }))
                  });
                }
              } catch (error) {
                if (stryMutAct_9fa48("115883")) {
                  {}
                } else {
                  stryCov_9fa48("115883");
                  const errorMessage = (stryMutAct_9fa48("115886") ? typeof error?.message === 'string' || error.message.length > NUM.ZERO : stryMutAct_9fa48("115885") ? false : stryMutAct_9fa48("115884") ? true : (stryCov_9fa48("115884", "115885", "115886"), (stryMutAct_9fa48("115888") ? typeof error?.message !== 'string' : stryMutAct_9fa48("115887") ? true : (stryCov_9fa48("115887", "115888"), typeof (stryMutAct_9fa48("115889") ? error.message : (stryCov_9fa48("115889"), error?.message)) === (stryMutAct_9fa48("115890") ? "" : (stryCov_9fa48("115890"), 'string')))) && (stryMutAct_9fa48("115893") ? error.message.length <= NUM.ZERO : stryMutAct_9fa48("115892") ? error.message.length >= NUM.ZERO : stryMutAct_9fa48("115891") ? true : (stryCov_9fa48("115891", "115892", "115893"), error.message.length > NUM.ZERO)))) ? error.message : ERRORS.QUERY_FAILED;
                  if (stryMutAct_9fa48("115895") ? false : stryMutAct_9fa48("115894") ? true : (stryCov_9fa48("115894", "115895"), this.isNoHandlerFailure(errorMessage))) {
                    if (stryMutAct_9fa48("115896")) {
                      {}
                    } else {
                      stryCov_9fa48("115896");
                      const witnessedService = this.findRoutingSnapshotService(routingSnapshot, serviceInfo, address);
                      this.logger.warn(QUERY_LOG_MSG.NO_HANDLER_FOR_PARTITION, stryMutAct_9fa48("115897") ? {} : (stryCov_9fa48("115897"), {
                        partitionId,
                        address
                      }));
                      this.markTemporarilyUnroutableAddress(partitionId, address, witnessedService);
                      if (stryMutAct_9fa48("115900") ? this.getSessionPartitionAddress(executionOptions.sessionId, partitionId) !== address : stryMutAct_9fa48("115899") ? false : stryMutAct_9fa48("115898") ? true : (stryCov_9fa48("115898", "115899", "115900"), this.getSessionPartitionAddress(executionOptions.sessionId, partitionId) === address)) {
                        if (stryMutAct_9fa48("115901")) {
                          {}
                        } else {
                          stryCov_9fa48("115901");
                          this.clearSessionPartitionAddress(executionOptions.sessionId, partitionId);
                        }
                      }
                      if (stryMutAct_9fa48("115904") ? !awaitedRuntimeRoutingRepair || (await this.maybeAwaitRuntimeRoutingRepair(routingSnapshot, {
                        partitionId,
                        participantNodeId: serviceInfo?.nodeId || null,
                        routingReadinessDimension,
                        allowReadinessAuthoritativeRefresh,
                        refreshReason: QUERY_ROUTING_REPAIR_REASON.NO_HANDLER_STALE_SERVICE
                      })) : stryMutAct_9fa48("115903") ? false : stryMutAct_9fa48("115902") ? true : (stryCov_9fa48("115902", "115903", "115904"), (stryMutAct_9fa48("115905") ? awaitedRuntimeRoutingRepair : (stryCov_9fa48("115905"), !awaitedRuntimeRoutingRepair)) && (await this.maybeAwaitRuntimeRoutingRepair(routingSnapshot, stryMutAct_9fa48("115906") ? {} : (stryCov_9fa48("115906"), {
                        partitionId,
                        participantNodeId: stryMutAct_9fa48("115909") ? serviceInfo?.nodeId && null : stryMutAct_9fa48("115908") ? false : stryMutAct_9fa48("115907") ? true : (stryCov_9fa48("115907", "115908", "115909"), (stryMutAct_9fa48("115910") ? serviceInfo.nodeId : (stryCov_9fa48("115910"), serviceInfo?.nodeId)) || null),
                        routingReadinessDimension,
                        allowReadinessAuthoritativeRefresh,
                        refreshReason: QUERY_ROUTING_REPAIR_REASON.NO_HANDLER_STALE_SERVICE
                      }))))) {
                        if (stryMutAct_9fa48("115911")) {
                          {}
                        } else {
                          stryCov_9fa48("115911");
                          awaitedRuntimeRoutingRepair = stryMutAct_9fa48("115912") ? false : (stryCov_9fa48("115912"), true);
                          const refreshedResolution = this.resolvePartitionServiceCandidates(partitionId, forRead, preferLeader, preferSameLatencyGroup, routingReadinessDimension, stryMutAct_9fa48("115913") ? {} : (stryCov_9fa48("115913"), {
                            allowReadinessAuthoritativeRefresh
                          }));
                          routingSnapshot = refreshedResolution.routingSnapshot;
                          const refreshedRecoveryCandidates = this.getLeaderRecoveryCandidates(routingSnapshot, attemptedAddresses, preferSameLatencyGroup);
                          if (stryMutAct_9fa48("115917") ? refreshedRecoveryCandidates.length <= NUM.ZERO : stryMutAct_9fa48("115916") ? refreshedRecoveryCandidates.length >= NUM.ZERO : stryMutAct_9fa48("115915") ? false : stryMutAct_9fa48("115914") ? true : (stryCov_9fa48("115914", "115915", "115916", "115917"), refreshedRecoveryCandidates.length > NUM.ZERO)) {
                            if (stryMutAct_9fa48("115918")) {
                              {}
                            } else {
                              stryCov_9fa48("115918");
                              candidateQueue.push(...refreshedRecoveryCandidates);
                            }
                          }
                        }
                      }
                      recordCandidateFailure(errorMessage, error, stryMutAct_9fa48("115919") ? serviceInfo.nodeId : (stryCov_9fa48("115919"), serviceInfo?.nodeId), address);
                      if (stryMutAct_9fa48("115922") ? false : stryMutAct_9fa48("115921") ? true : stryMutAct_9fa48("115920") ? forRead : (stryCov_9fa48("115920", "115921", "115922"), !forRead)) {
                        if (stryMutAct_9fa48("115923")) {
                          {}
                        } else {
                          stryCov_9fa48("115923");
                          if (stryMutAct_9fa48("115926") ? this.getSessionPartitionAddress(executionOptions.sessionId, partitionId) !== address : stryMutAct_9fa48("115925") ? false : stryMutAct_9fa48("115924") ? true : (stryCov_9fa48("115924", "115925", "115926"), this.getSessionPartitionAddress(executionOptions.sessionId, partitionId) === address)) {
                            if (stryMutAct_9fa48("115927")) {
                              {}
                            } else {
                              stryCov_9fa48("115927");
                              this.clearSessionPartitionAddress(executionOptions.sessionId, partitionId);
                            }
                          }
                          queueLeaderRecoveryCandidates();
                        }
                      }
                      continue;
                    }
                  }
                  if (stryMutAct_9fa48("115930") ? !forRead || this.isLeaderUnavailable(errorMessage, error?.code || error?.errorCode) : stryMutAct_9fa48("115929") ? false : stryMutAct_9fa48("115928") ? true : (stryCov_9fa48("115928", "115929", "115930"), (stryMutAct_9fa48("115931") ? forRead : (stryCov_9fa48("115931"), !forRead)) && this.isLeaderUnavailable(errorMessage, stryMutAct_9fa48("115934") ? error?.code && error?.errorCode : stryMutAct_9fa48("115933") ? false : stryMutAct_9fa48("115932") ? true : (stryCov_9fa48("115932", "115933", "115934"), (stryMutAct_9fa48("115935") ? error.code : (stryCov_9fa48("115935"), error?.code)) || (stryMutAct_9fa48("115936") ? error.errorCode : (stryCov_9fa48("115936"), error?.errorCode)))))) {
                    if (stryMutAct_9fa48("115937")) {
                      {}
                    } else {
                      stryCov_9fa48("115937");
                      recordCandidateFailure(errorMessage, error, stryMutAct_9fa48("115938") ? serviceInfo.nodeId : (stryCov_9fa48("115938"), serviceInfo?.nodeId), address);
                      if (stryMutAct_9fa48("115941") ? this.getSessionPartitionAddress(executionOptions.sessionId, partitionId) !== address : stryMutAct_9fa48("115940") ? false : stryMutAct_9fa48("115939") ? true : (stryCov_9fa48("115939", "115940", "115941"), this.getSessionPartitionAddress(executionOptions.sessionId, partitionId) === address)) {
                        if (stryMutAct_9fa48("115942")) {
                          {}
                        } else {
                          stryCov_9fa48("115942");
                          this.clearSessionPartitionAddress(executionOptions.sessionId, partitionId);
                        }
                      }
                      queueLeaderRecoveryCandidates();
                      continue;
                    }
                  }
                  if (stryMutAct_9fa48("115944") ? false : stryMutAct_9fa48("115943") ? true : (stryCov_9fa48("115943", "115944"), this.isRetryableControlPlaneWriteFailure(partitionId, error, forRead))) {
                    if (stryMutAct_9fa48("115945")) {
                      {}
                    } else {
                      stryCov_9fa48("115945");
                      recordCandidateFailure(errorMessage, error, stryMutAct_9fa48("115946") ? serviceInfo.nodeId : (stryCov_9fa48("115946"), serviceInfo?.nodeId), address);
                      if (stryMutAct_9fa48("115948") ? false : stryMutAct_9fa48("115947") ? true : (stryCov_9fa48("115947", "115948"), this.shouldRetryTransactionActiveWriteOnSameAddress(partitionId, executionOptions, error, forRead))) {
                        if (stryMutAct_9fa48("115949")) {
                          {}
                        } else {
                          stryCov_9fa48("115949");
                          requestRetryCurrentAddress();
                          break;
                        }
                      }
                      queueLeaderRecoveryCandidates();
                      continue;
                    }
                  }

                  // §1.12: For reads, catch transient transport errors
                  // and try the next candidate.
                  if (stryMutAct_9fa48("115951") ? false : stryMutAct_9fa48("115950") ? true : (stryCov_9fa48("115950", "115951"), forRead)) {
                    if (stryMutAct_9fa48("115952")) {
                      {}
                    } else {
                      stryCov_9fa48("115952");
                      this.logger.debug(QUERY_LOG_MSG.READ_CANDIDATE_TRANSIENT_FAILURE, stryMutAct_9fa48("115953") ? {} : (stryCov_9fa48("115953"), {
                        partitionId,
                        address,
                        error: errorMessage
                      }));
                      recordCandidateFailure(errorMessage, error, stryMutAct_9fa48("115954") ? serviceInfo.nodeId : (stryCov_9fa48("115954"), serviceInfo?.nodeId), address);
                      continue;
                    }
                  }
                  this.logger.error(QUERY_LOG_MSG.QUERY_ROUTING_FAILED, stryMutAct_9fa48("115955") ? {} : (stryCov_9fa48("115955"), {
                    partitionId,
                    address,
                    error: errorMessage
                  }));
                  throw error;
                }
              }
            }
          }
          if (stryMutAct_9fa48("115957") ? false : stryMutAct_9fa48("115956") ? true : (stryCov_9fa48("115956", "115957"), retryCurrentAddressOnNextAttempt)) {
            if (stryMutAct_9fa48("115958")) {
              {}
            } else {
              stryCov_9fa48("115958");
              if (stryMutAct_9fa48("115962") ? attempt >= maxAttempts : stryMutAct_9fa48("115961") ? attempt <= maxAttempts : stryMutAct_9fa48("115960") ? false : stryMutAct_9fa48("115959") ? true : (stryCov_9fa48("115959", "115960", "115961", "115962"), attempt < maxAttempts)) {
                if (stryMutAct_9fa48("115963")) {
                  {}
                } else {
                  stryCov_9fa48("115963");
                  await this.delay(this.leaderRetryDelayMs);
                  this.throwIfCancelled(cancellationToken);
                  continue;
                }
              }
              return stryMutAct_9fa48("115964") ? {} : (stryCov_9fa48("115964"), {
                ...buildFailureResult(stryMutAct_9fa48("115967") ? lastError && ERRORS.QUERY_FAILED : stryMutAct_9fa48("115966") ? false : stryMutAct_9fa48("115965") ? true : (stryCov_9fa48("115965", "115966", "115967"), lastError || ERRORS.QUERY_FAILED), lastFailureDetails)
              });
            }
          }
          if (stryMutAct_9fa48("115971") ? attempt >= maxAttempts : stryMutAct_9fa48("115970") ? attempt <= maxAttempts : stryMutAct_9fa48("115969") ? false : stryMutAct_9fa48("115968") ? true : (stryCov_9fa48("115968", "115969", "115970", "115971"), attempt < maxAttempts)) {
            if (stryMutAct_9fa48("115972")) {
              {}
            } else {
              stryCov_9fa48("115972");
              await this.delay(this.leaderRetryDelayMs);
              this.throwIfCancelled(cancellationToken);
            }
          }
        }
      }
      return stryMutAct_9fa48("115973") ? {} : (stryCov_9fa48("115973"), {
        ...buildFailureResult(stryMutAct_9fa48("115976") ? lastError && ERRORS.QUERY_FAILED : stryMutAct_9fa48("115975") ? false : stryMutAct_9fa48("115974") ? true : (stryCov_9fa48("115974", "115975", "115976"), lastError || ERRORS.QUERY_FAILED), lastFailureDetails)
      });
    }
  }

  /**
   * Queue alternative live replica targets after the canonical leader path has
   * been disproven at runtime.
   * @param {Object|null} routingSnapshot
   * @param {Set<string>} attemptedAddresses
   * @param {boolean} preferSameLatencyGroup
   * @return {Array<Object>}
   * @private
   */
  getLeaderRecoveryCandidates(routingSnapshot, attemptedAddresses = new Set(), preferSameLatencyGroup = stryMutAct_9fa48("115977") ? true : (stryCov_9fa48("115977"), false)) {
    if (stryMutAct_9fa48("115978")) {
      {}
    } else {
      stryCov_9fa48("115978");
      const routableServices = Array.isArray(stryMutAct_9fa48("115979") ? routingSnapshot.routableServices : (stryCov_9fa48("115979"), routingSnapshot?.routableServices)) ? routingSnapshot.routableServices : stryMutAct_9fa48("115980") ? ["Stryker was here"] : (stryCov_9fa48("115980"), []);
      const localGroupId = this.resolveNodeLatencyGroupId(this.nodeId);
      const orderedServices = this.orderServicesByLatencyGroup(routableServices, localGroupId, preferSameLatencyGroup);
      const candidates = stryMutAct_9fa48("115981") ? ["Stryker was here"] : (stryCov_9fa48("115981"), []);
      const seen = new Set();
      for (const service of orderedServices) {
        if (stryMutAct_9fa48("115982")) {
          {}
        } else {
          stryCov_9fa48("115982");
          const address = stryMutAct_9fa48("115983") ? service.address : (stryCov_9fa48("115983"), service?.address);
          if (stryMutAct_9fa48("115986") ? (typeof address !== QUERY_EXECUTOR_LITERAL.STRING_STRING || address.length === NUM.ZERO || this.isTemporarilyUnroutableAddress(routingSnapshot?.partitionId || null, address, service)) && attemptedAddresses.has(address) : stryMutAct_9fa48("115985") ? false : stryMutAct_9fa48("115984") ? true : (stryCov_9fa48("115984", "115985", "115986"), (stryMutAct_9fa48("115988") ? (typeof address !== QUERY_EXECUTOR_LITERAL.STRING_STRING || address.length === NUM.ZERO) && this.isTemporarilyUnroutableAddress(routingSnapshot?.partitionId || null, address, service) : stryMutAct_9fa48("115987") ? false : (stryCov_9fa48("115987", "115988"), (stryMutAct_9fa48("115990") ? typeof address !== QUERY_EXECUTOR_LITERAL.STRING_STRING && address.length === NUM.ZERO : stryMutAct_9fa48("115989") ? false : (stryCov_9fa48("115989", "115990"), (stryMutAct_9fa48("115992") ? typeof address === QUERY_EXECUTOR_LITERAL.STRING_STRING : stryMutAct_9fa48("115991") ? false : (stryCov_9fa48("115991", "115992"), typeof address !== QUERY_EXECUTOR_LITERAL.STRING_STRING)) || (stryMutAct_9fa48("115994") ? address.length !== NUM.ZERO : stryMutAct_9fa48("115993") ? false : (stryCov_9fa48("115993", "115994"), address.length === NUM.ZERO)))) || this.isTemporarilyUnroutableAddress(stryMutAct_9fa48("115997") ? routingSnapshot?.partitionId && null : stryMutAct_9fa48("115996") ? false : stryMutAct_9fa48("115995") ? true : (stryCov_9fa48("115995", "115996", "115997"), (stryMutAct_9fa48("115998") ? routingSnapshot.partitionId : (stryCov_9fa48("115998"), routingSnapshot?.partitionId)) || null), address, service))) || attemptedAddresses.has(address))) {
            if (stryMutAct_9fa48("115999")) {
              {}
            } else {
              stryCov_9fa48("115999");
              continue;
            }
          }
          const dedupeKey = stryMutAct_9fa48("116002") ? (service.service_id || service.replica_id) && address : stryMutAct_9fa48("116001") ? false : stryMutAct_9fa48("116000") ? true : (stryCov_9fa48("116000", "116001", "116002"), (stryMutAct_9fa48("116004") ? service.service_id && service.replica_id : stryMutAct_9fa48("116003") ? false : (stryCov_9fa48("116003", "116004"), service.service_id || service.replica_id)) || address);
          if (stryMutAct_9fa48("116007") ? !dedupeKey && seen.has(dedupeKey) : stryMutAct_9fa48("116006") ? false : stryMutAct_9fa48("116005") ? true : (stryCov_9fa48("116005", "116006", "116007"), (stryMutAct_9fa48("116008") ? dedupeKey : (stryCov_9fa48("116008"), !dedupeKey)) || seen.has(dedupeKey))) {
            if (stryMutAct_9fa48("116009")) {
              {}
            } else {
              stryCov_9fa48("116009");
              continue;
            }
          }
          seen.add(dedupeKey);
          candidates.push(stryMutAct_9fa48("116010") ? {} : (stryCov_9fa48("116010"), {
            address,
            nodeId: service.node_id,
            replicaId: stryMutAct_9fa48("116013") ? service.service_id && service.replica_id : stryMutAct_9fa48("116012") ? false : stryMutAct_9fa48("116011") ? true : (stryCov_9fa48("116011", "116012", "116013"), service.service_id || service.replica_id)
          }));
        }
      }
      return candidates;
    }
  }

  /**
   * Collect node IDs that should be refreshed when runtime routing disproves
   * local partition-service metadata.
   * @param {Object|null} routingSnapshot
   * @param {string|null} participantNodeId
   * @return {Array<string>}
   * @private
   */
  collectRuntimeRoutingRepairNodeIds(routingSnapshot, participantNodeId = null) {
    if (stryMutAct_9fa48("116014")) {
      {}
    } else {
      stryCov_9fa48("116014");
      const repairNodeIds = stryMutAct_9fa48("116015") ? ["Stryker was here"] : (stryCov_9fa48("116015"), []);
      const seen = new Set();
      const addNodeId = nodeId => {
        if (stryMutAct_9fa48("116016")) {
          {}
        } else {
          stryCov_9fa48("116016");
          if (stryMutAct_9fa48("116019") ? (typeof nodeId !== 'string' || nodeId.length === NUM.ZERO) && seen.has(nodeId) : stryMutAct_9fa48("116018") ? false : stryMutAct_9fa48("116017") ? true : (stryCov_9fa48("116017", "116018", "116019"), (stryMutAct_9fa48("116021") ? typeof nodeId !== 'string' && nodeId.length === NUM.ZERO : stryMutAct_9fa48("116020") ? false : (stryCov_9fa48("116020", "116021"), (stryMutAct_9fa48("116023") ? typeof nodeId === 'string' : stryMutAct_9fa48("116022") ? false : (stryCov_9fa48("116022", "116023"), typeof nodeId !== (stryMutAct_9fa48("116024") ? "" : (stryCov_9fa48("116024"), 'string')))) || (stryMutAct_9fa48("116026") ? nodeId.length !== NUM.ZERO : stryMutAct_9fa48("116025") ? false : (stryCov_9fa48("116025", "116026"), nodeId.length === NUM.ZERO)))) || seen.has(nodeId))) {
            if (stryMutAct_9fa48("116027")) {
              {}
            } else {
              stryCov_9fa48("116027");
              return;
            }
          }
          seen.add(nodeId);
          repairNodeIds.push(nodeId);
        }
      };
      addNodeId(participantNodeId);
      addNodeId(stryMutAct_9fa48("116030") ? routingSnapshot?.canonicalLeaderNodeId && null : stryMutAct_9fa48("116029") ? false : stryMutAct_9fa48("116028") ? true : (stryCov_9fa48("116028", "116029", "116030"), (stryMutAct_9fa48("116031") ? routingSnapshot.canonicalLeaderNodeId : (stryCov_9fa48("116031"), routingSnapshot?.canonicalLeaderNodeId)) || null));
      return repairNodeIds;
    }
  }

  /**
   * Await one authoritative node/service refresh when runtime routing shows a
   * stale service address (for example, no handler at a cached partition
   * service endpoint).
   * @param {Object|null} routingSnapshot
   * @param {Object} [options]
   * @return {Promise<boolean>}
   * @private
   */
  async maybeAwaitRuntimeRoutingRepair(routingSnapshot, options = {}) {
    if (stryMutAct_9fa48("116032")) {
      {}
    } else {
      stryCov_9fa48("116032");
      const allowReadinessAuthoritativeRefresh = this.shouldAllowRoutingAuthoritativeRefresh(options);
      const routingReadinessDimension = stryMutAct_9fa48("116035") ? (options.routingReadinessDimension || routingSnapshot?.routingReadinessDimension) && this.defaultRoutingReadinessDimension : stryMutAct_9fa48("116034") ? false : stryMutAct_9fa48("116033") ? true : (stryCov_9fa48("116033", "116034", "116035"), (stryMutAct_9fa48("116037") ? options.routingReadinessDimension && routingSnapshot?.routingReadinessDimension : stryMutAct_9fa48("116036") ? false : (stryCov_9fa48("116036", "116037"), options.routingReadinessDimension || (stryMutAct_9fa48("116038") ? routingSnapshot.routingReadinessDimension : (stryCov_9fa48("116038"), routingSnapshot?.routingReadinessDimension)))) || this.defaultRoutingReadinessDimension);
      let repaired = stryMutAct_9fa48("116039") ? true : (stryCov_9fa48("116039"), false);
      if (stryMutAct_9fa48("116042") ? allowReadinessAuthoritativeRefresh && this.controlPlaneReadinessService || typeof this.controlPlaneReadinessService.getNodeReadiness === QUERY_EXECUTOR_LITERAL.STRING_FUNCTION : stryMutAct_9fa48("116041") ? false : stryMutAct_9fa48("116040") ? true : (stryCov_9fa48("116040", "116041", "116042"), (stryMutAct_9fa48("116044") ? allowReadinessAuthoritativeRefresh || this.controlPlaneReadinessService : stryMutAct_9fa48("116043") ? true : (stryCov_9fa48("116043", "116044"), allowReadinessAuthoritativeRefresh && this.controlPlaneReadinessService)) && (stryMutAct_9fa48("116046") ? typeof this.controlPlaneReadinessService.getNodeReadiness !== QUERY_EXECUTOR_LITERAL.STRING_FUNCTION : stryMutAct_9fa48("116045") ? true : (stryCov_9fa48("116045", "116046"), typeof this.controlPlaneReadinessService.getNodeReadiness === QUERY_EXECUTOR_LITERAL.STRING_FUNCTION)))) {
        if (stryMutAct_9fa48("116047")) {
          {}
        } else {
          stryCov_9fa48("116047");
          const repairNodeIds = this.collectRuntimeRoutingRepairNodeIds(routingSnapshot, stryMutAct_9fa48("116050") ? options.participantNodeId && null : stryMutAct_9fa48("116049") ? false : stryMutAct_9fa48("116048") ? true : (stryCov_9fa48("116048", "116049", "116050"), options.participantNodeId || null));
          if (stryMutAct_9fa48("116054") ? repairNodeIds.length <= NUM.ZERO : stryMutAct_9fa48("116053") ? repairNodeIds.length >= NUM.ZERO : stryMutAct_9fa48("116052") ? false : stryMutAct_9fa48("116051") ? true : (stryCov_9fa48("116051", "116052", "116053", "116054"), repairNodeIds.length > NUM.ZERO)) {
            if (stryMutAct_9fa48("116055")) {
              {}
            } else {
              stryCov_9fa48("116055");
              await Promise.all(repairNodeIds.map(async nodeId => {
                if (stryMutAct_9fa48("116056")) {
                  {}
                } else {
                  stryCov_9fa48("116056");
                  try {
                    if (stryMutAct_9fa48("116057")) {
                      {}
                    } else {
                      stryCov_9fa48("116057");
                      await this.controlPlaneReadinessService.getNodeReadiness(nodeId, stryMutAct_9fa48("116058") ? {} : (stryCov_9fa48("116058"), {
                        allowAuthoritativeRefresh: stryMutAct_9fa48("116059") ? false : (stryCov_9fa48("116059"), true),
                        requireFreshOnIneligible: stryMutAct_9fa48("116060") ? false : (stryCov_9fa48("116060"), true),
                        forceAuthoritativeRefresh: stryMutAct_9fa48("116061") ? false : (stryCov_9fa48("116061"), true),
                        maxCachedAgeMs: NUM.ZERO,
                        decisionDimension: routingReadinessDimension,
                        refreshReason: stryMutAct_9fa48("116064") ? options.refreshReason && QUERY_ROUTING_REPAIR_REASON.NO_HANDLER_STALE_SERVICE : stryMutAct_9fa48("116063") ? false : stryMutAct_9fa48("116062") ? true : (stryCov_9fa48("116062", "116063", "116064"), options.refreshReason || QUERY_ROUTING_REPAIR_REASON.NO_HANDLER_STALE_SERVICE)
                      }));
                      repaired = stryMutAct_9fa48("116065") ? false : (stryCov_9fa48("116065"), true);
                    }
                  } catch (_error) {
                    if (stryMutAct_9fa48("116066")) {
                      {}
                    } else {
                      stryCov_9fa48("116066");
                      return null;
                    }
                  }
                  return null;
                }
              }));
            }
          }
        }
      }
      const routingOverlay = this.routingMetadataOverlay;
      if (stryMutAct_9fa48("116069") ? routingOverlay || typeof routingOverlay.refreshPartitionRouting === QUERY_EXECUTOR_LITERAL.STRING_FUNCTION : stryMutAct_9fa48("116068") ? false : stryMutAct_9fa48("116067") ? true : (stryCov_9fa48("116067", "116068", "116069"), routingOverlay && (stryMutAct_9fa48("116071") ? typeof routingOverlay.refreshPartitionRouting !== QUERY_EXECUTOR_LITERAL.STRING_FUNCTION : stryMutAct_9fa48("116070") ? true : (stryCov_9fa48("116070", "116071"), typeof routingOverlay.refreshPartitionRouting === QUERY_EXECUTOR_LITERAL.STRING_FUNCTION)))) {
        if (stryMutAct_9fa48("116072")) {
          {}
        } else {
          stryCov_9fa48("116072");
          const overlayRepaired = await this.refreshRoutingMetadataOverlay(routingSnapshot, stryMutAct_9fa48("116073") ? {} : (stryCov_9fa48("116073"), {
            partitionId: options.partitionId,
            participantNodeId: stryMutAct_9fa48("116076") ? options.participantNodeId && null : stryMutAct_9fa48("116075") ? false : stryMutAct_9fa48("116074") ? true : (stryCov_9fa48("116074", "116075", "116076"), options.participantNodeId || null),
            routingReadinessDimension,
            refreshReason: stryMutAct_9fa48("116079") ? options.refreshReason && QUERY_ROUTING_REPAIR_REASON.NO_HANDLER_STALE_SERVICE : stryMutAct_9fa48("116078") ? false : stryMutAct_9fa48("116077") ? true : (stryCov_9fa48("116077", "116078", "116079"), options.refreshReason || QUERY_ROUTING_REPAIR_REASON.NO_HANDLER_STALE_SERVICE)
          }));
          repaired = stryMutAct_9fa48("116082") ? overlayRepaired === true && repaired : stryMutAct_9fa48("116081") ? false : stryMutAct_9fa48("116080") ? true : (stryCov_9fa48("116080", "116081", "116082"), (stryMutAct_9fa48("116084") ? overlayRepaired !== true : stryMutAct_9fa48("116083") ? false : (stryCov_9fa48("116083", "116084"), overlayRepaired === (stryMutAct_9fa48("116085") ? false : (stryCov_9fa48("116085"), true)))) || repaired);
        }
      }
      return repaired;
    }
  }

  /**
   * Refresh authoritative overlay service metadata for one partition.
   * @param {Object|null} routingSnapshot
   * @param {Object} [options]
   * @return {Promise<boolean>}
   * @private
   */
  async refreshRoutingMetadataOverlay(routingSnapshot, options = {}) {
    if (stryMutAct_9fa48("116086")) {
      {}
    } else {
      stryCov_9fa48("116086");
      const routingOverlay = this.routingMetadataOverlay;
      if (stryMutAct_9fa48("116089") ? !routingOverlay && typeof routingOverlay.refreshPartitionRouting !== QUERY_EXECUTOR_LITERAL.STRING_FUNCTION : stryMutAct_9fa48("116088") ? false : stryMutAct_9fa48("116087") ? true : (stryCov_9fa48("116087", "116088", "116089"), (stryMutAct_9fa48("116090") ? routingOverlay : (stryCov_9fa48("116090"), !routingOverlay)) || (stryMutAct_9fa48("116092") ? typeof routingOverlay.refreshPartitionRouting === QUERY_EXECUTOR_LITERAL.STRING_FUNCTION : stryMutAct_9fa48("116091") ? false : (stryCov_9fa48("116091", "116092"), typeof routingOverlay.refreshPartitionRouting !== QUERY_EXECUTOR_LITERAL.STRING_FUNCTION)))) {
        if (stryMutAct_9fa48("116093")) {
          {}
        } else {
          stryCov_9fa48("116093");
          return stryMutAct_9fa48("116094") ? true : (stryCov_9fa48("116094"), false);
        }
      }
      const partitionId = (stryMutAct_9fa48("116097") ? typeof options.partitionId === 'string' || options.partitionId.length > NUM.ZERO : stryMutAct_9fa48("116096") ? false : stryMutAct_9fa48("116095") ? true : (stryCov_9fa48("116095", "116096", "116097"), (stryMutAct_9fa48("116099") ? typeof options.partitionId !== 'string' : stryMutAct_9fa48("116098") ? true : (stryCov_9fa48("116098", "116099"), typeof options.partitionId === (stryMutAct_9fa48("116100") ? "" : (stryCov_9fa48("116100"), 'string')))) && (stryMutAct_9fa48("116103") ? options.partitionId.length <= NUM.ZERO : stryMutAct_9fa48("116102") ? options.partitionId.length >= NUM.ZERO : stryMutAct_9fa48("116101") ? true : (stryCov_9fa48("116101", "116102", "116103"), options.partitionId.length > NUM.ZERO)))) ? options.partitionId : stryMutAct_9fa48("116106") ? routingSnapshot?.partitionId && null : stryMutAct_9fa48("116105") ? false : stryMutAct_9fa48("116104") ? true : (stryCov_9fa48("116104", "116105", "116106"), (stryMutAct_9fa48("116107") ? routingSnapshot.partitionId : (stryCov_9fa48("116107"), routingSnapshot?.partitionId)) || null);
      if (stryMutAct_9fa48("116110") ? typeof partitionId !== QUERY_EXECUTOR_LITERAL.STRING_STRING && partitionId.length === NUM.ZERO : stryMutAct_9fa48("116109") ? false : stryMutAct_9fa48("116108") ? true : (stryCov_9fa48("116108", "116109", "116110"), (stryMutAct_9fa48("116112") ? typeof partitionId === QUERY_EXECUTOR_LITERAL.STRING_STRING : stryMutAct_9fa48("116111") ? false : (stryCov_9fa48("116111", "116112"), typeof partitionId !== QUERY_EXECUTOR_LITERAL.STRING_STRING)) || (stryMutAct_9fa48("116114") ? partitionId.length !== NUM.ZERO : stryMutAct_9fa48("116113") ? false : (stryCov_9fa48("116113", "116114"), partitionId.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("116115")) {
          {}
        } else {
          stryCov_9fa48("116115");
          return stryMutAct_9fa48("116116") ? true : (stryCov_9fa48("116116"), false);
        }
      }
      const routingReadinessDimension = stryMutAct_9fa48("116119") ? (options.routingReadinessDimension || routingSnapshot?.routingReadinessDimension) && this.defaultRoutingReadinessDimension : stryMutAct_9fa48("116118") ? false : stryMutAct_9fa48("116117") ? true : (stryCov_9fa48("116117", "116118", "116119"), (stryMutAct_9fa48("116121") ? options.routingReadinessDimension && routingSnapshot?.routingReadinessDimension : stryMutAct_9fa48("116120") ? false : (stryCov_9fa48("116120", "116121"), options.routingReadinessDimension || (stryMutAct_9fa48("116122") ? routingSnapshot.routingReadinessDimension : (stryCov_9fa48("116122"), routingSnapshot?.routingReadinessDimension)))) || this.defaultRoutingReadinessDimension);
      try {
        if (stryMutAct_9fa48("116123")) {
          {}
        } else {
          stryCov_9fa48("116123");
          return stryMutAct_9fa48("116126") ? (await routingOverlay.refreshPartitionRouting(partitionId, {
            partitionId,
            participantNodeId: options.participantNodeId || null,
            routingReadinessDimension,
            routingSnapshot,
            refreshReason: options.refreshReason || QUERY_ROUTING_REPAIR_REASON.NO_HANDLER_STALE_SERVICE
          })) !== true : stryMutAct_9fa48("116125") ? false : stryMutAct_9fa48("116124") ? true : (stryCov_9fa48("116124", "116125", "116126"), (await routingOverlay.refreshPartitionRouting(partitionId, stryMutAct_9fa48("116127") ? {} : (stryCov_9fa48("116127"), {
            partitionId,
            participantNodeId: stryMutAct_9fa48("116130") ? options.participantNodeId && null : stryMutAct_9fa48("116129") ? false : stryMutAct_9fa48("116128") ? true : (stryCov_9fa48("116128", "116129", "116130"), options.participantNodeId || null),
            routingReadinessDimension,
            routingSnapshot,
            refreshReason: stryMutAct_9fa48("116133") ? options.refreshReason && QUERY_ROUTING_REPAIR_REASON.NO_HANDLER_STALE_SERVICE : stryMutAct_9fa48("116132") ? false : stryMutAct_9fa48("116131") ? true : (stryCov_9fa48("116131", "116132", "116133"), options.refreshReason || QUERY_ROUTING_REPAIR_REASON.NO_HANDLER_STALE_SERVICE)
          }))) === (stryMutAct_9fa48("116134") ? false : (stryCov_9fa48("116134"), true)));
        }
      } catch (_error) {
        if (stryMutAct_9fa48("116135")) {
          {}
        } else {
          stryCov_9fa48("116135");
          return stryMutAct_9fa48("116136") ? true : (stryCov_9fa48("116136"), false);
        }
      }
    }
  }

  /**
   * Authoritative owner-RPC reads must not recurse back into routing-triggered
   * readiness repair, or the repair path can re-enter itself through query
   * routing.
   * @param {Object} [options={}]
   * @return {boolean}
   * @private
   */
  shouldAllowRoutingAuthoritativeRefresh(options = {}) {
    if (stryMutAct_9fa48("116137")) {
      {}
    } else {
      stryCov_9fa48("116137");
      return stryMutAct_9fa48("116140") ? options?.allowReadinessAuthoritativeRefresh === false : stryMutAct_9fa48("116139") ? false : stryMutAct_9fa48("116138") ? true : (stryCov_9fa48("116138", "116139", "116140"), (stryMutAct_9fa48("116141") ? options.allowReadinessAuthoritativeRefresh : (stryCov_9fa48("116141"), options?.allowReadinessAuthoritativeRefresh)) !== (stryMutAct_9fa48("116142") ? true : (stryCov_9fa48("116142"), false)));
    }
  }

  /**
   * Get write retry attempt limit for transient leader-election gaps.
   * @return {number} Maximum attempts.
   * @private
   */
  getWriteRetryAttemptLimit() {
    if (stryMutAct_9fa48("116143")) {
      {}
    } else {
      stryCov_9fa48("116143");
      const maxRecoveryAttempts = stryMutAct_9fa48("116144") ? NUM.TEN / NUM.FOUR : (stryCov_9fa48("116144"), NUM.TEN * NUM.FOUR);
      const retryDelayMs = stryMutAct_9fa48("116145") ? Math.min(this.leaderRetryDelayMs || NUM.ZERO, NUM.ONE) : (stryCov_9fa48("116145"), Math.max(stryMutAct_9fa48("116148") ? this.leaderRetryDelayMs && NUM.ZERO : stryMutAct_9fa48("116147") ? false : stryMutAct_9fa48("116146") ? true : (stryCov_9fa48("116146", "116147", "116148"), this.leaderRetryDelayMs || NUM.ZERO), NUM.ONE));
      const timeoutBoundAttempts = Math.ceil(stryMutAct_9fa48("116149") ? this.queryTimeoutMs * retryDelayMs : (stryCov_9fa48("116149"), this.queryTimeoutMs / retryDelayMs));
      const boundedAttempts = stryMutAct_9fa48("116150") ? Math.max(timeoutBoundAttempts, maxRecoveryAttempts) : (stryCov_9fa48("116150"), Math.min(timeoutBoundAttempts, maxRecoveryAttempts));
      return stryMutAct_9fa48("116151") ? Math.min(this.leaderRetryAttempts, boundedAttempts) : (stryCov_9fa48("116151"), Math.max(this.leaderRetryAttempts, boundedAttempts));
    }
  }

  /**
   * Get read retry attempt limit for transient topology gaps.
   * §1.10/§1.12: Reads get bounded retries so transient failures
   * during topology transitions (splits, rebalance) can be
   * recovered by trying the next candidate or waiting for routing
   * repair.
   * @return {number} Maximum attempts.
   * @private
   */
  getReadRetryAttemptLimit() {
    if (stryMutAct_9fa48("116152")) {
      {}
    } else {
      stryCov_9fa48("116152");
      return this.readRetryAttempts;
    }
  }

  /**
   * Check if an error represents a stale no-handler transport witness.
   * @param {string} errorMessage - Error message.
   * @return {boolean}
   * @private
   */
  isNoHandlerFailure(errorMessage) {
    if (stryMutAct_9fa48("116153")) {
      {}
    } else {
      stryCov_9fa48("116153");
      return stryMutAct_9fa48("116156") ? typeof errorMessage === QUERY_EXECUTOR_LITERAL.STRING_STRING || errorMessage.includes(ERRORS.NO_HANDLER_FOR_ADDRESS) : stryMutAct_9fa48("116155") ? false : stryMutAct_9fa48("116154") ? true : (stryCov_9fa48("116154", "116155", "116156"), (stryMutAct_9fa48("116158") ? typeof errorMessage !== QUERY_EXECUTOR_LITERAL.STRING_STRING : stryMutAct_9fa48("116157") ? true : (stryCov_9fa48("116157", "116158"), typeof errorMessage === QUERY_EXECUTOR_LITERAL.STRING_STRING)) && errorMessage.includes(ERRORS.NO_HANDLER_FOR_ADDRESS));
    }
  }

  /**
   * Check if an error indicates missing partition leadership.
   * @param {string} errorMessage - Error message.
   * @return {boolean} True if leader is unavailable.
   * @private
   */
  isLeaderUnavailable(errorMessage, errorCode = null) {
    if (stryMutAct_9fa48("116159")) {
      {}
    } else {
      stryCov_9fa48("116159");
      if (stryMutAct_9fa48("116162") ? errorCode !== QUERY_EXECUTOR_LITERAL.STRING_ROUTER_CONNECTION_CLOSED : stryMutAct_9fa48("116161") ? false : stryMutAct_9fa48("116160") ? true : (stryCov_9fa48("116160", "116161", "116162"), errorCode === QUERY_EXECUTOR_LITERAL.STRING_ROUTER_CONNECTION_CLOSED)) {
        if (stryMutAct_9fa48("116163")) {
          {}
        } else {
          stryCov_9fa48("116163");
          return stryMutAct_9fa48("116164") ? false : (stryCov_9fa48("116164"), true);
        }
      }
      return stryMutAct_9fa48("116167") ? errorMessage || errorMessage.includes(ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE) || errorMessage.includes(TRANSPORT_ERROR_MSG.MESSAGE_TIMEOUT) || errorMessage.includes(ERRORS.NO_HANDLER_FOR_ADDRESS) || errorMessage.includes(QUERY_EXECUTOR_LITERAL.STRING_CONNECTION_TO_NODE) && errorMessage.includes(QUERY_EXECUTOR_LITERAL.STRING_CLOSED) || errorMessage.includes(QUERY_EXECUTOR_LITERAL.STRING_NO_CONNECTION_TO_NODE) || errorMessage.includes(QUERY_EXECUTOR_LITERAL.STRING_FAILED_TO_FORWARD_WRITE_TO_LEADER) : stryMutAct_9fa48("116166") ? false : stryMutAct_9fa48("116165") ? true : (stryCov_9fa48("116165", "116166", "116167"), errorMessage && (stryMutAct_9fa48("116169") ? (errorMessage.includes(ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE) || errorMessage.includes(TRANSPORT_ERROR_MSG.MESSAGE_TIMEOUT) || errorMessage.includes(ERRORS.NO_HANDLER_FOR_ADDRESS) || errorMessage.includes(QUERY_EXECUTOR_LITERAL.STRING_CONNECTION_TO_NODE) && errorMessage.includes(QUERY_EXECUTOR_LITERAL.STRING_CLOSED) || errorMessage.includes(QUERY_EXECUTOR_LITERAL.STRING_NO_CONNECTION_TO_NODE)) && errorMessage.includes(QUERY_EXECUTOR_LITERAL.STRING_FAILED_TO_FORWARD_WRITE_TO_LEADER) : stryMutAct_9fa48("116168") ? true : (stryCov_9fa48("116168", "116169"), (stryMutAct_9fa48("116171") ? (errorMessage.includes(ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE) || errorMessage.includes(TRANSPORT_ERROR_MSG.MESSAGE_TIMEOUT) || errorMessage.includes(ERRORS.NO_HANDLER_FOR_ADDRESS) || errorMessage.includes(QUERY_EXECUTOR_LITERAL.STRING_CONNECTION_TO_NODE) && errorMessage.includes(QUERY_EXECUTOR_LITERAL.STRING_CLOSED)) && errorMessage.includes(QUERY_EXECUTOR_LITERAL.STRING_NO_CONNECTION_TO_NODE) : stryMutAct_9fa48("116170") ? false : (stryCov_9fa48("116170", "116171"), (stryMutAct_9fa48("116173") ? (errorMessage.includes(ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE) || errorMessage.includes(TRANSPORT_ERROR_MSG.MESSAGE_TIMEOUT) || errorMessage.includes(ERRORS.NO_HANDLER_FOR_ADDRESS)) && errorMessage.includes(QUERY_EXECUTOR_LITERAL.STRING_CONNECTION_TO_NODE) && errorMessage.includes(QUERY_EXECUTOR_LITERAL.STRING_CLOSED) : stryMutAct_9fa48("116172") ? false : (stryCov_9fa48("116172", "116173"), (stryMutAct_9fa48("116175") ? (errorMessage.includes(ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE) || errorMessage.includes(TRANSPORT_ERROR_MSG.MESSAGE_TIMEOUT)) && errorMessage.includes(ERRORS.NO_HANDLER_FOR_ADDRESS) : stryMutAct_9fa48("116174") ? false : (stryCov_9fa48("116174", "116175"), (stryMutAct_9fa48("116177") ? errorMessage.includes(ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE) && errorMessage.includes(TRANSPORT_ERROR_MSG.MESSAGE_TIMEOUT) : stryMutAct_9fa48("116176") ? false : (stryCov_9fa48("116176", "116177"), errorMessage.includes(ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE) || errorMessage.includes(TRANSPORT_ERROR_MSG.MESSAGE_TIMEOUT))) || errorMessage.includes(ERRORS.NO_HANDLER_FOR_ADDRESS))) || (stryMutAct_9fa48("116179") ? errorMessage.includes(QUERY_EXECUTOR_LITERAL.STRING_CONNECTION_TO_NODE) || errorMessage.includes(QUERY_EXECUTOR_LITERAL.STRING_CLOSED) : stryMutAct_9fa48("116178") ? false : (stryCov_9fa48("116178", "116179"), errorMessage.includes(QUERY_EXECUTOR_LITERAL.STRING_CONNECTION_TO_NODE) && errorMessage.includes(QUERY_EXECUTOR_LITERAL.STRING_CLOSED))))) || errorMessage.includes(QUERY_EXECUTOR_LITERAL.STRING_NO_CONNECTION_TO_NODE))) || errorMessage.includes(QUERY_EXECUTOR_LITERAL.STRING_FAILED_TO_FORWARD_WRITE_TO_LEADER))));
    }
  }

  /**
   * Resolve the logical table name for one partition.
   * @param {string} partitionId
   * @return {string|null}
   * @private
   */
  resolvePartitionTableName(partitionId) {
    if (stryMutAct_9fa48("116180")) {
      {}
    } else {
      stryCov_9fa48("116180");
      const partition = this.getPartitionRecord(partitionId);
      const tableName = stryMutAct_9fa48("116181") ? (partition?.[COLUMN.TABLE_NAME] ?? partition?.table_name ?? partition?.tableName ?? partition?.table_id ?? partition?.tableId) && null : (stryCov_9fa48("116181"), (stryMutAct_9fa48("116182") ? (partition?.[COLUMN.TABLE_NAME] ?? partition?.table_name ?? partition?.tableName ?? partition?.table_id) && partition?.tableId : (stryCov_9fa48("116182"), (stryMutAct_9fa48("116183") ? (partition?.[COLUMN.TABLE_NAME] ?? partition?.table_name ?? partition?.tableName) && partition?.table_id : (stryCov_9fa48("116183"), (stryMutAct_9fa48("116184") ? (partition?.[COLUMN.TABLE_NAME] ?? partition?.table_name) && partition?.tableName : (stryCov_9fa48("116184"), (stryMutAct_9fa48("116185") ? partition?.[COLUMN.TABLE_NAME] && partition?.table_name : (stryCov_9fa48("116185"), (stryMutAct_9fa48("116186") ? partition[COLUMN.TABLE_NAME] : (stryCov_9fa48("116186"), partition?.[COLUMN.TABLE_NAME])) ?? (stryMutAct_9fa48("116187") ? partition.table_name : (stryCov_9fa48("116187"), partition?.table_name)))) ?? (stryMutAct_9fa48("116188") ? partition.tableName : (stryCov_9fa48("116188"), partition?.tableName)))) ?? (stryMutAct_9fa48("116189") ? partition.table_id : (stryCov_9fa48("116189"), partition?.table_id)))) ?? (stryMutAct_9fa48("116190") ? partition.tableId : (stryCov_9fa48("116190"), partition?.tableId)))) ?? null);
      if (stryMutAct_9fa48("116193") ? typeof tableName === QUERY_EXECUTOR_LITERAL.STRING_STRING || tableName.length > NUM.ZERO : stryMutAct_9fa48("116192") ? false : stryMutAct_9fa48("116191") ? true : (stryCov_9fa48("116191", "116192", "116193"), (stryMutAct_9fa48("116195") ? typeof tableName !== QUERY_EXECUTOR_LITERAL.STRING_STRING : stryMutAct_9fa48("116194") ? true : (stryCov_9fa48("116194", "116195"), typeof tableName === QUERY_EXECUTOR_LITERAL.STRING_STRING)) && (stryMutAct_9fa48("116198") ? tableName.length <= NUM.ZERO : stryMutAct_9fa48("116197") ? tableName.length >= NUM.ZERO : stryMutAct_9fa48("116196") ? true : (stryCov_9fa48("116196", "116197", "116198"), tableName.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("116199")) {
          {}
        } else {
          stryCov_9fa48("116199");
          return tableName;
        }
      }
      if (stryMutAct_9fa48("116202") ? typeof partitionId !== QUERY_EXECUTOR_LITERAL.STRING_STRING && partitionId.length === NUM.ZERO : stryMutAct_9fa48("116201") ? false : stryMutAct_9fa48("116200") ? true : (stryCov_9fa48("116200", "116201", "116202"), (stryMutAct_9fa48("116204") ? typeof partitionId === QUERY_EXECUTOR_LITERAL.STRING_STRING : stryMutAct_9fa48("116203") ? false : (stryCov_9fa48("116203", "116204"), typeof partitionId !== QUERY_EXECUTOR_LITERAL.STRING_STRING)) || (stryMutAct_9fa48("116206") ? partitionId.length !== NUM.ZERO : stryMutAct_9fa48("116205") ? false : (stryCov_9fa48("116205", "116206"), partitionId.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("116207")) {
          {}
        } else {
          stryCov_9fa48("116207");
          return null;
        }
      }
      const fallbackTableName = partitionId.replace(stryMutAct_9fa48("116210") ? /-p\D+$/ : stryMutAct_9fa48("116209") ? /-p\d$/ : stryMutAct_9fa48("116208") ? /-p\d+/ : (stryCov_9fa48("116208", "116209", "116210"), /-p\d+$/), stryMutAct_9fa48("116211") ? "Stryker was here!" : (stryCov_9fa48("116211"), ''));
      return (stryMutAct_9fa48("116215") ? fallbackTableName.length <= NUM.ZERO : stryMutAct_9fa48("116214") ? fallbackTableName.length >= NUM.ZERO : stryMutAct_9fa48("116213") ? false : stryMutAct_9fa48("116212") ? true : (stryCov_9fa48("116212", "116213", "116214", "116215"), fallbackTableName.length > NUM.ZERO)) ? fallbackTableName : null;
    }
  }

  /**
   * Check whether one routed failure should widen to alternative live
   * candidates for system-table writes.
   * @param {string} partitionId
   * @param {Object} failure
   * @param {boolean} forRead
   * @return {boolean}
   * @private
   */
  isRetryableControlPlaneWriteFailure(partitionId, failure, forRead = stryMutAct_9fa48("116216") ? true : (stryCov_9fa48("116216"), false)) {
    if (stryMutAct_9fa48("116217")) {
      {}
    } else {
      stryCov_9fa48("116217");
      if (stryMutAct_9fa48("116219") ? false : stryMutAct_9fa48("116218") ? true : (stryCov_9fa48("116218", "116219"), forRead)) {
        if (stryMutAct_9fa48("116220")) {
          {}
        } else {
          stryCov_9fa48("116220");
          return stryMutAct_9fa48("116221") ? true : (stryCov_9fa48("116221"), false);
        }
      }
      const tableName = this.resolvePartitionTableName(partitionId);
      if (stryMutAct_9fa48("116224") ? false : stryMutAct_9fa48("116223") ? true : stryMutAct_9fa48("116222") ? SYSTEM_TABLE_NAMES.has(String(tableName || QUERY_EXECUTOR_LITERAL.STRING_VALUE)) : (stryCov_9fa48("116222", "116223", "116224"), !SYSTEM_TABLE_NAMES.has(String(stryMutAct_9fa48("116227") ? tableName && QUERY_EXECUTOR_LITERAL.STRING_VALUE : stryMutAct_9fa48("116226") ? false : stryMutAct_9fa48("116225") ? true : (stryCov_9fa48("116225", "116226", "116227"), tableName || QUERY_EXECUTOR_LITERAL.STRING_VALUE))))) {
        if (stryMutAct_9fa48("116228")) {
          {}
        } else {
          stryCov_9fa48("116228");
          return stryMutAct_9fa48("116229") ? true : (stryCov_9fa48("116229"), false);
        }
      }
      return isRetryableControlPlaneError(failure);
    }
  }

  /**
   * Session-bound transactional control-plane writes must stay on the replica
   * that already owns the in-flight transaction instead of widening to a
   * different live replica mid-attempt.
   * @param {string} partitionId
   * @param {Object} executionOptions
   * @param {Object} failure
   * @param {boolean} forRead
   * @return {boolean}
   * @private
   */
  shouldRetryTransactionActiveWriteOnSameAddress(partitionId, executionOptions, failure, forRead = stryMutAct_9fa48("116230") ? true : (stryCov_9fa48("116230"), false)) {
    if (stryMutAct_9fa48("116231")) {
      {}
    } else {
      stryCov_9fa48("116231");
      if (stryMutAct_9fa48("116234") ? false : stryMutAct_9fa48("116233") ? true : stryMutAct_9fa48("116232") ? this.isRetryableControlPlaneWriteFailure(partitionId, failure, forRead) : (stryCov_9fa48("116232", "116233", "116234"), !this.isRetryableControlPlaneWriteFailure(partitionId, failure, forRead))) {
        if (stryMutAct_9fa48("116235")) {
          {}
        } else {
          stryCov_9fa48("116235");
          return stryMutAct_9fa48("116236") ? true : (stryCov_9fa48("116236"), false);
        }
      }
      if (stryMutAct_9fa48("116239") ? typeof executionOptions?.sessionId !== QUERY_EXECUTOR_LITERAL.STRING_STRING && executionOptions.sessionId.length <= NUM.ZERO : stryMutAct_9fa48("116238") ? false : stryMutAct_9fa48("116237") ? true : (stryCov_9fa48("116237", "116238", "116239"), (stryMutAct_9fa48("116241") ? typeof executionOptions?.sessionId === QUERY_EXECUTOR_LITERAL.STRING_STRING : stryMutAct_9fa48("116240") ? false : (stryCov_9fa48("116240", "116241"), typeof (stryMutAct_9fa48("116242") ? executionOptions.sessionId : (stryCov_9fa48("116242"), executionOptions?.sessionId)) !== QUERY_EXECUTOR_LITERAL.STRING_STRING)) || (stryMutAct_9fa48("116245") ? executionOptions.sessionId.length > NUM.ZERO : stryMutAct_9fa48("116244") ? executionOptions.sessionId.length < NUM.ZERO : stryMutAct_9fa48("116243") ? false : (stryCov_9fa48("116243", "116244", "116245"), executionOptions.sessionId.length <= NUM.ZERO)))) {
        if (stryMutAct_9fa48("116246")) {
          {}
        } else {
          stryCov_9fa48("116246");
          return stryMutAct_9fa48("116247") ? true : (stryCov_9fa48("116247"), false);
        }
      }
      const failureMessage = (stryMutAct_9fa48("116250") ? typeof failure?.message !== 'string' : stryMutAct_9fa48("116249") ? false : stryMutAct_9fa48("116248") ? true : (stryCov_9fa48("116248", "116249", "116250"), typeof (stryMutAct_9fa48("116251") ? failure.message : (stryCov_9fa48("116251"), failure?.message)) === (stryMutAct_9fa48("116252") ? "" : (stryCov_9fa48("116252"), 'string')))) ? failure.message : (stryMutAct_9fa48("116255") ? typeof failure?.error !== 'string' : stryMutAct_9fa48("116254") ? false : stryMutAct_9fa48("116253") ? true : (stryCov_9fa48("116253", "116254", "116255"), typeof (stryMutAct_9fa48("116256") ? failure.error : (stryCov_9fa48("116256"), failure?.error)) === (stryMutAct_9fa48("116257") ? "" : (stryCov_9fa48("116257"), 'string')))) ? failure.error : stryMutAct_9fa48("116258") ? "Stryker was here!" : (stryCov_9fa48("116258"), '');
      return failureMessage.includes(PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE);
    }
  }

  /**
   * Delay helper for retry backoff.
   * @param {number} delayMs - Delay duration in ms.
   * @return {Promise<void>}
   * @private
   */
  async delay(delayMs) {
    if (stryMutAct_9fa48("116259")) {
      {}
    } else {
      stryCov_9fa48("116259");
      await new Promise(stryMutAct_9fa48("116260") ? () => undefined : (stryCov_9fa48("116260"), resolve => setTimeout(resolve, delayMs)));
    }
  }

  /**
   * Throw when cooperative cancellation has been requested.
   * @param {Object|null} cancellationToken
   * @private
   */
  throwIfCancelled(cancellationToken) {
    if (stryMutAct_9fa48("116261")) {
      {}
    } else {
      stryCov_9fa48("116261");
      if (stryMutAct_9fa48("116264") ? !cancellationToken && typeof cancellationToken.throwIfCancelled !== QUERY_EXECUTOR_LITERAL.STRING_FUNCTION : stryMutAct_9fa48("116263") ? false : stryMutAct_9fa48("116262") ? true : (stryCov_9fa48("116262", "116263", "116264"), (stryMutAct_9fa48("116265") ? cancellationToken : (stryCov_9fa48("116265"), !cancellationToken)) || (stryMutAct_9fa48("116267") ? typeof cancellationToken.throwIfCancelled === QUERY_EXECUTOR_LITERAL.STRING_FUNCTION : stryMutAct_9fa48("116266") ? false : (stryCov_9fa48("116266", "116267"), typeof cancellationToken.throwIfCancelled !== QUERY_EXECUTOR_LITERAL.STRING_FUNCTION)))) {
        if (stryMutAct_9fa48("116268")) {
          {}
        } else {
          stryCov_9fa48("116268");
          return;
        }
      }
      cancellationToken.throwIfCancelled();
    }
  }

  /**
   * Mark one partition service endpoint as temporarily unroutable after a
   * runtime no-handler witness so follow-up calls do not immediately retry the
   * same stale address.
   * @param {string} partitionId
   * @param {string} address
   * @private
   */
  markTemporarilyUnroutableAddress(partitionId, address, service = null) {
    if (stryMutAct_9fa48("116269")) {
      {}
    } else {
      stryCov_9fa48("116269");
      if (stryMutAct_9fa48("116272") ? (typeof partitionId !== QUERY_EXECUTOR_LITERAL.STRING_STRING || partitionId.length === NUM.ZERO || typeof address !== QUERY_EXECUTOR_LITERAL.STRING_STRING) && address.length === NUM.ZERO : stryMutAct_9fa48("116271") ? false : stryMutAct_9fa48("116270") ? true : (stryCov_9fa48("116270", "116271", "116272"), (stryMutAct_9fa48("116274") ? (typeof partitionId !== QUERY_EXECUTOR_LITERAL.STRING_STRING || partitionId.length === NUM.ZERO) && typeof address !== QUERY_EXECUTOR_LITERAL.STRING_STRING : stryMutAct_9fa48("116273") ? false : (stryCov_9fa48("116273", "116274"), (stryMutAct_9fa48("116276") ? typeof partitionId !== QUERY_EXECUTOR_LITERAL.STRING_STRING && partitionId.length === NUM.ZERO : stryMutAct_9fa48("116275") ? false : (stryCov_9fa48("116275", "116276"), (stryMutAct_9fa48("116278") ? typeof partitionId === QUERY_EXECUTOR_LITERAL.STRING_STRING : stryMutAct_9fa48("116277") ? false : (stryCov_9fa48("116277", "116278"), typeof partitionId !== QUERY_EXECUTOR_LITERAL.STRING_STRING)) || (stryMutAct_9fa48("116280") ? partitionId.length !== NUM.ZERO : stryMutAct_9fa48("116279") ? false : (stryCov_9fa48("116279", "116280"), partitionId.length === NUM.ZERO)))) || (stryMutAct_9fa48("116282") ? typeof address === QUERY_EXECUTOR_LITERAL.STRING_STRING : stryMutAct_9fa48("116281") ? false : (stryCov_9fa48("116281", "116282"), typeof address !== QUERY_EXECUTOR_LITERAL.STRING_STRING)))) || (stryMutAct_9fa48("116284") ? address.length !== NUM.ZERO : stryMutAct_9fa48("116283") ? false : (stryCov_9fa48("116283", "116284"), address.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("116285")) {
          {}
        } else {
          stryCov_9fa48("116285");
          return;
        }
      }
      const expiresAt = stryMutAct_9fa48("116286") ? Date.now() - this.resolveNoHandlerAddressQuarantineMs(partitionId) : (stryCov_9fa48("116286"), Date.now() + this.resolveNoHandlerAddressQuarantineMs(partitionId));
      const fingerprint = buildPartitionServiceWitnessFingerprint(service);
      const existing = this.temporarilyUnroutableAddressesByPartition.get(partitionId);
      if (stryMutAct_9fa48("116288") ? false : stryMutAct_9fa48("116287") ? true : (stryCov_9fa48("116287", "116288"), existing instanceof Map)) {
        if (stryMutAct_9fa48("116289")) {
          {}
        } else {
          stryCov_9fa48("116289");
          existing.set(address, Object.freeze(stryMutAct_9fa48("116290") ? {} : (stryCov_9fa48("116290"), {
            expiresAt,
            fingerprint
          })));
          return;
        }
      }
      const addressExpiryMap = new Map();
      addressExpiryMap.set(address, Object.freeze(stryMutAct_9fa48("116291") ? {} : (stryCov_9fa48("116291"), {
        expiresAt,
        fingerprint
      })));
      this.temporarilyUnroutableAddressesByPartition.set(partitionId, addressExpiryMap);
    }
  }

  /**
   * Clear one temporary unroutable endpoint marker after a successful route.
   * @param {string} partitionId
   * @param {string} address
   * @private
   */
  clearTemporarilyUnroutableAddress(partitionId, address) {
    if (stryMutAct_9fa48("116292")) {
      {}
    } else {
      stryCov_9fa48("116292");
      if (stryMutAct_9fa48("116295") ? (typeof partitionId !== QUERY_EXECUTOR_LITERAL.STRING_STRING || partitionId.length === NUM.ZERO || typeof address !== QUERY_EXECUTOR_LITERAL.STRING_STRING) && address.length === NUM.ZERO : stryMutAct_9fa48("116294") ? false : stryMutAct_9fa48("116293") ? true : (stryCov_9fa48("116293", "116294", "116295"), (stryMutAct_9fa48("116297") ? (typeof partitionId !== QUERY_EXECUTOR_LITERAL.STRING_STRING || partitionId.length === NUM.ZERO) && typeof address !== QUERY_EXECUTOR_LITERAL.STRING_STRING : stryMutAct_9fa48("116296") ? false : (stryCov_9fa48("116296", "116297"), (stryMutAct_9fa48("116299") ? typeof partitionId !== QUERY_EXECUTOR_LITERAL.STRING_STRING && partitionId.length === NUM.ZERO : stryMutAct_9fa48("116298") ? false : (stryCov_9fa48("116298", "116299"), (stryMutAct_9fa48("116301") ? typeof partitionId === QUERY_EXECUTOR_LITERAL.STRING_STRING : stryMutAct_9fa48("116300") ? false : (stryCov_9fa48("116300", "116301"), typeof partitionId !== QUERY_EXECUTOR_LITERAL.STRING_STRING)) || (stryMutAct_9fa48("116303") ? partitionId.length !== NUM.ZERO : stryMutAct_9fa48("116302") ? false : (stryCov_9fa48("116302", "116303"), partitionId.length === NUM.ZERO)))) || (stryMutAct_9fa48("116305") ? typeof address === QUERY_EXECUTOR_LITERAL.STRING_STRING : stryMutAct_9fa48("116304") ? false : (stryCov_9fa48("116304", "116305"), typeof address !== QUERY_EXECUTOR_LITERAL.STRING_STRING)))) || (stryMutAct_9fa48("116307") ? address.length !== NUM.ZERO : stryMutAct_9fa48("116306") ? false : (stryCov_9fa48("116306", "116307"), address.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("116308")) {
          {}
        } else {
          stryCov_9fa48("116308");
          return;
        }
      }
      const existing = this.temporarilyUnroutableAddressesByPartition.get(partitionId);
      if (stryMutAct_9fa48("116311") ? false : stryMutAct_9fa48("116310") ? true : stryMutAct_9fa48("116309") ? existing instanceof Map : (stryCov_9fa48("116309", "116310", "116311"), !(existing instanceof Map))) {
        if (stryMutAct_9fa48("116312")) {
          {}
        } else {
          stryCov_9fa48("116312");
          return;
        }
      }
      existing.delete(address);
      if (stryMutAct_9fa48("116315") ? existing.size !== NUM.ZERO : stryMutAct_9fa48("116314") ? false : stryMutAct_9fa48("116313") ? true : (stryCov_9fa48("116313", "116314", "116315"), existing.size === NUM.ZERO)) {
        if (stryMutAct_9fa48("116316")) {
          {}
        } else {
          stryCov_9fa48("116316");
          this.temporarilyUnroutableAddressesByPartition.delete(partitionId);
        }
      }
    }
  }

  /**
   * Return true when one partition endpoint is still inside the temporary
   * no-handler quarantine window.
   * @param {string} partitionId
   * @param {string} address
   * @return {boolean}
   * @private
   */
  isTemporarilyUnroutableAddress(partitionId, address, service = null) {
    if (stryMutAct_9fa48("116317")) {
      {}
    } else {
      stryCov_9fa48("116317");
      if (stryMutAct_9fa48("116320") ? (typeof partitionId !== QUERY_EXECUTOR_LITERAL.STRING_STRING || partitionId.length === NUM.ZERO || typeof address !== QUERY_EXECUTOR_LITERAL.STRING_STRING) && address.length === NUM.ZERO : stryMutAct_9fa48("116319") ? false : stryMutAct_9fa48("116318") ? true : (stryCov_9fa48("116318", "116319", "116320"), (stryMutAct_9fa48("116322") ? (typeof partitionId !== QUERY_EXECUTOR_LITERAL.STRING_STRING || partitionId.length === NUM.ZERO) && typeof address !== QUERY_EXECUTOR_LITERAL.STRING_STRING : stryMutAct_9fa48("116321") ? false : (stryCov_9fa48("116321", "116322"), (stryMutAct_9fa48("116324") ? typeof partitionId !== QUERY_EXECUTOR_LITERAL.STRING_STRING && partitionId.length === NUM.ZERO : stryMutAct_9fa48("116323") ? false : (stryCov_9fa48("116323", "116324"), (stryMutAct_9fa48("116326") ? typeof partitionId === QUERY_EXECUTOR_LITERAL.STRING_STRING : stryMutAct_9fa48("116325") ? false : (stryCov_9fa48("116325", "116326"), typeof partitionId !== QUERY_EXECUTOR_LITERAL.STRING_STRING)) || (stryMutAct_9fa48("116328") ? partitionId.length !== NUM.ZERO : stryMutAct_9fa48("116327") ? false : (stryCov_9fa48("116327", "116328"), partitionId.length === NUM.ZERO)))) || (stryMutAct_9fa48("116330") ? typeof address === QUERY_EXECUTOR_LITERAL.STRING_STRING : stryMutAct_9fa48("116329") ? false : (stryCov_9fa48("116329", "116330"), typeof address !== QUERY_EXECUTOR_LITERAL.STRING_STRING)))) || (stryMutAct_9fa48("116332") ? address.length !== NUM.ZERO : stryMutAct_9fa48("116331") ? false : (stryCov_9fa48("116331", "116332"), address.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("116333")) {
          {}
        } else {
          stryCov_9fa48("116333");
          return stryMutAct_9fa48("116334") ? true : (stryCov_9fa48("116334"), false);
        }
      }
      const existing = this.temporarilyUnroutableAddressesByPartition.get(partitionId);
      if (stryMutAct_9fa48("116337") ? false : stryMutAct_9fa48("116336") ? true : stryMutAct_9fa48("116335") ? existing instanceof Map : (stryCov_9fa48("116335", "116336", "116337"), !(existing instanceof Map))) {
        if (stryMutAct_9fa48("116338")) {
          {}
        } else {
          stryCov_9fa48("116338");
          return stryMutAct_9fa48("116339") ? true : (stryCov_9fa48("116339"), false);
        }
      }
      const entry = existing.get(address);
      const expiresAt = Number.isFinite(entry) ? entry : Number.isFinite(stryMutAct_9fa48("116340") ? entry.expiresAt : (stryCov_9fa48("116340"), entry?.expiresAt)) ? entry.expiresAt : null;
      if (stryMutAct_9fa48("116343") ? false : stryMutAct_9fa48("116342") ? true : stryMutAct_9fa48("116341") ? Number.isFinite(expiresAt) : (stryCov_9fa48("116341", "116342", "116343"), !Number.isFinite(expiresAt))) {
        if (stryMutAct_9fa48("116344")) {
          {}
        } else {
          stryCov_9fa48("116344");
          existing.delete(address);
          if (stryMutAct_9fa48("116347") ? existing.size !== NUM.ZERO : stryMutAct_9fa48("116346") ? false : stryMutAct_9fa48("116345") ? true : (stryCov_9fa48("116345", "116346", "116347"), existing.size === NUM.ZERO)) {
            if (stryMutAct_9fa48("116348")) {
              {}
            } else {
              stryCov_9fa48("116348");
              this.temporarilyUnroutableAddressesByPartition.delete(partitionId);
            }
          }
          return stryMutAct_9fa48("116349") ? true : (stryCov_9fa48("116349"), false);
        }
      }
      const currentFingerprint = buildPartitionServiceWitnessFingerprint(service);
      if (stryMutAct_9fa48("116352") ? typeof entry?.fingerprint === QUERY_EXECUTOR_LITERAL.STRING_STRING && entry.fingerprint.length > NUM.ZERO && typeof currentFingerprint === QUERY_EXECUTOR_LITERAL.STRING_STRING && currentFingerprint.length > NUM.ZERO || currentFingerprint !== entry.fingerprint : stryMutAct_9fa48("116351") ? false : stryMutAct_9fa48("116350") ? true : (stryCov_9fa48("116350", "116351", "116352"), (stryMutAct_9fa48("116354") ? typeof entry?.fingerprint === QUERY_EXECUTOR_LITERAL.STRING_STRING && entry.fingerprint.length > NUM.ZERO && typeof currentFingerprint === QUERY_EXECUTOR_LITERAL.STRING_STRING || currentFingerprint.length > NUM.ZERO : stryMutAct_9fa48("116353") ? true : (stryCov_9fa48("116353", "116354"), (stryMutAct_9fa48("116356") ? typeof entry?.fingerprint === QUERY_EXECUTOR_LITERAL.STRING_STRING && entry.fingerprint.length > NUM.ZERO || typeof currentFingerprint === QUERY_EXECUTOR_LITERAL.STRING_STRING : stryMutAct_9fa48("116355") ? true : (stryCov_9fa48("116355", "116356"), (stryMutAct_9fa48("116358") ? typeof entry?.fingerprint === QUERY_EXECUTOR_LITERAL.STRING_STRING || entry.fingerprint.length > NUM.ZERO : stryMutAct_9fa48("116357") ? true : (stryCov_9fa48("116357", "116358"), (stryMutAct_9fa48("116360") ? typeof entry?.fingerprint !== QUERY_EXECUTOR_LITERAL.STRING_STRING : stryMutAct_9fa48("116359") ? true : (stryCov_9fa48("116359", "116360"), typeof (stryMutAct_9fa48("116361") ? entry.fingerprint : (stryCov_9fa48("116361"), entry?.fingerprint)) === QUERY_EXECUTOR_LITERAL.STRING_STRING)) && (stryMutAct_9fa48("116364") ? entry.fingerprint.length <= NUM.ZERO : stryMutAct_9fa48("116363") ? entry.fingerprint.length >= NUM.ZERO : stryMutAct_9fa48("116362") ? true : (stryCov_9fa48("116362", "116363", "116364"), entry.fingerprint.length > NUM.ZERO)))) && (stryMutAct_9fa48("116366") ? typeof currentFingerprint !== QUERY_EXECUTOR_LITERAL.STRING_STRING : stryMutAct_9fa48("116365") ? true : (stryCov_9fa48("116365", "116366"), typeof currentFingerprint === QUERY_EXECUTOR_LITERAL.STRING_STRING)))) && (stryMutAct_9fa48("116369") ? currentFingerprint.length <= NUM.ZERO : stryMutAct_9fa48("116368") ? currentFingerprint.length >= NUM.ZERO : stryMutAct_9fa48("116367") ? true : (stryCov_9fa48("116367", "116368", "116369"), currentFingerprint.length > NUM.ZERO)))) && (stryMutAct_9fa48("116371") ? currentFingerprint === entry.fingerprint : stryMutAct_9fa48("116370") ? true : (stryCov_9fa48("116370", "116371"), currentFingerprint !== entry.fingerprint)))) {
        if (stryMutAct_9fa48("116372")) {
          {}
        } else {
          stryCov_9fa48("116372");
          existing.delete(address);
          if (stryMutAct_9fa48("116375") ? existing.size !== NUM.ZERO : stryMutAct_9fa48("116374") ? false : stryMutAct_9fa48("116373") ? true : (stryCov_9fa48("116373", "116374", "116375"), existing.size === NUM.ZERO)) {
            if (stryMutAct_9fa48("116376")) {
              {}
            } else {
              stryCov_9fa48("116376");
              this.temporarilyUnroutableAddressesByPartition.delete(partitionId);
            }
          }
          return stryMutAct_9fa48("116377") ? true : (stryCov_9fa48("116377"), false);
        }
      }
      if (stryMutAct_9fa48("116381") ? expiresAt <= Date.now() : stryMutAct_9fa48("116380") ? expiresAt >= Date.now() : stryMutAct_9fa48("116379") ? false : stryMutAct_9fa48("116378") ? true : (stryCov_9fa48("116378", "116379", "116380", "116381"), expiresAt > Date.now())) {
        if (stryMutAct_9fa48("116382")) {
          {}
        } else {
          stryCov_9fa48("116382");
          return stryMutAct_9fa48("116383") ? false : (stryCov_9fa48("116383"), true);
        }
      }
      existing.delete(address);
      if (stryMutAct_9fa48("116386") ? existing.size !== NUM.ZERO : stryMutAct_9fa48("116385") ? false : stryMutAct_9fa48("116384") ? true : (stryCov_9fa48("116384", "116385", "116386"), existing.size === NUM.ZERO)) {
        if (stryMutAct_9fa48("116387")) {
          {}
        } else {
          stryCov_9fa48("116387");
          this.temporarilyUnroutableAddressesByPartition.delete(partitionId);
        }
      }
      return stryMutAct_9fa48("116388") ? true : (stryCov_9fa48("116388"), false);
    }
  }

  /**
   * Resolve the quarantine duration for one runtime no-handler witness.
   * Control-plane partitions keep stale addresses shadowed longer so routed
   * writes stop chasing cache rows that lag behind removal/publication.
   * @param {string} partitionId
   * @return {number}
   * @private
   */
  resolveNoHandlerAddressQuarantineMs(partitionId) {
    if (stryMutAct_9fa48("116389")) {
      {}
    } else {
      stryCov_9fa48("116389");
      if (stryMutAct_9fa48("116391") ? false : stryMutAct_9fa48("116390") ? true : (stryCov_9fa48("116390", "116391"), this.noHandlerAddressQuarantineMsExplicit)) {
        if (stryMutAct_9fa48("116392")) {
          {}
        } else {
          stryCov_9fa48("116392");
          return this.noHandlerAddressQuarantineMs;
        }
      }
      const tableName = this.resolvePartitionTableName(partitionId);
      if (stryMutAct_9fa48("116394") ? false : stryMutAct_9fa48("116393") ? true : (stryCov_9fa48("116393", "116394"), SYSTEM_TABLE_NAMES.has(String(stryMutAct_9fa48("116397") ? tableName && QUERY_EXECUTOR_LITERAL.STRING_VALUE : stryMutAct_9fa48("116396") ? false : stryMutAct_9fa48("116395") ? true : (stryCov_9fa48("116395", "116396", "116397"), tableName || QUERY_EXECUTOR_LITERAL.STRING_VALUE))))) {
        if (stryMutAct_9fa48("116398")) {
          {}
        } else {
          stryCov_9fa48("116398");
          return stryMutAct_9fa48("116399") ? Math.min(this.noHandlerAddressQuarantineMs, QUERY_DEFAULTS.CONTROL_PLANE_NO_HANDLER_ADDRESS_QUARANTINE_MS) : (stryCov_9fa48("116399"), Math.max(this.noHandlerAddressQuarantineMs, QUERY_DEFAULTS.CONTROL_PLANE_NO_HANDLER_ADDRESS_QUARANTINE_MS));
        }
      }
      return this.noHandlerAddressQuarantineMs;
    }
  }

  /**
   * Resolve the routed service row that produced the current delivery target.
   * @param {Object|null} routingSnapshot
   * @param {Object|null} serviceInfo
   * @param {string|null} address
   * @return {Object|null}
   * @private
   */
  findRoutingSnapshotService(routingSnapshot, serviceInfo, address) {
    if (stryMutAct_9fa48("116400")) {
      {}
    } else {
      stryCov_9fa48("116400");
      const serviceRows = Array.isArray(stryMutAct_9fa48("116401") ? routingSnapshot.serviceRows : (stryCov_9fa48("116401"), routingSnapshot?.serviceRows)) ? routingSnapshot.serviceRows : stryMutAct_9fa48("116402") ? ["Stryker was here"] : (stryCov_9fa48("116402"), []);
      const replicaId = (stryMutAct_9fa48("116405") ? typeof serviceInfo?.replicaId === 'string' || serviceInfo.replicaId.length > NUM.ZERO : stryMutAct_9fa48("116404") ? false : stryMutAct_9fa48("116403") ? true : (stryCov_9fa48("116403", "116404", "116405"), (stryMutAct_9fa48("116407") ? typeof serviceInfo?.replicaId !== 'string' : stryMutAct_9fa48("116406") ? true : (stryCov_9fa48("116406", "116407"), typeof (stryMutAct_9fa48("116408") ? serviceInfo.replicaId : (stryCov_9fa48("116408"), serviceInfo?.replicaId)) === (stryMutAct_9fa48("116409") ? "" : (stryCov_9fa48("116409"), 'string')))) && (stryMutAct_9fa48("116412") ? serviceInfo.replicaId.length <= NUM.ZERO : stryMutAct_9fa48("116411") ? serviceInfo.replicaId.length >= NUM.ZERO : stryMutAct_9fa48("116410") ? true : (stryCov_9fa48("116410", "116411", "116412"), serviceInfo.replicaId.length > NUM.ZERO)))) ? serviceInfo.replicaId : null;
      const nodeId = (stryMutAct_9fa48("116415") ? typeof serviceInfo?.nodeId === 'string' || serviceInfo.nodeId.length > NUM.ZERO : stryMutAct_9fa48("116414") ? false : stryMutAct_9fa48("116413") ? true : (stryCov_9fa48("116413", "116414", "116415"), (stryMutAct_9fa48("116417") ? typeof serviceInfo?.nodeId !== 'string' : stryMutAct_9fa48("116416") ? true : (stryCov_9fa48("116416", "116417"), typeof (stryMutAct_9fa48("116418") ? serviceInfo.nodeId : (stryCov_9fa48("116418"), serviceInfo?.nodeId)) === (stryMutAct_9fa48("116419") ? "" : (stryCov_9fa48("116419"), 'string')))) && (stryMutAct_9fa48("116422") ? serviceInfo.nodeId.length <= NUM.ZERO : stryMutAct_9fa48("116421") ? serviceInfo.nodeId.length >= NUM.ZERO : stryMutAct_9fa48("116420") ? true : (stryCov_9fa48("116420", "116421", "116422"), serviceInfo.nodeId.length > NUM.ZERO)))) ? serviceInfo.nodeId : null;
      const normalizedAddress = (stryMutAct_9fa48("116425") ? typeof address === 'string' || address.length > NUM.ZERO : stryMutAct_9fa48("116424") ? false : stryMutAct_9fa48("116423") ? true : (stryCov_9fa48("116423", "116424", "116425"), (stryMutAct_9fa48("116427") ? typeof address !== 'string' : stryMutAct_9fa48("116426") ? true : (stryCov_9fa48("116426", "116427"), typeof address === (stryMutAct_9fa48("116428") ? "" : (stryCov_9fa48("116428"), 'string')))) && (stryMutAct_9fa48("116431") ? address.length <= NUM.ZERO : stryMutAct_9fa48("116430") ? address.length >= NUM.ZERO : stryMutAct_9fa48("116429") ? true : (stryCov_9fa48("116429", "116430", "116431"), address.length > NUM.ZERO)))) ? address : null;
      for (const service of serviceRows) {
        if (stryMutAct_9fa48("116432")) {
          {}
        } else {
          stryCov_9fa48("116432");
          if (stryMutAct_9fa48("116435") ? replicaId || service?.service_id === replicaId || service?.replica_id === replicaId : stryMutAct_9fa48("116434") ? false : stryMutAct_9fa48("116433") ? true : (stryCov_9fa48("116433", "116434", "116435"), replicaId && (stryMutAct_9fa48("116437") ? service?.service_id === replicaId && service?.replica_id === replicaId : stryMutAct_9fa48("116436") ? true : (stryCov_9fa48("116436", "116437"), (stryMutAct_9fa48("116439") ? service?.service_id !== replicaId : stryMutAct_9fa48("116438") ? false : (stryCov_9fa48("116438", "116439"), (stryMutAct_9fa48("116440") ? service.service_id : (stryCov_9fa48("116440"), service?.service_id)) === replicaId)) || (stryMutAct_9fa48("116442") ? service?.replica_id !== replicaId : stryMutAct_9fa48("116441") ? false : (stryCov_9fa48("116441", "116442"), (stryMutAct_9fa48("116443") ? service.replica_id : (stryCov_9fa48("116443"), service?.replica_id)) === replicaId)))))) {
            if (stryMutAct_9fa48("116444")) {
              {}
            } else {
              stryCov_9fa48("116444");
              return service;
            }
          }
          if (stryMutAct_9fa48("116447") ? normalizedAddress || service?.address === normalizedAddress : stryMutAct_9fa48("116446") ? false : stryMutAct_9fa48("116445") ? true : (stryCov_9fa48("116445", "116446", "116447"), normalizedAddress && (stryMutAct_9fa48("116449") ? service?.address !== normalizedAddress : stryMutAct_9fa48("116448") ? true : (stryCov_9fa48("116448", "116449"), (stryMutAct_9fa48("116450") ? service.address : (stryCov_9fa48("116450"), service?.address)) === normalizedAddress)))) {
            if (stryMutAct_9fa48("116451")) {
              {}
            } else {
              stryCov_9fa48("116451");
              return service;
            }
          }
        }
      }
      if (stryMutAct_9fa48("116453") ? false : stryMutAct_9fa48("116452") ? true : (stryCov_9fa48("116452", "116453"), nodeId)) {
        if (stryMutAct_9fa48("116454")) {
          {}
        } else {
          stryCov_9fa48("116454");
          return stryMutAct_9fa48("116457") ? serviceRows.find(service => service?.node_id === nodeId) && null : stryMutAct_9fa48("116456") ? false : stryMutAct_9fa48("116455") ? true : (stryCov_9fa48("116455", "116456", "116457"), serviceRows.find(stryMutAct_9fa48("116458") ? () => undefined : (stryCov_9fa48("116458"), service => stryMutAct_9fa48("116461") ? service?.node_id !== nodeId : stryMutAct_9fa48("116460") ? false : stryMutAct_9fa48("116459") ? true : (stryCov_9fa48("116459", "116460", "116461"), (stryMutAct_9fa48("116462") ? service.node_id : (stryCov_9fa48("116462"), service?.node_id)) === nodeId))) || null);
        }
      }
      return null;
    }
  }

  /**
   * Get partition service candidates in preferred order.
   * @param {string} partitionId - Partition ID.
   * @param {boolean} forRead - True when executing read-only queries.
   * @return {Array<Object>} Ordered list of service info objects.
   * @private
   */
  getPartitionServiceCandidates(partitionId, forRead = stryMutAct_9fa48("116463") ? true : (stryCov_9fa48("116463"), false), preferLeader = stryMutAct_9fa48("116464") ? true : (stryCov_9fa48("116464"), false), preferSameLatencyGroup = stryMutAct_9fa48("116465") ? true : (stryCov_9fa48("116465"), false), routingReadinessDimension = this.defaultRoutingReadinessDimension) {
    if (stryMutAct_9fa48("116466")) {
      {}
    } else {
      stryCov_9fa48("116466");
      return this.resolvePartitionServiceCandidates(partitionId, forRead, preferLeader, preferSameLatencyGroup, routingReadinessDimension).candidates;
    }
  }

  /**
   * Resolve ordered candidates together with the routing snapshot used to build
   * them so request paths can reuse the same owner evidence for retries.
   * @param {string} partitionId
   * @param {boolean} forRead
   * @param {boolean} preferLeader
   * @param {boolean} preferSameLatencyGroup
   * @param {string} routingReadinessDimension
   * @return {{candidates: Array<Object>, routingSnapshot: Object}}
   * @private
   */
  resolvePartitionServiceCandidates(partitionId, forRead = stryMutAct_9fa48("116467") ? true : (stryCov_9fa48("116467"), false), preferLeader = stryMutAct_9fa48("116468") ? true : (stryCov_9fa48("116468"), false), preferSameLatencyGroup = stryMutAct_9fa48("116469") ? true : (stryCov_9fa48("116469"), false), routingReadinessDimension = this.defaultRoutingReadinessDimension, routingOptions = {}) {
    if (stryMutAct_9fa48("116470")) {
      {}
    } else {
      stryCov_9fa48("116470");
      const prioritizeLeader = stryMutAct_9fa48("116473") ? preferLeader && !forRead : stryMutAct_9fa48("116472") ? false : stryMutAct_9fa48("116471") ? true : (stryCov_9fa48("116471", "116472", "116473"), preferLeader || (stryMutAct_9fa48("116474") ? forRead : (stryCov_9fa48("116474"), !forRead)));
      const routingSnapshot = this.getPartitionRoutingSnapshot(partitionId, routingReadinessDimension, routingOptions);
      const services = routingSnapshot.routableServices;
      if (stryMutAct_9fa48("116477") ? services.length !== NUM.ZERO : stryMutAct_9fa48("116476") ? false : stryMutAct_9fa48("116475") ? true : (stryCov_9fa48("116475", "116476", "116477"), services.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("116478")) {
          {}
        } else {
          stryCov_9fa48("116478");
          this.logPartitionRoutingDenial(routingSnapshot);
          return stryMutAct_9fa48("116479") ? {} : (stryCov_9fa48("116479"), {
            candidates: stryMutAct_9fa48("116480") ? ["Stryker was here"] : (stryCov_9fa48("116480"), []),
            routingSnapshot
          });
        }
      }
      const localGroupId = this.resolveNodeLatencyGroupId(this.nodeId);
      const orderedServices = this.orderServicesByLatencyGroup(services, localGroupId, stryMutAct_9fa48("116483") ? forRead || preferSameLatencyGroup : stryMutAct_9fa48("116482") ? false : stryMutAct_9fa48("116481") ? true : (stryCov_9fa48("116481", "116482", "116483"), forRead && preferSameLatencyGroup));
      const canonicalLeaderNodeId = routingSnapshot.canonicalLeaderNodeId;
      const bootstrapLeaderServices = (stryMutAct_9fa48("116486") ? !forRead || !canonicalLeaderNodeId : stryMutAct_9fa48("116485") ? false : stryMutAct_9fa48("116484") ? true : (stryCov_9fa48("116484", "116485", "116486"), (stryMutAct_9fa48("116487") ? forRead : (stryCov_9fa48("116487"), !forRead)) && (stryMutAct_9fa48("116488") ? canonicalLeaderNodeId : (stryCov_9fa48("116488"), !canonicalLeaderNodeId)))) ? this.getFreshBootstrapLeaderServices(partitionId, orderedServices) : stryMutAct_9fa48("116489") ? ["Stryker was here"] : (stryCov_9fa48("116489"), []);
      const candidates = stryMutAct_9fa48("116490") ? ["Stryker was here"] : (stryCov_9fa48("116490"), []);
      const seen = new Set();
      const addService = service => {
        if (stryMutAct_9fa48("116491")) {
          {}
        } else {
          stryCov_9fa48("116491");
          if (stryMutAct_9fa48("116494") ? false : stryMutAct_9fa48("116493") ? true : stryMutAct_9fa48("116492") ? service : (stryCov_9fa48("116492", "116493", "116494"), !service)) {
            if (stryMutAct_9fa48("116495")) {
              {}
            } else {
              stryCov_9fa48("116495");
              return;
            }
          }
          if (stryMutAct_9fa48("116497") ? false : stryMutAct_9fa48("116496") ? true : (stryCov_9fa48("116496", "116497"), this.isTemporarilyUnroutableAddress(partitionId, service.address, service))) {
            if (stryMutAct_9fa48("116498")) {
              {}
            } else {
              stryCov_9fa48("116498");
              return;
            }
          }
          const key = stryMutAct_9fa48("116501") ? (service.service_id || service.replica_id) && service.address : stryMutAct_9fa48("116500") ? false : stryMutAct_9fa48("116499") ? true : (stryCov_9fa48("116499", "116500", "116501"), (stryMutAct_9fa48("116503") ? service.service_id && service.replica_id : stryMutAct_9fa48("116502") ? false : (stryCov_9fa48("116502", "116503"), service.service_id || service.replica_id)) || service.address);
          if (stryMutAct_9fa48("116505") ? false : stryMutAct_9fa48("116504") ? true : (stryCov_9fa48("116504", "116505"), seen.has(key))) {
            if (stryMutAct_9fa48("116506")) {
              {}
            } else {
              stryCov_9fa48("116506");
              return;
            }
          }
          seen.add(key);
          candidates.push(stryMutAct_9fa48("116507") ? {} : (stryCov_9fa48("116507"), {
            address: service.address,
            nodeId: service.node_id,
            replicaId: stryMutAct_9fa48("116510") ? service.service_id && service.replica_id : stryMutAct_9fa48("116509") ? false : stryMutAct_9fa48("116508") ? true : (stryCov_9fa48("116508", "116509", "116510"), service.service_id || service.replica_id)
          }));
        }
      };
      const canonicalLeaderServices = canonicalLeaderNodeId ? stryMutAct_9fa48("116511") ? orderedServices : (stryCov_9fa48("116511"), orderedServices.filter(stryMutAct_9fa48("116512") ? () => undefined : (stryCov_9fa48("116512"), service => stryMutAct_9fa48("116515") ? service.node_id !== canonicalLeaderNodeId : stryMutAct_9fa48("116514") ? false : stryMutAct_9fa48("116513") ? true : (stryCov_9fa48("116513", "116514", "116515"), service.node_id === canonicalLeaderNodeId)))) : stryMutAct_9fa48("116516") ? ["Stryker was here"] : (stryCov_9fa48("116516"), []);
      if (stryMutAct_9fa48("116519") ? false : stryMutAct_9fa48("116518") ? true : stryMutAct_9fa48("116517") ? forRead : (stryCov_9fa48("116517", "116518", "116519"), !forRead)) {
        if (stryMutAct_9fa48("116520")) {
          {}
        } else {
          stryCov_9fa48("116520");
          if (stryMutAct_9fa48("116523") ? false : stryMutAct_9fa48("116522") ? true : stryMutAct_9fa48("116521") ? canonicalLeaderNodeId : (stryCov_9fa48("116521", "116522", "116523"), !canonicalLeaderNodeId)) {
            if (stryMutAct_9fa48("116524")) {
              {}
            } else {
              stryCov_9fa48("116524");
              if (stryMutAct_9fa48("116528") ? bootstrapLeaderServices.length <= NUM.ZERO : stryMutAct_9fa48("116527") ? bootstrapLeaderServices.length >= NUM.ZERO : stryMutAct_9fa48("116526") ? false : stryMutAct_9fa48("116525") ? true : (stryCov_9fa48("116525", "116526", "116527", "116528"), bootstrapLeaderServices.length > NUM.ZERO)) {
                if (stryMutAct_9fa48("116529")) {
                  {}
                } else {
                  stryCov_9fa48("116529");
                  bootstrapLeaderServices.forEach(addService);
                  return stryMutAct_9fa48("116530") ? {} : (stryCov_9fa48("116530"), {
                    candidates,
                    routingSnapshot
                  });
                }
              }
              this.logCanonicalLeaderRoutingGap(partitionId, stryMutAct_9fa48("116531") ? {} : (stryCov_9fa48("116531"), {
                reason: LEADER_GAP_REASON_OWNER_MISSING,
                services: orderedServices,
                routingSnapshot
              }));
              return stryMutAct_9fa48("116532") ? {} : (stryCov_9fa48("116532"), {
                candidates: stryMutAct_9fa48("116533") ? ["Stryker was here"] : (stryCov_9fa48("116533"), []),
                routingSnapshot
              });
            }
          }
          if (stryMutAct_9fa48("116536") ? canonicalLeaderServices.length !== NUM.ZERO : stryMutAct_9fa48("116535") ? false : stryMutAct_9fa48("116534") ? true : (stryCov_9fa48("116534", "116535", "116536"), canonicalLeaderServices.length === NUM.ZERO)) {
            if (stryMutAct_9fa48("116537")) {
              {}
            } else {
              stryCov_9fa48("116537");
              this.logCanonicalLeaderRoutingGap(partitionId, stryMutAct_9fa48("116538") ? {} : (stryCov_9fa48("116538"), {
                reason: LEADER_GAP_REASON_SERVICE_MISSING,
                canonicalLeaderNodeId,
                services: orderedServices,
                routingSnapshot
              }));
              return stryMutAct_9fa48("116539") ? {} : (stryCov_9fa48("116539"), {
                candidates: stryMutAct_9fa48("116540") ? ["Stryker was here"] : (stryCov_9fa48("116540"), []),
                routingSnapshot
              });
            }
          }
          canonicalLeaderServices.forEach(addService);
          if (stryMutAct_9fa48("116543") ? candidates.length !== NUM.ZERO : stryMutAct_9fa48("116542") ? false : stryMutAct_9fa48("116541") ? true : (stryCov_9fa48("116541", "116542", "116543"), candidates.length === NUM.ZERO)) {
            if (stryMutAct_9fa48("116544")) {
              {}
            } else {
              stryCov_9fa48("116544");
              // Canonical leader rows are present but were quarantined after runtime
              // no-handler witnesses. Try other live replicas to follow redirects.
              orderedServices.forEach(addService);
            }
          }
          return stryMutAct_9fa48("116545") ? {} : (stryCov_9fa48("116545"), {
            candidates,
            routingSnapshot
          });
        }
      }
      if (stryMutAct_9fa48("116547") ? false : stryMutAct_9fa48("116546") ? true : (stryCov_9fa48("116546", "116547"), prioritizeLeader)) {
        if (stryMutAct_9fa48("116548")) {
          {}
        } else {
          stryCov_9fa48("116548");
          if (stryMutAct_9fa48("116550") ? false : stryMutAct_9fa48("116549") ? true : (stryCov_9fa48("116549", "116550"), canonicalLeaderNodeId)) {
            if (stryMutAct_9fa48("116551")) {
              {}
            } else {
              stryCov_9fa48("116551");
              canonicalLeaderServices.forEach(addService);
            }
          }
          stryMutAct_9fa48("116552") ? orderedServices.forEach(addService) : (stryCov_9fa48("116552"), orderedServices.filter(stryMutAct_9fa48("116553") ? () => undefined : (stryCov_9fa48("116553"), service => stryMutAct_9fa48("116556") ? service.node_id !== this.nodeId : stryMutAct_9fa48("116555") ? false : stryMutAct_9fa48("116554") ? true : (stryCov_9fa48("116554", "116555", "116556"), service.node_id === this.nodeId))).forEach(addService));
        }
      }
      orderedServices.forEach(addService);
      return stryMutAct_9fa48("116557") ? {} : (stryCov_9fa48("116557"), {
        candidates,
        routingSnapshot
      });
    }
  }

  /**
   * Build one owner-style snapshot for partition routing diagnostics.
   * @param {string} partitionId
   * @param {string} [routingReadinessDimension]
   * @return {Object}
   */
  getPartitionRoutingSnapshot(partitionId, routingReadinessDimension = this.defaultRoutingReadinessDimension, routingOptions = {}) {
    if (stryMutAct_9fa48("116558")) {
      {}
    } else {
      stryCov_9fa48("116558");
      const serviceRows = this.getPartitionServiceRows(partitionId);
      const canonicalLeaderNodeId = this.getPartitionLeaderNodeId(partitionId);
      const evaluatedServices = serviceRows.map(stryMutAct_9fa48("116559") ? () => undefined : (stryCov_9fa48("116559"), service => stryMutAct_9fa48("116560") ? {} : (stryCov_9fa48("116560"), {
        service,
        routing: this.evaluatePartitionServiceRoutability(service, routingReadinessDimension, routingOptions)
      })));
      const activeAddressedServices = stryMutAct_9fa48("116561") ? evaluatedServices.map(entry => entry.service) : (stryCov_9fa48("116561"), evaluatedServices.filter(entry => {
        if (stryMutAct_9fa48("116562")) {
          {}
        } else {
          stryCov_9fa48("116562");
          return stryMutAct_9fa48("116565") ? entry.routing.reasonCode !== QUERY_ROUTING_DIAGNOSTIC_REASON.SERVICE_INACTIVE || entry.routing.reasonCode !== QUERY_ROUTING_DIAGNOSTIC_REASON.SERVICE_ADDRESS_MISSING : stryMutAct_9fa48("116564") ? false : stryMutAct_9fa48("116563") ? true : (stryCov_9fa48("116563", "116564", "116565"), (stryMutAct_9fa48("116567") ? entry.routing.reasonCode === QUERY_ROUTING_DIAGNOSTIC_REASON.SERVICE_INACTIVE : stryMutAct_9fa48("116566") ? true : (stryCov_9fa48("116566", "116567"), entry.routing.reasonCode !== QUERY_ROUTING_DIAGNOSTIC_REASON.SERVICE_INACTIVE)) && (stryMutAct_9fa48("116569") ? entry.routing.reasonCode === QUERY_ROUTING_DIAGNOSTIC_REASON.SERVICE_ADDRESS_MISSING : stryMutAct_9fa48("116568") ? true : (stryCov_9fa48("116568", "116569"), entry.routing.reasonCode !== QUERY_ROUTING_DIAGNOSTIC_REASON.SERVICE_ADDRESS_MISSING)));
        }
      }).map(stryMutAct_9fa48("116570") ? () => undefined : (stryCov_9fa48("116570"), entry => entry.service)));
      const routableServices = stryMutAct_9fa48("116571") ? evaluatedServices.map(entry => entry.service) : (stryCov_9fa48("116571"), evaluatedServices.filter(stryMutAct_9fa48("116572") ? () => undefined : (stryCov_9fa48("116572"), entry => stryMutAct_9fa48("116575") ? entry.routing.routable !== true : stryMutAct_9fa48("116574") ? false : stryMutAct_9fa48("116573") ? true : (stryCov_9fa48("116573", "116574", "116575"), entry.routing.routable === (stryMutAct_9fa48("116576") ? false : (stryCov_9fa48("116576"), true))))).map(stryMutAct_9fa48("116577") ? () => undefined : (stryCov_9fa48("116577"), entry => entry.service)));
      const canonicalLeaderServiceCount = canonicalLeaderNodeId ? stryMutAct_9fa48("116578") ? serviceRows.length : (stryCov_9fa48("116578"), serviceRows.filter(stryMutAct_9fa48("116579") ? () => undefined : (stryCov_9fa48("116579"), service => stryMutAct_9fa48("116582") ? service?.node_id !== canonicalLeaderNodeId : stryMutAct_9fa48("116581") ? false : stryMutAct_9fa48("116580") ? true : (stryCov_9fa48("116580", "116581", "116582"), (stryMutAct_9fa48("116583") ? service.node_id : (stryCov_9fa48("116583"), service?.node_id)) === canonicalLeaderNodeId))).length) : NUM.ZERO;
      return Object.freeze(stryMutAct_9fa48("116584") ? {} : (stryCov_9fa48("116584"), {
        partitionId,
        routingReadinessDimension,
        reasonCode: this.resolvePartitionRoutingReasonCode(serviceRows, activeAddressedServices, routableServices),
        canonicalLeaderNodeId,
        leaderKnown: stryMutAct_9fa48("116587") ? canonicalLeaderNodeId === null : stryMutAct_9fa48("116586") ? false : stryMutAct_9fa48("116585") ? true : (stryCov_9fa48("116585", "116586", "116587"), canonicalLeaderNodeId !== null),
        serviceRowCount: serviceRows.length,
        activeAddressedServiceCount: activeAddressedServices.length,
        routableServiceCount: routableServices.length,
        canonicalLeaderServiceCount,
        serviceRows: Object.freeze(stryMutAct_9fa48("116588") ? [] : (stryCov_9fa48("116588"), [...serviceRows])),
        routableServices: Object.freeze(stryMutAct_9fa48("116589") ? [] : (stryCov_9fa48("116589"), [...routableServices])),
        deniedByNodeId: this.buildRoutingDeniedNodeSummary(evaluatedServices, routingReadinessDimension)
      }));
    }
  }

  /**
   * Resolve node latency-group assignment from system cache.
   * @param {string} nodeId - Node ID.
   * @return {string|null}
   * @private
   */
  resolveNodeLatencyGroupId(nodeId) {
    if (stryMutAct_9fa48("116590")) {
      {}
    } else {
      stryCov_9fa48("116590");
      if (stryMutAct_9fa48("116593") ? !nodeId && typeof this.systemCache?.get !== QUERY_EXECUTOR_LITERAL.STRING_FUNCTION : stryMutAct_9fa48("116592") ? false : stryMutAct_9fa48("116591") ? true : (stryCov_9fa48("116591", "116592", "116593"), (stryMutAct_9fa48("116594") ? nodeId : (stryCov_9fa48("116594"), !nodeId)) || (stryMutAct_9fa48("116596") ? typeof this.systemCache?.get === QUERY_EXECUTOR_LITERAL.STRING_FUNCTION : stryMutAct_9fa48("116595") ? false : (stryCov_9fa48("116595", "116596"), typeof (stryMutAct_9fa48("116597") ? this.systemCache.get : (stryCov_9fa48("116597"), this.systemCache?.get)) !== QUERY_EXECUTOR_LITERAL.STRING_FUNCTION)))) {
        if (stryMutAct_9fa48("116598")) {
          {}
        } else {
          stryCov_9fa48("116598");
          return null;
        }
      }
      const nodeRow = this.systemCache.get(TABLES.NODES, nodeId);
      return stryMutAct_9fa48("116601") ? nodeRow?.[COLUMN.LATENCY_GROUP_ID] && null : stryMutAct_9fa48("116600") ? false : stryMutAct_9fa48("116599") ? true : (stryCov_9fa48("116599", "116600", "116601"), (stryMutAct_9fa48("116602") ? nodeRow[COLUMN.LATENCY_GROUP_ID] : (stryCov_9fa48("116602"), nodeRow?.[COLUMN.LATENCY_GROUP_ID])) || null);
    }
  }

  /**
   * Sort services to prefer same-group replicas for read queries.
   * @param {Object[]} services - Routable services.
   * @param {string|null} localGroupId - Local node's latency group.
   * @param {boolean} enabled - Preference enabled flag.
   * @return {Object[]}
   * @private
   */
  orderServicesByLatencyGroup(services, localGroupId, enabled) {
    if (stryMutAct_9fa48("116603")) {
      {}
    } else {
      stryCov_9fa48("116603");
      if (stryMutAct_9fa48("116606") ? (!enabled || !localGroupId) && typeof this.systemCache?.get !== QUERY_EXECUTOR_LITERAL.STRING_FUNCTION : stryMutAct_9fa48("116605") ? false : stryMutAct_9fa48("116604") ? true : (stryCov_9fa48("116604", "116605", "116606"), (stryMutAct_9fa48("116608") ? !enabled && !localGroupId : stryMutAct_9fa48("116607") ? false : (stryCov_9fa48("116607", "116608"), (stryMutAct_9fa48("116609") ? enabled : (stryCov_9fa48("116609"), !enabled)) || (stryMutAct_9fa48("116610") ? localGroupId : (stryCov_9fa48("116610"), !localGroupId)))) || (stryMutAct_9fa48("116612") ? typeof this.systemCache?.get === QUERY_EXECUTOR_LITERAL.STRING_FUNCTION : stryMutAct_9fa48("116611") ? false : (stryCov_9fa48("116611", "116612"), typeof (stryMutAct_9fa48("116613") ? this.systemCache.get : (stryCov_9fa48("116613"), this.systemCache?.get)) !== QUERY_EXECUTOR_LITERAL.STRING_FUNCTION)))) {
        if (stryMutAct_9fa48("116614")) {
          {}
        } else {
          stryCov_9fa48("116614");
          return services;
        }
      }
      return stryMutAct_9fa48("116615") ? [...services] : (stryCov_9fa48("116615"), (stryMutAct_9fa48("116616") ? [] : (stryCov_9fa48("116616"), [...services])).sort((left, right) => {
        if (stryMutAct_9fa48("116617")) {
          {}
        } else {
          stryCov_9fa48("116617");
          const leftGroupId = this.resolveNodeLatencyGroupId(stryMutAct_9fa48("116618") ? left.node_id : (stryCov_9fa48("116618"), left?.node_id));
          const rightGroupId = this.resolveNodeLatencyGroupId(stryMutAct_9fa48("116619") ? right.node_id : (stryCov_9fa48("116619"), right?.node_id));
          const leftPreferred = stryMutAct_9fa48("116622") ? leftGroupId !== localGroupId : stryMutAct_9fa48("116621") ? false : stryMutAct_9fa48("116620") ? true : (stryCov_9fa48("116620", "116621", "116622"), leftGroupId === localGroupId);
          const rightPreferred = stryMutAct_9fa48("116625") ? rightGroupId !== localGroupId : stryMutAct_9fa48("116624") ? false : stryMutAct_9fa48("116623") ? true : (stryCov_9fa48("116623", "116624", "116625"), rightGroupId === localGroupId);
          if (stryMutAct_9fa48("116628") ? leftPreferred || !rightPreferred : stryMutAct_9fa48("116627") ? false : stryMutAct_9fa48("116626") ? true : (stryCov_9fa48("116626", "116627", "116628"), leftPreferred && (stryMutAct_9fa48("116629") ? rightPreferred : (stryCov_9fa48("116629"), !rightPreferred)))) {
            if (stryMutAct_9fa48("116630")) {
              {}
            } else {
              stryCov_9fa48("116630");
              return NUM.NEGATIVE_ONE;
            }
          }
          if (stryMutAct_9fa48("116633") ? !leftPreferred || rightPreferred : stryMutAct_9fa48("116632") ? false : stryMutAct_9fa48("116631") ? true : (stryCov_9fa48("116631", "116632", "116633"), (stryMutAct_9fa48("116634") ? leftPreferred : (stryCov_9fa48("116634"), !leftPreferred)) && rightPreferred)) {
            if (stryMutAct_9fa48("116635")) {
              {}
            } else {
              stryCov_9fa48("116635");
              return NUM.ONE;
            }
          }
          return NUM.ZERO;
        }
      }));
    }
  }

  /**
   * Resolve partition service rows from cache and overlay metadata.
   * @param {string} partitionId - Partition ID.
   * @return {Array<Object>} Partition service rows.
   * @private
   */
  getPartitionServiceRows(partitionId) {
    if (stryMutAct_9fa48("116636")) {
      {}
    } else {
      stryCov_9fa48("116636");
      const overlayServices = this.getOverlayPartitionServices(partitionId);
      const hasOverlayServices = stryMutAct_9fa48("116640") ? overlayServices.length <= 0 : stryMutAct_9fa48("116639") ? overlayServices.length >= 0 : stryMutAct_9fa48("116638") ? false : stryMutAct_9fa48("116637") ? true : (stryCov_9fa48("116637", "116638", "116639", "116640"), overlayServices.length > 0);
      if (stryMutAct_9fa48("116643") ? !this.systemCache || !hasOverlayServices : stryMutAct_9fa48("116642") ? false : stryMutAct_9fa48("116641") ? true : (stryCov_9fa48("116641", "116642", "116643"), (stryMutAct_9fa48("116644") ? this.systemCache : (stryCov_9fa48("116644"), !this.systemCache)) && (stryMutAct_9fa48("116645") ? hasOverlayServices : (stryCov_9fa48("116645"), !hasOverlayServices)))) {
        if (stryMutAct_9fa48("116646")) {
          {}
        } else {
          stryCov_9fa48("116646");
          this.logger.warn(LOG_MSG.SYSTEM_CACHE_PARTITION_LOOKUP_UNAVAILABLE, stryMutAct_9fa48("116647") ? {} : (stryCov_9fa48("116647"), {
            partitionId
          }));
          return stryMutAct_9fa48("116648") ? ["Stryker was here"] : (stryCov_9fa48("116648"), []);
        }
      }
      if (stryMutAct_9fa48("116651") ? !hasOverlayServices || typeof this.systemCache?.filter !== QUERY_EXECUTOR_LITERAL.STRING_FUNCTION : stryMutAct_9fa48("116650") ? false : stryMutAct_9fa48("116649") ? true : (stryCov_9fa48("116649", "116650", "116651"), (stryMutAct_9fa48("116652") ? hasOverlayServices : (stryCov_9fa48("116652"), !hasOverlayServices)) && (stryMutAct_9fa48("116654") ? typeof this.systemCache?.filter === QUERY_EXECUTOR_LITERAL.STRING_FUNCTION : stryMutAct_9fa48("116653") ? true : (stryCov_9fa48("116653", "116654"), typeof (stryMutAct_9fa48("116655") ? this.systemCache.filter : (stryCov_9fa48("116655"), this.systemCache?.filter)) !== QUERY_EXECUTOR_LITERAL.STRING_FUNCTION)))) {
        if (stryMutAct_9fa48("116656")) {
          {}
        } else {
          stryCov_9fa48("116656");
          this.logger.warn(QUERY_LOG_MSG.SYSTEM_CACHE_FILTER_UNSUPPORTED, stryMutAct_9fa48("116657") ? {} : (stryCov_9fa48("116657"), {
            partitionId
          }));
          return stryMutAct_9fa48("116658") ? ["Stryker was here"] : (stryCov_9fa48("116658"), []);
        }
      }
      const services = stryMutAct_9fa48("116659") ? ["Stryker was here"] : (stryCov_9fa48("116659"), []);

      // Overlay metadata is authoritative during runtime repair and must
      // override stale cache rows for the same replica/service identity.
      const overlayRows = stryMutAct_9fa48("116660") ? this.getOverlayPartitionServices(partitionId) : (stryCov_9fa48("116660"), this.getOverlayPartitionServices(partitionId).filter(stryMutAct_9fa48("116661") ? () => undefined : (stryCov_9fa48("116661"), service => stryMutAct_9fa48("116664") ? service.partition_id === partitionId || service.service_type === SERVICE_TYPE.PARTITION : stryMutAct_9fa48("116663") ? false : stryMutAct_9fa48("116662") ? true : (stryCov_9fa48("116662", "116663", "116664"), (stryMutAct_9fa48("116666") ? service.partition_id !== partitionId : stryMutAct_9fa48("116665") ? true : (stryCov_9fa48("116665", "116666"), service.partition_id === partitionId)) && (stryMutAct_9fa48("116668") ? service.service_type !== SERVICE_TYPE.PARTITION : stryMutAct_9fa48("116667") ? true : (stryCov_9fa48("116667", "116668"), service.service_type === SERVICE_TYPE.PARTITION))))));
      services.push(...overlayRows);
      if (stryMutAct_9fa48("116671") ? this.systemCache || typeof this.systemCache.filter === QUERY_EXECUTOR_LITERAL.STRING_FUNCTION : stryMutAct_9fa48("116670") ? false : stryMutAct_9fa48("116669") ? true : (stryCov_9fa48("116669", "116670", "116671"), this.systemCache && (stryMutAct_9fa48("116673") ? typeof this.systemCache.filter !== QUERY_EXECUTOR_LITERAL.STRING_FUNCTION : stryMutAct_9fa48("116672") ? true : (stryCov_9fa48("116672", "116673"), typeof this.systemCache.filter === QUERY_EXECUTOR_LITERAL.STRING_FUNCTION)))) {
        if (stryMutAct_9fa48("116674")) {
          {}
        } else {
          stryCov_9fa48("116674");
          const cacheRows = stryMutAct_9fa48("116677") ? this.systemCache.filter(TABLES.SERVICES, service => service.partition_id === partitionId && service.service_type === SERVICE_TYPE.PARTITION) && [] : stryMutAct_9fa48("116676") ? false : stryMutAct_9fa48("116675") ? true : (stryCov_9fa48("116675", "116676", "116677"), (stryMutAct_9fa48("116678") ? this.systemCache : (stryCov_9fa48("116678"), this.systemCache.filter(TABLES.SERVICES, stryMutAct_9fa48("116679") ? () => undefined : (stryCov_9fa48("116679"), service => stryMutAct_9fa48("116682") ? service.partition_id === partitionId || service.service_type === SERVICE_TYPE.PARTITION : stryMutAct_9fa48("116681") ? false : stryMutAct_9fa48("116680") ? true : (stryCov_9fa48("116680", "116681", "116682"), (stryMutAct_9fa48("116684") ? service.partition_id !== partitionId : stryMutAct_9fa48("116683") ? true : (stryCov_9fa48("116683", "116684"), service.partition_id === partitionId)) && (stryMutAct_9fa48("116686") ? service.service_type !== SERVICE_TYPE.PARTITION : stryMutAct_9fa48("116685") ? true : (stryCov_9fa48("116685", "116686"), service.service_type === SERVICE_TYPE.PARTITION))))))) || (stryMutAct_9fa48("116687") ? ["Stryker was here"] : (stryCov_9fa48("116687"), [])));
          services.push(...cacheRows);
        }
      }
      if (stryMutAct_9fa48("116690") ? services.length !== NUM.ZERO : stryMutAct_9fa48("116689") ? false : stryMutAct_9fa48("116688") ? true : (stryCov_9fa48("116688", "116689", "116690"), services.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("116691")) {
          {}
        } else {
          stryCov_9fa48("116691");
          return stryMutAct_9fa48("116692") ? ["Stryker was here"] : (stryCov_9fa48("116692"), []);
        }
      }
      const deduped = stryMutAct_9fa48("116693") ? ["Stryker was here"] : (stryCov_9fa48("116693"), []);
      const seen = new Set();
      for (const service of services) {
        if (stryMutAct_9fa48("116694")) {
          {}
        } else {
          stryCov_9fa48("116694");
          const dedupeKey = stryMutAct_9fa48("116697") ? (service.service_id || service.replica_id) && service.address : stryMutAct_9fa48("116696") ? false : stryMutAct_9fa48("116695") ? true : (stryCov_9fa48("116695", "116696", "116697"), (stryMutAct_9fa48("116699") ? service.service_id && service.replica_id : stryMutAct_9fa48("116698") ? false : (stryCov_9fa48("116698", "116699"), service.service_id || service.replica_id)) || service.address);
          if (stryMutAct_9fa48("116702") ? !dedupeKey && seen.has(dedupeKey) : stryMutAct_9fa48("116701") ? false : stryMutAct_9fa48("116700") ? true : (stryCov_9fa48("116700", "116701", "116702"), (stryMutAct_9fa48("116703") ? dedupeKey : (stryCov_9fa48("116703"), !dedupeKey)) || seen.has(dedupeKey))) {
            if (stryMutAct_9fa48("116704")) {
              {}
            } else {
              stryCov_9fa48("116704");
              continue;
            }
          }
          seen.add(dedupeKey);
          deduped.push(service);
        }
      }
      return deduped;
    }
  }

  /**
   * Resolve one typed routing reason from the partition service snapshot.
   * @param {Object[]} serviceRows
   * @param {Object[]} activeAddressedServices
   * @param {Object[]} routableServices
   * @return {string}
   * @private
   */
  resolvePartitionRoutingReasonCode(serviceRows, activeAddressedServices, routableServices) {
    if (stryMutAct_9fa48("116705")) {
      {}
    } else {
      stryCov_9fa48("116705");
      if (stryMutAct_9fa48("116708") ? serviceRows.length !== NUM.ZERO : stryMutAct_9fa48("116707") ? false : stryMutAct_9fa48("116706") ? true : (stryCov_9fa48("116706", "116707", "116708"), serviceRows.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("116709")) {
          {}
        } else {
          stryCov_9fa48("116709");
          return QUERY_ROUTING_DIAGNOSTIC_REASON.NO_SERVICE_ROWS;
        }
      }
      if (stryMutAct_9fa48("116712") ? activeAddressedServices.length !== NUM.ZERO : stryMutAct_9fa48("116711") ? false : stryMutAct_9fa48("116710") ? true : (stryCov_9fa48("116710", "116711", "116712"), activeAddressedServices.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("116713")) {
          {}
        } else {
          stryCov_9fa48("116713");
          return QUERY_ROUTING_DIAGNOSTIC_REASON.NO_ACTIVE_ADDRESSED_SERVICES;
        }
      }
      if (stryMutAct_9fa48("116716") ? routableServices.length !== NUM.ZERO : stryMutAct_9fa48("116715") ? false : stryMutAct_9fa48("116714") ? true : (stryCov_9fa48("116714", "116715", "116716"), routableServices.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("116717")) {
          {}
        } else {
          stryCov_9fa48("116717");
          return QUERY_ROUTING_DIAGNOSTIC_REASON.ALL_SERVICES_FILTERED_BY_READINESS;
        }
      }
      return QUERY_ROUTING_DIAGNOSTIC_REASON.OK;
    }
  }

  /**
   * Build per-node denial summaries for one routing snapshot.
   * @param {Array<Object>} evaluatedServices
   * @param {string} routingReadinessDimension
   * @return {Object}
   * @private
   */
  buildRoutingDeniedNodeSummary(evaluatedServices, routingReadinessDimension) {
    if (stryMutAct_9fa48("116718")) {
      {}
    } else {
      stryCov_9fa48("116718");
      const deniedByNodeId = {};
      for (const entry of Array.isArray(evaluatedServices) ? evaluatedServices : stryMutAct_9fa48("116719") ? ["Stryker was here"] : (stryCov_9fa48("116719"), [])) {
        if (stryMutAct_9fa48("116720")) {
          {}
        } else {
          stryCov_9fa48("116720");
          const service = stryMutAct_9fa48("116723") ? entry?.service && null : stryMutAct_9fa48("116722") ? false : stryMutAct_9fa48("116721") ? true : (stryCov_9fa48("116721", "116722", "116723"), (stryMutAct_9fa48("116724") ? entry.service : (stryCov_9fa48("116724"), entry?.service)) || null);
          const routing = stryMutAct_9fa48("116727") ? entry?.routing && null : stryMutAct_9fa48("116726") ? false : stryMutAct_9fa48("116725") ? true : (stryCov_9fa48("116725", "116726", "116727"), (stryMutAct_9fa48("116728") ? entry.routing : (stryCov_9fa48("116728"), entry?.routing)) || null);
          const nodeId = String(stryMutAct_9fa48("116731") ? (service?.node_id || service?.nodeId) && '' : stryMutAct_9fa48("116730") ? false : stryMutAct_9fa48("116729") ? true : (stryCov_9fa48("116729", "116730", "116731"), (stryMutAct_9fa48("116733") ? service?.node_id && service?.nodeId : stryMutAct_9fa48("116732") ? false : (stryCov_9fa48("116732", "116733"), (stryMutAct_9fa48("116734") ? service.node_id : (stryCov_9fa48("116734"), service?.node_id)) || (stryMutAct_9fa48("116735") ? service.nodeId : (stryCov_9fa48("116735"), service?.nodeId)))) || (stryMutAct_9fa48("116736") ? "Stryker was here!" : (stryCov_9fa48("116736"), ''))));
          if (stryMutAct_9fa48("116739") ? (!nodeId || !routing || routing.routable === true) && !routing.readinessSummary : stryMutAct_9fa48("116738") ? false : stryMutAct_9fa48("116737") ? true : (stryCov_9fa48("116737", "116738", "116739"), (stryMutAct_9fa48("116741") ? (!nodeId || !routing) && routing.routable === true : stryMutAct_9fa48("116740") ? false : (stryCov_9fa48("116740", "116741"), (stryMutAct_9fa48("116743") ? !nodeId && !routing : stryMutAct_9fa48("116742") ? false : (stryCov_9fa48("116742", "116743"), (stryMutAct_9fa48("116744") ? nodeId : (stryCov_9fa48("116744"), !nodeId)) || (stryMutAct_9fa48("116745") ? routing : (stryCov_9fa48("116745"), !routing)))) || (stryMutAct_9fa48("116747") ? routing.routable !== true : stryMutAct_9fa48("116746") ? false : (stryCov_9fa48("116746", "116747"), routing.routable === (stryMutAct_9fa48("116748") ? false : (stryCov_9fa48("116748"), true)))))) || (stryMutAct_9fa48("116749") ? routing.readinessSummary : (stryCov_9fa48("116749"), !routing.readinessSummary)))) {
            if (stryMutAct_9fa48("116750")) {
              {}
            } else {
              stryCov_9fa48("116750");
              continue;
            }
          }
          const existing = stryMutAct_9fa48("116753") ? deniedByNodeId[nodeId] && {
            decisionDimension: routingReadinessDimension,
            observedAt: routing.readinessSummary.observedAt || null,
            lifecycleState: routing.readinessSummary.lifecycleState || null,
            reasonCodes: [],
            failedDimensions: []
          } : stryMutAct_9fa48("116752") ? false : stryMutAct_9fa48("116751") ? true : (stryCov_9fa48("116751", "116752", "116753"), deniedByNodeId[nodeId] || (stryMutAct_9fa48("116754") ? {} : (stryCov_9fa48("116754"), {
            decisionDimension: routingReadinessDimension,
            observedAt: stryMutAct_9fa48("116757") ? routing.readinessSummary.observedAt && null : stryMutAct_9fa48("116756") ? false : stryMutAct_9fa48("116755") ? true : (stryCov_9fa48("116755", "116756", "116757"), routing.readinessSummary.observedAt || null),
            lifecycleState: stryMutAct_9fa48("116760") ? routing.readinessSummary.lifecycleState && null : stryMutAct_9fa48("116759") ? false : stryMutAct_9fa48("116758") ? true : (stryCov_9fa48("116758", "116759", "116760"), routing.readinessSummary.lifecycleState || null),
            reasonCodes: stryMutAct_9fa48("116761") ? ["Stryker was here"] : (stryCov_9fa48("116761"), []),
            failedDimensions: stryMutAct_9fa48("116762") ? ["Stryker was here"] : (stryCov_9fa48("116762"), [])
          })));
          for (const reasonCode of routing.readinessSummary.reasonCodes) {
            if (stryMutAct_9fa48("116763")) {
              {}
            } else {
              stryCov_9fa48("116763");
              if (stryMutAct_9fa48("116766") ? false : stryMutAct_9fa48("116765") ? true : stryMutAct_9fa48("116764") ? existing.reasonCodes.includes(reasonCode) : (stryCov_9fa48("116764", "116765", "116766"), !existing.reasonCodes.includes(reasonCode))) {
                if (stryMutAct_9fa48("116767")) {
                  {}
                } else {
                  stryCov_9fa48("116767");
                  existing.reasonCodes.push(reasonCode);
                }
              }
            }
          }
          for (const failedDimension of routing.readinessSummary.failedDimensions) {
            if (stryMutAct_9fa48("116768")) {
              {}
            } else {
              stryCov_9fa48("116768");
              if (stryMutAct_9fa48("116771") ? false : stryMutAct_9fa48("116770") ? true : stryMutAct_9fa48("116769") ? existing.failedDimensions.includes(failedDimension) : (stryCov_9fa48("116769", "116770", "116771"), !existing.failedDimensions.includes(failedDimension))) {
                if (stryMutAct_9fa48("116772")) {
                  {}
                } else {
                  stryCov_9fa48("116772");
                  existing.failedDimensions.push(failedDimension);
                }
              }
            }
          }
          deniedByNodeId[nodeId] = existing;
        }
      }
      return Object.freeze(deniedByNodeId);
    }
  }

  /**
   * Build a compact routing snapshot summary suitable for logs.
   * @param {Object|null} routingSnapshot
   * @return {Object|null}
   * @private
   */
  summarizePartitionRoutingSnapshot(routingSnapshot) {
    if (stryMutAct_9fa48("116773")) {
      {}
    } else {
      stryCov_9fa48("116773");
      if (stryMutAct_9fa48("116776") ? !routingSnapshot && typeof routingSnapshot !== QUERY_EXECUTOR_LITERAL.STRING_OBJECT : stryMutAct_9fa48("116775") ? false : stryMutAct_9fa48("116774") ? true : (stryCov_9fa48("116774", "116775", "116776"), (stryMutAct_9fa48("116777") ? routingSnapshot : (stryCov_9fa48("116777"), !routingSnapshot)) || (stryMutAct_9fa48("116779") ? typeof routingSnapshot === QUERY_EXECUTOR_LITERAL.STRING_OBJECT : stryMutAct_9fa48("116778") ? false : (stryCov_9fa48("116778", "116779"), typeof routingSnapshot !== QUERY_EXECUTOR_LITERAL.STRING_OBJECT)))) {
        if (stryMutAct_9fa48("116780")) {
          {}
        } else {
          stryCov_9fa48("116780");
          return null;
        }
      }
      return stryMutAct_9fa48("116781") ? {} : (stryCov_9fa48("116781"), {
        reasonCode: stryMutAct_9fa48("116784") ? routingSnapshot.reasonCode && null : stryMutAct_9fa48("116783") ? false : stryMutAct_9fa48("116782") ? true : (stryCov_9fa48("116782", "116783", "116784"), routingSnapshot.reasonCode || null),
        routingReadinessDimension: stryMutAct_9fa48("116787") ? routingSnapshot.routingReadinessDimension && null : stryMutAct_9fa48("116786") ? false : stryMutAct_9fa48("116785") ? true : (stryCov_9fa48("116785", "116786", "116787"), routingSnapshot.routingReadinessDimension || null),
        serviceRowCount: Number(stryMutAct_9fa48("116790") ? routingSnapshot.serviceRowCount && NUM.ZERO : stryMutAct_9fa48("116789") ? false : stryMutAct_9fa48("116788") ? true : (stryCov_9fa48("116788", "116789", "116790"), routingSnapshot.serviceRowCount || NUM.ZERO)),
        activeAddressedServiceCount: Number(stryMutAct_9fa48("116793") ? routingSnapshot.activeAddressedServiceCount && NUM.ZERO : stryMutAct_9fa48("116792") ? false : stryMutAct_9fa48("116791") ? true : (stryCov_9fa48("116791", "116792", "116793"), routingSnapshot.activeAddressedServiceCount || NUM.ZERO)),
        routableServiceCount: Number(stryMutAct_9fa48("116796") ? routingSnapshot.routableServiceCount && NUM.ZERO : stryMutAct_9fa48("116795") ? false : stryMutAct_9fa48("116794") ? true : (stryCov_9fa48("116794", "116795", "116796"), routingSnapshot.routableServiceCount || NUM.ZERO)),
        canonicalLeaderServiceCount: Number(stryMutAct_9fa48("116799") ? routingSnapshot.canonicalLeaderServiceCount && NUM.ZERO : stryMutAct_9fa48("116798") ? false : stryMutAct_9fa48("116797") ? true : (stryCov_9fa48("116797", "116798", "116799"), routingSnapshot.canonicalLeaderServiceCount || NUM.ZERO)),
        leaderKnown: stryMutAct_9fa48("116802") ? routingSnapshot.leaderKnown !== true : stryMutAct_9fa48("116801") ? false : stryMutAct_9fa48("116800") ? true : (stryCov_9fa48("116800", "116801", "116802"), routingSnapshot.leaderKnown === (stryMutAct_9fa48("116803") ? false : (stryCov_9fa48("116803"), true))),
        canonicalLeaderNodeId: stryMutAct_9fa48("116806") ? routingSnapshot.canonicalLeaderNodeId && null : stryMutAct_9fa48("116805") ? false : stryMutAct_9fa48("116804") ? true : (stryCov_9fa48("116804", "116805", "116806"), routingSnapshot.canonicalLeaderNodeId || null),
        deniedByNodeId: stryMutAct_9fa48("116809") ? routingSnapshot.deniedByNodeId && {} : stryMutAct_9fa48("116808") ? false : stryMutAct_9fa48("116807") ? true : (stryCov_9fa48("116807", "116808", "116809"), routingSnapshot.deniedByNodeId || {})
      });
    }
  }

  /**
   * Emit typed diagnostics when partition routing has no usable candidates.
   * @param {Object|null} routingSnapshot
   * @private
   */
  logPartitionRoutingDenial(routingSnapshot) {
    if (stryMutAct_9fa48("116810")) {
      {}
    } else {
      stryCov_9fa48("116810");
      const reasonCode = String(stryMutAct_9fa48("116813") ? routingSnapshot?.reasonCode && QUERY_ROUTING_DIAGNOSTIC_REASON.NO_SERVICE_ROWS : stryMutAct_9fa48("116812") ? false : stryMutAct_9fa48("116811") ? true : (stryCov_9fa48("116811", "116812", "116813"), (stryMutAct_9fa48("116814") ? routingSnapshot.reasonCode : (stryCov_9fa48("116814"), routingSnapshot?.reasonCode)) || QUERY_ROUTING_DIAGNOSTIC_REASON.NO_SERVICE_ROWS));
      const warnKey = String(stryMutAct_9fa48("116817") ? routingSnapshot?.partitionId && '' : stryMutAct_9fa48("116816") ? false : stryMutAct_9fa48("116815") ? true : (stryCov_9fa48("116815", "116816", "116817"), (stryMutAct_9fa48("116818") ? routingSnapshot.partitionId : (stryCov_9fa48("116818"), routingSnapshot?.partitionId)) || (stryMutAct_9fa48("116819") ? "Stryker was here!" : (stryCov_9fa48("116819"), '')))) + (stryMutAct_9fa48("116820") ? "" : (stryCov_9fa48("116820"), ':')) + reasonCode;
      const now = Date.now();
      const lastWarnAt = this.noServiceWarnLastAt.get(warnKey);
      if (stryMutAct_9fa48("116823") ? Number.isFinite(lastWarnAt) || now - lastWarnAt < this.noServiceWarnThrottleMs : stryMutAct_9fa48("116822") ? false : stryMutAct_9fa48("116821") ? true : (stryCov_9fa48("116821", "116822", "116823"), Number.isFinite(lastWarnAt) && (stryMutAct_9fa48("116826") ? now - lastWarnAt >= this.noServiceWarnThrottleMs : stryMutAct_9fa48("116825") ? now - lastWarnAt <= this.noServiceWarnThrottleMs : stryMutAct_9fa48("116824") ? true : (stryCov_9fa48("116824", "116825", "116826"), (stryMutAct_9fa48("116827") ? now + lastWarnAt : (stryCov_9fa48("116827"), now - lastWarnAt)) < this.noServiceWarnThrottleMs)))) {
        if (stryMutAct_9fa48("116828")) {
          {}
        } else {
          stryCov_9fa48("116828");
          return;
        }
      }
      this.noServiceWarnLastAt.set(warnKey, now);
      const message = (stryMutAct_9fa48("116831") ? reasonCode !== QUERY_ROUTING_DIAGNOSTIC_REASON.ALL_SERVICES_FILTERED_BY_READINESS : stryMutAct_9fa48("116830") ? false : stryMutAct_9fa48("116829") ? true : (stryCov_9fa48("116829", "116830", "116831"), reasonCode === QUERY_ROUTING_DIAGNOSTIC_REASON.ALL_SERVICES_FILTERED_BY_READINESS)) ? QUERY_LOG_MSG.PARTITION_ROUTING_CANDIDATES_FILTERED : QUERY_LOG_MSG.NO_ACTIVE_SERVICE_FOR_PARTITION;
      this.logger.warn(message, stryMutAct_9fa48("116832") ? {} : (stryCov_9fa48("116832"), {
        partitionId: stryMutAct_9fa48("116835") ? routingSnapshot?.partitionId && null : stryMutAct_9fa48("116834") ? false : stryMutAct_9fa48("116833") ? true : (stryCov_9fa48("116833", "116834", "116835"), (stryMutAct_9fa48("116836") ? routingSnapshot.partitionId : (stryCov_9fa48("116836"), routingSnapshot?.partitionId)) || null),
        routingSnapshot: this.summarizePartitionRoutingSnapshot(routingSnapshot)
      }));
    }
  }

  /**
   * Await one authoritative readiness repair when routing denial indicates the
   * local cache filtered all active candidates based on stale node evidence.
   * @param {Object|null} routingSnapshot
   * @return {Promise<boolean>}
   * @private
   */
  async maybeAwaitDeniedPartitionRoutingRepair(routingSnapshot, options = {}) {
    if (stryMutAct_9fa48("116837")) {
      {}
    } else {
      stryCov_9fa48("116837");
      if (stryMutAct_9fa48("116840") ? false : stryMutAct_9fa48("116839") ? true : stryMutAct_9fa48("116838") ? routingSnapshot : (stryCov_9fa48("116838", "116839", "116840"), !routingSnapshot)) {
        if (stryMutAct_9fa48("116841")) {
          {}
        } else {
          stryCov_9fa48("116841");
          return stryMutAct_9fa48("116842") ? true : (stryCov_9fa48("116842"), false);
        }
      }
      const allowReadinessAuthoritativeRefresh = this.shouldAllowRoutingAuthoritativeRefresh(options);
      const canRefreshReadiness = stryMutAct_9fa48("116845") ? this.controlPlaneReadinessService || typeof this.controlPlaneReadinessService.getNodeReadiness === 'function' : stryMutAct_9fa48("116844") ? false : stryMutAct_9fa48("116843") ? true : (stryCov_9fa48("116843", "116844", "116845"), this.controlPlaneReadinessService && (stryMutAct_9fa48("116847") ? typeof this.controlPlaneReadinessService.getNodeReadiness !== 'function' : stryMutAct_9fa48("116846") ? true : (stryCov_9fa48("116846", "116847"), typeof this.controlPlaneReadinessService.getNodeReadiness === (stryMutAct_9fa48("116848") ? "" : (stryCov_9fa48("116848"), 'function')))));
      const deniedNodeIds = (stryMutAct_9fa48("116851") ? routingSnapshot.reasonCode === QUERY_ROUTING_DIAGNOSTIC_REASON.ALL_SERVICES_FILTERED_BY_READINESS || routingSnapshot.activeAddressedServiceCount > NUM.ZERO : stryMutAct_9fa48("116850") ? false : stryMutAct_9fa48("116849") ? true : (stryCov_9fa48("116849", "116850", "116851"), (stryMutAct_9fa48("116853") ? routingSnapshot.reasonCode !== QUERY_ROUTING_DIAGNOSTIC_REASON.ALL_SERVICES_FILTERED_BY_READINESS : stryMutAct_9fa48("116852") ? true : (stryCov_9fa48("116852", "116853"), routingSnapshot.reasonCode === QUERY_ROUTING_DIAGNOSTIC_REASON.ALL_SERVICES_FILTERED_BY_READINESS)) && (stryMutAct_9fa48("116856") ? routingSnapshot.activeAddressedServiceCount <= NUM.ZERO : stryMutAct_9fa48("116855") ? routingSnapshot.activeAddressedServiceCount >= NUM.ZERO : stryMutAct_9fa48("116854") ? true : (stryCov_9fa48("116854", "116855", "116856"), routingSnapshot.activeAddressedServiceCount > NUM.ZERO)))) ? Object.keys(stryMutAct_9fa48("116859") ? routingSnapshot.deniedByNodeId && {} : stryMutAct_9fa48("116858") ? false : stryMutAct_9fa48("116857") ? true : (stryCov_9fa48("116857", "116858", "116859"), routingSnapshot.deniedByNodeId || {})) : stryMutAct_9fa48("116860") ? ["Stryker was here"] : (stryCov_9fa48("116860"), []);
      const shouldRepairServiceGap = this.shouldRepairCanonicalLeaderServiceGap(routingSnapshot);
      const repairNodeIds = new Set(deniedNodeIds);
      if (stryMutAct_9fa48("116862") ? false : stryMutAct_9fa48("116861") ? true : (stryCov_9fa48("116861", "116862"), shouldRepairServiceGap)) {
        if (stryMutAct_9fa48("116863")) {
          {}
        } else {
          stryCov_9fa48("116863");
          repairNodeIds.add(routingSnapshot.canonicalLeaderNodeId);
        }
      }
      let attemptedRepair = stryMutAct_9fa48("116864") ? true : (stryCov_9fa48("116864"), false);
      if (stryMutAct_9fa48("116867") ? allowReadinessAuthoritativeRefresh && canRefreshReadiness || repairNodeIds.size > NUM.ZERO : stryMutAct_9fa48("116866") ? false : stryMutAct_9fa48("116865") ? true : (stryCov_9fa48("116865", "116866", "116867"), (stryMutAct_9fa48("116869") ? allowReadinessAuthoritativeRefresh || canRefreshReadiness : stryMutAct_9fa48("116868") ? true : (stryCov_9fa48("116868", "116869"), allowReadinessAuthoritativeRefresh && canRefreshReadiness)) && (stryMutAct_9fa48("116872") ? repairNodeIds.size <= NUM.ZERO : stryMutAct_9fa48("116871") ? repairNodeIds.size >= NUM.ZERO : stryMutAct_9fa48("116870") ? true : (stryCov_9fa48("116870", "116871", "116872"), repairNodeIds.size > NUM.ZERO)))) {
        if (stryMutAct_9fa48("116873")) {
          {}
        } else {
          stryCov_9fa48("116873");
          attemptedRepair = stryMutAct_9fa48("116874") ? false : (stryCov_9fa48("116874"), true);
          await Promise.all((stryMutAct_9fa48("116875") ? [] : (stryCov_9fa48("116875"), [...repairNodeIds])).map(async nodeId => {
            if (stryMutAct_9fa48("116876")) {
              {}
            } else {
              stryCov_9fa48("116876");
              try {
                if (stryMutAct_9fa48("116877")) {
                  {}
                } else {
                  stryCov_9fa48("116877");
                  await this.controlPlaneReadinessService.getNodeReadiness(nodeId, stryMutAct_9fa48("116878") ? {} : (stryCov_9fa48("116878"), {
                    allowAuthoritativeRefresh: stryMutAct_9fa48("116879") ? false : (stryCov_9fa48("116879"), true),
                    requireFreshOnIneligible: stryMutAct_9fa48("116880") ? false : (stryCov_9fa48("116880"), true),
                    decisionDimension: routingSnapshot.routingReadinessDimension
                  }));
                }
              } catch (_error) {
                if (stryMutAct_9fa48("116881")) {
                  {}
                } else {
                  stryCov_9fa48("116881");
                  return null;
                }
              }
              return null;
            }
          }));
        }
      }
      if (stryMutAct_9fa48("116884") ? false : stryMutAct_9fa48("116883") ? true : stryMutAct_9fa48("116882") ? shouldRepairServiceGap : (stryCov_9fa48("116882", "116883", "116884"), !shouldRepairServiceGap)) {
        if (stryMutAct_9fa48("116885")) {
          {}
        } else {
          stryCov_9fa48("116885");
          return attemptedRepair;
        }
      }
      const overlayRepaired = await this.refreshRoutingMetadataOverlay(routingSnapshot, stryMutAct_9fa48("116886") ? {} : (stryCov_9fa48("116886"), {
        partitionId: stryMutAct_9fa48("116889") ? routingSnapshot.partitionId && null : stryMutAct_9fa48("116888") ? false : stryMutAct_9fa48("116887") ? true : (stryCov_9fa48("116887", "116888", "116889"), routingSnapshot.partitionId || null),
        routingReadinessDimension: stryMutAct_9fa48("116892") ? routingSnapshot.routingReadinessDimension && this.defaultRoutingReadinessDimension : stryMutAct_9fa48("116891") ? false : stryMutAct_9fa48("116890") ? true : (stryCov_9fa48("116890", "116891", "116892"), routingSnapshot.routingReadinessDimension || this.defaultRoutingReadinessDimension),
        refreshReason: QUERY_ROUTING_REPAIR_REASON.NO_HANDLER_STALE_SERVICE
      }));
      return stryMutAct_9fa48("116895") ? attemptedRepair && overlayRepaired : stryMutAct_9fa48("116894") ? false : stryMutAct_9fa48("116893") ? true : (stryCov_9fa48("116893", "116894", "116895"), attemptedRepair || overlayRepaired);
    }
  }

  /**
   * Return true when authoritative node/service repair should refresh the
   * canonical leader node because its service rows are missing locally, either
   * while peer replicas remain visible or when the local cache has no service
   * rows for the partition at all.
   * @param {Object|null} routingSnapshot
   * @return {boolean}
   * @private
   */
  shouldRepairCanonicalLeaderServiceGap(routingSnapshot) {
    if (stryMutAct_9fa48("116896")) {
      {}
    } else {
      stryCov_9fa48("116896");
      return Boolean(stryMutAct_9fa48("116899") ? routingSnapshot && routingSnapshot.leaderKnown === true && typeof routingSnapshot.canonicalLeaderNodeId === QUERY_EXECUTOR_LITERAL.STRING_STRING && routingSnapshot.canonicalLeaderNodeId.length > NUM.ZERO && Number(routingSnapshot.canonicalLeaderServiceCount) === NUM.ZERO || Number(routingSnapshot.activeAddressedServiceCount) > NUM.ZERO || Number(routingSnapshot.serviceRowCount) === NUM.ZERO : stryMutAct_9fa48("116898") ? false : stryMutAct_9fa48("116897") ? true : (stryCov_9fa48("116897", "116898", "116899"), (stryMutAct_9fa48("116901") ? routingSnapshot && routingSnapshot.leaderKnown === true && typeof routingSnapshot.canonicalLeaderNodeId === QUERY_EXECUTOR_LITERAL.STRING_STRING && routingSnapshot.canonicalLeaderNodeId.length > NUM.ZERO || Number(routingSnapshot.canonicalLeaderServiceCount) === NUM.ZERO : stryMutAct_9fa48("116900") ? true : (stryCov_9fa48("116900", "116901"), (stryMutAct_9fa48("116903") ? routingSnapshot && routingSnapshot.leaderKnown === true && typeof routingSnapshot.canonicalLeaderNodeId === QUERY_EXECUTOR_LITERAL.STRING_STRING || routingSnapshot.canonicalLeaderNodeId.length > NUM.ZERO : stryMutAct_9fa48("116902") ? true : (stryCov_9fa48("116902", "116903"), (stryMutAct_9fa48("116905") ? routingSnapshot && routingSnapshot.leaderKnown === true || typeof routingSnapshot.canonicalLeaderNodeId === QUERY_EXECUTOR_LITERAL.STRING_STRING : stryMutAct_9fa48("116904") ? true : (stryCov_9fa48("116904", "116905"), (stryMutAct_9fa48("116907") ? routingSnapshot || routingSnapshot.leaderKnown === true : stryMutAct_9fa48("116906") ? true : (stryCov_9fa48("116906", "116907"), routingSnapshot && (stryMutAct_9fa48("116909") ? routingSnapshot.leaderKnown !== true : stryMutAct_9fa48("116908") ? true : (stryCov_9fa48("116908", "116909"), routingSnapshot.leaderKnown === (stryMutAct_9fa48("116910") ? false : (stryCov_9fa48("116910"), true)))))) && (stryMutAct_9fa48("116912") ? typeof routingSnapshot.canonicalLeaderNodeId !== QUERY_EXECUTOR_LITERAL.STRING_STRING : stryMutAct_9fa48("116911") ? true : (stryCov_9fa48("116911", "116912"), typeof routingSnapshot.canonicalLeaderNodeId === QUERY_EXECUTOR_LITERAL.STRING_STRING)))) && (stryMutAct_9fa48("116915") ? routingSnapshot.canonicalLeaderNodeId.length <= NUM.ZERO : stryMutAct_9fa48("116914") ? routingSnapshot.canonicalLeaderNodeId.length >= NUM.ZERO : stryMutAct_9fa48("116913") ? true : (stryCov_9fa48("116913", "116914", "116915"), routingSnapshot.canonicalLeaderNodeId.length > NUM.ZERO)))) && (stryMutAct_9fa48("116917") ? Number(routingSnapshot.canonicalLeaderServiceCount) !== NUM.ZERO : stryMutAct_9fa48("116916") ? true : (stryCov_9fa48("116916", "116917"), Number(routingSnapshot.canonicalLeaderServiceCount) === NUM.ZERO)))) && (stryMutAct_9fa48("116919") ? Number(routingSnapshot.activeAddressedServiceCount) > NUM.ZERO && Number(routingSnapshot.serviceRowCount) === NUM.ZERO : stryMutAct_9fa48("116918") ? true : (stryCov_9fa48("116918", "116919"), (stryMutAct_9fa48("116922") ? Number(routingSnapshot.activeAddressedServiceCount) <= NUM.ZERO : stryMutAct_9fa48("116921") ? Number(routingSnapshot.activeAddressedServiceCount) >= NUM.ZERO : stryMutAct_9fa48("116920") ? false : (stryCov_9fa48("116920", "116921", "116922"), Number(routingSnapshot.activeAddressedServiceCount) > NUM.ZERO)) || (stryMutAct_9fa48("116924") ? Number(routingSnapshot.serviceRowCount) !== NUM.ZERO : stryMutAct_9fa48("116923") ? false : (stryCov_9fa48("116923", "116924"), Number(routingSnapshot.serviceRowCount) === NUM.ZERO))))));
    }
  }

  /**
   * Emit the generic no-service warning only when typed routing diagnostics did
   * not already capture a more specific readiness-filtered denial.
   * @param {string} partitionId
   * @param {Object|null} routingSnapshot
   * @private
   */
  logNoServiceForPartition(partitionId, routingSnapshot = null) {
    if (stryMutAct_9fa48("116925")) {
      {}
    } else {
      stryCov_9fa48("116925");
      if (stryMutAct_9fa48("116928") ? routingSnapshot?.reasonCode !== QUERY_ROUTING_DIAGNOSTIC_REASON.ALL_SERVICES_FILTERED_BY_READINESS : stryMutAct_9fa48("116927") ? false : stryMutAct_9fa48("116926") ? true : (stryCov_9fa48("116926", "116927", "116928"), (stryMutAct_9fa48("116929") ? routingSnapshot.reasonCode : (stryCov_9fa48("116929"), routingSnapshot?.reasonCode)) === QUERY_ROUTING_DIAGNOSTIC_REASON.ALL_SERVICES_FILTERED_BY_READINESS)) {
        if (stryMutAct_9fa48("116930")) {
          {}
        } else {
          stryCov_9fa48("116930");
          return;
        }
      }
      const now = Date.now();
      const lastAt = this.noServiceWarnLastAt.get(partitionId);
      if (stryMutAct_9fa48("116933") ? Number.isFinite(lastAt) || now - lastAt < this.noServiceWarnThrottleMs : stryMutAct_9fa48("116932") ? false : stryMutAct_9fa48("116931") ? true : (stryCov_9fa48("116931", "116932", "116933"), Number.isFinite(lastAt) && (stryMutAct_9fa48("116936") ? now - lastAt >= this.noServiceWarnThrottleMs : stryMutAct_9fa48("116935") ? now - lastAt <= this.noServiceWarnThrottleMs : stryMutAct_9fa48("116934") ? true : (stryCov_9fa48("116934", "116935", "116936"), (stryMutAct_9fa48("116937") ? now + lastAt : (stryCov_9fa48("116937"), now - lastAt)) < this.noServiceWarnThrottleMs)))) {
        if (stryMutAct_9fa48("116938")) {
          {}
        } else {
          stryCov_9fa48("116938");
          return;
        }
      }
      this.noServiceWarnLastAt.set(partitionId, now);
      this.logger.warn(QUERY_LOG_MSG.NO_SERVICE_FOR_PARTITION, stryMutAct_9fa48("116939") ? {} : (stryCov_9fa48("116939"), {
        partitionId
      }));
    }
  }

  /**
   * Get write-routable partition services from system cache.
   * @param {string} partitionId - Partition ID.
   * @return {Array<Object>} Routable services for the partition.
   * @private
   */
  getRoutablePartitionServices(partitionId, routingReadinessDimension = this.defaultRoutingReadinessDimension) {
    if (stryMutAct_9fa48("116940")) {
      {}
    } else {
      stryCov_9fa48("116940");
      return this.getPartitionRoutingSnapshot(partitionId, routingReadinessDimension).routableServices;
    }
  }

  /**
   * Check whether a partition has write-routable services in the system cache.
   * @param {string} partitionId - Partition ID.
   * @return {boolean} True when routable services exist.
   * @private
   */
  hasRoutablePartitionService(partitionId, routingReadinessDimension = this.defaultRoutingReadinessDimension) {
    if (stryMutAct_9fa48("116941")) {
      {}
    } else {
      stryCov_9fa48("116941");
      return stryMutAct_9fa48("116945") ? this.getPartitionRoutingSnapshot(partitionId, routingReadinessDimension).routableServiceCount <= NUM.ZERO : stryMutAct_9fa48("116944") ? this.getPartitionRoutingSnapshot(partitionId, routingReadinessDimension).routableServiceCount >= NUM.ZERO : stryMutAct_9fa48("116943") ? false : stryMutAct_9fa48("116942") ? true : (stryCov_9fa48("116942", "116943", "116944", "116945"), this.getPartitionRoutingSnapshot(partitionId, routingReadinessDimension).routableServiceCount > NUM.ZERO);
    }
  }

  /**
   * Check whether partition metadata exists in the cache.
   * @param {string} partitionId - Partition ID.
   * @return {boolean} True when partition metadata exists.
   * @private
   */
  hasPartitionRecord(partitionId) {
    if (stryMutAct_9fa48("116946")) {
      {}
    } else {
      stryCov_9fa48("116946");
      if (stryMutAct_9fa48("116948") ? false : stryMutAct_9fa48("116947") ? true : (stryCov_9fa48("116947", "116948"), this.systemCache)) {
        if (stryMutAct_9fa48("116949")) {
          {}
        } else {
          stryCov_9fa48("116949");
          if (stryMutAct_9fa48("116952") ? typeof this.systemCache.has !== QUERY_EXECUTOR_LITERAL.STRING_FUNCTION : stryMutAct_9fa48("116951") ? false : stryMutAct_9fa48("116950") ? true : (stryCov_9fa48("116950", "116951", "116952"), typeof this.systemCache.has === QUERY_EXECUTOR_LITERAL.STRING_FUNCTION)) {
            if (stryMutAct_9fa48("116953")) {
              {}
            } else {
              stryCov_9fa48("116953");
              if (stryMutAct_9fa48("116955") ? false : stryMutAct_9fa48("116954") ? true : (stryCov_9fa48("116954", "116955"), this.systemCache.has(TABLES.PARTITIONS, partitionId))) {
                if (stryMutAct_9fa48("116956")) {
                  {}
                } else {
                  stryCov_9fa48("116956");
                  return stryMutAct_9fa48("116957") ? false : (stryCov_9fa48("116957"), true);
                }
              }
            }
          } else if (stryMutAct_9fa48("116960") ? typeof this.systemCache.get !== QUERY_EXECUTOR_LITERAL.STRING_FUNCTION : stryMutAct_9fa48("116959") ? false : stryMutAct_9fa48("116958") ? true : (stryCov_9fa48("116958", "116959", "116960"), typeof this.systemCache.get === QUERY_EXECUTOR_LITERAL.STRING_FUNCTION)) {
            if (stryMutAct_9fa48("116961")) {
              {}
            } else {
              stryCov_9fa48("116961");
              if (stryMutAct_9fa48("116963") ? false : stryMutAct_9fa48("116962") ? true : (stryCov_9fa48("116962", "116963"), this.systemCache.get(TABLES.PARTITIONS, partitionId))) {
                if (stryMutAct_9fa48("116964")) {
                  {}
                } else {
                  stryCov_9fa48("116964");
                  return stryMutAct_9fa48("116965") ? false : (stryCov_9fa48("116965"), true);
                }
              }
            }
          } else if (stryMutAct_9fa48("116968") ? typeof this.systemCache.filter !== QUERY_EXECUTOR_LITERAL.STRING_FUNCTION : stryMutAct_9fa48("116967") ? false : stryMutAct_9fa48("116966") ? true : (stryCov_9fa48("116966", "116967", "116968"), typeof this.systemCache.filter === QUERY_EXECUTOR_LITERAL.STRING_FUNCTION)) {
            if (stryMutAct_9fa48("116969")) {
              {}
            } else {
              stryCov_9fa48("116969");
              if (stryMutAct_9fa48("116973") ? this.systemCache.filter(TABLES.PARTITIONS, partition => partition.partition_id === partitionId).length <= NUM.ZERO : stryMutAct_9fa48("116972") ? this.systemCache.filter(TABLES.PARTITIONS, partition => partition.partition_id === partitionId).length >= NUM.ZERO : stryMutAct_9fa48("116971") ? false : stryMutAct_9fa48("116970") ? true : (stryCov_9fa48("116970", "116971", "116972", "116973"), (stryMutAct_9fa48("116974") ? this.systemCache.length : (stryCov_9fa48("116974"), this.systemCache.filter(TABLES.PARTITIONS, stryMutAct_9fa48("116975") ? () => undefined : (stryCov_9fa48("116975"), partition => stryMutAct_9fa48("116978") ? partition.partition_id !== partitionId : stryMutAct_9fa48("116977") ? false : stryMutAct_9fa48("116976") ? true : (stryCov_9fa48("116976", "116977", "116978"), partition.partition_id === partitionId))).length)) > NUM.ZERO)) {
                if (stryMutAct_9fa48("116979")) {
                  {}
                } else {
                  stryCov_9fa48("116979");
                  return stryMutAct_9fa48("116980") ? false : (stryCov_9fa48("116980"), true);
                }
              }
            }
          }
        }
      }
      return stryMutAct_9fa48("116983") ? this.getOverlayPartitionRecord(partitionId) === null : stryMutAct_9fa48("116982") ? false : stryMutAct_9fa48("116981") ? true : (stryCov_9fa48("116981", "116982", "116983"), this.getOverlayPartitionRecord(partitionId) !== null);
    }
  }

  /**
   * Find partition leader address from system cache.
   * Queries the services table in the cache for the partition leader.
   * Returns the leader address for routing write queries.
   * Handles missing leader gracefully by returning null.
   * Requirements: 5.2
   * @param {string} partitionId - Partition ID.
   * @return {string|null} Leader address or null if not found.
   */
  findPartitionLeaderAddress(partitionId, routingReadinessDimension = this.defaultRoutingReadinessDimension) {
    if (stryMutAct_9fa48("116984")) {
      {}
    } else {
      stryCov_9fa48("116984");
      const service = this.findPartitionService(partitionId, stryMutAct_9fa48("116985") ? true : (stryCov_9fa48("116985"), false), routingReadinessDimension);
      if (stryMutAct_9fa48("116988") ? (!service || typeof service.address !== QUERY_EXECUTOR_LITERAL.STRING_STRING) && service.address.length === NUM.ZERO : stryMutAct_9fa48("116987") ? false : stryMutAct_9fa48("116986") ? true : (stryCov_9fa48("116986", "116987", "116988"), (stryMutAct_9fa48("116990") ? !service && typeof service.address !== QUERY_EXECUTOR_LITERAL.STRING_STRING : stryMutAct_9fa48("116989") ? false : (stryCov_9fa48("116989", "116990"), (stryMutAct_9fa48("116991") ? service : (stryCov_9fa48("116991"), !service)) || (stryMutAct_9fa48("116993") ? typeof service.address === QUERY_EXECUTOR_LITERAL.STRING_STRING : stryMutAct_9fa48("116992") ? false : (stryCov_9fa48("116992", "116993"), typeof service.address !== QUERY_EXECUTOR_LITERAL.STRING_STRING)))) || (stryMutAct_9fa48("116995") ? service.address.length !== NUM.ZERO : stryMutAct_9fa48("116994") ? false : (stryCov_9fa48("116994", "116995"), service.address.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("116996")) {
          {}
        } else {
          stryCov_9fa48("116996");
          this.logger.debug(QUERY_LOG_MSG.NO_LEADER_SERVICE_FOR_PARTITION, stryMutAct_9fa48("116997") ? {} : (stryCov_9fa48("116997"), {
            partitionId
          }));
          return null;
        }
      }
      return service.address;
    }
  }

  /**
   * Find partition service information from system cache.
   * Returns the service address for routing queries.
   * Uses ONLY the system cache - no fallbacks.
   * @param {string} partitionId - Partition ID.
   * @return {Object|null} {address, nodeId, replicaId} or null if not found.
   * @private
   */
  findPartitionService(partitionId, forRead = stryMutAct_9fa48("116998") ? true : (stryCov_9fa48("116998"), false), routingReadinessDimension = this.defaultRoutingReadinessDimension) {
    if (stryMutAct_9fa48("116999")) {
      {}
    } else {
      stryCov_9fa48("116999");
      const candidates = this.getPartitionServiceCandidates(partitionId, forRead, stryMutAct_9fa48("117000") ? true : (stryCov_9fa48("117000"), false), stryMutAct_9fa48("117001") ? true : (stryCov_9fa48("117001"), false), routingReadinessDimension);
      return stryMutAct_9fa48("117004") ? candidates[NUM.ZERO] && null : stryMutAct_9fa48("117003") ? false : stryMutAct_9fa48("117002") ? true : (stryCov_9fa48("117002", "117003", "117004"), candidates[NUM.ZERO] || null);
    }
  }

  /**
   * Determine whether a service row is routable.
   * @param {Object} service - Service row.
   * @return {boolean} True when row can be used for routing.
   * @private
   */
  isRoutablePartitionService(service, routingReadinessDimension = this.defaultRoutingReadinessDimension) {
    if (stryMutAct_9fa48("117005")) {
      {}
    } else {
      stryCov_9fa48("117005");
      return stryMutAct_9fa48("117008") ? this.evaluatePartitionServiceRoutability(service, routingReadinessDimension).routable !== true : stryMutAct_9fa48("117007") ? false : stryMutAct_9fa48("117006") ? true : (stryCov_9fa48("117006", "117007", "117008"), this.evaluatePartitionServiceRoutability(service, routingReadinessDimension).routable === (stryMutAct_9fa48("117009") ? false : (stryCov_9fa48("117009"), true)));
    }
  }

  /**
   * Evaluate one partition service row against the canonical readiness owner.
   * @param {Object} service
   * @param {string} routingReadinessDimension
   * @return {Object}
   * @private
   */
  evaluatePartitionServiceRoutability(service, routingReadinessDimension = this.defaultRoutingReadinessDimension, routingOptions = {}) {
    if (stryMutAct_9fa48("117010")) {
      {}
    } else {
      stryCov_9fa48("117010");
      const allowReadinessAuthoritativeRefresh = this.shouldAllowRoutingAuthoritativeRefresh(routingOptions);
      let routabilityResult;
      if (stryMutAct_9fa48("117013") ? service.status === SERVICE_STATUS.ACTIVE : stryMutAct_9fa48("117012") ? false : stryMutAct_9fa48("117011") ? true : (stryCov_9fa48("117011", "117012", "117013"), service.status !== SERVICE_STATUS.ACTIVE)) {
        if (stryMutAct_9fa48("117014")) {
          {}
        } else {
          stryCov_9fa48("117014");
          routabilityResult = stryMutAct_9fa48("117015") ? {} : (stryCov_9fa48("117015"), {
            routable: stryMutAct_9fa48("117016") ? true : (stryCov_9fa48("117016"), false),
            reasonCode: QUERY_ROUTING_DIAGNOSTIC_REASON.SERVICE_INACTIVE,
            readinessSummary: null
          });
        }
      } else if (stryMutAct_9fa48("117019") ? typeof service.address !== QUERY_EXECUTOR_LITERAL.STRING_STRING && service.address.length === NUM.ZERO : stryMutAct_9fa48("117018") ? false : stryMutAct_9fa48("117017") ? true : (stryCov_9fa48("117017", "117018", "117019"), (stryMutAct_9fa48("117021") ? typeof service.address === QUERY_EXECUTOR_LITERAL.STRING_STRING : stryMutAct_9fa48("117020") ? false : (stryCov_9fa48("117020", "117021"), typeof service.address !== QUERY_EXECUTOR_LITERAL.STRING_STRING)) || (stryMutAct_9fa48("117023") ? service.address.length !== NUM.ZERO : stryMutAct_9fa48("117022") ? false : (stryCov_9fa48("117022", "117023"), service.address.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("117024")) {
          {}
        } else {
          stryCov_9fa48("117024");
          routabilityResult = stryMutAct_9fa48("117025") ? {} : (stryCov_9fa48("117025"), {
            routable: stryMutAct_9fa48("117026") ? true : (stryCov_9fa48("117026"), false),
            reasonCode: QUERY_ROUTING_DIAGNOSTIC_REASON.SERVICE_ADDRESS_MISSING,
            readinessSummary: null
          });
        }
      }
      if (stryMutAct_9fa48("117028") ? false : stryMutAct_9fa48("117027") ? true : (stryCov_9fa48("117027", "117028"), routabilityResult)) {
        if (stryMutAct_9fa48("117029")) {
          {}
        } else {
          stryCov_9fa48("117029");
          return routabilityResult;
        }
      }
      const nodeId = stryMutAct_9fa48("117032") ? (service?.node_id || service?.nodeId) && null : stryMutAct_9fa48("117031") ? false : stryMutAct_9fa48("117030") ? true : (stryCov_9fa48("117030", "117031", "117032"), (stryMutAct_9fa48("117034") ? service?.node_id && service?.nodeId : stryMutAct_9fa48("117033") ? false : (stryCov_9fa48("117033", "117034"), (stryMutAct_9fa48("117035") ? service.node_id : (stryCov_9fa48("117035"), service?.node_id)) || (stryMutAct_9fa48("117036") ? service.nodeId : (stryCov_9fa48("117036"), service?.nodeId)))) || null);
      if (stryMutAct_9fa48("117039") ? (!nodeId || !this.controlPlaneReadinessService) && typeof this.controlPlaneReadinessService.getControlPlaneParticipationSync !== QUERY_EXECUTOR_LITERAL.STRING_FUNCTION && typeof this.controlPlaneReadinessService.getNodeReadinessSync !== QUERY_EXECUTOR_LITERAL.STRING_FUNCTION : stryMutAct_9fa48("117038") ? false : stryMutAct_9fa48("117037") ? true : (stryCov_9fa48("117037", "117038", "117039"), (stryMutAct_9fa48("117041") ? !nodeId && !this.controlPlaneReadinessService : stryMutAct_9fa48("117040") ? false : (stryCov_9fa48("117040", "117041"), (stryMutAct_9fa48("117042") ? nodeId : (stryCov_9fa48("117042"), !nodeId)) || (stryMutAct_9fa48("117043") ? this.controlPlaneReadinessService : (stryCov_9fa48("117043"), !this.controlPlaneReadinessService)))) || (stryMutAct_9fa48("117045") ? typeof this.controlPlaneReadinessService.getControlPlaneParticipationSync !== QUERY_EXECUTOR_LITERAL.STRING_FUNCTION || typeof this.controlPlaneReadinessService.getNodeReadinessSync !== QUERY_EXECUTOR_LITERAL.STRING_FUNCTION : stryMutAct_9fa48("117044") ? false : (stryCov_9fa48("117044", "117045"), (stryMutAct_9fa48("117047") ? typeof this.controlPlaneReadinessService.getControlPlaneParticipationSync === QUERY_EXECUTOR_LITERAL.STRING_FUNCTION : stryMutAct_9fa48("117046") ? true : (stryCov_9fa48("117046", "117047"), typeof this.controlPlaneReadinessService.getControlPlaneParticipationSync !== QUERY_EXECUTOR_LITERAL.STRING_FUNCTION)) && (stryMutAct_9fa48("117049") ? typeof this.controlPlaneReadinessService.getNodeReadinessSync === QUERY_EXECUTOR_LITERAL.STRING_FUNCTION : stryMutAct_9fa48("117048") ? true : (stryCov_9fa48("117048", "117049"), typeof this.controlPlaneReadinessService.getNodeReadinessSync !== QUERY_EXECUTOR_LITERAL.STRING_FUNCTION)))))) {
        if (stryMutAct_9fa48("117050")) {
          {}
        } else {
          stryCov_9fa48("117050");
          routabilityResult = stryMutAct_9fa48("117051") ? {} : (stryCov_9fa48("117051"), {
            routable: stryMutAct_9fa48("117052") ? false : (stryCov_9fa48("117052"), true),
            reasonCode: QUERY_ROUTING_DIAGNOSTIC_REASON.OK,
            readinessSummary: null
          });
        }
      }
      if (stryMutAct_9fa48("117054") ? false : stryMutAct_9fa48("117053") ? true : (stryCov_9fa48("117053", "117054"), routabilityResult)) {
        if (stryMutAct_9fa48("117055")) {
          {}
        } else {
          stryCov_9fa48("117055");
          return routabilityResult;
        }
      }
      const partitionId = String(stryMutAct_9fa48("117058") ? (service?.partition_id || service?.partitionId) && '' : stryMutAct_9fa48("117057") ? false : stryMutAct_9fa48("117056") ? true : (stryCov_9fa48("117056", "117057", "117058"), (stryMutAct_9fa48("117060") ? service?.partition_id && service?.partitionId : stryMutAct_9fa48("117059") ? false : (stryCov_9fa48("117059", "117060"), (stryMutAct_9fa48("117061") ? service.partition_id : (stryCov_9fa48("117061"), service?.partition_id)) || (stryMutAct_9fa48("117062") ? service.partitionId : (stryCov_9fa48("117062"), service?.partitionId)))) || (stryMutAct_9fa48("117063") ? "Stryker was here!" : (stryCov_9fa48("117063"), ''))));
      const partitionRow = (stryMutAct_9fa48("117067") ? partitionId.length <= NUM.ZERO : stryMutAct_9fa48("117066") ? partitionId.length >= NUM.ZERO : stryMutAct_9fa48("117065") ? false : stryMutAct_9fa48("117064") ? true : (stryCov_9fa48("117064", "117065", "117066", "117067"), partitionId.length > NUM.ZERO)) ? this.getPartitionRecord(partitionId) : null;
      const tableName = stryMutAct_9fa48("117070") ? String(partitionRow?.table_name || partitionRow?.tableName || partitionRow?.table_id || partitionRow?.tableId || '') && null : stryMutAct_9fa48("117069") ? false : stryMutAct_9fa48("117068") ? true : (stryCov_9fa48("117068", "117069", "117070"), String(stryMutAct_9fa48("117073") ? (partitionRow?.table_name || partitionRow?.tableName || partitionRow?.table_id || partitionRow?.tableId) && '' : stryMutAct_9fa48("117072") ? false : stryMutAct_9fa48("117071") ? true : (stryCov_9fa48("117071", "117072", "117073"), (stryMutAct_9fa48("117075") ? (partitionRow?.table_name || partitionRow?.tableName || partitionRow?.table_id) && partitionRow?.tableId : stryMutAct_9fa48("117074") ? false : (stryCov_9fa48("117074", "117075"), (stryMutAct_9fa48("117077") ? (partitionRow?.table_name || partitionRow?.tableName) && partitionRow?.table_id : stryMutAct_9fa48("117076") ? false : (stryCov_9fa48("117076", "117077"), (stryMutAct_9fa48("117079") ? partitionRow?.table_name && partitionRow?.tableName : stryMutAct_9fa48("117078") ? false : (stryCov_9fa48("117078", "117079"), (stryMutAct_9fa48("117080") ? partitionRow.table_name : (stryCov_9fa48("117080"), partitionRow?.table_name)) || (stryMutAct_9fa48("117081") ? partitionRow.tableName : (stryCov_9fa48("117081"), partitionRow?.tableName)))) || (stryMutAct_9fa48("117082") ? partitionRow.table_id : (stryCov_9fa48("117082"), partitionRow?.table_id)))) || (stryMutAct_9fa48("117083") ? partitionRow.tableId : (stryCov_9fa48("117083"), partitionRow?.tableId)))) || (stryMutAct_9fa48("117084") ? "Stryker was here!" : (stryCov_9fa48("117084"), '')))) || null);
      let evaluation;
      if (stryMutAct_9fa48("117087") ? typeof this.controlPlaneReadinessService.getControlPlaneParticipationSync !== QUERY_EXECUTOR_LITERAL.STRING_FUNCTION : stryMutAct_9fa48("117086") ? false : stryMutAct_9fa48("117085") ? true : (stryCov_9fa48("117085", "117086", "117087"), typeof this.controlPlaneReadinessService.getControlPlaneParticipationSync === QUERY_EXECUTOR_LITERAL.STRING_FUNCTION)) {
        if (stryMutAct_9fa48("117088")) {
          {}
        } else {
          stryCov_9fa48("117088");
          const participationKind = (stryMutAct_9fa48("117091") ? routingReadinessDimension !== CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE : stryMutAct_9fa48("117090") ? false : stryMutAct_9fa48("117089") ? true : (stryCov_9fa48("117089", "117090", "117091"), routingReadinessDimension === CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE)) ? CONTROL_PLANE_PARTICIPATION_KIND.CONTROL_PLANE_RECOVERY : CONTROL_PLANE_PARTICIPATION_KIND.ROUTED_READ;
          const participation = this.controlPlaneReadinessService.getControlPlaneParticipationSync(nodeId, stryMutAct_9fa48("117092") ? {} : (stryCov_9fa48("117092"), {
            allowAuthoritativeRefresh: allowReadinessAuthoritativeRefresh,
            requireFreshOnIneligible: allowReadinessAuthoritativeRefresh,
            participationKind,
            decisionDimension: routingReadinessDimension,
            partitionId: stryMutAct_9fa48("117095") ? partitionId && null : stryMutAct_9fa48("117094") ? false : stryMutAct_9fa48("117093") ? true : (stryCov_9fa48("117093", "117094", "117095"), partitionId || null),
            tableName
          }));
          evaluation = stryMutAct_9fa48("117096") ? {} : (stryCov_9fa48("117096"), {
            readiness: stryMutAct_9fa48("117099") ? participation?.snapshot && null : stryMutAct_9fa48("117098") ? false : stryMutAct_9fa48("117097") ? true : (stryCov_9fa48("117097", "117098", "117099"), (stryMutAct_9fa48("117100") ? participation.snapshot : (stryCov_9fa48("117100"), participation?.snapshot)) || null),
            decision: stryMutAct_9fa48("117101") ? {} : (stryCov_9fa48("117101"), {
              eligible: stryMutAct_9fa48("117104") ? participation?.eligible !== true : stryMutAct_9fa48("117103") ? false : stryMutAct_9fa48("117102") ? true : (stryCov_9fa48("117102", "117103", "117104"), (stryMutAct_9fa48("117105") ? participation.eligible : (stryCov_9fa48("117105"), participation?.eligible)) === (stryMutAct_9fa48("117106") ? false : (stryCov_9fa48("117106"), true))),
              failedDimensions: Array.isArray(stryMutAct_9fa48("117107") ? participation.failedDimensions : (stryCov_9fa48("117107"), participation?.failedDimensions)) ? participation.failedDimensions : Object.freeze(stryMutAct_9fa48("117108") ? ["Stryker was here"] : (stryCov_9fa48("117108"), []))
            }),
            compactSnapshot: stryMutAct_9fa48("117111") ? participation?.summary && null : stryMutAct_9fa48("117110") ? false : stryMutAct_9fa48("117109") ? true : (stryCov_9fa48("117109", "117110", "117111"), (stryMutAct_9fa48("117112") ? participation.summary : (stryCov_9fa48("117112"), participation?.summary)) || null)
          });
        }
      } else {
        if (stryMutAct_9fa48("117113")) {
          {}
        } else {
          stryCov_9fa48("117113");
          const readiness = this.controlPlaneReadinessService.getNodeReadinessSync(nodeId, stryMutAct_9fa48("117114") ? {} : (stryCov_9fa48("117114"), {
            allowAuthoritativeRefresh: allowReadinessAuthoritativeRefresh,
            requireFreshOnIneligible: allowReadinessAuthoritativeRefresh,
            decisionDimension: routingReadinessDimension
          }));
          if (stryMutAct_9fa48("117117") ? !readiness && !readiness.dimensions : stryMutAct_9fa48("117116") ? false : stryMutAct_9fa48("117115") ? true : (stryCov_9fa48("117115", "117116", "117117"), (stryMutAct_9fa48("117118") ? readiness : (stryCov_9fa48("117118"), !readiness)) || (stryMutAct_9fa48("117119") ? readiness.dimensions : (stryCov_9fa48("117119"), !readiness.dimensions)))) {
            if (stryMutAct_9fa48("117120")) {
              {}
            } else {
              stryCov_9fa48("117120");
              routabilityResult = stryMutAct_9fa48("117121") ? {} : (stryCov_9fa48("117121"), {
                routable: stryMutAct_9fa48("117122") ? true : (stryCov_9fa48("117122"), false),
                reasonCode: QUERY_ROUTING_DIAGNOSTIC_REASON.READINESS_UNAVAILABLE,
                readinessSummary: null
              });
            }
          } else {
            if (stryMutAct_9fa48("117123")) {
              {}
            } else {
              stryCov_9fa48("117123");
              evaluation = stryMutAct_9fa48("117124") ? {} : (stryCov_9fa48("117124"), {
                readiness,
                decision: evaluateEligibilityDecision(readiness, routingReadinessDimension),
                compactSnapshot: compactEligibilitySnapshot(readiness, routingReadinessDimension)
              });
            }
          }
        }
      }
      if (stryMutAct_9fa48("117126") ? false : stryMutAct_9fa48("117125") ? true : (stryCov_9fa48("117125", "117126"), routabilityResult)) {
        if (stryMutAct_9fa48("117127")) {
          {}
        } else {
          stryCov_9fa48("117127");
          return routabilityResult;
        }
      }
      const readiness = evaluation.readiness;
      const decision = evaluation.decision;
      const compactSnapshot = evaluation.compactSnapshot;
      const bootstrapGraceRoutable = stryMutAct_9fa48("117130") ? decision?.eligible !== true || this.shouldAllowFreshBootstrapRoutingGrace(service, readiness, decision) : stryMutAct_9fa48("117129") ? false : stryMutAct_9fa48("117128") ? true : (stryCov_9fa48("117128", "117129", "117130"), (stryMutAct_9fa48("117132") ? decision?.eligible === true : stryMutAct_9fa48("117131") ? true : (stryCov_9fa48("117131", "117132"), (stryMutAct_9fa48("117133") ? decision.eligible : (stryCov_9fa48("117133"), decision?.eligible)) !== (stryMutAct_9fa48("117134") ? false : (stryCov_9fa48("117134"), true)))) && this.shouldAllowFreshBootstrapRoutingGrace(service, readiness, decision));
      return stryMutAct_9fa48("117135") ? {} : (stryCov_9fa48("117135"), {
        routable: stryMutAct_9fa48("117138") ? decision.eligible === true && bootstrapGraceRoutable : stryMutAct_9fa48("117137") ? false : stryMutAct_9fa48("117136") ? true : (stryCov_9fa48("117136", "117137", "117138"), (stryMutAct_9fa48("117140") ? decision.eligible !== true : stryMutAct_9fa48("117139") ? false : (stryCov_9fa48("117139", "117140"), decision.eligible === (stryMutAct_9fa48("117141") ? false : (stryCov_9fa48("117141"), true)))) || bootstrapGraceRoutable),
        reasonCode: (stryMutAct_9fa48("117144") ? decision.eligible === true && bootstrapGraceRoutable : stryMutAct_9fa48("117143") ? false : stryMutAct_9fa48("117142") ? true : (stryCov_9fa48("117142", "117143", "117144"), (stryMutAct_9fa48("117146") ? decision.eligible !== true : stryMutAct_9fa48("117145") ? false : (stryCov_9fa48("117145", "117146"), decision.eligible === (stryMutAct_9fa48("117147") ? false : (stryCov_9fa48("117147"), true)))) || bootstrapGraceRoutable)) ? QUERY_ROUTING_DIAGNOSTIC_REASON.OK : QUERY_ROUTING_DIAGNOSTIC_REASON.NODE_NOT_ELIGIBLE,
        readinessSummary: compactSnapshot ? stryMutAct_9fa48("117148") ? {} : (stryCov_9fa48("117148"), {
          decisionDimension: stryMutAct_9fa48("117151") ? compactSnapshot.decisionDimension && routingReadinessDimension : stryMutAct_9fa48("117150") ? false : stryMutAct_9fa48("117149") ? true : (stryCov_9fa48("117149", "117150", "117151"), compactSnapshot.decisionDimension || routingReadinessDimension),
          observedAt: stryMutAct_9fa48("117154") ? compactSnapshot.observedAt && null : stryMutAct_9fa48("117153") ? false : stryMutAct_9fa48("117152") ? true : (stryCov_9fa48("117152", "117153", "117154"), compactSnapshot.observedAt || null),
          lifecycleState: stryMutAct_9fa48("117157") ? compactSnapshot.lifecycleState && null : stryMutAct_9fa48("117156") ? false : stryMutAct_9fa48("117155") ? true : (stryCov_9fa48("117155", "117156", "117157"), compactSnapshot.lifecycleState || null),
          reasonCodes: stryMutAct_9fa48("117160") ? compactSnapshot.reasonCodes && Object.freeze([]) : stryMutAct_9fa48("117159") ? false : stryMutAct_9fa48("117158") ? true : (stryCov_9fa48("117158", "117159", "117160"), compactSnapshot.reasonCodes || Object.freeze(stryMutAct_9fa48("117161") ? ["Stryker was here"] : (stryCov_9fa48("117161"), []))),
          failedDimensions: stryMutAct_9fa48("117164") ? decision.failedDimensions && Object.freeze([]) : stryMutAct_9fa48("117163") ? false : stryMutAct_9fa48("117162") ? true : (stryCov_9fa48("117162", "117163", "117164"), decision.failedDimensions || Object.freeze(stryMutAct_9fa48("117165") ? ["Stryker was here"] : (stryCov_9fa48("117165"), [])))
        }) : null
      });
    }
  }

  /**
   * Admit one fresh bootstrap partition service when cache heartbeat
   * publication lags but transport and service evidence remain positive.
   * This grace stays bounded to the initial creation window where
   * `leader_node_id` has not converged yet.
   * @param {Object} service
   * @param {Object|null} readiness
   * @param {Object|null} decision
   * @return {boolean}
   * @private
   */
  shouldAllowFreshBootstrapRoutingGrace(service, readiness, decision) {
    if (stryMutAct_9fa48("117166")) {
      {}
    } else {
      stryCov_9fa48("117166");
      const partitionId = String(stryMutAct_9fa48("117169") ? (service?.partition_id || service?.partitionId) && '' : stryMutAct_9fa48("117168") ? false : stryMutAct_9fa48("117167") ? true : (stryCov_9fa48("117167", "117168", "117169"), (stryMutAct_9fa48("117171") ? service?.partition_id && service?.partitionId : stryMutAct_9fa48("117170") ? false : (stryCov_9fa48("117170", "117171"), (stryMutAct_9fa48("117172") ? service.partition_id : (stryCov_9fa48("117172"), service?.partition_id)) || (stryMutAct_9fa48("117173") ? service.partitionId : (stryCov_9fa48("117173"), service?.partitionId)))) || (stryMutAct_9fa48("117174") ? "Stryker was here!" : (stryCov_9fa48("117174"), ''))));
      if (stryMutAct_9fa48("117177") ? partitionId.length !== NUM.ZERO : stryMutAct_9fa48("117176") ? false : stryMutAct_9fa48("117175") ? true : (stryCov_9fa48("117175", "117176", "117177"), partitionId.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("117178")) {
          {}
        } else {
          stryCov_9fa48("117178");
          return stryMutAct_9fa48("117179") ? true : (stryCov_9fa48("117179"), false);
        }
      }
      const partition = this.getPartitionRecord(partitionId);
      if (stryMutAct_9fa48("117182") ? false : stryMutAct_9fa48("117181") ? true : stryMutAct_9fa48("117180") ? this.isBootstrapRoutingGraceWindow(partition) : (stryCov_9fa48("117180", "117181", "117182"), !this.isBootstrapRoutingGraceWindow(partition))) {
        if (stryMutAct_9fa48("117183")) {
          {}
        } else {
          stryCov_9fa48("117183");
          return stryMutAct_9fa48("117184") ? true : (stryCov_9fa48("117184"), false);
        }
      }
      const dimensions = stryMutAct_9fa48("117185") ? readiness.dimensions : (stryCov_9fa48("117185"), readiness?.dimensions);
      const nodeEvidence = stryMutAct_9fa48("117186") ? readiness.nodeEvidence : (stryCov_9fa48("117186"), readiness?.nodeEvidence);
      if (stryMutAct_9fa48("117189") ? (!dimensions || typeof dimensions !== QUERY_EXECUTOR_LITERAL.STRING_OBJECT || !nodeEvidence) && typeof nodeEvidence !== QUERY_EXECUTOR_LITERAL.STRING_OBJECT : stryMutAct_9fa48("117188") ? false : stryMutAct_9fa48("117187") ? true : (stryCov_9fa48("117187", "117188", "117189"), (stryMutAct_9fa48("117191") ? (!dimensions || typeof dimensions !== QUERY_EXECUTOR_LITERAL.STRING_OBJECT) && !nodeEvidence : stryMutAct_9fa48("117190") ? false : (stryCov_9fa48("117190", "117191"), (stryMutAct_9fa48("117193") ? !dimensions && typeof dimensions !== QUERY_EXECUTOR_LITERAL.STRING_OBJECT : stryMutAct_9fa48("117192") ? false : (stryCov_9fa48("117192", "117193"), (stryMutAct_9fa48("117194") ? dimensions : (stryCov_9fa48("117194"), !dimensions)) || (stryMutAct_9fa48("117196") ? typeof dimensions === QUERY_EXECUTOR_LITERAL.STRING_OBJECT : stryMutAct_9fa48("117195") ? false : (stryCov_9fa48("117195", "117196"), typeof dimensions !== QUERY_EXECUTOR_LITERAL.STRING_OBJECT)))) || (stryMutAct_9fa48("117197") ? nodeEvidence : (stryCov_9fa48("117197"), !nodeEvidence)))) || (stryMutAct_9fa48("117199") ? typeof nodeEvidence === QUERY_EXECUTOR_LITERAL.STRING_OBJECT : stryMutAct_9fa48("117198") ? false : (stryCov_9fa48("117198", "117199"), typeof nodeEvidence !== QUERY_EXECUTOR_LITERAL.STRING_OBJECT)))) {
        if (stryMutAct_9fa48("117200")) {
          {}
        } else {
          stryCov_9fa48("117200");
          return stryMutAct_9fa48("117201") ? true : (stryCov_9fa48("117201"), false);
        }
      }
      if (stryMutAct_9fa48("117204") ? (dimensions[CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE] !== true || dimensions[CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY] !== true || dimensions[CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY] !== true || dimensions[CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY] !== true || nodeEvidence.transportConnected !== true) && nodeEvidence.readyWhenWritten !== true : stryMutAct_9fa48("117203") ? false : stryMutAct_9fa48("117202") ? true : (stryCov_9fa48("117202", "117203", "117204"), (stryMutAct_9fa48("117206") ? (dimensions[CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE] !== true || dimensions[CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY] !== true || dimensions[CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY] !== true || dimensions[CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY] !== true) && nodeEvidence.transportConnected !== true : stryMutAct_9fa48("117205") ? false : (stryCov_9fa48("117205", "117206"), (stryMutAct_9fa48("117208") ? (dimensions[CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE] !== true || dimensions[CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY] !== true || dimensions[CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY] !== true) && dimensions[CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY] !== true : stryMutAct_9fa48("117207") ? false : (stryCov_9fa48("117207", "117208"), (stryMutAct_9fa48("117210") ? (dimensions[CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE] !== true || dimensions[CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY] !== true) && dimensions[CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY] !== true : stryMutAct_9fa48("117209") ? false : (stryCov_9fa48("117209", "117210"), (stryMutAct_9fa48("117212") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE] !== true && dimensions[CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY] !== true : stryMutAct_9fa48("117211") ? false : (stryCov_9fa48("117211", "117212"), (stryMutAct_9fa48("117214") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE] === true : stryMutAct_9fa48("117213") ? false : (stryCov_9fa48("117213", "117214"), dimensions[CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE] !== (stryMutAct_9fa48("117215") ? false : (stryCov_9fa48("117215"), true)))) || (stryMutAct_9fa48("117217") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY] === true : stryMutAct_9fa48("117216") ? false : (stryCov_9fa48("117216", "117217"), dimensions[CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY] !== (stryMutAct_9fa48("117218") ? false : (stryCov_9fa48("117218"), true)))))) || (stryMutAct_9fa48("117220") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY] === true : stryMutAct_9fa48("117219") ? false : (stryCov_9fa48("117219", "117220"), dimensions[CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY] !== (stryMutAct_9fa48("117221") ? false : (stryCov_9fa48("117221"), true)))))) || (stryMutAct_9fa48("117223") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY] === true : stryMutAct_9fa48("117222") ? false : (stryCov_9fa48("117222", "117223"), dimensions[CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY] !== (stryMutAct_9fa48("117224") ? false : (stryCov_9fa48("117224"), true)))))) || (stryMutAct_9fa48("117226") ? nodeEvidence.transportConnected === true : stryMutAct_9fa48("117225") ? false : (stryCov_9fa48("117225", "117226"), nodeEvidence.transportConnected !== (stryMutAct_9fa48("117227") ? false : (stryCov_9fa48("117227"), true)))))) || (stryMutAct_9fa48("117229") ? nodeEvidence.readyWhenWritten === true : stryMutAct_9fa48("117228") ? false : (stryCov_9fa48("117228", "117229"), nodeEvidence.readyWhenWritten !== (stryMutAct_9fa48("117230") ? false : (stryCov_9fa48("117230"), true)))))) {
        if (stryMutAct_9fa48("117231")) {
          {}
        } else {
          stryCov_9fa48("117231");
          return stryMutAct_9fa48("117232") ? true : (stryCov_9fa48("117232"), false);
        }
      }
      const allowedFailedDimensions = new Set(stryMutAct_9fa48("117233") ? [] : (stryCov_9fa48("117233"), [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY, CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE, CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE, CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE, CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]));
      const failedDimensions = Array.isArray(stryMutAct_9fa48("117234") ? decision.failedDimensions : (stryCov_9fa48("117234"), decision?.failedDimensions)) ? decision.failedDimensions : stryMutAct_9fa48("117235") ? ["Stryker was here"] : (stryCov_9fa48("117235"), []);
      return stryMutAct_9fa48("117238") ? failedDimensions.length > NUM.ZERO || failedDimensions.every(dimension => allowedFailedDimensions.has(dimension)) : stryMutAct_9fa48("117237") ? false : stryMutAct_9fa48("117236") ? true : (stryCov_9fa48("117236", "117237", "117238"), (stryMutAct_9fa48("117241") ? failedDimensions.length <= NUM.ZERO : stryMutAct_9fa48("117240") ? failedDimensions.length >= NUM.ZERO : stryMutAct_9fa48("117239") ? true : (stryCov_9fa48("117239", "117240", "117241"), failedDimensions.length > NUM.ZERO)) && (stryMutAct_9fa48("117242") ? failedDimensions.some(dimension => allowedFailedDimensions.has(dimension)) : (stryCov_9fa48("117242"), failedDimensions.every(stryMutAct_9fa48("117243") ? () => undefined : (stryCov_9fa48("117243"), dimension => allowedFailedDimensions.has(dimension))))));
    }
  }

  /**
   * Resolve overlay partition row by ID.
   * @param {string} partitionId - Partition ID.
   * @return {Object|null} Overlay partition row.
   * @private
   */
  getOverlayPartitionRecord(partitionId) {
    if (stryMutAct_9fa48("117244")) {
      {}
    } else {
      stryCov_9fa48("117244");
      const overlay = this.routingMetadataOverlay;
      if (stryMutAct_9fa48("117247") ? !overlay && typeof overlay.getPartitionById !== QUERY_EXECUTOR_LITERAL.STRING_FUNCTION : stryMutAct_9fa48("117246") ? false : stryMutAct_9fa48("117245") ? true : (stryCov_9fa48("117245", "117246", "117247"), (stryMutAct_9fa48("117248") ? overlay : (stryCov_9fa48("117248"), !overlay)) || (stryMutAct_9fa48("117250") ? typeof overlay.getPartitionById === QUERY_EXECUTOR_LITERAL.STRING_FUNCTION : stryMutAct_9fa48("117249") ? false : (stryCov_9fa48("117249", "117250"), typeof overlay.getPartitionById !== QUERY_EXECUTOR_LITERAL.STRING_FUNCTION)))) {
        if (stryMutAct_9fa48("117251")) {
          {}
        } else {
          stryCov_9fa48("117251");
          return null;
        }
      }
      const partition = overlay.getPartitionById(partitionId);
      return (stryMutAct_9fa48("117254") ? partition || typeof partition === QUERY_EXECUTOR_LITERAL.STRING_OBJECT : stryMutAct_9fa48("117253") ? false : stryMutAct_9fa48("117252") ? true : (stryCov_9fa48("117252", "117253", "117254"), partition && (stryMutAct_9fa48("117256") ? typeof partition !== QUERY_EXECUTOR_LITERAL.STRING_OBJECT : stryMutAct_9fa48("117255") ? true : (stryCov_9fa48("117255", "117256"), typeof partition === QUERY_EXECUTOR_LITERAL.STRING_OBJECT)))) ? partition : null;
    }
  }

  /**
   * Resolve the canonical partition record for routing decisions.
   * Overlay metadata outranks cache metadata while transition routing is active.
   * @param {string} partitionId - Partition ID.
   * @return {Object|null}
   * @private
   */
  getPartitionRecord(partitionId) {
    if (stryMutAct_9fa48("117257")) {
      {}
    } else {
      stryCov_9fa48("117257");
      const overlayPartition = this.getOverlayPartitionRecord(partitionId);
      if (stryMutAct_9fa48("117259") ? false : stryMutAct_9fa48("117258") ? true : (stryCov_9fa48("117258", "117259"), overlayPartition)) {
        if (stryMutAct_9fa48("117260")) {
          {}
        } else {
          stryCov_9fa48("117260");
          return overlayPartition;
        }
      }
      if (stryMutAct_9fa48("117263") ? false : stryMutAct_9fa48("117262") ? true : stryMutAct_9fa48("117261") ? this.systemCache : (stryCov_9fa48("117261", "117262", "117263"), !this.systemCache)) {
        if (stryMutAct_9fa48("117264")) {
          {}
        } else {
          stryCov_9fa48("117264");
          return null;
        }
      }
      if (stryMutAct_9fa48("117267") ? typeof this.systemCache.get !== QUERY_EXECUTOR_LITERAL.STRING_FUNCTION : stryMutAct_9fa48("117266") ? false : stryMutAct_9fa48("117265") ? true : (stryCov_9fa48("117265", "117266", "117267"), typeof this.systemCache.get === QUERY_EXECUTOR_LITERAL.STRING_FUNCTION)) {
        if (stryMutAct_9fa48("117268")) {
          {}
        } else {
          stryCov_9fa48("117268");
          const record = this.systemCache.get(TABLES.PARTITIONS, partitionId);
          if (stryMutAct_9fa48("117270") ? false : stryMutAct_9fa48("117269") ? true : (stryCov_9fa48("117269", "117270"), record)) {
            if (stryMutAct_9fa48("117271")) {
              {}
            } else {
              stryCov_9fa48("117271");
              return record;
            }
          }
        }
      }
      if (stryMutAct_9fa48("117274") ? typeof this.systemCache.filter !== QUERY_EXECUTOR_LITERAL.STRING_FUNCTION : stryMutAct_9fa48("117273") ? false : stryMutAct_9fa48("117272") ? true : (stryCov_9fa48("117272", "117273", "117274"), typeof this.systemCache.filter === QUERY_EXECUTOR_LITERAL.STRING_FUNCTION)) {
        if (stryMutAct_9fa48("117275")) {
          {}
        } else {
          stryCov_9fa48("117275");
          const records = stryMutAct_9fa48("117276") ? this.systemCache : (stryCov_9fa48("117276"), this.systemCache.filter(TABLES.PARTITIONS, stryMutAct_9fa48("117277") ? () => undefined : (stryCov_9fa48("117277"), partition => stryMutAct_9fa48("117280") ? partition.partition_id !== partitionId : stryMutAct_9fa48("117279") ? false : stryMutAct_9fa48("117278") ? true : (stryCov_9fa48("117278", "117279", "117280"), partition.partition_id === partitionId))));
          if (stryMutAct_9fa48("117284") ? records.length <= NUM.ZERO : stryMutAct_9fa48("117283") ? records.length >= NUM.ZERO : stryMutAct_9fa48("117282") ? false : stryMutAct_9fa48("117281") ? true : (stryCov_9fa48("117281", "117282", "117283", "117284"), records.length > NUM.ZERO)) {
            if (stryMutAct_9fa48("117285")) {
              {}
            } else {
              stryCov_9fa48("117285");
              return records[NUM.ZERO];
            }
          }
        }
      }
      if (stryMutAct_9fa48("117288") ? typeof this.systemCache.getAll !== QUERY_EXECUTOR_LITERAL.STRING_FUNCTION : stryMutAct_9fa48("117287") ? false : stryMutAct_9fa48("117286") ? true : (stryCov_9fa48("117286", "117287", "117288"), typeof this.systemCache.getAll === QUERY_EXECUTOR_LITERAL.STRING_FUNCTION)) {
        if (stryMutAct_9fa48("117289")) {
          {}
        } else {
          stryCov_9fa48("117289");
          const records = stryMutAct_9fa48("117292") ? this.systemCache.getAll(TABLES.PARTITIONS) && [] : stryMutAct_9fa48("117291") ? false : stryMutAct_9fa48("117290") ? true : (stryCov_9fa48("117290", "117291", "117292"), this.systemCache.getAll(TABLES.PARTITIONS) || (stryMutAct_9fa48("117293") ? ["Stryker was here"] : (stryCov_9fa48("117293"), [])));
          return stryMutAct_9fa48("117296") ? records.find(partition => partition.partition_id === partitionId) && null : stryMutAct_9fa48("117295") ? false : stryMutAct_9fa48("117294") ? true : (stryCov_9fa48("117294", "117295", "117296"), records.find(stryMutAct_9fa48("117297") ? () => undefined : (stryCov_9fa48("117297"), partition => stryMutAct_9fa48("117300") ? partition.partition_id !== partitionId : stryMutAct_9fa48("117299") ? false : stryMutAct_9fa48("117298") ? true : (stryCov_9fa48("117298", "117299", "117300"), partition.partition_id === partitionId))) || null);
        }
      }
      return null;
    }
  }

  /**
   * Resolve the canonical leader node for one partition from owner metadata.
   * @param {string} partitionId - Partition ID.
   * @return {string|null}
   * @private
   */
  getPartitionLeaderNodeId(partitionId) {
    if (stryMutAct_9fa48("117301")) {
      {}
    } else {
      stryCov_9fa48("117301");
      if (stryMutAct_9fa48("117304") ? typeof this.bootstrapTopologySnapshotOwner?.resolveCanonicalPartitionLeaderNodeId !== QUERY_EXECUTOR_LITERAL.STRING_FUNCTION : stryMutAct_9fa48("117303") ? false : stryMutAct_9fa48("117302") ? true : (stryCov_9fa48("117302", "117303", "117304"), typeof (stryMutAct_9fa48("117305") ? this.bootstrapTopologySnapshotOwner.resolveCanonicalPartitionLeaderNodeId : (stryCov_9fa48("117305"), this.bootstrapTopologySnapshotOwner?.resolveCanonicalPartitionLeaderNodeId)) === QUERY_EXECUTOR_LITERAL.STRING_FUNCTION)) {
        if (stryMutAct_9fa48("117306")) {
          {}
        } else {
          stryCov_9fa48("117306");
          const leaderNodeId = this.bootstrapTopologySnapshotOwner.resolveCanonicalPartitionLeaderNodeId(partitionId);
          if (stryMutAct_9fa48("117309") ? typeof leaderNodeId === QUERY_EXECUTOR_LITERAL.STRING_STRING || leaderNodeId.length > NUM.ZERO : stryMutAct_9fa48("117308") ? false : stryMutAct_9fa48("117307") ? true : (stryCov_9fa48("117307", "117308", "117309"), (stryMutAct_9fa48("117311") ? typeof leaderNodeId !== QUERY_EXECUTOR_LITERAL.STRING_STRING : stryMutAct_9fa48("117310") ? true : (stryCov_9fa48("117310", "117311"), typeof leaderNodeId === QUERY_EXECUTOR_LITERAL.STRING_STRING)) && (stryMutAct_9fa48("117314") ? leaderNodeId.length <= NUM.ZERO : stryMutAct_9fa48("117313") ? leaderNodeId.length >= NUM.ZERO : stryMutAct_9fa48("117312") ? true : (stryCov_9fa48("117312", "117313", "117314"), leaderNodeId.length > NUM.ZERO)))) {
            if (stryMutAct_9fa48("117315")) {
              {}
            } else {
              stryCov_9fa48("117315");
              return leaderNodeId;
            }
          }
        }
      }
      const partition = this.getPartitionRecord(partitionId);
      const leaderNodeId = stryMutAct_9fa48("117316") ? (partition?.[COLUMN.LEADER_NODE_ID] ?? partition?.leaderNodeId) && null : (stryCov_9fa48("117316"), (stryMutAct_9fa48("117317") ? partition?.[COLUMN.LEADER_NODE_ID] && partition?.leaderNodeId : (stryCov_9fa48("117317"), (stryMutAct_9fa48("117318") ? partition[COLUMN.LEADER_NODE_ID] : (stryCov_9fa48("117318"), partition?.[COLUMN.LEADER_NODE_ID])) ?? (stryMutAct_9fa48("117319") ? partition.leaderNodeId : (stryCov_9fa48("117319"), partition?.leaderNodeId)))) ?? null);
      return (stryMutAct_9fa48("117322") ? typeof leaderNodeId === QUERY_EXECUTOR_LITERAL.STRING_STRING || leaderNodeId.length > NUM.ZERO : stryMutAct_9fa48("117321") ? false : stryMutAct_9fa48("117320") ? true : (stryCov_9fa48("117320", "117321", "117322"), (stryMutAct_9fa48("117324") ? typeof leaderNodeId !== QUERY_EXECUTOR_LITERAL.STRING_STRING : stryMutAct_9fa48("117323") ? true : (stryCov_9fa48("117323", "117324"), typeof leaderNodeId === QUERY_EXECUTOR_LITERAL.STRING_STRING)) && (stryMutAct_9fa48("117327") ? leaderNodeId.length <= NUM.ZERO : stryMutAct_9fa48("117326") ? leaderNodeId.length >= NUM.ZERO : stryMutAct_9fa48("117325") ? true : (stryCov_9fa48("117325", "117326", "117327"), leaderNodeId.length > NUM.ZERO)))) ? leaderNodeId : null;
    }
  }

  /**
   * Resolve a bootstrap-only leader fallback while the partition owner row is
   * still in its fresh-creation window and leader_node_id has not converged.
   * Steady-state writes still fail closed when canonical owner metadata is
   * absent or ambiguous.
   * @param {string} partitionId
   * @param {Object[]} services
   * @return {Object[]}
   * @private
   */
  getFreshBootstrapLeaderServices(partitionId, services) {
    if (stryMutAct_9fa48("117328")) {
      {}
    } else {
      stryCov_9fa48("117328");
      if (stryMutAct_9fa48("117331") ? typeof this.bootstrapTopologySnapshotOwner?.getFreshBootstrapLeaderServices !== QUERY_EXECUTOR_LITERAL.STRING_FUNCTION : stryMutAct_9fa48("117330") ? false : stryMutAct_9fa48("117329") ? true : (stryCov_9fa48("117329", "117330", "117331"), typeof (stryMutAct_9fa48("117332") ? this.bootstrapTopologySnapshotOwner.getFreshBootstrapLeaderServices : (stryCov_9fa48("117332"), this.bootstrapTopologySnapshotOwner?.getFreshBootstrapLeaderServices)) === QUERY_EXECUTOR_LITERAL.STRING_FUNCTION)) {
        if (stryMutAct_9fa48("117333")) {
          {}
        } else {
          stryCov_9fa48("117333");
          const ownerServices = this.bootstrapTopologySnapshotOwner.getFreshBootstrapLeaderServices(partitionId, services);
          if (stryMutAct_9fa48("117336") ? Array.isArray(ownerServices) || ownerServices.length > NUM.ZERO : stryMutAct_9fa48("117335") ? false : stryMutAct_9fa48("117334") ? true : (stryCov_9fa48("117334", "117335", "117336"), Array.isArray(ownerServices) && (stryMutAct_9fa48("117339") ? ownerServices.length <= NUM.ZERO : stryMutAct_9fa48("117338") ? ownerServices.length >= NUM.ZERO : stryMutAct_9fa48("117337") ? true : (stryCov_9fa48("117337", "117338", "117339"), ownerServices.length > NUM.ZERO)))) {
            if (stryMutAct_9fa48("117340")) {
              {}
            } else {
              stryCov_9fa48("117340");
              return ownerServices;
            }
          }
        }
      }
      const partition = this.getPartitionRecord(partitionId);
      if (stryMutAct_9fa48("117343") ? false : stryMutAct_9fa48("117342") ? true : stryMutAct_9fa48("117341") ? this.isFreshPartitionBootstrapWindow(partition) : (stryCov_9fa48("117341", "117342", "117343"), !this.isFreshPartitionBootstrapWindow(partition))) {
        if (stryMutAct_9fa48("117344")) {
          {}
        } else {
          stryCov_9fa48("117344");
          return stryMutAct_9fa48("117345") ? ["Stryker was here"] : (stryCov_9fa48("117345"), []);
        }
      }
      const leaderSelection = resolveBootstrapLeaderSelection(stryMutAct_9fa48("117346") ? {} : (stryCov_9fa48("117346"), {
        services
      }));
      return leaderSelection.selectedService ? stryMutAct_9fa48("117347") ? [] : (stryCov_9fa48("117347"), [leaderSelection.selectedService]) : stryMutAct_9fa48("117348") ? ["Stryker was here"] : (stryCov_9fa48("117348"), []);
    }
  }

  /**
   * Identify the narrow bootstrap window where a partition has been created
   * but the canonical leader_node_id has not yet been persisted.
   * @param {Object|null} partition
   * @return {boolean}
   * @private
   */
  isFreshPartitionBootstrapWindow(partition) {
    if (stryMutAct_9fa48("117349")) {
      {}
    } else {
      stryCov_9fa48("117349");
      if (stryMutAct_9fa48("117352") ? typeof this.bootstrapTopologySnapshotOwner?.isFreshPartitionBootstrapWindow !== QUERY_EXECUTOR_LITERAL.STRING_FUNCTION : stryMutAct_9fa48("117351") ? false : stryMutAct_9fa48("117350") ? true : (stryCov_9fa48("117350", "117351", "117352"), typeof (stryMutAct_9fa48("117353") ? this.bootstrapTopologySnapshotOwner.isFreshPartitionBootstrapWindow : (stryCov_9fa48("117353"), this.bootstrapTopologySnapshotOwner?.isFreshPartitionBootstrapWindow)) === QUERY_EXECUTOR_LITERAL.STRING_FUNCTION)) {
        if (stryMutAct_9fa48("117354")) {
          {}
        } else {
          stryCov_9fa48("117354");
          return this.bootstrapTopologySnapshotOwner.isFreshPartitionBootstrapWindow(partition);
        }
      }
      if (stryMutAct_9fa48("117357") ? !partition && !this.isBootstrapRoutingGraceWindow(partition) : stryMutAct_9fa48("117356") ? false : stryMutAct_9fa48("117355") ? true : (stryCov_9fa48("117355", "117356", "117357"), (stryMutAct_9fa48("117358") ? partition : (stryCov_9fa48("117358"), !partition)) || (stryMutAct_9fa48("117359") ? this.isBootstrapRoutingGraceWindow(partition) : (stryCov_9fa48("117359"), !this.isBootstrapRoutingGraceWindow(partition))))) {
        if (stryMutAct_9fa48("117360")) {
          {}
        } else {
          stryCov_9fa48("117360");
          return stryMutAct_9fa48("117361") ? true : (stryCov_9fa48("117361"), false);
        }
      }
      const leaderNodeId = stryMutAct_9fa48("117362") ? (partition?.[COLUMN.LEADER_NODE_ID] ?? partition?.leader_node_id ?? partition?.leaderNodeId) && null : (stryCov_9fa48("117362"), (stryMutAct_9fa48("117363") ? (partition?.[COLUMN.LEADER_NODE_ID] ?? partition?.leader_node_id) && partition?.leaderNodeId : (stryCov_9fa48("117363"), (stryMutAct_9fa48("117364") ? partition?.[COLUMN.LEADER_NODE_ID] && partition?.leader_node_id : (stryCov_9fa48("117364"), (stryMutAct_9fa48("117365") ? partition[COLUMN.LEADER_NODE_ID] : (stryCov_9fa48("117365"), partition?.[COLUMN.LEADER_NODE_ID])) ?? (stryMutAct_9fa48("117366") ? partition.leader_node_id : (stryCov_9fa48("117366"), partition?.leader_node_id)))) ?? (stryMutAct_9fa48("117367") ? partition.leaderNodeId : (stryCov_9fa48("117367"), partition?.leaderNodeId)))) ?? null);
      return stryMutAct_9fa48("117370") ? typeof leaderNodeId !== QUERY_EXECUTOR_LITERAL.STRING_STRING && leaderNodeId.length === NUM.ZERO : stryMutAct_9fa48("117369") ? false : stryMutAct_9fa48("117368") ? true : (stryCov_9fa48("117368", "117369", "117370"), (stryMutAct_9fa48("117372") ? typeof leaderNodeId === QUERY_EXECUTOR_LITERAL.STRING_STRING : stryMutAct_9fa48("117371") ? false : (stryCov_9fa48("117371", "117372"), typeof leaderNodeId !== QUERY_EXECUTOR_LITERAL.STRING_STRING)) || (stryMutAct_9fa48("117374") ? leaderNodeId.length !== NUM.ZERO : stryMutAct_9fa48("117373") ? false : (stryCov_9fa48("117373", "117374"), leaderNodeId.length === NUM.ZERO)));
    }
  }

  /**
   * Identify the short-lived partition bootstrap grace window before the
   * partition owner row is updated post-creation.
   * @param {Object|null} partition
   * @return {boolean}
   * @private
   */
  isBootstrapRoutingGraceWindow(partition) {
    if (stryMutAct_9fa48("117375")) {
      {}
    } else {
      stryCov_9fa48("117375");
      if (stryMutAct_9fa48("117378") ? typeof this.bootstrapTopologySnapshotOwner?.isBootstrapRoutingGraceWindow !== QUERY_EXECUTOR_LITERAL.STRING_FUNCTION : stryMutAct_9fa48("117377") ? false : stryMutAct_9fa48("117376") ? true : (stryCov_9fa48("117376", "117377", "117378"), typeof (stryMutAct_9fa48("117379") ? this.bootstrapTopologySnapshotOwner.isBootstrapRoutingGraceWindow : (stryCov_9fa48("117379"), this.bootstrapTopologySnapshotOwner?.isBootstrapRoutingGraceWindow)) === QUERY_EXECUTOR_LITERAL.STRING_FUNCTION)) {
        if (stryMutAct_9fa48("117380")) {
          {}
        } else {
          stryCov_9fa48("117380");
          return this.bootstrapTopologySnapshotOwner.isBootstrapRoutingGraceWindow(partition);
        }
      }
      if (stryMutAct_9fa48("117383") ? false : stryMutAct_9fa48("117382") ? true : stryMutAct_9fa48("117381") ? partition : (stryCov_9fa48("117381", "117382", "117383"), !partition)) {
        if (stryMutAct_9fa48("117384")) {
          {}
        } else {
          stryCov_9fa48("117384");
          return stryMutAct_9fa48("117385") ? true : (stryCov_9fa48("117385"), false);
        }
      }
      const createdAt = stryMutAct_9fa48("117386") ? (partition?.[COLUMN.CREATED_AT] ?? partition?.created_at ?? partition?.createdAt) && null : (stryCov_9fa48("117386"), (stryMutAct_9fa48("117387") ? (partition?.[COLUMN.CREATED_AT] ?? partition?.created_at) && partition?.createdAt : (stryCov_9fa48("117387"), (stryMutAct_9fa48("117388") ? partition?.[COLUMN.CREATED_AT] && partition?.created_at : (stryCov_9fa48("117388"), (stryMutAct_9fa48("117389") ? partition[COLUMN.CREATED_AT] : (stryCov_9fa48("117389"), partition?.[COLUMN.CREATED_AT])) ?? (stryMutAct_9fa48("117390") ? partition.created_at : (stryCov_9fa48("117390"), partition?.created_at)))) ?? (stryMutAct_9fa48("117391") ? partition.createdAt : (stryCov_9fa48("117391"), partition?.createdAt)))) ?? null);
      const updatedAt = stryMutAct_9fa48("117392") ? (partition?.[COLUMN.UPDATED_AT] ?? partition?.updated_at ?? partition?.updatedAt) && null : (stryCov_9fa48("117392"), (stryMutAct_9fa48("117393") ? (partition?.[COLUMN.UPDATED_AT] ?? partition?.updated_at) && partition?.updatedAt : (stryCov_9fa48("117393"), (stryMutAct_9fa48("117394") ? partition?.[COLUMN.UPDATED_AT] && partition?.updated_at : (stryCov_9fa48("117394"), (stryMutAct_9fa48("117395") ? partition[COLUMN.UPDATED_AT] : (stryCov_9fa48("117395"), partition?.[COLUMN.UPDATED_AT])) ?? (stryMutAct_9fa48("117396") ? partition.updated_at : (stryCov_9fa48("117396"), partition?.updated_at)))) ?? (stryMutAct_9fa48("117397") ? partition.updatedAt : (stryCov_9fa48("117397"), partition?.updatedAt)))) ?? null);
      return stryMutAct_9fa48("117400") ? Number.isFinite(createdAt) && Number.isFinite(updatedAt) || createdAt === updatedAt : stryMutAct_9fa48("117399") ? false : stryMutAct_9fa48("117398") ? true : (stryCov_9fa48("117398", "117399", "117400"), (stryMutAct_9fa48("117402") ? Number.isFinite(createdAt) || Number.isFinite(updatedAt) : stryMutAct_9fa48("117401") ? true : (stryCov_9fa48("117401", "117402"), Number.isFinite(createdAt) && Number.isFinite(updatedAt))) && (stryMutAct_9fa48("117404") ? createdAt !== updatedAt : stryMutAct_9fa48("117403") ? true : (stryCov_9fa48("117403", "117404"), createdAt === updatedAt)));
    }
  }

  /**
   * Emit throttled diagnostics when canonical partition leader routing cannot
   * map owner metadata to a routable service.
   * @param {string} partitionId
   * @param {Object} options
   * @private
   */
  logCanonicalLeaderRoutingGap(partitionId, options = {}) {
    if (stryMutAct_9fa48("117405")) {
      {}
    } else {
      stryCov_9fa48("117405");
      const reason = String(stryMutAct_9fa48("117408") ? options.reason && LEADER_GAP_REASON_OWNER_MISSING : stryMutAct_9fa48("117407") ? false : stryMutAct_9fa48("117406") ? true : (stryCov_9fa48("117406", "117407", "117408"), options.reason || LEADER_GAP_REASON_OWNER_MISSING));
      const warnKey = partitionId + (stryMutAct_9fa48("117409") ? "" : (stryCov_9fa48("117409"), ':')) + reason;
      const now = Date.now();
      const lastWarnAt = this.canonicalLeaderWarnLastAt.get(warnKey);
      if (stryMutAct_9fa48("117412") ? Number.isFinite(lastWarnAt) || now - lastWarnAt < this.noServiceWarnThrottleMs : stryMutAct_9fa48("117411") ? false : stryMutAct_9fa48("117410") ? true : (stryCov_9fa48("117410", "117411", "117412"), Number.isFinite(lastWarnAt) && (stryMutAct_9fa48("117415") ? now - lastWarnAt >= this.noServiceWarnThrottleMs : stryMutAct_9fa48("117414") ? now - lastWarnAt <= this.noServiceWarnThrottleMs : stryMutAct_9fa48("117413") ? true : (stryCov_9fa48("117413", "117414", "117415"), (stryMutAct_9fa48("117416") ? now + lastWarnAt : (stryCov_9fa48("117416"), now - lastWarnAt)) < this.noServiceWarnThrottleMs)))) {
        if (stryMutAct_9fa48("117417")) {
          {}
        } else {
          stryCov_9fa48("117417");
          return;
        }
      }
      this.canonicalLeaderWarnLastAt.set(warnKey, now);
      const services = Array.isArray(options.services) ? options.services : stryMutAct_9fa48("117418") ? ["Stryker was here"] : (stryCov_9fa48("117418"), []);
      const routableNodeIds = stryMutAct_9fa48("117419") ? [] : (stryCov_9fa48("117419"), [...new Set(stryMutAct_9fa48("117420") ? services.map(service => service?.node_id) : (stryCov_9fa48("117420"), services.map(stryMutAct_9fa48("117421") ? () => undefined : (stryCov_9fa48("117421"), service => stryMutAct_9fa48("117422") ? service.node_id : (stryCov_9fa48("117422"), service?.node_id))).filter(stryMutAct_9fa48("117423") ? () => undefined : (stryCov_9fa48("117423"), nodeId => stryMutAct_9fa48("117426") ? typeof nodeId === 'string' || nodeId.length > NUM.ZERO : stryMutAct_9fa48("117425") ? false : stryMutAct_9fa48("117424") ? true : (stryCov_9fa48("117424", "117425", "117426"), (stryMutAct_9fa48("117428") ? typeof nodeId !== 'string' : stryMutAct_9fa48("117427") ? true : (stryCov_9fa48("117427", "117428"), typeof nodeId === (stryMutAct_9fa48("117429") ? "" : (stryCov_9fa48("117429"), 'string')))) && (stryMutAct_9fa48("117432") ? nodeId.length <= NUM.ZERO : stryMutAct_9fa48("117431") ? nodeId.length >= NUM.ZERO : stryMutAct_9fa48("117430") ? true : (stryCov_9fa48("117430", "117431", "117432"), nodeId.length > NUM.ZERO)))))))]);
      const staleLeaderNodeIds = stryMutAct_9fa48("117433") ? [] : (stryCov_9fa48("117433"), [...new Set(stryMutAct_9fa48("117435") ? services.map(service => service?.node_id).filter(nodeId => typeof nodeId === 'string' && nodeId.length > NUM.ZERO) : stryMutAct_9fa48("117434") ? services.filter(service => service?.raft_role === RAFT_ROLE.LEADER).map(service => service?.node_id) : (stryCov_9fa48("117434", "117435"), services.filter(stryMutAct_9fa48("117436") ? () => undefined : (stryCov_9fa48("117436"), service => stryMutAct_9fa48("117439") ? service?.raft_role !== RAFT_ROLE.LEADER : stryMutAct_9fa48("117438") ? false : stryMutAct_9fa48("117437") ? true : (stryCov_9fa48("117437", "117438", "117439"), (stryMutAct_9fa48("117440") ? service.raft_role : (stryCov_9fa48("117440"), service?.raft_role)) === RAFT_ROLE.LEADER))).map(stryMutAct_9fa48("117441") ? () => undefined : (stryCov_9fa48("117441"), service => stryMutAct_9fa48("117442") ? service.node_id : (stryCov_9fa48("117442"), service?.node_id))).filter(stryMutAct_9fa48("117443") ? () => undefined : (stryCov_9fa48("117443"), nodeId => stryMutAct_9fa48("117446") ? typeof nodeId === 'string' || nodeId.length > NUM.ZERO : stryMutAct_9fa48("117445") ? false : stryMutAct_9fa48("117444") ? true : (stryCov_9fa48("117444", "117445", "117446"), (stryMutAct_9fa48("117448") ? typeof nodeId !== 'string' : stryMutAct_9fa48("117447") ? true : (stryCov_9fa48("117447", "117448"), typeof nodeId === (stryMutAct_9fa48("117449") ? "" : (stryCov_9fa48("117449"), 'string')))) && (stryMutAct_9fa48("117452") ? nodeId.length <= NUM.ZERO : stryMutAct_9fa48("117451") ? nodeId.length >= NUM.ZERO : stryMutAct_9fa48("117450") ? true : (stryCov_9fa48("117450", "117451", "117452"), nodeId.length > NUM.ZERO)))))))]);
      if (stryMutAct_9fa48("117455") ? reason !== LEADER_GAP_REASON_SERVICE_MISSING : stryMutAct_9fa48("117454") ? false : stryMutAct_9fa48("117453") ? true : (stryCov_9fa48("117453", "117454", "117455"), reason === LEADER_GAP_REASON_SERVICE_MISSING)) {
        if (stryMutAct_9fa48("117456")) {
          {}
        } else {
          stryCov_9fa48("117456");
          this.logger.warn(QUERY_LOG_MSG.CANONICAL_LEADER_SERVICE_MISSING_FOR_PARTITION, stryMutAct_9fa48("117457") ? {} : (stryCov_9fa48("117457"), {
            partitionId,
            leaderNodeId: stryMutAct_9fa48("117460") ? options.canonicalLeaderNodeId && null : stryMutAct_9fa48("117459") ? false : stryMutAct_9fa48("117458") ? true : (stryCov_9fa48("117458", "117459", "117460"), options.canonicalLeaderNodeId || null),
            routableNodeIds,
            staleLeaderNodeIds,
            routingSnapshot: this.summarizePartitionRoutingSnapshot(options.routingSnapshot)
          }));
          return;
        }
      }
      this.logger.warn(QUERY_LOG_MSG.CANONICAL_LEADER_METADATA_MISSING_FOR_PARTITION, stryMutAct_9fa48("117461") ? {} : (stryCov_9fa48("117461"), {
        partitionId,
        routableNodeIds,
        staleLeaderNodeIds,
        routingSnapshot: this.summarizePartitionRoutingSnapshot(options.routingSnapshot)
      }));
    }
  }

  /**
   * Resolve overlay services for a partition.
   * @param {string} partitionId - Partition ID.
   * @return {Array<Object>} Overlay service rows.
   * @private
   */
  getOverlayPartitionServices(partitionId) {
    if (stryMutAct_9fa48("117462")) {
      {}
    } else {
      stryCov_9fa48("117462");
      const overlay = this.routingMetadataOverlay;
      if (stryMutAct_9fa48("117465") ? !overlay && typeof overlay.getServicesForPartition !== QUERY_EXECUTOR_LITERAL.STRING_FUNCTION : stryMutAct_9fa48("117464") ? false : stryMutAct_9fa48("117463") ? true : (stryCov_9fa48("117463", "117464", "117465"), (stryMutAct_9fa48("117466") ? overlay : (stryCov_9fa48("117466"), !overlay)) || (stryMutAct_9fa48("117468") ? typeof overlay.getServicesForPartition === QUERY_EXECUTOR_LITERAL.STRING_FUNCTION : stryMutAct_9fa48("117467") ? false : (stryCov_9fa48("117467", "117468"), typeof overlay.getServicesForPartition !== QUERY_EXECUTOR_LITERAL.STRING_FUNCTION)))) {
        if (stryMutAct_9fa48("117469")) {
          {}
        } else {
          stryCov_9fa48("117469");
          return stryMutAct_9fa48("117470") ? ["Stryker was here"] : (stryCov_9fa48("117470"), []);
        }
      }
      const services = overlay.getServicesForPartition(partitionId);
      return Array.isArray(services) ? services : stryMutAct_9fa48("117471") ? ["Stryker was here"] : (stryCov_9fa48("117471"), []);
    }
  }

  /**
   * Aggregate SELECT results from multiple partitions.
   * Properly handles cross-partition aggregation for COUNT, SUM, AVG, MIN, MAX.
   * Requirements: 22.3, 22.6, 22.7
   * @param {Array} results - Partition results.
   * @param {Object} ast - Parsed SELECT AST.
   * @return {Object} Aggregated result.
   * @private
   */
  aggregateSelectResults(results, ast) {
    if (stryMutAct_9fa48("117472")) {
      {}
    } else {
      stryCov_9fa48("117472");
      // Combine rows from all partitions
      let rows = stryMutAct_9fa48("117473") ? ["Stryker was here"] : (stryCov_9fa48("117473"), []);
      for (const result of results) {
        if (stryMutAct_9fa48("117474")) {
          {}
        } else {
          stryCov_9fa48("117474");
          if (stryMutAct_9fa48("117477") ? result.success || result.rows : stryMutAct_9fa48("117476") ? false : stryMutAct_9fa48("117475") ? true : (stryCov_9fa48("117475", "117476", "117477"), result.success && result.rows)) {
            if (stryMutAct_9fa48("117478")) {
              {}
            } else {
              stryCov_9fa48("117478");
              rows = rows.concat(result.rows);
            }
          }
        }
      }

      // Handle DISTINCT
      if (stryMutAct_9fa48("117480") ? false : stryMutAct_9fa48("117479") ? true : (stryCov_9fa48("117479", "117480"), ast.distinct)) {
        if (stryMutAct_9fa48("117481")) {
          {}
        } else {
          stryCov_9fa48("117481");
          rows = this.applyDistinct(rows);
        }
      }

      // Handle GROUP BY with aggregates
      if (stryMutAct_9fa48("117483") ? false : stryMutAct_9fa48("117482") ? true : (stryCov_9fa48("117482", "117483"), ast.groupBy)) {
        if (stryMutAct_9fa48("117484")) {
          {}
        } else {
          stryCov_9fa48("117484");
          rows = this.applyGroupBy(rows, ast);
        }
      } else if (stryMutAct_9fa48("117486") ? false : stryMutAct_9fa48("117485") ? true : (stryCov_9fa48("117485", "117486"), this.hasAggregates(ast))) {
        if (stryMutAct_9fa48("117487")) {
          {}
        } else {
          stryCov_9fa48("117487");
          // Aggregates without GROUP BY - aggregate across all partitions
          rows = this.applyAggregates(rows, ast);
        }
      }

      // Handle HAVING
      if (stryMutAct_9fa48("117489") ? false : stryMutAct_9fa48("117488") ? true : (stryCov_9fa48("117488", "117489"), ast.having)) {
        if (stryMutAct_9fa48("117490")) {
          {}
        } else {
          stryCov_9fa48("117490");
          rows = this.applyHaving(rows, ast.having);
        }
      }

      // Handle ORDER BY
      if (stryMutAct_9fa48("117492") ? false : stryMutAct_9fa48("117491") ? true : (stryCov_9fa48("117491", "117492"), ast.orderBy)) {
        if (stryMutAct_9fa48("117493")) {
          {}
        } else {
          stryCov_9fa48("117493");
          rows = this.applyOrderBy(rows, ast.orderBy);
        }
      }

      // Handle LIMIT/OFFSET
      if (stryMutAct_9fa48("117495") ? false : stryMutAct_9fa48("117494") ? true : (stryCov_9fa48("117494", "117495"), ast.limit)) {
        if (stryMutAct_9fa48("117496")) {
          {}
        } else {
          stryCov_9fa48("117496");
          rows = this.applyLimit(rows, ast.limit);
        }
      }
      return stryMutAct_9fa48("117497") ? {} : (stryCov_9fa48("117497"), {
        rows
      });
    }
  }

  /**
   * Aggregate results from multiple partitions for cross-partition queries.
   * This method handles partial aggregates that need to be combined.
   * Requirements: 22.3, 22.7
   * @param {Array} partitionResults - Results from each partition.
   * @param {Object} ast - Parsed SELECT AST.
   * @return {Object} Combined aggregated result.
   */
  aggregateCrossPartitionResults(partitionResults, ast) {
    if (stryMutAct_9fa48("117498")) {
      {}
    } else {
      stryCov_9fa48("117498");
      // For queries with aggregates, we need to combine partial results
      if (stryMutAct_9fa48("117501") ? false : stryMutAct_9fa48("117500") ? true : stryMutAct_9fa48("117499") ? this.hasAggregates(ast) : (stryCov_9fa48("117499", "117500", "117501"), !this.hasAggregates(ast))) {
        if (stryMutAct_9fa48("117502")) {
          {}
        } else {
          stryCov_9fa48("117502");
          return this.aggregateSelectResults(partitionResults, ast);
        }
      }

      // Collect all rows first
      let allRows = stryMutAct_9fa48("117503") ? ["Stryker was here"] : (stryCov_9fa48("117503"), []);
      for (const result of partitionResults) {
        if (stryMutAct_9fa48("117504")) {
          {}
        } else {
          stryCov_9fa48("117504");
          if (stryMutAct_9fa48("117507") ? result.success || result.rows : stryMutAct_9fa48("117506") ? false : stryMutAct_9fa48("117505") ? true : (stryCov_9fa48("117505", "117506", "117507"), result.success && result.rows)) {
            if (stryMutAct_9fa48("117508")) {
              {}
            } else {
              stryCov_9fa48("117508");
              allRows = allRows.concat(result.rows);
            }
          }
        }
      }

      // Re-compute aggregates on combined data
      if (stryMutAct_9fa48("117510") ? false : stryMutAct_9fa48("117509") ? true : (stryCov_9fa48("117509", "117510"), ast.groupBy)) {
        if (stryMutAct_9fa48("117511")) {
          {}
        } else {
          stryCov_9fa48("117511");
          return stryMutAct_9fa48("117512") ? {} : (stryCov_9fa48("117512"), {
            rows: this.applyGroupBy(allRows, ast)
          });
        }
      } else {
        if (stryMutAct_9fa48("117513")) {
          {}
        } else {
          stryCov_9fa48("117513");
          return stryMutAct_9fa48("117514") ? {} : (stryCov_9fa48("117514"), {
            rows: this.applyAggregates(allRows, ast)
          });
        }
      }
    }
  }

  /**
   * Apply DISTINCT to rows.
   * @param {Array} rows - Input rows.
   * @return {Array} Distinct rows.
   * @private
   */
  applyDistinct(rows) {
    if (stryMutAct_9fa48("117515")) {
      {}
    } else {
      stryCov_9fa48("117515");
      const seen = new Set();
      return stryMutAct_9fa48("117516") ? rows : (stryCov_9fa48("117516"), rows.filter(row => {
        if (stryMutAct_9fa48("117517")) {
          {}
        } else {
          stryCov_9fa48("117517");
          const key = JSON.stringify(row);
          if (stryMutAct_9fa48("117519") ? false : stryMutAct_9fa48("117518") ? true : (stryCov_9fa48("117518", "117519"), seen.has(key))) return stryMutAct_9fa48("117520") ? true : (stryCov_9fa48("117520"), false);
          seen.add(key);
          return stryMutAct_9fa48("117521") ? false : (stryCov_9fa48("117521"), true);
        }
      }));
    }
  }

  /**
   * Check if AST has aggregate functions.
   * @param {Object} ast - SELECT AST.
   * @return {boolean} True if has aggregates.
   * @private
   */
  hasAggregates(ast) {
    if (stryMutAct_9fa48("117522")) {
      {}
    } else {
      stryCov_9fa48("117522");
      return stryMutAct_9fa48("117523") ? ast.columns.every(col => col.expression?.type === QUERY_EXECUTOR_LITERAL.STRING_AGGREGATE || col.type === QUERY_EXECUTOR_LITERAL.STRING_AGGREGATE) : (stryCov_9fa48("117523"), ast.columns.some(stryMutAct_9fa48("117524") ? () => undefined : (stryCov_9fa48("117524"), col => stryMutAct_9fa48("117527") ? col.expression?.type === QUERY_EXECUTOR_LITERAL.STRING_AGGREGATE && col.type === QUERY_EXECUTOR_LITERAL.STRING_AGGREGATE : stryMutAct_9fa48("117526") ? false : stryMutAct_9fa48("117525") ? true : (stryCov_9fa48("117525", "117526", "117527"), (stryMutAct_9fa48("117529") ? col.expression?.type !== QUERY_EXECUTOR_LITERAL.STRING_AGGREGATE : stryMutAct_9fa48("117528") ? false : (stryCov_9fa48("117528", "117529"), (stryMutAct_9fa48("117530") ? col.expression.type : (stryCov_9fa48("117530"), col.expression?.type)) === QUERY_EXECUTOR_LITERAL.STRING_AGGREGATE)) || (stryMutAct_9fa48("117532") ? col.type !== QUERY_EXECUTOR_LITERAL.STRING_AGGREGATE : stryMutAct_9fa48("117531") ? false : (stryCov_9fa48("117531", "117532"), col.type === QUERY_EXECUTOR_LITERAL.STRING_AGGREGATE))))));
    }
  }

  /**
   * Apply GROUP BY to rows.
   * @param {Array} rows - Input rows.
   * @param {Object} ast - SELECT AST.
   * @return {Array} Grouped rows.
   * @private
   */
  applyGroupBy(rows, ast) {
    if (stryMutAct_9fa48("117533")) {
      {}
    } else {
      stryCov_9fa48("117533");
      const groups = new Map();
      const groupByColumns = ast.groupBy.map(stryMutAct_9fa48("117534") ? () => undefined : (stryCov_9fa48("117534"), g => stryMutAct_9fa48("117537") ? (g.column || g.expression?.column) && g : stryMutAct_9fa48("117536") ? false : stryMutAct_9fa48("117535") ? true : (stryCov_9fa48("117535", "117536", "117537"), (stryMutAct_9fa48("117539") ? g.column && g.expression?.column : stryMutAct_9fa48("117538") ? false : (stryCov_9fa48("117538", "117539"), g.column || (stryMutAct_9fa48("117540") ? g.expression.column : (stryCov_9fa48("117540"), g.expression?.column)))) || g)));

      // Group rows
      for (const row of rows) {
        if (stryMutAct_9fa48("117541")) {
          {}
        } else {
          stryCov_9fa48("117541");
          const key = groupByColumns.map(stryMutAct_9fa48("117542") ? () => undefined : (stryCov_9fa48("117542"), col => row[col])).join(stryMutAct_9fa48("117543") ? "" : (stryCov_9fa48("117543"), '|'));
          if (stryMutAct_9fa48("117546") ? false : stryMutAct_9fa48("117545") ? true : stryMutAct_9fa48("117544") ? groups.has(key) : (stryCov_9fa48("117544", "117545", "117546"), !groups.has(key))) {
            if (stryMutAct_9fa48("117547")) {
              {}
            } else {
              stryCov_9fa48("117547");
              groups.set(key, stryMutAct_9fa48("117548") ? ["Stryker was here"] : (stryCov_9fa48("117548"), []));
            }
          }
          groups.get(key).push(row);
        }
      }

      // Apply aggregates to each group
      const result = stryMutAct_9fa48("117549") ? ["Stryker was here"] : (stryCov_9fa48("117549"), []);
      for (const groupRows of groups.values()) {
        if (stryMutAct_9fa48("117550")) {
          {}
        } else {
          stryCov_9fa48("117550");
          const aggregatedRow = this.computeGroupAggregates(groupRows, ast);
          result.push(aggregatedRow);
        }
      }
      return result;
    }
  }

  /**
   * Compute aggregates for a group of rows.
   * @param {Array} rows - Group rows.
   * @param {Object} ast - SELECT AST.
   * @return {Object} Aggregated row.
   * @private
   */
  computeGroupAggregates(rows, ast) {
    if (stryMutAct_9fa48("117551")) {
      {}
    } else {
      stryCov_9fa48("117551");
      const result = {};

      // Copy group by columns from first row
      if (stryMutAct_9fa48("117554") ? ast.groupBy || rows.length > NUM.ZERO : stryMutAct_9fa48("117553") ? false : stryMutAct_9fa48("117552") ? true : (stryCov_9fa48("117552", "117553", "117554"), ast.groupBy && (stryMutAct_9fa48("117557") ? rows.length <= NUM.ZERO : stryMutAct_9fa48("117556") ? rows.length >= NUM.ZERO : stryMutAct_9fa48("117555") ? true : (stryCov_9fa48("117555", "117556", "117557"), rows.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("117558")) {
          {}
        } else {
          stryCov_9fa48("117558");
          for (const g of ast.groupBy) {
            if (stryMutAct_9fa48("117559")) {
              {}
            } else {
              stryCov_9fa48("117559");
              const col = stryMutAct_9fa48("117562") ? (g.column || g.expression?.column) && g : stryMutAct_9fa48("117561") ? false : stryMutAct_9fa48("117560") ? true : (stryCov_9fa48("117560", "117561", "117562"), (stryMutAct_9fa48("117564") ? g.column && g.expression?.column : stryMutAct_9fa48("117563") ? false : (stryCov_9fa48("117563", "117564"), g.column || (stryMutAct_9fa48("117565") ? g.expression.column : (stryCov_9fa48("117565"), g.expression?.column)))) || g);
              result[col] = rows[NUM.ZERO][col];
            }
          }
        }
      }

      // Compute aggregates
      for (const col of ast.columns) {
        if (stryMutAct_9fa48("117566")) {
          {}
        } else {
          stryCov_9fa48("117566");
          const expr = stryMutAct_9fa48("117569") ? col.expression && col : stryMutAct_9fa48("117568") ? false : stryMutAct_9fa48("117567") ? true : (stryCov_9fa48("117567", "117568", "117569"), col.expression || col);
          if (stryMutAct_9fa48("117572") ? expr.type !== QUERY_EXECUTOR_LITERAL.STRING_AGGREGATE : stryMutAct_9fa48("117571") ? false : stryMutAct_9fa48("117570") ? true : (stryCov_9fa48("117570", "117571", "117572"), expr.type === QUERY_EXECUTOR_LITERAL.STRING_AGGREGATE)) {
            if (stryMutAct_9fa48("117573")) {
              {}
            } else {
              stryCov_9fa48("117573");
              const alias = stryMutAct_9fa48("117576") ? col.alias && `${expr.function}(${this.getArgName(expr)})` : stryMutAct_9fa48("117575") ? false : stryMutAct_9fa48("117574") ? true : (stryCov_9fa48("117574", "117575", "117576"), col.alias || (stryMutAct_9fa48("117577") ? `` : (stryCov_9fa48("117577"), `${expr.function}(${this.getArgName(expr)})`)));
              result[alias] = this.computeAggregate(rows, expr);
            }
          } else if (stryMutAct_9fa48("117580") ? expr.type !== QUERY_EXECUTOR_LITERAL.STRING_COLUMN_REF : stryMutAct_9fa48("117579") ? false : stryMutAct_9fa48("117578") ? true : (stryCov_9fa48("117578", "117579", "117580"), expr.type === QUERY_EXECUTOR_LITERAL.STRING_COLUMN_REF)) {
            if (stryMutAct_9fa48("117581")) {
              {}
            } else {
              stryCov_9fa48("117581");
              const colName = expr.column;
              if (stryMutAct_9fa48("117585") ? rows.length <= NUM.ZERO : stryMutAct_9fa48("117584") ? rows.length >= NUM.ZERO : stryMutAct_9fa48("117583") ? false : stryMutAct_9fa48("117582") ? true : (stryCov_9fa48("117582", "117583", "117584", "117585"), rows.length > NUM.ZERO)) {
                if (stryMutAct_9fa48("117586")) {
                  {}
                } else {
                  stryCov_9fa48("117586");
                  result[colName] = rows[NUM.ZERO][colName];
                }
              }
            }
          }
        }
      }
      return result;
    }
  }

  /**
   * Get argument name for aggregate function.
   * @param {Object} expr - Aggregate expression.
   * @return {string} Argument name.
   * @private
   */
  getArgName(expr) {
    if (stryMutAct_9fa48("117587")) {
      {}
    } else {
      stryCov_9fa48("117587");
      if (stryMutAct_9fa48("117590") ? expr.argument?.type !== QUERY_EXECUTOR_LITERAL.STRING_STAR : stryMutAct_9fa48("117589") ? false : stryMutAct_9fa48("117588") ? true : (stryCov_9fa48("117588", "117589", "117590"), (stryMutAct_9fa48("117591") ? expr.argument.type : (stryCov_9fa48("117591"), expr.argument?.type)) === QUERY_EXECUTOR_LITERAL.STRING_STAR)) return QUERY_EXECUTOR_LITERAL.STRING_VALUE_3;
      if (stryMutAct_9fa48("117594") ? expr.argument?.type !== QUERY_EXECUTOR_LITERAL.STRING_COLUMN_REF : stryMutAct_9fa48("117593") ? false : stryMutAct_9fa48("117592") ? true : (stryCov_9fa48("117592", "117593", "117594"), (stryMutAct_9fa48("117595") ? expr.argument.type : (stryCov_9fa48("117595"), expr.argument?.type)) === QUERY_EXECUTOR_LITERAL.STRING_COLUMN_REF)) return expr.argument.column;
      return QUERY_EXECUTOR_LITERAL.STRING_VALUE_4;
    }
  }

  /**
   * Apply aggregates without GROUP BY.
   * @param {Array} rows - Input rows.
   * @param {Object} ast - SELECT AST.
   * @return {Array} Single aggregated row.
   * @private
   */
  applyAggregates(rows, ast) {
    if (stryMutAct_9fa48("117596")) {
      {}
    } else {
      stryCov_9fa48("117596");
      const result = {};
      for (const col of ast.columns) {
        if (stryMutAct_9fa48("117597")) {
          {}
        } else {
          stryCov_9fa48("117597");
          const expr = stryMutAct_9fa48("117600") ? col.expression && col : stryMutAct_9fa48("117599") ? false : stryMutAct_9fa48("117598") ? true : (stryCov_9fa48("117598", "117599", "117600"), col.expression || col);
          if (stryMutAct_9fa48("117603") ? expr.type !== QUERY_EXECUTOR_LITERAL.STRING_AGGREGATE : stryMutAct_9fa48("117602") ? false : stryMutAct_9fa48("117601") ? true : (stryCov_9fa48("117601", "117602", "117603"), expr.type === QUERY_EXECUTOR_LITERAL.STRING_AGGREGATE)) {
            if (stryMutAct_9fa48("117604")) {
              {}
            } else {
              stryCov_9fa48("117604");
              const alias = stryMutAct_9fa48("117607") ? col.alias && `${expr.function}(${this.getArgName(expr)})` : stryMutAct_9fa48("117606") ? false : stryMutAct_9fa48("117605") ? true : (stryCov_9fa48("117605", "117606", "117607"), col.alias || (stryMutAct_9fa48("117608") ? `` : (stryCov_9fa48("117608"), `${expr.function}(${this.getArgName(expr)})`)));
              result[alias] = this.computeAggregate(rows, expr);
            }
          }
        }
      }
      return stryMutAct_9fa48("117609") ? [] : (stryCov_9fa48("117609"), [result]);
    }
  }

  /**
   * Compute a single aggregate value across all rows.
   * Supports COUNT, SUM, AVG, MIN, MAX for cross-partition aggregation.
   * Requirements: 22.7
   * @param {Array} rows - Input rows.
   * @param {Object} expr - Aggregate expression.
   * @return {*} Aggregate value.
   * @private
   */
  computeAggregate(rows, expr) {
    if (stryMutAct_9fa48("117610")) {
      {}
    } else {
      stryCov_9fa48("117610");
      const func = stryMutAct_9fa48("117611") ? expr.function.toLowerCase() : (stryCov_9fa48("117611"), expr.function.toUpperCase());
      const arg = expr.argument;
      const colName = (stryMutAct_9fa48("117614") ? arg?.type !== 'column_ref' : stryMutAct_9fa48("117613") ? false : stryMutAct_9fa48("117612") ? true : (stryCov_9fa48("117612", "117613", "117614"), (stryMutAct_9fa48("117615") ? arg.type : (stryCov_9fa48("117615"), arg?.type)) === (stryMutAct_9fa48("117616") ? "" : (stryCov_9fa48("117616"), 'column_ref')))) ? arg.column : null;
      let values = rows;
      if (stryMutAct_9fa48("117618") ? false : stryMutAct_9fa48("117617") ? true : (stryCov_9fa48("117617", "117618"), colName)) {
        if (stryMutAct_9fa48("117619")) {
          {}
        } else {
          stryCov_9fa48("117619");
          values = stryMutAct_9fa48("117620") ? rows.map(r => r[colName]) : (stryCov_9fa48("117620"), rows.map(stryMutAct_9fa48("117621") ? () => undefined : (stryCov_9fa48("117621"), r => r[colName])).filter(stryMutAct_9fa48("117622") ? () => undefined : (stryCov_9fa48("117622"), v => stryMutAct_9fa48("117625") ? v !== null || v !== undefined : stryMutAct_9fa48("117624") ? false : stryMutAct_9fa48("117623") ? true : (stryCov_9fa48("117623", "117624", "117625"), (stryMutAct_9fa48("117627") ? v === null : stryMutAct_9fa48("117626") ? true : (stryCov_9fa48("117626", "117627"), v !== null)) && (stryMutAct_9fa48("117629") ? v === undefined : stryMutAct_9fa48("117628") ? true : (stryCov_9fa48("117628", "117629"), v !== undefined))))));
        }
      }
      if (stryMutAct_9fa48("117632") ? expr.distinct || colName : stryMutAct_9fa48("117631") ? false : stryMutAct_9fa48("117630") ? true : (stryCov_9fa48("117630", "117631", "117632"), expr.distinct && colName)) {
        if (stryMutAct_9fa48("117633")) {
          {}
        } else {
          stryCov_9fa48("117633");
          values = stryMutAct_9fa48("117634") ? [] : (stryCov_9fa48("117634"), [...new Set(values)]);
        }
      }
      switch (func) {
        case QUERY_EXECUTOR_LITERAL.STRING_COUNT:
          if (stryMutAct_9fa48("117635")) {} else {
            stryCov_9fa48("117635");
            // COUNT(*) counts all rows, COUNT(column) counts non-null values
            if (stryMutAct_9fa48("117638") ? arg?.type !== QUERY_EXECUTOR_LITERAL.STRING_STAR : stryMutAct_9fa48("117637") ? false : stryMutAct_9fa48("117636") ? true : (stryCov_9fa48("117636", "117637", "117638"), (stryMutAct_9fa48("117639") ? arg.type : (stryCov_9fa48("117639"), arg?.type)) === QUERY_EXECUTOR_LITERAL.STRING_STAR)) {
              if (stryMutAct_9fa48("117640")) {
                {}
              } else {
                stryCov_9fa48("117640");
                return rows.length;
              }
            }
            return values.length;
          }
        case QUERY_EXECUTOR_LITERAL.STRING_SUM:
          if (stryMutAct_9fa48("117641")) {} else {
            stryCov_9fa48("117641");
            // SUM aggregates numeric values across all partitions
            return values.reduce(stryMutAct_9fa48("117642") ? () => undefined : (stryCov_9fa48("117642"), (sum, v) => stryMutAct_9fa48("117643") ? sum - (Number(v) || NUM.ZERO) : (stryCov_9fa48("117643"), sum + (stryMutAct_9fa48("117646") ? Number(v) && NUM.ZERO : stryMutAct_9fa48("117645") ? false : stryMutAct_9fa48("117644") ? true : (stryCov_9fa48("117644", "117645", "117646"), Number(v) || NUM.ZERO)))), NUM.ZERO);
          }
        case QUERY_EXECUTOR_LITERAL.STRING_AVG:
          if (stryMutAct_9fa48("117647")) {} else {
            stryCov_9fa48("117647");
            {
              if (stryMutAct_9fa48("117648")) {
                {}
              } else {
                stryCov_9fa48("117648");
                // AVG must be computed on combined data, not averaged averages
                if (stryMutAct_9fa48("117651") ? values.length !== NUM.ZERO : stryMutAct_9fa48("117650") ? false : stryMutAct_9fa48("117649") ? true : (stryCov_9fa48("117649", "117650", "117651"), values.length === NUM.ZERO)) return null;
                const avgSum = values.reduce(stryMutAct_9fa48("117652") ? () => undefined : (stryCov_9fa48("117652"), (s, v) => stryMutAct_9fa48("117653") ? s - (Number(v) || 0) : (stryCov_9fa48("117653"), s + (stryMutAct_9fa48("117656") ? Number(v) && 0 : stryMutAct_9fa48("117655") ? false : stryMutAct_9fa48("117654") ? true : (stryCov_9fa48("117654", "117655", "117656"), Number(v) || 0)))), 0);
                return stryMutAct_9fa48("117657") ? avgSum * values.length : (stryCov_9fa48("117657"), avgSum / values.length);
              }
            }
          }
        case QUERY_EXECUTOR_LITERAL.STRING_MIN:
          if (stryMutAct_9fa48("117658")) {} else {
            stryCov_9fa48("117658");
            // MIN finds the minimum across all partitions
            if (stryMutAct_9fa48("117661") ? values.length !== NUM.ZERO : stryMutAct_9fa48("117660") ? false : stryMutAct_9fa48("117659") ? true : (stryCov_9fa48("117659", "117660", "117661"), values.length === NUM.ZERO)) return null;
            return values.reduce(stryMutAct_9fa48("117662") ? () => undefined : (stryCov_9fa48("117662"), (min, v) => (stryMutAct_9fa48("117666") ? v >= min : stryMutAct_9fa48("117665") ? v <= min : stryMutAct_9fa48("117664") ? false : stryMutAct_9fa48("117663") ? true : (stryCov_9fa48("117663", "117664", "117665", "117666"), v < min)) ? v : min), values[NUM.ZERO]);
          }
        case QUERY_EXECUTOR_LITERAL.STRING_MAX:
          if (stryMutAct_9fa48("117667")) {} else {
            stryCov_9fa48("117667");
            // MAX finds the maximum across all partitions
            if (stryMutAct_9fa48("117670") ? values.length !== NUM.ZERO : stryMutAct_9fa48("117669") ? false : stryMutAct_9fa48("117668") ? true : (stryCov_9fa48("117668", "117669", "117670"), values.length === NUM.ZERO)) return null;
            return values.reduce(stryMutAct_9fa48("117671") ? () => undefined : (stryCov_9fa48("117671"), (max, v) => (stryMutAct_9fa48("117675") ? v <= max : stryMutAct_9fa48("117674") ? v >= max : stryMutAct_9fa48("117673") ? false : stryMutAct_9fa48("117672") ? true : (stryCov_9fa48("117672", "117673", "117674", "117675"), v > max)) ? v : max), values[NUM.ZERO]);
          }
        default:
          if (stryMutAct_9fa48("117676")) {} else {
            stryCov_9fa48("117676");
            return null;
          }
      }
    }
  }

  /**
   * Apply HAVING clause to grouped rows.
   * @param {Array} rows - Grouped rows.
   * @param {Object} having - HAVING clause AST.
   * @return {Array} Filtered rows.
   * @private
   */
  applyHaving(rows, having) {
    if (stryMutAct_9fa48("117677")) {
      {}
    } else {
      stryCov_9fa48("117677");
      return stryMutAct_9fa48("117678") ? rows : (stryCov_9fa48("117678"), rows.filter(stryMutAct_9fa48("117679") ? () => undefined : (stryCov_9fa48("117679"), row => this.evaluateExpression(row, having))));
    }
  }

  /**
   * Evaluate an expression against a row.
   * @param {Object} row - Data row.
   * @param {Object} expr - Expression AST.
   * @return {*} Expression value.
   * @private
   */
  evaluateExpression(row, expr) {
    if (stryMutAct_9fa48("117680")) {
      {}
    } else {
      stryCov_9fa48("117680");
      if (stryMutAct_9fa48("117683") ? false : stryMutAct_9fa48("117682") ? true : stryMutAct_9fa48("117681") ? expr : (stryCov_9fa48("117681", "117682", "117683"), !expr)) return stryMutAct_9fa48("117684") ? false : (stryCov_9fa48("117684"), true);
      switch (expr.type) {
        case QUERY_EXECUTOR_LITERAL.STRING_BINARY:
          if (stryMutAct_9fa48("117685")) {} else {
            stryCov_9fa48("117685");
            return this.evaluateBinary(row, expr);
          }
        case QUERY_EXECUTOR_LITERAL.STRING_UNARY:
          if (stryMutAct_9fa48("117686")) {} else {
            stryCov_9fa48("117686");
            return this.evaluateUnary(row, expr);
          }
        case QUERY_EXECUTOR_LITERAL.STRING_IN:
          if (stryMutAct_9fa48("117687")) {} else {
            stryCov_9fa48("117687");
            return this.evaluateIn(row, expr);
          }
        case QUERY_EXECUTOR_LITERAL.STRING_BETWEEN:
          if (stryMutAct_9fa48("117688")) {} else {
            stryCov_9fa48("117688");
            return this.evaluateBetween(row, expr);
          }
        case QUERY_EXECUTOR_LITERAL.STRING_LIKE:
          if (stryMutAct_9fa48("117689")) {} else {
            stryCov_9fa48("117689");
            return this.evaluateLike(row, expr);
          }
        case QUERY_EXECUTOR_LITERAL.STRING_LITERAL:
          if (stryMutAct_9fa48("117690")) {} else {
            stryCov_9fa48("117690");
            return expr.value;
          }
        case QUERY_EXECUTOR_LITERAL.STRING_COLUMN_REF:
          if (stryMutAct_9fa48("117691")) {} else {
            stryCov_9fa48("117691");
            return row[expr.column];
          }
        case QUERY_EXECUTOR_LITERAL.STRING_AGGREGATE:
          if (stryMutAct_9fa48("117692")) {} else {
            stryCov_9fa48("117692");
            {
              if (stryMutAct_9fa48("117693")) {
                {}
              } else {
                stryCov_9fa48("117693");
                // For HAVING, aggregate values should already be computed
                const alias = stryMutAct_9fa48("117694") ? `` : (stryCov_9fa48("117694"), `${expr.function}(${this.getArgName(expr)})`);
                return row[alias];
              }
            }
          }
        default:
          if (stryMutAct_9fa48("117695")) {} else {
            stryCov_9fa48("117695");
            return stryMutAct_9fa48("117696") ? false : (stryCov_9fa48("117696"), true);
          }
      }
    }
  }

  /**
   * Evaluate a binary expression.
   * @param {Object} row - Data row.
   * @param {Object} expr - Binary expression.
   * @return {boolean} Expression result.
   * @private
   */
  evaluateBinary(row, expr) {
    if (stryMutAct_9fa48("117697")) {
      {}
    } else {
      stryCov_9fa48("117697");
      const left = this.evaluateExpression(row, expr.left);
      const right = this.evaluateExpression(row, expr.right);
      switch (expr.operator) {
        case QUERY_EXECUTOR_LITERAL.STRING_AND:
          if (stryMutAct_9fa48("117698")) {} else {
            stryCov_9fa48("117698");
            return stryMutAct_9fa48("117701") ? left || right : stryMutAct_9fa48("117700") ? false : stryMutAct_9fa48("117699") ? true : (stryCov_9fa48("117699", "117700", "117701"), left && right);
          }
        case QUERY_EXECUTOR_LITERAL.STRING_OR:
          if (stryMutAct_9fa48("117702")) {} else {
            stryCov_9fa48("117702");
            return stryMutAct_9fa48("117705") ? left && right : stryMutAct_9fa48("117704") ? false : stryMutAct_9fa48("117703") ? true : (stryCov_9fa48("117703", "117704", "117705"), left || right);
          }
        case QUERY_EXECUTOR_LITERAL.STRING_VALUE_5:
          if (stryMutAct_9fa48("117706")) {} else {
            stryCov_9fa48("117706");
            return stryMutAct_9fa48("117709") ? left !== right : stryMutAct_9fa48("117708") ? false : stryMutAct_9fa48("117707") ? true : (stryCov_9fa48("117707", "117708", "117709"), left === right);
          }
        case QUERY_EXECUTOR_LITERAL.STRING_VALUE_6:
        case QUERY_EXECUTOR_LITERAL.STRING_VALUE_7:
          if (stryMutAct_9fa48("117710")) {} else {
            stryCov_9fa48("117710");
            return stryMutAct_9fa48("117713") ? left === right : stryMutAct_9fa48("117712") ? false : stryMutAct_9fa48("117711") ? true : (stryCov_9fa48("117711", "117712", "117713"), left !== right);
          }
        case QUERY_EXECUTOR_LITERAL.STRING_VALUE_8:
          if (stryMutAct_9fa48("117714")) {} else {
            stryCov_9fa48("117714");
            return stryMutAct_9fa48("117718") ? left >= right : stryMutAct_9fa48("117717") ? left <= right : stryMutAct_9fa48("117716") ? false : stryMutAct_9fa48("117715") ? true : (stryCov_9fa48("117715", "117716", "117717", "117718"), left < right);
          }
        case QUERY_EXECUTOR_LITERAL.STRING_VALUE_9:
          if (stryMutAct_9fa48("117719")) {} else {
            stryCov_9fa48("117719");
            return stryMutAct_9fa48("117723") ? left > right : stryMutAct_9fa48("117722") ? left < right : stryMutAct_9fa48("117721") ? false : stryMutAct_9fa48("117720") ? true : (stryCov_9fa48("117720", "117721", "117722", "117723"), left <= right);
          }
        case QUERY_EXECUTOR_LITERAL.STRING_VALUE_10:
          if (stryMutAct_9fa48("117724")) {} else {
            stryCov_9fa48("117724");
            return stryMutAct_9fa48("117728") ? left <= right : stryMutAct_9fa48("117727") ? left >= right : stryMutAct_9fa48("117726") ? false : stryMutAct_9fa48("117725") ? true : (stryCov_9fa48("117725", "117726", "117727", "117728"), left > right);
          }
        case QUERY_EXECUTOR_LITERAL.STRING_VALUE_11:
          if (stryMutAct_9fa48("117729")) {} else {
            stryCov_9fa48("117729");
            return stryMutAct_9fa48("117733") ? left < right : stryMutAct_9fa48("117732") ? left > right : stryMutAct_9fa48("117731") ? false : stryMutAct_9fa48("117730") ? true : (stryCov_9fa48("117730", "117731", "117732", "117733"), left >= right);
          }
        case QUERY_EXECUTOR_LITERAL.STRING_IS_NULL:
          if (stryMutAct_9fa48("117734")) {} else {
            stryCov_9fa48("117734");
            return stryMutAct_9fa48("117737") ? left === null && left === undefined : stryMutAct_9fa48("117736") ? false : stryMutAct_9fa48("117735") ? true : (stryCov_9fa48("117735", "117736", "117737"), (stryMutAct_9fa48("117739") ? left !== null : stryMutAct_9fa48("117738") ? false : (stryCov_9fa48("117738", "117739"), left === null)) || (stryMutAct_9fa48("117741") ? left !== undefined : stryMutAct_9fa48("117740") ? false : (stryCov_9fa48("117740", "117741"), left === undefined)));
          }
        case QUERY_EXECUTOR_LITERAL.STRING_IS_NOT_NULL:
          if (stryMutAct_9fa48("117742")) {} else {
            stryCov_9fa48("117742");
            return stryMutAct_9fa48("117745") ? left !== null || left !== undefined : stryMutAct_9fa48("117744") ? false : stryMutAct_9fa48("117743") ? true : (stryCov_9fa48("117743", "117744", "117745"), (stryMutAct_9fa48("117747") ? left === null : stryMutAct_9fa48("117746") ? true : (stryCov_9fa48("117746", "117747"), left !== null)) && (stryMutAct_9fa48("117749") ? left === undefined : stryMutAct_9fa48("117748") ? true : (stryCov_9fa48("117748", "117749"), left !== undefined)));
          }
        default:
          if (stryMutAct_9fa48("117750")) {} else {
            stryCov_9fa48("117750");
            return stryMutAct_9fa48("117751") ? false : (stryCov_9fa48("117751"), true);
          }
      }
    }
  }

  /**
   * Evaluate a unary expression.
   * @param {Object} row - Data row.
   * @param {Object} expr - Unary expression.
   * @return {*} Expression result.
   * @private
   */
  evaluateUnary(row, expr) {
    if (stryMutAct_9fa48("117752")) {
      {}
    } else {
      stryCov_9fa48("117752");
      const operand = this.evaluateExpression(row, expr.operand);
      switch (expr.operator) {
        case QUERY_EXECUTOR_LITERAL.STRING_NOT:
          if (stryMutAct_9fa48("117753")) {} else {
            stryCov_9fa48("117753");
            return stryMutAct_9fa48("117754") ? operand : (stryCov_9fa48("117754"), !operand);
          }
        case QUERY_EXECUTOR_LITERAL.STRING_VALUE_12:
          if (stryMutAct_9fa48("117755")) {} else {
            stryCov_9fa48("117755");
            return stryMutAct_9fa48("117756") ? -operand : (stryCov_9fa48("117756"), +operand);
          }
        case QUERY_EXECUTOR_LITERAL.STRING_VALUE_13:
          if (stryMutAct_9fa48("117757")) {} else {
            stryCov_9fa48("117757");
            return stryMutAct_9fa48("117758") ? +operand : (stryCov_9fa48("117758"), -operand);
          }
        default:
          if (stryMutAct_9fa48("117759")) {} else {
            stryCov_9fa48("117759");
            return operand;
          }
      }
    }
  }

  /**
   * Evaluate an IN/NOT IN expression.
   * @param {Object} row - Data row.
   * @param {Object} expr - IN expression AST.
   * @return {boolean} Expression result.
   * @private
   */
  evaluateIn(row, expr) {
    if (stryMutAct_9fa48("117760")) {
      {}
    } else {
      stryCov_9fa48("117760");
      const value = this.evaluateExpression(row, expr.expression);
      const set = expr.values.map(stryMutAct_9fa48("117761") ? () => undefined : (stryCov_9fa48("117761"), v => this.evaluateExpression(row, v)));
      const matches = stryMutAct_9fa48("117762") ? set.every(candidate => candidate === value) : (stryCov_9fa48("117762"), set.some(stryMutAct_9fa48("117763") ? () => undefined : (stryCov_9fa48("117763"), candidate => stryMutAct_9fa48("117766") ? candidate !== value : stryMutAct_9fa48("117765") ? false : stryMutAct_9fa48("117764") ? true : (stryCov_9fa48("117764", "117765", "117766"), candidate === value))));
      return expr.negated ? stryMutAct_9fa48("117767") ? matches : (stryCov_9fa48("117767"), !matches) : matches;
    }
  }

  /**
   * Evaluate a BETWEEN expression.
   * @param {Object} row - Data row.
   * @param {Object} expr - BETWEEN expression AST.
   * @return {boolean} Expression result.
   * @private
   */
  evaluateBetween(row, expr) {
    if (stryMutAct_9fa48("117768")) {
      {}
    } else {
      stryCov_9fa48("117768");
      const value = this.evaluateExpression(row, expr.expression);
      const low = this.evaluateExpression(row, expr.low);
      const high = this.evaluateExpression(row, expr.high);
      return stryMutAct_9fa48("117771") ? value >= low || value <= high : stryMutAct_9fa48("117770") ? false : stryMutAct_9fa48("117769") ? true : (stryCov_9fa48("117769", "117770", "117771"), (stryMutAct_9fa48("117774") ? value < low : stryMutAct_9fa48("117773") ? value > low : stryMutAct_9fa48("117772") ? true : (stryCov_9fa48("117772", "117773", "117774"), value >= low)) && (stryMutAct_9fa48("117777") ? value > high : stryMutAct_9fa48("117776") ? value < high : stryMutAct_9fa48("117775") ? true : (stryCov_9fa48("117775", "117776", "117777"), value <= high)));
    }
  }

  /**
   * Evaluate a LIKE/NOT LIKE expression.
   * @param {Object} row - Data row.
   * @param {Object} expr - LIKE expression AST.
   * @return {boolean} Expression result.
   * @private
   */
  evaluateLike(row, expr) {
    if (stryMutAct_9fa48("117778")) {
      {}
    } else {
      stryCov_9fa48("117778");
      const value = this.evaluateExpression(row, expr.expression);
      const pattern = this.evaluateExpression(row, expr.pattern);
      if (stryMutAct_9fa48("117781") ? (value === null || value === undefined || pattern === null) && pattern === undefined : stryMutAct_9fa48("117780") ? false : stryMutAct_9fa48("117779") ? true : (stryCov_9fa48("117779", "117780", "117781"), (stryMutAct_9fa48("117783") ? (value === null || value === undefined) && pattern === null : stryMutAct_9fa48("117782") ? false : (stryCov_9fa48("117782", "117783"), (stryMutAct_9fa48("117785") ? value === null && value === undefined : stryMutAct_9fa48("117784") ? false : (stryCov_9fa48("117784", "117785"), (stryMutAct_9fa48("117787") ? value !== null : stryMutAct_9fa48("117786") ? false : (stryCov_9fa48("117786", "117787"), value === null)) || (stryMutAct_9fa48("117789") ? value !== undefined : stryMutAct_9fa48("117788") ? false : (stryCov_9fa48("117788", "117789"), value === undefined)))) || (stryMutAct_9fa48("117791") ? pattern !== null : stryMutAct_9fa48("117790") ? false : (stryCov_9fa48("117790", "117791"), pattern === null)))) || (stryMutAct_9fa48("117793") ? pattern !== undefined : stryMutAct_9fa48("117792") ? false : (stryCov_9fa48("117792", "117793"), pattern === undefined)))) {
        if (stryMutAct_9fa48("117794")) {
          {}
        } else {
          stryCov_9fa48("117794");
          return stryMutAct_9fa48("117795") ? true : (stryCov_9fa48("117795"), false);
        }
      }
      const regex = this.buildLikeRegex(String(pattern));
      const matches = regex.test(String(value));
      return expr.negated ? stryMutAct_9fa48("117796") ? matches : (stryCov_9fa48("117796"), !matches) : matches;
    }
  }

  /**
   * Build regex for SQL LIKE semantics.
   * @param {string} pattern - SQL LIKE pattern.
   * @return {RegExp} Regex matcher.
   * @private
   */
  buildLikeRegex(pattern) {
    if (stryMutAct_9fa48("117797")) {
      {}
    } else {
      stryCov_9fa48("117797");
      const escaped = pattern.replace(stryMutAct_9fa48("117798") ? /[^.*+?^${}()|[\]\\]/g : (stryCov_9fa48("117798"), /[.*+?^${}()|[\]\\]/g), stryMutAct_9fa48("117799") ? "" : (stryCov_9fa48("117799"), '\\$&'));
      const regexPattern = escaped.replace(/%/g, stryMutAct_9fa48("117800") ? "" : (stryCov_9fa48("117800"), '.*')).replace(/_/g, stryMutAct_9fa48("117801") ? "" : (stryCov_9fa48("117801"), '.'));
      return new RegExp(stryMutAct_9fa48("117802") ? `` : (stryCov_9fa48("117802"), `^${regexPattern}$`));
    }
  }

  /**
   * Apply ORDER BY to rows.
   * @param {Array} rows - Input rows.
   * @param {Array} orderBy - ORDER BY clauses.
   * @return {Array} Sorted rows.
   * @private
   */
  applyOrderBy(rows, orderBy) {
    if (stryMutAct_9fa48("117803")) {
      {}
    } else {
      stryCov_9fa48("117803");
      return stryMutAct_9fa48("117804") ? [...rows] : (stryCov_9fa48("117804"), (stryMutAct_9fa48("117805") ? [] : (stryCov_9fa48("117805"), [...rows])).sort((a, b) => {
        if (stryMutAct_9fa48("117806")) {
          {}
        } else {
          stryCov_9fa48("117806");
          for (const clause of orderBy) {
            if (stryMutAct_9fa48("117807")) {
              {}
            } else {
              stryCov_9fa48("117807");
              const col = stryMutAct_9fa48("117810") ? clause.expression?.column && clause.column : stryMutAct_9fa48("117809") ? false : stryMutAct_9fa48("117808") ? true : (stryCov_9fa48("117808", "117809", "117810"), (stryMutAct_9fa48("117811") ? clause.expression.column : (stryCov_9fa48("117811"), clause.expression?.column)) || clause.column);
              const dir = (stryMutAct_9fa48("117814") ? clause.direction !== 'DESC' : stryMutAct_9fa48("117813") ? false : stryMutAct_9fa48("117812") ? true : (stryCov_9fa48("117812", "117813", "117814"), clause.direction === (stryMutAct_9fa48("117815") ? "" : (stryCov_9fa48("117815"), 'DESC')))) ? stryMutAct_9fa48("117816") ? +1 : (stryCov_9fa48("117816"), -1) : 1;
              const aVal = a[col];
              const bVal = b[col];
              if (stryMutAct_9fa48("117819") ? aVal !== bVal : stryMutAct_9fa48("117818") ? false : stryMutAct_9fa48("117817") ? true : (stryCov_9fa48("117817", "117818", "117819"), aVal === bVal)) continue;
              if (stryMutAct_9fa48("117822") ? aVal !== null : stryMutAct_9fa48("117821") ? false : stryMutAct_9fa48("117820") ? true : (stryCov_9fa48("117820", "117821", "117822"), aVal === null)) return dir;
              if (stryMutAct_9fa48("117825") ? bVal !== null : stryMutAct_9fa48("117824") ? false : stryMutAct_9fa48("117823") ? true : (stryCov_9fa48("117823", "117824", "117825"), bVal === null)) return stryMutAct_9fa48("117826") ? +dir : (stryCov_9fa48("117826"), -dir);
              if (stryMutAct_9fa48("117829") ? typeof aVal === QUERY_EXECUTOR_LITERAL.STRING_STRING || typeof bVal === QUERY_EXECUTOR_LITERAL.STRING_STRING : stryMutAct_9fa48("117828") ? false : stryMutAct_9fa48("117827") ? true : (stryCov_9fa48("117827", "117828", "117829"), (stryMutAct_9fa48("117831") ? typeof aVal !== QUERY_EXECUTOR_LITERAL.STRING_STRING : stryMutAct_9fa48("117830") ? true : (stryCov_9fa48("117830", "117831"), typeof aVal === QUERY_EXECUTOR_LITERAL.STRING_STRING)) && (stryMutAct_9fa48("117833") ? typeof bVal !== QUERY_EXECUTOR_LITERAL.STRING_STRING : stryMutAct_9fa48("117832") ? true : (stryCov_9fa48("117832", "117833"), typeof bVal === QUERY_EXECUTOR_LITERAL.STRING_STRING)))) {
                if (stryMutAct_9fa48("117834")) {
                  {}
                } else {
                  stryCov_9fa48("117834");
                  const cmp = aVal.localeCompare(bVal);
                  if (stryMutAct_9fa48("117837") ? cmp === NUM.ZERO : stryMutAct_9fa48("117836") ? false : stryMutAct_9fa48("117835") ? true : (stryCov_9fa48("117835", "117836", "117837"), cmp !== NUM.ZERO)) return stryMutAct_9fa48("117838") ? cmp / dir : (stryCov_9fa48("117838"), cmp * dir);
                }
              } else {
                if (stryMutAct_9fa48("117839")) {
                  {}
                } else {
                  stryCov_9fa48("117839");
                  if (stryMutAct_9fa48("117843") ? aVal >= bVal : stryMutAct_9fa48("117842") ? aVal <= bVal : stryMutAct_9fa48("117841") ? false : stryMutAct_9fa48("117840") ? true : (stryCov_9fa48("117840", "117841", "117842", "117843"), aVal < bVal)) return stryMutAct_9fa48("117844") ? +dir : (stryCov_9fa48("117844"), -dir);
                  if (stryMutAct_9fa48("117848") ? aVal <= bVal : stryMutAct_9fa48("117847") ? aVal >= bVal : stryMutAct_9fa48("117846") ? false : stryMutAct_9fa48("117845") ? true : (stryCov_9fa48("117845", "117846", "117847", "117848"), aVal > bVal)) return dir;
                }
              }
            }
          }
          return NUM.ZERO;
        }
      }));
    }
  }

  /**
   * Apply LIMIT and OFFSET to rows.
   * @param {Array} rows - Input rows.
   * @param {Object} limit - LIMIT clause.
   * @return {Array} Limited rows.
   * @private
   */
  applyLimit(rows, limit) {
    if (stryMutAct_9fa48("117849")) {
      {}
    } else {
      stryCov_9fa48("117849");
      const offset = Number.isInteger(limit.offset) ? stryMutAct_9fa48("117850") ? Math.min(limit.offset, NUM.ZERO) : (stryCov_9fa48("117850"), Math.max(limit.offset, NUM.ZERO)) : NUM.ZERO;
      if (stryMutAct_9fa48("117853") ? false : stryMutAct_9fa48("117852") ? true : stryMutAct_9fa48("117851") ? Number.isInteger(limit.count) : (stryCov_9fa48("117851", "117852", "117853"), !Number.isInteger(limit.count))) {
        if (stryMutAct_9fa48("117854")) {
          {}
        } else {
          stryCov_9fa48("117854");
          return stryMutAct_9fa48("117855") ? rows : (stryCov_9fa48("117855"), rows.slice(offset));
        }
      }
      const count = stryMutAct_9fa48("117856") ? Math.min(limit.count, NUM.ZERO) : (stryCov_9fa48("117856"), Math.max(limit.count, NUM.ZERO));
      return stryMutAct_9fa48("117857") ? rows : (stryCov_9fa48("117857"), rows.slice(offset, stryMutAct_9fa48("117858") ? offset - count : (stryCov_9fa48("117858"), offset + count)));
    }
  }

  /**
   * Build SQL string from SELECT AST.
   * @param {Object} ast - SELECT AST.
   * @return {string} SQL string.
   * @private
   */
  buildSelectSQL(ast) {
    if (stryMutAct_9fa48("117859")) {
      {}
    } else {
      stryCov_9fa48("117859");
      let sql = QUERY_EXECUTOR_LITERAL.STRING_SELECT;
      if (stryMutAct_9fa48("117861") ? false : stryMutAct_9fa48("117860") ? true : (stryCov_9fa48("117860", "117861"), ast.distinct)) {
        if (stryMutAct_9fa48("117862")) {
          {}
        } else {
          stryCov_9fa48("117862");
          stryMutAct_9fa48("117863") ? sql -= QUERY_EXECUTOR_LITERAL.STRING_DISTINCT : (stryCov_9fa48("117863"), sql += QUERY_EXECUTOR_LITERAL.STRING_DISTINCT);
        }
      }

      // Columns
      const cols = ast.columns.map(stryMutAct_9fa48("117864") ? () => undefined : (stryCov_9fa48("117864"), col => this.buildColumnSQL(col)));
      stryMutAct_9fa48("117865") ? sql -= cols.join(QUERY_EXECUTOR_LITERAL.STRING_VALUE_14) : (stryCov_9fa48("117865"), sql += cols.join(QUERY_EXECUTOR_LITERAL.STRING_VALUE_14));

      // FROM
      if (stryMutAct_9fa48("117867") ? false : stryMutAct_9fa48("117866") ? true : (stryCov_9fa48("117866", "117867"), ast.from.subquery)) {
        if (stryMutAct_9fa48("117868")) {
          {}
        } else {
          stryCov_9fa48("117868");
          sql += stryMutAct_9fa48("117869") ? `` : (stryCov_9fa48("117869"), ` FROM (${this.buildSelectSQL(ast.from.subquery)})`);
        }
      } else {
        if (stryMutAct_9fa48("117870")) {
          {}
        } else {
          stryCov_9fa48("117870");
          sql += stryMutAct_9fa48("117871") ? `` : (stryCov_9fa48("117871"), ` FROM ${ast.from.name}`);
        }
      }
      if (stryMutAct_9fa48("117873") ? false : stryMutAct_9fa48("117872") ? true : (stryCov_9fa48("117872", "117873"), ast.from.alias)) {
        if (stryMutAct_9fa48("117874")) {
          {}
        } else {
          stryCov_9fa48("117874");
          sql += stryMutAct_9fa48("117875") ? `` : (stryCov_9fa48("117875"), ` AS ${ast.from.alias}`);
        }
      }

      // JOINs
      for (const join of stryMutAct_9fa48("117878") ? ast.joins && [] : stryMutAct_9fa48("117877") ? false : stryMutAct_9fa48("117876") ? true : (stryCov_9fa48("117876", "117877", "117878"), ast.joins || (stryMutAct_9fa48("117879") ? ["Stryker was here"] : (stryCov_9fa48("117879"), [])))) {
        if (stryMutAct_9fa48("117880")) {
          {}
        } else {
          stryCov_9fa48("117880");
          if (stryMutAct_9fa48("117882") ? false : stryMutAct_9fa48("117881") ? true : (stryCov_9fa48("117881", "117882"), join.table.subquery)) {
            if (stryMutAct_9fa48("117883")) {
              {}
            } else {
              stryCov_9fa48("117883");
              stryMutAct_9fa48("117884") ? sql -= ` ${join.joinType} JOIN` + ` (${this.buildSelectSQL(join.table.subquery)})` : (stryCov_9fa48("117884"), sql += (stryMutAct_9fa48("117885") ? `` : (stryCov_9fa48("117885"), ` ${join.joinType} JOIN`)) + (stryMutAct_9fa48("117886") ? `` : (stryCov_9fa48("117886"), ` (${this.buildSelectSQL(join.table.subquery)})`)));
            }
          } else {
            if (stryMutAct_9fa48("117887")) {
              {}
            } else {
              stryCov_9fa48("117887");
              sql += stryMutAct_9fa48("117888") ? `` : (stryCov_9fa48("117888"), ` ${join.joinType} JOIN ${join.table.name}`);
            }
          }
          if (stryMutAct_9fa48("117890") ? false : stryMutAct_9fa48("117889") ? true : (stryCov_9fa48("117889", "117890"), join.table.alias)) {
            if (stryMutAct_9fa48("117891")) {
              {}
            } else {
              stryCov_9fa48("117891");
              sql += stryMutAct_9fa48("117892") ? `` : (stryCov_9fa48("117892"), ` AS ${join.table.alias}`);
            }
          }
          sql += stryMutAct_9fa48("117893") ? `` : (stryCov_9fa48("117893"), ` ON ${this.buildExpressionSQL(join.condition)}`);
        }
      }

      // WHERE
      if (stryMutAct_9fa48("117895") ? false : stryMutAct_9fa48("117894") ? true : (stryCov_9fa48("117894", "117895"), ast.where)) {
        if (stryMutAct_9fa48("117896")) {
          {}
        } else {
          stryCov_9fa48("117896");
          sql += stryMutAct_9fa48("117897") ? `` : (stryCov_9fa48("117897"), ` WHERE ${this.buildExpressionSQL(ast.where)}`);
        }
      }

      // GROUP BY
      if (stryMutAct_9fa48("117899") ? false : stryMutAct_9fa48("117898") ? true : (stryCov_9fa48("117898", "117899"), ast.groupBy)) {
        if (stryMutAct_9fa48("117900")) {
          {}
        } else {
          stryCov_9fa48("117900");
          const groups = ast.groupBy.map(stryMutAct_9fa48("117901") ? () => undefined : (stryCov_9fa48("117901"), g => this.buildExpressionSQL(g)));
          sql += stryMutAct_9fa48("117902") ? `` : (stryCov_9fa48("117902"), ` GROUP BY ${groups.join(QUERY_EXECUTOR_LITERAL.STRING_VALUE_14)}`);
        }
      }

      // HAVING
      if (stryMutAct_9fa48("117904") ? false : stryMutAct_9fa48("117903") ? true : (stryCov_9fa48("117903", "117904"), ast.having)) {
        if (stryMutAct_9fa48("117905")) {
          {}
        } else {
          stryCov_9fa48("117905");
          sql += stryMutAct_9fa48("117906") ? `` : (stryCov_9fa48("117906"), ` HAVING ${this.buildExpressionSQL(ast.having)}`);
        }
      }

      // ORDER BY
      if (stryMutAct_9fa48("117908") ? false : stryMutAct_9fa48("117907") ? true : (stryCov_9fa48("117907", "117908"), ast.orderBy)) {
        if (stryMutAct_9fa48("117909")) {
          {}
        } else {
          stryCov_9fa48("117909");
          const orders = ast.orderBy.map(stryMutAct_9fa48("117910") ? () => undefined : (stryCov_9fa48("117910"), o => stryMutAct_9fa48("117911") ? `` : (stryCov_9fa48("117911"), `${this.buildExpressionSQL(o.expression)} ${o.direction}`)));
          sql += stryMutAct_9fa48("117912") ? `` : (stryCov_9fa48("117912"), ` ORDER BY ${orders.join(QUERY_EXECUTOR_LITERAL.STRING_VALUE_14)}`);
        }
      }

      // LIMIT
      if (stryMutAct_9fa48("117914") ? false : stryMutAct_9fa48("117913") ? true : (stryCov_9fa48("117913", "117914"), ast.limit)) {
        if (stryMutAct_9fa48("117915")) {
          {}
        } else {
          stryCov_9fa48("117915");
          sql += stryMutAct_9fa48("117916") ? `` : (stryCov_9fa48("117916"), ` LIMIT ${ast.limit.count}`);
          if (stryMutAct_9fa48("117918") ? false : stryMutAct_9fa48("117917") ? true : (stryCov_9fa48("117917", "117918"), ast.limit.offset)) {
            if (stryMutAct_9fa48("117919")) {
              {}
            } else {
              stryCov_9fa48("117919");
              sql += stryMutAct_9fa48("117920") ? `` : (stryCov_9fa48("117920"), ` OFFSET ${ast.limit.offset}`);
            }
          }
        }
      }

      // Set operations (UNION, UNION ALL, INTERSECT, EXCEPT)
      if (stryMutAct_9fa48("117922") ? false : stryMutAct_9fa48("117921") ? true : (stryCov_9fa48("117921", "117922"), ast.setOperation)) {
        if (stryMutAct_9fa48("117923")) {
          {}
        } else {
          stryCov_9fa48("117923");
          stryMutAct_9fa48("117924") ? sql -= ` ${ast.setOperation.type}` + ` ${this.buildSelectSQL(ast.setOperation.right)}` : (stryCov_9fa48("117924"), sql += (stryMutAct_9fa48("117925") ? `` : (stryCov_9fa48("117925"), ` ${ast.setOperation.type}`)) + (stryMutAct_9fa48("117926") ? `` : (stryCov_9fa48("117926"), ` ${this.buildSelectSQL(ast.setOperation.right)}`)));
        }
      }

      // CTE prefix
      if (stryMutAct_9fa48("117929") ? ast.ctes || ast.ctes.length > NUM.ZERO : stryMutAct_9fa48("117928") ? false : stryMutAct_9fa48("117927") ? true : (stryCov_9fa48("117927", "117928", "117929"), ast.ctes && (stryMutAct_9fa48("117932") ? ast.ctes.length <= NUM.ZERO : stryMutAct_9fa48("117931") ? ast.ctes.length >= NUM.ZERO : stryMutAct_9fa48("117930") ? true : (stryCov_9fa48("117930", "117931", "117932"), ast.ctes.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("117933")) {
          {}
        } else {
          stryCov_9fa48("117933");
          const recursive = ast.recursive ? stryMutAct_9fa48("117934") ? "" : (stryCov_9fa48("117934"), 'RECURSIVE ') : stryMutAct_9fa48("117935") ? "Stryker was here!" : (stryCov_9fa48("117935"), '');
          const cteDefs = ast.ctes.map(stryMutAct_9fa48("117936") ? () => undefined : (stryCov_9fa48("117936"), c => stryMutAct_9fa48("117937") ? `` : (stryCov_9fa48("117937"), `${c.name} AS (${this.buildSelectSQL(c.query)})`)));
          sql = (stryMutAct_9fa48("117938") ? `` : (stryCov_9fa48("117938"), `WITH ${recursive}${cteDefs.join(QUERY_EXECUTOR_LITERAL.STRING_VALUE_14)} `)) + sql;
        }
      }
      return sql;
    }
  }

  /**
   * Build SQL for a column.
   * @param {Object} col - Column AST.
   * @return {string} Column SQL.
   * @private
   */
  buildColumnSQL(col) {
    if (stryMutAct_9fa48("117939")) {
      {}
    } else {
      stryCov_9fa48("117939");
      if (stryMutAct_9fa48("117942") ? col.type !== QUERY_EXECUTOR_LITERAL.STRING_STAR : stryMutAct_9fa48("117941") ? false : stryMutAct_9fa48("117940") ? true : (stryCov_9fa48("117940", "117941", "117942"), col.type === QUERY_EXECUTOR_LITERAL.STRING_STAR)) return QUERY_EXECUTOR_LITERAL.STRING_VALUE_3;
      let sql = this.buildExpressionSQL(stryMutAct_9fa48("117945") ? col.expression && col : stryMutAct_9fa48("117944") ? false : stryMutAct_9fa48("117943") ? true : (stryCov_9fa48("117943", "117944", "117945"), col.expression || col));
      if (stryMutAct_9fa48("117947") ? false : stryMutAct_9fa48("117946") ? true : (stryCov_9fa48("117946", "117947"), col.alias)) {
        if (stryMutAct_9fa48("117948")) {
          {}
        } else {
          stryCov_9fa48("117948");
          sql += stryMutAct_9fa48("117949") ? `` : (stryCov_9fa48("117949"), ` AS ${col.alias}`);
        }
      }
      return sql;
    }
  }

  /**
   * Build SQL for an expression.
   * @param {Object} expr - Expression AST.
   * @return {string} Expression SQL.
   * @private
   */
  buildExpressionSQL(expr) {
    if (stryMutAct_9fa48("117950")) {
      {}
    } else {
      stryCov_9fa48("117950");
      if (stryMutAct_9fa48("117953") ? false : stryMutAct_9fa48("117952") ? true : stryMutAct_9fa48("117951") ? expr : (stryCov_9fa48("117951", "117952", "117953"), !expr)) return QUERY_EXECUTOR_LITERAL.STRING_VALUE;
      switch (expr.type) {
        case QUERY_EXECUTOR_LITERAL.STRING_STAR:
          if (stryMutAct_9fa48("117954")) {} else {
            stryCov_9fa48("117954");
            return QUERY_EXECUTOR_LITERAL.STRING_VALUE_3;
          }
        case QUERY_EXECUTOR_LITERAL.STRING_LITERAL:
          if (stryMutAct_9fa48("117955")) {} else {
            stryCov_9fa48("117955");
            if (stryMutAct_9fa48("117958") ? expr.value !== null : stryMutAct_9fa48("117957") ? false : stryMutAct_9fa48("117956") ? true : (stryCov_9fa48("117956", "117957", "117958"), expr.value === null)) return QUERY_EXECUTOR_LITERAL.STRING_NULL;
            if (stryMutAct_9fa48("117961") ? typeof expr.value !== QUERY_EXECUTOR_LITERAL.STRING_STRING : stryMutAct_9fa48("117960") ? false : stryMutAct_9fa48("117959") ? true : (stryCov_9fa48("117959", "117960", "117961"), typeof expr.value === QUERY_EXECUTOR_LITERAL.STRING_STRING)) return stryMutAct_9fa48("117962") ? `` : (stryCov_9fa48("117962"), `'${expr.value}'`);
            return String(expr.value);
          }
        case QUERY_EXECUTOR_LITERAL.STRING_COLUMN_REF:
          if (stryMutAct_9fa48("117963")) {} else {
            stryCov_9fa48("117963");
            if (stryMutAct_9fa48("117965") ? false : stryMutAct_9fa48("117964") ? true : (stryCov_9fa48("117964", "117965"), expr.table)) return stryMutAct_9fa48("117966") ? `` : (stryCov_9fa48("117966"), `${expr.table}.${expr.column}`);
            return expr.column;
          }
        case QUERY_EXECUTOR_LITERAL.STRING_BINARY:
          if (stryMutAct_9fa48("117967")) {} else {
            stryCov_9fa48("117967");
            if (stryMutAct_9fa48("117970") ? expr.operator === QUERY_EXECUTOR_LITERAL.STRING_IS_NULL && expr.operator === QUERY_EXECUTOR_LITERAL.STRING_IS_NOT_NULL : stryMutAct_9fa48("117969") ? false : stryMutAct_9fa48("117968") ? true : (stryCov_9fa48("117968", "117969", "117970"), (stryMutAct_9fa48("117972") ? expr.operator !== QUERY_EXECUTOR_LITERAL.STRING_IS_NULL : stryMutAct_9fa48("117971") ? false : (stryCov_9fa48("117971", "117972"), expr.operator === QUERY_EXECUTOR_LITERAL.STRING_IS_NULL)) || (stryMutAct_9fa48("117974") ? expr.operator !== QUERY_EXECUTOR_LITERAL.STRING_IS_NOT_NULL : stryMutAct_9fa48("117973") ? false : (stryCov_9fa48("117973", "117974"), expr.operator === QUERY_EXECUTOR_LITERAL.STRING_IS_NOT_NULL)))) {
              if (stryMutAct_9fa48("117975")) {
                {}
              } else {
                stryCov_9fa48("117975");
                return stryMutAct_9fa48("117976") ? `` : (stryCov_9fa48("117976"), `(${this.buildExpressionSQL(expr.left)} ${expr.operator})`);
              }
            }
            return (stryMutAct_9fa48("117977") ? `` : (stryCov_9fa48("117977"), `(${this.buildExpressionSQL(expr.left)} `)) + (stryMutAct_9fa48("117978") ? `` : (stryCov_9fa48("117978"), `${expr.operator} ${this.buildExpressionSQL(expr.right)})`));
          }
        case QUERY_EXECUTOR_LITERAL.STRING_UNARY:
          if (stryMutAct_9fa48("117979")) {} else {
            stryCov_9fa48("117979");
            return stryMutAct_9fa48("117980") ? `` : (stryCov_9fa48("117980"), `${expr.operator} ${this.buildExpressionSQL(expr.operand)}`);
          }
        case QUERY_EXECUTOR_LITERAL.STRING_AGGREGATE:
          if (stryMutAct_9fa48("117981")) {} else {
            stryCov_9fa48("117981");
            {
              if (stryMutAct_9fa48("117982")) {
                {}
              } else {
                stryCov_9fa48("117982");
                const aggArg = this.buildExpressionSQL(expr.argument);
                const aggDistinct = expr.distinct ? stryMutAct_9fa48("117983") ? "" : (stryCov_9fa48("117983"), 'DISTINCT ') : stryMutAct_9fa48("117984") ? "Stryker was here!" : (stryCov_9fa48("117984"), '');
                return stryMutAct_9fa48("117985") ? `` : (stryCov_9fa48("117985"), `${expr.function}(${aggDistinct}${aggArg})`);
              }
            }
          }
        case QUERY_EXECUTOR_LITERAL.STRING_IN:
          if (stryMutAct_9fa48("117986")) {} else {
            stryCov_9fa48("117986");
            {
              if (stryMutAct_9fa48("117987")) {
                {}
              } else {
                stryCov_9fa48("117987");
                const inVals = expr.values.map(stryMutAct_9fa48("117988") ? () => undefined : (stryCov_9fa48("117988"), v => this.buildExpressionSQL(v)));
                const operator = expr.negated ? stryMutAct_9fa48("117989") ? "" : (stryCov_9fa48("117989"), 'NOT IN') : stryMutAct_9fa48("117990") ? "" : (stryCov_9fa48("117990"), 'IN');
                return stryMutAct_9fa48("117991") ? `` : (stryCov_9fa48("117991"), `${this.buildExpressionSQL(expr.expression)} ${operator} (${inVals.join(QUERY_EXECUTOR_LITERAL.STRING_VALUE_14)})`);
              }
            }
          }
        case QUERY_EXECUTOR_LITERAL.STRING_BETWEEN:
          if (stryMutAct_9fa48("117992")) {} else {
            stryCov_9fa48("117992");
            return (stryMutAct_9fa48("117993") ? `` : (stryCov_9fa48("117993"), `${this.buildExpressionSQL(expr.expression)} BETWEEN `)) + (stryMutAct_9fa48("117994") ? `` : (stryCov_9fa48("117994"), `${this.buildExpressionSQL(expr.low)} AND `)) + (stryMutAct_9fa48("117995") ? `` : (stryCov_9fa48("117995"), `${this.buildExpressionSQL(expr.high)}`));
          }
        case QUERY_EXECUTOR_LITERAL.STRING_LIKE:
          if (stryMutAct_9fa48("117996")) {} else {
            stryCov_9fa48("117996");
            return (stryMutAct_9fa48("117997") ? `` : (stryCov_9fa48("117997"), `${this.buildExpressionSQL(expr.expression)} ${expr.negated ? QUERY_EXECUTOR_LITERAL.STRING_NOT_LIKE : QUERY_EXECUTOR_LITERAL.STRING_LIKE_2} `)) + (stryMutAct_9fa48("117998") ? `` : (stryCov_9fa48("117998"), `${this.buildExpressionSQL(expr.pattern)}`));
          }
        case QUERY_EXECUTOR_LITERAL.STRING_PARAMETER:
          if (stryMutAct_9fa48("117999")) {} else {
            stryCov_9fa48("117999");
            return QUERY_EXECUTOR_LITERAL.STRING_VALUE_4;
          }
        case PG_EXPR_TYPE.CAST:
          if (stryMutAct_9fa48("118000")) {} else {
            stryCov_9fa48("118000");
            return stryMutAct_9fa48("118001") ? `` : (stryCov_9fa48("118001"), `CAST(${this.buildExpressionSQL(expr.expression)} AS ${expr.affinity})`);
          }
        case PG_EXPR_TYPE.CASE:
          if (stryMutAct_9fa48("118002")) {} else {
            stryCov_9fa48("118002");
            return this.buildCaseSQL(expr);
          }
        case PG_EXPR_TYPE.SUBQUERY:
          if (stryMutAct_9fa48("118003")) {} else {
            stryCov_9fa48("118003");
            return stryMutAct_9fa48("118004") ? `` : (stryCov_9fa48("118004"), `(${this.buildSelectSQL(expr.query)})`);
          }
        case PG_EXPR_TYPE.EXISTS:
          if (stryMutAct_9fa48("118005")) {} else {
            stryCov_9fa48("118005");
            return stryMutAct_9fa48("118006") ? `` : (stryCov_9fa48("118006"), `EXISTS (${this.buildSelectSQL(expr.query)})`);
          }
        case PG_EXPR_TYPE.FUNCTION_CALL:
          if (stryMutAct_9fa48("118007")) {} else {
            stryCov_9fa48("118007");
            {
              if (stryMutAct_9fa48("118008")) {
                {}
              } else {
                stryCov_9fa48("118008");
                const fnArgs = expr.args.map(stryMutAct_9fa48("118009") ? () => undefined : (stryCov_9fa48("118009"), a => this.buildExpressionSQL(a)));
                return stryMutAct_9fa48("118010") ? `` : (stryCov_9fa48("118010"), `${expr.name}(${fnArgs.join(QUERY_EXECUTOR_LITERAL.STRING_VALUE_14)})`);
              }
            }
          }
        default:
          if (stryMutAct_9fa48("118011")) {} else {
            stryCov_9fa48("118011");
            return QUERY_EXECUTOR_LITERAL.STRING_VALUE;
          }
      }
    }
  }

  /**
   * Build SQL for a CASE WHEN expression.
   * Handles both searched CASE (CASE WHEN ...) and simple CASE (CASE expr WHEN ...).
   * @param {Object} expr - CASE AST node.
   * @return {string} Reconstructed CASE SQL.
   */
  buildCaseSQL(expr) {
    if (stryMutAct_9fa48("118012")) {
      {}
    } else {
      stryCov_9fa48("118012");
      let sql = QUERY_EXECUTOR_LITERAL.STRING_CASE;
      if (stryMutAct_9fa48("118014") ? false : stryMutAct_9fa48("118013") ? true : (stryCov_9fa48("118013", "118014"), expr.operand)) {
        if (stryMutAct_9fa48("118015")) {
          {}
        } else {
          stryCov_9fa48("118015");
          stryMutAct_9fa48("118016") ? sql -= QUERY_EXECUTOR_LITERAL.STRING_VALUE_15 + this.buildExpressionSQL(expr.operand) : (stryCov_9fa48("118016"), sql += stryMutAct_9fa48("118017") ? QUERY_EXECUTOR_LITERAL.STRING_VALUE_15 - this.buildExpressionSQL(expr.operand) : (stryCov_9fa48("118017"), QUERY_EXECUTOR_LITERAL.STRING_VALUE_15 + this.buildExpressionSQL(expr.operand)));
        }
      }
      for (const cond of expr.conditions) {
        if (stryMutAct_9fa48("118018")) {
          {}
        } else {
          stryCov_9fa48("118018");
          stryMutAct_9fa48("118019") ? sql -= QUERY_EXECUTOR_LITERAL.STRING_WHEN + this.buildExpressionSQL(cond.when) : (stryCov_9fa48("118019"), sql += stryMutAct_9fa48("118020") ? QUERY_EXECUTOR_LITERAL.STRING_WHEN - this.buildExpressionSQL(cond.when) : (stryCov_9fa48("118020"), QUERY_EXECUTOR_LITERAL.STRING_WHEN + this.buildExpressionSQL(cond.when)));
          stryMutAct_9fa48("118021") ? sql -= QUERY_EXECUTOR_LITERAL.STRING_THEN + this.buildExpressionSQL(cond.then) : (stryCov_9fa48("118021"), sql += stryMutAct_9fa48("118022") ? QUERY_EXECUTOR_LITERAL.STRING_THEN - this.buildExpressionSQL(cond.then) : (stryCov_9fa48("118022"), QUERY_EXECUTOR_LITERAL.STRING_THEN + this.buildExpressionSQL(cond.then)));
        }
      }
      if (stryMutAct_9fa48("118024") ? false : stryMutAct_9fa48("118023") ? true : (stryCov_9fa48("118023", "118024"), expr.elseExpr)) {
        if (stryMutAct_9fa48("118025")) {
          {}
        } else {
          stryCov_9fa48("118025");
          stryMutAct_9fa48("118026") ? sql -= QUERY_EXECUTOR_LITERAL.STRING_ELSE + this.buildExpressionSQL(expr.elseExpr) : (stryCov_9fa48("118026"), sql += stryMutAct_9fa48("118027") ? QUERY_EXECUTOR_LITERAL.STRING_ELSE - this.buildExpressionSQL(expr.elseExpr) : (stryCov_9fa48("118027"), QUERY_EXECUTOR_LITERAL.STRING_ELSE + this.buildExpressionSQL(expr.elseExpr)));
        }
      }
      stryMutAct_9fa48("118028") ? sql -= QUERY_EXECUTOR_LITERAL.STRING_END : (stryCov_9fa48("118028"), sql += QUERY_EXECUTOR_LITERAL.STRING_END);
      return sql;
    }
  }

  /**
   * Execute an INSERT statement.
   * Routes ALL queries through message router - no local vs remote distinction.
   * @param {Object} ast - Parsed INSERT AST.
   * @param {string} partitionId - Target partition ID.
   * @param {Array} params - Query parameters.
   * @return {Promise<Object>} Insert result.
   */
  async executeInsert(ast, partitionId, params = stryMutAct_9fa48("118029") ? ["Stryker was here"] : (stryCov_9fa48("118029"), []), executionOptions = {}) {
    if (stryMutAct_9fa48("118030")) {
      {}
    } else {
      stryCov_9fa48("118030");
      const sql = this.buildInsertSQL(ast);
      this.logger.debug(QUERY_EXECUTOR_LITERAL.STRING_EXECUTING_INSERT, stryMutAct_9fa48("118031") ? {} : (stryCov_9fa48("118031"), {
        table: ast.table,
        partitionId,
        rowCount: ast.values.length
      }));

      // Route through message router like all other operations
      const result = await this.executeOnPartition(partitionId, sql, params, stryMutAct_9fa48("118032") ? true : (stryCov_9fa48("118032"), false), stryMutAct_9fa48("118033") ? true : (stryCov_9fa48("118033"), false), stryMutAct_9fa48("118034") ? true : (stryCov_9fa48("118034"), false), executionOptions);
      if (stryMutAct_9fa48("118037") ? false : stryMutAct_9fa48("118036") ? true : stryMutAct_9fa48("118035") ? result.success : (stryCov_9fa48("118035", "118036", "118037"), !result.success)) {
        if (stryMutAct_9fa48("118038")) {
          {}
        } else {
          stryCov_9fa48("118038");
          throw new Error(stryMutAct_9fa48("118041") ? result.error && `Insert failed on partition: ${partitionId}` : stryMutAct_9fa48("118040") ? false : stryMutAct_9fa48("118039") ? true : (stryCov_9fa48("118039", "118040", "118041"), result.error || (stryMutAct_9fa48("118042") ? `` : (stryCov_9fa48("118042"), `Insert failed on partition: ${partitionId}`))));
        }
      }
      return stryMutAct_9fa48("118043") ? {} : (stryCov_9fa48("118043"), {
        success: stryMutAct_9fa48("118044") ? false : (stryCov_9fa48("118044"), true),
        operation: QUERY_EXECUTOR_LITERAL.STRING_INSERT,
        affectedRows: (stryMutAct_9fa48("118047") ? typeof result?.changes !== QUERY_EXECUTOR_LITERAL.STRING_NUMBER : stryMutAct_9fa48("118046") ? false : stryMutAct_9fa48("118045") ? true : (stryCov_9fa48("118045", "118046", "118047"), typeof (stryMutAct_9fa48("118048") ? result.changes : (stryCov_9fa48("118048"), result?.changes)) === QUERY_EXECUTOR_LITERAL.STRING_NUMBER)) ? result.changes : ast.values.length,
        rows: Array.isArray(result.rows) ? result.rows : stryMutAct_9fa48("118049") ? ["Stryker was here"] : (stryCov_9fa48("118049"), []),
        partitions: stryMutAct_9fa48("118050") ? [] : (stryCov_9fa48("118050"), [partitionId])
      });
    }
  }

  /**
   * Append RETURNING clause to a SQL string when present in the AST.
   * @param {string} sql - SQL string to append to.
   * @param {string[]|string|null} returning - RETURNING clause info.
   * @return {string} SQL string with RETURNING appended if applicable.
   * @private
   */
  appendReturning(sql, returning) {
    if (stryMutAct_9fa48("118051")) {
      {}
    } else {
      stryCov_9fa48("118051");
      if (stryMutAct_9fa48("118054") ? false : stryMutAct_9fa48("118053") ? true : stryMutAct_9fa48("118052") ? returning : (stryCov_9fa48("118052", "118053", "118054"), !returning)) {
        if (stryMutAct_9fa48("118055")) {
          {}
        } else {
          stryCov_9fa48("118055");
          return sql;
        }
      }
      const cols = (stryMutAct_9fa48("118058") ? returning !== '*' : stryMutAct_9fa48("118057") ? false : stryMutAct_9fa48("118056") ? true : (stryCov_9fa48("118056", "118057", "118058"), returning === (stryMutAct_9fa48("118059") ? "" : (stryCov_9fa48("118059"), '*')))) ? stryMutAct_9fa48("118060") ? "" : (stryCov_9fa48("118060"), '*') : returning.join(stryMutAct_9fa48("118061") ? "" : (stryCov_9fa48("118061"), ', '));
      return stryMutAct_9fa48("118062") ? `` : (stryCov_9fa48("118062"), `${sql} ${SQL.RETURNING} ${cols}`);
    }
  }

  /**
   * Build SQL for INSERT statement.
   * @param {Object} ast - INSERT AST.
   * @return {string} SQL string.
   * @private
   */
  buildInsertSQL(ast) {
    if (stryMutAct_9fa48("118063")) {
      {}
    } else {
      stryCov_9fa48("118063");
      let sql;
      if (stryMutAct_9fa48("118065") ? false : stryMutAct_9fa48("118064") ? true : (stryCov_9fa48("118064", "118065"), ast.orReplace)) {
        if (stryMutAct_9fa48("118066")) {
          {}
        } else {
          stryCov_9fa48("118066");
          sql = stryMutAct_9fa48("118067") ? `` : (stryCov_9fa48("118067"), `${SQL.INSERT_OR_REPLACE_INTO} `);
        }
      } else if (stryMutAct_9fa48("118069") ? false : stryMutAct_9fa48("118068") ? true : (stryCov_9fa48("118068", "118069"), ast.orIgnore)) {
        if (stryMutAct_9fa48("118070")) {
          {}
        } else {
          stryCov_9fa48("118070");
          sql = stryMutAct_9fa48("118071") ? `` : (stryCov_9fa48("118071"), `${SQL.INSERT_OR_IGNORE_INTO} `);
        }
      } else {
        if (stryMutAct_9fa48("118072")) {
          {}
        } else {
          stryCov_9fa48("118072");
          sql = stryMutAct_9fa48("118073") ? `` : (stryCov_9fa48("118073"), `${SQL.INSERT_INTO} `);
        }
      }
      stryMutAct_9fa48("118074") ? sql -= ast.table : (stryCov_9fa48("118074"), sql += ast.table);
      if (stryMutAct_9fa48("118076") ? false : stryMutAct_9fa48("118075") ? true : (stryCov_9fa48("118075", "118076"), ast.columns)) {
        if (stryMutAct_9fa48("118077")) {
          {}
        } else {
          stryCov_9fa48("118077");
          sql += stryMutAct_9fa48("118078") ? `` : (stryCov_9fa48("118078"), ` (${ast.columns.join(QUERY_EXECUTOR_LITERAL.STRING_VALUE_14)})`);
        }
      }
      sql += stryMutAct_9fa48("118079") ? `` : (stryCov_9fa48("118079"), ` ${SQL.VALUES} `);
      const rows = ast.values.map(row => {
        if (stryMutAct_9fa48("118080")) {
          {}
        } else {
          stryCov_9fa48("118080");
          const vals = row.map(stryMutAct_9fa48("118081") ? () => undefined : (stryCov_9fa48("118081"), v => this.buildExpressionSQL(v)));
          return stryMutAct_9fa48("118082") ? `` : (stryCov_9fa48("118082"), `(${vals.join(stryMutAct_9fa48("118083") ? "" : (stryCov_9fa48("118083"), ', '))})`);
        }
      });
      stryMutAct_9fa48("118084") ? sql -= rows.join(QUERY_EXECUTOR_LITERAL.STRING_VALUE_14) : (stryCov_9fa48("118084"), sql += rows.join(QUERY_EXECUTOR_LITERAL.STRING_VALUE_14));
      return this.appendReturning(sql, ast.returning);
    }
  }

  /**
   * Execute an UPDATE statement.
   * @param {Object} ast - Parsed UPDATE AST.
   * @param {Array} partitionIds - Target partition IDs.
   * @param {Array} params - Query parameters.
   * @return {Promise<Object>} Update result.
   */
  async executeUpdate(ast, partitionIds, params = stryMutAct_9fa48("118085") ? ["Stryker was here"] : (stryCov_9fa48("118085"), []), executionOptions = {}) {
    if (stryMutAct_9fa48("118086")) {
      {}
    } else {
      stryCov_9fa48("118086");
      const sql = this.buildUpdateSQL(ast);
      this.logger.debug(QUERY_EXECUTOR_LITERAL.STRING_EXECUTING_UPDATE, stryMutAct_9fa48("118087") ? {} : (stryCov_9fa48("118087"), {
        table: ast.table,
        partitionCount: partitionIds.length
      }));
      const results = await this.executeOnPartitions(partitionIds, sql, params, this.hlcClock.now(), stryMutAct_9fa48("118088") ? true : (stryCov_9fa48("118088"), false), stryMutAct_9fa48("118089") ? true : (stryCov_9fa48("118089"), false), stryMutAct_9fa48("118090") ? true : (stryCov_9fa48("118090"), false), stryMutAct_9fa48("118091") ? {} : (stryCov_9fa48("118091"), {
        ...executionOptions,
        tableName: ast.table
      }));
      const fanoutMetrics = this.getLastCoordinatorMetrics();
      const failedResults = stryMutAct_9fa48("118092") ? results : (stryCov_9fa48("118092"), results.filter(stryMutAct_9fa48("118093") ? () => undefined : (stryCov_9fa48("118093"), result => stryMutAct_9fa48("118094") ? result.success : (stryCov_9fa48("118094"), !result.success))));
      const totalChanges = results.reduce(stryMutAct_9fa48("118095") ? () => undefined : (stryCov_9fa48("118095"), (sum, result) => stryMutAct_9fa48("118096") ? sum - (result.success ? result.changes || 0 : 0) : (stryCov_9fa48("118096"), sum + (result.success ? stryMutAct_9fa48("118099") ? result.changes && 0 : stryMutAct_9fa48("118098") ? false : stryMutAct_9fa48("118097") ? true : (stryCov_9fa48("118097", "118098", "118099"), result.changes || 0) : 0))), 0);
      const returningRows = stryMutAct_9fa48("118100") ? ["Stryker was here"] : (stryCov_9fa48("118100"), []);
      for (const result of results) {
        if (stryMutAct_9fa48("118101")) {
          {}
        } else {
          stryCov_9fa48("118101");
          if (stryMutAct_9fa48("118104") ? result.success && Array.isArray(result.rows) || result.rows.length > NUM.ZERO : stryMutAct_9fa48("118103") ? false : stryMutAct_9fa48("118102") ? true : (stryCov_9fa48("118102", "118103", "118104"), (stryMutAct_9fa48("118106") ? result.success || Array.isArray(result.rows) : stryMutAct_9fa48("118105") ? true : (stryCov_9fa48("118105", "118106"), result.success && Array.isArray(result.rows))) && (stryMutAct_9fa48("118109") ? result.rows.length <= NUM.ZERO : stryMutAct_9fa48("118108") ? result.rows.length >= NUM.ZERO : stryMutAct_9fa48("118107") ? true : (stryCov_9fa48("118107", "118108", "118109"), result.rows.length > NUM.ZERO)))) {
            if (stryMutAct_9fa48("118110")) {
              {}
            } else {
              stryCov_9fa48("118110");
              returningRows.push(...result.rows);
            }
          }
        }
      }
      if (stryMutAct_9fa48("118114") ? failedResults.length <= NUM.ZERO : stryMutAct_9fa48("118113") ? failedResults.length >= NUM.ZERO : stryMutAct_9fa48("118112") ? false : stryMutAct_9fa48("118111") ? true : (stryCov_9fa48("118111", "118112", "118113", "118114"), failedResults.length > NUM.ZERO)) {
        if (stryMutAct_9fa48("118115")) {
          {}
        } else {
          stryCov_9fa48("118115");
          const failureSummary = buildDistributedFailureSummary(failedResults);
          return stryMutAct_9fa48("118116") ? {} : (stryCov_9fa48("118116"), {
            success: stryMutAct_9fa48("118117") ? true : (stryCov_9fa48("118117"), false),
            operation: QUERY_AST_TYPE.UPDATE,
            affectedRows: totalChanges,
            partitions: partitionIds,
            ...failureSummary,
            errorCode: QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
            error: QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE,
            rows: returningRows,
            distributedMetrics: stryMutAct_9fa48("118118") ? {} : (stryCov_9fa48("118118"), {
              fanout: fanoutMetrics,
              failedPartitionCount: failedResults.length
            })
          });
        }
      }
      return stryMutAct_9fa48("118119") ? {} : (stryCov_9fa48("118119"), {
        success: stryMutAct_9fa48("118120") ? false : (stryCov_9fa48("118120"), true),
        operation: QUERY_AST_TYPE.UPDATE,
        affectedRows: totalChanges,
        partitions: partitionIds,
        rows: returningRows,
        distributedMetrics: stryMutAct_9fa48("118121") ? {} : (stryCov_9fa48("118121"), {
          fanout: fanoutMetrics,
          failedPartitionCount: NUM.ZERO
        })
      });
    }
  }

  /**
   * Build SQL for UPDATE statement.
   * @param {Object} ast - UPDATE AST.
   * @return {string} SQL string.
   * @private
   */
  buildUpdateSQL(ast) {
    if (stryMutAct_9fa48("118122")) {
      {}
    } else {
      stryCov_9fa48("118122");
      let sql = stryMutAct_9fa48("118123") ? `` : (stryCov_9fa48("118123"), `UPDATE ${ast.table} SET `);
      const sets = ast.assignments.map(stryMutAct_9fa48("118124") ? () => undefined : (stryCov_9fa48("118124"), a => stryMutAct_9fa48("118125") ? `` : (stryCov_9fa48("118125"), `${a.column} = ${this.buildExpressionSQL(a.value)}`)));
      stryMutAct_9fa48("118126") ? sql -= sets.join(QUERY_EXECUTOR_LITERAL.STRING_VALUE_14) : (stryCov_9fa48("118126"), sql += sets.join(QUERY_EXECUTOR_LITERAL.STRING_VALUE_14));
      if (stryMutAct_9fa48("118128") ? false : stryMutAct_9fa48("118127") ? true : (stryCov_9fa48("118127", "118128"), ast.where)) {
        if (stryMutAct_9fa48("118129")) {
          {}
        } else {
          stryCov_9fa48("118129");
          sql += stryMutAct_9fa48("118130") ? `` : (stryCov_9fa48("118130"), ` WHERE ${this.buildExpressionSQL(ast.where)}`);
        }
      }
      return this.appendReturning(sql, ast.returning);
    }
  }

  /**
   * Execute a DELETE statement.
   * @param {Object} ast - Parsed DELETE AST.
   * @param {Array} partitionIds - Target partition IDs.
   * @param {Array} params - Query parameters.
   * @return {Promise<Object>} Delete result.
   */
  async executeDelete(ast, partitionIds, params = stryMutAct_9fa48("118131") ? ["Stryker was here"] : (stryCov_9fa48("118131"), []), executionOptions = {}) {
    if (stryMutAct_9fa48("118132")) {
      {}
    } else {
      stryCov_9fa48("118132");
      const sql = this.buildDeleteSQL(ast);
      this.logger.debug(QUERY_EXECUTOR_LITERAL.STRING_EXECUTING_DELETE, stryMutAct_9fa48("118133") ? {} : (stryCov_9fa48("118133"), {
        table: ast.table,
        partitionCount: partitionIds.length
      }));
      const results = await this.executeOnPartitions(partitionIds, sql, params, this.hlcClock.now(), stryMutAct_9fa48("118134") ? true : (stryCov_9fa48("118134"), false), stryMutAct_9fa48("118135") ? true : (stryCov_9fa48("118135"), false), stryMutAct_9fa48("118136") ? true : (stryCov_9fa48("118136"), false), stryMutAct_9fa48("118137") ? {} : (stryCov_9fa48("118137"), {
        ...executionOptions,
        tableName: ast.table
      }));
      const fanoutMetrics = this.getLastCoordinatorMetrics();
      const failedResults = stryMutAct_9fa48("118138") ? results : (stryCov_9fa48("118138"), results.filter(stryMutAct_9fa48("118139") ? () => undefined : (stryCov_9fa48("118139"), result => stryMutAct_9fa48("118140") ? result.success : (stryCov_9fa48("118140"), !result.success))));
      const totalChanges = results.reduce(stryMutAct_9fa48("118141") ? () => undefined : (stryCov_9fa48("118141"), (sum, result) => stryMutAct_9fa48("118142") ? sum - (result.success ? result.changes || 0 : 0) : (stryCov_9fa48("118142"), sum + (result.success ? stryMutAct_9fa48("118145") ? result.changes && 0 : stryMutAct_9fa48("118144") ? false : stryMutAct_9fa48("118143") ? true : (stryCov_9fa48("118143", "118144", "118145"), result.changes || 0) : 0))), 0);
      const returningRows = stryMutAct_9fa48("118146") ? ["Stryker was here"] : (stryCov_9fa48("118146"), []);
      for (const result of results) {
        if (stryMutAct_9fa48("118147")) {
          {}
        } else {
          stryCov_9fa48("118147");
          if (stryMutAct_9fa48("118150") ? result.success && Array.isArray(result.rows) || result.rows.length > NUM.ZERO : stryMutAct_9fa48("118149") ? false : stryMutAct_9fa48("118148") ? true : (stryCov_9fa48("118148", "118149", "118150"), (stryMutAct_9fa48("118152") ? result.success || Array.isArray(result.rows) : stryMutAct_9fa48("118151") ? true : (stryCov_9fa48("118151", "118152"), result.success && Array.isArray(result.rows))) && (stryMutAct_9fa48("118155") ? result.rows.length <= NUM.ZERO : stryMutAct_9fa48("118154") ? result.rows.length >= NUM.ZERO : stryMutAct_9fa48("118153") ? true : (stryCov_9fa48("118153", "118154", "118155"), result.rows.length > NUM.ZERO)))) {
            if (stryMutAct_9fa48("118156")) {
              {}
            } else {
              stryCov_9fa48("118156");
              returningRows.push(...result.rows);
            }
          }
        }
      }
      if (stryMutAct_9fa48("118160") ? failedResults.length <= NUM.ZERO : stryMutAct_9fa48("118159") ? failedResults.length >= NUM.ZERO : stryMutAct_9fa48("118158") ? false : stryMutAct_9fa48("118157") ? true : (stryCov_9fa48("118157", "118158", "118159", "118160"), failedResults.length > NUM.ZERO)) {
        if (stryMutAct_9fa48("118161")) {
          {}
        } else {
          stryCov_9fa48("118161");
          const failureSummary = buildDistributedFailureSummary(failedResults);
          return stryMutAct_9fa48("118162") ? {} : (stryCov_9fa48("118162"), {
            success: stryMutAct_9fa48("118163") ? true : (stryCov_9fa48("118163"), false),
            operation: QUERY_AST_TYPE.DELETE,
            affectedRows: totalChanges,
            partitions: partitionIds,
            ...failureSummary,
            errorCode: QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
            error: QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE,
            rows: returningRows,
            distributedMetrics: stryMutAct_9fa48("118164") ? {} : (stryCov_9fa48("118164"), {
              fanout: fanoutMetrics,
              failedPartitionCount: failedResults.length
            })
          });
        }
      }
      return stryMutAct_9fa48("118165") ? {} : (stryCov_9fa48("118165"), {
        success: stryMutAct_9fa48("118166") ? false : (stryCov_9fa48("118166"), true),
        operation: QUERY_AST_TYPE.DELETE,
        affectedRows: totalChanges,
        partitions: partitionIds,
        rows: returningRows,
        distributedMetrics: stryMutAct_9fa48("118167") ? {} : (stryCov_9fa48("118167"), {
          fanout: fanoutMetrics,
          failedPartitionCount: NUM.ZERO
        })
      });
    }
  }

  /**
   * Build SQL for DELETE statement.
   * @param {Object} ast - DELETE AST.
   * @return {string} SQL string.
   * @private
   */
  buildDeleteSQL(ast) {
    if (stryMutAct_9fa48("118168")) {
      {}
    } else {
      stryCov_9fa48("118168");
      let sql = stryMutAct_9fa48("118169") ? `` : (stryCov_9fa48("118169"), `DELETE FROM ${ast.table}`);
      if (stryMutAct_9fa48("118171") ? false : stryMutAct_9fa48("118170") ? true : (stryCov_9fa48("118170", "118171"), ast.where)) {
        if (stryMutAct_9fa48("118172")) {
          {}
        } else {
          stryCov_9fa48("118172");
          sql += stryMutAct_9fa48("118173") ? `` : (stryCov_9fa48("118173"), ` WHERE ${this.buildExpressionSQL(ast.where)}`);
        }
      }
      return this.appendReturning(sql, ast.returning);
    }
  }
}
export { QueryExecutor };