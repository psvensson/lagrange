import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  analyzeScopePressure,
  analyzeScopePressureCandidate,
  renderScopePressure,
  semanticScopeForPath,
} from '../../scripts/solve/scope-pressure.js';
import {scopeTerminalStatus} from '../../scripts/solve/convergence-guards.js';
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
  t.same(pressure.semanticOwnerAreas, [
    'runtime/admin',
    'runtime/harness',
    'workflow/solver',
  ]);
  t.same(pressure.implementationPaths, [
    'scripts/solve/step.js',
    'src/admin/a.js',
    'src/admin/b.js',
  ]);
  t.same(pressure.proofTailPaths, ['test/distributed/harness/h.js']);
  t.same(pressure.semanticSplitPlan.map((group) => [
    group.semanticOwner,
    group.fileCount,
    group.implementationCount,
    group.proofTailCount,
  ]), [
    ['runtime/admin', 2, 2, 0],
    ['runtime/harness', 1, 0, 1],
    ['workflow/solver', 1, 1, 0],
  ]);

  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('semantic scope pairs implementation with proof tails path-only', (t) => {
  const cases = [
    ['src/admin/router.js', 'runtime/admin', 'implementation'],
    ['test/admin/router.test.js', 'runtime/admin', 'proof-tail'],
    ['scripts/solve/next.js', 'workflow/solver', 'implementation'],
    ['test/solve/next.test.js', 'workflow/solver', 'proof-tail'],
    ['test/distributed/harness/clock.js', 'runtime/harness', 'proof-tail'],
    ['test/distributed/scenarios/restart.js', 'runtime/scenarios', 'proof-tail'],
    ['docs/steering/system-guidelines.md', 'workflow/steering', 'proof-tail'],
    ['docs/steering/llm/rules.json', 'workflow/steering', 'proof-tail'],
    ['architecture/contracts/query.md', 'workflow/steering', 'proof-tail'],
    ['solve/oracle/demo.json', 'workflow/solver', 'proof-tail'],
    ['solve/report/demo.md', 'workflow/solver', 'proof-tail'],
    ['solve/epics/plan.md', 'solve', 'implementation'],
    ['test/contract/schema.test.js', 'test/contract', 'implementation'],
    ['src/index.js', 'src/index.js', 'implementation'],
    ['package.json', 'package.json', 'implementation'],
    ['unknown/place/file', 'unknown', 'implementation'],
  ];
  for (const [filePath, semanticOwner, role] of cases) {
    t.same(semanticScopeForPath(filePath), {semanticOwner, role}, filePath);
  }
  t.end();
});

tap.test('semantic runtime registry covers every current src directory', (t) => {
  const sourceDomains = fs.readdirSync(path.resolve('src'), {
    withFileTypes: true,
  }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  for (const domain of sourceDomains) {
    t.same(semanticScopeForPath(`test/${domain}/proof.test.js`), {
      semanticOwner: `runtime/${domain}`,
      role: 'proof-tail',
    }, domain);
  }
  t.end();
});

tap.test('candidate scope applies the same complete semantic partition', (t) => {
  const root = tmp();
  const quest = makeQuest(root);
  const pressure = analyzeScopePressureCandidate(root, quest, [], {
    changedPaths: [
      'src/admin/router.js',
      'test/admin/router.test.js',
      'test/contract/schema.test.js',
    ],
    payloadBytes: 100,
    categories: ['runtime', 'test'],
  });
  t.same(pressure.implementationPaths, [
    'src/admin/router.js',
    'test/contract/schema.test.js',
  ]);
  t.same(pressure.proofTailPaths, ['test/admin/router.test.js']);
  t.same(pressure.admission.pathRoles, pressure.pathRoles);
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('semantic projection is a complete disjoint partition and renders first',
  (t) => {
    const root = tmp();
    const quest = makeQuest(root);
    const paths = [
      'src/admin/a.js',
      'test/admin/a.test.js',
      'scripts/solve/scope-pressure.js',
      'test/solve/scope-pressure.test.js',
      'docs/steering/llm/rules.json',
      'solve/epics/plan.md',
    ];
    appendEvent(root, quest.id, {
      type: 'attempt',
      frontier: 'scope-demo-main',
      changeRef: makeDiff(root, quest.id, 'semantic', paths),
    });
    const pressure = analyzeScopePressure(root, quest, readLog(root, quest.id));
    const union = [...pressure.implementationPaths, ...pressure.proofTailPaths]
      .sort();
    t.same(union, pressure.changedPaths);
    t.same(pressure.implementationPaths.filter((filePath) =>
      pressure.proofTailPaths.includes(filePath)), []);
    t.equal(pressure.pathRoles.length, pressure.changedPaths.length);
    for (const group of pressure.semanticSplitPlan) {
      t.equal(group.fileCount,
        group.implementationCount + group.proofTailCount);
    }
    const rendered = renderScopePressure(pressure);
    t.ok(rendered.includes(
      '- Proof-tail grouping is guidance only; every path remains required and guard-counted.'),
    'makes the proof-tail obligation explicit');
    t.ok(rendered.indexOf(
      '- Semantic plan (proof tails stay with their owner):') <
      rendered.indexOf('- Conservative guard plan (physical owner areas):'));
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

tap.test('empty scope has a deterministic empty semantic projection', (t) => {
  const root = tmp();
  const quest = makeQuest(root);
  const pressure = analyzeScopePressure(root, quest, []);
  t.same(pressure.changedPaths, []);
  t.same(pressure.semanticOwnerAreas, []);
  t.same(pressure.implementationPaths, []);
  t.same(pressure.proofTailPaths, []);
  t.same(pressure.pathRoles, []);
  t.same(pressure.semanticSplitPlan, []);
  t.notMatch(renderScopePressure(pressure), [
    '- Semantic plan (proof tails stay with their owner):',
  ]);
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('terminal scope guard ignores semantic guidance in both directions',
  (t) => {
    const underConservative = {
      admission: {
        changedPaths: ['scripts/solve/a.js'],
        ownerAreas: ['scripts/solve'],
        changedBytes: 10,
        semanticOwnerAreas: Array.from({length: 100}, (_, index) =>
          `semantic/${index}`),
      },
    };
    t.notOk(scopeTerminalStatus(underConservative).terminal,
      'large semantic guidance cannot strengthen the conservative admission');
    const overConservative = {
      admission: {
        changedPaths: Array.from({length: 26}, (_, index) => `file-${index}`),
        ownerAreas: ['physical'],
        changedBytes: 10,
        semanticOwnerAreas: ['one-semantic-owner'],
      },
    };
    t.ok(scopeTerminalStatus(overConservative).terminal,
      'a small semantic plan cannot weaken conservative admission');
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
  t.same(pressure.semanticOwnerAreas, ['runtime/transport']);
  t.same(pressure.implementationPaths, ['src/transport/router.js']);
  t.same(pressure.proofTailPaths, ['test/transport/router.test.js']);

  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});
