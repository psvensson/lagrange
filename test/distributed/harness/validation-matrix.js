const ZERO = 0;
const ONE = 1;
const PERCENTILE_P50 = 0.5;
const PERCENTILE_P95 = 0.95;
const DEFAULT_SCENARIO = 'node-join-under-load';
const DEFAULT_NODE_FAILURE_REBALANCE_SCENARIO = 'node-failure-rebalance';
const LOAD_METRICS_AVAILABILITY = Object.freeze({
  AVAILABLE: 'available',
  SCENARIO_NOT_FOUND: 'scenario_not_found',
});

const DEFAULT_SHIP_GATE = Object.freeze({
  minimumRuns: 3,
  maxFailureRate: 0,
  maxFailedOperationsP95: 0,
  maxNonAdmissionAttemptErrorsP95: 0,
  maxQueueDelayP95MsP95: 250,
  maxUndispatchedRatioP95: 0.1,
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

function resolveAdmissionSignalCount(loadMetrics) {
  const explicitAdmissionSignals = normalizeNonNegativeInteger(
    loadMetrics?.admissionSignals,
    null,
  );
  if (explicitAdmissionSignals !== null) {
    return explicitAdmissionSignals;
  }
  const perNodeMetrics = loadMetrics?.perNode &&
    typeof loadMetrics.perNode === 'object' ?
    loadMetrics.perNode :
    {};
  let admissionSignalCount = ZERO;
  for (const nodeMetrics of Object.values(perNodeMetrics)) {
    admissionSignalCount += normalizeNonNegativeInteger(
      nodeMetrics?.admissionSignals,
      ZERO,
    );
  }
  return admissionSignalCount;
}

function resolveNonAdmissionAttemptErrors(loadMetrics) {
  const explicitNonAdmissionAttemptErrors = normalizeNonNegativeInteger(
    loadMetrics?.nonAdmissionAttemptErrors,
    null,
  );
  if (explicitNonAdmissionAttemptErrors !== null) {
    return explicitNonAdmissionAttemptErrors;
  }
  const attemptErrors = normalizeNonNegativeInteger(
    loadMetrics?.attemptErrors,
    ZERO,
  );
  const admissionSignals = Math.min(
    attemptErrors,
    resolveAdmissionSignalCount(loadMetrics),
  );
  return Math.max(ZERO, attemptErrors - admissionSignals);
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
    nonAdmissionAttemptErrors: resolveNonAdmissionAttemptErrors(loadMetrics),
    queueDelayP95Ms: normalizeNonNegativeInteger(
      loadMetrics?.queueDelay?.p95,
      ZERO,
    ),
    undispatchedRatio: targetOperations > ZERO ?
      undispatchedOperations / targetOperations :
      ZERO,
    timeoutWaits: normalizeNonNegativeInteger(
      loadMetrics?.nonAdmissionTimeoutWaits,
      normalizeNonNegativeInteger(
        loadMetrics?.waitReasons?.timeoutWaits,
        ZERO,
      ),
    ),
  };
}

function extractNodeFailureRebalanceLoadMetrics(
  report,
  scenario = DEFAULT_NODE_FAILURE_REBALANCE_SCENARIO,
) {
  const scenarioEntry = resolveScenarioEntry(report, scenario);
  if (!scenarioEntry) {
    return {
      availability: LOAD_METRICS_AVAILABILITY.SCENARIO_NOT_FOUND,
      failedOperations: ZERO,
      attemptErrors: ZERO,
      nonAdmissionAttemptErrors: ZERO,
      queueDelayP95Ms: ZERO,
      undispatchedRatio: ZERO,
      timeoutWaits: ZERO,
    };
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
    availability: LOAD_METRICS_AVAILABILITY.AVAILABLE,
    failedOperations: Math.max(failedCount, errorCount),
    attemptErrors: normalizeNonNegativeInteger(loadMetrics.attemptErrors, ZERO),
    nonAdmissionAttemptErrors: resolveNonAdmissionAttemptErrors(loadMetrics),
    queueDelayP95Ms: normalizeNonNegativeInteger(
      loadMetrics?.queueDelay?.p95,
      ZERO,
    ),
    undispatchedRatio: targetOperations > ZERO ?
      undispatchedOperations / targetOperations :
      ZERO,
    timeoutWaits: normalizeNonNegativeInteger(
      loadMetrics?.nonAdmissionTimeoutWaits,
      normalizeNonNegativeInteger(
        loadMetrics?.waitReasons?.timeoutWaits,
        ZERO,
      ),
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
      nonAdmissionAttemptErrors: summarizeSeries(
        metrics.map((metric) => metric.nonAdmissionAttemptErrors),
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

const HARNESS_VERDICTS = Object.freeze({
  PASS: 'PASS',
  FAIL_CORE_INVARIANT: 'FAIL_CORE_INVARIANT',
  BLOCK_EVIDENCE_INCOMPLETE: 'BLOCK_EVIDENCE_INCOMPLETE',
  BLOCK_HARNESS_INVALID: 'BLOCK_HARNESS_INVALID',
  BLOCK_PERFORMANCE_REGRESSION: 'BLOCK_PERFORMANCE_REGRESSION',
  BLOCK_PERFORMANCE_INVALID: 'BLOCK_PERFORMANCE_INVALID',
});

const SCENARIO_HARNESS_INVALID_PATTERNS = Object.freeze([
  'readiness probe timed out',
  'connection closed before response',
  'query timed out',
  'econnrefused',
  'websocket',
  'socket error',
  'harness',
  'teardown failed',
]);

const SCENARIO_CORE_INVARIANT_PATTERNS = Object.freeze([
  'invariant',
  'consistency',
]);

const SCENARIO_EVIDENCE_INCOMPLETE_PATTERNS = Object.freeze([
  'timeout',
  'incomplete',
]);

const READINESS_HARNESS_INVALID_PATTERNS = Object.freeze([
  'harness',
  'socket',
  'refused',
]);

function messageMatchesAnyPattern(message, patterns) {
  return patterns.some((pattern) => message.includes(pattern));
}

function hasMetricObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function exceedsNumericLimit(observedValue, thresholdValue) {
  const observed = normalizeFiniteNumber(observedValue);
  const threshold = normalizeFiniteNumber(thresholdValue);
  return observed !== null && threshold !== null && observed > threshold;
}

function buildScenarioVerdictEvidence(result) {
  const message = String(result?.error || '').toLowerCase();
  const loadMetrics = hasMetricObject(result?.loadMetrics) ?
    result.loadMetrics :
    null;
  const failedOperations = Math.max(
    normalizeNonNegativeInteger(loadMetrics?.failed, ZERO),
    normalizeNonNegativeInteger(loadMetrics?.errors, ZERO),
  );
  const totalOperations = normalizeNonNegativeInteger(
    loadMetrics?.total,
    ZERO,
  );
  const hasInvariantBreach =
    Array.isArray(result?.invariantBreaches) &&
    result.invariantBreaches.length > ZERO;

  return {
    passed: result?.passed === true,
    hasLoadMetrics: loadMetrics !== null,
    hasNoCompletedOperations: loadMetrics !== null && totalOperations === ZERO,
    hasHarnessFailureSignal: messageMatchesAnyPattern(
      message,
      SCENARIO_HARNESS_INVALID_PATTERNS,
    ),
    hasCoreInvariantSignal:
      hasInvariantBreach ||
      failedOperations > ZERO ||
      messageMatchesAnyPattern(message, SCENARIO_CORE_INVARIANT_PATTERNS),
    hasPerformanceRegressionSignal:
      loadMetrics !== null &&
      (
        exceedsNumericLimit(
          loadMetrics?.queueDelay?.p95,
          DEFAULT_SHIP_GATE.maxQueueDelayP95MsP95,
        ) ||
        exceedsNumericLimit(
          loadMetrics?.undispatchedRatio,
          DEFAULT_SHIP_GATE.maxUndispatchedRatioP95,
        ) ||
        exceedsNumericLimit(
          loadMetrics?.nonAdmissionTimeoutWaits,
          DEFAULT_SHIP_GATE.maxTimeoutWaitsP95,
        )
      ),
    hasEvidenceIncompleteSignal:
      messageMatchesAnyPattern(message, SCENARIO_EVIDENCE_INCOMPLETE_PATTERNS) ||
      loadMetrics === null ||
      totalOperations === ZERO,
  };
}

const SCENARIO_VERDICT_RULES = Object.freeze([
  {
    verdict: HARNESS_VERDICTS.PASS,
    reason: 'scenario_passed',
    matches: (evidence) => evidence.passed,
  },
  {
    verdict: HARNESS_VERDICTS.BLOCK_HARNESS_INVALID,
    reason: 'harness_connectivity_or_system_failure',
    matches: (evidence) => evidence.hasHarnessFailureSignal,
  },
  {
    verdict: HARNESS_VERDICTS.FAIL_CORE_INVARIANT,
    reason: 'core_invariant_or_safety_violation',
    matches: (evidence) => evidence.hasCoreInvariantSignal,
  },
  {
    verdict: HARNESS_VERDICTS.BLOCK_PERFORMANCE_REGRESSION,
    reason: 'performance_metric_exceeded_limits',
    matches: (evidence) => evidence.hasPerformanceRegressionSignal,
  },
  {
    verdict: HARNESS_VERDICTS.BLOCK_EVIDENCE_INCOMPLETE,
    reason: 'execution_incomplete_or_metrics_missing',
    matches: (evidence) => evidence.hasEvidenceIncompleteSignal,
  },
  {
    verdict: HARNESS_VERDICTS.BLOCK_PERFORMANCE_INVALID,
    reason: 'unknown_failure_mode',
    matches: () => true,
  },
]);

function classifyScenarioVerdict(result) {
  const evidence = buildScenarioVerdictEvidence(result);
  const rule = SCENARIO_VERDICT_RULES.find((candidate) =>
    candidate.matches(evidence),
  );
  return {
    verdict: rule.verdict,
    reason: rule.reason,
  };
}

function hasFailedCriterionMetric(failedCriteria, metricName) {
  return failedCriteria.some((criterion) => criterion.metric === metricName);
}

function hasFailedCriterionReason(failedCriteria, reason) {
  return failedCriteria.some((criterion) => criterion.reason === reason);
}

function hasDominantFailureModePattern(summary, patterns) {
  const dominantMode = String(summary?.failureModes?.dominantMode || '');
  return messageMatchesAnyPattern(dominantMode, patterns);
}

function buildReadinessVerdictEvidence(summary, failedCriteria) {
  return {
    hasFailedCriteria: failedCriteria.length > ZERO,
    hasEvidenceIncomplete:
      hasFailedCriterionMetric(failedCriteria, 'totalRuns') ||
      hasFailedCriterionReason(failedCriteria, 'metric_unavailable'),
    hasHarnessInvalid:
      hasFailedCriterionReason(failedCriteria, 'harness_crashed') ||
      hasFailedCriterionReason(failedCriteria, 'setup_failed') ||
      hasDominantFailureModePattern(summary, READINESS_HARNESS_INVALID_PATTERNS),
    hasCoreInvariantFailure:
      hasFailedCriterionMetric(failedCriteria, 'failedOperations.p95') ||
      hasFailedCriterionMetric(failedCriteria, 'failureRate'),
    hasPerformanceRegression:
      hasFailedCriterionMetric(failedCriteria, 'queueDelayP95Ms.p95') ||
      hasFailedCriterionMetric(failedCriteria, 'undispatchedRatio.p95') ||
      hasFailedCriterionMetric(failedCriteria, 'timeoutWaits.p95') ||
      hasFailedCriterionMetric(
        failedCriteria,
        'nonAdmissionAttemptErrors.p95',
      ),
  };
}

const READINESS_VERDICT_RULES = Object.freeze([
  {
    verdict: HARNESS_VERDICTS.PASS,
    reason: 'all_criteria_passed',
    matches: (evidence) => !evidence.hasFailedCriteria,
  },
  {
    verdict: HARNESS_VERDICTS.BLOCK_EVIDENCE_INCOMPLETE,
    reason: 'insufficient_runs_or_metrics_unavailable',
    matches: (evidence) => evidence.hasEvidenceIncomplete,
  },
  {
    verdict: HARNESS_VERDICTS.BLOCK_HARNESS_INVALID,
    reason: 'harness_system_error_or_crash',
    matches: (evidence) => evidence.hasHarnessInvalid,
  },
  {
    verdict: HARNESS_VERDICTS.FAIL_CORE_INVARIANT,
    reason: 'safety_or_liveness_invariant_breached',
    matches: (evidence) => evidence.hasCoreInvariantFailure,
  },
  {
    verdict: HARNESS_VERDICTS.BLOCK_PERFORMANCE_REGRESSION,
    reason: 'performance_slo_exceeded_under_load',
    matches: (evidence) => evidence.hasPerformanceRegression,
  },
  {
    verdict: HARNESS_VERDICTS.BLOCK_PERFORMANCE_INVALID,
    reason: 'performance_measurement_invalid',
    matches: () => true,
  },
]);

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
      'nonAdmissionAttemptErrors.p95',
      distributions?.nonAdmissionAttemptErrors?.p95,
      gate.maxNonAdmissionAttemptErrorsP95,
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

  const failedCriteria = criteria.filter(
    (criterion) => criterion.passed !== true,
  );
  const evidence = buildReadinessVerdictEvidence(summary, failedCriteria);
  const rule = READINESS_VERDICT_RULES.find((candidate) =>
    candidate.matches(evidence),
  );

  return {
    decision: failedCriteria.length === ZERO ? 'ship' : 'no-ship',
    verdict: rule.verdict,
    verdictReason: rule.reason,
    criteria,
    failedCriteria,
  };
}

export {
  DEFAULT_SCENARIO,
  DEFAULT_SHIP_GATE,
  HARNESS_VERDICTS,
  extractNodeJoinLoadMetrics,
  extractNodeFailureRebalanceLoadMetrics,
  summarizeValidationRuns,
  classifyScenarioVerdict,
  assessShipReadiness,
};
