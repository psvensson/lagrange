// Deterministic evidence harness for the joiner-waiting-liveness-log quest:
// receipt declarations only. The shared runtime
// (scripts/quest-evidence-harness-runtime.js) re-runs each recorded proof
// command and writes the test-receipt probe artifact
// (solve/evidence/joiner-waiting-liveness-log.receipt.json). Each receipt
// re-executes one focused witness scenario rather than trusting a claim, so a
// regression that flips a witness red flips this receipt to fail and the
// quest's doneWhen cannot close on stale green evidence.
//
// Receipt honesty: the witness file uses raw node:test so each scenario is
// independently selectable with --test-name-pattern by its anchored name.
// On HEAD (before the cure) the still-waiting-line-on-liveness-cadence and
// evidence-advance-debug-rate-limited receipts are RED (a joiner legitimately
// waiting on the formation barrier printed nothing for the whole 30-second
// honest wait of the five-node GCP formation runs); no-line-once-gate-satisfied,
// no-evidence-advance-without-change, ready-instant-unchanged,
// budgets-and-cadence-unchanged and witness-deterministic are green controls
// and must stay green — a cure that turns them red is rejected.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const WITNESS_TEST =
  'test/bootstrap/node-joining-formation-barrier-waiting-liveness-log.test.js';
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
    id: 'still-waiting-line-on-liveness-cadence',
    command: scenarioCommand('^still-waiting-line-on-liveness-cadence'),
    detail: 'during a 30-second honest wait on the engaged operation-ledger ' +
      'formation barrier the REAL joining owner emits one typed still-waiting ' +
      'line per existing liveness-refresh tick (six lines at elapsed 0, 5000, ' +
      '..., 25000 ms, on the exact instants of the liveness publications), ' +
      'each naming the owner\'s own unsatisfied gate ' +
      '(waiting_for_startup_authority), the startup-authority state and ' +
      'recovery reason codes it already snapshots, the elapsed ms since the ' +
      'wait began, and the remaining unchanged timeout budget',
  }),
  Object.freeze({
    id: 'no-line-once-gate-satisfied',
    command: scenarioCommand('^no-line-once-gate-satisfied'),
    detail: 'no still-waiting line is emitted at or after the READY instant, ' +
      'and a barrier whose gate is already satisfied on its first poll emits ' +
      'no still-waiting line at all',
  }),
  Object.freeze({
    id: 'evidence-advance-debug-rate-limited',
    command: scenarioCommand('^evidence-advance-debug-rate-limited'),
    detail: 'when the gate\'s evidence (the formation-release handoff pending ' +
      'cohort) changes on every 500 ms poll while the gate stays unsatisfied, ' +
      'the owner emits debug evidence-advance lines rate-limited to at most ' +
      'one per liveness-refresh window (five lines in 30 s, never two closer ' +
      'than 5000 ms), each carrying evidence different from the last logged ' +
      'line',
  }),
  Object.freeze({
    id: 'no-evidence-advance-without-change',
    command: scenarioCommand('^no-evidence-advance-without-change'),
    detail: 'with static evidence for the whole wait no evidence-advance ' +
      'line is emitted (the debug line is not a second poll heartbeat)',
  }),
  Object.freeze({
    id: 'ready-instant-unchanged',
    command: scenarioCommand('^ready-instant-unchanged'),
    detail: 'the barrier releases on the exact poll at which the readiness ' +
      'owner\'s startup authority becomes ready (startedAt + 30000 ms) with ' +
      'the recording logger and with a silent logger alike, the state-change ' +
      'lines are exactly waiting_for_startup_authority then ' +
      'ledger_spread_satisfied, and no readiness decision reads anything but ' +
      'the owner\'s own snapshot',
  }),
  Object.freeze({
    id: 'budgets-and-cadence-unchanged',
    command: scenarioCommand('^budgets-and-cadence-unchanged'),
    detail: 'JOINING_DEFAULT discovery (5000), poll (500), timeout (120000) ' +
      'and heartbeat (5000) ms are the HEAD values, and the liveness ' +
      'publications land on the exact HEAD instants (six at startedAt + ' +
      'k * 5000) whether the evidence is static or advancing',
  }),
  Object.freeze({
    id: 'witness-deterministic',
    command: scenarioCommand('^witness-deterministic'),
    detail: 'two identical virtual-clock drives produce the identical log ' +
      'line sequence, liveness instants and READY instant',
  }),
]);

const QUEST_ID = 'joiner-waiting-liveness-log';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME = 'joiner-waiting-liveness-log.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
