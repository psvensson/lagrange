// Construction contract for the Lagrange LifeRaft wrapper.
//
// The invariant this seals is strong and newly earned: WITH AN INJECTED TIME
// SOURCE, NO LIFERAFT PROTOCOL TIMER IS EVER ARMED ON THE HOST CLOCK.
//
// It used not to hold. Base LifeRaft runs its whole initialization from its
// constructor, so an election timer was armed on the real tick-tock Tick
// before the wrapper could swap in the virtual one; the wrapper then cleared
// and re-armed. Thirty such real timers were created in one five-node
// scenario and one of them actually fired, which let wall-clock time decide
// deterministic scheduling. The repair defers base initialization behind
// timer ownership instead of racing it.
import assert from 'node:assert/strict';
import {createHook} from 'node:async_hooks';
import {test} from 'node:test';

import LifeRaft from '../../src/raft/liferaft.js';

const ELECTION_MIN = 100;
const ELECTION_MAX = 200;

function virtualTimeSource() {
  const timers = new Map();
  let nextId = 0;
  const armed = [];
  return {
    armed,
    now: () => 0,
    setTimeout(fn, delayMs) {
      const id = ++nextId;
      timers.set(id, fn);
      armed.push({id, delayMs});
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
    charge() {},
  };
}

// Count host Timeout resources created while a body runs. Metadata only: no
// Error, no stack, no logging inside init.
function countHostTimeouts(body) {
  let created = 0;
  const hook = createHook({
    init(_asyncId, type) {
      if (type === 'Timeout') created += 1;
    },
  });
  hook.enable();
  try {
    body();
  } finally {
    hook.disable();
  }
  return created;
}

test('1. an injected time source arms no host timer during construction', () => {
  const timeSource = virtualTimeSource();
  let raft = null;
  const hostTimers = countHostTimeouts(() => {
    raft = new LifeRaft('node-a', {
      timeSource, 'election min': ELECTION_MIN, 'election max': ELECTION_MAX,
    });
  });
  assert.equal(hostTimers, 0,
    'construction armed a real host timer; the deterministic clock must own ' +
    'every protocol timer');
  assert.ok(timeSource.armed.length > 0,
    'and the election timer is represented on the injected substrate');
  assert.ok(raft.timers && raft.timers.timeSource === timeSource,
    'the node is left holding the virtual tick, not the real one');
});

test('2. without a time source the production Tick is untouched', () => {
  let raft = null;
  const hostTimers = countHostTimeouts(() => {
    raft = new LifeRaft('node-b', {
      'election min': ELECTION_MIN, 'election max': ELECTION_MAX,
    });
  });
  assert.ok(hostTimers > 0,
    'the ordinary path still arms its heartbeat on the host clock');
  assert.equal(raft.timers.timeSource, undefined,
    'and still holds the real tick-tock Tick');
  raft.end();
});

test('3 and 4. base initialization and a subclass override each run exactly once', () => {
  let initializeCalls = 0;
  // Base LifeRaft dispatches to an OPTIONAL initialize(options, callback)
  // hook and then continues through the callback; there is no base method to
  // delegate to, so the override calls the continuation it is handed.
  class RuntimeRaft extends LifeRaft {
    initialize(options, callback) {
      initializeCalls += 1;
      return callback();
    }
  }
  const timeSource = virtualTimeSource();
  const raft = new RuntimeRaft('node-c', {
    timeSource, 'election min': ELECTION_MIN, 'election max': ELECTION_MAX,
  });
  assert.equal(initializeCalls, 1,
    'deferring base initialization must not run it twice, and must still ' +
    'dispatch to the runtime subclass');
  // One initial arm, not one per attempt.
  assert.equal(timeSource.armed.length, 1,
    'exactly one protocol timer is armed by initialization');
  const dataListeners = raft.listenerCount('data');
  assert.equal(dataListeners, 1,
    'the inbound handler is patched once, after base initialization created it');
});

test('5. the first deterministic election timeout is drawn from the seeded source', () => {
  const draws = [];
  const randomSource = {
    random() {
      draws.push(draws.length);
      // A fixed draw makes the resulting delay predictable.
      return 0.5;
    },
  };
  const timeSource = virtualTimeSource();
  const raft = new LifeRaft('node-d', {
    timeSource, randomSource,
    'election min': ELECTION_MIN, 'election max': ELECTION_MAX,
  });
  assert.ok(draws.length > 0,
    'the seeded source decided the first election timeout, not Math.random');
  const [first] = timeSource.armed;
  assert.ok(first, 'an election timer was armed on the virtual substrate');
  assert.ok(first.delayMs >= ELECTION_MIN && first.delayMs <= ELECTION_MAX,
    `the armed delay ${first.delayMs} lies in the configured election window`);
  assert.ok(raft.protocolTasks, 'and the node still owns its protocol tracker');
});
