/**
 * Scenario: Partition + Kill + Heal Under Load
 *
 * Runs sustained load, partitions the network, kills a non-seed node
 * during isolation, heals the partition, and verifies convergence and
 * acceptable load success.
 */
// @ts-nocheck


import assert from 'node:assert/strict';
import {CONVERGENCE_DEFAULTS} from '../harness/constants.js';
import {
  resolvePartitionKillHealUnderLoadScenarioConfig,
} from '../harness/scenario-config.js';

const MIN_NODE_COUNT = 3;
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
 * Replace the load-node set in place.
 * @param {Set<string>} availableLoadNodeIds
 * @param {Iterable<string>} nodeIds
 */
function setAvailableLoadNodeIds(availableLoadNodeIds, nodeIds) {
  availableLoadNodeIds.clear();
  for (const nodeId of nodeIds) {
    availableLoadNodeIds.add(String(nodeId));
  }
}

/**
 * Run the partition-kill-heal-under-load scenario.
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
    partitionHoldMs,
    postKillDelayMs,
    convergenceTimeoutMs,
    minSuccessRate,
  } = resolvePartitionKillHealUnderLoadScenarioConfig(options);

  const nodes = cluster.getNodes();
  assert.ok(
    nodes.length >= MIN_NODE_COUNT,
    'Scenario requires at least ' + MIN_NODE_COUNT +
    ' nodes, got ' + nodes.length,
  );

  const seedNode = nodes.find((node) => node.role === 'seed') || nodes[0];
  assert.ok(seedNode, 'Seed node should be available');

  const loadNodesById = new Map(
    nodes.map((node) => [String(node.id), node]),
  );
  const availableLoadNodeIds = new Set(
    nodes.map((node) => String(node.id)),
  );
  const resolveLoadNodes = () =>
    Array.from(availableLoadNodeIds)
      .map((nodeId) => loadNodesById.get(nodeId))
      .filter((node) => node && typeof node.query === 'function');

  const {groupA, groupB} = splitNodeGroups(nodes);
  assert.ok(groupA.length > ZERO, 'groupA must be non-empty');
  assert.ok(groupB.length > ZERO, 'groupB must be non-empty');
  const seedPartitionGroup = groupA.includes(seedNode.id) ?
    groupA :
    groupB;

  const loadRun = cluster.startLoad({
    nodes: resolveLoadNodes(),
    nodeResolver: resolveLoadNodes,
    opsPerSec: loadOpsPerSec,
    duration: loadDuration,
  });

  await sleep(preFaultDelayMs);
  await cluster.partitionNetwork(groupA, groupB);
  setAvailableLoadNodeIds(availableLoadNodeIds, seedPartitionGroup);
  await sleep(partitionHoldMs);

  const victimId = groupA.find((nodeId) => nodeId !== seedNode.id) ||
    cluster.randomNonSeed();
  assert.ok(victimId, 'Could not identify non-seed victim node');

  await cluster.killNode(victimId);
  availableLoadNodeIds.delete(String(victimId));
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

  setAvailableLoadNodeIds(
    availableLoadNodeIds,
    nodes
      .map((node) => String(node.id))
      .filter((nodeId) => nodeId !== String(victimId)),
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

  await cluster.waitForConsistencyConvergence();

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
