import {buildAnsweredIncompleteOperationListObservation} from
  '../../src/rebalancer/incomplete-operation-list-observation.js';

/**
 * Replace a coordinator's incomplete-operation list read with an ANSWERED
 * read of the given list: the repository's own answered-read recorder
 * returns the PRESENT (or confirmed EMPTY) observation, exactly as after a
 * successful authoritative read.
 * @param {Object} coordinator
 * @param {Function} listOf - () => the answered list (re-evaluated per read).
 * @return {void}
 */
function stubAnsweredIncompleteOperationsRead(coordinator, listOf) {
  const answeredRead = async () =>
    coordinator.repository.recordAnsweredIncompleteOperationRead(listOf());
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
    observation: buildAnsweredIncompleteOperationListObservation(
      Array.from({length: operationCount}, (_unused, index) =>
        ({operationId: `counted-${index}`}))),
  });
}

export {answeredPriorityClassCounts, stubAnsweredIncompleteOperationsRead};
