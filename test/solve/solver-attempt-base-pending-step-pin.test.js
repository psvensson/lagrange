import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {runAttemptCommand} from '../../scripts/solve/attempt.js';
import {
  runAttemptBaseCorrectionCommand,
} from '../../scripts/solve/attempt-base-correction.js';
import {
  EVENT_ATTEMPT_BASE_CORRECTED,
} from '../../scripts/solve/attempt-base-correction-projection.js';
import {inspectChangeArtifact} from '../../scripts/solve/change-artifact.js';
import {EVENT_ATTEMPT} from '../../scripts/solve/constants.js';
import {finalizeAttempt, makeRunContext} from '../../scripts/solve/loop.js';
import {evaluate} from '../../scripts/solve/probe.js';
import {runStep, stepPending} from '../../scripts/solve/step.js';
import {
  appendFinding,
  projectState,
  readLog,
  saveQuest,
} from '../../scripts/solve/store.js';
import {verificationState} from '../../scripts/solve/verification.js';

// Deterministic witness for the solver-attempt-base-pending-step-pin quest:
// the exact 2026-08-30 operator sequence (quest
// operation-ledger-self-move-holder-release-on-engagement) driven through
// the REAL step/attempt/verification modules on a temporary Git repository.
//
// The incident: `solve step` pinned its base at begin time (7085090e2), an
// unrelated commit advanced HEAD, a one-shot `solve attempt` recorded during
// the pending step pinned the CURRENT HEAD (0553f8b10) because the source
// epoch begins only with the first RECORDED attempt, and the step then
// recorded its older pin. The landing candidate had two reachable bases, the
// review envelope's fingerprint could not be built ("landing candidate
// requires one recorded common Git base") and the quest had to be resealed.
// Canon (solver-quests.md): later attempts retain the base even when
// unrelated commits advance HEAD.
//
// Every scenario name below is anchored to one sealed receipt id so the
// evidence harness selects it with --test-name-pattern. The witness imports
// only modules that exist on the pre-cure HEAD, so the control receipts load
// and pass on both sides while the cure receipts are RED on HEAD.

const QUEST_ID = 'pending-step-pin';
const FRONTIER_ID = `${QUEST_ID}-main`;
const SOURCE_A = 'src/a.js';
const SOURCE_B = 'src/b.js';
const NOTES = 'docs/notes.md';
const SOURCE_A_BASE = 'export const a = 1;\n';
const SOURCE_B_BASE = 'export const b = 1;\n';
const SOURCE_A_CANDIDATE = 'export const a = 2;\n';
const SOURCE_A_UNRELATED_COMMIT = 'export const a = 10;\n';
const SOURCE_B_CANDIDATE = 'export const b = 2;\n';
const NOTES_BASE = 'notes\n';
const NOTES_UNRELATED = 'notes: unrelated commit while the step is pending\n';
const ORACLE_OPEN = {metric: 2, target: 0};
const ORACLE_CLOSER = {metric: 1, target: 0};
const HARNESS_NOOP = ['node', '-e', ''];
const GIT_DIFF_ARGUMENTS = Object.freeze([
  'diff', '--binary', '--full-index', '--no-ext-diff',
]);
const TMP_PREFIX = 'solver-attempt-base-pending-step-pin-';
const COMMON_BASE_PROBLEM = /one recorded common Git base/u;
const REJECTION_AUTHORITY_PROBLEM =
  /standing earlier candidate-rejection base/u;
const TARGET_DELTA_PROBLEM = /target-base delta does not reproduce/u;
const CORRECTED_PATTERN = /^corrected attempt /u;
const SIBLING_AUTHORIZATION = 'sibling-recorded-base';
const REJECTION_AUTHORIZATION = 'candidate-rejection';
const VERIFIER_REJECTION = 'verifier-rejection';
const VERIFIER_EVIDENCE = 'subagent:pending-pin-rejector';
const VERIFICATION_SCHEMA_VERSION = 2;
const CANDIDATE_SCOPE = 'candidate';
const VERDICT_REJECTED = 'rejected';
const ONE_SHOT_SUMMARY = 'one-shot attempt while the step is pending';
const STEP_SUMMARY = 'step commit of the pending attempt';

function gitRaw(root, args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function git(root, args) {
  return gitRaw(root, args).trim();
}

function head(root) {
  return git(root, ['rev-parse', 'HEAD']);
}

function writeFile(root, relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, content);
}

// A temporary repository whose base commit holds two source files and a
// notes document the unrelated commit will touch. The metric is the oracle
// probe so the step/attempt paths measure real on-disk evidence.
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), TMP_PREFIX));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  git(root, ['init']);
  git(root, ['config', 'user.email', 'solver@example.com']);
  git(root, ['config', 'user.name', 'Solver']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  writeFile(root, SOURCE_A, SOURCE_A_BASE);
  writeFile(root, SOURCE_B, SOURCE_B_BASE);
  writeFile(root, NOTES, NOTES_BASE);
  git(root, ['add', '-A']);
  git(root, ['commit', '-m', 'base']);
  const oracleFile = path.join(root, 'solve', 'oracle', `${QUEST_ID}.json`);
  fs.mkdirSync(path.dirname(oracleFile), {recursive: true});
  fs.writeFileSync(oracleFile, JSON.stringify(ORACLE_OPEN));
  const metric = {probe: 'oracle', args: {file: oracleFile}};
  const quest = {
    id: QUEST_ID,
    authoringContractVersion: 1,
    verificationContractVersion: VERIFICATION_SCHEMA_VERSION,
    statement: 'The pending-step pin fixture reaches zero.',
    priority: 1,
    class: 'process',
    doneWhen: metric,
    frontiers: [{id: FRONTIER_ID, priority: 1, metric}],
    constraints: [],
  };
  saveQuest(root, quest);
  return {root, quest, oracleFile};
}

// The byte-exact canonical delta of `paths` against `base` as the operator
// would hand `solve attempt --changeRef diff:<path>`.
function canonicalArtifact(root, name, base, paths) {
  const relative = `solve/changes/${QUEST_ID}/${name}.diff`;
  writeFile(root, relative,
    gitRaw(root, [...GIT_DIFF_ARGUMENTS, base, '--', ...paths]));
  return `diff:${relative}`;
}

function commitUnrelated(root, edits) {
  for (const [relative, content] of Object.entries(edits)) {
    writeFile(root, relative, content);
  }
  git(root, ['add', '-A', '--', ...Object.keys(edits)]);
  git(root, ['commit', '-m', 'unrelated commit while the step is pending']);
  return head(root);
}

function attemptEvents(root) {
  return readLog(root, QUEST_ID).filter((event) => event.type === EVENT_ATTEMPT);
}

function correctionEvents(root) {
  return readLog(root, QUEST_ID)
    .filter((event) => event.type === EVENT_ATTEMPT_BASE_CORRECTED);
}

function oneShotAttempt(fx, changeRef) {
  return runAttemptCommand(fx.root, {
    id: QUEST_ID,
    frontier: FRONTIER_ID,
    changeRef,
    summary: ONE_SHOT_SUMMARY,
    _: HARNESS_NOOP,
  });
}

// The record HEAD's `solve attempt` produced during the incident: the same
// finalizeAttempt call attempt.js makes, with the base it pinned (live HEAD)
// instead of the pending step's pin. Used to seed the repair scenarios on
// both sides of the cure.
function recordOneShotAttemptAtBase(fx, changeRef, workspaceBaseCommit) {
  const ctx = makeRunContext({changeRef, summary: ONE_SHOT_SUMMARY});
  ctx.probeCtx = {...ctx.probeCtx, root: fx.root};
  ctx.honestyCtx.changeRefResolves =
    (ref) => inspectChangeArtifact(fx.root, fx.quest, ref).valid;
  ctx.honestyCtx.inspectChangeRef =
    (ref) => inspectChangeArtifact(fx.root, fx.quest, ref);
  const log = readLog(fx.root, QUEST_ID);
  const state = projectState(fx.quest, log);
  const def = fx.quest.frontiers.find((frontier) => frontier.id === FRONTIER_ID);
  const frontierState = state.frontiers.find((frontier) =>
    frontier.id === FRONTIER_ID);
  const before = evaluate(def.metric, ctx.probeCtx);
  finalizeAttempt(fx.root, fx.quest, ctx, {def, state: frontierState}, before, {
    changeRef,
    summary: ONE_SHOT_SUMMARY,
    workspaceBaseCommit,
  });
}

function lastAttemptIndex(root) {
  return readLog(root, QUEST_ID)
    .findLastIndex((event) => event.type === EVENT_ATTEMPT);
}

// The incident's opening: begin the step (pin = HEAD0), then an unrelated
// commit advances HEAD to HEAD1 while the step is pending.
function pendingStepWithAdvancedHead(t, unrelatedEdits = {[NOTES]: NOTES_UNRELATED}) {
  const fx = fixture(t);
  const pin = head(fx.root);
  assert.equal(runStep(fx.root, fx.quest).terminal, null,
    'the step begins and pins its base');
  assert.equal(stepPending(fx.root, QUEST_ID).sourceBaseCommit, pin,
    'the pending step pins the base at begin time');
  const advanced = commitUnrelated(fx.root, unrelatedEdits);
  assert.notEqual(advanced, pin, 'HEAD advanced while the step is pending');
  return {fx, pin, advanced};
}

// The full incident sequence: one-shot attempt on src/a.js (artifact taken
// against live HEAD, byte-identical at the pin), then the step commits its
// own src/b.js attempt at the pin.
function incidentSequence(t) {
  const {fx, pin, advanced} = pendingStepWithAdvancedHead(t);
  writeFile(fx.root, SOURCE_A, SOURCE_A_CANDIDATE);
  fs.writeFileSync(fx.oracleFile, JSON.stringify(ORACLE_CLOSER));
  const oneShotRef = canonicalArtifact(fx.root, 'one-shot', advanced, [SOURCE_A]);
  oneShotAttempt(fx, oneShotRef);
  const oneShotIndex = lastAttemptIndex(fx.root);
  writeFile(fx.root, SOURCE_B, SOURCE_B_CANDIDATE);
  const stepRef = canonicalArtifact(fx.root, 'step', pin, [SOURCE_B]);
  runStep(fx.root, fx.quest, {changeRef: stepRef, summary: STEP_SUMMARY});
  const stepIndex = lastAttemptIndex(fx.root);
  const log = readLog(fx.root, QUEST_ID);
  return {
    fx,
    pin,
    advanced,
    oneShotBase: log[oneShotIndex].workspaceBaseCommit,
    stepBase: log[stepIndex].workspaceBaseCommit,
    state: verificationState(fx.root, fx.quest, log),
  };
}

function incidentOutcome(t) {
  const run = incidentSequence(t);
  return {
    oneShotBaseIsPin: run.oneShotBase === run.pin,
    stepBaseIsPin: run.stepBase === run.pin,
    candidateOk: run.state.candidate.ok,
    candidateBaseIsPin: run.state.candidate.baseCommit === run.pin,
    candidateProblem: run.state.candidate.problem || null,
  };
}

// A drifted one-shot record (HEAD's behaviour) followed by the step commit at
// the pin: the log shape the repair command must realign.
function driftedSequence(t, unrelatedEdits) {
  const {fx, pin, advanced} = pendingStepWithAdvancedHead(t, unrelatedEdits);
  writeFile(fx.root, SOURCE_A, SOURCE_A_CANDIDATE);
  fs.writeFileSync(fx.oracleFile, JSON.stringify(ORACLE_CLOSER));
  const oneShotRef = canonicalArtifact(fx.root, 'one-shot', advanced, [SOURCE_A]);
  recordOneShotAttemptAtBase(fx, oneShotRef, advanced);
  const driftedIndex = lastAttemptIndex(fx.root);
  writeFile(fx.root, SOURCE_B, SOURCE_B_CANDIDATE);
  const stepRef = canonicalArtifact(fx.root, 'step', pin, [SOURCE_B]);
  runStep(fx.root, fx.quest, {changeRef: stepRef, summary: STEP_SUMMARY});
  const log = readLog(fx.root, QUEST_ID);
  assert.equal(log[driftedIndex].workspaceBaseCommit, advanced,
    'the drifted one-shot record carries the advanced HEAD');
  assert.equal(log[lastAttemptIndex(fx.root)].workspaceBaseCommit, pin,
    'the step commit carries the pin');
  return {fx, pin, advanced, driftedIndex};
}

function correctToPin(fx, attemptIndex, pin) {
  return runAttemptBaseCorrectionCommand(fx.root, {
    'id': QUEST_ID,
    'attempt-index': String(attemptIndex),
    'to-base': pin,
    'reason': 'one-shot attempt drifted from the pending-step pin',
  });
}

test('one-shot-attempt-uses-pending-step-pin: a one-shot attempt recorded ' +
  'while a step is pending is recorded against the step\'s pin, not the ' +
  'advanced HEAD', (t) => {
  const run = incidentSequence(t);
  assert.equal(run.oneShotBase, run.pin,
    'the one-shot attempt reads the pending step\'s pin as its base');
  assert.notEqual(run.oneShotBase, run.advanced,
    'the one-shot attempt never re-pins from the advanced HEAD');
  assert.equal(run.stepBase, run.pin, 'the step commit keeps its pin');
});

test('pending-step-attempts-share-one-base: after the incident sequence ' +
  'the landing candidate has one recorded common base and its aggregate ' +
  'fingerprint can be built', (t) => {
  const run = incidentSequence(t);
  assert.equal(run.state.candidate.ok, true,
    'the landing candidate (review envelope) fingerprint is constructible');
  assert.equal(run.state.candidate.baseCommit, run.pin,
    'the common base is the pending step\'s pin');
  assert.deepEqual(run.state.candidate.paths, [SOURCE_A, SOURCE_B]);
  assert.equal(run.state.aggregate.ok, true);
  assert.equal(run.state.aggregate.baseCommit, run.pin);
  assert.deepEqual(run.state.attemptBaseCorrectionProblems, []);
  assert.doesNotMatch(String(run.state.candidate.problem || ''),
    COMMON_BASE_PROBLEM, 'no mixed-base candidate problem is reported');
});

test('correct-attempt-base-repairs-pending-pin-drift: an attempt whose base ' +
  'drifted from the pending pin is realigned append-only to the sibling ' +
  'recorded base when the delta is byte-identical at both bases', (t) => {
  const {fx, pin, advanced, driftedIndex} = driftedSequence(t);
  const before = verificationState(fx.root, fx.quest, readLog(fx.root, QUEST_ID));
  assert.equal(before.candidate.ok, false);
  assert.match(String(before.candidate.problem), COMMON_BASE_PROBLEM,
    'the drifted record leaves the candidate without a common base');
  const outcome = correctToPin(fx, driftedIndex, pin);
  assert.match(outcome, CORRECTED_PATTERN);
  assert.ok(outcome.includes(`(${SIBLING_AUTHORIZATION})`),
    'the correction names its typed authorization');
  const log = readLog(fx.root, QUEST_ID);
  assert.equal(log[driftedIndex].workspaceBaseCommit, advanced,
    'the original attempt event is never rewritten');
  const corrections = correctionEvents(fx.root);
  assert.equal(corrections.length, 1);
  assert.equal(corrections[0].fromBase, advanced);
  assert.equal(corrections[0].toBase, pin);
  const after = verificationState(fx.root, fx.quest, log);
  assert.deepEqual(after.attemptBaseCorrectionProblems, []);
  assert.equal(after.candidate.ok, true);
  assert.equal(after.candidate.baseCommit, pin);
  assert.equal(after.aggregate.baseCommit, pin);
  assert.equal(after.attempts.find((attempt) => attempt.index === driftedIndex)
    .event.workspaceBaseCommit, pin,
  'verification consumers use the corrected base');
});

test('correct-attempt-base-refuses-non-identical-delta: when the inter-base ' +
  'range touched an attempt path the repair fails closed with the typed ' +
  'delta reason and appends nothing', (t) => {
  const {fx, pin, driftedIndex} = driftedSequence(t, {
    [SOURCE_A]: SOURCE_A_UNRELATED_COMMIT,
  });
  assert.throws(() => correctToPin(fx, driftedIndex, pin), (error) =>
    TARGET_DELTA_PROBLEM.test(error.message) &&
    !REJECTION_AUTHORITY_PROBLEM.test(error.message),
  'the refusal names the non-identical target-base delta, not a missing ' +
  'rejection');
  assert.deepEqual(correctionEvents(fx.root), [],
    'a refused correction appends no event');
  const state = verificationState(fx.root, fx.quest, readLog(fx.root, QUEST_ID));
  assert.equal(state.candidate.ok, false,
    'the candidate stays without a common base until an honest replacement');
  assert.match(String(state.candidate.problem), COMMON_BASE_PROBLEM);
});

test('attempt-base-without-pending-step-unchanged: with no pending step a ' +
  'one-shot attempt pins the live HEAD and a later one keeps the epoch base', (t) => {
  const fx = fixture(t);
  const first = head(fx.root);
  writeFile(fx.root, SOURCE_A, SOURCE_A_CANDIDATE);
  fs.writeFileSync(fx.oracleFile, JSON.stringify(ORACLE_CLOSER));
  oneShotAttempt(fx, canonicalArtifact(fx.root, 'first', first, [SOURCE_A]));
  const advanced = commitUnrelated(fx.root, {[NOTES]: NOTES_UNRELATED});
  writeFile(fx.root, SOURCE_B, SOURCE_B_CANDIDATE);
  oneShotAttempt(fx, canonicalArtifact(fx.root, 'second', first, [SOURCE_B]));
  const bases = attemptEvents(fx.root).map((event) => event.workspaceBaseCommit);
  assert.deepEqual(bases, [first, first],
    'the first attempt pins HEAD; the second retains the epoch base');
  assert.notEqual(advanced, first);
  const state = verificationState(fx.root, fx.quest, readLog(fx.root, QUEST_ID));
  assert.equal(state.candidate.ok, true);
  assert.equal(state.candidate.baseCommit, first);
});

test('rejection-base-correction-unchanged: a replacement attempt pinned off ' +
  'the standing candidate-rejection base is still corrected to that base', (t) => {
  const fx = fixture(t);
  const rejectedBase = head(fx.root);
  runStep(fx.root, fx.quest);
  writeFile(fx.root, SOURCE_A, SOURCE_A_CANDIDATE);
  fs.writeFileSync(fx.oracleFile, JSON.stringify(ORACLE_CLOSER));
  runStep(fx.root, fx.quest, {
    changeRef: canonicalArtifact(fx.root, 'rejected', rejectedBase, [SOURCE_A]),
    summary: 'rejected attempt',
  });
  const candidate = verificationState(
    fx.root, fx.quest, readLog(fx.root, QUEST_ID)).candidate;
  appendFinding(fx.root, QUEST_ID, {
    frontier: FRONTIER_ID,
    kind: VERIFIER_REJECTION,
    claim: 'exact candidate rejected',
    evidence: VERIFIER_EVIDENCE,
    verification: {
      schemaVersion: VERIFICATION_SCHEMA_VERSION,
      scope: CANDIDATE_SCOPE,
      fingerprint: candidate.fingerprint,
      baseCommit: candidate.baseCommit,
      paths: candidate.paths,
      sourcePaths: candidate.sourcePaths,
      firstAttemptIndex: candidate.firstAttemptIndex,
      lastAttemptIndex: candidate.lastAttemptIndex,
      verdict: VERDICT_REJECTED,
    },
  });
  const wrongBase = commitUnrelated(fx.root, {[NOTES]: NOTES_UNRELATED});
  writeFile(fx.root, SOURCE_A, SOURCE_A_CANDIDATE);
  writeFile(fx.root, SOURCE_B, SOURCE_B_CANDIDATE);
  const replacementRef =
    canonicalArtifact(fx.root, 'replacement', wrongBase, [SOURCE_A, SOURCE_B]);
  // The incident-era record: a replacement recorded at the advanced HEAD.
  recordOneShotAttemptAtBase(fx, replacementRef, wrongBase);
  const replacementIndex = lastAttemptIndex(fx.root);
  const outcome = correctToPin(fx, replacementIndex, rejectedBase);
  assert.match(outcome, CORRECTED_PATTERN);
  assert.ok(!outcome.includes(`(${SIBLING_AUTHORIZATION})`) ||
    outcome.includes(`(${REJECTION_AUTHORIZATION})`),
  'the standing rejection authorization is still the first rule applied');
  const state = verificationState(fx.root, fx.quest, readLog(fx.root, QUEST_ID));
  assert.equal(state.candidate.ok, true);
  assert.equal(state.candidate.baseCommit, rejectedBase);
});

test('witness-deterministic: two identical incident fixtures record the ' +
  'identical base outcome', (t) => {
  const first = incidentOutcome(t);
  const second = incidentOutcome(t);
  assert.deepEqual(first, second,
    'the recorded bases are a pure function of the pending step and the log');
  assert.equal(first.stepBaseIsPin, true, 'the step commit always keeps its pin');
});
