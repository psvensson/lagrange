
/**
 * Resolve the newest steps-history entry for an operation's CURRENT workflow
 * step.
 *
 * A step-history entry is appended only on a real workflow-step transition
 * (`updateStep` no-ops when `previousStep === step`), so its timestamp is the
 * true time the operation ENTERED its current step. Anchoring staleness/timeout
 * decisions on this entry (rather than `updatedAt`) is immune to the same-step
 * dispatch-retry churn that keeps re-stamping `updatedAt` every ~1s for a wedged
 * operation — the CL-044 livelock class, where an op stuck SYNCING toward a down
 * node read as perpetually "fresh" and never aged past its step timeout.
 *
 * Callers apply their own epoch normalization to the returned `timestamp` so
 * each consumer keeps its existing parsing semantics.
 *
 * @param {Object|null} operation - Operation (or normalized record) carrying
 *   `workflowStep` and a `stepsHistory` array of `{step, timestamp}` entries.
 * @return {Object|null} The matching step-history entry, or null when none.
 */
function resolveOperationCurrentStepEntry(operation) {
  const stepsHistory = Array.isArray(operation?.stepsHistory) ?
    operation.stepsHistory :
    null;
  const workflowStep = operation?.workflowStep;
  if (!stepsHistory || stepsHistory.length === 0 || !workflowStep) {
    return null;
  }
  for (let index = stepsHistory.length - 1; index >= 0; index--) {
    const entry = stepsHistory[index];
    if (entry && entry.step === workflowStep) {
      return entry;
    }
  }
  return null;
}

export {resolveOperationCurrentStepEntry};
