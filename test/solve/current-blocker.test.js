import tap from 'tap';

import {
  buildCurrentBlocker,
  renderCurrentBlocker,
} from '../../scripts/solve/current-blocker.js';

const FRONTIER = 'q-main';

function questFixture() {
  return {
    id: 'q',
    frontiers: [{id: FRONTIER, priority: 1,
      metric: {probe: 'scenario-harness', args: {scenario: 'q'}}}],
  };
}

function stateFixture() {
  return {
    frontiers: [{id: FRONTIER, status: 'open', rungIndex: 0}],
    theories: {selectedByFrontier: {}, byId: {}},
  };
}

function evidence(overrides = {}) {
  return {
    type: 'evidence-ingested',
    frontier: FRONTIER,
    probeScope: 'frontier',
    evidence: 'run-1.json',
    metric: 3,
    owner: 'owner-a',
    boundary: 'boundary-b',
    dominantReason: 'reason-c',
    ...overrides,
  };
}

function finding(kind, claim) {
  return {type: 'finding', frontier: FRONTIER, kind, claim, evidence: 'x'};
}

tap.test('current blocker prose-only resume surface', async (t) => {
  t.test('flags an empty card when substantive prose findings exist', (t) => {
    const log = [finding('root-cause', 'binding head pinned only in prose')];
    const blocker = buildCurrentBlocker({
      quest: questFixture(), log, state: stateFixture(),
    });
    t.equal(blocker.movement, 'no_evidence');
    t.equal(blocker.proseOnlyResume, true);
    t.match(renderCurrentBlocker(blocker).join('\n'),
      /Resume surface: EMPTY while prose findings exist/u);
    t.end();
  });

  t.test('does not flag when structured evidence exists', (t) => {
    const log = [evidence(), finding('root-cause', 'later prose')];
    const blocker = buildCurrentBlocker({
      quest: questFixture(), log, state: stateFixture(),
    });
    t.equal(blocker.proseOnlyResume, false,
      'a structured head exists; prose findings are additive');
    t.notMatch(renderCurrentBlocker(blocker).join('\n'), /Resume surface/u);
    t.end();
  });

  t.test('workflow bookkeeping findings alone do not flag', (t) => {
    const log = [
      finding('verifier-approval', 'exact approval'),
      finding('verifier-rejection', 'rejection'),
      finding('inherited-rulesout', 'dead lever'),
    ];
    const blocker = buildCurrentBlocker({
      quest: questFixture(), log, state: stateFixture(),
    });
    t.equal(blocker.proseOnlyResume, false,
      'bookkeeping findings never carry a resume head');
    t.end();
  });

  t.test('an empty log has nothing to resume and does not flag', (t) => {
    const blocker = buildCurrentBlocker({
      quest: questFixture(), log: [], state: stateFixture(),
    });
    t.equal(blocker.proseOnlyResume, false);
    t.end();
  });
});
