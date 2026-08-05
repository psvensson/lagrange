// Deterministic evidence harness for the
// durable-withdrawal-cleanup-intent-v2 quest: receipt declarations only.
// The shared runtime (scripts/quest-evidence-harness-runtime.js) re-runs
// each recorded proof command and writes the probe artifact.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'withdrawal-intent-durable-across-teardown',
    testFile: 'test/control-plane/lease-sweep-stale-row-reaper.test.js',
    detail: 'the withdrawal outcome survives teardown in effect: a ' +
      'failed-join row the in-memory reconcile queue never drove to ' +
      'STOPPED is driven terminal by the leader-side reaper, so the ' +
      'withdrawal no longer depends on the destroyed queue (the ' +
      'explicit-choice Solver finding records lease-expiry-plus-reaper ' +
      'as the designed fallback)',
  }),
  Object.freeze({
    id: 'lease-expiry-fallback-explicit',
    testFile: 'test/control-plane/lease-sweep-stale-row-reaper.test.js',
    detail: 'lease-expiry is the explicit designed fallback: the reaper ' +
      'complements the lease sweep (never reaping a row with a live ' +
      'lease or live transport) and drives the terminal status the sweep ' +
      'intentionally does not',
  }),
  Object.freeze({
    id: 'reaper-drives-status-to-stopped',
    testFile: 'test/control-plane/lease-sweep-stale-row-reaper.test.js',
    detail: 'a stranded joining row with no live lease and no live ' +
      'transport is driven to status=stopped, guarded on the observed ' +
      'joining status',
  }),
  Object.freeze({
    id: 'reaper-reaps-endpoint-rows',
    testFile: 'test/control-plane/lease-sweep-stale-row-reaper.test.js',
    detail: 'the reaper reaps the stranded row\'s node_endpoints ' +
      '(inactive) and service_endpoints (unhealthy) rows so leftovers ' +
      'are stale rows, not live routing targets',
  }),
]);

const QUEST_ID = 'durable-withdrawal-cleanup-intent-v2';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME =
  'durable-withdrawal-cleanup-intent-v2.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
