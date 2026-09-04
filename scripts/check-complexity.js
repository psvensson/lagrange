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
  collectRuleViolations,
  writeJsonReport,
} from './metric-check-helpers.js';


const TARGET_THRESHOLD = 12;
// Measured after the proof-integrity cutover. Ratchet DOWN only from here.
// 2026-07-19: tightened 1855 -> 1847 (measured; taking the ratchet down per
// the release-gate one-way-baseline rule).
// 2026-08-10: tightened 1842 -> 1841 (six new-debt functions refactored
// below the threshold; measured with the checker's tightening hint).
// 2026-08-10: tightened 1841 -> 1839 (checkRebalance tail scheduling and
// the topology-settling gate log-context extracted while landing
// user-table-leader-placement-spread; one-way-baseline rule).
// 2026-08-14: tightened 1839 -> 1838 after authoritative readiness-repair
// permission moved into its canonical reconciler owner.
// 2026-08-21: tightened 1838 -> 1831 after deleting the runtime compatibility
// reconciler, consolidating rebalancer entity/read-model ownership, and
// removing the duplicate heartbeat/reconcile ownership path.
// 2026-08-21: tightened 1831 -> 1826 after retiring the bootstrap formation
// placement/drain re-derivation and duplicate read-authority paths.
// 2026-08-29: tightened 1824 -> 1823 after the release-branch ratchet repair
// (active-gate evidence probes, formation-barrier snapshot projection,
// formation-release contract identity, coordinator move request decoration).
// 2026-09-04: tightened 1823 -> 1822 after liveness predicate extraction.
const BASELINE_COUNT = 1822;
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
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  env: {
    node: true,
    es2022: true,
  },
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

// Self-contained like check-cognitive-complexity.js: without this, the
// checker resolves a repo eslintrc that no longer exists and silently lints
// nothing, emptying the complexity report the owner-debt inventory pins.
const eslint = new LegacyESLint({
  cwd: process.cwd(),
  useEslintrc: false,
  overrideConfig: ESLINT_OVERRIDE_CONFIG,
});
const results = await eslint.lintFiles(lintTargets);
const violations = collectRuleViolations(results, LOCAL_STR_COMPLEXITY);

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
