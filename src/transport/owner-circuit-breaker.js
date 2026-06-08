/**
 * Per-owner circuit breaker — when delivery/reconnect toward a single owner
 * keeps failing (e.g. a saturated sole-surviving seed during a rolling restart),
 * OPEN the circuit and fast-fail/defer toward that owner instead of continuing to
 * hammer it; after a cool-down, allow ONE half-open probe and CLOSE on success.
 * This is the stateful escalation above the rate-limiting OwnerRetryBudget: the
 * budget bounds the retry rate, the breaker stops retrying a confirmed-dead owner
 * entirely so it can drain (.kiro/specs/metastable-convergence-resilience/,
 * Phase 1, task 1.6).
 *
 * Opt-in, default OFF (allowRequest always true; record* are no-ops) so the
 * measured baseline is unchanged until enabled via LAGRANGE_OWNER_CIRCUIT_BREAKER.
 */

const BREAKER_STATE = Object.freeze({
  CLOSED: 'closed',
  OPEN: 'open',
  HALF_OPEN: 'half_open',
});

const DEFAULT_FAILURE_THRESHOLD = 3;
const DEFAULT_OPEN_MS = 5000;

function resolveOwnerCircuitBreakerConfig(env = process.env) {
  const threshold = Number(env.LAGRANGE_OWNER_CIRCUIT_FAILURE_THRESHOLD);
  const openMs = Number(env.LAGRANGE_OWNER_CIRCUIT_OPEN_MS);
  return {
    enabled: env.LAGRANGE_OWNER_CIRCUIT_BREAKER === 'true',
    failureThreshold:
      Number.isFinite(threshold) && threshold >= 1 ?
        Math.floor(threshold) :
        DEFAULT_FAILURE_THRESHOLD,
    openMs:
      Number.isFinite(openMs) && openMs > 0 ?
        Math.floor(openMs) :
        DEFAULT_OPEN_MS,
  };
}

class OwnerCircuitBreaker {
  constructor(opts = {}) {
    const cfg = resolveOwnerCircuitBreakerConfig();
    this.enabled = opts.enabled ?? cfg.enabled;
    this.failureThreshold = opts.failureThreshold ?? cfg.failureThreshold;
    this.openMs = opts.openMs ?? cfg.openMs;
    this.now = typeof opts.now === 'function' ? opts.now : () => Date.now();
    this.states = new Map(); // key -> {state, failures, openedAtMs, probeInFlight}
  }

  _entry(key) {
    let e = this.states.get(key);
    if (!e) {
      e = {
        state: BREAKER_STATE.CLOSED,
        failures: 0,
        openedAtMs: 0,
        probeInFlight: false,
      };
      this.states.set(key, e);
    }
    return e;
  }

  /**
   * @param {string} key - target owner / node id.
   * @return {boolean} true if a request/connect attempt is allowed now.
   */
  allowRequest(key) {
    if (this.enabled !== true || !key) {
      return true;
    }
    const e = this._entry(key);
    if (e.state === BREAKER_STATE.CLOSED) {
      return true;
    }
    if (e.state === BREAKER_STATE.OPEN) {
      if (this.now() - e.openedAtMs >= this.openMs) {
        e.state = BREAKER_STATE.HALF_OPEN;
        e.probeInFlight = true;
        return true; // single probe
      }
      return false;
    }
    // HALF_OPEN: allow only one in-flight probe.
    if (!e.probeInFlight) {
      e.probeInFlight = true;
      return true;
    }
    return false;
  }

  recordSuccess(key) {
    if (this.enabled !== true || !key) {
      return;
    }
    const e = this._entry(key);
    e.state = BREAKER_STATE.CLOSED;
    e.failures = 0;
    e.probeInFlight = false;
  }

  recordFailure(key) {
    if (this.enabled !== true || !key) {
      return;
    }
    const e = this._entry(key);
    if (e.state === BREAKER_STATE.HALF_OPEN) {
      // probe failed -> re-open.
      e.state = BREAKER_STATE.OPEN;
      e.openedAtMs = this.now();
      e.probeInFlight = false;
      return;
    }
    e.failures += 1;
    if (e.failures >= this.failureThreshold) {
      e.state = BREAKER_STATE.OPEN;
      e.openedAtMs = this.now();
      e.probeInFlight = false;
    }
  }

  stateOf(key) {
    return this.states.get(key)?.state || BREAKER_STATE.CLOSED;
  }

  reset(key) {
    if (key === undefined) {
      this.states.clear();
    } else {
      this.states.delete(key);
    }
  }
}

export {
  BREAKER_STATE,
  DEFAULT_FAILURE_THRESHOLD,
  DEFAULT_OPEN_MS,
  OwnerCircuitBreaker,
  resolveOwnerCircuitBreakerConfig,
};
