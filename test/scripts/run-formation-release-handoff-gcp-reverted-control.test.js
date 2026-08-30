import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyzeFormationReleaseEvents} from
  '../../scripts/checks/formation-release-handoff-gcp-analysis.js';
import {buildRunReport} from
  '../../scripts/checks/run-formation-release-handoff-gcp.js';
import {
  STRANDED_TEARDOWN_RUN,
  buildBothCompletedRunEvents,
  buildStrandedTeardownRunEvents,
} from './formation-release-handoff-gcp-run-fixture.js';

// Deterministic witness for the reverted-arm control verdict of the
// five-node formation certification runner
// (scripts/checks/run-formation-release-handoff-gcp.js buildRunReport). The
// control verdict is minted from the analyzer's REAL `invariants` output, so
// this witness drives the real analyzer over the shared immutable run excerpt
// (test/scripts/formation-release-handoff-gcp-run-fixture.js) rather than a
// hand-written analysis shape: on the recorded reverted control run
// 2026-08-28T20-24-59.265Z the second generation is retained but never
// completed when the seed tears down, and the control must report that
// regression as observed (control PASS) while a reverted run that completes
// every generation cleanly reports it as NOT observed (control FAIL).
//
// The scenario is a raw top-level node:test with an anchored name so
// `node --test --test-name-pattern="^<name>"` selects exactly it.

const REVERTED_VARIANT = 'reverted';
const FIXED_FINGERPRINT = 'ffffffffffffffff';
const REVERTED_FINGERPRINT = 'eeeeeeeeeeeeeeee';
const LOG_DIR = 'x';

function revertedReportFor(events) {
  const analysis = analyzeFormationReleaseEvents(
    events,
    STRANDED_TEARDOWN_RUN.sourceFingerprint,
  );
  return buildRunReport({
    variant: REVERTED_VARIANT,
    fixedSourceFingerprint: FIXED_FINGERPRINT,
    revertedSourceFingerprint: REVERTED_FINGERPRINT,
    revertPatchFingerprint: null,
    deployedSourceFingerprint: REVERTED_FINGERPRINT,
    startedAt: new Date(),
    cluster: {error: null},
    analysis,
    logDir: LOG_DIR,
  });
}

test('reverted-control-observes-retained-uncompleted: a reverted run whose ' +
  'generation is retained but never completed at teardown is reported as ' +
  'the observed regression (control PASS), and a reverted run that ' +
  'completes cleanly is not (control FAIL)', () => {
  const regression = revertedReportFor(buildStrandedTeardownRunEvents());
  assert.equal(regression.analysis.closurePassed, false);
  assert.equal(
    regression.analysis.invariants.noRetainedUncompletedAtTeardown,
    false,
  );
  assert.equal(regression.analysis.invariants.noStrandedGeneration, true);
  assert.equal(
    regression.analysis.invariants.generationRetainedAcrossReopen,
    true,
  );
  assert.equal(regression.control.underlyingClosurePassed, false);
  assert.equal(regression.control.retainedUncompletedAtTeardown, true);
  assert.equal(regression.control.expectedRegressionObserved, true,
    'the control verdict reads the analyzer invariant that actually failed');
  assert.equal(regression.passed, true,
    'the reverted arm reproducing the regression is a passing control');

  const clean = revertedReportFor(buildBothCompletedRunEvents());
  assert.equal(clean.analysis.closurePassed, true);
  assert.equal(clean.control.underlyingClosurePassed, true);
  assert.equal(clean.control.retainedUncompletedAtTeardown, false);
  assert.equal(clean.control.expectedRegressionObserved, false);
  assert.equal(clean.passed, false,
    'a reverted arm that closes cleanly is a failing control');
});
