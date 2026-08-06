// Deterministic evidence harness for the write-path-epoch-fencing quest:
// receipt declarations only. The shared runtime
// (scripts/quest-evidence-harness-runtime.js) re-runs each recorded proof
// command and writes the probe artifact.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'query-payload-carries-expected-version',
    testFile: 'test/partition/write-path-epoch-fencing.test.js',
    detail: 'the default QUERY request builder carries ' +
      'expectedPartitionVersion from execution options onto the wire ' +
      '(never fabricated when absent/invalid), and the engine write ' +
      'path stamps it from resolveActivePartitionVersion(tableInfo)',
  }),
  Object.freeze({
    id: 'stale-epoch-write-rejected',
    testFile: 'test/partition/write-path-epoch-fencing.test.js',
    detail: 'handleRemoteQuery rejects a write whose ' +
      'expectedPartitionVersion mismatches the locally authoritative ' +
      'epoch (cached tables row active_partition_version) with the ' +
      'typed STALE_PARTITION_EPOCH errorCode envelope; a matching ' +
      'epoch executes',
  }),
  Object.freeze({
    id: 'pre-cutover-evidence-gap-defers',
    testFile: 'test/partition/write-path-epoch-fencing.test.js',
    detail: 'a cold-cache descriptor-epoch evidence gap during an ' +
      'in-flight pre-cutover split/merge mirror defers with a typed ' +
      'deferRetry signal (never silently skips validation) — at the ' +
      'routing assert, both service wrappers, and the partition ' +
      'boundary itself',
  }),
  Object.freeze({
    id: 'post-cutover-evidence-gap-fails-closed',
    testFile: 'test/partition/write-path-epoch-fencing.test.js',
    detail: 'a cold-cache descriptor-epoch evidence gap post-cutover ' +
      'fails closed (hard throw / typed stale-epoch rejection, no ' +
      'defer) — a withdrawn epoch never accepts writes; the no-mirror ' +
      'legacy skip path is preserved when there is nothing to fence',
  }),
]);

const QUEST_ID = 'write-path-epoch-fencing';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME = 'write-path-epoch-fencing.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
