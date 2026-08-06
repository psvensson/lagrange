// Deterministic evidence harness for the split-key-comparator-typing quest:
// receipt declarations only. The shared runtime
// (scripts/quest-evidence-harness-runtime.js) re-runs each recorded proof
// command and writes the probe artifact.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'typed-comparator-owned',
    testFile: 'test/partition/split-key-comparator.test.js',
    detail: 'split-key comparison lives in exactly one owned module ' +
      '(src/partition/split-key-comparator.js) with typed numeric, ' +
      'string, and buffer comparators; the raw `value < ' +
      'metadata.splitKey` relational comparison is gone from the ' +
      'routing surface, which re-exports the comparator-owned resolver',
  }),
  Object.freeze({
    id: 'mixed-type-keyspace-rejected',
    testFile: 'test/partition/split-key-comparator.test.js',
    detail: 'a routing key whose type is incomparable to the splitKey ' +
      'type (string key in a numeric key space, buffer in string, NaN ' +
      'or object split key) throws the typed splitKeyTypeMismatch ' +
      'outcome at mirror replay and snapshot batching — never coerced ' +
      'into a silent mis-route (F12)',
  }),
  Object.freeze({
    id: 'single-comparator-call-sites',
    testFile: 'test/partition/split-key-comparator.test.js',
    detail: 'every split routing decision — mirror replay, snapshot ' +
      'batching, and the service-wrapper resolver — flows through the ' +
      'one comparator-owned resolveSplitTargetPartitionId; the routing ' +
      'module carries no raw relational split-key comparison',
  }),
  Object.freeze({
    id: 'single-comparator-call-sites',
    testFile: 'test/partition/partition-split-routing.test.js',
    detail: 'pre-existing split routing regression suite (descriptor ' +
      'epoch fencing, snapshot batch grouping, bind-limit batching) ' +
      'passes unchanged against the typed comparator shared by every ' +
      'call site',
  }),
]);

const QUEST_ID = 'split-key-comparator-typing';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME = 'split-key-comparator-typing.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
