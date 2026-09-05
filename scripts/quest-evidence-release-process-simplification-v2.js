// Deterministic evidence harness for the release-process-simplification
// process quest: receipt declarations only. The shared runtime
// (scripts/quest-evidence-harness-runtime.js) re-runs each recorded proof
// command and writes the probe artifact.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'D5-formation-verdict-causal-chain',
    testFile: 'test/runtime/movielens-formation-verdict.test.js',
    detail: 'the seed log plus admission evidence derive one verdict whose ' +
      'causal chain names seed starvation, incomplete ready leases, the ' +
      'last OBSERVED critical spread and the admission end state; a ' +
      'missing seed log is UNKNOWN never PASS; the budget scales with the ' +
      'machine factor',
  }),
  Object.freeze({
    id: 'D5-live-report-carries-the-verdict',
    testFile: 'test/runtime/movielens-live-report-formation-verdict.test.js',
    detail: 'the live report carries formation timing and the verdict at ' +
      'both levels and a formation-only run reports under its own scenario',
  }),
  Object.freeze({
    id: 'D5-formation-health-trend',
    testFile: 'test/scripts/formation-health.test.js',
    detail: 'one compact record per run appended durably, a red formation ' +
      'is a red run, the summary renders the pass rate without running',
  }),
  Object.freeze({
    id: 'D6-local-seed-budget-gate',
    testFile: 'test/scripts/run-formation-seed-budget.test.js',
    detail: 'the gate runs the formation-only demo behind the thermal gate, ' +
      'reads the newest formation-only report only, and is red for a ' +
      'missing report, a non-PASS verdict or a starved seed',
  }),
  Object.freeze({
    id: 'D2-release-preflight-facts',
    testFile: 'test/scripts/release-preflight.test.js',
    detail: 'five facts each block alone, READY prints the exact tag ' +
      'commands, gathering reads git and gh only and never tags',
  }),
  Object.freeze({
    id: 'D1-release-notes-still-gate-the-tag',
    testFile: 'test/scripts/release-notes.test.js',
    detail: 'the changelog section check the tag workflow runs is unchanged',
  }),
  Object.freeze({
    id: 'D2-command-index-names-the-new-surface',
    testFile: 'test/scripts/list-commands.test.js',
    detail: 'the curated command index and its sidecar describe the ' +
      'preflight, the formation gate and the health trend',
  }),
]);

const QUEST_ID = 'release-process-simplification-v2';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME = `${QUEST_ID}.receipt.json`;

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
