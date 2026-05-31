/**
 * Scenario: Rolling Restart
 *
 * Start cluster under load, restart nodes one at a time,
 * verify bounded disruption during restarts.
 *
 * Requirements: 4.4, 6.1
 */

import assert from 'node:assert/strict';
import {
  CONVERGENCE_DEFAULTS,
  SCENARIO_TIMING_DEFAULTS,
  TIMEOUTS,
} from '../harness/constants.js';
import {resolveScenarioOptions} from '../harness/scenario-config.js';
import {
  BENCHMARK_WORKLOAD_PROFILE,
  TABLE_BOOTSTRAP_VISIBILITY_STATE,
  createPartitioningBenchmarkLoadNodePlan,
  ensureBenchmarkPartitioningTable,
  resolvePartitioningBenchmarkLoadOpsPerSec,
  resolvePartitioningLoadTableName,
} from './table-distribution-helpers.js';

const ACKNOWLEDGED_WRITE_ALIAS = 'ack_id';
const ACKNOWLEDGED_WRITE_BATCH_SIZE = 100;
const PRE_LOAD_READINESS_TIMEOUT_MS = 300000;
const PRE_LOAD_READINESS_NO_PROGRESS_MAX_ATTEMPTS = 8;
const LOAD_READINESS_PHASE_PRE_LOAD = 'pre_load';
const LOAD_READINESS_PHASE_POST_RESTART = 'post_restart';
const ZERO = 0;
const POST_RESTART_RECOVERY_MIN_STABLE_WINDOW_MS = 15000;
const POST_RESTART_CONTROL_PLANE_MAX_IN_FLIGHT_COUNT = ZERO;
const POST_RESTART_CRITICAL_SYSTEM_SPREAD_REQUIRED = true;
const POST_RESTART_CONTROL_PLANE_QUIESCENCE_NO_PROGRESS_TIMEOUT_MS = 30000;
// Fail fast when waitForConvergence observes no convergence-relevant progress
// for this long, rather than burning the full per-node settle budget (which can
// be several minutes). Matches the control-plane quiescence no-progress window.
const CONVERGENCE_NO_PROGRESS_TIMEOUT_MS = 30000;
const POST_RESTART_LOAD_READINESS_NO_PROGRESS_MAX_ATTEMPTS = 5;
const ROLLING_RESTART_REQUIRE_ADMIN_READY = true;
const MIN_BENCHMARK_READY_LOAD_NODES = 2;
const BENCHMARK_LOAD_ADMISSION_QUERY_TIMEOUT_MS = 1000;
const BENCHMARK_PRE_LOAD_READINESS_WARMUP_TIMEOUT_MS = 30000;

function normalizeFiniteNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function normalizeNonEmptyString(value, fallback) {
  return typeof value === 'string' && value.length > ZERO ? value : fallback;
}

function rowsFromResult(result) {
  if (Array.isArray(result)) {
    return result;
  }
  if (Array.isArray(result?.rows)) {
    return result.rows;
  }
  return [];
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

function resolveSeedNodeQueryHandle(rawSeedNode) {
  if (!rawSeedNode || typeof rawSeedNode !== 'object') {
    return null;
  }
  if (typeof rawSeedNode.query === 'function') {
    return rawSeedNode;
  }
  if (typeof rawSeedNode.queryWithTimeout !== 'function') {
    return null;
  }
  return {
    ...rawSeedNode,
    query(sql, params = []) {
      return rawSeedNode.queryWithTimeout(sql, params);
    },
  };
}

function supportsBenchmarkLoadAdmissionPlanning(cluster) {
  return typeof cluster?.resolveBenchmarkReadyLoadNodes === 'function' ||
    typeof cluster?.resolveBenchmarkLoadAdmissionSnapshot === 'function';
}

function buildStaticLoadNodePlan(nodes) {
  return {
    initialNodes: nodes,
    nodeResolver: () => nodes,
    stop: () => {},
  };
}

async function buildRollingRestartLoadPlan(cluster, scenarioOptions, {
  clusterNodes,
  loadOpsPerSec,
  preLoadReadinessStableWindowMs,
  preLoadReadinessTimeoutMs,
}) {
  if (!supportsBenchmarkLoadAdmissionPlanning(cluster)) {
    return {
      benchmarkAdmissionEnabled: false,
      effectiveLoadOpsPerSec: loadOpsPerSec,
      tableName: null,
      workloadProfile: null,
      loadNodePlan: buildStaticLoadNodePlan(clusterNodes),
    };
  }

  const requestedTableName =
    typeof scenarioOptions.tableName === 'string' &&
    scenarioOptions.tableName.length > ZERO ?
      scenarioOptions.tableName :
      '';
  const effectiveLoadTableName = resolvePartitioningLoadTableName(
    cluster,
    requestedTableName,
    {
      explicitTableName: requestedTableName.length > ZERO,
    },
  );
  const seedNode = resolveSeedNodeQueryHandle(clusterNodes[ZERO]);
  assert.ok(
    seedNode,
    'Rolling restart benchmark load admission requires a seed query handle',
  );

  const ensuredBenchmarkTable = await ensureBenchmarkPartitioningTable(
    seedNode,
    {
      tableName: effectiveLoadTableName,
      requiredBootstrapVisibilityState:
        TABLE_BOOTSTRAP_VISIBILITY_STATE.PARTITIONS_VISIBLE,
      queryNodes: clusterNodes,
    },
  );
  const requiredNodeCount = Math.max(
    1,
    Math.min(
      clusterNodes.length > ZERO ? clusterNodes.length : 1,
      MIN_BENCHMARK_READY_LOAD_NODES,
    ),
  );
  const loadNodePlan = await createPartitioningBenchmarkLoadNodePlan(
    seedNode,
    cluster,
    {
      tableName: effectiveLoadTableName,
      tableId: ensuredBenchmarkTable?.tableId,
      requiredNodeCount,
      bootstrapRequiredNodeCount: requiredNodeCount,
      timeoutMs: preLoadReadinessTimeoutMs,
      stableWindowMs: preLoadReadinessStableWindowMs,
      queryTimeoutMs: BENCHMARK_LOAD_ADMISSION_QUERY_TIMEOUT_MS,
      queryNodes: clusterNodes,
    },
  );
  assert.ok(
    Array.isArray(loadNodePlan.initialNodes) &&
      loadNodePlan.initialNodes.length > ZERO,
    'Expected benchmark-ready load nodes before starting rolling restart load',
  );

  return {
    benchmarkAdmissionEnabled: true,
    effectiveLoadOpsPerSec: resolvePartitioningBenchmarkLoadOpsPerSec(
      loadOpsPerSec,
      loadNodePlan.initialNodes.length,
      clusterNodes.length,
    ),
    tableName: effectiveLoadTableName,
    workloadProfile: BENCHMARK_WORKLOAD_PROFILE,
    loadNodePlan,
  };
}

function escapeSql(value) {
  return String(value).replace(/'/g, '\'\'');
}

async function getReachableNodes(nodes) {
  const reachable = [];
  for (const node of nodes) {
    if (typeof node?.isReachable === 'function') {
      const isReachable = await node.isReachable();
      if (!isReachable) {
        continue;
      }
    }
    reachable.push(node);
  }
  return reachable;
}

function buildAcknowledgedWriteVisibilityQuery(tableName, idColumn, ids) {
  return 'SELECT ' + idColumn + ' AS ' + ACKNOWLEDGED_WRITE_ALIAS +
    ' FROM ' + tableName + ' WHERE ' + idColumn + ' IN (' +
    ids.map((id) => '\'' + escapeSql(id) + '\'').join(', ') + ')';
}

async function assertAcknowledgedWritesVisibleOnReachableNodes(
  acknowledgedWrites,
  nodes,
) {
  const ids = Array.isArray(acknowledgedWrites?.ids) ?
    [...new Set(acknowledgedWrites.ids
      .filter((id) => typeof id === 'string' && id.length > ZERO))] :
    [];
  const reachableNodes = await getReachableNodes(nodes);
  if (ids.length === ZERO) {
    return {
      acknowledgedWriteCount: ZERO,
      reachableNodeCount: reachableNodes.length,
    };
  }

  assert.ok(
    reachableNodes.length > ZERO,
    'No reachable nodes available for acknowledged-write visibility check',
  );

  const tableName = normalizeNonEmptyString(
    acknowledgedWrites?.tableName,
    'logs',
  );
  const idColumn = normalizeNonEmptyString(
    acknowledgedWrites?.idColumn,
    'log_id',
  );

  for (const node of reachableNodes) {
    const missingIds = [];
    for (let index = ZERO; index < ids.length;
      index += ACKNOWLEDGED_WRITE_BATCH_SIZE) {
      const idBatch = ids.slice(index, index + ACKNOWLEDGED_WRITE_BATCH_SIZE);
      const query = buildAcknowledgedWriteVisibilityQuery(
        tableName,
        idColumn,
        idBatch,
      );
      const result = await node.query(query);
      const visibleIds = new Set(
        rowsFromResult(result)
          .map((row) => row?.[ACKNOWLEDGED_WRITE_ALIAS])
          .filter((id) => typeof id === 'string' && id.length > ZERO),
      );
      for (const id of idBatch) {
        if (!visibleIds.has(id)) {
          missingIds.push(id);
        }
      }
    }
    assert.equal(
      missingIds.length,
      ZERO,
      'Acknowledged writes missing after rolling restart on node ' +
      String(node?.id || 'unknown') + ': ' +
      JSON.stringify(missingIds.slice(ZERO, 10)) +
      (missingIds.length > 10 ?
        ' (+' + String(missingIds.length - 10) + ' more)' :
        ''),
    );
  }

  return {
    acknowledgedWriteCount: ids.length,
    reachableNodeCount: reachableNodes.length,
  };
}

function resolveRollingRestartScenarioConfig(options = {}) {
  return Object.freeze({
    loadOpsPerSec: normalizeFiniteNumber(options.loadOpsPerSec, 30),
    loadDuration: normalizeNonEmptyString(options.loadDuration, '300s'),
    queryTimeoutMs: normalizeFiniteNumber(options.queryTimeoutMs, 10000),
    preLoadReadinessStableWindowMs: normalizeFiniteNumber(
      options.preLoadReadinessStableWindowMs,
      SCENARIO_TIMING_DEFAULTS.stabilizationDelayMs,
    ),
    preLoadReadinessTimeoutMs: normalizeFiniteNumber(
      options.preLoadReadinessTimeoutMs,
      PRE_LOAD_READINESS_TIMEOUT_MS,
    ),
    preLoadReadinessNoProgressMaxAttempts: normalizeFiniteNumber(
      options.preLoadReadinessNoProgressMaxAttempts,
      PRE_LOAD_READINESS_NO_PROGRESS_MAX_ATTEMPTS,
    ),
    preRestartSettleMs: normalizeFiniteNumber(
      options.preRestartSettleMs,
      SCENARIO_TIMING_DEFAULTS.stabilizationDelayMs,
    ),
    perRestartActiveTimeoutMs:
      normalizeFiniteNumber(options.perRestartActiveTimeoutMs, 120000),
    perNodeConvergenceTimeoutMs:
      normalizeFiniteNumber(options.perNodeConvergenceTimeoutMs, 300000),
    interRestartDelayMs: normalizeFiniteNumber(
      options.interRestartDelayMs,
      SCENARIO_TIMING_DEFAULTS.interActionDelayMs,
    ),
    minRestartSuccessRate:
      normalizeFiniteNumber(options.minRestartSuccessRate, 0.63),
    postRestartLoadSoakMs:
      normalizeFiniteNumber(
        options.postRestartLoadSoakMs,
        SCENARIO_TIMING_DEFAULTS.shortSoakMs,
      ),
    postRestartQuietWindowMs:
      normalizeFiniteNumber(
        options.postRestartQuietWindowMs,
        CONVERGENCE_DEFAULTS.quietWindowMs,
      ),
    postRestartActiveTimeoutMs:
      normalizeFiniteNumber(options.postRestartActiveTimeoutMs, 240000),
    postRestartControlPlaneQuiescenceNoProgressTimeoutMs:
      normalizeFiniteNumber(
        options.postRestartControlPlaneQuiescenceNoProgressTimeoutMs,
        POST_RESTART_CONTROL_PLANE_QUIESCENCE_NO_PROGRESS_TIMEOUT_MS,
      ),
    postRestartLoadReadinessNoProgressMaxAttempts: normalizeFiniteNumber(
      options.postRestartLoadReadinessNoProgressMaxAttempts,
      POST_RESTART_LOAD_READINESS_NO_PROGRESS_MAX_ATTEMPTS,
    ),
    postRestartConsistencyTimeoutMs:
      normalizeFiniteNumber(
        options.postRestartConsistencyTimeoutMs,
        TIMEOUTS.CONSISTENCY_CONVERGENCE_POST_SPLIT,
      ),
    postRestartConsistencyPollIntervalMs:
      normalizeFiniteNumber(
        options.postRestartConsistencyPollIntervalMs,
        TIMEOUTS.CONSISTENCY_CONVERGENCE_POLL_INTERVAL,
      ),
    postRestartConsistencyForceRepairAfterMs:
      normalizeFiniteNumber(
        options.postRestartConsistencyForceRepairAfterMs,
        TIMEOUTS.CONSISTENCY_CONVERGENCE_FORCE_REPAIR_AFTER,
      ),
  });
}

function buildConvergenceOptions(perNodeConvergenceTimeoutMs) {
  return {
    settleTimeoutMs: perNodeConvergenceTimeoutMs,
    quietWindowMs: CONVERGENCE_DEFAULTS.quietWindowMs,
    targetVoterCount: CONVERGENCE_DEFAULTS.targetVoterCount,
    maxSustainedOverTargetMs: Math.max(
      CONVERGENCE_DEFAULTS.maxSustainedOverTargetMs,
      perNodeConvergenceTimeoutMs,
    ),
    ignoreStaleInFlightReplicaOperations: true,
    noProgressTimeoutMs: CONVERGENCE_NO_PROGRESS_TIMEOUT_MS,
  };
}

function buildStrictConvergenceOptions(perNodeConvergenceTimeoutMs) {
  return {
    ...buildConvergenceOptions(perNodeConvergenceTimeoutMs),
    ignoreStaleInFlightReplicaOperations: true,
  };
}

function buildPostRestartQuiescenceOptions({
  perNodeConvergenceTimeoutMs,
  postRestartRecoveryStableWindowMs,
  postRestartControlPlaneQuiescenceNoProgressTimeoutMs,
}) {
  return {
    timeoutMs: perNodeConvergenceTimeoutMs,
    stableWindowMs: postRestartRecoveryStableWindowMs,
    noProgressTimeoutMs: postRestartControlPlaneQuiescenceNoProgressTimeoutMs,
    maxInFlightCount: POST_RESTART_CONTROL_PLANE_MAX_IN_FLIGHT_COUNT,
    ignoreStaleInFlightReplicaOperations: true,
    requireCriticalSystemSpread:
      POST_RESTART_CRITICAL_SYSTEM_SPREAD_REQUIRED,
  };
}

function resolvePostRestartRecoveryStableWindowMs(postRestartQuietWindowMs) {
  if (
    !Number.isFinite(postRestartQuietWindowMs) ||
    postRestartQuietWindowMs <= ZERO
  ) {
    return ZERO;
  }
  return Math.max(
    postRestartQuietWindowMs,
    POST_RESTART_RECOVERY_MIN_STABLE_WINDOW_MS,
  );
}

async function waitForPostRestartRecoveryBarrier(cluster, {
  perNodeConvergenceTimeoutMs,
  postRestartActiveTimeoutMs,
  postRestartQuietWindowMs,
  postRestartControlPlaneQuiescenceNoProgressTimeoutMs,
  postRestartLoadReadinessNoProgressMaxAttempts,
}) {
  const postRestartRecoveryStableWindowMs =
    resolvePostRestartRecoveryStableWindowMs(postRestartQuietWindowMs);

  if (typeof cluster.waitForAllActive === 'function') {
    // Load has stopped; require strict active convergence before comparing
    // final leader maps.
    await cluster.waitForAllActive({
      timeoutMs: postRestartActiveTimeoutMs,
    });
  }

  await cluster.waitForConvergence(
    buildStrictConvergenceOptions(perNodeConvergenceTimeoutMs),
  );

  if (typeof cluster.waitForControlPlaneQuiescence === 'function') {
    await cluster.waitForControlPlaneQuiescence(
      buildPostRestartQuiescenceOptions({
        perNodeConvergenceTimeoutMs,
        postRestartRecoveryStableWindowMs,
        postRestartControlPlaneQuiescenceNoProgressTimeoutMs,
      }),
    );
  }

  if (typeof cluster.waitForLoadReadinessStability === 'function') {
    await cluster.waitForLoadReadinessStability({
      stableWindowMs: postRestartRecoveryStableWindowMs,
      timeoutMs: postRestartActiveTimeoutMs,
      noProgressMaxAttempts: postRestartLoadReadinessNoProgressMaxAttempts,
      loadReadinessPhase: LOAD_READINESS_PHASE_POST_RESTART,
    });
  }
}

/**
 * Run the rolling-restart scenario.
 *
 * @param {Object} cluster - Cluster handle from the harness.
 * @param {Object} [options]
 */
async function run(cluster, options = {}) {
  const scenarioOptions = resolveScenarioOptions(
    options,
    cluster,
    'rollingRestart',
  );
  const {
    loadOpsPerSec,
    loadDuration,
    queryTimeoutMs,
    preLoadReadinessStableWindowMs,
    preLoadReadinessTimeoutMs,
    preLoadReadinessNoProgressMaxAttempts,
    preRestartSettleMs,
    perRestartActiveTimeoutMs,
    perNodeConvergenceTimeoutMs,
    interRestartDelayMs,
    minRestartSuccessRate,
    postRestartLoadSoakMs,
    postRestartQuietWindowMs,
    postRestartActiveTimeoutMs,
    postRestartControlPlaneQuiescenceNoProgressTimeoutMs,
    postRestartLoadReadinessNoProgressMaxAttempts,
    postRestartConsistencyTimeoutMs,
    postRestartConsistencyPollIntervalMs,
    postRestartConsistencyForceRepairAfterMs,
  } = resolveRollingRestartScenarioConfig(scenarioOptions);
  const benchmarkAdmissionSupported =
    supportsBenchmarkLoadAdmissionPlanning(cluster);
  // 1. Wait until the cluster is safe for load. Node-level ACTIVE is not
  // enough here: rolling restart load must not compete with startup priority
  // recovery for critical system partitions.
  if (typeof cluster.waitForLoadReadinessStability === 'function') {
    const preLoadReadinessTimeoutForGate = benchmarkAdmissionSupported ?
      Math.min(
        preLoadReadinessTimeoutMs,
        BENCHMARK_PRE_LOAD_READINESS_WARMUP_TIMEOUT_MS,
      ) :
      preLoadReadinessTimeoutMs;
    try {
      await cluster.waitForLoadReadinessStability({
        stableWindowMs: preLoadReadinessStableWindowMs,
        timeoutMs: preLoadReadinessTimeoutForGate,
        noProgressMaxAttempts: preLoadReadinessNoProgressMaxAttempts,
        loadReadinessPhase: LOAD_READINESS_PHASE_PRE_LOAD,
      });
    } catch (error) {
      if (!benchmarkAdmissionSupported) {
        throw error;
      }
    }
  }

  // 2. Start sustained write load.
  const initialNodes = resolveClusterNodes(cluster);
  const rollingRestartLoadPlan = await buildRollingRestartLoadPlan(
    cluster,
    scenarioOptions,
    {
      clusterNodes: initialNodes,
      loadOpsPerSec,
      preLoadReadinessStableWindowMs,
      preLoadReadinessTimeoutMs,
    },
  );
  const availableLoadNodeIds = new Set(
    initialNodes.map((node) => String(node.id)),
  );
  const resolveLoadNodes = () => {
    const plannedNodes =
      typeof rollingRestartLoadPlan.loadNodePlan.nodeResolver === 'function' ?
        rollingRestartLoadPlan.loadNodePlan.nodeResolver() :
        rollingRestartLoadPlan.loadNodePlan.initialNodes;
    return (Array.isArray(plannedNodes) ? plannedNodes : [])
      .filter((node) => {
        const nodeId = String(node?.id || '');
        return node &&
          availableLoadNodeIds.has(nodeId) &&
          (
            typeof node.query === 'function' ||
            typeof node.queryWithTimeout === 'function'
          );
      });
  };

  const loadRun = cluster.startLoad({
    nodes: resolveLoadNodes(),
    nodeResolver: resolveLoadNodes,
    opsPerSec: rollingRestartLoadPlan.effectiveLoadOpsPerSec,
    duration: loadDuration,
    queryTimeoutMs,
    trackAcknowledgedWrites: true,
    ...(rollingRestartLoadPlan.benchmarkAdmissionEnabled ?
      {
        tableName: rollingRestartLoadPlan.tableName,
        workloadProfile: rollingRestartLoadPlan.workloadProfile,
      } :
      {}),
  });
  let loadRunCompleted = false;

  try {
    // 3. Let load stabilize before starting restarts.
    await new Promise((r) => setTimeout(r, preRestartSettleMs));

    // 4. Capture load progress before rolling restart.
    const preRestartMetrics = loadRun.getMetrics();
    const preRestartTotal = Number(preRestartMetrics?.total || ZERO);
    const preRestartSuccess = Number(preRestartMetrics?.success || ZERO);

    // 5. Restart each non-seed node one at a time.
    const nodes = resolveClusterNodes(cluster);
    const nonSeedNodes = nodes.filter((n) => n.role !== 'seed');

    for (const node of nonSeedNodes) {
      availableLoadNodeIds.delete(String(node.id));
      await cluster.restartNode(node.id, {
        readinessTimeoutMs: perRestartActiveTimeoutMs,
        requireAdminReady: ROLLING_RESTART_REQUIRE_ADMIN_READY,
      });
      availableLoadNodeIds.add(String(node.id));

      // Brief pause between restarts.
      await new Promise(
        (r) => setTimeout(r, interRestartDelayMs),
      );
    }

    // 6. Keep load running through the full rolling-restart sequence, then stop
    // it explicitly so the measured window always covers both restarts.
    await new Promise((r) => setTimeout(r, postRestartLoadSoakMs));
    if (typeof loadRun.cancel === 'function') {
      loadRun.cancel();
    }
    const metrics = await loadRun.waitComplete();
    loadRunCompleted = true;
    const acknowledgedWrites =
      typeof loadRun.getAcknowledgedWrites === 'function' ?
        loadRun.getAcknowledgedWrites() :
        null;

    await cluster.waitForConvergence(
      buildConvergenceOptions(perNodeConvergenceTimeoutMs),
    );

    // 7. Compute bounded disruption during rolling restarts.
    const restartWindowTotal = Math.max(
      ZERO,
      Number(metrics?.total || ZERO) - preRestartTotal,
    );
    const restartWindowSuccess = Math.max(
      ZERO,
      Number(metrics?.success || ZERO) - preRestartSuccess,
    );
    const restartSuccessRate = restartWindowTotal > ZERO ?
      restartWindowSuccess / restartWindowTotal :
      1;

    // 8. Ensure post-restart recovery is completely quiescent before final
    // consistency checks. Startup ACTIVE alone does not prove the load-facing
    // publication gate or in-flight priority replacement work has closed.
    await waitForPostRestartRecoveryBarrier(cluster, {
      perNodeConvergenceTimeoutMs,
      postRestartActiveTimeoutMs,
      postRestartQuietWindowMs,
      postRestartControlPlaneQuiescenceNoProgressTimeoutMs,
      postRestartLoadReadinessNoProgressMaxAttempts,
    });

    // 9. Assert final cluster consistency immediately after the guarded
    // post-restart stability window. A raw sleep here can be invalidated by
    // late recovery work that starts between the barrier and this assertion.
    await cluster.waitForConsistencyConvergence({
      timeoutMs: postRestartConsistencyTimeoutMs,
      pollIntervalMs: postRestartConsistencyPollIntervalMs,
      forceRepairAfterMs: postRestartConsistencyForceRepairAfterMs,
    });

    let acknowledgedWriteVisibility = null;
    const failureMessages = [];
    try {
      acknowledgedWriteVisibility =
        await assertAcknowledgedWritesVisibleOnReachableNodes(
          acknowledgedWrites,
          resolveClusterNodes(cluster),
        );
    } catch (error) {
      failureMessages.push(error?.message || String(error));
    }
    if (restartSuccessRate < minRestartSuccessRate) {
      failureMessages.unshift(
        'Success rate during rolling restart below threshold: ' +
        restartSuccessRate.toFixed(3) +
        ' (expected >= ' + minRestartSuccessRate + ')',
      );
    }

    assert.ok(
      failureMessages.length === ZERO,
      failureMessages.join('\n'),
    );

    return {
      loadMetrics: metrics,
      restartSuccessRate,
      restartedNodes: nonSeedNodes.map((n) => n.id),
      acknowledgedWriteVisibility,
    };
  } finally {
    if (!loadRunCompleted && typeof loadRun.cancel === 'function') {
      loadRun.cancel();
    }
    if (typeof rollingRestartLoadPlan.loadNodePlan.stop === 'function') {
      await rollingRestartLoadPlan.loadNodePlan.stop();
    }
  }
}

export {run};
