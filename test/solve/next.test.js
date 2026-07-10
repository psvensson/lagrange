import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {appendEvent} from '../../scripts/solve/store.js';
import {runStep} from '../../scripts/solve/step.js';
import {buildNextLines, runNextCommand} from '../../scripts/solve/next.js';
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
  t.test('always leads with a single imperative Next: line', (t) => {
    const root = tmp();
    makeOracleQuest(root);
    const lines = buildNextLines(root, 'demo');
    t.match(lines[0], /^Next: /u);
    t.ok(lines.length >= 3, 'a handful of context lines follow');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('surfaces a pending supervised step as commit-or-abort', (t) => {
    const root = tmp();
    const {quest} = makeOracleQuest(root);
    runStep(root, quest);

    const out = runNextCommand(root, 'demo');
    t.match(out, /^Next: node scripts\/solve\.js step --id demo --commit/u);
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
    t.match(lines[0], /^Next: node scripts\/solve\.js override --id demo/u);
    t.match(lines.join('\n'), /last stop: blocked-scope \(reroute\)/u);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('a terminal quest says so instead of prescribing work', (t) => {
    const root = tmp();
    makeOracleQuest(root);
    appendEvent(root, 'demo', {
      type: EVENT_QUEST,
      status: STATUS_SOLVED,
      evidence: 'oracle.json',
    });

    const lines = buildNextLines(root, 'demo');
    t.match(lines[0], /^Next: nothing to execute — quest is SOLVED/u);
    t.match(lines[0], /report --id demo/u);
    t.notOk(lines.some((line) => line.startsWith('blocker:')),
      'a terminal quest prints no (contradictory) blocker line');
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
