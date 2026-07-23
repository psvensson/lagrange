import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import tap from 'tap';

import {SAME_GUARD_OVERRIDE_LIMIT} from '../../scripts/solve/constants.js';
import {appendGuardOverride, readLog, saveQuest} from
  '../../scripts/solve/store.js';

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'override-limit-'));
  const quest = {
    id: 'override-limit-quest',
    class: 'process',
    statement: 'Guard override escalation.',
    doneWhen: {probe: 'oracle', args: {file: path.join(root, 'oracle.json')}},
    frontiers: [{id: 'override-limit-quest-main'}],
  };
  saveQuest(root, quest);
  return {root, quest};
}

function override(root, quest, fields = {}) {
  return appendGuardOverride(root, quest.id, {
    frontier: 'override-limit-quest-main',
    code: 'blocked-scope',
    reason: 'candidate is one indivisible contract',
    ...fields,
  });
}

tap.test('same-guard overrides are capped per frontier and code', async (t) => {
  t.test(`the ${SAME_GUARD_OVERRIDE_LIMIT + 1}th same-guard override is refused`, (t) => {
    const {root, quest} = setup();
    for (let i = 0; i < SAME_GUARD_OVERRIDE_LIMIT; i += 1) override(root, quest);
    t.throws(() => override(root, quest), /re-scope instead of overriding again/,
      'over-limit override names the re-scope obligation');
    const recorded = readLog(root, quest.id)
      .filter((event) => event.type === 'guard-override');
    t.equal(recorded.length, SAME_GUARD_OVERRIDE_LIMIT,
      'the refused override was never appended');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('a different guard code on the same frontier is not capped', (t) => {
    const {root, quest} = setup();
    for (let i = 0; i < SAME_GUARD_OVERRIDE_LIMIT; i += 1) override(root, quest);
    t.ok(override(root, quest, {code: 'blocked-theory'}),
      'other guard codes keep their own tally');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('the same guard code on a different frontier is not capped', (t) => {
    const {root, quest} = setup();
    for (let i = 0; i < SAME_GUARD_OVERRIDE_LIMIT; i += 1) override(root, quest);
    t.ok(override(root, quest, {frontier: 'override-limit-quest-other'}),
      'frontiers keep independent tallies');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });
});
