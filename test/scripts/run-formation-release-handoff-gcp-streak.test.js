import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as runner from
  '../../scripts/checks/run-formation-release-handoff-gcp.js';
import {analyzeFormationReleaseEvents} from
  '../../scripts/checks/formation-release-handoff-gcp-analysis.js';
import {
  STRANDED_TEARDOWN_RUN,
  buildStrandedTeardownRunEvents,
} from './formation-release-handoff-gcp-run-fixture.js';

// Deterministic witness for the formation-gcp-runner-bounded-streak quest:
// the three-run fixed-lane certification streak (sealed `consecutive: 3` in
// the formation-release-handoff-closure-v4 quest, read through the solve
// store) is driven by a bounded `--runs N` mode instead of an ad-hoc shell
// loop. The mode refuses
// N != sealed count and the reverted variant with typed reasons, admits each
// run only on clean src/ with the run-1 candidate fingerprint, stops at the
// first failed run without retry, and writes an aggregate report that only
// projects the per-run reports. The live cloud run is injected (`runOnce`)
// so this file never reaches GCP.
//
// The streak module is loaded dynamically inside the scenarios that need it
// so the reverted-control control scenario stays green on HEAD (where the
// module does not exist) and every scenario is independently selectable by
// its anchored name with --test-name-pattern.

const STREAK_MODULE = '../../scripts/checks/run-formation-release-handoff-gcp-streak.js';
const FIXED_VARIANT = 'fixed';
const REVERTED_VARIANT = 'reverted';
const SEALED_CONSECUTIVE = 3;
const WRONG_RUN_COUNTS = Object.freeze([1, 2, 4, 0, Number.NaN]);
const CANDIDATE_FINGERPRINT = 'cafe0000cafe0000';
const DRIFTED_FINGERPRINT = 'dead0000dead0000';
const FIXED_FINGERPRINT = 'ffffffffffffffff';
const REVERTED_FINGERPRINT = 'eeeeeeeeeeeeeeee';
const DIRTY_SOURCE_LINE = ' M src/control-plane/formation-release-handoff-contract.js';
const SCENARIO = 'formation-release-handoff-closure';
const REVERTED_CONTROL_SCENARIO =
  'formation-release-handoff-closure-reverted-control';
const OUTCOME_COMPLETED = 'completed';
const OUTCOME_ABORTED_DIRTY_SOURCE = 'aborted_dirty_source';
const OUTCOME_ABORTED_FINGERPRINT_CHANGED = 'aborted_fingerprint_changed';
const OUTCOME_ABORTED_RUN_FAILED = 'aborted_run_failed';
const REFUSAL_RUN_COUNT = 'run_count_not_sealed_consecutive';
const REFUSAL_VARIANT = 'streak_requires_fixed_variant';
const VERDICT_KEYS_NEVER_PROJECTED = Object.freeze([
  'passed', 'certified', 'closurePassed', 'verdict', 'done',
]);
const FAILURE_REASON_SAMPLE = 'noRetainedUncompletedAtTeardown';
const TEMP_PREFIX = 'formation-streak-';

function withReportRoot(body) {
  const reportRoot = mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
  return body(reportRoot).finally(() => {
    rmSync(reportRoot, {recursive: true, force: true});
  });
}

// A per-run result in the exact shape the single-run runner returns.
function fakeRunResult(runIndex, passed, fingerprint) {
  const finishedAt = `2026-08-30T08:0${runIndex}:00.000Z`;
  return {
    report: {
      schemaVersion: 2,
      scenario: 'formation-release-handoff-closure-live-gcp',
      variant: FIXED_VARIANT,
      sourceFingerprint: fingerprint,
      startedAt: `2026-08-30T08:0${runIndex - 1}:00.000Z`,
      finishedAt,
      passed,
      clusterStartPassed: passed,
      error: null,
      analysis: {
        closurePassed: passed,
        failureReasons: passed ? [] : [FAILURE_REASON_SAMPLE],
      },
      control: null,
      logDir: `test-output/reports/formation-release-handoff-closure/run-${runIndex}/full-logs`,
    },
    reportPath: `test-output/reports/formation-release-handoff-closure/run-${runIndex}/report.json`,
    probeReportPath: `test-output/reports/formation-release-handoff-closure-live-gcp-${runIndex}.report.json`,
  };
}

function fakeDependencies({
  passes = [true, true, true],
  fingerprints = [CANDIDATE_FINGERPRINT, CANDIDATE_FINGERPRINT,
    CANDIDATE_FINGERPRINT],
  dirty = [[], [], []],
} = {}) {
  const calls = {runOnce: [], readDirtyPaths: 0, computeFingerprint: 0};
  return {
    calls,
    dependencies: {
      runOnce: async (runIndex) => {
        calls.runOnce.push(runIndex);
        return fakeRunResult(
          runIndex,
          passes[runIndex - 1],
          fingerprints[runIndex - 1],
        );
      },
      readDirtyPaths: async () => {
        const value = dirty[calls.readDirtyPaths] || [];
        calls.readDirtyPaths += 1;
        return value;
      },
      computeFingerprint: async () => {
        const value = fingerprints[calls.computeFingerprint];
        calls.computeFingerprint += 1;
        return value;
      },
    },
  };
}

async function refusalOf(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  return null;
}

test('streak-run-count-must-equal-sealed-consecutive: --runs N is refused ' +
  'with a typed reason unless N equals the sealed consecutive count, and no ' +
  'run is started', async () => {
  const streak = await import(STREAK_MODULE);
  assert.equal(
    await streak.readSealedConsecutive({scenario: SCENARIO}),
    SEALED_CONSECUTIVE,
  );
  await withReportRoot(async (reportRoot) => {
    for (const runs of WRONG_RUN_COUNTS) {
      const fake = fakeDependencies();
      const error = await refusalOf(runner.runFormationReleaseHandoffGcpStreak(
        {runs, variant: FIXED_VARIANT, reportRoot},
        fake.dependencies,
      ));
      assert.ok(error instanceof streak.StreakRefusalError, `runs=${runs}`);
      assert.equal(error.reason, REFUSAL_RUN_COUNT);
      assert.equal(error.reason, streak.STREAK_REFUSAL.RUN_COUNT_NOT_SEALED);
      assert.deepEqual(fake.calls.runOnce, []);
    }
  });
});

test('streak-refuses-dirty-source-before-each-run: a dirty src/ tree ' +
  'observed before run 2 aborts the streak with a typed outcome after ' +
  'exactly one executed run', async () => {
  const streak = await import(STREAK_MODULE);
  await withReportRoot(async (reportRoot) => {
    const fake = fakeDependencies({dirty: [[], [DIRTY_SOURCE_LINE], []]});
    const {streak: result} = await runner.runFormationReleaseHandoffGcpStreak(
      {runs: SEALED_CONSECUTIVE, variant: FIXED_VARIANT, reportRoot},
      fake.dependencies,
    );
    assert.equal(result.outcome, OUTCOME_ABORTED_DIRTY_SOURCE);
    assert.equal(result.outcome, streak.STREAK_OUTCOME.ABORTED_DIRTY_SOURCE);
    assert.deepEqual(result.abortDetail, {
      run: 2,
      dirtyPaths: [DIRTY_SOURCE_LINE],
    });
    assert.deepEqual(fake.calls.runOnce, [1]);
    assert.equal(result.executedRunCount, 1);
  });
});

test('streak-refuses-candidate-fingerprint-drift: a source fingerprint ' +
  'that differs from the run-1 candidate aborts before the next run', async () => {
  const streak = await import(STREAK_MODULE);
  await withReportRoot(async (reportRoot) => {
    const fake = fakeDependencies({
      fingerprints: [CANDIDATE_FINGERPRINT, CANDIDATE_FINGERPRINT,
        DRIFTED_FINGERPRINT],
    });
    const {streak: result} = await runner.runFormationReleaseHandoffGcpStreak(
      {runs: SEALED_CONSECUTIVE, variant: FIXED_VARIANT, reportRoot},
      fake.dependencies,
    );
    assert.equal(result.outcome, OUTCOME_ABORTED_FINGERPRINT_CHANGED);
    assert.equal(
      result.outcome,
      streak.STREAK_OUTCOME.ABORTED_FINGERPRINT_CHANGED,
    );
    assert.deepEqual(result.abortDetail, {
      run: 3,
      candidateFingerprint: CANDIDATE_FINGERPRINT,
      observedFingerprint: DRIFTED_FINGERPRINT,
    });
    assert.equal(result.candidateFingerprint, CANDIDATE_FINGERPRINT);
    assert.deepEqual(fake.calls.runOnce, [1, 2]);
  });
});

test('streak-report-is-projection-of-run-reports: three admitted passing ' +
  'runs complete the streak and the aggregate report only copies the ' +
  'per-run verdicts, never minting its own', async () => {
  await withReportRoot(async (reportRoot) => {
    const fake = fakeDependencies();
    const {streak: result, streakPath} =
      await runner.runFormationReleaseHandoffGcpStreak(
        {runs: SEALED_CONSECUTIVE, variant: FIXED_VARIANT, reportRoot},
        fake.dependencies,
      );
    assert.equal(result.outcome, OUTCOME_COMPLETED);
    assert.equal(result.scenario, SCENARIO);
    assert.equal(result.sealedConsecutive, SEALED_CONSECUTIVE);
    assert.equal(result.executedRunCount, SEALED_CONSECUTIVE);
    assert.equal(result.passedRunCount, SEALED_CONSECUTIVE);
    assert.deepEqual(fake.calls.runOnce, [1, 2, 3]);
    for (const key of VERDICT_KEYS_NEVER_PROJECTED) {
      assert.equal(Object.hasOwn(result, key), false,
        `the streak report must not carry a ${key} verdict of its own`);
    }
    for (let index = 0; index < SEALED_CONSECUTIVE; index += 1) {
      const expected = fakeRunResult(index + 1, true, CANDIDATE_FINGERPRINT);
      const entry = result.runs[index];
      assert.equal(entry.run, index + 1);
      assert.equal(entry.report, expected.reportPath);
      assert.equal(entry.probeReport, expected.probeReportPath);
      assert.equal(entry.passed, expected.report.passed);
      assert.equal(entry.closurePassed, expected.report.analysis.closurePassed);
      assert.deepEqual(entry.failureReasons,
        expected.report.analysis.failureReasons);
      assert.equal(entry.sourceFingerprint, expected.report.sourceFingerprint);
      assert.equal(entry.finishedAt, expected.report.finishedAt);
    }
    assert.ok(streakPath.startsWith(reportRoot));
    assert.ok(!streakPath.endsWith('.report.json'),
      'the aggregate never enters the probe-scanned *.report.json surface');
    const written = JSON.parse(readFileSync(streakPath, 'utf8'));
    assert.deepEqual(written, result);
  });
});

test('streak-stops-at-first-failed-run-no-retry: a failed per-run verdict ' +
  'ends the streak immediately; the run is neither retried nor followed by ' +
  'the remaining runs', async () => {
  await withReportRoot(async (reportRoot) => {
    const fake = fakeDependencies({passes: [true, false, true]});
    const {streak: result} = await runner.runFormationReleaseHandoffGcpStreak(
      {runs: SEALED_CONSECUTIVE, variant: FIXED_VARIANT, reportRoot},
      fake.dependencies,
    );
    assert.equal(result.outcome, OUTCOME_ABORTED_RUN_FAILED);
    assert.deepEqual(fake.calls.runOnce, [1, 2]);
    assert.equal(result.executedRunCount, 2);
    assert.equal(result.passedRunCount, 1);
    assert.deepEqual(result.abortDetail, {
      run: 2,
      failureReasons: [FAILURE_REASON_SAMPLE],
    });
    assert.equal(result.runs[1].passed, false);
  });
});

test('streak-refuses-reverted-variant: the bounded streak admits only the ' +
  'fixed certification lane and never starts a reverted-control run', async () => {
  const streak = await import(STREAK_MODULE);
  await withReportRoot(async (reportRoot) => {
    const fake = fakeDependencies();
    const error = await refusalOf(runner.runFormationReleaseHandoffGcpStreak(
      {runs: SEALED_CONSECUTIVE, variant: REVERTED_VARIANT, reportRoot},
      fake.dependencies,
    ));
    assert.ok(error instanceof streak.StreakRefusalError);
    assert.equal(error.reason, REFUSAL_VARIANT);
    assert.equal(error.reason, streak.STREAK_REFUSAL.VARIANT_NOT_FIXED);
    assert.deepEqual(fake.calls.runOnce, []);
  });
});

test('reverted-control-lane-unchanged: the single-run reverted control ' +
  'keeps its distinct scenario, control block and expected-regression ' +
  'verdict', () => {
  assert.equal(runner.probeScenarioForVariant(REVERTED_VARIANT),
    REVERTED_CONTROL_SCENARIO);
  assert.equal(runner.probeScenarioForVariant(FIXED_VARIANT), SCENARIO);
  assert.equal(runner.REVERTED_CONTROL_SCENARIO_NAME,
    REVERTED_CONTROL_SCENARIO);
  const report = runner.buildRunReport({
    variant: REVERTED_VARIANT,
    fixedSourceFingerprint: FIXED_FINGERPRINT,
    revertedSourceFingerprint: REVERTED_FINGERPRINT,
    revertPatchFingerprint: null,
    deployedSourceFingerprint: REVERTED_FINGERPRINT,
    startedAt: new Date(),
    cluster: {error: null},
    // REAL analyzer output over the shared immutable run excerpt (the
    // recorded reverted-control regression shape of GCP run
    // 2026-08-28T20-24-59.265Z), never a hand-written analysis shape: the
    // control predicate reads the analyzer's actual `invariants` surface.
    analysis: analyzeFormationReleaseEvents(
      buildStrandedTeardownRunEvents(),
      STRANDED_TEARDOWN_RUN.sourceFingerprint,
    ),
    logDir: 'x',
  });
  assert.equal(report.variant, REVERTED_VARIANT);
  assert.equal(report.passed, true,
    'the control passes when the reverted source shows the named regression');
  assert.equal(report.control.expectedRegressionObserved, true);
  assert.equal(report.control.underlyingClosurePassed, false);
  assert.equal(runner.expectedRegressionObserved(report.analysis), true);
});

test('witness-deterministic: two identical fake drives produce identical ' +
  'streak projections', async () => {
  await withReportRoot(async (reportRoot) => {
    const drive = async () => {
      const fake = fakeDependencies({passes: [true, false, true]});
      const {streak: result} = await runner.runFormationReleaseHandoffGcpStreak(
        {runs: SEALED_CONSECUTIVE, variant: FIXED_VARIANT, reportRoot},
        fake.dependencies,
      );
      const {startedAt, finishedAt, ...stable} = result;
      assert.ok(startedAt <= finishedAt);
      return {stable, calls: fake.calls};
    };
    const first = await drive();
    const second = await drive();
    assert.deepEqual(second.stable, first.stable);
    assert.deepEqual(second.calls, first.calls);
  });
});
