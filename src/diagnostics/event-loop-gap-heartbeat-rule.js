// The pure heartbeat rule, alone in its own module so that the deterministic
// simulator can hold the live watchdog's rule without also loading the
// inspector, profiler and timer machinery the watchdog carries.
//
/**
 * The heartbeat rule itself, with no clock, no timer and no IO: a heartbeat
 * that runs later than it was expected has been blocked for the difference,
 * and the next expectation is set from when the callback ACTUALLY ran, not
 * from when it was due, so one long block reports one gap rather than a
 * backlog of them. Pure so that a deterministic scheduler can observe the
 * same rule over virtual time without the inspector or profiler this module
 * also carries (formation-sim: the simulated gap observer must not derive a
 * gap from charged work, which is a different quantity).
 * @param {Object} beat - {expectedAtMs, nowMs, intervalMs, thresholdMs}.
 * @return {Object} {gapMs, exceeded, nextExpectedAtMs}.
 */
function observeHeartbeat({expectedAtMs, nowMs, intervalMs, thresholdMs}) {
  const gapMs = nowMs - expectedAtMs;
  return Object.freeze({
    gapMs,
    exceeded: gapMs >= thresholdMs,
    nextExpectedAtMs: nowMs + intervalMs,
  });
}

export {observeHeartbeat};
