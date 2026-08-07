#!/usr/bin/env node
// Scenario runner for the test-primary-classification-manifest Quest (V2a).
// Proves the sealed result: one manifest assigns every *.test.js exactly one
// primary class, and the census / duplicate / unknown-class attacks fail
// closed. Emits the scenario-harness report shape the Quest probe reads.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  DEVELOPER_SMOKE_MANIFEST_PATH,
  INTEGRATION_DIRECTORY_PREFIX,
  PRIMARY_CLASS_INTEGRATION,
  PRIMARY_CLASS_MANIFEST_PATH,
  PRIMARY_CLASS_SCENARIO,
  PRIMARY_CLASS_UNIT,
  REPORTS_DIRECTORY,
  SMOKE_FOCUSED_COMMAND_ID,
  VERDICT_FAIL,
  VERDICT_PASS,
  VERDICT_REASON_ALL_PASS,
  VERDICT_REASON_CHECK_FAILED,
} from './checks/test-primary-classification-constants.js';
import {
  buildManifest,
  collectTestFiles,
  loadManifest,
  verifyManifest,
} from './checks/test-primary-classification.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportDir = path.join(root, REPORTS_DIRECTORY);

const LABEL_MANIFEST_MATCHES_CENSUS = 'manifest-matches-census';
const LABEL_UNCLASSIFIED_FAILS = 'unclassified-test-fails-closed';
const LABEL_MISSING_FILE_FAILS = 'missing-file-fails-closed';
const LABEL_UNKNOWN_CLASS_FAILS = 'unknown-class-fails-closed';
const LABEL_RULE_DRIFT_FAILS = 'rule-drift-fails-closed';
const LABEL_SMOKE_NOT_PRIMARY = 'smoke-not-a-primary-class';
const LABEL_NEW_FILE_DERIVES = 'new-file-derives-class';
const ATTACK_UNCLASSIFIED = 'unclassified';
const ATTACK_MISSING_FILE = 'missing-file';
const ATTACK_UNKNOWN_CLASS = 'unknown-class';
const ATTACK_RULE_DRIFT = 'rule-drift';
const DIGEST_PROBLEM_PREFIX = 'digest mismatch';
const GHOST_TEST_PATH = 'test/ghost-does-not-exist.test.js';
const TMP_PREFIX = 'primary-class-';
const TMP_UNIT_TEST = 'test/unit-probe/new-thing.test.js';
const TMP_INTEGRATION_TEST = 'test/integration/new-thing.integration.test.js';
const TMP_UNIT_DIR = 'test/unit-probe';
const EXPECTED_TMP_CENSUS_SIZE = 2;
const UNKNOWN_CLASS_FORGE = 'smoke';
const UTF8_ENCODING = 'utf8';
const PROBLEM_JOIN_SEPARATOR = '; ';
const ERR_SMOKE_COMMAND_MISSING = 'developer-smoke manifest lacks its focused-contracts command';
const ERR_UNIT_DERIVATION = 'unit derivation failed';
const ERR_INTEGRATION_DERIVATION = 'integration derivation failed';
const ERR_CENSUS_WALK = 'census walk failed';
const DETAIL_TMP_CLASSIFIED = 'temporary census classified by rules alone';
const OUTCOME_PASS = 'PASS';
const OUTCOME_FAIL = 'FAIL';
const TAP_OK = 'ok';
const TAP_NOT_OK = 'not ok';
const REPORT_TIMESTAMP_PATTERN = /[:.]/g;
const REPORT_TIMESTAMP_REPLACEMENT = '-';

function check(label, fn) {
  try {
    const detail = fn();
    return {label, passed: true, detail};
  } catch (error) {
    return {label, passed: false, detail: error.message};
  }
}

function nonDigestProblems(problems) {
  return problems.filter((problem) => !problem.startsWith(DIGEST_PROBLEM_PREFIX));
}

function expectFailure(thunk, kind) {
  const result = nonDigestProblems(thunk());
  if (result.length === 0) {
    throw new Error(`${kind} attack was not detected`);
  }
  return `${kind} rejected (${result.length} problem(s))`;
}

function firstSortedClassPath(manifest) {
  return Object.keys(manifest.classes).sort()[0];
}

const checks = [];

// 1. Committed manifest is the exact live census.
checks.push(check(LABEL_MANIFEST_MATCHES_CENSUS, () => {
  const loaded = loadManifest(root);
  if (!loaded.ok) throw new Error(loaded.problems.join(PROBLEM_JOIN_SEPARATOR));
  const problems = verifyManifest(root, loaded.manifest);
  if (problems.length > 0) throw new Error(problems.join(PROBLEM_JOIN_SEPARATOR));
  return `${loaded.manifest.censusSize} tests classified ` +
    `(${JSON.stringify(loaded.manifest.counts)})`;
}));

// 2. Missing-entry attack: dropping one test from the manifest is detected.
checks.push(check(LABEL_UNCLASSIFIED_FAILS, () => expectFailure(() => {
  const manifest = buildManifest(root);
  delete manifest.classes[firstSortedClassPath(manifest)];
  return verifyManifest(root, manifest);
}, ATTACK_UNCLASSIFIED)));

// 3. Missing-file attack: assigning a nonexistent test is detected.
checks.push(check(LABEL_MISSING_FILE_FAILS, () => expectFailure(() => {
  const manifest = buildManifest(root);
  manifest.classes[GHOST_TEST_PATH] = PRIMARY_CLASS_UNIT;
  return verifyManifest(root, manifest);
}, ATTACK_MISSING_FILE)));

// 4. Unknown-class attack: "smoke" is not a primary class.
checks.push(check(LABEL_UNKNOWN_CLASS_FAILS, () => expectFailure(() => {
  const manifest = buildManifest(root);
  manifest.classes[firstSortedClassPath(manifest)] = UNKNOWN_CLASS_FORGE;
  return verifyManifest(root, manifest);
}, ATTACK_UNKNOWN_CLASS)));

// 5. Hand-edit (rule drift) attack: reclassifying one file against the rules
//    is detected.
checks.push(check(LABEL_RULE_DRIFT_FAILS, () => expectFailure(() => {
  const manifest = buildManifest(root);
  const victim = Object.keys(manifest.classes)
    .find((testPath) => manifest.classes[testPath] === PRIMARY_CLASS_UNIT);
  manifest.classes[victim] = PRIMARY_CLASS_INTEGRATION;
  return verifyManifest(root, manifest);
}, ATTACK_RULE_DRIFT)));

// 6. Smoke stays an overlapping acceptance-manifest view: every smoke-focused
//    test is census-classified under a real primary class.
checks.push(check(LABEL_SMOKE_NOT_PRIMARY, () => {
  const manifest = buildManifest(root);
  const smokeManifest = JSON.parse(fs.readFileSync(
    path.join(root, DEVELOPER_SMOKE_MANIFEST_PATH), UTF8_ENCODING));
  const smokeCommand = smokeManifest.commands
    .find((command) => command.id === SMOKE_FOCUSED_COMMAND_ID);
  if (!smokeCommand) {
    throw new Error(ERR_SMOKE_COMMAND_MISSING);
  }
  const smokeTests = smokeCommand.argv.filter((arg) => arg.endsWith('.test.js'));
  for (const testPath of smokeTests) {
    if (!manifest.classes[testPath]) {
      throw new Error(`smoke test ${testPath} is not census-classified`);
    }
  }
  return `smoke view overlaps ${smokeTests.length} classified tests without a smoke class`;
}));

// 7. New-file simulation: a census with extra temp test files is classified
//    by the rules (proves classification is derived, never hand-maintained).
checks.push(check(LABEL_NEW_FILE_DERIVES, () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), TMP_PREFIX));
  try {
    fs.mkdirSync(path.join(tempDir, TMP_UNIT_DIR), {recursive: true});
    fs.mkdirSync(path.join(tempDir, INTEGRATION_DIRECTORY_PREFIX), {recursive: true});
    fs.writeFileSync(path.join(tempDir, TMP_UNIT_TEST), '');
    fs.writeFileSync(path.join(tempDir, TMP_INTEGRATION_TEST), '');
    const derived = buildManifest(tempDir);
    if (derived.classes[TMP_UNIT_TEST] !== PRIMARY_CLASS_UNIT) {
      throw new Error(ERR_UNIT_DERIVATION);
    }
    if (derived.classes[TMP_INTEGRATION_TEST] !== PRIMARY_CLASS_INTEGRATION) {
      throw new Error(ERR_INTEGRATION_DERIVATION);
    }
    if (collectTestFiles(tempDir).length !== EXPECTED_TMP_CENSUS_SIZE) {
      throw new Error(ERR_CENSUS_WALK);
    }
    return DETAIL_TMP_CLASSIFIED;
  } finally {
    fs.rmSync(tempDir, {recursive: true, force: true});
  }
}));

const failed = checks.filter((entry) => !entry.passed).length;
const passed = failed === 0;
const report = {
  timestamp: new Date().toISOString(),
  scenario: PRIMARY_CLASS_SCENARIO,
  summary: {total: checks.length, passed: checks.length - failed, failed},
  optimizationSummary: {totalPriorityItems: failed},
  standardSummary: {
    scenarios: [{
      scenario: PRIMARY_CLASS_SCENARIO,
      passed,
      current: {
        passed,
        verdict: passed ? VERDICT_PASS : VERDICT_FAIL,
        verdictReason: passed ? VERDICT_REASON_ALL_PASS : VERDICT_REASON_CHECK_FAILED,
      },
      detail: {checks, manifest: PRIMARY_CLASS_MANIFEST_PATH},
    }],
  },
};

fs.mkdirSync(reportDir, {recursive: true});
const reportPath = path.join(
  reportDir,
  `${PRIMARY_CLASS_SCENARIO}-${report.timestamp.replace(REPORT_TIMESTAMP_PATTERN, REPORT_TIMESTAMP_REPLACEMENT)}.report.json`);
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`${passed ? OUTCOME_PASS : OUTCOME_FAIL} ${PRIMARY_CLASS_SCENARIO}: ` +
  `${checks.length - failed}/${checks.length} checks`);
for (const entry of checks) {
  console.log(`  ${entry.passed ? TAP_OK : TAP_NOT_OK} ${entry.label} - ${entry.detail}`);
}
console.log(`report: ${path.relative(root, reportPath)}`);
process.exitCode = passed ? 0 : 1;
