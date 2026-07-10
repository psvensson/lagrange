import {execFileSync} from 'node:child_process';
import {appendFile, mkdir} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {AdminWsClient} from '../../scripts/examples/admin-ws-client.js';
import {CREATE_RATINGS_SQL} from './shared.js';
import {queryRows, startCluster} from './run-lagrange-demo.js';

// Formation + schema-provisioning probe: the cheap single-axis live
// validation for formation quests. It reuses the affinity demo's cluster
// bring-up, issues the demo's CREATE TABLE ratings (partition provisioning
// is where the ledger-interlock admission deferrals fire — a loader-free
// settle would measure zero signal), polls the ratings partitions to
// readiness, and harvests the deferral counters from node logs. It
// deliberately skips the 100k-row load and the callback example — the two
// noisy abort axes unrelated to the measured signal.

const PROBE_ID = 'movielens-formation-schema-provisioning';
// Exact emitted strings (see src/rebalancer/
// rebalance-coordinator-ledger-interlock-admission.js, src/partition/
// partition-service-shared.js, src/rebalancer/operation-workflow-owner-
// shared.js). Keys are the counter names reported in the JSON summary.
const DEFERRAL_COUNTER_STRINGS = Object.freeze({
  operation_ledger_quorum_concentrated:
    'operation_ledger_quorum_concentrated',
  would_exceed_target_replica_count: 'would_exceed_target_replica_count',
  would_drop_voter_ready_below_minimum:
    'would drop voter-ready replicas below minimum',
});
const PARTITION_READY_STATE = 'NORMAL';
const RATINGS_PARTITION_PREFIX = 'tbl-';
const PARTITIONS_SQL =
  'SELECT partition_id, leader_node_id, state FROM partitions';
const CREATE_TABLE_MAX_ATTEMPTS = 6;
const CREATE_TABLE_RETRY_DELAY_MS = 5000;
const PARTITION_READY_BUDGET_MS = 120000;
const PARTITION_POLL_INTERVAL_MS = 2000;
const PROBE_RESULT = Object.freeze({
  READY: 'READY',
  TIMEOUT: 'TIMEOUT',
  CREATE_TABLE_FAILED: 'CREATE_TABLE_FAILED',
});
const ARCHIVE_PATH = resolve('solve/report/formation-probe-runs.ndjson');

/**
 * Parse probe CLI flags: the demo's --local plus --mode local|docker.
 * @param {string[]} argv
 * @return {{local: boolean, nodeCount: number|null}}
 */
function parseProbeArgs(argv) {
  const modeIdx = argv.indexOf('--mode');
  const mode = modeIdx >= 0 ? argv[modeIdx + 1] : null;
  const nodesIdx = argv.indexOf('--nodes');
  const nodesArg = nodesIdx >= 0 ? Number(argv[nodesIdx + 1]) : null;
  return {
    local: argv.includes('--local') || mode === 'local',
    nodeCount: nodesArg || Number(process.env.LAGRANGE_NODES) || null,
  };
}

/**
 * Issue the demo's CREATE TABLE ratings with bounded retries. A deferred
 * provisioning admission can fail the create fast; the retry loop is part
 * of the measurement (settle time under the hold).
 * @param {string} target
 * @return {Promise<{ok: boolean, attempts: number, durationMs: number,
 *   error: string|null}>}
 */
async function createRatingsTable(target) {
  const start = Date.now();
  let lastError = null;
  for (let attempt = 1; attempt <= CREATE_TABLE_MAX_ATTEMPTS; attempt += 1) {
    const client = new AdminWsClient({target});
    try {
      await client.query(CREATE_RATINGS_SQL);
      return {
        ok: true,
        attempts: attempt,
        durationMs: Date.now() - start,
        error: null,
      };
    } catch (error) {
      lastError = error;
      console.log(
        `CREATE TABLE attempt ${attempt}/${CREATE_TABLE_MAX_ATTEMPTS} ` +
        `failed: ${error?.message || error}`,
      );
    } finally {
      await client.close();
    }
    if (attempt < CREATE_TABLE_MAX_ATTEMPTS) {
      await sleep(CREATE_TABLE_RETRY_DELAY_MS);
    }
  }
  return {
    ok: false,
    attempts: CREATE_TABLE_MAX_ATTEMPTS,
    durationMs: Date.now() - start,
    error: lastError?.message || String(lastError),
  };
}

/**
 * Summarize one partitions-table snapshot for the ratings table.
 * @param {Object[]} rows
 * @return {{total: number, ready: number, pending: Object[]}}
 */
function summarizeRatingsPartitions(rows) {
  const ratingsRows = rows.filter((row) =>
    String(row.partition_id || '').startsWith(RATINGS_PARTITION_PREFIX),
  );
  const pending = ratingsRows.filter((row) =>
    row.state !== PARTITION_READY_STATE || !row.leader_node_id,
  );
  return {
    total: ratingsRows.length,
    ready: ratingsRows.length - pending.length,
    pending: pending.map((row) => ({
      partitionId: row.partition_id,
      state: row.state,
      leaderNodeId: row.leader_node_id || null,
    })),
  };
}

/**
 * Poll the partitions table until every ratings partition is NORMAL with
 * a leader, or the budget elapses.
 * @param {string} target
 * @return {Promise<{ready: boolean, elapsedMs: number,
 *   ratingsPartitions: number, readyPartitions: number,
 *   pendingPartitions: Object[]}>}
 */
async function pollRatingsPartitionsReady(target) {
  const start = Date.now();
  let snapshot = {total: 0, ready: 0, pending: []};
  while (Date.now() - start < PARTITION_READY_BUDGET_MS) {
    let rows = [];
    try {
      rows = await queryRows(target, PARTITIONS_SQL);
    } catch {
      rows = [];
    }
    snapshot = summarizeRatingsPartitions(rows);
    if (snapshot.total > 0 && snapshot.pending.length === 0) {
      break;
    }
    await sleep(PARTITION_POLL_INTERVAL_MS);
  }
  return {
    ready: snapshot.total > 0 && snapshot.pending.length === 0,
    elapsedMs: Date.now() - start,
    ratingsPartitions: snapshot.total,
    readyPartitions: snapshot.ready,
    pendingPartitions: snapshot.pending,
  };
}

/**
 * Count non-overlapping occurrences of one plain string.
 * @param {string} text
 * @param {string} needle
 * @return {number}
 */
function countOccurrences(text, needle) {
  return text.split(needle).length - 1;
}

/**
 * Harvest the deferral counters from every node's logs via the cluster
 * handle (plain files in local mode, live `docker logs` in docker mode —
 * no gzipped gate-playback artifacts are involved).
 * @param {Object} clusterHandle
 * @return {Promise<Object>} counterName -> {total, perNode}
 */
async function harvestDeferralCounters(clusterHandle) {
  const nodeLogs = typeof clusterHandle?.getNodeLogs === 'function' ?
    await clusterHandle.getNodeLogs() :
    [];
  const counters = {};
  for (const [name, needle] of Object.entries(DEFERRAL_COUNTER_STRINGS)) {
    const perNode = {};
    let total = 0;
    for (const {nodeId, text} of nodeLogs) {
      const count = countOccurrences(String(text || ''), needle);
      perNode[nodeId] = count;
      total += count;
    }
    counters[name] = {total, perNode};
  }
  return counters;
}

/**
 * Resolve the git identity stamps for the archive line.
 * @return {{gitHead: string|null, srcTreeHash: string|null}}
 */
function resolveGitStamps() {
  const revParse = (ref) => {
    try {
      return execFileSync('git', ['rev-parse', ref], {encoding: 'utf8'})
        .trim();
    } catch {
      return null;
    }
  };
  return {gitHead: revParse('HEAD'), srcTreeHash: revParse('HEAD:src')};
}

/**
 * Append one run line to the ndjson archive (trend corpus, R5 salvage).
 * @param {Object} summary
 * @return {Promise<string>} the archive path
 */
async function appendRunArchive(summary) {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    ...resolveGitStamps(),
    mode: summary.mode,
    result: summary,
  });
  await mkdir(dirname(ARCHIVE_PATH), {recursive: true});
  await appendFile(ARCHIVE_PATH, line + '\n');
  return ARCHIVE_PATH;
}

/**
 * Fold the create + readiness outcomes into one probe result. A client-side
 * CREATE timeout is not authoritative (CREATE TABLE IF NOT EXISTS may still
 * complete server-side), so readiness wins over the create verdict.
 * @param {{ok: boolean}} createTable
 * @param {{ready: boolean}} partitions
 * @return {string}
 */
function resolveProbeResult(createTable, partitions) {
  if (partitions.ready) {
    return PROBE_RESULT.READY;
  }
  return createTable.ok ?
    PROBE_RESULT.TIMEOUT :
    PROBE_RESULT.CREATE_TABLE_FAILED;
}

/**
 * Run the formation + schema-provisioning probe once.
 * @param {Object|null} options parseProbeArgs shape; null = read argv
 * @return {Promise<Object>} JSON summary
 */
async function runFormationProbe(options = null) {
  const resolvedOptions = options || parseProbeArgs(process.argv.slice(2));
  const clusterHandle = await startCluster(resolvedOptions);
  try {
    const {target} = clusterHandle;
    console.log('Creating ratings table (partition provisioning)...');
    const createTable = await createRatingsTable(target);
    // Poll even after a create timeout: the DDL may land server-side.
    const partitions = await pollRatingsPartitionsReady(target);
    console.log('Harvesting deferral counters from node logs...');
    const counters = await harvestDeferralCounters(clusterHandle);
    const result = resolveProbeResult(createTable, partitions);
    return {
      probe: PROBE_ID,
      mode: clusterHandle.mode,
      target,
      clusterFormationMs: clusterHandle.clusterFormationMs,
      createTable,
      partitions,
      counters,
      result,
    };
  } finally {
    if (typeof clusterHandle?.stop === 'function') {
      console.log('Stopping cluster...');
      await clusterHandle.stop();
    }
  }
}

if (process.argv[1]?.includes('run-formation-probe.js')) {
  runFormationProbe()
    .then(async (summary) => {
      console.log('Formation probe summary:');
      console.log(JSON.stringify(summary, null, 2));
      const archivePath = await appendRunArchive(summary);
      console.log(`Archived run to ${archivePath}`);
      if (summary.result !== PROBE_RESULT.READY) {
        process.exitCode = 1;
      }
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

export {
  DEFERRAL_COUNTER_STRINGS,
  PROBE_RESULT,
  countOccurrences,
  harvestDeferralCounters,
  parseProbeArgs,
  pollRatingsPartitionsReady,
  resolveProbeResult,
  runFormationProbe,
  summarizeRatingsPartitions,
};
