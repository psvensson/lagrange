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
import {registerReplicaRuntimeFactoryAuthorityTests} from
  './replica-runtime-factory-authority-test-cases.js';

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

registerReplicaRuntimeFactoryAuthorityTests(restoreFixture);

async function publishedRestore(t, f) {
  const admission = await assertDurableRejoinStorageAdmission(f.owner, f.options);
  const partition = new PartitionService({...f.options,
    runtimePublication: createReplicaRuntimePublication(f.handler, admission.row,
      admission.admission), resolveHandlerRetirementLane: () => f.owner});
  bindRegisteredReplicaHandler(partition, {nodeId: f.row.node_id,
    resolveHandlerRetirementLane: () => f.owner});
  const shutdown = partition.shutdown.bind(partition);
  t.teardown(() => shutdown());
  f.service.trackJoinPartitionReplica(f.row.replica_id, f.row.partition_id, partition,
    {...admission, handler: f.handler, hostServices: f.service.partitionServices});
  return {partition, shutdown};
}

test('held join shutdown preserves a canonically published successor in every map', async (t) => {
  const f = restoreFixture(t);
  const {partition, shutdown} = await publishedRestore(t, f);
  const expected = captureReplicaRuntimeObservation(f.handler, f.row.replica_id);
  const successor = new PartitionService({...f.options,
    runtimePublication: createReplicaRuntimePublication(f.handler, expected.sourceEvidence,
      expected.admission, partition), resolveHandlerRetirementLane: () => f.owner});
  bindRegisteredReplicaHandler(successor, {nodeId: f.row.node_id,
    resolveHandlerRetirementLane: () => f.owner});
  t.teardown(() => successor.shutdown());
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  partition.shutdown = async () => {
    entered.resolve();
    await release.promise;
    return shutdown();
  };
  const stopping = f.service.stopJoinPartitionReplica({}, {replicaOptions: f.options});
  await entered.promise;
  let successorRecord;
  try {
    successorRecord = f.handler.replaceLocalReplicaService(f.row.replica_id, successor,
      expected, f.service.partitionServices);
  } finally {
    release.resolve();
  }
  await stopping;
  t.equal(partition.isShutdown, true, 'the original exact runtime completed shutdown');
  t.equal(f.service.partitionServices.get(f.row.replica_id), successor);
  t.equal(f.handler.localServices.get(f.row.replica_id), successor);
  t.equal(f.handler.localReplicas.get(f.row.replica_id), successorRecord,
    'old completion cannot remove the replacement publication record');
  t.equal(f.handler.pendingRuntimeShutdowns.has(partition), false);
});

test('unchanged join shutdown releases its exact publication and all owned map entries', async (t) => {
  const f = restoreFixture(t);
  const {partition} = await publishedRestore(t, f);
  await f.service.stopJoinPartitionReplica({}, {replicaOptions: f.options});
  t.equal(partition.isShutdown, true);
  t.equal(f.service.partitionServices.has(f.row.replica_id), false);
  t.equal(f.handler.localServices.has(f.row.replica_id), false);
  t.equal(f.handler.localReplicas.has(f.row.replica_id), false);
  t.equal(f.handler.pendingRuntimeShutdowns.has(partition), false);
});

test('failed join shutdown retains exact custody and retries after serving has stopped', async (t) => {
  const f = restoreFixture(t);
  const {partition, shutdown} = await publishedRestore(t, f);
  const failure = new Error('controlled release fails after transport retirement');
  let attempts = 0;
  partition.shutdown = async () => {
    attempts += 1;
    await shutdown();
    if (attempts === 1) throw failure;
  };
  await t.rejects(f.service.stopJoinPartitionReplica({}, {replicaOptions: f.options}), failure);
  t.equal(partition.isShutdown, true, 'serving liveness is distinct from unfinished release');
  t.equal(f.handler.pendingRuntimeShutdowns.has(partition), true,
    'the existing exact-object owner retains the failed join release');
  t.equal(f.service.partitionServices.get(f.row.replica_id), partition);
  await f.service.stopJoinPartitionReplica({}, {replicaOptions: f.options});
  t.equal(attempts, 2, 'one explicit retry continues the retained release');
  t.equal(f.handler.pendingRuntimeShutdowns.has(partition), false);
  t.equal(f.service.partitionServices.has(f.row.replica_id), false);
  t.equal(f.handler.localServices.has(f.row.replica_id), false);
  t.equal(f.handler.localReplicas.has(f.row.replica_id), false);
});

test('same-runtime concurrent cleanup shares its original pending custody cell', async (t) => {
  const f = restoreFixture(t);
  const {partition, shutdown} = await publishedRestore(t, f);
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  let attempts = 0;
  partition.shutdown = async () => {
    attempts += 1;
    entered.resolve();
    await release.promise;
    return shutdown();
  };
  const first = f.handler.fenceFailedReplicaCreateRuntime(f.row.replica_id,
    f.row.partition_id, partition);
  await entered.promise;
  const retained = f.handler.pendingRuntimeShutdowns.get(partition);
  const second = f.handler.fenceFailedReplicaCreateRuntime(f.row.replica_id,
    f.row.partition_id, partition);
  t.equal(f.handler.pendingRuntimeShutdowns.get(partition), retained,
    'concurrent entry cannot replace the cell owned by the first release');
  t.equal(attempts, 1, 'one exact runtime has one in-flight shutdown attempt');
  release.resolve();
  t.same(await Promise.all([first, second]), [true, true]);
  t.equal(f.handler.pendingRuntimeShutdowns.has(partition), false);
});

test('old exact-runtime cleanup cannot clear a replaced pending cell', async (t) => {
  const f = restoreFixture(t);
  const {partition, shutdown} = await publishedRestore(t, f);
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  partition.shutdown = async () => {
    entered.resolve();
    await release.promise;
    return shutdown();
  };
  const pending = f.handler.fenceFailedReplicaCreateRuntime(f.row.replica_id,
    f.row.partition_id, partition);
  await entered.promise;
  const retained = f.handler.pendingRuntimeShutdowns.get(partition);
  const replacement = Object.freeze({...retained});
  f.handler.pendingRuntimeShutdowns.set(partition, replacement);
  release.resolve();
  await t.rejects(pending, {code: 'REPLICA_RUNTIME_CLEANUP_CUSTODY_CHANGED'});
  t.equal(f.handler.pendingRuntimeShutdowns.get(partition), replacement,
    'the earlier completion never deletes a later cell for the same object');
  t.equal(f.handler.localServices.get(f.row.replica_id), partition,
    'changed cleanup custody grants no map deletion');
  t.equal(await f.handler.fenceFailedReplicaCreateRuntime(f.row.replica_id,
    f.row.partition_id, partition), true, 'explicit re-entry settles the retained replacement cell');
});

test('missing shutdown method is a retained release failure', async (t) => {
  const f = restoreFixture(t);
  const {partition, shutdown} = await publishedRestore(t, f);
  partition.shutdown = undefined;
  await t.rejects(f.handler.fenceFailedReplicaCreateRuntime(f.row.replica_id,
    f.row.partition_id, partition), {code: 'REPLICA_RUNTIME_SHUTDOWN_REQUIRED'});
  t.equal(f.handler.pendingRuntimeShutdowns.has(partition), true);
  t.equal(f.handler.localServices.get(f.row.replica_id), partition);
  partition.shutdown = shutdown;
  t.equal(await f.handler.fenceFailedReplicaCreateRuntime(f.row.replica_id,
    f.row.partition_id, partition), true);
  t.equal(f.handler.pendingRuntimeShutdowns.has(partition), false);
});

test('joined runtime cleanup retains the first actual primary without another shutdown attempt', async (t) => {
  const f = restoreFixture(t);
  const {partition, shutdown} = await publishedRestore(t, f);
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  const primary = new Error('original CREATE failure joining existing release');
  const later = new Error('later CREATE failure cannot replace original cause');
  const cleanup = new Error('controlled exact-runtime shutdown failure');
  let attempts = 0;
  partition.shutdown = async () => {
    attempts += 1;
    entered.resolve();
    await release.promise;
    throw cleanup;
  };
  const first = f.handler.fenceFailedReplicaCreateRuntime(f.row.replica_id,
    f.row.partition_id, partition);
  await entered.promise;
  const cell = f.handler.pendingRuntimeShutdowns.get(partition);
  const second = f.handler.fenceFailedReplicaCreateRuntime(f.row.replica_id,
    f.row.partition_id, partition, primary);
  const third = f.handler.fenceFailedReplicaCreateRuntime(f.row.replica_id,
    f.row.partition_id, partition, later);
  const results = Promise.allSettled([first, second, third]);
  t.equal(f.handler.pendingRuntimeShutdowns.get(partition), cell);
  t.equal(attempts, 1, 'adding causal context does not start another physical release');
  release.resolve();
  for (const result of await results) {
    t.equal(result.status, 'rejected');
    t.equal(result.reason?.cause, primary, 'every joined caller retains the first actual primary');
    t.equal(result.reason?.errors?.[1], cleanup);
  }
  partition.shutdown = shutdown;
  t.equal(await f.handler.fenceFailedReplicaCreateRuntime(f.row.replica_id,
    f.row.partition_id, partition, later), true, 'explicit retry releases the same owned object');
});

test('a live runtime cleanup carrier cannot be replaced or discarded', async (t) => {
  const f = restoreFixture(t);
  const {partition, shutdown} = await publishedRestore(t, f);
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  partition.shutdown = async () => {
    entered.resolve();
    await release.promise;
    return shutdown();
  };
  const pending = f.handler.fenceFailedReplicaCreateRuntime(f.row.replica_id,
    f.row.partition_id, partition);
  await entered.promise;
  const originalMap = f.handler.pendingRuntimeShutdowns;
  const cell = originalMap.get(partition);
  t.throws(() => {
    f.handler.pendingRuntimeShutdowns = new Map([[partition, cell]]);
  }, TypeError, 'owner construction seals the exact cleanup carrier');
  t.equal(f.handler.pendingRuntimeShutdowns, originalMap);
  release.resolve();
  t.equal(await pending, true);
  t.equal(originalMap.has(partition), false,
    'completion releases the same map/cell that originally retained the runtime');
});

test('a wrong-subject cleanup cannot acquire the original runtime primary failure', async (t) => {
  const f = restoreFixture(t);
  const {partition, shutdown} = await publishedRestore(t, f);
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  const foreignPrimary = new Error('foreign replica must not acquire the retained cause');
  const originalPrimary = new Error('first failure of the original admitted subject');
  const cleanup = new Error('controlled exact-runtime shutdown failure');
  let attempts = 0;
  partition.shutdown = async () => {
    attempts += 1;
    entered.resolve();
    await release.promise;
    throw cleanup;
  };
  const first = f.handler.fenceFailedReplicaCreateRuntime(f.row.replica_id,
    f.row.partition_id, partition);
  await entered.promise;
  const cell = f.handler.pendingRuntimeShutdowns.get(partition);
  await t.rejects(f.handler.fenceFailedReplicaCreateRuntime('foreign-replica',
    f.row.partition_id, partition, foreignPrimary),
  {code: 'REPLICA_RUNTIME_CLEANUP_CUSTODY_CHANGED'});
  t.equal(f.handler.pendingRuntimeShutdowns.get(partition), cell,
    'rejected subject cannot replace the original custody cell');
  t.equal(cell.failure.primary, null,
    'rejected subject cannot latch its cause before identity validation');
  const joined = f.handler.fenceFailedReplicaCreateRuntime(f.row.replica_id,
    f.row.partition_id, partition, originalPrimary);
  const results = Promise.allSettled([first, joined]);
  t.equal(attempts, 1, 'the legitimate join retains the original physical attempt');
  release.resolve();
  for (const result of await results) {
    t.equal(result.status, 'rejected');
    t.equal(result.reason?.cause, originalPrimary);
    t.equal(result.reason?.errors?.[1], cleanup);
  }
  partition.shutdown = shutdown;
  t.equal(await f.handler.fenceFailedReplicaCreateRuntime(f.row.replica_id,
    f.row.partition_id, partition), true);
});

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

for (const debtDisposition of ['replaced', 'removed', 'unchanged']) {
  test(`durable restore preserves original debt ownership when ${debtDisposition} during read`, async (t) => {
    const f = restoreFixture(t);
    await assertDurableRejoinStorageAdmission(f.owner, f.options);
    f.store.setBeforeMutation((mutation) => {
      if (mutation.tableName === 'partitions') throw new Error('leader effect unavailable');
    });
    t.equal(await f.owner.transition(f.row.replica_id, 'failed', {
      partitionId: f.row.partition_id, timestamp: 200, reason: 'retained-old-debt',
    }), true);
    f.store.setBeforeMutation(null);
    const originalState = f.owner.replicas.get(f.row.replica_id);
    const originalDebt = f.owner.canonicalLeaderClearDebtByReplicaId.get(f.row.replica_id);
    t.ok(originalDebt, 'actual durable transition retained its leader-clear obligation');
    const successor = {...f.row, state_entered_at: 300, updated_at: 300,
      created_at: 250, create_attempt_token: 'restored-successor-attempt'};
    f.store.durable.services.set(f.row.replica_id, {...successor});
    f.store.project('services', successor);
    const entered = Promise.withResolvers();
    const release = Promise.withResolvers();
    f.store.setBeforeAuthoritativeRead(async () => { entered.resolve(); await release.promise; });
    const options = {...f.options, lifecycleAuthority: successor};
    const pending = assertDurableRejoinStorageAdmission(f.owner, options);
    await entered.promise;
    const revision = f.owner.replicaRevisionByReplicaId.get(f.row.replica_id);
    const expectedDebt = debtDisposition === 'replaced' ? Object.freeze({...originalDebt}) :
      debtDisposition === 'removed' ? undefined : originalDebt;
    if (expectedDebt) f.owner.canonicalLeaderClearDebtByReplicaId.set(f.row.replica_id, expectedDebt);
    else f.owner.canonicalLeaderClearDebtByReplicaId.delete(f.row.replica_id);
    release.resolve();
    if (debtDisposition === 'unchanged') {
      t.same((await pending).row, successor,
        'unchanged original admission/debt permits its own accepted successor install');
      t.equal(f.owner.getState(f.row.replica_id)?.state, 'active');
      t.equal(f.owner.canonicalLeaderClearDebtByReplicaId.has(f.row.replica_id), false);
    } else {
      await t.rejects(pending, {code: 'DURABLE_REJOIN_LIFECYCLE_AUTHORITY_CHANGED'});
      t.equal(f.owner.replicas.get(f.row.replica_id), originalState);
      t.equal(f.owner.replicaRevisionByReplicaId.get(f.row.replica_id), revision,
        'read completion cannot adopt a new local revision');
      t.equal(f.owner.canonicalLeaderClearDebtByReplicaId.get(f.row.replica_id), expectedDebt,
        'old restore never deletes or recreates changed debt');
    }
  });
}

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
