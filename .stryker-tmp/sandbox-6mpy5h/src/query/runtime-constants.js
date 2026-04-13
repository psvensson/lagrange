/**
 * Constants for the runtime.run API surface.
 *
 * Requirements: 4.1, 4.2
 * @module query/runtime-constants
 */
// @ts-nocheck


/**
 * Snapshot mode identifiers for runtime execution.
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
const SNAPSHOT_MODE = Object.freeze(stryMutAct_9fa48("118582") ? {} : (stryCov_9fa48("118582"), {
  READ_COMMITTED: stryMutAct_9fa48("118583") ? "" : (stryCov_9fa48("118583"), 'readCommitted'),
  SNAPSHOT: stryMutAct_9fa48("118584") ? "" : (stryCov_9fa48("118584"), 'snapshot')
}));

/**
 * Default snapshot mode when none is specified.
 * @type {string}
 */
const DEFAULT_SNAPSHOT_MODE = SNAPSHOT_MODE.READ_COMMITTED;

/**
 * Default session identity for runtime execution.
 * @type {string}
 */
const DEFAULT_RUNTIME_SESSION = stryMutAct_9fa48("118585") ? "" : (stryCov_9fa48("118585"), 'runtime-default');

/**
 * Call mode identifiers for ctx.call dispatch.
 * @enum {string}
 */
const CALL_MODE = Object.freeze(stryMutAct_9fa48("118586") ? {} : (stryCov_9fa48("118586"), {
  ITERATOR: stryMutAct_9fa48("118587") ? "" : (stryCov_9fa48("118587"), 'iterator'),
  STAGE: stryMutAct_9fa48("118588") ? "" : (stryCov_9fa48("118588"), 'stage'),
  PLAN: stryMutAct_9fa48("118589") ? "" : (stryCov_9fa48("118589"), 'plan')
}));

/**
 * Error messages for the runtime runner.
 * @enum {string}
 */
const RUNTIME_ERROR_MSG = Object.freeze(stryMutAct_9fa48("118590") ? {} : (stryCov_9fa48("118590"), {
  USER_FN_REQUIRED: stryMutAct_9fa48("118591") ? "" : (stryCov_9fa48("118591"), 'runtime.run requires an async function as the first argument'),
  USER_FN_MUST_BE_FUNCTION: stryMutAct_9fa48("118592") ? "" : (stryCov_9fa48("118592"), 'runtime.run first argument must be a function'),
  INVALID_SNAPSHOT_MODE: stryMutAct_9fa48("118593") ? "" : (stryCov_9fa48("118593"), 'snapshot.mode must be "readCommitted" or "snapshot"'),
  INVALID_SNAPSHOT_TS: stryMutAct_9fa48("118594") ? "" : (stryCov_9fa48("118594"), 'snapshot.ts must be a number when provided'),
  INVALID_BUDGETS: stryMutAct_9fa48("118595") ? "" : (stryCov_9fa48("118595"), 'opts.budgets must be an object when provided'),
  INVALID_SESSION: stryMutAct_9fa48("118596") ? "" : (stryCov_9fa48("118596"), 'opts.session must be a string when provided'),
  EXECUTION_FAILED: stryMutAct_9fa48("118597") ? "" : (stryCov_9fa48("118597"), 'runtime.run execution failed'),
  CALL_QUERY_REQUIRED: stryMutAct_9fa48("118598") ? "" : (stryCov_9fa48("118598"), 'ctx.call requires a SQL string or plan object as the first argument'),
  CALL_PARAMS_MUST_BE_ARRAY: stryMutAct_9fa48("118599") ? "" : (stryCov_9fa48("118599"), 'ctx.call params must be an array when provided'),
  STAGE_MODE_NOT_WIRED: stryMutAct_9fa48("118600") ? "" : (stryCov_9fa48("118600"), 'ctx.call Stage_Mode is not yet wired'),
  PLAN_MODE_NOT_WIRED: stryMutAct_9fa48("118601") ? "" : (stryCov_9fa48("118601"), 'ctx.call Plan_Mode is not yet wired')
}));

/**
 * Default batch size for Stage_Mode execution.
 * @type {number}
 */
const DEFAULT_BATCH_SIZE = 1000;

/**
 * Stage option field names.
 * @enum {string}
 */
const STAGE_OPTION = Object.freeze(stryMutAct_9fa48("118602") ? {} : (stryCov_9fa48("118602"), {
  BATCH_SIZE: stryMutAct_9fa48("118603") ? "" : (stryCov_9fa48("118603"), 'batchSize'),
  EXCHANGE_BY: stryMutAct_9fa48("118604") ? "" : (stryCov_9fa48("118604"), 'exchangeBy')
}));

/**
 * Plan object kind identifiers for Plan_Mode dispatch.
 * @enum {string}
 */
const PLAN_KIND = Object.freeze(stryMutAct_9fa48("118605") ? {} : (stryCov_9fa48("118605"), {
  REDUCE_BY_KEY: stryMutAct_9fa48("118606") ? "" : (stryCov_9fa48("118606"), 'reduceByKey'),
  USE_BROADCAST: stryMutAct_9fa48("118607") ? "" : (stryCov_9fa48("118607"), 'useBroadcast')
}));

/**
 * Set of supported plan kinds for fast membership checks.
 * @type {ReadonlySet<string>}
 */
const SUPPORTED_PLAN_KINDS = Object.freeze(new Set(Object.values(PLAN_KIND)));

/**
 * Plan field name constants.
 * @enum {string}
 */
const PLAN_FIELD = Object.freeze(stryMutAct_9fa48("118608") ? {} : (stryCov_9fa48("118608"), {
  KIND: stryMutAct_9fa48("118609") ? "" : (stryCov_9fa48("118609"), 'kind'),
  STREAM: stryMutAct_9fa48("118610") ? "" : (stryCov_9fa48("118610"), 'stream'),
  REF: stryMutAct_9fa48("118611") ? "" : (stryCov_9fa48("118611"), 'ref')
}));

/**
 * Error messages for plan-object validation and dispatch.
 * @enum {string}
 */
const PLAN_ERROR_MSG = Object.freeze(stryMutAct_9fa48("118612") ? {} : (stryCov_9fa48("118612"), {
  PLAN_MISSING_KIND: stryMutAct_9fa48("118613") ? "" : (stryCov_9fa48("118613"), 'Plan object must have a "kind" field'),
  PLAN_UNSUPPORTED_KIND: stryMutAct_9fa48("118614") ? "" : (stryCov_9fa48("118614"), 'Unsupported plan kind: '),
  PLAN_REDUCE_HANDLER_REQUIRED: stryMutAct_9fa48("118615") ? "" : (stryCov_9fa48("118615"), 'reduceByKey plan requires a handler function'),
  PLAN_BROADCAST_REF_REQUIRED: stryMutAct_9fa48("118616") ? "" : (stryCov_9fa48("118616"), 'useBroadcast plan requires a "ref" field')
}));

/**
 * Error messages for ctx.out output primitive.
 * @enum {string}
 */
const OUT_ERROR_MSG = Object.freeze(stryMutAct_9fa48("118617") ? {} : (stryCov_9fa48("118617"), {
  VALUE_REQUIRED: stryMutAct_9fa48("118618") ? "" : (stryCov_9fa48("118618"), 'ctx.out requires a value argument'),
  STREAM_CLOSED: stryMutAct_9fa48("118619") ? "" : (stryCov_9fa48("118619"), 'Output stream is closed')
}));

/**
 * Output telemetry event types.
 * @enum {string}
 */
const OUT_TELEMETRY_EVENT = Object.freeze(stryMutAct_9fa48("118620") ? {} : (stryCov_9fa48("118620"), {
  WRITE: stryMutAct_9fa48("118621") ? "" : (stryCov_9fa48("118621"), 'write'),
  BUDGET_EXCEEDED: stryMutAct_9fa48("118622") ? "" : (stryCov_9fa48("118622"), 'budgetExceeded'),
  STREAM_CLOSED: stryMutAct_9fa48("118623") ? "" : (stryCov_9fa48("118623"), 'streamClosed')
}));

/**
 * Output telemetry field names for snapshots.
 * @enum {string}
 */
const OUT_TELEMETRY_FIELD = Object.freeze(stryMutAct_9fa48("118624") ? {} : (stryCov_9fa48("118624"), {
  ROW_COUNT: stryMutAct_9fa48("118625") ? "" : (stryCov_9fa48("118625"), 'rowCount'),
  BYTE_COUNT: stryMutAct_9fa48("118626") ? "" : (stryCov_9fa48("118626"), 'byteCount'),
  EVENT_TYPE: stryMutAct_9fa48("118627") ? "" : (stryCov_9fa48("118627"), 'eventType'),
  WRITE_COUNT: stryMutAct_9fa48("118628") ? "" : (stryCov_9fa48("118628"), 'writeCount'),
  BUDGET_EXCEEDED_COUNT: stryMutAct_9fa48("118629") ? "" : (stryCov_9fa48("118629"), 'budgetExceededCount')
}));

/**
 * Exchange mode identifiers for stage `exchangeBy` option.
 * @enum {string}
 */
const EXCHANGE_MODE = Object.freeze(stryMutAct_9fa48("118630") ? {} : (stryCov_9fa48("118630"), {
  LOCAL: stryMutAct_9fa48("118631") ? "" : (stryCov_9fa48("118631"), 'local'),
  KEY: stryMutAct_9fa48("118632") ? "" : (stryCov_9fa48("118632"), 'key')
}));

/**
 * Default exchange mode when `exchangeBy` is not specified.
 * @type {string}
 */
const DEFAULT_EXCHANGE_MODE = EXCHANGE_MODE.LOCAL;

/**
 * Error messages for exchange mode validation and routing.
 * @enum {string}
 */
const EXCHANGE_ERROR_MSG = Object.freeze(stryMutAct_9fa48("118633") ? {} : (stryCov_9fa48("118633"), {
  INVALID_EXCHANGE_MODE: stryMutAct_9fa48("118634") ? "" : (stryCov_9fa48("118634"), 'opts.exchangeBy must be "local" or "key" when provided'),
  EMIT_KEY_REQUIRED: stryMutAct_9fa48("118635") ? "" : (stryCov_9fa48("118635"), 'ctx.emit requires a string key as the first argument'),
  EXCHANGE_CLOSED: stryMutAct_9fa48("118636") ? "" : (stryCov_9fa48("118636"), 'Exchange is closed; no further routing is accepted')
}));

/**
 * Documentation constant for the no-global-ordering
 * guarantee on exchanged records.
 *
 * Records emitted to different destination partitions may
 * be consumed in any order. Only records within a single
 * partition buffer preserve insertion order.
 *
 * Requirements: 7.4
 * @type {string}
 */
const EXCHANGE_NO_ORDERING_GUARANTEE = (stryMutAct_9fa48("118637") ? "" : (stryCov_9fa48("118637"), 'Exchanged records carry no global ordering guarantee; ')) + (stryMutAct_9fa48("118638") ? "" : (stryCov_9fa48("118638"), 'records routed to different partitions may be consumed ')) + (stryMutAct_9fa48("118639") ? "" : (stryCov_9fa48("118639"), 'in any order'));

/**
 * Set of valid exchange modes for fast membership checks.
 * @type {ReadonlySet<string>}
 */
const VALID_EXCHANGE_MODES = Object.freeze(new Set(Object.values(EXCHANGE_MODE)));

/**
 * Field names for emit metadata used in dedupe-key support.
 * @enum {string}
 */
const EMIT_META_FIELD = Object.freeze(stryMutAct_9fa48("118640") ? {} : (stryCov_9fa48("118640"), {
  DEDUPE_KEY: stryMutAct_9fa48("118641") ? "" : (stryCov_9fa48("118641"), 'dedupeKey'),
  LINEAGE_ID: stryMutAct_9fa48("118642") ? "" : (stryCov_9fa48("118642"), 'lineageId')
}));

/**
 * Primitive type identifier for emit operations in lineage
 * tracking.
 * @type {string}
 */
const EMIT_PRIMITIVE_TYPE = stryMutAct_9fa48("118643") ? "" : (stryCov_9fa48("118643"), 'emit');

/**
 * Stage ID used for emit dedupe when no explicit stage is
 * active.
 * @type {string}
 */
const EMIT_DEFAULT_STAGE_ID = stryMutAct_9fa48("118644") ? "" : (stryCov_9fa48("118644"), 'emit');

/**
 * Field names for exchange record entries.
 * @enum {string}
 */
const EXCHANGE_FIELD = Object.freeze(stryMutAct_9fa48("118645") ? {} : (stryCov_9fa48("118645"), {
  KEY: stryMutAct_9fa48("118646") ? "" : (stryCov_9fa48("118646"), 'key'),
  VALUE: stryMutAct_9fa48("118647") ? "" : (stryCov_9fa48("118647"), 'value'),
  META: stryMutAct_9fa48("118648") ? "" : (stryCov_9fa48("118648"), 'meta'),
  PARTITION_INDEX: stryMutAct_9fa48("118649") ? "" : (stryCov_9fa48("118649"), 'partitionIndex')
}));

/**
 * Default number of destination partitions for key-based
 * exchange routing when no explicit count is provided.
 * @type {number}
 */
const DEFAULT_EXCHANGE_PARTITION_COUNT = 16;

/**
 * Log/subsystem identifier for the runtime runner.
 * @type {string}
 */
const RUNTIME_SUBSYSTEM = stryMutAct_9fa48("118650") ? "" : (stryCov_9fa48("118650"), 'runtime-runner');

/**
 * Classification results for nested ctx.call inside stage
 * handlers.
 * @enum {string}
 */
const NESTED_CALL_CLASSIFICATION = Object.freeze(stryMutAct_9fa48("118651") ? {} : (stryCov_9fa48("118651"), {
  BOUNDED: stryMutAct_9fa48("118652") ? "" : (stryCov_9fa48("118652"), 'bounded'),
  UNBOUNDED: stryMutAct_9fa48("118653") ? "" : (stryCov_9fa48("118653"), 'unbounded')
}));

/**
 * Reason strings for nested call classification decisions.
 * @enum {string}
 */
const NESTED_CALL_REASON = Object.freeze(stryMutAct_9fa48("118654") ? {} : (stryCov_9fa48("118654"), {
  PK_POINT_LOOKUP: stryMutAct_9fa48("118655") ? "" : (stryCov_9fa48("118655"), 'Primary key point lookup (equality on single key)'),
  UNIQUE_KEY_LOOKUP: stryMutAct_9fa48("118656") ? "" : (stryCov_9fa48("118656"), 'Unique key point lookup (equality on unique column)'),
  BOUNDED_IN_CLAUSE: stryMutAct_9fa48("118657") ? "" : (stryCov_9fa48("118657"), 'Capped batched key lookup via IN clause'),
  INDEXED_LIMIT_QUERY: stryMutAct_9fa48("118658") ? "" : (stryCov_9fa48("118658"), 'Strict indexed limit query with WHERE and LIMIT'),
  FULL_TABLE_SCAN: stryMutAct_9fa48("118659") ? "" : (stryCov_9fa48("118659"), 'Full table scan with no WHERE clause'),
  RANGE_SCAN_NO_LIMIT: stryMutAct_9fa48("118660") ? "" : (stryCov_9fa48("118660"), 'Range scan without LIMIT clause'),
  JOIN_DETECTED: stryMutAct_9fa48("118661") ? "" : (stryCov_9fa48("118661"), 'Query contains JOIN — unbounded cross-partition work'),
  SUBQUERY_DETECTED: stryMutAct_9fa48("118662") ? "" : (stryCov_9fa48("118662"), 'Query contains nested SELECT subquery'),
  NO_LIMIT_NON_PK: stryMutAct_9fa48("118663") ? "" : (stryCov_9fa48("118663"), 'Non-primary-key query without LIMIT clause'),
  CONSERVATIVE_DEFAULT: (stryMutAct_9fa48("118664") ? "" : (stryCov_9fa48("118664"), 'Could not confirm bounded access pattern; ')) + (stryMutAct_9fa48("118665") ? "" : (stryCov_9fa48("118665"), 'defaulting to unbounded'))
}));

/**
 * Teachable error messages for unbounded nested call rejection.
 * @enum {string}
 */
const NESTED_CALL_ERROR_MSG = Object.freeze(stryMutAct_9fa48("118666") ? {} : (stryCov_9fa48("118666"), {
  UNBOUNDED_REJECTED: (stryMutAct_9fa48("118667") ? "" : (stryCov_9fa48("118667"), 'Unbounded nested ctx.call is rejected in v0. ')) + (stryMutAct_9fa48("118668") ? "" : (stryCov_9fa48("118668"), 'Allowed bounded patterns: primary-key equality lookup, ')) + (stryMutAct_9fa48("118669") ? "" : (stryCov_9fa48("118669"), 'IN clause with bounded params, WHERE + LIMIT query. ')) + (stryMutAct_9fa48("118670") ? "" : (stryCov_9fa48("118670"), 'For unbounded work use ctx.emit(...) + ')) + (stryMutAct_9fa48("118671") ? "" : (stryCov_9fa48("118671"), 'ctx.call({kind: "reduceByKey", ...}).')),
  QUERY_REQUIRED: stryMutAct_9fa48("118672") ? "" : (stryCov_9fa48("118672"), 'classifyNestedCall requires a SQL query string')
}));

/**
 * Maximum parameter count for an IN clause to be considered
 * bounded.
 * @type {number}
 */
const NESTED_CALL_MAX_IN_PARAMS = 100;

/**
 * Field names for reduceByKey grouped batch entries.
 * @enum {string}
 */
const REDUCE_FIELD = Object.freeze(stryMutAct_9fa48("118673") ? {} : (stryCov_9fa48("118673"), {
  KEY: stryMutAct_9fa48("118674") ? "" : (stryCov_9fa48("118674"), 'key'),
  RECORDS: stryMutAct_9fa48("118675") ? "" : (stryCov_9fa48("118675"), 'records'),
  CONTINUATION: stryMutAct_9fa48("118676") ? "" : (stryCov_9fa48("118676"), 'continuation')
}));

/**
 * Error messages for reduceByKey execution.
 * @enum {string}
 */
const REDUCE_ERROR_MSG = Object.freeze(stryMutAct_9fa48("118677") ? {} : (stryCov_9fa48("118677"), {
  NO_EXCHANGE_MANAGER: (stryMutAct_9fa48("118678") ? "" : (stryCov_9fa48("118678"), 'reduceByKey requires an exchange manager on the ')) + (stryMutAct_9fa48("118679") ? "" : (stryCov_9fa48("118679"), 'execution context')),
  EMPTY_EXCHANGE: stryMutAct_9fa48("118680") ? "" : (stryCov_9fa48("118680"), 'reduceByKey received no records from exchange buffers')
}));

/**
 * Default maximum number of groups per batch delivered to
 * the reduceByKey handler.
 * @type {number}
 */
const DEFAULT_MAX_GROUPS_PER_BATCH = 100;

/**
 * Default maximum number of records per group in a
 * reduceByKey batch.
 * @type {number}
 */
const DEFAULT_MAX_RECORDS_PER_GROUP = 10000;

/**
 * Retry scope identifiers for failure/retry boundaries.
 *
 * In v0, retries are coarse-grained at stage or batch
 * boundaries — not per-row. The batch loop in executeStage
 * is the retry boundary: if a batch fails, the entire batch
 * is retried (or the stage is aborted), never individual
 * rows within a batch.
 *
 * Requirements: 10.1
 * @enum {string}
 */
const RETRY_SCOPE = Object.freeze(stryMutAct_9fa48("118681") ? {} : (stryCov_9fa48("118681"), {
  STAGE: stryMutAct_9fa48("118682") ? "" : (stryCov_9fa48("118682"), 'stage'),
  BATCH: stryMutAct_9fa48("118683") ? "" : (stryCov_9fa48("118683"), 'batch')
}));

/**
 * Field names for nested call classification diagnostic
 * entries.
 * @enum {string}
 */
const DIAGNOSTICS_FIELD = Object.freeze(stryMutAct_9fa48("118684") ? {} : (stryCov_9fa48("118684"), {
  QUERY: stryMutAct_9fa48("118685") ? "" : (stryCov_9fa48("118685"), 'query'),
  CLASSIFICATION: stryMutAct_9fa48("118686") ? "" : (stryCov_9fa48("118686"), 'classification'),
  REASON: stryMutAct_9fa48("118687") ? "" : (stryCov_9fa48("118687"), 'reason'),
  TIMESTAMP: stryMutAct_9fa48("118688") ? "" : (stryCov_9fa48("118688"), 'timestamp')
}));
export { SNAPSHOT_MODE, DEFAULT_SNAPSHOT_MODE, DEFAULT_RUNTIME_SESSION, CALL_MODE, RUNTIME_ERROR_MSG, RUNTIME_SUBSYSTEM, DEFAULT_BATCH_SIZE, STAGE_OPTION, EXCHANGE_MODE, DEFAULT_EXCHANGE_MODE, EXCHANGE_ERROR_MSG, EXCHANGE_NO_ORDERING_GUARANTEE, EXCHANGE_FIELD, DEFAULT_EXCHANGE_PARTITION_COUNT, VALID_EXCHANGE_MODES, EMIT_META_FIELD, EMIT_PRIMITIVE_TYPE, EMIT_DEFAULT_STAGE_ID, PLAN_KIND, SUPPORTED_PLAN_KINDS, PLAN_FIELD, PLAN_ERROR_MSG, OUT_ERROR_MSG, OUT_TELEMETRY_EVENT, OUT_TELEMETRY_FIELD, NESTED_CALL_CLASSIFICATION, NESTED_CALL_REASON, NESTED_CALL_ERROR_MSG, NESTED_CALL_MAX_IN_PARAMS, DIAGNOSTICS_FIELD, REDUCE_FIELD, REDUCE_ERROR_MSG, DEFAULT_MAX_GROUPS_PER_BATCH, DEFAULT_MAX_RECORDS_PER_GROUP, RETRY_SCOPE };