/**
 * Scenario: Sustained Write Throughput
 *
 * Start cluster, run sustained write load for extended duration,
 * measure and assert steady-state performance.
 *
 * Requirements: 6.1, 6.3
 */

import assert from 'node:assert/strict';

const LOAD_OPS_PER_SEC = 100;
const LOAD_DURATION = '120s';
const MIN_SUCCESS_RATE = 0.58;
const MIN_OPS_PER_SEC = 10;
const MAX_P99_LATENCY_MS = 10000;
const ZERO = 0;
const HUNDRED_PERCENT = 1.0;

/**
 * Run the sustained-write-throughput scenario.
 *
 * @param {Object} cluster - Cluster handle from the harness.
 */
async function run(cluster) {
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

  // 6. Assert cluster consistency after sustained load.
  await cluster.waitForConsistencyConvergence();

  return {
    loadMetrics: metrics,
    successRate,
  };
}

export {run};
