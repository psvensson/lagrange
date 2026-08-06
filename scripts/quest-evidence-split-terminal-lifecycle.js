// Deterministic evidence harness for the split-terminal-lifecycle quest:
// receipt declarations only. The shared runtime
// (scripts/quest-evidence-harness-runtime.js) re-runs each recorded proof
// command and writes the probe artifact.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'split-terminal-clear-allows-second-split',
    testFile: 'test/partition/managed-split-workflow-terminal-lifecycle.test.js',
    detail: 'terminal dissolution clears the tables transition row ' +
      '(state + metadata + pending epoch all null), releases the ' +
      'in-memory workflow, and leaves the durable row admissible for a ' +
      'second split — the F9 wedge is gone',
  }),
  Object.freeze({
    id: 'split-sibling-carry-forward',
    testFile: 'test/partition/managed-split-epoch-persistence-effects.test.js',
    detail: 'non-participating sibling descriptors are promoted into ' +
      'the split target epoch at cutover (fail-closed on a zero-row ' +
      'update); abort restores them — sibling key ranges never strand',
  }),
  Object.freeze({
    id: 'split-cutover-partition-count',
    testFile: 'test/partition/managed-split-epoch-persistence-effects.test.js',
    detail: 'the durable cutover writes partition_count = targetIds + ' +
      'carried-forward siblings = oldCount + 1, promotes the pending ' +
      'epoch to active, and clears the pending column',
  }),
  Object.freeze({
    id: 'split-failed-withdraws-pending-version',
    testFile: 'test/partition/managed-split-epoch-persistence-effects.test.js',
    detail: 'a FAILED split transition withdraws ' +
      'pending_partition_version in the same mutation (no pending ' +
      'visibility), leaving the source authoritative at the active epoch',
  }),
  Object.freeze({
    id: 'split-completed-emitted-at-terminal',
    testFile: 'test/partition/managed-split-workflow-terminal-lifecycle.test.js',
    detail: 'SPLIT_COMPLETED fires exactly once at terminal (after the ' +
      'transition row clears), never at plan time or cutover, with the ' +
      'planner-result payload shape the stabilization-reset listener ' +
      'consumes',
  }),
]);

const QUEST_ID = 'split-terminal-lifecycle';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME = 'split-terminal-lifecycle.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
