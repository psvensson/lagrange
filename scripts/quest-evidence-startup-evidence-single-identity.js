// Deterministic evidence harness for the
// startup-evidence-single-identity-decision-v2 quest: receipt declarations
// only. The shared runtime (scripts/quest-evidence-harness-runtime.js)
// re-runs each recorded proof command and writes the probe artifact.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'readauthoritativerows-typed-outcome',
    testFile: 'test/bootstrap/node-registration-owner.test.js',
    detail: 'readAuthoritativeRows returns a typed {state, rows} outcome ' +
      'distinguishing READABLE from UNAVAILABLE (never a bare-array ' +
      'collapse of missing/unavailable/failed to [])',
  }),
  Object.freeze({
    id: 'unavailable-authority-defers-typed',
    testFile: 'test/bootstrap/node-registration-owner.test.js',
    detail: 'an unavailable authority throws a typed deferred retryable ' +
      'error (deferRetry + retryAfterMs) so the join retries; zero ' +
      'upsertJoinNode calls (no fresh clobber over an authority that ' +
      'might hold the row)',
  }),
]);

const QUEST_ID = 'startup-evidence-single-identity-decision-v2';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME =
  'startup-evidence-single-identity-decision-v2.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
