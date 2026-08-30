// Deterministic evidence harness for the
// solver-capture-foreign-evidence-exclusion quest: receipt declarations
// only. The shared runtime (scripts/quest-evidence-harness-runtime.js)
// re-runs each recorded proof command and writes the test-receipt probe
// artifact (solve/evidence/solver-capture-foreign-evidence-exclusion
// .receipt.json). Each receipt re-executes one focused witness scenario
// rather than trusting a claim, so a regression that flips a witness red
// flips this receipt to fail and the quest's doneWhen cannot close on stale
// green evidence.
//
// Receipt honesty: the witness file uses raw node:test so each scenario is
// independently selectable with --test-name-pattern by its anchored name.
// On HEAD (before the cure) the foreign-receipt-excluded-from-auto-capture,
// product-quest-not-refused-by-foreign-receipt,
// foreign-receipt-only-change-captures-nothing and
// harness-output-option-writes-to-scratch receipts are RED (the shared-
// worktree receipt sweep and the missing scratch output);
// own-receipt-still-captured-unchanged, harness-default-output-unchanged
// and witness-deterministic are green and must stay green — a cure that
// turns them red is rejected.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const WITNESS_TEST =
  'test/solve/solver-capture-foreign-evidence-exclusion.test.js';
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
    id: 'foreign-receipt-excluded-from-auto-capture',
    command: scenarioCommand('^foreign-receipt-excluded-from-auto-capture'),
    detail: 'another quest\'s regenerated solve/evidence/<other>.receipt.json ' +
      'is not swept into this quest\'s auto-captured attempt: the recorded ' +
      'artifact names only this quest\'s own change and the foreign receipt ' +
      'stays dirty and untouched in the worktree',
  }),
  Object.freeze({
    id: 'product-quest-not-refused-by-foreign-receipt',
    command: scenarioCommand('^product-quest-not-refused-by-foreign-receipt'),
    detail: 'a product quest capturing beside a foreign receipt records its ' +
      'attempt instead of being refused with "workflow changes must be ' +
      'recorded in a workflow/Quest tooling Quest"',
  }),
  Object.freeze({
    id: 'foreign-receipt-only-change-captures-nothing',
    command: scenarioCommand('^foreign-receipt-only-change-captures-nothing'),
    detail: 'when the only dirty path is another quest\'s receipt the ' +
      'capture is empty and refused as nothing changed; no attempt is ' +
      'recorded for a foreign receipt',
  }),
  Object.freeze({
    id: 'own-receipt-still-captured-unchanged',
    command: scenarioCommand('^own-receipt-still-captured-unchanged'),
    detail: 'this quest\'s own regenerated receipt rides with the captured ' +
      'change exactly as before while the foreign one does not',
  }),
  Object.freeze({
    id: 'harness-output-option-writes-to-scratch',
    command: scenarioCommand('^harness-output-option-writes-to-scratch'),
    detail: 'the evidence harness runtime honours `--output <path>`: the ' +
      'receipt is written to the scratch path, the declared solve/evidence ' +
      'artifact is left untouched, and the summary names the scratch path',
  }),
  Object.freeze({
    id: 'harness-default-output-unchanged',
    command: scenarioCommand('^harness-default-output-unchanged'),
    detail: 'without `--output` the runtime writes its declared ' +
      'solve/evidence receipt with its generatedAt identity intact',
  }),
  Object.freeze({
    id: 'witness-deterministic',
    command: scenarioCommand('^witness-deterministic'),
    detail: 'two identical capture fixtures record the identical ' +
      'changed-path set',
  }),
]);

const QUEST_ID = 'solver-capture-foreign-evidence-exclusion';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME =
  'solver-capture-foreign-evidence-exclusion.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
