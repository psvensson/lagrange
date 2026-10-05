// The row-driven peer admission waits for a replica's prior-existence fact
// (verifier N3): a CREATE_REPLICA target writes PENDING and CREATING before
// its port opens and SYNCING after it, and steps nothing until SYNCING is
// durable. A leader that admitted it as a voter at PENDING/CREATING would
// count a voter that cannot answer - and, for the services partition, which
// stores that fact, make the fact's own write wait on that voter. Only a row
// that records the fact (SYNCING, ACTIVE, or a row born STOPPED by the seed
// or the join path) is admitted; retiring rows never are.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {reconcileRaftPeersFromCacheForService} from
  '../../src/partition/partition-service-raft-peer-cache-reconciliation.js';
import {
  RAFT_MEMBERSHIP_OPERATION,
  RAFT_OPERATION_OUTCOME,
} from '../../src/raft/raft-operation-port-constants.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {SERVICE_STATUS, SERVICE_TYPE} from '../../src/constants/index.js';

const PARTITION_ID = 'identity-record-admission';
const QUIET = Object.freeze({debug() {}, info() {}, warn() {}, error() {}});

function leaderPartition(rows) {
  const proposed = [];
  const raft = {
    readStatus: () => ({role: RAFT_ROLE.LEADER, peers: []}),
    proposeConfChange: (change) => {
      proposed.push(change);
      return {outcome: RAFT_OPERATION_OUTCOME.CORE_OK};
    },
  };
  return {
    proposed,
    service: {
      partitionId: PARTITION_ID,
      replicaId: `${PARTITION_ID}-leader`,
      replicaIds: [`${PARTITION_ID}-leader`],
      logger: QUIET,
      raft,
      systemTableCache: {filter: (table, predicate) => rows.filter(predicate)},
      normalizeLeaderReplicaId: (id) => id,
    },
  };
}

function rowOf(status) {
  const replicaId = `${PARTITION_ID}-${status}`;
  return {
    service_id: replicaId,
    partition_id: PARTITION_ID,
    service_type: SERVICE_TYPE.PARTITION,
    node_id: `node-${status}`,
    address: `node-${status}/partition/${replicaId}`,
    status,
  };
}

test('the leader admits a peer only once its row records the identity fact',
  () => {
    const admitted = [ReplicaStatus.SYNCING, ReplicaStatus.ACTIVE,
      SERVICE_STATUS.STOPPED];
    const withheld = [ReplicaStatus.PENDING, ReplicaStatus.CREATING,
      ReplicaStatus.FAILED, ReplicaStatus.REMOVING, ReplicaStatus.REMOVED];
    const {service, proposed} = leaderPartition(
      [...admitted, ...withheld].map(rowOf));
    reconcileRaftPeersFromCacheForService(service);
    assert.deepEqual(
      proposed.filter((change) =>
        change.type === RAFT_MEMBERSHIP_OPERATION.ADD_PEER)
        .map((change) => change.replicaIdentity).sort(),
      admitted.map((status) => rowOf(status).service_id).sort());
  });

test('the row change that records the fact admits the peer', () => {
  const rows = [rowOf(ReplicaStatus.CREATING)];
  const {service, proposed} = leaderPartition(rows);
  reconcileRaftPeersFromCacheForService(service);
  assert.equal(proposed.length, 0, 'admitted before its fact was durable');
  rows[0] = {...rows[0], status: ReplicaStatus.SYNCING};
  reconcileRaftPeersFromCacheForService(service);
  assert.deepEqual(proposed.map((change) => change.replicaIdentity),
    [rows[0].service_id]);
});
