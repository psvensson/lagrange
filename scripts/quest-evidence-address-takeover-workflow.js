// Deterministic evidence harness for the address-takeover-workflow-v2
// quest: receipt declarations only. The shared runtime
// (scripts/quest-evidence-harness-runtime.js) re-runs each recorded proof
// command and writes the probe artifact.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'in-lease-conflict-retryable-not-terminal',
    testFile: 'test/bootstrap/address-takeover-workflow.test.js',
    detail: 'a changed-address restart inside the ready-lease window gets ' +
      'a typed retryable conflict (code + retryAfterMs from the lease), ' +
      'never the terminal 409',
  }),
  Object.freeze({
    id: 'no-hard-exit-on-lease-window',
    testFile: 'test/bootstrap/address-takeover-workflow.test.js',
    detail: 'the joiner classifies the typed lease-window 409 retryable ' +
      '(terminalValidationOrConflict false), so the entrypoint never ' +
      'reaches process.exit(1); an untyped 409 stays terminal',
  }),
  Object.freeze({
    id: 'single-canonical-takeover-policy',
    testFile: 'test/bootstrap/address-takeover-workflow.test.js',
    detail: 'the same-address / changed-address / address-claim branches ' +
      'compose in one canonical resolveTakeoverDecision; the lease-window ' +
      'case is peeled off inside it',
  }),
  Object.freeze({
    id: 'readmission-after-lease-expiry',
    testFile: 'test/bootstrap/address-takeover-workflow.test.js',
    detail: 'once the conflicting lease has expired the changed-address ' +
      'rejoin is admitted via the stale-rejoin fall-through',
  }),
  Object.freeze({
    id: 'live-ab-fixed-vs-reverted',
    testFile: 'test/bootstrap/address-takeover-live-ab.test.js',
    detail: 'controlled live A/B (TEST-0022): N>=2 runs of an 8-restart ' +
      'fleet through the real seed admission owner + real joiner ' +
      'classification show 0 terminal / N retryable fixed vs the reverted ' +
      'defect (N terminal), plus readmission after lease expiry and ' +
      'status-driven (message-drift-immune) terminality',
  }),
]);

const QUEST_ID = 'address-takeover-workflow-v2';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME = 'address-takeover-workflow-v2.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
