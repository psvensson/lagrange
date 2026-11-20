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
async function redriveExecutorOutcomeReconcile(owner, operationId) {
  if (
    !operationId ||
    owner.executorOutcomeRedriveInFlightByOperationId.has(operationId)
  ) {
    return;
  }
  owner.executorOutcomeRedriveInFlightByOperationId.add(operationId);
  try {
    for (
      let laneWait = 0;
      laneWait < EXECUTOR_OUTCOME_REDRIVE_MAX_LANE_WAITS;
      laneWait++
    ) {
      if (owner.isShuttingDown || !owner.isInitialized) {
        return;
      }
      const payload =
        owner.executorOutcomeRetryPayloadByOperationId.get(operationId);
      if (!payload) {
        return;
      }
      if (owner.executorOutcomeRetryTimerByOperationId.has(operationId)) {
        return;
      }
      let factoryRan = false;
      try {
        await owner.operationWorkflowRunExclusive(
          owner.getOperationOwnerSingleFlightKey(operationId),
          () => {
            factoryRan = true;
            return owner.reconcileExecutorOutcome(payload);
          },
        );
      } catch (error) {
        if (!factoryRan || owner.supersedesExecutorStepRetry(payload,
          owner.executorOutcomeRetryPayloadByOperationId.get(operationId))) {
          continue;
        }
        // Retryable reconcile failures re-arm the OUTCOME retry (with
        // the deferred completion context preserved); non-retryable
        // failures log OUTCOME_TRANSITION_FAILED. Either way the error
        // belongs to the outcome, never to the coalesced lane holder.
        owner.handleDeferredExecutorOutcomeRetryFailure(
          payload,
          error,
          null,
        );
        return;
      }
      if (!factoryRan) {
        continue;
      }
      const retainedAfterRun =
        owner.executorOutcomeRetryPayloadByOperationId.get(operationId);
      if (retainedAfterRun === payload) {
        // CL-029 backstop: a reconcile that ran but left the evidence
        // untouched must not strand the payload owner-less. Every real
        // reconcile path at HEAD clears or replaces the entry, so this
        // exit guards the CLASS (a future path that forgets to clear or
        // schedule, or the unmapped-action fallthrough) rather than a
        // demonstrated live path — the previously silent orphan becomes
        // a bounded 30s-cadence retry with a warn per arm. Consumption
        // clears the timer and resets the backoff.
        owner.scheduleRetainedExecutorOutcomeRetry(payload, null);
        return;
      }
    }
    if (owner.isShuttingDown || !owner.isInitialized) {
      return;
    }
    const retained =
      owner.executorOutcomeRetryPayloadByOperationId.get(operationId);
    if (retained) {
      owner.scheduleRetainedExecutorOutcomeRetry(retained, null);
    }
  } finally {
    owner.executorOutcomeRedriveInFlightByOperationId.delete(operationId);
  }
}

export {redriveExecutorOutcomeReconcile};
