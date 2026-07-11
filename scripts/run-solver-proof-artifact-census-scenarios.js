#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import {runTestFileSync} from './run-test-files.js';
import {buildProofArtifactCensus} from './solve/proof-artifact-census.js';

const SCENARIO = 'solver-proof-artifact-census';
const REPORT_DIR = 'test-output/reports';
const GUARD_TEST = 'test/solve/proof-artifact-census.test.js';
const TEST_TIMEOUT_MS = 300000;
const REPORT_PRODUCER = 'solver-proof-artifact-census';
const REPORT_FIDELITY = 'deterministic-guard';
const VERDICT_PASS = 'PASS';
const VERDICT_FAIL = 'FAIL';
const PROBLEM = Object.freeze({
  UNRESOLVED: 'unresolved-change-refs',
  UNREADABLE: 'unreadable-artifacts',
  LOG_PARSE: 'log-parse-errors',
  FILESYSTEM_BYTES: 'filesystem-byte-mismatch',
  UNCLASSIFIED: 'unclassified-artifacts',
  THRESHOLD_MISSING: 'migration-threshold-not-selected',
  THRESHOLD_NO_DUPLICATE: 'migration-threshold-has-no-duplicate-group',
});

function censusProblems(census) {
  const problems = [];
  if (census.summary.unresolvedReferenceOccurrences !== 0) {
    problems.push(PROBLEM.UNRESOLVED);
  }
  if (census.summary.readableArtifactCount !== census.summary.artifactCount) {
    problems.push(PROBLEM.UNREADABLE);
  }
  if (census.summary.logParseErrors !== 0) problems.push(PROBLEM.LOG_PARSE);
  if (!census.summary.bytesReconciled) problems.push(PROBLEM.FILESYSTEM_BYTES);
  if (census.artifacts.some((artifact) => !artifact.encoding)) {
    problems.push(PROBLEM.UNCLASSIFIED);
  }
  if (!Number.isInteger(census.migrationPolicy.inlineThresholdBytes)) {
    problems.push(PROBLEM.THRESHOLD_MISSING);
  }
  if (census.migrationPolicy.eligibleDuplicateGroups === 0) {
    problems.push(PROBLEM.THRESHOLD_NO_DUPLICATE);
  }
  return problems;
}

function buildReport(timestamp, census, guard, problems) {
  const total = 2;
  const passedChecks = (guard.ok ? 1 : 0) + (problems.length === 0 ? 1 : 0);
  const failed = total - passedChecks;
  const passed = failed === 0;
  return {
    timestamp,
    scenario: SCENARIO,
    producer: REPORT_PRODUCER,
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
          census,
        },
      }],
    },
  };
}

const root = process.cwd();
const guard = runTestFileSync(GUARD_TEST, {
  print: false,
  timeoutMs: TEST_TIMEOUT_MS,
});
const census = buildProofArtifactCensus(root);
const problems = censusProblems(census);
const timestamp = new Date().toISOString();
const report = buildReport(timestamp, census, guard, problems);
fs.mkdirSync(REPORT_DIR, {recursive: true});
const stamp = timestamp.replace(/[:.]/gu, '-');
const reportPath = path.join(REPORT_DIR, `${SCENARIO}-${stamp}.report.json`);
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(
  `${SCENARIO}: ${report.summary.failed === 0 ? VERDICT_PASS : VERDICT_FAIL} — ` +
  `${census.summary.artifactCount} artifacts, ` +
  `${census.summary.referenceOccurrences} references, ` +
  `${census.summary.storageBytes} bytes\nreport: ${reportPath}\n`,
);
process.exitCode = report.summary.failed === 0 ? 0 : 1;
