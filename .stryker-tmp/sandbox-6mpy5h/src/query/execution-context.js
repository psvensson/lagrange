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
import { TYPEOF, NUM } from '../constants/index.js';
import { createCallIterator } from './call-iterator.js';
import { executeStage } from './call-stage.js';
import { executePlan } from './call-plan.js';
import { RUNTIME_ERROR_MSG as ERR, PLAN_FIELD, PLAN_ERROR_MSG, OUT_ERROR_MSG, OUT_TELEMETRY_EVENT, OUT_TELEMETRY_FIELD, DEFAULT_EXCHANGE_MODE, EXCHANGE_ERROR_MSG, EMIT_META_FIELD, EMIT_PRIMITIVE_TYPE, EMIT_DEFAULT_STAGE_ID } from './runtime-constants.js';
import { DedupeRegistry } from './dedupe-registry.js';
import { ResultStream, STREAM_STATE, estimateRowBytes } from './result-stream.js';
import { BudgetLimitError } from './budget-limit-error.js';
import { ExchangeManager } from './distributed/exchange-manager.js';
import { executeLookup } from './lookup-primitive.js';
import { BroadcastStore } from './broadcast-primitive.js';
import { LOOKUP_ACCESS_PATH, LOOKUP_KEY_FIELD, PRIMITIVE_ERROR_MSG } from './distributed/distributed-context-constants.js';
const LOOKUP_PARTITION_SINGLE = stryMutAct_9fa48("112957") ? "" : (stryCov_9fa48("112957"), 'single-partition');
const SAFE_SQL_IDENTIFIER = stryMutAct_9fa48("112962") ? /^[a-zA-Z_][^a-zA-Z0-9_]*$/ : stryMutAct_9fa48("112961") ? /^[a-zA-Z_][a-zA-Z0-9_]$/ : stryMutAct_9fa48("112960") ? /^[^a-zA-Z_][a-zA-Z0-9_]*$/ : stryMutAct_9fa48("112959") ? /^[a-zA-Z_][a-zA-Z0-9_]*/ : stryMutAct_9fa48("112958") ? /[a-zA-Z_][a-zA-Z0-9_]*$/ : (stryCov_9fa48("112958", "112959", "112960", "112961", "112962"), /^[a-zA-Z_][a-zA-Z0-9_]*$/);
const SQL_SELECT_PREFIX = stryMutAct_9fa48("112963") ? "" : (stryCov_9fa48("112963"), 'SELECT * FROM ');
const SQL_WHERE_PREFIX = stryMutAct_9fa48("112964") ? "" : (stryCov_9fa48("112964"), ' WHERE ');
const SQL_IN_PREFIX = stryMutAct_9fa48("112965") ? "" : (stryCov_9fa48("112965"), ' IN (');
const SQL_IN_SUFFIX = stryMutAct_9fa48("112966") ? "" : (stryCov_9fa48("112966"), ')');
const SQL_PARAM_PLACEHOLDER = stryMutAct_9fa48("112967") ? "" : (stryCov_9fa48("112967"), '?');
const SQL_PARAM_SEPARATOR = stryMutAct_9fa48("112968") ? "" : (stryCov_9fa48("112968"), ', ');
const LOOKUP_STAGE_INDEX_DEFAULT = NUM.ZERO;

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
   * @param {import('./exchange-manager.js').ExchangeManager}
   *   [deps.exchangeManager] - Exchange manager for ctx.emit.
   * @param {import('./dedupe-registry.js').DedupeRegistry}
   *   [deps.dedupeRegistry] - Dedupe registry for emit
   *   idempotency.
   * @param {import('./plan-diagnostics.js').PlanDiagnostics}
   *   [deps.planDiagnostics] - Optional diagnostics collector
   *   for nested call classification decisions.
   */
  constructor(deps) {
    if (stryMutAct_9fa48("112969")) {
      {}
    } else {
      stryCov_9fa48("112969");
      /** @type {string} */
      this.session = deps.session;

      /** @type {Readonly<Object>} */
      this.snapshot = Object.freeze(stryMutAct_9fa48("112970") ? {} : (stryCov_9fa48("112970"), {
        ...deps.snapshot
      }));

      /** @private */
      this._budgetEnforcer = deps.budgetEnforcer;

      /** @private */
      this._cancellationToken = deps.cancellationToken;

      /** @private */
      this._lineageTracker = deps.lineageTracker;

      /** @private */
      this._queryExecutor = stryMutAct_9fa48("112971") ? deps.queryExecutor && null : (stryCov_9fa48("112971"), deps.queryExecutor ?? null);

      /** @private */
      this._resultStream = stryMutAct_9fa48("112972") ? deps.resultStream && new ResultStream() : (stryCov_9fa48("112972"), deps.resultStream ?? new ResultStream());

      /** @private */
      this._exchangeManager = stryMutAct_9fa48("112973") ? deps.exchangeManager && new ExchangeManager() : (stryCov_9fa48("112973"), deps.exchangeManager ?? new ExchangeManager());

      /** @private */
      this._dedupeRegistry = stryMutAct_9fa48("112974") ? deps.dedupeRegistry && new DedupeRegistry() : (stryCov_9fa48("112974"), deps.dedupeRegistry ?? new DedupeRegistry());

      /** @private */
      this._planDiagnostics = stryMutAct_9fa48("112975") ? deps.planDiagnostics && null : (stryCov_9fa48("112975"), deps.planDiagnostics ?? null);

      /** @private */
      this._emitSequence = NUM.ZERO;

      /** @private */
      this._outTelemetry = stryMutAct_9fa48("112976") ? {} : (stryCov_9fa48("112976"), {
        totalRows: NUM.ZERO,
        totalBytes: NUM.ZERO,
        writeCount: NUM.ZERO,
        budgetExceededCount: NUM.ZERO
      });

      /** @private */
      this._exchangeMode = DEFAULT_EXCHANGE_MODE;

      /** @private */
      this._lookupPartitionResolver = stryMutAct_9fa48("112979") ? deps.lookupPartitionResolver && ((_table, _key) => LOOKUP_PARTITION_SINGLE) : stryMutAct_9fa48("112978") ? false : stryMutAct_9fa48("112977") ? true : (stryCov_9fa48("112977", "112978", "112979"), deps.lookupPartitionResolver || (stryMutAct_9fa48("112980") ? () => undefined : (stryCov_9fa48("112980"), (_table, _key) => LOOKUP_PARTITION_SINGLE)));

      /** @private */
      this._lookupFetch = stryMutAct_9fa48("112983") ? deps.lookupFetch && null : stryMutAct_9fa48("112982") ? false : stryMutAct_9fa48("112981") ? true : (stryCov_9fa48("112981", "112982", "112983"), deps.lookupFetch || null);

      /** @private */
      this._lookupSequence = NUM.ZERO;

      /** @private */
      this._broadcastStore = stryMutAct_9fa48("112986") ? deps.broadcastStore && new BroadcastStore({
        lineageTracker: this._lineageTracker,
        stageIndex: LOOKUP_STAGE_INDEX_DEFAULT
      }) : stryMutAct_9fa48("112985") ? false : stryMutAct_9fa48("112984") ? true : (stryCov_9fa48("112984", "112985", "112986"), deps.broadcastStore || new BroadcastStore(stryMutAct_9fa48("112987") ? {} : (stryCov_9fa48("112987"), {
        lineageTracker: this._lineageTracker,
        stageIndex: LOOKUP_STAGE_INDEX_DEFAULT
      })));
    }
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
    if (stryMutAct_9fa48("112988")) {
      {}
    } else {
      stryCov_9fa48("112988");
      if (stryMutAct_9fa48("112991") ? query === undefined && query === null : stryMutAct_9fa48("112990") ? false : stryMutAct_9fa48("112989") ? true : (stryCov_9fa48("112989", "112990", "112991"), (stryMutAct_9fa48("112993") ? query !== undefined : stryMutAct_9fa48("112992") ? false : (stryCov_9fa48("112992", "112993"), query === undefined)) || (stryMutAct_9fa48("112995") ? query !== null : stryMutAct_9fa48("112994") ? false : (stryCov_9fa48("112994", "112995"), query === null)))) {
        if (stryMutAct_9fa48("112996")) {
          {}
        } else {
          stryCov_9fa48("112996");
          throw new Error(ERR.CALL_QUERY_REQUIRED);
        }
      }

      // Plan_Mode: query is a plan object (not a string)
      if (stryMutAct_9fa48("112999") ? typeof query !== TYPEOF.OBJECT : stryMutAct_9fa48("112998") ? false : stryMutAct_9fa48("112997") ? true : (stryCov_9fa48("112997", "112998", "112999"), typeof query === TYPEOF.OBJECT)) {
        if (stryMutAct_9fa48("113000")) {
          {}
        } else {
          stryCov_9fa48("113000");
          if (stryMutAct_9fa48("113003") ? false : stryMutAct_9fa48("113002") ? true : stryMutAct_9fa48("113001") ? query[PLAN_FIELD.KIND] : (stryCov_9fa48("113001", "113002", "113003"), !query[PLAN_FIELD.KIND])) {
            if (stryMutAct_9fa48("113004")) {
              {}
            } else {
              stryCov_9fa48("113004");
              throw new Error(PLAN_ERROR_MSG.PLAN_MISSING_KIND);
            }
          }

          // Normalize params: if 2nd arg is a function, treat
          // it as handler with no params, and shift opts.
          let planParams = params;
          let planHandler = handler;
          let planOpts = opts;
          if (stryMutAct_9fa48("113007") ? typeof params !== TYPEOF.FUNCTION : stryMutAct_9fa48("113006") ? false : stryMutAct_9fa48("113005") ? true : (stryCov_9fa48("113005", "113006", "113007"), typeof params === TYPEOF.FUNCTION)) {
            if (stryMutAct_9fa48("113008")) {
              {}
            } else {
              stryCov_9fa48("113008");
              planHandler = params;
              planOpts = handler;
              planParams = stryMutAct_9fa48("113009") ? ["Stryker was here"] : (stryCov_9fa48("113009"), []);
            }
          }
          planParams = stryMutAct_9fa48("113010") ? planParams && [] : (stryCov_9fa48("113010"), planParams ?? (stryMutAct_9fa48("113011") ? ["Stryker was here"] : (stryCov_9fa48("113011"), [])));
          return executePlan(stryMutAct_9fa48("113012") ? {} : (stryCov_9fa48("113012"), {
            plan: query,
            params: planParams,
            handler: planHandler,
            opts: planOpts,
            queryExecutor: this._queryExecutor,
            cancellationToken: this._cancellationToken,
            executionContext: this
          }));
        }
      }
      if (stryMutAct_9fa48("113015") ? typeof query === TYPEOF.STRING : stryMutAct_9fa48("113014") ? false : stryMutAct_9fa48("113013") ? true : (stryCov_9fa48("113013", "113014", "113015"), typeof query !== TYPEOF.STRING)) {
        if (stryMutAct_9fa48("113016")) {
          {}
        } else {
          stryCov_9fa48("113016");
          throw new Error(ERR.CALL_QUERY_REQUIRED);
        }
      }

      // Normalize params: if 2nd arg is a function, treat it
      // as handler with no params, and shift opts.
      let resolvedParams = params;
      let resolvedHandler = handler;
      let resolvedOpts = opts;
      if (stryMutAct_9fa48("113019") ? typeof params !== TYPEOF.FUNCTION : stryMutAct_9fa48("113018") ? false : stryMutAct_9fa48("113017") ? true : (stryCov_9fa48("113017", "113018", "113019"), typeof params === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("113020")) {
          {}
        } else {
          stryCov_9fa48("113020");
          resolvedHandler = params;
          resolvedOpts = handler;
          resolvedParams = stryMutAct_9fa48("113021") ? ["Stryker was here"] : (stryCov_9fa48("113021"), []);
        }
      }
      resolvedParams = stryMutAct_9fa48("113022") ? resolvedParams && [] : (stryCov_9fa48("113022"), resolvedParams ?? (stryMutAct_9fa48("113023") ? ["Stryker was here"] : (stryCov_9fa48("113023"), [])));
      if (stryMutAct_9fa48("113026") ? false : stryMutAct_9fa48("113025") ? true : stryMutAct_9fa48("113024") ? Array.isArray(resolvedParams) : (stryCov_9fa48("113024", "113025", "113026"), !Array.isArray(resolvedParams))) {
        if (stryMutAct_9fa48("113027")) {
          {}
        } else {
          stryCov_9fa48("113027");
          throw new Error(ERR.CALL_PARAMS_MUST_BE_ARRAY);
        }
      }

      // Stage_Mode: handler is a function
      if (stryMutAct_9fa48("113030") ? typeof resolvedHandler !== TYPEOF.FUNCTION : stryMutAct_9fa48("113029") ? false : stryMutAct_9fa48("113028") ? true : (stryCov_9fa48("113028", "113029", "113030"), typeof resolvedHandler === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("113031")) {
          {}
        } else {
          stryCov_9fa48("113031");
          return executeStage(stryMutAct_9fa48("113032") ? {} : (stryCov_9fa48("113032"), {
            query,
            params: resolvedParams,
            handler: resolvedHandler,
            opts: resolvedOpts,
            queryExecutor: this._queryExecutor,
            cancellationToken: this._cancellationToken,
            executionContext: this
          }));
        }
      }

      // Iterator_Mode: no handler
      this._cancellationToken.throwIfCancelled();
      return createCallIterator(query, resolvedParams, this._queryExecutor, this._cancellationToken);
    }
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
    if (stryMutAct_9fa48("113033")) {
      {}
    } else {
      stryCov_9fa48("113033");
      this._cancellationToken.throwIfCancelled();
      if (stryMutAct_9fa48("113036") ? typeof key === TYPEOF.STRING : stryMutAct_9fa48("113035") ? false : stryMutAct_9fa48("113034") ? true : (stryCov_9fa48("113034", "113035", "113036"), typeof key !== TYPEOF.STRING)) {
        if (stryMutAct_9fa48("113037")) {
          {}
        } else {
          stryCov_9fa48("113037");
          throw new Error(EXCHANGE_ERROR_MSG.EMIT_KEY_REQUIRED);
        }
      }

      // Resolve dedupe key: explicit from meta or
      // auto-generated via lineage tracker.
      const explicitDedupeKey = (stryMutAct_9fa48("113040") ? meta === undefined : stryMutAct_9fa48("113039") ? false : stryMutAct_9fa48("113038") ? true : (stryCov_9fa48("113038", "113039", "113040"), meta !== undefined)) ? meta[EMIT_META_FIELD.DEDUPE_KEY] : undefined;
      const seq = stryMutAct_9fa48("113041") ? this._emitSequence-- : (stryCov_9fa48("113041"), this._emitSequence++);
      const lineageId = this._lineageTracker.generateLineageId(NUM.ZERO, EMIT_PRIMITIVE_TYPE, seq);
      const dedupeKey = (stryMutAct_9fa48("113044") ? explicitDedupeKey === undefined : stryMutAct_9fa48("113043") ? false : stryMutAct_9fa48("113042") ? true : (stryCov_9fa48("113042", "113043", "113044"), explicitDedupeKey !== undefined)) ? String(explicitDedupeKey) : lineageId;

      // Check dedupe registry: skip if already seen.
      if (stryMutAct_9fa48("113046") ? false : stryMutAct_9fa48("113045") ? true : (stryCov_9fa48("113045", "113046"), this._dedupeRegistry.isDuplicate(dedupeKey, EMIT_DEFAULT_STAGE_ID))) {
        if (stryMutAct_9fa48("113047")) {
          {}
        } else {
          stryCov_9fa48("113047");
          return;
        }
      }

      // Build enriched meta with lineageId and dedupeKey.
      const enrichedMeta = stryMutAct_9fa48("113048") ? {} : (stryCov_9fa48("113048"), {
        ...(stryMutAct_9fa48("113049") ? meta && {} : (stryCov_9fa48("113049"), meta ?? {})),
        [EMIT_META_FIELD.DEDUPE_KEY]: dedupeKey,
        [EMIT_META_FIELD.LINEAGE_ID]: lineageId
      });
      const row = stryMutAct_9fa48("113050") ? {} : (stryCov_9fa48("113050"), {
        key,
        value,
        meta: enrichedMeta
      });
      const byteCount = estimateRowBytes(row);
      this._budgetEnforcer.recordEmitBytes(byteCount);
      this._exchangeManager.route(key, value, enrichedMeta);

      // Register dedupe key after successful routing.
      this._dedupeRegistry.register(dedupeKey, EMIT_DEFAULT_STAGE_ID, null);
    }
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
    if (stryMutAct_9fa48("113051")) {
      {}
    } else {
      stryCov_9fa48("113051");
      this._cancellationToken.throwIfCancelled();
      if (stryMutAct_9fa48("113054") ? value !== undefined : stryMutAct_9fa48("113053") ? false : stryMutAct_9fa48("113052") ? true : (stryCov_9fa48("113052", "113053", "113054"), value === undefined)) {
        if (stryMutAct_9fa48("113055")) {
          {}
        } else {
          stryCov_9fa48("113055");
          throw new Error(OUT_ERROR_MSG.VALUE_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("113058") ? this._resultStream.state === STREAM_STATE.OPEN : stryMutAct_9fa48("113057") ? false : stryMutAct_9fa48("113056") ? true : (stryCov_9fa48("113056", "113057", "113058"), this._resultStream.state !== STREAM_STATE.OPEN)) {
        if (stryMutAct_9fa48("113059")) {
          {}
        } else {
          stryCov_9fa48("113059");
          throw new Error(OUT_ERROR_MSG.STREAM_CLOSED);
        }
      }
      const row = (stryMutAct_9fa48("113062") ? meta === undefined : stryMutAct_9fa48("113061") ? false : stryMutAct_9fa48("113060") ? true : (stryCov_9fa48("113060", "113061", "113062"), meta !== undefined)) ? stryMutAct_9fa48("113063") ? {} : (stryCov_9fa48("113063"), {
        value,
        meta
      }) : value;
      const byteCount = estimateRowBytes(row);
      try {
        if (stryMutAct_9fa48("113064")) {
          {}
        } else {
          stryCov_9fa48("113064");
          this._budgetEnforcer.recordOutBytes(byteCount);
        }
      } catch (err) {
        if (stryMutAct_9fa48("113065")) {
          {}
        } else {
          stryCov_9fa48("113065");
          stryMutAct_9fa48("113066") ? this._outTelemetry.budgetExceededCount -= NUM.ONE : (stryCov_9fa48("113066"), this._outTelemetry.budgetExceededCount += NUM.ONE);
          throw err;
        }
      }
      const result = this._resultStream.push(stryMutAct_9fa48("113067") ? [] : (stryCov_9fa48("113067"), [row]));
      if (stryMutAct_9fa48("113069") ? false : stryMutAct_9fa48("113068") ? true : (stryCov_9fa48("113068", "113069"), result.exceeded)) {
        if (stryMutAct_9fa48("113070")) {
          {}
        } else {
          stryCov_9fa48("113070");
          stryMutAct_9fa48("113071") ? this._outTelemetry.budgetExceededCount -= NUM.ONE : (stryCov_9fa48("113071"), this._outTelemetry.budgetExceededCount += NUM.ONE);
          throw new BudgetLimitError(this._resultStream.budgetError, stryMutAct_9fa48("113072") ? {} : (stryCov_9fa48("113072"), {
            category: stryMutAct_9fa48("113073") ? "" : (stryCov_9fa48("113073"), 'resultStream'),
            limit: this._resultStream.maxBytes,
            usage: this._resultStream.totalBytes
          }));
        }
      }
      stryMutAct_9fa48("113074") ? this._outTelemetry.writeCount -= NUM.ONE : (stryCov_9fa48("113074"), this._outTelemetry.writeCount += NUM.ONE);
      stryMutAct_9fa48("113075") ? this._outTelemetry.totalRows -= NUM.ONE : (stryCov_9fa48("113075"), this._outTelemetry.totalRows += NUM.ONE);
      stryMutAct_9fa48("113076") ? this._outTelemetry.totalBytes -= byteCount : (stryCov_9fa48("113076"), this._outTelemetry.totalBytes += byteCount);
    }
  }

  /**
   * Retrieve collected output from the result stream.
   * @return {Array<*>} Collected output rows.
   */
  getResults() {
    if (stryMutAct_9fa48("113077")) {
      {}
    } else {
      stryCov_9fa48("113077");
      return this._resultStream.getRows();
    }
  }

  /**
   * Close the output stream. No further ctx.out calls
   * will be accepted after this.
   * @return {{totalRows: number, totalBytes: number,
   *   state: string}} Final stream summary.
   */
  closeOutputStream() {
    if (stryMutAct_9fa48("113078")) {
      {}
    } else {
      stryCov_9fa48("113078");
      return this._resultStream.close();
    }
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
    if (stryMutAct_9fa48("113079")) {
      {}
    } else {
      stryCov_9fa48("113079");
      return Object.freeze(stryMutAct_9fa48("113080") ? {} : (stryCov_9fa48("113080"), {
        [OUT_TELEMETRY_FIELD.ROW_COUNT]: this._outTelemetry.totalRows,
        [OUT_TELEMETRY_FIELD.BYTE_COUNT]: this._outTelemetry.totalBytes,
        [OUT_TELEMETRY_FIELD.WRITE_COUNT]: this._outTelemetry.writeCount,
        [OUT_TELEMETRY_FIELD.BUDGET_EXCEEDED_COUNT]: this._outTelemetry.budgetExceededCount
      }));
    }
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
    if (stryMutAct_9fa48("113081")) {
      {}
    } else {
      stryCov_9fa48("113081");
      this._cancellationToken.throwIfCancelled();
      const sequenceNum = this._lookupSequence;
      stryMutAct_9fa48("113082") ? this._lookupSequence -= NUM.ONE : (stryCov_9fa48("113082"), this._lookupSequence += NUM.ONE);
      return executeLookup(stryMutAct_9fa48("113083") ? {} : (stryCov_9fa48("113083"), {
        table: _table,
        keys: _keys,
        accessPath: LOOKUP_ACCESS_PATH.PRIMARY_KEY,
        partitionResolver: stryMutAct_9fa48("113084") ? () => undefined : (stryCov_9fa48("113084"), key => this._lookupPartitionResolver(_table, key)),
        fetchFn: stryMutAct_9fa48("113085") ? () => undefined : (stryCov_9fa48("113085"), (partitionId, table, keys) => this._fetchLookupRows(partitionId, table, keys)),
        lineageTracker: this._lineageTracker,
        stageIndex: LOOKUP_STAGE_INDEX_DEFAULT,
        sequenceNum
      }));
    }
  }

  /**
   * Publish a versioned broadcast dataset.
   * Stores a validated dataset in the broadcast store.
   *
   * @param {string} _ref - Broadcast reference.
   * @param {Object} _dataset - Dataset to broadcast.
   */
  async broadcast(_ref, _dataset) {
    if (stryMutAct_9fa48("113086")) {
      {}
    } else {
      stryCov_9fa48("113086");
      this._cancellationToken.throwIfCancelled();
      return this._broadcastStore.broadcast(_ref, _dataset);
    }
  }

  /**
   * Retrieve a previously broadcast dataset by reference.
   * Resolves a validated broadcast payload from local store.
   *
   * @param {string} _ref - Broadcast reference.
   * @return {Promise<Object>} The broadcast dataset.
   */
  async useBroadcast(_ref) {
    if (stryMutAct_9fa48("113087")) {
      {}
    } else {
      stryCov_9fa48("113087");
      this._cancellationToken.throwIfCancelled();
      return this._broadcastStore.useBroadcast(_ref);
    }
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
    if (stryMutAct_9fa48("113088")) {
      {}
    } else {
      stryCov_9fa48("113088");
      if (stryMutAct_9fa48("113090") ? false : stryMutAct_9fa48("113089") ? true : (stryCov_9fa48("113089", "113090"), this._lookupFetch)) {
        if (stryMutAct_9fa48("113091")) {
          {}
        } else {
          stryCov_9fa48("113091");
          return this._lookupFetch(partitionId, table, keys);
        }
      }
      return this._defaultLookupFetch(table, keys);
    }
  }

  /**
   * Default lookup fetch implementation routed through queryExecutor.
   * @param {string} table
   * @param {Array<Object>} keys
   * @returns {Promise<Array<Object>>}
   * @private
   */
  async _defaultLookupFetch(table, keys) {
    if (stryMutAct_9fa48("113092")) {
      {}
    } else {
      stryCov_9fa48("113092");
      if (stryMutAct_9fa48("113095") ? !this._queryExecutor && typeof this._queryExecutor !== TYPEOF.FUNCTION : stryMutAct_9fa48("113094") ? false : stryMutAct_9fa48("113093") ? true : (stryCov_9fa48("113093", "113094", "113095"), (stryMutAct_9fa48("113096") ? this._queryExecutor : (stryCov_9fa48("113096"), !this._queryExecutor)) || (stryMutAct_9fa48("113098") ? typeof this._queryExecutor === TYPEOF.FUNCTION : stryMutAct_9fa48("113097") ? false : (stryCov_9fa48("113097", "113098"), typeof this._queryExecutor !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("113099")) {
          {}
        } else {
          stryCov_9fa48("113099");
          return stryMutAct_9fa48("113100") ? ["Stryker was here"] : (stryCov_9fa48("113100"), []);
        }
      }
      if (stryMutAct_9fa48("113103") ? false : stryMutAct_9fa48("113102") ? true : stryMutAct_9fa48("113101") ? SAFE_SQL_IDENTIFIER.test(table) : (stryCov_9fa48("113101", "113102", "113103"), !SAFE_SQL_IDENTIFIER.test(table))) {
        if (stryMutAct_9fa48("113104")) {
          {}
        } else {
          stryCov_9fa48("113104");
          throw new Error(PRIMITIVE_ERROR_MSG.LOOKUP_ACCESS_PATH_DENIED);
        }
      }
      const groupedByColumn = new Map();
      for (const key of keys) {
        if (stryMutAct_9fa48("113105")) {
          {}
        } else {
          stryCov_9fa48("113105");
          const column = key[LOOKUP_KEY_FIELD.COLUMN];
          if (stryMutAct_9fa48("113108") ? false : stryMutAct_9fa48("113107") ? true : stryMutAct_9fa48("113106") ? SAFE_SQL_IDENTIFIER.test(column) : (stryCov_9fa48("113106", "113107", "113108"), !SAFE_SQL_IDENTIFIER.test(column))) {
            if (stryMutAct_9fa48("113109")) {
              {}
            } else {
              stryCov_9fa48("113109");
              throw new Error(PRIMITIVE_ERROR_MSG.LOOKUP_ACCESS_PATH_DENIED);
            }
          }
          if (stryMutAct_9fa48("113112") ? false : stryMutAct_9fa48("113111") ? true : stryMutAct_9fa48("113110") ? groupedByColumn.has(column) : (stryCov_9fa48("113110", "113111", "113112"), !groupedByColumn.has(column))) {
            if (stryMutAct_9fa48("113113")) {
              {}
            } else {
              stryCov_9fa48("113113");
              groupedByColumn.set(column, stryMutAct_9fa48("113114") ? ["Stryker was here"] : (stryCov_9fa48("113114"), []));
            }
          }
          groupedByColumn.get(column).push(key[LOOKUP_KEY_FIELD.VALUE]);
        }
      }
      const rows = stryMutAct_9fa48("113115") ? ["Stryker was here"] : (stryCov_9fa48("113115"), []);
      for (const [column, values] of groupedByColumn) {
        if (stryMutAct_9fa48("113116")) {
          {}
        } else {
          stryCov_9fa48("113116");
          const placeholders = values.map(stryMutAct_9fa48("113117") ? () => undefined : (stryCov_9fa48("113117"), () => SQL_PARAM_PLACEHOLDER)).join(SQL_PARAM_SEPARATOR);
          const query = stryMutAct_9fa48("113118") ? SQL_SELECT_PREFIX + table + SQL_WHERE_PREFIX + column + SQL_IN_PREFIX + placeholders - SQL_IN_SUFFIX : (stryCov_9fa48("113118"), (stryMutAct_9fa48("113119") ? SQL_SELECT_PREFIX + table + SQL_WHERE_PREFIX + column + SQL_IN_PREFIX - placeholders : (stryCov_9fa48("113119"), (stryMutAct_9fa48("113120") ? SQL_SELECT_PREFIX + table + SQL_WHERE_PREFIX + column - SQL_IN_PREFIX : (stryCov_9fa48("113120"), (stryMutAct_9fa48("113121") ? SQL_SELECT_PREFIX + table + SQL_WHERE_PREFIX - column : (stryCov_9fa48("113121"), (stryMutAct_9fa48("113122") ? SQL_SELECT_PREFIX + table - SQL_WHERE_PREFIX : (stryCov_9fa48("113122"), (stryMutAct_9fa48("113123") ? SQL_SELECT_PREFIX - table : (stryCov_9fa48("113123"), SQL_SELECT_PREFIX + table)) + SQL_WHERE_PREFIX)) + column)) + SQL_IN_PREFIX)) + placeholders)) + SQL_IN_SUFFIX);
          const result = await this._queryExecutor(query, values);
          if (stryMutAct_9fa48("113126") ? result || Array.isArray(result.rows) : stryMutAct_9fa48("113125") ? false : stryMutAct_9fa48("113124") ? true : (stryCov_9fa48("113124", "113125", "113126"), result && Array.isArray(result.rows))) {
            if (stryMutAct_9fa48("113127")) {
              {}
            } else {
              stryCov_9fa48("113127");
              rows.push(...result.rows);
            }
          }
        }
      }
      return rows;
    }
  }

  /**
   * Check whether execution has been cancelled.
   * @return {boolean} True if cancelled.
   */
  isCancelled() {
    if (stryMutAct_9fa48("113128")) {
      {}
    } else {
      stryCov_9fa48("113128");
      return this._cancellationToken.isCancelled();
    }
  }

  /**
   * Throw if execution has been cancelled.
   * @throws {Error} If cancelled.
   */
  throwIfCancelled() {
    if (stryMutAct_9fa48("113129")) {
      {}
    } else {
      stryCov_9fa48("113129");
      this._cancellationToken.throwIfCancelled();
    }
  }

  /**
   * Get the budget enforcer for this execution.
   * @return {import('./budget-enforcer.js').BudgetEnforcer}
   */
  getBudgetEnforcer() {
    if (stryMutAct_9fa48("113130")) {
      {}
    } else {
      stryCov_9fa48("113130");
      return this._budgetEnforcer;
    }
  }

  /**
   * Get the cancellation token for this execution.
   * @return {import('./cancellation-token.js').CancellationToken}
   */
  getCancellationToken() {
    if (stryMutAct_9fa48("113131")) {
      {}
    } else {
      stryCov_9fa48("113131");
      return this._cancellationToken;
    }
  }

  /**
   * Get the lineage tracker for this execution.
   * @return {import('./lineage-tracker.js').LineageTracker}
   */
  getLineageTracker() {
    if (stryMutAct_9fa48("113132")) {
      {}
    } else {
      stryCov_9fa48("113132");
      return this._lineageTracker;
    }
  }

  /**
   * Get the current exchange mode for stage execution.
   * @return {string} Exchange mode ('local' or 'key').
   */
  getExchangeMode() {
    if (stryMutAct_9fa48("113133")) {
      {}
    } else {
      stryCov_9fa48("113133");
      return this._exchangeMode;
    }
  }

  /**
   * Set the exchange mode for stage execution.
   * Called by executeStage after validation.
   *
   * @param {string} mode - Validated exchange mode.
   */
  setExchangeMode(mode) {
    if (stryMutAct_9fa48("113134")) {
      {}
    } else {
      stryCov_9fa48("113134");
      this._exchangeMode = mode;
    }
  }

  /**
   * Get the exchange manager for this execution.
   * @return {import('./exchange-manager.js').ExchangeManager}
   */
  getExchangeManager() {
    if (stryMutAct_9fa48("113135")) {
      {}
    } else {
      stryCov_9fa48("113135");
      return this._exchangeManager;
    }
  }

  /**
   * Get the dedupe registry for this execution.
   * @return {import('./dedupe-registry.js').DedupeRegistry}
   */
  getDedupeRegistry() {
    if (stryMutAct_9fa48("113136")) {
      {}
    } else {
      stryCov_9fa48("113136");
      return this._dedupeRegistry;
    }
  }

  /**
   * Get the plan diagnostics collector, if any.
   * @return {import('./plan-diagnostics.js').PlanDiagnostics|null}
   */
  getPlanDiagnostics() {
    if (stryMutAct_9fa48("113137")) {
      {}
    } else {
      stryCov_9fa48("113137");
      return this._planDiagnostics;
    }
  }
}
export { ExecutionContext };