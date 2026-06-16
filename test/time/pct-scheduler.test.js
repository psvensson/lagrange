import t from 'tap';
import {PctScheduler} from '../../src/time/pct-scheduler.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {SeededRandomSource} from '../../src/random/random-source.js';

// DT5 step 2 — the PCT scheduler unit contract. These pin the mechanism the
// schedule-search relies on: depth fixes the change-point count, a change point demotes
// the scheduled task (the move that lets the search delay one task across another), a
// seed fully determines the schedule, and within a task program order (seq) holds.

function makeTimer(id, seq, args = []) {
  return {id, seq, args};
}

t.test('depth fixes the change-point count (d-1 change points)', async (t) => {
  const random = new SeededRandomSource({seed: 7});
  t.equal(new PctScheduler({randomSource: random, depth: 1}).changePointSteps().length,
    0, 'depth 1 -> 0 change points (pure random priorities)');
  t.equal(new PctScheduler({randomSource: new SeededRandomSource({seed: 7}), depth: 2})
    .changePointSteps().length, 1, 'depth 2 -> 1 change point');
  t.equal(new PctScheduler({randomSource: new SeededRandomSource({seed: 7}), depth: 4})
    .changePointSteps().length, 3, 'depth 4 -> 3 change points');
});

t.test('a change point demotes the scheduled task so the loser then wins', async (t) => {
  // stepBudget 1 forces the single change point onto step 1, regardless of seed: the
  // step-1 winner is demoted, so the step-2 pick over the same pair returns the OTHER
  // task. Deterministic proof of demotion without depending on the seed's draw.
  const scheduler = new PctScheduler({
    randomSource: new SeededRandomSource({seed: 123}),
    depth: 2,
    stepBudget: 1,
  });
  t.same(scheduler.changePointSteps(), [1], 'change point pinned to step 1');

  const a = makeTimer('a', 1);
  const b = makeTimer('b', 2);
  const first = scheduler.pick([a, b]);
  const second = scheduler.pick([a, b]);
  t.not(second.id, first.id,
    'the step-1 winner was demoted; the other task wins step 2');
});

t.test('within one task, program order (lowest seq) holds on a priority tie', async (t) => {
  const scheduler = new PctScheduler({
    randomSource: new SeededRandomSource({seed: 5}),
    depth: 1,
    keyOf: (timer) => timer.args[0],
  });
  // Two co-due timers of the SAME task share a priority; the tie breaks to lowest seq.
  const early = makeTimer('t1', 1, ['T']);
  const late = makeTimer('t2', 2, ['T']);
  t.equal(scheduler.pick([late, early]).id, 't1',
    'same-task tie fires the earlier-scheduled (lower seq) timer first');
});

t.test('the same seed reproduces an identical schedule', async (t) => {
  const order = (seed) => {
    const fired = [];
    const scheduler = new PctScheduler({
      randomSource: new SeededRandomSource({seed}),
      depth: 2,
      stepBudget: 8,
      keyOf: (timer) => timer.args[0],
    });
    const clock = new VirtualTimeSource({scheduler});
    for (const [id, key] of [['p', 'P'], ['q', 'Q'], ['r', 'R']]) {
      clock.setTimeout(() => fired.push(id), 0, key);
    }
    clock.advance(0);
    return {fired, changePoints: scheduler.changePointSteps()};
  };
  t.same(order(42), order(42), 'seed 42 -> byte-identical firing order + change points');
});

t.test('different seeds explore different co-due orderings', async (t) => {
  // Three independent co-due timers; across a seed sweep at depth 1 (pure random
  // priorities) the search must surface more than one first-to-fire — otherwise it is
  // not exploring the permutation space.
  const firstFired = new Set();
  for (let seed = 0; seed < 30; seed += 1) {
    const fired = [];
    const scheduler = new PctScheduler({
      randomSource: new SeededRandomSource({seed}),
      depth: 1,
    });
    const clock = new VirtualTimeSource({scheduler});
    clock.setTimeout(() => fired.push('a'), 0);
    clock.setTimeout(() => fired.push('b'), 0);
    clock.setTimeout(() => fired.push('c'), 0);
    clock.advance(0);
    firstFired.add(fired[0]);
  }
  t.ok(firstFired.size >= 2,
    `co-due ordering is explored across seeds (saw ${firstFired.size} distinct firsts)`);
});

t.test('a non-seeded scheduler still returns a valid co-due pick (default RandomSource)',
  async (t) => {
    const scheduler = new PctScheduler({depth: 1});
    const picked = scheduler.pick([makeTimer('a', 1), makeTimer('b', 2)]);
    t.ok(picked && (picked.id === 'a' || picked.id === 'b'),
      'returns one of the co-due timers even with the default (unseeded) source');
  });
