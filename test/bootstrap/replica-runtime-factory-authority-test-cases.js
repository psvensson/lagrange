import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {ReplicaLifecycleOwner} from '../../src/bootstrap/shared/replica-handler-setup.js';
import {ReplicaHandler} from '../../src/node/replica-handler.js';
import {ReplicaStateMachine} from '../../src/node/replica-state-machine.js';
import {TABLES} from '../../src/constants/tables.js';
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
import {registerReplicaRuntimeCreateIngressTests} from
  './replica-runtime-create-ingress-test-cases.js';

// These factory publication controls retain a real authoritative ACTIVE
// admission before the real constructor. Only the per-instance initialize
// method is held; they do not claim native opening or fresh CREATE birth.
function bootstrapFactoryFixture(t, source = {}) {
  initializeTestEnvironment();
  const service = new BootstrapService({bootIncarnation: 1, nodeId: 'factory-seed',
    nodeAddress: 'ws://localhost:19103', wsPort: 19103,
    config: {partitionDbPath: ':memory:'}});
  const row = createLifecycleServiceRow({replicaId: 'factory-p1-r1', partitionId: 'factory-p1',
    nodeId: service.nodeId, status: 'active', createdAt: 100, stateEnteredAt: 101,
    createAttemptToken: 'factory-original-attempt', ...source});
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
  registerReplicaRuntimeCreateIngressTests({bootstrapFactoryFixture, publishSuccessor});
  test('bootstrap publication refuses a foreign host map before binding and retains its original destination',
    async (t) => {
      const f = bootstrapFactoryFixture(t);
      const originalHost = f.service.partitionServices;
      const foreignHost = new Map();
      let partition;
      const options = await bootstrapFactoryOptions(f, (created) => {
        partition = created;
        prepareControlledRuntime(t, f, partition);
      });
      const publishOriginal = options.publishRuntime;
      options.publishRuntime = (runtime, hostServices) => {
        t.equal(hostServices, originalHost, 'the real factory retained its original host');
        let refused;
        try {
          publishOriginal(runtime, foreignHost);
        } catch (error) {
          refused = error;
        }
        t.equal(refused?.code, PARTITION_RUNTIME_PUBLICATION_REFUSED);
        t.equal(runtime.runtimeBinding, undefined,
          'a foreign destination cannot install an immutable lifecycle binding');
        t.equal(foreignHost.size, 0, 'no foreign host effect');
        t.equal(originalHost.size, 0, 'no original host effect before its own publication');
        t.equal(f.handler.localServices.size, 0, 'no physical registry effect');
        t.equal(f.handler.localReplicas.size, 0, 'no local metadata effect');
        return publishOriginal(runtime, hostServices);
      };
      const created = await f.handler.createPartitionService(options);
      t.equal(created, partition);
      t.equal(originalHost.get(f.row.replica_id), partition,
        'the unchanged original destination still publishes the exact runtime');
      t.equal(f.handler.localServices.get(f.row.replica_id), partition);
      t.equal(partition.runtimePublication.assertCurrent(partition), true);
    });

  for (const changed of ['host', 'holder', 'unchanged']) {
    test(`CREATE retains its factory producer across the first cleanup await: ${changed}`, async (t) => {
      const f = bootstrapFactoryFixture(t);
      const admission = await assertDurableRejoinStorageAdmission(f.owner, f.options);
      const entered = Promise.withResolvers();
      const release = Promise.withResolvers();
      const settleCleanup = f.handler.settlePendingReplicaRuntimeCleanup.bind(f.handler);
      f.handler.settlePendingReplicaRuntimeCleanup = async (...args) => {
        await settleCleanup(...args);
        entered.resolve();
        await release.promise;
      };
      let contextCalls = 0;
      let localWrites = 0;
      let failedProjectionAttempts = 0;
      const persistFailed = f.handler.persistOrConfirmReplicaCreateFailed.bind(f.handler);
      f.handler.persistOrConfirmReplicaCreateFailed = (...args) => {
        failedProjectionAttempts += 1;
        return persistFailed(...args);
      };
      const setLocalReplica = f.handler.setLocalReplica.bind(f.handler);
      f.handler.setLocalReplica = (...args) => {
        localWrites += 1;
        return setLocalReplica(...args);
      };
      // The actual CREATE continuation reaches its context producer only
      // after the first cleanup and authoritative identity read. Stop there,
      // before opening a native record: this is a caller-authority witness.
      const reachedContext = Object.assign(new Error('fixture context reached'),
        {code: 'FIXTURE_CONTEXT_REACHED'});
      f.handler.resolveReplicaContextWithRetry = async () => {
        contextCalls += 1;
        throw reachedContext;
      };
      const before = f.store.durableRow(TABLES.SERVICES, f.row.replica_id);
      const pending = f.handler.createReplicaAsync({operationId: 'factory-first-await',
        partitionId: f.row.partition_id, replicaId: f.row.replica_id,
        skipLifecycleStatusPersistence: true, runtimeStorageAdmission: admission,
        resumedLifecycleStatus: f.row.status}).then(
        () => null, (error) => error);
      await entered.promise;
      if (changed === 'host') f.service.partitionServices = new Map();
      if (changed === 'holder') f.service.replicaLifecycleOwner = new ReplicaLifecycleOwner();
      release.resolve();
      const failure = await pending;
      if (changed === 'unchanged') {
        t.equal(contextCalls, 1, 'the original factory reaches the next real CREATE stage');
        t.ok(localWrites > 0, 'the unchanged continuation exercises metadata publication');
        t.ok(failure, 'the declared context stop settles through the real failure path');
      } else {
        t.equal(failure?.code, PARTITION_RUNTIME_PUBLICATION_REFUSED);
        t.equal(contextCalls, 0, 'a later factory host cannot become the original caller');
        t.equal(localWrites, 0, 'obsolete success or failure may not publish metadata');
        t.equal(failedProjectionAttempts, 0, 'refusal cannot enter FAILED projection for a new caller');
        t.same(f.store.durableRow(TABLES.SERVICES, f.row.replica_id), before,
          'obsolete CREATE completion may not project failure into the retained row');
      }
    });
  }

  for (const factory of ['bootstrap', 'join']) {
    for (const changed of ['host', 'holder', 'boot']) {
      test(`${factory} publication consumes its original host inside map observers: ${changed}`, async (t) => {
        const f = factory === 'bootstrap' ? bootstrapFactoryFixture(t) : restoreFixture(t);
        if (factory === 'join') {
          f.service.createCdcIntegrationService = () => createLifecycleCdcService({store: f.store});
          f.service.getLeaderMessageGroupService = () => null;
          f.service.messageRouter = {nodeId: f.row.node_id, register() {}, unregister() {}};
          f.service.tablePolicyService = {};
        }
        const hostServices = f.service.partitionServices;
        let partition;
        let metadataEffects = 0;
        let physicalEffects = 0;
        let hostEffects = 0;
        const setLocalReplica = f.handler.setLocalReplica.bind(f.handler);
        f.handler.setLocalReplica = (id, value) => {
          const result = setLocalReplica(id, value);
          if (value.service === partition && partition !== undefined) {
            metadataEffects += 1;
            if (changed === 'host') f.service.partitionServices = new Map();
            if (changed === 'holder') f.service.replicaLifecycleOwner = new ReplicaLifecycleOwner();
            if (changed === 'boot') f.service.bootIncarnation += 1;
          }
          return result;
        };
        const physicalSet = f.handler.localServices.set.bind(f.handler.localServices);
        f.handler.localServices.set = (id, value) => {
          if (value === partition) physicalEffects += 1;
          return physicalSet(id, value);
        };
        hostServices.set = (id, value) => {
          if (value === partition) hostEffects += 1;
          return Map.prototype.set.call(hostServices, id, value);
        };
        const onRuntimeCreated = (created) => {
          partition = created;
          prepareControlledRuntime(t, f, partition);
        };
        const options = factory === 'bootstrap' ? await bootstrapFactoryOptions(f, onRuntimeCreated) :
          {...f.options, onRuntimeCreated};
        const pending = factory === 'bootstrap' ? f.handler.createPartitionService(options) :
          f.service.createJoinLocalPartitionService(options);
        await t.rejects(pending, {code: PARTITION_RUNTIME_PUBLICATION_REFUSED});
        t.equal(metadataEffects, 1, 'the reentrant host change follows a real metadata effect');
        t.equal(physicalEffects, 0, 'the original source is checked before the next physical effect');
        t.equal(hostEffects, 0, 'the original source is checked before host map publication');
        t.equal(partition.isShutdown, true, 'the original factory retains and releases its exact object');
        t.equal(hostServices.has(f.row.replica_id), false);
        t.equal(f.handler.pendingRuntimeShutdowns.has(partition), false);
      });
    }
  }

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
