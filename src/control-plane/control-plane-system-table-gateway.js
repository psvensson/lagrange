import { CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_SHARED } from './control-plane-system-table-gateway-shared.js';
import { ControlPlaneSystemTableGatewaySegment3 } from './control-plane-system-table-gateway-segment-3.js';

const {
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
  applyProfileDefault,
  applyReadWorkloadProfileDefaults,
  areCanonicalSystemTableRowsEqual,
  buildControlPlaneQueryOptions,
  buildControlPlaneWorkloadProfile,
  buildLocalControlPlaneMutationReadinessFailure,
  buildOwnerContractOutcome,
  buildPressureAdmissionFailure,
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
  resolveLegacyAuthoritativeReadMode,
  resolveMutationCompletionState,
  resolveReadProfileOptions,
  resolveReadStrategyForProfile,
  sortObjectKeys,
  stableSerialize,
} = CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_SHARED;

class ControlPlaneSystemTableGateway extends ControlPlaneSystemTableGatewaySegment3 {
  normalizeMutationResult(result) {
    const normalizedState =
      this.resolveNormalizedMutationState(result);
    const contractOutcome =
      this.resolveNormalizedMutationContractOutcome(result, normalizedState);
    return {
      ...result,
      outcome: normalizedState.outcome,
      completionState: normalizedState.completionState,
      contractState: contractOutcome.contractState,
      nextAction: contractOutcome.nextAction,
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
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_CACHE_RECONCILE_INTENT,
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
  resolveAuthoritativeReadModeContract,
  resolveReadProfileOptions,
};

