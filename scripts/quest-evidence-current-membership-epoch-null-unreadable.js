// Deterministic evidence harness for the current-membership-epoch-null-
// unreadable quest: receipt declarations only. The shared runtime
// (scripts/quest-evidence-harness-runtime.js) re-runs each recorded proof
// command and writes the probe artifact.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const TEST_FILE =
  'test/control-plane/current-membership-epoch-null-unreadable.test.js';
const PLANNING_TEST_FILE =
  'test/control-plane/control-plane-readiness-service-sync-and-priority-recovery.test.js';
const FENCE_TEST_FILE = 'test/rebalancer/assignment-epoch-fencing.test.js';

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'C1-establishing-publication-unreadable',
    testFile: TEST_FILE,
    detail: 'the real ControlPlaneReadinessService reports the current ' +
      'published membership epoch as unreadable (null), never 0, while the ' +
      'latest publication is ESTABLISHING (planning answer ' +
      'publishedPlanningEpoch null); red-on-revert: Number(null) in ' +
      'getCurrentPublishedMembershipEpochSync',
  }),
  Object.freeze({
    id: 'C2-published-epoch-preserved',
    testFile: TEST_FILE,
    detail: 'a PUBLISHED epoch 0, 1, or 3 reads as exactly that epoch; the ' +
      'reader decode table pins null/undefined -> unreadable, non-negative ' +
      'integer -> epoch, every other representation -> unreadable',
  }),
  Object.freeze({
    id: 'C3-absent-publication-unreadable',
    testFile: TEST_FILE,
    detail: 'no publication row reads as unreadable',
  }),
  Object.freeze({
    id: 'C4-planner-reads-unreadable-not-zero',
    testFile: TEST_FILE,
    detail: 'the real UnifiedRebalancer planning read over the real readiness ' +
      'owner yields null while establishing (so moves stay unstamped) and ' +
      'the published epoch once PUBLISHED',
  }),
  Object.freeze({
    id: 'C5-creation-fence-defers-not-stale',
    testFile: TEST_FILE,
    detail: 'the real RebalanceCoordinator creation fence, reading the real ' +
      'readiness owner while establishing, defers an epoch-bound move as ' +
      'MEMBERSHIP_EPOCH_UNAVAILABLE and persists nothing, instead of ' +
      'rejecting it as a stale plan against a fabricated epoch 0',
  }),
  Object.freeze({
    id: 'C6-dispatch-fence-defers-not-stale',
    testFile: TEST_FILE,
    detail: 'the real dispatch epoch gate, reading the real readiness owner ' +
      'while establishing, defers an epoch-bound ADD as ' +
      'DEFERRED_RETRY_PENDING with no delivery and no stale failure',
  }),
  Object.freeze({
    id: 'C7-single-reader-inventory',
    testFile: TEST_FILE,
    detail: 'every src file touching the current-epoch surface is classified; ' +
      'the two decoding readers import the single reader module and no src ' +
      'file reinterprets the surface with Number/parseInt/Math',
  }),
  Object.freeze({
    id: 'readiness-planning-suite-green',
    testFile: PLANNING_TEST_FILE,
    detail: 'the registered readiness planning witness suite stays green',
  }),
  Object.freeze({
    id: 'epoch-fence-suite-green',
    testFile: FENCE_TEST_FILE,
    detail: 'the pre-existing assignment-epoch-fencing suite stays green',
  }),
]);

const QUEST_ID = 'current-membership-epoch-null-unreadable';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME = 'current-membership-epoch-null-unreadable.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
