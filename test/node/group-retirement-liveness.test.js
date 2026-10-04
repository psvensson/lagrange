/**
 * Witnesses of the verifier's liveness findings on the group-retirement
 * re-drive (2026-10-04): every path that ended with no exit, or only a timer,
 * now ends by an event, or stays listed with a visible alarm.
 *
 * L1  the workflow owner restarts with a lone member left: its durable
 *     resume (owner start / record change, ownership claimed on the record)
 *     re-drives it and the record leaves cutover-active.
 * L1b the previous owner's lease is still live at the restart: one re-scan
 *     at the lease's expiry, visible as a WARN when it drives.
 * L2  an aborted teardown + owner restart is resumed the same way.
 * L3  a departed or deleted node re-checks; a deleted member services row
 *     only re-runs the step (owner ruling 2026-10-04: never proof the member
 *     is gone) - the member stays required and listed, nothing completes;
 *     the exhaustion ERROR is logged once across heartbeats and the entry
 *     stays re-drivable.
 * L4  a re-run that returns early arms the fallback with a WARN; the
 *     merge-source, aborted-child and aborted-target lost REMOVEs recover.
 * L5  a replica opened with its record unreadable WARNs once.
 * H-A evidence naming another table's valid record is refused typed.
 * H-B a null target epoch is a malformed record, never epoch 0.
 * F4  the cleanup tombstone row proposes no RemoveNode.
 * F5  NOT_FOUND is not an acknowledgement.
 *
 * Same world as group-retirement-redrive.test.js (real ports, PRODUCTION
 * handlers, reconcile, dissolution/teardown, coordinator, re-drive and
 * resume, the PRODUCTION committed-membership read the member set is frozen
 * from, and - for a restarted owner - the PRODUCTION recovery of its
 * family; injected owner clock).
 * A merge's sibling source is recorded already dissolved, and an aborted
 * split's sibling child has no group in this world: its membership is
 * unreadable, so it stays listed as membership-unavailable (never "no
 * members").
 */

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
const WORKFLOW_ID = 'wf-live-1';
const FENCE = 3;
const SOURCE_KEY = SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION;

// The record shape of each (family, aborted) pair: what it names, its
// transition state, its active epoch, and its finished source participants.
const SHAPE = Object.freeze({
  'split:false': (p) => ({
    names: {sourcePartitionId: p, targetPartitionIds: [`${p}-l`, `${p}-r`]},
    state: PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE, active: 2,
    participants: [{participantKey: SOURCE_KEY,
      status: SPLIT_ACK_STATUS.CLEANUP_COMPLETED}]}),
  'split:true': (p) => ({
    names: {sourcePartitionId: `${p}-src`,
      targetPartitionIds: [p, `${p}-sib`]},
    state: PARTITION_TRANSITION_STATE.FAILED, active: 1, participants: []}),
  'merge:false': (p) => ({
    names: {sourcePartitionIds: [p, `${p}-sib`],
      targetPartitionIds: [`${p}-m`]},
    state: PARTITION_TRANSITION_STATE.MERGE_CUTOVER_ACTIVE, active: 2,
    participants: [
      {participantKey: buildMergeSourceParticipantKey(p),
        status: MERGE_ACK_STATUS.SOURCE_MIRROR_REMOVED},
      {participantKey: buildMergeSourceParticipantKey(`${p}-sib`),
        status: MERGE_ACK_STATUS.SOURCE_DISSOLVED}]}),
  'merge:true': (p) => ({
    names: {sourcePartitionIds: [`${p}-a`, `${p}-b`],
      targetPartitionIds: [p]},
    state: PARTITION_TRANSITION_STATE.FAILED, active: 1, participants: []}),
});

function install(world, {family = 'split', aborted = false,
  targetVersion = 2} = {}) {
  const shape = SHAPE[`${family}:${aborted}`](world.partitionId);
  const metadata = {workflowId: WORKFLOW_ID, workflowFenceToken: FENCE,
    targetPartitionVersion: targetVersion, ...shape.names,
    participants: Object.fromEntries(shape.participants.map((part) =>
      [part.participantKey, {status: part.status}]))};
  world.setTablesRow({table_id: TABLE_ID,
    active_partition_version: shape.active,
    partition_transition_state: shape.state,
    partition_transition_metadata: JSON.stringify(metadata)});
  return {family, aborted, metadata, state: shape.state,
    participants: shape.participants};
}

function openOwner(world, shape, {resume = false, recover = false,
  owner: ownerFields = {}} = {}) {
  return createWorkflowOwner(world, {family: shape.family, resume, recover,
    workflow: {
      workflowId: WORKFLOW_ID, fenceToken: FENCE, tableId: TABLE_ID,
      partitionId: world.partitionId, status: shape.state,
      metadata: shape.metadata, participants: shape.participants,
      ...ownerFields}});
}

function drive(owner, shape) {
  if (shape.aborted) {
    return shape.family === 'split' ?
      owner.teardownAbortedSplitChildren(WORKFLOW_ID,
        owner.resolveWorkflowState(WORKFLOW_ID)) :
      owner.teardownAbortedMergeTarget(WORKFLOW_ID,
        owner.resolveWorkflowState(WORKFLOW_ID));
  }
  return shape.family === 'split' ?
    owner.finalizeSplitDissolutionIfReady(WORKFLOW_ID) :
    owner.finalizeMergeDissolutionIfReady(WORKFLOW_ID);
}

async function settle(world, rounds = 10) {
  await driveUntilRemoved(world, [], rounds);
  await nextTurns();
}

function recordState(world) {
  return world.tablesRows.get(TABLE_ID)?.partition_transition_state ?? null;
}

function retired(world, replicaId) {
  return world.exitsOf(replicaId).includes(GROUP_RETIRED) &&
    world.cluster.node(replicaId).readStatus().outcome ===
      RAFT_OPERATION_OUTCOME.CORE_REFUSED;
}

function logsOf(owner, level, pattern) {
  return owner.ownerLog.filter((line) => line.level === level &&
    pattern.test(line.message));
}

function assertQuiet(t, world, label) {
  t.same(world.consensusWaits, [], `${label}: no consensus-exit wait`);
  t.same(world.proposals, [], `${label}: no conf change proposed`);
}

for (const [label, aborted] of [['L1 split source', false],
  ['L2 aborted split child', true]]) {
  test(`${label}: the owner restarts with a lone member left; its durable ` +
    'resume re-drives it and the record leaves its retiring state',
  async (t) => {
    const world = openGroupWorld(t, {partitionId: `live-${aborted ? 'l2' :
      'l1'}`, voters: 3});
    const [, , lone] = world.members;
    const shape = install(world, {aborted});
    const first = await openOwner(world, shape);
    world.dropDeliveryTo.add(lone);
    await drive(first, shape);
    await settle(world);
    t.same(world.exitsOf(lone), [], 'setup: the lone member never retired');
    // The owner process ends; its in-memory re-drive ends with it.
    first.kill();
    world.dropDeliveryTo.delete(lone);
    // The restarted owner recovers the workflow from the durable record
    // through its family's PRODUCTION recovery (no stubbed state).
    const restarted = await openOwner(world, shape, {resume: true,
      recover: true});
    t.equal(await driveUntilRemoved(world, world.members), true,
      'every member completed its removal');
    t.ok(retired(world, lone), 'the lone member retired as group-retired');
    if (aborted) {
      t.equal(world.partitionRows.has(world.partitionId), false,
        'the aborted child\'s row is gone: the record retires nothing more');
    } else {
      t.not(recordState(world), shape.state,
        'the record left cutover-active');
    }
    t.ok(logsOf(restarted, 'warn', /resumed from the durable record/u)
      .length >= 1, 'the resume is visible');
    const metadata = JSON.parse(JSON.stringify(world.deliveries.at(-1)));
    t.ok(metadata.fenceToken > FENCE,
      'it drove on the fence its ownership claim took');
    t.equal(world.scheduler.fired, 0, 'no timer ended it');
    assertQuiet(t, world, label);
  });
}

test('L1b the previous owner\'s lease is still live: one re-scan at its ' +
  'expiry drives it', async (t) => {
  const world = openGroupWorld(t, {partitionId: 'live-l1b', voters: 3});
  const [, , lone] = world.members;
  const shape = install(world);
  const first = await openOwner(world, shape);
  world.dropDeliveryTo.add(lone);
  await drive(first, shape);
  await settle(world);
  first.kill();
  world.dropDeliveryTo.delete(lone);
  // The dead incarnation's live lease, on the durable record.
  const record = world.tablesRows.get(TABLE_ID);
  world.tablesRows.set(TABLE_ID, {...record, partition_transition_metadata:
    JSON.stringify({...JSON.parse(record.partition_transition_metadata),
      workflowOwnerId: 'owner-dead-incarnation',
      workflowLeaseExpiresAt: 50000})});
  const restarted = await openOwner(world, shape, {resume: true,
    recover: true});
  await settle(world);
  t.same(world.exitsOf(lone), [], 'a live foreign lease: nothing drives yet');
  t.equal(world.scheduler.pending().length >= 1, true,
    'one re-scan is armed at the lease expiry');
  restarted.now = () => 60000;
  world.scheduler.fireAll();
  t.equal(await driveUntilRemoved(world, world.members), true,
    'after the lease ended the owner drove it');
  t.ok(retired(world, lone), 'the lone member retired');
  t.ok(logsOf(restarted, 'warn', /resumed from the durable record/u)
    .some((line) => line.fields?.trigger === 'lease-expired'),
  'the lease-expiry resume is a WARN naming its trigger');
});

test('L1c a running owner resumes on the record change that makes it ' +
  'retiring', async (t) => {
  const world = openGroupWorld(t, {partitionId: 'live-l1c', voters: 3});
  const shape = install(world);
  // The cutover epoch is not promoted yet: nothing retires at owner start.
  const promoted = world.tablesRows.get(TABLE_ID);
  world.setTablesRow({...promoted, active_partition_version: 1});
  const owner = await openOwner(world, shape, {resume: true});
  await settle(world, 3);
  t.same(world.deliveries, [], 'setup: nothing driven at owner start');
  // The record changes (the cutover's epoch promotion lands in the view).
  world.setTablesRow(promoted);
  t.equal(await driveUntilRemoved(world, world.members), true,
    'the record change resumed the dissolution');
  t.ok(logsOf(owner, 'warn', /resumed from the durable record/u)
    .some((line) => line.fields?.trigger === 'record-changed'),
  'triggered by the record change');
  t.not(recordState(world), shape.state, 'the record left cutover-active');
});

test('L3 a departed node re-checks; the member\'s deleted services row ' +
  'only re-runs the step - it stays required and listed; exhaustion is one ' +
  'ERROR and stays re-drivable',
async (t) => {
  const world = openGroupWorld(t, {partitionId: 'live-l3', voters: 3});
  const [, away, gone] = world.members;
  const shape = install(world);
  const owner = await openOwner(world, shape);
  world.dropDeliveryTo.add(away).add(gone);
  await drive(owner, shape);
  await settle(world);
  // Exhaust the fallback.
  for (let run = 0; run < 12; run += 1) {
    world.scheduler.fireAll();
    await settle(world, 3);
  }
  t.equal(logsOf(owner, 'error', /exhausted/u).length, 1,
    'exhaustion is one ERROR');
  for (let beat = 0; beat < 5; beat += 1) {
    world.emitNodeRow(readyNodeRow(`${away}-node`));
    await settle(world, 3);
  }
  t.equal(logsOf(owner, 'error', /exhausted/u).length, 1,
    'five more heartbeats log no new ERROR');
  const before = world.deliveries.filter((d) => d.replicaId === gone).length;
  world.emitSystemRow('nodes', 'DELETE', {node_id: `${gone}-node`});
  await settle(world, 3);
  t.ok(world.deliveries.filter((d) => d.replicaId === gone).length > before,
    'a node DELETE re-checks the member');
  t.same(world.exitsOf(gone), [], 'it is never proof the member is gone');
  // The member's services row is deleted (any deleter: its node's cleanup,
  // an absence sweep, a lagging view): never proof the member is gone.
  const row = world.cache.get('services', gone);
  world.cache.delete('services', gone);
  world.emitSystemRow('services', 'DELETE', row);
  await settle(world, 3);
  t.same(owner.groupRetirementRedrive.unacknowledged().map((entry) =>
    [...entry.unacknowledgedReplicaIds].sort()), [[away, gone].sort()],
  'the member whose row was deleted stays required and listed');
  // The exhausted entry is still re-drivable by its node's ready event.
  world.dropDeliveryTo.delete(away);
  world.emitNodeRow(readyNodeRow(`${away}-node`));
  t.equal(await driveUntilRemoved(world, [away]), true,
    'the ready event re-drove the exhausted entry');
  t.ok(retired(world, away), 'it retired');
  t.same(world.terminals, [],
    'nothing completes while the frozen member gone never answered');
  t.ok(world.partitionRows.has(world.partitionId),
    'the group\'s partition row is kept');
  t.equal(recordState(world), shape.state, 'the record stays retiring');
  t.same(owner.groupRetirementRedrive.unacknowledged().map((entry) =>
    entry.unacknowledgedReplicaIds), [[gone]], 'gone is listed with its alarm');
  // Its row comes back (a re-registration, a hydrating view): an address.
  world.dropDeliveryTo.delete(gone);
  world.cache.upsert('services', row);
  world.emitSystemRow('services', 'INSERT', row);
  t.equal(await driveUntilRemoved(world, [gone]), true,
    'the row event re-drove it and it answered');
  t.same(world.terminals, [WORKFLOW_ID],
    'the split completed only after every frozen member answered');
});

test('L4 a re-run that returns early arms the fallback with a WARN',
  async (t) => {
    const world = openGroupWorld(t, {partitionId: 'live-l4', voters: 3});
    const [, away] = world.members;
    const shape = install(world);
    const owner = await openOwner(world, shape);
    world.dropDeliveryTo.add(away);
    const resolve = owner.resolveWorkflowState;
    let calls = 0;
    // The re-run finds no workflow state and returns early.
    owner.resolveWorkflowState = (id) => (++calls > 3 ? null : resolve(id));
    await drive(owner, shape);
    await settle(world);
    t.ok(logsOf(owner, 'warn', /returned without completing/u).some(
      (line) => line.fields?.unacknowledgedReplicaIds?.includes(away) &&
        line.fields?.workflowId === WORKFLOW_ID),
    'a WARN names the workflow and the unacknowledged member');
    t.ok(world.scheduler.pending().length >= 1, 'the fallback is armed');
  });

for (const [label, family, aborted] of [
  ['merge source', 'merge', false],
  ['aborted split child', 'split', true],
  ['aborted merge target', 'merge', true],
]) {
  test(`L4 ${label}: a lost REMOVE recovers end to end`, async (t) => {
    const world = openGroupWorld(t, {partitionId: `live-${family}-${aborted}`,
      voters: 3});
    const [, lost] = world.members;
    const shape = install(world, {family, aborted});
    const owner = await openOwner(world, shape);
    world.loseOnce.add(lost);
    await drive(owner, shape);
    t.equal(await driveUntilRemoved(world, world.members), true,
      'every member completed its removal');
    for (const replicaId of world.members) {
      t.ok(retired(world, replicaId), `${replicaId} retired as a unit`);
    }
    t.ok(world.partitionRowDeletes.includes(world.partitionId),
      'the group\'s partition row is deleted after the last member');
    t.same(owner.groupRetirementRedrive.unacknowledged().filter((entry) =>
      entry.partitionId === world.partitionId), [],
    'nothing of this group left unacknowledged');
    if (family === 'split') {
      t.same(owner.groupRetirementRedrive.unacknowledged().map((entry) =>
        [entry.partitionId, entry.membershipUnavailable]),
      [[`${world.partitionId}-sib`, true]],
      'the sibling child with no readable group stays listed, unavailable');
    }
    t.equal(world.scheduler.fired, 0, 'no fallback fired');
    assertQuiet(t, world, label);
  });
}

test('L5 a replica opened with its record unreadable WARNs once',
  async (t) => {
    const world = openGroupWorld(t, {partitionId: 'live-l5', voters: 3});
    const [, member] = world.members;
    install(world);
    world.authoritativeTablesReadAvailable = false;
    const {handler, service} = world.sources.get(member);
    const warnings = [];
    const logger = handler.logger;
    handler.logger = Object.assign(Object.create(logger), {
      warn(message, fields) {
        if (/without reading its group/u.test(message)) warnings.push(fields);
        return logger.warn(message, fields);
      },
    });
    for (let reopen = 0; reopen < 3; reopen += 1) {
      handler.localReplicas.delete(member);
      handler.localServices.delete(member);
      handler.registerExistingReplica({replicaId: member,
        partitionId: world.partitionId, service});
      await settle(world, 3);
    }
    t.equal(warnings.length, 1, 'one WARN across three unreadable opens');
    t.equal(warnings[0]?.replicaId, member, 'it names the replica');
    t.same(world.exitsOf(member), [], 'it stays un-retired');
  });

test('H-A evidence pointing at another table\'s valid record is refused',
  async (t) => {
    const world = openGroupWorld(t, {partitionId: 'live-ha', voters: 1});
    const [member] = world.members;
    const shape = install(world);
    // The same valid record, stored under another table's id.
    world.setTablesRow({...world.tablesRows.get(TABLE_ID),
      table_id: 'other-table'});
    const answer = await world.sources.get(member).handler
      .handleRemoveReplica({type: 'REMOVE_REPLICA',
        operationId: `${WORKFLOW_ID}:dissolve:${member}`,
        operationType: 'REMOVE', partitionId: world.partitionId,
        replicaId: member, reason: 'split_source_dissolution',
        groupRetirement: {reason: GROUP_RETIRED, kind: 'split-source',
          workflowId: WORKFLOW_ID, fenceToken: FENCE,
          tableId: 'other-table'}});
    t.equal(answer.groupRetirementRefusal, 'group-retirement-table-mismatch',
      'refused typed: not this replica\'s table');
    t.same(world.exitsOf(member), [], 'nothing retired');
    t.ok(shape, 'setup');
  });

test('H-B a null target epoch is a malformed record, never epoch 0',
  async (t) => {
    const world = openGroupWorld(t, {partitionId: 'live-hb', voters: 1});
    const [member] = world.members;
    install(world, {aborted: true, targetVersion: null});
    const answer = await world.sources.get(member).handler
      .handleRemoveReplica({type: 'REMOVE_REPLICA',
        operationId: `${WORKFLOW_ID}:dissolve:${member}`,
        operationType: 'REMOVE', partitionId: world.partitionId,
        replicaId: member, reason: 'split_aborted_child_teardown',
        groupRetirement: {reason: GROUP_RETIRED,
          kind: 'split-aborted-child', workflowId: WORKFLOW_ID,
          fenceToken: FENCE, tableId: TABLE_ID}});
    t.equal(answer.groupRetirementRefusal,
      'group-retirement-record-malformed', 'refused typed: malformed');
    t.same(world.exitsOf(member), [], 'nothing retired');
  });

test('F4 the cleanup tombstone row (any reason) proposes no RemoveNode',
  async (t) => {
    const world = openGroupWorld(t, {partitionId: 'live-f4', voters: 3});
    const [, member] = world.members;
    const tombstone = {...world.cache.get('services', member),
      service_type: 'partition_cleanup', status: 'cleanup_owned',
      trigger_reason: 'durable_remove_cleanup_complete'};
    world.cache.upsert('services', tombstone);
    world.cache.delete('services', member);
    await settle(world, 3);
    t.same(world.proposals, [],
      'neither its write nor its delete reaches the row-driven reconcile');
  });

test('F5 NOT_FOUND is not an acknowledgement', async (t) => {
  const world = openGroupWorld(t, {partitionId: 'live-f5', voters: 3});
  const [, early] = world.members;
  const shape = install(world);
  const owner = await openOwner(world, shape);
  // The member's node answers before its replica is registered.
  const deliver = owner.deliverReplicaRemoval;
  let answeredNotFound = false;
  owner.deliverReplicaRemoval = async (request) => {
    if (!answeredNotFound && request.nodeId === `${early}-node`) {
      answeredNotFound = true;
      return {status: 'not_found'};
    }
    return deliver(request);
  };
  await drive(owner, shape);
  t.equal(await driveUntilRemoved(world, world.members), true,
    'every member completed its removal');
  t.equal(answeredNotFound, true, 'setup: one NOT_FOUND answer');
  t.ok(retired(world, early),
    'the member that answered NOT_FOUND was re-driven and retired');
  t.same(world.partitionRowDeletes, [world.partitionId],
    'the partition row was deleted only after its real acknowledgement');
});

// B1 (P3a): a member that never answered; its services row is deleted (any
// deleter). The step never completes on it; when the member itself comes
// back (a restart: the open-time safety net retires it on the still-retiring
// record) its own answer completes the step.
test('B1 a deleted services row never completes the step; the member\'s ' +
  'own answer does', async (t) => {
  const world = openGroupWorld(t, {partitionId: 'live-b1', voters: 3});
  const [first, away, gone] = world.members;
  const shape = install(world);
  const owner = await openOwner(world, shape);
  world.dropDeliveryTo.add(gone);
  await drive(owner, shape);
  await settle(world);
  await driveUntilRemoved(world, [first, away], 30);
  const row = world.cache.get('services', gone);
  world.cache.delete('services', gone);
  world.emitSystemRow('services', 'DELETE', row);
  await settle(world, 5);
  await driveUntilRemoved(world, [first, away], 30);
  t.same(world.terminals, [], 'no completion');
  t.equal(recordState(world), shape.state, 'the record stays retiring');
  t.notOk(world.partitionRowDeletes.includes(world.partitionId),
    'the partition row is kept');
  t.same(world.exitsOf(gone), [], 'gone never retired');
  t.same(owner.groupRetirementRedrive.unacknowledged().map((entry) =>
    entry.unacknowledgedReplicaIds), [[gone]], 'gone stays listed');
  // gone restarts: the safety net reads the still-retiring record.
  const {handler, service} = world.sources.get(gone);
  handler.localReplicas.delete(gone);
  handler.localServices.delete(gone);
  handler.registerExistingReplica({replicaId: gone,
    partitionId: world.partitionId, service});
  t.equal(await driveUntilRemoved(world, [gone]), true,
    'the safety net retired gone');
  t.ok(retired(world, gone), 'as group-retired');
  t.same(world.terminals, [], 'its self-retirement is not the owner\'s ' +
    'answer yet');
  // Its node is ready again: the owner asks it (at its recorded address)
  // and the member answers its own completed removal.
  world.dropDeliveryTo.delete(gone);
  world.emitNodeRow(readyNodeRow(`${gone}-node`));
  await settle(world, 5);
  t.same(world.terminals, [WORKFLOW_ID],
    'completed on gone\'s own answer, after every frozen member answered');
  t.same(world.partitionRowDeletes, [world.partitionId],
    'the partition row was deleted once, then');
});

// B2 (P3b): the owner resumes while its services view is not hydrated.
test('B2 a resume against an empty services view sends nothing and ' +
  'completes nothing; the view\'s hydration re-runs it', async (t) => {
  const world = openGroupWorld(t, {partitionId: 'live-b2', voters: 3,
    reconcile: false});
  const shape = install(world);
  const rows = world.members.map((id) => world.cache.get('services', id));
  for (const id of world.members) world.cache.delete('services', id);
  const owner = await openOwner(world, shape, {resume: true,
    recover: true});
  await settle(world, 5);
  t.equal(world.deliveries.length, 0, 'no REMOVE without an address');
  t.same(world.terminals, [], 'no completion');
  t.same(world.partitionRowDeletes, [], 'the partition row is kept');
  t.equal(recordState(world), shape.state, 'the record stays retiring');
  t.same(owner.groupRetirementRedrive.unacknowledged().map((entry) =>
    [...entry.unacknowledgedReplicaIds].sort()), [[...world.members].sort()],
  'every frozen member is listed, none dropped as "no members"');
  const frozen = JSON.parse(world.tablesRows.get(TABLE_ID)
    .partition_transition_metadata).participants[SOURCE_KEY]
    .checkpoint?.requiredReplicaIds;
  t.same(frozen, [...world.members].sort(),
    'the committed configuration is frozen on the durable record');
  for (const row of rows) {
    world.cache.upsert('services', row);
    world.emitSystemRow('services', 'INSERT', row);
  }
  t.equal(await driveUntilRemoved(world, world.members), true,
    'the hydrated rows re-ran it and every member retired');
  t.same(world.terminals, [WORKFLOW_ID], 'it completed only then');
});

test('B2b an unreadable committed configuration is membership-unavailable, ' +
  'never "no members"; the group\'s row change re-runs it', async (t) => {
  const world = openGroupWorld(t, {partitionId: 'live-b2b', voters: 3});
  const shape = install(world);
  world.membershipReadAvailable = false;
  const owner = await openOwner(world, shape, {resume: true,
    recover: true});
  await settle(world, 5);
  t.equal(world.deliveries.length, 0, 'nothing sent');
  t.same(world.terminals, [], 'no completion');
  t.same(world.partitionRowDeletes, [], 'the partition row is kept');
  t.same(owner.groupRetirementRedrive.unacknowledged().map((entry) =>
    entry.membershipUnavailable), [true], 'listed: membership unavailable');
  world.membershipReadAvailable = true;
  world.emitSystemRow('partitions', 'UPDATE',
    {partition_id: world.partitionId});
  t.equal(await driveUntilRemoved(world, world.members), true,
    'the row change re-ran it and every member retired');
  t.same(world.terminals, [WORKFLOW_ID], 'it completed only then');
});

test('B2c a partial services view: the member with no row stays required',
  async (t) => {
    const world = openGroupWorld(t, {partitionId: 'live-b2c', voters: 3});
    const [, , missing] = world.members;
    const shape = install(world);
    const row = world.cache.get('services', missing);
    world.cache.delete('services', missing);
    const owner = await openOwner(world, shape);
    await drive(owner, shape);
    await driveUntilRemoved(world, world.members.slice(0, 2));
    await settle(world, 5);
    t.same(world.terminals, [], 'no completion on the two listed rows');
    t.same(owner.groupRetirementRedrive.unacknowledged().map((entry) =>
      entry.unacknowledgedReplicaIds), [[missing]],
    'the member missing from the view is listed');
    world.cache.upsert('services', row);
    world.emitSystemRow('services', 'INSERT', row);
    t.equal(await driveUntilRemoved(world, [missing]), true,
      'its row re-ran it');
    t.same(world.terminals, [WORKFLOW_ID], 'completed after it answered');
  });

test('B4 an answer whose durable record failed is not progress: the member ' +
  'stays listed and is asked again', async (t) => {
  const world = openGroupWorld(t, {partitionId: 'live-b4', voters: 3});
  const shape = install(world);
  const owner = await openOwner(world, shape);
  const coordinator = owner.workflowCoordinator;
  const persist = coordinator.persistParticipant;
  let unrecorded = null;
  // The write recording the LAST member's answer fails, once (the last of
  // the pass, so no later write of the pass carries the set forward).
  coordinator.persistParticipant = async (participant) => {
    const answered = participant.checkpoint?.dissolvedReplicaIds ?? [];
    if (unrecorded === null && answered.length === world.members.length) {
      unrecorded = answered.at(-1);
      throw new Error('tables write failed');
    }
    return persist(participant);
  };
  const dissolved = () => JSON.parse(world.tablesRows.get(TABLE_ID)
    .partition_transition_metadata).participants[SOURCE_KEY]
    .checkpoint?.dissolvedReplicaIds ?? [];
  await owner.groupRetirementRedrive.exclusive('hold', async () => {
    await owner.dissolveSplitSourcePartition(WORKFLOW_ID);
  });
  t.ok(unrecorded, 'setup: one answer\'s record write failed');
  t.notOk(dissolved().includes(unrecorded), 'it is not on the record');
  t.notOk(owner.resolveWorkflowState(WORKFLOW_ID).participants
    .get(SOURCE_KEY).checkpoint.dissolvedReplicaIds.includes(unrecorded),
  'nor in memory');
  t.same(world.terminals, [], 'no completion');
  t.equal(await driveUntilRemoved(world, world.members), true,
    'every member retired');
  await settle(world, 5);
  t.same(world.terminals, [WORKFLOW_ID],
    'completed once every answer was recorded');
  t.ok(world.deliveries.filter((d) => d.replicaId === unrecorded).length >= 2,
    'the member whose answer was not recorded was asked again');
});

test('B5 an owner whose fence is older than the participant record\'s ' +
  'records nothing and sends nothing', async (t) => {
  const world = openGroupWorld(t, {partitionId: 'live-b5', voters: 3});
  const shape = install(world);
  const owner = await openOwner(world, shape);
  owner.resolveWorkflowState(WORKFLOW_ID).participants.get(SOURCE_KEY)
    .fenceToken = FENCE + 2;
  const before = world.tablesRows.get(TABLE_ID).partition_transition_metadata;
  await drive(owner, shape);
  await settle(world, 3);
  t.equal(world.deliveries.length, 0, 'no REMOVE sent');
  t.equal(JSON.parse(world.tablesRows.get(TABLE_ID)
    .partition_transition_metadata).participants[SOURCE_KEY]
    .checkpoint?.requiredReplicaIds, undefined, 'no member set recorded');
  t.ok(before.length > 0, 'setup');
  t.ok(logsOf(owner, 'warn', /superseded/u).length >= 1,
    'it stops as superseded');
  t.same(owner.groupRetirementRedrive.unacknowledged(), [],
    'it tracks nothing');
});
