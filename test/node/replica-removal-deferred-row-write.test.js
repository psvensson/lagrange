/**
 * Verification replace-owner round 1, V2: removeReplicaAsync awaited the
 * consensus exit only when the REMOVING row write landed. A retryable
 * control-plane failure that exhausted the row write's retry answered
 * `published: false`, and the handler retired the port at once - the
 * pre-F2 order - although the wait never reads the row (it reads the port's
 * applied configuration). In a two-voter group {s, t} the RemoveNode(s)
 * then had no second ack.
 *
 * Now the handler waits whenever its port is live, whatever the row write
 * answered (a FAILED replica still skips it: the failure detector's
 * verdict). The production handler removes a follower of a two-voter group
 * over its real port; its REMOVING write fails retryable; the leader
 * proposes RemoveNode(s) while it waits: the removal commits with s's ack,
 * s leaves on its own applied removal, then retires.
 * Oracles: the leader's durable log fold, s's durable applied configuration
 * at the moment its durable lifecycle row changed.
 */

import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {REPLICA_CONSENSUS_EXIT_REASON} from
  '../../src/node/replica-removal-consensus-exit.js';
import {retirePartitionRaftPeer} from
  '../../src/partition/partition-service-raft-membership-administration.js';
import {PartitionNodeCluster} from
  '../raft/raft-rs-backend/partition-node-cluster.js';
import {
  durableAppliedState,
  durableHardState,
  foldAt,
  logFold,
} from '../raft/raft-rs-backend/committed-membership-oracles.js';
import {createMockCache} from '../rebalancer/test-helpers.js';
import {
  createRemovalSourceHandler,
  durableLifecycleState,
} from './replica-removal-consensus-exit-fixture.js';

const PARTITION_ID = 'users-p8';
const SOURCE = `${PARTITION_ID}-r1`;
const LEADER = `${PARTITION_ID}-r2`;
const ROUNDS = 400;

function serviceRow(replicaId, status) {
  const nodeId = `${replicaId}-node`;
  return {service_id: replicaId, replica_id: replicaId,
    partition_id: PARTITION_ID, node_id: nodeId, service_type: 'partition',
    status, raft_role: 'follower', address: `${nodeId}/partition/${replicaId}`};
}

function nextTurns(turns = 20) {
  let chain = Promise.resolve();
  for (let turn = 0; turn < turns; turn += 1) {
    chain = chain.then(() => new Promise((resolve) => setImmediate(resolve)));
  }
  return chain;
}

test('a REMOVING row write deferred by a retryable failure still waits for ' +
  'the source\'s applied removal before it retires', async (t) => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
  const cluster = new PartitionNodeCluster({partitionId: PARTITION_ID,
    replicaIds: [SOURCE, LEADER]});
  cluster.tickers = [LEADER];
  t.ok(cluster.settle(() => cluster.leaderReplicaId() === LEADER,
    {rounds: ROUNDS}), 'setup: the other voter leads');
  const peerIds = [SOURCE, LEADER].map((replicaId) =>
    String(cluster.raftPeerIdOf(replicaId)));
  const cache = createMockCache({services: [
    serviceRow(SOURCE, ReplicaStatus.ACTIVE),
    serviceRow(LEADER, ReplicaStatus.ACTIVE)]});
  const source = createRemovalSourceHandler({cluster, replicaId: SOURCE,
    partitionId: PARTITION_ID, nodeId: `${SOURCE}-node`, cache,
    rowOf: (status) => serviceRow(SOURCE, status)});
  t.teardown(async () => {
    await source.dispose();
    cluster.dispose();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });
  // The REMOVING write exhausts its retry on a retryable control-plane
  // failure (every other status write goes through).
  const persist = source.handler.persistReplicaStatusWithRetry
    .bind(source.handler);
  source.handler.persistReplicaStatusWithRetry = async (id, status, data) => {
    if (status === ReplicaStatus.REMOVING) {
      throw Object.assign(new Error('control-plane write deferred'),
        {deferRetry: true});
    }
    return persist(id, status, data);
  };
  const sourceDb = cluster.replica(SOURCE).dbFile;
  const leaderDb = cluster.replica(LEADER).dbFile;
  const lifecycleAtSetup = durableLifecycleState(sourceDb, PARTITION_ID);
  const committedVoters = () => foldAt(logFold(leaderDb, PARTITION_ID,
    peerIds), Number(durableHardState(leaderDb, PARTITION_ID).commit)).voters;

  await source.removeRequest('op-deferred-row');
  await nextTurns();
  t.not(cache.get('services', SOURCE)?.status, ReplicaStatus.REMOVING,
    'setup: the REMOVING row write did not land');
  t.equal(durableLifecycleState(sourceDb, PARTITION_ID), lifecycleAtSetup,
    'the source is not retired while the committed configuration names it');

  await retirePartitionRaftPeer({raft: cluster.node(LEADER),
    partitionId: PARTITION_ID, replicaId: LEADER}, SOURCE);
  let retiredWithApplied = null;
  for (let round = 0; round < 40 && retiredWithApplied === null; round += 1) {
    cluster.settle(() => false, {rounds: 10});
    await nextTurns();
    if (durableLifecycleState(sourceDb, PARTITION_ID) !== lifecycleAtSetup) {
      retiredWithApplied =
        durableAppliedState(sourceDb, PARTITION_ID).voters;
    }
  }
  t.same(committedVoters(), [peerIds[1]],
    'RemoveNode(source) committed in {source, leader}: the source acked it');
  t.same(retiredWithApplied, [peerIds[1]],
    'when it retired, its own applied configuration no longer named it');
  t.same(source.exits.map((exit) => exit.reason),
    [REPLICA_CONSENSUS_EXIT_REASON.REMOVAL_APPLIED],
    'it left consensus on its own applied removal');
});
