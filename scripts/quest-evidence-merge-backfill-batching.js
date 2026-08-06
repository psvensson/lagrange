// Deterministic evidence harness for the merge-backfill-batching quest:
// receipt declarations only. The shared runtime
// (scripts/quest-evidence-harness-runtime.js) re-runs each recorded proof
// command and writes the probe artifact.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'batched-merge-backfill',
    testFile: 'test/partition/merge-backfill-batching.test.js',
    detail: 'the merge snapshot backfill no longer routes one INSERT OR ' +
      'REPLACE per row: N source rows produce ceil(N/batchSize) routed ' +
      'writes with bounded multi-row VALUES tuples, params flattened in ' +
      'primary-key order within and across batches, mirroring the split ' +
      'snapshot batch path (F22)',
  }),
  Object.freeze({
    id: 'bind-variable-cap-respected',
    testFile: 'test/partition/merge-backfill-batching.test.js',
    detail: 'a 512-column wide table caps rows per merge backfill batch ' +
      'at floor(32766/512) so no multi-row upsert exceeds ' +
      'SPLIT_SNAPSHOT_MAX_BIND_VARIABLES bind variables — proven by ' +
      'actually executing every batch against an in-memory SQLite table',
  }),
  Object.freeze({
    id: 'epoch-assert-per-batch',
    testFile: 'test/partition/merge-backfill-batching.test.js',
    detail: 'assertMergeRoutingDescriptorEpoch fires exactly once per ' +
      'merge backfill batch (assertion count equals batch count, not row ' +
      'count) and a stale descriptor epoch rejects before the batch is ' +
      'dispatched; the splitSnapshotBackfill yield cadence still paces ' +
      'the copy at batch boundaries',
  }),
  Object.freeze({
    id: 'merge-source-replication-regression',
    testFile: 'test/partition/merge-source-replication.test.js',
    detail: 'pre-existing merge source replication regression suite ' +
      '(ack ladder, snapshot fan-in to the merged target, queued live ' +
      'writes, cutover wait, failure acks) passes unchanged against the ' +
      'batched backfill path',
  }),
]);

const QUEST_ID = 'merge-backfill-batching';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME = 'merge-backfill-batching.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
