const BACKGROUND_PRIORITY_SPREAD_RELEASE_STATE = Object.freeze({
  // The durable release condition holds and its dwell is still running.
  STABILIZING: 'stabilizing',
  // The durable release condition was observed NOT to hold: dwell rearmed.
  CONDITION_NOT_HELD: 'condition_not_held',
  // An input of the durable release condition could not be read: the fence
  // holds (unavailability never counts as clear) but the dwell is NOT
  // restarted: an unknown is no evidence that the condition stopped holding.
  // A lease that lapses before its refresh lands answers STALE for a moment;
  // restarting a 70 s window on each such moment would let ordinary load
  // keep the fence closed (R12). A real change during the unknown span is
  // still seen: an in-flight transition reads NOT_HELD, and one that started
  // and drained inside the span is a newly drained operation id.
  CONDITION_UNAVAILABLE: 'condition_unavailable',
});

/**
 * What one evaluation observed about the durable condition the stability
 * dwell stands for (no non-terminal fence-holding transition, and every
 * required member node serve-eligible). The observer
 * (background-priority-spread-release-condition.js) reads the inputs; this
 * tracker owns only the dwell law: the clock runs from the first HELD
 * observation, a NOT_HELD observation or a newly drained fence-holding
 * operation rearms it, an UNAVAILABLE one holds it without rearming, and
 * only a HELD observation can release.
 */
const BACKGROUND_PRIORITY_SPREAD_RELEASE_CONDITION_STATE = Object.freeze({
  HELD: 'held',
  NOT_HELD: 'not_held',
  UNAVAILABLE: 'unavailable',
});

// What each condition observation means for the dwell. An observation that
// states neither HELD nor NOT_HELD (absent included) is the named
// CONDITION_UNAVAILABLE hold, never an implied HELD.
const RELEASE_STATE_BY_CONDITION_STATE = Object.freeze({
  [BACKGROUND_PRIORITY_SPREAD_RELEASE_CONDITION_STATE.HELD]:
    BACKGROUND_PRIORITY_SPREAD_RELEASE_STATE.STABILIZING,
  [BACKGROUND_PRIORITY_SPREAD_RELEASE_CONDITION_STATE.NOT_HELD]:
    BACKGROUND_PRIORITY_SPREAD_RELEASE_STATE.CONDITION_NOT_HELD,
});

function resolveReleaseStateForCondition(releaseConditionState) {
  return Object.hasOwn(RELEASE_STATE_BY_CONDITION_STATE, releaseConditionState) ?
    RELEASE_STATE_BY_CONDITION_STATE[releaseConditionState] :
    BACKGROUND_PRIORITY_SPREAD_RELEASE_STATE.CONDITION_UNAVAILABLE;
}

const EMPTY_WAKE_KEY_LENGTH = 0;
// The tracker field holding the ids of the drained fence-holding operations
// it has seen (a Set); absent until the first sample baselines it.
const DRAINED_OPERATION_IDS_FIELD = 'drainedFenceHoldingOperationIds';

const releaseScopeByReadinessOwner = new WeakMap();

function isBackgroundPrioritySpreadReleaseOwner(value) {
  return (
    (typeof value === 'object' && value !== null) ||
    typeof value === 'function'
  );
}

function normalizeObservedAt(value) {
  return Number.isFinite(value) ? Math.floor(value) : Date.now();
}

function resolveCanonicalReleaseScope(scope) {
  let root = scope;
  while (root?.parent) {
    root = root.parent;
  }
  let cursor = scope;
  while (cursor?.parent && cursor.parent !== root) {
    const next = cursor.parent;
    cursor.parent = root;
    cursor = next;
  }
  return root || null;
}

function getReleaseScope(readinessOwner, options = {}) {
  if (!isBackgroundPrioritySpreadReleaseOwner(readinessOwner)) {
    return null;
  }
  const existingScope = releaseScopeByReadinessOwner.get(readinessOwner);
  if (existingScope || options.create !== true) {
    return resolveCanonicalReleaseScope(existingScope);
  }
  const scope = {parent: null, tracker: null, wakeCallbacksByKey: new Map()};
  releaseScopeByReadinessOwner.set(readinessOwner, scope);
  return scope;
}

function getReleaseScopeWakeRegistry(scope) {
  if (!scope.wakeCallbacksByKey) {
    scope.wakeCallbacksByKey = new Map();
  }
  return scope.wakeCallbacksByKey;
}

function mergeReleaseScopeWakeRegistries(survivingScope, absorbedScope) {
  const absorbedRegistry = absorbedScope.wakeCallbacksByKey;
  if (!absorbedRegistry || absorbedRegistry.size === 0) {
    return;
  }
  const survivingRegistry = getReleaseScopeWakeRegistry(survivingScope);
  for (const [wakeKey, onStableRelease] of absorbedRegistry) {
    survivingRegistry.set(wakeKey, onStableRelease);
  }
  absorbedRegistry.clear();
}

function notifyBackgroundPrioritySpreadStableRelease(scope) {
  const registry = scope.wakeCallbacksByKey;
  if (!registry || registry.size === 0) {
    return;
  }
  const wakeCallbacks = [...registry.values()];
  registry.clear();
  for (const onStableRelease of wakeCallbacks) {
    try {
      onStableRelease();
    } catch (wakeListenerError) {
      // One failing wake listener must not strand the remaining parked
      // entities; every registrant keeps its scheduled fallback timer, so
      // a failed wake degrades to the pre-wake timer cadence. The failure
      // is recorded on the scope for diagnostics (same idiom as the raft
      // committed-prefix divergence listener capture) — never swallowed
      // invisibly.
      scope.lastWakeListenerError = wakeListenerError;
    }
  }
}

function mergeReleaseTrackers(left, right) {
  if (!left || left.active !== true) {
    return right || left || null;
  }
  if (!right || right.active !== true) {
    return left;
  }
  left.lastBlockedObservedAtMs = Math.max(
    left.lastBlockedObservedAtMs,
    right.lastBlockedObservedAtMs,
  );
  left.clearObservedAtMs =
    Number.isFinite(left.clearObservedAtMs) &&
    Number.isFinite(right.clearObservedAtMs) ?
      Math.max(left.clearObservedAtMs, right.clearObservedAtMs) :
      null;
  left.conditionHeldSinceMs =
    Number.isFinite(left.conditionHeldSinceMs) &&
    Number.isFinite(right.conditionHeldSinceMs) ?
      Math.max(left.conditionHeldSinceMs, right.conditionHeldSinceMs) :
      null;
  // Two baselines are no baseline: the next sample re-adopts.
  delete left[DRAINED_OPERATION_IDS_FIELD];
  return left;
}

function transferBackgroundPrioritySpreadReleaseOwnership(
  previousReadinessOwner,
  nextReadinessOwner,
) {
  if (
    previousReadinessOwner === nextReadinessOwner ||
    !isBackgroundPrioritySpreadReleaseOwner(previousReadinessOwner) ||
    !isBackgroundPrioritySpreadReleaseOwner(nextReadinessOwner)
  ) {
    return;
  }
  const previousScope = getReleaseScope(previousReadinessOwner);
  if (!previousScope) {
    return;
  }
  const nextScope = getReleaseScope(nextReadinessOwner, {create: true});
  if (previousScope === nextScope) {
    return;
  }
  const sharedTracker = mergeReleaseTrackers(
    previousScope.tracker,
    nextScope.tracker,
  );
  previousScope.tracker = sharedTracker;
  nextScope.tracker = null;
  mergeReleaseScopeWakeRegistries(previousScope, nextScope);
  nextScope.parent = previousScope;
}

/**
 * Register one parked entity's event-driven wake with the shared release
 * tracker. The callback fires exactly once, when the tracker declares the
 * stable release (active -> false); registration never replaces the
 * registrant's scheduled fallback timer. Re-registration under the same
 * wakeKey replaces the previous callback, so an entity that re-parks keeps
 * one pending wake.
 * @param {Object} options
 * @param {Object} options.readinessOwner shared readiness-owner scope key
 * @param {string} options.wakeKey stable per-entity key (the entityId)
 * @param {Function} options.onStableRelease wake callback
 * @return {boolean} whether the wake was registered on an active tracker
 */
function registerBackgroundPrioritySpreadReleaseWake(options = {}) {
  const scope = getReleaseScope(options.readinessOwner);
  const wakeKey =
    typeof options.wakeKey === 'string' ? options.wakeKey.trim() : '';
  if (
    !scope ||
    scope.tracker?.active !== true ||
    wakeKey.length === EMPTY_WAKE_KEY_LENGTH ||
    typeof options.onStableRelease !== 'function'
  ) {
    return false;
  }
  getReleaseScopeWakeRegistry(scope).set(wakeKey, options.onStableRelease);
  return true;
}

function observeBackgroundPrioritySpreadBlocked(options = {}) {
  const scope = getReleaseScope(options.readinessOwner, {create: true});
  if (!scope) {
    return;
  }
  const tracker = scope.tracker || {};
  tracker.active = true;
  tracker.lastBlockedObservedAtMs =
    normalizeObservedAt(options.observedAt);
  tracker.clearObservedAtMs = null;
  tracker.conditionHeldSinceMs = null;
  // A blocked observation restarts everything, the drain baseline included.
  delete tracker[DRAINED_OPERATION_IDS_FIELD];
  scope.tracker = tracker;
}

function isBackgroundPrioritySpreadReleaseActive(options = {}) {
  const scope = getReleaseScope(options.readinessOwner);
  return scope?.tracker?.active === true;
}

/**
 * Observe the drained fence-holding operations (the ids of every retained
 * terminal priority control-plane or founding transition). A transition that
 * started and drained entirely between two evaluations is still a change, so
 * an id the tracker has not seen before rearms the dwell at THIS
 * observation's instant. Drains are identified by operation id, never by a
 * remote completion timestamp: no fast transition stamped earlier than
 * another is invisible, and no future-stamped row can tie or flip the
 * answer. The first sample after activation only baselines: the dwell has
 * not started before the first HELD observation, so nothing earlier counts.
 * @param {Object} options
 * @param {Object} options.readinessOwner
 * @param {Array<string>} options.drainedOperationIds
 * @param {number} options.observedAt
 * @return {Array<string>} the newly drained ids that rearmed the dwell
 */
function observeActiveBackgroundPrioritySpreadTransitionDrains(options = {}) {
  const scope = getReleaseScope(options.readinessOwner);
  const tracker = scope?.tracker;
  if (!tracker || tracker.active !== true) {
    return [];
  }
  const drainedOperationIds = new Set(options.drainedOperationIds);
  const seen = tracker[DRAINED_OPERATION_IDS_FIELD];
  tracker[DRAINED_OPERATION_IDS_FIELD] = drainedOperationIds;
  if (!(seen instanceof Set)) {
    return [];
  }
  const newlyDrained = [...drainedOperationIds]
    .filter((operationId) => !seen.has(operationId));
  if (newlyDrained.length > 0) {
    tracker.lastBlockedObservedAtMs = normalizeObservedAt(options.observedAt);
    tracker.clearObservedAtMs = null;
    tracker.conditionHeldSinceMs = null;
  }
  return newlyDrained;
}

function buildStableReleaseHold(tracker, releaseState, requiredStableMs,
  stableElapsedMs) {
  return Object.freeze({
    state: releaseState,
    requiredStableMs,
    stableElapsedMs,
    stableRemainingMs: Math.max(0, requiredStableMs - stableElapsedMs),
    clearObservedAtMs: Number.isFinite(tracker.clearObservedAtMs) ?
      tracker.clearObservedAtMs : null,
    lastBlockedObservedAtMs: tracker.lastBlockedObservedAtMs,
    blockedPartitions: Object.freeze([]),
  });
}

/**
 * Advance the dwell for one evaluation that observed no priority spread
 * blocker. `options.releaseConditionState` is that evaluation's observation
 * of the durable release condition. The dwell clock runs only from the
 * first HELD observation; a NOT_HELD observation rearms it; an UNAVAILABLE
 * observation holds the fence without rearming it (CONDITION_UNAVAILABLE)
 * and can never release it; a newly drained fence-holding transition rearms
 * it at the observing instant (it never back-dates the clock).
 * @param {Object} options
 * @return {Object|null} the hold, or null when inactive or released
 */
function resolveBackgroundPrioritySpreadStableRelease(options = {}) {
  const scope = getReleaseScope(options.readinessOwner);
  const tracker = scope?.tracker;
  if (!tracker || tracker.active !== true) {
    return null;
  }
  const requiredStableMs = Number.isFinite(options.requiredStableMs) ?
    Math.max(0, Math.floor(options.requiredStableMs)) :
    0;
  const observedAt = normalizeObservedAt(options.observedAt);
  const releaseState =
    resolveReleaseStateForCondition(options.releaseConditionState);
  if (releaseState === BACKGROUND_PRIORITY_SPREAD_RELEASE_STATE.CONDITION_NOT_HELD) {
    tracker.lastBlockedObservedAtMs = observedAt;
    tracker.clearObservedAtMs = null;
    tracker.conditionHeldSinceMs = null;
    return buildStableReleaseHold(tracker, releaseState, requiredStableMs, 0);
  }
  if (releaseState ===
      BACKGROUND_PRIORITY_SPREAD_RELEASE_STATE.CONDITION_UNAVAILABLE) {
    return buildStableReleaseHold(tracker, releaseState, requiredStableMs,
      Number.isFinite(tracker.clearObservedAtMs) ?
        Math.max(0, observedAt - tracker.clearObservedAtMs) : 0);
  }
  if (!Number.isFinite(tracker.conditionHeldSinceMs)) {
    tracker.conditionHeldSinceMs = observedAt;
  }
  tracker.clearObservedAtMs = Number.isFinite(tracker.clearObservedAtMs) ?
    Math.max(tracker.clearObservedAtMs, tracker.conditionHeldSinceMs) :
    observedAt;
  const stableElapsedMs = Math.max(
    0,
    observedAt - tracker.clearObservedAtMs,
  );
  if (stableElapsedMs >= requiredStableMs) {
    tracker.active = false;
    notifyBackgroundPrioritySpreadStableRelease(scope);
    return null;
  }
  return buildStableReleaseHold(tracker, releaseState, requiredStableMs,
    stableElapsedMs);
}

export {
  BACKGROUND_PRIORITY_SPREAD_RELEASE_CONDITION_STATE,
  BACKGROUND_PRIORITY_SPREAD_RELEASE_STATE,
  isBackgroundPrioritySpreadReleaseActive,
  isBackgroundPrioritySpreadReleaseOwner,
  observeActiveBackgroundPrioritySpreadTransitionDrains,
  observeBackgroundPrioritySpreadBlocked,
  registerBackgroundPrioritySpreadReleaseWake,
  resolveBackgroundPrioritySpreadStableRelease,
  transferBackgroundPrioritySpreadReleaseOwnership,
};
