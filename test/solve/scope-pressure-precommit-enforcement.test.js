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

tap.test('one recorded scope override authorizes one over-bound step', (t) => {
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
  t.throws(() => commit(root, quest, makeDiff(root, paths, 0, 'second')),
    /scope-pressure precommit blocked.*files=26/iu,
    'the consumed override cannot authorize a second candidate');
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

tap.test('cumulative attempts cannot each stay small while crossing the bound', (t) => {
  const {root, quest} = setup();
  const firstPaths = Array.from({length: 13}, (_, index) =>
    `scripts/solve/first-${index}.js`);
  commit(root, quest, makeDiff(root, firstPaths, 0, 'first'));
  runStep(root, quest);
  const secondPaths = Array.from({length: 13}, (_, index) =>
    `scripts/solve/second-${index}.js`);
  t.throws(() => commit(root, quest, makeDiff(root, secondPaths, 0, 'second')),
    /scope-pressure precommit blocked.*files=26/iu);
  t.equal(readLog(root, quest.id).filter((event) =>
    event.type === EVENT_ATTEMPT).length, 1,
  'only the bounded first attempt is recorded');
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('same-base full snapshots replace overlapping byte charges only', (t) => {
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
    SCOPE_PRESSURE_BYTE_LIMIT + 1,
    'a covering replacement cannot hide an oversized snapshot',
  );
  t.equal(scopeTerminalStatus(smallerReplacement).terminal, true);

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
    (SCOPE_PRESSURE_BYTE_LIMIT - 1) * 2,
    'disjoint same-base scope remains cumulative',
  );
  t.equal(scopeTerminalStatus(disjoint).terminal, true);
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});
