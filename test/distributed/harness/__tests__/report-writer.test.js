import {describe, it, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, rm, stat} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {
  ReportWriter,
  buildScenarioEntry,
  computeSummary,
  computeStandardSummary,
  JSON_INDENT,
} from '../report-writer.js';

const JSON_INDENT_EXPECTED = 2;

describe('ReportWriter', () => {
  let tempDir;
  let outputPath;

  beforeEach(() => {
    tempDir = join(tmpdir(), `report-writer-test-${randomUUID()}`);
    outputPath = join(tempDir, 'report.json');
  });

  afterEach(async () => {
    try {
      await rm(tempDir, {recursive: true, force: true});
    } catch (_e) {
      // best-effort cleanup
    }
  });

  describe('addResult', () => {
    it('accumulates scenario results', () => {
      const writer = new ReportWriter(outputPath);
      writer.addResult('scenario-a', {passed: true, duration: 1000});
      writer.addResult('scenario-b', {passed: false, duration: 2000});
      assert.equal(writer.scenarios.length, 2);
      assert.equal(writer.scenarios[0].scenario, 'scenario-a');
      assert.equal(writer.scenarios[1].scenario, 'scenario-b');
    });

    it('includes all required per-scenario fields', () => {
      const writer = new ReportWriter(outputPath);
      writer.addResult('test-scenario', {
        passed: true,
        duration: 5000,
        startedAt: '2024-01-15T10:30:00Z',
        convergenceTiming: {
          settledAfterMs: 8500,
          leaderChanges: 4,
          maxOverTargetMs: 1200,
        },
        error: null,
        stackTrace: null,
      });

      const entry = writer.scenarios[0];
      assert.equal(entry.scenario, 'test-scenario');
      assert.equal(entry.passed, true);
      assert.equal(entry.duration, 5000);
      assert.equal(entry.startedAt, '2024-01-15T10:30:00Z');
      assert.deepEqual(entry.convergenceTiming, {
        settledAfterMs: 8500,
        leaderChanges: 4,
        maxOverTargetMs: 1200,
      });
      assert.equal(entry.error, null);
      assert.equal(entry.stackTrace, null);
      assert.equal(entry.trace, null);
      assert.equal(entry.traceAssertion, null);
      assert.equal(entry.memoryLeak, null);
      assert.equal(entry.memoryLeakAssertion, null);
      assert.equal(entry.partitionHotspots, null);
      assert.ok(Array.isArray(entry.optimizationPriorities));
      assert.ok(entry.optimizationPriorities.length > 0);
    });

    it('includes load metrics with latency and throughput', () => {
      const writer = new ReportWriter(outputPath);
      writer.addResult('load-scenario', {
        passed: true,
        duration: 30000,
        loadMetrics: {
          total: 5000,
          success: 4998,
          failed: 2,
          errors: 0,
          latency: {p50: 12, p95: 45, p99: 120},
          opsPerSec: 166.5,
        },
      });

      const entry = writer.scenarios[0];
      assert.deepEqual(entry.loadMetrics, {
        total: 5000,
        success: 4998,
        failed: 2,
        errors: 0,
        latency: {p50: 12, p95: 45, p99: 120},
        opsPerSec: 166.5,
      });
    });

    it('sets loadMetrics to null when not provided', () => {
      const writer = new ReportWriter(outputPath);
      writer.addResult('no-load', {passed: true, duration: 1000});
      assert.equal(writer.scenarios[0].loadMetrics, null);
    });

    it('captures error and stackTrace for failed scenarios', () => {
      const writer = new ReportWriter(outputPath);
      writer.addResult('failing', {
        passed: false,
        duration: 500,
        error: 'Convergence timeout',
        stackTrace: 'Error: Convergence timeout\n    at ...',
      });

      const entry = writer.scenarios[0];
      assert.equal(entry.passed, false);
      assert.equal(entry.error, 'Convergence timeout');
      assert.ok(entry.stackTrace.includes('Convergence timeout'));
    });
  });

  describe('write', () => {
    it('produces valid JSON with timestamp, summary, and scenarios',
      async () => {
        const writer = new ReportWriter(outputPath);
        writer.addResult('s1', {passed: true, duration: 1000});
        writer.addResult('s2', {passed: false, duration: 2000});

        await writer.write();

        const content = await readFile(outputPath, 'utf8');
        const report = JSON.parse(content);

        assert.ok(report.timestamp);
        assert.ok(report.summary);
        assert.ok(report.optimizationSummary);
        assert.ok(report.standardSummary);
        assert.ok(Array.isArray(report.scenarios));
        assert.equal(report.scenarios.length, 2);
      });

    it('computes correct summary totals', async () => {
      const writer = new ReportWriter(outputPath);
      writer.addResult('pass-1', {passed: true, duration: 1000});
      writer.addResult('pass-2', {passed: true, duration: 2000});
      writer.addResult('fail-1', {passed: false, duration: 500});

      await writer.write();

      const content = await readFile(outputPath, 'utf8');
      const report = JSON.parse(content);

      assert.equal(report.summary.total, 3);
      assert.equal(report.summary.passed, 2);
      assert.equal(report.summary.failed, 1);
      assert.equal(report.summary.duration, 3500);
    });

    it('creates parent directories if they do not exist', async () => {
      const nestedPath = join(tempDir, 'a', 'b', 'report.json');
      const writer = new ReportWriter(nestedPath);
      writer.addResult('s1', {passed: true, duration: 100});

      await writer.write();

      const info = await stat(nestedPath);
      assert.ok(info.isFile());
    });

    it('writes empty scenarios array when no results added',
      async () => {
        const writer = new ReportWriter(outputPath);
        await writer.write();

        const content = await readFile(outputPath, 'utf8');
        const report = JSON.parse(content);

        assert.equal(report.summary.total, 0);
        assert.equal(report.summary.passed, 0);
        assert.equal(report.summary.failed, 0);
        assert.equal(report.summary.duration, 0);
        assert.deepEqual(report.optimizationSummary.topComponents, []);
        assert.deepEqual(report.optimizationSummary.topPartitions, []);
        assert.equal(report.standardSummary.historicalReportsConsidered, 0);
        assert.equal(report.standardSummary.scenariosComparedToPrevious, 0);
        assert.equal(
          report.standardSummary.scenariosComparedToPostgresBaseline,
          0,
        );
        assert.deepEqual(report.standardSummary.scenarios, []);
        assert.deepEqual(report.scenarios, []);
      });

    it('uses correct JSON indentation', async () => {
      const writer = new ReportWriter(outputPath);
      writer.addResult('s1', {passed: true, duration: 100});
      await writer.write();

      const content = await readFile(outputPath, 'utf8');
      const expected = JSON.stringify(
        JSON.parse(content), null, JSON_INDENT_EXPECTED,
      );
      assert.equal(content, expected);
    });
  });

  describe('buildScenarioEntry', () => {
    it('defaults missing fields to null or zero', () => {
      const entry = buildScenarioEntry('minimal', {});
      assert.equal(entry.scenario, 'minimal');
      assert.equal(entry.passed, false);
      assert.equal(entry.duration, 0);
      assert.equal(entry.startedAt, null);
      assert.equal(entry.convergenceTiming, null);
      assert.equal(entry.error, null);
      assert.equal(entry.stackTrace, null);
      assert.equal(entry.details, null);
      assert.equal(entry.exampleResults, null);
      assert.equal(entry.loadMetrics, null);
      assert.equal(entry.trace, null);
      assert.equal(entry.traceAssertion, null);
      assert.equal(entry.partitionHotspots, null);
    });

    it('persists scenario details and exampleResults payload', () => {
      const entry = buildScenarioEntry('examples-catalog', {
        passed: true,
        duration: 1234,
        details: {
          artifactPath: 'test-output/examples/run-1.json',
          exampleResults: {
            total: 5,
            passed: 5,
            failed: 0,
          },
        },
      });
      assert.deepEqual(entry.details, {
        artifactPath: 'test-output/examples/run-1.json',
        exampleResults: {
          total: 5,
          passed: 5,
          failed: 0,
        },
      });
      assert.deepEqual(entry.exampleResults, {
        total: 5,
        passed: 5,
        failed: 0,
      });
    });

    it('persists trace artifact summary and assertion metadata', () => {
      const entry = buildScenarioEntry('trace-scenario', {
        passed: true,
        duration: 100,
        trace: {
          eventCount: 3,
          lineageIds: ['lineage-1'],
        },
        traceAssertion: {
          required: true,
          passed: true,
          eventCount: 3,
        },
      });

      assert.deepEqual(entry.trace, {
        eventCount: 3,
        lineageIds: ['lineage-1'],
      });
      assert.deepEqual(entry.traceAssertion, {
        required: true,
        passed: true,
        eventCount: 3,
      });
    });

    it('persists memory leak analysis and assertion metadata', () => {
      const entry = buildScenarioEntry('memory-scenario', {
        passed: true,
        duration: 100,
        memoryLeak: {
          analyzed: true,
          leakDetected: false,
          leakingNodes: [],
        },
        memoryLeakAssertion: {
          enabled: true,
          required: true,
          passed: true,
        },
      });

      assert.deepEqual(entry.memoryLeak, {
        analyzed: true,
        leakDetected: false,
        leakingNodes: [],
      });
      assert.deepEqual(entry.memoryLeakAssertion, {
        enabled: true,
        required: true,
        passed: true,
      });
    });

    it('prioritizes replication and latency when baseline gap is large', () => {
      const entry = buildScenarioEntry('postgres-baseline-comparison', {
        passed: true,
        duration: 100,
        loadMetrics: {
          total: 1000,
          success: 1000,
          failed: 0,
          errors: 0,
          latency: {p50: 10, p95: 500, p99: 1200},
          opsPerSec: 40,
        },
        details: {
          details: {
            comparison: {
              throughputRatioSutToBaseline: 0.005,
              sutOpsPerSec: 40,
              baselineTps: 4000,
              p99LatencyRatioSutToBaselineAvg: 600,
              sutP99LatencyMs: 1200,
              baselineLatencyAvgMs: 2,
            },
            convergence: {
              settledAfterMs: 6000,
              leaderChanges: 0,
              maxOverTargetMs: 0,
            },
          },
        },
      });

      assert.ok(Array.isArray(entry.optimizationPriorities));
      assert.ok(
        entry.optimizationPriorities.some((item) =>
          item.component === 'replication_write_path' &&
          item.signal === 'baseline_throughput_gap',
        ),
      );
      assert.ok(
        entry.optimizationPriorities.some((item) =>
          item.component === 'tail_latency_path' &&
          item.signal === 'baseline_latency_gap',
        ),
      );
    });

    it('prioritizes memory lifecycle when leak is detected', () => {
      const entry = buildScenarioEntry('memory-soak', {
        passed: false,
        duration: 100,
        memoryLeak: {
          analyzed: true,
          leakDetected: true,
          leakingNodeCount: 2,
          leakingNodes: ['node-a', 'node-b'],
        },
      });

      assert.ok(Array.isArray(entry.optimizationPriorities));
      assert.ok(
        entry.optimizationPriorities.some((item) =>
          item.component === 'memory_lifecycle' &&
          item.priority === 'critical',
        ),
      );
    });

    it('builds partition hotspots from convergence diagnostics', () => {
      const entry = buildScenarioEntry('convergence-hotspots', {
        passed: false,
        duration: 100,
        details: {
          diagnostics: {
            overTargetDurations: {
              p1: 4500,
              p2: 250,
            },
            partitionMembership: {
              p1: {
                voterCount: 5,
                targetVoterCount: 3,
                leader: 'node-a',
                replicas: [{nodeId: 'node-a'}, {nodeId: 'node-b'}],
              },
              p2: {
                voterCount: 3,
                targetVoterCount: 3,
                leader: 'node-b',
                replicas: [{nodeId: 'node-b'}],
              },
            },
            operationHistory: [
              {
                partitionId: 'p1',
                operationId: 'op-1',
                status: 'running',
                at: '2026-02-17T12:00:00.000Z',
              },
              {
                partitionId: 'p2',
                operationId: 'op-2',
                status: 'completed',
                at: '2026-02-17T11:59:00.000Z',
              },
            ],
          },
        },
      });

      assert.ok(Array.isArray(entry.partitionHotspots));
      assert.equal(entry.partitionHotspots[0].partitionId, 'p1');
      assert.ok(entry.partitionHotspots[0].hotspotScore > 0);
      assert.ok(
        entry.optimizationPriorities.some((item) =>
          item.signal === 'partition_hotspots',
        ),
      );
    });
  });

  describe('optimization summary', () => {
    it('aggregates top partition hotspots across scenarios', async () => {
      const writer = new ReportWriter(outputPath);
      writer.addResult('scenario-a', {
        passed: false,
        duration: 100,
        details: {
          diagnostics: {
            overTargetDurations: {'p-main': 2000},
            partitionMembership: {
              'p-main': {
                voterCount: 4,
                targetVoterCount: 3,
                leader: 'node-a',
                replicas: [{nodeId: 'node-a'}],
              },
            },
            operationHistory: [],
          },
        },
      });
      writer.addResult('scenario-b', {
        passed: false,
        duration: 100,
        details: {
          diagnostics: {
            overTargetDurations: {'p-main': 500},
            partitionMembership: {
              'p-main': {
                voterCount: 4,
                targetVoterCount: 3,
                leader: 'node-b',
                replicas: [{nodeId: 'node-b'}],
              },
            },
            operationHistory: [],
          },
        },
      });

      await writer.write();
      const report = JSON.parse(await readFile(outputPath, 'utf8'));
      assert.ok(Array.isArray(report.optimizationSummary.topPartitions));
      assert.equal(report.optimizationSummary.topPartitions[0].partitionId, 'p-main');
      assert.equal(report.optimizationSummary.topPartitions[0].count, 2);
    });
  });

  describe('standard summary', () => {
    it('compares current scenario against latest previous similar run', async () => {
      const writer = new ReportWriter(outputPath, {
        historyReports: [
          {
            path: '/tmp/previous.report.json',
            timestamp: '2026-02-16T10:00:00.000Z',
            scenarios: [
              {
                scenario: 'postgres-baseline-comparison',
                passed: true,
                duration: 1000,
                loadMetrics: {
                  opsPerSec: 40,
                  latency: {p99: 20},
                },
                details: {
                  details: {
                    benchmark: {
                      workload: 'custom-mixed-insert-select',
                      durationSeconds: 30,
                      clients: 8,
                      jobs: 4,
                    },
                    comparison: {
                      throughputRatioSutToBaseline: 0.02,
                      p99LatencyRatioSutToBaselineAvg: 80,
                      sutOpsPerSec: 40,
                      baselineTps: 2000,
                      sutP99LatencyMs: 20,
                      baselineLatencyAvgMs: 0.25,
                    },
                  },
                },
              },
            ],
          },
        ],
      });
      writer.addResult('postgres-baseline-comparison', {
        passed: true,
        duration: 1200,
        loadMetrics: {
          opsPerSec: 50,
          latency: {p99: 25},
        },
        details: {
          details: {
            benchmark: {
              workload: 'custom-mixed-insert-select',
              durationSeconds: 30,
              clients: 8,
              jobs: 4,
            },
            baseline: {
              engine: 'postgres',
              cache: {hit: true},
            },
            comparison: {
              throughputRatioSutToBaseline: 0.025,
              p99LatencyRatioSutToBaselineAvg: 100,
              sutOpsPerSec: 50,
              baselineTps: 2000,
              sutP99LatencyMs: 25,
              baselineLatencyAvgMs: 0.25,
            },
          },
        },
      });

      await writer.write();
      const report = JSON.parse(await readFile(outputPath, 'utf8'));
      const summary = report.standardSummary;
      assert.equal(summary.historicalReportsConsidered, 1);
      assert.equal(summary.scenariosComparedToPrevious, 1);
      assert.equal(summary.scenariosComparedToPostgresBaseline, 1);
      assert.equal(summary.scenarios.length, 1);

      const entry = summary.scenarios[0];
      assert.equal(entry.scenario, 'postgres-baseline-comparison');
      assert.equal(entry.previousSimilarRun.reportPath, '/tmp/previous.report.json');
      assert.equal(entry.previousSimilarRun.durationMs, 1000);
      assert.equal(entry.deltaVsPrevious.durationMs, 200);
      assert.equal(entry.deltaVsPrevious.opsPerSec, 10);
      assert.equal(entry.deltaVsPrevious.p99LatencyMs, 5);
      assert.equal(entry.postgresBaseline.engine, 'postgres');
      assert.equal(entry.postgresBaseline.throughputRatioSutToBaseline, 0.025);
      assert.deepEqual(entry.postgresBaseline.cache, {hit: true});
    });
  });

  describe('computeSummary', () => {
    it('computes correct counts from scenario entries', () => {
      const scenarios = [
        {passed: true, duration: 100},
        {passed: true, duration: 200},
        {passed: false, duration: 50},
      ];
      const summary = computeSummary(scenarios);
      assert.equal(summary.total, 3);
      assert.equal(summary.passed, 2);
      assert.equal(summary.failed, 1);
      assert.equal(summary.duration, 350);
    });

    it('handles empty scenarios array', () => {
      const summary = computeSummary([]);
      assert.equal(summary.total, 0);
      assert.equal(summary.passed, 0);
      assert.equal(summary.failed, 0);
      assert.equal(summary.duration, 0);
    });
  });

  describe('computeStandardSummary', () => {
    it('returns empty summary for empty scenarios/history', () => {
      const summary = computeStandardSummary([], []);
      assert.equal(summary.historicalReportsConsidered, 0);
      assert.equal(summary.scenariosComparedToPrevious, 0);
      assert.equal(summary.scenariosComparedToPostgresBaseline, 0);
      assert.deepEqual(summary.scenarios, []);
    });
  });

  describe('JSON_INDENT constant', () => {
    it('equals 2', () => {
      assert.equal(JSON_INDENT, JSON_INDENT_EXPECTED);
    });
  });
});
