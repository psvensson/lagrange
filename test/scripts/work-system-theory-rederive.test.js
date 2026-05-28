import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  detectCompositionalSignals,
  EMERGENT_MECHANISM_TERMS,
  COMPOSITIONAL_PAIRS,
} from '../../scripts/work-frontier-history.js';
import {
  buildRecommendation,
  stampSprint,
  readSprintRederivedAt,
  countClosedPackagesSince,
} from '../../scripts/work-system-theory-rederive.js';

function fakeHistoryItem(mechanism) {
  return {
    package: `done-20260528-fake-${mechanism}.md`,
    title: 'fake',
    status: 'done',
    opened: '2026-05-28',
    owner: 'fake_owner',
    boundary: 'fake_boundary',
    artifact: 'none',
    failureMechanism: mechanism,
    expectedMovement: 'none',
    outcome: 'none',
    resultClassification: 'unknown',
    predictionAccuracy: 'unknown',
    nextOwnerBoundary: 'unknown',
  };
}

tap.test('work-system-theory-rederive unit tests', async (t) => {
  t.test('no signal on varied mechanisms', (t) => {
    const signals = detectCompositionalSignals([
      fakeHistoryItem('observation_gap'),
      fakeHistoryItem('selection_gap'),
      fakeHistoryItem('budget_gap'),
    ]);
    t.equal(signals.length, 0);
    t.end();
  });

  t.test('same-mechanism-repeat fires at 3 in a row', (t) => {
    const signals = detectCompositionalSignals([
      fakeHistoryItem('transition_gap'),
      fakeHistoryItem('transition_gap'),
      fakeHistoryItem('transition_gap'),
    ]);
    t.ok(signals.length >= 1);
    t.equal(signals[0].pattern, 'same-mechanism-repeat');
    t.equal(signals[0].mechanism, 'transition_gap');
    t.equal(signals[0].recommendation, 'auto-promote-systemTheory-rev');
    t.end();
  });

  t.test('compositional-pair-alternation fires on transition+scheduling', (t) => {
    const signals = detectCompositionalSignals([
      fakeHistoryItem('transition_gap'),
      fakeHistoryItem('scheduling_gap'),
      fakeHistoryItem('transition_gap'),
    ]);
    const pair = signals.find((s) => s.pattern === 'compositional-pair-alternation');
    t.ok(pair);
    t.equal(pair.mechanism, 'transition_gap+scheduling_gap');
    t.end();
  });

  t.test('emergent-class-present fires for every new emergent term', (t) => {
    for (const term of EMERGENT_MECHANISM_TERMS) {
      const signals = detectCompositionalSignals([
        fakeHistoryItem('observation_gap'),
        fakeHistoryItem(term),
      ]);
      const emergent = signals.find((s) => s.pattern === 'emergent-class-present');
      t.ok(emergent, `emergent signal fires for ${term}`);
      t.equal(emergent.mechanism, term);
    }
    t.end();
  });

  t.test('COMPOSITIONAL_PAIRS contains the three doctrinal pairs', (t) => {
    t.equal(COMPOSITIONAL_PAIRS.length, 3);
    const flat = COMPOSITIONAL_PAIRS.map((p) => p.join('+'));
    t.ok(flat.includes('transition_gap+scheduling_gap'));
    t.ok(flat.includes('contract_gap+ownership_gap'));
    t.ok(flat.includes('concurrency_gap+budget_gap'));
    t.end();
  });

  t.test('buildRecommendation produces complete scaffold', (t) => {
    const history = [
      fakeHistoryItem('transition_gap'),
      fakeHistoryItem('transition_gap'),
      fakeHistoryItem('transition_gap'),
    ];
    const signals = detectCompositionalSignals(history);
    const rec = buildRecommendation({owner: 'o', boundary: 'b', signals, history});
    const rev = rec.proposedSystemTheoryRevision;
    t.ok(rev.problemStatement);
    t.ok(Array.isArray(rev.stableFactsToReconfirm) && rev.stableFactsToReconfirm.length > 0);
    t.same(rev.compositionalSignals, signals);
    t.ok(rev.requiredNewFields.some((f) => f.includes('wholeSystemInvariants')));
    t.ok(rev.candidateLayers.some((l) => l.includes('protocol')));
    t.ok(rev.candidateLayers.some((l) => l.includes('model')));
    t.ok(rev.promotionRule.includes('o'));
    t.ok(rev.promotionRule.includes('b'));
    t.end();
  });

  t.test('stampSprint inserts and updates without duplication', (t) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sprint-stamp-'));
    const sprintPath = path.join(tmp, 'active-test.md');
    fs.writeFileSync(sprintPath, '# Sprint\n\nStatus: active\n\n## Goal\n\nGoal text.\n');
    const stamp = stampSprint(sprintPath);
    t.match(stamp, /^\d{4}-\d{2}-\d{2}$/);
    let content = fs.readFileSync(sprintPath, 'utf8');
    t.match(content, /^systemTheoryRederivedAt: \d{4}-\d{2}-\d{2}$/m);
    stampSprint(sprintPath);
    content = fs.readFileSync(sprintPath, 'utf8');
    const occurrences = (content.match(/systemTheoryRederivedAt:/g) || []).length;
    t.equal(occurrences, 1);
    fs.rmSync(tmp, {recursive: true, force: true});
    t.end();
  });

  t.test('readSprintRederivedAt: null when absent, date when present', (t) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sprint-read-'));
    const sprintPath = path.join(tmp, 'active-test.md');
    fs.writeFileSync(sprintPath, '# Sprint\n\nStatus: active\n');
    t.equal(readSprintRederivedAt(sprintPath), null);
    fs.writeFileSync(sprintPath, 'systemTheoryRederivedAt: 2026-05-28\n# Sprint\n');
    t.equal(readSprintRederivedAt(sprintPath), '2026-05-28');
    fs.rmSync(tmp, {recursive: true, force: true});
    t.end();
  });

  t.test('countClosedPackagesSince counts done-* dated >= stamp', (t) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'closed-count-'));
    fs.writeFileSync(path.join(tmp, 'done-20260520-old.md'), '');
    fs.writeFileSync(path.join(tmp, 'done-20260528-newer.md'), '');
    fs.writeFileSync(path.join(tmp, 'done-20260529-newest.md'), '');
    fs.writeFileSync(path.join(tmp, 'active-20260601-current.md'), '');
    fs.writeFileSync(path.join(tmp, 'todo-20260530-todo.md'), '');
    t.equal(countClosedPackagesSince(tmp, '2026-05-28'), 2);
    t.equal(countClosedPackagesSince(tmp, '2026-05-20'), 3);
    t.equal(countClosedPackagesSince(tmp, '2026-06-01'), 0);
    fs.rmSync(tmp, {recursive: true, force: true});
    t.end();
  });
});
