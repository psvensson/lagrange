// Deterministic evidence harness for the readiness-planning-deferral-bounded
// quest: receipt declarations only. The shared runtime
// (scripts/quest-evidence-harness-runtime.js) re-runs each recorded proof
// command and writes the test-receipt probe artifact
// (solve/evidence/readiness-planning-deferral-bounded.receipt.json). Each
// receipt re-executes one focused witness scenario rather than trusting a
// claim, so a regression that flips a witness red flips this receipt to fail.
//
// Receipt honesty: the witness file uses raw node:test, so each scenario is
// independently selectable with --test-name-pattern by its anchored name.
//
// Red-on-HEAD count, MEASURED on be124c1e3 by stashing only the owner change
// and re-running the whole witness file: 4 of the 9 scenarios are red at base
// and 5 are green.
//
// RED on HEAD (the cure receipts):
//   user-table-partition-routable-under-token-churn — 23 of 23 routing
//     samples deny every candidate of a live user-table partition, each with
//     the single reason planning_snapshot_refresh_pending, exactly the
//     measured GCP shape.
//   write-path-terminal-verdict-cleared — the write lane's terminal verdict
//     past its deadline is PARTITION_SERVICE_NOT_FOUND.
//   serve-admission-never-rests-on-token-status — no completed snapshot is
//     ever served at base, so the drive cannot exhibit a stale serve.
//   stale-serve-divergence-audit — same reason: the audit observes zero
//     served completed snapshots at base.
// These fail on the MEASURED denial, not on a missing method: every symbol
// the witness touches exists on HEAD, so the base-red result is evidence of
// the mechanism rather than of an absent API.
//
// GREEN on HEAD and after (controls and preconditions):
//   witness-deterministic, token-rotation-live-lock-precondition,
//   live-veto-move-still-denies,
//   production-composition-control-denial-vocabulary,
//   unchanged-control-rig-build-rate.
// unchanged-control-rig-build-rate is the rate control: it pins the shared
// production-composition formation rig at the sealed pre-change measurement
// carried by readiness-planning-canonical-identity-verified-owner (1218 heavy
// planning builds and 824 publications winner reads over a 1000-call
// formation-shaped churn on a virtual clock), so a cure that moves the
// measured build rate is rejected.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const WITNESS_TEST =
  'test/control-plane/readiness-planning-deferral-bounded.test.js';
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
    id: 'witness-deterministic',
    command: scenarioCommand('^witness-deterministic'),
    detail: 'two identical drives of the token-churn sequence produce ' +
      'identical routing samples, identical owner build counts, identical ' +
      'completed token statuses and identical serve-admission counts',
  }),
  Object.freeze({
    id: 'token-rotation-live-lock-precondition',
    command: scenarioCommand('^token-rotation-live-lock-precondition'),
    detail: 'PRECONDITION (green both sides): under a transport fingerprint ' +
      'that rotates on every captureToken() every completed build is ' +
      'stamped TOKEN_STATUS.STALE, so no build ever lands current — the ' +
      'exact state publishCompleted answered with the all-false deferred ' +
      'contract',
  }),
  Object.freeze({
    id: 'user-table-partition-routable-under-token-churn',
    command: scenarioCommand(
      '^user-table-partition-routable-under-token-churn',
    ),
    detail: 'RED on HEAD (23 of 23 samples starved): across the sampling ' +
      'shape of the failing run a live user-table partition keeps three ' +
      'active addressed service rows and its canonical leader row, and no ' +
      'sample denies every candidate nor answers an unbounded ' +
      'planning_snapshot_refresh_pending denial',
  }),
  Object.freeze({
    id: 'write-path-terminal-verdict-cleared',
    command: scenarioCommand('^write-path-terminal-verdict-cleared'),
    detail: 'RED on HEAD: the real QueryExecutor write-delivery loop ' +
      '(no attempt ceiling, absolute deadline only) does not return ' +
      'PARTITION_SERVICE_NOT_FOUND past its deadline for the user-table ' +
      'partition the GCP run failed on',
  }),
  Object.freeze({
    id: 'serve-admission-never-rests-on-token-status',
    command: scenarioCommand('^serve-admission-never-rests-on-token-status'),
    detail: 'THE SAFETY ORACLE, red on HEAD because no completed snapshot ' +
      'is ever served there: the drive does serve snapshots from builds ' +
      'stamped STALE, and every single admission is independently ' +
      'reconfirmed to hold BOTH sealed bounds — the positive-decision live ' +
      'veto is unmoved AND either the token is equal or the floored ' +
      'planning generation matches. Token status is never load-bearing',
  }),
  Object.freeze({
    id: 'stale-serve-divergence-audit',
    command: scenarioCommand('^stale-serve-divergence-audit'),
    detail: 'RED on HEAD (zero served snapshots to audit): every snapshot ' +
      'served from a STALE-stamped completed build is compared against a ' +
      'forced rebuild of the same owner at serve time, over the whole ' +
      'drive, with zero divergence on the decision-bearing fields ' +
      '(dimensions and reason codes)',
  }),
  Object.freeze({
    id: 'live-veto-move-still-denies',
    command: scenarioCommand('^live-veto-move-still-denies'),
    detail: 'THE SAFETY NEGATIVE (green both sides, must stay green): a ' +
      'moved positive-decision live veto (expired ready lease and ' +
      'heartbeat) refuses every completed build, and evidence that ' +
      'genuinely says not-ready is never reported routable — the cure ' +
      'admits staleness, never a false positive',
  }),
  Object.freeze({
    id: 'production-composition-control-denial-vocabulary',
    command: scenarioCommand(
      '^production-composition-control-denial-vocabulary',
    ),
    detail: 'CONTROL (green on HEAD, must stay green): the full ' +
      'ControlPlaneReadinessService and MembershipPublicationCoordinator ' +
      'on the production-composition cache, sampled 23 times under source ' +
      'churn, never name planning_snapshot_refresh_pending as a routing ' +
      'denial for a live user partition',
  }),
  Object.freeze({
    id: 'unchanged-control-rig-build-rate',
    command: scenarioCommand('^unchanged-control-rig-build-rate'),
    detail: 'THE RATE CONTROL (green on HEAD, must stay green): the shared ' +
      'production-composition formation rig measures 1218 heavy planning ' +
      'builds and 824 publications winner reads over its 1000-call ' +
      'formation-shaped churn — the sealed pre-change values. The cure ' +
      'changes only the serve admission of an already-completed build, so ' +
      'neither count may move',
  }),
]);

const QUEST_ID = 'readiness-planning-deferral-bounded';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME =
  'readiness-planning-deferral-bounded.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
