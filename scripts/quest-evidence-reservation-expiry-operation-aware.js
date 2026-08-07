// Deterministic evidence harness for the
// reservation-expiry-operation-aware quest: receipt declarations only.
// The shared runtime (scripts/quest-evidence-harness-runtime.js) re-runs
// each recorded proof command and writes the probe artifact.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'ttl-sweep-keeps-active-for-nonterminal',
    testFile: 'test/rebalancer/reservation-expiry-operation-aware.test.js',
    detail: 'the TTL-expiry sweep consults operation state the way the ' +
      'orphan-release arm already does: a TTL-expired reservation for a ' +
      'LIVE (non-terminal) operation is kept ACTIVE, while a terminal ' +
      'operation lets its expired reservation transition to EXPIRED ' +
      '(audit finding 4; red-on-revert: removing the expiry snapshot ' +
      'consult from runReservationReconcileSweep flips the live arm red)',
  }),
  Object.freeze({
    id: 'capacity-accounting-respects-live-operation',
    testFile: 'test/rebalancer/reservation-expiry-operation-aware.test.js',
    detail: 'capacity accounting stops treating expires_at <= now as ' +
      'already-released: a reservation backing a live (non-terminal) ' +
      'operation keeps its reserved bytes counted past expiry, and only a ' +
      'terminal operation lets its expired reservation stop counting ' +
      '(audit finding 4; red-on-revert: restoring the unconditional ' +
      'pre-expiry skip in calculateReservedBytes flips the live arm red)',
  }),
]);

const QUEST_ID = 'reservation-expiry-operation-aware';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME = 'reservation-expiry-operation-aware.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
