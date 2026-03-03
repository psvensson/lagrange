/**
 * Tests for CallbackStageExecutor — batch/stage mode execution.
 *
 * Verifies that callbacks run once per partition batch, not
 * per-row, and that results are collected per partition.
 *
 * Requirements: 4.1, 5.1
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  CallbackStageExecutor,
  groupRowsByPartition,
  validateBatches,
  createDefaultContext,
} from '../../src/query/callback/callback-stage-executor.js';
import {
  STAGE_STATE,
  STAGE_ERROR_MSG,
} from '../../src/query/callback/callback-stage-constants.js';
import {
  CancellationToken,
} from '../../src/query/cancellation-token.js';
import {
  GUARDRAIL_ERROR_MSG as ERR,
} from '../../src/query/guardrail-constants.js';

// --- groupRowsByPartition ---

test('groupRowsByPartition - groups rows by partition', (t) => {
  const rows = [
    {partitionId: 'p1', value: 1},
    {partitionId: 'p2', value: 2},
    {partitionId: 'p1', value: 3},
  ];
  const batches = groupRowsByPartition(rows, 'partitionId');

  t.equal(batches.length, 2);
  const p1 = batches.find((b) => b.partitionId === 'p1');
  const p2 = batches.find((b) => b.partitionId === 'p2');
  t.equal(p1.rows.length, 2);
  t.equal(p1.rowCount, 2);
  t.equal(p2.rows.length, 1);
  t.equal(p2.rowCount, 1);
  t.end();
});

test('groupRowsByPartition - empty rows returns empty', (t) => {
  const batches = groupRowsByPartition([], 'partitionId');
  t.equal(batches.length, 0);
  t.end();
});

// --- validateBatches ---

test('validateBatches - valid batches', (t) => {
  const batches = [
    {partitionId: 'p1', rows: [{v: 1}], rowCount: 1},
  ];
  const result = validateBatches(batches);
  t.ok(result.valid);
  t.equal(result.errors.length, 0);
  t.end();
});

test('validateBatches - null batches', (t) => {
  const result = validateBatches(null);
  t.notOk(result.valid);
  t.ok(result.errors.includes(STAGE_ERROR_MSG.BATCHES_REQUIRED));
  t.end();
});

test('validateBatches - non-array batches', (t) => {
  const result = validateBatches('not-array');
  t.notOk(result.valid);
  t.ok(result.errors.includes(
    STAGE_ERROR_MSG.BATCHES_MUST_BE_ARRAY,
  ));
  t.end();
});

test('validateBatches - missing partitionId', (t) => {
  const result = validateBatches([{rows: []}]);
  t.notOk(result.valid);
  t.ok(result.errors.includes(
    STAGE_ERROR_MSG.BATCH_MISSING_PARTITION_ID,
  ));
  t.end();
});

test('validateBatches - missing rows', (t) => {
  const result = validateBatches([{partitionId: 'p1'}]);
  t.notOk(result.valid);
  t.ok(result.errors.includes(
    STAGE_ERROR_MSG.BATCH_MISSING_ROWS,
  ));
  t.end();
});

// --- createDefaultContext ---

test('createDefaultContext - has required primitives', (t) => {
  const ctx = createDefaultContext('p1');
  t.equal(ctx.partitionId, 'p1');
  t.equal(typeof ctx.emit, 'function');
  t.equal(typeof ctx.lookup, 'function');
  t.equal(typeof ctx.broadcast, 'function');
  t.equal(typeof ctx.useBroadcast, 'function');
  t.ok(Object.isFrozen(ctx));
  t.end();
});

// --- CallbackStageExecutor ---

test('CallbackStageExecutor - throws without callback', (t) => {
  t.throws(
    () => new CallbackStageExecutor(),
    /Callback function is required/,
  );
  t.end();
});

test('CallbackStageExecutor - throws on non-function', (t) => {
  t.throws(
    () => new CallbackStageExecutor({callback: 'not-fn'}),
    /Callback function is required/,
  );
  t.end();
});

test('CallbackStageExecutor - executes once per batch', async (t) => {
  const invocations = [];
  const cb = async (ctx, batch) => {
    invocations.push(batch.partitionId);
    return batch.rows.map((r) => ({...r, processed: true}));
  };

  const executor = new CallbackStageExecutor({callback: cb});
  const batches = [
    {partitionId: 'p1', rows: [{v: 1}], rowCount: 1},
    {partitionId: 'p2', rows: [{v: 2}, {v: 3}], rowCount: 2},
  ];

  const result = await executor.execute(batches);

  t.equal(invocations.length, 2, 'callback invoked per batch');
  t.same(invocations, ['p1', 'p2']);
  t.equal(result.state, STAGE_STATE.COMPLETED);
  t.equal(result.totalPartitions, 2);
  t.equal(result.failedPartitions, 0);
  t.equal(result.partitionResults.length, 2);
  t.equal(result.partitionResults[0].rowCount, 1);
  t.equal(result.partitionResults[1].rowCount, 2);
  t.end();
});

test('CallbackStageExecutor - handles callback failure', async (t) => {
  const cb = async (_ctx, batch) => {
    if (batch.partitionId === 'p2') {
      throw new Error('partition unavailable');
    }
    return batch.rows;
  };

  const executor = new CallbackStageExecutor({callback: cb});
  const batches = [
    {partitionId: 'p1', rows: [{v: 1}], rowCount: 1},
    {partitionId: 'p2', rows: [{v: 2}], rowCount: 1},
  ];

  const result = await executor.execute(batches);

  t.equal(result.state, STAGE_STATE.FAILED);
  t.equal(result.failedPartitions, 1);
  t.equal(result.partitionResults[0].state, STAGE_STATE.COMPLETED);
  t.equal(result.partitionResults[1].state, STAGE_STATE.FAILED);
  t.ok(result.partitionResults[1].error.includes('unavailable'));
  t.end();
});

test('CallbackStageExecutor - empty batches succeeds', async (t) => {
  const cb = async () => [];
  const executor = new CallbackStageExecutor({callback: cb});

  const result = await executor.execute([]);

  t.equal(result.state, STAGE_STATE.COMPLETED);
  t.equal(result.totalPartitions, 0);
  t.equal(result.partitionResults.length, 0);
  t.end();
});

test('CallbackStageExecutor - rejects invalid batches', async (t) => {
  const cb = async () => [];
  const executor = new CallbackStageExecutor({callback: cb});

  await t.rejects(
    executor.execute(null),
    /Partition batches array is required/,
  );
  t.end();
});

test('CallbackStageExecutor - uses contextFactory', async (t) => {
  const contexts = [];
  const factory = {
    createContext(partitionId) {
      const ctx = {partitionId, custom: true};
      contexts.push(ctx);
      return ctx;
    },
  };

  const cb = async (ctx, batch) => {
    t.ok(ctx.custom, 'received custom context');
    return batch.rows;
  };

  const executor = new CallbackStageExecutor({
    callback: cb,
    contextFactory: factory,
  });

  await executor.execute([
    {partitionId: 'p1', rows: [{v: 1}], rowCount: 1},
  ]);

  t.equal(contexts.length, 1);
  t.equal(contexts[0].partitionId, 'p1');
  t.end();
});

test('CallbackStageExecutor - records durationMs', async (t) => {
  const cb = async (_ctx, batch) => batch.rows;
  const executor = new CallbackStageExecutor({callback: cb});

  const result = await executor.execute([
    {partitionId: 'p1', rows: [{v: 1}], rowCount: 1},
  ]);

  const pr = result.partitionResults[0];
  t.equal(typeof pr.durationMs, 'number');
  t.ok(pr.durationMs >= 0);
  t.end();
});

test('CallbackStageExecutor - non-array return yields empty', async (t) => {
  const cb = async () => 'not-array';
  const executor = new CallbackStageExecutor({callback: cb});

  const result = await executor.execute([
    {partitionId: 'p1', rows: [{v: 1}], rowCount: 1},
  ]);

  t.equal(result.partitionResults[0].rowCount, 0);
  t.same(result.partitionResults[0].rows, []);
  t.end();
});


// --- Cancellation integration (Requirement 9.5) ---

test('executor - pre-cancelled token returns cancelled ' +
  'result immediately', async (t) => {
  let invoked = false;
  const cb = async () => {
    invoked = true;
    return [];
  };
  const token = new CancellationToken();
  token.cancel('pre-cancel');

  const executor = new CallbackStageExecutor({
    callback: cb,
    cancellationToken: token,
  });

  const batches = [
    {partitionId: 'p1', rows: [{v: 1}], rowCount: 1},
  ];
  const result = await executor.execute(batches);

  t.equal(result.state, STAGE_STATE.CANCELLED);
  t.equal(result.cancelReason, 'pre-cancel');
  t.equal(result.partitionResults.length, 0);
  t.equal(result.totalPartitions, 1);
  t.equal(invoked, false, 'callback must not be invoked');
  t.equal(executor.state, STAGE_STATE.CANCELLED);
  t.end();
});

test('executor - cancel between batches skips remaining',
  async (t) => {
    const invocations = [];
    const token = new CancellationToken();

    const cb = async (_ctx, batch) => {
      invocations.push(batch.partitionId);
      if (batch.partitionId === 'p1') {
        token.cancel('mid-cancel');
      }
      return batch.rows;
    };

    const executor = new CallbackStageExecutor({
      callback: cb,
      cancellationToken: token,
    });

    const batches = [
      {partitionId: 'p1', rows: [{v: 1}], rowCount: 1},
      {partitionId: 'p2', rows: [{v: 2}], rowCount: 1},
      {partitionId: 'p3', rows: [{v: 3}], rowCount: 1},
    ];

    const result = await executor.execute(batches);

    t.equal(result.state, STAGE_STATE.CANCELLED);
    t.equal(invocations.length, 1,
      'only first batch invoked');
    t.equal(executor.state, STAGE_STATE.CANCELLED);
    t.end();
  });

test('executor - cancel during batch marks batch cancelled',
  async (t) => {
    const token = new CancellationToken();

    const cb = async (_ctx, _batch) => {
      token.cancel('during-exec');
      return [{done: true}];
    };

    const executor = new CallbackStageExecutor({
      callback: cb,
      cancellationToken: token,
    });

    const batches = [
      {partitionId: 'p1', rows: [{v: 1}], rowCount: 1},
    ];

    const result = await executor.execute(batches);

    t.equal(result.state, STAGE_STATE.CANCELLED);
    t.equal(result.partitionResults.length, 1);
    const pr = result.partitionResults[0];
    t.equal(pr.state, STAGE_STATE.CANCELLED);
    t.equal(pr.error, 'during-exec');
    t.equal(pr.partitionId, 'p1');
    t.end();
  });

test('executor - cancel during error marks batch cancelled',
  async (t) => {
    const token = new CancellationToken();

    const cb = async () => {
      token.cancel('err-cancel');
      throw new Error('some error');
    };

    const executor = new CallbackStageExecutor({
      callback: cb,
      cancellationToken: token,
    });

    const batches = [
      {partitionId: 'p1', rows: [{v: 1}], rowCount: 1},
    ];

    const result = await executor.execute(batches);

    t.equal(result.state, STAGE_STATE.CANCELLED);
    const pr = result.partitionResults[0];
    t.equal(pr.state, STAGE_STATE.CANCELLED);
    t.equal(pr.error, 'err-cancel');
    t.end();
  });

test('executor - no token behaves as before', async (t) => {
  const cb = async (_ctx, batch) => batch.rows;
  const executor = new CallbackStageExecutor({callback: cb});

  const batches = [
    {partitionId: 'p1', rows: [{v: 1}], rowCount: 1},
    {partitionId: 'p2', rows: [{v: 2}], rowCount: 1},
  ];

  const result = await executor.execute(batches);

  t.equal(result.state, STAGE_STATE.COMPLETED);
  t.equal(result.totalPartitions, 2);
  t.equal(result.partitionResults.length, 2);
  t.end();
});

test('executor - child token propagates parent cancel',
  async (t) => {
    const parent = new CancellationToken();
    const child = parent.createChild();
    let invoked = false;

    const cb = async () => {
      invoked = true;
      return [];
    };
    const executor = new CallbackStageExecutor({
      callback: cb,
      cancellationToken: child,
    });

    parent.cancel('parent-propagate');

    const batches = [
      {partitionId: 'p1', rows: [{v: 1}], rowCount: 1},
    ];
    const result = await executor.execute(batches);

    t.equal(result.state, STAGE_STATE.CANCELLED);
    t.equal(result.cancelReason, 'parent-propagate');
    t.equal(invoked, false);
    t.end();
  });

test('executor - timeout token cancels with timeout reason',
  async (t) => {
    const parent = new CancellationToken();
    const child = parent.withTimeout(60000);
    child.cancel(ERR.TIMEOUT_EXCEEDED);

    const cb = async () => [];
    const executor = new CallbackStageExecutor({
      callback: cb,
      cancellationToken: child,
    });

    const batches = [
      {partitionId: 'p1', rows: [{v: 1}], rowCount: 1},
    ];
    const result = await executor.execute(batches);

    t.equal(result.state, STAGE_STATE.CANCELLED);
    t.equal(result.cancelReason, ERR.TIMEOUT_EXCEEDED);
    t.end();
  });

test('executor - cancelled result has zero failedPartitions',
  async (t) => {
    const token = new CancellationToken();
    token.cancel('fast');

    const cb = async () => [];
    const executor = new CallbackStageExecutor({
      callback: cb,
      cancellationToken: token,
    });

    const batches = [
      {partitionId: 'p1', rows: [{v: 1}], rowCount: 1},
      {partitionId: 'p2', rows: [{v: 2}], rowCount: 1},
    ];
    const result = await executor.execute(batches);

    t.equal(result.failedPartitions, 0);
    t.equal(result.totalPartitions, 2);
    t.end();
  });
