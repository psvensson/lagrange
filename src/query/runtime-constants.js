/**
 * Constants for the runtime.run API surface.
 *
 * Requirements: 4.1, 4.2
 * @module query/runtime-constants
 */

/**
 * Snapshot mode identifiers for runtime execution.
 * @enum {string}
 */
const SNAPSHOT_MODE = Object.freeze({
  READ_COMMITTED: 'readCommitted',
  SNAPSHOT: 'snapshot',
});

/**
 * Default snapshot mode when none is specified.
 * @type {string}
 */
const DEFAULT_SNAPSHOT_MODE = SNAPSHOT_MODE.READ_COMMITTED;

/**
 * Default session identity for runtime execution.
 * @type {string}
 */
const DEFAULT_RUNTIME_SESSION = 'runtime-default';

/**
 * Call mode identifiers for ctx.call dispatch.
 * @enum {string}
 */
const CALL_MODE = Object.freeze({
  ITERATOR: 'iterator',
  STAGE: 'stage',
  PLAN: 'plan',
});

/**
 * Error messages for the runtime runner.
 * @enum {string}
 */
const RUNTIME_ERROR_MSG = Object.freeze({
  USER_FN_REQUIRED:
    'runtime.run requires an async function as the first argument',
  USER_FN_MUST_BE_FUNCTION:
    'runtime.run first argument must be a function',
  INVALID_SNAPSHOT_MODE:
    'snapshot.mode must be "readCommitted" or "snapshot"',
  INVALID_SNAPSHOT_TS:
    'snapshot.ts must be a number when provided',
  INVALID_BUDGETS:
    'opts.budgets must be an object when provided',
  INVALID_SESSION:
    'opts.session must be a string when provided',
  EXECUTION_FAILED:
    'runtime.run execution failed',
  CALL_QUERY_REQUIRED:
    'ctx.call requires a SQL string or plan object as the first argument',
  CALL_PARAMS_MUST_BE_ARRAY:
    'ctx.call params must be an array when provided',
  STAGE_MODE_NOT_WIRED:
    'ctx.call Stage_Mode is not yet wired',
  PLAN_MODE_NOT_WIRED:
    'ctx.call Plan_Mode is not yet wired',
});

/**
 * Default batch size for Stage_Mode execution.
 * @type {number}
 */
const DEFAULT_BATCH_SIZE = 1000;

/**
 * Stage option field names.
 * @enum {string}
 */
const STAGE_OPTION = Object.freeze({
  BATCH_SIZE: 'batchSize',
  EXCHANGE_BY: 'exchangeBy',
});

/**
 * Plan object kind identifiers for Plan_Mode dispatch.
 * @enum {string}
 */
const PLAN_KIND = Object.freeze({
  REDUCE_BY_KEY: 'reduceByKey',
  USE_BROADCAST: 'useBroadcast',
});

/**
 * Set of supported plan kinds for fast membership checks.
 * @type {ReadonlySet<string>}
 */
const SUPPORTED_PLAN_KINDS = Object.freeze(
  new Set(Object.values(PLAN_KIND)),
);

/**
 * Plan field name constants.
 * @enum {string}
 */
const PLAN_FIELD = Object.freeze({
  KIND: 'kind',
  STREAM: 'stream',
  REF: 'ref',
});

/**
 * Error messages for plan-object validation and dispatch.
 * @enum {string}
 */
const PLAN_ERROR_MSG = Object.freeze({
  PLAN_MISSING_KIND:
    'Plan object must have a "kind" field',
  PLAN_UNSUPPORTED_KIND:
    'Unsupported plan kind: ',
  PLAN_REDUCE_HANDLER_REQUIRED:
    'reduceByKey plan requires a handler function',
  PLAN_BROADCAST_REF_REQUIRED:
    'useBroadcast plan requires a "ref" field',
});

/**
 * Error messages for ctx.out output primitive.
 * @enum {string}
 */
const OUT_ERROR_MSG = Object.freeze({
  VALUE_REQUIRED:
    'ctx.out requires a value argument',
  STREAM_CLOSED:
    'Output stream is closed',
});

/**
 * Output telemetry event types.
 * @enum {string}
 */
const OUT_TELEMETRY_EVENT = Object.freeze({
  WRITE: 'write',
  BUDGET_EXCEEDED: 'budgetExceeded',
  STREAM_CLOSED: 'streamClosed',
});

/**
 * Output telemetry field names for snapshots.
 * @enum {string}
 */
const OUT_TELEMETRY_FIELD = Object.freeze({
  ROW_COUNT: 'rowCount',
  BYTE_COUNT: 'byteCount',
  EVENT_TYPE: 'eventType',
  WRITE_COUNT: 'writeCount',
  BUDGET_EXCEEDED_COUNT: 'budgetExceededCount',
});

/**
 * Exchange mode identifiers for stage `exchangeBy` option.
 * @enum {string}
 */
const EXCHANGE_MODE = Object.freeze({
  LOCAL: 'local',
  KEY: 'key',
});

/**
 * Default exchange mode when `exchangeBy` is not specified.
 * @type {string}
 */
const DEFAULT_EXCHANGE_MODE = EXCHANGE_MODE.LOCAL;

/**
 * Error messages for exchange mode validation and routing.
 * @enum {string}
 */
const EXCHANGE_ERROR_MSG = Object.freeze({
  INVALID_EXCHANGE_MODE:
    'opts.exchangeBy must be "local" or "key" when provided',
  EMIT_KEY_REQUIRED:
    'ctx.emit requires a string key as the first argument',
  EXCHANGE_CLOSED:
    'Exchange is closed; no further routing is accepted',
});

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
const EXCHANGE_NO_ORDERING_GUARANTEE =
  'Exchanged records carry no global ordering guarantee; ' +
  'records routed to different partitions may be consumed ' +
  'in any order';

/**
 * Set of valid exchange modes for fast membership checks.
 * @type {ReadonlySet<string>}
 */
const VALID_EXCHANGE_MODES = Object.freeze(
  new Set(Object.values(EXCHANGE_MODE)),
);

/**
 * Field names for emit metadata used in dedupe-key support.
 * @enum {string}
 */
const EMIT_META_FIELD = Object.freeze({
  DEDUPE_KEY: 'dedupeKey',
  LINEAGE_ID: 'lineageId',
});

/**
 * Primitive type identifier for emit operations in lineage
 * tracking.
 * @type {string}
 */
const EMIT_PRIMITIVE_TYPE = 'emit';

/**
 * Stage ID used for emit dedupe when no explicit stage is
 * active.
 * @type {string}
 */
const EMIT_DEFAULT_STAGE_ID = 'emit';

/**
 * Field names for exchange record entries.
 * @enum {string}
 */
const EXCHANGE_FIELD = Object.freeze({
  KEY: 'key',
  VALUE: 'value',
  META: 'meta',
  PARTITION_INDEX: 'partitionIndex',
});

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
const RUNTIME_SUBSYSTEM = 'runtime-runner';

/**
 * Classification results for nested ctx.call inside stage
 * handlers.
 * @enum {string}
 */
const NESTED_CALL_CLASSIFICATION = Object.freeze({
  BOUNDED: 'bounded',
  UNBOUNDED: 'unbounded',
});

/**
 * Reason strings for nested call classification decisions.
 * @enum {string}
 */
const NESTED_CALL_REASON = Object.freeze({
  PK_POINT_LOOKUP:
    'Primary key point lookup (equality on single key)',
  UNIQUE_KEY_LOOKUP:
    'Unique key point lookup (equality on unique column)',
  BOUNDED_IN_CLAUSE:
    'Capped batched key lookup via IN clause',
  INDEXED_LIMIT_QUERY:
    'Strict indexed limit query with WHERE and LIMIT',
  FULL_TABLE_SCAN:
    'Full table scan with no WHERE clause',
  RANGE_SCAN_NO_LIMIT:
    'Range scan without LIMIT clause',
  JOIN_DETECTED:
    'Query contains JOIN — unbounded cross-partition work',
  SUBQUERY_DETECTED:
    'Query contains nested SELECT subquery',
  NO_LIMIT_NON_PK:
    'Non-primary-key query without LIMIT clause',
  CONSERVATIVE_DEFAULT:
    'Could not confirm bounded access pattern; ' +
    'defaulting to unbounded',
});

/**
 * Teachable error messages for unbounded nested call rejection.
 * @enum {string}
 */
const NESTED_CALL_ERROR_MSG = Object.freeze({
  UNBOUNDED_REJECTED:
    'Unbounded nested ctx.call is rejected in v0. ' +
    'Allowed bounded patterns: primary-key equality lookup, ' +
    'IN clause with bounded params, WHERE + LIMIT query. ' +
    'For unbounded work use ctx.emit(...) + ' +
    'ctx.call({kind: "reduceByKey", ...}).',
  QUERY_REQUIRED:
    'classifyNestedCall requires a SQL query string',
});

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
const REDUCE_FIELD = Object.freeze({
  KEY: 'key',
  RECORDS: 'records',
  CONTINUATION: 'continuation',
});

/**
 * Error messages for reduceByKey execution.
 * @enum {string}
 */
const REDUCE_ERROR_MSG = Object.freeze({
  NO_EXCHANGE_MANAGER:
    'reduceByKey requires an exchange manager on the ' +
    'execution context',
  EMPTY_EXCHANGE:
    'reduceByKey received no records from exchange buffers',
});

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
const RETRY_SCOPE = Object.freeze({
  STAGE: 'stage',
  BATCH: 'batch',
});

/**
 * Field names for nested call classification diagnostic
 * entries.
 * @enum {string}
 */
const DIAGNOSTICS_FIELD = Object.freeze({
  QUERY: 'query',
  CLASSIFICATION: 'classification',
  REASON: 'reason',
  TIMESTAMP: 'timestamp',
});

export {
  SNAPSHOT_MODE,
  DEFAULT_SNAPSHOT_MODE,
  DEFAULT_RUNTIME_SESSION,
  CALL_MODE,
  RUNTIME_ERROR_MSG,
  RUNTIME_SUBSYSTEM,
  DEFAULT_BATCH_SIZE,
  STAGE_OPTION,
  EXCHANGE_MODE,
  DEFAULT_EXCHANGE_MODE,
  EXCHANGE_ERROR_MSG,
  EXCHANGE_NO_ORDERING_GUARANTEE,
  EXCHANGE_FIELD,
  DEFAULT_EXCHANGE_PARTITION_COUNT,
  VALID_EXCHANGE_MODES,
  EMIT_META_FIELD,
  EMIT_PRIMITIVE_TYPE,
  EMIT_DEFAULT_STAGE_ID,
  PLAN_KIND,
  SUPPORTED_PLAN_KINDS,
  PLAN_FIELD,
  PLAN_ERROR_MSG,
  OUT_ERROR_MSG,
  OUT_TELEMETRY_EVENT,
  OUT_TELEMETRY_FIELD,
  NESTED_CALL_CLASSIFICATION,
  NESTED_CALL_REASON,
  NESTED_CALL_ERROR_MSG,
  NESTED_CALL_MAX_IN_PARAMS,
  DIAGNOSTICS_FIELD,
  REDUCE_FIELD,
  REDUCE_ERROR_MSG,
  DEFAULT_MAX_GROUPS_PER_BATCH,
  DEFAULT_MAX_RECORDS_PER_GROUP,
  RETRY_SCOPE,
};
