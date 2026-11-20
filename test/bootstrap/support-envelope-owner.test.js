import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {inspectSupportEnvelopeSourceExecution} from
  '../../scripts/quest-evidence/support-envelope-execution.js';

import {
  DEFAULT_ROLLBACK_CUTOFF_PHASE,
  DEFAULT_SOURCE_VERSION,
  DEFAULT_TARGET_VERSION,
  REQUIRED_DEPENDENCY_QUEST_IDS,
  REQUIRED_DRILL_IDS,
  SUPPORT_ENVELOPE_AVAILABILITY_OUTCOME,
  SUPPORT_ENVELOPE_REASON_CODE,
  SUPPORT_ENVELOPE_SCHEMA_VERSION,
  SupportEnvelopeOwner,
  buildSupportEnvelopeRecord,
  computeSupportEnvelopeDigest,
  evaluateRollbackEligibility,
  validateMixedVersionNodeAdmission,
  validateSupportEnvelopePolicy,
  validateSupportEnvelopeRecord,
  validateVersionPairAdmission,
} from '../../src/bootstrap/owners/support-envelope-owner.js';
import {
  PILOT_CERTIFICATION_SCENARIO_MATRIX,
} from '../distributed/harness/scenario-registry.js';
import {
  SCENARIO_NAME,
  run as runSupportedUpgradeAndRecoveryScenario,
} from '../distributed/scenarios/supported-upgrade-and-recovery-envelope.js';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, '../..');
const SUPPORT_ENVELOPE_JSON_PATH = path.join(
  REPO_ROOT,
  'docs/support-envelope.json',
);

test('Q12: SupportEnvelopeOwner contract, constants, and digest verification', async () => {
  assert.equal(SUPPORT_ENVELOPE_SCHEMA_VERSION, 1);
  assert.equal(REQUIRED_DRILL_IDS.length, 5);
  assert.equal(REQUIRED_DEPENDENCY_QUEST_IDS.length, 5);
  assert.equal(
    SUPPORT_ENVELOPE_AVAILABILITY_OUTCOME.CONTINUOUS,
    'CONTINUOUS',
  );
  assert.equal(
    SUPPORT_ENVELOPE_AVAILABILITY_OUTCOME.BOUNDED_DEGRADATION,
    'BOUNDED_DEGRADATION',
  );
  assert.equal(
    SUPPORT_ENVELOPE_AVAILABILITY_OUTCOME.BOUNDED_UNAVAILABILITY,
    'BOUNDED_UNAVAILABILITY',
  );

  const record = buildSupportEnvelopeRecord();
  const digest = computeSupportEnvelopeDigest(record);
  assert.equal(digest, record.envelopeDigest);

  assert.equal(validateSupportEnvelopePolicy(record).valid, true);
  assert.equal(validateSupportEnvelopeRecord(record).evidenceReasonCode,
    SUPPORT_ENVELOPE_REASON_CODE.PHYSICAL_EXECUTION_EVIDENCE_UNAVAILABLE);

  const parsedDoc = JSON.parse(await fs.readFile(SUPPORT_ENVELOPE_JSON_PATH, 'utf8'));
  assert.deepEqual(parsedDoc, record);
  assert.equal(validateSupportEnvelopePolicy(parsedDoc).valid, true);
  assert.equal(validateSupportEnvelopeRecord(parsedDoc).valid, false);
});

test('support policy applies exact pair, rollback cutoff and mixed-version boundaries', () => {
  const envelope = buildSupportEnvelopeRecord();
  const outside = SUPPORT_ENVELOPE_REASON_CODE.OUTSIDE_SUPPORT_ENVELOPE;
  const evidenceUnavailable = SUPPORT_ENVELOPE_REASON_CODE.PHYSICAL_EXECUTION_EVIDENCE_UNAVAILABLE;
  const cutoffExceeded = SUPPORT_ENVELOPE_REASON_CODE.ROLLBACK_CUTOFF_EXCEEDED;

  for (const [targetVersion, reason] of [[DEFAULT_TARGET_VERSION, evidenceUnavailable],
    ['0.6.0', outside]]) {
    assert.equal(validateVersionPairAdmission(envelope, {
      sourceVersion: DEFAULT_SOURCE_VERSION, targetVersion,
    }).reasonCode, reason);
  }

  for (const [currentPhase, targetVersion, reason] of [
    [DEFAULT_ROLLBACK_CUTOFF_PHASE, DEFAULT_SOURCE_VERSION, evidenceUnavailable],
    ['TARGET_SCHEMA_FINALIZED', DEFAULT_SOURCE_VERSION, cutoffExceeded],
    [DEFAULT_ROLLBACK_CUTOFF_PHASE, '0.3.0', outside],
  ]) {
    const rollback = evaluateRollbackEligibility(envelope, {currentPhase, targetVersion});
    assert.equal(rollback.eligible, false);
    assert.equal(rollback.reasonCode, reason);
  }

  for (const [peerVersion, schemaBoundaryCompatible, reason] of [
    [DEFAULT_TARGET_VERSION, true, evidenceUnavailable],
    ['0.8.0', true, outside],
    [DEFAULT_TARGET_VERSION, false, SUPPORT_ENVELOPE_REASON_CODE.SCHEMA_BOUNDARY_INCOMPATIBLE],
  ]) {
    const join = validateMixedVersionNodeAdmission(envelope, {
      localVersion: DEFAULT_SOURCE_VERSION, peerVersion, schemaBoundaryCompatible,
    });
    assert.equal(join.admitted, false);
    assert.equal(join.reasonCode, reason);
  }
});

test('support policy refuses tampering, invalid bounds and added assertions', () => {
  const envelope = buildSupportEnvelopeRecord();
  const altered = {...envelope, topologyEnvelope: {...envelope.topologyEnvelope, minNodes: 5}};
  assert.ok(validateSupportEnvelopePolicy(altered).reasonCodes.includes(
    SUPPORT_ENVELOPE_REASON_CODE.ENVELOPE_DIGEST_MISMATCH));
  assert.equal(validateSupportEnvelopePolicy(buildSupportEnvelopeRecord({
    topologyEnvelope: {replicationFactor: 0},
  })).valid, false);
  assert.equal(validateSupportEnvelopePolicy(buildSupportEnvelopeRecord({
    rebuildEnvelope: {maxReplicaBytes: -1},
  })).valid, false);
  const forged = {...envelope, drills: {rolling_upgrade: {executed: true}}};
  forged.envelopeDigest = computeSupportEnvelopeDigest(forged);
  assert.equal(validateSupportEnvelopePolicy(forged).valid, false);
  assert.equal(validateSupportEnvelopeRecord(forged).evidenceReasonCode,
    SUPPORT_ENVELOPE_REASON_CODE.UNADMITTED_EXECUTION_ASSERTIONS);

  const owner = new SupportEnvelopeOwner({envelope});
  envelope.versionPair.targetVersion = '0.6.0';
  const summary = owner.getManagementSummary();
  summary.versionPair.targetVersion = '0.7.0';
  assert.equal(owner.getManagementSummary().versionPair.targetVersion, DEFAULT_TARGET_VERSION);
});

test('policy simulation checks refusal, in-memory restore and join without certifying drills',
  async () => {
    assert.equal(PILOT_CERTIFICATION_SCENARIO_MATRIX.some(
      (entry) => entry.name === SCENARIO_NAME), false);
    const clusterStub = {};
    const report = await runSupportedUpgradeAndRecoveryScenario(clusterStub);
    assert.equal(clusterStub.reportDetail, report);
    assert.equal(report.managementSummary.policyValid, true);
    assert.equal(report.managementSummary.valid, false);
    assert.deepEqual(report.managementSummary.certifiedDrillIds, []);
    assert.equal(report.upgradeRefusal.reasonCode, SUPPORT_ENVELOPE_REASON_CODE.OUTSIDE_SUPPORT_ENVELOPE);
    assert.equal(report.byocBackupRestore.backupSucceeded, true);
    assert.equal(report.byocBackupRestore.restoreSucceeded, true);
    assert.equal(report.byocBackupRestore.factsExposeSupportEnvelope, true);
    assert.equal(report.byocBackupRestore.hydratedPartitionCount, 2);
    assert.equal(report.joinHandshake.admittedWithinEnvelope, true);
    assert.equal(report.joinHandshake.refusedOutsideEnvelopeCode,
      SUPPORT_ENVELOPE_REASON_CODE.OUTSIDE_SUPPORT_ENVELOPE);
  });

test('source execution inspection refuses a fabricated verdict or physical scope', () => {
  const asserted = {passed: true, certified: true, scope: 'PHYSICAL_UPGRADE_AND_RECOVERY'};
  const missing = inspectSupportEnvelopeSourceExecution(REPO_ROOT, asserted);
  assert.equal(missing.outcome, 'UNAVAILABLE');
  assert.equal(missing.physicalEvidence, 'UNAVAILABLE');
  const forged = inspectSupportEnvelopeSourceExecution(REPO_ROOT, {...asserted, originals: {}});
  assert.equal(forged.outcome, 'REFUSED');
  assert.equal(forged.physicalEvidence, 'UNAVAILABLE');
});
