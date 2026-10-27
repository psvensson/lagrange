/**
 * Tier-3 demo of the service↔data affinity placement epic
 * (solve/epics/service-data-affinity-placement.md): CODE MOVES TO ITS
 * DATA, live - at NODE granularity, inside a single latency group.
 *
 * Latency groups exist for CDC fan-out efficiency; the placement thesis
 * is independent of them. Data affinity is intrinsic: the service starts
 * without an access history, its normal queries publish attribution, and
 * placement learns the best production-weighted node set.
 *
 * The story:
 *   1. Coordination schemas bootstrap on the seed, then four nodes join (no
 *      zone pinning - one latency domain). Once the expanded control plane is
 *      quiescent, the ratings schema is created and the dataset loads with a
 *      deliberately small split threshold that forces several partitions
 *      across the cluster - real parallelism: multiple raft groups and
 *      multiple leaders.
 *   2. The movielens ratings are loaded and split across partitions
 *      whose replicas land on different node subsets. Distributed
 *      grouped SQL emits one AVG/COUNT row per movie and establishes the
 *      confidence-adjusted top-10 reference result.
 *   3. A REAL WASI call-Binding service (`movielens--call--topn`) is built
 *      and deployed through the public code-first service pipeline
 *      (`runGenerate` -> `runBuild` -> `runDeploy`), where replica capacity
 *      is system-policy output. Each `CALL BINDING` invocation fans out the
 *      Binding-declared grouped SQL across partition-local shards, records
 *      leased partial snapshots in `call_cell_reduce_slots`, and atomically
 *      publishes the merged top-10 result and provenance witness in
 *      `call_cell_reduce_results`.
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
import {createWriteStream, existsSync, realpathSync} from 'node:fs';
import {mkdir, readdir, rm, stat, writeFile} from 'node:fs/promises';
import {promisify} from 'node:util';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as sleep} from 'node:timers/promises';
import {AdminWsClient} from '../../scripts/examples/admin-ws-client.js';
import {
  DEMO_PGWIRE_AUTH,
  MOVIELENS_CALL_SERVICE_ID,
  deployMovieLensCallBinding,
  invokeMovieLensCallBinding,
} from './affinity-demo-binding-service.js';
import {
  createRatingsTableWithRetry,
  loadRatingsIntoLagrange,
} from './lagrange-loader.js';
import {
  waitForAffinityDemoPreloadAdmission,
  waitForAffinityDemoSchemaAdmission,
} from './affinity-demo-preload-gate.js';
import {
  writeAffinityDemoLiveReport,
} from './affinity-demo-live-report.js';
import {
  collectHostSchedulingEvidence,
} from './host-scheduling-evidence.js';
import {collectFormationVerdict} from './formation-verdict.js';
import {
  ATTRIBUTION_ENV as FORMATION_ATTRIBUTION_ENV,
  DEADLINE_ENV as FORMATION_ATTRIBUTION_DEADLINE_ENV,
  FORMED_SIGNAL as FORMATION_FORMED_SIGNAL,
  PROFILE_DIR_ENV as FORMATION_PROFILE_DIR_ENV,
} from '../../src/diagnostics/formation-attribution-window.js';
import {
  startGcpAffinityCluster,
  FORMATION_PROFILE_DIRNAME,
  GCP_SEED_PROFILE_DIR,
} from './gcp-cluster-provider.js';
import {
  assessAffinityDemoCompletion,
  buildWeightedLocalitySnapshot,
  topNRowsEqual,
} from './affinity-demo-evidence.js';
import {
  parseResultSnapshotWitness,
  RESULT_SNAPSHOT_STATE,
} from '../../src/runtime/sql-query-loop-parallel-reduce.js';
import {
  RATINGS_AGGREGATE_SQL,
  rankMovieQuality,
} from './movie-ranking.js';
import {refuseUnderProbe} from '../../src/test-helpers/probe-guard.js';

const NODE_COUNT = 5;
const BASE_REST_PORT = 8080;
const BASE_ADMIN_PORT = 8081;
const PORT_STRIDE = 4;
const CLUSTER_DATA_ROOT = 'data/examples/service-data-affinity-demo';
// The admin target is normally the local seed (127.0.0.1); a GCP-mode run
// rebinds it to the provisioned seed host's external IP before any use.
let TARGET = `ws://127.0.0.1:${BASE_ADMIN_PORT}/api/admin/stream`;
let LOAD_TARGET = `${TARGET}?lane=load`;
const GCP_MODE_ENV = 'LAGRANGE_AFFINITY_DEMO_GCP';
const GCP_MODE_FLAG = '--gcp';
// Formation-only: form the cluster and wait for schema admission, then stop.
// The local seed-starvation gate (npm run check:formation) and the formation
// health trend read the formation verdict from this shorter run.
const FORMATION_ONLY_ENV = 'LAGRANGE_AFFINITY_DEMO_FORMATION_ONLY';
const FORMATION_ONLY_FLAG = '--formation-only';
const CLUSTER_FORM_TIMEOUT_MS = 180000;
// The seed's attribution window (LAGRANGE_FORMATION_ATTRIBUTION=1) ends on
// the formed signal or on the formation budget plus this margin.
const FORMATION_ATTRIBUTION_MARGIN_MS = 30000;
const FORMATION_ATTRIBUTION_ENABLED = '1';
const SEED_NODE_INDEX = 0;
const POLL_INTERVAL_MS = 2000;
const OBSERVE_INTERVAL_MS = 10000;
// Hard cap on the convergence watch - but staleness usually fires
// first: if NOTHING observable changes (placement set, on-data count,
// attribution row count) for STALL_TIMEOUT_MS, the demo aborts with a
// STALLED diagnosis instead of burning the full budget. The stall
// window allows ~3 rebalancer cycles (~90-120s cadence) of genuinely
// zero progress before giving up.
const CONVERGE_TIMEOUT_MS = 600000;
const STALL_TIMEOUT_MS = 300000;
const NODE_STATUS_ACTIVE = 'active';
const SCHEMA_ADMISSION_WAIT_MESSAGE =
  '      Waiting for production schema admission...';
const SCHEMA_ADMISSION_SUCCESS_PREFIX =
  '      Schema mutation admitted after stable control snapshots ';
const DEMO_CONSTANTS = Object.freeze({
  SEED_FLAG: '--seed',
  ADMIN_QUERY_TIMEOUT_MS: 15000,
  ADMIN_WAIT_LABEL: 'seed admin endpoint',
  ADMIN_HEALTH_QUERY: 'SELECT 1',
  SQL_ESCAPED_SINGLE_QUOTE: '\'\'',
  PARTITION_SERVICE_TYPE: 'partition',
  REDUCE_SLOT_QUERY:
    'SELECT slot_id, replica_id, lease_expires_at, partial_json, ',
  NODES_QUERY: 'SELECT node_id, latency_group_id FROM nodes',
  PARTITIONS_QUERY: 'SELECT partition_id, leader_node_id FROM partitions',
  SERVICES_QUERY:
    'SELECT partition_id, node_id, service_type, status FROM services',
  MILLISECONDS_PER_SECOND: 1000,
  LOCALITY_DECIMAL_PLACES: 3,
  INITIAL_PLACEMENT_ERROR: 'service replicas were not initially placed',
  NODE_STOP_POLL_MS: 250,
  FORCE_STOP_SIGNAL: 'SIGKILL',
  GRACEFUL_STOP_SIGNAL: 'SIGTERM',
  ARCHIVE_COMMAND: 'tar',
  ARCHIVE_CREATE_FLAG: '-czf',
  ARCHIVE_DIRECTORY_FLAG: '-C',
  PARENT_DIRECTORY: '..',
  PATH_SEPARATOR: '/',
  ENABLED_VALUE: '1',
  GCP_MODE: 'gcp',
  LOCAL_MODE: 'local',
  GCP_START_MESSAGE:
    '      Provisioning GCP Docker hosts and starting the cluster remotely ' +
    '(one node per VM)...',
  BOOTSTRAP_MESSAGE: '[1/5] Bootstrapping the MovieLens schema on the seed...',
  EXPANSION_SUFFIX: 'the existing data...',
  CLUSTER_FORMED_MESSAGE: '      Cluster formed.',
  FORMATION_ONLY_MESSAGE:
    '      Formation-only run: stopping after schema admission.',
  PRELOAD_WAIT_MESSAGE:
    '      Waiting for production ratings-load admission...',
  PRELOAD_SUCCESS_PREFIX: '      Ratings load admitted (snapshot=',
  LOAD_MESSAGE: '      Loading 100,000 ratings into the routable source...',
  SPLIT_WAIT_MESSAGE:
    '      Waiting for ratings partitions to split and spread...',
  DISTRIBUTED_SQL_MESSAGE:
    '[3/5] Running Lagrange distributed grouped SQL...',
  SERVICE_START_SUFFIX:
    'intrinsic data affinity): partition-local call shards compute a ' +
    'confidence-adjusted Bayesian ranking, publish at most 10 candidates ' +
    'each, and reduce merges them)...',
  AFFINITY_WAIT_MESSAGE:
    '[5/5] Waiting for access attribution to teach placement where the ' +
    'service data is (no affinity switch)...',
  CONVERGED_PREFIX:
    '\n      CONVERGED: intrinsic affinity reached the best production-',
  REPLICAS_MOVED: 'replicas moved',
  INITIAL_PLACEMENT_OPTIMAL: 'initial placement was already optimal',
  EXCHANGE_PREFIX: '      Cross-replica exchange was bounded to ',
  RANKING_SUFFIX: 'The confidence-adjusted top-10 is identical:\n',
  SCORE_DECIMAL_PLACES: 4,
  STOP_MESSAGE: 'Stopping cluster...',
  SCRIPT_NAME: 'run-affinity-demo.js',
  RESULT_MESSAGE: 'Affinity demo result:',
  EMPTY_STRING: '',
});

// Config floor: partition.evaluationIntervalMs must be >= 60000.
const PARTITION_EVAL_INTERVAL_MS = 60000;

const SERVICE_ID = MOVIELENS_CALL_SERVICE_ID;
const SERVICE_REPLICA_COUNT = 3;
const SHARD_SQL_BY_SLOT = Object.freeze({
  1: 'call-cell-shard-1',
  2: 'call-cell-shard-2',
});
const RESULT_TABLE = 'call_cell_reduce_results';
const COORDINATION_TABLE = 'call_cell_reduce_slots';
const RESULT_ID = 'global-top10';
const RESULT_SNAPSHOT_COLUMN = 'source_snapshot_json';
const TOP_N = 10;
const REDUCE_SLOT_LEASE_MS = 30000;
const PARALLEL_REDUCE_CONFIG = Object.freeze({
  shardSqlBySlot: SHARD_SQL_BY_SLOT,
  coordinationTable: COORDINATION_TABLE,
  leaseMs: REDUCE_SLOT_LEASE_MS,
  coordinatorSlot: 1,
  resultId: RESULT_ID,
  resultSnapshotColumn: RESULT_SNAPSHOT_COLUMN,
  allowReplicaSubset: true,
});

function formationAttributionEnabled() {
  return process.env[FORMATION_ATTRIBUTION_ENV] === FORMATION_ATTRIBUTION_ENABLED;
}

// The formed event, delivered to the seed's attribution window; the seed's
// window otherwise runs to its deadline. Only a locally supervised seed can
// be signalled; the GCP provider exposes no signal path, so there the
// window ends on the deadline and the verdict reads the snapshot nearest
// the formed mark.
function signalSeedFormed(nodes) {
  if (!formationAttributionEnabled()) return false;
  const seed = nodes.find((node) => node.index === SEED_NODE_INDEX);
  if (!seed?.process || seed.process.exitCode !== null ||
    seed.process.signalCode !== null) return false;
  return seed.process.kill(FORMATION_FORMED_SIGNAL);
}

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
    ADMIN_WS_PORT: String(adminPort),
    DATA_DIR: dataDir,
    LOG_LEVEL: 'info',
    PARTITION_EVALUATION_INTERVAL_MS: String(PARTITION_EVAL_INTERVAL_MS),
    PGWIRE_AUTH_DATABASE: DEMO_PGWIRE_AUTH.DATABASE,
    PGWIRE_AUTH_PASSWORD: DEMO_PGWIRE_AUTH.PASSWORD,
    PGWIRE_AUTH_USER: DEMO_PGWIRE_AUTH.USER,
  };
  const args = ['src/index.js', '--data-dir', dataDir];
  if (index > 0) {
    env.SEED_NODE_ADDRESS = `localhost:${BASE_REST_PORT}`;
    args.push(DEMO_CONSTANTS.SEED_FLAG, `localhost:${BASE_REST_PORT}`);
  }
  // Only the seed is measured: a joiner with the flag would hook every
  // async resource and log snapshots, perturbing the load the seed is under.
  if (index === SEED_NODE_INDEX && formationAttributionEnabled()) {
    env[FORMATION_ATTRIBUTION_DEADLINE_ENV] =
      String(CLUSTER_FORM_TIMEOUT_MS + FORMATION_ATTRIBUTION_MARGIN_MS);
    env[FORMATION_PROFILE_DIR_ENV] = resolve(dataRoot, FORMATION_PROFILE_DIRNAME);
  } else {
    delete env[FORMATION_ATTRIBUTION_ENV];
  }
  const child = spawn('node', args, {env, stdio: ['ignore', 'pipe', 'pipe']});
  child.stdout.pipe(logStream);
  child.stderr.pipe(logStream);
  return {index, process: child};
}

async function queryAdmin(
  sql,
  target = TARGET,
  timeoutMs = DEMO_CONSTANTS.ADMIN_QUERY_TIMEOUT_MS,
) {
  const boundedTimeoutMs = Math.max(
    1,
    Math.min(DEMO_CONSTANTS.ADMIN_QUERY_TIMEOUT_MS, Math.floor(timeoutMs)),
  );
  const client = new AdminWsClient({target, timeoutMs: boundedTimeoutMs});
  try {
    return await client.query(sql);
  } finally {
    await client.close();
  }
}

async function queryRows(sql, target = TARGET) {
  const result = await queryAdmin(sql, target);
  return result?.results || result?.rows || [];
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
  await waitFor(DEMO_CONSTANTS.ADMIN_WAIT_LABEL, async () => {
    await queryRows(DEMO_CONSTANTS.ADMIN_HEALTH_QUERY);
    return true;
  }, CLUSTER_FORM_TIMEOUT_MS);
}

const MAX_JOIN_RESTARTS = 5;

// GCP mode: the harness's createCluster already started and formed every
// node; here we only confirm the membership view reports them active. The
// remote VMs are dedicated and quiet, so there is no per-node respawn loop.
async function waitForActiveNodesGcp(expectedCount) {
  await waitFor(`${expectedCount} active nodes`, async () => {
    const rows = await queryRows('SELECT node_id, status FROM nodes');
    const active = rows.filter((r) => r.status === NODE_STATUS_ACTIVE);
    return active.length >= expectedCount ? true : null;
  }, CLUSTER_FORM_TIMEOUT_MS);
}

// Node processes are supervised like an orchestrator would: a joiner
// that exhausts its (deliberately impatient) join retry budget and
// exits - e.g. because the seed's leader-metadata view is briefly
// stale after a leadership move - is simply respawned with a fresh
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
    if (row.service_type === DEMO_CONSTANTS.PARTITION_SERVICE_TYPE &&
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

async function describeLatestCompletedInvocation() {
  try {
    const rows = await queryRows(
      `SELECT result_id, result_json, computed_at, ${RESULT_SNAPSHOT_COLUMN} ` +
      `FROM ${RESULT_TABLE} ` +
      'WHERE result_json != \'\' ' +
      'ORDER BY computed_at DESC LIMIT 1',
    );
    return rows[0] || null;
  } catch {
    return null;
  }
}

async function describeReduceSlots(invocationId) {
  if (!invocationId) {
    return [];
  }
  const escapedInvocationId = String(invocationId).replace(
    /'/g,
    DEMO_CONSTANTS.SQL_ESCAPED_SINGLE_QUOTE,
  );
  try {
    return await queryRows(
      DEMO_CONSTANTS.REDUCE_SLOT_QUERY +
      `computed_at FROM ${COORDINATION_TABLE} ` +
      `WHERE invocation_id = '${escapedInvocationId}' ` +
      'AND partial_json != \'[]\' ' +
      'ORDER BY slot_id ASC',
    );
  } catch {
    return [];
  }
}

function mapInvocationResultToTopN(latestRow) {
  if (!latestRow) {
    return [];
  }
  try {
    const parsed = JSON.parse(latestRow.result_json || '[]');
    return parsed.map((row, index) => ({
      rank: index + 1,
      group_key: row.movie_id ?? row.groupKey,
      agg_value: row.score ?? row.aggValue,
      computed_at: latestRow.computed_at,
      [RESULT_SNAPSHOT_COLUMN]: latestRow[RESULT_SNAPSHOT_COLUMN],
    }));
  } catch {
    return [];
  }
}

async function describeWeightedLocality(placements, attributionRows) {
  const [nodes, partitions, services] = await Promise.all([
    queryRows(DEMO_CONSTANTS.NODES_QUERY),
    queryRows(DEMO_CONSTANTS.PARTITIONS_QUERY),
    queryRows(DEMO_CONSTANTS.SERVICES_QUERY),
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
  try {
    await invokeMovieLensCallBinding({target: TARGET, queryRows});
  } catch {
    // Transient call-cell errors during activation or replica movement do not
    // abort observation; completion evaluates the latest durable snapshot.
  }
  const latestInvocation = await describeLatestCompletedInvocation();
  const [placements, attributionRows, reduceSlots] =
    await Promise.all([
      describeServicePlacement(),
      describeAttribution(),
      describeReduceSlots(latestInvocation?.result_id),
    ]);
  const serviceTopN = mapInvocationResultToTopN(latestInvocation);
  const shardSqlBySlot = reduceSlots.length > 0 ?
    Object.fromEntries(
      reduceSlots.map((slot) => [
        Number(slot.slot_id),
        `call-cell-shard-${Number(slot.slot_id)}`,
      ]),
    ) :
    SHARD_SQL_BY_SLOT;
  const parallelReduceConfig = {
    ...PARALLEL_REDUCE_CONFIG,
    shardSqlBySlot,
  };
  const weightedLocality = await describeWeightedLocality(
    placements, attributionRows,
  );
  const shardCount = Object.keys(shardSqlBySlot).length;
  const assessment = assessAffinityDemoCompletion({
    expectedReplicaCount: SERVICE_REPLICA_COUNT,
    placements,
    weightedLocality,
    referenceTopN,
    serviceTopN,
    reduceSlots,
    expectedMergeCandidateCount: shardCount * TOP_N,
    phaseStartedAt,
    parallelReduceConfig,
    partialLimit: TOP_N,
  });
  return {
    placements,
    attributionRows,
    serviceTopN,
    reduceSlots,
    weightedLocality,
    assessment,
    parallelReduceConfig,
  };
}

async function observeDemoPhase(
  label,
  referenceTopN,
  phaseStartedAt,
  accept,
  onObservation = () => {},
) {
  const start = Date.now();
  let lastProgressSignature = null;
  let lastProgressAtMs = Date.now();
  while (Date.now() - start < CONVERGE_TIMEOUT_MS) {
    await sleep(OBSERVE_INTERVAL_MS);
    const state = await describeDemoState(referenceTopN, phaseStartedAt);
    const observedState = {
      ...state,
      phaseStartedAt,
      elapsedMs: Date.now() - start,
    };
    onObservation(observedState);
    const placementLabel = state.placements.map((placement) =>
      placement.nodeId.slice(0, 8));
    console.log(
      `      ${label} t+${Math.round(
        (Date.now() - start) / DEMO_CONSTANTS.MILLISECONDS_PER_SECOND,
      )}s ` +
      `replicas=${state.placements.length} ` +
      `weightedLocality=${state.weightedLocality.localityRatio.toFixed(
        DEMO_CONSTANTS.LOCALITY_DECIMAL_PLACES,
      )} ` +
      `attributionRows=${state.attributionRows.length} ` +
      `partialReplicas=${state.assessment.partialReplicaCount} ` +
      `mergeCandidates=${state.assessment.mergeCandidateCount} ` +
      `top10Correct=${state.assessment.resultCorrect} ` +
      `placement=${JSON.stringify(placementLabel)}`,
    );
    if (accept(state)) {
      return observedState;
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
        `${Math.round(
          STALL_TIMEOUT_MS / DEMO_CONSTANTS.MILLISECONDS_PER_SECOND,
        )}s`,
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
  throw new Error(DEMO_CONSTANTS.INITIAL_PLACEMENT_ERROR);
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
  const encodedResultSnapshot =
    state.serviceTopN[0]?.[RESULT_SNAPSHOT_COLUMN];
  const resultSnapshot = parseResultSnapshotWitness(
    encodedResultSnapshot,
    state.parallelReduceConfig || PARALLEL_REDUCE_CONFIG,
    TOP_N,
  );
  return {
    phaseStartedAt: state.phaseStartedAt,
    weightedLocality: state.weightedLocality.localityRatio,
    placement: state.placements,
    slotOwners: summarizeReduceSlots(state.reduceSlots),
    resultComputedAt: Number(state.serviceTopN[0]?.computed_at) || 0,
    resultSnapshot,
    assessment: state.assessment,
    elapsedMs: state.elapsedMs,
  };
}

function demoResultObservationIsValid(result) {
  return result?.resultCorrect === true &&
    result?.ranking?.length === TOP_N &&
    result?.learnedAffinity?.resultComputedAt > 0 &&
    result?.learnedAffinity?.resultSnapshot?.state ===
      RESULT_SNAPSHOT_STATE.AVAILABLE;
}

function retainObservedDemoResult(phaseEvidence, observedResult) {
  if (!demoResultObservationIsValid(observedResult)) return false;
  const retainedComputedAt =
    phaseEvidence.result?.learnedAffinity?.resultComputedAt || 0;
  const observedComputedAt = observedResult.learnedAffinity.resultComputedAt;
  if (observedComputedAt < retainedComputedAt) return false;
  phaseEvidence.result = observedResult;
  return true;
}

function isNodeProcessRunning(node) {
  return Boolean(node?.process && node.process.exitCode === null);
}

async function awaitNodeProcessStop(node, deadline) {
  while (isNodeProcessRunning(node) && Date.now() < deadline) {
    await sleep(DEMO_CONSTANTS.NODE_STOP_POLL_MS);
  }
  if (isNodeProcessRunning(node)) {
    node.process.kill(DEMO_CONSTANTS.FORCE_STOP_SIGNAL);
  }
}

async function stopNodes(nodes) {
  for (const node of nodes) {
    if (isNodeProcessRunning(node)) {
      node.process.kill(DEMO_CONSTANTS.GRACEFUL_STOP_SIGNAL);
    }
  }
  const deadline = Date.now() + DEMO_CONSTANTS.ADMIN_QUERY_TIMEOUT_MS;
  for (const node of nodes) {
    await awaitNodeProcessStop(node, deadline);
  }
}

const execFileAsync = promisify(execFile);
const ARCHIVE_ROOT = `${CLUSTER_DATA_ROOT}-archive`;
const ARCHIVE_RETENTION = 3;
const AUTO_ARCHIVE_NAME_PATTERN = /^run-\d{4}-\d{2}-\d{2}T.*\.tar\.gz$/;

/**
 * Archive the previous run's cluster state (logs + SQLite) before wiping -
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
    await execFileAsync(DEMO_CONSTANTS.ARCHIVE_COMMAND, [
      DEMO_CONSTANTS.ARCHIVE_CREATE_FLAG, archivePath,
      DEMO_CONSTANTS.ARCHIVE_DIRECTORY_FLAG,
      resolve(CLUSTER_DATA_ROOT, DEMO_CONSTANTS.PARENT_DIRECTORY),
      CLUSTER_DATA_ROOT.split(DEMO_CONSTANTS.PATH_SEPARATOR).pop(),
    ]);
    console.log(`      Archived previous run state to ${archivePath}`);
  } catch (error) {
    console.log(
      `      (previous-run archive failed: ${error.message} - proceeding)`);
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

// Resolve the requested cluster mode: default local node processes, or a
// GCP-provisioned remote Docker cluster when --gcp / the env opt-in is set.
function resolveFormationOnly() {
  return process.argv.includes(FORMATION_ONLY_FLAG) ||
    process.env[FORMATION_ONLY_ENV] === DEMO_CONSTANTS.ENABLED_VALUE;
}

function resolveClusterMode() {
  return process.argv.includes(GCP_MODE_FLAG) ||
    process.env[GCP_MODE_ENV] === DEMO_CONSTANTS.ENABLED_VALUE ?
    DEMO_CONSTANTS.GCP_MODE :
    DEMO_CONSTANTS.LOCAL_MODE;
}

// Start the seed + joiners and wait for the full active cluster. Returns a
// handle {stop, harvestLogs}. In local mode this is the existing per-node
// process supervision; in GCP mode the harness's createCluster owns the
// node lifecycle and the seed admin target is rebound to the external IP.
async function startClusterNodes(mode, nodes, dataRoot) {
  if (mode === DEMO_CONSTANTS.GCP_MODE) {
    console.log(DEMO_CONSTANTS.GCP_START_MESSAGE);
    // The harness forwards the attribution keys to the seed container only;
    // the window ends on this deadline there, since no signal reaches it.
    if (formationAttributionEnabled()) {
      process.env[FORMATION_ATTRIBUTION_DEADLINE_ENV] =
        String(CLUSTER_FORM_TIMEOUT_MS + FORMATION_ATTRIBUTION_MARGIN_MS);
      process.env[FORMATION_PROFILE_DIR_ENV] = GCP_SEED_PROFILE_DIR;
    }
    const gcp = await startGcpAffinityCluster({
      verbose: true,
      outputDir: dataRoot,
    });
    TARGET = gcp.target;
    LOAD_TARGET = `${gcp.target}?lane=load`;
    return {
      cluster: gcp.cluster,
      provisioner: gcp.provisioner,
      stop: gcp.stop,
    };
  }
  // Local mode: unchanged per-node process supervision.
  return {
    stop: () => stopNodes(nodes),
    harvestLogs: async () => null,
  };
}

async function runAffinityDemo({phaseEvidence = {}} = {}) {
  const mode = resolveClusterMode();
  const formationOnly = resolveFormationOnly();
  phaseEvidence.formationOnly = formationOnly;
  const formation = {clusterStartedAtMs: Date.now(), clusterFormedAtMs: null};
  phaseEvidence.formation = formation;
  const nodes = [];
  await archivePreviousRun();
  await rm(CLUSTER_DATA_ROOT, {recursive: true, force: true});
  await mkdir(CLUSTER_DATA_ROOT, {recursive: true});
  let clusterHandle = null;

  try {
    console.log(DEMO_CONSTANTS.BOOTSTRAP_MESSAGE);
    clusterHandle = await startClusterNodes(mode, nodes, CLUSTER_DATA_ROOT);
    if (mode !== DEMO_CONSTANTS.GCP_MODE) {
      nodes.push(await startNode(0, CLUSTER_DATA_ROOT));
    }
    await waitForAdmin();

    console.log(
      `[2/5] Expanding to ${NODE_COUNT} nodes (single zone) and spreading ` +
      DEMO_CONSTANTS.EXPANSION_SUFFIX);
    if (mode !== DEMO_CONSTANTS.GCP_MODE) {
      for (let i = 1; i < NODE_COUNT; i += 1) {
        nodes.push(await startNode(i, CLUSTER_DATA_ROOT));
      }
      await waitForActiveNodes(NODE_COUNT, nodes, CLUSTER_DATA_ROOT);
    } else {
      // createCluster already started and formed all nodes.
      await waitForActiveNodesGcp(NODE_COUNT);
    }
    formation.clusterFormedAtMs = Date.now();
    formation.seedSignalledFormed = signalSeedFormed(nodes);
    console.log(DEMO_CONSTANTS.CLUSTER_FORMED_MESSAGE);
    console.log(SCHEMA_ADMISSION_WAIT_MESSAGE);
    const schemaAdmission = await waitForAffinityDemoSchemaAdmission({
      target: TARGET,
      query: ({target, sql, timeoutMs}) =>
        queryAdmin(sql, target, timeoutMs),
      now: Date.now,
      sleep,
      timeoutMs: CLUSTER_FORM_TIMEOUT_MS,
      pollIntervalMs: POLL_INTERVAL_MS,
      stableWindowMs: PARTITION_EVAL_INTERVAL_MS,
    });
    phaseEvidence.schemaAdmission = schemaAdmission;
    console.log(
      SCHEMA_ADMISSION_SUCCESS_PREFIX +
      `(state=${schemaAdmission.snapshot.state}).`,
    );
    if (formationOnly) {
      console.log(DEMO_CONSTANTS.FORMATION_ONLY_MESSAGE);
      return {converged: true, formationOnly: true, schemaAdmission};
    }
    await createRatingsTableWithRetry({target: TARGET});
    // The authoritative snapshot gate prevents DDL from racing formation
    // recovery. CREATE then owns the sparse ratings policy atomically after
    // enough nodes exist to satisfy its durable replica contract. The
    // production-wide 10 GiB default remains intact, so formation logs cannot
    // inherit the teaching threshold and become an unrelated preload blocker.
    console.log(DEMO_CONSTANTS.PRELOAD_WAIT_MESSAGE);
    const preloadAdmission = await waitForAffinityDemoPreloadAdmission({
      target: TARGET,
      query: ({target, sql, timeoutMs}) =>
        queryAdmin(sql, target, timeoutMs),
      now: Date.now,
      sleep,
      timeoutMs: CLUSTER_FORM_TIMEOUT_MS,
      pollIntervalMs: POLL_INTERVAL_MS,
    });
    phaseEvidence.preloadAdmission = preloadAdmission;
    console.log(
      DEMO_CONSTANTS.PRELOAD_SUCCESS_PREFIX +
      `${preloadAdmission.snapshot.state}, loadLane=` +
      `${preloadAdmission.loadLaneAdmission.state}).`,
    );
    console.log(DEMO_CONSTANTS.LOAD_MESSAGE);
    const totalRows = await loadRatingsIntoLagrange({target: LOAD_TARGET});
    console.log(`      Loaded ${totalRows} ratings.`);

    console.log(DEMO_CONSTANTS.SPLIT_WAIT_MESSAGE);
    const dataNodes = await waitFor(
      'ratings partitions on at least two nodes',
      async () => {
        const state = await describeDataNodes();
        const distinctLeaders = new Set(state.leaderNodeIds).size;
        return state.partitionCount >= 2 &&
          state.holderNodeIds.size >= 2 &&
          distinctLeaders === state.partitionCount ?
          state : null;
      },
      CONVERGE_TIMEOUT_MS,
    );
    console.log(
      `      Ratings partitions: ${dataNodes.partitionCount}, ` +
      `data on nodes: ${JSON.stringify([...dataNodes.holderNodeIds])}`);
    console.log(DEMO_CONSTANTS.DISTRIBUTED_SQL_MESSAGE);
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
      `[4/5] Deploying the ${SERVICE_ID} WASI call Binding (` +
      `${SERVICE_REPLICA_COUNT} replicas, ` +
      DEMO_CONSTANTS.SERVICE_START_SUFFIX);
    const learnedPhaseStartedAt = Date.now();
    await deployMovieLensCallBinding({
      target: TARGET,
      queryRows,
      replicaCount: NODE_COUNT,
      artifactsBaseDir:
        mode === DEMO_CONSTANTS.GCP_MODE ?
          undefined :
          resolve(CLUSTER_DATA_ROOT, 'artifacts'),
    });
    const initial = await observeInitialPlacement();

    console.log(
      DEMO_CONSTANTS.AFFINITY_WAIT_MESSAGE);
    const learned = await observeDemoPhase(
      'learned-affinity', referenceTopN, learnedPhaseStartedAt,
      (state) => state.assessment.complete,
      (state) => {
        const learnedAffinity = summarizePhase(state);
        retainObservedDemoResult(phaseEvidence, {
          converged: false,
          schemaAdmission,
          preloadAdmission,
          lagrangeDistributedSql: {
            inputRatings: totalRows,
            returnedAggregateRows: aggregateRows.length,
            elapsedMs: distributedSqlElapsedMs,
          },
          parallelReduce: {
            replicas: SERVICE_REPLICA_COUNT,
            mergeCandidates: state.assessment.mergeCandidateCount,
            elapsedToCorrectOptimalResultMs: state.elapsedMs,
          },
          learnedAffinity,
          resultCorrect: state.assessment.resultCorrect,
          ranking: state.serviceTopN.map((row) => ({
            movieId: Number(row.group_key),
            score: Number(row.agg_value),
          })),
        });
      },
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
      DEMO_CONSTANTS.CONVERGED_PREFIX +
      `weighted placement (${placementChanged ? DEMO_CONSTANTS.REPLICAS_MOVED :
        DEMO_CONSTANTS.INITIAL_PLACEMENT_OPTIMAL}).`);
    console.log(
      DEMO_CONSTANTS.EXCHANGE_PREFIX +
      `${learned.assessment.mergeCandidateCount} partial candidates; ` +
      `distributed SQL returned ${aggregateRows.length} movie aggregates. ` +
      DEMO_CONSTANTS.RANKING_SUFFIX);
    for (const row of learned.serviceTopN) {
      console.log(
        `        #${row.rank} movie ${row.group_key} ` +
        `score=${Number(row.agg_value).toFixed(
          DEMO_CONSTANTS.SCORE_DECIMAL_PLACES,
        )}`);
    }
    console.log(DEMO_CONSTANTS.EMPTY_STRING);
    return {
      converged: learned.assessment.complete,
      schemaAdmission,
      preloadAdmission,
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
        Number(r.agg_value).toFixed(DEMO_CONSTANTS.SCORE_DECIMAL_PLACES)),
    };
  } catch (error) {
    // The admission gate's timeout error carries the evidence the wait
    // collected; the formation verdict must read it exactly as the report
    // detail does, or a failed run - the case the verdict exists for -
    // would record no admission state and no spread.
    if (error?.schemaAdmission && !phaseEvidence.schemaAdmission) {
      phaseEvidence.schemaAdmission = error.schemaAdmission;
    }
    throw error;
  } finally {
    console.log(DEMO_CONSTANTS.STOP_MESSAGE);
    let remoteLogs = null;
    if (clusterHandle) {
      if (typeof clusterHandle.harvestLogs === 'function') {
        remoteLogs = await clusterHandle.harvestLogs();
      }
      await clusterHandle.stop();
    } else {
      await stopNodes(nodes);
    }
    // Harvest after stop so each node's log is fully flushed. Over-budget host
    // scheduling marks the report non-measuring rather than red. In GCP mode
    // the node logs are written into the local data root so the same budget
    // evaluator reads them; dedicated VMs are not expected to trip it.
    if (remoteLogs) {
      // Host-scheduling evidence reads node-0..node-(N-1).log; harness node
      // IDs are UUIDs, so write the logs by cluster index instead.
      for (let index = 0; index < remoteLogs.length; index += 1) {
        await writeFile(
          resolve(CLUSTER_DATA_ROOT, `node-${index}.log`),
          remoteLogs[index].text || DEMO_CONSTANTS.EMPTY_STRING,
        );
      }
    }
    phaseEvidence.hostScheduling =
      await collectHostSchedulingEvidence(CLUSTER_DATA_ROOT, NODE_COUNT);
    phaseEvidence.formationVerdict = await collectFormationVerdict(
      CLUSTER_DATA_ROOT,
      {schemaAdmission: phaseEvidence.schemaAdmission, formation},
    );
  }
}

const isMainModule = Boolean(
  process.argv[1] &&
    existsSync(process.argv[1]) &&
    realpathSync(resolve(process.argv[1])) ===
      realpathSync(fileURLToPath(import.meta.url)),
);

if (isMainModule) {
  const phaseEvidence = {};
  refuseUnderProbe('the affinity demo');
  runAffinityDemo({phaseEvidence})
    .then(async (result) => {
      await writeAffinityDemoLiveReport(result, null, phaseEvidence);
      console.log(DEMO_CONSTANTS.RESULT_MESSAGE);
      console.log(JSON.stringify(result, null, 2));
      process.exitCode = result.converged ? 0 : 1;
    })
    .catch(async (error) => {
      await writeAffinityDemoLiveReport(null, error, phaseEvidence);
      console.error(error);
      process.exitCode = 1;
    });
}

export {retainObservedDemoResult, runAffinityDemo, summarizePhase};
