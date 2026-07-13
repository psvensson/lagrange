import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {appendEvent} from '../../scripts/solve/store.js';
import {runStep} from '../../scripts/solve/step.js';
import {
  buildNextLines,
  buildNextProjection,
  runNextCommand,
} from '../../scripts/solve/next.js';
import {makeOracleQuest} from './solve-test-quest-fixture.js';
import {
  EVENT_GATE_DECISION,
  EVENT_QUEST,
  OUTCOME_BLOCKED,
  STATUS_SOLVED,
} from '../../scripts/solve/constants.js';

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'solve-next-'));
}

tap.test('solve next', async (t) => {
  t.test('always leads with a typed next-action line', (t) => {
    const root = tmp();
    makeOracleQuest(root);
    const lines = buildNextLines(root, 'demo');
    t.match(lines[0], /^Next \[executable-command\]: /u);
    t.ok(lines.length >= 3, 'a handful of context lines follow');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('surfaces a pending supervised step as commit-or-abort', (t) => {
    const root = tmp();
    const {quest} = makeOracleQuest(root);
    runStep(root, quest);

    const out = runNextCommand(root, 'demo');
    t.match(out, /^Next \[command-template\]: node scripts\/solve\.js step --id demo --commit/u);
    t.match(out, /--abort/u);
    t.match(out, /pending step: demo-main pinned at metric 3/u);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('surfaces the last gate stop nextCommand', (t) => {
    const root = tmp();
    makeOracleQuest(root);
    appendEvent(root, 'demo', {
      type: EVENT_GATE_DECISION,
      frontier: 'demo-main',
      disposition: 'reroute',
      code: 'blocked-scope',
      outcome: OUTCOME_BLOCKED,
      problems: ['scope pressure terminal'],
      nextCommand: 'node scripts/solve.js override --id demo --frontier demo-main --guard scope --reason "<why>"',
    });

    const lines = buildNextLines(root, 'demo');
    t.match(lines[0], /^Next \[command-template\]: node scripts\/solve\.js override --id demo/u);
    t.match(lines.join('\n'), /last stop: blocked-scope \(reroute\)/u);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('a terminal quest with a failed audit prescribes audit repair', (t) => {
    const root = tmp();
    makeOracleQuest(root);
    appendEvent(root, 'demo', {
      type: EVENT_QUEST,
      status: STATUS_SOLVED,
      evidence: 'oracle.json',
    });

    const lines = buildNextLines(root, 'demo');
    t.match(lines[0], /^Next \[manual-action\]: resolve terminal audit failures/u);
    t.match(lines[0], /audit --id demo/u);
    t.notOk(lines.some((line) => line.startsWith('blocker:')),
      'a terminal quest prints no (contradictory) blocker line');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('--json projection preserves the action type', (t) => {
    const root = tmp();
    makeOracleQuest(root);
    const projection = buildNextProjection(root, 'demo');
    t.equal(projection.schemaVersion, 1);
    t.same(projection.action, {
      type: 'executable-command',
      value: 'node scripts/solve.js step --id demo',
    });
    t.same(JSON.parse(runNextCommand(root, 'demo', {json: true})), projection);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('an unknown quest id reports quest-not-found, not raw ENOENT', (t) => {
    const root = tmp();
    t.throws(() => buildNextLines(root, 'no-such-quest'),
      /quest not found: no-such-quest/u);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });
});
