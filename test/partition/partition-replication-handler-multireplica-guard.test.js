/**
 * CL-017(a) guard: the unilateral single-replica direct-apply path must
 * never be taken when the raft instance actually knows peers — a stale
 * local replicaIds list otherwise lets one replica apply writes to its
 * own database without consensus (the witnessed post-churn divergence
 * where rows existed in one co-located replica's db but not the one
 * later applying updates).
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  PartitionReplicationHandler,
} from '../../src/partition/partition-replication-handler.js';

function createHandler({replicaIds, raftNodes}) {
  const handler = new PartitionReplicationHandler({
    partitionId: 'p1',
    replicaId: 'p1-r1',
    logger: {info() {}, warn() {}, error() {}, debug() {}},
  });
  handler.replicaIds = replicaIds;
  handler.raft = raftNodes === null ? null : {nodes: raftNodes};
  return handler;
}

test('CL-017(a): isMultiReplica corroborates with the live raft peer view',
  async (t) => {
    await t.test('multi-entry replicaIds list stays multi', async (t) => {
      const handler = createHandler({
        replicaIds: ['p1-r1', 'p1-r2'],
        raftNodes: [],
      });
      t.equal(handler.isMultiReplica(), true, 'list with peers is multi');
    });

    await t.test(
      'stale self-only list with live raft peers is STILL multi-replica',
      async (t) => {
        const handler = createHandler({
          replicaIds: ['p1-r1'],
          raftNodes: [{address: 'node-2/partition/p1-r2'}],
        });
        t.equal(
          handler.isMultiReplica(),
          true,
          'raft peer view overrides the stale list — no unilateral apply',
        );
      },
    );

    await t.test(
      'genuine single replica (no list peers, no raft peers) stays single',
      async (t) => {
        const handler = createHandler({replicaIds: ['p1-r1'], raftNodes: []});
        t.equal(handler.isMultiReplica(), false, 'true singleton is single');
      },
    );

    await t.test('missing raft instance falls back to the list', async (t) => {
      const handler = createHandler({replicaIds: ['p1-r1'], raftNodes: null});
      t.equal(handler.isMultiReplica(), false, 'no raft, single-entry list');
    });
  });
