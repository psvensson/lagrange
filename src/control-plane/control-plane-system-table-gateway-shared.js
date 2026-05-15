import {CONTROL_PLANE_READINESS_DIMENSION} from './control-plane-readiness-constants.js';
import {
  buildPressureAdmissionFailure,
  PRESSURE_GOVERNOR_ACTION,
  PRESSURE_WORK_CLASS,
  PressureGovernor,
} from './pressure-governor.js';
import {ControlPlaneDiagnosticsLedger} from './control-plane-diagnostics-ledger.js';
import {
  buildControlPlaneQueryOptions,
  getRemainingBudgetMs,
} from './timeout-budget.js';
import {CONTROL_PLANE_CACHE_RECONCILE_INTENT} from './control-plane-cache-reconcile-constants.js';
import {
  buildLocalControlPlaneMutationReadinessFailure,
  getLocalControlPlaneMutationReadinessBlocker,
  requiresStableLocalControlPlaneMutationReadiness,
} from './control-plane-mutation-readiness.js';
import {
  CANONICAL_LEADER_ROUTING_GAP_STATE,
  resolveCanonicalLeaderIdentitySnapshot,
  resolveCanonicalLeaderRoutingGapState,
} from '../query/canonical-leader-routing.js';
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
import {getSystemCachePrimaryKeyFieldOrFallback} from '../cache/system-cache-key-descriptor.js';
import {canonicalizeSystemTableRow} from './system-row-normalizers.js';
import {
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
  buildOwnerContractOutcome,
} from './owner-contract-outcome.js';
import {buildControlPlaneWorkloadProfile} from './control-plane-workload-profile.js';
import {
  CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE,
  normalizeControlPlaneSystemTableVisibilityState,
} from './control-plane-system-table-visibility-constants.js';
import {
  getControlPlaneErrorCode,
  getControlPlaneFailureSummary,
  getControlPlaneRetryAfterMs,
} from './control-plane-error-classification.js';
const CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL = Object.freeze({
  ACTIVE: 'active',
  ALLOWCOALESCING: 'allowCoalescing',
  ALLOWPENDINGVISIBILITY: 'allowPendingVisibility',
  ALLOWPRESSUREDEFER: 'allowPressureDefer',
  ALLOWPRESSUREDEGRADE: 'allowPressureDegrade',
  ALLOWSQLFALLBACK: 'allowSqlFallback',
  AUTHORITATIVEREADMODE: 'authoritativeReadMode',
  CANCELLATIONTOKEN: 'cancellationToken',
  COALESCINGKEY: 'coalescingKey',
  CONTROL_DASH_PLANE_COLON_READ: 'control-plane:read',
  CONTROL_DASH_PLANE_COLON_WRITE: 'control-plane:write',
  CONTROL_DASH_PLANE_DASH_MUTATION: 'control-plane-mutation',
  CONTROL_DASH_PLANE_DASH_QUERY: 'control-plane-query',
  CONTROL_DASH_PLANE_DASH_READ: 'control-plane-read',
  CONTROL_PLANE_MUTATION_TRACKING_SATURATED:
    'control_plane_mutation_tracking_saturated',
  CRITICAL: 'critical',
  DELETE: 'delete',
  DELIVERY_SOURCE_SEPARATOR: ':',
  DELIVERYSOURCE: 'deliverySource',
  DELIVERYPRIORITY: 'deliveryPriority',
  DISABLESYSTEMWRITESESSION: 'disableSystemWriteSession',
  EXPECTEDCACHEFIELDS: 'expectedCacheFields',
  FALLBACKPHASE: 'fallbackPhase',
  IGNOREEXISTING: 'ignoreExisting',
  INSERT: 'insert',
  LOCAL_PARTITION_REPLICA: 'local_partition_replica',
  MAXOBSERVEDMUTATIONLATENCYMS: 'maxObservedMutationLatencyMs',
  MAXOBSERVEDREADLATENCYMS: 'maxObservedReadLatencyMs',
  MERGEPOLICY: 'mergePolicy',
  MINIMUMCACHEFIELDS: 'minimumCacheFields',
  MUTATION: 'mutation',
  MUTATIONOUTCOMECOUNTS: 'mutationOutcomeCounts',
  MUTATIONREPLACEPENDINGQUEUEDCOUNT: 'mutationReplacePendingQueuedCount',
  MUTATIONREPLACEPENDINGSUPERSEDEDCOUNT:
    'mutationReplacePendingSupersededCount',
  MUTATIONTRACKINGREJECTEDCOUNT: 'mutationTrackingRejectedCount',
  ONE: 1,
  OWNER_RPC_LANE: 'owner_rpc_lane',
  PARTITION: 'partition',
  PHASESCOPE: 'phaseScope',
  PREFERAUTHORITATIVEREAD: 'preferAuthoritativeRead',
  PREFEROWNERRPCREAD: 'preferOwnerRpcRead',
  PRESSURERETRYAFTERMS: 'pressureRetryAfterMs',
  QUERY: 'query',
  READ: 'read',
  READOUTCOMECOUNTS: 'readOutcomeCounts',
  RECOVERYCANDIDATESELECTIONKEY: 'recoveryCandidateSelectionKey',
  REPLACEPENDINGKEY: 'replacePendingKey',
  REQUIREAUTHORITATIVE: 'requireAuthoritative',
  REQUIREOWNERRPCREAD: 'requireOwnerRpcRead',
  RESOURCEKEYS: 'resourceKeys',
  ROUTER_QUERY_TRANSPORT_NOT_READY: 'ROUTER_QUERY_TRANSPORT_NOT_READY',
  ROUTINGREADINESSDIMENSION: 'routingReadinessDimension',
  SELECT: 'select',
  SESSIONID: 'sessionId',
  SKIPCACHEWAIT: 'skipCacheWait',
  SYSTEM_TABLE_CACHE_UNAVAILABLE: 'system_table_cache_unavailable',
  TIMEOUTBUDGET: 'timeoutBudget',
  UNKNOWN: 'unknown',
  UPDATE: 'update',
  VISIBLE: 'visible',
  WORKCLASS: 'workClass',
  WORKLOADCLASS: 'workloadClass',
  WRITE: 'write',
  ZERO: 0,
});

const CONTROL_PLANE_LOCAL_READ_CONSISTENCY = 'local_leader';
const CONTROL_PLANE_REPLICA_FALLBACK_CONSISTENCY = 'any_replica';
const CONTROL_PLANE_ROUTING_SNAPSHOT_FIELD = Object.freeze({
  CANONICAL_LEADER_IDENTITY_STATE: 'canonicalLeaderIdentityState',
  CANONICAL_LEADER_NODE_ID: 'canonicalLeaderNodeId',
  CANONICAL_LEADER_ROUTING_GAP_STATE: 'canonicalLeaderRoutingGapState',
});

const CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_ERROR = Object.freeze({
  AUTHORITATIVE_READ_OWNER_UNAVAILABLE: 'authoritative_read_owner_unavailable',
  BOOTSTRAP_SNAPSHOT_PHASE_SCOPE_REQUIRED:
    'bootstrap_snapshot_phase_scope_required',
  BOOTSTRAP_SNAPSHOT_UNAVAILABLE: 'bootstrap_snapshot_unavailable',
  SQL_QUERY_ENGINE_UNAVAILABLE: 'sql_query_engine_unavailable',
});

const CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_SOURCE = Object.freeze({
  SQL_QUERY_ENGINE: 'sql_query_engine',
});
const CONTROL_PLANE_MUTATION_QUEUE_STATE = Object.freeze({
  DIRECT: 'direct',
  PENDING_REPLACE: 'pending_replace',
});
const CONTROL_PLANE_DEFERRED_MUTATION_FAILURE_SENTINEL = Object.freeze({
  state: 'deferred_mutation_failure_consumed',
});
const CONTROL_PLANE_CACHE_RECONCILE_DELETE_POLICY = Object.freeze({
  PRESERVE_MISSING: false,
  DELETE_MISSING: true,
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
const CONTROL_PLANE_AUTHORITATIVE_READ_MODE = Object.freeze({
  OWNER_LOCAL_ONLY: 'owner_local_only',
  OWNER_LOCAL_CONFIRM_EMPTY_WITH_OWNER_RPC:
    'owner_local_confirm_empty_with_owner_rpc',
  OWNER_RPC_PREFERRED: 'owner_rpc_preferred',
  OWNER_RPC_PREFERRED_SQL_FALLBACK: 'owner_rpc_preferred_sql_fallback',
  OWNER_RPC_REQUIRED: 'owner_rpc_required',
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
const CONTROL_PLANE_WRITE_OPERATION_KINDS = new Set([
  CONTROL_PLANE_SQL_OPERATION.WRITE,
  CONTROL_PLANE_MUTATION_OPERATION.INSERT,
  CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
  CONTROL_PLANE_MUTATION_OPERATION.UPSERT,
  CONTROL_PLANE_MUTATION_OPERATION.DELETE,
  CDC_OPERATION.INSERT,
  CDC_OPERATION.UPDATE,
  CDC_OPERATION.UPSERT,
  CDC_OPERATION.DELETE,
]);
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
  CDC_REQUIRED: 'ControlPlaneSystemTableGateway requires cdcIntegrationService',
  SQL_ENGINE_REQUIRED: 'ControlPlaneSystemTableGateway requires sqlQueryEngine',
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

function areCanonicalSystemTableRowsEqual(tableName, left, right) {
  if (
    !left ||
    !right ||
    typeof left !== TYPEOF.OBJECT ||
    typeof right !== TYPEOF.OBJECT
  ) {
    return false;
  }
  const canonicalLeft = canonicalizeSystemTableRow(tableName, left);
  const canonicalRight = canonicalizeSystemTableRow(tableName, right);
  return stableSerialize(canonicalLeft) === stableSerialize(canonicalRight);
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
      return normalizeSystemTableName(
        match[CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ONE],
      );
    }
  }
  return null;
}

function normalizeSqlOperationKind(value) {
  if (value === CONTROL_PLANE_SQL_OPERATION.READ) {
    return CONTROL_PLANE_SQL_OPERATION.READ;
  }
  if (CONTROL_PLANE_WRITE_OPERATION_KINDS.has(value)) {
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

function resolveControlPlaneCacheReconcileIntent(value) {
  return value === CONTROL_PLANE_CACHE_RECONCILE_INTENT.REFRESH_EVIDENCE ?
    CONTROL_PLANE_CACHE_RECONCILE_INTENT.REFRESH_EVIDENCE :
    CONTROL_PLANE_CACHE_RECONCILE_INTENT.REPLACE_CACHE;
}

function resolveControlPlaneCacheReconcileDeletePolicy(options = {}) {
  if (typeof options?.deleteMissing === TYPEOF.BOOLEAN) {
    return options.deleteMissing === true ?
      CONTROL_PLANE_CACHE_RECONCILE_DELETE_POLICY.DELETE_MISSING :
      CONTROL_PLANE_CACHE_RECONCILE_DELETE_POLICY.PRESERVE_MISSING;
  }
  return options?.reconcileIntent ===
    CONTROL_PLANE_CACHE_RECONCILE_INTENT.REFRESH_EVIDENCE ?
    CONTROL_PLANE_CACHE_RECONCILE_DELETE_POLICY.PRESERVE_MISSING :
    CONTROL_PLANE_CACHE_RECONCILE_DELETE_POLICY.DELETE_MISSING;
}

function buildControlPlaneCacheReconcileContract(options = {}) {
  const reconcileIntent = resolveControlPlaneCacheReconcileIntent(
    options?.reconcileIntent,
  );
  return Object.freeze({
    reconcileIntent,
    deleteMissingPolicy: resolveControlPlaneCacheReconcileDeletePolicy({
      deleteMissing: options?.deleteMissing,
      reconcileIntent,
    }),
  });
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

function normalizeAuthoritativeReadMode(value) {
  if (value === CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY) {
    return CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY;
  }
  if (
    value ===
    CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_CONFIRM_EMPTY_WITH_OWNER_RPC
  ) {
    return CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_CONFIRM_EMPTY_WITH_OWNER_RPC;
  }
  if (value === CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_PREFERRED) {
    return CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_PREFERRED;
  }
  if (
    value ===
    CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_PREFERRED_SQL_FALLBACK
  ) {
    return CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_PREFERRED_SQL_FALLBACK;
  }
  if (value === CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED) {
    return CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED;
  }
  return null;
}

function resolveAuthoritativeReadMode(options = {}) {
  const explicitMode = normalizeAuthoritativeReadMode(
    options?.authoritativeReadMode || options?.ownerReadMode,
  );
  if (explicitMode) {
    return explicitMode;
  }
  if (options?.requireOwnerRpcRead === true) {
    return CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED;
  }
  if (options?.preferOwnerRpcRead === true) {
    return options?.allowSqlFallback === true ?
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_PREFERRED_SQL_FALLBACK :
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_PREFERRED;
  }
  if (options?.confirmEmptyLocalReadWithOwnerRpc === true) {
    return CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_CONFIRM_EMPTY_WITH_OWNER_RPC;
  }
  if (options?.allowSqlFallback === true) {
    return CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_PREFERRED_SQL_FALLBACK;
  }
  return CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY;
}

function resolveAuthoritativeReadModeContract(options = {}) {
  const authoritativeReadMode = resolveAuthoritativeReadMode(options);
  switch (authoritativeReadMode) {
  case CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_CONFIRM_EMPTY_WITH_OWNER_RPC:
    return Object.freeze({
      authoritativeReadMode,
      preferOwnerRpcRead: false,
      requireOwnerRpcRead: false,
      allowOwnerRpcFallback: false,
      allowSqlFallback: false,
      confirmEmptyLocalReadWithOwnerRpc: true,
    });
  case CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_PREFERRED:
    return Object.freeze({
      authoritativeReadMode,
      preferOwnerRpcRead: true,
      requireOwnerRpcRead: false,
      allowOwnerRpcFallback: true,
      allowSqlFallback: false,
      confirmEmptyLocalReadWithOwnerRpc: false,
    });
  case CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_PREFERRED_SQL_FALLBACK:
    return Object.freeze({
      authoritativeReadMode,
      preferOwnerRpcRead: true,
      requireOwnerRpcRead: false,
      allowOwnerRpcFallback: true,
      allowSqlFallback: true,
      confirmEmptyLocalReadWithOwnerRpc: false,
    });
  case CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED:
    return Object.freeze({
      authoritativeReadMode,
      preferOwnerRpcRead: true,
      requireOwnerRpcRead: true,
      allowOwnerRpcFallback: true,
      allowSqlFallback: false,
      confirmEmptyLocalReadWithOwnerRpc: false,
    });
  case CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY:
  default:
    return Object.freeze({
      authoritativeReadMode:
          CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY,
      preferOwnerRpcRead: false,
      requireOwnerRpcRead: false,
      allowOwnerRpcFallback: false,
      allowSqlFallback: false,
      confirmEmptyLocalReadWithOwnerRpc: false,
    });
  }
}

function resolveReadStrategyForProfile(readProfile) {
  if (readProfile === CONTROL_PLANE_READ_PROFILE.PLANNING) {
    return CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE;
  }
  if (
    readProfile === CONTROL_PLANE_READ_PROFILE.DIAGNOSTICS ||
    readProfile === CONTROL_PLANE_READ_PROFILE.REPAIR_REQUIRED ||
    readProfile === CONTROL_PLANE_READ_PROFILE.TABLE_LIFECYCLE
  ) {
    return CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED;
  }
  return null;
}

function buildAuthoritativeControlPlaneReadIntent(
  tableName,
  sql,
  params = [],
  options = {},
) {
  return {
    tableName,
    sql,
    params: Array.isArray(params) ? params : [],
    strategy:
      options?.requireAuthoritative === true ?
        CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED :
        CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE,
  };
}

function buildProjectionControlPlaneReadIntent(tableName, options = {}) {
  return {
    tableName,
    strategy: CONTROL_PLANE_READ_STRATEGY.CACHE,
    cachePredicate: options?.cachePredicate,
    readFromCache: options?.readFromCache,
  };
}

function resolveControlPlaneReadIntent(
  tableName,
  sql,
  params = [],
  options = {},
  supportsAuthoritativeReads = false,
) {
  const readProfile = normalizeReadProfile(
    options?.readProfile || options?.profile,
  );
  const profileStrategy = resolveReadStrategyForProfile(readProfile);
  const strategy = normalizeReadStrategy(
    options?.strategy ||
      options?.readStrategy ||
      profileStrategy ||
      (options?.bootstrapSnapshotRows ||
      typeof options?.readBootstrapSnapshot === TYPEOF.FUNCTION ?
        CONTROL_PLANE_READ_STRATEGY.BOOTSTRAP_SNAPSHOT :
        options?.cachePredicate ||
            typeof options?.readFromCache === TYPEOF.FUNCTION ?
          CONTROL_PLANE_READ_STRATEGY.CACHE :
          options?.requireAuthoritative === true ?
            CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED :
            supportsAuthoritativeReads ?
              CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE :
              CONTROL_PLANE_READ_STRATEGY.OWNER_LOCAL_NON_PROPAGATED),
  );
  return {
    readProfile,
    readIntent: {
      tableName,
      sql,
      params: Array.isArray(params) ? params : [],
      strategy,
      cachePredicate: options?.cachePredicate,
      readFromCache: options?.readFromCache,
      readBootstrapSnapshot: options?.readBootstrapSnapshot,
      bootstrapSnapshotRows: options?.bootstrapSnapshotRows,
      phaseScope: normalizePhaseScope(options?.phaseScope),
    },
  };
}

function buildAuthoritativeControlPlaneReadRequestOptions(
  options = {},
  queryOptions = null,
) {
  const authoritativeReadModeContract =
    resolveAuthoritativeReadModeContract(options);
  return Object.freeze({
    authoritativeReadModeContract,
    requestOptions: {
      localReadConsistency:
        options?.localReadConsistency || CONTROL_PLANE_LOCAL_READ_CONSISTENCY,
      replicaFallbackConsistency:
        options?.replicaFallbackConsistency ||
        CONTROL_PLANE_REPLICA_FALLBACK_CONSISTENCY,
      authoritativeReadMode:
        authoritativeReadModeContract.authoritativeReadMode,
      preferOwnerRpcRead: authoritativeReadModeContract.preferOwnerRpcRead,
      requireOwnerRpcRead: authoritativeReadModeContract.requireOwnerRpcRead,
      allowOwnerRpcFallback:
        authoritativeReadModeContract.allowOwnerRpcFallback,
      allowSqlFallback: authoritativeReadModeContract.allowSqlFallback,
      queryOptions,
    },
  });
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
  if (
    typeof result?.completionState === TYPEOF.STRING &&
    result.completionState.length > NUM.ZERO
  ) {
    return result.completionState;
  }
  if (
    typeof result?.visibilityState === TYPEOF.STRING &&
    result.visibilityState !==
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.VISIBLE
  ) {
    return CONTROL_PLANE_MUTATION_OUTCOME.PENDING_VISIBILITY;
  }
  if (result?.success === false) {
    return result?.pressureAction === PRESSURE_GOVERNOR_ACTION.DEFER ?
      CONTROL_PLANE_MUTATION_OUTCOME.DEFERRED :
      result?.pressureAction === PRESSURE_GOVERNOR_ACTION.REJECT ?
        CONTROL_PLANE_MUTATION_OUTCOME.REJECTED :
        CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY;
  }
  const affectedRows = Number(
    result?.partitionResult?.affectedRows ?? result?.affectedRows,
  );
  return Number.isFinite(affectedRows) && affectedRows <= NUM.ZERO ?
    CONTROL_PLANE_MUTATION_OUTCOME.OBSERVED_STATE_CHANGED :
    CONTROL_PLANE_MUTATION_OUTCOME.APPLIED;
}

function buildControlPlaneMutationIntent(
  operation,
  tableName,
  mutation = {},
) {
  return {
    ...mutation,
    operation,
    tableName,
  };
}

function canonicalizeControlPlaneMutation(
  mutation = {},
  operation,
  tableName,
) {
  return {
    ...mutation,
    operation,
    tableName,
    row:
      tableName &&
      (operation === CONTROL_PLANE_MUTATION_OPERATION.INSERT ||
      operation === CONTROL_PLANE_MUTATION_OPERATION.UPSERT) ?
        canonicalizeSystemTableRow(tableName, mutation?.row) :
        mutation?.row,
  };
}

function buildControlPlaneMutationOutcomeSnapshot(outcome, completionState) {
  return {
    outcome,
    completionState,
  };
}

function resolveControlPlaneMutationOutcomeSnapshot(result = {}) {
  const completionState = resolveMutationCompletionState(result);
  const affectedRows = Number(
    result?.partitionResult?.affectedRows ?? result?.affectedRows,
  );
  if (result?.outcome) {
    return buildControlPlaneMutationOutcomeSnapshot(
      result.outcome,
      completionState,
    );
  }
  if (result?.success === false) {
    return buildControlPlaneMutationOutcomeSnapshot(
      result?.pressureAction === PRESSURE_GOVERNOR_ACTION.DEFER ?
        CONTROL_PLANE_MUTATION_OUTCOME.DEFERRED :
        result?.pressureAction === PRESSURE_GOVERNOR_ACTION.REJECT ?
          CONTROL_PLANE_MUTATION_OUTCOME.REJECTED :
          CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY,
      completionState,
    );
  }
  if (
    typeof result?.visibilityState === TYPEOF.STRING &&
    result.visibilityState !==
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.VISIBLE
  ) {
    return buildControlPlaneMutationOutcomeSnapshot(
      CONTROL_PLANE_MUTATION_OUTCOME.PENDING_VISIBILITY,
      completionState,
    );
  }
  if (Number.isFinite(affectedRows) && affectedRows <= NUM.ZERO) {
    return buildControlPlaneMutationOutcomeSnapshot(
      CONTROL_PLANE_MUTATION_OUTCOME.OBSERVED_STATE_CHANGED,
      completionState,
    );
  }
  return buildControlPlaneMutationOutcomeSnapshot(
    CONTROL_PLANE_MUTATION_OUTCOME.APPLIED,
    completionState,
  );
}

function resolveControlPlaneMutationContractOutcome(
  result = {},
  normalizedOutcome,
) {
  const visibilityState = normalizeControlPlaneSystemTableVisibilityState(
    result?.visibilityState,
    null,
  );
  if (
    visibilityState ===
    CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE.DEFERRED_BY_PRESSURE
  ) {
    return buildOwnerContractOutcome({
      contractState: OWNER_CONTRACT_STATE.DEFERRED,
      nextAction: OWNER_CONTRACT_NEXT_ACTION.RETRY,
    });
  }
  if (
    visibilityState ===
      CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE.PENDING_VISIBILITY ||
    visibilityState ===
      CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE.AUTHORITATIVE_CONFIRMATION_PENDING
  ) {
    return buildOwnerContractOutcome({
      contractState: OWNER_CONTRACT_STATE.PENDING,
      nextAction: OWNER_CONTRACT_NEXT_ACTION.WAIT,
    });
  }
  if (
    normalizedOutcome === CONTROL_PLANE_MUTATION_OUTCOME.DEFERRED ||
    normalizedOutcome === CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY
  ) {
    return buildOwnerContractOutcome({
      contractState: OWNER_CONTRACT_STATE.DEFERRED,
      nextAction: OWNER_CONTRACT_NEXT_ACTION.RETRY,
    });
  }
  if (normalizedOutcome === CONTROL_PLANE_MUTATION_OUTCOME.REJECTED) {
    return buildOwnerContractOutcome({
      contractState: OWNER_CONTRACT_STATE.BLOCKED,
      nextAction: OWNER_CONTRACT_NEXT_ACTION.STOP,
    });
  }
  if (result?.success === false) {
    return buildOwnerContractOutcome({
      contractState: OWNER_CONTRACT_STATE.FAILED,
      nextAction: OWNER_CONTRACT_NEXT_ACTION.STOP,
    });
  }
  return buildOwnerContractOutcome({
    contractState: OWNER_CONTRACT_STATE.READY,
    nextAction: OWNER_CONTRACT_NEXT_ACTION.PROCEED,
  });
}

function normalizeDistinctStringArray(values = []) {
  return [
    ...new Set(
      (Array.isArray(values) ? values : []).filter(
        (value) => typeof value === TYPEOF.STRING && value.length > NUM.ZERO,
      ),
    ),
  ];
}

function applyReadWorkloadProfileDefaults(resolvedOptions = {}, options = {}) {
  if (
    typeof options?.workloadClass !== TYPEOF.STRING ||
    options.workloadClass.length === NUM.ZERO
  ) {
    return resolvedOptions;
  }
  const workloadProfile = buildControlPlaneWorkloadProfile(
    options.workloadClass,
  );
  const mergedResourceKeys = normalizeDistinctStringArray([
    ...(typeof options?.resourceKeys === TYPEOF.UNDEFINED ?
      workloadProfile.resourceKeys :
      []),
    ...(Array.isArray(resolvedOptions?.resourceKeys) ?
      resolvedOptions.resourceKeys :
      []),
  ]);
  return {
    ...resolvedOptions,
    workloadClass: workloadProfile.workloadClass,
    workClass:
      typeof options?.workClass === TYPEOF.UNDEFINED ?
        workloadProfile.workClass :
        resolvedOptions.workClass,
    allowPressureDegrade:
      typeof options?.allowPressureDegrade === TYPEOF.UNDEFINED ?
        workloadProfile.allowPressureDegrade :
        resolvedOptions.allowPressureDegrade,
    allowPressureDefer:
      typeof options?.allowPressureDefer === TYPEOF.UNDEFINED ?
        workloadProfile.allowPressureDefer :
        resolvedOptions.allowPressureDefer,
    resourceKeys: mergedResourceKeys,
  };
}

function applyMutationWorkloadProfileDefaults(
  resolvedOptions = {},
  options = {},
) {
  if (
    typeof options?.workloadClass !== TYPEOF.STRING ||
    options.workloadClass.length === NUM.ZERO
  ) {
    return resolvedOptions;
  }
  const workloadProfile = buildControlPlaneWorkloadProfile(
    options.workloadClass,
  );
  const mergedResourceKeys = normalizeDistinctStringArray([
    ...(typeof options?.resourceKeys === TYPEOF.UNDEFINED ?
      workloadProfile.resourceKeys :
      []),
    ...(Array.isArray(resolvedOptions?.resourceKeys) ?
      resolvedOptions.resourceKeys :
      []),
  ]);
  return {
    ...resolvedOptions,
    workloadClass: workloadProfile.workloadClass,
    workClass:
      typeof options?.workClass === TYPEOF.UNDEFINED ?
        workloadProfile.workClass :
        resolvedOptions.workClass,
    allowPressureDefer:
      typeof options?.allowPressureDefer === TYPEOF.UNDEFINED ?
        workloadProfile.allowPressureDefer :
        resolvedOptions.allowPressureDefer,
    resourceKeys: mergedResourceKeys,
  };
}

function resolveReadProfileOptions(options = {}) {
  const readProfile = normalizeReadProfile(
    options?.readProfile || options?.profile,
  );
  if (!readProfile) {
    return applyReadWorkloadProfileDefaults(
      {
        ...options,
        authoritativeReadMode: resolveAuthoritativeReadMode(options),
      },
      options,
    );
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
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.AUTHORITATIVEREADMODE,
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
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
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.AUTHORITATIVEREADMODE,
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_PREFERRED_SQL_FALLBACK,
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
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.AUTHORITATIVEREADMODE,
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_PREFERRED_SQL_FALLBACK,
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
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.AUTHORITATIVEREADMODE,
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_PREFERRED_SQL_FALLBACK,
    );
    resolvedOptions = applyProfileDefault(
      resolvedOptions,
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.REQUIREAUTHORITATIVE,
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
  return applyReadWorkloadProfileDefaults(
    {
      ...resolvedOptions,
      authoritativeReadMode:
        resolveAuthoritativeReadMode(resolvedOptions),
    },
    options,
  );
}

function extractSqlOperationKind(sql) {
  if (typeof sql !== TYPEOF.STRING) {
    return CONTROL_PLANE_SQL_OPERATION.UNKNOWN;
  }
  const normalizedSql = sql.trim().toLowerCase();
  if (
    normalizedSql.startsWith(CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.SELECT)
  ) {
    return CONTROL_PLANE_SQL_OPERATION.READ;
  }
  if (
    normalizedSql.startsWith(
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.INSERT,
    ) ||
    normalizedSql.startsWith(
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.UPDATE,
    ) ||
    normalizedSql.startsWith(CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.DELETE)
  ) {
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

function resolveControlPlaneSystemTableDeliverySource({
  deliverySource = null,
  tableName = null,
  sql = null,
  operationKind = null,
  coalescingKey = null,
} = {}) {
  if (typeof deliverySource === TYPEOF.STRING && deliverySource.length > NUM.ZERO) {
    return deliverySource;
  }
  const normalizedTableName =
    normalizeSystemTableName(tableName) || extractSystemTableNameFromSql(sql);
  const normalizedOperationKindCandidate =
    normalizeSqlOperationKind(operationKind);
  const normalizedOperationKind =
    normalizedOperationKindCandidate !== CONTROL_PLANE_SQL_OPERATION.UNKNOWN ?
      normalizedOperationKindCandidate :
      extractSqlOperationKind(sql);
  if (
    !normalizedTableName ||
    normalizedOperationKind === CONTROL_PLANE_SQL_OPERATION.UNKNOWN
  ) {
    return null;
  }
  const deliveryPrefix =
    normalizedOperationKind === CONTROL_PLANE_SQL_OPERATION.READ ?
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.CONTROL_DASH_PLANE_COLON_READ :
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.CONTROL_DASH_PLANE_COLON_WRITE;
  const normalizedCoalescingKey = normalizeCoalescingToken(coalescingKey);
  const deliverySourceParts = normalizedCoalescingKey ?
    [deliveryPrefix, normalizedTableName, normalizedCoalescingKey] :
    [deliveryPrefix, normalizedTableName];
  return deliverySourceParts.join(
    CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.DELIVERY_SOURCE_SEPARATOR,
  );
}

export {
  CANONICAL_LEADER_ROUTING_GAP_STATE,
  CDC_OPERATION,
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_CACHE_RECONCILE_DELETE_POLICY,
  CONTROL_PLANE_CACHE_RECONCILE_INTENT,
  CONTROL_PLANE_DEFERRED_MUTATION_FAILURE_SENTINEL,
  CONTROL_PLANE_GATEWAY_ERROR_CODE,
  CONTROL_PLANE_GATEWAY_LIMIT,
  CONTROL_PLANE_LOCAL_READ_CONSISTENCY,
  CONTROL_PLANE_MUTATION_MERGE_POLICY,
  CONTROL_PLANE_MUTATION_OPERATION,
  CONTROL_PLANE_MUTATION_OUTCOME,
  CONTROL_PLANE_MUTATION_QUEUE_STATE,
  CONTROL_PLANE_OPERATION_LEDGER_LIMIT,
  CONTROL_PLANE_PHASE_SCOPE,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READ_OUTCOME,
  CONTROL_PLANE_READ_PROFILE,
  CONTROL_PLANE_READ_STRATEGY,
  CONTROL_PLANE_REPLICA_FALLBACK_CONSISTENCY,
  CONTROL_PLANE_ROUTING_SNAPSHOT_FIELD,
  CONTROL_PLANE_SQL_OPERATION,
  CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_ERROR,
  CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL,
  CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_SOURCE,
  CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE,
  ControlPlaneDiagnosticsLedger,
  GATEWAY_ERROR_MSG,
  GATEWAY_LOG_MSG,
  INITIAL_PARTITION_IDS,
  METRICS_LOG_TAG,
  NUM,
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
  PRESSURE_GOVERNOR_ACTION,
  PRESSURE_WORK_CLASS,
  PressureGovernor,
  SQL,
  SYSTEM_TABLE_NAME,
  SYSTEM_TABLE_NAMES,
  TYPEOF,
  applyMutationWorkloadProfileDefaults,
  applyProfileDefault,
  applyReadWorkloadProfileDefaults,
  areCanonicalSystemTableRowsEqual,
  buildAuthoritativeControlPlaneReadIntent,
  buildAuthoritativeControlPlaneReadRequestOptions,
  buildControlPlaneCacheReconcileContract,
  buildControlPlaneMutationIntent,
  buildControlPlaneQueryOptions,
  buildControlPlaneWorkloadProfile,
  buildLocalControlPlaneMutationReadinessFailure,
  buildOwnerContractOutcome,
  buildProjectionControlPlaneReadIntent,
  buildPressureAdmissionFailure,
  canonicalizeControlPlaneMutation,
  canonicalizeSystemTableRow,
  copyOption,
  createDeferredPromise,
  extractSqlOperationKind,
  extractSystemTableNameFromSql,
  getControlPlaneErrorCode,
  getControlPlaneFailureSummary,
  getControlPlaneRetryAfterMs,
  getLocalControlPlaneMutationReadinessBlocker,
  getRemainingBudgetMs,
  getSystemCachePrimaryKeyFieldOrFallback,
  hasUsablePrimaryKeyValue,
  normalizeAuthoritativeReadMode,
  normalizeCoalescingToken,
  normalizeControlPlaneSystemTableVisibilityState,
  normalizeDistinctStringArray,
  normalizeMutationMergePolicy,
  normalizeMutationOperation,
  normalizePhaseScope,
  normalizePositiveInteger,
  normalizeReadProfile,
  normalizeReadStrategy,
  normalizeSqlOperationKind,
  normalizeSystemTableName,
  requiresStableLocalControlPlaneMutationReadiness,
  resolveAuthoritativeReadModeContract,
  resolveCanonicalLeaderIdentitySnapshot,
  resolveCanonicalLeaderRoutingGapState,
  resolveControlPlaneCacheReconcileDeletePolicy,
  resolveControlPlaneCacheReconcileIntent,
  resolveControlPlaneMutationContractOutcome,
  resolveControlPlaneMutationOutcomeSnapshot,
  resolveControlPlaneSystemTableDeliverySource,
  resolveControlPlaneReadIntent,
  resolveAuthoritativeReadMode,
  resolveMutationCompletionState,
  resolveReadProfileOptions,
  resolveReadStrategyForProfile,
  sortObjectKeys,
  stableSerialize,
};
