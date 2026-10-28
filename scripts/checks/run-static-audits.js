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
 * the old behavior for callers that want the first failure only, and
 * `--chain "<npm run a && npm run b ...>"` runs an explicit chain with
 * bounded concurrency while preserving deterministic output order.
 */

import {spawn} from 'node:child_process';
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
const arrayFill = Function.call.bind(Array.prototype.fill);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayIndexOf = Function.call.bind(Array.prototype.indexOf);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySome = Function.call.bind(Array.prototype.some);
const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayPush = Function.call.bind(Array.prototype.push);
const arrayShift = Function.call.bind(Array.prototype.shift);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringSlice = Function.call.bind(String.prototype.slice);
const stringMatchAll = Function.call.bind(String.prototype.matchAll);
const arrayFilter = Function.call.bind(Array.prototype.filter);

const NPM_BINARY = 'npm';
const NPM_RUN_ARGUMENTS = Object.freeze(['run', '-s']);
const FAST_FAIL_FLAG = '--fast-fail';
const CHAIN_FLAG = '--chain';
const CHAIN_SCRIPT_PATTERN = /npm run (?:-s )?([A-Za-z0-9:_-]+)/gu;
const STEERING_CHECK_SCRIPT = 'steering:check';
const METRICS_COMPOSITE_SCRIPT = 'test:metrics';
const GUIDELINES_COMPOSITE_SCRIPT = 'audit:guidelines';
const DUPLICATION_SCRIPT = 'test:duplication';
const DUPLICATION_SOURCE_ARGUMENTS = Object.freeze([
  '--',
  '--target',
  'src+scripts',
]);
const DUPLICATION_TEST_ARGUMENTS = Object.freeze([
  '--',
  '--target',
  'test',
]);
const COMPOSITE_SUBTASKS = Object.freeze({
  [METRICS_COMPOSITE_SCRIPT]: Object.freeze([
    Object.freeze({
      extraArguments: DUPLICATION_TEST_ARGUMENTS,
      priority: true,
      scriptName: DUPLICATION_SCRIPT,
    }),
    Object.freeze({
      extraArguments: DUPLICATION_SOURCE_ARGUMENTS,
      priority: true,
      scriptName: DUPLICATION_SCRIPT,
    }),
    Object.freeze({
      extraArguments: Object.freeze([]),
      priority: true,
      scriptName: 'test:cycles',
    }),
    Object.freeze({
      extraArguments: Object.freeze([]),
      priority: true,
      scriptName: 'test:complexity:cognitive',
    }),
  ]),
  [GUIDELINES_COMPOSITE_SCRIPT]: Object.freeze([
    Object.freeze({
      extraArguments: Object.freeze([]),
      priority: false,
      scriptName: 'audit:guideline:literals',
    }),
    Object.freeze({
      extraArguments: Object.freeze([]),
      priority: false,
      scriptName: 'audit:guideline:decision-boundaries',
    }),
    Object.freeze({
      extraArguments: Object.freeze([]),
      priority: false,
      scriptName: 'audit:guideline:boundary-mode-contracts',
    }),
    Object.freeze({
      extraArguments: Object.freeze([]),
      priority: false,
      scriptName: 'audit:guideline:hot-path-diagnostics',
    }),
    Object.freeze({
      extraArguments: Object.freeze([]),
      priority: false,
      scriptName: 'audit:guideline:deferred-outcomes',
    }),
    Object.freeze({
      extraArguments: Object.freeze([]),
      priority: false,
      scriptName: 'audit:guideline:silent-catch',
    }),
    Object.freeze({
      extraArguments: Object.freeze([]),
      priority: false,
      scriptName: 'audit:guideline:ambient-intrinsics',
    }),
    Object.freeze({
      extraArguments: Object.freeze([]),
      priority: false,
      scriptName: 'audit:style-terminal-vocabulary',
    }),
  ]),
});
const PRIORITY_AUDIT_SCRIPTS = Object.freeze([
  'lint',
  'test:deps',
  'test:unused',
  'test:unused:ratchet',
  'test:complexity',
  'test:unused:prod',
  'lint:scripts',
]);
const MAXIMUM_PARALLEL_AUDITS = 4;
const MAXIMUM_HEAVY_PARALLEL_AUDITS = 2;
const SERIAL_PARALLEL_AUDITS = 1;
const PIPE_STREAM_MODE = 'pipe';
const IGNORE_STREAM_MODE = 'ignore';
const STREAM_MODES = Object.freeze([
  IGNORE_STREAM_MODE,
  PIPE_STREAM_MODE,
  PIPE_STREAM_MODE,
]);
const DATA_EVENT = 'data';
const CLOSE_EVENT = 'close';
const ERROR_EVENT = 'error';
const UTF_EIGHT_ENCODING = 'utf8';
const EMPTY_OUTPUT = '';
const NEWLINE = '\n';
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

function isValidObligationRecord(obligation) {
  if (typeof obligation.command !== 'string') return false;
  return Array.isArray(obligation.inputs);
}

function obligationInputs(root) {
  try {
    const registry = JSON.parse(
      fs.readFileSync(
        path.join(root, PROOF_OBLIGATIONS_PATH),
        UTF_EIGHT_ENCODING,
      ),
    );
    const byCommand = new Map();
    for (const obligation of registry.obligations || []) {
      if (isValidObligationRecord(obligation)) {
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

function hasMissingAuditContext(obligation, changedPaths) {
  if (changedPaths === null) return true;
  return !obligation;
}

// A check whose scope IS the tree - a grep over every tracked file - has no
// input list that could be complete, so it declares itself whole-tree and is
// always owed. Anything else is owed when one of its declared inputs changed.
function auditIsOwed(obligation, changedPaths) {
  if (hasMissingAuditContext(obligation, changedPaths)) return true;
  if (obligation.wholeTree === true) return true;
  return arraySome(obligation.inputs, (pattern) =>
    arraySome(changedPaths, (changedPath) => inputMatches(pattern, changedPath)));
}

function hasNoChangedPaths(changedPaths) {
  if (changedPaths === null) return true;
  return changedPaths.length === 0;
}

// Skipping is admissible only when the registry can account for EVERY path
// the range changed. An empty range is not evidence of an unchanged tree (a
// stale base names one), and a path no obligation declares is territory the
// registry cannot speak for, so both run everything. Under-running is the
// failure this registry must never cause; over-running only costs minutes.
function skippingIsAdmissible(changedPaths, inputsByCommand) {
  if (hasNoChangedPaths(changedPaths)) return false;
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

function isUnboundedRange(range) {
  if (range.source === RANGE_SOURCE.WORKTREE) return true;
  return !range.base;
}

// The changed paths of the range this gate is proving, or null when there is
// no committed range to read.
function rangeChangedPaths(root) {
  const range = resolvedCheckRange(null, process.env, root);
  if (isUnboundedRange(range)) return null;
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
  'audit:no-legacy-consensus-references',
  'audit:impact-contracts',
  'audit:shards',
  'audit:guidelines',
  'audit:doc-audience',
  'audit:doc-ascii',
  'audit:documentation-current',
  'audit:roadmap-authority',
  'steering:check',
]);

function resolveChainScripts(argv) {
  const flagIndex = arrayIndexOf(argv, CHAIN_FLAG);
  if (flagIndex < 0) return null;
  const chainText = String(argv[flagIndex + 1] || EMPTY_OUTPUT);
  const scripts = [];
  for (const match of stringMatchAll(chainText, CHAIN_SCRIPT_PATTERN)) {
    arrayPush(scripts, match[1]);
  }
  return scripts;
}

function runLeafAudit(scriptName, extraArguments = []) {
  return new Promise((resolve) => {
    const child = spawn(
      NPM_BINARY,
      [...NPM_RUN_ARGUMENTS, scriptName, ...extraArguments],
      {stdio: STREAM_MODES},
    );
    let output = EMPTY_OUTPUT;
    child.stdout.on(DATA_EVENT, (chunk) => {
      output += String(chunk);
    });
    child.stderr.on(DATA_EVENT, (chunk) => {
      output += String(chunk);
    });
    child.on(ERROR_EVENT, (err) => {
      output += `${String(err)}${NEWLINE}`;
      resolve({exitCode: 1, output, scriptName});
    });
    child.on(CLOSE_EVENT, (code) => {
      resolve({exitCode: code ?? 1, output, scriptName});
    });
  });
}

function flushAuditOutput(result) {
  if (result.output.length > 0) {
    process.stdout.write(result.output);
  }
}

function shouldSkipAudit(maySkip, obligation, changedPaths) {
  if (!maySkip) return false;
  return !auditIsOwed(obligation, changedPaths);
}

function selectOwedAudits(scripts, maySkip, inputsByCommand, changedPaths) {
  const owed = [];
  const skipped = [];
  for (const scriptName of scripts) {
    const obligation = inputsByCommand.get(`${NPM_RUN_PREFIX}${scriptName}`);
    if (shouldSkipAudit(maySkip, obligation, changedPaths)) {
      arrayPush(skipped, scriptName);
    } else {
      arrayPush(owed, scriptName);
    }
  }
  return {owed, skipped};
}

function expandAuditTasks(owed) {
  const heavy = [];
  const regular = [];
  const taskCounts = arrayFill(new Array(owed.length), 0);
  for (let parentIndex = 0; parentIndex < owed.length; parentIndex += 1) {
    const scriptName = owed[parentIndex];
    if (scriptName === STEERING_CHECK_SCRIPT) continue;
    const subtasks = COMPOSITE_SUBTASKS[scriptName];
    if (subtasks) {
      taskCounts[parentIndex] = subtasks.length;
      for (let subIndex = 0; subIndex < subtasks.length; subIndex += 1) {
        const sub = subtasks[subIndex];
        const task = {
          extraArguments: sub.extraArguments,
          parentIndex,
          scriptName: sub.scriptName,
          subIndex,
        };
        if (sub.priority) arrayPush(heavy, task);
        else arrayPush(regular, task);
      }
    } else {
      taskCounts[parentIndex] = 1;
      const task = {
        extraArguments: [],
        parentIndex,
        scriptName,
        subIndex: 0,
      };
      if (arrayIncludes(PRIORITY_AUDIT_SCRIPTS, scriptName)) {
        arrayPush(heavy, task);
      } else {
        arrayPush(regular, task);
      }
    }
  }
  return {heavy, regular, taskCounts};
}

function hasEmptySubResults(subResults) {
  if (!subResults) return true;
  return subResults.length === 0;
}

function combineParentResult(scriptName, subResults) {
  if (hasEmptySubResults(subResults)) return null;
  let exitCode = 0;
  let output = EMPTY_OUTPUT;
  for (const sub of subResults) {
    if (!sub) return null;
    output += sub.output;
    if (sub.exitCode !== 0) exitCode = sub.exitCode;
  }
  return {exitCode, output, scriptName};
}

function shouldAbortFastFail(fastFail, result) {
  if (!fastFail) return false;
  return result.exitCode !== 0;
}

function shouldTakeHeavyTask(heavy, isHeavyWorker) {
  if (!isHeavyWorker) return false;
  return heavy.length > 0;
}

function nextTaskForWorker(heavy, regular, isHeavyWorker) {
  if (shouldTakeHeavyTask(heavy, isHeavyWorker)) {
    return arrayShift(heavy);
  }
  return arrayShift(regular);
}

async function executeOwedAudits(owed, fastFail) {
  const {heavy, regular, taskCounts} = expandAuditTasks(owed);
  const subResultsByParent = arrayMap(
    taskCounts,
    (count) => new Array(count),
  );
  const steeringIndex = arrayIndexOf(owed, STEERING_CHECK_SCRIPT);
  if (steeringIndex >= 0) {
    const steeringResult = await runLeafAudit(STEERING_CHECK_SCRIPT);
    subResultsByParent[steeringIndex] = [steeringResult];
    if (shouldAbortFastFail(fastFail, steeringResult)) {
      flushAuditOutput(steeringResult);
      return [steeringResult];
    }
  }
  const totalTasks = heavy.length + regular.length;
  const workerLimit = fastFail ?
    SERIAL_PARALLEL_AUDITS :
    Math.min(MAXIMUM_PARALLEL_AUDITS, totalTasks);
  let aborted = false;
  async function runWorker(isHeavyWorker) {
    while (!aborted) {
      const task = nextTaskForWorker(heavy, regular, isHeavyWorker);
      if (!task) return;
      const result = await runLeafAudit(task.scriptName, task.extraArguments);
      subResultsByParent[task.parentIndex][task.subIndex] = result;
      if (shouldAbortFastFail(fastFail, result)) {
        aborted = true;
        return;
      }
    }
  }
  const workers = [];
  for (let index = 0; index < workerLimit; index += 1) {
    arrayPush(workers, runWorker(index < MAXIMUM_HEAVY_PARALLEL_AUDITS));
  }
  await Promise.all(workers);
  const completed = [];
  for (let index = 0; index < owed.length; index += 1) {
    const combined = combineParentResult(
      owed[index],
      subResultsByParent[index],
    );
    if (combined) {
      flushAuditOutput(combined);
      arrayPush(completed, combined);
    }
  }
  return completed;
}

function writeSummary(skipped, results, changedPaths) {
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

async function main() {
  const fastFail = arrayIncludes(process.argv, FAST_FAIL_FLAG);
  const chainScripts = resolveChainScripts(process.argv);
  const root = process.cwd();
  const changedPaths = chainScripts ? null : rangeChangedPaths(root);
  const inputsByCommand = chainScripts ? new Map() : obligationInputs(root);
  const maySkip = chainScripts ?
    false :
    skippingIsAdmissible(changedPaths, inputsByCommand);
  const scripts = chainScripts || STATIC_AUDIT_SCRIPTS;
  const {owed, skipped} = selectOwedAudits(
    scripts,
    maySkip,
    inputsByCommand,
    changedPaths,
  );
  const results = await executeOwedAudits(owed, fastFail);
  writeSummary(skipped, results, changedPaths);
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
  main().catch((err) => {
    process.stderr.write(`${String(err)}${NEWLINE}`);
    process.exit(1);
  });
}

// Exported for the witness that proves the skip decision: a registry nothing
// can test is a registry nobody should trust.
export {auditIsOwed, inputMatches, skippingIsAdmissible};
