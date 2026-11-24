/**
 * Regression witnesses for post-settle FIFO row-key conflict re-evaluation,
 * conflict-change wake handoff, per-row-key read-snapshot tracking, and
 * wait-for deadlock cycle breaking:
 * - Conflicting writers without prior overlapping/unscoped reads wait in FIFO
 *   order and acquire the row key in-place upon holder settlement.
 * - Multi-key waiters whose conflict shifts from key A to key B hand off the
 *   wake for A immediately to the next FIFO waiter on A.
 * - Writers track per-row-key readRowKeys + hasUnscopedRead so disjoint writes
 *   proceed across concurrent disjoint commits while overlapping/unscoped
 *   reads refuse with ALREADY_ACTIVE / PREPARE_REFUSED (40001).
 * - In-partition wait-for deadlock cycles break immediately without stalling
 *   for conflictSettleWaitMs.
 */
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {scaleByMachineFactor} from '../../scripts/test-machine-factor.js';
import {
  PARTICIPANT_TRANSACTION_FAILURE_CODE as CODE,
  PARTICIPANT_TRANSACTION_SESSION_PHASE as PHASE,
} from '../../src/partition/partition-participant-transaction-constants.js';
import {
  findParticipantSession,
} from '../../src/partition/partition-participant-transaction-session.js';
import {
  canDoomSessionOnLocalWaitCycle,
  enqueueBoundedRowKeyWaiter,
  hasRowKeyWaitForCycle,
  notifyFifoRowKeyWaiters,
  releaseRowKeySessionClaims,
} from '../../src/partition/partition-row-key-waiters.js';

const ROW_KEY_WAIT_CYCLE_FAILURE_REASON = 'ROW_KEY_WAIT_CYCLE_DETECTED';
const ROW_KEY_WAIT_CYCLE_SQLSTATE = '40001';
const ROW_KEY_WAIT_RECEIPT_STATE = Object.freeze({
  WAITING_ON_KEY: 'WAITING_ON_KEY',
  REEVALUATING: 'REEVALUATING',
  REPARKED: 'REPARKED',
  ACQUIRED: 'ACQUIRED',
  TERMINAL: 'TERMINAL',
});
import {PARTITION_SERVICE_OPERATION} from '../../src/partition/partition-service-constants.js';
import {
  DistributedTransactionCoordinator,
  TRANSACTION_STATUS,
} from '../../src/query/distributed/distributed-transaction-coordinator.js';
import {
  INSERT_SQL,
  TABLE,
  applyCommitted,
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

test('Finding 3: FIFO conflict-change wake handoff wakes compatible waiter W2 on A while multi-key W1 shifts wait to B', async () => {
  await onLeader(async (leader, proposed) => {
    setupRowKeyLeader(leader, 1500);

    const seedTx = identityOf('d0'.repeat(16), {sessionId: 'sess-f3-seed'});
    assert.equal((await send(leader, beginMessage(seedTx))).success, true);
    assert.equal((await leader.handleRemoteQuery(queryMessage(seedTx, INSERT_SQL, ['k-a', 'init-a']))).success, true);
    assert.equal((await leader.handleRemoteQuery(queryMessage(seedTx, INSERT_SQL, ['k-b', 'init-b']))).success, true);
    await commitParticipantTx(leader, proposed, seedTx);

    const h1 = identityOf('d1'.repeat(16), {sessionId: 'sess-f3-h1'});
    const h2 = identityOf('d2'.repeat(16), {sessionId: 'sess-f3-h2'});
    const w1 = identityOf('d3'.repeat(16), {sessionId: 'sess-f3-w1'});
    const w2 = identityOf('d4'.repeat(16), {sessionId: 'sess-f3-w2'});
    for (const tx of [h1, h2, w1, w2]) {
      assert.equal((await send(leader, beginMessage(tx))).success, true);
    }

    assert.equal((await leader.handleRemoteQuery(queryMessage(h1, UPDATE_SQL, ['h1-a', 'k-a']))).success, true);
    assert.equal((await leader.handleRemoteQuery(queryMessage(h2, UPDATE_SQL, ['h2-b', 'k-b']))).success, true);

    const multiUpdateSql = `UPDATE ${TABLE} SET value = ? WHERE id IN (?, ?)`;
    let w1Settled = false;
    const w1Promise = leader.handleRemoteQuery(queryMessage(w1, multiUpdateSql, ['w1-ab', 'k-a', 'k-b'])).then((res) => {
      w1Settled = true;
      return res;
    });
    await settleTicks(4);

    const w2Promise = leader.handleRemoteQuery(queryMessage(w2, UPDATE_SQL, ['w2-a', 'k-a']));
    await settleTicks(4);

    assert.equal(w1Settled, false, 'W1 must stay parked on k-a while H1 is active');

    // Settle H1 while H2 remains active on k-b.
    await commitParticipantTx(leader, proposed, h1);

    // W2 MUST wake and complete on k-a BEFORE H2 settles, while W1 remains parked on k-b.
    const w2Stage = await w2Promise;
    assert.equal(w2Stage.success, true, `W2 must acquire k-a immediately via handoff before H2 settles: ${JSON.stringify(w2Stage)}`);
    assert.equal(w1Settled, false, 'W1 must remain blocked on k-b while H2 is still active');
    await commitParticipantTx(leader, proposed, w2);
    assert.equal(readRowValue(leader, 'k-a'), 'w2-a');

    // Now settle H2 and verify W1 wakes on k-b, re-evaluates, and completes cleanly.
    await commitParticipantTx(leader, proposed, h2);
    const w1Stage = await w1Promise;
    assert.equal(w1Stage.success, true, `W1 must acquire (k-a, k-b) after H2 settles: ${JSON.stringify(w1Stage)}`);
    await commitParticipantTx(leader, proposed, w1);
    assert.equal(readRowValue(leader, 'k-a'), 'w1-ab');
    assert.equal(readRowValue(leader, 'k-b'), 'w1-ab');
  });
});

test('Finding 7: per-row-key readRowKeys allow disjoint concurrency while blocking overlapping or unscoped reads', async () => {
  await onLeader(async (leader, proposed) => {
    setupRowKeyLeader(leader, 3000);

    const seedTx = identityOf('e0'.repeat(16), {sessionId: 'sess-f7-seed'});
    assert.equal((await send(leader, beginMessage(seedTx))).success, true);
    for (const [id, val] of [['k-1', '10'], ['k-2', '20'], ['k-3', '30']]) {
      const ins = await leader.handleRemoteQuery(queryMessage(seedTx, INSERT_SQL, [id, val]));
      assert.equal(ins.success, true);
    }
    await commitParticipantTx(leader, proposed, seedTx);

    const tx1 = identityOf('e1'.repeat(16), {sessionId: 'sess-f7-no1'});
    const tx2 = identityOf('e2'.repeat(16), {sessionId: 'sess-f7-no2'});
    assert.equal((await send(leader, beginMessage(tx1))).success, true);
    assert.equal((await send(leader, beginMessage(tx2))).success, true);

    const tx1Read = await leader.handleRemoteQuery(queryMessage(tx1, SELECT_SQL, ['k-1']));
    assert.equal(tx1Read.success, true);
    assert.equal((await leader.handleRemoteQuery(queryMessage(tx1, UPDATE_SQL, ['11', 'k-1']))).success, true);
    assert.equal((await leader.handleRemoteQuery(queryMessage(tx2, SELECT_SQL, ['k-2']))).success, true);
    assert.equal((await leader.handleRemoteQuery(queryMessage(tx2, UPDATE_SQL, ['22', 'k-2']))).success, true);

    // Commit tx2 while tx1 continues with disjoint k-3 (TPC-C new_order pattern):
    await commitParticipantTx(leader, proposed, tx2);
    assert.equal((await leader.handleRemoteQuery(queryMessage(tx1, SELECT_SQL, ['k-3']))).success, true);
    assert.equal((await leader.handleRemoteQuery(queryMessage(tx1, UPDATE_SQL, ['33', 'k-3']))).success, true);
    await commitParticipantTx(leader, proposed, tx1);
    assert.equal(readRowValue(leader, 'k-1'), '11');
    assert.equal(readRowValue(leader, 'k-2'), '22');
    assert.equal(readRowValue(leader, 'k-3'), '33');

    // 2. Waiting after reading disjoint k-1 still advances across holder commit of k-2:
    const holdK2 = identityOf('e3'.repeat(16), {sessionId: 'sess-f7-holdk2'});
    const readK1WaitK2 = identityOf('e4'.repeat(16), {sessionId: 'sess-f7-rk1wk2'});
    assert.equal((await send(leader, beginMessage(holdK2))).success, true);
    assert.equal((await send(leader, beginMessage(readK1WaitK2))).success, true);
    assert.equal((await leader.handleRemoteQuery(queryMessage(holdK2, UPDATE_SQL, ['22-h', 'k-2']))).success, true);
    assert.equal((await leader.handleRemoteQuery(queryMessage(readK1WaitK2, SELECT_SQL, ['k-1']))).success, true);
    const waitK2Promise = leader.handleRemoteQuery(queryMessage(readK1WaitK2, UPDATE_SQL, ['22-w', 'k-2']));
    await settleTicks(4);
    await commitParticipantTx(leader, proposed, holdK2);
    const waitK2Res = await waitK2Promise;
    assert.equal(waitK2Res.success, true, `reader of disjoint k-1 must rebase past k-2 commit: ${JSON.stringify(waitK2Res)}`);
    await commitParticipantTx(leader, proposed, readK1WaitK2);
    assert.equal(readRowValue(leader, 'k-2'), '22-w');

    // 3. Overlapping read + disjoint write MUST refuse at PREPARE (prevents stale read / write skew):
    const skewReader = identityOf('e5'.repeat(16), {sessionId: 'sess-f7-skew-r'});
    const skewWriter = identityOf('e6'.repeat(16), {sessionId: 'sess-f7-skew-w'});
    assert.equal((await send(leader, beginMessage(skewReader))).success, true);
    assert.equal((await send(leader, beginMessage(skewWriter))).success, true);
    assert.equal((await leader.handleRemoteQuery(queryMessage(skewReader, SELECT_SQL, ['k-1']))).success, true);
    assert.equal((await leader.handleRemoteQuery(queryMessage(skewWriter, UPDATE_SQL, ['11-skew', 'k-1']))).success, true);
    await commitParticipantTx(leader, proposed, skewWriter);
    assert.equal((await leader.handleRemoteQuery(queryMessage(skewReader, UPDATE_SQL, ['22-skew', 'k-2']))).success, true);
    const skewPrep = await send(leader, prepareMessage(skewReader));
    assert.equal(skewPrep.success, false, 'PREPARE must refuse when readRowKeys overlap committed row');
    assert.equal(skewPrep.failureCode, CODE.PREPARE_REFUSED);
    assert.equal(skewPrep.refusalCause, 'conflict');

    // 4. Unscoped read (subquery/self-join/scan) MUST refuse at PREPARE and on waiting re-evaluation:
    const unscopedReader = identityOf('e7'.repeat(16), {sessionId: 'sess-f7-unscoped-r'});
    const disjointCommitter = identityOf('e8'.repeat(16), {sessionId: 'sess-f7-unscoped-w'});
    assert.equal((await send(leader, beginMessage(unscopedReader))).success, true);
    assert.equal((await send(leader, beginMessage(disjointCommitter))).success, true);
    const subqSelect = `SELECT (SELECT MAX(value) FROM ${TABLE}) AS m FROM ${TABLE} WHERE id = ?`;
    assert.equal((await leader.handleRemoteQuery(queryMessage(unscopedReader, subqSelect, ['k-1']))).success, true);
    assert.equal((await leader.handleRemoteQuery(queryMessage(disjointCommitter, UPDATE_SQL, ['33-u', 'k-3']))).success, true);
    await commitParticipantTx(leader, proposed, disjointCommitter);
    assert.equal((await leader.handleRemoteQuery(queryMessage(unscopedReader, UPDATE_SQL, ['22-u', 'k-2']))).success, true);
    const unscopedPrep = await send(leader, prepareMessage(unscopedReader));
    assert.equal(unscopedPrep.success, false, 'PREPARE must refuse when hasUnscopedRead is true');
    assert.equal(unscopedPrep.failureCode, CODE.PREPARE_REFUSED);
    assert.equal(unscopedPrep.refusalCause, 'conflict');

    const holdWaitU = identityOf('e9'.repeat(16), {sessionId: 'sess-f7-hold-u'});
    const joinWaiter = identityOf('ea'.repeat(16), {sessionId: 'sess-f7-join-w'});
    assert.equal((await send(leader, beginMessage(holdWaitU))).success, true);
    assert.equal((await send(leader, beginMessage(joinWaiter))).success, true);
    assert.equal((await leader.handleRemoteQuery(queryMessage(holdWaitU, UPDATE_SQL, ['33-h', 'k-3']))).success, true);
    const joinSql = `SELECT a.id FROM ${TABLE} a JOIN ${TABLE} b ON a.value = b.value WHERE a.id = ?`;
    assert.equal((await leader.handleRemoteQuery(queryMessage(joinWaiter, joinSql, ['k-1']))).success, true);
    const joinWaitPromise = leader.handleRemoteQuery(queryMessage(joinWaiter, UPDATE_SQL, ['33-j', 'k-3']));
    await settleTicks(4);
    await commitParticipantTx(leader, proposed, holdWaitU);
    const joinWaitRes = await joinWaitPromise;
    assert.equal(joinWaitRes.success, false, 'self-join SELECT must be treated as unscoped read and refuse');
    assert.equal(joinWaitRes.failureCode, CODE.ALREADY_ACTIVE);
    const rbJoin = await send(leader, txMessage(PARTITION_SERVICE_OPERATION.ROLLBACK, joinWaiter));
    assert.equal(rbJoin.success, true);

    // 5. Scoped multi-key SELECT (IN) allows disjoint k-1 commit while blocking overlapping k-3:
    const inReader = identityOf('eb'.repeat(16), {sessionId: 'sess-f7-in-r'});
    const inDisjoint = identityOf('ec'.repeat(16), {sessionId: 'sess-f7-in-d'});
    assert.equal((await send(leader, beginMessage(inReader))).success, true);
    assert.equal((await send(leader, beginMessage(inDisjoint))).success, true);
    const inSelect = `SELECT id, value FROM ${TABLE} WHERE id IN (?, ?)`;
    assert.equal((await leader.handleRemoteQuery(queryMessage(inReader, inSelect, ['k-2', 'k-3']))).success, true);
    assert.equal((await leader.handleRemoteQuery(queryMessage(inDisjoint, UPDATE_SQL, ['11-in', 'k-1']))).success, true);
    await commitParticipantTx(leader, proposed, inDisjoint);
    assert.equal((await leader.handleRemoteQuery(queryMessage(inReader, UPDATE_SQL, ['33-in', 'k-3']))).success, true);
    await commitParticipantTx(leader, proposed, inReader);
    assert.equal(readRowValue(leader, 'k-3'), '33-in');
  });
});

function createCoordinatorForLeader(leader, proposed, rollbackEvents = [], rollbackGate = null) {
  leader.controllablePort.setProposeHandler(async (entry) => {
    proposed.push({...entry});
    applyCommitted(leader, entry);
  });
  return new DistributedTransactionCoordinator({
    beginParticipant: async (sessionId, _partitionId, identity) =>
      send(leader, beginMessage({...identity, sessionId})),
    prepareParticipant: async (sessionId, _partitionId, identity) =>
      send(leader, prepareMessage({...identity, sessionId})),
    commitParticipant: async (sessionId, _partitionId, req) =>
      send(leader, txMessage(PARTITION_SERVICE_OPERATION.COMMIT, {...req, sessionId}, req)),
    rollbackParticipant: async (sessionId, partitionId, req) => {
      if (rollbackGate) {
        rollbackGate.onReached();
        await rollbackGate.promise;
      }
      rollbackEvents.push({sessionId, partitionId, transactionId: req.transactionId});
      const msg = txMessage(PARTITION_SERVICE_OPERATION.ROLLBACK, {...req, sessionId}, req);
      return send(leader, msg);
    },
  });
}

const rollbackParticipantTx = (leader, tx) =>
  send(leader, txMessage(PARTITION_SERVICE_OPERATION.ROLLBACK, tx));

function coordinatorQueryMessage(sessionId, identity, sql, params) {
  return queryMessage(identityOf(identity.transactionId, {...identity, sessionId}), sql, params);
}

async function runCoordinatorWrite(coordinator, leader, sessionId, opId, sql, params) {
  return coordinator.executeWriteStatement(
    sessionId,
    {operationId: opId, partitionIds: [leader.partitionId]},
    (identity) =>
      leader.handleRemoteQuery(coordinatorQueryMessage(sessionId, identity, sql, params)),
  );
}

test('Finding 7 & Review §5: AB-BA wait-for cycle dooms ACTIVE victim and releases claims so survivor commits BEFORE any rollback on victim', async () => {
  await onLeader(async (leader, proposed) => {
    setupRowKeyLeader(leader, 15000);
    const seedTx = identityOf('f0'.repeat(16), {sessionId: 'sess-dl-seed'});
    assert.equal((await send(leader, beginMessage(seedTx))).success, true);
    assert.equal((await leader.handleRemoteQuery(queryMessage(seedTx, INSERT_SQL, ['k-1', 'v1']))).success, true);
    assert.equal((await leader.handleRemoteQuery(queryMessage(seedTx, INSERT_SQL, ['k-2', 'v2']))).success, true);
    await commitParticipantTx(leader, proposed, seedTx);

    const tx1 = identityOf('f1'.repeat(16), {sessionId: 'sess-dl-1'});
    const tx2 = identityOf('f2'.repeat(16), {sessionId: 'sess-dl-2'});
    assert.equal((await send(leader, beginMessage(tx1))).success, true);
    assert.equal((await send(leader, beginMessage(tx2))).success, true);
    assert.equal((await leader.handleRemoteQuery(queryMessage(tx1, UPDATE_SQL, ['tx1-1', 'k-1']))).success, true);
    assert.equal((await leader.handleRemoteQuery(queryMessage(tx2, UPDATE_SQL, ['tx2-2', 'k-2']))).success, true);

    const tx1Second = leader.handleRemoteQuery(queryMessage(tx1, UPDATE_SQL, ['tx1-2', 'k-2']));
    await settleTicks(4);

    const startedMs = Date.now();
    const tx2Second = await leader.handleRemoteQuery(queryMessage(tx2, UPDATE_SQL, ['tx2-1', 'k-1']));
    const elapsedMs = Date.now() - startedMs;

    assert.equal(tx2Second.success, false);
    assert.equal(tx2Second.failureCode, CODE.ALREADY_ACTIVE);
    assert.equal(tx2Second.failureReason, ROW_KEY_WAIT_CYCLE_FAILURE_REASON);
    assert.equal(tx2Second.deadlockDetected, true);
    assert.equal(tx2Second.sqlState, ROW_KEY_WAIT_CYCLE_SQLSTATE);
    assert.equal(tx2Second.conflict, true);
    assert.equal(tx2Second.retryable, true);
    const cycleBreakBudgetMs = scaleByMachineFactor(50);
    assert.equal(
      elapsedMs < cycleBreakBudgetMs,
      true,
      `cycle must break in <${cycleBreakBudgetMs}ms (got ${elapsedMs}ms)`,
    );

    const doomedVictim = findParticipantSession(leader, tx2);
    assert.equal(doomedVictim?.phase, PHASE.DOOMED);
    assert.equal(doomedVictim?.touchedRowKeys?.size, 0);
    assert.equal(doomedVictim?.lastWaitReceipt?.state, ROW_KEY_WAIT_RECEIPT_STATE.TERMINAL);
    assert.equal(doomedVictim?.lastWaitReceipt?.terminalReason, ROW_KEY_WAIT_CYCLE_FAILURE_REASON);

    // Crucial invariant: T1 acquires k-2 and commits BEFORE any rollback is called on T2!
    const tx1Res = await tx1Second;
    assert.equal(tx1Res.success, true);
    await commitParticipantTx(leader, proposed, tx1);
    assert.equal(readRowValue(leader, 'k-1'), 'tx1-1');
    assert.equal(readRowValue(leader, 'k-2'), 'tx1-2');
    assert.equal((await rollbackParticipantTx(leader, tx2)).success, true);
  });
});

test('Review §5: coordinator drives canonical rollbackTransaction on cycle victim while preserving transaction identity and participant manifest', async () => {
  await onLeader(async (leader, proposed) => {
    setupRowKeyLeader(leader, 15000);
    const rollbackEvents = [];
    const rollbackReached = Promise.withResolvers();
    const rollbackRelease = Promise.withResolvers();
    const coordinator = createCoordinatorForLeader(leader, proposed, rollbackEvents, {
      onReached: () => rollbackReached.resolve(),
      promise: rollbackRelease.promise,
    });

    assert.equal((await coordinator.begin('sess-coord-seed')).success, true);
    for (const [id, val] of [['k-a', 'init-a'], ['k-b', 'init-b']]) {
      const ins = await runCoordinatorWrite(
        coordinator, leader, 'sess-coord-seed', `op-seed-${id}`, INSERT_SQL, [id, val]);
      assert.equal(ins.success, true);
    }
    assert.equal((await coordinator.commit('sess-coord-seed')).success, true);

    const t1Begin = await coordinator.begin('sess-coord-1');
    const t2Begin = await coordinator.begin('sess-coord-2');
    assert.equal(t1Begin.success, true);
    assert.equal(t2Begin.success, true);
    assert.equal((await runCoordinatorWrite(
      coordinator, leader, 'sess-coord-1', 'op-t1-a', UPDATE_SQL, ['t1-a', 'k-a'])).success, true);
    assert.equal((await runCoordinatorWrite(
      coordinator, leader, 'sess-coord-2', 'op-t2-b', UPDATE_SQL, ['t2-b', 'k-b'])).success, true);

    const t1WriteBPromise = runCoordinatorWrite(
      coordinator, leader, 'sess-coord-1', 'op-t1-b', UPDATE_SQL, ['t1-b', 'k-b']);
    await settleTicks(4);

    // Hold T2's coordinator ROLLBACK RPC in flight until AFTER T1 acquires k-b and commits!
    const t2WriteAPromise = runCoordinatorWrite(
      coordinator, leader, 'sess-coord-2', 'op-t2-a', UPDATE_SQL, ['t2-a', 'k-a']);
    await rollbackReached.promise;
    assert.equal(rollbackEvents.length, 0);

    // T1 acquires k-b and commits BEFORE T2's rollback RPC reaches the participant:
    assert.equal((await t1WriteBPromise).success, true);
    assert.equal((await coordinator.commit('sess-coord-1')).success, true);
    assert.equal(readRowValue(leader, 'k-a'), 't1-a');
    assert.equal(readRowValue(leader, 'k-b'), 't1-b');
    assert.equal(rollbackEvents.length, 0);

    // Release T2's in-flight coordinator rollback RPC and verify clean settlement:
    rollbackRelease.resolve();
    const t2WriteA = await t2WriteAPromise;
    assert.equal(t2WriteA.success, false);
    assert.equal(t2WriteA.failureCode, CODE.ALREADY_ACTIVE);
    assert.equal(t2WriteA.failureReason, ROW_KEY_WAIT_CYCLE_FAILURE_REASON);
    assert.equal(t2WriteA.deadlockDetected, true);
    assert.equal(t2WriteA.transactionId, t2Begin.transactionId);
    assert.equal(t2WriteA.transactionEpoch, t2Begin.transactionEpoch);
    assert.deepEqual(t2WriteA.participants, [leader.partitionId]);
    assert.equal(t2WriteA.rollback?.success, true);
    assert.equal(t2WriteA.rollback?.transactionId, t2Begin.transactionId);
    assert.deepEqual(t2WriteA.rollback?.participants, [leader.partitionId]);
    assert.equal(rollbackEvents.length, 1);
    assert.equal(rollbackEvents[0].transactionId, t2Begin.transactionId);

    const settledRollback = await coordinator.rollbackTransaction('sess-coord-2', {
      expectedTransactionId: t2Begin.transactionId,
    });
    assert.equal(settledRollback.success, true);
    assert.equal(settledRollback.transactionId, t2Begin.transactionId);
    assert.deepEqual(settledRollback.participants, [leader.partitionId]);
    assert.equal(coordinator.getTransaction('sess-coord-2'), null);
    assert.equal(t2WriteA.participantDetails?.[0]?.status, TRANSACTION_STATUS.ACTIVE);

    // Witness (d): failed victim rollback is NOT cached in settledCycleRollbacksBySession;
    // subsequent rollbackTransaction re-drives runRollbackProtocol on the live tx and succeeds.
    let failNextRollback = true;
    const retryCoordinator = new DistributedTransactionCoordinator({
      participantRetryMaxRetries: 0,
      beginParticipant: async (sId, _pId, id) =>
        send(leader, beginMessage({...id, sessionId: sId})),
      rollbackParticipant: async (sId, _pId, req) => {
        if (failNextRollback) {
          failNextRollback = false;
          throw new Error('simulated transient rollback delivery failure');
        }
        const msg = txMessage(PARTITION_SERVICE_OPERATION.ROLLBACK, {...req, sessionId: sId}, req);
        return send(leader, msg);
      },
    });
    const t3Begin = await retryCoordinator.begin('sess-coord-retry');
    assert.equal(t3Begin.success, true);
    const failedCycleWrite = await retryCoordinator.executeWriteStatement(
      'sess-coord-retry',
      {operationId: 'op-t3-cycle', partitionIds: [leader.partitionId]},
      async () => ({
        success: false,
        failureCode: CODE.ALREADY_ACTIVE,
        failureReason: ROW_KEY_WAIT_CYCLE_FAILURE_REASON,
        deadlockDetected: true,
      }),
    );
    assert.equal(failedCycleWrite.rollback?.success, false);
    assert.notEqual(retryCoordinator.getTransaction('sess-coord-retry'), null);
    const redrivenRollback = await retryCoordinator.rollbackTransaction('sess-coord-retry', {
      expectedTransactionId: t3Begin.transactionId,
    });
    assert.equal(redrivenRollback.success, true);
    assert.equal(retryCoordinator.getTransaction('sess-coord-retry'), null);
  });
});

test('Review §5: wait-receipt budget and epoch binding preserves originalDeadlineMs across A -> B re-park, ignores stale epoch timer, and hands off A to W2', async () => {
  await onLeader(async (leader, proposed) => {
    setupRowKeyLeader(leader, 120);
    const seedTx = identityOf('d5'.repeat(16), {sessionId: 'sess-receipt-seed'});
    assert.equal((await send(leader, beginMessage(seedTx))).success, true);
    assert.equal((await leader.handleRemoteQuery(queryMessage(seedTx, INSERT_SQL, ['k-a', 'init-a']))).success, true);
    assert.equal((await leader.handleRemoteQuery(queryMessage(seedTx, INSERT_SQL, ['k-b', 'init-b']))).success, true);
    await commitParticipantTx(leader, proposed, seedTx);

    const h1 = identityOf('d6'.repeat(16), {sessionId: 'sess-receipt-h1'});
    const h2 = identityOf('d7'.repeat(16), {sessionId: 'sess-receipt-h2'});
    const w1 = identityOf('d8'.repeat(16), {sessionId: 'sess-receipt-w1', transactionEpoch: 10});
    const w2 = identityOf('d9'.repeat(16), {sessionId: 'sess-receipt-w2', transactionEpoch: 11});
    for (const tx of [h1, h2, w1, w2]) {
      assert.equal((await send(leader, beginMessage(tx))).success, true);
    }

    assert.equal((await leader.handleRemoteQuery(queryMessage(h1, UPDATE_SQL, ['h1-a', 'k-a']))).success, true);
    assert.equal((await leader.handleRemoteQuery(queryMessage(h2, UPDATE_SQL, ['h2-b', 'k-b']))).success, true);

    const multiUpdateSql = `UPDATE ${TABLE} SET value = ? WHERE id IN (?, ?)`;
    const w1StartMs = Date.now();
    const w1Promise = leader.handleRemoteQuery(
      queryMessage(w1, multiUpdateSql, ['w1-ab', 'k-a', 'k-b']),
    );
    await settleTicks(4);

    const w1Session = findParticipantSession(leader, w1);
    const receiptOnA = w1Session.lastWaitReceipt;
    assert.equal(receiptOnA.state, ROW_KEY_WAIT_RECEIPT_STATE.WAITING_ON_KEY);
    assert.equal(receiptOnA.sessionId, 'sess-receipt-w1');
    assert.equal(receiptOnA.sessionEpoch, 10);

    const w2Promise = leader.handleRemoteQuery(queryMessage(w2, UPDATE_SQL, ['w2-a', 'k-a']));
    await settleTicks(4);

    // Burn ~65ms of W1's 120ms budget on k-a, raise conflictSettleWaitMs to 5000ms, settle H1:
    await new Promise((resolve) => setTimeout(resolve, 65));
    leader.conflictSettleWaitMs = 5000;
    await commitParticipantTx(leader, proposed, h1);

    // W2 on k-a wakes via completeRowKeyWaitReevaluation handoff and finishes BEFORE H2 settles:
    assert.equal((await w2Promise).success, true);
    await commitParticipantTx(leader, proposed, w2);
    assert.equal(readRowValue(leader, 'k-a'), 'w2-a');

    const receiptOnB = w1Session.lastWaitReceipt;
    assert.equal(receiptOnA.state, ROW_KEY_WAIT_RECEIPT_STATE.REPARKED);
    assert.equal(receiptOnB.originalDeadlineMs, receiptOnA.originalDeadlineMs);

    // While H2 holds k-b, W1 expires at its original ~120ms deadline (never renewed to 5000ms!):
    const w1Res = await w1Promise;
    const w1ElapsedMs = Date.now() - w1StartMs;
    assert.equal(w1Res.success, false);
    assert.equal(w1Res.failureCode, CODE.ALREADY_ACTIVE);
    assert.equal(receiptOnA.state, ROW_KEY_WAIT_RECEIPT_STATE.REPARKED);
    assert.equal(receiptOnB.state, ROW_KEY_WAIT_RECEIPT_STATE.TERMINAL);
    assert.equal(receiptOnB.terminalReason, 'expired');
    const deadlineBudgetMs = scaleByMachineFactor(400);
    assert.equal(
      w1ElapsedMs < deadlineBudgetMs,
      true,
      `W1 must honor original 120ms deadline (<${deadlineBudgetMs}ms, got ${w1ElapsedMs}ms)`,
    );
    assert.equal((await rollbackParticipantTx(leader, w1)).success, true);

    // Witness (a): live stale-epoch timeout on an UNSETTLED WAITING_ON_KEY receipt:
    leader.conflictSettleWaitMs = 3000;
    const oldEpochTx = identityOf('da'.repeat(16), {sessionId: 'sess-epoch-bind', transactionEpoch: 21});
    assert.equal((await send(leader, beginMessage(oldEpochTx))).success, true);
    const oldWaitPromise = leader.handleRemoteQuery(queryMessage(oldEpochTx, UPDATE_SQL, ['old-b', 'k-b']));
    await settleTicks(4);
    const oldSession = findParticipantSession(leader, oldEpochTx);
    const oldReceipt = oldSession.lastWaitReceipt;
    assert.equal(oldReceipt.state, ROW_KEY_WAIT_RECEIPT_STATE.WAITING_ON_KEY);

    const newEpochTx = identityOf('db'.repeat(16), {sessionId: 'sess-epoch-bind', transactionEpoch: 22});
    assert.equal((await send(leader, beginMessage(newEpochTx))).success, true);
    const newWaitPromise = leader.handleRemoteQuery(queryMessage(newEpochTx, UPDATE_SQL, ['new-b', 'k-b']));
    await settleTicks(4);
    const newSession = findParticipantSession(leader, newEpochTx);
    const newReceipt = newSession.lastWaitReceipt;
    assert.equal(newReceipt.state, ROW_KEY_WAIT_RECEIPT_STATE.WAITING_ON_KEY);

    // Advance oldSession's epoch while oldReceipt is STILL WAITING_ON_KEY, then fire oldReceipt's timeout:
    oldSession.identity = Object.freeze({...oldSession.identity, transactionEpoch: 99});
    assert.equal(oldReceipt.triggerTimeout(), true);
    assert.equal(oldReceipt.state, ROW_KEY_WAIT_RECEIPT_STATE.TERMINAL);
    assert.equal(oldReceipt.terminalReason, 'stale_epoch_timeout');
    assert.equal((await oldWaitPromise).success, false);
    assert.equal(oldReceipt.terminalReason, 'stale_epoch_timeout');
    assert.equal(newSession.phase, PHASE.ACTIVE);
    assert.equal(newReceipt.state, ROW_KEY_WAIT_RECEIPT_STATE.WAITING_ON_KEY);
    oldSession.identity = Object.freeze({...oldSession.identity, transactionEpoch: 21});
    assert.equal((await rollbackParticipantTx(leader, oldEpochTx)).success, true);

    // Witness (b) & (c): releaseRowKeySessionClaims and notifyFifoRowKeyWaiters settle
    // WAITING_ON_KEY waiters promptly with settled: false and state: TERMINAL.
    const claimSession = {identity: {sessionId: 's-claim', transactionEpoch: 1}, phase: PHASE.ACTIVE};
    const claimWaitPromise = enqueueBoundedRowKeyWaiter(leader, claimSession, 'k-b', 3000);
    releaseRowKeySessionClaims(leader, claimSession);
    const claimWaitOut = await claimWaitPromise;
    assert.equal(claimWaitOut.settled, false);
    assert.equal(claimWaitOut.receipt.state, ROW_KEY_WAIT_RECEIPT_STATE.TERMINAL);
    assert.equal(claimWaitOut.receipt.terminalReason, 'claims_released');

    const closedSession = {identity: {sessionId: 's-closed', transactionEpoch: 1}, phase: PHASE.ACTIVE};
    const closedWaitPromise = enqueueBoundedRowKeyWaiter(leader, closedSession, 'k-b', 3000);
    closedSession.phase = PHASE.DOOMED;
    notifyFifoRowKeyWaiters(leader, leader.rowKeyWaiterPolicy);
    const closedWaitOut = await closedWaitPromise;
    assert.equal(closedWaitOut.settled, false);
    assert.equal(closedWaitOut.receipt.state, ROW_KEY_WAIT_RECEIPT_STATE.TERMINAL);
    assert.equal(closedWaitOut.receipt.terminalReason, 'session_closed');

    await commitParticipantTx(leader, proposed, h2);
    assert.equal((await newWaitPromise).success, true);
    assert.equal(newReceipt.state, ROW_KEY_WAIT_RECEIPT_STATE.ACQUIRED);
    await commitParticipantTx(leader, proposed, newEpochTx);
    assert.equal(readRowValue(leader, 'k-b'), 'new-b');
  });
});

test('Review §5: safety guard prevents PREPARING, PREPARED, or COMMITTED sessions from ever being doomed by local cycle detection', async () => {
  await onLeader(async (leader, proposed) => {
    setupRowKeyLeader(leader, 3000);
    const seedTx = identityOf('f5'.repeat(16), {sessionId: 'sess-guard-seed'});
    assert.equal((await send(leader, beginMessage(seedTx))).success, true);
    assert.equal((await leader.handleRemoteQuery(queryMessage(seedTx, INSERT_SQL, ['k-1', 'g1']))).success, true);
    assert.equal((await leader.handleRemoteQuery(queryMessage(seedTx, INSERT_SQL, ['k-2', 'g2']))).success, true);
    await commitParticipantTx(leader, proposed, seedTx);

    const tx1 = identityOf('f6'.repeat(16), {sessionId: 'sess-guard-1'});
    const tx2 = identityOf('f7'.repeat(16), {sessionId: 'sess-guard-2'});
    assert.equal((await send(leader, beginMessage(tx1))).success, true);
    assert.equal((await send(leader, beginMessage(tx2))).success, true);
    assert.equal((await leader.handleRemoteQuery(queryMessage(tx1, UPDATE_SQL, ['g1-tx1', 'k-1']))).success, true);
    assert.equal((await leader.handleRemoteQuery(queryMessage(tx2, UPDATE_SQL, ['g2-tx2', 'k-2']))).success, true);

    const tx1WaitPromise = leader.handleRemoteQuery(
      queryMessage(tx1, UPDATE_SQL, ['g2-tx1', 'k-2']),
    );
    await settleTicks(4);

    const session1 = findParticipantSession(leader, tx1);
    const session2 = findParticipantSession(leader, tx2);
    const awaitedRowKeyK1 = session1.touchedRowKeys.values().next().value;
    const cyclePolicy = {
      isSessionClosed: (candidate) => candidate.phase === PHASE.DOOMED,
      listHolderSessions: (_svc, candidate, rk) =>
        candidate !== session1 && session1.touchedRowKeys.has(rk) ? [session1] :
          (candidate !== session2 && session2.touchedRowKeys.has(rk) ? [session2] : []),
    };

    for (const protectedState of ['PREPARING', 'PREPARED', 'COMMITTED']) {
      session2.phase = protectedState;
      session2.status = protectedState;
      assert.equal(canDoomSessionOnLocalWaitCycle(session2), false);
      assert.equal(hasRowKeyWaitForCycle(leader, session2, awaitedRowKeyK1, cyclePolicy), true);
      assert.equal(session2.phase, protectedState);
      assert.equal(session2.deadlockDetected, undefined);
      assert.equal(session2.touchedRowKeys.size, 1);
    }

    session2.phase = PHASE.ACTIVE;
    delete session2.status;
    session2.sealed = {type: 'PARTICIPANT_PREPARE'};
    assert.equal(canDoomSessionOnLocalWaitCycle(session2), false);
    assert.equal(hasRowKeyWaitForCycle(leader, session2, awaitedRowKeyK1, cyclePolicy), true);
    assert.equal(session2.phase, PHASE.ACTIVE);
    assert.equal(session2.touchedRowKeys.size, 1);
    session2.sealed = null;

    await commitParticipantTx(leader, proposed, tx2);
    assert.equal((await tx1WaitPromise).success, true);
    await commitParticipantTx(leader, proposed, tx1);
    assert.equal(readRowValue(leader, 'k-1'), 'g1-tx1');
    assert.equal(readRowValue(leader, 'k-2'), 'g2-tx1');
  });
});

test('Opportunity 4: session wait receipt history is bounded to at most 8 retained receipts across 32 sequential waits', async () => {
  await onLeader(async (leader) => {
    setupRowKeyLeader(leader, 3000);
    const waiterSession = {
      identity: {
        sessionId: 'sess-opp4-bounded-ring',
        participantId: 'p-opp4',
        transactionId: 'f8'.repeat(16),
        transactionEpoch: 1,
      },
      phase: PHASE.ACTIVE,
    };

    const allReceipts = [];
    for (let step = 0; step < 32; step += 1) {
      const rowKey = `k-seq-${step}`;
      const waitPromise = enqueueBoundedRowKeyWaiter(leader, waiterSession, rowKey, 3000);
      assert.notEqual(waiterSession.activeWaitReceipt, null);
      assert.equal(waiterSession.activeWaitReceipt, waiterSession.lastWaitReceipt);
      assert.equal(
        waiterSession.activeWaitReceipt.state,
        ROW_KEY_WAIT_RECEIPT_STATE.WAITING_ON_KEY,
      );
      allReceipts.push(waiterSession.lastWaitReceipt);
      waiterSession.lastWaitReceipt.settleTerminal('claims_released');
      const out = await waitPromise;
      assert.equal(out.settled, false);
      assert.equal(out.receipt.state, ROW_KEY_WAIT_RECEIPT_STATE.TERMINAL);
      assert.equal(waiterSession.activeWaitReceipt, null);
      assert.equal(
        waiterSession.waitReceipts.length <= 8,
        true,
        `waitReceipts length (${waiterSession.waitReceipts.length}) must not exceed 8 at step ${step}`,
      );
      assert.equal(waiterSession.waitReceiptCount, step + 1);
    }

    assert.equal(waiterSession.waitReceiptCount, 32);
    assert.equal(waiterSession.waitReceipts.length, 8);
    assert.equal(waiterSession.lastWaitReceipt, allReceipts[31]);
    assert.deepEqual(waiterSession.waitReceipts, allReceipts.slice(24, 32));
  });
});
