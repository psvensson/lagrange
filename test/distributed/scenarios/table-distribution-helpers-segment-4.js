import { TABLE_DISTRIBUTION_HELPERS_SEGMENT_3 } from "./table-distribution-helpers-segment-3.js";
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
} = TABLE_DISTRIBUTION_HELPERS_SEGMENT_3;

/**
 * Query the current partition + replica distribution for a single table.
 * @param {Object} seedNode
 * @param {Object} [options]
 * @param {string} [options.tableName]
 * @return {Promise<Object>}
 */
async function queryTableDistribution(seedNode, options = {}) {
  assert.ok(
    seedNode &&
      (typeof seedNode.query === "function" ||
        typeof seedNode.queryWithTimeout === "function"),
    "queryTableDistribution requires a seed node with query capability",
  );

  const { tableName } = resolveTableDistributionQueryConfig(options);
  const queryNodes = resolveControlQueryNodes(seedNode, options);
  let lastError = null;
  let bestDistribution = null;
  let deferredDistribution = null;
  for (const queryNode of queryNodes) {
    try {
      const distribution = await queryTableDistributionFromNode(
        queryNode,
        tableName,
        options,
      );
      if (isBetterTableDistributionCandidate(distribution, bestDistribution)) {
        bestDistribution = distribution;
      }
    } catch (error) {
      lastError = error;
      if (
        isRetryableControlPlaneProgressError(error) ||
        isTimeoutShapedError(error)
      ) {
        deferredDistribution = buildDeferredTableDistributionSnapshot(
          tableName,
          error,
        );
      }
    }
  }
  if (bestDistribution) {
    return bestDistribution;
  }
  if (deferredDistribution) {
    return deferredDistribution;
  }
  throw lastError || new Error("no_table_distribution_query_nodes_available");
}

function isBetterTableDistributionCandidate(candidate, currentBest) {
  if (!candidate || typeof candidate !== "object") {
    return false;
  }
  if (!currentBest || typeof currentBest !== "object") {
    return true;
  }

  const rankTopologyState = (topologyState) => {
    switch (String(topologyState || "")) {
      case TOPOLOGY_STATE_ROUTABLE:
        return 2;
      case TOPOLOGY_STATE_OPAQUE:
        return 1;
      case TOPOLOGY_STATE_INVALID:
      default:
        return 0;
    }
  };
  const candidateTopologyRank = rankTopologyState(candidate.topologyState);
  const currentTopologyRank = rankTopologyState(currentBest.topologyState);
  if (candidateTopologyRank !== currentTopologyRank) {
    return candidateTopologyRank > currentTopologyRank;
  }

  const candidateReplicaCount = Number(candidate.replicaNodeCount) || ZERO;
  const currentReplicaCount = Number(currentBest.replicaNodeCount) || ZERO;
  if (candidateReplicaCount !== currentReplicaCount) {
    return candidateReplicaCount > currentReplicaCount;
  }

  const candidatePartitionCount = Number(candidate.partitionCount) || ZERO;
  const currentPartitionCount = Number(currentBest.partitionCount) || ZERO;
  if (candidatePartitionCount !== currentPartitionCount) {
    return candidatePartitionCount > currentPartitionCount;
  }

  return false;
}

async function queryTableDistributionFromNode(node, tableName, options = {}) {
  let distribution = await readTableDistributionSnapshot(
    node,
    tableName,
    options,
  );
  if (shouldRepairTableDistributionSnapshot(distribution)) {
    await forceRepairControlSnapshot(node);
    distribution = await readTableDistributionSnapshot(
      node,
      tableName,
      options,
    );
  }

  return finalizeTableDistributionSnapshot(distribution, tableName);
}

async function readTableDistributionSnapshot(node, tableName, options = {}) {
  const partitionSql =
    SQL_SELECT_TABLE_PARTITIONS_PREFIX +
    escapeSql(tableName) +
    SQL_SELECT_TABLE_PARTITIONS_SUFFIX;
  const tableIdSql =
    SQL_SELECT_TABLE_ID_PREFIX +
    escapeSql(tableName) +
    SQL_SELECT_TABLE_ID_SUFFIX;

  const [partitionResult, tableResult] = await Promise.all([
    queryControlSingleWithProgressRetry(node, partitionSql, [], {
      lane: CONTROL_QUERY_LANE_SNAPSHOT,
      timeoutMs: options.queryTimeoutMs,
    }),
    queryControlSingleWithProgressRetry(node, tableIdSql, [], {
      lane: CONTROL_QUERY_LANE_SNAPSHOT,
      timeoutMs: options.queryTimeoutMs,
    }),
  ]);

  let partitionRows = rowsFromResult(partitionResult);
  const tableRows = rowsFromResult(tableResult);
  const tableId = firstTableId(tableRows);
  if (partitionRows.length === ZERO) {
    if (tableId) {
      const partitionByIdSql =
        SQL_SELECT_PARTITIONS_BY_TABLE_ID_PREFIX +
        escapeSql(tableId) +
        SQL_SELECT_PARTITIONS_BY_TABLE_ID_SUFFIX;
      const partitionByIdResult = await queryControlSingleWithProgressRetry(
        node,
        partitionByIdSql,
        [],
        {
          lane: CONTROL_QUERY_LANE_SNAPSHOT,
          timeoutMs: options.queryTimeoutMs,
        },
      );
      partitionRows = rowsFromResult(partitionByIdResult);
    }
  }
  const servicesSql = buildActivePartitionServicesSql({
    partitionRows,
    tableId,
    tableName,
  });
  const servicesResult = await queryControlSingleWithProgressRetry(
    node,
    servicesSql,
    [],
    {
      lane: CONTROL_QUERY_LANE_SNAPSHOT,
      timeoutMs: options.queryTimeoutMs,
    },
  );
  const serviceRows = rowsFromResult(servicesResult);

  return {
    tableId,
    partitionRows,
    serviceRows,
  };
}

function shouldRepairTableDistributionSnapshot(snapshot) {
  const partitionRows = Array.isArray(snapshot?.partitionRows)
    ? snapshot.partitionRows
    : [];
  const serviceRows = Array.isArray(snapshot?.serviceRows)
    ? snapshot.serviceRows
    : [];
  const tableId = typeof snapshot?.tableId === "string" ? snapshot.tableId : "";
  if (partitionRows.length === ZERO) {
    return tableId.length > ZERO;
  }
  if (serviceRows.length === ZERO) {
    return true;
  }
  return (
    summarizeTableDistributionTopology(partitionRows, serviceRows)
      .topologyState === TOPOLOGY_STATE_INVALID
  );
}

function buildActivePartitionServicesSql(options = {}) {
  const partitionRows = Array.isArray(options.partitionRows)
    ? options.partitionRows
    : [];
  const partitionIds = partitionRows
    .map((row) => String(row?.partition_id || ""))
    .filter((partitionId) => partitionId.length > ZERO);
  if (partitionIds.length > ZERO) {
    return (
      SQL_SELECT_ACTIVE_PARTITION_SERVICES_PREFIX +
      " AND partition_id IN (" +
      partitionIds
        .map((partitionId) => "'" + escapeSql(partitionId) + "'")
        .join(", ") +
      ")"
    );
  }
  return SQL_SELECT_ACTIVE_PARTITION_SERVICES_PREFIX + " AND 1 = 0";
}

async function forceRepairControlSnapshot(node) {
  const candidateLanes = [
    CONTROL_QUERY_LANE_SNAPSHOT,
    CONTROL_QUERY_LANE_CONTROL,
  ];
  for (const lane of candidateLanes) {
    try {
      const localSnapshot = await queryControlSingle(
        node,
        SQL_CONTROL_SNAPSHOT,
        [],
        {
          lane,
        },
      );
      if (!shouldFallbackToForcedControlSnapshot(localSnapshot)) {
        return false;
      }
    } catch (_localSnapshotError) {
      // Fall through to the forced query on this lane.
    }
    try {
      await queryControlSingle(node, SQL_CONTROL_SNAPSHOT_FORCE_REPAIR, [], {
        lane,
      });
      return true;
    } catch (_forcedSnapshotError) {
      continue;
    }
  }
  return false;
}

function finalizeTableDistributionSnapshot(snapshot, tableName) {
  const partitionRows = Array.isArray(snapshot?.partitionRows)
    ? snapshot.partitionRows
    : [];
  const serviceRows = Array.isArray(snapshot?.serviceRows)
    ? snapshot.serviceRows
    : [];
  const partitionIds = new Set();
  for (const row of partitionRows) {
    const partitionId = row?.partition_id;
    if (typeof partitionId !== "string" || partitionId.length === ZERO) {
      continue;
    }
    partitionIds.add(partitionId);
  }

  const topologySummary = summarizeTableDistributionTopology(
    partitionRows,
    serviceRows,
  );

  return {
    tableName,
    partitionIds,
    partitionCount: partitionIds.size,
    replicaNodeIds: topologySummary.replicaNodeIds,
    replicaNodeCount: topologySummary.replicaNodeIds.size,
    replicasByPartition: topologySummary.replicasByPartition,
    serviceCount: topologySummary.serviceCount,
    topologyState: topologySummary.topologyState,
    topologySignature: topologySummary.topologySignature,
    opaquePartitionCount: topologySummary.opaquePartitionCount,
    invalidPartitionCount: topologySummary.invalidPartitionCount,
    leaderServiceMissingPartitionCount:
      topologySummary.leaderServiceMissingPartitionCount,
    overReplicatedPartitionCount: topologySummary.overReplicatedPartitionCount,
  };
}

function summarizeTableDistributionTopology(partitionRows, serviceRows) {
  if (!Array.isArray(partitionRows) || partitionRows.length === ZERO) {
    return {
      replicaNodeIds: new Set(),
      replicasByPartition: new Map(),
      serviceCount: ZERO,
      topologyState: TOPOLOGY_STATE_OPAQUE,
      topologySignature: "partitions:missing",
      opaquePartitionCount: ZERO,
      invalidPartitionCount: ZERO,
      leaderServiceMissingPartitionCount: ZERO,
      overReplicatedPartitionCount: ZERO,
    };
  }
  const replicaNodeIds = new Set();
  const replicasByPartition = new Map();
  const partitionServiceRows = new Map();
  let serviceCount = ZERO;

  for (const row of Array.isArray(serviceRows) ? serviceRows : []) {
    const partitionId = firstStringField(row, "partition_id", "partitionId");
    const nodeId = firstStringField(row, "node_id", "nodeId");
    if (!partitionId || !nodeId) {
      continue;
    }
    serviceCount += 1;
    replicaNodeIds.add(nodeId);
    if (!replicasByPartition.has(partitionId)) {
      replicasByPartition.set(partitionId, new Set());
    }
    replicasByPartition.get(partitionId).add(nodeId);
    if (!partitionServiceRows.has(partitionId)) {
      partitionServiceRows.set(partitionId, []);
    }
    partitionServiceRows.get(partitionId).push(row);
  }

  let opaquePartitionCount = ZERO;
  let invalidPartitionCount = ZERO;
  let leaderServiceMissingPartitionCount = ZERO;
  let overReplicatedPartitionCount = ZERO;
  const topologySignatureParts = [];

  for (const partitionRow of Array.isArray(partitionRows)
    ? partitionRows
    : []) {
    const partitionId = firstStringField(
      partitionRow,
      "partition_id",
      "partitionId",
    );
    if (!partitionId) {
      continue;
    }
    const rowsForPartition = partitionServiceRows.get(partitionId) || [];
    const topology = evaluatePartitionReplicaTopology({
      partitionRow,
      serviceRows: rowsForPartition,
      requireLeaderNodeId: false,
      requiresAddress: false,
    });
    if (topology.overTargetReplicaCount === true) {
      invalidPartitionCount += 1;
      overReplicatedPartitionCount += 1;
      topologySignatureParts.push(
        partitionId +
          ":" +
          TOPOLOGY_REASON_ABOVE_TARGET_REPLICA_COUNT +
          ":" +
          topology.observedReplicaCount +
          "/" +
          String(topology.desiredReplicaCount || ZERO),
      );
      continue;
    }
    if (topology.lastErrorCode === TOPOLOGY_REASON_LEADER_SERVICE_MISSING) {
      invalidPartitionCount += 1;
      leaderServiceMissingPartitionCount += 1;
      topologySignatureParts.push(
        partitionId +
          ":" +
          TOPOLOGY_REASON_LEADER_SERVICE_MISSING +
          ":" +
          topology.observedReplicaCount +
          "/" +
          String(topology.desiredReplicaCount || ZERO),
      );
      continue;
    }
    if (topology.topologyState === TOPOLOGY_STATE_OPAQUE) {
      opaquePartitionCount += 1;
      topologySignatureParts.push(
        partitionId +
          ":" +
          TOPOLOGY_STATE_OPAQUE +
          ":" +
          topology.observedReplicaCount,
      );
      continue;
    }
    topologySignatureParts.push(
      partitionId +
        ":" +
        TOPOLOGY_STATE_ROUTABLE +
        ":" +
        topology.observedReplicaCount,
    );
  }

  const topologyState =
    invalidPartitionCount > ZERO
      ? TOPOLOGY_STATE_INVALID
      : opaquePartitionCount > ZERO
        ? TOPOLOGY_STATE_OPAQUE
        : TOPOLOGY_STATE_ROUTABLE;

  return {
    replicaNodeIds,
    replicasByPartition,
    serviceCount,
    topologyState,
    topologySignature: topologySignatureParts.sort().join("|"),
    opaquePartitionCount,
    invalidPartitionCount,
    leaderServiceMissingPartitionCount,
    overReplicatedPartitionCount,
  };
}

/**
 * Wait until a table has grown by additional partitions and its replicas are
 * spread across enough distinct nodes.
 * @param {Object} seedNode
 * @param {Object} [options]
 * @param {string} [options.tableName]
 * @param {number} [options.timeoutMs]
 * @param {number} [options.pollIntervalMs]
 * @param {number} [options.minAdditionalPartitions]
 * @param {number} [options.minDistinctReplicaNodes]
 * @return {Promise<Object>}
 */
async function waitForPartitionGrowthAndSpread(seedNode, options = {}) {
  const {
    tableName,
    timeoutMs,
    pollIntervalMs,
    minAdditionalPartitions,
    minDistinctReplicaNodes,
  } = resolvePartitionGrowthAndSpreadScenarioConfig(options);

  const deadline = Date.now() + timeoutMs;
  const loadProgress =
    options.loadProgress &&
    typeof options.loadProgress === "object" &&
    typeof options.loadProgress.getMetrics === "function"
      ? options.loadProgress
      : null;
  const loadProgressNoProgressTimeoutMs =
    Number.isFinite(loadProgress?.noProgressTimeoutMs) &&
    loadProgress.noProgressTimeoutMs > ZERO
      ? Math.floor(loadProgress.noProgressTimeoutMs)
      : ZERO;
  const topologyNoProgressTimeoutMs =
    Number.isFinite(options.topologyNoProgressTimeoutMs) &&
    options.topologyNoProgressTimeoutMs > ZERO
      ? Math.floor(options.topologyNoProgressTimeoutMs)
      : Math.min(TABLE_DISTRIBUTION_TOPOLOGY_STALL_TIMEOUT_MS, timeoutMs);
  let highestSuccessfulLoadOperationCount = -1;
  let lastHealthyLoadAtMs = Date.now();
  let lastInvalidTopologySignature = null;
  let lastInvalidTopologyAtMs = Date.now();
  const maybeAbortForLoadStall = (context = {}) => {
    if (!loadProgress || loadProgressNoProgressTimeoutMs <= ZERO) {
      return;
    }
    const metrics = loadProgress.getMetrics();
    const success = Math.max(ZERO, Number(metrics?.success || ZERO));
    const failed = Math.max(ZERO, Number(metrics?.failed || ZERO));
    const dispatchedOperations = Math.max(
      ZERO,
      Number(metrics?.dispatchedOperations || ZERO),
    );
    if (success > highestSuccessfulLoadOperationCount) {
      highestSuccessfulLoadOperationCount = success;
      lastHealthyLoadAtMs = Date.now();
      return;
    }
    if (dispatchedOperations <= success) {
      lastHealthyLoadAtMs = Date.now();
      return;
    }
    const noProgressMs = Math.max(ZERO, Date.now() - lastHealthyLoadAtMs);
    if (noProgressMs < loadProgressNoProgressTimeoutMs) {
      return;
    }
    const waitReasons =
      metrics?.waitReasons && typeof metrics.waitReasons === "object"
        ? metrics.waitReasons
        : {};
    const topPressureNodes = Object.entries(
      metrics?.perNode && typeof metrics.perNode === "object"
        ? metrics.perNode
        : {},
    )
      .map(([nodeId, nodeMetrics]) => {
        const nodeWaitReasons =
          nodeMetrics?.waitReasons &&
          typeof nodeMetrics.waitReasons === "object"
            ? nodeMetrics.waitReasons
            : {};
        const nodeSlotUnavailable = Math.max(
          ZERO,
          Number(nodeWaitReasons.nodeSlotUnavailable || ZERO),
        );
        const timeoutWaits = Math.max(
          ZERO,
          Number(nodeWaitReasons.timeoutWaits || ZERO),
        );
        const retryableControlPlanePressure = Math.max(
          ZERO,
          Number(nodeWaitReasons.retryableControlPlanePressure || ZERO),
        );
        return {
          nodeId,
          nodeSlotUnavailable,
          timeoutWaits,
          retryableControlPlanePressure,
          pressureScore:
            nodeSlotUnavailable + timeoutWaits + retryableControlPlanePressure,
        };
      })
      .filter((entry) => entry.pressureScore > ZERO)
      .sort(
        (left, right) =>
          right.pressureScore - left.pressureScore ||
          right.timeoutWaits - left.timeoutWaits ||
          String(left.nodeId).localeCompare(String(right.nodeId)),
      )
      .slice(ZERO, 3)
      .map(
        (entry) =>
          String(entry.nodeId) +
          "(nodeSlotUnavailable=" +
          entry.nodeSlotUnavailable +
          ", timeoutWaits=" +
          entry.timeoutWaits +
          ", retryableControlPlanePressure=" +
          entry.retryableControlPlanePressure +
          ")",
      );
    throw new Error(
      "Load phase stalled with no successful progress while waiting for " +
        "partition growth. phase=" +
        String(context.phase || "growth") +
        ", success=" +
        success +
        ", failed=" +
        failed +
        ", dispatchedOperations=" +
        dispatchedOperations +
        ", nodeSlotUnavailable=" +
        Math.max(ZERO, Number(waitReasons.nodeSlotUnavailable || ZERO)) +
        ", timeoutWaits=" +
        Math.max(ZERO, Number(waitReasons.timeoutWaits || ZERO)) +
        ", retryableControlPlanePressure=" +
        Math.max(
          ZERO,
          Number(waitReasons.retryableControlPlanePressure || ZERO),
        ) +
        ", rejectedOperations=" +
        Math.max(ZERO, Number(metrics?.rejectedOperations || ZERO)) +
        ", opsPerSec=" +
        Math.max(ZERO, Number(metrics?.opsPerSec || ZERO)).toFixed(2) +
        ", noProgressMs=" +
        noProgressMs +
        ", partitionSamples=" +
        Number(context.sampleCount || ZERO) +
        ", additionalPartitions=" +
        Number(context.additionalPartitionCount || ZERO) +
        ", replicaNodeCount=" +
        Number(
          context.latest?.replicaNodeCount ||
            context.baseline?.replicaNodeCount ||
            ZERO,
        ) +
        ", lastQueryError=" +
        String(context.lastQueryError || "none") +
        ", topPressureNodes=" +
        (topPressureNodes.length > ZERO ? topPressureNodes.join("; ") : "none"),
    );
  };
  const maybeAbortForTopologyStall = (context = {}) => {
    const latestDistribution =
      context.latest && typeof context.latest === "object"
        ? context.latest
        : null;
    if (
      !latestDistribution ||
      latestDistribution.topologyState !== TOPOLOGY_STATE_INVALID
    ) {
      lastInvalidTopologySignature = null;
      lastInvalidTopologyAtMs = Date.now();
      return;
    }
    const signature = String(latestDistribution.topologySignature || "");
    if (signature !== lastInvalidTopologySignature) {
      lastInvalidTopologySignature = signature;
      lastInvalidTopologyAtMs = Date.now();
      return;
    }
    const noProgressMs = Math.max(ZERO, Date.now() - lastInvalidTopologyAtMs);
    if (noProgressMs < topologyNoProgressTimeoutMs) {
      return;
    }
    const failureMode = resolvePartitionGrowthFailureMode({
      additionalPartitionCount: context.additionalPartitionCount,
      minAdditionalPartitions,
      replicaNodeCount: latestDistribution.replicaNodeCount,
      minDistinctReplicaNodes,
      topologyState: latestDistribution.topologyState,
      leaderServiceMissingPartitionCount:
        latestDistribution.leaderServiceMissingPartitionCount,
      overReplicatedPartitionCount:
        latestDistribution.overReplicatedPartitionCount,
      plannerDiagnostics: resolvePartitioningPlannerDiagnosticsSnapshot(
        options.plannerDiagnosticsResolver,
      ),
    });
    const error = new Error(
      "Table distribution topology stalled in an invalid state while waiting " +
        'for "' +
        tableName +
        '". failureMode=' +
        failureMode +
        ", topologyState=" +
        String(latestDistribution.topologyState || "unknown") +
        ", invalidPartitionCount=" +
        Number(latestDistribution.invalidPartitionCount || ZERO) +
        ", leaderServiceMissingPartitionCount=" +
        Number(latestDistribution.leaderServiceMissingPartitionCount || ZERO) +
        ", overReplicatedPartitionCount=" +
        Number(latestDistribution.overReplicatedPartitionCount || ZERO) +
        ", serviceCount=" +
        Number(latestDistribution.serviceCount || ZERO) +
        ", replicaNodeCount=" +
        Number(latestDistribution.replicaNodeCount || ZERO) +
        ", noProgressMs=" +
        noProgressMs +
        ", sampleCount=" +
        Number(context.sampleCount || ZERO) +
        ", lastQueryError=" +
        String(context.lastQueryError || "none"),
    );
    error.diagnostics = {
      partitionGrowth: {
        tableName,
        failureMode,
        baselinePartitionCount: Number(
          context.baseline?.partitionCount || ZERO,
        ),
        currentPartitionCount: Number(
          latestDistribution.partitionCount || ZERO,
        ),
        additionalPartitionCount: Number(
          context.additionalPartitionCount || ZERO,
        ),
        replicaNodeCount: Number(latestDistribution.replicaNodeCount || ZERO),
        serviceCount: Number(latestDistribution.serviceCount || ZERO),
        topologyState: String(latestDistribution.topologyState || "unknown"),
        invalidPartitionCount: Number(
          latestDistribution.invalidPartitionCount || ZERO,
        ),
        leaderServiceMissingPartitionCount: Number(
          latestDistribution.leaderServiceMissingPartitionCount || ZERO,
        ),
        overReplicatedPartitionCount: Number(
          latestDistribution.overReplicatedPartitionCount || ZERO,
        ),
        sampleCount: Number(context.sampleCount || ZERO),
        transientQueryErrors: Number(context.transientQueryErrors || ZERO),
        lastQueryError: String(context.lastQueryError || "none"),
      },
    };
    throw error;
  };
  let baseline = null;
  let transientQueryErrors = 0;
  let lastQueryError = null;
  while (!baseline && Date.now() <= deadline) {
    try {
      baseline = await queryTableDistribution(seedNode, {
        tableName,
        queryNodes: options.queryNodes,
        fallbackNodes: options.fallbackNodes,
      });
      lastQueryError = null;
    } catch (error) {
      transientQueryErrors += 1;
      lastQueryError = String(error?.message || error);
      if (typeof options.assertContinue === "function") {
        await options.assertContinue({
          phase: "baseline",
          tableName,
          deadlineMs: deadline,
          baseline,
          latest: baseline,
          sampleCount: ZERO,
          additionalPartitionCount: ZERO,
          transientQueryErrors,
          lastQueryError,
          minAdditionalPartitions,
          minDistinctReplicaNodes,
        });
      }
      maybeAbortForLoadStall({
        phase: "baseline",
        tableName,
        deadlineMs: deadline,
        baseline,
        latest: baseline,
        sampleCount: ZERO,
        additionalPartitionCount: ZERO,
        transientQueryErrors,
        lastQueryError,
      });
      maybeAbortForTopologyStall({
        phase: "baseline",
        baseline,
        latest: baseline,
        sampleCount: ZERO,
        additionalPartitionCount: ZERO,
        transientQueryErrors,
        lastQueryError,
      });
      if (Date.now() >= deadline) {
        break;
      }
      await sleep(pollIntervalMs);
    }
  }

  assert.ok(
    baseline,
    'Timed out waiting for baseline table distribution for "' +
      tableName +
      '"' +
      ", transientQueryErrors=" +
      transientQueryErrors +
      ", lastQueryError=" +
      String(lastQueryError || "none"),
  );
  assert.ok(
    baseline.partitionCount > ZERO,
    'No partitions found for table "' + tableName + '"',
  );

  const baselinePartitionIds = new Set(baseline.partitionIds);
  const additionalPartitionIds = new Set();
  let latest = baseline;
  let sampleCount = 1;

  while (Date.now() <= deadline) {
    try {
      latest = await queryTableDistribution(seedNode, {
        tableName,
        queryNodes: options.queryNodes,
        fallbackNodes: options.fallbackNodes,
      });
      sampleCount += 1;
      lastQueryError = null;
    } catch (error) {
      transientQueryErrors += 1;
      lastQueryError = String(error?.message || error);
      if (typeof options.assertContinue === "function") {
        await options.assertContinue({
          phase: "growth",
          tableName,
          deadlineMs: deadline,
          baseline,
          latest,
          sampleCount,
          additionalPartitionCount: additionalPartitionIds.size,
          transientQueryErrors,
          lastQueryError,
          minAdditionalPartitions,
          minDistinctReplicaNodes,
        });
      }
      maybeAbortForLoadStall({
        phase: "growth",
        tableName,
        deadlineMs: deadline,
        baseline,
        latest,
        sampleCount,
        additionalPartitionCount: additionalPartitionIds.size,
        transientQueryErrors,
        lastQueryError,
      });
      maybeAbortForTopologyStall({
        phase: "growth",
        baseline,
        latest,
        sampleCount,
        additionalPartitionCount: additionalPartitionIds.size,
        transientQueryErrors,
        lastQueryError,
      });
      if (Date.now() >= deadline) {
        break;
      }
      await sleep(pollIntervalMs);
      continue;
    }

    for (const partitionId of latest.partitionIds) {
      if (baselinePartitionIds.has(partitionId)) {
        continue;
      }
      additionalPartitionIds.add(partitionId);
    }

    if (typeof options.assertContinue === "function") {
      await options.assertContinue({
        phase: "growth",
        tableName,
        deadlineMs: deadline,
        baseline,
        latest,
        sampleCount,
        additionalPartitionCount: additionalPartitionIds.size,
        transientQueryErrors,
        lastQueryError,
        minAdditionalPartitions,
        minDistinctReplicaNodes,
      });
    }
    maybeAbortForLoadStall({
      phase: "growth",
      tableName,
      deadlineMs: deadline,
      baseline,
      latest,
      sampleCount,
      additionalPartitionCount: additionalPartitionIds.size,
      transientQueryErrors,
      lastQueryError,
    });
    maybeAbortForTopologyStall({
      phase: "growth",
      baseline,
      latest,
      sampleCount,
      additionalPartitionCount: additionalPartitionIds.size,
      transientQueryErrors,
      lastQueryError,
    });

    const growthSatisfied =
      additionalPartitionIds.size >= minAdditionalPartitions;
    const spreadSatisfied = latest.replicaNodeCount >= minDistinctReplicaNodes;
    const topologySatisfied = latest.topologyState !== TOPOLOGY_STATE_INVALID;
    if (growthSatisfied && spreadSatisfied && topologySatisfied) {
      return {
        tableName,
        sampleCount,
        baselinePartitionCount: baseline.partitionCount,
        currentPartitionCount: latest.partitionCount,
        additionalPartitionCount: additionalPartitionIds.size,
        additionalPartitionIds: Array.from(additionalPartitionIds).sort(),
        replicaNodeCount: latest.replicaNodeCount,
        replicaNodeIds: Array.from(latest.replicaNodeIds).sort(),
        serviceCount: latest.serviceCount,
        topologyState: latest.topologyState,
      };
    }

    if (Date.now() >= deadline) {
      break;
    }
    await sleep(pollIntervalMs);
  }

  const plannerDiagnostics = resolvePartitioningPlannerDiagnosticsSnapshot(
    options.plannerDiagnosticsResolver,
  );
  const failureMode = resolvePartitionGrowthFailureMode({
    additionalPartitionCount: additionalPartitionIds.size,
    minAdditionalPartitions,
    replicaNodeCount: latest.replicaNodeCount,
    minDistinctReplicaNodes,
    topologyState: latest.topologyState,
    leaderServiceMissingPartitionCount:
      latest.leaderServiceMissingPartitionCount,
    overReplicatedPartitionCount: latest.overReplicatedPartitionCount,
    plannerDiagnostics,
  });
  const error = new Error(
    'Timed out waiting for table "' +
      tableName +
      '" to add at least ' +
      minAdditionalPartitions +
      " partitions and spread replicas to at least " +
      minDistinctReplicaNodes +
      " nodes. Baseline=" +
      baseline.partitionCount +
      ", latest=" +
      latest.partitionCount +
      ", additionalSeen=" +
      additionalPartitionIds.size +
      ", spread=" +
      latest.replicaNodeCount +
      ", samples=" +
      sampleCount +
      ", serviceCount=" +
      Number(latest.serviceCount || ZERO) +
      ", transientQueryErrors=" +
      transientQueryErrors +
      ", lastQueryError=" +
      String(lastQueryError || "none") +
      ", failureMode=" +
      failureMode +
      ", topologyState=" +
      String(latest.topologyState || "unknown") +
      ", leaderServiceMissingPartitionCount=" +
      Number(latest.leaderServiceMissingPartitionCount || ZERO) +
      ", overReplicatedPartitionCount=" +
      Number(latest.overReplicatedPartitionCount || ZERO) +
      (plannerDiagnostics
        ? ", selectedNodeIds=" +
          formatPlannerNodeIds(plannerDiagnostics.selectedNodeIds) +
          ", readyReplicaNodeIds=" +
          formatPlannerNodeIds(plannerDiagnostics.readyReplicaNodeIds) +
          ", admissionReadyNodeIds=" +
          formatPlannerNodeIds(plannerDiagnostics.admissionReadyNodeIds) +
          ", readinessReasonHistogram=" +
          formatPlannerHistogram(plannerDiagnostics.readinessReasonHistogram) +
          ", convergenceStateHistogram=" +
          formatPlannerHistogram(plannerDiagnostics.convergenceStateHistogram)
        : ""),
  );
  error.diagnostics = {
    partitionGrowth: {
      tableName,
      failureMode,
      baselinePartitionCount: baseline.partitionCount,
      currentPartitionCount: latest.partitionCount,
      additionalPartitionCount: additionalPartitionIds.size,
      replicaNodeCount: latest.replicaNodeCount,
      serviceCount: Number(latest.serviceCount || ZERO),
      topologyState: String(latest.topologyState || "unknown"),
      leaderServiceMissingPartitionCount: Number(
        latest.leaderServiceMissingPartitionCount || ZERO,
      ),
      overReplicatedPartitionCount: Number(
        latest.overReplicatedPartitionCount || ZERO,
      ),
      sampleCount,
      transientQueryErrors,
      lastQueryError: String(lastQueryError || "none"),
    },
    ...(plannerDiagnostics ? { partitioningPlanner: plannerDiagnostics } : {}),
  };
  throw error;
}

async function waitForPostSplitConsistencyConvergence(cluster, options = {}) {
  assert.ok(
    cluster && typeof cluster.waitForConsistencyConvergence === "function",
    "Cluster must expose waitForConsistencyConvergence()",
  );

  const timeoutMs = Number.isFinite(options.timeoutMs)
    ? options.timeoutMs
    : TIMEOUTS.CONSISTENCY_CONVERGENCE_POST_SPLIT;
  const maxPartitionSkew = Number.isFinite(options.maxPartitionSkew)
    ? Math.max(ZERO, Math.floor(options.maxPartitionSkew))
    : 2;

  return cluster.waitForConsistencyConvergence({
    ...options,
    timeoutMs,
    toleratePartitionSkew: options.toleratePartitionSkew !== false,
    maxPartitionSkew,
  });
}

export const TABLE_DISTRIBUTION_HELPERS_SEGMENT_4 = {
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
  queryTableDistribution,
  isBetterTableDistributionCandidate,
  queryTableDistributionFromNode,
  readTableDistributionSnapshot,
  shouldRepairTableDistributionSnapshot,
  buildActivePartitionServicesSql,
  forceRepairControlSnapshot,
  finalizeTableDistributionSnapshot,
  summarizeTableDistributionTopology,
  waitForPartitionGrowthAndSpread,
  waitForPostSplitConsistencyConvergence,
};
