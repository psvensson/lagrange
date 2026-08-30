// Deterministic evidence harness for the
// learner-promotion-proof-channel-witness-determinism quest: receipt
// declarations only. The shared runtime
// (scripts/quest-evidence-harness-runtime.js) re-runs each recorded proof
// command and writes the test-receipt probe artifact
// (solve/evidence/learner-promotion-proof-channel-witness-determinism.receipt.json).
//
// Defect: the sealed witness-deterministic receipt of quest
// learner-promotion-proof-channel-wake (two identical cpp drives, identical
// refusal/wake sequence) depended on host load. The fixture applied the
// learner's services-row landing to the leader cache and to the learner's
// own cache in the same tick, so the learner's services_row_visible wake
// proof request raced the leader's first append+ack to the freshly joined
// learner peer on the host event loop (liferaft's wall-clock heartbeat):
// progress_behind then a cadence grant when the request won, a direct grant
// when it lost — under the 4-job fast lane one drive of two lost, and the
// receipt flipped red. Cure (test/fixture only, no src change): the row
// landing is an explicit fixture schedule — the leader cache gains the row,
// the fixture waits for the leader to PROVE the learner's replication on
// its own match-index observable (the proof's input), and only then does
// the learner's cache see the row and wake.
//
// Receipt honesty: the witness file uses raw node:test so each scenario is
// independently selectable with --test-name-pattern by its anchored name.
// On HEAD (403a92853, before the cure) witness-landing-quantized is RED
// deterministically: the scenario does not exist there (the receipt's
// pass-count grep refuses a zero-test run) and, once present against the
// HEAD fixture, its exact sequence is unattainable (every local HEAD drive
// carries a progress_behind refusal and the landing fields are absent).
// witness-deterministic and witness-load-robust are the load-dependent
// receipts: green on an idle HEAD, red on HEAD under the fast lane (the
// recorded failure), green after the cure on any load.
// existing-receipts-unchanged re-runs the sealed
// learner-promotion-proof-channel-wake harness to a scratch receipt path
// and is green on HEAD and after — a cure that turns it red is rejected.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const WITNESS_TEST =
  'test/convergence/dt6-learner-promotion-proof-channel-wake.test.js';
const PROOF_CHANNEL_HARNESS =
  'scripts/quest-evidence-learner-promotion-proof-channel-wake.js';
const PROOF_CHANNEL_SCRATCH_RECEIPT =
  '.tmp/learner-promotion-proof-channel-wake.receipt.json';
const NODE_TEST_COMMAND_PREFIX = 'node --test ';
const TEST_NAME_PATTERN_FLAG_PREFIX = '--test-name-pattern="';
const DOUBLE_QUOTE = '"';
const SPACE = ' ';
const SCENARIO_ANCHOR = '^';
const TAP_OK_LINE_PREFIX = '^ok [0-9]* - ';
// A zero-test run (the scenario absent, as on HEAD) exits 0 and reports the
// FILE as its one passing test: the receipt insists on the scenario's own
// TAP `ok` line, which only a present, passing scenario emits.
function singleScenarioGuardSuffix(scenarioPattern) {
  const scenarioName = scenarioPattern.startsWith(SCENARIO_ANCHOR) ?
    scenarioPattern.slice(SCENARIO_ANCHOR.length) :
    scenarioPattern;
  return ` 2>&1 | tee /dev/stderr | grep -q "${TAP_OK_LINE_PREFIX}${scenarioName}"`;
}
// The concurrent run: this many copies of the whole witness file at once,
// every copy must exit 0 (the fast lane runs 4 files side by side).
const LOAD_COPIES = 5;
const LOAD_COPY_SEQUENCE = Array.from(
  {length: LOAD_COPIES}, (_unused, index) => index + 1,
).join(SPACE);

// One verbatim proof command per scenario. node --test --test-name-pattern
// selects exactly one top-level witness scenario by its anchored name, so a
// green receipt is honest (its scenario exits 0) and a red receipt is honest
// (its scenario exits non-zero).
function scenarioCommand(scenarioPattern) {
  return NODE_TEST_COMMAND_PREFIX +
    TEST_NAME_PATTERN_FLAG_PREFIX + scenarioPattern + DOUBLE_QUOTE +
    SPACE + WITNESS_TEST;
}

// POSIX sh: launch every copy, then wait on each pid so any non-zero copy
// fails the receipt (a bare `wait` would mask child exit codes).
const SH_PID_LIST_INIT = 'pids=""; ';
const SH_WAIT_EACH_PID =
  'rc=0; for pid in $pids; do wait "$pid" || rc=1; done; exit $rc';

function concurrentWitnessCommand() {
  return SH_PID_LIST_INIT +
    `for copy in ${LOAD_COPY_SEQUENCE}; do ` +
    `${NODE_TEST_COMMAND_PREFIX}${WITNESS_TEST} & pids="$pids $!"; done; ` +
    SH_WAIT_EACH_PID;
}

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'witness-landing-quantized',
    command: scenarioCommand('^witness-landing-quantized') +
      singleScenarioGuardSuffix('^witness-landing-quantized'),
    detail: 'on the cpp drive the leader has proven the learner\'s ' +
      'replication (leader-observed match index 3 = the committed prefix) ' +
      'before the learner-visible landing, no proof request is sent inside ' +
      'the landing phase, and the drive is exactly: deferrals ' +
      '[[request_invalid, learner_address_unresolvable]], proof round ' +
      'trips [request_invalid, progress_proven], wakes ' +
      '[services_row_visible], 1 CL-021 kick, the granted request within ' +
      'half an interval of the landing with learnerMatchIndex === ' +
      'safePromotionIndex (red on HEAD: the sequence carried a ' +
      'progress_behind cycle and the schedule did not exist)',
  }),
  Object.freeze({
    id: 'witness-deterministic',
    command: scenarioCommand('^witness-deterministic'),
    detail: 'the sealed receipt: two identical cpp drives produce the ' +
      'identical refusal/wake event sequence and both land inside the ' +
      'bound — now on the explicit landing schedule, independent of host ' +
      'load',
  }),
  Object.freeze({
    id: 'existing-receipts-unchanged',
    command: `node ${PROOF_CHANNEL_HARNESS} --output ` +
      PROOF_CHANNEL_SCRATCH_RECEIPT,
    detail: 'every sealed learner-promotion-proof-channel-wake receipt ' +
      '(proof-wakes-on-services-row-visibility, ' +
      'proof-wakes-on-published-epoch-change, ' +
      'typed-refusal-cause-address-unresolvable, ' +
      'learner-reasserts-row-on-unresolvable, ' +
      'proof-delivery-timeout-bounded-and-logged, ' +
      'proof-semantics-and-voter-cap-unchanged, ' +
      'cpp-learner-active-within-bound, witness-deterministic) still ' +
      'passes on the landing schedule; the receipt is written to a ' +
      'gitignored scratch path so the sealed evidence file is untouched',
  }),
  Object.freeze({
    id: 'witness-load-robust',
    command: concurrentWitnessCommand(),
    detail: `${LOAD_COPIES} copies of the whole witness file run ` +
      'concurrently (each copy a live leader+learner pair with liferaft ' +
      'wall-clock timers) and every copy exits 0: the landing schedule, ' +
      'not host scheduling, orders the wake proof request after the ' +
      'learner\'s replication',
  }),
]);

const QUEST_ID = 'learner-promotion-proof-channel-witness-determinism';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME =
  'learner-promotion-proof-channel-witness-determinism.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
