import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as analyzer from
  '../../scripts/checks/formation-release-handoff-gcp-analysis.js';
import {
  STRANDED_TEARDOWN_RUN,
  buildBothCompletedRunEvents,
  buildRetainedWithoutDrainEvents,
  buildStrandedTeardownRunEvents,
  buildTeardownTruncatedRunEvents,
} from './formation-release-handoff-gcp-run-fixture.js';

// Deterministic witness for the formation-analyzer-retained-uncompleted-
// teardown quest: GCP run 2026-08-30T07-13-07.175Z left generation e1:4 with
// a last recorded transition of `active` (07:16:52.663) when the seed marked
// draining (07:17:09.238); it was never revoked and two of its three joiners
// never published READY. The analyzer must classify that generation under
// its OWN typed outcome class (retained_uncompleted_at_teardown), separate
// from teardown_truncated, fail closure on a dedicated invariant naming it,
// and refuse to measure a capture-to-completion span that skips the
// uncompleted generation. It reads only the owner's recorded transitions and
// the authority's draining marker: never nodes status, publication counts,
// or coverage.
//
// Each scenario is a raw top-level node:test with an anchored name so
// `node --test --test-name-pattern="^<name>"` selects exactly one.

const CLASS_COMPLETED = 'completed';
const CLASS_STRANDED = 'stranded';
const CLASS_TEARDOWN_TRUNCATED = 'teardown_truncated';
const CLASS_RETAINED_UNCOMPLETED_AT_TEARDOWN =
  'retained_uncompleted_at_teardown';
const INVARIANT_NO_RETAINED_UNCOMPLETED = 'noRetainedUncompletedAtTeardown';
const INVARIANT_WITHIN_BUDGET = 'withinCertificationBudget';
const FIRST_TO_SECOND_COMPLETION_MS = 32_289;
const FOREIGN_STATUS_MESSAGE = 'Node status';
const FOREIGN_STATUS_ACTIVE = 'ACTIVE';
const FOREIGN_PUBLICATION_COUNT = 5;

function analyze(events) {
  return analyzer.analyzeFormationReleaseEvents(
    events,
    STRANDED_TEARDOWN_RUN.sourceFingerprint,
  );
}

test('retained-uncompleted-at-teardown-classified: a generation whose last ' +
  'recorded transition is active when its authority marked draining is ' +
  'classified retained_uncompleted_at_teardown, not stranded, and fails ' +
  'closure on its own invariant', () => {
  const analysis = analyze(buildStrandedTeardownRunEvents());
  const classifications = analysis.generationClassifications;
  assert.equal(
    classifications[STRANDED_TEARDOWN_RUN.firstGeneration],
    CLASS_COMPLETED,
  );
  assert.equal(
    classifications[STRANDED_TEARDOWN_RUN.secondGeneration],
    CLASS_RETAINED_UNCOMPLETED_AT_TEARDOWN,
  );
  assert.equal(analysis.retainedUncompletedAtTeardownGenerationCount, 1);
  assert.equal(analysis.invariants.noStrandedGeneration, true,
    'the generation was retained by the owner until teardown; it is not ' +
      'stranded');
  assert.equal(analysis.invariants[INVARIANT_NO_RETAINED_UNCOMPLETED], false,
    'the dedicated invariant names the uncompleted retained generation');
  assert.equal(
    analysis.failureReasons.includes(INVARIANT_NO_RETAINED_UNCOMPLETED),
    true,
  );
  assert.equal(analysis.closurePassed, false);
});

test('retained-uncompleted-typed-outcome-class: the analyzer owns the ' +
  'retained_uncompleted_at_teardown outcome as a typed classification ' +
  'constant distinct from teardown_truncated', () => {
  const classes = analyzer.GENERATION_CLASSIFICATION;
  assert.equal(typeof classes, 'object');
  assert.equal(Object.isFrozen(classes), true);
  assert.equal(
    classes.RETAINED_UNCOMPLETED_AT_TEARDOWN,
    CLASS_RETAINED_UNCOMPLETED_AT_TEARDOWN,
  );
  assert.equal(classes.TEARDOWN_TRUNCATED, CLASS_TEARDOWN_TRUNCATED);
  assert.notEqual(
    classes.RETAINED_UNCOMPLETED_AT_TEARDOWN,
    classes.TEARDOWN_TRUNCATED,
  );
  const analysis = analyze(buildStrandedTeardownRunEvents());
  assert.equal(analysis.teardownTruncatedGenerationCount, 0,
    'the retained generation is never folded into teardown truncation');
});

test('completion-span-covers-every-generation: the capture-to-completion ' +
  'span is not measurable while a captured generation never completed, so ' +
  'the certification budget cannot be met on generation 1 alone', () => {
  const analysis = analyze(buildStrandedTeardownRunEvents());
  assert.equal(analysis.completionMs, null);
  assert.equal(analysis.invariants[INVARIANT_WITHIN_BUDGET], false);
  assert.equal(
    analysis.failureReasons.includes(INVARIANT_WITHIN_BUDGET),
    true,
  );
});

test('completion-span-unchanged-for-completed-generations: with every ' +
  'captured generation completed the span still runs from the first ' +
  'capture to the last completion', () => {
  const analysis = analyze(buildBothCompletedRunEvents());
  assert.equal(analysis.completedGenerationCount, 2);
  assert.equal(analysis.completionMs, FIRST_TO_SECOND_COMPLETION_MS);
  assert.equal(analysis.invariants[INVARIANT_WITHIN_BUDGET], true);
  assert.equal(analysis.closurePassed, true);
});

test('teardown-truncated-class-unchanged: a valid member-missing ' +
  'revocation after the authority marked draining is still classified ' +
  'teardown_truncated and excluded from stranding', () => {
  const analysis = analyze(buildTeardownTruncatedRunEvents());
  assert.equal(
    analysis.generationClassifications[STRANDED_TEARDOWN_RUN.secondGeneration],
    CLASS_TEARDOWN_TRUNCATED,
  );
  assert.equal(analysis.teardownTruncatedGenerationCount, 1);
  assert.equal(analysis.invariants.noStrandedGeneration, true);
  assert.equal(analysis.generationRetainedAcrossReopen, true);
  assert.equal(analysis.invalidRevocationCount, 0);
});

test('active-without-drain-marker-stays-stranded: a generation still ' +
  'active when the log ends with no draining marker for its authority ' +
  'cannot be attributed to teardown and remains stranded', () => {
  const analysis = analyze(buildRetainedWithoutDrainEvents());
  assert.equal(
    analysis.generationClassifications[STRANDED_TEARDOWN_RUN.secondGeneration],
    CLASS_STRANDED,
  );
  assert.equal(analysis.invariants.noStrandedGeneration, false);
  assert.equal(analysis.closurePassed, false);
});

test('no-second-active-ready-authority: nodes-status, publication-count ' +
  'and coverage events never change the classification of the owner\'s ' +
  'recorded transitions', () => {
  const baseline = analyze(buildStrandedTeardownRunEvents());
  const events = buildStrandedTeardownRunEvents();
  for (const nodeId of Object.values(STRANDED_TEARDOWN_RUN.joiners)) {
    events.push({
      time: STRANDED_TEARDOWN_RUN.lastActiveAt,
      nodeId,
      status: FOREIGN_STATUS_ACTIVE,
      publicationCount: FOREIGN_PUBLICATION_COUNT,
      coverage: FOREIGN_PUBLICATION_COUNT,
      msg: FOREIGN_STATUS_MESSAGE,
    });
  }
  const analysis = analyze(events);
  assert.deepEqual(
    analysis.generationClassifications,
    baseline.generationClassifications,
  );
  assert.deepEqual(analysis.invariants, baseline.invariants);
  assert.equal(analysis.closurePassed, false);
});

test('witness-deterministic: two analyses of the identical recorded run ' +
  'produce the identical classification, invariants and span', () => {
  const first = analyze(buildStrandedTeardownRunEvents());
  const second = analyze(buildStrandedTeardownRunEvents());
  assert.deepEqual(second, first);
  assert.deepEqual(
    analyze(buildTeardownTruncatedRunEvents()),
    analyze(buildTeardownTruncatedRunEvents()),
  );
});
