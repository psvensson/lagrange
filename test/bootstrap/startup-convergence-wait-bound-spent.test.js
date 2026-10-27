import {test} from '../../src/test-helpers/tap.js';
import {
  waitForStartupConvergence,
} from '../../src/bootstrap/shared/startup-convergence-gate.js';
import {
  runRetryableControlPlaneWrite,
} from '../../src/bootstrap/shared/retryable-control-plane-write.js';

// Witness: a spent bootstrap/join wait is a failure and is visible. The
// startup-convergence gate (owner of every seed/join convergence wait) and
// the retryable control-plane write (join-admission and register-service
// writes) each report exactly one ERROR wait_bound_spent on expiry, none on
// normal completion, and keep their post-expiry behaviour unchanged.

function createCapturingLogger() {
  const errors = [];
  return {
    errors,
    logger: {
      debug() {},
      info() {},
      warn() {},
      error(message, context) {
        errors.push({message, context});
      },
    },
  };
}

function spentLines(errors) {
  return errors.filter((entry) => entry.context?.event === 'wait_bound_spent');
}

/**
 * Manual clock + timer: setTimeoutFn advances the clock by the requested
 * delay and fires immediately, so the gate spends its bound without waiting.
 * @return {Object}
 */
function createManualClock() {
  let nowMs = 1000;
  return {
    now: () => nowMs,
    setTimeoutFn: (callback, delayMs) => {
      nowMs += delayMs;
      queueMicrotask(callback);
      return {delayMs};
    },
    clearTimeoutFn: () => {},
  };
}

test('startup convergence gate: spent bound logs one wait_bound_spent ERROR and throws the same typed error',
  async (t) => {
    const {errors, logger} = createCapturingLogger();
    const clock = createManualClock();
    const typedError = new Error('typed convergence timeout');
    let thrown = null;
    try {
      await waitForStartupConvergence({
        timeoutMs: 50,
        pollIntervalMs: 10,
        now: clock.now,
        setTimeoutFn: clock.setTimeoutFn,
        clearTimeoutFn: clock.clearTimeoutFn,
        logger,
        spentWait: {wait: 'WITNESS_TIMEOUT_MS', awaited: 'witness ready'},
        scope: {nodeId: 'witness-node'},
        evaluate: () => ({ready: false, reason: 'leaders_missing', missingCount: 2}),
        createTimeoutError: () => typedError,
      });
    } catch (error) {
      thrown = error;
    }

    t.equal(thrown, typedError, 'post-expiry behaviour unchanged: same typed error thrown');
    const spent = spentLines(errors);
    t.equal(spent.length, 1, 'exactly one wait_bound_spent ERROR');
    t.equal(spent[0].context.wait, 'WITNESS_TIMEOUT_MS', 'names the spent wait');
    t.equal(spent[0].context.boundMs, 50, 'reports the applied bound');
    t.ok(spent[0].context.elapsedMs >= 50, 'elapsed measured on the injected clock');
    t.equal(spent[0].context.lastObserved.lastResultReason, 'leaders_missing',
      'lastObserved carries the last evaluated reason');
    t.equal(spent[0].context.lastObserved.lastResultMissingCount, 2,
      'lastObserved carries the last missing count');
    t.notSame(spent[0].context.lastObserved, {state: 'site_observed_nothing'},
      'lastObserved is real state, not the nothing marker');
    t.same(spent[0].context.scope, {nodeId: 'witness-node'}, 'scope passed through');
  });

test('startup convergence gate: caller-described lastObserved receives the built error',
  async (t) => {
    const {errors, logger} = createCapturingLogger();
    const clock = createManualClock();
    const typedError = new Error('typed');
    typedError.joinReadiness = {reasons: ['topology_not_ready']};
    await t.rejects(waitForStartupConvergence({
      timeoutMs: 20,
      now: clock.now,
      setTimeoutFn: clock.setTimeoutFn,
      clearTimeoutFn: clock.clearTimeoutFn,
      logger,
      describeLastObserved: (_result, _context, error) => error.joinReadiness,
      evaluate: () => ({ready: false}),
      createTimeoutError: () => typedError,
    }), typedError, 'same error rejected');
    const spent = spentLines(errors);
    t.equal(spent.length, 1, 'one line');
    t.same(spent[0].context.lastObserved, {reasons: ['topology_not_ready']},
      'caller description is the lastObserved');
  });

test('startup convergence gate: normal completion logs no wait_bound_spent',
  async (t) => {
    const {errors, logger} = createCapturingLogger();
    const clock = createManualClock();
    let attempts = 0;
    const result = await waitForStartupConvergence({
      timeoutMs: 50,
      pollIntervalMs: 10,
      now: clock.now,
      setTimeoutFn: clock.setTimeoutFn,
      clearTimeoutFn: clock.clearTimeoutFn,
      logger,
      evaluate: () => {
        attempts += 1;
        return {ready: attempts >= 2};
      },
    });
    t.equal(result.ready, true, 'converged');
    t.equal(spentLines(errors).length, 0, 'no wait_bound_spent on completion');
  });

test('retryable control-plane write: spent deadline logs one wait_bound_spent and returns the last result',
  async (t) => {
    const {errors, logger} = createCapturingLogger();
    let nowMs = 0;
    const retryableFailure = {
      success: false,
      error: 'leader unavailable',
      code: 'LEADER_UNAVAILABLE',
      retryable: true,
      deferRetry: true,
    };
    const result = await runRetryableControlPlaneWrite(
      async () => retryableFailure,
      {
        timeoutMs: 100,
        now: () => nowMs,
        sleep: async (delayMs) => {
          nowMs += delayMs;
        },
        logger,
        spentWait: {wait: 'WITNESS_WRITE_TIMEOUT_MS', awaited: 'write accepted'},
      },
    );
    t.equal(result, retryableFailure, 'post-expiry behaviour unchanged: last failed result returned');
    const spent = spentLines(errors);
    t.equal(spent.length, 1, 'exactly one wait_bound_spent ERROR');
    t.equal(spent[0].context.wait, 'WITNESS_WRITE_TIMEOUT_MS', 'names the spent wait');
    t.equal(spent[0].context.boundMs, 100, 'reports the applied bound');
    t.ok(spent[0].context.lastObserved.attempts > 1, 'lastObserved counts attempts');
    t.equal(spent[0].context.lastObserved.lastErrorCode, 'LEADER_UNAVAILABLE',
      'lastObserved carries the last error code');
  });

test('retryable control-plane write: success and non-retryable failure log no wait_bound_spent',
  async (t) => {
    const {errors, logger} = createCapturingLogger();
    let calls = 0;
    const ok = await runRetryableControlPlaneWrite(async () => {
      calls += 1;
      return calls === 1 ?
        {success: false, retryable: true, deferRetry: true} :
        {success: true};
    }, {
      timeoutMs: 100,
      now: () => 0,
      sleep: async () => {},
      logger,
    });
    t.same(ok, {success: true}, 'retried to success');
    const terminal = {success: false, error: 'bad request', statusCode: 400};
    const failed = await runRetryableControlPlaneWrite(async () => terminal, {
      timeoutMs: 100,
      now: () => 0,
      sleep: async () => {},
      logger,
    });
    t.equal(failed, terminal, 'non-retryable failure returned as before');
    t.equal(spentLines(errors).length, 0, 'no wait_bound_spent without a spent bound');
  });
