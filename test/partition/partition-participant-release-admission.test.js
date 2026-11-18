// Release admission closes new work; durable apply, reads and settlement
// remain available. Exercise the public partition paths, not pause answers.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import Database from 'better-sqlite3';
import {participantConnectionStampOf} from
  '../../src/partition/partition-participant-transaction-connection.js';
import {
  participantCutoverPauseOf,
  raiseParticipantCutoverPause,
} from '../../src/partition/partition-participant-transaction-pause.js';
import {
  canAdvanceRowKeySessionGeneration,
  findParticipantSession,
} from '../../src/partition/partition-participant-transaction-session.js';
import {readPartitionWriteGeneration} from
  '../../src/partition/partition-participant-transaction-store.js';
import {PARTICIPANT_TRANSACTION_FAILURE_CODE as CODE} from
  '../../src/partition/partition-participant-transaction-constants.js';
import {
  PARTICIPANT_CUTOVER_OUTCOME as OUTCOME,
  PARTICIPANT_RELEASE_ACTION as RELEASE_ACTION,
  PARTICIPANT_RELEASE_RESULT_FIELD,
  PARTICIPANT_RELEASE_TYPE,
} from '../../src/partition/partition-participant-transaction-cutover-constants.js';
import {deliveryAnswerOf} from '../../src/transport/transport-semantic-outcome.js';
import {
  INSERT_SQL, ROW, TABLE, applyCommitted, awaitProposal, beginMessage,
  clearFixtureSingletons, commitMessage, identityOf, ordinaryWriteOf, originOf,
  prepareMessage, queryMessage, REPLICAS, resetFixtureSingletons, send,
  settleTicks, shutdownAll, startLeader, startReplica, track,
} from '../test-helpers/participant-transaction-fixture.js';
import {
  CONTROL_PARTITION,
  withParticipantReleaseProtocol,
} from '../test-helpers/participant-release-protocol-fixture.js';

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

test('Deadlock A: release pause allows already-admitted session PREPARE to drain', () =>
  withLeader(async (leader, proposed) => {
    const tx = identityOf('a'.repeat(32));
    assert.equal((await send(leader, beginMessage(tx))).success, true);
    assert.equal((await send(leader, queryMessage(tx, INSERT_SQL,
      [ROW.id, ROW.value]))).success, true);
    raiseParticipantCutoverPause(leader);
    const refusedBegin = await send(leader, beginMessage(identityOf('b'.repeat(32))));
    assert.equal(refusedBegin.failureCode, CODE.CUTOVER_PAUSED);
    const prepare = track(send(leader, prepareMessage(tx)));
    const command = await awaitProposal(proposed,
      (entry) => entry.transactionId === tx.transactionId);
    assert.ok(command);
    assert.equal(applyCommitted(leader, command), null);
    await settleTicks();
    assert.equal(prepare.value?.success, true, JSON.stringify(prepare.value));
    assert.equal(prepare.value?.state, 'PREPARED');
    const commit = track(send(leader, commitMessage(tx, command.preparedDigest)));
    const decision = await awaitProposal(proposed, (entry) =>
      entry.transactionId === tx.transactionId && entry.decision === 'COMMIT');
    assert.equal(applyCommitted(leader, decision), null);
    await settleTicks();
    assert.equal(commit.value?.success, true);
  }));

test('disjoint row-key session advances generation across concurrent committed writes', () =>
  withLeader(async (leader, proposed) => {
    leader.concurrencyGranularity = 'row-key';
    const txRead = identityOf('1'.repeat(32));
    const txWrite = identityOf('2'.repeat(32));
    assert.equal((await send(leader, beginMessage(txRead))).success, true);
    assert.equal((await send(leader, queryMessage(txRead, INSERT_SQL,
      ['row-disjoint', 'disjoint-value']))).success, true);
    assert.equal((await send(leader, beginMessage(txWrite))).success, true);
    assert.equal((await send(leader, queryMessage(txWrite, INSERT_SQL,
      [ROW.id, ROW.value]))).success, true);
    const wPrep = track(send(leader, prepareMessage(txWrite)));
    const wCmd = await awaitProposal(proposed,
      (entry) => entry.transactionId === txWrite.transactionId);
    assert.equal(applyCommitted(leader, wCmd), null);
    await settleTicks();
    assert.equal(wPrep.value?.success, true);
    const wCommit = track(send(leader, commitMessage(txWrite, wCmd.preparedDigest)));
    const wDecision = await awaitProposal(proposed, (entry) =>
      entry.transactionId === txWrite.transactionId && entry.decision === 'COMMIT');
    assert.equal(applyCommitted(leader, wDecision), null);
    await settleTicks();
    assert.equal(wCommit.value?.success, true);
    const session = findParticipantSession(leader, txRead);
    const gen = readPartitionWriteGeneration(leader.db);
    assert.equal(canAdvanceRowKeySessionGeneration(leader, session, gen), true);
    const rPrep = track(send(leader, prepareMessage(txRead)));
    const rCmd = await awaitProposal(proposed,
      (entry) => entry.transactionId === txRead.transactionId);
    assert.equal(applyCommitted(leader, rCmd), null);
    await settleTicks();
    assert.equal(rPrep.value?.success, true);
  }));

test('Deadlock B: proveCurrentControlCohort fast-tracks paused OBSERVED control cohort with ' +
  'undecided FROZEN row without second ENABLE',
() => withParticipantReleaseProtocol(async ({controlService, transport, release}) => {
  const now = Date.now();
  controlService.db.prepare(
    'INSERT INTO sql_transactions (transaction_id,session_id,status,transaction_epoch,' +
    'timeout_deadline,transaction_mode,participant_set_state,participant_set_text,' +
    'commit_mode,frozen_participant_count,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
  ).run('f'.repeat(32), 'open-control-row', 'ACTIVE', 1, now + 60000, 'EXPLICIT',
    'OPEN', '[]', 'NOT_SELECTED', 0, now, now);
  controlService.db.prepare(
    'UPDATE sql_transactions SET participant_set_state = ?, commit_mode = ? WHERE transaction_id = ?',
  ).run('FROZEN', 'TWO_PHASE_COMMIT', 'f'.repeat(32));
  const actions = [];
  const pausedSnapshots = [];
  const originalDeliver = transport.deliver;
  transport.deliver = async (address, payload, options) => {
    if (payload?.type === PARTICIPANT_RELEASE_TYPE &&
        payload.partitionId === CONTROL_PARTITION) {
      actions.push(payload.action);
      if (payload.action === RELEASE_ACTION.RELEASE) {
        assert.equal(Object.hasOwn(payload, 'controlPrerequisite'), false);
      }
    }
    const response = await Reflect.apply(originalDeliver, transport, [address, payload, options]);
    if (payload?.type === PARTICIPANT_RELEASE_TYPE &&
        payload.partitionId === CONTROL_PARTITION &&
        payload.action === RELEASE_ACTION.PAUSE) {
      pausedSnapshots.push(deliveryAnswerOf(response)?.[PARTICIPANT_RELEASE_RESULT_FIELD]);
    }
    return response;
  };
  try {
    const answer = await release();
    assert.equal(answer.outcome, OUTCOME.CUT_OVER, JSON.stringify(answer));
    assert.ok(actions.includes(RELEASE_ACTION.PAUSE));
    assert.ok(actions.includes(RELEASE_ACTION.RESUME));
    assert.equal(actions.includes(RELEASE_ACTION.ENABLE), false,
      'proveCurrentControlCohort fast-tracks paused OBSERVED cohort without second ENABLE');
    assert.ok(pausedSnapshots.length >= 1 &&
      pausedSnapshots.every((item) => item?.outcome === OUTCOME.OBSERVED && item.paused === true));
    assert.equal(participantCutoverPauseOf(controlService), null);
  } finally {
    transport.deliver = originalDeliver;
  }
}, undefined, {remoteControl: true}));
