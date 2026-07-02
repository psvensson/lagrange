/**
 * ExecutionContext — the distributed context object passed to
 * user functions inside `runtime.run`.
 *
 * Provides `call`, `emit`, `out`, `lookup`, `broadcast`, and
 * `useBroadcast` as the only approved distributed movement
 * capabilities.
 *
 * Requirements: 4.1, 4.2, 4.4, 4.5, 5.1
 * @module query/execution-context
 */

import {createCallIterator} from './call-iterator.js';
import {executeStage} from './call-stage.js';
import {executePlan} from './call-plan.js';
import {
  RUNTIME_ERROR_MSG as ERR,
  PLAN_FIELD,
  PLAN_ERROR_MSG,
  OUT_ERROR_MSG,
  OUT_TELEMETRY_FIELD,
  DEFAULT_EXCHANGE_MODE,
  EXCHANGE_ERROR_MSG,
  EMIT_META_FIELD,
  EMIT_PRIMITIVE_TYPE,
  EMIT_DEFAULT_STAGE_ID,
} from './runtime-constants.js';
import {DedupeRegistry} from './dedupe-registry.js';
import {
  ResultStream,
  STREAM_STATE,
  estimateRowBytes,
} from './result-stream.js';
import {BudgetLimitError} from './budget-limit-error.js';
import {ExchangeManager} from './distributed/exchange-manager.js';
import {executeLookup} from './lookup-primitive.js';
import {BroadcastStore} from './broadcast-primitive.js';
import {
  LOOKUP_ACCESS_PATH,
  LOOKUP_KEY_FIELD,
  PRIMITIVE_ERROR_MSG,
} from './distributed/distributed-context-constants.js';

const LOCAL_STR_RESULTSTREAM = 'resultStream';

const LOOKUP_PARTITION_SINGLE = 'single-partition';
const SAFE_SQL_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const SQL_SELECT_PREFIX = 'SELECT * FROM ';
const SQL_WHERE_PREFIX = ' WHERE ';
const SQL_IN_PREFIX = ' IN (';
const SQL_IN_SUFFIX = ')';
const SQL_PARAM_PLACEHOLDER = '?';
const SQL_PARAM_SEPARATOR = ', ';
const LOOKUP_STAGE_INDEX_DEFAULT = 0;

/**
 * Runtime execution context injected into user functions by
 * `runtime.run`. Carries session identity, snapshot config,
 * budget enforcer, cancellation token, and lineage tracker.
 *
 * Method stubs for `call`, `emit`, `out`, `lookup`,
 * `broadcast`, and `useBroadcast` are defined here and wired
 * to real implementations by later tasks.
 */
class ExecutionContext {
  /**
   * @param {Object} deps - Context dependencies.
   * @param {string} deps.session - Session identity string.
   * @param {Object} deps.snapshot - Snapshot configuration.
   * @param {string} deps.snapshot.mode - Snapshot mode.
   * @param {number} [deps.snapshot.ts] - Snapshot timestamp.
   * @param {import('./budget-enforcer.js').BudgetEnforcer} deps.budgetEnforcer
   *   Budget enforcer instance.
   * @param {import('./cancellation-token.js').CancellationToken} deps.cancellationToken
   *   Cancellation token for cooperative cancellation.
   * @param {import('./lineage-tracker.js').LineageTracker} deps.lineageTracker
   *   Lineage tracker for retry dedupe.
   * @param {Function} [deps.queryExecutor] - Async function
   *   accepting (query, params) and returning {rows: Array}.
   * @param {import('./result-stream.js').ResultStream}
   *   [deps.resultStream] - Output stream for ctx.out.
   * @param {import('./distributed/exchange-manager.js').ExchangeManager}
   *   [deps.exchangeManager] - Exchange manager for ctx.emit.
   * @param {import('./dedupe-registry.js').DedupeRegistry}
   *   [deps.dedupeRegistry] - Dedupe registry for emit
   *   idempotency.
   * @param {import('./plan-diagnostics.js').PlanDiagnostics}
   *   [deps.planDiagnostics] - Optional diagnostics collector
   *   for nested call classification decisions.
   */
  constructor(deps) {
    /** @type {string} */
    this.session = deps.session;

    /** @type {Readonly<Object>} */
    this.snapshot = Object.freeze({...deps.snapshot});

    /** @private */
    this._budgetEnforcer = deps.budgetEnforcer;

    /** @private */
    this._cancellationToken = deps.cancellationToken;

    /** @private */
    this._lineageTracker = deps.lineageTracker;

    /** @private */
    this._queryExecutor = deps.queryExecutor ?? null;

    /** @private */
    this._resultStream = deps.resultStream ??
      new ResultStream();

    /** @private */
    this._exchangeManager = deps.exchangeManager ??
      new ExchangeManager();

    /** @private */
    this._dedupeRegistry = deps.dedupeRegistry ??
      new DedupeRegistry();

    /** @private */
    this._planDiagnostics = deps.planDiagnostics ?? null;

    /** @private */
    this._emitSequence = 0;

    /** @private */
    this._outTelemetry = {
      totalRows: 0,
      totalBytes: 0,
      writeCount: 0,
      budgetExceededCount: 0,
    };

    /** @private */
    this._exchangeMode = DEFAULT_EXCHANGE_MODE;

    /** @private */
    this._lookupPartitionResolver = deps.lookupPartitionResolver ||
      ((_table, _key) => LOOKUP_PARTITION_SINGLE);

    /** @private */
    this._lookupFetch = deps.lookupFetch || null;

    /** @private */
    this._lookupSequence = 0;

    /** @private */
    this._broadcastStore = deps.broadcastStore ||
      new BroadcastStore({
        lineageTracker: this._lineageTracker,
        stageIndex: LOOKUP_STAGE_INDEX_DEFAULT,
      });
  }

  /**
   * Execute a SQL query or plan object.
   *
   * Mode detection:
   * - No handler (3rd arg not a function) → Iterator_Mode
   * - Handler provided → Stage_Mode (task 2.2)
   * - Query is plan object → Plan_Mode (task 2.3)
   *
   * Requirements: 5.1, 5.2, 5.3
   *
   * @param {string|Object} query - SQL string or plan object.
   * @param {unknown[]} [params] - Bind parameters.
   * @param {Function} [handler] - Stage handler function.
   * @param {Object} [opts] - Stage options.
   * @return {AsyncIterableIterator<*>|Promise<*>} Async
   *   iterator in Iterator_Mode.
   * @throws {Error} If query is missing or mode not wired.
   */
  call(query, params, handler, opts) {
    if (query === undefined || query === null) {
      throw new Error(ERR.CALL_QUERY_REQUIRED);
    }

    // Plan_Mode: query is a plan object (not a string)
    if (typeof query === 'object') {
      if (!query[PLAN_FIELD.KIND]) {
        throw new Error(PLAN_ERROR_MSG.PLAN_MISSING_KIND);
      }

      // Normalize params: if 2nd arg is a function, treat
      // it as handler with no params, and shift opts.
      let planParams = params;
      let planHandler = handler;
      let planOpts = opts;
      if (typeof params === 'function') {
        planHandler = params;
        planOpts = handler;
        planParams = [];
      }
      planParams = planParams ?? [];

      return executePlan({
        plan: query,
        params: planParams,
        handler: planHandler,
        opts: planOpts,
        queryExecutor: this._queryExecutor,
        cancellationToken: this._cancellationToken,
        executionContext: this,
      });
    }

    if (typeof query !== 'string') {
      throw new Error(ERR.CALL_QUERY_REQUIRED);
    }

    // Normalize params: if 2nd arg is a function, treat it
    // as handler with no params, and shift opts.
    let resolvedParams = params;
    let resolvedHandler = handler;
    let resolvedOpts = opts;
    if (typeof params === 'function') {
      resolvedHandler = params;
      resolvedOpts = handler;
      resolvedParams = [];
    }

    resolvedParams = resolvedParams ?? [];
    if (!Array.isArray(resolvedParams)) {
      throw new Error(ERR.CALL_PARAMS_MUST_BE_ARRAY);
    }

    // Stage_Mode: handler is a function
    if (typeof resolvedHandler === 'function') {
      return executeStage({
        query,
        params: resolvedParams,
        handler: resolvedHandler,
        opts: resolvedOpts,
        queryExecutor: this._queryExecutor,
        cancellationToken: this._cancellationToken,
        executionContext: this,
      });
    }

    // Iterator_Mode: no handler
    this._cancellationToken.throwIfCancelled();

    return createCallIterator(
      query,
      resolvedParams,
      this._queryExecutor,
      this._cancellationToken,
    );
  }

  /**
   * Emit a keyed intermediate value into an exchange stream.
   *
   * Checks cancellation, validates the key, resolves a dedupe
   * key (explicit from meta or auto-generated via lineage),
   * checks the dedupe registry for duplicates, records emit
   * bytes in the budget enforcer, routes through the exchange
   * manager, and registers the dedupe key after success.
   *
   * **No global ordering guarantee (Requirement 7.4):**
   * Records emitted to different destination partitions may
   * be consumed in any order. Only records routed to the
   * same partition (by key hash) preserve insertion order.
   * Consumers must not rely on cross-partition ordering.
   *
   * At-least-once: duplicate emits with the same dedupe key
   * are silently skipped for idempotency.
   *
   * **Backpressure policy (v0):** The v0 runtime uses
   * fail-on-exceed as the emit backpressure strategy.
   * When `recordEmitBytes` detects the emit byte budget is
   * exceeded, it throws a `BudgetLimitError`, terminating
   * the operation. Future versions may support await/block
   * or spill-to-disk policies.
   *
   * Requirements: 4.4, 7.2, 7.3, 7.4, 7.5, 9.3, 9.4, 10.3
   *
   * @param {string} key - Partition key (must be a string).
   * @param {*} value - Value to emit.
   * @param {Object} [meta] - Emit metadata. May include
   *   `dedupeKey` for explicit idempotency control.
   * @return {Promise<void>}
   * @throws {Error} If key is invalid, exchange is closed,
   *   budget is exceeded, or execution is cancelled.
   */
  async emit(key, value, meta) {
    this._cancellationToken.throwIfCancelled();

    if (typeof key !== 'string') {
      throw new Error(
        EXCHANGE_ERROR_MSG.EMIT_KEY_REQUIRED,
      );
    }

    // Resolve dedupe key: explicit from meta or
    // auto-generated via lineage tracker.
    const explicitDedupeKey = meta !== undefined ?
      meta[EMIT_META_FIELD.DEDUPE_KEY] :
      undefined;

    const seq = this._emitSequence++;
    const lineageId = this._lineageTracker.generateLineageId(
      0, EMIT_PRIMITIVE_TYPE, seq,
    );

    const dedupeKey = explicitDedupeKey !== undefined ?
      String(explicitDedupeKey) :
      lineageId;

    // Check dedupe registry: skip if already seen.
    if (this._dedupeRegistry.isDuplicate(
      dedupeKey, EMIT_DEFAULT_STAGE_ID,
    )) {
      return;
    }

    // Build enriched meta with lineageId and dedupeKey.
    const enrichedMeta = {
      ...(meta ?? {}),
      [EMIT_META_FIELD.DEDUPE_KEY]: dedupeKey,
      [EMIT_META_FIELD.LINEAGE_ID]: lineageId,
    };

    const row = {key, value, meta: enrichedMeta};
    const byteCount = estimateRowBytes(row);
    this._budgetEnforcer.recordEmitBytes(byteCount);

    this._exchangeManager.route(key, value, enrichedMeta);

    // Register dedupe key after successful routing.
    this._dedupeRegistry.register(
      dedupeKey, EMIT_DEFAULT_STAGE_ID, null,
    );
  }

  /**
   * Write a final output value to the result stream.
   *
   * Checks cancellation, validates the value, and writes
   * to the underlying ResultStream. Calls the budget
   * enforcer if available (full budget wiring is task 4.2).
   *
   * **No lineage/dedupe (by design):** Unlike `ctx.emit`,
   * `ctx.out` does not generate lineage IDs or check the
   * dedupe registry. Output values are terminal — they flow
   * into the result stream and are not retried or routed
   * cross-partition. Deduplication is unnecessary because
   * the result stream is append-only within a single
   * execution and is not subject to at-least-once delivery.
   *
   * Requirements: 4.4, 10.2
   *
   * @param {*} value - Output value.
   * @param {Object} [meta] - Output metadata.
   * @return {Promise<void>}
   * @throws {Error} If value is undefined, stream is closed,
   *   or execution is cancelled.
   */
  async out(value, meta) {
    this._cancellationToken.throwIfCancelled();

    if (value === undefined) {
      throw new Error(OUT_ERROR_MSG.VALUE_REQUIRED);
    }

    if (this._resultStream.state !== STREAM_STATE.OPEN) {
      throw new Error(OUT_ERROR_MSG.STREAM_CLOSED);
    }

    const row = meta !== undefined ? {value, meta} : value;
    const byteCount = estimateRowBytes(row);

    try {
      this._budgetEnforcer.recordOutBytes(byteCount);
    } catch (err) {
      this._outTelemetry.budgetExceededCount += 1;
      throw err;
    }

    const result = this._resultStream.push([row]);
    if (result.exceeded) {
      this._outTelemetry.budgetExceededCount += 1;
      throw new BudgetLimitError(
        this._resultStream.budgetError,
        {
          category: LOCAL_STR_RESULTSTREAM,
          limit: this._resultStream.maxBytes,
          usage: this._resultStream.totalBytes,
        },
      );
    }

    this._outTelemetry.writeCount += 1;
    this._outTelemetry.totalRows += 1;
    this._outTelemetry.totalBytes += byteCount;
  }

  /**
   * Retrieve collected output from the result stream.
   * @return {Array<*>} Collected output rows.
   */
  getResults() {
    return this._resultStream.getRows();
  }

  /**
   * Close the output stream. No further ctx.out calls
   * will be accepted after this.
   * @return {{totalRows: number, totalBytes: number,
   *   state: string}} Final stream summary.
   */
  closeOutputStream() {
    return this._resultStream.close();
  }

  /**
   * Return a frozen snapshot of output telemetry counters.
   *
   * Requirements: 13.3
   *
   * @return {Readonly<Object>} Telemetry snapshot with
   *   rowCount, byteCount, writeCount, budgetExceededCount.
   */
  getOutTelemetry() {
    return Object.freeze({
      [OUT_TELEMETRY_FIELD.ROW_COUNT]:
        this._outTelemetry.totalRows,
      [OUT_TELEMETRY_FIELD.BYTE_COUNT]:
        this._outTelemetry.totalBytes,
      [OUT_TELEMETRY_FIELD.WRITE_COUNT]:
        this._outTelemetry.writeCount,
      [OUT_TELEMETRY_FIELD.BUDGET_EXCEEDED_COUNT]:
        this._outTelemetry.budgetExceededCount,
    });
  }

  /**
   * Batched key lookup restricted to pk/unique/bounded index.
   * Routes through the lookup primitive with partition grouping,
   * dedupe, and budget-aware fetch semantics.
   *
   * @param {string} _table - Table name.
   * @param {Object[]} _keys - Lookup keys.
   */
  async lookup(_table, _keys) {
    this._cancellationToken.throwIfCancelled();
    const sequenceNum = this._lookupSequence;
    this._lookupSequence += 1;
    return executeLookup({
      table: _table,
      keys: _keys,
      accessPath: LOOKUP_ACCESS_PATH.PRIMARY_KEY,
      partitionResolver: (key) =>
        this._lookupPartitionResolver(_table, key),
      fetchFn: (partitionId, table, keys) =>
        this._fetchLookupRows(partitionId, table, keys),
      lineageTracker: this._lineageTracker,
      stageIndex: LOOKUP_STAGE_INDEX_DEFAULT,
      sequenceNum,
    });
  }

  /**
   * Publish a versioned broadcast dataset.
   * Stores a validated dataset in the broadcast store.
   *
   * @param {string} _ref - Broadcast reference.
   * @param {Object} _dataset - Dataset to broadcast.
   */
  async broadcast(_ref, _dataset) {
    this._cancellationToken.throwIfCancelled();
    return this._broadcastStore.broadcast(_ref, _dataset);
  }

  /**
   * Retrieve a previously broadcast dataset by reference.
   * Resolves a validated broadcast payload from local store.
   *
   * @param {string} _ref - Broadcast reference.
   * @return {Promise<Object>} The broadcast dataset.
   */
  async useBroadcast(_ref) {
    this._cancellationToken.throwIfCancelled();
    return this._broadcastStore.useBroadcast(_ref);
  }

  /**
   * Fetch lookup rows for one partition group.
   * @param {string} partitionId
   * @param {string} table
   * @param {Array<Object>} keys
   * @returns {Promise<Array<Object>>}
   * @private
   */
  async _fetchLookupRows(partitionId, table, keys) {
    if (this._lookupFetch) {
      return this._lookupFetch(partitionId, table, keys);
    }
    return this._defaultLookupFetch(table, keys);
  }

  /**
   * Default lookup fetch implementation routed through queryExecutor.
   * @param {string} table
   * @param {Array<Object>} keys
   * @returns {Promise<Array<Object>>}
   * @private
   */
  async _defaultLookupFetch(table, keys) {
    if (!this._queryExecutor || typeof this._queryExecutor !== 'function') {
      return [];
    }
    if (!SAFE_SQL_IDENTIFIER.test(table)) {
      throw new Error(PRIMITIVE_ERROR_MSG.LOOKUP_ACCESS_PATH_DENIED);
    }

    const groupedByColumn = new Map();
    for (const key of keys) {
      const column = key[LOOKUP_KEY_FIELD.COLUMN];
      if (!SAFE_SQL_IDENTIFIER.test(column)) {
        throw new Error(PRIMITIVE_ERROR_MSG.LOOKUP_ACCESS_PATH_DENIED);
      }
      if (!groupedByColumn.has(column)) {
        groupedByColumn.set(column, []);
      }
      groupedByColumn.get(column).push(key[LOOKUP_KEY_FIELD.VALUE]);
    }

    const rows = [];
    for (const [column, values] of groupedByColumn) {
      const placeholders = values
        .map(() => SQL_PARAM_PLACEHOLDER)
        .join(SQL_PARAM_SEPARATOR);
      const query = SQL_SELECT_PREFIX + table +
        SQL_WHERE_PREFIX + column +
        SQL_IN_PREFIX + placeholders + SQL_IN_SUFFIX;
      const result = await this._queryExecutor(query, values);
      if (result && Array.isArray(result.rows)) {
        rows.push(...result.rows);
      }
    }
    return rows;
  }

  /**
   * Check whether execution has been cancelled.
   * @return {boolean} True if cancelled.
   */
  isCancelled() {
    return this._cancellationToken.isCancelled();
  }

  /**
   * Throw if execution has been cancelled.
   * @throws {Error} If cancelled.
   */
  throwIfCancelled() {
    this._cancellationToken.throwIfCancelled();
  }

  /**
   * Get the budget enforcer for this execution.
   * @return {import('./budget-enforcer.js').BudgetEnforcer}
   */
  getBudgetEnforcer() {
    return this._budgetEnforcer;
  }

  /**
   * Get the cancellation token for this execution.
   * @return {import('./cancellation-token.js').CancellationToken}
   */
  getCancellationToken() {
    return this._cancellationToken;
  }

  /**
   * Get the lineage tracker for this execution.
   * @return {import('./lineage-tracker.js').LineageTracker}
   */
  getLineageTracker() {
    return this._lineageTracker;
  }

  /**
   * Get the current exchange mode for stage execution.
   * @return {string} Exchange mode ('local' or 'key').
   */
  getExchangeMode() {
    return this._exchangeMode;
  }

  /**
   * Set the exchange mode for stage execution.
   * Called by executeStage after validation.
   *
   * @param {string} mode - Validated exchange mode.
   */
  setExchangeMode(mode) {
    this._exchangeMode = mode;
  }

  /**
   * Get the exchange manager for this execution.
   * @return {import('./distributed/exchange-manager.js').ExchangeManager}
   */
  getExchangeManager() {
    return this._exchangeManager;
  }

  /**
   * Get the dedupe registry for this execution.
   * @return {import('./dedupe-registry.js').DedupeRegistry}
   */
  getDedupeRegistry() {
    return this._dedupeRegistry;
  }

  /**
   * Get the plan diagnostics collector, if any.
   * @return {import('./plan-diagnostics.js').PlanDiagnostics|null}
   */
  getPlanDiagnostics() {
    return this._planDiagnostics;
  }
}

export {ExecutionContext};
