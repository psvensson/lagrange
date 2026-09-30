// Deterministic evidence harness for the
// priority-recovery-drain-parked-self-move-progress quest: receipt
// declarations only. The shared runtime
// (scripts/quest-evidence-harness-runtime.js) re-runs each recorded proof
// command and writes the test-receipt probe artifact
// (solve/evidence/priority-recovery-drain-parked-self-move-progress.receipt.json).
// Each receipt re-executes one focused witness scenario rather than trusting
// a claim, so a regression that flips a witness red flips this receipt to
// fail and the quest's doneWhen cannot close on stale green evidence.
//
// Receipt honesty: the witness file uses raw node:test so each scenario is
// independently selectable with --test-name-pattern by its anchored name.
// On HEAD (dae475a3b, before the cure) the
// parked-local-self-move-with-fresh-park-evidence-is-recovering,
// no-stale-fail-while-park-evidence-fresh and
// self-move-claims-on-incumbent-terminal-without-successor receipts are RED
// (GCP runs 2026-08-30T04-49-12 / 07-06-30: the target's own drain settled
// the parked self-move fail_priority_recovery_drain_stale at age 33.6 s /
// 39.8 s while local_owner, then a re-plan and a successor 15 s later), and
// parked-self-move-without-park-evidence-still-stale-fails is RED in its
// silent-lane half (HEAD fails the silent lane at 30 s on the evidence-blind
// rule instead of at 44 s when its last park is a full PENDING_TIMEOUT_MS
// old) while its never-ran half is green on HEAD and after;
// idle-only-exclusion-and-terminal-release-preserved and
// budgets-and-cadence-unchanged are RED on HEAD only because HEAD's stale
// FAIL removes the self-move before it is ever sent (their IDLE_ONLY-at-send,
// hold-through-terminal and lifecycle-latency assertions need the send) and
// are the preservation guards of the cure (they caught a cure variant whose
// timeout reconcile re-dispatched the parked self-move past the census);
// remote-owner-drain-rule-unchanged and witness-deterministic are green on
// HEAD and must stay green — a cure that turns them red is rejected.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const WITNESS_TEST =
  'test/convergence/dt6-priority-recovery-drain-parked-self-move.test.js';
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
    id: 'parked-local-self-move-with-fresh-park-evidence-is-recovering',
    command: scenarioCommand(
      '^parked-local-self-move-with-fresh-park-evidence-is-recovering',
    ),
    detail: 'every drain sweep of the locally-owned ledger self-move parked ' +
      'at the IDLE_ONLY census behind a live incumbent (the run\'s shape: ' +
      'completion converged, source retirement_unproven_stale, step age ' +
      'past PENDING_TIMEOUT_MS) reads fresh waiting_for_incumbent park ' +
      'evidence naming the census incumbent (age within one dispatch ' +
      'cadence, bound = the PENDING step budget) and settles ' +
      'recovering_dispatch_parked / local_lane_parked / ' +
      'skip_local_parked_lane (NOOP, lifecycle skipped, row PENDING)',
  }),
  Object.freeze({
    id: 'no-stale-fail-while-park-evidence-fresh',
    command: scenarioCommand('^no-stale-fail-while-park-evidence-fresh'),
    detail: 'no sweep produces fail_priority_recovery_drain_stale and no ' +
      'failOperation of the parked self-move happens on the target while ' +
      'its lane parks; the self-move reaches its own terminal and the ' +
      'joiners are READY inside the 60 s window',
  }),
  Object.freeze({
    id: 'self-move-claims-on-incumbent-terminal-without-successor',
    command: scenarioCommand(
      '^self-move-claims-on-incumbent-terminal-without-successor',
    ),
    detail: 'the self-move claims SENDING within 2 x DISPATCH_RETRY_DELAY_MS ' +
      'of the incumbent\'s terminal (t+35 s) through exactly one ENGAGED ' +
      'engagement of the target\'s hold; exactly one ledger self-move row ' +
      'ever exists (no re-plan, no successor)',
  }),
  Object.freeze({
    id: 'parked-self-move-without-park-evidence-still-stale-fails',
    command: scenarioCommand(
      '^parked-self-move-without-park-evidence-still-stale-fails',
    ),
    detail: 'a PENDING self-move whose lane never parked (no park evidence) ' +
      'is settled fail_priority_recovery_drain_stale / local_owner on the ' +
      'first sweep past PENDING_TIMEOUT_MS exactly as the run was; a lane ' +
      'silent since its first park is recovering while its evidence is ' +
      'younger than PENDING_TIMEOUT_MS and stale-fails on the first sweep ' +
      'after its last park is a full PENDING_TIMEOUT_MS old (t+44 s)',
  }),
  Object.freeze({
    id: 'remote-owner-drain-rule-unchanged',
    command: scenarioCommand('^remote-owner-drain-rule-unchanged'),
    detail: 'the seed\'s (non-owner) drain holds no park evidence for the ' +
      'target-owned self-move, classifies remote_rearm_required / ' +
      'wake_remote_owner, wakes the available owner, skips the lifecycle ' +
      'and never settles the row (the existing remote-owner rule)',
  }),
  Object.freeze({
    id: 'idle-only-exclusion-and-terminal-release-preserved',
    command: scenarioCommand(
      '^idle-only-exclusion-and-terminal-release-preserved',
    ),
    detail: 'the self-move parks operation_ledger_self_move_waiting_for_' +
      'idle_ledger while incumbents are in flight and is sent only after ' +
      'the incumbent completed with no dependent row non-terminal; every ' +
      'dependent re-planned between engagement and the terminal is refused ' +
      'operation_ledger_self_move_in_flight and none is admitted; the ' +
      'target\'s hold stays engaged from the claim through the terminal and ' +
      'the dependents\' second round is admitted only after it',
  }),
  Object.freeze({
    id: 'budgets-and-cadence-unchanged',
    command: scenarioCommand('^budgets-and-cadence-unchanged'),
    detail: 'maxConcurrentAdds (5), CRITICAL_CHECK_DELAY_MS (5000), ' +
      'DISPATCH_RETRY_DELAY_MS (250), PENDING_TIMEOUT_MS (30000), ' +
      'TIMEOUT_CHECK_INTERVAL_MS (1000) and the 60 s budget are the HEAD ' +
      'values; parks re-drive within 2 x DISPATCH_RETRY_DELAY_MS, the ' +
      'drain sweeps on TIMEOUT_CHECK_INTERVAL_MS and the self-move ' +
      'lifecycle latencies are the run\'s',
  }),
  Object.freeze({
    id: 'witness-deterministic',
    command: scenarioCommand('^witness-deterministic'),
    detail: 'two identical virtual-clock drives produce the identical ' +
      'park/sweep/dispatch event sequence and READY instant',
  }),
]);

const QUEST_ID = 'priority-recovery-drain-parked-self-move-progress';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME =
  'priority-recovery-drain-parked-self-move-progress.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
