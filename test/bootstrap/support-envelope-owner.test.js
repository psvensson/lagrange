import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  DEFAULT_ROLLBACK_CUTOFF_PHASE,
  DEFAULT_SOURCE_VERSION,
  DEFAULT_TARGET_VERSION,
  REQUIRED_DEPENDENCY_QUEST_IDS,
  REQUIRED_DRILL_IDS,
  SUPPORT_ENVELOPE_AVAILABILITY_OUTCOME,
  SUPPORT_ENVELOPE_DRILL_ID,
  SUPPORT_ENVELOPE_REASON_CODE,
  SUPPORT_ENVELOPE_SCHEMA_VERSION,
  SupportEnvelopeOwner,
  buildSupportEnvelopeRecord,
  computeSupportEnvelopeDigest,
  evaluateRollbackEligibility,
  validateMixedVersionNodeAdmission,
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

  const valid = validateSupportEnvelopeRecord(record);
  assert.equal(valid.valid, true);
  assert.equal(valid.reasonCode, SUPPORT_ENVELOPE_REASON_CODE.OK);

  const rawJson = await fs.readFile(SUPPORT_ENVELOPE_JSON_PATH, 'utf8');
  const parsedDoc = JSON.parse(rawJson);
  const docValidation = validateSupportEnvelopeRecord(parsedDoc);
  assert.equal(docValidation.valid, true);
  assert.equal(docValidation.reasonCode, SUPPORT_ENVELOPE_REASON_CODE.OK);
});

test('Q12: version pair admission, rollback cutoff, and mixed-version peer admission', () => {
  const envelope = buildSupportEnvelopeRecord();

  const pairOk = validateVersionPairAdmission(envelope, {
    sourceVersion: DEFAULT_SOURCE_VERSION,
    targetVersion: DEFAULT_TARGET_VERSION,
  });
  assert.equal(pairOk.admitted, true);
  assert.equal(pairOk.reasonCode, SUPPORT_ENVELOPE_REASON_CODE.OK);

  const pairSkip = validateVersionPairAdmission(envelope, {
    sourceVersion: DEFAULT_SOURCE_VERSION,
    targetVersion: '0.6.0',
  });
  assert.equal(pairSkip.admitted, false);
  assert.equal(
    pairSkip.reasonCode,
    SUPPORT_ENVELOPE_REASON_CODE.OUTSIDE_SUPPORT_ENVELOPE,
  );

  const rollbackPre = evaluateRollbackEligibility(envelope, {
    currentPhase: DEFAULT_ROLLBACK_CUTOFF_PHASE,
    targetVersion: DEFAULT_SOURCE_VERSION,
  });
  assert.equal(rollbackPre.eligible, true);
  assert.equal(rollbackPre.reasonCode, SUPPORT_ENVELOPE_REASON_CODE.OK);

  const rollbackPost = evaluateRollbackEligibility(envelope, {
    currentPhase: 'TARGET_SCHEMA_FINALIZED',
    cutoffExceeded: true,
    targetVersion: DEFAULT_SOURCE_VERSION,
  });
  assert.equal(rollbackPost.eligible, false);
  assert.equal(
    rollbackPost.reasonCode,
    SUPPORT_ENVELOPE_REASON_CODE.ROLLBACK_CUTOFF_EXCEEDED,
  );
  assert.ok(rollbackPost.message.includes('rollback cutoff'));

  const rollbackWrongVersion = evaluateRollbackEligibility(envelope, {
    currentPhase: DEFAULT_ROLLBACK_CUTOFF_PHASE,
    targetVersion: '0.3.0',
  });
  assert.equal(rollbackWrongVersion.eligible, false);
  assert.equal(
    rollbackWrongVersion.reasonCode,
    SUPPORT_ENVELOPE_REASON_CODE.OUTSIDE_SUPPORT_ENVELOPE,
  );

  const peerOk = validateMixedVersionNodeAdmission(envelope, {
    localVersion: DEFAULT_SOURCE_VERSION,
    peerVersion: DEFAULT_TARGET_VERSION,
  });
  assert.equal(peerOk.admitted, true);
  assert.equal(peerOk.reasonCode, SUPPORT_ENVELOPE_REASON_CODE.OK);

  const peerOutside = validateMixedVersionNodeAdmission(envelope, {
    localVersion: DEFAULT_SOURCE_VERSION,
    peerVersion: '0.8.0',
  });
  assert.equal(peerOutside.admitted, false);
  assert.equal(
    peerOutside.reasonCode,
    SUPPORT_ENVELOPE_REASON_CODE.OUTSIDE_SUPPORT_ENVELOPE,
  );

  const peerSchemaBad = validateMixedVersionNodeAdmission(envelope, {
    localVersion: DEFAULT_SOURCE_VERSION,
    peerVersion: DEFAULT_TARGET_VERSION,
    schemaBoundaryCompatible: false,
  });
  assert.equal(peerSchemaBad.admitted, false);
  assert.equal(
    peerSchemaBad.reasonCode,
    SUPPORT_ENVELOPE_REASON_CODE.SCHEMA_BOUNDARY_INCOMPATIBLE,
  );
});

test('Q12: validateSupportEnvelopeRecord rejects data loss, missing drills, and exceeded bounds', () => {
  const base = buildSupportEnvelopeRecord();

  const tampered = {
    ...base,
    topologyEnvelope: {
      ...base.topologyEnvelope,
      minNodes: 5,
    },
  };
  const tamperedRes = validateSupportEnvelopeRecord(tampered);
  assert.equal(tamperedRes.valid, false);
  assert.equal(
    tamperedRes.reasonCodes.includes(
      SUPPORT_ENVELOPE_REASON_CODE.ENVELOPE_DIGEST_MISMATCH,
    ),
    true,
  );

  const dataLossRecord = buildSupportEnvelopeRecord({
    drills: {
      ...base.drills,
      [SUPPORT_ENVELOPE_DRILL_ID.ROLLING_UPGRADE]: {
        ...base.drills[SUPPORT_ENVELOPE_DRILL_ID.ROLLING_UPGRADE],
        lostAcknowledgedWrites: 1,
      },
    },
  });
  const dataLossRes = validateSupportEnvelopeRecord(dataLossRecord);
  assert.equal(dataLossRes.valid, false);
  assert.equal(
    dataLossRes.reasonCode,
    SUPPORT_ENVELOPE_REASON_CODE.ACKNOWLEDGED_DATA_LOSS_DETECTED,
  );

  const rebuildWindowExceeded = buildSupportEnvelopeRecord({
    drills: {
      ...base.drills,
      [SUPPORT_ENVELOPE_DRILL_ID.WIPED_REPLICA_REBUILD]: {
        ...base.drills[SUPPORT_ENVELOPE_DRILL_ID.WIPED_REPLICA_REBUILD],
        recoveryDurationMs: 999_999,
      },
    },
  });
  const windowRes = validateSupportEnvelopeRecord(rebuildWindowExceeded);
  assert.equal(windowRes.valid, false);
  assert.equal(
    windowRes.reasonCode,
    SUPPORT_ENVELOPE_REASON_CODE.REBUILD_WINDOW_EXCEEDED,
  );

  const replicaSizeExceeded = buildSupportEnvelopeRecord({
    drills: {
      ...base.drills,
      [SUPPORT_ENVELOPE_DRILL_ID.WIPED_REPLICA_REBUILD]: {
        ...base.drills[SUPPORT_ENVELOPE_DRILL_ID.WIPED_REPLICA_REBUILD],
        replicaBytesRebuilt: 9_999_999_999,
      },
    },
  });
  const sizeRes = validateSupportEnvelopeRecord(replicaSizeExceeded);
  assert.equal(sizeRes.valid, false);
  assert.equal(
    sizeRes.reasonCode,
    SUPPORT_ENVELOPE_REASON_CODE.REPLICA_SIZE_EXCEEDS_ENVELOPE,
  );

  const missingDepRecord = buildSupportEnvelopeRecord({
    dependencyReceipts: {
      ...base.dependencyReceipts,
      'public-path-scale-and-failure-certification': {
        questId: 'public-path-scale-and-failure-certification',
        receiptDigest: '',
        verified: false,
      },
    },
  });
  const depRes = validateSupportEnvelopeRecord(missingDepRecord);
  assert.equal(depRes.valid, false);
  assert.equal(
    depRes.reasonCode,
    SUPPORT_ENVELOPE_REASON_CODE.MISSING_DEPENDENCY_RECEIPT,
  );
});

test('Q12: full scenario executes all 5 certified drills, BYOC backup/restore, and join admission', async () => {
  assert.equal(
    PILOT_CERTIFICATION_SCENARIO_MATRIX.some(
      (entry) => entry.name === SCENARIO_NAME,
    ),
    true,
  );

  const clusterStub = {};
  const report = await runSupportedUpgradeAndRecoveryScenario(clusterStub);
  assert.equal(report.validation.valid, true);
  assert.equal(report.validation.reasonCode, SUPPORT_ENVELOPE_REASON_CODE.OK);
  assert.equal(report.byocBackupRestore.backupSucceeded, true);
  assert.equal(report.byocBackupRestore.restoreSucceeded, true);
  assert.equal(report.byocBackupRestore.factsExposeSupportEnvelope, true);
  assert.equal(report.byocBackupRestore.hydratedPartitionCount, 2);
  assert.equal(report.joinHandshake.admittedWithinEnvelope, true);
  assert.equal(
    report.joinHandshake.refusedOutsideEnvelopeCode,
    SUPPORT_ENVELOPE_REASON_CODE.OUTSIDE_SUPPORT_ENVELOPE,
  );

  for (const drillId of REQUIRED_DRILL_IDS) {
    const drill = report.envelope.drills[drillId];
    assert.ok(drill, `expected drill ${drillId} receipt`);
    assert.equal(drill.executed, true);
    assert.equal(drill.lostAcknowledgedWrites, 0);
  }

  const owner = new SupportEnvelopeOwner({envelope: report.envelope});
  const summary = owner.getManagementSummary();
  assert.equal(summary.valid, true);
  assert.equal(summary.certifiedDrillIds.length, 5);
});
