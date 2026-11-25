/**
 * Runs eslint with the complexity rule and reports only complexity
 * violations, ignoring other lint errors.
 *
 * Default mode: fails if scan completeness fails, if any new violation
 * identity appears, if any existing violation's complexity severity worsens,
 * or if total violations exceed BASELINE_COUNT.
 * --strict mode: fails if any function exceeds the target threshold (12).
 * --write-baseline mode: writes the current identity->severity map to
 * scripts/baselines/complexity-ratchet-baseline.json.
 *
 * The baseline count and identity map should be ratcheted down as complex
 * functions are refactored.
 */

import fs from 'node:fs';
import path from 'node:path';

import {LegacyESLint} from 'eslint/use-at-your-own-risk';

import {
  assertScanCompleteness,
  collectRuleViolations,
  collectScanCompleteness,
  evaluateIdentitySeverityRatchet,
} from './metric-check-helpers.js';
import {METRIC_REPORTS} from './metric-report-constants.js';
import {
  beginMetricMeasurement,
  finishMetricMeasurement,
} from './metric-report-provenance.js';

const TARGET_THRESHOLD = 12;
// Measured after the proof-integrity cutover. Ratchet DOWN only from here.
// 2026-07-19: tightened 1855 -> 1847 (measured; taking the ratchet down per
// the release-gate one-way-baseline rule).
// 2026-11-19: tightened 1688 -> 1680 on the checker's hint after composing K2,
// WP-E, WP-V, Removal, Raft, and SeedCPU repairs.
// 2026-11-25: anchored identity+severity baseline map and tightened
// 1680 -> 1597 in scripts/baselines/complexity-ratchet-baseline.json after
// refactoring 165+ functions across test/distributed/ and src/, and promoted
// test:complexity to a blocking CI structural regression gate.
const BASELINE_COUNT = 1596;
const STRICT_FLAG = '--strict';
const SCOPED_FLAG = '--scoped';
const WRITE_BASELINE_FLAG = '--write-baseline';
const ARG_SEPARATOR = '--';
const LOCAL_STR_TEST_GITKEEP = 'test/.gitkeep';
const LOCAL_STR_COMPLEXITY = 'complexity';
const LOCAL_STR_ERROR = 'error';
const ANALYZER_ESLINT = 'eslint';
const UTF8_ENCODING = 'utf8';
const JSON_INDENT = 2;
const ZERO_COUNT = 0;
const EXIT_FAILURE = 1;
const BASELINE_RELATIVE_PATH =
  'scripts/baselines/complexity-ratchet-baseline.json';
const HEADER_NEW_COMPLEXITY = 'New complexity violations';
const HEADER_WORSENED_COMPLEXITY = 'Worsened complexity violations';
const HEADER_REMOVED_COMPLEXITY_FAILURE =
  'Removed complexity violations (cannot offset new/worsened violations)';
const HEADER_REMOVED_COMPLEXITY_BASELINE =
  'Removed complexity baseline identities';
const HEADER_IMPROVED_COMPLEXITY = 'Improved complexity violations';
const DEFAULT_LINT_TARGETS = METRIC_REPORTS.complexity.targets;
const REPORT_RELATIVE_PATH = METRIC_REPORTS.complexity.reportPath;
const SCOPED_REPORT_RELATIVE_PATH =
  'test-output/analysis/complexity-scoped.json';
const PRINT_LIMIT = 40;
const FILTERED_FLAGS = new Set([
  STRICT_FLAG,
  SCOPED_FLAG,
  WRITE_BASELINE_FLAG,
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
const writeBaseline = args.includes(WRITE_BASELINE_FLAG);
const scopedTargets = args.filter((arg) => !FILTERED_FLAGS.has(arg));

if (scoped && scopedTargets.length === ZERO_COUNT) {
  console.error(
    'Usage: npm run test:complexity:scoped -- <file-or-directory> [...]',
  );
  process.exit(EXIT_FAILURE);
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
const measurement = beginMetricMeasurement(LOCAL_STR_COMPLEXITY, {
  targets: lintTargets,
  reportPath: reportRelativePath,
});
const results = await eslint.lintFiles(lintTargets);
const scanCompleteness = collectScanCompleteness(results, {
  ruleId: LOCAL_STR_COMPLEXITY,
  targets: lintTargets,
  analyzer: ANALYZER_ESLINT,
});
assertScanCompleteness(scanCompleteness, LOCAL_STR_COMPLEXITY);

const violations = collectRuleViolations(results, LOCAL_STR_COMPLEXITY);
const count = violations.length;

finishMetricMeasurement(measurement, {
  targetThreshold: TARGET_THRESHOLD,
  baselineCount: BASELINE_COUNT,
  scoped,
  targets: lintTargets,
  count,
  scanCompleteness,
  violations,
});

function printViolations(entries) {
  for (const violation of entries.slice(ZERO_COUNT, PRINT_LIMIT)) {
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

function printIdentityViolations(header, entries, includeBaseline = false) {
  if (entries.length === ZERO_COUNT) {
    return;
  }
  console.log(`\n${header} (${entries.length}):`);
  for (const entry of entries.slice(ZERO_COUNT, PRINT_LIMIT)) {
    const severityNote = includeBaseline ?
      `complexity ${entry.baselineSeverity} -> ${entry.severity}` :
      `complexity ${entry.severity}`;
    console.log(
      `  ${entry.identity} (${entry.filePath}:${entry.line}:${entry.column}, ` +
      `${severityNote})`,
    );
  }
  if (entries.length > PRINT_LIMIT) {
    console.log(`  ... ${entries.length - PRINT_LIMIT} more.`);
  }
}

function printIdentityList(header, identities) {
  if (identities.length === ZERO_COUNT) {
    return;
  }
  console.log(`\n${header} (${identities.length}):`);
  for (const identity of identities.slice(ZERO_COUNT, PRINT_LIMIT)) {
    console.log(`  ${identity}`);
  }
  if (identities.length > PRINT_LIMIT) {
    console.log(`  ... ${identities.length - PRINT_LIMIT} more.`);
  }
}

function readBaselineEntries(baselineFilePath) {
  if (!fs.existsSync(baselineFilePath)) {
    console.error(
      `Complexity baseline file is missing: ${BASELINE_RELATIVE_PATH}.`,
    );
    process.exit(EXIT_FAILURE);
  }
  return JSON.parse(fs.readFileSync(baselineFilePath, UTF8_ENCODING));
}

function writeBaselineEntries(baselineFilePath, currentEntries) {
  fs.mkdirSync(path.dirname(baselineFilePath), {recursive: true});
  fs.writeFileSync(
    baselineFilePath,
    `${JSON.stringify(currentEntries, null, JSON_INDENT)}\n`,
    UTF8_ENCODING,
  );
  console.log(
    `Wrote ${Object.keys(currentEntries).length} complexity baseline ` +
    `entries to ${BASELINE_RELATIVE_PATH}.`,
  );
}

const baselineFilePath = path.resolve(process.cwd(), BASELINE_RELATIVE_PATH);

if (writeBaseline) {
  const ratchet = evaluateIdentitySeverityRatchet({
    violations,
    baselineEntries: {},
  });
  writeBaselineEntries(baselineFilePath, ratchet.currentEntries);
} else if (strict) {
  if (count > ZERO_COUNT) {
    console.log(
      `Complexity violations (threshold: ${TARGET_THRESHOLD}):\n`,
    );
    printViolations(violations);
    console.log(`\n${count} violation(s) found.`);
    process.exit(EXIT_FAILURE);
  }
  console.log(
    `No complexity violations (threshold: ${TARGET_THRESHOLD}).`,
  );
} else if (scoped) {
  console.log(
    `Scoped complexity ratchet: ${count} violation(s) in ` +
    `${lintTargets.length} target(s) (threshold: ${TARGET_THRESHOLD}).`,
  );
  if (count > ZERO_COUNT) {
    printViolations(violations);
  }
  console.log(`Saved complexity report to ${reportRelativePath}.`);
} else {
  const baselineEntries = readBaselineEntries(baselineFilePath);
  const ratchet = evaluateIdentitySeverityRatchet({
    violations,
    baselineEntries,
  });
  const hasNew = ratchet.newViolations.length > ZERO_COUNT;
  const hasWorsened = ratchet.worsenedViolations.length > ZERO_COUNT;
  const exceedsCount = count > BASELINE_COUNT;

  if (hasNew || hasWorsened || exceedsCount) {
    console.log(
      `Complexity ratchet FAILED: ${count}/${BASELINE_COUNT} violations ` +
      `(${ratchet.newViolations.length} new, ` +
      `${ratchet.worsenedViolations.length} worsened, ` +
      `${ratchet.removedIdentities.length} removed).`,
    );
    printIdentityViolations(HEADER_NEW_COMPLEXITY, ratchet.newViolations);
    printIdentityViolations(
      HEADER_WORSENED_COMPLEXITY,
      ratchet.worsenedViolations,
      true,
    );
    printIdentityList(
      HEADER_REMOVED_COMPLEXITY_FAILURE,
      ratchet.removedIdentities,
    );
    process.exit(EXIT_FAILURE);
  }

  console.log(
    `Complexity ratchet OK: ${count}/${BASELINE_COUNT} ` +
    `violations (threshold: ${TARGET_THRESHOLD}, ` +
    `analyzedFiles: ${scanCompleteness.analyzedFiles}).`,
  );
  console.log(`Saved complexity report to ${reportRelativePath}.`);
  if (ratchet.removedIdentities.length > ZERO_COUNT ||
      ratchet.improvedViolations.length > ZERO_COUNT) {
    printIdentityList(
      HEADER_REMOVED_COMPLEXITY_BASELINE,
      ratchet.removedIdentities,
    );
    printIdentityViolations(
      HEADER_IMPROVED_COMPLEXITY,
      ratchet.improvedViolations,
      true,
    );
    console.log(
      `Run \`node scripts/check-complexity.js ${WRITE_BASELINE_FLAG}\` ` +
      `to tighten ${BASELINE_RELATIVE_PATH}.`,
    );
  }
  if (count < BASELINE_COUNT) {
    console.log(
      `Baseline can be tightened from ${BASELINE_COUNT} ` +
      `to ${count} in scripts/check-complexity.js.`,
    );
  }
}
