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
const SIGNAL_LOAD_FAILURE_RATE = 'load_failure_rate';
const SIGNAL_MEMORY_LEAK = 'memory_leak';
const SIGNAL_LOG_ANOMALIES = 'log_anomalies';

const MAX_OPTIMIZATION_ITEMS_PER_SCENARIO = 3;
const OPTIMIZATION_SUMMARY_TOP_COMPONENT_LIMIT = 5;

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

  return {
    totalPriorityItems: items.length,
    scenariosWithPriorities: new Set(items.map((item) =>
      String(item.scenario || COMPONENT_UNKNOWN))).size,
    topComponents,
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
  constructor(outputPath) {
    this.outputPath = outputPath;
    this.scenarios = [];
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

export {ReportWriter, buildScenarioEntry, computeSummary, JSON_INDENT};
