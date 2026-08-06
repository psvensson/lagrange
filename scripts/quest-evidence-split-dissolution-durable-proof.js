// Deterministic evidence harness for the split-dissolution-durable-proof
// quest: receipt declarations only. The shared runtime
// (scripts/quest-evidence-harness-runtime.js) re-runs each recorded proof
// command and writes the probe artifact.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'dissolution-witness-persisted',
    testFile: 'test/partition/split-dissolution-durable-proof.test.js',
    detail: 'SOURCE_DISSOLVED is recorded only against the persisted ' +
      'partitions-row removal witness (affectedRows === 1); a ' +
      'zero-affected-rows removal records DISSOLUTION_FAILED with the ' +
      'witness-missing refusal as the logged cause — the owner can ' +
      'never believe a source dissolved while its durable row ' +
      'survives (F14)',
  }),
  Object.freeze({
    id: 'failed-dissolution-reattemptable',
    testFile: 'test/partition/split-dissolution-durable-proof.test.js',
    detail: 'a dissolution that failed against a missing witness is ' +
      're-attemptable: the retry against the persisted witness ' +
      '(affectedRows === 1) reaches SOURCE_DISSOLVED',
  }),
  Object.freeze({
    id: 'fence-validated-dissolution-acks',
    testFile: 'test/partition/split-dissolution-durable-proof.test.js',
    detail: 'owner-recorded SOURCE_DISSOLVED and DISSOLUTION_FAILED ' +
      'acks carry the workflow claim fence token (persisted ' +
      'participant.fenceToken equals the claimed fence), passing the ' +
      'same participant-fence validation as every other ack',
  }),
  Object.freeze({
    id: 'split-terminal-lifecycle-regression',
    testFile: 'test/partition/managed-split-workflow-terminal-lifecycle.test.js',
    detail: 'the rung-1 terminal lifecycle suite (dissolution clears ' +
      'the durable transition row, SPLIT_COMPLETED at terminal, ' +
      'sibling carry-forward, partition_count) passes unchanged ' +
      'against the witness-gated dissolution',
  }),
  Object.freeze({
    id: 'merge-dissolution-parity-regression',
    testFile: 'test/partition/merge-cutover-coordination.test.js',
    detail: 'the merge dissolution/cutover coordination suite (112 ' +
      'assertions: both-mirror wait, teardown dispatch, failed-' +
      'dissolution re-attempt, terminal clear) passes with the same ' +
      'witness + fence-stamped acks applied to the merge template',
  }),
]);

const QUEST_ID = 'split-dissolution-durable-proof';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME = 'split-dissolution-durable-proof.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
