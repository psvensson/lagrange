/**
 * Scenario: supported-upgrade-and-recovery-envelope
 *
 * Policy/refusal simulation, an in-memory backup/restore exercise, and a
 * same-format join check. This scenario has no certification topology
 * declaration because it runs no physical upgrade or recovery drills.
 */

import assert from 'node:assert/strict';
import {
  DEFAULT_SOURCE_VERSION,
  DEFAULT_TARGET_VERSION,
  SUPPORT_ENVELOPE_REASON_CODE,
  SupportEnvelopeOwner,
  buildSupportEnvelopeRecord,
  clusterFormatRevisionClaim,
} from '../../../src/bootstrap/owners/support-envelope-owner.js';
import {
  RollingUpgradeOwner,
} from '../../../src/bootstrap/owners/rolling-upgrade-owner.js';
import {
  ManagementV1Owner,
} from '../../../src/bootstrap/owners/management-v1-owner.js';
import {MemoryBackupStorageAdapter} from '../../helpers/management-v1-memory-storage-adapter.js';
import {
  BootstrapJoinAdmissionOwner,
} from '../../../src/bootstrap/owners/bootstrap-join-admission-owner.js';
import {
  L4_ROLLING_UPGRADE_REASON_CODE,
  MANAGEMENT_OPERATION_STATE,
} from '../../../src/bootstrap/owners/management-v1-constants.js';

const SCENARIO_NAME = 'supported-upgrade-and-recovery-envelope';
const ZERO = 0;
const DEFAULT_CLUSTER_NODES = Object.freeze([
  'node-1',
  'node-2',
  'node-3',
]);
const SIMULATED_ARTIFACT_DIGEST =
  'sha256:0500000000000000000000000000000000000000000000000000000000000500';
const SEED_NODE_UUID = '00000000-0000-4000-8000-000000000001';
const PEER_NODE_UUID = '00000000-0000-4000-8000-000000000002';

function observeUpgradeRefusal(supportEnvelopeOwner) {
  const effects = [];
  const owner = new RollingUpgradeOwner({
    currentVersion: DEFAULT_SOURCE_VERSION,
    onDrainNodeLeadership: (nodeId) => effects.push(nodeId),
    onTriggerNodeRestart: (nodeId) => effects.push(nodeId),
    supportEnvelopeOwner,
  });
  const operation = owner.startUpgrade({
    clusterSnapshot: {
      hasPartitionQuorum: true,
      nodeIds: [...DEFAULT_CLUSTER_NODES],
      readyNodeIds: [...DEFAULT_CLUSTER_NODES],
      underReplicatedPartitionCount: ZERO,
    },
    nowMs: 1000,
    operationId: 'op-q12-policy-only',
    parameters: {
      targetArtifactDigest: SIMULATED_ARTIFACT_DIGEST,
      targetVersion: DEFAULT_TARGET_VERSION,
    },
  });
  assert.equal(operation.state, MANAGEMENT_OPERATION_STATE.REJECTED);
  assert.equal(operation.reasonCode, L4_ROLLING_UPGRADE_REASON_CODE.OUTSIDE_SUPPORT_ENVELOPE);
  assert.deepEqual(effects, []);
  const postCutoff = owner.executeRollback({
    currentPhase: 'TARGET_SCHEMA_FINALIZED',
    cutoffExceeded: true,
    targetVersion: DEFAULT_SOURCE_VERSION,
  });
  assert.equal(postCutoff.reasonCode, SUPPORT_ENVELOPE_REASON_CODE.ROLLBACK_CUTOFF_EXCEEDED);
  return {reasonCode: operation.reasonCode, postCutoffReasonCode: postCutoff.reasonCode};
}

async function executeByocPartitionBackupRestoreProof(supportEnvelopeOwner) {
  const livePartitions = [
    {
      partitionId: 101,
      payload: JSON.stringify({accountCount: 5, rows: 80, table: 'orders'}),
      raftLogIndex: 2048,
      raftTerm: 4,
    },
    {
      partitionId: 102,
      payload: JSON.stringify({accountCount: 5, rows: 80, table: 'orders'}),
      raftLogIndex: 2052,
      raftTerm: 4,
    },
  ];
  let hydratedSnapshot = null;
  // Backup storage is injected explicitly through the owner's declared
  // storageAdapter port: production composition installs none.
  const mgmt = new ManagementV1Owner({
    clusterId: 'lagrange-cluster-q12',
    exportPartitionSnapshots: () => livePartitions,
    hydratePartitionSnapshots: (partitions) => {
      hydratedSnapshot = partitions;
    },
    onDecommissionNode: () => {},
    onDrainNodeLeadership: () => {},
    onTriggerNodeRestart: () => {},
    storageAdapter: new MemoryBackupStorageAdapter(),
    supportEnvelopeOwner,
  });
  const backupStatus = await mgmt.backupRestoreOwner.createBackup({
    clusterSnapshot: {hasPartitionQuorum: true, ready: true},
    operationId: 'op-q12-backup-0001',
    parameters: {
      backupId: 'bkp-q12-simulation',
      destinationUri: 'memory://q12-byoc/backup-1',
    },
  });
  assert.equal(backupStatus.state, MANAGEMENT_OPERATION_STATE.SUCCEEDED);

  const restoreStatus = await mgmt.backupRestoreOwner.restoreFromBackup({
    destinationUri: 'memory://q12-byoc/backup-1',
  });
  assert.equal(restoreStatus.success, true);
  assert.ok(Array.isArray(hydratedSnapshot));
  assert.equal(hydratedSnapshot.length, livePartitions.length);

  const facts = mgmt.getClusterFacts();
  return {
    backupSucceeded: backupStatus.state === MANAGEMENT_OPERATION_STATE.SUCCEEDED,
    factsExposeSupportEnvelope: Boolean(facts.facts.supportEnvelope),
    hydratedPartitionCount: hydratedSnapshot.length,
    restoreSucceeded: restoreStatus.success === true,
  };
}

// Join admission is keyed on the cluster format revision the joiner's
// request carries (the release version fence), not on a release version.
async function executeJoinHandshakeAdmissionProof() {
  const joinOwner = new BootstrapJoinAdmissionOwner({
    delegates: {
      getClusterId: () => 'lagrange-cluster-q12',
      getSeedNodeAddress: () => '10.0.0.1:9000',
      getSeedNodeId: () => SEED_NODE_UUID,
      getSystemTableCache: () => ({
        get: () => null,
        getAll: () => [],
      }),
    },
  });
  const allowedConflict = await joinOwner.checkForConflicts(
    PEER_NODE_UUID,
    '10.0.0.2:9000',
    {clusterFormatClaim: clusterFormatRevisionClaim()},
  );
  assert.equal(allowedConflict, null);

  const refusedConflict = await joinOwner.checkForConflicts(
    PEER_NODE_UUID,
    '10.0.0.2:9000',
    {clusterFormatClaim: {}},
  );
  assert.equal(
    refusedConflict?.reasonCode,
    SUPPORT_ENVELOPE_REASON_CODE.OUTSIDE_SUPPORT_ENVELOPE,
  );
  return {
    admittedWithinEnvelope: allowedConflict === null,
    refusedOutsideEnvelopeCode: refusedConflict?.reasonCode || null,
  };
}

async function runSupportedUpgradeAndRecoveryScenario(cluster = null) {
  const policy = buildSupportEnvelopeRecord();
  const owner = new SupportEnvelopeOwner({envelope: policy});
  const report = {
    byocBackupRestore: await executeByocPartitionBackupRestoreProof(owner),
    joinHandshake: await executeJoinHandshakeAdmissionProof(),
    managementSummary: owner.getManagementSummary(),
    policy,
    scenarioName: SCENARIO_NAME,
    upgradeRefusal: observeUpgradeRefusal(owner),
  };
  if (cluster && typeof cluster === 'object') {
    cluster.reportDetail = report;
  }
  return report;
}

export async function run(cluster = null) {
  return runSupportedUpgradeAndRecoveryScenario(cluster);
}

export {SCENARIO_NAME};
