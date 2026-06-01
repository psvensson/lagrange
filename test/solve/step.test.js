import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {saveQuest, readLog, projectState} from '../../scripts/solve/store.js';
import {stepBegin, stepCommit, stepAbort, stepPending}
  from '../../scripts/solve/step.js';
import {EVENT_ATTEMPT, EVENT_SOLVED, EVENT_QUEST, STATUS_SOLVED}
  from '../../scripts/solve/constants.js';

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'step-'));
}

// A change artifact the honesty check (changeRef resolves) can verify.
function makeDiff(root, name) {
  const file = path.join(root, `${name}.diff`);
  fs.writeFileSync(file, `# change ${name}\n`);
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

tap.test('manual step (P3)', async (t) => {
  t.test('begin emits a dossier and pins a pending baseline', (t) => {
    const root = tmp();
    const oracle = path.join(root, 'o.json');
    fs.writeFileSync(oracle, JSON.stringify({metric: 3, target: 0}));
    const quest = goalFor(oracle);
    saveQuest(root, quest);
    const out = stepBegin(root, quest);
    t.equal(out.terminal, null);
    t.equal(out.frontier, 'demo-main');
    t.match(out.dossier, /Rung 0 \(local-fix\)/);
    t.equal(out.before.metric, 3);
    const pending = stepPending(root, quest.id);
    t.equal(pending.before.metric, 3, 'baseline persisted across calls');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('out-of-band progress between begin and commit keeps the rung', (t) => {
    const root = tmp();
    const oracle = path.join(root, 'o.json');
    fs.writeFileSync(oracle, JSON.stringify({metric: 3, target: 0}));
    const quest = goalFor(oracle);
    saveQuest(root, quest);
    stepBegin(root, quest);
    // Operator does the work + re-runs the harness: metric drops 3 -> 1.
    fs.writeFileSync(oracle, JSON.stringify({metric: 1, target: 0}));
    const r = stepCommit(root, quest, {changeRef: makeDiff(root, 'a'),
      summary: 'tighten guard'});
    t.equal(r.before, 3);
    t.equal(r.after, 1);
    t.equal(r.progressed, true, 'honest progress recorded');
    t.same(r.violations, []);
    const state = projectState(quest, readLog(root, quest.id));
    t.equal(state.frontiers[0].rungIndex, 0, 'progress keeps the rung');
    t.equal(stepPending(root, quest.id), null, 'pending cleared');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('a flat step climbs the ladder', (t) => {
    const root = tmp();
    const oracle = path.join(root, 'o.json');
    fs.writeFileSync(oracle, JSON.stringify({metric: 3, target: 0}));
    const quest = goalFor(oracle);
    saveQuest(root, quest);
    stepBegin(root, quest);
    // No change to the oracle: metric stays 3.
    const r = stepCommit(root, quest, {changeRef: makeDiff(root, 'b'),
      summary: 'no effect'});
    t.equal(r.progressed, false);
    const state = projectState(quest, readLog(root, quest.id));
    t.equal(state.frontiers[0].rungIndex, 1, 'stall escalates one rung');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('git changeRefs are rejected as attempt proof', (t) => {
    const root = tmp();
    const oracle = path.join(root, 'o.json');
    fs.writeFileSync(oracle, JSON.stringify({metric: 3, target: 0}));
    const quest = goalFor(oracle);
    saveQuest(root, quest);
    stepBegin(root, quest);
    fs.writeFileSync(oracle, JSON.stringify({metric: 2, target: 0}));
    const r = stepCommit(root, quest, {changeRef: 'git:abc123',
      summary: 'claimed commit'});
    t.equal(r.progressed, false, 'invalid attempt proof blocks progress credit');
    t.match(r.violations.join('\n'), /changeRef does not resolve/);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('reaching the target records SOLVED for the frontier and quest', (t) => {
    const root = tmp();
    const oracle = path.join(root, 'o.json');
    fs.writeFileSync(oracle, JSON.stringify({metric: 1, target: 0}));
    const quest = goalFor(oracle);
    saveQuest(root, quest);
    stepBegin(root, quest);
    fs.writeFileSync(oracle, JSON.stringify({metric: 0, target: 0}));
    const r = stepCommit(root, quest, {changeRef: makeDiff(root, 'c'),
      summary: 'close it'});
    t.equal(r.done, true);
    const log = readLog(root, quest.id);
    const solved = log.some((e) => e.type === EVENT_SOLVED);
    const questSolved = log.some((e) =>
      e.type === EVENT_QUEST && e.status === STATUS_SOLVED);
    t.ok(solved, 'frontier EVENT_SOLVED recorded');
    t.ok(questSolved, 'quest terminal recorded');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('begin returns solved terminal when done_when already holds', (t) => {
    const root = tmp();
    const oracle = path.join(root, 'o.json');
    fs.writeFileSync(oracle, JSON.stringify({metric: 0, target: 0}));
    const quest = goalFor(oracle);
    saveQuest(root, quest);
    const out = stepBegin(root, quest);
    t.equal(out.terminal, 'solved');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('commit requires a changeRef and a prior begin', (t) => {
    const root = tmp();
    const oracle = path.join(root, 'o.json');
    fs.writeFileSync(oracle, JSON.stringify({metric: 2, target: 0}));
    const quest = goalFor(oracle);
    saveQuest(root, quest);
    t.throws(() => stepCommit(root, quest, {changeRef: 'diff:x'}),
      /no pending step/, 'commit without begin throws');
    stepBegin(root, quest);
    t.throws(() => stepCommit(root, quest, {}), /requires --changeRef/,
      'commit without changeRef throws');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('double begin is blocked until commit/abort', (t) => {
    const root = tmp();
    const oracle = path.join(root, 'o.json');
    fs.writeFileSync(oracle, JSON.stringify({metric: 2, target: 0}));
    const quest = goalFor(oracle);
    saveQuest(root, quest);
    stepBegin(root, quest);
    t.throws(() => stepBegin(root, quest), /already pending/);
    t.ok(stepAbort(root, quest.id), 'abort clears the pending step');
    t.equal(stepPending(root, quest.id), null);
    // After abort, begin works again and no attempt was recorded.
    stepBegin(root, quest);
    t.equal(readLog(root, quest.id).filter((e) => e.type === EVENT_ATTEMPT).length, 0);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });
});
