import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {appendEvent, saveQuest, readLog, projectState}
  from '../../scripts/solve/store.js';
import {runStep} from '../../scripts/solve/step.js';
import {EVENT_SOLVED, EVENT_QUEST, STATUS_SOLVED}
  from '../../scripts/solve/constants.js';

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'step-'));
}

function makeDiff(root, name) {
  const file = path.join(root, 'solve', 'changes', 'demo', `${name}.diff`);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, [
    'diff --git a/src/demo.js b/src/demo.js',
    '--- a/src/demo.js',
    '+++ b/src/demo.js',
    '@@ -1 +1 @@',
    `-${name} before`,
    `+${name} after`,
  ].join('\n'));
  return `diff:${file}`;
}

function makeMultiDiff(root, questId, name, changedPaths) {
  const file = path.join(root, 'solve', 'changes', questId, `${name}.diff`);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, changedPaths.flatMap((changedPath) => [
    `diff --git a/${changedPath} b/${changedPath}`,
    `--- a/${changedPath}`,
    `+++ b/${changedPath}`,
    '@@ -1 +1 @@',
    '-before',
    '+after',
  ]).join('\n'));
  return `diff:${file}`;
}

function goalFor(oracleFile) {
  return {
    id: 'demo',
    statement: 'Drive the oracle metric to zero.',
    priority: 1,
    doneWhen: {probe: 'oracle', args: {file: oracleFile}},
    frontiers: [
      {id: 'demo-main', priority: 1,
        metric: {probe: 'oracle', args: {file: oracleFile, metric: 'priority'}}},
    ],
  };
}

tap.test('synchronous runStep (P3)', async (t) => {
  t.test('runStep records a successful step with progress', (t) => {
    const root = tmp();
    const oracle = path.join(root, 'o.json');
    fs.writeFileSync(oracle, JSON.stringify({metric: 3, target: 0}));
    const quest = goalFor(oracle);
    saveQuest(root, quest);

    const begin = runStep(root, quest);
    t.equal(begin.before.metric, 3);

    // Operator makes changes and runs harness: metric drops to 1
    fs.writeFileSync(oracle, JSON.stringify({metric: 1, target: 0}));

    const r = runStep(root, quest, {
      changeRef: makeDiff(root, 'a'),
      summary: 'tighten guard',
    });

    t.equal(r.before, 3);
    t.equal(r.after, 1);
    t.equal(r.progressed, true);
    t.same(r.violations, []);

    const state = projectState(quest, readLog(root, quest.id));
    t.equal(state.frontiers[0].rungIndex, 0, 'progress keeps the rung');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('a flat step climbs the strategy ladder', (t) => {
    const root = tmp();
    const oracle = path.join(root, 'o.json');
    fs.writeFileSync(oracle, JSON.stringify({metric: 3, target: 0}));
    const quest = goalFor(oracle);
    saveQuest(root, quest);

    runStep(root, quest);

    // No change to metric
    const r = runStep(root, quest, {
      changeRef: makeDiff(root, 'b'),
      summary: 'no progress',
    });

    t.equal(r.before, 3);
    t.equal(r.after, 3);
    t.equal(r.progressed, false);

    const state = projectState(quest, readLog(root, quest.id));
    t.equal(state.frontiers[0].rungIndex, 1, 'stall climbs the ladder');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('invalid git changeRefs are rejected', (t) => {
    const root = tmp();
    const oracle = path.join(root, 'o.json');
    fs.writeFileSync(oracle, JSON.stringify({metric: 3, target: 0}));
    const quest = goalFor(oracle);
    saveQuest(root, quest);

    runStep(root, quest);

    t.throws(() => runStep(root, quest, {
      changeRef: 'git:abc123',
      summary: 'invalid diff',
    }), /invalid changeRef/);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('reaching target records solved status', (t) => {
    const root = tmp();
    const oracle = path.join(root, 'o.json');
    fs.writeFileSync(oracle, JSON.stringify({metric: 1, target: 0}));
    const quest = goalFor(oracle);
    saveQuest(root, quest);

    runStep(root, quest);

    fs.writeFileSync(oracle, JSON.stringify({metric: 0, target: 0}));

    const r = runStep(root, quest, {
      changeRef: makeDiff(root, 'c'),
      summary: 'target reached',
    });

    t.equal(r.done, true);
    const log = readLog(root, quest.id);
    t.ok(log.some((e) => e.type === EVENT_SOLVED), 'frontier EVENT_SOLVED recorded');
    t.ok(log.some((e) => e.type === EVENT_QUEST && e.status === STATUS_SOLVED), 'quest terminal recorded');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('runStep returns solved early if done_when holds', (t) => {
    const root = tmp();
    const oracle = path.join(root, 'o.json');
    fs.writeFileSync(oracle, JSON.stringify({metric: 0, target: 0}));
    const quest = goalFor(oracle);
    saveQuest(root, quest);

    // Record the solved event in the quest log first to simulate already solved
    appendEvent(root, quest.id, {
      type: 'quest',
      status: STATUS_SOLVED,
      evidence: 'o.json',
    });

    const r = runStep(root, quest);

    t.equal(r.terminal, 'solved');
    const log = readLog(root, quest.id);
    t.ok(log.some((e) => e.type === EVENT_QUEST && e.status === STATUS_SOLVED), 'solved persisted');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('begin step blocks when prior scope pressure is terminal', (t) => {
    const root = tmp();
    const oracle = path.join(root, 'o.json');
    fs.writeFileSync(oracle, JSON.stringify({metric: 3, target: 0}));
    const quest = goalFor(oracle);
    saveQuest(root, quest);

    runStep(root, quest);
    runStep(root, quest, {
      changeRef: makeMultiDiff(
        root,
        quest.id,
        'wide',
        Array.from({length: 61}, (_, i) => `src/scope/file-${i}.js`),
      ),
      summary: 'wide patch',
    });

    const gated = runStep(root, quest);
    t.equal(gated.terminal, 'blocked', 'terminal scope gate is a non-terminal block');
    t.equal(gated.disposition, 'reroute', 'scope pressure reroutes the approach');
    t.match(gated.problems.join('\n'), /scope pressure terminal/u);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('commit records a violation when before and after probe identities differ', (t) => {
    const root = tmp();
    const oracle = path.join(root, 'o.json');
    fs.writeFileSync(oracle, JSON.stringify({metric: 3, target: 0}));
    const quest = {
      id: 'demo',
      statement: 'Drive the oracle metric to zero.',
      priority: 1,
      doneWhen: {probe: 'oracle', args: {file: oracle}},
      frontiers: [
        {id: 'demo-main', priority: 1,
          metric: {probe: 'oracle', args: {file: oracle, metric: 'priority'}}},
      ],
    };
    saveQuest(root, quest);

    runStep(root, quest);
    fs.writeFileSync(oracle, JSON.stringify({metric: 2, target: 0}));
    const refinedQuest = {
      ...quest,
      frontiers: [{
        ...quest.frontiers[0],
        metric: {
          ...quest.frontiers[0].metric,
          args: {...quest.frontiers[0].metric.args, metric: 'distance'},
        },
      }],
    };
    const result = runStep(root, refinedQuest, {
      changeRef: makeDiff(root, 'identity-mismatch'),
      summary: 'refine metric between before and after sample',
    });

    t.ok(
      result.violations.some((item) => item.includes('same probe identity')),
      'actual before/after probe identity mismatch is not hidden',
    );
    const attemptEvent = readLog(root, quest.id)
      .find((event) => event.type === 'attempt');
    t.not(attemptEvent.beforeProbeKey, attemptEvent.afterProbeKey);

    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });
});
