/**
 * Per-target retry-rate budget placeholder.
 *
 * Historically this enforced a token-bucket budget bounding how fast THIS node
 * re-attempts delivery-triggered reconnects toward a single owner. That
 * enforcement was opt-in and DISABLED in production (the budget never engaged),
 * so the unconditional, measured baseline behavior is "always allow".
 *
 * The always-allow behavior is kept here unconditionally; the export signature
 * is preserved so callers (message-router) continue to construct and use it as
 * a no-op.
 */

class OwnerRetryBudget {
  /**
   * Consume one token for `key`. Always allows (no enforcement).
   * @param {string} _key - target owner / node id.
   * @return {boolean}
   */
  tryConsume(_key) {
    return true;
  }

  reset(_key) {
    // no-op: no buckets are tracked.
  }
}

export {OwnerRetryBudget};
