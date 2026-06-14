import {TABLE_DISTRIBUTION_LOAD_NODE_PLANNING_HELPERS} from
  './table-distribution-helpers-load-node-planning.js';

const {
  ZERO,
  ONE,
  POLICY_APPLY_ATTEMPT_TIMEOUT_MS,
  TABLE_BOOTSTRAP_POST_CREATE_VISIBILITY_RESERVE_MS,
  TABLE_BOOTSTRAP_VISIBILITY_STATE,
  TABLE_BOOTSTRAP_VISIBILITY_STATE_ORDER,
  TABLE_BOOTSTRAP_VISIBILITY_STATE_LABEL,
  TOPOLOGY_STATE_ROUTABLE,
  CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE,
  OWNER_CONTRACT_STATE,
  normalizeMutationVisibilityState,
  isPendingControlPlaneSystemTableVisibilityState,
  normalizeOwnerContractState,
  isTimeoutShapedError,
  isRetryableControlPlaneProgressError,
  resolveControlQueryTimeoutMs,
  resolveRemainingControlQueryTimeoutMs,
  resolveControlQueryCandidateTimeoutMs,
  summarizeMutationVisibility,
} = TABLE_DISTRIBUTION_LOAD_NODE_PLANNING_HELPERS;

const TABLE_BOOTSTRAP_SQL_ENGINE_UNAVAILABLE_FRAGMENT =
  'SQL query engine not available';
const TABLE_BOOTSTRAP_SQL_ENGINE_UNAVAILABLE_REASON =
  'SQL_ENGINE_UNAVAILABLE';
const TABLE_BOOTSTRAP_MULTI_NODE_CREATE_ATTEMPT_TIMEOUT_MS = 5000;
const TABLE_BOOTSTRAP_SQL_ENGINE_UNAVAILABLE_GRACE_MS = 60000;
const TABLE_BOOTSTRAP_NO_PROGRESS_TIMEOUT_MS = 30000;
const TABLE_BOOTSTRAP_SQL_UNAVAILABLE_RETRY_DELAY_MS = 100;
const TABLE_BOOTSTRAP_MAX_VISIBILITY_POLL_INTERVAL_MS = 2000;
const TABLE_BOOTSTRAP_FAILURE_REASON_TIMEOUT = 'timeout';
const TABLE_BOOTSTRAP_FAILURE_REASON_NO_PROGRESS =
  'table_bootstrap_no_progress';
const TABLE_BOOTSTRAP_PROGRESS_ERROR_NONE = 'none';
const TABLE_BOOTSTRAP_PROGRESS_ERROR_TIMEOUT = 'timeout';
const TABLE_BOOTSTRAP_PROGRESS_ERROR_UNAVAILABLE = 'unavailable';
const TABLE_BOOTSTRAP_PROGRESS_ERROR_RETRYABLE = 'retryable';
const TABLE_BOOTSTRAP_PROGRESS_ERROR_OTHER = 'other';
const TABLE_BOOTSTRAP_CANDIDATE_UNAVAILABLE_ERROR_FRAGMENTS = Object.freeze([
  TABLE_BOOTSTRAP_SQL_ENGINE_UNAVAILABLE_FRAGMENT.toLowerCase(),
  'econnrefused',
  'ehostunreach',
  'connection reset',
  'socket is not open',
  'channel closed',
]);

function isTableBootstrapCandidateUnavailableError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return TABLE_BOOTSTRAP_CANDIDATE_UNAVAILABLE_ERROR_FRAGMENTS.some(
    (fragment) => message.includes(fragment),
  );
}

function isTableBootstrapCreatePrimaryAdvanceError(error) {
  return (
    isTimeoutShapedError(error) ||
    isTableBootstrapCandidateUnavailableError(error)
  );
}

function isTableBootstrapSqlUnavailableReadiness(readiness) {
  const reasons = Array.isArray(readiness?.reasons) ? readiness.reasons : [];
  return reasons.some((reason) => {
    const normalizedReason = String(reason || '');
    return (
      normalizedReason.includes(
        TABLE_BOOTSTRAP_SQL_ENGINE_UNAVAILABLE_REASON,
      ) ||
      normalizedReason.includes(TABLE_BOOTSTRAP_SQL_ENGINE_UNAVAILABLE_FRAGMENT)
    );
  });
}

function resolveTableBootstrapDeadlineAtMs(options = {}, timeoutMs = null) {
  if (Number.isFinite(options.deadlineAtMs)) {
    return Math.floor(options.deadlineAtMs);
  }
  const resolvedTimeoutMs = resolveControlQueryTimeoutMs(timeoutMs);
  return Date.now() + resolvedTimeoutMs;
}

function resolveBoundedTableBootstrapCandidateTimeoutMs(
  deadlineAtMs,
  timeoutMs,
  candidateCount,
) {
  const candidateTimeoutMs = resolveControlQueryCandidateTimeoutMs(
    timeoutMs,
    candidateCount,
  );
  return Math.max(
    ONE,
    Math.min(
      candidateTimeoutMs,
      resolveRemainingControlQueryTimeoutMs(deadlineAtMs),
    ),
  );
}

function resolveTableBootstrapNoProgressTimeoutMs(options = {}) {
  if (Number.isFinite(options.noProgressTimeoutMs)) {
    return options.noProgressTimeoutMs > ZERO ?
      Math.floor(options.noProgressTimeoutMs) :
      null;
  }
  return TABLE_BOOTSTRAP_NO_PROGRESS_TIMEOUT_MS;
}

function classifyTableBootstrapProgressError(error) {
  if (!error) {
    return TABLE_BOOTSTRAP_PROGRESS_ERROR_NONE;
  }
  if (isTimeoutShapedError(error)) {
    return TABLE_BOOTSTRAP_PROGRESS_ERROR_TIMEOUT;
  }
  if (isTableBootstrapCandidateUnavailableError(error)) {
    return TABLE_BOOTSTRAP_PROGRESS_ERROR_UNAVAILABLE;
  }
  if (isRetryableControlPlaneProgressError(error)) {
    return TABLE_BOOTSTRAP_PROGRESS_ERROR_RETRYABLE;
  }
  return TABLE_BOOTSTRAP_PROGRESS_ERROR_OTHER;
}

function buildTableBootstrapProgressToken(options = {}) {
  const snapshot =
    options.bootstrapVisibilitySnapshot &&
    typeof options.bootstrapVisibilitySnapshot === 'object' ?
      options.bootstrapVisibilitySnapshot :
      buildTableBootstrapVisibilitySnapshot();
  const visibilitySummary =
    options.createVisibilitySummary &&
    typeof options.createVisibilitySummary === 'object' ?
      options.createVisibilitySummary :
      summarizeMutationVisibility(null);
  const attemptedNodeIds = Array.isArray(options.attemptedCreateNodeIds) ?
    options.attemptedCreateNodeIds.map((nodeId) => String(nodeId)).sort() :
    [];
  return JSON.stringify({
    visibilityState: snapshot.state || TABLE_BOOTSTRAP_VISIBILITY_STATE.NONE,
    tableIdVisible: String(snapshot.tableId || '').length > ZERO,
    partitionCount: Array.isArray(snapshot.partitionIds) ?
      snapshot.partitionIds.length :
      ZERO,
    topologyState: String(snapshot.distribution?.topologyState || 'none'),
    createVisibilityState: String(
      visibilitySummary.visibilityState || 'none',
    ),
    createContractState: String(visibilitySummary.contractState || 'none'),
    createNextAction: String(visibilitySummary.nextAction || 'none'),
    createAuthoritative:
      visibilitySummary.authoritativeVisibilityConfirmed === true,
    attemptedNodeIds,
    repairAttempted: options.tableVisibilityRepairAttempted === true,
    repairApplied: options.tableVisibilityRepairApplied === true,
    lastCreateErrorClass:
      classifyTableBootstrapProgressError(options.lastCreateErrorObject),
    lastVisibilityErrorClass:
      classifyTableBootstrapProgressError(options.lastVisibilityErrorObject),
    lastPartitionVisibilityErrorClass:
      classifyTableBootstrapProgressError(
        options.lastPartitionVisibilityErrorObject,
      ),
  });
}

function buildTableBootstrapFailureMessage(options = {}) {
  const requiredBootstrapVisibilityState =
    options.requiredBootstrapVisibilityState ||
    TABLE_BOOTSTRAP_VISIBILITY_STATE.NONE;
  const bootstrapVisibilitySnapshot =
    options.bootstrapVisibilitySnapshot &&
    typeof options.bootstrapVisibilitySnapshot === 'object' ?
      options.bootstrapVisibilitySnapshot :
      buildTableBootstrapVisibilitySnapshot();
  const createVisibilitySummary =
    options.createVisibilitySummary &&
    typeof options.createVisibilitySummary === 'object' ?
      options.createVisibilitySummary :
      summarizeMutationVisibility(null);
  const failureReason =
    typeof options.failureReason === 'string' &&
      options.failureReason.length > ZERO ?
      options.failureReason :
      TABLE_BOOTSTRAP_FAILURE_REASON_TIMEOUT;
  return (
    'Timed out waiting for ' +
    TABLE_BOOTSTRAP_VISIBILITY_STATE_LABEL[requiredBootstrapVisibilityState] +
    ' for "' +
    String(options.tableName || '') +
    '" (failureReason=' +
    failureReason +
    ', timeoutMs=' +
    String(options.timeoutMs || 'none') +
    ', noProgressTimeoutMs=' +
    String(options.noProgressTimeoutMs || 'disabled') +
    ', lastProgressElapsedMs=' +
    String(options.lastProgressElapsedMs || 'none') +
    ', lastProgressToken=' +
    String(options.lastProgressToken || 'none') +
    ', lastCreateError=' +
    String(options.lastCreateError || 'none') +
    ', lastCreateVisibilityState=' +
    String(createVisibilitySummary.visibilityState || 'none') +
    ', lastCreateVisibilityRetryAfterMs=' +
    String(createVisibilitySummary.retryAfterMs || 'none') +
    ', lastVisibilityError=' +
    String(options.lastVisibilityError || 'none') +
    ', lastPartitionVisibilityError=' +
    String(options.lastPartitionVisibilityError || 'none') +
    ', lastTopologyVisibilityError=' +
    String(options.lastTopologyVisibilityError || 'none') +
    ', requiredBootstrapVisibilityState=' +
    String(requiredBootstrapVisibilityState) +
    ', observedBootstrapVisibilityState=' +
    String(
      bootstrapVisibilitySnapshot.state ||
        TABLE_BOOTSTRAP_VISIBILITY_STATE.NONE,
    ) +
    ', authoritativeRepairAttempted=' +
    String(options.tableVisibilityRepairAttempted === true) +
    ', authoritativeRepairApplied=' +
    String(options.tableVisibilityRepairApplied === true) +
    ')'
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
  if (!isTimeoutShapedError(options.lastCreateError)) {
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
  if (
    options?.bootstrapVisibilitySnapshot?.state !==
    TABLE_BOOTSTRAP_VISIBILITY_STATE.NONE
  ) {
    return false;
  }
  const createQueryNodeCount = Array.isArray(options.createQueryNodes) ?
    options.createQueryNodes.length :
    ZERO;
  if (createQueryNodeCount <= ONE) {
    return false;
  }
  if (
    Number.isFinite(options.deadlineAtMs) &&
    Date.now() < options.deadlineAtMs
  ) {
    return true;
  }
  return shouldExtendTableBootstrapForUnavailableCreate(options);
}

function shouldUseUnattemptedTableBootstrapVisibilityNodes(options = {}) {
  if (!isTimeoutShapedError(options.lastCreateError)) {
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
  const queryNodes =
    Array.isArray(options.createQueryNodes) &&
      options.createQueryNodes.length > ZERO ?
      options.createQueryNodes :
      [seedNode];

  if (!shouldUseUnattemptedTableBootstrapVisibilityNodes(options)) {
    if (
      isTableBootstrapCandidateUnavailableError(options.lastCreateError) &&
      Number.isInteger(options.createPrimaryNodeIndex) &&
      options.tableVisibilityRepairAttempted !== true &&
      options?.bootstrapVisibilitySnapshot?.state ===
        TABLE_BOOTSTRAP_VISIBILITY_STATE.NONE
    ) {
      const primaryVisNode =
        queryNodes[options.createPrimaryNodeIndex] || seedNode;
      return {
        seedNode: primaryVisNode,
        options: {
          ...(options.baseOptions || {}),
          queryNodes: [primaryVisNode],
          fallbackNodes: [primaryVisNode],
        },
      };
    }
    const resolvedNodes = [
      seedNode,
      ...queryNodes.filter((node) => node?.id !== seedNode?.id),
    ];
    return {
      seedNode,
      options: {
        ...(options.baseOptions || {}),
        queryNodes: resolvedNodes,
        fallbackNodes: resolvedNodes,
      },
    };
  }
  const unattemptedQueryNodes = options.createQueryNodes.slice(
    options.createPrimaryNodeIndex + ONE,
  );
  const primaryVisNode = unattemptedQueryNodes[ZERO] || seedNode;
  const resolvedNodes = [
    primaryVisNode,
    ...queryNodes.filter((node) => node?.id !== primaryVisNode?.id),
  ];
  return {
    seedNode: primaryVisNode,
    options: {
      ...(options.baseOptions || {}),
      queryNodes: resolvedNodes,
      fallbackNodes: resolvedNodes,
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

function isEmptyObject(value) {
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === ZERO
  );
}

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

export const TABLE_BOOTSTRAP_CORE_HELPERS = {
  TABLE_BOOTSTRAP_SQL_ENGINE_UNAVAILABLE_FRAGMENT,
  TABLE_BOOTSTRAP_SQL_ENGINE_UNAVAILABLE_REASON,
  TABLE_BOOTSTRAP_MULTI_NODE_CREATE_ATTEMPT_TIMEOUT_MS,
  TABLE_BOOTSTRAP_SQL_ENGINE_UNAVAILABLE_GRACE_MS,
  TABLE_BOOTSTRAP_NO_PROGRESS_TIMEOUT_MS,
  TABLE_BOOTSTRAP_SQL_UNAVAILABLE_RETRY_DELAY_MS,
  TABLE_BOOTSTRAP_MAX_VISIBILITY_POLL_INTERVAL_MS,
  TABLE_BOOTSTRAP_FAILURE_REASON_TIMEOUT,
  TABLE_BOOTSTRAP_FAILURE_REASON_NO_PROGRESS,
  TABLE_BOOTSTRAP_PROGRESS_ERROR_NONE,
  TABLE_BOOTSTRAP_PROGRESS_ERROR_TIMEOUT,
  TABLE_BOOTSTRAP_PROGRESS_ERROR_UNAVAILABLE,
  TABLE_BOOTSTRAP_PROGRESS_ERROR_RETRYABLE,
  TABLE_BOOTSTRAP_PROGRESS_ERROR_OTHER,
  isTableBootstrapCandidateUnavailableError,
  isTableBootstrapCreatePrimaryAdvanceError,
  isTableBootstrapSqlUnavailableReadiness,
  resolveTableBootstrapDeadlineAtMs,
  resolveBoundedTableBootstrapCandidateTimeoutMs,
  resolveTableBootstrapNoProgressTimeoutMs,
  classifyTableBootstrapProgressError,
  buildTableBootstrapProgressToken,
  buildTableBootstrapFailureMessage,
  shouldForceAuthoritativeRepairAfterTimedOutCreate,
  resolveMutationVisibilityDelayMs,
  resolveMutationVisibilityWarning,
  shouldAdvanceTimedOutCreateMutationPrimary,
  resolveTableBootstrapRepairQueryNodes,
  shouldDeferTableBootstrapRepairForUnavailableCreate,
  shouldUseUnattemptedTableBootstrapVisibilityNodes,
  resolveTableBootstrapVisibilityQueryContext,
  shouldCycleTableBootstrapCreatePrimary,
  resolveNextTableBootstrapCreatePrimaryIndex,
  resolveRequiredTableBootstrapVisibilityState,
  resolveTableBootstrapCreateTimeoutMs,
  shouldAttemptTableBootstrapCreate,
  shouldExtendTableBootstrapForUnavailableCreate,
  resolveExtendedTableBootstrapDeadlineForUnavailableCreate,
  resolveObservedTableBootstrapVisibilityState,
  tableBootstrapVisibilityStateSatisfiesRequirement,
  buildTableBootstrapVisibilitySnapshot,
  buildBenchmarkTableBootstrapResult,
  isEmptyObject,
  policyContainsExpected,
};
