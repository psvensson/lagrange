const BACKGROUND_PRIORITY_SPREAD_RELEASE_STATE = Object.freeze({
  STABILIZING: 'stabilizing',
});

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
  const scope = {parent: null, tracker: null};
  releaseScopeByReadinessOwner.set(readinessOwner, scope);
  return scope;
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
  nextScope.parent = previousScope;
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
  BACKGROUND_PRIORITY_SPREAD_RELEASE_STATE,
  isBackgroundPrioritySpreadReleaseActive,
  isBackgroundPrioritySpreadReleaseOwner,
  observeActiveBackgroundPrioritySpreadReleaseBlocked,
  observeActiveBackgroundPrioritySpreadOperationDrain,
  observeBackgroundPrioritySpreadBlocked,
  resolveBackgroundPrioritySpreadStableRelease,
  transferBackgroundPrioritySpreadReleaseOwnership,
};
