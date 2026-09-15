// The deterministic driver's contract: virtual time advances only after the
// current logical instant has reached causal closure.
//
// The defect these seal: the driver used to run the scheduler up to a bound
// and then settle hosts, so how much production continuation work had
// enqueued its virtual events before the bound cut the scheduler off depended
// on host execution speed. Same seed, different measuring script, different
// transcript. Host speed now has no authority over virtual-time advancement.
//
// These are directed driver witnesses on a tiny scenario, deliberately not
// the full formation simulation.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {createVirtualNetwork} from '../distributed/harness/virtual-network.js';
import {
  ScenarioHostObserver, advanceToNextInstant, closeCurrentInstant,
} from './formation-sim-quiescence.js';

const HORIZON = 1000;

function scenario() {
  const observer = new ScenarioHostObserver().enable();
  observer.begin('directed');
  const network = createVirtualNetwork({startMs: 0});
  network.registerNode('a', () => {});
  network.registerNode('b', () => {});
  const transcript = [];
  return {network, observer, transcript,
    record: (label) => transcript.push(`${label}@${network.now()}`),
    end: () => {
      observer.seal();
      observer.disable();
    }};
}

// Walk instant by instant to the horizon, exactly as the runner does.
async function walk({network, observer, owners = [], horizonMs = HORIZON}) {
  await closeCurrentInstant({network, observer, owners});
  for (let guard = 0; guard < 10000; guard += 1) {
    const at = await advanceToNextInstant({network, observer, owners, horizonMs});
    if (at === null) return;
  }
  throw new Error('instant walk did not terminate');
}

// An owner whose work spans however many promise continuations the caller
// asks for before it schedules its same-instant consequence.
function deferredChain(depth, body) {
  let chain = Promise.resolve();
  for (let turn = 0; turn < depth; turn += 1) chain = chain.then((v) => v);
  return chain.then(body);
}

async function sameInstantTranscript(depth) {
  const world = scenario();
  const {network, observer, record} = world;
  let pending = null;
  network.setTimer('a', () => {
    record('A');
    // Owner work crossing `depth` continuations, then a zero-delay event.
    pending = deferredChain(depth, () => {
      network.setTimer('a', () => record('B'), 0);
    });
  }, 10);
  network.setTimer('a', () => record('C'), 11);
  // The owner contract: this owner is busy until its chain settles.
  const owners = [() => pending || Promise.resolve()];
  await walk({network, observer, owners});
  world.end();
  return world.transcript.join(',');
}

test('1. a same-instant consequence runs before the next instant, at any chain depth',
  async () => {
    const shallow = await sameInstantTranscript(1);
    assert.equal(shallow, 'A@10,B@10,C@11',
      'the event the owner created at 10 runs before the event at 11');
    for (const depth of [4, 32, 256]) {
      assert.equal(await sameInstantTranscript(depth), shallow,
        `chain depth ${depth} does not change the virtual transcript`);
    }
  });

test('2. host load does not change the virtual transcript', async () => {
  // Ordinary host burden: synchronous work between settlement iterations and
  // inert promise plumbing. Not async-hooks instrumentation, which is a
  // stronger and semantically intrusive intervention.
  async function withLoad(loadFn) {
    const world = scenario();
    const {network, observer, record} = world;
    let pending = null;
    network.setTimer('a', () => {
      record('A');
      pending = deferredChain(8, () => {
        network.send({from: 'a', to: 'b', type: 'msg', delayMs: 0});
      });
    }, 10);
    network.registerNode('b', () => record('B'));
    network.setTimer('a', () => record('C'), 11);
    const owners = [() => {
      loadFn();
      return pending || Promise.resolve();
    }];
    await walk({network, observer, owners});
    world.end();
    return world.transcript.join(',');
  }
  const quiet = await withLoad(() => undefined);
  const heavy = await withLoad(() => {
    let burn = 0;
    for (let index = 0; index < 2e6; index += 1) burn += index % 7;
    return burn;
  });
  const plumbed = await withLoad(() => {
    let chain = Promise.resolve();
    for (let turn = 0; turn < 64; turn += 1) chain = chain.then((v) => v);
    return chain;
  });
  assert.equal(heavy, quiet, 'synchronous host load changes nothing');
  assert.equal(plumbed, quiet, 'inert promise plumbing changes nothing');
  assert.ok(quiet.includes('B@10'), 'and the same-instant delivery still lands at 10');
});

test('3. the horizon stops between instants, never inside one', async () => {
  const world = scenario();
  const {network, observer, record} = world;
  let pending = null;
  network.setTimer('a', () => {
    record('A');
    pending = deferredChain(6, () => network.setTimer('a', () => record('B'), 0));
  }, 10);
  network.setTimer('a', () => record('C'), 11);
  await walk({network, observer, owners: [() => pending || Promise.resolve()],
    horizonMs: 10});
  world.end();
  assert.equal(world.transcript.join(','), 'A@10,B@10',
    'the instant at the horizon is closed, and nothing beyond it runs');
});

test('4. an armed future timer does not hold the current instant open', async () => {
  const world = scenario();
  const {network, observer, record} = world;
  network.setTimer('a', () => {
    record('A');
    network.setTimer('a', () => record('LATE'), 10);
  }, 10);
  await walk({network, observer, horizonMs: 15});
  world.end();
  assert.equal(world.transcript.join(','), 'A@10',
    'instant 10 closes without waiting for the timer it armed for 20');
  assert.equal(network.now(), 10, 'and time did not run past the horizon');
});

test('5. an event created at the current instant joins normal co-due selection',
  async () => {
    const world = scenario();
    const {network, observer, record} = world;
    network.setTimer('a', () => {
      record('first');
      // Created while the instant is open: it must be selected by the same
      // authoritative mechanism as the event already queued at T, not
      // appended behind a frozen initial batch.
      network.setTimer('a', () => record('created'), 0);
    }, 10);
    network.setTimer('a', () => record('second'), 10);
    await walk({network, observer, horizonMs: 20});
    world.end();
    const order = world.transcript.join(',');
    assert.ok(order.startsWith('first@10'), 'the scheduler picks first by its own rule');
    assert.ok(order.includes('created@10'),
      'the causally created event runs at the same instant');
    assert.equal(order.split(',').length, 3, 'all three events run, once each');
  });
