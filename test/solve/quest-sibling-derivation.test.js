// Sibling Quests in a family (seven cell-placement Quests landed on 2026-07-24)
// share their whole structure and differ only in the sealed statement. Deriving one
// copies the structure and REFUSES to copy the statement, because a sibling statement
// differs in exactly the clause a mechanical substitution gets wrong — and once first
// execution seals it, validateGoalpostsImmutable makes it uncorrectable.

import tap from 'tap';

import {
  applyInheritedParentLinks,
  applySiblingSkeleton,
  retargetProbeSpec,
} from '../../scripts/solve/quest-derivation.js';

function sibling() {
  return {
    id: 'family-first',
    class: 'process',
    verificationContractVersion: 2,
    statement: 'The first family member binds its own export.',
    links: {roadmapRow: 'R-7', specRef: 'solve/epics/family.md', planDoc: null},
    doneWhen: {
      probe: 'scenario-harness',
      args: {scenario: 'family-first', consecutive: 3, metric: 'priority'},
    },
    frontiers: [{
      id: 'family-first-main',
      priority: 1,
      metric: {probe: 'scenario-harness', args: {scenario: 'family-first', metric: 'priority'}},
    }],
    constraints: [{id: 'family-invariant', statement: 'Siblings stay inactive.'}],
    verificationTemplates: ['admission-gating', 'harness-fidelity'],
  };
}

function draft(id = 'family-second') {
  return {
    id,
    class: 'product',
    verificationContractVersion: 1,
    statement: 'Describe the terminal success condition in one line.',
    links: {roadmapRow: null, specRef: null, planDoc: null, parentQuest: null},
    doneWhen: {probe: 'scenario-harness', args: {scenario: id}},
    frontiers: [{id: `${id}-main`, metric: {probe: 'scenario-harness', args: {scenario: id}}}],
    constraints: [],
  };
}

tap.test('sibling Quest derivation', async (t) => {
  t.test('structure is inherited and the scenario token is retargeted', (t) => {
    const derived = applySiblingSkeleton(draft(), sibling(),
      {statement: 'The second family member binds a different export.'});

    t.equal(derived.doneWhen.args.scenario, 'family-second',
      'the probe scenario points at the new Quest, not the sibling');
    t.equal(derived.doneWhen.args.consecutive, 3, 'other probe args are preserved');
    t.equal(derived.frontiers[0].id, 'family-second-main');
    t.equal(derived.frontiers[0].metric.args.scenario, 'family-second');
    t.equal(derived.frontiers[0].priority, 1, 'frontier fields carry over');
    t.ok(derived.constraints.some((item) => item.id === 'family-invariant'),
      'the family constraints come along');
    t.equal(derived.class, 'process', 'the sibling class is adopted');
    t.equal(derived.verificationContractVersion, 2);
    t.same(derived.verificationTemplates,
      ['admission-gating', 'harness-fidelity'],
      'the sealed rejection bar is inherited as a reviewable draft default');
    t.end();
  });

  t.test('a sibling without a bar leaves the draft bar untouched', (t) => {
    const bare = sibling();
    delete bare.verificationTemplates;
    const derived = applySiblingSkeleton(draft(), bare,
      {statement: 'A sibling without templates.'});
    t.notOk(Object.hasOwn(derived, 'verificationTemplates'),
      'no empty bar is manufactured');
    t.end();
  });

  t.test('the sealed statement is never inherited', (t) => {
    t.throws(() => applySiblingSkeleton(draft(), sibling(), {}),
      /--statement .* is required/u,
      'deriving a sibling without its own predicate is refused');
    t.throws(() => applySiblingSkeleton(draft(), sibling(), {statement: '   '}),
      /--statement .* is required/u, 'a blank statement is not a statement');
    t.throws(() => applySiblingSkeleton(draft(), sibling(), {}),
      /cannot be corrected afterwards/u,
      'the refusal explains why the boundary exists');
    t.end();
  });

  t.test('an explicit class still wins over the sibling class', (t) => {
    const derived = applySiblingSkeleton(draft(), sibling(),
      {statement: 'A product sibling.', classExplicit: true});
    t.equal(derived.class, 'product');
    t.end();
  });

  t.test('retargeting rewrites the exact id token only', (t) => {
    const spec = {
      probe: 'scenario-harness',
      args: {scenario: 'family-first', note: 'family-first-and-more', metric: 'priority'},
    };
    const out = retargetProbeSpec(spec, 'family-first', 'family-second');
    t.equal(out.args.scenario, 'family-second', 'the exact token is retargeted');
    t.equal(out.args.note, 'family-first-and-more',
      'a value that merely contains the id is left alone');
    t.equal(out.args.metric, 'priority');
    t.equal(retargetProbeSpec(null, 'a', 'b'), null, 'an absent spec stays absent');
    t.end();
  });

  t.test('planning-row links are inherited from the parent', (t) => {
    // Not inheriting these is why fourteen Quests needed a later backfill commit.
    const quest = draft();
    const inherited = applyInheritedParentLinks(quest, sibling());
    t.equal(quest.links.specRef, 'solve/epics/family.md');
    t.equal(quest.links.roadmapRow, 'R-7');
    t.same(inherited, ['roadmapRow', 'specRef'], 'reports what it filled in');
    t.end();
  });

  t.test('an explicit link still wins over the inherited one', (t) => {
    const quest = draft();
    quest.links.roadmapRow = 'R-9';
    applyInheritedParentLinks(quest, sibling());
    t.equal(quest.links.roadmapRow, 'R-9', 'an explicit flag is never overwritten');
    t.equal(quest.links.specRef, 'solve/epics/family.md', 'unset links still fill in');
    t.end();
  });

  t.test('a parent with no links contributes nothing', (t) => {
    const quest = draft();
    t.same(applyInheritedParentLinks(quest, {links: {}}), []);
    t.same(applyInheritedParentLinks(quest, {}), [], 'a link-less parent is tolerated');
    t.end();
  });
});
