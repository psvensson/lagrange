/**
 * CallbackContext — bounded primitive surface for partition
 * callback execution.
 *
 * Mirrors the stage context built by `buildStageContext` in
 * call-stage.js, exposing the same bounded primitives and
 * nested-call guardrails. Reuses the existing
 * stage-level guardrails via `call-stage` and delegates all
 * primitive calls to the parent ExecutionContext.
 *
 * No ad-hoc cross-partition RPC surfaces are exposed.
 *
 * Requirements: 4.5, 8.3, 14.4
 * @module query/callback-context
 */
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { TYPEOF } from '../../constants/index.js';
import { NESTED_CALL_CLASSIFICATION, NESTED_CALL_ERROR_MSG } from '../runtime-constants.js';
import { classifyNestedCall } from '../nested-call-classifier.js';

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
 * @param {import('../execution-context.js').ExecutionContext}
 *   execCtx - Parent execution context whose primitives are
 *   delegated to.
 * @param {import('../plan-diagnostics.js').PlanDiagnostics}
 *   [planDiagnostics] - Reserved for compatibility.
 * @param {Object} [debugApi] - Optional debug API surface.
 * @return {Readonly<Object>} Frozen callback context.
 */
function buildCallbackContext(execCtx, planDiagnostics, debugApi) {
  if (stryMutAct_9fa48("109230")) {
    {}
  } else {
    stryCov_9fa48("109230");
    void planDiagnostics;
    const budgetEnforcer = execCtx.getBudgetEnforcer();
    const callbackContext = stryMutAct_9fa48("109231") ? {} : (stryCov_9fa48("109231"), {
      emit: stryMutAct_9fa48("109232") ? () => undefined : (stryCov_9fa48("109232"), (key, value, meta) => execCtx.emit(key, value, meta)),
      out: stryMutAct_9fa48("109233") ? () => undefined : (stryCov_9fa48("109233"), (value, meta) => execCtx.out(value, meta)),
      lookup: stryMutAct_9fa48("109234") ? () => undefined : (stryCov_9fa48("109234"), (table, keys) => execCtx.lookup(table, keys)),
      broadcast: stryMutAct_9fa48("109235") ? () => undefined : (stryCov_9fa48("109235"), (ref, dataset) => execCtx.broadcast(ref, dataset)),
      useBroadcast: stryMutAct_9fa48("109236") ? () => undefined : (stryCov_9fa48("109236"), ref => execCtx.useBroadcast(ref)),
      call: (query, params, handler, opts) => {
        if (stryMutAct_9fa48("109237")) {
          {}
        } else {
          stryCov_9fa48("109237");
          if (stryMutAct_9fa48("109240") ? typeof query !== TYPEOF.STRING : stryMutAct_9fa48("109239") ? false : stryMutAct_9fa48("109238") ? true : (stryCov_9fa48("109238", "109239", "109240"), typeof query === TYPEOF.STRING)) {
            if (stryMutAct_9fa48("109241")) {
              {}
            } else {
              stryCov_9fa48("109241");
              const result = classifyNestedCall(query);
              if (stryMutAct_9fa48("109244") ? planDiagnostics || typeof planDiagnostics.recordClassification === TYPEOF.FUNCTION : stryMutAct_9fa48("109243") ? false : stryMutAct_9fa48("109242") ? true : (stryCov_9fa48("109242", "109243", "109244"), planDiagnostics && (stryMutAct_9fa48("109246") ? typeof planDiagnostics.recordClassification !== TYPEOF.FUNCTION : stryMutAct_9fa48("109245") ? true : (stryCov_9fa48("109245", "109246"), typeof planDiagnostics.recordClassification === TYPEOF.FUNCTION)))) {
                if (stryMutAct_9fa48("109247")) {
                  {}
                } else {
                  stryCov_9fa48("109247");
                  planDiagnostics.recordClassification(query, result.classification, result.reason);
                }
              }
              if (stryMutAct_9fa48("109250") ? result.classification !== NESTED_CALL_CLASSIFICATION.UNBOUNDED : stryMutAct_9fa48("109249") ? false : stryMutAct_9fa48("109248") ? true : (stryCov_9fa48("109248", "109249", "109250"), result.classification === NESTED_CALL_CLASSIFICATION.UNBOUNDED)) {
                if (stryMutAct_9fa48("109251")) {
                  {}
                } else {
                  stryCov_9fa48("109251");
                  throw new Error(NESTED_CALL_ERROR_MSG.UNBOUNDED_REJECTED);
                }
              }
            }
          }
          budgetEnforcer.recordNestedCall();
          budgetEnforcer.incrementInflight();
          let callResult;
          try {
            if (stryMutAct_9fa48("109252")) {
              {}
            } else {
              stryCov_9fa48("109252");
              callResult = execCtx.call(query, params, handler, opts);
            }
          } catch (error) {
            if (stryMutAct_9fa48("109253")) {
              {}
            } else {
              stryCov_9fa48("109253");
              budgetEnforcer.decrementInflight();
              throw error;
            }
          }
          if (stryMutAct_9fa48("109256") ? callResult || typeof callResult.then === TYPEOF.FUNCTION : stryMutAct_9fa48("109255") ? false : stryMutAct_9fa48("109254") ? true : (stryCov_9fa48("109254", "109255", "109256"), callResult && (stryMutAct_9fa48("109258") ? typeof callResult.then !== TYPEOF.FUNCTION : stryMutAct_9fa48("109257") ? true : (stryCov_9fa48("109257", "109258"), typeof callResult.then === TYPEOF.FUNCTION)))) {
            if (stryMutAct_9fa48("109259")) {
              {}
            } else {
              stryCov_9fa48("109259");
              return Promise.resolve(callResult).finally(() => {
                if (stryMutAct_9fa48("109260")) {
                  {}
                } else {
                  stryCov_9fa48("109260");
                  budgetEnforcer.decrementInflight();
                }
              });
            }
          }
          budgetEnforcer.decrementInflight();
          return callResult;
        }
      },
      isCancelled: stryMutAct_9fa48("109261") ? () => undefined : (stryCov_9fa48("109261"), () => execCtx.isCancelled()),
      throwIfCancelled: stryMutAct_9fa48("109262") ? () => undefined : (stryCov_9fa48("109262"), () => execCtx.throwIfCancelled())
    });
    if (stryMutAct_9fa48("109265") ? debugApi || typeof debugApi.trace === TYPEOF.FUNCTION : stryMutAct_9fa48("109264") ? false : stryMutAct_9fa48("109263") ? true : (stryCov_9fa48("109263", "109264", "109265"), debugApi && (stryMutAct_9fa48("109267") ? typeof debugApi.trace !== TYPEOF.FUNCTION : stryMutAct_9fa48("109266") ? true : (stryCov_9fa48("109266", "109267"), typeof debugApi.trace === TYPEOF.FUNCTION)))) {
      if (stryMutAct_9fa48("109268")) {
        {}
      } else {
        stryCov_9fa48("109268");
        callbackContext.debug = Object.freeze(stryMutAct_9fa48("109269") ? {} : (stryCov_9fa48("109269"), {
          trace: debugApi.trace
        }));
      }
    }
    return Object.freeze(callbackContext);
  }
}
export { buildCallbackContext };