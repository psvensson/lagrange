#!/usr/bin/env node

// Soft-warning two-strikes analyzer (the machine check behind
// docs/steering/testing-guidelines/regression-policy.md "Two-Strikes
// Escalation Tripwires" #1).
//
// THE RULE: the SAME soft warning code appearing in the two most recent
// consecutive runs of the SAME scenario is no longer background noise — it
// must be treated as a failing assertion (open a finding; fix the cause,
// re-derive the threshold with evidence, or promote it to a hard failure).
// Strike identity is (warning CODE, scenario id) across consecutive runs,
// regardless of which session produced them.
//
// WHERE THE CODES LIVE (per scenario entry in a harness run report under
// test-output/reports/*.report.json):
//   - scenario.invariantBreaches.softBreaches[]  -> reasonCode || invariantId
//   - scenario.details.verification.softWarnings[] -> code
//     (the assertion-policy soft warnings, e.g. insufficient_evidence)
//
// Runs are grouped per scenario id and ordered by the report's own
// `timestamp` (file mtime as fallback); `-latest` convenience copies are
// deduplicated against their timestamped originals by (scenario, timestamp).
//
// Usage:
//   node scripts/analyze-soft-warning-strikes.js                  # whole corpus
//   node scripts/analyze-soft-warning-strikes.js --scenario <id>
//   node scripts/analyze-soft-warning-strikes.js --report-dir <dir> [--json]
//   node scripts/analyze-soft-warning-strikes.js <run.report.json...>
//
// Exit code: 1 when any two-strikes violation is found (or on read errors),
// 0 otherwise.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const REPORT_SUFFIX = '.report.json';
const MODEL_REPORT_SUFFIX = '.model.report.json';
const DEFAULT_REPORT_DIR = 'test-output/reports';
const FLAG_JSON = '--json';
const FLAG_SCENARIO = '--scenario';
const FLAG_REPORT_DIR = '--report-dir';
const MINIMUM_RUNS_FOR_STRIKE = 2;

function softWarningCodesForScenarioEntry(entry) {
  const codes = new Set();
  for (const breach of entry?.invariantBreaches?.softBreaches || []) {
    const code = breach?.reasonCode || breach?.invariantId;
    if (code) codes.add(String(code));
  }
  for (const warning of entry?.details?.verification?.softWarnings || []) {
    if (warning?.code) codes.add(String(warning.code));
  }
  return codes;
}

// One run record per scenario entry in the report:
// {scenario, timestamp, codes:Set, file}.
export function extractScenarioRuns(report, {file = null, fallbackTimestamp = null} = {}) {
  const timestamp = typeof report?.timestamp === 'string' ?
    report.timestamp :
    fallbackTimestamp;
  const runs = [];
  for (const entry of Array.isArray(report?.scenarios) ? report.scenarios : []) {
    if (!entry || typeof entry.scenario !== 'string') continue;
    runs.push({
      scenario: entry.scenario,
      timestamp,
      codes: softWarningCodesForScenarioEntry(entry),
      file,
    });
  }
  return runs;
}

// Group run records per scenario, dedupe identical (scenario, timestamp)
// pairs (a `-latest` copy of a timestamped report), and order by timestamp.
export function groupRunsByScenario(runs) {
  const byScenario = new Map();
  for (const run of runs) {
    if (!byScenario.has(run.scenario)) byScenario.set(run.scenario, new Map());
    const byTimestamp = byScenario.get(run.scenario);
    const existing = byTimestamp.get(run.timestamp);
    if (existing) {
      for (const code of run.codes) existing.codes.add(code);
    } else {
      byTimestamp.set(run.timestamp, {...run, codes: new Set(run.codes)});
    }
  }
  const ordered = new Map();
  for (const [scenario, byTimestamp] of byScenario) {
    ordered.set(scenario, [...byTimestamp.values()].sort((a, b) =>
      String(a.timestamp).localeCompare(String(b.timestamp))));
  }
  return ordered;
}

// A strike = a warning code present in BOTH of the two most recent runs of a
// scenario. Fewer than two runs can never strike.
export function detectStrikes(runsByScenario) {
  const strikes = [];
  for (const [scenario, runs] of runsByScenario) {
    if (runs.length < MINIMUM_RUNS_FOR_STRIKE) continue;
    const [previous, latest] = runs.slice(-MINIMUM_RUNS_FOR_STRIKE);
    for (const code of latest.codes) {
      if (previous.codes.has(code)) {
        strikes.push({
          scenario,
          code,
          runs: [
            {timestamp: previous.timestamp, file: previous.file},
            {timestamp: latest.timestamp, file: latest.file},
          ],
        });
      }
    }
  }
  return strikes.sort((a, b) =>
    a.scenario.localeCompare(b.scenario) || a.code.localeCompare(b.code));
}

function isRunReportFile(name) {
  return name.endsWith(REPORT_SUFFIX) && !name.endsWith(MODEL_REPORT_SUFFIX);
}

// Recursive: per-run report subdirectories (e.g.
// test-output/reports/<run-id>/<scenario>.report.json) are part of the run
// history. Dot-directories (.playback full-log bundles) are skipped.
export function discoverReportFiles(reportDir) {
  if (!fs.existsSync(reportDir)) return [];
  const files = [];
  for (const entry of fs.readdirSync(reportDir, {withFileTypes: true})) {
    if (entry.name.startsWith('.')) continue;
    const entryPath = path.join(reportDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...discoverReportFiles(entryPath));
    } else if (isRunReportFile(entry.name)) {
      files.push(entryPath);
    }
  }
  return files.sort();
}

function parseArgs(argv) {
  const options = {
    files: [],
    reportDir: DEFAULT_REPORT_DIR,
    scenario: null,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === FLAG_JSON) {
      options.json = true;
    } else if (argument === FLAG_SCENARIO) {
      options.scenario = argv[++index] || null;
    } else if (argument === FLAG_REPORT_DIR) {
      options.reportDir = argv[++index] || DEFAULT_REPORT_DIR;
    } else if (argument.startsWith('-')) {
      throw new Error(`unknown option: ${argument}`);
    } else {
      options.files.push(argument);
    }
  }
  return options;
}

export function analyzeSoftWarningStrikes(files, {scenario = null} = {}) {
  const runs = [];
  const errors = [];
  for (const file of files) {
    let report;
    try {
      report = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
      errors.push(`unreadable report ${file}: ${error.message}`);
      continue;
    }
    const fallbackTimestamp = fs.statSync(file).mtime.toISOString();
    runs.push(...extractScenarioRuns(report, {file, fallbackTimestamp}));
  }
  const filtered = scenario ?
    runs.filter((run) => run.scenario === scenario) :
    runs;
  const runsByScenario = groupRunsByScenario(filtered);
  return {
    scenariosSeen: runsByScenario.size,
    runsSeen: filtered.length,
    strikes: detectStrikes(runsByScenario),
    errors,
  };
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return EXIT_FAILURE;
  }
  const files = options.files.length > 0 ?
    options.files :
    discoverReportFiles(options.reportDir);
  const result = analyzeSoftWarningStrikes(files, {scenario: options.scenario});
  if (options.json) {
    process.stdout.write(`${JSON.stringify({
      ...result,
      strikes: result.strikes,
    }, null, 2)}\n`);
    return result.strikes.length > 0 || result.errors.length > 0 ?
      EXIT_FAILURE : EXIT_SUCCESS;
  }
  for (const error of result.errors) process.stderr.write(`WARN ${error}\n`);
  for (const strike of result.strikes) {
    process.stdout.write(
      'two-strikes: treat as failing assertion — soft warning ' +
      `"${strike.code}" appeared in the two most recent consecutive runs ` +
      `of scenario "${strike.scenario}" ` +
      `(${strike.runs.map((run) => run.timestamp).join(', ')}); open a ` +
      'finding and fix the cause, re-derive the threshold with evidence, ' +
      'or promote it to a hard failure before the next run\n');
  }
  process.stdout.write(
    `# soft-warning-strikes scenarios=${result.scenariosSeen} ` +
    `runs=${result.runsSeen} strikes=${result.strikes.length}\n`);
  return result.strikes.length > 0 || result.errors.length > 0 ?
    EXIT_FAILURE : EXIT_SUCCESS;
}

const IS_MAIN = process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) process.exitCode = main();
