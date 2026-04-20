/**
 * Scenario: Node Join Under Load
 *
 * Start cluster, begin sustained write load, add a new node,
 * verify rebalancing completes within SLO.
 *
 * Requirements: 5.1, 6.1
 */

import {
  CONVERGENCE_DEFAULTS,
  SCENARIO_TIMING_DEFAULTS,
} from "../harness/constants.js";
import { resolveScenarioOptions } from "../harness/scenario-config.js";
import {
  BENCHMARK_WORKLOAD_PROFILE,
  TABLE_BOOTSTRAP_VISIBILITY_STATE,
  ensureBenchmarkPartitioningTable,
  resolvePartitioningLoadTableName,
} from "./table-distribution-helpers.js";

const LOAD_OPS_PER_SEC = 50;
const LOAD_DURATION = "60s";
const PRE_JOIN_SETTLE_MS = SCENARIO_TIMING_DEFAULTS.stabilizationDelayMs;
const LOAD_READINESS_STABLE_WINDOW_MS =
  SCENARIO_TIMING_DEFAULTS.stabilizationDelayMs;
const LOAD_READINESS_STABILIZATION_TIMEOUT_MS = 30000;
const POST_JOIN_CONVERGENCE_TIMEOUT_MS = 120000;
const POST_JOIN_ACTIVE_TIMEOUT_MS = 180000;
const CONSISTENCY_TIMEOUT_MS = 240000;
const CONSISTENCY_POLL_INTERVAL_MS = 250;
const CONSISTENCY_FORCE_REPAIR_AFTER_MS = 0;
const BENCHMARK_LOAD_ADMISSION_REFRESH_INTERVAL_MS =
  SCENARIO_TIMING_DEFAULTS.pollIntervalMs;
const BENCHMARK_LOAD_ADMISSION_QUERY_TIMEOUT_MS = 1000;
const BENCHMARK_LOAD_HEADROOM_RATIO = 0.75;
const MIN_BENCHMARK_READY_LOAD_NODES = 2;
const ZERO_FAILURES = 0;
const MAX_FAILED_OPERATIONS = 0;
// Mild under-dispatch is expected once benchmark admission begins shedding
// load to preserve join stability under control-plane pressure.
const MAX_UNDISPATCHED_RATIO = 0.65;
const MAX_QUEUE_DELAY_P95_MS = 250;
const ADAPTIVE_DISPATCH_GUARDRAIL_ENABLED = true;
const ADAPTIVE_DISPATCH_GUARDRAIL_PRESSURE_SIGNAL_THRESHOLD = 2;
const ADAPTIVE_DISPATCH_GUARDRAIL_QUEUE_DEPTH_THRESHOLD = 4;
const ADAPTIVE_DISPATCH_GUARDRAIL_REDUCTION_STEP_RATIO = 0.25;
const ADAPTIVE_DISPATCH_GUARDRAIL_MIN_MAX_IN_FLIGHT = 4;
const ADAPTIVE_DISPATCH_GUARDRAIL_RECOVERY_QUIET_TICKS = 4;
const ADMISSION_PRESSURE_MAX_UNDISPATCHED_RATIO = 0.95;
const FAILURE_PHASE_CONVERGENCE = "wait_for_convergence";
const FAILURE_PHASE_LOAD_READINESS = "wait_for_load_readiness";
const FAILURE_PHASE_LOAD_VERIFICATION = "verify_load";
const FAILURE_PHASE_CONSISTENCY = "verify_consistency";
const LOAD_ROUTING_ADMISSION_ERROR_CODE = "routing_not_ready";
const LOAD_ROUTING_ADMISSION_ERROR_MESSAGE_PREFIX = "routing admission blocked";
const LOAD_ROUTING_ADMISSION_REASON_BENCHMARK_NOT_READY = "benchmark_not_ready";

function normalizeNonNegativeMetricCount(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return null;
  }
  return Math.max(ZERO_FAILURES, Math.floor(numericValue));
}

function resolveCanonicalFailedOperationCount(metrics) {
  const failedCount = normalizeNonNegativeMetricCount(metrics?.failed);
  const errorCount = normalizeNonNegativeMetricCount(metrics?.errors);
  if (failedCount !== null && errorCount !== null) {
    return Math.max(failedCount, errorCount);
  }
  if (failedCount !== null) {
    return failedCount;
  }
  if (errorCount !== null) {
    return errorCount;
  }
  return ZERO_FAILURES;
}

function resolveBenchmarkScaledLoadOpsPerSec(
  requestedOpsPerSec,
  readyNodeCount,
  clusterNodeCount,
) {
  const normalizedRequestedOpsPerSec = Number.isFinite(requestedOpsPerSec)
    ? Math.max(1, Number(requestedOpsPerSec))
    : LOAD_OPS_PER_SEC;
  const normalizedReadyNodeCount =
    Number.isInteger(readyNodeCount) && readyNodeCount > ZERO_FAILURES
      ? readyNodeCount
      : 1;
  const normalizedClusterNodeCount =
    Number.isInteger(clusterNodeCount) && clusterNodeCount > ZERO_FAILURES
      ? clusterNodeCount
      : normalizedReadyNodeCount;
  const effectiveReadyNodeBudget = Math.min(
    normalizedReadyNodeCount,
    MIN_BENCHMARK_READY_LOAD_NODES,
  );
  if (effectiveReadyNodeBudget >= normalizedClusterNodeCount) {
    return Math.max(
      1,
      Math.round(normalizedRequestedOpsPerSec * BENCHMARK_LOAD_HEADROOM_RATIO),
    );
  }
  return Math.max(
    1,
    Math.round(
      normalizedRequestedOpsPerSec *
        (effectiveReadyNodeBudget / normalizedClusterNodeCount) *
        BENCHMARK_LOAD_HEADROOM_RATIO,
    ),
  );
}

/**
 * Build a structured scenario failure for node-join-under-load diagnostics.
 * @param {string} message
 * @param {Object} details
 * @return {Error}
 */
function buildNodeJoinFailure(message, details = {}) {
  const error = new Error(message);
  error.diagnostics = {
    partialResult: {
      loadMetrics: details.loadMetrics || null,
      convergenceTiming: details.convergenceTiming || null,
      newNodeId: details.newNodeId || null,
      failurePhase: details.failurePhase || null,
      dominantAssertion: details.dominantAssertion || null,
    },
  };
  if (
    details.controlPlaneDiagnostics &&
    typeof details.controlPlaneDiagnostics === "object"
  ) {
    error.diagnostics.controlPlaneDiagnostics = details.controlPlaneDiagnostics;
  }
  return error;
}

function resolveClusterNodes(cluster) {
  if (typeof cluster.getNodes === "function") {
    return cluster.getNodes();
  }
  if (typeof cluster.nodes === "function") {
    return cluster.nodes();
  }
  return [];
}

function buildBenchmarkRoutingAdmissionBlockedError(nodeId, reasons = []) {
  const normalizedNodeId = String(nodeId || "unknown");
  const normalizedReasons =
    Array.isArray(reasons) && reasons.length > ZERO_FAILURES
      ? reasons.map((reason) => String(reason))
      : [LOAD_ROUTING_ADMISSION_REASON_BENCHMARK_NOT_READY];
  const error = new Error(
    LOAD_ROUTING_ADMISSION_ERROR_MESSAGE_PREFIX +
      ": node=" +
      normalizedNodeId +
      ", reasons=" +
      normalizedReasons.join("|"),
  );
  error.code = LOAD_ROUTING_ADMISSION_ERROR_CODE;
  error.nodeId = normalizedNodeId;
  error.reasons = normalizedReasons;
  return error;
}

function createBenchmarkLoadAdmissionController(cluster, options = {}) {
  const tableName =
    typeof options.tableName === "string" ? options.tableName : "";
  const tableId = typeof options.tableId === "string" ? options.tableId : "";
  const refreshIntervalMs = Number.isFinite(options.refreshIntervalMs)
    ? Number(options.refreshIntervalMs)
    : BENCHMARK_LOAD_ADMISSION_REFRESH_INTERVAL_MS;
  const queryTimeoutMs = Number.isFinite(options.queryTimeoutMs)
    ? Number(options.queryTimeoutMs)
    : BENCHMARK_LOAD_ADMISSION_QUERY_TIMEOUT_MS;
  const rawNodesById = new Map();
  const wrappedNodesById = new Map();
  let currentNodeIds = [];
  let admittedNodeIds = new Set(
    (Array.isArray(options.initialReadyNodes) ? options.initialReadyNodes : [])
      .map((node) => String(node?.id || ""))
      .filter((nodeId) => nodeId.length > ZERO_FAILURES),
  );
  let stopRequested = false;
  let sleepTimerId = null;
  let sleepResolve = null;

  const refreshClusterNodes = () => {
    const nodes = resolveClusterNodes(cluster);
    const nextNodeIds = [];
    for (const node of nodes) {
      if (!node || typeof node !== "object") {
        continue;
      }
      const nodeId = String(node.id || "");
      if (nodeId.length <= ZERO_FAILURES || nextNodeIds.includes(nodeId)) {
        continue;
      }
      nextNodeIds.push(nodeId);
      rawNodesById.set(nodeId, node);
      if (!wrappedNodesById.has(nodeId)) {
        wrappedNodesById.set(nodeId, {
          id: nodeId,
          get breakerOwner() {
            return String(rawNodesById.get(nodeId)?.breakerOwner || "");
          },
          isLoadAdmissionReady() {
            return admittedNodeIds.has(nodeId);
          },
          async query(sql, params = []) {
            if (!admittedNodeIds.has(nodeId)) {
              throw buildBenchmarkRoutingAdmissionBlockedError(nodeId);
            }
            const rawNode = rawNodesById.get(nodeId);
            if (typeof rawNode?.query === "function") {
              return rawNode.query(sql, params);
            }
            if (typeof rawNode?.queryWithTimeout === "function") {
              return rawNode.queryWithTimeout(sql, params);
            }
            throw new Error(
              "Load node missing query method for node " + nodeId,
            );
          },
          async queryWithTimeout(sql, params = [], queryOptions = {}) {
            if (!admittedNodeIds.has(nodeId)) {
              throw buildBenchmarkRoutingAdmissionBlockedError(nodeId);
            }
            const rawNode = rawNodesById.get(nodeId);
            if (typeof rawNode?.queryWithTimeout === "function") {
              return rawNode.queryWithTimeout(sql, params, queryOptions);
            }
            if (typeof rawNode?.query === "function") {
              return rawNode.query(sql, params);
            }
            throw new Error(
              "Load node missing queryWithTimeout/query method for node " +
                nodeId,
            );
          },
        });
      }
    }
    currentNodeIds = nextNodeIds;
  };

  const waitForNextRefresh = () =>
    new Promise((resolve) => {
      sleepResolve = resolve;
      sleepTimerId = setTimeout(() => {
        sleepTimerId = null;
        sleepResolve = null;
        resolve();
      }, refreshIntervalMs);
    });

  const refreshAdmission = async () => {
    refreshClusterNodes();
    if (typeof cluster.resolveBenchmarkReadyLoadNodes !== "function") {
      return;
    }
    try {
      const readyNodes = await cluster.resolveBenchmarkReadyLoadNodes({
        tableName,
        tableId,
        timeoutMs: queryTimeoutMs,
      });
      admittedNodeIds = new Set(
        (Array.isArray(readyNodes) ? readyNodes : [])
          .map((node) => String(node?.id || ""))
          .filter((nodeId) => nodeId.length > ZERO_FAILURES),
      );
    } catch (_error) {
      admittedNodeIds = new Set();
    }
  };

  refreshClusterNodes();
  const monitorLoop = (async () => {
    while (!stopRequested) {
      await refreshAdmission();
      if (stopRequested) {
        break;
      }
      await waitForNextRefresh();
    }
  })();

  return {
    getNodes() {
      refreshClusterNodes();
      return currentNodeIds
        .map((nodeId) => wrappedNodesById.get(nodeId))
        .filter(Boolean);
    },
    async stop() {
      stopRequested = true;
      if (sleepTimerId !== null) {
        clearTimeout(sleepTimerId);
        sleepTimerId = null;
      }
      if (typeof sleepResolve === "function") {
        const resolveSleep = sleepResolve;
        sleepResolve = null;
        resolveSleep();
      }
      await monitorLoop;
    },
  };
}

function extractRetainedControlPlaneDiagnostics(controlPlaneDiagnostics) {
  if (
    !controlPlaneDiagnostics ||
    typeof controlPlaneDiagnostics !== "object" ||
    Array.isArray(controlPlaneDiagnostics)
  ) {
    return null;
  }
  const publicationConvergence =
    controlPlaneDiagnostics.publicationConvergence &&
    typeof controlPlaneDiagnostics.publicationConvergence === "object"
      ? controlPlaneDiagnostics.publicationConvergence
      : null;
  const logsTable =
    controlPlaneDiagnostics.logsTable &&
    typeof controlPlaneDiagnostics.logsTable === "object"
      ? controlPlaneDiagnostics.logsTable
      : null;
  const cdcReplay =
    controlPlaneDiagnostics.cdcReplay &&
    typeof controlPlaneDiagnostics.cdcReplay === "object"
      ? controlPlaneDiagnostics.cdcReplay
      : null;
  const cdcReplayByPartitionId =
    controlPlaneDiagnostics.cdcReplayByPartitionId &&
    typeof controlPlaneDiagnostics.cdcReplayByPartitionId === "object"
      ? controlPlaneDiagnostics.cdcReplayByPartitionId
      : null;
  const retainedPublicationConvergence = publicationConvergence
    ? {
        publicationEpoch: Number.isFinite(
          publicationConvergence.publicationEpoch,
        )
          ? publicationConvergence.publicationEpoch
          : null,
        publicationStatus:
          typeof publicationConvergence.publicationStatus === "string"
            ? publicationConvergence.publicationStatus
            : typeof publicationConvergence.status === "string"
              ? publicationConvergence.status
              : null,
        publishedActiveNodeIds: Array.isArray(
          publicationConvergence.publishedActiveNodeIds,
        )
          ? publicationConvergence.publishedActiveNodeIds
          : [],
        pendingAckNodeIds: Array.isArray(
          publicationConvergence.pendingAckNodeIds,
        )
          ? publicationConvergence.pendingAckNodeIds
          : [],
        recoveryProtocolState:
          typeof publicationConvergence.recoveryProtocolState === "string"
            ? publicationConvergence.recoveryProtocolState
            : null,
        priorityRecoveryReasonCodes: Array.isArray(
          publicationConvergence.priorityRecoveryReasonCodes,
        )
          ? publicationConvergence.priorityRecoveryReasonCodes
          : [],
        priorityPartitionSummary:
          publicationConvergence.priorityPartitionSummary &&
          typeof publicationConvergence.priorityPartitionSummary === "object"
            ? publicationConvergence.priorityPartitionSummary
            : null,
      }
    : null;
  if (
    !logsTable &&
    !cdcReplay &&
    !cdcReplayByPartitionId &&
    !retainedPublicationConvergence
  ) {
    return null;
  }
  return {
    ...(retainedPublicationConvergence
      ? { publicationConvergence: retainedPublicationConvergence }
      : {}),
    ...(logsTable ? { logsTable } : {}),
    ...(cdcReplay ? { cdcReplay } : {}),
    ...(cdcReplayByPartitionId ? { cdcReplayByPartitionId } : {}),
  };
}

async function captureRetainedControlPlaneDiagnostics(cluster) {
  const nodes = resolveClusterNodes(cluster);
  const seedNode = Array.isArray(nodes) && nodes.length > 0 ? nodes[0] : null;
  if (!seedNode || typeof seedNode.getControlSnapshot !== "function") {
    return null;
  }

  try {
    const snapshotResult = await seedNode.getControlSnapshot();
    const rows = Array.isArray(snapshotResult?.rows) ? snapshotResult.rows : [];
    if (rows.length === 0) {
      return null;
    }
    return extractRetainedControlPlaneDiagnostics(
      rows[0]?.controlPlaneDiagnostics || null,
    );
  } catch (_error) {
    return null;
  }
}

async function buildFailureDetails(cluster, details) {
  const controlPlaneDiagnostics =
    await captureRetainedControlPlaneDiagnostics(cluster);
  if (!controlPlaneDiagnostics) {
    return details;
  }
  return {
    ...details,
    controlPlaneDiagnostics,
  };
}

/**
 * Run the node-join-under-load scenario.
 *
 * @param {Object} cluster - Cluster handle from the harness.
 * @param {Object} [options]
 */
async function run(cluster, options = {}) {
  const scenarioOptions = resolveScenarioOptions(
    options,
    cluster,
    "nodeJoinUnderLoad",
  );
  const loadOpsPerSec = Number.isFinite(scenarioOptions.loadOpsPerSec)
    ? Number(scenarioOptions.loadOpsPerSec)
    : LOAD_OPS_PER_SEC;
  const loadDuration =
    typeof scenarioOptions.loadDuration === "string" &&
    scenarioOptions.loadDuration.length > 0
      ? scenarioOptions.loadDuration
      : LOAD_DURATION;
  const preJoinSettleMs = Number.isFinite(scenarioOptions.preJoinSettleMs)
    ? Number(scenarioOptions.preJoinSettleMs)
    : PRE_JOIN_SETTLE_MS;
  const loadReadinessStableWindowMs = Number.isFinite(
    scenarioOptions.loadReadinessStableWindowMs,
  )
    ? Number(scenarioOptions.loadReadinessStableWindowMs)
    : LOAD_READINESS_STABLE_WINDOW_MS;
  const loadReadinessStabilizationTimeoutMs = Number.isFinite(
    scenarioOptions.loadReadinessStabilizationTimeoutMs,
  )
    ? Number(scenarioOptions.loadReadinessStabilizationTimeoutMs)
    : LOAD_READINESS_STABILIZATION_TIMEOUT_MS;
  const postJoinConvergenceTimeoutMs = Number.isFinite(
    scenarioOptions.postJoinConvergenceTimeoutMs,
  )
    ? Number(scenarioOptions.postJoinConvergenceTimeoutMs)
    : POST_JOIN_CONVERGENCE_TIMEOUT_MS;
  const postJoinActiveTimeoutMs = Number.isFinite(
    scenarioOptions.postJoinActiveTimeoutMs,
  )
    ? Number(scenarioOptions.postJoinActiveTimeoutMs)
    : POST_JOIN_ACTIVE_TIMEOUT_MS;
  const consistencyTimeoutMs = Number.isFinite(
    scenarioOptions.consistencyTimeoutMs,
  )
    ? Number(scenarioOptions.consistencyTimeoutMs)
    : CONSISTENCY_TIMEOUT_MS;
  const consistencyPollIntervalMs = Number.isFinite(
    scenarioOptions.consistencyPollIntervalMs,
  )
    ? Number(scenarioOptions.consistencyPollIntervalMs)
    : CONSISTENCY_POLL_INTERVAL_MS;
  const consistencyForceRepairAfterMs = Number.isFinite(
    scenarioOptions.consistencyForceRepairAfterMs,
  )
    ? Number(scenarioOptions.consistencyForceRepairAfterMs)
    : CONSISTENCY_FORCE_REPAIR_AFTER_MS;
  const maxFailedOperations = Number.isFinite(
    scenarioOptions.maxFailedOperations,
  )
    ? Number(scenarioOptions.maxFailedOperations)
    : MAX_FAILED_OPERATIONS;
  const maxUndispatchedRatio = Number.isFinite(
    scenarioOptions.maxUndispatchedRatio,
  )
    ? Number(scenarioOptions.maxUndispatchedRatio)
    : MAX_UNDISPATCHED_RATIO;
  const maxQueueDelayP95Ms = Number.isFinite(scenarioOptions.maxQueueDelayP95Ms)
    ? Number(scenarioOptions.maxQueueDelayP95Ms)
    : MAX_QUEUE_DELAY_P95_MS;
  const adaptiveDispatchGuardrailEnabled =
    scenarioOptions.adaptiveDispatchGuardrailEnabled === undefined
      ? ADAPTIVE_DISPATCH_GUARDRAIL_ENABLED
      : scenarioOptions.adaptiveDispatchGuardrailEnabled === true;
  const adaptiveDispatchGuardrailPressureSignalThreshold = Number.isFinite(
    scenarioOptions.adaptiveDispatchGuardrailPressureSignalThreshold,
  )
    ? Number(scenarioOptions.adaptiveDispatchGuardrailPressureSignalThreshold)
    : ADAPTIVE_DISPATCH_GUARDRAIL_PRESSURE_SIGNAL_THRESHOLD;
  const adaptiveDispatchGuardrailQueueDepthThreshold = Number.isFinite(
    scenarioOptions.adaptiveDispatchGuardrailQueueDepthThreshold,
  )
    ? Number(scenarioOptions.adaptiveDispatchGuardrailQueueDepthThreshold)
    : ADAPTIVE_DISPATCH_GUARDRAIL_QUEUE_DEPTH_THRESHOLD;
  const adaptiveDispatchGuardrailReductionStepRatio = Number.isFinite(
    scenarioOptions.adaptiveDispatchGuardrailReductionStepRatio,
  )
    ? Number(scenarioOptions.adaptiveDispatchGuardrailReductionStepRatio)
    : ADAPTIVE_DISPATCH_GUARDRAIL_REDUCTION_STEP_RATIO;
  const adaptiveDispatchGuardrailMinMaxInFlight = Number.isFinite(
    scenarioOptions.adaptiveDispatchGuardrailMinMaxInFlight,
  )
    ? Number(scenarioOptions.adaptiveDispatchGuardrailMinMaxInFlight)
    : ADAPTIVE_DISPATCH_GUARDRAIL_MIN_MAX_IN_FLIGHT;
  const adaptiveDispatchGuardrailRecoveryQuietTicks = Number.isFinite(
    scenarioOptions.adaptiveDispatchGuardrailRecoveryQuietTicks,
  )
    ? Number(scenarioOptions.adaptiveDispatchGuardrailRecoveryQuietTicks)
    : ADAPTIVE_DISPATCH_GUARDRAIL_RECOVERY_QUIET_TICKS;
  const requestedTableName =
    typeof scenarioOptions.tableName === "string" &&
    scenarioOptions.tableName.length > ZERO_FAILURES
      ? scenarioOptions.tableName
      : "";
  const effectiveLoadTableName = resolvePartitioningLoadTableName(
    cluster,
    requestedTableName,
    {
      explicitTableName: requestedTableName.length > ZERO_FAILURES,
    },
  );
  const clusterNodes = resolveClusterNodes(cluster);
  const rawSeedNode =
    Array.isArray(clusterNodes) && clusterNodes.length > 0
      ? clusterNodes[0]
      : null;
  const seedNode =
    rawSeedNode &&
    typeof rawSeedNode.query !== "function" &&
    typeof rawSeedNode.queryWithTimeout === "function"
      ? {
          ...rawSeedNode,
          query(sql, params = []) {
            return rawSeedNode.queryWithTimeout(sql, params);
          },
        }
      : rawSeedNode;

  // 1. Wait for load-readiness stability before creating benchmark table
  // metadata. This avoids snapshotting table IDs while initial partition
  // provisioning is still blocked by startup placement gates.
  if (
    typeof cluster.waitForLoadReadinessStability === "function" &&
    loadReadinessStableWindowMs > ZERO_FAILURES
  ) {
    try {
      await cluster.waitForLoadReadinessStability({
        stableWindowMs: loadReadinessStableWindowMs,
        timeoutMs: loadReadinessStabilizationTimeoutMs,
      });
    } catch (_error) {
      // Benchmark-table admission gates below remain authoritative. Keep this
      // warm-up as best-effort so transient publication convergence windows
      // do not fail the scenario before table-local readiness can be evaluated.
    }
  }

  // 2. Prepare a benchmark-safe workload table up front so the scenario does
  // not compete with control-plane `logs` ingestion under join pressure.
  let ensuredBenchmarkTable = null;
  if (seedNode && typeof seedNode.query === "function") {
    ensuredBenchmarkTable = await ensureBenchmarkPartitioningTable(seedNode, {
      tableName: effectiveLoadTableName,
      requiredBootstrapVisibilityState:
        TABLE_BOOTSTRAP_VISIBILITY_STATE.PARTITIONS_VISIBLE,
      queryNodes: clusterNodes,
    });
  }

  const requiredBenchmarkReadyNodeCount = Math.max(
    1,
    Math.min(
      clusterNodes.length > ZERO_FAILURES ? clusterNodes.length : 1,
      MIN_BENCHMARK_READY_LOAD_NODES,
    ),
  );
  const supportsBenchmarkAdmissionGating =
    typeof cluster.waitForBenchmarkReadyLoadNodes === "function" &&
    typeof cluster.resolveBenchmarkReadyLoadNodes === "function";
  let loadNodes = null;
  let benchmarkReadyGateError = null;
  let usedUngatedLoadNodeFallback = false;
  try {
    loadNodes =
      typeof cluster.waitForBenchmarkReadyLoadNodes === "function"
        ? await cluster.waitForBenchmarkReadyLoadNodes({
            tableName: effectiveLoadTableName,
            tableId: ensuredBenchmarkTable?.tableId,
            minNodeCount: requiredBenchmarkReadyNodeCount,
            stableWindowMs: loadReadinessStableWindowMs,
            timeoutMs: loadReadinessStabilizationTimeoutMs,
          })
        : typeof cluster.resolveBenchmarkReadyLoadNodes === "function"
          ? await cluster.resolveBenchmarkReadyLoadNodes({
              tableName: effectiveLoadTableName,
              tableId: ensuredBenchmarkTable?.tableId,
            })
          : resolveClusterNodes(cluster);
  } catch (error) {
    benchmarkReadyGateError = error;
    if (typeof cluster.resolveBenchmarkReadyLoadNodes === "function") {
      try {
        loadNodes = await cluster.resolveBenchmarkReadyLoadNodes({
          tableName: effectiveLoadTableName,
          tableId: ensuredBenchmarkTable?.tableId,
        });
      } catch (_fallbackError) {
        loadNodes = null;
      }
    }
    if (!Array.isArray(loadNodes) || loadNodes.length <= ZERO_FAILURES) {
      loadNodes = resolveClusterNodes(cluster).slice(0, 1);
      usedUngatedLoadNodeFallback = true;
    }
  }
  if (!Array.isArray(loadNodes) || loadNodes.length <= ZERO_FAILURES) {
    throw buildNodeJoinFailure(
      benchmarkReadyGateError?.message ||
        "Expected at least one benchmark-ready load node before starting load",
      await buildFailureDetails(cluster, {
        convergenceTiming: null,
        newNodeId: null,
        failurePhase: FAILURE_PHASE_LOAD_READINESS,
        dominantAssertion: "benchmark_load_node_selection",
      }),
    );
  }

  const benchmarkLoadAdmissionController =
    supportsBenchmarkAdmissionGating && !usedUngatedLoadNodeFallback
      ? createBenchmarkLoadAdmissionController(cluster, {
          tableName: effectiveLoadTableName,
          tableId: ensuredBenchmarkTable?.tableId,
          initialReadyNodes: loadNodes,
        })
      : null;
  const dynamicLoadNodes = benchmarkLoadAdmissionController
    ? benchmarkLoadAdmissionController.getNodes()
    : loadNodes;
  const effectiveLoadOpsPerSec = supportsBenchmarkAdmissionGating
    ? resolveBenchmarkScaledLoadOpsPerSec(
        loadOpsPerSec,
        loadNodes.length,
        clusterNodes.length,
      )
    : loadOpsPerSec;

  // 3. Start sustained write load against the running cluster.
  const loadRun = cluster.startLoad({
    nodes: dynamicLoadNodes,
    nodeResolver: benchmarkLoadAdmissionController
      ? () => benchmarkLoadAdmissionController.getNodes()
      : undefined,
    opsPerSec: effectiveLoadOpsPerSec,
    duration: loadDuration,
    tableName: effectiveLoadTableName,
    workloadProfile: BENCHMARK_WORKLOAD_PROFILE,
    adaptiveDispatchGuardrail: {
      enabled: adaptiveDispatchGuardrailEnabled,
      pressureSignalThreshold: adaptiveDispatchGuardrailPressureSignalThreshold,
      queueDepthThreshold: adaptiveDispatchGuardrailQueueDepthThreshold,
      reductionStepRatio: adaptiveDispatchGuardrailReductionStepRatio,
      minMaxInFlight: adaptiveDispatchGuardrailMinMaxInFlight,
      recoveryQuietTicks: adaptiveDispatchGuardrailRecoveryQuietTicks,
    },
  });
  let newNode = null;
  let convergence = null;
  let metrics;
  let loadRunCompleted = false;
  try {
    // 4. Let load stabilize before adding a node.
    await sleep(preJoinSettleMs);

    // 5. Add a new node to the cluster while load is active.
    newNode = await cluster.addNode({
      waitForActive: false,
    });
    const nodeHandles = resolveClusterNodes(cluster);
    const expectedPostJoinNodes = Math.max(
      CONVERGENCE_DEFAULTS.targetVoterCount,
      nodeHandles.length,
    );

    // 6. Wait for the cluster to converge with the new node.
    try {
      convergence = await cluster.waitForConvergence({
        settleTimeoutMs: postJoinConvergenceTimeoutMs,
        quietWindowMs: CONVERGENCE_DEFAULTS.quietWindowMs,
        targetVoterCount: expectedPostJoinNodes,
      });
    } catch (_error) {
      // Under sustained write pressure, replica operations can remain in-flight
      // longer than the active load window. Re-assert convergence strictly
      // after load completes.
      convergence = null;
    }

    // 7. Wait for load to complete and verify metrics.
    metrics = await loadRun.waitComplete();
    loadRunCompleted = true;

    const admissionSignals = Number(metrics?.admissionSignals || ZERO_FAILURES);
    const nodeAdmissionBlockedWaits = Number(
      metrics?.waitReasons?.nodeAdmissionBlocked || ZERO_FAILURES,
    );
    const retryableControlPlanePressureWaits = Number(
      metrics?.waitReasons?.retryableControlPlanePressure || ZERO_FAILURES,
    );
    const nonAdmissionAttemptErrors = Number(
      metrics?.nonAdmissionAttemptErrors || ZERO_FAILURES,
    );
    const dispatchedOperations = Number(
      metrics?.dispatchedOperations || ZERO_FAILURES,
    );
    const admissionPressureSignalsPresent =
      admissionSignals > ZERO_FAILURES ||
      nodeAdmissionBlockedWaits > ZERO_FAILURES ||
      retryableControlPlanePressureWaits > ZERO_FAILURES;
    const admissionPressureDominant =
      admissionPressureSignalsPresent &&
      nonAdmissionAttemptErrors <= ZERO_FAILURES;

    if (
      metrics.total <= ZERO_FAILURES &&
      !(admissionPressureDominant && dispatchedOperations > ZERO_FAILURES)
    ) {
      throw buildNodeJoinFailure(
        "Expected at least one operation to complete",
        await buildFailureDetails(cluster, {
          loadMetrics: metrics,
          convergenceTiming: convergence,
          newNodeId: newNode?.id || null,
          failurePhase: FAILURE_PHASE_LOAD_VERIFICATION,
          dominantAssertion: "load_total_zero",
        }),
      );
    }
    if (
      metrics.success <= ZERO_FAILURES &&
      !(admissionPressureDominant && dispatchedOperations > ZERO_FAILURES)
    ) {
      throw buildNodeJoinFailure(
        "Expected at least one successful operation",
        await buildFailureDetails(cluster, {
          loadMetrics: metrics,
          convergenceTiming: convergence,
          newNodeId: newNode?.id || null,
          failurePhase: FAILURE_PHASE_LOAD_VERIFICATION,
          dominantAssertion: "load_success_zero",
        }),
      );
    }
    const failedOperationCount = resolveCanonicalFailedOperationCount(metrics);
    if (failedOperationCount > maxFailedOperations) {
      throw buildNodeJoinFailure(
        "Expected no failed load operations during node join: observed " +
          failedOperationCount,
        await buildFailureDetails(cluster, {
          loadMetrics: metrics,
          convergenceTiming: convergence,
          newNodeId: newNode?.id || null,
          failurePhase: FAILURE_PHASE_LOAD_VERIFICATION,
          dominantAssertion: "failed_operations",
        }),
      );
    }
    const undispatchedOperations = Number(
      metrics.undispatchedOperations || ZERO_FAILURES,
    );
    const targetOperations = Number(metrics.targetOperations || ZERO_FAILURES);
    const undispatchedRatio =
      targetOperations > ZERO_FAILURES
        ? undispatchedOperations / targetOperations
        : ZERO_FAILURES;
    const effectiveMaxUndispatchedRatio = admissionPressureDominant
      ? Math.max(
          maxUndispatchedRatio,
          ADMISSION_PRESSURE_MAX_UNDISPATCHED_RATIO,
        )
      : maxUndispatchedRatio;
    if (undispatchedRatio > effectiveMaxUndispatchedRatio) {
      throw buildNodeJoinFailure(
        "Expected dispatch backlog to stay below " +
          effectiveMaxUndispatchedRatio +
          " during node join: observed " +
          undispatchedRatio,
        await buildFailureDetails(cluster, {
          loadMetrics: metrics,
          convergenceTiming: convergence,
          newNodeId: newNode?.id || null,
          failurePhase: FAILURE_PHASE_LOAD_VERIFICATION,
          dominantAssertion: "dispatch_backlog",
        }),
      );
    }
    const queueDelayP95Ms = Number(metrics?.queueDelay?.p95 || ZERO_FAILURES);
    if (queueDelayP95Ms > maxQueueDelayP95Ms) {
      throw buildNodeJoinFailure(
        "Expected queue-delay p95 to stay below " +
          maxQueueDelayP95Ms +
          "ms during node join: observed " +
          queueDelayP95Ms +
          "ms",
        await buildFailureDetails(cluster, {
          loadMetrics: metrics,
          convergenceTiming: convergence,
          newNodeId: newNode?.id || null,
          failurePhase: FAILURE_PHASE_LOAD_VERIFICATION,
          dominantAssertion: "queue_delay_p95",
        }),
      );
    }

    // Re-validate convergence once write load has quiesced.
    try {
      convergence = await cluster.waitForConvergence({
        settleTimeoutMs: postJoinConvergenceTimeoutMs,
        quietWindowMs: CONVERGENCE_DEFAULTS.quietWindowMs,
        targetVoterCount: expectedPostJoinNodes,
      });
    } catch (error) {
      throw buildNodeJoinFailure(
        error?.message || "Cluster did not converge within SLO",
        await buildFailureDetails(cluster, {
          loadMetrics: metrics,
          convergenceTiming: convergence,
          newNodeId: newNode?.id || null,
          failurePhase: FAILURE_PHASE_CONVERGENCE,
          dominantAssertion: "convergence_timeout",
        }),
      );
    }

    if (convergence.settledAfterMs > postJoinConvergenceTimeoutMs) {
      throw buildNodeJoinFailure(
        "Cluster did not converge within SLO: " +
          convergence.settledAfterMs +
          "ms",
        await buildFailureDetails(cluster, {
          loadMetrics: metrics,
          convergenceTiming: convergence,
          newNodeId: newNode?.id || null,
          failurePhase: FAILURE_PHASE_CONVERGENCE,
          dominantAssertion: "convergence_timeout",
        }),
      );
    }
  } finally {
    if (!loadRunCompleted && typeof loadRun.cancel === "function") {
      loadRun.cancel();
    }
    if (
      benchmarkLoadAdmissionController &&
      typeof benchmarkLoadAdmissionController.stop === "function"
    ) {
      await benchmarkLoadAdmissionController.stop();
    }
  }

  // 8. Assert cluster consistency after join + load.
  try {
    if (typeof cluster.waitForAllActive === "function") {
      try {
        await cluster.waitForAllActive({
          mode: "load",
          timeoutMs: postJoinActiveTimeoutMs,
        });
      } catch (_error) {
        // Keep this gate best-effort. Final consistency convergence remains
        // authoritative and tolerates transient publication lag.
      }
    }

    await cluster.waitForConsistencyConvergence({
      timeoutMs: consistencyTimeoutMs,
      pollIntervalMs: consistencyPollIntervalMs,
      forceRepairAfterMs: consistencyForceRepairAfterMs,
      tolerateActiveNodeSkew: true,
      maxActiveNodeSkew: 1,
      toleratePartitionSkew: true,
      maxPartitionSkew: 2,
    });
  } catch (error) {
    throw buildNodeJoinFailure(
      error?.message || "Cluster consistency convergence failed",
      await buildFailureDetails(cluster, {
        loadMetrics: metrics,
        convergenceTiming: convergence,
        newNodeId: newNode?.id || null,
        failurePhase: FAILURE_PHASE_CONSISTENCY,
        dominantAssertion: "consistency_convergence",
      }),
    );
  }

  return {
    loadMetrics: metrics,
    convergenceTiming: convergence,
    newNodeId: newNode?.id || null,
  };
}

/**
 * Sleep helper.
 * @param {number} delayMs
 * @return {Promise<void>}
 */
function sleep(delayMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

export { run };
