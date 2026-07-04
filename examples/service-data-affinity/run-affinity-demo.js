/**
 * Tier-3 demo of the service↔data affinity placement epic
 * (solve/epics/service-data-affinity-placement.md): CODE MOVES TO ITS
 * DATA, live — at NODE granularity, inside a single latency group.
 *
 * Latency groups exist for CDC fan-out efficiency; the placement
 * thesis this demo proves is independent of them: a service replica
 * should run ON (or move onto) a node that holds a replica of the
 * partitions it actually accesses. (The multi-zone variant — data
 * pinned to one latency domain, service migrating across domains — is
 * the future latency-group demo quest.)
 *
 * The story:
 *   1. A 5-node cluster starts (no zone pinning — one latency domain),
 *      with a deliberately small partition split threshold so the
 *      ratings table is FORCED to split into several partitions —
 *      real parallelism: multiple raft groups, multiple leaders,
 *      parallel write targets for the loader.
 *   2. The movielens ratings are loaded and split across partitions
 *      whose replicas land on different node subsets. The service's
 *      query reads ONE user's rows, so only the partition(s) serving
 *      that key matter — the demo's data-node set is derived from the
 *      service's OWN attribution rows (which partitions it actually
 *      touched), falling back to all ratings partitions before
 *      attribution exists.
 *   3. A REAL runtime service is deployed (service_definitions row,
 *      runtime_kind native_js, runtime_ref sql-query-loop-runtime)
 *      with read_locality='same_group': its replicas run the movielens
 *      top-10 SELECT in a loop through their injected service-scoped
 *      query executor.
 *   4. The demo then just watches the machinery the epic shipped do
 *      its job: every statement is attributed into
 *      service_partition_access; the runtime-service rebalancer lifts
 *      the per-node weights into a DATA_AFFINITY placement policy; the
 *      planner puts/pulls the service replicas onto the ratings-holding
 *      nodes — code ON its data.
 *
 * Local processes only (no Docker): the staged bring-up needs process
 * control.
 *
 * Usage:
 *   node examples/movielens-access-affinity/download-movielens.js
 *   node examples/service-data-affinity/run-affinity-demo.js
 */

import {spawn} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import {mkdir, rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {AdminWsClient} from '../../scripts/examples/admin-ws-client.js';
import {
  loadRatingsIntoLagrange,
} from '../../examples/movielens-access-affinity/lagrange-loader.js';

const NODE_COUNT = 5;
const BASE_REST_PORT = 8080;
const BASE_ADMIN_PORT = 8081;
const PORT_STRIDE = 4;
const CLUSTER_DATA_ROOT = 'data/examples/service-data-affinity-demo';
const TARGET = `ws://127.0.0.1:${BASE_ADMIN_PORT}/api/admin/stream`;
const CLUSTER_FORM_TIMEOUT_MS = 180000;
const POLL_INTERVAL_MS = 2000;
const OBSERVE_INTERVAL_MS = 10000;
// Hard cap on the convergence watch — but staleness usually fires
// first: if NOTHING observable changes (placement set, on-data count,
// attribution row count) for STALL_TIMEOUT_MS, the demo aborts with a
// STALLED diagnosis instead of burning the full budget. The stall
// window allows ~3 rebalancer cycles (~90-120s cadence) of genuinely
// zero progress before giving up.
const CONVERGE_TIMEOUT_MS = 600000;
const STALL_TIMEOUT_MS = 300000;
const NODE_STATUS_ACTIVE = 'active';

// Cluster transitions (formation, data load) leave replica operations
// running; writes to a partition mid-move can transiently fail, so the
// demo waits for IN-FLIGHT operations (no completed_at yet) to drain
// before the next stage. Bounded: proceed anyway on timeout.
const SETTLE_POLL_INTERVAL_MS = 10000;
const SETTLE_QUIET_POLLS = 3;
const SETTLE_TIMEOUT_MS = 240000;

const PARTITION_SPLIT_BYTES = 1048576;
// Config floor: partition.evaluationIntervalMs must be >= 60000.
const PARTITION_EVAL_INTERVAL_MS = 60000;

const SERVICE_ID = 'svc-movielens-topn';
const SERVICE_REPLICA_COUNT = 2;
// The service scans the WHOLE table — one statement fanned out across
// every forced partition in parallel — and reduces it in-service to
// the top-10 movies by average rating, writing only those 10 rows to
// the result table. 100k rows never leave the service.
const SCAN_SQL = 'SELECT movie_id, rating FROM ratings';
const RESULT_TABLE = 'movielens_top10';
const CREATE_RESULT_TABLE_SQL =
  `CREATE TABLE IF NOT EXISTS ${RESULT_TABLE} (` +
  'rank INTEGER PRIMARY KEY, group_key TEXT, agg_value REAL, ' +
  'computed_at INTEGER)';
const QUERY_INTERVAL_MS = 5000;

async function startNode(index, dataRoot) {
  const restPort = BASE_REST_PORT + index * PORT_STRIDE;
  const adminPort = BASE_ADMIN_PORT + index * PORT_STRIDE;
  const dataDir = resolve(dataRoot, `node-${index}`);
  await mkdir(dataDir, {recursive: true});
  const logStream = createWriteStream(resolve(dataRoot, `node-${index}.log`));

  const env = {
    ...process.env,
    NODE_ADDRESS: `localhost:${restPort}`,
    REST_API_PORT: String(restPort),
    ADMIN_WEBSOCKET_PORT: String(adminPort),
    DATA_DIR: dataDir,
    LOG_LEVEL: 'info',
    // Force the ~2MB ratings table to split into several partitions
    // (default threshold is 10GB): more raft groups, more leaders,
    // more parallelism — and a sharper demo (the service converges on
    // the nodes holding the SPECIFIC shard it reads).
    PARTITION_SPLIT_THRESHOLD_BYTES: String(PARTITION_SPLIT_BYTES),
    PARTITION_EVALUATION_INTERVAL_MS: String(PARTITION_EVAL_INTERVAL_MS),
  };
  const args = ['src/index.js', '--data-dir', dataDir];
  if (index > 0) {
    env.SEED_NODE_ADDRESS = `localhost:${BASE_REST_PORT}`;
    args.push('--seed', `localhost:${BASE_REST_PORT}`);
  }
  const child = spawn('node', args, {env, stdio: ['ignore', 'pipe', 'pipe']});
  child.stdout.pipe(logStream);
  child.stderr.pipe(logStream);
  return {index, process: child};
}

async function queryRows(sql) {
  const client = new AdminWsClient({target: TARGET, timeoutMs: 15000});
  try {
    const result = await client.query(sql);
    return result?.results || result?.rows || [];
  } finally {
    await client.close();
  }
}

async function waitFor(label, predicate, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    let value = null;
    try {
      value = await predicate();
    } catch {
      value = null;
    }
    if (value) {
      return value;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`Timed out waiting for ${label} after ${timeoutMs}ms`);
}

async function waitForAdmin() {
  await waitFor('seed admin endpoint', async () => {
    await queryRows('SELECT 1');
    return true;
  }, 60000);
}

const MAX_JOIN_RESTARTS = 5;

// Node processes are supervised like an orchestrator would: a joiner
// that exhausts its (deliberately impatient) join retry budget and
// exits — e.g. because the seed's leader-metadata view is briefly
// stale after a leadership move — is simply respawned with a fresh
// data dir until the cluster reaches the expected size.
async function waitForActiveNodes(expectedCount, nodes, dataRoot) {
  await waitFor(`${expectedCount} active nodes`, async () => {
    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i];
      if (node.process.exitCode === null) {
        continue;
      }
      node.restarts = (node.restarts || 0) + 1;
      if (node.restarts > MAX_JOIN_RESTARTS) {
        throw new Error(
          `node-${node.index} exceeded ` +
          `${MAX_JOIN_RESTARTS} join restarts`);
      }
      console.log(
        `      node-${node.index} exited before joining ` +
        `(exit=${node.process.exitCode}); respawning ` +
        `(attempt ${node.restarts}/${MAX_JOIN_RESTARTS})...`);
      const dataDir = resolve(dataRoot, `node-${node.index}`);
      await rm(dataDir, {recursive: true, force: true});
      const respawned = await startNode(node.index, dataRoot);
      respawned.restarts = node.restarts;
      nodes[i] = respawned;
    }
    const rows = await queryRows('SELECT node_id, status FROM nodes');
    const active = rows.filter((r) => r.status === NODE_STATUS_ACTIVE);
    return active.length >= expectedCount ? true : null;
  }, CLUSTER_FORM_TIMEOUT_MS);
}

function sqlQuote(value) {
  return `'${String(value).replace(/'/g, '\'\'')}'`;
}

async function waitForControlPlaneSettling() {
  const start = Date.now();
  let quietPolls = 0;
  let lastPartitionCount = -1;
  while (Date.now() - start < SETTLE_TIMEOUT_MS) {
    let inFlight = null;
    let partitionCount = -1;
    try {
      const rows = await queryRows(
        'SELECT operation_id, completed_at FROM replica_operations');
      inFlight = rows.filter((r) => !r.completed_at).length;
      const partitions = await queryRows(
        'SELECT partition_id FROM partitions');
      partitionCount = partitions.length;
    } catch {
      inFlight = null;
    }
    const partitionsStable = partitionCount === lastPartitionCount;
    lastPartitionCount = partitionCount;
    if (inFlight === 0 && partitionsStable) {
      quietPolls += 1;
      if (quietPolls >= SETTLE_QUIET_POLLS) {
        console.log(
          '      Control plane settled (no in-flight operations for ' +
          `${Math.round((SETTLE_QUIET_POLLS * SETTLE_POLL_INTERVAL_MS) /
            1000)}s).`);
        return true;
      }
    } else {
      quietPolls = 0;
      if (inFlight !== null) {
        console.log(`      ...${inFlight} operations in flight`);
      }
    }
    await sleep(SETTLE_POLL_INTERVAL_MS);
  }
  console.log(
    '      Control plane still settling after ' +
    `${Math.round(SETTLE_TIMEOUT_MS / 1000)}s — proceeding anyway.`);
  return false;
}

async function deployQueryLoopService() {
  const now = Date.now();
  const runtimeConfig = JSON.stringify({
    sql: SCAN_SQL,
    intervalMs: QUERY_INTERVAL_MS,
    reduce: {
      groupBy: 'movie_id',
      aggregate: 'avg',
      valueColumn: 'rating',
      limit: 10,
    },
    resultTable: RESULT_TABLE,
  });
  const columns = [
    'service_id', 'service_name', 'service_profile',
    'handler_function_id', 'read_consistency', 'write_consistency',
    'read_locality', 'replica_count', 'protocol', 'resource_budget',
    'safety_interval_ms', 'runtime_kind', 'runtime_ref',
    'runtime_config', 'status', 'created_at', 'updated_at',
  ];
  const values = [
    sqlQuote(SERVICE_ID), sqlQuote('movielens-topn'), sqlQuote('default'),
    sqlQuote('sql-query-loop'), sqlQuote('strong'), sqlQuote('strong'),
    sqlQuote('same_group'), String(SERVICE_REPLICA_COUNT),
    sqlQuote('websocket'), sqlQuote('{}'),
    '500', sqlQuote('native_js'), sqlQuote('sql-query-loop-runtime'),
    sqlQuote(runtimeConfig), sqlQuote('active'), String(now), String(now),
  ];
  await queryRows(
    `INSERT INTO service_definitions (${columns.join(', ')}) ` +
    `VALUES (${values.join(', ')})`,
  );
}

// The nodes that hold an ACTIVE replica of the partitions "near the
// data" means for this demo: the partitions the service actually
// accessed (from its attribution rows) when known, else every ratings
// (tbl-) partition.
async function describeDataNodes(accessedPartitionIds = null) {
  const partitions = await queryRows(
    'SELECT partition_id, leader_node_id FROM partitions',
  );
  const ratingsPartitions = partitions.filter((p) =>
    String(p.partition_id || '').startsWith('tbl-') &&
    (!accessedPartitionIds || accessedPartitionIds.has(p.partition_id)));
  const ratingsPartitionIds =
    new Set(ratingsPartitions.map((p) => p.partition_id));
  const services = await queryRows(
    'SELECT partition_id, node_id, service_type, status FROM services',
  );
  const holderNodeIds = new Set();
  for (const row of services) {
    if (row.service_type === 'partition' &&
        row.status === NODE_STATUS_ACTIVE &&
        ratingsPartitionIds.has(row.partition_id) &&
        row.node_id) {
      holderNodeIds.add(row.node_id);
    }
  }
  return {
    partitionCount: ratingsPartitions.length,
    holderNodeIds,
    leaderNodeIds: ratingsPartitions
      .map((p) => p.leader_node_id)
      .filter(Boolean),
  };
}

async function describeServicePlacement() {
  const rows = await queryRows(
    'SELECT service_id, node_id, status FROM services',
  );
  return rows
    .filter((r) =>
      String(r.service_id || '').startsWith(SERVICE_ID) &&
      r.status === NODE_STATUS_ACTIVE && r.node_id)
    .map((r) => ({replicaId: r.service_id, nodeId: r.node_id}));
}

async function describeAttribution() {
  const rows = await queryRows(
    'SELECT node_id, service_id, access_json, published_at ' +
    'FROM service_partition_access',
  );
  return rows.filter((r) => r.service_id === SERVICE_ID);
}

function accessedPartitionIdsOf(attributionRows) {
  const ids = new Set();
  for (const row of attributionRows) {
    try {
      for (const partitionId of Object.keys(JSON.parse(row.access_json))) {
        ids.add(partitionId);
      }
    } catch {
      // Unparseable attribution rows carry no partition evidence.
    }
  }
  return ids.size > 0 ? ids : null;
}

async function stopNodes(nodes) {
  for (const node of nodes) {
    if (node?.process && node.process.exitCode === null) {
      node.process.kill('SIGTERM');
    }
  }
  const deadline = Date.now() + 15000;
  for (const node of nodes) {
    while (node?.process && node.process.exitCode === null &&
      Date.now() < deadline) {
      await sleep(250);
    }
    if (node?.process && node.process.exitCode === null) {
      node.process.kill('SIGKILL');
    }
  }
}

async function runAffinityDemo() {
  const nodes = [];
  await rm(CLUSTER_DATA_ROOT, {recursive: true, force: true});
  await mkdir(CLUSTER_DATA_ROOT, {recursive: true});

  try {
    console.log(`[1/4] Starting ${NODE_COUNT} nodes (single zone)...`);
    nodes.push(await startNode(0, CLUSTER_DATA_ROOT));
    await waitForAdmin();
    for (let i = 1; i < NODE_COUNT; i += 1) {
      nodes.push(await startNode(i, CLUSTER_DATA_ROOT));
    }
    await waitForActiveNodes(NODE_COUNT, nodes, CLUSTER_DATA_ROOT);
    console.log('      Cluster formed.');
    console.log('      Waiting for formation settling...');
    await waitForControlPlaneSettling();

    console.log('[2/4] Loading movielens ratings (replicas land on ' +
      'SOME of the nodes — that asymmetry is the point)...');
    const totalRows = await loadRatingsIntoLagrange({target: TARGET});
    console.log(`      Loaded ${totalRows} ratings.`);
    console.log('      Waiting for post-load settling...');
    await waitForControlPlaneSettling();
    const dataNodes = await describeDataNodes();
    console.log(
      `      Ratings partitions: ${dataNodes.partitionCount}, ` +
      `data on nodes: ${JSON.stringify([...dataNodes.holderNodeIds])}`);

    console.log(
      `[3/4] Deploying the ${SERVICE_ID} runtime service ` +
      `(${SERVICE_REPLICA_COUNT} replicas, read_locality=same_group): ` +
      'full-table scan fanned out across all partitions, top-10 ' +
      'reduced IN-SERVICE, 10-row result written back)...');
    await queryRows(CREATE_RESULT_TABLE_SQL);
    await deployQueryLoopService();

    console.log('[4/4] Watching code land on / move to its data...');
    const start = Date.now();
    let converged = false;
    let stalled = false;
    let lastProgressSignature = null;
    let lastProgressAtMs = Date.now();
    while (Date.now() - start < CONVERGE_TIMEOUT_MS) {
      await sleep(OBSERVE_INTERVAL_MS);
      const placement = await describeServicePlacement();
      const attribution = await describeAttribution();
      let resultRows = [];
      try {
        resultRows = await queryRows(
          `SELECT rank, group_key, agg_value FROM ${RESULT_TABLE} ` +
          'ORDER BY rank');
      } catch {
        resultRows = [];
      }
      const accessed = accessedPartitionIdsOf(attribution);
      const {holderNodeIds, partitionCount} =
        await describeDataNodes(accessed);
      const onData =
        placement.filter((r) => holderNodeIds.has(r.nodeId)).length;
      const placementLabel = placement.map((r) =>
        `${r.nodeId.slice(0, 8)}${holderNodeIds.has(r.nodeId) ?
          '(data)' :
          '(-)'}`);
      console.log(
        `      t+${Math.round((Date.now() - start) / 1000)}s ` +
        `replicas=${placement.length} onData=${onData} ` +
        `attributionRows=${attribution.length} ` +
        `${accessed ? `accessedPartitions=${accessed.size} ` : ''}` +
        `dataPartitions=${partitionCount} ` +
        `top10Rows=${resultRows.length} ` +
        `placement=${JSON.stringify(placementLabel)}`,
      );
      const progressSignature = JSON.stringify({
        placement: placementLabel.sort(),
        attributionRows: attribution.length,
        top10Rows: resultRows.length,
      });
      if (progressSignature !== lastProgressSignature) {
        lastProgressSignature = progressSignature;
        lastProgressAtMs = Date.now();
      } else if (Date.now() - lastProgressAtMs > STALL_TIMEOUT_MS) {
        stalled = true;
        console.log(
          '\n      STALLED: no observable progress for ' +
          `${Math.round(STALL_TIMEOUT_MS / 1000)}s ` +
          `(replicas=${placement.length}, onData=${onData}, ` +
          `attributionRows=${attribution.length}) — aborting early. ` +
          'Something in the placement/attribution chain is not ' +
          'engaging; check the rebalancer and runtime-service-handler ' +
          'logs under the cluster data dir.\n');
        break;
      }
      if (placement.length >= SERVICE_REPLICA_COUNT &&
          onData === placement.length &&
          resultRows.length >= 10) {
        converged = true;
        console.log(
          `\n      CONVERGED: every ${SERVICE_ID} replica now runs ON ` +
          'a node holding the ratings data it scans, and the ' +
          'in-service reduce delivered the top-10:\n');
        for (const row of resultRows) {
          console.log(
            `        #${row.rank} movie ${row.group_key} ` +
            `avg=${Number(row.agg_value).toFixed(3)}`);
        }
        console.log('');
        break;
      }
    }
    const finalDataNodes = await describeDataNodes();
    let finalTop10 = [];
    try {
      finalTop10 = await queryRows(
        `SELECT rank, group_key, agg_value FROM ${RESULT_TABLE} ` +
        'ORDER BY rank');
    } catch {
      finalTop10 = [];
    }
    return {
      converged,
      stalled,
      elapsedMs: Date.now() - start,
      finalPlacement: await describeServicePlacement(),
      dataNodes: [...finalDataNodes.holderNodeIds],
      attributionRows: (await describeAttribution()).length,
      top10: finalTop10.map((r) =>
        `#${r.rank} movie ${r.group_key} avg=` +
        Number(r.agg_value).toFixed(3)),
    };
  } finally {
    console.log('Stopping cluster...');
    await stopNodes(nodes);
  }
}

if (process.argv[1]?.includes('run-affinity-demo.js')) {
  runAffinityDemo()
    .then((result) => {
      console.log('Affinity demo result:');
      console.log(JSON.stringify(result, null, 2));
      process.exitCode = result.converged ? 0 : 1;
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

export {runAffinityDemo};
