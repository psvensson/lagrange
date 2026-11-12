import {allocateLifecycleFixture} from '../helpers/replica-lifecycle-fixture.js';
// The replica lifecycle owner admits one runtime turn at a time against its
// retirement: the work answers a named turn, and the owner holds the
// replica active for exactly as long as that turn - released at once when
// it settled, after its promise when it is pending. Retirement waits for it.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import Database from 'better-sqlite3';

import {
  RaftRsReplicaLifecycleOwner,
} from '../../src/raft/raft-rs-replica-lifecycle-owner.js';
import {pendingTurn, settledTurn} from '../../src/raft/raft-rs-turn-answer.js';

function ownerOver(db) {
  allocateLifecycleFixture({db, groupId: 'lifecycle-turn-group',
    peerId: '1', replicaIdentity: 'lifecycle-turn-replica'});
  return new RaftRsReplicaLifecycleOwner({db, groupId: 'lifecycle-turn-group',
    peerId: '1', replicaIdentity: 'lifecycle-turn-replica'});
}

test('a settled turn releases the replica in the same run', async () => {
  const db = new Database(':memory:');
  try {
    const owner = ownerOver(db);
    const answer = owner.execute(() => settledTurn('done'));
    assert.equal(answer.settled, true);
    assert.equal(answer.result, 'done');
    const retired = await owner.retire('test-retirement');
    assert.equal(retired.outcome, 'CORE_OK');
  } finally {
    db.close();
  }
});

test('a pending turn holds the replica until its promise settles', async () => {
  const db = new Database(':memory:');
  try {
    const owner = ownerOver(db);
    const {promise, resolve} = Promise.withResolvers();
    const answer = owner.execute(() => pendingTurn(promise));
    assert.equal(answer.settled, false);
    const order = [];
    const retiring = owner.retire('test-retirement').then(() => {
      order.push('retired');
    });
    await null;
    await null;
    assert.deepEqual(order, [], 'retirement waits for the pending turn');
    resolve('later');
    assert.equal(await answer.pending, 'later');
    await retiring;
    assert.deepEqual(order, ['retired']);
  } finally {
    db.close();
  }
});

test('a refused admission is a settled turn naming the refusal', async () => {
  const db = new Database(':memory:');
  try {
    const owner = ownerOver(db);
    await owner.retire('test-retirement');
    let ran = false;
    const answer = owner.execute(() => {
      ran = true;
      return settledTurn('never');
    });
    assert.equal(ran, false);
    assert.equal(answer.settled, true);
    assert.equal(answer.result.outcome, 'CORE_REFUSED');
  } finally {
    db.close();
  }
});
