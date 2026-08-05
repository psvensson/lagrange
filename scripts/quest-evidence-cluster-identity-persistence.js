// Deterministic evidence harness for the cluster-identity-persistence-seam
// quest: receipt declarations only. The shared runtime
// (scripts/quest-evidence-harness-runtime.js) re-runs each recorded proof
// command and writes the probe artifact.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'cluster-identity-minted-once-at-first-seed-bootstrap',
    testFile: 'test/bootstrap/cluster-identity-mint.test.js',
    detail: 'first seed bootstrap mints a randomUUID CONFIG-row singleton ' +
      'and never re-mints over an existing identity',
  }),
  Object.freeze({
    id: 'cluster-identity-carried-in-rejoin-hints',
    testFile: 'test/bootstrap/cluster-identity.test.js',
    detail: 'both hints builders carry the identity and the persisted ' +
      'value is readable pre-hydration on restart',
  }),
  Object.freeze({
    id: 'cluster-identity-persisted-as-config-row',
    testFile: 'test/bootstrap/cluster-identity-mint.test.js',
    detail: 'the identity is written through the replicated CONFIG-row ' +
      'system table writer (EPOCH_CONFIG_KEY precedent)',
  }),
  Object.freeze({
    id: 'cluster-identity-threaded-into-snapshot-catchup',
    testFile: 'test/raft/snapshot-catchup-cluster-identity.test.js',
    detail: 'the snapshot-checkpoint seam reads the durable CONFIG-row ' +
      'identity, falling back to the pre-identity default only while none ' +
      'is visible',
  }),
  Object.freeze({
    id: 'cluster-identity-mismatch-fails-closed',
    testFile: 'test/bootstrap/cluster-identity.test.js',
    detail: 'a hints/expected cluster-id mismatch resolves to the typed ' +
      'fail-closed CLUSTER_ID_MISMATCH startup decision',
  }),
]);

const QUEST_ID = 'cluster-identity-persistence-seam';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME =
  'cluster-identity-persistence-seam.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
