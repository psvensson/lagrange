// Deterministic evidence harness for the replica-operation-terminal-cas
// quest (verified-audit finding 6): receipt declarations only. The shared
// runtime (scripts/quest-evidence-harness-runtime.js) re-runs each recorded
// proof command and writes the probe artifact.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'terminal-write-cas-guarded',
    testFile: 'test/rebalancer/replica-operation-terminal-cas.test.js',
    detail: 'terminal replica-operation UPDATEs carry the completed_at IS ' +
      'NULL guard in BOTH the gateway whereClause (null-sentinel rendered as ' +
      '`completed_at IS NULL` by the SQL plan renderer) and the raw-SQL ' +
      'fallback (UPDATE_OPERATION_TERMINAL in the repository SQL block and ' +
      'the rebalance-coordinator-shared.js drift copy) — while keeping the ' +
      'deliberate no-expected-step design (lagging non-terminal steps are ' +
      'still overwritten; red-on-revert: removing the where-builder ' +
      'null-sentinel fails the guard suite)',
  }),
  Object.freeze({
    id: 'loser-adopts-winner',
    testFile: 'test/rebalancer/replica-operation-terminal-cas.test.js',
    detail: 'a terminal write that loses the completed_at-IS-NULL CAS (zero ' +
      'rows changed) reads the winning terminal row and ADOPTS its ' +
      'status/workflowStep/completedAt/errorMessage through the typed ' +
      'REPLICA_OPERATION_UPDATE_DISPOSITION.TERMINAL_ADOPTED result instead ' +
      'of re-asserting its own terminal projection (red-on-revert: removing ' +
      'the adopt arm in resolveZeroChangeOperationUpdate fails the adoption ' +
      'tests)',
  }),
  Object.freeze({
    id: 'dueling-terminal-converges',
    testFile: 'test/rebalancer/replica-operation-terminal-cas.test.js',
    detail: 'two owner terminal projections at one operation id converge ' +
      'deterministically: exactly one terminal write wins the CAS, the loser ' +
      'adopts the winner, and the loser terminal-transition repair adopts ' +
      'the winner + stands down (repair state and timer maps both empty) ' +
      'instead of oscillating (red-on-revert: last-writer-wins or a re-armed ' +
      'repair leaves state armed against the winner)',
  }),
  Object.freeze({
    id: 'terminal-cas-suites-green',
    testFile: 'test/rebalancer/replica-operation-confirmation-authority-read.test.js',
    detail: 'the pre-existing terminal-confirmation / repair-discrimination ' +
      'suite passes with the CAS engaged (authority-escalated confirmation, ' +
      'local terminal-conflict evidence, and the leader-pinned escalated ' +
      'read all preserved)',
  }),
]);

const QUEST_ID = 'replica-operation-terminal-cas';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME = 'replica-operation-terminal-cas.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
