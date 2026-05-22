function createReportWriterSummaryMethods(options = {}) {
  const {
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
  } = options;
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
      verdict: entry?.verdict || null,
      verdictReason: entry?.verdictReason || null,
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
  return {
    computeStandardSummary,
    computeSummary,
    normalizeMetadata,
    normalizeHistoryReports,
  };
}
export {createReportWriterSummaryMethods};
