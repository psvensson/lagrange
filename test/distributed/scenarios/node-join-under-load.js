/**
 * Scenario: Node Join Under Load
 *
 * Start cluster, begin sustained write load, add a new node,
 * verify rebalancing completes within SLO.
 *
 * Requirements: 5.1, 6.1
 */

import {CONVERGENCE_DEFAULTS} from '../harness/constants.js';

const LOAD_OPS_PER_SEC = 50;
const LOAD_DURATION = '60s';
const PRE_JOIN_SETTLE_MS = 5000;
const LOAD_READINESS_STABLE_WINDOW_MS = 5000;
const LOAD_READINESS_STABILIZATION_TIMEOUT_MS = 30000;
const POST_JOIN_CONVERGENCE_TIMEOUT_MS = 60000;
const CONSISTENCY_TIMEOUT_MS = 15000;
const CONSISTENCY_POLL_INTERVAL_MS = 500;
const ZERO_FAILURES = 0;
const MAX_FAILED_OPERATIONS = 0;
const MAX_UNDISPATCHED_RATIO = 0.05;
const MAX_QUEUE_DELAY_P95_MS = 250;
const ADAPTIVE_DISPATCH_GUARDRAIL_ENABLED = true;
const ADAPTIVE_DISPATCH_GUARDRAIL_PRESSURE_SIGNAL_THRESHOLD = 2;
const ADAPTIVE_DISPATCH_GUARDRAIL_QUEUE_DEPTH_THRESHOLD = 4;
const ADAPTIVE_DISPATCH_GUARDRAIL_REDUCTION_STEP_RATIO = 0.25;
const ADAPTIVE_DISPATCH_GUARDRAIL_MIN_MAX_IN_FLIGHT = 4;
const ADAPTIVE_DISPATCH_GUARDRAIL_RECOVERY_QUIET_TICKS = 4;
const FAILURE_PHASE_CONVERGENCE = 'wait_for_convergence';
const FAILURE_PHASE_LOAD_READINESS = 'wait_for_load_readiness';
const FAILURE_PHASE_LOAD_VERIFICATION = 'verify_load';
const FAILURE_PHASE_CONSISTENCY = 'verify_consistency';

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
  if (details.controlPlaneDiagnostics &&
      typeof details.controlPlaneDiagnostics === 'object') {
    error.diagnostics.controlPlaneDiagnostics =
      details.controlPlaneDiagnostics;
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

function extractRetainedControlPlaneDiagnostics(controlPlaneDiagnostics) {
  if (!controlPlaneDiagnostics ||
      typeof controlPlaneDiagnostics !== 'object' ||
      Array.isArray(controlPlaneDiagnostics)) {
    return null;
  }
  const logsTable = controlPlaneDiagnostics.logsTable &&
    typeof controlPlaneDiagnostics.logsTable === 'object' ?
    controlPlaneDiagnostics.logsTable :
    null;
  const cdcReplay = controlPlaneDiagnostics.cdcReplay &&
    typeof controlPlaneDiagnostics.cdcReplay === 'object' ?
    controlPlaneDiagnostics.cdcReplay :
    null;
  const cdcReplayByPartitionId = controlPlaneDiagnostics.cdcReplayByPartitionId &&
    typeof controlPlaneDiagnostics.cdcReplayByPartitionId === 'object' ?
    controlPlaneDiagnostics.cdcReplayByPartitionId :
    null;
  if (!logsTable && !cdcReplay && !cdcReplayByPartitionId) {
    return null;
  }
  return {
    ...(logsTable ? {logsTable} : {}),
    ...(cdcReplay ? {cdcReplay} : {}),
    ...(cdcReplayByPartitionId ? {cdcReplayByPartitionId} : {}),
  };
}

async function captureRetainedControlPlaneDiagnostics(cluster) {
  const nodes = resolveClusterNodes(cluster);
  const seedNode = Array.isArray(nodes) && nodes.length > 0 ?
    nodes[0] :
    null;
  if (!seedNode ||
      typeof seedNode.getControlSnapshot !== 'function') {
    return null;
  }

  try {
    const snapshotResult = await seedNode.getControlSnapshot();
    const rows = Array.isArray(snapshotResult?.rows) ?
      snapshotResult.rows :
      [];
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
  const loadOpsPerSec = Number.isFinite(options.loadOpsPerSec) ?
    Number(options.loadOpsPerSec) :
    LOAD_OPS_PER_SEC;
  const loadDuration = typeof options.loadDuration === 'string' &&
    options.loadDuration.length > 0 ?
    options.loadDuration :
    LOAD_DURATION;
  const preJoinSettleMs = Number.isFinite(options.preJoinSettleMs) ?
    Number(options.preJoinSettleMs) :
    PRE_JOIN_SETTLE_MS;
  const loadReadinessStableWindowMs = Number.isFinite(
    options.loadReadinessStableWindowMs,
  ) ?
    Number(options.loadReadinessStableWindowMs) :
    LOAD_READINESS_STABLE_WINDOW_MS;
  const loadReadinessStabilizationTimeoutMs = Number.isFinite(
    options.loadReadinessStabilizationTimeoutMs,
  ) ?
    Number(options.loadReadinessStabilizationTimeoutMs) :
    LOAD_READINESS_STABILIZATION_TIMEOUT_MS;
  const postJoinConvergenceTimeoutMs = Number.isFinite(
    options.postJoinConvergenceTimeoutMs,
  ) ?
    Number(options.postJoinConvergenceTimeoutMs) :
    POST_JOIN_CONVERGENCE_TIMEOUT_MS;
  const consistencyTimeoutMs = Number.isFinite(options.consistencyTimeoutMs) ?
    Number(options.consistencyTimeoutMs) :
    CONSISTENCY_TIMEOUT_MS;
  const consistencyPollIntervalMs = Number.isFinite(
    options.consistencyPollIntervalMs,
  ) ?
    Number(options.consistencyPollIntervalMs) :
    CONSISTENCY_POLL_INTERVAL_MS;
  const maxFailedOperations = Number.isFinite(options.maxFailedOperations) ?
    Number(options.maxFailedOperations) :
    MAX_FAILED_OPERATIONS;
  const maxUndispatchedRatio = Number.isFinite(options.maxUndispatchedRatio) ?
    Number(options.maxUndispatchedRatio) :
    MAX_UNDISPATCHED_RATIO;
  const maxQueueDelayP95Ms = Number.isFinite(options.maxQueueDelayP95Ms) ?
    Number(options.maxQueueDelayP95Ms) :
    MAX_QUEUE_DELAY_P95_MS;
  const adaptiveDispatchGuardrailEnabled =
    options.adaptiveDispatchGuardrailEnabled === undefined ?
      ADAPTIVE_DISPATCH_GUARDRAIL_ENABLED :
      options.adaptiveDispatchGuardrailEnabled === true;
  const adaptiveDispatchGuardrailPressureSignalThreshold = Number.isFinite(
    options.adaptiveDispatchGuardrailPressureSignalThreshold,
  ) ?
    Number(options.adaptiveDispatchGuardrailPressureSignalThreshold) :
    ADAPTIVE_DISPATCH_GUARDRAIL_PRESSURE_SIGNAL_THRESHOLD;
  const adaptiveDispatchGuardrailQueueDepthThreshold = Number.isFinite(
    options.adaptiveDispatchGuardrailQueueDepthThreshold,
  ) ?
    Number(options.adaptiveDispatchGuardrailQueueDepthThreshold) :
    ADAPTIVE_DISPATCH_GUARDRAIL_QUEUE_DEPTH_THRESHOLD;
  const adaptiveDispatchGuardrailReductionStepRatio = Number.isFinite(
    options.adaptiveDispatchGuardrailReductionStepRatio,
  ) ?
    Number(options.adaptiveDispatchGuardrailReductionStepRatio) :
    ADAPTIVE_DISPATCH_GUARDRAIL_REDUCTION_STEP_RATIO;
  const adaptiveDispatchGuardrailMinMaxInFlight = Number.isFinite(
    options.adaptiveDispatchGuardrailMinMaxInFlight,
  ) ?
    Number(options.adaptiveDispatchGuardrailMinMaxInFlight) :
    ADAPTIVE_DISPATCH_GUARDRAIL_MIN_MAX_IN_FLIGHT;
  const adaptiveDispatchGuardrailRecoveryQuietTicks = Number.isFinite(
    options.adaptiveDispatchGuardrailRecoveryQuietTicks,
  ) ?
    Number(options.adaptiveDispatchGuardrailRecoveryQuietTicks) :
    ADAPTIVE_DISPATCH_GUARDRAIL_RECOVERY_QUIET_TICKS;

  // 1. Hold full load pressure until readiness is stable.
  if (typeof cluster.waitForLoadReadinessStability === 'function' &&
      loadReadinessStableWindowMs > ZERO_FAILURES) {
    try {
      await cluster.waitForLoadReadinessStability({
        stableWindowMs: loadReadinessStableWindowMs,
        timeoutMs: loadReadinessStabilizationTimeoutMs,
      });
    } catch (error) {
      throw buildNodeJoinFailure(
        error?.message || 'Cluster load readiness did not stabilize',
        await buildFailureDetails(cluster, {
          convergenceTiming: null,
          newNodeId: null,
          failurePhase: FAILURE_PHASE_LOAD_READINESS,
          dominantAssertion: 'load_readiness_stability',
        }),
      );
    }
  }

  // 2. Start sustained write load against the running cluster.
  const loadRun = cluster.startLoad({
    opsPerSec: loadOpsPerSec,
    duration: loadDuration,
    adaptiveDispatchGuardrail: {
      enabled: adaptiveDispatchGuardrailEnabled,
      pressureSignalThreshold:
        adaptiveDispatchGuardrailPressureSignalThreshold,
      queueDepthThreshold: adaptiveDispatchGuardrailQueueDepthThreshold,
      reductionStepRatio: adaptiveDispatchGuardrailReductionStepRatio,
      minMaxInFlight: adaptiveDispatchGuardrailMinMaxInFlight,
      recoveryQuietTicks: adaptiveDispatchGuardrailRecoveryQuietTicks,
    },
  });

  // 3. Let load stabilize before adding a node.
  await sleep(preJoinSettleMs);

  // 4. Add a new node to the cluster while load is active.
  const newNode = await cluster.addNode();
  const nodeHandles = resolveClusterNodes(cluster);
  const expectedPostJoinNodes = Math.max(
    CONVERGENCE_DEFAULTS.targetVoterCount,
    nodeHandles.length,
  );

  // 5. Wait for the cluster to converge with the new node.
  const convergence = await cluster.waitForConvergence({
    settleTimeoutMs: postJoinConvergenceTimeoutMs,
    quietWindowMs: CONVERGENCE_DEFAULTS.quietWindowMs,
    targetVoterCount: expectedPostJoinNodes,
  });

  if (convergence.settledAfterMs > postJoinConvergenceTimeoutMs) {
    throw buildNodeJoinFailure(
      'Cluster did not converge within SLO: ' +
      convergence.settledAfterMs + 'ms',
      await buildFailureDetails(cluster, {
        convergenceTiming: convergence,
        newNodeId: newNode?.id || null,
        failurePhase: FAILURE_PHASE_CONVERGENCE,
        dominantAssertion: 'convergence_timeout',
      }),
    );
  }

  // 6. Wait for load to complete and verify metrics.
  const metrics = await loadRun.waitComplete();

  if (metrics.total <= ZERO_FAILURES) {
    throw buildNodeJoinFailure(
      'Expected at least one operation to complete',
      await buildFailureDetails(cluster, {
        loadMetrics: metrics,
        convergenceTiming: convergence,
        newNodeId: newNode?.id || null,
        failurePhase: FAILURE_PHASE_LOAD_VERIFICATION,
        dominantAssertion: 'load_total_zero',
      }),
    );
  }
  if (metrics.success <= ZERO_FAILURES) {
    throw buildNodeJoinFailure(
      'Expected at least one successful operation',
      await buildFailureDetails(cluster, {
        loadMetrics: metrics,
        convergenceTiming: convergence,
        newNodeId: newNode?.id || null,
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
        newNodeId: newNode?.id || null,
        failurePhase: FAILURE_PHASE_LOAD_VERIFICATION,
        dominantAssertion: 'failed_operations',
      }),
    );
  }
  const undispatchedOperations = Number(
    metrics.undispatchedOperations || ZERO_FAILURES,
  );
  const targetOperations = Number(
    metrics.targetOperations || ZERO_FAILURES,
  );
  const undispatchedRatio = targetOperations > ZERO_FAILURES ?
    undispatchedOperations / targetOperations :
    ZERO_FAILURES;
  if (undispatchedRatio > maxUndispatchedRatio) {
    throw buildNodeJoinFailure(
      'Expected dispatch backlog to stay below ' +
      maxUndispatchedRatio +
      ' during node join: observed ' +
      undispatchedRatio,
      await buildFailureDetails(cluster, {
        loadMetrics: metrics,
        convergenceTiming: convergence,
        newNodeId: newNode?.id || null,
        failurePhase: FAILURE_PHASE_LOAD_VERIFICATION,
        dominantAssertion: 'dispatch_backlog',
      }),
    );
  }
  const queueDelayP95Ms = Number(metrics?.queueDelay?.p95 || ZERO_FAILURES);
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
        newNodeId: newNode?.id || null,
        failurePhase: FAILURE_PHASE_LOAD_VERIFICATION,
        dominantAssertion: 'queue_delay_p95',
      }),
    );
  }

  // Re-validate convergence once write load has quiesced.
  await cluster.waitForConvergence({
    settleTimeoutMs: postJoinConvergenceTimeoutMs,
    quietWindowMs: CONVERGENCE_DEFAULTS.quietWindowMs,
    targetVoterCount: expectedPostJoinNodes,
  });

  // 7. Assert cluster consistency after join + load.
  try {
    await cluster.waitForConsistencyConvergence({
      timeoutMs: consistencyTimeoutMs,
      pollIntervalMs: consistencyPollIntervalMs,
    });
  } catch (error) {
    throw buildNodeJoinFailure(
      error?.message || 'Cluster consistency convergence failed',
      await buildFailureDetails(cluster, {
        loadMetrics: metrics,
        convergenceTiming: convergence,
        newNodeId: newNode?.id || null,
        failurePhase: FAILURE_PHASE_CONSISTENCY,
        dominantAssertion: 'consistency_convergence',
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

export {run};
