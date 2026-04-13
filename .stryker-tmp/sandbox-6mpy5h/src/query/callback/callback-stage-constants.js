/**
 * Constants for the callback stage executor.
 *
 * The stage executor runs callbacks in batch/stage mode:
 * one invocation per partition batch, not per-row RPC.
 *
 * Requirements: 4.1, 5.1
 */
// @ts-nocheck


/**
 * Stage execution states.
 * @enum {string}
 */function stryNS_9fa48() {
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
const STAGE_STATE = Object.freeze(stryMutAct_9fa48("109722") ? {} : (stryCov_9fa48("109722"), {
  PENDING: stryMutAct_9fa48("109723") ? "" : (stryCov_9fa48("109723"), 'pending'),
  RUNNING: stryMutAct_9fa48("109724") ? "" : (stryCov_9fa48("109724"), 'running'),
  COMPLETED: stryMutAct_9fa48("109725") ? "" : (stryCov_9fa48("109725"), 'completed'),
  FAILED: stryMutAct_9fa48("109726") ? "" : (stryCov_9fa48("109726"), 'failed'),
  CANCELLED: stryMutAct_9fa48("109727") ? "" : (stryCov_9fa48("109727"), 'cancelled')
}));

/**
 * Field names for stage result objects.
 * @enum {string}
 */
const STAGE_RESULT_FIELD = Object.freeze(stryMutAct_9fa48("109728") ? {} : (stryCov_9fa48("109728"), {
  PARTITION_ID: stryMutAct_9fa48("109729") ? "" : (stryCov_9fa48("109729"), 'partitionId'),
  ROWS: stryMutAct_9fa48("109730") ? "" : (stryCov_9fa48("109730"), 'rows'),
  ROW_COUNT: stryMutAct_9fa48("109731") ? "" : (stryCov_9fa48("109731"), 'rowCount'),
  STATE: stryMutAct_9fa48("109732") ? "" : (stryCov_9fa48("109732"), 'state'),
  ERROR: stryMutAct_9fa48("109733") ? "" : (stryCov_9fa48("109733"), 'error'),
  DURATION_MS: stryMutAct_9fa48("109734") ? "" : (stryCov_9fa48("109734"), 'durationMs')
}));

/**
 * Field names for partition batch objects.
 * @enum {string}
 */
const PARTITION_BATCH_FIELD = Object.freeze(stryMutAct_9fa48("109735") ? {} : (stryCov_9fa48("109735"), {
  PARTITION_ID: stryMutAct_9fa48("109736") ? "" : (stryCov_9fa48("109736"), 'partitionId'),
  ROWS: stryMutAct_9fa48("109737") ? "" : (stryCov_9fa48("109737"), 'rows'),
  ROW_COUNT: stryMutAct_9fa48("109738") ? "" : (stryCov_9fa48("109738"), 'rowCount')
}));

/**
 * Error messages for stage execution failures.
 * @enum {string}
 */
const STAGE_ERROR_MSG = Object.freeze(stryMutAct_9fa48("109739") ? {} : (stryCov_9fa48("109739"), {
  CALLBACK_REQUIRED: stryMutAct_9fa48("109740") ? "" : (stryCov_9fa48("109740"), 'Callback function is required for stage execution'),
  BATCHES_REQUIRED: stryMutAct_9fa48("109741") ? "" : (stryCov_9fa48("109741"), 'Partition batches array is required for stage execution'),
  BATCHES_MUST_BE_ARRAY: stryMutAct_9fa48("109742") ? "" : (stryCov_9fa48("109742"), 'Partition batches must be an array'),
  BATCH_MISSING_PARTITION_ID: stryMutAct_9fa48("109743") ? "" : (stryCov_9fa48("109743"), 'Each partition batch must have a partitionId'),
  BATCH_MISSING_ROWS: stryMutAct_9fa48("109744") ? "" : (stryCov_9fa48("109744"), 'Each partition batch must have a rows array'),
  STAGE_ALREADY_RUNNING: stryMutAct_9fa48("109745") ? "" : (stryCov_9fa48("109745"), 'Stage execution is already in progress'),
  CALLBACK_EXECUTION_FAILED: stryMutAct_9fa48("109746") ? "" : (stryCov_9fa48("109746"), 'Callback execution failed on partition'),
  STAGE_CANCELLED: stryMutAct_9fa48("109747") ? "" : (stryCov_9fa48("109747"), 'Stage execution was cancelled')
}));

/**
 * Log messages for stage execution events.
 * @enum {string}
 */
const STAGE_LOG_MSG = Object.freeze(stryMutAct_9fa48("109748") ? {} : (stryCov_9fa48("109748"), {
  STAGE_STARTED: stryMutAct_9fa48("109749") ? "" : (stryCov_9fa48("109749"), 'Callback stage execution started'),
  STAGE_COMPLETED: stryMutAct_9fa48("109750") ? "" : (stryCov_9fa48("109750"), 'Callback stage execution completed'),
  STAGE_FAILED: stryMutAct_9fa48("109751") ? "" : (stryCov_9fa48("109751"), 'Callback stage execution failed'),
  PARTITION_STARTED: stryMutAct_9fa48("109752") ? "" : (stryCov_9fa48("109752"), 'Partition batch callback started'),
  PARTITION_COMPLETED: stryMutAct_9fa48("109753") ? "" : (stryCov_9fa48("109753"), 'Partition batch callback completed'),
  PARTITION_FAILED: stryMutAct_9fa48("109754") ? "" : (stryCov_9fa48("109754"), 'Partition batch callback failed')
}));

/**
 * Telemetry event types emitted by the callback execution
 * host for per-batch and aggregate metrics.
 * @enum {string}
 */
const CALLBACK_TELEMETRY_EVENT = Object.freeze(stryMutAct_9fa48("109755") ? {} : (stryCov_9fa48("109755"), {
  BATCH_COMPLETE: stryMutAct_9fa48("109756") ? "" : (stryCov_9fa48("109756"), 'batchComplete'),
  BATCH_FAILED: stryMutAct_9fa48("109757") ? "" : (stryCov_9fa48("109757"), 'batchFailed'),
  EXECUTION_COMPLETE: stryMutAct_9fa48("109758") ? "" : (stryCov_9fa48("109758"), 'executionComplete'),
  BUDGET_EXCEEDED: stryMutAct_9fa48("109759") ? "" : (stryCov_9fa48("109759"), 'budgetExceeded'),
  CANCELLED: stryMutAct_9fa48("109760") ? "" : (stryCov_9fa48("109760"), 'cancelled'),
  DEDUPE_SKIP: stryMutAct_9fa48("109761") ? "" : (stryCov_9fa48("109761"), 'dedupeSkip')
}));

/**
 * Field names for callback telemetry snapshots.
 * @enum {string}
 */
const CALLBACK_TELEMETRY_FIELD = Object.freeze(stryMutAct_9fa48("109762") ? {} : (stryCov_9fa48("109762"), {
  EVENT_TYPE: stryMutAct_9fa48("109763") ? "" : (stryCov_9fa48("109763"), 'eventType'),
  PARTITION_ID: stryMutAct_9fa48("109764") ? "" : (stryCov_9fa48("109764"), 'partitionId'),
  BATCH_INDEX: stryMutAct_9fa48("109765") ? "" : (stryCov_9fa48("109765"), 'batchIndex'),
  ROW_COUNT: stryMutAct_9fa48("109766") ? "" : (stryCov_9fa48("109766"), 'rowCount'),
  BYTE_ESTIMATE: stryMutAct_9fa48("109767") ? "" : (stryCov_9fa48("109767"), 'byteEstimate'),
  DURATION_MS: stryMutAct_9fa48("109768") ? "" : (stryCov_9fa48("109768"), 'durationMs'),
  TOTAL_BATCHES: stryMutAct_9fa48("109769") ? "" : (stryCov_9fa48("109769"), 'totalBatches'),
  TOTAL_ROWS: stryMutAct_9fa48("109770") ? "" : (stryCov_9fa48("109770"), 'totalRows'),
  TOTAL_BYTES: stryMutAct_9fa48("109771") ? "" : (stryCov_9fa48("109771"), 'totalBytes'),
  TOTAL_DURATION_MS: stryMutAct_9fa48("109772") ? "" : (stryCov_9fa48("109772"), 'totalDurationMs'),
  STATE: stryMutAct_9fa48("109773") ? "" : (stryCov_9fa48("109773"), 'state'),
  ERROR: stryMutAct_9fa48("109774") ? "" : (stryCov_9fa48("109774"), 'error')
}));

/**
 * Byte multiplier for JSON.stringify length to approximate
 * UTF-16 in-memory byte cost.
 * @type {number}
 */
const BYTE_ESTIMATE_MULTIPLIER = 2;

/**
 * Lineage artifact type for the aggregate stage result.
 * @type {string}
 */
const STAGE_ARTIFACT_TYPE = stryMutAct_9fa48("109775") ? "" : (stryCov_9fa48("109775"), 'stage');

/**
 * Lineage artifact type for stage batch operations.
 * @type {string}
 */
const STAGE_BATCH_ARTIFACT_TYPE = stryMutAct_9fa48("109776") ? "" : (stryCov_9fa48("109776"), 'stage_batch');

/**
 * Lineage artifact type for the callback host aggregate result.
 * @type {string}
 */
const CALLBACK_HOST_ARTIFACT_TYPE = stryMutAct_9fa48("109777") ? "" : (stryCov_9fa48("109777"), 'callback_host');

/**
 * Lineage artifact type for callback batch operations.
 * @type {string}
 */
const CALLBACK_BATCH_ARTIFACT_TYPE = stryMutAct_9fa48("109778") ? "" : (stryCov_9fa48("109778"), 'callback_batch');
export { STAGE_STATE, STAGE_RESULT_FIELD, PARTITION_BATCH_FIELD, STAGE_ERROR_MSG, STAGE_LOG_MSG, STAGE_ARTIFACT_TYPE, STAGE_BATCH_ARTIFACT_TYPE, CALLBACK_HOST_ARTIFACT_TYPE, CALLBACK_BATCH_ARTIFACT_TYPE, CALLBACK_TELEMETRY_EVENT, CALLBACK_TELEMETRY_FIELD, BYTE_ESTIMATE_MULTIPLIER };