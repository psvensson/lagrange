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
  DEFAULT_QUERY_BUDGET,
  QB_FIELD,
  QUERY_BUDGET_ERROR_MSG,
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
        DEFAULT_QUERY_BUDGET.LOOKUP_MAX_KEYS, LOOKUP_MAX_KEYS
      );
      assert.equal(
        DEFAULT_QUERY_BUDGET.LOOKUP_MAX_BYTES, LOOKUP_MAX_BYTES
      );
      assert.equal(
        DEFAULT_QUERY_BUDGET.EMIT_MAX_BYTES, EMIT_MAX_BYTES
      );
      assert.equal(
        DEFAULT_QUERY_BUDGET.BROADCAST_MAX_PAYLOAD_BYTES,
        BROADCAST_MAX_PAYLOAD_BYTES
      );
      assert.equal(
        DEFAULT_QUERY_BUDGET.CPU_TIME_LIMIT_MS,
        QUERY_CPU_TIME_LIMIT_MS
      );
      assert.equal(
        DEFAULT_QUERY_BUDGET.MEMORY_LIMIT_BYTES,
        QUERY_MEMORY_LIMIT_BYTES
      );
      assert.equal(
        DEFAULT_QUERY_BUDGET.WALL_TIME_LIMIT_MS,
        QUERY_WALL_TIME_LIMIT_MS
      );
    });

    it('should have exactly nine keys', () => {
      assert.equal(
        Object.keys(DEFAULT_QUERY_BUDGET).length, 9
      );
    });
  });

  describe('QB_FIELD', () => {
    it('should be frozen', () => {
      assert.ok(Object.isFrozen(QB_FIELD));
    });

    it('should have all camelCase field names', () => {
      assert.equal(QB_FIELD.LOOKUP_MAX_KEYS, 'lookupMaxKeys');
      assert.equal(QB_FIELD.LOOKUP_MAX_BYTES, 'lookupMaxBytes');
      assert.equal(QB_FIELD.EMIT_MAX_BYTES, 'emitMaxBytes');
      assert.equal(
        QB_FIELD.BROADCAST_MAX_PAYLOAD_BYTES,
        'broadcastMaxPayloadBytes'
      );
      assert.equal(QB_FIELD.CPU_TIME_LIMIT_MS, 'cpuTimeLimitMs');
      assert.equal(
        QB_FIELD.MEMORY_LIMIT_BYTES, 'memoryLimitBytes'
      );
      assert.equal(
        QB_FIELD.WALL_TIME_LIMIT_MS, 'wallTimeLimitMs'
      );
    });

    it('should have exactly nine fields', () => {
      assert.equal(Object.keys(QB_FIELD).length, 9);
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
          `Error message ${key} should be a string`
        );
      }
    });

    it('should have exactly nine error messages', () => {
      assert.equal(
        Object.keys(QUERY_BUDGET_ERROR_MSG).length, 9
      );
    });
  });
});
