// When the planner's timer seams are resolved, and why the two cases differ.
//
// The planner arms its periodic check and its stabilization delay through
// injectable seams so a deterministic scheduler can own the planning rate.
// Introducing those seams changed a second thing by accident: the ambient
// default was CAPTURED at construction, where the baseline had called
// globalThis.setTimeout directly at arm time. Replacing the ambient timer
// after construction - which the trigger-scheduling suite does, and which any
// host-level timer instrumentation does - silently stopped being observable.
//
// The contract sealed here:
//   injected  -> captured at construction (the simulator hands over its clock
//                once and must keep it, whatever the host does afterwards)
//   ambient   -> forwarded at call time (replacing the ambient timer after
//                construction stays observable, as it was before the seams)
// Both members follow the same rule: no late-bound setter paired with a
// captured clearer.
import {test} from '../../src/test-helpers/tap.js';

import {createTestRebalancer} from './test-helpers.js';

const PERIODIC_DELAY_MS = 5000;

function recordingTimers(label) {
  const armed = [];
  const cleared = [];
  return {
    armed,
    cleared,
    setTimeoutFn: (callback, delayMs) => {
      const handle = {label, delayMs, callback};
      armed.push(handle);
      return handle;
    },
    clearTimeoutFn: (handle) => {
      cleared.push(handle);
    },
  };
}

// Replace the ambient pair for the duration of one body.
function withAmbientTimers(timers, body) {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  globalThis.setTimeout = timers.setTimeoutFn;
  globalThis.clearTimeout = timers.clearTimeoutFn;
  try {
    return body();
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
}

test('an injected timer is captured at construction and survives an ambient swap',
  async (t) => {
    const injected = recordingTimers('injected');
    const rebalancer = createTestRebalancer({
      setTimeoutFn: injected.setTimeoutFn,
      clearTimeoutFn: injected.clearTimeoutFn,
    });
    rebalancer.isLeader = true;
    const ambient = recordingTimers('ambient');
    withAmbientTimers(ambient, () => {
      rebalancer.scheduleNextCheck(PERIODIC_DELAY_MS);
      rebalancer.cancelScheduledCheck();
    });
    t.equal(injected.armed.length, 1,
      'the explicitly injected clock still owns the planner timer');
    t.equal(injected.armed[0].delayMs, PERIODIC_DELAY_MS);
    t.equal(injected.cleared.length, 1,
      'and cancellation goes to the same injected clock');
    t.equal(ambient.armed.length, 0,
      'replacing the ambient timer cannot take an injected clock away');
    t.equal(ambient.cleared.length, 0);
    t.end();
  });

test('the ambient default is resolved when the timer is armed, not at construction',
  async (t) => {
    // Construct FIRST, with no injection, then replace the ambient pair.
    const rebalancer = createTestRebalancer();
    rebalancer.isLeader = true;
    const replacement = recordingTimers('replacement');
    withAmbientTimers(replacement, () => {
      rebalancer.scheduleNextCheck(PERIODIC_DELAY_MS);
      rebalancer.cancelScheduledCheck();
    });
    t.equal(replacement.armed.length, 1,
      'an ambient timer installed after construction still arms the planner');
    t.equal(replacement.armed[0].delayMs, PERIODIC_DELAY_MS);
    t.equal(replacement.cleared.length, 1,
      'and the clearer is late-bound in exactly the same way');
    t.end();
  });

test('MUTATION: capturing the ambient function at construction makes the ' +
  'late-bound witness red', async (t) => {
  // The falsifier, applied as a capability mutation rather than a source
  // edit: give the planner exactly what construction capture would have left
  // it with - the ambient functions as they stood at construction time.
  const rebalancer = createTestRebalancer();
  rebalancer.isLeader = true;
  rebalancer.setTimeoutFn = globalThis.setTimeout;
  rebalancer.clearTimeoutFn = globalThis.clearTimeout;
  const replacement = recordingTimers('replacement');
  withAmbientTimers(replacement, () => {
    rebalancer.scheduleNextCheck(PERIODIC_DELAY_MS);
    rebalancer.cancelScheduledCheck();
  });
  t.equal(replacement.armed.length, 0,
    'with construction capture the post-construction ambient timer is never ' +
    'used, which is precisely the witness above going red');
  t.equal(replacement.cleared.length, 0);
  t.end();
});
