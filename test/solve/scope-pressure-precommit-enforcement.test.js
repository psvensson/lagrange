import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import tap from 'tap';

import {
  EVENT_ATTEMPT,
  EVENT_FINDING,
  EVENT_QUEST,
  SCOPE_PRESSURE_BYTE_LIMIT,
  SCOPE_PRESSURE_FILE_LIMIT,
  SCOPE_PRESSURE_OWNER_LIMIT,
  STATUS_SOLVED,
} from '../../scripts/solve/constants.js';
import {buildHandoff} from '../../scripts/solve/handoff.js';
import {inspectChangeArtifact} from '../../scripts/solve/change-artifact.js';
import {writeContentAddressedChangeArtifact} from
  '../../scripts/solve/content-addressed-change-artifact.js';
import {scopeTerminalStatus} from '../../scripts/solve/convergence-guards.js';
import {analyzeScopePressureCandidate} from
  '../../scripts/solve/scope-pressure.js';
import {runStep, stepPending} from '../../scripts/solve/step.js';
import {
  appendEvent,
  appendGuardOverride,
  introducedScopePaths,
  readLog,
  saveQuest,
} from '../../scripts/solve/store.js';

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'scope-precommit-'));
}

function setup() {
  const root = tempRoot();
  const oracle = path.join(root, 'oracle.json');
  fs.writeFileSync(oracle, JSON.stringify({metric: 1, target: 0}));
  const quest = {
    id: 'solver-scope-guard',
    class: 'process',
    statement: 'Enforce scope before commit.',
    doneWhen: {probe: 'oracle', args: {file: oracle}},
    frontiers: [{
      id: 'solver-scope-guard-main',
      priority: 1,
      metric: {probe: 'oracle', args: {file: oracle}},
    }],
  };
  saveQuest(root, quest);
  runStep(root, quest);
  return {root, quest};
}

function makeDiff(root, paths, bytes = 0, name = 'change') {
  const file = path.join(
    root, 'solve/changes/solver-scope-guard', `${name}.diff`);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const content = paths.flatMap((filePath) => [
    `diff --git a/${filePath} b/${filePath}`,
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
    '@@ -1 +1 @@',
    '-before',
    '+after',
  ]).join('\n').padEnd(bytes, 'x');
  fs.writeFileSync(file, content);
  return `diff:${file}`;
}

function commit(root, quest, changeRef) {
  return runStep(root, quest, {changeRef, summary: 'scope fixture'});
}

tap.test('real step accepts below and exactly-equal path bounds', (t) => {
  for (const count of [SCOPE_PRESSURE_FILE_LIMIT - 1, SCOPE_PRESSURE_FILE_LIMIT]) {
    const {root, quest} = setup();
    const paths = Array.from({length: count}, (_, index) =>
      `scripts/solve/case-${index}.js`);
    const result = commit(root, quest, makeDiff(root, paths));
    t.same(result.violations, [], `${count} paths accepted`);
    t.equal(readLog(root, quest.id).filter((event) =>
      event.type === EVENT_ATTEMPT).length, 1);
    fs.rmSync(root, {recursive: true, force: true});
  }
  t.end();
});

tap.test('real step rejects one-above path bound before attempt recording', (t) => {
  const {root, quest} = setup();
  const paths = Array.from({length: SCOPE_PRESSURE_FILE_LIMIT + 1}, (_, index) =>
    `scripts/solve/case-${index}.js`);
  t.throws(() => commit(root, quest, makeDiff(root, paths)),
    /scope-pressure precommit blocked.*files=26/iu);
  t.equal(readLog(root, quest.id).some((event) => event.type === EVENT_ATTEMPT), false);
  t.ok(stepPending(root, quest.id), 'pending step survives split-required refusal');
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('a consumed scope override durably authorizes its exact scope', (t) => {
  const {root, quest} = setup();
  const paths = Array.from({length: SCOPE_PRESSURE_FILE_LIMIT + 1}, (_, index) =>
    `scripts/solve/case-${index}.js`);
  appendGuardOverride(root, quest.id, {
    frontier: quest.frontiers[0].id,
    code: 'blocked-scope',
    reason: 'the atomic migration has an independently bounded generated-path manifest',
  });
  const result = commit(root, quest, makeDiff(root, paths));
  t.same(result.violations, []);
  const log = readLog(root, quest.id);
  t.equal(log.filter((event) => event.type === EVENT_ATTEMPT).length, 1);
  t.ok(log.some((event) => event.type === 'gate-decision' && event.override),
    'the exception is consumed and durable rather than silently bypassed');
  const handoff = buildHandoff(root, quest, {dirtyFiles: []});
  t.notMatch(handoff.gate.problems.map((item) => item.message).join(' '),
    /scope-pressure precommit blocked/iu,
    'terminal handoff honors the exact consumed attempt admission');
  const second = runStep(root, quest);
  t.equal(second.terminal, null,
    'begin does not duplicate exact candidate admission');
  t.doesNotThrow(() => commit(root, quest, makeDiff(root, paths, 0, 'second')),
    'the derived exact signature authorizes a replacement candidate');
  t.equal(readLog(root, quest.id).filter((event) =>
    event.type === EVENT_ATTEMPT).length, 2,
  'durable authorization adds no second override ceremony');
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('covered scope stays authorized without another override event', (t) => {
  const {root, quest} = setup();
  const paths = Array.from({length: SCOPE_PRESSURE_FILE_LIMIT + 1}, (_, index) =>
    `scripts/solve/case-${index}.js`);
  const changedPaths = [...paths, 'solve/OVERVIEW.generated.md'];
  appendGuardOverride(root, quest.id, {
    frontier: quest.frontiers[0].id,
    code: 'blocked-scope',
    reason: 'the initial atomic migration scope was reviewed explicitly',
    scopeSignature: paths,
  });
  commit(root, quest, makeDiff(root, changedPaths, 0, 'first'));

  runStep(root, quest);
  t.doesNotThrow(() =>
    commit(root, quest, makeDiff(root, changedPaths, 0, 'replacement')),
  'a same admitted scope needs no override when raw projections are present');
  const log = readLog(root, quest.id);
  const reauthorizations = log.filter((event) =>
    event.type === 'guard-override' && event.scopeReauthorization === true);
  t.equal(reauthorizations.length, 0,
    'durable exact/subset authorization adds no bookkeeping event');
  t.equal(log.filter((event) => event.type === EVENT_ATTEMPT).length, 2);
  const handoff = buildHandoff(root, quest, {dirtyFiles: []});
  t.notMatch(handoff.gate.problems.map((item) => item.message).join(' '),
    /scope-pressure precommit blocked/iu,
    'terminal handoff honors durable authorization after a replacement attempt');
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('ambient collection changes cannot authorize grown scope', (t) => {
  const {root, quest} = setup();
  const authorized = Array.from(
    {length: SCOPE_PRESSURE_FILE_LIMIT + 1},
    (_, index) => `scripts/solve/case-${index}.js`,
  );
  const grown = [...authorized, 'scripts/solve/unreviewed-growth.js'];
  appendGuardOverride(root, quest.id, {
    frontier: quest.frontiers[0].id,
    code: 'blocked-scope',
    reason: 'the initial atomic migration scope was reviewed explicitly',
    scopeSignature: authorized,
  });
  t.same(introducedScopePaths(
    readLog(root, quest.id), quest.frontiers[0].id, 'blocked-scope', grown),
  ['scripts/solve/unreviewed-growth.js'],
  'repair payload can name only the path beyond durable authorization');
  commit(root, quest, makeDiff(root, authorized, 0, 'first'));
  runStep(root, quest);
  const grownRef = makeDiff(root, grown, 0, 'grown');
  const everyDescriptor = Object.getOwnPropertyDescriptor(
    Array.prototype, 'every');
  try {
    Reflect.defineProperty(Array.prototype, 'every', {
      ...everyDescriptor,
      value: () => true,
    });
    t.throws(() => commit(root, quest, grownRef),
      /scope-pressure precommit blocked.*files=27/iu,
      'hostile ambient every cannot make a new path look authorized');
  } finally {
    Reflect.defineProperty(Array.prototype, 'every', everyDescriptor);
  }
  const attempts = readLog(root, quest.id).filter((event) =>
    event.type === EVENT_ATTEMPT);
  t.equal(attempts.length, 1, 'the grown candidate was not recorded');
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('derived exact authorization reports only later scope growth', (t) => {
  const {root, quest} = setup();
  const authorized = Array.from(
    {length: SCOPE_PRESSURE_FILE_LIMIT + 1},
    (_, index) => `scripts/solve/case-${index}.js`,
  );
  appendEvent(root, quest.id, {
    type: 'gate-decision',
    frontier: quest.frontiers[0].id,
    code: 'blocked-scope',
    outcome: 'continue',
    override: 'pre-artifact authorization consumed at exact admission',
    scopeSignature: authorized,
  });
  const grown = [...authorized, 'scripts/solve/unreviewed-growth.js'];
  t.same(introducedScopePaths(
    readLog(root, quest.id), quest.frontiers[0].id, 'blocked-scope', grown),
  ['scripts/solve/unreviewed-growth.js'],
  'repair paths exclude the exact scope derived at override consumption');
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('real step rejects owner and byte overflow independently', (t) => {
  {
    const {root, quest} = setup();
    const equalPaths = Array.from({length: SCOPE_PRESSURE_OWNER_LIMIT}, (_, index) =>
      `scripts/owner-${index}/file.js`);
    t.same(commit(root, quest, makeDiff(root, equalPaths)).violations, [],
      'owner count equal to limit is accepted');
    fs.rmSync(root, {recursive: true, force: true});
  }
  {
    const {root, quest} = setup();
    const paths = Array.from({length: SCOPE_PRESSURE_OWNER_LIMIT + 1}, (_, index) =>
      `scripts/owner-${index}/file.js`);
    t.throws(() => commit(root, quest, makeDiff(root, paths)), /owners=7/iu);
    fs.rmSync(root, {recursive: true, force: true});
  }
  {
    const {root, quest} = setup();
    const changeRef = makeDiff(
      root,
      ['scripts/solve/large.js'],
      SCOPE_PRESSURE_BYTE_LIMIT,
    );
    t.same(commit(root, quest, changeRef).violations, [],
      'payload bytes equal to limit are accepted');
    fs.rmSync(root, {recursive: true, force: true});
  }
  {
    const {root, quest} = setup();
    const inlinePath = 'solve/changes/solver-scope-guard/large.diff';
    const content = fs.readFileSync(makeDiff(
      root,
      ['scripts/solve/large.js'],
      SCOPE_PRESSURE_BYTE_LIMIT + 1,
    ).slice('diff:'.length));
    fs.rmSync(path.join(root, inlinePath), {force: true});
    const written = writeContentAddressedChangeArtifact(
      root, inlinePath, content, {thresholdBytes: 0});
    t.throws(() => commit(root, quest, written.changeRef), /bytes=262145/iu);
    fs.rmSync(root, {recursive: true, force: true});
  }
  t.end();
});

tap.test('generated projections stay visible without inflating authored admission', (t) => {
  const {root, quest} = setup();
  const changeRef = makeDiff(root, [
    'scripts/solve/overview.js',
    'solve/OVERVIEW.generated.md',
  ], SCOPE_PRESSURE_BYTE_LIMIT + 1000);
  const inspection = inspectChangeArtifact(root, quest, changeRef);
  const pressure = analyzeScopePressureCandidate(
    root, quest, readLog(root, quest.id), inspection,
  );

  t.same(pressure.changedPaths, [
    'scripts/solve/overview.js',
    'solve/OVERVIEW.generated.md',
  ], 'operator diagnostics retain the complete changed-path set');
  t.same(pressure.admission.changedPaths, ['scripts/solve/overview.js'],
    'the authored admission set excludes the known deterministic projection');
  t.ok(pressure.changedBytes > SCOPE_PRESSURE_BYTE_LIMIT,
    'raw scope remains observable');
  t.notOk(scopeTerminalStatus(pressure).terminal,
    'large deterministic output does not force a fake Quest split');
  t.same(commit(root, quest, changeRef).violations, [],
    'the real precommit owner applies the same admission projection');
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('content-addressed storage bytes do not inflate authored admission', (t) => {
  const {root, quest} = setup();
  const changeRef = makeDiff(root, [
    'scripts/solve/overview.js',
    'solve/artifacts/sha256/aa/prior.diff.gz',
  ], SCOPE_PRESSURE_BYTE_LIMIT + 1000);
  const inspection = inspectChangeArtifact(root, quest, changeRef);
  const pressure = analyzeScopePressureCandidate(
    root, quest, readLog(root, quest.id), inspection,
  );

  t.same(pressure.changedPaths, ['scripts/solve/overview.js'],
    'immutable Solver storage is bookkeeping, not authored scope');
  t.ok(pressure.changedBytes > SCOPE_PRESSURE_BYTE_LIMIT,
    'the complete payload remains visible diagnostically');
  t.ok(pressure.admission.changedBytes < SCOPE_PRESSURE_BYTE_LIMIT,
    'bookkeeping bytes are removed from the admission projection');
  t.notOk(scopeTerminalStatus(pressure).terminal,
    'stored attempt objects cannot force a fake Quest split');
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('handoff rejects historical over-threshold attempt', (t) => {
  const {root, quest} = setup();
  const paths = Array.from({length: SCOPE_PRESSURE_FILE_LIMIT + 1}, (_, index) =>
    `scripts/solve/case-${index}.js`);
  const changeRef = makeDiff(root, paths);
  appendEvent(root, quest.id, {
    type: EVENT_ATTEMPT,
    frontier: quest.frontiers[0].id,
    changeRef,
    metricBefore: 1,
    metricAfter: 1,
  });
  appendEvent(root, quest.id, {
    type: EVENT_FINDING,
    frontier: quest.frontiers[0].id,
    claim: 'self-authored baseline must not authorize handoff',
    scopePressureClassification: {resolution: 'baselined'},
  });
  appendEvent(root, quest.id, {
    type: EVENT_FINDING,
    frontier: quest.frontiers[0].id,
    kind: 'verifier-approval',
    evidence: 'subagent:scope-test',
  });
  appendEvent(root, quest.id, {type: EVENT_QUEST, status: STATUS_SOLVED});

  const handoff = buildHandoff(root, quest, {dirtyFiles: []});
  t.equal(handoff.ok, false);
  t.match(handoff.gate.problems.map((item) => item.message).join(' '),
    /scope-pressure precommit blocked/iu);

  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('bounded current attempts are not charged as cumulative history', (t) => {
  const {root, quest} = setup();
  const firstPaths = Array.from({length: 13}, (_, index) =>
    `scripts/solve/first-${index}.js`);
  commit(root, quest, makeDiff(root, firstPaths, 0, 'first'));
  runStep(root, quest);
  const secondPaths = Array.from({length: 13}, (_, index) =>
    `scripts/solve/second-${index}.js`);
  t.doesNotThrow(() =>
    commit(root, quest, makeDiff(root, secondPaths, 0, 'second')));
  t.equal(readLog(root, quest.id).filter((event) =>
    event.type === EVENT_ATTEMPT).length, 2,
  'both independently bounded current candidates are recorded');
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('candidate byte admission charges only the current snapshot', (t) => {
  const {root, quest} = setup();
  const baseCommit = '1'.repeat(40);
  const firstRef = makeDiff(
    root,
    ['scripts/solve/overlap.js'],
    SCOPE_PRESSURE_BYTE_LIMIT - 1,
    'first-overlap',
  );
  appendEvent(root, quest.id, {
    type: EVENT_ATTEMPT,
    frontier: quest.frontiers[0].id,
    changeRef: firstRef,
    workspaceBaseCommit: baseCommit,
  });
  const replacementRef = makeDiff(
    root,
    ['scripts/solve/overlap.js'],
    SCOPE_PRESSURE_BYTE_LIMIT - 1,
    'replacement-overlap',
  );
  const replacement = inspectChangeArtifact(root, quest, replacementRef);
  const overlapping = analyzeScopePressureCandidate(
    root,
    quest,
    readLog(root, quest.id),
    replacement,
    {workspaceBaseCommit: baseCommit},
  );
  t.equal(
    overlapping.changedBytes,
    SCOPE_PRESSURE_BYTE_LIMIT - 1,
    'the replacement snapshot is charged once',
  );
  t.equal(scopeTerminalStatus(overlapping).terminal, false);

  const oversizedRef = makeDiff(
    root,
    ['scripts/solve/overlap.js'],
    SCOPE_PRESSURE_BYTE_LIMIT + 1,
    'oversized-overlap',
  );
  const oversizedLog = readLog(root, quest.id);
  oversizedLog.push({
    type: EVENT_ATTEMPT,
    frontier: quest.frontiers[0].id,
    changeRef: oversizedRef,
    workspaceBaseCommit: baseCommit,
  });
  const smallerRef = makeDiff(
    root,
    ['scripts/solve/overlap.js'],
    1_000,
    'smaller-overlap',
  );
  const smallerReplacement = analyzeScopePressureCandidate(
    root,
    quest,
    oversizedLog,
    inspectChangeArtifact(root, quest, smallerRef),
    {workspaceBaseCommit: baseCommit},
  );
  t.equal(
    smallerReplacement.changedBytes,
    1_000,
    'a bounded current snapshot is not charged for historical oversized bytes',
  );
  t.equal(scopeTerminalStatus(smallerReplacement).terminal, false);

  const disjointRef = makeDiff(
    root,
    ['scripts/solve/disjoint.js'],
    SCOPE_PRESSURE_BYTE_LIMIT - 1,
    'disjoint',
  );
  const disjoint = analyzeScopePressureCandidate(
    root,
    quest,
    readLog(root, quest.id),
    inspectChangeArtifact(root, quest, disjointRef),
    {workspaceBaseCommit: baseCommit},
  );
  t.equal(
    disjoint.changedBytes,
    SCOPE_PRESSURE_BYTE_LIMIT - 1,
    'disjoint history is not charged to the current candidate',
  );
  t.equal(scopeTerminalStatus(disjoint).terminal, false);
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});
