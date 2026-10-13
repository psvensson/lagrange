// Release admission closes new work; durable apply, reads and settlement
// remain available. Exercise the public partition paths, not pause answers.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import Database from 'better-sqlite3';
import {participantConnectionStampOf} from
  '../../src/partition/partition-participant-transaction-connection.js';
import {raiseParticipantCutoverPause} from
  '../../src/partition/partition-participant-transaction-pause.js';
import {PARTICIPANT_TRANSACTION_FAILURE_CODE as CODE} from
  '../../src/partition/partition-participant-transaction-constants.js';
import {
  INSERT_SQL, ROW, TABLE, applyCommitted, beginMessage, clearFixtureSingletons,
  identityOf, ordinaryWriteOf, originOf, queryMessage, REPLICAS,
  resetFixtureSingletons, send, shutdownAll, startLeader, startReplica,
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
    assert.equal(answer.failureCode, CODE.UNREPLICATED_LOCAL_MUTATION);
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

test('release admission treats unstamped connections as unsafe and lifecycle ' +
  'opens as distinct clean generations without granting admission', async () => {
  const unstamped = new Database(':memory:');
  const {leader, proposed} = await startLeader({generationOrigin: false});
  const follower = await startReplica(REPLICAS[1], {generationOrigin: false});
  try {
    assert.deepEqual(participantConnectionStampOf(unstamped),
      {generation: null, servedLegacy: true},
      'a connection outside the lifecycle open hook has unknown unsafe history');
    const leaderStamp = participantConnectionStampOf(leader.db);
    const followerStamp = participantConnectionStampOf(follower.db);
    assert.equal(leaderStamp.servedLegacy, false);
    assert.equal(followerStamp.servedLegacy, false);
    assert.ok(Number.isSafeInteger(leaderStamp.generation) &&
      leaderStamp.generation > 0);
    assert.ok(followerStamp.generation > leaderStamp.generation,
      'each lifecycle open receives a newer clean connection generation');

    const begun = await send(leader, beginMessage(identityOf('closed-clean')));
    assert.equal(begun.failureCode, CODE.CUTOVER_PAUSED,
      'a clean connection alone cannot grant participant admission');
    assert.equal(originOf(leader), null);
    assert.deepEqual(proposed, []);
  } finally {
    unstamped.close();
    await shutdownAll(leader, follower);
  }
});
