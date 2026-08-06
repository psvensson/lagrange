// Deterministic evidence harness for the split-merge-overlap-guard quest:
// receipt declarations only. The shared runtime
// (scripts/quest-evidence-harness-runtime.js) re-runs each recorded proof
// command and writes the probe artifact.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'overlap-refused-at-registration',
    testFile: 'test/partition/split-merge-overlap-guard.test.js',
    detail: 'registering a split whose source key range overlaps an ' +
      'already-persisted in-flight transition (split or merge) is ' +
      'refused at registration with the typed already-in-progress ' +
      'outcome qualified by the overlap suffix; a disjoint candidate ' +
      'range registers cleanly (F23)',
  }),
  Object.freeze({
    id: 'durable-overlap-validation',
    testFile: 'test/partition/split-merge-overlap-guard.test.js',
    detail: 'the refusal is driven by the durable tables transition ' +
      'rows (listTableInfos + parsePartitionTransition) and the ' +
      'authoritative partitions rows — no process-local ' +
      'splitReplication/mergeReplication handle ever sees the foreign ' +
      'transition, and clearing the durable row admits the same ' +
      'registration',
  }),
  Object.freeze({
    id: 'restart-surviving-guard',
    testFile: 'test/partition/split-merge-overlap-guard.test.js',
    detail: 'a fresh ManagedSplitWorkflow / ManagedMergeWorkflow ' +
      'instance over the same durable store still refuses the ' +
      'overlapping registration — the guard survives a simulated ' +
      'restart because it consults durable transition rows, not ' +
      'process-local state',
  }),
  Object.freeze({
    id: 'managed-split-workflow-suite',
    testFile: 'test/partition/managed-split-workflow.test.js',
    detail: 'pre-existing managed split admission/lifecycle suite ' +
      'passes unchanged with the durable overlap guard wired into ' +
      'registration',
  }),
  Object.freeze({
    id: 'managed-merge-workflow-suite',
    testFile: 'test/partition/managed-merge-workflow.test.js',
    detail: 'pre-existing managed merge admission/lifecycle suite ' +
      'passes unchanged with the durable overlap guard wired into ' +
      'registration',
  }),
  Object.freeze({
    id: 'split-merge-manager-suite',
    testFile: 'test/partition/partition-split-merge-manager.test.js',
    detail: 'pre-existing partition split/merge manager suite passes ' +
      'unchanged with the durable overlap guard in place',
  }),
]);

const QUEST_ID = 'split-merge-overlap-guard';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME = 'split-merge-overlap-guard.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
