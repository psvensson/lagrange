import tap from 'tap';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

import {checkpointGate} from '../../scripts/solve/audit.js';
import {
  candidateContentIdentity,
} from '../../scripts/solve/candidate-content-identity.js';
import {
  PROOF_MUTATED_CANDIDATE,
  withCandidateWorkspace,
} from '../../scripts/solve/candidate-workspace.js';
import {runCheckpointCommand} from '../../scripts/solve/handoff.js';
import {buildNextLines} from '../../scripts/solve/next.js';
import {runStep} from '../../scripts/solve/step.js';
import {appendFinding, readLog, saveQuest} from '../../scripts/solve/store.js';
import {
  terminalVerificationProblems,
  verificationState,
} from '../../scripts/solve/verification.js';

function git(root, args) {
  return execFileSync('git', args, {cwd: root, encoding: 'utf8'});
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'candidate-verification-'));
  git(root, ['init']);
  git(root, ['config', 'user.email', 'solver@example.com']);
  git(root, ['config', 'user.name', 'Solver']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  fs.mkdirSync(path.join(root, 'src'), {recursive: true});
  fs.writeFileSync(path.join(root, 'src/a.js'), 'export const a = 1;\n');
  fs.writeFileSync(path.join(root, 'src/b.js'), 'export const b = 1;\n');
  git(root, ['add', '-A']);
  git(root, ['commit', '-m', 'base']);
  const oracle = path.join(root, 'oracle.json');
  fs.writeFileSync(oracle, JSON.stringify({metric: 2, target: 0}));
  const quest = {
    id: 'candidate-v2',
    class: 'process',
    verificationContractVersion: 2,
    statement: 'Candidate verification is exact.',
    doneWhen: {probe: 'oracle', args: {file: oracle}},
    frontiers: [{
      id: 'candidate-v2-main', priority: 1,
      metric: {probe: 'oracle', args: {file: oracle}},
    }],
    constraints: [],
  };
  saveQuest(root, quest);
  return {root, quest, oracle};
}

function record(fx, edits, metric, name) {
  runStep(fx.root, fx.quest);
  for (const [relative, content] of Object.entries(edits)) {
    const file = path.join(fx.root, relative);
    const existed = fs.existsSync(file);
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, content);
    if (!existed) git(fx.root, ['add', '-N', '--', relative]);
  }
  fs.writeFileSync(fx.oracle, JSON.stringify({metric, target: 0}));
  const base = git(fx.root, ['rev-parse', 'HEAD']).trim();
  const changedPaths = Object.keys(edits);
  const diff = git(fx.root, [
    'diff', '--binary', '--full-index', '--no-ext-diff', base,
    '--', ...changedPaths,
  ]);
  const relativeArtifact = `solve/changes/${fx.quest.id}/${name}.diff`;
  const artifact = path.join(fx.root, relativeArtifact);
  fs.mkdirSync(path.dirname(artifact), {recursive: true});
  fs.writeFileSync(artifact, diff);
  return runStep(fx.root, fx.quest, {
    changeRef: `diff:${relativeArtifact}`,
    summary: name,
  });
}

function candidateFinding(fx, kind, extraPaths = []) {
  const state = verificationState(fx.root, fx.quest, readLog(fx.root, fx.quest.id));
  const candidate = state.candidate;
  appendFinding(fx.root, fx.quest.id, {
    frontier: 'candidate-v2-main',
    kind,
    claim: `${kind} current landing candidate`,
    evidence: `subagent:${kind}`,
    verification: {
      schemaVersion: 2,
      scope: 'candidate',
      fingerprint: candidate.fingerprint,
      baseCommit: candidate.baseCommit,
      paths: [...candidate.paths, ...extraPaths].sort(),
      sourcePaths: candidate.sourcePaths,
      firstAttemptIndex: candidate.firstAttemptIndex,
      lastAttemptIndex: candidate.lastAttemptIndex,
      ...(kind === 'verifier-rejection' ? {verdict: 'rejected'} : {}),
    },
  });
  return candidate;
}

tap.test('version 2 attempts form one landing candidate', (t) => {
  const fx = fixture();
  t.teardown(() => fs.rmSync(fx.root, {recursive: true, force: true}));
  record(fx, {'src/a.js': 'export const a = 2;\n'}, 1, 'first');
  record(fx, {'src/b.js': 'export const b = 2;\n'}, 1, 'second');

  let state = verificationState(fx.root, fx.quest, readLog(fx.root, fx.quest.id));
  t.same(state.pendingAttempts, [], 'exploratory attempts need no individual review');
  t.same(state.attemptProblems, []);
  t.same(state.candidate.paths, ['src/a.js', 'src/b.js'],
    'candidate uses the sorted union and current bytes');
  t.match(buildNextLines(fx.root, fx.quest.id)[0], /continue --id candidate-v2$/u,
    'next continues work instead of prescribing verification or checkpoint');
  t.equal(checkpointGate(fx.root, fx.quest).status, 'fail');

  candidateFinding(fx, 'verifier-approval');
  state = verificationState(fx.root, fx.quest, readLog(fx.root, fx.quest.id));
  t.ok(state.candidateApproval, 'one exact approval covers the union');
  const gate = checkpointGate(fx.root, fx.quest);
  t.equal(gate.status, 'pass', gate.problems.map((item) => item.message).join('\n'));
  t.throws(() => runCheckpointCommand(fx.root, {id: fx.quest.id, _: []}),
    /requires --reason/u);
  t.match(runCheckpointCommand(fx.root, {
    'id': fx.quest.id, '_': [], 'dry-run': true, 'reason': 'milestone',
  }), /landing candidate:.*approved/u);
  t.match(runCheckpointCommand(fx.root, {
    id: fx.quest.id, _: [], reason: 'milestone',
  }), /checkpointed/u);
  t.match(git(fx.root, ['log', '-1', '--format=%b']),
    /durability-boundary: milestone/u,
    'checkpoint persists the exceptional boundary reason');
  t.end();
});

tap.test('candidate review excludes Solver bookkeeping and derived inventories', (t) => {
  const fx = fixture();
  t.teardown(() => fs.rmSync(fx.root, {recursive: true, force: true}));
  record(fx, {
    'src/a.js': 'export const a = 2;\n',
    'solve/quests/candidate-v2.json': `${JSON.stringify(fx.quest, null, 2)}\n`,
    'solve/changes/global-owner-debt-inventory/inventory.json':
      '{"derived":true}\n',
    'solve/artifacts/sha256/aa/prior.diff.gz': 'immutable storage object\n',
  }, 1, 'bookkeeping');

  const state = verificationState(
    fx.root,
    fx.quest,
    readLog(fx.root, fx.quest.id),
  );
  t.same(state.candidate.paths, ['src/a.js']);
  t.same(state.aggregate.paths, ['src/a.js']);
  t.equal(state.attempts[0].event.sourceVerificationFingerprint,
    state.candidate.fingerprint,
    'the recorded source fingerprint is independent of bookkeeping bytes');
  fs.appendFileSync(
    path.join(fx.root, 'solve/quests/candidate-v2.json'),
    ' \n',
  );
  const afterBookkeepingDrift = verificationState(
    fx.root,
    fx.quest,
    readLog(fx.root, fx.quest.id),
  );
  t.equal(afterBookkeepingDrift.candidate.fingerprint, state.candidate.fingerprint);
  t.end();
});

tap.test('candidate drift and rejection replacement fail closed', (t) => {
  const fx = fixture();
  t.teardown(() => fs.rmSync(fx.root, {recursive: true, force: true}));
  record(fx, {'src/a.js': 'export const a = 2;\n'}, 1, 'first');
  candidateFinding(fx, 'verifier-approval');
  fs.appendFileSync(path.join(fx.root, 'src/a.js'), '// drift\n');
  t.equal(checkpointGate(fx.root, fx.quest).status, 'fail',
    'post-approval byte drift invalidates the receipt');

  fs.writeFileSync(path.join(fx.root, 'src/a.js'), 'export const a = 2;\n');
  const rejected = candidateFinding(fx, 'verifier-rejection', [
    'solve/artifacts/sha256/aa/prior.diff.gz',
  ]);
  let state = verificationState(fx.root, fx.quest, readLog(fx.root, fx.quest.id));
  t.ok(state.unresolvedCandidateRejection);
  record(fx, {'src/b.js': 'export const b = 3;\n'}, 1, 'replacement');
  state = verificationState(fx.root, fx.quest, readLog(fx.root, fx.quest.id));
  t.notOk(state.unresolvedCandidateRejection,
    'later changed same-base union is a path superset replacement');
  t.not(state.candidate.fingerprint, rejected.fingerprint);
  t.same(state.candidate.paths, ['src/a.js', 'src/b.js']);
  t.end();
});

tap.test('source epoch prevents a later HEAD from creating a mixed-base candidate', (t) => {
  const fx = fixture();
  t.teardown(() => fs.rmSync(fx.root, {recursive: true, force: true}));
  record(fx, {'src/a.js': 'export const a = 2;\n'}, 1, 'first');
  candidateFinding(fx, 'verifier-rejection');

  git(fx.root, ['commit', '--allow-empty', '-m', 'different attempt base']);
  const differentBase = git(fx.root, ['rev-parse', 'HEAD']).trim();
  const replacement = runStep(fx.root, fx.quest);
  const pending = JSON.parse(fs.readFileSync(replacement.pendingFile, 'utf8'));
  pending.headCommit = differentBase;
  fs.writeFileSync(replacement.pendingFile, JSON.stringify(pending, null, 2));
  fs.writeFileSync(path.join(fx.root, 'src/b.js'), 'export const b = 3;\n');
  fs.writeFileSync(fx.oracle, JSON.stringify({metric: 0, target: 0}));
  const diff = git(fx.root, [
    'diff', '--binary', '--full-index', '--no-ext-diff', differentBase,
    '--', 'src/b.js',
  ]);
  const relativeArtifact =
    `solve/changes/${fx.quest.id}/wrong-base-replacement.diff`;
  const artifact = path.join(fx.root, relativeArtifact);
  fs.mkdirSync(path.dirname(artifact), {recursive: true});
  fs.writeFileSync(artifact, diff);
  runStep(fx.root, fx.quest, {
    changeRef: `diff:${relativeArtifact}`,
    summary: 'wrong-base-replacement',
  });
  const log = readLog(fx.root, fx.quest.id);
  const state = verificationState(fx.root, fx.quest, log);
  t.ok(state.candidate.ok);
  t.equal(state.candidate.baseCommit,
    state.attempts[0].event.workspaceBaseCommit);
  t.same(state.attempts.map((attempt) => attempt.event.workspaceBaseCommit),
    [state.candidate.baseCommit, state.candidate.baseCommit],
    'the separately tracked source base, not the moved HEAD pin, owns both attempts');
  t.equal(checkpointGate(fx.root, fx.quest).status, 'fail');
  t.end();
});

tap.test('terminal aggregate covers all version 2 paths and remains mandatory', (t) => {
  const fx = fixture();
  t.teardown(() => fs.rmSync(fx.root, {recursive: true, force: true}));
  record(fx, {
    'src/a.js': 'export const a = 2;\n',
    'docs/note.md': 'review this documentation too\n',
  }, 0, 'terminal');
  const log = readLog(fx.root, fx.quest.id);
  const state = verificationState(fx.root, fx.quest, log);
  t.same(state.aggregate.paths, ['docs/note.md', 'src/a.js'],
    'v2 terminal composition widens beyond source-only paths');
  t.match(terminalVerificationProblems(fx.root, fx.quest, log)
    .map((item) => item.message).join('\n'), /aggregate approval/u);
  appendFinding(fx.root, fx.quest.id, {
    frontier: 'candidate-v2-main',
    kind: 'verifier-approval',
    claim: 'aggregate composition passed',
    evidence: 'subagent:aggregate',
    verification: {
      schemaVersion: 2,
      scope: 'aggregate',
      fingerprint: state.aggregate.fingerprint,
      baseCommit: state.aggregate.baseCommit,
      paths: state.aggregate.paths,
      sourcePaths: state.aggregate.paths,
      firstAttemptIndex: state.attempts[0].index,
      lastAttemptIndex: state.attempts.at(-1).index,
    },
  });
  t.same(terminalVerificationProblems(
    fx.root, fx.quest, readLog(fx.root, fx.quest.id)), []);
  t.end();
});

tap.test('candidate content identity ignores mtimes but binds bytes, mode, and deletion', (t) => {
  const fx = fixture();
  t.teardown(() => fs.rmSync(fx.root, {recursive: true, force: true}));
  const paths = ['src/b.js', 'src/a.js'];
  const first = candidateContentIdentity(fx.root, paths);
  t.equal(first.ok, true);
  t.same(first.manifest.entries.map((entry) => entry.path),
    ['src/a.js', 'src/b.js'], 'manifest order is canonical');

  const aPath = path.join(fx.root, 'src/a.js');
  const now = new Date(Date.now() + 5000);
  fs.utimesSync(aPath, now, now);
  const afterTouch = candidateContentIdentity(fx.root, [...paths].reverse());
  t.equal(afterTouch.fingerprint, first.fingerprint,
    'filesystem time and caller path order are not semantic identity');

  fs.chmodSync(aPath, 0o755);
  const afterMode = candidateContentIdentity(fx.root, paths);
  t.not(afterMode.fingerprint, first.fingerprint,
    'Git executable mode participates in identity');
  t.equal(afterMode.manifest.entries[0].mode, '100755');

  fs.chmodSync(aPath, 0o644);
  fs.writeFileSync(aPath, 'export const a = 9;\n');
  const afterBytes = candidateContentIdentity(fx.root, paths);
  t.not(afterBytes.fingerprint, first.fingerprint,
    'byte drift participates in identity');

  fs.unlinkSync(path.join(fx.root, 'src/b.js'));
  const afterDelete = candidateContentIdentity(fx.root, paths);
  t.not(afterDelete.fingerprint, afterBytes.fingerprint);
  t.same(afterDelete.manifest.entries[1], {
    path: 'src/b.js',
    state: 'deleted',
  });
  t.end();
});

tap.test('commit content identity remains pinned while the worktree moves', (t) => {
  const fx = fixture();
  t.teardown(() => fs.rmSync(fx.root, {recursive: true, force: true}));
  const base = git(fx.root, ['rev-parse', 'HEAD']).trim();
  const before = candidateContentIdentity(fx.root, ['src/a.js'], {commit: base});
  fs.writeFileSync(path.join(fx.root, 'src/a.js'), 'export const a = 99;\n');
  const pinned = candidateContentIdentity(fx.root, ['src/a.js'], {commit: base});
  const live = candidateContentIdentity(fx.root, ['src/a.js']);
  t.equal(pinned.fingerprint, before.fingerprint,
    'commit identity is independent of later working-tree bytes');
  t.not(live.fingerprint, before.fingerprint,
    'working-tree identity follows the current candidate bytes');
  t.end();
});

tap.test('candidate workspace uses current committed policy but only reviewed dirty paths', (t) => {
  const fx = fixture();
  t.teardown(() => fs.rmSync(fx.root, {recursive: true, force: true}));
  const base = git(fx.root, ['rev-parse', 'HEAD']).trim();
  fs.writeFileSync(path.join(fx.root, 'src/a.js'), 'export const a = 7;\n');
  fs.mkdirSync(path.join(fx.root, 'policy'), {recursive: true});
  fs.writeFileSync(path.join(fx.root, 'policy/checker.txt'), 'current-policy\n');
  git(fx.root, ['add', 'policy/checker.txt']);
  git(fx.root, ['commit', '-m', 'advance proof policy']);
  const currentHead = git(fx.root, ['rev-parse', 'HEAD']).trim();
  fs.mkdirSync(path.join(fx.root, 'test'), {recursive: true});
  fs.writeFileSync(path.join(fx.root, 'test/foreign.test.js'), 'foreign dirty work\n');

  const observed = withCandidateWorkspace(fx.root, {
    baseCommit: base,
    paths: ['src/a.js'],
  }, (candidateRoot, context) => ({
    candidateBytes: fs.readFileSync(path.join(candidateRoot, 'src/a.js'), 'utf8'),
    policyBytes: fs.readFileSync(
      path.join(candidateRoot, 'policy/checker.txt'), 'utf8'),
    foreignPresent: fs.existsSync(path.join(candidateRoot, 'test/foreign.test.js')),
    proofHeadCommit: context.proofHeadCommit,
  }));

  t.equal(observed.candidateBytes, 'export const a = 7;\n',
    'reviewed dirty bytes are overlaid exactly');
  t.equal(observed.policyBytes, 'current-policy\n',
    'proof consumes current committed safety policy, not the old source base');
  t.equal(observed.foreignPresent, false,
    'foreign untracked work is absent from the proof workspace');
  t.equal(observed.proofHeadCommit, currentHead,
    'proof context identifies the current committed policy head');
  t.not(observed.proofHeadCommit, base,
    'proof policy is not frozen to the historical source epoch');
  t.end();
});

tap.test('candidate workspace refuses proof mutation of tracked candidate bytes', (t) => {
  const fx = fixture();
  t.teardown(() => fs.rmSync(fx.root, {recursive: true, force: true}));
  const base = git(fx.root, ['rev-parse', 'HEAD']).trim();
  fs.writeFileSync(path.join(fx.root, 'src/a.js'), 'export const a = 5;\n');
  t.throws(() => withCandidateWorkspace(fx.root, {
    baseCommit: base,
    paths: ['src/a.js'],
  }, (candidateRoot) => {
    fs.writeFileSync(path.join(candidateRoot, 'src/a.js'), 'mutated by proof\n');
  }), new RegExp(PROOF_MUTATED_CANDIDATE, 'u'));
  t.end();
});