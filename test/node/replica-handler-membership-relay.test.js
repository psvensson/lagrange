// Receipts (quest replace-source-removal-owner, amendment-1 step 1, design
// S5.2): the node's single consensus relay.
//   - a partition service relays its port's MEMBERSHIP_CHANGED (the applied
//     ConfState), LEADER_CHANGE and TERM_CHANGE as CONSENSUS_OBSERVED;
//   - the replica handler's tracked-service registry forwards every tracked
//     service's observations to its subscribers, follows a swapped service,
//     and stops at delete.
// The port is a real raft-rs replica; its applied configuration is the
// oracle.

import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {test} from 'node:test';

import {PartitionNodeCluster} from '../raft/raft-rs-backend/partition-node-cluster.js';
import {TrackedServiceRegistry} from '../../src/node/replica-handler-membership-relay.js';
import {
  relayPartitionConsensusObservations,
} from '../../src/partition/partition-service-raft-lifecycle-wiring.js';
import {
  PARTITION_SERVICE_EVENT,
} from '../../src/partition/partition-service-constants.js';
import {
  RAFT_MEMBERSHIP_OPERATION,
} from '../../src/raft/raft-operation-port-constants.js';

const PARTITION_ID = 'membership-relay-partition';
const FOUNDING = Object.freeze(['replica-a', 'replica-b', 'replica-c']);
const SETTLE_ROUNDS = 400;

function relayedService(cluster, replicaId) {
  const service = new EventEmitter();
  service.partitionId = PARTITION_ID;
  service.replicaId = replicaId;
  service.raft = cluster.node(replicaId);
  relayPartitionConsensusObservations(service);
  return service;
}

test('consensus relay: a committed RemoveNode reaches the registry\'s ' +
  'subscriber as the applied configuration; leader and term are relayed',
() => {
  const cluster = new PartitionNodeCluster({
    partitionId: PARTITION_ID,
    replicaIds: FOUNDING,
  });
  const registry = new TrackedServiceRegistry();
  const observed = [];
  try {
    const watched = FOUNDING[1];
    registry.set(watched, relayedService(cluster, watched));
    registry.subscribeConsensusObservations((event) => observed.push(event));
    cluster.tickers = [FOUNDING[0]];
    assert.ok(cluster.settle(() => cluster.leaderReplicaId() !== null,
      {rounds: SETTLE_ROUNDS}), 'the partition elects a leader');
    const leader = cluster.leaderReplicaId();
    assert.ok(observed.some((event) => event.leaderReplicaId === leader),
      'the leader change is relayed');
    assert.ok(observed.some((event) => Number.isFinite(Number(event.term)) &&
      event.term !== undefined), 'the term change is relayed');
    assert.ok(observed.some((event) => event.confState),
      'the first applied configuration is relayed');
    const retiring = FOUNDING.find((id) => id !== leader && id !== watched);
    const retiringPeerId = String(cluster.raftPeerIdOf(retiring));
    cluster.node(leader).proposeConfChange({
      type: RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER,
      replicaIdentity: retiring,
    });
    assert.ok(cluster.settle(() => observed.some((event) => event.confState &&
      !event.confState.voters.map(String).includes(retiringPeerId)),
    {rounds: SETTLE_ROUNDS}), 'the committed removal is relayed');
    const last = observed.filter((event) => event.confState).at(-1);
    assert.equal(last.partitionId, PARTITION_ID);
    assert.equal(last.replicaId, watched);
    assert.deepEqual(last.confState.voters.map(String).sort(),
      cluster.coreConfState(watched).voters.map(String).sort(),
      'the relayed configuration is the one the core applied');
  } finally {
    registry.clear();
    cluster.dispose();
  }
});

test('consensus relay: the registry follows a swapped service and stops at ' +
  'delete', () => {
  const registry = new TrackedServiceRegistry();
  const observed = [];
  registry.subscribeConsensusObservations((event) => observed.push(event));
  const first = new EventEmitter();
  const second = new EventEmitter();
  registry.set('replica-a', first);
  registry.set('replica-a', second);
  first.emit(PARTITION_SERVICE_EVENT.CONSENSUS_OBSERVED, {from: 'first'});
  second.emit(PARTITION_SERVICE_EVENT.CONSENSUS_OBSERVED, {from: 'second'});
  assert.deepEqual(observed, [{from: 'second'}],
    'only the tracked service is relayed');
  registry.delete('replica-a');
  second.emit(PARTITION_SERVICE_EVENT.CONSENSUS_OBSERVED, {from: 'gone'});
  assert.deepEqual(observed, [{from: 'second'}], 'a deleted service is not');
  assert.equal(second.listenerCount(PARTITION_SERVICE_EVENT.CONSENSUS_OBSERVED),
    0, 'its relay listener is detached');
});
