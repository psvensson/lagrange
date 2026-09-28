import {test} from '../../src/test-helpers/tap.js';
import {SERVICE_TYPE, TABLES} from '../../src/constants/index.js';
import {MessageGroupServiceRowOwner} from
  '../../src/message-group/message-group-service-row-owner.js';
import {createLifecycleCdcService, createLifecycleServiceRow} from
  '../test-helpers/lifecycle-state-store.js';

const REPLICA_ID = 'mg-1-r1';
function stoppedRow(overrides = {}) {
  return createLifecycleServiceRow({serviceId: REPLICA_ID,
    replicaId: REPLICA_ID, replicaIdentity: REPLICA_ID,
    serviceType: SERVICE_TYPE.MESSAGE_GROUP, groupId: 'mg-1',
    nodeId: 'node-a', status: 'stopped', createdAt: 100, updatedAt: 101,
    ...overrides});
}
function activation(owner) {
  return owner.activateReplica({groupId: 'mg-1', replicaId: REPLICA_ID,
    nodeId: 'node-a', service: {isLeaderReplica: () => true}});
}

test('MessageGroupServiceRowOwner activates exact STOPPED incarnation by UPDATE',
  async (t) => {
    const writer = createLifecycleCdcService({services: [stoppedRow()]});
    const owner = new MessageGroupServiceRowOwner({now: () => 1234,
      systemTableWriter: writer});
    const row = await activation(owner);
    const durable = writer.store.durableRow(TABLES.SERVICES, REPLICA_ID);
    t.equal(row.status, 'active');
    t.equal(durable.status, 'active', 'durable authority becomes ACTIVE');
    t.equal(durable.created_at, 100, 'activation preserves incarnation');
    t.same(writer.calls.map((call) => call.type), ['update'],
      'activation performs no second INSERT or UPSERT');
    t.same(writer.calls[0].whereClause, {service_id: REPLICA_ID,
      service_type: SERVICE_TYPE.MESSAGE_GROUP, group_id: 'mg-1',
      node_id: 'node-a', replica_id: REPLICA_ID, status: 'stopped',
      created_at: 100, state_entered_at: 100},
    'UPDATE carries the full identity, source state and lifecycle generation');
    t.equal(durable.state_entered_at, 1234,
      'activation is a lifecycle transition that advances the generation');
    t.equal((await activation(owner)).status, 'active');
    t.equal(writer.calls.length, 1,
      'duplicate valid activation evidence is idempotent');
  });

test('MessageGroupServiceRowOwner observes lost and zero-row outcomes',
  async (t) => {
    const lostWriter = createLifecycleCdcService({services: [stoppedRow()]});
    lostWriter.store.setApplyThenThrowStatus('active');
    const lostOwner = new MessageGroupServiceRowOwner({now: () => 1234,
      systemTableWriter: lostWriter});
    t.equal((await activation(lostOwner)).status, 'active',
      'lost acknowledgement resolves from authoritative ACTIVE state');
    const zeroWriter = createLifecycleCdcService({services: [stoppedRow()]});
    zeroWriter.store.setNextMutationBehavior({zeroRow: true});
    const zeroOwner = new MessageGroupServiceRowOwner({now: () => 1234,
      systemTableWriter: zeroWriter});
    await t.rejects(activation(zeroOwner), {code: 'ACTIVATION_OWNER_DEFERRED'},
      'exact STOPPED state remains retryable after zero-row update');
    t.same(zeroWriter.calls.map((call) => call.type), ['update'],
      'zero-row activation never falls back to creation');
  });

test('MessageGroupServiceRowOwner preserves exact ACTIVE to STOPPED removal staging',
  async (t) => {
    const writer = createLifecycleCdcService({services: [
      stoppedRow({status: 'active'}),
    ]});
    const owner = new MessageGroupServiceRowOwner({now: () => 1234,
      systemTableWriter: writer});
    const row = await owner.updateReplicaStatus({groupId: 'mg-1',
      replicaId: REPLICA_ID, nodeId: 'node-a', status: 'stopped'});
    t.equal(row.status, 'stopped');
    t.match(writer.calls[0].whereClause, {status: 'active', created_at: 100,
      state_entered_at: 100},
    'removal staging fences the observed ACTIVE lifecycle generation');
    t.equal(writer.store.durableRow(TABLES.SERVICES, REPLICA_ID).status,
      'stopped', 'removal keeps its durable STOPPED handoff contract');
  });

test('MessageGroupServiceRowOwner rejects cross-identity and unbranded rows',
  async (t) => {
    for (const row of [stoppedRow({replicaIdentity: 'mg-other-r1'}),
      {...stoppedRow(), created_at: null}]) {
      const writer = createLifecycleCdcService({services: [row],
        preserveRowsExactly: true});
      const owner = new MessageGroupServiceRowOwner({systemTableWriter: writer});
      await t.rejects(activation(owner), {code: 'SERVICE_IDENTITY_CONFLICT'},
        'cross-replica or unbranded evidence fails closed');
      t.equal(writer.calls.length, 0, 'invalid evidence performs no mutation');
    }
  });

test('MessageGroupServiceRowOwner stale callback cannot overwrite current owner',
  async (t) => {
    const replacements = [createLifecycleServiceRow({serviceId: REPLICA_ID,
      replicaId: REPLICA_ID, serviceType: SERVICE_TYPE.PARTITION_CLEANUP,
      cleanupToken: 'cleanup-token', createdAt: 200, updatedAt: 200}),
    stoppedRow({createdAt: 200, updatedAt: 200})];
    for (const replacement of replacements) {
      const writer = createLifecycleCdcService({services: [stoppedRow()]});
      writer.store.setBeforeMutation((_mutation, durable) => {
        durable[TABLES.SERVICES].set(REPLICA_ID, structuredClone(replacement));
      });
      const owner = new MessageGroupServiceRowOwner({now: () => 1234,
        systemTableWriter: writer});
      await t.rejects(activation(owner), {code: 'SERVICE_IDENTITY_CONFLICT'},
        'old-incarnation callback cannot cross current owner');
      t.same(writer.store.durableRow(TABLES.SERVICES, REPLICA_ID), replacement,
        'cleanup/newer incarnation remains authoritative');
    }
    const absentWriter = createLifecycleCdcService({services: [stoppedRow()]});
    absentWriter.store.setBeforeMutation((_mutation, durable) => {
      durable[TABLES.SERVICES].delete(REPLICA_ID);
    });
    const absentOwner = new MessageGroupServiceRowOwner({now: () => 1234,
      systemTableWriter: absentWriter});
    await t.rejects(activation(absentOwner), {code: 'CREATE_OWNER_DEFERRED'},
      'absence is handed back to creation owner');
    t.same(absentWriter.calls.map((call) => call.type), ['update'],
      'zero-row absence never creates a replacement');
  });

test('MessageGroupServiceRowOwner activation evidence survives non-lifecycle ' +
  'writes and fails closed after a genuine lifecycle transition',
async (t) => {
  const writer = createLifecycleCdcService({services: []});
  const owner = new MessageGroupServiceRowOwner({systemTableWriter: writer});
  const leader = {isLeaderReplica: () => true};
  const register = (replicaId, timestamp) => owner.registerReplica({
    groupId: 'mg-1', replicaId, nodeId: 'node-a', service: leader,
    timestamp, status: 'stopped'});
  const activate = (replicaId, registrationEvidence, timestamp) =>
    owner.activateReplica({groupId: 'mg-1', replicaId, nodeId: 'node-a',
      service: leader, registrationEvidence, timestamp});

  // Registration at generation G, then an unrelated raft-role publication
  // that rewrites ordinary metadata and bumps updated_at.
  const evidence = await register('mg-1-r1', 500);
  t.equal(evidence.state_entered_at, 500,
    'registration stamps the canonical lifecycle generation G');
  await writer.updateSystemTableRow(TABLES.SERVICES,
    {service_id: 'mg-1-r1', raft_role: evidence.raft_role,
      updated_at: evidence.updated_at},
    {raft_role: 'follower', updated_at: 777});
  const roleBumped = writer.store.durableRow(TABLES.SERVICES, 'mg-1-r1');
  t.match(roleBumped, {updated_at: 777, state_entered_at: 500},
    'a non-lifecycle write never advances the lifecycle generation');

  const active = await activate('mg-1-r1', evidence, 900);
  t.match(active, {status: 'active', raft_role: 'leader',
    state_entered_at: 900},
  'activation carrying G still succeeds after the unrelated write');
  t.match(writer.store.durableRow(TABLES.SERVICES, 'mg-1-r1'),
    {status: 'active', raft_role: 'leader', state_entered_at: 900},
    'the live leader row is published ACTIVE/leader');

  // A second registration moves through a genuine lifecycle transition
  // (G -> ACTIVE -> STOPPED at G+2); delayed evidence for G fails closed.
  const staleEvidence = await register('mg-1-r2', 500);
  await activate('mg-1-r2', staleEvidence, 600);
  await owner.updateReplicaStatus({groupId: 'mg-1', replicaId: 'mg-1-r2',
    nodeId: 'node-a', status: 'stopped', timestamp: 700});
  const transitioned = writer.store.durableRow(TABLES.SERVICES, 'mg-1-r2');
  t.match(transitioned, {status: 'stopped', state_entered_at: 700},
    'the genuine transition advanced the lifecycle generation');
  await t.rejects(activate('mg-1-r2', staleEvidence, 800),
    {code: 'ACTIVATION_OWNER_DEFERRED'},
    'delayed activation carrying G fails closed');
  t.same(writer.store.durableRow(TABLES.SERVICES, 'mg-1-r2'), transitioned,
    'the newer generation is untouched');
});
