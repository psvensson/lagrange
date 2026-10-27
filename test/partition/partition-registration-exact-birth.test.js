// Exercise the real row owner and authoritative-read interface. SQLite holds
// the fault-injected observation; this is not a Raft or public-startup witness.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import Database from 'better-sqlite3';
import {PartitionServiceRowOwner, isPartitionRegistrationEvidence} from
  '../../src/partition/partition-service-row-owner.js';
import {CONTROL_PLANE_AUTHORITATIVE_READ_MODE, CONTROL_PLANE_READ_LEADER_MODE} from
  '../../src/control-plane/control-plane-system-table-gateway.js';

function fixture({delta = {}, lost = true, observation = 'exact'} = {}) {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE registration_answer (row_json TEXT NOT NULL)');
  const failure = new Error('registration answer lost after the write');
  const counts = {inserts: 0, reads: 0};
  const owner = new PartitionServiceRowOwner({systemTableWriter: {
    async insertSystemTableRow(table, row, options) {
      assert.equal(table, 'services');
      assert.equal(options.allowCoalescing, false);
      counts.inserts++;
      db.prepare('INSERT INTO registration_answer VALUES (?)').run(JSON.stringify({...row, ...delta}));
      if (lost) throw failure;
      return {success: false, error: 'unknown write answer'};
    },
    async readAuthoritativeRows(table, sql, params, options) {
      counts.reads++;
      assert.equal(table, 'services');
      assert.equal(sql, 'SELECT * FROM services WHERE service_id = ?');
      assert.deepEqual(params, ['original-p1-r1']);
      assert.equal(options.authoritativeReadMode,
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED);
      assert.equal(options.leaderMode, CONTROL_PLANE_READ_LEADER_MODE.REQUIRED);
      const row = JSON.parse(db.prepare('SELECT row_json FROM registration_answer').get().row_json);
      if (observation === 'unavailable') return {success: false, rows: [row]};
      if (observation === 'absent') return {success: true, rows: []};
      if (observation === 'duplicate') return {success: true, rows: [row, row]};
      return {success: true, rows: [row]};
    },
  }});
  return {owner, db, failure, counts};
}

const request = {
  partitionId: 'original-p1', replicaId: 'original-p1-r1', nodeId: 'original-node',
  timestamp: 1000,
  extraFields: {created_at: 1000, state_entered_at: 1000, updated_at: 1000,
    create_attempt_token: 'reserved-original-creation'},
};

for (const lost of [true, false]) {
  test(`exact reserved birth reconciles ${lost ? 'thrown' : 'returned'} uncertainty without another INSERT`, async () => {
    const f = fixture({lost});
    try {
      const evidence = await f.owner.registerReplica(request);
      assert.equal(isPartitionRegistrationEvidence(evidence), true);
      assert.equal(evidence.created_at, 1000);
      assert.equal(evidence.create_attempt_token, 'reserved-original-creation');
      assert.deepEqual(f.counts, {inserts: 1, reads: 1});
    } finally {
      f.db.close();
    }
  });
}

for (const [name, delta] of [
  ['older incarnation', {created_at: 999}],
  ['newer incarnation', {created_at: 1001}],
  ['foreign creation token', {create_attempt_token: 'another-creation'}],
  ['missing creation token', {create_attempt_token: null}],
  ['foreign node', {node_id: 'other-node'}],
  ['foreign replica', {replica_id: 'other-replica'}],
  ['foreign partition', {partition_id: 'other-partition'}],
]) {
  test(`uncertain original registration refuses ${name}`, async () => {
    const f = fixture({delta});
    try {
      await assert.rejects(f.owner.registerReplica(request), (error) =>
        error.code === 'REPLICA_IDENTITY_CONFLICT' && error.cause === f.failure);
      assert.deepEqual(f.counts, {inserts: 1, reads: 1}, 'no second submission');
    } finally {
      f.db.close();
    }
  });
}

for (const observation of ['unavailable', 'absent', 'duplicate']) {
  test(`uncertain original registration retains debt for ${observation} readback`, async () => {
    const f = fixture({observation});
    try {
      await assert.rejects(f.owner.registerReplica(request), (error) =>
        error.code === 'CREATE_OWNER_DEFERRED' && error.cause === f.failure);
      assert.deepEqual(f.counts, {inserts: 1, reads: 1});
    } finally {
      f.db.close();
    }
  });
}
