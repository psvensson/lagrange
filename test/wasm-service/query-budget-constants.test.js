import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  LOOKUP_MAX_KEYS,
  LOOKUP_MAX_BYTES,
  EMIT_MAX_BYTES,
  BROADCAST_MAX_PAYLOAD_BYTES,
  QUERY_CPU_TIME_LIMIT_MS,
  QUERY_MEMORY_LIMIT_BYTES,
  QUERY_WALL_TIME_LIMIT_MS,
  RESULT_MAX_ROWS,
  MERGE_INPUT_MAX_ROWS,
  RESULT_MAX_BYTES,
  OUT_MAX_BYTES,
  NESTED_MAX_CALLS,
  NESTED_MAX_KEYS,
  NESTED_MAX_BYTES,
  MAX_INFLIGHT,
  DEFAULT_QUERY_BUDGET,
  QUERY_BUDGET_ERROR_MSG,
  QUERY_BUDGET_NORMALIZATION_ERROR_MSG,
  normalizeQueryBudget,
  isNormalizedQueryBudget,
  requireNormalizedQueryBudget,
} from '../../src/wasm-service/query-budget-constants.js';

describe('query-budget-constants', () => {
  describe('individual limit constants', () => {
    it('should have positive lookup max keys', () => {
      assert.equal(typeof LOOKUP_MAX_KEYS, 'number');
      assert.ok(LOOKUP_MAX_KEYS > 0);
    });

    it('should have positive lookup max bytes', () => {
      assert.equal(typeof LOOKUP_MAX_BYTES, 'number');
      assert.ok(LOOKUP_MAX_BYTES > 0);
    });

    it('should have positive emit max bytes', () => {
      assert.equal(typeof EMIT_MAX_BYTES, 'number');
      assert.ok(EMIT_MAX_BYTES > 0);
    });

    it('should have positive broadcast max payload bytes', () => {
      assert.equal(typeof BROADCAST_MAX_PAYLOAD_BYTES, 'number');
      assert.ok(BROADCAST_MAX_PAYLOAD_BYTES > 0);
    });

    it('should have positive CPU time limit', () => {
      assert.equal(typeof QUERY_CPU_TIME_LIMIT_MS, 'number');
      assert.ok(QUERY_CPU_TIME_LIMIT_MS > 0);
    });

    it('should have positive memory limit', () => {
      assert.equal(typeof QUERY_MEMORY_LIMIT_BYTES, 'number');
      assert.ok(QUERY_MEMORY_LIMIT_BYTES > 0);
    });

    it('should have positive wall-time limit', () => {
      assert.equal(typeof QUERY_WALL_TIME_LIMIT_MS, 'number');
      assert.ok(QUERY_WALL_TIME_LIMIT_MS > 0);
    });
  });

  describe('DEFAULT_QUERY_BUDGET', () => {
    it('should be frozen', () => {
      assert.ok(Object.isFrozen(DEFAULT_QUERY_BUDGET));
    });

    it('should match individual constants', () => {
      assert.equal(
        DEFAULT_QUERY_BUDGET.LOOKUP_MAX_KEYS, LOOKUP_MAX_KEYS,
      );
      assert.equal(
        DEFAULT_QUERY_BUDGET.LOOKUP_MAX_BYTES, LOOKUP_MAX_BYTES,
      );
      assert.equal(
        DEFAULT_QUERY_BUDGET.EMIT_MAX_BYTES, EMIT_MAX_BYTES,
      );
      assert.equal(
        DEFAULT_QUERY_BUDGET.BROADCAST_MAX_PAYLOAD_BYTES,
        BROADCAST_MAX_PAYLOAD_BYTES,
      );
      assert.equal(
        DEFAULT_QUERY_BUDGET.CPU_TIME_LIMIT_MS,
        QUERY_CPU_TIME_LIMIT_MS,
      );
      assert.equal(
        DEFAULT_QUERY_BUDGET.MEMORY_LIMIT_BYTES,
        QUERY_MEMORY_LIMIT_BYTES,
      );
      assert.equal(
        DEFAULT_QUERY_BUDGET.WALL_TIME_LIMIT_MS,
        QUERY_WALL_TIME_LIMIT_MS,
      );
    });

    it('should hold every query limit', () => {
      assert.deepEqual(Object.keys(DEFAULT_QUERY_BUDGET), [
        'LOOKUP_MAX_KEYS',
        'LOOKUP_MAX_BYTES',
        'EMIT_MAX_BYTES',
        'BROADCAST_MAX_PAYLOAD_BYTES',
        'CPU_TIME_LIMIT_MS',
        'MEMORY_LIMIT_BYTES',
        'WALL_TIME_LIMIT_MS',
        'RESULT_MAX_ROWS',
        'MERGE_INPUT_MAX_ROWS',
        'RESULT_MAX_BYTES',
        'OUT_MAX_BYTES',
        'NESTED_MAX_CALLS',
        'NESTED_MAX_KEYS',
        'NESTED_MAX_BYTES',
        'MAX_INFLIGHT',
      ]);
      assert.equal(DEFAULT_QUERY_BUDGET.RESULT_MAX_ROWS, RESULT_MAX_ROWS);
      assert.equal(DEFAULT_QUERY_BUDGET.MERGE_INPUT_MAX_ROWS, MERGE_INPUT_MAX_ROWS);
      assert.equal(DEFAULT_QUERY_BUDGET.RESULT_MAX_BYTES, RESULT_MAX_BYTES);
      assert.equal(DEFAULT_QUERY_BUDGET.OUT_MAX_BYTES, OUT_MAX_BYTES);
      assert.equal(DEFAULT_QUERY_BUDGET.NESTED_MAX_CALLS, NESTED_MAX_CALLS);
      assert.equal(DEFAULT_QUERY_BUDGET.NESTED_MAX_KEYS, NESTED_MAX_KEYS);
      assert.equal(DEFAULT_QUERY_BUDGET.NESTED_MAX_BYTES, NESTED_MAX_BYTES);
      assert.equal(DEFAULT_QUERY_BUDGET.MAX_INFLIGHT, MAX_INFLIGHT);
    });
  });

  describe('QUERY_BUDGET_ERROR_MSG', () => {
    it('should be frozen', () => {
      assert.ok(Object.isFrozen(QUERY_BUDGET_ERROR_MSG));
    });

    it('should have string values for all keys', () => {
      for (const [key, value] of
        Object.entries(QUERY_BUDGET_ERROR_MSG)) {
        assert.equal(
          typeof value, 'string',
          `Error message ${key} should be a string`,
        );
      }
    });

    it('should have expected error messages', () => {
      assert.equal(
        Object.keys(QUERY_BUDGET_ERROR_MSG).length, 10,
      );
    });
  });

  describe('normalizeQueryBudget', () => {
    it('returns the frozen default budget when nothing is overridden', () => {
      const normalized = normalizeQueryBudget();
      assert.ok(Object.isFrozen(normalized));
      assert.deepEqual(normalized, DEFAULT_QUERY_BUDGET);
      assert.ok(isNormalizedQueryBudget(normalized));
    });

    it('applies an override for each of the 14 limits by its canonical name', () => {
      for (const field of Object.keys(DEFAULT_QUERY_BUDGET)) {
        const normalized = normalizeQueryBudget({[field]: 42});
        assert.deepEqual(normalized, {...DEFAULT_QUERY_BUDGET, [field]: 42});
        assert.deepEqual(Object.keys(normalized), Object.keys(DEFAULT_QUERY_BUDGET));
        assert.deepEqual(normalizeQueryBudget(normalized), normalized);
      }
    });

    it('refuses unknown fields instead of defaulting them', () => {
      for (const field of [
        'resultMaxRows',
        'resultMaxRow',
        'RESULT_MAX_ROW',
        'result_max_rows',
        'lookupMaxKeys',
        'wallTimeLimitMs',
      ]) {
        assert.throws(
          () => normalizeQueryBudget({[field]: 5}),
          (err) => err.message ===
            `${QUERY_BUDGET_NORMALIZATION_ERROR_MSG.UNKNOWN_BUDGET_FIELD}: ${field}`,
        );
      }
    });

    it('refuses limits that are not non-negative safe integers', () => {
      for (const limit of ['7', -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY,
        Number.MAX_SAFE_INTEGER + 1, null, undefined, true, 7n, {}]) {
        assert.throws(
          () => normalizeQueryBudget({WALL_TIME_LIMIT_MS: limit}),
          (err) => err.message.startsWith(
            `${QUERY_BUDGET_NORMALIZATION_ERROR_MSG.INVALID_BUDGET_LIMIT}: ` +
              'WALL_TIME_LIMIT_MS=',
          ),
        );
      }
      assert.equal(normalizeQueryBudget({WALL_TIME_LIMIT_MS: 0}).WALL_TIME_LIMIT_MS, 0);
    });

    it('refuses overrides that are not a plain object', () => {
      class Overrides {}
      for (const overrides of [null, [], 'x', 5, new Map(), new Overrides()]) {
        assert.throws(
          () => normalizeQueryBudget(overrides),
          (err) => err.message ===
            QUERY_BUDGET_NORMALIZATION_ERROR_MSG.INVALID_BUDGET_OBJECT,
        );
      }
    });
  });

  describe('requireNormalizedQueryBudget', () => {
    it('returns a normalized budget unchanged', () => {
      const budget = normalizeQueryBudget({RESULT_MAX_ROWS: 3});
      assert.equal(requireNormalizedQueryBudget(budget), budget);
      assert.equal(
        requireNormalizedQueryBudget(DEFAULT_QUERY_BUDGET),
        DEFAULT_QUERY_BUDGET,
      );
    });

    it('refuses partial, unfrozen, aliased or invalid budgets', () => {
      const budget = normalizeQueryBudget();
      const {RESULT_MAX_ROWS: omitted, ...partial} = budget;
      assert.equal(omitted, RESULT_MAX_ROWS);
      for (const candidate of [
        undefined,
        null,
        {},
        Object.freeze({RESULT_MAX_ROWS: 5}),
        Object.freeze(partial),
        {...budget},
        Object.freeze({...budget, resultMaxRows: 5}),
        Object.freeze({...partial, resultMaxRows: RESULT_MAX_ROWS}),
        Object.freeze({...budget, RESULT_MAX_ROWS: '5'}),
        Object.freeze({...budget, RESULT_MAX_ROWS: -1}),
      ]) {
        assert.equal(isNormalizedQueryBudget(candidate), false);
        assert.throws(
          () => requireNormalizedQueryBudget(candidate),
          (err) => err.message ===
            QUERY_BUDGET_NORMALIZATION_ERROR_MSG.BUDGET_NOT_NORMALIZED,
        );
      }
    });
  });
});
