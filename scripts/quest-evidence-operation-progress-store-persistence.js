// Deterministic evidence harness for the operation-progress-store-persistence
// quest (verified-audit findings 15 and 18): receipt declarations only. The
// shared runtime (scripts/quest-evidence-harness-runtime.js) re-runs each
// recorded proof command and writes the probe artifact.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'progress-store-durable-or-honestly-renamed',
    testFile: 'test/rebalancer/operation-progress-store-persistence.test.js',
    detail: 'explicit choice: WIRE REAL PERSISTENCE (the preferred ' +
      'option) — the rebalancer operation-workflow DurableWorkflowCoordinator ' +
      'is no longer constructed bare: its persist callback ' +
      '(persistOperationWorkflowTransitionToDurableRow in ' +
      'src/rebalancer/operation-workflow-persistence.js, wired in ' +
      'rebalance-coordinator-lifecycle.js following the managed-merge / ' +
      'managed-split / control-plane-readiness / schema-provisioning ' +
      'template) mirrors every transition candidate onto the durable ' +
      'replica_operations row (steps_history is the canonical durable ' +
      'transition mirror) and THROWS when the mirror cannot advance, so ' +
      'the coordinator rolls the in-memory record back instead of running ' +
      'ahead of the durable row; ensureOperationWorkflow hydrates the ' +
      'transition witness from the durable row via ' +
      'recoverOperationWorkflowsFromDurableRows so the witness survives a ' +
      'restart — red-on-revert: reverting the persist callback to a no-op ' +
      'leaves the restarted store recovering only what the row carries ' +
      '(the witness the no-op never mirrored is lost) and the restart ' +
      'test goes red',
  }),
  Object.freeze({
    id: 'lease-fence-freshness-not-hardcoded',
    testFile: 'test/rebalancer/operation-progress-store-persistence.test.js',
    detail: 'the owner ports no longer hard-code freshness as CURRENT ' +
      '(src/rebalancer/operation-workflow-port-freshness.js): lease ' +
      'freshness derives from the Q9 durable row lease (lease_expires_at) ' +
      '— an EXPIRED lease reads owner_lease_stale and a legacy unstamped ' +
      'row reads owner_lease_unavailable; the publication fence compares ' +
      'the coordinator persisted transition-history witness against the ' +
      'durable row steps_history mirror — divergence or a rewound witness ' +
      'reads publication_fence_stale, and no persisted witness against a ' +
      'row that already carries history reads ' +
      'publication_fence_incomplete — red-on-revert: re-hard-coding ' +
      'CURRENT in buildOperationWorkflowOwnerPortOwnerLease or ' +
      'buildOperationWorkflowOwnerPortPublicationFence flips the ' +
      'freshness tests red',
  }),
]);

const QUEST_ID = 'operation-progress-store-persistence';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME =
  'operation-progress-store-persistence.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
