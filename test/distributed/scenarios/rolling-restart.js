/**
 * Scenario: Rolling Restart
 *
 * Start cluster under load, restart nodes one at a time,
 * verify zero errors during restarts.
 *
 * Requirements: 4.4, 6.1
 */

import assert from 'node:assert/strict';
import {CONVERGENCE_DEFAULTS} from '../harness/constants.js';

const LOAD_OPS_PER_SEC = 50;
const LOAD_DURATION = '120s';
const PRE_RESTART_SETTLE_MS = 5000;
const PER_NODE_CONVERGENCE_TIMEOUT_MS = 30000;
const INTER_RESTART_DELAY_MS = 2000;
const ZERO_ERRORS = 0;

/**
 * Run the rolling-restart scenario.
 *
 * @param {Object} cluster - Cluster handle from the harness.
 */
async function run(cluster) {
  // 1. Start sustained write load.
  const loadRun = cluster.startLoad({
    opsPerSec: LOAD_OPS_PER_SEC,
    duration: LOAD_DURATION,
  });

  // 2. Let load stabilize before starting restarts.
  await new Promise((r) => setTimeout(r, PRE_RESTART_SETTLE_MS));

  // 3. Capture error count before rolling restart.
  const preRestartMetrics = loadRun.getMetrics();
  const preRestartErrors = preRestartMetrics.failed;

  // 4. Restart each non-seed node one at a time.
  const nodes = cluster.getNodes();
  const nonSeedNodes = nodes.filter((n) => n.role !== 'seed');

  for (const node of nonSeedNodes) {
    await cluster.restartNode(node.id);

    // Wait for convergence after each restart.
    await cluster.waitForConvergence({
      settleTimeoutMs: PER_NODE_CONVERGENCE_TIMEOUT_MS,
      quietWindowMs: CONVERGENCE_DEFAULTS.quietWindowMs,
      targetVoterCount: CONVERGENCE_DEFAULTS.targetVoterCount,
    });

    // Brief pause between restarts.
    await new Promise(
      (r) => setTimeout(r, INTER_RESTART_DELAY_MS),
    );
  }

  // 5. Wait for load to complete.
  const metrics = await loadRun.waitComplete();

  // 6. Verify zero additional failures during restarts.
  const restartFailures = metrics.failed - preRestartErrors;
  assert.equal(
    restartFailures,
    ZERO_ERRORS,
    'Expected zero failures during rolling restart, got ' +
    restartFailures,
  );

  // 7. Assert final cluster consistency.
  await cluster.assertConsistency();

  return {
    loadMetrics: metrics,
    restartedNodes: nonSeedNodes.map((n) => n.id),
  };
}

export {run};
