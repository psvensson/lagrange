import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {run} from '../../scenarios/sustained-write-throughput.js';

describe('sustained-write-throughput scenario', () => {
  it('waits for load readiness before measuring throughput', async () => {
    const calls = [];
    const cluster = {
      waitForLoadReadinessStability: async (options) => {
        calls.push(['waitForLoadReadinessStability', options]);
      },
      startLoad: (options) => {
        calls.push(['startLoad', options]);
        return {
          waitComplete: async () => ({
            total: 24,
            success: 24,
            failed: 0,
            errors: 0,
            opsPerSec: 12,
            latency: {
              avg: 10,
              p50: 8,
              p95: 15,
              p99: 20,
            },
          }),
        };
      },
      waitForAllActive: async (options) => {
        calls.push(['waitForAllActive', options]);
      },
      waitForConvergence: async (options) => {
        calls.push(['waitForConvergence', options]);
        return {
          settledAfterMs: 500,
        };
      },
      waitForConsistencyConvergence: async (options) => {
        calls.push(['waitForConsistencyConvergence', options]);
      },
    };

    const result = await run(cluster);

    assert.equal(calls[0][0], 'waitForLoadReadinessStability');
    assert.equal(calls[0][1].stableWindowMs, 1000);
    assert.equal(calls[1][0], 'startLoad');
    assert.equal(calls[1][1].duration, '30s');
    assert.equal(calls[2][0], 'waitForAllActive');
    assert.equal(calls[3][0], 'waitForConvergence');
    assert.equal(calls[4][0], 'waitForConsistencyConvergence');
    assert.equal(calls[4][1].forceRepairAfterMs, 0);
    assert.equal(calls[4][1].pollIntervalMs, 250);
    assert.equal(result.loadMetrics.total, 24);
    assert.equal(result.successRate, 1);
  });

  it('honors the configured load duration over the harness default', async () => {
    const calls = [];
    const cluster = {
      _config: {load: {defaultDuration: '1800s'}},
      startLoad: (options) => {
        calls.push(['startLoad', options]);
        return {
          waitComplete: async () => ({
            total: 24,
            success: 24,
            failed: 0,
            errors: 0,
            opsPerSec: 12,
            latency: {avg: 10, p50: 8, p95: 15, p99: 20},
          }),
        };
      },
      waitForAllActive: async () => {},
      waitForConvergence: async () => ({settledAfterMs: 500}),
      waitForConsistencyConvergence: async () => {},
    };

    await run(cluster);

    assert.equal(calls[0][0], 'startLoad');
    assert.equal(calls[0][1].duration, '1800s');
  });
});
