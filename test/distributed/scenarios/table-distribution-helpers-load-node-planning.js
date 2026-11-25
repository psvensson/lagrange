import assert from 'node:assert';
import {TABLE_DISTRIBUTION_CONTROL_QUERY_HELPERS} from './table-distribution-helpers-control-query.js';

const TABLE_DISTRIBUTION_QUERY_HELPERS_MODULE_PATH =
  './table-distribution-helpers-distribution-query.js';

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
} = TABLE_DISTRIBUTION_CONTROL_QUERY_HELPERS;

let tableDistributionQueryHelpersPromise = null;

async function queryTableDistribution(seedNode, options = {}) {
  if (!tableDistributionQueryHelpersPromise) {
    tableDistributionQueryHelpersPromise = import(
      TABLE_DISTRIBUTION_QUERY_HELPERS_MODULE_PATH
    ).then((module) => module.TABLE_DISTRIBUTION_QUERY_HELPERS);
  }
  const distributionQueryHelpers = await tableDistributionQueryHelpersPromise;
  return distributionQueryHelpers.queryTableDistribution(seedNode, options);
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

function indexNextNodesById(nextNodes) {
  const nextNodeById = new Map();
  const anonymousNodes = [];
  for (const node of nextNodes) {
    const nodeId = String(node?.id || '');
    if (nodeId.length > ZERO) {
      nextNodeById.set(nodeId, node);
    } else {
      anonymousNodes.push(node);
    }
  }
  return {nextNodeById, anonymousNodes};
}

function appendRemainingNextNodes(
  orderedNodes,
  seenNodeIds,
  nextNodes,
  anonymousNodes,
  normalizedLimit,
) {
  for (const node of nextNodes) {
    if (orderedNodes.length >= normalizedLimit) {
      break;
    }
    const nodeId = String(node?.id || '');
    if (nodeId.length > ZERO) {
      if (!seenNodeIds.has(nodeId)) {
        orderedNodes.push(node);
        seenNodeIds.add(nodeId);
      }
      continue;
    }
    orderedNodes.push(
      anonymousNodes.length > ZERO ? anonymousNodes.shift() : node,
    );
  }
}

function preserveNodeOrder(
  currentNodes,
  nextNodes,
  limit = Number.POSITIVE_INFINITY,
) {
  const normalizedLimit =
    Number.isInteger(limit) && limit > ZERO ? limit : nextNodes.length;
  const {nextNodeById, anonymousNodes} = indexNextNodesById(nextNodes);
  const orderedNodes = [];
  const seenNodeIds = new Set();
  for (const node of currentNodes) {
    const nodeId = String(node?.id || '');
    const nextNode = nodeId.length > ZERO ? nextNodeById.get(nodeId) : null;
    if (!nextNode || seenNodeIds.has(nodeId)) {
      continue;
    }
    orderedNodes.push(nextNode);
    seenNodeIds.add(nodeId);
    if (orderedNodes.length >= normalizedLimit) {
      return orderedNodes;
    }
  }
  appendRemainingNextNodes(
    orderedNodes,
    seenNodeIds,
    nextNodes,
    anonymousNodes,
    normalizedLimit,
  );
  return orderedNodes;
}

function buildNodeByIdLookup(nodes) {
  return new Map(
    (Array.isArray(nodes) ? nodes : [])
      .map((node) => [String(node?.id || ''), node])
      .filter(([nodeId]) => nodeId.length > ZERO),
  );
}

function partitionCurrentNodesByLookups(
  currentNodes,
  readyNodeById,
  admissionReadyNodeById,
  selectedNodeById,
) {
  const currentReadyNodes = [];
  const currentAdmissionReadyNodes = [];
  const currentSelectedNodes = [];
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
  return {
    currentReadyNodes,
    currentAdmissionReadyNodes,
    currentSelectedNodes,
  };
}

function selectUnstableControlPlaneBootstrapContributors({
  admissionReadyNodes,
  readyReplicaNodes,
  selectedNodes,
  normalizedBootstrapRequiredNodeCount,
}) {
  if (
    admissionReadyNodes.length >= normalizedBootstrapRequiredNodeCount &&
    selectedNodes.length > ZERO
  ) {
    return selectedNodes;
  }
  const blockedReplicaBackfillRequired =
    admissionReadyNodes.length === ZERO &&
    readyReplicaNodes.length > ZERO &&
    selectedNodes.length > readyReplicaNodes.length;
  if (blockedReplicaBackfillRequired) {
    return selectedNodes;
  }
  if (readyReplicaNodes.length > ZERO) {
    return readyReplicaNodes;
  }
  return admissionReadyNodes.length > ZERO ?
    admissionReadyNodes :
    selectedNodes;
}

function resolvePositiveCountOrFallback(count, fallback) {
  return Number.isInteger(count) && count > ZERO ? count : fallback;
}

function buildStablePartitioningOrderedNodes({
  currentReadyNodes,
  readyReplicaNodes,
  currentSelectedNodes,
  selectedNodes,
  currentAdmissionReadyNodes,
  admissionReadyNodes,
  normalizedTargetCount,
  normalizedBootstrapRequiredNodeCount,
}) {
  const orderedNodes = [];
  const orderedNodeIds = new Set();
  const appendNodes = (nodes) => {
    for (const node of nodes) {
      if (orderedNodes.length >= normalizedTargetCount) {
        return;
      }
      const nodeId = String(node?.id || '');
      if (nodeId.length > ZERO) {
        if (orderedNodeIds.has(nodeId)) {
          continue;
        }
        orderedNodeIds.add(nodeId);
      }
      orderedNodes.push(node);
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

function extractArrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

function extractSelectedNodeBuckets(selected) {
  const source = selected && typeof selected === 'object' ? selected : {};
  const selectedNodes = extractArrayOrEmpty(source.selectedNodes);
  const admissionReadyNodes = extractArrayOrEmpty(source.admissionReadyNodes);
  const readyReplicaNodes = extractArrayOrEmpty(source.readyReplicaNodes);
  const localPrimaryNodeCount = Array.isArray(source.localPrimaryNodes) ?
    source.localPrimaryNodes.length :
    readyReplicaNodes.length;
  const criticalControlPlaneStability = normalizeObjectOrNull(
    source.criticalControlPlaneStability,
  );
  return {
    selectedNodes,
    admissionReadyNodes,
    readyReplicaNodes,
    localPrimaryNodeCount,
    criticalControlPlaneStability,
  };
}

function resolvePartitioningDispatchNodes(
  supportsBenchmarkAdmission,
  selected,
  currentNodes = [],
  targetNodeCount = ZERO,
  bootstrapRequiredNodeCount = ZERO,
) {
  const normalizedTargetCount = resolvePositiveCountOrFallback(
    targetNodeCount,
    Number.POSITIVE_INFINITY,
  );
  const normalizedBootstrapRequiredNodeCount = resolvePositiveCountOrFallback(
    bootstrapRequiredNodeCount,
    ONE,
  );
  const {
    selectedNodes,
    admissionReadyNodes,
    readyReplicaNodes,
    localPrimaryNodeCount,
    criticalControlPlaneStability,
  } = extractSelectedNodeBuckets(selected);
  if (!supportsBenchmarkAdmission) {
    const nextNodes =
      selectedNodes.length === ZERO ? currentNodes : selectedNodes;
    return preserveNodeOrder(currentNodes, nextNodes, targetNodeCount);
  }
  const dispatchMode = resolveBenchmarkPartitionDispatchMode({
    criticalControlPlaneStability,
    localPrimaryNodeCount,
    readyReplicaNodeCount: readyReplicaNodes.length,
    bootstrapRequiredNodeCount: normalizedBootstrapRequiredNodeCount,
    targetNodeCount: resolvePositiveCountOrFallback(
      targetNodeCount,
      normalizedBootstrapRequiredNodeCount,
    ),
  });
  if (dispatchMode === BENCHMARK_PARTITION_DISPATCH_MODE.LOCAL_READY_ONLY) {
    return preserveNodeOrder(currentNodes, readyReplicaNodes, targetNodeCount);
  }
  if (!isBenchmarkCriticalControlPlaneStable(criticalControlPlaneStability)) {
    const bootstrapContributorNodes =
      selectUnstableControlPlaneBootstrapContributors({
        admissionReadyNodes,
        readyReplicaNodes,
        selectedNodes,
        normalizedBootstrapRequiredNodeCount,
      });
    return preserveNodeOrder(
      currentNodes,
      bootstrapContributorNodes,
      Math.max(
        normalizedBootstrapRequiredNodeCount,
        bootstrapContributorNodes.length,
      ),
    );
  }
  const {
    currentReadyNodes,
    currentAdmissionReadyNodes,
    currentSelectedNodes,
  } = partitionCurrentNodesByLookups(
    currentNodes,
    buildNodeByIdLookup(readyReplicaNodes),
    buildNodeByIdLookup(admissionReadyNodes),
    buildNodeByIdLookup(selectedNodes),
  );
  return buildStablePartitioningOrderedNodes({
    currentReadyNodes,
    readyReplicaNodes,
    currentSelectedNodes,
    selectedNodes,
    currentAdmissionReadyNodes,
    admissionReadyNodes,
    normalizedTargetCount,
    normalizedBootstrapRequiredNodeCount,
  });
}

function formatTableTargetDescription(tableName) {
  return typeof tableName === 'string' && tableName.length > ZERO ?
    ' for table "' + tableName + '"' :
    '';
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
        formatTableTargetDescription(options.tableName) +
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
function normalizeObjectOrNull(value) {
  return value && typeof value === 'object' ? value : null;
}

function orderAdmissionReadyClusterNodes(
  clusterNodes,
  admissionReadyNodeIds,
  seedNodeId,
) {
  const readyNonSeedNodes = [];
  const readySeedNodes = [];
  for (const node of clusterNodes) {
    const nodeId = String(node?.id || '');
    if (!admissionReadyNodeIds.has(nodeId)) {
      continue;
    }
    if (nodeId === seedNodeId) {
      readySeedNodes.push(node);
    } else {
      readyNonSeedNodes.push(node);
    }
  }
  return readyNonSeedNodes.concat(readySeedNodes);
}

function partitionReplicaBearingNodes(
  clusterNodes,
  effectiveReplicaBearingNodeIds,
  readyReplicaNodeIds,
  seedNodeId,
) {
  const preferredNodes = [];
  const fallbackNodes = [];
  const deferredSeedNodes = [];
  const pushByReadiness = (node, nodeId) => {
    if (
      readyReplicaNodeIds instanceof Set &&
      readyReplicaNodeIds.has(nodeId)
    ) {
      preferredNodes.push(node);
    } else {
      fallbackNodes.push(node);
    }
  };
  for (const node of clusterNodes) {
    const nodeId = String(node?.id || '');
    if (!effectiveReplicaBearingNodeIds.has(nodeId)) {
      continue;
    }
    if (nodeId === seedNodeId) {
      deferredSeedNodes.push(node);
      continue;
    }
    pushByReadiness(node, nodeId);
  }
  for (const node of deferredSeedNodes) {
    pushByReadiness(node, String(node?.id || ''));
  }
  return {preferredNodes, fallbackNodes};
}

function buildEmptyPartitionAdmissionSample(initialReplicaBearingNodeIds) {
  return {
    readyReplicaNodeIds: null,
    effectiveReplicaBearingNodeIds: initialReplicaBearingNodeIds,
    admissionReadyNodes: [],
    readinessReasonHistogram: null,
    convergenceStateHistogram: null,
    dispatchContributionHistogram: null,
    degradationStateHistogram: null,
    convergenceEvaluations: [],
    criticalControlPlaneStability: null,
    localPrimaryNodes: [],
    routedSupportNodes: [],
  };
}

function resolveEffectiveReplicaBearingSet(
  snapshot,
  initialReplicaBearingNodeIds,
) {
  return new Set(
    Array.isArray(snapshot.replicaBearingNodeIds) ?
      snapshot.replicaBearingNodeIds :
      Array.from(initialReplicaBearingNodeIds),
  );
}

async function sampleBenchmarkPartitionAdmissionForPlan({
  cluster,
  clusterNodes,
  distribution,
  options,
  seedNodeId,
  initialReplicaBearingNodeIds,
}) {
  try {
    const rawSnapshot = await resolveBenchmarkPartitionConvergenceSnapshot(
      cluster,
      clusterNodes,
      distribution,
      options,
    );
    const snapshot = normalizeObjectOrNull(rawSnapshot) || {};
    const readyReplicaNodeIds = new Set(
      extractArrayOrEmpty(snapshot.readyReplicaNodeIds),
    );
    const admissionReadyNodeIds = new Set(
      extractArrayOrEmpty(snapshot.admissionReadyNodeIds),
    );
    return {
      readyReplicaNodeIds,
      effectiveReplicaBearingNodeIds: resolveEffectiveReplicaBearingSet(
        snapshot,
        initialReplicaBearingNodeIds,
      ),
      admissionReadyNodes: orderAdmissionReadyClusterNodes(
        clusterNodes,
        admissionReadyNodeIds,
        seedNodeId,
      ),
      readinessReasonHistogram: normalizeObjectOrNull(
        snapshot.readinessReasonHistogram,
      ),
      convergenceStateHistogram: normalizeObjectOrNull(
        snapshot.convergenceStateHistogram,
      ),
      dispatchContributionHistogram: normalizeObjectOrNull(
        snapshot.dispatchContributionHistogram,
      ),
      degradationStateHistogram: normalizeObjectOrNull(
        snapshot.degradationStateHistogram,
      ),
      convergenceEvaluations:
        buildBenchmarkConvergenceEvaluationSummaries(snapshot),
      criticalControlPlaneStability: normalizeObjectOrNull(
        snapshot.criticalControlPlaneStability,
      ),
      localPrimaryNodes: extractArrayOrEmpty(snapshot.localPrimaryNodes),
      routedSupportNodes: extractArrayOrEmpty(snapshot.routedSupportNodes),
    };
  } catch (_error) {
    return buildEmptyPartitionAdmissionSample(initialReplicaBearingNodeIds);
  }
}

function isQuorumStableForWindow(
  replicaBootstrapReady,
  readySinceMs,
  stableWindowMs,
) {
  if (!replicaBootstrapReady) {
    return {done: false, readySinceMs: null};
  }
  if (stableWindowMs <= ZERO) {
    return {done: true, readySinceMs};
  }
  const nowMs = Date.now();
  const effectiveReadySinceMs = readySinceMs === null ? nowMs : readySinceMs;
  return {
    done: nowMs - effectiveReadySinceMs >= stableWindowMs,
    readySinceMs: effectiveReadySinceMs,
  };
}

function buildBootstrapQuorumTimeoutMessage({
  timeoutMs,
  tableName,
  lastReadyReplicaNodes,
  lastSelectedNodes,
  lastDistribution,
}) {
  return (
    'Timed out after ' +
    timeoutMs +
    'ms waiting for partitioning bootstrap quorum for table ' +
    String(tableName || 'unknown') +
    '; lastReadyReplicaCount=' +
    lastReadyReplicaNodes.length +
    '; lastReplicaBearingCount=' +
    lastSelectedNodes.length +
    '; lastReplicaSpread=' +
    String(lastDistribution?.replicaNodeCount || ZERO) +
    '; selectedNodeIds=' +
    mapNodeIds(lastSelectedNodes).join(',') +
    '; readyReplicaNodeIds=' +
    mapNodeIds(lastReadyReplicaNodes).join(',')
  );
}

async function waitForPartitioningBootstrapQuorum({
  selectLoadNodes,
  bootstrapRequiredNodeCount,
  timeoutMs,
  stableWindowMs,
  pollIntervalMs,
  tableName,
}) {
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

    const quorumStatus = isQuorumStableForWindow(
      lastSelectedNodes.length >= bootstrapRequiredNodeCount,
      readySinceMs,
      stableWindowMs,
    );
    readySinceMs = quorumStatus.readySinceMs;
    if (quorumStatus.done) {
      return {
        lastSelectedNodes,
        lastAdmissionReadyNodes,
        lastReadyReplicaNodes,
        lastLocalPrimaryNodes,
        lastRoutedSupportNodes,
        lastSelectionDiagnostics,
      };
    }

    if (Date.now() > deadlineAtMs && readySinceMs === null) {
      throw buildPartitioningPlannerTimeoutError(
        buildBootstrapQuorumTimeoutMessage({
          timeoutMs,
          tableName,
          lastReadyReplicaNodes,
          lastSelectedNodes,
          lastDistribution,
        }),
        lastSelectionDiagnostics,
      );
    }

    await sleep(pollIntervalMs);
  }
}

function startPeriodicPlanNodeRefresh(
  shouldRefresh,
  refreshNodes,
  pollIntervalMs,
) {
  if (!shouldRefresh) {
    return null;
  }
  const timer = setInterval(() => {
    void refreshNodes();
  }, pollIntervalMs);
  if (typeof timer.unref === 'function') {
    timer.unref();
  }
  void refreshNodes();
  return timer;
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
  const seedNodeId = String(seedNode?.id || '');

  const selectLoadNodes = async () => {
    const distribution = await queryTableDistribution(seedNode, {
      tableName: options.tableName,
      queryNodes: options.queryNodes,
      fallbackNodes: options.fallbackNodes,
    });
    const initialReplicaBearingNodeIds =
      distribution.replicaNodeIds instanceof Set ?
        new Set(distribution.replicaNodeIds) :
        new Set();
    const sampled = samplesBenchmarkAdmission ?
      await sampleBenchmarkPartitionAdmissionForPlan({
        cluster,
        clusterNodes,
        distribution,
        options,
        seedNodeId,
        initialReplicaBearingNodeIds,
      }) :
      buildEmptyPartitionAdmissionSample(initialReplicaBearingNodeIds);
    const {preferredNodes, fallbackNodes} = partitionReplicaBearingNodes(
      clusterNodes,
      sampled.effectiveReplicaBearingNodeIds,
      sampled.readyReplicaNodeIds,
      seedNodeId,
    );
    const selectedNodes = preferredNodes.concat(fallbackNodes);
    return {
      diagnostics: buildPartitioningPlannerDiagnostics({
        selectedNodes,
        admissionReadyNodes: sampled.admissionReadyNodes,
        readyReplicaNodes: preferredNodes,
        replicaBearingNodeCount: sampled.effectiveReplicaBearingNodeIds.size,
        replicaBearingNodeIds: Array.from(
          sampled.effectiveReplicaBearingNodeIds,
        ),
        partitionCount: distribution.partitionCount,
        readinessReasonHistogram: sampled.readinessReasonHistogram,
        convergenceStateHistogram: sampled.convergenceStateHistogram,
        localPrimaryNodes: sampled.localPrimaryNodes,
        routedSupportNodes: sampled.routedSupportNodes,
        dispatchContributionHistogram: sampled.dispatchContributionHistogram,
        degradationStateHistogram: sampled.degradationStateHistogram,
        selectionObservationState: distribution.observationState,
        selectionObservationRetryAfterMs: distribution.observationRetryAfterMs,
        selectionObservationError: distribution.observationError,
        selectionObservationReasonCodes: distribution.observationReasonCodes,
        criticalControlPlaneStability: sampled.criticalControlPlaneStability,
        convergenceEvaluations: sampled.convergenceEvaluations,
      }),
      distribution,
      admissionReadyNodes: sampled.admissionReadyNodes,
      criticalControlPlaneStability: sampled.criticalControlPlaneStability,
      localPrimaryNodes: sampled.localPrimaryNodes,
      routedSupportNodes: sampled.routedSupportNodes,
      selectedNodes,
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
  const pollIntervalMs = resolveBenchmarkAdmissionPollIntervalMs(
    cluster,
    options,
  );
  const quorumResult = await waitForPartitioningBootstrapQuorum({
    selectLoadNodes,
    bootstrapRequiredNodeCount,
    timeoutMs: resolveBenchmarkAdmissionTimeoutMs(cluster, options),
    stableWindowMs: resolveBenchmarkAdmissionStableWindowMs(cluster, options),
    pollIntervalMs,
    tableName: options.tableName,
  });
  let {lastSelectionDiagnostics} = quorumResult;

  const bootstrapNodes = resolvePartitioningDispatchNodes(
    samplesBenchmarkAdmission,
    {
      selectedNodes: quorumResult.lastSelectedNodes,
      admissionReadyNodes: isBenchmarkCriticalControlPlaneStable(
        lastSelectionDiagnostics.criticalControlPlaneStability,
      ) ?
        [] :
        quorumResult.lastAdmissionReadyNodes,
      readyReplicaNodes: quorumResult.lastReadyReplicaNodes,
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
      selectedNodes: quorumResult.lastSelectedNodes,
      admissionReadyNodes: quorumResult.lastAdmissionReadyNodes,
      readyReplicaNodes: quorumResult.lastReadyReplicaNodes,
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
      admissionReadyNodes: quorumResult.lastAdmissionReadyNodes,
      readyReplicaNodes: quorumResult.lastReadyReplicaNodes,
      localPrimaryNodes: quorumResult.lastLocalPrimaryNodes,
      routedSupportNodes: quorumResult.lastRoutedSupportNodes,
    },
    currentNodes,
  );
  let stopped = false;

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

  let refreshTimer = startPeriodicPlanNodeRefresh(
    samplesBenchmarkAdmission || currentNodes.length < targetNodeCount,
    refreshNodes,
    pollIntervalMs,
  );

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

function parseSingleTablePolicyValue(rawValue) {
  if (rawValue === null || rawValue === undefined) {
    return null;
  }
  if (typeof rawValue === 'object') {
    return rawValue;
  }
  if (typeof rawValue !== 'string' || rawValue.length === ZERO) {
    return null;
  }
  try {
    const parsed = JSON.parse(rawValue);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_error) {
    return null;
  }
}

/**
 * Resolve the first parseable table policy payload from rows.
 * @param {Array<Object>} rows
 * @return {Object|null}
 */
function firstTablePolicies(rows) {
  for (const row of rows) {
    const parsed = parseSingleTablePolicyValue(
      row?.table_policies ?? row?.tablePolicies,
    );
    if (parsed) {
      return parsed;
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
  const source = result && typeof result === 'object' ? result : {};
  const hostResult =
    source.hostResult && typeof source.hostResult === 'object' ?
      source.hostResult :
      {};
  return {
    affectedRows: source.affectedRows ?? null,
    changes: source.changes ?? null,
    count: source.count ?? null,
    hostAffectedRows: hostResult.affectedRows ?? null,
    operation: source.operation ?? null,
    warning: source.warning ?? null,
  };
}

function normalizeMutationVisibilityState(value) {
  return normalizeControlPlaneSystemTableVisibilityState(value, null);
}

function normalizeNonEmptyStringOrNull(value) {
  return typeof value === 'string' && value.length > ZERO ? value : null;
}

function normalizeUniqueTrimmedStrings(values) {
  if (!Array.isArray(values)) {
    return [];
  }
  return [
    ...new Set(
      values
        .map((value) => String(value || '').trim())
        .filter((value) => value.length > ZERO),
    ),
  ];
}

function summarizeMutationVisibility(result) {
  const source = result && typeof result === 'object' ? result : {};
  const retryAfterMs = source.retryAfterMs;
  return {
    visibilityState: normalizeMutationVisibilityState(source.visibilityState),
    contractState: normalizeOwnerContractState(source.contractState, null),
    nextAction: normalizeOwnerContractNextAction(source.nextAction, null),
    authoritativeVisibilityConfirmed:
      source.authoritativeVisibilityConfirmed === true,
    retryAfterMs:
      Number.isFinite(retryAfterMs) && retryAfterMs > ZERO ?
        Math.floor(retryAfterMs) :
        null,
    outcome: normalizeNonEmptyStringOrNull(source.outcome),
    reasonCodes: normalizeUniqueTrimmedStrings(source.reasonCodes),
    runtimeAuthorityState: normalizeNonEmptyStringOrNull(
      source.runtimeAuthority?.state,
    ),
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

function isDeferredPublicationOutcome(visibilitySummary) {
  if (visibilitySummary?.outcome !== 'deferred') {
    return false;
  }
  const reasonCodes = Array.isArray(visibilitySummary.reasonCodes) ?
    visibilitySummary.reasonCodes :
    [];
  return (
    reasonCodes.includes('control_plane_publication_pending') ||
    reasonCodes.includes('publication_epoch_pending') ||
    visibilitySummary.runtimeAuthorityState === 'establishing'
  );
}

function shouldDeferAuthoritativeRepair(visibilitySummary) {
  const visibilityState = normalizeMutationVisibilityState(
    visibilitySummary?.visibilityState,
  );
  const contractState = normalizeOwnerContractState(
    visibilitySummary?.contractState,
    null,
  );
  return (
    contractState === OWNER_CONTRACT_STATE.PENDING ||
    contractState === OWNER_CONTRACT_STATE.DEFERRED ||
    isPendingControlPlaneSystemTableVisibilityState(visibilityState) ||
    isDeferredPublicationOutcome(visibilitySummary)
  );
}

export const TABLE_DISTRIBUTION_LOAD_NODE_PLANNING_HELPERS = {
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
