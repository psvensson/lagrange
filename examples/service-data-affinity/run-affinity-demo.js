/**
 * Tier-3 demo of the service↔data affinity placement epic
 * (solve/epics/service-data-affinity-placement.md): CODE MOVES TO ITS
 * DATA, live — at NODE granularity, inside a single latency group.
 *
 * Latency groups exist for CDC fan-out efficiency; the placement thesis
 * is independent of them. Data affinity is intrinsic: the service starts
 * without an access history, its normal queries publish attribution, and
 * placement learns the best production-weighted node set.
 *
 * The story:
 *   1. The ratings schema bootstraps on the seed, then four nodes join (no
 *      zone pinning — one latency domain). Once the expanded control plane is
 *      routable, the dataset loads and a deliberately small split threshold
 *      forces several partitions across the cluster — real parallelism:
 *      multiple raft groups and multiple leaders.
 *   2. The movielens ratings are loaded and split across partitions
 *      whose replicas land on different node subsets. Distributed
 *      grouped SQL emits one AVG/COUNT row per movie and establishes the
 *      confidence-adjusted top-10 reference result.
 *   3. A REAL runtime service is deployed (service_definitions row,
 *      runtime_kind native_js, runtime_ref sql-query-loop-runtime)
 *      with read_locality='any' (routing choice, not an affinity switch).
 *      Stable leased slot 1 reduces
 *      movie ids <= 1000 and slot 2 reduces ids > 1000. Because group
 *      keys are disjoint, the slot-1 replica can exactly merge the two
 *      atomic partial top-10 snapshots while exchanging at most 20
 *      candidates. Slot ownership survives replica REPLACE generations.
 *   4. Every statement is attributed into service_partition_access; the
 *      runtime-service rebalancer always lifts fresh per-node weights
 *      into DATA_AFFINITY placement. The planner converges service
 *      replicas onto the highest-weight nodes without a public enable
 *      toggle. The service result must match distributed SQL.
 *
 * Local processes only (no Docker): the staged bring-up needs process
 * control.
 *
 * Usage:
 *   node examples/service-data-affinity/download-movielens.js
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
  createRatingsTableWithRetry,
  loadRatingsIntoLagrange,
} from './lagrange-loader.js';
import {
  assessAffinityDemoCompletion,
  buildWeightedLocalitySnapshot,
  topNRowsEqual,
} from './affinity-demo-evidence.js';
import {
  QUALITY_RANKING,
  RATINGS_AGGREGATE_SQL,
  rankMovieQuality,
} from './movie-ranking.js';

const NODE_COUNT = 5;
const BASE_REST_PORT = 8080;
const BASE_ADMIN_PORT = 8081;
const PORT_STRIDE = 4;
const CLUSTER_DATA_ROOT = 'data/examples/service-data-affinity-demo';
const REPORT_DIR = 'test-output/reports';
const LIVE_SCENARIO = 'movielens-lagrange-service-affinity-live';
// Quest-scoped scenario entry (solve/quests/
// formation-ledger-self-move-blocks-cluster-ops.json): its sealed doneWhen is
// "the cold-formation control plane settles and load completes", i.e. exactly
// the demo's settle + ratings-load milestones — NOT the full affinity
// convergence the primary scenario asserts. The live report carries both
// entries so the Solver's scenario-harness probe measures each quest against
// its own bar from the same run.
const FORMATION_QUEST_SCENARIO =
  'formation-ledger-self-move-blocks-cluster-ops';
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
const OPERATION_LEDGER_PARTITION_ID = 'replica_operations-p1';
const LEDGER_VOTER_STATUSES = new Set(['active', 'removing']);
const LEDGER_VOTER_ROLES = new Set(['leader', 'follower', 'candidate']);

// Cluster transitions (formation, data load) leave replica operations
// running; writes to a partition mid-move can transiently fail, so the
// demo waits for IN-FLIGHT operations (no completed_at yet) to drain
// before the next stage. Bounded and fail-closed on timeout.
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
// The distributed-SQL reference groups the table to one row per movie.
// The deployed service runs the richer confidence-adjusted ranking on
// two disjoint movie-id shards and exchanges only their top-N candidates.
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
  }, CLUSTER_FORM_TIMEOUT_MS);
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

function evaluateLedgerSpreadRows(rows) {
  const voters = (Array.isArray(rows) ? rows : []).filter((row) =>
    LEDGER_VOTER_STATUSES.has(String(row?.status || '').toLowerCase()) &&
    LEDGER_VOTER_ROLES.has(String(row?.raft_role || '').toLowerCase()));
  if (voters.length < 3) {
    return {ready: false, voterCount: voters.length, maxOnOneNode: null};
  }
  const perNode = new Map();
  for (const voter of voters) {
    const nodeId = String(voter?.node_id || '');
    perNode.set(nodeId, (perNode.get(nodeId) || 0) + 1);
  }
  const maxOnOneNode = Math.max(...perNode.values());
  const majority = Math.floor(voters.length / 2) + 1;
  return {
    ready: voters.length - maxOnOneNode >= majority,
    voterCount: voters.length,
    maxOnOneNode,
  };
}

async function waitForControlPlaneSettling() {
  const start = Date.now();
  let quietPolls = 0;
  let lastPartitionCount = -1;
  let lastCompletedCount = -1;
  let lastLedgerShape = null;
  let lastProgressAt = Date.now();
  let lastObservedInFlight = null;
  let lastObservedLedgerSpread = null;
  while (Date.now() - start < SETTLE_HARD_CAP_MS) {
    let inFlight = null;
    let ledgerInFlight = null;
    let completedCount = null;
    let partitionCount = -1;
    let ledgerSpread = null;
    try {
      const rows = await queryRows(
        'SELECT operation_id, partition_id, completed_at FROM ' +
        'replica_operations');
      inFlight = rows.filter((r) => !r.completed_at).length;
      ledgerInFlight = rows.filter((row) =>
        !row.completed_at &&
        row.partition_id === OPERATION_LEDGER_PARTITION_ID).length;
      completedCount = rows.length - inFlight;
      const partitions = await queryRows(
        'SELECT partition_id FROM partitions');
      partitionCount = partitions.length;
      const ledgerRows = await queryRows(
        'SELECT node_id, status, raft_role FROM services WHERE ' +
        `partition_id = ${sqlQuote(OPERATION_LEDGER_PARTITION_ID)}`);
      ledgerSpread = evaluateLedgerSpreadRows(ledgerRows);
      lastObservedInFlight = inFlight;
      lastObservedLedgerSpread = ledgerSpread;
    } catch {
      inFlight = null;
    }
    const partitionsStable = partitionCount === lastPartitionCount;
    lastPartitionCount = partitionCount;
    const ledgerShape = ledgerSpread ?
      `${ledgerSpread.voterCount}/${ledgerSpread.maxOnOneNode}/` +
        `${ledgerSpread.ready}` : null;
    const ledgerChanged = ledgerShape !== null && ledgerShape !== lastLedgerShape;
    lastLedgerShape = ledgerShape;
    if (
      inFlight === 0 &&
      ledgerInFlight === 0 &&
      partitionsStable &&
      ledgerSpread?.ready === true
    ) {
      quietPolls += 1;
      if (quietPolls >= SETTLE_QUIET_POLLS) {
        console.log(
          '      Control plane settled (ledger quorum spread and no ' +
          'formation operation in flight for ' +
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
        (completedCount !== lastCompletedCount || ledgerChanged)
      ) {
        lastCompletedCount = completedCount;
        lastProgressAt = Date.now();
      }
      if (inFlight !== null) {
        console.log(
          `      ...${inFlight} operations in flight ` +
          `(${ledgerInFlight ?? '?'} ledger, ${completedCount} completed); ` +
          'ledger voters=' +
          `${ledgerSpread?.voterCount ?? '?'} max-on-node=` +
          `${ledgerSpread?.maxOnOneNode ?? '?'} ` +
          `spread=${ledgerSpread?.ready === true ? 'yes' : 'no'}`);
      }
      if (Date.now() - lastProgressAt >= SETTLE_STALL_MS) {
        if (lastObservedLedgerSpread?.ready === true) {
          throw new Error(
            'Control plane settling stalled after the operation-ledger ' +
            `quorum spread with ${lastObservedInFlight ?? '?'} formation ` +
            `operations still in flight (${Math.round(SETTLE_STALL_MS /
              1000)}s without operation progress)`);
        }
        throw new Error(
          'Control plane settling stalled before the operation-ledger ' +
          `quorum spread (${Math.round(SETTLE_STALL_MS / 1000)}s without ` +
          'operation or ledger-placement progress)');
      }
    }
    await sleep(SETTLE_POLL_INTERVAL_MS);
  }
  if (lastObservedLedgerSpread?.ready === true) {
    throw new Error(
      'Control plane did not drain all formation operations after the ' +
      'operation-ledger quorum spread within ' +
      `${Math.round(SETTLE_HARD_CAP_MS / 1000)}s ` +
      `(in flight: ${lastObservedInFlight ?? '?'})`);
  }
  throw new Error(
    'Control plane did not reach a spread operation-ledger quorum within ' +
    `${Math.round(SETTLE_HARD_CAP_MS / 1000)}s`);
}

async function deployQueryLoopService() {
  const now = Date.now();
  const runtimeConfig = JSON.stringify({
    sql: SCAN_SQL,
    intervalMs: QUERY_INTERVAL_MS,
    reduce: {
      groupBy: 'movie_id',
      aggregate: 'confidence_adjusted_avg',
      valueColumn: 'rating',
      limit: TOP_N,
      ...QUALITY_RANKING,
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

// The nodes that hold an ACTIVE replica of the partitions "near the
// data" means for this demo: the partitions the service actually
// accessed (from its attribution rows) when known, else every ratings
// (tbl-) partition.
async function describeDataNodes(accessedPartitionIds = null) {
  const partitions = await queryRows(
    'SELECT partition_id, table_name, leader_node_id FROM partitions',
  );
  const ratingsPartitions = partitions.filter((p) =>
    p.table_name === 'ratings' &&
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

async function observeInitialPlacement() {
  const start = Date.now();
  while (Date.now() - start < CONVERGE_TIMEOUT_MS) {
    const placements = await describeServicePlacement();
    if (placements.length === SERVICE_REPLICA_COUNT) {
      return {placements, observedAt: Date.now()};
    }
    await sleep(OBSERVE_INTERVAL_MS);
  }
  throw new Error('service replicas were not initially placed');
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

// Mutable milestone record for the formation-quest scenario entry. Updated
// in-place as runAffinityDemo passes each milestone so a thrown phase still
// reports exactly how far the run got.
const formationMilestones = {settled: false, loadCompleted: false};

async function runAffinityDemo() {
  const nodes = [];
  formationMilestones.settled = false;
  formationMilestones.loadCompleted = false;
  await archivePreviousRun();
  await rm(CLUSTER_DATA_ROOT, {recursive: true, force: true});
  await mkdir(CLUSTER_DATA_ROOT, {recursive: true});

  try {
    console.log('[1/5] Bootstrapping the MovieLens schema on the seed...');
    nodes.push(await startNode(0, CLUSTER_DATA_ROOT));
    await waitForAdmin();
    await createRatingsTableWithRetry({target: TARGET});
    // Bootstrap the two small coordination tables on the seed too. Their
    // schemas then scale out with the cluster instead of exercising unrelated
    // cold multi-node DDL while the example is teaching service affinity.
    await queryRows(CREATE_RESULT_TABLE_SQL);
    await queryRows(CREATE_COORDINATION_TABLE_SQL);

    console.log(
      `[2/5] Expanding to ${NODE_COUNT} nodes (single zone) and spreading ` +
      'the existing data...');
    for (let i = 1; i < NODE_COUNT; i += 1) {
      nodes.push(await startNode(i, CLUSTER_DATA_ROOT));
    }
    await waitForActiveNodes(NODE_COUNT, nodes, CLUSTER_DATA_ROOT);
    console.log('      Cluster formed.');
    console.log('      Waiting for formation settling...');
    await waitForControlPlaneSettling();
    formationMilestones.settled = true;

    console.log('      Loading 100,000 ratings into the routable source...');
    const totalRows = await loadRatingsIntoLagrange({target: TARGET});
    console.log(`      Loaded ${totalRows} ratings.`);

    console.log('      Waiting for ratings partitions to split and spread...');
    const dataNodes = await waitFor(
      'ratings partitions on at least two nodes',
      async () => {
        const state = await describeDataNodes();
        return state.partitionCount >= 2 && state.holderNodeIds.size >= 2 ?
          state : null;
      },
      CONVERGE_TIMEOUT_MS,
    );
    console.log(
      `      Ratings partitions: ${dataNodes.partitionCount}, ` +
      `data on nodes: ${JSON.stringify([...dataNodes.holderNodeIds])}`);
    formationMilestones.loadCompleted = true;

    console.log('[3/5] Running Lagrange distributed grouped SQL...');
    const distributedSqlStart = Date.now();
    const aggregateRows = await queryRows(RATINGS_AGGREGATE_SQL);
    const referenceTopN = rankMovieQuality(aggregateRows).map((row, index) => ({
      rank: index + 1,
      group_key: row.movieId,
      agg_value: row.score,
    }));
    const distributedSqlElapsedMs = Date.now() - distributedSqlStart;
    console.log(
      `      Lagrange SQL returned ${aggregateRows.length} grouped rows ` +
      `in ${distributedSqlElapsedMs}ms (rather than ${totalRows} ratings).`);

    console.log(
      `[4/5] Deploying the ${SERVICE_ID} runtime service ` +
      `(${SERVICE_REPLICA_COUNT} replicas, intrinsic data affinity): ` +
      'disjoint movie-id shards compute a confidence-adjusted Bayesian ' +
      'ranking, publish 10 candidates each, and slot 1 merges them)...');
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
    const learnedPhaseStartedAt = Date.now();
    await deployQueryLoopService();
    const initial = await observeInitialPlacement();

    console.log(
      '[5/5] Waiting for access attribution to teach placement where the ' +
      'service data is (no affinity switch)...');
    const learned = await observeDemoPhase(
      'learned-affinity', referenceTopN, learnedPhaseStartedAt,
      (state) => state.assessment.complete,
    );
    const initialWeightedLocality = await describeWeightedLocality(
      initial.placements, learned.attributionRows,
    );
    const improved = learned.weightedLocality.localityRatio >
      initialWeightedLocality.localityRatio;
    const initialNodes = new Set(initial.placements.map((row) => row.nodeId));
    const learnedNodes = new Set(learned.placements.map((row) => row.nodeId));
    const placementChanged = initialNodes.size !== learnedNodes.size ||
      [...initialNodes].some((nodeId) => !learnedNodes.has(nodeId));
    console.log(
      '\n      CONVERGED: intrinsic affinity reached the best production-' +
      `weighted placement (${placementChanged ? 'replicas moved' :
        'initial placement was already optimal'}).`);
    console.log(
      '      Cross-replica exchange was bounded to ' +
      `${learned.assessment.mergeCandidateCount} partial candidates; ` +
      `distributed SQL returned ${aggregateRows.length} movie aggregates. ` +
      'The confidence-adjusted top-10 is identical:\n');
    for (const row of learned.serviceTopN) {
      console.log(
        `        #${row.rank} movie ${row.group_key} ` +
        `score=${Number(row.agg_value).toFixed(4)}`);
    }
    console.log('');
    return {
      converged: learned.assessment.complete,
      lagrangeDistributedSql: {
        inputRatings: totalRows,
        returnedAggregateRows: aggregateRows.length,
        elapsedMs: distributedSqlElapsedMs,
      },
      parallelReduce: {
        replicas: SERVICE_REPLICA_COUNT,
        mergeCandidates: learned.assessment.mergeCandidateCount,
        elapsedToCorrectOptimalResultMs: learned.elapsedMs,
      },
      initialPlacement: {
        observedAt: initial.observedAt,
        placement: initial.placements,
        weightedLocality: initialWeightedLocality.localityRatio,
      },
      learnedAffinity: {
        ...summarizePhase(learned),
        improved,
        placementChanged,
      },
      resultCorrect: topNRowsEqual(referenceTopN, learned.serviceTopN),
      ranking: learned.serviceTopN.map((row) => ({
        movieId: Number(row.group_key),
        score: Number(row.agg_value),
      })),
      top10: learned.serviceTopN.map((r) =>
        `#${r.rank} movie ${r.group_key} score=` +
        Number(r.agg_value).toFixed(4)),
    };
  } finally {
    console.log('Stopping cluster...');
    await stopNodes(nodes);
  }
}

async function writeLiveDemoReport(result, error) {
  const timestamp = new Date().toISOString();
  const passed = Boolean(result?.converged) && !error;
  const formationPassed =
    formationMilestones.settled && formationMilestones.loadCompleted;
  const outstandingMilestones =
    (formationMilestones.settled ? 0 : 1) +
    (formationMilestones.loadCompleted ? 0 : 1) +
    (passed ? 0 : 1);
  const report = {
    timestamp,
    scenario: LIVE_SCENARIO,
    producer: 'service-data-affinity-demo',
    fidelity: 'live',
    summary: {
      total: 2,
      passed: (passed ? 1 : 0) + (formationPassed ? 1 : 0),
      failed: (passed ? 0 : 1) + (formationPassed ? 0 : 1),
    },
    optimizationSummary: {totalPriorityItems: outstandingMilestones},
    standardSummary: {
      scenarios: [{
        scenario: LIVE_SCENARIO,
        passed,
        current: {passed, verdict: passed ? 'PASS' : 'FAIL'},
        detail: {
          result: result || null,
          error: error?.message || null,
        },
      }, {
        scenario: FORMATION_QUEST_SCENARIO,
        passed: formationPassed,
        current: {
          passed: formationPassed,
          verdict: formationPassed ? 'PASS' : 'FAIL',
        },
        detail: {
          milestones: {...formationMilestones},
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

export {evaluateLedgerSpreadRows, runAffinityDemo, summarizePhase};
