/**
 * Shared helpers for distributed scenarios that validate table partition
 * growth and replica spread.
 */

import assert from 'node:assert/strict';
import {
  resolvePartitionGrowthAndSpreadScenarioConfig,
  resolveTableDistributionQueryConfig,
} from '../harness/scenario-config.js';
import {BENCHMARK_DEFAULTS, TIMEOUTS} from '../harness/constants.js';
import {
  getControlPlaneRetryAfterMs,
  isRetryableControlPlaneError,
} from '../../../src/control-plane/control-plane-error-classification.js';
import {evaluatePartitionReplicaTopology} from
  '../../../src/admin/admin-shared-metadata-consistency.js';

const TABLE_NAME_LOGS = 'logs';
const TABLE_NAME_BENCHMARK_EVENTS = 'benchmark_events';
const SERVICE_TYPE_PARTITION = 'partition';
const STATUS_ACTIVE = 'active';
const ZERO = 0;
const ONE = 1;
const BENCHMARK_WORKLOAD_PROFILE = 'benchmark_events_mixed';
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const TABLE_ID_VISIBILITY_TIMEOUT_MS = 10000;
const TABLE_BOOTSTRAP_TIMEOUT_MS = 30000;
const TABLE_ID_VISIBILITY_POLL_INTERVAL_MS = 100;
const CONTROL_QUERY_TIMEOUT_MS = 30000;
const POLICY_APPLY_TIMEOUT_MS = 60000;
const POLICY_APPLY_ATTEMPT_TIMEOUT_MS = 15000;
const POLICY_VISIBILITY_POLL_INTERVAL_MS = 250;
const POLICY_APPLY_RETRY_DELAY_MS = 250;
const CONTROL_QUERY_LANE_CONTROL = 'control';
const CONTROL_QUERY_LANE_SNAPSHOT = 'snapshot';
const CONTROL_QUERY_PROGRESS_RETRY_DELAY_MS = 100;
const TABLE_POLICY_PRECONDITION_SCENARIO_DEFAULT = 'unknown-scenario';
const DEFAULT_BENCHMARK_READY_NODE_COUNT = 3;
const PARTITIONING_LOAD_HEADROOM_RATIO = 0.5;
const TABLE_DISTRIBUTION_TOPOLOGY_STALL_TIMEOUT_MS = 15000;
const TOPOLOGY_STATE_ROUTABLE = 'routable';
const TOPOLOGY_STATE_OPAQUE = 'opaque';
const TOPOLOGY_STATE_INVALID = 'invalid';
const TOPOLOGY_REASON_LEADER_SERVICE_MISSING = 'leader_service_missing';
const TOPOLOGY_REASON_ABOVE_TARGET_REPLICA_COUNT = 'above_target_replica_count';
const RAFT_ROLE_LEADER = 'leader';
const PARTITIONING_ADAPTIVE_DISPATCH_GUARDRAIL = Object.freeze({
  enabled: true,
  pressureSignalThreshold: 2,
  queueDepthThreshold: 4,
  reductionStepRatio: 0.25,
  minMaxInFlight: 2,
  recoveryQuietTicks: 8,
});

const DEFAULT_TABLE_SPLIT_POLICIES = Object.freeze({
  splitStorageThreshold: 16384,
  splitTrafficThreshold: 120,
  mergeStorageThreshold: 1,
  mergeTrafficThreshold: 1,
});

const SQL_SELECT_TABLE_PARTITIONS_PREFIX =
  'SELECT partition_id, replica_count, leader_node_id FROM partitions WHERE table_name = \'';
const SQL_SELECT_TABLE_PARTITIONS_SUFFIX = '\'';
const SQL_SELECT_TABLE_ID_PREFIX =
  'SELECT table_id FROM tables WHERE table_name = \'';
const SQL_SELECT_TABLE_ID_SUFFIX = '\'';
const SQL_SELECT_TABLE_POLICIES_BY_TABLE_ID_PREFIX =
  'SELECT table_policies FROM tables WHERE table_id = \'';
const SQL_SELECT_TABLE_POLICIES_BY_TABLE_ID_SUFFIX = '\'';
const SQL_SELECT_TABLE_POLICIES_BY_TABLE_NAME_PREFIX =
  'SELECT table_policies FROM tables WHERE table_name = \'';
const SQL_SELECT_TABLE_POLICIES_BY_TABLE_NAME_SUFFIX = '\'';
const SQL_SELECT_PARTITIONS_BY_TABLE_ID_PREFIX =
  'SELECT partition_id, replica_count, leader_node_id FROM partitions WHERE table_id = \'';
const SQL_SELECT_PARTITIONS_BY_TABLE_ID_SUFFIX = '\'';
const SQL_CREATE_TABLE_PREFIX = 'CREATE TABLE IF NOT EXISTS ';
const SQL_CREATE_TABLE_SUFFIX =
  ' (event_id TEXT PRIMARY KEY, payload INTEGER NOT NULL, created_at INTEGER NOT NULL)';
const SQL_UPDATE_TABLE_POLICIES_PREFIX =
  'UPDATE tables SET table_policies = \'';
const SQL_UPDATE_TABLE_POLICIES_MID = '\' WHERE table_id = \'';
const SQL_UPDATE_TABLE_POLICIES_SUFFIX = '\'';
const SQL_CONTROL_SNAPSHOT_FORCE_REPAIR =
  'SELECT * FROM control_snapshot_local(true)';
const SQL_SELECT_ACTIVE_PARTITION_SERVICES_PREFIX =
  'SELECT partition_id, node_id, status, raft_role FROM services ' +
  'WHERE service_type = \'' + SERVICE_TYPE_PARTITION + '\' ' +
  'AND status = \'' + STATUS_ACTIVE + '\'';

const TIMEOUT_ERROR_PATTERN = /timeout|timed out|deadline exceeded|etimedout/i;

/**
 * Sleep helper for polling loops.
 * @param {number} delayMs
 * @return {Promise<void>}
 */
function sleep(delayMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function mapNodeIds(nodes) {
  return (Array.isArray(nodes) ? nodes : [])
    .map((node) => String(node?.id || ''))
    .filter((nodeId) => nodeId.length > ZERO);
}

function buildPartitioningPlannerDiagnostics(options = {}) {
  return {
    selectedNodeCount: mapNodeIds(options.selectedNodes).length,
    selectedNodeIds: mapNodeIds(options.selectedNodes),
    admissionReadyNodeCount: mapNodeIds(options.admissionReadyNodes).length,
    admissionReadyNodeIds: mapNodeIds(options.admissionReadyNodes),
    readyReplicaNodeCount: mapNodeIds(options.readyReplicaNodes).length,
    readyReplicaNodeIds: mapNodeIds(options.readyReplicaNodes),
    replicaBearingNodeCount: Number(options.replicaBearingNodeCount || ZERO),
    replicaBearingNodeIds: Array.isArray(options.replicaBearingNodeIds) ?
      options.replicaBearingNodeIds.map((nodeId) => String(nodeId)).sort() :
      [],
    partitionCount: Number(options.partitionCount || ZERO),
    readinessReasonHistogram:
      options.readinessReasonHistogram &&
      typeof options.readinessReasonHistogram === 'object' ?
        {...options.readinessReasonHistogram} :
        null,
  };
}

function buildPartitioningPlannerTimeoutError(message, diagnostics) {
  const error = new Error(message);
  error.diagnostics = {
    partitioningPlanner: diagnostics,
  };
  return error;
}

function buildPartitioningDispatchPlannerDiagnostics(selected, dispatchNodes) {
  const baseDiagnostics = selected?.diagnostics &&
    typeof selected.diagnostics === 'object' ?
      selected.diagnostics :
      {};
  return buildPartitioningPlannerDiagnostics({
    selectedNodes: dispatchNodes,
    admissionReadyNodes: selected?.admissionReadyNodes,
    readyReplicaNodes: selected?.readyReplicaNodes,
    replicaBearingNodeCount: baseDiagnostics.replicaBearingNodeCount,
    replicaBearingNodeIds: baseDiagnostics.replicaBearingNodeIds,
    partitionCount: baseDiagnostics.partitionCount,
    readinessReasonHistogram: baseDiagnostics.readinessReasonHistogram,
  });
}

function resolvePartitioningPlannerDiagnosticsSnapshot(resolver) {
  if (typeof resolver !== 'function') {
    return null;
  }
  try {
    const diagnostics = resolver();
    return diagnostics && typeof diagnostics === 'object' ?
      diagnostics :
      null;
  } catch (_error) {
    return null;
  }
}

function formatPlannerNodeIds(nodeIds) {
  return Array.isArray(nodeIds) ?
    nodeIds.map((nodeId) => String(nodeId)).join(',') :
    '';
}

function formatPlannerHistogram(histogram) {
  if (!histogram || typeof histogram !== 'object') {
    return 'none';
  }
  const entries = Object.entries(histogram)
    .map(([reason, count]) => [String(reason), Number(count)])
    .filter(([, count]) => Number.isFinite(count) && count > ZERO)
    .sort(([leftReason], [rightReason]) => leftReason.localeCompare(rightReason));
  if (entries.length === ZERO) {
    return 'none';
  }
  return entries
    .map(([reason, count]) => reason + ':' + count)
    .join('|');
}

function resolvePartitionGrowthFailureMode(options = {}) {
  const additionalPartitionCount = Number(options.additionalPartitionCount || ZERO);
  const minAdditionalPartitions = Number(options.minAdditionalPartitions || ZERO);
  const replicaNodeCount = Number(options.replicaNodeCount || ZERO);
  const minDistinctReplicaNodes = Number(options.minDistinctReplicaNodes || ZERO);
  const topologyState = String(options.topologyState || '');
  const leaderServiceMissingPartitionCount = Number(
    options.leaderServiceMissingPartitionCount || ZERO,
  );
  const overReplicatedPartitionCount = Number(
    options.overReplicatedPartitionCount || ZERO,
  );
  const selectedNodeCount = Number(options.plannerDiagnostics?.selectedNodeCount || ZERO);
  const admissionReadyNodeCount = Number(
    options.plannerDiagnostics?.admissionReadyNodeCount || ZERO,
  );
  if (topologyState === TOPOLOGY_STATE_INVALID) {
    if (leaderServiceMissingPartitionCount > ZERO) {
      return TOPOLOGY_REASON_LEADER_SERVICE_MISSING;
    }
    if (overReplicatedPartitionCount > ZERO) {
      return TOPOLOGY_REASON_ABOVE_TARGET_REPLICA_COUNT;
    }
    return 'routable_visibility_stalled';
  }
  if (additionalPartitionCount < minAdditionalPartitions &&
      replicaNodeCount < minDistinctReplicaNodes &&
      (selectedNodeCount === ZERO || admissionReadyNodeCount === ZERO)) {
    return 'planner_not_runnable';
  }
  if (additionalPartitionCount < minAdditionalPartitions) {
    return 'partition_growth_stalled';
  }
  if (replicaNodeCount < minDistinctReplicaNodes) {
    return 'replica_spread_stalled';
  }
  return 'partitioning_timeout';
}

/**
 * Check whether an error is timeout-shaped.
 * @param {Error|*} error
 * @return {boolean}
 */
function isTimeoutShapedError(error) {
  const message = String(error?.message || error || '');
  return TIMEOUT_ERROR_PATTERN.test(message);
}

function isRetryableControlPlaneProgressError(error) {
  if (getControlPlaneRetryAfterMs(error) > ZERO) {
    return true;
  }
  if (isRetryableControlPlaneError(error)) {
    return true;
  }
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('participant failures') ||
    message.includes('query_admission_deferred') ||
    message.includes('query_admission_rejected');
}

function resolveControlPlaneRetryDelayMs(error, fallbackMs) {
  return Math.max(
    fallbackMs,
    getControlPlaneRetryAfterMs(error),
  );
}

/**
 * Run one control-plane query with timeout-aware lane routing.
 * @param {Object} node
 * @param {string} sql
 * @param {Array<*>} [params]
 * @return {Promise<Object>}
 */
async function queryControl(node, sql, params = [], options = {}) {
  const queryNodes = resolveControlQueryNodes(node, options);
  let lastError = null;
  for (const candidateNode of queryNodes) {
    try {
      return await queryControlSingle(candidateNode, sql, params, options);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('no_control_query_nodes_available');
}

function resolveControlQueryNodes(primaryNode, options = {}) {
  const candidates = [];
  if (primaryNode && typeof primaryNode === 'object') {
    candidates.push(primaryNode);
  }
  const extraNodes = Array.isArray(options.queryNodes) ?
    options.queryNodes :
    Array.isArray(options.fallbackNodes) ?
      options.fallbackNodes :
      [];
  for (const node of extraNodes) {
    if (node && typeof node === 'object') {
      candidates.push(node);
    }
  }
  const uniqueCandidates = [];
  const seenNodeIds = new Set();
  for (const node of candidates) {
    const nodeId = String(node?.id || '').trim();
    const dedupeKey = nodeId.length > ZERO ?
      nodeId :
      null;
    if (dedupeKey && seenNodeIds.has(dedupeKey)) {
      continue;
    }
    if (dedupeKey) {
      seenNodeIds.add(dedupeKey);
    }
    uniqueCandidates.push(node);
  }
  return uniqueCandidates;
}

async function forceRepairControlSnapshotAcrossQueryNodes(
  primaryNode,
  options = {},
) {
  const queryNodes = resolveControlQueryNodes(primaryNode, options);
  let repaired = false;
  for (const candidateNode of queryNodes) {
    repaired = await forceRepairControlSnapshot(candidateNode) || repaired;
  }
  return repaired;
}

async function queryControlSingle(node, sql, params = [], options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) &&
    options.timeoutMs > ZERO ?
    Math.floor(options.timeoutMs) :
    CONTROL_QUERY_TIMEOUT_MS;
  const lane = typeof options.lane === 'string' &&
    options.lane.length > ZERO ?
    options.lane :
    CONTROL_QUERY_LANE_CONTROL;
  if (node && typeof node.queryWithTimeout === 'function') {
    return node.queryWithTimeout(sql, params, {
      timeoutMs,
      lane,
    });
  }
  return node.query(sql, params);
}

async function queryControlSingleWithProgressRetry(
  node,
  sql,
  params = [],
  options = {},
) {
  const timeoutMs = Number.isFinite(options.timeoutMs) &&
    options.timeoutMs > ZERO ?
    Math.floor(options.timeoutMs) :
    CONTROL_QUERY_TIMEOUT_MS;
  const deadlineAtMs = Date.now() + timeoutMs;
  let lastError = null;

  while (true) {
    const remainingTimeoutMs = Math.max(ONE, deadlineAtMs - Date.now());
    try {
      return await queryControlSingle(node, sql, params, {
        ...options,
        timeoutMs: remainingTimeoutMs,
      });
    } catch (error) {
      lastError = error;
      if (!isRetryableControlPlaneProgressError(error) ||
          Date.now() >= deadlineAtMs) {
        throw lastError;
      }
      const retryDelayMs = Math.min(
        Math.max(
          ONE,
          resolveControlPlaneRetryDelayMs(
            error,
            CONTROL_QUERY_PROGRESS_RETRY_DELAY_MS,
          ),
        ),
        Math.max(ONE, deadlineAtMs - Date.now()),
      );
      await sleep(retryDelayMs);
    }
  }
}

/**
 * Normalize SQL query results into a rows array.
 * @param {*} result
 * @return {Array<Object>}
 */
function rowsFromResult(result) {
  if (Array.isArray(result)) {
    return result;
  }
  if (Array.isArray(result?.rows)) {
    return result.rows;
  }
  return [];
}

/**
 * Escape single quotes for SQL string literals.
 * @param {string} value
 * @return {string}
 */
function escapeSql(value) {
  return String(value).replace(/'/g, '\'\'');
}

/**
 * Resolve a benchmark-safe table name for partitioning scenarios.
 * @param {string} tableName
 * @return {string}
 */
function resolveBenchmarkTableName(tableName) {
  const candidate = String(tableName || '').trim();
  if (!IDENTIFIER_PATTERN.test(candidate)) {
    return TABLE_NAME_BENCHMARK_EVENTS;
  }
  return candidate;
}

/**
 * Resolve effective load table for partitioning scenarios.
 * Defaults to benchmark table when no explicit table override is provided.
 * @param {Object} cluster
 * @param {string} scenarioTableName
 * @param {Object} [options]
 * @param {boolean} [options.explicitTableName]
 * @return {string}
 */
function resolvePartitioningLoadTableName(
  cluster,
  scenarioTableName,
  options = {},
) {
  const explicitTableName = options.explicitTableName === true;
  const benchmarkTableName = String(
    cluster?._config?.benchmark?.tableName || '',
  ).trim();
  const candidate = explicitTableName ?
    scenarioTableName :
    (benchmarkTableName || scenarioTableName);
  const resolved = resolveBenchmarkTableName(candidate);
  if (!explicitTableName && resolved === TABLE_NAME_LOGS) {
    return TABLE_NAME_BENCHMARK_EVENTS;
  }
  return resolved;
}

function resolveClusterNodes(cluster) {
  if (typeof cluster?.getNodes === 'function') {
    return cluster.getNodes();
  }
  if (typeof cluster?.nodes === 'function') {
    return cluster.nodes();
  }
  return [];
}

function resolveBenchmarkAdmissionRequiredNodeCount(cluster, options = {}) {
  const clusterNodeCount = Math.max(
    1,
    resolveClusterNodes(cluster).length,
  );
  if (Number.isInteger(options.requiredNodeCount) &&
      options.requiredNodeCount > ZERO) {
    return Math.min(clusterNodeCount, options.requiredNodeCount);
  }
  const replicationFactor = Number.isInteger(
    cluster?._config?.benchmark?.replicationFactor,
  ) && cluster._config.benchmark.replicationFactor > ZERO ?
    cluster._config.benchmark.replicationFactor :
    BENCHMARK_DEFAULTS.replicationFactor;
  return Math.max(
    1,
    Math.min(
      clusterNodeCount,
      replicationFactor,
      DEFAULT_BENCHMARK_READY_NODE_COUNT,
    ),
  );
}

function resolveBenchmarkBootstrapRequiredNodeCount(
  cluster,
  options = {},
) {
  const clusterNodeCount = Math.max(
    1,
    resolveClusterNodes(cluster).length,
  );
  const targetNodeCount = resolveBenchmarkAdmissionRequiredNodeCount(
    cluster,
    options,
  );
  if (Number.isInteger(options.bootstrapRequiredNodeCount) &&
      options.bootstrapRequiredNodeCount > ZERO) {
    return Math.max(
      1,
      Math.min(
        clusterNodeCount,
        targetNodeCount,
        options.bootstrapRequiredNodeCount,
      ),
    );
  }
  const replicationFactor = Number.isInteger(
    cluster?._config?.benchmark?.replicationFactor,
  ) && cluster._config.benchmark.replicationFactor > ZERO ?
    cluster._config.benchmark.replicationFactor :
    BENCHMARK_DEFAULTS.replicationFactor;
  const bootstrapQuorumNodeCount =
    Math.floor(replicationFactor / 2) + ONE;
  return Math.max(
    1,
    Math.min(
      clusterNodeCount,
      targetNodeCount,
      bootstrapQuorumNodeCount,
    ),
  );
}

function resolveBenchmarkAdmissionTimeoutMs(cluster, options = {}) {
  if (Number.isFinite(options.timeoutMs) && options.timeoutMs > ZERO) {
    return Math.floor(options.timeoutMs);
  }
  const configuredTimeoutMs = cluster?._config?.benchmark?.readyTimeoutMs;
  if (Number.isFinite(configuredTimeoutMs) && configuredTimeoutMs > ZERO) {
    return Math.floor(configuredTimeoutMs);
  }
  return BENCHMARK_DEFAULTS.readyTimeoutMs;
}

function resolveBenchmarkAdmissionStableWindowMs(cluster, options = {}) {
  if (Number.isFinite(options.stableWindowMs) &&
      options.stableWindowMs >= ZERO) {
    return Math.floor(options.stableWindowMs);
  }
  const preloadStableWindowMs =
    cluster?._config?.benchmark?.preloadRequiredStableMs;
  if (Number.isFinite(preloadStableWindowMs) &&
      preloadStableWindowMs >= ZERO) {
    return Math.floor(preloadStableWindowMs);
  }
  const quiescentStableWindowMs =
    cluster?._config?.benchmark?.quiescentStableWindowMs;
  if (Number.isFinite(quiescentStableWindowMs) &&
      quiescentStableWindowMs >= ZERO) {
    return Math.floor(quiescentStableWindowMs);
  }
  return BENCHMARK_DEFAULTS.quiescentStableWindowMs;
}

function resolveBenchmarkAdmissionPollIntervalMs(cluster, options = {}) {
  if (Number.isFinite(options.pollIntervalMs) &&
      options.pollIntervalMs > ZERO) {
    return Math.floor(options.pollIntervalMs);
  }
  const configuredPollIntervalMs =
    cluster?._config?.benchmark?.readyPollIntervalMs;
  if (Number.isFinite(configuredPollIntervalMs) &&
      configuredPollIntervalMs > ZERO) {
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

function preserveNodeOrder(currentNodes, nextNodes, limit = Number.POSITIVE_INFINITY) {
  const normalizedLimit = Number.isInteger(limit) && limit > ZERO ?
    limit :
    nextNodes.length;
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
  const normalizedTargetCount = Number.isInteger(targetNodeCount) &&
    targetNodeCount > ZERO ?
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
  if (!supportsBenchmarkAdmission) {
    if (selectedNodes.length === ZERO) {
      return preserveNodeOrder(
        currentNodes,
        currentNodes,
        targetNodeCount,
      );
    }
    return preserveNodeOrder(
      currentNodes,
      selectedNodes,
      targetNodeCount,
    );
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

  if (enforceBenchmarkLoadAdmission &&
      typeof cluster?.waitForBenchmarkReadyLoadNodes === 'function') {
    return cluster.waitForBenchmarkReadyLoadNodes({
      tableName: options.tableName,
      tableId: options.tableId,
      minNodeCount: requiredNodeCount,
      timeoutMs: resolveBenchmarkAdmissionTimeoutMs(cluster, options),
      stableWindowMs:
        resolveBenchmarkAdmissionStableWindowMs(cluster, options),
      pollIntervalMs:
        resolveBenchmarkAdmissionPollIntervalMs(cluster, options),
      queryTimeoutMs: options.queryTimeoutMs,
    });
  }

  if (enforceBenchmarkLoadAdmission &&
      typeof cluster?.resolveBenchmarkReadyLoadNodes === 'function') {
    const readyNodes = await cluster.resolveBenchmarkReadyLoadNodes({
      tableName: options.tableName,
      tableId: options.tableId,
      timeoutMs: options.queryTimeoutMs,
    });
    assert.ok(
      readyNodes.length >= requiredNodeCount,
      'Expected at least ' + requiredNodeCount +
      ' benchmark-ready load nodes before starting load' +
      (typeof options.tableName === 'string' && options.tableName.length > ZERO ?
        ' for table "' + options.tableName + '"' :
        '') +
      ', got ' + readyNodes.length,
    );
    return readyNodes;
  }

  if (typeof cluster?.waitForLoadReadinessStability === 'function') {
    await cluster.waitForLoadReadinessStability({
      timeoutMs: resolveBenchmarkAdmissionTimeoutMs(cluster, options),
      stableWindowMs:
        resolveBenchmarkAdmissionStableWindowMs(cluster, options),
    });
  }
  return clusterNodes;
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
    typeof cluster?.resolveBenchmarkReadyLoadNodes === 'function';

  const selectLoadNodes = async () => {
    const distribution = await queryTableDistribution(seedNode, {
      tableName: options.tableName,
      queryNodes: options.queryNodes,
      fallbackNodes: options.fallbackNodes,
    });
    let readyNodeIds = null;
    let admissionReadyNodes = [];
    if (samplesBenchmarkAdmission) {
      try {
        readyNodeIds = new Set(
          (await cluster.resolveBenchmarkReadyLoadNodes({
            tableName: options.tableName,
            tableId: options.tableId,
            timeoutMs: options.queryTimeoutMs,
          }))
            .map((node) => String(node?.id || ''))
            .filter((nodeId) => nodeId.length > ZERO),
        );
        const readyNonSeedNodes = [];
        const readySeedNodes = [];
        for (const node of clusterNodes) {
          const nodeId = String(node?.id || '');
          if (!(readyNodeIds instanceof Set) || !readyNodeIds.has(nodeId)) {
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
        readyNodeIds = null;
        admissionReadyNodes = [];
      }
    }
    const preferredNodes = [];
    const fallbackNodes = [];
    const deferredSeedNodes = [];
    for (const node of clusterNodes) {
      const nodeId = String(node?.id || '');
      if (!distribution.replicaNodeIds.has(nodeId)) {
        continue;
      }
      if (nodeId === String(seedNode?.id || '')) {
        deferredSeedNodes.push(node);
        continue;
      }
      if (readyNodeIds instanceof Set && readyNodeIds.has(nodeId)) {
        preferredNodes.push(node);
        continue;
      }
      fallbackNodes.push(node);
    }
    for (const node of deferredSeedNodes) {
      const nodeId = String(node?.id || '');
      if (readyNodeIds instanceof Set && readyNodeIds.has(nodeId)) {
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
        replicaBearingNodeCount: distribution.replicaNodeCount,
        replicaBearingNodeIds: Array.from(distribution.replicaNodeIds),
        partitionCount: distribution.partitionCount,
      }),
      distribution,
      admissionReadyNodes,
      selectedNodes: preferredNodes.concat(fallbackNodes),
      readyReplicaNodes: preferredNodes,
    };
  };

  const targetNodeCount = resolveBenchmarkAdmissionRequiredNodeCount(
    cluster,
    options,
  );
  const bootstrapRequiredNodeCount =
    resolveBenchmarkBootstrapRequiredNodeCount(
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
  let lastSelectionDiagnostics = buildPartitioningPlannerDiagnostics();

  while (true) {
    try {
      const selected = await selectLoadNodes();
      lastDistribution = selected.distribution;
      lastSelectedNodes = selected.selectedNodes;
      lastAdmissionReadyNodes = selected.admissionReadyNodes;
      lastReadyReplicaNodes = selected.readyReplicaNodes;
      lastSelectionDiagnostics = selected.diagnostics;
    } catch (_error) {
      lastDistribution = null;
      lastSelectedNodes = [];
      lastAdmissionReadyNodes = [];
      lastReadyReplicaNodes = [];
      lastSelectionDiagnostics = buildPartitioningPlannerDiagnostics();
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
        'Timed out after ' + timeoutMs +
        'ms waiting for partitioning bootstrap quorum for table ' +
        String(options.tableName || 'unknown') +
        '; lastReadyReplicaCount=' + lastReadyReplicaNodes.length +
        '; lastReplicaBearingCount=' + lastSelectedNodes.length +
        '; lastReplicaSpread=' +
        String(lastDistribution?.replicaNodeCount || ZERO) +
        '; selectedNodeIds=' + mapNodeIds(lastSelectedNodes).join(',') +
        '; readyReplicaNodeIds=' + mapNodeIds(lastReadyReplicaNodes).join(','),
        lastSelectionDiagnostics,
      );
    }

    await sleep(pollIntervalMs);
  }

  const bootstrapNodes = resolvePartitioningDispatchNodes(
    samplesBenchmarkAdmission,
    {
      selectedNodes: lastSelectedNodes,
      readyReplicaNodes: lastReadyReplicaNodes,
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
  const normalizedRequestedOpsPerSec = Number.isFinite(requestedOpsPerSec) &&
    requestedOpsPerSec > ZERO ?
    Number(requestedOpsPerSec) :
    BENCHMARK_DEFAULTS.loadOpsPerSec;
  const normalizedAdmittedNodeCount = Number.isInteger(admittedNodeCount) &&
    admittedNodeCount > ZERO ?
    admittedNodeCount :
    ONE;
  const normalizedClusterNodeCount = Number.isInteger(clusterNodeCount) &&
    clusterNodeCount > ZERO ?
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
  return value === 'visible' ||
    value === 'pending_visibility' ||
    value === 'deferred_by_pressure' ?
    value :
    null;
}

function summarizeMutationVisibility(result) {
  return {
    visibilityState: normalizeMutationVisibilityState(result?.visibilityState),
    authoritativeVisibilityConfirmed:
      result?.authoritativeVisibilityConfirmed === true,
    retryAfterMs:
      Number.isFinite(result?.retryAfterMs) && result.retryAfterMs > ZERO ?
        Math.floor(result.retryAfterMs) :
        null,
  };
}

function advanceMutationVisibilitySummary(previous, result) {
  const current = previous && typeof previous === 'object' ?
    previous :
    summarizeMutationVisibility(null);
  const next = summarizeMutationVisibility(result);
  if (next.visibilityState !== null ||
      next.authoritativeVisibilityConfirmed === true ||
      next.retryAfterMs !== null) {
    return next;
  }
  return current;
}

function shouldDeferAuthoritativeRepair(visibilitySummary) {
  const visibilityState = normalizeMutationVisibilityState(
    visibilitySummary?.visibilityState,
  );
  return visibilityState === 'pending_visibility' ||
    visibilityState === 'deferred_by_pressure';
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
  if (visibilityState === 'deferred_by_pressure') {
    return options.deferredWarning || null;
  }
  if (visibilityState === 'pending_visibility') {
    return options.pendingWarning || null;
  }
  if (options.repairApplied === true) {
    return options.repairedWarning || null;
  }
  return null;
}

/**
 * Check whether one object has no own enumerable fields.
 * @param {*} value
 * @return {boolean}
 */
function isEmptyObject(value) {
  return value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === ZERO;
}

/**
 * Resolve whether an observed policy contains every expected key/value pair.
 * @param {Object} expected
 * @param {Object} observed
 * @return {boolean}
 */
function policyContainsExpected(expected, observed) {
  if (!expected || typeof expected !== 'object' ||
      !observed || typeof observed !== 'object') {
    return false;
  }

  for (const [key, expectedValue] of Object.entries(expected)) {
    const observedValue = observed[key];
    if (expectedValue &&
        typeof expectedValue === 'object' &&
        !Array.isArray(expectedValue)) {
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
  const sql = SQL_SELECT_TABLE_ID_PREFIX +
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
  const sql = SQL_SELECT_PARTITIONS_BY_TABLE_ID_PREFIX +
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
  const tableName = typeof options.tableName === 'string' &&
    options.tableName.length > ZERO ?
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
    'Timed out waiting for table_id visibility for "' + tableName + '"' +
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
  const requirePartitionVisibility =
    options.requirePartitionVisibility === true;
  const createSql = SQL_CREATE_TABLE_PREFIX +
    resolvedTableName +
    SQL_CREATE_TABLE_SUFFIX;
  const deadline = Date.now() +
    (requirePartitionVisibility ?
      TABLE_BOOTSTRAP_TIMEOUT_MS :
      TABLE_ID_VISIBILITY_TIMEOUT_MS);
  let createTimeoutError = null;
  let lastCreateError = null;
  let lastCreateErrorObject = null;
  let lastVisibilityError = null;
  let lastPartitionVisibilityError = null;
  let createVisibilitySummary = summarizeMutationVisibility(null);
  let tableVisibilityRepairAttempted = false;
  let tableVisibilityRepairApplied = false;
  while (Date.now() <= deadline) {
    try {
      const createResult = await queryControl(seedNode, createSql, [], {
        timeoutMs: POLICY_APPLY_ATTEMPT_TIMEOUT_MS,
        lane: CONTROL_QUERY_LANE_CONTROL,
        queryNodes: options.queryNodes,
        fallbackNodes: options.fallbackNodes,
      });
      createVisibilitySummary = advanceMutationVisibilitySummary(
        createVisibilitySummary,
        createResult,
      );
      lastCreateError = null;
      lastCreateErrorObject = null;
    } catch (error) {
      if (!isTimeoutShapedError(error) &&
          !isRetryableControlPlaneProgressError(error)) {
        throw error;
      }
      if (isTimeoutShapedError(error)) {
        createTimeoutError = String(error?.message || error);
      }
      lastCreateError = String(error?.message || error);
      lastCreateErrorObject = error;
    }

    try {
      const tableId = await queryTableId(seedNode, resolvedTableName, options);
      if (tableId) {
        if (!requirePartitionVisibility) {
          return {
            tableName: resolvedTableName,
            tableId,
            createTimeoutError,
            createVisibilityState: createVisibilitySummary.visibilityState,
            createVisibilityAuthoritativeConfirmed:
              createVisibilitySummary.authoritativeVisibilityConfirmed,
            createVisibilityRetryAfterMs:
              createVisibilitySummary.retryAfterMs,
            tableVisibilityRepairApplied,
            tableVisibilityWarning: resolveMutationVisibilityWarning({
              visibilitySummary: createVisibilitySummary,
              repairApplied: tableVisibilityRepairApplied,
              pendingWarning:
                'table_id_visibility_pending_after_authoritative_commit',
              deferredWarning:
                'table_id_visibility_deferred_by_pressure',
              repairedWarning:
                'table_id_visibility_repaired_from_authoritative_snapshot',
            }),
          };
        }
        try {
          const partitionIds = await queryPartitionIdsByTableId(
            seedNode,
            tableId,
            options,
          );
          if (partitionIds.length > ZERO) {
            return {
              tableName: resolvedTableName,
              tableId,
              createTimeoutError,
              createVisibilityState: createVisibilitySummary.visibilityState,
              createVisibilityAuthoritativeConfirmed:
                createVisibilitySummary.authoritativeVisibilityConfirmed,
              createVisibilityRetryAfterMs:
                createVisibilitySummary.retryAfterMs,
              tableVisibilityRepairApplied,
              tableVisibilityWarning: resolveMutationVisibilityWarning({
                visibilitySummary: createVisibilitySummary,
                repairApplied: tableVisibilityRepairApplied,
                pendingWarning:
                  'table_id_visibility_pending_after_authoritative_commit',
                deferredWarning:
                  'table_id_visibility_deferred_by_pressure',
                repairedWarning:
                  'table_id_visibility_repaired_from_authoritative_snapshot',
              }),
            };
          }
          lastPartitionVisibilityError =
            'table_id_visible_without_partitions';
        } catch (error) {
          lastPartitionVisibilityError = String(error?.message || error);
        }
      }
      lastVisibilityError = null;
    } catch (error) {
      lastVisibilityError = String(error?.message || error);
    }

    if (!tableVisibilityRepairAttempted &&
        !shouldDeferAuthoritativeRepair(createVisibilitySummary)) {
      tableVisibilityRepairAttempted = true;
      tableVisibilityRepairApplied =
        await forceRepairControlSnapshotAcrossQueryNodes(
          seedNode,
          options,
        ) || tableVisibilityRepairApplied;
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
    'Timed out waiting for table_id visibility for "' + resolvedTableName +
    '" (lastCreateError=' + String(lastCreateError || 'none') +
    ', lastCreateVisibilityState=' +
    String(createVisibilitySummary.visibilityState || 'none') +
    ', lastCreateVisibilityRetryAfterMs=' +
    String(createVisibilitySummary.retryAfterMs || 'none') +
    ', lastVisibilityError=' + String(lastVisibilityError || 'none') +
    ', lastPartitionVisibilityError=' +
    String(lastPartitionVisibilityError || 'none') +
    ', authoritativeRepairAttempted=' +
    String(tableVisibilityRepairAttempted) +
    ', authoritativeRepairApplied=' +
    String(tableVisibilityRepairApplied) + ')',
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
    requirePartitionVisibility: true,
    queryNodes: options.queryNodes,
    fallbackNodes: options.fallbackNodes,
  });
  const tablePolicies = options.tablePolicies &&
    typeof options.tablePolicies === 'object' ?
    options.tablePolicies :
    DEFAULT_TABLE_SPLIT_POLICIES;
  const policySql = SQL_UPDATE_TABLE_POLICIES_PREFIX +
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
      lastPolicyApplyError = String(error?.message || error);
      if (Date.now() >= visibilityDeadline) {
        break;
      }
      await sleep(resolveControlPlaneRetryDelayMs(
        error,
        POLICY_APPLY_RETRY_DELAY_MS,
      ));
      continue;
    }

    try {
      observedPolicy = await queryTablePolicies(
        seedNode,
        ensured.tableId,
        {
          tableName: ensured.tableName,
          queryNodes: options.queryNodes,
          fallbackNodes: options.fallbackNodes,
        },
      );
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
    if (!policyVisible &&
        !policyVisibilityRepairAttempted &&
        !shouldDeferAuthoritativeRepair(policyApplyVisibilitySummary)) {
      policyVisibilityRepairAttempted = true;
      policyVisibilityRepairApplied =
        await forceRepairControlSnapshotAcrossQueryNodes(
          seedNode,
          options,
        ) || policyVisibilityRepairApplied;
    }
    if (Date.now() >= visibilityDeadline) {
      break;
    }
    await sleep(resolveMutationVisibilityDelayMs(
      policyApplyVisibilitySummary,
      POLICY_VISIBILITY_POLL_INTERVAL_MS,
    ));
  }
  if (!policyVisible && policyUpdateNoOpDetected) {
    return {
      ...ensured,
      tablePolicies,
      tablePoliciesApplied: false,
      tablePoliciesApplyWarning:
        'sql_system_table_update_noop_detected',
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
          deferredWarning:
            'table_policy_visibility_deferred_by_pressure',
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
    ensured.tableName + '" (observed=' +
    JSON.stringify(observedPolicy) + ', expected=' +
    JSON.stringify(tablePolicies) + ', lastError=' +
    String(lastPolicyVisibilityError || 'none') +
    ', lastApplyError=' + String(lastPolicyApplyError || 'none') +
    ', lastApplyVisibilityState=' +
    String(policyApplyVisibilitySummary.visibilityState || 'none') +
    ', lastApplyVisibilityRetryAfterMs=' +
    String(policyApplyVisibilitySummary.retryAfterMs || 'none') +
    ', authoritativeRepairAttempted=' +
    String(policyVisibilityRepairAttempted) +
    ', authoritativeRepairApplied=' +
    String(policyVisibilityRepairApplied) +
    ', applyAttempts=' + applyAttemptCount +
    ', lastApplySummary=' + JSON.stringify(lastPolicyApplySummary) + ')',
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
  const preparation = tablePreparation &&
    typeof tablePreparation === 'object' ?
    tablePreparation :
    {};
  if (preparation.tablePoliciesApplied !== false) {
    return;
  }
  const scenarioName = typeof options.scenarioName === 'string' &&
    options.scenarioName.length > ZERO ?
    options.scenarioName :
    TABLE_POLICY_PRECONDITION_SCENARIO_DEFAULT;
  const tableName = String(preparation.tableName || 'unknown-table');
  const warningCode = String(
    preparation.tablePoliciesApplyWarning || 'table_policy_apply_failed',
  );
  throw new Error(
    'Split-policy precondition failed for "' + tableName +
    '" in scenario "' + scenarioName + '": ' + warningCode,
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
  assert.ok(
    seedNode &&
      (typeof seedNode.query === 'function' ||
        typeof seedNode.queryWithTimeout === 'function'),
    'queryTableDistribution requires a seed node with query capability',
  );

  const {tableName} = resolveTableDistributionQueryConfig(options);
  const queryNodes = resolveControlQueryNodes(seedNode, options);
  let lastError = null;
  let bestDistribution = null;
  for (const queryNode of queryNodes) {
    try {
      const distribution = await queryTableDistributionFromNode(
        queryNode,
        tableName,
      );
      if (isBetterTableDistributionCandidate(distribution, bestDistribution)) {
        bestDistribution = distribution;
      }
    } catch (error) {
      lastError = error;
    }
  }
  if (bestDistribution) {
    return bestDistribution;
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
  const candidateTopologyRank =
    rankTopologyState(candidate.topologyState);
  const currentTopologyRank =
    rankTopologyState(currentBest.topologyState);
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

async function queryTableDistributionFromNode(node, tableName) {
  let distribution = await readTableDistributionSnapshot(node, tableName);
  if (shouldRepairTableDistributionSnapshot(distribution)) {
    await forceRepairControlSnapshot(node);
    distribution = await readTableDistributionSnapshot(node, tableName);
  }

  return finalizeTableDistributionSnapshot(distribution, tableName);
}

async function readTableDistributionSnapshot(node, tableName) {
  const partitionSql = SQL_SELECT_TABLE_PARTITIONS_PREFIX +
    escapeSql(tableName) +
    SQL_SELECT_TABLE_PARTITIONS_SUFFIX;
  const tableIdSql = SQL_SELECT_TABLE_ID_PREFIX +
    escapeSql(tableName) +
    SQL_SELECT_TABLE_ID_SUFFIX;

  const [partitionResult, tableResult] = await Promise.all([
    queryControlSingleWithProgressRetry(node, partitionSql, [], {
      lane: CONTROL_QUERY_LANE_SNAPSHOT,
    }),
    queryControlSingleWithProgressRetry(node, tableIdSql, [], {
      lane: CONTROL_QUERY_LANE_SNAPSHOT,
    }),
  ]);

  let partitionRows = rowsFromResult(partitionResult);
  const tableRows = rowsFromResult(tableResult);
  const tableId = firstTableId(tableRows);
  if (partitionRows.length === ZERO) {
    if (tableId) {
      const partitionByIdSql = SQL_SELECT_PARTITIONS_BY_TABLE_ID_PREFIX +
        escapeSql(tableId) +
        SQL_SELECT_PARTITIONS_BY_TABLE_ID_SUFFIX;
      const partitionByIdResult = await queryControlSingleWithProgressRetry(
        node,
        partitionByIdSql,
        [],
        {
          lane: CONTROL_QUERY_LANE_SNAPSHOT,
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
  const tableId = typeof snapshot?.tableId === 'string' ?
    snapshot.tableId :
    '';
  if (partitionRows.length === ZERO) {
    return tableId.length > ZERO;
  }
  if (serviceRows.length === ZERO) {
    return true;
  }
  return summarizeTableDistributionTopology(partitionRows, serviceRows)
    .topologyState === TOPOLOGY_STATE_INVALID;
}

function buildActivePartitionServicesSql(options = {}) {
  const partitionRows = Array.isArray(options.partitionRows) ?
    options.partitionRows :
    [];
  const partitionIds = partitionRows
    .map((row) => String(row?.partition_id || ''))
    .filter((partitionId) => partitionId.length > ZERO);
  if (partitionIds.length > ZERO) {
    return SQL_SELECT_ACTIVE_PARTITION_SERVICES_PREFIX +
      ' AND partition_id IN (' +
      partitionIds.map((partitionId) => '\'' + escapeSql(partitionId) + '\'')
        .join(', ') +
      ')';
  }
  return SQL_SELECT_ACTIVE_PARTITION_SERVICES_PREFIX + ' AND 1 = 0';
}

async function forceRepairControlSnapshot(node) {
  const candidateLanes = [
    CONTROL_QUERY_LANE_SNAPSHOT,
    CONTROL_QUERY_LANE_CONTROL,
  ];
  for (const lane of candidateLanes) {
    try {
      await queryControlSingle(node, SQL_CONTROL_SNAPSHOT_FORCE_REPAIR, [], {
        lane,
      });
      return true;
    } catch (_error) {
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

  const topologySummary =
    summarizeTableDistributionTopology(partitionRows, serviceRows);

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
    overReplicatedPartitionCount:
      topologySummary.overReplicatedPartitionCount,
  };
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

  let opaquePartitionCount = ZERO;
  let invalidPartitionCount = ZERO;
  let leaderServiceMissingPartitionCount = ZERO;
  let overReplicatedPartitionCount = ZERO;
  const topologySignatureParts = [];

  for (const partitionRow of Array.isArray(partitionRows) ? partitionRows : []) {
    const partitionId = firstStringField(
      partitionRow,
      'partition_id',
      'partitionId',
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
        partitionId + ':' + TOPOLOGY_REASON_ABOVE_TARGET_REPLICA_COUNT +
        ':' + topology.observedReplicaCount + '/' +
        String(topology.desiredReplicaCount || ZERO),
      );
      continue;
    }
    if (topology.lastErrorCode === TOPOLOGY_REASON_LEADER_SERVICE_MISSING) {
      invalidPartitionCount += 1;
      leaderServiceMissingPartitionCount += 1;
      topologySignatureParts.push(
        partitionId + ':' + TOPOLOGY_REASON_LEADER_SERVICE_MISSING +
        ':' + topology.observedReplicaCount + '/' +
        String(topology.desiredReplicaCount || ZERO),
      );
      continue;
    }
    if (topology.topologyState === TOPOLOGY_STATE_OPAQUE) {
      opaquePartitionCount += 1;
      topologySignatureParts.push(
        partitionId + ':' + TOPOLOGY_STATE_OPAQUE + ':' +
        topology.observedReplicaCount,
      );
      continue;
    }
    topologySignatureParts.push(
      partitionId + ':' + TOPOLOGY_STATE_ROUTABLE + ':' +
      topology.observedReplicaCount,
    );
  }

  const topologyState = invalidPartitionCount > ZERO ?
    TOPOLOGY_STATE_INVALID :
    opaquePartitionCount > ZERO ?
      TOPOLOGY_STATE_OPAQUE :
      TOPOLOGY_STATE_ROUTABLE;

  return {
    replicaNodeIds,
    replicasByPartition,
    serviceCount,
    topologyState,
    topologySignature: topologySignatureParts.sort().join('|'),
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
    options.loadProgress && typeof options.loadProgress === 'object' &&
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
      metrics?.waitReasons && typeof metrics.waitReasons === 'object' ?
        metrics.waitReasons :
        {};
    const topPressureNodes = Object.entries(
      metrics?.perNode && typeof metrics.perNode === 'object' ?
        metrics.perNode :
        {},
    )
      .map(([nodeId, nodeMetrics]) => {
        const nodeWaitReasons =
          nodeMetrics?.waitReasons &&
            typeof nodeMetrics.waitReasons === 'object' ?
            nodeMetrics.waitReasons :
            {};
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
            nodeSlotUnavailable +
            timeoutWaits +
            retryableControlPlanePressure,
        };
      })
      .filter((entry) => entry.pressureScore > ZERO)
      .sort((left, right) =>
        right.pressureScore - left.pressureScore ||
        right.timeoutWaits - left.timeoutWaits ||
        String(left.nodeId).localeCompare(String(right.nodeId)),
      )
      .slice(ZERO, 3)
      .map((entry) =>
        String(entry.nodeId) +
        '(nodeSlotUnavailable=' + entry.nodeSlotUnavailable +
        ', timeoutWaits=' + entry.timeoutWaits +
        ', retryableControlPlanePressure=' +
        entry.retryableControlPlanePressure + ')',
      );
    throw new Error(
      'Load phase stalled with no successful progress while waiting for ' +
      'partition growth. phase=' + String(context.phase || 'growth') +
      ', success=' + success +
      ', failed=' + failed +
      ', dispatchedOperations=' + dispatchedOperations +
      ', nodeSlotUnavailable=' +
      Math.max(ZERO, Number(waitReasons.nodeSlotUnavailable || ZERO)) +
      ', timeoutWaits=' +
      Math.max(ZERO, Number(waitReasons.timeoutWaits || ZERO)) +
      ', retryableControlPlanePressure=' +
      Math.max(
        ZERO,
        Number(waitReasons.retryableControlPlanePressure || ZERO),
      ) +
      ', rejectedOperations=' +
      Math.max(ZERO, Number(metrics?.rejectedOperations || ZERO)) +
      ', opsPerSec=' +
      Math.max(ZERO, Number(metrics?.opsPerSec || ZERO)).toFixed(2) +
      ', noProgressMs=' + noProgressMs +
      ', partitionSamples=' + Number(context.sampleCount || ZERO) +
      ', additionalPartitions=' +
      Number(context.additionalPartitionCount || ZERO) +
      ', replicaNodeCount=' + Number(
        context.latest?.replicaNodeCount ||
        context.baseline?.replicaNodeCount ||
        ZERO,
      ) +
      ', lastQueryError=' + String(context.lastQueryError || 'none') +
      ', topPressureNodes=' +
      (topPressureNodes.length > ZERO ? topPressureNodes.join('; ') : 'none'),
    );
  };
  const maybeAbortForTopologyStall = (context = {}) => {
    const latestDistribution =
      context.latest && typeof context.latest === 'object' ?
        context.latest :
        null;
    if (!latestDistribution ||
        latestDistribution.topologyState !== TOPOLOGY_STATE_INVALID) {
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
    const error = new Error(
      'Table distribution topology stalled in an invalid state while waiting ' +
      'for "' + tableName + '". failureMode=' + failureMode +
      ', topologyState=' + String(latestDistribution.topologyState || 'unknown') +
      ', invalidPartitionCount=' +
      Number(latestDistribution.invalidPartitionCount || ZERO) +
      ', leaderServiceMissingPartitionCount=' +
      Number(latestDistribution.leaderServiceMissingPartitionCount || ZERO) +
      ', overReplicatedPartitionCount=' +
      Number(latestDistribution.overReplicatedPartitionCount || ZERO) +
      ', serviceCount=' + Number(latestDistribution.serviceCount || ZERO) +
      ', replicaNodeCount=' +
      Number(latestDistribution.replicaNodeCount || ZERO) +
      ', noProgressMs=' + noProgressMs +
      ', sampleCount=' + Number(context.sampleCount || ZERO) +
      ', lastQueryError=' + String(context.lastQueryError || 'none'),
    );
    error.diagnostics = {
      partitionGrowth: {
        tableName,
        failureMode,
        baselinePartitionCount: Number(context.baseline?.partitionCount || ZERO),
        currentPartitionCount: Number(
          latestDistribution.partitionCount || ZERO,
        ),
        additionalPartitionCount: Number(
          context.additionalPartitionCount || ZERO,
        ),
        replicaNodeCount: Number(
          latestDistribution.replicaNodeCount || ZERO,
        ),
        serviceCount: Number(latestDistribution.serviceCount || ZERO),
        topologyState: String(latestDistribution.topologyState || 'unknown'),
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
        lastQueryError: String(context.lastQueryError || 'none'),
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
      if (typeof options.assertContinue === 'function') {
        await options.assertContinue({
          phase: 'baseline',
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
        phase: 'baseline',
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
    'Timed out waiting for baseline table distribution for "' + tableName + '"' +
    ', transientQueryErrors=' + transientQueryErrors +
    ', lastQueryError=' + String(lastQueryError || 'none'),
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
      if (typeof options.assertContinue === 'function') {
        await options.assertContinue({
          phase: 'growth',
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
        phase: 'growth',
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

    for (const partitionId of latest.partitionIds) {
      if (baselinePartitionIds.has(partitionId)) {
        continue;
      }
      additionalPartitionIds.add(partitionId);
    }

    if (typeof options.assertContinue === 'function') {
      await options.assertContinue({
        phase: 'growth',
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
      phase: 'growth',
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
      phase: 'growth',
      baseline,
      latest,
      sampleCount,
      additionalPartitionCount: additionalPartitionIds.size,
      transientQueryErrors,
      lastQueryError,
    });

    const growthSatisfied =
      additionalPartitionIds.size >= minAdditionalPartitions;
    const spreadSatisfied =
      latest.replicaNodeCount >= minDistinctReplicaNodes;
    const topologySatisfied =
      latest.topologyState !== TOPOLOGY_STATE_INVALID;
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
    overReplicatedPartitionCount:
      latest.overReplicatedPartitionCount,
    plannerDiagnostics,
  });
  const error = new Error(
    'Timed out waiting for table "' + tableName + '" to add at least ' +
    minAdditionalPartitions + ' partitions and spread replicas to at least ' +
    minDistinctReplicaNodes + ' nodes. Baseline=' +
    baseline.partitionCount + ', latest=' + latest.partitionCount +
    ', additionalSeen=' + additionalPartitionIds.size +
    ', spread=' + latest.replicaNodeCount + ', samples=' + sampleCount +
    ', serviceCount=' + Number(latest.serviceCount || ZERO) +
    ', transientQueryErrors=' + transientQueryErrors +
    ', lastQueryError=' + String(lastQueryError || 'none') +
    ', failureMode=' + failureMode +
    ', topologyState=' + String(latest.topologyState || 'unknown') +
    ', leaderServiceMissingPartitionCount=' +
    Number(latest.leaderServiceMissingPartitionCount || ZERO) +
    ', overReplicatedPartitionCount=' +
    Number(latest.overReplicatedPartitionCount || ZERO) +
    (plannerDiagnostics ?
      ', selectedNodeIds=' + formatPlannerNodeIds(
        plannerDiagnostics.selectedNodeIds,
      ) +
      ', readyReplicaNodeIds=' + formatPlannerNodeIds(
        plannerDiagnostics.readyReplicaNodeIds,
      ) +
      ', admissionReadyNodeIds=' + formatPlannerNodeIds(
        plannerDiagnostics.admissionReadyNodeIds,
      ) +
      ', readinessReasonHistogram=' + formatPlannerHistogram(
        plannerDiagnostics.readinessReasonHistogram,
      ) :
      ''),
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
      topologyState: String(latest.topologyState || 'unknown'),
      leaderServiceMissingPartitionCount: Number(
        latest.leaderServiceMissingPartitionCount || ZERO,
      ),
      overReplicatedPartitionCount: Number(
        latest.overReplicatedPartitionCount || ZERO,
      ),
      sampleCount,
      transientQueryErrors,
      lastQueryError: String(lastQueryError || 'none'),
    },
    ...(plannerDiagnostics ? {partitioningPlanner: plannerDiagnostics} : {}),
  };
  throw error;
}

async function waitForPostSplitConsistencyConvergence(cluster, options = {}) {
  assert.ok(
    cluster &&
      typeof cluster.waitForConsistencyConvergence === 'function',
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

export {
  admitBenchmarkLoadNodes,
  BENCHMARK_WORKLOAD_PROFILE,
  TABLE_NAME_LOGS,
  TABLE_NAME_BENCHMARK_EVENTS,
  createPartitioningAdaptiveDispatchGuardrail,
  createPartitioningBenchmarkLoadNodePlan,
  escapeSql,
  sleep,
  rowsFromResult,
  resolveBenchmarkTableName,
  resolvePartitioningBenchmarkLoadOpsPerSec,
  resolvePartitioningLoadTableName,
  ensureBenchmarkPartitioningTable,
  prepareBenchmarkPartitioningTable,
  assertSplitPolicyPrecondition,
  queryTableDistribution,
  waitForPartitionGrowthAndSpread,
  waitForPostSplitConsistencyConvergence,
};
