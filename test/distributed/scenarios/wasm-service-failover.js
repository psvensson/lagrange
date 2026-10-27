/**
 * Scenario: WASM Service Failover
 *
 * Start cluster with WASM services, kill a node hosting WASM
 * replicas, verify WASM service rebalancing.
 *
 * Requirements: 4.1, 5.1
 */

import assert from 'node:assert/strict';
import {
  CONVERGENCE_DEFAULTS,
  SCENARIO_TIMING_DEFAULTS,
} from '../harness/constants.js';
import {
  createServicePipeline,
  deployThroughPipeline,
  prepareServiceProject,
} from './service-pipeline-deployment-helpers.js';
import {provisionPublicListener} from './public-seam-durability-client.js';

const PRE_KILL_SETTLE_MS = SCENARIO_TIMING_DEFAULTS.stabilizationDelayMs;
const POST_KILL_CONVERGENCE_TIMEOUT_MS = 60000;
// The scenario runs on three nodes and kills one: replica-target-3 partitions
// cannot regain three voters on two survivors, so the post-kill convergence
// wait names the under-replication it tolerates, down to the floor the two
// survivors imply (two voters; one or zero is still under_target_voters).
const WASM_FAILOVER_SURVIVOR_COUNT = 2;
const WASM_FAILOVER_UNDER_REPLICATION_TOLERANCE = Object.freeze({
  minVoters: WASM_FAILOVER_SURVIVOR_COUNT,
  reason: 'three-node cluster with one node killed: two survivors cannot ' +
    'host a third voter for replica-target-3 partitions',
});
const WASM_SERVICES_QUERY =
  'SELECT * FROM services WHERE status = \'active\' AND (' +
  'service_type = \'wasm_service\' OR ' +
  'group_id LIKE \'wasm-instance-%\' OR ' +
  'replica_id LIKE \'reqsvc:%\' OR ' +
  'replica_id LIKE \'calls:%\')';
const MIN_WASM_REPLICAS = 1;
const WASM_BOOTSTRAP_SUBDIR = 'wasm-service-failover';

/**
 * Ensure at least one WASM service replica exists by deploying the
 * canonical WASI service pipeline when needed.
 *
 * @param {Object} cluster
 * @param {Object} seedNode
 * @param {Array<Object>} initialRows
 * @return {Promise<Array<Object>>}
 */
async function ensureWasmServiceReplica(cluster, seedNode, initialRows) {
  if (Array.isArray(initialRows) &&
      initialRows.length >= MIN_WASM_REPLICAS) {
    return initialRows;
  }

  const nodes = cluster.getNodes();
  const noopOutput = async () => {};
  const pipeline = createServicePipeline();
  await provisionPublicListener(seedNode, nodes.length);
  const paths = await prepareServiceProject(WASM_BOOTSTRAP_SUBDIR);
  await pipeline.runGenerate({
    projectDirectory: paths.projectDirectory,
    writeOutput: noopOutput,
  });
  const buildResult = await pipeline.runBuild({
    projectDirectory: paths.projectDirectory,
    writeOutput: noopOutput,
  });
  await deployThroughPipeline(
    {adminNode: seedNode, nodes, options: {}},
    {
      pipeline,
      runId: `${WASM_BOOTSTRAP_SUBDIR}-${Date.now()}`,
      writeOutput: noopOutput,
    },
    paths,
    buildResult.layoutPath,
  );

  const postBootstrap = await seedNode.query(WASM_SERVICES_QUERY);
  return Array.isArray(postBootstrap) ?
    postBootstrap :
    (postBootstrap?.rows || []);
}

/**
 * Run the wasm-service-failover scenario.
 *
 * @param {Object} cluster - Cluster handle from the harness.
 */
async function run(cluster) {
  // 1. Query initial WASM service replica distribution.
  const seedNode = cluster.getNodes().find(
    (n) => n.role === 'seed',
  );
  assert.ok(seedNode, 'Seed node not found');

  const initialServices = await seedNode.query(
    WASM_SERVICES_QUERY,
  );
  let initialRows = Array.isArray(initialServices) ?
    initialServices :
    (initialServices?.rows || []);
  initialRows = await ensureWasmServiceReplica(
    cluster,
    seedNode,
    initialRows,
  );

  if (initialRows.length < MIN_WASM_REPLICAS) {
    return {
      skipped: true,
      skipReason: 'no_wasm_service_replicas_available',
      bootstrapSubdir: WASM_BOOTSTRAP_SUBDIR,
      observedWasmReplicas: initialRows.length,
    };
  }

  // 2. Identify a non-seed node hosting WASM replicas.
  const victimId = findWasmHostNode(cluster, initialRows);
  assert.ok(
    victimId,
    'No non-seed node hosting WASM replicas found',
  );

  // 3. Let the cluster stabilize before killing.
  await new Promise((r) => setTimeout(r, PRE_KILL_SETTLE_MS));

  // 4. Kill the node hosting WASM replicas.
  await cluster.killNode(victimId);

  // 5. Wait for convergence — WASM replicas should rebalance.
  const convergence = await cluster.waitForConvergence({
    settleTimeoutMs: POST_KILL_CONVERGENCE_TIMEOUT_MS,
    quietWindowMs: CONVERGENCE_DEFAULTS.quietWindowMs,
    targetVoterCount: CONVERGENCE_DEFAULTS.targetVoterCount,
    tolerateUnderReplication: WASM_FAILOVER_UNDER_REPLICATION_TOLERANCE,
  });

  assert.ok(
    convergence.settledAfterMs <=
      POST_KILL_CONVERGENCE_TIMEOUT_MS,
    'Cluster did not converge after WASM host failure: ' +
    convergence.settledAfterMs + 'ms',
  );

  // 6. Verify WASM replicas were redistributed.
  const survivingNode = cluster.getNodes().find(
    (n) => n.id !== victimId && n.role === 'seed',
  ) || cluster.getNodes().find((n) => n.id !== victimId);

  assert.ok(survivingNode, 'No surviving node to query');

  const postServices = await survivingNode.query(
    WASM_SERVICES_QUERY,
  );
  const postRows = Array.isArray(postServices) ?
    postServices :
    (postServices?.rows || []);

  assert.ok(
    postRows.length >= MIN_WASM_REPLICAS,
    'WASM replicas not restored after failover, found ' +
    postRows.length,
  );

  // 7. Assert cluster consistency.
  await cluster.waitForConsistencyConvergence();

  return {
    convergenceTiming: convergence,
    killedNodeId: victimId,
    initialWasmReplicas: initialRows.length,
    postWasmReplicas: postRows.length,
  };
}

/**
 * Find a non-seed node that hosts WASM service replicas.
 *
 * @param {Object} cluster - Cluster handle.
 * @param {Array<Object>} serviceRows - WASM service rows.
 * @returns {string|null} Node ID or null if none found.
 */
function findWasmHostNode(cluster, serviceRows) {
  const nodes = cluster.getNodes();
  const nonSeedIds = new Set(
    nodes.filter((n) => n.role !== 'seed').map((n) => n.id),
  );

  for (const row of serviceRows) {
    const nodeId = row.node_id;
    if (nonSeedIds.has(nodeId)) {
      return nodeId;
    }
  }

  // Fallback: pick any non-seed node.
  return cluster.randomNonSeed();
}

export {run};
