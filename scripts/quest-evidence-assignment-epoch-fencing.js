// Deterministic evidence harness for the assignment-epoch-fencing quest:
// receipt declarations only. The shared runtime
// (scripts/quest-evidence-harness-runtime.js) re-runs each recorded proof
// command and writes the probe artifact.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const TEST_FILE = 'test/rebalancer/assignment-epoch-fencing.test.js';

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'unreadable-epoch-defers',
    testFile: TEST_FILE,
    detail: 'an epoch-bound move whose current published membership epoch ' +
      'is unreadable at creation is deferred — the typed ' +
      'MEMBERSHIP_EPOCH_UNAVAILABLE skip routes into the rebalance loop\'s ' +
      'existing skip-and-retry-next-cycle path (buildSkippedMoveResult) ' +
      'instead of silently passing into persistence, and no operation row ' +
      'is persisted (audit finding 7; red-on-revert: letting an unreadable ' +
      'current epoch pass in assertMembershipPublicationEpoch flips the ' +
      'first arm red)',
  }),
  Object.freeze({
    id: 'executor-rejects-stale-epoch',
    testFile: TEST_FILE,
    detail: 'the operation planning epoch is carried in the executor ' +
      'request (request.membershipPublicationEpoch), and the dispatch-time ' +
      'epoch gate rejects staleness for ADD/REPLACE execution: a readable ' +
      'current epoch that advanced past the planning epoch fails the ' +
      'operation closed before any dispatch; an unreadable current epoch ' +
      'defers the dispatch as DEFERRED_RETRY_PENDING instead of ' +
      'dispatching unfenced (audit finding 7; red-on-revert: removing the ' +
      'epoch gate from advanceDispatchCandidateStep flips the stale, ' +
      'unreadable, and legacy arms red)',
  }),
  Object.freeze({
    id: 'step-history-epoch-live-or-deleted',
    testFile: TEST_FILE,
    detail: 'the dead step-history epoch write is DELETED — the planning ' +
      'epoch now lives on the operation record top-level (its sole live ' +
      'write), no stepsHistory entry duplicates it, and the dispatch epoch ' +
      'gate is its genuine reader (falling back to a legacy stepsHistory ' +
      'copy for rows persisted before the top-level write)',
  }),
  Object.freeze({
    id: 'epoch-suites-green',
    testFile: 'test/rebalancer/rebalance-coordinator-operation-ownership.test.js',
    detail: 'the pre-existing epoch-fence suite passes with the fail-closed ' +
      'unreadable-epoch deferral and the operation-record epoch write ' +
      'engaged (stale-epoch rejection and epoch persistence arms intact)',
  }),
]);

const QUEST_ID = 'assignment-epoch-fencing';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME = 'assignment-epoch-fencing.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
