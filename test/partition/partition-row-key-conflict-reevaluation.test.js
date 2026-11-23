/**
 * Regression witnesses for post-settle FIFO row-key conflict re-evaluation and
 * read-snapshot isolation (Part A):
 * - Conflicting writers without prior partition reads wait in FIFO order and
 *   acquire the row key in-place upon holder settlement with zero 40001 failures.
 * - Writers that already executed a partition read (hasExecutedRead) keep
 *   generationBase pinned: a holder commit forces ALREADY_ACTIVE (40001) while
 *   a holder rollback allows safe in-place continuation.
 * - Multi-op sessions without prior reads rebase safely via
 *   canAdvanceRowKeySessionGeneration; declining waiters hand off immediately to
 *   the next FIFO waiter; deadlocks respect conflictSettleWaitMs.
 */
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {
  PARTICIPANT_TRANSACTION_FAILURE_CODE as CODE,
} from '../../src/partition/partition-participant-transaction-constants.js';
import {PARTITION_SERVICE_OPERATION} from '../../src/partition/partition-service-constants.js';
import {
  INSERT_SQL,
  TABLE,
  applyProposal,
  beginMessage,
  clearFixtureSingletons,
  commitMessage,
  identityOf,
  isDecisionCommand,
  isPrepareCommand,
  onFixtureLeader as onLeader,
  prepareMessage,
  queryMessage,
  resetFixtureSingletons,
  send,
  settleTicks,
  txMessage,
} from '../test-helpers/participant-transaction-fixture.js';

const UPDATE_SQL = `UPDATE ${TABLE} SET value = ? WHERE id = ?`;
const SELECT_SQL = `SELECT id, value FROM ${TABLE} WHERE id = ?`;

async function commitParticipantTx(leader, proposed, tx) {
  const prepPromise = send(leader, prepareMessage(tx));
  await applyProposal(
    leader,
    proposed,
    (entry) => entry.transactionId === tx.transactionId && isPrepareCommand(entry),
  );
  const prep = await prepPromise;
  assert.equal(prep.success, true, `PREPARE failed for ${tx.transactionId}: ${JSON.stringify(prep)}`);

  const commitPromise = send(leader, commitMessage(tx, prep.preparedDigest));
  await applyProposal(
    leader,
    proposed,
    (entry) => entry.transactionId === tx.transactionId && isDecisionCommand(entry),
  );
  const committed = await commitPromise;
  assert.equal(committed.success, true, `COMMIT failed for ${tx.transactionId}`);
}

function readRowValue(leader, id) {
  return leader.db.prepare(`SELECT value FROM ${TABLE} WHERE id = ?`).get(id)?.value ?? null;
}

function setupRowKeyLeader(leader, conflictSettleWaitMs = 3000) {
  leader.concurrencyGranularity = 'row-key';
  leader.cdcIntegrationService = {};
  leader.conflictSettleWaitMs = conflictSettleWaitMs;
}

beforeEach(() => resetFixtureSingletons());
afterEach(() => clearFixtureSingletons());

test('in-place post-settle FIFO re-evaluation eliminates contention starvation across concurrent writers', async () => {
  await onLeader(async (leader, proposed) => {
    setupRowKeyLeader(leader);

    const seedTx = identityOf('a0'.repeat(16), {sessionId: 'sess-seed'});
    assert.equal((await send(leader, beginMessage(seedTx))).success, true);
    assert.equal((await leader.handleRemoteQuery(queryMessage(seedTx, INSERT_SQL, ['k1', 'init']))).success, true);
    await commitParticipantTx(leader, proposed, seedTx);

    const t1 = identityOf('11'.repeat(16), {sessionId: 'sess-1'});
    const t2 = identityOf('22'.repeat(16), {sessionId: 'sess-2'});
    const t3 = identityOf('33'.repeat(16), {sessionId: 'sess-3'});
    const order = [];

    assert.equal((await send(leader, beginMessage(t1))).success, true);
    assert.equal((await send(leader, beginMessage(t2))).success, true);
    assert.equal((await send(leader, beginMessage(t3))).success, true);

    assert.equal((await leader.handleRemoteQuery(queryMessage(t1, UPDATE_SQL, ['v1', 'k1']))).success, true);

    const p2 = leader.handleRemoteQuery(queryMessage(t2, UPDATE_SQL, ['v2', 'k1'])).then((res) => {
      order.push('t2');
      return res;
    });
    await settleTicks(4);
    const p3 = leader.handleRemoteQuery(queryMessage(t3, UPDATE_SQL, ['v3', 'k1'])).then((res) => {
      order.push('t3');
      return res;
    });
    await settleTicks(4);

    assert.deepEqual(order, [], 'waiters remain parked while holder t1 is active');

    await commitParticipantTx(leader, proposed, t1);
    const r2 = await p2;
    assert.equal(r2.success, true, `t2 must acquire in-place on t1 commit: ${JSON.stringify(r2)}`);

    // New arrival t4 after t1 commits cannot jump ahead of already-queued t3.
    const t4 = identityOf('44'.repeat(16), {sessionId: 'sess-4'});
    assert.equal((await send(leader, beginMessage(t4))).success, true);
    const p4 = leader.handleRemoteQuery(queryMessage(t4, UPDATE_SQL, ['v4', 'k1'])).then((res) => {
      order.push('t4');
      return res;
    });
    await settleTicks(4);
    assert.deepEqual(order, ['t2'], 't3 and t4 must stay parked while t2 holds k1');

    await commitParticipantTx(leader, proposed, t2);
    const r3 = await p3;
    assert.equal(r3.success, true, `t3 must acquire in-place on t2 commit: ${JSON.stringify(r3)}`);
    await settleTicks(4);
    assert.deepEqual(order, ['t2', 't3'], 't4 waits behind t3');

    await commitParticipantTx(leader, proposed, t3);
    const r4 = await p4;
    assert.equal(r4.success, true, `t4 must acquire in-place on t3 commit: ${JSON.stringify(r4)}`);

    await commitParticipantTx(leader, proposed, t4);
    assert.deepEqual(order, ['t2', 't3', 't4']);
    assert.equal(readRowValue(leader, 'k1'), 'v4');
  });
});

test('hasExecutedRead pins generationBase: refuses with ALREADY_ACTIVE on holder commit and recovers in-place on holder rollback', async () => {
  await onLeader(async (leader, proposed) => {
    setupRowKeyLeader(leader);

    const seedTx = identityOf('b0'.repeat(16), {sessionId: 'sess-seed'});
    assert.equal((await send(leader, beginMessage(seedTx))).success, true);
    assert.equal((await leader.handleRemoteQuery(queryMessage(seedTx, INSERT_SQL, ['rk-read', 'init']))).success, true);
    await commitParticipantTx(leader, proposed, seedTx);

    // 1. Holder commits -> reader executed SELECT prior to write -> MUST refuse (40001), AND
    // a queued read-free waiter behind the declining reader MUST be handed off wakeup immediately.
    const hold1 = identityOf('b1'.repeat(16), {sessionId: 'sess-hold-1'});
    const reader = identityOf('b2'.repeat(16), {sessionId: 'sess-reader'});
    const queuedWriter = identityOf('b3'.repeat(16), {sessionId: 'sess-writer'});
    assert.equal((await send(leader, beginMessage(hold1))).success, true);
    assert.equal((await send(leader, beginMessage(reader))).success, true);
    assert.equal((await send(leader, beginMessage(queuedWriter))).success, true);

    assert.equal((await leader.handleRemoteQuery(queryMessage(hold1, UPDATE_SQL, ['committed', 'rk-read']))).success, true);
    const readAns = await leader.handleRemoteQuery(queryMessage(reader, SELECT_SQL, ['rk-read']));
    assert.equal(readAns.success, true);

    const readerWritePromise = leader.handleRemoteQuery(queryMessage(reader, UPDATE_SQL, ['stale', 'rk-read']));
    await settleTicks(4);
    const writerPromise = leader.handleRemoteQuery(queryMessage(queuedWriter, UPDATE_SQL, ['fresh', 'rk-read']));
    await settleTicks(4);

    await commitParticipantTx(leader, proposed, hold1);
    const [readerWrite, writerRes] = await Promise.all([readerWritePromise, writerPromise]);
    assert.equal(readerWrite.success, false);
    assert.equal(readerWrite.failureCode, CODE.ALREADY_ACTIVE);
    assert.equal(writerRes.success, true, `queued writer must wake immediately after declining reader: ${JSON.stringify(writerRes)}`);
    assert.equal(
      (await send(leader, txMessage(PARTITION_SERVICE_OPERATION.ROLLBACK, reader))).success,
      true,
    );
    await commitParticipantTx(leader, proposed, queuedWriter);
    assert.equal(readRowValue(leader, 'rk-read'), 'fresh');

    // 2. Holder rolls back -> generation unchanged -> reader proceeds safely in-place.
    const hold2 = identityOf('b4'.repeat(16), {sessionId: 'sess-hold-2'});
    const reader2 = identityOf('b5'.repeat(16), {sessionId: 'sess-reader-2'});
    assert.equal((await send(leader, beginMessage(hold2))).success, true);
    assert.equal((await send(leader, beginMessage(reader2))).success, true);

    assert.equal((await leader.handleRemoteQuery(queryMessage(hold2, UPDATE_SQL, ['aborted', 'rk-read']))).success, true);
    assert.equal((await leader.handleRemoteQuery(queryMessage(reader2, SELECT_SQL, ['rk-read']))).success, true);

    const reader2WritePromise = leader.handleRemoteQuery(queryMessage(reader2, UPDATE_SQL, ['post-rb', 'rk-read']));
    await settleTicks(4);
    assert.equal(
      (await send(leader, txMessage(PARTITION_SERVICE_OPERATION.ROLLBACK, hold2))).success,
      true,
    );

    const reader2Write = await reader2WritePromise;
    assert.equal(reader2Write.success, true, `reader2 should proceed in-place when holder rolled back: ${JSON.stringify(reader2Write)}`);
    await commitParticipantTx(leader, proposed, reader2);
    assert.equal(readRowValue(leader, 'rk-read'), 'post-rb');
  });
});

test('multi-operation session without prior reads rebases across disjoint commit and respects settle wait bound', async () => {
  await onLeader(async (leader, proposed) => {
    setupRowKeyLeader(leader, 50);

    const hold = identityOf('c1'.repeat(16), {sessionId: 'sess-hold'});
    const multi = identityOf('c2'.repeat(16), {sessionId: 'sess-multi'});
    assert.equal((await send(leader, beginMessage(hold))).success, true);
    assert.equal((await send(leader, beginMessage(multi))).success, true);

    assert.equal((await leader.handleRemoteQuery(queryMessage(multi, INSERT_SQL, ['k-a', 'va']))).success, true);
    assert.equal((await leader.handleRemoteQuery(queryMessage(hold, INSERT_SQL, ['k-b', 'vb-hold']))).success, true);

    // Wait cap: while hold keeps k-b beyond conflictSettleWaitMs=50ms,
    // waiter returns ALREADY_ACTIVE.
    const timedOutWaiter = identityOf('c3'.repeat(16), {sessionId: 'sess-timeout'});
    assert.equal((await send(leader, beginMessage(timedOutWaiter))).success, true);
    const timedOutRes = await leader.handleRemoteQuery(
      queryMessage(timedOutWaiter, INSERT_SQL, ['k-b', 'vb-timeout']),
    );
    assert.equal(timedOutRes.success, false);
    assert.equal(timedOutRes.failureCode, CODE.ALREADY_ACTIVE);
    assert.equal(
      (await send(leader, txMessage(PARTITION_SERVICE_OPERATION.ROLLBACK, timedOutWaiter))).success,
      true,
    );

    // Increase wait cap cleanly and verify multi-op session rebases & commits
    // both k-a and k-b after hold commits.
    leader.conflictSettleWaitMs = 3000;
    const multiSecondOp = leader.handleRemoteQuery(
      queryMessage(multi, UPDATE_SQL, ['vb-multi', 'k-b']),
    );
    await settleTicks(4);
    await commitParticipantTx(leader, proposed, hold);

    const res = await multiSecondOp;
    assert.equal(
      res.success,
      true,
      `multi-op session must rebase and overwrite k-b in-place: ${JSON.stringify(res)}`,
    );
    await commitParticipantTx(leader, proposed, multi);
    assert.equal(readRowValue(leader, 'k-a'), 'va');
    assert.equal(readRowValue(leader, 'k-b'), 'vb-multi');
  });
});
