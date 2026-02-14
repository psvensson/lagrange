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
  };

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

  return entry;
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
