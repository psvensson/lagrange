// Deterministic evidence harness for the node-incarnation-fencing-v2 quest:
// receipt declarations only. The shared runtime
// (scripts/quest-evidence-harness-runtime.js) re-runs each recorded proof
// command and writes the probe artifact.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'incarnation-persisted-in-rejoin-hints',
    testFile: 'test/bootstrap/node-incarnation.test.js',
    detail: 'both hints builders carry the boot incarnation and the ' +
      'persisted value is readable pre-hydration on restart',
  }),
  Object.freeze({
    id: 'incarnation-incremented-per-boot',
    testFile: 'test/bootstrap/node-incarnation.test.js',
    detail: 'mintBootIncarnation returns previous+1 once per boot while ' +
      'the 1s persistence cadence rewrites the same value',
  }),
  Object.freeze({
    id: 'incarnation-carried-in-node-state-updates',
    testFile: 'test/bootstrap/node-incarnation.test.js',
    detail: 'the publication owner stamps the boot incarnation onto every ' +
      'node state update message via ControlPlaneField.BOOT_INCARNATION',
  }),
  Object.freeze({
    id: 'incarnation-propagated-through-publication-path',
    testFile: 'test/bootstrap/node-incarnation.test.js',
    detail: 'the incarnation flows through the durable nodes row ' +
      '(boot_incarnation column) and the heartbeat publication path',
  }),
]);

const QUEST_ID = 'node-incarnation-fencing-v2';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME = 'node-incarnation-fencing-v2.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
