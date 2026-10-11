// Release admission closes new work; durable apply, reads and settlement
// remain available. Exercise the public partition paths, not pause answers.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {raiseParticipantCutoverPause} from
  '../../src/partition/partition-participant-transaction-pause.js';
import {PARTICIPANT_TRANSACTION_FAILURE_CODE as CODE} from
  '../../src/partition/partition-participant-transaction-constants.js';
import {
  INSERT_SQL, ROW, TABLE, applyCommitted, beginMessage, clearFixtureSingletons,
  identityOf, ordinaryWriteOf, queryMessage, resetFixtureSingletons,
  send, shutdownAll, startLeader,
} from '../test-helpers/participant-transaction-fixture.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

async function withLeader(measure, extra) {
  const {leader, proposed} = await startLeader(extra);
  try {
    await measure(leader, proposed);
  } finally {
    await shutdownAll(leader);
  }
}

test('release pause refuses participant BEGIN and direct mutation while reads remain', () =>
  withLeader(async (leader, proposed) => {
    raiseParticipantCutoverPause(leader);
    const begun = await send(leader, beginMessage(identityOf('paused-begin')));
    const local = await leader.executeLocalQuery(INSERT_SQL, [ROW.id, ROW.value]);
    const read = await leader.executeLocalQuery(`SELECT * FROM ${TABLE}`);
    assert.equal(begun.failureCode, CODE.CUTOVER_PAUSED);
    assert.equal(begun.deferRetry, true);
    assert.equal(local.success, false);
    assert.equal(read.success, true);
    assert.deepEqual(read.rows, []);
    assert.deepEqual(proposed, []);
  }));

test('origin permanently retires direct local mutation after release admission opens', () =>
  withLeader(async (leader) => {
    const answer = await leader.executeLocalQuery(INSERT_SQL, [ROW.id, ROW.value]);
    assert.equal(answer.failureCode, CODE.LEGACY_SESSION_FENCED);
    assert.equal((await leader.executeLocalQuery(`SELECT * FROM ${TABLE}`)).count, 0);
  }));

test('release pause preserves admitted participant statements and committed apply', () =>
  withLeader(async (leader) => {
    const tx = identityOf('admitted-before-pause');
    assert.equal((await send(leader, beginMessage(tx))).success, true);
    raiseParticipantCutoverPause(leader);
    assert.equal((await send(leader, queryMessage(tx, INSERT_SQL,
      [ROW.id, ROW.value]))).success, true);
    assert.equal(applyCommitted(leader, ordinaryWriteOf('accepted-write',
      {id: 'committed', value: 'kept'})), null);
    const read = await leader.executeLocalQuery(`SELECT id FROM ${TABLE}`);
    assert.deepEqual(read.rows, [{id: 'committed'}]);
  }));
