// A runtime turn's answer is named where the turn produced it: settled when
// the work completed within the call, pending when it waits on I/O. A
// consumer switches on `settled`; continuing a settled turn stays in the
// same synchronous run, and continuing a pending one takes exactly the
// promise reactions the earlier value-or-promise chaining took.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  continueTurn,
  pendingTurn,
  settledTurn,
  turnChainValue,
  turnFromForeignAnswer,
} from '../../src/raft/raft-rs-turn-answer.js';

test('a settled turn continues in the same synchronous run', () => {
  const order = [];
  const continued = continueTurn(settledTurn(1), (value) => {
    order.push(`continuation ${value}`);
    return settledTurn(value + 1);
  });
  order.push('after');
  assert.deepEqual(order, ['continuation 1', 'after']);
  assert.equal(continued.settled, true);
  assert.equal(continued.result, 2);
  assert.ok(Object.isFrozen(continued));
});

test('a pending turn continues after its promise, as a pending turn', async () => {
  const order = [];
  const continued = continueTurn(pendingTurn(Promise.resolve(1)), (value) => {
    order.push(`continuation ${value}`);
    return settledTurn(value + 1);
  });
  order.push('after');
  assert.equal(continued.settled, false);
  assert.equal(await continued.pending, 2);
  assert.deepEqual(order, ['after', 'continuation 1']);
});

test('a continuation that waits again is adopted by the pending chain',
  async () => {
    const continued = continueTurn(pendingTurn(Promise.resolve(1)),
      (value) => pendingTurn(Promise.resolve(value * 10)));
    assert.equal(await continued.pending, 10);
  });

test('continuing a pending turn takes the same reactions as then-chaining',
  async () => {
    const ticks = async (makeChain) => {
      let settledAt = null;
      let tick = 0;
      makeChain().then(() => {
        settledAt = tick;
      });
      for (; tick < 20 && settledAt === null; tick += 1) {
        await null;
      }
      return settledAt;
    };
    const viaThen = await ticks(() => Promise.resolve(1)
      .then((value) => Promise.resolve(value + 1)));
    const viaTurn = await ticks(() => continueTurn(
      pendingTurn(Promise.resolve(1)),
      (value) => pendingTurn(Promise.resolve(value + 1))).pending);
    assert.equal(viaTurn, viaThen);
    const viaThenSync = await ticks(() => Promise.resolve(1)
      .then((value) => value + 1));
    const viaTurnSync = await ticks(() => continueTurn(
      pendingTurn(Promise.resolve(1)),
      (value) => settledTurn(value + 1)).pending);
    assert.equal(viaTurnSync, viaThenSync);
  });

test('a settled or pending turn reads as one chain value', async () => {
  assert.equal(turnChainValue(settledTurn(3)), 3);
  assert.equal(await turnChainValue(pendingTurn(Promise.resolve(4))), 4);
});

test('a foreign answer is named once: settled values, pending promises and ' +
  'thenables (their then read exactly once)', async () => {
  assert.equal(turnFromForeignAnswer(7).settled, true);
  assert.equal(turnFromForeignAnswer(null).result, null);
  const plain = {acknowledged: true};
  assert.equal(turnFromForeignAnswer(plain).result, plain);
  const promised = turnFromForeignAnswer(Promise.resolve('sent'));
  assert.equal(promised.settled, false);
  assert.equal(await promised.pending, 'sent');
  let reads = 0;
  const thenable = {get then() {
    reads += 1;
    return (resolve) => resolve('adopted');
  }};
  const adopted = turnFromForeignAnswer(thenable);
  assert.equal(adopted.settled, false);
  assert.equal(await adopted.pending, 'adopted');
  assert.equal(reads, 1, 'the foreign then is read once');
});
