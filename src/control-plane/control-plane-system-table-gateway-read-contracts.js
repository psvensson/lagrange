import {
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READ_PURPOSE,
} from './control-plane-readiness-constants.js';
import {CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_SCOPE,
  CONTROL_PLANE_CACHE_RECONCILE_INTENT} from './control-plane-cache-reconcile-constants.js';
import {
  PRESSURE_WORK_CLASS,
} from './pressure-governor.js';
import {buildControlPlaneWorkloadProfile} from './control-plane-workload-profile.js';
import {copyStrictOwnDataRecord} from '../utils/strict-own-data.js';
import {LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY} from
  '../cdc/cdc-integration-service-shared-constants.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_CACHE_RECONCILE_DELETE_POLICY,
  CONTROL_PLANE_PHASE_SCOPE,
  CONTROL_PLANE_READ_PROFILE,
  CONTROL_PLANE_READ_LEADER_MODE,
  CONTROL_PLANE_READ_STRATEGY,
  CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL,
  GATEWAY_ERROR_MSG,
} from './control-plane-system-table-gateway-constants.js';
import {
  normalizeDistinctStringArray,
  normalizePhaseScope,
} from './control-plane-system-table-gateway-normalizers.js';

const objectIsFrozen = Object.isFrozen;
const objectKeys = Object.keys;
const objectHasOwn = Object.hasOwn;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const canonicalObjectPrototype = Object.prototype;
const arrayIncludes = Function.prototype.call.bind(Array.prototype.includes);
const arrayIsArray = Array.isArray;
const numberIsFinite = Number.isFinite;
const READ_AUTHORITY_FIELD_VALUES = Object.freeze({
  purpose: Object.freeze(Object.values(CONTROL_PLANE_READ_PURPOSE)),
  strategy: Object.freeze([null, ...Object.values(CONTROL_PLANE_READ_STRATEGY)]),
  readProfile: Object.freeze([null, ...Object.values(CONTROL_PLANE_READ_PROFILE)]),
  authoritativeReadMode: Object.freeze(Object.values(CONTROL_PLANE_AUTHORITATIVE_READ_MODE)),
  leaderMode: Object.freeze(Object.values(CONTROL_PLANE_READ_LEADER_MODE)),
  preferLeader: Object.freeze([null, true, false]),
  localReadConsistency: Object.freeze([null, ...Object.values(LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY)]),
  routingReadinessDimension: Object.freeze(Object.values(CONTROL_PLANE_READINESS_DIMENSION)),
  phaseScope: Object.freeze([null, ...Object.values(CONTROL_PLANE_PHASE_SCOPE)]),
  authoritativeObservationScope: Object.freeze([null,
    ...Object.values(CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_SCOPE)]),
});
const READ_AUTHORITY_FIELDS = Object.freeze(objectKeys(READ_AUTHORITY_FIELD_VALUES));
const AUTHORITATIVE_READ_FAILURE_COLLECTION_FIELDS = Object.freeze([
  'failedPartitions',
  'partitionErrors',
  'participantFailures',
]);
function hasAuthoritativeReadFailureEvidence(result = {}) {
  if (result?.partial === true) return true;
  for (let index = 0; index < AUTHORITATIVE_READ_FAILURE_COLLECTION_FIELDS.length; index += 1) {
    const value = result?.[AUTHORITATIVE_READ_FAILURE_COLLECTION_FIELDS[index]];
    if (arrayIsArray(value) ? value.length > 0 : numberIsFinite(value) && value > 0) return true;
  }
  return false;
}

function isCompleteAuthoritativeReadResult(result = {}) {
  return result?.success === true && result?.rowSetComplete === true &&
    arrayIsArray(result?.rows) && !hasAuthoritativeReadFailureEvidence(result);
}

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

function normalizeReadLeaderMode(value) {
  if (value === undefined) return CONTROL_PLANE_READ_LEADER_MODE.ANY;
  assertSupportedReadAuthorityValue('leaderMode', value);
  return value;
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
  if (value === CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY ||
      value === CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED) {
    return value;
  }
  return null;
}

function resolveAuthoritativeReadMode(options = {}) {
  if (options.authoritativeReadMode !== undefined) {
    const explicitMode = normalizeAuthoritativeReadMode(options.authoritativeReadMode);
    if (explicitMode === null) {
      throw new TypeError(GATEWAY_ERROR_MSG.AUTHORITATIVE_READ_MODE_UNSUPPORTED);
    }
    return explicitMode;
  }
  if (options.authoritativeObservationScope ===
      CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_SCOPE.COMPLETE_TABLE) {
    return CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED;
  }
  const strategy = normalizeReadStrategy(options.strategy);
  return strategy === CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE ||
    strategy === CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED ||
    normalizeReadProfile(options.readProfile) !== null ?
    CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED :
    CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY;
}

function contradictoryReadAuthority() {
  const code = GATEWAY_ERROR_MSG.AUTHORITATIVE_READ_AUTHORITY_CONTRADICTORY;
  return Object.assign(new TypeError(code), {code});
}

function invalidReadAuthorityToken() {
  return new TypeError(GATEWAY_ERROR_MSG.AUTHORITATIVE_READ_AUTHORITY_TOKEN_REQUIRED);
}

function assertSupportedReadAuthorityValue(field, value) {
  if (arrayIncludes(READ_AUTHORITY_FIELD_VALUES[field], value)) return;
  if (field === 'authoritativeReadMode') {
    throw new TypeError(GATEWAY_ERROR_MSG.AUTHORITATIVE_READ_MODE_UNSUPPORTED);
  }
  if (field === 'leaderMode') {
    throw new TypeError(GATEWAY_ERROR_MSG.AUTHORITATIVE_READ_LEADER_MODE_UNSUPPORTED);
  }
  throw contradictoryReadAuthority();
}

function assertFlatReadAuthorityDraft(options) {
  for (let index = 0; index < READ_AUTHORITY_FIELDS.length; index += 1) {
    const field = READ_AUTHORITY_FIELDS[index];
    const value = options[field];
    if (value === undefined) continue;
    // Optional draft fields may omit a choice with null. Once constructed,
    // every selected field must hold its canonical supported value.
    if (value === null && field !== 'leaderMode' && field !== 'authoritativeReadMode') continue;
    assertSupportedReadAuthorityValue(field, value);
  }
}

function readFrozenAuthorityFields(readAuthority) {
  const fields = copyStrictOwnDataRecord(readAuthority);
  if (fields === null || !objectIsFrozen(readAuthority)) {
    throw invalidReadAuthorityToken();
  }
  for (let index = 0; index < READ_AUTHORITY_FIELDS.length; index += 1) {
    if (!objectHasOwn(fields, READ_AUTHORITY_FIELDS[index])) throw invalidReadAuthorityToken();
  }
  return fields;
}

function assertReadAuthoritySerializationShape(readAuthority, fields) {
  if (objectKeys(fields).length !== READ_AUTHORITY_FIELDS.length ||
      objectGetPrototypeOf(readAuthority) === canonicalObjectPrototype &&
        objectGetOwnPropertyDescriptor(canonicalObjectPrototype, 'toJSON')) {
    throw invalidReadAuthorityToken();
  }
}

function isNonAuthoritativeReadStrategy(strategy) {
  return strategy === CONTROL_PLANE_READ_STRATEGY.CACHE ||
    strategy === CONTROL_PLANE_READ_STRATEGY.BOOTSTRAP_SNAPSHOT ||
    strategy === CONTROL_PLANE_READ_STRATEGY.OWNER_LOCAL_NON_PROPAGATED;
}

function assertLocalLeaderReadAuthority(fields) {
  if (fields.authoritativeReadMode === CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY &&
      fields.leaderMode === CONTROL_PLANE_READ_LEADER_MODE.REQUIRED &&
      fields.localReadConsistency !== LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.LOCAL_LEADER) {
    throw contradictoryReadAuthority();
  }
}

function assertCompleteTableReadAuthority(fields) {
  if (fields.authoritativeObservationScope ===
      CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_SCOPE.COMPLETE_TABLE &&
      (fields.authoritativeReadMode !==
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED ||
        fields.leaderMode !== CONTROL_PLANE_READ_LEADER_MODE.REQUIRED ||
        fields.preferLeader === false)) {
    throw contradictoryReadAuthority();
  }
}

// An already selected token is consumed by identity, never normalized again.
// Completeness is an authority obligation; it cannot override explicit intent.
function assertReadAuthorityFields(readAuthority) {
  const fields = readFrozenAuthorityFields(readAuthority);
  for (let index = 0; index < READ_AUTHORITY_FIELDS.length; index += 1) {
    const field = READ_AUTHORITY_FIELDS[index];
    assertSupportedReadAuthorityValue(field, fields[field]);
  }
  if (isNonAuthoritativeReadStrategy(fields.strategy) &&
      fields.authoritativeReadMode === CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED) {
    throw contradictoryReadAuthority();
  }
  assertLocalLeaderReadAuthority(fields);
  assertCompleteTableReadAuthority(fields);
  return fields;
}

function assertControlPlaneReadAuthority(readAuthority) {
  const fields = assertReadAuthorityFields(readAuthority);
  assertReadAuthoritySerializationShape(readAuthority, fields);
  return readAuthority;
}

function assertOwnerReadAuthorityFields(readAuthority) {
  const fields = assertReadAuthorityFields(readAuthority);
  if (fields.strategy === CONTROL_PLANE_READ_STRATEGY.CACHE ||
      fields.strategy === CONTROL_PLANE_READ_STRATEGY.BOOTSTRAP_SNAPSHOT) {
    throw contradictoryReadAuthority();
  }
  return fields;
}

function assertControlPlaneOwnerReadAuthority(readAuthority) {
  const fields = assertOwnerReadAuthorityFields(readAuthority);
  assertReadAuthoritySerializationShape(readAuthority, fields);
  return readAuthority;
}

function assertControlPlaneOwnerRpcReadAuthority(readAuthority) {
  const fields = assertOwnerReadAuthorityFields(readAuthority);
  if (fields.authoritativeReadMode !==
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED) {
    throw contradictoryReadAuthority();
  }
  assertReadAuthoritySerializationShape(readAuthority, fields);
  return readAuthority;
}

function assertControlPlaneReadAuthorityMatchesIntent(readAuthority, strategy, options = {}) {
  assertControlPlaneReadAuthority(readAuthority);
  const authoritative = strategy === CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE ||
    strategy === CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED;
  const strategyMatches = readAuthority.strategy === null ? authoritative :
    readAuthority.strategy === strategy;
  if (!strategyMatches) throw contradictoryReadAuthority();
  if (options.strategy !== undefined && options.strategy !== strategy) {
    throw contradictoryReadAuthority();
  }
  for (let index = 0; index < READ_AUTHORITY_FIELDS.length; index += 1) {
    const field = READ_AUTHORITY_FIELDS[index];
    if (field !== 'strategy' && options[field] !== undefined &&
        options[field] !== readAuthority[field]) throw contradictoryReadAuthority();
  }
  return readAuthority;
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
      options?.strategy ===
      CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED ?
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
  const readProfile = normalizeReadProfile(options?.readProfile);
  const profileStrategy = resolveReadStrategyForProfile(readProfile);
  const strategy = normalizeReadStrategy(
    options?.strategy ||
      profileStrategy ||
      (options?.bootstrapSnapshotRows ||
      typeof options?.readBootstrapSnapshot === 'function' ?
        CONTROL_PLANE_READ_STRATEGY.BOOTSTRAP_SNAPSHOT :
        options?.cachePredicate ||
            typeof options?.readFromCache === 'function' ?
          CONTROL_PLANE_READ_STRATEGY.CACHE :
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
 * mode behind the 2026-07-18 leader-pin incidents. The constructor accepts
 * one flat authority draft; nested tokens and legacy routing booleans are not
 * alternate input forms.
 */
function buildControlPlaneReadAuthority(options = {}) {
  assertFlatReadAuthorityDraft(options);
  const completeTable = options.authoritativeObservationScope ===
    CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_SCOPE.COMPLETE_TABLE;
  return assertControlPlaneReadAuthority(Object.freeze({
    purpose:
      options?.purpose === CONTROL_PLANE_READ_PURPOSE.READINESS_INTERNAL ?
        CONTROL_PLANE_READ_PURPOSE.READINESS_INTERNAL :
        CONTROL_PLANE_READ_PURPOSE.ORDINARY,
    strategy: normalizeReadStrategy(options?.strategy),
    readProfile: normalizeReadProfile(options?.readProfile),
    authoritativeReadMode: resolveAuthoritativeReadMode(options),
    leaderMode: completeTable && options.leaderMode === undefined ?
      CONTROL_PLANE_READ_LEADER_MODE.REQUIRED : normalizeReadLeaderMode(options?.leaderMode),
    preferLeader:
      typeof options?.preferLeader === 'boolean' ?
        options.preferLeader :
        null,
    localReadConsistency: options?.localReadConsistency || null,
    routingReadinessDimension:
      options?.routingReadinessDimension ||
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    phaseScope: normalizePhaseScope(options?.phaseScope),
    authoritativeObservationScope:
      options?.authoritativeObservationScope || null,
  }));
}

function buildAuthoritativeControlPlaneReadRequestOptions(
  readAuthority,
  deliveryOptions = {},
  queryOptions = null,
) {
  // executeRead is the sole normalization boundary. Downstream request
  // construction consumes that exact token; rebuilding here used to create a
  // second authority owner and could erase fields that lived only in the
  // structural token.
  assertControlPlaneOwnerReadAuthority(readAuthority);
  return Object.freeze({
    requestOptions: {
      ...buildAuthoritativeReadDeliveryOptions(
        deliveryOptions,
        readAuthority,
      ),
      queryOptions,
    },
  });
}

// Delivery transports the exact ingress authority token with scheduling intent.
function buildAuthoritativeReadDeliveryOptions(options, readAuthority) {
  return {
    readAuthority,
    workClass: options?.workClass,
    deliveryPriority: options?.deliveryPriority,
  };
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
  const readProfile = normalizeReadProfile(options?.readProfile);
  if (!readProfile) {
    const hasExplicitOrStrategyMode =
      options.authoritativeReadMode !== undefined ||
      Boolean(normalizeReadStrategy(options?.strategy));
    return applyReadWorkloadProfileDefaults(
      {
        ...options,
        ...(hasExplicitOrStrategyMode ?
          {authoritativeReadMode: resolveAuthoritativeReadMode(options)} :
          {}),
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
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.AUTHORITATIVEREADMODE,
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
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
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.AUTHORITATIVEREADMODE,
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
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
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.AUTHORITATIVEREADMODE,
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
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
  assertControlPlaneOwnerReadAuthority,
  assertControlPlaneOwnerRpcReadAuthority,
  assertControlPlaneReadAuthority,
  assertControlPlaneReadAuthorityMatchesIntent,
  assertFlatReadAuthorityDraft,
  buildAuthoritativeControlPlaneReadIntent,
  buildAuthoritativeControlPlaneReadRequestOptions,
  buildControlPlaneCacheReconcileContract,
  buildControlPlaneReadAuthority,
  buildProjectionControlPlaneReadIntent,
  hasAuthoritativeReadFailureEvidence,
  isCompleteAuthoritativeReadResult,
  normalizeAuthoritativeReadMode,
  normalizeReadProfile,
  normalizeReadStrategy,
  resolveControlPlaneCacheReconcileDeletePolicy,
  resolveControlPlaneCacheReconcileIntent,
  resolveControlPlaneReadIntent,
  resolveReadProfileOptions,
  resolveReadStrategyForProfile,
};
