/**
 * Tests for admin-command-metrics.
 * Requirements: 8.5, 13.4
 */

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  METRIC_TYPE,
  CommandMetrics,
} from '../../src/admin/admin-command-metrics.js';

describe('admin-command-metrics', () => {
  describe('METRIC_TYPE', () => {
    it('is frozen with expected values', () => {
      assert.ok(Object.isFrozen(METRIC_TYPE));
      assert.equal(METRIC_TYPE.COMMAND_COUNT, 'commandCount');
      assert.equal(METRIC_TYPE.COMMAND_LATENCY_MS, 'commandLatencyMs');
      assert.equal(METRIC_TYPE.COMMAND_ERROR, 'commandError');
      assert.equal(
        METRIC_TYPE.OPERATION_DURATION_MS,
        'operationDurationMs',
      );
    });
  });

  describe('recordCommand', () => {
    it('increments count for an action', () => {
      const m = new CommandMetrics();
      m.recordCommand('publish', 10, true);
      assert.equal(m.getCommandCount('publish'), 1);
      m.recordCommand('publish', 5, true);
      assert.equal(m.getCommandCount('publish'), 2);
    });

    it('records latency for an action', () => {
      const m = new CommandMetrics();
      m.recordCommand('create', 42, true);
      m.recordCommand('create', 8, true);
      const snap = m.getSnapshot();
      assert.equal(snap.commands.create.totalLatencyMs, 50);
    });

    it('increments error count on failure', () => {
      const m = new CommandMetrics();
      m.recordCommand('delete', 3, false);
      assert.equal(m.getErrorCount('delete'), 1);
      m.recordCommand('delete', 7, false);
      assert.equal(m.getErrorCount('delete'), 2);
    });
  });

  describe('getCommandCount', () => {
    it('returns 0 for unknown action', () => {
      const m = new CommandMetrics();
      assert.equal(m.getCommandCount('nonexistent'), 0);
    });
  });

  describe('getErrorCount', () => {
    it('returns 0 for unknown action', () => {
      const m = new CommandMetrics();
      assert.equal(m.getErrorCount('nonexistent'), 0);
    });
  });

  describe('getTotalCommandCount', () => {
    it('sums counts across all actions', () => {
      const m = new CommandMetrics();
      m.recordCommand('publish', 1, true);
      m.recordCommand('create', 2, true);
      m.recordCommand('publish', 3, true);
      assert.equal(m.getTotalCommandCount(), 3);
    });
  });

  describe('getTotalErrorCount', () => {
    it('sums errors across all actions', () => {
      const m = new CommandMetrics();
      m.recordCommand('publish', 1, false);
      m.recordCommand('create', 2, false);
      m.recordCommand('delete', 3, true);
      assert.equal(m.getTotalErrorCount(), 2);
    });
  });

  describe('recordOperationDuration', () => {
    it('stores duration for an operation', () => {
      const m = new CommandMetrics();
      m.recordOperationDuration('op-1', 500);
      const snap = m.getSnapshot();
      assert.equal(snap.operations['op-1'], 500);
    });
  });

  describe('getSnapshot', () => {
    it('returns frozen object with correct structure', () => {
      const m = new CommandMetrics();
      m.recordCommand('publish', 10, true);
      m.recordCommand('publish', 5, false);
      m.recordOperationDuration('op-1', 200);

      const snap = m.getSnapshot();
      assert.ok(Object.isFrozen(snap));
      assert.ok(Object.isFrozen(snap.commands));
      assert.ok(Object.isFrozen(snap.operations));
      assert.ok(Object.isFrozen(snap.commands.publish));

      assert.equal(snap.commands.publish.count, 2);
      assert.equal(snap.commands.publish.errors, 1);
      assert.equal(snap.commands.publish.totalLatencyMs, 15);
      assert.equal(snap.operations['op-1'], 200);
    });
  });

  describe('reset', () => {
    it('clears all metrics', () => {
      const m = new CommandMetrics();
      m.recordCommand('publish', 10, false);
      m.recordOperationDuration('op-1', 100);
      m.reset();

      assert.equal(m.getCommandCount('publish'), 0);
      assert.equal(m.getErrorCount('publish'), 0);
      assert.equal(m.getTotalCommandCount(), 0);
      assert.equal(m.getTotalErrorCount(), 0);
      const snap = m.getSnapshot();
      assert.deepEqual(snap.commands, {});
      assert.deepEqual(snap.operations, {});
    });
  });
});
