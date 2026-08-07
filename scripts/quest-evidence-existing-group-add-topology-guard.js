// Deterministic evidence harness for the
// existing-group-add-topology-guard quest: receipt declarations only.
// The shared runtime (scripts/quest-evidence-harness-runtime.js) re-runs
// each recorded proof command and writes the probe artifact.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'self-only-cohort-add-deferred',
    testFile: 'test/rebalancer/existing-group-add-topology-guard.test.js',
    detail: 'an explicit ADD join into a NON-fresh partition that resolves ' +
      'to a self-only cohort (no dispatched hints, cache lag) throws the ' +
      'retryable join-topology-missing class — the existing transient-error ' +
      'classification routes it into the authoritative hydration retry loop ' +
      'exactly like the CL-013 REPLACE guard — instead of solo-bootstrapping ' +
      'an isolated raft group; the fresh-bootstrap window stays exempt for ' +
      'first-cohort formation (audit finding 8; red-on-revert: reverting ' +
      'the ADD arm of isExistingGroupJoin flips this test red)',
  }),
  Object.freeze({
    id: 'cohort-stamp-authoritative-read',
    testFile: 'test/rebalancer/existing-group-add-topology-guard.test.js',
    detail: 'coordinator cohort stamping (buildOperationBootstrapTopology) ' +
      'merges the same authoritative services-owner rows the create-time ' +
      'admission guard reads, so a standard-path ADD allocates the next ' +
      'canonical replica id and persists the full cohort even while the ' +
      'local cache lags the owner; the dead-leader branch (sibling peers, ' +
      'no viable leader -> existingReplicaCount 0) stays preserved for ' +
      'REPLACE and ADD (audit finding 8; red-on-revert: restoring the ' +
      'cache-only service-row read flips this test red)',
  }),
]);

const QUEST_ID = 'existing-group-add-topology-guard';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME = 'existing-group-add-topology-guard.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
