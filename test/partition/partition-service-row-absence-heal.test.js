/**
 * Absence-proven services-row heal on zero-row status updates.
 *
 * The bootstrap registration write of a system replica's services row is a
 * one-shot direct write outside raft; when it misses a replica db, every
 * later writer is a plain UPDATE that zero-row no-ops, a zero-change
 * UPDATE emits no CDC, and the cached row never leaves stopped — wedging
 * serve-eligibility permanently (round-11 attribution: local lone-seed
 * phase-1 routable-partition timeouts, the 43-row "No row found for CDC
 * update" wave in archived runs 06-27-35/06-31-11/07-07-37 on
 * 2026-08-16). An UPDATE whose primary-key-pinned WHERE matched zero rows
 * is proof of durable absence: the owner already holds the full canonical
 * row, so it re-issues the registration upsert instead of leaving the
 * divergence permanent. A matched update (affectedRows >= 1) and an
 * unwitnessed count (affectedRows absent) keep the update-only contract.
 */
import {test} from '../../src/test-helpers/tap.js';
import {
  PartitionServiceRowOwner,
} from '../../src/partition/partition-service-row-owner.js';

function buildOwner({affectedRows}) {
  const calls = {updates: [], upserts: []};
  const owner = new PartitionServiceRowOwner({
    now: () => 1234,
    systemTableWriter: {
      async updateSystemTableRow(tableName, whereClause, updateData, options) {
        calls.updates.push({tableName, whereClause, updateData, options});
        return {
          success: true,
          partitionResult: affectedRows === undefined ?
            {} :
            {affectedRows},
        };
      },
      async upsertSystemTableRow(tableName, row, options) {
        calls.upserts.push({tableName, row, options});
        return {success: true};
      },
    },
  });
  return {owner, calls};
}

const REPLICA_OPTIONS = Object.freeze({
  partitionId: 'services-p1',
  replicaId: 'mg-1-r1',
  nodeId: 'node-a',
  service: {isLeaderReplica: () => false},
});

test('a zero-row status update proves durable absence and re-issues the ' +
  'canonical registration upsert', async (t) => {
  const {owner, calls} = buildOwner({affectedRows: 0});
  const row = await owner.activateReplica(REPLICA_OPTIONS);
  t.equal(calls.upserts.length, 1,
    'the absent services row is healed with the canonical upsert');
  t.equal(calls.upserts[0].tableName, 'services');
  t.equal(calls.upserts[0].row.service_id, 'mg-1-r1');
  t.equal(calls.upserts[0].row.status, 'active',
    'the healed row carries the intended status');
  t.equal(calls.upserts[0].row.created_at, 1234,
    'the healed row is the full canonical registration shape');
  t.equal(row.status, 'active', 'activation still projects active status');
  t.end();
});

test('a matched status update never escalates to upsert', async (t) => {
  const {owner, calls} = buildOwner({affectedRows: 1});
  await owner.activateReplica(REPLICA_OPTIONS);
  t.equal(calls.upserts.length, 0,
    'a matched update keeps the update-only contract');
  t.end();
});

test('an unwitnessed affected-row count never escalates to upsert', async (t) => {
  const {owner, calls} = buildOwner({affectedRows: undefined});
  await owner.activateReplica(REPLICA_OPTIONS);
  t.equal(calls.upserts.length, 0,
    'absence must be proven by an explicit zero count, not assumed');
  t.end();
});
