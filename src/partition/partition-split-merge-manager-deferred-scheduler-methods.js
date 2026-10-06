/**
 * Build PartitionSplitMergeManager's deferred-evaluation scheduler methods.
 * The manager remains the state and timer owner; this mixin only keeps that
 * bounded scheduling policy separate from transition execution.
 * @return {Object<string, Function>}
 */
function createPartitionSplitMergeManagerDeferredSchedulerMethods() {
  return {
    /**
     * Dispatch every eligible obligation and retain every later obligation.
     * @return {void}
     * @private
     */
    flushDeferredRetryEvaluation() {
      if (this.isShutdown) {
        this.deferredEvaluationObligations.clear();
        this.armDeferredEvaluation();
        return;
      }
      const nowMs = this.now();
      let request = null;
      for (const [key, obligation] of
        this.deferredEvaluationObligations.entries()) {
        if (obligation.dueAtMs > nowMs) {
          continue;
        }
        request = this.mergeRequestedEvaluationContext(
          request,
          obligation.context,
        );
        this.deferredEvaluationObligations.delete(key);
      }
      this.armDeferredEvaluation();
      if (request) {
        this.requestEvaluation(request);
      }
    },

    /**
     * Normalize one caller context and derive its stable logical-obligation
     * key. Sorting only affects identity; dispatch preserves insertion order.
     * @param {Object} context
     * @return {{key: string, context: Object}}
     * @private
     */
    normalizeDeferredEvaluationObligation(context) {
      const normalized = this.mergeRequestedEvaluationContext(null, context);
      const identity = {
        reasonCodes: [...normalized.reasonCodes].sort(),
        partitionIds: [...normalized.partitionIds].sort(),
      };
      return {key: JSON.stringify(identity), context: normalized};
    },

    /**
     * Retain one logical obligation at its earliest requested due time.
     * @param {number} dueAtMs
     * @param {Object} context
     * @return {void}
     * @private
     */
    retainDeferredEvaluationObligation(dueAtMs, context) {
      const normalizedDueAtMs = Math.max(this.now(), dueAtMs);
      const obligation = this.normalizeDeferredEvaluationObligation(context);
      const existing = this.deferredEvaluationObligations.get(obligation.key);
      if (existing && existing.dueAtMs <= normalizedDueAtMs) {
        return;
      }
      this.deferredEvaluationObligations.set(obligation.key, {
        dueAtMs: normalizedDueAtMs,
        context: obligation.context,
      });
    },

    /**
     * Resolve the retained batch with the earliest eligibility deadline.
     * @return {{dueAtMs: number|null, context: Object|null}}
     * @private
     */
    resolveEarliestDeferredEvaluation() {
      let dueAtMs = null;
      let context = null;
      for (const obligation of this.deferredEvaluationObligations.values()) {
        if (dueAtMs === null || obligation.dueAtMs < dueAtMs) {
          dueAtMs = obligation.dueAtMs;
          context = obligation.context;
          continue;
        }
        if (obligation.dueAtMs === dueAtMs) {
          context = this.mergeRequestedEvaluationContext(
            context,
            obligation.context,
          );
        }
      }
      return {dueAtMs, context};
    },

  };
}

export {createPartitionSplitMergeManagerDeferredSchedulerMethods};
