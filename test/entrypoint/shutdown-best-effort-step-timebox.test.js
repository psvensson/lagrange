import {test} from '../../src/test-helpers/tap.js';
import {
  timeBoxBestEffortShutdownStep,
} from '../../src/entrypoint-runtime-shutdown-lifecycle.js';

// Falsifier for CL-030 fix C: the two best-effort control-plane drain steps
// (publishNodeShutdownStatus, shutdownLogsTablePersistence) can block ~5-7s under
// churn, stacking past the docker SIGKILL grace and force-exiting the node 1.
// timeBoxBestEffortShutdownStep must bound that blocking: a step slower than the
// time-box returns control near the timeout (NOT the step's full duration), so the
// drain reaches exit(0). A fast step completes normally with no time-box warning.

function makeCapturingLogger() {
  const calls = {info: [], warn: [], error: []};
  return {
    logger: {
      info: (msg, ctx) => calls.info.push({msg, ctx}),
      warn: (msg, ctx) => calls.warn.push({msg, ctx}),
      error: (msg, ctx) => calls.error.push({msg, ctx}),
    },
    calls,
  };
}

test('fix C: a step slower than the time-box returns near the timeout, not the step duration',
  async (t) => {
    const {logger, calls} = makeCapturingLogger();
    const startedAt = Date.now();
    // A step that never settles — stands in for the local logs-flush hung under churn.
    await timeBoxBestEffortShutdownStep(
      logger, 'SIGTERM', 'shutdownLogsTablePersistence', 50,
      () => new Promise(() => {}),
    );
    const elapsed = Date.now() - startedAt;
    t.ok(
      elapsed < 1000,
      `time-box returned in ${elapsed}ms (< 1000ms), did not wait on the hung step`,
    );
    const spent = calls.error.filter((c) =>
      c.ctx?.event === 'wait_bound_spent');
    t.equal(spent.length, 1, 'a timed-out step logs exactly one wait_bound_spent ERROR');
    t.equal(spent[0].ctx.wait, 'SHUTDOWN_BEST_EFFORT_STEP_TIMEOUT_MS',
      'names the spent time-box');
    t.equal(spent[0].ctx.boundMs, 50, 'reports the applied bound');
    t.equal(spent[0].ctx.lastObserved.step, 'shutdownLogsTablePersistence',
      'lastObserved names the step still running');
    t.equal(spent[0].ctx.lastObserved.stepSettled, false,
      'lastObserved records the step had not settled');
    t.equal(calls.warn.length, 0, 'the old time-box warning is replaced, not doubled');
    const timing = calls.info.find((c) =>
      c.ctx?.step === 'shutdownLogsTablePersistence');
    t.equal(timing?.ctx?.timedOut, true, 'timing log marks the step timedOut=true');
  });

test('fix C: a fast step completes normally with no time-box warning',
  async (t) => {
    const {logger, calls} = makeCapturingLogger();
    let ran = false;
    await timeBoxBestEffortShutdownStep(
      logger, 'SIGTERM', 'shutdownLogsTablePersistence', 1000,
      async () => {
        ran = true;
      },
    );
    t.ok(ran, 'the fast step actually ran to completion');
    t.equal(calls.warn.length, 0, 'no time-box warning for a fast step');
    t.equal(calls.error.length, 0, 'no wait_bound_spent for a fast step');
    const timing = calls.info.find((c) =>
      c.ctx?.step === 'shutdownLogsTablePersistence');
    t.equal(timing?.ctx?.timedOut, false, 'timing log marks the step timedOut=false');
  });
