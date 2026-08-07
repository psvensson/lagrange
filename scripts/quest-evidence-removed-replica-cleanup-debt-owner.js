// Deterministic evidence harness for the
// removed-replica-cleanup-debt-owner quest: receipt declarations only.
// The shared runtime (scripts/quest-evidence-harness-runtime.js) re-runs
// each recorded proof command and writes the probe artifact.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'cleanup-retry-reachable-after-failure',
    testFile: 'test/rebalancer/removed-replica-cleanup-debt-owner.test.js',
    detail: 'a replica removal whose local cleanup fails AFTER the ' +
      'authoritative services-row delete still terminalizes the operation ' +
      '(REPLICA_REMOVE_COMPLETED), and the next startup sweep drives the ' +
      'idempotent reconcileRemovedReplicaCleanup retry against the ' +
      'stranded files and deletes the DB/WAL set — the retry now has a ' +
      'durable owner (audit finding 12; red-on-revert: removing the sweep ' +
      'wiring from initialize() or restoring the tracked-service-only ' +
      'cleanup guard flips every subtest red)',
  }),
  Object.freeze({
    id: 'orphan-files-eventually-deleted',
    testFile: 'test/rebalancer/removed-replica-cleanup-debt-owner.test.js',
    detail: 'the startup sweep compares the partitions directory against ' +
      'authoritative services rows and deletes every row-less replica ' +
      'DB/WAL/SHM file set — including historical orphans predating any ' +
      'debt record — while assigned files and quarantined reconciliation ' +
      'evidence survive; a sweep-time deletion failure leaves the orphan ' +
      'in place so the next startup retries it (explicit-choice: (b) the ' +
      'startup filesystem sweep alone; the debt-record variant adds no ' +
      'information beyond the filesystem state the sweep already reads)',
  }),
]);

const QUEST_ID = 'removed-replica-cleanup-debt-owner';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME = 'removed-replica-cleanup-debt-owner.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
