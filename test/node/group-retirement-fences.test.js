/**
 * Witnesses of the round-3 corrective fences on group retirement as a unit
 * (owner ruling 2026-10-04, fail-closed), over real rs-raft groups and
 * PRODUCTION replica handlers (group-retirement-as-a-unit-fixture.js).
 *
 * G2b-L  a LEARNER in the committed configuration is a required member: it
 *        is frozen and must answer before the group's row goes.
 * G2b-P  the freeze refuses while a configuration change is pending (the
 *        retirement read): nothing is frozen or sent; once the change
 *        applied, the group's row event re-runs it and the frozen set is the
 *        configuration that change produced.
 * G2b-A  every membership change of a group its durable record retires is
 *        refused at the partition's one conf-change admission (admit,
 *        row-driven retire, handler retire), typed, before the port; a group
 *        that is not retiring is untouched (differential).
 * G2b-R  the rebalancer plans nothing for a retiring group (a skipped cycle)
 *        and its one creation boundary refuses typed before persisting.
 * C1     COMPLETED only: a member that answers INITIATED (its REMOVING row
 *        not durable) stays listed, typed in-progress, and nothing completes.
 * P5     a node that no longer tracks a member answers COMPLETED from that
 *        member's durable lifecycle row (retired, group-retired, exact
 *        identity and group); a reseed-required retired row whose group
 *        retirement no longer verifies (the workflow completed and cleared
 *        its record - a verified one completes it, owner decision
 *        2026-10-05, group-retirement-reseed-held.test.js), no row, or an
 *        ordinary REMOVE answers NOT_FOUND.
 * P3     a leaderless group's "membership unavailable" ends on the group
 *        gaining a leader (its leader's services row), no timer.
 */
import Database from 'better-sqlite3';

import fs from 'node:fs';
import path from 'node:path';
import {test} from '../../src/test-helpers/tap.js';
import {
  PARTITION_TRANSITION_STATE,
} from '../../src/partition/partition-constants.js';
import {
  SPLIT_ACK_STATUS,
  SPLIT_PARTICIPANT_PREFIX,
} from '../../src/partition/split-ack-constants.js';
import {readCommittedGroupMemberIds} from
  '../../src/partition/group-retirement-members.js';
import {
  admitPartitionRaftPeer,
  proposePeerRetirement,
  retirePartitionRaftPeer,
} from '../../src/partition/partition-service-raft-membership-administration.js';
import {
  RAFT_MEMBERSHIP_ADMISSION_OUTCOME,
  RAFT_MEMBERSHIP_CHANGE_REFUSAL,
  RAFT_MEMBERSHIP_OPERATION,
} from '../../src/raft/raft-operation-port-constants.js';
import {COMMITTED_MEMBERSHIP_REFUSAL} from
  '../../src/raft/raft-committed-membership-constants.js';
import {
  ReplicaOperationField,
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {REBALANCER_SKIP_REASON} from
  '../../src/rebalancer/rebalancer-constants.js';
import {RebalanceCoordinator, UnifiedRebalancer} from
  '../../src/rebalancer/index.js';
import {bindingWireNumbers} from
  '../raft/raft-rs-backend/committed-membership-oracles.js';
import {
  TABLE_ID,
  createWorkflowOwner,
  driveUntilRemoved,
  nextTurns,
  openGroupWorld,
} from './group-retirement-as-a-unit-fixture.js';

const GROUP_RETIRED = 'group-retired';
const WORKFLOW_ID = 'wf-fence-1';
const FENCE = 3;
const SOURCE_KEY = SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION;
const SETTLE_ROUNDS = 400;

function retiringSplitRecord(partitionId) {
  return {table_id: TABLE_ID, active_partition_version: 2,
    partition_transition_state:
      PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
    partition_transition_metadata: JSON.stringify({workflowId: WORKFLOW_ID,
      workflowFenceToken: FENCE, targetPartitionVersion: 2,
      sourcePartitionId: partitionId,
      targetPartitionIds: [`${partitionId}-l`, `${partitionId}-r`],
      participants: {[SOURCE_KEY]: {participantKey: SOURCE_KEY,
        status: SPLIT_ACK_STATUS.CLEANUP_COMPLETED, fenceToken: FENCE}}})};
}

async function openSplitOwner(world) {
  const record = retiringSplitRecord(world.partitionId);
  world.setTablesRow(record);
  const metadata = JSON.parse(record.partition_transition_metadata);
  return createWorkflowOwner(world, {family: 'split', workflow: {
    workflowId: WORKFLOW_ID, fenceToken: FENCE, tableId: TABLE_ID,
    partitionId: world.partitionId,
    status: PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE, metadata,
    participants: [{participantKey: SOURCE_KEY,
      status: SPLIT_ACK_STATUS.CLEANUP_COMPLETED}]}});
}

async function settle(world, rounds = 10) {
  await driveUntilRemoved(world, [], rounds);
  await nextTurns();
}

function frozenSet(world) {
  return JSON.parse(world.tablesRows.get(TABLE_ID)
    .partition_transition_metadata).participants[SOURCE_KEY]?.checkpoint
    ?.requiredReplicaIds ?? null;
}

// Demote one voter to a learner on the leader (a simple configuration
// change through the core primitive).
function proposeDemotion(world, replicaId) {
  const wire = bindingWireNumbers();
  const leader = world.cluster.leaderReplicaId();
  world.cluster.proposeConfigurationChange([{
    changeType: wire.changeType.AddLearnerNode,
    nodeId: world.cluster.raftPeerIdOf(replicaId),
  }], wire.transition.Auto, leader);
  return leader;
}

function learnerApplied(world, replicaId, leader) {
  const conf = world.cluster.coreConfState(leader);
  return conf.learners.map(String).includes(
    String(world.cluster.raftPeerIdOf(replicaId))) &&
    conf.votersOutgoing.length === 0;
}

test('G2b-L a learner of the committed configuration is a required member',
  async (t) => {
    const world = openGroupWorld(t, {partitionId: 'fence-learner',
      voters: 3, reconcile: false});
    const [, , learner] = world.members;
    const leader = proposeDemotion(world, learner);
    t.ok(world.cluster.settle(() => learnerApplied(world, learner, leader),
      {rounds: SETTLE_ROUNDS}), 'setup: the configuration holds a learner');
    t.same([...await readCommittedGroupMemberIds(world.membershipReader,
      world.partitionId)].sort(), [...world.members].sort(),
    'the committed members are the voters AND the learner');
    const owner = await openSplitOwner(world);
    world.dropDeliveryTo.add(learner);
    await owner.finalizeSplitDissolutionIfReady(WORKFLOW_ID);
    await driveUntilRemoved(world, world.members.filter((id) =>
      id !== learner));
    await settle(world);
    t.same(frozenSet(world), [...world.members].sort(),
      'the frozen set holds the learner');
    t.same(world.terminals, [], 'nothing completes without the learner');
    t.same(owner.groupRetirementRedrive.unacknowledged().map((entry) =>
      entry.unacknowledgedReplicaIds), [[learner]],
    'the learner is listed until it answers');
    world.dropDeliveryTo.delete(learner);
    world.emitSystemRow('services', 'UPDATE',
      world.cache.get('services', learner));
    t.equal(await driveUntilRemoved(world, [learner]), true,
      'its row event re-drove it');
    await settle(world);
    t.same(world.terminals, [WORKFLOW_ID], 'completed after the learner');
  });

test('G2b-P the freeze refuses while a configuration change is pending',
  async (t) => {
    const world = openGroupWorld(t, {partitionId: 'fence-pending',
      voters: 3, reconcile: false});
    const [, , demoted] = world.members;
    // Proposed at the leader, not yet committed (nothing delivered).
    const leader = proposeDemotion(world, demoted);
    await t.rejects(readCommittedGroupMemberIds(world.membershipReader,
      world.partitionId), {code: COMMITTED_MEMBERSHIP_REFUSAL
      .CONF_CHANGE_PENDING}, 'the retirement read refuses it typed');
    const owner = await openSplitOwner(world);
    let frozenAtTerminal = null;
    const clear = owner.persistTerminalTransitionClear;
    owner.persistTerminalTransitionClear = async (state) => {
      frozenAtTerminal = frozenSet(world);
      return clear(state);
    };
    await owner.finalizeSplitDissolutionIfReady(WORKFLOW_ID);
    await nextTurns();
    t.equal(world.deliveries.length, 0, 'no REMOVE sent');
    t.equal(frozenSet(world), null, 'nothing frozen');
    t.same(owner.groupRetirementRedrive.unacknowledged().map((entry) =>
      entry.membershipUnavailable), [true], 'listed: membership unavailable');
    // The change applies; the member's row change (its completion event in
    // the view) re-runs the step.
    t.ok(world.cluster.settle(() => learnerApplied(world, demoted, leader),
      {rounds: SETTLE_ROUNDS}), 'setup: the change applied');
    world.emitSystemRow('services', 'UPDATE',
      world.cache.get('services', demoted));
    t.equal(await driveUntilRemoved(world, world.members), true,
      'the group\'s row event re-ran it and every member retired');
    await settle(world);
    t.same(frozenAtTerminal, [...world.members].sort(),
      'frozen from the applied configuration (the learner included)');
  });

// A partition service of a group, its port counting every touch.
function serviceOf(partitionId, tablesRow) {
  const portCalls = [];
  const rows = new Map([
    [`partitions:${partitionId}`, {partition_id: partitionId,
      table_id: TABLE_ID}],
    [`tables:${TABLE_ID}`, tablesRow],
  ]);
  const warns = [];
  return {portCalls, warns, service: {
    partitionId, replicaId: `${partitionId}-r1`,
    logger: {debug() {}, info() {}, warn: (message, fields) =>
      warns.push({message, fields}), error() {}},
    systemTableCache: {get: (table, key) => rows.get(`${table}:${key}`) ??
      null},
    raft: {
      readStatus: () => {
        portCalls.push('readStatus');
        return {role: 'follower', peers: []};
      },
      proposeConfChange: (change) => {
        portCalls.push(change.type);
        return {outcome: 'CORE_OK'};
      },
    },
  }};
}

test('G2b-A the partition\'s conf-change admission refuses every membership ' +
  'change of a retiring group, typed, before the port', async (t) => {
  const retiring = serviceOf('fence-adm', retiringSplitRecord('fence-adm'));
  const admitted = admitPartitionRaftPeer(retiring.service,
    {replicaIdentity: 'joiner', peerAddress: 'n9/partition/joiner'});
  t.equal(admitted.outcome, RAFT_MEMBERSHIP_ADMISSION_OUTCOME.REFUSED,
    'an ADD is refused');
  t.equal(admitted.reason, RAFT_MEMBERSHIP_CHANGE_REFUSAL.GROUP_RETIRING,
    'typed: the group is retiring');
  const removed = proposePeerRetirement(retiring.service, {
    type: RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER, replicaIdentity: 'm2'});
  t.equal(removed.reason, RAFT_MEMBERSHIP_CHANGE_REFUSAL.GROUP_RETIRING,
    'a row-driven REMOVE_PEER is refused');
  const retired = await retirePartitionRaftPeer(retiring.service, 'm3');
  t.equal(retired.reason, RAFT_MEMBERSHIP_CHANGE_REFUSAL.GROUP_RETIRING,
    'a handler-driven retirement is refused');
  t.same(retiring.portCalls, [], 'the port was never touched');
  t.equal(retiring.warns.length, 1, 'the refused admission is one WARN');
  // Differential: the same group whose record is not retiring.
  const live = serviceOf('fence-adm', {table_id: TABLE_ID,
    active_partition_version: 1, partition_transition_state: null,
    partition_transition_metadata: null});
  admitPartitionRaftPeer(live.service,
    {replicaIdentity: 'joiner', peerAddress: 'n9/partition/joiner'});
  proposePeerRetirement(live.service, {
    type: RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER, replicaIdentity: 'm2'});
  t.same(live.portCalls, ['readStatus', RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER],
    'a group that is not retiring reaches its port as before');
});

test('G2b-R the rebalancer plans nothing for a retiring group and its ' +
  'creation boundary refuses typed before persisting', async (t) => {
  const {service} = serviceOf('fence-reb', retiringSplitRecord('fence-reb'));
  const persisted = [];
  const coordinator = Object.assign(
    Object.create(RebalanceCoordinator.prototype), {
      systemTableCache: service.systemTableCache,
      assertMembershipPublicationEpoch() {},
      persistNewOperation: async (row) => persisted.push(row),
    });
  await t.rejects(coordinator.createOperationInternal({type: 'ADD',
    partitionId: 'fence-reb', entityType: 'partition',
    entityId: 'fence-reb', nodeId: 'n2'}),
  {rebalanceSkipReason: REBALANCER_SKIP_REASON.GROUP_RETIRING},
  'an ADD is refused with the group-retiring skip');
  t.same(persisted, [], 'nothing persisted');
  let planned = 0;
  const rebalancer = Object.assign(
    Object.create(UnifiedRebalancer.prototype), {
      isShuttingDown: false, isLeader: true, entityId: 'fence-reb',
      systemTableCache: service.systemTableCache,
      logger: {debug() {}, info() {}, warn() {}, error() {}},
      getPolicy: async () => {
        planned += 1;
        return {};
      },
      buildRebalanceResult: (success, fields) => ({success, ...fields}),
    });
  const result = await rebalancer.rebalance();
  t.equal(result.reason, REBALANCER_SKIP_REASON.GROUP_RETIRING,
    'the cycle is a group-retiring skip');
  t.equal(planned, 0, 'nothing was planned');
});

test('C1 a member that answers INITIATED is not done: it stays listed, ' +
  'typed in progress, and nothing completes', async (t) => {
  const world = openGroupWorld(t, {partitionId: 'fence-initiated',
    voters: 3});
  const [, stuck] = world.members;
  const owner = await openSplitOwner(world);
  const deliver = owner.deliverReplicaRemoval;
  // Its node acknowledged and then never made its removal durable.
  owner.deliverReplicaRemoval = (request) => request.nodeId ===
    `${stuck}-node` ? Promise.resolve({status:
      ReplicaOperationResponseStatus.INITIATED}) : deliver(request);
  await owner.finalizeSplitDissolutionIfReady(WORKFLOW_ID);
  await driveUntilRemoved(world, world.members.filter((id) => id !== stuck));
  await settle(world);
  const record = JSON.parse(world.tablesRows.get(TABLE_ID)
    .partition_transition_metadata).participants[SOURCE_KEY].checkpoint;
  t.notOk(record.dissolvedReplicaIds.includes(stuck),
    'INITIATED is not recorded as done');
  t.same(world.terminals, [], 'nothing completes');
  t.same(world.partitionRowDeletes, [], 'the partition row is kept');
  t.same(owner.groupRetirementRedrive.unacknowledged().map((entry) =>
    entry.unacknowledgedReplicaIds), [[stuck]], 'it stays listed');
  t.ok(owner.ownerLog.some((line) => line.fields?.unacknowledgedReplicaIds
    ?.includes(stuck)), 'with its WARN');
});

function groupRemove(world, replicaId, {groupRetirement = true} = {}) {
  return {
    [ReplicaOperationField.TYPE]: 'REMOVE_REPLICA',
    [ReplicaOperationField.OPERATION_ID]: `${WORKFLOW_ID}:dissolve:` +
      replicaId,
    [ReplicaOperationField.OPERATION_TYPE]: 'REMOVE',
    [ReplicaOperationField.PARTITION_ID]: world.partitionId,
    [ReplicaOperationField.REPLICA_ID]: replicaId,
    [ReplicaOperationField.REASON]: 'split_source_dissolution',
    ...(groupRetirement ? {[ReplicaOperationField.GROUP_RETIREMENT]: {
      reason: GROUP_RETIRED, kind: 'split-source', workflowId: WORKFLOW_ID,
      fenceToken: FENCE, tableId: TABLE_ID}} : {}),
  };
}

// The node restarted: it tracks the replica no more.
function forget(world, replicaId) {
  const {handler} = world.sources.get(replicaId);
  handler.localReplicas.delete(replicaId);
  handler.localServices.delete(replicaId);
  return handler;
}

test('P5 an untracked member answers COMPLETED only from its own durable ' +
  'group-retired lifecycle row', async (t) => {
  const world = openGroupWorld(t, {partitionId: 'fence-p5', voters: 3});
  const [first, second, third] = world.members;
  const owner = await openSplitOwner(world);
  await owner.finalizeSplitDissolutionIfReady(WORKFLOW_ID);
  t.equal(await driveUntilRemoved(world, world.members), true,
    'setup: every member retired as a unit');
  const answered = await forget(world, first)
    .handleRemoveReplica(groupRemove(world, first));
  t.equal(answered.status, ReplicaOperationResponseStatus.COMPLETED,
    'a restarted node answers from the durable group-retired row');
  t.equal(answered.durablyRetired, true, 'and says so');
  const ordinary = await forget(world, second)
    .handleRemoveReplica(groupRemove(world, second, {groupRetirement: false}));
  t.equal(ordinary.status, ReplicaOperationResponseStatus.NOT_FOUND,
    'an ordinary REMOVE is unchanged (NOT_FOUND)');
  // A retired row for another reason (a reseed hold) answers a group
  // retirement only once its evidence verifies against the record (owner
  // decision 2026-10-05); here the workflow completed and cleared it. Its
  // truthful tombstone from this world's retirement is removed with the
  // rewrite.
  const db = new Database(world.cluster.replica(third).dbFile);
  db.prepare('UPDATE _raft_rs_replica_lifecycle SET reason = ? ' +
    'WHERE group_id = ?').run('reseed-required', world.partitionId);
  db.close();
  fs.rmSync(path.join(world.sources.get(third).handler.dataDir,
    'group-retired-tombstones'), {recursive: true, force: true});
  const reseeded = await forget(world, third)
    .handleRemoveReplica(groupRemove(world, third));
  t.equal(reseeded.status, ReplicaOperationResponseStatus.NOT_FOUND,
    'a reseed-required retired row whose retirement no longer verifies ' +
    'answers NOT_FOUND');
  const other = openGroupWorld(t, {partitionId: 'fence-p5-live', voters: 1});
  const [live] = other.members;
  other.cache.delete('services', live);
  const unknown = await forget(other, live)
    .handleRemoveReplica(groupRemove(other, live));
  t.equal(unknown.status, ReplicaOperationResponseStatus.NOT_FOUND,
    'an active (never retired) row answers NOT_FOUND');
});

test('P3 a leaderless group\'s membership-unavailable ends on the group ' +
  'gaining a leader, no timer', async (t) => {
  const world = openGroupWorld(t, {partitionId: 'fence-p3', voters: 3});
  world.membershipReadAvailable = false;
  const owner = await openSplitOwner(world);
  await owner.finalizeSplitDissolutionIfReady(WORKFLOW_ID);
  await settle(world);
  t.same(owner.groupRetirementRedrive.unacknowledged().map((entry) =>
    entry.membershipUnavailable), [true], 'setup: membership unavailable');
  world.membershipReadAvailable = true;
  const leader = world.cluster.leaderReplicaId();
  // The leader's own services row, published with the leader role.
  world.emitSystemRow('services', 'UPDATE', {
    ...world.cache.get('services', leader), raft_role: 'leader'});
  t.equal(await driveUntilRemoved(world, world.members), true,
    'the leader event re-ran it and every member retired');
  await settle(world);
  t.same(world.terminals, [WORKFLOW_ID], 'it completed');
  t.equal(world.scheduler.fired, 0, 'no timer ended it');
});
