// Deterministic evidence harness for the
// stale-replica-file-startup-reconciliation-v2 quest: receipt declarations
// only. The shared runtime (scripts/quest-evidence-harness-runtime.js)
// re-runs each recorded proof command and writes the probe artifact.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'orphaned-replica-file-quarantined-before-evidence-read',
    testFile: 'test/node/replica-lifecycle-manager.test.js',
    detail: 'a nodes-p* replica .db with no services-row assignment is ' +
      'quarantined (renamed aside, not deleted) at startup recovery, so it ' +
      'can no longer sit at its readable path as if it were current ' +
      'durable evidence',
  }),
  Object.freeze({
    id: 'sweep-keys-on-authoritative-assignment',
    testFile: 'test/node/replica-lifecycle-manager.test.js',
    detail: 'the sweep compares on-disk files against services-table rows ' +
      'for this node (the canonical assignment), never against the raw ' +
      'file union it replaces',
  }),
  Object.freeze({
    id: 'assigned-replica-files-untouched',
    testFile: 'test/node/replica-lifecycle-manager.test.js',
    detail: 'a replica file whose services row exists is left in place, ' +
      'and an unreadable partitions dir fails closed (sweep reports ' +
      'not-completed rather than claiming no orphans over ambiguous state)',
  }),
]);

const QUEST_ID = 'stale-replica-file-startup-reconciliation-v2';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME =
  'stale-replica-file-startup-reconciliation-v2.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
