// Complete participant batches reserve CDC capacity at the durable PREPARED
// boundary. The real participant owner/SQLite apply runs; consensus is controlled.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {afterEach, beforeEach, test} from 'node:test';
import {startPartitionRaftWriteCommit} from '../../src/partition/partition-service-raft-write-commit.js';
import {PARTITION_WRITE_LEADERSHIP_REFUSAL, isRetryableWriteFailureCode} from
  '../../src/partition/partition-write-kernel.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {countCdcObligations} from '../../src/partition/partition-cdc-obligation-ledger.js';
import {readParticipantTransactionRow} from '../../src/partition/partition-participant-transaction-store.js';
import {PARTICIPANT_TRANSACTION_DECISION as DECISION,
  PARTICIPANT_TRANSACTION_REPLAY_BOUND, PARTICIPANT_TRANSACTION_STATE as STATE} from
  '../../src/partition/partition-participant-transaction-constants.js';
import {
  CDC_INSERT_SQL, applyCommitted, awaitProposal, beginMessage, clearFixtureSingletons,
  commitDecision, commitMessage, durableAppliedIndex, generationOf, identityOf,
  operationOf, prepareCommandOf, prepareMessage, queryMessage, resetFixtureSingletons,
  send, settleTicks, shutdownAll, startLeader, temporaryDbPath, track,
} from '../test-helpers/participant-transaction-fixture.js';
import {acknowledgingCdcSubscriber} from '../test-helpers/acknowledging-cdc-subscriber.js';
import {pump, upsertOf} from '../test-helpers/cdc-hydration-handoff-fixture.js';
import {CDC, OWED_CAPACITY, PRESSURE_CODE, fillDebt} from '../test-helpers/cdc-owed-admission-fixture.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

const BATCH = PARTICIPANT_TRANSACTION_REPLAY_BOUND.MAX_OPERATIONS;
const row = (index) => ({id: `batch-${index}`, value: `v-${index}`});

test('the full supported participant batch defers whole, keeps sealed identity and retries after ACK progress', async () => {
  const timeSource = new VirtualTimeSource();
  const {leader, proposed} = await startLeader({...CDC, timeSource});
  const tx = identityOf('full-batch-capacity');
  try {
    assert.ok(BATCH <= OWED_CAPACITY, 'every supported complete batch fits an empty ledger');
    fillDebt(leader, OWED_CAPACITY - BATCH + 1);
    assert.equal((await send(leader, beginMessage(tx))).success, true);
    for (let index = 0; index < BATCH; index += 1) {
      const value = row(index);
      assert.equal((await send(leader, queryMessage(tx, CDC_INSERT_SQL,
        [value.id, value.value]))).success, true);
    }
    const refused = await send(leader, prepareMessage(tx));
    assert.equal(refused.success, false);
    assert.equal(refused.failureCode, PRESSURE_CODE);
    assert.equal(readParticipantTransactionRow(leader.db, tx), null);
    assert.equal(proposed.some((command) => command.transactionId === tx.transactionId), false);
    await leader.subscribeToCDCWithHandshake(acknowledgingCdcSubscriber(),
      {subscriberId: 'full-batch-drain'});
    await pump(timeSource, leader, proposed, new Set(), 50);
    const prepare = track(send(leader, prepareMessage(tx)));
    const command = await awaitProposal(proposed,
      (entry) => entry.transactionId === tx.transactionId);
    assert.ok(command, 'the same sealed session remains retryable');
    assert.equal(JSON.parse(command.operationsText).length, BATCH);
    assert.equal(applyCommitted(leader, command), null);
    await settleTicks();
    assert.equal(prepare.value?.success, true);
    const committed = track(send(leader, commitMessage(tx, command.preparedDigest)));
    const decision = await awaitProposal(proposed, (entry) =>
      entry.transactionId === tx.transactionId && entry.decision === DECISION.COMMIT);
    assert.ok(decision);
    assert.equal(applyCommitted(leader, decision), null);
    await settleTicks();
    assert.equal(committed.value?.success, true);
    assert.equal(countCdcObligations(leader.db).owed, BATCH);
  } finally {
    await shutdownAll(leader);
  }
});

test('durable PREPARED reservation survives restart and converts its entire reserved capacity on COMMIT', async () => {
  const {directory, dbPath} = temporaryDbPath();
  const timeSource = new VirtualTimeSource();
  const {leader} = await startLeader({...CDC, timeSource, dbPath});
  const tx = identityOf('restart-batch-capacity');
  let restarted;
  try {
    fillDebt(leader, OWED_CAPACITY - BATCH);
    const operations = Array.from({length: BATCH}, (_unused, index) =>
      operationOf(row(index), {sql: CDC_INSERT_SQL}));
    const prepare = prepareCommandOf(tx, operations, generationOf(leader));
    assert.equal(applyCommitted(leader, prepare), null);
    assert.equal(readParticipantTransactionRow(leader.db, tx).state, STATE.PREPARED);
    const generation = generationOf(leader);
    assert.equal(applyCommitted(leader, upsertOf(leader, 'reserved-race', 0)), null);
    assert.equal(generationOf(leader), generation,
      'competing SQL cannot spend reserved slots');
    await leader.shutdown();
    ({leader: restarted} = await startLeader({
      ...CDC, timeSource, dbPath, generationOrigin: false}));
    restarted.controllablePort.committedIndex = durableAppliedIndex(restarted);
    assert.equal(readParticipantTransactionRow(restarted.db, tx).state, STATE.PREPARED);
    assert.equal(countCdcObligations(restarted.db).owed, OWED_CAPACITY - BATCH);
    const decision = {...commitDecision(tx, prepare),
      timestamp: restarted.hlcClock.now().toString()};
    assert.equal(applyCommitted(restarted, decision), null);
    assert.equal(readParticipantTransactionRow(restarted.db, tx).state, STATE.COMMITTED);
    assert.equal(countCdcObligations(restarted.db).owed, OWED_CAPACITY);
    assert.equal(applyCommitted(restarted, decision), null, 'decision replay never reserves again');
    assert.equal(countCdcObligations(restarted.db).owed, OWED_CAPACITY);
  } finally {
    await shutdownAll(...[leader, restarted].filter(Boolean));
    fs.rmSync(directory, {recursive: true, force: true});
  }
});


test('an impossible carried batch receives a finite refusal, never endless pressure retry', async () => {
  const {leader, proposed} = await startLeader(CDC);
  const tx = identityOf('impossible-carried-batch');
  try {
    // Deliberate invalid-producer input, beyond the existing supported256-op
    // staging contract. It must not be mistaken for debt that ACKs can drain.
    const operations = Array.from({length: OWED_CAPACITY + 1}, (_unused, index) =>
      operationOf(row(index), {sql: CDC_INSERT_SQL}));
    const command = prepareCommandOf(tx, operations, generationOf(leader));
    const answer = await startPartitionRaftWriteCommit(leader, {entry: command,
      phaseTimings: null, applyStartMs: leader.timeSource.now()});
    assert.equal(answer.failureCode,
      PARTITION_WRITE_LEADERSHIP_REFUSAL.CDC_DEMAND_EXCEEDS_CAPACITY);
    assert.equal(isRetryableWriteFailureCode(answer.failureCode), false);
    assert.equal(answer.deferRetry, false);
    assert.equal(proposed.length, 0);
    assert.equal(applyCommitted(leader, command), null,
      'committed malformed producer cannot block apply');
    assert.equal(readParticipantTransactionRow(leader.db, tx), null);
    assert.equal(countCdcObligations(leader.db).owed, 0);
  } finally {
    await shutdownAll(leader);
  }
});
