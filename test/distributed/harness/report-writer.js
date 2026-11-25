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
import {scenarioOutcomeOf} from './scenario-outcome.js';
import {CERTIFICATION_NOT_REQUESTED} from './scenario-certification.js';

const arrayMap = Function.call.bind(Array.prototype.map);
const arrayFilter = Function.call.bind(Array.prototype.filter);

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

function resolvePriorityRecoveryObservationFromResult(result) {
  return (
    result.priorityRecoveryObservation ||
    result.details?.diagnostics?.controlPlaneDiagnostics?.priorityRecoveryObservation ||
    result.details?.diagnostics?.priorityRecoveryObservation ||
    null
  );
}

function resolveScenarioExampleResults(result) {
  if (result.exampleResults) {
    return result.exampleResults;
  }
  if (result.details && typeof result.details === 'object' && result.details.exampleResults) {
    return result.details.exampleResults;
  }
  return null;
}

function buildCoreScenarioOutcomeFields(scenarioName, result, verdictObj) {
  return {
    scenario: scenarioName, passed: Boolean(result.passed), outcome: scenarioOutcomeOf(result),
    refusal: result.refusal || null,
    certification: result.certification || CERTIFICATION_NOT_REQUESTED,
    verdict: verdictObj.verdict, verdictReason: verdictObj.reason,
    duration: result.duration || 0, clusterSize: normalizeClusterSize(result.clusterSize),
    startedAt: result.startedAt || null,
  };
}

function buildScenarioArtifactFields(result) {
  return {
    convergenceTiming: result.convergenceTiming || null,
    analysisSummary: result.analysisSummary || null,
    error: result.error || null, stackTrace: result.stackTrace || null,
    logs: result.logs || null, playback: result.playback || null, trace: result.trace || null,
  };
}

function buildScenarioAssertionFields(result) {
  return {
    traceAssertion: result.traceAssertion || null,
    cleanlinessAssertion: result.cleanlinessAssertion || null,
    memoryLeak: result.memoryLeak || null, memoryLeakAssertion: result.memoryLeakAssertion || null,
    performanceDiagnostics: result.performanceDiagnostics || null,
  };
}

function buildScenarioClassificationAndGateFields(
  result, normalizedDetails, invariantBreaches, priorityRecoveryObservation,
) {
  return {
    details: normalizedDetails, invariantBreaches,
    failureClassification: result.failureClassification || null,
    classification: result.classification || null,
    unexpectedNodeExits: result.unexpectedNodeExits || null,
    publicationConvergence: result.publicationConvergence || null,
    priorityRecoveryObservation,
    priorityRecoveryProgressSummary:
      buildPriorityRecoveryProgressSummary(priorityRecoveryObservation),
    stabilityGates: result.stabilityGates || null,
    decisionArtifactsByNodeId: result.decisionArtifactsByNodeId || null,
    captureCompletenessByNodeId: result.captureCompletenessByNodeId || null,
  };
}

function buildScenarioEntry(scenarioName, result) {
  const normalizedDetails = normalizeScenarioDetails(result.details);
  const priorityRecoveryObservation = resolvePriorityRecoveryObservationFromResult(result);
  const invariantBreaches = resolveScenarioInvariantBreaches(result, normalizedDetails);
  const verdictObj = classifyScenarioVerdict({...result, invariantBreaches});
  const entry = {
    ...buildCoreScenarioOutcomeFields(scenarioName, result, verdictObj),
    ...buildScenarioArtifactFields(result),
    ...buildScenarioAssertionFields(result),
    ...buildScenarioClassificationAndGateFields(
      result, normalizedDetails, invariantBreaches, priorityRecoveryObservation,
    ),
    exampleResults: resolveScenarioExampleResults(result),
  };
  entry.loadMetrics = result.loadMetrics ? buildLoadMetricsEntry(result.loadMetrics) : null;
  entry.performanceMeasurement = buildPerformanceMeasurementEntry(result, entry.loadMetrics);
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

function cloneInvariantBreachSummary(breaches) {
  if (
    !breaches ||
    typeof breaches !== 'object' ||
    !Array.isArray(breaches.failing)
  ) {
    return null;
  }
  return {
    ...breaches,
    failing: [...breaches.failing],
    hardBreaches: Array.isArray(breaches.hardBreaches) ?
      [...breaches.hardBreaches] :
      [],
    softBreaches: Array.isArray(breaches.softBreaches) ?
      [...breaches.softBreaches] :
      [],
  };
}

function resolveScenarioInvariantBreaches(result, normalizedDetails) {
  return (
    cloneInvariantBreachSummary(result?.invariantBreaches) ||
    cloneInvariantBreachSummary(
      normalizedDetails?.verification?.invariantBreaches,
    ) ||
    summarizeInvariantBreaches(
      normalizedDetails?.diagnostics?.rootCauseBundle?.invariants,
    )
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
    available, validForComparison, invalidReason, observedOpsPerSec, observedP99LatencyMs,
  };
}

function extractBottleneckSignalScores(loadMetrics) {
  const waitReasons = normalizeObject(loadMetrics.waitReasons);
  const nodeAdmissionBlocked =
    normalizeFiniteNumber(waitReasons[LOAD_METRICS_WAIT_REASON_NODE_ADMISSION_BLOCKED]) || ZERO;
  const retryableControlPlanePressure = normalizeFiniteNumber(
    waitReasons[LOAD_METRICS_WAIT_REASON_RETRYABLE_CONTROL_PLANE_PRESSURE],
  ) || ZERO;
  const nodeSlotUnavailable =
    normalizeFiniteNumber(waitReasons[LOAD_METRICS_WAIT_REASON_NODE_SLOT_UNAVAILABLE]) || ZERO;
  const timeoutWaits =
    normalizeFiniteNumber(waitReasons[LOAD_METRICS_WAIT_REASON_TIMEOUT_WAITS]) || ZERO;
  const targetOperations =
    normalizeFiniteNumber(loadMetrics[LOAD_METRICS_FIELD_TARGET_OPERATIONS]) || ZERO;
  const undispatchedOperations =
    normalizeFiniteNumber(loadMetrics[LOAD_METRICS_FIELD_UNDISPATCHED_OPERATIONS]) || ZERO;
  const undispatchedRatio = targetOperations > ZERO ?
    undispatchedOperations / targetOperations : ZERO;
  const queueDelayP95Ms =
    normalizeFiniteNumber(loadMetrics[LOAD_METRICS_FIELD_QUEUE_DELAY]?.p95) || ZERO;
  const admissionScore = nodeAdmissionBlocked + retryableControlPlanePressure;
  const queueScore = undispatchedOperations + Math.round(queueDelayP95Ms / 10);
  const timeoutScore = timeoutWaits;
  const nodeSlotScore = nodeSlotUnavailable;
  const dominantScore = Math.max(admissionScore, queueScore, timeoutScore, nodeSlotScore);
  return {
    nodeAdmissionBlocked, retryableControlPlanePressure, nodeSlotUnavailable, timeoutWaits,
    undispatchedOperations, undispatchedRatio, queueDelayP95Ms,
    admissionScore, queueScore, timeoutScore, nodeSlotScore, dominantScore,
  };
}

function buildBottleneckEstimate(loadMetrics) {
  if (!loadMetrics || typeof loadMetrics !== 'object' || Array.isArray(loadMetrics)) {
    return null;
  }
  const scores = extractBottleneckSignalScores(loadMetrics);

  if (scores.dominantScore <= ZERO) {
    return {
      kind: 'mixed_or_unknown',
      primaryEvidence: {
        attemptErrors:
          normalizeFiniteNumber(loadMetrics[LOAD_METRICS_FIELD_ATTEMPT_ERRORS]) || ZERO,
      },
      likelyWaitingTimeSource: 'insufficient_signal',
    };
  }

  if (scores.queueScore >= scores.dominantScore) {
    return {
      kind: 'dispatch_queue_backlog',
      primaryEvidence: {
        undispatchedOperations: scores.undispatchedOperations,
        undispatchedRatio: scores.undispatchedRatio,
        queueDelayP95Ms: scores.queueDelayP95Ms,
      },
      likelyWaitingTimeSource: 'dispatch_queue',
    };
  }

  if (scores.admissionScore >= scores.dominantScore) {
    return {
      kind: 'admission_pressure',
      primaryEvidence: {
        waitReason: LOAD_METRICS_WAIT_REASON_NODE_ADMISSION_BLOCKED,
        count: scores.nodeAdmissionBlocked,
        retryableControlPlanePressure: scores.retryableControlPlanePressure,
      },
      likelyWaitingTimeSource: 'admission_backoff',
    };
  }

  if (scores.nodeSlotScore >= scores.timeoutScore) {
    return {
      kind: 'node_slot_saturation',
      primaryEvidence: {
        waitReason: LOAD_METRICS_WAIT_REASON_NODE_SLOT_UNAVAILABLE,
        count: scores.nodeSlotUnavailable,
      },
      likelyWaitingTimeSource: 'per_node_bulkhead',
    };
  }

  return {
    kind: 'timeout_limited',
    primaryEvidence: {
      waitReason: LOAD_METRICS_WAIT_REASON_TIMEOUT_WAITS, count: scores.timeoutWaits,
    },
    likelyWaitingTimeSource: 'query_timeout',
  };
}

function resolvePerformanceMeasurement(entry) {
  const measurement = entry?.performanceMeasurement;
  if (measurement && typeof measurement === 'object' && !Array.isArray(measurement)) {
    return {
      available: measurement.available === true,
      validForComparison: measurement.validForComparison === true,
      invalidReason: measurement.invalidReason || null,
      observedOpsPerSec: normalizeFiniteNumber(measurement.observedOpsPerSec),
      observedP99LatencyMs: normalizeFiniteNumber(measurement.observedP99LatencyMs),
    };
  }
  return buildPerformanceMeasurementEntry(entry, entry?.loadMetrics);
}

function normalizeParityDetails(parity) {
  if (!parity || typeof parity !== 'object' || Array.isArray(parity)) {
    return {status: PARITY_STATUS_UNKNOWN, reasons: [], configured: {}, effective: {}};
  }
  return {
    ...parity,
    status: typeof parity.status === 'string' && parity.status ?
      parity.status : PARITY_STATUS_UNKNOWN,
    reasons: Array.isArray(parity.reasons) ? [...parity.reasons] : [],
    configured: normalizeObject(parity.configured),
    effective: normalizeObject(parity.effective),
  };
}

function normalizeEffectiveAdmissionPolicy(policy) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    return {resolved: {}, sources: {}, conflicts: []};
  }
  return {
    ...policy,
    resolved: normalizeObject(policy.resolved),
    sources: normalizeObject(policy.sources),
    conflicts: Array.isArray(policy.conflicts) ? [...policy.conflicts] : [],
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
      coverage.status : DIAGNOSTICS_COVERAGE_STATUS_UNAVAILABLE,
    reason: typeof coverage.reason === 'string' && coverage.reason ?
      coverage.reason : DIAGNOSTICS_COVERAGE_REASON_NOT_REPORTED,
    sampleCount: normalizeFiniteNumber(coverage.sampleCount) || ZERO,
  };
}

function buildCoreLoadMetricsFields(source) {
  return {
    total: normalizeFiniteNumber(source.total) || ZERO,
    success: normalizeFiniteNumber(source.success) || ZERO,
    failed: normalizeFiniteNumber(source.failed) || ZERO,
    errors: normalizeFiniteNumber(source.errors) || ZERO,
    latency: normalizeLatencyMetrics(source.latency),
    opsPerSec: normalizeFiniteNumber(source.opsPerSec) || ZERO,
    [LOAD_METRICS_FIELD_ATTEMPT_ERRORS]:
      normalizeFiniteNumber(source[LOAD_METRICS_FIELD_ATTEMPT_ERRORS]) || ZERO,
  };
}

function buildExtendedLoadMetricsFields(source) {
  return {
    [LOAD_METRICS_FIELD_QUEUE_DELAY]:
      normalizeQueueDelayMetrics(source[LOAD_METRICS_FIELD_QUEUE_DELAY]),
    [LOAD_METRICS_FIELD_DISTINCT_ERRORS]:
      Array.isArray(source[LOAD_METRICS_FIELD_DISTINCT_ERRORS]) ?
        [...source[LOAD_METRICS_FIELD_DISTINCT_ERRORS]] : [],
    [LOAD_METRICS_FIELD_TARGET_OPERATIONS]:
      normalizeFiniteNumber(source[LOAD_METRICS_FIELD_TARGET_OPERATIONS]) || ZERO,
    [LOAD_METRICS_FIELD_DISPATCHED_OPERATIONS]:
      normalizeFiniteNumber(source[LOAD_METRICS_FIELD_DISPATCHED_OPERATIONS]) || ZERO,
    [LOAD_METRICS_FIELD_UNDISPATCHED_OPERATIONS]:
      normalizeFiniteNumber(source[LOAD_METRICS_FIELD_UNDISPATCHED_OPERATIONS]) || ZERO,
    [LOAD_METRICS_FIELD_UNDISPATCHED_BY_REASON]:
      normalizeUndispatchedReasonMetrics(source[LOAD_METRICS_FIELD_UNDISPATCHED_BY_REASON]),
    [LOAD_METRICS_FIELD_WAIT_REASONS]:
      normalizeWaitReasonMetrics(source[LOAD_METRICS_FIELD_WAIT_REASONS]),
    [LOAD_METRICS_FIELD_PER_NODE]: normalizePerNodeMetrics(source[LOAD_METRICS_FIELD_PER_NODE]),
  };
}

function copyAdditiveLoadMetricFields(loadMetrics, normalized) {
  if (!loadMetrics || typeof loadMetrics !== 'object') {
    return;
  }
  for (const [field, value] of Object.entries(loadMetrics)) {
    if (!Object.hasOwn(normalized, field) && value !== undefined) {
      normalized[field] = cloneAdditiveMetricValue(value);
    }
  }
}

function buildLoadMetricsEntry(loadMetrics) {
  const source = loadMetrics ?? {};
  const normalized = {
    ...buildCoreLoadMetricsFields(source),
    ...buildExtendedLoadMetricsFields(source),
  };
  copyAdditiveLoadMetricFields(loadMetrics, normalized);
  return normalized;
}

function normalizeLatencyMetrics(latency) {
  if (!latency || typeof latency !== 'object') {
    return {avg: ZERO, p50: ZERO, p95: ZERO, p99: ZERO};
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
    return {avg: ZERO, p50: ZERO, p95: ZERO, p99: ZERO, max: ZERO};
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

function buildThroughputGapPriority(comparison) {
  const throughputRatio = normalizeFiniteNumber(comparison?.throughputRatioSutToBaseline);
  const sutOpsPerSec = normalizeFiniteNumber(comparison?.sutOpsPerSec);
  const baselineTps = normalizeFiniteNumber(comparison?.baselineTps);
  if (
    throughputRatio === null || sutOpsPerSec === null || baselineTps === null ||
    throughputRatio >= THROUGHPUT_RATIO_MEDIUM
  ) {
    return null;
  }
  const rating = scoreThroughputRatio(throughputRatio);
  return {
    component: COMPONENT_REPLICATION_WRITE_PATH, signal: SIGNAL_BASELINE_THROUGHPUT_GAP,
    priority: rating.priority, score: rating.score,
    reason: 'System throughput is significantly below baseline under identical workload.',
    evidence: {throughputRatioSutToBaseline: throughputRatio, sutOpsPerSec, baselineTps},
  };
}

function buildLatencyGapPriority(comparison) {
  const latencyRatio = normalizeFiniteNumber(comparison?.p99LatencyRatioSutToBaselineAvg);
  const sutP99LatencyMs = normalizeFiniteNumber(comparison?.sutP99LatencyMs);
  const baselineLatencyAvgMs = normalizeFiniteNumber(comparison?.baselineLatencyAvgMs);
  if (
    latencyRatio === null || sutP99LatencyMs === null || baselineLatencyAvgMs === null ||
    latencyRatio <= LATENCY_RATIO_MEDIUM
  ) {
    return null;
  }
  const rating = scoreLatencyRatio(latencyRatio);
  return {
    component: COMPONENT_TAIL_LATENCY_PATH, signal: SIGNAL_BASELINE_LATENCY_GAP,
    priority: rating.priority, score: rating.score,
    reason:
      'Tail latency is significantly higher than baseline and dominates user-visible delays.',
    evidence: {
      p99LatencyRatioSutToBaselineAvg: latencyRatio, sutP99LatencyMs, baselineLatencyAvgMs,
    },
  };
}

function buildInternalTailLatencyPriority(loadMetrics) {
  const p50 = normalizeFiniteNumber(loadMetrics?.latency?.p50);
  const p99 = normalizeFiniteNumber(loadMetrics?.latency?.p99);
  if (p50 === null || p99 === null || p50 <= ZERO) {
    return null;
  }
  const internalTailRatio = p99 / p50;
  if (internalTailRatio <= INTERNAL_TAIL_RATIO_MEDIUM) {
    return null;
  }
  const rating = scoreInternalTailRatio(internalTailRatio);
  return {
    component: COMPONENT_TAIL_LATENCY_PATH, signal: SIGNAL_INTERNAL_TAIL_LATENCY,
    priority: rating.priority, score: rating.score,
    reason:
      'Large p99/p50 spread indicates queueing or lock contention on slow-path operations.',
    evidence: {p50LatencyMs: p50, p99LatencyMs: p99, p99ToP50Ratio: internalTailRatio},
  };
}

function buildConvergenceSettlePriority(convergence) {
  const settledAfterMs = normalizeFiniteNumber(convergence?.settledAfterMs);
  if (settledAfterMs === null || settledAfterMs <= CONVERGENCE_SETTLE_TIME_MEDIUM_MS) {
    return null;
  }
  const rating = settledAfterMs > CONVERGENCE_SETTLE_TIME_HIGH_MS ?
    {priority: PRIORITY_HIGH, score: SCORE_HIGH} :
    {priority: PRIORITY_MEDIUM, score: SCORE_MEDIUM};
  return {
    component: COMPONENT_CONVERGENCE_CONTROL_PLANE, signal: SIGNAL_CONVERGENCE_SETTLE_TIME,
    priority: rating.priority, score: rating.score,
    reason:
      'Convergence delay suggests extra work in replica movement, ' +
      'promotion, or membership updates.',
    evidence: {settledAfterMs, leaderChanges: normalizeFiniteNumber(convergence?.leaderChanges)},
  };
}

function buildOverTargetDurationPriority(convergence) {
  const maxOverTargetMs = normalizeFiniteNumber(convergence?.maxOverTargetMs);
  if (maxOverTargetMs === null || maxOverTargetMs <= OVER_TARGET_DURATION_MEDIUM_MS) {
    return null;
  }
  const rating = maxOverTargetMs > OVER_TARGET_DURATION_HIGH_MS ?
    {priority: PRIORITY_HIGH, score: SCORE_HIGH} :
    {priority: PRIORITY_MEDIUM, score: SCORE_MEDIUM};
  return {
    component: COMPONENT_CONVERGENCE_CONTROL_PLANE, signal: SIGNAL_OVER_TARGET_VOTER_DURATION,
    priority: rating.priority, score: rating.score,
    reason:
      'Over-target voter windows indicate delayed learner demotion ' +
      'or replica operation completion.',
    evidence: {maxOverTargetMs},
  };
}

function buildPartitionHotspotPriority(partitionHotspots) {
  if (partitionHotspots.length === ZERO) {
    return null;
  }
  const primaryHotspot = partitionHotspots[ZERO] ?? {};
  const primaryScore = normalizeFiniteNumber(primaryHotspot.hotspotScore) || ZERO;
  if (primaryScore <= ZERO) {
    return null;
  }
  return {
    component: COMPONENT_CONVERGENCE_CONTROL_PLANE, signal: SIGNAL_PARTITION_HOTSPOTS,
    priority: primaryScore >= SCORE_HIGH ? PRIORITY_HIGH : PRIORITY_MEDIUM,
    score: Math.min(SCORE_CRITICAL, Math.max(SCORE_MEDIUM, primaryScore)),
    reason:
      'Per-partition diagnostics indicate localized membership churn ' +
      'and operation pressure on specific partitions.',
    evidence: {
      hotspotCount: partitionHotspots.length,
      topPartitionId: primaryHotspot.partitionId || null,
      topPartitionScore: primaryScore,
      topPartitionOverTargetMs: normalizeFiniteNumber(primaryHotspot.overTargetMs) || ZERO,
      topPartitionExcessVoters: normalizeFiniteNumber(primaryHotspot.excessVoters) || ZERO,
    },
  };
}

function buildQueuePressurePriority(loadMetrics) {
  const metrics = loadMetrics ?? {};
  const targetOperations =
    normalizeFiniteNumber(metrics.targetOperations) || ZERO;
  const undispatchedOperations =
    normalizeFiniteNumber(metrics.undispatchedOperations) || ZERO;
  const undispatchedRatio = targetOperations > ZERO ?
    undispatchedOperations / targetOperations :
    null;
  const queueDelayP95Ms = normalizeFiniteNumber(metrics.queueDelay?.p95);
  const queueDelayP99Ms = normalizeFiniteNumber(metrics.queueDelay?.p99);
  const hasUndispatchedPressure =
    undispatchedRatio !== null &&
    undispatchedRatio >= QUEUE_UNDISPATCHED_RATIO_MEDIUM;
  const hasQueueDelayPressure =
    queueDelayP95Ms !== null &&
    queueDelayP95Ms >= QUEUE_DELAY_P95_MEDIUM_MS;
  if (!hasUndispatchedPressure && !hasQueueDelayPressure) {
    return null;
  }
  const rating = scoreQueuePressure(undispatchedRatio, queueDelayP95Ms);
  return {
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
  };
}

function sumAdmissionSignalCount(perNodeMetrics) {
  let admissionSignalCount = ZERO;
  for (const nodeMetrics of Object.values(normalizeObject(perNodeMetrics))) {
    admissionSignalCount +=
      normalizeFiniteNumber(nodeMetrics?.admissionSignals) || ZERO;
  }
  return admissionSignalCount;
}

function buildAdmissionPressurePriority(loadMetrics, benchmarkDetails) {
  const metrics = loadMetrics ?? {};
  const admissionSignalCount = sumAdmissionSignalCount(metrics.perNode);
  const attemptErrors = normalizeFiniteNumber(metrics.attemptErrors) || ZERO;
  const totalAttempts =
    (normalizeFiniteNumber(metrics.total) || ZERO) + attemptErrors;
  const admissionSignalRatio = totalAttempts > ZERO ?
    admissionSignalCount / totalAttempts :
    null;
  const hasRatioPressure =
    admissionSignalRatio !== null &&
    admissionSignalRatio >= ADMISSION_SIGNAL_RATIO_MEDIUM;
  if (
    !hasRatioPressure &&
    admissionSignalCount < ADMISSION_SIGNAL_COUNT_MEDIUM
  ) {
    return null;
  }
  const rating = scoreAdmissionPressure(
    admissionSignalRatio,
    admissionSignalCount,
  );
  return {
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
        benchmarkDetails?.effectiveAdmissionPolicy?.resolved
          ?.loadMaxInFlightPerNode,
      ),
    },
  };
}

function buildLoadFailureRatePriority(loadMetrics) {
  const metrics = loadMetrics ?? {};
  const totalLoadOps = normalizeFiniteNumber(metrics.total) || ZERO;
  if (totalLoadOps <= ZERO) {
    return null;
  }
  const failedLoadOps = normalizeFiniteNumber(metrics.failed) || ZERO;
  const erroredLoadOps = normalizeFiniteNumber(metrics.errors) || ZERO;
  const failureRate = (failedLoadOps + erroredLoadOps) / totalLoadOps;
  if (failureRate <= LOAD_FAILURE_RATE_MEDIUM) {
    return null;
  }
  const rating = failureRate > LOAD_FAILURE_RATE_HIGH ?
    {priority: PRIORITY_HIGH, score: SCORE_HIGH} :
    {priority: PRIORITY_MEDIUM, score: SCORE_MEDIUM};
  return {
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
  };
}

function buildMemoryLeakPriority(memoryLeak) {
  if (memoryLeak?.leakDetected !== true) {
    return null;
  }
  return {
    component: COMPONENT_MEMORY_LIFECYCLE,
    signal: SIGNAL_MEMORY_LEAK,
    priority: PRIORITY_CRITICAL,
    score: SCORE_CRITICAL,
    reason:
      'Leak signal detected in sustained sampling and should be treated as release-blocking.',
    evidence: {
      leakingNodeCount:
        normalizeFiniteNumber(memoryLeak.leakingNodeCount) || ZERO,
      leakingNodes: Array.isArray(memoryLeak.leakingNodes) ?
        memoryLeak.leakingNodes :
        [],
    },
  };
}

function buildLogAnomaliesPriority(analysisSummary) {
  const anomalyCount = normalizeFiniteNumber(analysisSummary?.anomaly_count);
  if (anomalyCount === null || anomalyCount < ANOMALY_COUNT_MEDIUM) {
    return null;
  }
  const rating = anomalyCount >= ANOMALY_COUNT_HIGH ?
    {priority: PRIORITY_HIGH, score: SCORE_HIGH} :
    {priority: PRIORITY_MEDIUM, score: SCORE_MEDIUM};
  return {
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
  };
}

function buildOptimizationPriorities(scenarioEntry) {
  const entry = scenarioEntry ?? {};
  const benchmarkDetails = resolveBenchmarkDetails(entry.details);
  const comparison = benchmarkDetails?.comparison || null;
  const convergence =
    benchmarkDetails?.convergence || entry.convergenceTiming || null;
  const loadMetrics = entry.loadMetrics || null;
  const partitionHotspots = Array.isArray(entry.partitionHotspots) ?
    entry.partitionHotspots :
    [];

  const priorities = arrayFilter([
    buildThroughputGapPriority(comparison),
    buildLatencyGapPriority(comparison),
    buildInternalTailLatencyPriority(loadMetrics),
    buildConvergenceSettlePriority(convergence),
    buildOverTargetDurationPriority(convergence),
    buildPartitionHotspotPriority(partitionHotspots),
    buildQueuePressurePriority(loadMetrics),
    buildAdmissionPressurePriority(loadMetrics, benchmarkDetails),
    buildLoadFailureRatePriority(loadMetrics),
    buildMemoryLeakPriority(entry.memoryLeak),
    buildLogAnomaliesPriority(entry.analysisSummary),
  ], Boolean);

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
  const entry = scenarioEntry ?? {};
  const details = entry.details ?? {};
  const benchmarkDetails = resolveBenchmarkDetails(entry.details) ?? {};
  const candidates = [
    details.diagnostics,
    details.convergenceDiagnostics,
    entry.convergenceTiming?.diagnostics,
    benchmarkDetails.convergenceDiagnostics,
    benchmarkDetails.convergence?.diagnostics,
  ];
  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object') {
      return candidate;
    }
  }
  return null;
}

function buildSinglePartitionHotspot(
  partitionId,
  partitionMembership,
  overTargetDurations,
  operationsByPartition,
) {
  const membership = partitionMembership[partitionId] || {};
  const overTargetMs =
    normalizeFiniteNumber(overTargetDurations[partitionId]) || ZERO;
  const voterCount = normalizeFiniteNumber(membership.voterCount) || ZERO;
  const targetVoterCount =
    normalizeFiniteNumber(membership.targetVoterCount) || ZERO;
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
  return {
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
  };
}

function buildPartitionHotspots(scenarioEntry) {
  const diagnostics = resolveConvergenceDiagnostics(scenarioEntry);
  if (!diagnostics) {
    return null;
  }
  const partitionMembership = normalizeObject(diagnostics.partitionMembership);
  const overTargetDurations = normalizeObject(diagnostics.overTargetDurations);
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

  const hotspots = arrayMap(
    [...partitionIds].sort(),
    (partitionId) =>
      buildSinglePartitionHotspot(
        partitionId,
        partitionMembership,
        overTargetDurations,
        operationsByPartition,
      ),
  );

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
  const source = row ?? {};
  return {
    operationId: source.operationId || null,
    type: source.type || null,
    status: source.status || null,
    fromNodeId: source.fromNodeId || null,
    toNodeId: source.toNodeId || null,
    at: source.at || null,
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
  const leftItem = left ?? {};
  const rightItem = right ?? {};
  const leftScore = normalizeFiniteNumber(leftItem.hotspotScore) || ZERO;
  const rightScore = normalizeFiniteNumber(rightItem.hotspotScore) || ZERO;
  if (leftScore !== rightScore) {
    return rightScore - leftScore;
  }
  const leftOverTargetMs = normalizeFiniteNumber(leftItem.overTargetMs) || ZERO;
  const rightOverTargetMs =
    normalizeFiniteNumber(rightItem.overTargetMs) || ZERO;
  if (leftOverTargetMs !== rightOverTargetMs) {
    return rightOverTargetMs - leftOverTargetMs;
  }
  return String(leftItem.partitionId || COMPONENT_UNKNOWN)
    .localeCompare(String(rightItem.partitionId || COMPONENT_UNKNOWN));
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

function compareOptimizationPriorityNumericRank(leftItem, rightItem) {
  const leftScore = normalizeFiniteNumber(leftItem.score) || ZERO;
  const rightScore = normalizeFiniteNumber(rightItem.score) || ZERO;
  if (leftScore !== rightScore) {
    return rightScore - leftScore;
  }
  const leftOrder = PRIORITY_ORDER[leftItem.priority] || ZERO;
  const rightOrder = PRIORITY_ORDER[rightItem.priority] || ZERO;
  return rightOrder - leftOrder;
}

function compareOptimizationPriority(left, right) {
  const leftItem = left ?? {};
  const rightItem = right ?? {};
  const numericDelta = compareOptimizationPriorityNumericRank(
    leftItem,
    rightItem,
  );
  if (numericDelta !== ZERO) {
    return numericDelta;
  }
  const leftComponent = String(leftItem.component || COMPONENT_UNKNOWN);
  const rightComponent = String(rightItem.component || COMPONENT_UNKNOWN);
  if (leftComponent !== rightComponent) {
    return leftComponent.localeCompare(rightComponent);
  }
  const leftSignal = String(leftItem.signal || COMPONENT_UNKNOWN);
  const rightSignal = String(rightItem.signal || COMPONENT_UNKNOWN);
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

const REPORT_DEGRADED_SCENARIO_ENTRY_CAP_BYTES = 128 * 1024 * 1024;
const REPORT_DEGRADED_FIELD_UNSERIALIZABLE = 'unserializable';
const REPORT_DEGRADED_KEPT_SCENARIO_FIELDS = Object.freeze([
  'scenario',
  'passed',
  'outcome',
  'refusal',
  'certification',
  'duration',
  'error',
  'stackTrace',
  'startedAt',
  'rootCauseClass',
  'dominantReason',
  'failureClassification',
  'failureBundle',
  // CL-030/CL-031: classification + exit evidence are the gate classifier's
  // inputs and are bounded (exit tails capped at 8KB/node) — they must
  // survive degradation (gate 212016Z-run4 lost both with details).
  'classification',
  'unexpectedNodeExits',
]);

function measureSerializedBytes(value) {
  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === 'string' ? serialized.length : ZERO;
  } catch {
    return REPORT_DEGRADED_FIELD_UNSERIALIZABLE;
  }
}

// CL-031: a flat 'unserializable'/huge-byte-count names only the FIELD; the
// next session needs the MEMBER inside it (gate 212016Z-run4: details =
// 'unserializable', growth member unnamed). Descend into oversized or
// unserializable values member-by-member, depth-capped — same pattern as
// the node-side payload-size attribution.
const REPORT_DEGRADED_ATTRIBUTION_MAX_DEPTH = 3;
const REPORT_DEGRADED_ATTRIBUTION_ARRAY_SCAN_LIMIT = 64;
// Descend whenever a dropped field is big enough to matter (mirrors the
// node-side 8MiB payload-attribution threshold), not only past the entry cap.
const REPORT_DEGRADED_ATTRIBUTION_DESCEND_BYTES = 8 * 1024 * 1024;

function buildArrayDroppedFieldAttribution(value, bytes, depth) {
  let largestIndex = -1;
  let largestBytes = -1;
  const scanCount = Math.min(
    value.length,
    REPORT_DEGRADED_ATTRIBUTION_ARRAY_SCAN_LIMIT,
  );
  for (let i = 0; i < scanCount; i++) {
    const elementBytes = measureSerializedBytes(value[i]);
    if (
      elementBytes === REPORT_DEGRADED_FIELD_UNSERIALIZABLE ||
      elementBytes > largestBytes
    ) {
      largestBytes = elementBytes === REPORT_DEGRADED_FIELD_UNSERIALIZABLE ?
        Number.MAX_SAFE_INTEGER :
        elementBytes;
      largestIndex = i;
    }
  }
  return {
    totalBytes: bytes,
    arrayLength: value.length,
    largestElementIndex: largestIndex,
    largestElement: largestIndex >= 0 ?
      buildDroppedFieldAttribution(value[largestIndex], depth + 1) :
      null,
  };
}

function buildDroppedFieldAttribution(value, depth = 0) {
  const bytes = measureSerializedBytes(value);
  const oversized =
    bytes === REPORT_DEGRADED_FIELD_UNSERIALIZABLE ||
    bytes > REPORT_DEGRADED_ATTRIBUTION_DESCEND_BYTES;
  if (
    !oversized ||
    depth >= REPORT_DEGRADED_ATTRIBUTION_MAX_DEPTH ||
    !value ||
    typeof value !== 'object'
  ) {
    return bytes;
  }
  if (Array.isArray(value)) {
    return buildArrayDroppedFieldAttribution(value, bytes, depth);
  }
  const members = {};
  for (const [key, member] of Object.entries(value)) {
    members[key] = buildDroppedFieldAttribution(member, depth + 1);
  }
  return {totalBytes: bytes, members};
}

function degradeScenarioEntryForSerialization(entry) {
  const droppedFieldSizes = {};
  const degraded = {};
  for (const field of REPORT_DEGRADED_KEPT_SCENARIO_FIELDS) {
    if (entry[field] !== undefined) {
      degraded[field] = entry[field];
    }
  }
  for (const [field, value] of Object.entries(entry)) {
    if (REPORT_DEGRADED_KEPT_SCENARIO_FIELDS.includes(field)) {
      continue;
    }
    droppedFieldSizes[field] = buildDroppedFieldAttribution(value);
  }
  degraded.reportWriteDegraded = {
    reason: 'scenario entry exceeded the report serialization limit',
    droppedFieldSizes,
  };
  return degraded;
}

/**
 * A report that cannot serialize must degrade per scenario, never be lost:
 * the report is the gate's classification input, and a RangeError here
 * turns a classified failure into NO_REPORT on exactly the longest runs.
 * Dropped fields are replaced with their measured sizes so the unbounded
 * member is named in the artifact itself.
 */
function degradeReportForSerialization(report) {
  const degradedScenarios = [];
  for (const entry of Array.isArray(report.scenarios) ?
    report.scenarios : []) {
    const entryBytes = measureSerializedBytes(entry);
    if (
      entryBytes !== REPORT_DEGRADED_FIELD_UNSERIALIZABLE &&
      entryBytes <= REPORT_DEGRADED_SCENARIO_ENTRY_CAP_BYTES
    ) {
      degradedScenarios.push(entry);
      continue;
    }
    const degraded = degradeScenarioEntryForSerialization(entry);
    console.warn(
      '[harness] WARNING: report scenario entry degraded for ' +
      `serialization (${entry?.scenario}): dropped field sizes ` +
      `${JSON.stringify(degraded.reportWriteDegraded.droppedFieldSizes)}`,
    );
    degradedScenarios.push(degraded);
  }
  return {...report, scenarios: degradedScenarios};
}

function serializeReportWithDegradation(report) {
  try {
    return {
      finalReport: report,
      serializedReport: JSON.stringify(report, null, JSON_INDENT),
    };
  } catch (serializationError) {
    console.warn(
      '[harness] WARNING: report serialization failed ' +
      `(${String(serializationError?.message || serializationError)}); ` +
      'degrading oversized scenario entries',
    );
    let degradedReport = degradeReportForSerialization(report);
    try {
      return {
        finalReport: degradedReport,
        serializedReport: JSON.stringify(degradedReport, null, JSON_INDENT),
      };
    } catch {
      // The sum of under-cap entries can still exceed the limit:
      // degrade every entry unconditionally.
      degradedReport = {
        ...report,
        scenarios: arrayMap(
          Array.isArray(report.scenarios) ? report.scenarios : [],
          degradeScenarioEntryForSerialization,
        ),
      };
      return {
        finalReport: degradedReport,
        serializedReport: JSON.stringify(degradedReport, null, JSON_INDENT),
      };
    }
  }
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
      if (key !== 'metadata') {
        report[key] = value;
      }
    }

    if (Object.keys(reportMetadata).length > ZERO) {
      report.metadata = reportMetadata;
    }

    const dir = dirname(this.outputPath);
    await mkdir(dir, {recursive: true});
    const {finalReport, serializedReport} =
      serializeReportWithDegradation(report);
    await writeFile(this.outputPath, serializedReport, 'utf8');
    return finalReport;
  }
}

export {ReportWriter, buildScenarioEntry, computeSummary, computeStandardSummary, JSON_INDENT};
