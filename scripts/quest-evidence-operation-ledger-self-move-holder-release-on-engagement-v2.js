// Deterministic evidence harness for the
// operation-ledger-self-move-holder-release-on-engagement quest: receipt
// declarations only. The shared runtime
// (scripts/quest-evidence-harness-runtime.js) re-runs each recorded proof
// command and writes the test-receipt probe artifact
// (solve/evidence/operation-ledger-self-move-holder-release-on-engagement.receipt.json).
// Each receipt re-executes one focused witness scenario rather than trusting
// a claim, so a regression that flips a witness red flips this receipt to
// fail and the quest's doneWhen cannot close on stale green evidence.
//
// Receipt honesty: the witness file uses raw node:test so each scenario is
// independently selectable with --test-name-pattern by its anchored name.
// On HEAD (7085090e2, before the cure) the
// engagement-resolves-stale-holder-through-lifecycle-read,
// local-terminal-settlement-clears-own-registration and
// successor-claims-first-attempt-after-predecessor-terminal receipts are RED
// (GCP run 2026-08-30T04-49-12: the successor parked held_by_other 41 times
// behind the drain-failed holder until teardown);
// live-holder-still-refuses-and-unresolved-reads-hold,
// terminal-only-release-preserved, idle-only-and-exclusion-preserved,
// budgets-and-cadence-unchanged and witness-deterministic are green and must
// stay green — a cure that turns them red is rejected.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const WITNESS_TEST =
  'test/convergence/dt6-operation-ledger-self-move-holder-release.test.js';
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
    id: 'engagement-resolves-stale-holder-through-lifecycle-read',
    command: scenarioCommand(
      '^engagement-resolves-stale-holder-through-lifecycle-read',
    ),
    detail: 'on the dispatching node the successor\'s first engagement finds ' +
      'the drain-failed predecessor retained as the holder, resolves it ' +
      'through exactly one lifecycle read (the holder\'s own positive ' +
      'terminal row -> RELEASE), engages, and no further lifecycle read is ' +
      'issued',
  }),
  Object.freeze({
    id: 'local-terminal-settlement-clears-own-registration',
    command: scenarioCommand(
      '^local-terminal-settlement-clears-own-registration',
    ),
    detail: 'after the predecessor\'s claim compare-and-set was refused under ' +
      'pressure (holder retained, row PENDING), the target\'s own drain-stale ' +
      'failOperation of that holder clears its registration at the commit; ' +
      'the successor engages on its first attempt without a lifecycle read ' +
      'and is sent at its creation instant',
  }),
  Object.freeze({
    id: 'successor-claims-first-attempt-after-predecessor-terminal',
    command: scenarioCommand(
      '^successor-claims-first-attempt-after-predecessor-terminal',
    ),
    detail: 'the re-planned REPLACE (a distinct successor id) never parks ' +
      'held_by_other, engages exactly once, claims SENDING at its creation ' +
      'instant (+36 s) and the ledger spread is satisfied inside the 60 s ' +
      'window (READY at +59.6 s)',
  }),
  Object.freeze({
    id: 'live-holder-still-refuses-and-unresolved-reads-hold',
    command: scenarioCommand(
      '^live-holder-still-refuses-and-unresolved-reads-hold',
    ),
    detail: 'a live PENDING holder and a live SENDING holder still refuse a ' +
      'candidate self-move at the engagement point (HELD_BY_OTHER, holder ' +
      'retained); an empty read and a failed read of the holder hold',
  }),
  Object.freeze({
    id: 'terminal-only-release-preserved',
    command: scenarioCommand('^terminal-only-release-preserved'),
    detail: 'the holder\'s age past PENDING_TIMEOUT_MS, the target\'s ' +
      'orphan-reservation reconcile, a positive terminal row of another ' +
      'operation and the exempt ADD\'s terminal on the seed never release ' +
      'the holder',
  }),
  Object.freeze({
    id: 'idle-only-and-exclusion-preserved',
    command: scenarioCommand('^idle-only-and-exclusion-preserved'),
    detail: 'the predecessor parks operation_ledger_self_move_waiting_for_' +
      'idle_ledger while incumbents are in flight; from the successor\'s ' +
      'registration to its terminal every dependent is refused ' +
      'operation_ledger_self_move_in_flight and none is admitted',
  }),
  Object.freeze({
    id: 'budgets-and-cadence-unchanged',
    command: scenarioCommand('^budgets-and-cadence-unchanged'),
    detail: 'maxConcurrentAdds (5), CRITICAL_CHECK_DELAY_MS (5000), ' +
      'DISPATCH_RETRY_DELAY_MS (250), PENDING_TIMEOUT_MS (30000) and the ' +
      'incomplete-read backoff floor/ceiling (250/5000) are the HEAD values, ' +
      'the drain settles the predecessor stale only past PENDING_TIMEOUT_MS, ' +
      'parked re-drives follow within 2 x DISPATCH_RETRY_DELAY_MS and every ' +
      'dependent re-attempt within one priority retry cadence',
  }),
  Object.freeze({
    id: 'witness-deterministic',
    command: scenarioCommand('^witness-deterministic'),
    detail: 'two identical virtual-clock drives produce the identical ' +
      'admission/dispatch event sequence and READY instant',
  }),
]);

const QUEST_ID = 'operation-ledger-self-move-holder-release-on-engagement-v2';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME =
  'operation-ledger-self-move-holder-release-on-engagement-v2.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
