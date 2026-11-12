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
import {attachPartitionRuntimePublication, PARTITION_RUNTIME_PUBLICATION_REFUSED} from
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
