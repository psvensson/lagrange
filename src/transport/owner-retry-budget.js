/**
 * Per-target delivery-triggered reconnect rate budget (token bucket).
 *
 * Bounds how fast THIS node re-attempts delivery-triggered reconnects toward a
 * single target. Without it, a target that briefly disconnects (ping/idle
 * timeout) is HAMMERED: every queued delivery to the disconnected node fires a
 * fresh reconnect, which loads the still-recovering target, which keeps it slow,
 * which sustains the disconnect -> reconnect storm (a positive-feedback loop
 * observed as a ~10:1 reconnect:close ratio that keeps a rejoiner oscillating in
 * and out of published membership so topology never converges).
 *
 * The budget allows a burst of `capacityTokens` reconnects, then refills one
 * token every `refillIntervalMs`, so the SUSTAINED reconnect rate toward a
 * target is capped at the intended reconnect cadence while a genuine one-off
 * reconnect (or a small burst) is never delayed. When exhausted, `tryConsume`
 * returns false and the caller defers (backs off), which is exactly the relief
 * a saturated target needs.
 *
 * Defaults are generous so normal reconnect activity is unaffected and only a
 * runaway storm is capped; both are configurable.
 */

const OWNER_RETRY_BUDGET_DEFAULT = Object.freeze({
  CAPACITY_TOKENS: 6,
  REFILL_INTERVAL_MS: 1000,
});

class OwnerRetryBudget {
  /**
   * @param {Object} [options]
   * @param {number} [options.capacityTokens] - burst size (>=1).
   * @param {number} [options.refillIntervalMs] - ms per one refilled token (>0).
   */
  constructor(options = {}) {
    this.capacityTokens =
      Number.isFinite(options.capacityTokens) && options.capacityTokens >= 1 ?
        Math.floor(options.capacityTokens) :
        OWNER_RETRY_BUDGET_DEFAULT.CAPACITY_TOKENS;
    this.refillIntervalMs =
      Number.isFinite(options.refillIntervalMs) && options.refillIntervalMs > 0 ?
        Math.floor(options.refillIntervalMs) :
        OWNER_RETRY_BUDGET_DEFAULT.REFILL_INTERVAL_MS;
    this.buckets = new Map();
  }

  /**
   * Consume one token for `key`. Allows a burst up to capacity, then one token
   * per refillIntervalMs. Returns false (caller defers) when exhausted.
   * @param {string} key - target owner / node id.
   * @param {number} [nowMs] - injectable clock for deterministic testing.
   * @return {boolean}
   */
  tryConsume(key, nowMs = Date.now()) {
    if (!key) {
      return true;
    }
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = {tokens: this.capacityTokens, lastRefillMs: nowMs};
      this.buckets.set(key, bucket);
    }
    const elapsedMs = nowMs - bucket.lastRefillMs;
    if (elapsedMs > 0) {
      bucket.tokens = Math.min(
        this.capacityTokens,
        bucket.tokens + elapsedMs / this.refillIntervalMs,
      );
      bucket.lastRefillMs = nowMs;
    }
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return true;
    }
    return false;
  }

  reset(key) {
    if (key) {
      this.buckets.delete(key);
      return;
    }
    this.buckets.clear();
  }
}

export {OwnerRetryBudget, OWNER_RETRY_BUDGET_DEFAULT};
