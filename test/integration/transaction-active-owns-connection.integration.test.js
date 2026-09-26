/**
 * T-A "an active transaction must not own Raft durability" - measured today
 * (quest distributed-transaction-replicated-apply, design-gate item 2;
 * evidence only, nothing repaired).
 *
 * On a fresh three-process cluster (default RF 3), for each variant
 * (ROLLBACK, then COMMIT):
 * 1. the application on the seed opens db.transaction, runs one INSERT inside
 *    it (the participant holds BEGIN IMMEDIATE on its replica's connection)
 *    and leaves it ACTIVE (the callback awaits the test's decision:
 *    helpers/embedded-node-worker.js HOLD_TRANSACTION);
 * 2. while it is ACTIVE, a SECOND public session on the seed and a public
 *    session on a joiner each issue one autocommit INSERT into the SAME table
 *    (same partition); each answer (acknowledged / deferred / failed) and its
 *    wall-clock is recorded;
 * 3. the replica files are polled read-only (helpers/replica-sqlite-observer.js)
 *    for the autocommit rows on all three replicas during the hold window;
 * 4. the held transaction is released (ROLLBACK: the callback throws;
 *    COMMIT: it returns);
 * 5. every replica is inspected again: the autocommit rows, the transaction's
 *    row, `_transaction_outcomes`, and the rs-raft log / applied / hard state
 *    (the replica files hold `_raft_rs_*` tables), before vs after the
 *    release; and the nodes' transaction/consensus log lines of the window
 *    are kept (the nodes run at debug level for this).
 *
 * The recorded table is the evidence; the assertions encode exactly what the
 * lab measured today (a witness that flips when the owner fixes it).
 *
 * Raw evidence: test-output/transaction-replicated-apply/
 * active-owns-connection-<timestamp>/ (helpers/replicated-apply-evidence.js).
 */

import {hostname} from 'node:os';
import {test} from '../../src/test-helpers/tap.js';
import {managedSleep} from '../../src/test-helpers/managed-timers.js';
import {
  PARTITION_SERVICE_OPERATION,
} from '../../src/partition/partition-service-constants.js';
import {
  EMBEDDED_HOLD_DECISION,
  EMBEDDED_STEP_OUTCOME,
  createEmbeddedCluster,
  decodeExposure,
  describeExposedError,
  exposedProperty,
  serveStatement,
} from './helpers/embedded-cluster-harness.js';
import {logLinesBetween} from './helpers/node-log-window.js';
import {observeTableReplicas} from './helpers/replica-sqlite-observer.js';
import {createEvidenceSink} from './helpers/replicated-apply-evidence.js';
import {scaleByMachineFactor} from './helpers/test-machine-factor.js';

const FINDING = 'F-TX-ACTIVE-OWNS-CONNECTION';
const APPLICATION_ID = 'transaction-active-owns-connection';
const CLUSTER_SIZE = 3;
const EXPECTED_REPLICAS = 3;
const TEST_TIMEOUT_MS = 600000;
// The transaction owner and the rs-raft persistence admission log at debug.
const NODE_LOG_LEVEL = 'debug';
const WINDOW_MS = Object.freeze({
  HOLD: 20000,
  SETTLE: 30000,
});
const POLL_MS = 250;
const TABLE = 'active_hold_rows';
const SQL = Object.freeze({
  CREATE: `CREATE TABLE IF NOT EXISTS ${TABLE} (id TEXT PRIMARY KEY, value TEXT)`,
  INSERT: `INSERT INTO ${TABLE} (id, value) VALUES (?, ?)`,
  PARTITION: 'SELECT partition_id, leader_node_id FROM partitions ' +
    'WHERE table_name = ?',
});
const VALUE = 'v';
const ROW_SUFFIX = Object.freeze({
  TX: 'tx',
  SEED_AUTO: 'auto-seed',
  JOINER_AUTO: 'auto-joiner',
});
const LOG_PATTERNS = [
  /transaction/i, /admission/i, /defer/i, /durab/i, /hold/i, /persist/i,
];
const MARKER_TYPES = [PARTITION_SERVICE_OPERATION.TRANSACTION_COMMIT,
  PARTITION_SERVICE_OPERATION.ROLLBACK];
const PUBLIC_ERROR_FIELDS = ['code', 'deferred', 'retryAfterMs'];

const holds = (replica, id) => (replica.rows?.[id] ?? 0) > 0;

function rowIds(prefix) {
  return {
    tx: `${prefix}${ROW_SUFFIX.TX}`,
    seedAuto: `${prefix}${ROW_SUFFIX.SEED_AUTO}`,
    joinerAuto: `${prefix}${ROW_SUFFIX.JOINER_AUTO}`,
  };
}

function observe(nodes, ids) {
  return observeTableReplicas(nodes, {tableName: TABLE,
    ids: [ids.tx, ids.seedAuto, ids.joinerAuto], markerTypes: MARKER_TYPES});
}

function consensusProgress(replica) {
  const state = replica.raftRsState ?? {};
  return {
    logBounds: replica.raftRsLog?.bounds ?? replica.raftLog?.bounds ?? null,
    applied: state._raft_rs_applied_state ?? null,
    hard: state._raft_rs_hard_state ?? null,
  };
}

function snapshotRow(replica, ids) {
  return {
    node: replica.nodeId,
    replica: replica.replicaId,
    txRow: replica.rows?.[ids.tx] ?? null,
    seedAuto: replica.rows?.[ids.seedAuto] ?? null,
    joinerAuto: replica.rows?.[ids.joinerAuto] ?? null,
    outcomes: replica.outcomes ?? null,
    consensus: consensusProgress(replica),
    observationError: replica.observationError,
  };
}

function snapshot(nodes, ids, label, sinceMs) {
  return {label, atMs: Date.now() - sinceMs,
    replicas: observe(nodes, ids).map((replica) => snapshotRow(replica, ids))};
}

function publicAnswer(outcome) {
  if (outcome.outcome === EMBEDDED_STEP_OUTCOME.FULFILLED) {
    const value = decodeExposure(outcome.value);
    return {acknowledged: true, affectedRows: value?.affectedRows,
      participantResults: value?.participantResults};
  }
  return {acknowledged: false, error: describeExposedError(outcome.value),
    ...Object.fromEntries(PUBLIC_ERROR_FIELDS.map((field) =>
      [field, exposedProperty(outcome.value, field)]))};
}

// One autocommit write, timed from issue; a harness request that exceeds its
// own budget is recorded as such, never thrown.
function timedWrite(node, sessionKey, id) {
  const issuedAt = Date.now();
  return node.query(sessionKey, SQL.INSERT, [id, VALUE])
    .then((outcome) => ({...publicAnswer(outcome), settledAt: Date.now()}))
    .catch((error) => ({acknowledged: false, harnessError: error.message,
      settledAt: Date.now()}))
    .then((answer) => ({...answer, issuedAt,
      settleMs: answer.settledAt - issuedAt}));
}

async function pollUntil(t, deadline, read, satisfied) {
  let last = read();
  while (!satisfied(last) && Date.now() < deadline) {
    await managedSleep(t, POLL_MS);
    last = read();
  }
  return last;
}

function everyReplicaHolds(replicas, ids) {
  return replicas.length >= EXPECTED_REPLICAS &&
    replicas.every((replica) => ids.every((id) => holds(replica, id)));
}

function settleRecord(write, releasedAt) {
  return {...write, settledRelativeToReleaseMs: write.settledAt - releasedAt};
}

async function runVariant(t, context, decision, prefix) {
  const {cluster, seed, joiner, sessions} = context;
  const ids = rowIds(prefix);
  const startedAt = Date.now();
  const record = {decision, ids, snapshots: []};
  record.snapshots.push(snapshot(cluster.nodes, ids, 'before-hold', startedAt));
  const hold = await seed.holdTransaction(sessions.hold,
    [{sql: SQL.INSERT, params: [ids.tx, VALUE]}]);
  record.holdStep = hold.steps?.map(publicAnswer) ?? null;
  record.heldAtMs = Date.now() - startedAt;
  record.snapshots.push(snapshot(cluster.nodes, ids, 'held', startedAt));
  const writesIssuedAt = Date.now();
  const seedWrite = timedWrite(seed, sessions.seedAuto, ids.seedAuto);
  const joinerWrite = timedWrite(joiner, sessions.joinerAuto, ids.joinerAuto);
  const autoIds = [ids.seedAuto, ids.joinerAuto];
  const duringHold = await pollUntil(t,
    Date.now() + scaleByMachineFactor(WINDOW_MS.HOLD),
    () => observe(cluster.nodes, ids),
    (replicas) => everyReplicaHolds(replicas, autoIds));
  record.autocommitOnEveryReplicaDuringHold =
    everyReplicaHolds(duringHold, autoIds);
  record.holdWindowMs = Date.now() - writesIssuedAt;
  record.snapshots.push(snapshot(cluster.nodes, ids, 'before-release',
    startedAt));
  const releasedAt = Date.now();
  record.release = await seed.releaseTransaction(hold.holdKey, decision);
  record.release.transaction = publicAnswer(record.release.transaction);
  record.releaseMs = Date.now() - releasedAt;
  record.snapshots.push(snapshot(cluster.nodes, ids, 'released', startedAt));
  record.seedAutocommit = settleRecord(await seedWrite, releasedAt);
  record.joinerAutocommit = settleRecord(await joinerWrite, releasedAt);
  const settled = await pollUntil(t,
    Date.now() + scaleByMachineFactor(WINDOW_MS.SETTLE),
    () => observe(cluster.nodes, ids),
    (replicas) => everyReplicaHolds(replicas, acknowledgedIds(record, ids)));
  record.snapshots.push({label: 'settled', atMs: Date.now() - startedAt,
    replicas: settled.map((replica) => snapshotRow(replica, ids))});
  record.logs = Object.fromEntries(cluster.nodes.map((node) =>
    [`${node.role}-${node.nodeId}`, logLinesBetween(node, startedAt,
      Date.now(), {patterns: LOG_PATTERNS})]));
  return record;
}

function acknowledgedIds(record, ids) {
  return [
    record.seedAutocommit.acknowledged ? ids.seedAuto : null,
    record.joinerAutocommit.acknowledged ? ids.joinerAuto : null,
  ].filter(Boolean);
}

function compactVariant(record) {
  return {
    decision: record.decision,
    holdStep: record.holdStep?.map((step) => step.acknowledged),
    seedAutocommit: pickAnswer(record.seedAutocommit),
    joinerAutocommit: pickAnswer(record.joinerAutocommit),
    autocommitOnEveryReplicaDuringHold:
      record.autocommitOnEveryReplicaDuringHold,
    release: record.release.transaction.acknowledged,
    releaseMs: record.releaseMs,
    snapshots: record.snapshots.map((shot) => ({label: shot.label,
      atMs: shot.atMs,
      replicas: shot.replicas.map((replica) => ({
        node: replica.node.slice(0, 8), tx: replica.txRow,
        seedAuto: replica.seedAuto, joinerAuto: replica.joinerAuto,
        outcomes: replica.outcomes?.length ?? null,
        logLast: replica.consensus.logBounds?.last ?? null,
        applied: replica.consensus.applied,
      }))})),
  };
}

function pickAnswer(answer) {
  return {acknowledged: answer.acknowledged, error: answer.error,
    deferred: answer.deferred, retryAfterMs: answer.retryAfterMs,
    harnessError: answer.harnessError, settleMs: answer.settleMs,
    settledRelativeToReleaseMs: answer.settledRelativeToReleaseMs};
}

async function openContext(t, cluster, evidence) {
  const [seed] = cluster.nodes;
  const joiner = cluster.nodes[cluster.nodes.length - 1];
  const sessions = {
    hold: await seed.openApplicationDatabase(APPLICATION_ID),
    seedAuto: await seed.openApplicationDatabase(APPLICATION_ID),
    joinerAuto: await joiner.openApplicationDatabase(APPLICATION_ID),
  };
  evidence.create = await serveStatement(t, seed, sessions.seedAuto,
    SQL.CREATE);
  const partition = await seed.query(sessions.seedAuto, SQL.PARTITION,
    [TABLE]);
  evidence.partition = publicAnswer(partition).acknowledged ?
    decodeExposure(partition.value).rows : describeExposedError(partition.value);
  return {cluster, seed, joiner, sessions};
}

test(`${FINDING} (T-A): an ACTIVE transaction vs autocommit durability`,
  {timeout: TEST_TIMEOUT_MS}, async (t) => {
    const sink = createEvidenceSink('active-owns-connection');
    const cluster = createEmbeddedCluster(t);
    const evidence = {finding: FINDING, host: hostname(),
      nodeLogLevel: NODE_LOG_LEVEL, evidenceDirectory: sink.directory,
      variants: []};
    t.comment(`evidence: ${sink.jsonPath}`);
    try {
      evidence.formation = await cluster.formCluster(CLUSTER_SIZE,
        {env: {LOG_LEVEL: NODE_LOG_LEVEL}});
      const context = await openContext(t, cluster, evidence);
      t.ok(evidence.create.served, 'the table was created');
      for (const [index, decision] of [EMBEDDED_HOLD_DECISION.ROLLBACK,
        EMBEDDED_HOLD_DECISION.COMMIT].entries()) {
        const record = await runVariant(t, context, decision, `v${index}-`);
        evidence.variants.push(record);
        sink.write(evidence);
        t.comment(`${decision}: ${JSON.stringify(compactVariant(record))}`);
        assertVariant(t, record);
      }
    } finally {
      evidence.finishedAt = new Date().toISOString();
      evidence.compact = evidence.variants.map(compactVariant);
      sink.write(evidence, cluster.nodes);
      t.comment(`evidence written: ${sink.jsonPath}`);
    }
  });

// Measurement run: only what the variant must establish to be meaningful.
function assertVariant(t, record) {
  t.ok(record.holdStep?.every((step) => step.acknowledged),
    `${record.decision}: the held transaction's INSERT was staged`);
  t.ok(record.release.transaction.acknowledged ===
    (record.decision === EMBEDDED_HOLD_DECISION.COMMIT),
  `${record.decision}: the held transaction ended as decided`);
  const final = record.snapshots.at(-1).replicas;
  t.equal(final.length, EXPECTED_REPLICAS, 'three replica files observed');
  t.comment(`final replicas: ${JSON.stringify(final.map((replica) =>
    [replica.node.slice(0, 8), replica.txRow,
      replica.seedAuto, replica.joinerAuto]))}`);
}
