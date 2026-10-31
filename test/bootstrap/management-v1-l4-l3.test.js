import Fastify from 'fastify';
import {test} from '../../src/test-helpers/tap.js';
import {
  ACTIVE_MANAGEMENT_OPERATION_STATES, ALLOWED_MANAGEMENT_OPERATION_KINDS,
  BACKUP_MANIFEST_CONSTANTS, CLUSTER_FACTS_CONSTANTS, FORBIDDEN_MANAGEMENT_OPERATION_KINDS,
  L3_BACKUP_RESTORE_REASON_CODE, L4_ROLLING_UPGRADE_REASON_CODE, L4_UPGRADE_NODE_STEP,
  L6_DECOMMISSION_REASON_CODE, MANAGEMENT_ERROR_CODE, MANAGEMENT_OPERATION_KIND,
  MANAGEMENT_OPERATION_STATE, MANAGEMENT_V1_CONTRACT, MANAGEMENT_V1_ROUTE,
  TERMINAL_MANAGEMENT_OPERATION_STATES,
} from '../../src/bootstrap/owners/management-v1-constants.js';
import {RollingUpgradeOwner} from '../../src/bootstrap/owners/rolling-upgrade-owner.js';
import {BackupRestoreOwner} from '../../src/bootstrap/owners/backup-restore-owner.js';
import {
  computeCanonicalOperationDigest, failValidation,
  isBoundedString, validateManagementV1OperationRequest,
} from '../../src/bootstrap/owners/management-v1-request-validator.js';
import {
  ManagementV1Owner,
  computeCanonicalOperationDigest as ownerComputeDigest,
  validateManagementV1OperationRequest as ownerValidateRequest,
} from '../../src/bootstrap/owners/management-v1-owner.js';

const C = MANAGEMENT_V1_CONTRACT;
let opSeq = 1;
function makeEnv(kind, params, overrides = {}) {
  opSeq += 1;
  const env = {
    schemaVersion: C.SCHEMA_VERSION, sourceContract: C.SOURCE_CONTRACT,
    sourceContractVersion: C.SOURCE_CONTRACT_VERSION, protocolVersion: C.PROTOCOL_VERSION,
    capabilityVersion: C.CAPABILITY_VERSION, clusterId: 'lagrange-cluster-primary',
    operationId: `op-${String(opSeq).padStart(4, '0')}-${'a'.repeat(20)}`,
    kind, parameters: params, sequence: opSeq, createdAtMs: 1000 + opSeq,
    expiresAtMs: 2000 + opSeq, requestedBy: 'operator-tap', ...overrides,
  };
  env.requestDigest = computeCanonicalOperationDigest(env);
  return env;
}

test('Constants, reason codes, contracts, and validator helpers', async (t) => {
  t.ok(Array.isArray(ACTIVE_MANAGEMENT_OPERATION_STATES) &&
    Array.isArray(ALLOWED_MANAGEMENT_OPERATION_KINDS) &&
    Array.isArray(FORBIDDEN_MANAGEMENT_OPERATION_KINDS) &&
    Array.isArray(TERMINAL_MANAGEMENT_OPERATION_STATES));
  t.ok(BACKUP_MANIFEST_CONSTANTS.MANIFEST_FILENAME &&
    CLUSTER_FACTS_CONSTANTS.COMPLETENESS_COMPLETE &&
    L4_UPGRADE_NODE_STEP.COMPLETED && MANAGEMENT_ERROR_CODE.OPERATION_CONFLICT &&
    MANAGEMENT_OPERATION_KIND.TRANSITION_RELEASE && MANAGEMENT_OPERATION_STATE.SUCCEEDED &&
    C.SOURCE_CONTRACT && MANAGEMENT_V1_ROUTE.FACTS);

  for (const [obj, len] of [
    [L4_ROLLING_UPGRADE_REASON_CODE, 10],
    [L3_BACKUP_RESTORE_REASON_CODE, 10],
    [L6_DECOMMISSION_REASON_CODE, 9],
  ]) {
    t.equal(Object.keys(obj).length, len);
    for (const k of Object.keys(obj)) t.equal(obj[k], k);
  }

  t.ok(isBoundedString('valid', 1, 10) && !isBoundedString('', 1, 10) &&
    !isBoundedString('too-long-text', 1, 5) && !isBoundedString(null, 1, 5));

  t.throws(
    () => failValidation(MANAGEMENT_ERROR_CODE.OPERATION_VALUE_INVALID),
    /OPERATION_VALUE_INVALID/,
  );
  t.equal(ownerComputeDigest, computeCanonicalOperationDigest);
  t.equal(ownerValidateRequest, validateManagementV1OperationRequest);
});

test('L4 Rolling Upgrade: 10 reason codes, 3-node upgrade and recovery', async (t) => {
  const snap = {nodeIds: ['node-1', 'node-2'], readyNodeIds: ['node-1', 'node-2']};
  const dSha = 'sha256:05000000000000000000000000000000';
  const p = {targetVersion: '0.5.0', targetArtifactDigest: dSha};

  for (const [fn, code] of [
    [() => new RollingUpgradeOwner({capabilitySupported: false}).evaluatePreflight(p, snap),
      L4_ROLLING_UPGRADE_REASON_CODE.UPGRADE_CAPABILITY_UNSUPPORTED],
    [() => new RollingUpgradeOwner().evaluatePreflight(p, {...snap, hasActiveOperation: true}),
      L4_ROLLING_UPGRADE_REASON_CODE.CONCURRENT_OPERATION_ACTIVE],
    [() => new RollingUpgradeOwner().evaluatePreflight({targetVersion: '0.3.0'}, snap),
      L4_ROLLING_UPGRADE_REASON_CODE.RELEASE_VERSION_INCOMPATIBLE],
    [() => new RollingUpgradeOwner({expectedArtifactDigests: {'0.5.0': 'sha256:different'}})
      .evaluatePreflight(p, snap), L4_ROLLING_UPGRADE_REASON_CODE.ARTIFACT_DIGEST_MISMATCH],
    [() => new RollingUpgradeOwner().evaluatePreflight(p, {...snap, ready: false}),
      L4_ROLLING_UPGRADE_REASON_CODE.CLUSTER_NOT_READY],
    [() => new RollingUpgradeOwner().evaluatePreflight(
      p, {...snap, underReplicatedPartitionCount: 1}),
    L4_ROLLING_UPGRADE_REASON_CODE.UNDER_REPLICATED_PARTITIONS],
    [() => new RollingUpgradeOwner().evaluatePreflight(
      p, {...snap, capacityState: CLUSTER_FACTS_CONSTANTS.CAPACITY_PRESSURED}),
    L4_ROLLING_UPGRADE_REASON_CODE.STORAGE_CAPACITY_PRESSURED],
  ]) {
    t.equal(fn().reasonCode, code);
  }

  const toOwner = new RollingUpgradeOwner({nodeUpgradeTimeoutMs: 50});
  toOwner.startUpgrade({operationId: 'op-to-1', parameters: p, clusterSnapshot: snap, nowMs: 100});
  t.equal(toOwner.checkTimeoutsAndSafety({nowMs: 200}).reasonCode,
    L4_ROLLING_UPGRADE_REASON_CODE.NODE_UPGRADE_TIMEOUT);

  const qOwner = new RollingUpgradeOwner();
  qOwner.startUpgrade({operationId: 'op-qs-1', parameters: p, clusterSnapshot: snap, nowMs: 100});
  t.equal(qOwner.completeNodeCatchUp('node-1', {quorumHealthy: false}).reasonCode,
    L4_ROLLING_UPGRADE_REASON_CODE.QUORUM_SAFETY_HALT);

  const mOwner = new RollingUpgradeOwner();
  mOwner.startUpgrade({operationId: 'op-mv-1', parameters: p, clusterSnapshot: snap, nowMs: 100});
  t.equal(mOwner.recordNodeRestarted('node-1', {version: '0.8.0'}).reasonCode,
    L4_ROLLING_UPGRADE_REASON_CODE.MIXED_VERSION_INVARIANT_VIOLATED);

  const [drained, readyzCalls, restarts] = [[], [], []];
  const uOwner = new RollingUpgradeOwner({
    currentVersion: '0.4.0',
    onDrainNodeLeadership: (id) => drained.push(id),
    onSetNodeReadyz: (id, val) => readyzCalls.push({id, val}),
    onTriggerNodeRestart: (id, v, d) => restarts.push({id, v, d}),
  });
  const nodes = ['node-1', 'node-2', 'node-3'];
  uOwner.startUpgrade({
    operationId: 'op-roll-1', parameters: {targetVersion: '0.5.0', targetArtifactDigest: dSha},
    clusterSnapshot: {nodeIds: nodes, readyNodeIds: nodes}, nowMs: 1000,
  });

  t.equal(drained[0], 'node-1');
  t.same(readyzCalls[0], {id: 'node-1', val: false});
  t.equal(restarts[0].id, 'node-1');
  t.same(uOwner.getDrainingNodeIds(), ['node-1']);

  uOwner.recordNodeRestarted('node-1', {version: '0.5.0', nowMs: 1100});
  t.ok(uOwner.isVersionSkewActive() && !uOwner.isFeatureGateEnabled('0.5.0'));

  const lagRes = uOwner.completeNodeCatchUp('node-1', {
    underReplicatedPartitionCount: 2, nowMs: 1150,
  });
  t.equal(lagRes.state, MANAGEMENT_OPERATION_STATE.IN_PROGRESS);
  t.equal(uOwner.getActiveNode().nodeId, 'node-1');

  uOwner.completeNodeCatchUp('node-1', {underReplicatedPartitionCount: 0, nowMs: 1160});
  t.same(readyzCalls[1], {id: 'node-1', val: true});
  t.ok(uOwner.isVersionSkewActive() && !uOwner.isFeatureGateEnabled('0.5.0'));

  uOwner.beginNextNodeDrain(1200);
  t.equal(drained[1], 'node-2');
  t.same(readyzCalls[2], {id: 'node-2', val: false});

  const recovered = new RollingUpgradeOwner();
  recovered.resumeFromPersistedState(uOwner.pauseUpgrade(1250));
  t.ok(recovered.currentNodeIndex === 1 && recovered.nodeVersions['node-1'] === '0.5.0' &&
    recovered.nodeVersions['node-2'] === '0.4.0' && recovered.hasActiveUpgrade());

  recovered.recordNodeRestarted('node-2', {version: '0.5.0', nowMs: 1300});
  recovered.completeNodeCatchUp('node-2', {underReplicatedPartitionCount: 0, nowMs: 1350});
  recovered.beginNextNodeDrain(1400);
  recovered.recordNodeRestarted('node-3', {version: '0.5.0', nowMs: 1450});
  const finalStatus = recovered.completeNodeCatchUp('node-3', {
    underReplicatedPartitionCount: 0, nowMs: 1500,
  });

  t.equal(finalStatus.state, MANAGEMENT_OPERATION_STATE.SUCCEEDED);
  t.ok(recovered.currentVersion === '0.5.0' && !recovered.isVersionSkewActive() &&
    recovered.isFeatureGateEnabled('0.5.0') && !recovered.getReleaseFacts().versionSkew);
});

test('L3 Backup and Restore: 10 reason codes, cut, Rule 6 proof, restore', async (t) => {
  const bSnap = {ready: true, hasPartitionQuorum: true};
  const bParams = {backupId: 'bkp-test-1', destinationUri: 'memory://test/bkp-1'};

  for (const [fn, code] of [
    [() => new BackupRestoreOwner({capabilitySupported: false}).evaluatePreflight(bParams, bSnap),
      L3_BACKUP_RESTORE_REASON_CODE.BACKUP_CAPABILITY_UNSUPPORTED],
    [() => new BackupRestoreOwner().evaluatePreflight(
      bParams, {...bSnap, hasActiveOperation: true}),
    L3_BACKUP_RESTORE_REASON_CODE.CONCURRENT_OPERATION_ACTIVE],
    [() => new BackupRestoreOwner().evaluatePreflight(bParams, {...bSnap, ready: false}),
      L3_BACKUP_RESTORE_REASON_CODE.CLUSTER_NOT_READY],
    [() => new BackupRestoreOwner().evaluatePreflight(
      bParams, {...bSnap, hasPartitionQuorum: false}),
    L3_BACKUP_RESTORE_REASON_CODE.PARTITION_QUORUM_UNAVAILABLE],
  ]) {
    t.equal(fn().reasonCode, code);
  }

  for (const u of [
    'ftp://b', 's3://u:p@b/x', 's3://byoc-control-plane/x', 'https://byoc.internal/x',
    'https://control-plane.byoc/x', 'https://vendor-control-plane/x',
  ]) {
    t.equal(
      new BackupRestoreOwner().evaluatePreflight({backupId: 'b', destinationUri: u}, bSnap)
        .reasonCode, L3_BACKUP_RESTORE_REASON_CODE.DESTINATION_URI_INVALID,
    );
  }

  const confOwner = new BackupRestoreOwner();
  await confOwner.createBackup({operationId: 'op-b1-111111111111', parameters: bParams});
  const dupIdRes = await confOwner.createBackup({
    operationId: 'op-b2-111111111111',
    parameters: {backupId: 'bkp-test-1', destinationUri: 'memory://test/bkp-diff'},
  });
  t.equal(dupIdRes.reasonCode, L3_BACKUP_RESTORE_REASON_CODE.BACKUP_ID_CONFLICT);

  for (const [opts, uri, code] of [
    [{unreachableUris: ['unreach']}, 'memory://unreach/b',
      L3_BACKUP_RESTORE_REASON_CODE.DESTINATION_UNREACHABLE],
    [{writeDeniedUris: ['denied']}, 'memory://denied/b',
      L3_BACKUP_RESTORE_REASON_CODE.DESTINATION_WRITE_DENIED],
    [{streamInterruptUris: ['interrupted']}, 'memory://interrupted/b',
      L3_BACKUP_RESTORE_REASON_CODE.BACKUP_STREAM_INTERRUPTED],
    [{corruptManifestUris: ['corrupt-m']}, 'memory://corrupt-m/b',
      L3_BACKUP_RESTORE_REASON_CODE.BACKUP_VERIFICATION_FAILED],
    [{corruptSegmentUris: ['corrupt-s']}, 'memory://corrupt-s/b',
      L3_BACKUP_RESTORE_REASON_CODE.BACKUP_VERIFICATION_FAILED],
  ]) {
    const res = await new BackupRestoreOwner(opts).createBackup({
      parameters: {backupId: 'b', destinationUri: uri},
    });
    t.equal(res.reasonCode, code);
  }

  const validOwner = new BackupRestoreOwner({clusterId: 'source-cluster-alpha'});
  const backupRes = await validOwner.createBackup({
    operationId: 'op-valid-111111111111',
    parameters: {backupId: 'bkp-cut-1', destinationUri: 'memory://cluster-data/backup-cut'},
  });
  t.equal(backupRes.state, MANAGEMENT_OPERATION_STATE.SUCCEEDED);

  const adapter = validOwner.storageAdapter;
  t.ok(adapter.has('memory://cluster-data/backup-cut/segments/partition-1.seg') &&
    adapter.has('memory://cluster-data/backup-cut/segments/partition-2.seg') &&
    adapter.has('memory://cluster-data/backup-cut/segments/partition-3.seg') &&
    adapter.has('memory://cluster-data/backup-cut/manifest.json'));

  const EXP_KEYS = [
    'kind', 'lagrangeOperationId', 'operationId', 'reasonCode',
    'schemaVersion', 'sourceContract', 'sourceContractVersion', 'state', 'updatedAtMs',
  ];
  t.same(Object.keys(backupRes).sort(), EXP_KEYS.sort());
  t.equal('payload' in backupRes || 'rows' in backupRes, false);

  const rOwner = new BackupRestoreOwner({storageAdapter: adapter, clusterId: 'new-clean-cluster'});
  const mgmtFencing = new ManagementV1Owner({backupRestoreOwner: rOwner});
  rOwner.restoreInProgress = true;
  const hFact = mgmtFencing.getClusterFacts().facts.health;
  t.ok(!mgmtFencing.getClusterSnapshot().ready && !hFact.ready &&
    hFact.state === CLUSTER_FACTS_CONSTANTS.HEALTH_UNAVAILABLE);
  rOwner.restoreInProgress = false;

  const tamperedAdapter = new BackupRestoreOwner({clusterId: 'src'}).storageAdapter;
  await new BackupRestoreOwner({storageAdapter: tamperedAdapter, clusterId: 'src'}).createBackup({
    parameters: {backupId: 'bkp-tamp', destinationUri: 'memory://tampered/b'},
  });
  tamperedAdapter.storage.set(
    'memory://tampered/b/segments/partition-1.seg', Buffer.from('corrupt_bytes'),
  );
  const tampOwner = new BackupRestoreOwner({storageAdapter: tamperedAdapter});
  await t.rejects(
    () => tampOwner.restoreFromBackup({destinationUri: 'memory://tampered/b'}),
    /BACKUP_VERIFICATION_FAILED/,
  );
  t.equal(tampOwner.isRestoreAborted(), true);

  const cleanRestore = new BackupRestoreOwner({storageAdapter: adapter});
  const restResult = await cleanRestore.restoreFromBackup({
    destinationUri: 'memory://cluster-data/backup-cut',
  });
  t.ok(restResult.success && restResult.clusterIdentity !== 'source-cluster-alpha' &&
    restResult.clusterIdentity.startsWith(C.DEFAULT_CLUSTER_ID_PREFIX));
  t.same(restResult.restoredFrom, {
    sourceClusterIdentity: 'source-cluster-alpha', backupId: 'bkp-cut-1',
  });

  const drRestore = new BackupRestoreOwner({storageAdapter: adapter});
  const drResult = await drRestore.restoreFromBackup({
    destinationUri: 'memory://cluster-data/backup-cut',
    cliFlags: [BACKUP_MANIFEST_CONSTANTS.PRESERVE_IDENTITY_FLAG],
  });
  t.equal(drResult.clusterIdentity, 'source-cluster-alpha');
});

test('ManagementV1Owner: facts, idempotency, conflicts, and decommission', async (t) => {
  const mOwner = new ManagementV1Owner({
    clusterId: 'lagrange-cluster-primary',
    nodeCount: 3,
    nodes: ['node-1', 'node-2', 'node-3'],
  });

  const allFacts = mOwner.getClusterFacts();
  t.equal(allFacts.completeness, CLUSTER_FACTS_CONSTANTS.COMPLETENESS_COMPLETE);
  t.same(allFacts.missing, []);
  for (const sec of CLUSTER_FACTS_CONSTANTS.ALL_SECTIONS) t.ok(allFacts.facts[sec]);

  const partFacts = mOwner.getClusterFacts({missingSections: ['capacity', 'operations']});
  t.equal(partFacts.completeness, CLUSTER_FACTS_CONSTANTS.COMPLETENESS_PARTIAL);
  t.same(partFacts.missing, ['capacity', 'operations']);
  t.ok(partFacts.facts.capacity === undefined && partFacts.facts.operations === undefined);

  const noopEnv = makeEnv('NOOP', {reason: 'heartbeat'});
  const firstRes = await mOwner.submitOperation(noopEnv);
  t.equal(firstRes.state, MANAGEMENT_OPERATION_STATE.SUCCEEDED);
  t.equal(firstRes.duplicate, false);

  const dupRes = await mOwner.submitOperation(noopEnv);
  t.equal(dupRes.duplicate, true);
  t.equal(dupRes.operationId, noopEnv.operationId);

  const confEnv = makeEnv('NOOP', {reason: 'conflicting'}, {operationId: noopEnv.operationId});
  await t.rejects(() => mOwner.submitOperation(confEnv), /OPERATION_CONFLICT/);

  const diffClEnv = makeEnv('NOOP', {reason: 'heartbeat'}, {clusterId: 'wrong-cluster-id'});
  await t.rejects(() => mOwner.submitOperation(diffClEnv), /CLUSTER_ID_MISMATCH/);

  for (const f of ['EXEC', 'RUN_SQL']) {
    await t.rejects(() => mOwner.submitOperation(makeEnv(f, {})), /OPERATION_KIND_FORBIDDEN/);
  }

  const unkEnv = makeEnv('TRANSITION_RELEASE', {targetVersion: '0.5.0', bogusKey: true});
  await t.rejects(() => mOwner.submitOperation(unkEnv), /OPERATION_PARAMETER_UNKNOWN_FIELD/);

  const badDigEnv = makeEnv('NOOP', {reason: 'ok'});
  badDigEnv.requestDigest = 'f'.repeat(64);
  await t.rejects(() => mOwner.submitOperation(badDigEnv), /OPERATION_DIGEST_MISMATCH/);

  for (const [opts, param, code] of [
    [{decommissionSupported: false}, 'node-1',
      L6_DECOMMISSION_REASON_CODE.DECOMMISSION_CAPABILITY_UNSUPPORTED],
    [{}, 'node-missing', L6_DECOMMISSION_REASON_CODE.NODE_NOT_FOUND],
    [{underReplicatedPartitionCount: 3}, 'node-1',
      L6_DECOMMISSION_REASON_CODE.UNDER_REPLICATED_PARTITIONS],
    [{nodeCount: 2, nodes: ['node-1', 'node-2']}, 'node-1',
      L6_DECOMMISSION_REASON_CODE.QUORUM_SAFETY_VIOLATION],
  ]) {
    const o = new ManagementV1Owner({
      clusterId: 'lagrange-cluster-primary', nodeCount: 3,
      nodes: ['node-1', 'node-2', 'node-3'], ...opts,
    });
    const decRes = await o.submitOperation(makeEnv('DECOMMISSION_NODE', {lagrangeNodeId: param}));
    t.equal(decRes.reasonCode, code);
  }

  const validDec = await mOwner.submitOperation(
    makeEnv('DECOMMISSION_NODE', {lagrangeNodeId: 'node-1'}),
  );
  t.equal(validDec.state, MANAGEMENT_OPERATION_STATE.ACCEPTED);
});

test('Fastify HTTP route handlers return correct status codes', async (t) => {
  const fastify = Fastify({logger: false, bodyLimit: 1048576});
  const owner = new ManagementV1Owner({
    clusterId: 'lagrange-cluster-primary',
    nodeCount: 3,
    nodes: ['node-1', 'node-2', 'node-3'],
  });
  owner.registerRoutes(fastify);
  await fastify.ready();

  const factsRes = await fastify.inject({method: 'GET', url: MANAGEMENT_V1_ROUTE.FACTS});
  t.equal(factsRes.statusCode, 200);
  t.equal(factsRes.json().facts.cluster.identity, 'lagrange-cluster-primary');

  const env = makeEnv('NOOP', {reason: 'heartbeat'});
  for (const [method, url, payload, headers, code] of [
    ['POST', MANAGEMENT_V1_ROUTE.OPERATIONS, env, null, 200],
    ['GET', `/management/v1/operations/${env.operationId}`, null, null, 200],
    ['GET', '/management/v1/operations/non-existent-op-123456789', null, null, 404],
    ['POST', MANAGEMENT_V1_ROUTE.OPERATIONS, makeEnv('EXEC', {}), null, 400],
    ['POST', MANAGEMENT_V1_ROUTE.OPERATIONS,
      makeEnv('NOOP', {reason: 'c'}, {operationId: env.operationId}), null, 409],
    ['POST', MANAGEMENT_V1_ROUTE.OPERATIONS, JSON.stringify({pad: 'a'.repeat(70000)}),
      {'content-type': 'application/json'}, 413],
  ]) {
    const opts = {method, url};
    if (payload) opts.payload = payload;
    if (headers) opts.headers = headers;
    const res = await fastify.inject(opts);
    t.equal(res.statusCode, code);
  }

  await fastify.close();
});
