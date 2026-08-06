// Deterministic evidence harness for the durable-replay-cursor quest:
// receipt declarations only. The shared runtime
// (scripts/quest-evidence-harness-runtime.js) re-runs each recorded proof
// command and writes the probe artifact.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'persisted-snapshot-barrier-and-watermark',
    testFile: 'test/partition/durable-replay-cursor.test.js',
    detail: 'the split worker seeds the snapshot barrier from the ' +
      'durable Raft log index and carries the replay cursor (barrier + ' +
      'watermark) on the catch-up acknowledgement; the checkpoint rides ' +
      'the owner persistence seam into the transition metadata under ' +
      'SOURCE_CHECKPOINT, and the service-side normalizer surfaces the ' +
      'cursor from exactly that slot (idempotently) so a restarted ' +
      'source sees it',
  }),
  Object.freeze({
    id: 'raft-log-delta-replay',
    testFile: 'test/partition/durable-replay-cursor.test.js',
    detail: 'reconstruction seeds the catch-up queue from the durable ' +
      'Raft log behind the persisted replay watermark ' +
      '(getEntriesFrom(watermark + 1), mirrorable write types only, ' +
      'each delta stamped with its logIndex so the drain advances the ' +
      'watermark per delivery) — never from the volatile pre-restart ' +
      'pendingEntries array',
  }),
  Object.freeze({
    id: 'bounded-delta-queue',
    testFile: 'test/partition/durable-replay-cursor.test.js',
    detail: 'the interim split/merge mirror delta queues are bounded ' +
      '(MIRROR_DELTA_QUEUE_CAPACITY): at capacity the write path ' +
      'rejects with the typed MIRROR_DELTA_QUEUE_AT_CAPACITY ' +
      'backpressure error instead of growing RAM unboundedly',
  }),
  Object.freeze({
    id: 'worker-start-or-resume-on-recovery',
    testFile: 'test/partition/durable-replay-cursor.test.js',
    detail: 'leader activation drives resumeDurableMirrorReplicationWorkers ' +
      'after state reconstruction (reconstruction without resumption ' +
      'is NOT recovery): a restarted source whose durable transition ' +
      'row names it as the source of an in-flight split/merge ' +
      'reconstructs execution state against the durable cursor and ' +
      're-runs the replication worker exactly once; no durable row ' +
      'means a no-op',
  }),
]);

const QUEST_ID = 'durable-replay-cursor';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME = 'durable-replay-cursor.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
