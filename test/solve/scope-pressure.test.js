import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  analyzeScopePressure,
  analyzeScopePressureCandidate,
} from '../../scripts/solve/scope-pressure.js';
import {appendEvent, saveQuest, readLog} from '../../scripts/solve/store.js';

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'scope-pressure-'));
}

function makeQuest(root) {
  const oracle = path.join(root, 'oracle.json');
  fs.writeFileSync(oracle, JSON.stringify({metric: 1, target: 0}));
  const quest = {
    id: 'scope-demo',
    statement: 'Drive metric to zero.',
    priority: 1,
    doneWhen: {probe: 'oracle', args: {file: oracle}},
    frontiers: [
      {id: 'scope-demo-main', priority: 1,
        metric: {probe: 'oracle', args: {file: oracle}}},
    ],
  };
  saveQuest(root, quest);
  return quest;
}

function makeDiff(root, questId, name, paths) {
  const file = path.join(root, 'solve', 'changes', questId, `${name}.diff`);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, paths.flatMap((changedPath) => [
    `diff --git a/${changedPath} b/${changedPath}`,
    `--- a/${changedPath}`,
    `+++ b/${changedPath}`,
    '@@ -1 +1 @@',
    '-before',
    '+after',
  ]).join('\n'));
  return `diff:${file}`;
}

tap.test('scope pressure reports attempt contributions and split plan', (t) => {
  const root = tmp();
  const quest = makeQuest(root);
  appendEvent(root, quest.id, {
    type: 'attempt',
    frontier: 'scope-demo-main',
    changeRef: makeDiff(root, quest.id, 'mixed', [
      'src/admin/a.js',
      'src/admin/b.js',
      'scripts/solve/step.js',
      'test/distributed/harness/h.js',
    ]),
  });

  const pressure = analyzeScopePressure(root, quest, readLog(root, quest.id));
  t.same(pressure.ownerAreas.sort(), [
    'scripts/solve',
    'src/admin',
    'test/distributed/harness',
  ]);
  t.equal(pressure.attempts.length, 1);
  t.equal(pressure.attempts[0].fileCount, 4);
  t.ok(
    pressure.recommendedActions.some((action) =>
      action.includes('land or separate 3 owner areas')),
    'names the owner-area reduction action',
  );
  t.same(
    pressure.splitPlan.map((group) => [group.ownerArea, group.fileCount]),
    [
      ['src/admin', 2],
      ['scripts/solve', 1],
      ['test/distributed/harness', 1],
    ],
    'split plan is grouped by owner area',
  );

  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('scope pressure baseline ignores historical attempts but counts new attempts', (t) => {
  const root = tmp();
  const quest = makeQuest(root);
  appendEvent(root, quest.id, {
    type: 'attempt',
    frontier: 'scope-demo-main',
    changeRef: makeDiff(root, quest.id, 'historical', [
      'src/admin/a.js',
      'src/bootstrap/b.js',
      'src/query/c.js',
    ]),
  });
  appendEvent(root, quest.id, {
    type: 'finding',
    frontier: 'scope-demo-main',
    claim: 'Historical scope was split and landed.',
    evidence: 'commit:abc123',
    scopePressureClassification: {
      resolution: 'baselined',
    },
  });
  appendEvent(root, quest.id, {
    type: 'attempt',
    frontier: 'scope-demo-main',
    changeRef: makeDiff(root, quest.id, 'current', [
      'src/transport/router.js',
      'test/transport/router.test.js',
    ]),
  });

  const pressure = analyzeScopePressure(root, quest, readLog(root, quest.id));
  t.same(pressure.changedPaths.sort(), [
    'src/transport/router.js',
    'test/transport/router.test.js',
  ]);
  t.equal(pressure.attempts.length, 1, 'only post-baseline attempts are counted');
  t.same(pressure.ownerAreas.sort(), ['src/transport', 'test/transport']);

  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('candidate admission charges only the current net source scope', (t) => {
  const root = tmp();
  const quest = makeQuest(root);
  appendEvent(root, quest.id, {
    type: 'attempt',
    frontier: 'scope-demo-main',
    workspaceBaseCommit: 'a'.repeat(40),
    changeRef: makeDiff(root, quest.id, 'historical-wide', [
      'src/admin/a.js',
      'src/bootstrap/b.js',
      'src/query/c.js',
      'src/runtime/d.js',
    ]),
  });
  const current = {
    content: '',
    payloadBytes: 12,
    categories: ['runtime'],
    changedPaths: ['src/transport/router.js'],
  };
  const pressure = analyzeScopePressureCandidate(
    root, quest, readLog(root, quest.id), current,
    {workspaceBaseCommit: 'b'.repeat(40)},
  );
  t.same(pressure.changedPaths, ['src/transport/router.js']);
  t.same(pressure.introducedPaths, ['src/transport/router.js']);
  t.equal(pressure.attempts.length, 1, 'historical attempts are not charged');
  t.equal(pressure.successorSuggestion, null,
    'a bounded candidate does not manufacture a successor');
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});
