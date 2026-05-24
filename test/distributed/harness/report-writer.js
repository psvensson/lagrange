/**
 * Report Writer — produces structured JSON test reports.
 *
 * Accumulates scenario results and writes a final report with
 * per-scenario details and an aggregate summary.
 */

import {writeFile, mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {summarizeInvariantBreaches} from './invariant-breaches.js';
import {buildPriorityRecoveryProgressSummary} from
  './priority-recovery-summary-normalization.js';
import {createOptimizationSummaryComputer} from
  './report-writer-optimization-summary.js';
import {createReportWriterSummaryMethods} from './report-writer-summary-methods.js';
import {classifyScenarioVerdict} from './validation-matrix.js';

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
const LOAD_METRICS_FIELD_WAIT_REASONS = 'waitReasons';
const LOAD_METRICS_UNDISPATCHED_REASON_CAPACITY = 'capacity';
const LOAD_METRICS_UNDISPATCHED_REASON_DURATION_TIMEOUT = 'durationTimeout';
const LOAD_METRICS_UNDISPATCHED_REASON_CANCELLED = 'cancelled';
const LOAD_METRICS_WAIT_REASON_NODE_SLOT_UNAVAILABLE = 'nodeSlotUnavailable';
const LOAD_METRICS_WAIT_REASON_NODE_ADMISSION_BLOCKED = 'nodeAdmissionBlocked';
const LOAD_METRICS_WAIT_REASON_RETRYABLE_CONTROL_PLANE_PRESSURE =
  'retryableControlPlanePressure';
const LOAD_METRICS_WAIT_REASON_TIMEOUT_WAITS = 'timeoutWaits';
const LOAD_METRICS_WAIT_REASON_QUEUE_CAPACITY_REJECTED =
  'queueCapacityRejected';
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
  const priorityRecoveryObservation =
    result.priorityRecoveryObservation ||
    result.details?.diagnostics?.controlPlaneDiagnostics
      ?.priorityRecoveryObservation ||
    result.details?.diagnostics?.priorityRecoveryObservation ||
    null;
  const invariantBreaches = resolveScenarioInvariantBreaches(result, normalizedDetails);
  const verdictObj = classifyScenarioVerdict({
    ...result,
    invariantBreaches,
  });
  const entry = {
    scenario: scenarioName,
    passed: Boolean(result.passed),
    verdict: verdictObj.verdict,
    verdictReason: verdictObj.reason,
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
    cleanlinessAssertion: result.cleanlinessAssertion || null,
    memoryLeak: result.memoryLeak || null,
    memoryLeakAssertion: result.memoryLeakAssertion || null,
    performanceDiagnostics: result.performanceDiagnostics || null,
    details: normalizedDetails,
    invariantBreaches,
    failureClassification: result.failureClassification || null,
    publicationConvergence: result.publicationConvergence || null,
    priorityRecoveryObservation,
    priorityRecoveryProgressSummary:
      buildPriorityRecoveryProgressSummary(priorityRecoveryObservation),
    stabilityGates: result.stabilityGates || null,
    decisionArtifactsByNodeId: result.decisionArtifactsByNodeId || null,
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

  entry.bottleneckEstimate = buildBottleneckEstimate(entry.loadMetrics);
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

function buildBottleneckEstimate(loadMetrics) {
  if (!loadMetrics || typeof loadMetrics !== 'object' || Array.isArray(loadMetrics)) {
    return null;
  }

  const waitReasons = loadMetrics?.waitReasons &&
    typeof loadMetrics.waitReasons === 'object' &&
    !Array.isArray(loadMetrics.waitReasons) ?
    loadMetrics.waitReasons :
    {};
  const nodeAdmissionBlocked = normalizeFiniteNumber(
    waitReasons[LOAD_METRICS_WAIT_REASON_NODE_ADMISSION_BLOCKED],
  ) || ZERO;
  const retryableControlPlanePressure = normalizeFiniteNumber(
    waitReasons[LOAD_METRICS_WAIT_REASON_RETRYABLE_CONTROL_PLANE_PRESSURE],
  ) || ZERO;
  const nodeSlotUnavailable = normalizeFiniteNumber(
    waitReasons[LOAD_METRICS_WAIT_REASON_NODE_SLOT_UNAVAILABLE],
  ) || ZERO;
  const timeoutWaits = normalizeFiniteNumber(
    waitReasons[LOAD_METRICS_WAIT_REASON_TIMEOUT_WAITS],
  ) || ZERO;
  const targetOperations =
    normalizeFiniteNumber(loadMetrics?.[LOAD_METRICS_FIELD_TARGET_OPERATIONS]) ||
    ZERO;
  const undispatchedOperations =
    normalizeFiniteNumber(
      loadMetrics?.[LOAD_METRICS_FIELD_UNDISPATCHED_OPERATIONS],
    ) || ZERO;
  const undispatchedRatio = targetOperations > ZERO ?
    undispatchedOperations / targetOperations :
    ZERO;
  const queueDelayP95Ms = normalizeFiniteNumber(
    loadMetrics?.[LOAD_METRICS_FIELD_QUEUE_DELAY]?.p95,
  ) || ZERO;

  const admissionScore =
    nodeAdmissionBlocked + retryableControlPlanePressure;
  const queueScore =
    undispatchedOperations + Math.round(queueDelayP95Ms / 10);
  const timeoutScore = timeoutWaits;
  const nodeSlotScore = nodeSlotUnavailable;
  const dominantScore = Math.max(
    admissionScore,
    queueScore,
    timeoutScore,
    nodeSlotScore,
  );

  if (dominantScore <= ZERO) {
    return {
      kind: 'mixed_or_unknown',
      primaryEvidence: {
        attemptErrors: normalizeFiniteNumber(
          loadMetrics?.[LOAD_METRICS_FIELD_ATTEMPT_ERRORS],
        ) || ZERO,
      },
      likelyWaitingTimeSource: 'insufficient_signal',
    };
  }

  if (queueScore >= admissionScore &&
      queueScore >= timeoutScore &&
      queueScore >= nodeSlotScore) {
    return {
      kind: 'dispatch_queue_backlog',
      primaryEvidence: {
        undispatchedOperations,
        undispatchedRatio,
        queueDelayP95Ms,
      },
      likelyWaitingTimeSource: 'dispatch_queue',
    };
  }

  if (admissionScore >= timeoutScore &&
      admissionScore >= nodeSlotScore) {
    return {
      kind: 'admission_pressure',
      primaryEvidence: {
        waitReason: LOAD_METRICS_WAIT_REASON_NODE_ADMISSION_BLOCKED,
        count: nodeAdmissionBlocked,
        retryableControlPlanePressure,
      },
      likelyWaitingTimeSource: 'admission_backoff',
    };
  }

  if (nodeSlotScore >= timeoutScore) {
    return {
      kind: 'node_slot_saturation',
      primaryEvidence: {
        waitReason: LOAD_METRICS_WAIT_REASON_NODE_SLOT_UNAVAILABLE,
        count: nodeSlotUnavailable,
      },
      likelyWaitingTimeSource: 'per_node_bulkhead',
    };
  }

  return {
    kind: 'timeout_limited',
    primaryEvidence: {
      waitReason: LOAD_METRICS_WAIT_REASON_TIMEOUT_WAITS,
      count: timeoutWaits,
    },
    likelyWaitingTimeSource: 'query_timeout',
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
    [LOAD_METRICS_FIELD_WAIT_REASONS]: normalizeWaitReasonMetrics(
      loadMetrics?.[LOAD_METRICS_FIELD_WAIT_REASONS],
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
        waitReasons: normalizeWaitReasonMetrics(null),
      };
      continue;
    }
    normalized[nodeId] = {
      dispatched: normalizeFiniteNumber(nodeMetrics.dispatched) || ZERO,
      success: normalizeFiniteNumber(nodeMetrics.success) || ZERO,
      attemptErrors: normalizeFiniteNumber(nodeMetrics.attemptErrors) || ZERO,
      admissionSignals: normalizeFiniteNumber(nodeMetrics.admissionSignals) || ZERO,
      waitReasons: normalizeWaitReasonMetrics(nodeMetrics.waitReasons),
    };
  }
  return normalized;
}

function normalizeWaitReasonMetrics(waitReasons) {
  const normalized = {
    [LOAD_METRICS_WAIT_REASON_NODE_SLOT_UNAVAILABLE]: ZERO,
    [LOAD_METRICS_WAIT_REASON_NODE_ADMISSION_BLOCKED]: ZERO,
    [LOAD_METRICS_WAIT_REASON_RETRYABLE_CONTROL_PLANE_PRESSURE]: ZERO,
    [LOAD_METRICS_WAIT_REASON_TIMEOUT_WAITS]: ZERO,
    [LOAD_METRICS_WAIT_REASON_QUEUE_CAPACITY_REJECTED]: ZERO,
  };
  if (!waitReasons || typeof waitReasons !== 'object' || Array.isArray(waitReasons)) {
    return normalized;
  }
  for (const [reasonKey, value] of Object.entries(waitReasons)) {
    normalized[reasonKey] = normalizeFiniteNumber(value) || ZERO;
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

const {
  computeStandardSummary,
  computeSummary,
  normalizeMetadata,
  normalizeHistoryReports,
} = createReportWriterSummaryMethods({
  CLUSTER_SIZE_PATH_REGEX,
  COMPONENT_UNKNOWN,
  DIAGNOSTICS_COVERAGE_REASON_NOT_REPORTED,
  DIAGNOSTICS_COVERAGE_STATUS_AVAILABLE,
  DIAGNOSTICS_COVERAGE_STATUS_UNAVAILABLE,
  ONE,
  PARITY_STATUS_UNKNOWN,
  SCALE_EFFICIENCY_OPPORTUNITY_LIMIT,
  STANDARD_SUMMARY_BASELINE_ENGINE,
  STANDARD_SUMMARY_SIMILARITY_FALLBACK,
  WRITE_PATH_SUMMARY_PHASE_LIMIT,
  WRITE_PATH_TOP_PHASE_LIMIT,
  ZERO,
  normalizeClusterSize,
  normalizeFiniteNumber,
  parseTimestampMs,
  resolveBenchmarkDetails,
  resolvePerformanceMeasurement,
});
const computeOptimizationSummary = createOptimizationSummaryComputer({
  COMPONENT_UNKNOWN,
  OPTIMIZATION_SUMMARY_TOP_COMPONENT_LIMIT,
  OPTIMIZATION_SUMMARY_TOP_PARTITION_LIMIT,
  PRIORITY_LOW,
  ZERO,
  normalizeFiniteNumber,
});

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

export {ReportWriter, buildScenarioEntry, computeSummary, computeStandardSummary, JSON_INDENT};
