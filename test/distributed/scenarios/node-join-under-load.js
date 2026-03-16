/**
 * Scenario: Node Join Under Load
 *
 * Start cluster, begin sustained write load, add a new node,
 * verify rebalancing completes within SLO.
 *
 * Requirements: 5.1, 6.1
 */

import assert from 'node:assert/strict';
import {CONVERGENCE_DEFAULTS} from '../harness/constants.js';

const LOAD_OPS_PER_SEC = 50;
const LOAD_DURATION = '60s';
const PRE_JOIN_SETTLE_MS = 5000;
const POST_JOIN_CONVERGENCE_TIMEOUT_MS = 60000;
const CONSISTENCY_TIMEOUT_MS = 15000;
const CONSISTENCY_POLL_INTERVAL_MS = 500;
const ZERO_FAILURES = 0;

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

  // 1. Start sustained write load against the running cluster.
  const loadRun = cluster.startLoad({
    opsPerSec: loadOpsPerSec,
    duration: loadDuration,
  });

  // 2. Let load stabilize before adding a node.
  await sleep(preJoinSettleMs);

  // 3. Add a new node to the cluster while load is active.
  const newNode = await cluster.addNode();
  const nodeHandles = typeof cluster.getNodes === 'function' ?
    cluster.getNodes() :
    (typeof cluster.nodes === 'function' ? cluster.nodes() : []);
  const expectedPostJoinNodes = Math.max(
    CONVERGENCE_DEFAULTS.targetVoterCount,
    nodeHandles.length,
  );

  // 4. Wait for the cluster to converge with the new node.
  const convergence = await cluster.waitForConvergence({
    settleTimeoutMs: postJoinConvergenceTimeoutMs,
    quietWindowMs: CONVERGENCE_DEFAULTS.quietWindowMs,
    targetVoterCount: expectedPostJoinNodes,
  });

  assert.ok(
    convergence.settledAfterMs <= postJoinConvergenceTimeoutMs,
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

  // Re-validate convergence once write load has quiesced.
  await cluster.waitForConvergence({
    settleTimeoutMs: postJoinConvergenceTimeoutMs,
    quietWindowMs: CONVERGENCE_DEFAULTS.quietWindowMs,
    targetVoterCount: expectedPostJoinNodes,
  });

  // 6. Assert cluster consistency after join + load.
  await cluster.waitForConsistencyConvergence({
    timeoutMs: consistencyTimeoutMs,
    pollIntervalMs: consistencyPollIntervalMs,
  });

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
