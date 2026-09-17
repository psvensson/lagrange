#!/usr/bin/env node
// The push gate's test stage.
//
//   node scripts/checks/push-gate-change-proof.js [--explain]
//
// A push is proved by its CHANGE: the safety spine plus what the changed
// paths oblige, selected by the same orchestrator CI runs (`npm test`) against
// the same base - the remote sha the pre-push hook receives, exported to this
// stage as LAGRANGE_CHECK_BASE. Until 2026-09-12 this stage ran the whole
// corpus on every push: seventeen minutes of test time re-proving bytes that
// had not changed. Now it runs the change proof, and the WHOLE corpus
// (test:all) only when the change proof cannot stand for it:
//
//   refused     the selector could not scope the change
//   machinery   the change touches the selector, the runner, the generated
//               selection state, the hook or the package manifests - a proof
//               selected by the thing the change altered proves nothing
//   size        the cone is more than half the corpus; the rest is cheap
//   no range    no committed base could be resolved (working tree only)
//   operator    LAGRANGE_PUSH_FULL_CORPUS=1
//
// The decision is a pure function of the plan (decidePushProof), so it is
// tested without running a test. The whole corpus still runs on main after
// every push, gating nothing, in the full-corpus canary workflow.

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {runClassifiedTestFiles} from '../run-classified-test-files.js';
import {
  planChangeProof,
  planTestPaths,
  writeProofScope,
} from '../select-change-tests.js';
import {
  appendArrayValue,
  appendArrayValues,
} from './change-proof-string-collections.js';
import {
  FULL_CORPUS_SHARE,
  FULL_CORPUS_TRIGGER_RULES,
  PROOF_MODE,
  PUSH_FULL_CORPUS_ENV,
  RANGE_SOURCE,
  SELECTION_REFUSED,
} from './change-selection-constants.js';
import {resolvedCheckRange} from './changed-paths.js';
import {
  SUBSYSTEM_MANIFEST_PATH,
} from './test-subsystem-classification-constants.js';

const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayJoin = Function.call.bind(Array.prototype.join);
const regExpTest = Function.call.bind(RegExp.prototype.test);
const jsonParse = JSON.parse.bind(JSON);
const objectKeys = Object.keys;

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const UTF8 = 'utf8';
const NEWLINE = '\n';
const INDENT = '  ';
const EXPLAIN_FLAG = '--explain';
const LOG_PREFIX = '[push-gate-change-proof]';
const NPM = 'npm';
const NPM_RUN_SILENT = Object.freeze(['run', '-s']);
const FULL_CORPUS_SCRIPT = 'test:all';
const WORKTREE_RANGE_LABEL = 'working tree';
const PERCENT = 100;
const EXIT_FAILURE = 1;
const CANNOT_DIFF_PROBLEM = 'cannot diff the proof range';
const LABEL_RANGE = 'proof range:';
const LABEL_SELECTION = 'selection:';
const LABEL_MODE = 'test stage:';
const stringTrim = Function.call.bind(String.prototype.trim);
const GIT_BINARY = 'git';
const HEAD_REVISION_ARGUMENTS = Object.freeze(['rev-parse', 'HEAD']);
const TEXT_ENCODING = 'utf8';
const LABEL_BECAUSE = 'because:';
const TESTS_SUFFIX = ' test(s)';

// The triggers and modes are owned by change-selection-constants.js, next to
// the selection outcomes they are decided from.
const TRIGGER = Object.freeze({
  OPERATOR: `operator: ${PUSH_FULL_CORPUS_ENV} is set`,
  REFUSED: 'selection refused',
  NO_RANGE: 'no committed proof range: only the working tree could be diffed',
});

/**
 * The full-corpus triggers among the changed paths, one line per hit.
 * @param {string[]} changedPaths
 * @return {string[]}
 */
export function fullCorpusTriggers(changedPaths) {
  const hits = [];
  for (let ruleIndex = 0; ruleIndex < FULL_CORPUS_TRIGGER_RULES.length;
    ruleIndex += 1) {
    const rule = FULL_CORPUS_TRIGGER_RULES[ruleIndex];
    for (let pathIndex = 0; pathIndex < changedPaths.length; pathIndex += 1) {
      if (regExpTest(rule.pattern, changedPaths[pathIndex])) {
        appendArrayValue(hits,
          `changed ${rule.id}: ${changedPaths[pathIndex]}`);
      }
    }
  }
  return hits;
}

/**
 * Whether the push runs its change proof or the whole corpus, and why.
 * @param {{plan: object, corpusSize: number, rangeSource: string,
 *   env?: object}} input
 * @return {{mode: string, reasons: string[]}}
 */
export function decidePushProof({plan, corpusSize, rangeSource,
  env = process.env}) {
  const because = [];
  if (env[PUSH_FULL_CORPUS_ENV]) appendArrayValue(because, TRIGGER.OPERATOR);
  if (rangeSource === RANGE_SOURCE.WORKTREE) {
    appendArrayValue(because, TRIGGER.NO_RANGE);
  }
  if (plan.kind === SELECTION_REFUSED) {
    appendArrayValue(because, `${TRIGGER.REFUSED}: ${plan.refusalCode}`);
  }
  appendArrayValues(because, fullCorpusTriggers(plan.changedPaths));
  if (plan.tests.length > corpusSize * FULL_CORPUS_SHARE) {
    appendArrayValue(because, `cone is ${plan.tests.length} of ${corpusSize} ` +
      `classified tests, above ${FULL_CORPUS_SHARE * PERCENT}%`);
  }
  return {
    mode: because.length > 0 ? PROOF_MODE.FULL_CORPUS : PROOF_MODE.CHANGE_PROOF,
    reasons: because,
  };
}

/**
 * How many tests the classified corpus holds.
 * @param {string} planRoot
 * @return {number}
 */
function classifiedCorpusSize(planRoot = root) {
  const manifest = jsonParse(fs.readFileSync(
    path.join(planRoot, SUBSYSTEM_MANIFEST_PATH), UTF8));
  return objectKeys(manifest.classes).length;
}

function renderDecision(range, plan, decision) {
  const lines = [
    `${LOG_PREFIX} ${LABEL_RANGE} ${range.base || WORKTREE_RANGE_LABEL} ` +
      `(${range.source})`,
    `${LOG_PREFIX} ${LABEL_SELECTION} ${plan.kind}, ` +
      `${plan.tests.length}${TESTS_SUFFIX} ` +
      `(${plan.spineCount} spine, ${plan.selectedCount} selected)`,
  ];
  for (let index = 0; index < plan.refusals.length; index += 1) {
    appendArrayValue(lines, `${LOG_PREFIX}${INDENT}${plan.refusals[index]}`);
  }
  appendArrayValue(lines, `${LOG_PREFIX} ${LABEL_MODE} ${decision.mode}`);
  for (let index = 0; index < decision.reasons.length; index += 1) {
    appendArrayValue(lines,
      `${LOG_PREFIX}${INDENT}${LABEL_BECAUSE} ${decision.reasons[index]}`);
  }
  return arrayJoin(lines, NEWLINE) + NEWLINE;
}

function runFullCorpus() {
  const result = spawnSync(NPM, [...NPM_RUN_SILENT, FULL_CORPUS_SCRIPT],
    {cwd: root, stdio: 'inherit'});
  return result.status ?? EXIT_FAILURE;
}

function runDecision(plan, decision) {
  // The run that made the decision records what it proves, so a consumer
  // (the behavioural canary) never has to infer the scope from log text.
  writeProofScope({
    head: headRevision(),
    fullCorpus: decision.mode === PROOF_MODE.FULL_CORPUS,
    plan,
  });
  return decision.mode === PROOF_MODE.FULL_CORPUS ?
    runFullCorpus() :
    runClassifiedTestFiles(planTestPaths(plan), {root});
}

function headRevision() {
  const result = spawnSync(GIT_BINARY, [...HEAD_REVISION_ARGUMENTS],
    {cwd: root, encoding: TEXT_ENCODING});
  const sha = stringTrim(String(result.stdout || ''));
  return sha.length > 0 ? sha : null;
}

function main() {
  const explain = arrayIncludes(process.argv, EXPLAIN_FLAG);
  const range = resolvedCheckRange(null, process.env, root);
  const plan = planChangeProof({base: range.base});
  if (plan === null) {
    process.stderr.write(`${LOG_PREFIX} ${CANNOT_DIFF_PROBLEM}${NEWLINE}`);
    process.exitCode = EXIT_FAILURE;
    return;
  }
  const decision = decidePushProof({
    plan, corpusSize: classifiedCorpusSize(root), rangeSource: range.source,
  });
  process.stdout.write(renderDecision(range, plan, decision));
  // --explain exits 0 even on a REFUSED plan: for the gate a refusal is not
  // an error but the full-corpus branch, and the decision above says so.
  if (explain) return;
  process.exitCode = runDecision(plan, decision);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
