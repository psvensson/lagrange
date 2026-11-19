// The PressureGovernor's PRESSURE_RELEASED notification (quest
// replica-placement-admission-owner, design section 2.3): an owner whose
// governed read was deferred watches that request, and is told once - on
// the governor's own admission poll, level-triggered from the measured
// pressure - when the governor no longer defers it. A retryAfterMs is never
// slept on for this.
const PRESSURE_GOVERNOR_EVENT = Object.freeze({
  PRESSURE_RELEASED: 'PRESSURE_RELEASED',
});

// A watched request's standing on one evaluation: released with the
// governor's decision, or still deferred (a throwing sensor counts as still
// deferred, as for a parked waiter).
const WATCH_STANDING = Object.freeze({RELEASED: 'released', DEFERRED: 'deferred'});
const STILL_DEFERRED = Object.freeze({standing: WATCH_STANDING.DEFERRED});

function watchStandingOf(evaluate, request, deferAction) {
  try {
    const verdict = evaluate(request);
    return verdict.action === deferAction ? STILL_DEFERRED :
      Object.freeze({standing: WATCH_STANDING.RELEASED, verdict});
  } catch (_error) {
    return STILL_DEFERRED;
  }
}

/**
 * Re-evaluate every watched request and split the watches.
 * @param {Array<Object>} watches - [{request, listener}].
 * @param {function(Object): Object} evaluate - The governor's evaluation.
 * @param {string} deferAction - The governor's DEFER action.
 * @return {Object} {remaining: watches still deferred, released:
 *   [{watch, verdict}]}.
 */
function splitPressureReleases(watches, evaluate, deferAction) {
  const released = [];
  const remaining = [];
  for (const watch of watches) {
    const standing = watchStandingOf(evaluate, watch.request, deferAction);
    if (standing.standing === WATCH_STANDING.RELEASED) {
      released.push({watch, verdict: standing.verdict});
    } else {
      remaining.push(watch);
    }
  }
  return {remaining, released};
}

/**
 * Tell each released watcher once (after the watch set no longer holds it):
 * {event, request, decision: the governor's non-deferring decision}.
 * @param {Array<Object>} released - [{watch, verdict}].
 */
function notifyPressureReleases(released) {
  for (const {watch, verdict} of released) {
    watch.listener(Object.freeze({event: PRESSURE_GOVERNOR_EVENT.PRESSURE_RELEASED,
      request: watch.request, decision: verdict}));
  }
}

export {PRESSURE_GOVERNOR_EVENT, notifyPressureReleases, splitPressureReleases};
