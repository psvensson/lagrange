/**
 * Integration tests for runtime.run + real ctx.call modes.
 *
 * Exercises the full runtime.run → ExecutionContext → ctx.call
 * path through Iterator_Mode, Stage_Mode, and Plan_Mode.
 *
 * Requirements: 4.1, 5.1, 5.2
 */
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {runtime} from '../../src/query/index.js';
import {
  SNAPSHOT_MODE,
  DEFAULT_SNAPSHOT_MODE,
  DEFAULT_RUNTIME_SESSION,
  PLAN_KIND,
  PLAN_FIELD,
  REDUCE_FIELD,
  OUT_TELEMETRY_FIELD,
} from '../../src/query/runtime-constants.js';

const TEST_QUERY = 'SELECT * FROM t';
const TEST_PARAMS = [];
const TEST_ROW_A = {id: 1, name: 'alice'};
const TEST_ROW_B = {id: 2, name: 'bob'};
const TEST_ROW_C = {id: 3, name: 'carol'};
const TEST_ROWS = [TEST_ROW_A, TEST_ROW_B, TEST_ROW_C];
const BATCH_SIZE_TWO = 2;
const EMIT_KEY_A = 'keyA';
const EMIT_KEY_B = 'keyB';
const EMIT_VAL_1 = {data: 'v1'};
const EMIT_VAL_2 = {data: 'v2'};
const EMIT_VAL_3 = {data: 'v3'};
const BROADCAST_REF = 'myRef';
const CUSTOM_SESSION = 'test-session-42';
const SNAPSHOT_TS = 1700000000;
const OUTPUT_VAL = {name: 'result1'};
const ERROR_MSG = 'user-fn-boom';
const EXPECTED_ROW_COUNT = 2;
const EXPECTED_WRITE_COUNT = 2;

/**
 * Build a mock queryExecutor returning known rows.
 * @param {Array} rows - Rows to return.
 * @return {Function} Async query executor.
 */
function mockExecutor(rows) {
  return async (_query, _params) => ({rows});
}

describe('runtime.run integration', () => {
  describe('Iterator_Mode via runtime.run', () => {
    it('should collect rows from async iterator via ' +
      'ctx.call(query, params)', async () => {
      const result = await runtime.run(async (ctx) => {
        const collected = [];
        const iter = ctx.call(TEST_QUERY, TEST_PARAMS);
        for await (const row of iter) {
          collected.push(row);
        }
        return collected;
      }, {queryExecutor: mockExecutor(TEST_ROWS)});

      assert.deepEqual(result, TEST_ROWS);
    });
  });

  describe('Stage_Mode via runtime.run', () => {
    it('should invoke handler with batches and collect ' +
      'results', async () => {
      const result = await runtime.run(async (ctx) => {
        return ctx.call(
          TEST_QUERY, TEST_PARAMS,
          async (batch, _stageCtx) => batch.length,
        );
      }, {queryExecutor: mockExecutor(TEST_ROWS)});

      // Default batchSize is 1000, so all 3 rows in one batch
      assert.deepEqual(result, [TEST_ROWS.length]);
    });

    it('should respect batchSize option', async () => {
      const result = await runtime.run(async (ctx) => {
        return ctx.call(
          TEST_QUERY, TEST_PARAMS,
          async (batch, _stageCtx) => batch.length,
          {batchSize: BATCH_SIZE_TWO},
        );
      }, {queryExecutor: mockExecutor(TEST_ROWS)});

      // 3 rows with batchSize 2 → batches of [2, 1]
      assert.deepEqual(result, [BATCH_SIZE_TWO, 1]);
    });
  });

  describe('Plan_Mode via runtime.run', () => {
    it('should execute reduceByKey with emitted records',
      async () => {
        const result = await runtime.run(async (ctx) => {
          await ctx.emit(EMIT_KEY_A, EMIT_VAL_1);
          await ctx.emit(EMIT_KEY_A, EMIT_VAL_2);
          await ctx.emit(EMIT_KEY_B, EMIT_VAL_3);

          return ctx.call(
            {[PLAN_FIELD.KIND]: PLAN_KIND.REDUCE_BY_KEY},
            (group, _stageCtx) => ({
              key: group[REDUCE_FIELD.KEY],
              count: group[REDUCE_FIELD.RECORDS].length,
            }),
          );
        }, {queryExecutor: mockExecutor([])});

        // Two groups: keyA with 2 records, keyB with 1
        const sorted = [...result].sort(
          (a, b) => a.key.localeCompare(b.key),
        );
        assert.equal(sorted.length, BATCH_SIZE_TWO);
        assert.equal(sorted[0].key, EMIT_KEY_A);
        assert.equal(sorted[0].count, BATCH_SIZE_TWO);
        assert.equal(sorted[1].key, EMIT_KEY_B);
        assert.equal(sorted[1].count, 1);
      });

    it('should execute useBroadcast and return ref data',
      async () => {
        const result = await runtime.run(async (ctx) => {
          return ctx.call({
            [PLAN_FIELD.KIND]: PLAN_KIND.USE_BROADCAST,
            [PLAN_FIELD.REF]: BROADCAST_REF,
          });
        }, {queryExecutor: mockExecutor([])});

        assert.equal(result.ref, BROADCAST_REF);
      });
  });

  describe('ctx.out integration', () => {
    it('should return {result, output, telemetry} when ' +
      'ctx.out is used', async () => {
      const res = await runtime.run(async (ctx) => {
        await ctx.out(OUTPUT_VAL);
        await ctx.out(OUTPUT_VAL);
        return 'done';
      });

      assert.equal(res.result, 'done');
      assert.deepEqual(res.output, [OUTPUT_VAL, OUTPUT_VAL]);
      assert.equal(
        res.telemetry[OUT_TELEMETRY_FIELD.ROW_COUNT],
        EXPECTED_ROW_COUNT,
      );
      assert.equal(
        res.telemetry[OUT_TELEMETRY_FIELD.WRITE_COUNT],
        EXPECTED_WRITE_COUNT,
      );
      assert.ok(
        res.telemetry[OUT_TELEMETRY_FIELD.BYTE_COUNT] > 0,
      );
    });
  });

  describe('session and snapshot propagation', () => {
    it('should propagate custom session to context',
      async () => {
        let captured;
        await runtime.run(async (ctx) => {
          captured = ctx;
        }, {session: CUSTOM_SESSION});

        assert.equal(captured.session, CUSTOM_SESSION);
      });

    it('should propagate default session when not specified',
      async () => {
        let captured;
        await runtime.run(async (ctx) => {
          captured = ctx;
        });

        assert.equal(
          captured.session, DEFAULT_RUNTIME_SESSION,
        );
      });

    it('should propagate snapshot mode and ts to context',
      async () => {
        let captured;
        await runtime.run(async (ctx) => {
          captured = ctx;
        }, {
          snapshot: {
            mode: SNAPSHOT_MODE.SNAPSHOT,
            ts: SNAPSHOT_TS,
          },
        });

        assert.equal(
          captured.snapshot.mode, SNAPSHOT_MODE.SNAPSHOT,
        );
        assert.equal(captured.snapshot.ts, SNAPSHOT_TS);
      });

    it('should use default snapshot mode when not specified',
      async () => {
        let captured;
        await runtime.run(async (ctx) => {
          captured = ctx;
        });

        assert.equal(
          captured.snapshot.mode, DEFAULT_SNAPSHOT_MODE,
        );
      });
  });

  describe('error propagation', () => {
    it('should propagate user function errors', async () => {
      await assert.rejects(
        () => runtime.run(async () => {
          throw new Error(ERROR_MSG);
        }),
        (err) => {
          assert.equal(err.message, ERROR_MSG);
          return true;
        },
      );
    });

    it('should cancel token when user function throws',
      async () => {
        let captured;
        try {
          await runtime.run(async (ctx) => {
            captured = ctx;
            throw new Error(ERROR_MSG);
          });
        } catch (_e) {
          // expected
        }
        assert.ok(captured.isCancelled());
      });
  });
});
