// Deterministic evidence harness for the
// reservation-fail-closed-dispatch-gate quest: receipt declarations only.
// The shared runtime (scripts/quest-evidence-harness-runtime.js) re-runs
// each recorded proof command and writes the probe artifact.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'reservation-failure-blocks-dispatch',
    testFile: 'test/rebalancer/reservation-fail-closed-dispatch-gate.test.js',
    detail: 'a failed storage_reservations insert fails operation creation ' +
      'closed: createOperation(ADD) rejects, no OPERATION_CREATED is ' +
      'emitted, and nothing is dispatched under-reserved (audit finding 3; ' +
      'red-on-revert: removing the creation-time FAILED-outcome throw ' +
      'flips this test red)',
  }),
  Object.freeze({
    id: 'dispatch-gate-repairs-via-ensure',
    testFile: 'test/rebalancer/reservation-fail-closed-dispatch-gate.test.js',
    detail: 'the dispatch-time gate verifies an ACTIVE reservation before ' +
      'any storage-increasing dispatch, repairing a missing one through ' +
      'ensureReservationForOperation on the deterministic ' +
      'res-${operationId} identity; when the repair insert fails the ' +
      'dispatch is skipped as OPERATION_NOT_DISPATCHABLE and ' +
      'executeOperationInternal never runs (audit findings 3+11; ' +
      'red-on-revert: removing the gate from dispatchOperationInternal ' +
      'flips both arms red)',
  }),
  Object.freeze({
    id: 'divergence-arm-keeps-reservation',
    testFile: 'test/rebalancer/reservation-fail-closed-dispatch-gate.test.js',
    detail: 'terminal persistence returns the typed quest-2 update ' +
      'disposition through executeAtomicTransition, and the reservation is ' +
      'released only on committed / already-same-terminal ' +
      '(IDEMPOTENT_REPLAY) / lost-to-other-terminal (TERMINAL_ADOPTED) — ' +
      'never on the unresolved-divergence arm (REFUSED/REINSERTED), where ' +
      'the operation is still live and re-driveable (audit finding 11; ' +
      'red-on-revert: restoring the unconditional not-committed release ' +
      'flips the divergence arm red)',
  }),
  Object.freeze({
    id: 'reservation-suites-green',
    testFile: 'test/rebalancer/coordinator-reservation-lifecycle.test.js',
    detail: 'the pre-existing reservation lifecycle suite passes with the ' +
      'typed createReservationForOperation return, the fail-closed ' +
      'creation path, and the disposition-gated terminal release engaged',
  }),
]);

const QUEST_ID = 'reservation-fail-closed-dispatch-gate';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME = 'reservation-fail-closed-dispatch-gate.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
