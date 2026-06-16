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

export {runPctSeed, exploreWithPct};
