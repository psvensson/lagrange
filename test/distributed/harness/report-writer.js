/**
 * Report Writer — produces structured JSON test reports.
 *
 * Accumulates scenario results and writes a final report with
 * per-scenario details and an aggregate summary.
 */

import {writeFile, mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {summarizeInvariantBreaches} from './invariant-breaches.js';

/** Indentation for JSON output. */
const JSON_INDENT = 2;
const ZERO = 0;
const ONE = 1;
const STANDARD_SUMMARY_SIMILARITY_FALLBACK = 'default';
const STANDARD_SUMMARY_BASELINE_ENGINE = 'postgres';
const BENCHMARK_DETAILS_KEY_BENCHMARK = 'benchmark';
const BENCHMARK_DETAILS_KEY_BASELINE = 'baseline';
const BENCHMARK_DETAILS_KEY_COMPARISON = 'comparison';
const BENCHMARK_DETAILS_KEY_VERIFICATION = 'verification';
const BENCHMARK_DETAILS_KEY_POLICY = 'policy';
const BENCHMARK_DETAILS_KEY_PHASE_TIMELINE = 'phaseTimeline';
const BENCHMARK_DETAILS_KEY_CHANNEL_METRICS = 'channelMetrics';
const BENCHMARK_DETAILS_KEY_PARITY = 'parity';
const BENCHMARK_DETAILS_KEY_SATURATION = 'saturation';
const BENCHMARK_DETAILS_KEY_EFFECTIVE_ADMISSION_POLICY =
  'effectiveAdmissionPolicy';
const BENCHMARK_DETAILS_KEY_DIAGNOSTICS_COVERAGE = 'diagnosticsCoverage';
const PERFORMANCE_INVALID_REASON_CORRECTNESS_FAILED = 'correctness_failed';
const PERFORMANCE_INVALID_REASON_METRICS_UNAVAILABLE = 'metrics_unavailable';
const LOAD_METRICS_FIELD_ATTEMPT_ERRORS = 'attemptErrors';
const LOAD_METRICS_FIELD_QUEUE_DELAY = 'queueDelay';
const LOAD_METRICS_FIELD_DISTINCT_ERRORS = 'distinctErrors';
const LOAD_METRICS_FIELD_TARGET_OPERATIONS = 'targetOperations';
const LOAD_METRICS_FIELD_DISPATCHED_OPERATIONS = 'dispatchedOperations';
const LOAD_METRICS_FIELD_UNDISPATCHED_OPERATIONS = 'undispatchedOperations';
const LOAD_METRICS_FIELD_UNDISPATCHED_BY_REASON = 'undispatchedByReason';
const LOAD_METRICS_FIELD_PER_NODE = 'perNode';
const LOAD_METRICS_UNDISPATCHED_REASON_CAPACITY = 'capacity';
const LOAD_METRICS_UNDISPATCHED_REASON_DURATION_TIMEOUT = 'durationTimeout';
const LOAD_METRICS_UNDISPATCHED_REASON_CANCELLED = 'cancelled';
const DIAGNOSTICS_COVERAGE_STATUS_AVAILABLE = 'available';
const PARITY_STATUS_UNKNOWN = 'unknown';
const DIAGNOSTICS_COVERAGE_STATUS_UNAVAILABLE = 'unavailable';
const DIAGNOSTICS_COVERAGE_REASON_NOT_REPORTED = 'not_reported';
const CLUSTER_SIZE_PATH_REGEX = /(?:^|[^a-z0-9])size(\d+)(?:[^0-9]|$)/i;
const WRITE_PATH_TOP_PHASE_LIMIT = 3;
const WRITE_PATH_SUMMARY_PHASE_LIMIT = 5;
const SCALE_EFFICIENCY_OPPORTUNITY_LIMIT = 5;

// --- Optimization priority metadata ---
const PRIORITY_CRITICAL = 'critical';
const PRIORITY_HIGH = 'high';
const PRIORITY_MEDIUM = 'medium';
const PRIORITY_LOW = 'low';
const PRIORITY_ORDER = Object.freeze({
  [PRIORITY_CRITICAL]: 4,
  [PRIORITY_HIGH]: 3,
  [PRIORITY_MEDIUM]: 2,
  [PRIORITY_LOW]: 1,
});

const COMPONENT_REPLICATION_WRITE_PATH = 'replication_write_path';
const COMPONENT_TAIL_LATENCY_PATH = 'tail_latency_path';
const COMPONENT_CONVERGENCE_CONTROL_PLANE = 'convergence_control_plane';
const COMPONENT_ERROR_RETRY_PATH = 'error_retry_path';
const COMPONENT_MEMORY_LIFECYCLE = 'memory_lifecycle';
const COMPONENT_ANOMALY_HOTSPOTS = 'anomaly_hotspots';
const COMPONENT_UNKNOWN = 'unknown';

const SIGNAL_BASELINE_THROUGHPUT_GAP = 'baseline_throughput_gap';
const SIGNAL_BASELINE_LATENCY_GAP = 'baseline_latency_gap';
const SIGNAL_INTERNAL_TAIL_LATENCY = 'internal_tail_latency';
const SIGNAL_CONVERGENCE_SETTLE_TIME = 'convergence_settle_time';
const SIGNAL_OVER_TARGET_VOTER_DURATION = 'over_target_voter_duration';
const SIGNAL_PARTITION_HOTSPOTS = 'partition_hotspots';
const SIGNAL_LOAD_FAILURE_RATE = 'load_failure_rate';
const SIGNAL_DISPATCH_QUEUE_PRESSURE = 'dispatch_queue_pressure';
const SIGNAL_ADMISSION_THROTTLING_PRESSURE = 'admission_throttling_pressure';
const SIGNAL_MEMORY_LEAK = 'memory_leak';
const SIGNAL_LOG_ANOMALIES = 'log_anomalies';

const MAX_OPTIMIZATION_ITEMS_PER_SCENARIO = 3;
const OPTIMIZATION_SUMMARY_TOP_COMPONENT_LIMIT = 5;
const OPTIMIZATION_SUMMARY_TOP_PARTITION_LIMIT = 5;
const PARTITION_HOTSPOT_LIMIT = 8;
const PARTITION_HOTSPOT_RECENT_OP_LIMIT = 3;

// --- Scoring thresholds ---
const THROUGHPUT_RATIO_CRITICAL = 0.01;
const THROUGHPUT_RATIO_HIGH = 0.03;
const THROUGHPUT_RATIO_MEDIUM = 0.1;
const LATENCY_RATIO_CRITICAL = 500;
const LATENCY_RATIO_HIGH = 100;
const LATENCY_RATIO_MEDIUM = 25;
const INTERNAL_TAIL_RATIO_CRITICAL = 100;
const INTERNAL_TAIL_RATIO_HIGH = 40;
const INTERNAL_TAIL_RATIO_MEDIUM = 15;
const CONVERGENCE_SETTLE_TIME_HIGH_MS = 10000;
const CONVERGENCE_SETTLE_TIME_MEDIUM_MS = 5000;
const OVER_TARGET_DURATION_HIGH_MS = 2000;
const OVER_TARGET_DURATION_MEDIUM_MS = 500;
const LOAD_FAILURE_RATE_HIGH = 0.01;
const LOAD_FAILURE_RATE_MEDIUM = 0.001;
const QUEUE_UNDISPATCHED_RATIO_CRITICAL = 0.6;
const QUEUE_UNDISPATCHED_RATIO_HIGH = 0.3;
const QUEUE_UNDISPATCHED_RATIO_MEDIUM = 0.1;
const QUEUE_DELAY_P95_CRITICAL_MS = 750;
const QUEUE_DELAY_P95_HIGH_MS = 250;
const QUEUE_DELAY_P95_MEDIUM_MS = 75;
const ADMISSION_SIGNAL_RATIO_CRITICAL = 0.5;
const ADMISSION_SIGNAL_RATIO_HIGH = 0.2;
const ADMISSION_SIGNAL_RATIO_MEDIUM = 0.05;
const ADMISSION_SIGNAL_COUNT_HIGH = 500;
const ADMISSION_SIGNAL_COUNT_MEDIUM = 100;
const ANOMALY_COUNT_HIGH = 5;
const ANOMALY_COUNT_MEDIUM = 1;

const SCORE_CRITICAL = 95;
const SCORE_HIGH = 80;
const SCORE_MEDIUM = 60;
const SCORE_LOW = 40;

/**
 * Build a scenario entry from a name and result object.
 * Includes load metrics (latency percentiles, throughput) when present.
 * @param {string} scenarioName
 * @param {Object} result
 * @returns {Object} Scenario entry for the report
 */
function buildScenarioEntry(scenarioName, result) {
  const normalizedDetails = normalizeScenarioDetails(result.details);
  const entry = {
    scenario: scenarioName,
    passed: Boolean(result.passed),
    duration: result.duration || 0,
    clusterSize: normalizeClusterSize(result.clusterSize),
    startedAt: result.startedAt || null,
    convergenceTiming: result.convergenceTiming || null,
    analysisSummary: result.analysisSummary || null,
    error: result.error || null,
    stackTrace: result.stackTrace || null,
    logs: result.logs || null,
    playback: result.playback || null,
    trace: result.trace || null,
    traceAssertion: result.traceAssertion || null,
    memoryLeak: result.memoryLeak || null,
    memoryLeakAssertion: result.memoryLeakAssertion || null,
    performanceDiagnostics: result.performanceDiagnostics || null,
    details: normalizedDetails,
    invariantBreaches: resolveScenarioInvariantBreaches(result, normalizedDetails),
  };

  if (result.exampleResults) {
    entry.exampleResults = result.exampleResults;
  } else if (result.details &&
    typeof result.details === 'object' &&
    result.details.exampleResults) {
    entry.exampleResults = result.details.exampleResults;
  } else {
    entry.exampleResults = null;
  }

  if (result.loadMetrics) {
    entry.loadMetrics = buildLoadMetricsEntry(result.loadMetrics);
  } else {
    entry.loadMetrics = null;
  }

  entry.performanceMeasurement = buildPerformanceMeasurementEntry(
    result,
    entry.loadMetrics,
  );

  entry.partitionHotspots = buildPartitionHotspots(entry);
  entry.optimizationPriorities = buildOptimizationPriorities(entry);

  return entry;
}

function normalizeScenarioDetails(details) {
  if (!details || typeof details !== 'object' || Array.isArray(details)) {
    return details || null;
  }
  if (details.details &&
      typeof details.details === 'object' &&
      !Array.isArray(details.details)) {
    return {
      ...details,
      details: normalizeBenchmarkDetailsEnvelope(details.details),
    };
  }
  return normalizeBenchmarkDetailsEnvelope(details);
}

function normalizeBenchmarkDetailsEnvelope(details) {
  if (!isBenchmarkDetailsShape(details)) {
    return details;
  }
  const benchmark = normalizeObject(details[BENCHMARK_DETAILS_KEY_BENCHMARK]);
  return {
    ...details,
    [BENCHMARK_DETAILS_KEY_BENCHMARK]: {
      ...benchmark,
      [BENCHMARK_DETAILS_KEY_SATURATION]:
        normalizeSaturationDetails(benchmark[BENCHMARK_DETAILS_KEY_SATURATION]),
    },
    [BENCHMARK_DETAILS_KEY_BASELINE]:
      normalizeObject(details[BENCHMARK_DETAILS_KEY_BASELINE]),
    [BENCHMARK_DETAILS_KEY_COMPARISON]:
      normalizeObject(details[BENCHMARK_DETAILS_KEY_COMPARISON]),
    [BENCHMARK_DETAILS_KEY_PHASE_TIMELINE]:
      Array.isArray(details[BENCHMARK_DETAILS_KEY_PHASE_TIMELINE]) ?
        [...details[BENCHMARK_DETAILS_KEY_PHASE_TIMELINE]] :
        [],
    [BENCHMARK_DETAILS_KEY_CHANNEL_METRICS]:
      normalizeObject(details[BENCHMARK_DETAILS_KEY_CHANNEL_METRICS]),
    [BENCHMARK_DETAILS_KEY_PARITY]:
      normalizeParityDetails(details[BENCHMARK_DETAILS_KEY_PARITY]),
    [BENCHMARK_DETAILS_KEY_EFFECTIVE_ADMISSION_POLICY]:
      normalizeEffectiveAdmissionPolicy(
        details[BENCHMARK_DETAILS_KEY_EFFECTIVE_ADMISSION_POLICY],
      ),
    [BENCHMARK_DETAILS_KEY_DIAGNOSTICS_COVERAGE]:
      normalizeDiagnosticsCoverage(
        details[BENCHMARK_DETAILS_KEY_DIAGNOSTICS_COVERAGE],
      ),
  };
}

function normalizeSaturationDetails(saturation) {
  if (!saturation || typeof saturation !== 'object' || Array.isArray(saturation)) {
    return {};
  }
  return {
    ...saturation,
    cdcForwardTimeoutCount:
      normalizeFiniteNumber(saturation.cdcForwardTimeoutCount) || ZERO,
    systemTableQueryTimeoutCount:
      normalizeFiniteNumber(saturation.systemTableQueryTimeoutCount) || ZERO,
    snapshotCollectionErrorCount:
      normalizeFiniteNumber(saturation.snapshotCollectionErrorCount) || ZERO,
  };
}

function normalizeObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return {...value};
}

function resolveScenarioInvariantBreaches(result, normalizedDetails) {
  const explicitBreaches = result?.invariantBreaches;
  if (explicitBreaches &&
      typeof explicitBreaches === 'object' &&
      Array.isArray(explicitBreaches.failing)) {
    return {
      ...explicitBreaches,
      failing: [...explicitBreaches.failing],
      hardBreaches: Array.isArray(explicitBreaches.hardBreaches) ?
        [...explicitBreaches.hardBreaches] :
        [],
      softBreaches: Array.isArray(explicitBreaches.softBreaches) ?
        [...explicitBreaches.softBreaches] :
        [],
    };
  }

  const verificationBreaches = normalizedDetails?.verification?.invariantBreaches;
  if (verificationBreaches &&
      typeof verificationBreaches === 'object' &&
      Array.isArray(verificationBreaches.failing)) {
    return {
      ...verificationBreaches,
      failing: [...verificationBreaches.failing],
      hardBreaches: Array.isArray(verificationBreaches.hardBreaches) ?
        [...verificationBreaches.hardBreaches] :
        [],
      softBreaches: Array.isArray(verificationBreaches.softBreaches) ?
        [...verificationBreaches.softBreaches] :
        [],
    };
  }

  return summarizeInvariantBreaches(
    normalizedDetails?.diagnostics?.rootCauseBundle?.invariants,
  );
}

function buildPerformanceMeasurementEntry(result, loadMetrics) {
  const observedOpsPerSec = normalizeFiniteNumber(loadMetrics?.opsPerSec);
  const observedP99LatencyMs = normalizeFiniteNumber(loadMetrics?.latency?.p99);
  const available = observedOpsPerSec !== null || observedP99LatencyMs !== null;
  const validForComparison = result?.passed === true && available;
  let invalidReason = null;
  if (!available) {
    invalidReason = PERFORMANCE_INVALID_REASON_METRICS_UNAVAILABLE;
  } else if (result?.passed !== true) {
    invalidReason = PERFORMANCE_INVALID_REASON_CORRECTNESS_FAILED;
  }
  return {
    available,
    validForComparison,
    invalidReason,
    observedOpsPerSec,
    observedP99LatencyMs,
  };
}

function resolvePerformanceMeasurement(entry) {
  const measurement = entry?.performanceMeasurement;
  if (measurement &&
      typeof measurement === 'object' &&
      !Array.isArray(measurement)) {
    return {
      available: measurement.available === true,
      validForComparison: measurement.validForComparison === true,
      invalidReason: measurement.invalidReason || null,
      observedOpsPerSec: normalizeFiniteNumber(measurement.observedOpsPerSec),
      observedP99LatencyMs:
        normalizeFiniteNumber(measurement.observedP99LatencyMs),
    };
  }

  const observedOpsPerSec = normalizeFiniteNumber(entry?.loadMetrics?.opsPerSec);
  const observedP99LatencyMs = normalizeFiniteNumber(entry?.loadMetrics?.latency?.p99);
  const available = observedOpsPerSec !== null || observedP99LatencyMs !== null;
  return {
    available,
    validForComparison: entry?.passed === true && available,
    invalidReason: available ?
      (entry?.passed === true ? null : PERFORMANCE_INVALID_REASON_CORRECTNESS_FAILED) :
      PERFORMANCE_INVALID_REASON_METRICS_UNAVAILABLE,
    observedOpsPerSec,
    observedP99LatencyMs,
  };
}

function normalizeParityDetails(parity) {
  if (!parity || typeof parity !== 'object' || Array.isArray(parity)) {
    return {
      status: PARITY_STATUS_UNKNOWN,
      reasons: [],
      configured: {},
      effective: {},
    };
  }
  return {
    ...parity,
    status: typeof parity.status === 'string' && parity.status ?
      parity.status :
      PARITY_STATUS_UNKNOWN,
    reasons: Array.isArray(parity.reasons) ?
      [...parity.reasons] :
      [],
    configured: normalizeObject(parity.configured),
    effective: normalizeObject(parity.effective),
  };
}

function normalizeEffectiveAdmissionPolicy(policy) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    return {
      resolved: {},
      sources: {},
      conflicts: [],
    };
  }
  return {
    ...policy,
    resolved: normalizeObject(policy.resolved),
    sources: normalizeObject(policy.sources),
    conflicts: Array.isArray(policy.conflicts) ?
      [...policy.conflicts] :
      [],
  };
}

function normalizeDiagnosticsCoverage(coverage) {
  if (!coverage || typeof coverage !== 'object' || Array.isArray(coverage)) {
    return {
      status: DIAGNOSTICS_COVERAGE_STATUS_UNAVAILABLE,
      reason: DIAGNOSTICS_COVERAGE_REASON_NOT_REPORTED,
      sampleCount: ZERO,
    };
  }
  return {
    ...coverage,
    status: typeof coverage.status === 'string' && coverage.status ?
      coverage.status :
      DIAGNOSTICS_COVERAGE_STATUS_UNAVAILABLE,
    reason: typeof coverage.reason === 'string' && coverage.reason ?
      coverage.reason :
      DIAGNOSTICS_COVERAGE_REASON_NOT_REPORTED,
    sampleCount: normalizeFiniteNumber(coverage.sampleCount) || ZERO,
  };
}

/**
 * Normalize load metrics while preserving additive observability fields.
 * @param {Object} loadMetrics
 * @returns {Object}
 */
function buildLoadMetricsEntry(loadMetrics) {
  const latency = normalizeLatencyMetrics(loadMetrics?.latency);
  const normalized = {
    total: normalizeFiniteNumber(loadMetrics?.total) || ZERO,
    success: normalizeFiniteNumber(loadMetrics?.success) || ZERO,
    failed: normalizeFiniteNumber(loadMetrics?.failed) || ZERO,
    errors: normalizeFiniteNumber(loadMetrics?.errors) || ZERO,
    latency,
    opsPerSec: normalizeFiniteNumber(loadMetrics?.opsPerSec) || ZERO,
    [LOAD_METRICS_FIELD_ATTEMPT_ERRORS]:
      normalizeFiniteNumber(loadMetrics?.[LOAD_METRICS_FIELD_ATTEMPT_ERRORS]) ||
      ZERO,
    [LOAD_METRICS_FIELD_QUEUE_DELAY]: normalizeQueueDelayMetrics(
      loadMetrics?.[LOAD_METRICS_FIELD_QUEUE_DELAY],
    ),
    [LOAD_METRICS_FIELD_DISTINCT_ERRORS]: Array.isArray(
      loadMetrics?.[LOAD_METRICS_FIELD_DISTINCT_ERRORS],
    ) ?
      [...loadMetrics[LOAD_METRICS_FIELD_DISTINCT_ERRORS]] :
      [],
    [LOAD_METRICS_FIELD_TARGET_OPERATIONS]:
      normalizeFiniteNumber(loadMetrics?.[LOAD_METRICS_FIELD_TARGET_OPERATIONS]) ||
      ZERO,
    [LOAD_METRICS_FIELD_DISPATCHED_OPERATIONS]:
      normalizeFiniteNumber(
        loadMetrics?.[LOAD_METRICS_FIELD_DISPATCHED_OPERATIONS],
      ) || ZERO,
    [LOAD_METRICS_FIELD_UNDISPATCHED_OPERATIONS]:
      normalizeFiniteNumber(
        loadMetrics?.[LOAD_METRICS_FIELD_UNDISPATCHED_OPERATIONS],
      ) || ZERO,
    [LOAD_METRICS_FIELD_UNDISPATCHED_BY_REASON]:
      normalizeUndispatchedReasonMetrics(
        loadMetrics?.[LOAD_METRICS_FIELD_UNDISPATCHED_BY_REASON],
      ),
    [LOAD_METRICS_FIELD_PER_NODE]: normalizePerNodeMetrics(
      loadMetrics?.[LOAD_METRICS_FIELD_PER_NODE],
    ),
  };
  if (loadMetrics && typeof loadMetrics === 'object') {
    for (const [field, value] of Object.entries(loadMetrics)) {
      if (Object.hasOwn(normalized, field)) {
        continue;
      }
      if (value === undefined) {
        continue;
      }
      normalized[field] = cloneAdditiveMetricValue(value);
    }
  }
  return normalized;
}

function normalizeLatencyMetrics(latency) {
  if (!latency || typeof latency !== 'object') {
    return {
      avg: ZERO,
      p50: ZERO,
      p95: ZERO,
      p99: ZERO,
    };
  }
  return {
    avg: normalizeFiniteNumber(latency.avg) || ZERO,
    p50: normalizeFiniteNumber(latency.p50) || ZERO,
    p95: normalizeFiniteNumber(latency.p95) || ZERO,
    p99: normalizeFiniteNumber(latency.p99) || ZERO,
  };
}

function normalizeQueueDelayMetrics(queueDelay) {
  if (!queueDelay || typeof queueDelay !== 'object') {
    return {
      avg: ZERO,
      p50: ZERO,
      p95: ZERO,
      p99: ZERO,
      max: ZERO,
    };
  }
  return {
    avg: normalizeFiniteNumber(queueDelay.avg) || ZERO,
    p50: normalizeFiniteNumber(queueDelay.p50) || ZERO,
    p95: normalizeFiniteNumber(queueDelay.p95) || ZERO,
    p99: normalizeFiniteNumber(queueDelay.p99) || ZERO,
    max: normalizeFiniteNumber(queueDelay.max) || ZERO,
  };
}

function normalizeUndispatchedReasonMetrics(reasons) {
  const normalized = {
    [LOAD_METRICS_UNDISPATCHED_REASON_CAPACITY]: ZERO,
    [LOAD_METRICS_UNDISPATCHED_REASON_DURATION_TIMEOUT]: ZERO,
    [LOAD_METRICS_UNDISPATCHED_REASON_CANCELLED]: ZERO,
  };
  if (!reasons || typeof reasons !== 'object' || Array.isArray(reasons)) {
    return normalized;
  }
  for (const [reasonKey, value] of Object.entries(reasons)) {
    normalized[reasonKey] = normalizeFiniteNumber(value) || ZERO;
  }
  return normalized;
}

function normalizePerNodeMetrics(perNode) {
  if (!perNode || typeof perNode !== 'object' || Array.isArray(perNode)) {
    return {};
  }
  const normalized = {};
  for (const [nodeId, nodeMetrics] of Object.entries(perNode)) {
    if (!nodeMetrics || typeof nodeMetrics !== 'object' ||
      Array.isArray(nodeMetrics)) {
      normalized[nodeId] = {
        dispatched: ZERO,
        success: ZERO,
        attemptErrors: ZERO,
        admissionSignals: ZERO,
      };
      continue;
    }
    normalized[nodeId] = {
      dispatched: normalizeFiniteNumber(nodeMetrics.dispatched) || ZERO,
      success: normalizeFiniteNumber(nodeMetrics.success) || ZERO,
      attemptErrors: normalizeFiniteNumber(nodeMetrics.attemptErrors) || ZERO,
      admissionSignals: normalizeFiniteNumber(nodeMetrics.admissionSignals) || ZERO,
    };
  }
  return normalized;
}

function cloneAdditiveMetricValue(value) {
  if (Array.isArray(value)) {
    return [...value];
  }
  if (value && typeof value === 'object') {
    return {...value};
  }
  return value;
}

/**
 * Build ranked optimization priorities from scenario evidence.
 * @param {Object} scenarioEntry
 * @returns {Array<Object>|null}
 */
function buildOptimizationPriorities(scenarioEntry) {
  const priorities = [];
  const benchmarkDetails = resolveBenchmarkDetails(scenarioEntry.details);
  const comparison = benchmarkDetails?.comparison || null;
  const convergence = benchmarkDetails?.convergence ||
    scenarioEntry?.convergenceTiming ||
    null;
  const loadMetrics = scenarioEntry?.loadMetrics || null;
  const memoryLeak = scenarioEntry?.memoryLeak || null;
  const analysisSummary = scenarioEntry?.analysisSummary || null;
  const partitionHotspots = Array.isArray(scenarioEntry?.partitionHotspots) ?
    scenarioEntry.partitionHotspots :
    [];

  const throughputRatio = normalizeFiniteNumber(
    comparison?.throughputRatioSutToBaseline,
  );
  const sutOpsPerSec = normalizeFiniteNumber(comparison?.sutOpsPerSec);
  const baselineTps = normalizeFiniteNumber(comparison?.baselineTps);
  if (throughputRatio !== null &&
    sutOpsPerSec !== null &&
    baselineTps !== null) {
    if (throughputRatio < THROUGHPUT_RATIO_MEDIUM) {
      const rating = scoreThroughputRatio(throughputRatio);
      priorities.push({
        component: COMPONENT_REPLICATION_WRITE_PATH,
        signal: SIGNAL_BASELINE_THROUGHPUT_GAP,
        priority: rating.priority,
        score: rating.score,
        reason:
          'System throughput is significantly below baseline under identical workload.',
        evidence: {
          throughputRatioSutToBaseline: throughputRatio,
          sutOpsPerSec,
          baselineTps,
        },
      });
    }
  }

  const latencyRatio = normalizeFiniteNumber(
    comparison?.p99LatencyRatioSutToBaselineAvg,
  );
  const sutP99LatencyMs = normalizeFiniteNumber(comparison?.sutP99LatencyMs);
  const baselineLatencyAvgMs = normalizeFiniteNumber(
    comparison?.baselineLatencyAvgMs,
  );
  if (latencyRatio !== null &&
    sutP99LatencyMs !== null &&
    baselineLatencyAvgMs !== null) {
    if (latencyRatio > LATENCY_RATIO_MEDIUM) {
      const rating = scoreLatencyRatio(latencyRatio);
      priorities.push({
        component: COMPONENT_TAIL_LATENCY_PATH,
        signal: SIGNAL_BASELINE_LATENCY_GAP,
        priority: rating.priority,
        score: rating.score,
        reason:
          'Tail latency is significantly higher than baseline and dominates user-visible delays.',
        evidence: {
          p99LatencyRatioSutToBaselineAvg: latencyRatio,
          sutP99LatencyMs,
          baselineLatencyAvgMs,
        },
      });
    }
  }

  const p50 = normalizeFiniteNumber(loadMetrics?.latency?.p50);
  const p99 = normalizeFiniteNumber(loadMetrics?.latency?.p99);
  if (p50 !== null && p99 !== null && p50 > ZERO) {
    const internalTailRatio = p99 / p50;
    if (internalTailRatio > INTERNAL_TAIL_RATIO_MEDIUM) {
      const rating = scoreInternalTailRatio(internalTailRatio);
      priorities.push({
        component: COMPONENT_TAIL_LATENCY_PATH,
        signal: SIGNAL_INTERNAL_TAIL_LATENCY,
        priority: rating.priority,
        score: rating.score,
        reason:
          'Large p99/p50 spread indicates queueing or lock contention on slow-path operations.',
        evidence: {
          p50LatencyMs: p50,
          p99LatencyMs: p99,
          p99ToP50Ratio: internalTailRatio,
        },
      });
    }
  }

  const settledAfterMs = normalizeFiniteNumber(convergence?.settledAfterMs);
  if (settledAfterMs !== null &&
    settledAfterMs > CONVERGENCE_SETTLE_TIME_MEDIUM_MS) {
    const rating = settledAfterMs > CONVERGENCE_SETTLE_TIME_HIGH_MS ?
      {priority: PRIORITY_HIGH, score: SCORE_HIGH} :
      {priority: PRIORITY_MEDIUM, score: SCORE_MEDIUM};
    priorities.push({
      component: COMPONENT_CONVERGENCE_CONTROL_PLANE,
      signal: SIGNAL_CONVERGENCE_SETTLE_TIME,
      priority: rating.priority,
      score: rating.score,
      reason:
        'Convergence delay suggests extra work in replica movement, ' +
        'promotion, or membership updates.',
      evidence: {
        settledAfterMs,
        leaderChanges: normalizeFiniteNumber(convergence?.leaderChanges),
      },
    });
  }

  const maxOverTargetMs = normalizeFiniteNumber(
    convergence?.maxOverTargetMs,
  );
  if (maxOverTargetMs !== null &&
    maxOverTargetMs > OVER_TARGET_DURATION_MEDIUM_MS) {
    const rating = maxOverTargetMs > OVER_TARGET_DURATION_HIGH_MS ?
      {priority: PRIORITY_HIGH, score: SCORE_HIGH} :
      {priority: PRIORITY_MEDIUM, score: SCORE_MEDIUM};
    priorities.push({
      component: COMPONENT_CONVERGENCE_CONTROL_PLANE,
      signal: SIGNAL_OVER_TARGET_VOTER_DURATION,
      priority: rating.priority,
      score: rating.score,
      reason:
        'Over-target voter windows indicate delayed learner demotion ' +
        'or replica operation completion.',
      evidence: {
        maxOverTargetMs,
      },
    });
  }

  if (partitionHotspots.length > ZERO) {
    const primaryHotspot = partitionHotspots[ZERO];
    const primaryScore = normalizeFiniteNumber(primaryHotspot?.hotspotScore) || ZERO;
    if (primaryScore > ZERO) {
      priorities.push({
        component: COMPONENT_CONVERGENCE_CONTROL_PLANE,
        signal: SIGNAL_PARTITION_HOTSPOTS,
        priority: primaryScore >= SCORE_HIGH ? PRIORITY_HIGH : PRIORITY_MEDIUM,
        score: Math.min(SCORE_CRITICAL, Math.max(SCORE_MEDIUM, primaryScore)),
        reason:
          'Per-partition diagnostics indicate localized membership churn ' +
          'and operation pressure on specific partitions.',
        evidence: {
          hotspotCount: partitionHotspots.length,
          topPartitionId: primaryHotspot?.partitionId || null,
          topPartitionScore: primaryScore,
          topPartitionOverTargetMs:
            normalizeFiniteNumber(primaryHotspot?.overTargetMs) || ZERO,
          topPartitionExcessVoters:
            normalizeFiniteNumber(primaryHotspot?.excessVoters) || ZERO,
        },
      });
    }
  }

  const targetOperations = normalizeFiniteNumber(
    loadMetrics?.targetOperations,
  ) || ZERO;
  const undispatchedOperations = normalizeFiniteNumber(
    loadMetrics?.undispatchedOperations,
  ) || ZERO;
  const undispatchedRatio = targetOperations > ZERO ?
    undispatchedOperations / targetOperations :
    null;
  const queueDelayP95Ms = normalizeFiniteNumber(loadMetrics?.queueDelay?.p95);
  const queueDelayP99Ms = normalizeFiniteNumber(loadMetrics?.queueDelay?.p99);
  if ((undispatchedRatio !== null &&
      undispatchedRatio >= QUEUE_UNDISPATCHED_RATIO_MEDIUM) ||
      (queueDelayP95Ms !== null &&
      queueDelayP95Ms >= QUEUE_DELAY_P95_MEDIUM_MS)) {
    const rating = scoreQueuePressure(
      undispatchedRatio,
      queueDelayP95Ms,
    );
    priorities.push({
      component: COMPONENT_REPLICATION_WRITE_PATH,
      signal: SIGNAL_DISPATCH_QUEUE_PRESSURE,
      priority: rating.priority,
      score: rating.score,
      reason:
        'Dispatch backlog and queue delay indicate scheduler pressure and insufficient load completion capacity.',
      evidence: {
        targetOperations,
        undispatchedOperations,
        undispatchedRatio,
        queueDelayP95Ms,
        queueDelayP99Ms,
      },
    });
  }

  let admissionSignalCount = ZERO;
  const perNodeMetrics = loadMetrics?.perNode &&
    typeof loadMetrics.perNode === 'object' ?
    loadMetrics.perNode :
    {};
  for (const nodeMetrics of Object.values(perNodeMetrics)) {
    admissionSignalCount += normalizeFiniteNumber(
      nodeMetrics?.admissionSignals,
    ) || ZERO;
  }
  const attemptErrors = normalizeFiniteNumber(loadMetrics?.attemptErrors) || ZERO;
  const totalAttempts = (normalizeFiniteNumber(loadMetrics?.total) || ZERO) +
    attemptErrors;
  const admissionSignalRatio = totalAttempts > ZERO ?
    admissionSignalCount / totalAttempts :
    null;
  if ((admissionSignalRatio !== null &&
      admissionSignalRatio >= ADMISSION_SIGNAL_RATIO_MEDIUM) ||
      admissionSignalCount >= ADMISSION_SIGNAL_COUNT_MEDIUM) {
    const rating = scoreAdmissionPressure(
      admissionSignalRatio,
      admissionSignalCount,
    );
    priorities.push({
      component: COMPONENT_ERROR_RETRY_PATH,
      signal: SIGNAL_ADMISSION_THROTTLING_PRESSURE,
      priority: rating.priority,
      score: rating.score,
      reason:
        'Admission throttling signals dominate retries and cap realized throughput.',
      evidence: {
        admissionSignalCount,
        admissionSignalRatio,
        attemptErrors,
        totalAttempts,
        loadMaxInFlightPerNode: normalizeFiniteNumber(
          benchmarkDetails?.effectiveAdmissionPolicy?.resolved?.loadMaxInFlightPerNode,
        ),
      },
    });
  }

  const totalLoadOps = normalizeFiniteNumber(loadMetrics?.total) || ZERO;
  const failedLoadOps = normalizeFiniteNumber(loadMetrics?.failed) || ZERO;
  const erroredLoadOps = normalizeFiniteNumber(loadMetrics?.errors) || ZERO;
  if (totalLoadOps > ZERO) {
    const failureRate = (failedLoadOps + erroredLoadOps) / totalLoadOps;
    if (failureRate > LOAD_FAILURE_RATE_MEDIUM) {
      const rating = failureRate > LOAD_FAILURE_RATE_HIGH ?
        {priority: PRIORITY_HIGH, score: SCORE_HIGH} :
        {priority: PRIORITY_MEDIUM, score: SCORE_MEDIUM};
      priorities.push({
        component: COMPONENT_ERROR_RETRY_PATH,
        signal: SIGNAL_LOAD_FAILURE_RATE,
        priority: rating.priority,
        score: rating.score,
        reason:
          'Observed request failures suggest expensive retries or transient routing instability.',
        evidence: {
          total: totalLoadOps,
          failed: failedLoadOps,
          errors: erroredLoadOps,
          failureRate,
        },
      });
    }
  }

  if (memoryLeak?.leakDetected === true) {
    priorities.push({
      component: COMPONENT_MEMORY_LIFECYCLE,
      signal: SIGNAL_MEMORY_LEAK,
      priority: PRIORITY_CRITICAL,
      score: SCORE_CRITICAL,
      reason:
        'Leak signal detected in sustained sampling and should be treated as release-blocking.',
      evidence: {
        leakingNodeCount: normalizeFiniteNumber(memoryLeak?.leakingNodeCount) ||
          ZERO,
        leakingNodes: Array.isArray(memoryLeak?.leakingNodes) ?
          memoryLeak.leakingNodes :
          [],
      },
    });
  }

  const anomalyCount = normalizeFiniteNumber(analysisSummary?.anomaly_count);
  if (anomalyCount !== null && anomalyCount >= ANOMALY_COUNT_MEDIUM) {
    const rating = anomalyCount >= ANOMALY_COUNT_HIGH ?
      {priority: PRIORITY_HIGH, score: SCORE_HIGH} :
      {priority: PRIORITY_MEDIUM, score: SCORE_MEDIUM};
    priorities.push({
      component: COMPONENT_ANOMALY_HOTSPOTS,
      signal: SIGNAL_LOG_ANOMALIES,
      priority: rating.priority,
      score: rating.score,
      reason:
        'Detected structured anomalies in logs; addressing these often ' +
        'removes hidden throughput drag.',
      evidence: {
        anomalyCount,
        anomalyTypes: Array.isArray(analysisSummary?.anomaly_types) ?
          analysisSummary.anomaly_types :
          [],
      },
    });
  }

  if (priorities.length === ZERO) {
    return null;
  }

  const deduplicated = deduplicateOptimizationPriorities(priorities);
  deduplicated.sort(compareOptimizationPriority);
  return deduplicated.slice(ZERO, MAX_OPTIMIZATION_ITEMS_PER_SCENARIO);
}

function isBenchmarkDetailsShape(details) {
  if (!details || typeof details !== 'object') {
    return false;
  }
  const hasBenchmarkEnvelope =
    details[BENCHMARK_DETAILS_KEY_BENCHMARK] &&
    details[BENCHMARK_DETAILS_KEY_BASELINE] &&
    details[BENCHMARK_DETAILS_KEY_COMPARISON];
  if (hasBenchmarkEnvelope) {
    return true;
  }
  if (details[BENCHMARK_DETAILS_KEY_VERIFICATION] &&
      details[BENCHMARK_DETAILS_KEY_POLICY]) {
    return true;
  }
  if (Array.isArray(details[BENCHMARK_DETAILS_KEY_PHASE_TIMELINE]) &&
      details[BENCHMARK_DETAILS_KEY_CHANNEL_METRICS] &&
      typeof details[BENCHMARK_DETAILS_KEY_CHANNEL_METRICS] === 'object') {
    return true;
  }
  return false;
}

function resolveBenchmarkDetails(details) {
  if (!details || typeof details !== 'object' || Array.isArray(details)) {
    return null;
  }
  if (details.details &&
      typeof details.details === 'object' &&
      !Array.isArray(details.details)) {
    return details.details;
  }
  if (isBenchmarkDetailsShape(details)) {
    return details;
  }
  return null;
}

function resolveConvergenceDiagnostics(scenarioEntry) {
  const benchmarkDetails = resolveBenchmarkDetails(scenarioEntry?.details);
  const candidates = [
    scenarioEntry?.details?.diagnostics,
    scenarioEntry?.details?.convergenceDiagnostics,
    scenarioEntry?.convergenceTiming?.diagnostics,
    benchmarkDetails?.convergenceDiagnostics,
    benchmarkDetails?.convergence?.diagnostics,
  ];
  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object') {
      return candidate;
    }
  }
  return null;
}

function buildPartitionHotspots(scenarioEntry) {
  const diagnostics = resolveConvergenceDiagnostics(scenarioEntry);
  if (!diagnostics) {
    return null;
  }
  const partitionMembership = diagnostics.partitionMembership &&
    typeof diagnostics.partitionMembership === 'object' ?
    diagnostics.partitionMembership :
    {};
  const overTargetDurations = diagnostics.overTargetDurations &&
    typeof diagnostics.overTargetDurations === 'object' ?
    diagnostics.overTargetDurations :
    {};
  const operationsByPartition = groupOperationHistoryByPartition(
    diagnostics.operationHistory,
  );

  const partitionIds = new Set([
    ...Object.keys(partitionMembership),
    ...Object.keys(overTargetDurations),
    ...operationsByPartition.keys(),
  ]);
  if (partitionIds.size === ZERO) {
    return null;
  }

  const hotspots = [];
  for (const partitionId of [...partitionIds].sort()) {
    const membership = partitionMembership[partitionId] || {};
    const overTargetMs = normalizeFiniteNumber(overTargetDurations[partitionId]) ||
      ZERO;
    const voterCount = normalizeFiniteNumber(membership.voterCount) || ZERO;
    const targetVoterCount = normalizeFiniteNumber(membership.targetVoterCount) || ZERO;
    const excessVoters = Math.max(ZERO, voterCount - targetVoterCount);
    const replicaCount = Array.isArray(membership.replicas) ?
      membership.replicas.length :
      ZERO;
    const operations = operationsByPartition.get(partitionId) || [];
    const operationSampleCount = operations.length;
    const hotspotScore = Math.round(
      overTargetMs +
      (excessVoters * 1000) +
      (operationSampleCount * 50),
    );
    hotspots.push({
      partitionId: String(partitionId),
      hotspotScore,
      overTargetMs,
      voterCount,
      targetVoterCount,
      excessVoters,
      leader: membership.leader || null,
      replicaCount,
      operationSampleCount,
      recentOperations: operations.slice(
        ZERO,
        PARTITION_HOTSPOT_RECENT_OP_LIMIT,
      ),
    });
  }

  hotspots.sort(comparePartitionHotspots);
  return hotspots.slice(ZERO, PARTITION_HOTSPOT_LIMIT);
}

function groupOperationHistoryByPartition(operationHistory) {
  const grouped = new Map();
  if (!Array.isArray(operationHistory)) {
    return grouped;
  }

  for (const row of operationHistory) {
    const partitionId = String(row?.partitionId || '');
    if (!partitionId) {
      continue;
    }
    if (!grouped.has(partitionId)) {
      grouped.set(partitionId, []);
    }
    grouped.get(partitionId).push(normalizeOperationRow(row));
  }

  for (const operations of grouped.values()) {
    operations.sort((left, right) =>
      parseTimestampMs(right?.at) - parseTimestampMs(left?.at));
  }
  return grouped;
}

function normalizeOperationRow(row) {
  return {
    operationId: row?.operationId || null,
    type: row?.type || null,
    status: row?.status || null,
    fromNodeId: row?.fromNodeId || null,
    toNodeId: row?.toNodeId || null,
    at: row?.at || null,
  };
}

function parseTimestampMs(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (value === null || value === undefined) {
    return ZERO;
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : ZERO;
}

function comparePartitionHotspots(left, right) {
  const leftScore = normalizeFiniteNumber(left?.hotspotScore) || ZERO;
  const rightScore = normalizeFiniteNumber(right?.hotspotScore) || ZERO;
  if (leftScore !== rightScore) {
    return rightScore - leftScore;
  }
  const leftOverTargetMs = normalizeFiniteNumber(left?.overTargetMs) || ZERO;
  const rightOverTargetMs = normalizeFiniteNumber(right?.overTargetMs) || ZERO;
  if (leftOverTargetMs !== rightOverTargetMs) {
    return rightOverTargetMs - leftOverTargetMs;
  }
  return String(left?.partitionId || COMPONENT_UNKNOWN)
    .localeCompare(String(right?.partitionId || COMPONENT_UNKNOWN));
}

function normalizeFiniteNumber(value) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function normalizeClusterSize(value) {
  const normalized = normalizeFiniteNumber(value);
  if (normalized === null) {
    return null;
  }
  if (!Number.isInteger(normalized) || normalized < ONE) {
    return null;
  }
  return normalized;
}

function scoreThroughputRatio(ratio) {
  if (ratio <= THROUGHPUT_RATIO_CRITICAL) {
    return {priority: PRIORITY_CRITICAL, score: SCORE_CRITICAL};
  }
  if (ratio <= THROUGHPUT_RATIO_HIGH) {
    return {priority: PRIORITY_HIGH, score: SCORE_HIGH};
  }
  return {priority: PRIORITY_MEDIUM, score: SCORE_MEDIUM};
}

function scoreLatencyRatio(ratio) {
  if (ratio >= LATENCY_RATIO_CRITICAL) {
    return {priority: PRIORITY_CRITICAL, score: SCORE_CRITICAL};
  }
  if (ratio >= LATENCY_RATIO_HIGH) {
    return {priority: PRIORITY_HIGH, score: SCORE_HIGH};
  }
  return {priority: PRIORITY_MEDIUM, score: SCORE_MEDIUM};
}

function scoreInternalTailRatio(ratio) {
  if (ratio >= INTERNAL_TAIL_RATIO_CRITICAL) {
    return {priority: PRIORITY_HIGH, score: SCORE_HIGH};
  }
  if (ratio >= INTERNAL_TAIL_RATIO_HIGH) {
    return {priority: PRIORITY_MEDIUM, score: SCORE_MEDIUM};
  }
  return {priority: PRIORITY_LOW, score: SCORE_LOW};
}

function scoreQueuePressure(undispatchedRatio, queueDelayP95Ms) {
  if ((undispatchedRatio !== null &&
      undispatchedRatio >= QUEUE_UNDISPATCHED_RATIO_CRITICAL) ||
      (queueDelayP95Ms !== null &&
      queueDelayP95Ms >= QUEUE_DELAY_P95_CRITICAL_MS)) {
    return {priority: PRIORITY_CRITICAL, score: SCORE_CRITICAL};
  }
  if ((undispatchedRatio !== null &&
      undispatchedRatio >= QUEUE_UNDISPATCHED_RATIO_HIGH) ||
      (queueDelayP95Ms !== null &&
      queueDelayP95Ms >= QUEUE_DELAY_P95_HIGH_MS)) {
    return {priority: PRIORITY_HIGH, score: SCORE_HIGH};
  }
  return {priority: PRIORITY_MEDIUM, score: SCORE_MEDIUM};
}

function scoreAdmissionPressure(admissionSignalRatio, admissionSignalCount) {
  if ((admissionSignalRatio !== null &&
      admissionSignalRatio >= ADMISSION_SIGNAL_RATIO_CRITICAL) ||
      admissionSignalCount >= ADMISSION_SIGNAL_COUNT_HIGH) {
    return {priority: PRIORITY_CRITICAL, score: SCORE_CRITICAL};
  }
  if ((admissionSignalRatio !== null &&
      admissionSignalRatio >= ADMISSION_SIGNAL_RATIO_HIGH) ||
      admissionSignalCount >= ADMISSION_SIGNAL_COUNT_MEDIUM) {
    return {priority: PRIORITY_HIGH, score: SCORE_HIGH};
  }
  return {priority: PRIORITY_MEDIUM, score: SCORE_MEDIUM};
}

function compareOptimizationPriority(left, right) {
  const leftScore = normalizeFiniteNumber(left?.score) || ZERO;
  const rightScore = normalizeFiniteNumber(right?.score) || ZERO;
  if (leftScore !== rightScore) {
    return rightScore - leftScore;
  }
  const leftOrder = PRIORITY_ORDER[left?.priority] || ZERO;
  const rightOrder = PRIORITY_ORDER[right?.priority] || ZERO;
  if (leftOrder !== rightOrder) {
    return rightOrder - leftOrder;
  }
  const leftComponent = String(left?.component || COMPONENT_UNKNOWN);
  const rightComponent = String(right?.component || COMPONENT_UNKNOWN);
  if (leftComponent !== rightComponent) {
    return leftComponent.localeCompare(rightComponent);
  }
  const leftSignal = String(left?.signal || COMPONENT_UNKNOWN);
  const rightSignal = String(right?.signal || COMPONENT_UNKNOWN);
  return leftSignal.localeCompare(rightSignal);
}

function deduplicateOptimizationPriorities(priorities) {
  const deduplicated = new Map();
  for (const priority of priorities) {
    const key = String(priority?.component || COMPONENT_UNKNOWN) +
      '|' +
      String(priority?.signal || COMPONENT_UNKNOWN);
    const existing = deduplicated.get(key);
    if (!existing ||
      compareOptimizationPriority(priority, existing) < ZERO) {
      deduplicated.set(key, priority);
    }
  }
  return [...deduplicated.values()];
}

/**
 * Aggregate optimization hotspots across scenario entries.
 * @param {Array<Object>} scenarios
 * @returns {Object}
 */
function computeOptimizationSummary(scenarios) {
  const items = [];
  for (const scenario of scenarios) {
    const priorities = Array.isArray(scenario?.optimizationPriorities) ?
      scenario.optimizationPriorities :
      [];
    for (const priority of priorities) {
      items.push({
        scenario: scenario.scenario || null,
        ...priority,
      });
    }
  }

  const byComponent = new Map();
  for (const item of items) {
    const component = String(item?.component || COMPONENT_UNKNOWN);
    if (!byComponent.has(component)) {
      byComponent.set(component, {
        component,
        count: ZERO,
        highestPriority: PRIORITY_LOW,
        highestScore: ZERO,
      });
    }
    const aggregate = byComponent.get(component);
    aggregate.count++;
    const itemScore = normalizeFiniteNumber(item?.score) || ZERO;
    if (itemScore > aggregate.highestScore) {
      aggregate.highestScore = itemScore;
      aggregate.highestPriority = item?.priority || PRIORITY_LOW;
    }
  }

  const topComponents = [...byComponent.values()]
    .sort((left, right) => {
      if (left.highestScore !== right.highestScore) {
        return right.highestScore - left.highestScore;
      }
      if (left.count !== right.count) {
        return right.count - left.count;
      }
      return left.component.localeCompare(right.component);
    })
    .slice(ZERO, OPTIMIZATION_SUMMARY_TOP_COMPONENT_LIMIT);

  const topPartitions = computePartitionHotspotSummary(scenarios);

  return {
    totalPriorityItems: items.length,
    scenariosWithPriorities: new Set(items.map((item) =>
      String(item.scenario || COMPONENT_UNKNOWN))).size,
    topComponents,
    topPartitions,
  };
}

function computePartitionHotspotSummary(scenarios) {
  const byPartition = new Map();
  for (const scenario of scenarios) {
    const hotspots = Array.isArray(scenario?.partitionHotspots) ?
      scenario.partitionHotspots :
      [];
    for (const hotspot of hotspots) {
      const partitionId = String(hotspot?.partitionId || COMPONENT_UNKNOWN);
      if (!byPartition.has(partitionId)) {
        byPartition.set(partitionId, {
          partitionId,
          count: ZERO,
          highestScore: ZERO,
          maxOverTargetMs: ZERO,
          scenarios: new Set(),
        });
      }
      const aggregate = byPartition.get(partitionId);
      aggregate.count++;
      aggregate.scenarios.add(String(scenario?.scenario || COMPONENT_UNKNOWN));
      const score = normalizeFiniteNumber(hotspot?.hotspotScore) || ZERO;
      const overTargetMs = normalizeFiniteNumber(hotspot?.overTargetMs) || ZERO;
      if (score > aggregate.highestScore) {
        aggregate.highestScore = score;
      }
      if (overTargetMs > aggregate.maxOverTargetMs) {
        aggregate.maxOverTargetMs = overTargetMs;
      }
    }
  }

  return [...byPartition.values()]
    .map((entry) => ({
      partitionId: entry.partitionId,
      count: entry.count,
      highestScore: entry.highestScore,
      maxOverTargetMs: entry.maxOverTargetMs,
      scenarios: [...entry.scenarios].sort(),
    }))
    .sort((left, right) => {
      if (left.highestScore !== right.highestScore) {
        return right.highestScore - left.highestScore;
      }
      if (left.count !== right.count) {
        return right.count - left.count;
      }
      return left.partitionId.localeCompare(right.partitionId);
    })
    .slice(ZERO, OPTIMIZATION_SUMMARY_TOP_PARTITION_LIMIT);
}

function buildScenarioWorkloadSignature(entry) {
  const benchmarkDetails = resolveBenchmarkDetails(entry?.details);
  const benchmark = benchmarkDetails?.benchmark;
  if (!benchmark || typeof benchmark !== 'object') {
    return STANDARD_SUMMARY_SIMILARITY_FALLBACK;
  }

  const signature = {
    workload: benchmark.workload || null,
    durationSeconds: normalizeFiniteNumber(benchmark.durationSeconds),
    clients: normalizeFiniteNumber(benchmark.clients),
    jobs: normalizeFiniteNumber(benchmark.jobs),
    replicationFactor: normalizeFiniteNumber(benchmark.replicationFactor),
  };
  return JSON.stringify(signature);
}

function buildScenarioSimilarityKey(entry) {
  const scenarioName = String(entry?.scenario || COMPONENT_UNKNOWN);
  return scenarioName + '|' + buildScenarioWorkloadSignature(entry);
}

function buildScenarioSnapshot(entry) {
  const clusterSize = normalizeClusterSize(entry?.clusterSize);
  const performanceMeasurement = resolvePerformanceMeasurement(entry);
  const opsPerSec = performanceMeasurement.validForComparison ?
    performanceMeasurement.observedOpsPerSec :
    null;
  const p99LatencyMs = performanceMeasurement.validForComparison ?
    performanceMeasurement.observedP99LatencyMs :
    null;
  return {
    passed: entry?.passed === true,
    clusterSize,
    durationMs: normalizeFiniteNumber(entry?.duration) || ZERO,
    performanceMetricsAvailable: performanceMeasurement.available,
    validForPerformanceComparison: performanceMeasurement.validForComparison,
    performanceInvalidReason: performanceMeasurement.invalidReason,
    observedOpsPerSec: performanceMeasurement.observedOpsPerSec,
    observedP99LatencyMs: performanceMeasurement.observedP99LatencyMs,
    opsPerSec,
    p99LatencyMs,
    opsPerSecPerNode: clusterSize && clusterSize > ZERO &&
      opsPerSec !== null ?
      opsPerSec / clusterSize :
      null,
  };
}

function buildPostgresBaselineSnapshot(entry) {
  const benchmarkDetails = resolveBenchmarkDetails(entry?.details);
  const comparison = benchmarkDetails?.comparison;
  if (!comparison || typeof comparison !== 'object') {
    return null;
  }
  const performanceMeasurement = resolvePerformanceMeasurement(entry);

  const throughputRatioSutToBaseline = normalizeFiniteNumber(
    comparison.throughputRatioSutToBaseline,
  );
  const p99LatencyRatioSutToBaselineAvg = normalizeFiniteNumber(
    comparison.p99LatencyRatioSutToBaselineAvg,
  );
  const sutOpsPerSec = normalizeFiniteNumber(comparison.sutOpsPerSec);
  const baselineTps = normalizeFiniteNumber(comparison.baselineTps);
  const sutP99LatencyMs = normalizeFiniteNumber(comparison.sutP99LatencyMs);
  const baselineLatencyAvgMs = normalizeFiniteNumber(
    comparison.baselineLatencyAvgMs,
  );
  const hasAnyBaselineMetric = throughputRatioSutToBaseline !== null ||
    p99LatencyRatioSutToBaselineAvg !== null ||
    sutOpsPerSec !== null ||
    baselineTps !== null ||
    sutP99LatencyMs !== null ||
    baselineLatencyAvgMs !== null;
  if (!hasAnyBaselineMetric) {
    return null;
  }

  const baseline = benchmarkDetails?.baseline &&
    typeof benchmarkDetails.baseline === 'object' ?
    benchmarkDetails.baseline :
    null;
  return {
    engine: baseline?.engine || STANDARD_SUMMARY_BASELINE_ENGINE,
    validForPerformanceComparison: performanceMeasurement.validForComparison,
    performanceInvalidReason: performanceMeasurement.invalidReason,
    throughputRatioSutToBaseline: performanceMeasurement.validForComparison ?
      throughputRatioSutToBaseline :
      null,
    p99LatencyRatioSutToBaselineAvg: performanceMeasurement.validForComparison ?
      p99LatencyRatioSutToBaselineAvg :
      null,
    sutOpsPerSec: performanceMeasurement.validForComparison ?
      sutOpsPerSec :
      null,
    baselineTps: performanceMeasurement.validForComparison ?
      baselineTps :
      null,
    sutP99LatencyMs: performanceMeasurement.validForComparison ?
      sutP99LatencyMs :
      null,
    baselineLatencyAvgMs: performanceMeasurement.validForComparison ?
      baselineLatencyAvgMs :
      null,
    cache: baseline?.cache || null,
  };
}

function buildParitySnapshot(entry) {
  const benchmarkDetails = resolveBenchmarkDetails(entry?.details);
  const parity = benchmarkDetails?.parity;
  if (!parity || typeof parity !== 'object' || Array.isArray(parity)) {
    return null;
  }
  const reasonCodes = Array.isArray(parity.reasons) ?
    parity.reasons
      .map((reason) => {
        if (typeof reason === 'string') {
          return reason;
        }
        if (reason && typeof reason === 'object') {
          return String(reason.code || '');
        }
        return '';
      })
      .filter((code) => code.length > ZERO) :
    [];
  return {
    status: typeof parity.status === 'string' && parity.status ?
      parity.status :
      PARITY_STATUS_UNKNOWN,
    reasonCodes,
  };
}

function computeAbsoluteDelta(currentValue, previousValue) {
  const current = normalizeFiniteNumber(currentValue);
  const previous = normalizeFiniteNumber(previousValue);
  if (current === null || previous === null) {
    return null;
  }
  return current - previous;
}

function computeRatioDelta(currentValue, previousValue) {
  const current = normalizeFiniteNumber(currentValue);
  const previous = normalizeFiniteNumber(previousValue);
  if (current === null || previous === null || previous === ZERO) {
    return null;
  }
  return (current - previous) / previous;
}

function buildDeltaSnapshot(current, previous) {
  return {
    passedChanged: current.passed !== previous.passed,
    clusterSizeChanged: current.clusterSize !== previous.clusterSize,
    durationMs: computeAbsoluteDelta(current.durationMs, previous.durationMs),
    durationRatio: computeRatioDelta(current.durationMs, previous.durationMs),
    opsPerSec: computeAbsoluteDelta(current.opsPerSec, previous.opsPerSec),
    opsPerSecRatio: computeRatioDelta(current.opsPerSec, previous.opsPerSec),
    opsPerSecPerNode: computeAbsoluteDelta(
      current.opsPerSecPerNode,
      previous.opsPerSecPerNode,
    ),
    opsPerSecPerNodeRatio: computeRatioDelta(
      current.opsPerSecPerNode,
      previous.opsPerSecPerNode,
    ),
    p99LatencyMs: computeAbsoluteDelta(current.p99LatencyMs, previous.p99LatencyMs),
    p99LatencyMsRatio: computeRatioDelta(
      current.p99LatencyMs,
      previous.p99LatencyMs,
    ),
  };
}

function normalizeHistoryReports(historyReports) {
  if (!Array.isArray(historyReports)) {
    return [];
  }
  const normalized = [];
  for (const report of historyReports) {
    if (!report || typeof report !== 'object') {
      continue;
    }
    if (!Array.isArray(report.scenarios)) {
      continue;
    }
    normalized.push({
      timestamp: report.timestamp || null,
      path: report.path || null,
      metadata: normalizeMetadata(report.metadata),
      scenarios: report.scenarios,
    });
  }
  normalized.sort((left, right) =>
    parseTimestampMs(right.timestamp) - parseTimestampMs(left.timestamp));
  return normalized;
}

function resolveClusterSizeFromReportPath(reportPath) {
  if (typeof reportPath !== 'string' || reportPath.length === ZERO) {
    return null;
  }
  const match = CLUSTER_SIZE_PATH_REGEX.exec(reportPath);
  if (!match) {
    return null;
  }
  return normalizeClusterSize(Number.parseInt(match[1], 10));
}

function resolveClusterSize(entry, reportPath = null) {
  return normalizeClusterSize(entry?.clusterSize) ||
    resolveClusterSizeFromReportPath(reportPath);
}

function resolveWritePathPhaseBreakdown(entry) {
  const phases = entry?.performanceDiagnostics?.writePath?.phaseBreakdown;
  if (!Array.isArray(phases)) {
    return [];
  }
  return phases;
}

function buildWritePathTopPhases(entry) {
  const phases = resolveWritePathPhaseBreakdown(entry)
    .map((phase) => ({
      phase: phase?.phase || null,
      totalMs: normalizeFiniteNumber(phase?.total),
      avgMs: normalizeFiniteNumber(phase?.avg),
      p95Ms: normalizeFiniteNumber(phase?.p95),
      shareOfTotalMs: normalizeFiniteNumber(phase?.shareOfTotalMs),
    }))
    .filter((phase) => phase.phase);
  phases.sort((left, right) => {
    const leftTotal = left.totalMs || ZERO;
    const rightTotal = right.totalMs || ZERO;
    if (leftTotal !== rightTotal) {
      return rightTotal - leftTotal;
    }
    const leftShare = left.shareOfTotalMs || ZERO;
    const rightShare = right.shareOfTotalMs || ZERO;
    if (leftShare !== rightShare) {
      return rightShare - leftShare;
    }
    return String(left.phase).localeCompare(String(right.phase));
  });
  return phases.slice(ZERO, WRITE_PATH_TOP_PHASE_LIMIT);
}

function computeWritePathAttributionSummary(scenarios) {
  let scenariosWithDiagnostics = ZERO;
  const byPhase = new Map();

  for (const scenario of scenarios) {
    const phases = resolveWritePathPhaseBreakdown(scenario);
    if (phases.length === ZERO) {
      continue;
    }
    scenariosWithDiagnostics++;

    for (const phase of phases) {
      const phaseName = String(phase?.phase || '');
      if (!phaseName) {
        continue;
      }
      if (!byPhase.has(phaseName)) {
        byPhase.set(phaseName, {
          phase: phaseName,
          scenarios: new Set(),
          sampleCount: ZERO,
          totalMs: ZERO,
          weightedShareTotal: ZERO,
          weightedShareWeight: ZERO,
        });
      }

      const aggregate = byPhase.get(phaseName);
      const phaseTotalMs = normalizeFiniteNumber(phase?.total) || ZERO;
      const phaseShare = normalizeFiniteNumber(phase?.shareOfTotalMs);
      aggregate.scenarios.add(String(scenario?.scenario || COMPONENT_UNKNOWN));
      aggregate.sampleCount += normalizeFiniteNumber(phase?.count) || ZERO;
      aggregate.totalMs += phaseTotalMs;
      if (phaseShare !== null && phaseTotalMs > ZERO) {
        aggregate.weightedShareTotal += phaseShare * phaseTotalMs;
        aggregate.weightedShareWeight += phaseTotalMs;
      }
    }
  }

  const topPhases = [...byPhase.values()]
    .map((phase) => ({
      phase: phase.phase,
      scenarioCount: phase.scenarios.size,
      sampleCount: phase.sampleCount,
      totalMs: phase.totalMs,
      weightedShareOfTotalMs: phase.weightedShareWeight > ZERO ?
        phase.weightedShareTotal / phase.weightedShareWeight :
        null,
      scenarios: [...phase.scenarios].sort(),
    }))
    .sort((left, right) => {
      if (left.totalMs !== right.totalMs) {
        return right.totalMs - left.totalMs;
      }
      if (left.scenarioCount !== right.scenarioCount) {
        return right.scenarioCount - left.scenarioCount;
      }
      return String(left.phase).localeCompare(String(right.phase));
    })
    .slice(ZERO, WRITE_PATH_SUMMARY_PHASE_LIMIT);

  return {
    scenariosWithDiagnostics,
    topPhases,
  };
}

function computeDiagnosticsCoverageSummary(scenarios) {
  let scenariosWithCoverage = ZERO;
  let scenariosWithoutCoverage = ZERO;
  let totalSamples = ZERO;
  const scenarioCoverage = [];

  for (const scenario of scenarios) {
    const benchmarkDetails = resolveBenchmarkDetails(scenario?.details);
    const diagnosticsCoverage = benchmarkDetails?.diagnosticsCoverage &&
      typeof benchmarkDetails.diagnosticsCoverage === 'object' ?
      benchmarkDetails.diagnosticsCoverage :
      null;
    const sampleCount = normalizeFiniteNumber(diagnosticsCoverage?.sampleCount) ||
      ZERO;
    const status =
      String(diagnosticsCoverage?.status || DIAGNOSTICS_COVERAGE_STATUS_UNAVAILABLE);
    const reason = status === DIAGNOSTICS_COVERAGE_STATUS_UNAVAILABLE ?
      String(
        diagnosticsCoverage?.reason || DIAGNOSTICS_COVERAGE_REASON_NOT_REPORTED,
      ) :
      (diagnosticsCoverage?.reason || null);
    if (status === DIAGNOSTICS_COVERAGE_STATUS_AVAILABLE &&
        sampleCount > ZERO) {
      scenariosWithCoverage++;
    } else {
      scenariosWithoutCoverage++;
    }
    totalSamples += sampleCount;
    scenarioCoverage.push({
      scenario: String(scenario?.scenario || COMPONENT_UNKNOWN),
      status,
      reason,
      sampleCount,
    });
  }

  return {
    scenariosWithCoverage,
    scenariosWithoutCoverage,
    totalSamples,
    coverageRate: scenarios.length > ZERO ?
      scenariosWithCoverage / scenarios.length :
      ZERO,
    scenarios: scenarioCoverage,
  };
}

function createScaleObservation(entry, reportMeta = {}) {
  const clusterSize = resolveClusterSize(entry, reportMeta.path || null);
  if (!clusterSize) {
    return null;
  }
  const opsPerSec = normalizeFiniteNumber(entry?.loadMetrics?.opsPerSec);
  const p99LatencyMs = normalizeFiniteNumber(entry?.loadMetrics?.latency?.p99);
  if (opsPerSec === null && p99LatencyMs === null) {
    return null;
  }

  const source = String(reportMeta.source || 'history');
  const sortTimestampMs = source === 'current' ?
    Number.MAX_SAFE_INTEGER :
    parseTimestampMs(reportMeta.timestamp);

  return {
    scenario: String(entry?.scenario || COMPONENT_UNKNOWN),
    similarityKey: buildScenarioSimilarityKey(entry),
    clusterSize,
    opsPerSec,
    p99LatencyMs,
    reportTimestamp: reportMeta.timestamp || null,
    reportPath: reportMeta.path || null,
    source,
    sortTimestampMs,
  };
}

function collectScaleObservations(currentScenarios, normalizedHistory) {
  const observations = [];

  for (const scenario of currentScenarios) {
    const observation = createScaleObservation(scenario, {
      source: 'current',
      timestamp: null,
      path: null,
    });
    if (observation) {
      observations.push(observation);
    }
  }

  for (const historicalReport of normalizedHistory) {
    for (const scenario of historicalReport.scenarios) {
      const observation = createScaleObservation(scenario, {
        source: 'history',
        timestamp: historicalReport.timestamp,
        path: historicalReport.path,
      });
      if (observation) {
        observations.push(observation);
      }
    }
  }

  return observations;
}

function selectLatestByClusterSize(observations) {
  const latestByClusterSize = new Map();
  for (const observation of observations) {
    const clusterSize = normalizeClusterSize(observation?.clusterSize);
    if (!clusterSize) {
      continue;
    }
    const existing = latestByClusterSize.get(clusterSize);
    if (!existing ||
      observation.sortTimestampMs > existing.sortTimestampMs) {
      latestByClusterSize.set(clusterSize, observation);
    }
  }
  return [...latestByClusterSize.values()]
    .sort((left, right) => left.clusterSize - right.clusterSize);
}

function computeScaleEfficiencyForGroup(observations) {
  const latestByClusterSize = selectLatestByClusterSize(observations);
  const withThroughput = latestByClusterSize.filter((item) =>
    normalizeFiniteNumber(item?.opsPerSec) !== null);
  if (withThroughput.length < 2) {
    return null;
  }

  const baseline = withThroughput[ZERO];
  const target = withThroughput[withThroughput.length - ONE];
  const baselineOps = normalizeFiniteNumber(baseline.opsPerSec);
  const targetOps = normalizeFiniteNumber(target.opsPerSec);
  if (baselineOps === null || targetOps === null || baselineOps <= ZERO) {
    return null;
  }

  const baselineSize = normalizeClusterSize(baseline.clusterSize);
  const targetSize = normalizeClusterSize(target.clusterSize);
  if (!baselineSize || !targetSize || targetSize <= baselineSize) {
    return null;
  }

  const observedScale = targetOps / baselineOps;
  const expectedScale = targetSize / baselineSize;
  const throughputScaleEfficiency = expectedScale > ZERO ?
    observedScale / expectedScale :
    null;
  const baselineP99 = normalizeFiniteNumber(baseline.p99LatencyMs);
  const targetP99 = normalizeFiniteNumber(target.p99LatencyMs);
  const p99LatencyScale = baselineP99 !== null &&
    targetP99 !== null &&
    baselineP99 > ZERO ?
    targetP99 / baselineP99 :
    null;

  return {
    scenario: String(target?.scenario || COMPONENT_UNKNOWN),
    similarityKey: String(target?.similarityKey || COMPONENT_UNKNOWN),
    observationCount: latestByClusterSize.length,
    baselineClusterSize: baselineSize,
    targetClusterSize: targetSize,
    baselineOpsPerSec: baselineOps,
    targetOpsPerSec: targetOps,
    baselineOpsPerSecPerNode: baselineOps / baselineSize,
    targetOpsPerSecPerNode: targetOps / targetSize,
    observedThroughputScale: observedScale,
    expectedThroughputScale: expectedScale,
    throughputScaleEfficiency,
    p99LatencyScale,
    baselineReportTimestamp: baseline.reportTimestamp || null,
    baselineReportPath: baseline.reportPath || null,
    targetReportTimestamp: target.reportTimestamp || null,
    targetReportPath: target.reportPath || null,
  };
}

function computeScaleEfficiencySummary(currentScenarios, normalizedHistory) {
  const observations = collectScaleObservations(
    currentScenarios,
    normalizedHistory,
  );
  const bySimilarityKey = new Map();
  for (const observation of observations) {
    const similarityKey = String(observation?.similarityKey || COMPONENT_UNKNOWN);
    if (!bySimilarityKey.has(similarityKey)) {
      bySimilarityKey.set(similarityKey, []);
    }
    bySimilarityKey.get(similarityKey).push(observation);
  }

  const groups = [];
  for (const [similarityKey, groupObservations] of bySimilarityKey.entries()) {
    const summary = computeScaleEfficiencyForGroup(groupObservations);
    if (!summary) {
      continue;
    }
    groups.push({
      similarityKey,
      ...summary,
    });
  }

  groups.sort((left, right) => {
    const leftEfficiency = normalizeFiniteNumber(left?.throughputScaleEfficiency);
    const rightEfficiency = normalizeFiniteNumber(right?.throughputScaleEfficiency);
    if (leftEfficiency !== null && rightEfficiency !== null &&
      leftEfficiency !== rightEfficiency) {
      return leftEfficiency - rightEfficiency;
    }
    if (left.targetClusterSize !== right.targetClusterSize) {
      return right.targetClusterSize - left.targetClusterSize;
    }
    return String(left.similarityKey).localeCompare(String(right.similarityKey));
  });

  return {
    observationCount: observations.length,
    comparableGroupCount: groups.length,
    groups,
    topOpportunities: groups.slice(ZERO, SCALE_EFFICIENCY_OPPORTUNITY_LIMIT),
  };
}

function computeStandardSummary(scenarios, historyReports) {
  const normalizedHistory = normalizeHistoryReports(historyReports);
  const previousBySimilarityKey = new Map();

  for (const historicalReport of normalizedHistory) {
    for (const historicalScenario of historicalReport.scenarios) {
      const similarityKey = buildScenarioSimilarityKey(historicalScenario);
      if (previousBySimilarityKey.has(similarityKey)) {
        continue;
      }
      previousBySimilarityKey.set(similarityKey, {
        reportTimestamp: historicalReport.timestamp,
        reportPath: historicalReport.path,
        scenario: historicalScenario,
      });
    }
  }

  let scenariosComparedToPrevious = ZERO;
  let scenariosComparedToPostgresBaseline = ZERO;
  const scenarioSummaries = [];

  for (const scenario of scenarios) {
    const similarityKey = buildScenarioSimilarityKey(scenario);
    const currentSnapshot = buildScenarioSnapshot(scenario);
    const postgresBaseline = buildPostgresBaselineSnapshot(scenario);
    const parity = buildParitySnapshot(scenario);
    const writePathTopPhases = buildWritePathTopPhases(scenario);
    if (postgresBaseline) {
      scenariosComparedToPostgresBaseline++;
    }

    const previousMatch = previousBySimilarityKey.get(similarityKey) || null;
    let previousSimilarRun = null;
    let deltaVsPrevious = null;
    if (previousMatch) {
      const previousSnapshot = buildScenarioSnapshot({
        ...previousMatch.scenario,
        clusterSize: resolveClusterSize(
          previousMatch.scenario,
          previousMatch.reportPath,
        ),
      });
      previousSimilarRun = {
        reportTimestamp: previousMatch.reportTimestamp || null,
        reportPath: previousMatch.reportPath || null,
        ...previousSnapshot,
      };
      deltaVsPrevious = buildDeltaSnapshot(
        currentSnapshot,
        previousSnapshot,
      );
      scenariosComparedToPrevious++;
    }

    scenarioSummaries.push({
      scenario: String(scenario?.scenario || COMPONENT_UNKNOWN),
      similarityKey,
      current: currentSnapshot,
      previousSimilarRun,
      deltaVsPrevious,
      postgresBaseline,
      parity,
      writePathTopPhases,
    });
  }

  return {
    historicalReportsConsidered: normalizedHistory.length,
    scenariosComparedToPrevious,
    scenariosComparedToPostgresBaseline,
    diagnosticsCoverageSummary: computeDiagnosticsCoverageSummary(scenarios),
    writePathAttributionSummary: computeWritePathAttributionSummary(
      scenarios,
    ),
    scaleEfficiencySummary: computeScaleEfficiencySummary(
      scenarios,
      normalizedHistory,
    ),
    scenarios: scenarioSummaries,
  };
}

/**
 * Compute the summary from accumulated scenario entries.
 * @param {Array<Object>} scenarios
 * @returns {Object} Summary with total, passed, failed, duration
 */
function computeSummary(scenarios) {
  let passed = 0;
  let failed = 0;
  let duration = 0;

  for (const s of scenarios) {
    if (s.passed) {
      passed++;
    } else {
      failed++;
    }
    duration += s.duration;
  }

  return {
    total: passed + failed,
    passed,
    failed,
    duration,
  };
}

function normalizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }
  return {...metadata};
}

class ReportWriter {
  /**
   * @param {string} outputPath - File path for the JSON report
   */
  constructor(outputPath, options = {}) {
    this.outputPath = outputPath;
    this.scenarios = [];
    this.historyReports = normalizeHistoryReports(options.historyReports);
    this.metadata = normalizeMetadata(options.metadata);
  }

  /**
   * Add a scenario result to the report.
   * @param {string} scenarioName
   * @param {Object} result - { passed, duration, loadMetrics,
   *   convergenceTiming, error, stackTrace, startedAt, logs,
   *   analysisSummary }
   */
  addResult(scenarioName, result) {
    const entry = buildScenarioEntry(scenarioName, result);
    this.scenarios.push(entry);
  }

  /**
   * Write the final JSON report to disk.
   * Creates parent directories if they do not exist.
   */
  async write(extraFields = {}) {
    const report = {
      timestamp: new Date().toISOString(),
      summary: computeSummary(this.scenarios),
      optimizationSummary: computeOptimizationSummary(this.scenarios),
      standardSummary: computeStandardSummary(
        this.scenarios,
        this.historyReports,
      ),
      scenarios: this.scenarios,
    };
    const normalizedExtra = normalizeMetadata(extraFields) || {};
    const extraMetadata = normalizeMetadata(normalizedExtra.metadata);
    const reportMetadata = {
      ...(this.metadata || {}),
      ...(extraMetadata || {}),
    };

    for (const [key, value] of Object.entries(normalizedExtra)) {
      if (key === 'metadata') {
        continue;
      }
      report[key] = value;
    }

    if (Object.keys(reportMetadata).length > ZERO) {
      report.metadata = reportMetadata;
    }

    const dir = dirname(this.outputPath);
    await mkdir(dir, {recursive: true});
    await writeFile(
      this.outputPath,
      JSON.stringify(report, null, JSON_INDENT),
      'utf8',
    );
    return report;
  }
}

export {
  ReportWriter,
  buildScenarioEntry,
  computeSummary,
  computeStandardSummary,
  JSON_INDENT,
};
