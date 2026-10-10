import {test} from '../../src/test-helpers/tap.js';
import {
  resolveFailedJoinReattempt,
} from '../../src/entrypoint-runtime-join-startup-policy.js';

// Witness: exhausting the process-level join reattempt bound is a failure
// and is visible as exactly one ERROR wait_bound_spent; a reattempt within
// the bound and a non-retryable failure log none; the thrown error is
// unchanged.

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

function buildOptions(logger, joinAttempt, joinResult) {
  return {
    bootstrapAPI: {async shutdown() {}},
    joinAttempt,
    joinResult,
    logger,
    nodeId: 'witness-node',
    nodeJoiningService: {
      async cleanup() {},
      getLifecycleStateMachine() {
        return {};
      },
    },
    reattemptPolicy: {
      backoffCapExponent: 1,
      baseDelayMs: 1,
      maxAttempts: 2,
      maxDelayMs: 1,
    },
  };
}

function spentLines(errors) {
  return errors.filter((entry) => entry.context?.event === 'wait_bound_spent');
}

test('exhausted retryable join reattempts log one wait_bound_spent and throw as before',
  async (t) => {
    const {errors, logger} = createCapturingLogger();
    await t.rejects(
      resolveFailedJoinReattempt(buildOptions(logger, 1, {
        error: 'seed contact unavailable',
        phase: 'contacting_seed',
        retryable: true,
      })),
      {message: 'seed contact unavailable'},
      'post-expiry behaviour unchanged: same error thrown',
    );
    const spent = spentLines(errors);
    t.equal(spent.length, 1, 'exactly one wait_bound_spent ERROR');
    t.equal(spent[0].context.wait, 'LAGRANGE_JOIN_REATTEMPT_MAX_ATTEMPTS',
      'names the spent reattempt bound');
    t.same(spent[0].context.lastObserved, {
      attempts: 2,
      maxAttempts: 2,
      phase: 'contacting_seed',
      lastError: 'seed contact unavailable',
    }, 'lastObserved carries attempts, phase and last error');
    t.same(spent[0].context.scope, {nodeId: 'witness-node'}, 'scope names the node');
  });

test('a reattempt within the bound and a non-retryable failure log no wait_bound_spent',
  async (t) => {
    const {errors, logger} = createCapturingLogger();
    const next = await resolveFailedJoinReattempt(buildOptions(logger, 0, {
      error: 'transient',
      retryable: true,
    }));
    t.equal(next.joinAttempt, 1, 'reattempt scheduled');
    await t.rejects(
      resolveFailedJoinReattempt(buildOptions(logger, 0, {
        error: 'identity mismatch',
        retryable: false,
      })),
      {message: 'identity mismatch'},
      'non-retryable failure throws as before',
    );
    t.equal(spentLines(errors).length, 0, 'no wait_bound_spent');
  });
