// Critical add-like lane deferred-observation COOLDOWN
// (default-off LAGRANGE_PR_CRITICAL_ADD_LANE_DEFERRED_COOLDOWN).
//
// The single-flight lane's deferred-observation escape opens the lane when neither the
// authoritative nor the cache read can confirm an in-flight add-like op and priority
// recovery pressure is contained. On a saturated owner that cannot observe its own
// freshly-admitted ADD, that escape re-opens every planning tick (~1s) — the
// increase_replica_count storm (analyze:redecision-storm; gate 195141Z run1 = 22
// dispatches at ~1.1s cadence vs the ~5s learner-promotion settle). isCriticalAddLane-
// DeferredAdmissionRateLimited adds the missing hysteresis: the FIRST escape admission
// per partition is allowed (recovery still progresses — the escape's anti-deadlock
// purpose), but a second within the settle window is rate-limited so the caller fails
// closed and defers, bounding the storm to ~1 ADD per window per partition.

import {test} from '../../src/test-helpers/tap.js';
import {applyRebalanceCoordinatorPriorityBudgetAdmissionMethods} from '../../src/rebalancer/rebalance-coordinator-priority-budget-admission.js';

const FLAG = 'LAGRANGE_PR_CRITICAL_ADD_LANE_DEFERRED_COOLDOWN';
const COOLDOWN_MS = 5000;
const PARTITION = 'sql_write_operations-p1';

class AdmissionHarness {}
applyRebalanceCoordinatorPriorityBudgetAdmissionMethods(AdmissionHarness);

// A harness with a controllable virtual clock (the DT4 TimeSource seam shape).
function buildHarness(startMs = 1000) {
  const harness = new AdmissionHarness();
  harness._clockMs = startMs;
  harness.timeSource = {now: () => harness._clockMs};
  return harness;
}

function withFlag(value, fn) {
  return async (t) => {
    const previous = process.env[FLAG];
    if (value === null) {
      delete process.env[FLAG];
    } else {
      process.env[FLAG] = value;
    }
    try {
      await fn(t);
    } finally {
      if (previous === undefined) {
        delete process.env[FLAG];
      } else {
        process.env[FLAG] = previous;
      }
    }
  };
}

test('flag-off: never rate-limits (byte-identical to the un-cooled escape)',
  withFlag(null, async (t) => {
    const harness = buildHarness();
    t.equal(harness.isCriticalAddLaneDeferredAdmissionRateLimited(PARTITION), false);
    t.equal(harness.isCriticalAddLaneDeferredAdmissionRateLimited(PARTITION), false,
      'a second immediate call still opens when the flag is off');
    t.end();
  }));

test('flag-on: first escape admission opens, second within the window is rate-limited',
  withFlag('true', async (t) => {
    const harness = buildHarness();
    t.equal(harness.isCriticalAddLaneDeferredAdmissionRateLimited(PARTITION), false,
      'first admission opens the lane (anti-deadlock preserved)');
    t.equal(harness.isCriticalAddLaneDeferredAdmissionRateLimited(PARTITION), true,
      'a second admission inside the settle window is deferred (storm bounded)');
    t.end();
  }));

test('flag-on: just before the window expires it is still rate-limited',
  withFlag('true', async (t) => {
    const harness = buildHarness();
    harness.isCriticalAddLaneDeferredAdmissionRateLimited(PARTITION);
    harness._clockMs += COOLDOWN_MS - 1;
    t.equal(harness.isCriticalAddLaneDeferredAdmissionRateLimited(PARTITION), true);
    t.end();
  }));

test('flag-on: once the settle window passes the lane re-opens',
  withFlag('true', async (t) => {
    const harness = buildHarness();
    harness.isCriticalAddLaneDeferredAdmissionRateLimited(PARTITION);
    harness._clockMs += COOLDOWN_MS;
    t.equal(harness.isCriticalAddLaneDeferredAdmissionRateLimited(PARTITION), false,
      'after the settle window a fresh corrective admission is allowed again');
    t.end();
  }));

test('flag-on: cooldown is independent per partition',
  withFlag('true', async (t) => {
    const harness = buildHarness();
    t.equal(harness.isCriticalAddLaneDeferredAdmissionRateLimited(PARTITION), false);
    t.equal(harness.isCriticalAddLaneDeferredAdmissionRateLimited('replica_operations-p1'), false,
      'a different partition has its own window');
    t.equal(harness.isCriticalAddLaneDeferredAdmissionRateLimited(PARTITION), true,
      'the first partition is still cooling down');
    t.end();
  }));

test('flag-on: an empty partition id is never rate-limited',
  withFlag('true', async (t) => {
    const harness = buildHarness();
    t.equal(harness.isCriticalAddLaneDeferredAdmissionRateLimited(''), false);
    t.equal(harness.isCriticalAddLaneDeferredAdmissionRateLimited(null), false);
    t.end();
  }));
