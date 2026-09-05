/**
 * Published membership epoch reading — the single decode from a planning
 * answer's `publishedPlanningEpoch` (or a publication row's epoch column) to
 * the readable/unreadable current-epoch value that epoch fences consume.
 *
 *   null / undefined / absent  -> null   (no PUBLISHED epoch to fence against;
 *                                          callers defer, they never compare)
 *   non-negative integer N     -> N      (zero stays zero)
 *   anything else              -> null   (unreadable; fail closed by deferral)
 *
 * `Number(null)` is 0, so a local `Number(value)` reinterpretation turns
 * "no publication is PUBLISHED yet" into a readable epoch 0: the planner then
 * stamps moves with epoch 0 and the dispatch fence later rejects them as
 * "Stale dispatch for published membership epoch 0" once the first
 * publication lands. This module owns that decode once.
 */

/**
 * @param {*} value - Raw published epoch from the readiness planning answer
 *   or a publication row.
 * @return {number|null} The readable epoch, or null when unreadable.
 */
function readPublishedMembershipEpoch(value) {
  return Number.isInteger(value) && value >= 0 ? value : null;
}

export {readPublishedMembershipEpoch};
