// Deterministic evidence harness for the
// learner-promotion-proof-channel-wake quest: receipt declarations only.
// The shared runtime (scripts/quest-evidence-harness-runtime.js) re-runs
// each recorded proof command and writes the test-receipt probe artifact
// (solve/evidence/learner-promotion-proof-channel-wake.receipt.json).
// Each receipt re-executes one focused witness scenario rather than trusting
// a claim, so a regression that flips a witness red flips this receipt to
// fail and the quest's doneWhen cannot close on stale green evidence.
//
// Receipt honesty: the witness file uses raw node:test so each scenario is
// independently selectable with --test-name-pattern by its anchored name.
// On HEAD (dce28c986, before the cure) the
// proof-wakes-on-services-row-visibility,
// proof-wakes-on-published-epoch-change,
// typed-refusal-cause-address-unresolvable,
// learner-reasserts-row-on-unresolvable,
// proof-delivery-timeout-bounded-and-logged and
// cpp-learner-active-within-bound receipts are RED (the learner became a
// voter at +26 s of scenario time, the 4bc6c1d25 GCP figure, after six
// untyped request_invalid refusals on the 1 s timer) and
// witness-deterministic is RED only because the drive lands outside the
// bound; proof-semantics-and-voter-cap-unchanged is green on HEAD and must
// stay green — a cure that turns it red is rejected.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const WITNESS_TEST =
  'test/convergence/dt6-learner-promotion-proof-channel-wake.test.js';
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
    id: 'proof-wakes-on-services-row-visibility',
    command: scenarioCommand('^proof-wakes-on-services-row-visibility'),
    detail: 'with its services row withheld from the leader cache, the ' +
      'learner\'s first proof is refused request_invalid and the next ' +
      'proof request follows the row\'s landing in its own cache within ' +
      'half a retry interval (typed services_row_visible wake on the ' +
      'existing single-flight schedule), not on the 1 s timer + RTT',
  }),
  Object.freeze({
    id: 'proof-wakes-on-published-epoch-change',
    command: scenarioCommand('^proof-wakes-on-published-epoch-change'),
    detail: 'a change of the latest PUBLISHED publication epoch re-requests ' +
      'the proof within half a retry interval, the re-request binds the ' +
      'new epoch (typed published_epoch_changed wake), and the grant after ' +
      'healing is bound to that epoch',
  }),
  Object.freeze({
    id: 'typed-refusal-cause-address-unresolvable',
    command: scenarioCommand('^typed-refusal-cause-address-unresolvable'),
    detail: 'the leader\'s request_invalid carries cause ' +
      'learner_address_unresolvable when buildPeerAddress throws and ' +
      'request_shape for a malformed request, the learner mints ' +
      'response_binding_mismatch for a response bound to another learner, ' +
      'and all three are logged at info with learnerReplicaId/partitionId',
  }),
  Object.freeze({
    id: 'learner-reasserts-row-on-unresolvable',
    command: scenarioCommand('^learner-reasserts-row-on-unresolvable'),
    detail: 'on learner_address_unresolvable the learner kicks the replica ' +
      'state machine\'s CL-021 deferred services-row retry ' +
      '(reconcileLocalOnlyServiceRowsNow) immediately after the refusal, at ' +
      'most once per refusal, and the re-asserted row wakes the next proof',
  }),
  Object.freeze({
    id: 'proof-delivery-timeout-bounded-and-logged',
    command: scenarioCommand('^proof-delivery-timeout-bounded-and-logged'),
    detail: 'every proof delivery carries timeoutMs = min(MESSAGE_TIMEOUT_MS, ' +
      '2 x LEARNER_CATCH_UP_CHECK_INTERVAL_MS), a stalled delivery fails at ' +
      'that bound, proof_transport_failed is logged at info, and the next ' +
      'request never stacks beyond bound + interval',
  }),
  Object.freeze({
    id: 'proof-semantics-and-voter-cap-unchanged',
    command: scenarioCommand('^proof-semantics-and-voter-cap-unchanged'),
    detail: 'learnerMatchIndex < safePromotionIndex refuses progress_behind, ' +
      'a publication-epoch mismatch refuses epoch_mismatch, a lagging ' +
      'learner is never promoted by elapsed retry ticks, above target+1 ' +
      'active voters the quorum-shape gate refuses ' +
      'would_exceed_target_replica_count even when the proof would grant, ' +
      'and LEARNER_CATCH_UP_CHECK_INTERVAL_MS (1000) / MESSAGE_TIMEOUT_MS ' +
      '(5000) are the HEAD values (green on HEAD and after)',
  }),
  Object.freeze({
    id: 'cpp-learner-active-within-bound',
    command: scenarioCommand('^cpp-learner-active-within-bound'),
    detail: 'with the learner\'s services row withheld from the leader cache ' +
      'for 22 s and the leader stalling 5 s in every 7 s, the learner is a ' +
      'voter by +12 s of scenario time (HEAD: +26 s) after a typed ' +
      'learner_address_unresolvable refusal, a services-row re-assert and a ' +
      'wake under half an interval, on a proof with learnerMatchIndex === ' +
      'safePromotionIndex and equal published epochs on both sides',
  }),
  Object.freeze({
    id: 'witness-deterministic',
    command: scenarioCommand('^witness-deterministic'),
    detail: 'two identical cpp drives produce the identical refusal/wake ' +
      'event sequence and both land inside the bound',
  }),
]);

const QUEST_ID = 'learner-promotion-proof-channel-wake';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME =
  'learner-promotion-proof-channel-wake.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
