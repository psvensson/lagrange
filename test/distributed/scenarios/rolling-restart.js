/**
 * Scenario: Rolling Restart
 *
 * Start cluster under load, restart nodes one at a time,
 * verify bounded disruption during restarts.
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
const MIN_RESTART_SUCCESS_RATE = 0.63;
const ZERO = 0;

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

  // 3. Capture load progress before rolling restart.
  const preRestartMetrics = loadRun.getMetrics();
  const preRestartTotal = Number(preRestartMetrics?.total || ZERO);
  const preRestartSuccess = Number(preRestartMetrics?.success || ZERO);

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

  // 6. Verify bounded disruption during rolling restarts.
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
  assert.ok(
    restartSuccessRate >= MIN_RESTART_SUCCESS_RATE,
    'Success rate during rolling restart below threshold: ' +
    restartSuccessRate.toFixed(3) +
    ' (expected >= ' + MIN_RESTART_SUCCESS_RATE + ')',
  );

  // 7. Ensure all nodes become active again before final consistency checks.
  if (typeof cluster.waitForAllActive === 'function') {
    await cluster.waitForAllActive();
  }

  // 8. Assert final cluster consistency.
  await cluster.assertConsistency();

  return {
    loadMetrics: metrics,
    restartSuccessRate,
    restartedNodes: nonSeedNodes.map((n) => n.id),
  };
}

export {run};
