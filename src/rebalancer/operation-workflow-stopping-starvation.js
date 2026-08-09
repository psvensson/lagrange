// Bounded STOPPING-observation starvation escalation (quest
// formation-barrier-spread-release-oscillation): an UNAVAILABLE
// stopping-replica observation used to defer retryable-forever, so a shed
// authoritative services lane (formation pressure) pinned the operation at
// STOPPING — a REMOVING ledger voter that keeps the quorum concentrated,
// which keeps the pressure on. This module owns the deferral accounting and
// the loud, typed visible-failure escalation consumed by
// reconcileStoppingOperationProgress; the owner carries the per-operation
// record in stoppingObservationDeferralsByOperationId. Only a genuinely
// authoritative (or genuinely absent) observation clears the record — a
// transport ack never resets the bound, and a CACHE-FALLBACK observation
// (authoritative lane failed, arbitrarily stale cached row) freezes the
// count instead of resetting it.

// Consecutive UNAVAILABLE observations tolerated before the operation is
// failed visibly, AND the minimum wall-clock the starvation must have
// lasted (anchored on the owner's timeout-check clock at the first
// deferral). The count alone is call-rate coupled — level-triggered
// re-drives could burn deferrals quickly — so both bounds must be
// exhausted. At the 250ms TRANSITION_RETRY_DELAY_MS defer cadence the
// count bound is ~10s of continuous authoritative-lane unavailability —
// far above transient blips, far below the joiner's 120s
// formation-barrier budget.
const STOPPING_OBSERVATION_STARVATION_DEFERRAL_LIMIT = 40;
const STOPPING_OBSERVATION_STARVATION_MIN_ELAPSED_MS = 10_000;
const STOPPING_OBSERVATION_STARVATION_LOG_MESSAGE =
  'Stopping-replica observation starved; failing operation visibly';
const STOPPING_OBSERVATION_STARVATION_FAILURE_MESSAGE =
  'stopping-observation starvation: authoritative replica observation ' +
  'stayed unavailable past the bounded deferral limit';
// Mirrors REPLICA_OPERATION_REPOSITORY_LITERAL
// .CACHE_FALLBACK_AFTER_AUTHORITATIVE_FAILURE (replica-operation-repository
// .js, module-local there): an OBSERVED whose evidence is a cached row read
// AFTER the authoritative lane failed is not fresh enough to reset the
// starvation record.
const STOPPING_OBSERVATION_CACHE_FALLBACK_SOURCE =
  'cache_fallback_after_authoritative_failure';

/**
 * Record one UNAVAILABLE stopping-observation deferral and report whether
 * both starvation bounds (count and elapsed time) are exhausted.
 * @param {Object} owner - Workflow owner carrying the deferral map and the
 *   timeout-check clock.
 * @param {Object} operation
 * @return {boolean} True when the starvation bounds are exhausted.
 */
function recordStoppingObservationDeferralExhaustion(owner, operation) {
  if (!operation?.operationId) {
    return false;
  }
  const nowMs = owner.resolveTimeoutCheckNowMs();
  const record =
    owner.stoppingObservationDeferralsByOperationId.get(
      operation.operationId,
    ) || {deferralCount: 0, firstDeferredAtMs: nowMs};
  if (
    record.deferralCount >= STOPPING_OBSERVATION_STARVATION_DEFERRAL_LIMIT &&
    nowMs - record.firstDeferredAtMs >=
      STOPPING_OBSERVATION_STARVATION_MIN_ELAPSED_MS
  ) {
    return true;
  }
  owner.stoppingObservationDeferralsByOperationId.set(
    operation.operationId,
    {
      deferralCount: record.deferralCount + 1,
      firstDeferredAtMs: record.firstDeferredAtMs,
    },
  );
  return false;
}

/**
 * Whether an observation outcome is fresh enough to clear the starvation
 * record: any non-UNAVAILABLE state EXCEPT a cache-fallback OBSERVED (the
 * authoritative lane failed; the cached row may be arbitrarily stale, so it
 * must not keep resetting the bound while the lane starves).
 * @param {Object} observation - Frozen stopping-replica observation
 *   ({state, source, lifecycleStatus}).
 * @param {string} unavailableState - The UNAVAILABLE state literal.
 * @return {boolean}
 */
function shouldClearStoppingObservationDeferrals(
  observation,
  unavailableState,
) {
  return (
    observation.state !== unavailableState &&
    observation.source !== STOPPING_OBSERVATION_CACHE_FALLBACK_SOURCE
  );
}

/**
 * Clear the deferral record once a genuinely fresh observation (or the
 * escalation itself) lands.
 * @param {Object} owner - Workflow owner carrying the deferral map.
 * @param {string|null|undefined} operationId
 * @return {void}
 */
function clearStoppingObservationDeferrals(owner, operationId) {
  if (operationId) {
    owner.stoppingObservationDeferralsByOperationId.delete(operationId);
  }
}

/**
 * Fail a starvation-exhausted STOPPING operation visibly. Loud, typed
 * terminal exit (never a silent self-cancel): the terminal write itself is
 * session-less so it can land during the degraded window, and the aftermath
 * (re-planning from actuals, failed-removal cleanup) is owned by the
 * existing level-triggered machinery. This never fabricates completion
 * evidence, so the fail-closed formation barrier semantics are preserved.
 * @param {Object} owner - Workflow owner (logger + failOperation).
 * @param {Object} operation
 * @return {Promise<boolean>}
 */
async function escalateStarvedStoppingObservation(owner, operation) {
  owner.logger.error(
    STOPPING_OBSERVATION_STARVATION_LOG_MESSAGE,
    {
      operationId: operation.operationId,
      partitionId: operation.partitionId || null,
      workflowStep: operation.workflowStep || null,
      deferralLimit: STOPPING_OBSERVATION_STARVATION_DEFERRAL_LIMIT,
      minElapsedMs: STOPPING_OBSERVATION_STARVATION_MIN_ELAPSED_MS,
    },
  );
  clearStoppingObservationDeferrals(owner, operation.operationId);
  await owner.failOperation(
    operation,
    STOPPING_OBSERVATION_STARVATION_FAILURE_MESSAGE,
  );
  return true;
}

/**
 * Handle one UNAVAILABLE stopping observation: escalate visibly once the
 * starvation bounds are exhausted for a system-table operation, defer
 * otherwise (the pre-existing retryable path, byte-identical for
 * non-system rows).
 * @param {Object} owner - Workflow owner.
 * @param {Object} operation
 * @param {Function} isSystemTableOperation - Typed partition classifier.
 * @return {Promise<boolean>|boolean}
 */
function handleUnavailableStoppingObservation(
  owner,
  operation,
  isSystemTableOperation,
) {
  if (
    isSystemTableOperation(operation) &&
    recordStoppingObservationDeferralExhaustion(owner, operation)
  ) {
    return escalateStarvedStoppingObservation(owner, operation);
  }
  return owner.deferStoppingObservationRetry(operation);
}

export {
  clearStoppingObservationDeferrals,
  handleUnavailableStoppingObservation,
  shouldClearStoppingObservationDeferrals,
};
