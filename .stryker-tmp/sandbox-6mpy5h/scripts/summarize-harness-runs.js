#!/usr/bin/env node
// @ts-nocheck

/**
 * Summarize the latest distributed harness run for each scenario.
 *
 * Usage:
 *   node scripts/summarize-harness-runs.js [--report-dir <dir>]
 *
 * Scans the report directory for *.report.json files, groups by scenario,
 * picks the most recent run per scenario, and prints a summary table.
 */

import {readdirSync, readFileSync, existsSync} from 'node:fs';
import {join, basename} from 'node:path';

const DEFAULT_REPORT_DIR = 'test-output/reports';
const MS_PER_SECOND = 1000;
const PASS_SYMBOL = '\u2713';
const FAIL_SYMBOL = '\u2717';
const SCENARIO_COL_WIDTH = 48;
const STATUS_COL_WIDTH = 8;
const DUR_COL_WIDTH = 8;
const CLUSTER_COL_WIDTH = 5;
const OPS_COL_WIDTH = 9;
const LAT_COL_WIDTH = 9;
const PG_COL_WIDTH = 7;
const SEPARATOR_WIDTH = 112;
const ERROR_TRUNCATE_LEN = 80;
const REPORT_EXTENSION = '.report.json';
const ARG_REPORT_DIR = '--report-dir';
const DECIMAL_PLACES = 1;
const UNKNOWN_SCENARIO = 'unknown';
const NO_VALUE = '-';
const EXIT_ERROR = 1;

/**
 * Parse a single report file and extract scenario summary data.
 * @param {string} filePath - Path to report JSON.
 * @return {object|null} Parsed scenario summary or null on failure.
 */
function parseReport(filePath) {
  try {
    const raw = readFileSync(filePath, 'utf8');
    const report = JSON.parse(raw);
    const scenario = report.scenarios && report.scenarios[0];
    if (!scenario) return null;

    const ss = report.standardSummary &&
      report.standardSummary.scenarios &&
      report.standardSummary.scenarios[0];
    const current = (ss && ss.current) || {};
    const lm = scenario.loadMetrics || {};
    const lat = lm.latency || {};
    const pgBaseline = (ss && ss.postgresBaseline) || null;

    const durationMs = current.durationMs || scenario.duration || 0;
    const opsPerSec = current.opsPerSec != null ?
      current.opsPerSec : (lm.opsPerSecond || null);
    const pgRatio = pgBaseline &&
      pgBaseline.throughputRatioSutToBaseline != null ?
      pgBaseline.throughputRatioSutToBaseline : null;

    return {
      file: basename(filePath),
      scenario: scenario.scenario || UNKNOWN_SCENARIO,
      passed: !!scenario.passed,
      durationMs,
      clusterSize: scenario.clusterSize || current.clusterSize || 0,
      opsPerSec,
      totalOps: lm.totalOps || null,
      successRate: lm.successRate != null ? lm.successRate : null,
      p50: lat.p50 != null ? lat.p50 : null,
      p95: lat.p95 != null ? lat.p95 : null,
      p99: current.p99LatencyMs != null ?
        current.p99LatencyMs : (lat.p99 != null ? lat.p99 : null),
      pgRatio,
      error: scenario.error || null,
      timestamp: report.timestamp || null,
    };
  } catch (_e) {
    return null;
  }
}

/**
 * Discover all report files and return the latest per scenario.
 * @param {string} reportDir - Directory to scan.
 * @return {Array<object>} Array of scenario summaries, sorted by name.
 */
function discoverLatestRuns(reportDir) {
  const files = readdirSync(reportDir)
    .filter((f) => f.endsWith(REPORT_EXTENSION));

  const byScenario = new Map();

  for (const file of files) {
    const filePath = join(reportDir, file);
    const summary = parseReport(filePath);
    if (!summary) continue;

    const key = summary.scenario + ':' + summary.clusterSize;
    const existing = byScenario.get(key);
    if (!existing ||
        (summary.timestamp && existing.timestamp &&
         summary.timestamp > existing.timestamp)) {
      byScenario.set(key, summary);
    }
  }

  const results = Array.from(byScenario.values());
  results.sort((a, b) => {
    if (a.passed !== b.passed) return a.passed ? -1 : 1;
    return a.scenario.localeCompare(b.scenario);
  });
  return results;
}

/** Pad string to fixed width (left-aligned). */
function pad(str, width) {
  const s = String(str);
  if (s.length >= width) return s.slice(0, width);
  return s + ' '.repeat(width - s.length);
}

/** Pad string to fixed width (right-aligned). */
function rpad(str, width) {
  const s = String(str);
  if (s.length >= width) return s.slice(0, width);
  return ' '.repeat(width - s.length) + s;
}

/** Format a number with one decimal, or return '-'. */
function fmtNum(val, suffix) {
  if (val == null) return NO_VALUE;
  return Number(val).toFixed(DECIMAL_PLACES) + (suffix || '');
}

/** Format an integer or return '-'. */
function fmtInt(val, suffix) {
  if (val == null) return NO_VALUE;
  return Math.round(val) + (suffix || '');
}

/**
 * Print the summary table to stdout.
 * @param {Array<object>} runs - Array of scenario summaries.
 */
function printTable(runs) {
  const sep = '\u2500'.repeat(SEPARATOR_WIDTH);
  const passCount = runs.filter((r) => r.passed).length;
  const failCount = runs.length - passCount;

  console.log(sep);
  console.log(
    'Distributed Harness Summary: ' +
    `${passCount} passed, ${failCount} failed ` +
    `(${runs.length} scenarios)`,
  );
  console.log(sep);

  const header =
    pad('Scenario', SCENARIO_COL_WIDTH) +
    rpad('Status', STATUS_COL_WIDTH) +
    rpad('Dur', DUR_COL_WIDTH) +
    rpad('Clu', CLUSTER_COL_WIDTH) +
    rpad('ops/s', OPS_COL_WIDTH) +
    rpad('p50', LAT_COL_WIDTH) +
    rpad('p95', LAT_COL_WIDTH) +
    rpad('p99', LAT_COL_WIDTH) +
    rpad('vs PG', PG_COL_WIDTH);
  console.log(header);
  console.log(sep);

  for (const r of runs) {
    const status = r.passed ?
      (PASS_SYMBOL + ' PASS') : (FAIL_SYMBOL + ' FAIL');
    const dur = fmtNum(r.durationMs / MS_PER_SECOND, 's');
    const cluster = r.clusterSize + 'n';
    const ops = r.opsPerSec != null ?
      fmtNum(r.opsPerSec, '') : NO_VALUE;
    const p50 = fmtInt(r.p50, 'ms');
    const p95 = fmtInt(r.p95, 'ms');
    const p99 = fmtInt(r.p99, 'ms');
    const pg = r.pgRatio != null ?
      fmtNum(r.pgRatio, 'x') : NO_VALUE;

    const line =
      pad(r.scenario, SCENARIO_COL_WIDTH) +
      rpad(status, STATUS_COL_WIDTH) +
      rpad(dur, DUR_COL_WIDTH) +
      rpad(cluster, CLUSTER_COL_WIDTH) +
      rpad(ops, OPS_COL_WIDTH) +
      rpad(p50, LAT_COL_WIDTH) +
      rpad(p95, LAT_COL_WIDTH) +
      rpad(p99, LAT_COL_WIDTH) +
      rpad(pg, PG_COL_WIDTH);
    console.log(line);

    if (!r.passed && r.error) {
      const errSnippet = r.error.length > ERROR_TRUNCATE_LEN ?
        r.error.slice(0, ERROR_TRUNCATE_LEN) + '...' :
        r.error;
      console.log('  ' + errSnippet);
    }
  }

  console.log(sep);
  const timestamps = runs
    .filter((r) => r.timestamp)
    .map((r) => r.timestamp);
  if (timestamps.length > 0) {
    const oldest = timestamps.reduce((a, b) => a < b ? a : b);
    const newest = timestamps.reduce((a, b) => a > b ? a : b);
    console.log(`Report range: ${oldest} .. ${newest}`);
  }
}

/** Main entry point. */
function main() {
  const args = process.argv.slice(2);
  let reportDir = DEFAULT_REPORT_DIR;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === ARG_REPORT_DIR && args[i + 1]) {
      reportDir = args[i + 1];
      i++;
    }
  }

  if (!existsSync(reportDir)) {
    console.error(`Report directory not found: ${reportDir}`);
    process.exit(EXIT_ERROR);
  }

  const runs = discoverLatestRuns(reportDir);
  if (runs.length === 0) {
    console.log('No report files found in ' + reportDir);
    return;
  }

  printTable(runs);
}

main();
