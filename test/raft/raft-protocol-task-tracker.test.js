// The Raft owner's current-work completion boundary: "has the async protocol
// work this node already started finished?" A deterministic scheduler owns
// WHEN a timer fires; the node owns the continuation that firing produced,
// until it completes. Before this boundary existed, callers guessed with a
// fixed number of promise or host turns, and the guess leaked host scheduling
// into a supposedly deterministic run.
//
// These are directed unit witnesses on the owner itself. The full formation
// simulation is deliberately NOT the witness for any of them.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {RaftProtocolTaskTracker} from '../../src/raft/raft-protocol-task-tracker.js';
import {VirtualTick} from '../../src/raft/virtual-tick.js';
import LifeRaft from '../../src/raft/liferaft.js';

// A minimal deterministic time source: timers fire only when the test fires
// them, so nothing here depends on host scheduling.
function manualTimeSource() {
  const timers = new Map();
  let nextId = 0;
  const nowMs = 0;
  return {
    now: () => nowMs,
    setTimeout(fn, delayMs) {
      const id = ++nextId;
      timers.set(id, {fn, dueAt: nowMs + delayMs});
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    setInterval(fn, delayMs) {
      return this.setTimeout(fn, delayMs);
    },
    clearInterval(id) {
      timers.delete(id);
    },
    fireAll() {
      const due = [...timers.entries()];
      timers.clear();
      for (const [, timer] of due) timer.fn();
    },
    pendingCount: () => timers.size,
  };
}

function heldPromise() {
  let release = null;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return {promise, release};
}

// Whether a promise is still pending. The sentinel is deferred by a few
// microtask turns so that a promise which merely resolves through an async
// function's own continuation is not mistaken for pending; a genuinely held
// promise never settles, so no turn count decides the answer. This is test
// scaffolding, not part of any owner contract.
async function isPending(promise) {
  const sentinel = Symbol('pending');
  let deferred = Promise.resolve(sentinel);
  for (let turn = 0; turn < 8; turn += 1) deferred = deferred.then((v) => v);
  const winner = await Promise.race([promise.then(() => 'settled'), deferred]);
  return winner === sentinel;
}

test('A. an already-started timer callback keeps the owner busy; an unfired timer does not',
  async () => {
    const tracker = new RaftProtocolTaskTracker();
    const timeSource = manualTimeSource();
    const tick = new VirtualTick({}, timeSource, tracker);
    const held = heldPromise();
    tick.setTimeout('heartbeat', () => held.promise, 10);
    // Armed but not fired: this is the scheduler's work, not the node's.
    assert.equal(tracker.activeCount(), 0, 'an unfired timer starts nothing');
    // Resolves rather than hangs: an armed-but-unfired timer is scheduler
    // work, so the node has nothing outstanding.
    await tracker.awaitIdle();
    timeSource.fireAll();
    assert.equal(tracker.activeCount(), 1, 'the fired callback is owned work');
    const idle = tracker.awaitIdle();
    assert.equal(await isPending(idle), true, 'and idle waits for it');
    held.release();
    await idle;
    assert.equal(tracker.activeCount(), 0);
  });

test('B. an inbound handler held across an await keeps current-work idle pending',
  async () => {
    const tracker = new RaftProtocolTaskTracker();
    const held = heldPromise();
    // The patched data listener's shape: an async dispatch whose thenable the
    // owner tracks the moment it is produced.
    tracker.track((async () => {
      await held.promise;
      return 'dispatched';
    })());
    const idle = tracker.awaitIdle();
    assert.equal(await isPending(idle), true);
    held.release();
    await idle;
    assert.equal(tracker.activeCount(), 0);
  });

test('C. promotion entered outside the timer boundary is still owned', async () => {
  // The regression for the constructor-origin sub-boundary: the base library
  // starts promotion from paths that reach neither the virtual timer nor the
  // inbound handler, so the wrapper owns it at promote() itself.
  const tracker = new RaftProtocolTaskTracker();
  const dependency = heldPromise();
  const promotion = (async () => {
    await dependency.promise;
    return 'leader';
  })();
  // Exactly what the promote() override does, with no tick involved.
  tracker.track(promotion);
  const idle = tracker.awaitIdle();
  assert.equal(await isPending(idle), true,
    'promotion started outside the tick boundary keeps the owner busy');
  dependency.release();
  assert.equal(await promotion, 'leader');
  await idle;
  assert.equal(tracker.activeCount(), 0);
});

test('D. one task seen at two boundaries is one logical task', async () => {
  const tracker = new RaftProtocolTaskTracker();
  const timeSource = manualTimeSource();
  const tick = new VirtualTick({}, timeSource, tracker);
  const held = heldPromise();
  const promotion = (async () => {
    await held.promise;
    return 'leader';
  })();
  // Fired through the tick, which tracks the callback's result, and tracked
  // again through the promote() override: the same thenable both times.
  tick.setTimeout('promote', () => tracker.track(promotion), 10);
  timeSource.fireAll();
  assert.equal(tracker.activeCount(), 1,
    'the same task tracked twice is one active task, not two');
  const idle = tracker.awaitIdle();
  assert.equal(await isPending(idle), true);
  held.release();
  await idle;
  assert.equal(tracker.activeCount(), 0, 'and idle resolves once');
});

test('C2. the wrapper owns promotion on the real Raft node, not just in principle',
  async () => {
    // The override itself, exercised through a real LifeRaft: removing it
    // must turn this red. Test C proves the tracker's behaviour; this proves
    // the production entry point is actually wired to it.
    const timeSource = manualTimeSource();
    const raft = new LifeRaft('node-a', {
      timeSource, 'election min': 100, 'election max': 200,
    });
    assert.ok(raft.protocolTasks, 'the node owns a protocol-task tracker');
    const before = raft.protocolTasks.activeCount();
    const promotion = raft.promote();
    assert.ok(promotion && typeof promotion.then === 'function',
      'promote still returns the base library\'s own thenable');
    assert.equal(raft.protocolTasks.activeCount(), before + 1,
      'invoking promote registers exactly one owned protocol task');
    await raft.awaitCurrentProtocolIdle();
    assert.equal(raft.protocolTasks.activeCount(), 0,
      'and current-work idle resolves once promotion completes');
  });

test('a rejected task still leaves the tracker', async () => {
  const tracker = new RaftProtocolTaskTracker();
  const held = heldPromise();
  const failing = (async () => {
    await held.promise;
    throw new Error('protocol failure');
  })();
  tracker.track(failing);
  failing.catch(() => undefined);
  const idle = tracker.awaitIdle();
  assert.equal(await isPending(idle), true);
  held.release();
  await idle;
  assert.equal(tracker.activeCount(), 0, 'a failure never wedges the owner');
});
