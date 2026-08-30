// Deterministic evidence harness for the
// solver-attempt-base-pending-step-pin quest: receipt declarations only.
// The shared runtime (scripts/quest-evidence-harness-runtime.js) re-runs
// each recorded proof command and writes the test-receipt probe artifact
// (solve/evidence/solver-attempt-base-pending-step-pin.receipt.json).
// Each receipt re-executes one focused witness scenario rather than trusting
// a claim, so a regression that flips a witness red flips this receipt to
// fail and the quest's doneWhen cannot close on stale green evidence.
//
// Receipt honesty: the witness file uses raw node:test so each scenario is
// independently selectable with --test-name-pattern by its anchored name.
// On HEAD (before the cure) the one-shot-attempt-uses-pending-step-pin,
// pending-step-attempts-share-one-base,
// correct-attempt-base-repairs-pending-pin-drift and
// correct-attempt-base-refuses-non-identical-delta receipts are RED (the
// 2026-08-30 mixed-base candidate on
// operation-ledger-self-move-holder-release-on-engagement);
// attempt-base-without-pending-step-unchanged,
// rejection-base-correction-unchanged and witness-deterministic are green
// and must stay green — a cure that turns them red is rejected.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const WITNESS_TEST =
  'test/solve/solver-attempt-base-pending-step-pin.test.js';
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
    id: 'one-shot-attempt-uses-pending-step-pin',
    command: scenarioCommand('^one-shot-attempt-uses-pending-step-pin'),
    detail: 'after `solve step` pinned its base and an unrelated commit ' +
      'advanced HEAD, a one-shot `solve attempt` records the pending step\'s ' +
      'pin as its workspace base and never re-pins from the advanced HEAD',
  }),
  Object.freeze({
    id: 'pending-step-attempts-share-one-base',
    command: scenarioCommand('^pending-step-attempts-share-one-base'),
    detail: 'the one-shot attempt and the step commit share one recorded ' +
      'base, so the landing candidate (review envelope) fingerprint is ' +
      'constructible instead of "landing candidate requires one recorded ' +
      'common Git base"',
  }),
  Object.freeze({
    id: 'correct-attempt-base-repairs-pending-pin-drift',
    command: scenarioCommand('^correct-attempt-base-repairs-pending-pin-drift'),
    detail: '`solve correct-attempt-base` realigns an attempt whose base ' +
      'drifted from the pending pin to the sibling recorded base with an ' +
      'append-only attempt-base-corrected event (typed authorization ' +
      'sibling-recorded-base) when the delta is byte-identical at both bases',
  }),
  Object.freeze({
    id: 'correct-attempt-base-refuses-non-identical-delta',
    command: scenarioCommand('^correct-attempt-base-refuses-non-identical-delta'),
    detail: 'when the inter-base range touched an attempt path the repair ' +
      'fails closed with the typed target-base delta reason and appends no ' +
      'correction event',
  }),
  Object.freeze({
    id: 'attempt-base-without-pending-step-unchanged',
    command: scenarioCommand('^attempt-base-without-pending-step-unchanged'),
    detail: 'with no pending step the first one-shot attempt pins the live ' +
      'HEAD and a later one retains the active source epoch base',
  }),
  Object.freeze({
    id: 'rejection-base-correction-unchanged',
    command: scenarioCommand('^rejection-base-correction-unchanged'),
    detail: 'a replacement recorded off the standing candidate-rejection ' +
      'base is still corrected to that base by the first authorization rule',
  }),
  Object.freeze({
    id: 'witness-deterministic',
    command: scenarioCommand('^witness-deterministic'),
    detail: 'two identical incident fixtures record the identical base ' +
      'outcome',
  }),
]);

const QUEST_ID = 'solver-attempt-base-pending-step-pin';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME =
  'solver-attempt-base-pending-step-pin.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
