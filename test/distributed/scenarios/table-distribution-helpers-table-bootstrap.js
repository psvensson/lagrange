import assert from 'node:assert/strict';
import {TABLE_DISTRIBUTION_LOAD_NODE_PLANNING_HELPERS} from './table-distribution-helpers-load-node-planning.js';
import {TABLE_BOOTSTRAP_CORE_HELPERS} from
  './table-bootstrap-core-helpers.js';
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
} = TABLE_DISTRIBUTION_LOAD_NODE_PLANNING_HELPERS;

const {
  TABLE_BOOTSTRAP_SQL_ENGINE_UNAVAILABLE_GRACE_MS,
  TABLE_BOOTSTRAP_SQL_UNAVAILABLE_RETRY_DELAY_MS,
  TABLE_BOOTSTRAP_MAX_VISIBILITY_POLL_INTERVAL_MS,
  TABLE_BOOTSTRAP_FAILURE_REASON_TIMEOUT,
  TABLE_BOOTSTRAP_FAILURE_REASON_NO_PROGRESS,
  isTableBootstrapCandidateUnavailableError,
  isTableBootstrapSqlUnavailableReadiness,
  resolveTableBootstrapDeadlineAtMs,
  resolveBoundedTableBootstrapCandidateTimeoutMs,
  resolveTableBootstrapNoProgressTimeoutMs,
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
} = TABLE_BOOTSTRAP_CORE_HELPERS;

function withTableBootstrapOperationTimeout(promise, timeoutMs, message) {
  const boundedTimeoutMs = Math.max(ONE, Math.floor(timeoutMs));
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      reject(new Error(message));
    }, boundedTimeoutMs);
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
    Promise.resolve(promise)
      .then((result) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        reject(error);
      });
  });
}

function resolveDeadlineBoundControlTimeoutMs(deadlineAtMs, timeoutMs) {
  const fallbackTimeoutMs = resolveControlQueryTimeoutMs(timeoutMs);
  if (!Number.isFinite(deadlineAtMs)) {
    return fallbackTimeoutMs;
  }
  return Math.max(ONE, Math.min(
    fallbackTimeoutMs,
    resolveRemainingControlQueryTimeoutMs(deadlineAtMs),
  ));
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
  const totalTimeoutMs = resolveControlQueryTimeoutMs(options.timeoutMs);
  const deadlineAtMs = resolveTableBootstrapDeadlineAtMs(
    options,
    totalTimeoutMs,
  );
  let lastError = null;
  let successfulQueryObserved = false;
  for (const candidateNode of queryNodes) {
    if (Date.now() >= deadlineAtMs) {
      break;
    }
    try {
      const result = await queryControlSingleWithProgressRetry(
        candidateNode,
        sql,
        [],
        {
          lane: CONTROL_QUERY_LANE_SNAPSHOT,
          timeoutMs: resolveBoundedTableBootstrapCandidateTimeoutMs(
            deadlineAtMs,
            totalTimeoutMs,
            queryNodes.length,
          ),
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
  const totalTimeoutMs = resolveControlQueryTimeoutMs(options.timeoutMs);
  const deadlineAtMs = resolveTableBootstrapDeadlineAtMs(
    options,
    totalTimeoutMs,
  );
  let lastError = null;
  let successfulQueryObserved = false;
  for (const candidateNode of queryNodes) {
    if (Date.now() >= deadlineAtMs) {
      break;
    }
    try {
      const result = await queryControlSingleWithProgressRetry(
        candidateNode,
        sql,
        [],
        {
          lane: CONTROL_QUERY_LANE_SNAPSHOT,
          timeoutMs: resolveBoundedTableBootstrapCandidateTimeoutMs(
            deadlineAtMs,
            totalTimeoutMs,
            queryNodes.length,
          ),
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
    const timeoutMs = resolveDeadlineBoundControlTimeoutMs(
      options.deadlineAtMs,
      options.timeoutMs,
    );
    const result = await queryControl(seedNode, sql, [], {
      timeoutMs,
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
  const baseTimeoutMs =
    Number.isFinite(options.timeoutMs) && options.timeoutMs > ZERO ?
      options.timeoutMs :
      (tableBootstrapVisibilityStateSatisfiesRequirement(
        TABLE_BOOTSTRAP_VISIBILITY_STATE.PARTITIONS_VISIBLE,
        requiredBootstrapVisibilityState,
      ) ?
        TABLE_BOOTSTRAP_TIMEOUT_MS :
        TABLE_ID_VISIBILITY_TIMEOUT_MS);
  let deadline = Date.now() + baseTimeoutMs;
  const unavailableGraceDeadline =
    deadline + TABLE_BOOTSTRAP_SQL_ENGINE_UNAVAILABLE_GRACE_MS;
  let createTimeoutError = null;
  let lastCreateError = null;
  let lastCreateErrorObject = null;
  let lastVisibilityError = null;
  let lastVisibilityErrorObject = null;
  let lastPartitionVisibilityError = null;
  let lastPartitionVisibilityErrorObject = null;
  let lastTopologyVisibilityError = null;
  let createVisibilitySummary = summarizeMutationVisibility(null);
  let bootstrapVisibilitySnapshot = buildTableBootstrapVisibilitySnapshot();
  let tableVisibilityRepairAttempted = false;
  let tableVisibilityRepairApplied = false;
  let postRepairVisibilitySweepPending = false;
  let currentPollIntervalMs = TABLE_ID_VISIBILITY_POLL_INTERVAL_MS;
  const noProgressTimeoutMs = resolveTableBootstrapNoProgressTimeoutMs(options);
  const attemptedCreateNodeIds = new Set();
  let lastProgressAtMs = Date.now();
  let lastProgressToken = buildTableBootstrapProgressToken({
    createVisibilitySummary,
    bootstrapVisibilitySnapshot,
    tableVisibilityRepairAttempted,
    tableVisibilityRepairApplied,
  });
  const buildProgressToken = () => buildTableBootstrapProgressToken({
    createVisibilitySummary,
    bootstrapVisibilitySnapshot,
    attemptedCreateNodeIds: [...attemptedCreateNodeIds],
    tableVisibilityRepairAttempted,
    tableVisibilityRepairApplied,
    lastCreateErrorObject,
    lastVisibilityErrorObject,
    lastPartitionVisibilityErrorObject,
  });
  const recordProgress = () => {
    const progressToken = buildProgressToken();
    if (progressToken !== lastProgressToken) {
      lastProgressToken = progressToken;
      lastProgressAtMs = Date.now();
    }
    return progressToken;
  };
  const assertNotStalled = () => {
    if (!Number.isInteger(noProgressTimeoutMs) || noProgressTimeoutMs <= ZERO) {
      return;
    }
    const elapsedWithoutProgressMs = Date.now() - lastProgressAtMs;
    if (elapsedWithoutProgressMs < noProgressTimeoutMs) {
      return;
    }
    assert.fail(buildTableBootstrapFailureMessage({
      tableName: resolvedTableName,
      failureReason: TABLE_BOOTSTRAP_FAILURE_REASON_NO_PROGRESS,
      timeoutMs: baseTimeoutMs,
      noProgressTimeoutMs,
      lastProgressElapsedMs: elapsedWithoutProgressMs,
      lastProgressToken,
      lastCreateError,
      createVisibilitySummary,
      lastVisibilityError,
      lastPartitionVisibilityError,
      lastTopologyVisibilityError,
      requiredBootstrapVisibilityState,
      bootstrapVisibilitySnapshot,
      tableVisibilityRepairAttempted,
      tableVisibilityRepairApplied,
    }));
  };
  const sleepUntilNextTableBootstrapAttempt = async (delayMs) => {
    recordProgress();
    assertNotStalled();
    const boundedDelayMs = Math.max(
      ZERO,
      Math.min(
        Math.max(ZERO, Math.floor(delayMs)),
        Math.max(ZERO, deadline - Date.now()),
        Number.isInteger(noProgressTimeoutMs) && noProgressTimeoutMs > ZERO ?
          Math.max(ZERO, lastProgressAtMs + noProgressTimeoutMs - Date.now()) :
          Math.max(ZERO, deadline - Date.now()),
      ),
    );
    if (boundedDelayMs > ZERO) {
      await sleep(boundedDelayMs);
    }
  };
  const resolveCurrentOperationDeadlineAtMs = (
    fallbackDeadlineAtMs = deadline,
  ) => {
    const deadlineCandidates = [fallbackDeadlineAtMs];
    if (Number.isInteger(noProgressTimeoutMs) && noProgressTimeoutMs > ZERO) {
      deadlineCandidates.push(lastProgressAtMs + noProgressTimeoutMs);
    }
    return Math.max(
      Date.now() + ONE,
      Math.min(...deadlineCandidates),
    );
  };
  const resolveCurrentOperationTimeoutMs = (
    fallbackDeadlineAtMs = deadline,
  ) =>
    Math.max(
      ONE,
      Math.floor(resolveCurrentOperationDeadlineAtMs(fallbackDeadlineAtMs) -
        Date.now()),
    );
  const probeBootstrapReadinessWithDeadline = async (node) => {
    const readinessTimeoutMs = resolveCurrentOperationTimeoutMs();
    return withTableBootstrapOperationTimeout(
      node.probeBootstrapReadiness({
        timeoutMs: readinessTimeoutMs,
      }),
      readinessTimeoutMs,
      'Bootstrap readiness probe timed out for ' + String(node?.id || 'seed'),
    );
  };
  const resolveTableBootstrapRepairDeadlineAtMs = () => {
    if (Date.now() < deadline) {
      return resolveCurrentOperationDeadlineAtMs(deadline);
    }
    return resolveCurrentOperationDeadlineAtMs(
      Date.now() + TABLE_BOOTSTRAP_POST_CREATE_VISIBILITY_RESERVE_MS,
    );
  };
  while (Date.now() <= deadline || postRepairVisibilitySweepPending) {
    const visibilitySweepOnly = postRepairVisibilitySweepPending;
    postRepairVisibilitySweepPending = false;
    if (!visibilitySweepOnly) {
      const createPrimaryNode = createQueryNodes[createPrimaryNodeIndex] || seedNode;
      const visQueryNode = (shouldUseUnattemptedTableBootstrapVisibilityNodes({
        baseOptions: options,
        lastCreateError: lastCreateErrorObject,
        createQueryNodes,
        createPrimaryNodeIndex,
        bootstrapVisibilitySnapshot,
      }) ? (createQueryNodes.slice(createPrimaryNodeIndex + ONE)[ZERO] || seedNode) : seedNode);
      let sqlUnavailable = false;
      for (const node of [createPrimaryNode, visQueryNode]) {
        if (node && typeof node.probeBootstrapReadiness === 'function') {
          const readiness = await probeBootstrapReadinessWithDeadline(node)
            .catch(() => null);
          if (isTableBootstrapSqlUnavailableReadiness(readiness)) {
            sqlUnavailable = true;
            break;
          }
        }
      }
      if (sqlUnavailable) {
        if (Date.now() < deadline) {
          if (createQueryNodes.length > ONE) {
            createPrimaryNodeIndex = (createPrimaryNodeIndex + ONE) % createQueryNodes.length;
          }
          await sleepUntilNextTableBootstrapAttempt(
            TABLE_BOOTSTRAP_SQL_UNAVAILABLE_RETRY_DELAY_MS,
          );
          continue;
        }
      }
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
        const createFallbackQueryNode = createQueryNodes[
          createPrimaryNodeIndex + ONE
        ] || null;
        const createAttemptOptions = {
          timeoutMs: createAttemptTimeoutMs,
          lane: CONTROL_QUERY_LANE_CONTROL,
          executionMode:
            CONTROL_QUERY_EXECUTION_MODE.MUTATION_SINGLE_FLIGHT,
        };
        attemptedCreateNodeIds.add(String(createPrimaryNode?.id || 'seed'));
        let createResult = null;
        let createAttemptError = null;
        try {
          createResult = await queryControl(
            createPrimaryNode,
            createSql,
            [],
            createAttemptOptions,
          );
        } catch (error) {
          createAttemptError = error;
        }
        if (
          createAttemptError &&
          createFallbackQueryNode &&
          isControlQueryMutationPreExecutionDeferredError(createAttemptError)
        ) {
          attemptedCreateNodeIds.add(
            String(createFallbackQueryNode?.id || 'seed'),
          );
          try {
            createResult = await queryControl(
              createFallbackQueryNode,
              createSql,
              [],
              createAttemptOptions,
            );
            createPrimaryNodeIndex += ONE;
            createAttemptError = null;
          } catch (error) {
            createAttemptError = error;
          }
        }
        if (!createAttemptError) {
          createVisibilitySummary = advanceMutationVisibilitySummary(
            createVisibilitySummary,
            createResult,
          );
          lastCreateError = null;
          lastCreateErrorObject = null;
        } else {
          const error = createAttemptError;
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
        tableVisibilityRepairAttempted,
      });
    const visibilityDeadlineAtMs = visibilitySweepOnly ?
      Date.now() + TABLE_BOOTSTRAP_POST_CREATE_VISIBILITY_RESERVE_MS :
      deadline;

    try {
      const tableId = await queryTableId(
        visibilityQueryContext.seedNode,
        resolvedTableName,
        {
          ...visibilityQueryContext.options,
          deadlineAtMs: visibilityDeadlineAtMs,
          timeoutMs: baseTimeoutMs,
        },
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
            {
              ...visibilityQueryContext.options,
              deadlineAtMs: visibilityDeadlineAtMs,
              timeoutMs: baseTimeoutMs,
            },
          );
          if (partitionIds.length <= ZERO) {
            bootstrapVisibilitySnapshot = buildTableBootstrapVisibilitySnapshot(
              {
                tableId,
              },
            );
            lastPartitionVisibilityError =
              TABLE_BOOTSTRAP_PARTITION_VISIBILITY_MISSING;
            lastPartitionVisibilityErrorObject = null;
            lastTopologyVisibilityError = null;
            lastVisibilityError = null;
            lastVisibilityErrorObject = null;
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
                deadlineAtMs: visibilityDeadlineAtMs,
                queryTimeoutMs: baseTimeoutMs,
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
          lastPartitionVisibilityErrorObject = error;
          lastTopologyVisibilityError = null;
        }
      }
      lastVisibilityError = null;
      lastVisibilityErrorObject = null;
    } catch (error) {
      lastVisibilityError = String(error?.message || error);
      lastVisibilityErrorObject = error;
    }

    recordProgress();
    assertNotStalled();

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
        recordProgress();
        assertNotStalled();
        continue;
      }
    }
    const shouldCycleUnavailableCreatePrimary =
      shouldCycleTableBootstrapCreatePrimary({
        lastCreateError: lastCreateErrorObject,
        createQueryNodes,
        bootstrapVisibilitySnapshot,
      }) &&
      (
        createPrimaryNodeIndex === ZERO ||
        isTableBootstrapCandidateUnavailableError(lastVisibilityErrorObject) ||
        isTableBootstrapCandidateUnavailableError(lastPartitionVisibilityErrorObject)
      );
    if (shouldCycleUnavailableCreatePrimary) {
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
        createQueryNodes,
        deadlineAtMs: deadline,
        unavailableGraceDeadlineAtMs: unavailableGraceDeadline,
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
          deadlineAtMs: resolveTableBootstrapRepairDeadlineAtMs(),
          timeoutMs: baseTimeoutMs,
        },
      );
      tableVisibilityRepairApplied =
        repairApplied || tableVisibilityRepairApplied;
      if (Date.now() >= deadline) {
        postRepairVisibilitySweepPending = true;
        recordProgress();
        assertNotStalled();
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
      recordProgress();
      assertNotStalled();
      continue;
    }

    if (Date.now() >= deadline) {
      break;
    }
    await sleepUntilNextTableBootstrapAttempt(
      resolveMutationVisibilityDelayMs(
        createVisibilitySummary,
        resolveControlPlaneRetryDelayMs(
          lastCreateErrorObject,
          currentPollIntervalMs,
        ),
      ),
    );
    currentPollIntervalMs = Math.min(
      TABLE_BOOTSTRAP_MAX_VISIBILITY_POLL_INTERVAL_MS,
      currentPollIntervalMs * 1.5,
    );
  }

  assert.fail(buildTableBootstrapFailureMessage({
    tableName: resolvedTableName,
    failureReason: TABLE_BOOTSTRAP_FAILURE_REASON_TIMEOUT,
    timeoutMs: baseTimeoutMs,
    noProgressTimeoutMs,
    lastProgressElapsedMs: Date.now() - lastProgressAtMs,
    lastProgressToken,
    lastCreateError,
    createVisibilitySummary,
    lastVisibilityError,
    lastPartitionVisibilityError,
    lastTopologyVisibilityError,
    requiredBootstrapVisibilityState,
    bootstrapVisibilitySnapshot,
    tableVisibilityRepairAttempted,
    tableVisibilityRepairApplied,
  }));
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
        deadlineAtMs: visibilityDeadline,
        timeoutMs: POLICY_APPLY_TIMEOUT_MS,
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
    if (Date.now() >= visibilityDeadline) {
      break;
    }
    if (
      !policyVisible &&
      !policyVisibilityRepairAttempted &&
      !shouldDeferAuthoritativeRepair(policyApplyVisibilitySummary)
    ) {
      policyVisibilityRepairAttempted = true;
      policyVisibilityRepairApplied =
        (await forceRepairControlSnapshotAcrossQueryNodes(seedNode, {
          ...options,
          deadlineAtMs: visibilityDeadline,
          timeoutMs: POLICY_APPLY_TIMEOUT_MS,
        })) ||
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

export const TABLE_DISTRIBUTION_TABLE_BOOTSTRAP_HELPERS = {
  ...TABLE_BOOTSTRAP_CORE_HELPERS,
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
  resolveTableBootstrapDeadlineAtMs,
  resolveBoundedTableBootstrapCandidateTimeoutMs,
  resolveTableBootstrapNoProgressTimeoutMs,
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
