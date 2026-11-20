import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  DEFAULT_SOURCE_VERSION,
  DEFAULT_TARGET_VERSION,
  REQUIRED_DEPENDENCY_QUEST_IDS,
  REQUIRED_DRILL_IDS,
  SUPPORT_ENVELOPE_AVAILABILITY_OUTCOME,
  SUPPORT_ENVELOPE_DRILL_ID,
  SUPPORT_ENVELOPE_REASON_CODE,
  SupportEnvelopeOwner,
  buildSupportEnvelopeRecord,
  clusterFormatRevisionClaim,
  computeSupportEnvelopeDigest,
  resolveJoinSupportEnvelopeConflict,
  validateSupportEnvelopeRecord,
  validateVersionPairAdmission,
} from '../../src/bootstrap/owners/support-envelope-owner.js';
import {ManagementV1Owner} from '../../src/bootstrap/owners/management-v1-owner.js';
import {RollingUpgradeOwner} from '../../src/bootstrap/owners/rolling-upgrade-owner.js';
import {
  L4_ROLLING_UPGRADE_REASON_CODE,
  L4_UPGRADE_NODE_STEP,
  MANAGEMENT_OPERATION_KIND,
  MANAGEMENT_OPERATION_STATE,
  MANAGEMENT_V1_CONTRACT,
} from '../../src/bootstrap/owners/management-v1-constants.js';

// Real owner composition; only the declared drain/restart effect ports are
// observations. No physical upgrade or genuine execution admission is proved.
// Explicit synthetic inputs are negatives, never substitutes for a validator.
const SNAPSHOT = Object.freeze({
  nodeIds: ['node-1', 'node-2', 'node-3'],
  readyNodeIds: ['node-1', 'node-2', 'node-3'],
  underReplicatedPartitionCount: 0,
  hasPartitionQuorum: true,
});
const TARGET_ARTIFACT_DIGEST = `sha256:${'a'.repeat(64)}`;

function copiedSyntheticEnvelope(sourceVersion = DEFAULT_SOURCE_VERSION) {
  const record = JSON.parse(JSON.stringify(buildSupportEnvelopeRecord()));
  record.versionPair = {sourceVersion, targetVersion: DEFAULT_TARGET_VERSION};
  const drillDetails = {
    [SUPPORT_ENVELOPE_DRILL_ID.DOWNGRADE_ROLLBACK_BOUNDARY]: {
      preCutoffSucceeded: true,
      postCutoffRefusedWithCode: SUPPORT_ENVELOPE_REASON_CODE.ROLLBACK_CUTOFF_EXCEEDED,
    },
    [SUPPORT_ENVELOPE_DRILL_ID.ONE_NODE_FAILURE_RECOVERY]: {
      targetVersion: DEFAULT_TARGET_VERSION,
    },
    [SUPPORT_ENVELOPE_DRILL_ID.ROLLING_UPGRADE]: {
      sourceVersion, targetVersion: DEFAULT_TARGET_VERSION,
    },
    [SUPPORT_ENVELOPE_DRILL_ID.SERVICE_ARTIFACT_UPGRADE]: {
      artifactAbi: record.boundaries.artifactAbi, previousGenerationRetired: true,
    },
    [SUPPORT_ENVELOPE_DRILL_ID.WIPED_REPLICA_REBUILD]: {
      learnerCatchUpVerified: true, replicaBytesRebuilt: 1,
    },
  };
  // Explicitly supply false evidence so removing production defaults alone
  // cannot satisfy this witness. No original run/report/output exists here.
  record.drills = Object.fromEntries(REQUIRED_DRILL_IDS.map((drillId) => [
    drillId,
    {
      drillId,
      executed: true,
      lostAcknowledgedWrites: 0,
      availabilityOutcome: SUPPORT_ENVELOPE_AVAILABILITY_OUTCOME.CONTINUOUS,
      recoveryDurationMs: 1,
      ...drillDetails[drillId],
    },
  ]));
  record.dependencyReceipts = Object.fromEntries(REQUIRED_DEPENDENCY_QUEST_IDS
    .map((questId) => [questId, {
      questId, verified: true, receiptDigest: `sha256:${questId}-certified`,
    }]));
  record.envelopeDigest = computeSupportEnvelopeDigest(record);
  return record;
}

function observedPorts() {
  const effects = [];
  return {
    effects,
    ports: {
      onDrainNodeLeadership: (nodeId) => effects.push(['drain', nodeId]),
      onTriggerNodeRestart: (nodeId) => effects.push(['restart', nodeId]),
    },
  };
}

function observeUpgrade(owner, effects) {
  const parameters = {
    targetVersion: DEFAULT_TARGET_VERSION,
    targetArtifactDigest: TARGET_ARTIFACT_DIGEST,
  };
  const preflight = owner.evaluatePreflight(parameters, SNAPSHOT);
  // Invoke the effect-bearing entry too; a preflight-only assertion cannot
  // establish that startUpgrade uses the same admission decision.
  const operation = owner.startUpgrade({
    operationId: 'unmeasured-envelope-upgrade',
    parameters,
    clusterSnapshot: SNAPSHOT,
    nowMs: 1,
  });
  return {
    preflightOk: preflight.ok,
    preflightReason: preflight.reasonCode,
    state: operation.state,
    reason: operation.reasonCode,
    effects,
  };
}

function assertUpgradeRefused(observation) {
  assert.deepEqual(observation, {
    preflightOk: false,
    preflightReason: L4_ROLLING_UPGRADE_REASON_CODE.OUTSIDE_SUPPORT_ENVELOPE,
    state: MANAGEMENT_OPERATION_STATE.REJECTED,
    reason: L4_ROLLING_UPGRADE_REASON_CODE.OUTSIDE_SUPPORT_ENVELOPE,
    effects: [],
  });
}

test('SupportEnvelopeOwner preserves policy identity and same-build format admission', () => {
  const policy = buildSupportEnvelopeRecord();
  assert.deepEqual(policy.versionPair, {
    sourceVersion: DEFAULT_SOURCE_VERSION, targetVersion: DEFAULT_TARGET_VERSION,
  });
  assert.equal(computeSupportEnvelopeDigest(policy), policy.envelopeDigest);
  assert.equal(resolveJoinSupportEnvelopeConflict({
    nodeId: 'same-build-node', nodeAddress: 'same-build-address',
    carrier: clusterFormatRevisionClaim(),
  }), null);
  const absent = new SupportEnvelopeOwner().getManagementSummary();
  assert.equal(absent.valid, false);
  assert.deepEqual(absent.certifiedDrillIds, []);
  assert.equal(new ManagementV1Owner().supportEnvelope, null);
});

test('SupportEnvelopeOwner default record cannot establish physical certification', () => {
  const record = buildSupportEnvelopeRecord();
  const summary = new SupportEnvelopeOwner({envelope: record}).getManagementSummary();
  assert.deepEqual({
    valid: validateSupportEnvelopeRecord(record).valid,
    admitted: validateVersionPairAdmission(record, record.versionPair).admitted,
    certifiedDrillIds: summary.certifiedDrillIds,
  }, {valid: false, admitted: false, certifiedDrillIds: []});
});

test('SupportEnvelopeOwner rejects copied rehashed synthetic execution records', () => {
  const record = copiedSyntheticEnvelope();
  assert.equal(computeSupportEnvelopeDigest(record), record.envelopeDigest);
  const summary = new SupportEnvelopeOwner({envelope: record}).getManagementSummary();
  assert.deepEqual({
    valid: validateSupportEnvelopeRecord(record).valid,
    admitted: validateVersionPairAdmission(record, record.versionPair).admitted,
    certifiedDrillIds: summary.certifiedDrillIds,
  }, {valid: false, admitted: false, certifiedDrillIds: []});
});

test('SupportEnvelopeOwner invalid overall record exposes no certified drill IDs', () => {
  const record = copiedSyntheticEnvelope();
  record.envelopeDigest = 'corrupt-digest';
  const summary = new SupportEnvelopeOwner({envelope: record}).getManagementSummary();
  assert.equal(summary.valid, false);
  assert.deepEqual(summary.certifiedDrillIds, []);
});

test('RollingUpgradeOwner refuses default certification before drain or restart', () => {
  const {effects, ports} = observedPorts();
  const owner = new RollingUpgradeOwner({
    ...ports,
    currentVersion: DEFAULT_SOURCE_VERSION,
    supportEnvelope: buildSupportEnvelopeRecord(),
  });
  assert.equal(owner.capabilitySupported, true);
  assertUpgradeRefused(observeUpgrade(owner, effects));
});

test('ManagementV1Owner forwards no synthetic authority to rolling upgrade effects', () => {
  const {effects, ports} = observedPorts();
  // Management constructs the real rolling owner at its current release.
  // Matching that pair prevents unrelated version mismatch masking this red.
  const record = copiedSyntheticEnvelope(MANAGEMENT_V1_CONTRACT.DEFAULT_RELEASE_VERSION);
  const owner = new ManagementV1Owner({...ports, supportEnvelope: record});
  assert.equal(owner.rollingUpgradeOwner.capabilitySupported, true);
  assertUpgradeRefused(observeUpgrade(owner.rollingUpgradeOwner, effects));
});

const RECOVERY_PARAMETERS = Object.freeze({
  targetVersion: DEFAULT_TARGET_VERSION,
  targetArtifactDigest: TARGET_ARTIFACT_DIGEST,
});

function retainedUpgrade(supportBinding) {
  const operationId = 'retained-without-certified-evidence';
  const nodePlan = SNAPSHOT.nodeIds.map((nodeId, index) => ({
    nodeId, step: index === 0 ? L4_UPGRADE_NODE_STEP.COMPLETED : L4_UPGRADE_NODE_STEP.PENDING,
    targetVersion: DEFAULT_TARGET_VERSION,
    previousVersion: DEFAULT_SOURCE_VERSION,
    startedAtMs: 1,
    updatedAtMs: 1,
  }));
  return {
    currentVersion: DEFAULT_SOURCE_VERSION,
    currentArtifactDigest: MANAGEMENT_V1_CONTRACT.DEFAULT_ARTIFACT_DIGEST,
    activeOperation: {operationId, lagrangeOperationId: operationId,
      kind: MANAGEMENT_OPERATION_KIND.TRANSITION_RELEASE,
      state: MANAGEMENT_OPERATION_STATE.IN_PROGRESS, parameters: RECOVERY_PARAMETERS,
      supportBinding, nodePlan},
    nodePlan,
    currentNodeIndex: 1,
  };
}

test('rolling upgrade has one plan entry through the support admission owner', () => {
  const {effects, ports} = observedPorts();
  const owner = new RollingUpgradeOwner({...ports, currentVersion: DEFAULT_SOURCE_VERSION,
    supportEnvelopeOwner: new SupportEnvelopeOwner({envelope: copiedSyntheticEnvelope()})});
  // The predecessor exposes an effect-bearing alternate plan command.
  owner.initiatePlan?.('unqualified-direct-plan', null, RECOVERY_PARAMETERS, SNAPSHOT, 1);
  assert.deepEqual(effects, []);
  assert.equal(owner.getOperationStatus('unqualified-direct-plan'), null);
});

test('uncertified retained operations cannot drain the next node', () => {
  for (const binding of [undefined, {
    policyDigest: buildSupportEnvelopeRecord().envelopeDigest,
    sourceArtifactDigest: MANAGEMENT_V1_CONTRACT.DEFAULT_ARTIFACT_DIGEST,
    targetArtifactDigest: TARGET_ARTIFACT_DIGEST,
    nodeCount: SNAPSHOT.nodeIds.length,
    executionReferences: ['sha256:synthetic-reference'],
  }]) {
    const {effects, ports} = observedPorts();
    const retained = retainedUpgrade(binding);
    const owner = new RollingUpgradeOwner({...ports,
      currentVersion: retained.currentVersion,
      initialPersistedState: retained,
      supportEnvelopeOwner: new SupportEnvelopeOwner({envelope: copiedSyntheticEnvelope()}),
    });
    owner.beginNextNodeDrain(2, {quorumHealthy: true});
    assert.deepEqual(effects, []);
    assert.equal(owner.getActiveNode()?.step, L4_UPGRADE_NODE_STEP.PENDING);
    assert.equal(owner.getOperationStatus(retained.activeOperation.operationId)?.state,
      MANAGEMENT_OPERATION_STATE.IN_PROGRESS, 'the refused operation remains recoverable');
  }
});

test('uncertified retained catch-up cannot publish ready or certify success', () => {
  const retained = retainedUpgrade(undefined);
  retained.nodePlan[1].step = L4_UPGRADE_NODE_STEP.CATCHING_UP;
  const ready = [];
  const {ports} = observedPorts();
  const owner = new RollingUpgradeOwner({...ports,
    currentVersion: retained.currentVersion,
    initialPersistedState: retained,
    onSetNodeReadyz: (...args) => ready.push(args)});
  owner.completeNodeCatchUp('node-2', {nowMs: 2, quorumHealthy: true,
    underReplicatedPartitionCount: 0});
  assert.deepEqual(ready, []);
  assert.equal(owner.getActiveNode()?.step, L4_UPGRADE_NODE_STEP.CATCHING_UP);
});

test('an uncertified retained operation can still halt for observed quorum loss', () => {
  const retained = retainedUpgrade(undefined);
  const {effects, ports} = observedPorts();
  const owner = new RollingUpgradeOwner({...ports, initialPersistedState: retained});
  const failure = owner.beginNextNodeDrain(2, {quorumHealthy: false});
  assert.equal(failure.state, MANAGEMENT_OPERATION_STATE.FAILED);
  assert.equal(failure.reasonCode, L4_ROLLING_UPGRADE_REASON_CODE.QUORUM_SAFETY_HALT);
  assert.deepEqual(effects, []);
});
