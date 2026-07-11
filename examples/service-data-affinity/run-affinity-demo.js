/**
 * Tier-3 demo of the service↔data affinity placement epic
 * (solve/epics/service-data-affinity-placement.md): CODE MOVES TO ITS
 * DATA, live — at NODE granularity, inside a single latency group.
 *
 * Latency groups exist for CDC fan-out efficiency; the placement
 * thesis this demo proves is independent of them. The controlled A/B
 * first observes the deployed service with affinity disabled, then
 * changes only read_locality and watches the same replicas converge to
 * the best production-equivalent weighted node placement.
 *
 * The story:
 *   1. A 5-node cluster starts (no zone pinning — one latency domain),
 *      with a deliberately small partition split threshold so the
 *      ratings table is FORCED to split into several partitions —
 *      real parallelism: multiple raft groups, multiple leaders,
 *      parallel write targets for the loader.
 *   2. The movielens ratings are loaded and split across partitions
 *      whose replicas land on different node subsets. A centralized
 *      full-scan/reduce baseline records the 100k-row transfer and the
 *      exact top-10 reference result.
 *   3. A REAL runtime service is deployed (service_definitions row,
 *      runtime_kind native_js, runtime_ref sql-query-loop-runtime)
 *      initially with read_locality='any'. Stable leased slot 1 reduces
 *      movie ids <= 1000 and slot 2 reduces ids > 1000. Because group
 *      keys are disjoint, the slot-1 replica can exactly merge the two
 *      atomic partial top-10 snapshots while exchanging at most 20
 *      candidates. Slot ownership survives replica REPLACE generations.
 *   4. After recording the affinity-off placement, the demo switches
 *      the same service to read_locality='same_group'. Every statement
 *      is attributed into
 *      service_partition_access; the runtime-service rebalancer lifts
 *      the per-node weights into a DATA_AFFINITY placement policy; the
 *      planner puts/pulls the service replicas onto the highest-weight
 *      nodes. The result must remain identical to the centralized
 *      reference throughout.
 *
 * Local processes only (no Docker): the staged bring-up needs process
 * control.
 *
 * Usage:
 *   node examples/movielens-access-affinity/download-movielens.js
 *   node examples/service-data-affinity/run-affinity-demo.js
 */

import {execFile, spawn} from 'node:child_process';
import {createWriteStream, existsSync} from 'node:fs';
import {mkdir, readdir, rm, stat, writeFile} from 'node:fs/promises';
import {promisify} from 'node:util';
import {resolve} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {AdminWsClient} from '../../scripts/examples/admin-ws-client.js';
import {
  loadRatingsIntoLagrange,
} from '../../examples/movielens-access-affinity/lagrange-loader.js';
import {
  computeReduction,
} from '../../src/runtime/sql-query-loop-runtime-module.js';
import {
  assessAffinityDemoCompletion,
  buildWeightedLocalitySnapshot,
  topNRowsEqual,
} from './affinity-demo-evidence.js';

const NODE_COUNT = 5;
const BASE_REST_PORT = 8080;
const BASE_ADMIN_PORT = 8081;
const PORT_STRIDE = 4;
const CLUSTER_DATA_ROOT = 'data/examples/service-data-affinity-demo';
const REPORT_DIR = 'test-output/reports';
const LIVE_SCENARIO = 'service-data-affinity-parallel-reduce-demo-live';
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
// Staleness-based settle (same principle as the phase-3 convergence watch):
// keep waiting while formation ops are COMPLETING — runs 15-19 proved a
// fixed elapsed-time cap fires mid-churn and the load phase then starves
// behind the rebalance storm. Cut only when nothing completes for the
// stall window (genuine wedge — proceed and let the run fail loudly) or at
// a generous absolute ceiling.
const SETTLE_STALL_MS = 120000;
const SETTLE_HARD_CAP_MS = 900000;

const PARTITION_SPLIT_BYTES = 1048576;
// Config floor: partition.evaluationIntervalMs must be >= 60000.
const PARTITION_EVAL_INTERVAL_MS = 60000;

const SERVICE_ID = 'svc-movielens-topn';
const SERVICE_REPLICA_COUNT = 2;
// The centralized reference scans the whole table. The deployed
// service splits movie-id groups into two disjoint SQL shards, reduces
// them concurrently on two replicas, and exchanges only their top-N
// candidates for the final exact merge.
const SCAN_SQL = 'SELECT movie_id, rating FROM ratings';
const MOVIE_ID_SHARD_BOUNDARY = 1000;
const SHARD_SQL_BY_SLOT = Object.freeze({
  1: `${SCAN_SQL} WHERE movie_id <= ${MOVIE_ID_SHARD_BOUNDARY}`,
  2: `${SCAN_SQL} WHERE movie_id > ${MOVIE_ID_SHARD_BOUNDARY}`,
});
const RESULT_TABLE = 'movielens_top10';
const COORDINATION_TABLE = 'movielens_top10_reduce_slots';
const RESULT_ID = 'global-top10';
const CREATE_RESULT_TABLE_SQL =
  `CREATE TABLE IF NOT EXISTS ${RESULT_TABLE} (` +
  'result_id TEXT PRIMARY KEY, result_json TEXT, computed_at INTEGER)';
const CREATE_COORDINATION_TABLE_SQL =
  `CREATE TABLE IF NOT EXISTS ${COORDINATION_TABLE} (` +
  'slot_id INTEGER PRIMARY KEY, replica_id TEXT, ' +
  'lease_expires_at INTEGER, partial_json TEXT, computed_at INTEGER)';
const QUERY_INTERVAL_MS = 5000;
const TOP_N = 10;
const REDUCE_SLOT_LEASE_MS = 30000;
const PARALLEL_REDUCE_CONFIG = Object.freeze({
  shardSqlBySlot: SHARD_SQL_BY_SLOT,
  coordinationTable: COORDINATION_TABLE,
  leaseMs: REDUCE_SLOT_LEASE_MS,
  coordinatorSlot: 1,
  resultId: RESULT_ID,
});

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
  let lastCompletedCount = -1;
  let lastProgressAt = Date.now();
  while (Date.now() - start < SETTLE_HARD_CAP_MS) {
    let inFlight = null;
    let completedCount = null;
    let partitionCount = -1;
    try {
      const rows = await queryRows(
        'SELECT operation_id, completed_at FROM replica_operations');
      inFlight = rows.filter((r) => !r.completed_at).length;
      completedCount = rows.length - inFlight;
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
      // Completions (or the op set shrinking) are PROGRESS — keep waiting.
      // Only a genuine stall (nothing completes for the stall window) cuts
      // the settle early; a fixed elapsed cap fired mid-churn every run
      // and starved the load phase behind the formation rebalance storm.
      if (
        completedCount !== null &&
        (completedCount !== lastCompletedCount || inFlight === 0)
      ) {
        lastCompletedCount = completedCount;
        lastProgressAt = Date.now();
      }
      if (inFlight !== null) {
        console.log(
          `      ...${inFlight} operations in flight ` +
          `(${completedCount} completed)`);
      }
      if (Date.now() - lastProgressAt >= SETTLE_STALL_MS) {
        console.log(
          '      Control plane settling STALLED (no operation completed ' +
          `for ${Math.round(SETTLE_STALL_MS / 1000)}s) — proceeding anyway.`);
        return false;
      }
    }
    await sleep(SETTLE_POLL_INTERVAL_MS);
  }
  console.log(
    '      Control plane still settling after ' +
    `${Math.round(SETTLE_HARD_CAP_MS / 1000)}s — proceeding anyway.`);
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
      limit: TOP_N,
    },
    resultTable: RESULT_TABLE,
    parallelReduce: PARALLEL_REDUCE_CONFIG,
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
    sqlQuote('any'), String(SERVICE_REPLICA_COUNT),
    sqlQuote('websocket'), sqlQuote('{}'),
    '500', sqlQuote('native_js'), sqlQuote('sql-query-loop-runtime'),
    sqlQuote(runtimeConfig), sqlQuote('active'), String(now), String(now),
  ];
  await queryRows(
    `INSERT INTO service_definitions (${columns.join(', ')}) ` +
    `VALUES (${values.join(', ')})`,
  );
}

async function enableNodeAffinity() {
  await queryRows(
    'UPDATE service_definitions SET read_locality = \'same_group\', ' +
    `updated_at = ${Date.now()} WHERE service_id = ${sqlQuote(SERVICE_ID)}`,
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

async function describeReduceSlots() {
  try {
    return await queryRows(
      'SELECT slot_id, replica_id, lease_expires_at, partial_json, ' +
      `computed_at FROM ${COORDINATION_TABLE}`,
    );
  } catch {
    return [];
  }
}

async function describeTopN() {
  try {
    const rows = await queryRows(
      `SELECT result_json, computed_at FROM ${RESULT_TABLE} ` +
      `WHERE result_id = ${sqlQuote(RESULT_ID)}`,
    );
    const parsed = JSON.parse(rows[0]?.result_json || '[]');
    return parsed.map((row, index) => ({
      rank: index + 1,
      group_key: row.groupKey,
      agg_value: row.aggValue,
      computed_at: rows[0]?.computed_at,
    }));
  } catch {
    return [];
  }
}

async function describeWeightedLocality(placements, attributionRows) {
  const [nodes, partitions, services] = await Promise.all([
    queryRows('SELECT node_id, latency_group_id FROM nodes'),
    queryRows('SELECT partition_id, leader_node_id FROM partitions'),
    queryRows(
      'SELECT partition_id, node_id, service_type, status FROM services',
    ),
  ]);
  return buildWeightedLocalitySnapshot({
    serviceId: SERVICE_ID,
    placements,
    nodes,
    partitions,
    services,
    attributionRows,
    nowMs: Date.now(),
  });
}

async function describeDemoState(referenceTopN, phaseStartedAt) {
  const [placements, attributionRows, serviceTopN, reduceSlots] =
    await Promise.all([
      describeServicePlacement(),
      describeAttribution(),
      describeTopN(),
      describeReduceSlots(),
    ]);
  const weightedLocality = await describeWeightedLocality(
    placements, attributionRows,
  );
  const assessment = assessAffinityDemoCompletion({
    expectedReplicaCount: SERVICE_REPLICA_COUNT,
    placements,
    weightedLocality,
    referenceTopN,
    serviceTopN,
    reduceSlots,
    expectedMergeCandidateCount: SERVICE_REPLICA_COUNT * TOP_N,
    phaseStartedAt,
    parallelReduceConfig: PARALLEL_REDUCE_CONFIG,
    partialLimit: TOP_N,
  });
  return {
    placements,
    attributionRows,
    serviceTopN,
    reduceSlots,
    weightedLocality,
    assessment,
  };
}

async function observeDemoPhase(label, referenceTopN, phaseStartedAt, accept) {
  const start = Date.now();
  let lastProgressSignature = null;
  let lastProgressAtMs = Date.now();
  while (Date.now() - start < CONVERGE_TIMEOUT_MS) {
    await sleep(OBSERVE_INTERVAL_MS);
    const state = await describeDemoState(referenceTopN, phaseStartedAt);
    const placementLabel = state.placements.map((placement) =>
      placement.nodeId.slice(0, 8));
    console.log(
      `      ${label} t+${Math.round((Date.now() - start) / 1000)}s ` +
      `replicas=${state.placements.length} ` +
      `weightedLocality=${state.weightedLocality.localityRatio.toFixed(3)} ` +
      `attributionRows=${state.attributionRows.length} ` +
      `partialReplicas=${state.assessment.partialReplicaCount} ` +
      `mergeCandidates=${state.assessment.mergeCandidateCount} ` +
      `top10Correct=${state.assessment.resultCorrect} ` +
      `placement=${JSON.stringify(placementLabel)}`,
    );
    if (accept(state)) {
      return {
        ...state,
        phaseStartedAt,
        elapsedMs: Date.now() - start,
      };
    }
    const progressSignature = JSON.stringify({
      placementLabel: placementLabel.sort(),
      locality: state.weightedLocality.localityRatio,
      attributionRows: state.attributionRows.length,
      partialReplicas: state.assessment.partialReplicaCount,
      resultCorrect: state.assessment.resultCorrect,
    });
    if (progressSignature !== lastProgressSignature) {
      lastProgressSignature = progressSignature;
      lastProgressAtMs = Date.now();
    } else if (Date.now() - lastProgressAtMs > STALL_TIMEOUT_MS) {
      throw new Error(
        `${label} stalled with no observable progress for ` +
        `${Math.round(STALL_TIMEOUT_MS / 1000)}s`,
      );
    }
  }
  throw new Error(`${label} did not converge within ${CONVERGE_TIMEOUT_MS}ms`);
}

function summarizeReduceSlots(reduceSlots) {
  return reduceSlots.map((slot) => ({
    slotId: Number(slot.slot_id),
    replicaId: slot.replica_id,
    leaseExpiresAt: Number(slot.lease_expires_at),
    computedAt: Number(slot.computed_at),
    candidateCount: JSON.parse(slot.partial_json).length,
  }));
}

function summarizePhase(state) {
  return {
    phaseStartedAt: state.phaseStartedAt,
    weightedLocality: state.weightedLocality.localityRatio,
    placement: state.placements,
    slotOwners: summarizeReduceSlots(state.reduceSlots),
    resultComputedAt: Number(state.serviceTopN[0]?.computed_at) || 0,
    assessment: state.assessment,
    elapsedMs: state.elapsedMs,
  };
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

const execFileAsync = promisify(execFile);
const ARCHIVE_ROOT = `${CLUSTER_DATA_ROOT}-archive`;
const ARCHIVE_RETENTION = 3;
const AUTO_ARCHIVE_NAME_PATTERN = /^run-\d{4}-\d{2}-\d{2}T.*\.tar\.gz$/;

/**
 * Archive the previous run's cluster state (logs + SQLite) before wiping —
 * run-13's forensics were destroyed by the unconditional wipe and the
 * root-cause investigation had to work from a later run. Keeps the newest
 * ARCHIVE_RETENTION archives (~15-30MB each gzipped).
 */
async function archivePreviousRun() {
  if (!existsSync(CLUSTER_DATA_ROOT)) {
    return;
  }
  await mkdir(ARCHIVE_ROOT, {recursive: true});
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const archivePath = resolve(ARCHIVE_ROOT, `run-${stamp}.tar.gz`);
  try {
    await execFileAsync('tar', [
      '-czf', archivePath,
      '-C', resolve(CLUSTER_DATA_ROOT, '..'),
      CLUSTER_DATA_ROOT.split('/').pop(),
    ]);
    console.log(`      Archived previous run state to ${archivePath}`);
  } catch (error) {
    console.log(
      `      (previous-run archive failed: ${error.message} — proceeding)`);
    return;
  }
  const archiveNames = (await readdir(ARCHIVE_ROOT))
    .filter((name) => AUTO_ARCHIVE_NAME_PATTERN.test(name));
  const entries = await Promise.all(archiveNames.map(async (name) => ({
    name,
    mtimeMs: (await stat(resolve(ARCHIVE_ROOT, name))).mtimeMs,
  })));
  entries.sort((left, right) => left.mtimeMs - right.mtimeMs);
  while (entries.length > ARCHIVE_RETENTION) {
    const oldest = entries.shift();
    await rm(resolve(ARCHIVE_ROOT, oldest.name), {force: true});
  }
}

async function runAffinityDemo() {
  const nodes = [];
  await archivePreviousRun();
  await rm(CLUSTER_DATA_ROOT, {recursive: true, force: true});
  await mkdir(CLUSTER_DATA_ROOT, {recursive: true});

  try {
    console.log(`[1/5] Starting ${NODE_COUNT} nodes (single zone)...`);
    nodes.push(await startNode(0, CLUSTER_DATA_ROOT));
    await waitForAdmin();
    for (let i = 1; i < NODE_COUNT; i += 1) {
      nodes.push(await startNode(i, CLUSTER_DATA_ROOT));
    }
    await waitForActiveNodes(NODE_COUNT, nodes, CLUSTER_DATA_ROOT);
    console.log('      Cluster formed.');
    console.log('      Waiting for formation settling...');
    await waitForControlPlaneSettling();

    console.log('[2/5] Loading movielens ratings (replicas land on ' +
      'SOME of the nodes — that asymmetry is the point)...');
    const totalRows = await loadRatingsIntoLagrange({target: TARGET});
    console.log(`      Loaded ${totalRows} ratings.`);
    console.log('      Waiting for post-load settling...');
    await waitForControlPlaneSettling();
    const dataNodes = await describeDataNodes();
    console.log(
      `      Ratings partitions: ${dataNodes.partitionCount}, ` +
      `data on nodes: ${JSON.stringify([...dataNodes.holderNodeIds])}`);

    console.log('[3/5] Running the centralized reference reduce...');
    const centralizedStart = Date.now();
    const centralizedRows = await queryRows(SCAN_SQL);
    const referenceTopN = computeReduction(centralizedRows, {
      groupBy: 'movie_id',
      aggregate: 'avg',
      valueColumn: 'rating',
      limit: TOP_N,
    }).map((row, index) => ({
      rank: index + 1,
      group_key: row.groupKey,
      agg_value: row.aggValue,
    }));
    const centralizedElapsedMs = Date.now() - centralizedStart;
    console.log(
      `      Centralized baseline transferred ${centralizedRows.length} ` +
      `rows and reduced them in ${centralizedElapsedMs}ms.`);

    console.log(
      `[4/5] Deploying the ${SERVICE_ID} runtime service ` +
      `(${SERVICE_REPLICA_COUNT} replicas, affinity OFF): disjoint ` +
      'movie-id shards reduce in parallel, publish 10 candidates each, ' +
      'and the slot-1 replica performs the exact bounded merge)...');
    await queryRows(CREATE_RESULT_TABLE_SQL);
    await queryRows(CREATE_COORDINATION_TABLE_SQL);
    await queryRows(
      `INSERT INTO ${RESULT_TABLE} (result_id, result_json, computed_at) ` +
      `VALUES (${sqlQuote(RESULT_ID)}, '[]', 0)`,
    );
    await queryRows(
      `INSERT INTO ${COORDINATION_TABLE} ` +
      '(slot_id, replica_id, lease_expires_at, partial_json, computed_at) ' +
      'VALUES (1, \'\', 0, \'[]\', 0), (2, \'\', 0, \'[]\', 0)',
    );
    const affinityOffStartedAt = Date.now();
    await deployQueryLoopService();
    const affinityOff = await observeDemoPhase(
      'affinity-off',
      referenceTopN,
      affinityOffStartedAt,
      (state) =>
        state.placements.length === SERVICE_REPLICA_COUNT &&
        state.assessment.partialReplicaCount === SERVICE_REPLICA_COUNT &&
        state.assessment.identitiesCurrent &&
        state.assessment.partialsFresh &&
        state.assessment.partialsBounded &&
        state.assessment.resultFresh &&
        state.assessment.resultCorrect,
    );

    console.log(
      '[5/5] Enabling node affinity for the SAME service and workload...');
    const affinityOnStartedAt = Date.now();
    await enableNodeAffinity();
    const affinityOn = await observeDemoPhase(
      'affinity-on', referenceTopN, affinityOnStartedAt,
      (state) => state.assessment.complete,
    );
    const improved = affinityOn.weightedLocality.localityRatio >
      affinityOff.weightedLocality.localityRatio;
    const retainedOptimum = !improved &&
      affinityOff.weightedLocality.localityRatio >= 1;
    console.log(
      '\n      CONVERGED: affinity-on reached the best achievable weighted ' +
      `node placement (${improved ? 'improved from baseline' :
        'baseline was already optimal and was retained'}).`);
    console.log(
      '      Cross-replica exchange was bounded to ' +
      `${affinityOn.assessment.mergeCandidateCount} partial candidates; ` +
      `the centralized baseline returned ${centralizedRows.length} ratings ` +
      'to its caller. The top-10 is identical:\n');
    for (const row of affinityOn.serviceTopN) {
      console.log(
        `        #${row.rank} movie ${row.group_key} ` +
        `avg=${Number(row.agg_value).toFixed(3)}`);
    }
    console.log('');
    return {
      converged: affinityOn.assessment.complete,
      centralized: {
        transferredRows: centralizedRows.length,
        elapsedMs: centralizedElapsedMs,
      },
      parallelReduce: {
        replicas: SERVICE_REPLICA_COUNT,
        mergeCandidates: affinityOn.assessment.mergeCandidateCount,
        elapsedToFirstCorrectResultMs: affinityOff.elapsedMs,
      },
      affinityOff: summarizePhase(affinityOff),
      affinityOn: {
        ...summarizePhase(affinityOn),
        improved,
        retainedOptimum,
      },
      resultCorrect: topNRowsEqual(referenceTopN, affinityOn.serviceTopN),
      top10: affinityOn.serviceTopN.map((r) =>
        `#${r.rank} movie ${r.group_key} avg=` +
        Number(r.agg_value).toFixed(3)),
    };
  } finally {
    console.log('Stopping cluster...');
    await stopNodes(nodes);
  }
}

async function writeLiveDemoReport(result, error) {
  const timestamp = new Date().toISOString();
  const passed = Boolean(result?.converged) && !error;
  const report = {
    timestamp,
    scenario: LIVE_SCENARIO,
    producer: 'service-data-affinity-demo',
    fidelity: 'live',
    summary: {total: 1, passed: passed ? 1 : 0, failed: passed ? 0 : 1},
    optimizationSummary: {totalPriorityItems: passed ? 0 : 1},
    standardSummary: {
      scenarios: [{
        scenario: LIVE_SCENARIO,
        passed,
        current: {passed, verdict: passed ? 'PASS' : 'FAIL'},
        detail: {
          result: result || null,
          error: error?.message || null,
        },
      }],
    },
  };
  await mkdir(REPORT_DIR, {recursive: true});
  const fileStamp = timestamp.replace(/[:.]/g, '-');
  const reportPath = resolve(
    REPORT_DIR, `${LIVE_SCENARIO}-${fileStamp}.report.json`,
  );
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`Live demo report: ${reportPath}`);
}

if (process.argv[1]?.includes('run-affinity-demo.js')) {
  runAffinityDemo()
    .then(async (result) => {
      await writeLiveDemoReport(result, null);
      console.log('Affinity demo result:');
      console.log(JSON.stringify(result, null, 2));
      process.exitCode = result.converged ? 0 : 1;
    })
    .catch(async (error) => {
      await writeLiveDemoReport(null, error);
      console.error(error);
      process.exitCode = 1;
    });
}

export {runAffinityDemo, summarizePhase};
