// Deterministic evidence harness for the dead-setthresholds-removal quest:
// receipt declarations only. The shared runtime
// (scripts/quest-evidence-harness-runtime.js) re-runs each recorded proof
// command and writes the probe artifact.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'single-threshold-owner',
    testFile: 'test/partition/partition-split-merge-manager.test.js',
    detail: 'threshold state has exactly one owner — construction-time ' +
      'configuration (ConfigurationManager / SPLIT_MERGE_DEFAULT in the ' +
      'PartitionSplitMergeManager constructor); getThresholds returns the ' +
      'configured defaults and no post-construction mutation path exists ' +
      '(F24)',
  }),
  Object.freeze({
    id: 'no-dead-mutator',
    testFile: 'test/partition/partition-split-merge-manager.test.js',
    detail: 'the split/merge manager public surface — instance and ' +
      'prototype — carries no setThresholds mutator and no threshold-' +
      'mutating method of any name; a regression test scans the public ' +
      'API surface so re-adding a dead mutator fails the suite',
  }),
  Object.freeze({
    id: 'legacy-split-merge-suite-green',
    testFile: 'test/partition/merge-auto-execution.test.js',
    detail: 'pre-existing merge auto-execution regression suite ' +
      '(backpressure deferral, execution caps via getThresholds) passes ' +
      'unchanged with the dead setThresholds surface removed',
  }),
]);

const QUEST_ID = 'dead-setthresholds-removal';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME = 'dead-setthresholds-removal.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
