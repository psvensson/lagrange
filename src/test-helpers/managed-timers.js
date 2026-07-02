/**
 * Teardown-registered timers for tests.
 *
 * The recurring integration-suite hang class: assertions pass, then a
 * background retry loop re-arms a ref'd setTimeout nothing stops on teardown,
 * and the suite burns its full TAP timeout. The steering guidance (clear
 * timers in finally, disable background loops) was prose-only; these helpers
 * make the safe pattern the easy one by binding every timer to the test's
 * own teardown.
 *
 * Deliberately NOT unref-based: unref'ing awaited sleeps lets the process
 * exit mid-await and broke 87 tests when tried; clearing on teardown is safe
 * because by then the test body has finished.
 */

const activeResourceTally = () => {
  const tally = {};
  for (const resource of process.getActiveResourcesInfo()) {
    tally[resource] = (tally[resource] || 0) + 1;
  }
  return tally;
};

/**
 * setTimeout bound to the test lifetime: cleared automatically on teardown,
 * so a forgotten or re-armed timer cannot outlive its test.
 * @param {object} t - tap test object (needs t.teardown)
 * @param {Function} fn
 * @param {number} ms
 * @return {ReturnType<typeof setTimeout>}
 */
export function managedTimeout(t, fn, ms) {
  const handle = setTimeout(fn, ms);
  t.teardown(() => clearTimeout(handle));
  return handle;
}

/**
 * setInterval bound to the test lifetime (see managedTimeout).
 * @param {object} t - tap test object
 * @param {Function} fn
 * @param {number} ms
 * @return {ReturnType<typeof setInterval>}
 */
export function managedInterval(t, fn, ms) {
  const handle = setInterval(fn, ms);
  t.teardown(() => clearInterval(handle));
  return handle;
}

/**
 * Awaited sleep whose pending timer is cleared (and the promise resolved) on
 * teardown, so an in-flight sleep can never hold the process open after the
 * test ends. Prefer mocked time; use this only where a real delay is the
 * point of the test.
 * @param {object} t - tap test object
 * @param {number} ms
 * @return {Promise<void>}
 */
export function managedSleep(t, ms) {
  let handle;
  let settle;
  const done = new Promise((resolve) => {
    settle = resolve;
    handle = setTimeout(resolve, ms);
  });
  t.teardown(() => {
    clearTimeout(handle);
    settle();
  });
  return done;
}

/**
 * Diagnostic for hunting the hang class: snapshot the process's active
 * resources (Timeout/TCPSocketWrap/...) at teardown time and log any timers
 * still alive AFTER the test's own teardowns ran. Call it FIRST in the test
 * body — tap runs teardowns in reverse registration order, so registering
 * first means running last, after the suite's own cleanup.
 * @param {object} t - tap test object
 * @return {void}
 */
export function reportOpenHandlesOnTeardown(t) {
  t.teardown(() => {
    const tally = activeResourceTally();
    const timers = (tally.Timeout || 0) + (tally.Immediate || 0);
    if (timers > 0) {
      // Diagnostic, not an assertion: post-teardown snapshots can still see
      // tap's own scheduling; treat repeated nonzero counts as the signal.
      t.comment(
        `open handles after teardown: ${JSON.stringify(tally)} — a ref'd ` +
        'timer surviving here is the classic full-TAP-timeout hang',
      );
    }
  });
}
