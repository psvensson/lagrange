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
//   whole-corpus ratchets     moved to repository-health/release. Duplication,
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

import {
  changedCandidatePaths,
  javaScriptPaths,
  resolvedCheckBase,
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

// Genuinely sub-second on a COLD cache, and each encodes a structural fact
// worth keeping. Cold is the number that matters: CI never has a warm page
// cache, and audit:no-legacy-naming measured 34s cold against 5s warm - so it
// moved to repository-health rather than being kept on a warm-run figure that
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

export function runFastStatic({base = null, explain = false} = {}) {
  const changed = changedCandidatePaths({root, base});
  const changedJs = javaScriptPaths(changed || []);
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
  return {results, failures, totalMs, changed: changed || [], changedJs};
}

function main() {
  const argv = process.argv.slice(2);
  const base = resolvedCheckBase(argv.includes(BASE_FLAG) ?
    argv[argv.indexOf(BASE_FLAG) + 1] : null);
  const outcome = runFastStatic({base, explain: argv.includes(EXPLAIN_FLAG)});
  for (const failure of outcome.failures) {
    process.stderr.write(`${FAIL_MARK} ${failure.script}${NEWLINE}`);
    process.stderr.write(
      (failure.output || '').trim().slice(-FAILURE_EXCERPT_CHARS) + NEWLINE);
  }
  process.stdout.write(
    `fast-static: ${outcome.failures.length === 0 ? OK_MARK : FAIL_MARK} ` +
    `in ${outcome.totalMs}ms${NEWLINE}`);
  process.exitCode = outcome.failures.length === 0 ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
