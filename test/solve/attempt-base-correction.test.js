import tap from 'tap';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

import {
  runAttemptBaseCorrectionCommand,
} from '../../scripts/solve/attempt-base-correction.js';
import {
  EVENT_ATTEMPT_BASE_CORRECTED,
  projectAttemptBaseCorrections,
} from '../../scripts/solve/attempt-base-correction-projection.js';
import {
  runStep,
  stepAbort,
  stepPending,
} from '../../scripts/solve/step.js';
import {
  analyzeScopePressure,
} from '../../scripts/solve/scope-pressure.js';
import {
  appendEvent,
  appendFinding,
  readLog,
  saveQuest,
} from '../../scripts/solve/store.js';
import {
  verificationState,
} from '../../scripts/solve/verification.js';

function git(root, args) {
  return execFileSync('git', args, {cwd: root, encoding: 'utf8'});
}

function fixture() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'attempt-base-correction-'),
  );
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
    id: 'base-correction',
    class: 'process',
    verificationContractVersion: 2,
    statement: 'Attempt base corrections are exact and append-only.',
    doneWhen: {probe: 'oracle', args: {file: oracle}},
    frontiers: [{
      id: 'base-correction-main',
      priority: 1,
      metric: {probe: 'oracle', args: {file: oracle}},
    }],
    constraints: [],
  };
  saveQuest(root, quest);
  return {root, quest, oracle};
}

function commitAttempt(fx, edits, metric, name, forcedBase = null) {
  runStep(fx.root, fx.quest);
  if (forcedBase) {
    const pending = stepPending(fx.root, fx.quest.id);
    pending.sourceBaseCommit = forcedBase;
    const pendingPath = path.join(
      fx.root,
      'solve/state',
      `${fx.quest.id}.pending.json`,
    );
    fs.writeFileSync(pendingPath, `${JSON.stringify(pending, null, 2)}\n`);
  }
  for (const [relative, content] of Object.entries(edits)) {
    fs.writeFileSync(path.join(fx.root, relative), content);
  }
  fs.writeFileSync(fx.oracle, JSON.stringify({metric, target: 0}));
  const base = forcedBase || git(fx.root, ['rev-parse', 'HEAD']).trim();
  const paths = Object.keys(edits);
  const diff = git(fx.root, [
    'diff',
    '--binary',
    '--full-index',
    '--no-ext-diff',
    base,
    '--',
    ...paths,
  ]);
  const relative = `solve/changes/${fx.quest.id}/${name}.diff`;
  const artifact = path.join(fx.root, relative);
  fs.mkdirSync(path.dirname(artifact), {recursive: true});
  fs.writeFileSync(artifact, diff);
  runStep(fx.root, fx.quest, {
    changeRef: `diff:${relative}`,
    summary: name,
  });
}

function rejectCandidate(fx) {
  const state = verificationState(
    fx.root,
    fx.quest,
    readLog(fx.root, fx.quest.id),
  );
  const candidate = state.candidate;
  appendFinding(fx.root, fx.quest.id, {
    frontier: fx.quest.frontiers[0].id,
    kind: 'verifier-rejection',
    claim: 'exact candidate rejected',
    evidence: 'subagent:base-correction-rejector',
    verification: {
      schemaVersion: 2,
      scope: 'candidate',
      fingerprint: candidate.fingerprint,
      baseCommit: candidate.baseCommit,
      paths: candidate.paths,
      sourcePaths: candidate.sourcePaths,
      firstAttemptIndex: candidate.firstAttemptIndex,
      lastAttemptIndex: candidate.lastAttemptIndex,
      verdict: 'rejected',
    },
  });
  return candidate;
}

function mixedBaseFixture(t) {
  const fx = fixture();
  t.teardown(() => fs.rmSync(fx.root, {recursive: true, force: true}));
  const rejectedBase = git(fx.root, ['rev-parse', 'HEAD']).trim();
  commitAttempt(
    fx,
    {'src/a.js': 'export const a = 2;\n'},
    1,
    'rejected',
  );
  rejectCandidate(fx);

  fs.mkdirSync(path.join(fx.root, 'docs'), {recursive: true});
  fs.writeFileSync(path.join(fx.root, 'docs/planning.md'), 'planning\n');
  git(fx.root, ['add', 'docs/planning.md']);
  git(fx.root, ['commit', '-m', 'unrelated planning']);
  const wrongBase = git(fx.root, ['rev-parse', 'HEAD']).trim();

  runStep(fx.root, fx.quest);
  t.equal(
    stepPending(fx.root, fx.quest.id).sourceBaseCommit,
    rejectedBase,
    'candidate-scoped rejection pins the replacement step to its base',
  );
  stepAbort(fx.root, fx.quest.id);
  commitAttempt(
    fx,
    {
      'src/a.js': 'export const a = 3;\n',
      'src/b.js': 'export const b = 2;\n',
    },
    0,
    'wrong-base-replacement',
    wrongBase,
  );
  const log = readLog(fx.root, fx.quest.id);
  const attemptIndex = log.findLastIndex((event) => event.type === 'attempt');
  return {fx, rejectedBase, wrongBase, attemptIndex};
}

tap.test('proof-checked correction restores one common base append-only', (t) => {
  const {
    fx,
    rejectedBase,
    wrongBase,
    attemptIndex,
  } = mixedBaseFixture(t);
  let state = verificationState(
    fx.root,
    fx.quest,
    readLog(fx.root, fx.quest.id),
  );
  t.notOk(state.candidate.ok);
  t.match(state.candidate.problem, /one recorded common Git base/u);

  t.match(
    runAttemptBaseCorrectionCommand(fx.root, {
      'id': fx.quest.id,
      'attempt-index': String(attemptIndex),
      'to-base': rejectedBase,
      'reason': 'candidate rejection base was omitted by the step pin',
    }),
    /corrected attempt/u,
  );
  const log = readLog(fx.root, fx.quest.id);
  const original = log[attemptIndex];
  t.equal(original.workspaceBaseCommit, wrongBase,
    'the original attempt event is never rewritten');
  t.equal(log.at(-1).type, EVENT_ATTEMPT_BASE_CORRECTED);
  t.equal(log.at(-1).fromBase, wrongBase);
  t.equal(log.at(-1).toBase, rejectedBase);

  state = verificationState(fx.root, fx.quest, log);
  t.same(state.attemptBaseCorrectionProblems, []);
  t.ok(state.candidate.ok);
  t.equal(state.candidate.baseCommit, rejectedBase);
  t.same(state.candidate.paths, ['src/a.js', 'src/b.js']);
  t.notOk(state.unresolvedCandidateRejection,
    'changed-fingerprint full-path replacement now resolves the rejection');
  t.equal(
    state.attempts.find((attempt) => attempt.index === attemptIndex)
      .event.workspaceBaseCommit,
    rejectedBase,
    'verification consumers use the effective corrected base',
  );
  const scopePressure = analyzeScopePressure(
    fx.root,
    fx.quest,
    log,
    {ignoreBaselines: true},
  );
  t.same(
    scopePressure.changedPaths,
    ['src/a.js', 'src/b.js'],
    'scope-pressure projects the same authorized correction and path union',
  );
  t.throws(
    () => runAttemptBaseCorrectionCommand(fx.root, {
      'id': fx.quest.id,
      'attempt-index': String(attemptIndex),
      'to-base': rejectedBase,
      'reason': 'repeat',
    }),
    /already has a correction/u,
  );
  t.end();
});

tap.test('correction refuses arbitrary targets, drift, and prior review', (t) => {
  const first = mixedBaseFixture(t);
  t.throws(
    () => runAttemptBaseCorrectionCommand(first.fx.root, {
      'id': first.fx.quest.id,
      'attempt-index': String(first.attemptIndex),
      'to-base': first.wrongBase,
      'reason': 'arbitrary target',
    }),
    /target must equal the standing earlier candidate-rejection base/u,
  );
  fs.writeFileSync(
    path.join(first.fx.root, 'src/a.js'),
    'export const a = 99;\n',
  );
  t.throws(
    () => runAttemptBaseCorrectionCommand(first.fx.root, {
      'id': first.fx.quest.id,
      'attempt-index': String(first.attemptIndex),
      'to-base': first.rejectedBase,
      'reason': 'drifted',
    }),
    /does not reproduce/u,
  );

  const reviewed = mixedBaseFixture(t);
  const state = verificationState(
    reviewed.fx.root,
    reviewed.fx.quest,
    readLog(reviewed.fx.root, reviewed.fx.quest.id),
  );
  const attempt = state.attempts.find(
    (candidate) => candidate.index === reviewed.attemptIndex,
  );
  appendFinding(reviewed.fx.root, reviewed.fx.quest.id, {
    frontier: reviewed.fx.quest.frontiers[0].id,
    kind: 'verifier-approval',
    claim: 'attempt reviewed',
    evidence: 'subagent:already-reviewed',
    verification: {
      schemaVersion: 1,
      scope: 'attempt',
      fingerprint: attempt.fingerprint,
    },
  });
  t.throws(
    () => runAttemptBaseCorrectionCommand(reviewed.fx.root, {
      'id': reviewed.fx.quest.id,
      'attempt-index': String(reviewed.attemptIndex),
      'to-base': reviewed.rejectedBase,
      'reason': 'too late',
    }),
    /verifier receipt already covers/u,
  );
  t.end();
});

tap.test('malformed correction events fail the verification projection', (t) => {
  const {fx, attemptIndex} = mixedBaseFixture(t);
  appendEvent(fx.root, fx.quest.id, {
    type: EVENT_ATTEMPT_BASE_CORRECTED,
    attemptIndex,
    toBase: 'not-a-commit',
  });
  const state = verificationState(
    fx.root,
    fx.quest,
    readLog(fx.root, fx.quest.id),
  );
  t.match(
    state.attemptBaseCorrectionProblems.join('\n'),
    /inexact event shape/u,
  );
  t.match(
    state.attemptProblems.map((problem) => problem.message).join('\n'),
    /base correction/u,
  );
  t.end();
});

tap.test('projection replays authorization and resists polluted intrinsics', (t) => {
  const {
    fx,
    rejectedBase,
    wrongBase,
    attemptIndex,
  } = mixedBaseFixture(t);
  const log = readLog(fx.root, fx.quest.id);
  const state = verificationState(fx.root, fx.quest, log);
  const attempt = state.attempts.find(
    (candidate) => candidate.index === attemptIndex,
  );
  const correction = {
    type: EVENT_ATTEMPT_BASE_CORRECTED,
    attemptIndex,
    frontier: attempt.event.frontier,
    fromBase: wrongBase,
    toBase: rejectedBase,
    fingerprint: attempt.fingerprint,
    paths: [...attempt.inspection.changedPaths].sort(),
    reason: 'test correction',
    proof: {
      changeRefFingerprint: attempt.fingerprint,
      recordedBaseFingerprint: attempt.fingerprint,
      targetBaseFingerprint: attempt.fingerprint,
    },
    ts: '2026-07-27T00:00:00.000Z',
  };
  const noRejectionLog = log.map((event) =>
    event.kind === 'verifier-rejection' &&
    event.verification?.scope === 'candidate' ?
      {...event, type: 'rejection-removed-for-attack'} :
      event);
  noRejectionLog.push(correction);
  let projection = projectAttemptBaseCorrections(
    state.attempts,
    noRejectionLog,
    {validateProof: () => null},
  );
  t.match(
    projection.problems.join('\n'),
    /no exact standing candidate rejection/u,
  );
  t.equal(
    projection.attempts.find(
      (candidate) => candidate.index === attemptIndex,
    ).event.workspaceBaseCommit,
    wrongBase,
    'an arbitrary exact-shaped event never changes the projected base',
  );

  const reviewedLog = [...log, {
    type: 'finding',
    frontier: attempt.event.frontier,
    kind: 'verifier-approval',
    evidence: 'subagent:prior-review',
    verification: {
      schemaVersion: 2,
      scope: 'candidate',
      fingerprint: attempt.fingerprint,
      baseCommit: wrongBase,
      paths: correction.paths,
      sourcePaths: correction.paths,
      firstAttemptIndex: attemptIndex,
      lastAttemptIndex: attemptIndex,
    },
  }, correction];
  projection = projectAttemptBaseCorrections(
    state.attempts,
    reviewedLog,
    {validateProof: () => null},
  );
  t.match(projection.problems.join('\n'), /follows an exact verifier review/u);

  const malformed = {
    ...correction,
    fromBase: null,
    toBase: null,
    proof: {},
  };
  const originalEvery = Object.getOwnPropertyDescriptor(
    Array.prototype,
    'every',
  );
  let pollutedProjection;
  try {
    Reflect.defineProperty(Array.prototype, 'every', {
      ...originalEvery,
      value: () => true,
    });
    pollutedProjection = projectAttemptBaseCorrections(
      state.attempts,
      [...log, malformed],
      {validateProof: () => null},
    );
  } finally {
    Reflect.defineProperty(Array.prototype, 'every', originalEvery);
  }
  t.match(
    pollutedProjection.problems.join('\n'),
    /does not bind the exact recorded attempt/u,
  );
  t.notOk(
    pollutedProjection.attempts.find(
      (candidate) => candidate.index === attemptIndex,
    ).event.baseCorrection,
    'post-import Array.prototype.every pollution cannot promote malformed data',
  );
  t.end();
});

tap.test('command refuses artifact drift and malformed rejection authority', (t) => {
  const drifted = mixedBaseFixture(t);
  const driftedLog = readLog(drifted.fx.root, drifted.fx.quest.id);
  const attemptEvent = driftedLog[drifted.attemptIndex];
  fs.appendFileSync(
    path.join(drifted.fx.root, attemptEvent.changeRef.slice('diff:'.length)),
    '\n',
  );
  t.throws(
    () => runAttemptBaseCorrectionCommand(drifted.fx.root, {
      'id': drifted.fx.quest.id,
      'attempt-index': String(drifted.attemptIndex),
      'to-base': drifted.rejectedBase,
      'reason': 'artifact drift attack',
    }),
    /sealed change artifact has drifted/u,
  );

  const fx = fixture();
  t.teardown(() => fs.rmSync(fx.root, {recursive: true, force: true}));
  const rejectedBase = git(fx.root, ['rev-parse', 'HEAD']).trim();
  commitAttempt(fx, {'src/a.js': 'export const a = 2;\n'}, 1, 'first');
  appendEvent(fx.root, fx.quest.id, {
    type: 'finding',
    frontier: fx.quest.frontiers[0].id,
    kind: 'verifier-rejection',
    evidence: 'subagent:malformed',
    verification: {
      schemaVersion: 2,
      scope: 'candidate',
      baseCommit: rejectedBase,
      lastAttemptIndex: 1,
      verdict: 'rejected',
    },
  });
  fs.writeFileSync(path.join(fx.root, 'planning.md'), 'planning\n');
  git(fx.root, ['add', 'planning.md']);
  git(fx.root, ['commit', '-m', 'different base']);
  const wrongBase = git(fx.root, ['rev-parse', 'HEAD']).trim();
  commitAttempt(
    fx,
    {
      'src/a.js': 'export const a = 3;\n',
      'src/b.js': 'export const b = 2;\n',
    },
    0,
    'replacement',
    wrongBase,
  );
  const malformedLog = readLog(fx.root, fx.quest.id);
  const malformedAttemptIndex =
    malformedLog.findLastIndex((event) => event.type === 'attempt');
  t.throws(
    () => runAttemptBaseCorrectionCommand(fx.root, {
      'id': fx.quest.id,
      'attempt-index': String(malformedAttemptIndex),
      'to-base': rejectedBase,
      'reason': 'malformed authority attack',
    }),
    /standing earlier candidate-rejection base/u,
  );
  t.end();
});

tap.test('shape-complete rejection must bind an earlier sealed attempt', (t) => {
  const fx = fixture();
  t.teardown(() => fs.rmSync(fx.root, {recursive: true, force: true}));
  const rejectedBase = git(fx.root, ['rev-parse', 'HEAD']).trim();
  appendEvent(fx.root, fx.quest.id, {
    type: 'finding',
    frontier: fx.quest.frontiers[0].id,
    kind: 'verifier-rejection',
    evidence: 'subagent:unbound-rejection',
    verification: {
      schemaVersion: 2,
      scope: 'candidate',
      fingerprint: `sha256:${'a'.repeat(64)}`,
      baseCommit: rejectedBase,
      paths: ['src/a.js'],
      sourcePaths: ['src/a.js'],
      firstAttemptIndex: 0,
      lastAttemptIndex: 0,
      verdict: 'rejected',
    },
  });
  fs.writeFileSync(path.join(fx.root, 'planning.md'), 'planning\n');
  git(fx.root, ['add', 'planning.md']);
  git(fx.root, ['commit', '-m', 'different base']);
  const wrongBase = git(fx.root, ['rev-parse', 'HEAD']).trim();
  commitAttempt(
    fx,
    {'src/a.js': 'export const a = 2;\n'},
    0,
    'mistaken-attempt',
    wrongBase,
  );
  const log = readLog(fx.root, fx.quest.id);
  const attemptIndex =
    log.findLastIndex((event) => event.type === 'attempt');
  t.throws(
    () => runAttemptBaseCorrectionCommand(fx.root, {
      'id': fx.quest.id,
      'attempt-index': String(attemptIndex),
      'to-base': rejectedBase,
      'reason': 'unbound receipt attack',
    }),
    /standing earlier candidate-rejection base/u,
  );
  t.notOk(
    readLog(fx.root, fx.quest.id).some(
      (event) => event.type === EVENT_ATTEMPT_BASE_CORRECTED,
    ),
    'the unbound receipt cannot append a correction',
  );
  t.end();
});
