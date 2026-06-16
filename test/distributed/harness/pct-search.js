/**
 * PCT schedule-search harness (DT5 step 2) — the seed-iterating search layer on top of
 * the DT4 VirtualTimeSource + DT5 SeededRandomSource + PctScheduler seams.
 *
 * A scenario is a pure-ish function {clock, scheduler, random, seed} -> observation: it
 * arms its timers on the supplied (PCT-driven) clock, advances that clock to drain them,
 * and returns whatever the invariant needs to judge the run. exploreWithPct iterates
 * seeds, runs the scenario under a fresh PCT schedule per seed, and stops at the first
 * seed whose observation violates the invariant. Because the whole run is a pure
 * function of the seed (seed -> RandomSource stream -> change points + priorities ->
 * firing order), a reported seed REPLAYS the identical failing schedule — re-run
 * runPctSeed with that seed.
 */

import {VirtualTimeSource} from '../../../src/time/time-source.js';
import {SeededRandomSource} from '../../../src/random/random-source.js';
import {PctScheduler} from '../../../src/time/pct-scheduler.js';

const PCT_SEARCH_DEFAULT_DEPTH = 2;
const PCT_SEARCH_DEFAULT_STEP_BUDGET = 100;
const PCT_SEARCH_DEFAULT_SEED_BUDGET = 200;
const PCT_SEARCH_DEFAULT_MIN_DEPTH = 1;
const PCT_SEARCH_DEFAULT_MAX_DEPTH = 8;
const PCT_SEARCH_NUM_ZERO = 0;
const PCT_SEARCH_NUM_ONE = 1;

/**
 * Run one PCT schedule for a single seed and return the scenario's observation plus the
 * scheduler (for change-point inspection). Deterministic: same seed -> same result.
 * @param {Object} options
 * @param {number} options.seed
 * @param {number} options.depth - PCT bug depth d (d-1 change points).
 * @param {number} options.stepBudget - change-point placement ceiling.
 * @param {Function} [options.keyOf] - timer -> task key (PctScheduler grouping).
 * @param {Function} options.scenario - ({clock, scheduler, random, seed}) -> observation.
 * @return {{seed: number, observation: *, scheduler: PctScheduler}}
 */
function runPctSeed({seed, depth, stepBudget, keyOf, scenario}) {
  const random = new SeededRandomSource({seed});
  const scheduler = new PctScheduler({
    randomSource: random,
    depth,
    stepBudget,
    keyOf,
  });
  const clock = new VirtualTimeSource({scheduler});
  const observation = scenario({clock, scheduler, random, seed});
  return {seed, observation, scheduler};
}

/**
 * Iterate seeds, running the scenario under a PCT schedule each, until the invariant is
 * violated or the seed budget is exhausted.
 * @param {Object} options
 * @param {Function} options.scenario - see runPctSeed.
 * @param {Function} options.invariant - observation -> boolean; true === GOOD run. A
 *   thrown error counts as a violation (the bug surfaced as a crash).
 * @param {number} [options.depth=2]
 * @param {number} [options.stepBudget=100]
 * @param {Function} [options.keyOf]
 * @param {number} [options.seedBudget=200] - how many seeds to try.
 * @param {number} [options.seedStart=0] - first seed.
 * @return {Object} {found, seed?, seedsTried, observation?, changePointSteps?}
 */
function exploreWithPct({
  scenario,
  invariant,
  depth = PCT_SEARCH_DEFAULT_DEPTH,
  stepBudget = PCT_SEARCH_DEFAULT_STEP_BUDGET,
  keyOf,
  seedBudget = PCT_SEARCH_DEFAULT_SEED_BUDGET,
  seedStart = PCT_SEARCH_NUM_ZERO,
}) {
  for (let i = PCT_SEARCH_NUM_ZERO; i < seedBudget; i += PCT_SEARCH_NUM_ONE) {
    const seed = seedStart + i;
    const {observation, scheduler} = runPctSeed({
      seed,
      depth,
      stepBudget,
      keyOf,
      scenario,
    });
    let good;
    try {
      good = invariant(observation) === true;
    } catch {
      good = false;
    }
    if (!good) {
      return Object.freeze({
        found: true,
        seed,
        seedsTried: i + PCT_SEARCH_NUM_ONE,
        observation,
        changePointSteps: scheduler.changePointSteps(),
      });
    }
  }
  return Object.freeze({
    found: false,
    seedsTried: seedBudget,
  });
}

/**
 * Find the MINIMAL PCT bug depth at which the scenario violates the invariant — the
 * PCT-native witness minimizer (the unfulfilled half of the DT5 step-3 clause "record the
 * seed for exact replay + minimize"). minimizeDeterministicTrace shrinks a node-command
 * log; it does not fit the PCT search, whose witness is (seed, depth, change-points). The
 * PCT analog is depth minimization: because a depth-d schedule carries exactly d-1 change
 * points, the smallest depth that still reproduces is the smallest witness — and it is
 * PCT's headline diagnostic, the bug's TRUE ordering depth (the number of independent
 * ordering constraints the race needs). Coyote/P# report exactly this number.
 *
 * It searches depth ascending from minDepth and returns the first depth whose bounded
 * seed search finds the bug, together with that depth's first failing seed (the minimal
 * witness, since exploreWithPct scans seeds in order). A non-finding depth below the
 * answer is BOUNDED evidence that fewer ordering constraints do not trigger it within the
 * seed budget — NOT a proof of impossibility (absence within a budget proves nothing;
 * structural unreachability, like this guard's serialized chains, is a separate argument).
 * Hence the field is notReproducedBelow, not "unreachable".
 *
 * @param {Object} options - all exploreWithPct options EXCEPT depth, plus:
 * @param {number} [options.minDepth=1] - lowest depth to try.
 * @param {number} [options.maxDepth=8] - highest depth to try before giving up.
 * @return {Object} {found, depth?, seed?, seedsTried?, observation?, changePointSteps?,
 *   depthsTried, notReproducedBelow} — notReproducedBelow lists the depths that did NOT
 *   reproduce within the seed budget (bounded negative evidence, not a proof).
 */
function minimizePctDepth({
  minDepth = PCT_SEARCH_DEFAULT_MIN_DEPTH,
  maxDepth = PCT_SEARCH_DEFAULT_MAX_DEPTH,
  ...exploreOptions
}) {
  const notReproducedBelow = [];
  const lowestDepth = Math.max(PCT_SEARCH_DEFAULT_MIN_DEPTH, Math.floor(minDepth));
  const highestDepth = Math.floor(maxDepth);
  for (let depth = lowestDepth; depth <= highestDepth; depth += PCT_SEARCH_NUM_ONE) {
    const result = exploreWithPct({...exploreOptions, depth});
    if (result.found === true) {
      return Object.freeze({
        ...result,
        depth,
        depthsTried: depth - lowestDepth + PCT_SEARCH_NUM_ONE,
        notReproducedBelow: Object.freeze([...notReproducedBelow]),
      });
    }
    notReproducedBelow.push(depth);
  }
  return Object.freeze({
    found: false,
    depthsTried: notReproducedBelow.length,
    notReproducedBelow: Object.freeze([...notReproducedBelow]),
  });
}

export {runPctSeed, exploreWithPct, minimizePctDepth};
