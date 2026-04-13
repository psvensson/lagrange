import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from './control-plane-readiness-constants.js';
import {
  buildPressureAdmissionFailure,
  PRESSURE_GOVERNOR_ACTION,
  PRESSURE_WORK_CLASS,
  PressureGovernor,
} from './pressure-governor.js';
import {ControlPlaneDiagnosticsLedger} from
  './control-plane-diagnostics-ledger.js';
import {
  buildControlPlaneQueryOptions,
  getRemainingBudgetMs,
} from './timeout-budget.js';
import {
  CDC_OPERATION,
  METRICS_LOG_TAG,
  NUM,
  SQL,
  TYPEOF,
} from '../constants/index.js';
import {
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
} from '../bootstrap/system-table-schemas-constants.js';
import {getSystemCachePrimaryKeyFieldOrFallback} from
  '../cache/system-cache-key-descriptor.js';
import {canonicalizeSystemTableRow} from './system-row-normalizers.js';
const CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL = Object.freeze({
  ACTIVE: "active",
  ALLOWCOALESCING: "allowCoalescing",
  ALLOWPENDINGVISIBILITY: "allowPendingVisibility",
  ALLOWPRESSUREDEFER: "allowPressureDefer",
  ALLOWPRESSUREDEGRADE: "allowPressureDegrade",
  ALLOWSQLFALLBACK: "allowSqlFallback",
  CANCELLATIONTOKEN: "cancellationToken",
  COALESCINGKEY: "coalescingKey",
  CONTROL_DASH_PLANE_COLON_READ: "control-plane:read",
  CONTROL_DASH_PLANE_DASH_MUTATION: "control-plane-mutation",
  CONTROL_DASH_PLANE_DASH_QUERY: "control-plane-query",
  CONTROL_DASH_PLANE_DASH_READ: "control-plane-read",
  CONTROL_PLANE_MUTATION_TRACKING_SATURATED: "control_plane_mutation_tracking_saturated",
  CRITICAL: "critical",
  DELETE: "delete",
  DELIVERYPRIORITY: "deliveryPriority",
  EXPECTEDCACHEFIELDS: "expectedCacheFields",
  FALLBACKPHASE: "fallbackPhase",
  IGNOREEXISTING: "ignoreExisting",
  INSERT: "insert",
  LOCAL_PARTITION_REPLICA: "local_partition_replica",
  MAXOBSERVEDMUTATIONLATENCYMS: "maxObservedMutationLatencyMs",
  MAXOBSERVEDREADLATENCYMS: "maxObservedReadLatencyMs",
  MERGEPOLICY: "mergePolicy",
  MINIMUMCACHEFIELDS: "minimumCacheFields",
  MUTATION: "mutation",
  MUTATIONOUTCOMECOUNTS: "mutationOutcomeCounts",
  MUTATIONREPLACEPENDINGQUEUEDCOUNT: "mutationReplacePendingQueuedCount",
  MUTATIONREPLACEPENDINGSUPERSEDEDCOUNT: "mutationReplacePendingSupersededCount",
  MUTATIONTRACKINGREJECTEDCOUNT: "mutationTrackingRejectedCount",
  ONE: 1,
  OWNER_RPC_LANE: "owner_rpc_lane",
  PARTITION: "partition",
  PHASESCOPE: "phaseScope",
  PREFERAUTHORITATIVEREAD: "preferAuthoritativeRead",
  PREFEROWNERRPCREAD: "preferOwnerRpcRead",
  PRESSURERETRYAFTERMS: "pressureRetryAfterMs",
  QUERY: "query",
  READ: "read",
  READOUTCOMECOUNTS: "readOutcomeCounts",
  REQUIREAUTHORITATIVE: "requireAuthoritative",
  REQUIREOWNERRPCREAD: "requireOwnerRpcRead",
  ROUTER_QUERY_TRANSPORT_NOT_READY: "ROUTER_QUERY_TRANSPORT_NOT_READY",
  ROUTINGREADINESSDIMENSION: "routingReadinessDimension",
  SELECT: "select",
  SESSIONID: "sessionId",
  SKIPCACHEWAIT: "skipCacheWait",
  SYSTEM_TABLE_CACHE_UNAVAILABLE: "system_table_cache_unavailable",
  TIMEOUTBUDGET: "timeoutBudget",
  UNKNOWN: "unknown",
  UPDATE: "update",
  VISIBLE: "visible",
  WORKCLASS: "workClass",
  WRITE: "write",
  ZERO: 0,
});


const CONTROL_PLANE_LOCAL_READ_CONSISTENCY = 'local_leader';
const CONTROL_PLANE_REPLICA_FALLBACK_CONSISTENCY = 'any_replica';

const CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_ERROR = Object.freeze({
  AUTHORITATIVE_READ_OWNER_UNAVAILABLE:
    'authoritative_read_owner_unavailable',
  BOOTSTRAP_SNAPSHOT_PHASE_SCOPE_REQUIRED:
    'bootstrap_snapshot_phase_scope_required',
  BOOTSTRAP_SNAPSHOT_UNAVAILABLE:
    'bootstrap_snapshot_unavailable',
  SQL_QUERY_ENGINE_UNAVAILABLE:
    'sql_query_engine_unavailable',
});

const CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_SOURCE = Object.freeze({
  SQL_QUERY_ENGINE: 'sql_query_engine',
});
const CONTROL_PLANE_OPERATION_LEDGER_LIMIT = 256;
const CONTROL_PLANE_READ_STRATEGY = Object.freeze({
  CACHE: 'cache',
  AUTHORITATIVE: 'authoritative',
  AUTHORITATIVE_REQUIRED: 'authoritative_required',
  OWNER_LOCAL_NON_PROPAGATED: 'owner_local_non_propagated',
  BOOTSTRAP_SNAPSHOT: 'bootstrap_snapshot',
});
const CONTROL_PLANE_READ_PROFILE = Object.freeze({
  DIAGNOSTICS: 'diagnostics',
  PLANNING: 'planning',
  REPAIR_REQUIRED: 'repair_required',
  TABLE_LIFECYCLE: 'table_lifecycle',
});
const CONTROL_PLANE_PHASE_SCOPE = Object.freeze({
  BOOTSTRAP: 'bootstrap',
  JOIN: 'join',
});
const CONTROL_PLANE_READ_OUTCOME = Object.freeze({
  CACHE_HIT: 'cache_hit',
  AUTHORITATIVE: 'authoritative',
  OWNER_LOCAL_NON_PROPAGATED: 'owner_local_non_propagated',
  BOOTSTRAP_SNAPSHOT: 'bootstrap_snapshot',
  DEFERRED: 'deferred',
  REJECTED: 'rejected',
  STALE_NOT_ALLOWED: 'stale_not_allowed',
  OWNER_NOT_READY: 'owner_not_ready',
});
const CONTROL_PLANE_MUTATION_OUTCOME = Object.freeze({
  APPLIED: 'applied',
  NO_OP: 'no_op',
  PENDING_VISIBILITY: 'pending_visibility',
  DEFERRED: 'deferred',
  REJECTED: 'rejected',
  OWNER_NOT_READY: 'owner_not_ready',
  OBSERVED_STATE_CHANGED: 'observed_state_changed',
});
const CONTROL_PLANE_SQL_OPERATION = Object.freeze({
  READ: 'read',
  WRITE: 'write',
  UNKNOWN: 'unknown',
});
const CONTROL_PLANE_MUTATION_OPERATION = Object.freeze({
  INSERT: 'insert',
  UPDATE: 'update',
  UPSERT: 'upsert',
  DELETE: 'delete',
});
const CONTROL_PLANE_MUTATION_MERGE_POLICY = Object.freeze({
  NONE: 'none',
  SINGLE_FLIGHT: 'single_flight',
  REPLACE_PENDING: 'replace_pending',
});
const CONTROL_PLANE_GATEWAY_LIMIT = Object.freeze({
  MAX_TRACKED_READ_REQUESTS: 512,
  MAX_TRACKED_QUERY_REQUESTS: 512,
  MAX_TRACKED_MUTATION_REQUESTS: 512,
  MAX_PENDING_REPLACE_MUTATION_REQUESTS: 512,
});
const CONTROL_PLANE_GATEWAY_ERROR_CODE = Object.freeze({
  MUTATION_TRACKING_SATURATED: 'CONTROL_PLANE_MUTATION_TRACKING_SATURATED',
});
const GATEWAY_ERROR_MSG = Object.freeze({
  CDC_REQUIRED:
    'ControlPlaneSystemTableGateway requires cdcIntegrationService',
  SQL_ENGINE_REQUIRED:
    'ControlPlaneSystemTableGateway requires sqlQueryEngine',
  MUTATION_OPERATION_REQUIRED:
    'ControlPlaneSystemTableGateway requires a supported mutation operation',
  MUTATION_TABLE_REQUIRED:
    'ControlPlaneSystemTableGateway requires a valid system table name',
  MUTATION_ROW_REQUIRED:
    'ControlPlaneSystemTableGateway requires row data for insert/upsert',
  MUTATION_WHERE_REQUIRED:
    'ControlPlaneSystemTableGateway requires whereClause for update/delete',
  MUTATION_DATA_REQUIRED:
    'ControlPlaneSystemTableGateway requires update data for update',
});
const GATEWAY_LOG_MSG = Object.freeze({
  READ_DEFERRED: 'Control-plane metadata read deferred',
  READ_REJECTED: 'Control-plane metadata read rejected',
  MUTATION_DEFERRED: 'Control-plane metadata mutation deferred',
  MUTATION_REJECTED: 'Control-plane metadata mutation rejected',
});
const SYSTEM_TABLE_NAMES = new Set(Object.values(SYSTEM_TABLE_NAME));

function normalizeCoalescingToken(value) {
  return typeof value === TYPEOF.STRING && value.length > NUM.ZERO ?
    value :
    null;
}

function sortObjectKeys(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => sortObjectKeys(entry));
  }
  if (!value || typeof value !== TYPEOF.OBJECT) {
    return value;
  }
  return Object.keys(value)
    .sort()
    .reduce((accumulator, key) => {
      accumulator[key] = sortObjectKeys(value[key]);
      return accumulator;
    }, {});
}

function stableSerialize(value) {
  return JSON.stringify(sortObjectKeys(value));
}

function normalizeSystemTableName(value) {
  if (typeof value !== TYPEOF.STRING) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return SYSTEM_TABLE_NAMES.has(normalized) ? normalized : null;
}

function normalizePhaseScope(value) {
  if (value === CONTROL_PLANE_PHASE_SCOPE.BOOTSTRAP) {
    return CONTROL_PLANE_PHASE_SCOPE.BOOTSTRAP;
  }
  if (value === CONTROL_PLANE_PHASE_SCOPE.JOIN) {
    return CONTROL_PLANE_PHASE_SCOPE.JOIN;
  }
  return null;
}

function extractSystemTableNameFromSql(sql) {
  if (typeof sql !== TYPEOF.STRING || sql.trim().length === NUM.ZERO) {
    return null;
  }
  const normalizedSql = sql.trim();
  for (const matcher of [
    /^\s*select\b[\s\S]*?\bfrom\s+([a-zA-Z_][\w]*)/i,
    /^\s*insert(?:\s+or\s+replace)?\s+into\s+([a-zA-Z_][\w]*)/i,
    /^\s*update\s+([a-zA-Z_][\w]*)/i,
    /^\s*delete\s+from\s+([a-zA-Z_][\w]*)/i,
  ]) {
    const match = normalizedSql.match(matcher);
    if (match?.[CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ONE]) {
      return normalizeSystemTableName(match[CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ONE]);
    }
  }
  return null;
}

function normalizeSqlOperationKind(value) {
  if (value === CONTROL_PLANE_SQL_OPERATION.READ) {
    return CONTROL_PLANE_SQL_OPERATION.READ;
  }
  if (value === CONTROL_PLANE_SQL_OPERATION.WRITE) {
    return CONTROL_PLANE_SQL_OPERATION.WRITE;
  }
  return CONTROL_PLANE_SQL_OPERATION.UNKNOWN;
}

function normalizeMutationOperation(value) {
  if (value === CONTROL_PLANE_MUTATION_OPERATION.INSERT) {
    return CONTROL_PLANE_MUTATION_OPERATION.INSERT;
  }
  if (value === CONTROL_PLANE_MUTATION_OPERATION.UPDATE) {
    return CONTROL_PLANE_MUTATION_OPERATION.UPDATE;
  }
  if (value === CONTROL_PLANE_MUTATION_OPERATION.UPSERT) {
    return CONTROL_PLANE_MUTATION_OPERATION.UPSERT;
  }
  if (value === CONTROL_PLANE_MUTATION_OPERATION.DELETE) {
    return CONTROL_PLANE_MUTATION_OPERATION.DELETE;
  }
  return null;
}

function normalizeMutationMergePolicy(value) {
  if (value === CONTROL_PLANE_MUTATION_MERGE_POLICY.NONE) {
    return CONTROL_PLANE_MUTATION_MERGE_POLICY.NONE;
  }
  if (value === CONTROL_PLANE_MUTATION_MERGE_POLICY.SINGLE_FLIGHT) {
    return CONTROL_PLANE_MUTATION_MERGE_POLICY.SINGLE_FLIGHT;
  }
  if (value === CONTROL_PLANE_MUTATION_MERGE_POLICY.REPLACE_PENDING) {
    return CONTROL_PLANE_MUTATION_MERGE_POLICY.REPLACE_PENDING;
  }
  return null;
}

function createDeferredPromise() {
  let resolve = null;
  let reject = null;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return {promise, resolve, reject};
}

function normalizePositiveInteger(value, fallbackValue) {
  return Number.isInteger(value) && value > NUM.ZERO ? value : fallbackValue;
}

function hasUsablePrimaryKeyValue(value) {
  if (typeof value === TYPEOF.UNDEFINED || value === null) {
    return false;
  }
  if (typeof value === TYPEOF.STRING) {
    return value.trim().length > NUM.ZERO;
  }
  return true;
}

function normalizeReadStrategy(value) {
  if (value === CONTROL_PLANE_READ_STRATEGY.CACHE) {
    return CONTROL_PLANE_READ_STRATEGY.CACHE;
  }
  if (value === CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE) {
    return CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE;
  }
  if (value === CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED) {
    return CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED;
  }
  if (value === CONTROL_PLANE_READ_STRATEGY.OWNER_LOCAL_NON_PROPAGATED) {
    return CONTROL_PLANE_READ_STRATEGY.OWNER_LOCAL_NON_PROPAGATED;
  }
  if (value === CONTROL_PLANE_READ_STRATEGY.BOOTSTRAP_SNAPSHOT) {
    return CONTROL_PLANE_READ_STRATEGY.BOOTSTRAP_SNAPSHOT;
  }
  return null;
}

function normalizeReadProfile(value) {
  if (value === CONTROL_PLANE_READ_PROFILE.DIAGNOSTICS) {
    return CONTROL_PLANE_READ_PROFILE.DIAGNOSTICS;
  }
  if (value === CONTROL_PLANE_READ_PROFILE.PLANNING) {
    return CONTROL_PLANE_READ_PROFILE.PLANNING;
  }
  if (value === CONTROL_PLANE_READ_PROFILE.REPAIR_REQUIRED) {
    return CONTROL_PLANE_READ_PROFILE.REPAIR_REQUIRED;
  }
  if (value === CONTROL_PLANE_READ_PROFILE.TABLE_LIFECYCLE) {
    return CONTROL_PLANE_READ_PROFILE.TABLE_LIFECYCLE;
  }
  return null;
}

function resolveReadStrategyForProfile(readProfile) {
  if (readProfile === CONTROL_PLANE_READ_PROFILE.PLANNING) {
    return CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE;
  }
  if (readProfile === CONTROL_PLANE_READ_PROFILE.DIAGNOSTICS ||
      readProfile === CONTROL_PLANE_READ_PROFILE.REPAIR_REQUIRED ||
      readProfile === CONTROL_PLANE_READ_PROFILE.TABLE_LIFECYCLE) {
    return CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED;
  }
  return null;
}

function applyProfileDefault(options, key, value) {
  if (typeof options?.[key] !== TYPEOF.UNDEFINED) {
    return options;
  }
  return {
    ...options,
    [key]: value,
  };
}

function resolveMutationCompletionState(result = {}) {
  if (typeof result?.completionState === TYPEOF.STRING &&
      result.completionState.length > NUM.ZERO) {
    return result.completionState;
  }
  if (typeof result?.visibilityState === TYPEOF.STRING &&
      result.visibilityState !== CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.VISIBLE) {
    return CONTROL_PLANE_MUTATION_OUTCOME.PENDING_VISIBILITY;
  }
  if (result?.success === false) {
    return result?.pressureAction === PRESSURE_GOVERNOR_ACTION.DEFER ?
      CONTROL_PLANE_MUTATION_OUTCOME.DEFERRED :
      (
        result?.pressureAction === PRESSURE_GOVERNOR_ACTION.REJECT ?
          CONTROL_PLANE_MUTATION_OUTCOME.REJECTED :
          CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY
      );
  }
  const affectedRows = Number(
    result?.partitionResult?.affectedRows ?? result?.affectedRows,
  );
  return Number.isFinite(affectedRows) && affectedRows <= NUM.ZERO ?
    CONTROL_PLANE_MUTATION_OUTCOME.OBSERVED_STATE_CHANGED :
    CONTROL_PLANE_MUTATION_OUTCOME.APPLIED;
}

function resolveReadProfileOptions(options = {}) {
  const readProfile = normalizeReadProfile(
    options?.readProfile || options?.profile,
  );
  if (!readProfile) {
    return options;
  }

  let resolvedOptions = {
    ...options,
    readProfile,
  };
  switch (readProfile) {
    case CONTROL_PLANE_READ_PROFILE.DIAGNOSTICS:
      resolvedOptions = applyProfileDefault(
        resolvedOptions,
        CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.REQUIREAUTHORITATIVE,
        true,
      );
      resolvedOptions = applyProfileDefault(
        resolvedOptions,
        CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.PREFEROWNERRPCREAD,
        true,
      );
      resolvedOptions = applyProfileDefault(
        resolvedOptions,
        CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.REQUIREOWNERRPCREAD,
        true,
      );
      resolvedOptions = applyProfileDefault(
        resolvedOptions,
        CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ALLOWSQLFALLBACK,
        false,
      );
      resolvedOptions = applyProfileDefault(
        resolvedOptions,
        CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ROUTINGREADINESSDIMENSION,
        CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
      );
      break;
    case CONTROL_PLANE_READ_PROFILE.PLANNING:
      resolvedOptions = applyProfileDefault(
        resolvedOptions,
        CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.PREFERAUTHORITATIVEREAD,
        true,
      );
      resolvedOptions = applyProfileDefault(
        resolvedOptions,
        CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.PREFEROWNERRPCREAD,
        true,
      );
      resolvedOptions = applyProfileDefault(
        resolvedOptions,
        CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.REQUIREOWNERRPCREAD,
        false,
      );
      resolvedOptions = applyProfileDefault(
        resolvedOptions,
        CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ALLOWSQLFALLBACK,
        true,
      );
      resolvedOptions = applyProfileDefault(
        resolvedOptions,
        CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ROUTINGREADINESSDIMENSION,
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
      );
      break;
    case CONTROL_PLANE_READ_PROFILE.REPAIR_REQUIRED:
      resolvedOptions = applyProfileDefault(
        resolvedOptions,
        CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.REQUIREAUTHORITATIVE,
        true,
      );
      resolvedOptions = applyProfileDefault(
        resolvedOptions,
        CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.PREFEROWNERRPCREAD,
        true,
      );
      resolvedOptions = applyProfileDefault(
        resolvedOptions,
        CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.REQUIREOWNERRPCREAD,
        false,
      );
      resolvedOptions = applyProfileDefault(
        resolvedOptions,
        CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ALLOWSQLFALLBACK,
        true,
      );
      resolvedOptions = applyProfileDefault(
        resolvedOptions,
        CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ALLOWPRESSUREDEGRADE,
        false,
      );
      resolvedOptions = applyProfileDefault(
        resolvedOptions,
        CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.DELIVERYPRIORITY,
        CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.CRITICAL,
      );
      resolvedOptions = applyProfileDefault(
        resolvedOptions,
        CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.WORKCLASS,
        PRESSURE_WORK_CLASS.CRITICAL,
      );
      resolvedOptions = applyProfileDefault(
        resolvedOptions,
        CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ROUTINGREADINESSDIMENSION,
        CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
      );
      break;
    case CONTROL_PLANE_READ_PROFILE.TABLE_LIFECYCLE:
      resolvedOptions = applyProfileDefault(
        resolvedOptions,
        CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.PREFERAUTHORITATIVEREAD,
        true,
      );
      resolvedOptions = applyProfileDefault(
        resolvedOptions,
        CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.PREFEROWNERRPCREAD,
        true,
      );
      resolvedOptions = applyProfileDefault(
        resolvedOptions,
        CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.REQUIREOWNERRPCREAD,
        false,
      );
      resolvedOptions = applyProfileDefault(
        resolvedOptions,
        CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.REQUIREAUTHORITATIVE,
        true,
      );
      resolvedOptions = applyProfileDefault(
        resolvedOptions,
        CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ALLOWSQLFALLBACK,
        true,
      );
      resolvedOptions = applyProfileDefault(
        resolvedOptions,
        CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.DELIVERYPRIORITY,
        CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.CRITICAL,
      );
      resolvedOptions = applyProfileDefault(
        resolvedOptions,
        CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ROUTINGREADINESSDIMENSION,
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
      );
      break;
    default:
      break;
  }
  return resolvedOptions;
}

function extractSqlOperationKind(sql) {
  if (typeof sql !== TYPEOF.STRING) {
    return CONTROL_PLANE_SQL_OPERATION.UNKNOWN;
  }
  const normalizedSql = sql.trim().toLowerCase();
  if (normalizedSql.startsWith(CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.SELECT)) {
    return CONTROL_PLANE_SQL_OPERATION.READ;
  }
  if (normalizedSql.startsWith(CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.INSERT) ||
      normalizedSql.startsWith(CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.UPDATE) ||
      normalizedSql.startsWith(CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.DELETE)) {
    return CONTROL_PLANE_SQL_OPERATION.WRITE;
  }
  return CONTROL_PLANE_SQL_OPERATION.UNKNOWN;
}

function copyOption(target, source, key) {
  if (typeof source?.[key] === TYPEOF.UNDEFINED) {
    return target;
  }
  return {
    ...target,
    [key]: source[key],
  };
}

class ControlPlaneSystemTableGateway {
  /**
   * @param {Object} options
   */
  constructor(options = {}) {
    this.nodeId = options.nodeId || null;
    this._sqlQueryEngine = options.sqlQueryEngine || null;
    this._cdcIntegrationService = options.cdcIntegrationService || null;
    this._systemTableCache = options.systemTableCache || null;
    this._messageRouter = options.messageRouter || null;
    this.sqlQueryEngineProvider =
      typeof options.getSqlQueryEngine === TYPEOF.FUNCTION ?
        options.getSqlQueryEngine :
        null;
    this.cdcIntegrationServiceProvider =
      typeof options.getCdcIntegrationService === TYPEOF.FUNCTION ?
        options.getCdcIntegrationService :
        null;
    this.systemTableCacheProvider =
      typeof options.getSystemTableCache === TYPEOF.FUNCTION ?
        options.getSystemTableCache :
        null;
    this.messageRouterProvider =
      typeof options.getMessageRouter === TYPEOF.FUNCTION ?
        options.getMessageRouter :
        null;
    this.pressureGovernor = options.pressureGovernor || null;
    this.logger = options.logger || null;
    this.now = typeof options.now === TYPEOF.FUNCTION ?
      options.now :
      () => Date.now();
    this.controlPlaneOperationLedger =
      options.controlPlaneOperationLedger ||
      new ControlPlaneDiagnosticsLedger({
        maxEntries: normalizePositiveInteger(
          options.controlPlaneOperationLedgerMaxEntries,
          CONTROL_PLANE_OPERATION_LEDGER_LIMIT,
        ),
        now: this.now,
      });
    this.inFlightReadRequestsByKey = new Map();
    this.inFlightQueryRequestsByKey = new Map();
    this.inFlightMutationRequestsByKey = new Map();
    this.pendingReplaceMutationRequestsByKey = new Map();
    this.gatewayLimits = Object.freeze({
      maxTrackedReadRequests: normalizePositiveInteger(
        options.maxTrackedReadRequests,
        CONTROL_PLANE_GATEWAY_LIMIT.MAX_TRACKED_READ_REQUESTS,
      ),
      maxTrackedQueryRequests: normalizePositiveInteger(
        options.maxTrackedQueryRequests,
        CONTROL_PLANE_GATEWAY_LIMIT.MAX_TRACKED_QUERY_REQUESTS,
      ),
      maxTrackedMutationRequests: normalizePositiveInteger(
        options.maxTrackedMutationRequests,
        CONTROL_PLANE_GATEWAY_LIMIT.MAX_TRACKED_MUTATION_REQUESTS,
      ),
      maxPendingReplaceMutationRequests: normalizePositiveInteger(
        options.maxPendingReplaceMutationRequests,
        CONTROL_PLANE_GATEWAY_LIMIT.MAX_PENDING_REPLACE_MUTATION_REQUESTS,
      ),
    });
    this.gatewayMetrics = {
      readSingleFlightJoinCount: NUM.ZERO,
      querySingleFlightJoinCount: NUM.ZERO,
      mutationSingleFlightJoinCount: NUM.ZERO,
      readTrackingBypassCount: NUM.ZERO,
      queryTrackingBypassCount: NUM.ZERO,
      mutationReplacePendingQueuedCount: NUM.ZERO,
      mutationReplacePendingSupersededCount: NUM.ZERO,
      mutationTrackingRejectedCount: NUM.ZERO,
      maxObservedInFlightReadRequests: NUM.ZERO,
      maxObservedInFlightQueryRequests: NUM.ZERO,
      maxObservedInFlightMutationRequests: NUM.ZERO,
      maxObservedPendingReplaceMutationRequests: NUM.ZERO,
      maxObservedRetainedRequestCount: NUM.ZERO,
      maxObservedReadLatencyMs: NUM.ZERO,
      maxObservedMutationLatencyMs: NUM.ZERO,
      readOutcomeCounts: Object.create(null),
      mutationOutcomeCounts: Object.create(null),
    };
    this.lastRetentionMetricSignature = null;
    this.recordGatewayRetentionSnapshot();
  }

  /**
   * @param {Object} entry
   * @return {void}
   * @private
   */
  recordControlPlaneOperation(entry = {}) {
    if (!this.controlPlaneOperationLedger) {
      return;
    }
    this.controlPlaneOperationLedger.append({
      nodeId: entry.nodeId || this.nodeId || null,
      ...entry,
    });
  }

  /**
   * @param {Object} [options={}]
   * @return {Object[]}
   */
  getControlPlaneOperationLedgerEntries(options = {}) {
    return this.controlPlaneOperationLedger ?
      this.controlPlaneOperationLedger.getEntries(options) :
      Object.freeze([]);
  }

  get sqlQueryEngine() {
    const providedSqlQueryEngine = this.sqlQueryEngineProvider?.() || null;
    return providedSqlQueryEngine || this._sqlQueryEngine || null;
  }

  set sqlQueryEngine(sqlQueryEngine) {
    this._sqlQueryEngine = sqlQueryEngine || null;
  }

  get cdcIntegrationService() {
    const providedCdcIntegrationService =
      this.cdcIntegrationServiceProvider?.() || null;
    return providedCdcIntegrationService || this._cdcIntegrationService || null;
  }

  set cdcIntegrationService(cdcIntegrationService) {
    this._cdcIntegrationService = cdcIntegrationService || null;
  }

  get systemTableCache() {
    const providedSystemTableCache = this.systemTableCacheProvider?.() || null;
    return providedSystemTableCache || this._systemTableCache || null;
  }

  set systemTableCache(systemTableCache) {
    this._systemTableCache = systemTableCache || null;
  }

  get messageRouter() {
    const providedMessageRouter = this.messageRouterProvider?.() || null;
    return providedMessageRouter || this._messageRouter || null;
  }

  set messageRouter(messageRouter) {
    this._messageRouter = messageRouter || null;
  }

  /**
   * @param {Object|null} sqlQueryEngine
   */
  setSqlQueryEngine(sqlQueryEngine) {
    this.sqlQueryEngine = sqlQueryEngine;
  }

  /**
   * @param {Object|null} cdcIntegrationService
   */
  setCdcIntegrationService(cdcIntegrationService) {
    this.cdcIntegrationService = cdcIntegrationService;
  }

  /**
   * @param {Object|null} systemTableCache
   */
  setSystemTableCache(systemTableCache) {
    this.systemTableCache = systemTableCache;
  }

  /**
   * @param {Object|null} messageRouter
   */
  setMessageRouter(messageRouter) {
    this.messageRouter = messageRouter;
  }

  resolveSqlQueryEngine() {
    if (this.sqlQueryEngine) {
      return this.sqlQueryEngine;
    }
    return this.resolveCdcIntegrationService()?.sqlQueryEngine || null;
  }

  resolveCdcIntegrationService() {
    return this.cdcIntegrationService;
  }

  resolveSystemTableCache() {
    return this.systemTableCache;
  }

  resolveMessageRouter() {
    return this.messageRouter;
  }

  /**
   * Reconcile authoritative rows into the writable system-table cache.
   * This is the only runtime cache-repair ingress outside CDC delivery.
   *
   * @param {string} tableName
   * @param {Object[]} authoritativeRows
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async reconcileAuthoritativeCacheRows(
    tableName,
    authoritativeRows = [],
    options = {},
  ) {
    const defaultCache = this.resolveSystemTableCache();
    const writableCache = options?.cacheMutationTarget || defaultCache;
    const readableCache =
      options?.systemTableCache ||
      defaultCache ||
      writableCache;
    if (!writableCache ||
        typeof writableCache.applySystemTableChange !== TYPEOF.FUNCTION ||
        !readableCache) {
      return {
        success: false,
        tableName,
        mutationCount: NUM.ZERO,
        outcome: CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY,
        error: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.SYSTEM_TABLE_CACHE_UNAVAILABLE,
      };
    }

    const primaryKeyField = options?.primaryKeyField ||
      getSystemCachePrimaryKeyFieldOrFallback(tableName, 'id');
    const authoritativeEntries = Array.isArray(authoritativeRows) ?
      authoritativeRows :
      [];
    const cachedEntries = Array.isArray(options?.cachedRows) ?
      options.cachedRows :
      (
        typeof options?.cachedRowFilter === TYPEOF.FUNCTION &&
          typeof readableCache.filter === TYPEOF.FUNCTION ?
          readableCache.filter(tableName, options.cachedRowFilter) || [] :
          (
            typeof readableCache.getAll === TYPEOF.FUNCTION ?
              readableCache.getAll(tableName) || [] :
              []
          )
      );
    const rowComparator = typeof options?.areRowsEqual === TYPEOF.FUNCTION ?
      options.areRowsEqual :
      null;
    const causeOptions = typeof options?.causeId === TYPEOF.STRING &&
      options.causeId.length > NUM.ZERO ?
      {causeId: options.causeId} :
      undefined;
    const cachedRowsByKey = new Map();
    const authoritativeKeys = new Set();
    let mutationCount = NUM.ZERO;

    for (const row of cachedEntries) {
      const key = row?.[primaryKeyField] ?? row?.id;
      if (!hasUsablePrimaryKeyValue(key)) {
        continue;
      }
      cachedRowsByKey.set(String(key), row);
    }

    for (const row of authoritativeEntries) {
      const canonicalRow = canonicalizeSystemTableRow(tableName, row);
      const key = canonicalRow?.[primaryKeyField] ?? canonicalRow?.id;
      if (!hasUsablePrimaryKeyValue(key)) {
        continue;
      }
      const normalizedKey = String(key);
      authoritativeKeys.add(normalizedKey);
      const cachedRow = cachedRowsByKey.get(normalizedKey) || null;
      if (rowComparator && rowComparator(cachedRow, canonicalRow)) {
        continue;
      }
      writableCache.applySystemTableChange(
        tableName,
        CDC_OPERATION.UPSERT,
        canonicalRow,
        causeOptions,
      );
      mutationCount += NUM.ONE;
    }

    if (options?.deleteMissing !== false) {
      for (const cachedRow of cachedEntries) {
        const key = cachedRow?.[primaryKeyField] ?? cachedRow?.id;
        if (!hasUsablePrimaryKeyValue(key) ||
            authoritativeKeys.has(String(key))) {
          continue;
        }
        writableCache.applySystemTableChange(
          tableName,
          CDC_OPERATION.DELETE,
          cachedRow,
          causeOptions,
        );
        mutationCount += NUM.ONE;
      }
    }

    return {
      success: true,
      tableName,
      mutationCount,
      outcome:
        mutationCount > NUM.ZERO ?
          CONTROL_PLANE_MUTATION_OUTCOME.APPLIED :
          CONTROL_PLANE_MUTATION_OUTCOME.NO_OP,
    };
  }

  /**
   * @return {PressureGovernor}
   * @private
   */
  getPressureGovernor() {
    if (this.pressureGovernor) {
      this.pressureGovernor.configure({
        nodeId: this.nodeId,
        messageRouter: this.resolveMessageRouter(),
        logger: this.logger,
      });
      return this.pressureGovernor;
    }
    this.pressureGovernor = PressureGovernor.getShared({
      nodeId: this.nodeId,
      messageRouter: this.resolveMessageRouter(),
      logger: this.logger,
    });
    return this.pressureGovernor;
  }

  /**
   * @param {string|null} tableName
   * @return {string|null}
   * @private
   */
  resolveSystemTablePartitionId(tableName) {
    if (typeof tableName !== TYPEOF.STRING || tableName.length === NUM.ZERO) {
      return null;
    }
    const cdcIntegrationService = this.resolveCdcIntegrationService();
    if (typeof cdcIntegrationService?.resolveSystemTablePartitionIds ===
        TYPEOF.FUNCTION) {
      const partitionIds =
        cdcIntegrationService.resolveSystemTablePartitionIds(tableName);
      if (Array.isArray(partitionIds)) {
        const partitionId = partitionIds.find((entry) =>
          typeof entry === TYPEOF.STRING && entry.length > NUM.ZERO,
        ) || null;
        if (partitionId) {
          return partitionId;
        }
      }
    }
    return INITIAL_PARTITION_IDS[tableName] || null;
  }

  /**
   * @param {string|null} tableName
   * @param {string|null} routingReadinessDimension
   * @return {Object}
   * @private
   */
  buildFallbackSystemTableRoutingDiagnostics(
    tableName,
    routingReadinessDimension = null,
  ) {
    const partitionId = this.resolveSystemTablePartitionId(tableName);
    let routingSnapshot = null;
    const sqlQueryEngine = this.resolveSqlQueryEngine();
    if (partitionId &&
        sqlQueryEngine?.queryExecutor &&
        typeof sqlQueryEngine.queryExecutor.getPartitionRoutingSnapshot ===
          TYPEOF.FUNCTION) {
      try {
        routingSnapshot = sqlQueryEngine.queryExecutor.getPartitionRoutingSnapshot(
          partitionId,
          routingReadinessDimension ||
            CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE,
        );
      } catch (_error) {
        routingSnapshot = null;
      }
    }

    let partitionRow = null;
    let serviceRows = [];
    const systemTableCache = this.resolveSystemTableCache();
    if (systemTableCache &&
        typeof systemTableCache.filter === TYPEOF.FUNCTION) {
      const partitionRows = systemTableCache.filter(
        SYSTEM_TABLE_NAME.PARTITIONS,
        (row) => {
          const rowPartitionId =
            row?.partition_id || row?.partitionId || row?.id || null;
          if (partitionId && rowPartitionId === partitionId) {
            return true;
          }
          return row?.table_name === tableName || row?.tableName === tableName;
        },
      ) || [];
      partitionRow = partitionRows[NUM.ZERO] || null;
      if (partitionId) {
        serviceRows = systemTableCache.filter(
          SYSTEM_TABLE_NAME.SERVICES,
          (row) => {
            return row?.partition_id === partitionId &&
              row?.service_type === CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.PARTITION;
          },
        ) || [];
      }
    }

    const leaderNodeId =
      routingSnapshot?.canonicalLeaderNodeId ||
      partitionRow?.leader_node_id ||
      partitionRow?.leaderNodeId ||
      null;
    return {
      partitionId,
      leaderNodeId:
        typeof leaderNodeId === TYPEOF.STRING && leaderNodeId.length > NUM.ZERO ?
          leaderNodeId :
          null,
      serviceRowCount:
        Number.isFinite(routingSnapshot?.serviceRowCount) ?
          routingSnapshot.serviceRowCount :
          serviceRows.length,
      routableServiceCount:
        Number.isFinite(routingSnapshot?.routableServiceCount) ?
          routingSnapshot.routableServiceCount :
          serviceRows.filter((row) =>
            row?.status === CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ACTIVE &&
            typeof row?.address === TYPEOF.STRING &&
            row.address.length > NUM.ZERO,
          ).length,
      deniedByReadiness:
        routingSnapshot &&
          typeof routingSnapshot.deniedByNodeId === TYPEOF.OBJECT ?
          Object.keys(routingSnapshot.deniedByNodeId).length > NUM.ZERO :
          false,
    };
  }

  /**
   * @param {string|null} tableName
   * @param {Object|null} result
   * @param {Object} [options={}]
   * @return {Object}
   * @private
   */
  buildOperationLedgerDiagnostics(tableName, result = null, options = {}) {
    const routingReadinessDimension =
      options?.routingReadinessDimension ||
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE;
    const systemTableDiagnostics =
      result?.systemTableDiagnostics &&
        typeof result.systemTableDiagnostics === TYPEOF.OBJECT ?
        result.systemTableDiagnostics :
        {};
    const fallbackDiagnostics = this.buildFallbackSystemTableRoutingDiagnostics(
      tableName,
      routingReadinessDimension,
    );
    const leaderNodeId =
      systemTableDiagnostics.leaderNodeId ||
      fallbackDiagnostics.leaderNodeId ||
      null;
    const queryTimeoutMs =
      Number.isFinite(systemTableDiagnostics.queryTimeoutMs) ?
        systemTableDiagnostics.queryTimeoutMs :
        (
          Number.isFinite(result?.queryTimeoutMs) ?
            result.queryTimeoutMs :
            (
              Number.isFinite(options?.timeoutMs) ?
                options.timeoutMs :
                (
                  Number.isFinite(options?.queryTimeoutMs) ?
                    options.queryTimeoutMs :
                    (
                      Number.isFinite(options?.requestedTimeoutMs) ?
                        options.requestedTimeoutMs :
                        null
                    )
                )
            )
        );
    return {
      partitionId:
        systemTableDiagnostics.partitionId ||
        fallbackDiagnostics.partitionId ||
        null,
      localReadHit:
        result?.localReadHit === true ||
        systemTableDiagnostics.localReadHit === true ||
        result?.source === CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.LOCAL_PARTITION_REPLICA,
      localReplicaFallbackHit:
        result?.localReplicaFallbackHit === true ||
        systemTableDiagnostics.localReplicaFallbackHit === true,
      routedToNode:
        systemTableDiagnostics.routedToNode ||
        (
          result?.source ===
            CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_SOURCE.SQL_QUERY_ENGINE ||
          result?.source === CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.OWNER_RPC_LANE ||
          options?.operationClass === CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MUTATION ||
          options?.operationClass === CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.QUERY ?
            leaderNodeId :
            null
        ),
      deniedByReadiness:
        systemTableDiagnostics.deniedByReadiness === true ||
        fallbackDiagnostics.deniedByReadiness === true ||
        result?.errorCode === CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ROUTER_QUERY_TRANSPORT_NOT_READY ||
        (result?.success === false && result?.deferRetry === true),
      leaderNodeId,
      serviceRowCount:
        Number.isFinite(systemTableDiagnostics.serviceRowCount) ?
          systemTableDiagnostics.serviceRowCount :
          fallbackDiagnostics.serviceRowCount,
      routableServiceCount:
        Number.isFinite(systemTableDiagnostics.routableServiceCount) ?
          systemTableDiagnostics.routableServiceCount :
          fallbackDiagnostics.routableServiceCount,
      queryTimeoutMs:
        Number.isFinite(queryTimeoutMs) && queryTimeoutMs > NUM.ZERO ?
          Math.floor(queryTimeoutMs) :
          null,
    };
  }

  /**
   * @return {boolean}
   */
  supportsReadRows() {
    const systemTableCache = this.resolveSystemTableCache();
    const cdcIntegrationService = this.resolveCdcIntegrationService();
    const sqlQueryEngine = this.resolveSqlQueryEngine();
    return (
      Boolean(systemTableCache) ||
      typeof cdcIntegrationService
        ?.executeAuthoritativeSystemTableRead === TYPEOF.FUNCTION ||
      typeof sqlQueryEngine?.executeQuery === TYPEOF.FUNCTION
    );
  }

  /**
   * @return {boolean}
   */
  supportsMutationSubmission() {
    const cdcIntegrationService = this.resolveCdcIntegrationService();
    return (
      typeof cdcIntegrationService?.insertSystemTableRow === TYPEOF.FUNCTION ||
      typeof cdcIntegrationService?.updateSystemTableRow === TYPEOF.FUNCTION ||
      typeof cdcIntegrationService?.upsertSystemTableRow === TYPEOF.FUNCTION ||
      typeof cdcIntegrationService?.deleteSystemTableRow === TYPEOF.FUNCTION
    );
  }

  /**
   * @param {Object} [options={}]
   * @return {Object}
   * @private
   */
  buildQueryOptions(options = {}) {
    const requestedTimeoutMs = Number.isFinite(options?.timeoutMs) ?
      options.timeoutMs :
      (
        Number.isFinite(options?.queryTimeoutMs) ?
          options.queryTimeoutMs :
          options?.requestedTimeoutMs
      );
    let queryOptions = {
      ...buildControlPlaneQueryOptions({
        requestedTimeoutMs,
        timeoutBudget: options?.timeoutBudget,
        now: this.now,
      }),
      routingReadinessDimension:
        options?.routingReadinessDimension ||
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    };
    if (typeof options?.sessionId === TYPEOF.STRING &&
        options.sessionId.length > CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ZERO) {
      queryOptions.sessionId = options.sessionId;
    }
    if (options?.cancellationToken) {
      queryOptions.cancellationToken = options.cancellationToken;
    }
    queryOptions = copyOption(queryOptions, options, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.DELIVERYPRIORITY);
    return queryOptions;
  }

  /**
   * @param {Object} [options={}]
   * @return {Object}
   * @private
   */
  buildWriteOptions(options = {}) {
    let writeOptions = {
      routingReadinessDimension:
        options?.routingReadinessDimension ||
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    };
    const queryTimeoutMs = Number.isFinite(options?.queryTimeoutMs) ?
      options.queryTimeoutMs :
      options?.timeoutMs;
    if (Number.isFinite(queryTimeoutMs)) {
      writeOptions.queryTimeoutMs = queryTimeoutMs;
    } else if (options?.timeoutBudget &&
      typeof options.timeoutBudget === TYPEOF.OBJECT) {
      const remainingBudgetMs = getRemainingBudgetMs(
        options.timeoutBudget,
        {now: this.now},
      );
      if (remainingBudgetMs > NUM.ZERO) {
        writeOptions.queryTimeoutMs = Math.max(
          NUM.ONE,
          Math.floor(remainingBudgetMs),
        );
      }
    }
    writeOptions = copyOption(writeOptions, options, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.CANCELLATIONTOKEN);
    writeOptions = copyOption(writeOptions, options, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.TIMEOUTBUDGET);
    writeOptions = copyOption(writeOptions, options, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.SKIPCACHEWAIT);
    writeOptions = copyOption(writeOptions, options, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ALLOWPENDINGVISIBILITY);
    writeOptions = copyOption(writeOptions, options, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.EXPECTEDCACHEFIELDS);
    writeOptions = copyOption(writeOptions, options, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MINIMUMCACHEFIELDS);
    writeOptions = copyOption(writeOptions, options, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.FALLBACKPHASE);
    writeOptions = copyOption(writeOptions, options, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.SESSIONID);
    writeOptions = copyOption(writeOptions, options, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.DELIVERYPRIORITY);
    writeOptions = copyOption(writeOptions, options, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.WORKCLASS);
    writeOptions = copyOption(writeOptions, options, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.IGNOREEXISTING);
    writeOptions = copyOption(writeOptions, options, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ALLOWPRESSUREDEFER);
    writeOptions = copyOption(writeOptions, options, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.PRESSURERETRYAFTERMS);
    writeOptions = copyOption(writeOptions, options, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.COALESCINGKEY);
    writeOptions = copyOption(writeOptions, options, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ALLOWCOALESCING);
    writeOptions = copyOption(writeOptions, options, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MERGEPOLICY);
    writeOptions = copyOption(writeOptions, options, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.PHASESCOPE);
    return writeOptions;
  }

  /**
   * @return {Object}
   */
  getStats() {
    return {
      limits: {...this.gatewayLimits},
      retainedRequests: {
        inFlightReads: this.inFlightReadRequestsByKey.size,
        inFlightQueries: this.inFlightQueryRequestsByKey.size,
        inFlightMutations: this.inFlightMutationRequestsByKey.size,
        pendingReplaceMutations: this.pendingReplaceMutationRequestsByKey.size,
        total:
          this.inFlightReadRequestsByKey.size +
          this.inFlightQueryRequestsByKey.size +
          this.inFlightMutationRequestsByKey.size +
          this.pendingReplaceMutationRequestsByKey.size,
      },
      metrics: this.buildGatewayMetricsSnapshot(),
    };
  }

  /**
   * @return {Object}
   * @private
   */
  buildGatewayMetricsSnapshot() {
    return {
      ...this.gatewayMetrics,
      readOutcomeCounts: {...this.gatewayMetrics.readOutcomeCounts},
      mutationOutcomeCounts: {...this.gatewayMetrics.mutationOutcomeCounts},
    };
  }

  /**
   * @return {Object}
   * @private
   */
  buildRetainedRequestsSnapshot() {
    return {
      inFlightReads: this.inFlightReadRequestsByKey.size,
      inFlightQueries: this.inFlightQueryRequestsByKey.size,
      inFlightMutations: this.inFlightMutationRequestsByKey.size,
      pendingReplaceMutations: this.pendingReplaceMutationRequestsByKey.size,
      total:
        this.inFlightReadRequestsByKey.size +
        this.inFlightQueryRequestsByKey.size +
        this.inFlightMutationRequestsByKey.size +
        this.pendingReplaceMutationRequestsByKey.size,
    };
  }

  /**
   * @return {Object}
   * @private
   */
  buildRetentionMetricData() {
    const retainedRequests = this.buildRetainedRequestsSnapshot();
    const retainedRequestCapacity =
      this.gatewayLimits.maxTrackedReadRequests +
      this.gatewayLimits.maxTrackedQueryRequests +
      this.gatewayLimits.maxTrackedMutationRequests +
      this.gatewayLimits.maxPendingReplaceMutationRequests;
    return {
      nodeId: this.nodeId,
      retainedRequests,
      limits: {...this.gatewayLimits},
      retainedRequestCapacity,
      retainedRequestUtilization:
        retainedRequestCapacity > NUM.ZERO ?
          retainedRequests.total / retainedRequestCapacity :
          NUM.ZERO,
      boundedByTrackedCapacity: retainedRequests.total <= retainedRequestCapacity,
      maxObservedRetainedRequestCount:
        this.gatewayMetrics.maxObservedRetainedRequestCount,
    };
  }

  /**
   * @private
   */
  recordGatewayRetentionSnapshot() {
    const retainedRequests = this.buildRetainedRequestsSnapshot();
    const retainedRequestCount = retainedRequests.total;
    this.gatewayMetrics.maxObservedInFlightReadRequests = Math.max(
      this.gatewayMetrics.maxObservedInFlightReadRequests,
      retainedRequests.inFlightReads,
    );
    this.gatewayMetrics.maxObservedInFlightQueryRequests = Math.max(
      this.gatewayMetrics.maxObservedInFlightQueryRequests,
      retainedRequests.inFlightQueries,
    );
    this.gatewayMetrics.maxObservedInFlightMutationRequests = Math.max(
      this.gatewayMetrics.maxObservedInFlightMutationRequests,
      retainedRequests.inFlightMutations,
    );
    this.gatewayMetrics.maxObservedPendingReplaceMutationRequests = Math.max(
      this.gatewayMetrics.maxObservedPendingReplaceMutationRequests,
      retainedRequests.pendingReplaceMutations,
    );
    this.gatewayMetrics.maxObservedRetainedRequestCount = Math.max(
      this.gatewayMetrics.maxObservedRetainedRequestCount,
      retainedRequestCount,
    );
    this.emitGatewayRetentionMetric();
  }

  /**
   * @param {string} metricName
   * @private
   */
  incrementGatewayMetric(metricName) {
    if (typeof this.gatewayMetrics?.[metricName] !== TYPEOF.NUMBER) {
      return;
    }
    this.gatewayMetrics[metricName] += CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ONE;
  }

  /**
   * @param {string} metricName
   * @param {number} latencyMs
   * @private
   */
  recordGatewayLatency(metricName, latencyMs) {
    if (typeof this.gatewayMetrics?.[metricName] !== TYPEOF.NUMBER) {
      return;
    }
    if (!Number.isFinite(latencyMs) || latencyMs < NUM.ZERO) {
      return;
    }
    this.gatewayMetrics[metricName] = Math.max(
      this.gatewayMetrics[metricName],
      Math.floor(latencyMs),
    );
  }

  /**
   * @param {string} bucketName
   * @param {string|null} outcome
   * @private
   */
  incrementGatewayOutcomeMetric(bucketName, outcome) {
    const bucket = this.gatewayMetrics?.[bucketName];
    if (!bucket || typeof bucket !== TYPEOF.OBJECT) {
      return;
    }
    const normalizedOutcome = typeof outcome === TYPEOF.STRING &&
      outcome.length > NUM.ZERO ?
      outcome :
      'unknown';
    bucket[normalizedOutcome] = Number.isFinite(bucket[normalizedOutcome]) ?
      bucket[normalizedOutcome] + NUM.ONE :
      NUM.ONE;
  }

  /**
   * @param {string} tag
   * @param {Object} data
   * @private
   */
  emitGatewayMetric(tag, data) {
    if (typeof this.logger?.info !== TYPEOF.FUNCTION) {
      return;
    }
    try {
      this.logger.info(tag, data);
    } catch (_error) {
      // Metrics logging must not change gateway behavior.
    }
  }

  /**
   * @param {string} message
   * @param {Object} data
   * @private
   */
  emitGatewayWarning(message, data) {
    if (typeof this.logger?.warn !== TYPEOF.FUNCTION) {
      return;
    }
    try {
      this.logger.warn(message, data);
    } catch (_error) {
      // Diagnostic logging must not change gateway behavior.
    }
  }

  /**
   * @private
   */
  emitGatewayRetentionMetric() {
    const data = this.buildRetentionMetricData();
    const signature = stableSerialize(data);
    if (signature === this.lastRetentionMetricSignature) {
      return;
    }
    this.lastRetentionMetricSignature = signature;
    this.emitGatewayMetric(METRICS_LOG_TAG.CONTROL_PLANE_GATEWAY_RETENTION, data);
  }

  /**
   * @param {number} startedAtMs
   * @return {number}
   * @private
   */
  resolveLatencyMs(startedAtMs) {
    if (!Number.isFinite(startedAtMs)) {
      return NUM.ZERO;
    }
    return Math.max(NUM.ZERO, Math.floor(this.now() - startedAtMs));
  }

  /**
   * @param {Object} context
   * @param {Object} result
   * @private
   */
  recordReadTelemetry(context = {}, result = {}) {
    const latencyMs = this.resolveLatencyMs(context.startedAtMs);
    const outcome = typeof result?.outcome === TYPEOF.STRING ?
      result.outcome :
      CONTROL_PLANE_READ_OUTCOME.OWNER_NOT_READY;
    this.incrementGatewayOutcomeMetric(CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.READOUTCOMECOUNTS, outcome);
    this.recordGatewayLatency(CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MAXOBSERVEDREADLATENCYMS, latencyMs);
    this.emitGatewayMetric(METRICS_LOG_TAG.CONTROL_PLANE_GATEWAY_READ, {
      nodeId: this.nodeId,
      owner: context.owner || null,
      tableName: context.tableName || null,
      outcome,
      strategy: result?.strategyUsed || context.strategy || null,
      readProfile: context.readProfile || null,
      workClass: context.workClass || null,
      coalescingKey: context.coalescingKey || null,
      latencyMs,
      success: result?.success === true,
      rowCount: Number.isFinite(result?.rowCount) ?
        result.rowCount :
        (Array.isArray(result?.rows) ? result.rows.length : NUM.ZERO),
    });
    if (outcome === CONTROL_PLANE_READ_OUTCOME.DEFERRED ||
        outcome === CONTROL_PLANE_READ_OUTCOME.REJECTED) {
      this.emitGatewayWarning(
        outcome === CONTROL_PLANE_READ_OUTCOME.DEFERRED ?
          GATEWAY_LOG_MSG.READ_DEFERRED :
          GATEWAY_LOG_MSG.READ_REJECTED,
        {
          nodeId: this.nodeId,
          owner: context.owner || null,
          tableName: context.tableName || null,
          strategy: result?.strategyUsed || context.strategy || null,
          workClass: context.workClass || null,
          coalescingKey: context.coalescingKey || null,
          pressureAction: result?.pressureAction || null,
          pressureReason: result?.pressureReason || null,
          retryAfterMs: Number.isFinite(result?.retryAfterMs) ?
            result.retryAfterMs :
            null,
          error: result?.error || null,
        },
      );
    }
  }

  /**
   * @param {Object} context
   * @param {Object} result
   * @private
   */
  recordMutationTelemetry(context = {}, result = {}) {
    const latencyMs = this.resolveLatencyMs(context.startedAtMs);
    const outcome = typeof result?.outcome === TYPEOF.STRING ?
      result.outcome :
      CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY;
    this.incrementGatewayOutcomeMetric(CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MUTATIONOUTCOMECOUNTS, outcome);
    this.recordGatewayLatency(CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MAXOBSERVEDMUTATIONLATENCYMS, latencyMs);
    this.emitGatewayMetric(METRICS_LOG_TAG.CONTROL_PLANE_GATEWAY_MUTATION, {
      nodeId: this.nodeId,
      owner: context.owner || null,
      tableName: context.tableName || null,
      operation: context.operation || null,
      outcome,
      workClass: context.workClass || null,
      coalescingKey: context.coalescingKey || null,
      mergePolicy: context.mergePolicy || null,
      latencyMs,
      success: result?.success === true,
    });
    if (outcome === CONTROL_PLANE_MUTATION_OUTCOME.DEFERRED ||
        outcome === CONTROL_PLANE_MUTATION_OUTCOME.REJECTED) {
      this.emitGatewayWarning(
        outcome === CONTROL_PLANE_MUTATION_OUTCOME.DEFERRED ?
          GATEWAY_LOG_MSG.MUTATION_DEFERRED :
          GATEWAY_LOG_MSG.MUTATION_REJECTED,
        {
          nodeId: this.nodeId,
          owner: context.owner || null,
          tableName: context.tableName || null,
          operation: context.operation || null,
          workClass: context.workClass || null,
          coalescingKey: context.coalescingKey || null,
          mergePolicy: context.mergePolicy || null,
          pressureAction: result?.pressureAction || null,
          pressureReason: result?.pressureReason || null,
          retryAfterMs: Number.isFinite(result?.retryAfterMs) ?
            result.retryAfterMs :
            null,
          error: result?.error || null,
        },
      );
    }
  }

  /**
   * @param {Object} result
   * @return {Object}
   * @private
   */
  buildTrackingSaturatedMutationResult(result = {}) {
    return {
      success: false,
      error: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.CONTROL_PLANE_MUTATION_TRACKING_SATURATED,
      errorCode: CONTROL_PLANE_GATEWAY_ERROR_CODE.MUTATION_TRACKING_SATURATED,
      outcome: CONTROL_PLANE_MUTATION_OUTCOME.REJECTED,
      ...result,
    };
  }

  /**
   * @param {Map<string, Promise<Object>>} requestMap
   * @param {string|null} key
   * @param {Function} executionFactory
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   * @private
   */
  runSingleFlight(requestMap, key, executionFactory, options = {}) {
    if (!key) {
      return executionFactory();
    }
    const existingRequest = requestMap.get(key);
    if (existingRequest) {
      if (typeof options?.joinMetricName === TYPEOF.STRING) {
        this.incrementGatewayMetric(options.joinMetricName);
      }
      return existingRequest;
    }
    const maxTrackedRequests = normalizePositiveInteger(
      options?.maxTrackedRequests,
      Number.MAX_SAFE_INTEGER,
    );
    if (requestMap.size >= maxTrackedRequests) {
      if (typeof options?.bypassMetricName === TYPEOF.STRING) {
        this.incrementGatewayMetric(options.bypassMetricName);
      }
      return executionFactory();
    }
    let inFlightRequest = null;
    inFlightRequest = Promise.resolve()
      .then(() => executionFactory())
      .finally(() => {
        if (requestMap.get(key) === inFlightRequest) {
          requestMap.delete(key);
          this.recordGatewayRetentionSnapshot();
        }
      });
    requestMap.set(key, inFlightRequest);
    this.recordGatewayRetentionSnapshot();
    return inFlightRequest;
  }

  /**
   * @param {Object} mutation
   * @param {Object} [options={}]
   * @return {Object}
   * @private
   */
  buildMutationCoalescingDescriptor(mutation = {}, options = {}) {
    const allowCoalescing = options?.allowCoalescing !== false;
    const mergePolicy = normalizeMutationMergePolicy(
      options?.mergePolicy || mutation?.mergePolicy,
    ) || (
      allowCoalescing ?
        CONTROL_PLANE_MUTATION_MERGE_POLICY.SINGLE_FLIGHT :
        CONTROL_PLANE_MUTATION_MERGE_POLICY.NONE
    );
    const explicitKey = normalizeCoalescingToken(
      options?.coalescingKey || mutation?.coalescingKey,
    );
    if (mergePolicy === CONTROL_PLANE_MUTATION_MERGE_POLICY.NONE) {
      return {
        requestKey: null,
        mergePolicy,
      };
    }
    if (!explicitKey) {
      if (mergePolicy === CONTROL_PLANE_MUTATION_MERGE_POLICY.REPLACE_PENDING) {
        return {
          requestKey: null,
          mergePolicy: CONTROL_PLANE_MUTATION_MERGE_POLICY.NONE,
        };
      }
      return {
        requestKey: stableSerialize({
          kind: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.CONTROL_DASH_PLANE_DASH_MUTATION,
          tableName: mutation?.tableName || null,
          operation: mutation?.operation || null,
          row: mutation?.row || null,
          whereClause: mutation?.whereClause || null,
          data: mutation?.data || null,
          workClass: options?.workClass || null,
          deliveryPriority: options?.deliveryPriority || null,
          ignoreExisting: options?.ignoreExisting === true,
          allowPressureDefer: options?.allowPressureDefer === true,
          routingReadinessDimension:
            options?.routingReadinessDimension ||
            CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE,
        }),
        mergePolicy,
      };
    }
    if (mergePolicy === CONTROL_PLANE_MUTATION_MERGE_POLICY.SINGLE_FLIGHT) {
      return {
        requestKey: stableSerialize({
          kind: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.CONTROL_DASH_PLANE_DASH_MUTATION,
          explicitKey,
          tableName: mutation?.tableName || null,
          operation: mutation?.operation || null,
          row: mutation?.row || null,
          whereClause: mutation?.whereClause || null,
          data: mutation?.data || null,
          workClass: options?.workClass || null,
          deliveryPriority: options?.deliveryPriority || null,
          ignoreExisting: options?.ignoreExisting === true,
          allowPressureDefer: options?.allowPressureDefer === true,
          routingReadinessDimension:
            options?.routingReadinessDimension ||
            CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE,
        }),
        mergePolicy,
      };
    }
    return {
      requestKey: `control-plane:mutation:${mutation?.tableName || CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.UNKNOWN}:` +
        `${explicitKey}`,
      mergePolicy,
    };
  }

  /**
   * @param {string} requestKey
   * @return {Object}
   * @private
   */
  buildSupersededMutationResult(requestKey) {
    return {
      success: true,
      outcome: CONTROL_PLANE_MUTATION_OUTCOME.NO_OP,
      requestKey,
      superseded: true,
    };
  }

  /**
   * @param {string} requestKey
   * @param {Function} executionFactory
   * @param {Object|null} [deferred=null]
   * @return {Promise<Object>}
   * @private
   */
  scheduleMutationExecution(requestKey, executionFactory, deferred = null) {
    if (!this.inFlightMutationRequestsByKey.has(requestKey) &&
        this.inFlightMutationRequestsByKey.size >=
          this.gatewayLimits.maxTrackedMutationRequests) {
      this.incrementGatewayMetric(CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MUTATIONTRACKINGREJECTEDCOUNT);
      const saturatedResult = this.buildTrackingSaturatedMutationResult({
        requestKey,
      });
      if (deferred) {
        deferred.resolve(saturatedResult);
        return deferred.promise;
      }
      return Promise.resolve(saturatedResult);
    }
    let executionPromise = null;
    executionPromise = Promise.resolve()
      .then(() => executionFactory())
      .then((result) => {
        if (deferred) {
          deferred.resolve(result);
        }
        return result;
      }, (error) => {
        if (deferred) {
          deferred.reject(error);
        }
        throw error;
      })
      .finally(() => {
        if (this.inFlightMutationRequestsByKey.get(requestKey) === executionPromise) {
          this.inFlightMutationRequestsByKey.delete(requestKey);
          this.recordGatewayRetentionSnapshot();
        }
        const pendingRequest = this.pendingReplaceMutationRequestsByKey.get(requestKey);
        if (!pendingRequest) {
          return;
        }
        this.pendingReplaceMutationRequestsByKey.delete(requestKey);
        this.recordGatewayRetentionSnapshot();
        this.scheduleMutationExecution(
          requestKey,
          pendingRequest.executionFactory,
          pendingRequest.deferred,
        );
      });
    this.inFlightMutationRequestsByKey.set(requestKey, executionPromise);
    this.recordGatewayRetentionSnapshot();
    return deferred ? deferred.promise : executionPromise;
  }

  /**
   * @param {string} requestKey
   * @param {Function} executionFactory
   * @return {Promise<Object>}
   * @private
   */
  runReplacePendingMutation(requestKey, executionFactory) {
    const inFlightRequest = this.inFlightMutationRequestsByKey.get(requestKey);
    if (!inFlightRequest) {
      return this.scheduleMutationExecution(requestKey, executionFactory);
    }

    const existingPending = this.pendingReplaceMutationRequestsByKey.get(requestKey);
    if (existingPending) {
      this.incrementGatewayMetric(CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MUTATIONREPLACEPENDINGSUPERSEDEDCOUNT);
      existingPending.deferred.resolve(
        this.buildSupersededMutationResult(requestKey),
      );
    }

    if (!existingPending &&
        this.pendingReplaceMutationRequestsByKey.size >=
          this.gatewayLimits.maxPendingReplaceMutationRequests) {
      this.incrementGatewayMetric(CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MUTATIONTRACKINGREJECTEDCOUNT);
      return Promise.resolve(this.buildTrackingSaturatedMutationResult({
        requestKey,
      }));
    }

    const deferred = createDeferredPromise();
    this.pendingReplaceMutationRequestsByKey.set(requestKey, {
      deferred,
      executionFactory,
    });
    this.incrementGatewayMetric(CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MUTATIONREPLACEPENDINGQUEUEDCOUNT);
    this.recordGatewayRetentionSnapshot();
    return deferred.promise;
  }

  /**
   * @param {string|null} tableName
   * @param {Object} [options={}]
   * @return {Object}
   * @private
   */
  evaluateReadPressure(tableName, options = {}) {
    return this.getPressureGovernor().evaluate({
      workClass: options?.workClass || PRESSURE_WORK_CLASS.INTERACTIVE,
      resourceKeys: [
        CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.CONTROL_DASH_PLANE_COLON_READ,
        `control-plane:table:${tableName || CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.UNKNOWN}`,
      ],
      allowDegrade: options?.allowPressureDegrade !== false,
      allowDefer: options?.allowPressureDefer === true,
      retryAfterMs: options?.pressureRetryAfterMs,
    });
  }

  /**
   * @param {string} tableName
   * @param {string} sql
   * @param {Array<*>} params
   * @param {Object} [options={}]
   * @return {string|null}
   * @private
   */
  buildReadRequestKey(tableName, sql, params = [], options = {}) {
    const explicitKey = normalizeCoalescingToken(options?.coalescingKey);
    if (explicitKey) {
      return `control-plane:read:${tableName || CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.UNKNOWN}:${explicitKey}`;
    }
    if (options?.allowCoalescing === false) {
      return null;
    }
    return stableSerialize({
      kind: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.CONTROL_DASH_PLANE_DASH_READ,
      tableName: tableName || null,
      readProfile: options?.readProfile || null,
      strategy: options?.strategy || null,
      sql: sql || null,
      params: Array.isArray(params) ? params : [],
      workClass: options?.workClass || PRESSURE_WORK_CLASS.INTERACTIVE,
      allowPressureDegrade: options?.allowPressureDegrade !== false,
      allowPressureDefer: options?.allowPressureDefer === true,
      phaseScope: normalizePhaseScope(options?.phaseScope),
      localReadConsistency: options?.localReadConsistency || null,
      replicaFallbackConsistency: options?.replicaFallbackConsistency || null,
      preferOwnerRpcRead: options?.preferOwnerRpcRead === true,
      requireOwnerRpcRead: options?.requireOwnerRpcRead === true,
      allowOwnerRpcFallback: options?.allowOwnerRpcFallback !== false,
      routingReadinessDimension:
        options?.routingReadinessDimension ||
        CONTROL_PLANE_READINESS_DIMENSION
          .CONTROL_PLANE_RECOVERY_ELIGIBLE,
    });
  }

  /**
   * @param {string} sql
   * @param {Object} [options={}]
   * @return {Object}
   * @private
   */
  resolveSystemTableQueryDescriptor(sql, options = {}) {
    const tableName = normalizeSystemTableName(
      options?.controlPlaneTableName ||
      options?.tableName ||
      extractSystemTableNameFromSql(sql),
    );
    const operationKind = normalizeSqlOperationKind(
      options?.controlPlaneOperationKind ||
      options?.operationKind ||
      extractSqlOperationKind(sql),
    );
    return {
      tableName,
      operationKind,
      isSystemTable:
        Boolean(tableName) &&
        operationKind !== CONTROL_PLANE_SQL_OPERATION.UNKNOWN,
    };
  }

  /**
   * @param {Object} descriptor
   * @param {string} sql
   * @param {Array<*>} params
   * @param {Object} [options={}]
   * @return {string|null}
   * @private
   */
  buildExecuteQueryKey(descriptor, sql, params = [], options = {}) {
    const explicitKey = normalizeCoalescingToken(options?.coalescingKey);
    if (explicitKey) {
      return `control-plane:query:${descriptor.tableName || CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.UNKNOWN}:` +
        `${descriptor.operationKind}:${explicitKey}`;
    }
    if (options?.allowCoalescing === false) {
      return null;
    }
    if (descriptor.operationKind !== CONTROL_PLANE_SQL_OPERATION.READ) {
      return null;
    }
    return stableSerialize({
      kind: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.CONTROL_DASH_PLANE_DASH_QUERY,
      tableName: descriptor.tableName || null,
      operationKind: descriptor.operationKind,
      sql: sql || null,
      params: Array.isArray(params) ? params : [],
      workClass: options?.workClass || PRESSURE_WORK_CLASS.INTERACTIVE,
      allowPressureDefer: options?.allowPressureDefer === true,
      allowPressureDegrade: options?.allowPressureDegrade === true,
      routingReadinessDimension:
        options?.routingReadinessDimension ||
        CONTROL_PLANE_READINESS_DIMENSION
          .CONTROL_PLANE_RECOVERY_ELIGIBLE,
    });
  }

  /**
   * @param {Object} descriptor
   * @param {Object} [options={}]
   * @return {Object|null}
   * @private
   */
  evaluateExecuteQueryPressure(descriptor, options = {}) {
    if (descriptor?.isSystemTable !== true) {
      return null;
    }
    const shouldEvaluate =
      options?.enforcePressureAdmission === true ||
      options?.allowPressureDefer === true ||
      options?.allowPressureDegrade === true ||
      typeof options?.workClass === TYPEOF.STRING;
    if (!shouldEvaluate) {
      return null;
    }
    const isWrite = descriptor.operationKind === CONTROL_PLANE_SQL_OPERATION.WRITE;
    return this.getPressureGovernor().evaluate({
      workClass:
        options?.workClass ||
        (isWrite ?
          PRESSURE_WORK_CLASS.CRITICAL :
          PRESSURE_WORK_CLASS.INTERACTIVE),
      resourceKeys: [
        `control-plane:${isWrite ? CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.WRITE : CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.READ}`,
        `control-plane:table:${descriptor.tableName || CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.UNKNOWN}`,
      ],
      allowDegrade:
        isWrite ?
          false :
          options?.allowPressureDegrade === true,
      allowDefer: options?.allowPressureDefer === true,
      retryAfterMs: options?.pressureRetryAfterMs,
    });
  }

  /**
   * @private
   */
  assertSqlQueryEngine() {
    const sqlQueryEngine = this.resolveSqlQueryEngine();
    if (!sqlQueryEngine ||
        typeof sqlQueryEngine.executeQuery !== TYPEOF.FUNCTION) {
      throw new Error(GATEWAY_ERROR_MSG.SQL_ENGINE_REQUIRED);
    }
    return sqlQueryEngine;
  }

  /**
   * @private
   */
  assertCdcIntegrationService() {
    const cdcIntegrationService = this.resolveCdcIntegrationService();
    if (!cdcIntegrationService) {
      throw new Error(GATEWAY_ERROR_MSG.CDC_REQUIRED);
    }
    return cdcIntegrationService;
  }

  /**
   * @param {Object} options
   * @return {boolean}
   * @private
   */
  shouldUseSqlMutationFallback(options = {}) {
    if (options?.skipCacheWait !== true) {
      return false;
    }
    const phaseScope = normalizePhaseScope(options?.phaseScope);
    if (!phaseScope) {
      return false;
    }
    return typeof this.resolveSqlQueryEngine()?.executeQuery === TYPEOF.FUNCTION;
  }

  /**
   * @param {Object} mutation
   * @return {{sql: string, params: Array<*>}}
   * @private
   */
  buildSqlMutationPlan(mutation = {}) {
    const operation = normalizeMutationOperation(mutation?.operation);
    const tableName = normalizeSystemTableName(mutation?.tableName);
    if (!operation) {
      throw new Error(GATEWAY_ERROR_MSG.MUTATION_OPERATION_REQUIRED);
    }
    if (!tableName) {
      throw new Error(GATEWAY_ERROR_MSG.MUTATION_TABLE_REQUIRED);
    }

    if (
      operation === CONTROL_PLANE_MUTATION_OPERATION.INSERT ||
      operation === CONTROL_PLANE_MUTATION_OPERATION.UPSERT
    ) {
      if (!mutation?.row || typeof mutation.row !== TYPEOF.OBJECT) {
        throw new Error(GATEWAY_ERROR_MSG.MUTATION_ROW_REQUIRED);
      }
      const rowEntries = Object.entries(mutation.row).filter(([_key, value]) => {
        return typeof value !== TYPEOF.UNDEFINED;
      });
      if (rowEntries.length === NUM.ZERO) {
        throw new Error(GATEWAY_ERROR_MSG.MUTATION_ROW_REQUIRED);
      }
      const columns = rowEntries.map(([key]) => key).join(', ');
      const placeholders = rowEntries.map(() => '?').join(', ');
      return {
        sql:
          `${
            operation === CONTROL_PLANE_MUTATION_OPERATION.UPSERT ?
              SQL.INSERT_OR_REPLACE_INTO :
              SQL.INSERT_INTO
          } ${tableName} (${columns}) ${SQL.VALUES} (${placeholders})`,
        params: rowEntries.map(([_key, value]) => value),
      };
    }

    if (
      !mutation?.whereClause ||
      typeof mutation.whereClause !== TYPEOF.OBJECT
    ) {
      throw new Error(GATEWAY_ERROR_MSG.MUTATION_WHERE_REQUIRED);
    }
    const whereEntries = Object.entries(mutation.whereClause).filter(([_key, value]) => {
      return typeof value !== TYPEOF.UNDEFINED;
    });
    if (whereEntries.length === NUM.ZERO) {
      throw new Error(GATEWAY_ERROR_MSG.MUTATION_WHERE_REQUIRED);
    }
    const whereClause = whereEntries
      .map(([key]) => `${key} = ?`)
      .join(' AND ');

    if (operation === CONTROL_PLANE_MUTATION_OPERATION.DELETE) {
      return {
        sql: `${SQL.DELETE_FROM} ${tableName} ${SQL.WHERE} ${whereClause}`,
        params: whereEntries.map(([_key, value]) => value),
      };
    }

    if (!mutation?.data || typeof mutation.data !== TYPEOF.OBJECT) {
      throw new Error(GATEWAY_ERROR_MSG.MUTATION_DATA_REQUIRED);
    }
    const updateEntries = Object.entries(mutation.data).filter(([_key, value]) => {
      return typeof value !== TYPEOF.UNDEFINED;
    });
    if (updateEntries.length === NUM.ZERO) {
      throw new Error(GATEWAY_ERROR_MSG.MUTATION_DATA_REQUIRED);
    }
    const setClause = updateEntries
      .map(([key]) => `${key} = ?`)
      .join(', ');
    return {
      sql: `${SQL.UPDATE} ${tableName} ${SQL.SET} ${setClause} ${SQL.WHERE} ${whereClause}`,
      params: [
        ...updateEntries.map(([_key, value]) => value),
        ...whereEntries.map(([_key, value]) => value),
      ],
    };
  }

  /**
   * Execute one control-plane mutation through the SQL query engine when the
   * caller explicitly owns visibility gating and startup has not brought the
   * CDC mutation helpers online yet.
   * @param {Object} mutation
   * @param {Object} writeOptions
   * @return {Promise<Object>}
   * @private
   */
  async executeSqlMutationFallback(mutation = {}, writeOptions = {}) {
    const sqlQueryEngine = this.assertSqlQueryEngine();
    const {sql, params} = this.buildSqlMutationPlan(mutation);
    return this.normalizeMutationResult(
      await sqlQueryEngine.executeQuery(sql, params, writeOptions),
    );
  }

  /**
   * @param {string} sql
   * @param {Array<*>} [params=[]]
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async executeQuery(sql, params = [], options = {}) {
    const sqlQueryEngine = this.assertSqlQueryEngine();
    const descriptor = this.resolveSystemTableQueryDescriptor(sql, options);
    const pressureDecision = this.evaluateExecuteQueryPressure(
      descriptor,
      options,
    );
    if (pressureDecision &&
        (pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEFER ||
          pressureDecision.action === PRESSURE_GOVERNOR_ACTION.REJECT ||
          pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEGRADE)) {
      return buildPressureAdmissionFailure(pressureDecision, {
        tableName: descriptor.tableName,
      });
    }
    const queryKey = this.buildExecuteQueryKey(
      descriptor,
      sql,
      params,
      options,
    );
    const result = await this.runSingleFlight(
      this.inFlightQueryRequestsByKey,
      queryKey,
      () => {
        return sqlQueryEngine.executeQuery(
          sql,
          params,
          this.buildQueryOptions(options),
        );
      },
      {
        joinMetricName: 'querySingleFlightJoinCount',
        bypassMetricName: 'queryTrackingBypassCount',
        maxTrackedRequests: this.gatewayLimits.maxTrackedQueryRequests,
      },
    );
    this.recordControlPlaneOperation({
      operationClass: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.QUERY,
      tableName: descriptor.tableName || null,
      sqlOperation: descriptor.sqlOperation || null,
      strategy: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_SOURCE.SQL_QUERY_ENGINE,
      routingReadinessDimension:
        options?.routingReadinessDimension ||
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
      success: result?.success !== false,
      rowCount: Number.isFinite(result?.rowCount) ?
        result.rowCount :
        (Array.isArray(result?.rows) ? result.rows.length : NUM.ZERO),
      error: result?.success === false ? (result?.error || null) : null,
      ...this.buildOperationLedgerDiagnostics(
        descriptor.tableName || null,
        result,
        {
          ...options,
          operationClass: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.QUERY,
        },
      ),
      sessionId:
        typeof options?.sessionId === TYPEOF.STRING ? options.sessionId : null,
    });
    return result;
  }

  /**
   * Canonical authoritative control-plane read ingress.
   * Semantic lifecycle, placement, and owner decisions should use this path
   * instead of relying on read-strategy inference.
   *
   * @param {string} tableName
   * @param {string} sql
   * @param {Array<*>} [params=[]]
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async readAuthoritativeRows(tableName, sql, params = [], options = {}) {
    const strategy = options?.requireAuthoritative === true ?
      CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED :
      CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE;
    return this.executeRead({
      tableName,
      sql,
      params,
      strategy,
    }, options);
  }

  /**
   * Canonical projection control-plane read ingress.
   * Observation, diagnostics, and cache-backed convenience reads should use
   * this path instead of relying on read-strategy inference.
   *
   * @param {string} tableName
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async readProjectionRows(tableName, options = {}) {
    return this.executeRead({
      tableName,
      strategy: CONTROL_PLANE_READ_STRATEGY.CACHE,
      cachePredicate: options?.cachePredicate,
      readFromCache: options?.readFromCache,
    }, options);
  }

  /**
   * @param {string} tableName
   * @param {string} sql
   * @param {Array<*>} [params=[]]
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async readRows(tableName, sql, params = [], options = {}) {
    const readProfile = normalizeReadProfile(
      options?.readProfile || options?.profile,
    );
    const profileStrategy = resolveReadStrategyForProfile(readProfile);
    const cdcIntegrationService = this.resolveCdcIntegrationService();
    const strategy = normalizeReadStrategy(
      options?.strategy ||
      options?.readStrategy ||
      profileStrategy ||
      (
        options?.bootstrapSnapshotRows ||
        typeof options?.readBootstrapSnapshot === TYPEOF.FUNCTION ?
          CONTROL_PLANE_READ_STRATEGY.BOOTSTRAP_SNAPSHOT :
          (
            options?.cachePredicate ||
            typeof options?.readFromCache === TYPEOF.FUNCTION ?
              CONTROL_PLANE_READ_STRATEGY.CACHE :
              (
                options?.requireAuthoritative === true ?
                  CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED :
                  (
                    typeof cdcIntegrationService
                      ?.executeAuthoritativeSystemTableRead === TYPEOF.FUNCTION ?
                      CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE :
                      CONTROL_PLANE_READ_STRATEGY.OWNER_LOCAL_NON_PROPAGATED
                  )
              )
          )
      ),
    );
    return this.executeRead({
      tableName,
      sql,
      params,
      strategy,
      cachePredicate: options?.cachePredicate,
      readFromCache: options?.readFromCache,
      readBootstrapSnapshot: options?.readBootstrapSnapshot,
      bootstrapSnapshotRows: options?.bootstrapSnapshotRows,
      phaseScope: normalizePhaseScope(options?.phaseScope),
    }, {
      ...options,
      readProfile,
    });
  }

  /**
   * Canonical control-plane metadata read ingress.
   * One intent declares one strategy. The gateway executes that strategy only.
   *
   * @param {Object} readIntent
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async executeRead(readIntent = {}, options = {}) {
    const tableName = normalizeSystemTableName(readIntent?.tableName);
    const strategy = normalizeReadStrategy(readIntent?.strategy);
    const sql = readIntent?.sql || null;
    const params = Array.isArray(readIntent?.params) ? readIntent.params : [];
    const profiledOptions = resolveReadProfileOptions(options);
    const mergedOptions = {
      ...profiledOptions,
      strategy,
    };
    const requestKey = this.buildReadRequestKey(
      tableName,
      sql,
      params,
      mergedOptions,
    );
    const telemetryContext = {
      startedAtMs: this.now(),
      owner: readIntent?.owner || options?.owner || null,
      tableName,
      strategy,
      readProfile: mergedOptions?.readProfile || null,
      workClass: mergedOptions?.workClass || PRESSURE_WORK_CLASS.INTERACTIVE,
      coalescingKey: normalizeCoalescingToken(mergedOptions?.coalescingKey),
    };
    try {
      const result = await this.runSingleFlight(
        this.inFlightReadRequestsByKey,
        requestKey,
        async () => {
          const pressureDecision = this.evaluateReadPressure(tableName, mergedOptions);
          if (pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEFER ||
              pressureDecision.action === PRESSURE_GOVERNOR_ACTION.REJECT ||
              pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEGRADE) {
            const failure = buildPressureAdmissionFailure(pressureDecision, {
              tableName,
            });
            return {
              ...failure,
              outcome:
                pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEFER ?
                  CONTROL_PLANE_READ_OUTCOME.DEFERRED :
                  CONTROL_PLANE_READ_OUTCOME.REJECTED,
              strategyUsed: strategy,
            };
          }

          switch (strategy) {
            case CONTROL_PLANE_READ_STRATEGY.CACHE:
              return this.executeCacheRead(tableName, readIntent, mergedOptions);
            case CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE:
            case CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED:
              return this.executeAuthoritativeRead(
                tableName,
                sql,
                params,
                strategy,
                mergedOptions,
              );
            case CONTROL_PLANE_READ_STRATEGY.OWNER_LOCAL_NON_PROPAGATED:
              return this.executeOwnerLocalRead(tableName, sql, params, mergedOptions);
            case CONTROL_PLANE_READ_STRATEGY.BOOTSTRAP_SNAPSHOT:
              return this.executeBootstrapSnapshotRead(
                tableName,
                readIntent,
                mergedOptions,
              );
            default:
              return {
                success: false,
                error: 'unsupported_control_plane_read_strategy',
                tableName,
                rows: [],
                outcome: CONTROL_PLANE_READ_OUTCOME.OWNER_NOT_READY,
                strategyUsed: null,
              };
          }
        },
        {
          joinMetricName: 'readSingleFlightJoinCount',
          bypassMetricName: 'readTrackingBypassCount',
          maxTrackedRequests: this.gatewayLimits.maxTrackedReadRequests,
        },
      );
      this.recordControlPlaneOperation({
        operationClass: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.READ,
        tableName,
        strategy,
        routingReadinessDimension:
          mergedOptions?.routingReadinessDimension ||
          CONTROL_PLANE_READINESS_DIMENSION
            .CONTROL_PLANE_RECOVERY_ELIGIBLE,
        outcome: result?.outcome || null,
        success: result?.success === true,
        rowCount: Number.isFinite(result?.rowCount) ?
          result.rowCount :
          (Array.isArray(result?.rows) ? result.rows.length : NUM.ZERO),
        source: result?.source || null,
        usedSqlFallback: result?.usedSqlFallback === true,
        error: result?.success === true ? null : (result?.error || null),
        ...this.buildOperationLedgerDiagnostics(tableName, result, mergedOptions),
      });
      this.recordReadTelemetry(telemetryContext, result);
      return result;
    } catch (error) {
      this.recordControlPlaneOperation({
        operationClass: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.READ,
        tableName,
        strategy,
        routingReadinessDimension:
          mergedOptions?.routingReadinessDimension ||
          CONTROL_PLANE_READINESS_DIMENSION
            .CONTROL_PLANE_RECOVERY_ELIGIBLE,
        outcome: error?.outcome || CONTROL_PLANE_READ_OUTCOME.OWNER_NOT_READY,
        success: false,
        rowCount: NUM.ZERO,
        error: error?.message || String(error),
        ...this.buildOperationLedgerDiagnostics(tableName, error, mergedOptions),
      });
      this.recordReadTelemetry(telemetryContext, {
        success: false,
        outcome: error?.outcome || CONTROL_PLANE_READ_OUTCOME.OWNER_NOT_READY,
        rowCount: NUM.ZERO,
      });
      throw error;
    }
  }

  /**
   * @param {string} tableName
   * @param {Object} row
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async insertSystemTableRow(tableName, row, options = {}) {
    return this.submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.INSERT,
      tableName,
      row,
    }, options);
  }

  /**
   * @param {string} tableName
   * @param {Object} whereClause
   * @param {Object} data
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async updateSystemTableRow(tableName, whereClause, data, options = {}) {
    return this.submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
      tableName,
      whereClause,
      data,
    }, options);
  }

  /**
   * @param {string} tableName
   * @param {Object} row
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async upsertSystemTableRow(tableName, row, options = {}) {
    return this.submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPSERT,
      tableName,
      row,
    }, options);
  }

  /**
   * @param {string} tableName
   * @param {Object} whereClause
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async deleteSystemTableRow(tableName, whereClause, options = {}) {
    return this.submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.DELETE,
      tableName,
      whereClause,
    }, options);
  }

  /**
   * Canonical control-plane mutation ingress for system-table writes.
   * Legacy insert/update/upsert/delete helpers delegate here so write
   * admission, routing, and backpressure policy stay on one path.
   *
   * @param {Object} mutation
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async submitMutation(mutation = {}, options = {}) {
    const operation = normalizeMutationOperation(mutation?.operation);
    const tableName = normalizeSystemTableName(mutation?.tableName);
    if (!operation) {
      throw new Error(GATEWAY_ERROR_MSG.MUTATION_OPERATION_REQUIRED);
    }
    if (!tableName) {
      throw new Error(GATEWAY_ERROR_MSG.MUTATION_TABLE_REQUIRED);
    }
    const normalizedMutation = {
      ...mutation,
      operation,
      tableName,
      row:
        operation === CONTROL_PLANE_MUTATION_OPERATION.INSERT ||
          operation === CONTROL_PLANE_MUTATION_OPERATION.UPSERT ?
          canonicalizeSystemTableRow(tableName, mutation?.row) :
          mutation?.row,
    };
    const writeOptions = this.buildWriteOptions(options);
    const cdcIntegrationService = this.resolveCdcIntegrationService();
    const {requestKey, mergePolicy} = this.buildMutationCoalescingDescriptor(
      normalizedMutation,
      writeOptions,
    );
    const telemetryContext = {
      startedAtMs: this.now(),
      owner: mutation?.owner || options?.owner || null,
      tableName,
      operation,
      workClass: writeOptions?.workClass || null,
      coalescingKey: normalizeCoalescingToken(writeOptions?.coalescingKey),
      mergePolicy,
    };
    const executionFactory = async () => {
      if (!cdcIntegrationService) {
        if (this.shouldUseSqlMutationFallback(writeOptions)) {
          return this.executeSqlMutationFallback(
            normalizedMutation,
            writeOptions,
          );
        }
        throw new Error(GATEWAY_ERROR_MSG.CDC_REQUIRED);
      }
      if (operation === CONTROL_PLANE_MUTATION_OPERATION.INSERT) {
        if (!normalizedMutation?.row ||
            typeof normalizedMutation.row !== TYPEOF.OBJECT) {
          throw new Error(GATEWAY_ERROR_MSG.MUTATION_ROW_REQUIRED);
        }
        return this.normalizeMutationResult(await cdcIntegrationService.insertSystemTableRow(
          tableName,
          normalizedMutation.row,
          writeOptions,
        ));
      }
      if (operation === CONTROL_PLANE_MUTATION_OPERATION.UPDATE) {
        if (!normalizedMutation?.whereClause ||
            typeof normalizedMutation.whereClause !== TYPEOF.OBJECT) {
          throw new Error(GATEWAY_ERROR_MSG.MUTATION_WHERE_REQUIRED);
        }
        if (!normalizedMutation?.data ||
            typeof normalizedMutation.data !== TYPEOF.OBJECT) {
          throw new Error(GATEWAY_ERROR_MSG.MUTATION_DATA_REQUIRED);
        }
        return this.normalizeMutationResult(await cdcIntegrationService.updateSystemTableRow(
          tableName,
          normalizedMutation.whereClause,
          normalizedMutation.data,
          writeOptions,
        ));
      }
      if (operation === CONTROL_PLANE_MUTATION_OPERATION.UPSERT) {
        if (!normalizedMutation?.row ||
            typeof normalizedMutation.row !== TYPEOF.OBJECT) {
          throw new Error(GATEWAY_ERROR_MSG.MUTATION_ROW_REQUIRED);
        }
        return this.normalizeMutationResult(await cdcIntegrationService.upsertSystemTableRow(
          tableName,
          normalizedMutation.row,
          writeOptions,
        ));
      }
      if (!normalizedMutation?.whereClause ||
          typeof normalizedMutation.whereClause !== TYPEOF.OBJECT) {
        throw new Error(GATEWAY_ERROR_MSG.MUTATION_WHERE_REQUIRED);
      }
      return this.normalizeMutationResult(await cdcIntegrationService.deleteSystemTableRow(
        tableName,
        normalizedMutation.whereClause,
        writeOptions,
      ));
    };

    if (mergePolicy === CONTROL_PLANE_MUTATION_MERGE_POLICY.REPLACE_PENDING &&
        requestKey) {
      const result = await this.runReplacePendingMutation(requestKey, executionFactory);
      this.recordMutationTelemetry(telemetryContext, result);
      return result;
    }

      if (mergePolicy === CONTROL_PLANE_MUTATION_MERGE_POLICY.SINGLE_FLIGHT &&
        requestKey) {
      try {
        const result = await this.runSingleFlight(
          this.inFlightMutationRequestsByKey,
          requestKey,
          executionFactory,
          {
            joinMetricName: 'mutationSingleFlightJoinCount',
            maxTrackedRequests: this.gatewayLimits.maxTrackedMutationRequests,
          },
        );
        this.recordControlPlaneOperation({
          operationClass: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MUTATION,
          tableName,
          mutationOperation: operation,
          routingReadinessDimension:
            writeOptions?.routingReadinessDimension ||
            CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE,
          outcome: result?.outcome || null,
          success: result?.success !== false,
          affectedRows: Number(
            result?.partitionResult?.affectedRows ?? result?.affectedRows ??
            NUM.ZERO,
          ),
          error: result?.success === false ? (result?.error || null) : null,
          ...this.buildOperationLedgerDiagnostics(tableName, result, {
            ...writeOptions,
            operationClass: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MUTATION,
          }),
        });
        this.recordMutationTelemetry(telemetryContext, result);
        return result;
      } catch (error) {
        this.recordControlPlaneOperation({
          operationClass: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MUTATION,
          tableName,
          mutationOperation: operation,
          routingReadinessDimension:
            writeOptions?.routingReadinessDimension ||
            CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE,
          outcome:
            error?.outcome || CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY,
          success: false,
          affectedRows: NUM.ZERO,
          error: error?.message || String(error),
          ...this.buildOperationLedgerDiagnostics(tableName, error, {
            ...writeOptions,
            operationClass: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MUTATION,
          }),
        });
        this.recordMutationTelemetry(telemetryContext, {
          success: false,
          outcome:
            error?.outcome || CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY,
        });
        throw error;
      }
    }

    try {
      const result = await executionFactory();
      this.recordControlPlaneOperation({
        operationClass: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MUTATION,
        tableName,
        mutationOperation: operation,
        routingReadinessDimension:
          writeOptions?.routingReadinessDimension ||
          CONTROL_PLANE_READINESS_DIMENSION
            .CONTROL_PLANE_RECOVERY_ELIGIBLE,
        outcome: result?.outcome || null,
        success: result?.success !== false,
        affectedRows: Number(
          result?.partitionResult?.affectedRows ?? result?.affectedRows ??
          NUM.ZERO,
        ),
        error: result?.success === false ? (result?.error || null) : null,
        ...this.buildOperationLedgerDiagnostics(tableName, result, {
          ...writeOptions,
          operationClass: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MUTATION,
        }),
      });
      this.recordMutationTelemetry(telemetryContext, result);
      return result;
    } catch (error) {
      this.recordControlPlaneOperation({
        operationClass: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MUTATION,
        tableName,
        mutationOperation: operation,
        routingReadinessDimension:
          writeOptions?.routingReadinessDimension ||
          CONTROL_PLANE_READINESS_DIMENSION
            .CONTROL_PLANE_RECOVERY_ELIGIBLE,
        outcome:
          error?.outcome || CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY,
        success: false,
        affectedRows: NUM.ZERO,
        error: error?.message || String(error),
        ...this.buildOperationLedgerDiagnostics(tableName, error, {
          ...writeOptions,
          operationClass: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MUTATION,
        }),
      });
      this.recordMutationTelemetry(telemetryContext, {
        success: false,
        outcome:
          error?.outcome || CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY,
      });
      throw error;
    }
  }

  /**
   * @param {string} tableName
   * @param {Object} readIntent
   * @param {Object} options
   * @return {Promise<Object>}
   * @private
   */
  async executeCacheRead(tableName, readIntent, options) {
    const systemTableCache = this.resolveSystemTableCache();
    const readFromCache = typeof readIntent?.readFromCache === TYPEOF.FUNCTION ?
      readIntent.readFromCache :
      null;
    const cachePredicate = typeof readIntent?.cachePredicate === TYPEOF.FUNCTION ?
      readIntent.cachePredicate :
      null;
    if (!systemTableCache && !readFromCache) {
      return {
        success: false,
        tableName,
        rows: [],
        outcome: CONTROL_PLANE_READ_OUTCOME.OWNER_NOT_READY,
        strategyUsed: CONTROL_PLANE_READ_STRATEGY.CACHE,
        error: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.SYSTEM_TABLE_CACHE_UNAVAILABLE,
      };
    }

    let rows = [];
    if (readFromCache) {
      const cacheRows = await readFromCache(systemTableCache, readIntent, options);
      rows = Array.isArray(cacheRows) ? cacheRows : [];
    } else if (cachePredicate && typeof systemTableCache?.filter === TYPEOF.FUNCTION) {
      rows = systemTableCache.filter(tableName, cachePredicate) || [];
    } else if (typeof systemTableCache?.getAll === TYPEOF.FUNCTION) {
      rows = systemTableCache.getAll(tableName) || [];
    }

    return {
      success: true,
      tableName,
      rows,
      rowCount: rows.length,
      outcome: CONTROL_PLANE_READ_OUTCOME.CACHE_HIT,
      strategyUsed: CONTROL_PLANE_READ_STRATEGY.CACHE,
    };
  }

  /**
   * @param {string} tableName
   * @param {string|null} sql
   * @param {Array<*>} params
   * @param {string} strategy
   * @param {Object} options
   * @return {Promise<Object>}
   * @private
   */
  buildGatewayReadResult(
    baseResult,
    tableName,
    strategyUsed,
    outcome,
    extra = {},
  ) {
    return {
      ...baseResult,
      tableName,
      rows: Array.isArray(baseResult?.rows) ?
        baseResult.rows :
        [],
      outcome,
      strategyUsed,
      ...extra,
    };
  }

  /**
   * @param {string} tableName
   * @param {string} strategyUsed
   * @param {string} outcome
   * @param {string} error
   * @return {Object}
   * @private
   */
  buildUnavailableGatewayReadResult(
    tableName,
    strategyUsed,
    outcome,
    error,
  ) {
    return {
      success: false,
      tableName,
      rows: [],
      outcome,
      strategyUsed,
      error,
    };
  }

  /**
   * @param {string} strategy
   * @return {string}
   * @private
   */
  resolveAuthoritativeReadFailureOutcome(strategy) {
    return strategy === CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED ?
      CONTROL_PLANE_READ_OUTCOME.STALE_NOT_ALLOWED :
      CONTROL_PLANE_READ_OUTCOME.OWNER_NOT_READY;
  }

  /**
   * @param {Object} result
   * @return {{outcome: string, completionState: string}}
   * @private
   */
  resolveNormalizedMutationState(result) {
    const affectedRows = Number(
      result?.partitionResult?.affectedRows ?? result?.affectedRows,
    );
    if (result?.outcome) {
      return {
        outcome: result.outcome,
        completionState: resolveMutationCompletionState(result),
      };
    } else if (result?.success === false) {
      return {
        outcome:
          result?.pressureAction === PRESSURE_GOVERNOR_ACTION.DEFER ?
            CONTROL_PLANE_MUTATION_OUTCOME.DEFERRED :
            (
              result?.pressureAction === PRESSURE_GOVERNOR_ACTION.REJECT ?
                CONTROL_PLANE_MUTATION_OUTCOME.REJECTED :
                CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY
            ),
        completionState: resolveMutationCompletionState(result),
      };
    } else if (typeof result?.visibilityState === TYPEOF.STRING &&
        result.visibilityState !== CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.VISIBLE) {
      return {
        outcome: CONTROL_PLANE_MUTATION_OUTCOME.PENDING_VISIBILITY,
        completionState:
          CONTROL_PLANE_MUTATION_OUTCOME.PENDING_VISIBILITY,
      };
    } else if (Number.isFinite(affectedRows) &&
        affectedRows <= NUM.ZERO) {
      return {
        outcome: CONTROL_PLANE_MUTATION_OUTCOME.OBSERVED_STATE_CHANGED,
        completionState:
          CONTROL_PLANE_MUTATION_OUTCOME.OBSERVED_STATE_CHANGED,
      };
    }
    return {
      outcome: CONTROL_PLANE_MUTATION_OUTCOME.APPLIED,
      completionState: CONTROL_PLANE_MUTATION_OUTCOME.APPLIED,
    };
  }

  /**
   * @param {string} tableName
   * @param {Array<Object>} rows
   * @return {Object}
   * @private
   */
  buildBootstrapSnapshotSuccessResult(tableName, rows) {
    return {
      success: true,
      tableName,
      rows,
      rowCount: rows.length,
      outcome: CONTROL_PLANE_READ_OUTCOME.BOOTSTRAP_SNAPSHOT,
      strategyUsed: CONTROL_PLANE_READ_STRATEGY.BOOTSTRAP_SNAPSHOT,
    };
  }

  /**
   * @param {string} tableName
   * @param {string} error
   * @return {Object}
   * @private
   */
  buildBootstrapSnapshotFailureResult(tableName, error) {
    return this.buildUnavailableGatewayReadResult(
      tableName,
      CONTROL_PLANE_READ_STRATEGY.BOOTSTRAP_SNAPSHOT,
      CONTROL_PLANE_READ_OUTCOME.OWNER_NOT_READY,
      error,
    );
  }

  /**
   * @param {string} tableName
   * @param {string|null} sql
   * @param {Array<*>} params
   * @param {string} strategy
   * @param {Object} options
   * @return {Promise<Object>}
   * @private
   */
  async executeAuthoritativeRead(tableName, sql, params, strategy, options) {
    const cdcIntegrationService = this.resolveCdcIntegrationService();
    const allowSqlFallback = options?.allowSqlFallback === true;
    if (typeof cdcIntegrationService?.executeAuthoritativeSystemTableRead !==
      TYPEOF.FUNCTION) {
      if (allowSqlFallback &&
          strategy !== CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED) {
        const sqlQueryEngine = this.resolveSqlQueryEngine();
        if (typeof sqlQueryEngine?.executeQuery === TYPEOF.FUNCTION) {
          const result = await sqlQueryEngine.executeQuery(
            sql,
            params,
            this.buildQueryOptions(options),
          );
          return this.buildGatewayReadResult(
            result,
            tableName,
            strategy,
            result?.success === true ?
              CONTROL_PLANE_READ_OUTCOME.AUTHORITATIVE :
              CONTROL_PLANE_READ_OUTCOME.OWNER_NOT_READY,
            {
              source:
                CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_SOURCE.SQL_QUERY_ENGINE,
              usedSqlFallback: true,
            },
          );
        }
      }
      return this.buildUnavailableGatewayReadResult(
        tableName,
        strategy,
        this.resolveAuthoritativeReadFailureOutcome(strategy),
        CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_ERROR
          .AUTHORITATIVE_READ_OWNER_UNAVAILABLE,
      );
    }

    const authoritativeResult =
      await cdcIntegrationService.executeAuthoritativeSystemTableRead(
        tableName,
        sql,
        params,
        {
          localReadConsistency:
            options?.localReadConsistency ||
            CONTROL_PLANE_LOCAL_READ_CONSISTENCY,
          replicaFallbackConsistency:
            options?.replicaFallbackConsistency ||
            CONTROL_PLANE_REPLICA_FALLBACK_CONSISTENCY,
          preferOwnerRpcRead: options?.preferOwnerRpcRead === true,
          requireOwnerRpcRead: options?.requireOwnerRpcRead === true,
          allowOwnerRpcFallback: options?.allowOwnerRpcFallback,
          allowSqlFallback: options?.allowSqlFallback === true,
          queryOptions: this.buildQueryOptions(options),
        },
      );

    return this.buildGatewayReadResult(
      authoritativeResult,
      tableName,
      strategy,
      authoritativeResult?.success === true ?
        CONTROL_PLANE_READ_OUTCOME.AUTHORITATIVE :
        this.resolveAuthoritativeReadFailureOutcome(strategy),
    );
  }

  /**
   * @param {string} tableName
   * @param {string|null} sql
   * @param {Array<*>} params
   * @param {Object} options
   * @return {Promise<Object>}
   * @private
   */
  async executeOwnerLocalRead(tableName, sql, params, options) {
    const cdcIntegrationService = this.resolveCdcIntegrationService();
    if (typeof cdcIntegrationService?.executeAuthoritativeSystemTableRead ===
        TYPEOF.FUNCTION) {
      const authoritativeResult =
        await cdcIntegrationService.executeAuthoritativeSystemTableRead(
          tableName,
          sql,
          params,
          {
            localReadConsistency:
              options?.localReadConsistency ||
              CONTROL_PLANE_LOCAL_READ_CONSISTENCY,
            replicaFallbackConsistency:
              options?.replicaFallbackConsistency ||
              CONTROL_PLANE_REPLICA_FALLBACK_CONSISTENCY,
            preferOwnerRpcRead: options?.preferOwnerRpcRead === true,
            requireOwnerRpcRead: options?.requireOwnerRpcRead === true,
            allowOwnerRpcFallback: options?.allowOwnerRpcFallback,
            allowSqlFallback: options?.allowSqlFallback === true,
            queryOptions: this.buildQueryOptions(options),
          },
        );
      return this.buildGatewayReadResult(
        authoritativeResult,
        tableName,
        CONTROL_PLANE_READ_STRATEGY.OWNER_LOCAL_NON_PROPAGATED,
        authoritativeResult?.success === true ?
          CONTROL_PLANE_READ_OUTCOME.OWNER_LOCAL_NON_PROPAGATED :
          CONTROL_PLANE_READ_OUTCOME.OWNER_NOT_READY,
        {
          rowCount: Number.isFinite(authoritativeResult?.rowCount) ?
            authoritativeResult.rowCount :
            (
              Array.isArray(authoritativeResult?.rows) ?
                authoritativeResult.rows.length :
                NUM.ZERO
            ),
        },
      );
    }
    const sqlQueryEngine = this.resolveSqlQueryEngine();
    if (typeof sqlQueryEngine?.executeQuery !== TYPEOF.FUNCTION) {
      return this.buildUnavailableGatewayReadResult(
        tableName,
        CONTROL_PLANE_READ_STRATEGY.OWNER_LOCAL_NON_PROPAGATED,
        CONTROL_PLANE_READ_OUTCOME.OWNER_NOT_READY,
        CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_ERROR
          .SQL_QUERY_ENGINE_UNAVAILABLE,
      );
    }
    const result = await sqlQueryEngine.executeQuery(
      sql,
      params,
      this.buildQueryOptions(options),
    );
    return this.buildGatewayReadResult(
      result,
      tableName,
      CONTROL_PLANE_READ_STRATEGY.OWNER_LOCAL_NON_PROPAGATED,
      result?.success === false ?
        CONTROL_PLANE_READ_OUTCOME.OWNER_NOT_READY :
        CONTROL_PLANE_READ_OUTCOME.OWNER_LOCAL_NON_PROPAGATED,
    );
  }

  /**
   * @param {string} tableName
   * @param {Object} readIntent
   * @param {Object} options
   * @return {Promise<Object>}
   * @private
   */
  async executeBootstrapSnapshotRead(tableName, readIntent, options) {
    const phaseScope = normalizePhaseScope(
      readIntent?.phaseScope || options?.phaseScope,
    );
    if (!phaseScope) {
      return this.buildBootstrapSnapshotFailureResult(
        tableName,
        CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_ERROR
          .BOOTSTRAP_SNAPSHOT_PHASE_SCOPE_REQUIRED,
      );
    } else if (typeof readIntent?.readBootstrapSnapshot === TYPEOF.FUNCTION) {
      const rows = await readIntent.readBootstrapSnapshot(readIntent, options);
      return this.buildBootstrapSnapshotSuccessResult(
        tableName,
        Array.isArray(rows) ? rows : [],
      );
    } else if (!Array.isArray(readIntent?.bootstrapSnapshotRows)) {
      return this.buildBootstrapSnapshotFailureResult(
        tableName,
        CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_ERROR
          .BOOTSTRAP_SNAPSHOT_UNAVAILABLE,
      );
    }
    return this.buildBootstrapSnapshotSuccessResult(
      tableName,
      readIntent.bootstrapSnapshotRows,
    );
  }

  /**
   * @param {Object} result
   * @return {Object}
   * @private
   */
  normalizeMutationResult(result) {
    const normalizedState =
      this.resolveNormalizedMutationState(result);
    return {
      ...result,
      outcome: normalizedState.outcome,
      completionState: normalizedState.completionState,
    };
  }
}

async function readAuthoritativeControlPlaneRows(
  gateway,
  tableName,
  sql,
  params = [],
  options = {},
) {
  if (gateway && typeof gateway.readAuthoritativeRows === TYPEOF.FUNCTION) {
    return gateway.readAuthoritativeRows(tableName, sql, params, options);
  }
  if (gateway && typeof gateway.executeRead === TYPEOF.FUNCTION) {
    return gateway.executeRead({
      tableName,
      sql,
      params,
      strategy: options?.requireAuthoritative === true ?
        CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED :
        CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE,
    }, options);
  }
  return gateway.readRows(tableName, sql, params, options);
}

async function readProjectionControlPlaneRows(gateway, tableName, options = {}) {
  if (gateway && typeof gateway.readProjectionRows === TYPEOF.FUNCTION) {
    return gateway.readProjectionRows(tableName, options);
  }
  if (gateway && typeof gateway.executeRead === TYPEOF.FUNCTION) {
    return gateway.executeRead({
      tableName,
      strategy: CONTROL_PLANE_READ_STRATEGY.CACHE,
      cachePredicate: options?.cachePredicate,
      readFromCache: options?.readFromCache,
    }, options);
  }
  return gateway.readRows(tableName, options?.sql || null, options?.params || [], options);
}

export {
  CONTROL_PLANE_PHASE_SCOPE,
  CONTROL_PLANE_LOCAL_READ_CONSISTENCY,
  CONTROL_PLANE_MUTATION_MERGE_POLICY,
  CONTROL_PLANE_MUTATION_OPERATION,
  CONTROL_PLANE_MUTATION_OUTCOME,
  CONTROL_PLANE_READ_PROFILE,
  CONTROL_PLANE_READ_OUTCOME,
  CONTROL_PLANE_READ_STRATEGY,
  CONTROL_PLANE_REPLICA_FALLBACK_CONSISTENCY,
  ControlPlaneSystemTableGateway,
  readAuthoritativeControlPlaneRows,
  readProjectionControlPlaneRows,
  resolveReadProfileOptions,
};
