import {test} from '../../src/test-helpers/tap.js';
import {mkdtempSync, cpSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildRunReport,
  buildRevertPatch,
  expectedRegressionObserved,
  prepareRevertedSource,
  probeScenarioForVariant,
  PROBE_SCENARIO_NAME,
  REVERTED_CONTROL_SCENARIO_NAME,
} from '../../scripts/checks/run-formation-release-handoff-gcp.js';
import {analyzeFormationReleaseEvents} from
  '../../scripts/checks/formation-release-handoff-gcp-analysis.js';
import {computeSourceFingerprint} from
  '../../src/diagnostics/source-fingerprint.js';
import {scenarioHarnessProbe} from
  '../../scripts/solve/probes.js';
import {
  STRANDED_TEARDOWN_RUN,
  buildBothCompletedRunEvents,
  buildInvalidRevocationRunEvents,
  buildNoReopenRunEvents,
  buildRetainedWithoutDrainEvents,
  buildStrandedTeardownRunEvents,
  buildTeardownTruncatedRunEvents,
} from './formation-release-handoff-gcp-run-fixture.js';

const FIXED_VARIANT = 'fixed';
const REVERTED_VARIANT = 'reverted';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const FIXED_FINGERPRINT = 'ffffffffffffffff';
const REVERTED_FINGERPRINT = 'eeeeeeeeeeeeeeee';

// Every control-verdict scenario reads REAL analyzer output over the shared
// immutable run excerpt (never a hand-written analysis shape): the control
// predicate must track the analyzer's actual `invariants` surface, and a
// synthetic top-level shape the analyzer never emits proves nothing about it.
function analyze(events) {
  return analyzeFormationReleaseEvents(
    events,
    STRANDED_TEARDOWN_RUN.sourceFingerprint,
  );
}
// The recorded reverted-control regression shape (GCP run
// 2026-08-28T20-24-59.265Z): the second generation is retained but never
// completed when the seed tears down.
function regressionAnalysis() {
  return analyze(buildStrandedTeardownRunEvents());
}
function cleanClosureAnalysis() {
  return analyze(buildBothCompletedRunEvents());
}
function reportFor(variant, analysis, overrides = {}) {
  return buildRunReport({
    variant,
    fixedSourceFingerprint: FIXED_FINGERPRINT,
    revertedSourceFingerprint:
      variant === REVERTED_VARIANT ? REVERTED_FINGERPRINT : null,
    revertPatchFingerprint: null,
    deployedSourceFingerprint:
      variant === REVERTED_VARIANT ? REVERTED_FINGERPRINT : FIXED_FINGERPRINT,
    startedAt: new Date(),
    cluster: {error: null},
    analysis,
    logDir: 'x',
    ...overrides,
  });
}

test('negative-control lane separation: fixed and reverted variants map to ' +
  'distinct scenarios', (t) => {
  t.equal(
    probeScenarioForVariant(FIXED_VARIANT),
    'formation-release-handoff-closure',
  );
  t.equal(
    probeScenarioForVariant(REVERTED_VARIANT),
    'formation-release-handoff-closure-reverted-control',
  );
  t.equal(PROBE_SCENARIO_NAME, 'formation-release-handoff-closure');
  t.equal(
    REVERTED_CONTROL_SCENARIO_NAME,
    'formation-release-handoff-closure-reverted-control',
  );
  t.not(
    probeScenarioForVariant(FIXED_VARIANT),
    probeScenarioForVariant(REVERTED_VARIANT),
    'the control lane must be a distinct scenario so it cannot enter the ' +
      'fixed certification streak',
  );
  t.end();
});

test('negative-control report carries the A/B fingerprints and the named ' +
  'reverted mechanism', (t) => {
  const report = reportFor(REVERTED_VARIANT, regressionAnalysis(), {
    revertPatchFingerprint: 'abc123',
  });
  t.equal(report.variant, REVERTED_VARIANT);
  t.equal(report.fixedSourceFingerprint, FIXED_FINGERPRINT);
  t.equal(report.revertedSourceFingerprint, REVERTED_FINGERPRINT);
  t.equal(report.revertPatchFingerprint, 'abc123');
  t.equal(
    report.revertedMechanism,
    'capture-vs-retention-semantic:' +
      'isRetainableAuthority-transient-blocked-retention',
  );
  t.not(
    report.fixedSourceFingerprint,
    report.revertedSourceFingerprint,
    'a true A/B control deploys two different source trees',
  );
  t.end();
});

test('expectedRegressionObserved names each deliberate regression axis from ' +
  'the analyzer\'s real invariants', (t) => {
  t.equal(expectedRegressionObserved(null), false);
  const clean = cleanClosureAnalysis();
  t.equal(clean.closurePassed, true);
  t.equal(expectedRegressionObserved(clean), false);
  const stranded = analyze(buildRetainedWithoutDrainEvents());
  t.equal(stranded.invariants.noStrandedGeneration, false);
  t.equal(expectedRegressionObserved(stranded), true,
    'a stranded generation is the expected defect');
  const retained = regressionAnalysis();
  t.equal(retained.invariants.noStrandedGeneration, true);
  t.equal(retained.invariants.generationRetainedAcrossReopen, true);
  t.equal(retained.invariants.noRetainedUncompletedAtTeardown, false);
  t.equal(expectedRegressionObserved(retained), true,
    'a generation retained but never completed at teardown is the ' +
      'expected defect even though no other axis fires');
  const noReopen = analyze(buildNoReopenRunEvents());
  t.equal(noReopen.invariants.generationRetainedAcrossReopen, false);
  t.equal(expectedRegressionObserved(noReopen), true,
    'a retention-across-reopen never proven is the expected defect');
  const invalidRevocation = analyze(buildInvalidRevocationRunEvents());
  t.equal(invalidRevocation.invariants.noInvalidRevocation, false);
  t.equal(expectedRegressionObserved(invalidRevocation), true,
    'an invalid revocation is the expected defect');
  const truncated = analyze(buildTeardownTruncatedRunEvents());
  t.equal(truncated.closurePassed, true);
  t.equal(expectedRegressionObserved(truncated), false,
    'a teardown-truncated generation keeps its sealed non-defect meaning');
  t.end();
});

test('EXPECTED control red: reverted source reproducing the named regression ' +
  'makes the control report PASS while the underlying closure FAILS', (t) => {
  const report = reportFor(REVERTED_VARIANT, regressionAnalysis());
  t.equal(report.passed, true,
    'control passes when the deliberately reverted source exhibits the ' +
      'expected defect');
  t.equal(report.control.underlyingClosurePassed, false,
    'the underlying product closure result is kept separately');
  t.equal(report.control.expectedRegressionObserved, true);
  t.equal(report.control.strandedGeneration, false);
  t.equal(report.control.retainedUncompletedAtTeardown, true,
    'the control block names the observed axis from the analyzer invariants');
  t.equal(report.control.generationRetainedAcrossReopen, true);
  t.equal(report.control.invalidRevocationCount, 0);
  t.end();
});

test('UNEXPECTED control green: reverted source closing successfully makes ' +
  'the control report FAIL', (t) => {
  const report = reportFor(REVERTED_VARIANT, cleanClosureAnalysis());
  t.equal(report.passed, false,
    'control fails when the reverted source unexpectedly closes successfully');
  t.equal(report.control.underlyingClosurePassed, true);
  t.equal(report.control.expectedRegressionObserved, false);
  t.end();
});

test('fixed arm: passed IS the product closure and carries no control block; ' +
  'an ORGANIC fixed failure stays a fixed failure', (t) => {
  const passing = reportFor(FIXED_VARIANT, cleanClosureAnalysis());
  t.equal(passing.passed, true);
  t.equal(passing.control, null,
    'the fixed certification lane carries no control verdict');
  const organicFailure = reportFor(FIXED_VARIANT, regressionAnalysis());
  t.equal(organicFailure.passed, false,
    'an organic fixed-source failure remains a fixed certification failure ' +
      '(so it still resets the fixed streak — not hidden by the control)');
  t.equal(organicFailure.control, null);
  t.end();
});

test('reverse patch is a deterministic unified diff against the candidate ' +
  'contract path', (t) => {
  const patch = buildRevertPatch();
  t.ok(patch.includes('--- a/src/control-plane/formation-release-handoff-contract.js'));
  t.ok(patch.includes('+++ b/src/control-plane/formation-release-handoff-contract.js'));
  t.ok(patch.includes('-    return true;'),
    'the removed retention branch is present as a deletion');
  t.ok(patch.includes('+  return pendingAuthorityIsRetainable(evidence);'));
  t.equal(buildRevertPatch(), patch, 'the patch is deterministic');
  t.end();
});

test('isolated-worktree revert deploys DIFFERENT source than the main tree ' +
  'and never mutates the main contract in place', async (t) => {
  const fixed = await computeSourceFingerprint(path.join(ROOT, 'src'));
  const prepared = await prepareRevertedSource(fixed, null);
  try {
    t.not(prepared.revertedSourceFingerprint, fixed,
      'the reverted arm fingerprint differs from the fixed arm');
    t.equal(prepared.createdWorktree, true);
    t.ok(prepared.revertPatchFingerprint.length > 0);
  } finally {
    const {execFileSync} = await import('node:child_process');
    try {
      execFileSync(
        'git',
        ['worktree', 'remove', '--force', prepared.worktreePath],
        {cwd: ROOT},
      );
    } catch {
      // best-effort cleanup
    }
    rmSync(prepared.workParent, {recursive: true, force: true});
  }
  const stillFixed = await computeSourceFingerprint(path.join(ROOT, 'src'));
  t.equal(stillFixed, fixed,
    'the main worktree source is byte-identical before and after the revert');
  t.end();
});

// Drive the real scenario-harness probe over a synthetic report directory to
// prove the certification stream and the control stream stay separate. This is
// the regression the distinct scenario name exists to prevent: an
// expected-failing control must NEVER reset the fixed consecutive-3 streak.
test('certification probe reads ONLY the fixed lane; the control lane is a ' +
  'separate streak', (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'probe-lane-'));
  const writeReport = (name, scenario, passed, timestamp) => {
    writeFileSync(
      path.join(dir, name),
      JSON.stringify({
        scenario,
        timestamp,
        startedAt: timestamp,
        finishedAt: timestamp,
        passed,
        optimizationSummary: {totalPriorityItems: passed ? 0 : 1},
        summary: {total: 1, passed: passed ? 1 : 0, failed: passed ? 0 : 1},
        scenarios: [{scenario, passed, verdict: passed ? 'PASS' : 'FAIL'}],
      }),
    );
  };
  try {
    // (a) A fixed report enters the fixed scenario and counts toward the streak.
    writeReport('a.report.json', PROBE_SCENARIO_NAME, true,
      '2026-08-29T00:00:01.000Z');
    writeReport('b.report.json', PROBE_SCENARIO_NAME, true,
      '2026-08-29T00:00:02.000Z');
    // (b) A reverted-control report enters the distinct control scenario.
    writeReport('c.report.json', REVERTED_CONTROL_SCENARIO_NAME, true,
      '2026-08-29T00:00:03.000Z');
    const fixedBeforeThird = scenarioHarnessProbe.measure({
      reportDir: dir,
      scenario: PROBE_SCENARIO_NAME,
      consecutive: 3,
    });
    t.equal(fixedBeforeThird.detail.runs, 2,
      'the fixed streak sees only the two fixed-lane runs');
    t.equal(fixedBeforeThird.done, false,
      'two fixed passes do not yet meet the consecutive-3 bar');
    const control = scenarioHarnessProbe.measure({
      reportDir: dir,
      scenario: REVERTED_CONTROL_SCENARIO_NAME,
      consecutive: 1,
    });
    t.equal(control.detail.runs, 1,
      'the control lane reads exactly its own report');
    t.equal(control.done, true,
      'a passing control completes the (separate) control streak');
    // A third fixed pass AFTER the control: the interleaved control run must
    // not have entered the fixed window, so the three fixed passes now close.
    writeReport('d.report.json', PROBE_SCENARIO_NAME, true,
      '2026-08-29T00:00:04.000Z');
    const fixedAfterThird = scenarioHarnessProbe.measure({
      reportDir: dir,
      scenario: PROBE_SCENARIO_NAME,
      consecutive: 3,
    });
    t.equal(fixedAfterThird.detail.runs, 3,
      'the fixed window still contains only fixed-lane runs');
    t.equal(fixedAfterThird.done, true,
      'three fixed passes close the certification streak even with an ' +
        'interleaved control run');
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
  t.end();
});

test('control REFUSES to run when the deployed reverted source fingerprint ' +
  'equals the fixed source fingerprint', async (t) => {
  // Inject a pre-populated tree whose post-revert fingerprint we can predict,
  // then pass that exact fingerprint as the fixed arm so the guard trips.
  const parent = mkdtempSync(
    path.join(os.tmpdir(), 'formation-release-handoff-refusal-'),
  );
  const tree = path.join(parent, 'tree');
  try {
    cpSync(path.join(ROOT, 'src'), path.join(tree, 'src'), {recursive: true});
    const learned = await prepareRevertedSource('SENTINEL_DIFFERS', {
      worktreePath: tree,
    });
    // Restore the tree to the fixed bytes, then revert again with the fixed
    // fingerprint set to the learned reverted value -> equality -> refuse.
    rmSync(tree, {recursive: true, force: true});
    cpSync(path.join(ROOT, 'src'), path.join(tree, 'src'), {recursive: true});
    let threw = false;
    let message = '';
    try {
      await prepareRevertedSource(learned.revertedSourceFingerprint, {
        worktreePath: tree,
      });
    } catch (error) {
      threw = true;
      message = String(error.message || error);
    }
    t.equal(threw, true, 'equal fingerprints must refuse to run');
    t.ok(
      message.includes('reverted source fingerprint equals fixed'),
      'the refusal names the fingerprint-equality defect',
    );
  } finally {
    rmSync(parent, {recursive: true, force: true});
  }
  t.end();
});
