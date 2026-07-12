#!/usr/bin/env node

import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {runTestFileSync} from './run-test-files.js';
import {
  buildHistoricalArtifactCensus,
  canonicalHistoricalCensusBytes,
  validateHistoricalArtifactCensus,
} from './solve/historical-artifact-census.js';

const DEFAULT_SCENARIO = 'solver-historical-artifact-census';
const SCENARIO = process.argv[2] || DEFAULT_SCENARIO;
const REPORT_DIR = 'test-output/reports';
const GUARD_TEST = 'test/solve/historical-artifact-census.test.js';
const CENSUS_PATH =
  'solve/changes/solver-historical-artifact-census/census.json';
const WATCHED_ROOTS = Object.freeze([
  'solve/changes',
  'solve/log',
  'solve/report',
  'solve/artifacts',
]);
const TEST_TIMEOUT_MS = 300000;
const HASH_ALGORITHM = 'sha256';
const VERDICT_PASS = 'PASS';
const VERDICT_FAIL = 'FAIL';
const NUL_SEPARATOR = '\0';
const HASH_ENCODING = 'hex';
const REPORT_FIDELITY = 'deterministic-guard';
const TEXT_ENCODING = 'utf8';
const PROBLEM_CENSUS_MISSING = 'census-artifact-missing';
const PROBLEM_CENSUS_STALE = 'census-artifact-stale';
const PROBLEM_HISTORICAL_WRITE = 'historical-root-write';

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(file));
    else if (entry.isFile()) files.push(file);
  }
  return files.sort();
}

function historicalRootDigest() {
  const digest = createHash(HASH_ALGORITHM);
  for (const root of WATCHED_ROOTS) {
    for (const file of walk(root)) {
      digest.update(file);
      digest.update(NUL_SEPARATOR);
      digest.update(fs.readFileSync(file));
      digest.update(NUL_SEPARATOR);
    }
  }
  return digest.digest(HASH_ENCODING);
}

function buildReport(timestamp, census, guard, problems) {
  const total = 3;
  const passedChecks = (guard.ok ? 1 : 0) +
    (problems.length === 0 ? 1 : 0) +
    (problems.includes(PROBLEM_HISTORICAL_WRITE) ? 0 : 1);
  const failed = total - passedChecks;
  const passed = failed === 0;
  return {
    timestamp,
    scenario: SCENARIO,
    producer: SCENARIO,
    fidelity: REPORT_FIDELITY,
    summary: {total, passed: passedChecks, failed},
    optimizationSummary: {totalPriorityItems: failed},
    standardSummary: {
      scenarios: [{
        scenario: SCENARIO,
        passed,
        current: {passed, verdict: passed ? VERDICT_PASS : VERDICT_FAIL},
        detail: {
          problems,
          guardTest: {
            file: GUARD_TEST,
            passed: guard.ok,
            assertions: guard.assertions,
          },
          censusSummary: census?.summary || null,
          censusSha256: census?.censusSha256 || null,
          snapshot: census?.snapshot || null,
        },
      }],
    },
  };
}

const before = historicalRootDigest();
const guard = runTestFileSync(GUARD_TEST, {
  print: false,
  timeoutMs: TEST_TIMEOUT_MS,
});
const problems = [];
let census = null;
if (!fs.existsSync(CENSUS_PATH)) {
  problems.push(PROBLEM_CENSUS_MISSING);
} else {
  try {
    census = JSON.parse(fs.readFileSync(CENSUS_PATH, TEXT_ENCODING));
    problems.push(...validateHistoricalArtifactCensus(census));
    const rebuilt = buildHistoricalArtifactCensus(process.cwd(), {
      commit: census.snapshot.commit,
    });
    if (!canonicalHistoricalCensusBytes(census)
      .equals(canonicalHistoricalCensusBytes(rebuilt))) {
      problems.push(PROBLEM_CENSUS_STALE);
    }
  } catch (error) {
    problems.push(`census-build:${error.message}`);
  }
}
if (historicalRootDigest() !== before) problems.push(PROBLEM_HISTORICAL_WRITE);
const timestamp = new Date().toISOString();
const report = buildReport(timestamp, census, guard, problems);
fs.mkdirSync(REPORT_DIR, {recursive: true});
const stamp = timestamp.replace(/[:.]/gu, '-');
const reportPath = path.join(REPORT_DIR, `${SCENARIO}-${stamp}.report.json`);
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(
  `${SCENARIO}: ${report.summary.failed === 0 ? VERDICT_PASS : VERDICT_FAIL} — ` +
  `${census?.summary?.trackedFiles || 0} tracked files, ` +
  `${census?.summary?.a2bBatches || 0} A2b batches, ` +
  `${census?.summary?.a3bProjectionSchemas || 0} A3b schemas\n` +
  `report: ${reportPath}\n`,
);
process.exitCode = report.summary.failed === 0 ? 0 : 1;
