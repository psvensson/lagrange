/**
 * CallbackContext — bounded primitive surface for partition
 * callback execution.
 *
 * Mirrors the stage context built by `buildStageContext` in
 * call-stage.js, exposing the same bounded primitives and
 * nested-call guardrails. Reuses the existing
 * `classifyNestedCall` classifier and delegates all
 * primitive calls to the parent ExecutionContext.
 *
 * No ad-hoc cross-partition RPC surfaces are exposed.
 *
 * Requirements: 4.5, 8.3, 14.4
 * @module query/callback-context
 */

import {TYPEOF} from '../constants/index.js';
import {classifyNestedCall} from './nested-call-classifier.js';
import {
  NESTED_CALL_CLASSIFICATION,
  NESTED_CALL_ERROR_MSG,
} from './runtime-constants.js';

/**
 * Build a bounded callback context that exposes the same
 * primitive surface as the stage runtime context.
 *
 * Exposed primitives:
 *   - emit(key, value, meta)
 *   - out(value, meta)
 *   - lookup(table, keys)
 *   - broadcast(ref, dataset)
 *   - useBroadcast(ref)
 *   - call(query, params, handler, opts) — with nested-call
 *     guardrails (unbounded rejected in v0)
 *   - isCancelled()
 *   - throwIfCancelled()
 *
 * @param {import('./execution-context.js').ExecutionContext}
 *   execCtx - Parent execution context whose primitives are
 *   delegated to.
 * @param {import('./plan-diagnostics.js').PlanDiagnostics}
 *   [planDiagnostics] - Optional diagnostics collector for
 *   nested call classification decisions.
 * @return {Readonly<Object>} Frozen callback context.
 */
function buildCallbackContext(execCtx, planDiagnostics) {
  const budgetEnforcer = execCtx.getBudgetEnforcer();
  return Object.freeze({
    emit: (key, value, meta) =>
      execCtx.emit(key, value, meta),
    out: (value, meta) =>
      execCtx.out(value, meta),
    lookup: (table, keys) =>
      execCtx.lookup(table, keys),
    broadcast: (ref, dataset) =>
      execCtx.broadcast(ref, dataset),
    useBroadcast: (ref) =>
      execCtx.useBroadcast(ref),
    call: async (query, params, handler, opts) => {
      if (typeof query === TYPEOF.STRING) {
        const result = classifyNestedCall(query);
        if (planDiagnostics) {
          planDiagnostics.recordClassification(
            query,
            result.classification,
            result.reason,
          );
        }
        if (result.classification ===
            NESTED_CALL_CLASSIFICATION.UNBOUNDED) {
          throw new Error(
            NESTED_CALL_ERROR_MSG.UNBOUNDED_REJECTED,
          );
        }
      }
      budgetEnforcer.recordNestedCall();
      budgetEnforcer.incrementInflight();
      try {
        return await execCtx.call(
          query, params, handler, opts,
        );
      } finally {
        budgetEnforcer.decrementInflight();
      }
    },
    isCancelled: () => execCtx.isCancelled(),
    throwIfCancelled: () => execCtx.throwIfCancelled(),
  });
}

export {buildCallbackContext};
