import t from 'tap';
import {
  createVirtualNetwork,
  VIRTUAL_NETWORK_RECORD_KIND,
} from './virtual-network.js';
import {createCostTable} from './cost-table.js';
import {PctScheduler} from '../../../src/time/pct-scheduler.js';
import {SeededRandomSource} from '../../../src/random/random-source.js';

// DT cost-model increment — a per-node single-core cost model on the VirtualNetwork.
// A charged callback advances ONLY its owning node's virtual clock; concurrent work on
// that node contends (serial, the event is deferred); other nodes proceed in parallel;
// and the default (no cost table) is byte-for-byte the un-costed behavior.

t.test('a charged callback advances only its own node clock; global clock is untouched',
  async (t) => {
    const costTable = createCostTable({'spike.op': {fixedMs: 100, perUnitMs: 0}});
    const net = createVirtualNetwork({costTable});
    net.registerNode('A');

    const firings = [];
    // First A-owned timer at dueAt 0 charges 100ms of single-core work to A.
    net.setTimer('A', (api) => {
      api.networkTimeSource('A').charge('spike.op', 0);
      firings.push({type: 'first', nodeNow: net.nodeNow('A'), now: net.now()});
    }, 0);
    // Second A-owned timer at dueAt 10 — A's core is busy until 100, so it must defer.
    net.setTimer('A', () => {
      firings.push({type: 'second', nodeNow: net.nodeNow('A'), now: net.now()});
    }, 10);

    net.run();

    // (a) After the first fires, only A's logical clock advanced to 100; global is < 100.
    t.equal(firings[0].type, 'first', 'first timer fired first');
    t.equal(firings[0].nodeNow, 100, 'A\'s clock advanced to the charge (100)');
    t.ok(firings[0].now < 100, `global clock still < 100 (was ${firings[0].now})`);
    t.equal(firings[0].now, 0, 'global clock is still 0 — only A advanced');
    t.equal(net.nodeBusyUntil('A'), 100, 'A is busy until 100 after the charge');

    // (b) The second timer (due 10) was DEFERRED and fired at virtual instant 100.
    const firedRecords = net.getRecords()
      .filter((rec) => rec.kind === VIRTUAL_NETWORK_RECORD_KIND.FIRED);
    t.equal(firedRecords.length, 2, 'both timers fired exactly once');
    t.equal(firedRecords[1].timeMs, 100,
      'the second timer was deferred from dueAt 10 to busyUntil 100');
    t.equal(firings[1].type, 'second', 'second timer fired second');
  });

t.test('default (no cost table) is inert — second timer fires at 10, no clock divergence',
  async (t) => {
    const net = createVirtualNetwork({costTable: null});
    net.registerNode('A');

    const firings = [];
    net.setTimer('A', (api) => {
      // charge is a no-op without a cost table; this must not move any clock.
      api.networkTimeSource('A').charge('spike.op', 0);
      firings.push({type: 'first', nodeNow: net.nodeNow('A'), now: net.now()});
    }, 0);
    net.setTimer('A', () => {
      firings.push({type: 'second', nodeNow: net.nodeNow('A'), now: net.now()});
    }, 10);

    net.run();

    // A's clock never diverges from global time; charge had zero effect.
    t.equal(firings[0].nodeNow, firings[0].now, 'A clock == global at the first firing');
    t.equal(firings[1].nodeNow, firings[1].now, 'A clock == global at the second firing');
    t.ok(net.nodeBusyUntil('A') <= net.nodeNow('A'),
      'busyUntil never advanced past the node clock (charge was a no-op)');

    const firedRecords = net.getRecords()
      .filter((rec) => rec.kind === VIRTUAL_NETWORK_RECORD_KIND.FIRED);
    t.equal(firedRecords.length, 2, 'both timers fired');
    t.equal(firedRecords[1].timeMs, 10,
      'the second timer fires at its own dueAt 10 (not deferred)');
  });

t.test('other nodes proceed in parallel while one node is saturated', async (t) => {
  const costTable = createCostTable({'spike.op': {fixedMs: 100, perUnitMs: 0}});
  const net = createVirtualNetwork({costTable});
  net.registerNode('A');
  net.registerNode('B');

  const observed = [];
  net.setTimer('A', (api) => {
    api.networkTimeSource('A').charge('spike.op', 0);
  }, 0);
  // B-owned timer due 10 must NOT be blocked by A's saturation — it fires at 10.
  net.setTimer('B', () => {
    observed.push({nodeNowB: net.nodeNow('B'), nodeNowA: net.nodeNow('A')});
  }, 10);

  net.run();

  t.equal(observed.length, 1, 'B fired');
  t.equal(observed[0].nodeNowB, 10, 'B\'s clock is its own dueAt 10 — unaffected by A');
  t.equal(net.nodeBusyUntil('A'), 100, 'A is still saturated to 100');
});

t.test('per-unit cost scales the charge with input size', async (t) => {
  const costTable = createCostTable({'parse.rows': {fixedMs: 5, perUnitMs: 2}});
  const net = createVirtualNetwork({costTable});
  net.registerNode('A');
  net.setTimer('A', (api) => {
    api.networkTimeSource('A').charge('parse.rows', 10); // 5 + 2*10 = 25
  }, 0);
  net.run();
  t.equal(net.nodeBusyUntil('A'), 25, 'fixedMs + perUnitMs*inputSize, rounded');
});

t.test('unknown op keys cost 0 (additive/safe)', async (t) => {
  const costTable = createCostTable({'spike.op': {fixedMs: 100, perUnitMs: 0}});
  const net = createVirtualNetwork({costTable});
  net.registerNode('A');
  net.setTimer('A', (api) => {
    api.networkTimeSource('A').charge('not.modeled', 999);
  }, 0);
  net.run();
  t.equal(net.nodeBusyUntil('A'), 0, 'an un-modeled op charges nothing');
  t.equal(net.nodeNow('A'), 0, 'and the node clock does not advance');
});

t.test('a charged scenario under a PctScheduler is deterministic across runs', async (t) => {
  const buildAndRun = () => {
    const scheduler = new PctScheduler({
      random: new SeededRandomSource({seed: 4242}),
      depth: 3,
      stepBudget: 16,
    });
    const costTable = createCostTable({'spike.op': {fixedMs: 100, perUnitMs: 0}});
    const net = createVirtualNetwork({scheduler, costTable});
    net.registerNode('A');
    net.registerNode('B');
    net.registerNode('hub', () => {});

    // Co-due charged work plus cross-node messages, so the scheduler has a real race.
    net.setTimer('A', (api) => api.networkTimeSource('A').charge('spike.op', 0), 0);
    net.setTimer('B', (api) => api.networkTimeSource('B').charge('spike.op', 0), 0);
    net.send({from: 'A', to: 'hub', type: 'a_msg', delayMs: 0});
    net.send({from: 'B', to: 'hub', type: 'b_msg', delayMs: 0});
    net.send({from: 'A', to: 'hub', type: 'a_late', delayMs: 50});
    net.run();
    return net.getRecords();
  };

  const first = buildAndRun();
  const second = buildAndRun();
  t.same(second, first,
    'identical seed + cost table replays the identical record stream');
});
