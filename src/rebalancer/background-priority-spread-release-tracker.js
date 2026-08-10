const BACKGROUND_PRIORITY_SPREAD_RELEASE_STATE = Object.freeze({
  STABILIZING: 'stabilizing',
});

const EMPTY_WAKE_KEY_LENGTH = 0;

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
  scope.tracker = tracker;
}

function isBackgroundPrioritySpreadReleaseActive(options = {}) {
  const scope = getReleaseScope(options.readinessOwner);
  return scope?.tracker?.active === true;
}

function observeActiveBackgroundPrioritySpreadReleaseBlocked(options = {}) {
  const scope = getReleaseScope(options.readinessOwner);
  const tracker = scope?.tracker;
  if (!tracker || tracker.active !== true) {
    return false;
  }
  tracker.lastBlockedObservedAtMs =
    normalizeObservedAt(options.observedAt);
  tracker.clearObservedAtMs = null;
  return true;
}

function observeActiveBackgroundPrioritySpreadOperationDrain(options = {}) {
  const scope = getReleaseScope(options.readinessOwner);
  const tracker = scope?.tracker;
  if (
    !tracker ||
    tracker.active !== true ||
    !Number.isFinite(options.drainedAt)
  ) {
    return false;
  }
  const drainedAtMs = Math.floor(options.drainedAt);
  const lastBlockedObservedAtMs =
    Number.isFinite(tracker.lastBlockedObservedAtMs) ?
      tracker.lastBlockedObservedAtMs :
      Number.NEGATIVE_INFINITY;
  const clearObservedAtMs = Number.isFinite(tracker.clearObservedAtMs) ?
    tracker.clearObservedAtMs :
    Number.NEGATIVE_INFINITY;
  if (
    drainedAtMs <= lastBlockedObservedAtMs ||
    drainedAtMs <= clearObservedAtMs
  ) {
    return false;
  }
  tracker.lastBlockedObservedAtMs = drainedAtMs;
  tracker.clearObservedAtMs = drainedAtMs;
  return true;
}

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
  if (!Number.isFinite(tracker.clearObservedAtMs)) {
    tracker.clearObservedAtMs = observedAt;
  }
  const stableElapsedMs = Math.max(
    0,
    observedAt - tracker.clearObservedAtMs,
  );
  if (stableElapsedMs >= requiredStableMs) {
    tracker.active = false;
    notifyBackgroundPrioritySpreadStableRelease(scope);
    return null;
  }
  return Object.freeze({
    state: BACKGROUND_PRIORITY_SPREAD_RELEASE_STATE.STABILIZING,
    requiredStableMs,
    stableElapsedMs,
    stableRemainingMs: requiredStableMs - stableElapsedMs,
    clearObservedAtMs: tracker.clearObservedAtMs,
    lastBlockedObservedAtMs: tracker.lastBlockedObservedAtMs,
    blockedPartitions: Object.freeze([]),
  });
}

export {
  isBackgroundPrioritySpreadReleaseActive,
  isBackgroundPrioritySpreadReleaseOwner,
  observeActiveBackgroundPrioritySpreadReleaseBlocked,
  observeActiveBackgroundPrioritySpreadOperationDrain,
  observeBackgroundPrioritySpreadBlocked,
  registerBackgroundPrioritySpreadReleaseWake,
  resolveBackgroundPrioritySpreadStableRelease,
  transferBackgroundPrioritySpreadReleaseOwnership,
};
