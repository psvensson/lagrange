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
import { buildStageContext } from './call-stage.js';
import { PLAN_KIND, SUPPORTED_PLAN_KINDS, PLAN_FIELD, PLAN_ERROR_MSG as ERR, EXCHANGE_MODE, EXCHANGE_FIELD, REDUCE_FIELD, DEFAULT_MAX_RECORDS_PER_GROUP, DEFAULT_MAX_GROUPS_PER_BATCH } from './runtime-constants.js';

/**
 * Validate that a plan object has a recognized `kind` field.
 *
 * @param {Object} plan - The plan object to validate.
 * @throws {Error} If kind is missing or unsupported.
 */
function validatePlan(plan) {
  if (stryMutAct_9fa48("109036")) {
    {}
  } else {
    stryCov_9fa48("109036");
    const kind = plan[PLAN_FIELD.KIND];
    if (stryMutAct_9fa48("109039") ? kind === undefined && kind === null : stryMutAct_9fa48("109038") ? false : stryMutAct_9fa48("109037") ? true : (stryCov_9fa48("109037", "109038", "109039"), (stryMutAct_9fa48("109041") ? kind !== undefined : stryMutAct_9fa48("109040") ? false : (stryCov_9fa48("109040", "109041"), kind === undefined)) || (stryMutAct_9fa48("109043") ? kind !== null : stryMutAct_9fa48("109042") ? false : (stryCov_9fa48("109042", "109043"), kind === null)))) {
      if (stryMutAct_9fa48("109044")) {
        {}
      } else {
        stryCov_9fa48("109044");
        throw new Error(ERR.PLAN_MISSING_KIND);
      }
    }
    if (stryMutAct_9fa48("109047") ? false : stryMutAct_9fa48("109046") ? true : stryMutAct_9fa48("109045") ? SUPPORTED_PLAN_KINDS.has(kind) : (stryCov_9fa48("109045", "109046", "109047"), !SUPPORTED_PLAN_KINDS.has(kind))) {
      if (stryMutAct_9fa48("109048")) {
        {}
      } else {
        stryCov_9fa48("109048");
        throw new Error(stryMutAct_9fa48("109049") ? ERR.PLAN_UNSUPPORTED_KIND - kind : (stryCov_9fa48("109049"), ERR.PLAN_UNSUPPORTED_KIND + kind));
      }
    }
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
  if (stryMutAct_9fa48("109050")) {
    {}
  } else {
    stryCov_9fa48("109050");
    if (stryMutAct_9fa48("109053") ? mgr.getMode() !== EXCHANGE_MODE.KEY : stryMutAct_9fa48("109052") ? false : stryMutAct_9fa48("109051") ? true : (stryCov_9fa48("109051", "109052", "109053"), mgr.getMode() === EXCHANGE_MODE.KEY)) {
      if (stryMutAct_9fa48("109054")) {
        {}
      } else {
        stryCov_9fa48("109054");
        const buffers = mgr.getPartitionBuffers();
        const records = stryMutAct_9fa48("109055") ? ["Stryker was here"] : (stryCov_9fa48("109055"), []);
        for (const buf of buffers.values()) {
          if (stryMutAct_9fa48("109056")) {
            {}
          } else {
            stryCov_9fa48("109056");
            for (let i = 0; stryMutAct_9fa48("109059") ? i >= buf.length : stryMutAct_9fa48("109058") ? i <= buf.length : stryMutAct_9fa48("109057") ? false : (stryCov_9fa48("109057", "109058", "109059"), i < buf.length); stryMutAct_9fa48("109060") ? i-- : (stryCov_9fa48("109060"), i++)) {
              if (stryMutAct_9fa48("109061")) {
                {}
              } else {
                stryCov_9fa48("109061");
                records.push(buf[i]);
              }
            }
          }
        }
        return records;
      }
    }
    return mgr.getLocalBuffer();
  }
}

/**
 * Group exchange records by their key field.
 *
 * @param {Array<Object>} records - Exchange entries with
 *   `key` and `value` fields.
 * @return {Map<string, Array<*>>} Map of key to value arrays.
 */
function groupRecordsByKey(records) {
  if (stryMutAct_9fa48("109062")) {
    {}
  } else {
    stryCov_9fa48("109062");
    const groups = new Map();
    for (let i = 0; stryMutAct_9fa48("109065") ? i >= records.length : stryMutAct_9fa48("109064") ? i <= records.length : stryMutAct_9fa48("109063") ? false : (stryCov_9fa48("109063", "109064", "109065"), i < records.length); stryMutAct_9fa48("109066") ? i-- : (stryCov_9fa48("109066"), i++)) {
      if (stryMutAct_9fa48("109067")) {
        {}
      } else {
        stryCov_9fa48("109067");
        const entry = records[i];
        const key = entry[EXCHANGE_FIELD.KEY];
        const value = entry[EXCHANGE_FIELD.VALUE];
        let arr = groups.get(key);
        if (stryMutAct_9fa48("109070") ? false : stryMutAct_9fa48("109069") ? true : stryMutAct_9fa48("109068") ? arr : (stryCov_9fa48("109068", "109069", "109070"), !arr)) {
          if (stryMutAct_9fa48("109071")) {
            {}
          } else {
            stryCov_9fa48("109071");
            arr = stryMutAct_9fa48("109072") ? ["Stryker was here"] : (stryCov_9fa48("109072"), []);
            groups.set(key, arr);
          }
        }
        arr.push(value);
      }
    }
    return groups;
  }
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
  if (stryMutAct_9fa48("109073")) {
    {}
  } else {
    stryCov_9fa48("109073");
    const limit = stryMutAct_9fa48("109074") ? maxRecordsPerGroup && DEFAULT_MAX_RECORDS_PER_GROUP : (stryCov_9fa48("109074"), maxRecordsPerGroup ?? DEFAULT_MAX_RECORDS_PER_GROUP);
    const batches = stryMutAct_9fa48("109075") ? ["Stryker was here"] : (stryCov_9fa48("109075"), []);
    for (const [key, records] of groups) {
      if (stryMutAct_9fa48("109076")) {
        {}
      } else {
        stryCov_9fa48("109076");
        if (stryMutAct_9fa48("109080") ? records.length > limit : stryMutAct_9fa48("109079") ? records.length < limit : stryMutAct_9fa48("109078") ? false : stryMutAct_9fa48("109077") ? true : (stryCov_9fa48("109077", "109078", "109079", "109080"), records.length <= limit)) {
          if (stryMutAct_9fa48("109081")) {
            {}
          } else {
            stryCov_9fa48("109081");
            batches.push(stryMutAct_9fa48("109082") ? {} : (stryCov_9fa48("109082"), {
              [REDUCE_FIELD.KEY]: key,
              [REDUCE_FIELD.RECORDS]: records
            }));
          }
        } else {
          if (stryMutAct_9fa48("109083")) {
            {}
          } else {
            stryCov_9fa48("109083");
            for (let i = 0; stryMutAct_9fa48("109086") ? i >= records.length : stryMutAct_9fa48("109085") ? i <= records.length : stryMutAct_9fa48("109084") ? false : (stryCov_9fa48("109084", "109085", "109086"), i < records.length); stryMutAct_9fa48("109087") ? i -= limit : (stryCov_9fa48("109087"), i += limit)) {
              if (stryMutAct_9fa48("109088")) {
                {}
              } else {
                stryCov_9fa48("109088");
                const chunk = stryMutAct_9fa48("109089") ? records : (stryCov_9fa48("109089"), records.slice(i, stryMutAct_9fa48("109090") ? i - limit : (stryCov_9fa48("109090"), i + limit)));
                const isLast = stryMutAct_9fa48("109094") ? i + limit < records.length : stryMutAct_9fa48("109093") ? i + limit > records.length : stryMutAct_9fa48("109092") ? false : stryMutAct_9fa48("109091") ? true : (stryCov_9fa48("109091", "109092", "109093", "109094"), (stryMutAct_9fa48("109095") ? i - limit : (stryCov_9fa48("109095"), i + limit)) >= records.length);
                const entry = stryMutAct_9fa48("109096") ? {} : (stryCov_9fa48("109096"), {
                  [REDUCE_FIELD.KEY]: key,
                  [REDUCE_FIELD.RECORDS]: chunk
                });
                if (stryMutAct_9fa48("109099") ? false : stryMutAct_9fa48("109098") ? true : stryMutAct_9fa48("109097") ? isLast : (stryCov_9fa48("109097", "109098", "109099"), !isLast)) {
                  if (stryMutAct_9fa48("109100")) {
                    {}
                  } else {
                    stryCov_9fa48("109100");
                    const chunkIdx = Math.floor(stryMutAct_9fa48("109101") ? i * limit : (stryCov_9fa48("109101"), i / limit));
                    entry[REDUCE_FIELD.CONTINUATION] = stryMutAct_9fa48("109102") ? `` : (stryCov_9fa48("109102"), `${key}-chunk-${chunkIdx}`);
                  }
                }
                batches.push(entry);
              }
            }
          }
        }
      }
    }
    return batches;
  }
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
  if (stryMutAct_9fa48("109103")) {
    {}
  } else {
    stryCov_9fa48("109103");
    const {
      handler,
      opts,
      cancellationToken,
      executionContext
    } = deps;
    if (stryMutAct_9fa48("109106") ? typeof handler === TYPEOF.FUNCTION : stryMutAct_9fa48("109105") ? false : stryMutAct_9fa48("109104") ? true : (stryCov_9fa48("109104", "109105", "109106"), typeof handler !== TYPEOF.FUNCTION)) {
      if (stryMutAct_9fa48("109107")) {
        {}
      } else {
        stryCov_9fa48("109107");
        throw new Error(ERR.PLAN_REDUCE_HANDLER_REQUIRED);
      }
    }
    cancellationToken.throwIfCancelled();
    const maxPerGroup = stryMutAct_9fa48("109108") ? opts && opts.maxRecordsPerGroup && DEFAULT_MAX_RECORDS_PER_GROUP : (stryCov_9fa48("109108"), (stryMutAct_9fa48("109111") ? opts || opts.maxRecordsPerGroup : stryMutAct_9fa48("109110") ? false : stryMutAct_9fa48("109109") ? true : (stryCov_9fa48("109109", "109110", "109111"), opts && opts.maxRecordsPerGroup)) ?? DEFAULT_MAX_RECORDS_PER_GROUP);
    const maxPerBatch = stryMutAct_9fa48("109112") ? opts && opts.maxGroupsPerBatch && DEFAULT_MAX_GROUPS_PER_BATCH : (stryCov_9fa48("109112"), (stryMutAct_9fa48("109115") ? opts || opts.maxGroupsPerBatch : stryMutAct_9fa48("109114") ? false : stryMutAct_9fa48("109113") ? true : (stryCov_9fa48("109113", "109114", "109115"), opts && opts.maxGroupsPerBatch)) ?? DEFAULT_MAX_GROUPS_PER_BATCH);
    const exchangeManager = executionContext.getExchangeManager();
    const records = collectExchangeRecords(exchangeManager);
    const groups = groupRecordsByKey(records);
    const batches = buildGroupedBatches(groups, maxPerGroup);
    const stageCtx = buildStageContext(executionContext, executionContext.getPlanDiagnostics ? executionContext.getPlanDiagnostics() : undefined);
    const results = stryMutAct_9fa48("109116") ? ["Stryker was here"] : (stryCov_9fa48("109116"), []);
    for (let i = 0; stryMutAct_9fa48("109119") ? i >= batches.length : stryMutAct_9fa48("109118") ? i <= batches.length : stryMutAct_9fa48("109117") ? false : (stryCov_9fa48("109117", "109118", "109119"), i < batches.length); stryMutAct_9fa48("109120") ? i -= maxPerBatch : (stryCov_9fa48("109120"), i += maxPerBatch)) {
      if (stryMutAct_9fa48("109121")) {
        {}
      } else {
        stryCov_9fa48("109121");
        cancellationToken.throwIfCancelled();
        executionContext.getBudgetEnforcer().checkWallTime();
        const slice = stryMutAct_9fa48("109122") ? batches : (stryCov_9fa48("109122"), batches.slice(i, stryMutAct_9fa48("109123") ? i - maxPerBatch : (stryCov_9fa48("109123"), i + maxPerBatch)));
        for (let j = 0; stryMutAct_9fa48("109126") ? j >= slice.length : stryMutAct_9fa48("109125") ? j <= slice.length : stryMutAct_9fa48("109124") ? false : (stryCov_9fa48("109124", "109125", "109126"), j < slice.length); stryMutAct_9fa48("109127") ? j-- : (stryCov_9fa48("109127"), j++)) {
          if (stryMutAct_9fa48("109128")) {
            {}
          } else {
            stryCov_9fa48("109128");
            cancellationToken.throwIfCancelled();
            const handlerResult = await handler(slice[j], stageCtx);
            results.push(handlerResult);
          }
        }
      }
    }
    return results;
  }
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
  if (stryMutAct_9fa48("109129")) {
    {}
  } else {
    stryCov_9fa48("109129");
    const {
      plan
    } = deps;
    const ref = plan[PLAN_FIELD.REF];
    if (stryMutAct_9fa48("109132") ? ref === undefined && ref === null : stryMutAct_9fa48("109131") ? false : stryMutAct_9fa48("109130") ? true : (stryCov_9fa48("109130", "109131", "109132"), (stryMutAct_9fa48("109134") ? ref !== undefined : stryMutAct_9fa48("109133") ? false : (stryCov_9fa48("109133", "109134"), ref === undefined)) || (stryMutAct_9fa48("109136") ? ref !== null : stryMutAct_9fa48("109135") ? false : (stryCov_9fa48("109135", "109136"), ref === null)))) {
      if (stryMutAct_9fa48("109137")) {
        {}
      } else {
        stryCov_9fa48("109137");
        throw new Error(ERR.PLAN_BROADCAST_REF_REQUIRED);
      }
    }
    return stryMutAct_9fa48("109138") ? {} : (stryCov_9fa48("109138"), {
      ref,
      data: null
    });
  }
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
  if (stryMutAct_9fa48("109139")) {
    {}
  } else {
    stryCov_9fa48("109139");
    const {
      plan
    } = deps;
    validatePlan(plan);
    const kind = plan[PLAN_FIELD.KIND];
    if (stryMutAct_9fa48("109142") ? kind !== PLAN_KIND.REDUCE_BY_KEY : stryMutAct_9fa48("109141") ? false : stryMutAct_9fa48("109140") ? true : (stryCov_9fa48("109140", "109141", "109142"), kind === PLAN_KIND.REDUCE_BY_KEY)) {
      if (stryMutAct_9fa48("109143")) {
        {}
      } else {
        stryCov_9fa48("109143");
        return executeReduceByKey(deps);
      }
    }
    if (stryMutAct_9fa48("109146") ? kind !== PLAN_KIND.USE_BROADCAST : stryMutAct_9fa48("109145") ? false : stryMutAct_9fa48("109144") ? true : (stryCov_9fa48("109144", "109145", "109146"), kind === PLAN_KIND.USE_BROADCAST)) {
      if (stryMutAct_9fa48("109147")) {
        {}
      } else {
        stryCov_9fa48("109147");
        return executeUseBroadcast(deps);
      }
    }
  }
}
export { executePlan, validatePlan, executeReduceByKey, executeUseBroadcast, collectExchangeRecords, groupRecordsByKey, buildGroupedBatches };