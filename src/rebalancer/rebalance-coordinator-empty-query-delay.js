function shouldDelayEmptyIncompleteOperationQuery(coordinator, now = Date.now()) {
  const workflowOwner = coordinator.workflowOwner;
  if (
    !workflowOwner ||
    workflowOwner.incompleteOperationQueryEmptyBackoffMs <= 0
  ) {
    return false;
  }
  if (workflowOwner.lastEmptyIncompleteOperationQueryAtMs <= 0) {
    workflowOwner.lastEmptyIncompleteOperationQueryAtMs = now;
    return true;
  }
  if (
    now - workflowOwner.lastEmptyIncompleteOperationQueryAtMs <
    workflowOwner.incompleteOperationQueryEmptyBackoffMs
  ) {
    return true;
  }
  workflowOwner.lastEmptyIncompleteOperationQueryAtMs = 0;
  return false;
}

function markEmptyIncompleteOperationQueryAt(coordinator, now = Date.now()) {
  if (coordinator.workflowOwner) {
    coordinator.workflowOwner.lastEmptyIncompleteOperationQueryAtMs = now;
  }
}

function clearEmptyIncompleteOperationQueryDelay(coordinator) {
  if (coordinator.workflowOwner) {
    coordinator.workflowOwner.lastEmptyIncompleteOperationQueryAtMs = 0;
  }
}

export {
  clearEmptyIncompleteOperationQueryDelay,
  markEmptyIncompleteOperationQueryAt,
  shouldDelayEmptyIncompleteOperationQuery,
};
