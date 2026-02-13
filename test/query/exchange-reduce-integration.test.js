/**
 * Integration tests for ctx.out, exchangeBy, and reduceByKey
 * through the full runtime.run path.
 *
 * Requirements: 4.4, 7.1, 11.1
 */
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {runtime} from '../../src/query/index.js';
import {
  PLAN_KIND,
  PLAN_FIELD,
  REDUCE_FIELD,
  EXCHANGE_MODE,
  EMIT_META_FIELD,
  OUT_TELEMETRY_FIELD,
} from '../../src/query/runtime-constants.js';
import {
  BUDGET_CATEGORY,
  BudgetLimitError,
} from '../../src/query/budget-limit-error.js';
import {
  QB_FIELD,
} from '../../src/wasm-service/query-budget-constants.js';

const EMPTY_ROWS = [];
const EMIT_KEY_A = 'keyA';
const EMIT_KEY_B = 'keyB';
const EMIT_KEY_C = 'keyC';
const EMIT_KEY_D = 'keyD';
const EMIT_VAL_1 = {d: 'v1'};
const EMIT_VAL_2 = {d: 'v2'};
const EMIT_VAL_3 = {d: 'v3'};
const EMIT_VAL_4 = {d: 'v4'};
const EMIT_VAL_5 = {d: 'v5'};
const SMALL_OUT_BUDGET = 50;
const OUT_VAL_A = {name: 'alpha'};
const OUT_VAL_B = {name: 'bravo'};
const TWO = 2;
const THREE = 3;
const FOUR = 4;
const DEDUPE_KEY_SHARED = 'shared-dedupe';
const MAX_RECORDS_TWO = 2;
const MAX_GROUPS_TWO = 2;
const SINGLE_ROW = [{x: 1}];
const DONE_RESULT = 'done';

/**
 * Build a mock queryExecutor returning known rows.
 * @param {Array} rows - Rows to return.
 * @return {Function} Async query executor.
 */
function mockExecutor(rows) {
  return async (_query, _params) => ({rows});
}

describe('exchange-reduce integration', () => {
  describe('ctx.out budget enforcement', () => {
    it('throws BudgetLimitError on exceed', async () => {
      await assert.rejects(
        () => runtime.run(async (ctx) => {
          await ctx.out(OUT_VAL_A);
          await ctx.out(OUT_VAL_B);
          await ctx.out(OUT_VAL_A);
          await ctx.out(OUT_VAL_B);
          await ctx.out(OUT_VAL_A);
        }, {
          budgets: {
            [QB_FIELD.OUT_MAX_BYTES]: SMALL_OUT_BUDGET,
          },
        }),
        (err) => {
          assert.ok(err instanceof BudgetLimitError);
          assert.equal(
            err.category, BUDGET_CATEGORY.OUT_BYTES,
          );
          assert.equal(err.limit, SMALL_OUT_BUDGET);
          assert.ok(err.usage > SMALL_OUT_BUDGET);
          return true;
        },
      );
    });
  });

  describe('exchangeBy key routing', () => {
    it('groups records by key via stage',
      async () => {
        const result = await runtime.run(async (ctx) => {
          await ctx.call(
            'SELECT 1', [],
            async (_batch, stageCtx) => {
              await stageCtx.emit(
                EMIT_KEY_A, EMIT_VAL_1,
              );
              await stageCtx.emit(
                EMIT_KEY_A, EMIT_VAL_2,
              );
              await stageCtx.emit(
                EMIT_KEY_B, EMIT_VAL_3,
              );
              return 'emitted';
            },
            {exchangeBy: EXCHANGE_MODE.KEY},
          );

          const mode = ctx.getExchangeMode();
          assert.equal(mode, EXCHANGE_MODE.KEY);

          const mgr = ctx.getExchangeManager();
          const buf = mgr.getLocalBuffer();
          assert.equal(buf.length, THREE);

          return ctx.call(
            {[PLAN_FIELD.KIND]: PLAN_KIND.REDUCE_BY_KEY},
            (group, _stageCtx) => ({
              key: group[REDUCE_FIELD.KEY],
              count: group[REDUCE_FIELD.RECORDS].length,
            }),
          );
        }, {queryExecutor: mockExecutor(SINGLE_ROW)});

        const sorted = [...result].sort(
          (a, b) => a.key.localeCompare(b.key),
        );
        assert.equal(sorted.length, TWO);
        assert.equal(sorted[0].key, EMIT_KEY_A);
        assert.equal(sorted[0].count, TWO);
        assert.equal(sorted[1].key, EMIT_KEY_B);
        assert.equal(sorted[1].count, 1);
      });
  });

  describe('exchangeBy local default', () => {
    it('keeps records in local buffer', async () => {
      let capturedMgr;
      await runtime.run(async (ctx) => {
        await ctx.emit(EMIT_KEY_A, EMIT_VAL_1);
        await ctx.emit(EMIT_KEY_B, EMIT_VAL_2);
        capturedMgr = ctx.getExchangeManager();
      }, {queryExecutor: mockExecutor(EMPTY_ROWS)});

      assert.equal(
        capturedMgr.getMode(), EXCHANGE_MODE.LOCAL,
      );
      assert.equal(
        capturedMgr.getLocalBuffer().length, TWO,
      );
      assert.equal(
        capturedMgr.getPartitionBuffers().size, 0,
      );
    });
  });

  describe('reduceByKey grouped batches', () => {
    it('delivers {key, records} groups to handler',
      async () => {
        const result = await runtime.run(async (ctx) => {
          await ctx.emit(EMIT_KEY_A, EMIT_VAL_1);
          await ctx.emit(EMIT_KEY_A, EMIT_VAL_2);
          await ctx.emit(EMIT_KEY_B, EMIT_VAL_3);
          await ctx.emit(EMIT_KEY_C, EMIT_VAL_4);

          return ctx.call(
            {[PLAN_FIELD.KIND]: PLAN_KIND.REDUCE_BY_KEY},
            (group, _stageCtx) => {
              assert.ok(
                group[REDUCE_FIELD.KEY] !== undefined,
              );
              assert.ok(
                Array.isArray(
                  group[REDUCE_FIELD.RECORDS],
                ),
              );
              return {
                key: group[REDUCE_FIELD.KEY],
                count:
                    group[REDUCE_FIELD.RECORDS].length,
              };
            },
          );
        }, {queryExecutor: mockExecutor(EMPTY_ROWS)});

        const sorted = [...result].sort(
          (a, b) => a.key.localeCompare(b.key),
        );
        assert.equal(sorted.length, THREE);
        assert.equal(sorted[0].key, EMIT_KEY_A);
        assert.equal(sorted[0].count, TWO);
        assert.equal(sorted[1].key, EMIT_KEY_B);
        assert.equal(sorted[1].count, 1);
        assert.equal(sorted[2].key, EMIT_KEY_C);
        assert.equal(sorted[2].count, 1);
      });
  });

  describe('reduceByKey continuation tokens', () => {
    it('splits large groups with continuation',
      async () => {
        const groups = [];
        await runtime.run(async (ctx) => {
          await ctx.emit(EMIT_KEY_A, EMIT_VAL_1);
          await ctx.emit(EMIT_KEY_A, EMIT_VAL_2);
          await ctx.emit(EMIT_KEY_A, EMIT_VAL_3);
          await ctx.emit(EMIT_KEY_A, EMIT_VAL_4);
          await ctx.emit(EMIT_KEY_A, EMIT_VAL_5);

          return ctx.call(
            {[PLAN_FIELD.KIND]: PLAN_KIND.REDUCE_BY_KEY},
            (group, _stageCtx) => {
              groups.push({...group});
              return group[REDUCE_FIELD.KEY];
            },
            {maxRecordsPerGroup: MAX_RECORDS_TWO},
          );
        }, {queryExecutor: mockExecutor(EMPTY_ROWS)});

        assert.equal(groups.length, THREE);

        const withCont = groups.filter(
          (g) =>
            g[REDUCE_FIELD.CONTINUATION] !== undefined,
        );
        assert.equal(withCont.length, TWO);

        const last = groups[groups.length - 1];
        assert.equal(
          last[REDUCE_FIELD.CONTINUATION], undefined,
        );

        for (const g of groups) {
          assert.ok(
            g[REDUCE_FIELD.RECORDS].length <=
                MAX_RECORDS_TWO,
          );
        }
      });
  });

  describe('reduceByKey maxGroupsPerBatch', () => {
    it('invokes handler per batch slice',
      async () => {
        let callCount = 0;
        await runtime.run(async (ctx) => {
          await ctx.emit(EMIT_KEY_A, EMIT_VAL_1);
          await ctx.emit(EMIT_KEY_B, EMIT_VAL_2);
          await ctx.emit(EMIT_KEY_C, EMIT_VAL_3);
          await ctx.emit(EMIT_KEY_D, EMIT_VAL_4);

          return ctx.call(
            {[PLAN_FIELD.KIND]: PLAN_KIND.REDUCE_BY_KEY},
            (group, _stageCtx) => {
              callCount++;
              return group[REDUCE_FIELD.KEY];
            },
            {maxGroupsPerBatch: MAX_GROUPS_TWO},
          );
        }, {queryExecutor: mockExecutor(EMPTY_ROWS)});

        assert.equal(callCount, FOUR);
      });
  });

  describe('ctx.out telemetry tracking', () => {
    it('returns correct telemetry counters', async () => {
      const res = await runtime.run(async (ctx) => {
        await ctx.out(OUT_VAL_A);
        await ctx.out(OUT_VAL_B);
        await ctx.out(OUT_VAL_A);
        return DONE_RESULT;
      });

      assert.equal(res.result, DONE_RESULT);
      assert.equal(res.output.length, THREE);
      assert.equal(
        res.telemetry[OUT_TELEMETRY_FIELD.ROW_COUNT],
        THREE,
      );
      assert.equal(
        res.telemetry[OUT_TELEMETRY_FIELD.WRITE_COUNT],
        THREE,
      );
      assert.ok(
        res.telemetry[OUT_TELEMETRY_FIELD.BYTE_COUNT] > 0,
      );
      assert.equal(
        res.telemetry[
          OUT_TELEMETRY_FIELD.BUDGET_EXCEEDED_COUNT
        ], 0,
      );
    });
  });

  describe('emit dedupe via explicit dedupeKey', () => {
    it('deduplicates same dedupeKey emits', async () => {
      let capturedMgr;
      await runtime.run(async (ctx) => {
        await ctx.emit(
          EMIT_KEY_A, EMIT_VAL_1,
          {[EMIT_META_FIELD.DEDUPE_KEY]: DEDUPE_KEY_SHARED},
        );
        await ctx.emit(
          EMIT_KEY_A, EMIT_VAL_2,
          {[EMIT_META_FIELD.DEDUPE_KEY]: DEDUPE_KEY_SHARED},
        );
        capturedMgr = ctx.getExchangeManager();
      }, {queryExecutor: mockExecutor(EMPTY_ROWS)});

      const buf = capturedMgr.getLocalBuffer();
      assert.equal(buf.length, 1);
      assert.deepEqual(buf[0].value, EMIT_VAL_1);
    });
  });
});
