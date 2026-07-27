import tap from 'tap';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

import {recordRejectionDecomposition}
  from '../../scripts/solve/rejection-decomposition.js';
import {runStep} from '../../scripts/solve/step.js';
import {appendFinding, readLog, saveQuest} from '../../scripts/solve/store.js';
import {verificationState} from '../../scripts/solve/verification.js';

function git(root, args) {
  return execFileSync('git', args, {cwd: root, encoding: 'utf8'});
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rejection-decomposition-'));
  git(root, ['init']);
  git(root, ['config', 'user.email', 'solver@example.com']);
  git(root, ['config', 'user.name', 'Solver']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  fs.mkdirSync(path.join(root, 'src'), {recursive: true});
  fs.writeFileSync(path.join(root, 'src/a.js'), 'export const a = 1;\n');
  fs.writeFileSync(path.join(root, 'src/b.js'), 'export const b = 1;\n');
  fs.writeFileSync(path.join(root, 'src/c.js'), 'export const c = 1;\n');
  git(root, ['add', '-A']);
  git(root, ['commit', '-m', 'base']);
  return {root};
}

function makeQuest(root, id) {
  const oracle = path.join(root, `${id}-oracle.json`);
  fs.writeFileSync(oracle, JSON.stringify({metric: 2, target: 0}));
  const quest = {
    id,
    class: 'process',
    verificationContractVersion: 2,
    statement: 'Decomposition discharge is exact.',
    doneWhen: {probe: 'oracle', args: {file: oracle}},
    frontiers: [{
      id: `${id}-main`, priority: 1,
      metric: {probe: 'oracle', args: {file: oracle}},
    }],
    constraints: [],
  };
  saveQuest(root, quest);
  return {quest, oracle};
}

function record(root, fx, edits, name) {
  runStep(root, fx.quest);
  for (const [relative, content] of Object.entries(edits)) {
    fs.writeFileSync(path.join(root, relative), content);
  }
  fs.writeFileSync(fx.oracle, JSON.stringify({metric: 1, target: 0}));
  const base = git(root, ['rev-parse', 'HEAD']).trim();
  const changedPaths = Object.keys(edits);
  const diff = git(root, [
    'diff', '--binary', '--full-index', '--no-ext-diff', base,
    '--', ...changedPaths,
  ]);
  const relativeArtifact = `solve/changes/${fx.quest.id}/${name}.diff`;
  const artifact = path.join(root, relativeArtifact);
  fs.mkdirSync(path.dirname(artifact), {recursive: true});
  fs.writeFileSync(artifact, diff);
  return runStep(root, fx.quest, {
    changeRef: `diff:${relativeArtifact}`,
    summary: name,
  });
}

function candidateFinding(root, fx, kind) {
  const state = verificationState(root, fx.quest, readLog(root, fx.quest.id));
  const candidate = state.candidate;
  appendFinding(root, fx.quest.id, {
    frontier: `${fx.quest.id}-main`,
    kind,
    claim: `${kind} current landing candidate with category-complete detail`,
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

tap.test('a standing rejection is discharged by successor-quest coverage', (t) => {
  const {root} = fixture();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  const questA = makeQuest(root, 'decomp-a');
  const questB = makeQuest(root, 'decomp-b');
  const questC = makeQuest(root, 'decomp-c');

  record(root, questA, {
    'src/a.js': 'export const a = 2;\n',
    'src/b.js': 'export const b = 2;\n',
  }, 'combined');
  candidateFinding(root, questA, 'verifier-rejection');
  let stateA = verificationState(
    root, questA.quest, readLog(root, questA.quest.id));
  t.ok(stateA.unresolvedCandidateRejection, 'the rejection stands');

  t.throws(() => recordRejectionDecomposition(root, {id: questA.quest.id}),
    /no exact approval/u,
    'same-quest contribution demands an approved current candidate');

  record(root, questC, {'src/c.js': 'export const c = 2;\n'}, 'unrelated');
  candidateFinding(root, questC, 'verifier-approval');
  t.throws(() => recordRejectionDecomposition(root, {
    'id': questA.quest.id, 'from-quest': questC.quest.id,
  }), /covers none of the remaining rejected paths/u,
  'coverage must intersect the rejected paths');

  record(root, questB, {'src/b.js': 'export const b = 3;\n'}, 'slice-b');
  candidateFinding(root, questB, 'verifier-approval');
  const first = recordRejectionDecomposition(root, {
    'id': questA.quest.id, 'from-quest': questB.quest.id,
  });
  t.same(first.coveredPaths, ['src/b.js']);
  t.same(first.remainingPaths, ['src/a.js']);
  t.equal(first.discharged, false);
  stateA = verificationState(root, questA.quest, readLog(root, questA.quest.id));
  t.ok(stateA.unresolvedCandidateRejection,
    'partial coverage keeps the rejection standing');
  t.match(stateA.attemptProblems.map((item) => item.message).join('\n'),
    /remaining rejected paths: src\/a\.js/u,
    'the obligation names exactly the uncovered paths');

  record(root, questB, {'src/a.js': 'export const a = 3;\n'}, 'slice-a');
  candidateFinding(root, questB, 'verifier-approval');
  const second = recordRejectionDecomposition(root, {
    'id': questA.quest.id, 'from-quest': questB.quest.id,
  });
  t.same(second.remainingPaths, []);
  t.equal(second.discharged, true);
  stateA = verificationState(root, questA.quest, readLog(root, questA.quest.id));
  t.notOk(stateA.unresolvedCandidateRejection,
    'full recorded coverage discharges the rejection without a superset replacement');

  t.throws(() => recordRejectionDecomposition(root, {
    'id': questA.quest.id, 'from-quest': questB.quest.id,
  }), /no standing unresolved candidate rejection/u,
  'a discharged rejection cannot be decomposed again');
  t.end();
});

tap.test('a stale contribution receipt fails closed', (t) => {
  const {root} = fixture();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  const questA = makeQuest(root, 'stale-a');
  const questB = makeQuest(root, 'stale-b');

  record(root, questA, {'src/a.js': 'export const a = 2;\n'}, 'combined');
  candidateFinding(root, questA, 'verifier-rejection');
  record(root, questB, {'src/a.js': 'export const a = 4;\n'}, 'slice');
  candidateFinding(root, questB, 'verifier-approval');
  fs.appendFileSync(path.join(root, 'src/a.js'), '// drift after approval\n');
  t.throws(() => recordRejectionDecomposition(root, {
    'id': questA.quest.id, 'from-quest': questB.quest.id,
  }), /no exact approval for its current candidate/u,
  'post-approval drift invalidates the contribution before it can cover anything');
  t.end();
});

tap.test('a successor with its own standing rejection cannot contribute', (t) => {
  const {root} = fixture();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  const questA = makeQuest(root, 'tainted-a');
  const questB = makeQuest(root, 'tainted-b');

  record(root, questA, {'src/a.js': 'export const a = 2;\n'}, 'combined');
  candidateFinding(root, questA, 'verifier-rejection');
  record(root, questB, {'src/a.js': 'export const a = 5;\n'}, 'slice');
  candidateFinding(root, questB, 'verifier-approval');
  candidateFinding(root, questB, 'verifier-rejection');
  t.throws(() => recordRejectionDecomposition(root, {
    'id': questA.quest.id, 'from-quest': questB.quest.id,
  }), /has its own standing candidate rejection/u,
  'a stale approval on since-rejected bytes never launders a discharge');
  t.end();
});
