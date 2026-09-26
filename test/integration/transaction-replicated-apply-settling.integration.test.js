/**
 * F-TX-REPLICATED-APPLY settling witness (quest
 * distributed-transaction-replicated-apply, phase 1: evidence only).
 *
 * The claim under test (frozen): after a distributed transaction's COMMIT is
 * acknowledged to the public application session, the transaction's rows are
 * present in the authoritative SQLite state of EVERY replica of the affected
 * partition, exactly as an autocommit row is.
 *
 * On a fresh three-process cluster (default RF 3) the application commits
 * `db.transaction(INSERT tx_a; INSERT tx_b)` and then one autocommit INSERT
 * `control` through the public session on the seed. The parent then opens
 * EVERY replica file of the table read-only (helpers/replica-sqlite-observer.js;
 * never a routed read) and polls them for a bounded settling window, so a late
 * arrival would be seen and timed. It records, per replica: node, partition,
 * replica, the partition row's leader (observation only), tx_a / tx_b /
 * control presence, the participant commit-outcome rows
 * (_transaction_outcomes) and the Raft log entries that name the rows or carry
 * a TRANSACTION_COMMIT marker (the rs-raft log in the same file). Then the
 * leader-change falsifier: the node that staged the transaction is stopped, a
 * surviving node is asked to accept a new autocommit write for the table (a
 * new leader serves; measured and reported, not asserted), and the committed
 * rows are read through the surviving nodes' public sessions and directly
 * from the surviving replica files.
 *
 * This file is a WITNESS of today's behaviour (the code reading of
 * partition-service-transaction-base.js commit / entry-apply marker apply):
 * it asserts exactly what the lab measured, so it flips the day the owner
 * replicates the transaction's mutation. If a follower DOES hold the rows the
 * code reading is disproved and the witness fails loudly.
 *
 * Raw evidence (JSON + node logs): test-output/transaction-replicated-apply/
 * settling-<timestamp>/ under the repository's owning checkout
 * (helpers/replicated-apply-evidence.js).
 */

import {readFileSync} from 'node:fs';
import {hostname} from 'node:os';
import {test} from '../../src/test-helpers/tap.js';
import {managedSleep} from '../../src/test-helpers/managed-timers.js';
import {
  CDC_LIFECYCLE_LOG_MSG,
} from '../../src/constants/cdc-lifecycle-constants.js';
import {
  PARTITION_SERVICE_OPERATION,
} from '../../src/partition/partition-service-constants.js';
import {
  EMBEDDED_STEP_OUTCOME,
  createEmbeddedCluster,
  decodeExposure,
  describeExposedError,
  serveStatement,
} from './helpers/embedded-cluster-harness.js';
import {observeTableReplicas} from './helpers/replica-sqlite-observer.js';
import {createEvidenceSink} from './helpers/replicated-apply-evidence.js';
import {scaleByMachineFactor} from './helpers/test-machine-factor.js';

const FINDING = 'F-TX-REPLICATED-APPLY';
const APPLICATION_ID = 'transaction-replicated-apply';
const CLUSTER_SIZE = 3;
const EXPECTED_REPLICAS = 3;
// The runner's per-file kill (scripts/run-test-files.js DEFAULT_TIMEOUT_MS) is
// not machine-scaled, so every phase is also bounded by one real-time run
// deadline that leaves room to write the evidence before the kill.
const TEST_TIMEOUT_MS = 600000;
const RUN_RESERVE_MS = 45000;
// Reference budgets (scaled per host).
const WINDOW_MS = Object.freeze({
  CREATE: 90000,
  REPLICA_DISCOVERY: 30000,
  SETTLE: 30000,
  NEW_LEADER_WRITE: 90000,
});
const POLL_MS = 250;
const READ_SAMPLES = 6;
const ROW = Object.freeze({
  TX_A: 'tx_a',
  TX_B: 'tx_b',
  CONTROL: 'control',
  AFTER_CHANGE_PREFIX: 'after_change_',
});
const TABLE = 'settle_rows';
const SQL = Object.freeze({
  CREATE: `CREATE TABLE IF NOT EXISTS ${TABLE} (id TEXT PRIMARY KEY, value TEXT)`,
  INSERT: `INSERT INTO ${TABLE} (id, value) VALUES (?, ?)`,
  READ_ALL: `SELECT id FROM ${TABLE} WHERE id IN (?, ?, ?)`,
  PARTITION: 'SELECT * FROM partitions WHERE partition_id = ?',
  SERVICES: 'SELECT * FROM services WHERE partition_id = ?',
});
const VALUE = 'v';
const OUTCOME_NAME = Object.freeze({
  DURABILITY_VIOLATED: 'acknowledged transaction durability violated',
  NEW_LEADER_HOLDS_ROWS: 'new leader holds the committed rows',
  DURABILITY_VIOLATED_NO_WRITE_LEADER:
    'acknowledged transaction durability violated (no surviving node ' +
    'accepted a write within the window)',
});
const DURABILITY_VIOLATIONS = [
  OUTCOME_NAME.DURABILITY_VIOLATED,
  OUTCOME_NAME.DURABILITY_VIOLATED_NO_WRITE_LEADER,
];
const TX_IDS = [ROW.TX_A, ROW.TX_B];
const OBSERVED_IDS = [ROW.TX_A, ROW.TX_B, ROW.CONTROL];
const MARKER_TYPES = [
  PARTITION_SERVICE_OPERATION.TRANSACTION_COMMIT,
  PARTITION_SERVICE_OPERATION.PREPARE_TRANSACTION,
];

// An application table has no CDC subscriber, so every event its partition
// publishes is parked for a first subscriber and logged at warn level with the
// table and partition (src/partition/partition-service-cdc-stream-base.js):
// the per-node count of those lines is where CDC was published from.
const CDC_PUBLISHED_MESSAGES = [
  CDC_LIFECYCLE_LOG_MSG.EVENT_BUFFERED,
  CDC_LIFECYCLE_LOG_MSG.NO_SUBSCRIBERS_NO_BUFFER,
];
const TEXT = 'utf8';

const replicaKey = (replica) => `${replica.nodeId}/${replica.replicaId}`;
const holds = (replica, id) => (replica.rows?.[id] ?? 0) > 0;

function decodedOutcome(outcome) {
  if (outcome.outcome !== EMBEDDED_STEP_OUTCOME.FULFILLED) {
    return {rejected: describeExposedError(outcome.value)};
  }
  const value = decodeExposure(outcome.value);
  return {
    rows: value?.rows,
    partitions: value?.partitions,
    participantResults: value?.participantResults,
    readAuthorityWitnesses: value?.readAuthorityWitnesses,
    affectedRows: value?.affectedRows,
  };
}

function parsedLogEntries(node) {
  let text = '';
  try {
    text = readFileSync(node.logPath, TEXT);
  } catch {
    return [];
  }
  return text.split('\n').flatMap((line) => {
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
}

// Published CDC events of the table per node, timed against the commit ack
// (the runtime logs ISO-8601 time, src/logging/logging-service.js).
function cdcPublicationsByNode(nodes, commitAckAt) {
  return Object.fromEntries(nodes.map((node) => [node.nodeId,
    parsedLogEntries(node)
      .filter((entry) => CDC_PUBLISHED_MESSAGES.includes(entry.msg) &&
        entry.tableName === TABLE)
      .map((entry) => ({msg: entry.msg, operation: entry.operation,
        partitionId: entry.partitionId,
        msSinceCommitAck: Date.parse(entry.time) - commitAckAt}))]));
}

function observe(nodes) {
  return observeTableReplicas(nodes, {tableName: TABLE, ids: OBSERVED_IDS,
    markerTypes: MARKER_TYPES});
}

function recordFirstSeen(firstSeen, replicas, sinceMs) {
  const elapsed = Date.now() - sinceMs;
  for (const replica of replicas) {
    const seen = firstSeen[replicaKey(replica)] ??= {};
    for (const id of OBSERVED_IDS) {
      if (holds(replica, id) && seen[id] === undefined) seen[id] = elapsed;
    }
  }
}

function everyReplicaHolds(replicas, ids) {
  return replicas.length >= EXPECTED_REPLICAS &&
    replicas.every((replica) => ids.every((id) => holds(replica, id)));
}

async function pollReplicas(t, nodes, deadline, satisfied, onObservation) {
  let replicas = observe(nodes);
  onObservation?.(replicas);
  while (!satisfied(replicas) && Date.now() < deadline) {
    await managedSleep(t, POLL_MS);
    replicas = observe(nodes);
    onObservation?.(replicas);
  }
  return replicas;
}

const consensusLog = (replica) => replica.raftRsLog ?? replica.raftLog;
const markerCount = (replica, type) =>
  consensusLog(replica)?.byMarker?.[type]?.length;
const rowCount = (replica, id) => replica.rows?.[id];

function compactRow(replica, leaderNodeId) {
  return {
    node: replica.nodeId,
    partition: replica.partitionId,
    replica: replica.replicaId,
    partitionRowLeader: replica.nodeId === leaderNodeId,
    tx_a: rowCount(replica, ROW.TX_A),
    tx_b: rowCount(replica, ROW.TX_B),
    control: rowCount(replica, ROW.CONTROL),
    outcomeRows: replica.outcomes?.length,
    raftLogCommitMarkers:
      markerCount(replica, PARTITION_SERVICE_OPERATION.TRANSACTION_COMMIT),
    raftLogControlEntries: consensusLog(replica)?.byId?.[ROW.CONTROL]?.length,
    raftLogTxAEntries: consensusLog(replica)?.byId?.[ROW.TX_A]?.length,
    observationError: replica.observationError,
  };
}

function compactTable(replicas, leaderNodeId) {
  return replicas.map((replica) => compactRow(replica, leaderNodeId));
}

async function sampleReads(node, sessionKey) {
  const samples = [];
  for (let index = 0; index < READ_SAMPLES; index++) {
    const startedAt = Date.now();
    const outcome = decodedOutcome(await node.query(sessionKey, SQL.READ_ALL,
      OBSERVED_IDS));
    samples.push({
      ms: Date.now() - startedAt,
      ids: outcome.rows?.map((row) => row.id).sort() ?? null,
      rejected: outcome.rejected,
      witnesses: outcome.readAuthorityWitnesses,
    });
  }
  return samples;
}

async function publicReadsByNode(nodes, sessions) {
  const reads = {};
  for (const node of nodes) {
    reads[node.nodeId] = await sampleReads(node, sessions.get(node.nodeId));
  }
  return reads;
}

async function metadataRows(node, sessionKey, partitionId) {
  return {
    partition: decodedOutcome(await node.query(sessionKey, SQL.PARTITION,
      [partitionId])),
    services: decodedOutcome(await node.query(sessionKey, SQL.SERVICES,
      [partitionId])),
  };
}

async function awaitNewLeaderWrite(t, survivor, sessionKey, deadline) {
  const attempts = [];
  const startedAt = Date.now();
  while (Date.now() < deadline) {
    const id = `${ROW.AFTER_CHANGE_PREFIX}${attempts.length}`;
    const outcome = decodedOutcome(await survivor.query(sessionKey, SQL.INSERT,
      [id, VALUE]));
    attempts.push({id, atMs: Date.now() - startedAt, ...outcome});
    if (!outcome.rejected) return {accepted: true, id, attempts};
    await managedSleep(t, POLL_MS);
  }
  return {accepted: false, attempts};
}

function scaledDeadline(referenceMs, runDeadline) {
  return Math.min(Date.now() + scaleByMachineFactor(referenceMs), runDeadline);
}

async function openSessions(nodes) {
  const sessions = new Map();
  for (const node of nodes) {
    sessions.set(node.nodeId, await node.openApplicationDatabase(APPLICATION_ID));
  }
  return sessions;
}

test(`${FINDING} settling witness: a committed transaction's rows on every replica`,
  {timeout: TEST_TIMEOUT_MS}, async (t) => {
    const runDeadline = Date.now() + TEST_TIMEOUT_MS - RUN_RESERVE_MS;
    const sink = createEvidenceSink('settling');
    const cluster = createEmbeddedCluster(t);
    const evidence = {finding: FINDING, host: hostname(),
      machineFactor: scaleByMachineFactor(1000) / 1000,
      evidenceDirectory: sink.directory, phases: {}};
    t.comment(`evidence: ${sink.jsonPath}`);
    try {
      await runSettlingExperiment(t, cluster, evidence, runDeadline, sink);
    } finally {
      evidence.finishedAt = new Date().toISOString();
      sink.write(evidence, cluster.nodes);
      t.comment(`evidence written: ${sink.jsonPath}`);
    }
  });

async function runSettlingExperiment(t, cluster, evidence, runDeadline, sink) {
  evidence.phases.formation = await cluster.formCluster(CLUSTER_SIZE);
  evidence.nodes = cluster.nodes.map((node) => ({nodeId: node.nodeId,
    role: node.role, dataDir: node.dataDir}));
  const [seed] = cluster.nodes;
  const sessions = await openSessions(cluster.nodes);
  const seedSession = sessions.get(seed.nodeId);
  evidence.phases.create = await serveStatement(t, seed, seedSession,
    SQL.CREATE, [], WINDOW_MS.CREATE);
  sink.write(evidence, cluster.nodes);
  if (!evidence.phases.create.served) {
    t.fail(`CREATE TABLE was never served: ${JSON.stringify(
      evidence.phases.create.rejections.slice(-3))}`);
    return;
  }

  const settle = await commitAndSettle(t, cluster, seed, seedSession,
    runDeadline);
  evidence.phases.settle = settle.record;
  sink.write(evidence, cluster.nodes);
  if (!settle.committed) {
    t.fail(`the transaction did not commit: ${settle.record.transaction.rejected}`);
    return;
  }
  t.comment(`settled replica table:\n${JSON.stringify(settle.record.table)}`);
  assertSettledWitness(t, settle);

  evidence.phases.publicReads = await publicReadsByNode(cluster.nodes, sessions);
  sink.write(evidence, cluster.nodes);

  if (settle.staging.length !== 1) return;
  const change = await leaderChange(t, cluster, sessions, settle, runDeadline);
  evidence.phases.leaderChange = change;
  t.comment(`leader change: ${change.outcome}`);
  assertLeaderChangeWitness(t, change);
}

async function commitAndSettle(t, cluster, seed, seedSession, runDeadline) {
  const record = {};
  const committed = await seed.transaction(seedSession, TX_IDS.map((id) =>
    ({sql: SQL.INSERT, params: [id, VALUE]})));
  const commitAckAt = Date.now();
  record.transaction = {
    outcome: committed.transaction.outcome,
    rejected: committed.transaction.outcome === EMBEDDED_STEP_OUTCOME.FULFILLED ?
      undefined : describeExposedError(committed.transaction.value),
    steps: committed.steps.map(decodedOutcome),
  };
  if (committed.transaction.outcome !== EMBEDDED_STEP_OUTCOME.FULFILLED) {
    return {record, replicas: [], staging: [], partitionId: null,
      committed: false};
  }
  record.autocommit = decodedOutcome(await seed.query(seedSession, SQL.INSERT,
    [ROW.CONTROL, VALUE]));
  record.autocommitAckMsAfterCommitAck = Date.now() - commitAckAt;
  const firstSeen = {};
  const discovered = await pollReplicas(t, cluster.nodes,
    scaledDeadline(WINDOW_MS.REPLICA_DISCOVERY, runDeadline),
    (replicas) => everyReplicaHolds(replicas, [ROW.CONTROL]),
    (replicas) => recordFirstSeen(firstSeen, replicas, commitAckAt));
  record.controlOnEveryReplicaMs = Date.now() - commitAckAt;
  // Keep observing for the settling window: a late transactional arrival on a
  // follower would be recorded with its first-seen time.
  const replicas = await pollReplicas(t, cluster.nodes,
    scaledDeadline(WINDOW_MS.SETTLE, runDeadline),
    (observed) => everyReplicaHolds(observed, OBSERVED_IDS),
    (observed) => recordFirstSeen(firstSeen, observed, commitAckAt));
  record.settleWindowEndedMs = Date.now() - commitAckAt;
  record.discoveredReplicaCount = discovered.length;
  record.firstSeenMsSinceCommitAck = firstSeen;
  record.replicas = replicas;
  const staging = replicas.filter((replica) =>
    TX_IDS.every((id) => holds(replica, id)));
  const partitionIds = [...new Set(replicas.map((r) => r.partitionId))];
  // Observation only: the partition row's leader_node_id as published.
  record.metadata = await metadataRows(seed, seedSession, partitionIds[0]);
  const leaderNodeId = record.metadata.partition.rows?.[0]?.leader_node_id ??
    null;
  record.table = compactTable(replicas, leaderNodeId);
  record.cdcPublications = cdcPublicationsByNode(cluster.nodes, commitAckAt);
  record.partitionIds = partitionIds;
  record.stagingReplicas = staging.map(replicaKey);
  return {record, replicas, staging, partitionId: partitionIds[0],
    committed: committed.transaction.outcome === EMBEDDED_STEP_OUTCOME.FULFILLED};
}

function assertSettledWitness(t, settle) {
  const {replicas, staging} = settle;
  t.ok(settle.committed, 'the public db.transaction COMMIT was acknowledged');
  t.equal(settle.record.partitionIds.length, 1,
    'the fresh table is one partition');
  t.equal(replicas.length, EXPECTED_REPLICAS,
    'the partition has three replica files, one per node');
  t.ok(replicas.every((replica) => holds(replica, ROW.CONTROL)),
    'the autocommit control row is in every replica (replicated apply)');
  const followers = replicas.filter((replica) => !staging.includes(replica));
  const followerTxRows = followers.filter((replica) =>
    TX_IDS.some((id) => holds(replica, id)));
  if (followerTxRows.length > 0) {
    t.fail('CODE READING DISPROVED: a follower replica holds the transaction ' +
      `rows (${followerTxRows.map(replicaKey).join(', ')}); stop and reconcile`);
  }
  t.equal(staging.length, 1,
    `${FINDING}: exactly one replica (the staging replica) holds the ` +
    'committed transaction rows');
  t.equal(followers.length, EXPECTED_REPLICAS - 1,
    `${FINDING}: the other two replicas lack them after the settling window`);
  t.same(followerTxRows, [],
    `${FINDING}: no follower received tx_a/tx_b by any mechanism`);
}

async function leaderChange(t, cluster, sessions, settle, runDeadline) {
  const [staging] = settle.staging;
  const stagingNode = cluster.nodes.find((node) =>
    node.nodeId === staging.nodeId);
  const survivors = cluster.nodes.filter((node) => node !== stagingNode);
  const record = {stoppedNodeId: stagingNode.nodeId,
    stoppedRole: stagingNode.role};
  const stopStartedAt = Date.now();
  await cluster.stopNode(stagingNode);
  record.stopMs = Date.now() - stopStartedAt;
  const [survivor] = survivors;
  const survivorSession = sessions.get(survivor.nodeId);
  record.newLeaderWrite = await awaitNewLeaderWrite(t, survivor,
    survivorSession, scaledDeadline(WINDOW_MS.NEW_LEADER_WRITE, runDeadline));
  record.newLeaderWriteMsAfterStop = Date.now() - stopStartedAt;
  record.survivorReplicas = observe(survivors);
  record.survivorTable = compactTable(record.survivorReplicas, null);
  record.publicReads = await publicReadsByNode(survivors, sessions);
  record.metadataAfter = await metadataRows(survivor, survivorSession,
    settle.partitionId);
  record.outcome = classifyLeaderChange(record);
  return record;
}

function classifyLeaderChange(record) {
  const anyHolds = record.survivorReplicas.some((replica) =>
    TX_IDS.every((id) => holds(replica, id)));
  if (anyHolds) return OUTCOME_NAME.NEW_LEADER_HOLDS_ROWS;
  return record.newLeaderWrite.accepted ? OUTCOME_NAME.DURABILITY_VIOLATED :
    OUTCOME_NAME.DURABILITY_VIOLATED_NO_WRITE_LEADER;
}

// The claim is about the replicas' durable state: once the staging node is
// gone, whichever surviving replica leads next can only serve what its own
// file holds. Whether a surviving node accepts a write within the window is
// measured and reported (formation/control-plane owners), not asserted here.
function assertLeaderChangeWitness(t, change) {
  t.comment(`new leader write accepted: ${change.newLeaderWrite.accepted} ` +
    `(${change.newLeaderWrite.attempts.length} attempt(s), ` +
    `${change.newLeaderWriteMsAfterStop} ms after the stop)`);
  t.equal(change.survivorReplicas.length, EXPECTED_REPLICAS - 1,
    'both surviving replica files were observed');
  t.ok(DURABILITY_VIOLATIONS.includes(change.outcome),
    `${FINDING}: after the staging node stops, no surviving replica holds ` +
    `the acknowledged transaction rows (${change.outcome})`);
  const reads = Object.values(change.publicReads).flat()
    .filter((sample) => Array.isArray(sample.ids));
  t.ok(reads.length > 0, 'surviving nodes served public reads');
  t.ok(reads.every((sample) => TX_IDS.every((id) => !sample.ids.includes(id))),
    `${FINDING}: public reads on surviving nodes return no committed ` +
    'transaction row');
}
