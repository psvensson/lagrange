import {test} from '../../src/test-helpers/tap.js';
import {
  CDC_OPERATION,
  COLUMN,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {NodeLivenessSemanticProjectionOwner} from
  '../../src/control-plane/node-liveness-semantic-projection-owner.js';
import {ReadinessPlanningSnapshotOwner} from
  '../../src/control-plane/readiness-planning-snapshot-owner.js';
import {planningIdentitiesEqual} from
  '../../src/control-plane/readiness-planning-semantic-generation.js';
import {StorageCapacityAccountingService} from
  '../../src/rebalancer/storage-capacity-accounting-service.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {
  buildServeReadyProjectionReadinessContract,
  buildServeReadyRuntimeAuthority,
} from './readiness-planning-positive-snapshot-fixtures.js';

const NOW_MS = 10_000;
const NODE_A = 'node-a';
const NODE_B = 'node-b';
const USER_PARTITION_ID = 'ratings:p1';
const PRIORITY_PARTITION_ID = 'control_plane_publications:p1';

function buildPositiveSnapshot(nodeId, revision, membershipFeedback = null) {
  return Object.freeze({
    membershipFeedback,
    nodeId,
    revision,
    serveEligible: true,
    repairEligible: true,
    dimensions: Object.freeze({serveEligible: true, repairEligible: true}),
    reasons: Object.freeze([]),
    nodeEvidence: Object.freeze({
      lastHeartbeat: NOW_MS,
      readyLeaseExpiresAt: NOW_MS + 100,
      transportConnected: true,
      localQueryTransportReady: true,
    }),
    runtimeAuthority: buildServeReadyRuntimeAuthority(),
    projectionReadinessContract: buildServeReadyProjectionReadinessContract(),
  });
}

function createFixture(options = {}) {
  const timeSource = new VirtualTimeSource({startMs: NOW_MS});
  const rowsByTable = new Map([
    [TABLES.NODES, [
      {
        [COLUMN.NODE_ID]: NODE_A,
        [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
        [COLUMN.CONNECTION_STATE]: 'ready',
        [COLUMN.LAST_HEARTBEAT]:
          NOW_MS - (options.nodeAHeartbeatAgeMs ?? 2),
        [COLUMN.READY_LEASE_EXPIRES_AT]: NOW_MS + 100,
        [COLUMN.CPU_USAGE_PERCENT]: 10,
        [COLUMN.MEMORY_USAGE_PERCENT]: 20,
        [COLUMN.DISK_USAGE_PERCENT]: 30,
        [COLUMN.STORAGE_BUDGET_BYTES]: 1_000_000,
      },
      {
        [COLUMN.NODE_ID]: NODE_B,
        [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
        [COLUMN.CONNECTION_STATE]: 'ready',
        [COLUMN.LAST_HEARTBEAT]: NOW_MS,
        [COLUMN.READY_LEASE_EXPIRES_AT]: NOW_MS + 100,
        [COLUMN.CPU_USAGE_PERCENT]: 10,
        [COLUMN.MEMORY_USAGE_PERCENT]: 20,
        [COLUMN.DISK_USAGE_PERCENT]: 30,
        [COLUMN.STORAGE_BUDGET_BYTES]: 1_000_000,
      },
    ]],
    [TABLES.NODE_ENDPOINTS, []],
    [TABLES.SERVICES, [
      {
        [COLUMN.SERVICE_ID]: 'service-a',
        [COLUMN.NODE_ID]: NODE_A,
        [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
        [COLUMN.PARTITION_ID]: USER_PARTITION_ID,
        [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
        [COLUMN.ADDRESS]: 'ws://node-a',
      },
      {
        [COLUMN.SERVICE_ID]: 'service-b',
        [COLUMN.NODE_ID]: NODE_B,
        [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
        [COLUMN.PARTITION_ID]: USER_PARTITION_ID,
        [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
        [COLUMN.ADDRESS]: 'ws://node-b',
      },
    ]],
    [TABLES.PARTITIONS, [
      {
        [COLUMN.PARTITION_ID]: USER_PARTITION_ID,
        [COLUMN.TABLE_ID]: 'ratings',
        [COLUMN.SIZE_BYTES]: 100,
      },
      {
        [COLUMN.PARTITION_ID]: PRIORITY_PARTITION_ID,
        [COLUMN.TABLE_ID]: TABLES.CONTROL_PLANE_PUBLICATIONS,
        [COLUMN.SIZE_BYTES]: 100,
      },
    ]],
    [TABLES.REPLICA_OPERATIONS, []],
    [TABLES.STORAGE_RESERVATIONS, options.reservations || []],
    [TABLES.CONTROL_PLANE_PUBLICATIONS, []],
  ]);
  const readNodeRow = (nodeId) => rowsByTable.get(TABLES.NODES)
    .find((row) => row[COLUMN.NODE_ID] === nodeId) || null;
  const tableMutationRevisions = new Map(
    [...rowsByTable.keys()].map((tableName) => [tableName, 0]),
  );
  const systemTableCache = {
    getAll: (tableName) => rowsByTable.get(tableName) || [],
    getTableMutationVersion: (tableName) =>
      tableMutationRevisions.get(tableName) || 0,
  };
  const livenessOwner = new NodeLivenessSemanticProjectionOwner({
    localNodeId: 'node-local',
    timeSource,
    thresholds: {
      clusterMemberStaleHeartbeatMs:
        options.clusterMemberStaleHeartbeatMs ?? 5,
      derivationGraceMs: 50,
      repairStaleHeartbeatMs: 50,
    },
    readNodeEvidence: (nodeId) => ({
      nodeRow: readNodeRow(nodeId),
      transportConnected: true,
    }),
  });
  livenessOwner.projectNodeLiveness(NODE_A);
  livenessOwner.projectNodeLiveness(NODE_B);
  const scheduled = [];
  let buildRevision = 0;
  const storageAccountingService = options.withCapacityOwner ?
    new StorageCapacityAccountingService({
      systemTableCache,
      timeSource,
    }) : null;
  const service = {
    clusterMemberStaleHeartbeatMaxAgeMs: 30_000,
    nodeLivenessSemanticProjectionOwner: livenessOwner,
    storageAccountingService,
    systemTableCache,
    messageRouter: {
      getConnectedNodes: () => new Set([NODE_A, NODE_B]),
      getConnectionState: () => 'connected',
    },
    getNodeRow: readNodeRow,
    getNodeLivenessSemanticIdentity: (nodeId, nowMs) =>
      livenessOwner.getNodeLivenessSemanticIdentity(nodeId, nowMs),
    getNodeTransportState: () => ({
      connected: true,
      routerState: 'connected',
      rowState: 'ready',
    }),
    hasStoredSnapshotLocalQueryTransportDrift: () => false,
    buildNodeReadinessSyncCurrent: (nodeId) => buildPositiveSnapshot(
      nodeId,
      ++buildRevision,
      options.feedbackByNode?.get(nodeId) || null,
    ),
    setTimeoutFn: (...args) => timeSource.setTimeout(...args),
    clearTimeoutFn: (handle) => timeSource.clearTimeout(handle),
  };
  if (options.feedbackByNode) {
    service.buildMembershipPlanningFeedbackSignature = (_nodeId, snapshot) =>
      snapshot.membershipFeedback;
    service.buildReadinessEvaluationKey = (nodeId, buildOptions = {}) =>
      `${nodeId}:${buildOptions.variant || 'default'}`;
  }
  const owner = new ReadinessPlanningSnapshotOwner({
    service,
    now: () => timeSource.now(),
    scheduleDrainFn: (callback) => scheduled.push(callback),
  });
  owner.reconcile(NODE_A, {options: {}});
  owner.reconcile(NODE_B, {options: {}});
  const recordTableChange = (tableName, operation, record) => {
    const sourceRevision =
      (tableMutationRevisions.get(tableName) || 0) + 1;
    tableMutationRevisions.set(tableName, sourceRevision);
    owner.beginCacheChangeTransaction();
    try {
      storageAccountingService?.recordCapacitySourceChange(
        tableName,
        operation,
        record,
        timeSource.now(),
      );
      owner.recordTableChange(
        tableName,
        operation,
        record,
        sourceRevision,
      );
    } finally {
      owner.commitCacheChangeTransaction();
    }
  };
  return {
    livenessOwner,
    owner,
    rowsByTable,
    recordTableChange,
    scheduled,
    service,
    storageAccountingService,
    timeSource,
  };
}

async function drainScheduledCallbacks(callbacks) {
  while (callbacks.length > 0) {
    callbacks.shift()();
    await Promise.resolve();
    await Promise.resolve();
  }
}

function readNodeGeneration(diagnostics, nodeId) {
  return diagnostics.byNodePlanningGeneration?.[nodeId] || 0;
}

function readDefaultSnapshot(fixture, nodeId) {
  return fixture.owner.readSync(
    nodeId,
    {},
    () => fixture.service.buildNodeReadinessSyncCurrent(nodeId),
  );
}

test('ReadinessPlanningSnapshotOwner leaves currency unchanged for a ' +
  'semantic-noop heartbeat write', (t) => {
  const fixture = createFixture();
  const beforeDiagnostics = fixture.owner.getDiagnostics();
  const beforeA = readDefaultSnapshot(fixture, NODE_A);
  const beforeB = readDefaultSnapshot(fixture, NODE_B);
  const nodeRow = fixture.service.getNodeRow(NODE_A);
  nodeRow[COLUMN.LAST_HEARTBEAT] = NOW_MS;
  nodeRow[COLUMN.READY_LEASE_EXPIRES_AT] = NOW_MS + 200;

  fixture.livenessOwner.recordNodeSourceChange(NODE_A);
  fixture.recordTableChange(
    TABLES.NODES,
    CDC_OPERATION.UPDATE,
    nodeRow,
  );

  const afterDiagnostics = fixture.owner.getDiagnostics();
  t.equal(afterDiagnostics.globalPlanningGeneration,
    beforeDiagnostics.globalPlanningGeneration,
    'raw heartbeat cadence does not rotate the global planning generation');
  t.equal(readNodeGeneration(afterDiagnostics, NODE_A),
    readNodeGeneration(beforeDiagnostics, NODE_A),
    'raw heartbeat cadence does not rotate the node planning generation');
  t.equal(readDefaultSnapshot(fixture, NODE_A), beforeA,
    'the heartbeating node keeps the same frozen completed record');
  t.equal(readDefaultSnapshot(fixture, NODE_B), beforeB,
    'every other node keeps the same frozen completed record');
  t.equal(fixture.scheduled.length, 0,
    'a verdict-preserving heartbeat update schedules no planning build');
  fixture.owner.shutdown();
  fixture.livenessOwner.shutdown();
  t.end();
});

test('ReadinessPlanningSnapshotOwner keeps a P transition local when the ' +
  'shared membership component is unchanged', (t) => {
  const fixture = createFixture();
  const before = fixture.owner.getDiagnostics();
  const beforeB = readDefaultSnapshot(fixture, NODE_B);

  fixture.livenessOwner.recordTransportGraceEvidence(NODE_A, {
    eligible: true,
    startedAtMs: NOW_MS,
  });

  const after = fixture.owner.getDiagnostics();
  t.equal(after.globalPlanningGeneration, before.globalPlanningGeneration,
    'a P-only transport-grace change is not a cluster-global planning event');
  t.equal(readNodeGeneration(after, NODE_A),
    readNodeGeneration(before, NODE_A) + 1,
    'the liveness owner event advances the affected node planning identity');
  t.equal(readNodeGeneration(after, NODE_B),
    readNodeGeneration(before, NODE_B),
    'an unaffected node planning identity remains reusable');
  t.equal(readDefaultSnapshot(fixture, NODE_B), beforeB,
    'the unaffected node returns the same completed snapshot');
  t.equal(fixture.scheduled.length, 1,
    'the semantic P change re-drives one owner key through the existing queue');
  fixture.owner.shutdown();
  fixture.livenessOwner.shutdown();
  t.end();
});

test('ReadinessPlanningSnapshotOwner rotates global currency when a ' +
  'time-only P transition changes shared membership', (t) => {
  const fixture = createFixture();
  const before = fixture.owner.getDiagnostics();
  const beforeB = readDefaultSnapshot(fixture, NODE_B);

  fixture.timeSource.advance(3);

  const after = fixture.owner.getDiagnostics();
  t.equal(after.globalPlanningGeneration,
    before.globalPlanningGeneration + 1,
    'stored-readiness freshness expiry rotates shared membership once');
  t.equal(readNodeGeneration(after, NODE_A),
    readNodeGeneration(before, NODE_A) + 1,
    'the P deadline advances the affected node identity');
  t.equal(readNodeGeneration(after, NODE_B),
    readNodeGeneration(before, NODE_B),
    'global currency carries shared invalidation without node-local churn');
  t.not(readDefaultSnapshot(fixture, NODE_B), beforeB,
    'another publisher cannot reuse the old active-cohort record');
  fixture.owner.shutdown();
  fixture.livenessOwner.shutdown();
  t.end();
});

test('ReadinessPlanningSnapshotOwner scopes node-local and global table ' +
  'semantics independently', (t) => {
  const fixture = createFixture();
  const before = fixture.owner.getDiagnostics();
  const serviceRow = fixture.rowsByTable.get(TABLES.SERVICES)[0];
  serviceRow[COLUMN.ADDRESS] = 'ws://node-a-v2';
  fixture.recordTableChange(
    TABLES.SERVICES,
    CDC_OPERATION.UPDATE,
    serviceRow,
  );
  const afterLocal = fixture.owner.getDiagnostics();
  t.equal(afterLocal.globalPlanningGeneration,
    before.globalPlanningGeneration,
    'an ordinary service-row semantic change is not cluster-global');
  t.equal(readNodeGeneration(afterLocal, NODE_A),
    readNodeGeneration(before, NODE_A) + 1,
    'the service row advances its owning node planning generation');
  t.equal(readNodeGeneration(afterLocal, NODE_B),
    readNodeGeneration(before, NODE_B),
    'another node remains reusable after the local service change');

  fixture.recordTableChange(
    TABLES.CONTROL_PLANE_PUBLICATIONS,
    CDC_OPERATION.INSERT,
    {
      publication_id: 'membership:1',
      publication_kind: 'cluster_membership',
      publication_epoch: 1,
      [COLUMN.STATUS]: 'OPEN',
    },
  );
  const afterGlobal = fixture.owner.getDiagnostics();
  t.equal(afterGlobal.globalPlanningGeneration,
    afterLocal.globalPlanningGeneration + 1,
    'a membership publication rotates the global planning generation');
  fixture.owner.shutdown();
  fixture.livenessOwner.shutdown();
  t.end();
});

test('ReadinessPlanningSnapshotOwner includes storage reservations and ' +
  'token-only feedback in granular currency', (t) => {
  const fixture = createFixture({withCapacityOwner: true});
  const before = fixture.owner.getDiagnostics();
  const reservation = {
    [COLUMN.RESERVATION_ID]: 'reservation-a',
    [COLUMN.TARGET_NODE_ID]: NODE_A,
    [COLUMN.STATUS]: 'active',
    [COLUMN.ESTIMATED_BYTES]: 100,
    [COLUMN.AMPLIFICATION_FACTOR]: 1,
    [COLUMN.EXPIRES_AT]: NOW_MS + 1_000,
  };
  fixture.rowsByTable.get(TABLES.STORAGE_RESERVATIONS).push(reservation);
  fixture.recordTableChange(
    TABLES.STORAGE_RESERVATIONS,
    CDC_OPERATION.INSERT,
    reservation,
  );
  const afterReservation = fixture.owner.getDiagnostics();
  t.equal(afterReservation.globalPlanningGeneration,
    before.globalPlanningGeneration,
    'a reservation write is not cluster-global');
  t.equal(readNodeGeneration(afterReservation, NODE_A),
    readNodeGeneration(before, NODE_A) + 1,
    'a reservation write advances its target node generation');
  t.equal(readNodeGeneration(afterReservation, NODE_B),
    readNodeGeneration(before, NODE_B),
    'a reservation write preserves an unrelated node generation');

  fixture.owner.recordReadinessSnapshotChange(NODE_A);
  const afterFeedback = fixture.owner.getDiagnostics();
  t.equal(afterFeedback.globalPlanningGeneration,
    afterReservation.globalPlanningGeneration + 1,
    'cached readiness feedback rotates the cluster planning generation');
  fixture.owner.recordOwnerDependencyReplacement('storageAccountingService');
  const afterOwnerReplacement = fixture.owner.getDiagnostics();
  t.equal(afterOwnerReplacement.globalPlanningGeneration,
    afterFeedback.globalPlanningGeneration + 1,
    'a token-only owner replacement rotates the global planning generation');
  fixture.owner.shutdown();
  fixture.livenessOwner.shutdown();
  t.end();
});

test('a capacity-owner deadline invalidates only its node without a write',
  (t) => {
    const fixture = createFixture({
      clusterMemberStaleHeartbeatMs: 500,
      nodeAHeartbeatAgeMs: 0,
      reservations: [{
        [COLUMN.AMPLIFICATION_FACTOR]: 1,
        [COLUMN.ESTIMATED_BYTES]: 100,
        [COLUMN.EXPIRES_AT]: NOW_MS + 5,
        [COLUMN.RESERVATION_ID]: 'reservation-a',
        [COLUMN.STATUS]: 'active',
        [COLUMN.TARGET_NODE_ID]: NODE_A,
      }],
      withCapacityOwner: true,
    });
    const before = fixture.owner.getDiagnostics();
    const beforeA = readDefaultSnapshot(fixture, NODE_A);
    const beforeB = readDefaultSnapshot(fixture, NODE_B);

    fixture.timeSource.advance(5);

    const after = fixture.owner.getDiagnostics();
    t.equal(after.globalPlanningGeneration, before.globalPlanningGeneration,
      'reservation expiry is not cluster-global planning evidence');
    t.equal(readNodeGeneration(after, NODE_A),
      readNodeGeneration(before, NODE_A) + 1,
      'the capacity owner advances the affected node identity');
    t.equal(readNodeGeneration(after, NODE_B),
      readNodeGeneration(before, NODE_B),
      'an unrelated node keeps its planning identity');
    t.not(readDefaultSnapshot(fixture, NODE_A), beforeA,
      'the affected node cannot reuse its pre-expiry record');
    t.equal(readDefaultSnapshot(fixture, NODE_B), beforeB,
      'the unrelated node reuses the identical frozen record');
    fixture.owner.shutdown();
    fixture.livenessOwner.shutdown();
    fixture.storageAccountingService.shutdownCapacitySemanticProjection();
    t.end();
  });

test('ReadinessPlanningSnapshotOwner distinguishes invalid transport from ' +
  'valid empty topology', (t) => {
  const fixture = createFixture();
  const before = fixture.owner.getDiagnostics();
  fixture.service.messageRouter.getConnectedNodes = () => Object.create(null);

  const invalid = readDefaultSnapshot(fixture, NODE_A);
  const afterInvalid = fixture.owner.getDiagnostics();
  t.equal(invalid.readinessPlanningTokenStatus, 'stale',
    'malformed topology fails stored admission closed');
  t.equal(afterInvalid.currentToken.transportTopologyValid, false,
    'invalid topology cannot alias the valid-empty fingerprint');
  t.equal(afterInvalid.globalPlanningGeneration,
    before.globalPlanningGeneration + 1,
    'the invalid transition rotates cluster-global currency exactly once');

  fixture.service.messageRouter.getConnectedNodes = () => new Set();
  readDefaultSnapshot(fixture, NODE_A);
  const afterRecovery = fixture.owner.getDiagnostics();
  t.equal(afterRecovery.currentToken.transportTopologyValid, true,
    'canonical empty topology is a distinct recoverable state');
  t.equal(afterRecovery.globalPlanningGeneration,
    afterInvalid.globalPlanningGeneration + 1,
    'transport recovery rotates cluster-global currency once');
  fixture.owner.shutdown();
  fixture.livenessOwner.shutdown();
  t.end();
});

test('readiness feedback reaches a finite multi-node multi-variant fixed point',
  async (t) => {
    const feedbackByNode = new Map([
      [NODE_A, 'ready-a'],
      [NODE_B, 'ready-b'],
    ]);
    const fixture = createFixture({feedbackByNode});
    await drainScheduledCallbacks(fixture.scheduled);
    fixture.owner.reconcile(NODE_A, {options: {variant: 'alternate'}});
    fixture.owner.reconcile(NODE_B, {options: {variant: 'alternate'}});
    await drainScheduledCallbacks(fixture.scheduled);

    const before = fixture.owner.getDiagnostics();
    feedbackByNode.set(NODE_B, 'degraded-b');
    fixture.owner.reconcile(NODE_B, {options: {variant: 'alternate'}});
    const afterProducer = fixture.owner.getDiagnostics();
    t.equal(afterProducer.globalPlanningGeneration,
      before.globalPlanningGeneration + 1,
      'one changed canonical feedback signature rotates global currency once');
    t.same(afterProducer.pendingOwnerKeys.slice().sort(),
      [NODE_A, NODE_A, NODE_B].sort(),
      'every dependent variant except the exact producer is enqueued');

    fixture.owner.reconcile(NODE_B, {options: {variant: 'alternate'}});
    t.equal(fixture.owner.getDiagnostics().globalPlanningGeneration,
      afterProducer.globalPlanningGeneration,
      'rebuilding identical feedback cannot create a build-to-bump loop');

    await drainScheduledCallbacks(fixture.scheduled);
    const settled = fixture.owner.getDiagnostics();
    t.equal(settled.globalPlanningGeneration,
      afterProducer.globalPlanningGeneration,
      'dependent rebuilds converge without another feedback rotation');
    t.same(settled.pendingOwnerKeys, [], 'the fixed point drains completely');
    for (const nodeId of [NODE_A, NODE_B]) {
      for (const variant of ['default', 'alternate']) {
        const buildOptionsKey = fixture.owner.captureBuildOptionsKey(
          nodeId,
          {variant},
        );
        const completed = fixture.owner.readCompleted(nodeId, buildOptionsKey);
        t.ok(planningIdentitiesEqual(
          completed?.planningIdentity,
          fixture.owner.readPlanningProjectionIdentity(nodeId),
        ), `${nodeId}/${variant} settles under current semantic currency`);
      }
    }
    fixture.owner.shutdown();
    fixture.livenessOwner.shutdown();
    t.end();
  });

test('reentrant P, C, transport, and owner drift cannot publish a pre-change ' +
  'build', (t) => {
  const cases = [{
    name: 'P',
    inject: (fixture) => fixture.livenessOwner.recordTransportGraceEvidence(
      NODE_A,
      {eligible: true, startedAtMs: NOW_MS},
    ),
  }, {
    name: 'C',
    inject: (fixture) => fixture.owner.recordCapacityChange({
      nodeId: NODE_A,
      previousProjection: {},
      projection: {},
    }),
  }, {
    name: 'transport',
    inject: (fixture) => {
      fixture.service.messageRouter.getConnectedNodes = () => new Set();
    },
  }, {
    name: 'owner replacement',
    inject: (fixture) => fixture.owner.recordOwnerDependencyReplacement(
      'nodesOwner',
    ),
  }];
  for (const testCase of cases) {
    const fixture = createFixture();
    const before = fixture.owner.readCompleted(NODE_A, NODE_A);
    const build = fixture.service.buildNodeReadinessSyncCurrent;
    fixture.service.buildNodeReadinessSyncCurrent = (...args) => {
      const snapshot = build(...args);
      testCase.inject(fixture);
      return snapshot;
    };
    const result = fixture.owner.reconcile(NODE_A, {options: {}});
    t.equal(fixture.owner.readCompleted(NODE_A, NODE_A), before,
      `${testCase.name} drift leaves the previous completed record intact`);
    t.equal(result.readinessPlanningTokenStatus, 'stale',
      `${testCase.name} drift returns the existing deferred contract`);
    fixture.owner.shutdown();
    fixture.livenessOwner.shutdown();
  }
  t.end();
});

test('planning shutdown fences owner callbacks and lazy semantic reads', (t) => {
  const fixture = createFixture();
  const before = fixture.owner.getDiagnostics();
  fixture.owner.shutdown();
  fixture.livenessOwner.recordTransportGraceEvidence(NODE_A, {
    eligible: true,
    startedAtMs: NOW_MS,
  });
  fixture.owner.recordCapacityChange({
    nodeId: NODE_A,
    previousProjection: {},
    projection: {},
  });
  const stoppedIdentity = fixture.owner.readPlanningProjectionIdentity(NODE_A);
  const after = fixture.owner.getDiagnostics();
  t.equal(after.globalPlanningGeneration, before.globalPlanningGeneration,
    'late owner callbacks cannot rotate global currency');
  t.equal(readNodeGeneration(after, NODE_A),
    readNodeGeneration(before, NODE_A),
    'late owner callbacks cannot rotate node currency');
  t.equal(stoppedIdentity.saturated, true,
    'post-shutdown reads fail closed without reprojecting dependencies');
  t.same(after.pendingOwnerKeys, [], 'post-shutdown work cannot be enqueued');
  fixture.livenessOwner.shutdown();
  t.end();
});
