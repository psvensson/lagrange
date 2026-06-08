/**
 * Join-admission concurrency budget derived from control-plane distribution.
 *
 * Root context (see architecture/contracts/active-gate-convergence.md →
 * "Candidate direction — admission gated on control-plane distribution"): during
 * a rolling restart the surviving seed is often the *sole* published node and is
 * saturated servicing the whole cluster's control plane, so rejoining peers'
 * WebSocket handshakes time out and their control-plane writes fail. The fix is
 * admission backpressure proportional to *distributed serving capacity*: admit
 * enough joins to BUILD spread while deferring the excess that would only pile
 * load on a saturated owner.
 *
 * The capacity signal is `buildDerivedPriorityPartitionSummary`
 * (src/control-plane/membership-publication-priority-partition-summary.js): a
 * direct structural count of distinct readiness-promotable nodes hosting a ready
 * replica of each priority control-plane partition (`readyDistinctNodeCount`)
 * vs `requiredDistinctNodeCount = min(target, eligibleNodeCount)`. The
 * `min(target, eligibleNodeCount)` term auto-scales to cluster size, so a
 * single-node cluster is never "under-spread" — the anti-deadlock guard.
 *
 * Policy (only narrows the operator-configured `maxConcurrentBootstrapRequests`,
 * never raises it):
 *   gating disabled         -> configuredMax (today's behavior; opt-in)
 *   summary missing/invalid -> conservativeFloor (conservative under uncertainty)
 *   spread satisfied        -> configuredMax (no extra throttle)
 *   under-spread            -> clamp(max(floor, minReadyDistinctNodeCount), 1, configuredMax)
 *                              (admit ~one join per currently-ready host node so
 *                               spread ramps without overwhelming the owner)
 */

const DEFAULT_CONSERVATIVE_FLOOR = 1;

function normalizeNonNegativeInteger(value, fallback) {
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

function clamp(value, lowerBound, upperBound) {
  return Math.max(lowerBound, Math.min(value, upperBound));
}

/**
 * Defensively dig the priority-partition distribution summary out of a
 * bootstrap-join admission / readiness snapshot. The readiness owner attaches it
 * under the priority-control-plane-recovery dimension's `details`; tolerate
 * several shapes so a projection change cannot silently disable the gate.
 * @param {Object|null} snapshot
 * @return {Object|null}
 */
function extractPriorityPartitionSummary(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return null;
  }
  const candidates = [
    snapshot.priorityPartitionSummary,
    snapshot.details?.priorityPartitionSummary,
    snapshot.priorityControlPlaneRecovery?.details?.priorityPartitionSummary,
  ];
  const dimensions = snapshot.dimensions || snapshot.health || null;
  if (dimensions && typeof dimensions === 'object') {
    for (const dimension of Object.values(dimensions)) {
      const summary = dimension?.details?.priorityPartitionSummary;
      if (summary && typeof summary === 'object') {
        candidates.push(summary);
      }
    }
  }
  for (const candidate of candidates) {
    if (
      candidate &&
      typeof candidate === 'object' &&
      typeof candidate.satisfied === 'boolean'
    ) {
      return candidate;
    }
  }
  return null;
}

/**
 * @param {Object} args
 * @param {number} args.configuredMax - operator `maxConcurrentBootstrapRequests`.
 * @param {Object|null} args.priorityPartitionSummary - distribution summary.
 * @param {boolean} args.enabled - distribution-aware admission gating enabled.
 * @param {number} [args.conservativeFloor=1]
 * @return {number} Effective concurrent-join budget (never exceeds configuredMax).
 */
function resolveJoinAdmissionConcurrencyBudget({
  configuredMax,
  priorityPartitionSummary,
  enabled,
  conservativeFloor = DEFAULT_CONSERVATIVE_FLOOR,
}) {
  const normalizedMax = normalizeNonNegativeInteger(configuredMax, 0);
  // Preserve today's semantics when gating is off or the configured cap is not a
  // usable positive bound.
  if (enabled !== true || normalizedMax <= 0) {
    return configuredMax;
  }
  const floor = clamp(
    normalizeNonNegativeInteger(conservativeFloor, DEFAULT_CONSERVATIVE_FLOOR),
    1,
    normalizedMax,
  );
  const summary = priorityPartitionSummary;
  if (!summary || typeof summary.satisfied !== 'boolean') {
    // No trustworthy distribution view -> throttle hard. A deferred joiner backs
    // off and retries; it is never failed.
    return floor;
  }
  if (summary.satisfied === true) {
    return normalizedMax;
  }
  const blockedPartitions = Array.isArray(summary.blockedPartitions) ?
    summary.blockedPartitions :
    [];
  if (blockedPartitions.length === 0) {
    return floor;
  }
  const minReadyDistinctNodeCount = blockedPartitions.reduce(
    (minSoFar, partition) =>
      Math.min(
        minSoFar,
        normalizeNonNegativeInteger(partition?.readyDistinctNodeCount, 0),
      ),
    Number.POSITIVE_INFINITY,
  );
  const proportionalBudget = Number.isFinite(minReadyDistinctNodeCount) ?
    minReadyDistinctNodeCount :
    0;
  return clamp(Math.max(floor, proportionalBudget), 1, normalizedMax);
}

export {
  extractPriorityPartitionSummary,
  resolveJoinAdmissionConcurrencyBudget,
};
