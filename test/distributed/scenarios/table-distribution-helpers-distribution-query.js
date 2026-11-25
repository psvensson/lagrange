import assert from 'node:assert/strict';
import {
  resolvePartitionGrowthAndSpreadScenarioConfig,
  resolveTableDistributionQueryConfig,
} from '../harness/scenario-config.js';
import {TIMEOUTS} from '../harness/constants.js';
import {evaluatePartitionReplicaTopology} from '../../../src/admin/admin-shared-metadata-consistency.js';
import {TABLE_DISTRIBUTION_TABLE_BOOTSTRAP_HELPERS} from './table-distribution-helpers-table-bootstrap.js';
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
} = TABLE_DISTRIBUTION_TABLE_BOOTSTRAP_HELPERS;

/**
 * Query the current partition + replica distribution for a single table.
 * @param {Object} seedNode
 * @param {Object} [options]
 * @param {string} [options.tableName]
 * @return {Promise<Object>}
 */
function assertSeedNodeQueryable(seedNode) {
  assert.ok(
    seedNode &&
      (typeof seedNode.query === 'function' ||
        typeof seedNode.queryWithTimeout === 'function'),
    'queryTableDistribution requires a seed node with query capability',
  );
}

function isDeferredTableDistributionError(error) {
  return (
    isRetryableControlPlaneProgressError(error) ||
    isTimeoutShapedError(error)
  );
}

/**
 * Query the current partition + replica distribution for a single table.
 * @param {Object} seedNode
 * @param {Object} [options]
 * @param {string} [options.tableName]
 * @return {Promise<Object>}
 */
async function queryTableDistribution(seedNode, options = {}) {
  assertSeedNodeQueryable(seedNode);

  const {tableName} = resolveTableDistributionQueryConfig(options);
  const queryNodes = resolveControlQueryNodes(seedNode, options);
  const totalTimeoutMs = resolveControlQueryTimeoutMs(
    options.queryTimeoutMs || options.timeoutMs,
  );
  const deadlineAtMs = resolveTableBootstrapDeadlineAtMs(
    options,
    totalTimeoutMs,
  );
  let lastError = null;
  let bestDistribution = null;
  let deferredDistribution = null;
  for (const queryNode of queryNodes) {
    if (Date.now() >= deadlineAtMs) {
      break;
    }
    try {
      const distribution = await queryTableDistributionFromNode(
        queryNode,
        tableName,
        {
          ...options,
          deadlineAtMs,
          queryTimeoutMs: resolveBoundedTableBootstrapCandidateTimeoutMs(
            deadlineAtMs,
            totalTimeoutMs,
            queryNodes.length,
          ),
        },
      );
      if (isBetterTableDistributionCandidate(distribution, bestDistribution)) {
        bestDistribution = distribution;
      }
    } catch (error) {
      lastError = error;
      if (isDeferredTableDistributionError(error)) {
        deferredDistribution = buildDeferredTableDistributionSnapshot(
          tableName,
          error,
        );
      }
    }
  }
  if (bestDistribution || deferredDistribution) {
    return bestDistribution || deferredDistribution;
  }
  throw lastError || new Error('no_table_distribution_query_nodes_available');
}

function isBetterTableDistributionCandidate(candidate, currentBest) {
  if (!candidate || typeof candidate !== 'object') {
    return false;
  }
  if (!currentBest || typeof currentBest !== 'object') {
    return true;
  }

  const rankTopologyState = (topologyState) => {
    switch (String(topologyState || '')) {
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
    await forceRepairControlSnapshot(node, options);
    distribution = await readTableDistributionSnapshot(
      node,
      tableName,
      options,
    );
  }

  return finalizeTableDistributionSnapshot(distribution, tableName);
}

function resolveTableDistributionReadTimeoutMs(options = {}) {
  const configuredTimeoutMs = resolveControlQueryTimeoutMs(
    options.queryTimeoutMs,
  );
  if (!Number.isFinite(options.deadlineAtMs)) {
    return configuredTimeoutMs;
  }
  return Math.max(
    ONE,
    Math.min(
      configuredTimeoutMs,
      resolveRemainingControlQueryTimeoutMs(options.deadlineAtMs),
    ),
  );
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

  const resolveReadTimeoutMs = () =>
    resolveTableDistributionReadTimeoutMs(options);
  const initialReadTimeoutMs = resolveReadTimeoutMs();
  const [partitionResult, tableResult] = await Promise.all([
    queryControlSingleWithProgressRetry(node, partitionSql, [], {
      lane: CONTROL_QUERY_LANE_SNAPSHOT,
      timeoutMs: initialReadTimeoutMs,
    }),
    queryControlSingleWithProgressRetry(node, tableIdSql, [], {
      lane: CONTROL_QUERY_LANE_SNAPSHOT,
      timeoutMs: initialReadTimeoutMs,
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
          timeoutMs: resolveReadTimeoutMs(),
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
      timeoutMs: resolveReadTimeoutMs(),
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
  const partitionRows = Array.isArray(snapshot?.partitionRows) ?
    snapshot.partitionRows :
    [];
  const serviceRows = Array.isArray(snapshot?.serviceRows) ?
    snapshot.serviceRows :
    [];
  const tableId = typeof snapshot?.tableId === 'string' ? snapshot.tableId : '';
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
  const partitionRows = Array.isArray(options.partitionRows) ?
    options.partitionRows :
    [];
  const partitionIds = partitionRows
    .map((row) => String(row?.partition_id || ''))
    .filter((partitionId) => partitionId.length > ZERO);
  if (partitionIds.length > ZERO) {
    return (
      SQL_SELECT_ACTIVE_PARTITION_SERVICES_PREFIX +
      ' AND partition_id IN (' +
      partitionIds
        .map((partitionId) => '\'' + escapeSql(partitionId) + '\'')
        .join(', ') +
      ')'
    );
  }
  return SQL_SELECT_ACTIVE_PARTITION_SERVICES_PREFIX + ' AND 1 = 0';
}

async function forceRepairControlSnapshot(node, options = {}) {
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
          timeoutMs: resolveTableDistributionReadTimeoutMs(options),
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
        timeoutMs: resolveTableDistributionReadTimeoutMs(options),
      });
      return true;
    } catch (_forcedSnapshotError) {
      continue;
    }
  }
  return false;
}

function finalizeTableDistributionSnapshot(snapshot, tableName) {
  const partitionRows = Array.isArray(snapshot?.partitionRows) ?
    snapshot.partitionRows :
    [];
  const serviceRows = Array.isArray(snapshot?.serviceRows) ?
    snapshot.serviceRows :
    [];
  const partitionIds = new Set();
  for (const row of partitionRows) {
    const partitionId = row?.partition_id;
    if (typeof partitionId !== 'string' || partitionId.length === ZERO) {
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

function indexPartitionServiceRows(serviceRows) {
  const replicaNodeIds = new Set();
  const replicasByPartition = new Map();
  const partitionServiceRows = new Map();
  let serviceCount = ZERO;

  for (const row of Array.isArray(serviceRows) ? serviceRows : []) {
    const partitionId = firstStringField(row, 'partition_id', 'partitionId');
    const nodeId = firstStringField(row, 'node_id', 'nodeId');
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
  return {
    replicaNodeIds,
    replicasByPartition,
    partitionServiceRows,
    serviceCount,
  };
}

function classifySinglePartitionReplicaTopology(partitionId, topology, stats) {
  const desiredCountText = String(topology.desiredReplicaCount || ZERO);
  if (topology.overTargetReplicaCount === true) {
    stats.invalidPartitionCount += 1;
    stats.overReplicatedPartitionCount += 1;
    stats.topologySignatureParts.push(
      partitionId +
        ':' +
        TOPOLOGY_REASON_ABOVE_TARGET_REPLICA_COUNT +
        ':' +
        topology.observedReplicaCount +
        '/' +
        desiredCountText,
    );
    return;
  }
  if (topology.lastErrorCode === TOPOLOGY_REASON_LEADER_SERVICE_MISSING) {
    stats.invalidPartitionCount += 1;
    stats.leaderServiceMissingPartitionCount += 1;
    stats.topologySignatureParts.push(
      partitionId +
        ':' +
        TOPOLOGY_REASON_LEADER_SERVICE_MISSING +
        ':' +
        topology.observedReplicaCount +
        '/' +
        desiredCountText,
    );
    return;
  }
  if (topology.topologyState === TOPOLOGY_STATE_OPAQUE) {
    stats.opaquePartitionCount += 1;
    stats.topologySignatureParts.push(
      partitionId +
        ':' +
        TOPOLOGY_STATE_OPAQUE +
        ':' +
        topology.observedReplicaCount,
    );
    return;
  }
  stats.topologySignatureParts.push(
    partitionId +
      ':' +
      TOPOLOGY_STATE_ROUTABLE +
      ':' +
      topology.observedReplicaCount,
  );
}

function resolveAggregateTopologyState(
  invalidPartitionCount,
  opaquePartitionCount,
) {
  if (invalidPartitionCount > ZERO) {
    return TOPOLOGY_STATE_INVALID;
  }
  return opaquePartitionCount > ZERO ?
    TOPOLOGY_STATE_OPAQUE :
    TOPOLOGY_STATE_ROUTABLE;
}

function summarizeTableDistributionTopology(partitionRows, serviceRows) {
  if (!Array.isArray(partitionRows) || partitionRows.length === ZERO) {
    return {
      replicaNodeIds: new Set(),
      replicasByPartition: new Map(),
      serviceCount: ZERO,
      topologyState: TOPOLOGY_STATE_OPAQUE,
      topologySignature: 'partitions:missing',
      opaquePartitionCount: ZERO,
      invalidPartitionCount: ZERO,
      leaderServiceMissingPartitionCount: ZERO,
      overReplicatedPartitionCount: ZERO,
    };
  }
  const {
    replicaNodeIds,
    replicasByPartition,
    partitionServiceRows,
    serviceCount,
  } = indexPartitionServiceRows(serviceRows);

  const stats = {
    opaquePartitionCount: ZERO,
    invalidPartitionCount: ZERO,
    leaderServiceMissingPartitionCount: ZERO,
    overReplicatedPartitionCount: ZERO,
    topologySignatureParts: [],
  };

  for (const partitionRow of partitionRows) {
    const partitionId = firstStringField(
      partitionRow,
      'partition_id',
      'partitionId',
    );
    if (!partitionId) {
      continue;
    }
    const topology = evaluatePartitionReplicaTopology({
      partitionRow,
      serviceRows: partitionServiceRows.get(partitionId) || [],
      requireLeaderNodeId: false,
      requiresAddress: false,
    });
    classifySinglePartitionReplicaTopology(partitionId, topology, stats);
  }

  return {
    replicaNodeIds,
    replicasByPartition,
    serviceCount,
    topologyState: resolveAggregateTopologyState(
      stats.invalidPartitionCount,
      stats.opaquePartitionCount,
    ),
    topologySignature: stats.topologySignatureParts.sort().join('|'),
    opaquePartitionCount: stats.opaquePartitionCount,
    invalidPartitionCount: stats.invalidPartitionCount,
    leaderServiceMissingPartitionCount:
      stats.leaderServiceMissingPartitionCount,
    overReplicatedPartitionCount: stats.overReplicatedPartitionCount,
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
function nonNegativeMetricValue(value) {
  return Math.max(ZERO, Number(value || ZERO));
}

function buildTopLoadPressureNodesSummary(perNodeInput) {
  const perNode =
    perNodeInput && typeof perNodeInput === 'object' ? perNodeInput : {};
  return Object.entries(perNode)
    .map(([nodeId, nodeMetrics]) => {
      const nodeWaitReasons =
        nodeMetrics?.waitReasons && typeof nodeMetrics.waitReasons === 'object' ?
          nodeMetrics.waitReasons :
          {};
      const nodeSlotUnavailable = nonNegativeMetricValue(
        nodeWaitReasons.nodeSlotUnavailable,
      );
      const timeoutWaits = nonNegativeMetricValue(nodeWaitReasons.timeoutWaits);
      const retryableControlPlanePressure = nonNegativeMetricValue(
        nodeWaitReasons.retryableControlPlanePressure,
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
        '(nodeSlotUnavailable=' +
        entry.nodeSlotUnavailable +
        ', timeoutWaits=' +
        entry.timeoutWaits +
        ', retryableControlPlanePressure=' +
        entry.retryableControlPlanePressure +
        ')',
    );
}

function resolveStallReplicaNodeCount(context) {
  return nonNegativeMetricValue(
    context.latest?.replicaNodeCount || context.baseline?.replicaNodeCount,
  );
}

function buildLoadStallErrorMessage(metrics, noProgressMs, context) {
  const source = metrics && typeof metrics === 'object' ? metrics : {};
  const waitReasons =
    source.waitReasons && typeof source.waitReasons === 'object' ?
      source.waitReasons :
      {};
  const topPressureNodes = buildTopLoadPressureNodesSummary(source.perNode);
  const topNodesSummary =
    topPressureNodes.length > ZERO ? topPressureNodes.join('; ') : 'none';
  return (
    'Load phase stalled with no successful progress while waiting for ' +
    'partition growth. phase=' +
    String(context.phase || 'growth') +
    ', success=' +
    nonNegativeMetricValue(source.success) +
    ', failed=' +
    nonNegativeMetricValue(source.failed) +
    ', dispatchedOperations=' +
    nonNegativeMetricValue(source.dispatchedOperations) +
    ', nodeSlotUnavailable=' +
    nonNegativeMetricValue(waitReasons.nodeSlotUnavailable) +
    ', timeoutWaits=' +
    nonNegativeMetricValue(waitReasons.timeoutWaits) +
    ', retryableControlPlanePressure=' +
    nonNegativeMetricValue(waitReasons.retryableControlPlanePressure) +
    ', rejectedOperations=' +
    nonNegativeMetricValue(source.rejectedOperations) +
    ', opsPerSec=' +
    nonNegativeMetricValue(source.opsPerSec).toFixed(2) +
    ', noProgressMs=' +
    noProgressMs +
    ', partitionSamples=' +
    nonNegativeMetricValue(context.sampleCount) +
    ', additionalPartitions=' +
    nonNegativeMetricValue(context.additionalPartitionCount) +
    ', replicaNodeCount=' +
    resolveStallReplicaNodeCount(context) +
    ', lastQueryError=' +
    String(context.lastQueryError || 'none') +
    ', topPressureNodes=' +
    topNodesSummary
  );
}

function buildPartitionGrowthDiagnosticPayload({
  tableName,
  failureMode,
  baseline,
  latestDistribution,
  additionalPartitionCount,
  sampleCount,
  transientQueryErrors,
  lastQueryError,
}) {
  return {
    tableName,
    failureMode,
    baselinePartitionCount: nonNegativeMetricValue(baseline?.partitionCount),
    currentPartitionCount: nonNegativeMetricValue(
      latestDistribution?.partitionCount,
    ),
    additionalPartitionCount: nonNegativeMetricValue(additionalPartitionCount),
    replicaNodeCount: nonNegativeMetricValue(
      latestDistribution?.replicaNodeCount,
    ),
    serviceCount: nonNegativeMetricValue(latestDistribution?.serviceCount),
    topologyState: String(latestDistribution?.topologyState || 'unknown'),
    invalidPartitionCount: nonNegativeMetricValue(
      latestDistribution?.invalidPartitionCount,
    ),
    leaderServiceMissingPartitionCount: nonNegativeMetricValue(
      latestDistribution?.leaderServiceMissingPartitionCount,
    ),
    overReplicatedPartitionCount: nonNegativeMetricValue(
      latestDistribution?.overReplicatedPartitionCount,
    ),
    sampleCount: nonNegativeMetricValue(sampleCount),
    transientQueryErrors: nonNegativeMetricValue(transientQueryErrors),
    lastQueryError: String(lastQueryError || 'none'),
  };
}

function buildTopologyStallError({
  tableName,
  failureMode,
  latestDistribution,
  noProgressMs,
  context,
}) {
  const diag = buildPartitionGrowthDiagnosticPayload({
    tableName,
    failureMode,
    baseline: context.baseline,
    latestDistribution,
    additionalPartitionCount: context.additionalPartitionCount,
    sampleCount: context.sampleCount,
    transientQueryErrors: context.transientQueryErrors,
    lastQueryError: context.lastQueryError,
  });
  const error = new Error(
    'Table distribution topology stalled in an invalid state while waiting ' +
      'for "' +
      tableName +
      '". failureMode=' +
      failureMode +
      ', topologyState=' +
      diag.topologyState +
      ', invalidPartitionCount=' +
      diag.invalidPartitionCount +
      ', leaderServiceMissingPartitionCount=' +
      diag.leaderServiceMissingPartitionCount +
      ', overReplicatedPartitionCount=' +
      diag.overReplicatedPartitionCount +
      ', serviceCount=' +
      diag.serviceCount +
      ', replicaNodeCount=' +
      diag.replicaNodeCount +
      ', noProgressMs=' +
      noProgressMs +
      ', sampleCount=' +
      diag.sampleCount +
      ', lastQueryError=' +
      diag.lastQueryError,
  );
  error.diagnostics = {
    partitionGrowth: diag,
  };
  return error;
}

function formatPlannerDiagnosticsSuffix(plannerDiagnostics) {
  if (!plannerDiagnostics) {
    return '';
  }
  return (
    ', selectedNodeIds=' +
    formatPlannerNodeIds(plannerDiagnostics.selectedNodeIds) +
    ', readyReplicaNodeIds=' +
    formatPlannerNodeIds(plannerDiagnostics.readyReplicaNodeIds) +
    ', admissionReadyNodeIds=' +
    formatPlannerNodeIds(plannerDiagnostics.admissionReadyNodeIds) +
    ', readinessReasonHistogram=' +
    formatPlannerHistogram(plannerDiagnostics.readinessReasonHistogram) +
    ', convergenceStateHistogram=' +
    formatPlannerHistogram(plannerDiagnostics.convergenceStateHistogram)
  );
}

function buildPartitionGrowthTimeoutError({
  tableName,
  minAdditionalPartitions,
  minDistinctReplicaNodes,
  baseline,
  latest,
  additionalPartitionCount,
  sampleCount,
  transientQueryErrors,
  lastQueryError,
  plannerDiagnostics,
}) {
  const failureMode = resolvePartitionGrowthFailureMode({
    additionalPartitionCount,
    minAdditionalPartitions,
    replicaNodeCount: latest.replicaNodeCount,
    minDistinctReplicaNodes,
    topologyState: latest.topologyState,
    leaderServiceMissingPartitionCount:
      latest.leaderServiceMissingPartitionCount,
    overReplicatedPartitionCount: latest.overReplicatedPartitionCount,
    plannerDiagnostics,
  });
  const diag = buildPartitionGrowthDiagnosticPayload({
    tableName,
    failureMode,
    baseline,
    latestDistribution: latest,
    additionalPartitionCount,
    sampleCount,
    transientQueryErrors,
    lastQueryError,
  });
  const error = new Error(
    'Timed out waiting for table "' +
      tableName +
      '" to add at least ' +
      minAdditionalPartitions +
      ' partitions and spread replicas to at least ' +
      minDistinctReplicaNodes +
      ' nodes. Baseline=' +
      baseline.partitionCount +
      ', latest=' +
      latest.partitionCount +
      ', additionalSeen=' +
      additionalPartitionCount +
      ', spread=' +
      latest.replicaNodeCount +
      ', samples=' +
      sampleCount +
      ', serviceCount=' +
      diag.serviceCount +
      ', transientQueryErrors=' +
      transientQueryErrors +
      ', lastQueryError=' +
      diag.lastQueryError +
      ', failureMode=' +
      failureMode +
      ', topologyState=' +
      diag.topologyState +
      ', leaderServiceMissingPartitionCount=' +
      diag.leaderServiceMissingPartitionCount +
      ', overReplicatedPartitionCount=' +
      diag.overReplicatedPartitionCount +
      formatPlannerDiagnosticsSuffix(plannerDiagnostics),
  );
  error.diagnostics = {
    partitionGrowth: diag,
    ...(plannerDiagnostics ? {partitioningPlanner: plannerDiagnostics} : {}),
  };
  return error;
}

function resolveGrowthStallMonitorOptions(options, timeoutMs) {
  const loadProgress =
    options.loadProgress &&
    typeof options.loadProgress === 'object' &&
    typeof options.loadProgress.getMetrics === 'function' ?
      options.loadProgress :
      null;
  const loadProgressNoProgressTimeoutMs =
    Number.isFinite(loadProgress?.noProgressTimeoutMs) &&
    loadProgress.noProgressTimeoutMs > ZERO ?
      Math.floor(loadProgress.noProgressTimeoutMs) :
      ZERO;
  const topologyNoProgressTimeoutMs =
    Number.isFinite(options.topologyNoProgressTimeoutMs) &&
    options.topologyNoProgressTimeoutMs > ZERO ?
      Math.floor(options.topologyNoProgressTimeoutMs) :
      Math.min(TABLE_DISTRIBUTION_TOPOLOGY_STALL_TIMEOUT_MS, timeoutMs);
  return {
    loadProgress,
    loadProgressNoProgressTimeoutMs,
    topologyNoProgressTimeoutMs,
  };
}

async function waitForBaselineTableDistribution({
  seedNode,
  tableName,
  options,
  deadline,
  pollIntervalMs,
  runLoopContinueChecks,
}) {
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
      await runLoopContinueChecks({
        phase: 'baseline',
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
      '", transientQueryErrors=' +
      transientQueryErrors +
      ', lastQueryError=' +
      String(lastQueryError || 'none'),
  );
  assert.ok(
    baseline.partitionCount > ZERO,
    'No partitions found for table "' + tableName + '"',
  );
  return {baseline, transientQueryErrors, lastQueryError};
}

function recordAdditionalPartitions(
  latestPartitionIds,
  baselinePartitionIds,
  additionalPartitionIds,
) {
  for (const partitionId of latestPartitionIds) {
    if (!baselinePartitionIds.has(partitionId)) {
      additionalPartitionIds.add(partitionId);
    }
  }
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
  const {
    loadProgress,
    loadProgressNoProgressTimeoutMs,
    topologyNoProgressTimeoutMs,
  } = resolveGrowthStallMonitorOptions(options, timeoutMs);
  let highestSuccessfulLoadOperationCount = -1;
  let lastHealthyLoadAtMs = Date.now();
  let lastInvalidTopologySignature = null;
  let lastInvalidTopologyAtMs = Date.now();

  const maybeAbortForLoadStall = (context = {}) => {
    if (!loadProgress || loadProgressNoProgressTimeoutMs <= ZERO) {
      return;
    }
    const metrics = loadProgress.getMetrics();
    const success = nonNegativeMetricValue(metrics?.success);
    const dispatchedOperations = nonNegativeMetricValue(
      metrics?.dispatchedOperations,
    );
    if (
      success > highestSuccessfulLoadOperationCount ||
      dispatchedOperations <= success
    ) {
      if (success > highestSuccessfulLoadOperationCount) {
        highestSuccessfulLoadOperationCount = success;
      }
      lastHealthyLoadAtMs = Date.now();
      return;
    }
    const noProgressMs = Math.max(ZERO, Date.now() - lastHealthyLoadAtMs);
    if (noProgressMs < loadProgressNoProgressTimeoutMs) {
      return;
    }
    throw new Error(buildLoadStallErrorMessage(metrics, noProgressMs, context));
  };

  const maybeAbortForTopologyStall = (context = {}) => {
    const latestDistribution =
      context.latest && typeof context.latest === 'object' ?
        context.latest :
        null;
    if (latestDistribution?.topologyState !== TOPOLOGY_STATE_INVALID) {
      lastInvalidTopologySignature = null;
      lastInvalidTopologyAtMs = Date.now();
      return;
    }
    const signature = String(latestDistribution.topologySignature || '');
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
    throw buildTopologyStallError({
      tableName,
      failureMode,
      latestDistribution,
      noProgressMs,
      context,
    });
  };

  const runLoopContinueChecks = async (context) => {
    if (typeof options.assertContinue === 'function') {
      await options.assertContinue({
        ...context,
        tableName,
        deadlineMs: deadline,
        minAdditionalPartitions,
        minDistinctReplicaNodes,
      });
    }
    maybeAbortForLoadStall({
      ...context,
      tableName,
      deadlineMs: deadline,
    });
    maybeAbortForTopologyStall(context);
  };

  const initial = await waitForBaselineTableDistribution({
    seedNode,
    tableName,
    options,
    deadline,
    pollIntervalMs,
    runLoopContinueChecks,
  });
  const {baseline} = initial;
  let {transientQueryErrors, lastQueryError} = initial;

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
      recordAdditionalPartitions(
        latest.partitionIds,
        baselinePartitionIds,
        additionalPartitionIds,
      );
    } catch (error) {
      transientQueryErrors += 1;
      lastQueryError = String(error?.message || error);
      await runLoopContinueChecks({
        phase: 'growth',
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

    await runLoopContinueChecks({
      phase: 'growth',
      baseline,
      latest,
      sampleCount,
      additionalPartitionCount: additionalPartitionIds.size,
      transientQueryErrors,
      lastQueryError,
    });

    if (
      additionalPartitionIds.size >= minAdditionalPartitions &&
      latest.replicaNodeCount >= minDistinctReplicaNodes &&
      latest.topologyState !== TOPOLOGY_STATE_INVALID
    ) {
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

  throw buildPartitionGrowthTimeoutError({
    tableName,
    minAdditionalPartitions,
    minDistinctReplicaNodes,
    baseline,
    latest,
    additionalPartitionCount: additionalPartitionIds.size,
    sampleCount,
    transientQueryErrors,
    lastQueryError,
    plannerDiagnostics: resolvePartitioningPlannerDiagnosticsSnapshot(
      options.plannerDiagnosticsResolver,
    ),
  });
}

async function waitForPostSplitConsistencyConvergence(cluster, options = {}) {
  assert.ok(
    cluster && typeof cluster.waitForConsistencyConvergence === 'function',
    'Cluster must expose waitForConsistencyConvergence()',
  );

  const timeoutMs = Number.isFinite(options.timeoutMs) ?
    options.timeoutMs :
    TIMEOUTS.CONSISTENCY_CONVERGENCE_POST_SPLIT;
  const maxPartitionSkew = Number.isFinite(options.maxPartitionSkew) ?
    Math.max(ZERO, Math.floor(options.maxPartitionSkew)) :
    2;

  return cluster.waitForConsistencyConvergence({
    ...options,
    timeoutMs,
    toleratePartitionSkew: options.toleratePartitionSkew !== false,
    maxPartitionSkew,
  });
}

export const TABLE_DISTRIBUTION_QUERY_HELPERS = {
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
