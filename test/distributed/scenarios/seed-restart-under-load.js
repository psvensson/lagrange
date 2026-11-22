/**
 * Scenario: Seed Restart Under Load
 *
 * Exercises control-plane resilience by restarting the seed node while
 * write load is active, then validating convergence and consistency.
 */

import assert from 'node:assert/strict';
import {CONVERGENCE_DEFAULTS} from '../harness/constants.js';
import {
  resolveScenarioOptions,
  resolveSeedRestartUnderLoadScenarioConfig,
} from '../harness/scenario-config.js';
import {
  provisionUserLoadTable,
  recordAndVerifyDiagnosticMarker,
} from './user-load-table-and-marker-helpers.js';
const ZERO = 0;
const SEED_RESTART_ERROR_CODE = Object.freeze({
  RESTART_FAILED: 'seed_restart_recovery_failed',
});

/**
 * Typed error raised when seed restart fails, surfacing surviving-node
 * load metrics while refusing seed recovery acceptance.
 */
class SeedRestartRecoveryError extends Error {
  constructor(message, {code, seedNodeId, survivingNodeLoadMetrics, cause}) {
    super(message, cause !== undefined ? {cause} : undefined);
    this.name = 'SeedRestartRecoveryError';
    this.code = code;
    this.seedNodeId = seedNodeId;
    this.seedRejoined = false;
    this.seedRecoveryVerified = false;
    this.survivingNodeLoadMetrics = survivingNodeLoadMetrics;
  }
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

function summarizeLoadMetrics(metrics) {
  const total = Number(metrics?.total || ZERO);
  const success = Number(metrics?.success || ZERO);
  const failed = Number(metrics?.failed || ZERO);
  return {
    total,
    success,
    failed,
    successRate: total > ZERO ? success / total : ZERO,
  };
}

async function settleSurvivingLoadOnRestartFailure(loadRun) {
  let settledMetrics = null;
  let loadError = null;
  try {
    if (typeof loadRun?.cancel === 'function') {
      loadRun.cancel();
    }
    settledMetrics = await loadRun.waitComplete();
  } catch (error) {
    loadError = error instanceof Error ? error.message : String(error);
  }
  const summary = summarizeLoadMetrics(settledMetrics);
  if (loadError !== null) {
    return {...summary, loadError};
  }
  return summary;
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
    'seedRestartUnderLoad',
  );
  const {
    loadOpsPerSec,
    loadDuration,
    tableName,
    preRestartDelayMs,
    preRestartActiveTimeoutMs,
    restartReadinessTimeoutMs,
    postRestartActiveTimeoutMs,
    postRestartQuietWindowMs,
    convergenceTimeoutMs,
    consistencyTimeoutMs,
    minSuccessRate,
  } = resolveSeedRestartUnderLoadScenarioConfig(scenarioOptions);

  assert.equal(
    typeof cluster?.waitForAllActive,
    'function',
    'Cluster must expose waitForAllActive()',
  );
  assert.equal(
    typeof cluster?.waitForConsistencyConvergence,
    'function',
    'Cluster must expose waitForConsistencyConvergence()',
  );

  const nodes = cluster.getNodes();
  const seedNode = nodes.find((node) => node.role === 'seed') || nodes[0];
  assert.ok(seedNode, 'Seed node should be available');

  const provisionedTable = await provisionUserLoadTable(cluster, {
    tableName,
  });

  const loadNodesById = new Map(nodes.map((node) => [String(node.id), node]));
  const steadyLoadNodeIds = nodes
    .filter((node) => String(node.id) !== String(seedNode.id))
    .map((node) => String(node.id));
  const availableLoadNodeIds = new Set(
    steadyLoadNodeIds.length > ZERO ?
      steadyLoadNodeIds :
      nodes.map((node) => String(node.id)),
  );
  const resolveLoadNodes = () =>
    Array.from(availableLoadNodeIds)
      .map((nodeId) => loadNodesById.get(nodeId))
      .filter((node) => node && typeof node.query === 'function');

  const loadRun = cluster.startLoad({
    nodes: resolveLoadNodes(),
    nodeResolver: resolveLoadNodes,
    opsPerSec: loadOpsPerSec,
    duration: loadDuration,
    tableName: provisionedTable.tableName,
  });

  await sleep(preRestartDelayMs);
  await cluster.waitForAllActive({
    mode: 'load',
    timeoutMs: preRestartActiveTimeoutMs,
  });
  const preRestartMarker = await recordAndVerifyDiagnosticMarker(cluster, {
    markerId: 'seed-restart-under-load-pre-restart',
  });

  availableLoadNodeIds.delete(String(seedNode.id));
  try {
    await cluster.restartNode(seedNode.id, {
      readinessTimeoutMs: restartReadinessTimeoutMs,
    });
  } catch (error) {
    const survivingNodeLoadMetrics =
      await settleSurvivingLoadOnRestartFailure(loadRun);
    const reason = error instanceof Error ? error.message : String(error);
    throw new SeedRestartRecoveryError(
      `Seed node ${seedNode.id} failed to restart and rejoin: ${reason}`,
      {
        code: SEED_RESTART_ERROR_CODE.RESTART_FAILED,
        seedNodeId: seedNode.id,
        survivingNodeLoadMetrics,
        cause: error,
      },
    );
  }

  let preRejoinMetrics = null;
  if (typeof loadRun?.getMetrics === 'function') {
    preRejoinMetrics = loadRun.getMetrics();
  }
  availableLoadNodeIds.add(String(seedNode.id));

  const convergence = await cluster.waitForConvergence({
    settleTimeoutMs: convergenceTimeoutMs,
    quietWindowMs: CONVERGENCE_DEFAULTS.quietWindowMs,
    targetVoterCount: CONVERGENCE_DEFAULTS.targetVoterCount,
  });
  assert.ok(
    convergence.settledAfterMs <= convergenceTimeoutMs,
    'Cluster did not converge after seed restart: ' +
      convergence.settledAfterMs +
      'ms',
  );
  const metrics = await loadRun.waitComplete();
  assert.ok(metrics.total > ZERO, 'Expected at least one load operation');

  const successRate =
    metrics.total > ZERO ? metrics.success / metrics.total : ZERO;
  assert.ok(
    successRate >= minSuccessRate,
    'Success rate below threshold after seed restart: ' +
      successRate.toFixed(3) +
      ' (expected >= ' +
      minSuccessRate +
      ')',
  );

  await cluster.waitForAllActive({
    mode: 'load',
    timeoutMs: postRestartActiveTimeoutMs,
  });

  await sleep(postRestartQuietWindowMs);

  await cluster.waitForConsistencyConvergence({
    timeoutMs: consistencyTimeoutMs,
    forceRepairAfterMs: 0,
    tolerateActiveNodeSkew: true,
    maxActiveNodeSkew: 1,
  });

  const diagnosticMarker = await recordAndVerifyDiagnosticMarker(cluster, {
    markerId: 'seed-restart-under-load-post-restart',
    writerNode: seedNode,
  });

  const survivingNodeLoadMetrics = summarizeLoadMetrics(
    preRejoinMetrics !== null ? preRejoinMetrics : metrics,
  );

  return {
    seedNodeId: seedNode.id,
    seedRejoined: true,
    seedRecoveryVerified: true,
    tableName: provisionedTable.tableName,
    diagnosticMarker,
    diagnosticMarkers: {
      preRestart: preRestartMarker,
      postRestart: diagnosticMarker,
    },
    loadMetrics: metrics,
    survivingNodeLoadMetrics,
    successRate,
    convergenceTiming: convergence,
  };
}

export {
  SEED_RESTART_ERROR_CODE,
  SeedRestartRecoveryError,
  run,
};
