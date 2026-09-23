// Authoritative replica deletes prune departed peers from the partition's
// consensus configuration so the final MovieLens cohort is exactly the live
// replicas, while row absence alone remains conservative.
//
// The partition's contribution is the membership proposals its services-cache
// reconcile makes through the frozen operation port (proposeConfChange). The
// port is built by the controllable provider through the service's
// createOperationPort seam, so every ADD_PEER / REMOVE_PEER the partition
// proposes is recorded in the provider's confChanges and the configuration
// the port reports (readStatus().peers) is the bootstrap configuration the
// production port starts from (the request's bootstrap voters) plus exactly
// what those proposals made it. The election of the resulting three-voter cohort is the consensus
// core's, not the partition's: this double cannot witness a real vote, so the
// witness ends at the configuration the partition proposed. The retired
// liferaft double's claim that the pruned cohort then elects through real
// vote and append RPCs needs a live-voter rs-raft witness of its own; it is
// not asserted here.
import {SERVICE_TYPE, TABLES} from '../../src/constants/index.js';
import {
  CDC_OPERATIONS,
  SystemTableCache,
} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {RaftRole} from '../../src/partition/partition-service.js';
import {
  RAFT_MEMBERSHIP_OPERATION,
  RAFT_OPERATION_OUTCOME,
} from '../../src/raft/raft-operation-port-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {test} from '../../src/test-helpers/tap.js';
import {
  ControllablePartitionRaftProvider,
  createControllablePartitionService,
} from '../partition/partition-service-test-support.js';

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

// The configuration the operation port reports: the remote peers' addresses.
function peerAddresses(partition) {
  return partition.raft.readStatus().peers
    .map((peer) => peer.address).sort();
}

// The membership proposals the partition made through the port since `mark`.
function proposalsSince(provider, mark) {
  return provider.confChanges.slice(mark).map((change) => ({
    type: change.type,
    peerAddress: change.peerAddress,
    replicaIdentity: change.replicaIdentity,
  }));
}

function addPeer(replicaId) {
  return {
    type: RAFT_MEMBERSHIP_OPERATION.ADD_PEER,
    peerAddress: ADDRESS_BY_REPLICA[replicaId],
    replicaIdentity: replicaId,
  };
}

function removePeer(replicaId) {
  return {
    type: RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER,
    peerAddress: ADDRESS_BY_REPLICA[replicaId],
    replicaIdentity: replicaId,
  };
}

function nextImmediate() {
  return new Promise((resolve) => setImmediate(resolve));
}

// A services-cache change reaches the partition on the cache's next turn (the
// cache never notifies inside the mutating turn), and the partition's
// coalesced peer reconciliation runs on the turn after that. Settling both
// turns means every observation below follows the partition's handling of the
// change, so a "nothing happened" assertion cannot pass merely because the
// notification had not been delivered yet.
async function settleCacheChange() {
  await nextImmediate();
  await nextImmediate();
}

test('authoritative replica deletes prune departed peers so the final ' +
  'MovieLens cohort is exactly the live replicas, while row absence alone ' +
  'remains conservative',
async (t) => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: 'node-a'}});
  LoggingService.getInstance().initialize({level: 'error'});
  t.teardown(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

  const cache = new SystemTableCache();
  for (const replicaId of [R1, R2, R3]) {
    cache.applySystemTableChange(
      TABLES.SERVICES,
      CDC_OPERATIONS.INSERT,
      serviceRow(replicaId),
    );
  }

  const provider = new ControllablePartitionRaftProvider();
  const partition = createControllablePartitionService({
    partitionId: PARTITION_ID,
    tableId: 'sql_transaction_participants',
    tableName: 'sql_transaction_participants',
    replicaId: R1,
    replicaIds: [R1, R2, R3],
    nodeId: 'node-a',
    dbPath: ':memory:',
    deferElection: true,
  }, provider);
  partition.systemTableCache = cache;
  t.teardown(async () => {
    partition.systemTableCache = null;
    await partition.shutdown();
  });
  await partition.initialize();
  await settleCacheChange();

  t.same(
    peerAddresses(partition),
    [ADDRESS_BY_REPLICA[R2], ADDRESS_BY_REPLICA[R3]].sort(),
    'the bootstrap Raft cohort begins at r1/r2/r3',
  );
  t.same(proposalsSince(provider, 0), [],
    'the bootstrap voters are the port\'s initial configuration: nothing is ' +
    'proposed for them');

  // Only the leader proposes membership. The election is the core's and this
  // double does not witness a vote: r1 campaigns through the port and the
  // double answers as a core that won it.
  t.equal(partition.raft.campaign().outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
    'r1 campaigns through the port');
  t.equal(partition.raft.readStatus().role, RaftRole.LEADER,
    'r1 leads the bootstrap cohort');

  let mark = provider.confChanges.length;
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
  await settleCacheChange();
  t.same(
    proposalsSince(provider, mark),
    [removePeer(R2), removePeer(R3), addPeer(R4), addPeer(R5)],
    'the accepted deletes retire r2/r3 and the reconcile admits r4/r5, each ' +
      'as one membership proposal through the port',
  );
  t.same(
    peerAddresses(partition),
    [ADDRESS_BY_REPLICA[R4], ADDRESS_BY_REPLICA[R5]].sort(),
    'authoritative ADD then REMOVE converges to r1/r4/r5',
  );

  mark = provider.confChanges.length;
  cache.applySystemTableChange(
    TABLES.SERVICES,
    CDC_OPERATIONS.INSERT,
    serviceRow(REPLACEMENT, 4),
  );
  await settleCacheChange();
  t.same(
    proposalsSince(provider, mark),
    [addPeer(REPLACEMENT)],
    'the replacement is admitted by one ADD_PEER proposal',
  );
  t.same(
    peerAddresses(partition),
    [
      ADDRESS_BY_REPLICA[R4],
      ADDRESS_BY_REPLICA[R5],
      ADDRESS_BY_REPLICA[REPLACEMENT],
    ].sort(),
    'replacement joins before the transient voter retires',
  );

  mark = provider.confChanges.length;
  cache.applySystemTableChange(
    TABLES.SERVICES,
    CDC_OPERATIONS.DELETE,
    serviceRow(R4, 1),
  );
  await settleCacheChange();
  t.ok(
    peerAddresses(partition).includes(ADDRESS_BY_REPLICA[R4]),
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
  await settleCacheChange();
  t.ok(
    peerAddresses(partition).includes(ADDRESS_BY_REPLICA[R4]),
    'terminal evidence with a mismatched replica address cannot retire r4',
  );
  t.ok(
    peerAddresses(partition).includes(ADDRESS_BY_REPLICA[R5]),
    'mismatched terminal evidence cannot retire the address owner r5',
  );
  t.same(
    proposalsSince(provider, mark)
      .filter((change) =>
        change.type === RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER),
    [],
    'neither the stale delete nor the mismatched terminal evidence proposed ' +
      'a retirement',
  );

  mark = provider.confChanges.length;
  cache.applySystemTableChange(
    TABLES.SERVICES,
    CDC_OPERATIONS.UPDATE,
    {...serviceRow(R4, 5), status: ReplicaStatus.REMOVED},
  );
  await settleCacheChange();

  t.same(
    proposalsSince(provider, mark),
    [removePeer(R4)],
    'the accepted terminal evidence retires exactly r4 by one REMOVE_PEER ' +
      'proposal',
  );
  t.same(
    peerAddresses(partition),
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
    partition.raft.readStatus().peerCount + 1,
    FINAL_REPLICA_IDS.length,
    'the final configuration is the three-voter cohort r1/r5/replacement',
  );

  const unprovenReplicaId = 'row-absent-without-delete-evidence';
  const unprovenAddress = `node-unknown/partition/${unprovenReplicaId}`;
  // A peer the configuration holds without any services row (setup of the
  // double's configuration, as the retired liferaft double joined it).
  provider.peers.push({
    address: unprovenAddress,
    replicaIdentity: unprovenReplicaId,
  });
  partition.replicaIds.push(unprovenReplicaId);
  mark = provider.confChanges.length;
  partition.reconcileRaftPeersFromCache();
  await settleCacheChange();
  t.ok(
    peerAddresses(partition).includes(unprovenAddress),
    'a row-less peer remains joined without an accepted terminal/delete event',
  );
  t.same(
    proposalsSince(provider, mark)
      .filter((change) =>
        change.type === RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER),
    [],
    'row absence alone proposes no retirement',
  );
  t.ok(
    partition.replicaIds.includes(unprovenReplicaId),
    'row absence alone does not rewrite the replica identity cohort',
  );
});
