#!/usr/bin/env node

/**
 * Fail-slow aggregate runner for the static audit corpus.
 *
 * The previous `a && b && c && ...` npm chain surfaced ONE failure per
 * full gate cycle - the 2026-08-04 retrospective paid five ~15-minute
 * push cycles to discover five independent audit failures serially.
 * This runner executes every audit, reports EVERY failure in one pass,
 * and exits non-zero if any failed, so a red gate enumerates the whole
 * remaining work list at once.
 *
 * The audit list mirrors test:static:postpush; `--fast-fail` restores
 * the old behavior for callers that want the first failure only.
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  changedRecords,
  resolvedCheckRange,
  semanticPaths,
} from './changed-paths.js';
import {RANGE_SOURCE} from './change-selection-constants.js';
import process from 'node:process';

// Module-load intrinsic captures (adversarial-js-intrinsics guideline).
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arraySome = Function.call.bind(Array.prototype.some);
const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayPush = Function.call.bind(Array.prototype.push);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringSlice = Function.call.bind(String.prototype.slice);
const arrayFilter = Function.call.bind(Array.prototype.filter);

const NPM_BINARY = 'npm';
const NPM_RUN_ARGUMENTS = Object.freeze(['run', '-s']);
const FAST_FAIL_FLAG = '--fast-fail';
const STATUS_LABEL = Object.freeze({FAIL: 'FAIL', PASS: 'PASS'});
const SUMMARY_HEADER = '\nstatic-audits summary:\n';
const FAILURE_TAIL =
  'every failure above is independently fixable before the next run\n';

// Which audits this run owes, from the obligations registry: an audit whose
// declared inputs the pushed range did not touch proves the same bytes it
// proved last time (gate-work-consolidation). With no range to compare
// against, every audit runs - an unknown range is not an unchanged tree.
const PROOF_OBLIGATIONS_PATH = 'test/manifests/proof-obligations.json';
const NPM_RUN_PREFIX = 'npm run ';
const PATTERN_SUFFIX = '/**';
const SKIP_LABEL = 'SKIP';
const SKIP_REASON = ' (no declared input changed in ';
const SKIP_REASON_TAIL = ')\n';

function obligationInputs(root) {
  try {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, PROOF_OBLIGATIONS_PATH), 'utf8'));
    const byCommand = new Map();
    for (const obligation of registry.obligations || []) {
      if (typeof obligation.command === 'string' &&
          Array.isArray(obligation.inputs)) {
        byCommand.set(obligation.command, {
          inputs: obligation.inputs,
          wholeTree: obligation.wholeTree === true,
        });
      }
    }
    return byCommand;
  } catch {
    return new Map();
  }
}

function inputMatches(pattern, changedPath) {
  return stringEndsWith(pattern, PATTERN_SUFFIX) ?
    stringStartsWith(changedPath,
      stringSlice(pattern, 0, -PATTERN_SUFFIX.length + 1)) :
    changedPath === pattern;
}

// A check whose scope IS the tree - a grep over every tracked file - has no
// input list that could be complete, so it declares itself whole-tree and is
// always owed. Anything else is owed when one of its declared inputs changed.
function auditIsOwed(obligation, changedPaths) {
  if (changedPaths === null || !obligation) return true;
  if (obligation.wholeTree === true) return true;
  return arraySome(obligation.inputs, (pattern) =>
    arraySome(changedPaths, (changedPath) => inputMatches(pattern, changedPath)));
}

// Skipping is admissible only when the registry can account for EVERY path
// the range changed. An empty range is not evidence of an unchanged tree (a
// stale base names one), and a path no obligation declares is territory the
// registry cannot speak for, so both run everything. Under-running is the
// failure this registry must never cause; over-running only costs minutes.
function skippingIsAdmissible(changedPaths, inputsByCommand) {
  if (changedPaths === null || changedPaths.length === 0) return false;
  const declared = [];
  for (const obligation of inputsByCommand.values()) {
    for (const pattern of obligation.inputs) appendPattern(declared, pattern);
  }
  return arrayEvery(changedPaths, (changedPath) =>
    arraySome(declared, (pattern) => inputMatches(pattern, changedPath)));
}

function appendPattern(patterns, pattern) {
  if (!arrayIncludes(patterns, pattern)) arrayPush(patterns, pattern);
}

// The changed paths of the range this gate is proving, or null when there is
// no committed range to read.
function rangeChangedPaths(root) {
  const range = resolvedCheckRange(null, process.env, root);
  if (range.source === RANGE_SOURCE.WORKTREE || !range.base) return null;
  const records = changedRecords({root, base: range.base});
  return records === null ? null : semanticPaths(records);
}

const STATIC_AUDIT_SCRIPTS = Object.freeze([
  'test:unused:prod',
  'test:deps',
  'audit:file-size',
  'test:complexity',
  'test:complexity:cognitive',
  'test:metadata-gateway:audit',
  'audit:runtime-grammar',
  'audit:operation-progress-authority',
  'audit:service-portability-claims',
  'audit:current-capabilities',
  'audit:cli-docs',
  'audit:closure-ledger',
  'audit:no-kiro',
  'audit:no-legacy-naming',
  'audit:impact-contracts',
  'audit:shards',
  'audit:guidelines',
  'audit:doc-audience',
  'audit:doc-ascii',
  'audit:documentation-current',
  'audit:roadmap-authority',
  'steering:check',
]);

function runAudit(scriptName) {
  const result = spawnSync(
    NPM_BINARY,
    [...NPM_RUN_ARGUMENTS, scriptName],
    {encoding: 'utf8', stdio: 'inherit'},
  );
  return {
    exitCode: result.status ?? 1,
    scriptName,
  };
}

function main() {
  const fastFail = arrayIncludes(process.argv, FAST_FAIL_FLAG);
  const root = process.cwd();
  const changedPaths = rangeChangedPaths(root);
  const inputsByCommand = obligationInputs(root);
  const maySkip = skippingIsAdmissible(changedPaths, inputsByCommand);
  const results = [];
  const skipped = [];
  for (const scriptName of STATIC_AUDIT_SCRIPTS) {
    const obligation = inputsByCommand.get(`${NPM_RUN_PREFIX}${scriptName}`);
    if (maySkip && !auditIsOwed(obligation, changedPaths)) {
      skipped.push(scriptName);
      continue;
    }
    const result = runAudit(scriptName);
    results.push(result);
    if (fastFail && result.exitCode !== 0) {
      break;
    }
  }
  const failures = arrayFilter(
    results, (result) => result.exitCode !== 0);
  process.stdout.write(SUMMARY_HEADER);
  for (const scriptName of skipped) {
    process.stdout.write(`  ${SKIP_LABEL}  ${scriptName}${SKIP_REASON}` +
      `${changedPaths ? changedPaths.length : 0} changed path(s)` +
      SKIP_REASON_TAIL);
  }
  for (const result of results) {
    const label = result.exitCode === 0 ?
      STATUS_LABEL.PASS :
      STATUS_LABEL.FAIL;
    process.stdout.write(`  ${label}  ${result.scriptName}\n`);
  }
  if (failures.length > 0) {
    process.stdout.write(
      `static-audits: ${failures.length}/${results.length} audits FAILED - ` +
        FAILURE_TAIL);
    process.exit(1);
  }
  process.stdout.write(
    `static-audits: all ${results.length} audits passed\n`);
}

// Only when run as a command: the skip decision above is imported by its
// witness, and an import must not run twenty-two audits.
// Both sides realpathed: Node realpaths import.meta.url but leaves argv[1] as
// typed, so an absolute symlinked invocation path would otherwise make this
// command exit 0 having run nothing.
function isDirectInvocation() {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(process.argv[1]) ===
      fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isDirectInvocation()) {
  main();
}

// Exported for the witness that proves the skip decision: a registry nothing
// can test is a registry nobody should trust.
export {auditIsOwed, inputMatches, skippingIsAdmissible};
