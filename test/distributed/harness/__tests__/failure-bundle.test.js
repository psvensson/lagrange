import {describe, it, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {ReportWriter} from '../report-writer.js';
import {writeFailureBundlesForReport} from '../failure-bundle.js';

const UTF8_ENCODING = 'utf8';

function buildRuntimeFailureScenario() {
  return {
    scenario: 'postgres-baseline-comparison',
    passed: false,
    error: 'verify failed',
    loadMetrics: {
      total: 100,
      success: 90,
      failed: 10,
      errors: 4,
      latency: {p50: 1, p95: 3, p99: 9},
      opsPerSec: 20,
    },
    details: {
      diagnostics: {
        failure: {
          rootCauseClass: 'verify',
          dominantReason: 'leader_mismatch',
          reasonCounts: {
            leader_mismatch: 2,
            snapshot_timeout: 1,
          },
          affectedNodeIds: ['node-1'],
        },
        failedPhase: {
          phase: 'verify',
          artifacts: {
            nodeReasonsByNodeId: {
              'node-1': ['leader_mismatch'],
            },
          },
        },
        rootCauseBundle: {
          snapshotsByNodeId: {
            'node-1': {
              nodeId: 'node-1',
              address: '10.0.0.1',
              capturedAtMs: 1,
            },
          },
        },
      },
    },
  };
}

function buildNoProgressFailureScenario() {
  return {
    scenario: 'postgres-baseline-comparison',
    passed: false,
    error: 'pre-load gate stalled',
    details: {
      diagnostics: {
        failure: {
          rootCauseClass: 'topology',
          dominantReason: 'stalled_no_progress:20',
          reasonCounts: {
            'stalled_no_progress:20': 1,
          },
          affectedNodeIds: ['seed-1'],
        },
        failedPhase: {
          phase: 'pre_load_gate',
          artifacts: {},
        },
        noProgress: {
          reasonCode: 'stalled_no_progress',
          phase: 'pre_load_gate',
          stalledReason: 'stalled_no_progress:20',
          lastProgressEvent: {
            message: 'waiting for quiescent benchmark topology',
          },
          lastMeaningfulChange: {
            message: 'benchmark table ready on system-under-test',
          },
          failedNoProgress: {
            message: 'pre-load gate aborted for no progress',
            details: {
              budgetMs: 20,
              attempts: 3,
            },
          },
        },
      },
    },
  };
}

describe('failure-bundle', () => {
  let tempDir;
  let outputDir;
  let reportPath;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), `failure-bundle-test-${randomUUID()}-`));
    outputDir = join(tempDir, 'artifacts');
    reportPath = join(tempDir, 'report.report.json');
  });

  afterEach(async () => {
    await rm(tempDir, {recursive: true, force: true});
  });

  it('writes scenario and run failure bundles for runtime failures and links them from the report',
    async () => {
      const scenarioDir = join(outputDir, 'postgres-baseline-comparison');
      await mkdir(scenarioDir, {recursive: true});
      await writeFile(join(scenarioDir, 'node-1.log'), 'line-1\nline-2\nline-3\n');
      await writeFile(join(scenarioDir, '_timeline.log'), 'timeline\n');
      await writeFile(join(scenarioDir, '_analysis.json'), '{"summary":"ok"}\n');

      const scenario = buildRuntimeFailureScenario();
      const writer = new ReportWriter(reportPath);
      writer.scenarios.push(scenario);

      const failureBundle = await writeFailureBundlesForReport({
        scenarios: writer.scenarios,
        reportOutputPath: reportPath,
        outputDir,
        reportSummary: {total: 1, fail: 1, pass: 0},
        standardSummary: {scenarios: []},
        benchmarkRegressionGate: {status: 'skipped'},
        workspaceRoot: tempDir,
      });

      await writer.write({
        failureBundle: failureBundle.runBundle,
      });

      assert.ok(scenario.failureBundle?.jsonPath);
      assert.ok(failureBundle.runBundle?.jsonPath);

      const scenarioBundle = JSON.parse(
        await readFile(resolve(tempDir, scenario.failureBundle.jsonPath), UTF8_ENCODING),
      );
      assert.equal(scenarioBundle.summary.phase, 'verify');
      assert.equal(scenarioBundle.topFailures.topReasons[0].reason, 'leader_mismatch');
      assert.equal(scenarioBundle.logs.nodeLogPaths['node-1'],
        'artifacts/postgres-baseline-comparison/node-1.log');
      assert.ok(Array.isArray(scenarioBundle.logs.excerptsByNodeId['node-1']));

      const runBundle = JSON.parse(
        await readFile(resolve(tempDir, failureBundle.runBundle.jsonPath), UTF8_ENCODING),
      );
      assert.equal(runBundle.failedScenarioCount, 1);
      assert.equal(runBundle.scenarios[0].scenario, 'postgres-baseline-comparison');

      const reportJson = JSON.parse(await readFile(reportPath, UTF8_ENCODING));
      assert.equal(reportJson.failureBundle.jsonPath, failureBundle.runBundle.jsonPath);
      assert.equal(
        reportJson.scenarios[0].failureBundle.jsonPath,
        scenario.failureBundle.jsonPath,
      );
    });

  it('writes no-progress diagnostics into failure bundles', async () => {
    const scenarioDir = join(outputDir, 'postgres-baseline-comparison');
    await mkdir(scenarioDir, {recursive: true});
    await writeFile(join(scenarioDir, 'seed-1.log'), 'progress stalled\n');

    const scenario = buildNoProgressFailureScenario();
    const failureBundle = await writeFailureBundlesForReport({
      scenarios: [scenario],
      reportOutputPath: reportPath,
      outputDir,
      reportSummary: {total: 1, fail: 1, pass: 0},
      standardSummary: {scenarios: []},
      benchmarkRegressionGate: {status: 'skipped'},
      workspaceRoot: tempDir,
    });

    const scenarioBundle = JSON.parse(
      await readFile(resolve(tempDir, scenario.failureBundle.jsonPath), UTF8_ENCODING),
    );
    assert.equal(scenarioBundle.diagnostics.noProgress.reasonCode, 'stalled_no_progress');
    assert.equal(
      scenarioBundle.diagnostics.noProgress.failedNoProgress.details.budgetMs,
      20,
    );

    const markdown = await readFile(
      resolve(tempDir, scenario.failureBundle.markdownPath),
      UTF8_ENCODING,
    );
    assert.match(markdown, /## No Progress/);
    assert.equal(failureBundle.scenarioBundles.length, 1);
  });
});
