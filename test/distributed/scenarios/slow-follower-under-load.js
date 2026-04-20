/**
 * Scenario: Slow Follower Under Load
 *
 * Runs sustained load, injects network slowdown on one non-seed node,
 * clears slowdown, and verifies convergence + consistency.
 */

import assert from "node:assert/strict";
import { CONVERGENCE_DEFAULTS } from "../harness/constants.js";
import { resolveSlowFollowerUnderLoadScenarioConfig } from "../harness/scenario-config.js";

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
 * Run the slow-follower-under-load scenario.
 *
 * @param {Object} cluster
 * @param {Object} [options]
 * @return {Promise<Object>}
 */
async function run(cluster, options = {}) {
  const {
    loadOpsPerSec,
    loadDuration,
    preFaultDelayMs,
    faultHoldMs,
    postHealDelayMs,
    latencyMs,
    jitterMs,
    convergenceTimeoutMs,
    minSuccessRate,
  } = resolveSlowFollowerUnderLoadScenarioConfig(options);

  const nodes = cluster.getNodes();
  const nonSeedNode = nodes.find((node) => node.role !== "seed") || null;
  const fallbackNodeId =
    typeof cluster.randomNonSeed === "function"
      ? cluster.randomNonSeed()
      : null;
  const targetNodeId = nonSeedNode?.id || fallbackNodeId;
  assert.ok(targetNodeId, "Scenario requires one non-seed node for slowdown");

  const loadRun = cluster.startLoad({
    opsPerSec: loadOpsPerSec,
    duration: loadDuration,
  });

  await sleep(preFaultDelayMs);

  let slowdownActive = false;
  try {
    await cluster.slowNetwork(targetNodeId, {
      latency: latencyMs,
      jitter: jitterMs,
    });
    slowdownActive = true;
    await sleep(faultHoldMs);
  } finally {
    if (slowdownActive) {
      await cluster.clearNetworkSlowdown(targetNodeId);
      slowdownActive = false;
    }
  }

  await sleep(postHealDelayMs);

  const convergence = await cluster.waitForConvergence({
    settleTimeoutMs: convergenceTimeoutMs,
    quietWindowMs: CONVERGENCE_DEFAULTS.quietWindowMs,
    targetVoterCount: CONVERGENCE_DEFAULTS.targetVoterCount,
  });
  assert.ok(
    convergence.settledAfterMs <= convergenceTimeoutMs,
    "Cluster did not converge after clearing follower slowdown: " +
      convergence.settledAfterMs +
      "ms",
  );

  const metrics = await loadRun.waitComplete();
  assert.ok(metrics.total > ZERO, "Expected at least one load operation");

  const successRate =
    metrics.total > ZERO ? metrics.success / metrics.total : ZERO;
  assert.ok(
    successRate >= minSuccessRate,
    "Success rate below threshold during slow follower scenario: " +
      successRate.toFixed(3) +
      " (expected >= " +
      minSuccessRate +
      ")",
  );

  await cluster.waitForConsistencyConvergence();

  return {
    targetNodeId,
    slowdown: {
      latencyMs,
      jitterMs,
    },
    loadMetrics: metrics,
    successRate,
    convergenceTiming: convergence,
  };
}

export { run };
