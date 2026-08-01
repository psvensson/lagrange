import tap from 'tap';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

import {appendFinding, readLog, saveQuest}
  from '../../scripts/solve/store.js';
import {runStep} from '../../scripts/solve/step.js';
import {ensureSealedGoal} from '../../scripts/solve/loop.js';
import {verificationState} from '../../scripts/solve/verification.js';
import {runInheritCandidateCommand}
  from '../../scripts/solve/inherit-candidate.js';

function git(root, args) {
  return execFileSync('git', args,
    {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'inherit-candidate-'));
  git(root, ['init']);
  git(root, ['config', 'user.email', 'solver@example.com']);
  git(root, ['config', 'user.name', 'Solver']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  fs.mkdirSync(path.join(root, 'src'), {recursive: true});
  fs.writeFileSync(path.join(root, 'src', 'a.js'), 'export const a = 1;\n');
  git(root, ['add', '-A']);
  git(root, ['commit', '-m', 'base']);
  return root;
}

function questFor(root, id, oracle) {
  return {
    id,
    statement: `${id} reaches zero.`,
    priority: 1,
    verificationContractVersion: 2,
    doneWhen: {probe: 'oracle', args: {file: oracle}},
    frontiers: [{
      id: `${id}-main`,
      priority: 1,
      metric: {probe: 'oracle', args: {file: oracle}},
    }],
  };
}

function recordVerifiedAttempt(root, quest) {
  const pending = runStep(root, quest);
  fs.writeFileSync(path.join(root, 'src', 'a.js'), 'export const a = 2;\n');
  fs.writeFileSync(quest.doneWhen.args.file,
    JSON.stringify({metric: 1, target: 0}));
  const baseCommit = JSON.parse(fs.readFileSync(
    path.join(root, 'solve', 'state', `${quest.id}.pending.json`), 'utf8'),
  ).headCommit;
  const content = git(root, ['diff', '--binary', '--full-index',
    '--no-ext-diff', baseCommit, '--', 'src/a.js']);
  const file = path.join(root, 'solve', 'changes', quest.id, 'attempt-1.diff');
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, content);
  const result = runStep(root, quest, {
    changeRef: `diff:${path.relative(root, file)}`,
    summary: 'source change',
  });
  return {result, pending};
}

function approveCandidate(root, quest) {
  const state = verificationState(root, quest, readLog(root, quest.id));
  const candidate = state.candidate;
  appendFinding(root, quest.id, {
    frontier: `${quest.id}-main`,
    kind: 'verifier-approval',
    claim: 'independent candidate verification passed',
    evidence: 'subagent:candidate-verifier',
    verification: {
      schemaVersion: 2,
      scope: 'candidate',
      fingerprint: candidate.fingerprint,
      baseCommit: candidate.baseCommit,
      paths: [...candidate.paths].sort(),
      sourcePaths: [...(candidate.sourcePaths || [])].sort(),
      firstAttemptIndex: candidate.firstAttemptIndex,
      lastAttemptIndex: candidate.lastAttemptIndex,
    },
  });
  return candidate;
}

tap.test('inherit-candidate', async (t) => {
  t.test('re-records the approved parent candidate into the successor', (t) => {
    const root = fixture();
    const parentOracle = path.join(root, 'parent-oracle.json');
    fs.writeFileSync(parentOracle, JSON.stringify({metric: 2, target: 0}));
    const parent = questFor(root, 'parent-quest', parentOracle);
    saveQuest(root, parent);
    recordVerifiedAttempt(root, parent);
    const parentCandidate = approveCandidate(root, parent);
    t.ok(parentCandidate.fingerprint, 'parent candidate approved');

    const childOracle = path.join(root, 'child-oracle.json');
    fs.writeFileSync(childOracle, JSON.stringify({metric: 2, target: 0}));
    const child = questFor(root, 'child-quest', childOracle);
    saveQuest(root, child);
    ensureSealedGoal(root, child);

    const message = runInheritCandidateCommand(root,
      {id: child.id, from: parent.id});
    t.match(message, /inherited 1 attempt\(s\)/u);

    const childState = verificationState(root, child,
      readLog(root, child.id));
    t.ok(childState.candidate.ok, 'child candidate coherent');
    t.equal(childState.candidate.fingerprint, parentCandidate.fingerprint,
      'byte-identical fingerprint');
    t.ok(childState.candidateApproval,
      'inherited approval satisfies the child candidate projection');
    t.equal(childState.candidateApproval.event.inherited.fromQuest,
      parent.id, 'approval is provenance-marked');
    const attempt = readLog(root, child.id)
      .find((event) => event.type === 'attempt');
    t.equal(attempt.inherited.fromQuest, parent.id,
      'attempt is provenance-marked');
    t.equal(attempt.frontier, 'child-quest-main',
      'frontier remapped to the successor');
    t.equal(
      attempt.changeRefIdentity.path,
      attempt.changeRef.slice('diff:'.length),
      'artifact integrity receipt is rebound to the successor copy',
    );

    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('post-approval tree divergence refuses inheritance cleanly', (t) => {
    const root = fixture();
    const parentOracle = path.join(root, 'parent-oracle.json');
    fs.writeFileSync(parentOracle, JSON.stringify({metric: 2, target: 0}));
    const parent = questFor(root, 'parent-quest', parentOracle);
    saveQuest(root, parent);
    recordVerifiedAttempt(root, parent);
    approveCandidate(root, parent);
    // One byte diverges after the approval: the live-tree fingerprint no
    // longer matches the approved one.
    fs.appendFileSync(path.join(root, 'src', 'a.js'), '// drift\n');

    const childOracle = path.join(root, 'child-oracle.json');
    fs.writeFileSync(childOracle, JSON.stringify({metric: 2, target: 0}));
    const child = questFor(root, 'child-quest', childOracle);
    saveQuest(root, child);
    ensureSealedGoal(root, child);

    t.throws(() => runInheritCandidateCommand(root,
      {id: child.id, from: parent.id}),
    /diverged|no verifier approval/u, 'divergence forces fresh verification');
    t.equal(readLog(root, child.id).filter((event) =>
      event.type === 'attempt').length, 0,
    'no dangling attempts were appended');

    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('a second run and a non-empty successor are refused', (t) => {
    const root = fixture();
    const parentOracle = path.join(root, 'parent-oracle.json');
    fs.writeFileSync(parentOracle, JSON.stringify({metric: 2, target: 0}));
    const parent = questFor(root, 'parent-quest', parentOracle);
    saveQuest(root, parent);
    recordVerifiedAttempt(root, parent);
    approveCandidate(root, parent);

    const childOracle = path.join(root, 'child-oracle.json');
    fs.writeFileSync(childOracle, JSON.stringify({metric: 2, target: 0}));
    const child = questFor(root, 'child-quest', childOracle);
    saveQuest(root, child);
    ensureSealedGoal(root, child);
    runInheritCandidateCommand(root, {id: child.id, from: parent.id});

    t.throws(() => runInheritCandidateCommand(root,
      {id: child.id, from: parent.id}),
    /already has recorded attempts/u, 'inheritance is not repeatable');
    t.equal(readLog(root, child.id).filter((event) =>
      event.type === 'attempt').length, 1, 'no duplicated attempts');

    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('an unapproved parent candidate refuses inheritance', (t) => {
    const root = fixture();
    const parentOracle = path.join(root, 'parent-oracle.json');
    fs.writeFileSync(parentOracle, JSON.stringify({metric: 2, target: 0}));
    const parent = questFor(root, 'parent-quest', parentOracle);
    saveQuest(root, parent);
    recordVerifiedAttempt(root, parent);

    const childOracle = path.join(root, 'child-oracle.json');
    fs.writeFileSync(childOracle, JSON.stringify({metric: 2, target: 0}));
    const child = questFor(root, 'child-quest', childOracle);
    saveQuest(root, child);
    ensureSealedGoal(root, child);

    t.throws(() => runInheritCandidateCommand(root,
      {id: child.id, from: parent.id}),
    /no verifier approval/u);
    t.equal(readLog(root, child.id).filter((event) =>
      event.type === 'attempt').length, 0, 'nothing was copied');

    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('an undeclared successor refuses inheritance', (t) => {
    const root = fixture();
    const parentOracle = path.join(root, 'parent-oracle.json');
    fs.writeFileSync(parentOracle, JSON.stringify({metric: 2, target: 0}));
    const parent = questFor(root, 'parent-quest', parentOracle);
    saveQuest(root, parent);
    const childOracle = path.join(root, 'child-oracle.json');
    fs.writeFileSync(childOracle, JSON.stringify({metric: 2, target: 0}));
    const child = questFor(root, 'child-quest', childOracle);
    saveQuest(root, child);
    t.throws(() => runInheritCandidateCommand(root,
      {id: child.id, from: parent.id}), /not sealed yet/u);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });
});
