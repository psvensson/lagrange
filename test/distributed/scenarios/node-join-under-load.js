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
} from '../harness/constants.js';
import {resolveScenarioOptions} from '../harness/scenario-config.js';
import {
  BENCHMARK_WORKLOAD_PROFILE,
  TABLE_BOOTSTRAP_VISIBILITY_STATE,
  ensureBenchmarkPartitioningTable,
  resolvePartitioningLoadTableName,
} from './table-distribution-helpers.js';
import {buildPriorityRecoveryObservationSnapshot} from
  '../../../src/control-plane/priority-recovery-observation-snapshot.js';
import {
  normalizePriorityPartitionSummaryForDiagnostics,
  normalizePriorityRecoveryPartitionWitnessesForDiagnostics,
} from
  '../harness/priority-recovery-summary-normalization.js';

const LOAD_OPS_PER_SEC = 50;
const LOAD_DURATION = '60s';
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
const ADMISSION_PRESSURE_DISPATCH_DEFICIT_TOLERANCE_OPERATIONS = 3;
const COMPLETE_RATIO = 1;
const FAILURE_PHASE_CONVERGENCE = 'wait_for_convergence';
const FAILURE_PHASE_LOAD_READINESS = 'wait_for_load_readiness';
const FAILURE_PHASE_LOAD_VERIFICATION = 'verify_load';
const FAILURE_PHASE_CONSISTENCY = 'verify_consistency';
const DOMINANT_ASSERTION_DISPATCH_BACKLOG = 'dispatch_backlog';
const LOAD_ROUTING_ADMISSION_ERROR_CODE = 'routing_not_ready';
const LOAD_ROUTING_ADMISSION_ERROR_MESSAGE_PREFIX = 'routing admission blocked';
const LOAD_ROUTING_ADMISSION_REASON_BENCHMARK_NOT_READY = 'benchmark_not_ready';
const DISPATCH_BACKLOG_GATE_REASON = Object.freeze({
  WITHIN_RATIO: 'within_ratio',
  ADMISSION_PRESSURE_DISPATCH_DEFICIT_TOLERATED:
    'admission_pressure_dispatch_deficit_tolerated',
  RATIO_EXCEEDED: 'ratio_exceeded',
});
const RETAINED_CONTROL_PLANE_OBJECT_KEYS = Object.freeze([
  'publicationMode',
  'publicationConvergenceGate',
  'startupRecovery',
  'heartbeatPublication',
  'readinessByNodeId',
  'activeGateProgress',
  'activeGateBestProgress',
  'activeGateNoProgress',
  'priorityRecoveryDecisionSnapshots',
  'priorityRecoveryObservation',
  'priorityRecoveryInvariants',
  'logsTable',
  'cdcReplay',
  'cdcReplayByPartitionId',
]);

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

function numberOrZeroFailures(value) {
  return Number(value || ZERO_FAILURES);
}

function resolveDispatchBacklogGateReason(
  withinRatio,
  admissionPressureDispatchDeficitTolerated,
) {
  if (withinRatio) {
    return DISPATCH_BACKLOG_GATE_REASON.WITHIN_RATIO;
  }
  return admissionPressureDispatchDeficitTolerated ?
    DISPATCH_BACKLOG_GATE_REASON
      .ADMISSION_PRESSURE_DISPATCH_DEFICIT_TOLERATED :
    DISPATCH_BACKLOG_GATE_REASON.RATIO_EXCEEDED;
}

function buildDispatchBacklogGateDecision(options) {
  const source = options && typeof options === 'object' ? options : {};
  const targetOperations = numberOrZeroFailures(source.targetOperations);
  const undispatchedOperations = numberOrZeroFailures(
    source.undispatchedOperations,
  );
  const dispatchedOperations = numberOrZeroFailures(
    source.dispatchedOperations,
  );
  const successfulOperations = numberOrZeroFailures(
    source.successfulOperations,
  );
  const maxUndispatchedRatio = numberOrZeroFailures(
    source.maxUndispatchedRatio,
  );
  const admissionPressureDominant = source.admissionPressureDominant === true;
  const undispatchedRatio =
    targetOperations > ZERO_FAILURES ?
      undispatchedOperations / targetOperations :
      ZERO_FAILURES;
  const effectiveMaxUndispatchedRatio = admissionPressureDominant ?
    Math.max(
      maxUndispatchedRatio,
      ADMISSION_PRESSURE_MAX_UNDISPATCHED_RATIO,
    ) :
    maxUndispatchedRatio;
  const requiredDispatchedOperations =
    targetOperations > ZERO_FAILURES ?
      Math.ceil(
        targetOperations * (COMPLETE_RATIO - effectiveMaxUndispatchedRatio),
      ) :
      ZERO_FAILURES;
  const dispatchDeficit = Math.max(
    ZERO_FAILURES,
    requiredDispatchedOperations - dispatchedOperations,
  );
  const withinRatio = undispatchedRatio <= effectiveMaxUndispatchedRatio;
  const admissionPressureDispatchDeficitTolerated =
    admissionPressureDominant &&
    successfulOperations > ZERO_FAILURES &&
    dispatchDeficit > ZERO_FAILURES &&
    dispatchDeficit <=
      ADMISSION_PRESSURE_DISPATCH_DEFICIT_TOLERANCE_OPERATIONS;

  return {
    passed: withinRatio || admissionPressureDispatchDeficitTolerated,
    reason: resolveDispatchBacklogGateReason(
      withinRatio,
      admissionPressureDispatchDeficitTolerated,
    ),
    undispatchedRatio,
    effectiveMaxUndispatchedRatio,
    requiredDispatchedOperations,
    dispatchDeficit,
  };
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function retainPublicationConvergenceDiagnostics(publicationConvergence) {
  if (!isRecord(publicationConvergence)) {
    return null;
  }
  const priorityPartitionSummary =
    normalizePriorityPartitionSummaryForDiagnostics(
      publicationConvergence.priorityPartitionSummary ??
        publicationConvergence.priority_partition_summary,
    );
  return {
    ...publicationConvergence,
    ...(priorityPartitionSummary ? {priorityPartitionSummary} : {}),
  };
}

function retainPublicationConvergenceGateDiagnostics(
  publicationConvergenceGate,
) {
  if (!isRecord(publicationConvergenceGate)) {
    return null;
  }
  const priorityPartitionSummary =
    normalizePriorityPartitionSummaryForDiagnostics(
      publicationConvergenceGate.priorityPartitionSummary ??
        publicationConvergenceGate.priority_partition_summary,
    );
  return {
    ...publicationConvergenceGate,
    ...(priorityPartitionSummary ? {priorityPartitionSummary} : {}),
  };
}

function retainPriorityRecoveryObservationDiagnostics(
  priorityRecoveryObservation,
) {
  if (!isRecord(priorityRecoveryObservation)) {
    return null;
  }
  const priorityRecoveryPartitionWitnesses =
    normalizePriorityRecoveryPartitionWitnessesForDiagnostics(
      priorityRecoveryObservation.priorityRecoveryPartitionWitnesses,
    );
  return {
    ...priorityRecoveryObservation,
    ...(priorityRecoveryPartitionWitnesses.length > ZERO_FAILURES ?
      {priorityRecoveryPartitionWitnesses} :
      {}),
  };
}

const SPECIAL_RETAINED_DIAGNOSTIC_KEYS = new Set([
  'publicationConvergence',
  'publicationConvergenceGate',
  'priorityRecoveryObservation',
]);

function normalizeRetainedControlPlaneDiagnostics(controlPlaneDiagnostics) {
  if (!isRecord(controlPlaneDiagnostics)) {
    return null;
  }
  const publicationConvergence = retainPublicationConvergenceDiagnostics(
    controlPlaneDiagnostics.publicationConvergence,
  );
  const publicationConvergenceGate =
    retainPublicationConvergenceGateDiagnostics(
      controlPlaneDiagnostics.publicationConvergenceGate,
    );
  const priorityRecoveryObservation =
    retainPriorityRecoveryObservationDiagnostics(
      controlPlaneDiagnostics.priorityRecoveryObservation,
    );
  const retainedDiagnostics = {
    ...(publicationConvergence ? {publicationConvergence} : {}),
    ...(publicationConvergenceGate ? {publicationConvergenceGate} : {}),
    ...(priorityRecoveryObservation ? {priorityRecoveryObservation} : {}),
  };
  for (const key of RETAINED_CONTROL_PLANE_OBJECT_KEYS) {
    if (SPECIAL_RETAINED_DIAGNOSTIC_KEYS.has(key)) {
      continue;
    }
    const value = controlPlaneDiagnostics[key];
    if (Array.isArray(value) || isRecord(value)) {
      retainedDiagnostics[key] = value;
    }
  }
  return Object.keys(retainedDiagnostics).length > ZERO_FAILURES ?
    retainedDiagnostics :
    null;
}

function mergeOptionalDiagnosticObjects(primaryValue, fallbackValue) {
  if (!primaryValue && !fallbackValue) {
    return null;
  }
  return {
    ...(fallbackValue || {}),
    ...(primaryValue || {}),
  };
}

function firstPresentDiagnosticField(primary, fallback, key) {
  return primary[key] || fallback[key] || null;
}

function mergeRetainedControlPlaneDiagnostics(primary, fallback) {
  const normalizedPrimary = normalizeRetainedControlPlaneDiagnostics(primary);
  const normalizedFallback =
    normalizeRetainedControlPlaneDiagnostics(fallback);
  if (!normalizedPrimary || !normalizedFallback) {
    return normalizedPrimary || normalizedFallback;
  }
  const mergedPublicationConvergence = mergeOptionalDiagnosticObjects(
    normalizedPrimary.publicationConvergence,
    normalizedFallback.publicationConvergence,
  );
  const mergedPublicationConvergenceGate = mergeOptionalDiagnosticObjects(
    normalizedPrimary.publicationConvergenceGate,
    normalizedFallback.publicationConvergenceGate,
  );
  return {
    ...normalizedFallback,
    ...normalizedPrimary,
    ...(mergedPublicationConvergence ?
      {publicationConvergence: mergedPublicationConvergence} :
      {}),
    ...(mergedPublicationConvergenceGate ?
      {publicationConvergenceGate: mergedPublicationConvergenceGate} :
      {}),
    priorityRecoveryObservation:
      firstPresentDiagnosticField(
        normalizedPrimary,
        normalizedFallback,
        'priorityRecoveryObservation',
      ) ||
      buildPriorityRecoveryObservationSnapshot({
        publicationConvergence: mergedPublicationConvergence,
        publicationConvergenceGate: mergedPublicationConvergenceGate,
        priorityRecoveryDecisionSnapshots: firstPresentDiagnosticField(
          normalizedPrimary,
          normalizedFallback,
          'priorityRecoveryDecisionSnapshots',
        ),
        priorityRecoveryInvariants: firstPresentDiagnosticField(
          normalizedPrimary,
          normalizedFallback,
          'priorityRecoveryInvariants',
        ),
        activeGateProgress: firstPresentDiagnosticField(
          normalizedPrimary,
          normalizedFallback,
          'activeGateProgress',
        ),
        activeGateBestProgress: firstPresentDiagnosticField(
          normalizedPrimary,
          normalizedFallback,
          'activeGateBestProgress',
        ),
        activeGateNoProgress: firstPresentDiagnosticField(
          normalizedPrimary,
          normalizedFallback,
          'activeGateNoProgress',
        ),
      }),
  };
}

function resolveBenchmarkScaledLoadOpsPerSec(
  requestedOpsPerSec,
  readyNodeCount,
  clusterNodeCount,
) {
  const normalizedRequestedOpsPerSec = Number.isFinite(requestedOpsPerSec) ?
    Math.max(1, Number(requestedOpsPerSec)) :
    LOAD_OPS_PER_SEC;
  const normalizedReadyNodeCount =
    Number.isInteger(readyNodeCount) && readyNodeCount > ZERO_FAILURES ?
      readyNodeCount :
      1;
  const normalizedClusterNodeCount =
    Number.isInteger(clusterNodeCount) && clusterNodeCount > ZERO_FAILURES ?
      clusterNodeCount :
      normalizedReadyNodeCount;
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
    typeof details.controlPlaneDiagnostics === 'object'
  ) {
    error.diagnostics.controlPlaneDiagnostics = details.controlPlaneDiagnostics;
  }
  return error;
}

function resolveClusterNodes(cluster) {
  if (typeof cluster.getNodes === 'function') {
    return cluster.getNodes();
  }
  if (typeof cluster.nodes === 'function') {
    return cluster.nodes();
  }
  return [];
}

function buildBenchmarkRoutingAdmissionBlockedError(nodeId, reasons = []) {
  const normalizedNodeId = String(nodeId || 'unknown');
  const normalizedReasons =
    Array.isArray(reasons) && reasons.length > ZERO_FAILURES ?
      reasons.map((reason) => String(reason)) :
      [LOAD_ROUTING_ADMISSION_REASON_BENCHMARK_NOT_READY];
  const error = new Error(
    LOAD_ROUTING_ADMISSION_ERROR_MESSAGE_PREFIX +
      ': node=' +
      normalizedNodeId +
      ', reasons=' +
      normalizedReasons.join('|'),
  );
  error.code = LOAD_ROUTING_ADMISSION_ERROR_CODE;
  error.nodeId = normalizedNodeId;
  error.reasons = normalizedReasons;
  return error;
}

function createBenchmarkLoadAdmissionController(cluster, options = {}) {
  const tableName =
    typeof options.tableName === 'string' ? options.tableName : '';
  const tableId = typeof options.tableId === 'string' ? options.tableId : '';
  const refreshIntervalMs = Number.isFinite(options.refreshIntervalMs) ?
    Number(options.refreshIntervalMs) :
    BENCHMARK_LOAD_ADMISSION_REFRESH_INTERVAL_MS;
  const queryTimeoutMs = Number.isFinite(options.queryTimeoutMs) ?
    Number(options.queryTimeoutMs) :
    BENCHMARK_LOAD_ADMISSION_QUERY_TIMEOUT_MS;
  const rawNodesById = new Map();
  const wrappedNodesById = new Map();
  let currentNodeIds = [];
  let admittedNodeIds = new Set(
    (Array.isArray(options.initialReadyNodes) ? options.initialReadyNodes : [])
      .map((node) => String(node?.id || ''))
      .filter((nodeId) => nodeId.length > ZERO_FAILURES),
  );
  let stopRequested = false;
  let sleepTimerId = null;
  let sleepResolve = null;

  const refreshClusterNodes = () => {
    const nodes = resolveClusterNodes(cluster);
    const nextNodeIds = [];
    for (const node of nodes) {
      if (!node || typeof node !== 'object') {
        continue;
      }
      const nodeId = String(node.id || '');
      if (nodeId.length <= ZERO_FAILURES || nextNodeIds.includes(nodeId)) {
        continue;
      }
      nextNodeIds.push(nodeId);
      rawNodesById.set(nodeId, node);
      if (!wrappedNodesById.has(nodeId)) {
        wrappedNodesById.set(nodeId, {
          id: nodeId,
          get breakerOwner() {
            return String(rawNodesById.get(nodeId)?.breakerOwner || '');
          },
          isLoadAdmissionReady() {
            return admittedNodeIds.has(nodeId);
          },
          async query(sql, params = []) {
            if (!admittedNodeIds.has(nodeId)) {
              throw buildBenchmarkRoutingAdmissionBlockedError(nodeId);
            }
            const rawNode = rawNodesById.get(nodeId);
            if (typeof rawNode?.query === 'function') {
              return rawNode.query(sql, params);
            }
            if (typeof rawNode?.queryWithTimeout === 'function') {
              return rawNode.queryWithTimeout(sql, params);
            }
            throw new Error(
              'Load node missing query method for node ' + nodeId,
            );
          },
          async queryWithTimeout(sql, params = [], queryOptions = {}) {
            if (!admittedNodeIds.has(nodeId)) {
              throw buildBenchmarkRoutingAdmissionBlockedError(nodeId);
            }
            const rawNode = rawNodesById.get(nodeId);
            if (typeof rawNode?.queryWithTimeout === 'function') {
              return rawNode.queryWithTimeout(sql, params, queryOptions);
            }
            if (typeof rawNode?.query === 'function') {
              return rawNode.query(sql, params);
            }
            throw new Error(
              'Load node missing queryWithTimeout/query method for node ' +
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
    if (typeof cluster.resolveBenchmarkReadyLoadNodes !== 'function') {
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
          .map((node) => String(node?.id || ''))
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
      if (typeof sleepResolve === 'function') {
        const resolveSleep = sleepResolve;
        sleepResolve = null;
        resolveSleep();
      }
      await monitorLoop;
    },
  };
}

function extractRetainedControlPlaneDiagnostics(controlPlaneDiagnostics) {
  return normalizeRetainedControlPlaneDiagnostics(controlPlaneDiagnostics);
}

async function captureRetainedControlPlaneDiagnostics(cluster) {
  const nodes = resolveClusterNodes(cluster);
  const seedNode = Array.isArray(nodes) && nodes.length > 0 ? nodes[0] : null;
  if (!seedNode || typeof seedNode.getControlSnapshot !== 'function') {
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
  const mergedControlPlaneDiagnostics = mergeRetainedControlPlaneDiagnostics(
    details.controlPlaneDiagnostics || null,
    controlPlaneDiagnostics,
  );
  if (!mergedControlPlaneDiagnostics) {
    return details;
  }
  return {
    ...details,
    controlPlaneDiagnostics: mergedControlPlaneDiagnostics,
  };
}

/**
 * Run the node-join-under-load scenario.
 *
 * @param {Object} cluster - Cluster handle from the harness.
 * @param {Object} [options]
 */
function resolveFiniteNumberOption(value, fallback) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function resolveNonEmptyStringOption(value, fallback) {
  return typeof value === 'string' && value.length > ZERO_FAILURES ?
    value :
    fallback;
}

function resolveNodeJoinScenarioRuntimeConfig(cluster, options = {}) {
  const scenarioOptions = resolveScenarioOptions(
    options,
    cluster,
    'nodeJoinUnderLoad',
  );
  const requestedTableName = resolveNonEmptyStringOption(
    scenarioOptions.tableName,
    '',
  );
  return {
    loadOpsPerSec: resolveFiniteNumberOption(
      scenarioOptions.loadOpsPerSec,
      LOAD_OPS_PER_SEC,
    ),
    loadDuration: resolveNonEmptyStringOption(
      scenarioOptions.loadDuration,
      LOAD_DURATION,
    ),
    preJoinSettleMs: resolveFiniteNumberOption(
      scenarioOptions.preJoinSettleMs,
      PRE_JOIN_SETTLE_MS,
    ),
    loadReadinessStableWindowMs: resolveFiniteNumberOption(
      scenarioOptions.loadReadinessStableWindowMs,
      LOAD_READINESS_STABLE_WINDOW_MS,
    ),
    loadReadinessStabilizationTimeoutMs: resolveFiniteNumberOption(
      scenarioOptions.loadReadinessStabilizationTimeoutMs,
      LOAD_READINESS_STABILIZATION_TIMEOUT_MS,
    ),
    postJoinConvergenceTimeoutMs: resolveFiniteNumberOption(
      scenarioOptions.postJoinConvergenceTimeoutMs,
      POST_JOIN_CONVERGENCE_TIMEOUT_MS,
    ),
    postJoinActiveTimeoutMs: resolveFiniteNumberOption(
      scenarioOptions.postJoinActiveTimeoutMs,
      POST_JOIN_ACTIVE_TIMEOUT_MS,
    ),
    consistencyTimeoutMs: resolveFiniteNumberOption(
      scenarioOptions.consistencyTimeoutMs,
      CONSISTENCY_TIMEOUT_MS,
    ),
    consistencyPollIntervalMs: resolveFiniteNumberOption(
      scenarioOptions.consistencyPollIntervalMs,
      CONSISTENCY_POLL_INTERVAL_MS,
    ),
    consistencyForceRepairAfterMs: resolveFiniteNumberOption(
      scenarioOptions.consistencyForceRepairAfterMs,
      CONSISTENCY_FORCE_REPAIR_AFTER_MS,
    ),
    maxFailedOperations: resolveFiniteNumberOption(
      scenarioOptions.maxFailedOperations,
      MAX_FAILED_OPERATIONS,
    ),
    maxUndispatchedRatio: resolveFiniteNumberOption(
      scenarioOptions.maxUndispatchedRatio,
      MAX_UNDISPATCHED_RATIO,
    ),
    maxQueueDelayP95Ms: resolveFiniteNumberOption(
      scenarioOptions.maxQueueDelayP95Ms,
      MAX_QUEUE_DELAY_P95_MS,
    ),
    adaptiveDispatchGuardrail: {
      enabled:
        scenarioOptions.adaptiveDispatchGuardrailEnabled === undefined ?
          ADAPTIVE_DISPATCH_GUARDRAIL_ENABLED :
          scenarioOptions.adaptiveDispatchGuardrailEnabled === true,
      pressureSignalThreshold: resolveFiniteNumberOption(
        scenarioOptions.adaptiveDispatchGuardrailPressureSignalThreshold,
        ADAPTIVE_DISPATCH_GUARDRAIL_PRESSURE_SIGNAL_THRESHOLD,
      ),
      queueDepthThreshold: resolveFiniteNumberOption(
        scenarioOptions.adaptiveDispatchGuardrailQueueDepthThreshold,
        ADAPTIVE_DISPATCH_GUARDRAIL_QUEUE_DEPTH_THRESHOLD,
      ),
      reductionStepRatio: resolveFiniteNumberOption(
        scenarioOptions.adaptiveDispatchGuardrailReductionStepRatio,
        ADAPTIVE_DISPATCH_GUARDRAIL_REDUCTION_STEP_RATIO,
      ),
      minMaxInFlight: resolveFiniteNumberOption(
        scenarioOptions.adaptiveDispatchGuardrailMinMaxInFlight,
        ADAPTIVE_DISPATCH_GUARDRAIL_MIN_MAX_IN_FLIGHT,
      ),
      recoveryQuietTicks: resolveFiniteNumberOption(
        scenarioOptions.adaptiveDispatchGuardrailRecoveryQuietTicks,
        ADAPTIVE_DISPATCH_GUARDRAIL_RECOVERY_QUIET_TICKS,
      ),
    },
    effectiveLoadTableName: resolvePartitioningLoadTableName(
      cluster,
      requestedTableName,
      {
        explicitTableName: requestedTableName.length > ZERO_FAILURES,
      },
    ),
  };
}

function resolveQueryableSeedNode(clusterNodes) {
  const rawSeedNode =
    Array.isArray(clusterNodes) && clusterNodes.length > 0 ?
      clusterNodes[0] :
      null;
  if (
    rawSeedNode &&
    typeof rawSeedNode.query !== 'function' &&
    typeof rawSeedNode.queryWithTimeout === 'function'
  ) {
    return {
      ...rawSeedNode,
      query(sql, params = []) {
        return rawSeedNode.queryWithTimeout(sql, params);
      },
    };
  }
  return rawSeedNode;
}

async function warmupNodeJoinLoadReadiness(
  cluster,
  loadReadinessStableWindowMs,
  loadReadinessStabilizationTimeoutMs,
) {
  if (
    typeof cluster.waitForLoadReadinessStability !== 'function' ||
    loadReadinessStableWindowMs <= ZERO_FAILURES
  ) {
    return;
  }
  try {
    await cluster.waitForLoadReadinessStability({
      stableWindowMs: loadReadinessStableWindowMs,
      timeoutMs: loadReadinessStabilizationTimeoutMs,
    });
  } catch (_error) {
    // Benchmark-table admission gates below remain authoritative.
  }
}

async function queryInitialBenchmarkReadyLoadNodes(
  cluster,
  effectiveLoadTableName,
  tableId,
  requiredBenchmarkReadyNodeCount,
  loadReadinessStableWindowMs,
  loadReadinessStabilizationTimeoutMs,
) {
  if (typeof cluster.waitForBenchmarkReadyLoadNodes === 'function') {
    return cluster.waitForBenchmarkReadyLoadNodes({
      tableName: effectiveLoadTableName,
      tableId,
      minNodeCount: requiredBenchmarkReadyNodeCount,
      stableWindowMs: loadReadinessStableWindowMs,
      timeoutMs: loadReadinessStabilizationTimeoutMs,
    });
  }
  if (typeof cluster.resolveBenchmarkReadyLoadNodes === 'function') {
    return cluster.resolveBenchmarkReadyLoadNodes({
      tableName: effectiveLoadTableName,
      tableId,
    });
  }
  return resolveClusterNodes(cluster);
}

async function resolveInitialNodeJoinLoadNodes({
  cluster,
  effectiveLoadTableName,
  tableId,
  requiredBenchmarkReadyNodeCount,
  loadReadinessStableWindowMs,
  loadReadinessStabilizationTimeoutMs,
}) {
  let loadNodes = null;
  let benchmarkReadyGateError = null;
  let usedUngatedLoadNodeFallback = false;
  try {
    loadNodes = await queryInitialBenchmarkReadyLoadNodes(
      cluster,
      effectiveLoadTableName,
      tableId,
      requiredBenchmarkReadyNodeCount,
      loadReadinessStableWindowMs,
      loadReadinessStabilizationTimeoutMs,
    );
  } catch (error) {
    benchmarkReadyGateError = error;
    if (typeof cluster.resolveBenchmarkReadyLoadNodes === 'function') {
      try {
        loadNodes = await cluster.resolveBenchmarkReadyLoadNodes({
          tableName: effectiveLoadTableName,
          tableId,
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
        'Expected at least one benchmark-ready load node before starting load',
      await buildFailureDetails(cluster, {
        convergenceTiming: null,
        newNodeId: null,
        failurePhase: FAILURE_PHASE_LOAD_READINESS,
        dominantAssertion: 'benchmark_load_node_selection',
      }),
    );
  }
  return {loadNodes, usedUngatedLoadNodeFallback};
}

function isAdmissionPressureDominantInMetrics(metrics) {
  const admissionSignals = numberOrZeroFailures(metrics?.admissionSignals);
  const nodeAdmissionBlockedWaits = numberOrZeroFailures(
    metrics?.waitReasons?.nodeAdmissionBlocked,
  );
  const retryableControlPlanePressureWaits = numberOrZeroFailures(
    metrics?.waitReasons?.retryableControlPlanePressure,
  );
  const nonAdmissionAttemptErrors = numberOrZeroFailures(
    metrics?.nonAdmissionAttemptErrors,
  );
  const admissionPressureSignalsPresent =
    admissionSignals > ZERO_FAILURES ||
    nodeAdmissionBlockedWaits > ZERO_FAILURES ||
    retryableControlPlanePressureWaits > ZERO_FAILURES;
  return (
    admissionPressureSignalsPresent &&
    nonAdmissionAttemptErrors <= ZERO_FAILURES
  );
}

async function verifyNodeJoinLoadMetrics({
  cluster,
  metrics,
  convergence,
  newNodeId,
  maxFailedOperations,
  maxUndispatchedRatio,
  maxQueueDelayP95Ms,
}) {
  const dispatchedOperations = numberOrZeroFailures(
    metrics?.dispatchedOperations,
  );
  const admissionPressureDominant =
    isAdmissionPressureDominantInMetrics(metrics);
  const toleratedZeroByAdmission =
    admissionPressureDominant && dispatchedOperations > ZERO_FAILURES;

  if (metrics.total <= ZERO_FAILURES && !toleratedZeroByAdmission) {
    throw buildNodeJoinFailure(
      'Expected at least one operation to complete',
      await buildFailureDetails(cluster, {
        loadMetrics: metrics,
        convergenceTiming: convergence,
        newNodeId,
        failurePhase: FAILURE_PHASE_LOAD_VERIFICATION,
        dominantAssertion: 'load_total_zero',
      }),
    );
  }
  if (metrics.success <= ZERO_FAILURES && !toleratedZeroByAdmission) {
    throw buildNodeJoinFailure(
      'Expected at least one successful operation',
      await buildFailureDetails(cluster, {
        loadMetrics: metrics,
        convergenceTiming: convergence,
        newNodeId,
        failurePhase: FAILURE_PHASE_LOAD_VERIFICATION,
        dominantAssertion: 'load_success_zero',
      }),
    );
  }
  const failedOperationCount = resolveCanonicalFailedOperationCount(metrics);
  if (failedOperationCount > maxFailedOperations) {
    throw buildNodeJoinFailure(
      'Expected no failed load operations during node join: observed ' +
        failedOperationCount,
      await buildFailureDetails(cluster, {
        loadMetrics: metrics,
        convergenceTiming: convergence,
        newNodeId,
        failurePhase: FAILURE_PHASE_LOAD_VERIFICATION,
        dominantAssertion: 'failed_operations',
      }),
    );
  }
  const dispatchBacklogGateDecision = buildDispatchBacklogGateDecision({
    targetOperations: numberOrZeroFailures(metrics.targetOperations),
    undispatchedOperations: numberOrZeroFailures(
      metrics.undispatchedOperations,
    ),
    dispatchedOperations,
    successfulOperations: metrics.success,
    maxUndispatchedRatio,
    admissionPressureDominant,
  });
  if (!dispatchBacklogGateDecision.passed) {
    throw buildNodeJoinFailure(
      'Expected dispatch backlog to stay below ' +
        dispatchBacklogGateDecision.effectiveMaxUndispatchedRatio +
        ' during node join: observed ' +
        dispatchBacklogGateDecision.undispatchedRatio,
      await buildFailureDetails(cluster, {
        loadMetrics: metrics,
        convergenceTiming: convergence,
        newNodeId,
        failurePhase: FAILURE_PHASE_LOAD_VERIFICATION,
        dominantAssertion: DOMINANT_ASSERTION_DISPATCH_BACKLOG,
      }),
    );
  }
  const queueDelayP95Ms = numberOrZeroFailures(metrics?.queueDelay?.p95);
  if (queueDelayP95Ms > maxQueueDelayP95Ms) {
    throw buildNodeJoinFailure(
      'Expected queue-delay p95 to stay below ' +
        maxQueueDelayP95Ms +
        'ms during node join: observed ' +
        queueDelayP95Ms +
        'ms',
      await buildFailureDetails(cluster, {
        loadMetrics: metrics,
        convergenceTiming: convergence,
        newNodeId,
        failurePhase: FAILURE_PHASE_LOAD_VERIFICATION,
        dominantAssertion: 'queue_delay_p95',
      }),
    );
  }
}

async function assertPostJoinQuiescedConvergence({
  cluster,
  postJoinConvergenceTimeoutMs,
  expectedPostJoinNodes,
  metrics,
  previousConvergence,
  newNodeId,
}) {
  let convergence = previousConvergence;
  try {
    convergence = await cluster.waitForConvergence({
      settleTimeoutMs: postJoinConvergenceTimeoutMs,
      quietWindowMs: CONVERGENCE_DEFAULTS.quietWindowMs,
      targetVoterCount: expectedPostJoinNodes,
    });
  } catch (error) {
    throw buildNodeJoinFailure(
      error?.message || 'Cluster did not converge within SLO',
      await buildFailureDetails(cluster, {
        loadMetrics: metrics,
        convergenceTiming: convergence,
        newNodeId,
        failurePhase: FAILURE_PHASE_CONVERGENCE,
        dominantAssertion: 'convergence_timeout',
        controlPlaneDiagnostics:
          error?.diagnostics?.controlPlaneDiagnostics || null,
      }),
    );
  }
  if (convergence.settledAfterMs > postJoinConvergenceTimeoutMs) {
    throw buildNodeJoinFailure(
      'Cluster did not converge within SLO: ' +
        convergence.settledAfterMs +
        'ms',
      await buildFailureDetails(cluster, {
        loadMetrics: metrics,
        convergenceTiming: convergence,
        newNodeId,
        failurePhase: FAILURE_PHASE_CONVERGENCE,
        dominantAssertion: 'convergence_timeout',
      }),
    );
  }
  return convergence;
}

async function verifyPostJoinClusterConsistency({
  cluster,
  config,
  metrics,
  convergence,
  newNodeId,
}) {
  try {
    if (typeof cluster.waitForAllActive === 'function') {
      try {
        await cluster.waitForAllActive({
          mode: 'load',
          timeoutMs: config.postJoinActiveTimeoutMs,
        });
      } catch (_error) {
        // Final consistency convergence remains authoritative.
      }
    }

    await cluster.waitForConsistencyConvergence({
      timeoutMs: config.consistencyTimeoutMs,
      pollIntervalMs: config.consistencyPollIntervalMs,
      forceRepairAfterMs: config.consistencyForceRepairAfterMs,
      tolerateActiveNodeSkew: true,
      maxActiveNodeSkew: 1,
      toleratePartitionSkew: true,
      maxPartitionSkew: 2,
    });
  } catch (error) {
    throw buildNodeJoinFailure(
      error?.message || 'Cluster consistency convergence failed',
      await buildFailureDetails(cluster, {
        loadMetrics: metrics,
        convergenceTiming: convergence,
        newNodeId,
        failurePhase: FAILURE_PHASE_CONSISTENCY,
        dominantAssertion: 'consistency_convergence',
        controlPlaneDiagnostics:
          error?.diagnostics?.controlPlaneDiagnostics || null,
      }),
    );
  }
}

async function ensureNodeJoinBenchmarkTable(
  seedNode,
  effectiveLoadTableName,
  clusterNodes,
) {
  if (!seedNode || typeof seedNode.query !== 'function') {
    return null;
  }
  return ensureBenchmarkPartitioningTable(seedNode, {
    tableName: effectiveLoadTableName,
    requiredBootstrapVisibilityState:
      TABLE_BOOTSTRAP_VISIBILITY_STATE.PARTITIONS_VISIBLE,
    queryNodes: clusterNodes,
  });
}

function resolveRequiredBenchmarkReadyNodeCount(clusterNodes) {
  const count = clusterNodes.length > ZERO_FAILURES ? clusterNodes.length : 1;
  return Math.max(1, Math.min(count, MIN_BENCHMARK_READY_LOAD_NODES));
}

function createOptionalBenchmarkLoadAdmissionController({
  cluster,
  supportsBenchmarkAdmissionGating,
  usedUngatedLoadNodeFallback,
  effectiveLoadTableName,
  tableId,
  loadNodes,
}) {
  if (!supportsBenchmarkAdmissionGating || usedUngatedLoadNodeFallback) {
    return null;
  }
  return createBenchmarkLoadAdmissionController(cluster, {
    tableName: effectiveLoadTableName,
    tableId,
    initialReadyNodes: loadNodes,
  });
}

async function tryWaitForPostJoinConvergence(
  cluster,
  postJoinConvergenceTimeoutMs,
  expectedPostJoinNodes,
) {
  try {
    return await cluster.waitForConvergence({
      settleTimeoutMs: postJoinConvergenceTimeoutMs,
      quietWindowMs: CONVERGENCE_DEFAULTS.quietWindowMs,
      targetVoterCount: expectedPostJoinNodes,
    });
  } catch (_error) {
    return null;
  }
}

async function stopLoadAndAdmissionController(
  loadRun,
  loadRunCompleted,
  benchmarkLoadAdmissionController,
) {
  if (!loadRunCompleted && typeof loadRun.cancel === 'function') {
    loadRun.cancel();
  }
  if (typeof benchmarkLoadAdmissionController?.stop === 'function') {
    await benchmarkLoadAdmissionController.stop();
  }
}

/**
 * Run the node-join-under-load scenario.
 *
 * @param {Object} cluster - Cluster handle from the harness.
 * @param {Object} [options]
 */
async function run(cluster, options = {}) {
  const config = resolveNodeJoinScenarioRuntimeConfig(cluster, options);
  const clusterNodes = resolveClusterNodes(cluster);
  const seedNode = resolveQueryableSeedNode(clusterNodes);

  await warmupNodeJoinLoadReadiness(
    cluster,
    config.loadReadinessStableWindowMs,
    config.loadReadinessStabilizationTimeoutMs,
  );

  const ensuredBenchmarkTable = await ensureNodeJoinBenchmarkTable(
    seedNode,
    config.effectiveLoadTableName,
    clusterNodes,
  );
  const tableId = ensuredBenchmarkTable ? ensuredBenchmarkTable.tableId : null;
  const supportsBenchmarkAdmissionGating =
    typeof cluster.waitForBenchmarkReadyLoadNodes === 'function' &&
    typeof cluster.resolveBenchmarkReadyLoadNodes === 'function';
  const {loadNodes, usedUngatedLoadNodeFallback} =
    await resolveInitialNodeJoinLoadNodes({
      cluster,
      effectiveLoadTableName: config.effectiveLoadTableName,
      tableId,
      requiredBenchmarkReadyNodeCount:
        resolveRequiredBenchmarkReadyNodeCount(clusterNodes),
      loadReadinessStableWindowMs: config.loadReadinessStableWindowMs,
      loadReadinessStabilizationTimeoutMs:
        config.loadReadinessStabilizationTimeoutMs,
    });

  const benchmarkLoadAdmissionController =
    createOptionalBenchmarkLoadAdmissionController({
      cluster,
      supportsBenchmarkAdmissionGating,
      usedUngatedLoadNodeFallback,
      effectiveLoadTableName: config.effectiveLoadTableName,
      tableId,
      loadNodes,
    });
  const dynamicLoadNodes = benchmarkLoadAdmissionController ?
    benchmarkLoadAdmissionController.getNodes() :
    loadNodes;
  const effectiveLoadOpsPerSec = supportsBenchmarkAdmissionGating ?
    resolveBenchmarkScaledLoadOpsPerSec(
      config.loadOpsPerSec,
      loadNodes.length,
      clusterNodes.length,
    ) :
    config.loadOpsPerSec;

  const loadRun = cluster.startLoad({
    nodes: dynamicLoadNodes,
    nodeResolver: benchmarkLoadAdmissionController ?
      () => benchmarkLoadAdmissionController.getNodes() :
      undefined,
    opsPerSec: effectiveLoadOpsPerSec,
    duration: config.loadDuration,
    tableName: config.effectiveLoadTableName,
    workloadProfile: BENCHMARK_WORKLOAD_PROFILE,
    adaptiveDispatchGuardrail: config.adaptiveDispatchGuardrail,
  });
  let newNodeId = null;
  let convergence = null;
  let metrics;
  let loadRunCompleted = false;
  try {
    await sleep(config.preJoinSettleMs);

    const newNode = await cluster.addNode({
      waitForActive: false,
    });
    newNodeId = newNode ? newNode.id || null : null;
    const expectedPostJoinNodes = Math.max(
      CONVERGENCE_DEFAULTS.targetVoterCount,
      resolveClusterNodes(cluster).length,
    );

    convergence = await tryWaitForPostJoinConvergence(
      cluster,
      config.postJoinConvergenceTimeoutMs,
      expectedPostJoinNodes,
    );

    metrics = await loadRun.waitComplete();
    loadRunCompleted = true;

    await verifyNodeJoinLoadMetrics({
      cluster,
      metrics,
      convergence,
      newNodeId,
      maxFailedOperations: config.maxFailedOperations,
      maxUndispatchedRatio: config.maxUndispatchedRatio,
      maxQueueDelayP95Ms: config.maxQueueDelayP95Ms,
    });

    convergence = await assertPostJoinQuiescedConvergence({
      cluster,
      postJoinConvergenceTimeoutMs: config.postJoinConvergenceTimeoutMs,
      expectedPostJoinNodes,
      metrics,
      previousConvergence: convergence,
      newNodeId,
    });
  } finally {
    await stopLoadAndAdmissionController(
      loadRun,
      loadRunCompleted,
      benchmarkLoadAdmissionController,
    );
  }

  await verifyPostJoinClusterConsistency({
    cluster,
    config,
    metrics,
    convergence,
    newNodeId,
  });

  return {
    loadMetrics: metrics,
    convergenceTiming: convergence,
    newNodeId,
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

export {run};
