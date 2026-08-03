/**
 * Deterministic guard for the bounded shard-dispatch pool: slot-ordered
 * admission up to the configured limit, next-task admission as one
 * settles, permanent admission stop on first failure or deadline while
 * started work settles, stable slot-order settled output independent of
 * completion order, and fail-closed argument validation. Uses manually
 * resolved deferreds and an injected clock — no timers, no races.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  SHARD_ADMISSION_STOP,
  SHARD_TASK_STATUS,
  runBoundedShardDispatch,
} from '../../src/service/call-shard-dispatch-pool.js';

const SLOT_COUNT = 4;
const LIMIT_TWO = 2;
const LIMIT_ONE = 1;
const FAILURE_MESSAGE = 'shard task failed';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {promise, reject, resolve};
}

function tick() {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

function makeSlots(count) {
  return Array.from({length: count}, (_, index) => ({slotIndex: index}));
}

test('admits in slot order up to the limit and starts the next task as ' +
  'one settles', async (t) => {
  const gates = makeSlots(SLOT_COUNT).map(() => deferred());
  const started = [];
  const outcomePromise = runBoundedShardDispatch({
    limit: LIMIT_TWO,
    runSlot: (slot, index) => {
      started.push(index);
      return gates[index].promise;
    },
    slots: makeSlots(SLOT_COUNT),
  });
  await tick();
  t.same(started, [0, 1],
    'exactly limit tasks start, in slot order');
  gates[0].resolve('r0');
  await tick();
  t.same(started, [0, 1, 2],
    'the next slot is admitted as one settles, never exceeding the limit');
  gates[1].resolve('r1');
  gates[2].resolve('r2');
  await tick();
  gates[3].resolve('r3');
  const outcome = await outcomePromise;
  t.equal(outcome.peakConcurrent, LIMIT_TWO,
    'peak concurrency equals the configured limit');
  t.equal(outcome.admissionStop, SHARD_ADMISSION_STOP.NONE);
  t.same(outcome.settled.map((entry) => entry.status),
    Array.from({length: SLOT_COUNT},
      () => SHARD_TASK_STATUS.FULFILLED));
  t.same(outcome.unadmitted, []);
});

test('settled output is stable slot order even when completion order ' +
  'is reversed', async (t) => {
  const gates = makeSlots(SLOT_COUNT).map(() => deferred());
  const outcomePromise = runBoundedShardDispatch({
    limit: SLOT_COUNT,
    runSlot: (slot, index) => gates[index].promise,
    slots: makeSlots(SLOT_COUNT),
  });
  await tick();
  for (let index = SLOT_COUNT - 1; index >= 0; index -= 1) {
    gates[index].resolve(`r${index}`);
    await tick();
  }
  const outcome = await outcomePromise;
  t.same(outcome.settled.map((entry) => entry.index), [0, 1, 2, 3],
    'settled entries are slot-ordered, not completion-ordered');
  t.same(outcome.settled.map((entry) => entry.value),
    ['r0', 'r1', 'r2', 'r3']);
});

test('first failure permanently stops admission while started work ' +
  'settles', async (t) => {
  const gates = makeSlots(SLOT_COUNT).map(() => deferred());
  const started = [];
  const outcomePromise = runBoundedShardDispatch({
    limit: LIMIT_TWO,
    runSlot: (slot, index) => {
      started.push(index);
      return gates[index].promise;
    },
    slots: makeSlots(SLOT_COUNT),
  });
  await tick();
  gates[0].reject(new Error(FAILURE_MESSAGE));
  await tick();
  t.same(started, [0, 1],
    'no new slot is admitted after the failure');
  gates[1].resolve('r1');
  const outcome = await outcomePromise;
  t.equal(outcome.admissionStop, SHARD_ADMISSION_STOP.FAILURE);
  t.equal(outcome.settled[0].status, SHARD_TASK_STATUS.REJECTED);
  t.equal(outcome.settled[0].reason.message, FAILURE_MESSAGE);
  t.equal(outcome.settled[1].status, SHARD_TASK_STATUS.FULFILLED,
    'already-started work settles cleanly');
  t.same(outcome.unadmitted.map((entry) => entry.index), [2, 3]);
  t.same(
    outcome.unadmitted.map((entry) => entry.cause),
    [SHARD_ADMISSION_STOP.FAILURE, SHARD_ADMISSION_STOP.FAILURE],
  );
});

test('a passed deadline stops admission before any further slot starts',
  async (t) => {
    let clock = 0;
    const started = [];
    const outcome = await runBoundedShardDispatch({
      deadlineMs: 10,
      limit: LIMIT_ONE,
      nowProvider: () => clock,
      runSlot: async (slot, index) => {
        started.push(index);
        clock = 20;
        return index;
      },
      slots: makeSlots(SLOT_COUNT),
    });
    t.same(started, [0],
      'the deadline is checked before every admission');
    t.equal(outcome.admissionStop, SHARD_ADMISSION_STOP.DEADLINE);
    t.same(outcome.unadmitted.map((entry) => entry.cause), [
      SHARD_ADMISSION_STOP.DEADLINE,
      SHARD_ADMISSION_STOP.DEADLINE,
      SHARD_ADMISSION_STOP.DEADLINE,
    ]);
  });

test('an already-passed deadline admits nothing', async (t) => {
  const outcome = await runBoundedShardDispatch({
    deadlineMs: 5,
    limit: LIMIT_TWO,
    nowProvider: () => 10,
    runSlot: async (slot, index) => index,
    slots: makeSlots(SLOT_COUNT),
  });
  t.same(outcome.settled, [], 'no task ever starts');
  t.equal(outcome.unadmitted.length, SLOT_COUNT);
  t.equal(outcome.admissionStop, SHARD_ADMISSION_STOP.DEADLINE);
});

test('slots sharing an admission key never overlap, and a blocked key ' +
  'never head-of-line blocks other hosts', async (t) => {
  const keys = ['host-a', 'host-a', 'host-b', 'host-c'];
  const gates = makeSlots(SLOT_COUNT).map(() => deferred());
  const started = [];
  const outcomePromise = runBoundedShardDispatch({
    admissionKeyOf: (slot, index) => keys[index],
    limit: LIMIT_TWO,
    runSlot: (slot, index) => {
      started.push(index);
      return gates[index].promise;
    },
    slots: makeSlots(SLOT_COUNT),
  });
  await tick();
  t.same(started, [0, 2],
    'slot 1 shares host-a with in-flight slot 0, so slot 2 (host-b) ' +
      'starts instead — no same-key overlap, no head-of-line block');
  gates[0].resolve('r0');
  await tick();
  t.same(started, [0, 2, 1],
    'the same-key slot is admitted once its host is idle');
  gates[1].resolve('r1');
  gates[2].resolve('r2');
  await tick();
  gates[3].resolve('r3');
  const outcome = await outcomePromise;
  t.equal(outcome.settled.length, SLOT_COUNT);
  t.equal(outcome.peakConcurrent, LIMIT_TWO);
});

test('argument validation fails closed', async (t) => {
  const validSlot = {
    limit: LIMIT_ONE,
    runSlot: async () => 0,
    slots: [],
  };
  for (const broken of [
    {...validSlot, slots: 'not-an-array'},
    {...validSlot, limit: 0},
    {...validSlot, limit: 1.5},
    {...validSlot, runSlot: 'not-a-function'},
  ]) {
    await runBoundedShardDispatch(broken).then(
      () => t.fail('expected a TypeError'),
      (error) => t.ok(error instanceof TypeError),
    );
  }
});
