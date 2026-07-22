import tap from 'tap';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

import {checkpointGate} from '../../scripts/solve/audit.js';
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

function candidateFinding(fx, kind) {
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
      paths: candidate.paths,
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
  t.match(buildNextLines(fx.root, fx.quest.id)[0], /step --id candidate-v2$/u,
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

tap.test('candidate drift and rejection replacement fail closed', (t) => {
  const fx = fixture();
  t.teardown(() => fs.rmSync(fx.root, {recursive: true, force: true}));
  record(fx, {'src/a.js': 'export const a = 2;\n'}, 1, 'first');
  candidateFinding(fx, 'verifier-approval');
  fs.appendFileSync(path.join(fx.root, 'src/a.js'), '// drift\n');
  t.equal(checkpointGate(fx.root, fx.quest).status, 'fail',
    'post-approval byte drift invalidates the receipt');

  fs.writeFileSync(path.join(fx.root, 'src/a.js'), 'export const a = 2;\n');
  const rejected = candidateFinding(fx, 'verifier-rejection');
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

tap.test('invalid mixed-base replacement cannot erase a candidate rejection', (t) => {
  const fx = fixture();
  t.teardown(() => fs.rmSync(fx.root, {recursive: true, force: true}));
  record(fx, {'src/a.js': 'export const a = 2;\n'}, 1, 'first');
  candidateFinding(fx, 'verifier-rejection');

  git(fx.root, ['commit', '--allow-empty', '-m', 'different attempt base']);
  record(fx, {'src/b.js': 'export const b = 3;\n'}, 0, 'wrong-base-replacement');
  let log = readLog(fx.root, fx.quest.id);
  const state = verificationState(fx.root, fx.quest, log);
  t.notOk(state.candidate.ok);
  t.equal(state.candidate.fingerprint, null);
  t.match(state.attemptProblems.map((item) => item.message).join('\n'),
    /one recorded common Git base/u);

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
  log = readLog(fx.root, fx.quest.id);
  t.match(terminalVerificationProblems(fx.root, fx.quest, log)
    .map((item) => item.message).join('\n'), /one recorded common Git base/u,
  'aggregate approval cannot bypass the invalid candidate');
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
