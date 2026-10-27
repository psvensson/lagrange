/**
 * F-1 (verification O1 round 2), the leader-source REMOVE: a plain REMOVE
 * whose source LEADS its group. At d46777ecf the leader's own row-driven
 * retirement skipped itself and every follower's copy was forwarded to it
 * (dropped behind any pending index), so nobody took its RemoveNode: the
 * source retired at F2's 30 s backstop still a committed voter (n = 2:
 * permanent quorum loss).
 *
 * Now conf changes are leader-only, and the leader proposes its OWN
 * RemoveNode when its row reads REMOVING (the same row-driven owner that
 * retires every other peer). Ranged over n = 2 and n = 3: the production
 * replica handler removes the leader over its real port; the leader's and
 * every follower's row-driven retirement run on the REMOVING row (the
 * followers are answered NOT_LEADER); RemoveNode(leader) commits, the leader
 * leaves consensus on its own applied removal and retires, and the
 * survivors keep quorum (a new leader, a write commits).
 *
 * Oracles: a survivor's durable applied configuration, the leader's durable
 * lifecycle row against its value at setup, a write applied through the
 * survivors.
 */

import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {EXECUTOR_OUTCOME_TYPE} from
  '../../src/rebalancer/executor-outcome-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {REPLICA_CONSENSUS_EXIT_REASON} from
  '../../src/node/replica-removal-consensus-exit.js';
import {retireRaftPeerFromAuthoritativeServiceChange} from
  '../../src/partition/partition-service-raft-peer-cache-reconciliation.js';
import {CDC_OPERATION} from '../../src/constants/index.js';
import {PartitionNodeCluster} from
  '../raft/raft-rs-backend/partition-node-cluster.js';
import {durableAppliedState} from
  '../raft/raft-rs-backend/committed-membership-oracles.js';
import {createMockCache} from '../rebalancer/test-helpers.js';
import {
  createRemovalSourceHandler,
  durableLifecycleState,
  nextTurns,
  partitionServiceRow as serviceRow,
} from './replica-removal-consensus-exit-fixture.js';

const ELECTION_ROUNDS = 400;
const EXIT_ROUNDS = 60;
const QUIET_LOGGER = Object.freeze({debug() {}, info() {}, warn() {}});

async function removeLeaderSource(t, voterCount) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
  const partitionId = `leader-source-n${voterCount}`;
  const members = Array.from({length: voterCount},
    (_, index) => `${partitionId}-r${index + 1}`);
  const [leader, ...survivors] = members;
  const cluster = new PartitionNodeCluster({partitionId,
    replicaIds: members});
  cluster.tickers = [leader];
  const elected = cluster.settle(() => cluster.leaderReplicaId() === leader &&
    members.every((replicaId) => durableAppliedState(
      cluster.replica(replicaId).dbFile, partitionId)?.appliedIndex > 0),
  {rounds: ELECTION_ROUNDS});
  const peerIdOf = Object.fromEntries(members.map((replicaId) =>
    [replicaId, String(cluster.raftPeerIdOf(replicaId))]));
  const cache = createMockCache({services: members.map((replicaId) =>
    serviceRow(partitionId, replicaId, ReplicaStatus.ACTIVE))});
  const source = createRemovalSourceHandler({cluster, replicaId: leader,
    partitionId, nodeId: `${leader}-node`, cache,
    rowOf: (status) => serviceRow(partitionId, leader, status)});
  const leaderDb = cluster.replica(leader).dbFile;
  const lifecycleAtSetup = durableLifecycleState(leaderDb, partitionId);
  t.teardown(async () => {
    await source.dispose();
    cluster.dispose();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });
  t.equal(elected, true, 'setup: the source leads');

  await source.removeRequest(`op-remove-${partitionId}`);
  await nextTurns();
  const retiringRow = cache.get('services', leader);
  t.equal(retiringRow?.status, ReplicaStatus.REMOVING,
    'the leader source marked itself retiring');
  // The REMOVING row reaches every replica's row-driven retirement.
  for (const replicaId of members) {
    retireRaftPeerFromAuthoritativeServiceChange({
      raft: cluster.node(replicaId), replicaId, partitionId,
      replicaIds: [...members], peerAddresses: [], logger: QUIET_LOGGER,
    }, CDC_OPERATION.UPDATE, retiringRow);
  }
  const survivorVoters = () => durableAppliedState(
    cluster.replica(survivors[0]).dbFile, partitionId).voters;
  let exited = false;
  for (let round = 0; round < EXIT_ROUNDS && !exited; round += 1) {
    cluster.tickers = [leader, ...survivors];
    cluster.settle(() => false, {rounds: 10});
    await nextTurns();
    exited = source.exits.length > 0;
  }
  t.notOk(survivorVoters().includes(peerIdOf[leader]),
    'RemoveNode(leader) committed: the survivors no longer name it');
  t.same(source.exits.map((exit) => exit.reason),
    [REPLICA_CONSENSUS_EXIT_REASON.REMOVAL_APPLIED],
    'the leader left consensus on its own applied removal');
  t.not(durableLifecycleState(leaderDb, partitionId), lifecycleAtSetup,
    'the leader retired its port');

  cluster.tickers = survivors;
  const newLeader = () => {
    const lead = survivors.find((replicaId) =>
      cluster.node(replicaId).readStatus().leaderId === replicaId);
    return lead ?? null;
  };
  t.ok(cluster.settle(() => newLeader() !== null,
    {rounds: ELECTION_ROUNDS}), 'the survivors elect a leader');
  const marker = `after-leader-removal-n${voterCount}`;
  const leaderReplica = cluster.replica(newLeader());
  const writeApplied = () => leaderReplica.appliedCommands.some((command) =>
    JSON.stringify(command).includes(marker));
  await cluster.propose(newLeader(), marker);
  cluster.settle(writeApplied, {rounds: 200});
  t.equal(writeApplied(), true,
    'the survivors keep quorum (a write commits)');
  for (let round = 0; round < 10 && !source.outcomes.some(([type]) =>
    type === EXECUTOR_OUTCOME_TYPE.REPLICA_REMOVE_COMPLETED); round += 1) {
    await nextTurns();
  }
  t.ok(source.outcomes.some(([type]) =>
    type === EXECUTOR_OUTCOME_TYPE.REPLICA_REMOVE_COMPLETED),
  'the removal completed');
}

test('F-1: REMOVE of the leader of a two-voter group', async (t) => {
  await removeLeaderSource(t, 2);
});

test('F-1: REMOVE of the leader of a three-voter group', async (t) => {
  await removeLeaderSource(t, 3);
});
