/**
 * CallStage — Stage_Mode execution for
 * `ctx.call(query, params, handler, opts)`.
 *
 * Executes a query via queryExecutor, batches the result
 * rows according to opts.batchSize, and invokes the handler
 * once per batch with a stage context exposing the execution
 * context's primitives.
 *
 * Requirements: 5.2, 5.5
 * @module query/call-stage
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
import { TYPEOF } from '../constants/index.js';
import { DEFAULT_BATCH_SIZE, DEFAULT_EXCHANGE_MODE, EXCHANGE_ERROR_MSG, NESTED_CALL_CLASSIFICATION, NESTED_CALL_ERROR_MSG, STAGE_OPTION, VALID_EXCHANGE_MODES } from './runtime-constants.js';
import { classifyNestedCall } from './nested-call-classifier.js';

/**
 * Build a stage context that exposes the execution context's
 * primitives for use inside the handler.
 *
 * @param {import('./execution-context.js').ExecutionContext} execCtx
 *   Parent execution context.
 * @param {import('./plan-diagnostics.js').PlanDiagnostics}
 *   [planDiagnostics] Optional diagnostics collector.
 * @return {Readonly<Object>} Frozen stage context.
 */
function buildStageContext(execCtx, planDiagnostics) {
  if (stryMutAct_9fa48("109148")) {
    {}
  } else {
    stryCov_9fa48("109148");
    const budgetEnforcer = execCtx.getBudgetEnforcer();
    return Object.freeze(stryMutAct_9fa48("109149") ? {} : (stryCov_9fa48("109149"), {
      emit: stryMutAct_9fa48("109150") ? () => undefined : (stryCov_9fa48("109150"), (key, value, meta) => execCtx.emit(key, value, meta)),
      out: stryMutAct_9fa48("109151") ? () => undefined : (stryCov_9fa48("109151"), (value, meta) => execCtx.out(value, meta)),
      lookup: stryMutAct_9fa48("109152") ? () => undefined : (stryCov_9fa48("109152"), (table, keys) => execCtx.lookup(table, keys)),
      broadcast: stryMutAct_9fa48("109153") ? () => undefined : (stryCov_9fa48("109153"), (ref, dataset) => execCtx.broadcast(ref, dataset)),
      useBroadcast: stryMutAct_9fa48("109154") ? () => undefined : (stryCov_9fa48("109154"), ref => execCtx.useBroadcast(ref)),
      call: (query, params, handler, opts) => {
        if (stryMutAct_9fa48("109155")) {
          {}
        } else {
          stryCov_9fa48("109155");
          if (stryMutAct_9fa48("109158") ? typeof query !== TYPEOF.STRING : stryMutAct_9fa48("109157") ? false : stryMutAct_9fa48("109156") ? true : (stryCov_9fa48("109156", "109157", "109158"), typeof query === TYPEOF.STRING)) {
            if (stryMutAct_9fa48("109159")) {
              {}
            } else {
              stryCov_9fa48("109159");
              const result = classifyNestedCall(query);
              if (stryMutAct_9fa48("109161") ? false : stryMutAct_9fa48("109160") ? true : (stryCov_9fa48("109160", "109161"), planDiagnostics)) {
                if (stryMutAct_9fa48("109162")) {
                  {}
                } else {
                  stryCov_9fa48("109162");
                  planDiagnostics.recordClassification(query, result.classification, result.reason);
                }
              }
              if (stryMutAct_9fa48("109165") ? result.classification !== NESTED_CALL_CLASSIFICATION.UNBOUNDED : stryMutAct_9fa48("109164") ? false : stryMutAct_9fa48("109163") ? true : (stryCov_9fa48("109163", "109164", "109165"), result.classification === NESTED_CALL_CLASSIFICATION.UNBOUNDED)) {
                if (stryMutAct_9fa48("109166")) {
                  {}
                } else {
                  stryCov_9fa48("109166");
                  throw new Error(NESTED_CALL_ERROR_MSG.UNBOUNDED_REJECTED);
                }
              }
            }
          }
          budgetEnforcer.recordNestedCall();
          budgetEnforcer.incrementInflight();
          let callResult;
          try {
            if (stryMutAct_9fa48("109167")) {
              {}
            } else {
              stryCov_9fa48("109167");
              callResult = execCtx.call(query, params, handler, opts);
            }
          } catch (error) {
            if (stryMutAct_9fa48("109168")) {
              {}
            } else {
              stryCov_9fa48("109168");
              budgetEnforcer.decrementInflight();
              throw error;
            }
          }
          if (stryMutAct_9fa48("109171") ? callResult || typeof callResult.then === TYPEOF.FUNCTION : stryMutAct_9fa48("109170") ? false : stryMutAct_9fa48("109169") ? true : (stryCov_9fa48("109169", "109170", "109171"), callResult && (stryMutAct_9fa48("109173") ? typeof callResult.then !== TYPEOF.FUNCTION : stryMutAct_9fa48("109172") ? true : (stryCov_9fa48("109172", "109173"), typeof callResult.then === TYPEOF.FUNCTION)))) {
            if (stryMutAct_9fa48("109174")) {
              {}
            } else {
              stryCov_9fa48("109174");
              return Promise.resolve(callResult).finally(() => {
                if (stryMutAct_9fa48("109175")) {
                  {}
                } else {
                  stryCov_9fa48("109175");
                  budgetEnforcer.decrementInflight();
                }
              });
            }
          }
          budgetEnforcer.decrementInflight();
          return callResult;
        }
      },
      isCancelled: stryMutAct_9fa48("109176") ? () => undefined : (stryCov_9fa48("109176"), () => execCtx.isCancelled()),
      throwIfCancelled: stryMutAct_9fa48("109177") ? () => undefined : (stryCov_9fa48("109177"), () => execCtx.throwIfCancelled())
    }));
  }
}

/**
 * Split an array into batches of the given size.
 *
 * @param {Array} rows - Rows to batch.
 * @param {number} batchSize - Maximum rows per batch.
 * @return {Array<Array>} Array of batch arrays.
 */
function batchRows(rows, batchSize) {
  if (stryMutAct_9fa48("109178")) {
    {}
  } else {
    stryCov_9fa48("109178");
    const batches = stryMutAct_9fa48("109179") ? ["Stryker was here"] : (stryCov_9fa48("109179"), []);
    for (let i = 0; stryMutAct_9fa48("109182") ? i >= rows.length : stryMutAct_9fa48("109181") ? i <= rows.length : stryMutAct_9fa48("109180") ? false : (stryCov_9fa48("109180", "109181", "109182"), i < rows.length); stryMutAct_9fa48("109183") ? i -= batchSize : (stryCov_9fa48("109183"), i += batchSize)) {
      if (stryMutAct_9fa48("109184")) {
        {}
      } else {
        stryCov_9fa48("109184");
        batches.push(stryMutAct_9fa48("109185") ? rows : (stryCov_9fa48("109185"), rows.slice(i, stryMutAct_9fa48("109186") ? i - batchSize : (stryCov_9fa48("109186"), i + batchSize))));
      }
    }
    return batches;
  }
}

/**
 * Execute Stage_Mode: run a query, batch the results, and
 * invoke the handler for each batch.
 *
 * **Retry scope (Requirement 10.1):** Retries are
 * coarse-grained at batch/stage boundaries, not per-row.
 * The batch loop below is the retry boundary: if a batch
 * handler fails, the entire batch is the unit of retry (or
 * the stage is aborted). Individual rows within a batch are
 * never retried independently. This keeps lineage IDs and
 * dedupe keys aligned with batch boundaries.
 *
 * @param {Object} deps - Stage dependencies.
 * @param {string} deps.query - SQL query string.
 * @param {unknown[]} deps.params - Bind parameters.
 * @param {Function} deps.handler - Stage handler function
 *   receiving (batch, stageContext).
 * @param {Object} [deps.opts] - Stage options.
 * @param {number} [deps.opts.batchSize] - Rows per batch.
 * @param {string} [deps.opts.exchangeBy] - Exchange control.
 * @param {Function} deps.queryExecutor - Async function
 *   accepting (query, params) and returning {rows: Array}.
 * @param {import('./cancellation-token.js').CancellationToken}
 *   deps.cancellationToken - Cancellation token.
 * @param {import('./execution-context.js').ExecutionContext}
 *   deps.executionContext - Parent execution context.
 * @return {Promise<Array>} Collected handler results.
 */
async function executeStage(deps) {
  if (stryMutAct_9fa48("109187")) {
    {}
  } else {
    stryCov_9fa48("109187");
    const {
      query,
      params,
      handler,
      opts,
      queryExecutor,
      cancellationToken,
      executionContext
    } = deps;
    cancellationToken.throwIfCancelled();
    const rawExchange = stryMutAct_9fa48("109188") ? opts[STAGE_OPTION.EXCHANGE_BY] : (stryCov_9fa48("109188"), opts?.[STAGE_OPTION.EXCHANGE_BY]);
    if (stryMutAct_9fa48("109191") ? rawExchange !== undefined || !VALID_EXCHANGE_MODES.has(rawExchange) : stryMutAct_9fa48("109190") ? false : stryMutAct_9fa48("109189") ? true : (stryCov_9fa48("109189", "109190", "109191"), (stryMutAct_9fa48("109193") ? rawExchange === undefined : stryMutAct_9fa48("109192") ? true : (stryCov_9fa48("109192", "109193"), rawExchange !== undefined)) && (stryMutAct_9fa48("109194") ? VALID_EXCHANGE_MODES.has(rawExchange) : (stryCov_9fa48("109194"), !VALID_EXCHANGE_MODES.has(rawExchange))))) {
      if (stryMutAct_9fa48("109195")) {
        {}
      } else {
        stryCov_9fa48("109195");
        throw new Error(EXCHANGE_ERROR_MSG.INVALID_EXCHANGE_MODE);
      }
    }
    const exchangeMode = stryMutAct_9fa48("109196") ? rawExchange && DEFAULT_EXCHANGE_MODE : (stryCov_9fa48("109196"), rawExchange ?? DEFAULT_EXCHANGE_MODE);
    executionContext.setExchangeMode(exchangeMode);
    const result = await queryExecutor(query, params);
    const rows = stryMutAct_9fa48("109197") ? result?.rows && [] : (stryCov_9fa48("109197"), (stryMutAct_9fa48("109198") ? result.rows : (stryCov_9fa48("109198"), result?.rows)) ?? (stryMutAct_9fa48("109199") ? ["Stryker was here"] : (stryCov_9fa48("109199"), [])));
    const batchSize = stryMutAct_9fa48("109200") ? opts?.[STAGE_OPTION.BATCH_SIZE] && DEFAULT_BATCH_SIZE : (stryCov_9fa48("109200"), (stryMutAct_9fa48("109201") ? opts[STAGE_OPTION.BATCH_SIZE] : (stryCov_9fa48("109201"), opts?.[STAGE_OPTION.BATCH_SIZE])) ?? DEFAULT_BATCH_SIZE);
    const batches = batchRows(rows, batchSize);
    const stageCtx = buildStageContext(executionContext, executionContext.getPlanDiagnostics ? executionContext.getPlanDiagnostics() : undefined);
    const results = stryMutAct_9fa48("109202") ? ["Stryker was here"] : (stryCov_9fa48("109202"), []);
    for (const batch of batches) {
      if (stryMutAct_9fa48("109203")) {
        {}
      } else {
        stryCov_9fa48("109203");
        cancellationToken.throwIfCancelled();
        executionContext.getBudgetEnforcer().checkWallTime();
        const handlerResult = await handler(batch, stageCtx);
        results.push(handlerResult);
      }
    }
    return results;
  }
}
export { executeStage, buildStageContext, batchRows };