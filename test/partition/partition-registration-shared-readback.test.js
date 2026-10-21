// Shared row-owner contract: exact birth readback for both ordinary and
// reserved creation, without making mutable role/update stamps identity.
// The writer is fault-injected; these are not native Raft/startup witnesses.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {PartitionServiceRowOwner, isPartitionRegistrationEvidence} from
  '../../src/partition/partition-service-row-owner.js';

function fixture({token, answer, change}) {
  const failure = new Error('lost registration answer');
  const counts = {inserts: 0, reads: 0};
  let submitted;
  const owner = new PartitionServiceRowOwner({now: () => 1000,
    systemTableWriter: {
      async insertSystemTableRow(table, row, options) {
        assert.equal(table, 'services');
        assert.equal(options.allowCoalescing, false);
        submitted = row;
        counts.inserts += 1;
        if (answer === 'lost') throw failure;
        return {success: false, error: 'unknown registration result'};
      },
      async readAuthoritativeRows(table, _sql, params) {
        assert.equal(table, 'services');
        assert.deepEqual(params, [submitted.service_id]);
        counts.reads += 1;
        return {success: true, rows: [change({...submitted})]};
      },
    }});
  const register = () => owner.registerReplica({
    partitionId: 'shared-p1', replicaId: 'shared-p1-r1', nodeId: 'node-a',
    extraFields: {create_attempt_token: token},
  });
  return {register, counts, failure, submitted: () => submitted};
}

const corruptions = [
  ['older birth', (row) => ({...row, created_at: row.created_at - 1})],
  ['newer birth', (row) => ({...row, created_at: row.created_at + 1})],
  ['string birth', (row) => ({...row, created_at: String(row.created_at)})],
  ['foreign token', (row) => ({...row, create_attempt_token: 'foreign-attempt'})],
  ['missing token field', (row) => {
    delete row.create_attempt_token;
    return row;
  }],
];

for (const token of [null, 'reserved-attempt']) {
  for (const answer of ['lost', 'unknown']) {
    const label = `${token === null ? 'ordinary' : 'reserved'} ${answer}`;
    test(`${label}: exact birth tolerates mutable role and update stamps`, async () => {
      const f = fixture({token, answer, change: (row) => ({...row,
        raft_role: 'candidate', updated_at: row.updated_at + 1})});
      const evidence = await f.register();
      assert.equal(isPartitionRegistrationEvidence(evidence), true);
      assert.equal(evidence.created_at, f.submitted().created_at);
      assert.equal(evidence.create_attempt_token, token);
      assert.equal(evidence.raft_role, 'candidate');
      assert.equal(evidence.updated_at, f.submitted().updated_at + 1);
      assert.deepEqual(f.counts, {inserts: 1, reads: 1});
    });
    for (const [name, change] of corruptions) {
      test(`${label}: refuses ${name} without another INSERT`, async () => {
        const f = fixture({token, answer, change});
        await assert.rejects(f.register(), (error) => {
          assert.equal(error.code, 'REPLICA_IDENTITY_CONFLICT');
          assert.equal(error.deferRetry, false);
          assert.equal(error.cause, answer === 'lost' ? f.failure : undefined);
          return true;
        });
        assert.deepEqual(f.counts, {inserts: 1, reads: 1});
      });
    }
  }
}
