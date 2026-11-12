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
import {GROUP_REMOVAL_VERDICT} from
  '../../src/node/replica-removal-group-verdict.js';
import {REPLICA_CONSENSUS_EXIT_REASON} from
  '../../src/node/replica-removal-consensus-exit.js';
import {
  REPLICA_REMOVAL_SETTLEMENT_CAUSE,
  REPLICA_REMOVAL_SETTLEMENT_OUTCOME,
} from '../../src/node/replica-removal-settlement.js';
import {
  REPLICA_REMOVAL_CANCEL_ANSWER,
  REPLICA_REMOVAL_CANCEL_REASON,
} from '../../src/node/replica-removal-cancel-contract.js';
import {REPLICA_HANDLER_LOG_MSG} from
  '../../src/node/replica-handler-constants.js';
import {
  ReplicaOperationField,
  ReplicaOperationMessageType,
} from '../../src/rebalancer/replica-operation-constants.js';
import {PARTITION_SERVICE_EVENT} from
  '../../src/partition/partition-service-constants.js';
import {RAFT_OPERATION} from '../../src/raft/raft-operation-port-constants.js';
import {
  COMMITTED_MEMBERSHIP_ANSWER_KIND,
  COMMITTED_MEMBERSHIP_REFUSAL,
} from '../../src/raft/raft-committed-membership-constants.js';
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
import {createLifecycleServiceRow} from
  '../test-helpers/lifecycle-state-store.js';

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
  const groupVerdicts = captureLog(source.handler, 'info',
    REPLICA_HANDLER_LOG_MSG.REMOVE_GROUP_VERDICT);
  const answersOf = (logged) => ({groupVerdict: logged?.groupVerdict,
    soleFounder: logged?.soleFounder});
  await source.removeRequest('op-restart');
  await settleRemoval(world, 'op-restart');
  t.same(world.lastOutcome(), {
    type: EXECUTOR_OUTCOME_TYPE.REPLICA_REMOVE_FAILED,
    errorCode: REPLICA_REMOVAL_STILL_MEMBER_WITHOUT_PORT},
  'the group still names it: a named deferral, typed');
  t.same(source.outcomes.at(-1)[3].deferralReasons, [
    REPLICA_CONSENSUS_EXIT_REASON.NO_CONSENSUS_PORT,
    GROUP_REMOVAL_VERDICT.STILL_MEMBER],
  'the deferral carries its named states: no port, the group\'s answer');
  t.same(answersOf(groupVerdicts.at(-1)), {
    groupVerdict: GROUP_REMOVAL_VERDICT.STILL_MEMBER, soleFounder: null},
  'the group answered: the replica\'s own file is never consulted');
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
  t.same(answersOf(groupVerdicts.at(-1)), {
    groupVerdict: GROUP_REMOVAL_VERDICT.REMOVED, soleFounder: null},
  'admitted by the group\'s answer alone: its own file was not consulted');
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

// The leader {a} removes s; s applies its own removal (its row still
// serves: no removal ran).
async function removeThroughLeader(world) {
  const {cluster, a, s} = world;
  await retirePartitionRaftPeer({raft: cluster.node(a),
    partitionId: world.partitionId, replicaId: a}, s);
  cluster.settle(() => !durableAppliedState(cluster.replica(s).dbFile,
    world.partitionId).voters.includes(world.sPeer), {rounds: ELECTION_ROUNDS});
}

// The source's port with its committed-membership read refused (the
// port's typed HELD refusal) while `faults.refuseRead` holds.
function faultMembershipRead(service, faults) {
  const port = service.raft;
  service.raft = new Proxy({}, {get: (_target, key) => {
    if (key === RAFT_OPERATION.READ_COMMITTED_MEMBERSHIP) {
      return (request) => faults.refuseRead ?
        {kind: COMMITTED_MEMBERSHIP_ANSWER_KIND.REFUSED,
          reason: COMMITTED_MEMBERSHIP_REFUSAL.HELD} : port[key](request);
    }
    const value = port[key];
    return typeof value === 'function' ? value.bind(port) : value;
  }});
}

function captureLog(handler, level, message) {
  const seen = [];
  const original = handler.logger[level].bind(handler.logger);
  handler.logger[level] = (logged, fields) => {
    if (logged === message) seen.push(fields);
    return original(logged, fields);
  };
  return seen;
}

test('an unreadable settlement read concludes nothing: the replica keeps ' +
  'its serving row and is not fenced; its next consensus observation reads ' +
  'again and settles it', async (t) => {
  const world = openWorld(t, 'settle-unreadable');
  const {source, s} = world;
  t.equal(world.elected, true, 'setup: a leads {s, a, b}');
  const faults = {refuseRead: true};
  faultMembershipRead(source.service, faults);
  relayPartitionConsensusObservations(source.service);
  const pending = captureLog(source.handler, 'info',
    REPLICA_HANDLER_LOG_MSG.REMOVAL_SETTLEMENT_PENDING);
  await removeThroughLeader(world);
  await nextTurns();
  t.same({status: world.cache.get('services', s)?.status,
    fenced: source.service.admissionFenced,
    pending: pending.map((fields) => fields.outcome),
    rereads: source.handler.removalSettlementRereads.has(s)},
  {status: ReplicaStatus.ACTIVE, fenced: false,
    pending: [REPLICA_REMOVAL_SETTLEMENT_OUTCOME.UNREADABLE], rereads: true},
  'its read refused: neither settled nor failed, re-asked on its next ' +
  'observation (named)');
  // The read answers again; the replica's next consensus observation (any
  // kind, here a leader announcement) re-asks.
  faults.refuseRead = false;
  source.service.emit(PARTITION_SERVICE_EVENT.CONSENSUS_OBSERVED,
    {partitionId: world.partitionId, replicaId: s, leaderReplicaId: null});
  for (let turn = 0; turn < 20 &&
    world.cache.get('services', s)?.status !== ReplicaStatus.FAILED;
    turn += 1) {
    await nextTurns(5);
  }
  t.same({status: world.cache.get('services', s)?.status,
    fenced: source.service.admissionFenced,
    rereads: source.handler.removalSettlementRereads.has(s)},
  {status: ReplicaStatus.FAILED, fenced: true, rereads: false},
  'the next observation settles it: fenced and FAILED');
});

test('a tracked service without the removal fence cannot be marked FAILED ' +
  'while it still serves: the settlement fails loudly, its row keeps ' +
  'serving', async (t) => {
  const world = openWorld(t, 'settle-no-fence');
  const {source, s} = world;
  t.equal(world.elected, true, 'setup: a leads {s, a, b}');
  delete source.service.fenceServingAdmissionForRemoval;
  relayPartitionConsensusObservations(source.service);
  const failed = captureLog(source.handler, 'error',
    REPLICA_HANDLER_LOG_MSG.REMOVAL_SETTLEMENT_FAILED);
  await removeThroughLeader(world);
  for (let turn = 0; turn < 20 && failed.length === 0; turn += 1) {
    await nextTurns(5);
  }
  t.same({status: world.cache.get('services', s)?.status,
    failures: failed.length > 0},
  {status: ReplicaStatus.ACTIVE, failures: true},
  'no FAILED row over a replica nothing fenced; the failure is reported');
});

function cancelRequest(world, operationId) {
  return {payload: {
    [ReplicaOperationField.TYPE]:
      ReplicaOperationMessageType.CANCEL_REPLICA_REMOVAL,
    [ReplicaOperationField.OPERATION_ID]: operationId,
    [ReplicaOperationField.PARTITION_ID]: world.partitionId,
    [ReplicaOperationField.REPLICA_ID]: world.s,
    // The fixture's services row generation (created_at).
    [ReplicaOperationField.REPLICA_GENERATION]: 1,
  }, correlationId: `cancel-${operationId}`};
}

test('a cancel that finds the removal applied over a serving row republishes ' +
  'the retiring row first: a write that did not apply is UNAVAILABLE (asked ' +
  'again), never ALREADY_REMOVED over a serving row; the re-ask republishes ' +
  'and the REMOVING re-drive tears the replica down', async (t) => {
  const world = openWorld(t, 'settle-cancel-republish');
  const {source, s} = world;
  t.equal(world.elected, true, 'setup: a leads {s, a, b}');
  await removeThroughLeader(world);
  t.equal(world.cache.get('services', s)?.status, ReplicaStatus.ACTIVE,
    'setup: s applied its own removal with a serving row');
  // The status-write port exhausts its retry (a retryable control-plane
  // failure) once.
  const persist = source.handler.persistReplicaStatusWithRetry
    .bind(source.handler);
  let refusals = 1;
  source.handler.persistReplicaStatusWithRetry = (...args) => {
    if (refusals > 0) {
      refusals -= 1;
      return Promise.reject(Object.assign(
        new Error('status write retry spent'), {deferRetry: true}));
    }
    return persist(...args);
  };
  const first = await source.handler.handleMessage(
    cancelRequest(world, 'op-cancel'));
  t.same(first[ReplicaOperationField.REMOVAL_CANCELLATION], {
    answer: REPLICA_REMOVAL_CANCEL_ANSWER.UNAVAILABLE,
    reason: REPLICA_REMOVAL_CANCEL_REASON.REPUBLISH_NOT_APPLIED},
  'the republish did not apply: UNAVAILABLE, the asker asks again');
  t.equal(world.cache.get('services', s)?.status, ReplicaStatus.ACTIVE,
    'its row still serves');
  const again = await source.handler.handleMessage(
    cancelRequest(world, 'op-cancel'));
  t.same(again[ReplicaOperationField.REMOVAL_CANCELLATION], {
    answer: REPLICA_REMOVAL_CANCEL_ANSWER.ALREADY_REMOVED,
    reason: REPLICA_REMOVAL_CANCEL_REASON.REMOVAL_APPLIED},
  'the re-ask republishes: ALREADY_REMOVED');
  t.same({row: world.cache.get('services', s)?.status,
    local: source.handler.getLocalReplica(s)?.status},
  {row: ReplicaStatus.REMOVING, local: ReplicaStatus.REMOVING},
  'its row reads retiring again, its local status matches');
  // The lifecycle owner's REMOVING re-drive tears it down.
  const stateMachine = source.handler.replicaStateMachine;
  const baseNow = stateMachine.now;
  stateMachine.now = () => baseNow() + REMOVING_BOUND_MS;
  stateMachine.checkTimeoutsNow();
  await nextTurns();
  await settleRemoval(world, null);
  t.same({row: world.cache.get('services', s) ?? null,
    local: source.handler.getLocalReplica(s)?.status,
    storage: fs.existsSync(world.cluster.replica(s).dbFile)},
  {row: null, local: ReplicaStatus.REMOVED, storage: false},
  'the re-drive completed the removal from the republished row');
});

test('a removal with no port asks its group only through the handler\'s ' +
  'message router: without one it fails loudly, never a deferral that ' +
  'reads the wiring gap as a group that did not answer', async (t) => {
  const world = openWorld(t, 'settle-no-router');
  const {cluster, source, s} = world;
  t.equal(world.elected, true, 'setup: a leads {s, a, b}');
  await source.removeRequest('op-norouter');
  await nextTurns();
  source.handler.removalConsensusExitRelease.abort();
  await settleRemoval(world, 'op-norouter');
  source.handler.removalConsensusExitRelease = new AbortController();
  cluster.isolate(s);
  source.service.raft = null;
  source.handler.messageRouter = null;
  await source.removeRequest('op-norouter');
  await settleRemoval(world, 'op-norouter');
  t.same({...world.lastOutcome(), lifecycle: world.lifecycle()},
    {type: EXECUTOR_OUTCOME_TYPE.REPLICA_REMOVE_FAILED, errorCode: null,
      lifecycle: 'active'},
    'an untyped failure (not REPLICA_REMOVAL_CONSENSUS_EXIT_DEFERRED); ' +
    'nothing retired');
});

// Delay delivery, not the native decision: the real port has already answered.
function pauseNextMembershipAnswer(service) {
  const port = service.raft;
  let release;
  let reached;
  let waiting = true;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const observed = new Promise((resolve) => {
    reached = resolve;
  });
  service.raft = new Proxy({}, {get: (_target, key) => {
    if (key === RAFT_OPERATION.READ_COMMITTED_MEMBERSHIP) {
      return async (request) => {
        const answer = await port[key](request);
        if (waiting) {
          waiting = false;
          reached(answer);
          await gate;
        }
        return answer;
      };
    }
    const value = port[key];
    return typeof value === 'function' ? value.bind(port) : value;
  }});
  return {observed, release};
}

// A fresh real native opening at the same logical ID. The common lifecycle
// fixture is the metadata transport boundary; the real state machine still
// owns its full-identity CAS and every status transition.
function installSettlementSuccessor(t, world, generation) {
  const {source, s, partitionId, cache} = world;
  source.service.raft.close();
  const cluster = new PartitionNodeCluster({partitionId, replicaIds: [s]});
  const elected = cluster.settle(() => cluster.leaderReplicaId() === s,
    {rounds: ELECTION_ROUNDS});
  const row = createLifecycleServiceRow({replicaId: s, partitionId,
    nodeId: source.handler.nodeId, status: ReplicaStatus.ACTIVE,
    createdAt: generation, stateEnteredAt: generation});
  const stateStore = source.lifecycleStore;
  // Replacement is the controlled external actor at the shared row seam.
  stateStore.durable.services.set(s, {...row});
  stateStore.project('services', row);
  cache.upsert('services', row);
  const successor = createRemovalSourceHandler({cluster, replicaId: s,
    partitionId, nodeId: source.handler.nodeId, cache, stateStore,
    rowOf: () => ({...row, createdAt: generation,
      stateEnteredAt: generation})});
  const handler = source.handler;
  handler.replicaStateMachine = successor.handler.replicaStateMachine;
  handler.localServices.set(s, successor.service);
  handler.localReplicas.set(s, successor.handler.localReplicas.get(s));
  t.teardown(async () => {
    await successor.dispose();
    cluster.dispose();
  });
  return {cluster, service: successor.service, elected, row};
}

async function beginPausedSettlement(t, world) {
  t.equal(world.elected, true, 'setup: the native survivor leads the group');
  const pause = pauseNextMembershipAnswer(world.source.service);
  relayPartitionConsensusObservations(world.source.service);
  await removeThroughLeader(world);
  const answer = await pause.observed;
  t.notOk(durableAppliedState(world.cluster.replica(world.s).dbFile,
    world.partitionId).voters.includes(world.sPeer),
  'setup: the actual native runtime applied its own removal');
  t.equal(world.cache.get('services', world.s)?.status, ReplicaStatus.ACTIVE,
    'setup: the real status writer has not run while the native answer is held');
  return {...pause, answer};
}

test('settlement held native membership: unchanged runtime still fences and ' +
  'marks its own generation FAILED', async (t) => {
  const world = openWorld(t, 'settle-generation-current');
  const pause = await beginPausedSettlement(t, world);
  t.ok(pause.answer, 'the actual native read reached the delivery barrier');
  pause.release();
  await nextTurns();
  t.equal(world.cache.get('services', world.s)?.status, ReplicaStatus.FAILED,
    'the unchanged native runtime still settles through the real writer');
  t.equal(world.source.service.admissionFenced, true,
    'the same observed runtime is fenced');
});

for (const generation of [1, 2]) {
  test(`settlement held native membership preserves successor generation ${generation}`,
    async (t) => {
      const world = openWorld(t, `settle-generation-replace-${generation}`);
      const pause = await beginPausedSettlement(t, world);
      const successor = installSettlementSuccessor(t, world, generation);
      t.equal(successor.elected, true, 'the successor is an actual native leader');
      t.equal(durableLifecycleState(successor.cluster.replica(world.s).dbFile,
        world.partitionId), 'active', 'the successor native lifecycle is ACTIVE');
      const pending = captureLog(world.source.handler, 'info',
        REPLICA_HANDLER_LOG_MSG.REMOVAL_SETTLEMENT_PENDING);
      pause.release();
      await nextTurns();
      t.same({row: world.cache.get('services', world.s)?.status,
        createdAt: world.cache.get('services', world.s)?.created_at,
        local: world.source.handler.getLocalReplica(world.s)?.status,
        lifecycle: world.source.handler.replicaStateMachine.getState(world.s)?.state,
        runtime: world.source.handler.getTrackedService(world.s) === successor.service,
        fenced: successor.service.admissionFenced},
      {row: ReplicaStatus.ACTIVE, createdAt: generation,
        local: ReplicaStatus.ACTIVE, lifecycle: ReplicaStatus.ACTIVE,
        runtime: true, fenced: false},
      'old membership cannot mutate the real ACTIVE successor through the status owner');
      t.equal(world.source.service.admissionFenced, false,
        'a superseded observed runtime is not fenced after the await');
      t.equal(pending.length, 0, 'stale work creates no retry debt for the successor');
      t.equal(world.source.handler.removalSettlementRereads.has(world.s), false,
        'the successor inherits no old settlement re-read');
    });
}

test('settlement replacement at the fence cannot redirect FAILED to the ' +
  'new native runtime', async (t) => {
  const world = openWorld(t, 'settle-generation-at-write');
  const pause = await beginPausedSettlement(t, world);
  const fence = world.source.service.fenceServingAdmissionForRemoval;
  let successor;
  world.source.service.fenceServingAdmissionForRemoval = () => {
    fence();
    successor = installSettlementSuccessor(t, world, 2);
  };
  pause.release();
  await nextTurns();
  t.equal(successor?.elected, true, 'replacement occurred at the real fence boundary');
  t.same({row: world.cache.get('services', world.s)?.status,
    local: world.source.handler.getLocalReplica(world.s)?.status,
    lifecycle: world.source.handler.replicaStateMachine.getState(world.s)?.state,
    fenced: successor?.service.admissionFenced},
  {row: ReplicaStatus.ACTIVE, local: ReplicaStatus.ACTIVE,
    lifecycle: ReplicaStatus.ACTIVE, fenced: false},
  'the status write owner preserves the successor after the pre-fence check');
});

test('settlement held native membership yields to the real concurrent removal',
  async (t) => {
    const world = openWorld(t, 'settle-generation-removal');
    const pause = await beginPausedSettlement(t, world);
    const warnings = captureLog(world.source.handler, 'warn',
      REPLICA_HANDLER_LOG_MSG.REMOVED_OUTSIDE_REMOVAL);
    const ack = await world.source.removeRequest('op-concurrent-settlement');
    t.equal(ack.status, 'initiated', 'the actual removal owner admitted its operation');
    t.equal(world.source.handler.inProgressOperations.size > 0, true,
      'the original settlement is released while removal really runs');
    pause.release();
    await settleRemoval(world, 'op-concurrent-settlement');
    t.equal(warnings.length, 0, 'settlement did not race its separate FAILED write');
    t.equal(world.source.handler.getLocalReplica(world.s)?.status,
      ReplicaStatus.REMOVED, 'the real removal owner completed its own transition');
  });
