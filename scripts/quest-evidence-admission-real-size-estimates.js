// Deterministic evidence harness for the admission-real-size-estimates
// quest: receipt declarations only. The shared runtime
// (scripts/quest-evidence-harness-runtime.js) re-runs each recorded proof
// command and writes the probe artifact.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'all-call-sites-real-size',
    testFile: 'test/rebalancer/admission-real-size-estimates.test.js',
    detail: 'all three estimateReplicaBytes call sites size on the ' +
      'partition\'s REAL size_bytes instead of the sizeBytes: 0 ' +
      'placeholder: MovePlanner capacity filtering (via the injected ' +
      'sizeBytesResolver), provisioning admission evaluation (via the ' +
      'resolvedEntitySizeBytes threaded from operation creation), and ' +
      'reservation creation (same resolved estimate). Red-on-revert: ' +
      'reverting any one call site to sizeBytes: 0 fails this suite ' +
      '(verified per site during the attempt)',
  }),
  Object.freeze({
    id: 'admission-reservation-single-estimate',
    testFile: 'test/rebalancer/admission-real-size-estimates.test.js',
    detail: 'the persisted storage_reservations.estimated_bytes equals ' +
      'the admission-time estimatedBytes exactly: operation creation ' +
      'resolves the real partition size_bytes ONCE and threads the same ' +
      'resolved estimate into ensureProvisioningAdmissionAllowed and ' +
      'createReservationForOperation, so the reservation row is the ' +
      'single durable admission witness (no witness table; ' +
      'amplification_factor column semantics unchanged)',
  }),
  Object.freeze({
    id: 'suites-green',
    testFile: 'test/rebalancer/coordinator-reservation-lifecycle.test.js',
    detail: 'the pre-existing reservation lifecycle suite stays green ' +
      'with real-size estimates threaded (extended with two real-size ' +
      'witness assertions); provisioning-admission-policy and ' +
      'rebalance-coordinator-facade-compatibility suites updated for ' +
      'the estimateProvisioningAdmissionBytes signature gain',
  }),
]);

const QUEST_ID = 'admission-real-size-estimates';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME = 'admission-real-size-estimates.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
