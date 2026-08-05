// Deterministic evidence harness for the cluster-identity-join-gate quest:
// receipt declarations only. The shared runtime
// (scripts/quest-evidence-harness-runtime.js) re-runs each recorded proof
// command and writes the probe artifact.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'join-gate-carries-expected-cluster-id',
    testFile: 'test/bootstrap/cluster-identity-join-gate.test.js',
    detail: 'the bootstrap request carries expectedClusterId from the ' +
      'joiner delegates; a fresh joiner sends none (compatibility policy)',
  }),
  Object.freeze({
    id: 'join-gate-rejects-mismatch-terminal',
    testFile: 'test/bootstrap/cluster-identity-join-gate.test.js',
    detail: 'the seed-side admission owner refuses a foreign cluster id ' +
      'with the typed 409 CLUSTER_ID_MISMATCH rejection (terminal on the ' +
      'joiner via the existing conflict classification)',
  }),
  Object.freeze({
    id: 'join-gate-compatibility-policy-explicit',
    testFile: 'test/bootstrap/cluster-identity-join-gate.test.js',
    detail: 'a pre-identity joiner (no expectedClusterId) and a pre-identity ' +
      'seed are both handled by the explicit UNKNOWN compatibility policy, ' +
      'never silent acceptance as a match',
  }),
  Object.freeze({
    id: 'bootstrap-response-stamps-cluster-id',
    testFile: 'test/bootstrap/cluster-identity-join-gate.test.js',
    detail: 'the bootstrap response builder stamps the durable cluster ' +
      'identity (request-owner getClusterId delegate) so a pre-identity ' +
      'joiner learns it',
  }),
]);

const QUEST_ID = 'cluster-identity-join-gate';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME = 'cluster-identity-join-gate.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
