import {
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READ_PURPOSE,
} from './control-plane-readiness-constants.js';
import {CONTROL_PLANE_CACHE_RECONCILE_INTENT} from './control-plane-cache-reconcile-constants.js';
import {
  PRESSURE_WORK_CLASS,
} from './pressure-governor.js';
import {buildControlPlaneWorkloadProfile} from './control-plane-workload-profile.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_CACHE_RECONCILE_DELETE_POLICY,
  CONTROL_PLANE_LOCAL_READ_CONSISTENCY,
  CONTROL_PLANE_READ_PROFILE,
  CONTROL_PLANE_READ_STRATEGY,
  CONTROL_PLANE_REPLICA_FALLBACK_CONSISTENCY,
  CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL,
} from './control-plane-system-table-gateway-constants.js';
import {
  normalizeDistinctStringArray,
  normalizePhaseScope,
} from './control-plane-system-table-gateway-normalizers.js';

function resolveControlPlaneCacheReconcileIntent(value) {
  return value === CONTROL_PLANE_CACHE_RECONCILE_INTENT.REFRESH_EVIDENCE ?
    CONTROL_PLANE_CACHE_RECONCILE_INTENT.REFRESH_EVIDENCE :
    CONTROL_PLANE_CACHE_RECONCILE_INTENT.REPLACE_CACHE;
}

function resolveControlPlaneCacheReconcileDeletePolicy(options = {}) {
  if (typeof options?.deleteMissing === 'boolean') {
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
      typeof options?.readBootstrapSnapshot === 'function' ?
        CONTROL_PLANE_READ_STRATEGY.BOOTSTRAP_SNAPSHOT :
        options?.cachePredicate ||
            typeof options?.readFromCache === 'function' ?
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

/**
 * The single frozen read-authority contract. Built once at gateway read
 * ingress and threaded structurally (requestOptions.readAuthority,
 * executionOptions.readAuthority, coalescing identities) so no intermediate
 * layer can drop an authority field by re-enumerating options — the failure
 * mode behind the 2026-07-18 leader-pin incidents. Field-level booleans in
 * requestOptions remain for legacy consumers; token consumers win.
 */
function buildControlPlaneReadAuthority(options = {}) {
  if (
    options?.readAuthority &&
    typeof options.readAuthority === 'object'
  ) {
    return options.readAuthority;
  }
  return Object.freeze({
    purpose:
      options?.readPurpose === CONTROL_PLANE_READ_PURPOSE.READINESS_INTERNAL ?
        CONTROL_PLANE_READ_PURPOSE.READINESS_INTERNAL :
        CONTROL_PLANE_READ_PURPOSE.ORDINARY,
    strategy: normalizeReadStrategy(
      options?.strategy || options?.readStrategy,
    ),
    readProfile: normalizeReadProfile(
      options?.readProfile || options?.profile,
    ),
    authoritativeReadMode: resolveAuthoritativeReadMode(options),
    preferOwnerRpcReadLeader: options?.preferOwnerRpcReadLeader === true,
    preferLeader:
      typeof options?.preferLeader === 'boolean' ?
        options.preferLeader :
        null,
    localReadConsistency: options?.localReadConsistency || null,
    replicaFallbackConsistency: options?.replicaFallbackConsistency || null,
    routingReadinessDimension:
      options?.routingReadinessDimension ||
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    phaseScope: normalizePhaseScope(options?.phaseScope),
    authoritativeObservationScope:
      options?.authoritativeObservationScope || null,
  });
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
      readAuthority: buildControlPlaneReadAuthority(options),
      localReadConsistency:
        options?.localReadConsistency || CONTROL_PLANE_LOCAL_READ_CONSISTENCY,
      replicaFallbackConsistency:
        options?.replicaFallbackConsistency ||
        CONTROL_PLANE_REPLICA_FALLBACK_CONSISTENCY,
      authoritativeReadMode:
        authoritativeReadModeContract.authoritativeReadMode,
      preferOwnerRpcRead: authoritativeReadModeContract.preferOwnerRpcRead,
      preferOwnerRpcReadLeader:
        options?.preferOwnerRpcReadLeader === true,
      requireOwnerRpcRead: authoritativeReadModeContract.requireOwnerRpcRead,
      allowOwnerRpcFallback:
        authoritativeReadModeContract.allowOwnerRpcFallback,
      allowSqlFallback: authoritativeReadModeContract.allowSqlFallback,
      queryOptions,
    },
  });
}

function applyProfileDefault(options, key, value) {
  if (typeof options?.[key] !== 'undefined') {
    return options;
  }
  return {
    ...options,
    [key]: value,
  };
}

function applyReadWorkloadProfileDefaults(resolvedOptions = {}, options = {}) {
  if (
    typeof options?.workloadClass !== 'string' ||
    options.workloadClass.length === 0
  ) {
    return resolvedOptions;
  }
  const workloadProfile = buildControlPlaneWorkloadProfile(
    options.workloadClass,
  );
  const mergedResourceKeys = normalizeDistinctStringArray([
    ...(typeof options?.resourceKeys === 'undefined' ?
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
      typeof options?.workClass === 'undefined' ?
        workloadProfile.workClass :
        resolvedOptions.workClass,
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

export {
  applyProfileDefault,
  applyReadWorkloadProfileDefaults,
  buildAuthoritativeControlPlaneReadIntent,
  buildAuthoritativeControlPlaneReadRequestOptions,
  buildControlPlaneCacheReconcileContract,
  buildControlPlaneReadAuthority,
  buildProjectionControlPlaneReadIntent,
  normalizeAuthoritativeReadMode,
  normalizeReadProfile,
  normalizeReadStrategy,
  resolveAuthoritativeReadModeContract,
  resolveControlPlaneCacheReconcileDeletePolicy,
  resolveControlPlaneCacheReconcileIntent,
  resolveControlPlaneReadIntent,
  resolveReadProfileOptions,
  resolveReadStrategyForProfile,
};
