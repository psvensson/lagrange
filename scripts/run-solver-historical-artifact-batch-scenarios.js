#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import {runTestFileSync} from './run-test-files.js';
import {
  inspectHistoricalArtifactBatchScope,
  validateHistoricalArtifactBatchReceipt,
  validateHistoricalArtifactBatchTooling,
} from './solve/historical-artifact-batch-v2.js';
import {historicalArtifactRootDigest} from
  './solve/historical-artifact-root-digest.js';

const TOOLING_SCENARIO = 'solver-historical-artifact-batch-tooling';
const BATCH_PREFIX = 'solver-historical-artifact-batch-';
const GUARD_TEST = 'test/solve/historical-artifact-batch-v2.test.js';
const REPORT_DIR = 'test-output/reports';
const TEST_TIMEOUT_MS = 300000;
const VERDICT_PASS = 'PASS';
const VERDICT_FAIL = 'FAIL';
const REPORT_FIDELITY = 'deterministic-guard';
const HISTORICAL_WRITE_PROBLEM = 'historical-root-write';
const TOOLING_ARGUMENT = '--tooling';
const BATCH_ARGUMENT = '--batch';
const MODE_TOOLING = 'tooling';
const MODE_BATCH = 'batch';
const HISTORICAL_PRESERVATION = 'executor-snapshot-and-runner-no-write';
const USAGE = 'usage: run-solver-historical-artifact-batch-scenarios.js ' +
  '--tooling | --batch <NNN>';

function parseMode(argv) {
  if (argv.includes(TOOLING_ARGUMENT)) {
    return {kind: MODE_TOOLING, scenario: TOOLING_SCENARIO};
  }
  const index = argv.indexOf(BATCH_ARGUMENT);
  const ordinal = index >= 0 ? argv[index + 1] : '';
  if (!/^\d{3}$/u.test(ordinal || '')) throw new Error(USAGE);
  const questId = `${BATCH_PREFIX}${ordinal}`;
  return {kind: MODE_BATCH, scenario: questId, questId};
}

function validationFor(mode) {
  if (mode.kind === MODE_TOOLING) {
    const tooling = validateHistoricalArtifactBatchTooling(process.cwd());
    return {kind: MODE_TOOLING, tooling, problems: [...tooling.problems]};
  }
  const receipt = validateHistoricalArtifactBatchReceipt(
    process.cwd(),
    mode.questId,
  );
  const scope = inspectHistoricalArtifactBatchScope(process.cwd(), mode.questId);
  return {
    kind: MODE_BATCH,
    receipt,
    scope,
    problems: [...receipt.problems, ...scope.problems],
  };
}

function validationDetail(validation) {
  if (validation.kind === MODE_TOOLING) return {tooling: validation.tooling};
  return {receiptValidation: validation.receipt, scope: validation.scope};
}

const mode = parseMode(process.argv.slice(2));
const before = historicalArtifactRootDigest();
const guard = runTestFileSync(GUARD_TEST, {
  print: false,
  timeoutMs: TEST_TIMEOUT_MS,
});
const validation = validationFor(mode);
if (historicalArtifactRootDigest() !== before) {
  validation.problems.push(HISTORICAL_WRITE_PROBLEM);
}
const checks = [
  guard.ok,
  validation.problems.length === 0,
  !validation.problems.includes(HISTORICAL_WRITE_PROBLEM),
];
const passedChecks = checks.filter(Boolean).length;
const failed = checks.length - passedChecks;
const passed = failed === 0;
const timestamp = new Date().toISOString();
const report = {
  timestamp,
  scenario: mode.scenario,
  producer: mode.scenario,
  fidelity: REPORT_FIDELITY,
  summary: {total: checks.length, passed: passedChecks, failed},
  optimizationSummary: {totalPriorityItems: failed},
  standardSummary: {
    scenarios: [{
      scenario: mode.scenario,
      passed,
      current: {passed, verdict: passed ? VERDICT_PASS : VERDICT_FAIL},
      detail: {
        problems: validation.problems,
        guardTest: {
          file: GUARD_TEST,
          passed: guard.ok,
          assertions: guard.assertions,
        },
        historicalPreservation: HISTORICAL_PRESERVATION,
        ...validationDetail(validation),
      },
    }],
  },
};
fs.mkdirSync(REPORT_DIR, {recursive: true});
const stamp = timestamp.replace(/[:.]/gu, '-');
const reportPath = path.join(REPORT_DIR,
  `${mode.scenario}-${stamp}.report.json`);
fs.writeFileSync(reportPath, `${JSON.stringify(report, undefined, 2)}\n`);
process.stdout.write(
  `${mode.scenario}: ${passed ? VERDICT_PASS : VERDICT_FAIL} — ` +
  `${guard.assertions} guard assertions\nreport: ${reportPath}\n`,
);
process.exitCode = passed ? 0 : 1;
