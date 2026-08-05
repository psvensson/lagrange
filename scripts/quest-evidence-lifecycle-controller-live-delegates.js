// Deterministic evidence harness for the
// lifecycle-controller-live-delegates-only-v2 quest: receipt declarations
// only. The shared runtime (scripts/quest-evidence-harness-runtime.js)
// re-runs each recorded proof command and writes the probe artifact.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'intent-drain-delegates-preserved',
    testFile: 'test/control-plane/membership-lifecycle-controller.test.js',
    detail: 'the live join/drain intent delegates (submitJoinIntent, ' +
      'submitDrainIntent) are preserved with their normalized lifecycle ' +
      'summaries and delegate dispatch',
  }),
  Object.freeze({
    id: 'shadow-state-machine-removed',
    testFile: 'test/control-plane/membership-lifecycle-controller-live-delegates-only.test.js',
    detail: 'the unconsumed per-member state machine, transition history, ' +
      'intent history, and the unreachable removal path are gone from the ' +
      'controller surface',
  }),
  Object.freeze({
    id: 'reintroduction-guard-fails',
    testFile: 'test/control-plane/membership-lifecycle-controller-live-delegates-only.test.js',
    detail: 'the guard fails when the shadow state machine, transition ' +
      'history, or removal path is reintroduced without a consumer',
  }),
]);

const QUEST_ID = 'lifecycle-controller-live-delegates-only-v2';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME =
  'lifecycle-controller-live-delegates-only-v2.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
