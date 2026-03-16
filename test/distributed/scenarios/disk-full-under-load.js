/**
 * Scenario: Disk Full Under Load
 *
 * Runs sustained load, injects bounded disk pressure on one non-seed node,
 * releases pressure, and verifies convergence + consistency.
 */

import assert from 'node:assert/strict';
import {CONVERGENCE_DEFAULTS} from '../harness/constants.js';
import {
  resolveDiskFullUnderLoadScenarioConfig,
} from '../harness/scenario-config.js';

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
 * Run the disk-full-under-load scenario.
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
    postReleaseDelayMs,
    diskFillSizeMb,
    diskPressurePath,
    convergenceTimeoutMs,
    minSuccessRate,
  } = resolveDiskFullUnderLoadScenarioConfig(options);

  const nodes = cluster.getNodes();
  const nonSeedNode = nodes.find((node) => node.role !== 'seed') || null;
  const fallbackNodeId =
    typeof cluster.randomNonSeed === 'function' ?
      cluster.randomNonSeed() :
      null;
  const victimNodeId =
    nonSeedNode?.id || fallbackNodeId;
  assert.ok(victimNodeId, 'Scenario requires one non-seed node for disk pressure');

  const loadRun = cluster.startLoad({
    opsPerSec: loadOpsPerSec,
    duration: loadDuration,
  });

  await sleep(preFaultDelayMs);

  let diskPressureApplied = false;
  try {
    await cluster.fillDisk(victimNodeId, {
      sizeMb: diskFillSizeMb,
      filePath: diskPressurePath,
    });
    diskPressureApplied = true;
    await sleep(faultHoldMs);
  } finally {
    if (diskPressureApplied) {
      await cluster.releaseDiskPressure(victimNodeId, {
        filePath: diskPressurePath,
      });
      diskPressureApplied = false;
    }
  }

  await sleep(postReleaseDelayMs);

  const convergence = await cluster.waitForConvergence({
    settleTimeoutMs: convergenceTimeoutMs,
    quietWindowMs: CONVERGENCE_DEFAULTS.quietWindowMs,
    targetVoterCount: CONVERGENCE_DEFAULTS.targetVoterCount,
  });
  assert.ok(
    convergence.settledAfterMs <= convergenceTimeoutMs,
    'Cluster did not converge after disk pressure release: ' +
    convergence.settledAfterMs + 'ms',
  );

  const metrics = await loadRun.waitComplete();
  assert.ok(metrics.total > ZERO, 'Expected at least one load operation');

  const successRate = metrics.total > ZERO ?
    metrics.success / metrics.total :
    ZERO;
  assert.ok(
    successRate >= minSuccessRate,
    'Success rate below threshold after disk pressure: ' +
    successRate.toFixed(3) + ' (expected >= ' + minSuccessRate + ')',
  );

  await cluster.waitForConsistencyConvergence();

  return {
    victimNodeId,
    diskPressure: {
      sizeMb: diskFillSizeMb,
      filePath: diskPressurePath,
    },
    loadMetrics: metrics,
    successRate,
    convergenceTiming: convergence,
  };
}

export {run};
