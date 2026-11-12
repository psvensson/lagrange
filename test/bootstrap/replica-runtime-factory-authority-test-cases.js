import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {ReplicaLifecycleOwner} from '../../src/bootstrap/shared/replica-handler-setup.js';
import {ReplicaHandler} from '../../src/node/replica-handler.js';
import {ReplicaStateMachine} from '../../src/node/replica-state-machine.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {createReplicaRuntimePublication, publishReplicaRuntime} from
  '../../src/node/replica-runtime-publication.js';
import {PARTITION_RUNTIME_PUBLICATION_REFUSED} from
  '../../src/partition/partition-runtime-publication.js';
import {assertDurableRejoinStorageAdmission} from
  '../../src/bootstrap/durable-rejoin-storage-admission.js';
import {createLifecycleCdcService, createLifecycleServiceRow, createLifecycleStateStore} from
  '../test-helpers/lifecycle-state-store.js';
import {bindRegisteredReplicaHandler} from '../test-helpers/replica-handler-identity-fixture.js';
import {initializeTestEnvironment} from './node-joining-service-test-support.js';

// These factory publication controls retain a real authoritative ACTIVE
// admission before the real constructor. Only the per-instance initialize
// method is held; they do not claim native opening or fresh CREATE birth.
function bootstrapFactoryFixture(t) {
  initializeTestEnvironment();
  const service = new BootstrapService({bootIncarnation: 1, nodeId: 'factory-seed',
    nodeAddress: 'ws://localhost:19103', wsPort: 19103,
    config: {partitionDbPath: ':memory:'}});
  const row = createLifecycleServiceRow({replicaId: 'factory-p1-r1', partitionId: 'factory-p1',
    nodeId: service.nodeId, status: 'active', createdAt: 100, stateEnteredAt: 101,
    createAttemptToken: 'factory-original-attempt'});
  const store = createLifecycleStateStore({services: [row]});
  service.cdcIntegrationService = createLifecycleCdcService({store});
  service.getSystemTableCache = () => store.cache;
  service.getLeaderMessageGroupService = () => null;
  service.messageRouter = {nodeId: service.nodeId, register() {}, unregister() {}};
  service.tablePolicyService = {};
  const holder = service.replicaLifecycleOwner;
  const handler = service.acquireReplicaHandler();
  const owner = service.replicaStateMachine;
  t.teardown(async () => {
    await handler.shutdown();
    await owner.clear();
    holder.release();
  });
  return {service, row, store, owner, handler, options: {restoringExistingReplica: true,
    lifecycleAuthority: row, replicaId: row.replica_id, partitionId: row.partition_id,
    nodeId: row.node_id, tableId: 'factory-table'}};
}

async function bootstrapFactoryOptions(f, onRuntimeCreated) {
  const admission = await assertDurableRejoinStorageAdmission(f.owner, f.options);
  return {...f.options,
    runtimePublication: createReplicaRuntimePublication(f.handler, admission.row,
      admission.admission), resolveHandlerRetirementLane: () => f.owner,
    onRuntimeCreated,
    publishRuntime: (partition, hostServices) => publishReplicaRuntime(f.handler, {
      replicaId: f.row.replica_id, service: partition, sourceEvidence: admission.row,
      lifecycleOwner: f.owner, hostServices,
    })};
}

function replacementHandler(t, f) {
  const handler = new ReplicaHandler({nodeId: f.row.node_id, ownerIncarnation: 1,
    replicaStateMachine: f.owner, controlPlaneSystemTableGateway: f.store.gateway,
    systemTableCache: f.store.cache, cdcIntegrationService: {},
    createPartitionService: async () => { throw new Error('replacement is admitted before construction'); }});
  t.teardown(() => handler.shutdown());
  return handler;
}

async function publishSuccessor(t, f, handler, hostServices) {
  const admission = await assertDurableRejoinStorageAdmission(f.owner, f.options);
  const partition = new PartitionService({...f.options,
    runtimePublication: createReplicaRuntimePublication(handler, admission.row, admission.admission),
    replicaStateMachine: f.owner, resolveHandlerRetirementLane: () => f.owner});
  bindRegisteredReplicaHandler(partition, {nodeId: f.row.node_id,
    resolveHandlerRetirementLane: () => f.owner});
  t.teardown(() => partition.shutdown());
  publishReplicaRuntime(handler, {replicaId: f.row.replica_id, service: partition,
    sourceEvidence: admission.row, lifecycleOwner: f.owner, hostServices});
  return partition;
}

function prepareControlledRuntime(t, f, partition) {
  const shutdown = partition.shutdown.bind(partition);
  t.teardown(() => shutdown());
  partition.initialize = async () => {
    partition.runtimePublication.assertCurrent(partition);
    bindRegisteredReplicaHandler(partition, {nodeId: f.row.node_id,
      resolveHandlerRetirementLane: () => f.owner});
    partition.initialized = true;
    return partition;
  };
  return shutdown;
}

function registerReplicaRuntimeFactoryAuthorityTests(restoreFixture) {
  for (const changed of ['handler', 'owner', 'host', 'holder', 'boot', 'unchanged']) {
    test(`bootstrap factory retains its original host through held construction: ${changed}`, async (t) => {
      const f = bootstrapFactoryFixture(t);
      const originalHost = f.service.partitionServices;
      const entered = Promise.withResolvers();
      const release = Promise.withResolvers();
      let partition;
      const options = await bootstrapFactoryOptions(f, (created) => {
        partition = created;
        prepareControlledRuntime(t, f, partition);
        const initialize = partition.initialize;
        partition.initialize = async () => {
          await initialize();
          entered.resolve();
          await release.promise;
          return partition;
        };
      });
      const pending = f.handler.createPartitionService(options);
      await entered.promise;
      if (changed === 'handler') f.service.replicaHandler = replacementHandler(t, f);
      if (changed === 'owner') {
        const owner = new ReplicaStateMachine({nodeId: f.row.node_id, ownerIncarnation: 1,
          controlPlaneSystemTableGateway: f.store.gateway, systemTableCache: f.store.cache});
        t.teardown(() => owner.clear());
        f.service.replicaStateMachine = owner;
      }
      if (changed === 'host') f.service.partitionServices = new Map();
      if (changed === 'holder') f.service.replicaLifecycleOwner = new ReplicaLifecycleOwner();
      if (changed === 'boot') f.service.bootIncarnation += 1;
      release.resolve();
      if (changed === 'unchanged') {
        t.equal(await pending, partition);
        t.equal(originalHost.get(f.row.replica_id), partition);
        t.equal(f.handler.localServices.get(f.row.replica_id), partition);
        t.equal(partition.runtimeBinding.owner, f.owner);
        t.equal(partition.runtimePublication.isPublished(partition, partition.runtimeBinding), true);
      } else {
        await t.rejects(pending, {code: PARTITION_RUNTIME_PUBLICATION_REFUSED});
        t.equal(partition.isShutdown, true, 'the original owner releases its exact failed construction');
        t.equal(originalHost.has(f.row.replica_id), false);
        t.equal(f.service.partitionServices.has(f.row.replica_id), false);
        t.equal(f.handler.localServices.has(f.row.replica_id), false);
        t.equal(f.handler.pendingRuntimeShutdowns.has(partition), false);
      }
    });
  }

  for (const factory of ['bootstrap', 'join']) {
    for (const continuation of ['unchanged-host', 'same-map-successor', 'new-map-successor']) {
      test(`${factory} failed publication releases only its exact host residue: ${continuation}`, async (t) => {
        const f = factory === 'bootstrap' ? bootstrapFactoryFixture(t) : restoreFixture(t);
        if (factory === 'join') {
          f.service.createCdcIntegrationService = () => createLifecycleCdcService({store: f.store});
          f.service.getLeaderMessageGroupService = () => null;
          f.service.messageRouter = {nodeId: f.row.node_id, register() {}, unregister() {}};
          f.service.tablePolicyService = {};
        }
        const hostServices = f.service.partitionServices;
        const shutdownEntered = Promise.withResolvers();
        const releaseShutdown = Promise.withResolvers();
        let partition;
        const onRuntimeCreated = (created) => {
          partition = created;
          const shutdown = prepareControlledRuntime(t, f, partition);
          partition.shutdown = async () => {
            shutdownEntered.resolve();
            await releaseShutdown.promise;
            return shutdown();
          };
        };
        hostServices.set = function(id, value) {
          Map.prototype.set.call(this, id, value);
          f.handler.shuttingDown = true;
          return this;
        };
        const options = factory === 'bootstrap' ? await bootstrapFactoryOptions(f, onRuntimeCreated) :
          {...f.options, onRuntimeCreated};
        const pending = factory === 'bootstrap' ? f.handler.createPartitionService(options) :
          f.service.createJoinLocalPartitionService(options);
        await shutdownEntered.promise;
        t.equal(hostServices.get(f.row.replica_id), partition,
          'the first failed attempt demonstrably wrote the exact host entry');
        t.equal(partition.runtimePublication.isPublished(partition, partition.runtimeBinding), false,
          'the partial publication never acquired serving authority');
        delete hostServices.set;
        let successor;
        let successorHandler;
        if (continuation !== 'unchanged-host') {
          successorHandler = replacementHandler(t, f);
          const successorHost = continuation === 'same-map-successor' ? hostServices : new Map();
          successor = await publishSuccessor(t, f, successorHandler, successorHost);
          f.service.replicaHandler = successorHandler;
          f.service.partitionServices = successorHost;
        }
        releaseShutdown.resolve();
        await t.rejects(pending, {code: PARTITION_RUNTIME_PUBLICATION_REFUSED});
        t.equal(partition.isShutdown, true);
        t.equal(f.handler.localServices.has(f.row.replica_id), false);
        t.equal(f.handler.pendingRuntimeShutdowns.has(partition), false);
        if (continuation === 'same-map-successor') {
          t.equal(hostServices.get(f.row.replica_id), successor);
        } else {
          t.equal(hostServices.has(f.row.replica_id), false,
            'successful exact-object release also removes its original failed host residue');
        }
        if (successor) {
          t.equal(f.service.partitionServices.get(f.row.replica_id), successor);
          t.equal(successorHandler.localServices.get(f.row.replica_id), successor);
          t.equal(successor.runtimePublication.isPublished(successor, successor.runtimeBinding), true);
        }
      });
    }
  }
}

export {registerReplicaRuntimeFactoryAuthorityTests};
