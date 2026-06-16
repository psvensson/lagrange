import t from 'tap';
import {exploreWithPct, runPctSeed, minimizePctDepth} from
  '../distributed/harness/pct-search.js';

// DT5 step 2 — the PCT search guard. A KNOWN depth-2 race is found within a bounded seed
// budget and replays deterministically from its seed (the plan's DT5 verification).
//
// The race (two producer/consumer chains on one virtual instant):
//   X:  x1 "opens X's window"        -> schedules x2 "closes X's window"
//   Y:  y1                           -> schedules y2 "if X's window is still open, CORRUPT"
// All four fire at t=0; x1<x2 and y1<y2 are program order within each task. Corruption
// happens iff y2 observes X opened but not yet closed — order x1 < y2 < x2.
//
// Why this is genuinely DEPTH 2 (needs ONE priority change point, unreachable at depth 1):
//   With pure random priorities (depth 1) whichever task wins step 1 keeps the top
//   priority and DRAINS its whole chain first, so the only reachable orders are
//   [x1,x2,y1,y2] and [y1,y2,x1,x2] — neither corrupts. To corrupt you must let x1 win
//   step 1 (open X) and then DELAY x2 past y2 — i.e. lower X's priority after x1, which
//   is exactly what one change point does. Two ordering constraints (x1 before y1, x2
//   after y2) = depth 2.
//
// stepBudget 4 matches the four firings; the PCT lower bound for this race is
// 1/(n * stepBudget^(d-1)) = 1/(2 * 4) = 1/8 per seed, so a 100-seed budget finds it
// with overwhelming probability — a provable floor, not "hope".

function chainRaceScenario({clock}) {
  const order = [];
  const state = {windowOpen: false, corrupted: false};

  const x2 = () => {
    order.push('x2');
    state.windowOpen = false;
  };
  const x1 = () => {
    order.push('x1');
    state.windowOpen = true;
    clock.setTimeout(x2, 0, 'X'); // same instant, same task key 'X'
  };
  const y2 = () => {
    order.push('y2');
    if (state.windowOpen === true) {
      state.corrupted = true; // y2 saw X's window still open -> the depth-2 bug
    }
  };
  const y1 = () => {
    order.push('y1');
    clock.setTimeout(y2, 0, 'Y');
  };

  clock.setTimeout(x1, 0, 'X');
  clock.setTimeout(y1, 0, 'Y');
  clock.advance(0); // everything is due at t=0

  return {order, corrupted: state.corrupted};
}

const SCENARIO = Object.freeze({
  scenario: chainRaceScenario,
  invariant: (observation) => observation.corrupted === false,
  keyOf: (timer) => timer.args[0],
  stepBudget: 4,
  seedBudget: 100,
});

t.test('depth 1 (no change points) can NEVER reach the corrupting interleaving',
  async (t) => {
    const result = exploreWithPct({...SCENARIO, depth: 1});
    t.equal(result.found, false,
      'no seed corrupts at depth 1 — the chains stay fully serialized');
  });

t.test('depth 2 finds the corrupting race within the seed budget', async (t) => {
  const result = exploreWithPct({...SCENARIO, depth: 2});
  t.equal(result.found, true, 'a depth-2 schedule corrupts within 100 seeds');
  t.same(result.changePointSteps.length, 1, 'the catching schedule used 1 change point');
  t.same(result.observation.order, ['x1', 'y1', 'y2', 'x2'],
    'the catching interleaving is x1 -> y1 -> y2 -> x2 (x2 delayed past y2)');
});

t.test('the failing seed replays the identical corrupting schedule', async (t) => {
  const found = exploreWithPct({...SCENARIO, depth: 2});
  t.equal(found.found, true, 'precondition: the search found a seed');

  // Replay is just re-running the scenario at the reported seed — the whole run is a
  // pure function of (seed, depth, stepBudget).
  const replayA = runPctSeed({
    seed: found.seed,
    depth: 2,
    stepBudget: SCENARIO.stepBudget,
    keyOf: SCENARIO.keyOf,
    scenario: SCENARIO.scenario,
  });
  const replayB = runPctSeed({
    seed: found.seed,
    depth: 2,
    stepBudget: SCENARIO.stepBudget,
    keyOf: SCENARIO.keyOf,
    scenario: SCENARIO.scenario,
  });

  t.equal(replayA.observation.corrupted, true,
    'replaying the reported seed reproduces the corruption');
  t.same(replayA.observation.order, found.observation.order,
    'replay reproduces the exact firing order found by the search');
  t.same(replayA.observation.order, replayB.observation.order,
    'replay is itself deterministic (same seed -> same schedule, every time)');
  t.same(replayA.scheduler.changePointSteps(), replayB.scheduler.changePointSteps(),
    'identical change points on replay');
});

t.test('minimizePctDepth reports the race\'s TRUE depth (exactly 2)', async (t) => {
  // The PCT-native witness minimizer: search depth ascending and report the smallest
  // depth that reproduces. For this race the answer must be exactly 2 — depth 1 cannot
  // (the chains stay serialized) and depth 2 can. That number IS the diagnostic: the bug
  // needs two ordering constraints (x1 before y1, x2 after y2). minimizeDeterministicTrace
  // shrinks a node-command log and does not apply here; depth is the PCT witness's size.
  const minimal = minimizePctDepth({...SCENARIO, minDepth: 1, maxDepth: 4});

  t.equal(minimal.found, true, 'the race is reachable within the depth bound');
  t.equal(minimal.depth, 2, 'the minimal reproducing depth is exactly 2 (the bug depth)');
  t.same(minimal.notReproducedBelow, [1],
    'depth 1 did not reproduce (here structurally unreachable: the chains stay serialized)');
  t.equal(minimal.observation.corrupted, true,
    'the returned minimal witness actually corrupts');
  t.same(minimal.observation.order, ['x1', 'y1', 'y2', 'x2'],
    'the minimal witness is the canonical x1 -> y1 -> y2 -> x2 interleaving');
  t.same(minimal.changePointSteps.length, 1,
    'the minimal witness carries exactly depth-1 = 1 change point');
});

t.test('minimizePctDepth reports not-found when no depth reproduces in the bound',
  async (t) => {
    // An invariant that always holds -> no depth can violate it -> the minimizer reports
    // found:false and the full list of depths it ruled out (honest negative evidence).
    const result = minimizePctDepth({
      ...SCENARIO,
      invariant: () => true,
      minDepth: 1,
      maxDepth: 3,
    });
    t.equal(result.found, false, 'no reproducing depth within [1, 3]');
    t.equal(result.depthsTried, 3, 'all three depths were tried');
    t.same(result.notReproducedBelow, [1, 2, 3],
      'every tried depth is reported as not-reproduced (bounded negative evidence)');
  });
