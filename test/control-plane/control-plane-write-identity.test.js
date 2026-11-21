// The held instances of named control-plane writes are bounded and never
// evicted: at the bound a new named write is refused typed before it is
// delivered, and every held unresolved instance keeps its key - its next
// re-drive is still its own entry (never a blind second write).
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {runRetryableControlPlaneWrite} from
  '../../src/bootstrap/shared/retryable-control-plane-write.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {CancellationToken} from '../../src/query/cancellation-token.js';
import {completeNamedWriteDelivery, createNamedWriteCaller, createNamedWriteDelivery,
  waitForNamedWriteDelivery} from '../../src/control-plane/control-plane-named-write-wait.js';

import {
  CONTROL_PLANE_WRITE_IDENTITY_CAPACITY_CODE,
  captureControlPlaneWriteConfirmation,
  controlPlaneWriteIdentity,
  isControlPlaneWriteDefinitivelyUnappliedError,
  releaseControlPlaneWriteIdentities,
  runControlPlaneWrite,
} from '../../src/control-plane/control-plane-write-identity.js';
import {deriveParticipantEntryId} from '../../src/query/distributed/distributed-write-coordinator.js';
import {PARTITION_WRITE_LEADERSHIP_REFUSAL} from
  '../../src/partition/partition-write-kernel.js';

const BOUND = 4096;
const SCOPE = 'identity-bound-witness';
const ROUTE = {id: SCOPE, partitionId: null};
const PARTITION_ID = 'named-proof-p1';
function replyFor(idempotencyKey) {
  const participant = {success: true, partitionId: PARTITION_ID, affectedRows: 1,
    durableCommitWitness: {partitionId: PARTITION_ID, term: 4, logIndex: 29,
      entryId: deriveParticipantEntryId(idempotencyKey, PARTITION_ID)}};
  return {
    success: true, idempotencyKey, operationId: 'complete-statement', affectedRows: 1,
    partitions: [PARTITION_ID], mirrorPartitions: [], participantResults: [participant],
  };
}
const UNKNOWN_ANSWER = Object.freeze({success: false,
  failureCode: PARTITION_WRITE_LEADERSHIP_REFUSAL.OUTCOME_UNKNOWN,
  entryId: 'entry-unknown'});

test('at the bound a new named write is refused typed before delivery; no ' +
  'unresolved instance is evicted', async () => {
  const keys = [];
  try {
    for (let index = 0; index < BOUND; index += 1) {
      await runControlPlaneWrite(
        {writeIdentity: controlPlaneWriteIdentity(SCOPE, index)},
        {index}, ROUTE, async (_content, key) => {
          keys.push(key);
          return UNKNOWN_ANSWER;
        });
    }
    let delivered = false;
    const refused = await runControlPlaneWrite(
      {writeIdentity: controlPlaneWriteIdentity(SCOPE, 'one-more')},
      {index: 'one-more'}, ROUTE, async (_content, key) => {
        delivered = true;
        return replyFor(key);
      });
    assert.equal(delivered, false, 'nothing was delivered');
    assert.equal(refused.success, false, 'refused');
    assert.equal(refused.errorCode, CONTROL_PLANE_WRITE_IDENTITY_CAPACITY_CODE,
      'typed');
    assert.equal(refused.heldWriteIdentityBound, BOUND, 'it reports the bound');
    assert.equal(refused.heldWriteIdentities, BOUND, 'and what is held');
    let redriveKey = null;
    await runControlPlaneWrite(
      {writeIdentity: controlPlaneWriteIdentity(SCOPE, 0)}, {index: 0}, ROUTE,
      async (_content, key) => {
        redriveKey = key;
        return UNKNOWN_ANSWER;
      });
    assert.equal(redriveKey, keys[0], 'the oldest unresolved instance is ' +
      'still held: its re-drive is its own entry');
  } finally {
    releaseControlPlaneWriteIdentities(SCOPE);
  }
  let afterRelease = null;
  await runControlPlaneWrite(
    {writeIdentity: controlPlaneWriteIdentity(SCOPE, 0)}, {index: 0}, ROUTE,
    async (_content, key) => {
      afterRelease = key;
      return replyFor(key);
    });
  assert.notEqual(afterRelease, keys[0], 'a released name is a new instance');
});

test('a durable confirmation can release only the exact observed instance and effect', async () => {
  const name = controlPlaneWriteIdentity(SCOPE, 'confirmed-instance');
  const first = {publication: 'first-content'};
  const second = {publication: 'second-content'};
  const keys = [];
  const unknown = async (_content, key) => {
    keys.push(key);
    return UNKNOWN_ANSWER;
  };
  const write = (effect) => runControlPlaneWrite({
    writeIdentity: name, confirmWriteEffect: (observed) => observed === effect,
  }, effect, ROUTE, unknown);
  try {
    await write(first);
    const delayed = captureControlPlaneWriteConfirmation(name);
    await runControlPlaneWrite({writeIdentity: name}, first, ROUTE,
      async (_content, key) => replyFor(key));
    await write(second);

    const current = captureControlPlaneWriteConfirmation(name);
    assert.equal(delayed(first), false, 'an earlier read cannot clear the successor');
    assert.equal(current(first), false, 'the same name does not prove the effect');
    await write(second);
    assert.equal(keys[2], keys[1], 'either unconfirmed read preserves the retained instance');
    assert.equal(current(second), true);
    await write(second);
    assert.notEqual(keys[3], keys[1], 'exact authoritative readback retires the retained instance');
  } finally {
    releaseControlPlaneWriteIdentities(SCOPE);
  }
});

test('incomplete or foreign SQL receipts cannot release an unresolved named entry', async () => {
  const name = controlPlaneWriteIdentity(SCOPE, 'bound-participant-receipt');
  const route = {id: SCOPE, partitionId: PARTITION_ID};
  const write = (attempt) =>
    runControlPlaneWrite({writeIdentity: name}, {mutation: 1}, route, attempt);
  let entryId;
  let key;
  try {
    await write(async (_content, actualKey) => {
      key = actualKey;
      entryId = deriveParticipantEntryId(key, PARTITION_ID);
      return {...UNKNOWN_ANSWER, partitionId: PARTITION_ID, entryId};
    });
    const valid = replyFor(key);
    const [participant] = valid.participantResults;
    const empty = {...valid, partitions: [], participantResults: []};
    const foreignPartition = 'foreign-p1';
    const foreign = {partitionId: foreignPartition,
      entryId: deriveParticipantEntryId(key, foreignPartition)};
    for (const reply of [
      empty, {...empty, affectedRows: 0}, {...valid, affectedRows: 2},
      {...valid, participantResults: [{...participant,
        durableCommitWitness: {...participant.durableCommitWitness, entryId: 'another-entry'}}]},
      {...UNKNOWN_ANSWER, ...foreign},
    ]) {
      const answer = await write(async (_content, actualKey) => {
        assert.equal(actualKey, key);
        return reply;
      });
      assert.equal(answer.success, false);
      assert.equal(answer.pendingInstance.entryId, entryId);
    }
    const result = await write(async (_content, actualKey) => replyFor(actualKey));
    assert.equal(result.success, true);
    const next = await write(async (_content, actualKey) => replyFor(actualKey));
    assert.notEqual(next.idempotencyKey, key);
  } finally {
    releaseControlPlaneWriteIdentities(SCOPE);
  }
});

test('only the bound named verdict can prove an incarnation write unapplied', async () => {
  const name = controlPlaneWriteIdentity(SCOPE, 'exact-refusal');
  const route = {id: SCOPE, partitionId: PARTITION_ID};
  const write = (attempt) => runControlPlaneWrite({writeIdentity: name}, {}, route, attempt);
  const refusal = (key, failureCode) => ({success: false, failureCode, partitionId: PARTITION_ID,
    entryId: deriveParticipantEntryId(key, PARTITION_ID)});
  try {
    const notProposed = await write(async (_body, key) =>
      refusal(key, PARTITION_WRITE_LEADERSHIP_REFUSAL.NOT_LEADER));
    assert.equal(isControlPlaneWriteDefinitivelyUnappliedError(notProposed), true);

    for (const code of [PARTITION_WRITE_LEADERSHIP_REFUSAL.RESERVED,
      PARTITION_WRITE_LEADERSHIP_REFUSAL.CONSENSUS_HOST_FAILURE,
      PARTITION_WRITE_LEADERSHIP_REFUSAL.NOT_LEADER]) {
      const pending = await write(async (_body, key) => refusal(key, code));
      assert.equal(isControlPlaneWriteDefinitivelyUnappliedError(pending), false);
    }
    const failed = await write(async (_body, key) => ({
      ...refusal(key, 'SQLITE_CONSTRAINT_NOTNULL'), outcome: 'statement_failed',
      committed: true, logIndex: 28,
    }));
    assert.equal(isControlPlaneWriteDefinitivelyUnappliedError(failed), true);
  } finally {
    releaseControlPlaneWriteIdentities(SCOPE);
  }
});

for (const firstCommits of [true, false]) {
  test(firstCommits ?
    'overlapping refusal cannot release the held delivery that reached consensus' :
    'overlapping callers share a definitive first refusal before getting a fresh entry', async () => {
    const name = controlPlaneWriteIdentity(SCOPE, firstCommits);
    const route = {id: SCOPE, partitionId: PARTITION_ID};
    const firstEntered = Promise.withResolvers();
    const releaseFirst = Promise.withResolvers();
    const refusal = (key) => ({success: false, partitionId: PARTITION_ID,
      failureCode: PARTITION_WRITE_LEADERSHIP_REFUSAL.NOT_LEADER,
      entryId: deriveParticipantEntryId(key, PARTITION_ID)});
    const initial = runControlPlaneWrite({writeIdentity: name}, {value: 'prior'}, route,
      async (_body, key) => {
        firstEntered.resolve(key);
        await releaseFirst.promise;
        return firstCommits ? replyFor(key) : refusal(key);
      });
    const entered = await Promise.race([
      firstEntered.promise, initial.then(() => null),
      new Promise((resolve) => setImmediate(() => resolve(null))),
    ]);
    assert.ok(entered, 'the first transport is held');
    let secondEntered = false;
    let secondFinished = false;
    const overlap = runControlPlaneWrite({writeIdentity: name}, {value: 'prior'}, route,
      async (_body, key) => {
        secondEntered = true;
        return refusal(key);
      }).then((answer) => {
      secondFinished = true;
      return answer;
    });
    try {
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(secondEntered, false, 'the second route does not deliver in the first turn');
      assert.equal(secondFinished, false, 'the second caller waits for the actual first receipt');
      releaseFirst.resolve();
      const [left, right] = await Promise.all([initial, overlap]);
      assert.equal(left.success, firstCommits);
      assert.equal(right.success, firstCommits);
      assert.equal(isControlPlaneWriteDefinitivelyUnappliedError(right), !firstCommits);
      const next = await runControlPlaneWrite({writeIdentity: name}, {value: 'fresh'}, route,
        async (_body, key) => replyFor(key));
      assert.notEqual(next.idempotencyKey, entered);
    } finally {
      releaseFirst.resolve();
      await Promise.allSettled([initial, overlap]);
      releaseControlPlaneWriteIdentities(SCOPE);
    }
  });
}

test('cancelling an overlapping waiter leaves the live delivery in custody', async () => {
  const name = controlPlaneWriteIdentity(SCOPE, 'cancel-overlap');
  const route = {id: SCOPE, partitionId: PARTITION_ID};
  const releaseFirst = Promise.withResolvers();
  const token = new CancellationToken();
  let firstKey;
  let waiterDispatched = false;
  const initial = runControlPlaneWrite({writeIdentity: name}, {value: 'prior'}, route,
    async (_body, key) => {
      firstKey = key;
      await releaseFirst.promise;
      return {...UNKNOWN_ANSWER, partitionId: PARTITION_ID,
        entryId: deriveParticipantEntryId(key, PARTITION_ID)};
    });
  const waiter = runControlPlaneWrite({writeIdentity: name, cancellationToken: token},
    {value: 'prior'}, route, async () => {
      waiterDispatched = true;
      return UNKNOWN_ANSWER;
    });
  try {
    const abandoned = Promise.allSettled([waiter]);
    token.cancel('cancelled observer');
    const settlement = await Promise.race([
      abandoned,
      new Promise((resolve) => setImmediate(() => resolve(null))),
    ]);
    assert.ok(settlement, 'the cancelled waiter settles while the live transport is held');
    assert.equal(waiterDispatched, false);
    releaseFirst.resolve();
    await initial;
    const recovered = await runControlPlaneWrite({writeIdentity: name}, {value: 'prior'}, route,
      async (_body, key) => replyFor(key));
    assert.equal(recovered.idempotencyKey, firstKey,
      'the next authorized route redrives the original entry');
  } finally {
    releaseFirst.resolve();
    await Promise.allSettled([initial, waiter]);
    releaseControlPlaneWriteIdentities(SCOPE);
  }
});

test('an expired waiter budget does not release the original pending delivery', async () => {
  const name = controlPlaneWriteIdentity(SCOPE, 'exclusive-wait-budget');
  const route = {id: SCOPE, partitionId: PARTITION_ID};
  const releaseFirst = Promise.withResolvers();
  const clock = new VirtualTimeSource();
  let firstKey;
  let secondInvoked = false;
  const first = runControlPlaneWrite({writeIdentity: name}, {value: 'old'}, route,
    async (_body, key) => {
      firstKey = key;
      await releaseFirst.promise;
      return {...UNKNOWN_ANSWER, partitionId: PARTITION_ID,
        entryId: deriveParticipantEntryId(key, PARTITION_ID)};
    });
  const waiter = runControlPlaneWrite({
    writeIdentity: name, timeSource: clock, timeoutMs: 7,
  }, {value: 'fresh'}, route, async (_body, key) => {
    secondInvoked = true;
    return replyFor(key);
  });
  const expired = assert.rejects(waiter, {errorCode: 'TIMEOUT'});
  try {
    clock.advance(7);
    await expired;
    assert.equal(secondInvoked, false);
    assert.equal(clock.pendingTimerCount(), 0);
    releaseFirst.resolve();
    await first;

    const deliveries = [];
    await runControlPlaneWrite({writeIdentity: name}, {value: 'fresh'}, route,
      async (body, key) => {
        deliveries.push({body, key});
        return replyFor(key);
      });
    assert.deepEqual(deliveries.map(({body}) => body.value), ['old', 'fresh']);
    assert.equal(deliveries[0].key, firstKey);
    assert.notEqual(deliveries[1].key, firstKey);
  } finally {
    releaseFirst.resolve();
    await Promise.allSettled([first, waiter, expired]);
    releaseControlPlaneWriteIdentities(SCOPE);
  }
});

test('authoritative confirmation during delivery survives a late refusal', async () => {
  const name = controlPlaneWriteIdentity(SCOPE, 'confirm-before-answer');
  const route = {id: SCOPE, partitionId: PARTITION_ID};
  const releaseFirst = Promise.withResolvers();
  const entered = Promise.withResolvers();
  const first = runControlPlaneWrite({
    writeIdentity: name, confirmWriteEffect: (observation) => observation === 'committed value',
  }, {value: 'old'}, route, async (_body, key) => {
    entered.resolve(key);
    await releaseFirst.promise;
    return {success: false, partitionId: PARTITION_ID,
      failureCode: PARTITION_WRITE_LEADERSHIP_REFUSAL.NOT_LEADER,
      entryId: deriveParticipantEntryId(key, PARTITION_ID)};
  });
  let successor;
  try {
    const firstKey = await Promise.race([
      entered.promise, first.then(() => null),
      new Promise((resolve) => setImmediate(() => resolve(null))),
    ]);
    assert.ok(firstKey);
    assert.equal(captureControlPlaneWriteConfirmation(name)('committed value'), true);
    const deliveries = [];
    successor = runControlPlaneWrite({writeIdentity: name}, {value: 'fresh'}, route,
      async (body, key) => {
        deliveries.push({body, key});
        return replyFor(key);
      });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(deliveries, [], 'confirmed effect does not retire live delivery custody early');
    releaseFirst.resolve();
    const late = await first;
    assert.equal(isControlPlaneWriteDefinitivelyUnappliedError(late), false);
    const next = await successor;
    assert.equal(next.pendingInstance.outcome, 'applied');
    assert.deepEqual(deliveries.map(({body}) => body.value), ['fresh']);
    assert.notEqual(deliveries[0].key, firstKey);
  } finally {
    releaseFirst.resolve();
    await Promise.allSettled([first, successor]);
    releaseControlPlaneWriteIdentities(SCOPE);
  }
});

test('cancelled and expired observers detach before the transport answers', async () => {
  const delivery = createNamedWriteDelivery();
  const clock = new VirtualTimeSource();
  for (let turn = 0; turn < 10; turn += 1) {
    const cancellationToken = new CancellationToken();
    const cancelled = assert.rejects(waitForNamedWriteDelivery(delivery,
      createNamedWriteCaller({timeSource: clock, cancellationToken})), /observer cancelled/);
    const expired = assert.rejects(waitForNamedWriteDelivery(delivery,
      createNamedWriteCaller({timeSource: clock, timeoutMs: 7})), {errorCode: 'TIMEOUT'});
    assert.equal(delivery.waiters.size, 2);
    cancellationToken.cancel('observer cancelled');
    clock.advance(7);
    await Promise.all([cancelled, expired]);
    assert.equal(delivery.waiters.size, 0);
    assert.equal(clock.pendingTimerCount(), 0);
  }
  const live = waitForNamedWriteDelivery(delivery, createNamedWriteCaller({timeSource: clock}));
  const answer = {success: true};
  completeNamedWriteDelivery(delivery, answer);
  assert.equal(await live, answer);
  assert.equal(delivery.waiters.size, 0);
  assert.equal(clock.pendingTimerCount(), 0);
});

test('bounded retry leaves an ambiguous delivery under its caller’s explicit write key', async () => {
  const used = [];
  const body = {value: 'unchanged across waits'};
  const invoke = (key, answer) => runRetryableControlPlaneWrite(
    (identity) => runControlPlaneWrite(identity, body, ROUTE, async (received, physicalKey) => {
      assert.deepEqual(received, body);
      used.push(physicalKey);
      return answer(physicalKey);
    }),
    {timeoutMs: 0, idempotencyKey: key},
  );
  const first = await invoke(undefined, () => UNKNOWN_ANSWER);
  assert.equal(first.success, false);
  const last = await invoke(used[0], replyFor);
  assert.equal(last.success, true);
  assert.deepEqual(used, [used[0], used[0]], 'a later bounded call carries the original physical key');
});
