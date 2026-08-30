// Deterministic evidence harness for the
// managed-split-resume-under-write-load quest: receipt declarations only.
// The shared runtime (scripts/quest-evidence-harness-runtime.js) re-runs
// each recorded proof command and writes the test-receipt probe artifact
// (solve/evidence/managed-split-resume-under-write-load.receipt.json).
// Each receipt re-executes one focused witness scenario rather than trusting
// a claim, so a regression that flips a witness red flips this receipt to
// fail and the quest's doneWhen cannot close on stale green evidence.
//
// Receipt honesty: the witness file uses raw node:test so each scenario is
// independently selectable with --test-name-pattern by its anchored name.
// On HEAD (before the cure) the deferred-routing-timeout-resumes-persisted-plan,
// persisted-plan-survives-admission-block and
// cutover-refused-while-child-leader-denied receipts are RED (the two traced
// mechanisms of the MovieLens five-node runs 2026-08-30T12:07:55Z and
// 12:23:20Z: the retry at 12:04:46.4 re-planned beside the persisted plan,
// and the cutover at 12:20:17.8 applied while the right child's leader was
// readiness-denied); healthy-split-sequence-unchanged,
// budgets-and-cadence-unchanged and witness-deterministic are green and must
// stay green — a cure that turns them red is rejected.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const WITNESS_TEST =
  'test/partition/managed-split-resume-under-write-load.test.js';
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
    id: 'deferred-routing-timeout-resumes-persisted-plan',
    command: scenarioCommand('^deferred-routing-timeout-resumes-persisted-plan'),
    detail: 'a split DEFERRED by the right child\'s routable-wait timeout ' +
      '(run 1 12:04:29.6) that is then admission-BLOCKED once (12:04:35.7) ' +
      'resumes the persisted split key and child ids on the next retry ' +
      '(12:04:46.4 re-planned on HEAD): buildManagedSplitPlan runs exactly ' +
      'once, exactly two v2 rows exist, and resolvePartitionForKey routes ' +
      'every probe key to exactly one v2 row',
  }),
  Object.freeze({
    id: 'persisted-plan-survives-admission-block',
    command: scenarioCommand('^persisted-plan-survives-admission-block'),
    detail: 'the blocked transition row written by the intermediate ' +
      'admission denial still carries SPLIT_KEY and TARGET_PARTITION_IDS ' +
      '(HEAD persisted the denial from the plan-less pending metadata and ' +
      'dropped them) while the retry accounting is unchanged',
  }),
  Object.freeze({
    id: 'cutover-refused-while-child-leader-denied',
    command: scenarioCommand('^cutover-refused-while-child-leader-denied'),
    detail: 'with the right child\'s canonical leader readiness-denied on ' +
      'the serve dimension (run 2 12:20:13-12:20:24, ' +
      'planning_snapshot_refresh_pending) the CATCHUP_READY ack is a typed ' +
      'refusal (child_leader_not_routable) after the unchanged 30 s ' +
      'provisioning budget, the workflow stays split_backfilling, no cutover ' +
      'row, descriptor delete or replica removal happens, and the cutover ' +
      'applies on the first 50 ms poll after the leader becomes routable',
  }),
  Object.freeze({
    id: 'healthy-split-sequence-unchanged',
    command: scenarioCommand('^healthy-split-sequence-unchanged'),
    detail: 'the normal split path (plan, child rows, provisioning, ' +
      'catch-up, cutover, dissolution, terminal clear) produces the HEAD ' +
      'event sequence byte-for-byte and promotes the active epoch to 2',
  }),
  Object.freeze({
    id: 'budgets-and-cadence-unchanged',
    command: scenarioCommand('^budgets-and-cadence-unchanged'),
    detail: 'retry backoff (5000/60000 ms), TABLE_CREATE_PROVISION_TIMEOUT_MS ' +
      '(30000), TABLE_CREATE_PROVISION_POLL_INTERVAL_MS (50) and ' +
      'SPLIT_OPERATION_BUDGET_MS (300000) are the HEAD values and the first ' +
      'deferral schedules the unchanged base backoff',
  }),
  Object.freeze({
    id: 'witness-deterministic',
    command: scenarioCommand('^witness-deterministic'),
    detail: 'two identical virtual-clock drives of the retry sequence and of ' +
      'the readiness-gated cutover produce the identical event sequence, ' +
      'partition rows and cutover instant',
  }),
]);

const QUEST_ID = 'managed-split-resume-under-write-load';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME =
  'managed-split-resume-under-write-load.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
