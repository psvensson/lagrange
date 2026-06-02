import {TABLE_DISTRIBUTION_HELPERS_SEGMENT_1} from './table-distribution-helpers-segment-1.js';

const TABLE_DISTRIBUTION_HELPERS_SEGMENT_4_MODULE_PATH =
  './table-distribution-helpers-segment-4.js';

const {
  BENCHMARK_DEFAULTS,
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
  CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE,
  normalizeControlPlaneSystemTableVisibilityState,
  isPendingControlPlaneSystemTableVisibilityState,
  OWNER_CONTRACT_STATE,
  normalizeOwnerContractNextAction,
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
  rowsFromResult,
  escapeSql,
  resolveBenchmarkTableName,
  resolvePartitioningLoadTableName,
  resolveClusterNodes,
  resolveBenchmarkAdmissionRequiredNodeCount,
  resolveBenchmarkBootstrapRequiredNodeCount,
  resolveBenchmarkAdmissionTimeoutMs,
  resolveBenchmarkAdmissionStableWindowMs,
  buildBenchmarkConvergenceEvaluationSummaries,
  buildBenchmarkLoadAdmissionSnapshot,
  buildBenchmarkPartitionConvergenceSnapshot,
  BENCHMARK_PARTITION_DISPATCH_MODE,
  isBenchmarkCriticalControlPlaneStable,
  resolveBenchmarkPartitionDispatchMode,
} = TABLE_DISTRIBUTION_HELPERS_SEGMENT_1;

let tableDistributionHelpersSegment4Promise = null;

async function queryTableDistribution(seedNode, options = {}) {
  if (!tableDistributionHelpersSegment4Promise) {
    tableDistributionHelpersSegment4Promise = import(
      TABLE_DISTRIBUTION_HELPERS_SEGMENT_4_MODULE_PATH
    ).then((module) => module.TABLE_DISTRIBUTION_HELPERS_SEGMENT_4);
  }
  const segment4 = await tableDistributionHelpersSegment4Promise;
  return segment4.queryTableDistribution(seedNode, options);
}

function resolveBenchmarkAdmissionPollIntervalMs(cluster, options = {}) {
  if (
    Number.isFinite(options.pollIntervalMs) &&
    options.pollIntervalMs > ZERO
  ) {
    return Math.floor(options.pollIntervalMs);
  }
  const configuredPollIntervalMs =
    cluster?._config?.benchmark?.readyPollIntervalMs;
  if (
    Number.isFinite(configuredPollIntervalMs) &&
    configuredPollIntervalMs > ZERO
  ) {
    return Math.floor(configuredPollIntervalMs);
  }
  return BENCHMARK_DEFAULTS.readyPollIntervalMs;
}

function resolveBenchmarkAdmissionEnforcement(cluster, options = {}) {
  if (options.enforceBenchmarkLoadAdmission === true) {
    return true;
  }
  if (options.enforceBenchmarkLoadAdmission === false) {
    return false;
  }
  const configuredEnforcement =
    cluster?._config?.benchmark?.enforceBenchmarkLoadAdmission;
  if (configuredEnforcement === true) {
    return true;
  }
  if (configuredEnforcement === false) {
    return false;
  }
  return true;
}

function preserveNodeOrder(
  currentNodes,
  nextNodes,
  limit = Number.POSITIVE_INFINITY,
) {
  const normalizedLimit =
    Number.isInteger(limit) && limit > ZERO ? limit : nextNodes.length;
  const nextNodeById = new Map();
  const anonymousNodes = [];
  for (const node of nextNodes) {
    const nodeId = String(node?.id || '');
    if (nodeId.length > ZERO) {
      nextNodeById.set(nodeId, node);
      continue;
    }
    anonymousNodes.push(node);
  }
  const orderedNodes = [];
  const seenNodeIds = new Set();
  for (const node of currentNodes) {
    const nodeId = String(node?.id || '');
    if (nodeId.length === ZERO) {
      continue;
    }
    const nextNode = nextNodeById.get(nodeId);
    if (!nextNode || seenNodeIds.has(nodeId)) {
      continue;
    }
    orderedNodes.push(nextNode);
    seenNodeIds.add(nodeId);
    if (orderedNodes.length >= normalizedLimit) {
      return orderedNodes;
    }
  }
  for (const node of nextNodes) {
    const nodeId = String(node?.id || '');
    if (nodeId.length > ZERO) {
      if (seenNodeIds.has(nodeId)) {
        continue;
      }
      orderedNodes.push(node);
      seenNodeIds.add(nodeId);
    } else if (anonymousNodes.length > ZERO) {
      orderedNodes.push(anonymousNodes.shift());
    } else {
      orderedNodes.push(node);
    }
    if (orderedNodes.length >= normalizedLimit) {
      break;
    }
  }
  return orderedNodes;
}

function resolvePartitioningDispatchNodes(
  supportsBenchmarkAdmission,
  selected,
  currentNodes = [],
  targetNodeCount = ZERO,
  bootstrapRequiredNodeCount = ZERO,
) {
  const normalizedTargetCount =
    Number.isInteger(targetNodeCount) && targetNodeCount > ZERO ?
      targetNodeCount :
      Number.POSITIVE_INFINITY;
  const normalizedBootstrapRequiredNodeCount =
    Number.isInteger(bootstrapRequiredNodeCount) &&
    bootstrapRequiredNodeCount > ZERO ?
      bootstrapRequiredNodeCount :
      ONE;
  const selectedNodes = Array.isArray(selected?.selectedNodes) ?
    selected.selectedNodes :
    [];
  const admissionReadyNodes = Array.isArray(selected?.admissionReadyNodes) ?
    selected.admissionReadyNodes :
    [];
  const readyReplicaNodes = Array.isArray(selected?.readyReplicaNodes) ?
    selected.readyReplicaNodes :
    [];
  const criticalControlPlaneStability =
    selected?.criticalControlPlaneStability &&
    typeof selected.criticalControlPlaneStability === 'object' ?
      selected.criticalControlPlaneStability :
      null;
  if (!supportsBenchmarkAdmission) {
    if (selectedNodes.length === ZERO) {
      return preserveNodeOrder(currentNodes, currentNodes, targetNodeCount);
    }
    return preserveNodeOrder(currentNodes, selectedNodes, targetNodeCount);
  }
  const currentReadyNodes = [];
  const currentAdmissionReadyNodes = [];
  const currentSelectedNodes = [];
  const orderedNodeIds = new Set();
  const pushNodeIfNeeded = (bucket, node) => {
    const nodeId = String(node?.id || '');
    if (nodeId.length > ZERO) {
      if (orderedNodeIds.has(nodeId)) {
        return;
      }
      orderedNodeIds.add(nodeId);
    }
    bucket.push(node);
  };
  const readyNodeById = new Map(
    readyReplicaNodes
      .map((node) => [String(node?.id || ''), node])
      .filter(([nodeId]) => nodeId.length > ZERO),
  );
  const admissionReadyNodeById = new Map(
    admissionReadyNodes
      .map((node) => [String(node?.id || ''), node])
      .filter(([nodeId]) => nodeId.length > ZERO),
  );
  const selectedNodeById = new Map(
    selectedNodes
      .map((node) => [String(node?.id || ''), node])
      .filter(([nodeId]) => nodeId.length > ZERO),
  );
  const dispatchMode = resolveBenchmarkPartitionDispatchMode({
    criticalControlPlaneStability,
    localPrimaryNodeCount: Array.isArray(selected?.localPrimaryNodes) ?
      selected.localPrimaryNodes.length :
      readyReplicaNodes.length,
    readyReplicaNodeCount: readyReplicaNodes.length,
    bootstrapRequiredNodeCount: normalizedBootstrapRequiredNodeCount,
    targetNodeCount:
      Number.isInteger(targetNodeCount) && targetNodeCount > ZERO ?
        targetNodeCount :
        normalizedBootstrapRequiredNodeCount,
  });
  const criticalControlPlaneStable = isBenchmarkCriticalControlPlaneStable(
    criticalControlPlaneStability,
  );
  for (const node of currentNodes) {
    const nodeId = String(node?.id || '');
    if (nodeId.length === ZERO) {
      continue;
    }
    if (readyNodeById.has(nodeId)) {
      currentReadyNodes.push(readyNodeById.get(nodeId));
    }
    if (admissionReadyNodeById.has(nodeId)) {
      currentAdmissionReadyNodes.push(admissionReadyNodeById.get(nodeId));
    }
    if (selectedNodeById.has(nodeId)) {
      currentSelectedNodes.push(selectedNodeById.get(nodeId));
    }
  }
  if (dispatchMode === BENCHMARK_PARTITION_DISPATCH_MODE.LOCAL_READY_ONLY) {
    return preserveNodeOrder(currentNodes, readyReplicaNodes, targetNodeCount);
  }
  if (!criticalControlPlaneStable) {
    const blockedReplicaBackfillRequired =
      admissionReadyNodes.length === ZERO &&
      readyReplicaNodes.length > ZERO &&
      selectedNodes.length > readyReplicaNodes.length;
    const bootstrapContributorNodes =
      admissionReadyNodes.length >= normalizedBootstrapRequiredNodeCount &&
      selectedNodes.length > ZERO ?
        selectedNodes :
        blockedReplicaBackfillRequired ?
          selectedNodes :
          readyReplicaNodes.length > ZERO ?
            readyReplicaNodes :
            admissionReadyNodes.length > ZERO ?
              admissionReadyNodes :
              selectedNodes;
    const bootstrapContributorCount = Math.max(
      normalizedBootstrapRequiredNodeCount,
      bootstrapContributorNodes.length,
    );
    return preserveNodeOrder(
      currentNodes,
      bootstrapContributorNodes,
      bootstrapContributorCount,
    );
  }
  const orderedNodes = [];
  const appendNodes = (nodes) => {
    for (const node of nodes) {
      if (orderedNodes.length >= normalizedTargetCount) {
        return;
      }
      pushNodeIfNeeded(orderedNodes, node);
    }
  };
  appendNodes(currentReadyNodes);
  appendNodes(readyReplicaNodes);
  if (selectedNodes.length < normalizedBootstrapRequiredNodeCount) {
    appendNodes(currentSelectedNodes);
    appendNodes(selectedNodes);
    return orderedNodes;
  }
  appendNodes(currentAdmissionReadyNodes);
  appendNodes(admissionReadyNodes);
  appendNodes(selectedNodes);
  appendNodes(currentSelectedNodes);
  return orderedNodes;
}

/**
 * Admit benchmark load nodes using table-aware discovery instead of requiring
 * global load readiness across the whole cluster.
 * @param {Object} cluster
 * @param {Object} [options]
 * @param {string} [options.tableName]
 * @param {string} [options.tableId]
 * @param {number} [options.requiredNodeCount]
 * @param {number} [options.timeoutMs]
 * @param {number} [options.stableWindowMs]
 * @param {number} [options.pollIntervalMs]
 * @param {number} [options.queryTimeoutMs]
 * @param {boolean} [options.enforceBenchmarkLoadAdmission]
 * @return {Promise<Array<Object>>}
 */
async function admitBenchmarkLoadNodes(cluster, options = {}) {
  const clusterNodes = resolveClusterNodes(cluster);
  if (clusterNodes.length === ZERO) {
    return [];
  }
  const requiredNodeCount = resolveBenchmarkAdmissionRequiredNodeCount(
    cluster,
    options,
  );
  const enforceBenchmarkLoadAdmission = resolveBenchmarkAdmissionEnforcement(
    cluster,
    options,
  );

  if (
    enforceBenchmarkLoadAdmission &&
    typeof cluster?.waitForBenchmarkReadyLoadNodes === 'function'
  ) {
    return cluster.waitForBenchmarkReadyLoadNodes({
      tableName: options.tableName,
      tableId: options.tableId,
      minNodeCount: requiredNodeCount,
      timeoutMs: resolveBenchmarkAdmissionTimeoutMs(cluster, options),
      stableWindowMs: resolveBenchmarkAdmissionStableWindowMs(cluster, options),
      pollIntervalMs: resolveBenchmarkAdmissionPollIntervalMs(cluster, options),
      queryTimeoutMs: options.queryTimeoutMs,
    });
  }

  if (
    enforceBenchmarkLoadAdmission &&
    typeof cluster?.resolveBenchmarkReadyLoadNodes === 'function'
  ) {
    const readyNodes = await cluster.resolveBenchmarkReadyLoadNodes({
      tableName: options.tableName,
      tableId: options.tableId,
      timeoutMs: options.queryTimeoutMs,
    });
    assert.ok(
      readyNodes.length >= requiredNodeCount,
      'Expected at least ' +
        requiredNodeCount +
        ' benchmark-ready load nodes before starting load' +
        (typeof options.tableName === 'string' &&
        options.tableName.length > ZERO ?
          ' for table "' + options.tableName + '"' :
          '') +
        ', got ' +
        readyNodes.length,
    );
    return readyNodes;
  }

  if (typeof cluster?.waitForLoadReadinessStability === 'function') {
    await cluster.waitForLoadReadinessStability({
      timeoutMs: resolveBenchmarkAdmissionTimeoutMs(cluster, options),
      stableWindowMs: resolveBenchmarkAdmissionStableWindowMs(cluster, options),
    });
  }
  return clusterNodes;
}

async function resolveBenchmarkPartitionConvergenceSnapshot(
  cluster,
  clusterNodes,
  distribution,
  options = {},
) {
  const snapshotOptions = {
    tableName: options.tableName,
    tableId: options.tableId,
    timeoutMs: options.queryTimeoutMs,
  };
  if (typeof cluster?.resolveBenchmarkLoadAdmissionSnapshot === 'function') {
    const admissionSnapshot =
      await cluster.resolveBenchmarkLoadAdmissionSnapshot(snapshotOptions);
    return buildBenchmarkPartitionConvergenceSnapshot({
      admissionSnapshot,
      replicaBearingNodeIds: Array.from(distribution.replicaNodeIds),
    });
  }
  if (typeof cluster?.resolveBenchmarkReadyLoadNodes === 'function') {
    const admissionReadyNodeIds = new Set(
      (await cluster.resolveBenchmarkReadyLoadNodes(snapshotOptions))
        .map((node) => String(node?.id || ''))
        .filter((nodeId) => nodeId.length > ZERO),
    );
    const evaluations = clusterNodes.map((node) => {
      const nodeId = String(node?.id || '');
      const replicaBearing = distribution.replicaNodeIds.has(nodeId);
      const admissionReady = admissionReadyNodeIds.has(nodeId);
      return {
        node,
        nodeId,
        localReplicaSeen: replicaBearing,
        localAdmissionReady: replicaBearing && admissionReady,
        admissionReady,
        admissionCheckEligible: true,
        reasonCodes: [],
      };
    });
    return buildBenchmarkPartitionConvergenceSnapshot({
      admissionSnapshot: buildBenchmarkLoadAdmissionSnapshot({
        evaluations,
      }),
      replicaBearingNodeIds: Array.from(distribution.replicaNodeIds),
    });
  }
  return null;
}

/**
 * Build a partitioning-load node plan that avoids a bootstrap deadlock:
 * start on the current table replica quorum, then expand the runnable node
 * set as additional replica-bearing nodes appear.
 * @param {Object} seedNode
 * @param {Object} cluster
 * @param {Object} [options]
 * @param {string} [options.tableName]
 * @param {string} [options.tableId]
 * @param {number} [options.requiredNodeCount]
 * @param {number} [options.bootstrapRequiredNodeCount]
 * @param {number} [options.timeoutMs]
 * @param {number} [options.stableWindowMs]
 * @param {number} [options.pollIntervalMs]
 * @param {number} [options.queryTimeoutMs]
 * @param {Array<Object>} [options.queryNodes]
 * @param {Array<Object>} [options.fallbackNodes]
 * @param {boolean} [options.enforceBenchmarkLoadAdmission]
 * @return {Promise<Object>}
 */
async function createPartitioningBenchmarkLoadNodePlan(
  seedNode,
  cluster,
  options = {},
) {
  const clusterNodes = resolveClusterNodes(cluster);
  if (clusterNodes.length === ZERO) {
    return {
      initialNodes: [],
      nodeResolver: () => [],
      stop: () => {},
      bootstrapRequiredNodeCount: ZERO,
      targetNodeCount: ZERO,
    };
  }
  const samplesBenchmarkAdmission =
    typeof cluster?.resolveBenchmarkLoadAdmissionSnapshot === 'function' ||
    typeof cluster?.resolveBenchmarkReadyLoadNodes === 'function';

  const selectLoadNodes = async () => {
    const distribution = await queryTableDistribution(seedNode, {
      tableName: options.tableName,
      queryNodes: options.queryNodes,
      fallbackNodes: options.fallbackNodes,
    });
    let effectiveReplicaBearingNodeIds =
      distribution.replicaNodeIds instanceof Set ?
        new Set(distribution.replicaNodeIds) :
        new Set();
    let admissionReadyNodes = [];
    let localPrimaryNodes = [];
    let routedSupportNodes = [];
    let readyReplicaNodeIds = null;
    let readinessReasonHistogram = null;
    let convergenceStateHistogram = null;
    let dispatchContributionHistogram = null;
    let degradationStateHistogram = null;
    let convergenceEvaluations = [];
    let criticalControlPlaneStability = null;
    if (samplesBenchmarkAdmission) {
      try {
        const convergenceSnapshot =
          await resolveBenchmarkPartitionConvergenceSnapshot(
            cluster,
            clusterNodes,
            distribution,
            options,
          );
        readyReplicaNodeIds = new Set(
          Array.isArray(convergenceSnapshot?.readyReplicaNodeIds) ?
            convergenceSnapshot.readyReplicaNodeIds :
            [],
        );
        const admissionReadyNodeIds = new Set(
          Array.isArray(convergenceSnapshot?.admissionReadyNodeIds) ?
            convergenceSnapshot.admissionReadyNodeIds :
            [],
        );
        readinessReasonHistogram =
          convergenceSnapshot?.readinessReasonHistogram &&
          typeof convergenceSnapshot.readinessReasonHistogram === 'object' ?
            convergenceSnapshot.readinessReasonHistogram :
            null;
        convergenceStateHistogram =
          convergenceSnapshot?.convergenceStateHistogram &&
          typeof convergenceSnapshot.convergenceStateHistogram === 'object' ?
            convergenceSnapshot.convergenceStateHistogram :
            null;
        dispatchContributionHistogram =
          convergenceSnapshot?.dispatchContributionHistogram &&
          typeof convergenceSnapshot.dispatchContributionHistogram === 'object' ?
            convergenceSnapshot.dispatchContributionHistogram :
            null;
        degradationStateHistogram =
          convergenceSnapshot?.degradationStateHistogram &&
          typeof convergenceSnapshot.degradationStateHistogram === 'object' ?
            convergenceSnapshot.degradationStateHistogram :
            null;
        convergenceEvaluations =
          buildBenchmarkConvergenceEvaluationSummaries(convergenceSnapshot);
        criticalControlPlaneStability =
          convergenceSnapshot?.criticalControlPlaneStability &&
          typeof convergenceSnapshot.criticalControlPlaneStability === 'object' ?
            convergenceSnapshot.criticalControlPlaneStability :
            null;
        localPrimaryNodes = Array.isArray(
          convergenceSnapshot?.localPrimaryNodes,
        ) ?
          convergenceSnapshot.localPrimaryNodes :
          [];
        routedSupportNodes = Array.isArray(
          convergenceSnapshot?.routedSupportNodes,
        ) ?
          convergenceSnapshot.routedSupportNodes :
          [];
        effectiveReplicaBearingNodeIds = new Set(
          Array.isArray(convergenceSnapshot?.replicaBearingNodeIds) ?
            convergenceSnapshot.replicaBearingNodeIds :
            Array.from(effectiveReplicaBearingNodeIds),
        );
        const readyNonSeedNodes = [];
        const readySeedNodes = [];
        for (const node of clusterNodes) {
          const nodeId = String(node?.id || '');
          if (!admissionReadyNodeIds.has(nodeId)) {
            continue;
          }
          if (nodeId === String(seedNode?.id || '')) {
            readySeedNodes.push(node);
            continue;
          }
          readyNonSeedNodes.push(node);
        }
        admissionReadyNodes = readyNonSeedNodes.concat(readySeedNodes);
      } catch (_error) {
        readyReplicaNodeIds = null;
        admissionReadyNodes = [];
        readinessReasonHistogram = null;
        convergenceStateHistogram = null;
        dispatchContributionHistogram = null;
        degradationStateHistogram = null;
        convergenceEvaluations = [];
        criticalControlPlaneStability = null;
        localPrimaryNodes = [];
        routedSupportNodes = [];
      }
    }
    const preferredNodes = [];
    const fallbackNodes = [];
    const deferredSeedNodes = [];
    for (const node of clusterNodes) {
      const nodeId = String(node?.id || '');
      if (!effectiveReplicaBearingNodeIds.has(nodeId)) {
        continue;
      }
      if (nodeId === String(seedNode?.id || '')) {
        deferredSeedNodes.push(node);
        continue;
      }
      if (
        readyReplicaNodeIds instanceof Set &&
        readyReplicaNodeIds.has(nodeId)
      ) {
        preferredNodes.push(node);
        continue;
      }
      fallbackNodes.push(node);
    }
    for (const node of deferredSeedNodes) {
      const nodeId = String(node?.id || '');
      if (
        readyReplicaNodeIds instanceof Set &&
        readyReplicaNodeIds.has(nodeId)
      ) {
        preferredNodes.push(node);
        continue;
      }
      fallbackNodes.push(node);
    }
    return {
      diagnostics: buildPartitioningPlannerDiagnostics({
        selectedNodes: preferredNodes.concat(fallbackNodes),
        admissionReadyNodes,
        readyReplicaNodes: preferredNodes,
        replicaBearingNodeCount: effectiveReplicaBearingNodeIds.size,
        replicaBearingNodeIds: Array.from(effectiveReplicaBearingNodeIds),
        partitionCount: distribution.partitionCount,
        readinessReasonHistogram,
        convergenceStateHistogram,
        localPrimaryNodes,
        routedSupportNodes,
        dispatchContributionHistogram,
        degradationStateHistogram,
        selectionObservationState: distribution.observationState,
        selectionObservationRetryAfterMs: distribution.observationRetryAfterMs,
        selectionObservationError: distribution.observationError,
        selectionObservationReasonCodes: distribution.observationReasonCodes,
        criticalControlPlaneStability,
        convergenceEvaluations,
      }),
      distribution,
      admissionReadyNodes,
      criticalControlPlaneStability,
      localPrimaryNodes,
      routedSupportNodes,
      selectedNodes: preferredNodes.concat(fallbackNodes),
      readyReplicaNodes: preferredNodes,
    };
  };

  const targetNodeCount = resolveBenchmarkAdmissionRequiredNodeCount(
    cluster,
    options,
  );
  const bootstrapRequiredNodeCount = resolveBenchmarkBootstrapRequiredNodeCount(
    cluster,
    options,
  );
  const timeoutMs = resolveBenchmarkAdmissionTimeoutMs(cluster, options);
  const stableWindowMs = resolveBenchmarkAdmissionStableWindowMs(
    cluster,
    options,
  );
  const pollIntervalMs = resolveBenchmarkAdmissionPollIntervalMs(
    cluster,
    options,
  );
  const deadlineAtMs = Date.now() + timeoutMs;
  let readySinceMs = null;
  let lastDistribution = null;
  let lastSelectedNodes = [];
  let lastAdmissionReadyNodes = [];
  let lastReadyReplicaNodes = [];
  let lastLocalPrimaryNodes = [];
  let lastRoutedSupportNodes = [];
  let lastSelectionDiagnostics = buildPartitioningPlannerDiagnostics();

  while (true) {
    try {
      const selected = await selectLoadNodes();
      lastDistribution = selected.distribution;
      lastSelectedNodes = selected.selectedNodes;
      lastAdmissionReadyNodes = selected.admissionReadyNodes;
      lastReadyReplicaNodes = selected.readyReplicaNodes;
      lastLocalPrimaryNodes = selected.localPrimaryNodes;
      lastRoutedSupportNodes = selected.routedSupportNodes;
      lastSelectionDiagnostics = selected.diagnostics;
    } catch (_error) {
      lastSelectionDiagnostics =
        buildPartitioningPlannerDiagnosticsFromPreviousState(
          lastSelectionDiagnostics,
          lastDistribution,
          lastSelectedNodes,
          lastAdmissionReadyNodes,
          lastReadyReplicaNodes,
          lastLocalPrimaryNodes,
          lastRoutedSupportNodes,
          _error,
        );
    }

    const replicaBootstrapReady =
      lastSelectedNodes.length >= bootstrapRequiredNodeCount;
    if (replicaBootstrapReady) {
      const nowMs = Date.now();
      if (stableWindowMs <= ZERO) {
        break;
      }
      if (readySinceMs === null) {
        readySinceMs = nowMs;
      }
      if (nowMs - readySinceMs >= stableWindowMs) {
        break;
      }
    } else {
      readySinceMs = null;
    }

    if (Date.now() > deadlineAtMs && readySinceMs === null) {
      throw buildPartitioningPlannerTimeoutError(
        'Timed out after ' +
          timeoutMs +
          'ms waiting for partitioning bootstrap quorum for table ' +
          String(options.tableName || 'unknown') +
          '; lastReadyReplicaCount=' +
          lastReadyReplicaNodes.length +
          '; lastReplicaBearingCount=' +
          lastSelectedNodes.length +
          '; lastReplicaSpread=' +
          String(lastDistribution?.replicaNodeCount || ZERO) +
          '; selectedNodeIds=' +
          mapNodeIds(lastSelectedNodes).join(',') +
          '; readyReplicaNodeIds=' +
          mapNodeIds(lastReadyReplicaNodes).join(','),
        lastSelectionDiagnostics,
      );
    }

    await sleep(pollIntervalMs);
  }

  const bootstrapNodes = resolvePartitioningDispatchNodes(
    samplesBenchmarkAdmission,
    {
      selectedNodes: lastSelectedNodes,
      admissionReadyNodes: isBenchmarkCriticalControlPlaneStable(
        lastSelectionDiagnostics.criticalControlPlaneStability,
      ) ?
        [] :
        lastAdmissionReadyNodes,
      readyReplicaNodes: lastReadyReplicaNodes,
      criticalControlPlaneStability:
        lastSelectionDiagnostics.criticalControlPlaneStability,
    },
    [],
    targetNodeCount,
    bootstrapRequiredNodeCount,
  );
  let currentNodes = resolvePartitioningDispatchNodes(
    samplesBenchmarkAdmission,
    {
      selectedNodes: lastSelectedNodes,
      admissionReadyNodes: lastAdmissionReadyNodes,
      readyReplicaNodes: lastReadyReplicaNodes,
      criticalControlPlaneStability:
        lastSelectionDiagnostics.criticalControlPlaneStability,
    },
    bootstrapNodes,
    targetNodeCount,
    bootstrapRequiredNodeCount,
  );
  lastSelectionDiagnostics = buildPartitioningDispatchPlannerDiagnostics(
    {
      diagnostics: lastSelectionDiagnostics,
      admissionReadyNodes: lastAdmissionReadyNodes,
      readyReplicaNodes: lastReadyReplicaNodes,
      localPrimaryNodes: lastLocalPrimaryNodes,
      routedSupportNodes: lastRoutedSupportNodes,
    },
    currentNodes,
  );
  let stopped = false;
  let refreshTimer = null;

  const refreshNodes = async () => {
    if (stopped) {
      return;
    }
    try {
      const selected = await selectLoadNodes();
      currentNodes = resolvePartitioningDispatchNodes(
        samplesBenchmarkAdmission,
        selected,
        currentNodes,
        targetNodeCount,
        bootstrapRequiredNodeCount,
      );
      lastSelectionDiagnostics = buildPartitioningDispatchPlannerDiagnostics(
        selected,
        currentNodes,
      );
    } catch (_error) {
      return;
    }
  };

  if (samplesBenchmarkAdmission || currentNodes.length < targetNodeCount) {
    refreshTimer = setInterval(() => {
      void refreshNodes();
    }, pollIntervalMs);
    if (typeof refreshTimer.unref === 'function') {
      refreshTimer.unref();
    }
    void refreshNodes();
  }

  return {
    initialNodes: bootstrapNodes,
    nodeResolver: () => currentNodes,
    stop: () => {
      stopped = true;
      if (refreshTimer !== null) {
        clearInterval(refreshTimer);
        refreshTimer = null;
      }
    },
    getDiagnostics: () => lastSelectionDiagnostics,
    bootstrapRequiredNodeCount,
    targetNodeCount,
  };
}

/**
 * Scale partitioning load to the admitted node set so benchmark traffic leaves
 * room for control-plane split and rebalance writes.
 * @param {number} requestedOpsPerSec
 * @param {number} admittedNodeCount
 * @param {number} clusterNodeCount
 * @return {number}
 */
function resolvePartitioningBenchmarkLoadOpsPerSec(
  requestedOpsPerSec,
  admittedNodeCount,
  clusterNodeCount,
) {
  const normalizedRequestedOpsPerSec =
    Number.isFinite(requestedOpsPerSec) && requestedOpsPerSec > ZERO ?
      Number(requestedOpsPerSec) :
      BENCHMARK_DEFAULTS.loadOpsPerSec;
  const normalizedAdmittedNodeCount =
    Number.isInteger(admittedNodeCount) && admittedNodeCount > ZERO ?
      admittedNodeCount :
      ONE;
  const normalizedClusterNodeCount =
    Number.isInteger(clusterNodeCount) && clusterNodeCount > ZERO ?
      clusterNodeCount :
      normalizedAdmittedNodeCount;
  return Math.max(
    1,
    Math.round(
      normalizedRequestedOpsPerSec *
        (normalizedAdmittedNodeCount / normalizedClusterNodeCount) *
        PARTITIONING_LOAD_HEADROOM_RATIO,
    ),
  );
}

function createPartitioningAdaptiveDispatchGuardrail() {
  return {
    ...PARTITIONING_ADAPTIVE_DISPATCH_GUARDRAIL,
  };
}

/**
 * Return the first non-empty table_id from rows.
 * @param {Array<Object>} rows
 * @return {string|null}
 */
function firstTableId(rows) {
  for (const row of rows) {
    const value = row?.table_id || row?.tableId;
    if (typeof value === 'string' && value.length > ZERO) {
      return value;
    }
  }
  return null;
}

function firstStringField(row, ...fieldNames) {
  for (const fieldName of fieldNames) {
    const value = row?.[fieldName];
    if (typeof value === 'string' && value.length > ZERO) {
      return value;
    }
  }
  return '';
}

function firstPositiveIntegerField(row, ...fieldNames) {
  for (const fieldName of fieldNames) {
    const value = Number(row?.[fieldName]);
    if (Number.isInteger(value) && value > ZERO) {
      return value;
    }
  }
  return ZERO;
}

/**
 * Resolve the first parseable table policy payload from rows.
 * @param {Array<Object>} rows
 * @return {Object|null}
 */
function firstTablePolicies(rows) {
  for (const row of rows) {
    const rawValue = row?.table_policies ?? row?.tablePolicies ?? null;
    if (rawValue === null || rawValue === undefined) {
      continue;
    }
    if (typeof rawValue === 'object') {
      return rawValue;
    }
    if (typeof rawValue !== 'string' || rawValue.length === ZERO) {
      continue;
    }
    try {
      const parsed = JSON.parse(rawValue);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    } catch (_error) {
      continue;
    }
  }
  return null;
}

/**
 * Resolve affected row count from one query result when present.
 * @param {*} result
 * @return {number|null}
 */
function affectedRowCountFromResult(result) {
  const candidates = [
    result?.affectedRows,
    result?.changes,
    result?.partitionResult?.affectedRows,
    result?.hostResult?.affectedRows,
  ];
  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (!Number.isFinite(parsed)) {
      continue;
    }
    return Math.max(ZERO, Math.floor(parsed));
  }
  return null;
}

/**
 * Summarize mutation-result counters for diagnostics.
 * @param {*} result
 * @return {Object}
 */
function summarizeMutationResult(result) {
  return {
    affectedRows: result?.affectedRows ?? null,
    changes: result?.changes ?? null,
    count: result?.count ?? null,
    hostAffectedRows: result?.hostResult?.affectedRows ?? null,
    operation: result?.operation ?? null,
    warning: result?.warning ?? null,
  };
}

function normalizeMutationVisibilityState(value) {
  return normalizeControlPlaneSystemTableVisibilityState(value, null);
}

function summarizeMutationVisibility(result) {
  const reasonCodes = Array.isArray(result?.reasonCodes) ?
    [
      ...new Set(
        result.reasonCodes
          .map((value) => String(value || '').trim())
          .filter((value) => value.length > ZERO),
      ),
    ] :
    [];
  return {
    visibilityState: normalizeMutationVisibilityState(result?.visibilityState),
    contractState: normalizeOwnerContractState(result?.contractState, null),
    nextAction: normalizeOwnerContractNextAction(result?.nextAction, null),
    authoritativeVisibilityConfirmed:
      result?.authoritativeVisibilityConfirmed === true,
    retryAfterMs:
      Number.isFinite(result?.retryAfterMs) && result.retryAfterMs > ZERO ?
        Math.floor(result.retryAfterMs) :
        null,
    outcome:
      typeof result?.outcome === 'string' && result.outcome.length > ZERO ?
        result.outcome :
        null,
    reasonCodes,
    runtimeAuthorityState:
      typeof result?.runtimeAuthority?.state === 'string' &&
      result.runtimeAuthority.state.length > ZERO ?
        result.runtimeAuthority.state :
        null,
  };
}

function advanceMutationVisibilitySummary(previous, result) {
  const current =
    previous && typeof previous === 'object' ?
      previous :
      summarizeMutationVisibility(null);
  const next = summarizeMutationVisibility(result);
  if (
    next.visibilityState !== null ||
    next.contractState !== null ||
    next.nextAction !== null ||
    next.authoritativeVisibilityConfirmed === true ||
    next.retryAfterMs !== null ||
    next.outcome !== null ||
    next.reasonCodes.length > ZERO ||
    next.runtimeAuthorityState !== null
  ) {
    return next;
  }
  return current;
}

function shouldDeferAuthoritativeRepair(visibilitySummary) {
  const visibilityState = normalizeMutationVisibilityState(
    visibilitySummary?.visibilityState,
  );
  const contractState = normalizeOwnerContractState(
    visibilitySummary?.contractState,
    null,
  );
  const reasonCodes = Array.isArray(visibilitySummary?.reasonCodes) ?
    visibilitySummary.reasonCodes :
    [];
  return (
    contractState === OWNER_CONTRACT_STATE.PENDING ||
    contractState === OWNER_CONTRACT_STATE.DEFERRED ||
    isPendingControlPlaneSystemTableVisibilityState(visibilityState) ||
    (visibilitySummary?.outcome === 'deferred' &&
      (reasonCodes.includes('control_plane_publication_pending') ||
        reasonCodes.includes('publication_epoch_pending') ||
        visibilitySummary?.runtimeAuthorityState === 'establishing'))
  );
}

export const TABLE_DISTRIBUTION_HELPERS_SEGMENT_2 = {
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
  normalizeControlPlaneSystemTableVisibilityState,
  isPendingControlPlaneSystemTableVisibilityState,
  CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE,
  OWNER_CONTRACT_STATE,
  normalizeOwnerContractNextAction,
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
  queryTableDistribution,
};
