/**
 * Public Application Database transactions across partitions (I2).
 *
 * The application (test/integration/helpers/embedded-node-worker.js, public
 * package entry only) writes a two-table fixture, `current` and `history`:
 * two tables are two partitions, so every transaction below touching both is
 * a two-participant (2PC) transaction through the one coordinator
 * (src/query/distributed/distributed-transaction-protocol.js) behind
 * `db.transaction` (src/query/application-database.js).
 *
 * What this proves, precisely:
 * - ATOMIC OUTCOME: a committed transaction's writes are all durable and
 *   become visible to another session; a failed transaction leaves NONE of its
 *   staged writes, whether the first or a later statement fails, and even when
 *   the callback catches the failure and continues (the first failure dooms
 *   the transaction), or tries raw COMMIT text (TRANSACTION_CONTROL_RESERVED).
 * - SHAPE: the committed size is ONE runtime
 *   (helpers/public-application-database-shape.js). On three processes the lab
 *   showed FINDING F-2PC-REPLICA-VISIBILITY: a committed transaction's rows
 *   exist only on the replica that staged them (followers applying the
 *   TRANSACTION_COMMIT marker never run its operations), so reads routed to a
 *   follower return [] for committed rows. Owned by the partition transaction
 *   owner, not this seam; the multi-process proof waits on that fix.
 * - Absence is proven with a sentinel, never with a sleep: after a failed
 *   transaction, an autocommit sentinel is written to the SAME tables; once
 *   the reader sees both sentinels, a durable staged write would be visible
 *   too. This holds only when the reader and writer see the same replica
 *   (one runtime); with per-read replica selection across processes it does
 *   not, which is part of why the multi-process shape is blocked.
 * - The application never receives a session identity. Concurrent
 *   top-level transactions on the SAME partitions do NOT commit independently
 *   today: see the F-2PC-CONCURRENT-PARTICIPANT witness below.
 * - NOT proven and NOT promised: that a concurrent reader on another node
 *   never observes one participant's writes before the other's (commit
 *   fan-out is sequential per participant; visibility is not atomic across
 *   partitions). The suite samples the reader and REPORTS any half-visible
 *   observation without asserting on it.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  EMBEDDED_STEP_OUTCOME,
  createEmbeddedCluster,
  exposedProperty,
  fulfilledRows,
  mustQuery,
  readUntil,
} from './helpers/embedded-cluster-harness.js';
import {
  SESSION_KEY_FRAGMENT,
  findTopologyLeaks,
} from './helpers/public-surface-leak.js';
import {
  TRANSACTIONS_CLUSTER_SIZE,
  TRANSACTIONS_TEST_TIMEOUT_MS,
} from './helpers/public-application-database-shape.js';

const APPLICATION_ID = 'public-seam-transactions';
const TRANSACTION_ALREADY_ACTIVE_MESSAGE =
  'Transaction already active on this partition';
const ERROR_CODE = Object.freeze({
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  TRANSACTION_CONTROL_RESERVED: 'TRANSACTION_CONTROL_RESERVED',
});
const PUBLIC_RESULT_KEYS = ['affectedRows', 'rows'];
const SQL = Object.freeze({
  CREATE_CURRENT: 'CREATE TABLE current (id TEXT PRIMARY KEY, value TEXT)',
  CREATE_HISTORY:
    'CREATE TABLE history (id TEXT PRIMARY KEY, current_id TEXT, value TEXT)',
  INSERT_CURRENT: 'INSERT INTO current (id, value) VALUES (?, ?)',
  INSERT_HISTORY:
    'INSERT INTO history (id, current_id, value) VALUES (?, ?, ?)',
  READ_CURRENT: 'SELECT id, value FROM current WHERE id = ?',
  READ_HISTORY: 'SELECT id, current_id, value FROM history WHERE id = ?',
  RAW_COMMIT: 'COMMIT',
});

const insertCurrent = (id, value, swallow = false) =>
  ({sql: SQL.INSERT_CURRENT, params: [id, value], swallow});
const insertHistory = (id, currentId, value, swallow = false) =>
  ({sql: SQL.INSERT_HISTORY, params: [id, currentId, value], swallow});

function isPublicResultSnapshot(snapshot) {
  return snapshot?.prototype === null && snapshot.frozen === true &&
    JSON.stringify(Object.keys(snapshot.properties).sort()) ===
      JSON.stringify(PUBLIC_RESULT_KEYS);
}

test('public application database transactions are atomic in outcome across partitions', {
  timeout: TRANSACTIONS_TEST_TIMEOUT_MS,
}, async (t) => {
  const cluster = createEmbeddedCluster(t);
  const formation = await cluster.formCluster(TRANSACTIONS_CLUSTER_SIZE);
  t.comment(`formation (${TRANSACTIONS_CLUSTER_SIZE} process(es)): ` +
    JSON.stringify(formation));
  const writer = cluster.nodes[0];
  const reader = cluster.nodes[cluster.nodes.length - 1];
  const sessionA = await writer.openApplicationDatabase(APPLICATION_ID);
  const sessionB = await reader.openApplicationDatabase(APPLICATION_ID);
  const received = [];
  const keepTransaction = (label, result) => {
    received.push({label, value: result.transaction.value});
    result.steps.forEach((step, index) =>
      received.push({label: `${label} step ${index}`, value: step.value}));
    return result;
  };
  let sentinelSequence = 0;

  // Proves absence: once the reader sees fresh sentinels in BOTH tables, any
  // durable staged write committed before them would be visible as well.
  async function readAfterSentinels(t) {
    sentinelSequence++;
    const id = `sentinel-${sentinelSequence}`;
    await mustQuery(writer, sessionA, SQL.INSERT_CURRENT, [id, 'sentinel']);
    await mustQuery(writer, sessionA, SQL.INSERT_HISTORY, [id, id, 'sentinel']);
    await readUntil(t, reader, sessionB, SQL.READ_CURRENT, [id],
      (rows) => rows.length === 1);
    await readUntil(t, reader, sessionB, SQL.READ_HISTORY, [id],
      (rows) => rows.length === 1);
  }

  async function readerRows(sql, id) {
    return fulfilledRows(await mustQuery(reader, sessionB, sql, [id]));
  }

  await mustQuery(writer, sessionA, SQL.CREATE_CURRENT);
  await mustQuery(writer, sessionA, SQL.CREATE_HISTORY);

  await t.test('I2.1 a committed two-partition transaction is durable and visible', async (t) => {
    const result = keepTransaction('I2.1', await writer.transaction(sessionA, [
      insertCurrent('c1', 'v1'),
      insertHistory('h1', 'c1', 'v1'),
    ]));
    t.equal(result.transaction.outcome, EMBEDDED_STEP_OUTCOME.FULFILLED,
      'the transaction commits');
    for (const step of result.steps) {
      t.ok(isPublicResultSnapshot(step.value),
        'tx.query returns the frozen null-prototype {rows, affectedRows}');
      t.equal(exposedProperty(step.value, 'affectedRows'), 1);
    }
    let halfVisible = 0;
    let samples = 0;
    const both = await readUntil(t, reader, sessionB,
      'SELECT id FROM current WHERE id = ?', ['c1'], (rows) => rows.length === 1);
    const history = await readUntil(t, reader, sessionB, SQL.READ_HISTORY, ['h1'],
      (rows) => {
        samples++;
        if (rows.length === 0) halfVisible++;
        return rows.length === 1;
      });
    t.same(await readerRows(SQL.READ_CURRENT, 'c1'), [{id: 'c1', value: 'v1'}]);
    t.same(history.rows, [{id: 'h1', current_id: 'c1', value: 'v1'}]);
    t.comment(`I2.1 visibility: current after ${both.windowMs} ms, history ` +
      `after a further ${history.windowMs} ms; reader samples with current ` +
      `visible but history not yet: ${halfVisible}/${samples} (reported, not ` +
      'asserted: cross-partition visibility is not atomic)');
  });

  await t.test('I2.2 a failed later statement leaves neither staged write', async (t) => {
    const result = keepTransaction('I2.2', await writer.transaction(sessionA, [
      insertCurrent('c2', 'staged'),
      insertHistory('h1', 'c2', 'duplicate primary key'),
    ]));
    t.equal(result.transaction.outcome, EMBEDDED_STEP_OUTCOME.REJECTED);
    t.equal(result.transaction.value.prototype, 'ApplicationDatabaseError',
      'the callback rejects with an ApplicationDatabaseError');
    await readAfterSentinels(t);
    t.same(await readerRows(SQL.READ_CURRENT, 'c2'), [],
      'the first (successful) statement was not made durable');
    t.same(await readerRows(SQL.READ_HISTORY, 'h1'),
      [{id: 'h1', current_id: 'c1', value: 'v1'}], 'the duplicate target is intact');
  });

  await t.test('I2.2b a failed first statement leaves neither staged write', async (t) => {
    const result = keepTransaction('I2.2b', await writer.transaction(sessionA, [
      insertCurrent('c1', 'duplicate primary key'),
      insertHistory('h2', 'c1', 'staged'),
    ]));
    t.equal(result.transaction.outcome, EMBEDDED_STEP_OUTCOME.REJECTED);
    t.equal(result.steps.length, 1, 'the callback stops at the first failure');
    await readAfterSentinels(t);
    t.same(await readerRows(SQL.READ_HISTORY, 'h2'), []);
    t.same(await readerRows(SQL.READ_CURRENT, 'c1'), [{id: 'c1', value: 'v1'}]);
  });

  await t.test('I2.3 a caught failure still dooms the transaction', async (t) => {
    const result = keepTransaction('I2.3', await writer.transaction(sessionA, [
      insertCurrent('c1', 'duplicate primary key', true),
      insertHistory('h3', 'c1', 'after caught failure', true),
    ]));
    t.equal(result.steps[0].outcome, EMBEDDED_STEP_OUTCOME.REJECTED,
      'the duplicate statement fails and the callback catches it');
    t.equal(result.steps[1].outcome, EMBEDDED_STEP_OUTCOME.REJECTED,
      'a later statement settles with the recorded first failure');
    t.equal(result.transaction.outcome, EMBEDDED_STEP_OUTCOME.REJECTED,
      'the callback returned normally, the transaction still rejects');
    t.equal(exposedProperty(result.transaction.value, 'code'),
      exposedProperty(result.steps[0].value, 'code'),
      'the transaction rejects with the first failure');
    await readAfterSentinels(t);
    t.same(await readerRows(SQL.READ_HISTORY, 'h3'), []);
  });

  await t.test('I2.3b raw COMMIT text is reserved and dooms the transaction', async (t) => {
    const result = keepTransaction('I2.3b', await writer.transaction(sessionA, [
      insertCurrent('c4', 'staged before raw commit'),
      {sql: SQL.RAW_COMMIT, params: [], swallow: true},
    ]));
    t.equal(exposedProperty(result.steps[1].value, 'code'),
      ERROR_CODE.TRANSACTION_CONTROL_RESERVED);
    t.equal(result.transaction.outcome, EMBEDDED_STEP_OUTCOME.REJECTED);
    t.equal(exposedProperty(result.transaction.value, 'code'),
      ERROR_CODE.TRANSACTION_CONTROL_RESERVED);
    await readAfterSentinels(t);
    t.same(await readerRows(SQL.READ_CURRENT, 'c4'), []);
  });

  // FINDING F-2PC-CONCURRENT-PARTICIPANT (witness, asserts the CURRENT
  // defect; flips when the owner fixes it): the brief expects two concurrent
  // top-level transactions on disjoint ids to commit independently. Today a
  // partition replica admits ONE open transaction on its single SQLite
  // connection (PartitionServiceTransactionBase.beginTransaction refuses a
  // second session with TRANSACTION_ALREADY_ACTIVE), the refusal reaches the
  // application as an untyped INTERNAL_ERROR (not retryable, not deferred),
  // and the contract in architecture/process-replication.md (snapshot
  // isolation, first-committer-wins at prepare) is not what runs. The loser
  // leaves nothing durable. When the owner admits concurrent sessions (or
  // types the conflict as retryable), replace this witness with "both commit".
  await t.test('F-2PC-CONCURRENT-PARTICIPANT witness: a concurrent transaction on the same partitions is refused', async (t) => {
    const [first, second] = await Promise.all([
      writer.transaction(sessionA, [insertCurrent('c5', 'first'),
        insertHistory('h5', 'c5', 'first')]),
      writer.transaction(sessionA, [insertCurrent('c6', 'second'),
        insertHistory('h6', 'c6', 'second')]),
    ]);
    keepTransaction('I2.4 first', first);
    keepTransaction('I2.4 second', second);
    const outcomes = [first, second].map((result) => result.transaction.outcome);
    t.comment(`F-2PC outcomes: ${outcomes.join(' / ')}`);
    t.same([...outcomes].sort(),
      [EMBEDDED_STEP_OUTCOME.FULFILLED, EMBEDDED_STEP_OUTCOME.REJECTED],
      'observed today: exactly one of two concurrent transactions commits');
    const [winner, loser] = first.transaction.outcome ===
      EMBEDDED_STEP_OUTCOME.FULFILLED ? [['c5', 'h5'], second] :
      [['c6', 'h6'], first];
    t.equal(exposedProperty(loser.transaction.value, 'code'),
      ERROR_CODE.INTERNAL_ERROR, 'the refusal is an untyped INTERNAL_ERROR');
    t.equal(exposedProperty(loser.transaction.value, 'message'),
      TRANSACTION_ALREADY_ACTIVE_MESSAGE);
    t.equal(exposedProperty(loser.transaction.value, 'deferred'), false,
      'and is not marked deferred');
    t.equal(exposedProperty(loser.transaction.value, 'retryAfterMs'), null,
      'nor retryable');
    await readUntil(t, reader, sessionB, SQL.READ_CURRENT, [winner[0]],
      (rows) => rows.length === 1);
    await readUntil(t, reader, sessionB, SQL.READ_HISTORY, [winner[1]],
      (rows) => rows.length === 1);
    await readAfterSentinels(t);
    const loserIds = winner[0] === 'c5' ? ['c6', 'h6'] : ['c5', 'h5'];
    t.same(await readerRows(SQL.READ_CURRENT, loserIds[0]), [],
      'the refused transaction left nothing durable');
    t.same(await readerRows(SQL.READ_HISTORY, loserIds[1]), []);
  });

  await t.test('I2 no transaction outcome carries topology or a session identity', async (t) => {
    const forbiddenValues = [
      ...cluster.nodes.map((node) => node.nodeId),
      `application:${APPLICATION_ID}:`,
    ];
    for (const {label, value} of received) {
      t.same(findTopologyLeaks(value, {
        extraKeyFragments: [SESSION_KEY_FRAGMENT],
        forbiddenValues,
      }), [], `${label}: no topology, no session identity`);
    }
  });
});
