/**
 * The class witness of the removal ordering (owner ruling F2, 2026-09-26):
 * a replica being removed keeps participating in consensus - stepping,
 * acking, voting - until the committed configuration no longer names it, and
 * only then retires its port. A generic REMOVE (no REPLACE) of a follower in
 * a two-voter group {a, b}: the RemoveNode(a) the leader proposes commits in
 * the configuration {a, b}, so it needs a's own ack. A handler that retired
 * a's port at the REMOVE_REPLICA effect leaves the group without the quorum
 * to commit it.
 *
 * The source side is the production replica handler (handleRemoveReplica ->
 * removeReplicaAsync) over a's real rs-raft port; the leader's side is the
 * row-driven reconcile's action on a retiring row (a REMOVE_PEER through the
 * production retirement seam on b's port). The oracles are durable:
 *  - the committed configuration: the fold of b's durable log at b's durable
 *    commit index (committed-membership-oracles);
 *  - a's own durable applied configuration: a's applied state only advances
 *    while a's port still steps, so a retired replica whose applied
 *    configuration excludes it applied its removal BEFORE it retired;
 *  - a's durable lifecycle row, compared with its own value at setup.
 */

import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {EXECUTOR_OUTCOME_TYPE} from
  '../../src/rebalancer/executor-outcome-constants.js';
import {ReplicaOperationResponseStatus} from
  '../../src/rebalancer/replica-operation-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {RAFT_OPERATION_OUTCOME} from
  '../../src/raft/raft-operation-port-constants.js';
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

const PARTITION_ID = 'users-p7';
const SOURCE = `${PARTITION_ID}-r1`;
const LEADER = `${PARTITION_ID}-r2`;
const NODE_OF = Object.freeze({[SOURCE]: 'node-a', [LEADER]: 'node-b'});
const ELECTION_ROUNDS = 400;
const QUIET_ROUNDS = 60;
const EXIT_ROUNDS = 40;

function serviceRow(replicaId, status) {
  return {
    service_id: replicaId,
    replica_id: replicaId,
    partition_id: PARTITION_ID,
    node_id: NODE_OF[replicaId],
    service_type: 'partition',
    status,
    raft_role: 'follower',
    address: `${NODE_OF[replicaId]}/partition/${replicaId}`,
  };
}

function nextTurns(turns = 20) {
  let chain = Promise.resolve();
  for (let turn = 0; turn < turns; turn += 1) {
    chain = chain.then(() => new Promise((resolve) => setImmediate(resolve)));
  }
  return chain;
}

function openWorld(t) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
  const cluster = new PartitionNodeCluster({partitionId: PARTITION_ID,
    replicaIds: [SOURCE, LEADER]});
  cluster.tickers = [LEADER];
  const elected = cluster.settle(() =>
    cluster.leaderReplicaId() === LEADER,
  {rounds: ELECTION_ROUNDS});
  const peerIds = Object.freeze({
    [SOURCE]: String(cluster.raftPeerIdOf(SOURCE)),
    [LEADER]: String(cluster.raftPeerIdOf(LEADER)),
  });
  const cache = createMockCache({services: [
    serviceRow(SOURCE, ReplicaStatus.ACTIVE),
    serviceRow(LEADER, ReplicaStatus.ACTIVE)]});
  const source = createRemovalSourceHandler({cluster, replicaId: SOURCE,
    partitionId: PARTITION_ID, nodeId: NODE_OF[SOURCE], cache,
    rowOf: (status) => serviceRow(SOURCE, status)});
  const world = {cluster, cache, source, peerIds, elected,
    sourceDb: cluster.replica(SOURCE).dbFile,
    leaderDb: cluster.replica(LEADER).dbFile};
  world.lifecycleAtSetup = durableLifecycleState(world.sourceDb, PARTITION_ID);
  // The committed configuration: the fold of the leader's durable log over
  // the founders, at the leader's durable commit index.
  world.committedVoters = () => foldAt(logFold(world.leaderDb, PARTITION_ID,
    [peerIds[SOURCE], peerIds[LEADER]]),
  Number(durableHardState(world.leaderDb, PARTITION_ID).commit)).voters;
  world.sourceAppliedVoters = () =>
    durableAppliedState(world.sourceDb, PARTITION_ID).voters;
  world.sourceLifecycle = () =>
    durableLifecycleState(world.sourceDb, PARTITION_ID);
  t.teardown(async () => {
    await source.dispose();
    cluster.dispose();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });
  return world;
}

test('generic REMOVE in a two-voter group: the removed follower acks its ' +
  'own RemoveNode and retires only after applying it', async (t) => {
  const world = openWorld(t);
  const {cluster, cache, source, peerIds} = world;
  t.equal(world.elected, true, 'setup: the other voter leads');
  t.same(world.committedVoters(), [peerIds[SOURCE], peerIds[LEADER]].sort(),
    'setup: the committed configuration is the two voters');
  t.not(world.lifecycleAtSetup, null, 'setup: the source has a lifecycle row');

  const ack = await source.removeRequest('op-generic-remove');
  t.equal(ack.status, ReplicaOperationResponseStatus.INITIATED,
    'the REMOVE_REPLICA effect is accepted');
  t.equal(source.service.admissionFenced, true,
    'no new client write is admitted from acceptance on');
  await nextTurns();
  t.equal(cache.get('services', SOURCE)?.status, ReplicaStatus.REMOVING,
    'the source marked itself retiring (its row reads REMOVING)');

  // Nothing has proposed its removal yet: it keeps participating.
  cluster.tickers = [LEADER];
  cluster.settle(() => false, {rounds: QUIET_ROUNDS});
  await nextTurns();
  t.equal(world.sourceLifecycle(), world.lifecycleAtSetup,
    'while the committed configuration names it, the source is not retired');
  t.equal(cluster.node(SOURCE).readStatus().outcome,
    RAFT_OPERATION_OUTCOME.CORE_OK, 'its port still answers');

  // The leader's row-driven reconcile acts on the retiring row.
  const proposal = await retirePartitionRaftPeer({
    raft: cluster.node(LEADER), partitionId: PARTITION_ID,
    replicaId: LEADER}, SOURCE);
  t.ok(proposal.outcome, `the leader proposed RemoveNode(source) (${
    proposal.outcome}/${proposal.reason})`);

  let retiredWithApplied = null;
  for (let round = 0; round < EXIT_ROUNDS; round += 1) {
    cluster.settle(() => false, {rounds: 10});
    await nextTurns();
    if (retiredWithApplied === null &&
        world.sourceLifecycle() !== world.lifecycleAtSetup) {
      retiredWithApplied = world.sourceAppliedVoters();
    }
    if (retiredWithApplied !== null &&
        source.outcomes.some(([type]) =>
          type === EXECUTOR_OUTCOME_TYPE.REPLICA_REMOVE_COMPLETED)) {
      break;
    }
  }
  t.same(world.committedVoters(), [peerIds[LEADER]],
    'RemoveNode(source) committed in {source, leader}: the source acked it');
  t.not(retiredWithApplied, null, 'the source retired');
  t.same(retiredWithApplied, [peerIds[LEADER]],
    'when it retired, its own applied configuration no longer named it');
  t.equal(cluster.node(SOURCE).step({}).outcome,
    RAFT_OPERATION_OUTCOME.CORE_REFUSED,
    'a late step after retirement is refused typed');
  t.equal(cache.get('services', SOURCE) ?? null, null,
    'its services row is deleted after retirement');
  t.ok(source.outcomes.some(([type]) =>
    type === EXECUTOR_OUTCOME_TYPE.REPLICA_REMOVE_COMPLETED),
  'the removal completed');
  t.same(source.exits.map((exit) => exit.reason),
    [REPLICA_CONSENSUS_EXIT_REASON.REMOVAL_APPLIED],
    'it left consensus on its own applied removal, not on the backstop');
  const marker = 'after-generic-remove';
  const leaderReplica = cluster.replica(LEADER);
  const applied = () => leaderReplica.appliedCommands.some((command) =>
    JSON.stringify(command).includes(marker));
  await cluster.propose(LEADER, marker);
  cluster.settle(applied, {rounds: 200});
  t.equal(applied(), true,
    'the remaining voter keeps quorum (a write through it commits)');
});
