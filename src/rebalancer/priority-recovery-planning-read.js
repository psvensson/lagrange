// The single owner of priority-recovery planning READ POLICY.
//
// Two contracts live here, and they are not interchangeable:
//
//   AVAILABLE                  - narration, progress, follow-up and ordinary
//                                planning. It never escalates to the owner
//                                read, and answers null only when AVAILABLE
//                                evidence genuinely is unavailable.
//   AUTHORITATIVE_REMOVE_SAFETY - the only contract permitted to decide that
//                                a priority-control-plane REMOVE is SAFE. It
//                                reads the owner surface and nothing else; an
//                                unavailable owner read answers null, which
//                                the remove-safety owner reads as "defer".
//
// The defect this module exists to prevent: one generic reader named
// getPriorityRecoveryPlanningSnapshot served both concerns, and two class
// families each defined it, so the mode a caller got depended on which
// implementation its mixin chain installed last. Making the REMOVE-safety
// policy authoritative then silently converted every narration consumer to
// authoritative-or-nothing and collapsed recovery narration wholesale.
//
// Callers name the mode they want. Each family keeps its own partition
// classification and clock; only the read policy is owned here.

const PRIORITY_RECOVERY_PLANNING_READ_MODE = Object.freeze({
  AVAILABLE: 'available',
  AUTHORITATIVE_REMOVE_SAFETY: 'authoritative-remove-safety',
});

// Which AVAILABLE surfaces a family accepts, in precedence order. The two
// families have never accepted the same set, and that difference is real
// rather than accidental, so each one declares its order explicitly instead
// of inheriting whichever implementation its mixin chain installed last.
//
// getMembershipPublicationPlanningSnapshot is the async CANDIDATE derivation.
// It is not the owner read - nothing here ever reaches
// getPriorityRecoveryPlanningAnswerForOwnerRead - but it is the heavier of
// the AVAILABLE surfaces, so only the family that has always accepted it
// still does.
const AVAILABLE_PLANNING_SURFACE_ORDER = Object.freeze({
  // The operation-workflow family: the best-effort compatibility surfaces.
  BEST_EFFORT: Object.freeze([
    'getPriorityRecoveryPlanningSnapshotBestEffort',
    'getMembershipPublicationPlanningSnapshotBestEffort',
  ]),
  // The unified-rebalancer planning family: the same, and the candidate
  // derivation as a last resort when a deployment exposes no best-effort
  // surface at all.
  BEST_EFFORT_THEN_CANDIDATE: Object.freeze([
    'getPriorityRecoveryPlanningSnapshotBestEffort',
    'getMembershipPublicationPlanningSnapshotBestEffort',
    'getMembershipPublicationPlanningSnapshot',
  ]),
});

/**
 * The first surface in `surfaces` this service actually implements.
 * @param {Object} readinessService
 * @param {string[]} surfaces
 * @return {string|null}
 */
function resolveAvailablePlanningSurface(readinessService, surfaces) {
  if (!readinessService) {
    return null;
  }
  for (const surface of surfaces) {
    if (typeof readinessService[surface] === 'function') {
      return surface;
    }
  }
  return null;
}

/**
 * @param {*} snapshot
 * @return {Object|null}
 */
function normalizePlanningSnapshot(snapshot) {
  return snapshot && typeof snapshot === 'object' ? snapshot : null;
}

/**
 * Whether a readiness service can answer the AVAILABLE contract at all.
 * @param {Object} readinessService
 * @return {boolean}
 */
function hasAvailablePriorityRecoveryPlanningProvider(
  readinessService,
  surfaces = AVAILABLE_PLANNING_SURFACE_ORDER.BEST_EFFORT,
) {
  return resolveAvailablePlanningSurface(readinessService, surfaces) !== null;
}

/**
 * Whether a readiness service can answer the REMOVE-safety contract. Only the
 * owner-read surface counts: a service that exposes nothing but the AVAILABLE
 * surfaces must fail this guard rather than pass it and answer null later.
 * @param {Object} readinessService
 * @return {boolean}
 */
function hasAuthoritativeRemoveSafetyPlanningProvider(readinessService) {
  return Boolean(readinessService) &&
    typeof readinessService.getPriorityRecoveryPlanningAnswerForOwnerRead ===
      'function';
}

/**
 * AVAILABLE planning evidence for one priority-control-plane partition.
 * @param {Object} read
 * @param {Object} read.readinessService
 * @param {string} read.publicationNodeId
 * @param {number} read.observedAt
 * @param {string[]} [read.surfaces] - this family's accepted surface order
 * @return {Promise<Object|null>}
 */
async function readAvailablePriorityRecoveryPlanningSnapshot({
  readinessService,
  publicationNodeId,
  observedAt,
  surfaces = AVAILABLE_PLANNING_SURFACE_ORDER.BEST_EFFORT,
}) {
  const surface = resolveAvailablePlanningSurface(readinessService, surfaces);
  if (surface === null) {
    return null;
  }
  return normalizePlanningSnapshot(
    await readinessService[surface](publicationNodeId, observedAt),
  );
}

/**
 * AUTHORITATIVE planning evidence for a priority-control-plane REMOVE-safety
 * decision. There is no AVAILABLE fallback: null means the decision defers.
 * @param {Object} read
 * @param {Object} read.readinessService
 * @param {string} read.publicationNodeId
 * @param {number} read.observedAt
 * @return {Promise<Object|null>}
 */
async function readAuthoritativePriorityRecoveryPlanningSnapshotForRemoveSafety({
  readinessService,
  publicationNodeId,
  observedAt,
}) {
  if (!hasAuthoritativeRemoveSafetyPlanningProvider(readinessService)) {
    return null;
  }
  return normalizePlanningSnapshot(
    await readinessService.getPriorityRecoveryPlanningAnswerForOwnerRead(
      publicationNodeId,
      observedAt,
    ),
  );
}

/**
 * The REMOVE-safety planning read, as a resolver one whole evaluation shares.
 *
 * Four sub-checks - completion safety, published-membership safety, projected
 * quorum and leader safety - need the same authoritative evidence, so the
 * remove-safety owner boundary resolves it once and threads this resolver
 * through them rather than performing four owner reads for one decision.
 * @param {Object} context - the remove-safety owner
 * @param {Object} operation
 * @return {function(): Promise<Object|null>}
 */
function createRemoveSafetyPlanningSnapshotReader(context, operation) {
  let pending = null;
  return () => {
    if (!pending) {
      pending = context
        .readAuthoritativePriorityRecoveryPlanningSnapshotForRemoveSafety(
          operation,
        );
    }
    return pending;
  };
}

/**
 * The resolver a sub-check should use: the one the owner boundary supplied, or
 * its own single read when it was invoked directly.
 * @param {Object} context - the remove-safety owner
 * @param {Object} operation
 * @param {function(): Promise<Object|null>} [readPlanningSnapshot]
 * @return {function(): Promise<Object|null>}
 */
function resolveRemoveSafetyPlanningSnapshotReader(
  context,
  operation,
  readPlanningSnapshot,
) {
  return typeof readPlanningSnapshot === 'function' ?
    readPlanningSnapshot :
    createRemoveSafetyPlanningSnapshotReader(context, operation);
}

export {
  AVAILABLE_PLANNING_SURFACE_ORDER,
  createRemoveSafetyPlanningSnapshotReader,
  resolveRemoveSafetyPlanningSnapshotReader,
  PRIORITY_RECOVERY_PLANNING_READ_MODE,
  hasAuthoritativeRemoveSafetyPlanningProvider,
  hasAvailablePriorityRecoveryPlanningProvider,
  readAuthoritativePriorityRecoveryPlanningSnapshotForRemoveSafety,
  readAvailablePriorityRecoveryPlanningSnapshot,
};
