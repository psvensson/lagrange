/**
 * PctScheduler — the DT5 PCT-style depth-bounded schedule-search strategy
 * (deterministic-directed-testing-plan.md DT5, step 2). It sits on top of the DT4
 * VirtualTimeSource (the WHEN seam) and the DT5 SeededRandomSource (the jitter seam)
 * and controls the remaining degree of freedom those two leave open: the ORDER in
 * which timers that come due at the SAME virtual instant fire.
 *
 * Why only co-due timers: a timer due at t=100 and one due at t=105 are NOT
 * concurrently enabled — the 105 one fires later because its delay (perturbed by the
 * seeded RandomSource) is longer. That ordering is real causality, not a race, so the
 * scheduler must not reorder across distinct due-instants. The genuine race is among
 * timers landing on the same instant (common here: owner-driver / heartbeat / lease
 * intervals are all whole-ms multiples that collide), and that is exactly the set this
 * scheduler permutes.
 *
 * Strategy (Probabilistic Concurrency Testing — Burckhardt et al., PLDI 2010, the
 * formulation used by Coyote/P#):
 *   - Each TASK (a stable key grouping a chain of timers — by default each timer is its
 *     own task; pass keyOf to group a producer/consumer chain) gets a random INITIAL
 *     priority in a high band, assigned the first time it is seen.
 *   - For bug depth d we insert d-1 PRIORITY-CHANGE POINTS at random scheduling steps in
 *     [1, stepBudget]. When the running task is scheduled at a change-point step, its
 *     priority is lowered into a distinct LOW band, so any later timer of that task now
 *     loses to tasks that were behind it — this is what lets the search delay one task
 *     ACROSS another, the move a pure-random-priority pass (depth 1) cannot force.
 *   - At every scheduling point the highest-priority co-due task runs (ties broken by
 *     scheduling order, i.e. lowest seq — so within one task, program order holds).
 *
 * This gives the PCT guarantee: a depth-d ordering bug is hit with probability at least
 * 1 / (n * stepBudget^(d-1)) per seed (n = max concurrent tasks). Iterating seeds to a
 * budget therefore drives the catch-probability toward 1 with a provable floor, instead
 * of "hope". A failing seed replays the identical schedule (same seed -> same change
 * points -> same priority stream -> same order).
 *
 * NOTE on the plan wording: the plan says "insert k priority-change points" for depth k;
 * the provable PCT bound above uses d-1 change points for depth d. This implements the
 * classic d-1 form (so depth=2 -> 1 change point, the canonical depth-2 search), and
 * exposes changePointSteps()/depth for inspection.
 *
 * Opt-in and inert in production: nothing in src/ constructs a PctScheduler, and a
 * VirtualTimeSource built without one keeps its byte-identical (dueAt, seq) ordering.
 */

import {resolveRandomSource} from '../random/random-source.js';

// Default schedule-step ceiling used to place change points when the caller gives none.
// A run that executes more steps than this still completes; change points only fall in
// [1, stepBudget], so a too-small budget simply narrows where a task can be demoted.
const DEFAULT_STEP_BUDGET = 1000;

// Each task's stable identity. By default every timer is its own task; a scenario that
// wants producer/consumer-chain semantics (so a change point can demote a whole chain)
// passes keyOf to map co-due timers onto a shared task key.
function defaultKeyOf(timer) {
  return timer.id;
}

/**
 * A seeded PCT scheduler. Construct one per seed and hand it to a VirtualTimeSource via
 * options.scheduler; advancing that clock then explores one PCT schedule.
 */
class PctScheduler {
  /**
   * @param {Object} [options]
   * @param {Object} [options.randomSource] - a SeededRandomSource (resolved; defaults
   *   to RealRandomSource, which makes the search non-deterministic — pass a seeded one).
   * @param {number} [options.depth=1] - bug depth d; inserts d-1 change points.
   * @param {number} [options.stepBudget=DEFAULT_STEP_BUDGET] - ceiling for change-point
   *   placement (the expected number of scheduling steps in the scenario).
   * @param {Function} [options.keyOf] - timer -> task key (defaults to timer.id).
   */
  constructor(options = {}) {
    this._random = resolveRandomSource(options);

    const depth = Math.floor(Number(options.depth));
    this._depth = Number.isFinite(depth) && depth >= 1 ? depth : 1;

    const budget = Math.floor(Number(options.stepBudget));
    this._stepBudget = Number.isFinite(budget) && budget >= 1 ?
      budget :
      DEFAULT_STEP_BUDGET;

    this._keyOf = typeof options.keyOf === 'function' ?
      options.keyOf :
      defaultKeyOf;

    this._changePointCount = Math.max(0, this._depth - 1);
    // taskKey -> current priority (higher fires first). Initial priorities live strictly
    // above the low band [1, changePointCount] so an un-demoted task always beats a
    // demoted one.
    this._priorities = new Map();
    this._step = 0;
    // step -> distinct low priority in [1, changePointCount].
    this._changePoints = this._chooseChangePoints();
  }

  /**
   * Pick d-1 distinct scheduling steps in [1, stepBudget] (seeded), each mapped to a
   * distinct low priority. The mapping value is the assignment ordinal, so different
   * change points demote to different low priorities and demoted tasks keep a stable
   * relative order.
   * @return {Map<number, number>}
   */
  _chooseChangePoints() {
    const points = new Map();
    const chosen = new Set();
    // Bounded attempts: with the seeded source this terminates deterministically; the
    // cap guards a pathological stepBudget < changePointCount (just yields fewer points).
    const maxAttempts =
      this._stepBudget * 4 + this._changePointCount * 8 + 1;
    let attempts = 0;
    while (
      points.size < this._changePointCount &&
      attempts < maxAttempts
    ) {
      attempts += 1;
      const step = 1 +
        Math.floor(this._random.random() * this._stepBudget);
      if (chosen.has(step)) {
        continue;
      }
      chosen.add(step);
      points.set(step, points.size + 1);
    }
    return points;
  }

  /**
   * The current priority of a task key, lazily assigning a random initial priority in
   * the high band the first time the key is seen.
   * @param {*} key
   * @return {number}
   */
  _priorityOf(key) {
    const existing = this._priorities.get(key);
    if (existing !== undefined) {
      return existing;
    }
    // High band: strictly above the integer low band [1, changePointCount].
    const priority =
      this._changePointCount + 1 + this._random.random();
    this._priorities.set(key, priority);
    return priority;
  }

  /**
   * Choose which of the co-due timers fires next: the highest-priority task (ties broken
   * by lowest seq so program order holds within a task). Counts a scheduling step and,
   * if this step is a change point, demotes the scheduled task into the low band.
   * @param {Array<Object>} timers - co-due timers in seq order (from VirtualTimeSource).
   * @return {Object|null} the timer to fire, or null if none.
   */
  pick(timers) {
    if (!Array.isArray(timers) || timers.length === 0) {
      return null;
    }
    let best = null;
    let bestKey = null;
    let bestPriority = 0;
    for (const timer of timers) {
      const key = this._keyOf(timer);
      const priority = this._priorityOf(key);
      if (
        best === null ||
        priority > bestPriority ||
        (priority === bestPriority && timer.seq < best.seq)
      ) {
        best = timer;
        bestKey = key;
        bestPriority = priority;
      }
    }

    this._step += 1;
    const lowPriority = this._changePoints.get(this._step);
    if (lowPriority !== undefined) {
      this._priorities.set(bestKey, lowPriority);
    }
    return best;
  }

  /**
   * @return {number} scheduling steps taken so far (diagnostic / replay assertion).
   */
  step() {
    return this._step;
  }

  /**
   * @return {number} the configured bug depth d.
   */
  depth() {
    return this._depth;
  }

  /**
   * @return {Array<number>} the chosen change-point steps, ascending (diagnostic).
   */
  changePointSteps() {
    return [...this._changePoints.keys()].sort((left, right) => left - right);
  }
}

export {PctScheduler, DEFAULT_STEP_BUDGET};
