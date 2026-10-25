// Owed-work admission through real PartitionService, SQLite ledger and CDC lane.
// Consensus is the existing controllable port; subscribers use the owner receipt
// fixture. These cases establish application/admission semantics, not native Raft.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {createUnknownOutcomeRedelivery} from '../../src/query/query-executor-unknown-outcome.js';
import {PARTITION_WRITE_LEADERSHIP_REFUSAL} from '../../src/partition/partition-write-kernel.js';
import {runRetryableControlPlaneWrite} from '../../src/bootstrap/shared/retryable-control-plane-write.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {countCdcObligations, readOwedCdcObligations} from '../../src/partition/partition-cdc-obligation-ledger.js';
import {
  CDC_TABLE, REPLICAS, applyCommitted, awaitProposal, clearFixtureSingletons,
  generationOf, resetFixtureSingletons, settleTicks, shutdownAll, startLeader,
  startReplica,
} from '../test-helpers/participant-transaction-fixture.js';
import {acknowledgingCdcSubscriber} from '../test-helpers/acknowledging-cdc-subscriber.js';
import {commitOnAll, pump} from '../test-helpers/cdc-hydration-handoff-fixture.js';

import {CDC, OWED_CAPACITY, PRESSURE_CODE, WRITE_SQL, fillDebt, write} from
  '../test-helpers/cdc-owed-admission-fixture.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

test('refusing subscriber bounds actual write ingress and admits retry after committed acknowledgement', async () => {
  const timeSource = new VirtualTimeSource();
  const {leader, proposed} = await startLeader({...CDC, timeSource});
  const readiness = {ready: false};
  try {
    await leader.subscribeToCDCWithHandshake(acknowledgingCdcSubscriber({
      canAcceptCDCEvent: () => ({ready: readiness.ready, retryAfterMs: 50}),
    }), {subscriberId: 'held-owed-admission'});
    fillDebt(leader, OWED_CAPACITY);
    const generation = generationOf(leader);
    const count = proposed.length;
    const pending = write(leader, 'full-capacity-write');
    await settleTicks();
    assert.equal(proposed.length, count, 'full durable debt refuses before proposal');
    assert.equal(pending.settled, true);
    assert.equal(pending.value.success, false);
    assert.equal(pending.value.failureCode, PRESSURE_CODE);
    // The actual pressure answer must not settle a caller's earlier unanswered
    // attempt. Earlier transport loss is injected; the redelivery owner is real.
    const uncertainty = createUnknownOutcomeRedelivery({entryId: 'full-capacity-write',
      forRead: false, now: () => timeSource.now()});
    uncertainty.observeLostAnswer(new Error('prior delivery reply lost'));
    uncertainty.observeAnswer(pending.value);
    assert.equal(uncertainty.isUnresolved(), true);
    assert.equal(uncertainty.finish(pending.value).failureCode,
      PARTITION_WRITE_LEADERSHIP_REFUSAL.OUTCOME_UNKNOWN);
    assert.equal(countCdcObligations(leader.db).owed, OWED_CAPACITY);
    assert.equal(generationOf(leader), generation);
    assert.equal(leader.db.prepare(`SELECT * FROM ${CDC_TABLE} WHERE id = ?`).get('pressure-row'), undefined);
    readiness.ready = true;
    await pump(timeSource, leader, proposed, new Set(), 50);
    assert.equal(countCdcObligations(leader.db).owed, 0, 'actual CDC_DELIVERED application drains debt');
    const retried = write(leader, 'full-capacity-write');
    const command = await awaitProposal(proposed, (entry) => entry.entryId === 'full-capacity-write');
    assert.ok(command);
    assert.equal(applyCommitted(leader, command), null);
    await settleTicks();
    assert.equal(retried.value?.success, true);
    assert.equal(countCdcObligations(leader.db).owed, 1);
  } finally {
    await shutdownAll(leader);
  }
});

test('concurrent proposals obey one committed-prefix capacity and losing same-entry retry remains live', async () => {
  const timeSource = new VirtualTimeSource();
  const {leader, proposed} = await startLeader({...CDC, timeSource});
  let follower;
  try {
    follower = await startReplica(REPLICAS[1], {...CDC, timeSource});
    fillDebt(leader, OWED_CAPACITY - 1, [follower]);
    const first = write(leader, 'last-slot-winner');
    const second = write(leader, 'last-slot-retry');
    const firstCommand = await awaitProposal(proposed, (entry) => entry.entryId === 'last-slot-winner');
    const secondCommand = await awaitProposal(proposed, (entry) => entry.entryId === 'last-slot-retry');
    assert.ok(firstCommand);
    assert.ok(secondCommand, 'both proposals passed before either applied');
    assert.deepEqual(commitOnAll([leader, follower], firstCommand), [null, null]);
    const generation = generationOf(leader);
    assert.deepEqual(commitOnAll([leader, follower], secondCommand), [null, null]);
    await settleTicks();
    assert.equal(countCdcObligations(leader.db).owed, OWED_CAPACITY);
    assert.deepEqual(countCdcObligations(follower.db), countCdcObligations(leader.db));
    assert.equal(first.value?.success, true);
    assert.equal(second.value?.failureCode, PRESSURE_CODE);
    assert.equal(generationOf(leader), generation, 'refusal has no write generation');
    assert.equal(generationOf(follower), generation);
    assert.equal(leader.db.prepare(`SELECT value FROM ${CDC_TABLE} WHERE id = ?`).get('pressure-row').value,
      'last-slot-winner');
    await leader.subscribeToCDCWithHandshake(acknowledgingCdcSubscriber(), {subscriberId: 'drain-race'});
    await pump(timeSource, leader, proposed, new Set(), 50, [follower]);
    const retried = write(leader, 'last-slot-retry');
    await settleTicks();
    assert.equal(applyCommitted(leader, secondCommand), null);
    assert.equal(applyCommitted(follower, secondCommand), null);
    await settleTicks();
    assert.equal(retried.value?.success, true);
    assert.deepEqual(countCdcObligations(follower.db), countCdcObligations(leader.db));
    assert.equal(generationOf(leader), generation + 1);
  } finally {
    await shutdownAll(...[leader, follower].filter(Boolean));
  }
});


test('the existing control-plane retry owner continues the same entry after ACK progress without new traffic', async () => {
  const timeSource = new VirtualTimeSource();
  const {leader, proposed} = await startLeader({...CDC, timeSource});
  try {
    fillDebt(leader, OWED_CAPACITY);
    const identities = [];
    const retries = [];
    const answer = await runRetryableControlPlaneWrite(async ({writeIdentity}) => {
      identities.push(writeIdentity);
      const pending = leader.executeQuery(WRITE_SQL, ['retry-owner-row', 'v'], {entryId: writeIdentity});
      await settleTicks();
      const command = proposed.find((entry) => entry.entryId === writeIdentity);
      if (command) assert.equal(applyCommitted(leader, command), null);
      return pending;
    }, {
      onRetry: ({resultOrError}) => retries.push(resultOrError.failureCode),
      sleep: async () => {
        await leader.subscribeToCDCWithHandshake(acknowledgingCdcSubscriber(), {subscriberId: 'retry-owner-drain'});
        await pump(timeSource, leader, proposed, new Set(), 50);
      },
    });
    assert.equal(answer.success, true);
    assert.deepEqual(retries, [PRESSURE_CODE]);
    assert.equal(identities.length, 2);
    assert.equal(new Set(identities).size, 1, 'existing retry owner preserves exact logical write');
    assert.equal(countCdcObligations(leader.db).owed, 1);
  } finally {
    await shutdownAll(leader);
  }
});

test('owed-event admission preserves the supported 2 MiB ordinary payload', async () => {
  const {leader, proposed} = await startLeader(CDC);
  try {
    const payload = 'p'.repeat(2 * 1024 * 1024);
    const pending = leader.executeQuery(WRITE_SQL, ['large-row', payload], {entryId: 'large-owed-event'});
    const command = await awaitProposal(proposed, (entry) => entry.entryId === 'large-owed-event');
    assert.ok(command);
    assert.equal(applyCommitted(leader, command), null);
    assert.equal((await pending).success, true);
    const [owed] = readOwedCdcObligations(leader.db);
    assert.equal(JSON.parse(owed.eventJson).data.value, payload);
    assert.ok(Buffer.byteLength(owed.eventJson) > payload.length);
    assert.equal(countCdcObligations(leader.db).owed, 1);
  } finally {
    await shutdownAll(leader);
  }
});
