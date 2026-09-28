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
    t.match(writer.calls[0].whereClause, {service_id: REPLICA_ID,
      replica_id: REPLICA_ID, status: 'stopped', created_at: 100,
      updated_at: 101}, 'UPDATE carries full observed incarnation fence');
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
      updated_at: 101}, 'removal staging fences the observed ACTIVE generation');
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
