// The existing MG row owner and canonical read route, with real SQLite holding
// an injected authoritative observation. Not a native consensus/startup proof.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import Database from 'better-sqlite3';
import {MessageGroupServiceRowOwner} from
  '../../src/message-group/message-group-service-row-owner.js';
import {CONTROL_PLANE_AUTHORITATIVE_READ_MODE, CONTROL_PLANE_READ_LEADER_MODE} from
  '../../src/control-plane/control-plane-system-table-gateway.js';

const request = Object.freeze({groupId: 'original-mg', replicaId: 'original-mg-r1',
  nodeId: 'original-node', status: 'stopped', timestamp: 1000,
  extraFields: {created_at: 1000, state_entered_at: 1000, updated_at: 1000,
    create_attempt_token: 'reserved-original-mg-creation'}});

function fixture({delta = {}, lost = false, observation = 'exact'} = {}) {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE answer (row_json TEXT NOT NULL)');
  const failure = new Error('message-group registration answer lost');
  const calls = {inserts: 0, reads: 0};
  const owner = new MessageGroupServiceRowOwner({systemTableWriter: {
    async insertSystemTableRow(table, row, options) {
      assert.equal(table, 'services');
      assert.equal(options.allowCoalescing, false);
      calls.inserts += 1;
      db.prepare('INSERT INTO answer VALUES (?)').run(JSON.stringify({...row, ...delta}));
      if (lost) throw failure;
      return {success: false, error: 'unknown write answer'};
    },
    async readAuthoritativeRows(table, sql, params, options) {
      calls.reads += 1;
      assert.equal(table, 'services');
      assert.equal(sql, 'SELECT * FROM services WHERE service_id = ?');
      assert.deepEqual(params, [request.replicaId]);
      assert.equal(options.authoritativeReadMode,
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED);
      assert.equal(options.leaderMode, CONTROL_PLANE_READ_LEADER_MODE.REQUIRED);
      const row = JSON.parse(db.prepare('SELECT row_json FROM answer').get().row_json);
      if (observation === 'unavailable') return {success: false, rows: [row]};
      if (observation === 'absent') return {success: true, rows: []};
      if (observation === 'duplicate') return {success: true, rows: [row, row]};
      return {success: true, rows: [row]};
    },
  }});
  return {db, owner, calls, failure};
}

for (const lost of [false, true]) {
  test(`exact MG birth resolves ${lost ? 'thrown' : 'returned'} uncertainty once`, async () => {
    const f = fixture({lost});
    try {
      const row = await f.owner.registerReplica(request);
      assert.equal(row.created_at, 1000);
      assert.equal(row.create_attempt_token, request.extraFields.create_attempt_token);
      assert.deepEqual(f.calls, {inserts: 1, reads: 1});
    } finally {
      f.db.close();
    }
  });
}

for (const [name, delta] of [
  ['older incarnation', {created_at: 999}],
  ['newer incarnation', {created_at: 1001}],
  ['foreign creation token', {create_attempt_token: 'foreign'}],
  ['missing creation token', {create_attempt_token: null}],
  ['foreign replica', {replica_id: 'other-replica'}],
  ['foreign address', {address: 'other-address'}],
  ['foreign partition', {partition_id: 'other-partition'}],
  ['foreign node', {node_id: 'other-node'}],
  ['foreign group', {group_id: 'other-group'}],
  ['changed lifecycle generation', {state_entered_at: 1001}],
]) {
  test(`uncertain MG birth refuses ${name}`, async () => {
    const f = fixture({delta});
    try {
      await assert.rejects(f.owner.registerReplica(request), (error) =>
        error.code === 'SERVICE_IDENTITY_CONFLICT' && error.deferRetry === false);
      assert.deepEqual(f.calls, {inserts: 1, reads: 1});
    } finally {
      f.db.close();
    }
  });
}

for (const observation of ['unavailable', 'absent', 'duplicate']) {
  test(`thrown MG answer retains cause and debt for ${observation} readback`, async () => {
    const f = fixture({lost: true, observation});
    try {
      await assert.rejects(f.owner.registerReplica(request), (error) =>
        error.code === 'CREATE_OWNER_DEFERRED' && error.cause === f.failure);
      assert.deepEqual(f.calls, {inserts: 1, reads: 1});
    } finally {
      f.db.close();
    }
  });
}

test('thrown MG answer does not adopt a successor birth and retains the cause', async () => {
  const f = fixture({lost: true, delta: {created_at: 1001}});
  try {
    await assert.rejects(f.owner.registerReplica(request), (error) =>
      error.code === 'SERVICE_IDENTITY_CONFLICT' && error.cause === f.failure);
    assert.deepEqual(f.calls, {inserts: 1, reads: 1});
  } finally {
    f.db.close();
  }
});

test('MG role and updated_at movement preserve the exact birth', async () => {
  const f = fixture({delta: {raft_role: 'follower', updated_at: 2000}});
  try {
    const row = await f.owner.registerReplica(request);
    assert.equal(row.created_at, 1000);
    assert.equal(row.create_attempt_token, request.extraFields.create_attempt_token);
    assert.equal(row.raft_role, 'follower');
    assert.deepEqual(f.calls, {inserts: 1, reads: 1});
  } finally {
    f.db.close();
  }
});

test('ordinary MG birth without a reserved token resolves its own lost answer', async () => {
  const f = fixture({lost: true});
  try {
    const {extraFields: _reserved, ...ordinary} = request;
    const row = await f.owner.registerReplica(ordinary);
    assert.equal(Number.isSafeInteger(row.created_at), true);
    assert.equal(row.create_attempt_token ?? null, null);
    assert.deepEqual(f.calls, {inserts: 1, reads: 1});
  } finally {
    f.db.close();
  }
});
