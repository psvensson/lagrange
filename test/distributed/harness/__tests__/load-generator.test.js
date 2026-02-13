/**
 * Property-based tests for load metrics accuracy.
 *
 * Feature: distributed-testing-framework
 * Property 11: Load Metrics Accuracy
 *
 * **Validates: Requirements 6.3**
 */

import {test} from '../../../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {computeMetrics} from '../load-generator.js';

const MS_PER_SECOND = 1000;

/**
 * Property 11: Load Metrics Accuracy
 *
 * *For any* sequence of operations with known success/failure
 * outcomes and measured latencies, the Load_Generator metrics
 * SHALL accurately report total count, success count, failure
 * count, and latency percentiles (p50, p95, p99) consistent
 * with the recorded latencies.
 *
 * **Validates: Requirements 6.3**
 */
test('Property 11: Load Metrics Accuracy', async (t) => {
  await t.test(
    'total, success, failed, errors match inputs',
    async () => {
      await fc.assert(
        fc.property(
          fc.array(fc.nat({max: 10000}), {maxLength: 50}),
          fc.nat({max: 10000}),
          fc.nat({max: 10000}),
          fc.nat({max: 10000}),
          fc.integer({min: 1, max: 100000}),
          (latencies, successCount, failedCount, errorCount,
            durationMs) => {
            const m = computeMetrics(
              latencies, successCount, failedCount,
              errorCount, durationMs,
            );

            assert.strictEqual(
              m.total, successCount + failedCount,
            );
            assert.strictEqual(m.success, successCount);
            assert.strictEqual(m.failed, failedCount);
            assert.strictEqual(m.errors, errorCount);
          },
        ),
        {numRuns: 10},
      );
    },
  );

  await t.test(
    'percentiles are values from sorted latencies or 0',
    async () => {
      await fc.assert(
        fc.property(
          fc.array(fc.nat({max: 10000}), {maxLength: 50}),
          fc.nat({max: 1000}),
          fc.nat({max: 1000}),
          fc.nat({max: 1000}),
          fc.integer({min: 1, max: 100000}),
          (latencies, successCount, failedCount, errorCount,
            durationMs) => {
            const m = computeMetrics(
              latencies, successCount, failedCount,
              errorCount, durationMs,
            );

            const sorted = [...latencies].sort((a, b) => a - b);

            if (sorted.length === 0) {
              assert.strictEqual(m.latency.p50, 0);
              assert.strictEqual(m.latency.p95, 0);
              assert.strictEqual(m.latency.p99, 0);
            } else {
              assert.ok(
                sorted.includes(m.latency.p50),
                'p50 should be a value in the sorted array',
              );
              assert.ok(
                sorted.includes(m.latency.p95),
                'p95 should be a value in the sorted array',
              );
              assert.ok(
                sorted.includes(m.latency.p99),
                'p99 should be a value in the sorted array',
              );
            }
          },
        ),
        {numRuns: 10},
      );
    },
  );

  await t.test(
    'percentiles are monotonic: p50 <= p95 <= p99',
    async () => {
      await fc.assert(
        fc.property(
          fc.array(fc.nat({max: 10000}), {maxLength: 50}),
          fc.nat({max: 1000}),
          fc.nat({max: 1000}),
          fc.nat({max: 1000}),
          fc.integer({min: 1, max: 100000}),
          (latencies, successCount, failedCount, errorCount,
            durationMs) => {
            const m = computeMetrics(
              latencies, successCount, failedCount,
              errorCount, durationMs,
            );

            assert.ok(
              m.latency.p50 <= m.latency.p95,
              `p50 (${m.latency.p50}) should be <= ` +
              `p95 (${m.latency.p95})`,
            );
            assert.ok(
              m.latency.p95 <= m.latency.p99,
              `p95 (${m.latency.p95}) should be <= ` +
              `p99 (${m.latency.p99})`,
            );
          },
        ),
        {numRuns: 10},
      );
    },
  );

  await t.test(
    'opsPerSec is computed correctly',
    async () => {
      await fc.assert(
        fc.property(
          fc.array(fc.nat({max: 10000}), {maxLength: 50}),
          fc.nat({max: 10000}),
          fc.nat({max: 10000}),
          fc.nat({max: 10000}),
          fc.integer({min: 1, max: 100000}),
          (latencies, successCount, failedCount, errorCount,
            durationMs) => {
            const m = computeMetrics(
              latencies, successCount, failedCount,
              errorCount, durationMs,
            );

            const expected =
              ((successCount + failedCount) / durationMs) *
              MS_PER_SECOND;
            assert.strictEqual(m.opsPerSec, expected);
          },
        ),
        {numRuns: 10},
      );
    },
  );
});

/**
 * Unit tests for Load Generator.
 *
 * Tests: waitComplete resolves after duration (Req 6.4),
 *        node failover records failure and retries (Req 6.5),
 *        cancel stops the load run,
 *        getMetrics returns snapshot during run.
 */
import {LoadGenerator} from '../load-generator.js';

const ZERO = 0;

/**
 * Create a mock node whose query method resolves immediately.
 * @param {string} id
 * @returns {Object}
 */
function createMockNode(id) {
  return {
    id,
    async query(_sql) {
      return {rows: []};
    },
  };
}

/**
 * Create a mock node whose query method always rejects.
 * @param {string} id
 * @returns {Object}
 */
function createFailingNode(id) {
  return {
    id,
    async query(_sql) {
      throw new Error(`node ${id} unreachable`);
    },
  };
}

test('waitComplete resolves after duration with metrics', async () => {
  const nodes = [createMockNode('n1'), createMockNode('n2')];
  const gen = new LoadGenerator(nodes, {
    opsPerSec: 200,
    duration: 100,
  });
  const run = gen.start();
  try {
    const metrics = await run.waitComplete();
    assert.ok(metrics, 'waitComplete should resolve with metrics');
    assert.ok(
      metrics.total > ZERO,
      `expected total > 0, got ${metrics.total}`,
    );
    assert.strictEqual(typeof metrics.success, 'number');
    assert.strictEqual(typeof metrics.failed, 'number');
    assert.strictEqual(typeof metrics.errors, 'number');
    assert.ok(metrics.latency, 'metrics should include latency');
    assert.strictEqual(typeof metrics.opsPerSec, 'number');
  } finally {
    run.cancel();
  }
});

test('node failover records failure and retries', async () => {
  const failNode = createFailingNode('fail-1');
  const goodNode = createMockNode('good-1');
  const gen = new LoadGenerator([failNode, goodNode], {
    opsPerSec: 200,
    duration: 100,
  });
  const run = gen.start();
  try {
    const metrics = await run.waitComplete();
    assert.ok(
      metrics.errors > ZERO,
      `expected errors > 0, got ${metrics.errors}`,
    );
    assert.ok(
      metrics.success > ZERO,
      `expected success > 0, got ${metrics.success}`,
    );
  } finally {
    run.cancel();
  }
});

test('cancel stops the load run immediately', async () => {
  const nodes = [createMockNode('n1')];
  const gen = new LoadGenerator(nodes, {
    opsPerSec: 10,
    duration: 5000,
  });
  const run = gen.start();
  try {
    run.cancel();
    const metrics = await run.waitComplete();
    assert.ok(metrics, 'waitComplete should resolve after cancel');
    assert.strictEqual(typeof metrics.total, 'number');
  } finally {
    run.cancel();
  }
});

test('getMetrics returns snapshot with expected shape', async () => {
  const nodes = [createMockNode('n1')];
  const gen = new LoadGenerator(nodes, {
    opsPerSec: 10,
    duration: 5000,
  });
  const run = gen.start();
  try {
    const metrics = run.getMetrics();
    assert.strictEqual(typeof metrics.total, 'number');
    assert.strictEqual(typeof metrics.success, 'number');
    assert.strictEqual(typeof metrics.failed, 'number');
    assert.strictEqual(typeof metrics.errors, 'number');
    assert.ok(metrics.latency, 'metrics should have latency');
    assert.strictEqual(typeof metrics.latency.p50, 'number');
    assert.strictEqual(typeof metrics.latency.p95, 'number');
    assert.strictEqual(typeof metrics.latency.p99, 'number');
    assert.strictEqual(typeof metrics.opsPerSec, 'number');
  } finally {
    run.cancel();
  }
});
