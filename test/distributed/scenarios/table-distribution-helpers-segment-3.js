import assert from 'node:assert/strict';
import {TABLE_DISTRIBUTION_HELPERS_SEGMENT_2} from './table-distribution-helpers-segment-2.js';
const {
  TABLE_NAME_LOGS,
  TABLE_NAME_BENCHMARK_EVENTS,
  SERVICE_TYPE_PARTITION,
  STATUS_ACTIVE,
  ZERO,
  ONE,
  BENCHMARK_WORKLOAD_PROFILE,
  IDENTIFIER_PATTERN,
  TABLE_ID_VISIBILITY_TIMEOUT_MS,
  TABLE_BOOTSTRAP_TIMEOUT_MS,
  TABLE_BOOTSTRAP_POST_CREATE_VISIBILITY_RESERVE_MS,
  TABLE_ID_VISIBILITY_POLL_INTERVAL_MS,
  CONTROL_QUERY_TIMEOUT_MS,
  POLICY_APPLY_TIMEOUT_MS,
  POLICY_APPLY_ATTEMPT_TIMEOUT_MS,
  POLICY_VISIBILITY_POLL_INTERVAL_MS,
  POLICY_APPLY_RETRY_DELAY_MS,
  CONTROL_QUERY_LANE_CONTROL,
  CONTROL_QUERY_LANE_SNAPSHOT,
  CONTROL_QUERY_PROGRESS_RETRY_DELAY_MS,
  CONTROL_QUERY_MIN_CANDIDATE_TIMEOUT_MS,
  CONTROL_QUERY_MUTATION_FALLBACK_ERROR_FRAGMENTS,
  CONTROL_QUERY_EXECUTION_MODE,
  CONTROL_QUERY_OUTCOME_DEFERRED,
  TABLE_POLICY_PRECONDITION_SCENARIO_DEFAULT,
  DEFAULT_BENCHMARK_READY_NODE_COUNT,
  PARTITIONING_LOAD_HEADROOM_RATIO,
  TABLE_DISTRIBUTION_TOPOLOGY_STALL_TIMEOUT_MS,
  TABLE_BOOTSTRAP_PARTITION_VISIBILITY_MISSING,
  TABLE_BOOTSTRAP_TOPOLOGY_NOT_ROUTABLE_PREFIX,
  TABLE_BOOTSTRAP_VISIBILITY_STATE,
  TABLE_BOOTSTRAP_VISIBILITY_STATE_ORDER,
  TABLE_BOOTSTRAP_VISIBILITY_STATE_LABEL,
  TOPOLOGY_STATE_ROUTABLE,
  TOPOLOGY_STATE_OPAQUE,
  TOPOLOGY_STATE_INVALID,
  TOPOLOGY_REASON_LEADER_SERVICE_MISSING,
  TOPOLOGY_REASON_ABOVE_TARGET_REPLICA_COUNT,
  RAFT_ROLE_LEADER,
  PARTITIONING_ADAPTIVE_DISPATCH_GUARDRAIL,
  DEFAULT_TABLE_SPLIT_POLICIES,
  SQL_SELECT_TABLE_PARTITIONS_PREFIX,
  SQL_SELECT_TABLE_PARTITIONS_SUFFIX,
  SQL_SELECT_TABLE_ID_PREFIX,
  SQL_SELECT_TABLE_ID_SUFFIX,
  SQL_SELECT_TABLE_POLICIES_BY_TABLE_ID_PREFIX,
  SQL_SELECT_TABLE_POLICIES_BY_TABLE_ID_SUFFIX,
  SQL_SELECT_TABLE_POLICIES_BY_TABLE_NAME_PREFIX,
  SQL_SELECT_TABLE_POLICIES_BY_TABLE_NAME_SUFFIX,
  SQL_SELECT_PARTITIONS_BY_TABLE_ID_PREFIX,
  SQL_SELECT_PARTITIONS_BY_TABLE_ID_SUFFIX,
  SQL_CREATE_TABLE_PREFIX,
  SQL_CREATE_TABLE_SUFFIX,
  SQL_UPDATE_TABLE_POLICIES_PREFIX,
  SQL_UPDATE_TABLE_POLICIES_MID,
  SQL_UPDATE_TABLE_POLICIES_SUFFIX,
  SQL_CONTROL_SNAPSHOT,
  SQL_CONTROL_SNAPSHOT_FORCE_REPAIR,
  SQL_SELECT_ACTIVE_PARTITION_SERVICES_PREFIX,
  TIMEOUT_ERROR_PATTERN,
  TABLE_DISTRIBUTION_OBSERVATION_STATE_OBSERVED,
  TABLE_DISTRIBUTION_OBSERVATION_STATE_DEFERRED,
  TABLE_DISTRIBUTION_OBSERVATION_STATE_UNAVAILABLE,
  TABLE_DISTRIBUTION_OBSERVATION_SIGNATURE_DEFERRED,
  TABLE_DISTRIBUTION_OBSERVATION_SIGNATURE_UNAVAILABLE,
  CONTROL_SNAPSHOT_OBSERVATION_FIELD,
  CONTROL_SNAPSHOT_OBSERVATION_STATE_FIELD,
  CONTROL_SNAPSHOT_OBSERVATION_CONTRACT_STATE_FIELD,
  CONTROL_SNAPSHOT_OBSERVATION_STATE_FAILED,
  CONTROL_SNAPSHOT_OBSERVATION_CONTRACT_STATE_FAILED,
  isPendingControlPlaneSystemTableVisibilityState,
  CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE,
  OWNER_CONTRACT_STATE,
  normalizeOwnerContractState,
  sleep,
  mapNodeIds,
  normalizePlannerObservationReasonCodes,
  resolveTableDistributionObservationState,
  buildTableDistributionObservationReasonCodes,
  extractControlSnapshotObservation,
  shouldFallbackToForcedControlSnapshot,
  cloneCriticalControlPlaneStabilitySnapshot,
  buildPartitioningPlannerDiagnostics,
  buildPartitioningPlannerTimeoutError,
  buildPartitioningDispatchPlannerDiagnostics,
  resolvePartitioningPlannerDiagnosticsSnapshot,
  buildDeferredTableDistributionSnapshot,
  buildPartitioningPlannerDiagnosticsFromPreviousState,
  formatPlannerNodeIds,
  formatPlannerHistogram,
  resolvePartitionGrowthFailureMode,
  isTimeoutShapedError,
  isRetryableControlPlaneProgressError,
  resolveControlPlaneRetryDelayMs,
  resolveControlQueryTimeoutMs,
  resolveRemainingControlQueryTimeoutMs,
  selectMeaningfulControlQueryNodes,
  resolveControlQueryCandidateTimeoutMs,
  resolveControlQueryExecutionMode,
  selectControlQueryExecutionNodes,
  hasControlQueryMutationVisibilityEvidence,
  isControlQueryMutationPreExecutionDeferredError,
  isControlQueryMutationFallbackEligibleError,
  shouldRetryControlQueryOnNextCandidate,
  queryControl,
  resolveControlQueryNodes,
  forceRepairControlSnapshotAcrossQueryNodes,
  queryControlSingle,
  queryControlSingleWithProgressRetry,
  queryTableDistribution,
  rowsFromResult,
  escapeSql,
  resolveBenchmarkTableName,
  resolvePartitioningLoadTableName,
  resolveClusterNodes,
  resolveBenchmarkAdmissionRequiredNodeCount,
  resolveBenchmarkBootstrapRequiredNodeCount,
  resolveBenchmarkAdmissionTimeoutMs,
  resolveBenchmarkAdmissionStableWindowMs,
  resolveBenchmarkAdmissionPollIntervalMs,
  resolveBenchmarkAdmissionEnforcement,
  preserveNodeOrder,
  resolvePartitioningDispatchNodes,
  admitBenchmarkLoadNodes,
  resolveBenchmarkPartitionConvergenceSnapshot,
  createPartitioningBenchmarkLoadNodePlan,
  resolvePartitioningBenchmarkLoadOpsPerSec,
  createPartitioningAdaptiveDispatchGuardrail,
  firstTableId,
  firstStringField,
  firstPositiveIntegerField,
  firstTablePolicies,
  affectedRowCountFromResult,
  summarizeMutationResult,
  normalizeMutationVisibilityState,
  summarizeMutationVisibility,
  advanceMutationVisibilitySummary,
  shouldDeferAuthoritativeRepair,
} = TABLE_DISTRIBUTION_HELPERS_SEGMENT_2;

const TABLE_BOOTSTRAP_SQL_ENGINE_UNAVAILABLE_FRAGMENT =
  'SQL query engine not available';
const TABLE_BOOTSTRAP_MULTI_NODE_CREATE_ATTEMPT_TIMEOUT_MS = 5000;
const TABLE_BOOTSTRAP_SQL_ENGINE_UNAVAILABLE_GRACE_MS = 60000;

function isTableBootstrapCandidateUnavailableError(error) {
  const message = String(error?.message || error || '');
  return message.includes(TABLE_BOOTSTRAP_SQL_ENGINE_UNAVAILABLE_FRAGMENT);
}

function isTableBootstrapCreatePrimaryAdvanceError(error) {
  return (
    isTimeoutShapedError(error) ||
    isTableBootstrapCandidateUnavailableError(error)
  );
}

function shouldForceAuthoritativeRepairAfterTimedOutCreate(options = {}) {
  if (options.createTimeoutObserved !== true) {
    return false;
  }
  const mutationVisibilityState = normalizeMutationVisibilityState(
    options?.visibilitySummary?.visibilityState,
  );
  if (
    options?.visibilitySummary?.authoritativeVisibilityConfirmed === true &&
    isPendingControlPlaneSystemTableVisibilityState(mutationVisibilityState)
  ) {
    return false;
  }
  const requiredBootstrapVisibilityState =
    typeof options.requiredBootstrapVisibilityState === 'string' ?
      options.requiredBootstrapVisibilityState :
      TABLE_BOOTSTRAP_VISIBILITY_STATE.NONE;
  const observedBootstrapVisibilityState =
    typeof options?.bootstrapVisibilitySnapshot?.state === 'string' ?
      options.bootstrapVisibilitySnapshot.state :
      TABLE_BOOTSTRAP_VISIBILITY_STATE.NONE;
  return !tableBootstrapVisibilityStateSatisfiesRequirement(
    requiredBootstrapVisibilityState,
    observedBootstrapVisibilityState,
  );
}

function resolveMutationVisibilityDelayMs(visibilitySummary, fallbackMs) {
  return Math.max(
    fallbackMs,
    Number.isFinite(visibilitySummary?.retryAfterMs) ?
      visibilitySummary.retryAfterMs :
      ZERO,
  );
}

function resolveMutationVisibilityWarning(options = {}) {
  const visibilityState = normalizeMutationVisibilityState(
    options?.visibilitySummary?.visibilityState,
  );
  const contractState = normalizeOwnerContractState(
    options?.visibilitySummary?.contractState,
    null,
  );
  if (
    contractState === OWNER_CONTRACT_STATE.DEFERRED ||
    visibilityState ===
      CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE.DEFERRED_BY_PRESSURE
  ) {
    return options.deferredWarning || null;
  }
  if (
    contractState === OWNER_CONTRACT_STATE.PENDING ||
    isPendingControlPlaneSystemTableVisibilityState(visibilityState)
  ) {
    return options.pendingWarning || null;
  }
  if (options.repairApplied === true) {
    return options.repairedWarning || null;
  }
  return null;
}

function shouldAdvanceTimedOutCreateMutationPrimary(options = {}) {
  if (!isTableBootstrapCreatePrimaryAdvanceError(options.lastCreateError)) {
    return false;
  }
  if (
    !Array.isArray(options.createQueryNodes) ||
    options.createQueryNodes.length <= ONE
  ) {
    return false;
  }
  if (
    !Number.isInteger(options.createPrimaryNodeIndex) ||
    options.createPrimaryNodeIndex >= options.createQueryNodes.length - ONE
  ) {
    return false;
  }
  const createVisibilityState = normalizeMutationVisibilityState(
    options?.createVisibilitySummary?.visibilityState,
  );
  const createContractState = normalizeOwnerContractState(
    options?.createVisibilitySummary?.contractState,
    null,
  );
  if (createVisibilityState !== null || createContractState !== null) {
    return false;
  }
  return (
    options?.bootstrapVisibilitySnapshot?.state ===
    TABLE_BOOTSTRAP_VISIBILITY_STATE.NONE
  );
}

function resolveTableBootstrapRepairQueryNodes(options = {}) {
  const attemptedCreateQueryNodes = Array.isArray(
    options.attemptedCreateQueryNodes,
  ) ?
    options.attemptedCreateQueryNodes :
    [];
  const visibilityQueryNodes = Array.isArray(options.visibilityQueryNodes) ?
    options.visibilityQueryNodes :
    attemptedCreateQueryNodes;
  const observedBootstrapVisibilityState =
    typeof options.observedBootstrapVisibilityState === 'string' ?
      options.observedBootstrapVisibilityState :
      TABLE_BOOTSTRAP_VISIBILITY_STATE.NONE;
  if (
    observedBootstrapVisibilityState ===
      TABLE_BOOTSTRAP_VISIBILITY_STATE.TABLE_ID_VISIBLE &&
    visibilityQueryNodes.length > ZERO
  ) {
    return visibilityQueryNodes;
  }
  if (
    options.createTimeoutObserved === true &&
    observedBootstrapVisibilityState === TABLE_BOOTSTRAP_VISIBILITY_STATE.NONE &&
    visibilityQueryNodes.length > attemptedCreateQueryNodes.length
  ) {
    return visibilityQueryNodes;
  }
  return attemptedCreateQueryNodes;
}

function shouldDeferTableBootstrapRepairForUnavailableCreate(options = {}) {
  if (!isTableBootstrapCandidateUnavailableError(options.lastCreateError)) {
    return false;
  }
  return (
    options?.bootstrapVisibilitySnapshot?.state ===
    TABLE_BOOTSTRAP_VISIBILITY_STATE.NONE
  );
}

function shouldUseUnattemptedTableBootstrapVisibilityNodes(options = {}) {
  if (!isTableBootstrapCreatePrimaryAdvanceError(options.lastCreateError)) {
    return false;
  }
  if (
    !Array.isArray(options.createQueryNodes) ||
    options.createQueryNodes.length <= ONE
  ) {
    return false;
  }
  if (
    !Number.isInteger(options.createPrimaryNodeIndex) ||
    options.createPrimaryNodeIndex >= options.createQueryNodes.length - ONE
  ) {
    return false;
  }
  return (
    options?.bootstrapVisibilitySnapshot?.state ===
    TABLE_BOOTSTRAP_VISIBILITY_STATE.NONE
  );
}

function resolveTableBootstrapVisibilityQueryContext(
  seedNode,
  options = {},
) {
  if (!shouldUseUnattemptedTableBootstrapVisibilityNodes(options)) {
    return {
      seedNode,
      options: options.baseOptions || {},
    };
  }
  const unattemptedQueryNodes = options.createQueryNodes.slice(
    options.createPrimaryNodeIndex + ONE,
  );
  return {
    seedNode: unattemptedQueryNodes[ZERO] || seedNode,
    options: {
      ...(options.baseOptions || {}),
      queryNodes: unattemptedQueryNodes.slice(ONE),
      fallbackNodes: unattemptedQueryNodes.slice(ONE),
    },
  };
}

function shouldCycleTableBootstrapCreatePrimary(options = {}) {
  if (!isTableBootstrapCandidateUnavailableError(options.lastCreateError)) {
    return false;
  }
  if (
    !Array.isArray(options.createQueryNodes) ||
    options.createQueryNodes.length <= ONE
  ) {
    return false;
  }
  return (
    options?.bootstrapVisibilitySnapshot?.state ===
    TABLE_BOOTSTRAP_VISIBILITY_STATE.NONE
  );
}

function resolveNextTableBootstrapCreatePrimaryIndex(options = {}) {
  const createQueryNodes = Array.isArray(options.createQueryNodes) ?
    options.createQueryNodes :
    [];
  if (createQueryNodes.length <= ONE) {
    return ZERO;
  }
  const createPrimaryNodeIndex = Number.isInteger(
    options.createPrimaryNodeIndex,
  ) ?
    options.createPrimaryNodeIndex :
    ZERO;
  if (createPrimaryNodeIndex < createQueryNodes.length - ONE) {
    return createPrimaryNodeIndex + ONE;
  }
  return ONE;
}

function resolveRequiredTableBootstrapVisibilityState(options = {}) {
  const requestedState =
    typeof options.requiredBootstrapVisibilityState === 'string' ?
      options.requiredBootstrapVisibilityState :
      TABLE_BOOTSTRAP_VISIBILITY_STATE.NONE;
  if (TABLE_BOOTSTRAP_VISIBILITY_STATE_ORDER[requestedState] >= ONE) {
    return requestedState;
  }
  if (options.requirePartitionVisibility === true) {
    return TABLE_BOOTSTRAP_VISIBILITY_STATE.ROUTABLE_DISTRIBUTION;
  }
  return TABLE_BOOTSTRAP_VISIBILITY_STATE.TABLE_ID_VISIBLE;
}

function resolveTableBootstrapCreateTimeoutMs(options = {}) {
  const remainingBootstrapTimeoutMs = resolveRemainingControlQueryTimeoutMs(
    options.deadlineAtMs,
  );
  const requiredBootstrapVisibilityState =
    typeof options.requiredBootstrapVisibilityState === 'string' ?
      options.requiredBootstrapVisibilityState :
      TABLE_BOOTSTRAP_VISIBILITY_STATE.NONE;
  const createQueryNodeCount = Array.isArray(options.createQueryNodes) ?
    options.createQueryNodes.length :
    ZERO;
  const createAttemptTimeoutCapMs = createQueryNodeCount > ONE ?
    Math.min(
      POLICY_APPLY_ATTEMPT_TIMEOUT_MS,
      TABLE_BOOTSTRAP_MULTI_NODE_CREATE_ATTEMPT_TIMEOUT_MS,
    ) :
    POLICY_APPLY_ATTEMPT_TIMEOUT_MS;
  const requiresExtendedBootstrapVisibility =
    tableBootstrapVisibilityStateSatisfiesRequirement(
      TABLE_BOOTSTRAP_VISIBILITY_STATE.PARTITIONS_VISIBLE,
      requiredBootstrapVisibilityState,
    );
  if (!requiresExtendedBootstrapVisibility || createQueryNodeCount <= ONE) {
    return Math.min(
      createAttemptTimeoutCapMs,
      remainingBootstrapTimeoutMs,
    );
  }
  return Math.max(
    ONE,
    Math.min(
      createAttemptTimeoutCapMs,
      remainingBootstrapTimeoutMs -
        TABLE_BOOTSTRAP_POST_CREATE_VISIBILITY_RESERVE_MS,
    ),
  );
}

function shouldAttemptTableBootstrapCreate(options = {}) {
  const createQueryNodeCount = Array.isArray(options.createQueryNodes) ?
    options.createQueryNodes.length :
    ZERO;
  const requiredBootstrapVisibilityState =
    typeof options.requiredBootstrapVisibilityState === 'string' ?
      options.requiredBootstrapVisibilityState :
      TABLE_BOOTSTRAP_VISIBILITY_STATE.NONE;
  const remainingBootstrapTimeoutMs =
    Number.isFinite(options.deadlineAtMs) ?
      Math.floor(options.deadlineAtMs - Date.now()) :
      ZERO;
  if (remainingBootstrapTimeoutMs <= ZERO) {
    return false;
  }
  if (createQueryNodeCount <= ONE) {
    return true;
  }
  const requiresExtendedBootstrapVisibility =
    tableBootstrapVisibilityStateSatisfiesRequirement(
      TABLE_BOOTSTRAP_VISIBILITY_STATE.PARTITIONS_VISIBLE,
      requiredBootstrapVisibilityState,
    );
  if (!requiresExtendedBootstrapVisibility) {
    return true;
  }
  const createAttemptTimeoutCapMs = createQueryNodeCount > ONE ?
    Math.min(
      POLICY_APPLY_ATTEMPT_TIMEOUT_MS,
      TABLE_BOOTSTRAP_MULTI_NODE_CREATE_ATTEMPT_TIMEOUT_MS,
    ) :
    POLICY_APPLY_ATTEMPT_TIMEOUT_MS;
  return (
    remainingBootstrapTimeoutMs >=
    TABLE_BOOTSTRAP_POST_CREATE_VISIBILITY_RESERVE_MS +
      createAttemptTimeoutCapMs
  );
}

function shouldExtendTableBootstrapForUnavailableCreate(options = {}) {
  if (!isTableBootstrapCandidateUnavailableError(options.lastCreateError)) {
    return false;
  }
  if (
    !Array.isArray(options.createQueryNodes) ||
    options.createQueryNodes.length <= ONE
  ) {
    return false;
  }
  if (
    options?.bootstrapVisibilitySnapshot?.state !==
    TABLE_BOOTSTRAP_VISIBILITY_STATE.NONE
  ) {
    return false;
  }
  if (
    !Number.isFinite(options.deadlineAtMs) ||
    !Number.isFinite(options.unavailableGraceDeadlineAtMs)
  ) {
    return false;
  }
  const now = Date.now();
  if (now < options.deadlineAtMs) {
    return false;
  }
  return (
    now +
      TABLE_BOOTSTRAP_POST_CREATE_VISIBILITY_RESERVE_MS +
      TABLE_BOOTSTRAP_MULTI_NODE_CREATE_ATTEMPT_TIMEOUT_MS <=
    options.unavailableGraceDeadlineAtMs
  );
}

function resolveExtendedTableBootstrapDeadlineForUnavailableCreate(
  options = {},
) {
  const unavailableGraceDeadlineAtMs = Number.isFinite(
    options.unavailableGraceDeadlineAtMs,
  ) ?
    options.unavailableGraceDeadlineAtMs :
    Date.now();
  return Math.min(
    unavailableGraceDeadlineAtMs,
    Date.now() +
      TABLE_BOOTSTRAP_POST_CREATE_VISIBILITY_RESERVE_MS +
      TABLE_BOOTSTRAP_MULTI_NODE_CREATE_ATTEMPT_TIMEOUT_MS,
  );
}

function resolveObservedTableBootstrapVisibilityState(options = {}) {
  const tableId = String(options.tableId || '');
  if (tableId.length <= ZERO) {
    return TABLE_BOOTSTRAP_VISIBILITY_STATE.NONE;
  }
  const partitionIds = Array.isArray(options.partitionIds) ?
    options.partitionIds.filter(
      (partitionId) =>
        typeof partitionId === 'string' && partitionId.length > ZERO,
    ) :
    [];
  if (partitionIds.length <= ZERO) {
    return TABLE_BOOTSTRAP_VISIBILITY_STATE.TABLE_ID_VISIBLE;
  }
  if (
    String(options.distribution?.topologyState || '') ===
    TOPOLOGY_STATE_ROUTABLE
  ) {
    return TABLE_BOOTSTRAP_VISIBILITY_STATE.ROUTABLE_DISTRIBUTION;
  }
  return TABLE_BOOTSTRAP_VISIBILITY_STATE.PARTITIONS_VISIBLE;
}

function tableBootstrapVisibilityStateSatisfiesRequirement(
  requiredState,
  observedState,
) {
  return (
    (TABLE_BOOTSTRAP_VISIBILITY_STATE_ORDER[observedState] || ZERO) >=
    (TABLE_BOOTSTRAP_VISIBILITY_STATE_ORDER[requiredState] || ZERO)
  );
}

function buildTableBootstrapVisibilitySnapshot(options = {}) {
  const tableId = String(options.tableId || '');
  const partitionIds = Array.isArray(options.partitionIds) ?
    options.partitionIds.filter(
      (partitionId) =>
        typeof partitionId === 'string' && partitionId.length > ZERO,
    ) :
    [];
  const distribution =
    options.distribution && typeof options.distribution === 'object' ?
      options.distribution :
      null;
  const state = resolveObservedTableBootstrapVisibilityState({
    tableId,
    partitionIds,
    distribution,
  });
  return {
    state,
    tableId,
    partitionIds,
    distribution,
  };
}

function buildBenchmarkTableBootstrapResult(options = {}) {
  const visibilitySummary =
    options.visibilitySummary && typeof options.visibilitySummary === 'object' ?
      options.visibilitySummary :
      summarizeMutationVisibility(null);
  const snapshot =
    options.bootstrapVisibilitySnapshot &&
    typeof options.bootstrapVisibilitySnapshot === 'object' ?
      options.bootstrapVisibilitySnapshot :
      buildTableBootstrapVisibilitySnapshot();
  const distribution =
    snapshot.distribution && typeof snapshot.distribution === 'object' ?
      snapshot.distribution :
      null;
  const result = {
    tableName: options.tableName,
    tableId: snapshot.tableId,
    createTimeoutError: options.createTimeoutError,
    createVisibilityState: visibilitySummary.visibilityState,
    createContractState: visibilitySummary.contractState,
    createNextAction: visibilitySummary.nextAction,
    createVisibilityAuthoritativeConfirmed:
      visibilitySummary.authoritativeVisibilityConfirmed,
    createVisibilityRetryAfterMs: visibilitySummary.retryAfterMs,
    tableVisibilityRepairApplied: options.tableVisibilityRepairApplied,
    tableVisibilityWarning: resolveMutationVisibilityWarning({
      visibilitySummary,
      repairApplied: options.tableVisibilityRepairApplied,
      pendingWarning: 'table_id_visibility_pending_after_authoritative_commit',
      deferredWarning: 'table_id_visibility_deferred_by_pressure',
      repairedWarning:
        'table_id_visibility_repaired_from_authoritative_snapshot',
    }),
    tableBootstrapVisibilityRequirementState:
      options.requiredBootstrapVisibilityState,
    tableBootstrapVisibilityState: snapshot.state,
  };
  if (distribution) {
    result.tableDistributionTopologyState = distribution.topologyState;
    result.tableDistributionTopologySignature = distribution.topologySignature;
    result.tableDistributionReplicaNodeCount = distribution.replicaNodeCount;
  }
  return result;
}

/**
 * Check whether one object has no own enumerable fields.
 * @param {*} value
 * @return {boolean}
 */
function isEmptyObject(value) {
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === ZERO
  );
}

/**
 * Resolve whether an observed policy contains every expected key/value pair.
 * @param {Object} expected
 * @param {Object} observed
 * @return {boolean}
 */
function policyContainsExpected(expected, observed) {
  if (
    !expected ||
    typeof expected !== 'object' ||
    !observed ||
    typeof observed !== 'object'
  ) {
    return false;
  }

  for (const [key, expectedValue] of Object.entries(expected)) {
    const observedValue = observed[key];
    if (
      expectedValue &&
      typeof expectedValue === 'object' &&
      !Array.isArray(expectedValue)
    ) {
      if (!policyContainsExpected(expectedValue, observedValue)) {
        return false;
      }
      continue;
    }
    if (observedValue !== expectedValue) {
      return false;
    }
  }

  return true;
}

/**
 * Query table_id for a table name.
 * @param {Object} seedNode
 * @param {string} tableName
 * @return {Promise<string|null>}
 */
async function queryTableId(seedNode, tableName, options = {}) {
  const sql =
    SQL_SELECT_TABLE_ID_PREFIX +
    escapeSql(tableName) +
    SQL_SELECT_TABLE_ID_SUFFIX;
  const queryNodes = resolveControlQueryNodes(seedNode, options);
  let lastError = null;
  let successfulQueryObserved = false;
  for (const candidateNode of queryNodes) {
    try {
      const result = await queryControlSingleWithProgressRetry(
        candidateNode,
        sql,
        [],
        {
          lane: CONTROL_QUERY_LANE_SNAPSHOT,
        },
      );
      successfulQueryObserved = true;
      const tableId = firstTableId(rowsFromResult(result));
      if (tableId) {
        return tableId;
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (!successfulQueryObserved && lastError) {
    throw lastError;
  }
  return null;
}

/**
 * Query partition IDs for one table ID.
 * @param {Object} seedNode
 * @param {string} tableId
 * @param {Object} [options]
 * @return {Promise<Array<string>>}
 */
async function queryPartitionIdsByTableId(seedNode, tableId, options = {}) {
  const sql =
    SQL_SELECT_PARTITIONS_BY_TABLE_ID_PREFIX +
    escapeSql(tableId) +
    SQL_SELECT_PARTITIONS_BY_TABLE_ID_SUFFIX;
  const queryNodes = resolveControlQueryNodes(seedNode, options);
  let lastError = null;
  let successfulQueryObserved = false;
  for (const candidateNode of queryNodes) {
    try {
      const result = await queryControlSingleWithProgressRetry(
        candidateNode,
        sql,
        [],
        {
          lane: CONTROL_QUERY_LANE_SNAPSHOT,
        },
      );
      successfulQueryObserved = true;
      const partitionIds = rowsFromResult(result)
        .map((row) => String(row?.partition_id || row?.partitionId || ''))
        .filter((partitionId) => partitionId.length > ZERO);
      if (partitionIds.length > ZERO) {
        return partitionIds;
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (!successfulQueryObserved && lastError) {
    throw lastError;
  }
  return [];
}

/**
 * Query table_policies for one table ID.
 * @param {Object} seedNode
 * @param {string} tableId
 * @return {Promise<Object|null>}
 */
async function queryTablePolicies(seedNode, tableId, options = {}) {
  const tableName =
    typeof options.tableName === 'string' && options.tableName.length > ZERO ?
      options.tableName :
      null;
  const lookupSql = [];
  if (tableName) {
    lookupSql.push(
      SQL_SELECT_TABLE_POLICIES_BY_TABLE_NAME_PREFIX +
        escapeSql(tableName) +
        SQL_SELECT_TABLE_POLICIES_BY_TABLE_NAME_SUFFIX,
    );
  }
  lookupSql.push(
    SQL_SELECT_TABLE_POLICIES_BY_TABLE_ID_PREFIX +
      escapeSql(tableId) +
      SQL_SELECT_TABLE_POLICIES_BY_TABLE_ID_SUFFIX,
  );
  for (const sql of lookupSql) {
    const result = await queryControl(seedNode, sql, [], {
      lane: CONTROL_QUERY_LANE_SNAPSHOT,
      queryNodes: options.queryNodes,
      fallbackNodes: options.fallbackNodes,
    });
    const policies = firstTablePolicies(rowsFromResult(result));
    if (policies !== null) {
      return policies;
    }
  }
  return null;
}

/**
 * Wait until table metadata becomes visible.
 * @param {Object} seedNode
 * @param {string} tableName
 * @return {Promise<string>}
 */
async function waitForTableId(seedNode, tableName, options = {}) {
  const deadline = Date.now() + TABLE_ID_VISIBILITY_TIMEOUT_MS;
  let tableId = null;
  let lastQueryError = null;
  while (!tableId && Date.now() < deadline) {
    try {
      tableId = await queryTableId(seedNode, tableName, options);
      lastQueryError = null;
    } catch (error) {
      lastQueryError = String(error?.message || error);
    }
    if (tableId || Date.now() >= deadline) {
      break;
    }
    await sleep(TABLE_ID_VISIBILITY_POLL_INTERVAL_MS);
  }
  assert.ok(
    tableId,
    'Timed out waiting for table_id visibility for "' +
      tableName +
      '"' +
      (lastQueryError ? ' (lastQueryError=' + lastQueryError + ')' : ''),
  );
  return tableId;
}

/**
 * Ensure benchmark workload table exists and metadata is visible.
 * @param {Object} seedNode
 * @param {Object} [options]
 * @param {string} [options.tableName]
 * @return {Promise<Object>}
 */
async function ensureBenchmarkPartitioningTable(seedNode, options = {}) {
  assert.ok(
    seedNode &&
      (typeof seedNode.query === 'function' ||
        typeof seedNode.queryWithTimeout === 'function'),
    'ensureBenchmarkPartitioningTable requires seed node query capability',
  );
  const resolvedTableName = resolveBenchmarkTableName(options.tableName);
  assert.ok(
    IDENTIFIER_PATTERN.test(resolvedTableName),
    'Invalid benchmark table identifier: ' + resolvedTableName,
  );
  const requiredBootstrapVisibilityState =
    resolveRequiredTableBootstrapVisibilityState(options);
  const createSql =
    SQL_CREATE_TABLE_PREFIX + resolvedTableName + SQL_CREATE_TABLE_SUFFIX;
  const createQueryNodes = resolveControlQueryNodes(seedNode, options);
  let createPrimaryNodeIndex = ZERO;
  let deadline =
    Date.now() +
    (tableBootstrapVisibilityStateSatisfiesRequirement(
      TABLE_BOOTSTRAP_VISIBILITY_STATE.PARTITIONS_VISIBLE,
      requiredBootstrapVisibilityState,
    ) ?
      TABLE_BOOTSTRAP_TIMEOUT_MS :
      TABLE_ID_VISIBILITY_TIMEOUT_MS);
  const unavailableGraceDeadline =
    deadline + TABLE_BOOTSTRAP_SQL_ENGINE_UNAVAILABLE_GRACE_MS;
  let createTimeoutError = null;
  let lastCreateError = null;
  let lastCreateErrorObject = null;
  let lastVisibilityError = null;
  let lastPartitionVisibilityError = null;
  let lastTopologyVisibilityError = null;
  let createVisibilitySummary = summarizeMutationVisibility(null);
  let bootstrapVisibilitySnapshot = buildTableBootstrapVisibilitySnapshot();
  let tableVisibilityRepairAttempted = false;
  let tableVisibilityRepairApplied = false;
  let postRepairVisibilitySweepPending = false;
  while (Date.now() <= deadline || postRepairVisibilitySweepPending) {
    const visibilitySweepOnly = postRepairVisibilitySweepPending;
    postRepairVisibilitySweepPending = false;
    if (!visibilitySweepOnly) {
      const createPrimaryNode =
        createQueryNodes[createPrimaryNodeIndex] || seedNode;
      const remainingCreateQueryNodes = createQueryNodes.filter(
        (_node, index) => {
          return index !== createPrimaryNodeIndex;
        },
      );
      if (
        shouldAttemptTableBootstrapCreate({
          deadlineAtMs: deadline,
          requiredBootstrapVisibilityState,
          createQueryNodes,
        })
      ) {
        const createAttemptTimeoutMs = resolveTableBootstrapCreateTimeoutMs({
          deadlineAtMs: deadline,
          requiredBootstrapVisibilityState,
          createQueryNodes,
        });
        try {
          const createResult = await queryControl(
            createPrimaryNode,
            createSql,
            [],
            {
              timeoutMs: createAttemptTimeoutMs,
              lane: CONTROL_QUERY_LANE_CONTROL,
              executionMode:
                CONTROL_QUERY_EXECUTION_MODE.MUTATION_SINGLE_FLIGHT,
              queryNodes: remainingCreateQueryNodes,
            },
          );
          createVisibilitySummary = advanceMutationVisibilitySummary(
            createVisibilitySummary,
            createResult,
          );
          lastCreateError = null;
          lastCreateErrorObject = null;
        } catch (error) {
          if (
            !isTimeoutShapedError(error) &&
            !isTableBootstrapCandidateUnavailableError(error) &&
            !isRetryableControlPlaneProgressError(error)
          ) {
            throw error;
          }
          createVisibilitySummary = advanceMutationVisibilitySummary(
            createVisibilitySummary,
            error,
          );
          if (isTimeoutShapedError(error)) {
            createTimeoutError = String(error?.message || error);
          }
          lastCreateError = String(error?.message || error);
          lastCreateErrorObject = error;
        }
      }
    }

    const visibilityQueryContext =
      resolveTableBootstrapVisibilityQueryContext(seedNode, {
        baseOptions: options,
        lastCreateError: lastCreateErrorObject,
        createQueryNodes,
        createPrimaryNodeIndex,
        bootstrapVisibilitySnapshot,
      });

    try {
      const tableId = await queryTableId(
        visibilityQueryContext.seedNode,
        resolvedTableName,
        visibilityQueryContext.options,
      );
      if (tableId) {
        bootstrapVisibilitySnapshot = buildTableBootstrapVisibilitySnapshot({
          tableId,
        });
        if (
          tableBootstrapVisibilityStateSatisfiesRequirement(
            requiredBootstrapVisibilityState,
            bootstrapVisibilitySnapshot.state,
          )
        ) {
          return buildBenchmarkTableBootstrapResult({
            tableName: resolvedTableName,
            createTimeoutError,
            visibilitySummary: createVisibilitySummary,
            tableVisibilityRepairApplied,
            requiredBootstrapVisibilityState,
            bootstrapVisibilitySnapshot,
          });
        }
        try {
          const partitionIds = await queryPartitionIdsByTableId(
            visibilityQueryContext.seedNode,
            tableId,
            visibilityQueryContext.options,
          );
          if (partitionIds.length <= ZERO) {
            bootstrapVisibilitySnapshot = buildTableBootstrapVisibilitySnapshot(
              {
                tableId,
              },
            );
            lastPartitionVisibilityError =
              TABLE_BOOTSTRAP_PARTITION_VISIBILITY_MISSING;
            lastTopologyVisibilityError = null;
            lastVisibilityError = null;
          } else {
            bootstrapVisibilitySnapshot = buildTableBootstrapVisibilitySnapshot(
              {
                tableId,
                partitionIds,
              },
            );
            if (
              tableBootstrapVisibilityStateSatisfiesRequirement(
                requiredBootstrapVisibilityState,
                bootstrapVisibilitySnapshot.state,
              )
            ) {
              return buildBenchmarkTableBootstrapResult({
                tableName: resolvedTableName,
                createTimeoutError,
                visibilitySummary: createVisibilitySummary,
                tableVisibilityRepairApplied,
                requiredBootstrapVisibilityState,
                bootstrapVisibilitySnapshot,
              });
            }
            const distribution = await queryTableDistribution(
              visibilityQueryContext.seedNode,
              {
                ...visibilityQueryContext.options,
                tableName: resolvedTableName,
              },
            );
            bootstrapVisibilitySnapshot = buildTableBootstrapVisibilitySnapshot(
              {
                tableId,
                partitionIds,
                distribution,
              },
            );
            if (
              tableBootstrapVisibilityStateSatisfiesRequirement(
                requiredBootstrapVisibilityState,
                bootstrapVisibilitySnapshot.state,
              )
            ) {
              return buildBenchmarkTableBootstrapResult({
                tableName: resolvedTableName,
                createTimeoutError,
                visibilitySummary: createVisibilitySummary,
                tableVisibilityRepairApplied,
                requiredBootstrapVisibilityState,
                bootstrapVisibilitySnapshot,
              });
            }
            lastTopologyVisibilityError =
              TABLE_BOOTSTRAP_TOPOLOGY_NOT_ROUTABLE_PREFIX +
              ':' +
              distribution.topologyState +
              ':' +
              String(distribution.topologySignature || 'none');
          }
        } catch (error) {
          lastPartitionVisibilityError = String(error?.message || error);
          lastTopologyVisibilityError = null;
        }
      }
      lastVisibilityError = null;
    } catch (error) {
      lastVisibilityError = String(error?.message || error);
    }

    if (visibilitySweepOnly) {
      break;
    }
    if (
      shouldAdvanceTimedOutCreateMutationPrimary({
        lastCreateError: lastCreateErrorObject,
        createQueryNodes,
        createPrimaryNodeIndex,
        createVisibilitySummary,
        bootstrapVisibilitySnapshot,
      })
    ) {
      if (Date.now() < deadline) {
        createPrimaryNodeIndex += ONE;
        continue;
      }
    }
    if (
      shouldCycleTableBootstrapCreatePrimary({
        lastCreateError: lastCreateErrorObject,
        createQueryNodes,
        bootstrapVisibilitySnapshot,
      })
    ) {
      createPrimaryNodeIndex = resolveNextTableBootstrapCreatePrimaryIndex({
        createQueryNodes,
        createPrimaryNodeIndex,
      });
    }
    if (
      !tableVisibilityRepairAttempted &&
      !shouldDeferTableBootstrapRepairForUnavailableCreate({
        lastCreateError: lastCreateErrorObject,
        bootstrapVisibilitySnapshot,
      }) &&
      (!shouldDeferAuthoritativeRepair(createVisibilitySummary) ||
        shouldForceAuthoritativeRepairAfterTimedOutCreate({
          createTimeoutObserved: createTimeoutError !== null,
          requiredBootstrapVisibilityState,
          bootstrapVisibilitySnapshot,
          visibilitySummary: createVisibilitySummary,
        }))
    ) {
      tableVisibilityRepairAttempted = true;
      const attemptedCreateQueryNodes = createQueryNodes.slice(
        ZERO,
        createPrimaryNodeIndex + ONE,
      );
      const repairQueryNodes = resolveTableBootstrapRepairQueryNodes({
        attemptedCreateQueryNodes,
        visibilityQueryNodes: createQueryNodes,
        observedBootstrapVisibilityState: bootstrapVisibilitySnapshot.state,
        createTimeoutObserved: createTimeoutError !== null,
      });
      const repairApplied = await forceRepairControlSnapshotAcrossQueryNodes(
        seedNode,
        {
          ...options,
          queryNodes: repairQueryNodes,
          fallbackNodes: repairQueryNodes,
        },
      );
      tableVisibilityRepairApplied =
        repairApplied || tableVisibilityRepairApplied;
      if (Date.now() >= deadline) {
        postRepairVisibilitySweepPending = true;
        continue;
      }
    }
    if (
      shouldExtendTableBootstrapForUnavailableCreate({
        lastCreateError: lastCreateErrorObject,
        createQueryNodes,
        bootstrapVisibilitySnapshot,
        deadlineAtMs: deadline,
        unavailableGraceDeadlineAtMs: unavailableGraceDeadline,
      })
    ) {
      deadline = resolveExtendedTableBootstrapDeadlineForUnavailableCreate({
        unavailableGraceDeadlineAtMs: unavailableGraceDeadline,
      });
      continue;
    }

    if (Date.now() >= deadline) {
      break;
    }
    await sleep(
      resolveMutationVisibilityDelayMs(
        createVisibilitySummary,
        resolveControlPlaneRetryDelayMs(
          lastCreateErrorObject,
          TABLE_ID_VISIBILITY_POLL_INTERVAL_MS,
        ),
      ),
    );
  }

  assert.fail(
    'Timed out waiting for ' +
      TABLE_BOOTSTRAP_VISIBILITY_STATE_LABEL[requiredBootstrapVisibilityState] +
      ' for "' +
      resolvedTableName +
      '" (lastCreateError=' +
      String(lastCreateError || 'none') +
      ', lastCreateVisibilityState=' +
      String(createVisibilitySummary.visibilityState || 'none') +
      ', lastCreateVisibilityRetryAfterMs=' +
      String(createVisibilitySummary.retryAfterMs || 'none') +
      ', lastVisibilityError=' +
      String(lastVisibilityError || 'none') +
      ', lastPartitionVisibilityError=' +
      String(lastPartitionVisibilityError || 'none') +
      ', lastTopologyVisibilityError=' +
      String(lastTopologyVisibilityError || 'none') +
      ', requiredBootstrapVisibilityState=' +
      String(
        requiredBootstrapVisibilityState ||
          TABLE_BOOTSTRAP_VISIBILITY_STATE.NONE,
      ) +
      ', observedBootstrapVisibilityState=' +
      String(
        bootstrapVisibilitySnapshot.state ||
          TABLE_BOOTSTRAP_VISIBILITY_STATE.NONE,
      ) +
      ', authoritativeRepairAttempted=' +
      String(tableVisibilityRepairAttempted) +
      ', authoritativeRepairApplied=' +
      String(tableVisibilityRepairApplied) +
      ')',
  );
}

/**
 * Apply split-friendly table policies to a benchmark workload table.
 * @param {Object} seedNode
 * @param {Object} [options]
 * @param {string} [options.tableName]
 * @param {Object} [options.tablePolicies]
 * @return {Promise<Object>}
 */
async function prepareBenchmarkPartitioningTable(seedNode, options = {}) {
  const ensured = await ensureBenchmarkPartitioningTable(seedNode, {
    tableName: options.tableName,
    requiredBootstrapVisibilityState:
      TABLE_BOOTSTRAP_VISIBILITY_STATE.PARTITIONS_VISIBLE,
    queryNodes: options.queryNodes,
    fallbackNodes: options.fallbackNodes,
  });
  const tablePolicies =
    options.tablePolicies && typeof options.tablePolicies === 'object' ?
      options.tablePolicies :
      DEFAULT_TABLE_SPLIT_POLICIES;
  const policySql =
    SQL_UPDATE_TABLE_POLICIES_PREFIX +
    escapeSql(JSON.stringify(tablePolicies)) +
    SQL_UPDATE_TABLE_POLICIES_MID +
    escapeSql(ensured.tableId) +
    SQL_UPDATE_TABLE_POLICIES_SUFFIX;

  // Table metadata can still receive asynchronous updates shortly after
  // CREATE TABLE. Re-apply policy until read-back is stable so we do not
  // proceed with split checks against a reverted default "{}" payload.
  const visibilityDeadline = Date.now() + POLICY_APPLY_TIMEOUT_MS;
  let applyAttemptCount = ZERO;
  let policyVisible = false;
  let observedPolicy = null;
  let stableMatchCount = ZERO;
  let noOpApplyCount = ZERO;
  let policyUpdateNoOpDetected = false;
  let positivePolicyMutationObserved = false;
  let lastPolicyApplyError = null;
  let lastPolicyVisibilityError = null;
  let lastPolicyApplySummary = null;
  let policyApplyVisibilitySummary = summarizeMutationVisibility(null);
  let policyVisibilityRepairAttempted = false;
  let policyVisibilityRepairApplied = false;
  while (Date.now() <= visibilityDeadline) {
    try {
      applyAttemptCount += 1;
      const applyResult = await queryControl(seedNode, policySql, [], {
        timeoutMs: POLICY_APPLY_ATTEMPT_TIMEOUT_MS,
        lane: CONTROL_QUERY_LANE_CONTROL,
        executionMode: CONTROL_QUERY_EXECUTION_MODE.MUTATION_SINGLE_FLIGHT,
        queryNodes: options.queryNodes,
        fallbackNodes: options.fallbackNodes,
      });
      lastPolicyApplySummary = summarizeMutationResult(applyResult);
      policyApplyVisibilitySummary = advanceMutationVisibilitySummary(
        policyApplyVisibilitySummary,
        applyResult,
      );
      const affectedRows = affectedRowCountFromResult(applyResult);
      if (affectedRows === ZERO) {
        noOpApplyCount += 1;
      } else {
        noOpApplyCount = ZERO;
        if (Number.isFinite(affectedRows) && affectedRows > ZERO) {
          positivePolicyMutationObserved = true;
        }
      }
      lastPolicyApplyError = null;
    } catch (error) {
      stableMatchCount = ZERO;
      policyApplyVisibilitySummary = advanceMutationVisibilitySummary(
        policyApplyVisibilitySummary,
        error,
      );
      lastPolicyApplyError = String(error?.message || error);
      if (Date.now() >= visibilityDeadline) {
        break;
      }
      await sleep(
        resolveControlPlaneRetryDelayMs(error, POLICY_APPLY_RETRY_DELAY_MS),
      );
      continue;
    }

    try {
      observedPolicy = await queryTablePolicies(seedNode, ensured.tableId, {
        tableName: ensured.tableName,
        queryNodes: options.queryNodes,
        fallbackNodes: options.fallbackNodes,
      });
      lastPolicyVisibilityError = null;
      if (policyContainsExpected(tablePolicies, observedPolicy)) {
        stableMatchCount += 1;
        if (stableMatchCount >= 2) {
          policyVisible = true;
          break;
        }
      } else {
        stableMatchCount = ZERO;
        if (noOpApplyCount >= 3 && isEmptyObject(observedPolicy)) {
          policyUpdateNoOpDetected = true;
          break;
        }
      }
    } catch (error) {
      stableMatchCount = ZERO;
      lastPolicyVisibilityError = String(error?.message || error);
    }
    if (
      !policyVisible &&
      !policyVisibilityRepairAttempted &&
      !shouldDeferAuthoritativeRepair(policyApplyVisibilitySummary)
    ) {
      policyVisibilityRepairAttempted = true;
      policyVisibilityRepairApplied =
        (await forceRepairControlSnapshotAcrossQueryNodes(seedNode, options)) ||
        policyVisibilityRepairApplied;
    }
    if (Date.now() >= visibilityDeadline) {
      break;
    }
    await sleep(
      resolveMutationVisibilityDelayMs(
        policyApplyVisibilitySummary,
        POLICY_VISIBILITY_POLL_INTERVAL_MS,
      ),
    );
  }
  if (!policyVisible && policyUpdateNoOpDetected) {
    return {
      ...ensured,
      tablePolicies,
      tablePoliciesApplied: false,
      tablePoliciesApplyWarning: 'sql_system_table_update_noop_detected',
      tablePoliciesApplyVisibilityState:
        policyApplyVisibilitySummary.visibilityState,
      tablePoliciesApplyVisibilityAuthoritativeConfirmed:
        policyApplyVisibilitySummary.authoritativeVisibilityConfirmed,
      tablePoliciesApplyVisibilityRetryAfterMs:
        policyApplyVisibilitySummary.retryAfterMs,
      tablePoliciesVisibilityRepairApplied: policyVisibilityRepairApplied,
      tablePoliciesApplyDiagnostics: {
        applyAttempts: applyAttemptCount,
        lastApplySummary: lastPolicyApplySummary,
      },
    };
  }
  if (!policyVisible && positivePolicyMutationObserved) {
    return {
      ...ensured,
      tablePolicies,
      tablePoliciesApplied: true,
      tablePoliciesApplyWarning:
        resolveMutationVisibilityWarning({
          visibilitySummary: policyApplyVisibilitySummary,
          pendingWarning:
            'table_policy_visibility_pending_after_authoritative_commit',
          deferredWarning: 'table_policy_visibility_deferred_by_pressure',
        }) || 'table_policy_visibility_timeout_assumed_applied',
      tablePoliciesApplyVisibilityState:
        policyApplyVisibilitySummary.visibilityState,
      tablePoliciesApplyVisibilityAuthoritativeConfirmed:
        policyApplyVisibilitySummary.authoritativeVisibilityConfirmed,
      tablePoliciesApplyVisibilityRetryAfterMs:
        policyApplyVisibilitySummary.retryAfterMs,
      tablePoliciesVisibilityRepairApplied: policyVisibilityRepairApplied,
      tablePoliciesApplyDiagnostics: {
        applyAttempts: applyAttemptCount,
        lastApplySummary: lastPolicyApplySummary,
      },
    };
  }
  assert.ok(
    policyVisible,
    'Timed out waiting for table split policies to become visible for "' +
      ensured.tableName +
      '" (observed=' +
      JSON.stringify(observedPolicy) +
      ', expected=' +
      JSON.stringify(tablePolicies) +
      ', lastError=' +
      String(lastPolicyVisibilityError || 'none') +
      ', lastApplyError=' +
      String(lastPolicyApplyError || 'none') +
      ', lastApplyVisibilityState=' +
      String(policyApplyVisibilitySummary.visibilityState || 'none') +
      ', lastApplyVisibilityRetryAfterMs=' +
      String(policyApplyVisibilitySummary.retryAfterMs || 'none') +
      ', authoritativeRepairAttempted=' +
      String(policyVisibilityRepairAttempted) +
      ', authoritativeRepairApplied=' +
      String(policyVisibilityRepairApplied) +
      ', applyAttempts=' +
      applyAttemptCount +
      ', lastApplySummary=' +
      JSON.stringify(lastPolicyApplySummary) +
      ')',
  );
  return {
    ...ensured,
    tablePolicies,
    tablePoliciesApplyVisibilityState:
      policyApplyVisibilitySummary.visibilityState,
    tablePoliciesApplyVisibilityAuthoritativeConfirmed:
      policyApplyVisibilitySummary.authoritativeVisibilityConfirmed,
    tablePoliciesApplyVisibilityRetryAfterMs:
      policyApplyVisibilitySummary.retryAfterMs,
    tablePoliciesVisibilityRepairApplied: policyVisibilityRepairApplied,
  };
}

/**
 * Assert split-policy preconditions before running split-sensitive load checks.
 * Treats known policy no-op outcomes as hard setup failures so scenarios fail
 * fast with actionable diagnostics instead of timing out later.
 * @param {Object} tablePreparation
 * @param {Object} [options]
 * @param {string} [options.scenarioName]
 * @return {void}
 */
function assertSplitPolicyPrecondition(tablePreparation, options = {}) {
  const preparation =
    tablePreparation && typeof tablePreparation === 'object' ?
      tablePreparation :
      {};
  if (preparation.tablePoliciesApplied !== false) {
    return;
  }
  const scenarioName =
    typeof options.scenarioName === 'string' &&
    options.scenarioName.length > ZERO ?
      options.scenarioName :
      TABLE_POLICY_PRECONDITION_SCENARIO_DEFAULT;
  const tableName = String(preparation.tableName || 'unknown-table');
  const warningCode = String(
    preparation.tablePoliciesApplyWarning || 'table_policy_apply_failed',
  );
  throw new Error(
    'Split-policy precondition failed for "' +
      tableName +
      '" in scenario "' +
      scenarioName +
      '": ' +
      warningCode,
  );
}

export const TABLE_DISTRIBUTION_HELPERS_SEGMENT_3 = {
  TABLE_NAME_LOGS,
  TABLE_NAME_BENCHMARK_EVENTS,
  SERVICE_TYPE_PARTITION,
  STATUS_ACTIVE,
  ZERO,
  ONE,
  BENCHMARK_WORKLOAD_PROFILE,
  IDENTIFIER_PATTERN,
  TABLE_ID_VISIBILITY_TIMEOUT_MS,
  TABLE_BOOTSTRAP_TIMEOUT_MS,
  TABLE_BOOTSTRAP_POST_CREATE_VISIBILITY_RESERVE_MS,
  TABLE_ID_VISIBILITY_POLL_INTERVAL_MS,
  CONTROL_QUERY_TIMEOUT_MS,
  POLICY_APPLY_TIMEOUT_MS,
  POLICY_APPLY_ATTEMPT_TIMEOUT_MS,
  POLICY_VISIBILITY_POLL_INTERVAL_MS,
  POLICY_APPLY_RETRY_DELAY_MS,
  CONTROL_QUERY_LANE_CONTROL,
  CONTROL_QUERY_LANE_SNAPSHOT,
  CONTROL_QUERY_PROGRESS_RETRY_DELAY_MS,
  CONTROL_QUERY_MIN_CANDIDATE_TIMEOUT_MS,
  CONTROL_QUERY_MUTATION_FALLBACK_ERROR_FRAGMENTS,
  CONTROL_QUERY_EXECUTION_MODE,
  CONTROL_QUERY_OUTCOME_DEFERRED,
  TABLE_POLICY_PRECONDITION_SCENARIO_DEFAULT,
  DEFAULT_BENCHMARK_READY_NODE_COUNT,
  PARTITIONING_LOAD_HEADROOM_RATIO,
  TABLE_DISTRIBUTION_TOPOLOGY_STALL_TIMEOUT_MS,
  TABLE_BOOTSTRAP_PARTITION_VISIBILITY_MISSING,
  TABLE_BOOTSTRAP_TOPOLOGY_NOT_ROUTABLE_PREFIX,
  TABLE_BOOTSTRAP_VISIBILITY_STATE,
  TABLE_BOOTSTRAP_VISIBILITY_STATE_ORDER,
  TABLE_BOOTSTRAP_VISIBILITY_STATE_LABEL,
  TOPOLOGY_STATE_ROUTABLE,
  TOPOLOGY_STATE_OPAQUE,
  TOPOLOGY_STATE_INVALID,
  TOPOLOGY_REASON_LEADER_SERVICE_MISSING,
  TOPOLOGY_REASON_ABOVE_TARGET_REPLICA_COUNT,
  RAFT_ROLE_LEADER,
  PARTITIONING_ADAPTIVE_DISPATCH_GUARDRAIL,
  DEFAULT_TABLE_SPLIT_POLICIES,
  SQL_SELECT_TABLE_PARTITIONS_PREFIX,
  SQL_SELECT_TABLE_PARTITIONS_SUFFIX,
  SQL_SELECT_TABLE_ID_PREFIX,
  SQL_SELECT_TABLE_ID_SUFFIX,
  SQL_SELECT_TABLE_POLICIES_BY_TABLE_ID_PREFIX,
  SQL_SELECT_TABLE_POLICIES_BY_TABLE_ID_SUFFIX,
  SQL_SELECT_TABLE_POLICIES_BY_TABLE_NAME_PREFIX,
  SQL_SELECT_TABLE_POLICIES_BY_TABLE_NAME_SUFFIX,
  SQL_SELECT_PARTITIONS_BY_TABLE_ID_PREFIX,
  SQL_SELECT_PARTITIONS_BY_TABLE_ID_SUFFIX,
  SQL_CREATE_TABLE_PREFIX,
  SQL_CREATE_TABLE_SUFFIX,
  SQL_UPDATE_TABLE_POLICIES_PREFIX,
  SQL_UPDATE_TABLE_POLICIES_MID,
  SQL_UPDATE_TABLE_POLICIES_SUFFIX,
  SQL_CONTROL_SNAPSHOT,
  SQL_CONTROL_SNAPSHOT_FORCE_REPAIR,
  SQL_SELECT_ACTIVE_PARTITION_SERVICES_PREFIX,
  TIMEOUT_ERROR_PATTERN,
  TABLE_DISTRIBUTION_OBSERVATION_STATE_OBSERVED,
  TABLE_DISTRIBUTION_OBSERVATION_STATE_DEFERRED,
  TABLE_DISTRIBUTION_OBSERVATION_STATE_UNAVAILABLE,
  TABLE_DISTRIBUTION_OBSERVATION_SIGNATURE_DEFERRED,
  TABLE_DISTRIBUTION_OBSERVATION_SIGNATURE_UNAVAILABLE,
  CONTROL_SNAPSHOT_OBSERVATION_FIELD,
  CONTROL_SNAPSHOT_OBSERVATION_STATE_FIELD,
  CONTROL_SNAPSHOT_OBSERVATION_CONTRACT_STATE_FIELD,
  CONTROL_SNAPSHOT_OBSERVATION_STATE_FAILED,
  CONTROL_SNAPSHOT_OBSERVATION_CONTRACT_STATE_FAILED,
  sleep,
  mapNodeIds,
  normalizePlannerObservationReasonCodes,
  resolveTableDistributionObservationState,
  buildTableDistributionObservationReasonCodes,
  extractControlSnapshotObservation,
  shouldFallbackToForcedControlSnapshot,
  cloneCriticalControlPlaneStabilitySnapshot,
  buildPartitioningPlannerDiagnostics,
  buildPartitioningPlannerTimeoutError,
  buildPartitioningDispatchPlannerDiagnostics,
  resolvePartitioningPlannerDiagnosticsSnapshot,
  buildDeferredTableDistributionSnapshot,
  buildPartitioningPlannerDiagnosticsFromPreviousState,
  formatPlannerNodeIds,
  formatPlannerHistogram,
  resolvePartitionGrowthFailureMode,
  isTimeoutShapedError,
  isRetryableControlPlaneProgressError,
  resolveControlPlaneRetryDelayMs,
  resolveControlQueryTimeoutMs,
  resolveRemainingControlQueryTimeoutMs,
  selectMeaningfulControlQueryNodes,
  resolveControlQueryCandidateTimeoutMs,
  resolveControlQueryExecutionMode,
  selectControlQueryExecutionNodes,
  hasControlQueryMutationVisibilityEvidence,
  isControlQueryMutationPreExecutionDeferredError,
  isControlQueryMutationFallbackEligibleError,
  shouldRetryControlQueryOnNextCandidate,
  queryControl,
  resolveControlQueryNodes,
  forceRepairControlSnapshotAcrossQueryNodes,
  queryControlSingle,
  queryControlSingleWithProgressRetry,
  rowsFromResult,
  escapeSql,
  resolveBenchmarkTableName,
  resolvePartitioningLoadTableName,
  resolveClusterNodes,
  resolveBenchmarkAdmissionRequiredNodeCount,
  resolveBenchmarkBootstrapRequiredNodeCount,
  resolveBenchmarkAdmissionTimeoutMs,
  resolveBenchmarkAdmissionStableWindowMs,
  resolveBenchmarkAdmissionPollIntervalMs,
  resolveBenchmarkAdmissionEnforcement,
  preserveNodeOrder,
  resolvePartitioningDispatchNodes,
  admitBenchmarkLoadNodes,
  resolveBenchmarkPartitionConvergenceSnapshot,
  createPartitioningBenchmarkLoadNodePlan,
  resolvePartitioningBenchmarkLoadOpsPerSec,
  createPartitioningAdaptiveDispatchGuardrail,
  firstTableId,
  firstStringField,
  firstPositiveIntegerField,
  firstTablePolicies,
  affectedRowCountFromResult,
  summarizeMutationResult,
  normalizeMutationVisibilityState,
  summarizeMutationVisibility,
  advanceMutationVisibilitySummary,
  shouldDeferAuthoritativeRepair,
  shouldForceAuthoritativeRepairAfterTimedOutCreate,
  resolveMutationVisibilityDelayMs,
  resolveMutationVisibilityWarning,
  shouldAdvanceTimedOutCreateMutationPrimary,
  resolveTableBootstrapRepairQueryNodes,
  resolveRequiredTableBootstrapVisibilityState,
  resolveTableBootstrapCreateTimeoutMs,
  resolveObservedTableBootstrapVisibilityState,
  tableBootstrapVisibilityStateSatisfiesRequirement,
  buildTableBootstrapVisibilitySnapshot,
  buildBenchmarkTableBootstrapResult,
  isEmptyObject,
  policyContainsExpected,
  queryTableId,
  queryPartitionIdsByTableId,
  queryTablePolicies,
  waitForTableId,
  ensureBenchmarkPartitioningTable,
  prepareBenchmarkPartitioningTable,
  assertSplitPolicyPrecondition,
};
