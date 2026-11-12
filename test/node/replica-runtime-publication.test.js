// The real handler/lifecycle publication owners consume exact authoritative
// row admission. Only the already constructed runtime and transport hop are
// controlled here; CREATE/seed/restore/snapshot composition has its own roots.
import {test} from '../../src/test-helpers/tap.js';
import {EventEmitter} from 'node:events';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ReplicaHandler} from '../../src/node/replica-handler.js';
import {ReplicaStateMachine} from '../../src/node/replica-state-machine.js';
import {captureReplicaAdmission, runSerializedReplicaMutation} from
  '../../src/node/replica-state-machine-serialization.js';
import {installAuthoritativeReplicaLifecycleInLane} from
  '../../src/node/replica-state-machine-recovery.js';
import {settledTurn, turnChainValue} from '../../src/raft/raft-rs-turn-answer.js';
import {createReplicaRuntimePublication, publishReplicaRuntime} from
  '../../src/node/replica-runtime-publication.js';
import {captureReplicaRuntimeObservation} from '../../src/node/replica-runtime-observation.js';
import {attachPartitionRuntimePublication, bindPartitionRuntimeLifecycle,
  PARTITION_RUNTIME_PUBLICATION_REFUSED} from
  '../../src/partition/partition-runtime-publication.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {createPartitionServiceFixture} from '../test-helpers/partition-service-fixture.js';
import {bindRegisteredReplicaHandler} from '../test-helpers/replica-handler-identity-fixture.js';
import {createLifecycleServiceRow, createLifecycleStateStore, createPartitionRow} from
  '../test-helpers/lifecycle-state-store.js';

const REFUSED = Object.freeze({code: PARTITION_RUNTIME_PUBLICATION_REFUSED});

function initializeEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
}

function installDeclaredSource(owner, row) {
  const replicaId = row.service_id;
  const admission = captureReplicaAdmission(owner, replicaId);
  return turnChainValue(runSerializedReplicaMutation(owner, replicaId,
    () => settledTurn(installAuthoritativeReplicaLifecycleInLane(
      owner, replicaId, row, admission,
    ))));
}

async function publicationFixture(t) {
  initializeEnvironment();
  const row = createLifecycleServiceRow({replicaId: 'publication-r1',
    partitionId: 'publication-p1', nodeId: 'publication-node', status: 'active',
    createdAt: 100, stateEnteredAt: 100, createAttemptToken: 'original-attempt'});
  const store = createLifecycleStateStore({services: [row],
    partitions: [createPartitionRow({partitionId: row.partition_id})]});
  const owner = new ReplicaStateMachine({nodeId: row.node_id,
    systemTableCache: store.cache, controlPlaneSystemTableGateway: store.gateway});
  await installDeclaredSource(owner, row);
  const handler = new ReplicaHandler({nodeId: row.node_id, ownerIncarnation: 1,
    dataDir: '/tmp/replica-publication-unit', systemTableCache: store.cache,
    controlPlaneSystemTableGateway: store.gateway, cdcIntegrationService: {},
    replicaStateMachine: owner, createPartitionService: () => {
      throw new Error('this owner-level fixture constructs no native runtime');
    }});
  t.teardown(async () => {
    handler.shuttingDown = true;
    await owner.clear();
  });
  const construct = (source = row, predecessor = null) => {
    const publication = createReplicaRuntimePublication(handler, source,
      captureReplicaAdmission(owner, source.service_id), predecessor);
    const service = bindRegisteredReplicaHandler(Object.assign(new EventEmitter(), {
      replicaId: source.replica_id, partitionId: source.partition_id, nodeId: source.node_id,
      raft: {}, isShutdown: false,
    }), {nodeId: row.node_id, resolveHandlerRetirementLane: () => owner});
    attachPartitionRuntimePublication(service, publication);
    return service;
  };
  const publish = (service, source = row, predecessor = null, hostServices = undefined) =>
    publishReplicaRuntime(handler, {replicaId: row.service_id, service,
      sourceEvidence: source, lifecycleOwner: owner, hostServices}, predecessor);
  return {row, store, owner, handler, construct, publish};
}

test('runtime publication retains the admitted source when the caller mutates its row',
  async (t) => {
    const f = await publicationFixture(t);
    const callerRow = {...f.row};
    const service = f.construct(callerRow);
    const other = {...f.row, service_id: 'other-r1', replica_id: 'other-r1'};
    await installDeclaredSource(f.owner, other);
    callerRow.service_id = other.service_id;
    callerRow.created_at = 900;
    t.equal(service.runtimePublication.assertCurrent(service), true,
      'caller edits do not revoke or redirect the retained original source');
    const advanced = {...f.row, state_entered_at: 200};
    await installDeclaredSource(f.owner, advanced);
    t.throws(() => service.runtimePublication.assertCurrent(service), REFUSED,
      'a second unchanged ID cannot lend its admission to the stale original runtime');
    t.equal(f.handler.getTrackedService(f.row.service_id), null);
  });

test('published runtime authority survives its own lifecycle status revisions and replay',
  async (t) => {
    const f = await publicationFixture(t);
    const service = f.construct();
    const hostServices = new Map();
    const first = f.publish(service, f.row, null, hostServices);
    t.equal(service.runtimePublication.assertCurrent(service), true);
    t.equal(f.publish(service, f.row, null, hostServices), first,
      'same exact published runtime is idempotent');
    t.equal(await f.handler.updateReplicaStatus(f.row.service_id, 'failed'), true);
    const current = f.handler.localReplicas.get(f.row.service_id);
    t.not(current, first, 'the status owner published its new record');
    t.equal(current.runtimeBinding, first.runtimeBinding,
      'status publication retains the exact immutable runtime incarnation');
    t.equal(service.runtimePublication.assertCurrent(service), true,
      'legitimate status revisions do not reuse the old construction admission');
    t.equal(f.publish(service), current, 'replay returns the current exact bound record');
    t.equal(current.status, 'failed', 'replay cannot restore the original ACTIVE status');
    t.equal(hostServices.get(f.row.service_id), service);
  });

test('an admitted producer cannot publish into another handler sharing its lifecycle owner',
  async (t) => {
    const f = await publicationFixture(t);
    const service = f.construct();
    const foreign = new ReplicaHandler({nodeId: f.row.node_id, ownerIncarnation: 1,
      replicaStateMachine: f.owner, systemTableCache: f.store.cache,
      controlPlaneSystemTableGateway: f.store.gateway, cdcIntegrationService: {},
      createPartitionService: () => { throw new Error('no construction in destination control'); }});
    t.teardown(async () => {
      foreign.shuttingDown = true;
      await foreign.participantReleaseRecovery.shutdown();
      foreign.localServices.clear();
    });
    t.throws(() => publishReplicaRuntime(foreign, {replicaId: f.row.service_id, service,
      sourceEvidence: f.row, lifecycleOwner: f.owner}), REFUSED,
    'a matching lifecycle owner does not replace the original handler admission');
    t.equal(foreign.getTrackedService(f.row.service_id), null);
    t.equal(foreign.localReplicas.has(f.row.service_id), false);
    t.equal(f.handler.getTrackedService(f.row.service_id), null);
    t.equal(service.runtimePublication.assertCurrent(service), true,
      'refused foreign destination does not consume the original admitted producer');
    const published = f.publish(service);
    t.equal(published.service, service);
    t.equal(service.runtimePublication.assertCurrent(service), true,
      'the unchanged original destination remains publishable');
  });

test('first lifecycle binding refuses a foreign owner before installing immutable runtime identity',
  async (t) => {
    const f = await publicationFixture(t);
    const service = f.construct();
    const foreign = new ReplicaStateMachine({nodeId: f.row.node_id,
      systemTableCache: f.store.cache, controlPlaneSystemTableGateway: f.store.gateway});
    t.teardown(() => foreign.clear());
    t.throws(() => bindPartitionRuntimeLifecycle(service, foreign, f.row), REFUSED);
    t.equal(service.runtimeBinding, undefined,
      'a foreign first binder cannot poison the original producer with an immutable association');
    t.equal(service.runtimePublication.assertCurrent(service), true,
      'the original retained admission survives the refused binding');
    const binding = bindPartitionRuntimeLifecycle(service, f.owner, f.row);
    t.equal(binding.owner, f.owner);
    t.equal(f.publish(service).runtimeBinding, binding,
      'the original owner still binds and publishes the exact same runtime');
  });

test('replacement consumes its original predecessor and revokes the old publication', async (t) => {
  const f = await publicationFixture(t);
  const first = f.construct();
  f.publish(first);
  const original = captureReplicaRuntimeObservation(f.handler, f.row.service_id);
  t.ok(original.sourceEvidence, 'the original binding supplies full source evidence');
  const second = f.construct(original.sourceEvidence, first);
  f.publish(second, original.sourceEvidence, first);
  t.equal(second.runtimePublication.assertCurrent(second), true);
  t.throws(() => first.runtimePublication.assertCurrent(first), REFUSED,
    'the same logical ID cannot make the replaced runtime current');
  t.throws(() => f.publish(first), REFUSED, 'old replay cannot replace its successor');
  t.equal(f.handler.getTrackedService(f.row.service_id), second);
});

test('reentrant map publication cannot expose a partially published runtime binding', async (t) => {
  const f = await publicationFixture(t);
  const service = f.construct();
  const hostServices = new Map();
  const setLocal = f.handler.setLocalReplica.bind(f.handler);
  f.handler.setLocalReplica = (...args) => {
    t.throws(() => service.runtimePublication.assertCurrent(service), REFUSED,
      'publication assertion refuses during its own commit');
    t.throws(() => f.publish(service), REFUSED,
      'recursive publication cannot reacquire the admitted producer');
    return setLocal(...args);
  };
  hostServices.set = (key, value) => {
    const partial = captureReplicaRuntimeObservation(f.handler, key);
    t.equal(partial.sourceEvidence, null,
      'handler maps alone do not grant observation before the commit finishes');
    return Map.prototype.set.call(hostServices, key, value);
  };
  f.publish(service, f.row, null, hostServices);
  t.equal(service.runtimePublication.assertCurrent(service), true,
    'the completed exact publication remains usable');
  t.ok(captureReplicaRuntimeObservation(f.handler, f.row.service_id).sourceEvidence);
});

test('failed map publication retains a refused exact runtime for cleanup', async (t) => {
  const f = await publicationFixture(t);
  const service = f.construct();
  const hostServices = new Map();
  hostServices.set = () => { throw new Error('host publication failed'); };
  t.throws(() => f.publish(service, f.row, null, hostServices), /host publication failed/);
  t.throws(() => service.runtimePublication.assertCurrent(service), REFUSED);
  t.throws(() => f.publish(service), REFUSED,
    'partial handler records cannot renew original admission');
  t.equal(captureReplicaRuntimeObservation(f.handler, f.row.service_id).sourceEvidence, null);
});

test('reentrant lifecycle advancement cannot renew a queued runtime publication', async (t) => {
  const f = await publicationFixture(t);
  const first = f.construct();
  f.publish(first);
  const second = f.construct(f.row, first);
  const hostServices = new Map([[f.row.service_id, first]]);
  const setLocal = f.handler.setLocalReplica.bind(f.handler);
  let advanced = false;
  let advanceTurn;
  f.handler.setLocalReplica = (...args) => {
    const record = setLocal(...args);
    advanceTurn = runSerializedReplicaMutation(f.owner, f.row.service_id, () => {
      advanced = installAuthoritativeReplicaLifecycleInLane(f.owner, f.row.service_id,
        {...f.row, status: 'failed', state_entered_at: 200},
        captureReplicaAdmission(f.owner, f.row.service_id));
      return settledTurn(advanced);
    });
    return record;
  };
  t.throws(() => f.publish(second, f.row, first, hostServices), REFUSED,
    'the original admission must remain current after its own metadata observer');
  t.ok(advanceTurn?.settled, 'the existing idle lane ran synchronously in the observer');
  await turnChainValue(advanceTurn);
  t.equal(advanced, true, 'the existing lifecycle lane accepted the newer canonical observation');
  t.equal(f.handler.getTrackedService(f.row.service_id), first,
    'old publication cannot overwrite its exact original predecessor after authority changes');
  t.equal(hostServices.get(f.row.service_id), first);
  t.throws(() => second.runtimePublication.assertCurrent(second), REFUSED);
});

test('reentrant predecessor replacement cannot be normalized into the publishing runtime',
  async (t) => {
    const f = await publicationFixture(t);
    const first = f.construct();
    f.publish(first);
    const second = f.construct(f.row, first);
    const hostile = {replicaId: f.row.replica_id, partitionId: f.row.partition_id};
    const hostServices = new Map([[f.row.service_id, first]]);
    const setLocal = f.handler.setLocalReplica.bind(f.handler);
    f.handler.setLocalReplica = (...args) => {
      const record = setLocal(...args);
      // A hostile map mutation is an interference control, never publication
      // authority for this stand-in or for the candidate being committed.
      f.handler.localServices.set(f.row.service_id, hostile);
      return record;
    };
    t.throws(() => f.publish(second, f.row, first, hostServices), REFUSED);
    t.equal(f.handler.getTrackedService(f.row.service_id), hostile,
      'a stale continuation does not overwrite the changed predecessor');
    t.equal(hostServices.get(f.row.service_id), first);
    t.throws(() => second.runtimePublication.assertCurrent(second), REFUSED);
  });

test('reentrant owner replacement cannot finish publication under the new lifetime', async (t) => {
  const f = await publicationFixture(t);
  const service = f.construct();
  const replacementOwner = new ReplicaStateMachine({nodeId: f.row.node_id,
    ownerIncarnation: 2, systemTableCache: f.store.cache,
    controlPlaneSystemTableGateway: f.store.gateway});
  t.teardown(() => replacementOwner.clear());
  const hostServices = new Map();
  hostServices.set = (key, value) => {
    f.handler.replicaStateMachine = replacementOwner;
    return Map.prototype.set.call(hostServices, key, value);
  };
  t.throws(() => f.publish(service, f.row, null, hostServices), REFUSED);
  t.throws(() => service.runtimePublication.assertCurrent(service), REFUSED,
    'a callback cannot convert the original producer into a newer published owner');
  t.equal(captureReplicaRuntimeObservation(f.handler, f.row.service_id).sourceEvidence, null);
});

test('real PartitionService requires publication authority and fixture cleanup revokes it',
  async (t) => {
    initializeEnvironment();
    const options = {partitionId: 'fixture-p1', tableId: 'fixture-table',
      replicaId: 'fixture-r1', nodeId: 'fixture-node'};
    t.throws(() => new PartitionService(options), REFUSED,
      'the production constructor has no unguarded admission path');
    const revoked = createPartitionServiceFixture({...options, replicaId: 'fixture-revoked'});
    revoked.fixtureRuntimeAdmission.revoke();
    t.equal(revoked.isShutdown, false, 'revocation is independent of the shutdown flag');
    t.throws(() => revoked.runtimePublication.assertCurrent(revoked), REFUSED,
      'explicit fixture revocation refuses the still-constructed exact runtime');
    await revoked.shutdown();
    const service = createPartitionServiceFixture(options);
    t.equal(service.runtimePublication.assertCurrent(service), true);
    await service.shutdown();
    t.throws(() => service.runtimePublication.assertCurrent(service), REFUSED,
      'cleanup permanently revokes the controlled fixture authority');
  });
