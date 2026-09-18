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
const EXIT_SUCCESS = 0;
const CANNOT_DIFF_PROBLEM = 'cannot diff the proof range';
const LABEL_CORPUS_RECEIPT = 'whole-corpus receipt for';
const LABEL_CORPUS_RECEIPT_SKIPPED = 'whole-corpus receipt not recorded:';
// The proof authority owns this contract (scripts/proof-authority.js exports
// it as CORPUS_FULL_PROOF); it is spawned rather than imported so the gate's
// own import closure keeps proving itself - every module in it trips a
// full-corpus trigger, and the authority is not selection machinery. A
// witness pins this literal to the authority's exported id.
const CORPUS_PROOF_ID = 'corpus-full-v1';
const PROOF_AUTHORITY_SCRIPT = 'scripts/proof-authority.js';
const PROOF_RECORD_COMMAND = 'record';
const EMPTY_REASON = 'the authority gave no reason';
const RECORD_TIMEOUT_MS = 60000;
const EMPTY_TEXT = '';
const LABEL_CORPUS_RECEIPT_UNPROVED_TREE =
  'whole-corpus receipt not recorded: this tree is not that commit';
// Untracked files count: a committed test whose fixture exists only in the
// tree passes locally while HEAD's own corpus would be red. Ignored build
// artifacts are not listed by --porcelain, so the gate's own materialised
// checkout stays clean (verifier round 2).
const STATUS_ARGUMENTS = Object.freeze(['status', '--porcelain']);
const MAIN_REMOTE_REF = 'origin/main';
const ANCESTOR_ARGUMENTS = Object.freeze(['merge-base', '--is-ancestor']);
const LABEL_CORPUS_RECEIPT_UNPUBLISHED =
  'whole-corpus receipt deferred to the publisher: this commit is not on ' +
  'origin/main yet';
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

// A green whole-corpus run is a fact about this commit, so it is recorded
// where it happened: a receipt in the proof authority, which the post-push
// canary consults instead of re-proving the same sha (74 min on 0f93df70c).
// Best effort by design - the gate's verdict is the tests, never the
// bookkeeping - and never reached by a cone proof, which proves no corpus.
export function recordCorpusProof(sha, options = {}) {
  const {spawn = spawnSync,
    write = (value) => process.stdout.write(value)} = options;
  if (typeof sha !== 'string' || sha.length === 0) return null;
  // Only a tree that IS that commit may mint its receipt. The gate's own run
  // is an immutable checkout of the pushed sha, but a manual invocation gates
  // HEAD plus whatever is in the tree, and a receipt minted there would let a
  // red commit's canary skip (verifier round 1, working-tree-not-proof).
  if (!treeIsCommit(sha, options)) {
    write(`${LOG_PREFIX} ${LABEL_CORPUS_RECEIPT_UNPROVED_TREE}${NEWLINE}`);
    return null;
  }
  // A receipt is pushed as refs/lagrange-proofs/<contract>/<sha>, and the
  // pre-push fast path exempts that ref only for a commit ALREADY on
  // origin/main. Inside the gate the pushed sha is by construction not there
  // yet, so recording here would re-enter the gate and hang until the bound
  // below kills it (verifier round 1 of proof-ref-push-fast-path). The
  // publisher records instead, straight after the push it verified.
  if (!commitIsPublished(sha, options)) {
    write(`${LOG_PREFIX} ${LABEL_CORPUS_RECEIPT_UNPUBLISHED}${NEWLINE}`);
    return null;
  }
  const result = spawn(process.execPath,
    [PROOF_AUTHORITY_SCRIPT, PROOF_RECORD_COMMAND, CORPUS_PROOF_ID, sha],
    {cwd: root, encoding: TEXT_ENCODING, timeout: RECORD_TIMEOUT_MS});
  const recorded = result?.status === EXIT_SUCCESS;
  write(`${LOG_PREFIX} ${recorded ?
    `${LABEL_CORPUS_RECEIPT} ${sha}` :
    `${LABEL_CORPUS_RECEIPT_SKIPPED} ${stringTrim(
      String(result?.stderr || result?.stdout || EMPTY_REASON))}`}${NEWLINE}`);
  return recorded;
}

// Already an ancestor of origin/main: the receipt's own push is then exempt
// from the gate, so recording cannot re-enter it.
function commitIsPublished(sha, options = {}) {
  const {git = spawnSync} = options;
  const ancestor = git(GIT_BINARY,
    [...ANCESTOR_ARGUMENTS, sha, MAIN_REMOTE_REF],
    {cwd: root, encoding: TEXT_ENCODING});
  return ancestor?.status === EXIT_SUCCESS;
}

// HEAD is this sha and nothing is modified: the tree the corpus ran against
// is the commit the receipt would speak for.
function treeIsCommit(sha, options = {}) {
  const {git = spawnSync} = options;
  const head = git(GIT_BINARY, [...HEAD_REVISION_ARGUMENTS],
    {cwd: root, encoding: TEXT_ENCODING});
  if (head?.status !== EXIT_SUCCESS ||
      stringTrim(String(head.stdout || EMPTY_TEXT)) !== sha) {
    return false;
  }
  const status = git(GIT_BINARY, [...STATUS_ARGUMENTS],
    {cwd: root, encoding: TEXT_ENCODING});
  return status?.status === EXIT_SUCCESS &&
    stringTrim(String(status.stdout || EMPTY_TEXT)) === EMPTY_TEXT;
}

/**
 * Run what the decision chose, and record a whole-corpus receipt only when
 * the whole corpus actually ran and passed. Every effect is injectable so the
 * seam itself has a witness: a cone proof must never mint a corpus receipt.
 * The scope WRITER is injectable too, and deliberately so - this file's own
 * witness is in the safety spine, so a witness that called the real writer
 * would stamp fullCorpus:true into the artifact ci uploads on every push, and
 * the canary would then skip the corpus for ever (verifier round 2).
 * @param {Object} plan
 * @param {{mode: string}} decision
 * @param {Object} [runners]
 * @return {number} the exit status
 */
export function runDecision(plan, decision, runners = {}) {
  const {
    runFull = runFullCorpus,
    runCone = (tests) => runClassifiedTestFiles(tests, {root}),
    record = recordCorpusProof,
    head = headRevision,
    writeScope = writeProofScope,
  } = runners;
  // The run that made the decision records what it proves, so a consumer
  // (the behavioural canary) never has to infer the scope from log text.
  writeScope({
    head: head(),
    fullCorpus: decision.mode === PROOF_MODE.FULL_CORPUS,
    plan,
  });
  if (decision.mode !== PROOF_MODE.FULL_CORPUS) {
    return runCone(planTestPaths(plan));
  }
  const status = runFull();
  if (status === EXIT_SUCCESS) record(head());
  return status;
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
