/**
 * Tests for retry deduplication using lineage ID + stage ID.
 *
 * Verifies that CallbackStageExecutor skips already-committed
 * batches on retry and returns cached results from the
 * DedupeRegistry.
 *
 * Requirements: 9.3
 */

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  CallbackStageExecutor,
} from '../../src/query/callback/callback-stage-executor.js';
import {
  DedupeRegistry,
} from '../../src/query/dedupe-registry.js';
import {
  LineageTracker,
} from '../../src/query/lineage-tracker.js';
import {
  STAGE_STATE,
  STAGE_RESULT_FIELD as SF,
} from '../../src/query/callback/callback-stage-constants.js';

describe('dedupe on retry - CallbackStageExecutor', () => {
  it('should skip already-committed batch on retry', async () => {
    const registry = new DedupeRegistry();
    const tracker = new LineageTracker('q-retry-1');
    const stageIndex = 0;

    // First execution: run callback normally
    let callCount = 0;
    const cb = async (_ctx, batch) => {
      callCount++;
      return batch.rows.map((r) => ({...r, done: true}));
    };

    const executor1 = new CallbackStageExecutor({
      callback: cb,
      lineageTracker: tracker,
      stageIndex,
      dedupeRegistry: registry,
    });

    const batches = [
      {partitionId: 'p1', rows: [{v: 1}], rowCount: 1},
    ];

    await executor1.execute(batches);
    assert.equal(callCount, 1);
    assert.equal(registry.size(), 1);

    // Retry: same lineage + stage should skip callback
    callCount = 0;
    const executor2 = new CallbackStageExecutor({
      callback: cb,
      lineageTracker: tracker,
      stageIndex,
      dedupeRegistry: registry,
    });

    const retryResult = await executor2.execute(batches);
    assert.equal(callCount, 0, 'callback not re-invoked');
    assert.equal(
      retryResult.partitionResults[0][SF.STATE],
      STAGE_STATE.COMPLETED,
    );
    assert.equal(
      retryResult.partitionResults[0][SF.PARTITION_ID],
      'p1',
    );
  });

  it('should return cached result on retry', async () => {
    const registry = new DedupeRegistry();
    const tracker = new LineageTracker('q-retry-2');
    const stageIndex = 2;

    const cb = async (_ctx, batch) => {
      return batch.rows.map((r) => ({...r, val: 42}));
    };

    const executor1 = new CallbackStageExecutor({
      callback: cb,
      lineageTracker: tracker,
      stageIndex,
      dedupeRegistry: registry,
    });

    const batches = [
      {partitionId: 'p1', rows: [{id: 1}], rowCount: 1},
    ];

    const firstResult = await executor1.execute(batches);
    const firstBatch = firstResult.partitionResults[0];

    // Retry
    const executor2 = new CallbackStageExecutor({
      callback: cb,
      lineageTracker: tracker,
      stageIndex,
      dedupeRegistry: registry,
    });

    const retryResult = await executor2.execute(batches);
    const retryBatch = retryResult.partitionResults[0];

    assert.deepEqual(retryBatch[SF.ROWS], firstBatch[SF.ROWS]);
    assert.equal(retryBatch[SF.ROW_COUNT], firstBatch[SF.ROW_COUNT]);
  });

  it('should not dedupe when stage index differs', async () => {
    const registry = new DedupeRegistry();
    const tracker = new LineageTracker('q-retry-3');

    let callCount = 0;
    const cb = async (_ctx, batch) => {
      callCount++;
      return batch.rows;
    };

    // Execute at stage 0
    const executor1 = new CallbackStageExecutor({
      callback: cb,
      lineageTracker: tracker,
      stageIndex: 0,
      dedupeRegistry: registry,
    });

    const batches = [
      {partitionId: 'p1', rows: [{v: 1}], rowCount: 1},
    ];

    await executor1.execute(batches);
    assert.equal(callCount, 1);

    // Execute at stage 1 — different stage, should run
    callCount = 0;
    const executor2 = new CallbackStageExecutor({
      callback: cb,
      lineageTracker: tracker,
      stageIndex: 1,
      dedupeRegistry: registry,
    });

    await executor2.execute(batches);
    assert.equal(callCount, 1, 'different stage runs');
  });

  it('should not dedupe when lineage differs', async () => {
    const registry = new DedupeRegistry();
    const tracker1 = new LineageTracker('q-retry-4a');
    const tracker2 = new LineageTracker('q-retry-4b');

    let callCount = 0;
    const cb = async (_ctx, batch) => {
      callCount++;
      return batch.rows;
    };

    const batches = [
      {partitionId: 'p1', rows: [{v: 1}], rowCount: 1},
    ];

    // Execute with tracker1
    const executor1 = new CallbackStageExecutor({
      callback: cb,
      lineageTracker: tracker1,
      stageIndex: 0,
      dedupeRegistry: registry,
    });
    await executor1.execute(batches);
    assert.equal(callCount, 1);

    // Execute with tracker2 — different lineage, should run
    callCount = 0;
    const executor2 = new CallbackStageExecutor({
      callback: cb,
      lineageTracker: tracker2,
      stageIndex: 0,
      dedupeRegistry: registry,
    });
    await executor2.execute(batches);
    assert.equal(callCount, 1, 'different lineage runs');
  });

  it('should not register failed batches in dedupe',
    async () => {
      const registry = new DedupeRegistry();
      const tracker = new LineageTracker('q-retry-5');

      const cb = async () => {
        throw new Error('fail');
      };

      const executor = new CallbackStageExecutor({
        callback: cb,
        lineageTracker: tracker,
        stageIndex: 0,
        dedupeRegistry: registry,
      });

      const batches = [
        {partitionId: 'p1', rows: [{v: 1}], rowCount: 1},
      ];

      await executor.execute(batches);
      assert.equal(registry.size(), 0,
        'failed batch not registered');
    });

  it('should dedupe per-batch in multi-batch execution',
    async () => {
      const registry = new DedupeRegistry();
      const tracker = new LineageTracker('q-retry-6');

      let callCount = 0;
      const cb = async (_ctx, batch) => {
        callCount++;
        return batch.rows;
      };

      const batches = [
        {partitionId: 'p1', rows: [{v: 1}], rowCount: 1},
        {partitionId: 'p2', rows: [{v: 2}], rowCount: 1},
      ];

      // First run: both batches execute
      const executor1 = new CallbackStageExecutor({
        callback: cb,
        lineageTracker: tracker,
        stageIndex: 0,
        dedupeRegistry: registry,
      });
      await executor1.execute(batches);
      assert.equal(callCount, 2);
      assert.equal(registry.size(), 2);

      // Retry: both batches skipped
      callCount = 0;
      const executor2 = new CallbackStageExecutor({
        callback: cb,
        lineageTracker: tracker,
        stageIndex: 0,
        dedupeRegistry: registry,
      });
      const retryResult = await executor2.execute(batches);
      assert.equal(callCount, 0, 'no callbacks on retry');
      assert.equal(
        retryResult.partitionResults.length, 2,
      );
      assert.equal(
        retryResult.partitionResults[0][SF.STATE],
        STAGE_STATE.COMPLETED,
      );
      assert.equal(
        retryResult.partitionResults[1][SF.STATE],
        STAGE_STATE.COMPLETED,
      );
    });

  it('should work without dedupe registry', async () => {
    const tracker = new LineageTracker('q-no-dedupe');

    let callCount = 0;
    const cb = async (_ctx, batch) => {
      callCount++;
      return batch.rows;
    };

    const batches = [
      {partitionId: 'p1', rows: [{v: 1}], rowCount: 1},
    ];

    // No dedupeRegistry — always executes
    const executor1 = new CallbackStageExecutor({
      callback: cb,
      lineageTracker: tracker,
      stageIndex: 0,
    });
    await executor1.execute(batches);
    assert.equal(callCount, 1);

    callCount = 0;
    const executor2 = new CallbackStageExecutor({
      callback: cb,
      lineageTracker: tracker,
      stageIndex: 0,
    });
    await executor2.execute(batches);
    assert.equal(callCount, 1, 'runs again without registry');
  });

  it('should work without lineage tracker', async () => {
    const registry = new DedupeRegistry();

    let callCount = 0;
    const cb = async (_ctx, batch) => {
      callCount++;
      return batch.rows;
    };

    const batches = [
      {partitionId: 'p1', rows: [{v: 1}], rowCount: 1},
    ];

    // No lineageTracker — dedupe cannot key, always executes
    const executor1 = new CallbackStageExecutor({
      callback: cb,
      dedupeRegistry: registry,
      stageIndex: 0,
    });
    await executor1.execute(batches);
    assert.equal(callCount, 1);
    assert.equal(registry.size(), 0,
      'nothing registered without tracker');

    callCount = 0;
    const executor2 = new CallbackStageExecutor({
      callback: cb,
      dedupeRegistry: registry,
      stageIndex: 0,
    });
    await executor2.execute(batches);
    assert.equal(callCount, 1, 'runs again without tracker');
  });
});
