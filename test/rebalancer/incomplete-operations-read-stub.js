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

export {stubAnsweredIncompleteOperationsRead};
