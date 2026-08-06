// Deterministic evidence harness for the split-abort-fence-parity quest:
// receipt declarations only. The shared runtime
// (scripts/quest-evidence-harness-runtime.js) re-runs each recorded proof
// command and writes the probe artifact.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'abort-transition-fenced',
    testFile: 'test/partition/split-abort-fence-parity.test.js',
    detail: 'the split abort step result carries the renewed claim ' +
      'fenceToken/ownerId (nextStep + reason + fence + owner, exactly ' +
      'like the phase-advance path), persisting FAILED through the ' +
      'fenced persistWorkflowTransition: the durable row carries the ' +
      'fence/owner triple and the abort history entry is fence-stamped ' +
      '— the last unfenced owner-lane write (fenceToken: null) is gone',
  }),
  Object.freeze({
    id: 'abort-dissolution-acks-fenced',
    testFile: 'test/partition/split-abort-fence-parity.test.js',
    detail: 'the post-abort teardown runs in the same fenced owner ' +
      'lane: both never-authoritative children receive replica ' +
      'removals and the workflow fence is unchanged through the ' +
      'abort+teardown lane — the owner-recorded dissolution acks on ' +
      'the abort path stamp against the same claim fence (F14 parity)',
  }),
  Object.freeze({
    id: 'cross-process-abort-cutover-exclusion',
    testFile: 'test/partition/split-abort-fence-parity.test.js',
    detail: 'a queued abort stamped at a superseded fence is rejected ' +
      'by the storage-backed assertTransitionFence once the fence has ' +
      'advanced (the abort/cutover interleave): the live workflow and ' +
      'the durable row stay at the pre-abort phase, the fence epoch ' +
      'untouched — cross-process protection no longer rests on status ' +
      're-validation alone',
  }),
  Object.freeze({
    id: 'split-workflow-regression',
    testFile: 'test/partition/managed-split-workflow.test.js',
    detail: 'the managed split workflow suite (140 assertions: ' +
      'admission, provisioning deferral, phase advances, terminal ' +
      'lifecycle) passes unchanged against the fenced abort path',
  }),
  Object.freeze({
    id: 'workflow-fencing-regression',
    testFile: 'test/partition/workflow-fencing-wiring.test.js',
    detail: 'the rung-2 fencing wiring suite (claim wiring, fenced ' +
      'source acks, stale-fence ack rejection, participant transition ' +
      'graph) passes unchanged with the abort transition fenced',
  }),
]);

const QUEST_ID = 'split-abort-fence-parity';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME = 'split-abort-fence-parity.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
