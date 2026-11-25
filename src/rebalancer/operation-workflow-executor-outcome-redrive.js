// CL-029: bound on consecutive lane waits in the re-drive loop (each wait
// is a full holder execution, not a poll); past it the timed retry owns
// the evidence.
const EXECUTOR_OUTCOME_REDRIVE_MAX_LANE_WAITS = 50;

/**
 * CL-029: apply retained executor-outcome evidence under the operation
 * lane until it is consumed. operationWorkflowRunExclusive COALESCES —
 * a held lane returns the holder's promise and discards the factory —
 * so a plain single submission loses the evidence whenever the dispatch
 * step-walk (or any other holder) owns the lane when the outcome
 * arrives (the target_sync wedge). Awaiting the coalesced promise IS
 * the wait for the holder to finish; the loop then resubmits the
 * LATEST retained payload. Exits: payload consumed (applied), a retry
 * timer armed (it re-enters here on fire), payload left untouched by a
 * reconcile that ran (intentional non-consumption, e.g. remote-owner
 * wake), reconcile error (routed to the transition-retry machinery),
 * or the lane-wait cap (falls back to the timed retry so the evidence
 * keeps an owner). A holder's rejection is NOT the outcome's failure —
 * it has its own retry owners — so !factoryRan rejections just loop.
 * @param {Object} owner
 * @param {string} operationId
 * @return {Promise<void>}
 */
async function runSingleExecutorOutcomeRedriveAttempt(
  owner,
  operationId,
  payload,
) {
  let factoryRan = false;
  let caughtError = null;
  let hasError = false;
  try {
    await owner.operationWorkflowRunExclusive(
      owner.getOperationOwnerSingleFlightKey(operationId),
      () => {
        factoryRan = true;
        return owner.reconcileExecutorOutcome(payload);
      },
    );
  } catch (error) {
    caughtError = error;
    hasError = true;
  }
  return {factoryRan, caughtError, hasError};
}

async function stepExecutorOutcomeRedrive(owner, operationId, laneWait = 0) {
  if (owner.isShuttingDown || !owner.isInitialized) {
    return;
  }
  if (laneWait >= EXECUTOR_OUTCOME_REDRIVE_MAX_LANE_WAITS) {
    const retained =
      owner.executorOutcomeRetryPayloadByOperationId.get(operationId);
    if (retained) {
      owner.scheduleRetainedExecutorOutcomeRetry(retained, null);
    }
    return;
  }
  const payload =
    owner.executorOutcomeRetryPayloadByOperationId.get(operationId);
  if (!payload || owner.executorOutcomeRetryTimerByOperationId.has(operationId)) {
    return;
  }
  const {factoryRan, caughtError, hasError} =
    await runSingleExecutorOutcomeRedriveAttempt(owner, operationId, payload);
  if (hasError) {
    if (
      !factoryRan ||
      owner.supersedesExecutorStepRetry(
        payload,
        owner.executorOutcomeRetryPayloadByOperationId.get(operationId),
      )
    ) {
      return stepExecutorOutcomeRedrive(owner, operationId, laneWait + 1);
    }
    owner.handleDeferredExecutorOutcomeRetryFailure(payload, caughtError, null);
    return;
  }
  if (!factoryRan) {
    return stepExecutorOutcomeRedrive(owner, operationId, laneWait + 1);
  }
  const retainedAfterRun =
    owner.executorOutcomeRetryPayloadByOperationId.get(operationId);
  if (retainedAfterRun === payload) {
    owner.scheduleRetainedExecutorOutcomeRetry(payload, null);
    return;
  }
  return stepExecutorOutcomeRedrive(owner, operationId, laneWait + 1);
}

async function redriveExecutorOutcomeReconcile(owner, operationId) {
  if (
    !operationId ||
    owner.executorOutcomeRedriveInFlightByOperationId.has(operationId)
  ) {
    return;
  }
  owner.executorOutcomeRedriveInFlightByOperationId.add(operationId);
  try {
    await stepExecutorOutcomeRedrive(owner, operationId, 0);
  } finally {
    owner.executorOutcomeRedriveInFlightByOperationId.delete(operationId);
  }
}

export {redriveExecutorOutcomeReconcile};
