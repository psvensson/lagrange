// Deterministic evidence harness for the
// formation-gcp-runner-bounded-streak quest: receipt declarations only. The
// shared runtime (scripts/quest-evidence-harness-runtime.js) re-runs each
// recorded proof command and writes the test-receipt probe artifact
// (solve/evidence/formation-gcp-runner-bounded-streak.receipt.json). Each
// receipt re-executes one focused witness scenario rather than trusting a
// claim, so a regression that flips a witness red flips this receipt to
// fail and the quest's doneWhen cannot close on stale green evidence.
//
// Receipt honesty: the witness file uses raw node:test so each scenario is
// independently selectable with --test-name-pattern by its anchored name.
// The witness drives the streak with an injected fake run function and
// never reaches GCP. On HEAD (before the cure) the runner has no `--runs`
// mode, so streak-run-count-must-equal-sealed-consecutive,
// streak-refuses-dirty-source-before-each-run,
// streak-refuses-candidate-fingerprint-drift,
// streak-report-is-projection-of-run-reports,
// streak-stops-at-first-failed-run-no-retry, streak-refuses-reverted-variant
// and witness-deterministic are RED; reverted-control-lane-unchanged is
// green and must stay green — a cure that turns it red is rejected.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const WITNESS_TEST =
  'test/scripts/run-formation-release-handoff-gcp-streak.test.js';
const NODE_TEST_COMMAND_PREFIX = 'node --test ';
const TEST_NAME_PATTERN_FLAG_PREFIX = '--test-name-pattern="';
const DOUBLE_QUOTE = '"';
const SPACE = ' ';

// One verbatim proof command per scenario. node --test --test-name-pattern
// selects exactly one top-level witness scenario by its anchored name, so a
// green receipt is honest (its scenario exits 0) and a red receipt is honest
// (its scenario exits non-zero).
function scenarioCommand(scenarioPattern) {
  return NODE_TEST_COMMAND_PREFIX +
    TEST_NAME_PATTERN_FLAG_PREFIX + scenarioPattern + DOUBLE_QUOTE +
    SPACE + WITNESS_TEST;
}

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'streak-run-count-must-equal-sealed-consecutive',
    command: scenarioCommand(
      '^streak-run-count-must-equal-sealed-consecutive',
    ),
    detail: '--runs N is refused with the typed reason ' +
      'run_count_not_sealed_consecutive unless N equals the sealed ' +
      'consecutive count (3) read from the closure quest doneWhen; no run ' +
      'starts on refusal',
  }),
  Object.freeze({
    id: 'streak-refuses-dirty-source-before-each-run',
    command: scenarioCommand('^streak-refuses-dirty-source-before-each-run'),
    detail: 'a dirty src/ tree observed before a run aborts the streak with ' +
      'the typed outcome aborted_dirty_source after exactly the runs ' +
      'already executed',
  }),
  Object.freeze({
    id: 'streak-refuses-candidate-fingerprint-drift',
    command: scenarioCommand('^streak-refuses-candidate-fingerprint-drift'),
    detail: 'a source fingerprint differing from the run-1 candidate aborts ' +
      'before the next run with aborted_fingerprint_changed naming both ' +
      'fingerprints',
  }),
  Object.freeze({
    id: 'streak-report-is-projection-of-run-reports',
    command: scenarioCommand('^streak-report-is-projection-of-run-reports'),
    detail: 'three admitted passing runs complete the streak; the aggregate ' +
      'report copies each per-run verdict, path, fingerprint and failure ' +
      'reasons, carries no verdict of its own, and never enters the ' +
      'probe-scanned *.report.json surface',
  }),
  Object.freeze({
    id: 'streak-stops-at-first-failed-run-no-retry',
    command: scenarioCommand('^streak-stops-at-first-failed-run-no-retry'),
    detail: 'a failed per-run verdict ends the streak immediately ' +
      '(aborted_run_failed): no retry, no run-until-pass, no further runs',
  }),
  Object.freeze({
    id: 'streak-refuses-reverted-variant',
    command: scenarioCommand('^streak-refuses-reverted-variant'),
    detail: 'the bounded streak admits only the fixed certification lane ' +
      '(streak_requires_fixed_variant) and never starts a reverted-control ' +
      'run',
  }),
  Object.freeze({
    id: 'reverted-control-lane-unchanged',
    command: scenarioCommand('^reverted-control-lane-unchanged'),
    detail: 'the single-run reverted control keeps its distinct scenario ' +
      'name, control block and expected-regression verdict byte-for-byte',
  }),
  Object.freeze({
    id: 'witness-deterministic',
    command: scenarioCommand('^witness-deterministic'),
    detail: 'two identical fake drives produce identical streak ' +
      'projections and dependency call sequences',
  }),
]);

const QUEST_ID = 'formation-gcp-runner-bounded-streak';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME = 'formation-gcp-runner-bounded-streak.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
