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

import {TYPEOF} from '../constants/index.js';
import {
  DEFAULT_BATCH_SIZE,
  DEFAULT_EXCHANGE_MODE,
  EXCHANGE_ERROR_MSG,
  NESTED_CALL_CLASSIFICATION,
  NESTED_CALL_ERROR_MSG,
  STAGE_OPTION,
  VALID_EXCHANGE_MODES,
} from './runtime-constants.js';
import {classifyNestedCall} from './nested-call-classifier.js';

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
  const budgetEnforcer = execCtx.getBudgetEnforcer();
  return Object.freeze({
    emit: (key, value, meta) => execCtx.emit(key, value, meta),
    out: (value, meta) => execCtx.out(value, meta),
    lookup: (table, keys) => execCtx.lookup(table, keys),
    broadcast: (ref, dataset) => execCtx.broadcast(ref, dataset),
    useBroadcast: (ref) => execCtx.useBroadcast(ref),
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

/**
 * Split an array into batches of the given size.
 *
 * @param {Array} rows - Rows to batch.
 * @param {number} batchSize - Maximum rows per batch.
 * @return {Array<Array>} Array of batch arrays.
 */
function batchRows(rows, batchSize) {
  const batches = [];
  for (let i = 0; i < rows.length; i += batchSize) {
    batches.push(rows.slice(i, i + batchSize));
  }
  return batches;
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
  const {
    query,
    params,
    handler,
    opts,
    queryExecutor,
    cancellationToken,
    executionContext,
  } = deps;

  cancellationToken.throwIfCancelled();

  const rawExchange = opts?.[STAGE_OPTION.EXCHANGE_BY];
  if (
    rawExchange !== undefined &&
    !VALID_EXCHANGE_MODES.has(rawExchange)
  ) {
    throw new Error(EXCHANGE_ERROR_MSG.INVALID_EXCHANGE_MODE);
  }
  const exchangeMode = rawExchange ?? DEFAULT_EXCHANGE_MODE;
  executionContext.setExchangeMode(exchangeMode);

  const result = await queryExecutor(query, params);
  const rows = result?.rows ?? [];

  const batchSize =
    opts?.[STAGE_OPTION.BATCH_SIZE] ?? DEFAULT_BATCH_SIZE;
  const batches = batchRows(rows, batchSize);

  const stageCtx = buildStageContext(
    executionContext,
    executionContext.getPlanDiagnostics
      ? executionContext.getPlanDiagnostics()
      : undefined,
  );
  const results = [];

  for (const batch of batches) {
    cancellationToken.throwIfCancelled();
    executionContext.getBudgetEnforcer().checkWallTime();
    const handlerResult = await handler(batch, stageCtx);
    results.push(handlerResult);
  }

  return results;
}

export {executeStage, buildStageContext, batchRows};
