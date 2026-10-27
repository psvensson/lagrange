// Owner-level controls for ordinary births as well as reserved original births.
// Real SQLite retains the observed row; the gateway injects lost/uncertain answers.
// These tests do not claim real consensus or public-startup coverage.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import Database from 'better-sqlite3';
import {PartitionServiceRowOwner, isPartitionRegistrationEvidence} from
  '../../src/partition/partition-service-row-owner.js';

const request = Object.freeze({partitionId: 'readback-p1',
  replicaId: 'readback-p1-r1', nodeId: 'readback-node', timestamp: 2000});

function fixture({change = (row) => row, lost = false, applied = false} = {}) {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE answer (row_json TEXT NOT NULL)');
  const failure = new Error('lost INSERT answer');
  const calls = {inserts: 0, reads: 0};
  let submitted;
  const owner = new PartitionServiceRowOwner({systemTableWriter: {
    async insertSystemTableRow(table, row, options) {
      assert.equal(table, 'services');
      assert.equal(options.allowCoalescing, false);
      calls.inserts += 1;
      submitted = row;
      db.prepare('INSERT INTO answer VALUES (?)').run(JSON.stringify(change({...row})));
      if (lost) throw failure;
      return applied ? {success: true, partitionResult: {affectedRows: 1}} :
        {success: false, error: 'write answer unavailable'};
    },
    async readAuthoritativeRows(table, sql, params) {
      calls.reads += 1;
      assert.equal(table, 'services');
      assert.equal(sql, 'SELECT * FROM services WHERE service_id = ?');
      assert.deepEqual(params, [request.replicaId]);
      return {success: true, rows: db.prepare('SELECT row_json FROM answer').all()
        .map(({row_json: json}) => JSON.parse(json))};
    },
  }});
  return {db, owner, failure, calls, submitted: () => submitted};
}

for (const lost of [false, true]) {
  test(`ordinary null-token birth survives ${lost ? 'thrown' : 'returned'} uncertainty`, async () => {
    const f = fixture({lost});
    try {
      const result = await f.owner.registerReplica(request);
      assert.equal(isPartitionRegistrationEvidence(result), true);
      assert.equal(result.created_at, f.submitted().created_at);
      assert.equal(result.create_attempt_token, null);
      assert.deepEqual(f.calls, {inserts: 1, reads: 1});
    } finally {
      f.db.close();
    }
  });
}

for (const [name, change] of [
  ['another birth', (row) => ({...row, created_at: row.created_at + 1})],
  ['foreign creation token', (row) => ({...row, create_attempt_token: 'foreign'})],
  ['missing creation token', (row) => {
    delete row.create_attempt_token;
    return row;
  }],
  ['foreign group identity', (row) => ({...row, group_id: 'other-group'})],
  ['changed lifecycle', (row) => ({...row, status: 'active'})],
]) {
  test(`returned uncertainty cannot adopt ${name}`, async () => {
    const f = fixture({change});
    try {
      await assert.rejects(f.owner.registerReplica(request), (error) =>
        error.code === 'REPLICA_IDENTITY_CONFLICT' && error.deferRetry === false);
      assert.deepEqual(f.calls, {inserts: 1, reads: 1});
    } finally {
      f.db.close();
    }
  });
}

test('role and update-stamp movement do not fabricate a different birth', async () => {
  const f = fixture({lost: true, change: (row) => ({...row,
    raft_role: 'follower', updated_at: row.updated_at + 1})});
  try {
    const result = await f.owner.registerReplica(request);
    assert.equal(isPartitionRegistrationEvidence(result), true);
    assert.equal(result.created_at, f.submitted().created_at);
    assert.equal(result.updated_at, f.submitted().updated_at + 1);
    assert.equal(result.raft_role, 'follower');
    assert.deepEqual(f.calls, {inserts: 1, reads: 1});
  } finally {
    f.db.close();
  }
});

test('an applied ordinary birth retains the existing no-read fast path', async () => {
  const f = fixture({applied: true});
  try {
    const result = await f.owner.registerReplica(request);
    assert.equal(isPartitionRegistrationEvidence(result), true);
    assert.equal(result.created_at, f.submitted().created_at);
    assert.deepEqual(f.calls, {inserts: 1, reads: 0});
  } finally {
    f.db.close();
  }
});
