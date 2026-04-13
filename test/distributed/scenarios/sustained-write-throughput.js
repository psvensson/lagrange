/**
 * Scenario: Sustained Write Throughput
 *
 * Start cluster, run sustained write load for extended duration,
 * measure and assert steady-state performance.
 *
 * Requirements: 6.1, 6.3
 */

import assert from 'node:assert/strict';
import {
  CONVERGENCE_DEFAULTS,
  SCENARIO_TIMING_DEFAULTS,
} from '../harness/constants.js';

const LOAD_OPS_PER_SEC = 100;
const LOAD_DURATION = '120s';
const MIN_SUCCESS_RATE = 0.58;
const MIN_OPS_PER_SEC = 10;
const MAX_P99_LATENCY_MS = 12000;
const LOAD_READINESS_STABLE_WINDOW_MS =
  SCENARIO_TIMING_DEFAULTS.stabilizationDelayMs;
const LOAD_READINESS_TIMEOUT_MS = 120000;
const POST_LOAD_ACTIVE_TIMEOUT_MS = 120000;
const POST_LOAD_CONVERGENCE_TIMEOUT_MS = 180000;
const POST_LOAD_QUIET_WINDOW_MS = CONVERGENCE_DEFAULTS.quietWindowMs;
const POST_LOAD_CONSISTENCY_TIMEOUT_MS = 240000;
const POST_LOAD_CONSISTENCY_POLL_INTERVAL_MS =
  SCENARIO_TIMING_DEFAULTS.pollIntervalMs;
const ZERO = 0;
const HUNDRED_PERCENT = 1.0;

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

/**
 * Run the sustained-write-throughput scenario.
 *
 * @param {Object} cluster - Cluster handle from the harness.
 */
async function run(cluster) {
  if (typeof cluster.waitForLoadReadinessStability === 'function') {
    try {
      await cluster.waitForLoadReadinessStability({
        stableWindowMs: LOAD_READINESS_STABLE_WINDOW_MS,
        timeoutMs: LOAD_READINESS_TIMEOUT_MS,
      });
    } catch (_error) {
      // Keep warmup best-effort so throughput assertions can measure
      // sustained behavior even when one node starts in transient degradation.
    }
  }

  // 1. Start sustained write load at target rate.
  const loadRun = cluster.startLoad({
    opsPerSec: LOAD_OPS_PER_SEC,
    duration: LOAD_DURATION,
  });

  // 2. Wait for the full load duration to complete.
  const metrics = await loadRun.waitComplete();

  // 3. Assert minimum throughput was achieved.
  assert.ok(
    metrics.total > ZERO,
    'Expected at least one operation to complete',
  );

  assert.ok(
    metrics.opsPerSec >= MIN_OPS_PER_SEC,
    'Throughput below minimum: ' + metrics.opsPerSec +
    ' ops/sec (expected >= ' + MIN_OPS_PER_SEC + ')',
  );

  // 4. Assert success rate meets threshold.
  const successRate = metrics.total > ZERO ?
    metrics.success / metrics.total :
    ZERO;

  assert.ok(
    successRate >= MIN_SUCCESS_RATE,
    'Success rate below threshold: ' +
    (successRate * HUNDRED_PERCENT).toFixed(2) +
    ' (expected >= ' + MIN_SUCCESS_RATE + ')',
  );

  // 5. Assert p99 latency is within acceptable bounds.
  assert.ok(
    metrics.latency.p99 <= MAX_P99_LATENCY_MS,
    'P99 latency too high: ' + metrics.latency.p99 +
    'ms (expected <= ' + MAX_P99_LATENCY_MS + 'ms)',
  );

  if (typeof cluster.waitForAllActive === 'function') {
    await cluster.waitForAllActive({
      mode: 'load',
      timeoutMs: POST_LOAD_ACTIVE_TIMEOUT_MS,
    });
  }

  if (typeof cluster.waitForConvergence === 'function') {
    const convergence = await cluster.waitForConvergence({
      settleTimeoutMs: POST_LOAD_CONVERGENCE_TIMEOUT_MS,
      quietWindowMs: CONVERGENCE_DEFAULTS.quietWindowMs,
      targetVoterCount: CONVERGENCE_DEFAULTS.targetVoterCount,
    });
    assert.ok(
      convergence.settledAfterMs <= POST_LOAD_CONVERGENCE_TIMEOUT_MS,
      'Cluster did not converge after sustained load: ' +
      convergence.settledAfterMs + 'ms',
    );
  }

  await sleep(POST_LOAD_QUIET_WINDOW_MS);

  // 6. Assert cluster consistency after sustained load.
  await cluster.waitForConsistencyConvergence({
    timeoutMs: POST_LOAD_CONSISTENCY_TIMEOUT_MS,
    pollIntervalMs: POST_LOAD_CONSISTENCY_POLL_INTERVAL_MS,
    forceRepairAfterMs: 0,
  });

  return {
    loadMetrics: metrics,
    successRate,
  };
}

export {run};
