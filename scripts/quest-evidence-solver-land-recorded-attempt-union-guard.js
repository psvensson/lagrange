// Deterministic evidence harness for the
// solver-land-recorded-attempt-union-guard quest: receipt declarations only.
// The shared runtime (scripts/quest-evidence-harness-runtime.js) re-runs
// each recorded proof command and writes the test-receipt probe artifact
// (solve/evidence/solver-land-recorded-attempt-union-guard.receipt.json).
// Each receipt re-executes one focused witness scenario rather than trusting
// a claim, so a regression that flips a witness red flips this receipt to
// fail and the quest's doneWhen cannot close on stale green evidence.
//
// Receipt honesty: the witness file uses raw node:test so each scenario is
// independently selectable with --test-name-pattern by its anchored name.
// On HEAD (before the cure) land-blocks-uncovered-source-paths,
// refused-attempt-record-leaves-candidate-unlandable,
// green-receipt-never-authorizes-source-landing,
// scope-safe-commit-equals-recorded-union and
// recorded-and-verified-union-lands-exactly are RED (the 2026-08-30 sequence
// that produced ce0e4942d: land commits staged source with verdict
// not-required, and an unrecorded artifact on disk widens the pathspec);
// evidence-only-landing-unchanged and witness-deterministic are green and
// must stay green — a cure that turns them red is rejected.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const WITNESS_TEST =
  'test/solve/solver-land-recorded-attempt-union-guard.test.js';
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
    id: 'land-blocks-uncovered-source-paths',
    command: scenarioCommand('^land-blocks-uncovered-source-paths'),
    detail: 'with the doneWhen receipt already green, the quest SOLVED on ' +
      'zero attempts, a source edit staged in the index and an unrecorded ' +
      'diff artifact on disk naming it, `land` refuses with the typed ' +
      'blocked-uncovered-source-paths problem naming the path: HEAD is ' +
      'unchanged, no verdict is recorded, no attempt is auto-recorded, and ' +
      '`next` projects repair-audit with the same code and required paths',
  }),
  Object.freeze({
    id: 'refused-attempt-record-leaves-candidate-unlandable',
    command: scenarioCommand('^refused-attempt-record-leaves-candidate-unlandable'),
    detail: 'the one-shot `solve attempt` of an over-bound source change is ' +
      'refused by the real scope-pressure precommit guard (gate-decision ' +
      'blocked-scope, no attempt event); the subsequent `land` blocks naming ' +
      'every staged path and records nothing, so the candidate stays ' +
      'un-landable until an attempt is honestly recorded and verified',
  }),
  Object.freeze({
    id: 'green-receipt-never-authorizes-source-landing',
    command: scenarioCommand('^green-receipt-never-authorizes-source-landing'),
    detail: 'a green doneWhen receipt with staged source and no recorded ' +
      'attempt never yields a verdict not-required landing: land throws the ' +
      'typed block, commits nothing and records no verdict',
  }),
  Object.freeze({
    id: 'scope-safe-commit-equals-recorded-union',
    command: scenarioCommand('^scope-safe-commit-equals-recorded-union'),
    detail: 'the landing pathspec of a recorded and approved union is exactly ' +
      'that union plus the quest\'s own solve/ artifacts; a stray unrecorded ' +
      'artifact on disk naming an untracked extra source file cannot widen it',
  }),
  Object.freeze({
    id: 'recorded-and-verified-union-lands-exactly',
    command: scenarioCommand('^recorded-and-verified-union-lands-exactly'),
    detail: 'a recorded source attempt with a content-bound aggregate ' +
      'verifier approval lands: the commit contains exactly the recorded ' +
      'union outside solve/, the extra file named only by the stray artifact ' +
      'is not swept, and nothing is pushed',
  }),
  Object.freeze({
    id: 'evidence-only-landing-unchanged',
    command: scenarioCommand('^evidence-only-landing-unchanged'),
    detail: 'a quest with no delta outside solve/ keeps its verdict ' +
      'not-required landing: it commits only its solve/ artifacts and invents ' +
      'no verifier finding',
  }),
  Object.freeze({
    id: 'witness-deterministic',
    command: scenarioCommand('^witness-deterministic'),
    detail: 'two identical incident fixtures produce the identical landing ' +
      'outcome (same typed code, sorted path list and message)',
  }),
]);

const QUEST_ID = 'solver-land-recorded-attempt-union-guard';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME =
  'solver-land-recorded-attempt-union-guard.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
