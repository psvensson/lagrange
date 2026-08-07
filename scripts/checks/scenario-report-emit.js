// Shared scenario-harness report tail (developer-velocity epic): the report
// shape the scenario-harness probe reads, plus the check/assert helpers the
// velocity scenario runners share. Extracted to satisfy the one-way
// duplication ratchet; each runner supplies its own constants and checks.

import fs from 'node:fs';
import path from 'node:path';

import {
  OUTCOME_FAIL,
  OUTCOME_PASS,
  TAP_NOT_OK,
  TAP_OK,
  VERDICT_FAIL,
  VERDICT_PASS,
  VERDICT_REASON_ALL_PASS,
  VERDICT_REASON_CHECK_FAILED,
} from './impact-proof-cone-constants.js';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const stringReplace = Function.call.bind(String.prototype.replace);

const REPORT_TIMESTAMP_PATTERN = /[:.]/g;
const REPORT_TIMESTAMP_REPLACEMENT = '-';

export function scenarioCheck(label, fn) {
  try {
    const detail = fn();
    return {label, passed: true, detail};
  } catch (error) {
    return {label, passed: false, detail: error.message};
  }
}

export function scenarioAssert(condition, message) {
  if (!condition) throw new Error(message);
}

export function emitScenarioReport(root, reportDirName, scenario, checks, extraDetail = {}) {
  const failed = arrayFilter(checks, (entry) => !entry.passed).length;
  const passed = failed === 0;
  const report = {
    timestamp: new Date().toISOString(),
    scenario,
    summary: {total: checks.length, passed: checks.length - failed, failed},
    optimizationSummary: {totalPriorityItems: failed},
    standardSummary: {
      scenarios: [{
        scenario,
        passed,
        current: {
          passed,
          verdict: passed ? VERDICT_PASS : VERDICT_FAIL,
          verdictReason: passed ? VERDICT_REASON_ALL_PASS : VERDICT_REASON_CHECK_FAILED,
        },
        detail: {checks, ...extraDetail},
      }],
    },
  };
  const reportDir = path.join(root, reportDirName);
  fs.mkdirSync(reportDir, {recursive: true});
  const reportPath = path.join(
    reportDir,
    `${scenario}-${stringReplace(report.timestamp, REPORT_TIMESTAMP_PATTERN, REPORT_TIMESTAMP_REPLACEMENT)}.report.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`${passed ? OUTCOME_PASS : OUTCOME_FAIL} ${scenario}: ` +
    `${checks.length - failed}/${checks.length} checks`);
  for (const entry of checks) {
    console.log(`  ${entry.passed ? TAP_OK : TAP_NOT_OK} ${entry.label} - ${entry.detail}`);
  }
  console.log(`report: ${path.relative(root, reportPath)}`);
  process.exitCode = passed ? 0 : 1;
  return {passed, reportPath};
}
