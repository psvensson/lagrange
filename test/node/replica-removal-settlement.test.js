/**
 * A removal state no running removal carries is never left without what
 * clears it (2026-11-11), on a REAL rs-raft group {s, a, b} with every
 * member hosted by the PRODUCTION replica handler
 * (replica-removal-consensus-exit-fixture.js):
 *  - restart mid-removal: s's durable row reads REMOVING, its removal is no
 *    longer running and it has no consensus port. Re-driven (the
 *    coordinator's re-dispatch, then the lifecycle owner's REMOVING re-drive
 *    signal) it asks its group, through the production committed-membership
 *    read answered by a member's handler: while the group's leader still
 *    names it, nothing retires (STILL_MEMBER_WITHOUT_PORT); once the group
 *    committed its removal, it tears down.
 *  - removed outside a removal: s serves (row ACTIVE, no removal running)
 *    and a RemoveNode of it commits (an earlier leader's entry surviving a
 *    cancel). s applies its own removal and converges: it stops serving and
 *    is marked FAILED; the repair path's REMOVE then tears it down through
 *    the removal owner on its applied removal.
 */

import fs from 'node:fs';
import {test} from '../../src/test-helpers/tap.js';
import {buildDeliveryEnvelope} from
  '../../src/transport/transport-semantic-outcome.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {EXECUTOR_OUTCOME_TYPE} from
  '../../src/rebalancer/executor-outcome-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {
  REPLICA_REMOVAL_STILL_MEMBER_WITHOUT_PORT,
} from '../../src/node/replica-removal-debt-errors.js';
import {REPLICA_CONSENSUS_EXIT_REASON} from
  '../../src/node/replica-removal-consensus-exit.js';
import {REPLICA_REMOVAL_SETTLEMENT_CAUSE} from
  '../../src/node/replica-removal-settlement.js';
import {retirePartitionRaftPeer} from
  '../../src/partition/partition-service-raft-membership-administration.js';
import {relayPartitionConsensusObservations} from
  '../../src/partition/partition-service-raft-lifecycle-wiring.js';
import {PartitionNodeCluster} from
  '../raft/raft-rs-backend/partition-node-cluster.js';
import {
  durableAppliedState,
  durableHardState,
  foldAt,
  logFold,
} from '../raft/raft-rs-backend/committed-membership-oracles.js';
import {createMockCache, createTestRebalancer} from
  '../rebalancer/test-helpers.js';
import {EntityType} from '../../src/rebalancer/unified-rebalancer.js';
import {REBALANCER_MOVE_TYPE} from '../../src/rebalancer/rebalancer-constants.js';
import {
  createRemovalSourceHandler,
  durableLifecycleState,
  nextTurns,
  partitionServiceRow,
} from './replica-removal-consensus-exit-fixture.js';

const ELECTION_ROUNDS = 400;
const REMOVING_BOUND_MS = 61_000;

function openWorld(t, partitionId) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
  const [s, a, b] = ['r1', 'r2', 'r3'].map((id) => `${partitionId}-${id}`);
  const cluster = new PartitionNodeCluster({partitionId,
    replicaIds: [s, a, b]});
  cluster.tickers = [a];
  const elected = cluster.settle(() => cluster.leaderReplicaId() === a &&
    [s, a, b].every((id) => durableAppliedState(cluster.replica(id).dbFile,
      partitionId)?.appliedIndex > 0), {rounds: ELECTION_ROUNDS});
  cluster.tickers = [a, b, s];
  const cache = createMockCache({services: [s, a, b].map((id) =>
    partitionServiceRow(partitionId, id, ReplicaStatus.ACTIVE))});
  const hosts = new Map([s, a, b].map((id) => [id,
    createRemovalSourceHandler({cluster, replicaId: id, partitionId,
      nodeId: `${id}-node`, cache,
      rowOf: (status) => partitionServiceRow(partitionId, id, status)})]));
  // The node-to-node seam: a READ_COMMITTED_MEMBERSHIP addressed to a node
  // is answered by that node's production handler entry point.
  for (const host of hosts.values()) {
    host.handler.systemTableCache = cache;
    host.handler.messageRouter = {deliver: async (target, payload) => {
      const nodeId = target.split('/')[0];
      const peer = [...hosts.values()].find((other) =>
        other.handler.nodeId === nodeId);
      if (!peer || cluster.isolated.has(peer.service.replicaId)) {
        return buildDeliveryEnvelope({acknowledged: true},
          {status: 'error', error: 'unreachable'});
      }
      const {correlationId: _ignored, ...answer} =
        await peer.handler.handleMessage({payload, correlationId: 'x'});
      return buildDeliveryEnvelope({acknowledged: true}, answer);
    }};
  }
  const source = hosts.get(s);
  // The source's durable lifecycle is the one its port opened.
  source.handler.getPartitionDbPath = () => cluster.replica(s).dbFile;
  const peers = [s, a, b].map((id) => String(cluster.raftPeerIdOf(id)));
  const world = {cluster, cache, hosts, source, s, a, b, elected, partitionId,
    committedVoters: () => foldAt(logFold(cluster.replica(a).dbFile,
      partitionId, peers), Number(durableHardState(cluster.replica(a).dbFile,
      partitionId).commit)).voters,
    sPeer: peers[0],
    lifecycle: () => durableLifecycleState(cluster.replica(s).dbFile,
      partitionId),
    lastOutcome: () => {
      const [type, , , options] = source.outcomes.at(-1) ?? [];
      return {type: type ?? null, errorCode: options?.errorCode ?? null};
    },
  };
  t.teardown(async () => {
    for (const host of hosts.values()) await host.dispose();
    cluster.dispose();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });
  return world;
}

async function settleRemoval(world, operationId) {
  for (let turn = 0; turn < 40 && world.source.handler.inProgressOperations
    .has(operationId); turn += 1) {
    await nextTurns(5);
  }
  for (let turn = 0; turn < 40 &&
    (world.source.handler.removingRedrives?.size ?? 0) > 0; turn += 1) {
    await nextTurns(5);
  }
}

test('restart mid-removal: still a member, nothing retires; once the group ' +
  'committed its removal, the REMOVING re-drive tears it down',
async (t) => {
  const world = openWorld(t, 'settle-restart');
  const {cluster, source, s, a} = world;
  t.equal(world.elected, true, 'setup: a leads {s, a, b}');
  const ack = await source.removeRequest('op-restart');
  t.equal(ack.status, 'initiated', 'the REMOVE is accepted');
  await nextTurns();
  t.equal(world.cache.get('services', s)?.status, ReplicaStatus.REMOVING,
    'setup: its row reads REMOVING');
  // The restart: its running removal ends (released), its port is gone.
  source.handler.removalConsensusExitRelease.abort();
  await settleRemoval(world, 'op-restart');
  source.handler.removalConsensusExitRelease = new AbortController();
  cluster.isolate(s);
  source.service.raft = null;
  t.equal(source.handler.inProgressOperations.size, 0,
    'setup: no removal runs any more');

  // Re-dispatched while the group still names it.
  await source.removeRequest('op-restart');
  await settleRemoval(world, 'op-restart');
  t.same(world.lastOutcome(), {
    type: EXECUTOR_OUTCOME_TYPE.REPLICA_REMOVE_FAILED,
    errorCode: REPLICA_REMOVAL_STILL_MEMBER_WITHOUT_PORT},
  'the group still names it: a named deferral, typed');
  t.equal(world.lifecycle(), 'active', 'nothing retired');
  t.equal(world.cache.get('services', s)?.status, ReplicaStatus.REMOVING,
    'its row still reads REMOVING');
  t.ok(world.committedVoters().includes(world.sPeer),
    'it is still a committed voter');

  // The group commits its removal without it ({a, b} are a quorum).
  await retirePartitionRaftPeer({raft: cluster.node(a),
    partitionId: world.partitionId, replicaId: a}, s);
  cluster.settle(() => !world.committedVoters().includes(world.sPeer),
    {rounds: ELECTION_ROUNDS});
  t.notOk(world.committedVoters().includes(world.sPeer),
    'the group committed its removal');
  // The lifecycle owner's REMOVING re-drive signal (its bound elapsed).
  const stateMachine = source.handler.replicaStateMachine;
  const baseNow = stateMachine.now;
  stateMachine.now = () => baseNow() + REMOVING_BOUND_MS;
  stateMachine.checkTimeoutsNow();
  await nextTurns();
  await settleRemoval(world, null);
  t.equal(world.lastOutcome().type,
    EXECUTOR_OUTCOME_TYPE.REPLICA_REMOVE_COMPLETED, 'the removal completed');
  t.equal(world.cache.get('services', s) ?? null, null,
    'the re-drive asked the group and tore it down: its row is deleted');
  t.equal(source.handler.getLocalReplica(s)?.status, ReplicaStatus.REMOVED,
    'it is REMOVED');
});

test('removed outside a removal: the replica applies its own removal with ' +
  'a serving row; it stops serving, is marked FAILED, and the repair ' +
  'REMOVE tears it down on its applied removal', async (t) => {
  const world = openWorld(t, 'settle-outside');
  const {cluster, source, s, a} = world;
  t.equal(world.elected, true, 'setup: a leads {s, a, b}');
  // Production wiring: the port's consensus announcements reach the node.
  relayPartitionConsensusObservations(source.service);
  await retirePartitionRaftPeer({raft: cluster.node(a),
    partitionId: world.partitionId, replicaId: a}, s);
  cluster.settle(() => !durableAppliedState(cluster.replica(s).dbFile,
    world.partitionId).voters.includes(world.sPeer), {rounds: ELECTION_ROUNDS});
  for (let turn = 0; turn < 20 &&
    world.cache.get('services', s)?.status !== ReplicaStatus.FAILED;
    turn += 1) {
    await nextTurns(5);
  }
  t.equal(source.service.admissionFenced, true, 'it stops serving');
  t.same({status: world.cache.get('services', s)?.status,
    cause: world.cache.get('services', s)?.error_message},
  {status: ReplicaStatus.FAILED,
    cause: REPLICA_REMOVAL_SETTLEMENT_CAUSE.REMOVED_OUTSIDE_REMOVAL},
  'it is marked FAILED with its named cause');
  // The repair planner, from the rows alone: it removes the FAILED replica
  // and restores the count.
  const planner = createTestRebalancer({entityId: world.partitionId,
    entityType: EntityType.PARTITION, nodeId: 'planner-node',
    systemTableCache: createMockCache({services: world.cache.getAll('services'),
      replicaOperations: []})});
  planner.initialize();
  const moves = planner.movePlanner.calculateMoves(
    planner.getCurrentReplicas(), {targetReplicaCount: 3,
      targetNodes: [`${s}-node`, `${a}-node`, `${world.b}-node`, 'spare-node'],
      degraded: false});
  planner.shutdown();
  t.same({removesIt: moves.some((move) => move.type ===
    REBALANCER_MOVE_TYPE.REMOVE && move.replicaId === s),
  adds: moves.some((move) => move.type === REBALANCER_MOVE_TYPE.ADD)},
  {removesIt: true, adds: true},
  'the repair planner removes the FAILED replica and plans the ADD');
  // The repair path's REMOVE of the FAILED replica.
  const ack = await source.removeRequest('op-repair');
  t.equal(ack.status, 'initiated', 'the repair REMOVE is accepted');
  for (let round = 0; round < 40 && !source.outcomes.some(([type]) =>
    type === EXECUTOR_OUTCOME_TYPE.REPLICA_REMOVE_COMPLETED); round += 1) {
    cluster.settle(() => false, {rounds: 5});
    await nextTurns();
  }
  t.same(source.exits.map((exit) => exit.reason),
    [REPLICA_CONSENSUS_EXIT_REASON.REMOVAL_APPLIED],
    'it leaves on its applied removal');
  t.equal(world.cache.get('services', s) ?? null, null, 'its row is deleted');
  t.equal(fs.existsSync(cluster.replica(s).dbFile), false,
    'its storage is gone');
});
