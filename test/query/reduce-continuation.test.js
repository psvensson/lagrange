/**
 * Unit tests for reduceByKey continuation-token handling
 * and group/batch limit enforcement.
 *
 * Requirements: 11.2, 11.3, 11.4, 11.5
 */
import {test} from '../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
import {
  executeReduceByKey,
  buildGroupedBatches,
} from '../../src/query/call-plan.js';
import {
  CancellationToken,
} from '../../src/query/cancellation-token.js';
import {
  BudgetEnforcer,
} from '../../src/query/budget-enforcer.js';
import {
  LineageTracker,
} from '../../src/query/lineage-tracker.js';
import {
  ExecutionContext,
} from '../../src/query/execution-context.js';
import {
  ExchangeManager,
} from '../../src/query/distributed/exchange-manager.js';
import {
  PLAN_KIND,
  EXCHANGE_MODE,
  REDUCE_FIELD,
  DEFAULT_MAX_RECORDS_PER_GROUP,
  DEFAULT_MAX_GROUPS_PER_BATCH,
} from '../../src/query/runtime-constants.js';

/**
 * Helper: create a minimal ExecutionContext for testing.
 *
 * @param {Object} [opts] - Options.
 * @return {ExecutionContext}
 */
function createTestContext(opts = {}) {
  const token = opts.cancellationToken ??
    new CancellationToken();
  const exchangeManager = opts.exchangeManager ??
    new ExchangeManager();
  return new ExecutionContext({
    session: 'test-session',
    snapshot: {mode: 'readCommitted'},
    budgetEnforcer: new BudgetEnforcer(),
    cancellationToken: token,
    lineageTracker: new LineageTracker('test-q'),
    queryExecutor: async () => ({rows: []}),
    exchangeManager,
  });
}

/**
 * Helper: build standard deps for executeReduceByKey.
 *
 * @param {Object} [overrides] - Override fields.
 * @return {Object} Deps object.
 */
function buildDeps(overrides = {}) {
  const token = overrides.cancellationToken ??
    new CancellationToken();
  const exchangeManager = overrides.exchangeManager ??
    new ExchangeManager();
  const ctx = overrides.executionContext ??
    createTestContext({
      cancellationToken: token,
      exchangeManager,
    });
  return {
    plan: {kind: PLAN_KIND.REDUCE_BY_KEY},
    params: [],
    handler: overrides.handler ?? (async (batch) => batch),
    opts: overrides.opts,
    queryExecutor: async () => ({rows: []}),
    cancellationToken: token,
    executionContext: ctx,
    ...overrides,
  };
}

// --- buildGroupedBatches continuation tests ---

test('group under limit has no continuation token',
  async () => {
    const groups = new Map();
    groups.set('a', [1, 2, 3]);

    const batches = buildGroupedBatches(groups, 5);

    assert.equal(batches.length, 1);
    assert.equal(batches[0][REDUCE_FIELD.KEY], 'a');
    assert.deepEqual(batches[0][REDUCE_FIELD.RECORDS],
      [1, 2, 3]);
    assert.equal(batches[0][REDUCE_FIELD.CONTINUATION],
      undefined);
  });

test('group at exact limit has no continuation token',
  async () => {
    const groups = new Map();
    groups.set('k', [1, 2, 3, 4, 5]);

    const batches = buildGroupedBatches(groups, 5);

    assert.equal(batches.length, 1);
    assert.equal(batches[0][REDUCE_FIELD.CONTINUATION],
      undefined);
  });

test('group exceeding limit splits into chunks with tokens',
  async () => {
    const records = [1, 2, 3, 4, 5, 6, 7];
    const groups = new Map();
    groups.set('g', records);

    const batches = buildGroupedBatches(groups, 3);

    // 7 records / 3 per chunk = 3 chunks (3, 3, 1)
    assert.equal(batches.length, 3);

    // First chunk: continuation present
    assert.equal(batches[0][REDUCE_FIELD.KEY], 'g');
    assert.deepEqual(batches[0][REDUCE_FIELD.RECORDS],
      [1, 2, 3]);
    assert.equal(batches[0][REDUCE_FIELD.CONTINUATION],
      'g-chunk-0');

    // Second chunk: continuation present
    assert.equal(batches[1][REDUCE_FIELD.KEY], 'g');
    assert.deepEqual(batches[1][REDUCE_FIELD.RECORDS],
      [4, 5, 6]);
    assert.equal(batches[1][REDUCE_FIELD.CONTINUATION],
      'g-chunk-1');

    // Last chunk: no continuation
    assert.equal(batches[2][REDUCE_FIELD.KEY], 'g');
    assert.deepEqual(batches[2][REDUCE_FIELD.RECORDS], [7]);
    assert.equal(batches[2][REDUCE_FIELD.CONTINUATION],
      undefined);
  });

test('last chunk never has continuation token', async () => {
  const groups = new Map();
  groups.set('x', [1, 2, 3, 4]);

  const batches = buildGroupedBatches(groups, 2);

  // 4 records / 2 = 2 chunks exactly
  assert.equal(batches.length, 2);
  assert.equal(batches[0][REDUCE_FIELD.CONTINUATION],
    'x-chunk-0');
  assert.equal(batches[1][REDUCE_FIELD.CONTINUATION],
    undefined);
});

test('mixed groups: some need continuation, some do not',
  async () => {
    const groups = new Map();
    groups.set('small', [1, 2]);
    groups.set('big', [10, 20, 30, 40, 50]);

    const batches = buildGroupedBatches(groups, 3);

    // small: 1 batch (no continuation)
    // big: 2 batches (5/3 = chunk of 3 + chunk of 2)
    assert.equal(batches.length, 3);

    const smallBatches = batches.filter(
      (b) => b[REDUCE_FIELD.KEY] === 'small',
    );
    const bigBatches = batches.filter(
      (b) => b[REDUCE_FIELD.KEY] === 'big',
    );

    assert.equal(smallBatches.length, 1);
    assert.equal(smallBatches[0][REDUCE_FIELD.CONTINUATION],
      undefined);

    assert.equal(bigBatches.length, 2);
    assert.equal(bigBatches[0][REDUCE_FIELD.CONTINUATION],
      'big-chunk-0');
    assert.equal(bigBatches[1][REDUCE_FIELD.CONTINUATION],
      undefined);
  });

test('continuation token format is key-chunk-index',
  async () => {
    const groups = new Map();
    groups.set('myKey', Array.from({length: 10}, (_, i) => i));

    const batches = buildGroupedBatches(groups, 3);

    // 10 / 3 = 4 chunks (3, 3, 3, 1)
    assert.equal(batches.length, 4);
    assert.equal(batches[0][REDUCE_FIELD.CONTINUATION],
      'myKey-chunk-0');
    assert.equal(batches[1][REDUCE_FIELD.CONTINUATION],
      'myKey-chunk-1');
    assert.equal(batches[2][REDUCE_FIELD.CONTINUATION],
      'myKey-chunk-2');
    assert.equal(batches[3][REDUCE_FIELD.CONTINUATION],
      undefined);
  });

test('all records delivered across chunks (no data loss)',
  async () => {
    const original = Array.from({length: 25}, (_, i) => i);
    const groups = new Map();
    groups.set('k', original);

    const batches = buildGroupedBatches(groups, 7);

    const allRecords = batches.flatMap(
      (b) => b[REDUCE_FIELD.RECORDS],
    );
    assert.deepEqual(allRecords, original);
  });

test('default maxRecordsPerGroup uses constant', async () => {
  const records = Array.from(
    {length: DEFAULT_MAX_RECORDS_PER_GROUP + 1},
    (_, i) => i,
  );
  const groups = new Map();
  groups.set('k', records);

  // No explicit limit — uses default
  const batches = buildGroupedBatches(groups);

  assert.equal(batches.length, 2);
  assert.equal(
    batches[0][REDUCE_FIELD.RECORDS].length,
    DEFAULT_MAX_RECORDS_PER_GROUP,
  );
  assert.equal(batches[1][REDUCE_FIELD.RECORDS].length, 1);
  assert.ok(batches[0][REDUCE_FIELD.CONTINUATION]);
  assert.equal(batches[1][REDUCE_FIELD.CONTINUATION],
    undefined);
});

// --- executeReduceByKey with continuation via opts ---

test('handler receives all chunks in order', async () => {
  const mgr = new ExchangeManager(
    {mode: EXCHANGE_MODE.LOCAL},
  );
  for (let i = 0; i < 7; i++) {
    mgr.route('g', i);
  }

  const received = [];
  const deps = buildDeps({
    exchangeManager: mgr,
    opts: {maxRecordsPerGroup: 3},
    handler: async (batch) => {
      received.push(batch);
      return batch;
    },
  });

  await executeReduceByKey(deps);

  assert.equal(received.length, 3);
  assert.deepEqual(
    received[0][REDUCE_FIELD.RECORDS], [0, 1, 2],
  );
  assert.deepEqual(
    received[1][REDUCE_FIELD.RECORDS], [3, 4, 5],
  );
  assert.deepEqual(
    received[2][REDUCE_FIELD.RECORDS], [6],
  );
});

test('custom maxRecordsPerGroup via opts', async () => {
  const mgr = new ExchangeManager(
    {mode: EXCHANGE_MODE.LOCAL},
  );
  for (let i = 0; i < 5; i++) {
    mgr.route('k', i);
  }

  const received = [];
  const deps = buildDeps({
    exchangeManager: mgr,
    opts: {maxRecordsPerGroup: 2},
    handler: async (batch) => {
      received.push(batch);
      return null;
    },
  });

  await executeReduceByKey(deps);

  // 5 / 2 = 3 chunks
  assert.equal(received.length, 3);
  assert.ok(received[0][REDUCE_FIELD.CONTINUATION]);
  assert.ok(received[1][REDUCE_FIELD.CONTINUATION]);
  assert.equal(received[2][REDUCE_FIELD.CONTINUATION],
    undefined);
});

test('custom maxGroupsPerBatch via opts', async () => {
  const mgr = new ExchangeManager(
    {mode: EXCHANGE_MODE.LOCAL},
  );
  mgr.route('a', 1);
  mgr.route('b', 2);
  mgr.route('c', 3);
  mgr.route('d', 4);
  mgr.route('e', 5);

  const received = [];
  const deps = buildDeps({
    exchangeManager: mgr,
    opts: {maxGroupsPerBatch: 2},
    handler: async (batch) => {
      received.push(batch);
      return batch[REDUCE_FIELD.KEY];
    },
  });

  const results = await executeReduceByKey(deps);

  // 5 groups, all delivered
  assert.equal(received.length, 5);
  assert.equal(results.length, 5);
});

test('default maxGroupsPerBatch uses constant', async () => {
  assert.equal(DEFAULT_MAX_GROUPS_PER_BATCH, 100);
});

test('cancellation checked between batch slices', async () => {
  const mgr = new ExchangeManager(
    {mode: EXCHANGE_MODE.LOCAL},
  );
  // Create 4 groups
  mgr.route('a', 1);
  mgr.route('b', 2);
  mgr.route('c', 3);
  mgr.route('d', 4);

  const token = new CancellationToken();
  let callCount = 0;

  const deps = buildDeps({
    exchangeManager: mgr,
    cancellationToken: token,
    opts: {maxGroupsPerBatch: 2},
    handler: async (batch) => {
      callCount++;
      // Cancel after 2nd handler call
      if (callCount === 2) {
        token.cancel();
      }
      return batch;
    },
  });

  await assert.rejects(
    () => executeReduceByKey(deps),
    (err) => err.message.includes('cancelled'),
  );

  assert.equal(callCount, 2);
});
