// Deterministic evidence harness for the
// formation-analyzer-retained-uncompleted-teardown quest: receipt
// declarations only. The shared runtime
// (scripts/quest-evidence-harness-runtime.js) re-runs each recorded proof
// command and writes the test-receipt probe artifact
// (solve/evidence/formation-analyzer-retained-uncompleted-teardown.receipt.json).
// Each receipt re-executes one focused witness scenario rather than trusting
// a claim, so a regression that flips a witness red flips this receipt to
// fail and the quest's doneWhen cannot close on stale green evidence.
//
// Receipt honesty: the witness file uses raw node:test so each scenario is
// independently selectable with --test-name-pattern by its anchored name.
// On HEAD (before the cure) the retained-uncompleted-at-teardown-classified,
// retained-uncompleted-typed-outcome-class and
// completion-span-covers-every-generation receipts are RED (GCP run
// 2026-08-30T07-13-07.175Z: generation e1:4 last recorded `active` at
// 07:16:52.663, seed draining 07:17:09.238, classified `stranded` with a
// 12.3 s span that skipped it); completion-span-unchanged-for-completed-
// generations, teardown-truncated-class-unchanged,
// active-without-drain-marker-stays-stranded, no-second-active-ready-authority
// and witness-deterministic are green and must stay green — a cure that
// turns them red is rejected.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const WITNESS_TEST =
  'test/scripts/' +
  'formation-release-handoff-gcp-analysis-retained-uncompleted-teardown' +
  '.test.js';
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
    id: 'retained-uncompleted-at-teardown-classified',
    command: scenarioCommand('^retained-uncompleted-at-teardown-classified'),
    detail: 'a generation whose last recorded transition is active when its ' +
      'authority marked draining (run 07-13-07 generation e1:4) is ' +
      'classified retained_uncompleted_at_teardown, excluded from the ' +
      'stranded count, and fails closure on the dedicated ' +
      'noRetainedUncompletedAtTeardown invariant',
  }),
  Object.freeze({
    id: 'retained-uncompleted-typed-outcome-class',
    command: scenarioCommand('^retained-uncompleted-typed-outcome-class'),
    detail: 'the analyzer owns retained_uncompleted_at_teardown as a frozen ' +
      'typed GENERATION_CLASSIFICATION member distinct from ' +
      'teardown_truncated; the retained generation is never folded into ' +
      'teardown truncation',
  }),
  Object.freeze({
    id: 'completion-span-covers-every-generation',
    command: scenarioCommand('^completion-span-covers-every-generation'),
    detail: 'completionMs is fail-closed null while any captured generation ' +
      'never completed, so withinCertificationBudget cannot pass on the ' +
      'first generation alone (HEAD reported 12.3 s for run 07-13-07)',
  }),
  Object.freeze({
    id: 'completion-span-unchanged-for-completed-generations',
    command: scenarioCommand(
      '^completion-span-unchanged-for-completed-generations',
    ),
    detail: 'with every captured generation completed the span still runs ' +
      'from the first capture to the last completion and closure passes',
  }),
  Object.freeze({
    id: 'teardown-truncated-class-unchanged',
    command: scenarioCommand('^teardown-truncated-class-unchanged'),
    detail: 'a valid member-missing revocation after the authority marked ' +
      'draining is still classified teardown_truncated, excluded from ' +
      'stranding, with retention across the reopen intact',
  }),
  Object.freeze({
    id: 'active-without-drain-marker-stays-stranded',
    command: scenarioCommand('^active-without-drain-marker-stays-stranded'),
    detail: 'a generation still active when the log ends with no draining ' +
      'marker for its authority remains stranded (fail-closed)',
  }),
  Object.freeze({
    id: 'no-second-active-ready-authority',
    command: scenarioCommand('^no-second-active-ready-authority'),
    detail: 'nodes-status, publication-count and coverage events never ' +
      'change the classification derived from the owner\'s recorded ' +
      'transitions',
  }),
  Object.freeze({
    id: 'witness-deterministic',
    command: scenarioCommand('^witness-deterministic'),
    detail: 'two analyses of the identical recorded run produce the ' +
      'identical classification, invariants and span',
  }),
]);

const QUEST_ID = 'formation-analyzer-retained-uncompleted-teardown';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME =
  'formation-analyzer-retained-uncompleted-teardown.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
