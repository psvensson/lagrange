import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  run,
  resolveBenchmarkConfig,
  buildComparison,
} from '../../scenarios/postgres-baseline-comparison.js';

describe('postgres-baseline-comparison scenario', () => {
  it('returns baseline comparison metrics and cleans up benchmark container', async () => {
    const commandLog = [];
    const providerCalls = [];

    const provider = {
      createContainer: async () => {
        providerCalls.push('createContainer');
        return {
          containerId: 'benchmark-postgres-1',
          ip: '172.18.0.77',
          name: 'benchmark-postgres-1',
        };
      },
      execInContainer: async (_containerId, cmd) => {
        providerCalls.push('execInContainer');
        const command = String(cmd[2] || '');
        commandLog.push(command);

        if (command.includes('pg_isready')) {
          return {
            exitCode: 0,
            stdout: 'accepting connections',
            stderr: '',
          };
        }
        if (command.includes('pgbench -n')) {
          return {
            exitCode: 0,
            stdout: [
              'number of transactions actually processed: 600',
              'number of failed transactions: 1',
              'latency average = 12.500 ms',
              'latency stddev = 2.000 ms',
              'tps = 100.000000 (without initial connection time)',
            ].join('\n'),
            stderr: '',
          };
        }

        return {
          exitCode: 0,
          stdout: '',
          stderr: '',
        };
      },
      stopContainer: async () => {
        providerCalls.push('stopContainer');
      },
      removeContainer: async () => {
        providerCalls.push('removeContainer');
      },
    };

    const cluster = {
      _config: {
        benchmark: {
          baselineImage: 'postgres:16',
          durationSeconds: 10,
          clients: 4,
          jobs: 2,
          loadOpsPerSec: 80,
          loadDuration: '10s',
          tableName: 'benchmark_events',
        },
        convergence: {
          settleTimeoutMs: 1000,
          quietWindowMs: 100,
          targetVoterCount: 3,
        },
        resourceLimits: {
          memory: '1g',
          cpus: '1.0',
        },
        timeouts: {
          nodeStartup: 1000,
        },
      },
      _providers: [provider],
      _hostAssignment: [0],
      _networkName: 'test-net',
      getNodes: () => [{id: 'seed-1', role: 'seed'}],
      waitForConvergence: async () => ({settledAfterMs: 1}),
      startLoad: (options) => {
        assert.equal(options.opsPerSec, 80);
        assert.equal(options.duration, '10s');
        return {
          waitComplete: async () => ({
            total: 120,
            success: 118,
            failed: 2,
            errors: 2,
            opsPerSec: 84,
            latency: {
              p50: 3,
              p95: 7,
              p99: 15,
            },
          }),
        };
      },
      assertConsistency: async () => {
        providerCalls.push('assertConsistency');
      },
    };

    const result = await run(cluster);

    assert.ok(result.loadMetrics, 'scenario should return loadMetrics');
    assert.ok(result.details, 'scenario should return details payload');
    assert.equal(result.details.baseline.engine, 'postgres');
    assert.equal(result.details.baseline.metrics.tps, 100);
    assert.equal(result.details.comparison.sutOpsPerSec, 84);
    assert.equal(
      result.details.comparison.throughputRatioSutToBaseline,
      0.84,
    );
    assert.equal(
      result.details.comparison.p99LatencyRatioSutToBaselineAvg,
      1.2,
    );

    assert.ok(
      commandLog.some((command) => command.includes('pg_isready')),
      'scenario should wait for baseline postgres readiness',
    );
    assert.ok(
      commandLog.some((command) => command.includes('pgbench -n')),
      'scenario should run pgbench against baseline postgres',
    );
    assert.ok(
      providerCalls.includes('stopContainer') &&
      providerCalls.includes('removeContainer'),
      'scenario should stop and remove benchmark container in teardown',
    );
    assert.ok(
      providerCalls.includes('assertConsistency'),
      'scenario should verify cluster consistency at end',
    );
  });

  it('resolveBenchmarkConfig merges defaults with explicit overrides', () => {
    const cluster = {
      _config: {
        benchmark: {
          baselineImage: 'postgres:15',
          clients: 16,
          jobs: 8,
          loadDuration: '45s',
        },
      },
    };

    const resolved = resolveBenchmarkConfig(cluster);

    assert.equal(resolved.baselineImage, 'postgres:15');
    assert.equal(resolved.clients, 16);
    assert.equal(resolved.jobs, 8);
    assert.equal(resolved.loadDuration, '45s');
    assert.equal(typeof resolved.durationSeconds, 'number');
    assert.equal(typeof resolved.user, 'string');
  });

  it('buildComparison calculates ratios using baseline metrics', () => {
    const comparison = buildComparison(
      {
        opsPerSec: 120,
        latency: {p99: 24},
      },
      {
        tps: 80,
        latencyAverageMs: 12,
      },
    );

    assert.equal(comparison.sutOpsPerSec, 120);
    assert.equal(comparison.baselineTps, 80);
    assert.equal(comparison.throughputRatioSutToBaseline, 1.5);
    assert.equal(comparison.p99LatencyRatioSutToBaselineAvg, 2);
  });
});
