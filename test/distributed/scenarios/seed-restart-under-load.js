/**
 * Scenario: Seed Restart Under Load
 *
 * Exercises control-plane resilience by restarting the seed node while
 * write load is active, then validating convergence and consistency.
 */

import assert from 'node:assert/strict';
import {CONVERGENCE_DEFAULTS} from '../harness/constants.js';

const DEFAULT_LOAD_OPS_PER_SEC = 50;
const DEFAULT_LOAD_DURATION = '60s';
const DEFAULT_PRE_RESTART_DELAY_MS = 5000;
const DEFAULT_CONVERGENCE_TIMEOUT_MS = 60000;
const DEFAULT_MIN_SUCCESS_RATE = 0.8;
const ZERO = 0;

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
 * Run the seed-restart-under-load scenario.
 *
 * @param {Object} cluster
 * @param {Object} [options]
 * @return {Promise<Object>}
 */
async function run(cluster, options = {}) {
  const loadOpsPerSec = Number.isFinite(options.loadOpsPerSec) ?
    options.loadOpsPerSec :
    DEFAULT_LOAD_OPS_PER_SEC;
  const loadDuration = typeof options.loadDuration === 'string' ?
    options.loadDuration :
    DEFAULT_LOAD_DURATION;
  const preRestartDelayMs = Number.isFinite(options.preRestartDelayMs) ?
    options.preRestartDelayMs :
    DEFAULT_PRE_RESTART_DELAY_MS;
  const convergenceTimeoutMs = Number.isFinite(options.convergenceTimeoutMs) ?
    options.convergenceTimeoutMs :
    DEFAULT_CONVERGENCE_TIMEOUT_MS;
  const minSuccessRate = Number.isFinite(options.minSuccessRate) ?
    options.minSuccessRate :
    DEFAULT_MIN_SUCCESS_RATE;

  const nodes = cluster.getNodes();
  const seedNode = nodes.find((node) => node.role === 'seed') || nodes[0];
  assert.ok(seedNode, 'Seed node should be available');

  const loadRun = cluster.startLoad({
    opsPerSec: loadOpsPerSec,
    duration: loadDuration,
  });

  await sleep(preRestartDelayMs);
  await cluster.restartNode(seedNode.id);

  const convergence = await cluster.waitForConvergence({
    settleTimeoutMs: convergenceTimeoutMs,
    quietWindowMs: CONVERGENCE_DEFAULTS.quietWindowMs,
    targetVoterCount: CONVERGENCE_DEFAULTS.targetVoterCount,
  });
  assert.ok(
    convergence.settledAfterMs <= convergenceTimeoutMs,
    'Cluster did not converge after seed restart: ' +
    convergence.settledAfterMs + 'ms',
  );

  const metrics = await loadRun.waitComplete();
  assert.ok(metrics.total > ZERO, 'Expected at least one load operation');

  const successRate = metrics.total > ZERO ?
    metrics.success / metrics.total :
    ZERO;
  assert.ok(
    successRate >= minSuccessRate,
    'Success rate below threshold after seed restart: ' +
    successRate.toFixed(3) + ' (expected >= ' + minSuccessRate + ')',
  );

  await cluster.assertConsistency();

  return {
    seedNodeId: seedNode.id,
    loadMetrics: metrics,
    successRate,
    convergenceTiming: convergence,
  };
}

export {run};
