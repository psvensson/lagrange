// The quiet bound of a node's log capture: the EARLIEST observed moment after
// which the node could produce no output. The capture owner
// (full-node-log-capture.js assessCaptureCompleteness) judges a capture
// complete when its last line is within the stale gap of this bound; this
// module is the one place the bound is chosen, consulted by both the streamed
// and the file-logged finalize (cluster-class-lifecycle-base.js).
//
// Observations, each with a named source (CAPTURE_QUIET_BOUND_SOURCE):
// - HARNESS_STOP: the lifecycle's expected-down mark for a HARNESS_STOP_ACTIONS
//   action (kill/stop/pause), stamped before the action runs. restart/start
//   marks are not stop actions: the node is expected to log again.
// - CONTAINER_EXIT: Docker's State.FinishedAt for the container, observed by
//   the failure-time sweep (unexpected-node-exit.js) before cluster.stop(). A
//   node that died on its own (OOM, abort) is silent from its exit. An absent,
//   unparseable or zero-time ('0001-01-01T00:00:00Z') FinishedAt is no
//   observation and never acquits.
// - TEARDOWN: nothing earlier was observed; the node was expected to log until
//   the harness finalized its capture.
//
// The follow stream's end (the streamer's handleStreamClosed) is deliberately
// NOT an observation here: it fires on onEnd and onError alike, so a daemon or
// transport fault (the stall the stale-tail check exists to catch) is
// indistinguishable from the container's exit.
import {
  CAPTURE_QUIET_BOUND_SOURCE,
  HARNESS_STOP_ACTIONS,
} from './constants.js';

const arrayIncludes = Function.call.bind(Array.prototype.includes);
const ZERO = 0;

/**
 * Parse an observed container exit time once.
 * @param {*} finishedAt Docker State.FinishedAt (RFC3339) or anything else.
 * @return {?number} epoch ms, or null when it observes nothing.
 */
function parseObservedExitMs(finishedAt) {
  if (typeof finishedAt !== 'string') {
    return null;
  }
  const atMs = Date.parse(finishedAt);
  return Number.isFinite(atMs) && atMs > ZERO ? atMs : null;
}

function quietBound(atMs, source, action = null) {
  return {atMs, source, action};
}

/**
 * The quiet bound a node's capture is judged against.
 * @param {{teardownWallMs: number, expectedDown?: ?{action: string,
 *   sinceMs: number}, observedExitMs?: ?number}} observations
 * @return {{atMs: number, source: string, action: ?string}} action names the
 *   lifecycle action for HARNESS_STOP and is null otherwise.
 */
function resolveCaptureQuietBound({teardownWallMs, expectedDown = null,
  observedExitMs = null}) {
  let bound = quietBound(teardownWallMs, CAPTURE_QUIET_BOUND_SOURCE.TEARDOWN);
  if (arrayIncludes(HARNESS_STOP_ACTIONS, expectedDown?.action) &&
      expectedDown.sinceMs < bound.atMs) {
    bound = quietBound(expectedDown.sinceMs,
      CAPTURE_QUIET_BOUND_SOURCE.HARNESS_STOP, expectedDown.action);
  }
  if (Number.isFinite(observedExitMs) && observedExitMs < bound.atMs) {
    bound = quietBound(observedExitMs, CAPTURE_QUIET_BOUND_SOURCE.CONTAINER_EXIT);
  }
  return bound;
}

export {
  parseObservedExitMs,
  resolveCaptureQuietBound,
};
