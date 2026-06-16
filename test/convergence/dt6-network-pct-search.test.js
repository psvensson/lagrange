import t from 'tap';
import {exploreWithPct, runPctSeed, minimizePctDepth} from
  '../distributed/harness/pct-search.js';
import {createVirtualNetwork} from '../distributed/harness/virtual-network.js';

// DT6 step 1 — the multi-node lift of the DT5 PCT search. DT5 caught a race among co-due
// timers on ONE clock; this guard catches a race in cross-node MESSAGE DELIVERY across a
// multi-node VirtualNetwork, using the SAME search layer (exploreWithPct / runPctSeed /
// minimizePctDepth — unchanged). The scenario builds a VirtualNetwork wired to the PCT
// scheduler the search hands it, so a seed fully determines the delivery interleaving.
//
// The race (a coordinator C with a guarded window; two senders A and B):
//   A -> C "open"  : C opens its window, then C sends ITSELF "close" (same instant, chain A)
//   B -> C "probe" : if C's window is still open, CORRUPT (chain B)
// open, probe (and then close) all come due at t=0. Corruption happens iff probe is
// delivered to C AFTER open opened the window but BEFORE close shut it: order open < probe
// < close. The PCT task key is the CHAIN carried in the payload, so a change point can
// demote chain A after "open" fires and delay "close" PAST "probe" — the cross-node
// delivery reorder a pure-random pass cannot force.
//
// Why this is genuinely DEPTH 2 (one change point; unreachable at depth 1):
//   At depth 1 priorities never change, so whichever chain wins the first scheduling step
//   keeps the top priority and DRAINS its whole chain first. If A wins, open then close run
//   back-to-back (window shut) before probe; if B wins, probe runs while the window is shut.
//   Neither corrupts. To corrupt you must let "open" win step 1 (open the window) and THEN
//   demote chain A so "close" loses to "probe" — exactly one priority-change point. Two
//   ordering constraints (open before probe, close after probe) = depth 2.
//
// stepBudget 4 covers the firings; the PCT floor is 1/(n * stepBudget^(d-1)) = 1/(2*4) =
// 1/8 per seed, so a 100-seed budget finds it with overwhelming probability — a provable
// floor on a DISTRIBUTED delivery race, not "hope".

function networkRaceScenario({scheduler, random}) {
  const net = createVirtualNetwork({scheduler, random});
  const order = [];
  const state = {windowOpen: false, corrupted: false};

  net.registerNode('A');
  net.registerNode('B');
  net.registerNode('C', (message, netApi) => {
    order.push(message.type);
    if (message.type === 'open') {
      state.windowOpen = true;
      // C schedules its own close on the SAME instant, tagged chain 'A' so the PCT task
      // key groups open+close into one chain (the producer/consumer chain semantics).
      netApi.send({from: 'C', to: 'C', type: 'close', payload: {chain: 'A'}, delayMs: 0});
    } else if (message.type === 'close') {
      state.windowOpen = false;
    } else if (message.type === 'probe') {
      if (state.windowOpen === true) {
        state.corrupted = true; // probe saw C's window still open -> the depth-2 bug
      }
    }
  });

  net.send({from: 'A', to: 'C', type: 'open', payload: {chain: 'A'}, delayMs: 0});
  net.send({from: 'B', to: 'C', type: 'probe', payload: {chain: 'B'}, delayMs: 0});
  net.run();

  return {order, corrupted: state.corrupted};
}

const SCENARIO = Object.freeze({
  scenario: networkRaceScenario,
  invariant: (observation) => observation.corrupted === false,
  keyOf: (event) => event.payload.chain,
  stepBudget: 4,
  seedBudget: 100,
});

t.test('depth 1 (no change points) can NEVER reach the corrupting delivery order',
  async (t) => {
    const result = exploreWithPct({...SCENARIO, depth: 1});
    t.equal(result.found, false,
      'no seed corrupts at depth 1 — each chain drains fully before the other');
  });

t.test('depth 2 finds the cross-node delivery race within the seed budget', async (t) => {
  const result = exploreWithPct({...SCENARIO, depth: 2});
  t.equal(result.found, true, 'a depth-2 schedule corrupts within 100 seeds');
  t.same(result.changePointSteps.length, 1, 'the catching schedule used 1 change point');
  t.same(result.observation.order, ['open', 'probe', 'close'],
    'the catching interleaving is open -> probe -> close (close delayed past probe)');
});

t.test('the failing seed replays the identical cross-node interleaving', async (t) => {
  const found = exploreWithPct({...SCENARIO, depth: 2});
  t.equal(found.found, true, 'precondition: the search found a seed');

  // Replay is just re-running the scenario at the reported seed — the whole multi-node run
  // is a pure function of (seed, depth, stepBudget).
  const replay = () => runPctSeed({
    seed: found.seed,
    depth: 2,
    stepBudget: SCENARIO.stepBudget,
    keyOf: SCENARIO.keyOf,
    scenario: SCENARIO.scenario,
  });
  const replayA = replay();
  const replayB = replay();

  t.equal(replayA.observation.corrupted, true,
    'replaying the reported seed reproduces the corruption');
  t.same(replayA.observation.order, found.observation.order,
    'replay reproduces the exact delivery order found by the search');
  t.same(replayA.observation.order, replayB.observation.order,
    'replay is itself deterministic (same seed -> same delivery interleaving, every time)');
  t.same(replayA.scheduler.changePointSteps(), replayB.scheduler.changePointSteps(),
    'identical change points on replay');
});

t.test('minimizePctDepth reports the race\'s TRUE depth (exactly 2)', async (t) => {
  // The PCT-native witness minimizer over the DISTRIBUTED scenario: the smallest depth that
  // reproduces is the bug's true ordering depth. For this race it must be exactly 2 — depth
  // 1 cannot (chains stay serialized), depth 2 can.
  const minimal = minimizePctDepth({...SCENARIO, minDepth: 1, maxDepth: 4});

  t.equal(minimal.found, true, 'the race is reachable within the depth bound');
  t.equal(minimal.depth, 2, 'the minimal reproducing depth is exactly 2 (the bug depth)');
  t.same(minimal.notReproducedBelow, [1],
    'depth 1 did not reproduce (here: each chain drains before the other)');
  t.equal(minimal.observation.corrupted, true, 'the returned minimal witness corrupts');
  t.same(minimal.observation.order, ['open', 'probe', 'close'],
    'the minimal witness is the canonical open -> probe -> close interleaving');
  t.same(minimal.changePointSteps.length, 1,
    'the minimal witness carries exactly depth-1 = 1 change point');
});
