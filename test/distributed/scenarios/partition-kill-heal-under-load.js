/**
 * Scenario: Partition + Kill + Heal Under Load
 *
 * Runs sustained load, partitions the network, kills a non-seed node
 * during isolation, heals the partition, and verifies convergence and
 * acceptable load success.
 */

import assert from 'node:assert/strict';
import {CONVERGENCE_DEFAULTS} from '../harness/constants.js';

const MIN_NODE_COUNT = 3;
const DEFAULT_LOAD_OPS_PER_SEC = 50;
const DEFAULT_LOAD_DURATION = '60s';
const DEFAULT_PRE_FAULT_DELAY_MS = 5000;
const DEFAULT_PARTITION_HOLD_MS = 5000;
const DEFAULT_POST_KILL_DELAY_MS = 1000;
const DEFAULT_CONVERGENCE_TIMEOUT_MS = 60000;
const DEFAULT_MIN_SUCCESS_RATE = 0.9;
const ZERO = 0;

/**
 * Sleep helper for deterministic scenario sequencing.
 * @param {number} delayMs
 * @return {Promise<void>}
 */
function sleep(delayMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

/**
 * Split cluster nodes into two non-empty groups.
 * @param {Array<Object>} nodes
 * @return {{groupA: Array<string>, groupB: Array<string>}}
 */
function splitNodeGroups(nodes) {
  const midpoint = Math.ceil(nodes.length / 2);
  const groupA = nodes.slice(0, midpoint).map((node) => node.id);
  const groupB = nodes.slice(midpoint).map((node) => node.id);
  return {groupA, groupB};
}

/**
 * Run the partition-kill-heal-under-load scenario.
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
  const preFaultDelayMs = Number.isFinite(options.preFaultDelayMs) ?
    options.preFaultDelayMs :
    DEFAULT_PRE_FAULT_DELAY_MS;
  const partitionHoldMs = Number.isFinite(options.partitionHoldMs) ?
    options.partitionHoldMs :
    DEFAULT_PARTITION_HOLD_MS;
  const postKillDelayMs = Number.isFinite(options.postKillDelayMs) ?
    options.postKillDelayMs :
    DEFAULT_POST_KILL_DELAY_MS;
  const convergenceTimeoutMs = Number.isFinite(options.convergenceTimeoutMs) ?
    options.convergenceTimeoutMs :
    DEFAULT_CONVERGENCE_TIMEOUT_MS;
  const minSuccessRate = Number.isFinite(options.minSuccessRate) ?
    options.minSuccessRate :
    DEFAULT_MIN_SUCCESS_RATE;

  const nodes = cluster.getNodes();
  assert.ok(
    nodes.length >= MIN_NODE_COUNT,
    'Scenario requires at least ' + MIN_NODE_COUNT +
    ' nodes, got ' + nodes.length,
  );

  const seedNode = nodes.find((node) => node.role === 'seed') || nodes[0];
  assert.ok(seedNode, 'Seed node should be available');

  const {groupA, groupB} = splitNodeGroups(nodes);
  assert.ok(groupA.length > ZERO, 'groupA must be non-empty');
  assert.ok(groupB.length > ZERO, 'groupB must be non-empty');

  const loadRun = cluster.startLoad({
    opsPerSec: loadOpsPerSec,
    duration: loadDuration,
  });

  await sleep(preFaultDelayMs);
  await cluster.partitionNetwork(groupA, groupB);
  await sleep(partitionHoldMs);

  const victimId = groupA.find((nodeId) => nodeId !== seedNode.id) ||
    cluster.randomNonSeed();
  assert.ok(victimId, 'Could not identify non-seed victim node');

  await cluster.killNode(victimId);
  await sleep(postKillDelayMs);
  await cluster.healPartition();

  const convergence = await cluster.waitForConvergence({
    settleTimeoutMs: convergenceTimeoutMs,
    quietWindowMs: CONVERGENCE_DEFAULTS.quietWindowMs,
    targetVoterCount: CONVERGENCE_DEFAULTS.targetVoterCount,
  });
  assert.ok(
    convergence.settledAfterMs <= convergenceTimeoutMs,
    'Cluster did not converge after compound fault: ' +
    convergence.settledAfterMs + 'ms',
  );

  const metrics = await loadRun.waitComplete();
  assert.ok(metrics.total > ZERO, 'Expected at least one load operation');

  const successRate = metrics.total > ZERO ?
    metrics.success / metrics.total :
    ZERO;
  assert.ok(
    successRate >= minSuccessRate,
    'Success rate below threshold after compound fault: ' +
    successRate.toFixed(3) + ' (expected >= ' + minSuccessRate + ')',
  );

  await cluster.assertConsistency();

  return {
    groupA,
    groupB,
    killedNodeId: victimId,
    loadMetrics: metrics,
    successRate,
    convergenceTiming: convergence,
  };
}

export {run};
