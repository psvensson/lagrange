import t from 'tap';
import {
  createVirtualNetwork,
  virtualNetworkLinkKey,
  VIRTUAL_NETWORK_NODE_STATE,
  VIRTUAL_NETWORK_DROP_REASON,
  VIRTUAL_NETWORK_RECORD_KIND,
} from '../virtual-network.js';
import {PctScheduler} from '../../../../src/time/pct-scheduler.js';
import {SeededRandomSource} from '../../../../src/random/random-source.js';

// DT6 step 1 — mechanics of the multi-node virtual network: delivery order is (dueAt, seq)
// with no scheduler, the PCT seam reorders ONLY the co-due set, per-node clocks track/freeze
// correctly, and partition/kill drop messages instead of delivering them.

t.test('links are undirected (partition A<->B is order-independent)', async (t) => {
  t.equal(
    virtualNetworkLinkKey('a', 'b'),
    virtualNetworkLinkKey('b', 'a'),
    'link key is the same regardless of argument order',
  );
});

t.test('delivers messages in (dueAt, seq) order with no scheduler', async (t) => {
  const net = createVirtualNetwork();
  const delivered = [];
  net.registerNode('hub', (message) => delivered.push(message.type));
  net.registerNode('a');
  net.registerNode('b');

  // Send out of due-order: m_late (delay 10) enqueued first, then two co-due (delay 0).
  net.send({from: 'a', to: 'hub', type: 'm_late', delayMs: 10});
  net.send({from: 'a', to: 'hub', type: 'm_early1', delayMs: 0});
  net.send({from: 'b', to: 'hub', type: 'm_early2', delayMs: 0});

  const result = net.run();
  t.same(delivered, ['m_early1', 'm_early2', 'm_late'],
    'earliest dueAt wins; co-due ties break by send order (seq)');
  t.equal(result.remaining, 0, 'queue drains to idle');
  t.equal(result.steps, 3, 'three deliveries');
  t.equal(net.now(), 10, 'global clock advances to the last delivery');
});

t.test('cross-instant order is causality — a scheduler never reorders across instants',
  async (t) => {
    // Even a scheduler that always returns the LAST co-due event cannot pull a later-due
    // message ahead of an earlier-due one: pickNext only ever offers the earliest instant.
    const lastPicker = {pick: (events) => events[events.length - 1]};
    const net = createVirtualNetwork({scheduler: lastPicker});
    const delivered = [];
    net.registerNode('hub', (message) => delivered.push(message.type));
    net.registerNode('a');

    net.send({from: 'a', to: 'hub', type: 'first', delayMs: 0});
    net.send({from: 'a', to: 'hub', type: 'second', delayMs: 5});
    net.run();
    t.same(delivered, ['first', 'second'],
      'the t=5 message is never delivered before the t=0 message');
  });

t.test('the scheduler reorders the co-due set', async (t) => {
  // Two co-due messages; a scheduler that prefers the higher seq flips their order.
  const reverse = {pick: (events) => events[events.length - 1]};
  const net = createVirtualNetwork({scheduler: reverse});
  const delivered = [];
  net.registerNode('hub', (message) => delivered.push(message.type));
  net.registerNode('a');
  net.registerNode('b');

  net.send({from: 'a', to: 'hub', type: 'alpha', delayMs: 0});
  net.send({from: 'b', to: 'hub', type: 'beta', delayMs: 0});
  net.run();
  t.same(delivered, ['beta', 'alpha'],
    'co-due messages are delivered in the scheduler-chosen order');
});

t.test('a scheduler returning a foreign event is ignored (causality guard holds)',
  async (t) => {
    // A buggy scheduler that returns an event NOT in the offered co-due set must not be
    // honored — pickNext falls back to (dueAt, seq) order rather than deliver a phantom.
    const foreign = {seq: 999, dueAt: 0, payload: {}};
    const buggy = {pick: () => foreign};
    const net = createVirtualNetwork({scheduler: buggy});
    const delivered = [];
    net.registerNode('hub', (message) => delivered.push(message.type));
    net.registerNode('a');

    net.send({from: 'a', to: 'hub', type: 'real', delayMs: 0});
    net.run();
    t.same(delivered, ['real'],
      'the real co-due event is delivered; the foreign pick is rejected');
  });

t.test('a partitioned link drops the message instead of delivering it', async (t) => {
  const net = createVirtualNetwork();
  const delivered = [];
  net.registerNode('a');
  net.registerNode('b', (message) => delivered.push(message.type));

  net.partition('a', 'b');
  net.send({from: 'a', to: 'b', type: 'blocked', delayMs: 0});
  net.run();
  t.same(delivered, [], 'nothing is delivered across the partitioned link');
  const dropped = net.getRecords().filter((r) =>
    r.kind === VIRTUAL_NETWORK_RECORD_KIND.DROPPED);
  t.equal(dropped.length, 1, 'one drop recorded');
  t.equal(dropped[0].reason, VIRTUAL_NETWORK_DROP_REASON.LINK_PARTITIONED,
    'drop reason is the partition');

  // Healing the link lets a subsequent message through.
  net.heal('a', 'b');
  net.send({from: 'a', to: 'b', type: 'allowed', delayMs: 0});
  net.run();
  t.same(delivered, ['allowed'], 'after heal the link delivers again');
});

t.test('a message to a stopped node is dropped', async (t) => {
  const net = createVirtualNetwork();
  const delivered = [];
  net.registerNode('a');
  net.registerNode('b', (message) => delivered.push(message.type));

  net.killNode('b');
  net.send({from: 'a', to: 'b', type: 'lost', delayMs: 0});
  net.run();
  t.same(delivered, [], 'a stopped node receives nothing');
  const dropped = net.getRecords().filter((r) =>
    r.kind === VIRTUAL_NETWORK_RECORD_KIND.DROPPED);
  t.equal(dropped[0].reason, VIRTUAL_NETWORK_DROP_REASON.NODE_STOPPED,
    'drop reason is the stopped node');
});

t.test('per-node clock tracks global time while running and freezes when stopped',
  async (t) => {
    const net = createVirtualNetwork();
    net.registerNode('a');
    net.registerNode('b', () => {});

    net.send({from: 'a', to: 'b', type: 'ping', delayMs: 7});
    net.run();
    t.equal(net.now(), 7, 'global clock at 7');
    t.equal(net.nodeNow('b'), 7, 'an active receiver advanced to the delivery time');

    // Stop b, then advance global time via an a-owned timer; b's clock must not move.
    net.killNode('b');
    net.setTimer('a', () => {}, 20);
    net.run();
    t.equal(net.now(), 27, 'global clock advanced to 27');
    t.equal(net.nodeState('b'), VIRTUAL_NETWORK_NODE_STATE.STOPPED, 'b is stopped');
    t.equal(net.nodeNow('b'), 7, 'a stopped node\'s clock is frozen at its last activity');
  });

t.test('timers fire on their owning node and can send messages', async (t) => {
  const net = createVirtualNetwork();
  const delivered = [];
  net.registerNode('a');
  net.registerNode('b', (message) => delivered.push(message.type));

  net.setTimer('a', (netApi) => {
    netApi.send({from: 'a', to: 'b', type: 'fromTimer', delayMs: 0});
  }, 5);
  net.run();
  t.same(delivered, ['fromTimer'], 'a timer fired and its message was delivered');
  t.equal(net.now(), 5, 'clock at the timer instant');
});

t.test('registering an unknown send target throws', async (t) => {
  const net = createVirtualNetwork();
  net.registerNode('a');
  t.throws(() => net.send({from: 'a', to: 'ghost', type: 'x'}),
    /unknown node/, 'sending to an unregistered node is a loud error');
});

t.test('with no scheduler the network is byte-identical to a plain priority queue',
  async (t) => {
    // Same scenario, once with no scheduler and once with a PctScheduler that is handed a
    // seed but, on a fully serial (one-co-due-at-a-time) workload, has nothing to reorder.
    function fanIn(net) {
      const order = [];
      net.registerNode('hub', (m) => order.push(m.type));
      net.registerNode('s1');
      net.registerNode('s2');
      net.send({from: 's1', to: 'hub', type: 'p', delayMs: 1});
      net.send({from: 's2', to: 'hub', type: 'q', delayMs: 2});
      net.send({from: 's1', to: 'hub', type: 'r', delayMs: 3});
      net.run();
      return order;
    }
    const plain = fanIn(createVirtualNetwork());
    const scheduler = new PctScheduler({
      randomSource: new SeededRandomSource({seed: 1}),
      depth: 2,
      stepBudget: 8,
    });
    const seeded = fanIn(createVirtualNetwork({scheduler}));
    t.same(seeded, plain,
      'distinct due-instants leave nothing to reorder — identical to the default order');
  });

// DT6 step 2 — the per-node TimeSource adapter (networkTimeSource) + the bounded drain
// (run({untilMs})) that together let a real state machine seamed on a DT4 TimeSource run on
// the network. These verify the adapter mirrors VirtualTimeSource semantics on the queue.

t.test('networkTimeSource.setTimeout schedules a node-owned timer that fires in run()',
  async (t) => {
    const net = createVirtualNetwork();
    const fired = [];
    net.registerNode('a');
    net.registerNode('b', (message) => fired.push(message.type));
    const clock = net.networkTimeSource('a');

    clock.setTimeout(() => {
      net.send({from: 'a', to: 'b', type: 'fromAdapterTimer', delayMs: 0});
    }, 5);
    net.run();
    t.same(fired, ['fromAdapterTimer'], 'the adapter timer fired and sent over the network');
    t.equal(net.now(), 5, 'clock advanced to the adapter timer instant');
  });

t.test('networkTimeSource.clearTimeout cancels a pending timer', async (t) => {
  const net = createVirtualNetwork();
  net.registerNode('a');
  let fired = false;
  const clock = net.networkTimeSource('a');

  const handle = clock.setTimeout(() => {
    fired = true;
  }, 10);
  clock.clearTimeout(handle);
  net.run();
  t.equal(fired, false, 'a cleared timer never fires');
  t.equal(net.pendingEventCount(), 0, 'and it is removed from the queue');
});

t.test('networkTimeSource.setInterval re-arms until cleared', async (t) => {
  const net = createVirtualNetwork();
  net.registerNode('a');
  const ticks = [];
  const clock = net.networkTimeSource('a');

  const handle = clock.setInterval(() => {
    ticks.push(net.now());
  }, 10);
  net.run({untilMs: 35});
  t.same(ticks, [10, 20, 30], 'the interval fired every 10ms within the bounded window');

  clock.clearInterval(handle);
  net.run({untilMs: 100});
  t.same(ticks, [10, 20, 30], 'after clearInterval it stops re-arming');
});

t.test('an interval cleared from inside its own callback fires exactly once', async (t) => {
  const net = createVirtualNetwork();
  net.registerNode('a');
  let count = 0;
  const clock = net.networkTimeSource('a');

  // Re-arm happens before the callback runs (VirtualTimeSource semantics); clearing inside
  // the callback must cancel that already-queued next occurrence.
  let handle = null;
  handle = clock.setInterval(() => {
    count += 1;
    clock.clearInterval(handle);
  }, 10);
  net.run({untilMs: 100});
  t.equal(count, 1, 'clearing from the callback cancels the re-armed occurrence');
});

t.test('a 0ms interval clamps to 1ms instead of spinning', async (t) => {
  const net = createVirtualNetwork();
  net.registerNode('a');
  let count = 0;
  const clock = net.networkTimeSource('a');

  clock.setInterval(() => {
    count += 1;
  }, 0);
  net.run({untilMs: 3});
  t.equal(count, 4,
    'a zero-delay interval fires at t=0 then once per clamped 1ms step (no infinite loop)');
});

t.test('networkTimeSource.now() tracks global time while running and freezes when stopped',
  async (t) => {
    const net = createVirtualNetwork();
    net.registerNode('a');
    const clock = net.networkTimeSource('a');

    net.setTimer('a', () => {}, 7);
    net.run();
    t.equal(clock.now(), 7, 'a running node\'s adapter clock follows global time');

    net.killNode('a');
    net.setTimer('a', () => {}, 5); // a stopped node\'s timer is dropped, but advance global
    const before = net.now();
    net.run({untilMs: before + 20});
    t.equal(net.now(), before + 20, 'global clock advanced');
    t.equal(clock.now(), 7, 'a stopped node\'s adapter clock is frozen at its last activity');
  });

t.test('run({untilMs}) stops at the boundary and advances the clock; a later run resumes',
  async (t) => {
    const net = createVirtualNetwork();
    const delivered = [];
    net.registerNode('a');
    net.registerNode('b', (message) => delivered.push(message.type));

    net.send({from: 'a', to: 'b', type: 'early', delayMs: 5});
    net.send({from: 'a', to: 'b', type: 'late', delayMs: 30});

    const first = net.run({untilMs: 20});
    t.same(delivered, ['early'], 'only the event due within the bound fired');
    t.equal(first.remaining, 1, 'the later event is still pending');
    t.equal(net.now(), 20, 'the clock advanced to the bound even past the last firing');

    net.run(); // unbounded: drain the rest
    t.same(delivered, ['early', 'late'], 'the deferred event fires on the next run');
    t.equal(net.now(), 30, 'the clock advanced to the final delivery');
  });
