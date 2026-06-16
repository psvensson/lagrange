/**
 * RandomSource — the DT5 seeded-randomness seam (deterministic-directed-testing-plan.md
 * DT5), the companion to the DT4 TimeSource. Scheduling races in this system are
 * driven by two non-determinism sources: WHEN timers fire (TimeSource) and the
 * random jitter/backoff that perturbs ordering (Math.random in the raft election
 * timeout, rebalancer scheduler, retry backoff). Controlling both makes a seed fully
 * determine a run — the precondition for replaying a race and for PCT-style
 * depth-bounded schedule search.
 *
 * Two implementations share one interface:
 *   - RealRandomSource: delegates to Math.random(). The DEFAULT, byte-for-byte the
 *     current behavior, so threading it changes nothing in production.
 *   - SeededRandomSource: a deterministic PRNG (mulberry32) — same seed yields the
 *     same stream, so a harness run is reproducible and replayable.
 *
 * Interface (both): random(): number in [0, 1).
 */

import {NUM, TYPEOF} from '../constants/index.js';

// mulberry32 constants — a small, fast, well-distributed 32-bit PRNG. Chosen for a
// deterministic test/harness stream, NOT cryptographic use.
const MULBERRY32_INCREMENT = 0x6d2b79f5;
const MULBERRY32_MUL_A = 15;
const MULBERRY32_MUL_B_OR = 1;
const MULBERRY32_MUL_C = 7;
const MULBERRY32_MUL_D_OR = 61;
const MULBERRY32_SHIFT = 14;
const MULBERRY32_DIVISOR = 4294967296; // 2^32 — normalize a uint32 into [0, 1).

/**
 * Real randomness — the default. Delegates to Math.random().
 */
class RealRandomSource {
  random() {
    return Math.random();
  }
}

/**
 * Deterministic seeded PRNG (mulberry32). Same seed -> same sequence.
 */
class SeededRandomSource {
  /**
   * @param {Object} [options]
   * @param {number} [options.seed=0] - 32-bit seed.
   */
  constructor(options = {}) {
    const seed = Number(options.seed);
    this._state = (Number.isFinite(seed) ? seed : NUM.ZERO) >>> NUM.ZERO;
  }

  random() {
    this._state = (this._state + MULBERRY32_INCREMENT) | NUM.ZERO;
    let t = this._state;
    t = Math.imul(t ^ (t >>> MULBERRY32_MUL_A), MULBERRY32_MUL_B_OR | t);
    t = (t + Math.imul(t ^ (t >>> MULBERRY32_MUL_C), MULBERRY32_MUL_D_OR | t)) ^ t;
    return ((t ^ (t >>> MULBERRY32_SHIFT)) >>> NUM.ZERO) / MULBERRY32_DIVISOR;
  }
}

/**
 * Resolve a RandomSource from a caller's options: an explicit, valid
 * options.randomSource if present, otherwise a RealRandomSource — the collapse
 * helper subsystems use so their default stays byte-for-byte Math.random.
 * @param {Object} [options]
 * @return {RealRandomSource|SeededRandomSource|Object}
 */
function resolveRandomSource(options = {}) {
  const candidate = options && options.randomSource;
  if (candidate && typeof candidate.random === TYPEOF.FUNCTION) {
    return candidate;
  }
  return new RealRandomSource();
}

export {RealRandomSource, SeededRandomSource, resolveRandomSource};
