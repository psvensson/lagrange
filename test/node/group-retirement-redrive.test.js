/**
 * Witnesses of the lead decision of 2026-10-04 on a group-retirement REMOVE
 * that a member never acknowledged: the WORKFLOW OWNER owns completion of
 * its own durable step (group-retirement-redrive.js), triggered by events -
 * the step's own failed outcome, the member's node reporting a ready
 * heartbeat, the finished source re-delivering its acknowledgement on leader
 * activation (owner restart, ownership change) - with a bounded backoff only
 * as a visible fallback; and the replica's own open/restart path is the
 * fail-closed safety net (it retires itself on the verified durable record,
 * never on an absent or unreadable one).
 *
 * W4a a lost REMOVE: the failed acknowledgement re-dispatches to that
 *     member only; the workflow completes only then.
 * W4b an unreachable node: N failed attempts, then its ready-heartbeat row
 *     re-drives it; the fallback backoff never fired.
 * W4c ownership change: the old owner's re-dispatch (old fence) is refused
 *     typed and the old owner stops; the new owner retires the member on the
 *     new fence.
 * W4d owner restart mid-dissolution: the re-delivered (duplicate)
 *     CLEANUP_COMPLETED resumes the dissolution from the durable record (the
 *     frozen set and the recorded answer).
 * W4g a record with no frozen set (written before it existed) freezes the
 *     committed configuration first: unreadable while its retired leader is
 *     not replaced, re-run by the group's partitions-row change; a member
 *     that retired before the freeze and released its row has no address
 *     and no recorded answer, so it stays listed and nothing completes.
 * W4e the member restarts before any re-dispatch: it retires itself on the
 *     verified record; with the record unreadable it does not retire.
 * W4f while a member is unacknowledged the workflow neither deletes the
 *     partition row nor reports completion; a fallback run is a WARN.
 *
 * Same world as group-retirement-as-a-unit.test.js: real rs-raft ports,
 * PRODUCTION ReplicaHandlers, the PRODUCTION row-driven reconcile, the
 * PRODUCTION dissolution and source-acknowledgement methods over a real
 * DurableWorkflowCoordinator, the PRODUCTION re-drive on an injected owner
 * clock (its fallback fires only when the test fires it).
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  PARTITION_TRANSITION_STATE,
} from '../../src/partition/partition-constants.js';
import {
  SPLIT_ACK_STATUS,
  SPLIT_PARTICIPANT_PREFIX,
} from '../../src/partition/split-ack-constants.js';
import {claimWorkflowOwnershipCore} from
  '../../src/partition/managed-workflow-ownership-core.js';
import {RAFT_OPERATION_OUTCOME} from
  '../../src/raft/raft-operation-port-constants.js';
import {
  TABLE_ID,
  createWorkflowOwner,
  driveUntilRemoved,
  nextTurns,
  openGroupWorld,
  readyNodeRow,
} from './group-retirement-as-a-unit-fixture.js';

const GROUP_RETIRED = 'group-retired';
const FENCE_MISMATCH = 'group-retirement-fence-mismatch';
const WORKFLOW_ID = 'wf-redrive-1';
const FENCE = 3;
const SOURCE_KEY = SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION;

function splitRecord(world, {fence = FENCE, participantStatus =
SPLIT_ACK_STATUS.CLEANUP_COMPLETED} = {}) {
  const metadata = {
    workflowId: WORKFLOW_ID,
    workflowFenceToken: fence,
    targetPartitionVersion: 2,
    sourcePartitionId: world.partitionId,
    targetPartitionIds: [`${world.partitionId}-l`, `${world.partitionId}-r`],
    // As persistWorkflowTransition writes a participant.
    participants: {[SOURCE_KEY]: {participantKey: SOURCE_KEY,
      status: participantStatus, fenceToken: fence, acknowledgedAt: 1}},
  };
  world.setTablesRow({
    table_id: TABLE_ID,
    active_partition_version: 2,
    partition_transition_state: PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
    partition_transition_metadata: JSON.stringify(metadata),
  });
  return metadata;
}

// recover: a restarted owner, the workflow recovered from the durable record
// by the PRODUCTION split recovery.
function openSplitOwner(world, {fence = FENCE, participantStatus =
SPLIT_ACK_STATUS.CLEANUP_COMPLETED, recover = false, resume = false} = {}) {
  const metadata = JSON.parse(
    world.tablesRows.get(TABLE_ID).partition_transition_metadata);
  return createWorkflowOwner(world, {family: 'split', recover, workflow: {
    workflowId: WORKFLOW_ID, fenceToken: fence, tableId: TABLE_ID,
    partitionId: world.partitionId,
    status: PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE, metadata,
    participants: [{participantKey: SOURCE_KEY, status: participantStatus}],
  }, resume});
}

async function settleTurns(world, rounds = 10) {
  await driveUntilRemoved(world, [], rounds);
  await nextTurns();
}

function recordState(world) {
  return world.tablesRows.get(TABLE_ID)?.partition_transition_state ?? null;
}

function deliveriesTo(world, replicaId) {
  return world.deliveries.filter((delivery) =>
    delivery.replicaId === replicaId);
}

function assertMemberRetired(t, world, replicaId, label) {
  t.same(world.exitsOf(replicaId), [GROUP_RETIRED],
    `${label}: ${replicaId} left consensus as group-retired`);
  t.equal(world.cluster.node(replicaId).readStatus().outcome,
    RAFT_OPERATION_OUTCOME.CORE_REFUSED, `${label}: its port is closed`);
}

function assertNoBackstopOrConfChange(t, world, label) {
  t.same(world.consensusWaits, [], `${label}: no consensus-exit wait armed`);
  t.same(world.alarms, [], `${label}: no backstop alarm`);
  t.same(world.proposals, [], `${label}: no conf change proposed`);
}

test('W4a a lost REMOVE is re-dispatched to that member only, on the ' +
  'failed acknowledgement; the workflow completes only then', async (t) => {
  const world = openGroupWorld(t, {partitionId: 'redrive-lost', voters: 3});
  t.equal(world.elected, true, 'setup: the group has a leader');
  const [first, lost, last] = world.members;
  splitRecord(world);
  const owner = await openSplitOwner(world);
  world.loseOnce.add(lost);
  await owner.finalizeSplitDissolutionIfReady(WORKFLOW_ID);
  t.equal(await driveUntilRemoved(world, world.members), true,
    'every member completed its removal');
  // A member is done only on COMPLETED: the first pass reaches all three
  // (the lost one's REMOVE dropped), then the failed acknowledgement and the
  // members' row events re-dispatch to the members not yet done.
  t.same(world.deliveries.slice(0, 3).map(({replicaId, lost: dropped}) =>
    [replicaId, dropped === true]),
  [[first, false], [lost, true], [last, false]], 'one pass to all');
  t.ok(deliveriesTo(world, lost).slice(1).some((delivery) => !delivery.lost),
    'the lost REMOVE was re-dispatched and delivered');
  for (const replicaId of world.members) {
    assertMemberRetired(t, world, replicaId, 'W4a');
  }
  assertNoBackstopOrConfChange(t, world, 'W4a');
  t.equal(world.scheduler.fired, 0, 'no fallback backoff fired');
  t.same(world.partitionRowDeletes, [world.partitionId],
    'the partition row is deleted once, after the last acknowledgement');
  t.same(world.terminals, [WORKFLOW_ID], 'the split completed');
  t.same(owner.groupRetirementRedrive.unacknowledged(), [],
    'nothing left unacknowledged');
});

test('W4b an unreachable node is re-driven by its ready-heartbeat event, ' +
  'not by the fallback', async (t) => {
  const world = openGroupWorld(t, {partitionId: 'redrive-node', voters: 3});
  const [, away] = world.members;
  splitRecord(world);
  const owner = await openSplitOwner(world);
  world.dropDeliveryTo.add(away);
  await owner.finalizeSplitDissolutionIfReady(WORKFLOW_ID);
  await settleTurns(world);
  t.ok(deliveriesTo(world, away).length >= 2 &&
    deliveriesTo(world, away).every((delivery) => delivery.lost),
  'failed attempts only (the pass and the failed-ack re-dispatch)');
  t.same(owner.groupRetirementRedrive.unacknowledged().map((entry) =>
    entry.unacknowledgedReplicaIds), [[away]],
  'the unacknowledged member is listed (observable, never silent)');
  t.ok(owner.ownerLog.some((line) => line.level === 'warn' &&
    line.fields?.unacknowledgedReplicaIds?.includes(away)),
  'a structured WARN names the workflow, group and member');
  t.equal(world.scheduler.pending().length, 1,
    'only the bounded fallback is armed');
  // A row that is not a ready heartbeat (the node departed) is a re-check
  // event: one more attempt, still unacknowledged, never proof it is gone.
  const beforeDeparted = deliveriesTo(world, away).length;
  world.emitNodeRow({...readyNodeRow(`${away}-node`),
    ready_lease_expires_at: 0});
  await settleTurns(world);
  t.equal(deliveriesTo(world, away).length, beforeDeparted + 1,
    'a departed-node row re-checks once');
  t.same(world.exitsOf(away), [], 'and retires nothing');
  world.dropDeliveryTo.delete(away);
  world.emitNodeRow(readyNodeRow(`${away}-node`));
  t.equal(await driveUntilRemoved(world, world.members), true,
    'the ready-heartbeat event re-drove the member');
  assertMemberRetired(t, world, away, 'W4b');
  t.equal(world.scheduler.fired, 0, 'the fallback backoff never fired');
  t.equal(world.scheduler.pending().length, 0, 'the fallback is disarmed');
  t.same(world.terminals, [WORKFLOW_ID], 'the split completed');
  assertNoBackstopOrConfChange(t, world, 'W4b');
});

test('W4c an ownership change: the old fence is refused typed, the new ' +
  'owner retires the member on the new fence', async (t) => {
  const world = openGroupWorld(t, {partitionId: 'redrive-owner', voters: 3});
  const [, away] = world.members;
  splitRecord(world);
  const oldOwner = await openSplitOwner(world);
  world.dropDeliveryTo.add(away);
  await oldOwner.finalizeSplitDissolutionIfReady(WORKFLOW_ID);
  await settleTurns(world);
  // A new owner claims the workflow: the record's fence advances and names
  // the new owner with its live lease (the claim rewrites only the claim
  // triple; the frozen members and the answers the old owner recorded stay
  // on the record). The new owner opened below is the world's second.
  const newFence = FENCE + 1;
  const claimed = world.tablesRows.get(TABLE_ID);
  world.setTablesRow({...claimed, partition_transition_metadata:
    JSON.stringify({...JSON.parse(claimed.partition_transition_metadata),
      workflowFenceToken: newFence, workflowOwnerId: 'owner-2',
      workflowLeaseExpiresAt: 60001})});
  world.dropDeliveryTo.delete(away);
  // The old owner's event-driven re-drive still carries the old fence.
  world.emitNodeRow(readyNodeRow(`${away}-node`));
  await settleTurns(world);
  const stale = deliveriesTo(world, away).at(-1);
  t.equal(stale?.fenceToken, FENCE, 'the old owner re-dispatched (old fence)');
  t.equal(world.exitsOf(away).length, 0, 'the old fence retired nothing');
  t.equal(world.cluster.node(away).readStatus().outcome,
    RAFT_OPERATION_OUTCOME.CORE_OK, 'the member keeps serving');
  // Its re-run proves ownership at apply time before any record write or
  // REMOVE (a renewal compare-and-swap): refused, it stops as superseded.
  t.ok(oldOwner.ownerLog.some((line) => line.level === 'warn' &&
    /superseded/u.test(line.message)), 'the old owner stops as superseded');
  t.same(oldOwner.groupRetirementRedrive.unacknowledged(), [],
    'the old owner tracks nothing more');
  const refusal = await world.sources.get(away).handler.handleRemoveReplica({
    type: 'REMOVE_REPLICA', operationId: `${WORKFLOW_ID}:dissolve:${away}`,
    operationType: 'REMOVE', partitionId: world.partitionId,
    replicaId: away, reason: 'split_source_dissolution',
    groupRetirement: {reason: GROUP_RETIRED, kind: 'split-source',
      workflowId: WORKFLOW_ID, fenceToken: FENCE, tableId: TABLE_ID}});
  t.equal(refusal.groupRetirementRefusal, FENCE_MISMATCH,
    'an old-fence REMOVE is refused typed');
  // The new owner resumes from the record (the finished source re-delivers
  // its acknowledgement, the DISSOLUTION_FAILED -> CLEANUP_COMPLETED edge).
  const newOwner = await openSplitOwner(world, {recover: true});
  await newOwner.acknowledgeSourceParticipant(WORKFLOW_ID, {
    participantKey: SOURCE_KEY, status: SPLIT_ACK_STATUS.CLEANUP_COMPLETED,
    fenceToken: newFence});
  t.equal(await driveUntilRemoved(world, world.members), true,
    'the new owner retired the member');
  t.equal(deliveriesTo(world, away).at(-1)?.fenceToken, newFence,
    'on the new fence');
  assertMemberRetired(t, world, away, 'W4c');
  t.same(world.terminals, [WORKFLOW_ID], 'the split completed');
  assertNoBackstopOrConfChange(t, world, 'W4c');
});

test('W4d an owner restart mid-dissolution resumes from the durable record',
  async (t) => {
    const world = openGroupWorld(t, {partitionId: 'redrive-restart',
      voters: 3});
    const [first, second, third] = world.members;
    splitRecord(world);
    // The first owner froze the members, reached exactly one, recorded its
    // answer, then its process ended.
    const firstOwner = await openSplitOwner(world);
    world.dropDeliveryTo.add(second).add(third);
    await firstOwner.finalizeSplitDissolutionIfReady(WORKFLOW_ID);
    await driveUntilRemoved(world, [first]);
    await settleTurns(world);
    t.same(JSON.parse(world.tablesRows.get(TABLE_ID)
      .partition_transition_metadata).participants[SOURCE_KEY].checkpoint
      ?.dissolvedReplicaIds, [first], 'setup: first\'s answer is recorded');
    firstOwner.kill();
    const askedBeforeRestart = deliveriesTo(world, first).length;
    t.same(world.terminals, [], 'setup: the split has not completed');
    // The restarted owner recovers the workflow from the record (PRODUCTION
    // recovery); the finished source re-delivers CLEANUP_COMPLETED on leader
    // activation (the DISSOLUTION_FAILED -> CLEANUP_COMPLETED edge).
    // The dead process's lease (renewed at its pass's start) has lapsed.
    const leased = world.tablesRows.get(TABLE_ID);
    world.setTablesRow({...leased, partition_transition_metadata:
      JSON.stringify({...JSON.parse(leased.partition_transition_metadata),
        workflowLeaseExpiresAt: 0})});
    const restarted = await openSplitOwner(world,
      {recover: true, resume: true});
    // Production owner-start recovery claims the durable record and begins a
    // new-fence retirement pass. Keep the remaining members unreachable until
    // that claim is visible so the old source callback can be challenged.
    for (let turn = 0; turn < 60; turn += 1) {
      await settleTurns(world, 1);
      const current = JSON.parse(world.tablesRows.get(TABLE_ID)
        .partition_transition_metadata);
      if (current.workflowFenceToken > FENCE) break;
    }
    const claimed = JSON.parse(world.tablesRows.get(TABLE_ID)
      .partition_transition_metadata);
    t.equal(claimed.workflowFenceToken, FENCE + 1,
      'production owner-start recovery claimed the next fence');
    const stale = await restarted.acknowledgeSourceParticipant(WORKFLOW_ID, {
      participantKey: SOURCE_KEY, status: SPLIT_ACK_STATUS.CLEANUP_COMPLETED,
      fenceToken: FENCE});
    t.equal(stale.result, 'stale_fence',
      'the captured predecessor callback stays inert after the claim');
    world.dropDeliveryTo.clear();
    world.emitNodeRow(readyNodeRow(`${second}-node`));
    t.equal(await driveUntilRemoved(world, world.members), true,
      'the production ready-event redrive resumed the dissolution');
    for (const replicaId of world.members) {
      assertMemberRetired(t, world, replicaId, 'W4d');
    }
    t.equal(deliveriesTo(world, first).length, askedBeforeRestart,
      'the recorded answer is not asked again');
    t.equal(deliveriesTo(world, second).at(-1)?.fenceToken, FENCE + 1,
      'the resumed retirement dispatch carries the fresh owner fence');
    t.same(world.terminals, [WORKFLOW_ID], 'the split completed');
    assertNoBackstopOrConfChange(t, world, 'W4d');
  });

test('W4g a record with no frozen set whose leader already retired: ' +
  'unreadable until a new leader answers; a member that retired before the ' +
  'freeze and lost its row stays listed (fail-closed)', async (t) => {
  const world = openGroupWorld(t, {partitionId: 'redrive-legacy',
    voters: 3});
  const [first] = world.members;
  splitRecord(world);
  // Written before the frozen set existed: one member (the leader) retired
  // and released its row, nothing was recorded.
  await world.sources.get(first).handler.handleRemoveReplica({
    type: 'REMOVE_REPLICA', operationId: `${WORKFLOW_ID}:dissolve:${first}`,
    operationType: 'REMOVE', partitionId: world.partitionId,
    replicaId: first, reason: 'split_source_dissolution',
    groupRetirement: {reason: GROUP_RETIRED, kind: 'split-source',
      workflowId: WORKFLOW_ID, fenceToken: FENCE, tableId: TABLE_ID}});
  await driveUntilRemoved(world, [first]);
  const restarted = await openSplitOwner(world, {recover: true});
  // The restarted owner claims the record before it drives (only the claim
  // holder retires a group).
  restarted.resolveWorkflowState(WORKFLOW_ID);
  t.equal((await claimWorkflowOwnershipCore(restarted, WORKFLOW_ID))
    .accepted, true, 'setup: the restarted owner claimed the record');
  await restarted.finalizeSplitDissolutionIfReady(WORKFLOW_ID);
  await settleTurns(world);
  t.same(restarted.groupRetirementRedrive.unacknowledged().map((entry) =>
    entry.membershipUnavailable), [true],
  'listed as membership-unavailable while no leader answers');
  t.same(world.terminals, [], 'nothing completed on an unread membership');
  t.same(world.partitionRowDeletes, [], 'the partition row is kept');
  // The survivors elect (drained to, in bounded rounds: a slower host needs
  // more turns); the new leader's partitions-row publication is the event
  // that re-runs it.
  const survivorLeader = () => world.members.slice(1).find((replicaId) => {
    try {
      return world.cluster.coreStatus(replicaId).lead ===
        world.cluster.raftPeerIdOf(replicaId);
    } catch {
      return false;
    }
  }) ?? null;
  for (let round = 0; round < 400 && survivorLeader() === null; round += 1) {
    await settleTurns(world, 1);
  }
  t.ok(survivorLeader(), 'setup: the survivors elected a leader');
  world.emitSystemRow('partitions', 'UPDATE',
    {partition_id: world.partitionId,
      leader_node_id: `${survivorLeader()}-node`});
  await driveUntilRemoved(world, world.members.slice(1));
  for (const replicaId of world.members.slice(1)) {
    assertMemberRetired(t, world, replicaId, 'W4g');
  }
  t.same(restarted.groupRetirementRedrive.unacknowledged().map((entry) =>
    entry.unacknowledgedReplicaIds), [[first]],
  'the member with no address and no recorded answer stays listed');
  t.same(world.terminals, [], 'nothing completes without its answer');
  t.same(world.partitionRowDeletes, [], 'the partition row is kept');
  t.equal(recordState(world), PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
    'the record stays retiring (its only future exit: an operator fact)');
});

test('W4e a member restarting before any re-dispatch retires itself on ' +
  'the verified record; an unreadable record retires nothing',
async (t) => {
  const world = openGroupWorld(t, {partitionId: 'redrive-open', voters: 3});
  const [, away, other] = world.members;
  splitRecord(world);
  const owner = await openSplitOwner(world);
  world.dropDeliveryTo.add(away).add(other);
  await owner.finalizeSplitDissolutionIfReady(WORKFLOW_ID);
  await settleTurns(world);
  const reopen = async (replicaId) => {
    const {handler, service} = world.sources.get(replicaId);
    service.tableId = TABLE_ID;
    handler.localReplicas.delete(replicaId);
    handler.localServices.delete(replicaId);
    handler.registerExistingReplica({replicaId,
      partitionId: world.partitionId, service});
    await settleTurns(world);
  };
  // Unreadable record: never evidence.
  world.authoritativeTablesReadAvailable = false;
  await reopen(other);
  t.same(world.exitsOf(other), [], 'record unreadable: it does not retire');
  t.equal(world.lifecycleOf(other), world.lifecycleAtSetup.get(other),
    'its durable lifecycle is unchanged');
  t.equal(world.cluster.node(other).readStatus().outcome,
    RAFT_OPERATION_OUTCOME.CORE_OK, 'it opened as it always did');
  t.equal(world.sources.get(other).service.admissionFenced, false,
    'nothing fenced it');
  t.equal(world.cache.get('services', other)?.status, 'active',
    'no removal started (its row still reads ACTIVE)');
  // Readable record: the verified path retires it as a unit.
  world.authoritativeTablesReadAvailable = true;
  await reopen(away);
  t.equal(await driveUntilRemoved(world, [away]), true,
    'the restarted member completed its own removal');
  assertMemberRetired(t, world, away, 'W4e');
  t.ok(deliveriesTo(world, away).every((delivery) => delivery.lost),
    'no owner re-dispatch reached it (every delivery was lost)');
  t.same(world.consensusWaits, [], 'no consensus-exit wait armed');
  t.same(world.proposals, [], 'no conf change proposed');
});

test('W4f an unacknowledged member holds the partition row and the ' +
  'completion; a fallback run is a visible WARN', async (t) => {
  const world = openGroupWorld(t, {partitionId: 'redrive-hold', voters: 3});
  const [, away] = world.members;
  splitRecord(world);
  const owner = await openSplitOwner(world);
  world.dropDeliveryTo.add(away);
  await owner.finalizeSplitDissolutionIfReady(WORKFLOW_ID);
  await settleTurns(world);
  world.scheduler.fireAll();
  await settleTurns(world);
  t.equal(world.scheduler.fired, 1, 'the fallback ran once');
  t.ok(owner.ownerLog.some((line) => line.level === 'warn' &&
    /fallback/u.test(line.message) &&
    line.fields?.unacknowledgedReplicaIds?.includes(away) &&
    line.fields?.workflowId === WORKFLOW_ID &&
    line.fields?.partitionId === world.partitionId),
  'the fallback run is a structured WARN naming workflow, group, member');
  t.same(world.partitionRowDeletes, [],
    'the partition row is never deleted while a member is unacknowledged');
  t.same(world.terminals, [], 'the split never reports completion');
  const record = JSON.parse(
    world.tablesRows.get(TABLE_ID).partition_transition_metadata);
  t.not(record.participants[SOURCE_KEY].status,
    SPLIT_ACK_STATUS.SOURCE_DISSOLVED, 'no SOURCE_DISSOLVED is recorded');
  t.same(owner.groupRetirementRedrive.unacknowledged().map((entry) =>
    entry.unacknowledgedReplicaIds), [[away]],
  'the member stays listed as unacknowledged');
});
