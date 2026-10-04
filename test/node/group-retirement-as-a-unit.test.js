/**
 * Witnesses of the owner decision of 2026-10-04 amending ruling F2: a group
 * retired by a durable cutover exits AS A UNIT. The four paths that end a
 * whole partition group - a split source dissolved after its cutover, a
 * merge source dissolved after its cutover, the children of an aborted
 * split, the target of an aborted merge - remove no member by conf change:
 * each REMOVE carries the workflow's evidence ({kind, workflowId,
 * fenceToken, tableId, reason: group-retired}), each replica verifies it
 * against the durable workflow record (the table's `tables` row, read
 * through the authoritative control-plane read), and retires and closes at
 * once through the durable retirement owner with the consensus-exit reason
 * `group-retired`. No RemoveNode is proposed, so no member is ever removed
 * down to a last voter, and the 30 s consensus-exit backstop never arms.
 *
 * Real classes: rs-raft operation ports (PartitionNodeCluster), PRODUCTION
 * ReplicaHandlers, the PRODUCTION row-driven reconcile on every member, the
 * PRODUCTION workflow dissolution/teardown methods, a router between them
 * (group-retirement-as-a-unit-fixture.js). Every assertion is a state or a
 * count; nothing sleeps.
 *
 * W1 split source, 3 voters; W2 sole-voter split source; W3 evidence
 * refusals; W5 merge source, aborted split child, aborted merge target; W7
 * the backstop alarm. The lost-REMOVE re-drive (W4a-W4f) is
 * group-retirement-redrive.test.js. (W6, ordinary REMOVE unchanged, is
 * the differential recorded with the quest plus the unchanged F2 witnesses
 * replica-removal-consensus-exit.test.js and
 * replica-removal-leader-source.test.js.)
 */

import {mock} from 'node:test';

import Database from 'better-sqlite3';

import {test} from '../../src/test-helpers/tap.js';
import {
  PARTITION_TRANSITION_STATE,
} from '../../src/partition/partition-constants.js';
import {
  SPLIT_ACK_STATUS,
  SPLIT_PARTICIPANT_PREFIX,
} from '../../src/partition/split-ack-constants.js';
import {
  MERGE_ACK_STATUS,
  buildMergeSourceParticipantKey,
} from '../../src/partition/merge-ack-constants.js';
import {
  ReplicaOperationField,
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {RAFT_OPERATION_OUTCOME} from
  '../../src/raft/raft-operation-port-constants.js';
import {REPLICA_CONSENSUS_EXIT_REASON} from
  '../../src/node/replica-removal-consensus-exit.js';
import {REPLICA_HANDLER_DEFAULT} from
  '../../src/node/replica-handler-constants.js';
import {
  TABLE_ID,
  createWorkflowOwner,
  driveUntilRemoved,
  nextTurns,
  openGroupWorld,
} from './group-retirement-as-a-unit-fixture.js';

// The wire values of the decision (the module that owns them does not exist
// before it; a witness red on the parent must load there).
const GROUP_RETIRED = 'group-retired';
const REFUSAL = Object.freeze({
  EVIDENCE_MALFORMED: 'group-retirement-evidence-malformed',
  RECORD_UNAVAILABLE: 'group-retirement-record-unavailable',
  RECORD_ABSENT: 'group-retirement-record-absent',
  WORKFLOW_MISMATCH: 'group-retirement-workflow-mismatch',
  FENCE_MISMATCH: 'group-retirement-fence-mismatch',
  TRANSITION_STATE_MISMATCH: 'group-retirement-transition-state-mismatch',
  GROUP_NOT_NAMED: 'group-retirement-group-not-named',
  EPOCH_MISMATCH: 'group-retirement-epoch-mismatch',
  SOURCE_MIRROR_ACTIVE: 'group-retirement-source-mirror-active',
});
const WORKFLOW_ID = 'wf-retire-1';
const FENCE = 3;
const ACTIVE_EPOCH = 1;
const TARGET_EPOCH = 2;

function durableLifecycleRow(dbFile, groupId) {
  const db = new Database(dbFile, {readonly: true, fileMustExist: true});
  try {
    return db.prepare('SELECT state, reason FROM _raft_rs_replica_lifecycle ' +
      'WHERE group_id = ?').get(groupId) ?? null;
  } finally {
    db.close();
  }
}

// The durable workflow record of each retiring-group kind, naming the
// world's partition in the role the kind retires.
const KIND = Object.freeze({
  'split-source': (partitionId) => ({
    state: PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
    activeEpoch: TARGET_EPOCH,
    metadata: {
      sourcePartitionId: partitionId,
      targetPartitionIds: [`${partitionId}-left`, `${partitionId}-right`],
      participants: {[SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION]:
        {status: SPLIT_ACK_STATUS.CLEANUP_COMPLETED}},
    },
    family: 'split',
    participantKey: SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION,
    finishedStatus: SPLIT_ACK_STATUS.CLEANUP_COMPLETED,
    drive: (owner) => owner.finalizeSplitDissolutionIfReady(WORKFLOW_ID),
  }),
  'merge-source': (partitionId) => ({
    state: PARTITION_TRANSITION_STATE.MERGE_CUTOVER_ACTIVE,
    activeEpoch: TARGET_EPOCH,
    metadata: {
      sourcePartitionIds: [partitionId, `${partitionId}-sibling`],
      targetPartitionIds: [`${partitionId}-merged`],
      participants: {[buildMergeSourceParticipantKey(partitionId)]:
        {status: MERGE_ACK_STATUS.SOURCE_MIRROR_REMOVED}},
    },
    family: 'merge',
    participantKey: buildMergeSourceParticipantKey(partitionId),
    finishedStatus: MERGE_ACK_STATUS.SOURCE_MIRROR_REMOVED,
    drive: (owner) => owner.dissolveMergeSourcePartition(WORKFLOW_ID,
      partitionId),
  }),
  'split-aborted-child': (partitionId) => ({
    state: PARTITION_TRANSITION_STATE.FAILED,
    activeEpoch: ACTIVE_EPOCH,
    metadata: {
      sourcePartitionId: `${partitionId}-source`,
      targetPartitionIds: [partitionId, `${partitionId}-other-child`],
    },
    family: 'split',
    drive: (owner, workflow) =>
      owner.teardownAbortedSplitChildren(WORKFLOW_ID, workflow),
  }),
  'merge-aborted-target': (partitionId) => ({
    state: PARTITION_TRANSITION_STATE.FAILED,
    activeEpoch: ACTIVE_EPOCH,
    metadata: {
      sourcePartitionIds: [`${partitionId}-a`, `${partitionId}-b`],
      targetPartitionIds: [partitionId],
    },
    family: 'merge',
    drive: (owner, workflow) =>
      owner.teardownAbortedMergeTarget(WORKFLOW_ID, workflow),
  }),
});

/**
 * Install the durable record of one kind and open its workflow owner.
 * @return {Promise<Object>} {workflow, record, owner, drive}.
 */
async function installRecord(world, kind, overrides = {}) {
  const shape = KIND[kind](world.partitionId);
  const fence = overrides.fence ?? FENCE;
  const participantStatus = overrides.participantStatus ??
    shape.finishedStatus;
  const metadata = {
    workflowId: WORKFLOW_ID,
    workflowFenceToken: fence,
    targetPartitionVersion: TARGET_EPOCH,
    ...shape.metadata,
    ...(overrides.metadata || {}),
  };
  const record = {
    table_id: TABLE_ID,
    active_partition_version: overrides.activeEpoch ?? shape.activeEpoch,
    partition_transition_state: overrides.state ?? shape.state,
    partition_transition_metadata: JSON.stringify(metadata),
  };
  world.setTablesRow(record);
  if (shape.participantKey) {
    metadata.participants = {[shape.participantKey]: {status:
      participantStatus}};
    record.partition_transition_metadata = JSON.stringify(metadata);
  }
  world.setTablesRow(record);
  return openOwner(world, kind, {fence, metadata, record, participantStatus,
    status: record.partition_transition_state});
}

/**
 * Open one workflow owner of a kind against the installed record (a new
 * owner process: its own coordinator state recovered from the record).
 * @return {Promise<Object>} {workflow, record, owner, drive}.
 */
async function openOwner(world, kind, {fence, metadata, record, status,
  participantStatus}) {
  const shape = KIND[kind](world.partitionId);
  const workflow = {
    workflowId: WORKFLOW_ID,
    fenceToken: fence,
    tableId: TABLE_ID,
    partitionId: world.partitionId,
    status,
    metadata,
    participants: shape.participantKey ? [{
      participantKey: shape.participantKey,
      status: participantStatus ?? shape.finishedStatus,
    }] : [],
  };
  const owner = await createWorkflowOwner(world,
    {family: shape.family, workflow});
  return {workflow, record, owner,
    drive: () => shape.drive(owner, workflow)};
}


/**
 * The common oracle of a group retired as a unit.
 */
function assertRetiredAsUnit(t, world, label) {
  for (const replicaId of world.members) {
    t.same(world.exitsOf(replicaId), [GROUP_RETIRED],
      `${label}: ${replicaId} left consensus as group-retired`);
    const row = durableLifecycleRow(
      world.cluster.replica(replicaId).dbFile, world.partitionId);
    t.same(row, {state: 'retired', reason: GROUP_RETIRED},
      `${label}: ${replicaId}'s durable retirement is recorded group-retired`);
    t.equal(world.cluster.node(replicaId).readStatus().outcome,
      RAFT_OPERATION_OUTCOME.CORE_REFUSED,
      `${label}: ${replicaId}'s port is closed (it answers refused)`);
    t.equal(world.cache.get('services', replicaId) ?? null, null,
      `${label}: ${replicaId}'s services row is released`);
  }
  t.same(world.proposals, [],
    `${label}: no conf change was proposed for the retiring group`);
  t.same(world.consensusWaits, [],
    `${label}: no consensus-exit wait (and so no backstop) was armed`);
  t.same(world.alarms, [], `${label}: the backstop alarm never fired`);
}

for (const [kind, voters] of [
  ['split-source', 3],
  ['merge-source', 3],
  ['split-aborted-child', 2],
  ['merge-aborted-target', 3],
]) {
  const witness = kind === 'split-source' ? 'W1' : 'W5';
  test(`${witness} ${kind}: a ${voters}-voter group retires as a unit`,
    async (t) => {
      const world = openGroupWorld(t, {partitionId: `retire-${kind}`,
        voters});
      t.equal(world.elected, true, 'setup: the group has a leader');
      const {drive, owner} = await installRecord(world, kind);
      await drive();
      t.equal(await driveUntilRemoved(world, world.members), true,
        'every member completed its removal');
      assertRetiredAsUnit(t, world, kind);
      t.equal(world.partitionRowDeletes.filter((id) =>
        id === world.partitionId).length, 1,
      'the group\'s partition row is deleted once, after every member');
      t.same(owner.groupRetirementRedrive.unacknowledged().filter(
        (entry) => entry.partitionId === world.partitionId), [],
      'nothing of this group is left unacknowledged');
      if (kind === 'split-aborted-child') {
        // The other child has no group in this world: its committed
        // configuration is unreadable, so it stays listed - never "no
        // members", and its partition row is never deleted on that.
        t.same(owner.groupRetirementRedrive.unacknowledged().map((entry) =>
          [entry.partitionId, entry.membershipUnavailable]),
        [[`${world.partitionId}-other-child`, true]],
        'the other child stays listed, membership unavailable');
        t.notOk(world.partitionRowDeletes.includes(
          `${world.partitionId}-other-child`),
        'no row is deleted for a group whose members were never read');
      }
      if (kind === 'split-source') {
        t.same(world.terminals, [WORKFLOW_ID],
          'the split reached its terminal (SOURCE_DISSOLVED)');
      }
    });
}

test('W2 the sole-voter split source retires at once, nothing proposed',
  async (t) => {
    const world = openGroupWorld(t, {partitionId: 'retire-sole', voters: 1});
    t.equal(world.elected, true, 'setup: the sole voter leads');
    const {drive} = await installRecord(world, 'split-source');
    await drive();
    t.equal(await driveUntilRemoved(world, world.members, 5), true,
      'the sole voter completed its removal within five rounds');
    assertRetiredAsUnit(t, world, 'sole voter');
    t.same(world.proposals, [], 'no self-RemoveNode, so no ' +
      'REMOVES_LAST_VOTER refusal can arise');
  });

function forgedRemove(world, evidenceOverrides = {}) {
  const replicaId = world.members[0];
  return {
    [ReplicaOperationField.TYPE]: 'REMOVE_REPLICA',
    [ReplicaOperationField.OPERATION_ID]:
      `${WORKFLOW_ID}:dissolve:${replicaId}`,
    [ReplicaOperationField.OPERATION_TYPE]: 'REMOVE',
    [ReplicaOperationField.PARTITION_ID]: world.partitionId,
    [ReplicaOperationField.REPLICA_ID]: replicaId,
    [ReplicaOperationField.ENTITY_TYPE]: 'partition',
    [ReplicaOperationField.ENTITY_ID]: world.partitionId,
    [ReplicaOperationField.REASON]: 'split_source_dissolution',
    groupRetirement: {
      reason: GROUP_RETIRED,
      kind: 'split-source',
      workflowId: WORKFLOW_ID,
      fenceToken: FENCE,
      tableId: TABLE_ID,
      ...evidenceOverrides,
    },
  };
}

const W3_CASES = Object.freeze([
  {name: 'wrong workflow id', refusal: REFUSAL.WORKFLOW_MISMATCH,
    evidence: {workflowId: 'wf-forged'}},
  {name: 'stale fence token', refusal: REFUSAL.FENCE_MISMATCH,
    evidence: {fenceToken: FENCE - 1}},
  {name: 'workflow not at cutover', refusal: REFUSAL.TRANSITION_STATE_MISMATCH,
    record: {state: PARTITION_TRANSITION_STATE.SPLIT_CATCHUP,
      activeEpoch: ACTIVE_EPOCH}},
  {name: 'cutover epoch never promoted', refusal: REFUSAL.EPOCH_MISMATCH,
    record: {activeEpoch: ACTIVE_EPOCH}},
  {name: 'source still mirroring', refusal: REFUSAL.SOURCE_MIRROR_ACTIVE,
    record: {participantStatus: SPLIT_ACK_STATUS.CATCHUP_READY}},
  {name: 'forged reason without a record', refusal: REFUSAL.RECORD_ABSENT,
    noRecord: true},
  {name: '"row gone" only (transition cleared, no workflow record)',
    refusal: REFUSAL.RECORD_ABSENT, clearedRecord: true},
  {name: 'an abort record for a different target',
    refusal: REFUSAL.GROUP_NOT_NAMED, kind: 'split-aborted-child',
    record: {state: PARTITION_TRANSITION_STATE.FAILED,
      activeEpoch: ACTIVE_EPOCH,
      metadata: {targetPartitionIds: ['other-left', 'other-right']}}},
  {name: 'an abort whose epoch was promoted (children authoritative)',
    refusal: REFUSAL.EPOCH_MISMATCH, kind: 'split-aborted-child',
    record: {activeEpoch: TARGET_EPOCH}},
  {name: 'the record cannot be read', refusal: REFUSAL.RECORD_UNAVAILABLE,
    unavailable: true},
  {name: 'malformed evidence (no fence token)',
    refusal: REFUSAL.EVIDENCE_MALFORMED, evidence: {fenceToken: null}},
]);

for (const testCase of W3_CASES) {
  test(`W3 refused: ${testCase.name}`, async (t) => {
    const world = openGroupWorld(t, {partitionId: 'retire-forged',
      voters: 1});
    const replicaId = world.members[0];
    const source = world.sources.get(replicaId);
    const kind = testCase.kind ?? 'split-source';
    await installRecord(world, kind, testCase.record || {});
    if (testCase.noRecord) world.tablesRows.clear();
    if (testCase.clearedRecord) {
      world.setTablesRow({table_id: TABLE_ID,
        active_partition_version: TARGET_EPOCH,
        partition_transition_state: null,
        partition_transition_metadata: null});
    }
    if (testCase.unavailable) world.authoritativeTablesReadAvailable = false;
    const answer = await source.handler.handleRemoveReplica(
      forgedRemove(world, {kind, ...(testCase.evidence || {})}));
    await driveUntilRemoved(world, [], 3);
    t.equal(answer.status, ReplicaOperationResponseStatus.ERROR,
      'the REMOVE is answered ERROR');
    t.equal(answer.groupRetirementRefusal, testCase.refusal,
      `typed refusal ${testCase.refusal}`);
    t.equal(source.service.admissionFenced, false,
      'nothing was fenced: the replica keeps serving');
    t.equal(world.cluster.node(replicaId).readStatus().outcome,
      RAFT_OPERATION_OUTCOME.CORE_OK, 'its port still answers');
    t.equal(world.lifecycleOf(replicaId), world.lifecycleAtSetup.get(replicaId),
      'its durable lifecycle is unchanged (no retirement)');
    t.equal(world.cache.get('services', replicaId)?.status,
      ReplicaStatus.ACTIVE, 'its services row still reads ACTIVE');
    t.same(world.exitsOf(replicaId), [], 'it never left consensus');
  });
}

test('W7 the consensus-exit backstop is an ERROR alarm', async (t) => {
  mock.timers.enable({apis: ['setTimeout']});
  t.teardown(() => mock.timers.reset());
  // An ordinary REMOVE whose RemoveNode nobody proposes (no reconcile): the
  // exit event never arrives.
  const world = openGroupWorld(t, {partitionId: 'retire-alarm', voters: 2,
    reconcile: false});
  t.equal(world.elected, true, 'setup: the group has a leader');
  const follower = world.members[1];
  const source = world.sources.get(follower);
  const answer = await source.removeRequest('op-ordinary-remove');
  t.equal(answer.status, ReplicaOperationResponseStatus.INITIATED,
    'the ordinary REMOVE is accepted');
  await nextTurns();
  t.same(world.consensusWaits, [follower], 'it waits for its exit event');
  t.same(world.alarms, [], 'no alarm before the bound');
  mock.timers.tick(REPLICA_HANDLER_DEFAULT.REMOVAL_CONSENSUS_EXIT_BACKSTOP_MS);
  await driveUntilRemoved(world, [follower], 10);
  t.same(world.exitsOf(follower), [REPLICA_CONSENSUS_EXIT_REASON.BACKSTOP],
    'the bound elapsed');
  t.equal(world.alarms.length, 1, 'exactly one ERROR alarm was logged');
  t.equal(world.alarms[0]?.replicaId, follower, 'it names the replica');
  t.equal(world.alarms[0]?.partitionId, world.partitionId,
    'it names the group');
  t.equal(world.alarms[0]?.lastObservation?.state, 'voter',
    'it says why no exit came: the replica is still a committed voter');
});
