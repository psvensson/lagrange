/**
 * Absence-proven services-row heal for message-group replicas.
 *
 * Serve-eligibility requires an ACTIVE addressed MESSAGE_GROUP services
 * row; the registration write of that row is a one-shot direct write
 * outside raft, and when it misses the durable db every later status
 * UPDATE zero-row no-ops with no CDC, so the cached mg row never leaves
 * stopped and the node is wedged out of serve-eligibility permanently
 * (round-11 attribution, runs 06-27-35/06-31-11/07-07-37/07-39-14 on
 * 2026-08-16 — the partition-owner heal alone did not cover this owner).
 * Same contract as the partition owner: a zero affected-row count on the
 * primary-key-pinned WHERE proves durable absence and re-issues the
 * canonical registration upsert; matched or unwitnessed counts keep the
 * update-only contract.
 */
import {test} from '../../src/test-helpers/tap.js';
import {
  MessageGroupServiceRowOwner,
} from '../../src/message-group/message-group-service-row-owner.js';

function buildOwner({affectedRows}) {
  const calls = {updates: [], upserts: []};
  const owner = new MessageGroupServiceRowOwner({
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
  groupId: 'mg-1',
  replicaId: 'mg-1-r1',
  nodeId: 'node-a',
  service: {isLeaderReplica: () => false},
});

test('a zero-row message-group status update proves durable absence and ' +
  're-issues the canonical registration upsert', async (t) => {
  const {owner, calls} = buildOwner({affectedRows: 0});
  const row = await owner.activateReplica(REPLICA_OPTIONS);
  t.equal(calls.upserts.length, 1,
    'the absent mg services row is healed with the canonical upsert');
  t.equal(calls.upserts[0].row.service_id, 'mg-1-r1');
  t.equal(calls.upserts[0].row.service_type, 'message_group');
  t.equal(calls.upserts[0].row.status, 'active',
    'the healed row carries the intended status');
  t.equal(calls.upserts[0].row.created_at, 1234,
    'the healed row is the full canonical registration shape');
  t.equal(row.status, 'active', 'activation still projects active status');
  t.end();
});

test('a matched message-group status update never escalates to upsert',
  async (t) => {
    const {owner, calls} = buildOwner({affectedRows: 1});
    await owner.activateReplica(REPLICA_OPTIONS);
    t.equal(calls.upserts.length, 0,
      'a matched update keeps the update-only contract');
    t.end();
  });

test('an unwitnessed message-group affected-row count never escalates to ' +
  'upsert', async (t) => {
  const {owner, calls} = buildOwner({affectedRows: undefined});
  await owner.activateReplica(REPLICA_OPTIONS);
  t.equal(calls.upserts.length, 0,
    'absence must be proven by an explicit zero count, not assumed');
  t.end();
});
