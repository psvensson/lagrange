// Deterministic evidence harness for the
// operation-ledger-self-move-hold-engagement quest: receipt declarations only.
// The shared runtime (scripts/quest-evidence-harness-runtime.js) re-runs
// each recorded proof command and writes the test-receipt probe artifact
// (solve/evidence/operation-ledger-self-move-hold-engagement.receipt.json).
// Each receipt re-executes one focused witness scenario rather than trusting
// a claim, so a regression that flips a witness red flips this receipt to
// fail and the quest's doneWhen cannot close on stale green evidence.
//
// Receipt honesty: the witness file uses raw node:test so each scenario is
// independently selectable with --test-name-pattern by its anchored name.
// On HEAD (675d6b512, before the cure) the
// dependents-admitted-before-self-move-dispatch-admissible,
// dependents-acked-within-contract-bound and joiners-ready-within-60s-budget
// receipts are RED (the ledger self-move DEFER hold engages at
// createOperation, GCP streak runs 21-08-21 / 21-22-08);
// self-move-exclusion-once-live-preserved, idle-only-admission-preserved,
// quorum-concentrated-deferral-preserved, budgets-and-cadence-unchanged and
// witness-deterministic are green and must stay green — a cure that turns
// them red is rejected.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const WITNESS_TEST =
  'test/convergence/dt6-operation-ledger-self-move-hold-engagement.test.js';
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
    id: 'self-move-exclusion-once-live-preserved',
    command: scenarioCommand('^self-move-exclusion-once-live-preserved'),
    detail: 'from the instant the ledger self-move is dispatch-admissible ' +
      '(target READY lease) until its terminal, every dependent admission ' +
      'is refused by the real interlock with ' +
      'operation_ledger_self_move_in_flight and none is admitted (the run-20 ' +
      'exclusion once live is byte-for-byte preserved)',
  }),
  Object.freeze({
    id: 'idle-only-admission-preserved',
    command: scenarioCommand('^idle-only-admission-preserved'),
    detail: 'the self-move is never dispatched while a dependent ADD row is ' +
      'non-terminal; with dependents live at its owner\'s dispatch attempt ' +
      'the real owner parks it as ' +
      'operation_ledger_self_move_waiting_for_idle_ledger until they drain',
  }),
  Object.freeze({
    id: 'quorum-concentrated-deferral-preserved',
    command: scenarioCommand('^quorum-concentrated-deferral-preserved'),
    detail: 'after the self-move terminal, while the ledger quorum stays ' +
      'concentrated and spreadable (until the spread ADD and surplus REMOVE ' +
      'complete), dependent admission defers as ' +
      'operation_ledger_quorum_concentrated and none is admitted',
  }),
  Object.freeze({
    id: 'dependents-admitted-before-self-move-dispatch-admissible',
    command: scenarioCommand(
      '^dependents-admitted-before-self-move-dispatch-admissible',
    ),
    detail: 'the four dependent priority ADDs planned 3.5 s after the ' +
      'self-move (target not yet READY) are admitted before the self-move ' +
      'is dispatch-admissible, never refused before that instant, and the ' +
      'self-move is sent only after they complete',
  }),
  Object.freeze({
    id: 'dependents-acked-within-contract-bound',
    command: scenarioCommand('^dependents-acked-within-contract-bound'),
    detail: 'every dependent ADD is acknowledged within planning instant + ' +
      'one priority retry cadence (CRITICAL_CHECK_DELAY_MS) + one measured ' +
      'single-operation latency (the exempt emergency ADD planned at the ' +
      'same instant), i.e. under the existing budget with no hold',
  }),
  Object.freeze({
    id: 'joiners-ready-within-60s-budget',
    command: scenarioCommand('^joiners-ready-within-60s-budget'),
    detail: 'the owner-derived startup authority of the joiners reaches READY ' +
      'inside the unchanged 60-second formation certification budget of the ' +
      'self-move creation, exactly on the last spread completion it depends on',
  }),
  Object.freeze({
    id: 'budgets-and-cadence-unchanged',
    command: scenarioCommand('^budgets-and-cadence-unchanged'),
    detail: 'maxConcurrentAdds (5) and CRITICAL_CHECK_DELAY_MS (5000) are the ' +
      'HEAD values, the real coordinator runs with that budget, the ' +
      'self-move lifecycle from send to terminal is exactly the run\'s ' +
      'latency, and every re-attempt follows its refusal within one ' +
      'unchanged priority retry cadence',
  }),
  Object.freeze({
    id: 'witness-deterministic',
    command: scenarioCommand('^witness-deterministic'),
    detail: 'two identical virtual-clock drives produce the identical ' +
      'admission/dispatch event sequence and READY instant',
  }),
]);

const QUEST_ID = 'operation-ledger-self-move-hold-engagement';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME =
  'operation-ledger-self-move-hold-engagement.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
