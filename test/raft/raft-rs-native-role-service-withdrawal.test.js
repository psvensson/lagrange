// Real service initialization, SQLite, native queue and lifecycle wiring.
// Only the binding's status return is corrupted; publication writes are
// captured at their existing injected writer boundary.
import {test} from '../../src/test-helpers/tap.js';
import Database from 'better-sqlite3';
import path from 'node:path';
import {instantiateRaftRsCore, verifyRaftRsBinding} from
  '../../src/raft/raft-rs-binding-owner.js';
import {MessageGroupServiceRowOwner} from '../../src/message-group/message-group-service-row-owner.js';
import {PartitionServiceRowOwner} from '../../src/partition/partition-service-row-owner.js';
import {turnChainValue} from '../../src/raft/raft-rs-turn-answer.js';
import {RAFT_OPERATION_OUTCOME as OUTCOME} from
  '../../src/raft/raft-operation-port-constants.js';
const BINDING = new URL('../../src/raft/raft-rs-binding-owner.js', import.meta.url);
const FIXTURE = new URL('./raft-rs-backend/startup-cleanup-native-fixture.js', import.meta.url);
const REFUSAL = {outcome: OUTCOME.CORE_REFUSED, reason: 'invalid-native-role',
  phase: 'status-observation', retryable: false, recoveryRequired: false};

function serviceTermReader(service, kind) {
  return kind === 'message-group' ? () => service.getCurrentTerm() :
    () => service.resolveCurrentTermSafe();
}

function cancellationTarget(service, kind) {
  const target = kind !== 'wasm-service' ? service : service.timerManager;
  const method = kind !== 'wasm-service' ? 'cancelLeaderOwnedActivation' : 'stopAll';
  return {target, method};
}

function createDurableRoleProbe(f, service, kind) {
  const writes = [];
  const rowPath = path.join(f.directory, 'published-rows.db');
  const rows = new Database(rowPath);
  f.databases.push(rows);
  rows.exec('CREATE TABLE published_rows (id INTEGER PRIMARY KEY, payload TEXT NOT NULL)');
  const persist = async (data) => {
    rows.prepare('INSERT INTO published_rows(payload) VALUES (?)').run(JSON.stringify(data));
    writes.push(data);
    return {success: true, affectedRows: 1};
  };
  service.roleUpdateWriter = persist;
  service.leaderNodeUpdateWriter = persist;
  const RowOwner = kind === 'partition' ? PartitionServiceRowOwner : MessageGroupServiceRowOwner;
  const rowOwner = new RowOwner({systemTableWriter: {
    insertSystemTableRow: async (_table, row) => persist(row),
  }});
  const publishRow = () => kind === 'wasm-service' ? service.writeRoleUpdate('leader') :
    rowOwner.registerReplica({service, partitionId: service.partitionId, groupId: service.groupId,
      replicaId: service.replicaId, nodeId: service.nodeId, status: 'stopped'});
  const durableRole = () => {
    const reader = new Database(rowPath, {readonly: true});
    try {
      const row = JSON.parse(reader.prepare('SELECT payload FROM published_rows ORDER BY id DESC LIMIT 1').get().payload);
      return kind === 'wasm-service' ? row.role : row.raft_role;
    } finally {
      reader.close();
    }
  };
  return {writes, rows, publishRow, durableRole};
}

for (const kind of ['partition', 'message-group', 'wasm-service']) {
  test(`native refusal withdraws ${kind} tenure, effects and row publication`, async (t) => {
    let corrupt = false;
    const binding = {verifyRaftRsBinding, instantiateRaftRsCore: () => {
      const native = instantiateRaftRsCore();
      return Object.freeze({...native, status: (...args) => {
        const status = native.status(...args);
        if (!corrupt) return status;
        const invalid = {...status};
        delete invalid.raftState;
        return invalid;
      }});
    }};
    const loaded = await t.mockImport(FIXTURE.href, {[BINDING.href]: binding});
    const f = await loaded.createFixture({after: (cleanup) => t.teardown(cleanup)});
    const service = loaded.buildService(f, kind);
    const readTerm = serviceTermReader(service, kind);
    await service.initialize();
    await turnChainValue(service.raft.campaign());
    t.equal(service.isLeader, true, 'real initialization/campaign publishes leadership');
    const tenure = service.leadershipTenure;
    let cancelled = 0;
    const {target, method} = cancellationTarget(service, kind);
    const original = target[method].bind(target);
    target[method] = (...args) => {
      cancelled++;
      return original(...args);
    };
    const {writes, rows, publishRow, durableRole} = createDurableRoleProbe(f, service, kind);
    await publishRow();
    const expectedRole = kind === 'partition' ? 'follower' : 'leader';
    t.equal(durableRole(), expectedRole, 'valid native role reaches durable row consumer');
    writes.length = 0;
    corrupt = true;
    t.same(await turnChainValue(service.raft.tick()), REFUSAL);
    t.equal(service.isLeader, false);
    t.equal(service.leadershipTenure, null, 'split/admission tenure is withdrawn');
    t.throws(readTerm, {raftResult: REFUSAL}, 'term adapter cannot erase refusal into null');
    t.equal(cancelled, 1, 'owned activation/timer effect is cancelled once');
    await turnChainValue(service.raft.tick());
    t.equal(cancelled, 1, 'unchanged invalid producer does not repeat withdrawal');
    if (kind === 'message-group') {
      t.throws(() => MessageGroupServiceRowOwner.buildServiceRow({service,
        groupId: service.groupId, replicaId: service.replicaId, nodeId: service.nodeId}),
      {raftResult: REFUSAL});
    } else if (kind === 'partition') {
      t.equal(service.isLeaderReplica(), false, 'public partition leader accessor withdraws');
      t.throws(() => service.getRole(), {raftResult: REFUSAL});
      t.throws(() => PartitionServiceRowOwner.buildServiceRow({
        service, partitionId: service.partitionId, replicaId: service.replicaId,
        nodeId: service.nodeId}), {raftResult: REFUSAL});
      const owner = new PartitionServiceRowOwner({systemTableWriter: {
        updateSystemTableRow: async (...args) => writes.push(args)}});
      await t.rejects(owner.publishCanonicalLeaderNodeId({service_type: 'partition',
        status: 'active', raft_role: 'leader', partition_id: service.partitionId,
        node_id: service.nodeId}, service), {raftResult: REFUSAL});
    } else {
      await t.rejects(service.handleMessage({operation: 'write', sessionId: 'role-test',
        key: 'key', value: 'value'}), {raftResult: REFUSAL});
      await t.rejects(service.handleMessage({operation: 'read', sessionId: 'role-test',
        key: 'key'}), {raftResult: REFUSAL});
      await t.rejects(service.writeRoleUpdate('leader'), {raftResult: REFUSAL});
      await t.rejects(service.writeLeaderNodeUpdate(service.nodeId), {raftResult: REFUSAL});
    }
    service.roleMutationHelper.pendingValue = 'follower';
    await t.rejects(service.roleMutationHelper.flush(), {raftResult: REFUSAL},
      'deferred role publisher also consumes canonical authority');
    await t.rejects(publishRow(), {raftResult: REFUSAL}, 'durable row path explicitly refuses invalid generation');
    t.equal(writes.length, 0, 'no refused authority reaches a durable writer');
    t.equal(rows.prepare('SELECT count(*) AS count FROM published_rows').get().count, 1,
      'invalid generation commits no new durable role assertion');
    corrupt = false;
    t.equal((await turnChainValue(service.raft.tick())).outcome, OUTCOME.CORE_OK);
    t.equal(service.isLeader, true, 'new valid observation resumes original lifecycle');
    t.ok(service.leadershipTenure !== null && service.leadershipTenure !== tenure,
      'a new tenure replaces the withdrawn token');
    t.equal(readTerm(), service.raft.readRoleAndTerm().term,
      'valid new observation restores the exact term');
    if (kind === 'partition') {
      t.equal(service.isLeaderReplica(), true);
      t.equal(service.getRole(), 'leader');
    } else if (kind === 'wasm-service') {
      await service.writeRoleUpdate('leader');
      await service.writeLeaderNodeUpdate(service.nodeId);
      t.equal(writes.length, 2, 'valid new authority reaches both writers');
    }
    await publishRow();
    t.equal(durableRole(), expectedRole, 'new valid generation reaches independently reopened row store');
    t.equal(rows.prepare('SELECT count(*) AS count FROM published_rows').get().count,
      kind === 'wasm-service' ? 4 : 2, 'recovery commits the expected row assertions');
    t.end();
  });
}
