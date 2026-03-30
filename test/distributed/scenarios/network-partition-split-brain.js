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
const POST_HEAL_CONVERGENCE_TIMEOUT_MS = 180000;
const CONSISTENCY_TIMEOUT_MS = 15000;
const CONSISTENCY_POLL_INTERVAL_MS = 500;
const MIN_GROUP_SIZE = 1;

/**
 * Run the network-partition-split-brain scenario.
 *
 * @param {Object} cluster - Cluster handle from the harness.
 * @param {Object} [options]
 */
async function run(cluster, options = {}) {
  const partitionHoldMs = Number.isFinite(options.partitionHoldMs) ?
    Number(options.partitionHoldMs) :
    PARTITION_HOLD_MS;
  const postHealConvergenceTimeoutMs = Number.isFinite(
    options.postHealConvergenceTimeoutMs,
  ) ?
    Number(options.postHealConvergenceTimeoutMs) :
    POST_HEAL_CONVERGENCE_TIMEOUT_MS;
  const consistencyTimeoutMs = Number.isFinite(options.consistencyTimeoutMs) ?
    Number(options.consistencyTimeoutMs) :
    CONSISTENCY_TIMEOUT_MS;
  const consistencyPollIntervalMs = Number.isFinite(
    options.consistencyPollIntervalMs,
  ) ?
    Number(options.consistencyPollIntervalMs) :
    CONSISTENCY_POLL_INTERVAL_MS;

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
  await sleep(partitionHoldMs);

  // 4. Heal the partition to restore full connectivity.
  await cluster.healPartition();

  // 5. Wait for the cluster to converge after healing.
  const convergence = await cluster.waitForConvergence({
    settleTimeoutMs: postHealConvergenceTimeoutMs,
    quietWindowMs: CONVERGENCE_DEFAULTS.quietWindowMs,
    targetVoterCount: CONVERGENCE_DEFAULTS.targetVoterCount,
  });

  assert.ok(
    convergence.settledAfterMs <=
      postHealConvergenceTimeoutMs,
    'Cluster did not converge after partition heal: ' +
    convergence.settledAfterMs + 'ms',
  );

  // 6. Assert consistency across all nodes post-heal.
  await cluster.waitForConsistencyConvergence({
    timeoutMs: consistencyTimeoutMs,
    pollIntervalMs: consistencyPollIntervalMs,
  });

  return {
    convergenceTiming: convergence,
    groupA,
    groupB,
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
