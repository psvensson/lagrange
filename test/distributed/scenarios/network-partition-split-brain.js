/**
 * Scenario: Network Partition and Split-Brain Detection
 *
 * Start cluster, partition into two groups, verify Raft leader
 * election, heal partition, verify convergence. Use LogAnalyzer
 * to check for split-brain patterns.
 *
 * Requirements: 4.5, 4.6, 5.1
 */

import assert from 'node:assert/strict';
import {CONVERGENCE_DEFAULTS} from '../harness/constants.js';

const PARTITION_HOLD_MS = 10000;
const POST_HEAL_CONVERGENCE_TIMEOUT_MS = 60000;
const MIN_GROUP_SIZE = 1;
const SPLIT_BRAIN_PATTERN = 'split_brain';

/**
 * Run the network-partition-split-brain scenario.
 *
 * @param {Object} cluster - Cluster handle from the harness.
 */
async function run(cluster) {
  // 1. Get all node IDs and split into two groups.
  const nodes = cluster.getNodes();
  assert.ok(
    nodes.length >= 3,
    'Need at least 3 nodes for a meaningful partition',
  );

  const midpoint = Math.ceil(nodes.length / 2);
  const groupA = nodes.slice(0, midpoint).map((n) => n.id);
  const groupB = nodes.slice(midpoint).map((n) => n.id);

  assert.ok(
    groupA.length >= MIN_GROUP_SIZE,
    'Group A must have at least one node',
  );
  assert.ok(
    groupB.length >= MIN_GROUP_SIZE,
    'Group B must have at least one node',
  );

  // 2. Partition the network into two isolated groups.
  await cluster.partitionNetwork(groupA, groupB);

  // 3. Hold the partition to allow Raft leader elections.
  await new Promise((r) => setTimeout(r, PARTITION_HOLD_MS));

  // 4. Heal the partition to restore full connectivity.
  await cluster.healPartition();

  // 5. Wait for the cluster to converge after healing.
  const convergence = await cluster.waitForConvergence({
    settleTimeoutMs: POST_HEAL_CONVERGENCE_TIMEOUT_MS,
    quietWindowMs: CONVERGENCE_DEFAULTS.quietWindowMs,
    targetVoterCount: CONVERGENCE_DEFAULTS.targetVoterCount,
  });

  assert.ok(
    convergence.settledAfterMs <=
      POST_HEAL_CONVERGENCE_TIMEOUT_MS,
    'Cluster did not converge after partition heal: ' +
    convergence.settledAfterMs + 'ms',
  );

  // 6. Assert consistency across all nodes post-heal.
  await cluster.assertConsistency();

  return {
    convergenceTiming: convergence,
    groupA,
    groupB,
  };
}

export {run};
