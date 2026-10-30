import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateBenchmarkRegressionGate,
  resolveBenchmarkGateConfig,
} from '../../run.js';

const SCENARIO = 'postgres-baseline-comparison';
const SIMILARITY_KEY = 'postgres-baseline-comparison|workload-a';
const OTHER_KEY = 'postgres-baseline-comparison|workload-b';
const CURRENT_THROUGHPUT = 60;
const BASELINE_THROUGHPUT = 80;
const OLDER_THROUGHPUT = 100;
const REGRESSION_RATIO = 0.1;
const BASELINE_PATH = '/tmp/newest-baseline.report.json';
const BASELINE_TIMESTAMP = '2026-10-30T08:00:00.000Z';
const METADATA_READ = 'historical metadata is not benchmark identity';

function summary(throughput, similarityKey = SIMILARITY_KEY) {
  return {scenario: SCENARIO, similarityKey, current: {opsPerSec: throughput}};
}

function history(throughput, similarityKey = SIMILARITY_KEY) {
  return {
    path: BASELINE_PATH,
    timestamp: BASELINE_TIMESTAMP,
    standardSummary: {scenarios: [summary(throughput, similarityKey)]},
  };
}

function compare(reports) {
  return evaluateBenchmarkRegressionGate(
    {standardSummary: {scenarios: [summary(CURRENT_THROUGHPUT)]}},
    reports,
    {benchmarkGate: {enabled: true}},
  );
}

test('benchmark settings expose only supported comparison policy', () => {
  assert.deepEqual(resolveBenchmarkGateConfig({}), {
    enabled: false,
    maxThroughputRegressionRatio: REGRESSION_RATIO,
    minimumThroughputRatioSutToBaseline: null,
    failIfBaselineMissing: false,
    approvedMitigationId: null,
    parityMismatchPolicy: 'warn',
  });
  const configured = resolveBenchmarkGateConfig({
    benchmarkGate: {enabled: true, baselineProvider: 'unused'},
  });
  assert.equal(configured.enabled, true);
  assert.equal(Object.hasOwn(configured, 'baselineProvider'), false);
});

test('historical comparison uses scenario identity without consulting report metadata', () => {
  const report = history(BASELINE_THROUGHPUT);
  Object.defineProperty(report, 'metadata', {
    get() {
      throw new Error(METADATA_READ);
    },
  });
  const result = compare([report]);
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'throughput-regression');
  assert.equal(result.comparisons[0].baselineOpsPerSec, BASELINE_THROUGHPUT);
});

test('historical comparison keeps the first usable matching summary and its provenance', () => {
  const result = compare([
    history(BASELINE_THROUGHPUT, OTHER_KEY),
    history(0),
    history(BASELINE_THROUGHPUT),
    history(OLDER_THROUGHPUT),
  ]);
  assert.equal(result.comparedScenarioCount, 1);
  assert.equal(result.failedScenarioCount, 1);
  assert.equal(result.comparisons[0].baselineOpsPerSec, BASELINE_THROUGHPUT);
  assert.equal(result.comparisons[0].baselineReportPath, BASELINE_PATH);
  assert.equal(result.comparisons[0].baselineReportTimestamp, BASELINE_TIMESTAMP);
});
