// Scenario-harness probe — reads distributed harness reports
// (`test-output/reports/*.report.json`) and answers the two independent questions for
// a named scenario:
//
//   done   = the scenario passed in the most recent `consecutive` distinct runs
//            (flake-proofing for stabilization goals)
//   metric = a lower-is-better progress gradient that is INDEPENDENT of done:
//            the number of outstanding priority items (default), or the report's
//            failed-scenario count. This lets the loop see progress (e.g. 3 -> 1
//            outstanding issues) before the scenario fully flips to passing.
//
// evidence = the report file the answer was read from.

import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_REPORT_DIR = 'test-output/reports';
const REPORT_EXT = '.report.json';
const METRIC_PRIORITY = 'priority';
const METRIC_FAILED = 'failed';
const DEFAULT_CONSECUTIVE = 1;

function safeRead(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_error) {
    return null;
  }
}

function scenarioEntry(data, scenario) {
  const scenarios = data?.standardSummary?.scenarios;
  if (!Array.isArray(scenarios)) return null;
  return scenarios.find((s) => s.scenario === scenario) || null;
}

function reportCoversScenario(data, scenario) {
  return scenarioEntry(data, scenario) !== null;
}

function scenarioPassed(data, scenario) {
  const entry = scenarioEntry(data, scenario);
  if (entry?.current && typeof entry.current.passed === 'boolean') {
    return entry.current.passed;
  }
  return data?.summary?.failed === 0;
}

// Most-recent-first, de-duplicated by run timestamp so re-read/identical reports do
// not inflate the "consecutive distinct runs" count.
function listRuns(dir, scenario) {
  if (!fs.existsSync(dir)) return [];
  const seen = new Set();
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith(REPORT_EXT))
    .map((f) => ({file: path.join(dir, f), data: safeRead(path.join(dir, f))}))
    .filter((r) => r.data && reportCoversScenario(r.data, scenario))
    .sort((a, b) => String(b.data.timestamp || '')
      .localeCompare(String(a.data.timestamp || '')))
    .filter((r) => {
      const key = r.data.timestamp || r.file;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function failedCount(data) {
  return Number.isInteger(data?.summary?.failed) ? data.summary.failed : null;
}

function readMetric(data, kind) {
  if (kind === METRIC_FAILED) return failedCount(data);
  const items = data?.optimizationSummary?.totalPriorityItems;
  return Number.isInteger(items) ? items : failedCount(data);
}

export const scenarioHarnessProbe = {
  name: 'scenario-harness',
  measure(args) {
    const dir = args.reportDir || DEFAULT_REPORT_DIR;
    const scenario = args.scenario;
    const consecutive = Number(args.consecutive) || DEFAULT_CONSECUTIVE;
    const metricKind = args.metric === METRIC_FAILED ?
      METRIC_FAILED : METRIC_PRIORITY;
    const runs = listRuns(dir, scenario);
    if (runs.length === 0) {
      return {metric: null, done: false, evidence: null};
    }
    const latest = runs[0];
    const recent = runs.slice(0, consecutive);
    const done = recent.length >= consecutive &&
      recent.every((r) => scenarioPassed(r.data, scenario));
    return {
      metric: readMetric(latest.data, metricKind),
      done,
      evidence: latest.file,
      detail: {
        runs: runs.length,
        verdict: scenarioEntry(latest.data, scenario)?.current?.verdict || null,
      },
    };
  },
};
