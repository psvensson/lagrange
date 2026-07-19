/**
 * Runs eslint with the complexity rule and reports only complexity
 * violations, ignoring other lint errors.
 *
 * Default mode: fails if violations exceed the current baseline count.
 * --strict mode: fails if any function exceeds the target threshold (12).
 *
 * The baseline count should be ratcheted down as complex functions
 * are refactored. Update BASELINE_COUNT when violations are fixed.
 */

import {LegacyESLint} from 'eslint/use-at-your-own-risk';

import {
  writeJsonReport,
} from './metric-check-helpers.js';


const TARGET_THRESHOLD = 12;
// Measured after the proof-integrity cutover. Ratchet DOWN only from here.
// 2026-07-19: tightened 1855 -> 1847 (measured; taking the ratchet down per
// the release-gate one-way-baseline rule).
const BASELINE_COUNT = 1847;
const STRICT_FLAG = '--strict';
const SCOPED_FLAG = '--scoped';
const ARG_SEPARATOR = '--';
const LOCAL_STR_TEST_GITKEEP = 'test/.gitkeep';
const LOCAL_STR_COMPLEXITY = 'complexity';
const LOCAL_STR_ERROR = 'error';
const DEFAULT_LINT_TARGETS = ['src/', 'test/'];
const REPORT_RELATIVE_PATH = 'test-output/analysis/complexity-src-test.json';
const SCOPED_REPORT_RELATIVE_PATH =
  'test-output/analysis/complexity-scoped.json';
const PRINT_LIMIT = 40;
const FILTERED_FLAGS = new Set([
  STRICT_FLAG,
  SCOPED_FLAG,
  ARG_SEPARATOR,
]);
const ESLINT_OVERRIDE_CONFIG = {
  ignorePatterns: [LOCAL_STR_TEST_GITKEEP],
  rules: {
    [LOCAL_STR_COMPLEXITY]: [LOCAL_STR_ERROR, TARGET_THRESHOLD],
  },
};
const args = process.argv.slice(2);
const strict = args.includes(STRICT_FLAG);
const scoped = args.includes(SCOPED_FLAG);
const scopedTargets = args.filter((arg) => !FILTERED_FLAGS.has(arg));

if (scoped && scopedTargets.length === 0) {
  console.error(
    'Usage: npm run test:complexity:scoped -- <file-or-directory> [...]',
  );
  process.exit(1);
}

const lintTargets = scoped ? scopedTargets : DEFAULT_LINT_TARGETS;
const reportRelativePath = scoped ?
  SCOPED_REPORT_RELATIVE_PATH :
  REPORT_RELATIVE_PATH;

const eslint = new LegacyESLint({
  cwd: process.cwd(),
  overrideConfig: ESLINT_OVERRIDE_CONFIG,
});
const results = await eslint.lintFiles(lintTargets);
const violations = results.flatMap((result) =>
  result.messages
    .filter((message) => message.ruleId === LOCAL_STR_COMPLEXITY)
    .map((message) => ({
      filePath: result.filePath,
      line: message.line,
      column: message.column,
      message: message.message,
    })),
);

const count = violations.length;

writeJsonReport(reportRelativePath, {
  targetThreshold: TARGET_THRESHOLD,
  baselineCount: BASELINE_COUNT,
  scoped,
  targets: lintTargets,
  count,
  violations,
});

function printViolations(entries) {
  for (const violation of entries.slice(0, PRINT_LIMIT)) {
    console.log(
      `${violation.filePath}:${violation.line}:${violation.column} ` +
      `${violation.message}`,
    );
  }
  if (entries.length > PRINT_LIMIT) {
    console.log(
      `... ${entries.length - PRINT_LIMIT} more violation(s). ` +
      `Full report: ${reportRelativePath}.`,
    );
  }
}

if (strict) {
  if (count > 0) {
    console.log(
      `Complexity violations (threshold: ${TARGET_THRESHOLD}):\n`,
    );
    printViolations(violations);
    console.log(`\n${count} violation(s) found.`);
    process.exit(1);
  }
  console.log(
    `No complexity violations (threshold: ${TARGET_THRESHOLD}).`,
  );
} else if (scoped) {
  console.log(
    `Scoped complexity ratchet: ${count} violation(s) in ` +
    `${lintTargets.length} target(s) (threshold: ${TARGET_THRESHOLD}).`,
  );
  if (count > 0) {
    printViolations(violations);
  }
  console.log(`Saved complexity report to ${reportRelativePath}.`);
} else {
  if (count > BASELINE_COUNT) {
    console.log(
      `Complexity ratchet FAILED: ${count} violations ` +
      `exceeds baseline of ${BASELINE_COUNT}.\n`,
    );
    printViolations(violations);
    process.exit(1);
  }
  console.log(
    `Complexity ratchet OK: ${count}/${BASELINE_COUNT} ` +
    `violations (threshold: ${TARGET_THRESHOLD}).`,
  );
  console.log(`Saved complexity report to ${reportRelativePath}.`);
  if (count < BASELINE_COUNT) {
    console.log(
      `Baseline can be tightened from ${BASELINE_COUNT} ` +
      `to ${count} in scripts/check-complexity.js.`,
    );
  }
}
