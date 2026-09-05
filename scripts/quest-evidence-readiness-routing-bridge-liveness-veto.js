// Deterministic evidence harness for the readiness-routing-bridge-liveness-veto
// quest: receipt declarations only. The shared runtime
// (scripts/quest-evidence-harness-runtime.js) re-runs each recorded proof
// command and writes the probe artifact.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'V1-liveness-identity-vetoes-stale-positive-reuse',
    testFile:
      'test/control-plane/control-plane-readiness-service-getall-and-snapshot-cache.test.js',
    detail: 'a status or connection transition replaces the stored readiness ' +
      'evidence at once: last-known-good reuse is vetoed immediately after a ' +
      'semantic liveness change while refreshing in the background ' +
      '(red on d0516be76, green on the parent f95fccaf0)',
  }),
  Object.freeze({
    id: 'V2-routing-cache-lag-contract-holds',
    testFile: 'test/query/query-executor-build-sql-and-routability.test.js',
    detail: 'pure heartbeat/lease lag still bridges a regressed row until the ' +
      'ready lease expires',
  }),
  Object.freeze({
    id: 'V3-real-cache-heartbeat-window',
    testFile: 'test/control-plane/readiness-routing-heartbeat-window.test.js',
    detail: 'the real-cache heartbeat, publication, services, and load windows ' +
      'keep their fail-closed and bridged answers',
  }),
  Object.freeze({
    id: 'V4-stored-snapshot-persistence',
    testFile: 'test/control-plane/readiness-snapshot-persistence.test.js',
    detail: 'the stored readiness snapshot persistence contract is unchanged',
  }),
  Object.freeze({
    id: 'V5-identity-owner-pins',
    testFile: 'test/control-plane/readiness-planning-snapshot-identity-owner.test.js',
    detail: 'planning identity owner and build-rate pins are unchanged',
  }),
  Object.freeze({
    id: 'V6-sync-and-priority-recovery',
    testFile:
      'test/control-plane/control-plane-readiness-service-sync-and-priority-recovery.test.js',
    detail: 'planning reads still project current evidence; recovery grace ' +
      'closes on a newer epoch',
  }),
  Object.freeze({
    id: 'V7-live-seed-rebalance-converges',
    testFile: 'test/integration/three-node-seed-rebalance.integration.test.js',
    detail: 'the deterministic three-node seed rebalance witness converges',
  }),
]);

const QUEST_ID = 'readiness-routing-bridge-liveness-veto';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME = 'readiness-routing-bridge-liveness-veto.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
