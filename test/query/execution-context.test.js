/**
 * Unit tests for ExecutionContext.
 *
 * Requirements: 4.1, 4.2, 4.5, 5.1
 */
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {
  ExecutionContext,
} from '../../src/query/execution-context.js';
import {BudgetEnforcer} from '../../src/query/budget-enforcer.js';
import {
  CancellationToken,
} from '../../src/query/cancellation-token.js';
import {LineageTracker} from '../../src/query/lineage-tracker.js';
import {
  SNAPSHOT_MODE,
  RUNTIME_ERROR_MSG as ERR,
  OUT_ERROR_MSG,
  OUT_TELEMETRY_FIELD,
  EXCHANGE_ERROR_MSG,
  EXCHANGE_MODE,
  EMIT_META_FIELD,
  EMIT_DEFAULT_STAGE_ID,
} from '../../src/query/runtime-constants.js';
import {
  ResultStream,
} from '../../src/query/result-stream.js';
import {
  BudgetLimitError,
  BUDGET_CATEGORY,
} from '../../src/query/budget-limit-error.js';
import {
  QB_FIELD,
} from '../../src/wasm-service/query-budget-constants.js';
import {
} from '../../src/query/guardrail-constants.js';
import {
  ExchangeManager,
} from '../../src/query/distributed/exchange-manager.js';
import {
  DedupeRegistry,
} from '../../src/query/dedupe-registry.js';
import {
  BROADCAST_FIELD,
  PRIMITIVE_ERROR_MSG,
} from '../../src/query/distributed/distributed-context-constants.js';

/**
 * Create a minimal ExecutionContext for testing.
 * @param {Object} [overrides] - Override default deps.
 * @return {ExecutionContext}
 */
function createCtx(overrides = {}) {
  return new ExecutionContext({
    session: overrides.session ?? 'test-session',
    snapshot: overrides.snapshot ?? {
      mode: SNAPSHOT_MODE.READ_COMMITTED,
    },
    budgetEnforcer: overrides.budgetEnforcer ??
      new BudgetEnforcer(),
    cancellationToken: overrides.cancellationToken ??
      new CancellationToken(),
    lineageTracker: overrides.lineageTracker ??
      new LineageTracker('test-q-1'),
    queryExecutor: overrides.queryExecutor ?? null,
    resultStream: overrides.resultStream,
    exchangeManager: overrides.exchangeManager,
    dedupeRegistry: overrides.dedupeRegistry,
  });
}

describe('ExecutionContext', () => {
  describe('construction', () => {
    it('should store session identity', () => {
      const ctx = createCtx({session: 'my-session'});
      assert.equal(ctx.session, 'my-session');
    });

    it('should freeze snapshot', () => {
      const ctx = createCtx({
        snapshot: {mode: SNAPSHOT_MODE.SNAPSHOT, ts: 100},
      });
      assert.equal(ctx.snapshot.mode, SNAPSHOT_MODE.SNAPSHOT);
      assert.equal(ctx.snapshot.ts, 100);
      assert.throws(() => {
        ctx.snapshot.mode = 'changed';
      });
    });

    it('should expose budget enforcer', () => {
      const enforcer = new BudgetEnforcer();
      const ctx = createCtx({budgetEnforcer: enforcer});
      assert.equal(ctx.getBudgetEnforcer(), enforcer);
    });

    it('should expose cancellation token', () => {
      const token = new CancellationToken();
      const ctx = createCtx({cancellationToken: token});
      assert.equal(ctx.getCancellationToken(), token);
    });

    it('should expose lineage tracker', () => {
      const tracker = new LineageTracker('q-1');
      const ctx = createCtx({lineageTracker: tracker});
      assert.equal(ctx.getLineageTracker(), tracker);
    });
  });

  describe('cancellation helpers', () => {
    it('should report not cancelled initially', () => {
      const ctx = createCtx();
      assert.equal(ctx.isCancelled(), false);
    });

    it('should report cancelled after token cancel', () => {
      const token = new CancellationToken();
      const ctx = createCtx({cancellationToken: token});
      token.cancel('test');
      assert.equal(ctx.isCancelled(), true);
    });

    it('should not throw when not cancelled', () => {
      const ctx = createCtx();
      assert.doesNotThrow(() => ctx.throwIfCancelled());
    });

    it('should throw when cancelled', () => {
      const token = new CancellationToken();
      const ctx = createCtx({cancellationToken: token});
      token.cancel('reason');
      assert.throws(
        () => ctx.throwIfCancelled(),
        (err) => err.message === 'reason',
      );
    });
  });

  describe('ctx.call mode detection', () => {
    it('should throw when query is undefined', () => {
      const ctx = createCtx();
      assert.throws(
        () => ctx.call(undefined),
        (err) => err.message === ERR.CALL_QUERY_REQUIRED,
      );
    });

    it('should throw when query is null', () => {
      const ctx = createCtx();
      assert.throws(
        () => ctx.call(null),
        (err) => err.message === ERR.CALL_QUERY_REQUIRED,
      );
    });

    it('should dispatch Plan_Mode for object query with kind',
      async () => {
        const ctx = createCtx();
        // Plan_Mode is wired (task 2.3); returns a promise.
        // Without a handler, reduceByKey rejects, confirming
        // dispatch reached the plan executor.
        await assert.rejects(
          () => ctx.call({kind: 'reduceByKey'}),
          (err) => err.message.includes('reduceByKey'),
        );
      });

    it('should dispatch Stage_Mode when handler given',
      () => {
        const executor = async () => ({rows: []});
        const ctx = createCtx({queryExecutor: executor});
        // Stage_Mode is wired (task 2.2); returns a promise.
        const result = ctx.call(
          'SELECT 1', [], () => {},
        );
        assert.ok(result instanceof Promise);
      });

    it('should dispatch Stage_Mode when params is a function',
      () => {
        const executor = async () => ({rows: []});
        const ctx = createCtx({queryExecutor: executor});
        const result = ctx.call('SELECT 1', () => {});
        assert.ok(result instanceof Promise);
      });

    it('should throw for non-array params', () => {
      const ctx = createCtx();
      assert.throws(
        () => ctx.call('SELECT 1', 'bad'),
        (err) => err.message ===
          ERR.CALL_PARAMS_MUST_BE_ARRAY,
      );
    });

    it('should throw for non-string non-object query', () => {
      const ctx = createCtx();
      assert.throws(
        () => ctx.call(42),
        (err) => err.message === ERR.CALL_QUERY_REQUIRED,
      );
    });

    it('should return async iterator in Iterator_Mode', () => {
      const executor = async () => ({rows: []});
      const ctx = createCtx({queryExecutor: executor});
      const iter = ctx.call('SELECT 1');
      assert.equal(
        typeof iter[Symbol.asyncIterator], 'function',
      );
    });
  });

  describe('ctx.call Iterator_Mode', () => {
    it('should yield all rows from executor', async () => {
      const rows = [{id: 1}, {id: 2}, {id: 3}];
      const executor = async () => ({rows});
      const ctx = createCtx({queryExecutor: executor});
      const collected = [];
      for await (const row of ctx.call('SELECT * FROM t')) {
        collected.push(row);
      }
      assert.deepEqual(collected, rows);
    });

    it('should yield nothing for empty result', async () => {
      const executor = async () => ({rows: []});
      const ctx = createCtx({queryExecutor: executor});
      const collected = [];
      for await (const row of ctx.call('SELECT 1')) {
        collected.push(row);
      }
      assert.equal(collected.length, 0);
    });

    it('should pass query and params to executor',
      async () => {
        let capturedQuery;
        let capturedParams;
        const executor = async (q, p) => {
          capturedQuery = q;
          capturedParams = p;
          return {rows: []};
        };
        const ctx = createCtx({queryExecutor: executor});
        const iter = ctx.call('SELECT ?', [42]);
        await iter.next();
        assert.equal(capturedQuery, 'SELECT ?');
        assert.deepEqual(capturedParams, [42]);
      });

    it('should default params to empty array', async () => {
      let capturedParams;
      const executor = async (_q, p) => {
        capturedParams = p;
        return {rows: []};
      };
      const ctx = createCtx({queryExecutor: executor});
      const iter = ctx.call('SELECT 1');
      await iter.next();
      assert.deepEqual(capturedParams, []);
    });

    it('should check cancellation before each yield',
      async () => {
        const token = new CancellationToken();
        const rows = [{id: 1}, {id: 2}];
        const executor = async () => ({rows});
        const ctx = createCtx({
          cancellationToken: token,
          queryExecutor: executor,
        });
        const iter = ctx.call('SELECT 1');
        await iter.next(); // row 1
        token.cancel('stopped');
        await assert.rejects(
          () => iter.next(),
          (err) => err.message === 'stopped',
        );
      });

    it('should throw on call when already cancelled', () => {
      const token = new CancellationToken();
      token.cancel('pre-cancelled');
      const executor = async () => ({rows: []});
      const ctx = createCtx({
        cancellationToken: token,
        queryExecutor: executor,
      });
      assert.throws(
        () => ctx.call('SELECT 1'),
        (err) => err.message === 'pre-cancelled',
      );
    });

    it('should handle null rows from executor', async () => {
      const executor = async () => ({rows: null});
      const ctx = createCtx({queryExecutor: executor});
      const collected = [];
      for await (const row of ctx.call('SELECT 1')) {
        collected.push(row);
      }
      assert.equal(collected.length, 0);
    });

    it('should support early return via break', async () => {
      let callCount = 0;
      const rows = [{id: 1}, {id: 2}, {id: 3}];
      const executor = async () => {
        callCount++;
        return {rows};
      };
      const ctx = createCtx({queryExecutor: executor});
      const collected = [];
      for await (const row of ctx.call('SELECT 1')) {
        collected.push(row);
        if (collected.length === 1) break;
      }
      assert.equal(collected.length, 1);
      assert.equal(callCount, 1);
    });
  });

  describe('distributed primitives', () => {
    it('ctx.emit should route through exchange manager',
      async () => {
        const ctx = createCtx();
        await ctx.emit('k', 'v');
        const buf = ctx.getExchangeManager().getLocalBuffer();
        assert.equal(buf.length, 1);
        assert.equal(buf[0].key, 'k');
        assert.equal(buf[0].value, 'v');
      });

    it('ctx.out should write value to result stream',
      async () => {
        const ctx = createCtx();
        await ctx.out({id: 1});
        assert.deepEqual(ctx.getResults(), [{id: 1}]);
      });

    it('ctx.out should reject undefined value', async () => {
      const ctx = createCtx();
      await assert.rejects(
        () => ctx.out(undefined),
        (err) => err.message ===
          OUT_ERROR_MSG.VALUE_REQUIRED,
      );
    });

    it('ctx.out should wrap value with meta when provided',
      async () => {
        const ctx = createCtx();
        await ctx.out('hello', {tag: 'final'});
        assert.deepEqual(
          ctx.getResults(),
          [{value: 'hello', meta: {tag: 'final'}}],
        );
      });

    it('ctx.out should reject after stream closed',
      async () => {
        const ctx = createCtx();
        ctx.closeOutputStream();
        await assert.rejects(
          () => ctx.out('v'),
          (err) => err.message ===
            OUT_ERROR_MSG.STREAM_CLOSED,
        );
      });

    it('ctx.out should check cancellation', async () => {
      const token = new CancellationToken();
      token.cancel('stopped');
      const ctx = createCtx({cancellationToken: token});
      await assert.rejects(
        () => ctx.out('v'),
        (err) => err.message === 'stopped',
      );
    });

    it('ctx.lookup executes through queryExecutor', async () => {
      let capturedQuery = null;
      let capturedParams = null;
      const ctx = createCtx({
        queryExecutor: async (query, params) => {
          capturedQuery = query;
          capturedParams = params;
          return {
            rows: [{id: 1, name: 'alice'}],
          };
        },
      });
      const result = await ctx.lookup('users', [
        {column: 'id', value: 1},
      ]);
      assert.deepEqual(result.rows, [{id: 1, name: 'alice'}]);
      assert.equal(result.keyCount, 1);
      assert.equal(result.partitionCount, 1);
      assert.equal(
        capturedQuery,
        'SELECT * FROM users WHERE id IN (?)',
      );
      assert.deepEqual(capturedParams, [1]);
    });

    it('ctx.lookup validates key input through lookup primitive', async () => {
      const ctx = createCtx();
      await assert.rejects(
        () => ctx.lookup('users', []),
        (err) => err.message === PRIMITIVE_ERROR_MSG.LOOKUP_KEYS_EMPTY,
      );
    });

    it('ctx.broadcast publishes and useBroadcast retrieves dataset',
      async () => {
        const ctx = createCtx();
        const publish = await ctx.broadcast('shared-users', {
          version: 1,
          rows: [{id: 1}],
        });
        assert.equal(publish.ref, 'shared-users');
        assert.equal(publish.version, 1);
        const view = await ctx.useBroadcast('shared-users');
        assert.equal(view[BROADCAST_FIELD.REF], 'shared-users');
        assert.equal(view[BROADCAST_FIELD.VERSION], 1);
        assert.deepEqual(
          view[BROADCAST_FIELD.PAYLOAD].rows,
          [{id: 1}],
        );
      });

    it('ctx.useBroadcast returns not found for unknown reference', async () => {
      const ctx = createCtx();
      await assert.rejects(
        () => ctx.useBroadcast('missing-ref'),
        (err) => err.message === PRIMITIVE_ERROR_MSG.BROADCAST_REF_NOT_FOUND,
      );
    });
  });

  describe('ctx.out budget enforcement', () => {
    it('should throw BudgetLimitError when out bytes ' +
      'budget exceeded', async () => {
      const enforcer = new BudgetEnforcer({
        [QB_FIELD.OUT_MAX_BYTES]: 10,
      });
      const ctx = createCtx({budgetEnforcer: enforcer});
      await assert.rejects(
        () => ctx.out({data: 'this is a long value'}),
        (err) => {
          assert.ok(err instanceof BudgetLimitError);
          assert.equal(
            err.category, BUDGET_CATEGORY.OUT_BYTES,
          );
          return true;
        },
      );
    });

    it('should throw BudgetLimitError when result stream ' +
      'row limit exceeded', async () => {
      const stream = new ResultStream({
        RESULT_MAX_ROWS: 2,
        RESULT_MAX_BYTES: 1048576,
      });
      const enforcer = new BudgetEnforcer({
        [QB_FIELD.OUT_MAX_BYTES]: 1048576,
      });
      const ctx = createCtx({
        budgetEnforcer: enforcer,
        resultStream: stream,
      });
      await ctx.out('a');
      await ctx.out('b');
      await assert.rejects(
        () => ctx.out('c'),
        (err) => err instanceof BudgetLimitError,
      );
    });

    it('should track out bytes in budget enforcer',
      async () => {
        const enforcer = new BudgetEnforcer();
        const ctx = createCtx({budgetEnforcer: enforcer});
        await ctx.out({id: 1});
        const usage = enforcer.getUsage();
        assert.ok(usage.outBytes > 0);
      });

    it('should succeed within budget', async () => {
      const enforcer = new BudgetEnforcer({
        [QB_FIELD.OUT_MAX_BYTES]: 1048576,
      });
      const ctx = createCtx({budgetEnforcer: enforcer});
      await ctx.out('hello');
      await ctx.out('world');
      assert.deepEqual(
        ctx.getResults(), ['hello', 'world'],
      );
      assert.equal(enforcer.isTerminated(), false);
    });

    it('should terminate enforcer on out bytes exceed',
      async () => {
        const enforcer = new BudgetEnforcer({
          [QB_FIELD.OUT_MAX_BYTES]: 5,
        });
        const ctx = createCtx({budgetEnforcer: enforcer});
        await assert.rejects(
          () => ctx.out({large: 'payload-data'}),
          (err) => err instanceof BudgetLimitError,
        );
        assert.equal(enforcer.isTerminated(), true);
      });
  });

  describe('property: snapshot is always frozen', () => {
    /**
     * **Validates: Requirements 4.2**
     *
     * For any valid snapshot mode and optional timestamp,
     * the snapshot object on the context is always frozen.
     */
    it('snapshot is immutable for any valid input', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            SNAPSHOT_MODE.READ_COMMITTED,
            SNAPSHOT_MODE.SNAPSHOT,
          ),
          fc.option(fc.nat(), {nil: undefined}),
          (mode, ts) => {
            const ctx = createCtx({
              snapshot: {mode, ts},
            });
            return Object.isFrozen(ctx.snapshot) &&
              ctx.snapshot.mode === mode &&
              ctx.snapshot.ts === ts;
          },
        ),
        {numRuns: 10},
      );
    });
  });

  describe('property: cancellation state is consistent',
    () => {
      /**
       * **Validates: Requirements 4.1**
       *
       * isCancelled reflects the underlying token state.
       */
      it('isCancelled matches token state', () => {
        fc.assert(
          fc.property(
            fc.boolean(),
            (shouldCancel) => {
              const token = new CancellationToken();
              const ctx = createCtx({
                cancellationToken: token,
              });
              if (shouldCancel) token.cancel('test');
              return ctx.isCancelled() === shouldCancel;
            },
          ),
          {numRuns: 10},
        );
      });
    });

  describe('ctx.out telemetry', () => {
    it('should start with zero counters', () => {
      const ctx = createCtx();
      const t = ctx.getOutTelemetry();
      assert.equal(
        t[OUT_TELEMETRY_FIELD.ROW_COUNT], 0,
      );
      assert.equal(
        t[OUT_TELEMETRY_FIELD.BYTE_COUNT], 0,
      );
      assert.equal(
        t[OUT_TELEMETRY_FIELD.WRITE_COUNT], 0,
      );
      assert.equal(
        t[OUT_TELEMETRY_FIELD.BUDGET_EXCEEDED_COUNT], 0,
      );
    });

    it('should increment counters on writes', async () => {
      const ctx = createCtx();
      await ctx.out({id: 1});
      await ctx.out({id: 2});
      const t = ctx.getOutTelemetry();
      assert.equal(
        t[OUT_TELEMETRY_FIELD.ROW_COUNT], 2,
      );
      assert.equal(
        t[OUT_TELEMETRY_FIELD.WRITE_COUNT], 2,
      );
      assert.ok(
        t[OUT_TELEMETRY_FIELD.BYTE_COUNT] > 0,
      );
    });

    it('should track budget exceeded from enforcer',
      async () => {
        const enforcer = new BudgetEnforcer({
          [QB_FIELD.OUT_MAX_BYTES]: 5,
        });
        const ctx = createCtx({budgetEnforcer: enforcer});
        await assert.rejects(
          () => ctx.out({large: 'payload-data'}),
          (err) => err instanceof BudgetLimitError,
        );
        const t = ctx.getOutTelemetry();
        assert.equal(
          t[OUT_TELEMETRY_FIELD.BUDGET_EXCEEDED_COUNT], 1,
        );
        assert.equal(
          t[OUT_TELEMETRY_FIELD.WRITE_COUNT], 0,
        );
      });

    it('should track budget exceeded from stream limit',
      async () => {
        const stream = new ResultStream({
          RESULT_MAX_ROWS: 1,
          RESULT_MAX_BYTES: 1048576,
        });
        const enforcer = new BudgetEnforcer({
          [QB_FIELD.OUT_MAX_BYTES]: 1048576,
        });
        const ctx = createCtx({
          budgetEnforcer: enforcer,
          resultStream: stream,
        });
        await ctx.out('a');
        await assert.rejects(
          () => ctx.out('b'),
          (err) => err instanceof BudgetLimitError,
        );
        const t = ctx.getOutTelemetry();
        assert.equal(
          t[OUT_TELEMETRY_FIELD.WRITE_COUNT], 1,
        );
        assert.equal(
          t[OUT_TELEMETRY_FIELD.BUDGET_EXCEEDED_COUNT], 1,
        );
      });

    it('should return frozen snapshot', () => {
      const ctx = createCtx();
      const t = ctx.getOutTelemetry();
      assert.ok(Object.isFrozen(t));
    });
  });

  describe('ctx.emit exchange routing', () => {
    it('should route to local buffer by default',
      async () => {
        const ctx = createCtx();
        await ctx.emit('k1', 'v1');
        const buf = ctx.getExchangeManager()
          .getLocalBuffer();
        assert.equal(buf.length, 1);
        assert.equal(buf[0].key, 'k1');
      });

    it('should route to partition buffers in KEY mode',
      async () => {
        const mgr = new ExchangeManager({
          mode: EXCHANGE_MODE.KEY,
          partitionCount: 4,
        });
        const ctx = createCtx({exchangeManager: mgr});
        await ctx.emit('k1', 'v1');
        let total = 0;
        for (const entries of mgr.getPartitionBuffers()
          .values()) {
          total += entries.length;
        }
        assert.equal(total, 1);
      });

    it('should reject non-string key', async () => {
      const ctx = createCtx();
      await assert.rejects(
        () => ctx.emit(42, 'v'),
        (err) => err.message ===
          EXCHANGE_ERROR_MSG.EMIT_KEY_REQUIRED,
      );
    });

    it('should check cancellation before emit',
      async () => {
        const token = new CancellationToken();
        token.cancel('stopped');
        const ctx = createCtx({cancellationToken: token});
        await assert.rejects(
          () => ctx.emit('k', 'v'),
          (err) => err.message === 'stopped',
        );
      });

    it('should record emit bytes in budget enforcer',
      async () => {
        const enforcer = new BudgetEnforcer();
        const ctx = createCtx({budgetEnforcer: enforcer});
        await ctx.emit('k1', {data: 'payload'});
        const usage = enforcer.getUsage();
        assert.ok(usage.emitBytes > 0);
      });

    it('should throw BudgetLimitError when emit bytes ' +
      'budget exceeded', async () => {
      const enforcer = new BudgetEnforcer({
        [QB_FIELD.EMIT_MAX_BYTES]: 5,
      });
      const ctx = createCtx({budgetEnforcer: enforcer});
      await assert.rejects(
        () => ctx.emit('k', {large: 'payload-data'}),
        (err) => err instanceof BudgetLimitError,
      );
    });

    it('should pass meta through to exchange manager',
      async () => {
        const ctx = createCtx();
        await ctx.emit('k1', 'v1', {dedupeKey: 'd1'});
        const buf = ctx.getExchangeManager()
          .getLocalBuffer();
        assert.equal(buf[0].meta.dedupeKey, 'd1');
      });
  });

  describe('ctx.emit dedupe-key support', () => {
    it('should attach explicit dedupeKey from meta',
      async () => {
        const ctx = createCtx();
        await ctx.emit('k1', 'v1', {dedupeKey: 'my-key'});
        const buf = ctx.getExchangeManager()
          .getLocalBuffer();
        assert.equal(
          buf[0].meta[EMIT_META_FIELD.DEDUPE_KEY],
          'my-key',
        );
      });

    it('should auto-generate lineage-based dedupeKey ' +
      'when not provided', async () => {
      const ctx = createCtx();
      await ctx.emit('k1', 'v1');
      const buf = ctx.getExchangeManager()
        .getLocalBuffer();
      const meta = buf[0].meta;
      assert.ok(meta[EMIT_META_FIELD.DEDUPE_KEY]);
      assert.ok(meta[EMIT_META_FIELD.LINEAGE_ID]);
      // Auto-generated: dedupeKey equals lineageId
      assert.equal(
        meta[EMIT_META_FIELD.DEDUPE_KEY],
        meta[EMIT_META_FIELD.LINEAGE_ID],
      );
    });

    it('should attach lineageId to meta even with ' +
      'explicit dedupeKey', async () => {
      const ctx = createCtx();
      await ctx.emit('k1', 'v1', {dedupeKey: 'explicit'});
      const buf = ctx.getExchangeManager()
        .getLocalBuffer();
      const meta = buf[0].meta;
      assert.equal(
        meta[EMIT_META_FIELD.DEDUPE_KEY], 'explicit',
      );
      assert.ok(meta[EMIT_META_FIELD.LINEAGE_ID]);
    });

    it('should skip duplicate emit with same explicit ' +
      'dedupeKey', async () => {
      const ctx = createCtx();
      await ctx.emit('k1', 'v1', {dedupeKey: 'dup'});
      await ctx.emit('k1', 'v2', {dedupeKey: 'dup'});
      const buf = ctx.getExchangeManager()
        .getLocalBuffer();
      assert.equal(buf.length, 1);
      assert.equal(buf[0].value, 'v1');
    });

    it('should allow different dedupeKeys', async () => {
      const ctx = createCtx();
      await ctx.emit('k1', 'v1', {dedupeKey: 'a'});
      await ctx.emit('k1', 'v2', {dedupeKey: 'b'});
      const buf = ctx.getExchangeManager()
        .getLocalBuffer();
      assert.equal(buf.length, 2);
    });

    it('should register dedupe keys in registry',
      async () => {
        const ctx = createCtx();
        await ctx.emit('k1', 'v1', {dedupeKey: 'dk1'});
        await ctx.emit('k2', 'v2', {dedupeKey: 'dk2'});
        const reg = ctx.getDedupeRegistry();
        assert.ok(reg.isDuplicate(
          'dk1', EMIT_DEFAULT_STAGE_ID,
        ));
        assert.ok(reg.isDuplicate(
          'dk2', EMIT_DEFAULT_STAGE_ID,
        ));
        assert.equal(reg.size(), 2);
      });

    it('should increment emit sequence for auto-generated ' +
      'keys', async () => {
      const ctx = createCtx();
      await ctx.emit('k1', 'v1');
      await ctx.emit('k2', 'v2');
      const buf = ctx.getExchangeManager()
        .getLocalBuffer();
      const key1 = buf[0].meta[EMIT_META_FIELD.DEDUPE_KEY];
      const key2 = buf[1].meta[EMIT_META_FIELD.DEDUPE_KEY];
      assert.notEqual(key1, key2);
    });

    it('should preserve extra meta fields alongside ' +
      'dedupe fields', async () => {
      const ctx = createCtx();
      await ctx.emit('k1', 'v1', {
        dedupeKey: 'dk',
        custom: 'field',
      });
      const buf = ctx.getExchangeManager()
        .getLocalBuffer();
      assert.equal(buf[0].meta.custom, 'field');
      assert.equal(
        buf[0].meta[EMIT_META_FIELD.DEDUPE_KEY], 'dk',
      );
    });

    it('should use shared dedupe registry when injected',
      async () => {
        const registry = new DedupeRegistry();
        // Pre-register a key to simulate replay
        registry.register('pre-seen', EMIT_DEFAULT_STAGE_ID,
          null);
        const ctx = createCtx({dedupeRegistry: registry});
        await ctx.emit('k1', 'v1', {dedupeKey: 'pre-seen'});
        // Should be skipped
        const buf = ctx.getExchangeManager()
          .getLocalBuffer();
        assert.equal(buf.length, 0);
      });
  });
});
