// Deterministic evidence harness for the
// priority-recovery-add-dispatch-cadence quest: receipt declarations only.
// The shared runtime (scripts/quest-evidence-harness-runtime.js) re-runs
// each recorded proof command and writes the test-receipt probe artifact
// (solve/evidence/priority-recovery-add-dispatch-cadence.receipt.json).
// Each receipt re-executes one focused witness scenario rather than trusting
// a claim, so a regression that flips a witness red flips this receipt to
// fail and the quest's doneWhen cannot close on stale green evidence.
//
// Receipt honesty: the witness file uses raw node:test so each scenario is
// independently selectable with --test-name-pattern by its anchored name.
// On HEAD (before the cure) the no-spurious-refusal-after-terminal,
// priority-adds-acked-within-contract-bound, joiners-ready-within-60s-budget,
// budget-lane-released-after-claim and interlock-race-admits-racing-siblings
// receipts are RED (the two traced mechanisms of GCP run
// 2026-08-29T19-08-22.423Z); self-move-exclusion-preserved,
// budgets-and-cadence-unchanged and witness-deterministic are green and must
// stay green — a cure that turns them red is rejected.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const WITNESS_TEST =
  'test/convergence/dt6-priority-recovery-add-dispatch-cadence.test.js';
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
    id: 'self-move-exclusion-preserved',
    command: scenarioCommand('^self-move-exclusion-preserved'),
    detail: 'while the operation-ledger self-move is in flight every sibling ' +
      'priority ADD is refused by the real ledger interlock with ' +
      'operation_ledger_self_move_in_flight and none is admitted before the ' +
      'self-move terminal (the exclusion is byte-for-byte preserved)',
  }),
  Object.freeze({
    id: 'no-spurious-refusal-after-terminal',
    command: scenarioCommand('^no-spurious-refusal-after-terminal'),
    detail: 'after the self-move reaches terminal no sibling is refused with ' +
      'operation_ledger_self_move_in_flight against an authoritatively idle ' +
      'ledger (run 19:12:01.353: three siblings were)',
  }),
  Object.freeze({
    id: 'priority-adds-acked-within-contract-bound',
    command: scenarioCommand('^priority-adds-acked-within-contract-bound'),
    detail: 'every sibling priority ADD is dispatched and acknowledged within ' +
      'terminal + one priority retry cadence (CRITICAL_CHECK_DELAY_MS) + one ' +
      'measured single-operation latency, i.e. the ADDs within the budget run ' +
      'concurrently instead of one per lane hold',
  }),
  Object.freeze({
    id: 'joiners-ready-within-60s-budget',
    command: scenarioCommand('^joiners-ready-within-60s-budget'),
    detail: 'the owner-derived startup authority of the joiners reaches READY ' +
      'inside the unchanged 60-second formation certification budget and ' +
      'within terminal + one wake latency + one operation latency + one ' +
      'activation',
  }),
  Object.freeze({
    id: 'budget-lane-released-after-claim',
    command: scenarioCommand('^budget-lane-released-after-claim'),
    detail: 'the priority_add concurrent-create budget turn is released after ' +
      'persist and claim: a sibling is admitted by the serialized budget ' +
      'turn while another sibling\'s dispatch is still awaiting its ' +
      'acknowledgement, at least two ADDs of different partitions are in ' +
      'dispatched state at once, and the ledger rows the budget counts cover ' +
      'both (never exceeding maxConcurrentAdds)',
  }),
  Object.freeze({
    id: 'interlock-race-admits-racing-siblings',
    command: scenarioCommand('^interlock-race-admits-racing-siblings'),
    detail: 'the siblings woken together by the self-move OPERATION_COMPLETED ' +
      'race tryClearHeldOperationLedgerSelfMove; the ones that observe the ' +
      'holder already cleared by a sibling are admitted on that same wake ' +
      'instead of being refused and re-timed',
  }),
  Object.freeze({
    id: 'budgets-and-cadence-unchanged',
    command: scenarioCommand('^budgets-and-cadence-unchanged'),
    detail: 'maxConcurrentAdds (5) and CRITICAL_CHECK_DELAY_MS (5000) are the ' +
      'HEAD values, the real coordinator runs with that budget, the self-move ' +
      'exclusion lasts exactly as long as the self-move is in flight, and the ' +
      'per-attempt interlock refusal cadence while it is in flight is unchanged',
  }),
  Object.freeze({
    id: 'witness-deterministic',
    command: scenarioCommand('^witness-deterministic'),
    detail: 'two identical virtual-clock drives produce the identical ' +
      'admission/dispatch event sequence and READY instant',
  }),
]);

const QUEST_ID = 'priority-recovery-add-dispatch-cadence';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME =
  'priority-recovery-add-dispatch-cadence.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
