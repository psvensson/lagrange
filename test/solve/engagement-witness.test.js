import tap from 'tap';

import {
  ENGAGEMENT_WITNESS_FINDING_KINDS,
  engagementWitnessAdvisory,
} from '../../scripts/solve/engagement-witness.js';

const FRONTIER = 'q-main';

function finding(kind, overrides = {}) {
  return {type: 'finding', kind, evidence: `evidence-${kind}`, ...overrides};
}

function attempt(frontier = FRONTIER) {
  return {type: 'attempt', frontier, changeRef: 'diff:x.diff'};
}

tap.test('engagement-witness advisory', async (t) => {
  t.test('stays silent without an effective theory (refactor exemption)', (t) => {
    const advisory = engagementWitnessAdvisory({
      log: [],
      frontierId: FRONTIER,
      changedPaths: ['src/owner.js'],
      theoryRef: null,
    });
    t.equal(advisory, null, 'no theory means no live-precondition claim');
    t.end();
  });

  t.test('stays silent when the attempt changes no src/ path', (t) => {
    const advisory = engagementWitnessAdvisory({
      log: [],
      frontierId: FRONTIER,
      changedPaths: ['test/owner.test.js', 'scripts/tool.js'],
      theoryRef: 'th-1',
    });
    t.equal(advisory, null, 'building-block/test-only changes are exempt');
    t.end();
  });

  t.test('warns on a source-changing theory commit without a witness', (t) => {
    const advisory = engagementWitnessAdvisory({
      log: [finding('observation')],
      frontierId: FRONTIER,
      changedPaths: ['src/owner.js'],
      theoryRef: 'th-1',
    });
    t.equal(advisory.satisfied, false);
    t.match(advisory.message, /engagement-witness advisory/u);
    t.match(advisory.message, /theory th-1/u);
    t.match(advisory.message, /deterministic-engagement/u,
      'message names the qualifying kinds');
    t.end();
  });

  t.test('every witness kind satisfies the advisory', (t) => {
    for (const kind of ENGAGEMENT_WITNESS_FINDING_KINDS) {
      const advisory = engagementWitnessAdvisory({
        log: [finding(kind)],
        frontierId: FRONTIER,
        changedPaths: ['src/owner.js'],
        theoryRef: 'th-1',
      });
      t.equal(advisory.satisfied, true, `${kind} satisfies`);
      t.equal(advisory.kind, kind);
      t.equal(advisory.evidence, `evidence-${kind}`);
    }
    t.end();
  });

  t.test('the witness window starts after the previous same-frontier attempt', (t) => {
    const staleWitness = engagementWitnessAdvisory({
      log: [finding('live-validation'), attempt()],
      frontierId: FRONTIER,
      changedPaths: ['src/owner.js'],
      theoryRef: 'th-1',
    });
    t.equal(staleWitness.satisfied, false,
      'a witness recorded before the previous attempt does not carry over');

    const freshWitness = engagementWitnessAdvisory({
      log: [attempt(), finding('live-validation')],
      frontierId: FRONTIER,
      changedPaths: ['src/owner.js'],
      theoryRef: 'th-1',
    });
    t.equal(freshWitness.satisfied, true,
      'a witness recorded after the previous attempt satisfies');

    const otherFrontier = engagementWitnessAdvisory({
      log: [finding('live-validation'), attempt('q-other-main')],
      frontierId: FRONTIER,
      changedPaths: ['src/owner.js'],
      theoryRef: 'th-1',
    });
    t.equal(otherFrontier.satisfied, true,
      'attempts on other frontiers do not close this frontier\'s window');
    t.end();
  });
});
