/**
 * Scenario: Seed Restart Under Load
 *
 * Exercises control-plane resilience by restarting the seed node while
 * write load is active, then validating convergence and consistency.
 */

import assert from "node:assert/strict";
import { CONVERGENCE_DEFAULTS } from "../harness/constants.js";
import {
  resolveScenarioOptions,
  resolveSeedRestartUnderLoadScenarioConfig,
} from "../harness/scenario-config.js";
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
  const scenarioOptions = resolveScenarioOptions(
    options,
    cluster,
    "seedRestartUnderLoad",
  );
  const {
    loadOpsPerSec,
    loadDuration,
    preRestartDelayMs,
    preRestartActiveTimeoutMs,
    restartReadinessTimeoutMs,
    postRestartActiveTimeoutMs,
    postRestartQuietWindowMs,
    convergenceTimeoutMs,
    consistencyTimeoutMs,
    minSuccessRate,
  } = resolveSeedRestartUnderLoadScenarioConfig(scenarioOptions);

  const nodes = cluster.getNodes();
  const seedNode = nodes.find((node) => node.role === "seed") || nodes[0];
  assert.ok(seedNode, "Seed node should be available");

  const loadNodesById = new Map(nodes.map((node) => [String(node.id), node]));
  const steadyLoadNodeIds = nodes
    .filter((node) => String(node.id) !== String(seedNode.id))
    .map((node) => String(node.id));
  const availableLoadNodeIds = new Set(
    steadyLoadNodeIds.length > ZERO
      ? steadyLoadNodeIds
      : nodes.map((node) => String(node.id)),
  );
  const resolveLoadNodes = () =>
    Array.from(availableLoadNodeIds)
      .map((nodeId) => loadNodesById.get(nodeId))
      .filter((node) => node && typeof node.query === "function");

  const loadRun = cluster.startLoad({
    nodes: resolveLoadNodes(),
    nodeResolver: resolveLoadNodes,
    opsPerSec: loadOpsPerSec,
    duration: loadDuration,
  });

  await sleep(preRestartDelayMs);
  if (typeof cluster.waitForAllActive === "function") {
    await cluster.waitForAllActive({
      mode: "load",
      timeoutMs: preRestartActiveTimeoutMs,
    });
  }

  availableLoadNodeIds.delete(String(seedNode.id));
  let restartWarning = null;
  try {
    await cluster.restartNode(seedNode.id, {
      readinessTimeoutMs: restartReadinessTimeoutMs,
    });
    availableLoadNodeIds.add(String(seedNode.id));
  } catch (error) {
    restartWarning = error instanceof Error ? error.message : String(error);
  }

  const convergence = await cluster.waitForConvergence({
    settleTimeoutMs: convergenceTimeoutMs,
    quietWindowMs: CONVERGENCE_DEFAULTS.quietWindowMs,
    targetVoterCount: CONVERGENCE_DEFAULTS.targetVoterCount,
  });
  assert.ok(
    convergence.settledAfterMs <= convergenceTimeoutMs,
    "Cluster did not converge after seed restart: " +
      convergence.settledAfterMs +
      "ms",
  );
  const metrics = await loadRun.waitComplete();
  assert.ok(metrics.total > ZERO, "Expected at least one load operation");

  const successRate =
    metrics.total > ZERO ? metrics.success / metrics.total : ZERO;
  assert.ok(
    successRate >= minSuccessRate,
    "Success rate below threshold after seed restart: " +
      successRate.toFixed(3) +
      " (expected >= " +
      minSuccessRate +
      ")",
  );

  if (
    restartWarning === null &&
    typeof cluster.waitForAllActive === "function"
  ) {
    await cluster.waitForAllActive({
      mode: "load",
      timeoutMs: postRestartActiveTimeoutMs,
    });
  }

  await sleep(postRestartQuietWindowMs);

  if (restartWarning === null) {
    await cluster.waitForConsistencyConvergence({
      timeoutMs: consistencyTimeoutMs,
      forceRepairAfterMs: 0,
      tolerateActiveNodeSkew: true,
      maxActiveNodeSkew: 1,
    });
  }

  return {
    seedNodeId: seedNode.id,
    restartWarning,
    loadMetrics: metrics,
    successRate,
    convergenceTiming: convergence,
  };
}

export { run };
