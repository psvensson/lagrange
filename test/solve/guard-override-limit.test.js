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

  t.test('re-authorizing an already-covered scope spends no budget', (t) => {
    // The scope analyzer unions all prior attempts, so a large atomic candidate
    // makes the guard re-fire on every later attempt — including a byte-identical
    // re-submission forced by a voided receipt or a verifier-required repair.
    // Charging those exhausted a real Quest's lifetime budget and parked verified
    // work. The cap is for scope GROWTH, so repetition must be free.
    const {root, quest} = setup();
    const scope = ['src/a.js', 'src/b.js', 'test/a.test.js'];
    for (let i = 0; i < SAME_GUARD_OVERRIDE_LIMIT; i += 1) {
      override(root, quest, {scopeSignature: scope});
    }
    const again = override(root, quest, {scopeSignature: scope});
    t.equal(again.scopeReauthorization, true,
      'an identical candidate is recorded as a re-authorization');
    const subset = override(root, quest, {scopeSignature: ['src/a.js']});
    t.equal(subset.scopeReauthorization, true,
      'a narrower candidate is covered by what was already authorized');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('reaching a new path is still charged and still capped', (t) => {
    // Each override here reaches a path no earlier one authorized, so each is
    // charged — the salami-slicing defense must survive the repetition exemption.
    const {root, quest} = setup();
    const scope = ['src/a.js'];
    for (let i = 0; i < SAME_GUARD_OVERRIDE_LIMIT; i += 1) {
      scope.push(`src/grown-${i}.js`);
      override(root, quest, {scopeSignature: [...scope]});
    }
    const charged = readLog(root, quest.id).filter((event) =>
      event.type === 'guard-override' && event.scopeReauthorization !== true);
    t.equal(charged.length, SAME_GUARD_OVERRIDE_LIMIT,
      'every growing override was charged');
    t.throws(
      () => override(root, quest, {scopeSignature: [...scope, 'src/grown-again.js']}),
      /re-scope instead of overriding again/u,
      'genuine scope growth still hits the cap',
    );
    const recorded = readLog(root, quest.id)
      .filter((event) => event.type === 'guard-override');
    t.equal(recorded.length, SAME_GUARD_OVERRIDE_LIMIT,
      'the refused override was never appended');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('free re-authorizations do not themselves consume the cap', (t) => {
    // A re-authorization must not silently become budget for later growth, but it
    // must also not count against it — otherwise repetition still exhausts the cap
    // one step removed.
    const {root, quest} = setup();
    const scope = ['src/a.js'];
    override(root, quest, {scopeSignature: scope});
    for (let i = 0; i < 5; i += 1) override(root, quest, {scopeSignature: scope});
    t.ok(override(root, quest, {scopeSignature: ['src/a.js', 'src/second.js']}),
      'a second genuine growth is still affordable after many repetitions');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('an override with no derivable scope is charged exactly as before', (t) => {
    const {root, quest} = setup();
    for (let i = 0; i < SAME_GUARD_OVERRIDE_LIMIT; i += 1) override(root, quest);
    t.throws(() => override(root, quest), /re-scope instead of overriding again/u,
      'the signature is an exemption, never a bypass');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('recorded-attempt coverage re-authorizes when no override signature does', (t) => {
    // A file can enter the tree between the last override and the attempt
    // snapshot: the recorded, reviewed attempt covers it but no override
    // signature does. Re-submitting that attempt byte-identically reaches no
    // path beyond recorded work, so the recorded-scope anchor must make it a
    // free re-authorization — otherwise verified work parks at the cap.
    const {root, quest} = setup();
    const scope = ['src/a.js'];
    for (let i = 0; i < SAME_GUARD_OVERRIDE_LIMIT; i += 1) {
      scope.push(`src/grown-${i}.js`);
      override(root, quest, {scopeSignature: [...scope]});
    }
    const candidate = [...scope, 'src/late-arrival.js'];
    t.throws(() => override(root, quest, {scopeSignature: candidate}),
      /re-scope instead of overriding again/u,
      'without a recorded-scope anchor the late path is charged as growth');
    const again = override(root, quest, {
      scopeSignature: candidate,
      recordedScope: candidate,
    });
    t.equal(again.scopeReauthorization, true,
      'coverage by the recorded attempt union is a free re-authorization');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('the recorded-scope anchor never authorizes unrecorded growth', (t) => {
    const {root, quest} = setup();
    const scope = ['src/a.js'];
    for (let i = 0; i < SAME_GUARD_OVERRIDE_LIMIT; i += 1) {
      scope.push(`src/grown-${i}.js`);
      override(root, quest, {scopeSignature: [...scope]});
    }
    t.throws(() => override(root, quest, {
      scopeSignature: [...scope, 'src/never-recorded.js'],
      recordedScope: [...scope],
    }), /re-scope instead of overriding again/u,
    'a path outside both anchors is still genuine scope growth');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });
});
