/**
 * Scenario: WASM Service Failover
 *
 * Start cluster with WASM services, kill a node hosting WASM
 * replicas, verify WASM service rebalancing.
 *
 * Requirements: 4.1, 5.1
 */

import assert from 'node:assert/strict';
import {join, resolve} from 'node:path';
import {CONVERGENCE_DEFAULTS} from '../harness/constants.js';
import {runExamplesCatalog} from '../../../scripts/examples/build-upload-run.js';

const PRE_KILL_SETTLE_MS = 5000;
const POST_KILL_CONVERGENCE_TIMEOUT_MS = 60000;
const WASM_SERVICES_QUERY =
  'SELECT * FROM services WHERE service_type = \'wasm_service\'';
const MIN_WASM_REPLICAS = 1;
const WASM_BOOTSTRAP_EXAMPLE_ID = '06-wasm-remote-replica';
const EXAMPLES_OUTPUT_SUBDIR = 'examples';

/**
 * Build a lightweight cluster client for examples bootstrap.
 *
 * @param {Object} seedNode
 * @return {{query: Function, partitionCallback: Function}}
 */
function createClusterClient(seedNode) {
  return {
    query: (sql, params) => seedNode.query(sql, params),
    partitionCallback: (payload) => seedNode.partitionCallback(payload),
  };
}

/**
 * Ensure at least one wasm_service replica exists by running the
 * wasm callback example when needed.
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

  const outputRoot = cluster?._config?.outputDir || 'test-output';
  const outputPath = resolve(
    join(
      outputRoot,
      EXAMPLES_OUTPUT_SUBDIR,
      `wasm-service-bootstrap-${Date.now()}.json`,
    ),
  );
  await runExamplesCatalog({
    client: createClusterClient(seedNode),
    include: [WASM_BOOTSTRAP_EXAMPLE_ID],
    outputPath,
    failOnRequired: false,
  });

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
      bootstrapExampleId: WASM_BOOTSTRAP_EXAMPLE_ID,
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
  await cluster.assertConsistency();

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
