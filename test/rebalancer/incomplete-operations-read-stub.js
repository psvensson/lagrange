/**
 * Replace a coordinator's incomplete-operation list read with an ANSWERED
 * read of the given list: the repository records it as the owner's complete
 * answer, so the list observation is PRESENT (or a confirmed EMPTY), exactly
 * as after a successful authoritative read. A stub that skips this leaves
 * the observation unanswered (DEFERRED), which holds admission gates.
 * @param {Object} coordinator
 * @param {Function} listOf - () => the answered list (re-evaluated per read).
 * @return {void}
 */
function stubAnsweredIncompleteOperationsRead(coordinator, listOf) {
  const answeredRead = async () => {
    const operations = listOf();
    const repository = coordinator.repository;
    repository.recordIncompleteOperationObservation(operations);
    repository.clearIncompleteOperationReadOutcome();
    repository.lastIncompleteOperationReadComplete = true;
    return operations;
  };
  Object.assign(coordinator, {queryIncompleteOperations: answeredRead});
}

/**
 * ADD budget counts by priority class as the coordinator returns them after
 * an ANSWERED list read: the counts plus the list observation they were
 * counted from (complete, PRESENT or a confirmed EMPTY). A count stub without
 * an answered observation is an unknown count, which holds the planner's
 * ordinary-priority serial gate.
 * @param {Object} counts - {priorityCount, ordinaryPriorityCount,
 *   emergencyPriorityCount, nonPriorityCount}
 * @return {Object}
 */
function answeredPriorityClassCounts(counts) {
  const operationCount = (counts.priorityCount || 0) +
    (counts.nonPriorityCount || 0);
  return Object.freeze({
    ...counts,
    observation: Object.freeze({
      state: operationCount > 0 ? 'present' : 'empty',
      complete: true,
      operationCount,
      deferredOutcome: null,
      retryAfterMs: null,
    }),
  });
}

export {answeredPriorityClassCounts, stubAnsweredIncompleteOperationsRead};
