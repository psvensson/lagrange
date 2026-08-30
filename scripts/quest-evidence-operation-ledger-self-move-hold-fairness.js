// Deterministic evidence harness for the
// operation-ledger-self-move-hold-fairness quest: receipt declarations only.
// The shared runtime (scripts/quest-evidence-harness-runtime.js) re-runs
// each recorded proof command and writes the test-receipt probe artifact
// (solve/evidence/operation-ledger-self-move-hold-fairness.receipt.json).
// Each receipt re-executes one focused witness scenario rather than trusting
// a claim, so a regression that flips a witness red flips this receipt to
// fail and the quest's doneWhen cannot close on stale green evidence.
//
// Receipt honesty: the witness file uses raw node:test so each scenario is
// independently selectable with --test-name-pattern by its anchored name.
// On HEAD (4bc6c1d25, before the cure) the
// registered-self-move-engages-on-target-ready-lease,
// newer-dependents-refused-after-engagement,
// incumbents-drain-then-self-move-claims, single-non-terminal-ledger-self-move
// and failed-census-retries-on-dispatch-cadence receipts are RED (the three
// traced mechanisms of GCP runs 23-51-32 / 23-58-17);
// exclusion-and-idle-only-preserved, budgets-and-cadence-unchanged (both
// on the drive without the +26 s duplicate-self-move injection, which on
// HEAD deadlocks the first self-move's IDLE_ONLY census) and
// witness-deterministic are green and must stay green — a cure that turns
// them red is rejected.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const WITNESS_TEST =
  'test/convergence/dt6-operation-ledger-self-move-hold-fairness.test.js';
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
    id: 'registered-self-move-engages-on-target-ready-lease',
    command: scenarioCommand(
      '^registered-self-move-engages-on-target-ready-lease',
    ),
    detail: 'the registered ledger self-move is ENGAGED for admission at the ' +
      'first probe after its target holds a current READY lease on the ' +
      'dimension the dispatch path evaluates (controlPlaneRecoveryEligible ' +
      'via the priority-recovery dispatch bootstrap exemption) while the ' +
      'target is still PRIORITY_CONTROL_PLANE_RECOVERY_PENDING; dependents ' +
      'planned before that lease admit under the registered holder',
  }),
  Object.freeze({
    id: 'newer-dependents-refused-after-engagement',
    command: scenarioCommand('^newer-dependents-refused-after-engagement'),
    detail: 'every dependent planned after engagement is refused ' +
      'operation_ledger_self_move_in_flight by the engaged holder until the ' +
      'self-move terminal and none is admitted; the exempt emergency ' +
      'control_plane_publications re-plan admits per the EXEMPT row',
  }),
  Object.freeze({
    id: 'incumbents-drain-then-self-move-claims',
    command: scenarioCommand('^incumbents-drain-then-self-move-claims'),
    detail: 'the self-move is sent only after the incumbents admitted before ' +
      'engagement drain, with no dependent row non-terminal, SENDING by ' +
      '+32 s, and the joiners\' startup authority is READY inside the ' +
      'unchanged 60 s budget',
  }),
  Object.freeze({
    id: 'single-non-terminal-ledger-self-move',
    command: scenarioCommand('^single-non-terminal-ledger-self-move'),
    detail: 'the real reservation reconciliation releases the held ' +
      'self-move\'s reservation as an orphan on a null point read, and the ' +
      'seed\'s next lifecycle reads answered with a positive terminal row ' +
      'that is not the holder\'s neither release the hold nor admit the ' +
      'second ledger REPLACE (refused ' +
      'operation_ledger_self_move_waiting_for_idle_ledger); at most one ' +
      'ledger self-move is non-terminal at any sampled instant',
  }),
  Object.freeze({
    id: 'failed-census-retries-on-dispatch-cadence',
    command: scenarioCommand('^failed-census-retries-on-dispatch-cadence'),
    detail: 'the one failed cluster-wide idle census (carrying the ' +
      'repository\'s 5 s incomplete-read backoff hint) is re-read within ' +
      '2 x DISPATCH_RETRY_DELAY_MS (250 ms) of the failure',
  }),
  Object.freeze({
    id: 'exclusion-and-idle-only-preserved',
    command: scenarioCommand('^exclusion-and-idle-only-preserved'),
    detail: 'while the self-move is live every dependent refusal is ' +
      'operation_ledger_self_move_in_flight and none admits; with incumbents ' +
      'in flight the owner parks the self-move as ' +
      'operation_ledger_self_move_waiting_for_idle_ledger and sends only ' +
      'into an idle ledger; the quorum-spread hold still defers dependents ' +
      'as operation_ledger_quorum_concentrated (sibling engagement scenario)',
  }),
  Object.freeze({
    id: 'budgets-and-cadence-unchanged',
    command: scenarioCommand('^budgets-and-cadence-unchanged'),
    detail: 'maxConcurrentAdds (5), CRITICAL_CHECK_DELAY_MS (5000), ' +
      'DISPATCH_RETRY_DELAY_MS (250), the incomplete-read backoff floor/ceiling ' +
      '(250/5000) are the HEAD values, the real coordinator runs with that ' +
      'budget, the self-move lifecycle from send to terminal is exactly the ' +
      'run\'s latency, and every re-attempt follows its refusal within one ' +
      'unchanged priority retry cadence',
  }),
  Object.freeze({
    id: 'witness-deterministic',
    command: scenarioCommand('^witness-deterministic'),
    detail: 'two identical virtual-clock drives produce the identical ' +
      'admission/dispatch event sequence and READY instant',
  }),
]);

const QUEST_ID = 'operation-ledger-self-move-hold-fairness';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME =
  'operation-ledger-self-move-hold-fairness.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
