// wait-for-state — the generic state-triggered-chaos primitive (DT1).
//
// The harness has several fixed-condition waiters (waitForConvergence,
// waitForControlPlaneQuiescence, waitForAllActive, …) but none lets a scenario
// block on an ARBITRARY observed predicate. Directed chaos needs exactly that:
// "act (restart / partition / kill) the moment the system is in state X" instead
// of acting on a wall-clock timer and hoping the bad interleaving coincides.
//
// `pollUntil` is the pure, injectable-clock core (so it is unit-testable without
// a real cluster); `waitForState` wires it to a cluster as `(cluster) => bool`.

const DEFAULT_INTERVAL_MS = 200;
const DEFAULT_TIMEOUT_MS = 60000;

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Poll `predicate` until it returns truthy or the timeout elapses. Returns
// {satisfied, elapsedMs, polls, value}. Never throws on a falsy predicate — a
// timeout is a result (satisfied=false), so a caller can branch on it. The
// clock (`now`) and `sleep` are injectable for deterministic tests.
async function pollUntil(predicate, options = {}) {
  const intervalMs = options.intervalMs || DEFAULT_INTERVAL_MS;
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const now = options.now || Date.now;
  const sleep = options.sleep || defaultSleep;
  const startedAt = now();
  let polls = 0;
  for (;;) {
    polls += 1;
    const value = await predicate();
    if (value) {
      return {satisfied: true, elapsedMs: now() - startedAt, polls, value};
    }
    if (now() - startedAt >= timeoutMs) {
      return {satisfied: false, elapsedMs: now() - startedAt, polls, value};
    }
    await sleep(intervalMs);
  }
}

// Block until `predicate(cluster)` holds. By default a timeout throws (so a
// scenario fails loudly when the awaited state never appears); pass
// `throwOnTimeout: false` to branch on the returned `satisfied` instead — the
// directed-chaos pattern where "did the bad state appear?" is itself the signal.
async function waitForState(cluster, predicate, options = {}) {
  const result = await pollUntil(() => predicate(cluster), options);
  if (!result.satisfied && options.throwOnTimeout !== false) {
    const label = options.label ? ` (${options.label})` : '';
    throw new Error(
      `waitForState timed out after ${result.elapsedMs}ms / ${result.polls} ` +
      `polls${label}`);
  }
  return result;
}

export {pollUntil, waitForState, DEFAULT_INTERVAL_MS, DEFAULT_TIMEOUT_MS};
