import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {NodeJoiningService} from
  '../../src/bootstrap/node-joining-service.js';
import {initializeTestEnvironment} from
  './node-joining-service-test-support.js';
import {ReplicaHandler} from '../../src/node/replica-handler.js';
import {ReplicaStateMachine} from '../../src/node/replica-state-machine.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {createReplicaRuntimePublication} from '../../src/node/replica-runtime-publication.js';
import {captureReplicaRuntimeObservation} from '../../src/node/replica-runtime-observation.js';
import {assertDurableRejoinStorageAdmission} from
  '../../src/bootstrap/durable-rejoin-storage-admission.js';
import {PARTITION_RUNTIME_PUBLICATION_REFUSED} from
  '../../src/partition/partition-runtime-publication.js';
import {bindRegisteredReplicaHandler} from '../test-helpers/replica-handler-identity-fixture.js';
import {createLifecycleServiceRow, createLifecycleStateStore} from
  '../test-helpers/lifecycle-state-store.js';

function quietLogger() {
  return {
    debug() {},
    error() {},
    info() {},
    warn() {},
  };
}

function restoreFixture(t, beforeAuthoritativeRead) {
  initializeTestEnvironment();
  const service = new NodeJoiningService({
    bootIncarnation: 1,
    nodeId: 'joining-node-a',
    nodeAddress: 'ws://localhost:19101',
    seedNodeAddress: 'http://localhost:18101',
  });
  const row = createLifecycleServiceRow({replicaId: 'p1-r1', partitionId: 'p1',
    nodeId: service.nodeId, status: 'active', createdAt: 100, stateEnteredAt: 101,
    createAttemptToken: 'original-attempt'});
  const store = createLifecycleStateStore({services: [row]});
  store.setBeforeAuthoritativeRead(beforeAuthoritativeRead);
  const owner = new ReplicaStateMachine({nodeId: service.nodeId, ownerIncarnation: 1,
    controlPlaneSystemTableGateway: store.gateway, systemTableCache: store.cache});
  const handler = new ReplicaHandler({nodeId: service.nodeId, ownerIncarnation: 1,
    replicaStateMachine: owner, controlPlaneSystemTableGateway: store.gateway,
    systemTableCache: store.cache, cdcIntegrationService: {},
    createPartitionService: async () => { throw new Error('restore bypasses CREATE'); }});
  service.replicaHandler = handler;
  service.replicaStateMachine = owner;
  const options = {restoringExistingReplica: true, lifecycleAuthority: row,
    partitionId: row.partition_id, replicaId: row.replica_id, nodeId: row.node_id,
    tableId: 'restore-table'};
  t.teardown(async () => {
    handler.shuttingDown = true;
    await owner.clear();
  });
  return {service, row, store, owner, handler, options};
}

test('join attachment retains the exact restored ACTIVE source without another activation',
  async (t) => {
    const f = restoreFixture(t);
    const admission = await assertDurableRejoinStorageAdmission(f.owner, f.options);
    t.equal(admission.owner, f.owner);
    t.same(admission.row, f.row, 'restore carries the full original authoritative identity');
    t.equal(f.owner.getState(f.row.replica_id)?.state, 'active');
    const stateBeforePublication = f.owner.getState(f.row.replica_id);
    const partition = new PartitionService({...f.options,
      runtimePublication: createReplicaRuntimePublication(f.handler, admission.row,
        admission.admission), resolveHandlerRetirementLane: () => f.owner});
    bindRegisteredReplicaHandler(partition, {nodeId: f.row.node_id,
      resolveHandlerRetirementLane: () => f.owner});
    t.teardown(() => partition.shutdown());
    f.service.trackJoinPartitionReplica(f.row.replica_id, f.row.partition_id, partition,
      {...admission, handler: f.handler, hostServices: f.service.partitionServices});
    t.equal(f.handler.getTrackedService(f.row.replica_id), partition);
    t.equal(f.handler.localReplicas.get(f.row.replica_id)?.status, 'active');
    t.same(f.owner.getState(f.row.replica_id), stateBeforePublication,
      'attachment does not mint another lifecycle generation');
    t.equal(f.store.mutations.length, 0, 'restore does not fabricate INSERT activation');
    t.ok(captureReplicaRuntimeObservation(f.handler, f.row.replica_id).sourceEvidence,
      'the published exact runtime retains the admitted original source');
  });

test('held restore read never adopts a replacement join caller', async (t) => {
  for (const changed of ['handler', 'owner', 'host', 'boot']) {
    await t.test(changed, async (t) => {
      const entered = Promise.withResolvers();
      const release = Promise.withResolvers();
      const f = restoreFixture(t, async () => {
        entered.resolve();
        await release.promise;
      });
      let factoryEntries = 0;
      f.service.createCdcIntegrationService = () => {
        factoryEntries += 1;
        throw new Error('the stale caller must refuse before runtime construction');
      };
      const pending = f.service.createJoinLocalPartitionService(f.options);
      await entered.promise;
      if (changed === 'handler') f.service.replicaHandler = {...f.handler};
      if (changed === 'owner') f.service.replicaStateMachine = {...f.owner};
      if (changed === 'host') f.service.partitionServices = new Map();
      if (changed === 'boot') f.service.bootIncarnation += 1;
      release.resolve();
      await t.rejects(pending, {code: PARTITION_RUNTIME_PUBLICATION_REFUSED});
      t.equal(factoryEntries, 0, 'no runtime is constructed under the newer caller');
      t.equal(f.handler.localServices.size, 0);
      t.equal(f.store.mutations.length, 0);
    });
  }
});

test('unchanged join caller proceeds after the held exact restore read', async (t) => {
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  const f = restoreFixture(t, async () => { entered.resolve(); await release.promise; });
  const constructionBoundary = new Error('controlled downstream runtime construction boundary');
  let factoryEntries = 0;
  f.service.createCdcIntegrationService = () => {
    factoryEntries += 1;
    throw constructionBoundary;
  };
  const pending = f.service.createJoinLocalPartitionService(f.options);
  await entered.promise;
  release.resolve();
  await t.rejects(pending, constructionBoundary,
    'the current caller reaches its actual construction boundary');
  t.equal(factoryEntries, 1);
  t.equal(f.owner.getState(f.row.replica_id)?.durableVersion, f.row.state_entered_at);
  t.equal(f.store.mutations.length, 0);
});

test('held restore read refuses a changed lifecycle admission without adopting its source',
  async (t) => {
    const entered = Promise.withResolvers();
    const release = Promise.withResolvers();
    const f = restoreFixture(t, async () => { entered.resolve(); await release.promise; });
    const pending = assertDurableRejoinStorageAdmission(f.owner, f.options);
    await entered.promise;
    const closing = f.owner.clear();
    const revision = f.owner.replicaRevisionByReplicaId.get(f.row.replica_id);
    release.resolve();
    await t.rejects(pending, {code: 'DURABLE_REJOIN_LIFECYCLE_AUTHORITY_CHANGED'});
    await closing;
    t.equal(f.owner.getState(f.row.replica_id), null);
    t.equal(f.owner.replicaRevisionByReplicaId.get(f.row.replica_id), revision,
      'old read completion neither installs a snapshot nor issues a newer admission');
    t.equal(f.store.mutations.length, 0);
});

test('seed handler attachment asserts the exact installed ACTIVE generation ' +
  'without publishing a second snapshot', async (t) => {
  initializeTestEnvironment();
  const service = new BootstrapService({
    bootIncarnation: 1,
    nodeId: 'seed-node-a',
    nodeAddress: 'ws://localhost:19102',
    wsPort: 19102,
    config: {partitionDbPath: ':memory:'},
  });
  t.teardown(() => service.shutdown());
  service.logger = quietLogger();
  const partition = {partitionId: 'p1'};
  const partitions = new Map([['p1-r1', partition]]);
  let snapshotCount = 0;
  let transitionCount = 0;
  const stateMachine = {
    getState(replicaId) {
      return {
        replicaId,
        partitionId: 'p1',
        nodeId: 'seed-node-a',
        state: 'active',
        serviceId: replicaId,
        durableVersionColumn: 'state_entered_at',
        durableVersion: 101,
      };
    },
    getStateCounts() {
      return {active: 1};
    },
    registerReplicaSnapshot() {
      snapshotCount += 1;
      return true;
    },
    transition() {
      transitionCount += 1;
      return true;
    },
  };

  const summary = service.registerReplicasWithStateMachine(
    stateMachine,
    partitions,
  );

  t.equal(summary.registeredCount, 1);
  t.equal(summary.expectedPersistCount, 0);
  t.equal(snapshotCount, 0,
    'seed STOPPED to ACTIVE activation is not repeated during attachment');
  t.equal(transitionCount, 0,
    'ordinary lifecycle transitions are not reused by seed attachment');
});
