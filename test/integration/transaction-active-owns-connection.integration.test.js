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
 *    release; and the nodes' warn/error and transaction/consensus log lines
 *    of the window are kept.
 *
 * The recorded table is the evidence; the assertions encode exactly what the
 * lab measured today (a witness that flips when the owner fixes it).
 *
 * Raw evidence: test-output/transaction-replicated-apply/
 * active-owns-connection-<timestamp>/ (helpers/replicated-apply-evidence.js).
 */

import {hostname} from 'node:os';
import {performance} from 'node:perf_hooks';
import Database from 'better-sqlite3';
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
import {
  listReplicaFiles,
  observeTableReplicas,
} from './helpers/replica-sqlite-observer.js';
import {createEvidenceSink} from './helpers/replicated-apply-evidence.js';
import {scaleByMachineFactor} from './helpers/test-machine-factor.js';

const FINDING = 'F-TX-ACTIVE-OWNS-CONNECTION';
const SHADOW_FINDING = 'F-TX-SHADOW-COPY-FULL-FILE';
const APPLICATION_ID = 'transaction-active-owns-connection';
const CLUSTER_SIZE = 3;
const EXPECTED_REPLICAS = 3;
const TEST_TIMEOUT_MS = 600000;
// The harness default (warn). The deferral / persistence-admission lines are
// debug-level, but a debug-level three-node formation exhausted the seed's
// heap (~505 MB, "LogsTableService dropped 355000 logs") on the lab, so the
// write answers and the consensus tables are the evidence, plus the
// warn/error and transaction/consensus-pattern lines the nodes do log.
const NODE_LOG_LEVEL = 'warn';
const WINDOW_MS = Object.freeze({
  // A new table's partition may still be adding its third replica; the
  // experiment starts only once a sentinel autocommit row is in all three
  // replica files (lab run 6 started inside a membership change and measured
  // that instead).
  STEADY: 120000,
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
const BYTES_PER_MIB = 1024 * 1024;
const SHADOW_COPY_LIVENESS_BUDGET_MS = 350;
const SHADOW_HISTORY_TABLE = '_raft_rs_shadow_copy_history_fixture';
const SHADOW_HISTORY_CHUNK_BYTES = 256 * 1024;
const SHADOW_HISTORY_BATCH_ROWS = 8;
const SHADOW_COPY_TARGET_MIB = Object.freeze([32, 128, 256]);
const SENTINEL_PREFIX = 'steady-';
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

function databaseShape(db) {
  const pageCount = db.pragma('page_count', {simple: true});
  const pageSize = db.pragma('page_size', {simple: true});
  const freelistCount = db.pragma('freelist_count', {simple: true});
  return {freelistCount, pageCount, pageSize,
    logicalBytes: pageCount * pageSize};
}

function quoteIdentifier(name) {
  return `"${name.replaceAll('"', '""')}"`;
}

async function growHistoryFixture(t, db, targetBytes) {
  db.exec(`CREATE TABLE IF NOT EXISTS ${quoteIdentifier(SHADOW_HISTORY_TABLE)} ` +
    '(id INTEGER PRIMARY KEY, payload BLOB NOT NULL)');
  const insert = db.prepare(`INSERT INTO ${quoteIdentifier(SHADOW_HISTORY_TABLE)} ` +
    '(payload) VALUES (zeroblob(?))');
  const insertBatch = db.transaction(() => {
    for (let index = 0; index < SHADOW_HISTORY_BATCH_ROWS; index++) {
      insert.run(SHADOW_HISTORY_CHUNK_BYTES);
    }
  });
  let shape = databaseShape(db);
  while (shape.logicalBytes < targetBytes) {
    insertBatch();
    await managedSleep(t, 1);
    shape = databaseShape(db);
  }
  return shape;
}

function measureShadowCopy(db, compact) {
  const source = databaseShape(db);
  const rssBefore = process.memoryUsage().rss;
  const serializeStarted = performance.now();
  const image = db.serialize();
  const serializeMs = performance.now() - serializeStarted;
  const openStarted = performance.now();
  const shadow = new Database(image);
  const openMs = performance.now() - openStarted;
  const opened = databaseShape(shadow);
  const tableNames = shadow.prepare(
    'SELECT name FROM sqlite_master WHERE type = \'table\' ORDER BY name',
  ).all().map((row) => row.name);
  const scrubbedTables = tableNames.filter((name) =>
    name.startsWith('_raft_rs_'));
  shadow.pragma('foreign_keys = OFF');
  const scrubStarted = performance.now();
  shadow.transaction(() => {
    for (const name of scrubbedTables) {
      shadow.exec(`DROP TABLE ${quoteIdentifier(name)}`);
    }
  })();
  const scrubMs = performance.now() - scrubStarted;
  const afterScrub = databaseShape(shadow);
  const readyMs = serializeMs + openMs + scrubMs;
  let vacuum = null;
  if (compact) {
    const vacuumStarted = performance.now();
    shadow.exec('VACUUM');
    vacuum = {ms: performance.now() - vacuumStarted,
      shape: databaseShape(shadow)};
  }
  const rssWhileOpen = process.memoryUsage().rss;
  shadow.close();
  return {afterScrub, imageBytes: image.length, openMs, opened, readyMs,
    rssBefore, rssWhileOpen, scrubMs, scrubbedTables, serializeMs, source,
    vacuum};
}

function compactCopySample(sample) {
  return {
    targetMiB: sample.targetMiB,
    imageMiB: Number((sample.imageBytes / BYTES_PER_MIB).toFixed(2)),
    serializeMs: Number(sample.serializeMs.toFixed(2)),
    openMs: Number(sample.openMs.toFixed(2)),
    scrubMs: Number(sample.scrubMs.toFixed(2)),
    readyMs: Number(sample.readyMs.toFixed(2)),
    livenessBudgetMs: SHADOW_COPY_LIVENESS_BUDGET_MS,
    pageCountBefore: sample.opened.pageCount,
    pageCountAfterScrub: sample.afterScrub.pageCount,
    freePagesAfterScrub: sample.afterScrub.freelistCount,
    vacuumMs: sample.vacuum === null ? null :
      Number(sample.vacuum.ms.toFixed(2)),
    vacuumMiB: sample.vacuum === null ? null :
      Number((sample.vacuum.shape.logicalBytes / BYTES_PER_MIB).toFixed(2)),
  };
}

async function measureShadowWorkspace(t, context, evidence, sink) {
  const {cluster, seed, joiner, sessions} = context;
  const partitionAnswer = await seed.query(sessions.seedAuto, SQL.PARTITION,
    [TABLE]);
  const partitionRows = publicAnswer(partitionAnswer).acknowledged ?
    decodeExposure(partitionAnswer.value).rows : [];
  const partition = partitionRows[0];
  if (!partition) throw new Error(`partition row absent for ${TABLE}`);
  const leader = cluster.nodes.find((node) =>
    node.nodeId === partition.leader_node_id);
  if (!leader) {
    throw new Error(`published leader ${partition.leader_node_id} is absent`);
  }
  const replica = listReplicaFiles(leader).find((file) =>
    file.partitionId === partition.partition_id);
  if (!replica) {
    throw new Error(`leader replica file absent for ${partition.partition_id}`);
  }
  const measurement = {
    finding: SHADOW_FINDING,
    model: 'synchronous db.serialize -> open -> drop _raft_rs_*',
    livenessBudgetMs: SHADOW_COPY_LIVENESS_BUDGET_MS,
    partitionId: partition.partition_id,
    measuredNodeId: leader.nodeId,
    replicaId: replica.replicaId,
    targetsMiB: SHADOW_COPY_TARGET_MIB,
    samples: [],
  };
  evidence.shadowCopy = measurement;
  const db = new Database(replica.path, {timeout: 30000});
  const started = await joiner.startTraffic(sessions.joinerAuto, SQL.INSERT,
    'shadow-copy-apply-', VALUE);
  await managedSleep(t, 100);
  try {
    for (const targetMiB of SHADOW_COPY_TARGET_MIB) {
      const growth = await growHistoryFixture(t, db,
        targetMiB * BYTES_PER_MIB);
      const sample = {...measureShadowCopy(db, targetMiB ===
        SHADOW_COPY_TARGET_MIB[0]), growth, targetMiB};
      measurement.samples.push(sample);
      sink.write(evidence);
      t.comment(`${SHADOW_FINDING}: ${JSON.stringify(compactCopySample(sample))}`);
    }
  } finally {
    db.close();
    measurement.applyTraffic = await joiner.stopTraffic(started.trafficKey);
    sink.write(evidence);
  }
  t.ok(measurement.applyTraffic.attempted > 0,
    'public-session apply traffic ran during the copy measurement');
  t.ok(measurement.applyTraffic.fulfilled > 0,
    'the background public-session traffic committed commands');
  for (const sample of measurement.samples) {
    t.ok(sample.imageBytes >= sample.targetMiB * BYTES_PER_MIB,
      `${sample.targetMiB} MiB sample serialized the full target image`);
    t.ok(sample.scrubbedTables.includes(SHADOW_HISTORY_TABLE),
      `${sample.targetMiB} MiB sample scrubbed the history-shaped fixture`);
    t.equal(sample.afterScrub.pageCount, sample.opened.pageCount,
      `${sample.targetMiB} MiB scrub did not undo already-copied pages`);
  }
  return measurement;
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

// One sentinel autocommit row per attempt until one is in every replica file.
async function awaitSteadyPartition(t, cluster, seed, sessionKey) {
  const startedAt = Date.now();
  const deadline = startedAt + scaleByMachineFactor(WINDOW_MS.STEADY);
  const attempts = [];
  while (Date.now() < deadline) {
    const id = `${SENTINEL_PREFIX}${attempts.length}`;
    const answer = publicAnswer(await seed.query(sessionKey, SQL.INSERT,
      [id, VALUE]));
    attempts.push({id, acknowledged: answer.acknowledged, error: answer.error});
    const replicas = await pollUntil(t,
      Math.min(deadline, Date.now() + scaleByMachineFactor(WINDOW_MS.HOLD)),
      () => observeTableReplicas(cluster.nodes, {tableName: TABLE, ids: [id]}),
      (observed) => everyReplicaHolds(observed, [id]));
    if (everyReplicaHolds(replicas, [id])) {
      return {steady: true, elapsedMs: Date.now() - startedAt, attempts};
    }
  }
  return {steady: false, elapsedMs: Date.now() - startedAt, attempts};
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
  evidence.steady = await awaitSteadyPartition(t, cluster, seed,
    sessions.seedAuto);
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
      t.ok(evidence.steady.steady,
        'a sentinel autocommit row reached all three replicas first ' +
        `(${JSON.stringify(evidence.steady)})`);
      if (!evidence.steady.steady) return;
      await measureShadowWorkspace(t, context, evidence, sink);
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

const logLast = (replica) => replica.consensus.logBounds?.last ?? 0;
const appliedIndex = (replica) =>
  Number(replica.consensus.applied?.[0]?.applied_index ?? 0);
const progress = (replica) => [logLast(replica), appliedIndex(replica)];
const shot = (record, label) =>
  record.snapshots.find((snapshot) => snapshot.label === label).replicas;
const byNode = (replicas) => new Map(replicas.map((r) => [r.node, r]));

// Replicas whose consensus log and applied index did not move while the
// transaction was held, although another replica's did.
function frozenDuringHold(record) {
  const held = byNode(shot(record, 'held'));
  const beforeRelease = shot(record, 'before-release');
  const moved = beforeRelease.filter((replica) => held.has(replica.node) &&
    logLast(replica) > logLast(held.get(replica.node)));
  if (moved.length === 0) return [];
  return beforeRelease.filter((replica) => held.has(replica.node) &&
    JSON.stringify(progress(replica)) ===
      JSON.stringify(progress(held.get(replica.node))));
}

// What lab runs 6-7 measured today (F-TX-ACTIVE-OWNS-CONNECTION); the
// committed witness flips when the ACTIVE transaction stops owning the
// replica's connection.
function assertVariant(t, record) {
  const {decision} = record;
  t.ok(record.holdStep?.every((step) => step.acknowledged),
    `${decision}: the held transaction's INSERT was staged`);
  t.equal(record.release.transaction.acknowledged,
    decision === EMBEDDED_HOLD_DECISION.COMMIT,
    `${decision}: the held transaction ended as decided`);
  const settled = shot(record, 'settled');
  t.equal(settled.length, EXPECTED_REPLICAS, 'three replica files observed');
  t.equal(record.seedAutocommit.acknowledged, false,
    `${FINDING}: an autocommit on the holding node, issued while the ` +
    `transaction is ACTIVE, is refused (${record.seedAutocommit.error})`);
  t.equal(record.seedAutocommit.deferred, false,
    `${FINDING}: and the refusal is not marked deferred/retryable`);
  const released = byNode(shot(record, 'released'));
  t.ok(shot(record, 'before-release').every((replica) =>
    logLast(released.get(replica.node) ?? replica) >= logLast(replica)),
  'T-A property holding today: no replica\'s consensus log shrank across ' +
    'the client release (the rs-raft store refused to write inside the ' +
    'user transaction, so the release erased no acknowledged Raft state)');
  const txHolders = settled.filter((replica) => replica.txRow > 0).length;
  t.equal(txHolders, decision === EMBEDDED_HOLD_DECISION.COMMIT ? 1 : 0,
    decision === EMBEDDED_HOLD_DECISION.COMMIT ?
      'F-TX-REPLICATED-APPLY: the committed transaction row is on exactly ' +
        'one replica' :
      'the rolled-back transaction row is on no replica');
  const frozen = frozenDuringHold(record);
  if (frozen.length > 0) {
    const maxLast = Math.max(...settled.map(logLast));
    t.comment(`frozen during hold: ${JSON.stringify(frozen.map((replica) =>
      [replica.node.slice(0, 8), progress(replica)]))}; settled max log ` +
      `index ${maxLast}`);
  }
  t.ok(frozen.length > 0 || !record.joinerAutocommit.acknowledged,
    `${FINDING}: when the partition committed a write during the hold, a ` +
    'replica\'s consensus log and applied index stayed frozen for the ' +
    'whole hold (the replica whose connection the transaction held)');
}
