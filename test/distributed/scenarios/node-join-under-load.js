/**
 * Scenario: Node Join Under Load
 *
 * Start cluster, begin sustained write load, add a new node,
 * verify rebalancing completes within SLO.
 *
 * Requirements: 5.1, 6.1
 */

import assert from 'node:assert/strict';
import {TIMEOUTS, CONVERGENCE_DEFAULTS} from '../harness/constants.js';

const LOAD_OPS_PER_SEC = 50;
const LOAD_DURATION = '60s';
const PRE_JOIN_SETTLE_MS = 5000;
const POST_JOIN_CONVERGENCE_TIMEOUT_MS = 60000;
const ZERO_FAILURES = 0;

/**
 * Run the node-join-under-load scenario.
 *
 * @param {Object} cluster - Cluster handle from the harness.
 */
async function run(cluster) {
  // 1. Start sustained write load against the running cluster.
  const loadRun = cluster.startLoad({
    opsPerSec: LOAD_OPS_PER_SEC,
    duration: LOAD_DURATION,
  });

  // 2. Let load stabilize before adding a node.
  await new Promise((r) => setTimeout(r, PRE_JOIN_SETTLE_MS));

  // 3. Add a new node to the cluster while load is active.
  const newNode = await cluster.addNode();

  // 4. Wait for the cluster to converge with the new node.
  const convergence = await cluster.waitForConvergence({
    settleTimeoutMs: POST_JOIN_CONVERGENCE_TIMEOUT_MS,
    quietWindowMs: CONVERGENCE_DEFAULTS.quietWindowMs,
    targetVoterCount: CONVERGENCE_DEFAULTS.targetVoterCount,
  });

  assert.ok(
    convergence.settledAfterMs <= POST_JOIN_CONVERGENCE_TIMEOUT_MS,
    'Cluster did not converge within SLO: ' +
    convergence.settledAfterMs + 'ms',
  );

  // 5. Wait for load to complete and verify metrics.
  const metrics = await loadRun.waitComplete();

  assert.ok(
    metrics.total > ZERO_FAILURES,
    'Expected at least one operation to complete',
  );
  assert.ok(
    metrics.success > ZERO_FAILURES,
    'Expected at least one successful operation',
  );

  // 6. Assert cluster consistency after join + load.
  await cluster.assertConsistency();

  return {
    loadMetrics: metrics,
    convergenceTiming: convergence,
    newNodeId: newNode?.id || null,
  };
}

export {run};
