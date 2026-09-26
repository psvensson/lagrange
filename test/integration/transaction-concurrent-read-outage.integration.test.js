/**
 * Read-outage capture after two concurrent top-level transactions
 * (quest distributed-transaction-replicated-apply, phase 1: evidence only;
 * the images-seam finding F-2PC-CONCURRENT-PARTICIPANT and its ~40 s
 * unreadable-table symptom).
 *
 * On a fresh three-process cluster the application on the seed runs two
 * db.transaction calls concurrently on the same two tables (`current`,
 * `history`: two partitions, two participants each) through one public
 * session, exactly the images-seam I2.4 shape. A reader on a joiner then
 * samples `SELECT ... WHERE id = ?` on both tables through its public session
 * until both tables have answered successfully many times in a row, or a
 * bounded window ends, and records every failure's code and message with its
 * time since the transactions settled. The replica files of both tables are
 * observed read-only (helpers/replica-sqlite-observer.js) before and after
 * the window, and every node's warn/error log lines inside the window are
 * kept. A second round repeats the pair after a transaction that fails on a
 * duplicate PRIMARY KEY (the images-seam run that saw the outage had failing
 * transactions before the concurrent pair).
 *
 * It asserts only what is measured to be stable (exactly one of the two
 * concurrent transactions commits); the read outage is RECORDED, whether or
 * not it occurs, because its occurrence was intermittent on the lab.
 *
 * Raw evidence (JSON + node logs): test-output/transaction-replicated-apply/
 * concurrent-read-outage-<timestamp>/ (helpers/replicated-apply-evidence.js).
 */

import {readFileSync} from 'node:fs';
import {hostname} from 'node:os';
import {test} from '../../src/test-helpers/tap.js';
import {managedSleep} from '../../src/test-helpers/managed-timers.js';
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

const FINDING = 'F-2PC-CONCURRENT-READ-OUTAGE';
const APPLICATION_ID = 'transaction-concurrent-read-outage';
const CLUSTER_SIZE = 3;
const TEST_TIMEOUT_MS = 600000;
const RUN_RESERVE_MS = 45000;
const READ_WINDOW_MS = 60000;
const READ_POLL_MS = 100;
const STABLE_SUCCESSES = 30;
const LOG_WINDOW_SLACK_MS = 2000;
const LOG_MIN_LEVEL = 40;
const LOG_LINE_CHARS = 600;
const LOG_LINES_PER_NODE = 400;
const ERROR_DETAIL_CHARS = 2000;
const TABLE = Object.freeze({CURRENT: 'current', HISTORY: 'history'});
const SQL = Object.freeze({
  CREATE_CURRENT: 'CREATE TABLE IF NOT EXISTS current (id TEXT PRIMARY KEY, value TEXT)',
  CREATE_HISTORY:
    'CREATE TABLE IF NOT EXISTS history (id TEXT PRIMARY KEY, current_id TEXT, value TEXT)',
  INSERT_CURRENT: 'INSERT INTO current (id, value) VALUES (?, ?)',
  INSERT_HISTORY:
    'INSERT INTO history (id, current_id, value) VALUES (?, ?, ?)',
  READ_CURRENT: 'SELECT id FROM current WHERE id = ?',
  READ_HISTORY: 'SELECT id FROM history WHERE id = ?',
});
const VALUE = 'v';
const MARKER_TYPES = [PARTITION_SERVICE_OPERATION.TRANSACTION_COMMIT];
const ROUND = Object.freeze({
  PLAIN: 'concurrent-pair',
  AFTER_FAILURE: 'failed-transaction-then-concurrent-pair',
  // The images-seam I2 sequence before its concurrent pair: a first-statement
  // failure, a caught (swallowed) failure that continues, and raw COMMIT text
  // inside the callback (TRANSACTION_CONTROL_RESERVED).
  AFTER_I2_SEQUENCE: 'i2-failure-sequence-then-concurrent-pair',
});
const RAW_COMMIT = 'COMMIT';

const pair = (current, history) => [
  {sql: SQL.INSERT_CURRENT, params: [current, VALUE]},
  {sql: SQL.INSERT_HISTORY, params: [history, current, VALUE]},
];

function settledOutcome(result) {
  const fulfilled = result.transaction.outcome === EMBEDDED_STEP_OUTCOME.FULFILLED;
  return {
    outcome: result.transaction.outcome,
    error: fulfilled ? undefined : describeExposedError(result.transaction.value),
    steps: result.steps.map((step) => step.outcome === EMBEDDED_STEP_OUTCOME.FULFILLED ?
      step.outcome : describeExposedError(step.value)),
  };
}

function errorDetail(outcome) {
  return JSON.stringify(decodeExposure(outcome.value))
    .slice(0, ERROR_DETAIL_CHARS);
}

async function readOnce(reader, sessionKey, sql, id) {
  const outcome = await reader.query(sessionKey, sql, [id]);
  if (outcome.outcome === EMBEDDED_STEP_OUTCOME.FULFILLED) {
    return {ok: true, rows: decodeExposure(outcome.value)?.rows?.length ?? null};
  }
  return {ok: false, error: describeExposedError(outcome.value),
    detail: errorDetail(outcome)};
}

// Samples both tables until both answered STABLE_SUCCESSES times in a row.
async function sampleReads(t, reader, sessionKey, ids, deadline) {
  const startedAt = Date.now();
  const failures = [];
  let consecutive = 0;
  let samples = 0;
  let firstFailureMs = null;
  let lastFailureMs = null;
  // How many rows each successful read returned: a follower-served read of a
  // committed transactional row answers [] (F-TX-REPLICATED-APPLY).
  const rowCounts = {};
  while (consecutive < STABLE_SUCCESSES && Date.now() < deadline) {
    const reads = [
      [TABLE.CURRENT, await readOnce(reader, sessionKey, SQL.READ_CURRENT, ids[0])],
      [TABLE.HISTORY, await readOnce(reader, sessionKey, SQL.READ_HISTORY, ids[1])],
    ];
    samples++;
    const atMs = Date.now() - startedAt;
    for (const [table, read] of reads) {
      if (!read.ok) continue;
      const key = `${table} rows=${read.rows}`;
      rowCounts[key] = (rowCounts[key] ?? 0) + 1;
    }
    const failed = reads.filter(([, read]) => !read.ok);
    if (failed.length === 0) {
      consecutive++;
    } else {
      consecutive = 0;
      firstFailureMs ??= atMs;
      lastFailureMs = atMs;
      failures.push({atMs, failed: failed.map(([table, read]) => ({table, ...read}))});
    }
    await managedSleep(t, READ_POLL_MS);
  }
  return {samples, stable: consecutive >= STABLE_SUCCESSES,
    windowMs: Date.now() - startedAt, firstFailureMs, lastFailureMs,
    outageMs: firstFailureMs === null ? 0 : lastFailureMs - firstFailureMs,
    failureCount: failures.length, errors: summarizeErrors(failures), rowCounts,
    failures: failures.slice(0, LOG_LINES_PER_NODE)};
}

function summarizeErrors(failures) {
  const counts = {};
  for (const failure of failures) {
    for (const read of failure.failed) {
      const key = `${read.table} ${read.error}`;
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  return counts;
}

function logLinesBetween(node, fromMs, toMs) {
  let text = '';
  try {
    text = readFileSync(node.logPath, 'utf8');
  } catch (error) {
    return [`log unreadable: ${error.message}`];
  }
  const lines = [];
  for (const line of text.split('\n')) {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (!(entry.level >= LOG_MIN_LEVEL)) continue;
    // The runtime logs ISO-8601 time (src/logging/logging-service.js).
    const atMs = Date.parse(entry.time);
    if (!(atMs >= fromMs - LOG_WINDOW_SLACK_MS &&
      atMs <= toMs + LOG_WINDOW_SLACK_MS)) continue;
    lines.push(line.slice(0, LOG_LINE_CHARS));
  }
  return lines.slice(0, LOG_LINES_PER_NODE);
}

function observeBoth(nodes, ids) {
  return {
    [TABLE.CURRENT]: observeTableReplicas(nodes, {tableName: TABLE.CURRENT,
      ids: [ids.current[0], ids.current[1]], markerTypes: MARKER_TYPES}),
    [TABLE.HISTORY]: observeTableReplicas(nodes, {tableName: TABLE.HISTORY,
      ids: [ids.history[0], ids.history[1]], markerTypes: MARKER_TYPES}),
  };
}

async function runI2FailureSequence(writer, session, prefix) {
  const existing = `${prefix}e0`;
  const sequence = [];
  sequence.push(settledOutcome(await writer.transaction(session,
    pair(existing, `${prefix}eh0`))));
  // The first statement fails on a duplicate PRIMARY KEY.
  sequence.push(settledOutcome(await writer.transaction(session, [
    {sql: SQL.INSERT_CURRENT, params: [existing, VALUE]},
    {sql: SQL.INSERT_HISTORY, params: [`${prefix}eh1`, existing, VALUE]}])));
  // A failure the callback catches and continues past.
  sequence.push(settledOutcome(await writer.transaction(session, [
    {sql: SQL.INSERT_CURRENT, params: [`${prefix}e2`, VALUE]},
    {sql: SQL.INSERT_CURRENT, params: [existing, VALUE], swallow: true},
    {sql: SQL.INSERT_HISTORY, params: [`${prefix}eh2`, existing, VALUE]}])));
  // Raw transaction-control text inside the callback.
  sequence.push(settledOutcome(await writer.transaction(session, [
    {sql: SQL.INSERT_CURRENT, params: [`${prefix}e3`, VALUE]},
    {sql: RAW_COMMIT, params: []}])));
  return sequence;
}

async function runRound(t, context, round, prefix) {
  const {cluster, writer, writerSession, reader, readerSession} = context;
  const record = {round};
  if (round === ROUND.AFTER_FAILURE) {
    const failing = [...pair(`${prefix}f1`, `${prefix}fh1`),
      {sql: SQL.INSERT_CURRENT, params: [`${prefix}f1`, VALUE]}];
    record.failingTransaction = settledOutcome(
      await writer.transaction(writerSession, failing));
  }
  if (round === ROUND.AFTER_I2_SEQUENCE) {
    record.failureSequence = await runI2FailureSequence(writer, writerSession,
      prefix);
  }
  const ids = {current: [`${prefix}c1`, `${prefix}c2`],
    history: [`${prefix}h1`, `${prefix}h2`]};
  const startedAt = Date.now();
  const [first, second] = await Promise.all([
    writer.transaction(writerSession, pair(ids.current[0], ids.history[0])),
    writer.transaction(writerSession, pair(ids.current[1], ids.history[1])),
  ]);
  const settledAt = Date.now();
  record.pairSettleMs = settledAt - startedAt;
  record.first = settledOutcome(first);
  record.second = settledOutcome(second);
  const winner = record.first.outcome === EMBEDDED_STEP_OUTCOME.FULFILLED ? 0 : 1;
  record.replicasBefore = observeBoth(cluster.nodes, ids);
  record.reads = await sampleReads(t, reader, readerSession,
    [ids.current[winner], ids.history[winner]],
    Math.min(Date.now() + scaleByMachineFactor(READ_WINDOW_MS),
      context.runDeadline));
  record.writerReads = await sampleReads(t, writer, writerSession,
    [ids.current[winner], ids.history[winner]],
    Math.min(Date.now() + scaleByMachineFactor(READ_WINDOW_MS),
      context.runDeadline));
  record.replicasAfter = observeBoth(cluster.nodes, ids);
  const endedAt = Date.now();
  record.logs = Object.fromEntries(cluster.nodes.map((node) =>
    [`${node.role}-${node.nodeId}`, logLinesBetween(node, startedAt, endedAt)]));
  return record;
}

test(`${FINDING}: reads after two concurrent transactions on the same tables`,
  {timeout: TEST_TIMEOUT_MS}, async (t) => {
    const runDeadline = Date.now() + TEST_TIMEOUT_MS - RUN_RESERVE_MS;
    const sink = createEvidenceSink('concurrent-read-outage');
    const cluster = createEmbeddedCluster(t);
    const evidence = {finding: FINDING, host: hostname(),
      evidenceDirectory: sink.directory, rounds: []};
    t.comment(`evidence: ${sink.jsonPath}`);
    try {
      evidence.formation = await cluster.formCluster(CLUSTER_SIZE);
      const writer = cluster.nodes[0];
      const reader = cluster.nodes[cluster.nodes.length - 1];
      const context = {cluster, writer, reader, runDeadline,
        writerSession: await writer.openApplicationDatabase(APPLICATION_ID),
        readerSession: await reader.openApplicationDatabase(APPLICATION_ID)};
      evidence.create = [
        await serveStatement(t, writer, context.writerSession, SQL.CREATE_CURRENT),
        await serveStatement(t, writer, context.writerSession, SQL.CREATE_HISTORY),
      ];
      t.ok(evidence.create.every((create) => create.served),
        `both tables were created (${JSON.stringify(evidence.create)})`);
      evidence.warmup = settledOutcome(await writer.transaction(
        context.writerSession, pair('w-c0', 'w-h0')));
      for (const [index, round] of Object.values(ROUND).entries()) {
        if (Date.now() >= runDeadline) break;
        const record = await runRound(t, context, round, `r${index}-`);
        evidence.rounds.push(record);
        sink.write(evidence, cluster.nodes);
        t.comment(`${round}: ${record.first.outcome}/${record.second.outcome} ` +
          `reader outage ${record.reads.outageMs} ms ` +
          `(${record.reads.failureCount} failed samples, stable=` +
          `${record.reads.stable}) ${JSON.stringify(record.reads.errors)}`);
        t.same([record.first.outcome, record.second.outcome].sort(),
          [EMBEDDED_STEP_OUTCOME.FULFILLED, EMBEDDED_STEP_OUTCOME.REJECTED],
          `${round}: exactly one of two concurrent transactions commits`);
      }
    } finally {
      evidence.finishedAt = new Date().toISOString();
      sink.write(evidence, cluster.nodes);
      t.comment(`evidence written: ${sink.jsonPath}`);
    }
  });
