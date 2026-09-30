// A retiring services row (REMOVING) is an explicit peer retirement (owner
// ruling F2, 2026-09-26): the replica being removed marks itself REMOVING and
// keeps participating until its RemoveNode commits, retiring its port and
// deleting its row only after that. The group therefore proposes the removal
// on the REMOVING row, while the row still gives the leader the replica's
// address; waiting for the delete would wait for a row the replica deletes
// only after the removal it waits for.
//
// The partition's contribution is the membership proposal its services-cache
// reconcile makes through the port (the controllable provider records every
// proposeConfChange), as in dt-movielens-raft-peer-cohort-pruning-election.
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
} from './partition-service-test-support.js';

const PARTITION_ID = 'users-p3';
const LEADER = 'users-p3-r1';
const RETIRING = 'users-p3-r2';
const NODE_OF = Object.freeze({[LEADER]: 'node-a', [RETIRING]: 'node-b'});

function serviceRow(replicaId, status, updatedAt) {
  return {
    service_id: replicaId,
    partition_id: PARTITION_ID,
    service_type: SERVICE_TYPE.PARTITION,
    node_id: NODE_OF[replicaId],
    address: `${NODE_OF[replicaId]}/partition/${replicaId}`,
    status,
    raft_role: RaftRole.FOLLOWER,
    updated_at: updatedAt,
  };
}

function nextImmediate() {
  return new Promise((resolve) => setImmediate(resolve));
}

// The cache notifies on its next turn; the coalesced reconcile runs on the
// turn after that.
async function settleCacheChange() {
  await nextImmediate();
  await nextImmediate();
}

function removals(provider, mark) {
  return provider.confChanges.slice(mark)
    .filter((change) => change.type === RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER)
    .map((change) => change.replicaIdentity);
}

test('a REMOVING row retires its peer by one REMOVE_PEER while the row still ' +
  'addresses it', async (t) => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: 'node-a'}});
  LoggingService.getInstance().initialize({level: 'error'});
  t.teardown(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });
  const cache = new SystemTableCache();
  for (const replicaId of [LEADER, RETIRING]) {
    cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATIONS.INSERT,
      serviceRow(replicaId, ReplicaStatus.ACTIVE, 1));
  }
  const provider = new ControllablePartitionRaftProvider();
  const partition = createControllablePartitionService({
    partitionId: PARTITION_ID,
    tableId: 'users',
    tableName: 'users',
    replicaId: LEADER,
    replicaIds: [LEADER, RETIRING],
    nodeId: NODE_OF[LEADER],
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
  t.equal(partition.raft.campaign().outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
    'setup: the local replica campaigns');

  const mark = provider.confChanges.length;
  cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATIONS.UPDATE,
    serviceRow(RETIRING, ReplicaStatus.REMOVING, 2));
  await settleCacheChange();
  t.same(removals(provider, mark), [RETIRING],
    'the retiring row proposed exactly one REMOVE_PEER of its replica');
  t.equal(partition.resolveKnownPeerAddress(RETIRING),
    serviceRow(RETIRING, ReplicaStatus.REMOVING, 2).address,
    'the retiring replica stays addressable while its row exists, so the ' +
      'removal can still reach it for its ack');
  t.notOk(partition.raft.readStatus().peers.some((peer) =>
    peer.replicaIdentity === RETIRING),
  'and the reconcile does not re-admit it');
});
