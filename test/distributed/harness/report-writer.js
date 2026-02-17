/**
 * Report Writer — produces structured JSON test reports.
 *
 * Accumulates scenario results and writes a final report with
 * per-scenario details and an aggregate summary.
 */

import {writeFile, mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';

/** Indentation for JSON output. */
const JSON_INDENT = 2;
const ZERO = 0;
const STANDARD_SUMMARY_SIMILARITY_FALLBACK = 'default';
const STANDARD_SUMMARY_BASELINE_ENGINE = 'postgres';

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
  const entry = {
    scenario: scenarioName,
    passed: Boolean(result.passed),
    duration: result.duration || 0,
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
    details: result.details || null,
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
    entry.loadMetrics = {
      total: result.loadMetrics.total || 0,
      success: result.loadMetrics.success || 0,
      failed: result.loadMetrics.failed || 0,
      errors: result.loadMetrics.errors || 0,
      latency: result.loadMetrics.latency || null,
      opsPerSec: result.loadMetrics.opsPerSec || 0,
    };
  } else {
    entry.loadMetrics = null;
  }

  entry.partitionHotspots = buildPartitionHotspots(entry);
  entry.optimizationPriorities = buildOptimizationPriorities(entry);

  return entry;
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

function resolveBenchmarkDetails(details) {
  if (!details || typeof details !== 'object') {
    return null;
  }
  if (details.details && typeof details.details === 'object') {
    return details.details;
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
  return {
    passed: entry?.passed === true,
    durationMs: normalizeFiniteNumber(entry?.duration) || ZERO,
    opsPerSec: normalizeFiniteNumber(entry?.loadMetrics?.opsPerSec),
    p99LatencyMs: normalizeFiniteNumber(entry?.loadMetrics?.latency?.p99),
  };
}

function buildPostgresBaselineSnapshot(entry) {
  const benchmarkDetails = resolveBenchmarkDetails(entry?.details);
  const comparison = benchmarkDetails?.comparison;
  if (!comparison || typeof comparison !== 'object') {
    return null;
  }

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
    throughputRatioSutToBaseline,
    p99LatencyRatioSutToBaselineAvg,
    sutOpsPerSec,
    baselineTps,
    sutP99LatencyMs,
    baselineLatencyAvgMs,
    cache: baseline?.cache || null,
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
    durationMs: computeAbsoluteDelta(current.durationMs, previous.durationMs),
    durationRatio: computeRatioDelta(current.durationMs, previous.durationMs),
    opsPerSec: computeAbsoluteDelta(current.opsPerSec, previous.opsPerSec),
    opsPerSecRatio: computeRatioDelta(current.opsPerSec, previous.opsPerSec),
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
      scenarios: report.scenarios,
    });
  }
  normalized.sort((left, right) =>
    parseTimestampMs(right.timestamp) - parseTimestampMs(left.timestamp));
  return normalized;
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
    if (postgresBaseline) {
      scenariosComparedToPostgresBaseline++;
    }

    const previousMatch = previousBySimilarityKey.get(similarityKey) || null;
    let previousSimilarRun = null;
    let deltaVsPrevious = null;
    if (previousMatch) {
      const previousSnapshot = buildScenarioSnapshot(previousMatch.scenario);
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
    });
  }

  return {
    historicalReportsConsidered: normalizedHistory.length,
    scenariosComparedToPrevious,
    scenariosComparedToPostgresBaseline,
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

class ReportWriter {
  /**
   * @param {string} outputPath - File path for the JSON report
   */
  constructor(outputPath, options = {}) {
    this.outputPath = outputPath;
    this.scenarios = [];
    this.historyReports = normalizeHistoryReports(options.historyReports);
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
  async write() {
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

    const dir = dirname(this.outputPath);
    await mkdir(dir, {recursive: true});
    await writeFile(
      this.outputPath,
      JSON.stringify(report, null, JSON_INDENT),
      'utf8',
    );
  }
}

export {
  ReportWriter,
  buildScenarioEntry,
  computeSummary,
  computeStandardSummary,
  JSON_INDENT,
};
