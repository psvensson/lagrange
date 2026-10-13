import assert from 'node:assert/strict';
import {test} from 'node:test';
import {setImmediate as nextTurn} from 'node:timers/promises';
import {ReplicaHandler} from '../../../src/node/replica-handler.js';
import {SystemTableCache} from '../../../src/cache/system-table-cache.js';
import {createFixture, buildService} from './startup-cleanup-native-fixture.js';

function handlerFor(fixture, createPartitionService) {
  return new ReplicaHandler({
    nodeId: 'claim-race-node',
    dataDir: fixture.directory,
    systemTableCache: new SystemTableCache(),
    cdcIntegrationService: {},
    createPartitionService,
    messageRouter: fixture.router,
    timeSource: fixture.clock,
  });
}
function releaseOwner(claim, onRelease) {
  return {releasePhysicalWorker(value) {
    assert.equal(value, claim);
    onRelease();
  }};
}
for (const kind of ['partition', 'message-group']) {
  test(kind + ' concurrent initialize callers join one native opening', async (t) => {
    const fixture = await createFixture(t);
    const service = buildService(fixture, kind);
    const create = service.createOperationPort.bind(service);
    let openings = 0;
    service.createOperationPort = (request) => {
      openings += 1;
      return create(request);
    };
    try {
      await Promise.all([service.initialize(), service.initialize()]);
      assert.equal(openings, 1);
      assert.equal(service.initialized, true);
    } finally {
      await service.shutdown().catch(() => {});
    }
  });
  test(kind + ' shutdown waits for in-flight initialization before teardown', async (t) => {
    const fixture = await createFixture(t);
    const service = buildService(fixture, kind);
    const create = service.createOperationPort.bind(service);
    let enteredResolve;
    const entered = new Promise((resolve) => {
      enteredResolve = resolve;
    });
    let releaseCampaign;
    const gate = new Promise((resolve) => {
      releaseCampaign = resolve;
    });
    service.createOperationPort = (request) => {
      const port = create(request);
      const campaign = port.campaign;
      return Object.freeze({...port, campaign: async (...args) => {
        enteredResolve();
        await gate;
        return campaign(...args);
      }});
    };
    const initializing = service.initialize();
    await entered;
    const db = service.db;
    assert.ok(db?.open);
    const stopping = service.shutdown();
    await nextTurn();
    assert.ok(db.open);
    assert.ok(service.raft);
    releaseCampaign();
    await assert.rejects(initializing, (error) =>
      error?.code === (kind === 'partition' ?
        'partition_service_shutdown' : 'message_group_service_shutdown'));
    await stopping;
    assert.equal(db.open, false);
    assert.equal(service.db, null);
    assert.equal(service.raft, null);
    assert.equal(service.initialized, false);
  });
}
test('ReplicaHandler rechecks shutdown after awaited cleanup before CREATE mutation', async (t) => {
  const fixture = await createFixture(t);
  let factoryCalls = 0;
  const handler = handlerFor(fixture, async () => {
    factoryCalls += 1;
    throw new Error('factory must not run after shutdown');
  });
  const claim = Object.freeze({claim: 'cleanup-wait'});
  let releases = 0;
  handler.getReplicaCreateAdmissionOwner = () =>
    releaseOwner(claim, () => {
      releases += 1;
    });
  handler.settlePendingReplicaRuntimeCleanup = async () => {
    handler.shuttingDown = true;
  };
  let contextCalls = 0;
  handler.resolveReplicaContextWithRetry = async () => {
    contextCalls += 1;
    return {};
  };
  const operationId = 'create-after-cleanup-wait';
  handler.inProgressOperations.set(operationId, {
    type: 'CREATE_REPLICA', replicaId: 'race-r1', partitionId: 'race-p1',
  });
  await handler.createReplicaAsync({
    operationId, partitionId: 'race-p1', replicaId: 'race-r1',
    skipLifecycleStatusPersistence: true,
    createPhysicalWorkerClaim: claim,
  });
  assert.equal(contextCalls, 0);
  assert.equal(factoryCalls, 0);
  assert.equal(releases, 1);
  assert.equal(handler.inProgressOperations.has(operationId), false);
});
test('ReplicaHandler releases CREATE claim when shutdown cleanup rejects', async (t) => {
  const fixture = await createFixture(t);
  const claim = Object.freeze({claim: 'failed-shutdown'});
  let releases = 0;
  let shutdownCalls = 0;
  let failShutdown = true;
  const failure = new Error('injected runtime shutdown rejection');
  const service = {
    replicaId: 'claim-r2', partitionId: 'claim-p2',
    async shutdown() {
      shutdownCalls += 1;
      if (failShutdown) throw failure;
    },
  };
  const handler = handlerFor(fixture, async () => {
    handler.shuttingDown = true;
    return service;
  });
  // This controlled host boundary is about post-construction shutdown
  // ownership, not control-plane prior-existence availability.
  handler.replicaStateMachine.getControlPlaneSystemTableGateway = null;
  handler.getReplicaCreateAdmissionOwner = () =>
    releaseOwner(claim, () => {
      releases += 1;
    });
  handler.resolveReplicaContextWithRetry = async () => ({
    tableName: 'claim_table', tableId: 'claim_table', schema: null,
    keyRange: null, leaderAddress: null, replicaIds: ['claim-r2'],
    peerAddresses: [], existingReplicaCount: 0, bootstrapMembership: null,
  });
  const operationId = 'claim-release-on-cleanup-failure';
  handler.inProgressOperations.set(operationId, {
    type: 'CREATE_REPLICA', replicaId: 'claim-r2', partitionId: 'claim-p2',
  });
  try {
    await assert.rejects(handler.createReplicaAsync({
      operationId, partitionId: 'claim-p2', replicaId: 'claim-r2',
      skipLifecycleStatusPersistence: true,
      createPhysicalWorkerClaim: claim,
    }));
    assert.ok(shutdownCalls >= 2);
    assert.equal(releases, 1);
    assert.equal(handler.inProgressOperations.has(operationId), false);
    assert.equal(handler.pendingRuntimeShutdowns.has(service), true);
  } finally {
    failShutdown = false;
    handler.shuttingDown = false;
    await handler.fenceFailedReplicaCreateRuntime(
      'claim-r2', 'claim-p2', service).catch(() => {});
  }
});
