// Deterministic evidence harness for the seed-restart-recovery-mode-v2
// quest: receipt declarations only. The shared runtime
// (scripts/quest-evidence-harness-runtime.js) re-runs each recorded proof
// command and writes the probe artifact.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'seed-serving-requires-cluster-id-match',
    testFile: 'test/bootstrap/seed-restart-recovery-gate.test.js',
    detail: 'a durable seed without a confirmed cluster-id match refuses ' +
      'to serve even with quorum evidence and a reachable peer',
  }),
  Object.freeze({
    id: 'seed-serving-requires-quorum-or-peer-proof',
    testFile: 'test/bootstrap/seed-restart-recovery-gate.test.js',
    detail: 'a durable seed serves only with cluster-id match plus live ' +
      'peer contact OR durable quorum evidence',
  }),
  Object.freeze({
    id: 'isolated-stale-seed-refuses-to-serve',
    testFile: 'test/bootstrap/seed-restart-recovery-gate.test.js',
    detail: 'an isolated stale seed with no reachable current member and ' +
      'no durable quorum evidence fails closed SEED_RECOVERY_PROOF_MISSING',
  }),
  Object.freeze({
    id: 'persisted-role-alone-insufficient',
    testFile: 'test/bootstrap/seed-restart-recovery-gate.test.js',
    detail: 'a pre-identity persisted seed role (cluster-id UNKNOWN) is ' +
      'not proof; the seed refuses to serve purely on that role',
  }),
]);

const QUEST_ID = 'seed-restart-recovery-mode-v2';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME = 'seed-restart-recovery-mode-v2.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
