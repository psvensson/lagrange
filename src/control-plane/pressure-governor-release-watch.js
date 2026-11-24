// The PressureGovernor's PRESSURE_RELEASED notification (quest
// replica-placement-admission-owner, design section 2.3): an owner whose
// governed read was deferred watches that request, and is told once - on
// the governor's own admission poll, level-triggered from the measured
// pressure - when the governor no longer defers it. A retryAfterMs is never
// slept on for this.
const PRESSURE_GOVERNOR_EVENT = Object.freeze({
  PRESSURE_RELEASED: 'PRESSURE_RELEASED',
});
const PRESSURE_PASS_LITERAL = Object.freeze({
  EMPTY_SIGNATURE: 'empty',
  EMPTY_BULK_PART: '0:0:0',
  OBJECT_TYPE: 'object',
});
const PRESSURE_PASS_UNSET_REVISION = -1;

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

function readRouterPressureRevision(messageRouter) {
  if (!messageRouter) {
    return null;
  }
  if (messageRouter.getPressureRevision) {
    const rev = messageRouter.getPressureRevision();
    return Number.isFinite(rev) ? rev : null;
  }
  return Number.isFinite(messageRouter.pressureRevision) ?
    messageRouter.pressureRevision :
    null;
}

function computePressureFactsSignature(facts) {
  if (!facts || typeof facts !== PRESSURE_PASS_LITERAL.OBJECT_TYPE) {
    return PRESSURE_PASS_LITERAL.EMPTY_SIGNATURE;
  }
  const rev = Number.isFinite(facts.pressureRevision) ?
    facts.pressureRevision :
    PRESSURE_PASS_UNSET_REVISION;
  const bulk = facts.bulkChannel;
  const bulkPart = bulk ?
    `${bulk.pendingRequests}:${bulk.maxPendingRequests}:${bulk.saturatedPeerCount}` :
    PRESSURE_PASS_LITERAL.EMPTY_BULK_PART;
  let sig = `${rev}|${bulkPart}`;
  const queues = facts.outboundQueues;
  if (queues && typeof queues === PRESSURE_PASS_LITERAL.OBJECT_TYPE) {
    for (const [nodeId, q] of Object.entries(queues)) {
      if (!q) continue;
      sig +=
        `|${nodeId}:${q.pending}:${q.pendingCritical}:` +
        `${q.pendingCriticalReserveEligible}:${q.pendingReadiness}:` +
        `${q.pendingBackground}:${q.inFlight}:${q.maxPending}:` +
        `${q.criticalReserve}:${q.readinessReserve}:${q.backgroundPendingLimit}`;
    }
  }
  return sig;
}

const PRESSURE_PASS_UNAVAILABLE = Object.freeze({
  available: false,
  facts: null,
  summariesByPartition: null,
});

function invokeRouterPressureFacts(messageRouter) {
  if (!messageRouter) {
    return null;
  }
  if (messageRouter.getAdmissionPressureFacts) {
    return messageRouter.getAdmissionPressureFacts();
  }
  return messageRouter.readAdmissionPressureFacts ?
    messageRouter.readAdmissionPressureFacts() :
    null;
}

function hasRouterPressureFacts(messageRouter) {
  return Boolean(
    messageRouter &&
      (messageRouter.getAdmissionPressureFacts ||
        messageRouter.readAdmissionPressureFacts),
  );
}

function isPassFactsSnapshotCurrent(pass, messageRouter) {
  if (!pass || pass.router !== messageRouter || pass.facts === null) {
    return false;
  }
  if (computePressureFactsSignature(pass.facts) !== pass.factsSignature) {
    return false;
  }
  const currentRevision = readRouterPressureRevision(messageRouter);
  if (currentRevision !== null) {
    return currentRevision === pass.revision;
  }
  return true;
}

function readPressureFactsForPass(governor) {
  const messageRouter = governor.messageRouter;
  if (!hasRouterPressureFacts(messageRouter)) {
    return PRESSURE_PASS_UNAVAILABLE;
  }
  const pass = governor.activeEvaluationPass;
  if (!pass || pass.router !== messageRouter) {
    return {
      available: true,
      facts: invokeRouterPressureFacts(messageRouter),
      summariesByPartition: null,
    };
  }
  if (isPassFactsSnapshotCurrent(pass, messageRouter)) {
    return {
      available: true,
      facts: pass.facts,
      summariesByPartition: pass.summariesByPartition,
    };
  }
  pass.summariesByPartition.clear();
  const facts = invokeRouterPressureFacts(messageRouter);
  const currentRevision = readRouterPressureRevision(messageRouter);
  const factsRevision = Number.isFinite(facts?.pressureRevision) ?
    facts.pressureRevision :
    null;
  pass.facts = facts;
  pass.revision = currentRevision !== null ? currentRevision : factsRevision;
  pass.factsSignature = computePressureFactsSignature(facts);
  return {
    available: true,
    facts,
    summariesByPartition: pass.summariesByPartition,
  };
}

function runWithPressureEvaluationPass(governor, fn) {
  if (governor.activeEvaluationPass) {
    return fn();
  }
  governor.activeEvaluationPass = {
    router: governor.messageRouter,
    revision: null,
    facts: null,
    factsSignature: null,
    summariesByPartition: new Map(),
  };
  try {
    return fn();
  } finally {
    governor.activeEvaluationPass = null;
  }
}

export {
  PRESSURE_GOVERNOR_EVENT,
  notifyPressureReleases,
  readPressureFactsForPass,
  runWithPressureEvaluationPass,
  splitPressureReleases,
};
