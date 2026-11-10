// The single owner of priority-recovery planning READ POLICY.
//
// Two contracts live here, and they are not interchangeable:
//
//   AVAILABLE                  - narration, progress, follow-up and ordinary
//                                planning: the readiness service's one
//                                planning answer, read through the canonical
//                                reader. It never escalates to the owner
//                                read, and answers null only when no
//                                readiness service is installed.
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
// The two modes are two named functions, so a caller cannot reach the wrong
// one by passing the wrong argument. Each family keeps its own partition
// classification and clock; only the read policy is owned here.

import {
  readPriorityRecoveryPlanningAnswerSync,
} from '../control-plane/priority-recovery-planning-answer-origin.js';

/**
 * @param {*} snapshot
 * @return {Object|null}
 */
function normalizePlanningSnapshot(snapshot) {
  return snapshot && typeof snapshot === 'object' ? snapshot : null;
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
 * AVAILABLE planning evidence for one priority-control-plane partition: the
 * readiness service's one planning answer, settled. A family without a
 * readiness service has no AVAILABLE evidence (null).
 * @param {Object} read
 * @param {Object|null} read.readinessService
 * @param {string} read.publicationNodeId
 * @param {number} read.observedAt
 * @return {Object|null}
 */
function readAvailablePriorityRecoveryPlanningSnapshot({
  readinessService,
  publicationNodeId,
  observedAt,
}) {
  return readPriorityRecoveryPlanningAnswerSync(
    readinessService,
    publicationNodeId,
    observedAt,
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
  createRemoveSafetyPlanningSnapshotReader,
  resolveRemoveSafetyPlanningSnapshotReader,
  hasAuthoritativeRemoveSafetyPlanningProvider,
  readAuthoritativePriorityRecoveryPlanningSnapshotForRemoveSafety,
  readAvailablePriorityRecoveryPlanningSnapshot,
};
