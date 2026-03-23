const ZERO = 0;
const ONE = 1;
const PERCENTILE_P50 = 0.5;
const PERCENTILE_P95 = 0.95;
const DEFAULT_SCENARIO = 'node-join-under-load';

const DEFAULT_SHIP_GATE = Object.freeze({
  minimumRuns: 3,
  maxFailureRate: 0,
  maxFailedOperationsP95: 0,
  maxAttemptErrorsP95: 0,
  maxQueueDelayP95MsP95: 250,
  maxUndispatchedRatioP95: 0.05,
  maxTimeoutWaitsP95: 0,
});

function normalizeFiniteNumber(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function normalizeNonNegativeInteger(value, fallback = ZERO) {
  const numericValue = normalizeFiniteNumber(value);
  if (numericValue === null) {
    return fallback;
  }
  return Math.max(ZERO, Math.floor(numericValue));
}

function percentile(sortedValues, percentileRank) {
  if (!Array.isArray(sortedValues) || sortedValues.length === ZERO) {
    return null;
  }
  const boundedRank = Math.max(ZERO, Math.min(ONE, Number(percentileRank)));
  const index = Math.floor((sortedValues.length - ONE) * boundedRank);
  return sortedValues[index];
}

function summarizeSeries(values) {
  const normalized = Array.isArray(values) ?
    values
      .map((value) => normalizeFiniteNumber(value))
      .filter((value) => value !== null) :
    [];
  if (normalized.length === ZERO) {
    return {
      count: ZERO,
      min: null,
      max: null,
      avg: null,
      p50: null,
      p95: null,
    };
  }
  const sorted = [...normalized].sort((a, b) => a - b);
  const sum = sorted.reduce((accumulator, value) => accumulator + value, ZERO);
  return {
    count: sorted.length,
    min: sorted[ZERO],
    max: sorted[sorted.length - ONE],
    avg: sum / sorted.length,
    p50: percentile(sorted, PERCENTILE_P50),
    p95: percentile(sorted, PERCENTILE_P95),
  };
}

function resolveScenarioEntry(report, scenario = DEFAULT_SCENARIO) {
  const scenarios = Array.isArray(report?.scenarios) ?
    report.scenarios :
    [];
  return scenarios.find((entry) => entry?.scenario === scenario) || null;
}

function resolveLoadMetricsFromScenarioEntry(scenarioEntry) {
  if (scenarioEntry?.loadMetrics &&
      typeof scenarioEntry.loadMetrics === 'object') {
    return scenarioEntry.loadMetrics;
  }
  const bundleLoadMetrics = scenarioEntry?.failureBundle?.topFailures?.loadMetrics;
  if (bundleLoadMetrics && typeof bundleLoadMetrics === 'object') {
    return bundleLoadMetrics;
  }
  return {};
}

function extractNodeJoinLoadMetrics(report, scenario = DEFAULT_SCENARIO) {
  const scenarioEntry = resolveScenarioEntry(report, scenario);
  if (!scenarioEntry) {
    return null;
  }
  const loadMetrics = resolveLoadMetricsFromScenarioEntry(scenarioEntry);
  const failedCount = normalizeNonNegativeInteger(loadMetrics.failed, ZERO);
  const errorCount = normalizeNonNegativeInteger(loadMetrics.errors, ZERO);
  const targetOperations = normalizeNonNegativeInteger(
    loadMetrics.targetOperations,
    ZERO,
  );
  const undispatchedOperations = normalizeNonNegativeInteger(
    loadMetrics.undispatchedOperations,
    ZERO,
  );

  return {
    failedOperations: Math.max(failedCount, errorCount),
    attemptErrors: normalizeNonNegativeInteger(loadMetrics.attemptErrors, ZERO),
    queueDelayP95Ms: normalizeNonNegativeInteger(
      loadMetrics?.queueDelay?.p95,
      ZERO,
    ),
    undispatchedRatio: targetOperations > ZERO ?
      undispatchedOperations / targetOperations :
      ZERO,
    timeoutWaits: normalizeNonNegativeInteger(
      loadMetrics?.waitReasons?.timeoutWaits,
      ZERO,
    ),
  };
}

function buildFailureModeSummary(runs = []) {
  const counts = new Map();
  for (const run of runs) {
    if (run?.passed === true) {
      continue;
    }
    const rootCauseClass = String(run?.rootCauseClass || 'unknown');
    const dominantReason = String(run?.dominantReason || 'unknown');
    const mode = `${rootCauseClass}:${dominantReason}`;
    counts.set(mode, (counts.get(mode) || ZERO) + ONE);
  }
  const entries = [...counts.entries()]
    .map(([mode, count]) => ({mode, count}))
    .sort((left, right) => right.count - left.count);
  return {
    totalModes: entries.length,
    dominantMode: entries.length > ZERO ? entries[ZERO].mode : null,
    multiModal: entries.length > ONE,
    counts: entries,
  };
}

function summarizeValidationRuns(runs = []) {
  const normalizedRuns = Array.isArray(runs) ? runs : [];
  const totalRuns = normalizedRuns.length;
  const passedRuns = normalizedRuns.filter((run) => run?.passed === true).length;
  const failedRuns = Math.max(ZERO, totalRuns - passedRuns);
  const metrics = normalizedRuns
    .map((run) => run?.metrics)
    .filter((metric) => metric && typeof metric === 'object');

  return {
    totalRuns,
    passedRuns,
    failedRuns,
    failureRate: totalRuns > ZERO ? failedRuns / totalRuns : ZERO,
    failureModes: buildFailureModeSummary(normalizedRuns),
    distributions: {
      failedOperations: summarizeSeries(
        metrics.map((metric) => metric.failedOperations),
      ),
      attemptErrors: summarizeSeries(
        metrics.map((metric) => metric.attemptErrors),
      ),
      queueDelayP95Ms: summarizeSeries(
        metrics.map((metric) => metric.queueDelayP95Ms),
      ),
      undispatchedRatio: summarizeSeries(
        metrics.map((metric) => metric.undispatchedRatio),
      ),
      timeoutWaits: summarizeSeries(
        metrics.map((metric) => metric.timeoutWaits),
      ),
    },
  };
}

function evaluateNumericGate(
  metricName,
  observedValue,
  threshold,
  comparator = 'lte',
) {
  const observed = normalizeFiniteNumber(observedValue);
  const target = normalizeFiniteNumber(threshold);
  if (observed === null || target === null) {
    return {
      metric: metricName,
      comparator,
      threshold: target,
      observed,
      passed: false,
      reason: 'metric_unavailable',
    };
  }
  const passed = comparator === 'lte' ?
    observed <= target :
    observed >= target;
  return {
    metric: metricName,
    comparator,
    threshold: target,
    observed,
    passed,
    reason: passed ? 'within_threshold' : 'threshold_exceeded',
  };
}

function assessShipReadiness(summary, options = {}) {
  const gate = {
    ...DEFAULT_SHIP_GATE,
    ...(options && typeof options === 'object' ? options : {}),
  };
  const distributions = summary?.distributions || {};
  const totalRuns = normalizeNonNegativeInteger(summary?.totalRuns, ZERO);
  const failureRate = normalizeFiniteNumber(summary?.failureRate);

  const criteria = [
    {
      metric: 'totalRuns',
      comparator: 'gte',
      threshold: gate.minimumRuns,
      observed: totalRuns,
      passed: totalRuns >= gate.minimumRuns,
      reason: totalRuns >= gate.minimumRuns ?
        'within_threshold' :
        'insufficient_runs',
    },
    evaluateNumericGate(
      'failureRate',
      failureRate,
      gate.maxFailureRate,
      'lte',
    ),
    evaluateNumericGate(
      'failedOperations.p95',
      distributions?.failedOperations?.p95,
      gate.maxFailedOperationsP95,
      'lte',
    ),
    evaluateNumericGate(
      'attemptErrors.p95',
      distributions?.attemptErrors?.p95,
      gate.maxAttemptErrorsP95,
      'lte',
    ),
    evaluateNumericGate(
      'queueDelayP95Ms.p95',
      distributions?.queueDelayP95Ms?.p95,
      gate.maxQueueDelayP95MsP95,
      'lte',
    ),
    evaluateNumericGate(
      'undispatchedRatio.p95',
      distributions?.undispatchedRatio?.p95,
      gate.maxUndispatchedRatioP95,
      'lte',
    ),
    evaluateNumericGate(
      'timeoutWaits.p95',
      distributions?.timeoutWaits?.p95,
      gate.maxTimeoutWaitsP95,
      'lte',
    ),
  ];

  const failedCriteria = criteria.filter((criterion) => criterion.passed !== true);
  return {
    decision: failedCriteria.length === ZERO ? 'ship' : 'no-ship',
    criteria,
    failedCriteria,
  };
}

export {
  DEFAULT_SCENARIO,
  DEFAULT_SHIP_GATE,
  extractNodeJoinLoadMetrics,
  summarizeValidationRuns,
  assessShipReadiness,
};
