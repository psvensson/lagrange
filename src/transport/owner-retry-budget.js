/**
 * Per-target retry-rate budget (token bucket) — bounds how fast THIS node
 * re-attempts expensive recovery work (reconnect-before-delivery) toward a
 * single target owner, so a saturated owner (e.g. the sole-surviving seed during
 * a rolling restart) is not hammered by an unbounded retry storm. This breaks
 * the retry/work-amplification loop that sustains a metastable failure
 * (solve/specs/metastable-convergence-resilience/, Phase 1, task 1.5).
 *
 * Note: this bounds the PER-NODE contribution; with N nodes the aggregate is
 * still ~N x rate, but it removes each node's unbounded amplification.
 *
 * Opt-in, default OFF (tryConsume always true) so the measured baseline is
 * unchanged until enabled via LAGRANGE_OWNER_RETRY_BUDGET=true.
 */

const DEFAULT_RATE_PER_SEC = 2;
const DEFAULT_BURST = 4;
const MS_PER_SEC = 1000;

function resolveOwnerRetryBudgetConfig(env = process.env) {
  const enabled = env.LAGRANGE_OWNER_RETRY_BUDGET === 'true';
  const rate = Number(env.LAGRANGE_OWNER_RETRY_RATE_PER_SEC);
  const burst = Number(env.LAGRANGE_OWNER_RETRY_BURST);
  return {
    enabled,
    ratePerSec:
      Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_RATE_PER_SEC,
    burst: Number.isFinite(burst) && burst > 0 ? Math.floor(burst) : DEFAULT_BURST,
  };
}

class OwnerRetryBudget {
  /**
   * @param {Object} [opts]
   * @param {boolean} [opts.enabled]
   * @param {number} [opts.ratePerSec] - token refill rate.
   * @param {number} [opts.burst] - bucket capacity.
   * @param {function} [opts.now] - injectable clock (ms).
   */
  constructor(opts = {}) {
    const cfg = resolveOwnerRetryBudgetConfig();
    this.enabled = opts.enabled ?? cfg.enabled;
    this.ratePerSec = opts.ratePerSec ?? cfg.ratePerSec;
    this.burst = opts.burst ?? cfg.burst;
    this.now = typeof opts.now === 'function' ? opts.now : () => Date.now();
    this.buckets = new Map(); // key -> {tokens, lastRefillMs}
  }

  _bucket(key) {
    let b = this.buckets.get(key);
    if (!b) {
      b = {tokens: this.burst, lastRefillMs: this.now()};
      this.buckets.set(key, b);
    }
    return b;
  }

  /**
   * Consume one token for `key`. Returns true if allowed, false if rate-limited.
   * @param {string} key - target owner / node id.
   * @return {boolean}
   */
  tryConsume(key) {
    if (this.enabled !== true || !key) {
      return true;
    }
    const b = this._bucket(key);
    const nowMs = this.now();
    const elapsedSec = Math.max(0, (nowMs - b.lastRefillMs) / MS_PER_SEC);
    if (elapsedSec > 0) {
      b.tokens = Math.min(this.burst, b.tokens + elapsedSec * this.ratePerSec);
      b.lastRefillMs = nowMs;
    }
    if (b.tokens >= 1) {
      b.tokens -= 1;
      return true;
    }
    return false;
  }

  reset(key) {
    if (key === undefined) {
      this.buckets.clear();
    } else {
      this.buckets.delete(key);
    }
  }
}

export {
  DEFAULT_RATE_PER_SEC,
  DEFAULT_BURST,
  OwnerRetryBudget,
  resolveOwnerRetryBudgetConfig,
};
