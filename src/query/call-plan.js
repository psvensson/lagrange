/**
 * CallPlan — Plan_Mode execution for
 * `ctx.call(planObject, params?, handler?, opts?)`.
 *
 * Validates plan objects and dispatches to the appropriate
 * execution path based on the plan `kind` field.
 *
 * v0 supported kinds: reduceByKey, useBroadcast.
 *
 * Requirements: 5.3, 5.4
 * @module query/call-plan
 */

import {TYPEOF} from '../constants/index.js';
import {buildStageContext} from './call-stage.js';
import {
  PLAN_KIND,
  SUPPORTED_PLAN_KINDS,
  PLAN_FIELD,
  PLAN_ERROR_MSG as ERR,
  EXCHANGE_MODE,
  EXCHANGE_FIELD,
  REDUCE_FIELD,
  DEFAULT_MAX_RECORDS_PER_GROUP,
  DEFAULT_MAX_GROUPS_PER_BATCH,
} from './runtime-constants.js';

/**
 * Validate that a plan object has a recognized `kind` field.
 *
 * @param {Object} plan - The plan object to validate.
 * @throws {Error} If kind is missing or unsupported.
 */
function validatePlan(plan) {
  const kind = plan[PLAN_FIELD.KIND];
  if (kind === undefined || kind === null) {
    throw new Error(ERR.PLAN_MISSING_KIND);
  }
  if (!SUPPORTED_PLAN_KINDS.has(kind)) {
    throw new Error(ERR.PLAN_UNSUPPORTED_KIND + kind);
  }
}

/**
 * Collect all exchange records from the exchange manager.
 *
 * In KEY mode, iterates all partition buffers.
 * In LOCAL mode, reads the local buffer.
 *
 * @param {import('./exchange-manager.js').ExchangeManager} mgr
 *   Exchange manager instance.
 * @return {Array<Object>} Flat array of exchange entries.
 */
function collectExchangeRecords(mgr) {
  if (mgr.getMode() === EXCHANGE_MODE.KEY) {
    const buffers = mgr.getPartitionBuffers();
    const records = [];
    for (const buf of buffers.values()) {
      for (let i = 0; i < buf.length; i++) {
        records.push(buf[i]);
      }
    }
    return records;
  }
  return mgr.getLocalBuffer();
}

/**
 * Group exchange records by their key field.
 *
 * @param {Array<Object>} records - Exchange entries with
 *   `key` and `value` fields.
 * @return {Map<string, Array<*>>} Map of key to value arrays.
 */
function groupRecordsByKey(records) {
  const groups = new Map();
  for (let i = 0; i < records.length; i++) {
    const entry = records[i];
    const key = entry[EXCHANGE_FIELD.KEY];
    const value = entry[EXCHANGE_FIELD.VALUE];
    let arr = groups.get(key);
    if (!arr) {
      arr = [];
      groups.set(key, arr);
    }
    arr.push(value);
  }
  return groups;
}

/**
 * Build grouped batches from a key→records map.
 *
 * When a group exceeds `maxRecordsPerGroup`, it is split
 * into chunks. Each chunk except the last carries a
 * `continuation` token of the form `{key}-chunk-{index}`.
 *
 * @param {Map<string, Array<*>>} groups - Grouped records.
 * @param {number} [maxRecordsPerGroup] - Max records per
 *   group chunk. Defaults to DEFAULT_MAX_RECORDS_PER_GROUP.
 * @return {Array<Object>} Array of
 *   `{key, records, continuation?}` entries.
 */
function buildGroupedBatches(groups, maxRecordsPerGroup) {
  const limit = maxRecordsPerGroup ??
    DEFAULT_MAX_RECORDS_PER_GROUP;
  const batches = [];
  for (const [key, records] of groups) {
    if (records.length <= limit) {
      batches.push({
        [REDUCE_FIELD.KEY]: key,
        [REDUCE_FIELD.RECORDS]: records,
      });
    } else {
      for (let i = 0; i < records.length; i += limit) {
        const chunk = records.slice(i, i + limit);
        const isLast = i + limit >= records.length;
        const entry = {
          [REDUCE_FIELD.KEY]: key,
          [REDUCE_FIELD.RECORDS]: chunk,
        };
        if (!isLast) {
          const chunkIdx = Math.floor(i / limit);
          entry[REDUCE_FIELD.CONTINUATION] =
            `${key}-chunk-${chunkIdx}`;
        }
        batches.push(entry);
      }
    }
  }
  return batches;
}

/**
 * Execute a reduceByKey plan. Reads records from the
 * exchange manager's buffers, groups them by key, and
 * delivers grouped batches to the handler.
 *
 * When more groups exist than `maxGroupsPerBatch`, the
 * handler is invoked multiple times with successive slices.
 *
 * @param {Object} deps - Plan execution dependencies.
 * @param {Object} deps.plan - The reduceByKey plan object.
 * @param {unknown[]} deps.params - Bind parameters.
 * @param {Function} deps.handler - Reduce handler function.
 * @param {Object} [deps.opts] - Stage options.
 * @param {number} [deps.opts.maxRecordsPerGroup] - Override
 *   for DEFAULT_MAX_RECORDS_PER_GROUP.
 * @param {number} [deps.opts.maxGroupsPerBatch] - Override
 *   for DEFAULT_MAX_GROUPS_PER_BATCH.
 * @param {Function} deps.queryExecutor - Query executor.
 * @param {import('./cancellation-token.js').CancellationToken}
 *   deps.cancellationToken - Cancellation token.
 * @param {import('./execution-context.js').ExecutionContext}
 *   deps.executionContext - Parent execution context.
 * @return {Promise<Array>} Handler results.
 */
async function executeReduceByKey(deps) {
  const {
    handler,
    opts,
    cancellationToken,
    executionContext,
  } = deps;

  if (typeof handler !== TYPEOF.FUNCTION) {
    throw new Error(ERR.PLAN_REDUCE_HANDLER_REQUIRED);
  }

  cancellationToken.throwIfCancelled();

  const maxPerGroup = (opts && opts.maxRecordsPerGroup) ??
    DEFAULT_MAX_RECORDS_PER_GROUP;
  const maxPerBatch = (opts && opts.maxGroupsPerBatch) ??
    DEFAULT_MAX_GROUPS_PER_BATCH;

  const exchangeManager = executionContext.getExchangeManager();
  const records = collectExchangeRecords(exchangeManager);
  const groups = groupRecordsByKey(records);
  const batches = buildGroupedBatches(groups, maxPerGroup);

  const stageCtx = buildStageContext(
    executionContext,
    executionContext.getPlanDiagnostics ?
      executionContext.getPlanDiagnostics() :
      undefined,
  );

  const results = [];
  for (let i = 0; i < batches.length; i += maxPerBatch) {
    cancellationToken.throwIfCancelled();
    executionContext.getBudgetEnforcer().checkWallTime();
    const slice = batches.slice(i, i + maxPerBatch);
    for (let j = 0; j < slice.length; j++) {
      cancellationToken.throwIfCancelled();
      const handlerResult = await handler(slice[j], stageCtx);
      results.push(handlerResult);
    }
  }

  return results;
}

/**
 * Execute a useBroadcast plan. In v0 this returns the
 * broadcast ref data as a stub. Actual broadcast wiring
 * comes in later tasks.
 *
 * @param {Object} deps - Plan execution dependencies.
 * @param {Object} deps.plan - The useBroadcast plan object.
 * @return {Promise<Object>} Broadcast reference data.
 */
async function executeUseBroadcast(deps) {
  const {plan} = deps;
  const ref = plan[PLAN_FIELD.REF];

  if (ref === undefined || ref === null) {
    throw new Error(ERR.PLAN_BROADCAST_REF_REQUIRED);
  }

  return {ref, data: null};
}

/**
 * Execute a plan object by dispatching on its `kind` field.
 *
 * @param {Object} deps - Plan execution dependencies.
 * @param {Object} deps.plan - Plan object with `kind` field.
 * @param {unknown[]} deps.params - Bind parameters.
 * @param {Function} [deps.handler] - Handler function.
 * @param {Object} [deps.opts] - Stage options.
 * @param {Function} deps.queryExecutor - Query executor.
 * @param {import('./cancellation-token.js').CancellationToken}
 *   deps.cancellationToken - Cancellation token.
 * @param {import('./execution-context.js').ExecutionContext}
 *   deps.executionContext - Parent execution context.
 * @return {Promise<*>} Plan execution result.
 */
async function executePlan(deps) {
  const {plan} = deps;

  validatePlan(plan);

  const kind = plan[PLAN_FIELD.KIND];

  if (kind === PLAN_KIND.REDUCE_BY_KEY) {
    return executeReduceByKey(deps);
  }

  if (kind === PLAN_KIND.USE_BROADCAST) {
    return executeUseBroadcast(deps);
  }
}

export {
  executePlan,
  validatePlan,
  executeReduceByKey,
  executeUseBroadcast,
  collectExchangeRecords,
  groupRecordsByKey,
  buildGroupedBatches,
};
