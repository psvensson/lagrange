// Complexity admission — the attempt-time projection of the aggregate
// cyclomatic and cognitive complexity ratchets the publish gate enforces
// (scripts/check-complexity.js and scripts/check-cognitive-complexity.js,
// the single owners of thresholds and baselines).
//
// The ratchets count over-threshold functions across the whole tree and
// refuse a push when the count grows. Discovering that at publish is the
// most expensive possible moment: on 2026-09-05 a candidate reached its
// seventh verifier round because one split function had crossed the
// threshold, a fact no Solver stage before publish had reported. This module
// evaluates the same ratchet movement per touched file at attempt admission,
// where repair costs one edit instead of one review and one gate run.
//
// Ratchet-consistent semantics: a function that is over threshold NOW but was
// already over threshold at the attempt base stays tolerated (editing a
// legacy over-threshold function does not move the count). Only a function
// the attempt PUSHES over its threshold — newly written or grown across the
// line — is a violation, because landing it is what increments the count.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const SCOPED_FLAG = '--scoped';
const TEXT_ENCODING = 'utf8';
const SPAWN_MAX_BUFFER_BYTES = 16 * 1024 * 1024;
const GIT_BINARY = 'git';
const GIT_SHOW_MAX_BUFFER_BYTES = 32 * 1024 * 1024;
const BASE_TREE_PREFIX = 'solve-complexity-base-';
const PROBLEM_PREFIX = 'complexity admission: ';
const PROBLEM_ACTION =
  '; split or simplify before recording the attempt — the publish-gate ' +
  'complexity ratchet would refuse the push';
const NEW_VIOLATION_SUFFIX = ' (new over threshold; not over at the base)';
const CHECKER_UNAVAILABLE_SUFFIX =
  ' checker could not run or left no report; a checker that exists but ' +
  'cannot run blocks like a violation';
const FUNCTION_NAME_PATTERN = /'([^']+)'/u;
const DIGITS_PATTERN = /\d+/gu;
const DIGIT_PLACEHOLDER = '#';
const KEY_SEPARATOR = '|';
// Each checker admits only the trees its aggregate ratchet counts (the
// cyclomatic ratchet lints src/ and test/, the cognitive one src/ and
// scripts/); a function outside a ratchet's trees can never move that
// ratchet, so it is never a refusal here.
const SOURCE_TREE = 'src/';
const TEST_TREE = 'test/';
const SCRIPTS_TREE = 'scripts/';
const CHECKERS = Object.freeze([
  Object.freeze({
    label: 'cyclomatic complexity',
    scriptSegments: ['scripts', 'check-complexity.js'],
    reportSegments: ['test-output', 'analysis', 'complexity-scoped.json'],
    targetPrefixes: Object.freeze([SOURCE_TREE, TEST_TREE]),
  }),
  Object.freeze({
    label: 'cognitive complexity',
    scriptSegments: ['scripts', 'check-cognitive-complexity.js'],
    reportSegments:
      ['test-output', 'analysis', 'cognitive-complexity-scoped.json'],
    targetPrefixes: Object.freeze([SOURCE_TREE, SCRIPTS_TREE]),
  }),
]);

function checkerTargets(checker, jsPaths) {
  return jsPaths.filter((filePath) =>
    checker.targetPrefixes.some((prefix) => filePath.startsWith(prefix)));
}

// The function a violation names, independent of its measured value, so the
// same function reads as one key at the base and in the candidate.
function violationKey(violation) {
  const message = String(violation.message || '');
  const named = FUNCTION_NAME_PATTERN.exec(message);
  const identity = named ? named[1] :
    message.replace(DIGITS_PATTERN, DIGIT_PLACEHOLDER);
  return `${violation.filePath}${KEY_SEPARATOR}${identity}`;
}

// Runs one scoped checker over `jsPaths` with `cwd` and reads the report it
// writes (the checkers write repo-relative reports, so the report path is
// resolved against `reportRoot`, not `cwd`). `undefined` when the checker is
// absent (a fixture tree; never a refusal); `null` when it exists but could
// not run or left no readable report — that blocks like a violation, exactly
// as the other seal-gate checkers do.
function scopedViolations(checker, reportRoot, cwd, jsPaths) {
  const script = path.join(reportRoot, ...checker.scriptSegments);
  if (!fs.existsSync(script)) return undefined;
  const result = spawnSync(process.execPath, [script, SCOPED_FLAG, ...jsPaths],
    {cwd, encoding: TEXT_ENCODING, maxBuffer: SPAWN_MAX_BUFFER_BYTES});
  if (result.error) return null;
  const reportPath = path.join(reportRoot, ...checker.reportSegments);
  try {
    const report = JSON.parse(fs.readFileSync(reportPath, TEXT_ENCODING));
    return Array.isArray(report.violations) ? report.violations : null;
  } catch {
    return null;
  }
}

// Violations per key, as a multiset: the cognitive checker names no function
// in its message, so its keys collapse per file, and only a COUNT increase
// per key is a new violation.
function violationCounts(violations) {
  const counts = new Map();
  for (const violation of violations) {
    const key = violationKey(violation);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

export function newViolations(baseViolations, candidateViolations) {
  const baseCounts = violationCounts(baseViolations);
  const seen = new Map();
  const overflow = [];
  for (const violation of candidateViolations) {
    const key = violationKey(violation);
    const ordinal = (seen.get(key) || 0) + 1;
    seen.set(key, ordinal);
    if (ordinal > (baseCounts.get(key) || 0)) overflow.push(violation);
  }
  return overflow;
}

// The base versions of the changed files, materialized under a temporary
// tree at the same relative paths so the checker reports comparable keys.
// Files absent at the base (new files) are simply not materialized.
function materializeBaseTree(root, baseCommit, jsPaths) {
  const baseRoot = fs.mkdtempSync(path.join(os.tmpdir(), BASE_TREE_PREFIX));
  const present = [];
  for (const filePath of jsPaths) {
    const shown = spawnSync(GIT_BINARY, ['show', `${baseCommit}:${filePath}`],
      {cwd: root, encoding: TEXT_ENCODING, maxBuffer: GIT_SHOW_MAX_BUFFER_BYTES});
    if (shown.status !== 0 || typeof shown.stdout !== 'string') continue;
    const target = path.join(baseRoot, filePath);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.writeFileSync(target, shown.stdout);
    present.push(filePath);
  }
  return {baseRoot, present};
}

// Every touched JavaScript function the candidate pushes over a complexity
// threshold relative to `baseCommit`, per checker. `options.checkerRoot`
// names the tree holding the checker scripts (defaults to `root`; tests
// point it at the repository while the fixture root is the code under test).
export function touchedComplexityOverflow(root, baseCommit, jsPaths, options = {}) {
  const checkerRoot = options.checkerRoot || root;
  const targets = [...new Set(jsPaths || [])]
    .filter((filePath) => fs.existsSync(path.join(root, filePath)))
    .sort();
  if (targets.length === 0 || !baseCommit) return [];
  const overflow = [];
  let base = null;
  try {
    for (const checker of CHECKERS) {
      const checkerPaths = checkerTargets(checker, targets);
      if (checkerPaths.length === 0) continue;
      const candidate = scopedViolations(
        checker, checkerRoot, root, checkerPaths);
      if (candidate === undefined) continue;
      if (candidate === null) {
        overflow.push({checker: checker.label, unavailable: true});
        continue;
      }
      if (candidate.length === 0) continue;
      base = base || materializeBaseTree(root, baseCommit, targets);
      const basePaths = checkerTargets(checker, base.present);
      const baseViolations = basePaths.length === 0 ? [] :
        scopedViolations(checker, checkerRoot, base.baseRoot, basePaths);
      if (baseViolations === null || baseViolations === undefined) {
        overflow.push({checker: checker.label, unavailable: true});
        continue;
      }
      for (const violation of newViolations(baseViolations, candidate)) {
        overflow.push({checker: checker.label, ...violation});
      }
    }
  } finally {
    if (base) fs.rmSync(base.baseRoot, {recursive: true, force: true});
  }
  return overflow;
}

export function complexityAdmissionProblems(root, baseCommit, jsPaths, options = {}) {
  return touchedComplexityOverflow(root, baseCommit, jsPaths, options)
    .map((entry) => entry.unavailable ?
      `${PROBLEM_PREFIX}${entry.checker}${CHECKER_UNAVAILABLE_SUFFIX}` :
      `${PROBLEM_PREFIX}${entry.checker}: ${entry.filePath}:${entry.line} ` +
      `${entry.message}${NEW_VIOLATION_SUFFIX}${PROBLEM_ACTION}`);
}
