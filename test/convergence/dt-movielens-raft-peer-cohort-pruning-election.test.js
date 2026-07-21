import {SERVICE_TYPE, TABLES} from '../../src/constants/index.js';
import {
  CDC_OPERATIONS,
  SystemTableCache,
} from '../../src/cache/system-table-cache.js';
import {
  PartitionService,
  RaftRole,
} from '../../src/partition/partition-service.js';
import LifeRaft from '../../src/raft/liferaft.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {test} from '../../src/test-helpers/tap.js';
import {
  connectRaftCluster,
  driveNetwork,
} from '../distributed/harness/raft-network-host.js';
import {createVirtualNetwork} from '../distributed/harness/virtual-network.js';

const PARTITION_ID = 'sql_transaction_participants-p1';
const R1 = 'sql_transaction_participants-p1-r1';
const R2 = 'sql_transaction_participants-p1-r2';
const R3 = 'sql_transaction_participants-p1-r3';
const R4 = 'sql_transaction_participants-p1-r4';
const R5 = 'sql_transaction_participants-p1-r5';
const REPLACEMENT = 'replace-replica-final';

const ADDRESS_BY_REPLICA = Object.freeze({
  [R1]: `node-a/partition/${R1}`,
  [R2]: `node-a/partition/${R2}`,
  [R3]: `node-a/partition/${R3}`,
  [R4]: `node-old/partition/${R4}`,
  [R5]: `node-b/partition/${R5}`,
  [REPLACEMENT]: `node-c/partition/${REPLACEMENT}`,
});

const FINAL_REPLICA_IDS = Object.freeze([R1, R5, REPLACEMENT]);
const DORMANT_ELECTION = Object.freeze({
  'election min': '100000 ms',
  'election max': '100000 ms',
  'heartbeat': '100000 ms',
});

function serviceRow(replicaId, updatedAt = 1) {
  return {
    service_id: replicaId,
    partition_id: PARTITION_ID,
    service_type: SERVICE_TYPE.PARTITION,
    node_id: ADDRESS_BY_REPLICA[replicaId].split('/')[0],
    address: ADDRESS_BY_REPLICA[replicaId],
    status: ReplicaStatus.ACTIVE,
    raft_role: RaftRole.FOLLOWER,
    updated_at: updatedAt,
  };
}

function peerAddresses(raft) {
  return raft.nodes.map((node) => node.address).sort();
}

function nextImmediate() {
  return new Promise((resolve) => setImmediate(resolve));
}

test('authoritative replica deletes prune departed Liferaft peers so the final ' +
  'MovieLens cohort can elect, while row absence alone remains conservative',
async (t) => {
  const net = createVirtualNetwork();
  const finalAddresses = FINAL_REPLICA_IDS.map(
    (replicaId) => ADDRESS_BY_REPLICA[replicaId],
  );
  const rafts = connectRaftCluster(
    net,
    finalAddresses,
    () => ({...DORMANT_ELECTION}),
  );
  t.teardown(() => rafts.forEach((raft) => raft.end()));

  const r1Raft = rafts.get(ADDRESS_BY_REPLICA[R1]);
  const finalPeerWriters = new Map(
    r1Raft.nodes.map((node) => [node.address, node.write]),
  );
  for (const replicaId of [R5, REPLACEMENT]) {
    r1Raft.leave(ADDRESS_BY_REPLICA[replicaId]);
  }
  for (const replicaId of [R2, R3]) {
    r1Raft.join(ADDRESS_BY_REPLICA[replicaId], (_packet, callback) => {
      callback?.(null);
    });
  }
  t.same(
    peerAddresses(r1Raft),
    [ADDRESS_BY_REPLICA[R2], ADDRESS_BY_REPLICA[R3]].sort(),
    'the bootstrap Raft cohort begins at r1/r2/r3',
  );

  const cache = new SystemTableCache();
  for (const replicaId of [R1, R2, R3]) {
    cache.applySystemTableChange(
      TABLES.SERVICES,
      CDC_OPERATIONS.INSERT,
      serviceRow(replicaId),
    );
  }

  const partition = new PartitionService({
    partitionId: PARTITION_ID,
    tableId: 'sql_transaction_participants',
    tableName: 'sql_transaction_participants',
    replicaId: R1,
    replicaIds: [R1, R2, R3],
    nodeId: 'node-a',
    dbPath: ':memory:',
  });
  partition.raft = r1Raft;
  partition.raftProvider = {
    joinPeer(raft, address) {
      const write = finalPeerWriters.get(address) ||
        ((_packet, callback) => callback?.(null));
      raft.join(address, write);
    },
  };
  partition.systemTableCache = cache;

  for (const replicaId of [R4, R5]) {
    cache.applySystemTableChange(
      TABLES.SERVICES,
      CDC_OPERATIONS.INSERT,
      serviceRow(replicaId, 2),
    );
  }
  for (const replicaId of [R2, R3]) {
    cache.applySystemTableChange(
      TABLES.SERVICES,
      CDC_OPERATIONS.DELETE,
      serviceRow(replicaId, 3),
    );
  }
  await nextImmediate();
  t.same(
    peerAddresses(r1Raft),
    [ADDRESS_BY_REPLICA[R4], ADDRESS_BY_REPLICA[R5]].sort(),
    'authoritative ADD then REMOVE converges to r1/r4/r5',
  );

  cache.applySystemTableChange(
    TABLES.SERVICES,
    CDC_OPERATIONS.INSERT,
    serviceRow(REPLACEMENT, 4),
  );
  await nextImmediate();
  t.same(
    peerAddresses(r1Raft),
    [
      ADDRESS_BY_REPLICA[R4],
      ADDRESS_BY_REPLICA[R5],
      ADDRESS_BY_REPLICA[REPLACEMENT],
    ].sort(),
    'replacement joins before the transient voter retires',
  );

  cache.applySystemTableChange(
    TABLES.SERVICES,
    CDC_OPERATIONS.DELETE,
    serviceRow(R4, 1),
  );
  t.ok(
    peerAddresses(r1Raft).includes(ADDRESS_BY_REPLICA[R4]),
    'a stale rejected delete cannot retire a live peer',
  );
  t.ok(
    partition.replicaIds.includes(R4),
    'a stale rejected delete cannot rewrite the replica identity cohort',
  );

  cache.applySystemTableChange(
    TABLES.SERVICES,
    CDC_OPERATIONS.UPDATE,
    {
      ...serviceRow(R4, 4),
      address: ADDRESS_BY_REPLICA[R5],
      status: ReplicaStatus.REMOVED,
    },
  );
  t.ok(
    peerAddresses(r1Raft).includes(ADDRESS_BY_REPLICA[R4]),
    'terminal evidence with a mismatched replica address cannot retire r4',
  );
  t.ok(
    peerAddresses(r1Raft).includes(ADDRESS_BY_REPLICA[R5]),
    'mismatched terminal evidence cannot retire the address owner r5',
  );

  cache.applySystemTableChange(
    TABLES.SERVICES,
    CDC_OPERATIONS.UPDATE,
    {...serviceRow(R4, 5), status: ReplicaStatus.REMOVED},
  );
  await nextImmediate();

  t.same(
    peerAddresses(r1Raft),
    FINAL_REPLICA_IDS
      .filter((replicaId) => replicaId !== R1)
      .map((replicaId) => ADDRESS_BY_REPLICA[replicaId])
      .sort(),
    'accepted authoritative deletes retire exact departed peer addresses',
  );
  t.same(
    [...partition.replicaIds].sort(),
    [...FINAL_REPLICA_IDS].sort(),
    'the local replica identity cohort converges with the Raft peer cohort',
  );
  t.equal(
    r1Raft.majority(),
    2,
    'the final three-voter cohort requires the canonical two votes',
  );

  await r1Raft.promote();
  await driveNetwork(net, {untilMs: 200});
  t.equal(
    r1Raft.state,
    LifeRaft.LEADER,
    'r1 reaches leadership through real vote and append RPCs after peer retirement',
  );

  const unprovenReplicaId = 'row-absent-without-delete-evidence';
  const unprovenAddress = `node-unknown/partition/${unprovenReplicaId}`;
  r1Raft.join(unprovenAddress, (_packet, callback) => callback?.(null));
  partition.replicaIds.push(unprovenReplicaId);
  partition.reconcileRaftPeersFromCache();
  t.ok(
    peerAddresses(r1Raft).includes(unprovenAddress),
    'a row-less peer remains joined without an accepted terminal/delete event',
  );
  t.ok(
    partition.replicaIds.includes(unprovenReplicaId),
    'row absence alone does not rewrite the replica identity cohort',
  );
  partition.systemTableCache = null;
  await nextImmediate();
});
