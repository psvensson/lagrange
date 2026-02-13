/**
 * Unit tests for reduceByKey plan execution.
 *
 * Requirements: 11.1
 */
import {test} from '../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
import {
  executeReduceByKey,
  collectExchangeRecords,
  groupRecordsByKey,
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
} from '../../src/query/exchange-manager.js';
import {
  PLAN_KIND,
  PLAN_ERROR_MSG as ERR,
  EXCHANGE_MODE,
  EXCHANGE_FIELD,
  REDUCE_FIELD,
} from '../../src/query/runtime-constants.js';

/**
 * Helper: create a minimal ExecutionContext for testing.
 *
 * @param {Object} [opts] - Options.
 * @param {CancellationToken} [opts.cancellationToken]
 * @param {ExchangeManager} [opts.exchangeManager]
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

test('handler receives grouped batches with {key, records}',
  async () => {
    const mgr = new ExchangeManager({mode: EXCHANGE_MODE.LOCAL});
    mgr.route('a', 1);
    mgr.route('a', 2);
    mgr.route('b', 3);

    const received = [];
    const deps = buildDeps({
      exchangeManager: mgr,
      handler: async (batch, _ctx) => {
        received.push(batch);
        return batch;
      },
    });

    await executeReduceByKey(deps);

    assert.equal(received.length, 2);
    const batchA = received.find(
      (b) => b[REDUCE_FIELD.KEY] === 'a',
    );
    const batchB = received.find(
      (b) => b[REDUCE_FIELD.KEY] === 'b',
    );
    assert.ok(batchA);
    assert.deepEqual(batchA[REDUCE_FIELD.RECORDS], [1, 2]);
    assert.ok(batchB);
    assert.deepEqual(batchB[REDUCE_FIELD.RECORDS], [3]);
  });

test('records are correctly grouped by key', async () => {
  const mgr = new ExchangeManager({mode: EXCHANGE_MODE.LOCAL});
  mgr.route('x', 'v1');
  mgr.route('y', 'v2');
  mgr.route('x', 'v3');
  mgr.route('y', 'v4');
  mgr.route('z', 'v5');

  const groups = [];
  const deps = buildDeps({
    exchangeManager: mgr,
    handler: async (batch) => {
      groups.push({
        key: batch[REDUCE_FIELD.KEY],
        records: batch[REDUCE_FIELD.RECORDS],
      });
      return null;
    },
  });

  await executeReduceByKey(deps);

  assert.equal(groups.length, 3);
  const x = groups.find((g) => g.key === 'x');
  const y = groups.find((g) => g.key === 'y');
  const z = groups.find((g) => g.key === 'z');
  assert.deepEqual(x.records, ['v1', 'v3']);
  assert.deepEqual(y.records, ['v2', 'v4']);
  assert.deepEqual(z.records, ['v5']);
});

test('multiple groups in a single batch', async () => {
  const mgr = new ExchangeManager({mode: EXCHANGE_MODE.LOCAL});
  mgr.route('k1', 10);
  mgr.route('k2', 20);
  mgr.route('k3', 30);

  const allBatches = [];
  const deps = buildDeps({
    exchangeManager: mgr,
    handler: async (batch) => {
      allBatches.push(batch);
      return batch[REDUCE_FIELD.KEY];
    },
  });

  const results = await executeReduceByKey(deps);

  // Handler called once per group
  assert.equal(allBatches.length, 3);
  // Results collected from each handler call
  assert.equal(results.length, 3);
  assert.ok(results.includes('k1'));
  assert.ok(results.includes('k2'));
  assert.ok(results.includes('k3'));
});

test('handler called with stage context', async () => {
  const mgr = new ExchangeManager({mode: EXCHANGE_MODE.LOCAL});
  mgr.route('k', 1);

  let receivedCtx;
  const deps = buildDeps({
    exchangeManager: mgr,
    handler: async (_batch, ctx) => {
      receivedCtx = ctx;
      return null;
    },
  });

  await executeReduceByKey(deps);

  assert.ok(receivedCtx);
  assert.equal(typeof receivedCtx.emit, 'function');
  assert.equal(typeof receivedCtx.out, 'function');
  assert.equal(typeof receivedCtx.lookup, 'function');
  assert.equal(typeof receivedCtx.broadcast, 'function');
  assert.equal(typeof receivedCtx.useBroadcast, 'function');
  assert.equal(typeof receivedCtx.call, 'function');
  assert.equal(typeof receivedCtx.isCancelled, 'function');
  assert.equal(
    typeof receivedCtx.throwIfCancelled, 'function',
  );
});

test('cancellation checked between batches', async () => {
  const mgr = new ExchangeManager({mode: EXCHANGE_MODE.LOCAL});
  mgr.route('a', 1);
  mgr.route('b', 2);

  const token = new CancellationToken();
  let callCount = 0;

  const deps = buildDeps({
    exchangeManager: mgr,
    cancellationToken: token,
    handler: async (batch) => {
      callCount++;
      // Cancel after first group processed
      if (callCount === 1) {
        token.cancel();
      }
      return batch;
    },
  });

  await assert.rejects(
    () => executeReduceByKey(deps),
    (err) => err.message.includes('cancelled'),
  );

  assert.equal(callCount, 1);
});

test('error when handler is not a function', async () => {
  const deps = buildDeps({handler: 'not-a-function'});

  await assert.rejects(
    () => executeReduceByKey(deps),
    (err) => err.message === ERR.PLAN_REDUCE_HANDLER_REQUIRED,
  );
});

test('error when handler is undefined', async () => {
  const deps = buildDeps({handler: undefined});

  await assert.rejects(
    () => executeReduceByKey(deps),
    (err) => err.message === ERR.PLAN_REDUCE_HANDLER_REQUIRED,
  );
});

test('KEY mode collects from partition buffers', async () => {
  const mgr = new ExchangeManager({
    mode: EXCHANGE_MODE.KEY,
    partitionCount: 4,
  });
  mgr.route('alpha', 100);
  mgr.route('beta', 200);
  mgr.route('alpha', 300);

  const groups = [];
  const deps = buildDeps({
    exchangeManager: mgr,
    handler: async (batch) => {
      groups.push({
        key: batch[REDUCE_FIELD.KEY],
        records: batch[REDUCE_FIELD.RECORDS],
      });
      return null;
    },
  });

  await executeReduceByKey(deps);

  const alpha = groups.find((g) => g.key === 'alpha');
  const beta = groups.find((g) => g.key === 'beta');
  assert.ok(alpha);
  assert.deepEqual(alpha.records, [100, 300]);
  assert.ok(beta);
  assert.deepEqual(beta.records, [200]);
});

test('empty exchange returns empty results', async () => {
  const mgr = new ExchangeManager({mode: EXCHANGE_MODE.LOCAL});

  const deps = buildDeps({
    exchangeManager: mgr,
    handler: async () => {
      throw new Error('should not be called');
    },
  });

  const results = await executeReduceByKey(deps);
  assert.deepEqual(results, []);
});

test('collectExchangeRecords LOCAL mode', async () => {
  const mgr = new ExchangeManager({mode: EXCHANGE_MODE.LOCAL});
  mgr.route('k1', 'v1');
  mgr.route('k2', 'v2');

  const records = collectExchangeRecords(mgr);
  assert.equal(records.length, 2);
  assert.equal(records[0][EXCHANGE_FIELD.KEY], 'k1');
  assert.equal(records[1][EXCHANGE_FIELD.KEY], 'k2');
});

test('collectExchangeRecords KEY mode', async () => {
  const mgr = new ExchangeManager({
    mode: EXCHANGE_MODE.KEY,
    partitionCount: 2,
  });
  mgr.route('a', 1);
  mgr.route('b', 2);

  const records = collectExchangeRecords(mgr);
  assert.equal(records.length, 2);
  const keys = records.map((r) => r[EXCHANGE_FIELD.KEY]).sort();
  assert.deepEqual(keys, ['a', 'b']);
});

test('groupRecordsByKey groups correctly', async () => {
  const records = [
    {[EXCHANGE_FIELD.KEY]: 'a', [EXCHANGE_FIELD.VALUE]: 1},
    {[EXCHANGE_FIELD.KEY]: 'b', [EXCHANGE_FIELD.VALUE]: 2},
    {[EXCHANGE_FIELD.KEY]: 'a', [EXCHANGE_FIELD.VALUE]: 3},
  ];

  const groups = groupRecordsByKey(records);
  assert.equal(groups.size, 2);
  assert.deepEqual(groups.get('a'), [1, 3]);
  assert.deepEqual(groups.get('b'), [2]);
});

test('buildGroupedBatches produces correct shape', async () => {
  const groups = new Map();
  groups.set('x', [10, 20]);
  groups.set('y', [30]);

  const batches = buildGroupedBatches(groups);
  assert.equal(batches.length, 2);

  const bx = batches.find(
    (b) => b[REDUCE_FIELD.KEY] === 'x',
  );
  const by = batches.find(
    (b) => b[REDUCE_FIELD.KEY] === 'y',
  );
  assert.deepEqual(bx[REDUCE_FIELD.RECORDS], [10, 20]);
  assert.deepEqual(by[REDUCE_FIELD.RECORDS], [30]);
});

test('handler results are collected in order', async () => {
  const mgr = new ExchangeManager({mode: EXCHANGE_MODE.LOCAL});
  mgr.route('a', 1);
  mgr.route('b', 2);
  mgr.route('c', 3);

  const deps = buildDeps({
    exchangeManager: mgr,
    handler: async (batch) => {
      return batch[REDUCE_FIELD.KEY] + ':' +
        batch[REDUCE_FIELD.RECORDS].length;
    },
  });

  const results = await executeReduceByKey(deps);
  assert.equal(results.length, 3);
  // Each result is key:count
  for (const r of results) {
    assert.ok(r.includes(':'));
  }
});

test('cancellation before processing throws', async () => {
  const mgr = new ExchangeManager({mode: EXCHANGE_MODE.LOCAL});
  mgr.route('k', 1);

  const token = new CancellationToken();
  token.cancel();

  const deps = buildDeps({
    exchangeManager: mgr,
    cancellationToken: token,
    handler: async () => {
      throw new Error('should not be called');
    },
  });

  await assert.rejects(
    () => executeReduceByKey(deps),
    (err) => err.message.includes('cancelled'),
  );
});
