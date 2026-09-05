import tap from 'tap';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

import {runRebaseEpochCommand} from '../../scripts/solve/epoch-rebase.js';
import {resolveStepBaseCommit} from '../../scripts/solve/pending-step.js';
import {buildNextProjection} from '../../scripts/solve/next.js';
import {runStep, stepAbort} from '../../scripts/solve/step.js';
import {appendFinding, readLog, saveQuest} from '../../scripts/solve/store.js';
import {
  VERIFICATION_CONTRACT_VERSION,
  activeSourceEpoch,
  verificationState,
} from '../../scripts/solve/verification.js';

// rebase-epoch (solver-streamlining P2): when main lands a commit that
// touches the active epoch's reviewed paths, the boundary is recorded
// instead of resealing. The retired epoch's attempts stay reported but never
// count; a covering attempt at the new base is demanded over every retired
// path; a standing rejection transfers to the live-base coverage rule; and
// the verb refuses every unsafe shape without running a git write.

const QUEST_ID = 'runtime-rebase';
const FRONTIER = `${QUEST_ID}-main`;
const SOURCE_A = 'src/a.js';
const SOURCE_B = 'src/b.js';
const REMOTE_MAIN = 'refs/remotes/origin/main';

function git(root, args) {
  return execFileSync('git', args, {cwd: root, encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']}).trim();
}

function fixture(questOverrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'epoch-rebase-'));
  git(root, ['init']);
  git(root, ['config', 'user.email', 'solver@example.com']);
  git(root, ['config', 'user.name', 'Solver']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  fs.mkdirSync(path.join(root, 'src'), {recursive: true});
  fs.writeFileSync(path.join(root, SOURCE_A), 'export const a = 1;\n');
  fs.writeFileSync(path.join(root, SOURCE_B), 'export const b = 1;\n');
  const registry = path.join(root, 'test', 'shards', 'impact-contracts.json');
  fs.mkdirSync(path.dirname(registry), {recursive: true});
  fs.writeFileSync(registry, `${JSON.stringify({schemaVersion: 2,
    id: 'impact-contracts', description: 'fixture', contracts: {},
    coupledPairs: {}}, null, 2)}\n`);
  git(root, ['add', '-A']);
  git(root, ['commit', '-m', 'base']);
  const oracle = path.join(root, 'oracle.json');
  fs.writeFileSync(oracle, JSON.stringify({metric: 2, target: 0}));
  const quest = {
    id: QUEST_ID,
    statement: 'The runtime rebase fixture reaches zero.',
    priority: 1,
    class: 'product',
    links: {specRef: 'solve/specs/runtime-rebase.md'},
    doneWhen: {probe: 'oracle', args: {file: oracle}},
    frontiers: [{id: FRONTIER, priority: 1,
      metric: {probe: 'oracle', args: {file: oracle}}}],
    constraints: [],
    ...questOverrides,
  };
  saveQuest(root, quest);
  return {root, quest, oracle};
}

// Records one attempt writing `[path, value]` pairs; the changeRef covers
// exactly the written paths.
function recordAttemptOver({root, quest, oracle}, name, writes) {
  runStep(root, quest);
  const base = pinnedBase(root, quest);
  for (const [filePath, value] of writes) {
    const symbol = path.basename(filePath, '.js');
    fs.writeFileSync(path.join(root, filePath),
      `export const ${symbol} = ${value};\n`);
  }
  fs.writeFileSync(oracle, JSON.stringify({metric: 1, target: 0}));
  return runStep(root, quest, {
    changeRef: canonicalDiffOver(root, quest, base, writes.map(([p]) => p), name),
    summary: `${name} source change`,
  });
}

function canonicalDiffOver(root, quest, baseCommit, paths, name) {
  const content = execFileSync('git', ['diff', '--binary', '--full-index',
    '--no-ext-diff', baseCommit, '--', ...paths], {cwd: root,
    encoding: 'utf8'});
  const file = path.join(root, 'solve', 'changes', quest.id, `${name}.diff`);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, content);
  return `diff:${path.relative(root, file)}`;
}

function candidateReceipt(candidate) {
  return {
    schemaVersion: VERIFICATION_CONTRACT_VERSION,
    scope: 'candidate',
    fingerprint: candidate.fingerprint,
    baseCommit: candidate.baseCommit,
    paths: candidate.paths,
    sourcePaths: candidate.sourcePaths,
    firstAttemptIndex: candidate.firstAttemptIndex,
    lastAttemptIndex: candidate.lastAttemptIndex,
  };
}

function rejectCandidate(root, quest, candidate) {
  return appendFinding(root, quest.id, {
    frontier: FRONTIER,
    kind: 'verifier-rejection',
    claim: 'independent landing verification rejected the candidate',
    evidence: 'subagent:candidate-verifier',
    verification: {...candidateReceipt(candidate), verdict: 'rejected'},
  });
}

function approveCandidate(root, quest) {
  const candidate = verificationState(root, quest, readLog(root, quest.id))
    .candidate;
  return appendFinding(root, quest.id, {
    frontier: FRONTIER,
    kind: 'verifier-approval',
    claim: 'independent landing verification passed',
    evidence: 'subagent:candidate-verifier',
    verification: candidateReceipt(candidate),
  });
}

function canonicalDiff(root, quest, baseCommit, changedPath, name) {
  const content = execFileSync('git', ['diff', '--binary', '--full-index',
    '--no-ext-diff', baseCommit, '--', changedPath], {cwd: root,
    encoding: 'utf8'});
  const file = path.join(root, 'solve', 'changes', quest.id, `${name}.diff`);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, content);
  return `diff:${path.relative(root, file)}`;
}

function pinnedBase(root, quest) {
  return JSON.parse(fs.readFileSync(
    path.join(root, 'solve', 'state', `${quest.id}.pending.json`), 'utf8'))
    .headCommit;
}

function recordAttempt({root, quest, oracle}, metric, name, value) {
  runStep(root, quest);
  const base = pinnedBase(root, quest);
  fs.writeFileSync(path.join(root, SOURCE_A), `export const a = ${value};\n`);
  fs.writeFileSync(oracle, JSON.stringify({metric, target: 0}));
  return runStep(root, quest, {
    changeRef: canonicalDiff(root, quest, base, SOURCE_A, name),
    summary: `${name} source change`,
  });
}

function latestAttempt(root, quest) {
  return [...readLog(root, quest.id)].reverse()
    .find((event) => event.type === 'attempt');
}

function reject(root, quest, fingerprint) {
  return appendFinding(root, quest.id, {
    frontier: FRONTIER,
    kind: 'verifier-rejection',
    claim: 'independent verification rejected this exact source attempt',
    evidence: 'subagent:rejection-verifier',
    verification: {schemaVersion: 1, scope: 'attempt', fingerprint,
      verdict: 'rejected'},
  });
}

function approve(root, quest, fingerprint) {
  return appendFinding(root, quest.id, {
    frontier: FRONTIER,
    kind: 'verifier-approval',
    claim: 'independent attempt verification passed',
    evidence: 'subagent:attempt-verifier',
    verification: {schemaVersion: 1, scope: 'attempt', fingerprint},
  });
}

// Main lands a commit touching the reviewed path; origin/main records it.
function driftMain(root, value = 99) {
  fs.writeFileSync(path.join(root, SOURCE_A), `export const a = ${value};\n`);
  git(root, ['commit', '-am', 'main lands a change to src/a.js']);
  git(root, ['update-ref', REMOTE_MAIN, 'HEAD']);
  return git(root, ['rev-parse', 'HEAD']);
}

function rebase(root, quest, to) {
  return runRebaseEpochCommand(root, {id: quest.id, to,
    reason: 'main landed the same path; the epoch must move'});
}

tap.test('rebase-epoch', async (t) => {
  t.test('retires the epoch and demands a covering attempt at the new base',
    (t) => {
      const fx = fixture();
      recordAttempt(fx, 1, 'first', 2);
      const fromBase = activeSourceEpoch(fx.root, fx.quest,
        readLog(fx.root, fx.quest.id)).baseCommit;
      // Restore the working tree to the committed bytes before main drifts.
      git(fx.root, ['checkout', '--', SOURCE_A]);
      const head = driftMain(fx.root);
      t.throws(() => runStep(fx.root, fx.quest),
        /source epoch changed reviewed path/iu, 'drift refuses the next step');
      const message = rebase(fx.root, fx.quest, 'HEAD');
      t.match(message, /1 attempt\(s\) retired/u);
      const log = readLog(fx.root, fx.quest.id);
      const event = log.at(-1);
      t.equal(event.type, 'epoch-rebased');
      t.equal(event.fromBase, fromBase);
      t.equal(event.toBase, head);
      t.same(event.retiredPaths, [SOURCE_A]);
      t.same(event.driftPaths, [SOURCE_A]);
      const state = verificationState(fx.root, fx.quest, log);
      t.equal(state.retiredAttempts.length, 1, 'the attempt is retired');
      t.same(state.epochRebase.missingPaths, [SOURCE_A]);
      t.match(state.attemptProblems.map((p) => p.message).join('\n'),
        /epoch rebase requires a covering attempt at .* over: src\/a\.js/u);
      t.equal(state.aggregate.fingerprint, null,
        'retired attempts anchor nothing');
      const next = buildNextProjection(fx.root, fx.quest.id);
      t.equal(next.action.code, 'replace-rejected-attempt');
      t.same(next.action.payload.bases, [head]);
      t.same(next.action.payload.requiredPaths, [SOURCE_A]);
      // The covering attempt pins at the rebased base and clears the obligation.
      recordAttempt(fx, 1, 'covering', 3);
      const covered = verificationState(fx.root, fx.quest,
        readLog(fx.root, fx.quest.id));
      t.same(covered.epochRebase.missingPaths, []);
      t.equal(covered.aggregate.baseCommit, head,
        'the aggregate anchors at the new base only');
      t.same(covered.aggregate.paths, [SOURCE_A]);
      t.equal(covered.pendingAttempts.length, 1,
        'only the covering attempt awaits verification');
      t.equal(latestAttempt(fx.root, fx.quest).workspaceBaseCommit, head);
      fs.rmSync(fx.root, {recursive: true, force: true});
      t.end();
    });

  t.test('a standing rejection transfers to the new base and still needs ' +
    'its own approval', (t) => {
    const fx = fixture();
    recordAttempt(fx, 1, 'rejected', 2);
    const rejected = latestAttempt(fx.root, fx.quest);
    const rejectedFingerprint = `sha256:${rejected.changeRefIdentity.sha256}`;
    reject(fx.root, fx.quest, rejectedFingerprint);
    git(fx.root, ['checkout', '--', SOURCE_A]);
    const head = driftMain(fx.root);
    rebase(fx.root, fx.quest, 'HEAD');
    let state = verificationState(fx.root, fx.quest,
      readLog(fx.root, fx.quest.id));
    t.equal(state.unresolvedRejectedAttempts.length, 1,
      'the rejection still binds after the rebase');
    t.equal(state.unresolvedRejectedAttempts[0].retired, true);
    t.match(state.attemptProblems.map((p) => p.message).join('\n'),
      /retired by rebase-epoch/u);
    // The replacement pins at HEAD, covers the rejected path, and resolves
    // only with its own exact approval.
    recordAttempt(fx, 1, 'replacement', 3);
    const replacement = latestAttempt(fx.root, fx.quest);
    t.equal(replacement.workspaceBaseCommit, head,
      'the replacement pins at the rebased base, not the retired one');
    state = verificationState(fx.root, fx.quest, readLog(fx.root, fx.quest.id));
    t.equal(state.unresolvedRejectedAttempts.length, 1,
      'covering paths alone does not clear the rejection');
    approve(fx.root, fx.quest, `sha256:${replacement.changeRefIdentity.sha256}`);
    state = verificationState(fx.root, fx.quest, readLog(fx.root, fx.quest.id));
    t.equal(state.unresolvedRejectedAttempts.length, 0);
    t.equal(state.resolvedRejectedAttempts.length, 1);
    fs.rmSync(fx.root, {recursive: true, force: true});
    t.end();
  });

  t.test('a candidate-scope rejection under the current contract survives ' +
    'the rebase and resolves only through a covering, changed candidate ' +
    'with its own approval', (t) => {
    const fx = fixture({verificationContractVersion: VERIFICATION_CONTRACT_VERSION});
    recordAttemptOver(fx, 'first', [[SOURCE_A, 2], [SOURCE_B, 2]]);
    const candidate = verificationState(fx.root, fx.quest,
      readLog(fx.root, fx.quest.id)).candidate;
    t.ok(candidate.fingerprint, 'a candidate-contract attempt is recorded');
    rejectCandidate(fx.root, fx.quest, candidate);
    git(fx.root, ['checkout', '--', SOURCE_A, SOURCE_B]);
    driftMain(fx.root);
    rebase(fx.root, fx.quest, 'HEAD');
    let state = verificationState(fx.root, fx.quest, readLog(fx.root, fx.quest.id));
    t.ok(state.unresolvedCandidateRejection,
      'the candidate rejection still binds after the rebase');
    // A partial cover (a only) with its own approval does not discharge it.
    recordAttemptOver(fx, 'partial', [[SOURCE_A, 3]]);
    approveCandidate(fx.root, fx.quest);
    state = verificationState(fx.root, fx.quest, readLog(fx.root, fx.quest.id));
    t.ok(state.unresolvedCandidateRejection,
      'a non-superset replacement leaves the rejection standing');
    // A full cover with changed bytes and its own approval discharges it.
    recordAttemptOver(fx, 'cover', [[SOURCE_A, 4], [SOURCE_B, 4]]);
    approveCandidate(fx.root, fx.quest);
    state = verificationState(fx.root, fx.quest, readLog(fx.root, fx.quest.id));
    t.equal(state.unresolvedCandidateRejection, null,
      'the path-superset, changed-fingerprint candidate resolves it');
    t.same(state.epochRebase.missingPaths, []);
    fs.rmSync(fx.root, {recursive: true, force: true});
    t.end();
  });

  t.test('a rejection discharged before a Solver checkpoint stays discharged ' +
    'and the next step pins at HEAD', (t) => {
    const fx = fixture({verificationContractVersion: VERIFICATION_CONTRACT_VERSION});
    recordAttemptOver(fx, 'first', [[SOURCE_A, 2]]);
    const candidate = verificationState(fx.root, fx.quest,
      readLog(fx.root, fx.quest.id)).candidate;
    rejectCandidate(fx.root, fx.quest, candidate);
    recordAttemptOver(fx, 'cover', [[SOURCE_A, 3]]);
    approveCandidate(fx.root, fx.quest);
    let state = verificationState(fx.root, fx.quest, readLog(fx.root, fx.quest.id));
    t.equal(state.unresolvedCandidateRejection, null, 'discharged before checkpoint');
    git(fx.root, ['add', '-A']);
    git(fx.root, ['commit', '-m', `checkpoint(quest): ${QUEST_ID}: milestone`]);
    state = verificationState(fx.root, fx.quest, readLog(fx.root, fx.quest.id));
    t.equal(state.unresolvedCandidateRejection, null,
      'the checkpoint does not resurrect the discharged rejection');
    t.equal(state.candidate.fingerprint, null, 'the new epoch has no candidate yet');
    t.equal(resolveStepBaseCommit(fx.root, fx.quest,
      readLog(fx.root, fx.quest.id), FRONTIER), git(fx.root, ['rev-parse', 'HEAD']),
    'the next step pins at HEAD, not the pre-checkpoint base');
    fs.rmSync(fx.root, {recursive: true, force: true});
    t.end();
  });

  t.test('a rebase in a later epoch never reopens a rejection discharged ' +
    'before the checkpoint (checkpoint then rebase)', (t) => {
    const fx = fixture({verificationContractVersion: VERIFICATION_CONTRACT_VERSION});
    recordAttemptOver(fx, 'first', [[SOURCE_A, 2]]);
    rejectCandidate(fx.root, fx.quest, verificationState(fx.root, fx.quest,
      readLog(fx.root, fx.quest.id)).candidate);
    recordAttemptOver(fx, 'cover', [[SOURCE_A, 3]]);
    approveCandidate(fx.root, fx.quest);
    git(fx.root, ['add', '-A']);
    git(fx.root, ['commit', '-m', `checkpoint(quest): ${QUEST_ID}: milestone`]);
    // Epoch 2: an attempt over b, then main lands b and the epoch is rebased.
    recordAttemptOver(fx, 'epoch2', [[SOURCE_B, 2]]);
    git(fx.root, ['checkout', '--', SOURCE_B]);
    fs.writeFileSync(path.join(fx.root, SOURCE_B), 'export const b = 99;\n');
    git(fx.root, ['commit', '-am', 'main lands b']);
    git(fx.root, ['update-ref', REMOTE_MAIN, 'HEAD']);
    rebase(fx.root, fx.quest, 'HEAD');
    const state = verificationState(fx.root, fx.quest, readLog(fx.root, fx.quest.id));
    t.equal(state.unresolvedCandidateRejection, null,
      'the epoch-1 rejection stays discharged');
    t.same(state.epochRebase.missingPaths, [SOURCE_B], 'only b is owed');
    t.equal(resolveStepBaseCommit(fx.root, fx.quest,
      readLog(fx.root, fx.quest.id), FRONTIER), git(fx.root, ['rev-parse', 'HEAD']),
    'the next step pins at HEAD');
    fs.rmSync(fx.root, {recursive: true, force: true});
    t.end();
  });

  t.test('a rejection transferred by a rebase, then covered, approved, and ' +
    'checkpointed, is not owed again in the next epoch', (t) => {
    const fx = fixture({verificationContractVersion: VERIFICATION_CONTRACT_VERSION});
    recordAttemptOver(fx, 'first', [[SOURCE_A, 2]]);
    rejectCandidate(fx.root, fx.quest, verificationState(fx.root, fx.quest,
      readLog(fx.root, fx.quest.id)).candidate);
    git(fx.root, ['checkout', '--', SOURCE_A]);
    driftMain(fx.root);
    rebase(fx.root, fx.quest, 'HEAD');
    recordAttemptOver(fx, 'cover', [[SOURCE_A, 3]]);
    approveCandidate(fx.root, fx.quest);
    git(fx.root, ['add', '-A']);
    git(fx.root, ['commit', '-m', `checkpoint(quest): ${QUEST_ID}: epoch one`]);
    recordAttemptOver(fx, 'epoch2', [[SOURCE_B, 2]]);
    const state = verificationState(fx.root, fx.quest, readLog(fx.root, fx.quest.id));
    t.equal(state.unresolvedCandidateRejection, null, 'no resurrection');
    t.same(state.epochRebase.missingPaths, [],
      'the covered retired path is not owed in the next epoch');
    t.same(state.candidate.paths, [SOURCE_B], 'epoch 2 has its own candidate');
    fs.rmSync(fx.root, {recursive: true, force: true});
    t.end();
  });

  t.test('the covering obligation accumulates across a second rebase', (t) => {
    const fx = fixture();
    recordAttemptOver(fx, 'first', [[SOURCE_A, 2], [SOURCE_B, 2]]);
    git(fx.root, ['checkout', '--', SOURCE_A, SOURCE_B]);
    driftMain(fx.root);
    rebase(fx.root, fx.quest, 'HEAD');
    recordAttemptOver(fx, 'cover-a', [[SOURCE_A, 3]]);
    let state = verificationState(fx.root, fx.quest, readLog(fx.root, fx.quest.id));
    t.same(state.epochRebase.missingPaths, [SOURCE_B], 'b is still owed');
    git(fx.root, ['checkout', '--', SOURCE_A]);
    driftMain(fx.root, 100);
    rebase(fx.root, fx.quest, 'HEAD');
    state = verificationState(fx.root, fx.quest, readLog(fx.root, fx.quest.id));
    t.same(state.epochRebase.missingPaths, [SOURCE_A, SOURCE_B],
      'the second rebase owes a again and still owes b');
    recordAttemptOver(fx, 'cover-a2', [[SOURCE_A, 4]]);
    state = verificationState(fx.root, fx.quest, readLog(fx.root, fx.quest.id));
    t.same(state.epochRebase.missingPaths, [SOURCE_B],
      'b cannot be dropped by the second boundary');
    fs.rmSync(fx.root, {recursive: true, force: true});
    t.end();
  });

  t.test('refuses a landed quest', (t) => {
    const fx = fixture();
    recordAttemptOver(fx, 'first', [[SOURCE_A, 2]]);
    git(fx.root, ['add', '-A']);
    git(fx.root, ['commit', '-m', `${QUEST_ID}: landed the fixture`]);
    driftMain(fx.root);
    t.throws(() => rebase(fx.root, fx.quest, 'HEAD'), /already landed/u);
    fs.rmSync(fx.root, {recursive: true, force: true});
    t.end();
  });

  t.test('refuses a pending step, an empty range, a non-HEAD target, and a ' +
    'base off origin/main', (t) => {
    const fx = fixture();
    recordAttempt(fx, 1, 'first', 2);
    git(fx.root, ['checkout', '--', SOURCE_A]);
    const base = git(fx.root, ['rev-parse', 'HEAD']);
    git(fx.root, ['update-ref', REMOTE_MAIN, base]);
    runStep(fx.root, fx.quest);
    t.throws(() => rebase(fx.root, fx.quest, 'HEAD'), /a step is pending/u);
    stepAbort(fx.root, fx.quest.id);
    t.throws(() => rebase(fx.root, fx.quest, 'HEAD'),
      /nothing to rebase/u, 'HEAD is still the epoch base');
    fs.writeFileSync(path.join(fx.root, SOURCE_A), 'export const a = 99;\n');
    git(fx.root, ['commit', '-am', 'local-only drift']);
    t.throws(() => rebase(fx.root, fx.quest, base),
      /--to must be the current HEAD/u);
    t.throws(() => rebase(fx.root, fx.quest, 'HEAD'),
      /not an ancestor of refs\/remotes\/origin\/main/u,
      'a local-only commit cannot retire an epoch');
    git(fx.root, ['update-ref', '-d', REMOTE_MAIN]);
    t.throws(() => rebase(fx.root, fx.quest, 'HEAD'),
      /origin\/main is not recorded/u, 'no remote ref means no rebase');
    t.equal(readLog(fx.root, fx.quest.id).some((event) =>
      event.type === 'epoch-rebased'), false, 'no boundary was recorded');
    fs.rmSync(fx.root, {recursive: true, force: true});
    t.end();
  });
});
