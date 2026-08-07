// Deterministic evidence harness for the operation-ownership-lease-fencing
// quest (verified-audit findings 5 and 14): receipt declarations only. The
// shared runtime (scripts/quest-evidence-harness-runtime.js) re-runs each
// recorded proof command and writes the probe artifact.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'durable-owner-lease-enforced',
    testFile: 'test/rebalancer/operation-ownership-lease-fencing.test.js',
    detail: 'the schema vestigial lease_expires_at column becomes the ' +
      'durable owner lease: the insert-row and update-data payloads carry a ' +
      're-stamped lease heartbeat anchored to the operation updatedAt, the ' +
      'dedicated UPDATE_OPERATION_OWNER_LEASE touch persists ' +
      'lease_expires_at on live rows (terminal rows skipped via ' +
      'completed_at IS NULL), and a LIVE lease held by the recorded remote ' +
      'owner FENCES priority-control-plane drain remote settlement even ' +
      'when the unfenced routing-readiness heuristic reports the owner ' +
      'unready (expired leases defer back to the heuristic) — ' +
      'red-on-revert: removing the lease stamp/touch or the lease-first ' +
      'fence in resolveOperationDrainOwnerAvailability fails the lease and ' +
      'fence tests',
  }),
  Object.freeze({
    id: 'orphan-op-adopted-by-fenced-successor',
    testFile: 'test/rebalancer/operation-ownership-lease-fencing.test.js',
    detail: 'an incomplete ordinary-partition operation whose recorded ' +
      'owner is remote joins the level-triggered recovery sweep once its ' +
      'durable lease is expired (or legacy-absent) and is re-driven through ' +
      'the gated single-flight lifecycle reconcile — a live remote lease ' +
      'keeps it fenced out of the sweep (red-on-revert: removing the ' +
      'adoption arm in reconcileOrphanedOperations or the lease fence in ' +
      'queryOrphanAdoptableOperations fails the adoption tests)',
  }),
  Object.freeze({
    id: 'shutdown-joins-in-flight',
    testFile: 'test/rebalancer/operation-ownership-lease-fencing.test.js',
    detail: 'shutdown bumps the ownership fence epoch FIRST, then ' +
      'BOUNDEDLY awaits the in-flight owner lanes (joinInFlightOwnerLanes) ' +
      'before releasing the retry registries — a wedged lane hits the ' +
      'bounded timeout instead of pinning shutdown, and a lane continuation ' +
      'past the fence bump stands down with shutdown_in_progress instead ' +
      'of running unguarded (red-on-revert: removing the fence bump, the ' +
      'lane fence check in runRetainedOperationOwnerAction, or the bounded ' +
      'join in RebalanceCoordinator.shutdown fails the join tests)',
  }),
]);

const QUEST_ID = 'operation-ownership-lease-fencing';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME =
  'operation-ownership-lease-fencing.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
