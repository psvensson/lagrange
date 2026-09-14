#!/usr/bin/env node
// The fast static layer for ordinary development.
//
//   node scripts/check-fast-static.js [--base <sha>] [--explain]
//
// READ-ONLY. It inspects the worktree and never writes to it. Nothing here runs
// a generator and then diffs the result: a command a developer runs mid-edit
// must not modify their tree. Generated artefacts are checked by deriving the
// expected bytes and comparing, never by regenerating in place.
//
// The membership below is an EXPLICIT ALLOWLIST, not a filter over test:static
// by predicted cost. Measured 2026-08-18, test:static was 205s across 24
// checks, with 8 checks accounting for 194s of it. The split is by kind, not
// by speed:
//
//   cheap global invariants   kept - 13 checks totalling ~1.5s, and making a
//                             200ms check change-aware would add abstraction
//                             to save nothing
//   dependency boundaries     kept at ~6s - an illegal import can appear
//                             anywhere, and six seconds is cheap insurance
//   whole-corpus ratchets     moved to the ci health steps/release. Duplication,
//                             cycles, unused-exports and full complexity are
//                             global BY NATURE; a duplication ratchet over
//                             changed files only is meaningless
//   changed-path equivalents  lint and the scoped ratchets, over exactly the
//                             paths this change touched
//
// The excluded checks are NOT deleted. They keep repository health honest on a
// schedule and gate the release, so debt cannot accumulate unnoticed - it just
// stops blocking every unrelated change.

import {spawnSync} from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {RANGE_SOURCE} from './checks/change-selection-constants.js';
import {
  changedCandidatePaths,
  javaScriptPaths,
  resolvedCheckRange,
} from './checks/changed-paths.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UTF8 = 'utf8';
const NEWLINE = '\n';
const BASE_FLAG = '--base';
const EXPLAIN_FLAG = '--explain';
const INDENT = '  ';
const OK_MARK = 'ok';
const FAIL_MARK = 'FAIL';
const NPM = 'npm';
const RUN = 'run';
const ESLINT_NO_CHANGES_LABEL = 'eslint(changed)';
const SCOPED_RATCHET_CHECK = 'test:metrics:scoped';
const MS_COLUMN_WIDTH = 6;
const FAILURE_EXCERPT_CHARS = 2000;
const HEAD_LABEL = 'HEAD';
const RANGE_PREFIX = 'proof range: ';
const WORKTREE_RANGE_NOTE = 'no publication remote';
// Printed when the range holds no JavaScript. That is legitimate for a
// docs-only change and a hole for anything else: eslint and the scoped
// ratchets ran over nothing, and "ok" alone would not say so.
const NO_JAVASCRIPT_WARNING = 'fast-static: no JavaScript in the proof range; ' +
  'eslint and the scoped ratchets examined nothing';
const NO_JAVASCRIPT_SUMMARY = ' (0 JavaScript changed)';
const WORKTREE_ONLY_SUMMARY = ' (worktree only)';
// Printed when no base could be resolved at all. Proving the working tree
// alone is the inner-loop case in a repository with no publication remote,
// and a silent fallback to it anywhere else is the same hole as an empty
// range: nothing committed was examined, and "ok" alone would not say so.
const WORKTREE_ONLY_WARNING = 'fast-static: no publication remote reachable; ' +
  'only the working tree was proved, nothing already committed';

// Genuinely sub-second on a COLD cache, and each encodes a structural fact
// worth keeping. Cold is the number that matters: CI never has a warm page
// cache, and audit:no-legacy-naming measured 34s cold against 5s warm - so it
// moved to the ci run's health steps rather than kept on a warm-run figure that
// no CI machine will ever see.
const GLOBAL_CHEAP_CHECKS = Object.freeze([
  'audit:impact-contracts',
  'audit:shards',
  'audit:closure-ledger',
  'audit:current-capabilities',
  'audit:cli-docs',
  'audit:doc-ascii',
  'audit:roadmap-authority',
  'audit:service-portability-claims',
  'audit:doc-audience',
  'audit:runtime-grammar',
  'test:metadata-gateway:audit',
]);

// Worth its ~6s: an architectural boundary violation can appear anywhere.
const GLOBAL_DEPENDENCY_CHECK = 'test:deps';

function runNpm(script, extraArgs = []) {
  const args = extraArgs.length > 0 ?
    [RUN, script, '--', ...extraArgs] : [RUN, script];
  const started = Date.now();
  const result = spawnSync(NPM, args, {cwd: root, encoding: UTF8});
  return {
    script,
    ok: result.status === 0,
    ms: Date.now() - started,
    output: `${result.stdout || ''}${result.stderr || ''}`,
  };
}

function runEslint(paths) {
  if (paths.length === 0) {
    return {script: ESLINT_NO_CHANGES_LABEL, ok: true, ms: 0};
  }
  const started = Date.now();
  const result = spawnSync('npx', ['eslint', ...paths],
    {cwd: root, encoding: UTF8});
  return {
    script: `eslint(${paths.length} changed)`,
    ok: result.status === 0,
    ms: Date.now() - started,
    output: `${result.stdout || ''}${result.stderr || ''}`,
  };
}

// One line naming the base and where it came from, so a green run can be read
// against the range it actually proved.
export function describeRange(range) {
  if (!range.base) {
    return `${RANGE_PREFIX}${range.source} (${WORKTREE_RANGE_NOTE})`;
  }
  return `${RANGE_PREFIX}${range.base}..${HEAD_LABEL} (${range.source})`;
}

export function rangeWarnings({range, changedJs}) {
  const warnings = [];
  if (range.source === RANGE_SOURCE.WORKTREE) warnings.push(WORKTREE_ONLY_WARNING);
  if (changedJs.length === 0) warnings.push(NO_JAVASCRIPT_WARNING);
  return warnings;
}

// The verdict line carries the warned cases, so "ok" never stands alone over
// a range in which the changed-path checks examined nothing committed.
export function summaryLine(outcome) {
  const noJavaScript = outcome.warnings.includes(NO_JAVASCRIPT_WARNING);
  const worktreeOnly = outcome.warnings.includes(WORKTREE_ONLY_WARNING);
  return `fast-static: ${outcome.failures.length === 0 ? OK_MARK : FAIL_MARK}` +
    `${noJavaScript ? NO_JAVASCRIPT_SUMMARY : ''}` +
    `${worktreeOnly ? WORKTREE_ONLY_SUMMARY : ''} ` +
    `in ${outcome.totalMs}ms`;
}

export function runFastStatic({base = null, explain = false,
  range = {base, source: base ? RANGE_SOURCE.FLAG : RANGE_SOURCE.WORKTREE}} = {}) {
  const changed = changedCandidatePaths({root, base: range.base});
  const changedJs = javaScriptPaths(changed || []);
  const warnings = rangeWarnings({range, changedJs});
  const results = [];

  for (const script of GLOBAL_CHEAP_CHECKS) results.push(runNpm(script));
  results.push(runNpm(GLOBAL_DEPENDENCY_CHECK));
  results.push(runEslint(changedJs));
  if (changedJs.length > 0) {
    results.push(runNpm(SCOPED_RATCHET_CHECK, changedJs));
  }

  const failures = results.filter((result) => !result.ok);
  const totalMs = results.reduce((total, result) => total + result.ms, 0);
  if (explain) {
    process.stdout.write(`changed paths: ${(changed || []).length}` +
      ` (${changedJs.length} JavaScript)${NEWLINE}`);
    for (const result of [...results].sort((a, b) => b.ms - a.ms)) {
      process.stdout.write(
        `${INDENT}${result.ok ? OK_MARK : FAIL_MARK} ` +
        `${String(result.ms).padStart(MS_COLUMN_WIDTH)}ms  ${result.script}${NEWLINE}`);
    }
  }
  return {results, failures, totalMs, changed: changed || [], changedJs,
    range, warnings};
}

function main() {
  const argv = process.argv.slice(2);
  const range = resolvedCheckRange(argv.includes(BASE_FLAG) ?
    argv[argv.indexOf(BASE_FLAG) + 1] : null, process.env, root);
  process.stdout.write(`${describeRange(range)}${NEWLINE}`);
  const outcome = runFastStatic({range, explain: argv.includes(EXPLAIN_FLAG)});
  for (const warning of outcome.warnings) {
    process.stderr.write(`${warning}${NEWLINE}`);
  }
  for (const failure of outcome.failures) {
    process.stderr.write(`${FAIL_MARK} ${failure.script}${NEWLINE}`);
    process.stderr.write(
      (failure.output || '').trim().slice(-FAILURE_EXCERPT_CHARS) + NEWLINE);
  }
  process.stdout.write(`${summaryLine(outcome)}${NEWLINE}`);
  process.exitCode = outcome.failures.length === 0 ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
