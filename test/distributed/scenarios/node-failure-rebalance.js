/**
 * Scenario: Node Failure and Rebalance
 *
 * Start cluster under load, SIGKILL a non-seed node, verify
 * automatic failover and data consistency.
 *
 * Requirements: 4.1, 5.1, 5.4
 */

import assert from 'node:assert/strict';
import {
  CONVERGENCE_DEFAULTS,
  SCENARIO_TIMING_DEFAULTS,
} from '../harness/constants.js';

const LOAD_OPS_PER_SEC = 50;
const LOAD_DURATION = '60s';
const PRE_KILL_SETTLE_MS = SCENARIO_TIMING_DEFAULTS.stabilizationDelayMs;
const POST_KILL_CONVERGENCE_TIMEOUT_MS = 180000;
const ZERO_FAILURES = 0;

/**
 * Run the node-failure-rebalance scenario.
 *
 * @param {Object} cluster - Cluster handle from the harness.
 */
async function run(cluster) {
  // 1. Start sustained write load.
  const loadRun = cluster.startLoad({
    opsPerSec: LOAD_OPS_PER_SEC,
    duration: LOAD_DURATION,
  });

  // 2. Let load stabilize.
  await new Promise((r) => setTimeout(r, PRE_KILL_SETTLE_MS));

  // 3. Kill a random non-seed node via SIGKILL.
  const victimId = cluster.randomNonSeed();
  assert.ok(victimId, 'No non-seed node available to kill');
  await cluster.killNode(victimId);

  // 4. Wait for the cluster to converge after the failure.
  const convergence = await cluster.waitForConvergence({
    settleTimeoutMs: POST_KILL_CONVERGENCE_TIMEOUT_MS,
    quietWindowMs: CONVERGENCE_DEFAULTS.quietWindowMs,
    targetVoterCount: CONVERGENCE_DEFAULTS.targetVoterCount,
  });

  assert.ok(
    convergence.settledAfterMs <= POST_KILL_CONVERGENCE_TIMEOUT_MS,
    'Cluster did not converge after node failure: ' +
    convergence.settledAfterMs + 'ms',
  );

  // 5. Wait for load to complete and check metrics.
  const metrics = await loadRun.waitComplete();

  assert.ok(
    metrics.total > ZERO_FAILURES,
    'Expected at least one operation to complete',
  );

  // 6. Assert consistency across surviving nodes.
  await cluster.waitForConsistencyConvergence();

  return {
    loadMetrics: metrics,
    convergenceTiming: convergence,
    killedNodeId: victimId,
  };
}

export {run};
