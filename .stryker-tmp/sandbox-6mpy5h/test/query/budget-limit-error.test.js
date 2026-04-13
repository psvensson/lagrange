// @ts-nocheck
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  BudgetLimitError,
  BUDGET_CATEGORY,
} from '../../src/query/budget-limit-error.js';
import {BaseError} from '../../src/utils/base-error.js';

describe('BudgetLimitError', () => {
  it('should extend BaseError', () => {
    const err = new BudgetLimitError('test', {
      category: BUDGET_CATEGORY.CPU_TIME,
      limit: 100,
      usage: 150,
    });
    assert.ok(err instanceof BaseError);
    assert.ok(err instanceof Error);
  });

  it('should set name to BudgetLimitError', () => {
    const err = new BudgetLimitError('test', {
      category: BUDGET_CATEGORY.MEMORY,
      limit: 64,
      usage: 65,
    });
    assert.equal(err.name, 'BudgetLimitError');
  });

  it('should carry category, limit, and usage', () => {
    const err = new BudgetLimitError('over limit', {
      category: BUDGET_CATEGORY.EMIT_BYTES,
      limit: 200,
      usage: 201,
    });
    assert.equal(err.message, 'over limit');
    assert.equal(err.category, BUDGET_CATEGORY.EMIT_BYTES);
    assert.equal(err.limit, 200);
    assert.equal(err.usage, 201);
  });

  it('should include metadata in context', () => {
    const err = new BudgetLimitError('exceeded', {
      category: BUDGET_CATEGORY.LOOKUP_KEYS,
      limit: 1000,
      usage: 1001,
    });
    assert.equal(err.context.component, 'BudgetEnforcer');
    assert.equal(err.context.operation, 'budgetCheck');
    assert.equal(
      err.context.metadata.category,
      BUDGET_CATEGORY.LOOKUP_KEYS,
    );
    assert.equal(err.context.metadata.limit, 1000);
    assert.equal(err.context.metadata.usage, 1001);
  });

  it('should serialize to JSON with all fields', () => {
    const err = new BudgetLimitError('json test', {
      category: BUDGET_CATEGORY.WALL_TIME,
      limit: 30000,
      usage: 31000,
    });
    const json = err.toJSON();
    assert.equal(json.name, 'BudgetLimitError');
    assert.equal(json.message, 'json test');
    assert.ok(json.context);
    assert.ok(json.stack);
  });
});

describe('BUDGET_CATEGORY', () => {
  it('should be frozen', () => {
    assert.ok(Object.isFrozen(BUDGET_CATEGORY));
  });

  it('should include required categories', () => {
    const keys = Object.keys(BUDGET_CATEGORY);
    assert.ok(keys.includes('CPU_TIME'));
    assert.ok(keys.includes('MEMORY'));
    assert.ok(keys.includes('WALL_TIME'));
    assert.ok(keys.includes('LOOKUP_KEYS'));
    assert.ok(keys.includes('LOOKUP_BYTES'));
    assert.ok(keys.includes('EMIT_BYTES'));
    assert.ok(keys.includes('BROADCAST_BYTES'));
  });

  it('should have string values for all keys', () => {
    for (const val of Object.values(BUDGET_CATEGORY)) {
      assert.equal(typeof val, 'string');
    }
  });
});
